import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import { QBNR_SERVICE_CHANGES_SOURCE_ID } from "@mta-wiki/pipeline/records/qbnr-recovery-expander";
import type { QbnrWorkStatus } from "@mta-wiki/pipeline/records/qbnr-work-ledger";

export const QBNR_TERMINAL_SERVICE_END_DECISION_SCHEMA_VERSION = 1 as const;
export const QBNR_PROJECT_RECORD_ID = "project_queens-bus-network-redesign" as const;

export type QbnrTerminalServiceEndTreatmentBinding = {
  canonical_treatment_record_id: string;
  treatment_family: string;
  canonical_project_treatment_relation_record_id: string;
};

export type QbnrTerminalServiceEndDecision = {
  schema_version: typeof QBNR_TERMINAL_SERVICE_END_DECISION_SCHEMA_VERSION;
  decision_id: string;
  review_state: "approved";
  source_id: typeof QBNR_SERVICE_CHANGES_SOURCE_ID;
  unit_id: string;
  route_label: string;
  effective_date: string;
  source_block_id: string;
  source_block_sha256: string;
  canonical_project_record_id: typeof QBNR_PROJECT_RECORD_ID;
  canonical_route_record_id: string;
  canonical_event_record_id: string;
  canonical_project_route_relation_record_id: string;
  canonical_project_event_relation_record_id: string;
  canonical_treatment_bindings: QbnrTerminalServiceEndTreatmentBinding[];
  reviewer: string;
  reviewed_at: string;
  rationale: string;
};

export type QbnrTerminalServiceEndDecisionStore = {
  schema_version: typeof QBNR_TERMINAL_SERVICE_END_DECISION_SCHEMA_VERSION;
  source_id: typeof QBNR_SERVICE_CHANGES_SOURCE_ID;
  decisions: QbnrTerminalServiceEndDecision[];
};

export type QbnrTerminalServiceEndWorkUnit = {
  unit_id: string;
  source_id: string;
  source_block_ids: string[];
  source_block_sha256s: string[];
  route_label: string;
  event_kind: string;
  effective_date: string | null;
  work_status: QbnrWorkStatus;
  canonical_route_record_id: string | null;
  canonical_event_record_id?: string | undefined;
  terminal_service_end_decision_id?: string | undefined;
  notes: string[];
};

const storeFields = new Set(["schema_version", "source_id", "decisions"]);
const decisionFields = new Set([
  "schema_version",
  "decision_id",
  "review_state",
  "source_id",
  "unit_id",
  "route_label",
  "effective_date",
  "source_block_id",
  "source_block_sha256",
  "canonical_project_record_id",
  "canonical_route_record_id",
  "canonical_event_record_id",
  "canonical_project_route_relation_record_id",
  "canonical_project_event_relation_record_id",
  "canonical_treatment_bindings",
  "reviewer",
  "reviewed_at",
  "rationale",
]);
const treatmentBindingFields = new Set([
  "canonical_treatment_record_id",
  "treatment_family",
  "canonical_project_treatment_relation_record_id",
]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactFields(value: Record<string, unknown>, fields: ReadonlySet<string>, path: string): void {
  const extras = Object.keys(value).filter((field) => !fields.has(field)).sort();
  if (extras.length > 0) throw new Error(`${path}: unknown field(s): ${extras.join(", ")}`);
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function calendarDate(value: unknown, path: string): string {
  const parsed = string(value, path);
  const match = parsed.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) throw new Error(`${path} must be an ISO calendar date`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${path} must be an ISO calendar date`);
  }
  return parsed;
}

function recordId(
  value: unknown,
  kind: "project" | "route" | "event" | "treatment" | "relation",
  path: string,
): string {
  const parsed = string(value, path);
  if (!new RegExp(`^${kind}_[a-z0-9][a-z0-9._:-]*$`, "u").test(parsed)) {
    throw new Error(`${path} must be a canonical ${kind} record id`);
  }
  return parsed;
}

function parseTreatmentBindings(
  value: unknown,
  path: string,
): QbnrTerminalServiceEndTreatmentBinding[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty array`);
  }
  const bindings = value.map((entry, index) => {
    const bindingPath = `${path}[${index}]`;
    const binding = object(entry, bindingPath);
    exactFields(binding, treatmentBindingFields, bindingPath);
    return {
      canonical_treatment_record_id: recordId(
        binding.canonical_treatment_record_id,
        "treatment",
        `${bindingPath}.canonical_treatment_record_id`,
      ),
      treatment_family: string(binding.treatment_family, `${bindingPath}.treatment_family`),
      canonical_project_treatment_relation_record_id: recordId(
        binding.canonical_project_treatment_relation_record_id,
        "relation",
        `${bindingPath}.canonical_project_treatment_relation_record_id`,
      ),
    };
  });
  const treatmentIds = new Set<string>();
  const relationIds = new Set<string>();
  for (const binding of bindings) {
    if (treatmentIds.has(binding.canonical_treatment_record_id)) {
      throw new Error(`${path} has duplicate treatment ${binding.canonical_treatment_record_id}`);
    }
    treatmentIds.add(binding.canonical_treatment_record_id);
    if (relationIds.has(binding.canonical_project_treatment_relation_record_id)) {
      throw new Error(
        `${path} has duplicate project-treatment relation ${binding.canonical_project_treatment_relation_record_id}`,
      );
    }
    relationIds.add(binding.canonical_project_treatment_relation_record_id);
  }
  return [...bindings].sort((left, right) =>
    left.canonical_treatment_record_id.localeCompare(right.canonical_treatment_record_id)
  );
}

function parseDecision(value: unknown, path: string): QbnrTerminalServiceEndDecision {
  const decision = object(value, path);
  exactFields(decision, decisionFields, path);
  if (decision.schema_version !== QBNR_TERMINAL_SERVICE_END_DECISION_SCHEMA_VERSION) {
    throw new Error(`${path}.schema_version must be ${QBNR_TERMINAL_SERVICE_END_DECISION_SCHEMA_VERSION}`);
  }
  if (decision.review_state !== "approved") throw new Error(`${path}.review_state must be approved`);
  if (decision.source_id !== QBNR_SERVICE_CHANGES_SOURCE_ID) {
    throw new Error(`${path}.source_id must be ${QBNR_SERVICE_CHANGES_SOURCE_ID}`);
  }
  const effectiveDate = calendarDate(decision.effective_date, `${path}.effective_date`);
  const sourceBlockId = string(decision.source_block_id, `${path}.source_block_id`);
  if (!/^p\d{3}_[bc]\d{4}$/u.test(sourceBlockId)) {
    throw new Error(`${path}.source_block_id must be a staged block id`);
  }
  const sourceBlockSha256 = string(decision.source_block_sha256, `${path}.source_block_sha256`);
  if (!/^sha256:[0-9a-f]{64}$/u.test(sourceBlockSha256)) {
    throw new Error(`${path}.source_block_sha256 must be a sha256-prefixed lowercase digest`);
  }
  const reviewedAt = string(decision.reviewed_at, `${path}.reviewed_at`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(reviewedAt) || Number.isNaN(Date.parse(reviewedAt))) {
    throw new Error(`${path}.reviewed_at must be an ISO-8601 UTC timestamp`);
  }
  const canonicalProjectRecordId = recordId(
    decision.canonical_project_record_id,
    "project",
    `${path}.canonical_project_record_id`,
  );
  if (canonicalProjectRecordId !== QBNR_PROJECT_RECORD_ID) {
    throw new Error(`${path}.canonical_project_record_id must be ${QBNR_PROJECT_RECORD_ID}`);
  }
  return {
    schema_version: QBNR_TERMINAL_SERVICE_END_DECISION_SCHEMA_VERSION,
    decision_id: string(decision.decision_id, `${path}.decision_id`),
    review_state: "approved",
    source_id: QBNR_SERVICE_CHANGES_SOURCE_ID,
    unit_id: string(decision.unit_id, `${path}.unit_id`),
    route_label: string(decision.route_label, `${path}.route_label`),
    effective_date: effectiveDate,
    source_block_id: sourceBlockId,
    source_block_sha256: sourceBlockSha256,
    canonical_project_record_id: QBNR_PROJECT_RECORD_ID,
    canonical_route_record_id: recordId(
      decision.canonical_route_record_id,
      "route",
      `${path}.canonical_route_record_id`,
    ),
    canonical_event_record_id: recordId(
      decision.canonical_event_record_id,
      "event",
      `${path}.canonical_event_record_id`,
    ),
    canonical_project_route_relation_record_id: recordId(
      decision.canonical_project_route_relation_record_id,
      "relation",
      `${path}.canonical_project_route_relation_record_id`,
    ),
    canonical_project_event_relation_record_id: recordId(
      decision.canonical_project_event_relation_record_id,
      "relation",
      `${path}.canonical_project_event_relation_record_id`,
    ),
    canonical_treatment_bindings: parseTreatmentBindings(
      decision.canonical_treatment_bindings,
      `${path}.canonical_treatment_bindings`,
    ),
    reviewer: string(decision.reviewer, `${path}.reviewer`),
    reviewed_at: reviewedAt,
    rationale: string(decision.rationale, `${path}.rationale`),
  };
}

export function parseQbnrTerminalServiceEndDecisionStore(
  value: unknown,
  path = "QBNR terminal service-end decision store",
): QbnrTerminalServiceEndDecisionStore {
  const store = object(value, path);
  exactFields(store, storeFields, path);
  if (store.schema_version !== QBNR_TERMINAL_SERVICE_END_DECISION_SCHEMA_VERSION) {
    throw new Error(`${path}.schema_version must be ${QBNR_TERMINAL_SERVICE_END_DECISION_SCHEMA_VERSION}`);
  }
  if (store.source_id !== QBNR_SERVICE_CHANGES_SOURCE_ID) {
    throw new Error(`${path}.source_id must be ${QBNR_SERVICE_CHANGES_SOURCE_ID}`);
  }
  if (!Array.isArray(store.decisions)) throw new Error(`${path}.decisions must be an array`);
  const decisions = store.decisions.map((decision, index) => parseDecision(decision, `${path}.decisions[${index}]`));
  const decisionIds = new Set<string>();
  const unitIds = new Set<string>();
  const eventRecordIds = new Set<string>();
  const treatmentRecordIds = new Set<string>();
  const relationRecordIds = new Set<string>();
  for (const decision of decisions) {
    if (decisionIds.has(decision.decision_id)) {
      throw new Error(`${path}: duplicate decision_id ${decision.decision_id}`);
    }
    decisionIds.add(decision.decision_id);
    if (unitIds.has(decision.unit_id)) throw new Error(`${path}: duplicate decision for unit ${decision.unit_id}`);
    unitIds.add(decision.unit_id);
    if (eventRecordIds.has(decision.canonical_event_record_id)) {
      throw new Error(`${path}: duplicate canonical event ${decision.canonical_event_record_id}`);
    }
    eventRecordIds.add(decision.canonical_event_record_id);
    const decisionRelationIds = [
      decision.canonical_project_route_relation_record_id,
      decision.canonical_project_event_relation_record_id,
      ...decision.canonical_treatment_bindings.map(
        (binding) => binding.canonical_project_treatment_relation_record_id,
      ),
    ];
    for (const relationId of decisionRelationIds) {
      if (relationRecordIds.has(relationId)) {
        throw new Error(`${path}: duplicate canonical relation ${relationId}`);
      }
      relationRecordIds.add(relationId);
    }
    for (const binding of decision.canonical_treatment_bindings) {
      if (treatmentRecordIds.has(binding.canonical_treatment_record_id)) {
        throw new Error(`${path}: duplicate canonical treatment ${binding.canonical_treatment_record_id}`);
      }
      treatmentRecordIds.add(binding.canonical_treatment_record_id);
    }
  }
  return {
    schema_version: QBNR_TERMINAL_SERVICE_END_DECISION_SCHEMA_VERSION,
    source_id: QBNR_SERVICE_CHANGES_SOURCE_ID,
    decisions: [...decisions].sort((left, right) => left.decision_id.localeCompare(right.decision_id)),
  };
}

export function qbnrTerminalServiceEndDecisionStorePath(rootDir = repoRoot): string {
  return join(
    rootDir,
    "data",
    "operational-anchor-review",
    "work-orders",
    "qbnr-2025",
    "terminal-service-end-decisions.json",
  );
}

export function loadQbnrTerminalServiceEndDecisionStore(
  path = qbnrTerminalServiceEndDecisionStorePath(),
): QbnrTerminalServiceEndDecisionStore {
  const artifactPath = relative(repoRoot, path).split("\\").join("/");
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`${artifactPath}: unable to read valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseQbnrTerminalServiceEndDecisionStore(value, artifactPath);
}

function normalizedRouteLabel(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/gu, " ");
}

function recordRouteSurfaces(record: MtaCanonicalRecord): Set<string> {
  const values: JsonValue[] = [
    record.payload.route_id ?? null,
    record.payload.route_label ?? null,
    record.payload.route_name ?? null,
    record.payload.gtfs_route_id ?? null,
    record.payload.routes ?? null,
  ];
  return new Set(
    values
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map(normalizedRouteLabel),
  );
}

function assertCanonicalEvidence(
  decision: QbnrTerminalServiceEndDecision,
  record: MtaCanonicalRecord,
  role:
    | "route_identity"
    | "event_date"
    | "treatment_definition"
    | "relationship"
    | "route_scope"
    | "timeline_relation"
    | "treatment_scope",
): void {
  const evidenceId = `${decision.source_id}#${decision.source_block_id}`;
  const exact = record.evidence_refs.some(
    (ref) =>
      ref.source_id === decision.source_id &&
      ref.evidence_id === evidenceId &&
      ref.block_id === decision.source_block_id &&
      ref.text_sha256 === decision.source_block_sha256 &&
      ref.role === role,
  );
  if (!exact) {
    throw new Error(
      `terminal service-end decision ${decision.decision_id} is stale: ${record.record_id} lacks exact ${role} evidence ${evidenceId} at ${decision.source_block_sha256}`,
    );
  }
}

function assertCanonicalRecordEligible(
  decision: QbnrTerminalServiceEndDecision,
  record: MtaCanonicalRecord,
): void {
  if (record.truth_status !== "source_stated") {
    throw new Error(
      `terminal service-end decision ${decision.decision_id} is inapplicable: ${record.record_id} must be source_stated`,
    );
  }
  if (record.review_state === "quarantined") {
    throw new Error(
      `terminal service-end decision ${decision.decision_id} is inapplicable: ${record.record_id} is quarantined`,
    );
  }
}

function canonicalRecord(
  decision: QbnrTerminalServiceEndDecision,
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  recordId: string,
  kind: MtaCanonicalRecord["record_kind"],
): MtaCanonicalRecord {
  const record = recordsById.get(recordId);
  if (!record) {
    throw new Error(
      `terminal service-end decision ${decision.decision_id} is stale: canonical ${kind} ${recordId} does not exist`,
    );
  }
  if (record.record_kind !== kind) {
    throw new Error(
      `terminal service-end decision ${decision.decision_id} is inapplicable: ${record.record_id} has kind ${record.record_kind}, expected ${kind}`,
    );
  }
  assertCanonicalRecordEligible(decision, record);
  return record;
}

function normalizedRelationDate(record: MtaCanonicalRecord): string | null {
  const value = record.payload.as_of_date_normalized;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value.normalized_date === record.payload.as_of_date && value.precision === "day"
    ? String(value.normalized_date)
    : null;
}

function assertProjectRelation(
  decision: QbnrTerminalServiceEndDecision,
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  relationRecordId: string,
  expected: {
    relation_kind: "affects_route" | "has_timeline_event" | "has_treatment";
    relation_family: "route_scope" | "timeline_context" | "treatment_context";
    object_id: string;
    evidence_role: "route_scope" | "timeline_relation" | "treatment_scope";
  },
): void {
  const relation = canonicalRecord(decision, recordsById, relationRecordId, "relation");
  if (
    relation.payload.relation_kind !== expected.relation_kind ||
    relation.payload.relation_family !== expected.relation_family ||
    relation.payload.subject_id !== decision.canonical_project_record_id ||
    relation.payload.object_id !== expected.object_id ||
    relation.payload.assertion_status !== "delivered" ||
    relation.payload.as_of_date !== decision.effective_date ||
    normalizedRelationDate(relation) !== decision.effective_date
  ) {
    throw new Error(
      `terminal service-end decision ${decision.decision_id} is stale: ${relation.record_id} does not match the exact ${expected.relation_kind} project subgraph edge`,
    );
  }
  assertCanonicalEvidence(decision, relation, "relationship");
  assertCanonicalEvidence(decision, relation, expected.evidence_role);
}

function exactEvidenceRecordIds(
  decision: QbnrTerminalServiceEndDecision,
  records: readonly MtaCanonicalRecord[],
  role: string,
): string[] {
  const evidenceId = `${decision.source_id}#${decision.source_block_id}`;
  return records
    .filter((record) => record.evidence_refs.some((ref) =>
      ref.source_id === decision.source_id &&
      ref.evidence_id === evidenceId &&
      ref.block_id === decision.source_block_id &&
      ref.text_sha256 === decision.source_block_sha256 &&
      ref.role === role
    ))
    .map((record) => record.record_id)
    .sort();
}

function assertExactSubgraphRecordSet(
  decision: QbnrTerminalServiceEndDecision,
  records: readonly MtaCanonicalRecord[],
  role: string,
  expectedRecordIds: readonly string[],
): void {
  const expected = [...expectedRecordIds].sort();
  const actual = exactEvidenceRecordIds(decision, records, role);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `terminal service-end decision ${decision.decision_id} canonical recovery subgraph mismatch for ${role}: expected [${expected.join(", ")}], found [${actual.join(", ")}]`,
    );
  }
}

export function applyQbnrTerminalServiceEndDecisions<T extends QbnrTerminalServiceEndWorkUnit>(
  units: readonly T[],
  decisions: readonly QbnrTerminalServiceEndDecision[],
  records: readonly MtaCanonicalRecord[],
): T[] {
  const validatedDecisions = parseQbnrTerminalServiceEndDecisionStore({
    schema_version: QBNR_TERMINAL_SERVICE_END_DECISION_SCHEMA_VERSION,
    source_id: QBNR_SERVICE_CHANGES_SOURCE_ID,
    decisions,
  }).decisions;
  const unitsById = new Map<string, T>();
  for (const unit of units) {
    if (unitsById.has(unit.unit_id)) throw new Error(`QBNR work ledger has duplicate unit_id ${unit.unit_id}`);
    unitsById.set(unit.unit_id, unit);
  }
  const recordsById = new Map<string, MtaCanonicalRecord>();
  for (const record of records) {
    if (recordsById.has(record.record_id)) throw new Error(`Canonical records contain duplicate record_id ${record.record_id}`);
    recordsById.set(record.record_id, record);
  }
  const decisionsByUnitId = new Map<string, QbnrTerminalServiceEndDecision>();
  const decisionIds = new Set<string>();
  for (const decision of validatedDecisions) {
    if (decisionIds.has(decision.decision_id)) {
      throw new Error(`Duplicate terminal service-end decision_id ${decision.decision_id}`);
    }
    decisionIds.add(decision.decision_id);
    if (decisionsByUnitId.has(decision.unit_id)) {
      throw new Error(`Duplicate terminal service-end decision for unit ${decision.unit_id}`);
    }
    const unit = unitsById.get(decision.unit_id);
    if (!unit) {
      throw new Error(
        `terminal service-end decision ${decision.decision_id} is stale: unit ${decision.unit_id} does not exist`,
      );
    }
    if (unit.source_id !== decision.source_id) {
      throw new Error(`terminal service-end decision ${decision.decision_id} is stale: source_id mismatch`);
    }
    if (unit.event_kind !== "service_end" || unit.work_status !== "pending_canonical_then_terminal") {
      throw new Error(
        `terminal service-end decision ${decision.decision_id} is inapplicable to ${unit.event_kind}/${unit.work_status}`,
      );
    }
    if (
      unit.route_label !== decision.route_label ||
      unit.effective_date !== decision.effective_date ||
      unit.source_block_ids.length !== 1 ||
      unit.source_block_ids[0] !== decision.source_block_id ||
      unit.source_block_sha256s.length !== 1 ||
      unit.source_block_sha256s[0] !== decision.source_block_sha256
    ) {
      throw new Error(
        `terminal service-end decision ${decision.decision_id} is stale for unit ${decision.unit_id}: route/date/block/hash pin mismatch`,
      );
    }
    if (
      unit.canonical_route_record_id &&
      unit.canonical_route_record_id !== decision.canonical_route_record_id
    ) {
      throw new Error(
        `terminal service-end decision ${decision.decision_id} is stale: unit route record changed from ${decision.canonical_route_record_id} to ${unit.canonical_route_record_id}`,
      );
    }
    canonicalRecord(
      decision,
      recordsById,
      decision.canonical_project_record_id,
      "project",
    );
    const route = canonicalRecord(
      decision,
      recordsById,
      decision.canonical_route_record_id,
      "route",
    );
    if (!recordRouteSurfaces(route).has(normalizedRouteLabel(decision.route_label))) {
      throw new Error(
        `terminal service-end decision ${decision.decision_id} is stale: ${route.record_id} does not identify ${decision.route_label}`,
      );
    }
    assertCanonicalEvidence(decision, route, "route_identity");

    const event = canonicalRecord(
      decision,
      recordsById,
      decision.canonical_event_record_id,
      "event",
    );
    if (
      event.payload.event_kind !== "route service end" ||
      event.payload.event_family !== "other" ||
      event.payload.lifecycle_phase !== "other" ||
      event.payload.lifecycle_phase_other !== "route service end" ||
      event.payload.date_normalized !== decision.effective_date ||
      event.payload.date_precision !== "day"
    ) {
      throw new Error(
        `terminal service-end decision ${decision.decision_id} is stale: ${event.record_id} is not the exact day-precise route service-end event`,
      );
    }
    assertCanonicalEvidence(decision, event, "event_date");

    assertProjectRelation(
      decision,
      recordsById,
      decision.canonical_project_route_relation_record_id,
      {
        relation_kind: "affects_route",
        relation_family: "route_scope",
        object_id: decision.canonical_route_record_id,
        evidence_role: "route_scope",
      },
    );
    assertProjectRelation(
      decision,
      recordsById,
      decision.canonical_project_event_relation_record_id,
      {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        object_id: decision.canonical_event_record_id,
        evidence_role: "timeline_relation",
      },
    );

    for (const binding of decision.canonical_treatment_bindings) {
      const treatment = canonicalRecord(
        decision,
        recordsById,
        binding.canonical_treatment_record_id,
        "treatment_component",
      );
      if (treatment.payload.treatment_family !== binding.treatment_family) {
        throw new Error(
          `terminal service-end decision ${decision.decision_id} is stale: ${treatment.record_id} treatment_family is ${String(treatment.payload.treatment_family)}, expected ${binding.treatment_family}`,
        );
      }
      assertCanonicalEvidence(decision, treatment, "treatment_definition");
      assertProjectRelation(
        decision,
        recordsById,
        binding.canonical_project_treatment_relation_record_id,
        {
          relation_kind: "has_treatment",
          relation_family: "treatment_context",
          object_id: binding.canonical_treatment_record_id,
          evidence_role: "treatment_scope",
        },
      );
    }

    const treatmentRecordIds = decision.canonical_treatment_bindings.map(
      (binding) => binding.canonical_treatment_record_id,
    );
    const treatmentRelationRecordIds = decision.canonical_treatment_bindings.map(
      (binding) => binding.canonical_project_treatment_relation_record_id,
    );
    const allRelationRecordIds = [
      decision.canonical_project_route_relation_record_id,
      decision.canonical_project_event_relation_record_id,
      ...treatmentRelationRecordIds,
    ];
    assertExactSubgraphRecordSet(decision, records, "route_identity", [decision.canonical_route_record_id]);
    assertExactSubgraphRecordSet(decision, records, "event_date", [decision.canonical_event_record_id]);
    assertExactSubgraphRecordSet(decision, records, "treatment_definition", treatmentRecordIds);
    assertExactSubgraphRecordSet(decision, records, "route_scope", [
      decision.canonical_project_route_relation_record_id,
    ]);
    assertExactSubgraphRecordSet(decision, records, "timeline_relation", [
      decision.canonical_project_event_relation_record_id,
    ]);
    assertExactSubgraphRecordSet(decision, records, "treatment_scope", treatmentRelationRecordIds);
    assertExactSubgraphRecordSet(decision, records, "relationship", allRelationRecordIds);
    decisionsByUnitId.set(decision.unit_id, decision);
  }

  return units.map((unit) => {
    const decision = decisionsByUnitId.get(unit.unit_id);
    if (!decision) return { ...unit };
    return {
      ...unit,
      work_status: "terminal_service_end",
      canonical_route_record_id: decision.canonical_route_record_id,
      canonical_event_record_id: decision.canonical_event_record_id,
      terminal_service_end_decision_id: decision.decision_id,
      notes: [
        ...unit.notes,
        `Reviewed terminal service-end decision ${decision.decision_id}; canonical recovery evidence is present and exact.`,
      ],
    };
  });
}
