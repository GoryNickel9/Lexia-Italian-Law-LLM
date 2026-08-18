// Finestre di tariffazione peak, condivise da codice server e componenti
// client: questo modulo non importa nulla (niente db) e può finire nel
// bundle del browser. L'ora è sempre valutata in UTC.

// Finestre peak in ore UTC, estremo destro escluso: [01:00, 04:00) e
// [06:00, 10:00). Tutte le altre ore sono off-peak.
export const PEAK_WINDOWS_UTC: Array<[start: number, end: number]> = [
  [1, 4],
  [6, 10],
];

// Etichetta unica delle finestre, mostrata nella UI (badge e pannello admin)
export const PEAK_WINDOWS_LABEL = "01:00–04:00 e 06:00–10:00 UTC";

/** true se l'istante cade in una finestra di picco (confronto sulle ore UTC). */
export function isPeakHour(at: Date): boolean {
  const hour = at.getUTCHours();
  return PEAK_WINDOWS_UTC.some(([start, end]) => hour >= start && hour < end);
}
