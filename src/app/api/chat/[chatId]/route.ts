import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { createUIMessageStreamResponse, streamText, toUIMessageStream } from "ai";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chats, messages } from "@/lib/schema";
import { hermesModel, SYSTEM_PROMPT } from "@/lib/hermes";

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

  const result = streamText({
    model: hermesModel,
    system: SYSTEM_PROMPT,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
    onEnd: async ({ text }) => {
      try {
        await db.insert(messages).values({ chatId, role: "assistant", content: text });
        await db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));
      } catch (error) {
        console.error("Errore durante il salvataggio della risposta:", error);
      }
    },
  });

  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { chatId } = await params;
  // eliminazione esplicita: non si affida al cascade di SQLite
  await db.delete(messages).where(eq(messages.chatId, chatId));
  await db
    .delete(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}
