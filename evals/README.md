# Eval harness — Ask My Portfolio (S5)

A versioned Q&A set + a one-command [Promptfoo](https://www.promptfoo.dev) harness that
runs every question through the **real RAG pipeline** and scores it with
**Claude-as-judge**. This is the gate that keeps the assistant honest and the "before"
numbers for S6's retrieval improvements.

> **Pattern:** RAG with a refusal guardrail, gated by a versioned eval suite —
> correctness, faithfulness/groundedness, context-recall, retrieval-hit, and
> refusal-accuracy.

## Run it

```bash
# Canonical baseline (Sonnet 4.6 answers, Sonnet 4.6 judge)
ANSWER_MODEL=anthropic/claude-sonnet-4.6 npm run eval

# Companion / ablation run (Haiku 4.5 answers, same judge + eval set)
ANSWER_MODEL=anthropic/claude-haiku-4.5 npm run eval

# Defaults to Haiku 4.5 if ANSWER_MODEL is unset. Forward promptfoo flags after --:
npm run eval -- -n 5            # first 5 questions
npm run eval -- --filter-pattern 'unans-'   # only the refusal set
```

Each run writes `results/<timestamp>-<model>.json` (full promptfoo output) and
`results/<timestamp>-<model>.scorecard.json` (the summarized metrics), and prints the
scorecard. The judge is fixed to `claude-sonnet-4.6` across runs so model comparisons
are apples-to-apples.

## What's measured

The eval set is `portfolio_qa.jsonl` — **48 questions** (34 answerable, 14 deliberately
**unanswerable**). Answerable pairs carry a reference answer + the expected source file;
the unanswerable set probes facts intentionally left out of the corpus (GPA, phone,
Coinbase, French, certifications, off-topic, etc.).

| Metric | Type | What it checks |
|---|---|---|
| **Answer correctness** | Claude-judge (`llm-rubric`) | Answer conveys the reference facts |
| **Faithfulness / groundedness** | Claude-judge (custom) | Every claim is supported by the retrieved context (no hallucination) |
| **Context recall** | Claude-judge (custom) | Retrieval pulled context that *contains* the answer |
| **Retrieval hit** | deterministic | Expected source file appears in the citations |
| **Answered** | deterministic | Pipeline didn't false-refuse an answerable question |
| **Refusal accuracy** | Claude-judge (`llm-rubric`) | Unanswerable questions are declined, not fabricated |

> The faithfulness and context-recall judges are custom (see `asserts.ts`): promptfoo's
> built-in `context-faithfulness` / `context-recall` decompose answers into claims and
> mis-scored short factual answers (e.g. graded "Momin is based in Toronto, Canada" as 0%
> faithful). The custom judges see `metadata.context` directly and ignore citation markers.

## Files

- `portfolio_qa.jsonl` — the versioned eval set (the only thing coupled to corpus content).
- `promptfooconfig.yaml` — providers, the Claude judge, and the test source.
- `provider.ts` — custom provider: runs the production retrieval + grounded-prompt + refusal
  guardrail path (imports `lib/rag`), non-streaming, returning answer + context + cost + latency.
- `tests.ts` — generates promptfoo test cases (with per-type assertions) from the JSONL.
- `asserts.ts` — custom Claude-judge (faithfulness, context-recall) + deterministic assertions.
- `run.ts` — `npm run eval` wrapper: runs promptfoo, writes timestamped results, prints the scorecard.
- `results/` — committed raw output + scorecards (the headline metric's evidence).

---

## Baseline scorecard (2026-06-14)

**Config (the "before" for S6):** heading-aware chunking · exact KNN top-5 · no reranker ·
similarity refusal threshold 0.3 · embeddings `text-embedding-3-small` · judge `claude-sonnet-4.6`.

| Metric | **Sonnet 4.6** (baseline) | Haiku 4.5 (companion) |
|---|---|---|
| Answer correctness (answerable) | **91.2%** | 82.4% |
| Faithfulness / groundedness | **97.1%** | 97.1% |
| Context recall | **91.2%** | 91.2% |
| Retrieval hit — expected source | **97.1%** | 97.1% |
| Answered, not false-refused | **100%** | 100% |
| Refusal accuracy (unanswerable) | **100%** | 100% |
| **Hallucination rate** (unanswerable) | **0%** | 0% |
| Overall pass rate | **89.6%** | 83.3% |
| Answer cost / question | $0.0031 | **$0.0010** |
| Pipeline latency p50 / p95 | 2949 / 5841 ms | **2108 / 3200 ms** |

**Reading it:**
- **0% hallucination + 100% refusal accuracy** on both models — the two-layer guardrail
  (hard similarity threshold + in-prompt instruction) holds across all 14 unanswerable
  questions, including the deliberately-omitted Coinbase/phone/GPA cases and off-topic prompts.
- The **retrieval metrics are identical across models** (context recall 91.2%, retrieval hit
  97.1%) — they measure *retrieval*, which is model-independent. These are the numbers S6's
  hybrid search + reranker should move.
- **Sonnet vs Haiku:** Sonnet leads answer correctness by ~9 points (91.2% vs 82.4%); Haiku is
  **~3× cheaper and ~1.8× faster at p95** with identical faithfulness and refusal behavior. A
  real cost/quality tradeoff to revisit in the S6 ablation.

**Where the baseline loses points (all retrieval-bound → S6 targets):** the answerable misses
are dominated by short heading/intro chunks out-ranking the detail chunks (the documented S2
retrieval artifact) — e.g. "What companies has Momin worked at?" retrieves the *"Work
Experience"* header chunk without the company details. This is exactly the failure mode hybrid
(keyword + vector) retrieval and reranking are meant to fix, which is why the baseline is the
right "before" for S6's before/after delta.
