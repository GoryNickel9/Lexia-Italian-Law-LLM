#!/bin/bash
# ingest_abrogati_loop.sh — lancia ingest_bulk in tranche con --resume finché
# tutti gli atti abrogati non sono ingeriti. Ogni tranche è limitata da
# --max-attos e --batch piccolo per evitare OOM (RAM 7.7G con zero swap).
# Log: /opt/hermes-legal/logs/abrogati_ingest_loop.log
set -u
SRC="/opt/hermes-legal/cache/Atti normativi abrogati (in originale)_O_x"
LOG="/opt/hermes-legal/logs/abrogati_ingest_loop.log"
export LEGAL_DB_HOST=127.0.0.1 LEGAL_DB_PORT=5432 LEGAL_DB_NAME=hermes_legal
export LEGAL_DB_USER=hermes_legal_app LEGAL_DB_PASSWORD=REDACTED
export LEGAL_EMBED_MODEL=/opt/hermes-legal/models/multilingual-minilm
cd /opt/hermes-legal/scripts || exit 9

MAX_ATTOS="${1:-20000}"   # atti per tranche
BATCH="${2:-64}"          # embedding batch (piccolo = meno RAM)
TOTAL=0
echo "=== loop abrogati start $(date -Is) ===" >> "$LOG"

for i in $(seq 1 40); do
  echo "--- tranche $i ($(date +%H:%M:%S)) ---" >> "$LOG"
  timeout 5400 /usr/local/lib/hermes-agent/venv/bin/python3 \
    ingest_bulk.py "$SRC" --status abrogato --batch "$BATCH" \
    --max-attos "$MAX_ATTOS" --resume >> "$LOG" 2>&1
  ec=$?
  echo "--- tranche $i exit=$ec ---" >> "$LOG"
  # exit 0 = tranche completata (raggiunto max-attos o fine file)
  if [ $ec -ne 0 ]; then
    echo "ERRORE tranche $i (exit $ec) — riprovo tra 30s" >> "$LOG"
    sleep 30
    continue
  fi
  # verifica se ci sono ancora file non ingeriti
  RESTANTI=$(PGPASSWORD="$LEGAL_DB_PASSWORD" psql -h 127.0.0.1 -U hermes_legal_app \
    -d hermes_legal -tAc "SELECT count(*) FROM legal_acts WHERE source_file LIKE '%Atti normativi abrogati%'")
  # fonte alternativa: contiamo gli abrogati nel DB (ingest_bulk usa hash-skip sul DB)
  ABROGATI=$(PGPASSWORD="$LEGAL_DB_PASSWORD" psql -h 127.0.0.1 -U hermes_legal_app \
    -d hermes_legal -tAc "SELECT count(*) FROM legal_acts WHERE status='abrogato'")
  echo "tranche $i completata: abrogati totali nel DB = $ABROGATI" >> "$LOG"
  # stop quando una tranche non ha raggiunto il tetto (fine file) o si ripete
  if [ "$ABROGATI" = "$PREV" ]; then
    echo "NESSUN PROGRESSO (abrogati fermi a $ABROGATI) — loop termina" >> "$LOG"
    break
  fi
  PREV="$ABROGATI"
done
echo "=== loop abrogati END $(date -Is) ===" >> "$LOG"
