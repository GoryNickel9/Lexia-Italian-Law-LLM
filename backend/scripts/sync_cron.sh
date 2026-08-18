#!/bin/bash
# Hermes Legal — sync settimanale (chiamato da cron).
# Imposta le credenziali DB ed esegue sync.py sulla collezione Codici.
export LEGAL_DB_HOST="${LEGAL_DB_HOST:-127.0.0.1}"
export LEGAL_DB_PORT="${LEGAL_DB_PORT:-5432}"
export LEGAL_DB_NAME="${LEGAL_DB_NAME:-hermes_legal}"
export LEGAL_DB_USER="${LEGAL_DB_USER:-hermes_legal_app}"
export LEGAL_DB_PASSWORD="${LEGAL_DB_PASSWORD:?impostare LEGAL_DB_PASSWORD (vedi backend/README.md)}"
export LEGAL_EMBED_MODEL="${LEGAL_EMBED_MODEL:-/opt/hermes-legal/models/multilingual-minilm}"
export LEGAL_CACHE="${LEGAL_CACHE:-/tmp/hermes-legal-sync}"

LOG="/opt/hermes-legal/logs/sync.log"
mkdir -p "$(dirname "$LOG")"
echo "==== $(date) ====" >> "$LOG"
cd /opt/hermes-legal && python3 scripts/sync.py >> "$LOG" 2>&1
rc=$?
echo "exit=$rc" >> "$LOG"
exit $rc