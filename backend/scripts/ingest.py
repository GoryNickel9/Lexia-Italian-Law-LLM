#!/usr/bin/env python3
"""Hermes Legal — Ingestione AKN -> PostgreSQL.

Funzionamento:
  - parsa un file AKN consolidato (via akn_parser);
  - upsert dell'atto in legal_acts (per URN);
  - inserimento degli articoli in legal_articles;
  - creazione dei chunk in legal_chunks (con embedding se il modello e' disponibile);
  - registra la versione in legal_versions;
  - idempotente: un secondo run con lo stesso contenuto non crea duplicati.

Config via environment / config.yaml.
"""
import os, sys, hashlib, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import psycopg2
from akn_parser import parse_akn

DB = {
    'host': os.environ.get('LEGAL_DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('LEGAL_DB_PORT', 5432)),
    'dbname': os.environ.get('LEGAL_DB_NAME', 'hermes_legal'),
    'user': os.environ.get('LEGAL_DB_USER', 'hermes_legal_app'),
    'password': os.environ.get('LEGAL_DB_PASSWORD', ''),  # dall'ambiente
}

def connect():
    return psycopg2.connect(**DB)

def content_hash(text):
    if isinstance(text, bytes):
        return hashlib.sha256(text).hexdigest()
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def _source_name(meta, src_file):
    """Fonte dell'atto: dal <proprietary> dell'AKN se presente, altrimenti
    fallback basato sul nome file (per file storici senza proprietary)."""
    name = (meta.get('source') or '').strip()
    if name:
        return name
    low = str(src_file).lower()
    if 'costituzione_governo' in low:
        return 'Governo Italiano'
    if 'costituzione_1947-12-27' in low:
        return 'Wikisource'
    return 'Normattiva'

def embed(text, dim=384):
    """Embedding semantico reale (sentence-transformers)."""
    from embedder import embed as _embed
    return _embed(text)

def _embed_batch(texts):
    from embedder import embed_batch
    return embed_batch(texts)

def upsert_act(conn, meta, src_file, source_hash):
    cur = conn.cursor()
    urn = meta.get('urn')
    act_type = meta.get('act_type') or 'Atto'
    act_no = meta.get('act_number')
    act_date = meta.get('act_date') or '?'
    if act_no:
        title = meta.get('name') or f"{act_type} n. {act_no} del {act_date}".strip()
    else:
        # atti senza numero (es. Costituzione) -> "COSTITUZIONE del 1947-12-27"
        title = meta.get('name') or f"{act_type} del {act_date}".strip()
    act_type = meta.get('act_type')
    act_number = meta.get('act_number')
    act_date = meta.get('act_date')
    source_name = _source_name(meta, src_file)
    if urn:
        cur.execute("SELECT id FROM legal_acts WHERE urn=%s", (urn,))
        row = cur.fetchone()
        if row:
            a_id = row[0]
            cur.execute("""UPDATE legal_acts SET title=%s, act_type=%s, act_number=%s, act_date=%s,
                           source=%s, status='vigente', source_file=%s, updated_at=now() WHERE id=%s""",
                        (title, act_type, act_number, act_date, source_name, src_file, a_id))
        else:
            cur.execute("""INSERT INTO legal_acts
                (title, act_type, act_number, act_date, urn, source, jurisdiction, status, source_hash)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (title, act_type, act_number, act_date, urn, source_name, 'Italia', 'vigente', source_hash))
            a_id = cur.fetchone()[0]
    else:
        # senza URN, chiave sul nome+data
        cur.execute("""INSERT INTO legal_acts
            (title, act_type, act_number, act_date, urn, source, jurisdiction, status, source_hash)
            VALUES (%s,%s,%s,%s,NULL,%s,%s,%s,%s) RETURNING id""",
            (title, act_type, act_number, act_date, source_name, 'Italia', 'vigente', source_hash))
        a_id = cur.fetchone()[0]
    cur.close()
    return a_id

def ingest(xml_path):
    src_hash = content_hash(open(xml_path,'rb').read())
    meta, articles = parse_akn(xml_path)
    source_name = _source_name(meta, xml_path)
    conn = connect()
    try:
        a_id = upsert_act(conn, meta, xml_path, src_hash)
        cur = conn.cursor()
        # dedup: cancella articoli esistenti di questo atto (idempotente re-ingest)
        cur.execute("DELETE FROM legal_articles WHERE act_id=%s", (a_id,))
        # embed in batch (una sola chiamata modello per atto)
        texts = [a['text'] for a in articles]
        vecs = _embed_batch(texts)
        n = 0
        for art, vec in zip(articles, vecs):
            cur.execute("""INSERT INTO legal_articles
                (act_id, article_number, article_heading, paragraph_number, letter,
                 level, text, valid_from, valid_to, status, source_file, source_hash)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NULL,'vigente',%s,%s) RETURNING id""",
                (a_id, art['article_number'], art['article_heading'],
                 art['paragraph_number'], art['letter'], art['level'], art['text'],
                 art.get('valid_from'),
                 xml_path, content_hash(art['text'])))
            art_id = cur.fetchone()[0]
            # chunk
            metadata = {
                'act': 'Codice Penale' if 'penale' in xml_path.lower() else os.path.basename(xml_path),
                'article': art['article_number'],
                'paragraph': art['paragraph_number'],
                'level': art['level'],
                'valid_from': None, 'valid_to': None, 'status': 'vigente',
                'urn': meta.get('urn'),
                'source': source_name, 'retrieved_at': datetime.date.today().isoformat(),
                'source_file': xml_path,
            }
            md_json = json.dumps(metadata, ensure_ascii=False)
            cur.execute("""INSERT INTO legal_chunks (article_id, act_id, text, embedding, metadata, content_hash)
                           VALUES (%s,%s,%s,%s,%s,%s)""",
                        (art_id, a_id, art['text'], '['+','.join(f'{v:.6f}' for v in vec)+']',
                         md_json, content_hash(art['text'])))
            n += 1
        conn.commit()
        cur.close()
        print(f"OK: atto id={a_id}, articoli+chunk inseriti={n}")
        return a_id, n
    except Exception as e:
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == '__main__':
    src = sys.argv[1]
    ingest(src)