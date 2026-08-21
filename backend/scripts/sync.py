#!/usr/bin/env python3
"""Hermes Legal — Sincronizzazione settimanale automatica (§8, §9, §19).

Flusso:
  1. legge last_successful_sync da system_state;
  2. interroga ricerca/aggiornati nel periodo per rilevare il delta;
  3. riscarica le collezioni AKN VIGENTE (2-step cookie);
  4. ingesta idempotente per atto/hash, salvando checkpoint JSON dopo ogni file;
  5. su SIGTERM, --max-new-acts o errore parziale registra status='partial'/'failed';
  6. un run successivo riprende automaticamente dagli hash gia' presenti;
  7. solo un run completo aggiorna last_successful_sync.

Usage:
  python3 sync.py [--collection "Codici"] [--since YYYY-MM-DD] [--max-new-acts 25]
"""
import os, sys, json, glob, shutil, subprocess, datetime, tempfile, logging, re, signal, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg2
import ingest
from akn_parser import strip_trailing_padding

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('hermes-legal-sync')

DB = {
    'host': os.environ.get('LEGAL_DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('LEGAL_DB_PORT', 5432)),
    'dbname': os.environ.get('LEGAL_DB_NAME', 'hermes_legal'),
    'user': os.environ.get('LEGAL_DB_USER', 'hermes_legal_app'),
    'password': os.environ.get('LEGAL_DB_PASSWORD', 'REDACTED'),
}
BASE = os.environ.get('LEGAL_NORMATTIVA_BASE',
    'https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1')
CACHE = os.environ.get('LEGAL_CACHE', '/tmp/hermes-legal-sync')
os.makedirs(CACHE, exist_ok=True)

# Collezioni speciali: formato richiesto a Normattiva e status giuridico da
# assegnare in DB. Default: V (vigente) + status 'vigente'. Gli atti abrogati
# in originale NON hanno versione vigente (formatoRichiesta=V -> 404) e devono
# essere marcati 'abrogato' in legal_acts/legal_articles, altrimenti il corpus
# li tratterebbe come normativa vigente (errore di correttezza giuridica).
COLLECTION_OVERRIDES = {
    'Atti normativi abrogati (in originale)': {'version': 'O', 'status': 'abrogato'},
}

def _collection_version(collection):
    return COLLECTION_OVERRIDES.get(collection, {}).get('version', 'V')

def _collection_status(collection):
    return COLLECTION_OVERRIDES.get(collection, {}).get('status', 'vigente')

def connect(): return psycopg2.connect(**DB)

# ---------------------------------------------------------------------------
# Delta detection via ricerca/aggiornati
# ---------------------------------------------------------------------------
def check_delta(since_dt, now_dt):
    """Chiede a Normattiva gli atti aggiornati nel periodo. Ritorna lista atti."""
    import urllib.request, urllib.error
    url = f"{BASE}/ricerca/aggiornati"
    payload = json.dumps({
        "dataInizioAggiornamento": since_dt.strftime('%Y-%m-%dT%H:%M:%S'),
        "dataFineAggiornamento": now_dt.strftime('%Y-%m-%dT%H:%M:%S'),
    }).encode()
    req = urllib.request.Request(url, data=payload, headers={'Content-Type':'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read().decode())
        return data.get('listaAtti') or [], data.get('numeroAttiTrovati') or 0
    except Exception as e:
        log.warning("ricerca/aggiornati fallita (%s) — procedo comunque con re-download", e)
        return [], -1

# ---------------------------------------------------------------------------
# Download collezione vigente (2-step cookie) -> zip -> estratta
# ---------------------------------------------------------------------------
def download_collection(collection, version='V'):
    """Scarica la collezione AKN vigente in un dir pulito. Ritorna il path estrutto.
    Usa curl (2-step con cookie jar) — il flusso verificato a mano in sessione:
    urllib non riesce a leggere la Location: (il server la gestisce diversamente)."""
    import subprocess, urllib.parse
    cj = os.path.join(CACHE, 'cookies.txt')
    q = urllib.parse.urlencode({'nome': collection, 'formato': 'AKN', 'formatoRichiesta': version})
    step1_url = f"{BASE}/collections/download/collection-preconfezionata?{q}"
    # step 1: GET -> leggere header Location con curl, salvando i cookie
    r1 = subprocess.run(
        ['curl', '-4', '-s', '-c', cj, '-o', '/dev/null', '-D', '-', '--max-time', '90',
         '--get', step1_url],
        capture_output=True, text=True, timeout=120)
    loc = None
    for line in r1.stdout.splitlines():
        if line.lower().startswith('location:'):
            loc = line.split(':', 1)[1].strip()
            break
    if not loc:
        raise RuntimeError(f"nessuna Location nello step1 (curl exit {r1.returncode})\n{r1.stdout[:300]}")
    # step 2: GET Location con i cookie — con retry: il file-download CDN
    # a volte risponde 200 con 0 byte se la generazione non e' pronta
    # (verificato 2026-08-18: primo tentativo 0 byte, secondo 59MB x-cache HIT).
    zip_path = os.path.join(CACHE, f'{collection}_{version}.zip')
    last_err = None
    for attempt in range(1, 4):
        if attempt > 1:
            log.warning("download %s: tentativo %d dopo zip vuoto", collection, attempt)
            time.sleep(10 * attempt)
            # rigenera la Location: la precedente puo' essere scaduta
            loc = None
            r1 = subprocess.run(
                ['curl', '-4', '-s', '-c', cj, '-o', '/dev/null', '-D', '-', '--max-time', '90',
                 '--get', step1_url],
                capture_output=True, text=True, timeout=120)
            for line in r1.stdout.splitlines():
                if line.lower().startswith('location:'):
                    loc = line.split(':', 1)[1].strip()
                    break
            if not loc:
                last_err = f"nessuna Location al retry {attempt} (curl exit {r1.returncode})"
                continue
        r2 = subprocess.run(
            ['curl', '-4', '-s', '-b', cj, '--max-time', '600', '-o', zip_path, loc],
            capture_output=True, text=True, timeout=700)
        if r2.returncode != 0:
            last_err = f"step2 download fallito (exit {r2.returncode}): {r2.stderr[:200]}"
            continue
        if not os.path.exists(zip_path) or os.path.getsize(zip_path) == 0:
            last_err = "zip vuoto"
            continue
        break
    else:
        raise RuntimeError(f"step2 download fallito dopo 3 tentativi: {last_err}")
    # estrai in dir pulita
    outdir = os.path.join(CACHE, f'{collection}_{version}_x')
    shutil.rmtree(outdir, ignore_errors=True)
    shutil.unpack_archive(zip_path, outdir, 'zip')
    _compact_padded_xml(outdir)
    return outdir

def _compact_padded_xml(outdir):
    """I file della collezione 'Regi decreti' arrivano con padding a 1 MiB
    (XML + zeri fino a 1.048.576 byte): l'estrazione occupa ~90 GB invece di
    ~1 GB. Risparazza ogni XML troncando il contenuto dopo la chiusura della
    root element (stesso normalize di akn_parser.strip_trailing_padding).
    In-place, best-effort; non tocca i file gia' puliti."""
    import glob as _glob
    padded = 0
    for xml in _glob.glob(os.path.join(outdir, '**', '*.xml'), recursive=True):
        try:
            with open(xml, 'rb') as fh:
                raw = fh.read()
            m = re.search(rb'</(?:\w+:)?akomaNtoso\s*>', raw)
            if m and m.end() < len(raw):
                with open(xml, 'wb') as fh:
                    fh.write(raw[:m.end()])
                padded += 1
        except OSError:
            continue
    if padded:
        log.info("compattati %d file XML con padding (risparmio spazio disco)", padded)

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def get_state(key):
    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT value FROM system_state WHERE key=%s", (key,))
        row = cur.fetchone()
        return row[0] if row else None
    finally:
        conn.close()

def set_state(key, value):
    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute("""INSERT INTO system_state (key, value) VALUES (%s,%s)
                       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value""", (key, str(value)))
        conn.commit()
        cur.close()
    finally:
        conn.close()


_STOP_REQUESTED = False

class GracefulStop(Exception):
    """Arresto controllato: il run e' riprendibile, non e' un errore del corpus."""


def _request_stop(signum, _frame):
    global _STOP_REQUESTED
    _STOP_REQUESTED = True
    log.warning("Ricevuto segnale %s: termino dopo l'atto corrente e salvo checkpoint", signum)


signal.signal(signal.SIGTERM, _request_stop)
signal.signal(signal.SIGINT, _request_stop)


def _checkpoint_file(collection):
    slug = re.sub(r'[^a-z0-9]+', '_', collection.lower()).strip('_')
    return os.path.join(CACHE, f'checkpoint_{slug}.json')


def load_checkpoint(collection):
    path = _checkpoint_file(collection)
    try:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return {'collection': collection, 'status': 'new', 'processed': 0,
                'changed': 0, 'skipped': 0, 'articles': 0}


def save_checkpoint(collection, data):
    path = _checkpoint_file(collection)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def parse_int_arg(args, name, default=0):
    if name not in args:
        return default
    idx = args.index(name)
    try:
        return int(args[idx + 1])
    except (IndexError, ValueError):
        raise SystemExit(f"valore non valido per {name}")

def parse_collections():
    """Lista collezioni da aggiornare: da --collection (CLI) o config.yaml
    (normattiva.collections). Default ['Codici']."""
    args = sys.argv[1:]
    if '--collection' in args:
        # supporta piu' --collection "A" --collection "B"
        cols = []
        i = 0
        while '--collection' in args[i:]:
            idx = args.index('--collection', i)
            cols.append(args[idx+1])
            i = idx + 2
        if cols:
            return cols
    # config.yaml
    cfg_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            'config', 'config.yaml')
    cfg_cols = None
    try:
        import yaml
        cfg = yaml.safe_load(open(cfg_path))
        cfg_cols = (cfg.get('normattiva') or {}).get('collections')
    except Exception:
        cfg_cols = None
    if cfg_cols:
        return cfg_cols
    return ['Codici']

def main():
    args = sys.argv[1:]
    collections = parse_collections()
    since_str = None
    if '--since' in args:
        since_str = args[args.index('--since')+1]
    max_new_acts = parse_int_arg(args, '--max-new-acts', 0)

    started = datetime.datetime.now()
    now_dt = started
    # default: dalla data dell'ultima sync riuscita (se presente), altrimenti -7gg
    last = since_str or get_state('last_successful_sync')
    if last:
        try:
            since_dt = datetime.datetime.fromisoformat(last)
        except Exception:
            since_dt = now_dt - datetime.timedelta(days=7)
    else:
        since_dt = now_dt - datetime.timedelta(days=7)

    # logga sync_runs (status running)
    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute("""INSERT INTO sync_runs (started_at, status)
                       VALUES (%s,'running') RETURNING id""", (started,))
        run_id = cur.fetchone()[0]
        conn.commit(); cur.close()
    finally:
        conn.close()

    report = {'checked': 0, 'changed': 0, 'articles': 0, 'skipped': 0, 'errors': []}
    try:
        # 1) delta detection
        atti, n_tot = check_delta(since_dt, now_dt)
        log.info("Delta %s→%s: %s atti aggiornati rilevati",
                 since_dt.date(), now_dt.date(), n_tot if n_tot >= 0 else '(sconosciuto)')

        # 1.5) snapshot hash noti UNA volta (riusati per tutte le collezioni)
        conn = connect(); cur = conn.cursor()
        cur.execute("SELECT source_hash FROM legal_acts WHERE source_hash IS NOT NULL")
        known_hashes = {r[0] for r in cur.fetchall()}
        cur.close(); conn.close()

        # 2) per ogni collezione: download vigente + ingest del delta
        for collection in collections:
            version = _collection_version(collection)
            status = _collection_status(collection)
            extracted = download_collection(collection, version)
            xmls = glob.glob(os.path.join(extracted, '**', '*.xml'), recursive=True)
            report['checked'] += len(xmls)
            if not xmls:
                log.warning("collezione %s: nessun .xml estratto", collection)
                continue
            previous_checkpoint = load_checkpoint(collection)
            checkpoint = {
                'collection': collection,
                'status': 'partial',
                'processed': 0,
                'changed': 0,
                'skipped': 0,
                'articles': 0,
                'previous_processed': previous_checkpoint.get('processed', 0),
                'updated_at': datetime.datetime.now().isoformat(),
            }
            log.info("Collezione %s: checkpoint precedente=%s file, scansione corrente=%s file",
                     collection, previous_checkpoint.get('processed', 0), len(xmls))
            col_skipped = 0; col_changed = 0; col_articles = 0
            for xml in sorted(xmls):
                try:
                    h = ingest.content_hash(strip_trailing_padding(open(xml, 'rb').read()))
                except OSError:
                    h = None
                n = 0
                was_skipped = bool(h and h in known_hashes)
                if was_skipped:
                    col_skipped += 1
                    report['skipped'] += 1
                else:
                    try:
                        _a_id, n = ingest.ingest(xml, status=status)  # commit per atto; resume-safe via hash
                    except Exception as e:
                        # File malformati (es. AKN troncati dal CDN Normattiva):
                        # logga, conta, NON bloccare il run (i validi proseguono).
                        log.error("SKIP file non parsabile: %s — %s", os.path.basename(xml), str(e)[:120])
                        report['errors'].append(str(e)[:200])
                        n = 0
                        _a_id = None
                    if n > 0:
                        col_changed += 1
                        col_articles += n
                        known_hashes.add(h)
                    report['changed'] += 1 if n > 0 else 0
                    report['articles'] += n
                checkpoint.update({
                    'collection': collection,
                    'status': 'partial',
                    'processed': int(checkpoint.get('processed', 0)) + 1,
                    'changed': int(checkpoint.get('changed', 0)) + (1 if n > 0 else 0),
                    'skipped': int(checkpoint.get('skipped', 0)) + (1 if was_skipped else 0),
                    'articles': int(checkpoint.get('articles', 0)) + n,
                    'updated_at': datetime.datetime.now().isoformat(),
                })
                save_checkpoint(collection, checkpoint)
                if _STOP_REQUESTED:
                    raise GracefulStop(f"arresto richiesto durante {collection}")
                if max_new_acts and report['changed'] >= max_new_acts:
                    raise GracefulStop(f"raggiunto --max-new-acts={max_new_acts}")
            checkpoint.update({'status': 'success', 'updated_at': datetime.datetime.now().isoformat()})
            save_checkpoint(collection, checkpoint)
            log.info("Collezione %s: %s atti nuovi/modificati, %s invariati saltati, %s articoli/chunk",
                     collection, col_changed, col_skipped, col_articles)

        # 3) aggiorna stato
        set_state('last_successful_sync', now_dt.isoformat())
        set_state('last_collection_discovery', now_dt.isoformat())

        # 4) finalizza sync_runs success
        conn = connect()
        cur = conn.cursor()
        cur.execute("""UPDATE sync_runs SET finished_at=%s, status='success',
                       acts_checked=%s, acts_changed=%s, acts_added=%s, embeddings_updated=%s
                       WHERE id=%s""",
                    (datetime.datetime.now(), report['checked'], report['changed'],
                     report['changed'], report['articles'], run_id))
        conn.commit(); cur.close()

        # 5) report
        print("="*60)
        print("SYNC REPORT")
        print("="*60)
        print(f"Sync: {started.date().isoformat()}")
        print(f"Periodo esaminato: {since_dt.date()} → {now_dt.date()}")
        print(f"Delta rilevati (ricerca/aggiornati): {n_tot if n_tot>=0 else 'n/d'}")
        print(f"Status: SUCCESS")
        print(f"Collezioni: {', '.join(collections)}")
        print(f"File controllati: {report['checked']}")
        print(f"Atti aggiornati: {report['changed']} (invariati saltati: {report['skipped']})")
        print(f"Articoli/chunk inseriti: {report['articles']}")
        print(f"Errori: {len(report['errors'])}")
        return 0
    except GracefulStop as e:
        conn = connect()
        cur = conn.cursor()
        cur.execute("""UPDATE sync_runs SET finished_at=%s, status='partial', error_message=%s,
                       acts_checked=%s, acts_changed=%s, acts_added=%s, embeddings_updated=%s
                       WHERE id=%s""",
                    (datetime.datetime.now(), str(e)[:2000], report['checked'],
                     report['changed'], report['changed'], report['articles'], run_id))
        conn.commit(); cur.close(); conn.close()
        print("="*60)
        print("SYNC REPORT")
        print("="*60)
        print(f"Status: PARTIAL\nMotivo: {e}")
        print(f"Collezioni: {', '.join(collections)}")
        print(f"File controllati: {report['checked']}")
        print(f"Atti aggiornati: {report['changed']} (invariati saltati: {report['skipped']})")
        print(f"Articoli/chunk inseriti: {report['articles']}")
        print("Resume: rieseguire lo stesso comando; gli hash gia' presenti verranno saltati.")
        return 2
    except Exception as e:
        status = 'partial' if (report['changed'] or report['skipped']) else 'failed'
        conn = connect()
        cur = conn.cursor()
        cur.execute("""UPDATE sync_runs SET finished_at=%s, status=%s, error_message=%s,
                       acts_checked=%s, acts_changed=%s, acts_added=%s, embeddings_updated=%s
                       WHERE id=%s""",
                    (datetime.datetime.now(), status, str(e)[:2000], report['checked'],
                     report['changed'], report['changed'], report['articles'], run_id))
        conn.commit(); cur.close(); conn.close()
        print("="*60)
        print(f"SYNC REPORT\nStatus: {status.upper()}\nErrore: {e}", file=sys.stderr)
        print("Corpus precedente lasciato operativo; il run e' riprendibile via hash.", file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())