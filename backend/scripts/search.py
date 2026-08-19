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
    'password': os.environ.get('LEGAL_DB_PASSWORD', 'REDACTED'),
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
FTS_CANDIDATES = int(os.environ.get('LEGAL_FTS_CANDIDATES', '60'))


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
    from query_expansion import TEMA_ARTICOLI, expand_query, norm_token
    import datetime
    ref = ref_date or datetime.date.today()
    qexp = expand_query(query)
    qvec = embed(qexp)   # embedding della query espansa: richiamo migliore
    vec_lit = '[' + ','.join(f'{v:.6f}' for v in qvec) + ']'
    # finestra vettoriale sempre ampia: la fusione ibrida con l'FTS vive di candidati
    candidates = min(max(max_results * 4, 16), RERANK_CANDIDATES)
    conn = connect()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        q = """
            SELECT a.id, a.article_number, a.article_heading, a.text, a.valid_from, a.valid_to,
                   a.status, a.level, a.paragraph_number,
                   act.title, act.act_type, act.act_number, act.act_date, act.urn,
                   act.source, act.jurisdiction,
                   (SELECT authority_level FROM sources WHERE source_name = act.source) AS authority,
                   CASE WHEN act.urn LIKE '%%costituzione%%' THEN 0
                        WHEN act.urn LIKE '%%regio.decreto:1930-10-19;1398%%' THEN 1
                        WHEN act.urn LIKE '%%regio.decreto:1942-03-16;262%%' THEN 1
                        WHEN act.urn LIKE '%%regio.decreto%%' THEN 2 ELSE 3 END AS code_prio,
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
        # --- FTS sempre attivo: ordinamento lessicale (OR dei token espansi) ---
        # Con AND implicito (websearch) una query lunga darebbe zero risultati;
        # l'OR premia gli articoli con piu' termini della domanda via ts_rank.
        fts_order = []
        fts_tokens = [t for t in re.sub(r"[^\w\s]", " ", qexp).split() if len(t) > 3]
        if fts_tokens:
            fts_query = " | ".join(t.lower() for t in fts_tokens)
            cur.execute("""
                SELECT a.id
                FROM legal_chunks c
                JOIN legal_articles a ON a.id = c.article_id
                JOIN legal_acts act ON act.id = c.act_id
                WHERE c.embedding IS NOT NULL
                  AND (a.valid_from IS NULL OR a.valid_from <= %s)
                  AND (a.valid_to IS NULL OR a.valid_to >= %s)
                  AND to_tsvector('simple', a.text || ' ' || COALESCE(a.article_heading,''))
                      @@ to_tsquery('simple', %s)
                ORDER BY ts_rank(to_tsvector('simple', a.text || ' ' || COALESCE(a.article_heading,'')),
                                 to_tsquery('simple', %s)) DESC
                LIMIT %s
            """, [ref, ref, fts_query, fts_query, FTS_CANDIDATES])
            fts_order = [r['id'] for r in cur.fetchall()]
        # riferimenti espliciti ad articoli ("art. 577", "articolo 576"): i chunk
        # con quel numero entrano SEMPRE nei candidati con distanza 0 (hit esatto),
        # così una domanda numerica trova la norma anche se l'embedding non la
        # avvicina. Il keyword boost discrimina poi tra atti diversi (es. c.p. vs DPR).
        art_refs = _ART_REF.findall(query)
        tema_nums = []
        toks = set(norm_token(t) for t in query.lower().split())
        for syns, arts in TEMA_ARTICOLI.items():
            if set(syns) & toks:
                tema_nums.extend(arts)
        # keyword boost: deduplicato e con peso piccolo — rompe i pareggi
        # senza ribaltare l'ordinamento (vale anche per il tier esatto).
        # Esclude token di rumore ('art.', 'art', 'comma', 'lettera'...) che
        # compaiono in quasi ogni testo legale e falsano il match (es. 'art.'
        # in una citazione faceva battere la Costituzione da DPR irrilevanti).
        _NOISE_KW = {"art", "art.", "articolo", "articoli", "comma", "commi",
                     "lettera", "lettere", "codice", "legge", "decreto",
                     "numero", "n", "del", "della", "dei", "con", "per", "che"}
        kw = [w for w in dict.fromkeys(w for w in qexp.lower().split() if len(w) > 3)
              if w not in _NOISE_KW]
        inj = sorted(set(art_refs) | set(tema_nums))
        exact_ids = set()
        if inj:
            # ranking SQL per keyword nel testo: con 90k+ R.D. quasi tutti con
            # lo stesso numero articolo, l'ordine code_prio (LIMIT 100) tagliava
            # fuori i D.Lgs pertinenti (es. D.Lgs 81/2008 art. 28 'valutazione
            # dei rischi' mai iniettato perche' preceduto da 90k R.D.). Il
            # testo contenente le keyword della domanda sale in cima.
            kw_sql = [w for w in kw if len(w) > 3][:8]
            # il match sul TITOLO dell'atto pesa 3x (un atto che ha la keyword
            # nel nome — es. 'COSTITUZIONE' — e' quasi sempre quello giusto,
            # anche se il testo dell'articolo usa sinonimi: art. 3 Cost. dice
            # 'eguali', non 'uguaglianza').
            rank_expr = " + ".join(
                f"(CASE WHEN a.text ILIKE %s OR COALESCE(a.article_heading,'') ILIKE %s THEN 1 ELSE 0 END "
                f"+ CASE WHEN act.title ILIKE %s THEN 3 ELSE 0 END)"
                for _ in kw_sql) or "0"
            kw_params = [f"%{w}%" for w in kw_sql for _ in (0, 1, 2)]
            cur.execute(
                base_q + " AND a.article_number = ANY(%s)"
                         f" ORDER BY ({rank_expr}) DESC, code_prio, act.title LIMIT 100",
                base_params + [inj] + kw_params)
            exact = {r['id']: r for r in cur.fetchall()}
            by_id = {r['id']: r for r in out}
            for rid, row in exact.items():
                exact_ids.add(rid)
                # i codici hanno priorita' (Costituzione, c.p./c.c. > altri R.D.):
                # l'offset nella distanza evita che atti minori con lo stesso
                # numero battano il codice per pochi match lessicali
                prio = row['code_prio']
                prio_off = 0.08 if prio in (0, 1) else (0.03 if prio == 2 else 0.0)
                if rid in by_id:
                    # l'hit esatto era gia' tra i candidati: azzera la distanza
                    # cosi' sale in cima invece di restare sepolto dal ranking
                    by_id[rid]['distance'] = -prio_off
                else:
                    row['distance'] = -prio_off
                    out.append(dict(row))
        # keyword boost: deduplicato e con peso piccolo — rompe i pareggi
        # senza ribaltare l'ordinamento (vale anche per il tier esatto).
        boost = float(os.environ.get('LEGAL_KEYWORD_BOOST', '0.01'))
        for r in out:
            txt = (r['text'] or '').lower()
            bonus = sum(1 for w in kw if w in txt)
            r['distance'] = round(float(r.get('distance') if r.get('distance') is not None else 1.0) - boost * bonus, 4)
        # --- Fusione ibrida RRF (vettoriale + FTS, + cross-encoder se opt-in) ---
        # Gli hit esatti (numero/tema) restano un tier separato: la fusione li
        # diluirebbe quando la lista FTS non li contiene (es. "art. 577").
        exact_rows = [r for r in out if r['id'] in exact_ids]
        rest_rows = [r for r in out if r['id'] not in exact_ids]
        by_distance = sorted(rest_rows, key=lambda r: float(r.get('distance') if r.get('distance') is not None else 1.0))
        ranked_lists = [[r['id'] for r in by_distance]]
        fts_ids = [i for i in fts_order if i not in exact_ids]
        if fts_ids:
            ranked_lists.append(fts_ids)
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
                by_rerank = sorted(rest_rows, key=lambda r: r['rerank_score'], reverse=True)
                ranked_lists.append([r['id'] for r in by_rerank])
            except Exception:
                ranked_lists = ranked_lists[:2]  # degrada: resta ibrido vector+fts
        fused = _rrf_fusion(ranked_lists)
        order = {item_id: rank for rank, item_id in enumerate(fused)}
        rest_rows.sort(key=lambda r: order.get(r['id'], 10**9))
        # tier esatto: prima gli articoli il cui TESTO contiene le keyword della
        # domanda (discrimina l'atto pertinente: es. D.Lgs 81/2008 art. 28
        # "valutazione dei rischi" batte Costituzione art. 28 ininfluente),
        # poi chi ha il TITOLO dell'atto che matcha (es. query con
        # "costituzione" -> art. 3 Cost. anche se il testo usa "eguali"), poi
        # per distanza (priorita' codici via offset code_prio).
        kw_lower = [w for w in kw if w]
        exact_rows.sort(key=lambda r: (
            -sum(1 for w in kw_lower if w in (r['text'] or '').lower()),
            -3 * sum(1 for w in kw_lower if w in (r.get('title') or '').lower()),
            float(r.get('distance') if r.get('distance') is not None else 1.0)))
        return (exact_rows + rest_rows)[:max_results]
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