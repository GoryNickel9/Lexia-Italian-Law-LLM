import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";

export const runtime = "nodejs";

// Traduce gli errori più comuni in indicazioni azionabili; il resto finisce nei log.
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("non configurata")) return message;
  if (message.includes("no such table")) {
    return "La tabella users non esiste su Turso: esegui `npm run db:push:turso` con le variabili di produzione";
  }
  if (/unauthorized|invalid api key|authentication|401/i.test(message)) {
    return "Autenticazione Turso fallita: controlla TURSO_AUTH_TOKEN su Vercel";
  }
  return "Errore del server durante la registrazione: controlla i log della funzione su Vercel";
}

export async function POST(request: Request) {
  let body: { name?: unknown; email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Compila tutti i campi" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email non valida" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "La password deve avere almeno 8 caratteri" }, { status: 400 });
  }

  try {
    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) {
      return NextResponse.json({ error: "Esiste già un account con questa email" }, { status: 409 });
    }

    await db.insert(users).values({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Errore registrazione:", error);
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}
