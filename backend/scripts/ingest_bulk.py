#!/usr/bin/env python3
"""Hermes Legal — Ingest bulk ottimizzato per collezioni enormi (abrogati).

Problema: ingest.ingest() fa UNA chiamata encode del modello per atto; con
atti da 1-2 articoli l'overhead per chiamata domina (~3s/atto) -> 124k atti
abrogati = ~86 ore. Questa variante accumula i testi di N atti e li embedda
in batch grandi (512+), poi inserisce in una sola transazione per gruppo:
~10-20x piu' veloce.

Uso:
  python3 ingest_bulk.py /path/dir_estratta  [--status abrogato] [--batch 256]
                                             [--max-attos 5000] [--resume]
"""
import glob
import json
import os
import sys
import time
import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ingest
from akn_parser import parse_akn, strip_trailing_padding, _maybe_decode

BATCH = 256
STATUS = 'vigente'
MAX_ATTI = 0


def main():
    global BATCH, STATUS, MAX_ATTI
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    src = args[0]
    i = 1
    while i < len(args):
        if args[i] == '--status':
            STATUS = args[i + 1]; i += 2
        elif args[i] == '--batch':
            BATCH = int(args[i + 1]); i += 2
        elif args[i] == '--max-attos':
            MAX_ATTI = int(args[i + 1]); i += 2
        elif args[i] == '--resume':
            RESUME = True; i += 1
        else:
            i += 1

    xmls = sorted(glob.glob(os.path.join(src, '**', '*.xml'), recursive=True))
    print(f'file trovati: {len(xmls)}', flush=True)

    # resume: salta gli hash gia' presenti nel DB (una sola query iniziale)
    conn = ingest.connect()
    cur = conn.cursor()
    cur.execute("SELECT source_hash FROM legal_acts WHERE source_hash IS NOT NULL")
    known = {r[0] for r in cur.fetchall()}
    cur.close(); conn.close()
    print(f'hash noti nel DB: {len(known)}', flush=True)

    done = 0
    errors = 0
    t_start = time.time()
    pending = []  # (xml_path, src_hash, meta, articles)

    def flush():
        nonlocal done, errors, pending
        if not pending:
            return
        texts = []
        for _p, _h, _m, arts in pending:
            texts.extend(a['text'] for a in arts)
        from embedder import embed_batch
        # Sottobatch a 256 testi: con atti enormi nel pending (ex-codici da
        # 2000+ articoli) embed_batch su tutti i testi insieme esplode la RAM
        # (OOM killer su 7.7G con zero swap). I vettori sono accumulati in
        # ordine; gli atti vengono poi inseriti con il solito loop.
        SUB = 256
        vecs = []
        for i in range(0, len(texts), SUB):
            chunk = texts[i:i + SUB]
            vecs.extend(embed_batch(chunk, batch_size=min(BATCH, 128)))
        conn = ingest.connect()
        try:
            cur = conn.cursor()
            vi = 0
            for xml_path, src_hash, meta, arts in pending:
                a_id = ingest.upsert_act(conn, meta, xml_path, src_hash, status=STATUS)
                cur.execute("DELETE FROM legal_articles WHERE act_id=%s", (a_id,))
                source_name = ingest._source_name(meta, xml_path)
                for art in arts:
                    vec = vecs[vi]; vi += 1
                    cur.execute("""INSERT INTO legal_articles
                        (act_id, article_number, article_heading, paragraph_number, letter,
                         level, text, valid_from, valid_to, status, source_file, source_hash)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NULL,%s,%s,%s) RETURNING id""",
                        (a_id, art['article_number'], art['article_heading'],
                         art['paragraph_number'], art['letter'], art['level'], art['text'],
                         art.get('valid_from'), STATUS, xml_path, ingest.content_hash(art['text'])))
                    art_id = cur.fetchone()[0]
                    md = json.dumps({
                        'act': os.path.basename(xml_path), 'article': art['article_number'],
                        'paragraph': art['paragraph_number'], 'level': art['level'],
                        'valid_from': None, 'valid_to': None, 'status': STATUS,
                        'urn': meta.get('urn'), 'source': source_name,
                        'retrieved_at': datetime.date.today().isoformat(), 'source_file': xml_path,
                    }, ensure_ascii=False)
                    cur.execute("""INSERT INTO legal_chunks (article_id, act_id, text, embedding, metadata, content_hash)
                                   VALUES (%s,%s,%s,%s,%s,%s)""",
                                (art_id, a_id, art['text'], '['+','.join(f'{v:.6f}' for v in vec)+']',
                                 md, ingest.content_hash(art['text'])))
                done += 1
                if done % 500 == 0:
                    conn.commit()  # checkpoint intermedio
            conn.commit()
            cur.close()
        finally:
            conn.close()
        rate = done / max(time.time() - t_start, 0.001)
        print(f'[{done} atti | {rate:.1f} atti/s | errore={errors}]', flush=True)
        pending = []

    for xml in xmls:
        if MAX_ATTI and done >= MAX_ATTI:
            break
        try:
            raw = open(xml, 'rb').read()
            h = ingest.content_hash(strip_trailing_padding(_maybe_decode(raw)))
            if h in known:
                done += 1
                continue
            meta, arts = parse_akn(xml)
            if not arts:
                done += 1
                continue
            pending.append((xml, h, meta, arts))
            if len(pending) >= BATCH:
                flush()
            elif len(pending) >= 16:
                # guardia RAM: se available < 600MB, flush anticipato per
                # evitare il picco di memoria del prossimo embed
                try:
                    with open('/proc/meminfo') as f:
                        mem = dict(l.split(':', 1) for l in f)
                    avail = int(mem['MemAvailable'].strip().split()[0]) / 1024
                    if avail < 600:
                        flush()
                except Exception:
                    pass
        except Exception as e:
            errors += 1
            if errors <= 20:
                print(f'SKIP {os.path.basename(xml)}: {str(e)[:100]}', flush=True)
    flush()
    dt = time.time() - t_start
    print(f'=== FINE: {done} atti, {errors} errori, {dt/60:.1f} min ===', flush=True)


if __name__ == '__main__':
    main()
