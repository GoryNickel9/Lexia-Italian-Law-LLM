import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";
import mascotte from "@/assets/lexia-mascotte.png";

const puntiDiForza = [
  "Chat private",
  "Fonti ufficiali: Codici e Costituzione",
  "Citazioni sempre verificate",
  "Sempre aggiornato alle norme vigenti",
];

// Guscio condiviso dalle pagine accessibili senza autenticazione (login,
// registrazione): pannello mascotte a sinistra e form a destra, impilati
// su schermi stretti.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="flex w-full max-w-4xl flex-col items-center gap-8 md:flex-row md:gap-14">
        <section className="flex flex-col items-center text-center">
          <Image
            src={mascotte}
            alt="Lexia — LLM per il diritto italiano"
            priority
            className="h-32 w-auto md:h-80"
          />
          <p className="mt-3 max-w-xs text-lg font-semibold tracking-tight text-foreground md:mt-6 md:max-w-sm md:text-2xl">
            Il diritto italiano, spiegato articolo per articolo.
          </p>

          <ul className="mt-6 hidden flex-col items-start gap-2.5 md:flex">
            {puntiDiForza.map((punto) => (
              <li key={punto} className="flex items-start gap-2.5 text-sm text-muted">
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 h-4 w-4 shrink-0 text-foreground"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>{punto}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="w-full max-w-sm md:w-96">{children}</section>
      </div>
    </main>
  );
}
