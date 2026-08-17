import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chats } from "@/lib/schema";
import { ChatsToolbar } from "@/components/chats-toolbar";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function ChatsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userChats = await db.query.chats.findMany({
    where: eq(chats.userId, session.user.id),
    orderBy: desc(chats.updatedAt),
    limit: 100,
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Le tue chat</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Ciao, {session.user.name} — solo domande sul diritto italiano
          </p>
        </div>
        <ChatsToolbar />
      </header>

      {userChats.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center">
          <p className="text-zinc-600">Non hai ancora nessuna chat.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Crea la tua prima chat e chiedi qualcosa sul diritto italiano.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {userChats.map((chat) => (
            <li key={chat.id}>
              <Link
                href={`/chats/${chat.id}`}
                className="group flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-zinc-400"
              >
                <span className="truncate font-medium text-zinc-900">{chat.title}</span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {formatDate(chat.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
