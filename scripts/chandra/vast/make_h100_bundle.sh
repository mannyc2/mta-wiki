#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../../.."

RUN_ID="${1:-$(date -u +%Y%m%dT%H%M%SZ)}"
OUT_DIR="data/chandra-ocr/vast-h100/$RUN_ID"
STAGE="$OUT_DIR/stage/mta-wiki"
BUNDLE="$OUT_DIR/mta-chandra-h100-bundle.tar.zst"
COHORT_FILE="scripts/chandra/vast/cohort_ids.txt"

rm -rf "$OUT_DIR"
mkdir -p "$STAGE/raw/sources" "$STAGE/scripts/chandra" "$STAGE/data/chandra-ocr/vast-h100"

cp scripts/chandra/ocr_worker.py "$STAGE/scripts/chandra/ocr_worker.py"
cp scripts/chandra/vast/run_remote_h100.sh "$STAGE/data/chandra-ocr/vast-h100/run_remote_h100.sh"
cp "$COHORT_FILE" "$STAGE/data/chandra-ocr/vast-h100/cohort_ids.txt"

while IFS= read -r source_id; do
  [[ -z "$source_id" ]] && continue
  mkdir -p "$STAGE/raw/sources/$source_id"
  cp "raw/sources/$source_id/source.pdf" "$STAGE/raw/sources/$source_id/source.pdf"
  if [[ -d "raw/sources/$source_id/chandra" ]]; then
    rsync -a "raw/sources/$source_id/chandra" "$STAGE/raw/sources/$source_id/"
  fi
done < "$COHORT_FILE"

python3 - "$STAGE" "$COHORT_FILE" <<'PY'
import json
import sys
from pathlib import Path

stage = Path(sys.argv[1])
ids = [line.strip() for line in Path(sys.argv[2]).read_text().splitlines() if line.strip()]

entries = []
for source_id in ids:
    local_manifest_path = Path("raw/sources") / source_id / "chandra" / "manifest.json"
    if not local_manifest_path.exists():
        continue
    manifest = json.loads(local_manifest_path.read_text())
    missing = manifest.get("missing_pages") or []
    completed = manifest.get("completed_pages") or []
    failed = manifest.get("failed_pages") or []
    if not missing:
        status = "complete"
    elif completed:
        status = "partial"
    else:
        status = "queued"
    entries.append({
        "source_id": source_id,
        "source_dir": f"/workspace/mta-wiki/raw/sources/{source_id}",
        "pdf_path": f"/workspace/mta-wiki/raw/sources/{source_id}/source.pdf",
        "chandra_dir": f"/workspace/mta-wiki/raw/sources/{source_id}/chandra",
        "status": status,
        "page_count": manifest.get("page_count"),
        "completed_pages": completed,
        "failed_pages": failed,
        "missing_pages": missing,
    })

remote_manifest = {
    "run_id": "vast-h100-remote",
    "generated_at": __import__("datetime").datetime.now(__import__("datetime").UTC).isoformat(),
    "dry_run": False,
    "force": False,
    "summary": {
        "discovered_pdf_sources": len(ids),
        "considered": len(entries),
        "queued": sum(1 for entry in entries if entry["status"] == "queued"),
        "partial": sum(1 for entry in entries if entry["status"] == "partial"),
        "complete": sum(1 for entry in entries if entry["status"] == "complete"),
        "skipped": 0,
    },
    "entries": entries,
    "manifest_path": "/workspace/mta-wiki/data/chandra-ocr/vast-h100/remote_manifest.json",
}

out = stage / "data/chandra-ocr/vast-h100/remote_manifest.json"
out.write_text(json.dumps(remote_manifest, indent=2) + "\n")
print(json.dumps(remote_manifest["summary"], indent=2))
PY

if command -v zstd >/dev/null 2>&1; then
  tar --zstd -cf "$BUNDLE" -C "$OUT_DIR/stage" mta-wiki
else
  BUNDLE="$OUT_DIR/mta-chandra-h100-bundle.tar.gz"
  tar -czf "$BUNDLE" -C "$OUT_DIR/stage" mta-wiki
fi

du -h "$BUNDLE"
echo "$BUNDLE"
