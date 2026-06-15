/**
 * CLI retrieval sanity check.  Run with:
 *   npm run query -- "Has Momin used AWS at scale?"
 *
 * Embeds the question and returns the top-k chunks by cosine similarity
 * (exact KNN — no approximate index; see ingest.ts for the rationale).
 */
import { sql, embedText, toVectorLiteral } from "./db.ts";

const TOP_K = 5;

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error('Usage: npm run query -- "your question here"');
    process.exit(1);
  }

  const qVec = toVectorLiteral(await embedText(question));
  // pgvector: <=> is cosine distance; similarity = 1 - distance.
  const rows = (await sql`
    SELECT
      id,
      content,
      metadata,
      1 - (embedding <=> ${qVec}::vector) AS similarity
    FROM documents
    ORDER BY embedding <=> ${qVec}::vector
    LIMIT ${TOP_K}
  `) as {
    id: number;
    content: string;
    metadata: { sourceFile: string; heading: string; section: string; source: string };
    similarity: number;
  }[];

  console.log(`\nQ: ${question}\n`);
  rows.forEach((r, i) => {
    const snippet = r.content.replace(/\s+/g, " ").slice(0, 160);
    console.log(
      `#${i + 1}  sim=${r.similarity.toFixed(3)}  [${r.metadata.sourceFile} › ${r.metadata.heading}]`,
    );
    console.log(`     ${snippet}${r.content.length > 160 ? "…" : ""}\n`);
  });
}

main().catch((err) => {
  console.error("✗ Query failed:", err);
  process.exit(1);
});
