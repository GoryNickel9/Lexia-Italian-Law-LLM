import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";
import { isPeakHour } from "@/lib/peak";

// Impostazioni globali del sito, salvate nella tabella `settings` (key/value).
// L'admin le modifica dal pannello di amministrazione.

export const SETTING_KEYS = {
  registrationsOpen: "registrations_open",
  // Tariffazione a token su due fasce orarie: prezzi in MILLESIMI DI CENTESIMO
  // (mc) per milione di token. 1 mc = 1/1000 di centesimo = 1/100000 €, così
  // sono possibili prezzi come €0,014 per milione (= 1400 mc). Le chiavi senza
  // "peak" sono i prezzi off-peak, validi in tutte le ore fuori dalle finestre
  // di picco (vedi src/lib/peak.ts).
  inputPricePerMillionMc: "input_price_per_million_mc",
  outputPricePerMillionMc: "output_price_per_million_mc",
  inputPricePeakPerMillionMc: "input_price_peak_per_million_mc",
  outputPricePeakPerMillionMc: "output_price_peak_per_million_mc",
} as const;

// Valori usati quando la chiave non esiste ancora nel database. I prezzi peak
// partono uguali agli off-peak: l'admin li differenzia dal pannello.
const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.registrationsOpen]: "true",
  [SETTING_KEYS.inputPricePerMillionMc]: "200000", // €2,000 / milione di token di input (off-peak)
  [SETTING_KEYS.outputPricePerMillionMc]: "600000", // €6,000 / milione di token di output (off-peak)
  [SETTING_KEYS.inputPricePeakPerMillionMc]: "200000",
  [SETTING_KEYS.outputPricePeakPerMillionMc]: "600000",
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

export type TokenPricing = {
  inputPricePerMillionMc: number;
  outputPricePerMillionMc: number;
};

function parsePrice(raw: string, fallbackKey: string): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultInt(fallbackKey);
}

/** Prezzi di entrambe le fasce (per la configurazione nel pannello admin). */
export async function getAllTokenPricing(): Promise<{ offPeak: TokenPricing; peak: TokenPricing }> {
  const all = await getAllSettings();
  return {
    offPeak: {
      inputPricePerMillionMc: parsePrice(
        all[SETTING_KEYS.inputPricePerMillionMc],
        SETTING_KEYS.inputPricePerMillionMc,
      ),
      outputPricePerMillionMc: parsePrice(
        all[SETTING_KEYS.outputPricePerMillionMc],
        SETTING_KEYS.outputPricePerMillionMc,
      ),
    },
    peak: {
      inputPricePerMillionMc: parsePrice(
        all[SETTING_KEYS.inputPricePeakPerMillionMc],
        SETTING_KEYS.inputPricePeakPerMillionMc,
      ),
      outputPricePerMillionMc: parsePrice(
        all[SETTING_KEYS.outputPricePeakPerMillionMc],
        SETTING_KEYS.outputPricePeakPerMillionMc,
      ),
    },
  };
}

/**
 * Prezzi attivi in un dato istante (fascia peak o off-peak). La chat la chiama
 * all'arrivo della richiesta, così addebito e costo mostrato sotto la risposta
 * usano la stessa fascia anche se la generazione attraversa il cambio d'ora.
 */
export async function getTokenPricing(at: Date = new Date()): Promise<TokenPricing> {
  const all = await getAllTokenPricing();
  return isPeakHour(at) ? all.peak : all.offPeak;
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
