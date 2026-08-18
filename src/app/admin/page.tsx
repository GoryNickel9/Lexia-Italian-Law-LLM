import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { SETTING_KEYS, getAllSettings, getAllTokenPricing } from "@/lib/settings";
import { AdminPanel } from "@/components/admin-panel";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Il ruolo si verifica sempre sul database, non solo nel JWT
  if (!(await isAdminUser(session.user.id))) redirect("/chats");

  // Dati iniziali caricati server-side: il pannello li ricarica solo dopo le modifiche
  const [userList, settings, pricing] = await Promise.all([
    db.query.users.findMany({
      columns: { id: true, email: true, name: true, role: true, balanceCents: true, createdAt: true },
      orderBy: asc(users.createdAt),
    }),
    getAllSettings(),
    getAllTokenPricing(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Amministrazione</h1>
          <p className="mt-0.5 text-sm text-muted">
            Lexia — gestione utenti, crediti e registrazioni
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/chats"
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-foreground/5"
          >
            Torna alle chat
          </Link>
        </div>
      </header>

      <AdminPanel
        initialUsers={userList.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        initialSettings={{
          registrationsOpen: settings[SETTING_KEYS.registrationsOpen] === "true",
          offPeak: pricing.offPeak,
          peak: pricing.peak,
        }}
      />
    </main>
  );
}
