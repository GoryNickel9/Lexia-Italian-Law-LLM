"use client";

import { useCallback, useState } from "react";
import { formatEuro } from "@/lib/format";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  balanceCents: number;
  createdAt: string;
};

type AdminSettings = {
  registrationsOpen: boolean;
  inputCostPerMillionCents: number;
  outputCostPerMillionCents: number;
};

const inputClass =
  "rounded-lg border border-line bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/10";
const primaryButton =
  "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "rounded-lg border border-line px-3 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60";

/** Converte un importo in euro ("5", "5,50", "5.50") in centesimi. */
function eurosToCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeZone: "Europe/Rome",
  }).format(new Date(iso));
}

export function AdminPanel({
  initialUsers,
  initialSettings,
}: {
  initialUsers: AdminUser[];
  initialSettings: AdminSettings;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [settings, setSettings] = useState(initialSettings);
  const [inputCostEuro, setInputCostEuro] = useState((initialSettings.inputCostPerMillionCents / 100).toFixed(2));
  const [outputCostEuro, setOutputCostEuro] = useState((initialSettings.outputCostPerMillionCents / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  // Ricarica i dati dopo una modifica (mai al mount: i dati iniziali arrivano dal server)
  const reload = useCallback(async () => {
    try {
      const [usersRes, settingsRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/settings"),
      ]);
      if (!usersRes.ok || !settingsRes.ok) {
        throw new Error("Caricamento dati non riuscito");
      }
      const usersData = await usersRes.json();
      const settingsData = await settingsRes.json();
      setUsers(usersData.users ?? []);
      setSettings(settingsData);
      setInputCostEuro((settingsData.inputCostPerMillionCents / 100).toFixed(2));
      setOutputCostEuro((settingsData.outputCostPerMillionCents / 100).toFixed(2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore di rete");
    }
  }, []);

  async function apiCall(url: string, init: RequestInit, successNotice: string) {
    setError(null);
    setNotice(null);
    const res = await fetch(url, init);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Operazione non riuscita");
      return false;
    }
    setNotice(successNotice);
    await reload();
    return true;
  }

  async function handleBalance(userId: string, mode: "add" | "set") {
    const cents = eurosToCents(amounts[userId] ?? "");
    if (cents === null) {
      setError("Inserisci un importo valido in euro (es. 5 o 5,50)");
      return;
    }
    setBusyUserId(userId);
    try {
      const body = mode === "add" ? { addCents: cents } : { setBalanceCents: cents };
      await apiCall(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, "Credito aggiornato.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleDelete(user: AdminUser) {
    if (!window.confirm(`Eliminare definitivamente l'account ${user.email}? Verranno cancellate anche tutte le sue chat.`)) {
      return;
    }
    setBusyUserId(user.id);
    try {
      await apiCall(`/api/admin/users/${user.id}`, { method: "DELETE" }, `Account ${user.email} eliminato.`);
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleToggleRegistrations() {
    if (!settings) return;
    await apiCall(
      "/api/admin/settings",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationsOpen: !settings.registrationsOpen }),
      },
      settings.registrationsOpen ? "Registrazioni chiuse." : "Registrazioni aperte.",
    );
  }

  async function handleSavePrices() {
    const inputCents = eurosToCents(inputCostEuro);
    const outputCents = eurosToCents(outputCostEuro);
    if (inputCents === null || outputCents === null) {
      setError("Inserisci prezzi validi in euro per milione di token (es. 2,00)");
      return;
    }
    await apiCall(
      "/api/admin/settings",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputCostPerMillionCents: inputCents,
          outputCostPerMillionCents: outputCents,
        }),
      },
      "Prezzi per milione di token aggiornati.",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {notice && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">{notice}</p>}

      {/* Impostazioni globali */}
      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-base font-semibold">Impostazioni</h2>

        <div className="mt-4 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Registrazioni</p>
              <p className="text-xs text-muted">
                {settings.registrationsOpen
                  ? "Aperte: chiunque può creare un account."
                  : "Chiuse: nessuna nuova registrazione."}
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleRegistrations}
              className={
                settings.registrationsOpen
                  ? "rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
                  : "rounded-lg border border-green-500/50 bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-500/20 dark:text-green-400"
              }
            >
              {settings.registrationsOpen ? "Chiudi registrazioni" : "Apri registrazioni"}
            </button>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
            <div>
              <p className="text-sm font-medium">Costi API (per milione di token)</p>
              <p className="text-xs text-muted">
                Credito addebitato in base ai token effettivamente consumati da ogni
                risposta. Attuali: input {formatEuro(settings.inputCostPerMillionCents)} / M,
                output {formatEuro(settings.outputCostPerMillionCents)} / M.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Input € / milione
                <input
                  value={inputCostEuro}
                  onChange={(e) => setInputCostEuro(e.target.value)}
                  inputMode="decimal"
                  placeholder="2,00"
                  className={`${inputClass} w-24`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Output € / milione
                <input
                  value={outputCostEuro}
                  onChange={(e) => setOutputCostEuro(e.target.value)}
                  inputMode="decimal"
                  placeholder="6,00"
                  className={`${inputClass} w-24`}
                />
              </label>
              <button type="button" onClick={handleSavePrices} className={primaryButton}>
                Salva prezzi
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Utenti registrati */}
      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-base font-semibold">Utenti registrati ({users.length})</h2>

        <div className="mt-4 flex flex-col gap-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex flex-col gap-3 rounded-xl border border-line p-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="truncate">{user.email}</span>
                  {user.role === "admin" && (
                    <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium text-muted">
                      admin
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {user.name} · registrato il {formatDate(user.createdAt)} · credito:{" "}
                  <span className="font-medium text-foreground">{formatEuro(user.balanceCents)}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={amounts[user.id] ?? ""}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [user.id]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="€ 5,00"
                  className={`${inputClass} w-24`}
                  aria-label={`Importo in euro per ${user.email}`}
                />
                <button
                  type="button"
                  onClick={() => handleBalance(user.id, "add")}
                  disabled={busyUserId === user.id}
                  className={primaryButton}
                >
                  Aggiungi
                </button>
                <button
                  type="button"
                  onClick={() => handleBalance(user.id, "set")}
                  disabled={busyUserId === user.id}
                  className={secondaryButton}
                >
                  Imposta
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(user)}
                  disabled={busyUserId === user.id}
                  className="rounded-lg border border-red-400/50 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400"
                >
                  Elimina
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
