"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

const inputClass =
  "rounded-lg border border-line bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/10";
const primaryButton =
  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

function ChangeEmailForm({ currentEmail, onDone }: { currentEmail: string; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/user/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          currentPassword: String(form.get("currentPassword") ?? ""),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Cambio email non riuscito. Riprova.");
        return;
      }
      // La sessione JWT contiene ancora la vecchia email: si riaccede con la nuova
      onDone();
      await signOut({ callbackUrl: "/login?email=aggiornata" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Email attuale: <span className="font-medium text-foreground">{currentEmail}</span>
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-email" className="text-sm font-medium">
          Nuova email
        </label>
        <input id="new-email" name="email" type="email" required className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email-current-password" className="text-sm font-medium">
          Password attuale
        </label>
        <input
          id="email-current-password"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Salvataggio…" : "Cambia email"}
      </button>
    </form>
  );
}

function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOkMessage(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/user/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: String(form.get("currentPassword") ?? ""),
          newPassword: String(form.get("newPassword") ?? ""),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Cambio password non riuscito. Riprova.");
        return;
      }
      setOkMessage("Password aggiornata.");
      (event.target as HTMLFormElement).reset();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pwd-current" className="text-sm font-medium">
          Password attuale
        </label>
        <input id="pwd-current" name="currentPassword" type="password" required autoComplete="current-password" className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pwd-new" className="text-sm font-medium">
          Nuova password
        </label>
        <input
          id="pwd-new"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="text-xs text-muted">Almeno 8 caratteri.</p>
      </div>
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {okMessage && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">{okMessage}</p>}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Salvataggio…" : "Cambia password"}
      </button>
    </form>
  );
}

export function SettingsModal({
  email,
  onClose,
}: {
  email: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"email" | "password">("email");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Impostazioni"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Impostazioni</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-foreground/10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="mb-5 flex gap-1 rounded-lg bg-sidebar p-1">
          {(
            [
              ["email", "Cambia email"],
              ["password", "Cambia password"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === key ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "email" ? (
          <ChangeEmailForm currentEmail={email} onDone={onClose} />
        ) : (
          <ChangePasswordForm />
        )}
      </div>
    </div>
  );
}
