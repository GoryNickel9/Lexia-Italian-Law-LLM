import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { SETTING_KEYS, getAllSettings, getTokenPricing, setSetting } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Accesso riservato agli amministratori" }, { status: 403 });
  }

  const [settings, pricing] = await Promise.all([getAllSettings(), getTokenPricing()]);
  return NextResponse.json({
    registrationsOpen: settings[SETTING_KEYS.registrationsOpen] === "true",
    ...pricing,
  });
}

// I prezzi sono in millesimi di centesimo per milione di token (interi),
// così sono ammessi valori come €0,014 per milione (= 1400). Limite: €1.000/M.
const MAX_PRICE_MC = 100_000_000;

function validPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_PRICE_MC;
}

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
  if (body?.inputPricePerMillionMc !== undefined) {
    if (validPrice(body.inputPricePerMillionMc)) {
      await setSetting(SETTING_KEYS.inputPricePerMillionMc, String(body.inputPricePerMillionMc));
    } else {
      invalidPrices.push("inputPricePerMillionMc");
    }
  }
  if (body?.outputPricePerMillionMc !== undefined) {
    if (validPrice(body.outputPricePerMillionMc)) {
      await setSetting(SETTING_KEYS.outputPricePerMillionMc, String(body.outputPricePerMillionMc));
    } else {
      invalidPrices.push("outputPricePerMillionMc");
    }
  }
  if (invalidPrices.length > 0) {
    return NextResponse.json(
      {
        error: `${invalidPrices.join(" e ")} devono essere interi tra 0 e ${MAX_PRICE_MC} (millesimi di centesimo per milione di token)`,
      },
      { status: 400 },
    );
  }

  return GET();
}
