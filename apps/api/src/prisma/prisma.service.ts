import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor(private config: ConfigService) {
    const connectionString = config.get<string>("DATABASE_URL");
    if (!connectionString) {
      throw new Error("DATABASE_URL is missing. Set it in apps/api/.env");
    }

    const pool = new Pool({
      connectionString,
      // optional tuning (safe defaults)
      max: Number(config.get<string>("PG_POOL_MAX") ?? 10),
      idleTimeoutMillis: Number(config.get<string>("PG_POOL_IDLE_MS") ?? 30_000),
      connectionTimeoutMillis: Number(config.get<string>("PG_POOL_CONN_TIMEOUT_MS") ?? 10_000),
    });

    const adapter = new PrismaPg(pool);

    super({
      adapter,
      // Optional: uncomment if you want prisma logs
      // log: ["error", "warn"],
    });

    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    // Disconnect Prisma client
    await this.$disconnect().catch(() => undefined);

    // Also close the underlying pg pool (important for clean shutdown)
    await this.pool.end().catch(() => undefined);
  }
}
