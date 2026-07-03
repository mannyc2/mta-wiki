// A5 FTS5 population + determinism (docs/step-2-implementation-plan.md §S2.3).
//
// Two trigram FTS5 virtual tables, rebuilt and populated at materialize:
//   * records_fts(record_id, names_text) — the name/alias surface, a superset-then-verify prefilter
//     for the identity-candidate scorer (the scorer in identity.ts stays the decider).
//   * blocks_fts(source_id, block_id, raw_text) — full source-document text, from the immutable
//     staged blocks.jsonl (decision 6), insertion-ordered by (source_id, block_id). This large
//     trigram index is opt-in while the current Bun/SQLite build emits a malformed index on the
//     full corpus; source-block readers remain the canonical deterministic source-text path.
//
// FTS internals are not byte-stable across builds, so they are excluded from the canonical
// determinism anchor (canonical-db.ts) and get the logical content checksum below instead
// (decision 5). Population is inside the rebuild transaction.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { repoRoot } from "@mta-wiki/core/paths";
import { FTS_TABLES } from "./schema-ddl.js";
import { compactText, identityKeysForRecord, normalizedText, recordScorableValues } from "./identity.js";
import { sha256, stableJson } from "./stable-json.js";
import type { JsonValue, MtaCanonicalRecord } from "./types.js";

const ENABLE_BLOCKS_FTS = process.env.MTA_ENABLE_BLOCKS_FTS === "1";

/** The full name/alias surface indexed for a record — the exact value set the identity scorer
 *  compares against (recordScorableValues) plus the identity keys. Each value is indexed in both
 *  normalized and compact (spaceless) form, mirroring the scorer's normalizedText/compactText
 *  comparisons, so an FTS trigram prefilter over it cannot miss a ≥3-char candidate the scorer would
 *  score > 0 (the superset-then-verify contract; sub-trigram names are handled in the caller). */
export function recordNamesText(record: MtaCanonicalRecord): string {
  const parts = new Set<string>();
  for (const value of recordScorableValues(record)) {
    if (!value || !value.trim()) continue;
    const normalized = normalizedText(value);
    if (normalized) parts.add(normalized);
    const compact = compactText(value);
    if (compact) parts.add(compact);
  }
  for (const key of identityKeysForRecord(record)) parts.add(key); // identity keys are already slugs
  return [...parts].join(" · ");
}

/** Read a staged source's blocks (block_id, raw_text), sorted by block_id for a deterministic
 *  insertion order. Absent/unreadable file → no blocks (graceful). */
function readSourceBlocks(sourceId: string): Array<{ block_id: string; raw_text: string }> {
  const path = join(repoRoot, "raw", "sources", sourceId, "blocks.jsonl");
  if (!existsSync(path)) return [];
  const blocks: Array<{ block_id: string; raw_text: string }> = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const block = JSON.parse(line) as { block_id?: unknown; raw_text?: unknown };
      if (typeof block.block_id === "string" && typeof block.raw_text === "string") {
        blocks.push({ block_id: block.block_id, raw_text: block.raw_text });
      }
    } catch {
      // skip malformed block lines
    }
  }
  return blocks.sort((a, b) => a.block_id.localeCompare(b.block_id));
}

/** Distinct source ids backing the corpus (the ingested source records), sorted. */
export function corpusSourceIds(records: MtaCanonicalRecord[]): string[] {
  const ids = new Set<string>();
  for (const record of records) {
    if (record.record_kind !== "source") continue;
    ids.add(record.source_id);
    for (const id of record.source_ids ?? []) ids.add(id);
  }
  return [...ids].sort();
}

/** Populate FTS tables inside the rebuild transaction. records_fts is always populated in
 *  record_id order. blocks_fts remains schema-only by default until the full-corpus trigram index
 *  is safe to rebuild on the local SQLite stack. */
export function populateFts(db: Database, records: MtaCanonicalRecord[]): { recordRows: number; blockRows: number } {
  const insertRecord = db.prepare(`INSERT INTO records_fts (record_id, names_text) VALUES (?, ?)`);
  const sortedRecords = [...records].sort((a, b) => a.record_id.localeCompare(b.record_id));
  let recordRows = 0;
  for (const record of sortedRecords) {
    insertRecord.run(record.record_id, recordNamesText(record));
    recordRows += 1;
  }

  let blockRows = 0;
  if (ENABLE_BLOCKS_FTS) {
    const insertBlock = db.prepare(`INSERT INTO blocks_fts (source_id, block_id, raw_text) VALUES (?, ?, ?)`);
    for (const sourceId of corpusSourceIds(records)) {
      for (const block of readSourceBlocks(sourceId)) {
        insertBlock.run(sourceId, block.block_id, block.raw_text);
        blockRows += 1;
      }
    }
  }
  return { recordRows, blockRows };
}

/** Logical content checksum over the FTS tables (decision 5): the indexed columns, row-order
 *  independent, so two rebuilds with the same inputs hash-equal without depending on FTS internals. */
export function ftsContentChecksum(db: Database): string {
  const parts: string[] = [];
  for (const fts of FTS_TABLES) {
    const cols = fts.columns.map((c) => `"${c.name}"`).join(", ");
    const rows = (db.query(`SELECT ${cols} FROM ${fts.name}`).all() as Array<Record<string, JsonValue>>)
      .map((row) => stableJson(row as JsonValue))
      .sort();
    parts.push(`${fts.name}\n${rows.join("\n")}`);
  }
  return sha256(parts.join("\n"));
}
