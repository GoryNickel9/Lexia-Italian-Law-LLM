#!/usr/bin/env python3
"""Hermes Legal — Test end-to-end del flusso sito → API → LLM → post-check.

Simula esattamente quello che farà il sito Lexia:
  1. chiama /search con la domanda (retrieval semantico + vigenza)
  2. costruisce il contesto con le fonti del corpus (testo completo)
  3. chiama il profilo Hermes isolato (gateway /p/hermes_legal_site) con
     il contesto e la SOUL giuridica (vigenza + citazioni obbligatorie)
  4. estrae le URN dalla risposta del LLM
  5. le verifica su /verify-citations (post-check anti-allucinazione)
  6. esito: risposta + citazioni tutte verificate (all_found)

Env richiesti:
  LEGAL_API_URL  (default http://127.0.0.1:8750)
  LEGAL_API_KEY
  LEGAL_GW_URL   (default http://127.0.0.1:8642/p/hermes_legal_site/v1/chat/completions)
  LEGAL_GW_KEY   (API_SERVER_KEY del profilo hermes_legal_site)
  LEGAL_MODEL    (default deepseek-v4-flash)
"""
import json
import os
import re
import sys
import urllib.request

API_URL = os.environ.get("LEGAL_API_URL", "http://127.0.0.1:8750")
API_KEY = os.environ.get("LEGAL_API_KEY", "")
GW_URL = os.environ.get(
    "LEGAL_GW_URL",
    "http://127.0.0.1:8642/p/hermes_legal_site/v1/chat/completions",
)
GW_KEY = os.environ.get("LEGAL_GW_KEY", "")
MODEL = os.environ.get("LEGAL_MODEL", "deepseek-v4-flash")
REF_DATE = os.environ.get("LEGAL_REF_DATE", "")

URN_RE = re.compile(
    r"urn:nir:stato:[a-z0-9\.\-]+:\d{4}-\d{2}-\d{2};[0-9a-z\-]+"
)


def post(url, payload, token=None, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(payload).encode())
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def build_context(rows, max_chars=16_000):
    parts = []
    budget = max_chars
    for r in rows:
        text = (r.get("text") or "").strip()
        block = (
            f"FONTE: {r.get('urn')} | {r.get('title')} | "
            f"art. {r.get('article_number')} comma {r.get('paragraph_number') or 'int.'} "
            f"| stato {r.get('status')}\nTESTO: {text}"
        )
        if budget <= 0:
            break
        parts.append(block[:budget])
        budget -= len(block)
    return "\n\n".join(parts)


def main():
    query = sys.argv[1] if len(sys.argv) > 1 else (
        "Quali sono i permessi lavorativi per i disabili previsti dalla legge 104?")
    ref_date = REF_DATE or __import__("datetime").date.today().isoformat()

    print(f"1. Retrieval: {query!r} (ref {ref_date})")
    payload = {"query": query, "max_results": 5, "reference_date": ref_date}
    data = post(f"{API_URL}/search", payload, API_KEY, timeout=60)
    rows = data.get("results", [])
    print(f"   -> {len(rows)} fonti trovate")
    if not rows:
        print("FAIL: nessuna fonte nel corpus")
        return 1

    ctx = build_context(rows)
    system = (
        "Sei un giurista italiano. Rispondi SOLO usando le fonti del contesto "
        "del corpus locale. Ogni affermazione deve citare la fonte con URN e "
        f"articolo. Data di riferimento: {ref_date}. Se il contesto non basta, "
        "dì esplicitamente che non hai trovato una fonte sufficiente."
    )
    user = f"DOMANDA: {query}\n\nCONTESTO DAL CORPUS LOCALE:\n{ctx}"

    print("2. LLM giuridico (profilo isolato)")
    llm = post(GW_URL, {"messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ], "model": MODEL}, GW_KEY, timeout=240)
    answer = llm["choices"][0]["message"]["content"]
    print(f"   -> risposta {len(answer)} caratteri")

    print("3. Estrazione URN dalla risposta")
    urns = sorted(set(URN_RE.findall(answer)))
    print(f"   -> {len(urns)} URN citate: {urns}")

    print("4. Post-check citazioni")
    if urns:
        v = post(f"{API_URL}/verify-citations", {"citations": urns,
                                                 "reference_date": ref_date},
                 API_KEY, timeout=30)
        print(f"   -> all_found: {v.get('all_found')}")
        for r in v.get("results", []):
            st = "OK" if r.get("found") else "MANCANTE"
            print(f"   [{st}] {r.get('urn')} {r.get('status', '')}")
        if not v.get("all_found"):
            print("FAIL: almeno una citazione non verificata nel corpus")
            return 1
    else:
        print("   (nessuna URN nella risposta)")

    print("\n=== RISPOSTA GIURIDICA ===")
    print(answer[:3000])
    print("\n=== ESITO: PASS ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
