/**
 * Custom assertions for the eval harness.
 *
 * The deterministic ones read the provider's structured metadata (set in
 * evals/provider.ts) so they cost nothing and can't drift. `judgeFaithfulness` is a
 * Claude-as-judge groundedness check that sees the retrieved context directly —
 * promptfoo's built-in `context-faithfulness` mis-scored short factual answers
 * (it scored "Momin is based in Toronto, Canada" as 0% faithful), so we run our own.
 */
import { gateway, generateText } from "ai";

type AssertContext = {
  vars?: Record<string, unknown>;
  providerResponse?: { metadata?: Record<string, unknown> };
};

type GradingResult = { pass: boolean; score: number; reason: string };

/** Judge model — fixed Sonnet 4.6 to match the llm-rubric grader in the config. */
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "anthropic/claude-sonnet-4.6";

/**
 * faithfulness (answerable): is every factual claim in the answer supported by the
 * retrieved context? Claude-as-judge over `metadata.context` (the chunks the answer
 * was generated from). A refusal makes no claims → vacuously faithful (correctness
 * catches wrong refusals separately).
 */
export async function judgeFaithfulness(
  output: string,
  context: AssertContext,
): Promise<GradingResult> {
  const retrieved = String(context.providerResponse?.metadata?.context ?? "");
  const question = String(context.vars?.question ?? "");
  if (!retrieved.trim()) {
    return { pass: false, score: 0, reason: "No retrieved context to check against." };
  }

  const prompt = `You are checking whether an assistant's ANSWER is grounded in the retrieved CONTEXT (no hallucination). Ignore bracketed citation markers like [1] or [2]. An answer that declines to answer makes no factual claims and is faithful.

QUESTION: ${question}

CONTEXT:
${retrieved}

ANSWER:
${output}

Is every factual claim in the ANSWER about Momin supported by the CONTEXT? Reply with ONLY a JSON object: {"faithful": true|false, "reason": "<one sentence>"}.`;

  return judgeBool(prompt, "faithful");
}

/**
 * context_recall (answerable): did retrieval pull context that actually contains the
 * information needed to answer? Claude-as-judge over `metadata.context` vs the
 * ground-truth reference answer. Replaces promptfoo's built-in context-recall, which
 * mis-scored short reference answers.
 */
export async function judgeContextRecall(
  _output: string,
  context: AssertContext,
): Promise<GradingResult> {
  const retrieved = String(context.providerResponse?.metadata?.context ?? "");
  const question = String(context.vars?.question ?? "");
  const expected = String(context.vars?.expected ?? "");
  if (!retrieved.trim()) {
    return { pass: false, score: 0, reason: "No retrieved context." };
  }

  const prompt = `You are checking whether retrieved CONTEXT contains the information needed to answer a QUESTION, using a REFERENCE answer as the ground truth.

QUESTION: ${question}

REFERENCE ANSWER: ${expected}

CONTEXT:
${retrieved}

Does the CONTEXT contain the facts needed to produce the REFERENCE answer? Reply with ONLY a JSON object: {"recalled": true|false, "reason": "<one sentence>"}.`;

  return judgeBool(prompt, "recalled");
}

/** Run a yes/no Claude judge that returns {"<key>": bool, "reason": string}. */
async function judgeBool(prompt: string, key: string): Promise<GradingResult> {
  const { text } = await generateText({ model: gateway(JUDGE_MODEL), prompt });
  const match = text.match(/\{[\s\S]*\}/);
  let pass = false;
  let reason = text.slice(0, 120);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      pass = parsed[key] === true;
      if (typeof parsed.reason === "string") reason = parsed.reason;
    } catch {
      /* keep defaults */
    }
  }
  return { pass, score: pass ? 1 : 0, reason };
}

/**
 * retrieval_hit (answerable only): did retrieval surface the chunk's expected source
 * file? A cheap, deterministic context-recall proxy that doesn't depend on the judge.
 */
export function retrievedExpectedSource(
  _output: string,
  context: AssertContext,
): GradingResult {
  const expected = String(context.vars?.expected_source ?? "");
  const sources = (context.providerResponse?.metadata?.citationSources ?? []) as string[];
  if (!expected) {
    return { pass: true, score: 1, reason: "No expected_source specified — skipped." };
  }
  const hit = sources.includes(expected);
  return {
    pass: hit,
    score: hit ? 1 : 0,
    reason: hit
      ? `Retrieved expected source "${expected}".`
      : `Expected source "${expected}" not in retrieved set [${sources.join(", ")}].`,
  };
}

/**
 * answered (answerable only): the pipeline actually produced a grounded answer rather
 * than tripping the hard similarity guardrail. Catches false refusals on questions the
 * corpus *can* answer.
 */
export function wasAnswered(_output: string, context: AssertContext): GradingResult {
  const md = context.providerResponse?.metadata ?? {};
  const answered = md.refused === false && md.calledModel === true;
  return {
    pass: answered,
    score: answered ? 1 : 0,
    reason: answered
      ? `Answered (top similarity ${Number(md.topSimilarity ?? 0).toFixed(3)}).`
      : `Did not answer — hard guardrail fired (top similarity ${Number(
          md.topSimilarity ?? 0,
        ).toFixed(3)} < threshold).`,
  };
}
