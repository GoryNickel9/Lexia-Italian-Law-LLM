import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/schema";

// Unico database del sito: Turso (utenti, chat, messaggi).
// Il client viene creato al primo uso, non all'import del modulo: il build di
// Vercel importa le route anche senza variabili d'ambiente e non deve fallire.
function createDb() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL non configurata: impostala in .env.local (sviluppo) o nelle variabili d'ambiente su Vercel",
    );
  }

  return drizzle(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }), {
    schema,
  });
}

type Db = ReturnType<typeof createDb>;

let instance: Db | undefined;

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    instance ??= createDb();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
  },
});
