#!/usr/bin/env python3
"""Hermes Legal — Parser AKN (Akoma Ntoso) consolidato/vigente Normattiva.

Estrae da un file AKN consolidato la struttura gerarchica:
  atto -> articolo -> sottopunto numerato (comma/lettera quando esplicito)

Ogni articolo e' una riga principale (level=article); quando il testo contiene
sottopunti enumerati (es. "1)", "2)", "3-bis)") questi diventano righe figlie
(level=paragraph/letter) mantenendo i metadati gerarchici.

Output: lista di dict pronti per l'inserimento in legal_articles.
"""
from lxml import etree
import re, html as htmlmod, json, sys

A = '{http://docs.oasis-open.org/legaldocml/ns/akn/3.0}'

# ---------------------------------------------------------------------------
# Metadati dell'atto: FRBR (URN, date, tipo), document type (tipo provv.)
# ---------------------------------------------------------------------------
_ABROG_MARKER = re.compile(r'\(\(\s*ARTICOLO\s+ABROGATO\s+((?:DALLA|DAL)\s+[^)]*?)\s*\)\)', re.I | re.S)
_ABROG_MARKER_BARE = re.compile(r'\(\(\s*ARTICOLO\s+ABROGATO\s*\)\)', re.I)

# SOPPRESSO a livello di ARTICOLO ("DA RITENERSI SOPPRESSO" art. 21 c.p.,
# "ARTICOLO SOPPRESSO DAL ..."): NON deve scattare per i commi soppressi
# ("1° NUMERO SOPPRESSO DALLA L. 26 MARZO 2001, N. 128" = art. 625 c.p.,
# che resta vigente e veniva marcato abrogato per errore).
_SOPPRESSO_MARKER = re.compile(
    r'\b(?:DA\s+RITENERSI\s+SOPPRESSO|ARTICOLO\s+SOPPRESSO(?:\s+(?:DAL|DALLA))?)\b',
    re.I)


def _preserve_abrogation(t):
    """I marcatori di abrogazione '((ARTICOLO ABROGATO DAL ...))' non devono
    essere distrutti dallo strip generico delle parentesi: diventano testo
    leggibile (lo strip successivo li rende 'Articolo abrogato DAL ...')."""
    t = _ABROG_MARKER.sub(r'Articolo abrogato (\1)', t)
    return _ABROG_MARKER_BARE.sub('Articolo abrogato', t)

def _clean(text):
    t = htmlmod.unescape(text)
    t = t.replace('\ufeff', '')
    t = _preserve_abrogation(t)
    t = re.sub(r'\(\s*(.*?)\s*\)', r'\1', t)          # ((...)) -> testo; attenzione alle parentesi di heading
    return re.sub(r'[ \t]+', ' ', t)

def extract_act_meta(root):
    """Tipo atto, numero, data, URN dalla parte FRBR/metadata dell'AKN."""
    meta = {}
    # FRBR alias URN
    aliases = root.findall(f'.//{A}FRBRalias')
    for a in aliases:
        v = a.get('value') or ''
        if v.startswith('urn:nir:'):
            meta['urn'] = v
    urn = meta.get('urn', '')
    # deriva tipo atto + numero dalla URN (es. urn:nir:stato:regio.decreto:1930-10-19;1398)
    m = re.match(r'urn:nir:[^:]+:([^:]+):([0-9]{4}-[0-9]{2}-[0-9]{2});([0-9A-Za-z\\-]+)', urn)
    if m:
        act_type = m.group(1).replace('.', ' ').upper()
        meta['act_type'] = act_type
        meta['act_number'] = m.group(3)
        meta['act_date'] = m.group(2)
    else:
        # atti senza numero (es. Costituzione): urn:nir:stato:costituzione:1947-12-27
        m2 = re.match(r'urn:nir:[^:]+:([^:]+):([0-9]{4}-[0-9]{2}-[0-9]{2})$', urn)
        if m2:
            meta['act_type'] = m2.group(1).replace('.', ' ').upper()  # COSTITUZIONE
            meta['act_number'] = None
            meta['act_date'] = m2.group(2)
        # classification / tipo provvedimento (nome)
        cls = root.find(f'.//{A}classification')
        if cls is not None:
            cl = cls.find(f'{A}class') or cls.find(f'.//{A}class')
            if cl is not None:
                meta['name'] = cl.get('showAs') or cl.get('value')
    if not meta.get('act_date'):
        for d in root.findall(f'.//{A}FRBRdate'):
            val = d.get('date')
            if val and (val.startswith('19') or val.startswith('20')):
                meta.setdefault('act_date', val)
    # fonte dichiarata dall'AKN, es. <proprietary source="Governo Italiano" sourceUrl="..."/>
    # (gli AKN Normattiva hanno source vuota: il chiamante usa il fallback per nome file)
    for prop in root.iter(f'{A}proprietary'):
        src = (prop.get('source') or '').strip()
        if src:
            meta['source'] = src
        surl = (prop.get('sourceUrl') or '').strip()
        if surl:
            meta['source_url'] = surl
    return meta

# ---------------------------------------------------------------------------
# Estrazione articoli
# ---------------------------------------------------------------------------
_ART_RE = re.compile(r'(?:^|\s)(Art\.?\s?[0-9]+(?:-[a-z]+)?)\b\s*\.?\s*(?:\((?!\()([^)]*)\))?\s*(.*)', re.S)
_SUB_RE = re.compile(r'^\s*([0-9]+(?:-[a-z]+)?|[a-z]?)\)\s+', re.M)

def _maybe_decode(data):
    """Alcuni AKN della collezione Normattiva arrivano base64-encoded.
    Se il contenuto inizia con le prime 4 lettere XML in base64 (PD94...) -> decodifica."""
    if isinstance(data, bytes):
        try:
            head = data[:200]
        except Exception:
            head = b''
        if head.lstrip().startswith(b'PD94') or head.lstrip().startswith(b'<?xml'):
            try:
                import base64
                if head.lstrip().startswith(b'PD94'):
                    return base64.b64decode(data)
                return data
            except Exception:
                return data
        return data
    s = data.strip()
    if s.startswith('PD94') or s.startswith('<?xml'):
        import base64
        if s.startswith('PD94'):
            try:
                return base64.b64decode(s)
            except Exception:
                return s.encode('utf-8')
        return s.encode('utf-8')
    return data.encode('utf-8')

def strip_trailing_padding(data):
    """Alcuni AKN della collezione 'Regi decreti' arrivano con padding a 1 MiB:
    l'XML e' completo ma seguito da zeri binari fino a 1.048.576 byte (limite
    CDN Normattiva). lxml li rifiuta con 'Extra content at the end of the
    document'. Tronca tutto dopo la chiusura della root element."""
    import re as _re
    if isinstance(data, bytes):
        m = _re.search(rb'</(?:\w+:)?akomaNtoso\s*>', data)
        return data[:m.end()] if m else data
    m = _re.search(r'</(?:\w+:)?akomaNtoso\s*>', data)
    return data[:m.end()] if m else data

def merge_text(el):
    t = htmlmod.unescape(''.join(el.itertext()))
    t = _preserve_abrogation(t)
    t = re.sub(r'\(\s*(.*?)\s*\)', r'\1', t)      # ((...)) -> testo, once (su singola)
    t = re.sub(r'\s*\(\(\s*(.*?)\s*\)\)\s*', r'\1', t, flags=re.S)
    t = re.sub(r'\(\(|\)\)', '', t)
    return ' '.join(t.split())

def parse_article_elements(root, meta):
    """Codici moderni: articoli come elementi <article> con <num>/<heading>/<paragraph>."""
    A_local = A
    out = []
    seen = set()
    for art in root.iter(A_local + 'article'):
        eid = art.get('eId') or art.get('guid')
        if eid and eid in seen:
            continue
        num_el = art.find(f'{A_local}num')
        if num_el is None:
            num_el = art.find(f'.//{A_local}num')
        head_el = art.find(f'{A_local}heading')
        if head_el is None:
            head_el = art.find(f'.//{A_local}heading')
        num = ''
        if num_el is not None:
            num = ''.join(num_el.itertext())
            num = re.sub(r'^Art\.?\s?', '', num, flags=re.I).strip().rstrip('.')
        heading = merge_text(head_el) if head_el is not None else ''
        # heading puo' contenere "(intestazione)"; pulisci
        heading = re.sub(r'^[(\s]+|[)\s]+$', '', heading).strip()
        # commi = <paragraph> figli
        paras = [p for p in art if p.tag == A_local + 'paragraph'] or list(art.iter(A_local + 'paragraph'))
        if not paras:
            body = merge_text(art)
            if body:
                out.append({'article_number': num, 'article_heading': heading,
                            'level': 'article', 'paragraph_number': None, 'letter': None, 'text': body,
                            'status': 'abrogato' if ('ABROGATO' in body.upper() or _SOPPRESSO_MARKER.search(body)) else None})
                if eid: seen.add(eid)
            continue
        first = True
        for p in paras:
            pid = p.get('eId') or p.get('guid')
            # numero comma dall'eId tipo art_1__para_1
            pnum = None
            if pid:
                m = re.search(r'para[_-]?(\d+(?:-[a-z]+)?|\w+)$', pid)
                if m: pnum = m.group(1)
            body = merge_text(p)
            body = re.sub(r'-{3,}.*$', '', body, flags=re.S).strip()
            if not body:
                continue
            lvl = 'article' if first else 'paragraph'
            out.append({'article_number': num, 'article_heading': heading,
                        'level': lvl, 'paragraph_number': pnum if not first else None,
                        'letter': None, 'text': body,
                        'status': 'abrogato' if ('ABROGATO' in body.upper() or _SOPPRESSO_MARKER.search(body)) else None})
            first = False
        if eid: seen.add(eid)
    return out

def parse_flat_paragraphs(root, meta):
    """Codici/testi classici: articoli come <paragraph> piatti il cui <p>
    inizia con 'Art. <n>.' (es. Codice Penale/Civile consolidati)."""
    A_local = A
    articles = []
    seen = set()
    for par in root.iter(A_local + 'paragraph'):
        ps = list(par.iter(A_local + 'p'))
        if not ps:
            continue
        # scandisci tutti i <p>: l'articolo puo' iniziare non dal primo
        # (es. art. 1 preceduto dal titolo "CODICE PENALE")
        found = None
        for pp in ps:
            txt = ' '.join(''.join(pp.itertext()).split())
            m = _ART_RE.search(txt)
            if m:
                found = (m, txt)
                break
        if not found:
            continue
        m, first = found
        num = m.group(1)
        num = re.sub(r'^Art\.?\s?', '', num, flags=re.I).strip()
        heading = (m.group(2) or '').strip()
        body_raw = m.group(3)
        abrog = bool(_ABROG_MARKER.search(body_raw) or _ABROG_MARKER_BARE.search(body_raw)
                     or _SOPPRESSO_MARKER.search(body_raw))
        body = _clean(body_raw).strip()
        key = num.lower()
        if key in seen:
            continue
        seen.add(key)
        cut = body.find('AGGIORNAMENTO')
        if cut > 0:
            body = body[:cut]
        body = re.sub(r'-{3,}.*$', '', body, flags=re.S).strip()
        rows = split_subparagraphs(body)
        first_row = True
        for sub in rows:
            article_row = {
                'article_number': num,
                'article_heading': heading,
                'level': 'article' if first_row and sub['marker'] is None else 'paragraph',
                'paragraph_number': sub['marker'],
                'letter': None,
                'text': sub['text'],
                'status': 'abrogato' if abrog else None,
            }
            first_row = False
            articles.append(article_row)
    return articles

def parse_akn(xml_path):
    raw = open(xml_path, 'rb').read()
    content = strip_trailing_padding(_maybe_decode(raw))
    tree = etree.fromstring(content)
    root = tree
    meta = extract_act_meta(root)

    # Due strutture possibili nell'AKN Normattiva:
    #  A) codici moderni: elementi <article> con <num>/<heading>/<paragraph> (es. D.Lgs. 82/2005)
    #  B) codici/testi classici: articoli come <paragraph> piatti (es. Codice Penale/Civile,
    #     che hanno solo i 3 <article> del decreto di approvazione ma ~900 paragraph di codice).
    # Scelta robusta: valuta entrambe e prendi quella con piu' articoli.
    via_a = parse_article_elements(root, meta) if root.findall(f'.//{A}article') else []
    via_b = parse_flat_paragraphs(root, meta)
    def n_distinct(rows):
        return len(set(a['article_number'] for a in rows if a['article_number']))
    if n_distinct(via_a) >= n_distinct(via_b):
        chosen = via_a
    else:
        chosen = via_b
    return meta, chosen

# ---------------------------------------------------------------------------
# Segmentazione dei sottopunti enumerati dentro il corpo di un articolo
# ---------------------------------------------------------------------------
def split_subparagraphs(body):
    """Ridivide il corpo in sottopunti quando compaiono marcatori numerati
    su righe distinte (es. ' 1) ...', ' 2) ...'). Ritorna lista di righe."""
    # markers tipo "1) " "2) " "3-bis) " quando preceduti da newline o inizio
    pattern = re.compile(r'(?:^|\n)\s*(\d+(?:-\w+)?|[a-z]?)\)\s*')
    matches = list(pattern.finditer(body))
    if len(matches) < 1:
        return [{'marker': None, 'text': body}]
    rows = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i+1].start() if i+1 < len(matches) else len(body)
        marker = m.group(1)
        seg = body[start:end]
        # togli il marker dal testo, conservalo a parte
        seg = re.sub(r'^\s*\d+(?:-\w+)?\)\s*', '', seg).strip()
        rows.append({'marker': marker, 'text': seg})
    return rows

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    src = sys.argv[1]
    meta, articles = parse_akn(src)
    print(f"META: {json.dumps({k:v for k,v in meta.items() if v}, ensure_ascii=False)}")
    print(f"RIGHE estratte: {len(articles)} (articoli + sottopunti)")
    # conteggio articoli distinti
    dist=set(a['article_number'] for a in articles)
    print(f"ARTICOLI distinti: {len(dist)}")
    for a in articles[:5]:
        print(f"  - Art.{a['article_number']} [{a['level']}] {a['article_heading']} | {len(a['text'])} ch")
    if len(sys.argv) > 2:
        json.dump({'meta': meta, 'articles': articles},
                  open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
        print("salvato JSON ->", sys.argv[2])