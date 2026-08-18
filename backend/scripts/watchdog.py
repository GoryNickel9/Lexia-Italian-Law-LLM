#!/usr/bin/env python3
"""Hermes Legal — Watchdog della sincronizzazione (§10).

Controlla l'ultima esecuzione in sync_runs. Se l'ultimo sync e' fallito (o non
e' mai avvenuto da troppo tempo), stampa un ALERT su stdout (che un cron con
no_agent consegna come messaggio). Se tutto e' a posto, NON stampa nulla
(pattern watchdog: silenzioso quando non c'e' nulla da segnalare).

Usage (tipico, al mattino):
  python3 watchdog.py [--max-age-hours 30]
Exit code 0 sempre (lo stato e' nel testo); il cron decide la consegna.
"""
import os, sys, datetime
import psycopg2

DB = {
    'host': os.environ.get('LEGAL_DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('LEGAL_DB_PORT', 5432)),
    'dbname': os.environ.get('LEGAL_DB_NAME', 'hermes_legal'),
    'user': os.environ.get('LEGAL_DB_USER', 'hermes_legal_app'),
    'password': os.environ.get('LEGAL_DB_PASSWORD', ''),  # dall'ambiente
}

def main():
    max_age = 30
    if '--max-age-hours' in sys.argv:
        max_age = int(sys.argv[sys.argv.index('--max-age-hours') + 1])
    try:
        conn = psycopg2.connect(**DB)
        cur = conn.cursor()
        cur.execute("""SELECT status, started_at, finished_at, acts_checked, acts_changed,
                              acts_added, embeddings_updated, error_message
                       FROM sync_runs ORDER BY id DESC LIMIT 1""")
        row = cur.fetchone()
        conn.close()
    except Exception as e:
        # il DB non e' raggiungibile: questo e' di per se' critico
        print("🐞 HERMES LEGAL ALERT — impossibile leggere sync_runs: %s" % e)
        return 0
    if row is None:
        print("🐞 HERMES LEGAL ALERT — nessuna sincronizzazione mai registrata in sync_runs.")
        return 0
    status, started, finished, checked, changed, added, emb, err = row
    now = datetime.datetime.now(started.tzinfo) if started.tzinfo else datetime.datetime.now()
    age_h = (now - started).total_seconds() / 3600 if started else float('inf')

    if status == 'failed':
        print(f"🐞 HERMES LEGAL ALERT — l'ultima sincronizzazione È FALLITA ({started:%Y-%m-%d %H:%M}). "
              f"Errore: {(err or 'non specificato')[:400]}. Corpus precedente lasciato operativo.")
    elif age_h > max_age:
        print(f"🐞 HERMES LEGAL ALERT — ultima sincronizzazione risale a {age_h:.0f} ore fa "
              f"({started:%Y-%m-%d %H:%M}), oltre la soglia di {max_age}h. Verificare il cron.")
    else:
        # tutto ok: silenzioso (nessun output = nessuna notifica)
        pass
    return 0

if __name__ == '__main__':
    sys.exit(main())