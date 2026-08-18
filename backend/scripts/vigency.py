#!/usr/bin/env python3
"""Hermes Legal — Motore di vigenza.

Regola (§15): la vigenza NON si determina per similarita' semantica, ma dai
metadati/versioni. Data riferimento:
  - oggi   -> se la domanda e' al presente
  - data X -> se l'utente indica una data

Selezione: valid_from <= data_ref AND (valid_to IS NULL OR valid_to >= data_ref)
"""
import os, datetime
import psycopg2

DB = {
    'host': os.environ.get('LEGAL_DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('LEGAL_DB_PORT', 5432)),
    'dbname': os.environ.get('LEGAL_DB_NAME', 'hermes_legal'),
    'user': os.environ.get('LEGAL_DB_USER', 'hermes_legal_app'),
    'password': os.environ.get('LEGAL_DB_PASSWORD', ''),  # dall'ambiente
}
def connect(): return psycopg2.connect(**DB)

def resolve_date(ref_date=None):
    """'oggi' -> aujourd'hui; stringa data -> date."""
    if ref_date is None:
        return datetime.date.today()
    if isinstance(ref_date, datetime.date):
        return ref_date
    return datetime.date.fromisoformat(str(ref_date))

def current_articles(act_urn=None, article_number=None, ref_date=None):
    """Ritorna gli articoli vigenti alla data riferimento, con il filtro
    di vigenza sui metadati. Se un articolo non ha valid_from, e' incluso."""
    ref = resolve_date(ref_date)
    conn = connect()
    try:
        cur = conn.cursor()
        q = """
            SELECT a.id, a.article_number, a.article_heading, a.text, a.valid_from, a.valid_to, a.status,
                   act.title, act.act_type, act.urn
            FROM legal_articles a
            JOIN legal_acts act ON act.id = a.act_id
            WHERE 1=1
              AND (a.valid_from IS NULL OR a.valid_from <= %s)
              AND (a.valid_to IS NULL OR a.valid_to >= %s)
        """
        params = [ref, ref]
        if act_urn:
            q += " AND act.urn = %s"
            params.append(act_urn)
        if article_number:
            q += " AND a.article_number = %s"
            params.append(str(article_number))
        cur.execute(q, params)
        rows = cur.fetchall()
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, r)) for r in rows], ref
    finally:
        conn.close()

def is_vigente(valid_from, valid_to, ref_date=None):
    """Predicato di vigenza a uso esterno."""
    ref = resolve_date(ref_date)
    if valid_from and valid_from > ref:
        return False
    if valid_to and valid_to < ref:
        return False
    return True

if __name__ == '__main__':
    import sys
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    rows, ref = current_articles(article_number=arg, ref_date=None)
    print(f"Vigenti alla data {ref.isoformat()}: {len(rows)}")
    for r in rows[:5]:
        print(f"  - {r['urn']} art.{r['article_number']} {r['article_heading']} ({r['valid_from']} -> {r['valid_to']})")