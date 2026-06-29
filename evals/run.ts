/**
 * Eval runner — `npm run eval`.
 *
 * 1. Picks the answer model from ANSWER_MODEL (default anthropic/claude-haiku-4.5).
 * 2. Runs promptfoo against evals/promptfooconfig.yaml, writing the raw output to
 *    evals/results/<timestamp>-<model>.json.
 * 3. Computes a scorecard (per-metric pass rates split answerable vs unanswerable,
 *    plus cost + latency) and prints it, writing evals/results/<timestamp>-<model>.scorecard.json
 *    and refreshing evals/results/latest.md.
 *
 * Extra CLI args are forwarded to promptfoo, e.g. `npm run eval -- -n 4` (first 4 tests)
 * or `npm run eval -- -j 1` (serial). Select the model with
 * `ANSWER_MODEL=anthropic/claude-sonnet-4.6 npm run eval`.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(here, "results");
mkdirSync(resultsDir, { recursive: true });

const model = process.env.ANSWER_MODEL ?? "anthropic/claude-haiku-4.5";
const modelSlug = model.replace(/[^a-z0-9.]+/gi, "-");
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const rawPath = join(resultsDir, `${ts}-${modelSlug}.json`);
const scorecardPath = join(resultsDir, `${ts}-${modelSlug}.scorecard.json`);

const concurrency = process.env.EVAL_CONCURRENCY ?? "3";
const passthrough = process.argv.slice(2);

// Describe the retrieval config under test (drives the scorecard's `config` field, the
// printed header, and latest.md) so every run is self-documenting for the S6 deltas.
const chunkStrategy = process.env.CHUNK_STRATEGY ?? "v2";
const hybrid = (process.env.HYBRID_SEARCH ?? "1") !== "0";
const topK = process.env.TOP_K ?? "5";
const threshold = process.env.SIMILARITY_THRESHOLD ?? "0.3";
const configDesc =
  `${chunkStrategy} chunking · ` +
  `${hybrid ? "hybrid (vector+keyword RRF)" : "vector-only"} top-${topK} · thr ${threshold}`;

console.log(`\n▶ Running eval — answer model: ${model} (judge: claude-sonnet-4.6)`);
console.log(`  config: ${configDesc}\n`);

const run = spawnSync(
  "npx",
  [
    "promptfoo",
    "eval",
    "-c",
    join(here, "promptfooconfig.yaml"),
    "-o",
    rawPath,
    "-j",
    concurrency,
    "--no-cache",
    ...passthrough,
  ],
  {
    stdio: "inherit",
    // promptfoo spawns a fresh node that dynamically imports our .ts provider/tests,
    // so it needs the tsx loader registered too (the parent's --import tsx doesn't carry over).
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import tsx`.trim() },
  },
);

// promptfoo exit codes: 0 = all passed, 100 = ran fine but some assertions failed
// (expected for a baseline — we want to record those), anything else = a real error.
if (run.status !== 0 && run.status !== 100) {
  console.error(`\npromptfoo exited with status ${run.status}.`);
  process.exit(run.status ?? 1);
}

// ---- Scorecard ----------------------------------------------------------------

type Component = { assertion?: { metric?: string }; metric?: string; pass?: boolean; score?: number };
type Result = {
  vars?: Record<string, unknown>;
  testCase?: { vars?: Record<string, unknown> };
  response?: { cost?: number; latencyMs?: number; tokenUsage?: { total?: number } };
  cost?: number;
  latencyMs?: number;
  gradingResult?: { componentResults?: Component[] };
  success?: boolean;
};

const raw = JSON.parse(readFileSync(rawPath, "utf8"));
const results: Result[] = raw?.results?.results ?? raw?.results ?? [];

function typeOf(r: Result): string {
  return String(r.vars?.type ?? r.testCase?.vars?.type ?? "unknown");
}

// componentResults preserve assert order, but `javascript` assertions drop their
// `metric` field in promptfoo's output — so we map by position per type (must match
// the assert order in evals/tests.ts).
const METRICS_BY_TYPE: Record<string, string[]> = {
  answerable: ["correctness", "faithfulness", "context_recall", "retrieval_hit", "answered"],
  unanswerable: ["refusal_accuracy"],
};

// metric -> { passes, count, scoreSum }
const byMetric = new Map<string, { passes: number; count: number; scoreSum: number }>();
function record(metric: string, pass: boolean, score: number) {
  const m = byMetric.get(metric) ?? { passes: 0, count: 0, scoreSum: 0 };
  m.count += 1;
  if (pass) m.passes += 1;
  m.scoreSum += typeof score === "number" ? score : pass ? 1 : 0;
  byMetric.set(metric, m);
}

const latencies: number[] = [];
let totalCost = 0;
let totalTokens = 0;
let answerableTotal = 0;
let answerablePass = 0;
let unansTotal = 0;
let unansPass = 0;

for (const r of results) {
  const t = typeOf(r);
  const cost = r.response?.cost ?? r.cost ?? 0;
  const latency = r.response?.latencyMs ?? r.latencyMs ?? 0;
  totalCost += cost;
  totalTokens += r.response?.tokenUsage?.total ?? 0;
  if (latency > 0) latencies.push(latency);

  const order = METRICS_BY_TYPE[t] ?? [];
  const components = r.gradingResult?.componentResults ?? [];
  components.forEach((c, i) => {
    const metric = c.assertion?.metric ?? c.metric ?? order[i] ?? "unnamed";
    record(metric, Boolean(c.pass), c.score ?? (c.pass ? 1 : 0));
  });

  if (t === "answerable") {
    answerableTotal += 1;
    if (r.success) answerablePass += 1;
  } else if (t === "unanswerable") {
    unansTotal += 1;
    if (r.success) unansPass += 1;
  }
}

function pct(passes: number, count: number): string {
  return count === 0 ? "  n/a" : `${((passes / count) * 100).toFixed(1)}%`;
}
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const metricOrder = [
  ["correctness", "Answer correctness (answerable)"],
  ["faithfulness", "Faithfulness / groundedness (answerable)"],
  ["context_recall", "Context recall (answerable)"],
  ["retrieval_hit", "Retrieval hit — expected source (answerable)"],
  ["answered", "Answered, not false-refused (answerable)"],
  ["refusal_accuracy", "Refusal accuracy (unanswerable)"],
] as const;

const scorecard = {
  timestamp: new Date().toISOString(),
  answerModel: model,
  judgeModel: "anthropic/claude-sonnet-4.6",
  config: configDesc,
  counts: { answerable: answerableTotal, unanswerable: unansTotal, total: results.length },
  metrics: Object.fromEntries(
    metricOrder.map(([key]) => {
      const m = byMetric.get(key);
      return [
        key,
        m
          ? { passRate: m.count ? m.passes / m.count : null, meanScore: m.count ? m.scoreSum / m.count : null, n: m.count }
          : { passRate: null, meanScore: null, n: 0 },
      ];
    }),
  ),
  hallucinationRate:
    byMetric.get("refusal_accuracy") && byMetric.get("refusal_accuracy")!.count
      ? 1 - byMetric.get("refusal_accuracy")!.passes / byMetric.get("refusal_accuracy")!.count
      : null,
  overallPassRate: results.length ? (answerablePass + unansPass) / results.length : null,
  cost: { totalUsd: totalCost, perAnsweredUsd: answerableTotal ? totalCost / answerableTotal : 0 },
  latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), n: latencies.length },
  totalAnswerTokens: totalTokens,
  rawResults: rawPath,
};

writeFileSync(scorecardPath, JSON.stringify(scorecard, null, 2));

// ---- Pretty print -------------------------------------------------------------

const line = "─".repeat(64);
console.log(`\n${line}`);
console.log(`  SCORECARD — ${model}`);
console.log(`  config: ${configDesc}`);
console.log(`  judge: claude-sonnet-4.6 · ${results.length} questions ` +
  `(${answerableTotal} answerable, ${unansTotal} unanswerable)`);
console.log(line);
for (const [key, label] of metricOrder) {
  const m = byMetric.get(key);
  const val = m ? pct(m.passes, m.count) : "  n/a";
  const mean = m && m.count ? ` (mean ${(m.scoreSum / m.count).toFixed(2)})` : "";
  console.log(`  ${label.padEnd(46)} ${val.padStart(6)}${mean}`);
}
console.log(line);
const hr = scorecard.hallucinationRate;
console.log(`  Hallucination rate (unanswerable)            ${hr === null ? " n/a" : `${(hr * 100).toFixed(1)}%`.padStart(6)}`);
console.log(`  Overall pass rate                            ${pct(answerablePass + unansPass, results.length).padStart(6)}`);
console.log(line);
console.log(`  Answer cost (total)                          $${totalCost.toFixed(4)}`);
console.log(`  Answer cost / question                       $${(totalCost / Math.max(1, results.length)).toFixed(5)}`);
console.log(`  Pipeline latency p50 / p95                   ${scorecard.latencyMs.p50} / ${scorecard.latencyMs.p95} ms`);
console.log(line);
console.log(`  Raw:       ${rawPath}`);
console.log(`  Scorecard: ${scorecardPath}\n`);

// ---- latest.md — a committed, shareable scorecard (the portfolio-card artifact) -----

const mdRows = metricOrder
  .map(([key, label]) => {
    const m = byMetric.get(key);
    return `| ${label} | ${m ? pct(m.passes, m.count) : "n/a"} |`;
  })
  .join("\n");

const latestMd = `# Eval scorecard — latest run

| Field | Value |
|-------|-------|
| Answer model | \`${model}\` |
| Judge model | \`anthropic/claude-sonnet-4.6\` |
| Config | ${configDesc} |
| Questions | ${results.length} (${answerableTotal} answerable, ${unansTotal} unanswerable) |
| Run at | ${scorecard.timestamp} |

| Metric | Score |
|--------|-------|
${mdRows}
| Hallucination rate (unanswerable) | ${hr === null ? "n/a" : `${(hr * 100).toFixed(1)}%`} |
| Overall pass rate | ${pct(answerablePass + unansPass, results.length)} |
| Answer cost / question | $${(totalCost / Math.max(1, results.length)).toFixed(5)} |
| Pipeline latency p50 / p95 | ${scorecard.latencyMs.p50} / ${scorecard.latencyMs.p95} ms |

_Generated by \`npm run eval\` (evals/run.ts). Raw: \`${rawPath.split("/").pop()}\`._
`;

writeFileSync(join(resultsDir, "latest.md"), latestMd);
console.log(`  Markdown:  ${join(resultsDir, "latest.md")}\n`);
