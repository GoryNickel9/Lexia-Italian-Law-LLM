import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chats, messages, users } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

// PATCH: modifica il credito di un utente.
// Body: { setBalanceCents?: number } imposta il credito assoluto,
//       { addCents?: number } aggiunge (o sottrae, se negativo) centesimi.
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Accesso riservato agli amministratori" }, { status: 403 });
  }

  const { userId } = await params;
  const body = await request.json().catch(() => null);

  // setBalanceCents imposta il credito assoluto; addCents aggiunge/sottrae
  // centesimi (con floor a 0). Il valore è sempre un intero >= 0.
  let setClause: { balanceCents: number | ReturnType<typeof sql> };
  if (typeof body?.setBalanceCents === "number" && Number.isInteger(body.setBalanceCents) && body.setBalanceCents >= 0) {
    setClause = { balanceCents: body.setBalanceCents };
  } else if (typeof body?.addCents === "number" && Number.isInteger(body.addCents)) {
    setClause = { balanceCents: sql`max(${users.balanceCents} + ${body.addCents}, 0)` };
  } else {
    return NextResponse.json(
      { error: "Fornisci setBalanceCents (intero >= 0) oppure addCents (intero)" },
      { status: 400 },
    );
  }

  const updated = await db
    .update(users)
    .set(setClause)
    .where(eq(users.id, userId))
    .returning({ id: users.id, balanceCents: users.balanceCents });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, balanceCents: updated[0].balanceCents });
}

// DELETE: elimina un account e tutte le sue chat e messaggi.
export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Accesso riservato agli amministratori" }, { status: 403 });
  }

  const { userId } = await params;
  if (userId === adminId) {
    return NextResponse.json({ error: "Non puoi eliminare il tuo account admin" }, { status: 400 });
  }

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  // eliminazione esplicita: non si affida al cascade di SQLite
  const userChats = await db.query.chats.findMany({
    where: eq(chats.userId, userId),
    columns: { id: true },
  });
  for (const chat of userChats) {
    await db.delete(messages).where(eq(messages.chatId, chat.id));
  }
  await db.delete(chats).where(eq(chats.userId, userId));
  await db.delete(users).where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
