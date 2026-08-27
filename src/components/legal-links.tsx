import Link from "next/link";

// Riga di link alle pagine legali, mostrata nelle pagine pubbliche (login e registrazione).
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`flex justify-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted ${className}`} aria-label="Pagine legali">
      <Link href="/privacy-policy" className="underline-offset-2 hover:text-foreground hover:underline">
        Privacy
      </Link>
      <Link href="/cookie-policy" className="underline-offset-2 hover:text-foreground hover:underline">
        Cookie
      </Link>
      <Link href="/termini-di-servizio" className="underline-offset-2 hover:text-foreground hover:underline">
        Termini di servizio
      </Link>
    </nav>
  );
}
