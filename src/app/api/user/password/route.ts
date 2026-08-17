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
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Compila tutti i campi" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "La nuova password deve avere almeno 8 caratteri" }, { status: 400 });
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!user) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Password attuale non corretta" }, { status: 403 });
  }

  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(newPassword, 12) })
    .where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}
