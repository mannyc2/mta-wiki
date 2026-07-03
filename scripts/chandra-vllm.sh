#!/usr/bin/env bash
# Control the local Chandra OCR vLLM server used for PDF OCR.
#
# This script intentionally avoids machine-local paths or secrets. Configure
# local differences through environment variables instead of editing the file.
set -euo pipefail

NAME="${CHANDRA_VLLM_CONTAINER:-chandra-vllm}"
IMAGE="${CHANDRA_VLLM_IMAGE:-vllm/vllm-openai:v0.17.0}"
PORT="${CHANDRA_VLLM_PORT:-8000}"
GPUS="${CHANDRA_VLLM_GPUS:-device=0}"
QUANT="${CHANDRA_QUANT:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCHMARK_LOCAL_ENV="${CHANDRA_LOCAL_ENV:-/mnt/models/dev/ocr-benchmark/tools/local.env}"
[ -f "$BENCHMARK_LOCAL_ENV" ] && source "$BENCHMARK_LOCAL_ENV"
[ -f "$SCRIPT_DIR/local.env" ] && source "$SCRIPT_DIR/local.env"

HFCACHE="${HFCACHE:-${CHANDRA_HF_CACHE:-${HF_HOME:-$HOME/.cache/huggingface}}}"

MODEL_ID="datalab-to/chandra-ocr-2"
SERVED_MODEL_NAME="chandra"

usage() {
  cat <<EOF
usage: $0 {start|stop|restart|logs|wait|status}

Environment overrides:
  CHANDRA_VLLM_CONTAINER   Docker container name (default: chandra-vllm)
  CHANDRA_VLLM_IMAGE       Docker image (default: vllm/vllm-openai:v0.17.0)
  CHANDRA_VLLM_PORT        Host port for OpenAI-compatible API (default: 8000)
  CHANDRA_VLLM_GPUS        Docker --gpus value (default: device=0)
  CHANDRA_HF_CACHE         Hugging Face cache directory mounted into container
  HFCACHE                  Compatibility alias for CHANDRA_HF_CACHE
  CHANDRA_QUANT            Optional quantization mode, for example fp8
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
    --no-enforce-eager
    --max-num-seqs 48
    --dtype bfloat16
    --max-model-len 18000
    --max_num_batched_tokens 2048
    --gpu-memory-utilization .90
    --enable-prefix-caching
    --mm-processor-kwargs '{"min_pixels":3136,"max_pixels":6291456}'
    --served-model-name "$SERVED_MODEL_NAME"
  )

  if [[ -n "$QUANT" ]]; then
    args+=(--quantization "$QUANT")
  fi

  "${args[@]}"
  echo "starting $NAME at $(server_url)"
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
