#!/usr/bin/env python3
"""Recupero dei 72 R.D. mancanti (troncati dal CDN) via dettaglio-atto-urn.

Strategia:
  - 18 atti hanno testo reale in `articoloHtml` -> costruisce un AKN sintetico
    (struttura minima compatibile con akn_parser: FRBR + mainBody con
    <paragraph><content><p>Art. N. ...</p>) e li ingerisce via ingest.ingest().
  - 54 atti sono ABROGATI e l'API restituisce solo l'avviso di abrogazione
    (nessun testo storico) -> registrati come mancanti, non ingeriti.

Uso: python3 recover_missing_rd.py [--dry-run]
"""
import json
import os
import re
import sys
import time
import urllib.request
import html as htmlmod

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ingest

BASE = 'https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1/atto/dettaglio-atto-urn'
OUTDIR = '/opt/hermes-legal/cache/recovered_rd'
DRY = '--dry-run' in sys.argv

A = '{http://docs.oasis-open.org/legaldocml/ns/akn/3.0}'
AKN_NS = 'http://docs.oasis-open.org/legaldocml/ns/akn/3.0'


def fetch_articolo_html(urn):
    req = urllib.request.Request(BASE, data=json.dumps({'urn': urn}).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        d = json.loads(resp.read())
    atto = d.get('data', {}).get('atto') or {}
    return atto.get('articoloHtml') or '', atto.get('titolo') or ''


def extract_articles(articolo_html):
    """Estrae [(num, heading, text)] da <h2 class=article-num-akn> + <span class=art-just-text-akn>."""
    articles = []
    # dividi per h2 article-num
    parts = re.split(r'<h2 class="article-num-akn"[^>]*>(.*?)</h2>', articolo_html)
    # parts[0] = preamble, poi coppie (num, resto)
    for i in range(1, len(parts), 2):
        num_html = parts[i]
        rest = parts[i + 1] if i + 1 < len(parts) else ''
        m = re.search(r'Art\.?\s*([0-9]+(?:-[a-z]+)?)', num_html, re.I)
        if not m:
            continue
        num = m.group(1)
        # testo = primo <span class="art-just-text-akn">...</span>
        span = re.search(r'<span class="art-just-text-akn">(.*?)</span>', rest, re.S)
        body = span.group(1) if span else rest
        # togli aggiornamenti in fondo
        body = re.split(r'<div class="art_aggiornamento-akn"', body)[0]
        body = re.sub(r'<[^>]+>', ' ', body)
        body = htmlmod.unescape(body)
        body = ' '.join(body.split())
        # togli marcatori ((..)) di novella
        body = re.sub(r'\(\(\s*(.*?)\s*\)\)', r'\1', body)
        if body:
            articles.append((num, '', body))
    return articles


def build_akn(urn, date, num, articles, title):
    """AKN minimale: FRBR + mainBody con <paragraph> piatti 'Art. N. ...'."""
    act_type = 'regio.decreto'
    body = []
    for anum, _h, text in articles:
        body.append(
            f'<paragraph eId="par_{anum}"><content><p>Art. {anum}. {text}</p></content></paragraph>'
        )
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<akomaNtoso xmlns="{AKN_NS}">
  <act>
    <meta>
      <identification source="#n">
        <FRBRWork>
          <FRBRthis value="/akn/it/act/{act_type}/{date}/{num}"/>
          <FRBRuri value="/akn/it/act/{act_type}/{date}/{num}"/>
          <FRBRdate date="{date}" name=""/>
          <FRBRalias name="urn:nir" value="{urn}"/>
        </FRBRWork>
        <FRBRExpression>
          <FRBRthis value="/akn/it/act/{act_type}/{date}/{num}@"/>
          <FRBRdate date="{date}" name=""/>
        </FRBRExpression>
      </identification>
    </meta>
    <mainBody>
      {''.join(body)}
    </mainBody>
  </act>
</akomaNtoso>'''
    return xml


def act_exists_complete(urn):
    """True se l'atto e' gia' nel DB con almeno 1 articolo (evita di
    sovrascrivere atti completi con il decreto di approvazione a 1 art.)."""
    import psycopg2
    try:
        conn = ingest.connect()
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM legal_articles WHERE act_id IN "
                    "(SELECT id FROM legal_acts WHERE urn=%s)", (urn,))
        n = cur.fetchone()[0]
        cur.close(); conn.close()
        return n >= 1
    except Exception:
        return False


def main():
    recs = json.load(open('/opt/hermes-legal/cache/missing_72_classified.json'))
    withtext = [r for r in recs if r['text_len'] > 200 and not r['abrogated']]
    abrogated = [r for r in recs if r['abrogated']]
    print(f'con testo: {len(withtext)}, abrogati: {len(abrogated)}', flush=True)
    os.makedirs(OUTDIR, exist_ok=True)
    ok = 0
    failed = []
    for r in withtext:
        urn = r['urn']
        m = re.match(r'urn:nir:[^:]+:([^:]+):([0-9]{4}-[0-9]{2}-[0-9]{2});([0-9A-Za-z-]+)', urn)
        if not m:
            failed.append((urn, 'URN non parsabile'))
            continue
        if act_exists_complete(urn):
            print(f'SKIP gia presente: {urn}', flush=True)
            continue
        act_type, date, num = m.group(1), m.group(2), m.group(3)
        try:
            ah, title = fetch_articolo_html(urn)
        except Exception as e:
            failed.append((urn, f'fetch: {str(e)[:60]}'))
            continue
        arts = extract_articles(ah)
        if not arts:
            failed.append((urn, 'nessun articolo estratto'))
            continue
        akn = build_akn(urn, date, num, arts, title)
        xml_path = os.path.join(OUTDIR, f'{date}_{num}_{act_type.replace(".","_")}.xml')
        with open(xml_path, 'w', encoding='utf-8') as fh:
            fh.write(akn)
        if DRY:
            print(f'[dry] {urn} -> {len(arts)} articoli', flush=True)
            ok += 1
            continue
        try:
            aid, n = ingest.ingest(xml_path)
            print(f'OK {urn}: atto_id={aid}, articoli={n}', flush=True)
            ok += 1
        except Exception as e:
            failed.append((urn, f'ingest: {str(e)[:80]}'))
        time.sleep(0.3)
    print(f'--- RISULTATO: {ok} ok, {len(failed)} falliti ---')
    for f, why in failed:
        print('FAIL', f, why)


if __name__ == '__main__':
    main()
