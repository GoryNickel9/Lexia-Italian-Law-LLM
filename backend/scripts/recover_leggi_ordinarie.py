#!/usr/bin/env python3
"""Hermes Legal — Recupero leggi ordinarie mancanti dal corpus.

Le collezioni Normattiva preconfezionate NON coprono le leggi ordinarie
(non-DL): l. 104/1992, 241/1990, 300/1970, 194/1978 ecc. sono assenti dal DB.
Questo script le recupera articolo-per-articolo via API:

  1. ricerca/semplice     -> codiceRedazionale + dataGU  (trova l'atto)
  2. dettaglio-atto (idArticolo=1..N) -> HTML dell'articolo N (paginato)
  3. estrae gli articoli dall'HTML e costruisce AKN sintetico
  4. ingest con guardia act_exists_complete() (mai sovrascrivere atti completi)

Uso:
  python3 recover_leggi_ordinarie.py [--dry-run] [--max-leggi N] [--urn ...]
"""
import json
import os
import re
import sys
import time
import html as htmlmod
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ingest

AKN_NS = 'http://docs.oasis-open.org/legaldocml/ns/akn/3.0'

API = "https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1"
OUTDIR = "/opt/hermes-legal/cache/recovered_leggi"
CACHE = "/opt/hermes-legal/cache/leggi_ordinarie.json"  # lista leggi da recuperare

# Leggi ordinarie fondamentali assenti dal corpus (verificate via SELECT).
# (urn, nome leggibile)
LEGGI = [
    ("urn:nir:stato:legge:1992-02-05;104", "Legge 104/1992 disabilita'"),
    ("urn:nir:stato:legge:1990-08-07;241", "Legge 241/1990 procedimento amministrativo"),
    ("urn:nir:stato:legge:1970-05-20;300", "Statuto dei lavoratori (l. 300/1970)"),
    ("urn:nir:stato:legge:1978-05-22;194", "Legge 194/1978 interruzione gravidanza"),
    ("urn:nir:stato:legge:2004-02-19;40", "Legge 40/2004 procreazione assistita"),
    ("urn:nir:stato:legge:1970-12-01;898", "Legge 898/1970 divorzio"),
    ("urn:nir:stato:legge:1941-04-22;633", "Legge 633/1941 diritto d'autore"),
    ("urn:nir:stato:legge:1978-12-23;833", "Legge 833/1978 istituzione SSN"),
    ("urn:nir:stato:legge:1983-05-04;184", "Legge 184/1983 adozione"),
    ("urn:nir:stato:legge:1992-02-05;91", "Legge 91/1992 cittadinanza"),
    ("urn:nir:stato:legge:1981-11-24;689", "Legge 689/1981 depenalizzazione"),
    ("urn:nir:stato:legge:1975-07-26;354", "Legge 354/1975 ordinamento penitenziario"),
    ("urn:nir:stato:legge:1995-05-31;218", "Legge 218/1995 diritto internazionale privato"),
    ("urn:nir:stato:legge:1998-12-09;431", "Legge 431/1998 locazioni"),
    ("urn:nir:stato:legge:1990-06-12;146", "Legge 146/1990 sciopero servizi pubblici"),
    ("urn:nir:stato:legge:2012-11-06;190", "Legge 190/2012 anticorruzione"),
    ("urn:nir:stato:legge:2016-05-20;76", "Legge 76/2016 unioni civili"),
    ("urn:nir:stato:legge:2017-12-22;219", "Legge 219/2017 consenso informato"),
    ("urn:nir:stato:legge:1966-07-15;604", "Legge 604/1966 licenziamenti individuali"),
    ("urn:nir:stato:legge:1990-05-11;108", "Legge 108/1990 licenziamenti"),
]


def api_post(path, payload, tries=3):
    req = urllib.request.Request(
        API + path, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if i == tries - 1:
                return {"message": f"ERR {e}"}
            time.sleep(3 * (i + 1))
    return {"message": "ERR"}


def find_act(urn):
    """ricerca/semplice -> (codiceRedazionale, dataGU) o None."""
    m = re.match(r"urn:nir:stato:legge:([0-9]{4})-([0-9]{2})-([0-9]{2});([0-9]+)", urn)
    if not m:
        return None
    anno, num = m.group(1), m.group(4)
    d = api_post("/ricerca/semplice", {
        "testoRicerca": f"legge {num} {anno}",
        "orderType": "",
        "filtriMap": {},
        "paginazione": {"paginaCorrente": 1, "numeroElementiPerPagina": 10}})
    for atto in d.get("listaAtti", []):
        if atto.get("numeroProvvedimento") == num and atto.get("annoProvvedimento") == anno \
                and atto.get("denominazioneAtto", "").upper() == "LEGGE":
            return atto.get("codiceRedazionale"), atto.get("dataGU")
    return None


def fetch_articles(codice_red, data_gu, max_articles=600):
    """Paginazione idArticolo=1..N -> lista (num, testo)."""
    out = []
    for art_id in range(1, max_articles + 1):
        d = api_post("/atto/dettaglio-atto", {
            "codiceRedazionale": codice_red, "idArticolo": art_id, "dataGU": data_gu})
        atto = (d or {}).get("data", {}).get("atto")
        if not atto:
            break  # oltre l'ultimo articolo
        ah = atto.get("articoloHtml") or ""
        # numero articolo
        mnum = re.search(r'<h2 class="article-num-akn"[^>]*>\s*(Art\.?\s*[0-9a-zA-Z-]+)', ah)
        num = mnum.group(1).strip() if mnum else str(art_id)
        # testo: span art_text_in_comma (piu' robusto di art-just-text per leggi)
        spans = re.findall(r'<span class="art_text_in_comma">(.*?)</span>', ah, re.S)
        if not spans:
            sp2 = re.search(r'<span class="art-just-text-akn">(.*?)</span>', ah, re.S)
            spans = [sp2.group(1)] if sp2 else []
        if not spans:
            continue
        body = " ".join(spans)
        body = re.split(r'<div class="note-akn"', body)[0]
        body = re.sub(r'<[^>]+>', ' ', body)
        body = htmlmod.unescape(body)
        body = ' '.join(body.split())
        body = re.sub(r'\(\(\s*(.*?)\s*\)\)', r'\1', body)  # marcatori novella
        if body:
            out.append((num, body))
        time.sleep(0.25)  # gentilezza verso l'API
    return out


def build_akn(urn, date, num, articles):
    act_type = "legge"
    body = "".join(
        f'<paragraph eId="par_{i}"><content><p>Art. {anum}. {text}</p></content></paragraph>'
        for i, (anum, text) in enumerate(articles, 1))
    return f'''<?xml version="1.0" encoding="UTF-8"?>
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
      {body}
    </mainBody>
  </act>
</akomaNtoso>'''


def act_exists_complete(urn):
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
    args = sys.argv[1:]
    dry = "--dry-run" in args
    max_leggi = 999
    if "--max-leggi" in args:
        max_leggi = int(args[args.index("--max-leggi") + 1])
    os.makedirs(OUTDIR, exist_ok=True)
    leggi = LEGGI[:max_leggi]
    print(f"leggi da recuperare: {len(leggi)} (dry={dry})", flush=True)
    ok, skipped, failed = 0, 0, []
    for urn, nome in leggi:
        if act_exists_complete(urn):
            print(f"SKIP {nome}: gia' presente", flush=True)
            skipped += 1
            continue
        found = find_act(urn)
        if not found:
            print(f"FAIL {nome}: atto non trovato via ricerca", flush=True)
            failed.append((urn, "not found"))
            continue
        codice, data_gu = found
        articles = fetch_articles(codice, data_gu)
        if len(articles) < 2:
            print(f"FAIL {nome}: solo {len(articles)} articoli estratti", flush=True)
            failed.append((urn, f"articles={len(articles)}"))
            continue
        m = re.match(r"urn:nir:stato:legge:([0-9]{4}-[0-9]{2}-[0-9]{2});([0-9]+)", urn)
        xml = build_akn(urn, m.group(1), m.group(2), articles)
        fpath = os.path.join(OUTDIR, f"{m.group(1)}_{m.group(2)}_{codice}.xml")
        with open(fpath, "w") as f:
            f.write(xml)
        if dry:
            print(f"DRY {nome}: {len(articles)} articoli -> {fpath}", flush=True)
            ok += 1
            continue
        a_id, n = ingest.ingest(fpath, status="vigente")
        print(f"OK {nome}: {len(articles)} art. ingeriti (act {a_id})", flush=True)
        ok += 1
        time.sleep(0.5)
    print(f"=== FINE: {ok} ok, {skipped} skip, {len(failed)} failed ===", flush=True)
    for u, why in failed:
        print(f"  FAILED {u}: {why}", flush=True)


if __name__ == "__main__":
    main()
