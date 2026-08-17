import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";

export const runtime = "nodejs";

// Tema preferito dell'utente ("dark" | "light"): salvato nel database così la
// preferenza vale su tutti i dispositivi. Gli utenti non autenticati continuano
// a usare solo localStorage.
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (body?.theme !== "dark" && body?.theme !== "light") {
    return NextResponse.json({ error: "theme deve essere \"dark\" o \"light\"" }, { status: 400 });
  }

  await db.update(users).set({ theme: body.theme }).where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true });
}
