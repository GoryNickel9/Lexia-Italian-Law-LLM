import { defineConfig } from "drizzle-kit";

// Unico database del sito: Turso (utenti, chat, messaggi).
export default defineConfig({
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "file:./app.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
