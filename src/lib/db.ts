import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/lib/schema";

// Chat e messaggi: PostgreSQL sulla VPS.
// Il client viene creato al primo uso, non all'import del modulo: il build di
// Vercel importa le route anche senza variabili d'ambiente e non deve fallire.
function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL non configurata: impostala in .env.local (sviluppo) o nelle variabili d'ambiente su Vercel",
    );
  }

  return drizzle(
    new Pool({
      connectionString,
      // DATABASE_SSL=true per collegarsi al PostgreSQL della VPS via internet
      // (certificato self-signed: rejectUnauthorized false).
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      max: 5,
    }),
    { schema },
  );
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
