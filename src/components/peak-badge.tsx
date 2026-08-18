"use client";

import { useEffect, useState } from "react";
import { isPeakHour, PEAK_WINDOWS_LABEL } from "@/lib/peak";

/**
 * Fascia tariffaria corrente, ricalcolata ogni 30 secondi così l'indicazione
 * cambia da sola al passaggio di finestra. Restituisce null fino al mount:
 * l'ora del server (SSR) e quella del browser possono cadere in fasce diverse
 * e il testo idratato non deve discostarsi dall'HTML iniziale.
 */
export function useIsPeakNow(): boolean | null {
  const [peak, setPeak] = useState<boolean | null>(null);
  useEffect(() => {
    const update = () => setPeak(isPeakHour(new Date()));
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);
  return peak;
}

/** Badge "Tariffa peak / off-peak" per l'header della chat. */
export function PeakBadge() {
  const peak = useIsPeakNow();
  if (peak === null) return null;
  return (
    <span
      title={`Ore di picco: ${PEAK_WINDOWS_LABEL}`}
      className={
        peak
          ? "shrink-0 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
          : "shrink-0 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400"
      }
    >
      {peak ? "Tariffa peak" : "Tariffa off-peak"}
    </span>
  );
}
