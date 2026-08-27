#!/usr/bin/env python3
"""Read-only HTTP retrieval gateway for Hermes Legal.

The public Next.js site calls this service server-to-server. It exposes only
local corpus search; it never exposes PostgreSQL or an arbitrary SQL endpoint.

Environment:
  LEGAL_API_HOST=127.0.0.1
  LEGAL_API_PORT=8750
  LEGAL_API_KEY=<required in production>
  LEGAL_API_ALLOW_UNAUTH=false
"""
import datetime
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import search

HOST = os.environ.get("LEGAL_API_HOST", "127.0.0.1")
PORT = int(os.environ.get("LEGAL_API_PORT", "8750"))
API_KEY = os.environ.get("LEGAL_API_KEY", "")
ALLOW_UNAUTH = os.environ.get("LEGAL_API_ALLOW_UNAUTH", "false").lower() == "true"


def json_bytes(payload):
    return json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")


def result_payload(row):
    return {
        "text": row.get("text", ""),
        "citation": search.citation(row),
        "article_number": row.get("article_number"),
        "paragraph_number": row.get("paragraph_number"),
        "title": row.get("title"),
        "act_type": row.get("act_type"),
        "act_number": row.get("act_number"),
        "act_date": row.get("act_date"),
        "status": row.get("status"),
        "source": row.get("source"),
        "urn": row.get("urn"),
        "distance": row.get("distance"),
        "rerank_score": row.get("rerank_score"),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "HermesLegalSearch/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def send_json(self, status, payload):
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        if API_KEY:
            return self.headers.get("Authorization", "") == f"Bearer {API_KEY}"
        return ALLOW_UNAUTH and HOST in {"127.0.0.1", "localhost", "::1"}

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True, "service": "hermes-legal-search"})
        else:
            self.send_json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path not in ("/search", "/verify-citations"):
            self.send_json(404, {"error": "not_found"})
            return
        if not self.authorized():
            self.send_json(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 32_768:
                self.send_json(413, {"error": "request_too_large"})
                return
            body = json.loads(self.rfile.read(length) or b"{}")
            reference_date = body.get("reference_date")
            ref_date = datetime.date.fromisoformat(reference_date) if reference_date else None
            if self.path == "/verify-citations":
                citations = body.get("citations")
                if not isinstance(citations, list) or len(citations) > 50:
                    self.send_json(400, {"error": "citations_list_required"})
                    return
                results = search.verify_citations([str(c) for c in citations], ref_date=ref_date)
                self.send_json(200, {
                    "results": results,
                    "all_found": all(r.get("found") for r in results),
                    "corpus_date": datetime.date.today().isoformat(),
                })
                return
            query = str(body.get("query", "")).strip()
            if not query or len(query) > 2_000:
                self.send_json(400, {"error": "query_required"})
                return
            max_results = min(max(int(body.get("max_results", 8)), 1), 16)
            extra = body.get("extra_citations")
            rows = search.semantic_search(
                query, max_results=max_results, ref_date=ref_date,
                extra_citations=extra if isinstance(extra, list) else None)
            self.send_json(200, {
                "results": [result_payload(row) for row in rows],
                "corpus_date": datetime.date.today().isoformat(),
            })
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except Exception as exc:
            print(f"retrieval error: {exc}", file=sys.stderr)
            self.send_json(500, {"error": "retrieval_failed"})


def _warmup():
    """Carica i modelli (bi-encoder + cross-encoder) in background all'avvio,
    così la prima richiesta dell'utente non paga il cold start (~15s) che
    supererebbe il timeout di 12s del sito."""
    try:
        from embedder import embed
        embed("warmup")
        import reranker
        reranker.score_pairs([("warmup", "testo di warmup del reranker")])
        print("models warmed (embedder + reranker)", flush=True)
    except Exception as exc:
        print(f"warmup failed: {exc}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    import threading
    print(f"Hermes Legal search API listening on {HOST}:{PORT}", flush=True)
    threading.Thread(target=_warmup, daemon=True).start()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
