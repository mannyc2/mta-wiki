// export-jsonl (Track A, A3): the canonical JSONL is no longer a read path — it survives as a
// frozen pre-cutover snapshot (backups/) and as on-demand, timestamped export dumps. `--verify`
// is the validation campaign's per-wave parity gate: it asserts the live DB and the shadow JSONL
// (still written by materializeWiki during the campaign) carry byte-identical records.
//
// This module is the one sanctioned place that reads the canonical JSONL (besides materialize.ts);
// the cutover tripwire allows it explicitly.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { readCanonicalRecords, readCanonicalRecordsFromJsonl } from "@mta-wiki/pipeline/materialize/materialize";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";

function recordJson(record: MtaCanonicalRecord): string {
  return stableJson(record as unknown as JsonValue);
}

export type JsonlParityResult = { ok: boolean; recordCount: number; issues: string[] };

/** Assert the live DB and the shadow canonical JSONL hold byte-identical records (by record_id).
 *  Cheap insurance while the campaign certifies the cutover. Issues are capped for readability.
 *  Record sets may be injected (tests); by default reads the live DB and shadow JSONL. */
export function verifyCanonicalJsonlParity(sources?: { db?: MtaCanonicalRecord[]; jsonl?: MtaCanonicalRecord[] }): JsonlParityResult {
  const dbById = new Map((sources?.db ?? readCanonicalRecords()).map((r) => [r.record_id, recordJson(r)]));
  const jsonlById = new Map((sources?.jsonl ?? readCanonicalRecordsFromJsonl()).map((r) => [r.record_id, recordJson(r)]));
  const issues: string[] = [];

  for (const id of dbById.keys()) if (!jsonlById.has(id)) issues.push(`only in DB: ${id}`);
  for (const id of jsonlById.keys()) if (!dbById.has(id)) issues.push(`only in shadow JSONL: ${id}`);
  for (const [id, json] of dbById) {
    const other = jsonlById.get(id);
    if (other !== undefined && other !== json) issues.push(`record differs: ${id}`);
  }

  return { ok: issues.length === 0, recordCount: dbById.size, issues: issues.slice(0, 50) };
}

export type JsonlExportResult = { dir: string; recordCount: number; files: number };

/** Write a timestamped JSONL dump of the live DB under data/exports/canonical-jsonl/<ts>/, one file
 *  per record kind (records in record_id order). A diffable safety artifact, never read by code. */
export function exportCanonicalJsonl(timestamp: string): JsonlExportResult {
  const dir = join(repoRoot, "data", "exports", "canonical-jsonl", timestamp);
  mkdirSync(dir, { recursive: true });

  const byKind = new Map<string, MtaCanonicalRecord[]>();
  for (const record of readCanonicalRecords()) {
    const bucket = byKind.get(record.record_kind);
    if (bucket) bucket.push(record);
    else byKind.set(record.record_kind, [record]);
  }

  let recordCount = 0;
  for (const [kind, records] of [...byKind.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...records].sort((a, b) => a.record_id.localeCompare(b.record_id));
    writeFileSync(join(dir, `${kind}.jsonl`), sorted.map(recordJson).join("\n") + (sorted.length > 0 ? "\n" : ""), "utf8");
    recordCount += sorted.length;
  }

  return { dir, recordCount, files: byKind.size };
}
