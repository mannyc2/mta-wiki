#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../../.."

bun -e '
import { readFileSync } from "node:fs";
import { rebuildSourceBlocks } from "./packages/pipeline/src/sources/source-prep.ts";

const ids = readFileSync("scripts/chandra/vast/cohort_ids.txt", "utf8").trim().split(/\n+/);
for (const id of ids) {
  const result = rebuildSourceBlocks(id);
  console.log(`${id}: ${result.blockCount} blocks`);
}
'

