import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { SETTING_KEYS, getAllSettings, getAllTokenPricing, setSetting } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Accesso riservato agli amministratori" }, { status: 403 });
  }

  const [settings, pricing] = await Promise.all([getAllSettings(), getAllTokenPricing()]);
  return NextResponse.json({
    registrationsOpen: settings[SETTING_KEYS.registrationsOpen] === "true",
    offPeak: pricing.offPeak,
    peak: pricing.peak,
  });
}

// I prezzi sono in millesimi di centesimo per milione di token (interi),
// così sono ammessi valori come €0,014 per milione (= 1400). Limite: €1.000/M.
const MAX_PRICE_MC = 100_000_000;

function validPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_PRICE_MC;
}

// Corrispondenza fra i campi di ciascuna fascia nel body e le chiavi delle
// impostazioni: body.offPeak usa le chiavi off-peak, body.peak quelle peak.
const PRICE_GROUPS = [
  {
    group: "offPeak",
    keys: {
      inputPricePerMillionMc: SETTING_KEYS.inputPricePerMillionMc,
      outputPricePerMillionMc: SETTING_KEYS.outputPricePerMillionMc,
    },
  },
  {
    group: "peak",
    keys: {
      inputPricePerMillionMc: SETTING_KEYS.inputPricePeakPerMillionMc,
      outputPricePerMillionMc: SETTING_KEYS.outputPricePeakPerMillionMc,
    },
  },
] as const;

const PRICE_FIELDS = ["inputPricePerMillionMc", "outputPricePerMillionMc"] as const;

export async function PATCH(request: Request) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Accesso riservato agli amministratori" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (typeof body?.registrationsOpen === "boolean") {
    await setSetting(SETTING_KEYS.registrationsOpen, body.registrationsOpen ? "true" : "false");
  }

  const invalidPrices: string[] = [];
  for (const { group, keys } of PRICE_GROUPS) {
    const fields = body?.[group];
    if (typeof fields !== "object" || fields === null) continue;
    for (const field of PRICE_FIELDS) {
      const value: unknown = fields[field];
      if (value === undefined) continue;
      if (validPrice(value)) {
        await setSetting(keys[field], String(value));
      } else {
        invalidPrices.push(`${group}.${field}`);
      }
    }
  }
  if (invalidPrices.length > 0) {
    return NextResponse.json(
      {
        error: `${invalidPrices.join(", ")} devono essere interi tra 0 e ${MAX_PRICE_MC} (millesimi di centesimo per milione di token)`,
      },
      { status: 400 },
    );
  }

  return GET();
}
