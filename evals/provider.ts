/**
 * Promptfoo custom provider — runs a question through the REAL RAG pipeline.
 *
 * This is deliberately the same retrieval + grounded-prompt + refusal path the
 * production route (app/api/ask) uses: it imports `retrieve`, `buildSystemPrompt`,
 * `REFUSAL_TEXT`, `SIMILARITY_THRESHOLD`, and `ANSWER_MODEL` from lib/rag, so the
 * eval measures exactly what ships. The only difference is generation is
 * non-streaming (`generateText`) since the eval needs the full answer + usage.
 *
 * Returns, alongside the answer text:
 *   metadata.context         — the retrieved chunk texts (used by context-* judges
 *                              via `contextTransform: metadata.context`)
 *   metadata.refused         — true when the hard similarity guardrail fired
 *   metadata.topSimilarity   — best cosine similarity (guardrail input)
 *   metadata.citationSources — source files cited (deterministic retrieval check)
 *   tokenUsage / cost / latencyMs — for the cost & latency columns in the scorecard
 */
import { gateway, generateText } from "ai";
import {
  ANSWER_MODEL,
  REFUSAL_TEXT,
  SIMILARITY_THRESHOLD,
  buildSystemPrompt,
  retrieve,
} from "../lib/rag.ts";

/** Answer-model pricing (USD per 1M tokens) for the cost column. Update if models change. */
const PRICING: Record<string, { in: number; out: number }> = {
  "anthropic/claude-sonnet-4.6": { in: 3, out: 15 },
  "anthropic/claude-haiku-4.5": { in: 1, out: 5 },
  "anthropic/claude-opus-4-8": { in: 5, out: 25 },
};

type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
};

function normalizeUsage(usage: Usage | undefined) {
  const inputTokens = usage?.inputTokens ?? usage?.promptTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? usage?.completionTokens ?? 0;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

function costFor(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}

/** Retry transient (retryable) gateway errors with a little backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = (err as { isRetryable?: boolean })?.isRetryable;
      if (!retryable || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastErr;
}

type ProviderResponse = {
  output: string;
  tokenUsage?: { total: number; prompt: number; completion: number };
  cost?: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
  error?: string;
};

class RagProvider {
  private readonly model: string;
  private readonly providerId: string;

  constructor(options?: { id?: string }) {
    this.model = ANSWER_MODEL;
    this.providerId = options?.id ?? `rag:${this.model}`;
  }

  id() {
    return this.providerId;
  }

  async callApi(
    _prompt: string,
    context?: { vars?: Record<string, unknown> },
  ): Promise<ProviderResponse> {
    const question = String(context?.vars?.question ?? _prompt ?? "").trim();
    if (!question) return { output: "", error: "No question var provided" };

    const started = Date.now();
    try {
      const chunks = await retrieve(question);
      // Best cosine similarity among retrieved chunks (hybrid RRF can reorder them).
      const topSimilarity = chunks.reduce((m, c) => Math.max(m, c.similarity), 0);
      const grounded = topSimilarity >= SIMILARITY_THRESHOLD;
      const contextText = chunks
        .map((c, i) => `[${i + 1}] (${c.metadata.sourceFile}) ${c.content}`)
        .join("\n\n");

      // Hard guardrail: no relevant context → refuse WITHOUT calling the model.
      if (!grounded) {
        return {
          output: REFUSAL_TEXT,
          latencyMs: Date.now() - started,
          cost: 0,
          metadata: {
            refused: true,
            calledModel: false,
            topSimilarity,
            context: contextText || "(no context retrieved)",
            citationSources: [],
          },
        };
      }

      const result = await withRetry(() =>
        generateText({
          model: gateway(this.model),
          system: buildSystemPrompt(chunks),
          prompt: question,
        }),
      );

      const { inputTokens, outputTokens, totalTokens } = normalizeUsage(
        result.usage as Usage,
      );

      return {
        output: result.text,
        latencyMs: Date.now() - started,
        tokenUsage: { total: totalTokens, prompt: inputTokens, completion: outputTokens },
        cost: costFor(this.model, inputTokens, outputTokens),
        metadata: {
          refused: false,
          calledModel: true,
          topSimilarity,
          context: contextText,
          citationSources: [...new Set(chunks.map((c) => c.metadata.sourceFile))],
        },
      };
    } catch (err) {
      return {
        output: "",
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export default RagProvider;
