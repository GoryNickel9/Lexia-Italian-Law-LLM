// Helper di formattazione condivisi fra componenti client e codice server.

/** Formatta centesimi di euro come valuta italiana: 500 -> "5,00 €". */
export function formatEuro(cents: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
