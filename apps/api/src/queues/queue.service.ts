import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import type IORedis from "ioredis";

import { makeRedisConnection } from "./redis.connection";
import { QUEUE_KB_INDEXING, KB_JOBS, IndexKbSourcePayload } from "./queues";

@Injectable()
export class QueueService implements OnModuleDestroy {
  private kbIndexQueue: Queue;
  private connection: IORedis;

  constructor(private config: ConfigService) {
    const redisUrl = this.config.get<string>("REDIS_URL") ?? "redis://127.0.0.1:6379";
    const prefix = this.config.get<string>("QUEUE_PREFIX") ?? "helpdesk";

    // Keep a reference so we can close it on shutdown
    this.connection = makeRedisConnection(redisUrl);

    this.kbIndexQueue = new Queue(QUEUE_KB_INDEXING, {
      connection: this.connection,
      prefix,
      defaultJobOptions: {
        attempts: Number(this.config.get<string>("QUEUE_ATTEMPTS") ?? 3),
        backoff: { type: "exponential", delay: Number(this.config.get<string>("QUEUE_BACKOFF_MS") ?? 2_000) },
        removeOnComplete: Number(this.config.get<string>("QUEUE_REMOVE_ON_COMPLETE") ?? 200),
        removeOnFail: Number(this.config.get<string>("QUEUE_REMOVE_ON_FAIL") ?? 500),
      },
    });
  }

  enqueueIndexKbSource(jobId: string, payload: IndexKbSourcePayload) {
    return this.kbIndexQueue.add(KB_JOBS.INDEX_KB_SOURCE, payload, { jobId });
  }

  async onModuleDestroy() {
    // Close queue first
    await this.kbIndexQueue.close().catch(() => undefined);

    // Then close underlying redis connection (important)
    await this.connection.quit().catch(() => undefined);
  }
}
