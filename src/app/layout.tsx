import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lexia — Diritto Italiano",
  description:
    "Assistente specializzato in diritto italiano: leggi, codici, giurisprudenza e procedure. Solo domande sul diritto italiano.",
};

// Applica il tema prima del primo render per evitare il lampo bianco.
// Priorità: preferenza del dispositivo (localStorage) → tema dell'account
// (salvato nel database) → preferenza di sistema del browser.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  let accountTheme: "dark" | "light" | null = null;
  if (session?.user?.id) {
    const row = await db
      .query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: { theme: true },
      })
      .catch(() => undefined);
    accountTheme = row?.theme ?? null;
  }

  const themeInitScript = `(function(){try{var t=localStorage.getItem("lexia-theme");var a=${JSON.stringify(accountTheme)};var d=t?t==="dark":(a? a==="dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
