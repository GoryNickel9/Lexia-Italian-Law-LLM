#!/bin/bash
# Hermes Legal — sync settimanale (chiamato da cron).
# Imposta le credenziali DB ed esegue sync.py sulla collezione Codici.
export LEGAL_DB_HOST="${LEGAL_DB_HOST:-127.0.0.1}"
export LEGAL_DB_PORT="${LEGAL_DB_PORT:-5432}"
export LEGAL_DB_NAME="${LEGAL_DB_NAME:-hermes_legal}"
export LEGAL_DB_USER="${LEGAL_DB_USER:-hermes_legal_app}"
export LEGAL_DB_PASSWORD="${LEGAL_DB_PASSWORD:-REDACTED}"
export LEGAL_EMBED_MODEL="${LEGAL_EMBED_MODEL:-/opt/hermes-legal/models/multilingual-minilm}"
# Cache su disco (non tmpfs): collezioni grandi (DPR ~183MB, Regi decreti ~355MB
# zip, estratti multi-GB) non stanno in /tmp (3.9G tmpfs).
export LEGAL_CACHE="${LEGAL_CACHE:-/opt/hermes-legal/cache}"

LOG="/opt/hermes-legal/logs/sync.log"
mkdir -p "$(dirname "$LOG")"
echo "==== $(date) ====" >> "$LOG"
cd /opt/hermes-legal && python3 scripts/sync.py >> "$LOG" 2>&1
rc=$?
echo "exit=$rc" >> "$LOG"
exit $rc