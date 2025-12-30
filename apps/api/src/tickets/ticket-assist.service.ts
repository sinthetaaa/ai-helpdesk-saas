import { Injectable } from "@nestjs/common";
import { TicketsService } from "./tickets.service";
import { KbService } from "../kb/kb.service";
import { LlmService } from "../ai/llm.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { PrismaService } from "../prisma/prisma.service";

type Suggestion = {
  chunkId: string;
  sourceId: string;
  filename?: string;
  mimeType?: string;
  idx: number;
  similarity: number;
  content: string;
};

@Injectable()
export class TicketAssistService {
  constructor(
    private tickets: TicketsService,
    private kb: KbService,
    private llm: LlmService,
    private entitlements: EntitlementsService,
    private prisma: PrismaService,
  ) {}

  async suggest(tenantId: string, ticketId: string, query?: string, topK = 5) {
    const ticket = await this.tickets.getTicket(tenantId, ticketId);
    const queryText = query ?? `${ticket.title}\n\n${ticket.description}`;
    const suggestions = await this.kb.query(tenantId, queryText, topK);
    return { ticket, suggestions };
  }

  /**
   * Generates an agent-ready draft reply using KB chunks as citations.
   * Also enforces monthly AI quota + logs usage.
   */
  async draftReply(args: {
    tenantId: string;
    ticketId: string;
    userId: string;
    query?: string;
    topK?: number;
  }) {
    const { tenantId, ticketId, userId } = args;
    const topK = args.topK ?? 5;

    // enforce quota
    await this.entitlements.assertCanUseAiOrThrow(tenantId);

    const { ticket, suggestions } = await this.suggest(tenantId, ticketId, args.query, topK);

    const contextBlock = (suggestions as Suggestion[])
      .map((s, i) => {
        const label = `${i + 1}`;
        const src = s.filename ? `${s.filename}` : s.sourceId;
        return `[#${label}] source=${src} idx=${s.idx} similarity=${s.similarity.toFixed(
          3,
        )}\n${s.content}`;
      })
      .join("\n\n---\n\n");

    const system = `
You are a support agent assistant for a SaaS helpdesk.
Goal: produce a helpful, concise customer-facing reply draft.

Rules:
- Use ONLY the provided KB context for factual claims/policies.
- If KB context is insufficient, say what you need to ask next (do not invent policy).
- Output STRICT JSON with keys:
  replyDraft (string),
  nextQuestions (string[]),
  usedCitations (array of objects: { label: string, filename?: string, reason: string })
`.trim();

    const user = `
TICKET:
Title: ${ticket.title}
Description: ${ticket.description}

KB CONTEXT:
${contextBlock || "(no KB matches)"}

Write the response now.
`.trim();

    const raw = await this.llm.chat([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    let parseFailed = false;
    let result: {
      replyDraft: string;
      nextQuestions: string[];
      usedCitations: Array<{ label: string; filename?: string; reason: string }>;
    } = { replyDraft: "", nextQuestions: [], usedCitations: [] };

    try {
      const parsed = JSON.parse(raw) as any;
      result = {
        replyDraft: typeof parsed.replyDraft === "string" ? parsed.replyDraft : "",
        nextQuestions: Array.isArray(parsed.nextQuestions)
          ? parsed.nextQuestions.map((x: any) => String(x ?? "")).filter(Boolean)
          : [],
        usedCitations: Array.isArray(parsed.usedCitations) ? parsed.usedCitations : [],
      };
    } catch {
      parseFailed = true;
      result.replyDraft = raw;
    }

    // usage meter (best-effort, never blocks user)
    try {
      await this.prisma.usageEvent.create({
        data: {
          tenantId,
          userId,
          type: "AI_ASSIST_CALL",
          amount: 1,
          meta: {
            ticketId,
            topK,
            endpoint: "ticket-assist.draftReply",
            kbHits: Array.isArray(suggestions) ? suggestions.length : 0,
            parseFailed,
          },
        },
      });
    } catch {
      // ignore
    }

    return {
      ticketId,
      ...result,
      suggestions,
      warning: parseFailed ? "Model did not return valid JSON" : undefined,
    };
  }
}
