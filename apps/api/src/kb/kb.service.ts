import { Injectable } from "@nestjs/common";
import { Prisma, type KnowledgeSource, KnowledgeSourceStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EmbeddingService } from "../ai/embedding.service";
import { KbStorageService } from "./kb.storage.service";

@Injectable()
export class KbService {
  constructor(
    private prisma: PrismaService,
    private embedder: EmbeddingService,
    private storage: KbStorageService,
  ) {}

  private chunkText(text: string, chunkSize = 1200, overlap = 150): string[] {
    const cleaned = text.replace(/\r\n/g, "\n").trim();
    if (!cleaned) return [];

    const chunks: string[] = [];
    let i = 0;

    while (i < cleaned.length) {
      const end = Math.min(i + chunkSize, cleaned.length);
      const slice = cleaned.slice(i, end).trim();
      if (slice) chunks.push(slice);
      if (end >= cleaned.length) break;
      i = Math.max(0, end - overlap);
    }

    return chunks;
  }

  private toSqlVector(v: number[]) {
    return `[${v.join(",")}]`;
  }

  async replaceSourceChunks(args: {
    tenantId: string;
    sourceId: string;
    chunks: Array<{ content: string; ordinal: number; metadata?: Record<string, unknown> }>;
    onProgress?: (progress01: number) => Promise<void> | void;
  }) {
    const { tenantId, sourceId, chunks, onProgress } = args;

    await this.prisma.knowledgeChunk.deleteMany({ where: { tenantId, sourceId } });

    let embedded = 0;
    for (let i = 0; i < chunks.length; i++) {
      const { content, ordinal, metadata } = chunks[i];

      const row = await this.prisma.knowledgeChunk.create({
        data: {
          tenantId,
          sourceId,
          idx: ordinal,
          content,
          ...(metadata !== undefined ? { meta: metadata as Prisma.InputJsonValue } : {}),
        },
        select: { id: true },
      });

      const embedding = await this.embedder.embed(content);
      if (embedding.length) {
        const vec = this.toSqlVector(embedding);
        await this.prisma.$executeRaw(
          Prisma.sql`
            UPDATE "KnowledgeChunk"
            SET "embedding" = CAST(${vec} AS vector)
            WHERE "id" = ${row.id}
          `,
        );
        embedded++;
      }

      if (onProgress) {
        await onProgress((i + 1) / Math.max(1, chunks.length));
      }
    }

    return { inserted: chunks.length, embedded };
  }

  async createSourceFromText(
    tenantId: string,
    filename: string,
    content: string,
    mimeType = "text/plain",
  ) {
    const chunks = this.chunkText(content);

    const source: KnowledgeSource = await this.prisma.knowledgeSource.create({
      data: {
        tenantId,
        filename,
        mimeType,
        sizeBytes: Buffer.byteLength(content, "utf8"),
        status: "QUEUED",
        error: null,
        storagePath: null,
      },
    });

    try {
      const storagePath = await this.storage.saveUpload({
        tenantId,
        sourceId: source.id,
        originalName: filename,
        buffer: Buffer.from(content, "utf8"),
      });

      await this.prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { storagePath, status: "INDEXING", error: null },
      });

      const { inserted, embedded } = await this.replaceSourceChunks({
        tenantId,
        sourceId: source.id,
        chunks: chunks.map((c, ordinal) => ({
          content: c,
          ordinal,
          metadata: { sourceId: source.id, origin: "text" },
        })),
      });

      await this.prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { status: "READY", indexedAt: new Date(), error: null },
      });

      return {
        sourceId: source.id,
        chunks: chunks.length,
        inserted,
        embedded,
      };
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      await this.prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { status: "FAILED", error: msg },
      });
      throw err;
    }
  }

  async query(tenantId: string, queryText: string, topK = 5) {
    const q = await this.embedder.embed(queryText);
    if (!q.length) return [];

    const vec = this.toSqlVector(q);

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        sourceId: string;
        idx: number;
        content: string;
        similarity: number;
        filename: string;
        mimeType: string;
      }>
    >(Prisma.sql`
      SELECT
        c."id",
        c."sourceId",
        c."idx",
        c."content",
        (1 - (c."embedding" <=> ${vec}::vector)) AS similarity,
        s."filename" AS filename,
        s."mimeType" AS "mimeType"
      FROM "KnowledgeChunk" c
      JOIN "KnowledgeSource" s ON s."id" = c."sourceId"
      WHERE c."tenantId" = ${tenantId}
        AND c."embedding" IS NOT NULL
      ORDER BY c."embedding" <=> ${vec}::vector
      LIMIT ${topK}
    `);

    return rows.map((r) => ({
      chunkId: r.id,
      sourceId: r.sourceId,
      filename: r.filename,
      mimeType: r.mimeType,
      idx: r.idx,
      similarity: r.similarity,
      snippet: r.content.slice(0, 240),
      content: r.content,
    }));
  }

  async listSources(
    tenantId: string,
    opts?: {
      status?: KnowledgeSourceStatus;
      q?: string;
      page?: number;
      pageSize?: number;
      cursor?: { createdAt: Date; id: string };
      limit?: number;
    },
  ) {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? 20;
    const limit = opts?.limit ?? pageSize;

    const where: Prisma.KnowledgeSourceWhereInput = {
      tenantId,
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.q ? { filename: { contains: opts.q, mode: "insensitive" } } : {}),
    };

    if (opts?.cursor) {
      where.OR = [
        { createdAt: { lt: opts.cursor.createdAt } },
        { createdAt: opts.cursor.createdAt, id: { lt: opts.cursor.id } },
      ];
    }

    if (opts?.cursor) {
      const items = await this.prisma.knowledgeSource.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: {
          id: true,
          filename: true,
          mimeType: true,
          sizeBytes: true,
          status: true,
          indexedAt: true,
          error: true,
          createdAt: true,
        },
      });

      const nextCursor =
        items.length === limit
          ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
          : null;

      return { items, nextCursor, limit };
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.knowledgeSource.count({ where }),
      this.prisma.knowledgeSource.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          filename: true,
          mimeType: true,
          sizeBytes: true,
          status: true,
          indexedAt: true,
          error: true,
          createdAt: true,
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  async getStatusCounts(tenantId: string) {
    const rows = await this.prisma.knowledgeSource.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};
    for (const status of Object.values(KnowledgeSourceStatus)) {
      counts[status] = 0;
    }
    for (const row of rows) counts[row.status] = row._count._all;
    return counts;
  }

  async getSourcesSummary(tenantId: string, limit = 5) {
    const counts = await this.getStatusCounts(tenantId);
    const list = await this.listSources(tenantId, { page: 1, pageSize: limit });

    return { counts, ...list };
  }

  async getSourceById(tenantId: string, id: string) {
    const source = await this.prisma.knowledgeSource.findFirst({
      where: { tenantId, id },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        indexedAt: true,
        error: true,
        createdAt: true,
        storagePath: true,
      },
    });
    if (!source) return null;

    const latestJob = await this.prisma.job.findFirst({
      where: { tenantId, sourceId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { ...source, latestJob };
  }

  // delete a KB source + chunks + jobs + disk files
  async deleteSource(tenantId: string, id: string) {
    const source = await this.prisma.knowledgeSource.findFirst({
      where: { tenantId, id },
      select: { id: true },
    });
    if (!source) return null;

    await this.prisma.$transaction([
      this.prisma.knowledgeChunk.deleteMany({ where: { tenantId, sourceId: id } }),
      this.prisma.job.deleteMany({ where: { tenantId, sourceId: id } }),
      this.prisma.knowledgeSource.delete({ where: { id } }),
    ]);

    // best-effort FS cleanup (don’t fail the request if disk delete fails)
    try {
      await this.storage.removeSourceDir(tenantId, id);
    } catch {}

    return { deleted: true, sourceId: id };
  }
}

function encodeCursor(createdAt: Date, id: string) {
  const raw = `${createdAt.toISOString()}|${id}`;
  return Buffer.from(raw, "utf8").toString("base64");
}
