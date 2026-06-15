"use client";

/**
 * S4 — "Ask my portfolio" chat widget.
 *
 * A self-contained floating chat panel that talks to POST /api/ask via the AI SDK
 * `useChat` hook (AI SDK v6: input is managed locally; `sendMessage({ text })` sends;
 * `status` drives loading/streaming UI). The route streams the answer text plus a
 * persistent `data-citations` part — we render the text with inline [n] markers turned
 * into links and list the cited sources beneath each answer.
 *
 * Kept deliberately self-contained (one file, no external UI deps, only an `apiUrl`
 * prop) so S8 can lift it into the portfolio with minimal change.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { AskUIMessage, Citation } from "@/lib/types";

const SUGGESTED_QUESTIONS = [
  "Has Momin used AWS at scale?",
  "What did Momin do at Clearbridge?",
  "What AI tools and skills does Momin have?",
  "What projects has Momin built?",
];

type AskWidgetProps = {
  /** Override the API endpoint (e.g. an absolute URL when embedded cross-origin in S8). */
  apiUrl?: string;
};

export default function AskWidget({ apiUrl = "/api/ask" }: AskWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  const transport = useMemo(() => new DefaultChatTransport({ api: apiUrl }), [apiUrl]);
  const { messages, sendMessage, status, error, stop, clearError } =
    useChat<AskUIMessage>({ transport });

  const busy = status === "submitted" || status === "streaming";
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the latest message in view as tokens stream in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (error) clearError();
    sendMessage({ text: trimmed });
    setInput("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="ask-panel"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105 hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        <ChatIcon className="h-4 w-4" />
        {open ? "Close" : "Ask my portfolio"}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          id="ask-panel"
          role="dialog"
          aria-label="Ask my portfolio"
          className="fixed inset-x-3 bottom-20 z-50 flex max-h-[75vh] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl sm:inset-x-auto sm:right-5 sm:w-[26rem] dark:border-zinc-800 dark:bg-zinc-950"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Ask my portfolio
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Grounded answers about Momin, with citations.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <EmptyState onPick={ask} />
            ) : (
              messages.map((m) => <MessageBubble key={m.id} message={m} />)
            )}

            {status === "submitted" && <TypingIndicator />}

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                Something went wrong. Please try again.
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={onSubmit}
            className="flex items-center gap-2 border-t border-zinc-100 p-3 dark:border-zinc-800"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about Momin's experience…"
              className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                className="shrink-0 rounded-full bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Send
              </button>
            )}
          </form>
        </div>
      )}
    </>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Hi! Ask me anything about Momin&apos;s experience, projects, and skills. Try one of these:
      </p>
      <div className="flex flex-col gap-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-900"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: AskUIMessage }) {
  const isUser = message.role === "user";

  const text = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

  // The route emits a single `data-citations` part holding the retrieved chunks.
  const citations = message.parts.flatMap((p) =>
    p.type === "data-citations" ? (p.data as Citation[]) : [],
  );

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-zinc-900">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-2">
        <div className="rounded-2xl rounded-bl-sm bg-zinc-100 px-3 py-2 text-sm leading-relaxed text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
          {renderWithCitations(text, citations)}
        </div>
        {citations.length > 0 && <Sources citations={citations} />}
      </div>
    </div>
  );
}

/** Render answer text, turning inline [n] markers into links to the cited source. */
function renderWithCitations(text: string, citations: Citation[]) {
  if (!citations.length) return text;
  const byN = new Map(citations.map((c) => [c.n, c]));
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = /^\[(\d+)\]$/.exec(part);
    if (match) {
      const c = byN.get(Number(match[1]));
      if (c) {
        return (
          <a
            key={i}
            href={c.source}
            target="_blank"
            rel="noopener noreferrer"
            title={`${c.title} › ${c.heading}`}
            className="mx-0.5 align-super text-[0.7em] font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            [{c.n}]
          </a>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

function Sources({ citations }: { citations: Citation[] }) {
  return (
    <div className="space-y-1 px-1">
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-zinc-400">
        Sources
      </p>
      <ul className="space-y-0.5">
        {citations.map((c) => (
          <li key={c.n} className="text-xs">
            <a
              href={c.source}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              [{c.n}] {c.title}
              {c.heading ? ` › ${c.heading}` : ""}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-zinc-100 px-3 py-3 dark:bg-zinc-800">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500"
      style={{ animationDelay: delay }}
    />
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
