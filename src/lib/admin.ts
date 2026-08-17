import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";

// Il ruolo nel JWT potrebbe non essere ancora aggiornato dopo una promozione
// manuale sul database: per il pannello admin si verifica sempre sul db.
export async function isAdminUser(userId: string): Promise<boolean> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });
  return row?.role === "admin";
}

/** Ritorna l'id dell'admin autenticato, oppure null se la richiesta non è autorizzata. */
export async function requireAdmin(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return (await isAdminUser(session.user.id)) ? session.user.id : null;
}
