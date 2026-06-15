import AskWidget from "./components/ask-widget";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 dark:bg-black">
      <main className="w-full max-w-2xl space-y-8">
        <div className="space-y-4">
          <span className="inline-flex items-center rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-white dark:text-zinc-900">
            RAG demo
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Ask My Portfolio
          </h1>
          <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            A cited, streaming assistant that answers questions about Momin Chaudhry&apos;s
            experience, projects, and skills — using retrieval-augmented generation over his
            own portfolio content. Answers are grounded in retrieved context with inline
            citations, and it refuses cleanly when the context doesn&apos;t cover a question.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">How it works</p>
          <p className="mt-2 leading-6">
            Your question is embedded and matched against a pgvector corpus of Momin&apos;s
            content. The top matches are passed to Claude as grounding context, and the
            answer streams back with links to the sources it used.
          </p>
        </div>

        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Tap{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            &ldquo;Ask my portfolio&rdquo;
          </span>{" "}
          in the bottom-right corner to start.
        </p>
      </main>

      <AskWidget />
    </div>
  );
}
