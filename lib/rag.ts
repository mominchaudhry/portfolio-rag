/**
 * Retrieval helpers for the /api/ask route (S3).
 *
 * Mirrors the patterns in scripts/db.ts (Neon serverless HTTP driver + embeddings
 * routed through the Vercel AI Gateway), but lives under lib/ so it bundles cleanly
 * into the Next.js runtime. Kept separate from scripts/db.ts on purpose: the scripts
 * are run via `node --import tsx` and throw on a missing env var at import time;
 * here we resolve the DB lazily so the route can return a clean error instead.
 */
import { neon } from "@neondatabase/serverless";
import { gateway, embed } from "ai";

/** Baseline embedding model — must match what ingest used (1536-dim). Ablated in S6. */
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";

/**
 * Answer model, via the AI Gateway (S1.5 decision: free cost/latency telemetry +
 * one-line swaps for the S6 ablation). NOTE gateway model ids are dotted
 * (`claude-sonnet-4.6`), not the hyphenated Anthropic-direct id (`claude-sonnet-4-6`)
 * — verified against the live gateway model list.
 *
 * Default is `claude-haiku-4.5`: the tracker's intended baseline is Sonnet 4.6, but
 * the AI Gateway FREE tier blocks premium models (403 RestrictedModelsError) — Sonnet
 * needs a paid top-up. Haiku 4.5 IS free-tier accessible, is in-family (latest Claude),
 * and is already an S6 answer-model ablation candidate. Override with the ANSWER_MODEL
 * env var (e.g. `anthropic/claude-sonnet-4.6` once credits are topped up).
 */
export const ANSWER_MODEL = process.env.ANSWER_MODEL ?? "anthropic/claude-haiku-4.5";

/** Top-k chunks pulled for the grounded prompt. */
export const TOP_K = 5;

/**
 * Refusal guardrail: if the best chunk's cosine similarity is below this, we refuse
 * WITHOUT calling the model (so it can't hallucinate). Conservative baseline — tuned
 * against the unanswerable eval set in S6.
 */
export const SIMILARITY_THRESHOLD = 0.3;

export type ChunkMetadata = {
  sourceFile: string;
  title: string;
  source: string;
  section: string;
  heading: string;
  chunkIndex: number;
  charStart: number;
  charEnd: number;
};

export type RetrievedChunk = {
  id: number;
  content: string;
  metadata: ChunkMetadata;
  similarity: number;
};

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY is not set");
  }
  return neon(url);
}

/** pgvector accepts a vector literal like "[0.1,0.2,...]". */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Retry a gateway call on transient (retryable) errors with exponential backoff.
 * The AI Gateway free tier rate-limits rapid embeds with a retryable 429 (see the
 * tracker's open question) — a couple of backed-off retries smooth over that.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = (err as { isRetryable?: boolean })?.isRetryable;
      if (!retryable || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); // 1s, 2s
    }
  }
  throw lastErr;
}

async function embedQuery(question: string): Promise<number[]> {
  const { embedding } = await withRetry(() =>
    embed({ model: gateway.textEmbeddingModel(EMBEDDING_MODEL), value: question }),
  );
  return embedding;
}

/**
 * Embed the question and return the top-k chunks by cosine similarity
 * (exact KNN — no approximate index; see scripts/ingest.ts for the rationale).
 */
export async function retrieve(question: string, topK = TOP_K): Promise<RetrievedChunk[]> {
  const sql = getSql();
  const qVec = toVectorLiteral(await embedQuery(question));
  // pgvector: <=> is cosine distance; similarity = 1 - distance.
  const rows = (await sql`
    SELECT
      id,
      content,
      metadata,
      1 - (embedding <=> ${qVec}::vector) AS similarity
    FROM documents
    ORDER BY embedding <=> ${qVec}::vector
    LIMIT ${topK}
  `) as RetrievedChunk[];
  return rows;
}
