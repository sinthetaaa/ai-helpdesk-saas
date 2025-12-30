import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { extname } from "path";
import { memoryStorage } from "multer";

import { AuthGuard } from "../common/guards/auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { Tenant } from "../common/decorators/tenant.decorator";
import { User } from "../common/decorators/user.decorator";

import { KbService } from "./kb.service";
import { KbIndexingService } from "./kb.indexing.service";
import { EntitlementsService } from "../entitlements/entitlements.service";

const CreateTextSourceDto = z.object({
  filename: z.string().min(1).max(200),
  content: z.string().min(1).max(200_000),
  mimeType: z.string().min(1).max(200).optional(),
});

const QueryDto = z.object({
  query: z.string().min(1).max(10_000),
  topK: z.number().int().min(1).max(20).optional(),
});

const ListSourcesQuery = z.object({
  status: z.enum(["QUEUED", "INDEXING", "READY", "FAILED"]).optional(),
  q: z.string().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const SummaryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

@Controller("kb")
@UseGuards(AuthGuard, TenantGuard)
export class KbController {
  constructor(
    private kb: KbService,
    private indexing: KbIndexingService,
    private entitlements: EntitlementsService,
  ) {}

  @Post("sources")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadSource(
    @Tenant() tenant: { tenantId: string },
    @User() user: { userId: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    await this.entitlements.assertCanAddKbSourceOrThrow(tenant.tenantId);

    if (!file) throw new BadRequestException("Missing file");

    const allowedMime = new Set(["text/plain", "text/markdown", "application/pdf"]);
    const allowedExt = new Set([".txt", ".md", ".markdown", ".pdf"]);
    const ext = extname(file.originalname || "").toLowerCase();

    if (!allowedMime.has(file.mimetype) && !allowedExt.has(ext)) {
      throw new BadRequestException("Unsupported file type");
    }

    if (!file.size || file.size <= 0) {
      throw new BadRequestException("Empty file");
    }

    return this.indexing.createSourceFromUpload({
      tenantId: tenant.tenantId,
      userId: user.userId,
      file,
    });
  }

  @Post("sources/:id/repair")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async repairSource(
    @Tenant() tenant: { tenantId: string },
    @User() user: { userId: string },
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Missing file");

    const allowedMime = new Set(["text/plain", "text/markdown", "application/pdf"]);
    const allowedExt = new Set([".txt", ".md", ".markdown", ".pdf"]);
    const ext = extname(file.originalname || "").toLowerCase();

    if (!allowedMime.has(file.mimetype) && !allowedExt.has(ext)) {
      throw new BadRequestException("Unsupported file type");
    }

    if (!file.size || file.size <= 0) {
      throw new BadRequestException("Empty file");
    }

    const repaired = await this.indexing.repairSourceFromUpload({
      tenantId: tenant.tenantId,
      userId: user.userId,
      sourceId: id,
      file,
    });

    if (!repaired) throw new BadRequestException("KnowledgeSource not found");
    return repaired;
  }

  @Post("sources/text")
  async createText(
    @Tenant() tenant: { tenantId: string },
    @User() user: { userId: string },
    @Body() body: unknown,
  ) {
    await this.entitlements.assertCanAddKbSourceOrThrow(tenant.tenantId);

    const parsed = CreateTextSourceDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    return this.indexing.createSourceFromText({
      tenantId: tenant.tenantId,
      userId: user.userId,
      filename: parsed.data.filename,
      content: parsed.data.content,
      mimeType: parsed.data.mimeType ?? "text/plain",
    });
  }

  @Get("sources")
  async listSources(@Tenant() tenant: { tenantId: string }, @Query() query: unknown) {
    const parsed = ListSourcesQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const status = parsed.data.status;
    const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;

    return this.kb.listSources(tenant.tenantId, {
      status,
      q: parsed.data.q,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      cursor: cursor ?? undefined,
      limit: parsed.data.limit,
    });
  }

  @Post("sources/:id/retry")
  async retrySource(
    @Tenant() tenant: { tenantId: string },
    @User() user: { userId: string },
    @Param("id") id: string,
  ) {
    const job = await this.indexing.retrySourceIndex({
      tenantId: tenant.tenantId,
      sourceId: id,
      userId: user.userId,
    });

    if (!job) throw new BadRequestException("KnowledgeSource not found");
    return { jobId: job.id };
  }

  @Get("sources/status-counts")
  async statusCounts(@Tenant() tenant: { tenantId: string }) {
    return this.kb.getStatusCounts(tenant.tenantId);
  }

  @Get("sources/summary")
  async summary(@Tenant() tenant: { tenantId: string }, @Query() query: unknown) {
    const parsed = SummaryQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.kb.getSourcesSummary(tenant.tenantId, parsed.data.limit ?? 5);
  }

  @Get("sources/:id")
  async getSource(
    @Tenant() tenant: { tenantId: string; role: string },
    @Param("id") id: string,
  ) {
    const source = await this.kb.getSourceById(tenant.tenantId, id);
    if (!source) throw new BadRequestException("KnowledgeSource not found");

    const canSeeStorage = tenant.role === "OWNER" || tenant.role === "ADMIN";
    if (!canSeeStorage) {
      return { ...source, storagePath: null };
    }
    return source;
  }

  // delete source
  @Delete("sources/:id")
  async deleteSource(
    @Tenant() tenant: { tenantId: string; role?: string },
    @Param("id") id: string,
  ) {
    const role = String(tenant.role ?? "");
    const canDelete = role === "OWNER" || role === "ADMIN";
    if (!canDelete) throw new ForbiddenException("Not allowed");

    const r = await this.kb.deleteSource(tenant.tenantId, id);
    if (!r) throw new BadRequestException("KnowledgeSource not found");
    return r;
  }

  @Post("query")
  async query(@Tenant() tenant: { tenantId: string }, @Body() body: unknown) {
    const parsed = QueryDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    return this.kb.query(tenant.tenantId, parsed.data.query, parsed.data.topK ?? 5);
  }
}

function decodeCursor(cursor: string) {
  try {
    const raw = Buffer.from(cursor, "base64").toString("utf8");
    const [iso, id] = raw.split("|");
    if (!iso || !id) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return { createdAt: date, id };
  } catch {
    return null;
  }
}
