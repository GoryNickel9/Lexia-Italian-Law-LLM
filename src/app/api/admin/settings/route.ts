import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { SETTING_KEYS, getAllSettings, setSetting } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Accesso riservato agli amministratori" }, { status: 403 });
  }

  const settings = await getAllSettings();
  return NextResponse.json({
    registrationsOpen: settings[SETTING_KEYS.registrationsOpen] === "true",
    costPerMessageCents: Number.parseInt(settings[SETTING_KEYS.costPerMessageCents], 10) || 0,
  });
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
  if (
    typeof body?.costPerMessageCents === "number" &&
    Number.isInteger(body.costPerMessageCents) &&
    body.costPerMessageCents >= 0 &&
    body.costPerMessageCents <= 100000
  ) {
    await setSetting(SETTING_KEYS.costPerMessageCents, String(body.costPerMessageCents));
  } else if (body?.costPerMessageCents !== undefined) {
    return NextResponse.json(
      { error: "costPerMessageCents deve essere un intero tra 0 e 100000 (centesimi di euro)" },
      { status: 400 },
    );
  }

  return GET();
}
