#!/usr/bin/env bash
# Control the local embeddings vLLM server used for semantic search over canonical records.
#
# Mirrors scripts/chandra-vllm.sh: an OpenAI-compatible API on a local port, configured entirely
# through environment variables so no machine-local paths or secrets live in the file. Serves an
# embedding model under the served name "embeddings" at POST /v1/embeddings.
set -euo pipefail

NAME="${EMBEDDINGS_VLLM_CONTAINER:-embeddings-vllm}"
IMAGE="${EMBEDDINGS_VLLM_IMAGE:-vllm/vllm-openai:v0.17.0}"
PORT="${EMBEDDINGS_VLLM_PORT:-8001}"
GPUS="${EMBEDDINGS_VLLM_GPUS:-device=0}"
QUANT="${EMBEDDINGS_QUANT:-}"
MODEL_ID="${EMBEDDINGS_MODEL_ID:-BAAI/bge-large-en-v1.5}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$SCRIPT_DIR/local.env" ] && source "$SCRIPT_DIR/local.env"

HFCACHE="${HFCACHE:-${EMBEDDINGS_HF_CACHE:-${CHANDRA_HF_CACHE:-${HF_HOME:-$HOME/.cache/huggingface}}}}"

SERVED_MODEL_NAME="embeddings"

usage() {
  cat <<EOF
usage: $0 {start|stop|restart|logs|wait|status}

Environment overrides:
  EMBEDDINGS_VLLM_CONTAINER   Docker container name (default: embeddings-vllm)
  EMBEDDINGS_VLLM_IMAGE       Docker image (default: vllm/vllm-openai:v0.17.0)
  EMBEDDINGS_VLLM_PORT        Host port for OpenAI-compatible API (default: 8001)
  EMBEDDINGS_VLLM_GPUS        Docker --gpus value (default: device=0)
  EMBEDDINGS_MODEL_ID         Embedding model id (default: BAAI/bge-large-en-v1.5)
  EMBEDDINGS_HF_CACHE         Hugging Face cache directory mounted into container
  HFCACHE                     Compatibility alias for EMBEDDINGS_HF_CACHE
  EMBEDDINGS_QUANT            Optional quantization mode, for example fp8

The harness reads the endpoint from EMBEDDINGS_BASE_URL (default http://localhost:8001/v1)
and EMBEDDINGS_MODEL (default "embeddings").
EOF
}

server_url() {
  printf "http://localhost:%s/v1" "$PORT"
}

start_server() {
  mkdir -p "$HFCACHE"
  docker rm -f "$NAME" >/dev/null 2>&1 || true

  local args=(
    docker run -d
    --name "$NAME"
    --runtime nvidia
    --gpus "$GPUS"
    -v "$HFCACHE:/root/.cache/huggingface"
    -p "$PORT:8000"
    --ipc=host
    "$IMAGE"
    --model "$MODEL_ID"
    --task embed
    --dtype bfloat16
    --gpu-memory-utilization .60
    --served-model-name "$SERVED_MODEL_NAME"
  )

  if [[ -n "$QUANT" ]]; then
    args+=(--quantization "$QUANT")
  fi

  "${args[@]}"
  echo "starting $NAME ($MODEL_ID) at $(server_url)"
  echo "tail logs with: $0 logs"
}

stop_server() {
  docker rm -f "$NAME" >/dev/null 2>&1 && echo "stopped $NAME" || echo "$NAME is not running"
}

wait_for_server() {
  until curl -sf "$(server_url)/models" >/dev/null 2>&1; do
    if ! docker ps -q -f "name=^/${NAME}$" | grep -q .; then
      echo "container exited:"
      docker logs "$NAME" 2>&1 | tail -20
      exit 1
    fi
    sleep 5
  done
  echo "server ready at $(server_url)"
}

case "${1:-start}" in
  start)
    start_server
    ;;
  stop)
    stop_server
    ;;
  restart)
    stop_server
    start_server
    ;;
  logs)
    docker logs -f "$NAME"
    ;;
  wait)
    wait_for_server
    ;;
  status)
    if curl -sf "$(server_url)/models" >/dev/null 2>&1; then
      echo "up at $(server_url)"
    else
      echo "down"
    fi
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 1
    ;;
esac
