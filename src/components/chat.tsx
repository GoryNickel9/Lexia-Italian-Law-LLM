"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";

type InitialMessage = {
  id: string;
  role: "user" | "assistant";
  parts: { type: "text"; text: string }[];
};

export function Chat({
  chatId,
  chatTitle,
  initialMessages,
}: {
  chatId: string;
  chatTitle: string;
  initialMessages: InitialMessage[];
}) {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  const { messages, sendMessage, status, error, stop } = useChat({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: `/api/chat/${chatId}` }),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/chat/${chatId}`, { method: "DELETE" });
      router.push("/chats");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage({ text });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/chats"
            className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            title="Torna alle chat"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
          <h1 className="truncate text-sm font-medium text-zinc-900">{chatTitle}</h1>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
        >
          {deleting ? "Eliminazione…" : "Elimina"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto py-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center">
            <h2 className="text-lg font-semibold text-zinc-900">Giurista AI</h2>
            <p className="mt-2 max-w-md text-sm text-zinc-600">
              Chiedimi qualcosa sul diritto italiano: leggi, codici, giurisprudenza,
              procedure. Rispondo solo a domande in questo ambito.
            </p>
            <p className="mt-3 text-xs text-zinc-500">
              Non sostituisco la consulenza di un avvocato.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {messages.map((message) => {
              const textParts = message.parts.filter(
                (part) => part.type === "text" && part.text.length > 0,
              );
              if (textParts.length === 0) return null;

              if (message.role === "user") {
                return (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2.5 text-sm text-white">
                      {textParts.map((part) => part.text).join("")}
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id} className="flex justify-start">
                  <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-zinc-800">
                    {textParts.map((part, i) => (
                      <div key={i} className="markdown">
                        <ReactMarkdown>{part.text}</ReactMarkdown>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Errore durante la generazione della risposta. Riprova.
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="sticky bottom-0 flex items-end gap-2 border-t border-zinc-200 bg-white py-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scrivi una domanda sul diritto italiano…"
          rows={1}
          className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
        />
        {busy ? (
          <button
            type="button"
            onClick={stop}
            className="h-11 shrink-0 rounded-xl border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="h-11 shrink-0 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Invia
          </button>
        )}
      </form>
    </main>
  );
}
