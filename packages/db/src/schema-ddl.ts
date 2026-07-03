// STRICT DDL renderer for the canonical schema (Step 3 / S3.3). Drizzle tables (schema.ts) carry
// the typed query + column surface but NOT SQLite STRICT, the three CHECKs, or FTS5 — this file is
// the single generator that turns the table defs into the executable CREATE statement list that
// rebuildCanonicalDb runs ("migration = rebuild from journals" needs a DDL list).
//
// This is the ONLY file allowed to contain CREATE-statement text (the no-hand-DDL grep exempts it):
// the renderer assembles CREATE TABLE/INDEX from getTableConfig, plus an explicit constraint map
// for the bits Drizzle doesn't model (STRICT — always; the three CHECK bodies). The 2 FTS5 virtual
// tables (no Drizzle builder exists) are raw strings here; the 11 views are authored as sqliteView
// in schema.ts and rendered to CREATE VIEW here.

import { getTableConfig, getViewConfig, SQLiteSyncDialect, type SQLiteTable, type SQLiteView } from "drizzle-orm/sqlite-core";
import {
  records, sources, entities, projects, corridors, routes, treatment_components, events, claims,
  metric_claims, source_gaps, relations, record_sources, record_local_observations,
  record_submissions, record_aliases, evidence_refs, identity_aliases, do_not_merge,
  payload_value_conflicts, ref_gtfs_routes, ref_agencies, CANONICAL_VIEWS,
} from "./schema.js";

// ---- FTS5 (S3.4): the only genuinely raw survivors — Drizzle has no FTS5 builder. Trigram
// tokenizer (substring MATCH); key columns UNINDEXED (stored, not tokenized). Excluded from the
// canonical determinism anchor (logical content checksum instead, fts.ts#ftsContentChecksum).
export type FtsColumn = { name: string; unindexed?: boolean };
export type FtsTableModel = { name: string; columns: FtsColumn[]; tokenize: string };

export const FTS_TABLES: FtsTableModel[] = [
  { name: "records_fts", tokenize: "trigram", columns: [{ name: "record_id", unindexed: true }, { name: "names_text" }] },
  { name: "blocks_fts", tokenize: "trigram", columns: [{ name: "source_id", unindexed: true }, { name: "block_id", unindexed: true }, { name: "raw_text" }] },
];

export function renderFtsDdl(model: FtsTableModel): string {
  const cols = model.columns.map((c) => (c.unindexed ? `${c.name} UNINDEXED` : c.name)).join(", ");
  return `CREATE VIRTUAL TABLE ${model.name} USING fts5(${cols}, tokenize='${model.tokenize}');`;
}

/** FTS5 virtual-table names — for callers that must exclude FTS internals (the determinism anchor). */
export function ftsTableNames(): string[] {
  return FTS_TABLES.map((m) => m.name);
}

const viewDialect = new SQLiteSyncDialect();

/** CREATE VIEW for a sqliteView — the raw sql`` body serialises back verbatim (0 params). */
export function renderView(view: SQLiteView): string {
  const cfg = getViewConfig(view);
  const { sql: selectSql } = viewDialect.sqlToQuery(cfg.query!);
  return `CREATE VIEW ${cfg.name} AS ${selectSql};`;
}

/** Tables whose promoted columns (all except record_id) are double-quoted in the DDL. */
const PER_KIND = new Set([
  "sources", "entities", "projects", "corridors", "routes", "treatment_components", "events",
  "claims", "metric_claims", "source_gaps",
]);

/** CHECK bodies, by table → column. Drizzle's check() stores a SQL object that doesn't serialise
 *  to this inlined text cleanly, so the bodies are authored here (the DDL home). The contract test
 *  asserts all three appear in the rendered DDL. The record_kind list mirrors the
 *  records.record_kind domain; changing it is the same audit-gated event as a schema.ts column edit.
 *  The relation_family list mirrors RELATION_FAMILIES in @mta-wiki/pipeline/records/relations.ts;
 *  packages/pipeline/test/records/relation-family-ddl-sync.test.ts enforces the mirror. */
const CHECK_BODIES: Record<string, Record<string, string>> = {
  records: {
    record_kind:
      "record_kind IN ('source','entity','project','corridor','route','treatment_component','event','claim','metric_claim','table','source_gap','relation')",
  },
  relations: {
    provenance: "provenance IN ('authored','derived','canonicalizer')",
    relation_family:
      "relation_family IN ('route_scope','corridor_scope','location_scope','metric_context','claim_context','treatment_context','timeline_context','agency_role','organization_hierarchy','publication_role','ownership_role','program_project_scope','partnership_engagement','governance_legal','funding_award','data_reporting','dependency_or_reference','other')",
  },
};

type IndexSpec = { name: string; table: string; columns: string[]; quoted: boolean };

const RECORDS_INDEX: IndexSpec = { name: "idx_records_kind", table: "records", columns: ["record_kind"], quoted: false };

/** Per-kind anchor index (the kind's promoted primary identity anchor), single quoted column.
 *  `sources` has none. */
const PER_KIND_INDEX: Record<string, IndexSpec> = {
  entities: { name: "idx_entities_entity_name", table: "entities", columns: ["entity_name"], quoted: true },
  projects: { name: "idx_projects_project_name", table: "projects", columns: ["project_name"], quoted: true },
  corridors: { name: "idx_corridors_corridor_name", table: "corridors", columns: ["corridor_name"], quoted: true },
  routes: { name: "idx_routes_route_id", table: "routes", columns: ["route_id"], quoted: true },
  treatment_components: { name: "idx_treatment_components_treatment_kind", table: "treatment_components", columns: ["treatment_kind"], quoted: true },
  events: { name: "idx_events_event_kind", table: "events", columns: ["event_kind"], quoted: true },
  claims: { name: "idx_claims_claim_text", table: "claims", columns: ["claim_text"], quoted: true },
  metric_claims: { name: "idx_metric_claims_metric_name", table: "metric_claims", columns: ["metric_name"], quoted: true },
  source_gaps: { name: "idx_source_gaps_gap_kind", table: "source_gaps", columns: ["gap_kind"], quoted: true },
};

const RELATION_INDEXES: IndexSpec[] = [
  { name: "idx_rel_subject", table: "relations", columns: ["subject_id", "relation_kind"], quoted: false },
  { name: "idx_rel_object", table: "relations", columns: ["object_id", "relation_kind"], quoted: false },
  { name: "idx_rel_identity", table: "relations", columns: ["relation_kind", "subject_id", "object_id"], quoted: false },
];

const EVIDENCE_INDEXES: IndexSpec[] = [
  { name: "idx_evidence_record", table: "evidence_refs", columns: ["record_id"], quoted: false },
  { name: "idx_evidence_block", table: "evidence_refs", columns: ["source_id", "block_id"], quoted: false },
];

/** Per-kind tables, in DDL emission order (registry order). */
const PER_KIND_TABLES: SQLiteTable[] = [
  sources, entities, projects, corridors, routes, treatment_components, events, claims, metric_claims, source_gaps,
];

function renderColumn(
  col: { name: string; getSQLType(): string; notNull: boolean; primary: boolean },
  quoted: boolean,
  fk: { ftable: string; fcol: string } | undefined,
  check: string | undefined,
): string {
  const name = quoted ? `"${col.name}"` : col.name;
  let s = `${name} ${col.getSQLType().toUpperCase()}`;
  if (col.primary) s += " PRIMARY KEY";
  else if (col.notNull) s += " NOT NULL";
  if (fk) s += ` REFERENCES ${fk.ftable}(${fk.fcol})`;
  if (check) s += ` CHECK (${check})`;
  return s;
}

/** CREATE … STRICT for one table, from its drizzle config + the constraint map. */
export function renderCreateTable(table: SQLiteTable): string {
  const cfg = getTableConfig(table);
  const perKind = PER_KIND.has(cfg.name);
  const checks = CHECK_BODIES[cfg.name] ?? {};
  const fkByCol = new Map<string, { ftable: string; fcol: string }>();
  for (const fk of cfg.foreignKeys) {
    const ref = fk.reference();
    fkByCol.set(ref.columns[0]!.name, { ftable: getTableConfig(ref.foreignTable).name, fcol: ref.foreignColumns[0]!.name });
  }
  const lines = cfg.columns.map((col) =>
    renderColumn(col as never, perKind && col.name !== "record_id", fkByCol.get(col.name), checks[col.name]),
  );
  if (cfg.primaryKeys.length > 0) {
    lines.push(`PRIMARY KEY (${cfg.primaryKeys[0]!.columns.map((c) => c.name).join(", ")})`);
  }
  return `CREATE TABLE ${cfg.name} (\n  ${lines.join(",\n  ")}\n) STRICT;`;
}

export function renderIndex(spec: IndexSpec): string {
  const cols = spec.columns.map((c) => (spec.quoted ? `"${c}"` : c)).join(", ");
  return `CREATE INDEX ${spec.name} ON ${spec.table}(${cols});`;
}

/** The full DDL statement array, in the exact order rebuildCanonicalDb executes it (= the order
 *  the previous generator emitted, so the transitional equivalence gate compares cleanly). */
export function schemaDdlStatements(): string[] {
  const out: string[] = [renderCreateTable(records), renderIndex(RECORDS_INDEX)];
  for (const table of PER_KIND_TABLES) {
    out.push(renderCreateTable(table));
    const idx = PER_KIND_INDEX[getTableConfig(table).name];
    if (idx) out.push(renderIndex(idx));
  }
  out.push(renderCreateTable(relations), ...RELATION_INDEXES.map(renderIndex));
  out.push(
    renderCreateTable(record_sources),
    renderCreateTable(record_local_observations),
    renderCreateTable(record_submissions),
    renderCreateTable(record_aliases),
  );
  out.push(renderCreateTable(evidence_refs), ...EVIDENCE_INDEXES.map(renderIndex));
  out.push(
    renderCreateTable(identity_aliases),
    renderCreateTable(do_not_merge),
    renderCreateTable(payload_value_conflicts),
  );
  out.push(renderCreateTable(ref_gtfs_routes), renderCreateTable(ref_agencies));
  out.push(...FTS_TABLES.map(renderFtsDdl));
  out.push(...CANONICAL_VIEWS.map(renderView));
  return out;
}

/** Resolved CREATE statement list consumed by rebuildCanonicalDb. */
export const SCHEMA_DDL: string[] = schemaDdlStatements();
