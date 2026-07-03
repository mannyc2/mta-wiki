// W0 readiness sweep (docs/step-3-implementation-plan.md §3 S3.6a; campaign plan §2 item 4).
//
// Re-derives the authoritative wave-source list from health checks — NOT file presence: each staged
// source is run through `assertSourceReadyForIngest` (healthy chandra blocks, no capped/repeat-token
// pages, real PDF, evidence present). Failures are QUARANTINED with the thrown reason, never
// silently skipped. "Already ingested" is determined at source_id granularity from accepted
// submissions (65 journal files ≠ 61 sources). The output (readiness.jsonl + summary.json), pinned
// at the S3.6c baseline freeze, is the wave driver's source of truth; sources completing OCR after
// the freeze roll into the next tranche.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { assertSourceReadyForIngest, sourceDirForId } from "@mta-wiki/pipeline/sources/source-prep";
import { readSubmissionEntries } from "@mta-wiki/pipeline/records/submissions";

export type ReadinessRow = {
  source_id: string;
  ready: boolean;
  ingested: boolean;
  has_pdf?: boolean;
  block_count?: number;
  reason?: string;
};

export type ReadinessSummary = {
  total: number;
  ready: number;
  not_ready: number;
  ingested: number;
  ready_never_ingested: number;
  quarantined: number;
};

/** All staged source ids (raw/sources/<id> directories). */
export function listStagedSourceIds(): string[] {
  const root = join(repoRoot, "raw", "sources");
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((entry) => statSync(join(root, entry)).isDirectory())
    .sort();
}

/** source_ids that already have an accepted submission — the source_id-level "already ingested" set. */
export function ingestedSourceIds(): Set<string> {
  const ids = new Set<string>();
  for (const entry of readSubmissionEntries()) {
    if (entry.validation.state === "accepted") {
      const sourceId = entry.tool_args?.source_id;
      if (typeof sourceId === "string" && sourceId.length > 0) ids.add(sourceId);
    }
  }
  return ids;
}

/** Classify one source. `check` is injectable for tests; defaults to the real health check. */
export function checkSourceReadiness(
  sourceId: string,
  ingested: Set<string>,
  check: (id: string) => { hasPdf: boolean; blockCount: number } = assertSourceReadyForIngest,
): ReadinessRow {
  const isIngested = ingested.has(sourceId);
  try {
    const status = check(sourceId);
    return { source_id: sourceId, ready: true, ingested: isIngested, has_pdf: status.hasPdf, block_count: status.blockCount };
  } catch (error) {
    return { source_id: sourceId, ready: false, ingested: isIngested, reason: (error as Error).message };
  }
}

export function summarize(rows: ReadinessRow[]): ReadinessSummary {
  const ready = rows.filter((r) => r.ready);
  return {
    total: rows.length,
    ready: ready.length,
    not_ready: rows.length - ready.length,
    ingested: rows.filter((r) => r.ingested).length,
    ready_never_ingested: ready.filter((r) => !r.ingested).length,
    quarantined: rows.filter((r) => !r.ready).length,
  };
}

export function campaignDir(campaignId: string): string {
  return join(repoRoot, "data", "campaigns", campaignId);
}

/** Run the full sweep over every staged source, write readiness.jsonl + summary.json, return both. */
export function runReadinessSweep(campaignId: string): { rows: ReadinessRow[]; summary: ReadinessSummary; dir: string } {
  const ingested = ingestedSourceIds();
  const rows = listStagedSourceIds().map((id) => checkSourceReadiness(id, ingested)).sort((a, b) => a.source_id.localeCompare(b.source_id));
  const summary = summarize(rows);

  const dir = campaignDir(campaignId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "readiness.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
  writeFileSync(join(dir, "readiness-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return { rows, summary, dir };
}

/** Read a pinned readiness.jsonl back (the wave driver's source of truth). */
export function readReadinessRows(campaignId: string): ReadinessRow[] {
  const path = join(campaignDir(campaignId), "readiness.jsonl");
  if (!existsSync(path)) throw new Error(`No readiness sweep for campaign ${campaignId}; run \`campaign readiness ${campaignId}\` first (${path}).`);
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ReadinessRow);
}

/** The wave-source list: ready AND not yet ingested, in deterministic order. */
export function waveSourceList(rows: ReadinessRow[]): string[] {
  return rows.filter((r) => r.ready && !r.ingested).map((r) => r.source_id);
}
