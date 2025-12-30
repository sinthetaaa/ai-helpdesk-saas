import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker, Job as BullJob } from "bullmq";

import { makeRedisConnection } from "../queues/redis.connection";
import { QUEUE_KB_INDEXING, KB_JOBS, IndexKbSourcePayload } from "../queues/queues";
import { IndexKbSourceProcessor } from "./workers/index-kb-source.processor";

@Injectable()
export class WorkerRunner implements OnModuleDestroy {
  private worker?: Worker;

  constructor(
    private config: ConfigService,
    private indexer: IndexKbSourceProcessor,
  ) {}

  async start() {
    if (this.worker) return; // idempotent start

    const redisUrl = this.config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    const prefix = this.config.get<string>("QUEUE_PREFIX") ?? "helpdesk";

    const rawConc = this.config.get<string>("WORKER_CONCURRENCY") ?? "4";
    const parsed = Number(rawConc);
    const concurrency = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 32) : 4;

    const connection = makeRedisConnection(redisUrl);

    this.worker = new Worker(
      QUEUE_KB_INDEXING,
      async (job: BullJob) => {
        if (job.name === KB_JOBS.INDEX_KB_SOURCE) {
          return this.indexer.process(job.data as IndexKbSourcePayload, job);
        }
        throw new Error(`Unknown job: ${job.name}`);
      },
      { connection, prefix, concurrency },
    );

    this.worker.on("completed", (job) =>
      // eslint-disable-next-line no-console
      console.log(`[worker] completed ${job.name} id=${job.id}`),
    );

    this.worker.on("failed", (job, err) =>
      // eslint-disable-next-line no-console
      console.error(`[worker] failed ${job?.name} id=${job?.id}`, err),
    );

    this.worker.on("error", (err) =>
      // eslint-disable-next-line no-console
      console.error("[worker] worker error:", err),
    );

    // eslint-disable-next-line no-console
    console.log(`[worker] started queue=${QUEUE_KB_INDEXING} concurrency=${concurrency}`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.worker = undefined;
  }
}
