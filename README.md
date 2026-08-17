# Giurista AI — la porta web per Hermes Agent

Il sito è **solo una porta** per parlare con il tuo **Hermes Agent** (che vive sulla tua VPS): registrazione/login, chat private per utente con streaming, e nient'altro. L'hosting del sito è su **Vercel**.

- **Turso (SQLite)** — database del sito: utenti, chat e messaggi
- **PostgreSQL sulla VPS** — corpus Hermes Legal; il sito non si collega direttamente al DB
- **API read-only Hermes Legal** — retrieval server-side del corpus locale

```
Browser ──▶ Next.js (Vercel) ──▶ API retrieval Hermes Legal (VPS)
                         └────▶ Hermes profile hermes_legal_site (VPS)
                                  └─▶ risposta basata sul contesto locale
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
| `HERMES_BASE_URL` | Base URL del profilo legale, es. `https://hermes.tuodominio.it/p/hermes_legal_site/v1` |
| `HERMES_API_KEY` | `API_SERVER_KEY` del profilo `hermes_legal_site` |
| `HERMES_MODEL` | `hermes_legal_site` |
| `LEGAL_SEARCH_URL` | URL HTTPS del retrieval API, es. `https://hermes.tuodominio.it/legal-api` |
| `LEGAL_SEARCH_API_KEY` | Chiave del retrieval API read-only |

Crea lo schema e avvia:

```bash
npm run db:push   # su Turso: tabelle users, chats, messages
npm run dev
```

## Hermes Agent e profilo legale dietro HTTPS

Il profilo `hermes_legal_site` è configurato sulla VPS con toolsets vuoti: non ha accesso a
terminal, browser, web, Telegram o Discord. Riceve dal sito soltanto il contesto recuperato
dall'API read-only Hermes Legal.

Il gateway predefinito deve servire il profilo tramite multiplexing:

```yaml
gateway:
  multiplex_profiles: true
  multiplex_profile_allowlist:
    - hermes_legal_site
```

Il profilo secondario usa il prefisso HTTP `/p/hermes_legal_site/`. Configura sulla VPS,
nel file `/root/.hermes/profiles/hermes_legal_site/.env` (senza committarlo):

```text
API_SERVER_ENABLED=true
API_SERVER_KEY=<chiave-segreta-del-profilo>
```

Dopo aver impostato la chiave, riavvia il gateway predefinito. Dietro Caddy:

```text
hermes.tuodominio.it {
    reverse_proxy 127.0.0.1:8642
}
```

Il sito usa quindi:

```text
HERMES_BASE_URL=https://hermes.tuodominio.it/p/hermes_legal_site/v1
HERMES_API_KEY=<API_SERVER_KEY-del-profilo>
HERMES_MODEL=hermes_legal_site
```

## Retrieval locale Hermes Legal

Il sito non interroga PostgreSQL direttamente. La VPS espone il servizio read-only
`/opt/hermes-legal/scripts/legal_api.py`, con endpoint:

```text
GET  /health
POST /search
```

Il servizio esegue `semantic_search()` nel corpus locale e restituisce testo, vigenza e
citazione. Il file systemd predisposto è:

```text
/etc/systemd/system/hermes-legal-search.service
```

Configurare `/etc/hermes-legal/legal-api.env` con `LEGAL_API_KEY`, quindi avviare:

```bash
sudo systemctl enable --now hermes-legal-search
```

Pubblicare `/search` dietro HTTPS, per esempio come `https://hermes.tuodominio.it/legal-api`,
e impostare `LEGAL_SEARCH_URL` e `LEGAL_SEARCH_API_KEY` nelle variabili Vercel.
La route Next.js restituisce 503 se il retrieval locale non è configurato o non è raggiungibile:
non esegue fallback web e non lascia il profilo rispondere senza fonti locali.

## Collegamento API standard

Il sito usa `@ai-sdk/openai` in modalità Chat Completions (`/v1/chat/completions`).
Il profilo può quindi essere messaggiato direttamente dal sito dopo aver configurato
la URL prefissata `/p/hermes_legal_site/v1` e la chiave del profilo.


## Ambito "solo diritto italiano"

Il sito antepone a ogni conversazione il system prompt definito in `src/lib/hermes.ts`, che limita le risposte al diritto italiano, impone il rifiuto gentile delle domande fuori tema e il disclaimer "non sono un avvocato". Se preferisci gestire l'ambito direttamente nella configurazione del tuo Hermes, svuota la costante `SYSTEM_PROMPT` in quel file: il sito funziona comunque come semplice porta.

Lo storico conversazione inviato a Hermes viene sempre caricato dal database, mai dai messaggi inviati dal client (il client fornisce solo l'ultima domanda).

## Deploy su Vercel

1. Importa il repository su Vercel.
2. In **Settings → Environment Variables** aggiungi le variabili di `.env.example`, spuntando **Production** (e Preview se lo usi). In produzione sono obbligatorie anche `LEGAL_SEARCH_URL` e `LEGAL_SEARCH_API_KEY`.
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
