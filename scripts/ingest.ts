/**
 * Ingest pipeline: chunk → embed → store.  Run with `npm run ingest`.
 *
 * Idempotent: recreates the table and reinserts every chunk on each run, so the
 * DB always reflects the current corpus + chunking params (no stale rows).
 *
 * Index decision (S1.5 / S2): the corpus is ~tiny (well under a few hundred
 * chunks), so we deliberately use an EXACT cosine KNN scan and DO NOT build an
 * approximate index (HNSW/IVFFlat). Approximate indexes trade recall for a
 * speed-up we don't need at this scale, and IVFFlat needs enough rows to train
 * sensible lists. This is a deliberate production call, not an oversight.
 */
import { join } from "node:path";
import { sql, embedTexts, toVectorLiteral, EMBEDDING_DIM, EMBEDDING_MODEL } from "./db.ts";
import { chunkCorpus, MAX_TOKENS, OVERLAP_TOKENS, CHUNK_STRATEGY } from "./chunk.ts";

const CONTENT_DIR = join(process.cwd(), "content");

async function main() {
  console.log(`▸ Chunking corpus in ${CONTENT_DIR} (strategy=${CHUNK_STRATEGY}, max≈${MAX_TOKENS} tok, overlap≈${OVERLAP_TOKENS} tok, heading-aware)…`);
  const chunks = chunkCorpus(CONTENT_DIR);
  if (chunks.length === 0) {
    throw new Error("No chunks produced — is content/ empty?");
  }
  const byFile = chunks.reduce<Record<string, number>>((acc, c) => {
    acc[c.metadata.sourceFile] = (acc[c.metadata.sourceFile] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  ${chunks.length} chunks:`, byFile);

  console.log(`▸ Embedding ${chunks.length} chunks with ${EMBEDDING_MODEL}…`);
  const embeddings = await embedTexts(chunks.map((c) => c.content));
  if (embeddings.length !== chunks.length) {
    throw new Error(`Embedding count ${embeddings.length} != chunk count ${chunks.length}`);
  }
  if (embeddings[0].length !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding dim ${embeddings[0].length} (expected ${EMBEDDING_DIM})`);
  }

  console.log("▸ (Re)creating documents table…");
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`DROP TABLE IF EXISTS documents`;
  await sql`
    CREATE TABLE documents (
      id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      content   text  NOT NULL,
      metadata  jsonb NOT NULL,
      embedding vector(${sql.unsafe(String(EMBEDDING_DIM))}) NOT NULL,
      -- Full-text vector for S6 hybrid (vector + keyword) retrieval, fused via RRF in
      -- lib/rag. Generated from content so it always tracks the chunk text; the GIN
      -- index keeps it cheap. Toggle the keyword arm at query time with HYBRID_SEARCH.
      tsv       tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX documents_tsv_idx ON documents USING GIN (tsv)`;

  console.log(`▸ Inserting ${chunks.length} rows…`);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    await sql`
      INSERT INTO documents (content, metadata, embedding)
      VALUES (${c.content}, ${JSON.stringify(c.metadata)}::jsonb, ${toVectorLiteral(embeddings[i])}::vector)
    `;
  }

  const [{ count }] = (await sql`SELECT count(*)::int AS count FROM documents`) as { count: number }[];
  console.log(`✓ Ingest complete — ${count} rows in documents.`);
}

main().catch((err) => {
  console.error("✗ Ingest failed:", err);
  process.exit(1);
});
