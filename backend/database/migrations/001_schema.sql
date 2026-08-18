-- Hermes Legal — schema migration 001
-- Tables per il corpus normativo italiano vigente (vedi documento Hermes Legal).
-- Estensione vettoriale: richiede CREATE EXTENSION vector (fatto a mano nell'init).

CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================================
-- legal_acts
-- Un atto normativo (legge, decreto, regio decreto, regolamento, ...)
-- =====================================================================
CREATE TABLE IF NOT EXISTS legal_acts (
    id                  BIGSERIAL PRIMARY KEY,
    title               TEXT NOT NULL,
    act_type            TEXT,              -- es. 'REGIO DECRETO', 'LEGGE', 'DECRETO LEGISLATIVO'
    act_number          TEXT,
    act_date            DATE,
    publication_date    DATE,
    publication_gazzetta TEXT,
    urn                 TEXT UNIQUE,
    source              TEXT NOT NULL DEFAULT 'Normattiva',
    jurisdiction        TEXT NOT NULL DEFAULT 'Italia',  -- Italia | Sardegna | Sassari | UE
    status              TEXT DEFAULT 'vigente',          -- vigente | abrogato | ...
    original_version    TEXT,
    current_version     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_hash         TEXT
);

-- =====================================================================
-- legal_articles
-- Struttura articolo / comma / lettera dentro un atto.
-- =====================================================================
CREATE TABLE IF NOT EXISTS legal_articles (
    id               BIGSERIAL PRIMARY KEY,
    act_id           BIGINT REFERENCES legal_acts(id) ON DELETE CASCADE,
    book             TEXT,     -- libro
    title            TEXT,     -- titolo
    chapter          TEXT,     -- capo
    section          TEXT,     -- sezione
    article_number   TEXT,     -- es. '628'
    article_heading  TEXT,     -- es. 'Rapina'
    paragraph_number TEXT,     -- comma (numero dell'intestazione, es. '1')
    letter           TEXT,     -- lettera (es. 'a', 'b', '1-bis')
    level            TEXT NOT NULL DEFAULT 'article',  -- article | paragraph | letter
    text             TEXT NOT NULL,
    valid_from       DATE,
    valid_to         DATE,
    status           TEXT DEFAULT 'vigente',
    source_file      TEXT,
    source_hash      TEXT,
    body_order       INT DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- legal_versions
-- Versioni storiche / consolidate di un atto.
-- =====================================================================
CREATE TABLE IF NOT EXISTS legal_versions (
    id           BIGSERIAL PRIMARY KEY,
    act_id       BIGINT REFERENCES legal_acts(id) ON DELETE CASCADE,
    version      TEXT,             -- es. 'V1', 'V2'
    valid_from   DATE,
    valid_to     DATE,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    content_hash TEXT,
    source_file  TEXT
);

-- =====================================================================
-- amendments
-- Modifiche apportate a un articolo da altre norme.
-- =====================================================================
CREATE TABLE IF NOT EXISTS amendments (
    id               BIGSERIAL PRIMARY KEY,
    act_id           BIGINT REFERENCES legal_acts(id) ON DELETE CASCADE,
    article_id       BIGINT REFERENCES legal_articles(id) ON DELETE SET NULL,
    amending_act_id  BIGINT REFERENCES legal_acts(id) ON DELETE SET NULL,
    effective_date   DATE,
    change_type      TEXT,          -- inserted | substituted | repealed | ...
    old_text         TEXT,
    new_text         TEXT,
    source           TEXT
);

-- =====================================================================
-- legal_chunks
-- Chunk giuridici con embedding vettoriale per la ricerca semantica.
-- =====================================================================
CREATE TABLE IF NOT EXISTS legal_chunks (
    id          BIGSERIAL PRIMARY KEY,
    article_id  BIGINT REFERENCES legal_articles(id) ON DELETE CASCADE,
    act_id      BIGINT REFERENCES legal_acts(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    embedding   vector,
    metadata    JSONB,
    content_hash TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- sources
-- Catalogo delle fonti con livello di autorevolezza.
-- =====================================================================
CREATE TABLE IF NOT EXISTS sources (
    id            BIGSERIAL PRIMARY KEY,
    source_name   TEXT UNIQUE NOT NULL,
    source_type   TEXT,
    url           TEXT,
    authority_level INT DEFAULT 0,
    retrieved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    hash          TEXT
);

-- =====================================================================
-- sync_runs
-- Registro di ogni sincronizzazione (per report e debug).
-- =====================================================================
CREATE TABLE IF NOT EXISTS sync_runs (
    id               BIGSERIAL PRIMARY KEY,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at      TIMESTAMPTZ,
    status           TEXT DEFAULT 'running',   -- running | success | failed
    acts_checked     INT DEFAULT 0,
    acts_changed     INT DEFAULT 0,
    acts_added       INT DEFAULT 0,
    acts_removed     INT DEFAULT 0,
    embeddings_updated INT DEFAULT 0,
    error_message    TEXT
);

-- =====================================================================
-- system_state
-- Stato persistente (ultima sync riuscita, ecc.).
-- =====================================================================
CREATE TABLE IF NOT EXISTS system_state (
    key        TEXT PRIMARY KEY,
    value      TEXT
);

-- Indici di supporto
CREATE INDEX IF NOT EXISTS idx_articles_act   ON legal_articles(act_id);
CREATE INDEX IF NOT EXISTS idx_articles_num   ON legal_articles(article_number);
CREATE INDEX IF NOT EXISTS idx_chunks_act     ON legal_chunks(act_id);
CREATE INDEX IF NOT EXISTS idx_versions_act   ON legal_versions(act_id);

INSERT INTO sources (source_name, source_type, url, authority_level)
VALUES ('Normattiva', 'istituzionale', 'https://dati.normattiva.it/', 90)
ON CONFLICT (source_name) DO NOTHING;

INSERT INTO sources (source_name, source_type, url, authority_level)
VALUES ('Governo Italiano', 'istituzionale',
        'https://presidenza.governo.it/Governo/Costituzione/CostituzioneRepubblicaItaliana.pdf', 100)
ON CONFLICT (source_name) DO NOTHING;

INSERT INTO sources (source_name, source_type, url, authority_level)
VALUES ('Wikisource', 'comunitaria', 'https://it.wikisource.org/', 10)
ON CONFLICT (source_name) DO NOTHING;