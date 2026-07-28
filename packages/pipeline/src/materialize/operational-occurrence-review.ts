import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { OperationalAnchorReviewDecision } from "@mta-wiki/pipeline/materialize/operational-anchor-review";
import {
  applyOperationalOccurrenceReviewRetirements,
  loadOperationalProjectionRetirements,
  parseOperationalOccurrenceReviewRetirementProjectionV1,
  projectOperationalOccurrenceReviewRetirements,
  type LoadedOperationalProjectionRetirementV1,
  type OperationalOccurrenceReviewRetirementProjectionV1,
  type OperationalProjectionRetirementV1,
} from "@mta-wiki/pipeline/materialize/operational-projection-retirements";
import {
  parseOperationalOccurrence,
  assertOperationalOccurrenceCanonicalIntegrity,
  type OperationalOccurrenceEvidenceBinding,
  type OperationalOccurrenceRow,
} from "@mta-wiki/pipeline/materialize/operational-occurrences";

declare const projectionProofBrand: unique symbol;
export type OperationalOccurrenceV2ReviewProjectionProof = { readonly [projectionProofBrand]: true };
const authenticProjectionProofs = new WeakMap<object, ReadonlyMap<string, string>>();
export function proveOperationalOccurrenceV2ReviewProjection(rows: readonly OperationalOccurrenceRow[], records: readonly MtaCanonicalRecord[]): OperationalOccurrenceV2ReviewProjectionProof {
  const validated = assertOperationalOccurrenceCanonicalIntegrity(rows.map((row, index) => parseOperationalOccurrence(row, `review-v1 provenance row[${index}]`)), records);
  const proof = Object.freeze({}) as OperationalOccurrenceV2ReviewProjectionProof;
  authenticProjectionProofs.set(proof, new Map(validated.map((row) => [row.occurrence_id, stableJson(row as unknown as JsonValue)])));
  return proof;
}
function hasProjectionProof(proof: OperationalOccurrenceV2ReviewProjectionProof | undefined, row: OperationalOccurrenceRow): boolean { return Boolean(proof && authenticProjectionProofs.get(proof)?.get(row.occurrence_id) === stableJson(row as unknown as JsonValue)); }

export const OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION = 1 as const;
export const OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION = 1 as const;
export const OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_V2_VERSION = 2 as const;

export const OPERATIONAL_OCCURRENCE_REVIEW_V1_EVIDENCE_ROLES = [
  "bundle_analysis_family", "event_date", "route_identity", "route_scope",
  "route_treatment_event_bridge", "timeline_relation", "treatment_definition", "treatment_scope",
] as const;
export type OperationalOccurrenceReviewV1EvidenceRole =
  (typeof OPERATIONAL_OCCURRENCE_REVIEW_V1_EVIDENCE_ROLES)[number];
export type OperationalOccurrenceReviewV1EvidenceBinding =
  Omit<OperationalOccurrenceEvidenceBinding, "role"> & { role: OperationalOccurrenceReviewV1EvidenceRole };

export type OperationalOccurrenceAcceptedTreatment =
  | {
      kind: "atomic";
      member: {
        treatment_record_id: string;
        treatment_family: string;
        evidence_bindings: OperationalOccurrenceReviewV1EvidenceBinding[];
      };
    }
  | {
      kind: "bundle";
      analysis_family: string;
      analysis_family_evidence_bindings: OperationalOccurrenceReviewV1EvidenceBinding[];
      members: Array<{
        treatment_record_id: string;
        treatment_family: string;
        evidence_bindings: OperationalOccurrenceReviewV1EvidenceBinding[];
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
    evidence_bindings: OperationalOccurrenceReviewV1EvidenceBinding[];
  };
  routes: Array<{
    route_record_id: string;
    gtfs_route_id: string;
    evidence_bindings: OperationalOccurrenceReviewV1EvidenceBinding[];
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
        evidence_bindings: OperationalOccurrenceReviewV1EvidenceBinding[];
      };
    }
  | {
      kind: "bundle";
      bundle_family: string | null;
      bundle_family_evidence_bindings: OperationalOccurrenceReviewV1EvidenceBinding[];
      members: Array<{
        treatment_record_id: string;
        treatment_family: string;
        evidence_bindings: OperationalOccurrenceReviewV1EvidenceBinding[];
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
    evidence_bindings: OperationalOccurrenceReviewV1EvidenceBinding[];
  };
  routes: Array<{
    route_record_id: string;
    gtfs_route_id: string;
    evidence_bindings: OperationalOccurrenceReviewV1EvidenceBinding[];
  }>;
  treatment: OperationalOccurrenceReviewTreatment;
  evidence_bindings: OperationalOccurrenceReviewV1EvidenceBinding[];
  reviewers: string[];
  accepted_at: string;
  rationale: string;
};

export type OperationalOccurrenceReviewSnapshotV1 = {
  snapshot_version: typeof OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION;
  decision_schema_version: typeof OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION;
  decision_count: number;
  decisions: OperationalOccurrenceReviewDecision[];
};

export type OperationalOccurrenceReviewSnapshotV2 = {
  snapshot_version: typeof OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_V2_VERSION;
  decision_schema_version: typeof OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION;
  source_decision_count: number;
  decision_count: number;
  decisions: OperationalOccurrenceReviewDecision[];
  retirement_schema_version: 1;
  retirement_count: number;
  retirements: OperationalOccurrenceReviewRetirementProjectionV1[];
};

export type OperationalOccurrenceReviewSnapshot =
  | OperationalOccurrenceReviewSnapshotV1
  | OperationalOccurrenceReviewSnapshotV2;

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
const acceptedEvidenceRoles = new Set<OperationalOccurrenceReviewV1EvidenceRole>(
  OPERATIONAL_OCCURRENCE_REVIEW_V1_EVIDENCE_ROLES,
);
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

function acceptedBinding(value: unknown, path: string): OperationalOccurrenceReviewV1EvidenceBinding {
  const object = acceptedObject(value, path);
  acceptedKeys(object, acceptedBindingFields, path);
  const role = acceptedString(object.role, `${path}.role`);
  if (!acceptedEvidenceRoles.has(role as OperationalOccurrenceReviewV1EvidenceRole)) {
    throw new Error(`${path}.role is unsupported: ${role}`);
  }
  return {
    role: role as OperationalOccurrenceReviewV1EvidenceRole,
    record_id: acceptedString(object.record_id, `${path}.record_id`),
    source_id: acceptedString(object.source_id, `${path}.source_id`),
    evidence_id: acceptedString(object.evidence_id, `${path}.evidence_id`),
  };
}

function acceptedBindings(value: unknown, path: string): OperationalOccurrenceReviewV1EvidenceBinding[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path} must be a non-empty array`);
  const bindings = value.map((entry, index) => acceptedBinding(entry, `${path}[${index}]`));
  const keys = bindings.map((binding) => [binding.role, binding.record_id, binding.source_id, binding.evidence_id].join("|"));
  if (new Set(keys).size !== keys.length) throw new Error(`${path} must not contain duplicate bindings`);
  return bindings;
}

function acceptedPossiblyEmptyBindings(value: unknown, path: string): OperationalOccurrenceReviewV1EvidenceBinding[] {
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
  options: {
    rootDir?: string | undefined;
    includeRetired?: boolean | undefined;
    retirements?: readonly OperationalProjectionRetirementV1[] | undefined;
    optionalFixture?: boolean | undefined;
  } = {},
): OperationalOccurrenceAcceptedDecision[] {
  if (!existsSync(dir)) {
    if (options.optionalFixture) return [];
    throw new Error(`required operational occurrence review directory is missing: ${dir}`);
  }
  const rootDir = options.rootDir ?? repoRoot;
  const decisions = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const path = join(dir, name);
      const artifactPath = relative(rootDir, path).split("/").join("/");
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
  if (options.includeRetired) return decisions;
  const shouldApplyDefaultRetirements =
    resolve(dir) === resolve(operationalOccurrenceReviewAcceptedDir(rootDir));
  if (!shouldApplyDefaultRetirements && options.retirements === undefined) return decisions;
  const retirements = options.retirements ?? loadOperationalProjectionRetirements(rootDir);
  return applyOperationalOccurrenceReviewRetirements(decisions, retirements);
}

function projectReviewV1Binding(binding: OperationalOccurrenceEvidenceBinding, path: string, omitV2 = false): OperationalOccurrenceReviewV1EvidenceBinding | null {
  switch (binding.role) {
    case "bundle_analysis_family": case "event_date": case "route_identity": case "route_scope":
    case "route_treatment_event_bridge": case "timeline_relation": case "treatment_definition": case "treatment_scope":
      return {
        role: binding.role,
        record_id: binding.record_id,
        source_id: binding.source_id,
        evidence_id: binding.evidence_id,
      };
    case "phase_relation": case "physical_scope":
      if (!omitV2) throw new Error(`${path} cannot omit occurrence-v2 role ${binding.role} from review-v1 without verified alternate provenance`);
      return null;
    default: {
      const unsupported: never = binding.role;
      throw new Error(`${path} cannot project unsupported occurrence evidence role ${String(unsupported)}`);
    }
  }
}

function projectReviewV1Bindings(bindings: readonly OperationalOccurrenceEvidenceBinding[], path: string, omitV2 = false): OperationalOccurrenceReviewV1EvidenceBinding[] {
  return bindings.flatMap((binding, index) => {
    const projected = projectReviewV1Binding(binding, `${path}[${index}]`, omitV2);
    return projected ? [projected] : [];
  });
}

function treatmentBinding(row: OperationalOccurrenceRow): OperationalOccurrenceReviewTreatment {
  if (row.treatment.kind === "atomic") {
    return {
      kind: "atomic",
      member: {
        treatment_record_id: row.treatment.member.treatment_record_id,
        treatment_family: row.treatment.member.treatment_family,
        evidence_bindings: projectReviewV1Bindings(row.treatment.member.evidence_bindings, "review-v1 treatment.member.evidence_bindings"),
      },
    };
  }
  return {
    kind: "bundle",
    bundle_family: row.treatment.bundle_family,
    bundle_family_evidence_bindings: projectReviewV1Bindings(row.treatment.bundle_family_evidence_bindings, "review-v1 treatment.bundle_family_evidence_bindings"),
    members: row.treatment.members.map((member) => ({
      treatment_record_id: member.treatment_record_id,
      treatment_family: member.treatment_family,
      evidence_bindings: projectReviewV1Bindings(member.evidence_bindings, "review-v1 treatment.members[].evidence_bindings"),
    })),
  };
}

function decisionForRow(
  row: OperationalOccurrenceRow,
  anchorDecisionsById: ReadonlyMap<string, OperationalAnchorReviewDecision>,
  acceptedOccurrenceDecisionsById: ReadonlyMap<string, OperationalOccurrenceAcceptedDecision>,
  proof?: OperationalOccurrenceV2ReviewProjectionProof,
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
      evidence_bindings: projectReviewV1Bindings(row.resolved_onset.evidence_bindings, "review-v1 resolved_onset.evidence_bindings"),
    },
    routes: row.routes.map((route) => ({
      route_record_id: route.route_record_id,
      gtfs_route_id: route.gtfs_route_id,
      evidence_bindings: projectReviewV1Bindings(route.evidence_bindings, "review-v1 routes[].evidence_bindings"),
    })),
    treatment: treatmentBinding(row),
    evidence_bindings: projectReviewV1Bindings(row.evidence_bindings, "review-v1 evidence_bindings", hasProjectionProof(proof, row)),
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
  proof?: OperationalOccurrenceV2ReviewProjectionProof,
): OperationalOccurrenceReviewDecision[] {
  const anchorsById = new Map(anchorReviewDecisions.map((decision) => [decision.decision_id, decision]));
  const acceptedOccurrencesById = new Map(
    acceptedOccurrenceDecisions.map((decision) => [decision.decision_id, decision]),
  );
  return [...rows]
    .sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id))
    .map((row) => decisionForRow(row, anchorsById, acceptedOccurrencesById, proof));
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

function rowBinding(value: OperationalOccurrenceRow, proof?: OperationalOccurrenceV2ReviewProjectionProof): unknown {
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
    evidence_bindings: projectReviewV1Bindings(value.evidence_bindings, "review-v1 parity evidence_bindings", hasProjectionProof(proof, value)),
  };
}

export function assertOperationalOccurrenceReviewDecisions(
  decisions: readonly OperationalOccurrenceReviewDecision[],
  rows: readonly OperationalOccurrenceRow[],
  proof?: OperationalOccurrenceV2ReviewProjectionProof,
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
    if (stableJson(projectionBinding(decision) as JsonValue) !== stableJson(rowBinding(row, proof) as JsonValue)) {
      throw new Error(`occurrence review ${decision.decision_id} is stale for occurrence ${decision.occurrence_id}`);
    }
  }
  if (occurrenceIds.size !== rowsById.size) throw new Error("every released occurrence must have one approved occurrence review decision");
  return [...decisions].sort((left, right) => left.decision_id.localeCompare(right.decision_id));
}

export function operationalOccurrenceReviewSnapshot(
  decisions: readonly OperationalOccurrenceReviewDecision[],
  retirements: readonly LoadedOperationalProjectionRetirementV1[] = [],
): OperationalOccurrenceReviewSnapshot {
  const sorted = [...decisions].sort((left, right) => left.decision_id.localeCompare(right.decision_id));
  if (retirements.length === 0) return {
    snapshot_version: OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION,
    decision_schema_version: OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION,
    decision_count: sorted.length,
    decisions: sorted,
  };
  const projectedRetirements = projectOperationalOccurrenceReviewRetirements(retirements);
  return {
    snapshot_version: OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_V2_VERSION,
    decision_schema_version: OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION,
    source_decision_count: sorted.length + projectedRetirements.length,
    decision_count: sorted.length,
    decisions: sorted,
    retirement_schema_version: 1,
    retirement_count: projectedRetirements.length,
    retirements: projectedRetirements,
  };
}

export function operationalOccurrenceReviewSnapshotJson(
  decisions: readonly OperationalOccurrenceReviewDecision[],
  retirements: readonly LoadedOperationalProjectionRetirementV1[] = [],
): string {
  const json = `${stableJson(operationalOccurrenceReviewSnapshot(decisions, retirements) as unknown as JsonValue)}\n`;
  try {
    parseOperationalOccurrenceReviewSnapshot(JSON.parse(json) as unknown);
  } catch (error) {
    const version = retirements.length === 0
      ? OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION
      : OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_V2_VERSION;
    throw new Error(`operational occurrence review snapshot v${version} encode/decode failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return json;
}

export function parseOperationalOccurrenceReviewSnapshot(value: unknown): OperationalOccurrenceReviewSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("operational occurrence review snapshot must be an object");
  }
  const object = value as Record<string, unknown>;
  const snapshotVersion = object.snapshot_version;
  if (snapshotVersion !== 1 && snapshotVersion !== 2) {
    throw new Error("operational occurrence review snapshot.snapshot_version must be 1 or 2");
  }
  const extras = Object.keys(object)
    .filter((field) => !new Set(snapshotVersion === 1
      ? ["decision_count", "decision_schema_version", "decisions", "snapshot_version"]
      : [
          "decision_count", "decision_schema_version", "decisions", "retirement_count",
          "retirement_schema_version", "retirements", "snapshot_version", "source_decision_count",
        ]).has(field))
    .sort();
  if (extras.length > 0) throw new Error(`operational occurrence review snapshot has unknown field(s): ${extras.join(", ")}`);
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
  const decisionIds = decisions.map((decision) => decision.decision_id);
  if (new Set(decisionIds).size !== decisions.length) {
    throw new Error("operational occurrence review snapshot has duplicate decision_id");
  }
  if (decisionIds.join("\n") !== [...decisionIds].sort().join("\n")) {
    throw new Error("operational occurrence review snapshot decisions must be sorted by decision_id");
  }
  if (snapshotVersion === 1) {
    return {
      snapshot_version: OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION,
      decision_schema_version: OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION,
      decision_count: decisions.length,
      decisions,
    };
  }
  if (object.retirement_schema_version !== 1) {
    throw new Error("operational occurrence review snapshot.retirement_schema_version must be 1");
  }
  if (!Array.isArray(object.retirements)) {
    throw new Error("operational occurrence review snapshot.retirements must be an array");
  }
  if (!Number.isInteger(object.retirement_count) || object.retirement_count !== object.retirements.length) {
    throw new Error("operational occurrence review snapshot.retirement_count must equal retirements length");
  }
  const retirements = object.retirements.map((entry, index) =>
    parseOperationalOccurrenceReviewRetirementProjectionV1(
      entry,
      `operational occurrence review snapshot.retirements[${index}]`,
    ));
  const retiredDecisionIds = retirements.map((entry) => entry.target.decision_id);
  if (
    new Set(retiredDecisionIds).size !== retiredDecisionIds.length ||
    retiredDecisionIds.join("\n") !== [...retiredDecisionIds].sort().join("\n")
  ) {
    throw new Error("operational occurrence review snapshot retirements must be sorted and unique by decision_id");
  }
  if (retiredDecisionIds.some((decisionId) => decisions.some((decision) => decision.decision_id === decisionId))) {
    throw new Error("operational occurrence review snapshot active and retired decisions must be disjoint");
  }
  if (
    !Number.isInteger(object.source_decision_count) ||
    object.source_decision_count !== decisions.length + retirements.length
  ) {
    throw new Error("operational occurrence review snapshot.source_decision_count must equal active plus retired decisions");
  }
  return {
    snapshot_version: 2,
    decision_schema_version: 1,
    source_decision_count: decisions.length + retirements.length,
    decision_count: decisions.length,
    decisions,
    retirement_schema_version: 1,
    retirement_count: retirements.length,
    retirements,
  };
}

// Review-v1 contains only evidence explicitly present on the human-approved decision surface.
// Occurrence-v2 phase and physical-scope relationships remain separately evidenced projections.
const _occurrenceContractSupportsReviewV1: 1 = OPERATIONAL_OCCURRENCE_REVIEW_SCHEMA_VERSION;
void _occurrenceContractSupportsReviewV1;

export const OPERATIONAL_OCCURRENCE_REVIEW_V2_SCHEMA_VERSION = 2 as const;
export const OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_V3_VERSION = 3 as const;

export const OPERATIONAL_OCCURRENCE_APPLICATION_ACTIONS = [
  "add",
  "modify",
  "remove",
  "suspend",
  "resume",
  "retain",
  "unknown",
] as const;
export type OperationalOccurrenceApplicationAction =
  (typeof OPERATIONAL_OCCURRENCE_APPLICATION_ACTIONS)[number];

export type OperationalOccurrenceReviewApplication = {
  route_record_id: string;
  gtfs_route_id: string;
  treatment_record_id: string;
  phase_record_id: string | null;
  action: OperationalOccurrenceApplicationAction;
  physical_scope_record_ids: string[];
  evidence_bindings: OperationalOccurrenceEvidenceBinding[];
};

export type OperationalOccurrenceAcceptedDecisionV2 = {
  schema_version: 2;
  decision_id: string;
  review_state: "approved";
  occurrence_id: string;
  founding_key: string;
  anchor_review_decision_ids: string[];
  observation_event_record_ids: string[];
  observation_relation_record_ids: string[];
  resolution_cluster_id: string | null;
  phase_record_ids: string[];
  phase_relation_record_ids: string[];
  physical_scope_record_ids: string[];
  physical_scope_relation_record_ids: string[];
  resolved_onset: OperationalOccurrenceReviewDecision["resolved_onset"];
  routes: OperationalOccurrenceReviewDecision["routes"];
  treatment: OperationalOccurrenceReviewTreatment;
  applications: OperationalOccurrenceReviewApplication[];
  evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  reviewers: string[];
  accepted_at: string;
  rationale: string;
  review_scope: "full_episode_application" | "lossless_v1_migration";
  membership_fingerprint: string;
};

export type OperationalOccurrenceReviewSnapshotV3 = {
  snapshot_version: 3;
  decision_schema_version: 2;
  decision_count: number;
  decisions: OperationalOccurrenceAcceptedDecisionV2[];
};

const v2DecisionFields = new Set([
  "accepted_at",
  "anchor_review_decision_ids",
  "applications",
  "decision_id",
  "evidence_bindings",
  "founding_key",
  "membership_fingerprint",
  "observation_event_record_ids",
  "observation_relation_record_ids",
  "occurrence_id",
  "phase_record_ids",
  "phase_relation_record_ids",
  "physical_scope_record_ids",
  "physical_scope_relation_record_ids",
  "rationale",
  "resolution_cluster_id",
  "resolved_onset",
  "review_scope",
  "review_state",
  "reviewers",
  "routes",
  "schema_version",
  "treatment",
]);
const applicationFields = new Set([
  "action",
  "evidence_bindings",
  "gtfs_route_id",
  "phase_record_id",
  "physical_scope_record_ids",
  "route_record_id",
  "treatment_record_id",
]);
const v2BindingFields = new Set(["evidence_id", "record_id", "role", "source_id"]);
const v2EvidenceRoles = new Set<OperationalOccurrenceEvidenceBinding["role"]>([
  ...OPERATIONAL_OCCURRENCE_REVIEW_V1_EVIDENCE_ROLES,
  "phase_relation",
  "physical_scope",
]);

function uniqueSortedV2(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function v2Binding(value: unknown, path: string): OperationalOccurrenceEvidenceBinding {
  const input = acceptedObject(value, path);
  acceptedKeys(input, v2BindingFields, path);
  const role = acceptedString(input.role, `${path}.role`);
  if (!v2EvidenceRoles.has(role as OperationalOccurrenceEvidenceBinding["role"])) {
    throw new Error(`${path}.role is unsupported: ${role}`);
  }
  return {
    role: role as OperationalOccurrenceEvidenceBinding["role"],
    record_id: acceptedString(input.record_id, `${path}.record_id`),
    source_id: acceptedString(input.source_id, `${path}.source_id`),
    evidence_id: acceptedString(input.evidence_id, `${path}.evidence_id`),
  };
}

function v2Bindings(
  value: unknown,
  path: string,
  options: { allowEmpty?: boolean } = {},
): OperationalOccurrenceEvidenceBinding[] {
  if (!Array.isArray(value) || (!options.allowEmpty && value.length === 0)) {
    throw new Error(`${path} must be ${options.allowEmpty ? "an" : "a non-empty"} array`);
  }
  const bindings = value.map((entry, index) => v2Binding(entry, `${path}[${index}]`));
  const sorted = [...bindings].sort((left, right) =>
    [left.role, left.record_id, left.source_id, left.evidence_id].join("|").localeCompare(
      [right.role, right.record_id, right.source_id, right.evidence_id].join("|"),
    )
  );
  const keys = sorted.map((binding) =>
    [binding.role, binding.record_id, binding.source_id, binding.evidence_id].join("|")
  );
  if (new Set(keys).size !== keys.length) throw new Error(`${path} must not contain duplicate bindings`);
  return sorted;
}

function v2StringArray(
  value: unknown,
  path: string,
  options: { allowEmpty?: boolean } = {},
): string[] {
  const values = options.allowEmpty
    ? acceptedPossiblyEmptyStringArray(value, path)
    : acceptedStringArray(value, path);
  return [...values].sort((left, right) => left.localeCompare(right));
}

function parseV2BaseDecision(
  input: Record<string, unknown>,
  path: string,
): OperationalOccurrenceReviewDecision {
  const snapshot = parseOperationalOccurrenceReviewSnapshot({
    snapshot_version: 1,
    decision_schema_version: 1,
    decision_count: 1,
    decisions: [{
      schema_version: 1,
      decision_id: input.decision_id,
      review_state: input.review_state,
      occurrence_id: input.occurrence_id,
      founding_key: input.founding_key,
      anchor_review_decision_ids: input.anchor_review_decision_ids,
      resolved_onset: input.resolved_onset,
      routes: input.routes,
      treatment: input.treatment,
      evidence_bindings: (input.evidence_bindings as unknown[]).filter((binding) =>
        !["phase_relation", "physical_scope"].includes(
          String((binding as Record<string, unknown>).role),
        )
      ),
      reviewers: input.reviewers,
      accepted_at: input.accepted_at,
      rationale: input.rationale,
    }],
  });
  const decision = snapshot.decisions[0];
  if (!decision) throw new Error(`${path} cannot parse legacy-compatible decision fields`);
  return decision;
}

function membershipProjection(
  decision: Omit<OperationalOccurrenceAcceptedDecisionV2, "membership_fingerprint">,
): JsonValue {
  return {
    applications: decision.applications,
    evidence_bindings: decision.evidence_bindings,
    founding_key: decision.founding_key,
    observation_event_record_ids: decision.observation_event_record_ids,
    observation_relation_record_ids: decision.observation_relation_record_ids,
    occurrence_id: decision.occurrence_id,
    phase_record_ids: decision.phase_record_ids,
    phase_relation_record_ids: decision.phase_relation_record_ids,
    physical_scope_record_ids: decision.physical_scope_record_ids,
    physical_scope_relation_record_ids: decision.physical_scope_relation_record_ids,
    resolution_cluster_id: decision.resolution_cluster_id,
    resolved_onset: decision.resolved_onset,
    routes: decision.routes,
    treatment: decision.treatment,
  } as unknown as JsonValue;
}

export function operationalOccurrenceReviewMembershipFingerprint(
  decision: Omit<OperationalOccurrenceAcceptedDecisionV2, "membership_fingerprint">,
): string {
  return createHash("sha256")
    .update(stableJson(membershipProjection(decision)))
    .digest("hex");
}

export function parseOperationalOccurrenceAcceptedDecisionV2(
  value: unknown,
  path = "operational occurrence accepted decision v2",
): OperationalOccurrenceAcceptedDecisionV2 {
  const input = acceptedObject(value, path);
  acceptedKeys(input, v2DecisionFields, path);
  if (input.schema_version !== OPERATIONAL_OCCURRENCE_REVIEW_V2_SCHEMA_VERSION) {
    throw new Error(`${path}.schema_version must be 2`);
  }
  if (!Array.isArray(input.evidence_bindings)) throw new Error(`${path}.evidence_bindings must be an array`);
  const base = parseV2BaseDecision(input, path);
  const applicationsInput = input.applications;
  if (!Array.isArray(applicationsInput) || applicationsInput.length === 0) {
    throw new Error(`${path}.applications must be a non-empty array`);
  }
  const applications = applicationsInput.map((entry, index): OperationalOccurrenceReviewApplication => {
    const applicationPath = `${path}.applications[${index}]`;
    const application = acceptedObject(entry, applicationPath);
    acceptedKeys(application, applicationFields, applicationPath);
    const action = acceptedString(application.action, `${applicationPath}.action`);
    if (!OPERATIONAL_OCCURRENCE_APPLICATION_ACTIONS.includes(action as OperationalOccurrenceApplicationAction)) {
      throw new Error(`${applicationPath}.action is unsupported: ${action}`);
    }
    const phaseRecordId = application.phase_record_id === null
      ? null
      : acceptedString(application.phase_record_id, `${applicationPath}.phase_record_id`);
    return {
      route_record_id: acceptedString(application.route_record_id, `${applicationPath}.route_record_id`),
      gtfs_route_id: acceptedString(application.gtfs_route_id, `${applicationPath}.gtfs_route_id`),
      treatment_record_id: acceptedString(
        application.treatment_record_id,
        `${applicationPath}.treatment_record_id`,
      ),
      phase_record_id: phaseRecordId,
      action: action as OperationalOccurrenceApplicationAction,
      physical_scope_record_ids: v2StringArray(
        application.physical_scope_record_ids,
        `${applicationPath}.physical_scope_record_ids`,
        { allowEmpty: true },
      ),
      evidence_bindings: v2Bindings(
        application.evidence_bindings,
        `${applicationPath}.evidence_bindings`,
      ),
    };
  }).sort((left, right) =>
    [
      left.route_record_id,
      left.gtfs_route_id,
      left.treatment_record_id,
      left.phase_record_id ?? "",
      left.action,
    ].join("|").localeCompare([
      right.route_record_id,
      right.gtfs_route_id,
      right.treatment_record_id,
      right.phase_record_id ?? "",
      right.action,
    ].join("|"))
  );
  const applicationKeys = applications.map((application) =>
    [
      application.route_record_id,
      application.gtfs_route_id,
      application.treatment_record_id,
      application.phase_record_id ?? "",
    ].join("|")
  );
  if (new Set(applicationKeys).size !== applicationKeys.length) {
    throw new Error(`${path}.applications must not contain duplicate incidence rows`);
  }
  const reviewScope = acceptedString(input.review_scope, `${path}.review_scope`);
  if (reviewScope !== "full_episode_application" && reviewScope !== "lossless_v1_migration") {
    throw new Error(`${path}.review_scope is unsupported: ${reviewScope}`);
  }
  const decisionWithoutFingerprint: Omit<
    OperationalOccurrenceAcceptedDecisionV2,
    "membership_fingerprint"
  > = {
    schema_version: 2,
    decision_id: base.decision_id,
    review_state: "approved",
    occurrence_id: base.occurrence_id,
    founding_key: base.founding_key,
    anchor_review_decision_ids: [...base.anchor_review_decision_ids].sort(),
    observation_event_record_ids: v2StringArray(
      input.observation_event_record_ids,
      `${path}.observation_event_record_ids`,
    ),
    observation_relation_record_ids: v2StringArray(
      input.observation_relation_record_ids,
      `${path}.observation_relation_record_ids`,
      { allowEmpty: true },
    ),
    resolution_cluster_id:
      input.resolution_cluster_id === null
        ? null
        : acceptedString(input.resolution_cluster_id, `${path}.resolution_cluster_id`),
    phase_record_ids: v2StringArray(input.phase_record_ids, `${path}.phase_record_ids`),
    phase_relation_record_ids: v2StringArray(
      input.phase_relation_record_ids,
      `${path}.phase_relation_record_ids`,
      { allowEmpty: true },
    ),
    physical_scope_record_ids: v2StringArray(
      input.physical_scope_record_ids,
      `${path}.physical_scope_record_ids`,
      { allowEmpty: true },
    ),
    physical_scope_relation_record_ids: v2StringArray(
      input.physical_scope_relation_record_ids,
      `${path}.physical_scope_relation_record_ids`,
      { allowEmpty: true },
    ),
    resolved_onset: base.resolved_onset,
    routes: [...base.routes].sort((left, right) =>
      left.route_record_id.localeCompare(right.route_record_id)
    ),
    treatment: base.treatment,
    applications,
    evidence_bindings: v2Bindings(input.evidence_bindings, `${path}.evidence_bindings`),
    reviewers: [...base.reviewers].sort(),
    accepted_at: base.accepted_at,
    rationale: base.rationale,
    review_scope: reviewScope,
  };
  const expectedFingerprint = operationalOccurrenceReviewMembershipFingerprint(
    decisionWithoutFingerprint,
  );
  const fingerprint = acceptedString(
    input.membership_fingerprint,
    `${path}.membership_fingerprint`,
  );
  if (!/^[a-f0-9]{64}$/u.test(fingerprint) || fingerprint !== expectedFingerprint) {
    throw new Error(`${path}.membership_fingerprint is stale`);
  }
  return { ...decisionWithoutFingerprint, membership_fingerprint: fingerprint };
}

function treatmentMembers(
  treatment: OperationalOccurrenceReviewTreatment,
): Array<{ treatment_record_id: string; evidence_bindings: OperationalOccurrenceEvidenceBinding[] }> {
  return treatment.kind === "atomic"
    ? [{
        treatment_record_id: treatment.member.treatment_record_id,
        evidence_bindings: treatment.member.evidence_bindings,
      }]
    : treatment.members.map((member) => ({
        treatment_record_id: member.treatment_record_id,
        evidence_bindings: member.evidence_bindings,
      }));
}

function rowObservationEventIds(row: OperationalOccurrenceRow): string[] {
  return uniqueSortedV2(row.observations.map((observation) => observation.event_record_id));
}

function rowObservationRelationIds(row: OperationalOccurrenceRow): string[] {
  return uniqueSortedV2(row.observations.flatMap((observation) => observation.relation_record_ids));
}

function losslessApplications(
  row: OperationalOccurrenceRow,
  treatment: OperationalOccurrenceReviewTreatment,
): OperationalOccurrenceReviewApplication[] {
  const members = treatmentMembers(treatment);
  if (row.routes.length > 1 && members.length > 1) {
    throw new Error(
      `occurrence ${row.occurrence_id} requires explicit route-treatment application review`,
    );
  }
  if (row.phase_record_ids.length !== 1) {
    throw new Error(`occurrence ${row.occurrence_id} requires explicit phase application review`);
  }
  return row.routes.flatMap((route) =>
    members.map((member) => {
      const bindings = v2Bindings([
        ...route.evidence_bindings,
        ...member.evidence_bindings,
        ...row.phase_relation_evidence_bindings,
        ...row.physical_scope_evidence_bindings,
      ], `occurrence ${row.occurrence_id} application evidence`);
      return {
        route_record_id: route.route_record_id,
        gtfs_route_id: route.gtfs_route_id,
        treatment_record_id: member.treatment_record_id,
        phase_record_id: row.phase_record_ids[0]!,
        action: "unknown" as const,
        physical_scope_record_ids: [...row.physical_scope_record_ids].sort(),
        evidence_bindings: bindings,
      };
    })
  ).sort((left, right) =>
    [left.route_record_id, left.treatment_record_id].join("|").localeCompare(
      [right.route_record_id, right.treatment_record_id].join("|"),
    )
  );
}

export function migrateOperationalOccurrenceReviewDecisionV2(
  row: OperationalOccurrenceRow,
  legacyDecision: OperationalOccurrenceReviewDecision,
): OperationalOccurrenceAcceptedDecisionV2 {
  if (row.occurrence_id !== legacyDecision.occurrence_id) {
    throw new Error(`legacy review ${legacyDecision.decision_id} does not bind ${row.occurrence_id}`);
  }
  const treatment = treatmentBinding(row);
  const applications = losslessApplications(row, treatment);
  const withoutFingerprint: Omit<
    OperationalOccurrenceAcceptedDecisionV2,
    "membership_fingerprint"
  > = {
    schema_version: 2,
    decision_id: legacyDecision.decision_id,
    review_state: "approved",
    occurrence_id: row.occurrence_id,
    founding_key: row.founding_key,
    anchor_review_decision_ids: [...legacyDecision.anchor_review_decision_ids].sort(),
    observation_event_record_ids: rowObservationEventIds(row),
    observation_relation_record_ids: rowObservationRelationIds(row),
    resolution_cluster_id: row.resolution_cluster_id,
    phase_record_ids: [...row.phase_record_ids].sort(),
    phase_relation_record_ids: [...row.phase_relation_record_ids].sort(),
    physical_scope_record_ids: [...row.physical_scope_record_ids].sort(),
    physical_scope_relation_record_ids: [...row.physical_scope_relation_record_ids].sort(),
    resolved_onset: legacyDecision.resolved_onset,
    routes: [...legacyDecision.routes].sort((left, right) =>
      left.route_record_id.localeCompare(right.route_record_id)
    ),
    treatment,
    applications,
    evidence_bindings: v2Bindings(
      row.evidence_bindings,
      `occurrence ${row.occurrence_id} evidence_bindings`,
    ),
    reviewers: [...legacyDecision.reviewers].sort(),
    accepted_at: legacyDecision.accepted_at,
    rationale: legacyDecision.rationale,
    review_scope: "lossless_v1_migration",
  };
  return {
    ...withoutFingerprint,
    membership_fingerprint:
      operationalOccurrenceReviewMembershipFingerprint(withoutFingerprint),
  };
}

function exactRowMembership(row: OperationalOccurrenceRow): JsonValue {
  return {
    applications: losslessApplications(row, treatmentBinding(row)),
    founding_key: row.founding_key,
    observation_event_record_ids: rowObservationEventIds(row),
    observation_relation_record_ids: rowObservationRelationIds(row),
    occurrence_id: row.occurrence_id,
    phase_record_ids: [...row.phase_record_ids].sort(),
    phase_relation_record_ids: [...row.phase_relation_record_ids].sort(),
    physical_scope_record_ids: [...row.physical_scope_record_ids].sort(),
    physical_scope_relation_record_ids: [...row.physical_scope_relation_record_ids].sort(),
    resolution_cluster_id: row.resolution_cluster_id,
  } as unknown as JsonValue;
}

function exactDecisionMembership(
  decision: OperationalOccurrenceAcceptedDecisionV2,
): JsonValue {
  return {
    applications: decision.applications,
    founding_key: decision.founding_key,
    observation_event_record_ids: decision.observation_event_record_ids,
    observation_relation_record_ids: decision.observation_relation_record_ids,
    occurrence_id: decision.occurrence_id,
    phase_record_ids: decision.phase_record_ids,
    phase_relation_record_ids: decision.phase_relation_record_ids,
    physical_scope_record_ids: decision.physical_scope_record_ids,
    physical_scope_relation_record_ids: decision.physical_scope_relation_record_ids,
    resolution_cluster_id: decision.resolution_cluster_id,
  } as unknown as JsonValue;
}

export function assertOperationalOccurrenceReviewDecisionsV2(
  decisions: readonly OperationalOccurrenceAcceptedDecisionV2[],
  rows: readonly OperationalOccurrenceRow[],
): OperationalOccurrenceAcceptedDecisionV2[] {
  const parsed = decisions.map((decision, index) =>
    parseOperationalOccurrenceAcceptedDecisionV2(decision, `occurrence review v2[${index}]`)
  );
  const rowsById = new Map(rows.map((row) => [row.occurrence_id, row]));
  if (new Set(parsed.map((decision) => decision.decision_id)).size !== parsed.length) {
    throw new Error("duplicate occurrence review v2 decision_id");
  }
  if (new Set(parsed.map((decision) => decision.occurrence_id)).size !== parsed.length) {
    throw new Error("duplicate occurrence review v2 occurrence_id");
  }
  for (const decision of parsed) {
    const row = rowsById.get(decision.occurrence_id);
    if (!row) throw new Error(`occurrence review v2 ${decision.decision_id} references missing occurrence`);
    if (
      stableJson(exactDecisionMembership(decision)) !==
      stableJson(exactRowMembership(row))
    ) {
      throw new Error(
        `occurrence review v2 ${decision.decision_id} is stale for exact episode membership`,
      );
    }
  }
  return [...parsed].sort((left, right) =>
    left.decision_id.localeCompare(right.decision_id)
  );
}

export function operationalOccurrenceReviewSnapshotV3(
  decisions: readonly OperationalOccurrenceAcceptedDecisionV2[],
): OperationalOccurrenceReviewSnapshotV3 {
  const sorted = [...decisions].sort((left, right) =>
    left.decision_id.localeCompare(right.decision_id)
  );
  return {
    snapshot_version: 3,
    decision_schema_version: 2,
    decision_count: sorted.length,
    decisions: sorted,
  };
}

export function operationalOccurrenceReviewSnapshotV3Json(
  decisions: readonly OperationalOccurrenceAcceptedDecisionV2[],
): string {
  const snapshot = operationalOccurrenceReviewSnapshotV3(decisions);
  const text = `${stableJson(snapshot as unknown as JsonValue)}\n`;
  parseOperationalOccurrenceReviewSnapshotV3(JSON.parse(text) as unknown);
  return text;
}

export function parseOperationalOccurrenceReviewSnapshotV3(
  value: unknown,
): OperationalOccurrenceReviewSnapshotV3 {
  const input = acceptedObject(value, "operational occurrence review snapshot v3");
  acceptedKeys(input, new Set([
    "decision_count",
    "decision_schema_version",
    "decisions",
    "snapshot_version",
  ]), "operational occurrence review snapshot v3");
  if (
    input.snapshot_version !== OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_V3_VERSION ||
    input.decision_schema_version !== OPERATIONAL_OCCURRENCE_REVIEW_V2_SCHEMA_VERSION
  ) {
    throw new Error("operational occurrence review snapshot v3 contract versions are invalid");
  }
  if (!Array.isArray(input.decisions)) {
    throw new Error("operational occurrence review snapshot v3.decisions must be an array");
  }
  const decisions = input.decisions.map((decision, index) =>
    parseOperationalOccurrenceAcceptedDecisionV2(
      decision,
      `operational occurrence review snapshot v3.decisions[${index}]`,
    )
  );
  if (input.decision_count !== decisions.length) {
    throw new Error("operational occurrence review snapshot v3.decision_count is stale");
  }
  const ids = decisions.map((decision) => decision.decision_id);
  if (
    new Set(ids).size !== ids.length ||
    ids.join("\n") !== [...ids].sort().join("\n")
  ) {
    throw new Error("operational occurrence review snapshot v3 decisions must be sorted and unique");
  }
  return {
    snapshot_version: 3,
    decision_schema_version: 2,
    decision_count: decisions.length,
    decisions,
  };
}

export function operationalOccurrenceReviewAcceptedV2Dir(
  rootDir = repoRoot,
): string {
  return join(
    rootDir,
    "data",
    "operational-occurrence-review",
    "accepted-v2",
    "decisions",
  );
}

export function loadOperationalOccurrenceAcceptedDecisionsV2(
  dir = operationalOccurrenceReviewAcceptedV2Dir(),
  options: { optionalFixture?: boolean } = {},
): OperationalOccurrenceAcceptedDecisionV2[] {
  if (!existsSync(dir)) {
    if (options.optionalFixture) return [];
    throw new Error(`required operational occurrence review-v2 directory is missing: ${dir}`);
  }
  const names = readdirSync(dir);
  const unsupported = names.filter((name) => !name.endsWith(".json")).sort();
  if (unsupported.length > 0) {
    throw new Error(
      `operational occurrence review-v2 directory contains unsupported entries: ${unsupported.join(", ")}`,
    );
  }
  const decisions = names
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const path = join(dir, name);
      const decision = parseOperationalOccurrenceAcceptedDecisionV2(
        JSON.parse(readFileSync(path, "utf8")) as unknown,
        path,
      );
      if (`${decision.decision_id}.json` !== basename(path)) {
        throw new Error(`${path}: decision_id must match the file name`);
      }
      return decision;
    });
  if (new Set(decisions.map((decision) => decision.decision_id)).size !== decisions.length) {
    throw new Error("operational occurrence review-v2 decision ids must be unique");
  }
  return decisions;
}
