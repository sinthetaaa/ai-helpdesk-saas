import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { createHash } from "crypto";

import { AuthGuard } from "../common/guards/auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { User } from "../common/decorators/user.decorator";

import { TicketsService } from "./tickets.service";
import { KbService } from "../kb/kb.service";
import { LlmService } from "../ai/llm.service";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";

const MAX_COMMENT_LEN = 4800;
const SIM_THRESHOLD = 0.6;

// ---- LLM prompt size guards ----
const MAX_COMMENTS_FOR_LLM = 3;
const MAX_COMMENT_CHARS_FOR_LLM = 800;
const MAX_SOURCE_CHARS_FOR_LLM = 1200;

function truncate(s: string, max: number) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "\n...[truncated]" : s;
}

const DEDUPE_WINDOW_MS = 60 * 1000; // 60s
const AI_JSON_START = "[AIAssistResponseJSON]";
const AI_JSON_END = "[/AIAssistResponseJSON]";

const DRYRUN_CACHE = new Map<string, { expiresAt: number; response: any }>();
const DRYRUN_CACHE_MAX_ITEMS = 500;

function clamp(s: string, max = MAX_COMMENT_LEN) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 20) + "\n\n...[truncated]" : s;
}

function asText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeQuestion(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\blog\s+in\b/g, "login")
    .replace(/\bsign\s+in\b/g, "signin")
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "");
}

function qMerge(initial: string[] | undefined) {
  const m = new Map<string, string>();
  for (const q of initial ?? []) {
    const norm = normalizeQuestion(q);
    if (!norm) continue;
    if (!m.has(norm)) m.set(norm, String(q).trim());
  }
  return {
    add(q: string) {
      const norm = normalizeQuestion(q);
      if (!norm) return;
      if (!m.has(norm)) m.set(norm, q.trim());
    },
    values() {
      return Array.from(m.values());
    },
  };
}

const CreateTicketDto = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(1).max(5000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
});

const UpdateTicketDto = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: z.string().nullable().optional(),
});

const AddCommentDto = z.object({
  body: z.string().min(1).max(5000),
});

const SuggestDto = z.object({
  topK: z.number().int().min(1).max(20).optional(),
});

const AssistDto = z.object({
  topK: z.number().int().min(1).max(20).optional(),
  query: z.string().min(1).max(10_000).optional(),
  tone: z.enum(["friendly", "neutral", "formal"]).optional(),
  dryRun: z.boolean().optional(),
});

function buildAiCommentBody(args: {
  customer_reply: string;
  internal_notes: string;
  next_steps: string[];
  questions_for_customer: string[];
  citations: { source: string; filename: string; chunkId: string }[];
  cacheJson: any;
}) {
  const lines: string[] = [];
  lines.push("[AI Assist]");
  lines.push("");
  lines.push("Customer reply (suggested):");
  lines.push(args.customer_reply || "(none)");
  lines.push("");

  lines.push(`Internal notes: ${args.internal_notes || "(none)"}`);
  lines.push("");

  lines.push("Next steps:");
  if (args.next_steps?.length) for (const s of args.next_steps) lines.push(`- ${s}`);
  else lines.push("- (none)");
  lines.push("");

  lines.push("Questions for customer:");
  if (args.questions_for_customer?.length) {
    for (const q of args.questions_for_customer) lines.push(`- ${q}`);
  } else {
    lines.push("- (none)");
  }
  lines.push("");

  lines.push("Citations:");
  if (args.citations?.length) {
    for (const c of args.citations) {
      lines.push(`- ${c.source} ${c.filename} (chunkId: ${c.chunkId})`);
    }
  } else {
    lines.push("- (none)");
  }
  lines.push("");

  const json = JSON.stringify(args.cacheJson);
  lines.push(AI_JSON_START);
  lines.push(json);
  lines.push(AI_JSON_END);

  return lines.join("\n");
}

function extractCachedJsonFromComment(body: string): any | null {
  if (!body) return null;
  const start = body.indexOf(AI_JSON_START);
  const end = body.indexOf(AI_JSON_END);
  if (start < 0 || end < 0 || end <= start) return null;

  const jsonStr = body.slice(start + AI_JSON_START.length, end).trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function parseDateMs(d: any): number | null {
  if (!d) return null;
  const ms = new Date(d).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function cleanupDryRunCache() {
  const now = Date.now();
  for (const [k, v] of DRYRUN_CACHE.entries()) {
    if (v.expiresAt <= now) DRYRUN_CACHE.delete(k);
  }
  if (DRYRUN_CACHE.size > DRYRUN_CACHE_MAX_ITEMS) {
    const entries = Array.from(DRYRUN_CACHE.entries()).sort(
      (a, b) => a[1].expiresAt - b[1].expiresAt,
    );
    const toRemove = entries.slice(0, DRYRUN_CACHE.size - DRYRUN_CACHE_MAX_ITEMS);
    for (const [k] of toRemove) DRYRUN_CACHE.delete(k);
  }
}

function getTicketStateSignature(ticket: any) {
  const comments = Array.isArray(ticket?.comments) ? ticket.comments : [];
  let newest = 0;
  for (const c of comments) {
    const ms = parseDateMs(c?.createdAt) ?? 0;
    if (ms > newest) newest = ms;
  }
  return { commentCount: comments.length, newestCommentMs: newest };
}

function normalizeQuestionsArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const raw = String(v ?? "").trim();
    if (!raw) continue;
    const key = normalizeQuestion(raw);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

@Controller("tickets")
@UseGuards(AuthGuard, TenantGuard)
export class TicketsController {
  constructor(
    private tickets: TicketsService,
    private kb: KbService,
    private llm: LlmService,
    private config: ConfigService,
    private prisma: PrismaService,
    private entitlements: EntitlementsService,
  ) {}

  private async safeLogAssistUsage(args: {
    tenantId: string;
    userId: string;
    ticketId: string;
    topK: number;
    tone: string;
    dryRun: boolean;
    kbHits: number;
    cached: boolean;
    cacheType?: "comment" | "dryrun";
    parseFailed?: boolean;
  }) {
    try {
      await this.prisma.usageEvent.create({
        data: {
          tenantId: args.tenantId,
          userId: args.userId,
          type: "AI_ASSIST_CALL",
          amount: 1,
          meta: {
            ticketId: args.ticketId,
            topK: args.topK,
            tone: args.tone,
            dryRun: args.dryRun,
            kbHits: args.kbHits,
            cached: args.cached,
            cacheType: args.cacheType ?? null,
            parseFailed: !!args.parseFailed,
          },
        },
      });
    } catch {
      // ignore
    }
  }

  @Post()
  async create(
    @Tenant() tenant: { tenantId: string; role: Role },
    @User() user: { userId: string },
    @Body() body: unknown,
  ) {
    const parsed = CreateTicketDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    return this.tickets.createTicket({
      tenantId: tenant.tenantId,
      requesterId: user.userId,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
    });
  }

  @Get()
  async list(
    @Tenant() tenant: { tenantId: string; role: Role },
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("assigneeId") assigneeId?: string,
    @Query("limit") limit?: string,
  ) {
    const n = limit ? Number(limit) : 50;
    if (Number.isNaN(n)) throw new BadRequestException("limit must be a number");

    return this.tickets.listTickets({
      tenantId: tenant.tenantId,
      status: status as any,
      priority: priority as any,
      assigneeId,
      limit: n,
    });
  }

  @Get("my")
  async myQueue(
    @Tenant() tenant: { tenantId: string; role: Role },
    @User() user: { userId: string },
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    const n = limit ? Number(limit) : 50;
    if (Number.isNaN(n)) throw new BadRequestException("limit must be a number");

    return this.tickets.listTickets({
      tenantId: tenant.tenantId,
      assigneeId: user.userId,
      status: status as any,
      limit: n,
    });
  }

  @Get(":id")
  async get(@Tenant() tenant: { tenantId: string }, @Param("id") id: string) {
    return this.tickets.getTicket(tenant.tenantId, id);
  }

  @UseGuards(RolesGuard)
  @Roles("OWNER", "ADMIN", "AGENT")
  @Patch(":id")
  async update(
    @Tenant() tenant: { tenantId: string; role: Role },
    @User() user: { userId: string },
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateTicketDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const isAdmin = tenant.role === "OWNER" || tenant.role === "ADMIN";
    const isAgent = tenant.role === "AGENT";

    if (isAgent) {
      if (parsed.data.assigneeId !== undefined || parsed.data.priority !== undefined) {
        throw new ForbiddenException("AGENT cannot assign or change priority");
      }
    }

    if (!isAdmin) {
      if (parsed.data.assigneeId !== undefined || parsed.data.priority !== undefined) {
        throw new ForbiddenException("Only ADMIN/OWNER can assign or change priority");
      }
    }

    return this.tickets.updateTicket({
      tenantId: tenant.tenantId,
      actorId: user.userId,
      ticketId: id,
      status: parsed.data.status as any,
      priority: parsed.data.priority as any,
      assigneeId: parsed.data.assigneeId,
    });
  }

  @UseGuards(RolesGuard)
  @Roles("OWNER", "ADMIN", "AGENT")
  @Post(":id/comments")
  async comment(
    @Tenant() tenant: { tenantId: string; role: Role },
    @User() user: { userId: string },
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const parsed = AddCommentDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    return this.tickets.addComment({
      tenantId: tenant.tenantId,
      ticketId: id,
      authorId: user.userId,
      body: parsed.data.body,
    });
  }

  @UseGuards(RolesGuard)
  @Roles("OWNER", "ADMIN", "AGENT")
  @Post(":id/suggest")
  async suggest(
    @Tenant() tenant: { tenantId: string; role: Role },
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const parsed = SuggestDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const ticket = await this.tickets.getTicket(tenant.tenantId, id);
    const queryText = `${ticket.title}\n\n${ticket.description}`;

    const suggestions = await this.kb.query(tenant.tenantId, queryText, parsed.data.topK ?? 5);
    return { ticketId: id, suggestions };
  }

  @UseGuards(RolesGuard)
  @Roles("OWNER", "ADMIN", "AGENT")
  @Post(":id/assist")
  async assist(
    @Tenant() tenant: { tenantId: string; role: Role },
    @User() user: { userId: string },
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const parsed = AssistDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const topK = parsed.data.topK ?? 5;
    const dryRun = !!parsed.data.dryRun;
    const tone = parsed.data.tone ?? "neutral";

    const ticket = await this.tickets.getTicket(tenant.tenantId, id);

    // enforce quota (do it before expensive LLM call; still after ticket fetch)
    await this.entitlements.assertCanUseAiOrThrow(tenant.tenantId);

    const SYSTEM_AUTHOR_ID = this.config.get<string>("AI_SYSTEM_USER_ID");

    // ---- PLAN B: recent AI comment dedupe ----
    if (SYSTEM_AUTHOR_ID && Array.isArray(ticket.comments) && ticket.comments.length) {
      const now = Date.now();

      const sorted = [...ticket.comments].sort(
        (a: any, b: any) => (parseDateMs(b.createdAt) ?? 0) - (parseDateMs(a.createdAt) ?? 0),
      );

      for (const c of sorted) {
        if (c.authorId !== SYSTEM_AUTHOR_ID) continue;

        const createdMs = parseDateMs(c.createdAt);
        if (!createdMs) continue;

        if (now - createdMs > DEDUPE_WINDOW_MS) break;

        const cached = extractCachedJsonFromComment(c.body);
        if (cached && typeof cached === "object") {
          await this.safeLogAssistUsage({
            tenantId: tenant.tenantId,
            userId: user.userId,
            ticketId: id,
            topK: cached.kbTopK ?? topK,
            tone,
            dryRun,
            kbHits: Number(cached.kbHits ?? 0),
            cached: true,
            cacheType: "comment",
            parseFailed: false,
          });

          return {
            ticketId: id,
            kbTopK: cached.kbTopK ?? topK,
            kbHits: cached.kbHits ?? 0,
            commentSaved: false,
            commentSkipped: true,
            commentError: undefined,
            customer_reply: asText(cached.customer_reply),
            internal_notes: asText(cached.internal_notes),
            next_steps: Array.isArray(cached.next_steps)
              ? cached.next_steps.map(asText).filter(Boolean)
              : [],
            questions_for_customer: normalizeQuestionsArray(cached.questions_for_customer),
            citations: Array.isArray(cached.citations) ? cached.citations : [],
          };
        }
      }
    }

    // ---- PLAN A: dryRun in-memory cache ----
    if (dryRun) {
      cleanupDryRunCache();

      const { commentCount, newestCommentMs } = getTicketStateSignature(ticket);
      const queryKey = parsed.data.query ?? "";

      const keyMaterial =
        `${tenant.tenantId}|${id}|topK=${topK}|tone=${tone}|cc=${commentCount}|ncm=${newestCommentMs}|q=` +
        queryKey;

      const cacheKey = sha256Hex(keyMaterial);
      const cached = DRYRUN_CACHE.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        await this.safeLogAssistUsage({
          tenantId: tenant.tenantId,
          userId: user.userId,
          ticketId: id,
          topK: cached.response.kbTopK ?? topK,
          tone,
          dryRun,
          kbHits: Number(cached.response.kbHits ?? 0),
          cached: true,
          cacheType: "dryrun",
          parseFailed: false,
        });

        return {
          ticketId: id,
          kbTopK: cached.response.kbTopK ?? topK,
          kbHits: cached.response.kbHits ?? 0,
          commentSaved: false,
          commentSkipped: true,
          commentError: undefined,
          customer_reply: asText(cached.response.customer_reply),
          internal_notes: asText(cached.response.internal_notes),
          next_steps: Array.isArray(cached.response.next_steps)
            ? cached.response.next_steps.map(asText).filter(Boolean)
            : [],
          questions_for_customer: normalizeQuestionsArray(cached.response.questions_for_customer),
          citations: Array.isArray(cached.response.citations) ? cached.response.citations : [],
        };
      }
    }

    // ---- normal generation path ----
    const commentsForLlm =
      ticket.comments?.length
        ? ticket.comments
            .slice(-MAX_COMMENTS_FOR_LLM)
            .map((c: any) => {
              const when = c.createdAt ?? "";
              const bodyText = truncate(String(c.body ?? ""), MAX_COMMENT_CHARS_FOR_LLM);
              return `- (${when}) ${bodyText}`;
            })
            .join("\n")
        : "";

    const queryText =
      parsed.data.query ??
      [
        `TITLE: ${ticket.title}`,
        `DESCRIPTION: ${ticket.description}`,
        commentsForLlm ? `COMMENTS:\n${commentsForLlm}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

    const kbHits = await this.kb.query(tenant.tenantId, queryText, topK);

    const lower = queryText.toLowerCase();

    const isLoginTicket =
      lower.includes("login") ||
      lower.includes("log in") ||
      lower.includes("signin") ||
      lower.includes("sign in") ||
      lower.includes("password") ||
      lower.includes("reset") ||
      lower.includes("otp") ||
      lower.includes("token");

    const isBillingTicket =
      lower.includes("charged") ||
      lower.includes("charge") ||
      lower.includes("billing") ||
      lower.includes("refund") ||
      lower.includes("invoice") ||
      lower.includes("payment");

    const hitText = (h: any) =>
      `${h.filename ?? ""}\n${h.content ?? ""}\n${h.snippet ?? ""}`.toLowerCase();

    const loginRelevant = (t: string) =>
      t.includes("login") ||
      t.includes("log in") ||
      t.includes("password") ||
      t.includes("reset") ||
      t.includes("token") ||
      t.includes("device time") ||
      t.includes("timestamp") ||
      t.includes("browser");

    const billingRelevant = (t: string) =>
      t.includes("billing") ||
      t.includes("refund") ||
      t.includes("invoice") ||
      t.includes("payment") ||
      t.includes("charged") ||
      t.includes("charge");

    let filteredHits = kbHits;

    if (isLoginTicket && !isBillingTicket) {
      filteredHits = kbHits.filter((h: any) => {
        const t = hitText(h);
        return loginRelevant(t) && !billingRelevant(t);
      });
    } else if (isBillingTicket && !isLoginTicket) {
      filteredHits = kbHits.filter((h: any) => billingRelevant(hitText(h)));
    }

    const strongHits = filteredHits.filter((h: any) => (h.similarity ?? 0) >= SIM_THRESHOLD);
    const chosenHits =
      strongHits.length > 0 ? strongHits : filteredHits.length > 0 ? filteredHits : kbHits;

    const seen = new Set<string>();
    const finalHits = chosenHits
      .filter((h: any) => {
        if (!h.chunkId) return false;
        if (seen.has(h.chunkId)) return false;
        seen.add(h.chunkId);
        return true;
      })
      .slice(0, topK);

    const sourcesBlock = finalHits
      .map(
        (h: any, i: number) =>
          `SOURCE S${i + 1}\n` +
          `filename: ${h.filename ?? "unknown"}\n` +
          `chunkId: ${h.chunkId}\n` +
          `similarity: ${h.similarity}\n` +
          `content:\n${truncate(String(h.content ?? ""), MAX_SOURCE_CHARS_FOR_LLM)}\n`,
      )
      .join("\n---\n");

    const system =
      "You are a support agent assistant. Use ONLY the provided KB sources.\n" +
      "Return STRICT JSON only (no markdown, no prose outside JSON).\n" +
      "HARD RULE: The customer_reply MUST focus only on the current ticket issue.\n" +
      "Do NOT mention refunds/billing unless the ticket is explicitly about billing/charges.\n\n" +
      "JSON must match this schema exactly:\n" +
      "{\n" +
      '  "customer_reply": string,\n' +
      '  "internal_notes": string,\n' +
      '  "next_steps": string[],\n' +
      '  "questions_for_customer": string[],\n' +
      '  "citations": { "source": string, "filename": string, "chunkId": string }[]\n' +
      "}\n";

    const userPrompt =
      `Ticket:\n${queryText}\n\n` +
      `KB Sources:\n${sourcesBlock || "(none)"}\n\n` +
      `Task:\n` +
      `Generate a helpful response in JSON with keys:\n` +
      `customer_reply, internal_notes, next_steps, questions_for_customer, citations.\n` +
      `- customer_reply: customer-facing reply (${tone} tone)\n` +
      `- internal_notes: short internal summary\n` +
      `- next_steps: array of strings\n` +
      `- questions_for_customer: array of strings\n` +
      `- citations: array of objects {source:"S1", filename, chunkId}\n` +
      `Cite only sources you actually used.\n`;

    const raw = await this.llm.chat([
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ]);

    let obj: any;
    let parseFailed = false;

    try {
      obj = JSON.parse(raw);
    } catch {
      parseFailed = true;
    }

    await this.safeLogAssistUsage({
      tenantId: tenant.tenantId,
      userId: user.userId,
      ticketId: id,
      topK,
      tone,
      dryRun,
      kbHits: finalHits.length,
      cached: false,
      parseFailed,
    });

    if (parseFailed) {
      return {
        ticketId: id,
        kbTopK: topK,
        kbHits: finalHits.length,
        commentSaved: false,
        commentSkipped: false,
        modelOutput: raw,
        debug: {
          simThreshold: SIM_THRESHOLD,
          originalKbHits: kbHits.length,
          filteredKbHits: filteredHits.length,
          finalKbHits: finalHits.length,
          isLoginTicket,
          isBillingTicket,
        },
      };
    }

    const finalObj = {
      customer_reply: asText(obj.customer_reply),
      internal_notes: asText(obj.internal_notes),
      next_steps: Array.isArray(obj.next_steps) ? obj.next_steps.map(asText).filter(Boolean) : [],
      questions_for_customer: Array.isArray(obj.questions_for_customer)
        ? obj.questions_for_customer.map(asText).filter(Boolean)
        : [],
      citations: Array.isArray(obj.citations) ? obj.citations : [],
    };

    const sourcesTextLower = finalHits.map(hitText).join("\n");
    const q = qMerge(finalObj.questions_for_customer);

    if (sourcesTextLower.includes("device time")) {
      q.add("Is your device date/time/timezone set correctly right now?");
    }
    if (sourcesTextLower.includes("browser") && sourcesTextLower.includes("timestamp")) {
      q.add("What browser were you using when trying to login?");
      q.add("What timestamp (with timezone) did you attempt to login?");
    }
    finalObj.questions_for_customer = q.values();

    let commentSaved = false;
    let commentSkipped = false;
    let commentError: string | undefined;

    if (!dryRun) {
      if (!SYSTEM_AUTHOR_ID) {
        commentError = "AI_SYSTEM_USER_ID is not set in .env (and loaded by Nest).";
      } else {
        const cacheJson = {
          kbTopK: topK,
          kbHits: finalHits.length,
          ...finalObj,
        };

        const commentBody = clamp(
          buildAiCommentBody({
            customer_reply: finalObj.customer_reply,
            internal_notes: finalObj.internal_notes,
            next_steps: finalObj.next_steps,
            questions_for_customer: finalObj.questions_for_customer,
            citations: finalObj.citations,
            cacheJson,
          }),
        );

        try {
          await this.tickets.addComment({
            tenantId: tenant.tenantId,
            ticketId: id,
            authorId: SYSTEM_AUTHOR_ID,
            body: commentBody,
          });
          commentSaved = true;
        } catch (e: any) {
          commentError = e?.message ?? String(e);
        }
      }
    } else {
      cleanupDryRunCache();

      const { commentCount, newestCommentMs } = getTicketStateSignature(ticket);
      const queryKey = parsed.data.query ?? "";

      const keyMaterial =
        `${tenant.tenantId}|${id}|topK=${topK}|tone=${tone}|cc=${commentCount}|ncm=${newestCommentMs}|q=` +
        queryKey;

      const cacheKey = sha256Hex(keyMaterial);

      DRYRUN_CACHE.set(cacheKey, {
        expiresAt: Date.now() + DEDUPE_WINDOW_MS,
        response: {
          kbTopK: topK,
          kbHits: finalHits.length,
          ...finalObj,
        },
      });
    }

    return {
      ticketId: id,
      kbTopK: topK,
      kbHits: finalHits.length,
      commentSaved,
      commentSkipped,
      commentError,
      ...finalObj,
    };
  }
}
