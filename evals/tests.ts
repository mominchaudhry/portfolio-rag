/**
 * Generates Promptfoo test cases from the versioned eval set (portfolio_qa.jsonl).
 *
 * Each line becomes one test case whose assertions depend on its `type`:
 *   answerable   → correctness (judge) + faithfulness/context-recall (judge over the
 *                  retrieved context) + deterministic retrieval-hit + answered checks
 *   unanswerable → refusal-accuracy (judge): must decline / not fabricate
 *
 * The judge model is configured once in promptfooconfig.yaml (defaultTest.options.provider).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

type Row = {
  id: string;
  type: "answerable" | "unanswerable";
  question: string;
  expected: string;
  expected_source?: string;
  note?: string;
};

const rows: Row[] = readFileSync(join(here, "portfolio_qa.jsonl"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Row);

const CORRECTNESS_RUBRIC = `You are grading an "Ask My Portfolio" assistant that answers questions about Momin Chaudhry using only his portfolio.

Question: {{question}}
Reference answer (ground truth): {{expected}}

Grade the assistant's response. Output PASS only if the response is factually correct and conveys the key facts in the reference answer. It is fine if it is phrased differently or adds correctly-cited detail. Output FAIL if it is wrong, contradicts the reference, omits the key fact, or wrongly refuses to answer.`;

const REFUSAL_RUBRIC = `You are grading whether an "Ask My Portfolio" assistant correctly DECLINES to answer a question whose answer is NOT in Momin Chaudhry's portfolio.

Question: {{question}}
Why it is unanswerable: {{expected}}

Output PASS if the response declines — e.g. it says it doesn't have that information about Momin, that it isn't in the portfolio, or (for a skill/credential) that it is not listed. PASS also if it correctly states the fact is absent. Output FAIL if the response fabricates or asserts a specific answer to the question (a hallucination).`;

type Assertion = Record<string, unknown>;

function assertionsFor(row: Row): Assertion[] {
  if (row.type === "unanswerable") {
    return [{ type: "llm-rubric", value: REFUSAL_RUBRIC, metric: "refusal_accuracy" }];
  }
  return [
    { type: "llm-rubric", value: CORRECTNESS_RUBRIC, metric: "correctness" },
    { type: "javascript", value: "file://asserts.ts:judgeFaithfulness", metric: "faithfulness" },
    { type: "javascript", value: "file://asserts.ts:judgeContextRecall", metric: "context_recall" },
    { type: "javascript", value: "file://asserts.ts:retrievedExpectedSource", metric: "retrieval_hit" },
    { type: "javascript", value: "file://asserts.ts:wasAnswered", metric: "answered" },
  ];
}

const tests = rows.map((row) => ({
  description: `${row.id} [${row.type}]`,
  vars: {
    question: row.question,
    query: row.question, // some context-* assertions read `query`
    expected: row.expected,
    expected_source: row.expected_source ?? "",
    type: row.type,
  },
  assert: assertionsFor(row),
}));

export default tests;
