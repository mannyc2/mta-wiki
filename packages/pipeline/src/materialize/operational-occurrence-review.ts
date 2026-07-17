import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { OperationalAnchorReviewDecision } from "@mta-wiki/pipeline/materialize/operational-anchor-review";
import {
  parseOperationalOccurrence,
  type OperationalOccurrenceEvidenceBinding,
  type OperationalOccurrenceRow,
} from "@mta-wiki/pipeline/materialize/operational-occurrences";

export const OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION = 1 as const;
export const OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION = 1 as const;

export type OperationalOccurrenceAcceptedTreatment =
  | {
      kind: "atomic";
      member: {
        treatment_record_id: string;
        treatment_family: string;
        evidence_bindings: OperationalOccurrenceEvidenceBinding[];
      };
    }
  | {
      kind: "bundle";
      analysis_family: string;
      analysis_family_evidence_bindings: OperationalOccurrenceEvidenceBinding[];
      members: Array<{
        treatment_record_id: string;
        treatment_family: string;
        evidence_bindings: OperationalOccurrenceEvidenceBinding[];
      }>;
    };

export type OperationalOccurrenceAcceptedDecision = {
  artifact_path?: string | undefined;
  schema_version: typeof OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION;
  decision_id: string;
  review_state: "approved";
  accepted_at: string;
  reviewer: string;
  rationale: string;
  occurrence_id: string;
  founding_key: string;
  observation_event_record_ids: string[];
  observation_relation_record_ids: string[];
  resolved_status: "realized";
  resolved_onset: {
    date: string;
    precision: "day" | "month";
    evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  };
  routes: Array<{
    route_record_id: string;
    gtfs_route_id: string;
    evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  }>;
  treatment_scope_kind: "atomic" | "bundle";
  treatment: OperationalOccurrenceAcceptedTreatment;
};

export type OperationalOccurrenceReviewTreatment =
  | {
      kind: "atomic";
      member: {
        treatment_record_id: string;
        treatment_family: string;
        evidence_bindings: OperationalOccurrenceEvidenceBinding[];
      };
    }
  | {
      kind: "bundle";
      bundle_family: string | null;
      bundle_family_evidence_bindings: OperationalOccurrenceEvidenceBinding[];
      members: Array<{
        treatment_record_id: string;
        treatment_family: string;
        evidence_bindings: OperationalOccurrenceEvidenceBinding[];
      }>;
    };

export type OperationalOccurrenceReviewDecision = {
  schema_version: typeof OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION;
  decision_id: string;
  review_state: "approved";
  occurrence_id: string;
  founding_key: string;
  anchor_review_decision_ids: string[];
  resolved_onset: {
    date: string;
    precision: "day" | "month";
    evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  };
  routes: Array<{
    route_record_id: string;
    gtfs_route_id: string;
    evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  }>;
  treatment: OperationalOccurrenceReviewTreatment;
  evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  reviewers: string[];
  accepted_at: string;
  rationale: string;
};

export type OperationalOccurrenceReviewSnapshot = {
  snapshot_version: typeof OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION;
  decision_schema_version: typeof OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION;
  decision_count: number;
  decisions: OperationalOccurrenceReviewDecision[];
};

const acceptedDecisionFields = new Set([
  "accepted_at",
  "decision_id",
  "founding_key",
  "observation_event_record_ids",
  "observation_relation_record_ids",
  "occurrence_id",
  "rationale",
  "resolved_onset",
  "resolved_status",
  "review_state",
  "reviewer",
  "routes",
  "schema_version",
  "treatment",
  "treatment_scope_kind",
]);
const acceptedOnsetFields = new Set(["date", "evidence_bindings", "precision"]);
const acceptedRouteFields = new Set(["evidence_bindings", "gtfs_route_id", "route_record_id"]);
const acceptedBindingFields = new Set(["evidence_id", "record_id", "role", "source_id"]);
const acceptedAtomicFields = new Set(["kind", "member"]);
const acceptedBundleFields = new Set([
  "analysis_family",
  "analysis_family_evidence_bindings",
  "kind",
  "members",
]);
const acceptedMemberFields = new Set(["evidence_bindings", "treatment_family", "treatment_record_id"]);
const acceptedEvidenceRoles = new Set([
  "bundle_analysis_family",
  "event_date",
  "route_identity",
  "route_scope",
  "route_treatment_event_bridge",
  "timeline_relation",
  "treatment_definition",
  "treatment_scope",
]);
const snapshotDecisionFields = new Set([
  "accepted_at",
  "anchor_review_decision_ids",
  "decision_id",
  "evidence_bindings",
  "founding_key",
  "occurrence_id",
  "rationale",
  "resolved_onset",
  "review_state",
  "reviewers",
  "routes",
  "schema_version",
  "treatment",
]);
const snapshotOnsetFields = new Set(["date", "evidence_bindings", "precision"]);
const snapshotRouteFields = new Set(["evidence_bindings", "gtfs_route_id", "route_record_id"]);
const snapshotAtomicFields = new Set(["kind", "member"]);
const snapshotBundleFields = new Set(["bundle_family", "bundle_family_evidence_bindings", "kind", "members"]);
const snapshotMemberFields = new Set(["evidence_bindings", "treatment_family", "treatment_record_id"]);

function acceptedObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function acceptedKeys(object: Record<string, unknown>, fields: ReadonlySet<string>, path: string): void {
  const extras = Object.keys(object).filter((field) => !fields.has(field)).sort();
  if (extras.length > 0) throw new Error(`${path}: unknown field(s): ${extras.join(", ")}`);
}

function acceptedString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function acceptedStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path} must be a non-empty array`);
  const values = value.map((entry, index) => acceptedString(entry, `${path}[${index}]`));
  if (new Set(values).size !== values.length) throw new Error(`${path} must not contain duplicates`);
  return values;
}

function acceptedPossiblyEmptyStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const values = value.map((entry, index) => acceptedString(entry, `${path}[${index}]`));
  if (new Set(values).size !== values.length) throw new Error(`${path} must not contain duplicates`);
  return values;
}

function acceptedBinding(value: unknown, path: string): OperationalOccurrenceEvidenceBinding {
  const object = acceptedObject(value, path);
  acceptedKeys(object, acceptedBindingFields, path);
  const role = acceptedString(object.role, `${path}.role`);
  if (!acceptedEvidenceRoles.has(role)) throw new Error(`${path}.role is unsupported: ${role}`);
  return {
    role: role as OperationalOccurrenceEvidenceBinding["role"],
    record_id: acceptedString(object.record_id, `${path}.record_id`),
    source_id: acceptedString(object.source_id, `${path}.source_id`),
    evidence_id: acceptedString(object.evidence_id, `${path}.evidence_id`),
  };
}

function acceptedBindings(value: unknown, path: string): OperationalOccurrenceEvidenceBinding[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path} must be a non-empty array`);
  const bindings = value.map((entry, index) => acceptedBinding(entry, `${path}[${index}]`));
  const keys = bindings.map((binding) => [binding.role, binding.record_id, binding.source_id, binding.evidence_id].join("|"));
  if (new Set(keys).size !== keys.length) throw new Error(`${path} must not contain duplicate bindings`);
  return bindings;
}

function acceptedPossiblyEmptyBindings(value: unknown, path: string): OperationalOccurrenceEvidenceBinding[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  if (value.length === 0) return [];
  return acceptedBindings(value, path);
}

function acceptedMember(value: unknown, path: string): Extract<OperationalOccurrenceAcceptedTreatment, { kind: "atomic" }>["member"] {
  const object = acceptedObject(value, path);
  acceptedKeys(object, acceptedMemberFields, path);
  return {
    treatment_record_id: acceptedString(object.treatment_record_id, `${path}.treatment_record_id`),
    treatment_family: acceptedString(object.treatment_family, `${path}.treatment_family`),
    evidence_bindings: acceptedBindings(object.evidence_bindings, `${path}.evidence_bindings`),
  };
}

export function parseOperationalOccurrenceAcceptedDecision(
  value: unknown,
  path = "operational occurrence accepted decision",
): OperationalOccurrenceAcceptedDecision {
  const object = acceptedObject(value, path);
  acceptedKeys(object, acceptedDecisionFields, path);
  if (object.schema_version !== OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION) {
    throw new Error(`${path}.schema_version must be ${OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION}`);
  }
  if (object.review_state !== "approved") throw new Error(`${path}.review_state must be approved`);
  if (object.resolved_status !== "realized") throw new Error(`${path}.resolved_status must be realized`);
  const acceptedAt = acceptedString(object.accepted_at, `${path}.accepted_at`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(acceptedAt) || Number.isNaN(Date.parse(acceptedAt))) {
    throw new Error(`${path}.accepted_at must be an ISO-8601 UTC timestamp`);
  }
  const onset = acceptedObject(object.resolved_onset, `${path}.resolved_onset`);
  acceptedKeys(onset, acceptedOnsetFields, `${path}.resolved_onset`);
  const precision = acceptedString(onset.precision, `${path}.resolved_onset.precision`);
  if (precision !== "day" && precision !== "month") throw new Error(`${path}.resolved_onset.precision must be day or month`);
  const date = acceptedString(onset.date, `${path}.resolved_onset.date`);
  if (!(precision === "day" ? /^\d{4}-\d{2}-\d{2}$/u : /^\d{4}-\d{2}$/u).test(date)) {
    throw new Error(`${path}.resolved_onset.date does not match ${precision} precision`);
  }
  if (!Array.isArray(object.routes) || object.routes.length === 0) throw new Error(`${path}.routes must be a non-empty array`);
  const routes = object.routes.map((entry, index) => {
    const routePath = `${path}.routes[${index}]`;
    const route = acceptedObject(entry, routePath);
    acceptedKeys(route, acceptedRouteFields, routePath);
    return {
      route_record_id: acceptedString(route.route_record_id, `${routePath}.route_record_id`),
      gtfs_route_id: acceptedString(route.gtfs_route_id, `${routePath}.gtfs_route_id`),
      evidence_bindings: acceptedBindings(route.evidence_bindings, `${routePath}.evidence_bindings`),
    };
  });
  if (new Set(routes.map((route) => route.route_record_id)).size !== routes.length) {
    throw new Error(`${path}.routes must not repeat route_record_id`);
  }
  const treatmentObject = acceptedObject(object.treatment, `${path}.treatment`);
  const scopeKind = acceptedString(object.treatment_scope_kind, `${path}.treatment_scope_kind`);
  let treatment: OperationalOccurrenceAcceptedTreatment;
  if (treatmentObject.kind === "atomic") {
    acceptedKeys(treatmentObject, acceptedAtomicFields, `${path}.treatment`);
    treatment = { kind: "atomic", member: acceptedMember(treatmentObject.member, `${path}.treatment.member`) };
  } else if (treatmentObject.kind === "bundle") {
    acceptedKeys(treatmentObject, acceptedBundleFields, `${path}.treatment`);
    if (!Array.isArray(treatmentObject.members) || treatmentObject.members.length < 2) {
      throw new Error(`${path}.treatment.members must contain at least two members`);
    }
    const members = treatmentObject.members.map((entry, index) => acceptedMember(entry, `${path}.treatment.members[${index}]`));
    if (new Set(members.map((member) => member.treatment_record_id)).size !== members.length) {
      throw new Error(`${path}.treatment.members must not repeat treatment_record_id`);
    }
    const familyBindings = acceptedBindings(
      treatmentObject.analysis_family_evidence_bindings,
      `${path}.treatment.analysis_family_evidence_bindings`,
    );
    if (familyBindings.some((binding) => binding.role !== "bundle_analysis_family")) {
      throw new Error(`${path}.treatment.analysis_family_evidence_bindings must all use bundle_analysis_family`);
    }
    treatment = {
      kind: "bundle",
      analysis_family: acceptedString(treatmentObject.analysis_family, `${path}.treatment.analysis_family`),
      analysis_family_evidence_bindings: familyBindings,
      members,
    };
  } else {
    throw new Error(`${path}.treatment.kind must be atomic or bundle`);
  }
  if ((scopeKind !== "atomic" && scopeKind !== "bundle") || scopeKind !== treatment.kind) {
    throw new Error(`${path}.treatment_scope_kind must equal treatment.kind`);
  }
  return {
    schema_version: OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION,
    decision_id: acceptedString(object.decision_id, `${path}.decision_id`),
    review_state: "approved",
    accepted_at: acceptedAt,
    reviewer: acceptedString(object.reviewer, `${path}.reviewer`),
    rationale: acceptedString(object.rationale, `${path}.rationale`),
    occurrence_id: acceptedString(object.occurrence_id, `${path}.occurrence_id`),
    founding_key: acceptedString(object.founding_key, `${path}.founding_key`),
    observation_event_record_ids: acceptedStringArray(
      object.observation_event_record_ids,
      `${path}.observation_event_record_ids`,
    ),
    observation_relation_record_ids: acceptedStringArray(
      object.observation_relation_record_ids,
      `${path}.observation_relation_record_ids`,
    ),
    resolved_status: "realized",
    resolved_onset: {
      date,
      precision,
      evidence_bindings: acceptedBindings(onset.evidence_bindings, `${path}.resolved_onset.evidence_bindings`),
    },
    routes,
    treatment_scope_kind: scopeKind,
    treatment,
  };
}

export function operationalOccurrenceReviewAcceptedDir(rootDir = repoRoot): string {
  return join(rootDir, "data", "operational-occurrence-review", "accepted", "decisions");
}

export function loadOperationalOccurrenceAcceptedDecisions(
  dir = operationalOccurrenceReviewAcceptedDir(),
): OperationalOccurrenceAcceptedDecision[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const path = join(dir, name);
      const artifactPath = relative(repoRoot, path).split("/").join("/");
      let value: unknown;
      try {
        value = JSON.parse(readFileSync(path, "utf8")) as unknown;
      } catch (error) {
        throw new Error(`${artifactPath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      const decision = parseOperationalOccurrenceAcceptedDecision(value, artifactPath);
      if (`${decision.decision_id}.json` !== basename(path)) {
        throw new Error(`${artifactPath}: decision_id must match the file name`);
      }
      return { ...decision, artifact_path: artifactPath };
    });
}

function treatmentBinding(row: OperationalOccurrenceRow): OperationalOccurrenceReviewTreatment {
  if (row.treatment.kind === "atomic") {
    return {
      kind: "atomic",
      member: {
        treatment_record_id: row.treatment.member.treatment_record_id,
        treatment_family: row.treatment.member.treatment_family,
        evidence_bindings: row.treatment.member.evidence_bindings.map((binding) => ({ ...binding })),
      },
    };
  }
  return {
    kind: "bundle",
    bundle_family: row.treatment.bundle_family,
    bundle_family_evidence_bindings: row.treatment.bundle_family_evidence_bindings.map((binding) => ({ ...binding })),
    members: row.treatment.members.map((member) => ({
      treatment_record_id: member.treatment_record_id,
      treatment_family: member.treatment_family,
      evidence_bindings: member.evidence_bindings.map((binding) => ({ ...binding })),
    })),
  };
}

function decisionForRow(
  row: OperationalOccurrenceRow,
  anchorDecisionsById: ReadonlyMap<string, OperationalAnchorReviewDecision>,
  acceptedOccurrenceDecisionsById: ReadonlyMap<string, OperationalOccurrenceAcceptedDecision>,
): OperationalOccurrenceReviewDecision {
  const acceptedOccurrenceDecision = acceptedOccurrenceDecisionsById.get(row.occurrence_review_decision_id);
  const anchors = row.provenance.anchor_review_decision_ids.map((decisionId) => {
    const decision = anchorDecisionsById.get(decisionId);
    if (!decision) throw new Error(`occurrence ${row.occurrence_id} references missing accepted anchor review ${decisionId}`);
    return decision;
  });
  const acceptedAt = acceptedOccurrenceDecision?.accepted_at ?? [...anchors.map((decision) => decision.accepted_at)].sort().at(-1);
  if (!acceptedAt) throw new Error(`occurrence ${row.occurrence_id} has no accepted anchor review timestamp`);
  return {
    schema_version: OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION,
    decision_id: row.occurrence_review_decision_id,
    review_state: "approved",
    occurrence_id: row.occurrence_id,
    founding_key: row.founding_key,
    anchor_review_decision_ids: [...row.provenance.anchor_review_decision_ids],
    resolved_onset: {
      date: row.resolved_onset.date,
      precision: row.resolved_onset.precision,
      evidence_bindings: row.resolved_onset.evidence_bindings.map((binding) => ({ ...binding })),
    },
    routes: row.routes.map((route) => ({
      route_record_id: route.route_record_id,
      gtfs_route_id: route.gtfs_route_id,
      evidence_bindings: route.evidence_bindings.map((binding) => ({ ...binding })),
    })),
    treatment: treatmentBinding(row),
    evidence_bindings: row.evidence_bindings.map((binding) => ({ ...binding })),
    reviewers: acceptedOccurrenceDecision
      ? [acceptedOccurrenceDecision.reviewer]
      : [...new Set(anchors.map((decision) => decision.reviewer))].sort(),
    accepted_at: acceptedAt,
    rationale:
      acceptedOccurrenceDecision?.rationale ??
      `Migration approval composed from accepted operational-anchor reviews: ${anchors
        .map((decision) => decision.decision_id)
        .sort()
        .join(", ")}.`,
  };
}

export function operationalOccurrenceReviewDecisions(
  rows: readonly OperationalOccurrenceRow[],
  anchorReviewDecisions: readonly OperationalAnchorReviewDecision[],
  acceptedOccurrenceDecisions: readonly OperationalOccurrenceAcceptedDecision[] = [],
): OperationalOccurrenceReviewDecision[] {
  const anchorsById = new Map(anchorReviewDecisions.map((decision) => [decision.decision_id, decision]));
  const acceptedOccurrencesById = new Map(
    acceptedOccurrenceDecisions.map((decision) => [decision.decision_id, decision]),
  );
  return [...rows]
    .sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id))
    .map((row) => decisionForRow(row, anchorsById, acceptedOccurrencesById));
}

function projectionBinding(value: OperationalOccurrenceReviewDecision): unknown {
  return {
    decision_id: value.decision_id,
    occurrence_id: value.occurrence_id,
    founding_key: value.founding_key,
    anchor_review_decision_ids: value.anchor_review_decision_ids,
    resolved_onset: value.resolved_onset,
    routes: value.routes,
    treatment: value.treatment,
    evidence_bindings: value.evidence_bindings,
  };
}

function rowBinding(value: OperationalOccurrenceRow): unknown {
  return {
    decision_id: value.occurrence_review_decision_id,
    occurrence_id: value.occurrence_id,
    founding_key: value.founding_key,
    anchor_review_decision_ids: value.provenance.anchor_review_decision_ids,
    resolved_onset: {
      date: value.resolved_onset.date,
      precision: value.resolved_onset.precision,
      evidence_bindings: value.resolved_onset.evidence_bindings,
    },
    routes: value.routes.map((route) => ({
      route_record_id: route.route_record_id,
      gtfs_route_id: route.gtfs_route_id,
      evidence_bindings: route.evidence_bindings,
    })),
    treatment: treatmentBinding(value),
    evidence_bindings: value.evidence_bindings,
  };
}

export function assertOperationalOccurrenceReviewDecisions(
  decisions: readonly OperationalOccurrenceReviewDecision[],
  rows: readonly OperationalOccurrenceRow[],
): OperationalOccurrenceReviewDecision[] {
  const parsedRows = rows.map((row, index) => parseOperationalOccurrence(row, `occurrence review row[${index}]`));
  const rowsById = new Map(parsedRows.map((row) => [row.occurrence_id, row]));
  if (rowsById.size !== parsedRows.length) throw new Error("operational occurrence review has duplicate occurrence rows");
  const decisionIds = new Set<string>();
  const occurrenceIds = new Set<string>();
  for (const decision of decisions) {
    if (decision.schema_version !== OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION) {
      throw new Error(`occurrence review ${decision.decision_id} schema_version must be 1`);
    }
    if (decision.review_state !== "approved") throw new Error(`occurrence review ${decision.decision_id} must be approved`);
    if (decisionIds.has(decision.decision_id)) throw new Error(`duplicate occurrence review decision ${decision.decision_id}`);
    decisionIds.add(decision.decision_id);
    if (occurrenceIds.has(decision.occurrence_id)) throw new Error(`duplicate occurrence review for ${decision.occurrence_id}`);
    occurrenceIds.add(decision.occurrence_id);
    const row = rowsById.get(decision.occurrence_id);
    if (!row) throw new Error(`occurrence review ${decision.decision_id} references missing occurrence ${decision.occurrence_id}`);
    if (stableJson(projectionBinding(decision) as JsonValue) !== stableJson(rowBinding(row) as JsonValue)) {
      throw new Error(`occurrence review ${decision.decision_id} is stale for occurrence ${decision.occurrence_id}`);
    }
  }
  if (occurrenceIds.size !== rowsById.size) throw new Error("every released occurrence must have one approved occurrence review decision");
  return [...decisions].sort((left, right) => left.decision_id.localeCompare(right.decision_id));
}

export function operationalOccurrenceReviewSnapshot(
  decisions: readonly OperationalOccurrenceReviewDecision[],
): OperationalOccurrenceReviewSnapshot {
  const sorted = [...decisions].sort((left, right) => left.decision_id.localeCompare(right.decision_id));
  return {
    snapshot_version: OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION,
    decision_schema_version: OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION,
    decision_count: sorted.length,
    decisions: sorted,
  };
}

export function operationalOccurrenceReviewSnapshotJson(
  decisions: readonly OperationalOccurrenceReviewDecision[],
): string {
  return `${stableJson(operationalOccurrenceReviewSnapshot(decisions) as unknown as JsonValue)}\n`;
}

export function parseOperationalOccurrenceReviewSnapshot(value: unknown): OperationalOccurrenceReviewSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("operational occurrence review snapshot must be an object");
  }
  const object = value as Record<string, unknown>;
  const extras = Object.keys(object)
    .filter((field) => !new Set(["decision_count", "decision_schema_version", "decisions", "snapshot_version"]).has(field))
    .sort();
  if (extras.length > 0) throw new Error(`operational occurrence review snapshot has unknown field(s): ${extras.join(", ")}`);
  if (object.snapshot_version !== OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION) {
    throw new Error("operational occurrence review snapshot.snapshot_version must be 1");
  }
  if (object.decision_schema_version !== OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION) {
    throw new Error("operational occurrence review snapshot.decision_schema_version must be 1");
  }
  if (!Array.isArray(object.decisions)) throw new Error("operational occurrence review snapshot.decisions must be an array");
  if (typeof object.decision_count !== "number" || !Number.isInteger(object.decision_count) || object.decision_count < 0) {
    throw new Error("operational occurrence review snapshot.decision_count must be a non-negative integer");
  }
  if (object.decision_count !== object.decisions.length) {
    throw new Error("operational occurrence review snapshot.decision_count does not match decisions length");
  }
  const decisions = object.decisions.map((entry, index): OperationalOccurrenceReviewDecision => {
    const path = `operational occurrence review snapshot.decisions[${index}]`;
    const decision = acceptedObject(entry, path);
    acceptedKeys(decision, snapshotDecisionFields, path);
    if (decision.schema_version !== OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION) {
      throw new Error(`${path}.schema_version must be 1`);
    }
    if (decision.review_state !== "approved") throw new Error(`${path}.review_state must be approved`);
    const acceptedAt = acceptedString(decision.accepted_at, `${path}.accepted_at`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(acceptedAt) || Number.isNaN(Date.parse(acceptedAt))) {
      throw new Error(`${path}.accepted_at must be an ISO-8601 UTC timestamp`);
    }
    const onset = acceptedObject(decision.resolved_onset, `${path}.resolved_onset`);
    acceptedKeys(onset, snapshotOnsetFields, `${path}.resolved_onset`);
    const precision = acceptedString(onset.precision, `${path}.resolved_onset.precision`);
    if (precision !== "day" && precision !== "month") throw new Error(`${path}.resolved_onset.precision must be day or month`);
    const date = acceptedString(onset.date, `${path}.resolved_onset.date`);
    if (!(precision === "day" ? /^\d{4}-\d{2}-\d{2}$/u : /^\d{4}-\d{2}$/u).test(date)) {
      throw new Error(`${path}.resolved_onset.date does not match ${precision} precision`);
    }
    if (!Array.isArray(decision.routes) || decision.routes.length === 0) throw new Error(`${path}.routes must be non-empty`);
    const routes = decision.routes.map((routeEntry, routeIndex) => {
      const routePath = `${path}.routes[${routeIndex}]`;
      const route = acceptedObject(routeEntry, routePath);
      acceptedKeys(route, snapshotRouteFields, routePath);
      return {
        route_record_id: acceptedString(route.route_record_id, `${routePath}.route_record_id`),
        gtfs_route_id: acceptedString(route.gtfs_route_id, `${routePath}.gtfs_route_id`),
        evidence_bindings: acceptedBindings(route.evidence_bindings, `${routePath}.evidence_bindings`),
      };
    });
    const member = (memberValue: unknown, memberPath: string) => {
      const value = acceptedObject(memberValue, memberPath);
      acceptedKeys(value, snapshotMemberFields, memberPath);
      return {
        treatment_record_id: acceptedString(value.treatment_record_id, `${memberPath}.treatment_record_id`),
        treatment_family: acceptedString(value.treatment_family, `${memberPath}.treatment_family`),
        evidence_bindings: acceptedBindings(value.evidence_bindings, `${memberPath}.evidence_bindings`),
      };
    };
    const treatmentValue = acceptedObject(decision.treatment, `${path}.treatment`);
    let treatment: OperationalOccurrenceReviewTreatment;
    if (treatmentValue.kind === "atomic") {
      acceptedKeys(treatmentValue, snapshotAtomicFields, `${path}.treatment`);
      treatment = { kind: "atomic", member: member(treatmentValue.member, `${path}.treatment.member`) };
    } else if (treatmentValue.kind === "bundle") {
      acceptedKeys(treatmentValue, snapshotBundleFields, `${path}.treatment`);
      if (!Array.isArray(treatmentValue.members) || treatmentValue.members.length < 2) {
        throw new Error(`${path}.treatment.members must contain at least two members`);
      }
      treatment = {
        kind: "bundle",
        bundle_family:
          treatmentValue.bundle_family === null
            ? null
            : acceptedString(treatmentValue.bundle_family, `${path}.treatment.bundle_family`),
        bundle_family_evidence_bindings: acceptedPossiblyEmptyBindings(
          treatmentValue.bundle_family_evidence_bindings,
          `${path}.treatment.bundle_family_evidence_bindings`,
        ),
        members: treatmentValue.members.map((entry, memberIndex) =>
          member(entry, `${path}.treatment.members[${memberIndex}]`),
        ),
      };
    } else {
      throw new Error(`${path}.treatment.kind must be atomic or bundle`);
    }
    return {
      schema_version: OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION,
      decision_id: acceptedString(decision.decision_id, `${path}.decision_id`),
      review_state: "approved",
      occurrence_id: acceptedString(decision.occurrence_id, `${path}.occurrence_id`),
      founding_key: acceptedString(decision.founding_key, `${path}.founding_key`),
      anchor_review_decision_ids: acceptedPossiblyEmptyStringArray(
        decision.anchor_review_decision_ids,
        `${path}.anchor_review_decision_ids`,
      ),
      resolved_onset: {
        date,
        precision,
        evidence_bindings: acceptedBindings(onset.evidence_bindings, `${path}.resolved_onset.evidence_bindings`),
      },
      routes,
      treatment,
      evidence_bindings: acceptedBindings(decision.evidence_bindings, `${path}.evidence_bindings`),
      reviewers: acceptedStringArray(decision.reviewers, `${path}.reviewers`),
      accepted_at: acceptedAt,
      rationale: acceptedString(decision.rationale, `${path}.rationale`),
    };
  });
  return {
    snapshot_version: OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION,
    decision_schema_version: OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION,
    decision_count: decisions.length,
    decisions,
  };
}

// Review decisions remain v1: occurrence contract v2 adds a deterministic phase projection from
// already-reviewed event/relation ids and does not broaden the accepted decision surface.
const _occurrenceContractSupportsReviewV1: 1 = OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION;
void _occurrenceContractSupportsReviewV1;
