import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/lib/schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL non configurata: aggiungila a .env.local");
}

// DATABASE_SSL=true per connettersi al PostgreSQL sulla VPS via internet
// (certificato self-signed: rejectUnauthorized false).
export const db = drizzle(
  new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: 5,
  }),
  { schema },
);
