#!/usr/bin/env python3
"""Hermes Legal — Embedder semantico (sentence-transformers, multilingue).

Carica il modello una sola volta (module-level lazy singleton) per riusarlo
tra atti/query. Modello: paraphrase-multilingual-MiniLM-L12-v2 (384 dim,
comprende l'italiano). Config via config/config.yaml -> embeddings.model_path.

Uso:
    from embedder import embed, embed_batch, EMBED_DIM
    vec = embed("testo ...")
    vecs = embed_batch([...])
"""
import os, logging
log = logging.getLogger(__name__)

MODEL_PATH = os.environ.get(
    'LEGAL_EMBED_MODEL',
    '/opt/hermes-legal/models/multilingual-minilm')
EMBED_DIM = int(os.environ.get('LEGAL_EMBED_DIM', 384))

_model = None

def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        log.info("Carico modello embedding da %s", MODEL_PATH)
        _model = SentenceTransformer(MODEL_PATH)
        log.info("Modello caricato: dim=%s", _model.get_embedding_dimension())
    return _model

def embed(text, batch_size=None):
    if not text or not text.strip():
        return [0.0] * EMBED_DIM
    vec = _get_model().encode([text], normalize_embeddings=True)[0]
    return [float(v) for v in vec]

def embed_batch(texts, batch_size=64):
    """Embedding per una lista. Ritorna lista di liste float."""
    model = _get_model()
    # dichiara errore onesto se lista vuota
    if not texts:
        return []
    vecs = model.encode(texts, normalize_embeddings=True,
                        batch_size=batch_size, show_progress_bar=False)
    return [[float(v) for v in row] for row in vecs]

if __name__ == '__main__':
    import sys
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        v = embed(line)
        print(len(v), ','.join(f'{x:.4f}' for x in v[:8]), '...')