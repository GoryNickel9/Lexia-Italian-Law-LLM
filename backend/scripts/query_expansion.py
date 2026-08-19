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
    ({"scippo", "scippare", "borseggio", "scippato"},
     "furto scippo strappo sottrazione"),
    ({"percosse", "percuotere", "pestaggio", "picchiare", "picchiato"},
     "percosse lesioni personali"),
    ({"stupro", "molestie", "molestare", "molestato"},
     "violenza sessuale atti sessuali"),
    ({"minaccia", "minacce", "minacciare", "minacciato"},
     "minaccia violenza privata"),
    ({"danneggiamento", "danneggiare", "danneggiato", "danneggia", "vandalismo", "imbrattare"},
     "danneggiamento danneggiare"),
    ({"calunnia", "calunniare", "calunniato"},
     "calunnia falsa accusa"),
    ({"separazione", "separarsi", "divorzio", "divorziare"},
     "separazione divorzio effetti patrimoniali coniugi"),
    ({"rapina", "rapine"},
     "rapina violenza minaccia impossessamento"),
]


_ELISION = re.compile(r"^(?:l|un|all|dell|nell|sull|quest|quell|d|ch|c|gl|agl|dagl|degl|negl|sugl)'")
_PUNCT = re.compile(r"[^\w\s'-]")  # ? ! . , ; : ) ( ... tolte dal match sinonimi


def norm_token(token):
    """Rimuove punteggiatura ed elisione italiana (l', dell', un', ...)
    per il match sui sinonimi: 'rapina?' deve matchare 'rapina'."""
    token = _PUNCT.sub('', token)
    return _ELISION.sub('', token.lower()) or token.lower()


def normalize_tokens(query):
    """Token normalizzati della query (minuscole, senza elisioni)."""
    return [norm_token(t) for t in query.lower().split()]


# Temi con articoli "di riferimento" da includere SEMPRE nei candidati:
# il bi-encoder non collega la domanda al testo di questi articoli (struttura
# a elenco di circostanze), quindi vengono iniettati con priorita' esatta.
# L'LLM poi sceglie e cita quelli pertinenti.
TEMA_ARTICOLI = {
    ("omicidio", "omicidi", "uccidere", "uccido", "ammazzare", "ammazzo"): [
        "575", "576", "577", "578", "579", "584", "589"],
    ("furto", "rubare", "rubo", "ruba", "sottrazione", "impossessamento",
     "scippo", "scippare", "scippato"): [
        "624", "624-bis", "625", "626", "628"],
    ("truffa", "truffe"): ["640", "640-bis"],
    ("risarcimento", "risarcire", "risarcisce"): ["2043"],
    ("danno", "danni"): ["2043", "2050"],
    ("stalking", "persecutori"): ["612-bis"],
    ("licenziamento", "licenziare", "licenziato"): ["2118", "2119"],
    ("rapina", "rapine"): ["628", "628-bis"],
    ("percosse", "percuotere", "pestaggio", "picchiare", "picchiato"): ["581", "582", "583", "590"],
    ("lesioni", "ferito", "ferisce", "feriscono"): ["582", "583", "590"],
    ("diffamazione", "diffamare", "diffamato"): ["595", "596"],
    ("calunnia", "calunniare", "calunniato"): ["368"],
    ("stupro", "sessuale", "sessuali", "molestie", "molestare"): ["609-bis", "609-ter", "609-quater"],
    ("minaccia", "minacce", "minacciare", "minacciato", "violenza", "costringere", "costretto", "privata"): ["610", "612"],
    ("usufrutto", "usufruttuario", "usufruttuaria"): ["978", "979", "981", "1002"],
    ("prescrizione", "prescritto", "prescritta", "decadenza"): ["2946", "2934", "2947", "2948", "2949"],
    ("ebbrezza", "ubriaco", "ubriaca", "alcol", "alcohol", "alcool"): ["186"],
    ("soccorso", "emergenza", "emergenze"): ["45"],
    ("disabile", "disabili", "disabilita'", "disabilità", "handicap", "assistenza"): ["33"],
    ("valutazione", "rischi", "dvr"): ["28"],
    ("innocenza", "colpevole"): ["27", "6"],
    ("permesso", "permessi"): ["33"],
    ("danneggiamento", "danneggiare", "danneggiato", "danneggia", "danneggiano",
     "vandalismo", "imbrattare"): ["635"],
    ("stradale", "stradali"): ["589-bis"],
    ("locazione", "affitto", "affittare", "affittuario", "conduttore"): ["1571", "1575", "1587", "1591"],
    ("separazione", "separarsi", "divorzio", "divorziare"): ["156"],
}


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
    norm = {norm_token(t) for t in tokens}
    additions = []
    for group, expansion in EXPANSIONS:
        if group & norm:
            for word in expansion.split():
                if word not in tokens and word not in additions:
                    additions.append(word)
    if not additions:
        return query
    return query + " " + " ".join(additions)
