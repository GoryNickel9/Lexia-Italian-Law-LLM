import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const newEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";

  if (!newEmail || !currentPassword) {
    return NextResponse.json({ error: "Compila tutti i campi" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: "Email non valida" }, { status: 400 });
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!user) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Password attuale non corretta" }, { status: 403 });
  }

  if (newEmail === user.email) {
    return NextResponse.json({ error: "La nuova email è identica a quella attuale" }, { status: 400 });
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, newEmail) });
  if (existing) {
    return NextResponse.json({ error: "Esiste già un account con questa email" }, { status: 409 });
  }

  await db.update(users).set({ email: newEmail }).where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}
