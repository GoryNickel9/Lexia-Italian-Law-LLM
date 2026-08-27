# Lexia — assistente legale sul diritto italiano

Progetto open source, in due parti che vivono su macchine diverse:

1. **Web app "Lexia"** (questa repository, radice) — l'applicazione web per parlare con un profilo isolato di **Hermes Agent**: registrazione/login, chat private per utente con streaming, crediti in euro, pannello di amministrazione. Ospitata su **Vercel**.
2. **Backend "Hermes Legal"** (`backend/`) — la pipeline Python che costruisce e mantiene un **corpus normativo italiano** (~151.000 atti / ~558.000 articoli) scaricato da [Normattiva](https://dati.normattiva.it/), con ricerca ibrida (pgvector + full-text) esposta da un'API read-only. Gira su una **VPS** con PostgreSQL 17 + pgvector.

Le risposte dell'assistente si basano **solo** sul corpus locale: niente web, niente conoscenza generale del modello come fallback, citazioni normative obbligatorie e post-check anti-allucinazione.

## Architettura

```
Browser ──▶ Next.js (Vercel)
              │  1. auth (Auth.js v5, JWT)
              │  2. POST /legal-api/search  (Bearer LEGAL_SEARCH_API_KEY)
              ▼
            legal_api.py — API read-only (VPS, systemd hermes-legal-search)
              │  SELECT only (ruolo PostgreSQL hermes_legal_api)
              ▼
            PostgreSQL 17 + pgvector — corpus Hermes Legal
              (legal_acts, legal_articles, legal_chunks, …)

            Next.js ──▶ Hermes Agent, profilo hermes_legal_site (VPS)
                          │  /v1/chat/completions (OpenAI-compatible)
                          │  system prompt + blocco "RISULTATI DEL CORPUS LOCALE"
                          └─▶ risposta in streaming, basata solo sul contesto recuperato
```

Punti fermi dell'architettura:

- **La web app non si collega mai direttamente a PostgreSQL.** Interroga solo l'API read-only `legal_api.py` (endpoint `/search`, `/health`, `/verify-citations`).
- **Il profilo Hermes `hermes_legal_site` è isolato**: toolsets vuoti (niente terminal, browser, web, Telegram, Discord). Riceve dalla web app soltanto il contesto recuperato dal corpus locale, iniettato nel prompt.
- **Se il retrieval non è disponibile, la route di chat risponde 503**: nessun fallback web, il profilo non risponde mai senza fonti locali.
- **Due database separati**: Turso (SQLite) per i dati della web app (utenti, chat, messaggi, impostazioni); PostgreSQL sulla VPS solo per il corpus normativo.

## Struttura della repository

```
├── src/                        # Web app Next.js (Lexia)
│   ├── app/
│   │   ├── login/  register/   # pagine di accesso e registrazione
│   │   ├── chats/  chats/[id]/ # layout con sidebar + pagina chat (streaming)
│   │   ├── admin/              # pannello di amministrazione (solo admin)
│   │   └── api/
│   │       ├── auth/           # endpoint Auth.js
│   │       ├── register/       # creazione account (rispetta registrazioni aperte/chiuse)
│   │       ├── chats/          # elenco + creazione chat
│   │       ├── chat/[chatId]/  # streaming risposta + eliminazione chat (addebito crediti)
│   │       ├── user/…          # cambio email / password / tema
│   │       ├── admin/…         # admin: utenti, credito, prezzi, registrazioni
│   │       └── health/         # diagnostica collegamenti (Turso, Hermes)
│   ├── components/             # chat, sidebar, pannelli, modali, toggle tema
│   ├── lib/
│   │   ├── auth.ts             # config Auth.js v5 (ruolo admin nel JWT)
│   │   ├── db.ts               # client Turso (lazy, unico database della web app)
│   │   ├── schema.ts           # schema Drizzle: users, chats, messages, settings
│   │   ├── settings.ts         # impostazioni globali (registrazioni, prezzi token)
│   │   ├── peak.ts             # finestre di tariffazione peak (UTC)
│   │   ├── hermes.ts           # provider Hermes + system prompt "solo diritto italiano"
│   │   ├── legal.ts            # chiamata all'API retrieval + formattazione del contesto
│   │   └── admin.ts  format.ts
│   └── types/
├── backend/                    # Pipeline corpus Hermes Legal (VPS) — vedi backend/README.md
│   ├── scripts/                # sync, ingest, parser AKN, search, API, watchdog, …
│   ├── config/config.yaml      # collezioni Normattiva, DB, modelli
│   ├── database/migrations/    # schema PostgreSQL + pgvector
│   ├── tests/                  # suite T1–T15, benchmark retrieval, e2e web app
│   └── raw/primary/            # PDF ufficiale della Costituzione (fonte primaria)
├── drizzle.config.ts           # drizzle-kit push (dialect turso)
└── package.json
```

---

## Parte 1 — Web app (Lexia)

### Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4) — frontend + route API
- **Auth.js (NextAuth) v5** — email/password, sessioni JWT, hash bcrypt
- **Drizzle ORM + @libsql/client** — Turso per tutti i dati della web app
- **Vercel AI SDK** (`useChat` sul client, `streamText` sulla route di streaming) con **`@ai-sdk/openai`** in modalità Chat Completions (`/v1/chat/completions`), l'interfaccia esposta da Hermes Agent

### Setup locale

```bash
npm install
cp .env.example .env.local   # compila le variabili (tabella sotto)
npm run db:push              # crea le tabelle users, chats, messages, settings
npm run dev
```

In locale puoi usare Turso con `TURSO_DATABASE_URL=file:./app.db` e token vuoto.

### Variabili d'ambiente

| Variabile | Descrizione |
|---|---|
| `TURSO_DATABASE_URL` | URL del database Turso (`libsql://...turso.io`); in locale `file:./app.db` |
| `TURSO_AUTH_TOKEN` | Token Turso (vuoto per i database `file:`) |
| `AUTH_SECRET` | Genera con `npx auth secret` |
| `HERMES_BASE_URL` | Base URL del profilo legale, es. `https://hermes.tuodominio.it/p/hermes_legal_site/v1` |
| `HERMES_API_KEY` | `API_SERVER_KEY` del profilo `hermes_legal_site` |
| `HERMES_MODEL` | `hermes_legal_site` |
| `LEGAL_SEARCH_URL` | URL HTTPS del retrieval API, es. `https://hermes.tuodominio.it/legal-api` |
| `LEGAL_SEARCH_API_KEY` | Chiave del retrieval API read-only |
| `ADMIN_EMAILS` | Email (separate da virgole) che al login diventano amministratori e accedono a `/admin` |

### Funzionalità

- **Chat private per utente** con streaming; layout a due colonne (chat a sinistra, conversazione al centro); dalla schermata iniziale si scrive subito e la chat viene creata al primo invio; il titolo della chat è ricavato dal primo messaggio.
- **Storico dal database, mai dal client**: la route di streaming carica sempre lo storico da Turso (max 40 messaggi); il client fornisce solo l'ultima domanda.
- **Tema chiaro/scuro** — toggle nella sidebar e nelle pagine di login; la preferenza è salvata nel browser e, per gli utenti registrati, anche nel database (vale su tutti i dispositivi).
- **Impostazioni utente** — cambio email e cambio password (con verifica della password attuale).
- **Pannello admin** (`/admin`, solo admin) — elenco utenti, eliminazione account, aggiunta/modifica credito, prezzi input/output per milione di token per fascia peak e off-peak, apertura/chiusura delle registrazioni.

### Crediti e tariffazione a token

Ogni utente parte con un credito di benvenuto di **5,00 €**. Ogni risposta è tariffata in base ai token di input e output effettivamente consumati (prezzi €/milione, configurabili dall'admin con fino a 3 decimali). **Tutti pagano, admin compresi.**

- **Due fasce orarie** (valutate sempre in UTC, decise all'arrivo della richiesta): **peak** 01:00–04:00 e 06:00–10:00 UTC, **off-peak** in tutte le altre ore. La fascia attiva è indicata live nell'header della chat e nel pannello admin.
- **Prezzi di default**: €0,44 / milione di token di input e €1,32 / milione di output (off-peak); i prezzi peak partono uguali e l'admin li può differenziare.
- **Arrotondamento**: il costo esatto si conosce solo a generazione conclusa; i costi sotto il centesimo vengono accumulati in millesimi di centesimo (`unbilled_millicents`) e scalati dal saldo appena maturano centesimi interi, mai sotto zero (una singola `UPDATE` atomica).
- Sotto ogni risposta vengono mostrati token consumati e costo; il credito residuo è visibile nella sidebar.
- Se il credito è esaurito la route risponde **402** con l'invito a contattare l'amministratore.

### Database della web app (Turso)

| Tabella | Contenuto |
|---|---|
| `users` | id, email, hash password, ruolo (`user`/`admin`), `balance_cents`, `unbilled_millicents`, tema preferito |
| `chats` | chat per utente, titolo, timestamp |
| `messages` | messaggi di chat; per le risposte: `input_tokens`, `output_tokens`, `cost_millicents` (il costo pagato, indipendente da futuri cambi di prezzo) |
| `settings` | impostazioni globali key/value: `registrations_open`, prezzi token per fascia |

### Ambito "solo diritto italiano"

La web app antepone a ogni conversazione il system prompt definito in `src/lib/hermes.ts` ("Lexia"): risponde solo di diritto italiano, cita gli articoli rilevanti, rifiuta gentilmente le domande fuori tema, non usa il web come fallback, non inventa mai articoli/URN/sentenze e chiude con il disclaimer "non sono un avvocato". Se preferisci gestire l'ambito direttamente nella configurazione del tuo Hermes, svuota la costante `SYSTEM_PROMPT` in quel file: la web app funziona comunque come semplice porta.

---

## Parte 2 — Backend Hermes Legal (`backend/`)

Pipeline e servizi del corpus normativo che alimentano il retrieval. Documentazione approfondita, pitfall e changelog completo: **[`backend/README.md`](backend/README.md)**.

### Componenti

| File | Ruolo |
|---|---|
| `scripts/legal_api.py` | Gateway HTTP read-only: `GET /health`, `POST /search` (query, reference_date, max_results), `POST /verify-citations` (post-check anti-allucinazione: verifica che le URN citate dal LLM esistano nel DB). Auth Bearer `LEGAL_API_KEY`. |
| `scripts/search.py` | Ricerca ibrida: pgvector (`<=>`), FTS (`to_tsquery`), keyword boost, tier esatto per numero articolo, temi con articoli chiave, priorità dei codici, reranker opzionale fuso via RRF, citazioni obbligatorie. |
| `scripts/query_expansion.py` | Espansione lessicale della query con sinonimi giuridici prima dell'embedding (es. "rubo" → "furto sottrazione…": il testo dell'art. 624 c.p. non contiene "furto"). |
| `scripts/embedder.py` | Bi-encoder lazy singleton (`paraphrase-multilingual-MiniLM-L12-v2`, 384 dim). |
| `scripts/reranker.py` | Cross-encoder opzionale (`mmarco-mMiniLMv2-L12-H384-v1`). **Disattivato di default**; opt-in con `LEGAL_RERANK_ENABLED=true`. |
| `scripts/akn_parser.py` | Parser AKN duale (struttura moderna `<article>` vs `<paragraph>` classica), file base64, rimozione padding 1 MiB, pulizia marcatori `(( ))`. |
| `scripts/ingest.py` / `ingest_batch.py` | Ingest idempotente per URN/hash, embedding a batch, versioni preservate. |
| `scripts/ingest_bulk.py` + `ingest_abrogati_loop.sh` | Ingest ottimizzato per collezioni enormi (es. 124k abrogati): embedding in batch, transazioni a gruppi, `--resume` per hash-skip, `--max-attos` per tranche. |
| `scripts/sync.py` | Sync settimanale resumibile: checkpoint per collezione, `--collection`, `--max-new-acts`, SIGTERM/SIGINT graceful, stati `success/partial/failed`, hash-skip, download resiliente (zip temporanea + validazione firma `PK`, 5 retry, fallback sulla zip in cache). |
| `scripts/sync_cron.sh` | Wrapper cron della sync (domenica 03:15 Europe/Rome); cache su disco e log in `/opt/hermes-legal/logs/sync.log`. |
| `scripts/watchdog.py` / `watchdog_cron.sh` | Health watchdog della sync (cron giornaliero ore 8): stampa un ALERT solo se l'ultimo sync è fallito o troppo vecchio (`--max-age-hours 30`), silenzioso se tutto è ok. |
| `scripts/build_constitution_primary.py` | Converte il PDF ufficiale della Costituzione (Presidenza del Consiglio) in AKN: 139 articoli validati, fonte primaria. |
| `scripts/recover_missing_rd.py` | Recupero dei R.D. troncati dal CDN di Normattiva via `dettaglio-atto-urn` + AKN sintetico (mai upsert di atti parziali su URN già completi). |
| `scripts/recover_leggi_ordinarie.py` | Recupero delle leggi ordinarie non-DL assenti dalle collezioni preconfezionate, via `ricerca/semplice` + `dettaglio-atto` paginato per `idArticolo`. |
| `scripts/vigency.py` | Motore di vigenza: selezione per metadati `valid_from`/`valid_to` rispetto alla data di riferimento, mai per similarità semantica. |
| `database/migrations/001_schema.sql` | Schema PostgreSQL + pgvector. |
| `config/config.yaml` | Collezioni sincronizzate, parametri sync, DB, modelli. |
| `tests/` | Suite T1–T15, benchmark retrieval (`eval_retrieval.py`), test end-to-end del flusso della web app (`test_e2e_site.py`). |

### Pipeline dati

```
Normattiva open-data API (AKN)
   │  sync.py — download collezione (2-step cookie, retry, validazione zip)
   ▼
akn_parser.py — parsing AKN, pulizia, stripping padding
   │  ingest*.py — upsert idempotente per URN + content_hash (hash-skip)
   ▼
PostgreSQL: legal_acts → legal_articles → legal_chunks (+ embedding MiniLM 384d)
   │  search.py — ricerca ibrida al momento della domanda
   ▼
legal_api.py (read-only) ←──── Next.js /api/chat/[chatId]
```

**Collezioni sincronizzate** (`config.yaml`): Codici, Leggi costituzionali, Testi Unici, DPCM, DL e leggi di conversione, DPR, Regi decreti, Decreti Legislativi, Atti normativi abrogati (in originale). Gli atti abrogati vengono scaricati in formato **O** (originale) e marcati `status='abrogato'` su atti/articoli/chunks — la vigenza è un dato giuridico, non un'ipotesi. Tre collezioni minori (D.Lgs luogotenenziali, R.D. legislativi, delegazione UE) sono temporaneamente escluse perché il download vigente di Normattiva restituisce zip vuote (problema lato server, 2026-08-21); il contenuto è già nel DB.

### Variabili d'ambiente del backend

```text
# PostgreSQL (servizi e script)
LEGAL_DB_HOST=127.0.0.1 | /var/run/postgresql   # peer auth per il servizio read-only
LEGAL_DB_PORT=5432
LEGAL_DB_NAME=hermes_legal
LEGAL_DB_USER=hermes_legal_app | hermes_legal_api   # read-only per l'API
LEGAL_DB_PASSWORD=<dall'ambiente; in produzione obbligatoria, nessun segreto nel repo>

# Retrieval API (legal_api.py)
LEGAL_API_HOST=127.0.0.1
LEGAL_API_PORT=8750
LEGAL_API_KEY=<chiave del retrieval>
LEGAL_API_ALLOW_UNAUTH=false

# Modelli (non committati, in /opt/hermes-legal/models/)
LEGAL_EMBED_MODEL=/opt/hermes-legal/models/multilingual-minilm
LEGAL_RERANK_MODEL=/opt/hermes-legal/models/cross-encoder-mmarco

# Ricerca
LEGAL_RERANK_ENABLED=false    # true = attiva il cross-encoder (opt-in)
LEGAL_RERANK_CANDIDATES=100
LEGAL_RRF_K=60                # parametro fusione RRF
LEGAL_KEYWORD_BOOST=0.01      # peso del boost lessicale per match
LEGAL_FTS_CANDIDATES=60       # finestra candidati FTS

# Sync
LEGAL_NORMATTIVA_BASE=https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1
LEGAL_CACHE=/opt/hermes-legal/cache   # su disco: le collezioni grandi non stanno nel tmpfs
```

### Schema PostgreSQL (corpus)

| Tabella | Contenuto |
|---|---|
| `legal_acts` | atti normativi: titolo, tipo, numero, date, URN unica, fonte, giurisdizione, `status` (vigente/abrogato), versioni, `source_hash` |
| `legal_articles` | struttura articolo/comma/lettera (libro, titolo, capo, sezione, numero, rubrica, livello), testo, `valid_from`/`valid_to`, `status` |
| `legal_versions` | versioni storiche/consolidate di un atto |
| `amendments` | modifiche apportate a un articolo da altre norme |
| `legal_chunks` | chunk giuridici con **embedding pgvector (384d)** e metadati JSONB |
| `sources` | catalogo fonti con livello di autorevolezza (Governo Italiano 100, Normattiva 90, Wikisource 10) |
| `sync_runs` | registro di ogni sincronizzazione (stato, atti aggiunti/modificati, errori) |
| `system_state` | stato persistente (es. `last_successful_sync`) |

### Qualità del retrieval

Benchmark su 25 domande legali reali con citazione attesa (`tests/eval_retrieval.py`, metriche Recall@k e MRR@k), dopo l'intera catena di fix (espansione query, tier esatto per numero articolo, temi con articoli chiave, priorità dei codici, FTS sempre fusa via RRF):

- **MRR@10: 0,621** (baseline 0,321)
- **Recall@1: 52%** (baseline 20%)
- **Recall@10: 84%** (baseline 56%)

Il reranker cross-encoder resta **opt-in** perché i suoi logit degradano il ranking sul diritto italiano; quando attivo viene fuso col ranking vettoriale tramite RRF, non sostituito.

---

## Sicurezza

- **Nessun segreto committato**: tutte le credenziali (`LEGAL_DB_*`, `LEGAL_API_KEY`, `HERMES_API_KEY`, token Turso) arrivano dall'ambiente.
- **Ruolo PostgreSQL `hermes_legal_api` con soli SELECT** e utente Linux dedicato: il servizio `hermes-legal-search` non gira come root e non può scrivere nel corpus.
- **API retrieval autenticata** (Bearer `LEGAL_API_KEY`), esposta solo dietro HTTPS, e mai come endpoint SQL generico.
- **Profilo Hermes isolato**: il profilo `hermes_legal_site` non ha accesso a terminal, browser, web, Telegram o Discord; può rispondere solo sul contesto iniettato dalla web app.
- **Client non fidato**: lo storico conversazione è sempre caricato dal database, mai dai messaggi inviati dal client.
- **Anti-allucinazione**: endpoint `/verify-citations` per verificare che le URN citate dal modello esistano nel corpus con stato e vigenza; test e2e del flusso completo web app → search → profilo → verify.

---

## Operazioni sulla VPS

### Servizio retrieval

```text
/etc/systemd/system/hermes-legal-search.service   # esegue legal_api.py
/etc/hermes-legal/legal-api.env                   # LEGAL_API_KEY, LEGAL_DB_*
```

```bash
sudo systemctl enable --now hermes-legal-search
```

Pubblica `/search` dietro HTTPS (es. `https://hermes.tuodominio.it/legal-api` con Caddy/nginx) e imposta `LEGAL_SEARCH_URL` + `LEGAL_SEARCH_API_KEY` nelle variabili Vercel.

### Hermes Agent e profilo legale dietro HTTPS

Il gateway predefinito deve servire il profilo tramite multiplexing:

```yaml
gateway:
  multiplex_profiles: true
  multiplex_profile_allowlist:
    - hermes_legal_site
```

Il profilo secondario usa il prefisso HTTP `/p/hermes_legal_site/`. Nel file `/root/.hermes/profiles/hermes_legal_site/.env` (senza committarlo):

```text
API_SERVER_ENABLED=true
API_SERVER_KEY=<chiave-segreta-del-profilo>
```

Dopo aver impostato la chiave, riavvia il gateway. Dietro Caddy:

```text
hermes.tuodominio.it {
    reverse_proxy 127.0.0.1:8642
}
```

### Cron

| Job | Orario | Cosa fa |
|---|---|---|
| `sync_cron.sh` | domenica 03:15 (Europe/Rome) | sync settimanale delle collezioni; log in `/opt/hermes-legal/logs/sync.log`; usa il venv di Hermes (`psycopg2` assente nel python di sistema) |
| `watchdog_cron.sh` | ogni giorno, 08:00 | controlla l'ultimo sync in `sync_runs`; ALERT solo se fallito o più vecchio di 30 ore |

La sync è **resumibile**: se un run termina `partial` o `failed` (SIGTERM, limite `--max-new-acts`, errori), il run successivo riprende dagli hash già presenti e solo un run completo aggiorna `last_successful_sync`.

---

## Test e valutazione

```bash
# Backend (sulla VPS, con le variabili LEGAL_DB_* caricate)
python3 backend/tests/test_core.py            # suite T1–T15 (import, articoli, vigenza,
                                              # citazioni, idempotenza sync, semantica,
                                              # keyword boost, hash-skip, multi-collezione, …)
python3 backend/tests/eval_retrieval.py       # benchmark Recall@k / MRR@k
LEGAL_RERANK_ENABLED=true python3 backend/tests/eval_retrieval.py   # confronto col reranker
python3 backend/tests/test_e2e_site.py        # e2e: web app → /search → profilo → /verify-citations

# Frontend
npm run lint
npm run build
```

## Deploy su Vercel

1. Importa la repository su Vercel.
2. In **Settings → Environment Variables** aggiungi le variabili di `.env.example`, spuntando **Production** (e Preview se lo usi). In produzione sono obbligatorie anche `LEGAL_SEARCH_URL` e `LEGAL_SEARCH_API_KEY`.
3. Deploy. La prima volta crea lo schema su Turso:
   ```bash
   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=eyJ... npm run db:push
   ```
   (oppure incolla il SQL delle quattro tabelle nella console web di Turso).

> La route di streaming ha `maxDuration = 60` secondi. Su Vercel Hobby il limite è 60s; su Pro puoi alzarlo se le risposte di Hermes richiedono più tempo.

## Risoluzione problemi

- **`/api/health`** verifica i due collegamenti (Turso e Hermes) e riporta l'errore utile: aprilo sul dominio della web app.
- Se la **registrazione** risponde 500, il messaggio nel form indica la causa più probabile: variabile d'ambiente mancante, token Turso errato, o tabelle assenti (in quel caso esegui `npm run db:push` con le variabili di produzione).
- Se la **chat** risponde 503, il retrieval locale non è configurato o raggiungibile: controlla il servizio `hermes-legal-search` sulla VPS e le variabili `LEGAL_SEARCH_*`.
- Se la **sync** segnala problemi, il watchdog la segnala al cron delle 8; i dettagli sono in `/opt/hermes-legal/logs/sync.log` e nella tabella `sync_runs`.
- I dettagli completi della web app sono nei **log delle funzioni** su Vercel (Deployments → Logs).

## Stato del corpus (ultimo censimento 2026-08-19)

**~151.000 atti / ~558.000 articoli / ~558.000 chunk** con embedding 384d, incluse le collezioni Codici, Leggi costituzionali, Testi Unici, DPCM, DL e leggi di conversione, DPR (47.706), Regi decreti (90.909), Decreti Legislativi (2.922), leggi ordinarie recuperate e atti abrogati in corso di ingest. La Costituzione proviene dal PDF ufficiale del Governo Italiano (fonte "Governo Italiano", 139 articoli validati).

Changelog tecnico completo, pitfall (padding 1 MiB, zip vuote dal CDN, FK senza indice, OOM in ingest bulk, upsert di atti parziali) e storia del tuning del retrieval: **[`backend/README.md`](backend/README.md)**.

## Licenza

Copyright (C) 2026 Luca BAldino

Il codice di questa repository è rilasciato sotto **GNU AGPL-3.0** (vedi [`LICENSE`](LICENSE)): chiunque lo usi per offrire un servizio, anche modificato e anche senza distribuirlo, deve rilasciare il codice del servizio con la stessa licenza.

I **dati** sono un'altra cosa rispetto al codice: il corpus normativo scaricato da [Normattiva](https://dati.normattiva.it/) resta soggetto alle condizioni d'uso della fonte e non è ridistribuito in questa repository. Il PDF della Costituzione in `backend/raw/primary/` è un atto pubblico ufficiale (Presidenza del Consiglio dei Ministri).
