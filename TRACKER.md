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
| Live demo URL | https://ask-my-portfolio-jjco5b2ux-mominchaudhrys-projects.vercel.app — deploy READY & renders, but **Vercel Deployment Protection (SSO) is ON** → 401 to the public. Flip OFF before sharing (S7). Vercel project `ask-my-portfolio` (`prj_k4hHPUckW5CKXz3SrkxdcqAVEOsJ`), GitHub repo connected for auto-deploy. |
| Vector DB | Neon Postgres 18.4 + `pgvector` 0.8.1 (free tier) — provisioned: project `super-credit-31396538` (`ask-my-portfolio`, aws-us-east-1). Reachability verified. `DATABASE_URL` in `.env.local`; **still needs adding to Vercel env** (do at S3 with the API keys). |
| Models | Answers: **S5 baseline ran on `anthropic/claude-sonnet-4.6`** (the intended baseline — UNBLOCKED by the $10 gateway top-up this session). `anthropic/claude-haiku-4.5` captured as the companion ablation (env-overridable via `ANSWER_MODEL`; still the runtime default in `lib/rag.ts` so the public widget keeps per-query cost low). Sonnet 4.6 stays the answer model (good enough at ~$0.003/Q); **Opus 4.8 is a back-pocket option only** (too expensive — test in S6 only if retrieval levers fall short). All via **Vercel AI Gateway** — NB gateway ids are DOTTED (`claude-sonnet-4.6`), not hyphenated. · Embeddings: `openai/text-embedding-3-small` **routed through the AI Gateway** (S2 — OpenAI-direct hit a quota wall) · Eval: **Promptfoo + Claude-as-judge** (judge fixed to `claude-sonnet-4.6`) |
| Credentials | **`AI_GATEWAY_API_KEY`** is the primary model credential (embeddings + answers + eval judge); in `.env.local`, **still needs adding to Vercel env** for the live demo (carry-over). **Gateway now has PAID credit — user topped up $10 (the $10 minimum) this session** → premium models unblocked + per-model rate limit lifted; a full 48-Q eval run ≈ $0.15 answers + judge, so ~$10 covers many S6 runs. Auto top-up stays OFF (credit just runs dry if exhausted). Direct `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` are optional fallback only. |
| Headline metric | **S6 improved (Sonnet 4.6):** answer correctness **100%** (↑ from 91.2%), faithfulness/groundedness **100%** (↑97.1%), context recall **100%** (↑91.2%), overall pass **97.9%** (↑89.6%) — while holding **0% hallucination + 100% refusal accuracy**. Cost flat (~$0.0037/Q) and p95 *faster* (5.8s→4.8s). Config: **chunking v2 (drop header chunks + heading-path prefix) + hybrid retrieval (vector + tsvector keyword, RRF)** · top-5 · thr 0.3. Per-lever before/after delta + the S5 baseline: `evals/README.md`; live scorecard `evals/results/latest.md`. |
| Overall status | **S6 DONE** — two retrieval levers, each flag-gated and measured independently against the S5 baseline (held judge/rubrics/eval-set fixed): **chunking v2** (+5.9 correctness) then **hybrid search** (→100% correctness/faithfulness/context-recall). Improved config is the shipped default (`CHUNK_STRATEGY=v2`, `HYBRID_SEARCH=1`); baseline reproducible via flags. Build/lint clean; results committed under `evals/results/`. Next: S7 (README + architecture diagram + scorecard, flip Vercel SSO off, deploy, add prod env vars + rate limiting). |

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
- Vercel AI Gateway (model routing, observability): https://vercel.com/docs/ai-gateway
- Anthropic API (messages, streaming): https://docs.anthropic.com
- OpenAI embeddings (`text-embedding-3-small`): https://platform.openai.com/docs/guides/embeddings
- Neon + pgvector: https://neon.tech/docs/extensions/pgvector
- Promptfoo (eval harness, CI gate): https://www.promptfoo.dev/docs
- Postgres full-text search (hybrid retrieval, S6): https://www.postgresql.org/docs/current/textsearch.html

---

## Status board

| Session | Goal | Status |
|---------|------|--------|
| S0 | Repo scaffold, decisions, Vercel deploy skeleton | DONE |
| S1 | Assemble & version the corpus (markdown) | DONE |
| S2 | Ingest pipeline: chunk → embed → store in vector DB | DONE |
| S3 | Retrieval + grounded generation (streaming + citations) | DONE |
| S4 | Chat UI widget | DONE |
| S5 | Eval set (30–60 Q&A) + harness + **baseline numbers** | DONE |
| S6 | Improve retrieval (rerank / better chunking / hybrid) + re-run evals; capture delta | DONE |
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
Vercel AI SDK for streaming via **Vercel AI Gateway** (model-as-string + free
cost/latency telemetry), Anthropic Claude (answers) + OpenAI embeddings,
pgvector on Neon (free). **Eval: Promptfoo (TS) with a Claude-as-judge** — single
toolchain in this TS/Next repo and a clean GitHub Actions CI gate (S9). (RAGAS was
the original S0 default; superseded 2026-06-14 — see Decision log S1.5.)

---

## Cost estimate (monetary)

| Item | Tier | Cost |
|------|------|------|
| Hosting (Next.js demo) | Vercel Hobby | **$0** |
| Vector DB | Neon free (0.5 GB) or Qdrant Cloud free (1 GB) | **$0** |
| Embeddings — corpus ingest | OpenAI `text-embedding-3-small` @ $0.02/1M tok; corpus ~50–150k tok | **< $0.01** one-time, re-run on each ingest |
| Embeddings — per query | ~1 short embedding/query | **negligible** (~$0.000002/query) |
| Answer generation | Claude Sonnet ~2–4k input + ~400 output / query → **~$0.01–0.02/query** | scales with traffic |
| Eval runs (Promptfoo, Claude-as-judge) | 48 Q × several metrics ≈ **$0.20–1.00 per full run** | per run during S5/S6 tuning |
| **Build-phase total** | iteration + ~10–30 eval runs | **~$2–8 one-time** |
| **Steady monthly** (handful of demo users) | | **~$0–5** |

**Cost-control levers (note in README):** cache identical queries; cap output
tokens; add per-IP rate limiting (e.g. Vercel KV / Upstash free tier) so a traffic
spike can't run up the Claude bill; use Sonnet not Opus for answers unless eval
shows Opus materially wins.

---

## Sessions

### S0 — Repo scaffold, decisions, deploy skeleton · `DONE`
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
Verify:    `nvm use 20 && npm run build` clean; repo live on GitHub; Vercel deploy READY
           (renders starter page); DB: node script reading DATABASE_URL → `select version()`
           returns Postgres 18.4 + pgvector 0.8.1.
Gotchas:   (a) AGENTS.md warns Next 16 has breaking changes vs training data — read
           node_modules/next/dist/docs/ before route/UI code in S3/S4. (b) create-next-app
           refuses a non-empty dir → TRACKER.md was moved aside during scaffold, restored after.
           (c) Vercel Deployment Protection (SSO) is ON for the team → the prod URL returns 401
           to the public (loads only when logged in). Not blocking S0; must be turned OFF before
           the demo is shareable (S7).
Done (S0 close-out, 2026-06-13): Vercel linked (project ask-my-portfolio,
           prj_k4hHPUckW5CKXz3SrkxdcqAVEOsJ; GitHub repo connected for auto-deploy) and skeleton
           deployed to prod (READY). Neon provisioned (project super-credit-31396538, Postgres 18.4,
           aws-us-east-1 to match Vercel iad1; pgvector 0.8.1; scale-to-zero on, autoscale 0.25–2 CU);
           DATABASE_URL in .env.local, reachability verified. All four DoD items met → S0 DONE.
Next:      Carry-over (NOT blocking S0):
             1. Vector index choice deferred to S2 (tiny corpus: exact scan vs HNSW cosine — pick
                for the "production" story).
             2. Add OPENAI_API_KEY (needed S2) + ANTHROPIC_API_KEY (needed S3) to .env.local, and
                add all three vars (incl. DATABASE_URL) to the Vercel project env before deploying a
                model-calling build.
             3. Before sharing the demo (S7): Vercel → Settings → Deployment Protection → turn
                Vercel Authentication OFF.
           Next agent starts S1 — assemble & version the corpus.
```

---

### S1 — Assemble & version the corpus · `DONE`
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
**Handoff notes:**
```
Done:      Created /content with 5 markdown files — bio.md, experience.md, projects.md,
           skills.md, resume.md. Each has YAML front-matter (title, source, section): `source`
           is a human-readable link target (portfolio section anchors, e.g.
           https://mominchaudhry.com/#about; resume.md points at the hosted PDF). Content is
           first-person where natural and chunk-friendly (headings per section). Facts sourced
           from the portfolio content layer (local.ts) + the hosted résumé PDF.
Files:     content/bio.md, content/experience.md, content/projects.md, content/skills.md,
           content/resume.md
Decisions: (a) Coinbase "Software Engineer (Backend), June 2022 — offer rescinded" entry from
           the résumé was OMITTED to match the live portfolio (user-confirmed). (b) Phone number
           (416) 317-6213 from the résumé OMITTED for PII (user-confirmed); kept email/GitHub/
           LinkedIn/website (already public). (c) School written as "Toronto Metropolitan
           University (formerly Ryerson University)" — current name, matches portfolio bio.
           (d) resume.md is the consolidated résumé-style doc; bio/experience/projects/skills are
           richer first-person expansions (intentional overlap aids retrieval). (e) The in-progress
           "Ask My Portfolio" RAG project is NOT in the corpus yet — it gets added to the portfolio
           in S8 and has no eval metrics until S5/S6.
Verify:    `ls content/` → 5 .md files; each starts with `---` front-matter (title/source/section).
           `grep -riE 'api[_-]?key|secret|password|postgres://|317-6213|coinbase' content/` → only
           legit "OpenAI API"/"Anthropic/Claude API" skill keywords, no secrets/PII/Coinbase.
Gotchas:   Résumé says "Ryerson University" (pre-rename) and lists Coinbase + phone — corpus
           intentionally diverges from the raw PDF on those three points (see Decisions). If S5
           builds a refusal/unanswerable eval set, "Did Momin work at Coinbase?" and "What's his
           phone number?" are natural unanswerable candidates given they're absent from the corpus.
Next:      S2 — ingest pipeline (chunk → embed → store in Neon pgvector). Add OPENAI_API_KEY to
           .env.local first (carry-over from S0).
```

---

### S2 — Ingest pipeline: chunk → embed → store · `DONE`
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
**Handoff notes:**
```
Done:      Built the re-runnable ingest pipeline + a CLI retrieval sanity check.
           `npm run ingest` → chunk content/*.md → embed → (re)create the `documents`
           table on Neon pgvector → insert. Verified end-to-end: 26 chunks embedded,
           26 rows in `documents`. `npm run query -- "<q>"` returns top-5 by cosine
           similarity; 4 sample Qs (AWS / AI skills / university / Clearbridge) all
           surfaced the correct chunk in top-k.
Files:     scripts/db.ts (Neon client + gateway embeddings + vector helpers),
           scripts/chunk.ts (front-matter parse + heading-aware chunking),
           scripts/ingest.ts, scripts/query.ts; package.json (ingest/query scripts +
           tsx devDep); .env.example (AI_GATEWAY_API_KEY documented).
Decisions: (a) BASELINE CHUNKING (ablate in S6): heading-aware — split body on `##`
           (h2); content before the first h2 = its own leading chunk; oversized
           sections windowed at MAX_TOKENS≈700 with OVERLAP≈100 tok (paragraph-aligned),
           tokens approximated as chars/4. Yielded 26 chunks (bio 5, experience 4,
           projects 5, resume 5, skills 7). Metadata per chunk: sourceFile, title,
           source(url), section, heading, chunkIndex, charStart/charEnd — drives S3
           citations. (b) INDEX: deliberate EXACT cosine KNN, NO approximate index
           (HNSW/IVFFlat) — ~26 vectors; approximate trades recall for a speed-up we
           don't need (per S1.5). Documented in scripts/ingest.ts header. (c) IDEMPOTENT
           via DROP+CREATE+reinsert each run — DB always matches current corpus+params.
           (d) Embeddings switched to `openai/text-embedding-3-small` via the AI Gateway
           (was OpenAI-direct) — see Decision log S2; same model/dims (1536), zero markup.
           (e) Runner: `node --env-file=.env.local --import tsx` (Node 20.19 built-in
           env loader + tsx; no dotenv dep).
Verify:    `nvm use 20 && npm run ingest` → "✓ Ingest complete — 26 rows in documents."
           `npm run query -- "Has Momin used AWS at scale?"` → top hit skills.md › Cloud (AWS).
           Direct DB check: `SELECT count(*) FROM documents;` → 26.
Gotchas:   (1) OpenAI-direct key is dead (insufficient_quota) — pipeline routes embeddings
           through Vercel AI Gateway via AI_GATEWAY_API_KEY (in .env.local). (2) AI Gateway
           FREE tier is rate-limited per model: firing ~6 embeds back-to-back (1 ingest batch
           + 5 queries) tripped a 429 rate_limit_exceeded on the 6th. Not a failure — but the
           S5 eval (48 Q) WILL need a small paid top-up or throttling/caching. (3) Retrieval
           artifact for S6: short intro/title chunks (bio intro, resume title line) rank high
           on many queries via generic overlap — candidate for S6 chunking/rerank tuning.
           (4) AI_GATEWAY_API_KEY not yet in Vercel project env — add at S3 with DATABASE_URL.
Next:      S3 — app/api/ask/route.ts: embed question → top-k similarity → grounded prompt →
           stream `anthropic/claude-sonnet-4-6` via the gateway with citations + a
           low-similarity refusal guardrail. Reuse scripts/db.ts patterns (neon + gateway).
```

---

### S3 — Retrieval + grounded generation (streaming + citations) · `DONE`
**Goal:** An API route that answers a question with a streamed, cited Claude response.
**Prerequisites:** S2 done.
**Tasks:**
1. `app/api/ask/route.ts`: embed the question → top-k similarity search → build a
   **grounded prompt** (system prompt instructs: answer only from context, cite
   chunk IDs, refuse if context insufficient).
2. Stream the answer with the Vercel AI SDK, routing the model through **Vercel AI Gateway**
   (`"anthropic/claude-sonnet-4-6"` string, not `@ai-sdk/anthropic` direct) — gives free
   cost/latency telemetry for S7 and one-line model swaps for the S6 ablation. See S1.5 decision.
3. **Citations:** return the retrieved chunks (id, source, section, snippet) alongside
   the stream so the UI can render inline citation links.
4. **Guardrail:** if max similarity < threshold (tune later), return a graceful "I
   don't have that info" — do not call the model to hallucinate. This refusal path is
   measured in S5.
5. Test via `curl`/a scratch page with answerable + unanswerable questions.
**Definition of done:** POST a question → streamed grounded answer with citation
metadata; low-confidence questions refuse cleanly. Manually verified on ~5 questions.
**Handoff notes:**
```
Done:      Built app/api/ask/route.ts — POST a question → embed → top-k pgvector KNN →
           grounded prompt → STREAM the answer via the AI Gateway, emitting the retrieved
           chunks as a `data-citations` UIMessage data part. Two-layer refusal guardrail:
           (1) hard — if best cosine sim < SIMILARITY_THRESHOLD (0.3) we refuse WITHOUT
           calling the model (no hallucination); (2) soft — the system prompt tells the
           model to refuse when context lacks the answer. Verified live on dev:3001:
           • "languages & cloud" → grounded answer w/ inline [3][4] + 5 citations (sim .45–.56)
           • "capital of France / GPA" → hard refusal, NO model call, NO citations ✓
           • Clearbridge Q via useChat-shaped {messages:[...]} body → grounded + cited ✓
           Citations are 1-indexed (`n`) to match the [1]/[2] inline markers.
Files:     app/api/ask/route.ts (route), lib/rag.ts (retrieve + embed + model consts +
           429 retry/backoff), lib/types.ts (Citation + AskUIMessage for S4 useChat),
           .env.example (ANSWER_MODEL override doc), tsconfig.json (build fix — see Gotchas).
Decisions: (a) ANSWER MODEL = `anthropic/claude-haiku-4.5` by default, NOT the tracker's
           Sonnet 4.6 baseline. Forced by reality: the AI Gateway FREE tier 403-blocks
           premium models (RestrictedModelsError) — Sonnet needs a paid top-up. Haiku 4.5 is
           free-tier OK, in-family (latest Claude), and already an S6 ablation candidate.
           One-line swap via `ANSWER_MODEL` env (set it to `anthropic/claude-sonnet-4.6` after
           topping up). The S5 baseline-model + top-up call is the user's (tracker already
           expected the top-up at S5). (b) GATEWAY MODEL IDS ARE DOTTED — `claude-sonnet-4.6`,
           NOT the hyphenated Anthropic-direct `claude-sonnet-4-6` the tracker/.env cited
           (verified vs the live gateway model list); fixed in docs. (c) Body accepts BOTH
           `{question}` (curl) and `{messages:[...]}` (S4 useChat) — retrieval uses the latest
           user text. (d) Citations streamed as a persistent `data-citations` part (not metadata)
           so S4 can render them from message.parts. (e) Added withRetry (1s/2s backoff on
           retryable 429s) around embeds to smooth the free-tier rate limit.
Verify:    `nvm use 20 && npm run build` clean; `npm run lint` clean. Then `npm run dev` and:
           curl -s -N -X POST localhost:3000/api/ask -H 'content-type: application/json' \
             -d '{"question":"What cloud services does Momin know?"}'
           → SSE: a `data-citations` part then `text-delta` tokens with inline [n] markers.
           Unanswerable (`"What is Momin'\''s GPA?"`) → the fixed refusal string, no citations.
           IMPORTANT: space requests ~80s+ apart on the free tier or you trip the embed 429.
Gotchas:   (1) BUILD WAS BROKEN coming into S3 — S2's scripts/*.ts use `.ts`-extension imports
           (fine under tsx) but `next build`'s typecheck rejected them (S2 only verified ingest/
           query, never `npm run build`). Fixed by adding `allowImportingTsExtensions:true` to
           tsconfig (valid w/ noEmit). Build now passes. (2) FREE-TIER GATEWAY is the recurring
           blocker: premium answer models 403; embeds + Haiku rate-limited to a small burst/min
           (429, retryable) — fine for manual use, but S5's 48-Q eval needs a paid top-up or
           heavy throttling/caching. (3) Neon returns the int `id` as a string in the citation
           JSON — harmless (it's just an identifier) but note if S4 does numeric compares.
Next:      S4 (chat UI) — wire `useChat<AskUIMessage>` to /api/ask; render text parts + the
           `data-citations` part as links (use Citation.source as href, [n] as the marker).
           OR S5 (eval+baseline; needs only S3) — but add the paid gateway top-up first, and
           record the baseline under whichever answer model the eval actually runs on.
```

---

### S4 — Chat UI widget · `DONE`
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
**Handoff notes:**
```
Done:      Built the "Ask my portfolio" chat widget and wired it into the app. A floating
           launcher (bottom-right) toggles a chat panel that talks to POST /api/ask via the
           AI SDK v6 `useChat` hook over DefaultChatTransport. Streams tokens live; renders
           the answer with inline [n] markers turned into links to each cited source, plus a
           "Sources" list under each answer. Empty state shows 4 suggested questions (AWS /
           Clearbridge / AI skills / projects); has submitted/streaming (typing dots) +
           Stop + error states; mobile-friendly (full-width panel on small screens, fixed
           card on sm+). Replaced the create-next-app starter page with a short landing that
           explains the demo and mounts the widget; set real <title>/description metadata.
           Verified end-to-end on dev:3000 — page renders + widget mounts; refusal path
           (no model call, no citations) and answerable path (data-citations part + streamed
           text with [n] markers) both return the exact stream shape the widget parses.
           `npm run build` + `npm run lint` clean.
Files:     app/components/ask-widget.tsx (the widget — self-contained, only an optional
           `apiUrl` prop for the S8 cross-origin embed), app/page.tsx (landing + mounts
           widget), app/layout.tsx (metadata title/description), package.json +
           package-lock.json (added @ai-sdk/react).
Decisions: (a) Used `@ai-sdk/react`'s `useChat` (NOT a hand-rolled fetch client): the S3
           route was purpose-built for it (AskUIMessage + the persistent `data-citations`
           part), so the hook reads message.parts directly. NB in AI SDK v6 `useChat` no
           longer manages input — input is local useState, send via `sendMessage({text})`,
           and `status` is 'submitted'|'streaming'|'ready'|'error'. (b) `@ai-sdk/react`
           wasn't installed (v6 split the React hooks out of `ai`); added @ai-sdk/react@3.0.207
           to match ai@6.0.205. (c) Citations: inline [n] become superscript links to
           Citation.source (opens the portfolio section / résumé), plus a Sources footer
           list per answer — both from the single `data-citations` part. (d) Self-contained in
           one file w/ no UI-lib deps (inline SVG icons, Tailwind classes) + an `apiUrl` prop
           so S8 can point it at the standalone service cross-origin with zero refactor.
           (e) Retrieval re-runs per turn on the latest user message (route already does this),
           so follow-ups are grounded; convertToModelMessages ignores the UI-only data parts.
Verify:    `nvm use 20 && npm run build` clean; `npm run lint` clean. `npm run dev`, open
           http://localhost:3000 → click "Ask my portfolio" → try a suggested question
           (streams a cited answer; [n] + Sources are clickable) and an unanswerable one
           ("What is the capital of France?" → clean refusal, no citations). Space model
           calls ~80s+ apart on the gateway free tier (embed 429 — see S3 gotchas).
Gotchas:   (1) Free-tier gateway limits still apply (premium answer models 403; embeds/Haiku
           rate-limited) — unchanged from S3; default answer model is still
           anthropic/claude-haiku-4.5. (2) DoD says "deployed to Vercel": pushing to main
           auto-deploys (GitHub connected), BUT Vercel Deployment Protection (SSO) is still ON
           → the prod URL is 401 to the public until it's flipped OFF in S7. The widget is
           fully verified locally. (3) AI_GATEWAY_API_KEY + DATABASE_URL must be in the Vercel
           project env for the deployed widget to actually answer (carry-over from S0/S3 — add
           before relying on the live demo).
Next:      S5 — eval set + Promptfoo harness + baseline numbers (needs only S3). BEFORE the
           48-Q run: add a small paid AI Gateway top-up (unblocks the Sonnet baseline + the
           per-model free-tier rate limit), then set ANSWER_MODEL=anthropic/claude-sonnet-4.6.
```

---

### S5 — Eval set + harness + baseline · `DONE` (the part that makes it stand out)
**Goal:** A versioned eval set and a one-command harness that prints a scorecard —
with the **baseline** numbers recorded.
**Prerequisites:** S3 done (S4 not required).
**Tasks:**
1. Hand-write `evals/portfolio_qa.jsonl` — **30–60 Q&A pairs**: a mix of clearly
   answerable questions (with reference answers / expected facts) and **deliberately
   unanswerable** ones (e.g. "What's Momin's GPA?", "Does he speak French?") for the
   refusal set.
2. Build the harness (`npm run eval`) with **Promptfoo (TS)** — see S1.5 decision (replaces
   RAGAS for single-toolchain + a clean S9 CI gate): run each question through the live
   pipeline and score **answer correctness, faithfulness/groundedness, context precision/
   recall** via a **Claude-as-judge** assertion, plus a custom **refusal-accuracy** metric
   over the unanswerable set (incl. the deliberately-omitted Coinbase/phone questions).
3. Print a scorecard table; write results to `evals/results/<timestamp>.json`.
4. **Record the baseline** numbers (naive chunking, no rerank) in this doc — they are
   the "before" for S6's before/after story.
**Definition of done:** `npm run eval` runs end-to-end and prints a scorecard; baseline
numbers committed and recorded in Handoff. Eval set covers answerable + unanswerable.
**Handoff notes:**
```
Done:      Built the versioned eval set + a one-command Promptfoo harness + recorded the
           baseline on TWO answer models. `evals/portfolio_qa.jsonl` = 48 Q (34 answerable
           w/ reference answer + expected source file; 14 deliberately UNANSWERABLE — GPA,
           phone, Coinbase, French, certs, off-topic, etc.). `npm run eval` runs each Q
           through the REAL pipeline (provider.ts imports lib/rag: embed → pgvector top-k →
           grounded prompt → generate, incl. the hard refusal guardrail), scores it with
           Claude-as-judge, writes evals/results/<ts>-<model>.json + .scorecard.json, and
           prints a scorecard. Ran the full 48-Q eval on claude-sonnet-4.6 (canonical
           baseline) AND claude-haiku-4.5 (companion ablation); judge fixed to sonnet-4.6.

           BASELINE (Sonnet 4.6 · heading chunking · exact KNN top-5 · no rerank · thr 0.3):
             Answer correctness    91.2%   |  Faithfulness/groundedness  97.1%
             Context recall        91.2%   |  Retrieval hit (exp source) 97.1%
             Answered (no false-refuse) 100%  |  Refusal accuracy        100%
             Hallucination rate    0%      |  Overall pass rate          89.6%
             Cost $0.0031/Q (total $0.147) |  Latency p50 2949 / p95 5841 ms
           Companion (Haiku 4.5): correctness 82.4%, all else equal, $0.0010/Q, p95 3200ms.
           Full table + reading + failure analysis in evals/README.md.
Files:     evals/portfolio_qa.jsonl, evals/promptfooconfig.yaml, evals/provider.ts,
           evals/tests.ts, evals/asserts.ts, evals/run.ts, evals/README.md,
           evals/results/*.json (2 raw + 2 scorecards); package.json (`npm run eval`);
           lib/rag.ts (extracted REFUSAL_TEXT + buildSystemPrompt so route + eval share one
           prompt); app/api/ask/route.ts (imports them — no behaviour change).
Decisions: (a) BASELINE MODEL = claude-sonnet-4.6 (the intended baseline) — user topped up
           $10 of AI Gateway credit this session, unblocking it (the free-tier 403 is gone).
           Captured Haiku 4.5 alongside as the cheap S6 model ablation (one ANSWER_MODEL env
           swap) — gives a real cost/quality comparison now. Judge fixed to sonnet-4.6 across
           both for a fair comparison. (b) CUSTOM Claude-judge for faithfulness + context-recall
           (evals/asserts.ts) instead of promptfoo's built-in context-faithfulness/-recall:
           the built-ins decompose answers into claims and mis-scored short factual answers
           (graded "Momin is based in Toronto, Canada" as 0% faithful). Custom judges see
           metadata.context directly + ignore [n] markers → reliable. Correctness + refusal use
           promptfoo's native llm-rubric (worked fine). (c) Retrieved context reaches the judges
           via `contextTransform: context.metadata.context` (the provider returns the chunk text
           in metadata). (d) run.ts maps componentResults to metric names BY POSITION per type —
           promptfoo drops the `metric` field on `javascript` assertions in its JSON output.
           (e) Self-preference caveat: Sonnet judging Sonnet may slightly inflate that row;
           Haiku is judged by Sonnet (no self-bias) and the gap is consistent with correctness.
Verify:    `nvm use 20`; `ANSWER_MODEL=anthropic/claude-sonnet-4.6 npm run eval` → prints the
           scorecard above (±1–2 pts judge variance) and writes evals/results/. Quick check:
           `npm run eval -- --filter-pattern 'unans-' ` → refusal set, expect ~100% refusal /
           0% hallucination. `npm run build` + `npm run lint` clean.
Gotchas:   (1) The spawned promptfoo child needs the tsx loader — run.ts sets NODE_OPTIONS=
           '--import tsx' on it (the parent's --import tsx doesn't carry into the child). (2) The
           48-Q eval makes ~150 gateway calls; needs PAID credit (free tier 403s premium models
           + rate-limits) — the $10 top-up covers it (a full run ≈ $0.15 answers + judge). Auto
           top-up is OFF; credit just runs dry if exhausted. (3) Baseline failures are almost all
           RETRIEVAL-bound: short heading/intro chunks out-rank detail chunks (the S2 artifact),
           e.g. "What companies has Momin worked at?" pulls the bare "Work Experience" header.
           This is the precise thing S6 (hybrid search + rerank) should fix — clean before/after.
           (4) retrieval_hit slightly understates because corpus content is duplicated across
           files (DB skills live in both skills.md and resume.md) — deterministic exact-source
           match, fine as a proxy. (5) Promptfoo 0.120.19 prints a "newer version" banner — cosmetic.
Next:      S6 — improve retrieval (hybrid pgvector + tsvector first, then a reranker) behind a
           flag; re-run `npm run eval` and record the delta vs this baseline (correctness +
           context-recall + retrieval-hit are the rows to move). Also: tune the 0.3 refusal
           threshold against the unanswerable set. Answer model stays Sonnet 4.6 (Haiku 4.5
           already captured); Opus 4.8 is back-pocket only (too expensive) — test in S6 ONLY if
           the retrieval levers don't reach the target.
```

---

### S6 — Improve retrieval & capture the delta · `DONE`
**Goal:** A measurable before/after improvement, which is the headline metric.
**Prerequisites:** S5 done (baseline exists).
**Working method:** put each retrieval/generation change **behind a flag** so baseline vs
improved are both runnable, and **re-run `npm run eval` after each lever** to capture a
clean per-lever delta. **Hold the eval methodology fixed** (judge = `claude-sonnet-4.6`,
rubrics, 0.5 pass thresholds) so the deltas reflect real quality, not measurement drift.
The S5 failures are almost entirely **retrieval-bound** (short header/intro chunks
out-ranking detail chunks), so order the levers by expected lift accordingly.

**Tasks — the levers to test (A = highest leverage):**

**A. Retrieval levers (do these first — this is where the S5 points are):**
1. **Chunking** (`scripts/chunk.ts`; baseline `MAX_TOKENS≈700`/`OVERLAP≈100`, split on `##`):
   drop/merge tiny header-only chunks, **prefix each body chunk with its heading path**, and
   ablate chunk size + overlap. Directly targets the dominant S5 failure (the bare
   *"Work Experience"* header chunk out-ranking the company details). Re-ingest only, ~free.
2. **Hybrid search** = pgvector + Postgres `tsvector` (keyword), fused (e.g. RRF). Free, in-DB —
   **do this first among the new-code levers.** Catches exact-term queries (companies, "$200/month").
3. **Reranker:** retrieve a wider top-N (~20) → rerank down to top-5. Cohere Rerank (free trial)
   or a Haiku LLM-reranker (stays in-stack, pennies/run).
4. **`TOP_K`** (`lib/rag.ts`, =5): cheap one-line ablation (try 8–10) — recall vs context dilution + token cost.
5. **Embedding model** (`EMBEDDING_MODEL`): A/B 3-small vs 3-large vs Gemini vs an open model
   (one swap + re-ingest). Record measured deltas + cost — don't pick "best" blind.
6. **Query rewriting** (optional/stretch): HyDE / multi-query for vague questions.

**B. Generation levers:**
7. **System prompt** (`app/api/ask/route.ts`): citation strictness, partial-context handling,
   conciseness (e.g. the one S5 faithfulness miss where the answer named "Momin" but the chunk didn't).
8. **Answer model: keep `claude-sonnet-4.6`** (S5 baseline: 91.2% correctness, ~$0.003/Q — good
   enough; Haiku 4.5 already captured as the cheaper companion). **Opus 4.8 is a BACK-POCKET option
   ONLY** — too expensive ($5/$25, ~1.6× Sonnet input / 1.7× output) and Sonnet is fine. Test it
   *only if* the retrieval levers above don't reach the target; do NOT run it as a default ablation.

**C. Guardrail lever:**
9. **Refusal threshold** (`SIMILARITY_THRESHOLD`, =0.3): tune against the unanswerable set — keep
   refusal accuracy high with **zero** hallucinated facts AND zero false-refusals on answerable.

**D. Corpus lever (sometimes beats algorithm tuning):**
10. **Content shape** (`content/*.md`): the bare "Work Experience" header and facts duplicated
   across `skills.md`/`resume.md` (which is what makes `retrieval_hit` understate) hurt retrieval —
   restructuring content is a legitimate lever.

11. After each lever: re-run `npm run eval`; **record the delta** (e.g. "correctness 91.2% → X%").
   The rows with the most headroom are **answer correctness, context-recall, and retrieval-hit**.
12. Screenshot the final scorecard for the portfolio card.
**Definition of done:** Improved config beats the S5 baseline on at least answer correctness
and/or faithfulness; **each lever's delta recorded with real numbers**; scorecard screenshot
saved to the repo. (Sonnet stays the answer model unless a back-pocket Opus test materially wins.)
**Handoff notes:**
```
Done:      Landed the two highest-leverage retrieval levers, each behind a flag, and recorded a
           clean per-lever before/after vs the S5 baseline (judge/rubrics/eval-set held fixed at
           Sonnet 4.6 so the deltas are real). HEADLINE (Sonnet 4.6, 48-Q): answer correctness
           91.2%→100%, faithfulness 97.1%→100%, context-recall 91.2%→100%, overall 89.6%→97.9% —
           all while holding 0% hallucination + 100% refusal + 0 false-refusals. Cost ~flat
           ($0.0031→$0.0037/Q); p95 latency *improved* 5.8s→4.8s (tighter context).

           Lever A — CHUNKING v2 (CHUNK_STRATEGY=v2, scripts/chunk.ts): drop header-only chunks
           (the bare "Work Experience"/"Projects" chunks that out-ranked detail — the exact S5
           failure) + prefix every chunk with its heading path ("Experience › Clearbridge … ").
           Δ vs baseline (both vector-only): correctness +5.9, context-recall +5.9 (retrieval_hit
           −3.0, recovered by B). Re-ingest only.
           Lever B — HYBRID search (HYBRID_SEARCH=1, lib/rag.ts): RRF fusion of vector KNN +
           Postgres tsvector keyword ranking. Δ vs chunking-only: correctness/faithfulness/
           context-recall all → 100%, overall +6.2. In-DB, $0.
Files:     scripts/chunk.ts (CHUNK_STRATEGY v2: drop header-only + heading-path prefix),
           scripts/ingest.ts (generated tsv column + GIN index; logs strategy),
           lib/rag.ts (HYBRID_SEARCH/TOP_K/SIMILARITY_THRESHOLD env flags + RRF hybrid query;
           guardrail now uses max cosine over retrieved chunks, not chunks[0]),
           app/api/ask/route.ts + evals/provider.ts (same max-cosine guardrail),
           evals/run.ts (dynamic config descriptor + writes results/latest.md scorecard),
           evals/README.md (S6 section + per-lever delta table), evals/results/* (2 new raw +
           scorecards + latest.md). S5 baseline scorecards kept as the "before".
Decisions: (a) Keyword arm uses OR semantics — websearch_to_tsquery ANDs every term
           ('compani' & 'momin' & 'work'), and the first-person corpus rarely contains "Momin"
           verbatim, so the AND query matched ZERO rows (hybrid silently == vector-only until
           fixed). Rewrite `&`→`|`; ts_rank_cd still rewards more/rarer term hits. (b) tsv is a
           GENERATED STORED column built at ingest, so hybrid is a query-time toggle — only
           chunking changes need a re-ingest. (c) Guardrail input changed from chunks[0].similarity
           to max cosine over retrieved chunks, because hybrid RRF can reorder so chunks[0] isn't
           the best cosine match (strictly more correct; baseline behaviour unchanged). (d) Levers
           A1+A2 only — they already hit 100% on the answer-quality rows, so the reranker (A3),
           TOP_K/embedding ablations (A4/A5), prompt/Opus (B), and corpus restructuring (D) were
           NOT needed (Opus stays back-pocket per the brief; not run). (e) Refusal threshold 0.3
           kept — eval proves 100% refusal/0% hallucination/0 false-refusals across all 3 configs,
           so it's already optimal; made env-tunable for future. (f) Shipped DEFAULTS are the
           improved config (CHUNK_STRATEGY=v2, HYBRID_SEARCH=1); baseline reproducible via flags
           (see evals/README "Retrieval levers"). Widget ANSWER_MODEL default stays Haiku 4.5 for
           per-query cost (unchanged); the headline/eval is Sonnet 4.6.
Verify:    `nvm use 20 && npm run build` + `npm run lint` clean. Reproduce the headline:
           `npm run ingest` (v2 default) then
           `ANSWER_MODEL=anthropic/claude-sonnet-4.6 npm run eval` → overall ~97.9%, correctness
           100% (±1–2 pts judge variance); scorecard in evals/results/latest.md. Baseline:
           `CHUNK_STRATEGY=baseline npm run ingest && CHUNK_STRATEGY=baseline HYBRID_SEARCH=0
           ANSWER_MODEL=anthropic/claude-sonnet-4.6 npm run eval`. NB re-run `npm run ingest`
           (v2) afterward to restore the shipped DB state.
Gotchas:   (1) DB now holds v2 chunks (24 rows, was 26) + a tsv column — if you ran the baseline
           repro, RE-INGEST with the v2 default before relying on the live pipeline/demo. (2) The
           one remaining retrieval_hit miss ("What databases…") is the corpus-duplication artifact
           (resume.md serves it correctly; expected skills.md) — correctness is 100%, so it's a
           proxy artifact, not a real miss; a corpus lever (D) for S7+ if desired. (3) "Scorecard
           screenshot" → committed as evals/results/latest.md (markdown table); a real PNG for the
           portfolio card is an S7 polish item. (4) Eval still needs paid gateway credit (~$0.18/
           full Sonnet run); two S6 runs spent ~$0.35 of the $10.
Next:      S7 — README + architecture diagram + the baseline→improved scorecard table; flip Vercel
           Deployment Protection OFF; add AI_GATEWAY_API_KEY + DATABASE_URL to Vercel env (carry-
           over) and RE-INGEST/redeploy; add rate limiting. The eval CI gate is S9.
```

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
  - **Eval framework:** ~~RAGAS (Python)~~ **SUPERSEDED 2026-06-14 → Promptfoo (TS).**
    Original reason was richer groundedness/faithfulness metrics + a second-language signal,
    but the Python toolchain is friction in an all-TS/Next repo. See the 2026-06-14 entry below.
  - **Embedding model:** OpenAI `text-embedding-3-small` (1536-dim, cheap).
  - **Answer model:** `claude-sonnet-4-6` (latest Sonnet); only move to `claude-opus-4-8`
    if S6 eval shows it materially wins (cost/latency tradeoff noted in the cost table).
- **S1.5 (2026-06-14) — tech-stack review (full options/tradeoff analysis):** Reframe — the
  corpus is tiny (~50–200 chunks), so infra choices optimize for *honest skill signaling, ~$0
  cost, a demoable hosted demo, and a production-instinct story*, NOT throughput. Decisions:
  - **Eval framework: Promptfoo (TS)** replaces RAGAS. Reason: single toolchain (no Python venv
    in a TS/Next repo), config lives in-repo, and — critically — a **GitHub Actions nightly CI
    eval gate (S9) is far cleaner in TS/Promptfoo**, which is the strongest LLMOps signal here.
    Still score correctness / faithfulness / refusal-accuracy via a **Claude-as-judge** assertion
    (writing the judge ourselves shows we understand the metrics RAGAS would import). OSS, $0 infra;
    pay only judge-model tokens (~$0.20–1 / full run). Fallback if we want the literal "RAGAS"
    keyword: keep RAGAS isolated in `/evals` with its own `requirements.txt` — not chosen.
  - **Model access: route through Vercel AI Gateway** (`"anthropic/claude-sonnet-4-6"` strings)
    instead of `@ai-sdk/anthropic` direct. Reason: free per-request cost+latency telemetry (feeds
    S7's measured $/query + p95), one-line model swaps for the S6 ablation, provider fallbacks,
    single key. Keep OpenAI embeddings (direct or via gateway).
  - **Embedding & answer model = S6 ABLATIONS, not baseline switches.** Baseline stays
    `text-embedding-3-small` ($0.02/1M; whole ingest <1¢) + `claude-sonnet-4-6` ($3/$15 per 1M).
    In S6, A/B them for the eval story: embeddings (3-small vs Gemini `gemini-embedding-001`
    $0.15/1M / vs an open model) and answers (Sonnet vs **Haiku 4.5** $1/$5 — often matches Sonnet
    on grounded extraction at ⅓ cost vs **Opus 4.8** $5/$25). Measured deltas > picking "best" blind.
  - **Vector DB: keep Neon pgvector** — best transferable skill, ~$0 (scale-to-zero), enables free
    in-DB hybrid search. Pinecone (2GB free) is the main alt but a thinner "managed-API" story.
    **Index note:** at ~200 vectors prefer **exact KNN over HNSW/IVFFlat** (approximate index trades
    recall for a speedup we don't need) — record this as a deliberate production call in S2.
  - **S6 retrieval improvements (both behind flags, measure both deltas):** (1) **hybrid search =
    pgvector + Postgres `tsvector`** — $0, in-DB, strongest free win; (2) a reranker — **Cohere Rerank
    (free trial key)** or a **Haiku LLM-reranker** (stays in-stack, pennies/run).
  - **Rate limiting (S7):** Vercel KV is discontinued → use **Upstash Redis (free, via Vercel
    Marketplace) + `@upstash/ratelimit`** per-IP (caps the only real cost: answer tokens), or a
    no-code **Vercel WAF rate-limit rule** + **BotID** (free, GA). Cache identical queries to cut cost.
  - **Cost reality:** truly ~$0 except answer-generation tokens (~$2–8 one-time build, ~$0–5/mo).
    A local open model for answers would be $0 but kills the hosted demo — not worth it.
  - **Kept as-is (already the right call):** Neon pgvector, `text-embedding-3-small`,
    `claude-sonnet-4-6`, AI SDK v6 `useChat` + shadcn for the UI, heading-aware chunking baseline.
- **S2 (2026-06-14):**
  - **Embeddings routed through Vercel AI Gateway** (`openai/text-embedding-3-small` via the
    `gateway` provider from `ai`) instead of OpenAI-direct (`@ai-sdk/openai`). Forced by reality:
    the OpenAI key returned `insufficient_quota` (429). The gateway path was already the S1.5
    plan for answers, so this just unifies embeddings onto the same credential. Same model,
    1536 dims, zero markup. **`AI_GATEWAY_API_KEY` is now the primary model credential.** Note:
    the AI SDK `ai-gateway` skill claims "embeddings need a direct SDK" — outdated; the installed
    `@ai-sdk/gateway` exposes `textEmbeddingModel` and routing worked (proven against the live API).
  - **Gateway billing learned the hard way:** requires a credit card on file before serving ANY
    request (even free-tier). Free tier = $5/mo, a model SUBSET, and per-model rate limits → a 429
    after ~6 rapid embeds. Auto top-up is OFF by default (no surprise charges; balance just runs
    dry → requests fail). S5's 48-question eval will need a small paid top-up or request throttling.
  - **Vector index = exact KNN, no ANN.** At ~26 vectors an HNSW/IVFFlat index trades recall for a
    speed-up we don't need (IVFFlat also wants more rows to train lists). Deliberate production call.
  - **Chunking baseline (ablate in S6):** heading-aware split on `##`, leading pre-h2 chunk kept,
    oversized sections windowed ≈700 tok / ≈100 tok overlap (chars/4 token proxy). 26 chunks total.
- **S3 (2026-06-14):**
  - **Answer model default = `anthropic/claude-haiku-4.5`** (env-overridable via `ANSWER_MODEL`),
    NOT the intended Sonnet 4.6 baseline. Forced: gateway free tier 403-blocks premium models. Haiku
    4.5 is free-tier OK, in-family, already an S6 ablation candidate → S3 is verifiable now; flip to
    Sonnet via env once topped up (do at S5 with the baseline).
  - **Gateway model ids are DOTTED** (`anthropic/claude-sonnet-4.6`), not the hyphenated Anthropic
    -direct id — verified vs the live gateway model list; corrected the tracker/.env references.
  - **Citations transport = a persistent `data-citations` UIMessage part** (via `createUIMessageStream`
    + `writer.merge(streamText(...).toUIMessageStream())`), 1-indexed to match the `[n]` inline
    markers — chosen over message-metadata so S4 can render them straight from `message.parts`.
  - **Refusal = two layers:** hard pre-model threshold (best cosine < 0.3 ⇒ refuse, no model call) +
    a soft in-prompt instruction. Threshold is a baseline tuned against the unanswerable set in S6.
  - **Build fix (carry-over gap):** added `allowImportingTsExtensions:true` to tsconfig so
    `next build`'s typecheck accepts S2's `.ts`-extension script imports (S2 never ran `npm run build`).
- **S5 (2026-06-14):**
  - **Baseline answer model = `claude-sonnet-4.6`** (the intended baseline). The free-tier 403 block
    was removed by the user's **$10 AI Gateway top-up** this session; **`claude-haiku-4.5` captured
    alongside** as the S6 model ablation (one `ANSWER_MODEL` env swap) for an immediate cost/quality
    comparison. **Judge fixed to `claude-sonnet-4.6`** across both runs (apples-to-apples; note the
    Sonnet-judges-Sonnet self-preference caveat — Haiku is judged by Sonnet with no self-bias).
  - **Eval = Promptfoo, but faithfulness + context-recall use a CUSTOM Claude judge** (`evals/asserts.ts`),
    not promptfoo's built-in `context-faithfulness`/`context-recall`: the built-ins decompose answers
    into claims and mis-scored short factual answers (graded "Momin is based in Toronto, Canada" as 0%
    faithful). Custom judges see the retrieved context (`metadata.context`) directly and ignore `[n]`
    markers. Correctness + refusal-accuracy use promptfoo's native `llm-rubric` (reliable). Retrieval-hit
    + answered are deterministic (read provider metadata). Context reaches the judges via
    `contextTransform: context.metadata.context`.
  - **Eval ≠ route drift avoided:** extracted `REFUSAL_TEXT` + `buildSystemPrompt` into `lib/rag.ts` so
    the eval provider and the production route share one grounded prompt + refusal string.
  - **Baseline recorded** (Sonnet 4.6): correctness 91.2% · faithfulness 97.1% · context-recall 91.2% ·
    retrieval-hit 97.1% · refusal-accuracy 100% · hallucination 0% · overall 89.6% · ~$0.003/Q · p95 5.8s.
    Failures are retrieval-bound (short header chunks out-rank detail) → the explicit S6 target.
- **S6 (2026-06-29) — two retrieval levers, each flag-gated, measured independently:**
  - **Chunking v2 (`CHUNK_STRATEGY=v2`):** drop header-only chunks + prefix each chunk with its
    heading path. The bare "Work Experience"/"Projects" header chunks were the dominant S5 failure
    (they out-ranked detail). Lever Δ vs baseline (vector-only): correctness +5.9, context-recall
    +5.9 (retrieval-hit −3.0, later recovered). Re-ingest only, ~free. Default is now v2; baseline
    reproducible with `CHUNK_STRATEGY=baseline` + re-ingest.
  - **Hybrid search (`HYBRID_SEARCH=1`):** RRF fusion of pgvector KNN + Postgres `tsvector` keyword
    ranking (S1.5's planned free in-DB win). The `tsv` is a GENERATED STORED column (built at
    ingest) so hybrid is a query-time toggle — only chunking changes need a re-ingest. Lever Δ vs
    chunking-only: correctness/faithfulness/context-recall all → **100%**, overall +6.2. Default on.
  - **Keyword OR fix (the bug that mattered):** `websearch_to_tsquery` ANDs every term, and the
    first-person corpus rarely contains the literal "Momin", so the AND query matched ZERO rows —
    hybrid was silently identical to vector-only until caught. Rewrite `&`→`|` (OR); `ts_rank_cd`
    still rewards rows hitting more/rarer terms.
  - **Guardrail input = max cosine over retrieved chunks** (was `chunks[0].similarity`): hybrid RRF
    can reorder so chunks[0] isn't the best cosine match. Strictly more correct; baseline unchanged.
  - **Refusal threshold 0.3 kept (env-tunable):** eval proves 100% refusal / 0% hallucination / 0
    false-refusals across all three configs → already optimal, no separate tune run needed.
  - **Stopped at A1+A2:** the answer-quality rows already hit 100%, so the reranker (A3),
    TOP_K/embedding ablations (A4/A5), generation/prompt + Opus (B; Opus stays back-pocket, NOT
    run), and corpus restructuring (D) were unnecessary. Sonnet 4.6 stays the eval/headline model;
    the widget's runtime ANSWER_MODEL default stays Haiku 4.5 for per-query cost.
  - **Improved result (Sonnet 4.6, vs baseline):** correctness 91.2%→100% · faithfulness 97.1%→100%
    · context-recall 91.2%→100% · retrieval-hit 97.1% (flat) · refusal 100% · hallucination 0% ·
    overall 89.6%→97.9% · cost ~$0.0037/Q (flat) · p95 5.8s→4.8s. Per-lever table in `evals/README.md`.

## Open questions / blockers
- **RESOLVED (S5): AI Gateway free-tier block is gone** — the user topped up **$10** (the minimum),
  so premium models (incl. `claude-sonnet-4.6`) are unblocked and the per-model rate limit is lifted.
  The S5 baseline ran on Sonnet 4.6 as intended. Remaining cost note: auto top-up is OFF, so credit
  just runs dry if exhausted; a full 48-Q eval run is ≈ $0.15 (answers) + judge tokens — budget for
  ~dozens of S6 runs. **Still open (deploy, not eval):** `AI_GATEWAY_API_KEY` + `DATABASE_URL` are not
  yet in the Vercel project env, so the live demo can't answer until added (carry-over for S7).
