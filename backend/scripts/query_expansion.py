#!/usr/bin/env python3
"""Hermes Legal — Espansione lessicale della query per il retrieval ibrido.

Il bi-encoder multilingue (MiniLM 384d) collega bene domande che parafrasano
il testo degli articoli, ma fallisce quando la domanda usa parole che non
compaiono nella norma (es. "rubo" -> art. 624 c.p., il cui testo dice
"s'impossessa della cosa mobile altrui" e non contiene "furto").

expand_query() arricchisce la query con sinonimi e termini giuridici correlati
PRIMA dell'embedding e del keyword boost: i candidati giusti entrano nella
finestra del cross-encoder, che poi fa il ranking finale.
"""
import re


EXPANSIONS = [
    ({"rubo", "rubare", "rubato", "rubi", "rubano", "furto", "furi", "ladro", "ladri", "ladruncolo"},
     "furto rubare sottrazione impossessamento della cosa mobile altrui"),
    ({"uccido", "uccidere", "ucciso", "uccisione", "omicidio", "omicida", "ammazzare", "ammazzo", "ammazzato"},
     "omicidio uccidere cagionare la morte di un uomo persona"),
    ({"rapina", "rapinare", "rapino", "rapinato"},
     "rapina violenza sottrazione"),
    ({"droga", "droghe", "stupefacenti", "spaccio", "spacciare", "spaccia"},
     "stupefacenti droga spaccio detenzione"),
    ({"danno", "danni", "risarcimento", "risarcire", "risarcito", "risarcita"},
     "danno risarcimento responsabilità danno ingiusto"),
    ({"licenzia", "licenziamento", "licenziato", "licenziare", "licenziata"},
     "licenziamento rapporto di lavoro"),
    ({"contratto", "contratti", "inadempimento", "clausola", "clausole", "inadempiente"},
     "contratto inadempimento obbligazioni"),
    ({"multa", "sanzione", "sanzioni", "ammenda", "contravvenzione", "sanzionare"},
     "sanzione multa ammenda contravvenzione"),
    ({"reclusione", "carcere", "prigione", "pena", "pene", "condanna", "condannato", "ergastolo"},
     "reclusione pena condanna sanzione penale ergastolo circostanze aggravanti"),
    ({"aggravante", "aggravanti", "aggravato", "aggravata", "circostanze"},
     "circostanze aggravanti pena dell'ergastolo"),
    ({"testamento", "eredita", "eredita'", "erede", "eredi", "successione", "legato", "legatario"},
     "successione eredità testamento erede"),
    ({"separazione", "divorzio", "coniuge", "coniugi", "matrimonio", "matrimoniale"},
     "matrimonio separazione divorzio coniugi"),
    ({"comprare", "compro", "compra", "acquisto", "acquistare", "vendere", "vendo", "vende", "vendita", "compravendita"},
     "compravendita vendita acquisto contratto"),
    ({"affitto", "affittare", "affitto", "locazione", "locatario", "conduttore", "locatore"},
     "locazione affitto contratto"),
    ({"lavoro", "lavoratore", "lavoratori", "dipendente", "datore", "lavorativa", "lavorativo"},
     "lavoro lavoratore datore di lavoro"),
    ({"infortunio", "infortuni", "infortunato", "infortunata"},
     "infortunio sicurezza lavoro tutela integrità fisica del lavoratore"),
    ({"violenza", "molestia", "molestie", "molestare", "stalking", "minaccia", "minacce", "minacciare"},
     "violenza minaccia molestia stalking"),
    ({"paura", "spavento", "spaventato", "costretto", "costretta", "costringere", "costringe"},
     "violenza minaccia costringere contro la volontà"),
    ({"falso", "falsificare", "falsificazione", "contraffazione", "falsificato"},
     "falso falsificazione contraffazione"),
    ({"bancarotta", "fallimento", "fallito", "fallita"},
     "bancarotta fallimento impresa"),
    ({"truffa", "truffare", "truffato", "truffata", "raggiro"},
     "truffa raggiro inganno profitto"),
    ({"riciclaggio", "riciclare", "ricicla"},
     "riciclaggio denaro"),
    ({"diffamazione", "insulto", "insulti", "ingiuria", "calunnia", "diffamare", "offesa"},
     "diffamazione ingiuria calunnia"),
    ({"tribunale", "giudice", "causa", "processo", "querela", "denuncia", "denunciare", "citazione", "ricorso"},
     "processo tribunale giudice querela denuncia ricorso"),
]


_ELISION = re.compile(r"^(?:l|un|all|dell|nell|sull|quest|quell|d|ch|c|gl|agl|dagl|degl|negl|sugl)'")


def _norm_token(token):
    """Rimuove l'elisione italiana (l', dell', un', ...) per il match sui sinonimi."""
    return _ELISION.sub('', token.lower()) or token.lower()


def expand_query(query):
    """Ritorna la query arricchita (originale + sinonimi correlati).

    Conserva la query originale in testa (il ranking finale resta ancorato
    all'intento dell'utente) e appende i termini di espansione deduplicati.
    Le elisioni italiane (l'ergastolo, dell'omicidio) vengono normalizzate
    prima del confronto con i gruppi di sinonimi.
    """
    if not query:
        return query
    tokens = query.lower().split()
    norm = {_norm_token(t) for t in tokens}
    additions = []
    for group, expansion in EXPANSIONS:
        if group & norm:
            for word in expansion.split():
                if word not in tokens and word not in additions:
                    additions.append(word)
    if not additions:
        return query
    return query + " " + " ".join(additions)
