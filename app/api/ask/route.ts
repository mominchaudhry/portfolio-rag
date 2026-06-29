/**
 * S3 — Retrieval + grounded generation (streaming + citations).
 *
 * POST a question → embed it → top-k similarity search over the pgvector corpus →
 * build a grounded prompt → stream Claude's answer via the AI Gateway, with the
 * retrieved chunks emitted as a `data-citations` part so the UI can render inline
 * citation links.
 *
 * Guardrail: if the best chunk's similarity is below SIMILARITY_THRESHOLD we refuse
 * WITHOUT calling the model — no context means no grounded answer, so we don't give
 * the model a chance to hallucinate. This refusal path is measured in S5/S6.
 *
 * Body accepts either:
 *   { "question": "..." }                      ← simple, for curl/testing
 *   { "messages": UIMessage[] }                ← what S4's useChat will send
 */
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  gateway,
  streamText,
  type UIMessage,
} from "ai";
import {
  ANSWER_MODEL,
  REFUSAL_TEXT,
  SIMILARITY_THRESHOLD,
  buildSystemPrompt,
  retrieve,
  type RetrievedChunk,
} from "@/lib/rag";
import type { AskUIMessage, Citation } from "@/lib/types";

export const maxDuration = 60;

/** Pull the latest user question out of either request shape. */
function extractQuestion(body: unknown): { question: string; messages: UIMessage[] } {
  if (body && typeof body === "object") {
    const b = body as { question?: unknown; messages?: unknown };

    if (typeof b.question === "string" && b.question.trim()) {
      const question = b.question.trim();
      return {
        question,
        messages: [{ id: "q", role: "user", parts: [{ type: "text", text: question }] }],
      };
    }

    if (Array.isArray(b.messages)) {
      const messages = b.messages as UIMessage[];
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const question = (lastUser?.parts ?? [])
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ")
        .trim();
      return { question, messages };
    }
  }
  return { question: "", messages: [] };
}

function toCitation(chunk: RetrievedChunk, n: number): Citation {
  return {
    n,
    id: chunk.id,
    sourceFile: chunk.metadata.sourceFile,
    title: chunk.metadata.title,
    section: chunk.metadata.section,
    heading: chunk.metadata.heading,
    source: chunk.metadata.source,
    similarity: chunk.similarity,
    snippet: chunk.content.replace(/\s+/g, " ").trim().slice(0, 200),
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { question, messages } = extractQuestion(body);
  if (!question) {
    return Response.json(
      { error: 'Missing question. Send { "question": "..." } or { "messages": [...] }.' },
      { status: 400 },
    );
  }

  let chunks: RetrievedChunk[];
  try {
    chunks = await retrieve(question);
  } catch (err) {
    console.error("Retrieval failed:", err);
    return Response.json({ error: "Retrieval failed" }, { status: 500 });
  }

  // Best cosine similarity among the retrieved chunks (hybrid RRF can reorder them, so
  // take the max rather than chunks[0]) — this is the guardrail input.
  const topSimilarity = chunks.reduce((m, c) => Math.max(m, c.similarity), 0);
  const grounded = topSimilarity >= SIMILARITY_THRESHOLD;

  const stream = createUIMessageStream<AskUIMessage>({
    onError: (error) => {
      console.error("Answer stream failed:", error);
      const msg = error instanceof Error ? error.message : String(error);
      // Surface the common free-tier gateway restriction in a readable way.
      if (/free tier|restricted|no_providers_available/i.test(msg)) {
        return "The answer model isn't available on the AI Gateway free tier. Add paid credits or set ANSWER_MODEL to a free-tier model.";
      }
      return "Sorry — something went wrong generating the answer.";
    },
    execute: async ({ writer }) => {
      // Guardrail: no sufficiently-relevant context → refuse without calling the model.
      if (!grounded) {
        const id = "refusal";
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: REFUSAL_TEXT });
        writer.write({ type: "text-end", id });
        return;
      }

      // Emit citations first so the UI has them before tokens stream in.
      // 1-indexed `n` matches the [1]/[2] markers in the grounded prompt.
      writer.write({
        type: "data-citations",
        data: chunks.map((c, i) => toCitation(c, i + 1)),
      });

      const result = streamText({
        model: gateway(ANSWER_MODEL),
        system: buildSystemPrompt(chunks),
        messages: await convertToModelMessages(messages),
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
