# Giurista AI — la porta web per Hermes Agent

Il sito è **solo una porta** per parlare con il tuo **Hermes Agent** (che vive sulla tua VPS): registrazione/login, chat private per utente con streaming, e nient'altro. L'hosting del sito è su **Vercel**.

- **Turso (SQLite)** — l'unico database del sito: utenti, chat e messaggi
- **PostgreSQL sulla VPS** — è di Hermes Agent (la sua memoria): il sito **non ci si collega**

```
                          ┌─▶ Turso (utenti, chat, messaggi)
Browser ──▶ Next.js (Vercel)
                          └─▶ Hermes Agent (VPS, API OpenAI-compatible)
```

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS) — solo frontend + route API
- **Auth.js (NextAuth) v5** — email/password, sessioni JWT, hash bcrypt
- **Drizzle ORM + @libsql/client** — Turso per tutti i dati del sito
- **Vercel AI SDK** — `useChat` sul client, `streamText` sulla route di streaming
- **`@ai-sdk/openai`** in modalità Chat Completions (`/v1/chat/completions`), l'interfaccia esposta da Hermes Agent

## Setup locale

```bash
npm install
cp .env.example .env.local
```

Compila `.env.local`:

| Variabile | Descrizione |
|---|---|
| `TURSO_DATABASE_URL` | URL del database Turso (`libsql://...turso.io`); in locale puoi usare `file:./app.db` |
| `TURSO_AUTH_TOKEN` | Token Turso (vuoto per i database `file:`) |
| `AUTH_SECRET` | Genera con `npx auth secret` |
| `HERMES_BASE_URL` | Base URL dell'API di Hermes, es. `https://hermes.tuodominio.it/v1` |
| `HERMES_API_KEY` | API key se configurata sul tuo Hermes, altrimenti vuoto |
| `HERMES_MODEL` | Identificativo del modello che Hermes si aspetta nel campo `model` |

Crea lo schema e avvia:

```bash
npm run db:push   # su Turso: tabelle users, chats, messages
npm run dev
```

## Hermes Agent dietro HTTPS

1. Esponi il server API OpenAI-compatible:
   ```
   hermes serve --host 0.0.0.0 --port 8000
   ```
   (verifica i flag esatti nella documentazione di Hermes Agent)

2. Reverse proxy HTTPS, es. con Caddy:
   ```
   hermes.tuodominio.it {
       reverse_proxy 127.0.0.1:8000
   }
   ```

3. Verifica dalla tua macchina che risponda come un endpoint OpenAI-compatible:
   ```bash
   curl -X POST https://hermes.tuodominio.it/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"<modello>","messages":[{"role":"user","content":"Ciao"}]}'
   ```

## Ambito "solo diritto italiano"

Il sito antepone a ogni conversazione il system prompt definito in `src/lib/hermes.ts`, che limita le risposte al diritto italiano, impone il rifiuto gentile delle domande fuori tema e il disclaimer "non sono un avvocato". Se preferisci gestire l'ambito direttamente nella configurazione del tuo Hermes, svuota la costante `SYSTEM_PROMPT` in quel file: il sito funziona comunque come semplice porta.

Lo storico conversazione inviato a Hermes viene sempre caricato dal database, mai dai messaggi inviati dal client (il client fornisce solo l'ultima domanda).

## Deploy su Vercel

1. Importa il repository su Vercel.
2. In **Settings → Environment Variables** aggiungi le 6 variabili di `.env.example`, spuntando **Production** (e Preview se lo usi).
3. Deploy. La prima volta crea lo schema su Turso:
   ```bash
   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=eyJ... npm run db:push
   ```
   (oppure incolla il SQL delle tre tabelle nella console web di Turso)

> La route di streaming ha `maxDuration = 60` secondi. Su Vercel Hobby il limite è 60s; su Pro puoi alzarlo se le risposte di Hermes richiedono più tempo.

## Risoluzione problemi

- **`/api/health`** verifica i due collegamenti (Turso e Hermes) e riporta l'errore utile: aprilo sul dominio del sito.
- Se la **registrazione** risponde 500, il messaggio nel form indica la causa più probabile: variabile d'ambiente mancante, token Turso errato, o tabelle assenti (in quel caso esegui `npm run db:push` con le variabili di produzione).
- I dettagli completi sono nei **log delle funzioni** su Vercel (Deployments → Logs).

## Struttura

```
src/
  app/
    login/               pagina di accesso
    register/            pagina di registrazione
    chats/               elenco delle chat dell'utente
    chats/[id]/          pagina di una chat (streaming)
    api/
      auth/              endpoint Auth.js
      register/          creazione account
      chats/             elenco + creazione chat
      chat/[chatId]/     streaming della risposta + eliminazione chat
      health/            diagnostica dei collegamenti (Turso, Hermes)
  components/
    auth-form.tsx        form unico login/registrazione
    chats-toolbar.tsx    nuova chat + esci
    chat.tsx             interfaccia chat con streaming
  lib/
    auth.ts              config Auth.js v5
    db.ts                client Turso (unico database del sito)
    schema.ts            schema Turso: users, chats, messages
    hermes.ts            collegamento a Hermes: provider + system prompt
  types/
    next-auth.d.ts       tipi di sessione
```
