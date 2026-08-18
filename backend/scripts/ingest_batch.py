#!/usr/bin/env python3
"""Hermes Legal — Ingestione batch di una directory di file AKN vigenti.

Sistema i file in una cartella (es. /tmp/codiciV, che contiene una sotto-cartella
per ogni atto con il .xml VIGENZA) e li ingerisce in blocco nel DB, generando
un report di sincronizzazione (parallelo al modulo di sync).

Usage:
  python3 ingest_batch.py <dir>
"""
import os, sys, glob, datetime, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ingest
import psycopg2

DB = {
    'host': os.environ.get('LEGAL_DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('LEGAL_DB_PORT', 5432)),
    'dbname': os.environ.get('LEGAL_DB_NAME', 'hermes_legal'),
    'user': os.environ.get('LEGAL_DB_USER', 'hermes_legal_app'),
    'password': os.environ.get('LEGAL_DB_PASSWORD', ''),  # dall'ambiente
}

def log_sync(run_report):
    conn = psycopg2.connect(**DB)
    try:
        cur = conn.cursor()
        cur.execute("""INSERT INTO sync_runs
            (started_at, finished_at, status, acts_checked, acts_changed, acts_added,
             acts_removed, embeddings_updated, error_message)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (run_report['started'], run_report['finished'], run_report['status'],
             run_report['checked'], run_report['changed'], run_report['added'],
             0, run_report['embeddings'], '\n'.join(run_report.get('errors', [])) or None))
        conn.commit()
        cur.close()
    finally:
        conn.close()

def main():
    root = sys.argv[1]
    xmls = []
    # ogni atto e' in una sotto-cartella: prendi i .xml nella root e sotto
    xmls += glob.glob(os.path.join(root, '*.xml'))
    for sub in glob.glob(os.path.join(root, '*/')):
        xmls += glob.glob(os.path.join(sub, '*.xml'))

    started = datetime.datetime.now()
    report = {'checked': 0, 'added': 0, 'changed': 0, 'embeddings': 0,
              'errors': [], 'status': 'success', 'started': started, 'finished': None}
    existing_before = {}
    conn = psycopg2.connect(**DB)
    try:
        cur = conn.cursor()
        cur.execute("SELECT urn, id FROM legal_acts")
        existing_before = dict(cur.fetchall())
        cur.close()
    finally:
        conn.close()

    for xml in sorted(xmls):
        fname = os.path.basename(xml)
        if not fname.endswith('.xml'):
            continue
        report['checked'] += 1
        try:
            a_id, n = ingest.ingest(xml)
            report['embeddings'] += n
            report['changed'] += 1 if n > 0 else 0
            report['added'] += 1 if n > 0 else 0
            # leggi il titolo dell'atto per il log
            try:
                conn = psycopg2.connect(**DB)
                cur = conn.cursor()
                cur.execute("SELECT title FROM legal_acts WHERE id=%s", (a_id,))
                title = cur.fetchone()[0]
                cur.close(); conn.close()
            except Exception:
                title = os.path.basename(os.path.dirname(xml))
            print(f"  [{report['changed']:>2}] {title} -> {n} articoli")
        except Exception as e:
            report['errors'].append(f"{fname}: {e}")
            print(f"  [ERR] {fname}: {e}")

    report['finished'] = datetime.datetime.now()
    report['status'] = 'success' if not report['errors'] else 'partial'
    log_sync(report)
    print("\n" + "="*62)
    print("REPORT SYNC")
    print("="*62)
    print(f"Sync: {started.date().isoformat()}")
    print(f"Status: {report['status'].upper()}")
    print(f"File controllati: {report['checked']}")
    print(f"Atti aggiunti/aggiornati: {report['added']}")
    print(f"Articoli/chunk inseriti: {report['embeddings']}")
    print(f"Errori: {len(report['errors'])}")
    for e in report['errors']:
        print(f"   - {e}")

if __name__ == '__main__':
    main()