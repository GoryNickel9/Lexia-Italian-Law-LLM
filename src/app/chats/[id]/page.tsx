import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chats, messages, users } from "@/lib/schema";
import { computeCostMillicents, getAllTokenPricing, isPeakHour } from "@/lib/settings";
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

  const [history, userRow, pricing] = await Promise.all([
    db.query.messages.findMany({
      where: eq(messages.chatId, id),
      orderBy: asc(messages.createdAt),
    }),
    db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { balanceCents: true },
    }),
    getAllTokenPricing(),
  ]);

  const initialMessages = history.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text" as const, text: m.content }],
  }));

  // Consumo token e costo delle risposte già salvate nel database. Per le
  // risposte precedenti all'aggiunta della colonna cost_millicents il costo
  // viene ricalcolato con i prezzi correnti, usando la fascia (peak/off-peak)
  // dell'orario in cui il messaggio è stato generato.
  const initialUsages = Object.fromEntries(
    history
      .filter((m) => m.role === "assistant" && (m.inputTokens !== null || m.outputTokens !== null))
      .map((m) => [
        m.id,
        {
          inputTokens: m.inputTokens ?? 0,
          outputTokens: m.outputTokens ?? 0,
          costMillicents:
            m.costMillicents ??
            computeCostMillicents(
              m.inputTokens ?? 0,
              m.outputTokens ?? 0,
              isPeakHour(m.createdAt) ? pricing.peak : pricing.offPeak,
            ),
        },
      ]),
  );

  const creditsExhausted = (userRow?.balanceCents ?? 0) <= 0;

  return (
    <Chat
      chatId={chat.id}
      chatTitle={chat.title}
      initialMessages={initialMessages}
      initialUsages={initialUsages}
      creditsExhausted={creditsExhausted}
    />
  );
}
