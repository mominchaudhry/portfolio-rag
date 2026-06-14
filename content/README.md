# Corpus — how to add or update content

This folder is the **knowledge base** the "Ask My Portfolio" assistant retrieves from.
Each `*.md` file is chunked, embedded, and stored in the vector DB by the ingest
pipeline. The corpus is designed to grow — adding material is a small, repeatable task.

> **TL;DR:** drop a new `*.md` file here (with front-matter) → run `npm run ingest` →
> (if past S5) add a few eval Q&A pairs and re-run `npm run eval`. That's it.

---

## File format

Every file starts with YAML front-matter, then markdown content:

```markdown
---
title: <human-readable title, used as the citation label>
source: <link target for the citation — a portfolio URL/anchor, or the source doc>
section: <short section name, e.g. About / Experience / Projects / Skills>
---

# Heading

First-person where natural. Use `##` headings per logical section — the ingester
chunks on headings, so good headings = good retrieval boundaries.
```

Current files and their `source` convention:

| File | `source` |
|------|----------|
| `bio.md` | `https://mominchaudhry.com/#about` |
| `experience.md` | `https://mominchaudhry.com/#experience` |
| `projects.md` | `https://mominchaudhry.com/#projects` |
| `skills.md` | `https://mominchaudhry.com/#skills` |
| `resume.md` | the hosted résumé PDF |

New files can use any sensible `source` (a portfolio anchor, a blog post URL, a repo).
Keep `title`/`section` short — they render as the citation label in the chat UI.

---

## Adding NEW content (a new topic/file)

1. **Create `content/<name>.md`** with the front-matter above. Good candidates:
   blog-style posts, a deeper write-up of a project, a "how I work" page, talks, etc.
2. **Keep facts accurate and first-person where natural** — this is the ground truth
   the evals check against. No secrets, no PII you don't want public (we deliberately
   omit the phone number; see the refusal note below).
3. **Re-run the ingest pipeline** (exists after S2):
   ```bash
   npm run ingest        # re-chunks + re-embeds the whole /content folder, idempotently
   ```
4. **Sanity-check retrieval** (CLI tool from S2):
   ```bash
   npx tsx scripts/query.ts "a question your new content should answer"
   ```
   Confirm the new chunks come back with sensible top-k results.
5. **Scan for secrets/PII** before committing:
   ```bash
   grep -riE 'api[_-]?key|secret|password|postgres://|sk-|[0-9]{3}-[0-9]{4}' content/
   ```
6. **Commit** `content/` (the pipeline reads files at ingest time — nothing else to wire up).

## Updating EXISTING content (e.g. you changed roles, added a project)

Same as above, minus step 1 — edit the relevant file, then `npm run ingest`. If you
update your **actual résumé PDF**, keep `resume.md` in sync (it mirrors that document).

---

## What you do NOT need to touch

Adding/changing corpus content requires **no code changes**. The retrieval route, the
chat UI, the embedding model, and the DB schema are all content-agnostic. More files
just means more chunks. This is why corpus expansion is safe to do at any time.

---

## The one coupling to remember: the eval set (S5/S6)

The eval harness (`evals/`, built in S5) is the only thing tied to *what's in* the
corpus. When you expand content, keep the evals honest:

- **Add a few answerable Q&A pairs** covering the new material to `evals/portfolio_qa.jsonl`,
  so coverage tracks the corpus.
- **Re-check the unanswerable / refusal set.** Those questions are unanswerable *because
  the fact isn't in the corpus*. If you add content that now answers one, move it out of
  the refusal set. (Example: "Did Momin work at Coinbase?" and "What's his phone number?"
  are currently in the refusal set **because we deliberately left them out** — see
  `TRACKER.md` → Decision log / S1 Handoff. Adding Coinbase to the corpus flips that.)
- **Re-run the harness and re-capture numbers:**
  ```bash
  npm run eval          # exists after S5; writes a scorecard to evals/results/
  ```
  The scorecard is the portfolio's headline metric. If you expand the corpus *after*
  capturing the baseline, just re-run — it's one command (that's the whole point).

### Timing guidance
- **Through S2–S4:** add content freely; nothing to re-baseline yet.
- **Right before S5:** do a "content pass" so the eval **baseline** is captured against a
  representative corpus (a richer corpus also makes the S6 rerank/hybrid before→after
  delta more meaningful — with very few files, retrieval is near-trivial).
- **After S7:** adding more = quick re-ingest + re-eval + (if numbers moved materially)
  refresh the README scorecard screenshot.

---

## Nice touch

Once *this* RAG project is built, add it to the corpus as a project (e.g. in
`projects.md` or its own file). The assistant being able to answer questions about
itself is a strong demo moment — and a natural place to cite the eval scorecard.

---

_See `TRACKER.md` for the full build plan and the Decision log (incl. the S1.5 stack
review). Corpus decisions for S1 — Coinbase entry and phone number deliberately omitted
— are recorded in the S1 Handoff notes there._
