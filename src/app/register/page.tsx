import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/chats");

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-zinc-900">Crea il tuo account</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Ogni account ha le proprie chat private
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <AuthForm mode="register" />
        </div>

        <p className="mt-4 text-center text-sm text-zinc-600">
          Hai già un account?{" "}
          <Link href="/login" className="font-medium text-zinc-900 underline">
            Accedi
          </Link>
        </p>
      </div>
    </main>
  );
}
