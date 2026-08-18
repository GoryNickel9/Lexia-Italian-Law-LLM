# Backend Hermes Legal

Pipeline e servizi del **corpus normativo italiano** (Hermes Legal) che alimentano il
retrieval del sito. Il sito non si collega mai direttamente a PostgreSQL: chiama
l'API read-only (`legal_api.py`) che espone solo `/search` e `/health`.

> **Credenziali**: nessun segreto è committato. Tutte le credenziali vanno lette
> dall'ambiente (`LEGAL_DB_*`, `LEGAL_API_KEY`, `HERMES_API_KEY`, …). I file di questo
> repository non hanno default di password.

## Architettura

```
utente sul sito (Vercel)
        │  HTTPS
        ▼
/api/chat/:id  (Next.js, src/lib/legal.ts)
        │  POST /legal-api/search  (Bearer LEGAL_SEARCH_API_KEY)
        ▼
legal_api.py  (servizio systemd hermes-legal-search, utente hermes_legal_api)
        │  SELECT only (ruolo PostgreSQL hermes_legal_api, peer auth)
        ▼
PostgreSQL 17 + pgvector  (hermes_legal: legal_acts, legal_articles, legal_chunks, …)
```

La risposta al sito è generata dal profilo Hermes dedicato `hermes_legal_site`
(API server multiplexing, senza web/terminal/Telegram/Discord), con il blocco
`RISULTATI DEL CORPUS LOCALE` iniettabo nel prompt.

## Componenti

| File | Ruolo |
|---|---|
| `scripts/legal_api.py` | Gateway HTTP read-only: `GET /health`, `POST /search` (query, reference_date, max_results). Auth Bearer con `LEGAL_API_KEY`. |
| `scripts/search.py` | Ricerca semantica vettoriale (pgvector `<=>`), espansione query, keyword boost, reranker opzionale con fusione RRF, citazioni obbligatorie. |
| `scripts/query_expansion.py` | **Espansione lessicale** della query con sinonimi giuridici prima dell'embedding (es. "rubo" → "furto rubare sottrazione impossessamento della cosa mobile altrui"). Risolve il caso in cui il testo della norma non contiene le parole della domanda (art. 624 c.p. non contiene "furto"). |
| `scripts/embedder.py` | Bi-encoder lazy singleton (`paraphrase-multilingual-MiniLM-L12-v2`, 384 dim). |
| `scripts/reranker.py` | Cross-encoder opzionale (`mmarco-mMiniLMv2-L12-H384-v1`). **Disattivato di default**: i suoi logit degradano il ranking del diritto italiano; si abilita con `LEGAL_RERANK_ENABLED=true` e viene fuso col ranking vettoriale via RRF. |
| `scripts/akn_parser.py` | Parser AKN duale: struttura moderna `<article>` vs `<paragraph>` classica, file base64, pulizia marcatori `(( ))`. |
| `scripts/ingest.py` / `ingest_batch.py` | Ingest idempotente per URN/hash, embedding a batch, versioni preservate. |
| `scripts/sync.py` | Sync settimanale resumibile: checkpoint per collezione, `--max-new-acts`, SIGTERM/SIGINT graceful, stati `success/partial/failed`, hash-skip. |
| `scripts/sync_cron.sh` | Wrapper cron (domenica 03:15 Europe/Rome). |
| `scripts/watchdog.py` / `watchdog_cron.sh` | Health watchdog della sync (cron Hermes `0 8 * * *`). |
| `scripts/build_constitution_primary.py` | Converte il PDF ufficiale del Governo Italiano in AKN (139 articoli validati). |
| `database/migrations/001_schema.sql` | Schema PostgreSQL + pgvector. |
| `tests/test_core.py` | Suite T1–T15: import, articoli, vigenza, citazioni, sync idempotente, semantica, keyword boost, hash-skip, multi-collezione, Costituzione primaria, reranker opt-in. |
| `raw/primary/costituzione_governo.pdf` | Fonte primaria immutabile della Costituzione (Presidenza del Consiglio dei Ministri), sha256 `fca531345ddd6ee1ea90968ddc347e343cdc173b63ad342d6e730f79e76ab7df`. |

## Variabili d'ambiente

```text
# PostgreSQL (servizi e script)
LEGAL_DB_HOST=127.0.0.1 | /var/run/postgresql (peer auth per il servizio read-only)
LEGAL_DB_PORT=5432
LEGAL_DB_NAME=hermes_legal
LEGAL_DB_USER=hermes_legal_app | hermes_legal_api (read-only)
LEGAL_DB_PASSWORD=<dall'ambiente, nessun default>

# Retrieval API (legal_api.py)
LEGAL_API_HOST=127.0.0.1
LEGAL_API_PORT=8750
LEGAL_API_KEY=<chiave del retrieval>

# Modelli
LEGAL_EMBED_MODEL=/opt/hermes-legal/models/multilingual-minilm
LEGAL_RERANK_MODEL=/opt/hermes-legal/models/cross-encoder-mmarco

# Ricerca
LEGAL_RERANK_ENABLED=false          # true = attiva il cross-encoder (opt-in)
LEGAL_RERANK_CANDIDATES=100         # finestra candidati
LEGAL_RRF_K=60                      # parametro fusione RRF
LEGAL_KEYWORD_BOOST=0.01            # peso del boost lessicale per match

# Sync
LEGAL_NORMATTIVA_BASE=<API Normattiva opendata>
LEGAL_CACHE=/tmp/hermes-legal-sync
```

## Modelli (non committati)

Scaricati in `/opt/hermes-legal/models/` sulla VPS:

```bash
# bi-encoder (embedding, 384 dim)
#   paraphrase-multilingual-MiniLM-L12-v2
# cross-encoder (reranker opzionale, 470MB)
#   cross-encoder/mmarco-mMiniLMv2-L12-H384-v1
```

## Changelog

### 2026-08-18 — retrieval: temi con articoli di riferimento + priorita' codici
- Nuova mappa `TEMA_ARTICOLI` (omicidio, furto, truffa, danno, stalking,
  licenziamento): le domande su un tema iniettano SEMPRE gli articoli chiave
  del codice (es. omicidio -> 575-589 c.p.), risolvendo il caso in cui il
  bi-encoder non collega la domanda al testo degli articoli (struttura a
  elenco di circostanze: es. 576/577 c.p. restavano fuori dai candidati).
- Priorita' dei codici: Costituzione e R.D. (c.p./c.c.) hanno un offset
  -0.05 nella distanza quando iniettati, cosi' battono atti minori con lo
  stesso numero di articolo (DPR, D.Lgs).
- Verifiche: "Pene omicidio e tipologie" -> 579, 577, 578, 576, 589, 575,
  584 (tutti c.p.); "art. 21" -> Costituzione in top-8; T1-T15 ALL PASS.

### 2026-08-18 — retrieval: match esatto per numero di articolo + elisioni
- Query con riferimento numerico ("art. 577", "articolo 576"): i chunk con quel
  numero entrano sempre nei candidati con priorità, anche se l'embedding non li
  avvicina (es. "art. 624 furto" → art. 624 c.p. #1; "art 577 omicidio aggravato"
  → art. 577 c.p. #1).
- Normalizzazione delle elisioni italiane in `expand_query` (`l'ergastolo` →
  `ergastolo`), che impedivano il match dei sinonimi.
- Fix `or 1.0` nel keyword boost: la distanza 0.0 (hit esatto) non veniva più
  considerata falsy e rispedita in fondo.

### 2026-08-18 — retrieval: espansione query + reranker opt-in
- **Causa**: la domanda "Quali conseguenze se rubo" non recuperava l'art. 624 c.p.
  perché il testo dell'articolo non contiene "furto"/"rubare" e il bi-encoder
  MiniLM non lo avvicinava; il cross-encoder mmarco (diventato default in una
  sessione precedente) declassava ulteriormente il ranking (codice assicurazioni
  sopra art. 2043 c.c.).
- **Fix**: `query_expansion.py` espande la query con sinonimi giuridici prima
  dell'embedding; il reranker è ora **opt-in** (`LEGAL_RERANK_ENABLED=true`) e,
  quando attivo, fuso col ranking vettoriale tramite RRF; keyword boost ridotto
  a 0.01/match e deduplicato.
- **Verifica esterna**: "Quali conseguenze se rubo" → art. 624-bis #2, art. 624 #3;
  "risarcimento" → art. 2043 #1; "uccido" → art. 575 #1; "furto in casa" → 624-bis #1.
- Suite **T1–T15 ALL PASS**.

### 2026-08-18 — hardening e Costituzione primaria
- Ruolo PostgreSQL `hermes_legal_api` (SELECT only, verificato t/f/f) e utente
  Linux dedicato; il servizio `hermes-legal-search` non gira più come root.
- Costituzione ingerita dal PDF ufficiale del Governo Italiano
  (`build_constitution_primary.py`, 139 articoli, fonte "Governo Italiano").

### 2026-08-17 — sync resumibile e DPCM completato
- `sync.py`: checkpoint atomici per collezione, `--max-new-acts`, gestione
  SIGTERM/SIGINT, stati `partial/failed/success`, resume via `source_hash`.
- DPCM completato a blocchi (362/362 file); config: Codici, Leggi
  costituzionali, Testi Unici, DPCM. DB: 709 atti / 75.921 articoli / 75.921 chunk 384d.

### 2026-08-17 — integrazione sito
- `legal_api.py` pubblicato dietro HTTPS (nginx + Cloudflare) su
  `https://hermes.tuodominio.it/legal-api`; profilo `hermes_legal_site` via
  `https://hermes.tuodominio.it/p/hermes_legal_site/v1` (gateway multiplex, allowlist).
