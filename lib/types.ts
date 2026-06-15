/**
 * Shared client/server types for the chat stream.
 *
 * The /api/ask route streams a `data-citations` part alongside the answer text so the
 * S4 UI can render inline citation links. Typing the UIMessage here keeps the route
 * and the (future) `useChat` client in sync.
 */
import type { UIMessage } from "ai";

/** A retrieved chunk surfaced to the UI as a citation. `n` is the inline marker (`[n]`). */
export type Citation = {
  n: number;
  id: number;
  sourceFile: string;
  title: string;
  section: string;
  heading: string;
  /** Human-readable link target (portfolio section anchor / résumé URL). */
  source: string;
  similarity: number;
  snippet: string;
};

/** UIMessage with a single persistent `citations` data part. */
export type AskUIMessage = UIMessage<never, { citations: Citation[] }>;
