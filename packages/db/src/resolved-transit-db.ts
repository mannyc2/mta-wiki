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
  resolved_onset: {
    date: string;
    precision: "day" | "month" | "year" | "season" | "upper_bound_day";
  };
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
  placements?: ReadonlyArray<{
    placement_id: string;
    registry_state: string;
    current_claim: {
      route_record_id: string;
      gtfs_route_id: string;
      treatment_family: string;
      scope: { kind: string; record_ids: string[] };
    };
  }>;
  placement_transitions?: ReadonlyArray<{
    transition_id: string;
    application_id: string;
    action: string;
  }>;
  placement_frontier?: ReadonlyArray<{
    candidate_id: string;
    disposition: string;
    origin: string;
  }>;
  placement_reconciliation?: ReadonlyArray<{
    application_id: string;
    disposition: string;
  }>;
  documentary_lifecycle_observations?: ReadonlyArray<{
    observation_id: string;
    subject_record_id: string | null;
    lifecycle_phase: string | null;
    document_status: string | null;
    assertion_as_of: string | null;
    source_id: string;
  }>;
  lifecycle_assertions?: ReadonlyArray<{
    assertion_id: string;
    subject: { kind: string; placement_id?: string };
    state: string;
    review_state: string;
    valid_time: {
      start_earliest: string | null;
      start_latest: string | null;
      end_earliest: string | null;
      end_latest: string | null;
    };
    document_time: { assertion_as_of: string | null };
  }>;
  placement_states_as_of?: ReadonlyArray<{
    placement_id: string;
    as_of_date: string;
    state: string;
  }>;
  current_footprint?: ReadonlyArray<{
    placement_id: string;
    as_of_date: string;
    gtfs_route_id: string;
    treatment_family: string;
    scope: { kind: string };
  }>;
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
    "resolved_intervention_placements",
    "resolved_application_placement_transitions",
    "resolved_intervention_placement_frontier",
    "resolved_intervention_placement_reconciliation",
    "documentary_lifecycle_observations",
    "resolved_intervention_lifecycle_assertions",
    "resolved_intervention_placement_state_as_of",
    "resolved_current_intervention_footprint",
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
    const insertPlacement = db.prepare(
      `INSERT INTO resolved_intervention_placements
       (placement_id, registry_state, route_record_id, gtfs_route_id,
        treatment_family, scope_kind, normalized_scope_key, row_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of [...(model.placements ?? [])].sort((a, b) => a.placement_id.localeCompare(b.placement_id))) {
      insertPlacement.run(
        row.placement_id, row.registry_state, row.current_claim.route_record_id,
        row.current_claim.gtfs_route_id, row.current_claim.treatment_family,
        row.current_claim.scope.kind,
        stableJson({
          kind: row.current_claim.scope.kind,
          record_ids: row.current_claim.scope.record_ids,
        } as JsonValue),
        stableJson(row as unknown as JsonValue),
      );
    }
    const insertTransition = db.prepare(
      `INSERT INTO resolved_application_placement_transitions
       (transition_id, application_id, action, row_json) VALUES (?, ?, ?, ?)`,
    );
    for (const row of [...(model.placement_transitions ?? [])]
      .sort((a, b) => a.transition_id.localeCompare(b.transition_id))) {
      insertTransition.run(
        row.transition_id, row.application_id, row.action,
        stableJson(row as unknown as JsonValue),
      );
    }
    const insertFrontier = db.prepare(
      `INSERT INTO resolved_intervention_placement_frontier
       (candidate_id, disposition, origin, row_json) VALUES (?, ?, ?, ?)`,
    );
    for (const row of [...(model.placement_frontier ?? [])]
      .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id))) {
      insertFrontier.run(
        row.candidate_id, row.disposition, row.origin,
        stableJson(row as unknown as JsonValue),
      );
    }
    const insertPlacementReconciliation = db.prepare(
      `INSERT INTO resolved_intervention_placement_reconciliation
       (application_id, disposition, row_json) VALUES (?, ?, ?)`,
    );
    for (const row of [...(model.placement_reconciliation ?? [])]
      .sort((a, b) => a.application_id.localeCompare(b.application_id))) {
      insertPlacementReconciliation.run(
        row.application_id, row.disposition,
        stableJson(row as unknown as JsonValue),
      );
    }
    const insertDocumentary = db.prepare(
      `INSERT INTO documentary_lifecycle_observations
       (observation_id, subject_record_id, lifecycle_phase, document_status,
        assertion_as_of, source_id, row_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of [...(model.documentary_lifecycle_observations ?? [])]
      .sort((a, b) => a.observation_id.localeCompare(b.observation_id))) {
      insertDocumentary.run(
        row.observation_id, row.subject_record_id, row.lifecycle_phase,
        row.document_status, row.assertion_as_of, row.source_id,
        stableJson(row as unknown as JsonValue),
      );
    }
    const insertAssertion = db.prepare(
      `INSERT INTO resolved_intervention_lifecycle_assertions
       (assertion_id, placement_id, state, review_state, valid_start_earliest,
        valid_start_latest, valid_end_earliest, valid_end_latest,
        document_assertion_as_of, row_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of [...(model.lifecycle_assertions ?? [])]
      .sort((a, b) => a.assertion_id.localeCompare(b.assertion_id))) {
      insertAssertion.run(
        row.assertion_id,
        row.subject.kind === "placement" ? row.subject.placement_id ?? null : null,
        row.state, row.review_state, row.valid_time.start_earliest,
        row.valid_time.start_latest, row.valid_time.end_earliest,
        row.valid_time.end_latest, row.document_time.assertion_as_of,
        stableJson(row as unknown as JsonValue),
      );
    }
    const insertState = db.prepare(
      `INSERT INTO resolved_intervention_placement_state_as_of
       (placement_id, as_of_date, state, row_json) VALUES (?, ?, ?, ?)`,
    );
    for (const row of [...(model.placement_states_as_of ?? [])]
      .sort((a, b) => a.placement_id.localeCompare(b.placement_id))) {
      insertState.run(
        row.placement_id, row.as_of_date, row.state,
        stableJson(row as unknown as JsonValue),
      );
    }
    const insertFootprint = db.prepare(
      `INSERT INTO resolved_current_intervention_footprint
       (placement_id, as_of_date, gtfs_route_id, treatment_family,
        scope_kind, row_json) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const row of [...(model.current_footprint ?? [])]
      .sort((a, b) => a.placement_id.localeCompare(b.placement_id))) {
      insertFootprint.run(
        row.placement_id, row.as_of_date, row.gtfs_route_id,
        row.treatment_family, row.scope.kind,
        stableJson(row as unknown as JsonValue),
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

function readRows(
  table: string,
  orderBy: string,
  options: { path?: string; clauses?: string[]; parameters?: string[] } = {},
): JsonValue[] {
  const db = openResolvedTransitDb(options.path);
  try {
    const where = options.clauses?.length ? ` WHERE ${options.clauses.join(" AND ")}` : "";
    const rows = db.query(
      `SELECT row_json FROM ${table}${where} ORDER BY ${orderBy}`,
    ).all(...(options.parameters ?? [])) as Array<{ row_json: string }>;
    return rows.map((row) => JSON.parse(row.row_json) as JsonValue);
  } finally {
    db.close();
  }
}

export function readResolvedInterventionPlacements(
  options: { placementId?: string; gtfsRouteId?: string; treatmentFamily?: string; path?: string } = {},
): JsonValue[] {
  const clauses: string[] = [];
  const parameters: string[] = [];
  if (options.placementId) { clauses.push("placement_id = ?"); parameters.push(options.placementId); }
  if (options.gtfsRouteId) { clauses.push("gtfs_route_id = ?"); parameters.push(options.gtfsRouteId); }
  if (options.treatmentFamily) { clauses.push("treatment_family = ?"); parameters.push(options.treatmentFamily); }
  return readRows("resolved_intervention_placements", "placement_id", {
    ...(options.path ? { path: options.path } : {}), clauses, parameters,
  });
}

export function readResolvedInterventionPlacementStates(
  options: { placementId?: string; asOfDate?: string; state?: string; path?: string } = {},
): JsonValue[] {
  const clauses: string[] = [];
  const parameters: string[] = [];
  if (options.placementId) { clauses.push("placement_id = ?"); parameters.push(options.placementId); }
  if (options.asOfDate) { clauses.push("as_of_date = ?"); parameters.push(options.asOfDate); }
  if (options.state) { clauses.push("state = ?"); parameters.push(options.state); }
  return readRows("resolved_intervention_placement_state_as_of", "placement_id", {
    ...(options.path ? { path: options.path } : {}), clauses, parameters,
  });
}

export function readResolvedCurrentInterventionFootprint(
  options: { gtfsRouteId?: string; treatmentFamily?: string; asOfDate?: string; path?: string } = {},
): JsonValue[] {
  const clauses: string[] = [];
  const parameters: string[] = [];
  if (options.gtfsRouteId) { clauses.push("gtfs_route_id = ?"); parameters.push(options.gtfsRouteId); }
  if (options.treatmentFamily) { clauses.push("treatment_family = ?"); parameters.push(options.treatmentFamily); }
  if (options.asOfDate) { clauses.push("as_of_date = ?"); parameters.push(options.asOfDate); }
  return readRows("resolved_current_intervention_footprint", "placement_id", {
    ...(options.path ? { path: options.path } : {}), clauses, parameters,
  });
}
