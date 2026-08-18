#!/bin/bash
# Hermes Legal — watchdog daily (chiamato da Hermes cron, no_agent).
# Stampa solo se c'e' un problema; vuoto = silente = nessuna notifica.
export LEGAL_DB_HOST="${LEGAL_DB_HOST:-127.0.0.1}"
export LEGAL_DB_PORT="${LEGAL_DB_PORT:-5432}"
export LEGAL_DB_NAME="${LEGAL_DB_NAME:-hermes_legal}"
export LEGAL_DB_USER="${LEGAL_DB_USER:-hermes_legal_app}"
export LEGAL_DB_PASSWORD="${LEGAL_DB_PASSWORD:?impostare LEGAL_DB_PASSWORD (vedi backend/README.md)}"
python3 /opt/hermes-legal/scripts/watchdog.py --max-age-hours 30