import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

type EmbedUsageMeta = {
  tenantId?: string;
  userId?: string;
  sourceId?: string;
  jobId?: string;
  mode?: "full" | "delta" | "repair" | string;
};

@Injectable()
export class EmbeddingService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  private getTimeoutMs(): number {
    const raw = this.config.get<string>("OLLAMA_TIMEOUT_MS");
    const n = raw ? Number(raw) : 60_000;
    return Number.isFinite(n) && n > 0 ? n : 60_000;
  }

  private getRetries(): number {
    const raw = this.config.get<string>("OLLAMA_EMBED_RETRIES");
    const n = raw ? Number(raw) : 3;
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3;
  }

  private async callOllama(host: string, model: string, prompt: string) {
    const controller = new AbortController();
    const timeoutMs = this.getTimeoutMs();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${host}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${t}`.trim());
      }

      const json = (await res.json()) as { embedding?: number[] };
      return json.embedding ?? [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private async safeLogKbEmbedding(meta?: EmbedUsageMeta) {
    if (!meta?.tenantId) return;
    try {
      await this.prisma.usageEvent.create({
        data: {
          tenantId: meta.tenantId,
          userId: meta.userId ?? null,
          type: "KB_EMBEDDING",
          amount: 1,
          meta: {
            sourceId: meta.sourceId ?? null,
            jobId: meta.jobId ?? null,
            mode: meta.mode ?? null,
          },
        },
      });
    } catch {
    }
  }

  async embed(text: string, usageMeta?: EmbedUsageMeta): Promise<number[]> {
    const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
    if (!cleaned) return [];

    const model = this.config.get<string>("OLLAMA_EMBED_MODEL") ?? "nomic-embed-text:latest";
    const primary = this.config.get<string>("OLLAMA_HOST") ?? "http://127.0.0.1:11434";

    const hosts = Array.from(
      new Set([primary, "http://localhost:11434", "http://127.0.0.1:11434"]),
    );

    const retries = this.getRetries();
    let lastErr: unknown = null;

    for (const host of hosts) {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const embedding = await this.callOllama(host, model, cleaned);
          await this.safeLogKbEmbedding(usageMeta);
          return embedding;
        } catch (err) {
          lastErr = err;
        }
      }
    }

    throw new ServiceUnavailableException(
      `Ollama embeddings unavailable (tried ${hosts.join(", ")}; model=${model}). ` +
        `Start it with: 'ollama serve'. Last error: ${String(lastErr)}`,
    );
  }
}
