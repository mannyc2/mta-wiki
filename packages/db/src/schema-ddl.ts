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
  record_submissions, record_aliases, evidence_block_registry, evidence_refs, canonical_db_state,
  identity_aliases, do_not_merge,
  relationship_contract_rules, canonical_identities, relationship_validation_findings, payload_value_conflicts,
  relationship_dispositions, relationship_disposition_evidence, relationship_completeness_waivers,
  relationship_completeness_subjects, relationship_completeness_roles,
  relationship_completeness_findings, relationship_selector_contracts,
  relationship_enforcement_state,
  ref_gtfs_routes, ref_agencies, CANONICAL_VIEWS,
} from "./schema.js";
import {
  RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS,
  RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID,
  RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR,
} from "./relationship-completeness-contract.js";
import { RELATIONSHIP_CONTRACT_POLICY_V1 } from "./relationship-contract.js";

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
  relationship_contract_rules: {
    review_basis:
      "review_basis IN ('existing_exact_rule','frozen_observed_shape','reviewed_post_remediation')",
  },
  canonical_identities: {
    identity_class: "identity_class IN ('canonical','record_alias','local_observation','override_alias','superseded')",
    resolution_status: "resolution_status IN ('canonical','unique','ambiguous','superseded')",
  },
  relationship_validation_findings: {
    severity: "severity IN ('info','warning','error')",
  },
  relationship_dispositions: {
    study_projectable: "study_projectable IN (0,1)",
    waiver: "waiver IN (0,1) AND NOT (waiver = 1 AND study_projectable = 1)",
  },
  relationship_completeness_subjects: {
    study_projectable: "study_projectable IN (0,1)",
  },
  relationship_completeness_roles: {
    role_status: "role_status IN ('satisfied','missing','not_applicable')",
    binding_count: "binding_count >= 0",
  },
  relationship_completeness_findings: {
    severity: "severity IN ('warning','error')",
  },
  relationship_selector_contracts: {
    expected_count: "expected_count >= 0",
    actual_count: "actual_count >= 0",
    enforcement_eligible: "enforcement_eligible IN (0,1)",
  },
  relationship_enforcement_state: {
    mode: "mode IN ('warning','enforce')",
    hard_mode_ready: "hard_mode_ready IN (0,1)",
  },
  evidence_block_registry: {
    page_number: "page_number >= 1",
    evidence_id: "evidence_id = source_id || '#' || block_id",
    source_path: "source_path = 'raw/sources/' || source_id || '/blocks.jsonl'",
    raw_text_sha256: "length(raw_text_sha256) = 71 AND raw_text_sha256 LIKE 'sha256:%'",
  },
  canonical_db_state: {
    state_key: "state_key = 'canonical'",
    sealed: "sealed IN (0,1)",
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

const EVIDENCE_REGISTRY_INDEXES: IndexSpec[] = [
  { name: "idx_evidence_registry_resolved", table: "evidence_block_registry", columns: ["source_id", "resolved_block_id"], quoted: false },
  { name: "idx_evidence_registry_identity", table: "evidence_block_registry", columns: ["evidence_id"], quoted: false },
];

const CONTRACT_INDEXES: IndexSpec[] = [
  { name: "idx_relationship_contract_lookup", table: "relationship_contract_rules", columns: ["relation_kind", "relation_family", "subject_kind", "object_kind"], quoted: false },
];

const IDENTITY_INDEXES: IndexSpec[] = [
  { name: "idx_canonical_identity_lookup", table: "canonical_identities", columns: ["identity_class", "identity_value"], quoted: false },
  { name: "idx_canonical_identity_target", table: "canonical_identities", columns: ["canonical_record_id"], quoted: false },
];

const RELATIONSHIP_FINDING_INDEXES: IndexSpec[] = [
  { name: "idx_relationship_findings_code", table: "relationship_validation_findings", columns: ["code", "severity"], quoted: false },
  { name: "idx_relationship_findings_record", table: "relationship_validation_findings", columns: ["record_id"], quoted: false },
];

const RELATIONSHIP_COMPLETENESS_INDEXES: IndexSpec[] = [
  { name: "idx_relationship_dispositions_record", table: "relationship_dispositions", columns: ["record_id", "selector"], quoted: false },
  { name: "idx_relationship_disposition_evidence_id", table: "relationship_disposition_evidence", columns: ["evidence_id"], quoted: false },
  { name: "idx_relationship_completeness_waiver_scope", table: "relationship_completeness_waivers", columns: ["contract_id", "selector", "record_id", "role"], quoted: false },
  { name: "idx_relationship_completeness_subject", table: "relationship_completeness_subjects", columns: ["selector", "subject_id"], quoted: false },
  { name: "idx_relationship_completeness_role", table: "relationship_completeness_roles", columns: ["selector", "role", "role_status"], quoted: false },
  { name: "idx_relationship_completeness_findings_code", table: "relationship_completeness_findings", columns: ["code", "selector"], quoted: false },
];

const COMPLETENESS_SELECTOR_SQL = RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS
  .map((selector) => `'${selector}'`)
  .join(",");

/** Enforce-mode SQLite must not trust a caller-provided readiness bit while the same snapshot
 * still mirrors a promotion-blocking repository finding. Derive the SQL list from the versioned
 * relationship contract so repository and derived-store enforcement cannot drift independently. */
const RELATIONSHIP_ENFORCEMENT_FINDING_SQL = Object.entries(
  RELATIONSHIP_CONTRACT_POLICY_V1.finding_codes,
)
  .filter(([, config]) => config.enforcement_eligible)
  .map(([code]) => `'${code}'`)
  .sort()
  .join(",");

const RELATIONSHIP_ENFORCEMENT_GRAPH_BACKLOG_SQL = `(
  EXISTS (SELECT 1 FROM relationship_sql_diagnostics)
  OR EXISTS (
    SELECT 1 FROM relationship_validation_findings finding
    WHERE finding.severity = 'error'
       OR finding.code IN (${RELATIONSHIP_ENFORCEMENT_FINDING_SQL})
  )
)`;

// Derived-store defense in depth. Authoritative JSONL is gated in the materializer first; these
// triggers ensure no alternate SQLite builder can insert an untyped or evidence-free edge.
const RELATIONSHIP_TRIGGERS = [
  `CREATE TRIGGER evidence_refs_json_parity_insert
  BEFORE INSERT ON evidence_refs
  BEGIN
    SELECT CASE WHEN CASE
      WHEN json_valid(NEW.ref_json) != 1 THEN 1
      WHEN json_type(NEW.ref_json, '$.source_id') != 'text'
        OR json_extract(NEW.ref_json, '$.source_id') IS NOT NEW.source_id THEN 1
      WHEN json_type(NEW.ref_json, '$.block_id') != 'text'
        OR json_extract(NEW.ref_json, '$.block_id') IS NOT NEW.block_id THEN 1
      WHEN json_type(NEW.ref_json, '$.page_number') != 'integer'
        OR json_extract(NEW.ref_json, '$.page_number') IS NOT NEW.page_number THEN 1
      WHEN json_type(NEW.ref_json, '$.evidence_id') != 'text'
        OR json_extract(NEW.ref_json, '$.evidence_id') IS NOT NEW.evidence_id THEN 1
      WHEN json_type(NEW.ref_json, '$.source_path') != 'text'
        OR json_extract(NEW.ref_json, '$.source_path') IS NOT NEW.source_path THEN 1
      WHEN json_type(NEW.ref_json, '$.text_sha256') != 'text'
        OR json_extract(NEW.ref_json, '$.text_sha256') IS NOT NEW.text_sha256 THEN 1
      WHEN json_type(NEW.ref_json, '$.resolved_block_id') IS NOT NULL
        AND (json_type(NEW.ref_json, '$.resolved_block_id') != 'text'
          OR json_extract(NEW.ref_json, '$.resolved_block_id') IS NOT NEW.resolved_block_id) THEN 1
      WHEN json_type(NEW.ref_json, '$.role') IS NULL AND NEW.role IS NOT NULL THEN 1
      WHEN json_type(NEW.ref_json, '$.role') IS NOT NULL
        AND (json_type(NEW.ref_json, '$.role') != 'text'
          OR json_extract(NEW.ref_json, '$.role') IS NOT NEW.role) THEN 1
      ELSE 0 END = 1
    THEN RAISE(ABORT, 'EVIDENCE_REF_JSON_MISMATCH') END;
  END;`,
  `CREATE TRIGGER evidence_refs_json_parity_update
  BEFORE UPDATE ON evidence_refs
  BEGIN
    SELECT CASE WHEN CASE
      WHEN json_valid(NEW.ref_json) != 1 THEN 1
      WHEN json_type(NEW.ref_json, '$.source_id') != 'text'
        OR json_extract(NEW.ref_json, '$.source_id') IS NOT NEW.source_id THEN 1
      WHEN json_type(NEW.ref_json, '$.block_id') != 'text'
        OR json_extract(NEW.ref_json, '$.block_id') IS NOT NEW.block_id THEN 1
      WHEN json_type(NEW.ref_json, '$.page_number') != 'integer'
        OR json_extract(NEW.ref_json, '$.page_number') IS NOT NEW.page_number THEN 1
      WHEN json_type(NEW.ref_json, '$.evidence_id') != 'text'
        OR json_extract(NEW.ref_json, '$.evidence_id') IS NOT NEW.evidence_id THEN 1
      WHEN json_type(NEW.ref_json, '$.source_path') != 'text'
        OR json_extract(NEW.ref_json, '$.source_path') IS NOT NEW.source_path THEN 1
      WHEN json_type(NEW.ref_json, '$.text_sha256') != 'text'
        OR json_extract(NEW.ref_json, '$.text_sha256') IS NOT NEW.text_sha256 THEN 1
      WHEN json_type(NEW.ref_json, '$.resolved_block_id') IS NOT NULL
        AND (json_type(NEW.ref_json, '$.resolved_block_id') != 'text'
          OR json_extract(NEW.ref_json, '$.resolved_block_id') IS NOT NEW.resolved_block_id) THEN 1
      WHEN json_type(NEW.ref_json, '$.role') IS NULL AND NEW.role IS NOT NULL THEN 1
      WHEN json_type(NEW.ref_json, '$.role') IS NOT NULL
        AND (json_type(NEW.ref_json, '$.role') != 'text'
          OR json_extract(NEW.ref_json, '$.role') IS NOT NEW.role) THEN 1
      ELSE 0 END = 1
    THEN RAISE(ABORT, 'EVIDENCE_REF_JSON_MISMATCH') END;
  END;`,
  `CREATE TRIGGER evidence_refs_registry_insert
  BEFORE INSERT ON evidence_refs
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1
      FROM evidence_block_registry registry
      WHERE registry.source_id = NEW.source_id
        AND registry.block_id = NEW.block_id
        AND registry.resolved_block_id = NEW.resolved_block_id
        AND registry.page_number = NEW.page_number
        AND registry.evidence_id = NEW.evidence_id
        AND registry.source_path = NEW.source_path
        AND registry.raw_text_sha256 = NEW.text_sha256
    ) THEN RAISE(ABORT, 'EVIDENCE_REGISTRY_MISMATCH') END;
  END;`,
  `CREATE TRIGGER evidence_refs_registry_update
  BEFORE UPDATE OF source_id, block_id, resolved_block_id, page_number, evidence_id, source_path, text_sha256 ON evidence_refs
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1
      FROM evidence_block_registry registry
      WHERE registry.source_id = NEW.source_id
        AND registry.block_id = NEW.block_id
        AND registry.resolved_block_id = NEW.resolved_block_id
        AND registry.page_number = NEW.page_number
        AND registry.evidence_id = NEW.evidence_id
        AND registry.source_path = NEW.source_path
        AND registry.raw_text_sha256 = NEW.text_sha256
    ) THEN RAISE(ABORT, 'EVIDENCE_REGISTRY_MISMATCH') END;
  END;`,
  `CREATE TRIGGER relations_payload_parity_insert
  BEFORE INSERT ON relations
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM records record
      WHERE record.record_id = NEW.record_id
        AND record.record_kind = 'relation'
        AND CASE
          WHEN json_valid(record.payload) != 1 THEN 0
          WHEN json_type(record.payload, '$.relation_kind') != 'text'
            OR json_extract(record.payload, '$.relation_kind') IS NOT NEW.relation_kind THEN 0
          WHEN json_type(record.payload, '$.relation_family') != 'text'
            OR json_extract(record.payload, '$.relation_family') IS NOT NEW.relation_family THEN 0
          WHEN json_type(record.payload, '$.subject_id') != 'text'
            OR json_extract(record.payload, '$.subject_id') IS NOT NEW.subject_id THEN 0
          WHEN json_type(record.payload, '$.object_id') != 'text'
            OR json_extract(record.payload, '$.object_id') IS NOT NEW.object_id THEN 0
          ELSE 1 END = 1
    ) THEN RAISE(ABORT, 'REL_PAYLOAD_EDGE_MISMATCH') END;
  END;`,
  `CREATE TRIGGER relations_payload_parity_update
  BEFORE UPDATE ON relations
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM records record
      WHERE record.record_id = NEW.record_id
        AND record.record_kind = 'relation'
        AND CASE
          WHEN json_valid(record.payload) != 1 THEN 0
          WHEN json_type(record.payload, '$.relation_kind') != 'text'
            OR json_extract(record.payload, '$.relation_kind') IS NOT NEW.relation_kind THEN 0
          WHEN json_type(record.payload, '$.relation_family') != 'text'
            OR json_extract(record.payload, '$.relation_family') IS NOT NEW.relation_family THEN 0
          WHEN json_type(record.payload, '$.subject_id') != 'text'
            OR json_extract(record.payload, '$.subject_id') IS NOT NEW.subject_id THEN 0
          WHEN json_type(record.payload, '$.object_id') != 'text'
            OR json_extract(record.payload, '$.object_id') IS NOT NEW.object_id THEN 0
          ELSE 1 END = 1
    ) THEN RAISE(ABORT, 'REL_PAYLOAD_EDGE_MISMATCH') END;
  END;`,
  `CREATE TRIGGER records_relation_payload_parity_update
  BEFORE UPDATE OF payload, record_kind ON records
  WHEN EXISTS (SELECT 1 FROM relations relation WHERE relation.record_id = OLD.record_id)
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM relations relation
      WHERE relation.record_id = OLD.record_id
        AND NEW.record_kind = 'relation'
        AND CASE
          WHEN json_valid(NEW.payload) != 1 THEN 0
          WHEN json_type(NEW.payload, '$.relation_kind') != 'text'
            OR json_extract(NEW.payload, '$.relation_kind') IS NOT relation.relation_kind THEN 0
          WHEN json_type(NEW.payload, '$.relation_family') != 'text'
            OR json_extract(NEW.payload, '$.relation_family') IS NOT relation.relation_family THEN 0
          WHEN json_type(NEW.payload, '$.subject_id') != 'text'
            OR json_extract(NEW.payload, '$.subject_id') IS NOT relation.subject_id THEN 0
          WHEN json_type(NEW.payload, '$.object_id') != 'text'
            OR json_extract(NEW.payload, '$.object_id') IS NOT relation.object_id THEN 0
          ELSE 1 END = 1
    ) THEN RAISE(ABORT, 'REL_PAYLOAD_EDGE_MISMATCH') END;
  END;`,
  `CREATE TRIGGER relations_type_contract_insert
  BEFORE INSERT ON relations
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1
      FROM records subject
      JOIN records object ON object.record_id = NEW.object_id
      JOIN relationship_contract_rules rule
        ON rule.contract_id = 'relationship-contract-v1'
       AND rule.relation_kind = NEW.relation_kind
       AND rule.relation_family = NEW.relation_family
       AND rule.subject_kind = subject.record_kind
       AND rule.object_kind = object.record_kind
      WHERE subject.record_id = NEW.subject_id
    ) THEN RAISE(ABORT, 'REL_ENDPOINT_TYPE_INVALID') END;
  END;`,
  `CREATE TRIGGER relations_type_contract_update
  BEFORE UPDATE OF relation_kind, relation_family, subject_id, object_id ON relations
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1
      FROM records subject
      JOIN records object ON object.record_id = NEW.object_id
      JOIN relationship_contract_rules rule
        ON rule.contract_id = 'relationship-contract-v1'
       AND rule.relation_kind = NEW.relation_kind
       AND rule.relation_family = NEW.relation_family
       AND rule.subject_kind = subject.record_kind
       AND rule.object_kind = object.record_kind
      WHERE subject.record_id = NEW.subject_id
    ) THEN RAISE(ABORT, 'REL_ENDPOINT_TYPE_INVALID') END;
  END;`,
  `CREATE TRIGGER relations_evidence_contract_insert
  BEFORE INSERT ON relations
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1
      FROM evidence_refs evidence
      JOIN evidence_block_registry registry
        ON registry.source_id = evidence.source_id
       AND registry.block_id = evidence.block_id
       AND registry.resolved_block_id = evidence.resolved_block_id
       AND registry.page_number = evidence.page_number
       AND registry.evidence_id = evidence.evidence_id
       AND registry.source_path = evidence.source_path
       AND registry.raw_text_sha256 = evidence.text_sha256
      WHERE evidence.record_id = NEW.record_id
    ) THEN RAISE(ABORT, 'REL_EVIDENCE_UNRESOLVED') END;
  END;`,
  `CREATE TRIGGER relation_evidence_contract_update
  BEFORE UPDATE ON evidence_refs
  WHEN EXISTS (SELECT 1 FROM relations relation WHERE relation.record_id = NEW.record_id)
    OR EXISTS (SELECT 1 FROM relations relation WHERE relation.record_id = OLD.record_id)
  BEGIN
    SELECT CASE WHEN OLD.record_id != NEW.record_id
      AND EXISTS (SELECT 1 FROM relations relation WHERE relation.record_id = OLD.record_id)
      AND NOT EXISTS (
        SELECT 1 FROM evidence_refs evidence
        WHERE evidence.record_id = OLD.record_id AND evidence.ordinal != OLD.ordinal
      )
    THEN RAISE(ABORT, 'REL_EVIDENCE_UNRESOLVED') END;
  END;`,
  `CREATE TRIGGER relation_evidence_contract_delete
  BEFORE DELETE ON evidence_refs
  WHEN EXISTS (SELECT 1 FROM relations relation WHERE relation.record_id = OLD.record_id)
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM evidence_refs evidence
      WHERE evidence.record_id = OLD.record_id AND evidence.ordinal != OLD.ordinal
    ) THEN RAISE(ABORT, 'REL_EVIDENCE_UNRESOLVED') END;
  END;`,
  `CREATE TRIGGER relationship_dispositions_record_contract_insert
  BEFORE INSERT ON relationship_dispositions
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM records record
      WHERE record.record_id = NEW.record_id AND record.record_kind = NEW.record_kind
    ) THEN RAISE(ABORT, 'RC_DISPOSITION_RECORD_INVALID') END;
    SELECT CASE WHEN
      (NEW.selector = 'operational_event' AND NEW.record_kind != 'event') OR
      (NEW.selector = 'bus_lane_family_treatment' AND NEW.record_kind != 'treatment_component') OR
      (NEW.selector = 'route_identity' AND NEW.record_kind != 'route') OR
      (NEW.selector NOT IN ('operational_event','bus_lane_family_treatment','route_identity'))
    THEN RAISE(ABORT, 'RC_DISPOSITION_SELECTOR_INVALID') END;
  END;`,
  `CREATE TRIGGER relationship_disposition_evidence_contract_insert
  BEFORE INSERT ON relationship_disposition_evidence
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1
      FROM relationship_dispositions disposition
      JOIN evidence_refs evidence
        ON evidence.record_id = disposition.record_id
       AND evidence.evidence_id = NEW.evidence_id
      WHERE disposition.decision_id = NEW.decision_id
    ) THEN RAISE(ABORT, 'RC_DISPOSITION_EVIDENCE_UNRESOLVED') END;
  END;`,
  `CREATE TRIGGER relationship_completeness_waiver_contract_insert
  BEFORE INSERT ON relationship_completeness_waivers
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1
      FROM relationship_dispositions disposition
      JOIN json_each(disposition.decision_json, '$.required_roles_missing') allowed_role
        ON allowed_role.type = 'text' AND allowed_role.value = NEW.role
      WHERE disposition.decision_id = NEW.decision_id
        AND disposition.record_id = NEW.record_id
        AND disposition.waiver = 1
        AND disposition.study_projectable = 0
        AND NEW.contract_id = '${RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID}'
        AND NEW.selector = CASE disposition.selector
          WHEN 'operational_event' THEN '${RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR.operational_event}'
          WHEN 'bus_lane_family_treatment' THEN '${RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR.bus_lane_family_treatment}'
          WHEN 'route_identity' THEN '${RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR.route_identity}'
          ELSE NULL END
    ) THEN RAISE(ABORT, 'RC_WAIVER_SCOPE_INVALID') END;
  END;`,
  `CREATE TRIGGER relationship_completeness_waiver_contract_update
  BEFORE UPDATE ON relationship_completeness_waivers
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1
      FROM relationship_dispositions disposition
      JOIN json_each(disposition.decision_json, '$.required_roles_missing') allowed_role
        ON allowed_role.type = 'text' AND allowed_role.value = NEW.role
      WHERE disposition.decision_id = NEW.decision_id
        AND disposition.record_id = NEW.record_id
        AND disposition.waiver = 1
        AND disposition.study_projectable = 0
        AND NEW.contract_id = '${RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID}'
        AND NEW.selector = CASE disposition.selector
          WHEN 'operational_event' THEN '${RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR.operational_event}'
          WHEN 'bus_lane_family_treatment' THEN '${RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR.bus_lane_family_treatment}'
          WHEN 'route_identity' THEN '${RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR.route_identity}'
          ELSE NULL END
    ) THEN RAISE(ABORT, 'RC_WAIVER_SCOPE_INVALID') END;
  END;`,
];

const RELATIONSHIP_ENFORCEMENT_TRIGGERS = [
  `CREATE TRIGGER relationship_selector_contract_insert
  BEFORE INSERT ON relationship_selector_contracts
  BEGIN
    SELECT CASE WHEN NEW.contract_id != '${RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID}'
      OR NEW.selector NOT IN (${COMPLETENESS_SELECTOR_SQL})
      THEN RAISE(ABORT, 'RC_SELECTOR_CONTRACT_INVALID') END;
  END;`,
  `CREATE TRIGGER relationship_selector_contract_update
  BEFORE UPDATE ON relationship_selector_contracts
  BEGIN
    SELECT CASE WHEN NEW.contract_id != '${RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID}'
      OR NEW.selector NOT IN (${COMPLETENESS_SELECTOR_SQL})
      THEN RAISE(ABORT, 'RC_SELECTOR_CONTRACT_INVALID') END;
  END;`,
  `CREATE TRIGGER relationship_completeness_subject_contract_insert
  BEFORE INSERT ON relationship_completeness_subjects
  BEGIN
    SELECT CASE WHEN
      NEW.contract_id != '${RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID}' OR
      (NEW.subject_kind = 'operational_occurrence' AND
        (NEW.selector != 'eligible_operational_occurrence' OR NEW.canonical_record_id IS NOT NULL)) OR
      (NEW.subject_kind = 'treatment_component' AND
        (NEW.selector NOT IN ('eligible_occurrence_treatment_physicality','bus_lane_family_treatment') OR NOT EXISTS (
          SELECT 1 FROM records record
          WHERE record.record_id = NEW.canonical_record_id AND record.record_kind = 'treatment_component'
        ))) OR
      (NEW.subject_kind = 'event' AND
        (NEW.selector != 'operational_event_family' OR NOT EXISTS (
          SELECT 1 FROM records record
          WHERE record.record_id = NEW.canonical_record_id AND record.record_kind = 'event'
        ))) OR
      (NEW.subject_kind = 'route' AND
        (NEW.selector != 'route_identity' OR NOT EXISTS (
          SELECT 1 FROM records record
          WHERE record.record_id = NEW.canonical_record_id AND record.record_kind = 'route'
        ))) OR
      NEW.subject_kind NOT IN ('operational_occurrence','treatment_component','event','route')
    THEN RAISE(ABORT, 'RC_COMPLETENESS_SUBJECT_INVALID') END;
  END;`,
  `CREATE TRIGGER relationship_completeness_role_contract_insert
  BEFORE INSERT ON relationship_completeness_roles
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM relationship_completeness_subjects subject
      WHERE subject.contract_id = NEW.contract_id
        AND subject.selector = NEW.selector
        AND subject.subject_id = NEW.subject_id
    ) THEN RAISE(ABORT, 'RC_ROLE_SUBJECT_UNRESOLVED') END;
    SELECT CASE WHEN json_valid(NEW.record_ids_json) != 1
      OR json_type(NEW.record_ids_json) != 'array'
      THEN RAISE(ABORT, 'RC_ROLE_RECORD_IDS_INVALID') END;
    SELECT CASE WHEN
      (NEW.role_status = 'satisfied' AND NEW.binding_count < 1) OR
      (NEW.role_status IN ('missing','not_applicable') AND NEW.binding_count != 0)
      THEN RAISE(ABORT, 'RC_ROLE_CARDINALITY_INVALID') END;
    SELECT CASE WHEN json_array_length(NEW.record_ids_json) != NEW.binding_count
      OR (SELECT COUNT(DISTINCT item.value) FROM json_each(NEW.record_ids_json) item) != NEW.binding_count
      THEN RAISE(ABORT, 'RC_ROLE_CARDINALITY_INVALID') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM json_each(NEW.record_ids_json) item
      LEFT JOIN records record ON record.record_id = item.value
      WHERE item.type != 'text' OR record.record_id IS NULL
    ) THEN RAISE(ABORT, 'RC_ROLE_RECORD_UNRESOLVED') END;
  END;`,
  `CREATE TRIGGER relationship_completeness_finding_contract_insert
  BEFORE INSERT ON relationship_completeness_findings
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM relationship_completeness_subjects subject
      WHERE subject.contract_id = NEW.contract_id
        AND subject.selector = NEW.selector
        AND subject.subject_id = NEW.subject_id
    ) THEN RAISE(ABORT, 'RC_FINDING_SUBJECT_UNRESOLVED') END;
  END;`,
  `CREATE TRIGGER relationship_enforcement_state_insert
  BEFORE INSERT ON relationship_enforcement_state
  BEGIN
    SELECT CASE WHEN NEW.contract_id != '${RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID}'
      THEN RAISE(ABORT, 'RC_ENFORCEMENT_CONTRACT_INVALID') END;
    SELECT CASE WHEN NEW.hard_mode_ready != 1
      AND NEW.mode = 'enforce'
      THEN RAISE(ABORT, 'RC_ENFORCEMENT_CRITERIA_NOT_READY') END;
    SELECT CASE WHEN NEW.mode = 'enforce' AND (
      (SELECT COUNT(*) FROM relationship_selector_contracts) != ${RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS.length}
      OR (SELECT COUNT(*) FROM relationship_selector_contracts
          WHERE contract_id = NEW.contract_id
            AND selector IN (${COMPLETENESS_SELECTOR_SQL})) != ${RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS.length}
    ) THEN RAISE(ABORT, 'RC_ENFORCEMENT_SELECTOR_SET_INVALID') END;
    SELECT CASE WHEN NEW.mode = 'enforce' AND EXISTS (
      SELECT 1 FROM relationship_selector_contracts
      WHERE contract_id = NEW.contract_id AND enforcement_eligible != 1
    ) THEN RAISE(ABORT, 'RC_ENFORCEMENT_SELECTOR_NOT_ELIGIBLE') END;
    SELECT CASE WHEN NEW.mode = 'enforce'
      AND EXISTS (SELECT 1 FROM relationship_completeness_sql_diagnostics)
      THEN RAISE(ABORT, 'RC_ENFORCEMENT_BACKLOG_NONZERO') END;
    SELECT CASE WHEN NEW.mode = 'enforce'
      AND ${RELATIONSHIP_ENFORCEMENT_GRAPH_BACKLOG_SQL}
      THEN RAISE(ABORT, 'RC_ENFORCEMENT_GRAPH_BACKLOG_NONZERO') END;
  END;`,
  `CREATE TRIGGER relationship_enforcement_state_update
  BEFORE UPDATE ON relationship_enforcement_state
  BEGIN
    SELECT CASE WHEN NEW.contract_id != '${RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID}'
      THEN RAISE(ABORT, 'RC_ENFORCEMENT_CONTRACT_INVALID') END;
    SELECT CASE WHEN NEW.hard_mode_ready != 1
      AND NEW.mode = 'enforce'
      THEN RAISE(ABORT, 'RC_ENFORCEMENT_CRITERIA_NOT_READY') END;
    SELECT CASE WHEN NEW.mode = 'enforce' AND (
      (SELECT COUNT(*) FROM relationship_selector_contracts) != ${RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS.length}
      OR (SELECT COUNT(*) FROM relationship_selector_contracts
          WHERE contract_id = NEW.contract_id
            AND selector IN (${COMPLETENESS_SELECTOR_SQL})) != ${RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS.length}
    ) THEN RAISE(ABORT, 'RC_ENFORCEMENT_SELECTOR_SET_INVALID') END;
    SELECT CASE WHEN NEW.mode = 'enforce' AND EXISTS (
      SELECT 1 FROM relationship_selector_contracts
      WHERE contract_id = NEW.contract_id AND enforcement_eligible != 1
    ) THEN RAISE(ABORT, 'RC_ENFORCEMENT_SELECTOR_NOT_ELIGIBLE') END;
    SELECT CASE WHEN NEW.mode = 'enforce'
      AND EXISTS (SELECT 1 FROM relationship_completeness_sql_diagnostics)
      THEN RAISE(ABORT, 'RC_ENFORCEMENT_BACKLOG_NONZERO') END;
    SELECT CASE WHEN NEW.mode = 'enforce'
      AND ${RELATIONSHIP_ENFORCEMENT_GRAPH_BACKLOG_SQL}
      THEN RAISE(ABORT, 'RC_ENFORCEMENT_GRAPH_BACKLOG_NONZERO') END;
  END;`,
];

const CANONICAL_DB_STATE_TRIGGERS = [
  `CREATE TRIGGER canonical_db_state_integrity_guard
  BEFORE UPDATE OF sealed ON canonical_db_state
  WHEN NEW.state_key = 'canonical' AND NEW.sealed = 1
  BEGIN
    SELECT CASE WHEN EXISTS (
      SELECT 1
      FROM records record
      LEFT JOIN relations relation ON relation.record_id = record.record_id
      WHERE record.record_kind = 'relation'
        AND (relation.record_id IS NULL OR CASE
          WHEN json_valid(record.payload) != 1 THEN 1
          WHEN json_type(record.payload, '$.relation_kind') != 'text'
            OR json_extract(record.payload, '$.relation_kind') IS NOT relation.relation_kind THEN 1
          WHEN json_type(record.payload, '$.relation_family') != 'text'
            OR json_extract(record.payload, '$.relation_family') IS NOT relation.relation_family THEN 1
          WHEN json_type(record.payload, '$.subject_id') != 'text'
            OR json_extract(record.payload, '$.subject_id') IS NOT relation.subject_id THEN 1
          WHEN json_type(record.payload, '$.object_id') != 'text'
            OR json_extract(record.payload, '$.object_id') IS NOT relation.object_id THEN 1
          ELSE 0 END = 1)
    ) OR EXISTS (
      SELECT 1
      FROM relations relation
      JOIN records record ON record.record_id = relation.record_id
      WHERE record.record_kind != 'relation'
    ) THEN RAISE(ABORT, 'REL_PAYLOAD_EDGE_MISMATCH') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1
      FROM evidence_refs evidence
      WHERE CASE
        WHEN json_valid(evidence.ref_json) != 1 THEN 1
        WHEN json_type(evidence.ref_json, '$.source_id') != 'text'
          OR json_extract(evidence.ref_json, '$.source_id') IS NOT evidence.source_id THEN 1
        WHEN json_type(evidence.ref_json, '$.block_id') != 'text'
          OR json_extract(evidence.ref_json, '$.block_id') IS NOT evidence.block_id THEN 1
        WHEN json_type(evidence.ref_json, '$.page_number') != 'integer'
          OR json_extract(evidence.ref_json, '$.page_number') IS NOT evidence.page_number THEN 1
        WHEN json_type(evidence.ref_json, '$.evidence_id') != 'text'
          OR json_extract(evidence.ref_json, '$.evidence_id') IS NOT evidence.evidence_id THEN 1
        WHEN json_type(evidence.ref_json, '$.source_path') != 'text'
          OR json_extract(evidence.ref_json, '$.source_path') IS NOT evidence.source_path THEN 1
        WHEN json_type(evidence.ref_json, '$.text_sha256') != 'text'
          OR json_extract(evidence.ref_json, '$.text_sha256') IS NOT evidence.text_sha256 THEN 1
        WHEN json_type(evidence.ref_json, '$.resolved_block_id') IS NOT NULL
          AND (json_type(evidence.ref_json, '$.resolved_block_id') != 'text'
            OR json_extract(evidence.ref_json, '$.resolved_block_id') IS NOT evidence.resolved_block_id) THEN 1
        WHEN json_type(evidence.ref_json, '$.role') IS NULL AND evidence.role IS NOT NULL THEN 1
        WHEN json_type(evidence.ref_json, '$.role') IS NOT NULL
          AND (json_type(evidence.ref_json, '$.role') != 'text'
            OR json_extract(evidence.ref_json, '$.role') IS NOT evidence.role) THEN 1
        ELSE 0 END = 1
    ) THEN RAISE(ABORT, 'EVIDENCE_REF_JSON_MISMATCH') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM relationship_enforcement_state enforcement
      WHERE enforcement.mode = 'enforce' AND (
        enforcement.contract_id != '${RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID}'
        OR enforcement.hard_mode_ready != 1
        OR (SELECT COUNT(*) FROM relationship_selector_contracts) != ${RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS.length}
        OR (SELECT COUNT(*) FROM relationship_selector_contracts selector
            WHERE selector.contract_id = enforcement.contract_id
              AND selector.selector IN (${COMPLETENESS_SELECTOR_SQL})) != ${RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS.length}
        OR EXISTS (SELECT 1 FROM relationship_selector_contracts selector
                   WHERE selector.contract_id = enforcement.contract_id
                     AND selector.enforcement_eligible != 1)
        OR EXISTS (SELECT 1 FROM relationship_completeness_sql_diagnostics)
        OR ${RELATIONSHIP_ENFORCEMENT_GRAPH_BACKLOG_SQL}
      )
    ) THEN RAISE(ABORT, 'RC_ENFORCEMENT_STATE_INVALID_AT_SEAL') END;
  END;`,
  `CREATE TRIGGER canonical_db_state_insert_guard
  BEFORE INSERT ON canonical_db_state
  WHEN NEW.state_key != 'canonical' OR NEW.sealed != 0
    OR EXISTS (SELECT 1 FROM canonical_db_state)
  BEGIN
    SELECT RAISE(ABORT, 'CANONICAL_DB_STATE_INVALID');
  END;`,
  `CREATE TRIGGER canonical_db_state_update_guard
  BEFORE UPDATE ON canonical_db_state
  WHEN OLD.state_key != 'canonical' OR OLD.sealed != 0
    OR NEW.state_key != 'canonical' OR NEW.sealed != 1
  BEGIN
    SELECT RAISE(ABORT, 'CANONICAL_DB_STATE_IMMUTABLE');
  END;`,
  `CREATE TRIGGER canonical_db_state_delete_guard
  BEFORE DELETE ON canonical_db_state
  BEGIN
    SELECT RAISE(ABORT, 'CANONICAL_DB_STATE_IMMUTABLE');
  END;`,
];

const SEALED_RELATIONSHIP_TABLES = [
  "records",
  "relations",
  "evidence_block_registry",
  "evidence_refs",
  "relationship_contract_rules",
  "canonical_identities",
  "relationship_validation_findings",
  "relationship_dispositions",
  "relationship_disposition_evidence",
  "relationship_completeness_waivers",
  "relationship_completeness_subjects",
  "relationship_completeness_roles",
  "relationship_completeness_findings",
  "relationship_selector_contracts",
  "relationship_enforcement_state",
] as const;

function sealedMutationTriggers(table: (typeof SEALED_RELATIONSHIP_TABLES)[number]): string[] {
  return (["INSERT", "UPDATE", "DELETE"] as const).map((operation) => {
    const suffix = operation.toLowerCase();
    return `CREATE TRIGGER ${table}_sealed_${suffix}
  BEFORE ${operation} ON ${table}
  WHEN COALESCE((SELECT sealed FROM canonical_db_state WHERE state_key = 'canonical'), 0) = 1
  BEGIN
    SELECT RAISE(ABORT, 'CANONICAL_DB_SEALED:${table}');
  END;`;
  });
}

const SEALED_RELATIONSHIP_TRIGGERS = SEALED_RELATIONSHIP_TABLES.flatMap(sealedMutationTriggers);

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
  out.push(
    renderCreateTable(evidence_block_registry),
    ...EVIDENCE_REGISTRY_INDEXES.map(renderIndex),
    renderCreateTable(evidence_refs),
    ...EVIDENCE_INDEXES.map(renderIndex),
    renderCreateTable(canonical_db_state),
  );
  out.push(
    renderCreateTable(relationship_contract_rules),
    ...CONTRACT_INDEXES.map(renderIndex),
    renderCreateTable(canonical_identities),
    ...IDENTITY_INDEXES.map(renderIndex),
    renderCreateTable(relationship_validation_findings),
    ...RELATIONSHIP_FINDING_INDEXES.map(renderIndex),
    renderCreateTable(relationship_dispositions),
    renderCreateTable(relationship_disposition_evidence),
    renderCreateTable(relationship_completeness_waivers),
    renderCreateTable(relationship_completeness_subjects),
    renderCreateTable(relationship_completeness_roles),
    renderCreateTable(relationship_completeness_findings),
    renderCreateTable(relationship_selector_contracts),
    renderCreateTable(relationship_enforcement_state),
    ...RELATIONSHIP_COMPLETENESS_INDEXES.map(renderIndex),
    renderCreateTable(identity_aliases),
    renderCreateTable(do_not_merge),
    renderCreateTable(payload_value_conflicts),
  );
  out.push(renderCreateTable(ref_gtfs_routes), renderCreateTable(ref_agencies));
  out.push(...RELATIONSHIP_TRIGGERS);
  out.push(...FTS_TABLES.map(renderFtsDdl));
  out.push(...CANONICAL_VIEWS.map(renderView));
  out.push(...RELATIONSHIP_ENFORCEMENT_TRIGGERS);
  out.push(...CANONICAL_DB_STATE_TRIGGERS);
  out.push(...SEALED_RELATIONSHIP_TRIGGERS);
  return out;
}

/** Resolved CREATE statement list consumed by rebuildCanonicalDb. */
export const SCHEMA_DDL: string[] = schemaDdlStatements();
