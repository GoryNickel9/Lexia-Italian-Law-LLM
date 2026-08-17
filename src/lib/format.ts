// Helper di formattazione condivisi fra componenti client e codice server.
// Tutto è implementato a mano (niente Intl): server e browser producono così
// stringhe identiche, evitando mismatch di hydration dovuti a versioni ICU
// diverse (es. separatore migliaia di "it-IT" o lo spazio prima di "€").

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 1234567 -> "1.234.567" */
export function formatTokens(n: number): string {
  return groupThousands(Math.trunc(Math.abs(n)).toString());
}

/** Centesimi -> "1.234,56 €" (500 -> "5,00 €"). */
export function formatEuro(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const [int, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${sign}${groupThousands(int)},${dec}\u00A0€`;
}

/** Come formatEuro ma con fino a 4 decimali, per i costi per-messaggio a token. */
export function formatEuroPrecise(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const fixed = (Math.abs(cents) / 100).toFixed(4).replace(/0{1,2}$/, "");
  const [int, dec] = fixed.split(".");
  return `${sign}${groupThousands(int)},${dec}\u00A0€`;
}
