#!/usr/bin/env python3
"""Hermes Legal — Cross-encoder reranker (caricamento lazy, singleton).

Usa un cross-encoder multilingue (mmarco-mMiniLMv2-L12-H384-v1) per riordinare
i candidati del retrieval: il bi-encoder (embedding) recupera i top-N candidati
velocemente, il cross-encoder assegna a ogni coppia (query, testo) un punteggio
di rilevanza piu' preciso, e il ranking finale segue quel punteggio.

Se il modello non e' disponibile (percorso mancante, errore di caricamento),
score_pairs() propaga l'eccezione; il chiamante (search.semantic_search) degrada
all'ordinamento per distanza vettoriale senza far fallire la ricerca.
"""
import os

MODEL_PATH = os.environ.get(
    "LEGAL_RERANK_MODEL",
    "/opt/hermes-legal/models/cross-encoder-mmarco",
)
MAX_LENGTH = int(os.environ.get("LEGAL_RERANK_MAX_LENGTH", "512"))

_model = None


def _load():
    global _model
    if _model is None:
        from sentence_transformers import CrossEncoder

        _model = CrossEncoder(MODEL_PATH, max_length=MAX_LENGTH)
    return _model


def score_pairs(pairs):
    """Ritorna lista di float: punteggio di rilevanza per ogni coppia (query, testo)."""
    if not pairs:
        return []
    return _load().predict(pairs).tolist()


def reset():
    global _model
    _model = None
