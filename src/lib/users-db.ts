import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as usersSchema from "@/lib/users-schema";

// Utenti (registrazione e login): Turso.
// Il client viene creato al primo uso, non all'import del modulo: il build di
// Vercel importa le route anche senza variabili d'ambiente e non deve fallire.
function createUsersDb() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL non configurata: impostala in .env.local (sviluppo) o nelle variabili d'ambiente su Vercel",
    );
  }

  return drizzle(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }), {
    schema: usersSchema,
  });
}

type UsersDb = ReturnType<typeof createUsersDb>;

let instance: UsersDb | undefined;

export const usersDb: UsersDb = new Proxy({} as UsersDb, {
  get(_target, prop) {
    instance ??= createUsersDb();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
  },
});
