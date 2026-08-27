import Link from "next/link";
import { LEGAL_INFO } from "@/lib/legal-info";

// Guscio condiviso dalle pagine legali: titolo, data di aggiornamento, contenuto
// (stilato dalla classe .markdown già presente in globals.css) e navigazione
// tra le altre pagine legali. Pagine pubbliche, raggiungibili senza accesso.
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="legal mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-xs text-muted">
        Ultimo aggiornamento: {LEGAL_INFO.ultimaAggiornamento}
      </p>

      <div className="markdown mt-8 text-sm leading-relaxed">{children}</div>

      <nav className="mt-12 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4 text-xs text-muted" aria-label="Pagine legali">
        <Link href="/privacy-policy" className="underline-offset-2 hover:text-foreground hover:underline">
          Privacy Policy
        </Link>
        <Link href="/cookie-policy" className="underline-offset-2 hover:text-foreground hover:underline">
          Cookie Policy
        </Link>
        <Link href="/termini-di-servizio" className="underline-offset-2 hover:text-foreground hover:underline">
          Termini di servizio
        </Link>
        <Link href="/login" className="underline-offset-2 hover:text-foreground hover:underline">
          Torna all&apos;accesso
        </Link>
      </nav>
    </main>
  );
}
