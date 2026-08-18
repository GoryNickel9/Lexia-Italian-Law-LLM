import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chats, messages } from "@/lib/schema";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const list = await db.query.chats.findMany({
    where: eq(chats.userId, session.user.id),
    orderBy: desc(chats.updatedAt),
  });

  return NextResponse.json({ chats: list });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const [chat] = await db
    .insert(chats)
    .values({ userId: session.user.id })
    .returning({ id: chats.id });

  return NextResponse.json({ id: chat.id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  // new Set<string>: senza il generico, il Set su un valore `any` viene
  // inferito come Set<unknown> e inArray sotto non accetta l'array
  const chatIds = Array.isArray(body?.chatIds)
    ? [...new Set<string>(body.chatIds.filter((id: unknown): id is string => typeof id === "string"))]
    : [];
  if (chatIds.length === 0) {
    return NextResponse.json({ error: "Nessuna chat da eliminare" }, { status: 400 });
  }
  if (chatIds.length > 100) {
    return NextResponse.json({ error: "Massimo 100 chat per richiesta" }, { status: 400 });
  }

  // Filtra gli id di proprietà dell'utente: quelli arrivati dal client non sono affidabili
  const owned = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(inArray(chats.id, chatIds), eq(chats.userId, session.user.id)));

  if (owned.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const ownedIds = owned.map((chat) => chat.id);
  // eliminazione esplicita: non si affida al cascade di SQLite
  await db.delete(messages).where(inArray(messages.chatId, ownedIds));
  await db
    .delete(chats)
    .where(and(inArray(chats.id, ownedIds), eq(chats.userId, session.user.id)));

  return NextResponse.json({ ok: true, deleted: ownedIds.length });
}
