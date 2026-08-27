#!/usr/bin/env python3
"""Correzioni dati sul corpus Hermes Legal (D1).

La fonte Normattiva (AKN vigente) riporta per alcuni articoli del c.p. il
testo storico con multe in LIRE, mentre la legge vigente (L. 94/2009,
L. 103/2017) ha importi in euro. Il corpus è fedele alla fonte, quindi la
fonte va corretta a valle con patch mirate e documentate.

Importi verificati:
- art. 624 c.p. (furto): multa da euro 103 a euro 1.032 (L. 94/2009)
- art. 625 c.p. (aggravanti): reclusione da due a sei anni e multa da
  euro 927 a euro 1.500 (L. 103/2017, art. 1 comma 7)
- art. 628 c.p. (rapina): multa da euro 927 a euro 2.500 (L. 94/2009)
- art. 640 c.p. (truffa): multa da euro 51 a euro 1.032 (L. 94/2009)
- art. 646 c.p. (appropriazione indebita): multa fino a euro 1.032
  (L. 94/2009)

Lo script è idempotente (le sostituzioni trovano solo il testo in lire).
Da rieseguire dopo ogni re-ingest che ripristini il testo della fonte.
"""
import os
import psycopg2
import re

CP_URN = "urn:nir:stato:regio.decreto:1930-10-19;1398"

# (articolo, pattern lire, sostituzione) — il pattern è ancorato e univoco
CORRECTIONS = [
    ("624", r"la multa da lire trecentomila a un milione",
     "la multa da euro 103 a euro 1.032"),
    ("625", r"la reclusione da uno a sei anni e della multa da lire mille a diecimila",
     "la reclusione da due a sei anni e della multa da euro 927 a euro 1.500"),
    ("628", r"la multa da lire cinquemila a ventimila",
     "la multa da euro 927 a euro 2.500"),
    ("640", r"la multa da lire cinquecento a diecimila",
     "la multa da euro 51 a euro 1.032"),
    ("646", r"la multa fino a lire diecimila",
     "la multa fino a euro 1.032"),
]


def main():
    conn = psycopg2.connect(
        host=os.environ.get("LEGAL_DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("LEGAL_DB_PORT", "5432")),
        dbname=os.environ.get("LEGAL_DB_NAME", "hermes_legal"),
        user=os.environ.get("LEGAL_DB_USER", "hermes_legal_app"),
        password=os.environ.get("LEGAL_DB_PASSWORD", ""),
    )
    cur = conn.cursor()
    for art, pattern, repl in CORRECTIONS:
        cur.execute(
            "SELECT a.id, a.text FROM legal_articles a JOIN legal_acts act ON act.id = a.act_id "
            "WHERE act.urn = %s AND a.article_number = %s",
            (CP_URN, art),
        )
        row = cur.fetchone()
        if not row:
            print(f"art. {art}: NON TROVATO")
            continue
        aid, text = row
        new_text, n = re.subn(pattern, repl, text, flags=re.I)
        if n == 0:
            print(f"art. {art}: pattern non trovato (già corretto? testo: {text[:80]!r})")
            continue
        cur.execute("UPDATE legal_articles SET text = %s WHERE id = %s", (new_text, aid))
        print(f"art. {art}: {n} sostituzione(i) OK")
    conn.commit()
    print("DONE")


if __name__ == "__main__":
    main()
