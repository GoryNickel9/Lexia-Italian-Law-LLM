"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import { formatEuroFromMillicents, formatTokens } from "@/lib/format";
import { PeakBadge } from "@/components/peak-badge";

type InitialMessage = {
  id: string;
  role: "user" | "assistant";
  parts: { type: "text"; text: string }[];
};

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  costMillicents?: number;
};

type VerificationItem = {
  citation: string;
  found: boolean;
  status?: string;
  title?: string;
  note?: string;
};

// Messaggio scritto nella schermata "nuova chat": viene inviato
// automaticamente appena questa pagina viene aperta.
const PENDING_MESSAGE_KEY = "lexia:pending-message";

export function Chat({
  chatId,
  chatTitle,
  initialMessages,
  initialUsages,
  creditsExhausted,
}: {
  chatId: string;
  chatTitle: string;
  initialMessages: InitialMessage[];
  initialUsages: Record<string, TokenUsage>;
  creditsExhausted: boolean;
}) {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const [input, setInput] = useState("");
  const autoSentRef = useRef(false);
  // Consumo delle risposte generate in questa sessione, arrivato dallo stream
  // al termine di ogni generazione (chiave: id del messaggio assistente).
  // Quello delle risposte storiche arriva invece dal database.
  const [liveUsages, setLiveUsages] = useState<Record<string, TokenUsage>>({});
  // Verifica delle citazioni nel corpus, arrivata dallo stream al termine di
  // ogni generazione (chiave: id del messaggio assistente)
  const [liveVerifications, setLiveVerifications] = useState<
    Record<string, VerificationItem[]>
  >({});

  const { messages, sendMessage, status, error, stop } = useChat({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: `/api/chat/${chatId}` }),
    onData: (part) => {
      if (part.type === "data-usage") {
        const usage = part.data as TokenUsage;
        const lastAssistant = [...messagesRef.current]
          .reverse()
          .find((m) => m.role === "assistant");
        if (lastAssistant) {
          setLiveUsages((prev) => ({ ...prev, [lastAssistant.id]: usage }));
        }
      } else if (part.type === "data-verification") {
        const items = part.data as VerificationItem[];
        const lastAssistant = [...messagesRef.current]
          .reverse()
          .find((m) => m.role === "assistant");
        if (lastAssistant) {
          setLiveVerifications((prev) => ({ ...prev, [lastAssistant.id]: items }));
        }
      }
    },
    onFinish: () => {
      // Aggiorna sidebar: titolo della chat e credito residuo
      router.refresh();
    },
  });

  // Il data-part arriva a stream concluso: serve l'ultimo messaggio assistente
  // senza dipendere da una closure stantia di `messages`
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";

  // Auto-scroll a fondo pagina, ma solo se l'utente non è risalito: durante lo
  // streaming un nuovo messaggio (o risposta corta) porta sempre in fondo,
  // i chunk di una generazione in corso solo quando si è già vicini al fondo,
  // altrimenti lo scroll forzato contrasta il dito/touch dell'utente.
  useEffect(() => {
    const el = scrollAreaRef.current;
    const nearBottom =
      !el || el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (messages.length !== prevMessageCountRef.current || nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  // Invio automatico del messaggio scritto nella schermata "nuova chat"
  useEffect(() => {
    if (autoSentRef.current || messages.length > 0 || busy || creditsExhausted) return;
    autoSentRef.current = true;
    let text: string | null = null;
    try {
      text = sessionStorage.getItem(PENDING_MESSAGE_KEY);
      if (text) sessionStorage.removeItem(PENDING_MESSAGE_KEY);
    } catch {
      return;
    }
    if (text?.trim()) {
      void sendMessage({ text: text.trim() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || busy || creditsExhausted) return;
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
    <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4">
      <header className="flex items-center justify-between gap-3 border-b border-line py-3">
        <h1 className="truncate text-sm font-medium">{chatTitle}</h1>
        <PeakBadge />
      </header>

      <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-y-auto py-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-line p-10 text-center">
            <h2 className="text-lg font-semibold">Lexia</h2>
            <p className="mt-2 max-w-md text-sm text-muted">
              Chiedimi qualcosa sul diritto italiano: leggi, codici, giurisprudenza,
              procedure. Rispondo solo a domande in questo ambito.
            </p>
            <p className="mt-3 text-xs text-muted">
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
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-accent-foreground">
                      {textParts.map((part) => part.text).join("")}
                    </div>
                  </div>
                );
              }

              // Consumo token: dal database per i messaggi storici, dallo
              // stream per le risposte generate in questa sessione
              const usage = initialUsages[message.id] ?? liveUsages[message.id];

              return (
                <div key={message.id} className="flex justify-start">
                  <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-line bg-card px-4 py-2.5 text-sm leading-relaxed">
                    {textParts.map((part, i) => (
                      <div key={i} className="markdown">
                        <ReactMarkdown>{part.text}</ReactMarkdown>
                      </div>
                    ))}
                    {usage && (
                      <p className="mt-1.5 border-t border-line pt-1.5 text-[11px] text-muted">
                        Input: {formatTokens(usage.inputTokens)} token · Output:{" "}
                        {formatTokens(usage.outputTokens)} token
                        {usage.costMillicents !== undefined &&
                          ` · Costo: ${formatEuroFromMillicents(usage.costMillicents)}`}
                      </p>
                    )}
                    {liveVerifications[message.id]?.length ? (
                      <div className="mt-1.5 border-t border-line pt-1.5 text-[11px] leading-relaxed text-muted">
                        <p className="font-medium">Verifica nel corpus Hermes Legal</p>
                        {liveVerifications[message.id].map((v, i) => (
                          <p key={i}>
                            {v.found
                              ? v.status === "abrogato"
                                ? "⚠️"
                                : "✅"
                              : "❌"}{" "}
                            {v.citation} —{" "}
                            {v.found
                              ? `${v.status ?? "vigente"}${v.title ? ` (${v.title})` : ""}${v.note ? ` — ${v.note}` : ""}`
                              : (v.note ?? "non verificata")}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {creditsExhausted ? (
        <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          Crediti esauriti: il credito viene scalato in base ai token di input e
          output effettivamente utilizzati. Contatta l&apos;amministratore per
          ricaricare il tuo credito.
        </p>
      ) : error ? (
        <p className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          Errore durante la generazione della risposta. Riprova.
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="sticky bottom-0 flex items-end gap-2 border-t border-line bg-background py-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            creditsExhausted ? "Crediti esauriti" : "Scrivi una domanda sul diritto italiano…"
          }
          rows={1}
          disabled={creditsExhausted}
          className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-line bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:opacity-60"
        />
        {busy ? (
          <button
            type="button"
            onClick={stop}
            className="h-11 shrink-0 rounded-xl border border-line px-4 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || creditsExhausted}
            className="h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Invia
          </button>
        )}
      </form>
    </main>
  );
}
