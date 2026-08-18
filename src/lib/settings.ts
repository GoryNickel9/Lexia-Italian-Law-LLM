import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";

// Impostazioni globali del sito, salvate nella tabella `settings` (key/value).
// L'admin le modifica dal pannello di amministrazione.

export const SETTING_KEYS = {
  registrationsOpen: "registrations_open",
  // Tariffazione a token: prezzi in MILLESIMI DI CENTESIMO (mc) per milione di
  // token. 1 mc = 1/1000 di centesimo = 1/100000 €, così sono possibili prezzi
  // come €0,014 per milione (= 1400 mc).
  inputPricePerMillionMc: "input_price_per_million_mc",
  outputPricePerMillionMc: "output_price_per_million_mc",
} as const;

// Valori usati quando la chiave non esiste ancora nel database
const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.registrationsOpen]: "true",
  [SETTING_KEYS.inputPricePerMillionMc]: "200000", // €2,000 / milione di token di input
  [SETTING_KEYS.outputPricePerMillionMc]: "600000", // €6,000 / milione di token di output
};

async function readSetting(key: string): Promise<string> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  return row?.value ?? DEFAULTS[key];
}

function defaultInt(key: string): number {
  return Number.parseInt(DEFAULTS[key], 10) || 0;
}

export async function getRegistrationsOpen(): Promise<boolean> {
  return (await readSetting(SETTING_KEYS.registrationsOpen)) === "true";
}

/** Prezzi attivi in millesimi di centesimo per milione di token (input e output). */
export async function getTokenPricing(): Promise<{
  inputPricePerMillionMc: number;
  outputPricePerMillionMc: number;
}> {
  const [inputRaw, outputRaw] = await Promise.all([
    readSetting(SETTING_KEYS.inputPricePerMillionMc),
    readSetting(SETTING_KEYS.outputPricePerMillionMc),
  ]);
  const input = Number.parseInt(inputRaw, 10);
  const output = Number.parseInt(outputRaw, 10);
  return {
    inputPricePerMillionMc:
      Number.isFinite(input) && input >= 0 ? input : defaultInt(SETTING_KEYS.inputPricePerMillionMc),
    outputPricePerMillionMc:
      Number.isFinite(output) && output >= 0 ? output : defaultInt(SETTING_KEYS.outputPricePerMillionMc),
  };
}

/** Costo di una risposta in millesimi di centesimo (spesso una frazione di centesimo). */
export function computeCostMillicents(
  inputTokens: number,
  outputTokens: number,
  pricing: { inputPricePerMillionMc: number; outputPricePerMillionMc: number },
): number {
  const input = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const output = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;
  const mc =
    (input * pricing.inputPricePerMillionMc + output * pricing.outputPricePerMillionMc) / 1_000_000;
  return Math.round(mc);
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
