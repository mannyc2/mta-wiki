#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
awk 'NF { print }' "$SCRIPT_DIR/cohort_ids.txt" | paste -sd '|' - | sed 's/^/^(/; s/$/)$/'
