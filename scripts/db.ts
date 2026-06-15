/**
 * Shared DB + embedding helpers for the ingest/query scripts.
 *
 * Uses the Neon serverless HTTP driver (single-statement queries — fine for our
 * tiny corpus and matches the production runtime in app/api/ask) and the Vercel
 * AI SDK for OpenAI embeddings.
 */
import { neon } from "@neondatabase/serverless";
import { gateway, embed, embedMany } from "ai";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (expected in .env.local).");
}
if (!process.env.AI_GATEWAY_API_KEY) {
  throw new Error("AI_GATEWAY_API_KEY is not set (expected in .env.local).");
}

export const sql = neon(DATABASE_URL);

/**
 * Baseline embedding model — 1536-dim. Routed through the Vercel AI Gateway
 * (S1.5 decision: unified billing + cost/latency telemetry; OpenAI direct hit a
 * quota wall). The `openai/…` prefix is the gateway model id. Ablated in S6.
 */
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

const embeddingModel = gateway.textEmbeddingModel(EMBEDDING_MODEL);

/** Embed many strings in one batched call. */
export async function embedTexts(values: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model: embeddingModel, values });
  return embeddings;
}

/** Embed a single string (used by the query CLI). */
export async function embedText(value: string): Promise<number[]> {
  const { embedding } = await embed({ model: embeddingModel, value });
  return embedding;
}

/** pgvector accepts a vector literal like "[0.1,0.2,...]". */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
