# Project 1 — "Ask My Portfolio": Production RAG Assistant with an Eval Harness

> **Theme:** Retrieval-augmented generation, embeddings, vector search, reranking,
> streaming, citations, and a versioned eval harness (LLMOps).
> **Why it's #1:** Demoable in-situ on the portfolio; earns the largest cluster of
> AI keywords honestly; the eval harness signals production instinct.
>
> Strategic brief (local, outside this repo): `~/ai-project-roadmap.md` → Project 1.
> Cross-project index (local): `~/ai-projects/README.md`.
> **This doc is self-contained — an agent can work entirely from it.**

---

## Project facts (keep this current)

| Field | Value |
|-------|-------|
| Repo URL | https://github.com/mominchaudhry/portfolio-rag |
| Live demo URL | _TBD — pending Vercel deploy (see S0 handoff)_ |
| Vector DB | Neon Postgres + `pgvector` (free tier) — provisioning pending (S0 handoff) |
| Models | Answers: `claude-sonnet-4-6` (or `claude-opus-4-8`) · Embeddings: OpenAI `text-embedding-3-small` |
| Headline metric | _TBD — fill from eval scorecard_ |
| Overall status | **S0 in progress** (scaffold + repo done; Neon + Vercel pending user) |

**One-liner:** A cited, streaming chat assistant embedded in the portfolio that
answers questions about Momin (experience, projects, skills) using RAG over his own
content — gated by a versioned eval suite.

---

## Start here (first 5 minutes)
1. Read this whole doc once — it's **self-contained**.
2. In the **Status board** below, find the first session marked `TODO`.
3. **Verify reality matches the board** (see _Verifying handoffs_) before trusting it. Reality wins; if they disagree, fix the board first.
4. Do **only that one session** — read its Goal / Prerequisites / Tasks / Definition of Done.
5. When done, update this doc (status + Handoff notes) and commit it **in the same commit** as your code.

## Working agreement
- **One session per agent run.** Sessions are ordered and sized for a single run — don't run ahead.
- **Status legend:** `TODO` · `IN PROGRESS` (started; see Handoff) · `DONE` (verified vs Definition of Done) · `BLOCKED` (needs a human/external thing) · `optional/stretch`.
- **Update protocol (every session):** flip the status in the Status board *and* the session heading; fill the session's **Handoff notes** with the template below; update the **Project facts** table if repo/demo/metric changed.
- **Ground rules:** public repo · great README · live demo · committed, re-runnable eval with **real numbers** · then add to the portfolio as a `category:"ai"` featured project. Prefer latest Claude (`claude-opus-4-8`/`claude-sonnet-4-6`), OpenAI as 2nd provider. Every metric comes from a committed script — never hand-typed. Never commit secrets.

**Handoff note template** — paste into the session's Handoff notes and fill in:
```
Done:      <what you actually built/changed>
Files:     <key paths touched>
Decisions: <choices made + why>
Verify:    <exact command(s) the next agent runs to confirm it works>
Gotchas:   <anything surprising, partial, or risky>
Next:      <if unfinished: where you stopped + what's left>
```

## Environment & prerequisites
- **Node 20** (`nvm use 20`) — match the portfolio.
- **API keys (prepaid credit):** Anthropic (answers) + OpenAI (embeddings). Put in `.env.local` (gitignored); add prod copies to Vercel env vars.
- **Vector DB:** a Neon project with `pgvector` enabled (`CREATE EXTENSION vector;`) — free tier.
- **Accounts:** GitHub (`gh`, authed as `mominchaudhry`) + Vercel (same account as the portfolio).

## Git & deploy workflow
- This directory is its own git repo. Commit straight to `main` (small project) or branch per session.
- End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Vercel deploy gotcha (this cost hours on the portfolio):** Vercel **blocks** deploys whose commit-author email isn't tied to a GitHub account. Before the first push, set this repo's identity:
  - `git config user.email "38267836+mominchaudhry@users.noreply.github.com"`
  - `git config user.name "Momin Chaudhry"`
  - Also: `vercel ls` shows "UNKNOWN" for any non-Ready state — check the Vercel dashboard for real build status/logs.

## Verifying handoffs (don't trust the board blindly)
Before starting, confirm the last `DONE` session is actually done:
- `npm install` runs clean; `npm run build` (or `dev`) works.
- `npm run ingest` populates the vector DB; `scripts/query.ts` returns sensible chunks (after S2).
- `POST /api/ask` streams a cited answer (after S3); the chat widget works (after S4).
- `npm run eval` prints a scorecard (after S5); the Vercel demo URL loads (after S7).
If a claimed-`DONE` item fails, set it back to `IN PROGRESS`, note the gap in Handoff, and fix it within your session.

## Target repo layout
```
portfolio-rag/
  TRACKER.md            ← this doc (status tracker; lives in the repo)
  README.md             ← written in S7
  .env.example          ← S0
  content/              ← S1 corpus (bio.md, experience.md, projects.md, skills.md, resume.md)
  scripts/
    ingest.ts           ← S2  (npm run ingest)
    query.ts            ← S2  (CLI retrieval sanity check)
  app/
    api/ask/route.ts    ← S3  (retrieve + grounded streaming + citations)
    (chat widget)       ← S4
  evals/
    portfolio_qa.jsonl  ← S5  (versioned Q&A set)
    results/            ← S5/S6 scorecards
```

## External references
- Vercel AI SDK (streaming, `useChat`): https://sdk.vercel.ai/docs
- Anthropic API (messages, streaming): https://docs.anthropic.com
- OpenAI embeddings (`text-embedding-3-small`): https://platform.openai.com/docs/guides/embeddings
- Neon + pgvector: https://neon.tech/docs/extensions/pgvector
- RAGAS (eval metrics): https://docs.ragas.io

---

## Status board

| Session | Goal | Status |
|---------|------|--------|
| S0 | Repo scaffold, decisions, Vercel deploy skeleton | IN PROGRESS |
| S1 | Assemble & version the corpus (markdown) | TODO |
| S2 | Ingest pipeline: chunk → embed → store in vector DB | TODO |
| S3 | Retrieval + grounded generation (streaming + citations) | TODO |
| S4 | Chat UI widget | TODO |
| S5 | Eval set (30–60 Q&A) + harness + **baseline numbers** | TODO |
| S6 | Improve retrieval (rerank / better chunking / hybrid) + re-run evals; capture delta | TODO |
| S7 | Polish, README + architecture diagram + scorecard, deploy | TODO |
| S8 | Embed widget into the portfolio + add to `local.ts` | TODO |
| S9 | Stretch: nightly CI eval gate, conversation memory, hybrid search | optional/stretch |

---

## Architecture (target)

```
                ┌─────────────────────────────────────────────┐
   corpus/  ──▶ │ ingest: chunk → embed (OpenAI) → upsert      │
  (markdown)    └───────────────┬─────────────────────────────┘
                                ▼
                        ┌───────────────┐
                        │  vector DB    │  (pgvector on Neon)
                        └───────┬───────┘
  user Q ─▶ embed ─▶ similarity top-k ─▶ (rerank) ─▶ grounded prompt
                                                          │
                                                          ▼
                                            Claude (stream) ─▶ answer + citations
                                                          │
        eval harness ◀── versioned Q&A set ── scores faithfulness/correctness/refusal
```

**Recommended stack:** Next.js (App Router, API routes for retrieve+generate),
Vercel AI SDK for streaming, Anthropic Claude (answers) + OpenAI embeddings,
pgvector on Neon (free) or Vercel Postgres, RAGAS (Python eval) **or** an
`evalite`/Vitest TS eval. **Decision to record in S0:** RAGAS (Python, richer
metrics, second-language signal) vs TS eval (single toolchain). Default
recommendation: **RAGAS** for the headline metrics, since groundedness/faithfulness
scoring is its strength and it reads as real LLMOps.

---

## Cost estimate (monetary)

| Item | Tier | Cost |
|------|------|------|
| Hosting (Next.js demo) | Vercel Hobby | **$0** |
| Vector DB | Neon free (0.5 GB) or Qdrant Cloud free (1 GB) | **$0** |
| Embeddings — corpus ingest | OpenAI `text-embedding-3-small` @ $0.02/1M tok; corpus ~50–150k tok | **< $0.01** one-time, re-run on each ingest |
| Embeddings — per query | ~1 short embedding/query | **negligible** (~$0.000002/query) |
| Answer generation | Claude Sonnet ~2–4k input + ~400 output / query → **~$0.01–0.02/query** | scales with traffic |
| Eval runs (RAGAS, LLM-as-judge) | 48 Q × several metrics ≈ **$0.20–1.00 per full run** | per run during S5/S6 tuning |
| **Build-phase total** | iteration + ~10–30 eval runs | **~$2–8 one-time** |
| **Steady monthly** (handful of demo users) | | **~$0–5** |

**Cost-control levers (note in README):** cache identical queries; cap output
tokens; add per-IP rate limiting (e.g. Vercel KV / Upstash free tier) so a traffic
spike can't run up the Claude bill; use Sonnet not Opus for answers unless eval
shows Opus materially wins.

---

## Sessions

### S0 — Repo scaffold, decisions, deploy skeleton · `IN PROGRESS`
**Goal:** A deployable empty Next.js app + recorded key decisions, so later sessions
have a home.
**Prerequisites:** Anthropic + OpenAI API keys (prepaid credits loaded); GitHub +
Vercel access.
**Tasks:**
1. Create public repo `portfolio-rag` (standalone first — cleaner story; the widget
   gets embedded into the portfolio in S8). `npx create-next-app@latest` (TS, App
   Router, Tailwind).
2. Add deps: `ai` (Vercel AI SDK), `@ai-sdk/anthropic`, `@ai-sdk/openai`, a Postgres
   client (`postgres` or `@neondatabase/serverless`), `zod`.
3. Add `.env.example` with `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`.
   `.gitignore` `.env.local`.
4. Provision the vector DB now (Neon project, enable `pgvector`: `CREATE EXTENSION
   vector;`). Record the connection string in Vercel env vars (not committed).
5. Deploy the skeleton to Vercel; confirm the URL loads.
6. **Record decisions** in this doc's Handoff: vector DB choice, eval framework
   (RAGAS vs TS), embedding model, answer model.
**Definition of done:** Repo pushed, Vercel URL live (even if just the starter page),
vector DB reachable, decisions recorded.
**Handoff notes:**
```
Done:      Scaffolded Next.js 16.2.9 + React 19.2.4 app (TS, App Router, Tailwind v4,
           ESLint, no src-dir, alias @/*) in-place in this dir via create-next-app.
           Added deps: ai@^6, @ai-sdk/anthropic@^3, @ai-sdk/openai@^3,
           @neondatabase/serverless@^1.1, zod@^4. Created .env.example (ANTHROPIC_API_KEY,
           OPENAI_API_KEY, DATABASE_URL) and added `!.env.example` exception to .gitignore
           (create-next-app's `.env*` rule would otherwise ignore it). Set repo git identity
           to the GitHub noreply email (avoids the Vercel "blocked deploy" gotcha). `npm run
           build` passes. Created PUBLIC GitHub repo mominchaudhry/portfolio-rag and pushed main.
Files:     whole Next scaffold; .env.example; .gitignore (env exception); TRACKER.md
Decisions: see Decision log below — Neon pgvector / RAGAS / text-embedding-3-small /
           claude-sonnet-4-6 (all per the doc's recommended defaults).
Verify:    `nvm use 20 && npm install && npm run build` is clean; repo is live on GitHub.
Gotchas:   AGENTS.md in the repo warns Next 16 has breaking changes vs training data —
           read node_modules/next/dist/docs/ before writing route/UI code in S3/S4.
           create-next-app refuses to run if the dir is non-empty, so TRACKER.md was moved
           aside during scaffold and restored.
Next:      Two interactive steps remain before S0 is DONE (both need the user's browser login,
           can't be done headless):
             1. Neon: create a free project, run `CREATE EXTENSION vector;`, copy the pooled
                connection string into .env.local as DATABASE_URL (and later into Vercel env).
             2. Vercel: `npx vercel link` + `npx vercel --prod` (or connect the GitHub repo in
                the Vercel dashboard for auto-deploy). Add ANTHROPIC_API_KEY / OPENAI_API_KEY /
                DATABASE_URL to the Vercel project env. Then fill Live demo URL + Vector DB in
                Project facts and flip S0 → DONE.
```

---

### S1 — Assemble & version the corpus · `TODO`
**Goal:** A clean, chunk-ready markdown corpus of Momin's content committed to the repo.
**Prerequisites:** S0 done.
**Tasks:**
1. Create `/content` with markdown files: `bio.md`, `experience.md`, `projects.md`,
   `skills.md`, `resume.md`. Optionally a couple of short blog-style posts.
2. Source the text from the portfolio content layer
   (`/Users/momin/portfolio/src/lib/content/providers/local.ts` — profile, companies,
   projects, skills) and the hosted résumé
   (`https://momin-portfolio-data.s3.amazonaws.com/data/resume.pdf`).
3. Add light front-matter per file (`title`, `source`, `section`) so citations can
   render a human-readable label and link target.
4. Keep facts accurate and first-person where natural — this is the ground truth the
   evals will check against.
**Definition of done:** `/content/*.md` committed, covering bio, experience, projects,
skills, résumé. No secrets. Each file has front-matter usable for citation labels.
**Handoff notes:** _empty_

---

### S2 — Ingest pipeline: chunk → embed → store · `TODO`
**Goal:** A re-runnable script that loads `/content` into the vector DB.
**Prerequisites:** S1 done.
**Tasks:**
1. `scripts/ingest.ts` (run via `npm run ingest`): read markdown, **chunk** (start
   simple: ~500–800 token chunks with ~15% overlap, split on headings), attach
   metadata (source file, section, char range).
2. Embed each chunk with OpenAI `text-embedding-3-small`.
3. Create the table (`documents(id, content, metadata jsonb, embedding vector(1536))`)
   and an index (`ivfflat`/`hnsw` cosine). Upsert chunks idempotently (clear+reinsert
   or hash-keyed upsert).
4. Add a tiny `scripts/query.ts` to sanity-check retrieval from the CLI (print top-k
   for a sample question). Verify retrieval quality **manually** before moving on.
**Definition of done:** `npm run ingest` populates the DB; CLI query returns sensible
top-k chunks for 3–4 sample questions. Chunking params recorded in Handoff (they're a
baseline you'll ablate in S6).
**Handoff notes:** _empty_

---

### S3 — Retrieval + grounded generation (streaming + citations) · `TODO`
**Goal:** An API route that answers a question with a streamed, cited Claude response.
**Prerequisites:** S2 done.
**Tasks:**
1. `app/api/ask/route.ts`: embed the question → top-k similarity search → build a
   **grounded prompt** (system prompt instructs: answer only from context, cite
   chunk IDs, refuse if context insufficient).
2. Stream the answer with the Vercel AI SDK + `@ai-sdk/anthropic`.
3. **Citations:** return the retrieved chunks (id, source, section, snippet) alongside
   the stream so the UI can render inline citation links.
4. **Guardrail:** if max similarity < threshold (tune later), return a graceful "I
   don't have that info" — do not call the model to hallucinate. This refusal path is
   measured in S5.
5. Test via `curl`/a scratch page with answerable + unanswerable questions.
**Definition of done:** POST a question → streamed grounded answer with citation
metadata; low-confidence questions refuse cleanly. Manually verified on ~5 questions.
**Handoff notes:** _empty_

---

### S4 — Chat UI widget · `TODO`
**Goal:** A usable chat interface (foundation for the portfolio embed).
**Prerequisites:** S3 done.
**Tasks:**
1. Floating "Ask my portfolio" button → drawer/panel chat UI (use `useChat` from the
   AI SDK or a thin custom client over the `/api/ask` stream).
2. Stream tokens as they arrive; render **citations as links** to the relevant section
   (anchor or source label).
3. Empty state with 3–4 suggested questions (e.g. "Has Momin used AWS Lambda at
   scale?"). Loading + error states. Mobile-friendly.
4. Keep it a self-contained component so S8 can lift it into the portfolio with minimal
   change.
**Definition of done:** Working chat in the standalone app, streaming + clickable
citations, suggested questions, deployed to Vercel.
**Handoff notes:** _empty_

---

### S5 — Eval set + harness + baseline · `TODO` (the part that makes it stand out)
**Goal:** A versioned eval set and a one-command harness that prints a scorecard —
with the **baseline** numbers recorded.
**Prerequisites:** S3 done (S4 not required).
**Tasks:**
1. Hand-write `evals/portfolio_qa.jsonl` — **30–60 Q&A pairs**: a mix of clearly
   answerable questions (with reference answers / expected facts) and **deliberately
   unanswerable** ones (e.g. "What's Momin's GPA?", "Does he speak French?") for the
   refusal set.
2. Build the harness (`npm run eval`): run each question through the live pipeline,
   score with **RAGAS** (or chosen TS framework): **answer correctness, faithfulness/
   groundedness, context precision/recall**, plus a custom **refusal-accuracy** metric
   over the unanswerable set.
3. Print a scorecard table; write results to `evals/results/<timestamp>.json`.
4. **Record the baseline** numbers (naive chunking, no rerank) in this doc — they are
   the "before" for S6's before/after story.
**Definition of done:** `npm run eval` runs end-to-end and prints a scorecard; baseline
numbers committed and recorded in Handoff. Eval set covers answerable + unanswerable.
**Handoff notes:** _empty_

---

### S6 — Improve retrieval & capture the delta · `TODO`
**Goal:** A measurable before/after improvement, which is the headline metric.
**Prerequisites:** S5 done (baseline exists).
**Tasks:**
1. Pick 1–2 improvements with the biggest expected lift: **reranking** (e.g. Cohere
   Rerank free trial, or an LLM reranker), **semantic/structure-aware chunking**, or
   **hybrid (keyword + vector)** retrieval.
2. Implement behind a flag so baseline vs improved are both runnable.
3. Re-run `npm run eval`; **record the delta** (e.g. "answer correctness 72% → 90%").
4. Tune the refusal threshold from S3 using the unanswerable set; aim for high refusal
   accuracy with zero hallucinated facts.
5. Screenshot the scorecard for the portfolio card.
**Definition of done:** Improved config beats baseline on at least answer correctness
and/or faithfulness; delta recorded with real numbers; scorecard screenshot saved to
the repo.
**Handoff notes:** _empty_

---

### S7 — Polish, README, deploy · `TODO`
**Goal:** A repo a hiring manager would be impressed by.
**Prerequisites:** S4 + S6 done.
**Tasks:**
1. README: one-paragraph what/why · **architecture diagram** (Mermaid or image) ·
   "run it locally" steps (env, ingest, dev) · the **eval scorecard** (baseline →
   improved table) · cost/latency notes · the named pattern ("RAG with reranking +
   refusal guardrail, gated by a versioned eval suite").
2. Add p95 latency + ~$/query measurement (log timings; compute cost from token usage).
3. Final deploy to Vercel; confirm the public demo works end-to-end.
4. Add rate limiting (Upstash/Vercel KV free) to cap cost on a spike.
**Definition of done:** Public repo with full README + diagram + scorecard; live demo
URL works; latency + cost numbers reported. Update Project facts table.
**Handoff notes:** _empty_

---

### S8 — Embed into the portfolio + add project card · `TODO`
**Goal:** The assistant lives on the actual portfolio, and the project is listed.
**Prerequisites:** S7 done.
**Tasks:**
1. Lift the S4 widget into `/Users/momin/portfolio` (Node 20 — `nvm use 20`). Either
   call the standalone `portfolio-rag` API (CORS) or port the `/api/ask` route into the
   portfolio app. Recommend: keep retrieval in the standalone service, embed only the
   widget — cleaner separation, and the standalone repo stays the demo.
2. Add the project to `src/lib/content/providers/local.ts` — copy the **AI project
   template** at the top of the `projects` array (lines ~188–217). Set:
   `category: "ai"`, `featured: true`, a high `order` (e.g. 200), real `metrics[]`
   from the eval scorecard, and `links[]` to the repo + live demo.
3. Wire env vars on the portfolio's Vercel project. Verify the live portfolio answers a
   sample question with citations.
**Definition of done:** "Ask my portfolio" works on the live portfolio site; the
project appears as a featured AI card with metrics + repo/demo links. Project complete.
**Handoff notes:** _empty_

---

### S9 — Stretch · `optional/stretch`
Ideas (each its own session): nightly **CI eval job** that fails on regression (great
LLMOps signal) · conversation memory / follow-ups · "show your sources" expandable UI ·
full hybrid (BM25 + vector) retrieval · swap to an open embedding model and compare.

---

## Decision log
- **S0 (2026-06-13):**
  - **Vector DB:** Neon Postgres + `pgvector` (free tier, serverless driver
    `@neondatabase/serverless`). Reason: zero-cost, hosted, same Vercel-friendly stack;
    matches the doc's recommendation.
  - **Eval framework:** RAGAS (Python). Reason: richer groundedness/faithfulness metrics
    read as real LLMOps and add a second-language signal — the doc's default. Revisit at
    S5 if the Python toolchain proves friction-heavy (TS/`evalite` is the fallback).
  - **Embedding model:** OpenAI `text-embedding-3-small` (1536-dim, cheap).
  - **Answer model:** `claude-sonnet-4-6` (latest Sonnet); only move to `claude-opus-4-8`
    if S6 eval shows it materially wins (cost/latency tradeoff noted in the cost table).

## Open questions / blockers
- _none yet_
