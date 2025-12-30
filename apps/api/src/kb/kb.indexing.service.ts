import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queues/queue.service";
import { KbStorageService } from "./kb.storage.service";

@Injectable()
export class KbIndexingService {
  constructor(
    private prisma: PrismaService,
    private queues: QueueService,
    private storage: KbStorageService,
  ) {}

  async createSourceFromUpload(args: {
    tenantId: string;
    userId: string;
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
  }) {
    const { tenantId, userId, file } = args;

    const source = await this.prisma.knowledgeSource.create({
      data: {
        tenantId,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: null,
        status: "QUEUED",
        indexedAt: null,
        error: null,
      },
      select: { id: true },
    });

    try {
      const storagePath = await this.storage.saveUpload({
        tenantId,
        sourceId: source.id,
        originalName: file.originalname,
        buffer: file.buffer,
      });

      await this.prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { storagePath },
      });
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      await this.prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { status: "FAILED", error: msg },
      });
      throw err;
    }

    const job = await this.enqueueSourceIndex({
      tenantId,
      sourceId: source.id,
      userId,
    });

    return { sourceId: source.id, jobId: job.id };
  }

  async createSourceFromText(args: {
    tenantId: string;
    userId: string;
    filename: string;
    content: string;
    mimeType?: string;
  }) {
    const { tenantId, userId, filename, content, mimeType } = args;

    const source = await this.prisma.knowledgeSource.create({
      data: {
        tenantId,
        filename,
        mimeType: mimeType ?? "text/plain",
        sizeBytes: Buffer.byteLength(content ?? "", "utf8"),
        storagePath: null,
        status: "QUEUED",
        indexedAt: null,
        error: null,
      },
      select: { id: true },
    });

    try {
      const storagePath = await this.storage.saveText({
        tenantId,
        sourceId: source.id,
        filename,
        content,
      });

      await this.prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { storagePath },
      });
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      await this.prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { status: "FAILED", error: msg },
      });
      throw err;
    }

    const job = await this.enqueueSourceIndex({
      tenantId,
      sourceId: source.id,
      userId,
    });

    return { sourceId: source.id, jobId: job.id };
  }

  async repairSourceFromUpload(args: {
    tenantId: string;
    userId: string;
    sourceId: string;
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
  }) {
    const { tenantId, userId, sourceId, file } = args;

    const existing = await this.prisma.knowledgeSource.findFirst({
      where: { id: sourceId, tenantId },
      select: { id: true },
    });
    if (!existing) return null;

    try {
      const storagePath = await this.storage.saveUpload({
        tenantId,
        sourceId,
        originalName: file.originalname,
        buffer: file.buffer,
      });

      await this.prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          filename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storagePath,
          status: "QUEUED",
          indexedAt: null,
          error: null,
        },
      });
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      await this.prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: { status: "FAILED", error: msg },
      });
      throw err;
    }

    const job = await this.enqueueSourceIndex({ tenantId, sourceId, userId });
    return { sourceId, jobId: job.id };
  }

  async enqueueSourceIndex(args: { tenantId: string; sourceId: string; userId: string }) {
    const { tenantId, sourceId, userId } = args;

    // must exist + must have a stored file
    const src = await this.prisma.knowledgeSource.findFirst({
      where: { id: sourceId, tenantId },
      select: { id: true, storagePath: true },
    });
    if (!src) throw new BadRequestException("KnowledgeSource not found");
    if (!src.storagePath) throw new BadRequestException("KnowledgeSource missing storage file (repair required)");

    // create job + mark source as queued (clear old errors/timestamps)
    const job = await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          status: "QUEUED",
          error: null,
          indexedAt: null,
        },
      });

      return tx.job.create({
        data: {
          tenantId,
          type: "INDEX_KB_SOURCE",
          status: "QUEUED",
          sourceId,
          payload: { sourceId, requestedByUserId: userId },
        },
        select: { id: true },
      });
    });

    try {
      await this.queues.enqueueIndexKbSource(job.id, {
        tenantId,
        sourceId,
        requestedByUserId: userId,
        mode: "full",
      });

      // show that work is underway as soon as it’s on the queue
      await this.prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: { status: "INDEXING", error: null },
      });
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      await this.prisma.$transaction([
        this.prisma.job.update({
          where: { id: job.id },
          data: { status: "FAILED", lastError: msg },
        }),
        this.prisma.knowledgeSource.update({
          where: { id: sourceId },
          data: { status: "FAILED", error: msg },
        }),
      ]);
      throw err;
    }

    return job;
  }

  async retrySourceIndex(args: { tenantId: string; sourceId: string; userId: string }) {
    const { tenantId, sourceId, userId } = args;

    const source = await this.prisma.knowledgeSource.findFirst({
      where: { id: sourceId, tenantId },
      select: { id: true },
    });
    if (!source) return null;

    const job = await this.enqueueSourceIndex({ tenantId, sourceId, userId });
    return job;
  }
}
