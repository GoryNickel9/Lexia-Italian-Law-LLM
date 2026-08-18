"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SettingsModal } from "@/components/settings-modal";
import { formatEuro } from "@/lib/format";

export type SidebarChat = {
  id: string;
  title: string;
  updatedAt: string;
};

export type SidebarUser = {
  name: string;
  email: string;
  role: "user" | "admin";
  balanceCents: number;
};

function formatDate(iso: string) {
  // Fuso fisso: server (UTC su Vercel) e client devono produrre lo stesso testo
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  }).format(new Date(iso));
}

const trashIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.75 1C7.23122 1 6 2.23122 6 3.75V4.1927C5.20472 4.26972 4.41602 4.36947 3.63458 4.49129C3.22531 4.5551 2.94525 4.9386 3.00906 5.34787C3.07286 5.75714 3.45637 6.0372 3.86564 5.97339L4.01355 5.95062L4.85504 16.4693C4.96938 17.8985 6.16254 19 7.59629 19H12.4035C13.8372 19 15.0304 17.8985 15.1447 16.4693L15.9862 5.95055L16.1346 5.97339C16.5438 6.0372 16.9274 5.75714 16.9912 5.34787C17.055 4.9386 16.7749 4.5551 16.3656 4.49129C15.5841 4.36946 14.7954 4.2697 14 4.19268V3.75C14 2.23122 12.7688 1 11.25 1H8.75ZM10.0001 4C10.8395 4 11.673 4.02523 12.5 4.07499V3.75C12.5 3.05964 11.9404 2.5 11.25 2.5H8.75C8.05964 2.5 7.5 3.05964 7.5 3.75V4.075C8.32707 4.02524 9.16068 4 10.0001 4ZM8.57948 7.72002C8.56292 7.30614 8.21398 6.98404 7.8001 7.0006C7.38622 7.01716 7.06412 7.36609 7.08068 7.77998L7.38069 15.28C7.39725 15.6939 7.74619 16.016 8.16007 15.9994C8.57395 15.9828 8.89605 15.6339 8.87949 15.22L8.57948 7.72002ZM12.9195 7.77998C12.936 7.36609 12.614 7.01715 12.2001 7.0006C11.7862 6.98404 11.4372 7.30614 11.4207 7.72002L11.1207 15.22C11.1041 15.6339 11.4262 15.9828 11.8401 15.9994C12.254 16.016 12.6029 15.6939 12.6195 15.28L12.9195 7.77998Z"
    />
  </svg>
);

const checkIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
      clipRule="evenodd"
    />
  </svg>
);

function Brand() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
        L
      </span>
      <span className="text-base font-semibold tracking-tight">Lexia</span>
    </span>
  );
}

export function Sidebar({ user, chats }: { user: SidebarUser; chats: SidebarChat[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = chats.length > 0 && selectedIds.size === chats.length;

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setError(null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function deleteOne(chat: SidebarChat) {
    if (!window.confirm(`Eliminare "${chat.title}"? L'operazione è definitiva.`)) return;
    try {
      const res = await fetch(`/api/chat/${chat.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      if (pathname === `/chats/${chat.id}`) {
        router.push("/chats");
      }
      router.refresh();
    } catch {
      window.alert("Impossibile eliminare la chat. Riprova.");
    }
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0 || deleting) return;
    if (!window.confirm(`Eliminare ${ids.length} chat? L'operazione è definitiva.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/chats", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatIds: ids }),
      });
      if (!res.ok) throw new Error();
      const activeDeleted = ids.some((id) => pathname === `/chats/${id}`);
      exitSelectMode();
      if (activeDeleted) {
        router.push("/chats");
      }
      router.refresh();
    } catch {
      setError("Impossibile eliminare le chat selezionate. Riprova.");
    } finally {
      setDeleting(false);
    }
  }

  const chatList = (
    <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Le tue chat">
      {chats.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted">Nessuna chat: inizia a scrivere al centro per crearne una.</p>
      ) : selectMode ? (
        <>
          <div className="mb-2 flex flex-col gap-2 border-b border-line px-1 pb-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted">
                {selectedIds.size === 0 ? "Nessuna selezionata" : `${selectedIds.size} selezionat${selectedIds.size === 1 ? "a" : "e"}`}
              </p>
              <button
                type="button"
                onClick={() => setSelectedIds(allSelected ? new Set() : new Set(chats.map((c) => c.id)))}
                className="text-xs text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                {allSelected ? "Deseleziona tutte" : "Seleziona tutte"}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={deleteSelected}
                disabled={selectedIds.size === 0 || deleting}
                className="flex-1 rounded-lg border border-red-400/50 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400"
              >
                Elimina{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
              </button>
              <button
                type="button"
                onClick={exitSelectMode}
                disabled={deleting}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Annulla
              </button>
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
          <ul className="flex flex-col gap-0.5">
            {chats.map((chat) => {
              const selected = selectedIds.has(chat.id);
              return (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => toggleSelected(chat.id)}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                      selected ? "bg-foreground/10 text-foreground" : "text-foreground/80 hover:bg-foreground/5"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        selected ? "border-accent bg-accent text-accent-foreground" : "border-line"
                      }`}
                    >
                      {selected && checkIcon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{chat.title}</span>
                      <span className="block text-xs text-muted">{formatDate(chat.updatedAt)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {chats.map((chat) => {
            const active = pathname === `/chats/${chat.id}`;
            return (
              <li key={chat.id} className="group relative">
                <Link
                  href={`/chats/${chat.id}`}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex flex-col gap-0.5 rounded-lg py-2 pl-3 pr-10 transition-colors ${
                    active
                      ? "bg-foreground/10 text-foreground"
                      : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground"
                  }`}
                >
                  <span className="truncate text-sm font-medium">{chat.title}</span>
                  <span className="text-xs text-muted">{formatDate(chat.updatedAt)}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => deleteOne(chat)}
                  aria-label={`Elimina la chat ${chat.title}`}
                  title="Elimina chat"
                  className="absolute inset-y-0 right-1.5 my-auto flex h-7 w-7 items-center justify-center rounded-md text-muted opacity-100 transition-colors hover:bg-red-500/10 hover:text-red-600 focus-visible:opacity-100 dark:hover:text-red-400 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                >
                  {trashIcon}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );

  const footer = (
    <div className="border-t border-line p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        {/* Come su ChatGPT: il click sull'account (nome/email) apre le impostazioni */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Impostazioni account"
          className="-mx-1.5 -my-1 min-w-0 flex-1 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-foreground/10"
        >
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </button>
        <span
          className="shrink-0 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-foreground"
          title="Credito disponibile"
        >
          {formatEuro(user.balanceCents)}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {user.role === "admin" && (
          <Link
            href="/admin"
            onClick={() => setDrawerOpen(false)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground"
            title="Pannello di amministrazione"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M10.868 2.88a1 1 0 0 0-1.736 0l-6.75 11.5A1 1 0 0 0 4.25 16h11.5a1 1 0 0 0 .868-1.62l-6.75-11.5ZM9 7a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0V7Zm1 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
                clipRule="evenodd"
              />
            </svg>
            Admin
          </Link>
        )}

        <ThemeToggle />

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          Esci
        </button>
      </div>
    </div>
  );

  const header = (
    <div className="flex items-center justify-between gap-2 border-b border-line p-3">
      <Link href="/chats" onClick={() => setDrawerOpen(false)}>
        <Brand />
      </Link>
      {/* Su mobile chiude il drawer; su desktop non serve (la barra è sempre visibile) */}
      <button
        type="button"
        onClick={() => setDrawerOpen(false)}
        className="rounded-lg p-1.5 text-muted hover:bg-foreground/10 md:hidden"
        aria-label="Chiudi menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  );

  const newChatButton = (
    <div className="p-3 pb-0">
      <Link
        href="/chats"
        onClick={() => setDrawerOpen(false)}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
        </svg>
        Nuova chat
      </Link>
      {!selectMode && chats.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setSelectMode(true);
            setSelectedIds(new Set());
            setError(null);
          }}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          {trashIcon}
          Elimina chat…
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Barra superiore visibile solo su mobile */}
      <div className="flex items-center justify-between border-b border-line bg-sidebar px-4 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-foreground/10"
          aria-label="Apri menu chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <Brand />
        <ThemeToggle />
      </div>

      {/* Overlay del drawer su mobile */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 transform flex-col border-r border-line bg-sidebar transition-transform duration-200 md:static md:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {header}
        {newChatButton}
        {chatList}
        {footer}
      </aside>

      {settingsOpen && <SettingsModal email={user.email} onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
