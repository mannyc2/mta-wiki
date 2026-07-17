import { sha256, stableHash, stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord, MtaEvidenceRef } from "@mta-wiki/db/types";

export const OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION = 1 as const;
export const OCCURRENCE_TREATMENT_PHYSICALITY_CONTRACT_ID =
  "occurrence-treatment-physicality-v1" as const;
export const OCCURRENCE_TREATMENT_PHYSICALITY_LEDGER_ID =
  "occurrence-treatment-physicality-review-v1" as const;

export type OccurrenceTreatmentPhysicalityClassification =
  | "physical_corridor_or_segment_intervention"
  | "nonphysical_service_operations_policy_control"
  | "point_or_stop_physical_intervention"
  | "review_required";

export type OccurrenceTreatmentPhysicalityScopeRequirement =
  | "corridor_or_segment_required"
  | "not_applicable"
  | "point_or_stop_required"
  | "review_required";

export type OccurrenceTreatmentPhysicalityPolicyRule = {
  rule_id: string;
  treatment_family: string;
  treatment_kind: string;
  classification: Exclude<OccurrenceTreatmentPhysicalityClassification, "review_required">;
  scope_requirement: Exclude<OccurrenceTreatmentPhysicalityScopeRequirement, "review_required">;
  reason: string;
  reason_codes: string[];
};

export type OccurrenceTreatmentPhysicalityPolicy = {
  schema_version: typeof OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION;
  contract_id: typeof OCCURRENCE_TREATMENT_PHYSICALITY_CONTRACT_ID;
  policy_id: "occurrence-treatment-physicality-policy-v1";
  reviewed_at: string;
  reviewed_by: string;
  statement: string;
  categories: Record<OccurrenceTreatmentPhysicalityClassification, {
    scope_requirement: OccurrenceTreatmentPhysicalityScopeRequirement;
    definition: string;
  }>;
  unknown_treatment_record_policy: "review_required";
  unknown_family_kind_policy: "review_required";
  missing_evidence_policy: "review_required";
  conflicting_membership_policy: "review_required";
  rules: OccurrenceTreatmentPhysicalityPolicyRule[];
};

export type OccurrenceTreatmentMemberInput = {
  treatment_record_id?: string | undefined;
  treatment_family?: string | undefined;
  evidence_bindings?: readonly {
    role?: string | undefined;
    record_id?: string | undefined;
    source_id?: string | undefined;
    evidence_id?: string | undefined;
  }[] | undefined;
};

export type OccurrenceTreatmentPhysicalityInput = {
  occurrence_id?: string | undefined;
  study_projection_eligible?: boolean | undefined;
  treatment?: {
    kind?: "atomic" | "bundle" | string | undefined;
    member?: OccurrenceTreatmentMemberInput | undefined;
    members?: readonly OccurrenceTreatmentMemberInput[] | undefined;
  } | undefined;
  physical_scope_record_ids?: readonly string[] | undefined;
  physical_scope_relation_record_ids?: readonly string[] | undefined;
  physical_scope_evidence_bindings?: readonly {
    role?: string | undefined;
    record_id?: string | undefined;
    source_id?: string | undefined;
    evidence_id?: string | undefined;
  }[] | undefined;
};

export type OccurrenceTreatmentPhysicalityDecision = {
  schema_version: typeof OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION;
  ledger_id: typeof OCCURRENCE_TREATMENT_PHYSICALITY_LEDGER_ID;
  decision_id: string;
  policy_rule_id: string | null;
  treatment_record_id: string;
  treatment_family: string | null;
  treatment_kind: string | null;
  classification: OccurrenceTreatmentPhysicalityClassification;
  scope_requirement: OccurrenceTreatmentPhysicalityScopeRequirement;
  reviewed_at: string;
  reviewed_by: string;
  reason: string;
  reason_codes: string[];
  occurrence_ids: string[];
  occurrence_ids_sha256: string;
  source_ids: string[];
  evidence_ids: string[];
  evidence_refs: MtaEvidenceRef[];
  treatment_evidence_sha256: string;
  treatment_semantic_sha256: string;
};

export type OccurrenceTreatmentPhysicalityFindingCode =
  | "OTPHY_OCCURRENCE_ID_MISSING"
  | "OTPHY_TREATMENT_ID_MISSING"
  | "OTPHY_TREATMENT_MEMBERSHIP_CONFLICT"
  | "OTPHY_TREATMENT_RECORD_MISSING"
  | "OTPHY_TREATMENT_RECORD_DUPLICATE"
  | "OTPHY_TREATMENT_FAMILY_MISMATCH"
  | "OTPHY_TREATMENT_KIND_UNREVIEWED"
  | "OTPHY_TREATMENT_EVIDENCE_MISSING"
  | "OTPHY_TREATMENT_REVIEW_MISSING"
  | "OTPHY_TREATMENT_REVIEW_DUPLICATE"
  | "OTPHY_TREATMENT_REVIEW_STALE"
  | "OTPHY_TREATMENT_EVIDENCE_DRIFT"
  | "OTPHY_TREATMENT_CLASSIFICATION_CONFLICT"
  | "OTPHY_OCCURRENCE_MEMBERSHIP_DRIFT"
  | "OTPHY_PHYSICAL_SCOPE_MISSING"
  | "OTPHY_PHYSICAL_SCOPE_RELATION_MISSING"
  | "OTPHY_PHYSICAL_SCOPE_EVIDENCE_MISSING"
  | "OTPHY_PHYSICAL_SCOPE_RELATION_INVALID"
  | "OTPHY_POINT_SCOPE_CONTRACT_REQUIRED";

export type OccurrenceTreatmentPhysicalityFinding = {
  schema_version: typeof OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION;
  code: OccurrenceTreatmentPhysicalityFindingCode;
  primary_disposition: string;
  treatment_record_id: string | null;
  occurrence_id: string | null;
  reason: string;
  related_record_ids: string[];
};

export type OccurrenceTreatmentPhysicalityTreatmentAuditRow = {
  schema_version: typeof OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION;
  treatment_record_id: string;
  treatment_family: string | null;
  treatment_kind: string | null;
  occurrence_ids: string[];
  classification: OccurrenceTreatmentPhysicalityClassification;
  scope_requirement: OccurrenceTreatmentPhysicalityScopeRequirement;
  primary_disposition:
    | "reviewed_physical_corridor_or_segment"
    | "reviewed_nonphysical"
    | "reviewed_point_or_stop_physical"
    | "review_required";
  warning_codes: OccurrenceTreatmentPhysicalityFindingCode[];
  decision_id: string | null;
  evidence_ids: string[];
};

export type OccurrenceTreatmentPhysicalityOccurrenceAuditRow = {
  schema_version: typeof OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION;
  occurrence_id: string;
  treatment_record_ids: string[];
  physical_treatment_record_ids: string[];
  nonphysical_treatment_record_ids: string[];
  point_or_stop_treatment_record_ids: string[];
  review_required_treatment_record_ids: string[];
  physical_scope_record_ids: string[];
  physical_scope_relation_record_ids: string[];
  primary_disposition:
    | "physical_scope_satisfied"
    | "physical_scope_missing"
    | "physical_scope_relation_missing"
    | "physical_scope_evidence_missing"
    | "physical_scope_relation_invalid"
    | "physicality_review_required"
    | "physical_scope_not_applicable";
  warning_codes: OccurrenceTreatmentPhysicalityFindingCode[];
  reasons: string[];
};

export type OccurrenceTreatmentPhysicalityReviewBuild = {
  decisions: OccurrenceTreatmentPhysicalityDecision[];
  findings: OccurrenceTreatmentPhysicalityFinding[];
};

export type OccurrenceTreatmentPhysicalityAudit = {
  treatmentRows: OccurrenceTreatmentPhysicalityTreatmentAuditRow[];
  occurrenceRows: OccurrenceTreatmentPhysicalityOccurrenceAuditRow[];
  findings: OccurrenceTreatmentPhysicalityFinding[];
  summary: {
    schema_version: typeof OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION;
    eligible_occurrence_count: number;
    unique_treatment_count: number;
    treatment_membership_count: number;
    classification_counts: Record<OccurrenceTreatmentPhysicalityClassification, number>;
    scope_requirement_counts: Record<OccurrenceTreatmentPhysicalityScopeRequirement, number>;
    occurrence_disposition_counts: Record<OccurrenceTreatmentPhysicalityOccurrenceAuditRow["primary_disposition"], number>;
    finding_counts: Partial<Record<OccurrenceTreatmentPhysicalityFindingCode, number>>;
    review_ledger_complete: boolean;
    physical_scope_complete: boolean;
    hard_mode_ready: boolean;
  };
};

type Membership = {
  treatment_record_id: string;
  treatment_families: Set<string>;
  occurrence_ids: Set<string>;
};

const REVIEWED_AT = "2026-07-16T04:00:00.000Z";
const REVIEWED_BY = "codex-occurrence-treatment-physicality-review";

const NONPHYSICAL =
  "nonphysical_service_operations_policy_control" as const;
const PHYSICAL =
  "physical_corridor_or_segment_intervention" as const;

function rule(
  ruleId: string,
  treatmentFamily: string,
  treatmentKind: string,
  classification: typeof NONPHYSICAL | typeof PHYSICAL,
  reason: string,
  reasonCodes: string[],
): OccurrenceTreatmentPhysicalityPolicyRule {
  return {
    rule_id: ruleId,
    treatment_family: treatmentFamily,
    treatment_kind: treatmentKind,
    classification,
    scope_requirement:
      classification === PHYSICAL ? "corridor_or_segment_required" : "not_applicable",
    reason,
    reason_codes: [...reasonCodes].sort(),
  };
}

const automationReason =
  "The exact treatment evidence describes camera-enforcement activation or deployment, not construction of a physical corridor or segment.";
const serviceReason =
  "The exact treatment evidence describes a service pattern, routing, frequency, span, or trip policy change, not physical construction.";
const stopPatternReason =
  "The exact eligible treatment kind is a limited-stop, stop-change, or stop-removal service pattern; it does not assert construction of a stop or boarding facility.";
const fareReason =
  "The exact treatment evidence describes fare collection or payment policy/operations, not physical corridor construction.";

export const OCCURRENCE_TREATMENT_PHYSICALITY_RULES_V1:
  readonly OccurrenceTreatmentPhysicalityPolicyRule[] = [
    rule(
      "otphy-v1:automated-camera-warning-phase",
      "automated_bus_lane_enforcement",
      "Automated Camera Enforcement (ACE) 60-day warning-phase activation",
      NONPHYSICAL,
      automationReason,
      ["camera_enforcement_control", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:automated-camera-activation",
      "automated_bus_lane_enforcement",
      "Automated Camera Enforcement (ACE) activation",
      NONPHYSICAL,
      automationReason,
      ["camera_enforcement_control", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:automated-camera-route-deployment",
      "automated_bus_lane_enforcement",
      "Automated Camera Enforcement (ACE) route deployment",
      NONPHYSICAL,
      automationReason,
      ["camera_enforcement_control", "route_deployment_not_corridor_construction"],
    ),
    rule(
      "otphy-v1:automated-camera-route-implementation",
      "automated_bus_lane_enforcement",
      "Automated Camera Enforcement (ACE) route implementation",
      NONPHYSICAL,
      automationReason,
      ["camera_enforcement_control", "route_implementation_not_corridor_construction"],
    ),
    rule(
      "otphy-v1:center-running-bus-lanes",
      "bus_lane",
      "center-running bus lanes",
      PHYSICAL,
      "The exact treatment evidence states a bounded center-running bus-lane installation between official street endpoints.",
      ["bounded_official_endpoints", "physical_lane_installation"],
    ),
    rule(
      "otphy-v1:limited-stops",
      "bus_stop_or_boarding",
      "limited stops",
      NONPHYSICAL,
      stopPatternReason,
      ["service_stop_pattern", "no_stop_construction_claim"],
    ),
    rule(
      "otphy-v1:stop-change",
      "bus_stop_or_boarding",
      "stop change",
      NONPHYSICAL,
      stopPatternReason,
      ["service_stop_pattern", "no_stop_construction_claim"],
    ),
    rule(
      "otphy-v1:stop-removal",
      "bus_stop_or_boarding",
      "stop removal",
      NONPHYSICAL,
      stopPatternReason,
      ["service_stop_pattern", "no_stop_construction_claim"],
    ),
    rule(
      "otphy-v1:omny-only-fare-payment",
      "fare_collection",
      "OMNY-only fare payment",
      NONPHYSICAL,
      fareReason,
      ["fare_policy_or_operations", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:fare-collection-resumption",
      "fare_collection",
      "fare collection resumption",
      NONPHYSICAL,
      fareReason,
      ["fare_policy_or_operations", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:fare-free",
      "fare_collection",
      "fare_free",
      NONPHYSICAL,
      fareReason,
      ["fare_policy_or_operations", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:off-board-fare-collection",
      "fare_collection",
      "off-board fare collection",
      NONPHYSICAL,
      fareReason,
      ["fare_policy_or_operations", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:route-rerouting-and-extension",
      "route_redesign",
      "route rerouting and extension",
      NONPHYSICAL,
      serviceReason,
      ["route_redesign_service_change", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:route-improvement-service-management",
      "service_pattern",
      "Route Improvement Initiative service-management program",
      NONPHYSICAL,
      serviceReason,
      ["service_management_program", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:limited-stop-discontinuation",
      "service_pattern",
      "limited stop discontinuation",
      NONPHYSICAL,
      serviceReason,
      ["service_pattern_change", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:route-change",
      "service_pattern",
      "route change",
      NONPHYSICAL,
      serviceReason,
      ["route_service_change", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:route-rerouting",
      "service_pattern",
      "route rerouting",
      NONPHYSICAL,
      serviceReason,
      ["route_service_change", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:route-segment-discontinuation-and-replacement",
      "service_pattern",
      "route segment discontinuation and replacement",
      NONPHYSICAL,
      serviceReason,
      ["route_service_change", "segment_literal_not_physical_scope"],
    ),
    rule(
      "otphy-v1:route-shortening",
      "service_pattern",
      "route shortening",
      NONPHYSICAL,
      serviceReason,
      ["route_service_change", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:service-expansion",
      "service_pattern",
      "service expansion",
      NONPHYSICAL,
      serviceReason,
      ["service_pattern_change", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:service-frequency-adjustment",
      "service_pattern",
      "service frequency adjustment",
      NONPHYSICAL,
      serviceReason,
      ["service_frequency_change", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:service-frequency-and-span-adjustment",
      "service_pattern",
      "service frequency and span adjustment",
      NONPHYSICAL,
      serviceReason,
      ["service_frequency_or_span_change", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:service-pattern-change",
      "service_pattern",
      "service pattern change",
      NONPHYSICAL,
      serviceReason,
      ["service_pattern_change", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:weekday-express-trip-additions",
      "service_pattern",
      "weekday express-bus trip additions",
      NONPHYSICAL,
      serviceReason,
      ["trip_level_service_change", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:weekday-express-trip-discontinuation",
      "service_pattern",
      "weekday express-bus trip discontinuation",
      NONPHYSICAL,
      serviceReason,
      ["trip_level_service_change", "no_physical_construction_claim"],
    ),
    rule(
      "otphy-v1:weekday-trip-additions",
      "service_pattern",
      "weekday trip additions",
      NONPHYSICAL,
      serviceReason,
      ["trip_level_service_change", "no_physical_construction_claim"],
    ),
  ] as const;

export const OCCURRENCE_TREATMENT_PHYSICALITY_POLICY_V1:
  OccurrenceTreatmentPhysicalityPolicy = {
    schema_version: OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION,
    contract_id: OCCURRENCE_TREATMENT_PHYSICALITY_CONTRACT_ID,
    policy_id: "occurrence-treatment-physicality-policy-v1",
    reviewed_at: REVIEWED_AT,
    reviewed_by: REVIEWED_BY,
    statement:
      "Classification is exact-family-and-kind reviewed policy, never inference from a family name, location literal, proximity, or street-name similarity. A decision does not independently create study eligibility.",
    categories: {
      physical_corridor_or_segment_intervention: {
        scope_requirement: "corridor_or_segment_required",
        definition:
          "A physical intervention whose exact delivered treatment must bind to a canonical bounded corridor or segment through exact authoritative evidence.",
      },
      nonphysical_service_operations_policy_control: {
        scope_requirement: "not_applicable",
        definition:
          "A service, routing, frequency, fare, enforcement, operations, policy, or control change that does not claim construction of a physical treatment.",
      },
      point_or_stop_physical_intervention: {
        scope_requirement: "point_or_stop_required",
        definition:
          "A constructed point or stop facility. Version 1 has no eligible reviewed member in this category; a future member requires an explicit point/stop scope contract.",
      },
      review_required: {
        scope_requirement: "review_required",
        definition:
          "An unseen, evidence-invalid, conflicting, or otherwise unreviewed treatment that fails closed.",
      },
    },
    unknown_treatment_record_policy: "review_required",
    unknown_family_kind_policy: "review_required",
    missing_evidence_policy: "review_required",
    conflicting_membership_policy: "review_required",
    rules: [...OCCURRENCE_TREATMENT_PHYSICALITY_RULES_V1],
  };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function recordEvidenceRefs(record: MtaCanonicalRecord): MtaEvidenceRef[] {
  return [...record.evidence_refs].sort((left, right) =>
    stableJson(left as unknown as JsonValue).localeCompare(stableJson(right as unknown as JsonValue)),
  );
}

function exactEvidence(ref: MtaEvidenceRef): boolean {
  return Boolean(
    text(ref.source_id) &&
    text(ref.evidence_id) &&
    text(ref.block_id) &&
    text(ref.text_sha256),
  );
}

function evidenceHash(refs: readonly MtaEvidenceRef[]): string {
  return stableHash(refs as unknown as JsonValue);
}

function treatmentSemanticHash(record: MtaCanonicalRecord, refs: readonly MtaEvidenceRef[]): string {
  return stableHash({
    record_id: record.record_id,
    record_kind: record.record_kind,
    display_name: record.display_name,
    source_id: record.source_id,
    source_ids: uniqueSorted(record.source_ids ?? [record.source_id]),
    treatment_family: text(record.payload.treatment_family),
    treatment_kind: text(record.payload.treatment_kind),
    evidence_refs: refs,
  } as unknown as JsonValue);
}

function policyKey(family: string, kind: string): string {
  return `${family}\0${kind}`;
}

function policyRulesByKey(
  policy: OccurrenceTreatmentPhysicalityPolicy,
): Map<string, OccurrenceTreatmentPhysicalityPolicyRule> {
  const result = new Map<string, OccurrenceTreatmentPhysicalityPolicyRule>();
  const ids = new Set<string>();
  for (const ruleEntry of policy.rules) {
    const key = policyKey(ruleEntry.treatment_family, ruleEntry.treatment_kind);
    if (result.has(key)) throw new Error(`Duplicate occurrence treatment physicality policy key: ${key}`);
    if (ids.has(ruleEntry.rule_id)) {
      throw new Error(`Duplicate occurrence treatment physicality policy rule id: ${ruleEntry.rule_id}`);
    }
    if (
      ruleEntry.classification === "physical_corridor_or_segment_intervention" &&
      ruleEntry.scope_requirement !== "corridor_or_segment_required"
    ) {
      throw new Error(`Physical corridor rule ${ruleEntry.rule_id} does not require corridor scope`);
    }
    if (
      ruleEntry.classification === "nonphysical_service_operations_policy_control" &&
      ruleEntry.scope_requirement !== "not_applicable"
    ) {
      throw new Error(`Nonphysical rule ${ruleEntry.rule_id} must make physical scope not applicable`);
    }
    result.set(key, ruleEntry);
    ids.add(ruleEntry.rule_id);
  }
  return result;
}

function treatmentMembers(
  occurrence: OccurrenceTreatmentPhysicalityInput,
): readonly OccurrenceTreatmentMemberInput[] {
  if (occurrence.treatment?.kind === "atomic") {
    return occurrence.treatment.member ? [occurrence.treatment.member] : [];
  }
  return occurrence.treatment?.members ?? [];
}

function eligibleOccurrences(
  occurrences: readonly OccurrenceTreatmentPhysicalityInput[],
): OccurrenceTreatmentPhysicalityInput[] {
  return occurrences
    .filter((occurrence) => occurrence.study_projection_eligible === true)
    .sort((left, right) => (text(left.occurrence_id) ?? "").localeCompare(text(right.occurrence_id) ?? ""));
}

function memberships(
  occurrences: readonly OccurrenceTreatmentPhysicalityInput[],
): {
  byTreatment: Map<string, Membership>;
  findings: OccurrenceTreatmentPhysicalityFinding[];
  membershipCount: number;
} {
  const byTreatment = new Map<string, Membership>();
  const findings: OccurrenceTreatmentPhysicalityFinding[] = [];
  let membershipCount = 0;

  for (const occurrence of eligibleOccurrences(occurrences)) {
    const occurrenceId = text(occurrence.occurrence_id);
    if (!occurrenceId) {
      findings.push(finding(
        "OTPHY_OCCURRENCE_ID_MISSING",
        "occurrence_identity_missing",
        null,
        null,
        "An eligible occurrence has no immutable occurrence id.",
        [],
      ));
    }
    for (const member of treatmentMembers(occurrence)) {
      membershipCount += 1;
      const treatmentId = text(member.treatment_record_id);
      if (!treatmentId) {
        findings.push(finding(
          "OTPHY_TREATMENT_ID_MISSING",
          "treatment_identity_missing",
          null,
          occurrenceId,
          "An eligible occurrence treatment member has no canonical treatment record id.",
          occurrenceId ? [occurrenceId] : [],
        ));
        continue;
      }
      const group = byTreatment.get(treatmentId) ?? {
        treatment_record_id: treatmentId,
        treatment_families: new Set<string>(),
        occurrence_ids: new Set<string>(),
      };
      const family = text(member.treatment_family);
      if (family) group.treatment_families.add(family);
      if (occurrenceId) group.occurrence_ids.add(occurrenceId);
      byTreatment.set(treatmentId, group);
    }
  }

  for (const group of byTreatment.values()) {
    if (group.treatment_families.size <= 1) continue;
    findings.push(finding(
      "OTPHY_TREATMENT_MEMBERSHIP_CONFLICT",
      "conflicting_occurrence_treatment_family_memberships",
      group.treatment_record_id,
      null,
      `Treatment ${group.treatment_record_id} is claimed under multiple occurrence treatment families: ${
        uniqueSorted(group.treatment_families).join(", ")
      }.`,
      uniqueSorted(group.occurrence_ids),
    ));
  }
  return { byTreatment, findings, membershipCount };
}

function finding(
  code: OccurrenceTreatmentPhysicalityFindingCode,
  primaryDisposition: string,
  treatmentRecordId: string | null,
  occurrenceId: string | null,
  reason: string,
  relatedRecordIds: string[],
): OccurrenceTreatmentPhysicalityFinding {
  return {
    schema_version: OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION,
    code,
    primary_disposition: primaryDisposition,
    treatment_record_id: treatmentRecordId,
    occurrence_id: occurrenceId,
    reason,
    related_record_ids: uniqueSorted(relatedRecordIds),
  };
}

function reviewRequiredDecision(input: {
  treatmentRecordId: string;
  family: string | null;
  kind: string | null;
  occurrences: string[];
  record?: MtaCanonicalRecord | undefined;
  refs?: MtaEvidenceRef[] | undefined;
  reason: string;
  reasonCodes: string[];
}): OccurrenceTreatmentPhysicalityDecision {
  const refs = input.refs ?? [];
  return {
    schema_version: OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION,
    ledger_id: OCCURRENCE_TREATMENT_PHYSICALITY_LEDGER_ID,
    decision_id: `${OCCURRENCE_TREATMENT_PHYSICALITY_LEDGER_ID}:${input.treatmentRecordId}`,
    policy_rule_id: null,
    treatment_record_id: input.treatmentRecordId,
    treatment_family: input.family,
    treatment_kind: input.kind,
    classification: "review_required",
    scope_requirement: "review_required",
    reviewed_at: REVIEWED_AT,
    reviewed_by: REVIEWED_BY,
    reason: input.reason,
    reason_codes: uniqueSorted(input.reasonCodes),
    occurrence_ids: input.occurrences,
    occurrence_ids_sha256: sha256(input.occurrences.join("\n")),
    source_ids: input.record
      ? uniqueSorted(input.record.source_ids ?? [input.record.source_id])
      : [],
    evidence_ids: uniqueSorted(refs.flatMap((ref) => text(ref.evidence_id) ? [ref.evidence_id!] : [])),
    evidence_refs: refs,
    treatment_evidence_sha256: evidenceHash(refs),
    treatment_semantic_sha256: input.record
      ? treatmentSemanticHash(input.record, refs)
      : stableHash({
        treatment_record_id: input.treatmentRecordId,
        missing_record: true,
      } as unknown as JsonValue),
  };
}

export function buildOccurrenceTreatmentPhysicalityReview(input: {
  occurrences: readonly OccurrenceTreatmentPhysicalityInput[];
  treatments: readonly MtaCanonicalRecord[];
  policy?: OccurrenceTreatmentPhysicalityPolicy | undefined;
}): OccurrenceTreatmentPhysicalityReviewBuild {
  const policy = input.policy ?? OCCURRENCE_TREATMENT_PHYSICALITY_POLICY_V1;
  const rules = policyRulesByKey(policy);
  const membership = memberships(input.occurrences);
  const findings = [...membership.findings];
  const treatmentRecords = new Map<string, MtaCanonicalRecord[]>();
  for (const record of input.treatments.filter((value) => value.record_kind === "treatment_component")) {
    const rows = treatmentRecords.get(record.record_id) ?? [];
    rows.push(record);
    treatmentRecords.set(record.record_id, rows);
  }
  const decisions: OccurrenceTreatmentPhysicalityDecision[] = [];

  for (const [treatmentId, group] of [...membership.byTreatment.entries()]
    .sort(([left], [right]) => left.localeCompare(right))) {
    const occurrenceIds = uniqueSorted(group.occurrence_ids);
    const records = treatmentRecords.get(treatmentId) ?? [];
    if (records.length === 0) {
      findings.push(finding(
        "OTPHY_TREATMENT_RECORD_MISSING",
        "canonical_treatment_record_missing",
        treatmentId,
        null,
        `Eligible occurrence treatment ${treatmentId} has no canonical treatment record.`,
        occurrenceIds,
      ));
      decisions.push(reviewRequiredDecision({
        treatmentRecordId: treatmentId,
        family: uniqueSorted(group.treatment_families)[0] ?? null,
        kind: null,
        occurrences: occurrenceIds,
        reason: "Canonical treatment record is missing; classification fails closed.",
        reasonCodes: ["canonical_treatment_record_missing"],
      }));
      continue;
    }
    const record = records[0]!;
    const recordFamily = text(record.payload.treatment_family);
    const recordKind = text(record.payload.treatment_kind);
    const occurrenceFamilies = uniqueSorted(group.treatment_families);
    const refs = recordEvidenceRefs(record);
    const reviewProblems: OccurrenceTreatmentPhysicalityFindingCode[] = [];

    if (records.length > 1) {
      reviewProblems.push("OTPHY_TREATMENT_RECORD_DUPLICATE");
      findings.push(finding(
        "OTPHY_TREATMENT_RECORD_DUPLICATE",
        "duplicate_canonical_treatment_identity",
        treatmentId,
        null,
        `Treatment ${treatmentId} resolves to ${records.length} canonical treatment rows.`,
        occurrenceIds,
      ));
    }
    if (
      occurrenceFamilies.length !== 1 ||
      !recordFamily ||
      occurrenceFamilies[0] !== recordFamily
    ) {
      reviewProblems.push("OTPHY_TREATMENT_FAMILY_MISMATCH");
      findings.push(finding(
        "OTPHY_TREATMENT_FAMILY_MISMATCH",
        "canonical_and_occurrence_treatment_family_mismatch",
        treatmentId,
        null,
        `Treatment ${treatmentId} canonical family ${recordFamily ?? "<missing>"} does not match occurrence membership ${
          occurrenceFamilies.join(", ") || "<missing>"
        }.`,
        occurrenceIds,
      ));
    }
    const matchingRule = recordFamily && recordKind
      ? rules.get(policyKey(recordFamily, recordKind))
      : undefined;
    if (!matchingRule) {
      reviewProblems.push("OTPHY_TREATMENT_KIND_UNREVIEWED");
      findings.push(finding(
        "OTPHY_TREATMENT_KIND_UNREVIEWED",
        "unseen_family_kind_requires_review",
        treatmentId,
        null,
        `Treatment ${treatmentId} has unreviewed exact family/kind ${recordFamily ?? "<missing>"}/${
          recordKind ?? "<missing>"
        }.`,
        occurrenceIds,
      ));
    }
    if (refs.length === 0 || refs.some((ref) => !exactEvidence(ref))) {
      reviewProblems.push("OTPHY_TREATMENT_EVIDENCE_MISSING");
      findings.push(finding(
        "OTPHY_TREATMENT_EVIDENCE_MISSING",
        "exact_treatment_evidence_missing",
        treatmentId,
        null,
        `Treatment ${treatmentId} lacks a complete source/evidence/block/hash binding.`,
        occurrenceIds,
      ));
    }

    if (reviewProblems.length > 0 || !matchingRule) {
      decisions.push(reviewRequiredDecision({
        treatmentRecordId: treatmentId,
        family: recordFamily,
        kind: recordKind,
        occurrences: occurrenceIds,
        record,
        refs,
        reason: "Treatment has an unseen, conflicting, duplicate, or evidence-invalid identity and fails closed.",
        reasonCodes: reviewProblems,
      }));
      continue;
    }

    decisions.push({
      schema_version: OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION,
      ledger_id: OCCURRENCE_TREATMENT_PHYSICALITY_LEDGER_ID,
      decision_id: `${OCCURRENCE_TREATMENT_PHYSICALITY_LEDGER_ID}:${treatmentId}`,
      policy_rule_id: matchingRule.rule_id,
      treatment_record_id: treatmentId,
      treatment_family: recordFamily,
      treatment_kind: recordKind,
      classification: matchingRule.classification,
      scope_requirement: matchingRule.scope_requirement,
      reviewed_at: REVIEWED_AT,
      reviewed_by: REVIEWED_BY,
      reason: matchingRule.reason,
      reason_codes: [...matchingRule.reason_codes],
      occurrence_ids: occurrenceIds,
      occurrence_ids_sha256: sha256(occurrenceIds.join("\n")),
      source_ids: uniqueSorted(record.source_ids ?? [record.source_id]),
      evidence_ids: uniqueSorted(refs.map((ref) => ref.evidence_id!)),
      evidence_refs: refs,
      treatment_evidence_sha256: evidenceHash(refs),
      treatment_semantic_sha256: treatmentSemanticHash(record, refs),
    });
  }

  return {
    decisions: decisions.sort((left, right) =>
      left.treatment_record_id.localeCompare(right.treatment_record_id)),
    findings: findings.sort(findingOrder),
  };
}

function findingOrder(
  left: OccurrenceTreatmentPhysicalityFinding,
  right: OccurrenceTreatmentPhysicalityFinding,
): number {
  return left.code.localeCompare(right.code) ||
    (left.treatment_record_id ?? "").localeCompare(right.treatment_record_id ?? "") ||
    (left.occurrence_id ?? "").localeCompare(right.occurrence_id ?? "");
}

function countBy<T extends string>(values: Iterable<T>, keys: readonly T[]): Record<T, number> {
  const result = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  for (const value of values) result[value] += 1;
  return result;
}

function exactDirectPhysicalScopeRelation(input: {
  relation: MtaCanonicalRecord;
  treatmentId: string;
  scopeIds: ReadonlySet<string>;
  corridorIds: ReadonlySet<string>;
}): boolean {
  const { relation, treatmentId, scopeIds, corridorIds } = input;
  if (
    relation.record_kind !== "relation" ||
    relation.truth_status !== "source_stated" ||
    relation.review_state === "quarantined" ||
    relation.evidence_refs.length === 0 ||
    relation.evidence_refs.some((ref) => !exactEvidence(ref))
  ) {
    return false;
  }
  const subjectId = text(relation.payload.subject_id);
  const objectId = text(relation.payload.object_id);
  const relationKind = text(relation.payload.relation_kind);
  const relationFamily = text(relation.payload.relation_family);
  const assertionStatus = text(relation.payload.assertion_status);
  if (!subjectId || !objectId || !relationKind || !relationFamily) return false;
  if (assertionStatus !== "delivered") return false;

  return (
    subjectId === treatmentId &&
    scopeIds.has(objectId) &&
    corridorIds.has(objectId) &&
    relationFamily === "corridor_scope" &&
    (relationKind === "located_on_corridor" || relationKind === "applied_on_corridor")
  ) || (
    objectId === treatmentId &&
    scopeIds.has(subjectId) &&
    corridorIds.has(subjectId) &&
    relationFamily === "treatment_context" &&
    relationKind === "has_treatment"
  );
}

function scopeStatusForOccurrence(input: {
  occurrence: OccurrenceTreatmentPhysicalityInput;
  decisionsByTreatment: ReadonlyMap<string, OccurrenceTreatmentPhysicalityDecision>;
  relationsById: ReadonlyMap<string, MtaCanonicalRecord>;
  corridorIds: ReadonlySet<string>;
}): {
  row: OccurrenceTreatmentPhysicalityOccurrenceAuditRow;
  findings: OccurrenceTreatmentPhysicalityFinding[];
} {
  const occurrenceId = text(input.occurrence.occurrence_id) ?? "<missing>";
  const treatmentIds = uniqueSorted(
    treatmentMembers(input.occurrence).flatMap((member) =>
      text(member.treatment_record_id) ? [member.treatment_record_id!] : []),
  );
  const physicalIds: string[] = [];
  const nonphysicalIds: string[] = [];
  const pointIds: string[] = [];
  const reviewIds: string[] = [];
  for (const treatmentId of treatmentIds) {
    const classification = input.decisionsByTreatment.get(treatmentId)?.classification ??
      "review_required";
    if (classification === "physical_corridor_or_segment_intervention") physicalIds.push(treatmentId);
    else if (classification === "nonphysical_service_operations_policy_control") nonphysicalIds.push(treatmentId);
    else if (classification === "point_or_stop_physical_intervention") pointIds.push(treatmentId);
    else reviewIds.push(treatmentId);
  }

  const scopeIds = uniqueSorted(input.occurrence.physical_scope_record_ids ?? []);
  const relationIds = uniqueSorted(input.occurrence.physical_scope_relation_record_ids ?? []);
  const warningCodes = new Set<OccurrenceTreatmentPhysicalityFindingCode>();
  const reasons = new Set<string>();
  const findings: OccurrenceTreatmentPhysicalityFinding[] = [];
  let primary: OccurrenceTreatmentPhysicalityOccurrenceAuditRow["primary_disposition"];

  if (reviewIds.length > 0 || pointIds.length > 0) {
    primary = "physicality_review_required";
    const code = pointIds.length > 0
      ? "OTPHY_POINT_SCOPE_CONTRACT_REQUIRED" as const
      : "OTPHY_TREATMENT_REVIEW_MISSING" as const;
    warningCodes.add(code);
    reasons.add(pointIds.length > 0
      ? "point_or_stop_physical_scope_contract_not_implemented_in_v1"
      : "one_or_more_treatment_members_require_physicality_review");
    for (const treatmentId of [...pointIds, ...reviewIds]) {
      findings.push(finding(
        code,
        "physicality_or_point_scope_review_required",
        treatmentId,
        occurrenceId,
        pointIds.includes(treatmentId)
          ? "Point/stop physical treatment requires an explicit point/stop scope contract."
          : "Treatment member lacks a complete reviewed physicality decision.",
        treatmentIds,
      ));
    }
  } else if (physicalIds.length === 0) {
    primary = "physical_scope_not_applicable";
    reasons.add("all_treatment_members_reviewed_nonphysical");
  } else if (scopeIds.length === 0) {
    primary = "physical_scope_missing";
    warningCodes.add("OTPHY_PHYSICAL_SCOPE_MISSING");
    reasons.add("physical_corridor_or_segment_treatment_has_no_canonical_scope");
    for (const treatmentId of physicalIds) {
      findings.push(finding(
        "OTPHY_PHYSICAL_SCOPE_MISSING",
        "physical_corridor_or_segment_scope_missing",
        treatmentId,
        occurrenceId,
        `Physical treatment ${treatmentId} has no canonical corridor or bounded-segment scope in the occurrence.`,
        treatmentIds,
      ));
    }
  } else if (relationIds.length === 0) {
    primary = "physical_scope_relation_missing";
    warningCodes.add("OTPHY_PHYSICAL_SCOPE_RELATION_MISSING");
    reasons.add("physical_scope_has_no_direct_canonical_relation");
    for (const treatmentId of physicalIds) {
      findings.push(finding(
        "OTPHY_PHYSICAL_SCOPE_RELATION_MISSING",
        "physical_scope_direct_relation_missing",
        treatmentId,
        occurrenceId,
        `Physical treatment ${treatmentId} has scope ids but no direct canonical physical-scope relation.`,
        [...scopeIds, ...treatmentIds],
      ));
    }
  } else {
    const bindingsByRelation = new Map<string, Set<string>>();
    for (const binding of input.occurrence.physical_scope_evidence_bindings ?? []) {
      const relationId = text(binding.record_id);
      const sourceId = text(binding.source_id);
      const evidenceId = text(binding.evidence_id);
      if (binding.role !== "physical_scope" || !relationId || !sourceId || !evidenceId) continue;
      const keys = bindingsByRelation.get(relationId) ?? new Set<string>();
      keys.add(`${sourceId}\0${evidenceId}`);
      bindingsByRelation.set(relationId, keys);
    }
    const missingBinding = relationIds.some((relationId) => {
      const relation = input.relationsById.get(relationId);
      const occurrenceBindings = bindingsByRelation.get(relationId);
      if (!relation || !occurrenceBindings) return true;
      return !relation.evidence_refs.some((ref) => {
        const sourceId = text(ref.source_id);
        const evidenceId = text(ref.evidence_id);
        return sourceId && evidenceId && occurrenceBindings.has(`${sourceId}\0${evidenceId}`);
      });
    });
    if (missingBinding) {
      primary = "physical_scope_evidence_missing";
      warningCodes.add("OTPHY_PHYSICAL_SCOPE_EVIDENCE_MISSING");
      reasons.add("physical_scope_relation_lacks_exact_occurrence_evidence_binding");
      for (const treatmentId of physicalIds) {
        findings.push(finding(
          "OTPHY_PHYSICAL_SCOPE_EVIDENCE_MISSING",
          "physical_scope_occurrence_evidence_missing",
          treatmentId,
          occurrenceId,
          `Physical treatment ${treatmentId} has a scope relation without an exact occurrence physical_scope evidence binding.`,
          [...relationIds, ...scopeIds],
        ));
      }
    } else {
      const scopeIdSet = new Set(scopeIds);
      const invalidPhysicalTreatments = physicalIds.filter((treatmentId) =>
        !relationIds.some((relationId) => {
          const relation = input.relationsById.get(relationId);
          return relation
            ? exactDirectPhysicalScopeRelation({
              relation,
              treatmentId,
              scopeIds: scopeIdSet,
              corridorIds: input.corridorIds,
            })
            : false;
        }),
      );
      if (invalidPhysicalTreatments.length > 0) {
        primary = "physical_scope_relation_invalid";
        warningCodes.add("OTPHY_PHYSICAL_SCOPE_RELATION_INVALID");
        reasons.add("physical_scope_relation_is_not_exact_direct_authoritative_treatment_scope");
        for (const treatmentId of invalidPhysicalTreatments) {
          findings.push(finding(
            "OTPHY_PHYSICAL_SCOPE_RELATION_INVALID",
            "physical_scope_direct_relation_invalid",
            treatmentId,
            occurrenceId,
            `Physical treatment ${treatmentId} lacks a source-stated, evidence-complete direct relation to an occurrence scope record.`,
            [...relationIds, ...scopeIds],
          ));
        }
      } else {
        primary = "physical_scope_satisfied";
        reasons.add("all_physical_treatment_members_have_exact_direct_canonical_scope");
      }
    }
  }

  return {
    row: {
      schema_version: OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION,
      occurrence_id: occurrenceId,
      treatment_record_ids: treatmentIds,
      physical_treatment_record_ids: physicalIds,
      nonphysical_treatment_record_ids: nonphysicalIds,
      point_or_stop_treatment_record_ids: pointIds,
      review_required_treatment_record_ids: reviewIds,
      physical_scope_record_ids: scopeIds,
      physical_scope_relation_record_ids: relationIds,
      primary_disposition: primary,
      warning_codes: [...warningCodes].sort((left, right) => left.localeCompare(right)),
      reasons: [...reasons].sort((left, right) => left.localeCompare(right)),
    },
    findings,
  };
}

export function auditOccurrenceTreatmentPhysicality(input: {
  occurrences: readonly OccurrenceTreatmentPhysicalityInput[];
  treatments: readonly MtaCanonicalRecord[];
  relations: readonly MtaCanonicalRecord[];
  corridors: readonly MtaCanonicalRecord[];
  decisions: readonly OccurrenceTreatmentPhysicalityDecision[];
  policy?: OccurrenceTreatmentPhysicalityPolicy | undefined;
}): OccurrenceTreatmentPhysicalityAudit {
  const policy = input.policy ?? OCCURRENCE_TREATMENT_PHYSICALITY_POLICY_V1;
  const expected = buildOccurrenceTreatmentPhysicalityReview({
    occurrences: input.occurrences,
    treatments: input.treatments,
    policy,
  });
  const findings = [...expected.findings];
  const actualById = new Map<string, OccurrenceTreatmentPhysicalityDecision[]>();
  for (const decision of input.decisions) {
    const rows = actualById.get(decision.treatment_record_id) ?? [];
    rows.push(decision);
    actualById.set(decision.treatment_record_id, rows);
  }
  const expectedById = new Map(expected.decisions.map((decision) => [decision.treatment_record_id, decision]));
  const reconciledDecisions = new Map<string, OccurrenceTreatmentPhysicalityDecision>();

  for (const [treatmentId, expectedDecision] of expectedById) {
    const actualRows = actualById.get(treatmentId) ?? [];
    if (actualRows.length === 0) {
      findings.push(finding(
        "OTPHY_TREATMENT_REVIEW_MISSING",
        "immutable_treatment_review_missing",
        treatmentId,
        null,
        `Treatment ${treatmentId} has no immutable physicality review decision.`,
        expectedDecision.occurrence_ids,
      ));
      reconciledDecisions.set(treatmentId, reviewRequiredDecision({
        treatmentRecordId: treatmentId,
        family: expectedDecision.treatment_family,
        kind: expectedDecision.treatment_kind,
        occurrences: expectedDecision.occurrence_ids,
        reason: "Immutable review decision is missing.",
        reasonCodes: ["immutable_treatment_review_missing"],
      }));
      continue;
    }
    if (actualRows.length > 1) {
      findings.push(finding(
        "OTPHY_TREATMENT_REVIEW_DUPLICATE",
        "duplicate_immutable_treatment_review",
        treatmentId,
        null,
        `Treatment ${treatmentId} has ${actualRows.length} physicality review decisions.`,
        actualRows.map((row) => row.decision_id),
      ));
    }
    const actual = actualRows[0]!;
    const policyClassification = expectedDecision.classification;
    if (
      actual.classification !== policyClassification ||
      actual.scope_requirement !== expectedDecision.scope_requirement ||
      actual.policy_rule_id !== expectedDecision.policy_rule_id
    ) {
      findings.push(finding(
        "OTPHY_TREATMENT_CLASSIFICATION_CONFLICT",
        "immutable_review_conflicts_with_current_reviewed_policy",
        treatmentId,
        null,
        `Treatment ${treatmentId} ledger classification does not match the exact current policy decision.`,
        [actual.decision_id],
      ));
    }
    if (
      actual.treatment_family !== expectedDecision.treatment_family ||
      actual.treatment_kind !== expectedDecision.treatment_kind ||
      actual.treatment_semantic_sha256 !== expectedDecision.treatment_semantic_sha256
    ) {
      findings.push(finding(
        "OTPHY_TREATMENT_REVIEW_STALE",
        "immutable_review_treatment_semantics_drifted",
        treatmentId,
        null,
        `Treatment ${treatmentId} family, kind, identity, or evidence-bound semantic content changed after review.`,
        [actual.decision_id],
      ));
    }
    if (
      actual.treatment_evidence_sha256 !== expectedDecision.treatment_evidence_sha256 ||
      stableJson(actual.evidence_refs as unknown as JsonValue) !==
        stableJson(expectedDecision.evidence_refs as unknown as JsonValue)
    ) {
      findings.push(finding(
        "OTPHY_TREATMENT_EVIDENCE_DRIFT",
        "immutable_review_evidence_drifted",
        treatmentId,
        null,
        `Treatment ${treatmentId} exact evidence bindings changed after review.`,
        [actual.decision_id],
      ));
    }
    if (
      stableJson(actual.occurrence_ids as unknown as JsonValue) !==
        stableJson(expectedDecision.occurrence_ids as unknown as JsonValue) ||
      actual.occurrence_ids_sha256 !== expectedDecision.occurrence_ids_sha256
    ) {
      findings.push(finding(
        "OTPHY_OCCURRENCE_MEMBERSHIP_DRIFT",
        "immutable_review_occurrence_membership_drifted",
        treatmentId,
        null,
        `Treatment ${treatmentId} eligible occurrence membership changed after review.`,
        uniqueSorted([...actual.occurrence_ids, ...expectedDecision.occurrence_ids]),
      ));
    }
    reconciledDecisions.set(treatmentId, actual);
  }
  for (const [treatmentId, actualRows] of actualById) {
    if (expectedById.has(treatmentId)) continue;
    findings.push(finding(
      "OTPHY_TREATMENT_REVIEW_STALE",
      "immutable_review_no_longer_in_eligible_denominator",
      treatmentId,
      null,
      `Treatment ${treatmentId} has a review decision but is absent from the eligible occurrence denominator.`,
      actualRows.map((row) => row.decision_id),
    ));
  }

  const findingsByTreatment = new Map<string, Set<OccurrenceTreatmentPhysicalityFindingCode>>();
  for (const row of findings) {
    if (!row.treatment_record_id) continue;
    const codes = findingsByTreatment.get(row.treatment_record_id) ?? new Set();
    codes.add(row.code);
    findingsByTreatment.set(row.treatment_record_id, codes);
  }
  const treatmentRows = [...expectedById.values()].map((expectedDecision) => {
    const decision = reconciledDecisions.get(expectedDecision.treatment_record_id);
    const codes = [...(findingsByTreatment.get(expectedDecision.treatment_record_id) ?? [])]
      .sort((left, right) => left.localeCompare(right));
    const classification = codes.length === 0 && decision
      ? decision.classification
      : "review_required";
    const scopeRequirement = codes.length === 0 && decision
      ? decision.scope_requirement
      : "review_required";
    const primaryDisposition: OccurrenceTreatmentPhysicalityTreatmentAuditRow["primary_disposition"] =
      classification === "physical_corridor_or_segment_intervention"
        ? "reviewed_physical_corridor_or_segment"
        : classification === "nonphysical_service_operations_policy_control"
          ? "reviewed_nonphysical"
          : classification === "point_or_stop_physical_intervention"
            ? "reviewed_point_or_stop_physical"
            : "review_required";
    return {
      schema_version: OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION,
      treatment_record_id: expectedDecision.treatment_record_id,
      treatment_family: expectedDecision.treatment_family,
      treatment_kind: expectedDecision.treatment_kind,
      occurrence_ids: expectedDecision.occurrence_ids,
      classification,
      scope_requirement: scopeRequirement,
      primary_disposition: primaryDisposition,
      warning_codes: codes,
      decision_id: decision?.decision_id ?? null,
      evidence_ids: decision?.evidence_ids ?? expectedDecision.evidence_ids,
    } satisfies OccurrenceTreatmentPhysicalityTreatmentAuditRow;
  }).sort((left, right) => left.treatment_record_id.localeCompare(right.treatment_record_id));

  const relationsById = new Map(
    input.relations
      .filter((record) => record.record_kind === "relation")
      .map((record) => [record.record_id, record]),
  );
  const corridorIds = new Set(
    input.corridors
      .filter((record) => record.record_kind === "corridor")
      .map((record) => record.record_id),
  );
  const occurrenceRows: OccurrenceTreatmentPhysicalityOccurrenceAuditRow[] = [];
  for (const occurrence of eligibleOccurrences(input.occurrences)) {
    const scoped = scopeStatusForOccurrence({
      occurrence,
      decisionsByTreatment: reconciledDecisions,
      relationsById,
      corridorIds,
    });
    occurrenceRows.push(scoped.row);
    findings.push(...scoped.findings);
  }
  occurrenceRows.sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));

  const classificationKeys: readonly OccurrenceTreatmentPhysicalityClassification[] = [
    "physical_corridor_or_segment_intervention",
    "nonphysical_service_operations_policy_control",
    "point_or_stop_physical_intervention",
    "review_required",
  ];
  const scopeKeys: readonly OccurrenceTreatmentPhysicalityScopeRequirement[] = [
    "corridor_or_segment_required",
    "not_applicable",
    "point_or_stop_required",
    "review_required",
  ];
  const occurrenceDispositionKeys:
    readonly OccurrenceTreatmentPhysicalityOccurrenceAuditRow["primary_disposition"][] = [
      "physical_scope_satisfied",
      "physical_scope_missing",
      "physical_scope_relation_missing",
      "physical_scope_evidence_missing",
      "physical_scope_relation_invalid",
      "physicality_review_required",
      "physical_scope_not_applicable",
    ];
  const finalFindings = findings.sort(findingOrder);
  const findingCounts: Partial<Record<OccurrenceTreatmentPhysicalityFindingCode, number>> = {};
  for (const row of finalFindings) findingCounts[row.code] = (findingCounts[row.code] ?? 0) + 1;

  return {
    treatmentRows,
    occurrenceRows,
    findings: finalFindings,
    summary: {
      schema_version: OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION,
      eligible_occurrence_count: occurrenceRows.length,
      unique_treatment_count: treatmentRows.length,
      treatment_membership_count: treatmentRows.reduce((sum, row) => sum + row.occurrence_ids.length, 0),
      classification_counts: countBy(treatmentRows.map((row) => row.classification), classificationKeys),
      scope_requirement_counts: countBy(treatmentRows.map((row) => row.scope_requirement), scopeKeys),
      occurrence_disposition_counts: countBy(
        occurrenceRows.map((row) => row.primary_disposition),
        occurrenceDispositionKeys,
      ),
      finding_counts: Object.fromEntries(
        Object.entries(findingCounts).sort(([left], [right]) => left.localeCompare(right)),
      ),
      review_ledger_complete: treatmentRows.every((row) =>
        row.primary_disposition !== "review_required" && row.warning_codes.length === 0),
      physical_scope_complete: occurrenceRows.every((row) =>
        row.primary_disposition === "physical_scope_satisfied" ||
        row.primary_disposition === "physical_scope_not_applicable"),
      hard_mode_ready: finalFindings.length === 0,
    },
  };
}
