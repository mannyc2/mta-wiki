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

export const evidence_refs = sqliteTable("evidence_refs", {
  record_id: text("record_id").notNull().references(() => records.record_id),
  ordinal: integer("ordinal").notNull(),
  ref_json: text("ref_json").notNull(),
  source_id: text("source_id").notNull(),
  block_id: text("block_id"),
  page_number: integer("page_number"),
}, (t) => [primaryKey({ columns: [t.record_id, t.ordinal] })]);

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


import type { SQLiteTable, SQLiteView } from "drizzle-orm/sqlite-core";

/** Every canonical table by SQL name — projection + validator lookup. */
export const tablesByName: Record<string, SQLiteTable> = {
  records, sources, entities, projects, corridors, routes, treatment_components, events, claims,
  metric_claims, source_gaps, relations, record_sources, record_local_observations,
  record_submissions, record_aliases, evidence_refs, identity_aliases, do_not_merge,
  payload_value_conflicts, ref_gtfs_routes, ref_agencies,
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

export const CANONICAL_VIEWS: SQLiteView[] = [duplicate_relations_view, orphan_records_view, gtfs_routes_uncovered_view, canonical_routes_uncovered_view, lifecycle_entries_view, route_timeline_view, resolved_status_view, date_unnormalized_view, metric_conflicts_view, comparable_metrics_view, corroboration_view];
