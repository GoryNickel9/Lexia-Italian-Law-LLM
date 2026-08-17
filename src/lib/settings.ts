import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";

// Impostazioni globali del sito, salvate nella tabella `settings` (key/value).
// L'admin le modifica dal pannello di amministrazione.

export const SETTING_KEYS = {
  registrationsOpen: "registrations_open",
  // Tariffazione a token, in centesimi di euro per milione di token
  inputCostPerMillionCents: "input_cost_per_million_cents",
  outputCostPerMillionCents: "output_cost_per_million_cents",
} as const;

// Valori usati quando la chiave non esiste ancora nel database
const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.registrationsOpen]: "true",
  [SETTING_KEYS.inputCostPerMillionCents]: "200", // €2,00 / milione di token di input
  [SETTING_KEYS.outputCostPerMillionCents]: "600", // €6,00 / milione di token di output
};

async function readSetting(key: string): Promise<string> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  return row?.value ?? DEFAULTS[key];
}

function readIntSetting(key: string): number {
  // lettura sincrona dal cache dei default: usata solo per i default numerici
  return Number.parseInt(DEFAULTS[key], 10) || 0;
}

export async function getRegistrationsOpen(): Promise<boolean> {
  return (await readSetting(SETTING_KEYS.registrationsOpen)) === "true";
}

/** Prezzi attivi in centesimi per milione di token (input e output). */
export async function getTokenPricing(): Promise<{
  inputCostPerMillionCents: number;
  outputCostPerMillionCents: number;
}> {
  const [inputRaw, outputRaw] = await Promise.all([
    readSetting(SETTING_KEYS.inputCostPerMillionCents),
    readSetting(SETTING_KEYS.outputCostPerMillionCents),
  ]);
  const input = Number.parseInt(inputRaw, 10);
  const output = Number.parseInt(outputRaw, 10);
  return {
    inputCostPerMillionCents:
      Number.isFinite(input) && input >= 0 ? input : readIntSetting(SETTING_KEYS.inputCostPerMillionCents),
    outputCostPerMillionCents:
      Number.isFinite(output) && output >= 0 ? output : readIntSetting(SETTING_KEYS.outputCostPerMillionCents),
  };
}

/** Costo in centesimi di una risposta, dato il consumo token e i prezzi correnti. */
export function computeCostCents(
  inputTokens: number,
  outputTokens: number,
  pricing: { inputCostPerMillionCents: number; outputCostPerMillionCents: number },
): number {
  const input = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const output = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;
  const cents =
    (input * pricing.inputCostPerMillionCents + output * pricing.outputCostPerMillionCents) / 1_000_000;
  return Math.round(cents);
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
