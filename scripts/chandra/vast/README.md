# Vast H100 Chandra Completion Runbook

This is for finishing the 23-source Chandra OCR tail on a rented Vast.ai H100.

Do not create/rent an instance until the user approves the exact offer id and hourly cost.

## Current Constraints

- Local Vast CLI is installed at `/home/cjpher/.local/bin/vastai`.
- Local Vast API key exists at `/home/cjpher/.config/vastai/vast_api_key`.
- Current account credit observed on 2026-06-23 was about `$1.14`; top up before renting an H100.
- The local 4090 Chandra run may still be active. Build a fresh bundle immediately before copying to Vast so completed pages are not re-run.

## Search H100 Offers

```bash
vastai search offers \
  'gpu_name in [H100,H100_SXM,H100_PCIE] num_gpus=1 rentable=true verified=true reliability>0.97 cuda_vers>=12.1 inet_down>200 inet_up>100 disk_space>80' \
  --limit 20 \
  --storage 120 \
  -o 'dph,total_flops-'
```

Good observed offers on 2026-06-23 were roughly `$1.95/hr` to `$2.50/hr` for single H100 SXM.

Prefer:

- H100 SXM over H100 PCIe.
- High `inet_up` and `inet_down`.
- High reliability.
- At least 120 GB disk.

## Create The Transfer Bundle

```bash
bash scripts/chandra/vast/make_h100_bundle.sh
```

The script prints the bundle path and copies only:

- `scripts/chandra/ocr_worker.py`
- each cohort `source.pdf`
- each cohort existing `raw/sources/<id>/chandra/` cache
- a remote manifest under `data/chandra-ocr/vast-h100/remote_manifest.json`
- `run_remote_h100.sh`

## Rent The Instance

After user approval, create an SSH instance. Replace `<offer_id>` with the selected offer.

```bash
vastai create instance <offer_id> \
  --image pytorch/pytorch:2.7.1-cuda12.8-cudnn9-devel \
  --disk 160 \
  --ssh \
  --direct \
  --label mta-chandra-h100 \
  --onstart-cmd 'bash -lc "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y rsync openssh-client curl jq tmux zstd poppler-utils && echo mta-chandra-h100-ready"'
```

Wait for the instance to become ready:

```bash
vastai show instances
```

## Copy Bundle And Run

Use `vastai ssh-url <instance_id>` / `vastai scp-url <instance_id>` to get connection strings.

Example:

```bash
INSTANCE_ID=<instance_id>
BUNDLE=data/chandra-ocr/vast-h100/<run_id>/mta-chandra-h100-bundle.tar.zst
SCP_URL="$(vastai scp-url "$INSTANCE_ID")"
SSH_URL="$(vastai ssh-url "$INSTANCE_ID")"

scp "$BUNDLE" "${SCP_URL}:/workspace/"
ssh "$SSH_URL" 'cd /workspace && tar --zstd -xf mta-chandra-h100-bundle.tar.zst'
ssh "$SSH_URL" 'cd /workspace/mta-wiki && bash data/chandra-ocr/vast-h100/run_remote_h100.sh'
```

The remote run writes:

- `/workspace/chandra_vllm.log`
- `/workspace/mta-chandra-h100-results.tar.zst`
- `/workspace/mta-wiki/data/chandra-ocr/vast-h100/h100-worker.log`

## Copy Results Back

```bash
INSTANCE_ID=<instance_id>
SCP_URL="$(vastai scp-url "$INSTANCE_ID")"
mkdir -p data/chandra-ocr/vast-h100/results
scp "${SCP_URL}:/workspace/mta-chandra-h100-results.tar.zst" data/chandra-ocr/vast-h100/results/
mkdir -p /tmp/mta-chandra-h100-results
tar --zstd -xf data/chandra-ocr/vast-h100/results/mta-chandra-h100-results.tar.zst -C /tmp/mta-chandra-h100-results
rsync -a /tmp/mta-chandra-h100-results/mta-wiki/raw/sources/ raw/sources/
bash scripts/chandra/vast/rebuild_after_h100.sh
```

Then verify:

```bash
bash scripts/chandra/vast/status_23.sh
bun packages/cli/src/cli.ts chandra-queue --include "$(scripts/chandra/vast/include_regex.sh)" --dry-run
```

## Cleanup

Destroy the rented instance when results are copied back:

```bash
vastai destroy instance <instance_id>
```
