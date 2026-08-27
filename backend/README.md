# Backend Hermes Legal

Pipeline e servizi del **corpus normativo italiano** (Hermes Legal) che alimentano il
retrieval della web app. La web app non si collega mai direttamente a PostgreSQL: chiama
l'API read-only (`legal_api.py`) che espone solo `/search` e `/health`.

> **Credenziali**: nessun segreto è committato. Tutte le credenziali vanno lette
> dall'ambiente (`LEGAL_DB_*`, `LEGAL_API_KEY`, `HERMES_API_KEY`, …). I file di questo
> repository non hanno default di password.

## Architettura

```
utente sulla web app (Vercel)
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

La risposta alla web app è generata dal profilo Hermes dedicato `hermes_legal_site`
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

- **Gap leggi ordinarie chiuso (2026-08-19)**: `recover_leggi_ordinarie.py` recupera le leggi non-DL (104/1992, 241/1990, 300/1970, 633/1941, 833/1978, 689/1981, 354/1975, 218/1995, 76/2016, ...) via `ricerca/semplice` (codiceRedazionale) + `dettaglio-atto` con paginazione `idArticolo=1..N`. Attenzione: `articoloHtml` del dettaglio-atto-urn restituisce SOLO il 1° articolo; il testo completo richiede la paginazione per idArticolo. Leggi a struttura "art. 1 unico con N commi" (es. 76/2016) escono con 1 articolo lungo — check `< 2` troppo severo, accettare se len > 1000.
- **Ingest bulk (2026-08-19)**: `ingest_bulk.py` per collezioni enormi (abrogati 124k): embedding in batch (batch 64 = 41 atti/s sugli skip, RAM contenuta), transazioni a gruppi, `--resume` per hash-skip, `--max-attos` per tranche. `ingest_abrogati_loop.sh` lo rilancia in tranche da 20k con retry. **Pitfall RAM**: batch 256 + modello + API (1.6G) su 7.7G con zero swap = OOM (exit -9); batch 64 è il compromesso stabile.
- **Pitfall FK**: `legal_chunks.article_id` NON aveva indice → ogni DELETE cascade faceva full scan di 575k righe (~2s/atto); `CREATE INDEX CONCURRENTLY idx_chunks_article` → 18ms (-100x).
- **Changelog**: 2026-08-19 — collezioni minori (D.Lgs 2.270, luogotenenziali, delegazione UE, RD legislativi) + benchmark retrieval MRR 0.321→0.621 + gap leggi ordinarie chiuso (20 leggi) + ingest abrogati in corso.
- Nuove collezioni in config.yaml: **Decreti Legislativi** (2.922 atti — prima nel DB c'erano solo 56 D.Lgs!), Decreti legislativi luogotenenziali (1.215), Leggi di delegazione europea (32), Regi decreti legislativi (120), Atti normativi abrogati (124.043, formato O).
- `sync.py`: `COLLECTION_OVERRIDES` — formato e status per collezione. Gli **atti abrogati** scaricati in formato O vengono marcati `status='abrogato'` in legal_acts/legal_articles/chunks (prima l'ingest forzava sempre 'vigente': errore giuridico corretto).
- `ingest.py`: parametro `status` per atto (upsert + articoli + chunk metadata).
- `ingest_bulk.py` (nuovo): ingest ottimizzato per collezioni enormi — embedding in batch da 256/512 invece che per-atto (~37 testi/s vs ~3/s; 124k abrogati: da ~86 ore a ~2 ore).
- `tests/eval_retrieval.py` (nuovo): benchmark di retrieval con 25 domande legali reali + citazione attesa; metriche Recall@k e MRR@k; salvataggio incrementale anti-timeout.
- **Benchmark**: MRR@10 **0.321 → 0.455** (+42%), Recall@1 20% → 32%, Recall@10 56% → 72%. Fix in `query_expansion.py`: `norm_token()` ora rimuove la punteggiatura (prima `"rapina?"` non matchava i sinonimi → art. 628 mai iniettato); +10 temi nuovi (violenza privata→610, usufrutto→978, prescrizione→2946, ebbrezza→186, soccorso→45, permessi→33, valutazione rischi→28, innocenza→27…).
- **Tuning retrieval finale** (`search.py`): MRR@10 **0.621**, Recall@1 **52%**, Recall@10 **84%** (da 0.321/20%/56% baseline). Fix:
  1. Tier esatto iniettato con ranking SQL per keyword nel testo (il `ORDER BY code_prio LIMIT 25` con 90k+ R.D. tagliava fuori i D.Lgs: D.Lgs 81/2008 art. 28 mai trovato);
  2. match sul **titolo atto** pesato 3x (query con "costituzione" → art. 3 Cost. anche se il testo dice "eguali" e non "uguaglianza");
  3. **token di rumore** esclusi dalle keyword ("art.", "comma", "codice"… falsavano il match: "art." in una citazione faceva battere la Costituzione da DPR irrilevanti);
  4. sinonimi "uguaglianza→eguali" in EXPANSIONS.
- DB dopo D.Lgs: **151.131 atti / 557.692 articoli** (atteso ~152.500 al termine delle 3 collezioni piccole).

### 2026-08-18 — recupero dei 72 R.D. mancanti (troncati dal CDN)
- Script `recover_missing_rd.py`: scarica da `POST /api/v1/atto/dettaglio-atto-urn`
  e costruisce un AKN sintetico (FRBR + mainBody con `<p>Art. N. ...</p>`) per
  gli atti il cui `articoloHtml` contiene testo reale.
- Esito: **12 dei 72 recuperati** (9 dal primo run + 3 dal secondo), inclusi
  R.D. 267/1942 (legge fallimentare), 1415/1938, 1077/1940, 1592/1933,
  1775/1933, 1629/1930... Gli altri **60** (54 abrogati + 6 con solo
  preambolo) non hanno testo recuperabile: l'endpoint restituisce solo
  "PROVVEDIMENTO ABROGATO" o il preambolo senza articoli.
- ⚠️ **Pitfall (fissato)**: il primo run del recover usava `ingest.ingest()`
  che fa upsert per URN con DELETE degli articoli esistenti — ha sovrascritto
  2 atti completi (R.D. 1592/1933: 314 art., 1775/1933: 237 art., dalla
  collezione Testi Unici) con il decreto di approvazione a 1 articolo.
  Ripristinati dai file originali; ora `act_exists_complete()` skippa gli
  URN gia' presenti nel DB con articoli. Regola: **non fare upsert di atti
  parziali su URN gia' completi**.
- DB totale finale: **148.917 atti / 501.686 articoli / 501.686 chunk**.
  T1-T15 ALL PASS; API pubblica OK.

### 2026-08-18 — collezioni DPR + Regi decreti (corpus quasi completo)
- **DPR**: 47.706 atti / 193.878 articoli-chunk ingeriti, 0 errori, SUCCESS.
- **Regi decreti**: 90.909 atti / 217.284 articoli-chunk ingeriti, SUCCESS;
  72 file su 90.983 (0,08%) scartati perche' troncati all'inizio dal CDN
  (vedi sotto). DB totale: **148.905 atti / 501.674 articoli / 501.674 chunk**.
- **FIX padding 1 MiB (akn_parser)**: i file RD arrivano riempiti di zeri fino
  a 1.048.576 byte (il 99% del file e' padding). `strip_trailing_padding()`
  tronca alla chiusura di `</akomaNtoso>`; senza questo fallivano 90.777 file.
- **FIX compattazione disco (sync.py)**: `_compact_padded_xml()` riscrive i
  file senza padding dopo l'estrazione: 90 GB -> ~1 GB per i sync futuri.
- **FIX tolleranza file malformati (sync.py)**: ingest per-file con try/except;
  i file corrotti vengono loggati (SKIP) e contati negli errori, il run
  prosegue invece di abortire (prima moriva al primo file rotto).
- **Hash normalizzato**: content_hash calcolato sul contenuto senza padding,
  cosi' l'hash-skip settimanale resta stabile tra download.
- Cache spostata su disco (`/opt/hermes-legal/cache`, LEGAL_CACHE nel
  wrapper cron): le collezioni grandi non stanno nel tmpfs da 3.9G.

### 2026-08-18 — collezione DL e leggi di conversione + retry download
- Aggiunta la collezione **"DL e leggi di conversione"** al sync (config.yaml):
  **9.748 atti / 22.549 articoli-chunk** ingeriti, 0 errori, Status SUCCESS
  (run ~22 min). Il pacchetto pre-confezionato contiene anche le leggi di
  conversione; gli atti sono classificati dal parser come `LEGGE` (dal URN).
  DB totale ora: **10.457 atti / 98.470 articoli / 98.470 chunk**.
- `sync.py` `download_collection`: **retry fino a 3 tentativi** con backoff e
  rigenerazione della `Location:` — il file-download CDN di Normattiva a volte
  risponde `200` con **0 byte** quando la generazione dell'archivio non e'
  ancora pronta (osservato: 1° tentativo 0 byte, 2° 59MB con `x-cache: HIT`).
  Prima il run falliva con "step2 ha prodotto uno zip vuoto" senza recupero.
- Pitfall documentato: `HEAD` sulla URL di download non e' supportato (409);
  per sondare la dimensione usare `curl -r 0-0 -D -` (leggere `content-range`).

### 2026-08-18 — ricerca ibrida FTS+semantica sempre attiva + temi estesi
- Fusione RRF **sempre attiva**: ranking vettoriale + ordinamento FTS (OR dei
  token espansi, `to_tsquery`, `ts_rank`) anche senza cross-encoder; il
  cross-encoder resta opt-in come terza lista. Gli hit esatti (numero/tema)
  restano un tier separato, fuori dalla fusione (RRF li diluirebbe).
- Finestra vettoriale sempre ampia (min 16 candidati, `LEGAL_FTS_CANDIDATES`
  default 60 per l'FTS).
- `TEMA_ARTICOLI` esteso: rapina, percosse/lesioni, diffamazione, calunnia,
  violenza sessuale, minacce, danneggiamento, omicidio stradale (589-bis),
  locazione (c.c. 1571-1591), separazione (156 c.c.); sinonimi nuovi in
  `EXPANSIONS` (scippo, pestaggio, stupro, minacce, vandalismo...).
- Priorita' codici a tre livelli: Costituzione e c.p./c.c. (URN 1398/262) >
  altri R.D. > DPR/D.Lgs, con offset di distanza differenziati (0.08/0.03/0).
- Verifiche: "Pene omicidio e tipologie" -> 579, 577, 578, 576, 589, 575
  (c.p.); "scippo" -> 624-bis #1; "danneggiato" -> 635 #1; "stradale" ->
  589-bis in top-2; T1-T15 ALL PASS. Il profilo Lexia cita ora 576/577 c.p.
  nella risposta sulle pene per omicidio.

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

### 2026-08-17 — integrazione web app
- `legal_api.py` pubblicato dietro HTTPS (nginx + Cloudflare) su
  `https://hermes.tuodominio.it/legal-api`; profilo `hermes_legal_site` via
  `https://hermes.tuodominio.it/p/hermes_legal_site/v1` (gateway multiplex, allowlist).
- **Integrazione web app (2026-08-19)**: `legal_api.py` nuovo endpoint `POST /verify-citations` (post-check anti-allucinazione: verifica che le URN citate dal LLM esistano nel DB con status e vigenza); `search.py` funzione `verify_citations()` + fix citazione duplicata (`art.` doppio); `tests/test_e2e_site.py` test end-to-end del flusso web app → /search → profilo Hermes isolato → /verify-citations (ESITO PASS).
