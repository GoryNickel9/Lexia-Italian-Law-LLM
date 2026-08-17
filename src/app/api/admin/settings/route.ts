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

// I prezzi sono in centesimi di euro per milione di token (interi, 0..1.000.000)
const MAX_PRICE_CENTS = 1_000_000;

function validPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_PRICE_CENTS;
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
  if (body?.inputCostPerMillionCents !== undefined) {
    if (validPrice(body.inputCostPerMillionCents)) {
      await setSetting(SETTING_KEYS.inputCostPerMillionCents, String(body.inputCostPerMillionCents));
    } else {
      invalidPrices.push("inputCostPerMillionCents");
    }
  }
  if (body?.outputCostPerMillionCents !== undefined) {
    if (validPrice(body.outputCostPerMillionCents)) {
      await setSetting(SETTING_KEYS.outputCostPerMillionCents, String(body.outputCostPerMillionCents));
    } else {
      invalidPrices.push("outputCostPerMillionCents");
    }
  }
  if (invalidPrices.length > 0) {
    return NextResponse.json(
      {
        error: `${invalidPrices.join(" e ")} devono essere interi tra 0 e ${MAX_PRICE_CENTS} (centesimi di euro per milione di token)`,
      },
      { status: 400 },
    );
  }

  return GET();
}
