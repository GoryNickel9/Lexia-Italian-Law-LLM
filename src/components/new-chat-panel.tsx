"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Pannello centrale della schermata /chats: l'utente scrive subito la domanda,
// la chat viene creata al primo invio e il messaggio passa alla pagina della
// chat tramite sessionStorage, dove viene inviato automaticamente.
const PENDING_MESSAGE_KEY = "lexia:pending-message";

export function NewChatPanel() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const text = input.trim();
    if (!text || pending) return;

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/chats", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) {
        setError("Impossibile creare la chat. Riprova.");
        return;
      }
      try {
        sessionStorage.setItem(PENDING_MESSAGE_KEY, text);
      } catch {
        // senza sessionStorage il messaggio non viene inoltrato automaticamente
      }
      router.push(`/chats/${data.id}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Lexia</h1>
        <p className="mt-2 text-sm text-muted">
          Chiedimi qualcosa sul diritto italiano: leggi, codici, giurisprudenza,
          procedure. Rispondo solo a domande in questo ambito.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="mt-8 flex items-end gap-2 rounded-2xl border border-line bg-card p-3 shadow-sm"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scrivi una domanda sul diritto italiano…"
            rows={2}
            autoFocus
            className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-line bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
          />
          <button
            type="submit"
            disabled={!input.trim() || pending}
            className="h-11 shrink-0 rounded-xl bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Creazione…" : "Invia"}
          </button>
        </form>

        {error && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <p className="mt-6 text-xs text-muted">
          Non sostituisco la consulenza di un avvocato.
        </p>
      </div>
    </main>
  );
}
