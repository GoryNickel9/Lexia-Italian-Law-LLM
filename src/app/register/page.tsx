import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/chats");

  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">Crea il tuo account</h1>
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
      </div>
    </main>
  );
}
