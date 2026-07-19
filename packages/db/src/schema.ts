// Hand-written Drizzle schema — the single source of truth for the canonical SQLite tables
// (Step 3 / S3.3). Replaces the deleted structured-model codegen pipeline: these explicit
// sqliteTable defs ARE the schema (the only previously registry-derived thing —
// the per-kind promoted columns — is now visible code). Editing a column here is the deliberate,
// audit-gated, rare event that `PRAGMA user_version` is bumped for; `KIND_SPECS` still owns
// payloads/prompts/submit-tools.
//
// The executable STRICT DDL (which Drizzle tables don't carry: STRICT, the two CHECKs, FTS5) is
// rendered from these defs by schema-ddl.ts via getTableConfig — `migration = rebuild from
// journals` needs a DDL list. Views live here too (sqliteView, added S3.4). No DDL strings in this
// file; schema-ddl.ts is the only hand-DDL-exempt generator.

import { sqliteTable, sqliteView, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const records = sqliteTable("records", {
  record_id: text("record_id").primaryKey(),
  record_kind: text("record_kind").notNull(),
  display_name: text("display_name").notNull(),
  raw_text: text("raw_text"),
  local_observation_id: text("local_observation_id").notNull(),
  primary_source_id: text("primary_source_id").notNull(),
  payload: text("payload").notNull(),
  truth_status: text("truth_status").notNull(),
  review_state: text("review_state").notNull(),
  generated_at: text("generated_at").notNull(),
});

export const sources = sqliteTable("sources", {
  record_id: text("record_id").primaryKey().references(() => records.record_id),
  authority_tier: text("authority_tier"),
  content_type: text("content_type"),
  date: text("date"),
  date_text: text("date_text"),
  publication_date: text("publication_date"),
  published_date_normalized: text("published_date_normalized"),
  published_date_precision: text("published_date_precision"),
  publisher: text("publisher"),
  retrieved_at: text("retrieved_at"),
  title: text("title"),
});

export const entities = sqliteTable("entities", {
  record_id: text("record_id").primaryKey().references(() => records.record_id),
  acronym: text("acronym"),
  agency_name: text("agency_name"),
  description: text("description"),
  entity_name: text("entity_name"),
  entity_type: text("entity_type"),
  name: text("name"),
  owner: text("owner"),
  short_name: text("short_name"),
});

export const projects = sqliteTable("projects", {
  record_id: text("record_id").primaryKey().references(() => records.record_id),
  borough: text("borough"),
  date_normalized: text("date_normalized"),
  date_precision: text("date_precision"),
  date_source_field: text("date_source_field"),
  description: text("description"),
  document_time_status: text("document_time_status"),
  name: text("name"),
  project_family: text("project_family"),
  project_name: text("project_name"),
  project_type: text("project_type"),
  status: text("status"),
});

export const corridors = sqliteTable("corridors", {
  record_id: text("record_id").primaryKey().references(() => records.record_id),
  borough: text("borough"),
  borough_normalized: text("borough_normalized"),
  boroughs_normalized: text("boroughs_normalized"),
  corridor_name: text("corridor_name"),
  description: text("description"),
  from: text("from"),
  limits: text("limits"),
  name: text("name"),
  street: text("street"),
  to: text("to"),
});

export const routes = sqliteTable("routes", {
  record_id: text("record_id").primaryKey().references(() => records.record_id),
  borough: text("borough"),
  borough_normalized: text("borough_normalized"),
  boroughs_normalized: text("boroughs_normalized"),
  route: text("route"),
  route_id: text("route_id"),
  route_label: text("route_label"),
  route_name: text("route_name"),
  route_type: text("route_type"),
  route_type_normalized: text("route_type_normalized"),
});

export const treatment_components = sqliteTable("treatment_components", {
  record_id: text("record_id").primaryKey().references(() => records.record_id),
  component_kind: text("component_kind"),
  component_type: text("component_type"),
  date_text: text("date_text"),
  description: text("description"),
  location_text: text("location_text"),
  treatment_family: text("treatment_family"),
  treatment_kind: text("treatment_kind"),
  treatment_type: text("treatment_type"),
});

export const events = sqliteTable("events", {
  record_id: text("record_id").primaryKey().references(() => records.record_id),
  date: text("date"),
  date_normalized: text("date_normalized"),
  date_precision: text("date_precision"),
  date_text: text("date_text"),
  description: text("description"),
  event_date: text("event_date"),
  event_family: text("event_family"),
  event_kind: text("event_kind"),
  lifecycle_phase: text("lifecycle_phase"),
});

export const claims = sqliteTable("claims", {
  record_id: text("record_id").primaryKey().references(() => records.record_id),
  change_type: text("change_type"),
  change_type_normalized: text("change_type_normalized"),
  claim_text: text("claim_text"),
  data_type: text("data_type"),
  data_type_normalized: text("data_type_normalized"),
  description: text("description"),
  statement: text("statement"),
  text: text("text"),
});

export const metric_claims = sqliteTable("metric_claims", {
  record_id: text("record_id").primaryKey().references(() => records.record_id),
  benefit_denominator_stated: text("benefit_denominator_stated"),
  cause_attribution: text("cause_attribution"),
  comparison_normalized: text("comparison_normalized"),
  cost_type: text("cost_type"),
  day_type: text("day_type"),
  day_type_normalized: text("day_type_normalized"),
  demographic_group_normalized: text("demographic_group_normalized"),
  direction: text("direction"),
  direction_normalized: text("direction_normalized"),
  funding_source: text("funding_source"),
  metric_name: text("metric_name"),
  mode: text("mode"),
  mode_normalized: text("mode_normalized"),
  period: text("period"),
  raw_value_text: text("raw_value_text"),
  scenario: text("scenario"),
  scenario_normalized: text("scenario_normalized"),
  scope: text("scope"),
  service_type: text("service_type"),
  service_type_normalized: text("service_type_normalized"),
  time_horizon: text("time_horizon"),
  time_period: text("time_period"),
  time_period_normalized: text("time_period_normalized"),
  unit: text("unit"),
  unit_normalized: text("unit_normalized"),
  value: real("value"),
  value_max: real("value_max"),
  value_min: real("value_min"),
});

export const source_gaps = sqliteTable("source_gaps", {
  record_id: text("record_id").primaryKey().references(() => records.record_id),
  description: text("description"),
  gap_kind: text("gap_kind"),
  gap_kind_normalized: text("gap_kind_normalized"),
  gap_text: text("gap_text"),
  missing_information: text("missing_information"),
});

export const relations = sqliteTable("relations", {
  record_id: text("record_id").primaryKey().references(() => records.record_id),
  relation_kind: text("relation_kind").notNull(),
  raw_relation_kind: text("raw_relation_kind"),
  relation_family: text("relation_family").notNull(),
  subject_id: text("subject_id").notNull().references(() => records.record_id),
  object_id: text("object_id").notNull().references(() => records.record_id),
  provenance: text("provenance").notNull(),
  derivation_rule: text("derivation_rule"),
  canonicalize_decision_id: text("canonicalize_decision_id"),
  assertion_status: text("assertion_status"),
  as_of_date: text("as_of_date"),
});

export const record_sources = sqliteTable("record_sources", {
  record_id: text("record_id").notNull().references(() => records.record_id),
  source_id: text("source_id").notNull(),
}, (t) => [primaryKey({ columns: [t.record_id, t.source_id] })]);

export const record_local_observations = sqliteTable("record_local_observations", {
  record_id: text("record_id").notNull().references(() => records.record_id),
  local_observation_id: text("local_observation_id").notNull(),
}, (t) => [primaryKey({ columns: [t.record_id, t.local_observation_id] })]);

export const record_submissions = sqliteTable("record_submissions", {
  record_id: text("record_id").notNull().references(() => records.record_id),
  submission_id: text("submission_id").notNull(),
  run_id: text("run_id"),
}, (t) => [primaryKey({ columns: [t.record_id, t.submission_id] })]);

export const record_aliases = sqliteTable("record_aliases", {
  record_id: text("record_id").notNull().references(() => records.record_id),
  alias: text("alias").notNull(),
}, (t) => [primaryKey({ columns: [t.record_id, t.alias] })]);

/** Normalized mirror of data/evidence-block-index.jsonl. This is the authoritative lookup surface
 * for exact source/block resolution inside the derived DB; evidence_refs must match one row in
 * every identity, path, page, and content-address field. */
export const evidence_block_registry = sqliteTable("evidence_block_registry", {
  source_id: text("source_id").notNull(),
  block_id: text("block_id").notNull(),
  resolved_block_id: text("resolved_block_id").notNull(),
  page_number: integer("page_number").notNull(),
  evidence_id: text("evidence_id").notNull(),
  source_path: text("source_path").notNull(),
  raw_text_sha256: text("raw_text_sha256").notNull(),
}, (t) => [primaryKey({ columns: [t.source_id, t.block_id] })]);

export const evidence_refs = sqliteTable("evidence_refs", {
  record_id: text("record_id").notNull().references(() => records.record_id),
  ordinal: integer("ordinal").notNull(),
  ref_json: text("ref_json").notNull(),
  source_id: text("source_id").notNull(),
  block_id: text("block_id"),
  resolved_block_id: text("resolved_block_id"),
  page_number: integer("page_number"),
  evidence_id: text("evidence_id"),
  source_path: text("source_path"),
  text_sha256: text("text_sha256"),
  role: text("role"),
}, (t) => [primaryKey({ columns: [t.record_id, t.ordinal] })]);

/** One-way build state. rebuildCanonicalDb inserts the unsealed singleton before loading rows and
 * transitions it to sealed exactly once immediately before commit. Published relationship mirrors
 * cannot be reopened for in-place mutation; they must be rebuilt from authoritative inputs. */
export const canonical_db_state = sqliteTable("canonical_db_state", {
  state_key: text("state_key").primaryKey(),
  sealed: integer("sealed").notNull(),
});

/** Every exact endpoint shape admitted by the versioned relationship contract. The table is
 * populated before relation rows, allowing SQLite triggers to fail closed on novel kinds/shapes. */
export const relationship_contract_rules = sqliteTable("relationship_contract_rules", {
  contract_id: text("contract_id").notNull(),
  relation_kind: text("relation_kind").notNull(),
  relation_family: text("relation_family").notNull(),
  subject_kind: text("subject_kind").notNull(),
  object_kind: text("object_kind").notNull(),
  review_basis: text("review_basis").notNull(),
}, (t) => [primaryKey({ columns: [t.contract_id, t.relation_kind, t.relation_family, t.subject_kind, t.object_kind] })]);

/** One SQL mirror of the canonical, alias, local-observation, override, and superseded identity
 * surfaces. Relations still reference records(record_id) directly; this registry makes every
 * alternate resolution inspectable and ambiguity-queryable without weakening that physical FK. */
export const canonical_identities = sqliteTable("canonical_identities", {
  identity_class: text("identity_class").notNull(),
  identity_value: text("identity_value").notNull(),
  canonical_record_id: text("canonical_record_id").notNull().references(() => records.record_id),
  record_kind: text("record_kind").notNull(),
  source_id: text("source_id"),
  resolution_status: text("resolution_status").notNull(),
}, (t) => [primaryKey({ columns: [t.identity_class, t.identity_value, t.canonical_record_id] })]);

/** Exact finding ledger emitted by the authoritative repository validator for the same record
 * snapshot. Native SQL views independently diagnose core invariants; this table proves ordered
 * warning/enforcement finding-identity parity across the JSONL and SQLite surfaces. */
export const relationship_validation_findings = sqliteTable("relationship_validation_findings", {
  finding_id: text("finding_id").primaryKey(),
  contract_id: text("contract_id").notNull(),
  code: text("code").notNull(),
  severity: text("severity").notNull(),
  record_id: text("record_id").references(() => records.record_id),
  detail: text("detail").notNull(),
  finding_json: text("finding_json").notNull(),
});

/** Immutable, evidence-linked projectability decisions. These are a SQL mirror of the versioned
 * repository ledgers; the canonical JSONL/decision files remain authoritative. */
export const relationship_dispositions = sqliteTable("relationship_dispositions", {
  decision_id: text("decision_id").primaryKey(),
  contract_id: text("contract_id").notNull(),
  selector: text("selector").notNull(),
  record_id: text("record_id").notNull().references(() => records.record_id),
  record_kind: text("record_kind").notNull(),
  primary_disposition: text("primary_disposition").notNull(),
  study_projectable: integer("study_projectable").notNull(),
  waiver: integer("waiver").notNull(),
  reviewed_at: text("reviewed_at").notNull(),
  reviewed_by: text("reviewed_by").notNull(),
  reason: text("reason").notNull(),
  decision_json: text("decision_json").notNull(),
});

export const relationship_disposition_evidence = sqliteTable("relationship_disposition_evidence", {
  decision_id: text("decision_id").notNull().references(() => relationship_dispositions.decision_id),
  ordinal: integer("ordinal").notNull(),
  evidence_id: text("evidence_id").notNull(),
}, (t) => [primaryKey({ columns: [t.decision_id, t.ordinal] })]);

/** Exact completeness roles a reviewed disposition is allowed to waive. A disposition row alone
 * never suppresses a missing-role violation: the contract, selector, record, and role must all
 * match this normalized scope row. */
export const relationship_completeness_waivers = sqliteTable("relationship_completeness_waivers", {
  decision_id: text("decision_id").notNull().references(() => relationship_dispositions.decision_id),
  contract_id: text("contract_id").notNull(),
  selector: text("selector").notNull(),
  record_id: text("record_id").notNull().references(() => records.record_id),
  role: text("role").notNull(),
}, (t) => [primaryKey({ columns: [t.decision_id, t.contract_id, t.selector, t.role] })]);

/** One row per audited completeness subject. Occurrences are immutable non-record identities, so
 * canonical_record_id is null for them and FK-bound for event/treatment/route selectors. */
export const relationship_completeness_subjects = sqliteTable("relationship_completeness_subjects", {
  contract_id: text("contract_id").notNull(),
  selector: text("selector").notNull(),
  subject_id: text("subject_id").notNull(),
  subject_kind: text("subject_kind").notNull(),
  canonical_record_id: text("canonical_record_id").references(() => records.record_id),
  primary_disposition: text("primary_disposition").notNull(),
  study_projectable: integer("study_projectable").notNull(),
  warning_codes_json: text("warning_codes_json").notNull(),
  detail_json: text("detail_json").notNull(),
}, (t) => [primaryKey({ columns: [t.contract_id, t.selector, t.subject_id] })]);

/** Normalized role-cardinality mirror. Missing roles are enforceable only for projectable rows or
 * rows lacking an immutable non-projectable waiver. */
export const relationship_completeness_roles = sqliteTable("relationship_completeness_roles", {
  contract_id: text("contract_id").notNull(),
  selector: text("selector").notNull(),
  subject_id: text("subject_id").notNull(),
  role: text("role").notNull(),
  role_status: text("role_status").notNull(),
  binding_count: integer("binding_count").notNull(),
  record_ids_json: text("record_ids_json").notNull(),
}, (t) => [primaryKey({ columns: [t.contract_id, t.selector, t.subject_id, t.role] })]);

export const relationship_completeness_findings = sqliteTable("relationship_completeness_findings", {
  finding_id: text("finding_id").primaryKey(),
  contract_id: text("contract_id").notNull(),
  code: text("code").notNull(),
  severity: text("severity").notNull(),
  selector: text("selector").notNull(),
  subject_id: text("subject_id").notNull(),
  detail_json: text("detail_json").notNull(),
});

export const relationship_selector_contracts = sqliteTable("relationship_selector_contracts", {
  contract_id: text("contract_id").notNull(),
  selector: text("selector").notNull(),
  selector_class: text("selector_class").notNull(),
  expected_count: integer("expected_count").notNull(),
  actual_count: integer("actual_count").notNull(),
  enforcement_eligible: integer("enforcement_eligible").notNull(),
  promotion_criterion: text("promotion_criterion").notNull(),
}, (t) => [primaryKey({ columns: [t.contract_id, t.selector] })]);

export const relationship_enforcement_state = sqliteTable("relationship_enforcement_state", {
  contract_id: text("contract_id").primaryKey(),
  mode: text("mode").notNull(),
  hard_mode_ready: integer("hard_mode_ready").notNull(),
  input_fingerprint: text("input_fingerprint").notNull(),
  criteria_json: text("criteria_json").notNull(),
});

export const identity_aliases = sqliteTable("identity_aliases", {
  kind: text("kind").notNull(),
  alias: text("alias").notNull(),
  target: text("target").notNull(),
  source_decision: text("source_decision"),
}, (t) => [primaryKey({ columns: [t.kind, t.alias] })]);

export const do_not_merge = sqliteTable("do_not_merge", {
  kind: text("kind").notNull(),
  record_id_a: text("record_id_a").notNull(),
  record_id_b: text("record_id_b").notNull(),
  reason: text("reason"),
  source_decision: text("source_decision"),
  reviewed_at: text("reviewed_at"),
}, (t) => [primaryKey({ columns: [t.kind, t.record_id_a, t.record_id_b] })]);

export const payload_value_conflicts = sqliteTable("payload_value_conflicts", {
  record_id: text("record_id").notNull().references(() => records.record_id),
  field: text("field").notNull(),
  value: text("value").notNull(),
}, (t) => [primaryKey({ columns: [t.record_id, t.field, t.value] })]);

export const ref_gtfs_routes = sqliteTable("ref_gtfs_routes", {
  route_id: text("route_id").primaryKey(),
  short_name: text("short_name"),
  long_name: text("long_name"),
  agency_id: text("agency_id"),
  borough: text("borough"),
  gtfs_feed_date: text("gtfs_feed_date").notNull(),
});

export const ref_agencies = sqliteTable("ref_agencies", {
  agency_id: text("agency_id").primaryKey(),
  name: text("name"),
  kind: text("kind"),
  source: text("source"),
});

/** Selected immutable GTFS/Current Bus Routes snapshot loaded into canonical.db. The tracked
 * snapshot directory remains authoritative; this row binds every normalized reference row below
 * to its verified manifest bytes and preserves the four universe/parity counts. */
export const ref_gtfs_snapshots = sqliteTable("ref_gtfs_snapshots", {
  snapshot_id: text("snapshot_id").primaryKey(),
  manifest_sha256: text("manifest_sha256").notNull(),
  contract_id: text("contract_id").notNull(),
  schema_version: integer("schema_version").notNull(),
  dataset_id: text("dataset_id").notNull(),
  captured_at: text("captured_at").notNull(),
  as_of_date: text("as_of_date").notNull(),
  service_window_start: text("service_window_start").notNull(),
  service_window_end: text("service_window_end").notNull(),
  merge_policy: text("merge_policy").notNull(),
  id_remapping_policy: text("id_remapping_policy").notNull(),
  catalog_dataset_id: text("catalog_dataset_id").notNull(),
  catalog_artifact_sha256: text("catalog_artifact_sha256").notNull(),
  catalog_effective_as_of_date: text("catalog_effective_as_of_date").notNull(),
  route_identity_count: integer("route_identity_count").notNull(),
  route_activity_count: integer("route_activity_count").notNull(),
  catalog_identity_count: integer("catalog_identity_count").notNull(),
  catalog_only_count: integer("catalog_only_count").notNull(),
  gtfs_only_count: integer("gtfs_only_count").notNull(),
});

/** Lossless normalized mirror of route_inventory.jsonl. Exact service identity is the composite
 * (snapshot_id, dataset_id, case-sensitive source_route_id); gtfs_route_id is required to equal
 * source_route_id by the route-identity contract. Array-valued source facts use stable JSON. */
export const ref_gtfs_route_inventory = sqliteTable("ref_gtfs_route_inventory", {
  snapshot_id: text("snapshot_id").notNull().references(() => ref_gtfs_snapshots.snapshot_id),
  dataset_id: text("dataset_id").notNull(),
  source_route_id: text("source_route_id").notNull(),
  gtfs_route_id: text("gtfs_route_id").notNull(),
  component_feed_ids_json: text("component_feed_ids_json").notNull(),
  agency_id: text("agency_id"),
  raw_route_type: text("raw_route_type").notNull(),
  route_family_id: text("route_family_id").notNull(),
  route_short_name: text("route_short_name"),
  route_long_name: text("route_long_name"),
  route_desc: text("route_desc"),
  declared_in_feed: integer("declared_in_feed").notNull(),
  catalog_in_effect: text("catalog_in_effect").notNull(),
  catalog_effective_as_of_date: text("catalog_effective_as_of_date").notNull(),
  reliable_interval_start: text("reliable_interval_start").notNull(),
  reliable_interval_end: text("reliable_interval_end").notNull(),
  reliable_interval_derivation: text("reliable_interval_derivation").notNull(),
  reliability_status: text("reliability_status").notNull(),
  scheduled_in_window: text("scheduled_in_window").notNull(),
  scheduled_service_dates_json: text("scheduled_service_dates_json").notNull(),
  scheduled_trip_template_date_count: integer("scheduled_trip_template_date_count").notNull(),
  frequencies_present: integer("frequencies_present").notNull(),
  designation_literals_json: text("designation_literals_json").notNull(),
  normalized_service_modes_json: text("normalized_service_modes_json").notNull(),
  display_label: text("display_label").notNull(),
  display_label_source: text("display_label_source").notNull(),
  label_fallback: text("label_fallback"),
  label_diff_json: text("label_diff_json"),
}, (t) => [primaryKey({ columns: [t.snapshot_id, t.dataset_id, t.source_route_id] })]);

/** Lossless normalized mirror of route_activity.jsonl. It deliberately remains separate from
 * inventory so the loader/verifier can prove the two declared artifacts agree field-for-field. */
export const ref_gtfs_route_activity = sqliteTable("ref_gtfs_route_activity", {
  snapshot_id: text("snapshot_id").notNull().references(() => ref_gtfs_snapshots.snapshot_id),
  dataset_id: text("dataset_id").notNull(),
  source_route_id: text("source_route_id").notNull(),
  gtfs_route_id: text("gtfs_route_id").notNull(),
  component_feed_ids_json: text("component_feed_ids_json").notNull(),
  scheduled_service_dates_json: text("scheduled_service_dates_json").notNull(),
  scheduled_trip_template_date_count: integer("scheduled_trip_template_date_count").notNull(),
  scheduled_in_window: text("scheduled_in_window").notNull(),
  reliability_status: text("reliability_status").notNull(),
  frequencies_present: integer("frequencies_present").notNull(),
}, (t) => [primaryKey({ columns: [t.snapshot_id, t.dataset_id, t.source_route_id] })]);

/** Complete point-in-time Current Bus Routes universe, distinct from GTFS declaration/activity. */
export const ref_current_bus_route_catalog = sqliteTable("ref_current_bus_route_catalog", {
  snapshot_id: text("snapshot_id").notNull().references(() => ref_gtfs_snapshots.snapshot_id),
  exact_route_id: text("exact_route_id").notNull(),
  schema_version: integer("schema_version").notNull(),
  contract_id: text("contract_id").notNull(),
  dataset_id: text("dataset_id").notNull(),
  artifact_sha256: text("artifact_sha256").notNull(),
  route_short_name: text("route_short_name"),
  route_long_name: text("route_long_name"),
  route_description: text("route_description"),
  effective_as_of_date: text("effective_as_of_date").notNull(),
  valid_from: text("valid_from").notNull(),
  valid_to: text("valid_to").notNull(),
  in_effect: text("in_effect").notNull(),
  designation_literals_json: text("designation_literals_json").notNull(),
  normalized_service_modes_json: text("normalized_service_modes_json").notNull(),
  source_row_count: integer("source_row_count").notNull(),
}, (t) => [primaryKey({ columns: [t.snapshot_id, t.exact_route_id] })]);

/** Exact symmetric-difference ledger between the two source-defined identity universes. */
export const ref_gtfs_catalog_disagreements = sqliteTable("ref_gtfs_catalog_disagreements", {
  snapshot_id: text("snapshot_id").notNull().references(() => ref_gtfs_snapshots.snapshot_id),
  disagreement_type: text("disagreement_type").notNull(),
  exact_route_id: text("exact_route_id").notNull(),
  schema_version: integer("schema_version").notNull(),
  contract_id: text("contract_id").notNull(),
  comparison_basis: text("comparison_basis").notNull(),
  equality_claim: integer("equality_claim").notNull(),
  catalog_dataset_id: text("catalog_dataset_id").notNull(),
  catalog_effective_as_of_date: text("catalog_effective_as_of_date").notNull(),
  catalog_route_id: text("catalog_route_id"),
  gtfs_snapshot_id: text("gtfs_snapshot_id").notNull(),
  gtfs_as_of_date: text("gtfs_as_of_date").notNull(),
  gtfs_dataset_id: text("gtfs_dataset_id"),
  gtfs_source_route_id: text("gtfs_source_route_id"),
}, (t) => [primaryKey({ columns: [t.snapshot_id, t.disagreement_type, t.exact_route_id] })]);


import type { SQLiteTable, SQLiteView } from "drizzle-orm/sqlite-core";

/** Every canonical table by SQL name — projection + validator lookup. */
export const tablesByName: Record<string, SQLiteTable> = {
  records, sources, entities, projects, corridors, routes, treatment_components, events, claims,
  metric_claims, source_gaps, relations, record_sources, record_local_observations,
  record_submissions, record_aliases, evidence_block_registry, evidence_refs, canonical_db_state,
  identity_aliases, do_not_merge,
  relationship_contract_rules, canonical_identities, relationship_validation_findings,
  relationship_dispositions, relationship_disposition_evidence, relationship_completeness_waivers,
  relationship_completeness_subjects, relationship_completeness_roles,
  relationship_completeness_findings, relationship_selector_contracts,
  relationship_enforcement_state,
  payload_value_conflicts, ref_gtfs_routes, ref_agencies, ref_gtfs_snapshots,
  ref_gtfs_route_inventory, ref_gtfs_route_activity, ref_current_bus_route_catalog,
  ref_gtfs_catalog_disagreements,
};

// ---- Views (S3.4): authored here as the single surface; bodies are the exact prior SELECTs
// (semantic row-set equality is the gate, not DDL bytes). schema-ddl.ts renders CREATE VIEW.

export const duplicate_relations_view = sqliteView("duplicate_relations", {}).as(sql`
  SELECT relation_kind, subject_id, object_id, COUNT(*) AS edge_count, GROUP_CONCAT(record_id) AS record_ids
  FROM relations GROUP BY relation_kind, subject_id, object_id HAVING COUNT(*) > 1`);

export const orphan_records_view = sqliteView("orphan_records", {}).as(sql`
  SELECT r.record_id, r.record_kind FROM records r
  LEFT JOIN relations e ON e.subject_id = r.record_id OR e.object_id = r.record_id
  WHERE e.record_id IS NULL AND r.record_kind NOT IN ('relation','source')`);

export const gtfs_routes_uncovered_view = sqliteView("gtfs_routes_uncovered", {}).as(sql`
  SELECT g.route_id, g.short_name, g.borough, g.gtfs_feed_date FROM ref_gtfs_routes g
  LEFT JOIN routes r ON lower(r.route_id) = lower(g.route_id) OR lower(r.route_id) = lower(g.short_name)
  WHERE r.record_id IS NULL`);

export const canonical_routes_uncovered_view = sqliteView("canonical_routes_uncovered", {}).as(sql`
  SELECT r.record_id, r.route_id FROM routes r
  LEFT JOIN ref_gtfs_routes g ON lower(g.route_id) = lower(r.route_id) OR lower(g.short_name) = lower(r.route_id)
  WHERE r.route_id IS NOT NULL AND g.route_id IS NULL`);

export const lifecycle_entries_view = sqliteView("lifecycle_entries", {}).as(sql`
  SELECT
    ev.record_id AS event_record_id,
    e.lifecycle_phase, e.date_normalized, e.date_precision,
    ev.primary_source_id AS source_id,
    (SELECT er.block_id FROM evidence_refs er WHERE er.record_id = ev.record_id ORDER BY er.ordinal LIMIT 1) AS evidence_block,
    rel.subject_id AS subject_record_id,
    subj.record_kind AS subject_kind,
    CASE WHEN subj.record_kind = 'project' THEN subj.record_id END AS project_record_id,
    CASE WHEN subj.record_kind = 'route' THEN subj.record_id END AS route_record_id,
    CASE WHEN subj.record_kind = 'treatment_component' THEN subj.record_id END AS treatment_record_id,
    proj.document_time_status,
    rel.assertion_status, rel.as_of_date
  FROM records ev
  JOIN events e ON e.record_id = ev.record_id
  JOIN relations rel ON rel.object_id = ev.record_id AND rel.relation_kind = 'has_timeline_event'
  JOIN records subj ON subj.record_id = rel.subject_id
  LEFT JOIN projects proj ON proj.record_id = subj.record_id
  WHERE ev.record_kind = 'event'`);

export const route_timeline_view = sqliteView("route_timeline", {}).as(sql`
  SELECT route_record_id, 'event' AS entry_kind, event_record_id AS entry_record_id,
         lifecycle_phase AS label, date_normalized, date_precision, assertion_status, as_of_date, source_id
  FROM lifecycle_entries WHERE route_record_id IS NOT NULL
  UNION ALL
  SELECT sj.record_id AS route_record_id, 'treatment', rel.object_id,
         tc.treatment_family AS label, NULL, NULL, rel.assertion_status, rel.as_of_date, ob.primary_source_id
  FROM relations rel
  JOIN records sj ON sj.record_id = rel.subject_id AND sj.record_kind = 'route'
  JOIN records ob ON ob.record_id = rel.object_id
  LEFT JOIN treatment_components tc ON tc.record_id = rel.object_id
  WHERE rel.relation_kind = 'has_treatment'`);

export const resolved_status_view = sqliteView("resolved_status", {}).as(sql`
  SELECT subject_record_id, subject_kind, lifecycle_phase, date_normalized, as_of_date, source_id, evidence_block
  FROM (
    SELECT le.*, ROW_NUMBER() OVER (
      PARTITION BY subject_record_id
      ORDER BY COALESCE(as_of_date, date_normalized, '') DESC, date_normalized DESC, event_record_id DESC
    ) AS rn
    FROM lifecycle_entries le
    WHERE lifecycle_phase IS NOT NULL AND lifecycle_phase != 'other'
  ) WHERE rn = 1`);

export const date_unnormalized_view = sqliteView("date_unnormalized", {}).as(sql`
  SELECT ev.record_id, ev.record_kind, e.date_text, e."date", e.event_date
  FROM records ev JOIN events e ON e.record_id = ev.record_id
  WHERE e.date_normalized IS NULL AND (e.date_text IS NOT NULL OR e."date" IS NOT NULL OR e.event_date IS NOT NULL)`);

export const metric_conflicts_view = sqliteView("metric_conflicts", {}).as(sql`
  SELECT pvc.field, COUNT(DISTINCT pvc.record_id) AS records_with_conflict, COUNT(*) AS conflicting_values
  FROM payload_value_conflicts pvc
  JOIN records r ON r.record_id = pvc.record_id
  GROUP BY pvc.field
  ORDER BY records_with_conflict DESC, pvc.field`);

export const comparable_metrics_view = sqliteView("comparable_metrics", {}).as(sql`
  SELECT m.metric_name,
         json_extract(r.payload, '$.unit_normalized.unit_family') AS unit_family,
         COUNT(*) AS metric_count,
         COUNT(DISTINCT r.primary_source_id) AS source_count,
         GROUP_CONCAT(DISTINCT r.record_id) AS record_ids
  FROM metric_claims m JOIN records r ON r.record_id = m.record_id
  WHERE m.metric_name IS NOT NULL
  GROUP BY m.metric_name, unit_family
  HAVING COUNT(*) > 1
  ORDER BY metric_count DESC, m.metric_name`);

export const corroboration_view = sqliteView("corroboration", {}).as(sql`
  SELECT
    r.record_id, r.record_kind,
    COUNT(DISTINCT rs.source_id) AS source_count,
    MAX(CASE s.authority_tier
      WHEN 'official_evaluation' THEN 5 WHEN 'board_material' THEN 4 WHEN 'plan_document' THEN 3
      WHEN 'dataset_documentation' THEN 2 WHEN 'press_release' THEN 1 ELSE 0 END) AS max_authority_rank,
    CASE
      WHEN MAX(CASE s.authority_tier WHEN 'official_evaluation' THEN 5 WHEN 'board_material' THEN 4 ELSE 0 END) >= 4
           AND COUNT(DISTINCT rs.source_id) >= 2 THEN 'officially_confirmed'
      WHEN MAX(CASE s.authority_tier WHEN 'official_evaluation' THEN 5 WHEN 'board_material' THEN 4 ELSE 0 END) >= 4 THEN 'single_official'
      ELSE 'source_only'
    END AS confirmation_level
  FROM records r
  JOIN record_sources rs ON rs.record_id = r.record_id
  LEFT JOIN records sr ON sr.record_kind = 'source' AND sr.primary_source_id = rs.source_id
  LEFT JOIN sources s ON s.record_id = sr.record_id
  WHERE r.record_kind NOT IN ('relation', 'source')
  GROUP BY r.record_id, r.record_kind`);

export const relationship_endpoint_violations_view = sqliteView("relationship_endpoint_violations", {}).as(sql`
  SELECT rel.record_id, rel.relation_kind, rel.subject_id, rel.object_id,
         CASE WHEN subject.record_id IS NULL THEN 'subject' WHEN object.record_id IS NULL THEN 'object' END AS endpoint_role
  FROM relations rel
  LEFT JOIN records subject ON subject.record_id = rel.subject_id
  LEFT JOIN records object ON object.record_id = rel.object_id
  WHERE subject.record_id IS NULL OR object.record_id IS NULL`);

export const relationship_type_violations_view = sqliteView("relationship_type_violations", {}).as(sql`
  SELECT rel.record_id, rel.relation_kind, rel.relation_family,
         subject.record_kind AS subject_kind, object.record_kind AS object_kind
  FROM relations rel
  JOIN records subject ON subject.record_id = rel.subject_id
  JOIN records object ON object.record_id = rel.object_id
  LEFT JOIN relationship_contract_rules rule
    ON rule.contract_id = 'relationship-contract-v1'
   AND rule.relation_kind = rel.relation_kind
   AND rule.relation_family = rel.relation_family
   AND rule.subject_kind = subject.record_kind
   AND rule.object_kind = object.record_kind
  WHERE rule.relation_kind IS NULL`);

export const relationship_evidence_violations_view = sqliteView("relationship_evidence_violations", {}).as(sql`
  SELECT rel.record_id, rel.relation_kind,
         COUNT(ev.ordinal) AS evidence_count,
         SUM(CASE WHEN registry.source_id IS NULL THEN 1 ELSE 0 END) AS invalid_evidence_count
  FROM relations rel
  LEFT JOIN evidence_refs ev ON ev.record_id = rel.record_id
  LEFT JOIN evidence_block_registry registry
    ON registry.source_id = ev.source_id
   AND registry.block_id = ev.block_id
   AND registry.resolved_block_id = ev.resolved_block_id
   AND registry.page_number = ev.page_number
   AND registry.evidence_id = ev.evidence_id
   AND registry.source_path = ev.source_path
   AND registry.raw_text_sha256 = ev.text_sha256
  GROUP BY rel.record_id, rel.relation_kind
  HAVING COUNT(ev.ordinal) = 0 OR invalid_evidence_count > 0`);

export const relationship_identity_ambiguities_view = sqliteView("relationship_identity_ambiguities", {}).as(sql`
  SELECT identity_class, identity_value, COUNT(DISTINCT canonical_record_id) AS target_count,
         GROUP_CONCAT(canonical_record_id) AS canonical_record_ids
  FROM canonical_identities
  GROUP BY identity_class, identity_value
  HAVING COUNT(DISTINCT canonical_record_id) > 1`);

export const relationship_sql_diagnostics_view = sqliteView("relationship_sql_diagnostics", {}).as(sql`
  SELECT 'REL_ENDPOINT_DANGLING' AS code, record_id, endpoint_role AS detail FROM relationship_endpoint_violations
  UNION ALL
  SELECT 'REL_ENDPOINT_TYPE_INVALID', record_id, subject_kind || '->' || object_kind FROM relationship_type_violations
  UNION ALL
  SELECT 'REL_EVIDENCE_UNRESOLVED', record_id, CAST(invalid_evidence_count AS TEXT) FROM relationship_evidence_violations
  UNION ALL
  SELECT 'REL_ALIAS_AMBIGUOUS', NULL, identity_class || ':' || identity_value FROM relationship_identity_ambiguities`);

export const relationship_disposition_evidence_violations_view = sqliteView("relationship_disposition_evidence_violations", {}).as(sql`
  SELECT d.decision_id, d.record_id,
         COUNT(de.ordinal) AS cited_evidence_count,
         SUM(CASE WHEN ev.record_id IS NULL THEN 1 ELSE 0 END) AS unresolved_evidence_count
  FROM relationship_dispositions d
  LEFT JOIN relationship_disposition_evidence de ON de.decision_id = d.decision_id
  LEFT JOIN evidence_refs ev ON ev.record_id = d.record_id AND ev.evidence_id = de.evidence_id
  GROUP BY d.decision_id, d.record_id
  HAVING COUNT(de.ordinal) = 0 OR unresolved_evidence_count > 0`);

export const relationship_completeness_role_violations_view = sqliteView("relationship_completeness_role_violations", {}).as(sql`
  SELECT role.contract_id, role.selector, role.subject_id, role.role, role.binding_count,
         subject.study_projectable, waiver.decision_id AS disposition_decision_id
  FROM relationship_completeness_roles role
  JOIN relationship_completeness_subjects subject
    ON subject.contract_id = role.contract_id
   AND subject.selector = role.selector
   AND subject.subject_id = role.subject_id
  LEFT JOIN relationship_completeness_waivers waiver
    ON waiver.contract_id = role.contract_id
   AND waiver.selector = role.selector
   AND waiver.record_id = subject.canonical_record_id
   AND waiver.role = role.role
  WHERE role.role_status = 'missing'
    AND (subject.study_projectable = 1 OR waiver.decision_id IS NULL)`);

export const relationship_completeness_selector_violations_view = sqliteView("relationship_completeness_selector_violations", {}).as(sql`
  SELECT contract.contract_id, contract.selector, contract.expected_count, contract.actual_count,
         COUNT(subject.subject_id) AS mirrored_subject_count
  FROM relationship_selector_contracts contract
  LEFT JOIN relationship_completeness_subjects subject
    ON subject.contract_id = contract.contract_id AND subject.selector = contract.selector
  GROUP BY contract.contract_id, contract.selector, contract.expected_count, contract.actual_count
  HAVING contract.expected_count != contract.actual_count OR contract.actual_count != mirrored_subject_count`);

export const relationship_completeness_sql_diagnostics_view = sqliteView("relationship_completeness_sql_diagnostics", {}).as(sql`
  SELECT code, selector, subject_id, 'authoritative_warning_mirror' AS detail
  FROM relationship_completeness_findings
  UNION ALL
  SELECT 'RC_ROLE_CARDINALITY_INVALID', selector, subject_id, role || ':' || CAST(binding_count AS TEXT)
  FROM relationship_completeness_role_violations
  UNION ALL
  SELECT 'RC_SELECTOR_COUNT_MISMATCH', selector, NULL,
         CAST(expected_count AS TEXT) || ':' || CAST(actual_count AS TEXT) || ':' || CAST(mirrored_subject_count AS TEXT)
  FROM relationship_completeness_selector_violations
  UNION ALL
  SELECT 'RC_DISPOSITION_EVIDENCE_UNRESOLVED', 'relationship_disposition', record_id, decision_id
  FROM relationship_disposition_evidence_violations`);

export const CANONICAL_VIEWS: SQLiteView[] = [duplicate_relations_view, orphan_records_view, gtfs_routes_uncovered_view, canonical_routes_uncovered_view, lifecycle_entries_view, route_timeline_view, resolved_status_view, date_unnormalized_view, metric_conflicts_view, comparable_metrics_view, corroboration_view, relationship_endpoint_violations_view, relationship_type_violations_view, relationship_evidence_violations_view, relationship_identity_ambiguities_view, relationship_sql_diagnostics_view, relationship_disposition_evidence_violations_view, relationship_completeness_role_violations_view, relationship_completeness_selector_violations_view, relationship_completeness_sql_diagnostics_view];
