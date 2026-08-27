import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { LegalLinks } from "@/components/legal-links";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/chats");

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold md:text-2xl">Crea il tuo account</h1>
        <p className="mt-1 text-sm text-muted">
          Ogni account ha le proprie chat private
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <AuthForm mode="register" />
      </div>

      <p className="mt-4 text-center text-sm text-muted">
        Hai già un account?{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          Accedi
        </Link>
      </p>

      <p className="mt-6 text-center text-xs text-muted">
        Creando un account accetti i{" "}
        <Link href="/termini-di-servizio" className="underline underline-offset-2">
          Termini di servizio
        </Link>{" "}
        e la{" "}
        <Link href="/privacy-policy" className="underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>

      <LegalLinks className="mt-4" />
    </AuthShell>
  );
}
