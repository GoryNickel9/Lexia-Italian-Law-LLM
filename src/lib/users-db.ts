import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as usersSchema from "@/lib/users-schema";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  throw new Error("TURSO_DATABASE_URL non configurata: aggiungila a .env.local");
}

export const usersDb = drizzle(
  createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }),
  { schema: usersSchema },
);
