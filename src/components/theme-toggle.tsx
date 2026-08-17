"use client";

// Toggle chiaro/scuro. La preferenza viene salvata sia in localStorage
// ("lexia-theme", per il caricamento istantaneo sul dispositivo corrente) sia
// nel database dell'utente (se autenticato), così vale su tutti i dispositivi.
// Lo script nel layout applica il tema prima del primo render: prima localStorage,
// poi il tema dell'account, poi la preferenza di sistema.
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    try {
      localStorage.setItem("lexia-theme", next ? "dark" : "light");
    } catch {
      // localStorage non disponibile: il tema vale solo per la sessione
    }
    void fetch("/api/user/theme", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next ? "dark" : "light" }),
    }).catch(() => {
      // non autenticato o offline: resta solo la preferenza locale
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Cambia tema chiaro/scuro"
      aria-label="Cambia tema chiaro/scuro"
      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-foreground/10"
    >
      {/* Luna: visibile nel tema chiaro (per passare allo scuro) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-5 w-5 dark:hidden"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z"
          clipRule="evenodd"
        />
      </svg>
      {/* Sole: visibile nel tema scuro (per passare al chiaro) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="hidden h-5 w-5 dark:block"
        aria-hidden="true"
      >
        <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2Zm4.95 2.05a.75.75 0 0 1 0 1.06l-1.06 1.06a.75.75 0 1 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 0ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM2 10a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 2 10Zm13.95 5.95a.75.75 0 0 1-1.06 0l-1.06-1.06a.75.75 0 1 1 1.06-1.06l1.06 1.06a.75.75 0 0 1 0 1.06ZM6.11 6.11a.75.75 0 0 1-1.06 0L3.99 5.05a.75.75 0 0 1 1.06-1.06l1.06 1.06a.75.75 0 0 1 0 1.06Zm1.387 8.353a4.5 4.5 0 0 0 6.364-6.364l-6.364 6.364ZM10 15.5a4.5 4.5 0 0 0 2.952-7.898l-5.85 5.85A4.485 4.485 0 0 0 10 15.5Z" />
      </svg>
    </button>
  );
}
