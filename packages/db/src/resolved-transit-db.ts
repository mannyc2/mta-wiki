/// <reference path="./bun-sqlite.d.ts" />
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "./stable-json.js";
import type { JsonValue } from "./types.js";
import {
  RESOLVED_TRANSIT_DB_VERSION,
  RESOLVED_TRANSIT_DDL,
} from "./resolved-transit-schema.js";

export type ResolvedTransitEpisodeRow = {
  occurrence_id: string;
  resolved_onset: { date: string; precision: "day" | "month" };
  review_decision_id: string;
  review_membership_fingerprint: string;
  resolution_method: "accepted_review" | "lossless_v1_migration";
};

export type ResolvedTransitApplicationRow = {
  application_id: string;
  occurrence_id: string;
  route_record_id: string;
  gtfs_route_id: string;
  treatment_record_id: string;
  treatment_family: string;
  phase_record_id: string | null;
  action: string;
  extent: { kind: string };
};

export type ResolvedTransitModelInput = {
  episodes: readonly ResolvedTransitEpisodeRow[];
  applications: readonly ResolvedTransitApplicationRow[];
  context_links: ReadonlyArray<{
    context_link_id: string;
    occurrence_id: string;
    context_record_id: string;
    context_record_kind: string;
    relation_record_id: string;
  }>;
  application_reconciliation: ReadonlyArray<{
    reconciliation_id: string;
    candidate_id: string;
    occurrence_id: string | null;
    disposition: string;
    reason_code: string;
  }>;
  identity_reconciliation: ReadonlyArray<{
    reconciliation_id: string;
    occurrence_id: string;
    disposition: string;
    reason_code: string;
  }>;
  summary: { contract_id: string };
};

export type RebuildResolvedTransitDbResult = {
  path: string;
  episodeCount: number;
  applicationCount: number;
  schemaSha256: string;
  dataSha256: string;
};

export function resolvedTransitDbPath(rootDir = repoRoot): string {
  return join(rootDir, "data", "resolved-transit.db");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function removeDb(path: string): void {
  for (const suffix of ["", "-shm", "-wal"]) rmSync(`${path}${suffix}`, { force: true });
}

function schemaDump(db: Database): string {
  return (db.query(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name",
  ).all() as unknown[]).map((row) => stableJson(row as JsonValue)).join("\n") + "\n";
}

function dataDump(db: Database): string {
  const tables = [
    "resolved_intervention_episodes",
    "resolved_intervention_applications",
    "resolved_intervention_context_links",
    "resolved_intervention_application_reconciliation",
    "resolved_intervention_identity_reconciliation",
  ];
  return tables.map((table) => {
    const rows = db.query(`SELECT row_json FROM ${table} ORDER BY 1`).all() as Array<{ row_json: string }>;
    return `${table}\n${rows.map((row) => row.row_json).join("\n")}`;
  }).join("\n") + "\n";
}

export function rebuildResolvedTransitDb(
  model: ResolvedTransitModelInput,
  options: { path?: string } = {},
): RebuildResolvedTransitDbResult {
  const target = options.path ?? resolvedTransitDbPath();
  const building = `${target}.building`;
  mkdirSync(dirname(target), { recursive: true });
  removeDb(building);
  const db = new Database(building, { create: true });
  try {
    db.exec("PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
    db.exec(RESOLVED_TRANSIT_DDL);
    db.exec(`PRAGMA user_version = ${RESOLVED_TRANSIT_DB_VERSION};`);
    db.exec("BEGIN IMMEDIATE;");
    const insertEpisode = db.prepare(
      `INSERT INTO resolved_intervention_episodes
       (occurrence_id, onset_date, onset_precision, review_decision_id,
        review_membership_fingerprint, resolution_method, row_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of [...model.episodes].sort((a, b) => a.occurrence_id.localeCompare(b.occurrence_id))) {
      insertEpisode.run(
        row.occurrence_id,
        row.resolved_onset.date,
        row.resolved_onset.precision,
        row.review_decision_id,
        row.review_membership_fingerprint,
        row.resolution_method,
        stableJson(row as unknown as JsonValue),
      );
    }
    const insertApplication = db.prepare(
      `INSERT INTO resolved_intervention_applications
       (application_id, occurrence_id, route_record_id, gtfs_route_id,
        treatment_record_id, treatment_family, phase_record_id, action,
        extent_kind, row_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of [...model.applications].sort((a, b) => a.application_id.localeCompare(b.application_id))) {
      insertApplication.run(
        row.application_id, row.occurrence_id, row.route_record_id,
        row.gtfs_route_id, row.treatment_record_id, row.treatment_family,
        row.phase_record_id, row.action, row.extent.kind,
        stableJson(row as unknown as JsonValue),
      );
    }
    const insertContext = db.prepare(
      `INSERT INTO resolved_intervention_context_links
       (context_link_id, occurrence_id, context_record_id, context_record_kind,
        relation_record_id, row_json) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const row of [...model.context_links].sort((a, b) => a.context_link_id.localeCompare(b.context_link_id))) {
      insertContext.run(
        row.context_link_id, row.occurrence_id, row.context_record_id,
        row.context_record_kind, row.relation_record_id,
        stableJson(row as unknown as JsonValue),
      );
    }
    const insertApplicationReconciliation = db.prepare(
      `INSERT INTO resolved_intervention_application_reconciliation
       (reconciliation_id, candidate_id, occurrence_id, disposition,
        reason_code, row_json) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const row of [...model.application_reconciliation]
      .sort((a, b) => a.reconciliation_id.localeCompare(b.reconciliation_id))) {
      insertApplicationReconciliation.run(
        row.reconciliation_id, row.candidate_id, row.occurrence_id,
        row.disposition, row.reason_code, stableJson(row as unknown as JsonValue),
      );
    }
    const insertIdentityReconciliation = db.prepare(
      `INSERT INTO resolved_intervention_identity_reconciliation
       (reconciliation_id, occurrence_id, disposition, reason_code, row_json)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const row of [...model.identity_reconciliation]
      .sort((a, b) => a.reconciliation_id.localeCompare(b.reconciliation_id))) {
      insertIdentityReconciliation.run(
        row.reconciliation_id, row.occurrence_id, row.disposition,
        row.reason_code, stableJson(row as unknown as JsonValue),
      );
    }
    const dataSha256 = sha256(dataDump(db));
    db.prepare(
      `INSERT INTO resolved_transit_state
       (state_key, schema_version, contract_id, sealed, data_sha256)
       VALUES ('resolved-transit', ?, ?, 1, ?)`,
    ).run(RESOLVED_TRANSIT_DB_VERSION, model.summary.contract_id, dataSha256);
    db.exec("COMMIT;");
    const foreignKeys = db.query("PRAGMA foreign_key_check").all();
    if (foreignKeys.length) throw new Error("resolved transit DB foreign key check failed");
    const quickCheck = db.query("PRAGMA quick_check").get() as { quick_check: string };
    if (quickCheck.quick_check !== "ok") throw new Error(`resolved transit DB quick_check: ${quickCheck.quick_check}`);
    const result = {
      path: target,
      episodeCount: model.episodes.length,
      applicationCount: model.applications.length,
      schemaSha256: sha256(schemaDump(db)),
      dataSha256,
    };
    db.close();
    removeDb(target);
    renameSync(building, target);
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK;"); } catch {}
    db.close();
    removeDb(building);
    throw error;
  }
}

export function openResolvedTransitDb(path = resolvedTransitDbPath()): Database {
  if (!existsSync(path)) throw new Error(`resolved transit DB not found: ${path}`);
  const db = new Database(path, { readonly: true });
  db.exec("PRAGMA foreign_keys = ON;");
  const version = Number((db.query("PRAGMA user_version").get() as { user_version: number }).user_version);
  const state = db.query(
    "SELECT schema_version, sealed FROM resolved_transit_state WHERE state_key = 'resolved-transit'",
  ).get() as { schema_version: number; sealed: number } | null;
  if (version !== RESOLVED_TRANSIT_DB_VERSION || !state ||
      state.schema_version !== RESOLVED_TRANSIT_DB_VERSION || state.sealed !== 1) {
    db.close();
    throw new Error("resolved transit DB schema/seal mismatch; rebuild it");
  }
  return db;
}

export function readResolvedInterventionEpisodes(
  options: { occurrenceId?: string; path?: string } = {},
): JsonValue[] {
  const db = openResolvedTransitDb(options.path);
  try {
    const rows = options.occurrenceId
      ? db.query("SELECT row_json FROM resolved_intervention_episodes WHERE occurrence_id = ? ORDER BY occurrence_id")
        .all(options.occurrenceId)
      : db.query("SELECT row_json FROM resolved_intervention_episodes ORDER BY occurrence_id").all();
    return (rows as Array<{ row_json: string }>).map((row) => JSON.parse(row.row_json) as JsonValue);
  } finally {
    db.close();
  }
}

export function readResolvedInterventionApplications(
  options: { occurrenceId?: string; gtfsRouteId?: string; treatmentFamily?: string; path?: string } = {},
): JsonValue[] {
  const db = openResolvedTransitDb(options.path);
  try {
    const clauses: string[] = [];
    const parameters: string[] = [];
    if (options.occurrenceId) { clauses.push("occurrence_id = ?"); parameters.push(options.occurrenceId); }
    if (options.gtfsRouteId) { clauses.push("gtfs_route_id = ?"); parameters.push(options.gtfsRouteId); }
    if (options.treatmentFamily) { clauses.push("treatment_family = ?"); parameters.push(options.treatmentFamily); }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = db.query(
      `SELECT row_json FROM resolved_intervention_applications${where} ORDER BY application_id`,
    ).all(...parameters) as Array<{ row_json: string }>;
    return rows.map((row) => JSON.parse(row.row_json) as JsonValue);
  } finally {
    db.close();
  }
}
