import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { LegalLinks } from "@/components/legal-links";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/chats");

  const emailUpdated = (await searchParams).email === "aggiornata";

  return (
    <AuthShell>
      {emailUpdated && (
        <p className="mb-4 rounded-lg bg-green-500/10 px-3 py-2 text-center text-sm text-green-700 dark:text-green-400">
          Email aggiornata: accedi con la nuova email.
        </p>
      )}

      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <AuthForm mode="login" />
      </div>

      <p className="mt-4 text-center text-sm text-muted">
        Non hai un account?{" "}
        <Link href="/register" className="font-medium text-foreground underline">
          Registrati
        </Link>
      </p>

      <LegalLinks className="mt-8" />
    </AuthShell>
  );
}
