"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const chatList = (
    <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Le tue chat">
      {chats.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted">Nessuna chat: inizia a scrivere al centro per crearne una.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {chats.map((chat) => {
            const active = pathname === `/chats/${chat.id}`;
            return (
              <li key={chat.id}>
                <Link
                  href={`/chats/${chat.id}`}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex flex-col gap-0.5 rounded-lg px-3 py-2 transition-colors ${
                    active
                      ? "bg-foreground/10 text-foreground"
                      : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground"
                  }`}
                >
                  <span className="truncate text-sm font-medium">{chat.title}</span>
                  <span className="text-xs text-muted">{formatDate(chat.updatedAt)}</span>
                </Link>
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
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
        <span
          className="shrink-0 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-foreground"
          title="Credito disponibile"
        >
          {formatEuro(user.balanceCents)}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex flex-1 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
              clipRule="evenodd"
            />
          </svg>
          Impostazioni
        </button>

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
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground"
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
