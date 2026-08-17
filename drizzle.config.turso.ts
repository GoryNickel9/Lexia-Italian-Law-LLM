import { defineConfig } from "drizzle-kit";

// Schema utenti su Turso (registrazione e login).
export default defineConfig({
  schema: "./src/lib/users-schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "file:./users.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
