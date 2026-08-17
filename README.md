# Giurista AI — la porta web per Hermes Agent

Il sito è **solo una porta** per parlare con il tuo **Hermes Agent** (che vive sulla tua VPS): registrazione/login, chat private per utente con streaming, e nient'altro. L'hosting del sito è su **Vercel**.

I dati sono divisi su due database:

- **Turso (SQLite)** — solo gli **utenti**: registrazione e login
- **PostgreSQL sulla VPS** — **chat e messaggi**, accanto a Hermes

```
                          ┌─▶ Turso (utenti: registrazione e login)
Browser ──▶ Next.js (Vercel) ──▶ Hermes Agent (VPS, API OpenAI-compatible)
                          └─▶ PostgreSQL (VPS: chat e messaggi)
```

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS) — solo frontend + route API
- **Auth.js (NextAuth) v5** — email/password, sessioni JWT, hash bcrypt
- **Drizzle ORM** — `@libsql/client` per Turso (utenti), `pg` per PostgreSQL (chat e messaggi)
- **Vercel AI SDK** — `useChat` sul client, `streamText` sulla route di streaming
- **`@ai-sdk/openai`** in modalità Chat Completions (`/v1/chat/completions`), l'interfaccia esposta da Hermes Agent

> Nota: essendo su database diversi, tra `chats.user_id` (PostgreSQL) e gli utenti (Turso) non può esistere una chiave esterna. Ogni query carica comunque solo le chat il cui `user_id` corrisponde alla sessione autenticata.

## Setup locale

```bash
npm install
cp .env.example .env.local
```

Compila `.env.local`:

| Variabile | Descrizione |
|---|---|
| `TURSO_DATABASE_URL` | URL del database Turso degli utenti (`libsql://...turso.io`); in locale puoi usare `file:./users.db` |
| `TURSO_AUTH_TOKEN` | Token Turso (vuoto per i database `file:`) |
| `DATABASE_URL` | `postgresql://utente:password@host:5432/nomedb` — il PostgreSQL sulla VPS, o uno locale |
| `DATABASE_SSL` | `true` per collegarsi al PG della VPS via internet con TLS (certificato self-signed) |
| `AUTH_SECRET` | Genera con `npx auth secret` |
| `HERMES_BASE_URL` | Base URL dell'API di Hermes, es. `https://hermes.tuodominio.it/v1` |
| `HERMES_API_KEY` | API key se configurata sul tuo Hermes, altrimenti vuoto |
| `HERMES_MODEL` | Identificativo del modello che Hermes si aspetta nel campo `model` |

Crea lo schema su entrambi i database e avvia:

```bash
npm run db:push         # PostgreSQL: tabelle chats e messages
npm run db:push:turso   # Turso: tabella users
npm run dev
```

## Preparare la VPS

### PostgreSQL raggiungibile da Vercel (chat e messaggi)

Vercel deve poter aprire una connessione TCP al tuo database, quindi il PostgreSQL deve essere esposto su internet (con password forte e TLS).

1. Crea database e utente:
   ```sql
   CREATE USER law_app WITH STRONG_PASSWORD_QUI;
   CREATE DATABASE law_llm OWNER law_app;
   ```

2. Abilita l'ascolto sulle interfacce esterne (`postgresql.conf`):
   ```
   listen_addresses = '*'
   ```

3. Consenti solo connessioni cifrate con autenticazione scram (`pg_hba.conf`):
   ```
   hostssl law_llm law_app 0.0.0.0/0 scram-sha-256
   hostssl law_llm law_app ::/0 scram-sha-256
   ```

4. Genera un certificato (self-signed è sufficiente, il sito usa `DATABASE_SSL=true`):
   ```bash
   openssl req -new -x509 -days 365 -nodes -text \
     -out server.crt -keyfile server.key -subj "/CN=tuodominio.it"
   chown postgres:postgres server.crt server.key && chmod 600 server.key
   ```
   e punta `ssl_cert_file` / `ssl_key_file` ad essi.

5. Apri la porta 5432 sul firewall della VPS, poi imposta sul sito:
   ```
   DATABASE_URL=postgresql://law_app:password@tua-vps:5432/law_llm
   DATABASE_SSL=true
   ```

### Hermes Agent dietro HTTPS

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
2. In **Settings → Environment Variables** aggiungi le variabili di `.env.example`.
3. Deploy. La prima volta esegui `npm run db:push` e `npm run db:push:turso` puntando le variabili d'ambiente ai database di produzione.

> La route di streaming ha `maxDuration = 60` secondi. Su Vercel Hobby il limite è 60s; su Pro puoi alzarlo se le risposte di Hermes richiedono più tempo.

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
      register/          creazione account (Turso)
      chats/             elenco + creazione chat (PostgreSQL)
      chat/[chatId]/     streaming della risposta + eliminazione chat (PostgreSQL)
  components/
    auth-form.tsx        form unico login/registrazione
    chats-toolbar.tsx    nuova chat + esci
    chat.tsx             interfaccia chat con streaming
  lib/
    auth.ts              config Auth.js v5 (utenti su Turso)
    users-db.ts          client Turso (utenti)
    users-schema.ts      schema Turso: users
    db.ts                client PostgreSQL (chat e messaggi)
    schema.ts            schema PostgreSQL: chats, messages
    hermes.ts            collegamento a Hermes: provider + system prompt
  types/
    next-auth.d.ts       tipi di sessione
```
