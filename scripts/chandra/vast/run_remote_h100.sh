#!/usr/bin/env bash
set -euo pipefail

cd /workspace/mta-wiki

export DEBIAN_FRONTEND=noninteractive
if ! python3 -c 'import bs4, chandra, PIL, requests, vllm' >/dev/null 2>&1; then
  apt-get update
  apt-get install -y curl jq poppler-utils zstd python3-pip python3-venv

  python3 -m pip install --upgrade pip
  python3 -m pip install --upgrade chandra-ocr vllm pillow requests beautifulsoup4
fi

if ! curl -fsS http://localhost:8000/v1/models >/dev/null 2>&1; then
  nohup vllm serve \
    --model datalab-to/chandra-ocr-2 \
    --served-model-name chandra \
    --dtype bfloat16 \
    --max-model-len 18000 \
    --max-num-seqs 96 \
    --max_num_batched_tokens 8192 \
    --gpu-memory-utilization 0.88 \
    --enforce-eager \
    --gdn-prefill-backend triton \
    --mm-processor-kwargs '{"min_pixels":3136,"max_pixels":6291456}' \
    > /workspace/chandra_vllm.log 2>&1 &
fi

for attempt in $(seq 1 240); do
  if curl -fsS http://localhost:8000/v1/models >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "240" ]]; then
    echo "vLLM did not become ready; tailing server log" >&2
    tail -200 /workspace/chandra_vllm.log >&2 || true
    exit 1
  fi
  sleep 5
done

export VLLM_API_BASE="${VLLM_API_BASE:-http://localhost:8000/v1}"
export VLLM_MODEL_NAME="${VLLM_MODEL_NAME:-chandra}"
export CHANDRA_REQUEST_TIMEOUT="${CHANDRA_REQUEST_TIMEOUT:-600}"
export CHANDRA_RETRIES="${CHANDRA_RETRIES:-0}"
export CHANDRA_FALLBACK_RETRIES="${CHANDRA_FALLBACK_RETRIES:-1}"
export CHANDRA_FALLBACK_MAX_OUTPUT_TOKENS="${CHANDRA_FALLBACK_MAX_OUTPUT_TOKENS:-8192}"
export CHANDRA_PLAIN_TEXT_ONLY="${CHANDRA_PLAIN_TEXT_ONLY:-1}"
export CHANDRA_GLOBAL_QUEUE="${CHANDRA_GLOBAL_QUEUE:-1}"
export CHANDRA_TEMPERATURE="${CHANDRA_TEMPERATURE:-0.2}"
export CHANDRA_TOP_P="${CHANDRA_TOP_P:-0.95}"
export CHANDRA_MAX_WORKERS="${CHANDRA_MAX_WORKERS:-96}"

python3 scripts/chandra/ocr_worker.py \
  --manifest data/chandra-ocr/vast-h100/remote_manifest.json \
  --max-workers "$CHANDRA_MAX_WORKERS" \
  2>&1 | tee data/chandra-ocr/vast-h100/h100-worker.log

tar --zstd -cf /workspace/mta-chandra-h100-results.tar.zst raw/sources data/chandra-ocr/vast-h100
echo "Wrote /workspace/mta-chandra-h100-results.tar.zst"
