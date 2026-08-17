import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chats, messages, users } from "@/lib/schema";
import { getCostPerMessageCents } from "@/lib/settings";
import { Chat } from "@/components/chat";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, id), eq(chats.userId, session.user.id)),
  });
  if (!chat) notFound();

  const [history, userRow, costCents] = await Promise.all([
    db.query.messages.findMany({
      where: eq(messages.chatId, id),
      orderBy: asc(messages.createdAt),
    }),
    db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { role: true, balanceCents: true },
    }),
    getCostPerMessageCents(),
  ]);

  const initialMessages = history.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text" as const, text: m.content }],
  }));

  const isAdmin = userRow?.role === "admin";
  const creditsExhausted = !isAdmin && (userRow?.balanceCents ?? 0) < costCents;

  return (
    <Chat
      chatId={chat.id}
      chatTitle={chat.title}
      initialMessages={initialMessages}
      creditsExhausted={creditsExhausted}
      costCents={costCents}
    />
  );
}
