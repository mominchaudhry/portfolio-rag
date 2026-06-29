# Eval harness — Ask My Portfolio

A versioned Q&A set + a one-command [Promptfoo](https://www.promptfoo.dev) harness that
runs every question through the **real RAG pipeline** and scores it with
**Claude-as-judge**. This is the gate that keeps the assistant honest and that produced
the **S5 baseline → S6 improved** before/after delta below.

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

**Retrieval levers (S6) are env-flagged** so the baseline and improved configs are both
re-runnable. Defaults are the improved config; reproduce the S5 baseline by flipping both:

```bash
# Reproduce the S5 baseline (header-chunking + vector-only). Requires a re-ingest:
CHUNK_STRATEGY=baseline npm run ingest
CHUNK_STRATEGY=baseline HYBRID_SEARCH=0 ANSWER_MODEL=anthropic/claude-sonnet-4.6 npm run eval

# Back to the improved (default) config:
npm run ingest        # CHUNK_STRATEGY defaults to v2
ANSWER_MODEL=anthropic/claude-sonnet-4.6 npm run eval   # HYBRID_SEARCH defaults to on
```

| Flag | Default | Effect |
|---|---|---|
| `CHUNK_STRATEGY` | `v2` | `v2` drops header-only chunks + prefixes each chunk with its heading path; `baseline` = the S5 header-aware chunking. **Changing it requires `npm run ingest`.** |
| `HYBRID_SEARCH` | `1` (on) | Fuse vector KNN + Postgres `tsvector` keyword ranking via RRF; `0` = vector-only. Query-time toggle (no re-ingest). |
| `TOP_K` | `5` | Chunks fed to the grounded prompt. |
| `SIMILARITY_THRESHOLD` | `0.3` | Hard refusal guardrail (best cosine sim below this ⇒ refuse without calling the model). |

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

## S5 baseline scorecard (2026-06-14)

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

---

## S6 improved scorecard (2026-06-29)

Two retrieval levers, each behind a flag and measured independently (answer model + judge held
at `claude-sonnet-4.6`, same 48-Q set, same rubrics — so the deltas are real, not measurement
drift). The S5 failures were almost entirely **retrieval-bound**, so both levers target retrieval.

**Lever A — chunking v2** (`CHUNK_STRATEGY=v2`, `scripts/chunk.ts`): drop header-only chunks
(the bare *"Work Experience"* / *"Projects"* chunks that out-ranked detail), and **prefix every
chunk with its heading path** (`Experience › Clearbridge Mobile — Software Engineer …`) so the
embedding carries the section + document subject. Re-ingest only, ~free.

**Lever B — hybrid search** (`HYBRID_SEARCH=1`, `lib/rag.ts`): fuse dense vector KNN with
Postgres `tsvector` keyword ranking via **Reciprocal Rank Fusion**. In-DB, $0. The keyword arm
uses **OR semantics** (`websearch_to_tsquery` ANDs every term, and the first-person corpus rarely
contains the literal name "Momin", so an AND query matched *nothing* — `&`→`|` fixes it).

### Per-lever delta (Sonnet 4.6, vs the S5 baseline)

| Metric | S5 baseline | +A: chunking v2 (vector-only) | +B: chunking v2 + hybrid | **Total Δ** |
|---|---|---|---|---|
| Answer correctness | 91.2% | 97.1% | **100%** | **+8.8** |
| Faithfulness / groundedness | 97.1% | 97.1% | **100%** | +2.9 |
| Context recall | 91.2% | 97.1% | **100%** | +8.8 |
| Retrieval hit — expected source | 97.1% | 94.1% | 97.1% | — |
| Answered, not false-refused | 100% | 100% | 100% | — |
| Refusal accuracy (unanswerable) | 100% | 100% | 100% | — |
| **Hallucination rate** | 0% | 0% | **0%** | — |
| Overall pass rate | 89.6% | 91.7% | **97.9%** | +8.3 |
| Answer cost / question | $0.0031 | $0.0032 | $0.0037 | +$0.0006 |
| Pipeline latency p50 / p95 | 2949 / 5841 ms | 2996 / 4379 ms | 3118 / 4842 ms | p95 −1.0s |

**Reading it:**
- **Chunking (A)** carries the answer-quality lift on its own: +5.9 correctness and +5.9
  context-recall, by removing the header chunks that starved the experience questions of detail.
  It costs 3 pts of `retrieval_hit` (one expected-source proxy miss), which hybrid then recovers.
- **Hybrid (B)** recovers that and closes the gap: correctness, faithfulness, and context-recall
  all reach **100%**, lifting overall +6.2 over chunking-only. Keyword recall pulls the exact-term
  chunks (companies, "$200/month", database terms) into the top-5 that dense vectors alone missed.
- **The guardrail held throughout:** 0% hallucination + 100% refusal accuracy + 0 false-refusals
  across all three configs, so `SIMILARITY_THRESHOLD=0.3` stays optimal (no separate tune needed).
- **Cost/latency barely moved:** +$0.0006/question and p95 actually *improved* ~1s (tighter,
  more relevant context → fewer tokens). The improved config is now the shipped default.

**The one remaining `retrieval_hit` miss** is *"What databases has Momin worked with?"*: the
answer is served correctly (correctness 100%) from `resume.md`'s Technical Skills, but the
deterministic proxy expected `skills.md`. This is the documented corpus-duplication artifact
(DB skills live in both files), not a real failure — a corpus lever (S6-D), left as-is.

The shipped/default config (`CHUNK_STRATEGY=v2` + `HYBRID_SEARCH=1`) is the improved one; see
`results/latest.md` for the live scorecard and `results/2026-06-29T03-01-52-*.json` for raw output.
