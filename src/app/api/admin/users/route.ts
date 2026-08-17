import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Accesso riservato agli amministratori" }, { status: 403 });
  }

  const list = await db.query.users.findMany({
    columns: {
      id: true,
      email: true,
      name: true,
      role: true,
      balanceCents: true,
      createdAt: true,
    },
    orderBy: asc(users.createdAt),
  });

  return NextResponse.json({
    users: list.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
  });
}
