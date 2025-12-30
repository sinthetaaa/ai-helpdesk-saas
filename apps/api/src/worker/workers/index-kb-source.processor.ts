import { Injectable } from "@nestjs/common";
import type { Job as BullJob } from "bullmq";
import { promises as fs } from "fs";
import { extname } from "path";

import { PrismaService } from "../../prisma/prisma.service";
import { KbService } from "../../kb/kb.service";

type Payload = {
  tenantId: string;
  sourceId: string;

  // your retry/enqueue might send either key — support both
  requestedByUserId?: string;
  userId?: string;

  mode?: "full" | "incremental";
};

@Injectable()
export class IndexKbSourceProcessor {
  constructor(
    private prisma: PrismaService,
    private kb: KbService,
  ) {}

  async process(payload: Payload, bullJob: BullJob) {
    const bullJobId = bullJob.id;
    if (!bullJobId) {
      // This should never happen if you set { jobId: prismaJobId } when enqueueing,
      // but better to fail loudly than write to id="undefined".
      throw new Error("Bull job id is missing");
    }

    const jobId = String(bullJobId);
    const { tenantId, sourceId } = payload;

    // mark job running
    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: "RUNNING", lastError: null },
    });

    // ensure source belongs to tenant (prevents cross-tenant updates)
    const source = await this.prisma.knowledgeSource.findFirst({
      where: { id: sourceId, tenantId },
      select: { id: true, filename: true, mimeType: true, storagePath: true },
    });
    if (!source) {
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: "FAILED", lastError: "KnowledgeSource not found (or tenant mismatch)" },
      });
      throw new Error("KnowledgeSource not found (or tenant mismatch)");
    }

    // mark source indexing
    await this.prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: "INDEXING", error: null },
    });

    try {
      const text = await extractTextFromSource(source);

      if (!text || text.trim().length < 5) {
        throw new Error("No text found in source file.");
      }

      await bullJob.updateProgress(10);

      const chunks = chunkText(text, { maxChars: 1200, overlap: 200 });
      await bullJob.updateProgress(25);

      await this.kb.replaceSourceChunks({
        tenantId,
        sourceId,
        chunks: chunks.map((content, ordinal) => ({
          content,
          ordinal,
          metadata: { sourceId },
        })),
        onProgress: async (p01) => {
          const pct = 25 + Math.floor(p01 * 70); // 25..95
          await bullJob.updateProgress(pct);
        },
      });

      await bullJob.updateProgress(100);

      await this.prisma.$transaction([
        this.prisma.job.update({
          where: { id: jobId },
          data: { status: "SUCCEEDED", lastError: null },
        }),
        this.prisma.knowledgeSource.update({
          where: { id: sourceId },
          data: { status: "READY", indexedAt: new Date(), error: null },
        }),
      ]);

      // Usage metering (never break success flow if this fails)
      const meteringUserId = payload.requestedByUserId ?? payload.userId ?? null;
      try {
        await this.prisma.usageEvent.create({
          data: {
            tenantId,
            userId: meteringUserId,
            type: "KB_EMBEDDING",
            amount: chunks.length,
            meta: {
              sourceId,
              jobId,
              mode: payload.mode ?? "full",
            },
          },
        });
      } catch {
        // ignore metering write failures
      }

      return { chunkCount: chunks.length };
    } catch (err: any) {
      const msg = String(err?.message ?? err);

      await this.prisma.$transaction([
        this.prisma.job.update({
          where: { id: jobId },
          data: { status: "FAILED", lastError: msg },
        }),
        this.prisma.knowledgeSource.update({
          where: { id: sourceId },
          data: { status: "FAILED", error: msg },
        }),
      ]);

      throw err;
    }
  }
}

function chunkText(text: string, opts: { maxChars: number; overlap: number }) {
  const { maxChars, overlap } = opts;

  const cleaned = text.replace(/\r/g, "");
  const paras = cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  let buf = "";

  const flush = () => {
    if (buf.trim()) out.push(buf.trim());
    buf = "";
  };

  for (const p of paras) {
    if ((buf ? buf.length + 2 : 0) + p.length <= maxChars) {
      buf = buf ? `${buf}\n\n${p}` : p;
      continue;
    }

    if (!buf) {
      // paragraph itself is too big -> slice
      let i = 0;
      while (i < p.length) {
        out.push(p.slice(i, i + maxChars));
        i += Math.max(1, maxChars - overlap);
      }
      continue;
    }

    flush();
    buf = p;
  }
  flush();

  if (overlap > 0 && out.length > 1) {
    const withOverlap: string[] = [];
    for (let i = 0; i < out.length; i++) {
      const prevTail = i === 0 ? "" : out[i - 1].slice(-overlap);
      withOverlap.push(prevTail ? `${prevTail}\n${out[i]}` : out[i]);
    }
    return withOverlap;
  }

  return out;
}

async function extractTextFromSource(source: {
  filename: string;
  mimeType: string;
  storagePath: string | null;
}) {
  if (!source.storagePath) throw new Error("Missing storagePath for knowledge source");

  const buffer = await fs.readFile(source.storagePath);
  const ext = extname(source.filename || "").toLowerCase();
  const isPdf = source.mimeType === "application/pdf" || ext === ".pdf";

  if (isPdf) return extractPdfText(buffer);
  return buffer.toString("utf8");
}

async function extractPdfText(buffer: Buffer) {
  try {
    const mod = await import("pdf-parse");
    const pdfParse = (mod as any).default ?? mod;
    const result = await pdfParse(buffer);
    return String(result?.text ?? "");
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    throw new Error(`PDF parsing not available. Install 'pdf-parse'. ${msg}`);
  }
}
