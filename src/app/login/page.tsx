import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { LegalLinks } from "@/components/legal-links";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/chats");

  const emailUpdated = (await searchParams).email === "aggiornata";

  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">Lexia</h1>
          <p className="mt-1 text-sm text-muted">
            Assistente specializzato in diritto italiano
          </p>
        </div>

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
      </div>
    </main>
  );
}
