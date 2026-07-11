import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";

export const OPERATIONAL_ANCHOR_REVIEW_SCHEMA_VERSION = 1 as const;
export const OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION = 1 as const;

export type OperationalAnchorReviewEvidenceRole =
  | "event_date"
  | "route_identity"
  | "route_scope"
  | "route_treatment_event_bridge"
  | "timeline_relation"
  | "treatment_definition"
  | "treatment_scope";

export type OperationalAnchorReviewEvidenceBinding = {
  role: OperationalAnchorReviewEvidenceRole;
  record_id: string;
  source_id: string;
  evidence_id: string;
};

export type OperationalAnchorReviewDecision = {
  artifact_path?: string | undefined;
  schema_version: typeof OPERATIONAL_ANCHOR_REVIEW_SCHEMA_VERSION;
  decision_id: string;
  review_state: "accepted";
  accepted_at: string;
  reviewer: string;
  rationale: string;
  source_id: string;
  event_record_id: string;
  timeline_relation_record_id: string;
  route_record_id: string;
  route_scope_relation_record_id: string;
  treatment_record_id: string;
  treatment_scope_relation_record_id: string;
  treatment_family: string;
  expected_operational_date: string;
  expected_date_precision: "day" | "month";
  evidence_bindings: OperationalAnchorReviewEvidenceBinding[];
};

export type OperationalAnchorReviewSnapshotDecision = Omit<OperationalAnchorReviewDecision, "artifact_path">;

export type OperationalAnchorReviewSnapshot = {
  snapshot_version: typeof OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION;
  decision_schema_version: typeof OPERATIONAL_ANCHOR_REVIEW_SCHEMA_VERSION;
  decision_count: number;
  decisions: OperationalAnchorReviewSnapshotDecision[];
};

export type OperationalAnchorReviewQuarantine = {
  decision_id: string;
  artifact_path: string | null;
  code: "conflicting_operational_anchor_review" | "invalid_operational_anchor_review";
  reasons: string[];
};

export type OperationalAnchorReviewValidationReport = {
  accepted: OperationalAnchorReviewDecision[];
  quarantined: OperationalAnchorReviewQuarantine[];
};

const evidenceRoles = new Set<OperationalAnchorReviewEvidenceRole>([
  "event_date",
  "route_identity",
  "route_scope",
  "route_treatment_event_bridge",
  "timeline_relation",
  "treatment_definition",
  "treatment_scope",
]);

const requiredEvidenceRoles = [...evidenceRoles].sort();
const topLevelFields = new Set([
  "accepted_at",
  "decision_id",
  "event_record_id",
  "evidence_bindings",
  "expected_date_precision",
  "expected_operational_date",
  "rationale",
  "review_state",
  "reviewer",
  "route_record_id",
  "route_scope_relation_record_id",
  "schema_version",
  "source_id",
  "timeline_relation_record_id",
  "treatment_family",
  "treatment_record_id",
  "treatment_scope_relation_record_id",
]);
const evidenceBindingFields = new Set(["evidence_id", "record_id", "role", "source_id"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: JsonValue | undefined): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function requiredString(object: Record<string, unknown>, field: string, path: string): string {
  const value = object[field];
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`${path}: ${field} must be a non-empty string`);
}

function rejectUnknownFields(object: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): void {
  const unknown = Object.keys(object).filter((field) => !allowed.has(field)).sort();
  if (unknown.length > 0) throw new Error(`${path}: unknown field(s): ${unknown.join(", ")}`);
}

function parseEvidenceBindings(value: unknown, sourceId: string, path: string): OperationalAnchorReviewEvidenceBinding[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path}: evidence_bindings must be a non-empty array`);
  const bindings = value.map((entry, index) => {
    const bindingPath = `${path}: evidence_bindings[${index}]`;
    if (!isObject(entry)) throw new Error(`${bindingPath} must be an object`);
    rejectUnknownFields(entry, evidenceBindingFields, bindingPath);
    const roleValue = requiredString(entry, "role", bindingPath);
    if (!evidenceRoles.has(roleValue as OperationalAnchorReviewEvidenceRole)) {
      throw new Error(`${bindingPath}: unsupported role ${roleValue}`);
    }
    const bindingSourceId = requiredString(entry, "source_id", bindingPath);
    if (bindingSourceId !== sourceId) {
      throw new Error(`${bindingPath}: source_id must equal the decision source_id ${sourceId}`);
    }
    return {
      role: roleValue as OperationalAnchorReviewEvidenceRole,
      record_id: requiredString(entry, "record_id", bindingPath),
      source_id: bindingSourceId,
      evidence_id: requiredString(entry, "evidence_id", bindingPath),
    };
  });
  const duplicateKeys = new Set<string>();
  for (const binding of bindings) {
    const key = [binding.role, binding.record_id, binding.source_id, binding.evidence_id].join("|");
    if (duplicateKeys.has(key)) throw new Error(`${path}: duplicate evidence binding ${key}`);
    duplicateKeys.add(key);
  }
  return bindings;
}

function parseDecision(path: string): OperationalAnchorReviewDecision {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`${relative(repoRoot, path)}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const artifactPath = relative(repoRoot, path).split("/").join("/");
  if (!isObject(parsed)) throw new Error(`${artifactPath}: decision must be an object`);
  rejectUnknownFields(parsed, topLevelFields, artifactPath);
  if (parsed.schema_version !== OPERATIONAL_ANCHOR_REVIEW_SCHEMA_VERSION) {
    throw new Error(`${artifactPath}: schema_version must be ${OPERATIONAL_ANCHOR_REVIEW_SCHEMA_VERSION}`);
  }
  if (parsed.review_state !== "accepted") throw new Error(`${artifactPath}: review_state must be accepted`);
  const decisionId = requiredString(parsed, "decision_id", artifactPath);
  if (`${decisionId}.json` !== basename(path)) {
    throw new Error(`${artifactPath}: decision_id must match the file name`);
  }
  const acceptedAt = requiredString(parsed, "accepted_at", artifactPath);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(acceptedAt) || Number.isNaN(Date.parse(acceptedAt))) {
    throw new Error(`${artifactPath}: accepted_at must be an ISO-8601 UTC timestamp`);
  }
  const sourceId = requiredString(parsed, "source_id", artifactPath);
  const expectedPrecision = requiredString(parsed, "expected_date_precision", artifactPath);
  if (expectedPrecision !== "day" && expectedPrecision !== "month") {
    throw new Error(`${artifactPath}: expected_date_precision must be day or month`);
  }
  const expectedDate = requiredString(parsed, "expected_operational_date", artifactPath);
  const expectedPattern = expectedPrecision === "day" ? /^\d{4}-\d{2}-\d{2}$/u : /^\d{4}-\d{2}$/u;
  if (!expectedPattern.test(expectedDate)) {
    throw new Error(`${artifactPath}: expected_operational_date does not match ${expectedPrecision} precision`);
  }
  return {
    artifact_path: artifactPath,
    schema_version: OPERATIONAL_ANCHOR_REVIEW_SCHEMA_VERSION,
    decision_id: decisionId,
    review_state: "accepted",
    accepted_at: acceptedAt,
    reviewer: requiredString(parsed, "reviewer", artifactPath),
    rationale: requiredString(parsed, "rationale", artifactPath),
    source_id: sourceId,
    event_record_id: requiredString(parsed, "event_record_id", artifactPath),
    timeline_relation_record_id: requiredString(parsed, "timeline_relation_record_id", artifactPath),
    route_record_id: requiredString(parsed, "route_record_id", artifactPath),
    route_scope_relation_record_id: requiredString(parsed, "route_scope_relation_record_id", artifactPath),
    treatment_record_id: requiredString(parsed, "treatment_record_id", artifactPath),
    treatment_scope_relation_record_id: requiredString(parsed, "treatment_scope_relation_record_id", artifactPath),
    treatment_family: requiredString(parsed, "treatment_family", artifactPath),
    expected_operational_date: expectedDate,
    expected_date_precision: expectedPrecision,
    evidence_bindings: parseEvidenceBindings(parsed.evidence_bindings, sourceId, artifactPath),
  };
}

export function operationalAnchorReviewAcceptedDir(): string {
  return join(repoRoot, "data", "operational-anchor-review", "accepted", "decisions");
}

export function loadOperationalAnchorReviewDecisions(
  dir = operationalAnchorReviewAcceptedDir(),
): OperationalAnchorReviewDecision[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => parseDecision(join(dir, name)));
}

function snapshotDecision(decision: OperationalAnchorReviewDecision): OperationalAnchorReviewSnapshotDecision {
  return {
    schema_version: decision.schema_version,
    decision_id: decision.decision_id,
    review_state: decision.review_state,
    accepted_at: decision.accepted_at,
    reviewer: decision.reviewer,
    rationale: decision.rationale,
    source_id: decision.source_id,
    event_record_id: decision.event_record_id,
    timeline_relation_record_id: decision.timeline_relation_record_id,
    route_record_id: decision.route_record_id,
    route_scope_relation_record_id: decision.route_scope_relation_record_id,
    treatment_record_id: decision.treatment_record_id,
    treatment_scope_relation_record_id: decision.treatment_scope_relation_record_id,
    treatment_family: decision.treatment_family,
    expected_operational_date: decision.expected_operational_date,
    expected_date_precision: decision.expected_date_precision,
    evidence_bindings: decision.evidence_bindings.map((binding) => ({ ...binding })),
  };
}

export function operationalAnchorReviewSnapshot(
  decisions: readonly OperationalAnchorReviewDecision[],
): OperationalAnchorReviewSnapshot {
  const snapshotDecisions = [...decisions]
    .sort((left, right) => left.decision_id.localeCompare(right.decision_id))
    .map(snapshotDecision);
  return {
    snapshot_version: OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION,
    decision_schema_version: OPERATIONAL_ANCHOR_REVIEW_SCHEMA_VERSION,
    decision_count: snapshotDecisions.length,
    decisions: snapshotDecisions,
  };
}

export function operationalAnchorReviewSnapshotJson(
  decisions: readonly OperationalAnchorReviewDecision[],
): string {
  return `${stableJson(operationalAnchorReviewSnapshot(decisions) as unknown as JsonValue)}\n`;
}

type RelationShape = {
  kind: string | null;
  subjectId: string | null;
  objectId: string | null;
  assertionStatus: string | null;
  asOfDate: string | null;
};

function relationShape(record: MtaCanonicalRecord | undefined): RelationShape {
  if (!record || record.record_kind !== "relation") {
    return { kind: null, subjectId: null, objectId: null, assertionStatus: null, asOfDate: null };
  }
  return {
    kind: text(record.payload.relation_kind),
    subjectId: text(record.payload.subject_id),
    objectId: text(record.payload.object_id),
    assertionStatus: text(record.payload.assertion_status),
    asOfDate: text(record.payload.as_of_date),
  };
}

function dateBounds(value: string): { start: string; end: string } | null {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return { start: value, end: value };
  if (/^\d{4}-\d{2}$/u.test(value)) return { start: `${value}-01`, end: `${value}-31` };
  if (/^\d{4}$/u.test(value)) return { start: `${value}-01-01`, end: `${value}-12-31` };
  return null;
}

function evidenceRoleRecordIds(decision: OperationalAnchorReviewDecision, subjectId: string): Record<OperationalAnchorReviewEvidenceRole, Set<string>> {
  return {
    event_date: new Set([decision.event_record_id]),
    timeline_relation: new Set([decision.timeline_relation_record_id]),
    route_identity: new Set([decision.route_record_id]),
    route_scope: new Set([decision.route_scope_relation_record_id]),
    treatment_definition: new Set([decision.treatment_record_id]),
    treatment_scope: new Set([decision.treatment_scope_relation_record_id]),
    route_treatment_event_bridge: new Set([
      decision.event_record_id,
      decision.timeline_relation_record_id,
      decision.route_record_id,
      decision.route_scope_relation_record_id,
      decision.treatment_record_id,
      decision.treatment_scope_relation_record_id,
      subjectId,
    ]),
  };
}

function validateDecision(decision: OperationalAnchorReviewDecision, recordsById: ReadonlyMap<string, MtaCanonicalRecord>): string[] {
  const reasons: string[] = [];
  const event = recordsById.get(decision.event_record_id);
  const timeline = recordsById.get(decision.timeline_relation_record_id);
  const route = recordsById.get(decision.route_record_id);
  const routeScope = recordsById.get(decision.route_scope_relation_record_id);
  const treatment = recordsById.get(decision.treatment_record_id);
  const treatmentScope = recordsById.get(decision.treatment_scope_relation_record_id);

  const requireKind = (record: MtaCanonicalRecord | undefined, id: string, kind: string): void => {
    if (!record) reasons.push(`missing bound record ${id}`);
    else if (record.record_kind !== kind) reasons.push(`bound record ${id} must have kind ${kind}, found ${record.record_kind}`);
  };
  requireKind(event, decision.event_record_id, "event");
  requireKind(timeline, decision.timeline_relation_record_id, "relation");
  requireKind(route, decision.route_record_id, "route");
  requireKind(routeScope, decision.route_scope_relation_record_id, "relation");
  requireKind(treatment, decision.treatment_record_id, "treatment_component");
  requireKind(treatmentScope, decision.treatment_scope_relation_record_id, "relation");
  if (!event || !timeline || !route || !routeScope || !treatment || !treatmentScope) return reasons;

  const eventFamily = text(event.payload.event_family);
  if (eventFamily !== "implementation" && eventFamily !== "launch") {
    reasons.push(`event ${event.record_id} must have operational event_family implementation or launch`);
  }
  const eventDate = text(event.payload.date_normalized);
  const eventPrecision = text(event.payload.date_precision);
  if (eventDate !== decision.expected_operational_date) {
    reasons.push(`event date ${eventDate ?? "missing"} does not match reviewed date ${decision.expected_operational_date}`);
  }
  if (eventPrecision !== decision.expected_date_precision) {
    reasons.push(`event precision ${eventPrecision ?? "missing"} does not match reviewed precision ${decision.expected_date_precision}`);
  }

  const timelineRelation = relationShape(timeline);
  const routeRelation = relationShape(routeScope);
  const treatmentRelation = relationShape(treatmentScope);
  if (timelineRelation.kind !== "has_timeline_event" || timelineRelation.objectId !== event.record_id) {
    reasons.push(`timeline relation ${timeline.record_id} must be has_timeline_event -> ${event.record_id}`);
  }
  if (timelineRelation.assertionStatus !== "delivered") reasons.push(`timeline relation ${timeline.record_id} must be delivered`);
  if (!timelineRelation.subjectId) reasons.push(`timeline relation ${timeline.record_id} must have a subject_id`);
  if (!routeRelation.kind || !new Set(["affects_route", "serves_route"]).has(routeRelation.kind) || routeRelation.objectId !== route.record_id) {
    reasons.push(`route scope relation ${routeScope.record_id} must be affects_route/serves_route -> ${route.record_id}`);
  }
  if (routeRelation.assertionStatus !== "delivered") reasons.push(`route scope relation ${routeScope.record_id} must be delivered`);
  if (treatmentRelation.kind !== "has_treatment" || treatmentRelation.objectId !== treatment.record_id) {
    reasons.push(`treatment scope relation ${treatmentScope.record_id} must be has_treatment -> ${treatment.record_id}`);
  }
  if (treatmentRelation.assertionStatus !== "delivered") reasons.push(`treatment scope relation ${treatmentScope.record_id} must be delivered`);
  if (
    timelineRelation.subjectId &&
    (routeRelation.subjectId !== timelineRelation.subjectId || treatmentRelation.subjectId !== timelineRelation.subjectId)
  ) {
    reasons.push("timeline, route-scope, and treatment-scope relations must share the same subject_id");
  }

  const subject = timelineRelation.subjectId ? recordsById.get(timelineRelation.subjectId) : undefined;
  if (!subject || (subject.record_kind !== "project" && subject.record_kind !== "corridor")) {
    reasons.push("reviewed inherited scope must be rooted at one canonical project or corridor");
  }

  const candidateBounds = dateBounds(decision.expected_operational_date);
  for (const [label, relation] of [
    ["timeline", timelineRelation],
    ["route scope", routeRelation],
    ["treatment scope", treatmentRelation],
  ] as const) {
    if (!relation.asOfDate) {
      reasons.push(`${label} relation must carry as_of_date`);
      continue;
    }
    const asOfBounds = dateBounds(relation.asOfDate);
    if (!asOfBounds) {
      reasons.push(`${label} relation has unsupported as_of_date ${relation.asOfDate}`);
      continue;
    }
    if (candidateBounds && asOfBounds.end < candidateBounds.start) {
      reasons.push(`${label} relation as_of_date ${relation.asOfDate} predates ${decision.expected_operational_date}`);
    }
  }

  const canonicalFamily = text(treatment.payload.treatment_family);
  if (canonicalFamily !== decision.treatment_family) {
    reasons.push(`treatment family ${canonicalFamily ?? "missing"} does not match reviewed family ${decision.treatment_family}`);
  }

  const boundRecords = [event, timeline, route, routeScope, treatment, treatmentScope, ...(subject ? [subject] : [])];
  for (const record of boundRecords) {
    if (record.truth_status !== "source_stated") reasons.push(`bound record ${record.record_id} must be source_stated`);
    if (record.review_state === "quarantined") reasons.push(`bound record ${record.record_id} is quarantined`);
  }

  const allowedRecordIds = evidenceRoleRecordIds(decision, timelineRelation.subjectId ?? "");
  const presentRoles = new Set<OperationalAnchorReviewEvidenceRole>();
  for (const binding of decision.evidence_bindings) {
    presentRoles.add(binding.role);
    const bindingRecord = recordsById.get(binding.record_id);
    if (!bindingRecord) {
      reasons.push(`evidence binding references missing record ${binding.record_id}`);
      continue;
    }
    if (!allowedRecordIds[binding.role].has(binding.record_id)) {
      reasons.push(`evidence role ${binding.role} cannot bind record ${binding.record_id}`);
    }
    const matched = bindingRecord.evidence_refs.some(
      (ref) => ref.source_id === binding.source_id && ref.evidence_id === binding.evidence_id,
    );
    if (!matched) {
      reasons.push(`evidence ${binding.evidence_id} is not an exact ref on ${binding.record_id}`);
    }
    if (bindingRecord.truth_status !== "source_stated") reasons.push(`evidence record ${binding.record_id} must be source_stated`);
    if (bindingRecord.review_state === "quarantined") reasons.push(`evidence record ${binding.record_id} is quarantined`);
  }
  for (const role of requiredEvidenceRoles) {
    if (!presentRoles.has(role)) reasons.push(`missing required evidence role ${role}`);
  }

  return [...new Set(reasons)].sort((left, right) => left.localeCompare(right));
}

export function validateOperationalAnchorReviewDecisions(
  decisions: readonly OperationalAnchorReviewDecision[],
  records: readonly MtaCanonicalRecord[],
): OperationalAnchorReviewValidationReport {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const valid: OperationalAnchorReviewDecision[] = [];
  const quarantined: OperationalAnchorReviewQuarantine[] = [];
  for (const decision of [...decisions].sort((left, right) => left.decision_id.localeCompare(right.decision_id))) {
    const reasons = validateDecision(decision, recordsById);
    if (reasons.length === 0) valid.push(decision);
    else {
      quarantined.push({
        decision_id: decision.decision_id,
        artifact_path: decision.artifact_path ?? null,
        code: "invalid_operational_anchor_review",
        reasons,
      });
    }
  }

  const byDecisionId = new Map<string, OperationalAnchorReviewDecision[]>();
  const byAtomicBinding = new Map<string, OperationalAnchorReviewDecision[]>();
  for (const decision of valid) {
    const idGroup = byDecisionId.get(decision.decision_id) ?? [];
    idGroup.push(decision);
    byDecisionId.set(decision.decision_id, idGroup);
    const key = [decision.event_record_id, decision.route_record_id, decision.treatment_record_id].join("|");
    const bindingGroup = byAtomicBinding.get(key) ?? [];
    bindingGroup.push(decision);
    byAtomicBinding.set(key, bindingGroup);
  }
  const conflicting = new Set<OperationalAnchorReviewDecision>();
  for (const group of [...byDecisionId.values(), ...byAtomicBinding.values()]) {
    if (group.length < 2) continue;
    for (const decision of group) conflicting.add(decision);
  }
  for (const decision of [...conflicting].sort((left, right) => left.decision_id.localeCompare(right.decision_id))) {
    quarantined.push({
      decision_id: decision.decision_id,
      artifact_path: decision.artifact_path ?? null,
      code: "conflicting_operational_anchor_review",
      reasons: ["accepted decisions must uniquely bind one decision_id and one event/route/treatment tuple"],
    });
  }

  return {
    accepted: valid.filter((decision) => !conflicting.has(decision)),
    quarantined: quarantined.sort((left, right) =>
      [left.decision_id, left.code, left.artifact_path ?? ""].join("|").localeCompare([right.decision_id, right.code, right.artifact_path ?? ""].join("|")),
    ),
  };
}

export function assertOperationalAnchorReviewDecisions(
  decisions: readonly OperationalAnchorReviewDecision[],
  records: readonly MtaCanonicalRecord[],
): OperationalAnchorReviewDecision[] {
  const report = validateOperationalAnchorReviewDecisions(decisions, records);
  if (report.quarantined.length > 0) {
    const details = report.quarantined
      .map((entry) => `${entry.decision_id} (${entry.code}): ${entry.reasons.join("; ")}`)
      .join("\n");
    throw new Error(`Operational-anchor review decision validation failed:\n${details}`);
  }
  return report.accepted;
}
