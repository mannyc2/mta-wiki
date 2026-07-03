#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../../.."

INSTANCE_ID="${INSTANCE_ID:-42247057}"
VAST_HOST="${VAST_HOST:-68.209.74.76}"
VAST_PORT="${VAST_PORT:-38459}"
REMOTE_RESULT="${REMOTE_RESULT:-/workspace/mta-chandra-h100-results.tar.zst}"
POLL_SECONDS="${POLL_SECONDS:-120}"
VASTAI_BIN="${VASTAI_BIN:-$HOME/.local/bin/vastai}"
KNOWN_HOSTS="${KNOWN_HOSTS:-/tmp/mta-vast-known-hosts}"

RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
RESULT_DIR="data/chandra-ocr/vast-h100/results/$RUN_ID"
LOG_PATH="$RESULT_DIR/watch.log"
mkdir -p "$RESULT_DIR"

SSH_OPTS=(-o StrictHostKeyChecking=no -o "UserKnownHostsFile=$KNOWN_HOSTS" -p "$VAST_PORT")

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_PATH"
}

remote() {
  ssh "${SSH_OPTS[@]}" "root@$VAST_HOST" "$@"
}

remote_status() {
  remote "if test -f '$REMOTE_RESULT'; then stat -c 'result:%s' '$REMOTE_RESULT'; elif pgrep -f '^python3 scripts/chandra/ocr_worker.py|^bash data/chandra-ocr/vast-h100/run_remote_h100.sh|^/opt/conda/bin/python3 /opt/conda/bin/vllm serve|^VLLM::EngineCore' >/dev/null; then echo running; else echo stopped; fi"
}

log "Watching Vast instance $INSTANCE_ID at $VAST_HOST:$VAST_PORT"

stable_size=""
while true; do
  status="$(remote_status || true)"
  log "remote_status=$status"
  case "$status" in
    result:*)
      size="${status#result:}"
      sleep 30
      status2="$(remote_status || true)"
      log "remote_status_after_stability_wait=$status2"
      if [[ "$status2" == "result:$size" && "$size" != "0" ]]; then
        stable_size="$size"
        break
      fi
      ;;
    stopped)
      log "Remote processes stopped before result archive appeared; leaving instance running for inspection."
      exit 2
      ;;
  esac
  sleep "$POLL_SECONDS"
done

log "Result archive is stable at $stable_size bytes; copying locally"
scp -o StrictHostKeyChecking=no -o "UserKnownHostsFile=$KNOWN_HOSTS" -P "$VAST_PORT" "root@$VAST_HOST:$REMOTE_RESULT" "$RESULT_DIR/mta-chandra-h100-results.tar.zst"

EXTRACT_DIR="$RESULT_DIR/extract"
mkdir -p "$EXTRACT_DIR"
tar --zstd -xf "$RESULT_DIR/mta-chandra-h100-results.tar.zst" -C "$EXTRACT_DIR"

if [[ -d "$EXTRACT_DIR/raw/sources" ]]; then
  RAW_ROOT="$EXTRACT_DIR/raw/sources"
elif [[ -d "$EXTRACT_DIR/mta-wiki/raw/sources" ]]; then
  RAW_ROOT="$EXTRACT_DIR/mta-wiki/raw/sources"
else
  log "Could not find raw/sources in result archive; not destroying instance."
  exit 3
fi

log "Syncing remote raw/sources results into local raw/sources"
rsync -a "$RAW_ROOT/" raw/sources/

if [[ -d "$EXTRACT_DIR/data/chandra-ocr/vast-h100" ]]; then
  rsync -a "$EXTRACT_DIR/data/chandra-ocr/vast-h100/" data/chandra-ocr/vast-h100/
elif [[ -d "$EXTRACT_DIR/mta-wiki/data/chandra-ocr/vast-h100" ]]; then
  rsync -a "$EXTRACT_DIR/mta-wiki/data/chandra-ocr/vast-h100/" data/chandra-ocr/vast-h100/
fi

log "Rebuilding source blocks from Chandra output"
bash scripts/chandra/vast/rebuild_after_h100.sh > "$RESULT_DIR/rebuild.log" 2>&1

log "Writing final 23-source status"
bash scripts/chandra/vast/status_23.sh > "$RESULT_DIR/status.json" 2>&1

log "Destroying Vast instance $INSTANCE_ID"
"$VASTAI_BIN" destroy instance "$INSTANCE_ID" >> "$LOG_PATH" 2>&1
log "Complete"
