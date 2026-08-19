#!/usr/bin/env python3
"""Hermes Legal — Benchmark retrieval (eval set + metriche).

Misura la qualita' del ranking semantico su domande legali reali con
citazione attesa (atto/articolo). Metriche: Recall@k e MRR@k.

Uso:
  python3 eval_retrieval.py                 # baseline con config attuale
  LEGAL_RERANK_ENABLED=true python3 eval_retrieval.py   # con reranker
  python3 eval_retrieval.py --config "KEY=VAL" ...      # override multipli

Ogni voce dell'eval set:
  - q: domanda naturale (come dal sito)
  - urn: URN dell'atto atteso (prefix match)
  - art: numero articolo atteso (opzionale)
"""
import json
import os
import sys

# --- eval set: domande reali con risposta attesa ---------------------------
EVAL = [
    # Codice penale
    {"q": "qual è la pena per il reato di rapina?", "urn": "regio.decreto:1930-10-19;1398", "art": "628"},
    {"q": "omicidio preterintenzionale pena", "urn": "regio.decreto:1930-10-19;1398", "art": "584"},
    {"q": "violenza privata articolo", "urn": "regio.decreto:1930-10-19;1398", "art": "610"},
    {"q": "furto semplice pena", "urn": "regio.decreto:1930-10-19;1398", "art": "624"},
    {"q": "diffamazione art. 595 codice penale", "urn": "regio.decreto:1930-10-19;1398", "art": "595"},
    # Codice civile
    {"q": "risarcimento danni fatto illecito art. 2043", "urn": "regio.decreto:1942-03-16;262", "art": "2043"},
    {"q": "prescrizione ordinaria dieci anni", "urn": "regio.decreto:1942-03-16;262", "art": "2946"},
    {"q": "obbligazioni contratto inadempimento art 1218", "urn": "regio.decreto:1942-03-16;262", "art": "1218"},
    {"q": "comunione legale dei beni tra coniugi", "urn": "regio.decreto:1942-03-16;262", "art": "177"},
    {"q": "usufrutto definizione codice civile", "urn": "regio.decreto:1942-03-16;262", "art": "978"},
    # Costituzione
    {"q": "libertà personale art. 13 costituzione", "urn": "costituzione", "art": "13"},
    {"q": "diritto di sciopero articolo costituzione", "urn": "costituzione", "art": "40"},
    {"q": "uguaglianza formale art 3 costituzione", "urn": "costituzione", "art": "3"},
    # Codice procedura penale (nel DB come DPR 447/1988!)
    {"q": "presunzione di innocenza codice procedura penale", "urn": "decreto.del.presidente.della.repubblica:1988-09-22;447", "art": None},
    # Legge fallimentare (R.D. 267/1942 — decreto di approvazione)
    {"q": "fallimento imprenditore commerciale dichiarazione", "urn": "regio.decreto:1942-03-16;267", "art": None},
    # Regolamento esecuzione c.p.c. (R.D. 1368/1941)
    {"q": "regolamento per la esecuzione del codice di procedura civile", "urn": "regio.decreto:1941-12-18;1368", "art": None},
    # TULPS (R.D. 773/1931) se presente
    {"q": "licenza di pubblica sicurezza questore", "urn": "regio.decreto:1931-06-18;773", "art": None},
    # TU sicurezza lavoro (D.Lgs. 81/2008)
    {"q": "obblighi del datore di lavoro valutazione rischi", "urn": "decreto.legislativo:2008-04-09;81", "art": "28"},
    {"q": "primo soccorso obbligo aziendale", "urn": "decreto.legislativo:2008-04-09;81", "art": "45"},
    # Decreto legislativo 196/2003 privacy
    {"q": "trattamento dati personali consenso", "urn": "decreto.legislativo:2003-06-30;196", "art": None},
    # D.Lgs 14/2019 (codice crisi impresa)
    {"q": "sovraindebitamento procedura crisi impresa", "urn": "decreto.legislativo:2019-01-12;14", "art": None},
    # Codice della strada (D.Lgs 285/1992)
    {"q": "limite velocità autostrada codice strada", "urn": "decreto.legislativo:1992-04-30;285", "art": "142"},
    {"q": "guida in stato di ebbrezza art. 186", "urn": "decreto.legislativo:1992-04-30;285", "art": "186"},
    # Legge 104/1992 (handicap) se presente
    {"q": "permessi lavorativi legge 104 assistenza disabile", "urn": "legge:1992-02-05;104", "art": "33"},
    # Testo unico banche (D.Lgs 385/1993) se presente
    {"q": "vigilanza banche banca d'italia testo unico bancario", "urn": "decreto.legislativo:1993-09-01;385", "art": None},
]


def _match(row, item):
    """True se il risultato corrisponde all'atto (e articolo) atteso."""
    urn = (row.get("urn") or "")
    if item["urn"] not in urn:
        return False
    if item.get("art") and item["art"] not in (row.get("article_number") or ""):
        return False
    return True


def run_eval(max_results=10):
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts"))
    import search
    n = len(EVAL)
    hits_at = {k: 0 for k in (1, 3, 5, 10)}
    mrr = 0.0
    detail = []
    out_file = os.environ.get("LEGAL_EVAL_OUT", "/tmp/eval_results.json")
    for i, item in enumerate(EVAL, 1):
        print(f"[{i}/{len(EVAL)}] {item['q'][:50]}", file=sys.stderr, flush=True)
        rows = search.semantic_search(item["q"], max_results=max_results)
        found = None
        for rank, row in enumerate(rows, 1):
            if _match(row, item):
                found = rank
                break
        # salvataggio incrementale: sopravvive a timeout/kill
        with open(out_file, "w", encoding="utf-8") as fh:
            json.dump({"done": i, "found": found, "q": item["q"],
                       "expected": item["urn"].split(":")[-1],
                       "top": (rows[0]["urn"] or "") + " art." + str(rows[0].get("article_number") or "") if rows else None},
                      fh, ensure_ascii=False, indent=1)
        if found:
            for k in hits_at:
                if found <= k:
                    hits_at[k] += 1
            mrr += 1.0 / found
        detail.append({"q": item["q"], "expected": item["urn"].split(":")[-1],
                       "found_rank": found,
                       "top": (rows[0]["urn"] or "") + " art." + str(rows[0].get("article_number") or "") if rows else None})
    print(f"Eval set: {n} domande | max_results={max_results}")
    print(f"Recall@1:  {hits_at[1]:3d}/{n} ({100*hits_at[1]/n:.0f}%)")
    print(f"Recall@3:  {hits_at[3]:3d}/{n} ({100*hits_at[3]/n:.0f}%)")
    print(f"Recall@5:  {hits_at[5]:3d}/{n} ({100*hits_at[5]/n:.0f}%)")
    print(f"Recall@10: {hits_at[10]:3d}/{n} ({100*hits_at[10]/n:.0f}%)")
    print(f"MRR@10:    {mrr/n:.3f}")
    print()
    for d in detail:
        print(f"  {'OK ' if d['found_rank'] else 'MISS'} rank={str(d['found_rank']):>3} | atteso {d['expected']:<28} | top: {d['top']}")
        if d["found_rank"] is None:
            print(f"        q: {d['q']}")
    return {"recall_at_1": hits_at[1], "recall_at_5": hits_at[5], "mrr": mrr / n, "n": n}


if __name__ == "__main__":
    # override ambiente da --config "KEY=VAL"
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--config":
            k, v = args[i + 1].split("=", 1)
            os.environ[k] = v
            i += 2
        else:
            i += 1
    run_eval()
