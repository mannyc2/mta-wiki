import { stableHash } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

export const STUDY_READINESS_SCHEMA_VERSION = 1 as const;
export const MEMBER_EXTENT_CONTRACT_ID =
  "operational-occurrence-member-extent-v1" as const;

export const MEMBER_EXTENT_KINDS = [
  "route_wide",
  "bounded_segment",
  "stop_set",
  "mixed",
  "unresolved",
] as const;

export type MemberExtentKind = typeof MEMBER_EXTENT_KINDS[number];

export const MEMBER_EXTENT_MISSING_ROLES = [
  "reviewed_extent_decision",
  "affirmative_extent",
  "route_member_binding",
  "bounded_scope_identity",
  "bounded_scope_relation",
  "stop_identity",
  "scope_evidence",
  "scope_modality",
] as const;

export type MemberExtentMissingRole = typeof MEMBER_EXTENT_MISSING_ROLES[number];

export type ExactEvidenceBinding = {
  role: string;
  record_id: string;
  source_id: string;
  evidence_id: string;
};

export type MemberExtentComponent = {
  component_kind: "route" | "corridor" | "segment" | "stop";
  identity_namespace: "canonical_record" | "source_literal_v1";
  identifiers: string[];
  description: string;
};

export type MemberExtentDecision = {
  decision_id: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  resolution: MemberExtentKind;
  components: MemberExtentComponent[];
  evidence_bindings: ExactEvidenceBinding[];
  missing_roles: MemberExtentMissingRole[];
  rationale: string;
  reviewed_at: string;
  reviewed_by: string;
};

export type MemberExtentRow = {
  schema_version: typeof STUDY_READINESS_SCHEMA_VERSION;
  contract_id: typeof MEMBER_EXTENT_CONTRACT_ID;
  extent_id: string;
  occurrence_id: string;
  occurrence_review_decision_id: string;
  route_record_id: string;
  gtfs_route_id: string;
  treatment_record_id: string;
  treatment_family: string;
  extent: MemberExtentKind;
  components: MemberExtentComponent[];
  evidence_bindings: ExactEvidenceBinding[];
  missing_roles: MemberExtentMissingRole[];
  decision_id: string | null;
  rationale: string;
  authorizes_study: false;
  authorizes_cross_product: false;
};

export type DownstreamDisposition =
  | "approved_rc26"
  | "source_fixable_bus_lane_occurrence_identity"
  | "source_fixable_member_treatment_extent"
  | "tracker_owned_spine_or_pattern"
  | "tracker_owned_outcome_calendar"
  | "quarantined_later_ace_phase";

function assertSortedUnique(values: readonly string[], label: string): void {
  const sorted = [...values].sort();
  if (values.some((value, index) => value !== sorted[index])) {
    throw new Error(`${label}: values must be sorted`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${label}: values must be unique`);
  }
}

function assertNonemptyStrings(values: readonly string[], label: string): void {
  if (values.length === 0 || values.some((value) => !value.trim())) {
    throw new Error(`${label}: expected nonempty strings`);
  }
}

export function extentDecisionKey(value: {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
}): string {
  return `${value.occurrence_id}\u0000${value.route_record_id}\u0000${value.treatment_record_id}`;
}

export function validateMemberExtentDecision(decision: MemberExtentDecision): void {
  assertSortedUnique(decision.missing_roles, `${decision.decision_id}.missing_roles`);
  const evidenceKeys = decision.evidence_bindings.map((binding) =>
    `${binding.role}\u0000${binding.record_id}\u0000${binding.source_id}\u0000${binding.evidence_id}`);
  assertSortedUnique(evidenceKeys, `${decision.decision_id}.evidence_bindings`);
  for (const binding of decision.evidence_bindings) {
    assertNonemptyStrings(
      [binding.role, binding.record_id, binding.source_id, binding.evidence_id],
      `${decision.decision_id}.evidence_binding`,
    );
  }
  for (const component of decision.components) {
    assertSortedUnique(component.identifiers, `${decision.decision_id}.component.identifiers`);
    assertNonemptyStrings(component.identifiers, `${decision.decision_id}.component.identifiers`);
    if (!component.description.trim()) {
      throw new Error(`${decision.decision_id}: component description is required`);
    }
  }

  if (decision.resolution === "unresolved") {
    if (decision.components.length !== 0 || decision.missing_roles.length === 0) {
      throw new Error(`${decision.decision_id}: unresolved decisions require no positive components and at least one missing role`);
    }
    return;
  }
  if (decision.missing_roles.length !== 0 || decision.components.length === 0) {
    throw new Error(`${decision.decision_id}: positive decisions require components and no missing roles`);
  }
  if (decision.evidence_bindings.length === 0) {
    throw new Error(`${decision.decision_id}: positive decisions require exact evidence`);
  }
  const componentKinds = new Set(decision.components.map((component) => component.component_kind));
  if (decision.resolution === "route_wide" &&
      (decision.components.length !== 1 || !componentKinds.has("route"))) {
    throw new Error(`${decision.decision_id}: route_wide requires one route component`);
  }
  if (decision.resolution === "bounded_segment" &&
      !["corridor", "segment"].some((kind) => componentKinds.has(kind as "corridor" | "segment"))) {
    throw new Error(`${decision.decision_id}: bounded_segment requires corridor or segment identity`);
  }
  if (decision.resolution === "stop_set" && !componentKinds.has("stop")) {
    throw new Error(`${decision.decision_id}: stop_set requires stop identities`);
  }
  if (decision.resolution === "mixed" && componentKinds.size < 2) {
    throw new Error(`${decision.decision_id}: mixed requires at least two distinct positive component kinds`);
  }
}

export function projectMemberExtent(input: {
  occurrence_id: string;
  occurrence_review_decision_id: string;
  route_record_id: string;
  gtfs_route_id: string;
  treatment_record_id: string;
  treatment_family: string;
  decision?: MemberExtentDecision | undefined;
}): MemberExtentRow {
  const decision = input.decision;
  if (decision) {
    validateMemberExtentDecision(decision);
    if (extentDecisionKey(decision) !== extentDecisionKey(input)) {
      throw new Error(`${decision.decision_id}: decision key does not match projection key`);
    }
  }
  const identity = {
    occurrence_id: input.occurrence_id,
    route_record_id: input.route_record_id,
    treatment_record_id: input.treatment_record_id,
  };
  return {
    schema_version: STUDY_READINESS_SCHEMA_VERSION,
    contract_id: MEMBER_EXTENT_CONTRACT_ID,
    extent_id: `member-extent:${stableHash(identity as unknown as JsonValue).slice(0, 24)}`,
    occurrence_id: input.occurrence_id,
    occurrence_review_decision_id: input.occurrence_review_decision_id,
    route_record_id: input.route_record_id,
    gtfs_route_id: input.gtfs_route_id,
    treatment_record_id: input.treatment_record_id,
    treatment_family: input.treatment_family,
    extent: decision?.resolution ?? "unresolved",
    components: decision?.components ?? [],
    evidence_bindings: decision?.evidence_bindings ?? [],
    missing_roles: decision?.missing_roles ?? ["reviewed_extent_decision"],
    decision_id: decision?.decision_id ?? null,
    rationale: decision?.rationale ??
      "No versioned member-level extent decision exists. Route membership and treatment physicality do not prove extent.",
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

export function classifyDownstreamDisposition(input: {
  candidate_id?: string;
  treatment_family: string;
  decision: string;
  decision_rationale: string;
}): DownstreamDisposition {
  if (input.decision === "approved") return "approved_rc26";
  if (input.candidate_id === "study-event-v2:6b70c52e0eec23eb63cab94f") {
    return "tracker_owned_spine_or_pattern";
  }
  if (input.treatment_family === "bus_lane") {
    return "source_fixable_bus_lane_occurrence_identity";
  }
  if (input.decision_rationale.includes("route_wide_evidence_missing")) {
    return "source_fixable_member_treatment_extent";
  }
  if (input.decision_rationale.includes("makes this a later phase")) {
    return "quarantined_later_ace_phase";
  }
  if (input.decision_rationale.includes("pinned spine is")) {
    return "tracker_owned_spine_or_pattern";
  }
  if (input.decision_rationale.includes("calendar window is") ||
      input.decision_rationale.includes("calendar supplies")) {
    return "tracker_owned_outcome_calendar";
  }
  throw new Error(`Unclassified downstream decision: ${input.decision_rationale}`);
}

export function explicitBridgeMissingRoles(input: {
  hasOccurrence: boolean;
  hasRouteScope: boolean;
  hasOnset: boolean;
  hasPhase: boolean;
  memberExtents: readonly Pick<MemberExtentRow, "extent" | "missing_roles">[];
}): string[] {
  const missing = new Set<string>();
  if (!input.hasOccurrence) missing.add("occurrence_identity");
  if (!input.hasRouteScope) missing.add("exact_route_scope");
  if (!input.hasOnset) missing.add("delivered_onset");
  if (!input.hasPhase) missing.add("phase_role");
  if (input.memberExtents.length === 0 ||
      input.memberExtents.some((extent) => extent.extent === "unresolved")) {
    missing.add("member_treatment_extent");
  }
  for (const row of input.memberExtents) {
    for (const role of row.missing_roles) missing.add(`extent:${role}`);
  }
  return [...missing].sort();
}
