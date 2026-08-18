import { NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { createUIMessageStream, createUIMessageStreamResponse, streamText, toUIMessageStream } from "ai";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chats, messages, users } from "@/lib/schema";
import { computeCostMillicents, getTokenPricing } from "@/lib/settings";
import { hermesModel, SYSTEM_PROMPT } from "@/lib/hermes";
import { formatLegalContext, legalUnavailableResponse, searchLocalCorpus } from "@/lib/legal";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HISTORY_MESSAGES = 40;

/** Estrae il testo di un messaggio UI (AI SDK: il contenuto è in `parts`). */
function getTextFromUiMessage(message: { parts?: unknown; content?: unknown }): string {
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((p): p is { type: string; text?: string } => typeof p === "object" && p !== null && "text" in p)
      .map((p) => p.text ?? "")
      .join("");
  }
  return typeof message.content === "string" ? message.content : "";
}

export async function POST(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { chatId } = await params;

  const body = await request.json().catch(() => null);
  const uiMessages = Array.isArray(body?.messages) ? body.messages : [];
  const lastUserMessage = [...uiMessages].reverse().find(
    (m: { role?: string }) => m.role === "user",
  );
  const userText = lastUserMessage ? getTextFromUiMessage(lastUserMessage).trim() : "";
  if (!userText) {
    return NextResponse.json({ error: "Messaggio vuoto" }, { status: 400 });
  }

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, session.user.id)),
  });
  if (!chat) {
    return NextResponse.json({ error: "Chat non trovata" }, { status: 404 });
  }

  // Crediti a token: il costo esatto si conosce solo a generazione conclusa
  // (token di input + output per milione). Tutti pagano, admin compresi.
  // Qui si verifica solo che ci sia credito residuo; l'addebito, con accumulo
  // dei millesimi sotto il centesimo, avviene in coda allo streaming.
  const pricing = await getTokenPricing();
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { balanceCents: true },
  });
  if ((user?.balanceCents ?? 0) <= 0) {
    return NextResponse.json(
      { error: "Crediti insufficienti: contatta l'amministratore per ricaricare il tuo credito" },
      { status: 402 },
    );
  }

  // Salva il messaggio dell'utente e, se è il primo, ricava il titolo della chat
  await db.insert(messages).values({ chatId, role: "user", content: userText });
  const updates: Partial<typeof chats.$inferInsert> = { updatedAt: new Date() };
  if (chat.title === "Nuova chat") {
    updates.title = userText.length > 60 ? `${userText.slice(0, 57).trimEnd()}…` : userText;
  }
  await db.update(chats).set(updates).where(eq(chats.id, chatId));

  // Storico dal database: non ci fidiamo mai dei messaggi inviati dal client
  const history = await db.query.messages.findMany({
    where: eq(messages.chatId, chatId),
    orderBy: asc(messages.createdAt),
    limit: MAX_HISTORY_MESSAGES,
  });

  // Il sito non lascia al profilo pubblico accesso a web/terminal/database:
  // il contesto normativo viene recuperato server-side dall'API read-only locale.
  let legalContext: string;
  try {
    const retrieved = await searchLocalCorpus(userText);
    legalContext = formatLegalContext(retrieved);
  } catch (error) {
    return legalUnavailableResponse(error);
  }

  const result = streamText({
    model: hermesModel,
    system: `${SYSTEM_PROMPT}\n\n${legalContext}`,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
    onEnd: async ({ text, usage }) => {
      try {
        const inputTokens = usage?.inputTokens ?? 0;
        const outputTokens = usage?.outputTokens ?? 0;
        const costMillicents = computeCostMillicents(inputTokens, outputTokens, pricing);

        await db.insert(messages).values({
          chatId,
          role: "assistant",
          content: text,
          inputTokens,
          outputTokens,
          costMillicents,
        });
        await db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));

        // Addebito a generazione conclusa. Il costo è spesso frazione di
        // centesimo: i millesimi vengono accumulati in unbilled_millicents e
        // solo i centesimi interi maturati vengono scalati dal saldo (mai sotto
        // zero). Un'unica UPDATE atomica; i CAST garantiscono aritmetica intera
        // (i parametri bind arrivano come REAL e senza cast il saldo diventerebbe
        // un numero decimale).
        if (costMillicents > 0) {
          await db
            .update(users)
            .set({
              balanceCents: sql`max(${users.balanceCents} - CAST((${users.unbilledMillicents} + ${costMillicents}) / 1000 AS INTEGER), 0)`,
              unbilledMillicents: sql`CAST((${users.unbilledMillicents} + ${costMillicents}) % 1000 AS INTEGER)`,
            })
            .where(eq(users.id, session.user.id));
        }
      } catch (error) {
        console.error("Errore durante il salvataggio della risposta:", error);
      }
    },
  });

  // Al flusso UI aggiungiamo in coda un data-part con il consumo token e il
  // costo, così la chat può mostrarli sotto la risposta appena termina.
  const uiStream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.merge(toUIMessageStream({ stream: result.stream }));
      try {
        const usage = await result.usage;
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        writer.write({
          type: "data-usage",
          data: {
            inputTokens,
            outputTokens,
            // Costo della risposta in millesimi di centesimo (anche admin:
            // l'esenzione è stata rimossa, tutti pagano)
            costMillicents: computeCostMillicents(inputTokens, outputTokens, pricing),
          },
        });
      } catch {
        // se l'usage non è disponibile la chat mostra solo la risposta
      }
    },
  });

  return createUIMessageStreamResponse({ stream: uiStream });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { chatId } = await params;
  // prima verifica la proprietà, poi cancella: i messaggi di una chat altrui non si toccano
  const [chat] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, session.user.id)));
  if (!chat) {
    return NextResponse.json({ error: "Chat non trovata" }, { status: 404 });
  }

  // eliminazione esplicita: non si affida al cascade di SQLite
  await db.delete(messages).where(eq(messages.chatId, chatId));
  await db.delete(chats).where(eq(chats.id, chatId));

  return NextResponse.json({ ok: true });
}
