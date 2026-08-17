import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";

// Impostazioni globali del sito, salvate nella tabella `settings` (key/value).
// L'admin le modifica dal pannello di amministrazione.

export const SETTING_KEYS = {
  registrationsOpen: "registrations_open",
  costPerMessageCents: "cost_per_message_cents",
} as const;

// Valori usati quando la chiave non esiste ancora nel database
const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.registrationsOpen]: "true",
  [SETTING_KEYS.costPerMessageCents]: "2", // 2 cent = €0,02 per messaggio
};

async function readSetting(key: string): Promise<string> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  return row?.value ?? DEFAULTS[key];
}

export async function getRegistrationsOpen(): Promise<boolean> {
  return (await readSetting(SETTING_KEYS.registrationsOpen)) === "true";
}

export async function getCostPerMessageCents(): Promise<number> {
  const raw = await readSetting(SETTING_KEYS.costPerMessageCents);
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : Number(DEFAULTS[SETTING_KEYS.costPerMessageCents]);
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.query.settings.findMany();
  const result = { ...DEFAULTS };
  for (const row of rows) result[row.key] = row.value;
  return result;
}
