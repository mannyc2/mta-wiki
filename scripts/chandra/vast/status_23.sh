#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../../.."

bun -e '
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ids = readFileSync("scripts/chandra/vast/cohort_ids.txt", "utf8").trim().split(/\n+/);
const raw = join(process.cwd(), "raw/sources");
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

let pages = 0;
let completed = 0;
let missing = 0;
let completeSources = 0;
let partialSources = 0;
let fallback = 0;
let errors = 0;
const partials = [];

for (const id of ids) {
  const manifest = readJson(join(raw, id, "chandra/manifest.json"));
  const pageCount = manifest?.page_count ?? 0;
  const done = (manifest?.completed_pages ?? []).length;
  const miss = (manifest?.missing_pages ?? []).length;
  pages += pageCount;
  completed += done;
  missing += miss;
  if (miss === 0) completeSources += 1;
  else {
    partialSources += 1;
    partials.push({
      id,
      completed: done,
      pageCount,
      missing: miss,
      missingHead: (manifest?.missing_pages ?? []).slice(0, 12),
    });
  }

  const pagesDir = join(raw, id, "chandra/pages");
  if (!existsSync(pagesDir)) continue;
  for (const name of readdirSync(pagesDir)) {
    if (!/^p\d+\.json$/.test(name)) continue;
    const page = readJson(join(pagesDir, name));
    if (page?.fallback_mode) fallback += 1;
    if (page?.status === "error" || page?.error === true) errors += 1;
  }
}

console.log(JSON.stringify({
  sources: ids.length,
  completeSources,
  partialSources,
  pages,
  completed,
  missing,
  fallbackPages: fallback,
  errorPages: errors,
  partials: partials.sort((a, b) => b.missing - a.missing),
}, null, 2));
'

