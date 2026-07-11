import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  canonicalDbPath,
  openCanonicalDb,
  readCanonicalRecordsFromDb,
  readCanonicalRecordsOfKindFromDb,
  rowToRecord,
} from "@mta-wiki/db/canonical-db";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { Database } from "bun:sqlite";

export const FILE_BY_KIND = new Map<string, string>([
  ["source", "sources.jsonl"],
  ["entity", "entities.jsonl"],
  ["project", "projects.jsonl"],
  ["corridor", "corridors.jsonl"],
  ["route", "routes.jsonl"],
  ["treatment_component", "treatment_components.jsonl"],
  ["event", "events.jsonl"],
  ["claim", "claims.jsonl"],
  ["metric_claim", "metric_claims.jsonl"],
  ["table", "tables.jsonl"],
  ["source_gap", "source_gaps.jsonl"],
  ["relation", "relations.jsonl"],
]);

export function canonicalDir(): string {
  return join(repoRoot, "data", "canonical");
}

/** The durable JSONL order: files by name, then records by id within each file. */
export function canonicalRecordOrder(a: MtaCanonicalRecord, b: MtaCanonicalRecord): number {
  const fa = FILE_BY_KIND.get(a.record_kind) ?? a.record_kind;
  const fb = FILE_BY_KIND.get(b.record_kind) ?? b.record_kind;
  return fa.localeCompare(fb) || a.record_id.localeCompare(b.record_id);
}

/** Read the frozen canonical JSONL artifacts directly. */
export function readCanonicalRecordsFromJsonl(): MtaCanonicalRecord[] {
  const dir = canonicalDir();
  if (!existsSync(dir)) return [];

  const records: MtaCanonicalRecord[] = [];
  for (const fileName of readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort()) {
    const content = readFileSync(join(dir, fileName), "utf8");
    for (const line of content.split(/\r?\n/u)) {
      if (line.trim()) records.push(JSON.parse(line) as MtaCanonicalRecord);
    }
  }
  return records;
}

/** Read a specific canonical DB, reproducing durable JSONL order exactly. */
export function readCanonicalRecordsFromDbFile(path: string = canonicalDbPath()): MtaCanonicalRecord[] | undefined {
  if (!existsSync(path)) return undefined;
  let db: Database;
  try {
    db = openCanonicalDb(path, { readonly: true });
  } catch {
    return undefined;
  }
  try {
    return readCanonicalRecordsFromDb(db).sort(canonicalRecordOrder);
  } finally {
    db.close();
  }
}

function withCanonicalDb<T>(read: (db: Database) => T): T {
  const dbPath = canonicalDbPath();
  if (!existsSync(dbPath)) throw new Error(`canonical.db not found at ${dbPath}; re-run materialize`);
  const db = openCanonicalDb(dbPath, { readonly: true });
  try {
    return read(db);
  } finally {
    db.close();
  }
}

export function readCanonicalRecords(): MtaCanonicalRecord[] {
  return withCanonicalDb((db) => readCanonicalRecordsFromDb(db).sort(canonicalRecordOrder));
}

export function readCanonicalRecordsByKind(kind: string): MtaCanonicalRecord[] {
  return withCanonicalDb((db) => readCanonicalRecordsOfKindFromDb(db, kind).sort(canonicalRecordOrder));
}

export function readCanonicalRecordById(recordId: string): MtaCanonicalRecord | undefined {
  return withCanonicalDb((db) => rowToRecord(db, recordId));
}
