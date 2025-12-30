import {
  Injectable,
  PayloadTooLargeException,
  RequestTimeoutException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isContextLengthError(msg: string) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("context length") ||
    m.includes("exceeds the context") ||
    m.includes("context window") ||
    m.includes("input length exceeds") ||
    m.includes("too many tokens") ||
    m.includes("maximum context") ||
    m.includes("prompt is too long")
  );
}

function isNetworkError(e: any) {
  const msg = (e?.message ?? String(e)).toLowerCase();

  if (msg.includes("fetch failed") || msg.includes("failed to fetch")) return true;

  const code = (e?.code ?? e?.cause?.code ?? "").toString().toLowerCase();
  if (["econnrefused", "enotfound", "etimedout", "ehostunreach", "eai_again"].includes(code)) {
    return true;
  }

  const causeMsg = (e?.cause?.message ?? "").toLowerCase();
  if (
    causeMsg.includes("econnrefused") ||
    causeMsg.includes("enotfound") ||
    causeMsg.includes("timed out") ||
    causeMsg.includes("network")
  ) {
    return true;
  }

  return msg.includes("econnrefused") || msg.includes("enotfound") || msg.includes("networkerror");
}

@Injectable()
export class LlmService {
  constructor(private config: ConfigService) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const model = this.config.get<string>("OLLAMA_CHAT_MODEL") ?? "llama3.1:latest";
    const timeoutMs = Number(this.config.get<string>("OLLAMA_TIMEOUT_MS") ?? "60000") || 60_000;

    const primary = this.config.get<string>("OLLAMA_HOST") ?? "http://127.0.0.1:11434";
    const hosts = Array.from(
      new Set([primary, "http://localhost:11434", "http://127.0.0.1:11434"]),
    );

    let lastErr: unknown = null;

    for (const host of hosts) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(`${host}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ model, messages, stream: false }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const parsed = safeJsonParse(text);

          const ollamaErr =
            typeof parsed?.error === "string"
              ? parsed.error
              : typeof parsed?.message === "string"
                ? parsed.message
                : text;

          if (isContextLengthError(ollamaErr)) {
            throw new PayloadTooLargeException({
              message: "LLM context limit exceeded (prompt too long).",
              model,
              ollamaError: ollamaErr,
              hint: "Reduce included ticket comments / KB chunks, or use a larger-context model.",
            });
          }

          // Ollama reachable, but returned error response
          throw new ServiceUnavailableException({
            message: "Ollama returned an error response.",
            model,
            host,
            status: res.status,
            ollamaError: ollamaErr,
          });
        }

        const json = (await res.json()) as { message?: { role: string; content: string } };
        return json.message?.content?.trim() ?? "";
      } catch (e: any) {
        lastErr = e;

        if (e?.name === "AbortError") {
          // if first host times out, try next host (if any)
          continue;
        }

        if (isNetworkError(e)) {
          // try next host
          continue;
        }

        // propagate known exceptions (PayloadTooLarge etc.)
        throw e;
      } finally {
        clearTimeout(timeout);
      }
    }

    const msg = (lastErr as any)?.name === "AbortError" ? "AbortError" : String((lastErr as any)?.message ?? lastErr);

    if ((lastErr as any)?.name === "AbortError") {
      throw new RequestTimeoutException({
        message: "LLM request timed out (Ollama took too long).",
        timeoutMs,
      });
    }

    throw new ServiceUnavailableException({
      message: `Ollama is not reachable. Start it with: 'ollama serve'.`,
      model,
      hostsTried: hosts,
      lastError: msg,
    });
  }
}
