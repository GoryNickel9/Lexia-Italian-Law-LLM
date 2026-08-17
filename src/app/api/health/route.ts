import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

// Diagnostica: verifica i due collegamenti esterni del sito (Turso e Hermes).
// Uso: apri /api/health sul dominio del sito.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function checkTurso() {
  try {
    // conta le righe delle tre tabelle: verifica connessione e schema completo
    await db.get(
      sql`select
        (select count(*) from users) as users,
        (select count(*) from chats) as chats,
        (select count(*) from messages) as messages`,
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, errore: describe(error) };
  }
}

async function checkHermes() {
  const base = process.env.HERMES_BASE_URL;
  if (!base) return { ok: false, errore: "HERMES_BASE_URL non configurata" };
  try {
    const res = await fetch(new URL("models", base), {
      headers: process.env.HERMES_API_KEY
        ? { Authorization: `Bearer ${process.env.HERMES_API_KEY}` }
        : undefined,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok
      ? { ok: true }
      : { ok: false, errore: `HTTP ${res.status} da ${base}/models` };
  } catch (error) {
    return { ok: false, errore: describe(error) };
  }
}

export async function GET() {
  const [turso, hermes] = await Promise.all([checkTurso(), checkHermes()]);
  return NextResponse.json({ turso, hermes });
}
