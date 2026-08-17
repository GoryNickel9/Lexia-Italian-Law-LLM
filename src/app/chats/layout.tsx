import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chats, users } from "@/lib/schema";
import { Sidebar } from "@/components/sidebar";

export const dynamic = "force-dynamic";

// Layout condiviso da /chats e /chats/[id]: sidebar con le chat a sinistra,
// conversazione al centro. Rieseguito a ogni router.refresh(), così lista chat
// e credito si aggiornano dopo ogni messaggio.
export default async function ChatsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [userRow, userChats] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { name: true, email: true, role: true, balanceCents: true },
    }),
    db.query.chats.findMany({
      where: eq(chats.userId, session.user.id),
      orderBy: desc(chats.updatedAt),
      limit: 100,
      columns: { id: true, title: true, updatedAt: true },
    }),
  ]);

  const user = {
    name: userRow?.name ?? session.user.name ?? "",
    email: userRow?.email ?? session.user.email ?? "",
    role: (userRow?.role ?? "user") as "user" | "admin",
    balanceCents: userRow?.balanceCents ?? 0,
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <Sidebar
        user={user}
        chats={userChats.map((c) => ({
          id: c.id,
          title: c.title,
          updatedAt: c.updatedAt.toISOString(),
        }))}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
