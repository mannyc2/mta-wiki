// Promoted-column PROJECTION for the canonical SQLite materialization (Step 3 / S3.5).
//
// The schema source of truth is now the hand-written drizzle tables in schema.ts; this module no
// longer GENERATES the per-kind DDL (that moved to schema.ts + the schema-ddl.ts renderer). What
// remains is the projection: map a record's payload onto its per-kind table's promoted columns,
// reading the column set straight from the drizzle table via getTableColumns.
//
// Invariant kept from before: every promoted column is NULLABLE and a projection of payload (the
// source of truth). Off-type or missing values project to NULL and never fail a STRICT insert — so
// no record can ever be dropped or block a rebuild (no data loss).

import { getTableColumns } from "drizzle-orm";
import { tablesByName } from "./schema.js";
import type { JsonObject, JsonValue, MtaObservationKind } from "./types.js";

export type SqlColumnType = "TEXT" | "REAL" | "INTEGER";

/** Plural table names, mirroring FILE_BY_KIND in materialize.ts. `relation` has a dedicated
 *  table (see canonical-db.ts); `table` is deprecated and never materialized. */
const TABLE_NAME_BY_KIND: Partial<Record<MtaObservationKind, string>> = {
  source: "sources",
  entity: "entities",
  project: "projects",
  corridor: "corridors",
  route: "routes",
  treatment_component: "treatment_components",
  event: "events",
  claim: "claims",
  metric_claim: "metric_claims",
  source_gap: "source_gaps",
};

/** Kinds that get a promoted per-kind table (all non-deprecated kinds except relation). */
export const PROMOTED_KINDS: MtaObservationKind[] = Object.keys(TABLE_NAME_BY_KIND) as MtaObservationKind[];

export function promotedTableName(kind: MtaObservationKind | string): string | undefined {
  return TABLE_NAME_BY_KIND[kind as MtaObservationKind];
}

function coerce(value: JsonValue | undefined, sql: SqlColumnType): string | number | null {
  if (value === undefined || value === null) return null;
  if (sql === "REAL") return typeof value === "number" && Number.isFinite(value) ? value : null;
  if (sql === "INTEGER") {
    if (typeof value === "boolean") return value ? 1 : 0;
    return typeof value === "number" && Number.isInteger(value) ? value : null;
  }
  return typeof value === "string" ? value : null; // TEXT
}

/** Promoted columns (name + SQL type, record_id excluded) read from the hand-written drizzle table
 *  in schema.ts — the schema source of truth. The per-kind table defines record_id first then the
 *  promoted columns in sorted order, so getTableColumns iteration order == the DDL column order,
 *  which keeps the INSERT column list, value array, and rendered table DDL provably aligned. */
export function promotedColumnsFromTable(kind: MtaObservationKind | string): Array<{ name: string; sql: SqlColumnType }> {
  const tableName = promotedTableName(kind);
  if (!tableName) return [];
  const table = tablesByName[tableName];
  if (!table) return [];
  const columns: Array<{ name: string; sql: SqlColumnType }> = [];
  for (const column of Object.values(getTableColumns(table))) {
    if (column.name === "record_id") continue;
    columns.push({ name: column.name, sql: column.getSQLType().toUpperCase() as SqlColumnType });
  }
  return columns;
}

/** Project a payload onto the promoted columns for its kind. Values that don't match the
 *  column's scalar type become NULL (the true value remains in records.payload). */
export function projectPromotedRow(kind: MtaObservationKind | string, payload: JsonObject): Record<string, string | number | null> {
  const row: Record<string, string | number | null> = {};
  for (const column of promotedColumnsFromTable(kind)) {
    row[column.name] = coerce(payload[column.name], column.sql);
  }
  return row;
}

/** Insert-boundary validator: assert each projected value matches its column's SQL type. By
 *  construction projectPromotedRow already guarantees this, so a failure here is a projector bug,
 *  surfaced deterministically at materialize time rather than as a raw SQLite affinity error. */
export function validatePromotedRow(kind: MtaObservationKind | string, row: Record<string, string | number | null>): string[] {
  const issues: string[] = [];
  for (const column of promotedColumnsFromTable(kind)) {
    const value = row[column.name];
    if (value === null || value === undefined) continue;
    if (column.sql === "TEXT" && typeof value !== "string") issues.push(`${kind}.${column.name} expected TEXT, got ${typeof value}`);
    if (column.sql === "REAL" && typeof value !== "number") issues.push(`${kind}.${column.name} expected REAL, got ${typeof value}`);
    if (column.sql === "INTEGER" && !(typeof value === "number" && Number.isInteger(value))) {
      issues.push(`${kind}.${column.name} expected INTEGER, got ${typeof value}`);
    }
  }
  return issues;
}
