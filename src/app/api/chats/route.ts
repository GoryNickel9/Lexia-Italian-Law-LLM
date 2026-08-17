import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chats } from "@/lib/schema";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const list = await db.query.chats.findMany({
    where: eq(chats.userId, session.user.id),
    orderBy: desc(chats.updatedAt),
  });

  return NextResponse.json({ chats: list });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const [chat] = await db
    .insert(chats)
    .values({ userId: session.user.id })
    .returning({ id: chats.id });

  return NextResponse.json({ id: chat.id }, { status: 201 });
}
