#!/usr/bin/env python3
"""Hermes Legal — Ricerca ibrida (keyword + filtri metadati + rerank).

Pipeline (§14):
  query -> fts (full-text) + metadata filter (+ semantic quando embedding presente)
        -> candidate -> rerank by authority_level -> current-version check -> answer

Citazione (§16): ogni risultato riporta atto/tipo/n./data/art./comma/stato/
data/fonte/URN.
"""
import os, re
import psycopg2
import psycopg2.extras

DB = {
    'host': os.environ.get('LEGAL_DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('LEGAL_DB_PORT', 5432)),
    'dbname': os.environ.get('LEGAL_DB_NAME', 'hermes_legal'),
    'user': os.environ.get('LEGAL_DB_USER', 'hermes_legal_app'),
    'password': os.environ.get('LEGAL_DB_PASSWORD', ''),  # dall'ambiente
}
def connect(): return psycopg2.connect(**DB)

def search(query, article_number=None, jurisdiction=None, max_results=10):
    """Ricerca a testi con filtro metadati. keyw = ricerca lessicale.
    Ritorna lista di dict + la query di citazione."""
    conn = connect()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # websearch_to_tsquery fornisce supporto AND/OR con sintassi semplice
        q = """
            SELECT a.id, a.article_number, a.article_heading, a.text, a.valid_from, a.valid_to,
                   a.status, a.level, a.paragraph_number,
                   act.title, act.act_type, act.act_number, act.act_date, act.urn,
                   act.source, act.jurisdiction,
                   (SELECT authority_level FROM sources WHERE source_name = act.source) AS authority
            FROM legal_articles a
            JOIN legal_acts act ON act.id = a.act_id
            WHERE 1=1
        """
        params = []
        if article_number:
            q += " AND a.article_number = %s"
            params.append(str(article_number))
        if jurisdiction:
            q += " AND act.jurisdiction = %s"
            params.append(str(jurisdiction))
        if query.strip():
            q += """ AND to_tsvector('simple', a.text || ' ' || COALESCE(a.article_heading,''))
                     @@ websearch_to_tsquery('simple', %s)"""
            params.append(query)
        q += " ORDER BY authority DESC NULLS LAST, length(a.text) ASC LIMIT %s"
        params.append(max_results)
        cur.execute(q, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

def citation(r):
    """Produce la citazione (§16) in una riga."""
    parts = []
    if r.get('act_type'):
        parts.append(r['act_type'])
    if r.get('article_number'):
        parts.append(f"art. {r['article_number']}")
    parts.append(f"art. {r['article_number']}")
    if r.get('paragraph_number'):
        parts.append(f"comma {r['paragraph_number']}")
    ct = (r.get('act_date') or '')
    src = r.get('source') or ''
    urn = r.get('urn') or ''
    status = r.get('status') or 'vigente'
    return f"{r.get('title') and r['title']} — {r.get('act_type') or ''} {r.get('act_number') or ''} ({ct}) art. {r['article_number']}, comma {r.get('paragraph_number') or 'int.'} — stato {status} — fonte {src} — URN {urn}"


RERANK_CANDIDATES = int(os.environ.get('LEGAL_RERANK_CANDIDATES', '100'))
RRF_K = int(os.environ.get('LEGAL_RRF_K', '60'))


def rerank_enabled():
    """Lettura lazy del flag (cosi' i test possono abilitarlo dopo l'import)."""
    return os.environ.get('LEGAL_RERANK_ENABLED', 'false').lower() == 'true'


_ART_REF = re.compile(r"(?:art\.?|articolo)\s*([0-9]+[a-z]*(?:-[a-z0-9]+)*)", re.IGNORECASE)


def _rrf_fusion(ranked_id_lists, k=None):
    """Reciprocal Rank Fusion: combina piu' ordinamenti di id in uno solo.

    Non richiede punteggi calibrati (i logit del cross-encoder non lo sono):
    ogni lista contribuisce 1/(k+rank). Robusto anche quando un ordinamento
    e' mediocre ma parzialmente d'accordo con l'altro.
    """
    k = k or RRF_K
    scores = {}
    for id_list in ranked_id_lists:
        for rank, item_id in enumerate(id_list, 1):
            scores[item_id] = scores.get(item_id, 0.0) + 1.0 / (k + rank)
    return sorted(scores, key=scores.get, reverse=True)


def semantic_search(query, jurisdiction=None, max_results=10, ref_date=None, rerank=True):
    """Ricerca semantica vettoriale: embedding della query + cosine similarity
    (operatore <=> di pgvector) sui chunk. La query viene prima espansa con
    sinonimi giuridici (query_expansion) cosi' il bi-encoder recupera anche
    articoli che non contengono le parole esatte della domanda. Con il
    cross-encoder disponibile i candidati (RERANK_CANDIDATES, default 100)
    vengono riordinati per punteggio di rilevanza; senza reranker si combina
    la similarita' con un bonus per la corrispondenza lessicale esatta."""
    from embedder import embed
    from query_expansion import expand_query
    import datetime
    ref = ref_date or datetime.date.today()
    qexp = expand_query(query)
    qvec = embed(qexp)   # embedding della query espansa: richiamo migliore
    vec_lit = '[' + ','.join(f'{v:.6f}' for v in qvec) + ']'
    candidates = max(max_results * 4, 16) if rerank else max_results
    candidates = min(candidates, RERANK_CANDIDATES)
    conn = connect()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        q = """
            SELECT a.id, a.article_number, a.article_heading, a.text, a.valid_from, a.valid_to,
                   a.status, a.level, a.paragraph_number,
                   act.title, act.act_type, act.act_number, act.act_date, act.urn,
                   act.source, act.jurisdiction,
                   (SELECT authority_level FROM sources WHERE source_name = act.source) AS authority,
                   (c.embedding <=> %s::vector) AS distance
            FROM legal_chunks c
            JOIN legal_articles a ON a.id = c.article_id
            JOIN legal_acts act ON act.id = c.act_id
            WHERE c.embedding IS NOT NULL
              AND (a.valid_from IS NULL OR a.valid_from <= %s)
              AND (a.valid_to IS NULL OR a.valid_to >= %s)
        """
        base_params = [vec_lit, ref, ref]
        if jurisdiction:
            q += " AND act.jurisdiction = %s"
            base_params.append(str(jurisdiction))
        base_q = q
        q += " ORDER BY c.embedding <=> %s::vector"
        base_params_v = base_params + [vec_lit]
        q += " LIMIT %s"
        cur.execute(q, base_params_v + [candidates])
        out = [dict(r) for r in cur.fetchall()]
        # riferimenti espliciti ad articoli ("art. 577", "articolo 576"): i chunk
        # con quel numero entrano SEMPRE nei candidati con distanza 0 (hit esatto),
        # così una domanda numerica trova la norma anche se l'embedding non la
        # avvicina. Il keyword boost discrimina poi tra atti diversi (es. c.p. vs DPR).
        art_refs = _ART_REF.findall(query)
        if art_refs:
            cur.execute(
                base_q + " AND a.article_number = ANY(%s) ORDER BY act.title LIMIT 15",
                base_params + [art_refs])
            exact = {r['id']: r for r in cur.fetchall()}
            by_id = {r['id']: r for r in out}
            for rid, row in exact.items():
                if rid in by_id:
                    # l'hit esatto era gia' tra i candidati: azzera la distanza
                    # cosi' sale in cima invece di restare sepolto dal ranking
                    by_id[rid]['distance'] = 0.0
                else:
                    row['distance'] = 0.0
                    out.append(dict(row))
        if rerank and rerank_enabled():
            try:
                import reranker
                # reranker opzionale (LEGAL_RERANK_ENABLED=true): valuta con la
                # query ORIGINALE, poi fusione RRF con il ranking vettoriale.
                # Di default E' DISATTIVATO: il cross-encoder mmarco degrada il
                # ranking del diritto italiano rispetto a distanza + keyword boost.
                scores = reranker.score_pairs([(query, r['text'] or '') for r in out])
                for r, s in zip(out, scores):
                    r['rerank_score'] = round(float(s), 4)
                by_distance = sorted(out, key=lambda r: float(r.get('distance') if r.get('distance') is not None else 1.0))
                by_rerank = sorted(out, key=lambda r: r['rerank_score'], reverse=True)
                fused = _rrf_fusion([[r['id'] for r in by_distance],
                                     [r['id'] for r in by_rerank]])
                order = {item_id: rank for rank, item_id in enumerate(fused)}
                out.sort(key=lambda r: order.get(r['id'], 10**9))
                return out[:max_results]
            except Exception:
                pass  # degrada al percorso keyword boost
        # keyword boost: deduplicato e con peso piccolo — serve a rompere i
        # pareggi, non a ribaltare l'ordinamento vettoriale
        kw = list(dict.fromkeys(w for w in qexp.lower().split() if len(w) > 3))
        boost = float(os.environ.get('LEGAL_KEYWORD_BOOST', '0.01'))
        for r in out:
            txt = (r['text'] or '').lower()
            bonus = sum(1 for w in kw if w in txt)
            r['distance'] = round(float(r.get('distance') if r.get('distance') is not None else 1.0) - boost * bonus, 4)
        out.sort(key=lambda r: r['distance'])
        return out[:max_results]
    finally:
        conn.close()

if __name__ == '__main__':
    import sys
    args = sys.argv[1:]
    semantic = '--semantic' in args
    args = [a for a in args if a != '--semantic']
    q = args[0]
    art = args[1] if len(args) > 1 else None
    if semantic:
        res = semantic_search(q)
        print(f"SEMANTIC — Risultati per '{q}': {len(res)}\n")
        for r in res:
            print(f"  * [dist {r['distance']}]", citation(r))
            print("     ", (r['text'][:160]).strip().replace('\n',' '))
            print()
    else:
        res = search(q, article_number=art)
        print(f"Risultati per '{q}': {len(res)}\n")
        for r in res:
            print("  *", citation(r))
            print("     ", (r['text'][:160]).strip().replace('\n',' '))
        print()