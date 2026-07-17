import { writeFileSync } from "node:fs";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  assertOperationalAnchorReviewDecisions,
  type OperationalAnchorReviewDecision,
  type OperationalAnchorReviewEvidenceBinding,
  type OperationalAnchorReviewEvidenceRole,
} from "@mta-wiki/pipeline/materialize/operational-anchor-review";
import {
  computeOperationalAnchors,
  type OperationalAnchorDateCandidate,
  type OperationalAnchorRow,
} from "@mta-wiki/pipeline/materialize/operational-anchors";
import {
  assertOperationalOccurrenceIdentityRegistry,
  resolveOperationalOccurrenceIdentity,
  type OperationalOccurrenceIdentityEntry,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-identity";
import type { OperationalOccurrenceAcceptedDecision } from "@mta-wiki/pipeline/materialize/operational-occurrence-review";
import type { RouteAnchorRow } from "@mta-wiki/pipeline/materialize/route-anchors";

export const OPERATIONAL_OCCURRENCE_SCHEMA_VERSION = 2 as const;

export type OperationalOccurrenceEvidenceRole =
  | OperationalAnchorReviewEvidenceRole
  | "bundle_analysis_family"
  | "phase_relation"
  | "physical_scope";

export type OperationalOccurrenceEvidenceBinding = Omit<OperationalAnchorReviewEvidenceBinding, "role"> & {
  role: OperationalOccurrenceEvidenceRole;
};

export type OperationalOccurrenceObservationDate = {
  raw: string;
  normalized: string;
  precision: string;
  source_field: string;
};

export type OperationalOccurrenceObservation = {
  event_record_id: string;
  relation_record_ids: string[];
  document_time_statuses: string[];
  document_time_dates: OperationalOccurrenceObservationDate[];
  status_as_of_dates: string[];
};

export type OperationalOccurrenceResolvedOnset = {
  date: string;
  precision: "day" | "month";
  resolver_ids: string[];
  publication_dates: string[];
  retrieval_dates: string[];
  evidence_bindings: OperationalOccurrenceEvidenceBinding[];
};

export type OperationalOccurrenceRoute = {
  route_record_id: string;
  gtfs_route_id: string;
  evidence_bindings: OperationalOccurrenceEvidenceBinding[];
};

export type OperationalOccurrenceTreatmentMember = {
  treatment_record_id: string;
  treatment_family: string;
  evidence_bindings: OperationalOccurrenceEvidenceBinding[];
};

export type OperationalOccurrenceTreatment =
  | {
      kind: "atomic";
      member: OperationalOccurrenceTreatmentMember;
    }
  | {
      kind: "bundle";
      bundle_family: string | null;
      bundle_family_evidence_bindings: OperationalOccurrenceEvidenceBinding[];
      members: OperationalOccurrenceTreatmentMember[];
    };

export type OperationalOccurrenceExclusionReason = "unsupported_bundle_analysis_family";

export type OperationalOccurrenceRow = {
  schema_version: typeof OPERATIONAL_OCCURRENCE_SCHEMA_VERSION;
  occurrence_id: string;
  occurrence_aliases: string[];
  occurrence_review_decision_id: string;
  founding_key: string;
  resolution_cluster_id: string | null;
  /** Canonical event rows are the physical phase identities. `single_phase` is scoped to this
   * occurrence identity and does not assert that the parent project has no other phases. */
  phase_record_ids: string[];
  phase_relation_record_ids: string[];
  phase_relation_evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  phase_relation_disposition: "single_phase" | "related_phases";
  physical_scope_record_ids: string[];
  physical_scope_relation_record_ids: string[];
  physical_scope_evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  observations: OperationalOccurrenceObservation[];
  resolved_status: "realized";
  resolved_onset: OperationalOccurrenceResolvedOnset;
  routes: OperationalOccurrenceRoute[];
  treatment: OperationalOccurrenceTreatment;
  source_ids: string[];
  evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  exclusion_reasons: OperationalOccurrenceExclusionReason[];
  review_state: "approved";
  study_projection_eligible: boolean;
  provenance: {
    anchor_review_decision_ids: string[];
    event_record_ids: string[];
    relation_record_ids: string[];
    route_record_ids: string[];
    treatment_record_ids: string[];
  };
};

export type OperationalOccurrenceSummary = {
  schema_version: typeof OPERATIONAL_OCCURRENCE_SCHEMA_VERSION;
  occurrence_count: number;
  study_projection_eligible_count: number;
  atomic_count: number;
  bundle_count: number;
  multi_route_count: number;
  candidate_projection_count: number;
  counts_by_exclusion_reason: Record<string, number>;
};

export type ComputeOperationalOccurrencesOptions = {
  reviewDecisions: readonly OperationalAnchorReviewDecision[];
  occurrenceReviewDecisions?: readonly OperationalOccurrenceAcceptedDecision[] | undefined;
  identityRegistry: readonly OperationalOccurrenceIdentityEntry[];
};

const supportedBundleAnalysisFamilies = new Set([
  "all_door_boarding",
  "automated_bus_lane_enforcement",
  "bus_lane",
  "busway",
  "off_board_fare_collection",
  "queue_jump",
  "route_redesign",
  "select_bus_service",
  "signal_priority",
  "stop_change",
  // Legacy decision decoder alias. New decisions use canonical signal_priority.
  "transit_signal_priority",
]);

/**
 * Multi-phase occurrence projection is deliberately narrower than the general relation ontology.
 * These are the existing canonical sequence semantics that can state an earlier/later event
 * relationship. An approved occurrence review must still select the relation, both endpoints must
 * be canonical event rows in that occurrence, and the relation must be source-stated, delivered,
 * non-quarantined, and exactly evidence-bound.
 */
export const OPERATIONAL_OCCURRENCE_PHASE_RELATION_ALLOWLIST = [
  { relation_kind: "follows", relation_family: "timeline_context", assertion_status: "delivered" },
  { relation_kind: "has_subsequent_event", relation_family: "timeline_context", assertion_status: "delivered" },
  { relation_kind: "precedes", relation_family: "dependency_or_reference", assertion_status: "delivered" },
  { relation_kind: "precedes_event", relation_family: "timeline_context", assertion_status: "delivered" },
  { relation_kind: "predecessor_of", relation_family: "dependency_or_reference", assertion_status: "delivered" },
] as const;

/**
 * Bounded segments currently use canonical corridor rows. A physical scope may be projected only
 * by a reviewed direct edge between the exact treatment component and that corridor. No current
 * indirect relation kind proves component-specific scope, so project-to-corridor traversal is
 * intentionally absent from this allowlist.
 */
export const OPERATIONAL_OCCURRENCE_PHYSICAL_SCOPE_RELATION_ALLOWLIST = [
  {
    relation_kind: "applied_on_corridor",
    relation_family: "corridor_scope",
    assertion_status: "delivered",
    subject_kind: "treatment_component",
    object_kind: "corridor",
  },
  {
    relation_kind: "located_on_corridor",
    relation_family: "corridor_scope",
    assertion_status: "delivered",
    subject_kind: "treatment_component",
    object_kind: "corridor",
  },
  {
    relation_kind: "has_treatment",
    relation_family: "treatment_context",
    assertion_status: "delivered",
    subject_kind: "corridor",
    object_kind: "treatment_component",
  },
] as const;

function relationSemanticKey(record: MtaCanonicalRecord): string {
  return [
    text(record.payload.relation_kind) ?? "",
    text(record.payload.relation_family) ?? "",
    text(record.payload.assertion_status) ?? "",
  ].join("|");
}

const allowedPhaseRelationSemantics = new Set(
  OPERATIONAL_OCCURRENCE_PHASE_RELATION_ALLOWLIST.map((entry) =>
    [entry.relation_kind, entry.relation_family, entry.assertion_status].join("|"),
  ),
);

function assertSourceStatedReviewedRelation(record: MtaCanonicalRecord, path: string): void {
  if (record.record_kind !== "relation") throw new Error(`${path} must resolve to a canonical relation`);
  if (record.truth_status !== "source_stated") throw new Error(`${path} must be source_stated`);
  if (record.review_state === "quarantined") throw new Error(`${path} is quarantined`);
  if (record.evidence_refs.length === 0) throw new Error(`${path} must have exact canonical evidence`);
  if (record.evidence_refs.some((ref) => !ref.evidence_id)) {
    throw new Error(`${path} has an evidence ref without evidence_id`);
  }
}

function relationEvidenceBindings(
  record: MtaCanonicalRecord,
  role: "phase_relation" | "physical_scope",
  path: string,
): OperationalOccurrenceEvidenceBinding[] {
  assertSourceStatedReviewedRelation(record, path);
  return uniqueBindings(record.evidence_refs.map((ref) => ({
    role,
    record_id: record.record_id,
    source_id: ref.source_id,
    evidence_id: ref.evidence_id!,
  })));
}

function text(value: JsonValue | undefined): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function bindingKey(binding: OperationalOccurrenceEvidenceBinding): string {
  return [binding.role, binding.record_id, binding.source_id, binding.evidence_id].join("|");
}

function uniqueBindings(bindings: Iterable<OperationalOccurrenceEvidenceBinding>): OperationalOccurrenceEvidenceBinding[] {
  return [...new Map([...bindings].map((binding) => [bindingKey(binding), { ...binding }])).values()].sort((left, right) =>
    bindingKey(left).localeCompare(bindingKey(right)),
  );
}

function groupBy<T>(values: readonly T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    const group = groups.get(groupKey) ?? [];
    group.push(value);
    groups.set(groupKey, group);
  }
  return groups;
}

function sourceDateValues(
  sourceIds: readonly string[],
  records: readonly MtaCanonicalRecord[],
  fields: readonly string[],
): string[] {
  const sources = records.filter(
    (record) => record.record_kind === "source" && (sourceIds.includes(record.record_id) || sourceIds.includes(record.source_id)),
  );
  return uniqueSorted(
    sources.flatMap((source) =>
      fields.flatMap((field) => {
        const value = text(source.payload[field]);
        if (!value) return [];
        const match = /^\d{4}-\d{2}(?:-\d{2})?/u.exec(value);
        return match ? [match[0]] : [];
      }),
    ),
  );
}

function publicationDates(sourceIds: readonly string[], records: readonly MtaCanonicalRecord[]): string[] {
  return sourceDateValues(sourceIds, records, ["published_date_normalized"]);
}

function retrievalDates(sourceIds: readonly string[], records: readonly MtaCanonicalRecord[]): string[] {
  return sourceDateValues(sourceIds, records, ["retrieved_date_normalized", "retrieved_at"]);
}

function observationDates(candidates: readonly OperationalAnchorDateCandidate[]): OperationalOccurrenceObservationDate[] {
  return [...new Map(
    candidates.map((candidate) => {
      const value = {
        raw: candidate.raw,
        normalized: candidate.normalized,
        precision: candidate.precision,
        source_field: candidate.source_field,
      };
      return [[value.raw, value.normalized, value.precision, value.source_field].join("|"), value] as const;
    }),
  ).values()].sort((left, right) =>
    [left.normalized, left.raw, left.source_field].join("|").localeCompare([right.normalized, right.raw, right.source_field].join("|")),
  );
}

function reviewedRowsByDecision(
  records: readonly MtaCanonicalRecord[],
  routeAnchors: readonly RouteAnchorRow[],
  decisions: readonly OperationalAnchorReviewDecision[],
): Map<string, OperationalAnchorRow> {
  const reviewed = computeOperationalAnchors(records, routeAnchors, { reviewDecisions: decisions }).filter((row) =>
    row.anchor_id.startsWith("operational-reviewed:"),
  );
  return new Map(reviewed.map((row) => [row.anchor_id.slice("operational-reviewed:".length), row]));
}

function routeValues(
  decisions: readonly OperationalAnchorReviewDecision[],
  rowsByDecision: ReadonlyMap<string, OperationalAnchorRow>,
): OperationalOccurrenceRoute[] {
  const byRoute = groupBy(decisions, (decision) => decision.route_record_id);
  return [...byRoute.entries()]
    .map(([routeRecordId, routeDecisions]) => {
      const gtfsRouteIds = uniqueSorted(
        routeDecisions.flatMap((decision) => rowsByDecision.get(decision.decision_id)?.gtfs_route_ids ?? []),
      );
      if (gtfsRouteIds.length !== 1) {
        throw new Error(`reviewed occurrence route ${routeRecordId} must resolve to exactly one GTFS route; found ${gtfsRouteIds.length}`);
      }
      return {
        route_record_id: routeRecordId,
        gtfs_route_id: gtfsRouteIds[0]!,
        evidence_bindings: uniqueBindings(
          routeDecisions.flatMap((decision) =>
            decision.evidence_bindings.filter((binding) => binding.role === "route_identity" || binding.role === "route_scope"),
          ),
        ),
      };
    })
    .sort((left, right) => left.route_record_id.localeCompare(right.route_record_id));
}

function treatmentMembers(decisions: readonly OperationalAnchorReviewDecision[]): OperationalOccurrenceTreatmentMember[] {
  const byTreatment = groupBy(decisions, (decision) => decision.treatment_record_id);
  return [...byTreatment.entries()]
    .map(([treatmentRecordId, treatmentDecisions]) => {
      const families = uniqueSorted(treatmentDecisions.map((decision) => decision.treatment_family));
      if (families.length !== 1) {
        throw new Error(`reviewed occurrence treatment ${treatmentRecordId} has conflicting families: ${families.join(", ")}`);
      }
      return {
        treatment_record_id: treatmentRecordId,
        treatment_family: families[0]!,
        evidence_bindings: uniqueBindings(
          treatmentDecisions.flatMap((decision) =>
            decision.evidence_bindings.filter(
              (binding) => binding.role === "treatment_definition" || binding.role === "treatment_scope",
            ),
          ),
        ),
      };
    })
    .sort((left, right) => left.treatment_record_id.localeCompare(right.treatment_record_id));
}

function eventBundleAnalysisFamily(event: MtaCanonicalRecord | undefined): string | null {
  if (!event) return null;
  return text(event.payload.bundle_analysis_family) ?? text(event.payload.analysis_family);
}

type OperationalOccurrencePhysicalScope = {
  recordIds: string[];
  relationRecordIds: string[];
  evidenceBindings: OperationalOccurrenceEvidenceBinding[];
};

type DirectPhysicalScopeEndpoints = {
  treatmentRecordId: string;
  scopeRecordId: string;
};

function directPhysicalScopeEndpoints(input: {
  relation: MtaCanonicalRecord;
  treatmentRecordIds: ReadonlySet<string>;
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>;
  path: string;
}): DirectPhysicalScopeEndpoints | null {
  const subjectId = relationEndpoint(input.relation, "subject_id");
  const objectId = relationEndpoint(input.relation, "object_id");
  if (!subjectId || !objectId) return null;
  const subject = input.recordsById.get(subjectId);
  const object = input.recordsById.get(objectId);
  const isExactTreatmentCorridorPair =
    (input.treatmentRecordIds.has(subjectId) && subject?.record_kind === "treatment_component" && object?.record_kind === "corridor") ||
    (input.treatmentRecordIds.has(objectId) && object?.record_kind === "treatment_component" && subject?.record_kind === "corridor");
  if (!isExactTreatmentCorridorPair) return null;

  const allowed = OPERATIONAL_OCCURRENCE_PHYSICAL_SCOPE_RELATION_ALLOWLIST.some((entry) =>
    text(input.relation.payload.relation_kind) === entry.relation_kind &&
    text(input.relation.payload.relation_family) === entry.relation_family &&
    text(input.relation.payload.assertion_status) === entry.assertion_status &&
    subject?.record_kind === entry.subject_kind &&
    object?.record_kind === entry.object_kind,
  );
  if (!allowed) {
    throw new Error(
      `${input.path} directly connects an occurrence treatment to a corridor with unapproved physical-scope semantics ` +
        `${relationSemanticKey(input.relation) || "missing"}`,
    );
  }
  assertSourceStatedReviewedRelation(input.relation, input.path);
  return subject?.record_kind === "treatment_component"
    ? { treatmentRecordId: subjectId, scopeRecordId: objectId }
    : { treatmentRecordId: objectId, scopeRecordId: subjectId };
}

function occurrencePhysicalScope(input: {
  treatmentRecordIds: readonly string[];
  reviewedRelationRecordIds: readonly string[];
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>;
}): OperationalOccurrencePhysicalScope {
  const treatmentIds = new Set(input.treatmentRecordIds);
  const scopes = uniqueSorted(input.reviewedRelationRecordIds).flatMap((relationId) => {
    const relation = input.recordsById.get(relationId);
    if (!relation || relation.record_kind !== "relation") {
      throw new Error(`reviewed occurrence relation ${relationId} must resolve to a canonical relation`);
    }
    const endpoints = directPhysicalScopeEndpoints({
      relation,
      treatmentRecordIds: treatmentIds,
      recordsById: input.recordsById,
      path: `physical-scope relation ${relationId}`,
    });
    return endpoints ? [{ relation, endpoints }] : [];
  });
  const recordIds = uniqueSorted(scopes.map(({ endpoints }) => endpoints.scopeRecordId));
  const relationRecordIds = uniqueSorted(scopes.map(({ relation }) => relation.record_id));
  const evidenceBindings = uniqueBindings(scopes.flatMap(({ relation }) =>
    relationEvidenceBindings(relation, "physical_scope", `physical-scope relation ${relation.record_id}`)));
  return { recordIds, relationRecordIds, evidenceBindings };
}

type PhaseRelationEndpoints = { subjectId: string; objectId: string };

function assertAllowedPhaseRelation(input: {
  relation: MtaCanonicalRecord;
  phaseRecordIds: ReadonlySet<string>;
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>;
  path: string;
}): PhaseRelationEndpoints {
  assertSourceStatedReviewedRelation(input.relation, input.path);
  if (!allowedPhaseRelationSemantics.has(relationSemanticKey(input.relation))) {
    throw new Error(
      `${input.path} has unapproved phase relation semantics ${relationSemanticKey(input.relation) || "missing"}`,
    );
  }
  const subjectId = relationEndpoint(input.relation, "subject_id");
  const objectId = relationEndpoint(input.relation, "object_id");
  const subject = subjectId ? input.recordsById.get(subjectId) : undefined;
  const object = objectId ? input.recordsById.get(objectId) : undefined;
  if (
    !subjectId ||
    !objectId ||
    subjectId === objectId ||
    subject?.record_kind !== "event" ||
    object?.record_kind !== "event" ||
    !input.phaseRecordIds.has(subjectId) ||
    !input.phaseRecordIds.has(objectId)
  ) {
    throw new Error(`${input.path} must connect two distinct canonical event records in the occurrence phase set`);
  }
  return { subjectId, objectId };
}

function assertConnectedPhaseGraph(
  phaseRecordIds: readonly string[],
  endpoints: readonly PhaseRelationEndpoints[],
  path: string,
): void {
  if (phaseRecordIds.length === 1) {
    if (endpoints.length !== 0) throw new Error(`${path} single phase must not project a phase relation`);
    return;
  }
  if (endpoints.length === 0) throw new Error(`${path} binds multiple phase events without an allowed phase relation`);
  const adjacency = new Map(phaseRecordIds.map((recordId) => [recordId, new Set<string>()]));
  for (const endpoint of endpoints) {
    adjacency.get(endpoint.subjectId)!.add(endpoint.objectId);
    adjacency.get(endpoint.objectId)!.add(endpoint.subjectId);
  }
  const visited = new Set<string>();
  const pending = [phaseRecordIds[0]!];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) pending.push(next);
  }
  if (visited.size !== phaseRecordIds.length) {
    const missing = phaseRecordIds.filter((recordId) => !visited.has(recordId));
    throw new Error(`${path} phase relations do not connect every phase identity: ${missing.join(", ")}`);
  }
}

function occurrenceForEvent(input: {
  eventId: string;
  decisions: readonly OperationalAnchorReviewDecision[];
  records: readonly MtaCanonicalRecord[];
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>;
  rowsByDecision: ReadonlyMap<string, OperationalAnchorRow>;
  identities: readonly OperationalOccurrenceIdentityEntry[];
}): OperationalOccurrenceRow {
  const decisions = [...input.decisions].sort((left, right) => left.decision_id.localeCompare(right.decision_id));
  const foundingKey = `event:${input.eventId}`;
  const identity = resolveOperationalOccurrenceIdentity(foundingKey, input.identities);
  if (!identity.founding_event_record_ids.includes(input.eventId)) {
    throw new Error(`operational-occurrence identity ${identity.occurrence_id} does not bind founding event ${input.eventId}`);
  }
  const rows = decisions.map((decision) => {
    const row = input.rowsByDecision.get(decision.decision_id);
    if (!row) throw new Error(`accepted anchor review ${decision.decision_id} did not produce a reviewed anchor row`);
    return row;
  });
  const onsetDates = uniqueSorted(decisions.map((decision) => decision.expected_operational_date));
  const onsetPrecisions = uniqueSorted(decisions.map((decision) => decision.expected_date_precision));
  if (onsetDates.length !== 1 || onsetPrecisions.length !== 1) {
    throw new Error(`accepted anchor reviews for ${input.eventId} disagree on occurrence onset`);
  }
  const evidenceBindings = uniqueBindings(decisions.flatMap((decision) => decision.evidence_bindings));
  const onsetBindings = uniqueBindings(
    evidenceBindings.filter((binding) => binding.role === "event_date" || binding.role === "timeline_relation"),
  );
  const routes = routeValues(decisions, input.rowsByDecision);
  const members = treatmentMembers(decisions);
  if (routes.length === 0 || members.length === 0 || onsetBindings.length === 0) {
    throw new Error(`accepted anchor reviews for ${input.eventId} lost a required occurrence binding`);
  }

  const event = input.recordsById.get(input.eventId);
  const eventEvidenceBindings = uniqueBindings(
    evidenceBindings.filter(
      (binding) => binding.record_id === input.eventId && (binding.role === "event_date" || binding.role === "route_treatment_event_bridge"),
    ),
  );
  const bundleFamily = members.length > 1 ? eventBundleAnalysisFamily(event) : null;
  const bundleFamilyEvidenceBindings = bundleFamily
    ? uniqueBindings(eventEvidenceBindings.map((binding) => ({ ...binding, role: "bundle_analysis_family" as const })))
    : [];
  const bundleSupported = Boolean(
    bundleFamily && supportedBundleAnalysisFamilies.has(bundleFamily) && bundleFamilyEvidenceBindings.length > 0,
  );
  const treatment: OperationalOccurrenceTreatment =
    members.length === 1
      ? { kind: "atomic", member: members[0]! }
      : {
          kind: "bundle",
          bundle_family: bundleFamily,
          bundle_family_evidence_bindings: bundleFamilyEvidenceBindings,
          members,
        };
  const exclusionReasons: OperationalOccurrenceExclusionReason[] =
    treatment.kind === "bundle" && !bundleSupported ? ["unsupported_bundle_analysis_family"] : [];
  const treatmentScopeRelationRecordIds = uniqueSorted(
    decisions.flatMap((decision) => [
      decision.timeline_relation_record_id,
      decision.route_scope_relation_record_id,
      decision.treatment_scope_relation_record_id,
    ]),
  );
  const physicalScope = occurrencePhysicalScope({
    treatmentRecordIds: members.map((member) => member.treatment_record_id),
    reviewedRelationRecordIds: treatmentScopeRelationRecordIds,
    recordsById: input.recordsById,
  });
  const relationRecordIds = uniqueSorted([
    ...treatmentScopeRelationRecordIds,
    ...physicalScope.relationRecordIds,
  ]);
  const occurrenceEvidenceBindings = uniqueBindings([
    ...evidenceBindings,
    ...bundleFamilyEvidenceBindings,
    ...physicalScope.evidenceBindings,
  ]);
  const sourceIds = uniqueSorted(occurrenceEvidenceBindings.map((binding) => binding.source_id));
  assertOfficialOccurrenceSources(sourceIds, input.records, `migrated:${input.eventId}`);
  const observations: OperationalOccurrenceObservation[] = [
    {
      event_record_id: input.eventId,
      relation_record_ids: relationRecordIds,
      document_time_statuses: uniqueSorted([
        ...rows.flatMap((row) => row.assertion_statuses),
        ...(text(event?.payload.lifecycle_phase) ? [text(event?.payload.lifecycle_phase)!] : []),
      ]),
      document_time_dates: observationDates(rows.flatMap((row) => row.candidate_operational_date_candidates)),
      status_as_of_dates: uniqueSorted(rows.flatMap((row) => row.status_as_of_dates)),
    },
  ];
  const decisionIds = decisions.map((decision) => decision.decision_id);
  return {
    schema_version: OPERATIONAL_OCCURRENCE_SCHEMA_VERSION,
    occurrence_id: identity.occurrence_id,
    occurrence_aliases: [...identity.aliases].sort(),
    occurrence_review_decision_id: `occurrence-review:${identity.occurrence_id}`,
    founding_key: identity.founding_key,
    resolution_cluster_id: identity.resolution_cluster_id,
    phase_record_ids: [input.eventId],
    phase_relation_record_ids: [],
    phase_relation_evidence_bindings: [],
    phase_relation_disposition: "single_phase",
    physical_scope_record_ids: physicalScope.recordIds,
    physical_scope_relation_record_ids: physicalScope.relationRecordIds,
    physical_scope_evidence_bindings: physicalScope.evidenceBindings,
    observations,
    resolved_status: "realized",
    resolved_onset: {
      date: onsetDates[0]!,
      precision: onsetPrecisions[0]! as "day" | "month",
      resolver_ids: decisionIds,
      publication_dates: publicationDates(sourceIds, input.records),
      retrieval_dates: retrievalDates(sourceIds, input.records),
      evidence_bindings: onsetBindings,
    },
    routes,
    treatment,
    source_ids: sourceIds,
    evidence_bindings: occurrenceEvidenceBindings,
    exclusion_reasons: exclusionReasons,
    review_state: "approved",
    study_projection_eligible: exclusionReasons.length === 0,
    provenance: {
      anchor_review_decision_ids: decisionIds,
      event_record_ids: [input.eventId],
      relation_record_ids: relationRecordIds,
      route_record_ids: routes.map((route) => route.route_record_id).sort(),
      treatment_record_ids: members.map((member) => member.treatment_record_id).sort(),
    },
  };
}

function relationEndpoint(record: MtaCanonicalRecord, field: "object_id" | "subject_id"): string | null {
  if (record.record_kind !== "relation") return null;
  return text(record.payload[field]);
}

function bindingRecord(
  binding: OperationalOccurrenceEvidenceBinding,
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  decisionId: string,
): MtaCanonicalRecord {
  const record = recordsById.get(binding.record_id);
  if (!record) throw new Error(`occurrence review ${decisionId} evidence references missing record ${binding.record_id}`);
  const exact = record.evidence_refs.some(
    (ref) => ref.source_id === binding.source_id && ref.evidence_id === binding.evidence_id,
  );
  if (!exact) {
    throw new Error(
      `occurrence review ${decisionId} evidence ${binding.source_id}#${binding.evidence_id} is not an exact ref on ${binding.record_id}`,
    );
  }
  if (record.truth_status !== "source_stated") {
    throw new Error(`occurrence review ${decisionId} evidence record ${binding.record_id} must be source_stated`);
  }
  if (record.review_state === "quarantined") {
    throw new Error(`occurrence review ${decisionId} evidence record ${binding.record_id} is quarantined`);
  }
  return record;
}

function sourceRecordsByKey(records: readonly MtaCanonicalRecord[]): ReadonlyMap<string, MtaCanonicalRecord> {
  const index = new Map<string, MtaCanonicalRecord>();
  for (const record of records) {
    if (record.record_kind !== "source") continue;
    const keys = new Set([record.record_id, record.source_id, ...(record.source_ids ?? [])]);
    if (record.record_id.startsWith("source_")) keys.add(record.record_id.slice("source_".length));
    for (const key of keys) {
      index.set(key, record);
      index.set(key.replaceAll("-", "_"), record);
      index.set(key.replaceAll("_", "-"), record);
    }
  }
  return index;
}

function assertOfficialOccurrenceSources(
  sourceIds: readonly string[],
  records: readonly MtaCanonicalRecord[],
  decisionId: string,
): void {
  const sources = sourceRecordsByKey(records);
  for (const sourceId of sourceIds) {
    const publisher = text(sources.get(sourceId)?.payload.publisher);
    if (
      !publisher ||
      !/\b(?:mta|metropolitan transportation authority|new york city transit|nyc transit|nyc dot|nycdot|new york city department of transportation)\b/iu.test(
        publisher,
      )
    ) {
      throw new Error(
        `occurrence review ${decisionId} source ${sourceId} is not resolved to an official public-agency publisher`,
      );
    }
  }
}

function requireBindingRoles(
  bindings: readonly OperationalOccurrenceEvidenceBinding[],
  roles: readonly OperationalOccurrenceEvidenceRole[],
  path: string,
): void {
  const present = new Set(bindings.map((binding) => binding.role));
  const missing = roles.filter((role) => !present.has(role));
  if (missing.length > 0) throw new Error(`${path} missing required evidence role(s): ${missing.join(", ")}`);
}

function explicitObservationDate(event: MtaCanonicalRecord, path: string): OperationalOccurrenceObservationDate {
  const normalized = text(event.payload.date_normalized);
  const precision = text(event.payload.date_precision);
  if (!normalized || !precision) {
    throw new Error(`${path} event ${event.record_id} must carry a canonical normalized date and precision`);
  }
  return {
    raw: text(event.payload.date_raw) ?? text(event.payload.date_text) ?? text(event.payload.date) ?? normalized,
    normalized,
    precision,
    source_field: "date_normalized",
  };
}

function gtfsIdsForRouteRecord(routeRecordId: string, routeAnchors: readonly RouteAnchorRow[]): string[] {
  return uniqueSorted(
    routeAnchors.flatMap((anchor) =>
      anchor.gtfs_route_id &&
      (anchor.canonical_route_record_id === routeRecordId || anchor.variant_record_ids.includes(routeRecordId))
        ? [anchor.gtfs_route_id]
        : [],
    ),
  );
}

function explicitOccurrence(input: {
  decision: OperationalOccurrenceAcceptedDecision;
  records: readonly MtaCanonicalRecord[];
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>;
  routeAnchors: readonly RouteAnchorRow[];
  identities: readonly OperationalOccurrenceIdentityEntry[];
}): OperationalOccurrenceRow {
  const { decision } = input;
  const identity = resolveOperationalOccurrenceIdentity(decision.founding_key, input.identities);
  if (identity.occurrence_id !== decision.occurrence_id) {
    throw new Error(
      `occurrence review ${decision.decision_id} occurrence_id ${decision.occurrence_id} does not match registry ${identity.occurrence_id}`,
    );
  }
  if (identity.decision_id !== decision.decision_id) {
    throw new Error(
      `occurrence review ${decision.decision_id} does not match registry decision_id ${identity.decision_id ?? "null"}`,
    );
  }
  const events = decision.observation_event_record_ids.map((eventId) => {
    const event = input.recordsById.get(eventId);
    if (!event || event.record_kind !== "event") {
      throw new Error(`occurrence review ${decision.decision_id} observation ${eventId} must be a canonical event`);
    }
    if (event.truth_status !== "source_stated" || event.review_state === "quarantined") {
      throw new Error(`occurrence review ${decision.decision_id} event ${eventId} must be source_stated and non-quarantined`);
    }
    return event;
  });
  if (!events.some((event) => identity.founding_event_record_ids.includes(event.record_id))) {
    throw new Error(`occurrence review ${decision.decision_id} does not include the registry founding event`);
  }
  const relations = decision.observation_relation_record_ids.map((relationId) => {
    const relation = input.recordsById.get(relationId);
    if (!relation || relation.record_kind !== "relation") {
      throw new Error(`occurrence review ${decision.decision_id} observation ${relationId} must be a canonical relation`);
    }
    return relation;
  });
  const decisionBindings = uniqueBindings([
    ...decision.resolved_onset.evidence_bindings,
    ...decision.routes.flatMap((route) => route.evidence_bindings),
    ...(decision.treatment.kind === "atomic"
      ? decision.treatment.member.evidence_bindings
      : [
          ...decision.treatment.analysis_family_evidence_bindings,
          ...decision.treatment.members.flatMap((member) => member.evidence_bindings),
        ]),
  ]);
  for (const binding of decisionBindings) bindingRecord(binding, input.recordsById, decision.decision_id);
  requireBindingRoles(decision.resolved_onset.evidence_bindings, ["event_date", "timeline_relation"], `occurrence review ${decision.decision_id} onset`);
  for (const binding of decision.resolved_onset.evidence_bindings) {
    if (
      (binding.role === "event_date" && !decision.observation_event_record_ids.includes(binding.record_id)) ||
      (binding.role === "timeline_relation" && !decision.observation_relation_record_ids.includes(binding.record_id))
    ) {
      throw new Error(`occurrence review ${decision.decision_id} onset evidence is outside its observation set`);
    }
    if (binding.role === "event_date") {
      const record = input.recordsById.get(binding.record_id);
      if (!record || record.record_kind !== "event") {
        throw new Error(`occurrence review ${decision.decision_id} event_date must bind an observation event record`);
      }
      const normalized = text(record.payload.date_normalized);
      const precision = text(record.payload.date_precision);
      if (normalized !== decision.resolved_onset.date || precision !== decision.resolved_onset.precision) {
        throw new Error(
          `occurrence review ${decision.decision_id} onset ${decision.resolved_onset.date}/${decision.resolved_onset.precision} ` +
            `does not match onset event ${record.record_id} ${normalized ?? "missing"}/${precision ?? "missing"}`,
        );
      }
    }
    if (binding.role === "timeline_relation") {
      const record = input.recordsById.get(binding.record_id);
      if (
        !record ||
        record.record_kind !== "relation" ||
        text(record.payload.relation_kind) !== "has_timeline_event" ||
        text(record.payload.assertion_status) !== "delivered" ||
        !decision.observation_event_record_ids.includes(relationEndpoint(record, "object_id") ?? "")
      ) {
        throw new Error(`occurrence review ${decision.decision_id} timeline_relation must bind an observation event`);
      }
    }
  }
  for (const relation of relations.filter((record) => text(record.payload.relation_kind) === "has_timeline_event")) {
    if (!decision.observation_event_record_ids.includes(relationEndpoint(relation, "object_id") ?? "")) {
      throw new Error(`occurrence review ${decision.decision_id} timeline relation ${relation.record_id} does not bind an observation event`);
    }
  }

  const routes: OperationalOccurrenceRoute[] = decision.routes
    .map((route) => {
      const record = input.recordsById.get(route.route_record_id);
      if (!record || record.record_kind !== "route") {
        throw new Error(`occurrence review ${decision.decision_id} route ${route.route_record_id} must be canonical`);
      }
      const gtfsIds = gtfsIdsForRouteRecord(route.route_record_id, input.routeAnchors);
      if (gtfsIds.length !== 1 || gtfsIds[0] !== route.gtfs_route_id) {
        throw new Error(
          `occurrence review ${decision.decision_id} route ${route.route_record_id} expected GTFS ${route.gtfs_route_id}; found ${gtfsIds.join(", ") || "none"}`,
        );
      }
      requireBindingRoles(route.evidence_bindings, ["route_identity", "route_scope"], `occurrence review ${decision.decision_id} route ${route.route_record_id}`);
      if (
        route.evidence_bindings
          .filter((binding) => binding.role === "route_identity")
          .some((binding) => binding.record_id !== route.route_record_id)
      ) {
        throw new Error(`occurrence review ${decision.decision_id} route_identity must bind ${route.route_record_id}`);
      }
      const scopeBindings = route.evidence_bindings.filter((binding) => binding.role === "route_scope");
      if (
        scopeBindings.some((binding) => {
          const relation = input.recordsById.get(binding.record_id);
          return !relation ||
            !new Set(["affects_route", "serves_route"]).has(text(relation.payload.relation_kind) ?? "") ||
            text(relation.payload.assertion_status) !== "delivered" ||
            relationEndpoint(relation, "object_id") !== route.route_record_id;
        })
      ) {
        throw new Error(`occurrence review ${decision.decision_id} route-scope evidence does not bind ${route.route_record_id}`);
      }
      return {
        route_record_id: route.route_record_id,
        gtfs_route_id: route.gtfs_route_id,
        evidence_bindings: uniqueBindings(route.evidence_bindings),
      };
    })
    .sort((left, right) => left.route_record_id.localeCompare(right.route_record_id));

  const memberValue = (member: {
    treatment_record_id: string;
    treatment_family: string;
    evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  }): OperationalOccurrenceTreatmentMember => {
    const treatment = input.recordsById.get(member.treatment_record_id);
    if (!treatment || treatment.record_kind !== "treatment_component") {
      throw new Error(`occurrence review ${decision.decision_id} treatment ${member.treatment_record_id} must be canonical`);
    }
    const canonicalFamily = text(treatment.payload.treatment_family);
    if (canonicalFamily !== member.treatment_family) {
      throw new Error(
        `occurrence review ${decision.decision_id} treatment ${member.treatment_record_id} family ${member.treatment_family} does not match canonical ${canonicalFamily ?? "missing"}`,
      );
    }
    requireBindingRoles(
      member.evidence_bindings,
      ["treatment_definition", "treatment_scope"],
      `occurrence review ${decision.decision_id} treatment ${member.treatment_record_id}`,
    );
    if (
      member.evidence_bindings
        .filter((binding) => binding.role === "treatment_definition")
        .some((binding) => binding.record_id !== member.treatment_record_id)
    ) {
      throw new Error(`occurrence review ${decision.decision_id} treatment_definition must bind ${member.treatment_record_id}`);
    }
    const scopeBindings = member.evidence_bindings.filter((binding) => binding.role === "treatment_scope");
    if (
      scopeBindings.some((binding) => {
        const relation = input.recordsById.get(binding.record_id);
        return !relation ||
          text(relation.payload.relation_kind) !== "has_treatment" ||
          text(relation.payload.assertion_status) !== "delivered" ||
          relationEndpoint(relation, "object_id") !== member.treatment_record_id;
      })
    ) {
      throw new Error(`occurrence review ${decision.decision_id} treatment-scope evidence does not bind ${member.treatment_record_id}`);
    }
    return {
      treatment_record_id: member.treatment_record_id,
      treatment_family: member.treatment_family,
      evidence_bindings: uniqueBindings(member.evidence_bindings),
    };
  };
  let treatment: OperationalOccurrenceTreatment;
  let bundleSupported = true;
  if (decision.treatment.kind === "atomic") {
    treatment = { kind: "atomic", member: memberValue(decision.treatment.member) };
  } else {
    requireBindingRoles(
      decision.treatment.analysis_family_evidence_bindings,
      ["bundle_analysis_family"],
      `occurrence review ${decision.decision_id} bundle analysis family`,
    );
    if (
      decision.treatment.analysis_family_evidence_bindings.some((binding) => {
        const record = input.recordsById.get(binding.record_id);
        return !record || !new Set(["event", "project", "source"]).has(record.record_kind);
      })
    ) {
      throw new Error(
        `occurrence review ${decision.decision_id} bundle_analysis_family must bind event/project/source context`,
      );
    }
    bundleSupported = supportedBundleAnalysisFamilies.has(decision.treatment.analysis_family);
    treatment = {
      kind: "bundle",
      bundle_family: decision.treatment.analysis_family,
      bundle_family_evidence_bindings: uniqueBindings(decision.treatment.analysis_family_evidence_bindings),
      members: decision.treatment.members.map(memberValue).sort((left, right) =>
        left.treatment_record_id.localeCompare(right.treatment_record_id),
      ),
    };
  }
  const exclusionReasons: OperationalOccurrenceExclusionReason[] =
    treatment.kind === "bundle" && !bundleSupported ? ["unsupported_bundle_analysis_family"] : [];
  const observationEventIdSet = new Set(decision.observation_event_record_ids);
  const onsetEventIdSet = new Set(
    decision.resolved_onset.evidence_bindings
      .filter((binding) => binding.role === "event_date")
      .map((binding) => binding.record_id),
  );
  const observations = events
    .map((event) => {
      const scopedRelations = relations.filter((relation) => {
        const subjectId = relationEndpoint(relation, "subject_id");
        const objectId = relationEndpoint(relation, "object_id");
        if (subjectId === event.record_id || objectId === event.record_id) return true;
        const touchesAnotherPhase = Boolean(
          (subjectId && observationEventIdSet.has(subjectId)) ||
          (objectId && observationEventIdSet.has(objectId)),
        );
        return onsetEventIdSet.has(event.record_id) && !touchesAnotherPhase;
      });
      return {
        event_record_id: event.record_id,
        relation_record_ids: scopedRelations.map((relation) => relation.record_id).sort(),
        document_time_statuses: uniqueSorted([
          ...scopedRelations.flatMap((relation) => {
            const status = text(relation.payload.assertion_status);
            return status ? [status] : [];
          }),
          ...(text(event.payload.lifecycle_phase) ? [text(event.payload.lifecycle_phase)!] : []),
        ]),
        document_time_dates: [explicitObservationDate(event, `occurrence review ${decision.decision_id}`)],
        status_as_of_dates: uniqueSorted(
          scopedRelations.flatMap((relation) => {
            const value = text(relation.payload.as_of_date) ?? text(relation.payload.status_as_of_date);
            return value ? [value] : [];
          }),
        ),
      };
    })
    .sort((left, right) => left.event_record_id.localeCompare(right.event_record_id));
  const memberIds =
    treatment.kind === "atomic"
      ? [treatment.member.treatment_record_id]
      : treatment.members.map((member) => member.treatment_record_id);
  const phaseRecordIds = uniqueSorted(decision.observation_event_record_ids);
  if (phaseRecordIds.length !== decision.observation_event_record_ids.length) {
    throw new Error(`${decision.decision_id} contains duplicate phase event identities`);
  }
  const phaseRecordIdSet = new Set(phaseRecordIds);
  const phaseRelations = relations.filter((relation) => {
    const subjectId = relationEndpoint(relation, "subject_id");
    const objectId = relationEndpoint(relation, "object_id");
    return Boolean(subjectId && objectId && phaseRecordIdSet.has(subjectId) && phaseRecordIdSet.has(objectId));
  });
  const phaseRelationEndpoints = phaseRelations.map((relation) =>
    assertAllowedPhaseRelation({
      relation,
      phaseRecordIds: phaseRecordIdSet,
      recordsById: input.recordsById,
      path: `phase relation ${relation.record_id} in ${decision.decision_id}`,
    }));
  assertConnectedPhaseGraph(phaseRecordIds, phaseRelationEndpoints, `occurrence review ${decision.decision_id}`);
  const phaseRelationRecordIds = phaseRelations.map((relation) => relation.record_id).sort();
  const phaseRelationEvidenceBindings = uniqueBindings(phaseRelations.flatMap((relation) =>
    relationEvidenceBindings(relation, "phase_relation", `phase relation ${relation.record_id}`)));
  for (const binding of phaseRelationEvidenceBindings) bindingRecord(binding, input.recordsById, decision.decision_id);
  const physicalScope = occurrencePhysicalScope({
    treatmentRecordIds: memberIds,
    reviewedRelationRecordIds: decision.observation_relation_record_ids,
    recordsById: input.recordsById,
  });
  for (const binding of physicalScope.evidenceBindings) bindingRecord(binding, input.recordsById, decision.decision_id);
  const allBindings = uniqueBindings([
    ...decisionBindings,
    ...phaseRelationEvidenceBindings,
    ...physicalScope.evidenceBindings,
  ]);
  const sourceIds = uniqueSorted(allBindings.map((binding) => binding.source_id));
  assertOfficialOccurrenceSources(sourceIds, input.records, decision.decision_id);
  const provenanceRelationIds = uniqueSorted([
    ...decision.observation_relation_record_ids,
    ...physicalScope.relationRecordIds,
  ]);
  return {
    schema_version: OPERATIONAL_OCCURRENCE_SCHEMA_VERSION,
    occurrence_id: decision.occurrence_id,
    occurrence_aliases: [...identity.aliases].sort(),
    occurrence_review_decision_id: decision.decision_id,
    founding_key: decision.founding_key,
    resolution_cluster_id: identity.resolution_cluster_id,
    phase_record_ids: phaseRecordIds,
    phase_relation_record_ids: phaseRelationRecordIds,
    phase_relation_evidence_bindings: phaseRelationEvidenceBindings,
    phase_relation_disposition: phaseRecordIds.length === 1 ? "single_phase" : "related_phases",
    physical_scope_record_ids: physicalScope.recordIds,
    physical_scope_relation_record_ids: physicalScope.relationRecordIds,
    physical_scope_evidence_bindings: physicalScope.evidenceBindings,
    observations,
    resolved_status: "realized",
    resolved_onset: {
      date: decision.resolved_onset.date,
      precision: decision.resolved_onset.precision,
      resolver_ids: [decision.decision_id],
      publication_dates: publicationDates(sourceIds, input.records),
      retrieval_dates: retrievalDates(sourceIds, input.records),
      evidence_bindings: uniqueBindings(decision.resolved_onset.evidence_bindings),
    },
    routes,
    treatment,
    source_ids: sourceIds,
    evidence_bindings: allBindings,
    exclusion_reasons: exclusionReasons,
    review_state: "approved",
    study_projection_eligible: exclusionReasons.length === 0,
    provenance: {
      anchor_review_decision_ids: [],
      event_record_ids: [...decision.observation_event_record_ids].sort(),
      relation_record_ids: provenanceRelationIds,
      route_record_ids: routes.map((route) => route.route_record_id),
      treatment_record_ids: [...memberIds].sort(),
    },
  };
}

export function computeOperationalOccurrences(
  records: readonly MtaCanonicalRecord[],
  routeAnchors: readonly RouteAnchorRow[],
  options: ComputeOperationalOccurrencesOptions,
): OperationalOccurrenceRow[] {
  const decisions = assertOperationalAnchorReviewDecisions(options.reviewDecisions, records);
  const identities = assertOperationalOccurrenceIdentityRegistry(options.identityRegistry);
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const explicitDecisions = [...(options.occurrenceReviewDecisions ?? [])].sort((left, right) =>
    left.decision_id.localeCompare(right.decision_id),
  );
  const explicitOccurrenceIds = new Set<string>();
  const explicitFoundingKeys = new Set<string>();
  for (const decision of explicitDecisions) {
    if (explicitOccurrenceIds.has(decision.occurrence_id)) {
      throw new Error(`multiple approved occurrence reviews bind ${decision.occurrence_id}`);
    }
    if (explicitFoundingKeys.has(decision.founding_key)) {
      throw new Error(`multiple approved occurrence reviews bind ${decision.founding_key}`);
    }
    explicitOccurrenceIds.add(decision.occurrence_id);
    explicitFoundingKeys.add(decision.founding_key);
  }
  const migratedDecisions = decisions.filter((decision) => !explicitFoundingKeys.has(`event:${decision.event_record_id}`));
  const rowsByDecision = reviewedRowsByDecision(records, routeAnchors, migratedDecisions);
  const migratedRows = [...groupBy(migratedDecisions, (decision) => decision.event_record_id).entries()]
    .map(([eventId, eventDecisions]) =>
      occurrenceForEvent({
        eventId,
        decisions: eventDecisions,
        records,
        recordsById,
        rowsByDecision,
        identities,
      }),
    );
  const explicitRows = explicitDecisions.map((decision) =>
    explicitOccurrence({ decision, records, recordsById, routeAnchors, identities }),
  );
  const rows = [...migratedRows, ...explicitRows].sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));
  if (new Set(rows.map((row) => row.occurrence_id)).size !== rows.length) {
    throw new Error("operational occurrence computation produced duplicate occurrence_id values");
  }
  const parsed = rows.map((row, index) => parseOperationalOccurrence(row, `computed operational occurrence[${index}]`));
  return assertOperationalOccurrenceCanonicalIntegrity(parsed, records);
}

export function summarizeOperationalOccurrences(rows: readonly OperationalOccurrenceRow[]): OperationalOccurrenceSummary {
  const counts = new Map<string, number>();
  for (const reason of rows.flatMap((row) => row.exclusion_reasons)) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return {
    schema_version: OPERATIONAL_OCCURRENCE_SCHEMA_VERSION,
    occurrence_count: rows.length,
    study_projection_eligible_count: rows.filter((row) => row.study_projection_eligible).length,
    atomic_count: rows.filter((row) => row.treatment.kind === "atomic").length,
    bundle_count: rows.filter((row) => row.treatment.kind === "bundle").length,
    multi_route_count: rows.filter((row) => row.routes.length > 1).length,
    candidate_projection_count: rows
      .filter((row) => row.study_projection_eligible)
      .reduce((count, row) => count + row.routes.length, 0),
    counts_by_exclusion_reason: Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right))),
  };
}

export function operationalOccurrencesJsonl(rows: readonly OperationalOccurrenceRow[]): string {
  return rows.map((row) => stableJson(row as unknown as JsonValue)).join("\n") + (rows.length > 0 ? "\n" : "");
}

export function writeOperationalOccurrencesJsonl(path: string, rows: readonly OperationalOccurrenceRow[]): void {
  writeFileSync(path, operationalOccurrencesJsonl(rows), "utf8");
}

export function operationalOccurrenceSummaryJson(summary: OperationalOccurrenceSummary): string {
  return `${stableJson(summary as unknown as JsonValue)}\n`;
}

const occurrenceFields = new Set([
  "evidence_bindings",
  "exclusion_reasons",
  "founding_key",
  "observations",
  "occurrence_aliases",
  "occurrence_id",
  "occurrence_review_decision_id",
  "phase_record_ids",
  "phase_relation_disposition",
  "phase_relation_evidence_bindings",
  "phase_relation_record_ids",
  "physical_scope_evidence_bindings",
  "physical_scope_record_ids",
  "physical_scope_relation_record_ids",
  "provenance",
  "resolution_cluster_id",
  "resolved_onset",
  "resolved_status",
  "review_state",
  "routes",
  "schema_version",
  "source_ids",
  "study_projection_eligible",
  "treatment",
]);
const observationFields = new Set([
  "document_time_dates",
  "document_time_statuses",
  "event_record_id",
  "relation_record_ids",
  "status_as_of_dates",
]);
const observationDateFields = new Set(["normalized", "precision", "raw", "source_field"]);
const onsetFields = new Set([
  "date",
  "evidence_bindings",
  "precision",
  "publication_dates",
  "resolver_ids",
  "retrieval_dates",
]);
const bindingFields = new Set(["evidence_id", "record_id", "role", "source_id"]);
const routeFields = new Set(["evidence_bindings", "gtfs_route_id", "route_record_id"]);
const memberFields = new Set(["evidence_bindings", "treatment_family", "treatment_record_id"]);
const atomicTreatmentFields = new Set(["kind", "member"]);
const bundleTreatmentFields = new Set(["bundle_family", "bundle_family_evidence_bindings", "kind", "members"]);
const provenanceFields = new Set([
  "anchor_review_decision_ids",
  "event_record_ids",
  "relation_record_ids",
  "route_record_ids",
  "treatment_record_ids",
]);
const summaryFields = new Set([
  "atomic_count",
  "bundle_count",
  "candidate_projection_count",
  "counts_by_exclusion_reason",
  "multi_route_count",
  "occurrence_count",
  "schema_version",
  "study_projection_eligible_count",
]);
const occurrenceEvidenceRoles = new Set<OperationalOccurrenceEvidenceRole>([
  "event_date",
  "bundle_analysis_family",
  "phase_relation",
  "physical_scope",
  "route_identity",
  "route_scope",
  "route_treatment_event_bridge",
  "timeline_relation",
  "treatment_definition",
  "treatment_scope",
]);

function contractObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function contractKeys(object: Record<string, unknown>, fields: ReadonlySet<string>, path: string): void {
  const extras = Object.keys(object).filter((field) => !fields.has(field)).sort();
  if (extras.length > 0) throw new Error(`${path} has unknown field(s): ${extras.join(", ")}`);
}

function contractString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value;
}

function contractNullableString(value: unknown, path: string): string | null {
  return value === null ? null : contractString(value, path);
}

function contractBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path} must be boolean`);
  return value;
}

function contractInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative integer`);
  }
  return value;
}

function contractStringArray(value: unknown, path: string, nonempty = false): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const values = value.map((entry, index) => contractString(entry, `${path}[${index}]`));
  if (nonempty && values.length === 0) throw new Error(`${path} must not be empty`);
  if (new Set(values).size !== values.length) throw new Error(`${path} must not contain duplicates`);
  return values;
}

function parseOccurrenceBinding(value: unknown, path: string): OperationalOccurrenceEvidenceBinding {
  const object = contractObject(value, path);
  contractKeys(object, bindingFields, path);
  const role = contractString(object.role, `${path}.role`);
  if (!occurrenceEvidenceRoles.has(role as OperationalOccurrenceEvidenceRole)) {
    throw new Error(`${path}.role is unsupported: ${role}`);
  }
  return {
    role: role as OperationalOccurrenceEvidenceRole,
    record_id: contractString(object.record_id, `${path}.record_id`),
    source_id: contractString(object.source_id, `${path}.source_id`),
    evidence_id: contractString(object.evidence_id, `${path}.evidence_id`),
  };
}

function parseOccurrenceBindings(value: unknown, path: string, nonempty = false): OperationalOccurrenceEvidenceBinding[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  if (nonempty && value.length === 0) throw new Error(`${path} must not be empty`);
  const bindings = value.map((entry, index) => parseOccurrenceBinding(entry, `${path}[${index}]`));
  if (new Set(bindings.map(bindingKey)).size !== bindings.length) throw new Error(`${path} must not contain duplicates`);
  return bindings;
}

function parseObservation(value: unknown, path: string): OperationalOccurrenceObservation {
  const object = contractObject(value, path);
  contractKeys(object, observationFields, path);
  if (!Array.isArray(object.document_time_dates)) throw new Error(`${path}.document_time_dates must be an array`);
  const dates = object.document_time_dates.map((entry, index) => {
    const datePath = `${path}.document_time_dates[${index}]`;
    const date = contractObject(entry, datePath);
    contractKeys(date, observationDateFields, datePath);
    return {
      raw: contractString(date.raw, `${datePath}.raw`),
      normalized: contractString(date.normalized, `${datePath}.normalized`),
      precision: contractString(date.precision, `${datePath}.precision`),
      source_field: contractString(date.source_field, `${datePath}.source_field`),
    };
  });
  return {
    event_record_id: contractString(object.event_record_id, `${path}.event_record_id`),
    relation_record_ids: contractStringArray(object.relation_record_ids, `${path}.relation_record_ids`, true),
    document_time_statuses: contractStringArray(object.document_time_statuses, `${path}.document_time_statuses`),
    document_time_dates: dates,
    status_as_of_dates: contractStringArray(object.status_as_of_dates, `${path}.status_as_of_dates`),
  };
}

function parseMember(value: unknown, path: string): OperationalOccurrenceTreatmentMember {
  const object = contractObject(value, path);
  contractKeys(object, memberFields, path);
  return {
    treatment_record_id: contractString(object.treatment_record_id, `${path}.treatment_record_id`),
    treatment_family: contractString(object.treatment_family, `${path}.treatment_family`),
    evidence_bindings: parseOccurrenceBindings(object.evidence_bindings, `${path}.evidence_bindings`, true),
  };
}

function parseTreatment(value: unknown, path: string): OperationalOccurrenceTreatment {
  const object = contractObject(value, path);
  if (object.kind === "atomic") {
    contractKeys(object, atomicTreatmentFields, path);
    return { kind: "atomic", member: parseMember(object.member, `${path}.member`) };
  }
  if (object.kind === "bundle") {
    contractKeys(object, bundleTreatmentFields, path);
    if (!Array.isArray(object.members) || object.members.length < 2) throw new Error(`${path}.members must contain at least two members`);
    const familyBindings = parseOccurrenceBindings(
      object.bundle_family_evidence_bindings,
      `${path}.bundle_family_evidence_bindings`,
    );
    if (familyBindings.some((binding) => binding.role !== "bundle_analysis_family")) {
      throw new Error(`${path}.bundle_family_evidence_bindings must all use bundle_analysis_family`);
    }
    return {
      kind: "bundle",
      bundle_family: contractNullableString(object.bundle_family, `${path}.bundle_family`),
      bundle_family_evidence_bindings: familyBindings,
      members: object.members.map((entry, index) => parseMember(entry, `${path}.members[${index}]`)),
    };
  }
  throw new Error(`${path}.kind must be atomic or bundle`);
}

export function parseOperationalOccurrence(value: unknown, path = "operational occurrence"): OperationalOccurrenceRow {
  let object = contractObject(value, path);
  // Immutable v1 releases remain readable. The v2 phase fields are a deterministic projection of
  // the already-pinned single event in provenance; no historical byte is mutated or reinterpreted.
  if (object.schema_version === 1) {
    const legacyProvenance = contractObject(object.provenance, `${path}.provenance`);
    const legacyEventIds = contractStringArray(
      legacyProvenance.event_record_ids,
      `${path}.provenance.event_record_ids`,
      true,
    );
    if (legacyEventIds.length !== 1) {
      throw new Error(`${path} schema v1 compatibility requires exactly one provenance event id`);
    }
    object = {
      ...object,
      schema_version: OPERATIONAL_OCCURRENCE_SCHEMA_VERSION,
      phase_record_ids: legacyEventIds,
      phase_relation_record_ids: [],
      phase_relation_evidence_bindings: [],
      phase_relation_disposition: "single_phase",
      physical_scope_record_ids: [],
      physical_scope_relation_record_ids: [],
      physical_scope_evidence_bindings: [],
    };
  }
  contractKeys(object, occurrenceFields, path);
  if (object.schema_version !== OPERATIONAL_OCCURRENCE_SCHEMA_VERSION) {
    throw new Error(`${path}.schema_version must be ${OPERATIONAL_OCCURRENCE_SCHEMA_VERSION}`);
  }
  if (object.resolved_status !== "realized") throw new Error(`${path}.resolved_status must be realized`);
  if (object.review_state !== "approved") throw new Error(`${path}.review_state must be approved`);
  const onsetObject = contractObject(object.resolved_onset, `${path}.resolved_onset`);
  contractKeys(onsetObject, onsetFields, `${path}.resolved_onset`);
  const precision = contractString(onsetObject.precision, `${path}.resolved_onset.precision`);
  if (precision !== "day" && precision !== "month") throw new Error(`${path}.resolved_onset.precision must be day or month`);
  const date = contractString(onsetObject.date, `${path}.resolved_onset.date`);
  const datePattern = precision === "day" ? /^\d{4}-\d{2}-\d{2}$/u : /^\d{4}-\d{2}$/u;
  if (!datePattern.test(date)) throw new Error(`${path}.resolved_onset.date does not match ${precision} precision`);
  if (!Array.isArray(object.observations) || object.observations.length === 0) throw new Error(`${path}.observations must not be empty`);
  if (!Array.isArray(object.routes) || object.routes.length === 0) throw new Error(`${path}.routes must not be empty`);
  const routes = object.routes.map((entry, index) => {
    const routePath = `${path}.routes[${index}]`;
    const route = contractObject(entry, routePath);
    contractKeys(route, routeFields, routePath);
    return {
      route_record_id: contractString(route.route_record_id, `${routePath}.route_record_id`),
      gtfs_route_id: contractString(route.gtfs_route_id, `${routePath}.gtfs_route_id`),
      evidence_bindings: parseOccurrenceBindings(route.evidence_bindings, `${routePath}.evidence_bindings`, true),
    };
  });
  if (new Set(routes.map((route) => route.route_record_id)).size !== routes.length) {
    throw new Error(`${path}.routes contains duplicate route_record_id values`);
  }
  const treatment = parseTreatment(object.treatment, `${path}.treatment`);
  if (!Array.isArray(object.exclusion_reasons)) throw new Error(`${path}.exclusion_reasons must be an array`);
  const exclusionReasons = object.exclusion_reasons.map((entry, index) => {
    const reason = contractString(entry, `${path}.exclusion_reasons[${index}]`);
    if (reason !== "unsupported_bundle_analysis_family") throw new Error(`${path}.exclusion_reasons[${index}] is unsupported: ${reason}`);
    return reason as OperationalOccurrenceExclusionReason;
  });
  const eligible = contractBoolean(object.study_projection_eligible, `${path}.study_projection_eligible`);
  const bundleSupported =
    treatment.kind === "bundle" &&
    treatment.bundle_family !== null &&
    supportedBundleAnalysisFamilies.has(treatment.bundle_family) &&
    treatment.bundle_family_evidence_bindings.length > 0;
  if (treatment.kind === "bundle" && !bundleSupported && !exclusionReasons.includes("unsupported_bundle_analysis_family")) {
    throw new Error(`${path} bundle requires unsupported_bundle_analysis_family`);
  }
  if (eligible !== (exclusionReasons.length === 0)) {
    throw new Error(`${path}.study_projection_eligible must equal an empty exclusion set`);
  }
  const provenance = contractObject(object.provenance, `${path}.provenance`);
  contractKeys(provenance, provenanceFields, `${path}.provenance`);
  const onsetEvidenceBindings = parseOccurrenceBindings(
    onsetObject.evidence_bindings,
    `${path}.resolved_onset.evidence_bindings`,
    true,
  );
  const evidenceBindings = parseOccurrenceBindings(object.evidence_bindings, `${path}.evidence_bindings`, true);
  const phaseRecordIds = contractStringArray(object.phase_record_ids, `${path}.phase_record_ids`, true);
  const phaseRelationRecordIds = contractStringArray(
    object.phase_relation_record_ids,
    `${path}.phase_relation_record_ids`,
  );
  const phaseRelationEvidenceBindings = parseOccurrenceBindings(
    object.phase_relation_evidence_bindings,
    `${path}.phase_relation_evidence_bindings`,
  );
  const phaseRelationDisposition = contractString(
    object.phase_relation_disposition,
    `${path}.phase_relation_disposition`,
  );
  const physicalScopeRecordIds = contractStringArray(
    object.physical_scope_record_ids,
    `${path}.physical_scope_record_ids`,
  );
  const physicalScopeRelationRecordIds = contractStringArray(
    object.physical_scope_relation_record_ids,
    `${path}.physical_scope_relation_record_ids`,
  );
  const physicalScopeEvidenceBindings = parseOccurrenceBindings(
    object.physical_scope_evidence_bindings,
    `${path}.physical_scope_evidence_bindings`,
  );
  if (physicalScopeEvidenceBindings.some((binding) => binding.role !== "physical_scope")) {
    throw new Error(`${path}.physical_scope_evidence_bindings must all use physical_scope`);
  }
  if (phaseRelationEvidenceBindings.some((binding) => binding.role !== "phase_relation")) {
    throw new Error(`${path}.phase_relation_evidence_bindings must all use phase_relation`);
  }
  if (phaseRelationDisposition !== "single_phase" && phaseRelationDisposition !== "related_phases") {
    throw new Error(`${path}.phase_relation_disposition must be single_phase or related_phases`);
  }
  const provenanceEventIds = contractStringArray(provenance.event_record_ids, `${path}.provenance.event_record_ids`, true);
  const provenanceRelationIds = contractStringArray(provenance.relation_record_ids, `${path}.provenance.relation_record_ids`, true);
  const provenanceRouteIds = contractStringArray(
    provenance.route_record_ids,
    `${path}.provenance.route_record_ids`,
    true,
  );
  const provenanceTreatmentIds = contractStringArray(
    provenance.treatment_record_ids,
    `${path}.provenance.treatment_record_ids`,
    true,
  );
  const observations = object.observations.map((entry, index) => parseObservation(entry, `${path}.observations[${index}]`));
  const treatmentRecordIds = treatment.kind === "atomic"
    ? [treatment.member.treatment_record_id]
    : treatment.members.map((member) => member.treatment_record_id);
  const sameStringSet = (left: readonly string[], right: readonly string[]) =>
    stableJson(uniqueSorted(left) as unknown as JsonValue) === stableJson(uniqueSorted(right) as unknown as JsonValue);
  if (stableJson(phaseRecordIds as unknown as JsonValue) !== stableJson(provenanceEventIds as unknown as JsonValue)) {
    throw new Error(`${path}.phase_record_ids must exactly match provenance.event_record_ids`);
  }
  if (!sameStringSet(phaseRecordIds, observations.map((observation) => observation.event_record_id))) {
    throw new Error(`${path}.phase_record_ids must exactly match observation event identities`);
  }
  if (!sameStringSet(provenanceRouteIds, routes.map((route) => route.route_record_id))) {
    throw new Error(`${path}.provenance.route_record_ids must exactly match projected routes`);
  }
  if (!sameStringSet(provenanceTreatmentIds, treatmentRecordIds)) {
    throw new Error(`${path}.provenance.treatment_record_ids must exactly match projected treatment members`);
  }
  if (phaseRelationRecordIds.some((recordId) => !provenanceRelationIds.includes(recordId))) {
    throw new Error(`${path}.phase_relation_record_ids must be included in provenance.relation_record_ids`);
  }
  if (physicalScopeRelationRecordIds.some((recordId) => !provenanceRelationIds.includes(recordId))) {
    throw new Error(`${path}.physical_scope_relation_record_ids must be included in provenance.relation_record_ids`);
  }
  const physicalScopeBindingRecordIds = uniqueSorted(physicalScopeEvidenceBindings.map((binding) => binding.record_id));
  if (
    stableJson(physicalScopeBindingRecordIds as unknown as JsonValue) !==
    stableJson(uniqueSorted(physicalScopeRelationRecordIds) as unknown as JsonValue)
  ) {
    throw new Error(`${path}.physical_scope_evidence_bindings must bind every physical_scope_relation_record_id exactly`);
  }
  const phaseRelationBindingRecordIds = uniqueSorted(phaseRelationEvidenceBindings.map((binding) => binding.record_id));
  if (
    stableJson(phaseRelationBindingRecordIds as unknown as JsonValue) !==
    stableJson(uniqueSorted(phaseRelationRecordIds) as unknown as JsonValue)
  ) {
    throw new Error(`${path}.phase_relation_evidence_bindings must bind every phase_relation_record_id exactly`);
  }
  if (
    (physicalScopeRecordIds.length === 0) !== (physicalScopeRelationRecordIds.length === 0) ||
    (physicalScopeRelationRecordIds.length === 0) !== (physicalScopeEvidenceBindings.length === 0)
  ) {
    throw new Error(`${path} physical scope ids, relations, and evidence must be present or absent together`);
  }
  if (
    phaseRelationDisposition === "single_phase" &&
    (phaseRecordIds.length !== 1 || phaseRelationRecordIds.length !== 0 || phaseRelationEvidenceBindings.length !== 0)
  ) {
    throw new Error(`${path} single_phase requires exactly one phase record and no phase relation records or evidence`);
  }
  if (
    phaseRelationDisposition === "related_phases" &&
    (phaseRecordIds.length < 2 || phaseRelationRecordIds.length === 0 || phaseRelationEvidenceBindings.length === 0)
  ) {
    throw new Error(`${path} related_phases requires multiple phase records and evidence-bound phase relations`);
  }
  const ledgerKeys = new Set(evidenceBindings.map(bindingKey));
  const nestedBindings = [
    ...onsetEvidenceBindings,
    ...phaseRelationEvidenceBindings,
    ...physicalScopeEvidenceBindings,
    ...routes.flatMap((route) => route.evidence_bindings),
    ...(treatment.kind === "atomic"
      ? treatment.member.evidence_bindings
      : [
          ...treatment.bundle_family_evidence_bindings,
          ...treatment.members.flatMap((member) => member.evidence_bindings),
        ]),
  ];
  const missingNested = nestedBindings.filter((binding) => !ledgerKeys.has(bindingKey(binding)));
  if (missingNested.length > 0) {
    throw new Error(`${path} nested evidence binding is missing from the top-level evidence ledger: ${bindingKey(missingNested[0]!)}`);
  }
  const provenanceBindingIds = new Set([
    ...provenanceEventIds,
    ...provenanceRelationIds,
    ...provenanceRouteIds,
    ...provenanceTreatmentIds,
  ]);
  // Bundle-family and route/treatment/event bridge evidence may be carried by a canonical project.
  // Projects are deliberately not occurrence members; the binding itself is the explicit
  // provenance reference and must still be in the top-level evidence ledger.
  const projectScopedEvidenceRoles = new Set<OperationalOccurrenceEvidenceRole>([
    "bundle_analysis_family",
    "route_treatment_event_bridge",
  ]);
  const outOfScopeBinding = evidenceBindings.find((binding) =>
    !projectScopedEvidenceRoles.has(binding.role) && !provenanceBindingIds.has(binding.record_id));
  if (outOfScopeBinding) {
    throw new Error(`${path} evidence binding references a record outside occurrence provenance: ${bindingKey(outOfScopeBinding)}`);
  }
  const sourceIds = contractStringArray(object.source_ids, `${path}.source_ids`, true);
  if (!sameStringSet(sourceIds, evidenceBindings.map((binding) => binding.source_id))) {
    throw new Error(`${path}.source_ids must exactly match top-level evidence sources`);
  }
  return {
    schema_version: OPERATIONAL_OCCURRENCE_SCHEMA_VERSION,
    occurrence_id: contractString(object.occurrence_id, `${path}.occurrence_id`),
    occurrence_aliases: contractStringArray(object.occurrence_aliases, `${path}.occurrence_aliases`),
    occurrence_review_decision_id: contractString(
      object.occurrence_review_decision_id,
      `${path}.occurrence_review_decision_id`,
    ),
    founding_key: contractString(object.founding_key, `${path}.founding_key`),
    resolution_cluster_id: contractNullableString(object.resolution_cluster_id, `${path}.resolution_cluster_id`),
    phase_record_ids: phaseRecordIds,
    phase_relation_record_ids: phaseRelationRecordIds,
    phase_relation_evidence_bindings: phaseRelationEvidenceBindings,
    phase_relation_disposition: phaseRelationDisposition,
    physical_scope_record_ids: physicalScopeRecordIds,
    physical_scope_relation_record_ids: physicalScopeRelationRecordIds,
    physical_scope_evidence_bindings: physicalScopeEvidenceBindings,
    observations,
    resolved_status: "realized",
    resolved_onset: {
      date,
      precision,
      resolver_ids: contractStringArray(onsetObject.resolver_ids, `${path}.resolved_onset.resolver_ids`, true),
      publication_dates: contractStringArray(onsetObject.publication_dates, `${path}.resolved_onset.publication_dates`),
      retrieval_dates: contractStringArray(onsetObject.retrieval_dates, `${path}.resolved_onset.retrieval_dates`),
      evidence_bindings: onsetEvidenceBindings,
    },
    routes,
    treatment,
    source_ids: sourceIds,
    evidence_bindings: evidenceBindings,
    exclusion_reasons: exclusionReasons,
    review_state: "approved",
    study_projection_eligible: eligible,
    provenance: {
      anchor_review_decision_ids: contractStringArray(
        provenance.anchor_review_decision_ids,
        `${path}.provenance.anchor_review_decision_ids`,
      ),
      event_record_ids: provenanceEventIds,
      relation_record_ids: provenanceRelationIds,
      route_record_ids: provenanceRouteIds,
      treatment_record_ids: provenanceTreatmentIds,
    },
  };
}

function sameRecordIds(left: readonly string[], right: readonly string[]): boolean {
  return uniqueSorted(left).join("\0") === uniqueSorted(right).join("\0");
}

function sameBindings(
  left: readonly OperationalOccurrenceEvidenceBinding[],
  right: readonly OperationalOccurrenceEvidenceBinding[],
): boolean {
  return stableJson(uniqueBindings(left) as unknown as JsonValue) ===
    stableJson(uniqueBindings(right) as unknown as JsonValue);
}

function assertExactProjectedRelationEvidence(input: {
  relations: readonly MtaCanonicalRecord[];
  bindings: readonly OperationalOccurrenceEvidenceBinding[];
  role: "phase_relation" | "physical_scope";
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>;
  path: string;
}): void {
  const expected = uniqueBindings(input.relations.flatMap((relation) =>
    relationEvidenceBindings(relation, input.role, `${input.path} relation ${relation.record_id}`)));
  const actual = uniqueBindings(input.bindings);
  if (actual.length !== input.bindings.length) {
    throw new Error(`${input.path} contains duplicate ${input.role} evidence bindings`);
  }
  if (
    stableJson(expected as unknown as JsonValue) !==
    stableJson(actual as unknown as JsonValue)
  ) {
    throw new Error(`${input.path} ${input.role} evidence bindings do not exactly match canonical evidence IDs`);
  }
  for (const binding of actual) bindingRecord(binding, input.recordsById, input.path);
}

/**
 * Canonical validation is separate from JSON shape parsing: every projected phase/scope identity
 * and relation must resolve to the authoritative canonical record of the expected type, and every
 * projected evidence tuple must exactly equal the relation's canonical evidence refs.
 */
export function assertOperationalOccurrenceCanonicalIntegrity(
  rows: readonly OperationalOccurrenceRow[],
  records: readonly MtaCanonicalRecord[],
): OperationalOccurrenceRow[] {
  const recordsById = new Map<string, MtaCanonicalRecord>();
  for (const record of records) {
    if (recordsById.has(record.record_id)) throw new Error(`canonical corpus contains duplicate record id ${record.record_id}`);
    recordsById.set(record.record_id, record);
  }

  for (const row of rows) {
    const path = `operational occurrence ${row.occurrence_id}`;
    if (new Set(row.phase_record_ids).size !== row.phase_record_ids.length) {
      throw new Error(`${path} contains duplicate phase identities`);
    }
    if (new Set(row.phase_relation_record_ids).size !== row.phase_relation_record_ids.length) {
      throw new Error(`${path} contains duplicate phase relation identities`);
    }
    if (new Set(row.physical_scope_record_ids).size !== row.physical_scope_record_ids.length) {
      throw new Error(`${path} contains duplicate physical-scope identities`);
    }
    if (new Set(row.physical_scope_relation_record_ids).size !== row.physical_scope_relation_record_ids.length) {
      throw new Error(`${path} contains duplicate physical-scope relation identities`);
    }

    const observationsByEventId = new Map<string, OperationalOccurrenceObservation>();
    for (const observation of row.observations) {
      if (observationsByEventId.has(observation.event_record_id)) {
        throw new Error(`${path} contains duplicate observations for phase ${observation.event_record_id}`);
      }
      observationsByEventId.set(observation.event_record_id, observation);
    }

    for (const phaseRecordId of row.phase_record_ids) {
      const phase = recordsById.get(phaseRecordId);
      if (!phase || phase.record_kind !== "event") {
        throw new Error(`${path} phase ${phaseRecordId} must resolve to a canonical event`);
      }
      if (phase.truth_status !== "source_stated" || phase.review_state === "quarantined") {
        throw new Error(`${path} phase ${phaseRecordId} must be source_stated and non-quarantined`);
      }
      if (phase.evidence_refs.length === 0 || phase.evidence_refs.some((ref) => !ref.evidence_id)) {
        throw new Error(`${path} phase ${phaseRecordId} must retain exact canonical evidence IDs`);
      }
    }

    const observedRelationIds = uniqueSorted(row.observations.flatMap((observation) => observation.relation_record_ids));
    const observedRelations = observedRelationIds.map((recordId) => {
      const relation = recordsById.get(recordId);
      if (!relation || relation.record_kind !== "relation") {
        throw new Error(`${path} observation relation ${recordId} must resolve to a canonical relation`);
      }
      return relation;
    });
    const observedRelationsById = new Map(observedRelations.map((relation) => [relation.record_id, relation]));
    for (const phaseRecordId of row.phase_record_ids) {
      const phase = recordsById.get(phaseRecordId)!;
      const observation = observationsByEventId.get(phaseRecordId);
      if (!observation) throw new Error(`${path} phase ${phaseRecordId} must have exactly one observation`);
      const normalized = text(phase.payload.date_normalized);
      const precision = text(phase.payload.date_precision);
      if (
        !normalized ||
        !precision ||
        !observation.document_time_dates.some((date) => date.normalized === normalized && date.precision === precision)
      ) {
        throw new Error(`${path} phase ${phaseRecordId} observation must retain its canonical date and precision`);
      }
      const observationRelations = observation.relation_record_ids.map((recordId) => {
        const relation = observedRelationsById.get(recordId);
        if (!relation) throw new Error(`${path} phase ${phaseRecordId} references unresolvable relation ${recordId}`);
        return relation;
      });
      const expectedStatuses = uniqueSorted([
        ...observationRelations.flatMap((relation) => {
          const status = text(relation.payload.assertion_status);
          return status ? [status] : [];
        }),
        ...(text(phase.payload.lifecycle_phase) ? [text(phase.payload.lifecycle_phase)!] : []),
      ]);
      if (!sameRecordIds(expectedStatuses, observation.document_time_statuses)) {
        throw new Error(`${path} phase ${phaseRecordId} status claims must exactly match its canonical event and relations`);
      }
      const expectedStatusDates = uniqueSorted(observationRelations.flatMap((relation) => {
        const value = text(relation.payload.as_of_date) ?? text(relation.payload.status_as_of_date);
        return value ? [value] : [];
      }));
      if (!sameRecordIds(expectedStatusDates, observation.status_as_of_dates)) {
        throw new Error(`${path} phase ${phaseRecordId} status dates must exactly match its canonical relations`);
      }
    }

    const onsetEventBindings = row.resolved_onset.evidence_bindings.filter((binding) => binding.role === "event_date");
    if (onsetEventBindings.length === 0) throw new Error(`${path} must bind its onset to a canonical phase event`);
    const onsetEventIds = uniqueSorted(onsetEventBindings.map((binding) => binding.record_id));
    for (const binding of onsetEventBindings) {
      const event = bindingRecord(binding, recordsById, path);
      if (
        event.record_kind !== "event" ||
        !row.phase_record_ids.includes(event.record_id) ||
        text(event.payload.date_normalized) !== row.resolved_onset.date ||
        text(event.payload.date_precision) !== row.resolved_onset.precision
      ) {
        throw new Error(`${path} onset evidence must bind a canonical occurrence phase at the resolved precision`);
      }
    }
    const phaseRecordIdSet = new Set(row.phase_record_ids);
    const observedPhaseRelations = observedRelations.filter((relation) => {
      const subjectId = relationEndpoint(relation, "subject_id");
      const objectId = relationEndpoint(relation, "object_id");
      return Boolean(subjectId && objectId && phaseRecordIdSet.has(subjectId) && phaseRecordIdSet.has(objectId));
    });
    if (!sameRecordIds(observedPhaseRelations.map((relation) => relation.record_id), row.phase_relation_record_ids)) {
      throw new Error(`${path} phase relation ids must exactly match event-to-event observation relations`);
    }
    const phaseEndpoints = observedPhaseRelations.map((relation) =>
      assertAllowedPhaseRelation({
        relation,
        phaseRecordIds: phaseRecordIdSet,
        recordsById,
        path: `${path} phase relation ${relation.record_id}`,
      }));
    assertConnectedPhaseGraph(row.phase_record_ids, phaseEndpoints, path);
    assertExactProjectedRelationEvidence({
      relations: observedPhaseRelations,
      bindings: row.phase_relation_evidence_bindings,
      role: "phase_relation",
      recordsById,
      path,
    });
    if (!sameBindings(
      row.evidence_bindings.filter((binding) => binding.role === "phase_relation"),
      row.phase_relation_evidence_bindings,
    )) {
      throw new Error(`${path} top-level phase relation evidence must exactly match the phase evidence ledger`);
    }

    const treatmentRecordIds = row.treatment.kind === "atomic"
      ? [row.treatment.member.treatment_record_id]
      : row.treatment.members.map((member) => member.treatment_record_id);
    const treatmentRecordIdSet = new Set(treatmentRecordIds);
    const observedPhysicalScopes = observedRelations.flatMap((relation) => {
      const endpoints = directPhysicalScopeEndpoints({
        relation,
        treatmentRecordIds: treatmentRecordIdSet,
        recordsById,
        path: `${path} physical-scope candidate ${relation.record_id}`,
      });
      return endpoints ? [{ relation, endpoints }] : [];
    });
    if (!sameRecordIds(
      observedPhysicalScopes.map(({ relation }) => relation.record_id),
      row.physical_scope_relation_record_ids,
    )) {
      throw new Error(`${path} physical-scope relation ids must exactly match reviewed direct treatment scope`);
    }
    const projectedScopeIds = uniqueSorted(observedPhysicalScopes.map(({ endpoints }) => endpoints.scopeRecordId));
    if (!sameRecordIds(projectedScopeIds, row.physical_scope_record_ids)) {
      throw new Error(`${path} physical-scope ids must exactly match canonical direct-scope relation endpoints`);
    }
    for (const scopeRecordId of row.physical_scope_record_ids) {
      const scope = recordsById.get(scopeRecordId);
      if (!scope || scope.record_kind !== "corridor") {
        throw new Error(`${path} physical scope ${scopeRecordId} must resolve to a canonical corridor/segment record`);
      }
      if (scope.truth_status !== "source_stated" || scope.review_state === "quarantined") {
        throw new Error(`${path} physical scope ${scopeRecordId} must be source_stated and non-quarantined`);
      }
      if (scope.evidence_refs.length === 0 || scope.evidence_refs.some((ref) => !ref.evidence_id)) {
        throw new Error(`${path} physical scope ${scopeRecordId} must retain exact canonical evidence IDs`);
      }
    }
    for (const relationRecordId of row.physical_scope_relation_record_ids) {
      if (!row.observations.some((observation) =>
        onsetEventIds.includes(observation.event_record_id) && observation.relation_record_ids.includes(relationRecordId))) {
        throw new Error(`${path} physical scope relation ${relationRecordId} must be reviewed on an onset phase observation`);
      }
    }
    assertExactProjectedRelationEvidence({
      relations: observedPhysicalScopes.map(({ relation }) => relation),
      bindings: row.physical_scope_evidence_bindings,
      role: "physical_scope",
      recordsById,
      path,
    });
    if (!sameBindings(
      row.evidence_bindings.filter((binding) => binding.role === "physical_scope"),
      row.physical_scope_evidence_bindings,
    )) {
      throw new Error(`${path} top-level physical-scope evidence must exactly match the physical-scope ledger`);
    }
  }
  return [...rows];
}

/** Shape-only unless canonical records are supplied; shape acceptance is not canonical validation. */
export function parseOperationalOccurrencesJsonl(
  value: string,
  canonicalRecords?: readonly MtaCanonicalRecord[],
): OperationalOccurrenceRow[] {
  const rows = value
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(`operational occurrences line ${index + 1}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      return parseOperationalOccurrence(parsed, `operational occurrences line ${index + 1}`);
    });
  return canonicalRecords ? assertOperationalOccurrenceCanonicalIntegrity(rows, canonicalRecords) : rows;
}

export function parseOperationalOccurrenceSummary(value: unknown): OperationalOccurrenceSummary {
  let object = contractObject(value, "operational occurrence summary");
  if (object.schema_version === 1) object = { ...object, schema_version: OPERATIONAL_OCCURRENCE_SCHEMA_VERSION };
  contractKeys(object, summaryFields, "operational occurrence summary");
  if (object.schema_version !== OPERATIONAL_OCCURRENCE_SCHEMA_VERSION) {
    throw new Error(`operational occurrence summary.schema_version must be ${OPERATIONAL_OCCURRENCE_SCHEMA_VERSION}`);
  }
  const countsObject = contractObject(object.counts_by_exclusion_reason, "operational occurrence summary.counts_by_exclusion_reason");
  const counts: Record<string, number> = {};
  for (const [reason, count] of Object.entries(countsObject)) {
    if (reason !== "unsupported_bundle_analysis_family") {
      throw new Error(`operational occurrence summary.counts_by_exclusion_reason has unsupported key ${reason}`);
    }
    counts[reason] = contractInteger(count, `operational occurrence summary.counts_by_exclusion_reason.${reason}`);
  }
  return {
    schema_version: OPERATIONAL_OCCURRENCE_SCHEMA_VERSION,
    occurrence_count: contractInteger(object.occurrence_count, "operational occurrence summary.occurrence_count"),
    study_projection_eligible_count: contractInteger(
      object.study_projection_eligible_count,
      "operational occurrence summary.study_projection_eligible_count",
    ),
    atomic_count: contractInteger(object.atomic_count, "operational occurrence summary.atomic_count"),
    bundle_count: contractInteger(object.bundle_count, "operational occurrence summary.bundle_count"),
    multi_route_count: contractInteger(object.multi_route_count, "operational occurrence summary.multi_route_count"),
    candidate_projection_count: contractInteger(
      object.candidate_projection_count,
      "operational occurrence summary.candidate_projection_count",
    ),
    counts_by_exclusion_reason: counts,
  };
}
