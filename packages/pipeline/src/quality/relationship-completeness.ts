import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  canonicalDbPath,
  openCanonicalDb,
  readCanonicalRecordsFromDb,
  rebuildCanonicalDb,
  type CanonicalRelationshipCompletenessMirror,
  type CanonicalRelationshipCompletenessRoleMirror,
  type CanonicalRelationshipCompletenessSubjectMirror,
} from "@mta-wiki/db/canonical-db";
import {
  loadRelationshipContract,
  relationshipContractValidationMode,
} from "@mta-wiki/db/relationship-contract";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { OperationalOccurrenceRow } from "@mta-wiki/pipeline/materialize/operational-occurrences";
import {
  computeRouteAnchors,
  readRouteAnchorReview,
  routeAnchorOverridesPath,
  type RouteAnchorReview,
  type RouteAnchorRow,
} from "@mta-wiki/pipeline/materialize/route-anchors";
import { auditRelationshipGraph } from "@mta-wiki/pipeline/records/relationship-integrity";
import type { OperationalCoverageGap } from "@mta-wiki/pipeline/quality/operational-coverage";
import {
  auditOccurrenceTreatmentPhysicality,
  buildOccurrenceTreatmentPhysicalityReview,
  OCCURRENCE_TREATMENT_PHYSICALITY_CONTRACT_ID,
  OCCURRENCE_TREATMENT_PHYSICALITY_LEDGER_ID,
  OCCURRENCE_TREATMENT_PHYSICALITY_POLICY_V1,
  OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION,
  type OccurrenceTreatmentPhysicalityAudit,
  type OccurrenceTreatmentPhysicalityClassification,
  type OccurrenceTreatmentPhysicalityDecision,
  type OccurrenceTreatmentPhysicalityFindingCode,
  type OccurrenceTreatmentPhysicalityOccurrenceAuditRow,
  type OccurrenceTreatmentPhysicalityPolicy,
  type OccurrenceTreatmentPhysicalityScopeRequirement,
  type OccurrenceTreatmentPhysicalityTreatmentAuditRow,
} from "@mta-wiki/pipeline/quality/occurrence-treatment-physicality";
import {
  busLaneTreatmentDispositionPath,
  operationalEventDispositionPath,
  readRelationshipDispositionFile,
  validateRelationshipDispositionLedger,
  type RelationshipDispositionDecision,
} from "@mta-wiki/pipeline/quality/relationship-dispositions";

export const RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION = 1 as const;
export const RELATIONSHIP_COMPLETENESS_CONTRACT_ID = "relationship-completeness-v1" as const;
export const DEFAULT_RELATIONSHIP_COMPLETENESS_RELEASE_ID = "v1-rc20";
export const DEFAULT_RELATIONSHIP_COMPLETENESS_RELEASE_DIR =
  `data/exports/releases/${DEFAULT_RELATIONSHIP_COMPLETENESS_RELEASE_ID}`;
export const DEFAULT_RELATIONSHIP_COMPLETENESS_RELEASE_MANIFEST_SHA256 =
  "a2e9147fbb3db3b27a48df27f9550a8b31ab28bc85e30b7166d75b46b54e1a08";
export const DEFAULT_RELATIONSHIP_COMPLETENESS_COVERAGE_DIR = "data/quality/operational-coverage";
export const DEFAULT_RELATIONSHIP_COMPLETENESS_OUTPUT_DIR =
  "data/quality/relationship-integrity/completeness";
export const DEFAULT_OCCURRENCE_TREATMENT_PHYSICALITY_CONTRACT_PATH =
  "data/contracts/occurrence-treatment-physicality/v1/contract.json";
export const DEFAULT_BUS_LANE_TREATMENT_SCOPE_CONTRACT_DIR =
  "data/relationship-integrity/dispositions/v1/bus-lane-treatments";

export type RelationshipCompletenessWarningCode =
  | "RC_OCCURRENCE_IDENTITY_MISSING"
  | "RC_OCCURRENCE_IDENTITY_AMBIGUOUS"
  | "RC_OCCURRENCE_REALIZED_IDENTITY_INVALID"
  | "RC_OCCURRENCE_REALIZED_EVENT_IDENTITY_MISSING"
  | "RC_OCCURRENCE_ROUTE_MISSING"
  | "RC_OCCURRENCE_GTFS_ROUTE_MISSING"
  | "RC_OCCURRENCE_ROUTE_IDENTITY_EVIDENCE_MISSING"
  | "RC_OCCURRENCE_ROUTE_SCOPE_EVIDENCE_MISSING"
  | "RC_OCCURRENCE_TREATMENT_MISSING"
  | "RC_OCCURRENCE_TREATMENT_DEFINITION_EVIDENCE_MISSING"
  | "RC_OCCURRENCE_TREATMENT_SCOPE_EVIDENCE_MISSING"
  | "RC_OCCURRENCE_TREATMENT_BUNDLE_IDENTITY_MISSING"
  | "RC_OCCURRENCE_TREATMENT_BUNDLE_EVIDENCE_MISSING"
  | "RC_OCCURRENCE_ONSET_MISSING"
  | "RC_OCCURRENCE_ONSET_PRECISION_INVALID"
  | "RC_OCCURRENCE_EVENT_DATE_EVIDENCE_MISSING"
  | "RC_OCCURRENCE_TIMELINE_EVIDENCE_MISSING"
  | "RC_OCCURRENCE_PHASE_IDENTITY_MISSING"
  | "RC_OCCURRENCE_PHASE_RELATION_MISSING"
  | "RC_OCCURRENCE_PHYSICALITY_REVIEW_REQUIRED"
  | "RC_OCCURRENCE_PHYSICAL_SCOPE_MISSING"
  | "RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_MISSING"
  | "RC_OCCURRENCE_PHYSICAL_SCOPE_EVIDENCE_MISSING"
  | "RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_INVALID"
  | "RC_OCCURRENCE_POINT_SCOPE_CONTRACT_REQUIRED"
  | "RC_TREATMENT_PHYSICALITY_REVIEW_REQUIRED"
  | "RC_BUS_LANE_TREATMENT_SELECTOR_ACCOUNTING_REQUIRED"
  | "RC_BUS_LANE_TREATMENT_SCOPE_OR_DISPOSITION_REQUIRED"
  | "RC_BUS_LANE_TREATMENT_EVIDENCE_MISSING"
  | "RC_OPERATIONAL_EVENT_REVIEW_OR_DISPOSITION_REQUIRED"
  | "RC_OPERATIONAL_EVENT_VERSIONED_DISPOSITION_REQUIRED"
  | "RC_OPERATIONAL_EVENT_OCCURRENCE_COVERAGE_CONFLICT"
  | "RC_ROUTE_IDENTITY_ACCOUNTING_REQUIRED"
  | "RC_ROUTE_IDENTITY_EVIDENCE_MISSING";

export type RelationshipCompletenessWarningDefinition = {
  code: RelationshipCompletenessWarningCode;
  selector:
    | "eligible_operational_occurrence"
    | "eligible_occurrence_treatment_physicality"
    | "bus_lane_family_treatment"
    | "operational_event_family"
    | "route_identity";
  selector_class: "enforcement_candidate" | "schema_migration";
  promotion_criterion: string;
};

export const RELATIONSHIP_COMPLETENESS_WARNING_DEFINITIONS = [
  {
    code: "RC_OCCURRENCE_IDENTITY_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible row has a non-empty immutable occurrence id.",
  },
  {
    code: "RC_OCCURRENCE_IDENTITY_AMBIGUOUS",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Occurrence ids and aliases resolve to exactly one eligible occurrence.",
  },
  {
    code: "RC_OCCURRENCE_REALIZED_IDENTITY_INVALID",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible row is approved and has resolved realized status.",
  },
  {
    code: "RC_OCCURRENCE_REALIZED_EVENT_IDENTITY_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible occurrence identifies at least one canonical event in provenance.",
  },
  {
    code: "RC_OCCURRENCE_ROUTE_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible occurrence has at least one route member.",
  },
  {
    code: "RC_OCCURRENCE_GTFS_ROUTE_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible route member has a canonical record id and GTFS route id.",
  },
  {
    code: "RC_OCCURRENCE_ROUTE_IDENTITY_EVIDENCE_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible route member has exact route_identity evidence.",
  },
  {
    code: "RC_OCCURRENCE_ROUTE_SCOPE_EVIDENCE_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible route member has route_scope evidence.",
  },
  {
    code: "RC_OCCURRENCE_TREATMENT_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible occurrence has at least one treatment member.",
  },
  {
    code: "RC_OCCURRENCE_TREATMENT_DEFINITION_EVIDENCE_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every treatment member has exact treatment_definition evidence.",
  },
  {
    code: "RC_OCCURRENCE_TREATMENT_SCOPE_EVIDENCE_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every treatment member has treatment_scope evidence.",
  },
  {
    code: "RC_OCCURRENCE_TREATMENT_BUNDLE_IDENTITY_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible treatment bundle has a supported analysis family.",
  },
  {
    code: "RC_OCCURRENCE_TREATMENT_BUNDLE_EVIDENCE_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible treatment bundle has bundle_analysis_family evidence.",
  },
  {
    code: "RC_OCCURRENCE_ONSET_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible occurrence has an explicit operational onset.",
  },
  {
    code: "RC_OCCURRENCE_ONSET_PRECISION_INVALID",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible onset uses conservative day or month precision.",
  },
  {
    code: "RC_OCCURRENCE_EVENT_DATE_EVIDENCE_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible onset has exact event_date evidence.",
  },
  {
    code: "RC_OCCURRENCE_TIMELINE_EVIDENCE_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion: "Every eligible onset has exact timeline_relation evidence.",
  },
  {
    code: "RC_OCCURRENCE_PHASE_IDENTITY_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "schema_migration",
    promotion_criterion: "The occurrence contract projects an explicit canonical phase identity.",
  },
  {
    code: "RC_OCCURRENCE_PHASE_RELATION_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "schema_migration",
    promotion_criterion:
      "The occurrence contract projects earlier/later phase relations or an explicit single-phase disposition.",
  },
  {
    code: "RC_OCCURRENCE_PHYSICALITY_REVIEW_REQUIRED",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion:
      "Every treatment member has one immutable exact evidence-bound physicality decision.",
  },
  {
    code: "RC_OCCURRENCE_PHYSICAL_SCOPE_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion:
      "Every corridor/segment-physical occurrence projects a canonical corridor or bounded segment.",
  },
  {
    code: "RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion:
      "Every corridor/segment-physical occurrence has a direct canonical treatment-to-scope relation.",
  },
  {
    code: "RC_OCCURRENCE_PHYSICAL_SCOPE_EVIDENCE_MISSING",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion:
      "Every physical-scope relation is bound to its exact authoritative evidence in the occurrence.",
  },
  {
    code: "RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_INVALID",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion:
      "Every physical-scope relation is direct, source-stated, evidence-complete, and type-valid.",
  },
  {
    code: "RC_OCCURRENCE_POINT_SCOPE_CONTRACT_REQUIRED",
    selector: "eligible_operational_occurrence",
    selector_class: "enforcement_candidate",
    promotion_criterion:
      "Every point/stop-physical treatment is governed by an explicit canonical point/stop scope contract.",
  },
  {
    code: "RC_TREATMENT_PHYSICALITY_REVIEW_REQUIRED",
    selector: "eligible_occurrence_treatment_physicality",
    selector_class: "enforcement_candidate",
    promotion_criterion:
      "Every eligible-occurrence treatment has one immutable exact evidence-bound physicality decision with no drift.",
  },
  {
    code: "RC_BUS_LANE_TREATMENT_SELECTOR_ACCOUNTING_REQUIRED",
    selector: "bus_lane_family_treatment",
    selector_class: "enforcement_candidate",
    promotion_criterion:
      "Every row in the immutable bus-lane treatment inventory is represented exactly once in the completeness selector.",
  },
  {
    code: "RC_BUS_LANE_TREATMENT_SCOPE_OR_DISPOSITION_REQUIRED",
    selector: "bus_lane_family_treatment",
    selector_class: "enforcement_candidate",
    promotion_criterion:
      "Every in-scope bus-lane treatment has canonical physical scope or an explicit reviewed non-projectable physical-scope disposition.",
  },
  {
    code: "RC_BUS_LANE_TREATMENT_EVIDENCE_MISSING",
    selector: "bus_lane_family_treatment",
    selector_class: "enforcement_candidate",
    promotion_criterion:
      "Every bus-lane scope or non-projectable disposition is bound to exact evidence on the reviewed treatment identity.",
  },
  {
    code: "RC_OPERATIONAL_EVENT_REVIEW_OR_DISPOSITION_REQUIRED",
    selector: "operational_event_family",
    selector_class: "schema_migration",
    promotion_criterion:
      "Every operational-family event has an eligible occurrence or an explicit reviewed versioned disposition.",
  },
  {
    code: "RC_OPERATIONAL_EVENT_VERSIONED_DISPOSITION_REQUIRED",
    selector: "operational_event_family",
    selector_class: "schema_migration",
    promotion_criterion:
      "Legacy terminal gap decisions are migrated to an immutable typed non-projectable disposition.",
  },
  {
    code: "RC_OPERATIONAL_EVENT_OCCURRENCE_COVERAGE_CONFLICT",
    selector: "operational_event_family",
    selector_class: "schema_migration",
    promotion_criterion: "Eligible occurrences and the full-event coverage ledger reconcile without open gaps.",
  },
  {
    code: "RC_ROUTE_IDENTITY_ACCOUNTING_REQUIRED",
    selector: "route_identity",
    selector_class: "enforcement_candidate",
    promotion_criterion:
      "Every canonical route is accounted exactly once as a GTFS-backed anchor/variant or an explicit reviewed typed non-projectable disposition.",
  },
  {
    code: "RC_ROUTE_IDENTITY_EVIDENCE_MISSING",
    selector: "route_identity",
    selector_class: "enforcement_candidate",
    promotion_criterion:
      "Every canonical route identity and every reviewed non-projectable disposition retains evidence bound to that exact route record.",
  },
] as const satisfies readonly RelationshipCompletenessWarningDefinition[];

const occurrenceEnforcementCandidateCodes = new Set<RelationshipCompletenessWarningCode>(
  RELATIONSHIP_COMPLETENESS_WARNING_DEFINITIONS
    .filter((definition) =>
      definition.selector === "eligible_operational_occurrence" &&
      definition.selector_class === "enforcement_candidate")
    .map((definition) => definition.code),
);
const occurrencePhysicalityAndScopeCodes = new Set<RelationshipCompletenessWarningCode>([
  "RC_OCCURRENCE_PHYSICALITY_REVIEW_REQUIRED",
  "RC_OCCURRENCE_PHYSICAL_SCOPE_MISSING",
  "RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_MISSING",
  "RC_OCCURRENCE_PHYSICAL_SCOPE_EVIDENCE_MISSING",
  "RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_INVALID",
  "RC_OCCURRENCE_POINT_SCOPE_CONTRACT_REQUIRED",
]);
const occurrenceCoreRoleCodes = new Set(
  [...occurrenceEnforcementCandidateCodes].filter((code) =>
    !occurrencePhysicalityAndScopeCodes.has(code)),
);

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
  "transit_signal_priority",
]);

export type RelationshipCompletenessInputPin = {
  path: string;
  bytes: number;
  sha256: string;
  row_count?: number | undefined;
};

export type OccurrenceCompletenessDisposition =
  | "contract_roles_incomplete"
  | "contract_roles_complete_migration_required"
  | "contract_roles_complete";

export type OccurrenceCompletenessRow = {
  schema_version: typeof RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION;
  selector: "eligible_operational_occurrence";
  selector_class: "contract_roles_plus_migration_diagnostics";
  occurrence_id: string;
  event_record_ids: string[];
  route_record_ids: string[];
  gtfs_route_ids: string[];
  treatment_record_ids: string[];
  treatment_families: string[];
  phase_record_ids: string[];
  phase_relation_record_ids: string[];
  physical_scope_record_ids: string[];
  physical_scope_relation_record_ids: string[];
  physical_treatment_record_ids: string[];
  nonphysical_treatment_record_ids: string[];
  point_or_stop_treatment_record_ids: string[];
  physicality_review_required_treatment_record_ids: string[];
  physical_scope_requirement:
    | "corridor_or_segment_required"
    | "point_or_stop_required"
    | "not_applicable"
    | "review_required";
  primary_disposition: OccurrenceCompletenessDisposition;
  warning_codes: RelationshipCompletenessWarningCode[];
  reasons: string[];
};

export type OccurrenceTreatmentPhysicalityCompletenessRow = {
  schema_version: typeof RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION;
  selector: "eligible_occurrence_treatment_physicality";
  selector_class: "reviewed_full_denominator";
  treatment_record_id: string;
  treatment_family: string | null;
  treatment_kind: string | null;
  occurrence_ids: string[];
  classification: OccurrenceTreatmentPhysicalityClassification;
  scope_requirement: OccurrenceTreatmentPhysicalityScopeRequirement;
  primary_disposition: OccurrenceTreatmentPhysicalityTreatmentAuditRow["primary_disposition"];
  warning_codes: RelationshipCompletenessWarningCode[];
  reasons: string[];
  physicality_finding_codes: OccurrenceTreatmentPhysicalityFindingCode[];
  decision_id: string | null;
  evidence_ids: string[];
  /** Physicality review is a role-applicability decision only. It never creates study eligibility. */
  study_projectable: false;
};

export type BusLaneTreatmentScopeDisposition =
  | "physical_scope_satisfied"
  | "non_physical_enforcement_or_control"
  | "non_lane_supporting_feature"
  | "aggregate_or_unbounded_treatment"
  | "reviewed_non_projectable_physical_scope_unproven";

export type BusLaneTreatmentScopeInventoryDecision = {
  schema_version: 1;
  contract_id: "bus-lane-treatment-physical-scope-v1";
  decision_id: string;
  treatment_id: string;
  treatment_family: "bus_lane";
  treatment_kind: string;
  canonical_status: "materialized" | "accepted_pending_addition";
  exclusive_decision: BusLaneTreatmentScopeDisposition;
  physical_scope_requirement_satisfied: boolean;
  evidence_refs: Array<{
    source_id: string;
    evidence_id?: string | undefined;
  }>;
  scope_bindings: Array<{
    corridor_id: string;
    relation_id: string;
    relation_kind: string;
    evidence_refs: Array<{
      source_id: string;
      evidence_id?: string | undefined;
    }>;
  }>;
  source_ids: string[];
  study_eligible: boolean | null;
  study_eligibility_effect: string;
  reason: string;
};

export type BusLaneTreatmentCompletenessRow = {
  schema_version: typeof RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION;
  selector: "bus_lane_family_treatment";
  selector_class: "reviewed_full_denominator";
  treatment_record_id: string;
  treatment_family: "bus_lane";
  treatment_kind: string;
  canonical_status: "materialized" | "accepted_pending_addition";
  primary_disposition: BusLaneTreatmentScopeDisposition | "review_required";
  physical_scope_satisfied: boolean;
  physical_scope_record_ids: string[];
  physical_scope_relation_record_ids: string[];
  disposition_decision_id: string | null;
  evidence_ids: string[];
  warning_codes: RelationshipCompletenessWarningCode[];
  reasons: string[];
  /** This selector governs physical-scope completeness only and cannot confer study eligibility. */
  study_projectable: false;
  waiver: boolean;
};

export type OperationalEventCompletenessDisposition =
  | "eligible_occurrence_present"
  | "legacy_terminal_gap_dispositions_only"
  | "completeness_review_open"
  | "versioned_non_projectable_disposition";

export type OperationalEventCompletenessRow = {
  schema_version: typeof RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION;
  selector: "operational_event_family";
  selector_class: "full_denominator_migration";
  event_record_id: string;
  event_family: string;
  denominator_basis: Array<
    | "operational_event_family"
    | "reviewed_operational_event_decision"
    | "eligible_realized_occurrence_event"
  >;
  primary_disposition: OperationalEventCompletenessDisposition;
  warning_codes: RelationshipCompletenessWarningCode[];
  reasons: string[];
  disposition_decision_id: string | null;
  study_projectable: boolean;
  eligible_occurrence_ids: string[];
  ineligible_occurrence_ids: string[];
  gap_ids: string[];
  gap_dimensions: string[];
  gap_verdicts: string[];
};

export type RouteIdentityCompletenessDisposition =
  | "canonical_gtfs_anchor"
  | "canonical_gtfs_variant"
  | "reviewed_non_projectable_disposition"
  | "route_identity_review_required";

/** The full canonical-route denominator. A route is projectable as an identity only when it is
 * bound to the pinned MTA bus GTFS; historical/proposal/non-bus/corridor/aggregate rows instead
 * carry the exact immutable decision from route-identity-dispositions-v1. */
export type RouteIdentityCompletenessRow = {
  schema_version: typeof RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION;
  selector: "route_identity";
  selector_class: "reviewed_full_denominator";
  route_record_id: string;
  primary_disposition: RouteIdentityCompletenessDisposition;
  warning_codes: RelationshipCompletenessWarningCode[];
  reasons: string[];
  study_projectable: boolean;
  gtfs_route_id: string | null;
  route_anchor_disposition: string | null;
  disposition_decision_id: string | null;
  reviewed_non_projectable_disposition: string | null;
  disposition_evidence_ids: string[];
  disposition_reviewed_at: string | null;
  disposition_reason: string | null;
};

export type RelationshipCompletenessSummary = {
  schema_version: typeof RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION;
  mode: "warning";
  release_id: string;
  input_fingerprint: string;
  input_pins: RelationshipCompletenessInputPin[];
  selector_contract: {
    enforceable_selector: "eligible_operational_occurrence_contract_roles";
    treatment_physicality_selector: "all_treatment_members_of_eligible_operational_occurrences";
    bus_lane_treatment_selector: "immutable_bus_lane_treatment_physical_scope_inventory";
    full_denominator_selector: "reviewed_operational_events_union_eligible_realized_occurrence_events";
    route_identity_selector: "all_canonical_route_records";
    non_projectable_scope:
      "reviewed_route_identity_and_operational_event_selectors_only_physicality_decisions_are_not_waivers";
    caveat: string;
  };
  warning_definitions: RelationshipCompletenessWarningDefinition[];
  occurrences: {
    release_occurrence_count: number;
    eligible_occurrence_count: number;
    audited_occurrence_count: number;
    counts_by_primary_disposition: Record<OccurrenceCompletenessDisposition, number>;
    core_role_warning_occurrence_count: number;
    contract_warning_occurrence_count: number;
    schema_migration_warning_occurrence_count: number;
    physical_scope_required_occurrence_count: number;
    physical_scope_not_applicable_occurrence_count: number;
    physicality_review_required_occurrence_count: number;
    eligible_event_ids_in_operational_denominator: number;
    eligible_event_ids_outside_operational_denominator: number;
  };
  occurrence_treatment_physicality: {
    denominator_count: number;
    occurrence_membership_count: number;
    classification_counts: Record<OccurrenceTreatmentPhysicalityClassification, number>;
    scope_requirement_counts: Record<OccurrenceTreatmentPhysicalityScopeRequirement, number>;
    counts_by_primary_disposition: Record<
      OccurrenceTreatmentPhysicalityTreatmentAuditRow["primary_disposition"],
      number
    >;
    occurrence_scope_disposition_counts: Record<
      OccurrenceTreatmentPhysicalityOccurrenceAuditRow["primary_disposition"],
      number
    >;
    finding_counts: Partial<Record<OccurrenceTreatmentPhysicalityFindingCode, number>>;
    policy_rule_count: number;
    review_ledger_row_count: number;
    contract_status: "warning_first" | "reviewed_final";
    final_post_semantic_release_guard_status: "pending" | "verified";
    review_ledger_complete: boolean;
    physical_scope_complete: boolean;
  };
  bus_lane_treatments: {
    denominator_count: number;
    audited_treatment_count: number;
    materialized_treatment_count: number;
    accepted_pending_addition_count: number;
    counts_by_primary_disposition: Record<BusLaneTreatmentScopeDisposition | "review_required", number>;
    physical_scope_satisfied_count: number;
    reviewed_non_projectable_count: number;
    exact_evidence_bound_count: number;
    omitted_treatment_count: number;
    warning_treatment_count: number;
    review_complete: boolean;
  };
  operational_events: {
    denominator_count: number;
    counts_by_primary_disposition: Record<OperationalEventCompletenessDisposition, number>;
    coverage_gap_row_count: number;
    coverage_gap_counts_by_verdict: Record<string, number>;
    events_with_unreviewed_gap_count: number;
    eligible_occurrence_coverage_conflict_count: number;
    ineligible_occurrence_event_count: number;
  };
  route_identities: {
    denominator_count: number;
    audited_route_count: number;
    counts_by_primary_disposition: Record<RouteIdentityCompletenessDisposition, number>;
    gtfs_bound_route_record_count: number;
    reviewed_non_projectable_route_record_count: number;
    disposition_counts: Record<string, number>;
  };
  warning_instances_by_code: Record<RelationshipCompletenessWarningCode, number>;
  enforcement_migration: {
    eligible_occurrence_core_roles_ready: boolean;
    phase_contract_ready: boolean;
    physical_scope_contract_ready: boolean;
    treatment_physicality_contract_ready: boolean;
    treatment_physicality_final_release_guard_ready: boolean;
    bus_lane_treatment_completeness_ready: boolean;
    operational_event_completeness_ready: boolean;
    route_identity_completeness_ready: boolean;
    hard_mode_ready: boolean;
  };
};

export type RelationshipCompletenessArtifactManifest = {
  schema_version: typeof RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION;
  mode: "warning";
  release_id: string;
  input_fingerprint: string;
  audit_fingerprint: string;
  input_pins: RelationshipCompletenessInputPin[];
  files: Record<string, RelationshipCompletenessInputPin>;
};

export type BuildRelationshipCompletenessAuditInput = {
  releaseId: string;
  reproductionCommand?: string | undefined;
  occurrences: readonly OperationalOccurrenceRow[];
  treatments: readonly MtaCanonicalRecord[];
  events: readonly MtaCanonicalRecord[];
  projects: readonly MtaCanonicalRecord[];
  corridors: readonly MtaCanonicalRecord[];
  routes: readonly MtaCanonicalRecord[];
  routeAnchors: readonly RouteAnchorRow[];
  routeAnchorReview: RouteAnchorReview;
  /**
   * Project reviewed route decisions onto an immutable release denominator. Decisions whose
   * complete target set was introduced after that release are excluded; partially present
   * overrides still fail closed. Ordinary current-corpus audits leave this false.
   */
  releaseScopedRouteReview?: boolean | undefined;
  relations: readonly MtaCanonicalRecord[];
  coverageGaps: readonly OperationalCoverageGap[];
  relationshipDispositions?: readonly RelationshipDispositionDecision[] | undefined;
  treatmentPhysicality?: {
    policy: OccurrenceTreatmentPhysicalityPolicy;
    decisions: readonly OccurrenceTreatmentPhysicalityDecision[];
    contract_status: "warning_first" | "reviewed_final";
    final_post_semantic_release_guard_status: "pending" | "verified";
    inputPins?: readonly RelationshipCompletenessInputPin[] | undefined;
  } | undefined;
  busLaneTreatmentScope?: {
    decisions: readonly BusLaneTreatmentScopeInventoryDecision[];
    inputPins?: readonly RelationshipCompletenessInputPin[] | undefined;
  } | undefined;
  inputPins?: readonly RelationshipCompletenessInputPin[] | undefined;
};

export type RelationshipCompletenessArtifactBuild = {
  occurrenceRows: OccurrenceCompletenessRow[];
  treatmentRows: OccurrenceTreatmentPhysicalityCompletenessRow[];
  busLaneTreatmentRows: BusLaneTreatmentCompletenessRow[];
  eventRows: OperationalEventCompletenessRow[];
  routeRows: RouteIdentityCompletenessRow[];
  summary: RelationshipCompletenessSummary;
  manifest: RelationshipCompletenessArtifactManifest;
  contents: Record<string, string>;
};

export type LoadedRelationshipCompletenessArtifacts = RelationshipCompletenessArtifactBuild & {
  outputDir: string;
  relationshipDispositions: RelationshipDispositionDecision[];
};

export type WriteRelationshipCompletenessArtifactsOptions = {
  rootDir?: string | undefined;
  releaseDir?: string | undefined;
  coverageDir?: string | undefined;
  outputDir?: string | undefined;
  expectedReleaseManifestSha256?: string | undefined;
  /**
   * Explicitly replace the default rc20 audit's historical disposition-input pins with the
   * currently reviewed disposition ledgers. This is a narrow, reviewed migration mechanism:
   * release, coverage, contract, and artifact pins remain fail-closed.
   */
  reviewedCurrentCorpusMigration?: boolean | undefined;
  dispositionRootDir?: string | undefined;
  treatmentPhysicalityContractPath?: string | undefined;
  busLaneTreatmentScopeContractDir?: string | undefined;
};

export type WriteRelationshipCompletenessArtifactsResult = {
  outputDir: string;
  summary: RelationshipCompletenessSummary;
  manifest: RelationshipCompletenessArtifactManifest;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function countBy<T extends string>(values: Iterable<T>, keys: readonly T[]): Record<T, number> {
  const result = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  for (const value of values) result[value] += 1;
  return result;
}

function countStrings(values: Iterable<string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}

function jsonl<T>(rows: readonly T[]): string {
  return rows.map((row) => stableJson(row as JsonValue)).join("\n") + (rows.length > 0 ? "\n" : "");
}

function bindingHasRole(
  bindings: readonly { role?: unknown; record_id?: unknown }[] | undefined,
  role: string,
  exactRecordIds?: ReadonlySet<string>,
): boolean {
  return (bindings ?? []).some((binding) =>
    binding.role === role &&
    (!exactRecordIds || (typeof binding.record_id === "string" && exactRecordIds.has(binding.record_id))),
  );
}

function occurrenceTreatmentMembers(occurrence: OperationalOccurrenceRow): Array<{
  treatment_record_id: string;
  treatment_family: string;
  evidence_bindings: OperationalOccurrenceRow["evidence_bindings"];
}> {
  const treatment = occurrence.treatment;
  if (!treatment || typeof treatment !== "object") return [];
  if (treatment.kind === "atomic") return treatment.member ? [treatment.member] : [];
  return Array.isArray(treatment.members) ? treatment.members : [];
}

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueSorted(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())));
}

function projectedFieldIds(raw: Record<string, unknown>, fields: readonly string[]): string[] {
  return uniqueSorted(fields.flatMap((field) => {
    const value = raw[field];
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return stringIds(value);
  }));
}

function occurrenceAliasOwners(occurrences: readonly OperationalOccurrenceRow[]): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  for (const occurrence of occurrences) {
    const owner = text(occurrence.occurrence_id) ?? "<missing>";
    for (const identity of uniqueSorted([
      ...(text(occurrence.occurrence_id) ? [occurrence.occurrence_id] : []),
      ...(Array.isArray(occurrence.occurrence_aliases) ? occurrence.occurrence_aliases : []),
    ])) {
      const identityOwners = owners.get(identity) ?? new Set<string>();
      identityOwners.add(owner);
      owners.set(identity, identityOwners);
    }
  }
  return owners;
}

function auditOccurrences(
  occurrences: readonly OperationalOccurrenceRow[],
  operationalEventIds: ReadonlySet<string>,
  physicalityRowsByOccurrence: ReadonlyMap<string, OccurrenceTreatmentPhysicalityOccurrenceAuditRow>,
): OccurrenceCompletenessRow[] {
  const eligible = occurrences.filter((occurrence) => occurrence.study_projection_eligible);
  const aliasOwners = occurrenceAliasOwners(eligible);
  const occurrenceIdCounts = countStrings(
    eligible.map((occurrence) => text(occurrence.occurrence_id) ?? "<missing>"),
  );

  return eligible.map((occurrence, index): OccurrenceCompletenessRow => {
    const warningCodes = new Set<RelationshipCompletenessWarningCode>();
    const reasons = new Set<string>();
    const occurrenceId = text(occurrence.occurrence_id) ?? `<missing:${String(index).padStart(6, "0")}>`;
    const eventRecordIds = stringIds(occurrence.provenance?.event_record_ids);
    const relationRecordIds = new Set(stringIds(occurrence.provenance?.relation_record_ids));
    const raw = occurrence as unknown as Record<string, unknown>;

    if (!text(occurrence.occurrence_id)) warningCodes.add("RC_OCCURRENCE_IDENTITY_MISSING");
    const claimedIdentities = uniqueSorted([
      ...(text(occurrence.occurrence_id) ? [occurrence.occurrence_id] : []),
      ...(Array.isArray(occurrence.occurrence_aliases) ? occurrence.occurrence_aliases : []),
    ]);
    if (
      (occurrenceIdCounts[occurrenceId] ?? 0) !== 1 ||
      claimedIdentities.some((identity) => (aliasOwners.get(identity)?.size ?? 0) !== 1)
    ) {
      warningCodes.add("RC_OCCURRENCE_IDENTITY_AMBIGUOUS");
    }
    if (occurrence.resolved_status !== "realized" || occurrence.review_state !== "approved") {
      warningCodes.add("RC_OCCURRENCE_REALIZED_IDENTITY_INVALID");
    }
    if (eventRecordIds.length === 0) warningCodes.add("RC_OCCURRENCE_REALIZED_EVENT_IDENTITY_MISSING");

    const routes = Array.isArray(occurrence.routes) ? occurrence.routes : [];
    if (routes.length === 0) warningCodes.add("RC_OCCURRENCE_ROUTE_MISSING");
    if (routes.some((route) => !text(route.route_record_id) || !text(route.gtfs_route_id))) {
      warningCodes.add("RC_OCCURRENCE_GTFS_ROUTE_MISSING");
    }
    if (routes.some((route) =>
      !bindingHasRole(route.evidence_bindings, "route_identity", new Set([route.route_record_id])))) {
      warningCodes.add("RC_OCCURRENCE_ROUTE_IDENTITY_EVIDENCE_MISSING");
    }
    if (routes.some((route) => !bindingHasRole(route.evidence_bindings, "route_scope"))) {
      warningCodes.add("RC_OCCURRENCE_ROUTE_SCOPE_EVIDENCE_MISSING");
    }

    const members = occurrenceTreatmentMembers(occurrence);
    if (members.length === 0) warningCodes.add("RC_OCCURRENCE_TREATMENT_MISSING");
    if (members.some((member) =>
      !bindingHasRole(member.evidence_bindings, "treatment_definition", new Set([member.treatment_record_id])))) {
      warningCodes.add("RC_OCCURRENCE_TREATMENT_DEFINITION_EVIDENCE_MISSING");
    }
    if (members.some((member) => !bindingHasRole(member.evidence_bindings, "treatment_scope"))) {
      warningCodes.add("RC_OCCURRENCE_TREATMENT_SCOPE_EVIDENCE_MISSING");
    }
    if (occurrence.treatment?.kind === "bundle") {
      const bundleFamily = text(occurrence.treatment.bundle_family);
      if (!bundleFamily || !supportedBundleAnalysisFamilies.has(bundleFamily)) {
        warningCodes.add("RC_OCCURRENCE_TREATMENT_BUNDLE_IDENTITY_MISSING");
      }
      if (!bindingHasRole(occurrence.treatment.bundle_family_evidence_bindings, "bundle_analysis_family")) {
        warningCodes.add("RC_OCCURRENCE_TREATMENT_BUNDLE_EVIDENCE_MISSING");
      }
    }

    const onset = occurrence.resolved_onset;
    if (!onset || !text(onset.date)) warningCodes.add("RC_OCCURRENCE_ONSET_MISSING");
    if (!onset || (onset.precision !== "day" && onset.precision !== "month")) {
      warningCodes.add("RC_OCCURRENCE_ONSET_PRECISION_INVALID");
    }
    if (!onset || !bindingHasRole(onset.evidence_bindings, "event_date", new Set(eventRecordIds))) {
      warningCodes.add("RC_OCCURRENCE_EVENT_DATE_EVIDENCE_MISSING");
    }
    if (!onset || !bindingHasRole(onset.evidence_bindings, "timeline_relation", relationRecordIds)) {
      warningCodes.add("RC_OCCURRENCE_TIMELINE_EVIDENCE_MISSING");
    }

    const phaseIds = projectedFieldIds(raw, ["phase_id", "phase_record_id", "phase_record_ids"]);
    if (phaseIds.length === 0) {
      warningCodes.add("RC_OCCURRENCE_PHASE_IDENTITY_MISSING");
      reasons.add("phase_identity_not_projected_by_occurrence_schema_v1");
    }
    const phaseRelationIds = projectedFieldIds(raw, ["phase_relation_id", "phase_relation_ids", "phase_relation_record_ids"]);
    const phaseDisposition = text(raw.phase_relation_disposition);
    if (phaseRelationIds.length === 0 && phaseDisposition !== "single_phase" && phaseDisposition !== "not_applicable") {
      warningCodes.add("RC_OCCURRENCE_PHASE_RELATION_MISSING");
      reasons.add("phase_relation_or_single_phase_disposition_not_projected_by_occurrence_schema_v1");
    }

    const treatmentFamilies = uniqueSorted(members.map((member) => member.treatment_family).filter(Boolean));
    const physicalScopeIds = projectedFieldIds(raw, [
      "corridor_record_id",
      "corridor_record_ids",
      "segment_record_id",
      "segment_record_ids",
      "physical_scope_record_ids",
    ]);
    const physicalScopeRelationIds = projectedFieldIds(raw, [
      "physical_scope_relation_id",
      "physical_scope_relation_ids",
      "physical_scope_relation_record_ids",
    ]);
    const physicality = physicalityRowsByOccurrence.get(occurrenceId);
    if (!physicality) {
      warningCodes.add("RC_OCCURRENCE_PHYSICALITY_REVIEW_REQUIRED");
      reasons.add("eligible_occurrence_missing_physicality_audit_row");
    } else {
      for (const reason of physicality.reasons) reasons.add(`physicality:${reason}`);
      if (physicality.review_required_treatment_record_ids.length > 0) {
        warningCodes.add("RC_OCCURRENCE_PHYSICALITY_REVIEW_REQUIRED");
      }
      for (const code of physicality.warning_codes) {
        if (code === "OTPHY_PHYSICAL_SCOPE_MISSING") {
          warningCodes.add("RC_OCCURRENCE_PHYSICAL_SCOPE_MISSING");
        } else if (code === "OTPHY_PHYSICAL_SCOPE_RELATION_MISSING") {
          warningCodes.add("RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_MISSING");
        } else if (code === "OTPHY_PHYSICAL_SCOPE_EVIDENCE_MISSING") {
          warningCodes.add("RC_OCCURRENCE_PHYSICAL_SCOPE_EVIDENCE_MISSING");
        } else if (code === "OTPHY_PHYSICAL_SCOPE_RELATION_INVALID") {
          warningCodes.add("RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_INVALID");
        } else if (code === "OTPHY_POINT_SCOPE_CONTRACT_REQUIRED") {
          warningCodes.add("RC_OCCURRENCE_POINT_SCOPE_CONTRACT_REQUIRED");
        } else {
          warningCodes.add("RC_OCCURRENCE_PHYSICALITY_REVIEW_REQUIRED");
        }
      }
    }

    const eventIdsOutsideDenominator = eventRecordIds.filter((eventId) => !operationalEventIds.has(eventId));
    if (eventIdsOutsideDenominator.length > 0) reasons.add("eligible_event_identity_outside_operational_event_denominator");
    const enforceableWarnings = [...warningCodes].filter((code) => occurrenceEnforcementCandidateCodes.has(code));
    if (enforceableWarnings.length === 0) reasons.add("eligible_occurrence_contract_roles_satisfied");
    const migrationWarnings = [...warningCodes].filter((code) => !occurrenceEnforcementCandidateCodes.has(code));
    const primaryDisposition: OccurrenceCompletenessDisposition = enforceableWarnings.length > 0
      ? "contract_roles_incomplete"
      : migrationWarnings.length > 0
        ? "contract_roles_complete_migration_required"
        : "contract_roles_complete";

    return {
      schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
      selector: "eligible_operational_occurrence",
      selector_class: "contract_roles_plus_migration_diagnostics",
      occurrence_id: occurrenceId,
      event_record_ids: eventRecordIds,
      route_record_ids: uniqueSorted(routes.map((route) => route.route_record_id).filter(Boolean)),
      gtfs_route_ids: uniqueSorted(routes.map((route) => route.gtfs_route_id).filter(Boolean)),
      treatment_record_ids: uniqueSorted(members.map((member) => member.treatment_record_id).filter(Boolean)),
      treatment_families: treatmentFamilies,
      phase_record_ids: phaseIds,
      phase_relation_record_ids: phaseRelationIds,
      physical_scope_record_ids: physicalScopeIds,
      physical_scope_relation_record_ids: physicalScopeRelationIds,
      physical_treatment_record_ids: physicality?.physical_treatment_record_ids ?? [],
      nonphysical_treatment_record_ids: physicality?.nonphysical_treatment_record_ids ?? [],
      point_or_stop_treatment_record_ids: physicality?.point_or_stop_treatment_record_ids ?? [],
      physicality_review_required_treatment_record_ids:
        physicality?.review_required_treatment_record_ids ?? members.map((member) => member.treatment_record_id),
      physical_scope_requirement: !physicality
        ? "review_required"
        : physicality.review_required_treatment_record_ids.length > 0
          ? "review_required"
          : physicality.point_or_stop_treatment_record_ids.length > 0
            ? "point_or_stop_required"
            : physicality.physical_treatment_record_ids.length > 0
              ? "corridor_or_segment_required"
              : "not_applicable",
      primary_disposition: primaryDisposition,
      warning_codes: [...warningCodes].sort((left, right) => left.localeCompare(right)),
      reasons: [...reasons].sort((left, right) => left.localeCompare(right)),
    };
  }).sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));
}

const legacyTerminalCoverageVerdicts = new Set(["absent_in_source", "not_applicable", "ambiguous_conflict"]);

function operationalEventDenominatorIds(input: {
  events: readonly MtaCanonicalRecord[];
  occurrences: readonly OperationalOccurrenceRow[];
  relationshipDispositions?: readonly RelationshipDispositionDecision[] | undefined;
}): Set<string> {
  const ids = new Set(
    input.events
      .filter((event) => event.payload.event_family === "implementation" || event.payload.event_family === "launch")
      .map((event) => event.record_id),
  );
  for (const decision of input.relationshipDispositions ?? []) {
    if (decision.selector === "operational_event") ids.add(decision.record_id);
  }
  for (const occurrence of input.occurrences) {
    if (
      occurrence.study_projection_eligible &&
      occurrence.resolved_status === "realized" &&
      occurrence.review_state === "approved"
    ) {
      for (const eventId of stringIds(occurrence.provenance?.event_record_ids)) ids.add(eventId);
    }
  }
  return ids;
}

function auditOperationalEvents(input: {
  events: readonly MtaCanonicalRecord[];
  occurrences: readonly OperationalOccurrenceRow[];
  coverageGaps: readonly OperationalCoverageGap[];
  relationshipDispositions?: readonly RelationshipDispositionDecision[] | undefined;
}): OperationalEventCompletenessRow[] {
  const occurrencesByEvent = new Map<string, OperationalOccurrenceRow[]>();
  for (const occurrence of input.occurrences) {
    for (const eventId of stringIds(occurrence.provenance?.event_record_ids)) {
      const rows = occurrencesByEvent.get(eventId) ?? [];
      rows.push(occurrence);
      occurrencesByEvent.set(eventId, rows);
    }
  }
  const gapsByEvent = new Map<string, OperationalCoverageGap[]>();
  for (const gap of input.coverageGaps) {
    const rows = gapsByEvent.get(gap.event_record_id) ?? [];
    rows.push(gap);
    gapsByEvent.set(gap.event_record_id, rows);
  }
  const dispositionsByEvent = new Map(
    (input.relationshipDispositions ?? [])
      .filter((decision) => decision.selector === "operational_event")
      .map((decision) => [decision.record_id, decision]),
  );
  const eventsById = new Map(input.events.map((event) => [event.record_id, event]));
  const denominatorIds = operationalEventDenominatorIds(input);
  const missingEventIds = [...denominatorIds].filter((eventId) => !eventsById.has(eventId)).sort();
  if (missingEventIds.length > 0) {
    throw new Error(
      `operational-event completeness denominator references missing canonical event(s): ${missingEventIds.join(", ")}`,
    );
  }

  return [...denominatorIds].sort().flatMap((eventId): OperationalEventCompletenessRow[] => {
    const event = eventsById.get(eventId)!;
    const family = text(event.payload.event_family) ?? "<missing>";
    const gaps = (gapsByEvent.get(event.record_id) ?? [])
      .slice()
      .sort((left, right) => left.gap_id.localeCompare(right.gap_id));
    const occurrences = occurrencesByEvent.get(event.record_id) ?? [];
    const eligibleOccurrenceIds = uniqueSorted(
      occurrences.filter((occurrence) => occurrence.study_projection_eligible).map((occurrence) => occurrence.occurrence_id),
    );
    const ineligibleOccurrenceIds = uniqueSorted(
      occurrences.filter((occurrence) => !occurrence.study_projection_eligible).map((occurrence) => occurrence.occurrence_id),
    );
    const hasNonTerminalGap = gaps.length === 0 ||
      gaps.some((gap) => !legacyTerminalCoverageVerdicts.has(gap.verdict));
    const hasUnreviewedGap = gaps.some((gap) => gap.verdict === "unreviewed");
    const disposition = dispositionsByEvent.get(event.record_id);
    const validProjectableDisposition = Boolean(disposition) &&
      disposition?.study_projectable === true &&
      disposition?.waiver === false &&
      disposition?.primary_disposition === "eligible_occurrence_present" &&
      eligibleOccurrenceIds.length > 0 &&
      stableJson(eligibleOccurrenceIds) === stableJson(disposition?.occurrence_ids ?? []);
    const eligibleOccurrenceProjectableBasis = eligibleOccurrenceIds.length > 0 &&
      occurrences
        .filter((occurrence) => eligibleOccurrenceIds.includes(occurrence.occurrence_id))
        .every((occurrence) =>
          occurrence.study_projection_eligible &&
          occurrence.resolved_status === "realized" &&
          occurrence.review_state === "approved");
    const validNonProjectableDisposition = Boolean(disposition) &&
      disposition?.study_projectable === false &&
      disposition?.waiver === true &&
      eligibleOccurrenceIds.length === 0 &&
      stableJson(disposition?.occurrence_ids ?? []) === stableJson(
        disposition?.primary_disposition === "reviewed_non_projectable_occurrence_excluded"
          ? ineligibleOccurrenceIds
          : [],
      );
    const warningCodes = new Set<RelationshipCompletenessWarningCode>();
    const reasons = new Set<string>();
    let primaryDisposition: OperationalEventCompletenessDisposition;
    if (eligibleOccurrenceIds.length > 0) {
      primaryDisposition = "eligible_occurrence_present";
      reasons.add("eligible_occurrence_present");
      if (disposition && !validProjectableDisposition) {
        warningCodes.add("RC_OPERATIONAL_EVENT_REVIEW_OR_DISPOSITION_REQUIRED");
        reasons.add("projectable_disposition_does_not_match_eligible_occurrence_set");
      }
      if (hasNonTerminalGap && !eligibleOccurrenceProjectableBasis) {
        warningCodes.add("RC_OPERATIONAL_EVENT_OCCURRENCE_COVERAGE_CONFLICT");
        reasons.add("eligible_occurrence_conflicts_with_open_or_nonterminal_coverage_gap");
      } else if (hasNonTerminalGap) {
        reasons.add(validProjectableDisposition
          ? "versioned_projectable_disposition_reconciles_legacy_coverage_gap"
          : "eligible_realized_occurrence_reconciles_event_coverage_without_waiver");
      }
      if (!eligibleOccurrenceProjectableBasis) {
        warningCodes.add("RC_OPERATIONAL_EVENT_REVIEW_OR_DISPOSITION_REQUIRED");
        reasons.add("eligible_occurrence_is_not_a_reviewed_realized_projectable_basis");
      } else if (!disposition) {
        reasons.add("eligible_realized_occurrence_is_projectable_basis_no_waiver");
      }
    } else if (validNonProjectableDisposition) {
      primaryDisposition = "versioned_non_projectable_disposition";
      reasons.add(`versioned_disposition:${disposition?.primary_disposition}`);
      reasons.add("waiver_cannot_confer_study_eligibility");
    } else if (gaps.length > 0 && !hasNonTerminalGap) {
      primaryDisposition = "legacy_terminal_gap_dispositions_only";
      warningCodes.add("RC_OPERATIONAL_EVENT_VERSIONED_DISPOSITION_REQUIRED");
      reasons.add("legacy_terminal_gap_decisions_are_not_a_versioned_non_projectable_disposition");
    } else {
      primaryDisposition = "completeness_review_open";
      warningCodes.add("RC_OPERATIONAL_EVENT_REVIEW_OR_DISPOSITION_REQUIRED");
      reasons.add(gaps.length === 0 ? "coverage_gap_ledger_row_missing" : "coverage_review_not_terminal");
    }
    if (hasUnreviewedGap) reasons.add("unreviewed_coverage_gap_present");
    if (ineligibleOccurrenceIds.length > 0) reasons.add("ineligible_occurrence_present");
    for (const gap of gaps) {
      reasons.add(`gap_dimension:${gap.dimension}`);
      reasons.add(`gap_verdict:${gap.verdict}`);
    }
    return [{
      schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
      selector: "operational_event_family",
      selector_class: "full_denominator_migration",
      event_record_id: event.record_id,
      event_family: family,
      denominator_basis: uniqueSorted([
        ...(family === "implementation" || family === "launch" ? ["operational_event_family"] : []),
        ...(disposition ? ["reviewed_operational_event_decision"] : []),
        ...(eligibleOccurrenceProjectableBasis ? ["eligible_realized_occurrence_event"] : []),
      ]) as OperationalEventCompletenessRow["denominator_basis"],
      primary_disposition: primaryDisposition,
      warning_codes: [...warningCodes].sort((left, right) => left.localeCompare(right)),
      reasons: [...reasons].sort((left, right) => left.localeCompare(right)),
      disposition_decision_id: disposition?.decision_id ?? null,
      study_projectable: eligibleOccurrenceProjectableBasis && (!disposition || validProjectableDisposition),
      eligible_occurrence_ids: eligibleOccurrenceIds,
      ineligible_occurrence_ids: ineligibleOccurrenceIds,
      gap_ids: uniqueSorted(gaps.map((gap) => gap.gap_id)),
      gap_dimensions: uniqueSorted(gaps.map((gap) => gap.dimension)),
      gap_verdicts: uniqueSorted(gaps.map((gap) => gap.verdict)),
    }];
  }).sort((left, right) => left.event_record_id.localeCompare(right.event_record_id));
}

function routePayloadId(record: MtaCanonicalRecord): string | null {
  return text(record.payload.route_id);
}

/** Reconstruct only the GTFS identity surface needed by the repository's canonical route-anchor
 * algorithm. The immutable release projection supplies the exact GTFS ids and aliases; an alias is
 * used as short_name only when it equals a bound canonical record's source-literal route_id. */
function pinnedGtfsRouteIdentities(
  routes: readonly MtaCanonicalRecord[],
  routeAnchors: readonly RouteAnchorRow[],
  review: RouteAnchorReview,
) {
  const routesById = new Map(routes.map((route) => [route.record_id, route]));
  const gtfsRows = routeAnchors.filter((row) => row.gtfs_route_id !== null);
  const ids = gtfsRows.map((row) => row.gtfs_route_id!);
  if (new Set(ids).size !== ids.length) {
    throw new Error("route-identity completeness input has duplicate GTFS route anchor rows");
  }
  if (ids.length !== review.gtfs_feed.route_count) {
    throw new Error(
      `route-identity completeness GTFS denominator drift: review expects ${review.gtfs_feed.route_count}, ` +
      `release projects ${ids.length}`,
    );
  }
  return gtfsRows.map((row) => {
    const boundRouteIds = [row.canonical_route_record_id, ...row.variant_record_ids]
      .flatMap((recordId) => {
        if (!recordId) return [];
        const record = routesById.get(recordId);
        const routeId = record ? routePayloadId(record) : null;
        return routeId ? [routeId] : [];
      });
    const shortName = row.aliases.find((alias) =>
      boundRouteIds.some((routeId) => routeId.toLowerCase() === alias.toLowerCase()));
    return {
      route_id: row.gtfs_route_id!,
      ...(shortName ? { short_name: shortName } : {}),
      gtfs_feed_date: review.gtfs_feed.feed_date,
    };
  });
}

function releaseScopedRouteAnchorReview(
  review: RouteAnchorReview,
  routes: readonly MtaCanonicalRecord[],
): RouteAnchorReview {
  const routeIds = new Set(routes.map((route) => route.record_id));
  const nonGtfsDispositions = Object.fromEntries(
    Object.entries(review.non_gtfs_dispositions)
      .filter(([recordId]) => routeIds.has(recordId))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const overrides = Object.fromEntries(
    Object.entries(review.overrides).flatMap(([gtfsRouteId, override]) => {
      const referencedRecordIds = uniqueSorted([
        ...(override.canonical_route_record_id ? [override.canonical_route_record_id] : []),
        ...override.additional_variant_record_ids,
        ...Object.keys(override.expected_route_ids),
      ]);
      const presentRecordIds = referencedRecordIds.filter((recordId) => routeIds.has(recordId));
      if (presentRecordIds.length === 0) return [];
      if (presentRecordIds.length !== referencedRecordIds.length) {
        throw new Error(
          `Release-scoped route review has a partially present override ${gtfsRouteId}: ` +
            `${presentRecordIds.length}/${referencedRecordIds.length} reviewed records are in the release`,
        );
      }
      return [[gtfsRouteId, override] as const];
    }),
  );
  return {
    ...review,
    overrides,
    non_gtfs_dispositions: nonGtfsDispositions,
  };
}

function auditRouteIdentities(input: BuildRelationshipCompletenessAuditInput): RouteIdentityCompletenessRow[] {
  const routes = [...input.routes].sort((left, right) => left.record_id.localeCompare(right.record_id));
  if (routes.some((route) => route.record_kind !== "route")) {
    throw new Error("route-identity completeness denominator contains a non-route canonical record");
  }
  if (new Set(routes.map((route) => route.record_id)).size !== routes.length) {
    throw new Error("route-identity completeness denominator contains duplicate canonical record ids");
  }
  const routeReview = input.releaseScopedRouteReview
    ? releaseScopedRouteAnchorReview(input.routeAnchorReview, routes)
    : input.routeAnchorReview;
  const projected = computeRouteAnchors(
    routes,
    pinnedGtfsRouteIdentities(routes, input.routeAnchors, routeReview),
    routeReview.overrides,
    routeReview.non_gtfs_dispositions,
  );
  const recordsById = new Map(routes.map((route) => [route.record_id, route]));
  const rowsByRecordId = new Map<string, RouteIdentityCompletenessRow>();
  const add = (
    recordId: string,
    anchor: RouteAnchorRow,
    primaryDisposition: "canonical_gtfs_anchor" | "canonical_gtfs_variant" | "reviewed_non_projectable_disposition",
  ) => {
    if (rowsByRecordId.has(recordId)) {
      throw new Error(`route-identity completeness accounting is non-exclusive for ${recordId}`);
    }
    const record = recordsById.get(recordId);
    if (!record) throw new Error(`route-identity completeness projection references missing route ${recordId}`);
    const warningCodes = new Set<RelationshipCompletenessWarningCode>();
    const reasons = new Set<string>();
    const disposition = routeReview.non_gtfs_dispositions[recordId];
    const evidenceIds = uniqueSorted(
      record.evidence_refs.map((ref) => ref.evidence_id).filter((id): id is string => Boolean(id)),
    );
    if (evidenceIds.length === 0) warningCodes.add("RC_ROUTE_IDENTITY_EVIDENCE_MISSING");
    if (primaryDisposition === "reviewed_non_projectable_disposition") {
      if (!disposition || anchor.gtfs_route_id !== null) {
        warningCodes.add("RC_ROUTE_IDENTITY_ACCOUNTING_REQUIRED");
      } else {
        reasons.add(`reviewed_typed_non_projectable:${disposition.disposition}`);
        if (disposition.evidence_ids.some((evidenceId) => !evidenceIds.includes(evidenceId))) {
          warningCodes.add("RC_ROUTE_IDENTITY_EVIDENCE_MISSING");
        }
      }
    } else {
      if (!anchor.gtfs_route_id || disposition) warningCodes.add("RC_ROUTE_IDENTITY_ACCOUNTING_REQUIRED");
      reasons.add(primaryDisposition === "canonical_gtfs_anchor"
        ? "canonical_gtfs_backed_route_anchor"
        : "canonical_gtfs_backed_route_variant");
    }
    rowsByRecordId.set(recordId, {
      schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
      selector: "route_identity",
      selector_class: "reviewed_full_denominator",
      route_record_id: recordId,
      primary_disposition: primaryDisposition,
      warning_codes: [...warningCodes].sort((left, right) => left.localeCompare(right)),
      reasons: [...reasons].sort((left, right) => left.localeCompare(right)),
      study_projectable: primaryDisposition !== "reviewed_non_projectable_disposition",
      gtfs_route_id: anchor.gtfs_route_id,
      route_anchor_disposition: anchor.disposition,
      disposition_decision_id: disposition?.decision_id ?? null,
      reviewed_non_projectable_disposition: disposition?.disposition ?? null,
      disposition_evidence_ids: disposition ? [...disposition.evidence_ids].sort() : [],
      disposition_reviewed_at: disposition?.reviewed_at ?? null,
      disposition_reason: disposition?.reason ?? null,
    });
  };

  for (const anchor of projected) {
    if (anchor.canonical_route_record_id) {
      add(
        anchor.canonical_route_record_id,
        anchor,
        anchor.gtfs_route_id ? "canonical_gtfs_anchor" : "reviewed_non_projectable_disposition",
      );
    }
    for (const recordId of anchor.variant_record_ids) add(recordId, anchor, "canonical_gtfs_variant");
  }
  for (const route of routes) {
    if (rowsByRecordId.has(route.record_id)) continue;
    rowsByRecordId.set(route.record_id, {
      schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
      selector: "route_identity",
      selector_class: "reviewed_full_denominator",
      route_record_id: route.record_id,
      primary_disposition: "route_identity_review_required",
      warning_codes: ["RC_ROUTE_IDENTITY_ACCOUNTING_REQUIRED"],
      reasons: ["canonical_route_has_no_gtfs_anchor_or_reviewed_typed_disposition"],
      study_projectable: false,
      gtfs_route_id: null,
      route_anchor_disposition: null,
      disposition_decision_id: null,
      reviewed_non_projectable_disposition: null,
      disposition_evidence_ids: [],
      disposition_reviewed_at: null,
      disposition_reason: null,
    });
  }
  return [...rowsByRecordId.values()].sort((left, right) =>
    left.route_record_id.localeCompare(right.route_record_id));
}

function warningCounts(
  occurrenceRows: readonly OccurrenceCompletenessRow[],
  treatmentRows: readonly OccurrenceTreatmentPhysicalityCompletenessRow[],
  busLaneTreatmentRows: readonly BusLaneTreatmentCompletenessRow[],
  eventRows: readonly OperationalEventCompletenessRow[],
  routeRows: readonly RouteIdentityCompletenessRow[],
): Record<RelationshipCompletenessWarningCode, number> {
  const counts = Object.fromEntries(
    RELATIONSHIP_COMPLETENESS_WARNING_DEFINITIONS.map((definition) => [definition.code, 0]),
  ) as Record<RelationshipCompletenessWarningCode, number>;
  for (const row of [...occurrenceRows, ...treatmentRows, ...busLaneTreatmentRows, ...eventRows, ...routeRows]) {
    for (const code of row.warning_codes) counts[code] += 1;
  }
  return counts;
}

function physicalityCompletenessRows(
  audit: OccurrenceTreatmentPhysicalityAudit,
): OccurrenceTreatmentPhysicalityCompletenessRow[] {
  return audit.treatmentRows.map((row) => ({
    schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
    selector: "eligible_occurrence_treatment_physicality",
    selector_class: "reviewed_full_denominator",
    treatment_record_id: row.treatment_record_id,
    treatment_family: row.treatment_family,
    treatment_kind: row.treatment_kind,
    occurrence_ids: [...row.occurrence_ids],
    classification: row.classification,
    scope_requirement: row.scope_requirement,
    primary_disposition: row.primary_disposition,
    warning_codes: row.warning_codes.length > 0 || row.primary_disposition === "review_required"
      ? ["RC_TREATMENT_PHYSICALITY_REVIEW_REQUIRED"]
      : [],
    reasons: uniqueSorted([
      `classification:${row.classification}`,
      `scope_requirement:${row.scope_requirement}`,
      ...(row.decision_id ? [`immutable_decision:${row.decision_id}`] : []),
      ...row.warning_codes.map((code) => `physicality_finding:${code}`),
      "physicality_decision_does_not_create_study_eligibility",
    ]),
    physicality_finding_codes: [...row.warning_codes],
    decision_id: row.decision_id,
    evidence_ids: [...row.evidence_ids],
    study_projectable: false,
  }));
}

const busLaneScopeDispositions = new Set<BusLaneTreatmentScopeDisposition>([
  "physical_scope_satisfied",
  "non_physical_enforcement_or_control",
  "non_lane_supporting_feature",
  "aggregate_or_unbounded_treatment",
  "reviewed_non_projectable_physical_scope_unproven",
]);

function busLaneInventoryFallback(
  treatments: readonly MtaCanonicalRecord[],
): BusLaneTreatmentScopeInventoryDecision[] {
  return treatments
    .filter((treatment) => text(treatment.payload.treatment_family) === "bus_lane")
    .sort((left, right) => left.record_id.localeCompare(right.record_id))
    .map((treatment) => ({
      schema_version: 1,
      contract_id: "bus-lane-treatment-physical-scope-v1",
      decision_id: `unreviewed:${treatment.record_id}`,
      treatment_id: treatment.record_id,
      treatment_family: "bus_lane",
      treatment_kind: text(treatment.payload.treatment_kind) ?? "<missing>",
      canonical_status: "materialized",
      exclusive_decision: "reviewed_non_projectable_physical_scope_unproven",
      physical_scope_requirement_satisfied: false,
      evidence_refs: treatment.evidence_refs.map((ref) => ({
        source_id: ref.source_id,
        ...(ref.evidence_id ? { evidence_id: ref.evidence_id } : {}),
      })),
      scope_bindings: [],
      source_ids: uniqueSorted(treatment.evidence_refs.map((ref) => ref.source_id)),
      study_eligible: false,
      study_eligibility_effect: "unreviewed_inventory_fallback",
      reason: "No immutable bus-lane treatment scope inventory was supplied to the completeness audit.",
    }));
}

function busLaneTreatmentCompletenessRows(
  input: BuildRelationshipCompletenessAuditInput,
): BusLaneTreatmentCompletenessRow[] {
  const inventory = input.busLaneTreatmentScope?.decisions ?? busLaneInventoryFallback(input.treatments);
  const inventoryIdCounts = countStrings(inventory.map((decision) => decision.treatment_id));
  const inventoryDecisionIdCounts = countStrings(inventory.map((decision) => decision.decision_id));
  const dispositionRows = (input.relationshipDispositions ?? [])
    .filter((decision) => decision.selector === "bus_lane_family_treatment");
  const dispositionCounts = countStrings(dispositionRows.map((decision) => decision.record_id));
  const dispositionsByTreatmentId = new Map(
    dispositionRows.map((decision) => [decision.record_id, decision]),
  );
  const treatmentsById = new Map(input.treatments.map((treatment) => [treatment.record_id, treatment]));
  const corridorsById = new Map(input.corridors.map((corridor) => [corridor.record_id, corridor]));
  const relationsById = new Map(input.relations.map((relation) => [relation.record_id, relation]));
  const explicitInventory = Boolean(input.busLaneTreatmentScope);

  const rows = [...new Map(inventory.map((decision) => [decision.treatment_id, decision])).values()]
    .sort((left, right) => left.treatment_id.localeCompare(right.treatment_id))
    .map((decision): BusLaneTreatmentCompletenessRow => {
      const warnings = new Set<RelationshipCompletenessWarningCode>();
      const reasons = new Set<string>();
      const disposition = dispositionsByTreatmentId.get(decision.treatment_id);
      const treatment = treatmentsById.get(decision.treatment_id);
      const decisionEvidenceIds = uniqueSorted(
        decision.evidence_refs.map((ref) => ref.evidence_id).filter((id): id is string => Boolean(id)),
      );
      const canonicalEvidenceIds = new Set(
        treatment?.evidence_refs.map((ref) => ref.evidence_id).filter((id): id is string => Boolean(id)) ?? [],
      );
      const scopeRecordIds = uniqueSorted(decision.scope_bindings.map((binding) => binding.corridor_id));
      const scopeRelationIds = uniqueSorted(decision.scope_bindings.map((binding) => binding.relation_id));

      if (
        !explicitInventory ||
        inventoryIdCounts[decision.treatment_id] !== 1 ||
        inventoryDecisionIdCounts[decision.decision_id] !== 1 ||
        dispositionCounts[decision.treatment_id] !== 1 ||
        decision.schema_version !== 1 ||
        decision.contract_id !== "bus-lane-treatment-physical-scope-v1" ||
        decision.treatment_family !== "bus_lane" ||
        !busLaneScopeDispositions.has(decision.exclusive_decision) ||
        (decision.canonical_status === "materialized" && (!treatment || treatment.record_kind !== "treatment_component"))
      ) {
        warnings.add("RC_BUS_LANE_TREATMENT_SELECTOR_ACCOUNTING_REQUIRED");
      }

      const dispositionEvidenceMatches = Boolean(disposition) &&
        stableJson(uniqueSorted(disposition?.evidence_ids ?? []) as unknown as JsonValue) ===
          stableJson(decisionEvidenceIds as unknown as JsonValue);
      const exactCanonicalEvidence = decision.canonical_status === "accepted_pending_addition"
        ? decisionEvidenceIds.length > 0
        : decisionEvidenceIds.length > 0 && decisionEvidenceIds.every((evidenceId) => canonicalEvidenceIds.has(evidenceId));
      if (!dispositionEvidenceMatches || !exactCanonicalEvidence) {
        warnings.add("RC_BUS_LANE_TREATMENT_EVIDENCE_MISSING");
      }

      const physicalScopeSatisfied = decision.exclusive_decision === "physical_scope_satisfied";
      let validScopeOrDisposition = Boolean(disposition) &&
        disposition?.primary_disposition === decision.exclusive_decision &&
        disposition?.study_projectable === false &&
        disposition?.occurrence_ids.length === 0;
      if (physicalScopeSatisfied) {
        validScopeOrDisposition &&= decision.physical_scope_requirement_satisfied === true &&
          decision.scope_bindings.length > 0 &&
          disposition?.waiver === false &&
          disposition?.required_roles_satisfied.includes("physical_scope") === true &&
          disposition?.required_roles_missing.length === 0;
        for (const binding of decision.scope_bindings) {
          const corridor = corridorsById.get(binding.corridor_id);
          const relation = relationsById.get(binding.relation_id);
          const bindingEvidenceIds = uniqueSorted(
            binding.evidence_refs.map((ref) => ref.evidence_id).filter((id): id is string => Boolean(id)),
          );
          if (bindingEvidenceIds.length === 0 || !disposition?.related_record_ids.includes(binding.corridor_id) ||
            !disposition?.related_record_ids.includes(binding.relation_id)) {
            validScopeOrDisposition = false;
          }
          if (corridor && corridor.record_kind !== "corridor") validScopeOrDisposition = false;
          if (relation) {
            const subjectId = text(relation.payload.subject_id);
            const objectId = text(relation.payload.object_id);
            const endpointIds = new Set([subjectId, objectId].filter((id): id is string => Boolean(id)));
            const relationEvidenceIds = new Set(
              relation.evidence_refs.map((ref) => ref.evidence_id).filter((id): id is string => Boolean(id)),
            );
            if (
              relation.record_kind !== "relation" ||
              !endpointIds.has(decision.treatment_id) ||
              !endpointIds.has(binding.corridor_id) ||
              text(relation.payload.relation_kind) !== binding.relation_kind ||
              !bindingEvidenceIds.every((evidenceId) => relationEvidenceIds.has(evidenceId))
            ) {
              validScopeOrDisposition = false;
            }
          } else {
            reasons.add("scope_relation_is_in_pinned_post_release_remediation");
          }
          if (!corridor) reasons.add("scope_corridor_is_in_pinned_post_release_remediation");
        }
        reasons.add("canonical_physical_scope_required");
      } else {
        validScopeOrDisposition &&= decision.physical_scope_requirement_satisfied === false &&
          decision.study_eligible === false &&
          disposition?.waiver === true &&
          disposition?.required_roles_satisfied.includes("typed_non_projectable_disposition") === true &&
          disposition?.required_roles_missing.includes("physical_scope") === true;
        reasons.add("evidence_bound_reviewed_nonprojectable_physical_scope_disposition");
        reasons.add("waiver_cannot_confer_study_eligibility");
      }
      if (!validScopeOrDisposition) {
        warnings.add("RC_BUS_LANE_TREATMENT_SCOPE_OR_DISPOSITION_REQUIRED");
      }
      if (decision.canonical_status === "accepted_pending_addition") {
        reasons.add("accepted_pending_addition_in_pinned_remediation_journal");
      }
      reasons.add(`immutable_inventory_decision:${decision.decision_id}`);
      if (disposition) reasons.add(`relationship_disposition:${disposition.decision_id}`);

      return {
        schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
        selector: "bus_lane_family_treatment",
        selector_class: "reviewed_full_denominator",
        treatment_record_id: decision.treatment_id,
        treatment_family: "bus_lane",
        treatment_kind: decision.treatment_kind,
        canonical_status: decision.canonical_status,
        primary_disposition: warnings.size > 0 ? "review_required" : decision.exclusive_decision,
        physical_scope_satisfied: physicalScopeSatisfied,
        physical_scope_record_ids: scopeRecordIds,
        physical_scope_relation_record_ids: scopeRelationIds,
        disposition_decision_id: disposition?.decision_id ?? null,
        evidence_ids: decisionEvidenceIds,
        warning_codes: [...warnings].sort((left, right) => left.localeCompare(right)),
        reasons: [...reasons].sort((left, right) => left.localeCompare(right)),
        study_projectable: false,
        waiver: disposition?.waiver ?? false,
      };
    });

  const inventoryIds = new Set(inventory.map((decision) => decision.treatment_id));
  for (const disposition of dispositionRows
    .filter((decision) => !inventoryIds.has(decision.record_id))
    .sort((left, right) => left.record_id.localeCompare(right.record_id))) {
    rows.push({
      schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
      selector: "bus_lane_family_treatment",
      selector_class: "reviewed_full_denominator",
      treatment_record_id: disposition.record_id,
      treatment_family: "bus_lane",
      treatment_kind: text(treatmentsById.get(disposition.record_id)?.payload.treatment_kind) ?? "<missing>",
      canonical_status: "materialized",
      primary_disposition: "review_required",
      physical_scope_satisfied: false,
      physical_scope_record_ids: [],
      physical_scope_relation_record_ids: [],
      disposition_decision_id: disposition.decision_id,
      evidence_ids: [...disposition.evidence_ids],
      warning_codes: ["RC_BUS_LANE_TREATMENT_SELECTOR_ACCOUNTING_REQUIRED"],
      reasons: ["relationship_disposition_target_is_absent_from_immutable_bus_lane_inventory"],
      study_projectable: false,
      waiver: disposition.waiver,
    });
  }
  return rows.sort((left, right) => left.treatment_record_id.localeCompare(right.treatment_record_id));
}

const DEFAULT_RELATIONSHIP_COMPLETENESS_REPRODUCTION_COMMAND =
  "bun -e 'import { writeRelationshipCompletenessArtifacts as write } from \"./packages/pipeline/src/quality/relationship-completeness.ts\"; write()'";
const REVIEWED_CURRENT_CORPUS_MIGRATION_REPRODUCTION_COMMAND =
  "bun packages/cli/src/cli.ts relationship-completeness --reviewed-current-corpus-migration --no-sync-db";

function markdownReport(
  summary: RelationshipCompletenessSummary,
  reproductionCommand = DEFAULT_RELATIONSHIP_COMPLETENESS_REPRODUCTION_COMMAND,
): string {
  const occurrence = summary.occurrences;
  const treatment = summary.occurrence_treatment_physicality;
  const busLanes = summary.bus_lane_treatments;
  const events = summary.operational_events;
  const routes = summary.route_identities;
  const warnings = RELATIONSHIP_COMPLETENESS_WARNING_DEFINITIONS
    .map((definition) =>
      `| \`${definition.code}\` | ${definition.selector_class} | ${summary.warning_instances_by_code[definition.code]} |`)
    .join("\n");
  return `# Relationship completeness audit\n\n` +
    `Schema version: ${summary.schema_version}. Mode: **${summary.mode}**. Release: **${summary.release_id}**.\n\n` +
    `This report uses the immutable occurrence-treatment physicality policy and exact per-treatment review ledger. ` +
    `Family names and location literals are not physicality evidence, and a nonphysical decision is neither a waiver nor a source of study eligibility. ` +
    `No generic all-record non-projectable coverage is claimed: project, corridor, entity, claim, metric, and source ` +
    `classes remain outside the reviewed route/event/treatment full-denominator selectors.\n\n` +
    `## Eligible operational occurrences\n\n` +
    `- Release rows: ${occurrence.release_occurrence_count}; eligible: ${occurrence.eligible_occurrence_count}.\n` +
    `- Core identity/route/treatment/onset role failures: ${occurrence.core_role_warning_occurrence_count} occurrence(s).\n` +
    `- All enforcement-candidate contract-role failures: ${occurrence.contract_warning_occurrence_count} occurrence(s).\n` +
    `- Phase/schema migration warnings: ${occurrence.schema_migration_warning_occurrence_count} occurrence(s).\n` +
    `- Physical scope required: ${occurrence.physical_scope_required_occurrence_count}; not applicable: ` +
    `${occurrence.physical_scope_not_applicable_occurrence_count}; physicality review required: ` +
    `${occurrence.physicality_review_required_occurrence_count}.\n` +
    `- Eligible event identities inside the implementation/launch denominator: ` +
    `${occurrence.eligible_event_ids_in_operational_denominator}; outside: ` +
    `${occurrence.eligible_event_ids_outside_operational_denominator}.\n\n` +
    `## Eligible-occurrence treatment physicality denominator\n\n` +
    `- Exact treatment records: ${treatment.denominator_count}; occurrence memberships: ` +
    `${treatment.occurrence_membership_count}; policy rules: ${treatment.policy_rule_count}.\n` +
    `- Classifications: ${stableJson(treatment.classification_counts as unknown as JsonValue)}.\n` +
    `- Scope requirements: ${stableJson(treatment.scope_requirement_counts as unknown as JsonValue)}.\n` +
    `- Treatment review warnings: ${summary.warning_instances_by_code.RC_TREATMENT_PHYSICALITY_REVIEW_REQUIRED}.\n` +
    `- Immutable ledger complete: ${treatment.review_ledger_complete}; physical scope complete: ` +
    `${treatment.physical_scope_complete}; final release guard: ` +
    `${treatment.final_post_semantic_release_guard_status}.\n\n` +
    `## Full bus-lane treatment physical-scope denominator\n\n` +
    `- Immutable inventory rows: ${busLanes.denominator_count}; audited selector rows: ` +
    `${busLanes.audited_treatment_count}; omitted: ${busLanes.omitted_treatment_count}.\n` +
    `- Canonically materialized treatments: ${busLanes.materialized_treatment_count}; accepted pending addition: ` +
    `${busLanes.accepted_pending_addition_count}.\n` +
    `- Canonical physical scope satisfied: ${busLanes.physical_scope_satisfied_count}; evidence-bound reviewed ` +
    `non-projectable dispositions: ${busLanes.reviewed_non_projectable_count}.\n` +
    `- Exact evidence bound: ${busLanes.exact_evidence_bound_count}; warning rows: ` +
    `${busLanes.warning_treatment_count}; review complete: ${busLanes.review_complete}.\n\n` +
    `## Full operational-event denominator\n\n` +
    `- Operational-family events: ${events.denominator_count}.\n` +
    `- Primary dispositions: eligible occurrence present ` +
    `${events.counts_by_primary_disposition.eligible_occurrence_present}; legacy terminal gaps only ` +
    `${events.counts_by_primary_disposition.legacy_terminal_gap_dispositions_only}; open review ` +
    `${events.counts_by_primary_disposition.completeness_review_open}; versioned non-projectable ` +
    `${events.counts_by_primary_disposition.versioned_non_projectable_disposition}.\n` +
    `- Gap rows: ${events.coverage_gap_row_count}; events with an unreviewed gap: ` +
    `${events.events_with_unreviewed_gap_count}.\n` +
    `- Eligible occurrence/coverage conflicts: ${events.eligible_occurrence_coverage_conflict_count}.\n\n` +
    `## Canonical route-identity denominator\n\n` +
    `- Canonical routes: ${routes.denominator_count}; audited exactly once: ${routes.audited_route_count}.\n` +
    `- GTFS-backed route records: ${routes.gtfs_bound_route_record_count}; reviewed typed non-projectable ` +
    `${routes.reviewed_non_projectable_route_record_count}.\n` +
    `- Route identity accounting warnings: ${summary.warning_instances_by_code.RC_ROUTE_IDENTITY_ACCOUNTING_REQUIRED}; ` +
    `evidence warnings: ${summary.warning_instances_by_code.RC_ROUTE_IDENTITY_EVIDENCE_MISSING}.\n\n` +
    `## Warning codes\n\n` +
    `| Code | Selector class | Instances |\n|---|---:|---:|\n${warnings}\n\n` +
    `## Enforcement migration\n\n` +
    `- Core eligible occurrence roles ready: ${summary.enforcement_migration.eligible_occurrence_core_roles_ready}.\n` +
    `- Phase contract ready: ${summary.enforcement_migration.phase_contract_ready}.\n` +
    `- Physical-scope contract ready: ${summary.enforcement_migration.physical_scope_contract_ready}.\n` +
    `- Treatment physicality contract ready: ${summary.enforcement_migration.treatment_physicality_contract_ready}.\n` +
    `- Treatment physicality final-release guard ready: ` +
    `${summary.enforcement_migration.treatment_physicality_final_release_guard_ready}.\n` +
    `- Full bus-lane treatment completeness ready: ` +
    `${summary.enforcement_migration.bus_lane_treatment_completeness_ready}.\n` +
    `- Full operational-event completeness ready: ${summary.enforcement_migration.operational_event_completeness_ready}.\n` +
    `- Canonical route-identity completeness ready: ${summary.enforcement_migration.route_identity_completeness_ready}.\n` +
    `- Hard mode ready: ${summary.enforcement_migration.hard_mode_ready}.\n\n` +
    `Reproduce from the repository root:\n\n` +
    "```bash\n" +
    `${reproductionCommand}\n` +
    "```\n";
}

export function buildRelationshipCompletenessAudit(
  input: BuildRelationshipCompletenessAuditInput,
): RelationshipCompletenessArtifactBuild {
  const operationalEventIds = operationalEventDenominatorIds(input);
  const defaultPhysicalityReview = input.treatmentPhysicality
    ? null
    : buildOccurrenceTreatmentPhysicalityReview({
      occurrences: input.occurrences,
      treatments: input.treatments,
      policy: OCCURRENCE_TREATMENT_PHYSICALITY_POLICY_V1,
    });
  const treatmentPhysicality = input.treatmentPhysicality ?? {
    policy: OCCURRENCE_TREATMENT_PHYSICALITY_POLICY_V1,
    decisions: defaultPhysicalityReview!.decisions,
    contract_status: "warning_first" as const,
    final_post_semantic_release_guard_status: "pending" as const,
    inputPins: [],
  };
  const physicalityAudit = auditOccurrenceTreatmentPhysicality({
    occurrences: input.occurrences,
    treatments: input.treatments,
    relations: input.relations,
    corridors: input.corridors,
    decisions: treatmentPhysicality.decisions,
    policy: treatmentPhysicality.policy,
  });
  const physicalityRowsByOccurrence = new Map(
    physicalityAudit.occurrenceRows.map((row) => [row.occurrence_id, row]),
  );
  const occurrenceRows = auditOccurrences(
    input.occurrences,
    operationalEventIds,
    physicalityRowsByOccurrence,
  );
  const treatmentRows = physicalityCompletenessRows(physicalityAudit);
  const busLaneTreatmentRows = busLaneTreatmentCompletenessRows(input);
  const eventRows = auditOperationalEvents(input);
  const routeRows = auditRouteIdentities(input);
  const rawPins = [
    ...(input.inputPins ?? []),
    ...(treatmentPhysicality.inputPins ?? []),
    ...(input.busLaneTreatmentScope?.inputPins ?? []),
  ].map((pin) => ({ ...pin }));
  const pinsByPath = new Map<string, RelationshipCompletenessInputPin>();
  for (const pin of rawPins) {
    const existing = pinsByPath.get(pin.path);
    if (existing && stableJson(existing as unknown as JsonValue) !== stableJson(pin as unknown as JsonValue)) {
      throw new Error(`relationship completeness input ${pin.path} has conflicting immutable pins`);
    }
    pinsByPath.set(pin.path, pin);
  }
  const pins = [...pinsByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
  const inputFingerprint = sha256(stableJson({
    schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
    release_id: input.releaseId,
    input_pins: pins,
  }));
  const warnings = warningCounts(occurrenceRows, treatmentRows, busLaneTreatmentRows, eventRows, routeRows);
  const eligibleOccurrences = input.occurrences.filter((occurrence) => occurrence.study_projection_eligible);
  const eligibleEventIds = new Set(
    eligibleOccurrences.flatMap((occurrence) => stringIds(occurrence.provenance?.event_record_ids)),
  );
  const occurrencePrimaryKeys: readonly OccurrenceCompletenessDisposition[] = [
    "contract_roles_incomplete",
    "contract_roles_complete_migration_required",
    "contract_roles_complete",
  ];
  const treatmentPrimaryKeys:
    readonly OccurrenceTreatmentPhysicalityTreatmentAuditRow["primary_disposition"][] = [
      "reviewed_physical_corridor_or_segment",
      "reviewed_nonphysical",
      "reviewed_point_or_stop_physical",
      "review_required",
    ];
  const busLanePrimaryKeys: readonly (BusLaneTreatmentScopeDisposition | "review_required")[] = [
    "physical_scope_satisfied",
    "non_physical_enforcement_or_control",
    "non_lane_supporting_feature",
    "aggregate_or_unbounded_treatment",
    "reviewed_non_projectable_physical_scope_unproven",
    "review_required",
  ];
  const physicalityOccurrencePrimaryKeys:
    readonly OccurrenceTreatmentPhysicalityOccurrenceAuditRow["primary_disposition"][] = [
      "physical_scope_satisfied",
      "physical_scope_missing",
      "physical_scope_relation_missing",
      "physical_scope_evidence_missing",
      "physical_scope_relation_invalid",
      "physicality_review_required",
      "physical_scope_not_applicable",
  ];
  const eventPrimaryKeys: readonly OperationalEventCompletenessDisposition[] = [
    "eligible_occurrence_present",
    "legacy_terminal_gap_dispositions_only",
    "completeness_review_open",
    "versioned_non_projectable_disposition",
  ];
  const routePrimaryKeys: readonly RouteIdentityCompletenessDisposition[] = [
    "canonical_gtfs_anchor",
    "canonical_gtfs_variant",
    "reviewed_non_projectable_disposition",
    "route_identity_review_required",
  ];
  const summary: RelationshipCompletenessSummary = {
    schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
    mode: "warning",
    release_id: input.releaseId,
    input_fingerprint: inputFingerprint,
    input_pins: pins,
    selector_contract: {
      enforceable_selector: "eligible_operational_occurrence_contract_roles",
      treatment_physicality_selector: "all_treatment_members_of_eligible_operational_occurrences",
      bus_lane_treatment_selector: "immutable_bus_lane_treatment_physical_scope_inventory",
      full_denominator_selector: "reviewed_operational_events_union_eligible_realized_occurrence_events",
      route_identity_selector: "all_canonical_route_records",
      non_projectable_scope:
        "reviewed_route_identity_and_operational_event_selectors_only_physicality_decisions_are_not_waivers",
      caveat:
        "Treatment physicality decisions determine whether physical scope is required or not applicable; they never create study eligibility or waive another role. " +
        "No generic all-record non-projectable completeness selector is implemented or claimed; project, corridor, entity, claim, metric, and source classes remain outside these reviewed full denominators.",
    },
    warning_definitions: RELATIONSHIP_COMPLETENESS_WARNING_DEFINITIONS.map((definition) => ({ ...definition })),
    occurrences: {
      release_occurrence_count: input.occurrences.length,
      eligible_occurrence_count: eligibleOccurrences.length,
      audited_occurrence_count: occurrenceRows.length,
      counts_by_primary_disposition: countBy(occurrenceRows.map((row) => row.primary_disposition), occurrencePrimaryKeys),
      core_role_warning_occurrence_count: occurrenceRows.filter((row) =>
        row.warning_codes.some((code) => occurrenceCoreRoleCodes.has(code))).length,
      contract_warning_occurrence_count: occurrenceRows.filter((row) =>
        row.warning_codes.some((code) => occurrenceEnforcementCandidateCodes.has(code))).length,
      schema_migration_warning_occurrence_count: occurrenceRows.filter((row) =>
        row.warning_codes.some((code) => !occurrenceEnforcementCandidateCodes.has(code))).length,
      physical_scope_required_occurrence_count: occurrenceRows.filter((row) =>
        row.physical_scope_requirement === "corridor_or_segment_required" ||
        row.physical_scope_requirement === "point_or_stop_required").length,
      physical_scope_not_applicable_occurrence_count: occurrenceRows.filter((row) =>
        row.physical_scope_requirement === "not_applicable").length,
      physicality_review_required_occurrence_count: occurrenceRows.filter((row) =>
        row.physical_scope_requirement === "review_required").length,
      eligible_event_ids_in_operational_denominator: [...eligibleEventIds].filter((eventId) =>
        operationalEventIds.has(eventId)).length,
      eligible_event_ids_outside_operational_denominator: [...eligibleEventIds].filter((eventId) =>
        !operationalEventIds.has(eventId)).length,
    },
    occurrence_treatment_physicality: {
      denominator_count: treatmentRows.length,
      occurrence_membership_count: physicalityAudit.summary.treatment_membership_count,
      classification_counts: physicalityAudit.summary.classification_counts,
      scope_requirement_counts: physicalityAudit.summary.scope_requirement_counts,
      counts_by_primary_disposition: countBy(treatmentRows.map((row) => row.primary_disposition), treatmentPrimaryKeys),
      occurrence_scope_disposition_counts: countBy(
        physicalityAudit.occurrenceRows.map((row) => row.primary_disposition),
        physicalityOccurrencePrimaryKeys,
      ),
      finding_counts: physicalityAudit.summary.finding_counts,
      policy_rule_count: treatmentPhysicality.policy.rules.length,
      review_ledger_row_count: treatmentPhysicality.decisions.length,
      contract_status: treatmentPhysicality.contract_status,
      final_post_semantic_release_guard_status:
        treatmentPhysicality.final_post_semantic_release_guard_status,
      review_ledger_complete: physicalityAudit.summary.review_ledger_complete,
      physical_scope_complete: physicalityAudit.summary.physical_scope_complete,
    },
    bus_lane_treatments: {
      denominator_count: input.busLaneTreatmentScope?.decisions.length ??
        input.treatments.filter((treatment) => text(treatment.payload.treatment_family) === "bus_lane").length,
      audited_treatment_count: busLaneTreatmentRows.length,
      materialized_treatment_count: busLaneTreatmentRows.filter((row) => row.canonical_status === "materialized").length,
      accepted_pending_addition_count: busLaneTreatmentRows.filter((row) =>
        row.canonical_status === "accepted_pending_addition").length,
      counts_by_primary_disposition: countBy(
        busLaneTreatmentRows.map((row) => row.primary_disposition),
        busLanePrimaryKeys,
      ),
      physical_scope_satisfied_count: busLaneTreatmentRows.filter((row) =>
        row.primary_disposition === "physical_scope_satisfied").length,
      reviewed_non_projectable_count: busLaneTreatmentRows.filter((row) =>
        row.primary_disposition !== "physical_scope_satisfied" && row.primary_disposition !== "review_required").length,
      exact_evidence_bound_count: busLaneTreatmentRows.filter((row) =>
        !row.warning_codes.includes("RC_BUS_LANE_TREATMENT_EVIDENCE_MISSING")).length,
      omitted_treatment_count: Math.max(
        0,
        (input.busLaneTreatmentScope?.decisions.length ??
          input.treatments.filter((treatment) => text(treatment.payload.treatment_family) === "bus_lane").length) -
          busLaneTreatmentRows.length,
      ),
      warning_treatment_count: busLaneTreatmentRows.filter((row) => row.warning_codes.length > 0).length,
      review_complete:
        busLaneTreatmentRows.length === (input.busLaneTreatmentScope?.decisions.length ??
          input.treatments.filter((treatment) => text(treatment.payload.treatment_family) === "bus_lane").length) &&
        busLaneTreatmentRows.every((row) => row.warning_codes.length === 0),
    },
    operational_events: {
      denominator_count: eventRows.length,
      counts_by_primary_disposition: countBy(eventRows.map((row) => row.primary_disposition), eventPrimaryKeys),
      coverage_gap_row_count: input.coverageGaps.filter((gap) => operationalEventIds.has(gap.event_record_id)).length,
      coverage_gap_counts_by_verdict: countStrings(
        input.coverageGaps.filter((gap) => operationalEventIds.has(gap.event_record_id)).map((gap) => gap.verdict),
      ),
      events_with_unreviewed_gap_count: eventRows.filter((row) =>
        row.reasons.includes("unreviewed_coverage_gap_present")).length,
      eligible_occurrence_coverage_conflict_count: eventRows.filter((row) =>
        row.warning_codes.includes("RC_OPERATIONAL_EVENT_OCCURRENCE_COVERAGE_CONFLICT")).length,
      ineligible_occurrence_event_count: eventRows.filter((row) => row.ineligible_occurrence_ids.length > 0).length,
    },
    route_identities: {
      denominator_count: input.routes.length,
      audited_route_count: routeRows.length,
      counts_by_primary_disposition: countBy(routeRows.map((row) => row.primary_disposition), routePrimaryKeys),
      gtfs_bound_route_record_count: routeRows.filter((row) => row.gtfs_route_id !== null).length,
      reviewed_non_projectable_route_record_count: routeRows.filter((row) =>
        row.primary_disposition === "reviewed_non_projectable_disposition").length,
      disposition_counts: countStrings(routeRows
        .map((row) => row.reviewed_non_projectable_disposition)
        .filter((value): value is string => Boolean(value))),
    },
    warning_instances_by_code: warnings,
    enforcement_migration: {
      eligible_occurrence_core_roles_ready: occurrenceRows.every((row) =>
        !row.warning_codes.some((code) => occurrenceCoreRoleCodes.has(code))),
      phase_contract_ready:
        warnings.RC_OCCURRENCE_PHASE_IDENTITY_MISSING === 0 && warnings.RC_OCCURRENCE_PHASE_RELATION_MISSING === 0,
      physical_scope_contract_ready:
        warnings.RC_OCCURRENCE_PHYSICALITY_REVIEW_REQUIRED === 0 &&
        warnings.RC_OCCURRENCE_PHYSICAL_SCOPE_MISSING === 0 &&
        warnings.RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_MISSING === 0 &&
        warnings.RC_OCCURRENCE_PHYSICAL_SCOPE_EVIDENCE_MISSING === 0 &&
        warnings.RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_INVALID === 0 &&
        warnings.RC_OCCURRENCE_POINT_SCOPE_CONTRACT_REQUIRED === 0,
      treatment_physicality_contract_ready:
        physicalityAudit.summary.review_ledger_complete &&
        warnings.RC_TREATMENT_PHYSICALITY_REVIEW_REQUIRED === 0,
      treatment_physicality_final_release_guard_ready:
        treatmentPhysicality.contract_status === "reviewed_final" &&
        treatmentPhysicality.final_post_semantic_release_guard_status === "verified",
      bus_lane_treatment_completeness_ready:
        busLaneTreatmentRows.length === (input.busLaneTreatmentScope?.decisions.length ??
          input.treatments.filter((treatment) => text(treatment.payload.treatment_family) === "bus_lane").length) &&
        warnings.RC_BUS_LANE_TREATMENT_SELECTOR_ACCOUNTING_REQUIRED === 0 &&
        warnings.RC_BUS_LANE_TREATMENT_SCOPE_OR_DISPOSITION_REQUIRED === 0 &&
        warnings.RC_BUS_LANE_TREATMENT_EVIDENCE_MISSING === 0,
      operational_event_completeness_ready:
        warnings.RC_OPERATIONAL_EVENT_REVIEW_OR_DISPOSITION_REQUIRED === 0 &&
        warnings.RC_OPERATIONAL_EVENT_VERSIONED_DISPOSITION_REQUIRED === 0 &&
        warnings.RC_OPERATIONAL_EVENT_OCCURRENCE_COVERAGE_CONFLICT === 0 &&
        [...eligibleEventIds].every((eventId) => operationalEventIds.has(eventId)),
      route_identity_completeness_ready:
        routeRows.length === input.routes.length &&
        warnings.RC_ROUTE_IDENTITY_ACCOUNTING_REQUIRED === 0 &&
        warnings.RC_ROUTE_IDENTITY_EVIDENCE_MISSING === 0,
      hard_mode_ready: false,
    },
  };
  summary.enforcement_migration.hard_mode_ready = Object.values(summary.enforcement_migration)
    .slice(0, -1)
    .every(Boolean);

  const baseContents: Record<string, string> = {
    "bus-lane-treatment-completeness.jsonl": jsonl(busLaneTreatmentRows),
    "occurrence-treatment-physicality.jsonl": jsonl(treatmentRows),
    "occurrence-completeness.jsonl": jsonl(occurrenceRows),
    "operational-event-completeness.jsonl": jsonl(eventRows),
    "route-identity-completeness.jsonl": jsonl(routeRows),
    "report.md": markdownReport(summary, input.reproductionCommand),
    "summary.json": json(summary),
  };
  const files = Object.fromEntries(
    Object.entries(baseContents)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, content]) => [name, {
        path: name,
        bytes: Buffer.byteLength(content),
        sha256: sha256(content),
        ...(name.endsWith(".jsonl")
          ? { row_count: content ? content.trimEnd().split("\n").length : 0 }
          : {}),
      }]),
  );
  const auditFingerprint = sha256(stableJson({
    schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
    input_fingerprint: inputFingerprint,
    files,
  }));
  const manifest: RelationshipCompletenessArtifactManifest = {
    schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
    mode: "warning",
    release_id: input.releaseId,
    input_fingerprint: inputFingerprint,
    audit_fingerprint: auditFingerprint,
    input_pins: pins,
    files,
  };
  return {
    occurrenceRows,
    treatmentRows,
    busLaneTreatmentRows,
    eventRows,
    routeRows,
    summary,
    manifest,
    contents: { ...baseContents, "manifest.json": json(manifest) },
  };
}

function slashPath(value: string): string {
  return value.split(sep).join("/");
}

function normalizedRepositoryPath(path: string, label: string): string {
  if (isAbsolute(path)) throw new Error(`${label} must be repository-relative: ${path}`);
  const normalized = slashPath(normalize(path));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized !== path.replace(/\\/gu, "/")) {
    throw new Error(`${label} is not a normalized repository-relative path: ${path}`);
  }
  return normalized;
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) throw new Error(`Required relationship completeness input is missing: ${path}`);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected an object");
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${path}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) throw new Error(`Required relationship completeness input is missing: ${path}`);
  return readFileSync(path, "utf8").split(/\r?\n/gu).flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line) as T];
    } catch (error) {
      throw new Error(`${path}:${index + 1}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

const RELATIONSHIP_COMPLETENESS_ARTIFACT_NAMES = [
  "bus-lane-treatment-completeness.jsonl",
  "occurrence-completeness.jsonl",
  "occurrence-treatment-physicality.jsonl",
  "operational-event-completeness.jsonl",
  "report.md",
  "route-identity-completeness.jsonl",
  "summary.json",
] as const;

/**
 * Authenticate the prior default completeness bundle before an explicit disposition-pin
 * migration. External input files are intentionally not checked here because the reviewed
 * migration exists precisely to replace two now-stale disposition pins. The prior bundle itself,
 * however, must remain a complete, internally self-addressed and untampered audit.
 */
function validateExistingCompletenessBundleForDispositionMigration(input: {
  outputDir: string;
  manifestPath: string;
  releaseId: string;
}): Record<string, unknown> {
  const manifest = readJsonObject(input.manifestPath);
  if (
    manifest.schema_version !== RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION ||
    manifest.mode !== "warning" ||
    manifest.release_id !== input.releaseId ||
    !Array.isArray(manifest.input_pins) ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files)
  ) {
    throw new Error(`${input.manifestPath}: invalid existing completeness bundle identity/schema`);
  }

  const inputPins = manifest.input_pins as unknown[];
  const inputPinPaths = new Set<string>();
  for (const [index, raw] of inputPins.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`${input.manifestPath}.input_pins[${index}] must be an object`);
    }
    const pin = raw as Record<string, unknown>;
    const allowedKeys = new Set(["path", "sha256", "bytes", "row_count"]);
    const unexpectedKeys = Object.keys(pin).filter((key) => !allowedKeys.has(key));
    const path = text(pin.path);
    const expectsRows = path?.endsWith(".jsonl") ?? false;
    if (
      unexpectedKeys.length > 0 ||
      !path ||
      pin.path !== path ||
      normalizedRepositoryPath(path, `manifest.input_pins[${index}].path`) !== path ||
      typeof pin.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(pin.sha256) ||
      typeof pin.bytes !== "number" ||
      !Number.isInteger(pin.bytes) ||
      pin.bytes < 0 ||
      (expectsRows
        ? typeof pin.row_count !== "number" || !Number.isInteger(pin.row_count) || pin.row_count < 0
        : pin.row_count !== undefined) ||
      inputPinPaths.has(path)
    ) {
      throw new Error(`${input.manifestPath}.input_pins[${index}] is invalid or duplicated`);
    }
    inputPinPaths.add(path);
  }

  const expectedInputFingerprint = sha256(stableJson({
    schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
    release_id: input.releaseId,
    input_pins: [...inputPins].sort((left, right) => {
      const leftPath = text((left as Record<string, unknown>).path)!;
      const rightPath = text((right as Record<string, unknown>).path)!;
      return leftPath.localeCompare(rightPath);
    }),
  } as unknown as JsonValue));
  if (
    typeof manifest.input_fingerprint !== "string" ||
    manifest.input_fingerprint !== expectedInputFingerprint
  ) {
    throw new Error(`${input.manifestPath}: existing completeness input_fingerprint mismatch`);
  }

  const files = manifest.files as Record<string, unknown>;
  const artifactNames = Object.keys(files).sort((left, right) => left.localeCompare(right));
  if (
    stableJson(artifactNames as unknown as JsonValue) !==
      stableJson([...RELATIONSHIP_COMPLETENESS_ARTIFACT_NAMES] as unknown as JsonValue)
  ) {
    throw new Error(`${input.manifestPath}: existing completeness artifact set is incomplete or unexpected`);
  }
  const artifactContents = new Map<string, string>();
  for (const name of artifactNames) {
    const raw = files[name];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`${input.manifestPath}.files.${name} must be an object`);
    }
    const pin = raw as Record<string, unknown>;
    const allowedKeys = new Set(["path", "sha256", "bytes", "row_count"]);
    const unexpectedKeys = Object.keys(pin).filter((key) => !allowedKeys.has(key));
    const expectsRows = name.endsWith(".jsonl");
    if (
      unexpectedKeys.length > 0 ||
      name !== basename(name) ||
      pin.path !== name ||
      typeof pin.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(pin.sha256) ||
      typeof pin.bytes !== "number" ||
      !Number.isInteger(pin.bytes) ||
      pin.bytes < 0 ||
      (expectsRows
        ? typeof pin.row_count !== "number" || !Number.isInteger(pin.row_count) || pin.row_count < 0
        : pin.row_count !== undefined)
    ) {
      throw new Error(`${input.manifestPath}.files.${name} has an invalid artifact pin`);
    }
    const path = join(input.outputDir, name);
    if (!existsSync(path)) throw new Error(`${path}: existing completeness artifact is missing`);
    const content = readFileSync(path, "utf8");
    if (expectsRows) {
      content.split(/\r?\n/gu).forEach((line, index) => {
        if (!line.trim()) return;
        try {
          JSON.parse(line) as unknown;
        } catch (error) {
          throw new Error(
            `${path}:${index + 1}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
    }
    const actualRows = expectsRows ? lineCount(content) : undefined;
    if (
      sha256(content) !== pin.sha256 ||
      Buffer.byteLength(content) !== pin.bytes ||
      (expectsRows && actualRows !== pin.row_count)
    ) {
      throw new Error(`${path}: existing completeness artifact pin mismatch`);
    }
    artifactContents.set(name, content);
  }

  const expectedAuditFingerprint = sha256(stableJson({
    schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
    input_fingerprint: manifest.input_fingerprint,
    files,
  } as unknown as JsonValue));
  if (
    typeof manifest.audit_fingerprint !== "string" ||
    manifest.audit_fingerprint !== expectedAuditFingerprint
  ) {
    throw new Error(`${input.manifestPath}: existing completeness audit_fingerprint mismatch`);
  }

  const summaryPath = join(input.outputDir, "summary.json");
  let summary: unknown;
  try {
    summary = JSON.parse(artifactContents.get("summary.json")!) as unknown;
  } catch (error) {
    throw new Error(`${summaryPath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new Error(`${summaryPath}: expected an object`);
  }
  const summaryRecord = summary as Record<string, unknown>;
  if (
    summaryRecord.schema_version !== manifest.schema_version ||
    summaryRecord.mode !== manifest.mode ||
    summaryRecord.release_id !== manifest.release_id ||
    summaryRecord.input_fingerprint !== manifest.input_fingerprint ||
    !Array.isArray(summaryRecord.input_pins) ||
    stableJson(summaryRecord.input_pins as unknown as JsonValue) !==
      stableJson(manifest.input_pins as unknown as JsonValue)
  ) {
    throw new Error(`${input.manifestPath}: existing completeness summary identity/input pins do not match manifest`);
  }
  return manifest;
}

function pinFile(path: string, content: string, rowCount?: number): RelationshipCompletenessInputPin {
  return {
    path,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
    ...(rowCount === undefined ? {} : { row_count: rowCount }),
  };
}

function manifestFileEntry(manifest: Record<string, unknown>, name: string, manifestPath: string): Record<string, unknown> {
  const files = manifest.files;
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error(`${manifestPath}: files must be an object`);
  }
  const entry = (files as Record<string, unknown>)[name];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`${manifestPath}: missing file pin for ${name}`);
  }
  return entry as Record<string, unknown>;
}

function assertManifestPin(
  pin: RelationshipCompletenessInputPin,
  entry: Record<string, unknown>,
  manifestPath: string,
): void {
  if (entry.sha256 !== pin.sha256 || entry.bytes !== pin.bytes) {
    throw new Error(
      `${manifestPath}: pin mismatch for ${pin.path}; expected ${String(entry.sha256)}/${String(entry.bytes)}, ` +
        `found ${pin.sha256}/${pin.bytes}`,
    );
  }
  if (typeof entry.row_count === "number" && pin.row_count !== entry.row_count) {
    throw new Error(
      `${manifestPath}: row_count mismatch for ${pin.path}; expected ${entry.row_count}, found ${String(pin.row_count)}`,
    );
  }
}

function pinnedContractFile(input: {
  rootDir: string;
  contractPath: string;
  label: string;
  raw: unknown;
  expectJsonl: boolean;
}): { path: string; absolutePath: string; content: string; pin: RelationshipCompletenessInputPin } {
  if (!input.raw || typeof input.raw !== "object" || Array.isArray(input.raw)) {
    throw new Error(`${input.contractPath}: ${input.label} pin must be an object`);
  }
  const raw = input.raw as Record<string, unknown>;
  const path = text(raw.path);
  if (
    !path ||
    typeof raw.sha256 !== "string" ||
    typeof raw.bytes !== "number" ||
    !Number.isInteger(raw.bytes) ||
    (input.expectJsonl && (typeof raw.row_count !== "number" || !Number.isInteger(raw.row_count)))
  ) {
    throw new Error(`${input.contractPath}: ${input.label} pin is invalid`);
  }
  const normalized = normalizedRepositoryPath(path, `${input.label}.path`);
  const absolutePath = resolve(input.rootDir, normalized);
  const rootPrefix = input.rootDir.endsWith(sep) ? input.rootDir : `${input.rootDir}${sep}`;
  if (!absolutePath.startsWith(rootPrefix)) {
    throw new Error(`${input.contractPath}: ${input.label} path escapes repository root`);
  }
  const content = readFileSync(absolutePath, "utf8");
  const actual = pinFile(normalized, content, input.expectJsonl ? lineCount(content) : undefined);
  if (
    actual.sha256 !== raw.sha256 ||
    actual.bytes !== raw.bytes ||
    (input.expectJsonl && actual.row_count !== raw.row_count)
  ) {
    throw new Error(`${input.contractPath}: ${input.label} immutable pin mismatch`);
  }
  return { path: normalized, absolutePath, content, pin: actual };
}

function lineCount(content: string): number {
  return content.trim() ? content.trimEnd().split(/\r?\n/gu).length : 0;
}

function parseBusLaneTreatmentScopeInventoryDecision(
  value: unknown,
  path: string,
): BusLaneTreatmentScopeInventoryDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected an object`);
  const row = value as Record<string, unknown>;
  const requiredText = (field: string): string => {
    const result = text(row[field]);
    if (!result) throw new Error(`${path}.${field} must be a non-empty string`);
    return result;
  };
  if (row.schema_version !== 1 || row.contract_id !== "bus-lane-treatment-physical-scope-v1") {
    throw new Error(`${path}: unsupported bus-lane treatment scope decision`);
  }
  const canonicalStatus = requiredText("canonical_status");
  if (canonicalStatus !== "materialized" && canonicalStatus !== "accepted_pending_addition") {
    throw new Error(`${path}.canonical_status is unsupported`);
  }
  const exclusiveDecision = requiredText("exclusive_decision") as BusLaneTreatmentScopeDisposition;
  if (!busLaneScopeDispositions.has(exclusiveDecision)) {
    throw new Error(`${path}.exclusive_decision is unsupported`);
  }
  if (row.treatment_family !== "bus_lane") throw new Error(`${path}.treatment_family must be bus_lane`);
  if (typeof row.physical_scope_requirement_satisfied !== "boolean") {
    throw new Error(`${path}.physical_scope_requirement_satisfied must be boolean`);
  }
  if (row.study_eligible !== null && typeof row.study_eligible !== "boolean") {
    throw new Error(`${path}.study_eligible must be boolean or null`);
  }
  const parseEvidence = (raw: unknown, label: string) => {
    if (!Array.isArray(raw)) throw new Error(`${label} must be an array`);
    return raw.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`${label}[${index}] must be an object`);
      }
      const item = entry as Record<string, unknown>;
      const sourceId = text(item.source_id);
      if (!sourceId) throw new Error(`${label}[${index}].source_id must be non-empty`);
      return {
        source_id: sourceId,
        ...(text(item.evidence_id) ? { evidence_id: text(item.evidence_id)! } : {}),
      };
    });
  };
  if (!Array.isArray(row.scope_bindings)) throw new Error(`${path}.scope_bindings must be an array`);
  const scopeBindings = row.scope_bindings.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${path}.scope_bindings[${index}] must be an object`);
    }
    const binding = entry as Record<string, unknown>;
    const corridorId = text(binding.corridor_id);
    const relationId = text(binding.relation_id);
    const relationKind = text(binding.relation_kind);
    if (!corridorId || !relationId || !relationKind) {
      throw new Error(`${path}.scope_bindings[${index}] has an incomplete canonical binding`);
    }
    return {
      corridor_id: corridorId,
      relation_id: relationId,
      relation_kind: relationKind,
      evidence_refs: parseEvidence(binding.evidence_refs, `${path}.scope_bindings[${index}].evidence_refs`),
    };
  });
  if (!Array.isArray(row.source_ids) || row.source_ids.some((entry) => !text(entry))) {
    throw new Error(`${path}.source_ids must be an array of non-empty strings`);
  }
  return {
    schema_version: 1,
    contract_id: "bus-lane-treatment-physical-scope-v1",
    decision_id: requiredText("decision_id"),
    treatment_id: requiredText("treatment_id"),
    treatment_family: "bus_lane",
    treatment_kind: requiredText("treatment_kind"),
    canonical_status: canonicalStatus,
    exclusive_decision: exclusiveDecision,
    physical_scope_requirement_satisfied: row.physical_scope_requirement_satisfied,
    evidence_refs: parseEvidence(row.evidence_refs, `${path}.evidence_refs`),
    scope_bindings: scopeBindings,
    source_ids: uniqueSorted((row.source_ids as unknown[]).map((entry) => text(entry)!)),
    study_eligible: row.study_eligible,
    study_eligibility_effect: requiredText("study_eligibility_effect"),
    reason: requiredText("reason"),
  };
}

export function loadBusLaneTreatmentScopeContract(input: {
  rootDir: string;
  contractDir?: string | undefined;
}): NonNullable<BuildRelationshipCompletenessAuditInput["busLaneTreatmentScope"]> {
  const contractDir = normalizedRepositoryPath(
    input.contractDir ?? DEFAULT_BUS_LANE_TREATMENT_SCOPE_CONTRACT_DIR,
    "busLaneTreatmentScopeContractDir",
  );
  const absoluteDir = resolve(input.rootDir, contractDir);
  const contractPath = join(absoluteDir, "contract.json");
  const decisionsPath = join(absoluteDir, "decisions.jsonl");
  const reviewPath = join(absoluteDir, "review.jsonl");
  const summaryPath = join(absoluteDir, "summary.json");
  const manifestPath = join(absoluteDir, "manifest.json");
  const contract = readJsonObject(contractPath);
  if (
    contract.schema_version !== 1 ||
    contract.contract_id !== "bus-lane-treatment-physical-scope-v1" ||
    contract.immutable_after_review !== true
  ) {
    throw new Error(`${contractPath}: unsupported or mutable bus-lane treatment scope contract`);
  }
  const manifest = readJsonObject(manifestPath);
  if (
    manifest.schema_version !== 1 ||
    manifest.contract_id !== "bus-lane-treatment-physical-scope-v1" ||
    !Array.isArray(manifest.artifacts)
  ) {
    throw new Error(`${manifestPath}: invalid bus-lane treatment scope manifest`);
  }
  const artifacts = new Map((manifest.artifacts as unknown[]).map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`${manifestPath}.artifacts[${index}] must be an object`);
    }
    const entry = raw as Record<string, unknown>;
    const path = text(entry.path);
    if (!path || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number") {
      throw new Error(`${manifestPath}.artifacts[${index}] is invalid`);
    }
    return [path, entry] as const;
  }));
  const pinnedArtifact = (name: string): RelationshipCompletenessInputPin => {
    const path = join(absoluteDir, name);
    const content = readFileSync(path, "utf8");
    const pin = pinFile(`${contractDir}/${name}`, content, name.endsWith(".jsonl") ? lineCount(content) : undefined);
    const expected = artifacts.get(name);
    if (!expected || expected.sha256 !== pin.sha256 || expected.bytes !== pin.bytes) {
      throw new Error(`${manifestPath}: immutable artifact pin mismatch for ${name}`);
    }
    return pin;
  };
  const contractPin = pinnedArtifact("contract.json");
  const decisionsPin = pinnedArtifact("decisions.jsonl");
  const reviewPin = pinnedArtifact("review.jsonl");
  const summaryPin = pinnedArtifact("summary.json");
  const decisions = readFileSync(decisionsPath, "utf8").split(/\r?\n/gu).flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      return [parseBusLaneTreatmentScopeInventoryDecision(
        JSON.parse(line) as unknown,
        `${decisionsPath}:${index + 1}`,
      )];
    } catch (error) {
      throw new Error(`${decisionsPath}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const summary = readJsonObject(summaryPath);
  if (
    summary.contract_id !== "bus-lane-treatment-physical-scope-v1" ||
    summary.decision_count !== decisions.length ||
    summary.evidence_linked_decision_count !== decisions.length ||
    new Set(decisions.map((decision) => decision.treatment_id)).size !== decisions.length ||
    new Set(decisions.map((decision) => decision.decision_id)).size !== decisions.length
  ) {
    throw new Error(`${summaryPath}: immutable bus-lane inventory counts or identities do not reconcile`);
  }
  const remediation = manifest.remediation_journal;
  if (!remediation || typeof remediation !== "object" || Array.isArray(remediation)) {
    throw new Error(`${manifestPath}: remediation_journal pin is required`);
  }
  const remediationRaw = remediation as Record<string, unknown>;
  const remediationPath = text(remediationRaw.path);
  if (!remediationPath || typeof remediationRaw.sha256 !== "string" || typeof remediationRaw.bytes !== "number") {
    throw new Error(`${manifestPath}: remediation_journal pin is invalid`);
  }
  const normalizedRemediationPath = normalizedRepositoryPath(remediationPath, "remediation_journal.path");
  const remediationContent = readFileSync(resolve(input.rootDir, normalizedRemediationPath), "utf8");
  const remediationPin = pinFile(normalizedRemediationPath, remediationContent, lineCount(remediationContent));
  if (remediationPin.sha256 !== remediationRaw.sha256 || remediationPin.bytes !== remediationRaw.bytes) {
    throw new Error(`${manifestPath}: remediation_journal immutable pin mismatch`);
  }
  const manifestContent = readFileSync(manifestPath, "utf8");
  const manifestPin = pinFile(`${contractDir}/manifest.json`, manifestContent);
  // The relationship-disposition loader consumes this same file separately. Pinning it here makes
  // the independently reviewed inventory-to-disposition reconciliation content-addressed.
  if (reviewPin.path !== slashPath(relative(input.rootDir, reviewPath))) {
    throw new Error(`${reviewPath}: normalized review path mismatch`);
  }
  return {
    decisions,
    inputPins: [contractPin, decisionsPin, reviewPin, summaryPin, manifestPin, remediationPin],
  };
}

export function loadOccurrenceTreatmentPhysicalityContract(input: {
  rootDir: string;
  contractPath: string;
  releaseId: string;
}): NonNullable<BuildRelationshipCompletenessAuditInput["treatmentPhysicality"]> {
  const contractRelativePath = normalizedRepositoryPath(input.contractPath, "treatmentPhysicalityContractPath");
  const contractPath = resolve(input.rootDir, contractRelativePath);
  const contractContent = readFileSync(contractPath, "utf8");
  const contract = readJsonObject(contractPath);
  if (
    contract.schema_version !== OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION ||
    contract.contract_id !== OCCURRENCE_TREATMENT_PHYSICALITY_CONTRACT_ID
  ) {
    throw new Error(`${contractPath}: unsupported occurrence-treatment physicality contract`);
  }
  const contractStatus = contract.contract_status;
  if (contractStatus !== "warning_first" && contractStatus !== "reviewed_final") {
    throw new Error(`${contractPath}: invalid contract_status`);
  }
  const finalGuard = contract.final_post_semantic_release_guard;
  if (!finalGuard || typeof finalGuard !== "object" || Array.isArray(finalGuard)) {
    throw new Error(`${contractPath}: final_post_semantic_release_guard must be an object`);
  }
  const finalGuardRecord = finalGuard as Record<string, unknown>;
  const finalGuardStatus = finalGuardRecord.status;
  if (finalGuardStatus !== "pending" && finalGuardStatus !== "verified") {
    throw new Error(`${contractPath}: invalid final release guard status`);
  }
  for (const key of [
    "required",
    "immutable_review_ledger_must_remain_byte_identical",
    "matching_release_and_completeness_bundle_required",
    "zero_review_findings_required",
    "zero_physical_scope_findings_required",
    "new_release_required",
  ]) {
    if (finalGuardRecord[key] !== true) {
      throw new Error(`${contractPath}: final release guard ${key} must fail closed`);
    }
  }
  if (
    (contractStatus === "reviewed_final") !== (finalGuardStatus === "verified")
  ) {
    throw new Error(`${contractPath}: contract status and final release guard are inconsistent`);
  }
  const reviewSnapshot = contract.review_snapshot;
  if (!reviewSnapshot || typeof reviewSnapshot !== "object" || Array.isArray(reviewSnapshot)) {
    throw new Error(`${contractPath}: review_snapshot must be an object`);
  }
  const reviewSnapshotRecord = reviewSnapshot as Record<string, unknown>;
  const reviewStage = reviewSnapshotRecord.stage;
  if (reviewStage !== "provisional_rc20" && reviewStage !== "final_post_semantic_release") {
    throw new Error(`${contractPath}: invalid physicality review stage`);
  }
  if (contractStatus === "reviewed_final" && reviewStage !== "final_post_semantic_release") {
    throw new Error(`${contractPath}: reviewed final physicality contract must use the final review stage`);
  }
  const reviewedReleaseId = text(reviewSnapshotRecord.release_id);
  const reviewedReleaseDir = text(reviewSnapshotRecord.release_dir);
  if (!reviewedReleaseId || !reviewedReleaseDir) {
    throw new Error(`${contractPath}: review snapshot release identity is incomplete`);
  }
  if (contractStatus === "reviewed_final" && reviewedReleaseId !== input.releaseId) {
    throw new Error(
      `${contractPath}: reviewed final physicality release ${reviewedReleaseId ?? "<missing>"} ` +
        `does not match completeness release ${input.releaseId}`,
    );
  }
  const normalizedReviewedReleaseDir = normalizedRepositoryPath(
    reviewedReleaseDir,
    "review_snapshot.release_dir",
  );
  const snapshotPins = reviewSnapshotRecord.input_pins;
  if (!Array.isArray(snapshotPins)) {
    throw new Error(`${contractPath}: review_snapshot.input_pins must be an array`);
  }
  const expectedSnapshotPaths = [
    `${normalizedReviewedReleaseDir}/manifest.json`,
    `${normalizedReviewedReleaseDir}/operational_occurrences.jsonl`,
    `${normalizedReviewedReleaseDir}/treatment_components.jsonl`,
    `${normalizedReviewedReleaseDir}/relations.jsonl`,
    `${normalizedReviewedReleaseDir}/corridors.jsonl`,
  ].sort();
  const snapshotFiles = snapshotPins.map((raw, index) => pinnedContractFile({
    rootDir: input.rootDir,
    contractPath,
    label: `review_snapshot.input_pins[${index}]`,
    raw,
    expectJsonl:
      Boolean(raw && typeof raw === "object" && !Array.isArray(raw) &&
        text((raw as Record<string, unknown>).path)?.endsWith(".jsonl")),
  }));
  const snapshotPaths = snapshotFiles.map((file) => file.path).sort();
  if (stableJson(snapshotPaths) !== stableJson(expectedSnapshotPaths)) {
    throw new Error(`${contractPath}: review snapshot must pin exactly the immutable release physicality inputs`);
  }
  if (
    reviewSnapshotRecord.completeness_occurrence_membership_reconciled !== true ||
    reviewSnapshotRecord.completeness_bundle_content_addressing !==
      "quality_manifest_only_to_avoid_contract_completeness_hash_cycle"
  ) {
    throw new Error(`${contractPath}: completeness reconciliation/hash-cycle policy is invalid`);
  }

  const failClosedPolicy = contract.fail_closed_policy;
  if (!failClosedPolicy || typeof failClosedPolicy !== "object" || Array.isArray(failClosedPolicy)) {
    throw new Error(`${contractPath}: fail_closed_policy must be an object`);
  }
  const failClosed = failClosedPolicy as Record<string, unknown>;
  const expectedFailClosedPolicy: Record<string, unknown> = {
    unseen_treatment_record_id: "review_required",
    unseen_treatment_family_or_kind: "review_required",
    missing_or_drifted_exact_evidence: "review_required",
    conflicting_occurrence_membership: "review_required",
    physical_scope_inference_from_family_or_location_literal: "forbidden",
    nonphysical_decision_creates_study_eligibility: false,
    waiver_semantics: "none",
  };
  if (stableJson(failClosed as unknown as JsonValue) !==
    stableJson(expectedFailClosedPolicy as unknown as JsonValue)) {
    throw new Error(`${contractPath}: fail_closed_policy has drifted`);
  }

  const policyFile = pinnedContractFile({
    rootDir: input.rootDir,
    contractPath,
    label: "policy",
    raw: contract.policy,
    expectJsonl: false,
  });
  const policy = JSON.parse(policyFile.content) as OccurrenceTreatmentPhysicalityPolicy;
  if (
    policy.schema_version !== OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION ||
    policy.contract_id !== OCCURRENCE_TREATMENT_PHYSICALITY_CONTRACT_ID ||
    stableJson(policy as unknown as JsonValue) !==
      stableJson(OCCURRENCE_TREATMENT_PHYSICALITY_POLICY_V1 as unknown as JsonValue)
  ) {
    throw new Error(`${contractPath}: checked-in policy and repository policy implementation diverge`);
  }

  const ledgerFile = pinnedContractFile({
    rootDir: input.rootDir,
    contractPath,
    label: "review_ledger",
    raw: contract.review_ledger,
    expectJsonl: true,
  });
  const decisions = ledgerFile.content.split(/\r?\n/gu).flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line) as OccurrenceTreatmentPhysicalityDecision];
    } catch (error) {
      throw new Error(`${ledgerFile.absolutePath}:${index + 1}: invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`);
    }
  });
  const ledgerPin = contract.review_ledger as Record<string, unknown>;
  if (
    ledgerPin.ledger_id !== OCCURRENCE_TREATMENT_PHYSICALITY_LEDGER_ID ||
    ledgerPin.immutable_after_review !== true ||
    ledgerPin.logical_sha256 !== sha256(stableJson(decisions as unknown as JsonValue))
  ) {
    throw new Error(`${contractPath}: immutable review ledger identity/logical hash mismatch`);
  }
  if (
    new Set(decisions.map((decision) => decision.decision_id)).size !== decisions.length ||
    new Set(decisions.map((decision) => decision.treatment_record_id)).size !== decisions.length ||
    decisions.some((decision) =>
      decision.schema_version !== OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION ||
      decision.ledger_id !== OCCURRENCE_TREATMENT_PHYSICALITY_LEDGER_ID)
  ) {
    throw new Error(`${contractPath}: immutable review ledger contains duplicate or invalid rows`);
  }
  const reviewedOccurrenceIds = new Set(decisions.flatMap((decision) => decision.occurrence_ids));
  const reviewedMembershipCount = decisions.reduce(
    (sum, decision) => sum + decision.occurrence_ids.length,
    0,
  );
  if (
    reviewSnapshotRecord.eligible_occurrence_count !== reviewedOccurrenceIds.size ||
    reviewSnapshotRecord.unique_treatment_count !== decisions.length ||
    reviewSnapshotRecord.treatment_membership_count !== reviewedMembershipCount
  ) {
    throw new Error(`${contractPath}: immutable review snapshot counts do not reconcile with the ledger`);
  }

  return {
    policy,
    decisions,
    contract_status: contractStatus,
    final_post_semantic_release_guard_status: finalGuardStatus,
    inputPins: [
      pinFile(contractRelativePath, contractContent),
      policyFile.pin,
      ledgerFile.pin,
    ],
  };
}

export function loadRelationshipCompletenessArtifacts(
  options: WriteRelationshipCompletenessArtifactsOptions = {},
): LoadedRelationshipCompletenessArtifacts {
  const rootDir = resolve(options.rootDir ?? repoRoot);
  const releaseDirPath = normalizedRepositoryPath(
    options.releaseDir ?? DEFAULT_RELATIONSHIP_COMPLETENESS_RELEASE_DIR,
    "releaseDir",
  );
  const coverageDirPath = normalizedRepositoryPath(
    options.coverageDir ?? DEFAULT_RELATIONSHIP_COMPLETENESS_COVERAGE_DIR,
    "coverageDir",
  );
  const outputDirPath = normalizedRepositoryPath(
    options.outputDir ?? DEFAULT_RELATIONSHIP_COMPLETENESS_OUTPUT_DIR,
    "outputDir",
  );
  const reviewedCurrentCorpusMigration = options.reviewedCurrentCorpusMigration === true;
  if (
    reviewedCurrentCorpusMigration &&
    (releaseDirPath !== DEFAULT_RELATIONSHIP_COMPLETENESS_RELEASE_DIR ||
      outputDirPath !== DEFAULT_RELATIONSHIP_COMPLETENESS_OUTPUT_DIR)
  ) {
    throw new Error(
      "--reviewed-current-corpus-migration is restricted to the default rc20 release/completeness output boundary",
    );
  }
  const releaseDir = resolve(rootDir, releaseDirPath);
  const coverageDir = resolve(rootDir, coverageDirPath);
  const outputDir = resolve(rootDir, outputDirPath);
  const rootPrefix = rootDir.endsWith(sep) ? rootDir : `${rootDir}${sep}`;
  for (const { label, path } of [
    { label: "releaseDir", path: releaseDir },
    { label: "coverageDir", path: coverageDir },
    { label: "outputDir", path: outputDir },
  ]) {
    if (path !== rootDir && !path.startsWith(rootPrefix)) throw new Error(`${label} escapes repository root: ${path}`);
  }

  const releaseManifestPath = join(releaseDir, "manifest.json");
  const releaseManifestContent = readFileSync(releaseManifestPath, "utf8");
  const releaseManifestSha256 = sha256(releaseManifestContent);
  const expectedManifestSha256 = options.expectedReleaseManifestSha256 ??
    (releaseDirPath === DEFAULT_RELATIONSHIP_COMPLETENESS_RELEASE_DIR
      ? DEFAULT_RELATIONSHIP_COMPLETENESS_RELEASE_MANIFEST_SHA256
      : undefined);
  if (expectedManifestSha256 && releaseManifestSha256 !== expectedManifestSha256) {
    throw new Error(
      `${releaseManifestPath}: manifest SHA-256 mismatch; expected ${expectedManifestSha256}, found ${releaseManifestSha256}`,
    );
  }
  const releaseManifest = readJsonObject(releaseManifestPath);
  const releaseId = text(releaseManifest.release_id);
  if (!releaseId) throw new Error(`${releaseManifestPath}: release_id must be a non-empty string`);

  const releaseInputs = [
    "claims.jsonl",
    "corridors.jsonl",
    "entities.jsonl",
    "events.jsonl",
    "metric_claims.jsonl",
    "operational_occurrences.jsonl",
    "projects.jsonl",
    "relations.jsonl",
    "route_anchors.jsonl",
    "routes.jsonl",
    "source_gaps.jsonl",
    "sources.jsonl",
    "tables.jsonl",
    "treatment_components.jsonl",
  ] as const;
  const releaseContents = new Map<string, string>();
  const releasePins: RelationshipCompletenessInputPin[] = [];
  for (const name of releaseInputs) {
    const path = join(releaseDir, name);
    const content = readFileSync(path, "utf8");
    releaseContents.set(name, content);
    const rowCount = content.trim() ? content.trimEnd().split(/\r?\n/gu).length : 0;
    const pin = pinFile(`${releaseDirPath}/${name}`, content, rowCount);
    assertManifestPin(pin, manifestFileEntry(releaseManifest, name, releaseManifestPath), releaseManifestPath);
    releasePins.push(pin);
  }
  const releaseManifestPin = pinFile(`${releaseDirPath}/manifest.json`, releaseManifestContent);

  const coverageManifestPath = join(coverageDir, "manifest.json");
  const coverageManifestContent = readFileSync(coverageManifestPath, "utf8");
  const coverageManifest = readJsonObject(coverageManifestPath);
  const coverageLedgerName = "recoverability-ledger.jsonl";
  const coverageLedgerPath = join(coverageDir, coverageLedgerName);
  const coverageLedgerContent = readFileSync(coverageLedgerPath, "utf8");
  const coverageGaps = readJsonl<OperationalCoverageGap>(coverageLedgerPath);
  const coverageLedgerPin = pinFile(
    `${coverageDirPath}/${coverageLedgerName}`,
    coverageLedgerContent,
    coverageGaps.length,
  );
  assertManifestPin(
    coverageLedgerPin,
    manifestFileEntry(coverageManifest, coverageLedgerName, coverageManifestPath),
    coverageManifestPath,
  );
  const coverageManifestPin = pinFile(`${coverageDirPath}/manifest.json`, coverageManifestContent);

  const dispositionRepositoryRoot = resolve(options.dispositionRootDir ?? rootDir);
  const routeReviewFile = routeAnchorOverridesPath(dispositionRepositoryRoot);
  const routeAnchorReview = readRouteAnchorReview(routeReviewFile);
  const operationalDispositionFile = operationalEventDispositionPath(dispositionRepositoryRoot);
  const busLaneDispositionFile = busLaneTreatmentDispositionPath(dispositionRepositoryRoot);
  const relationshipDispositionPaths = new Set([
    slashPath(relative(rootDir, operationalDispositionFile)),
    slashPath(relative(rootDir, busLaneDispositionFile)),
  ]);
  const existingAuditManifestPath = join(outputDir, "manifest.json");
  const existingDefaultDispositionPins =
    releaseDirPath === DEFAULT_RELATIONSHIP_COMPLETENESS_RELEASE_DIR &&
      outputDirPath === DEFAULT_RELATIONSHIP_COMPLETENESS_OUTPUT_DIR &&
      existsSync(existingAuditManifestPath)
      ? (() => {
          const existingManifest = reviewedCurrentCorpusMigration
            ? validateExistingCompletenessBundleForDispositionMigration({
                outputDir,
                manifestPath: existingAuditManifestPath,
                releaseId,
              })
            : readJsonObject(existingAuditManifestPath);
          if (text(existingManifest.release_id) !== releaseId || !Array.isArray(existingManifest.input_pins)) {
            throw new Error(`${existingAuditManifestPath}: pinned completeness manifest identity is invalid`);
          }
          const pinEntries = existingManifest.input_pins.flatMap((value, index) => {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
              throw new Error(`${existingAuditManifestPath}.input_pins[${index}] must be an object`);
            }
            const pin = value as Record<string, unknown>;
            const path = text(pin.path);
            if (!path || !relationshipDispositionPaths.has(path)) {
              return [];
            }
            if (
              typeof pin.sha256 !== "string" ||
              !/^[a-f0-9]{64}$/u.test(pin.sha256) ||
              typeof pin.bytes !== "number" ||
              !Number.isInteger(pin.bytes) || pin.bytes < 0 ||
              (pin.row_count !== undefined &&
                (typeof pin.row_count !== "number" || !Number.isInteger(pin.row_count) || pin.row_count < 0))
            ) {
              throw new Error(`${existingAuditManifestPath}.input_pins[${index}] has invalid file metadata`);
            }
            const absolutePath = resolve(
              rootDir,
              normalizedRepositoryPath(path, `manifest.input_pins[${index}].path`),
            );
            return [[absolutePath, {
              path,
              sha256: pin.sha256,
              bytes: pin.bytes,
              ...(typeof pin.row_count === "number" ? { row_count: pin.row_count } : {}),
            } satisfies RelationshipCompletenessInputPin] as const];
          });
          const pins = new Map(pinEntries);
          const pinnedPaths = new Set([...pins.values()].map((pin) => pin.path));
          const missingPaths = [...relationshipDispositionPaths]
            .filter((path) => !pinnedPaths.has(path))
            .sort((left, right) => left.localeCompare(right));
          if (
            missingPaths.length > 0 ||
            pins.size !== relationshipDispositionPaths.size ||
            pinEntries.length !== pins.size
          ) {
            throw new Error(
              `${existingAuditManifestPath}: expected exactly the two reviewed disposition input pins; ` +
                `missing ${missingPaths.join(", ") || "none"}`,
            );
          }
          return pins;
        })()
      : undefined;
  if (reviewedCurrentCorpusMigration && !existingDefaultDispositionPins) {
    throw new Error(
      `${existingAuditManifestPath}: --reviewed-current-corpus-migration requires an existing valid pinned rc20 completeness manifest`,
    );
  }
  const pinnedDefaultDispositionPins = reviewedCurrentCorpusMigration
    ? undefined
    : existingDefaultDispositionPins;
  // v1-rc20 is immutable. Its checked-in completeness manifest normally pins the exact reviewed
  // disposition inputs that existed for that release, so later current-corpus treatment reviews
  // cannot silently change the historical audit. The explicit reviewed-current-corpus migration
  // path bypasses the historical-hash comparison only for those two pins; every release, coverage,
  // and contract input must still pass its normal content-addressed validation before the rebuilt
  // manifest records the current exact input set. A new release/output has no prior disposition pin
  // and discovers the current versioned disposition ledgers.
  const dispositionFiles = pinnedDefaultDispositionPins
    ? uniqueSorted([...pinnedDefaultDispositionPins.keys(), busLaneDispositionFile])
    : [operationalDispositionFile, busLaneDispositionFile].filter((path) => existsSync(path));
  if (pinnedDefaultDispositionPins) {
    const missing = dispositionFiles.filter((path) => !existsSync(path));
    if (missing.length > 0) {
      throw new Error(`${existingAuditManifestPath}: pinned disposition input is missing: ${missing.join(", ")}`);
    }
  }
  const relationshipDispositions = dispositionFiles.flatMap((path) => readRelationshipDispositionFile(path));
  const dispositionPins = dispositionFiles.map((path) => {
    const content = readFileSync(path, "utf8");
    const rowCount = content.trim() ? content.trimEnd().split(/\r?\n/gu).length : 0;
    const pin = pinFile(slashPath(relative(rootDir, path)), content, rowCount);
    const expected = pinnedDefaultDispositionPins?.get(path);
    if (
      expected &&
      (pin.sha256 !== expected.sha256 ||
        pin.bytes !== expected.bytes ||
        pin.row_count !== expected.row_count)
    ) {
      throw new Error(
        `${existingAuditManifestPath}: pinned disposition input changed for ${expected.path}; ` +
        `expected ${expected.sha256}/${expected.bytes}/${String(expected.row_count)}, ` +
        `found ${pin.sha256}/${pin.bytes}/${String(pin.row_count)}`,
      );
    }
    return pin;
  });
  const routeReviewContent = readFileSync(routeReviewFile, "utf8");
  const routeReviewPin = pinFile(slashPath(relative(rootDir, routeReviewFile)), routeReviewContent);

  const parseReleaseJsonl = <T>(name: typeof releaseInputs[number]): T[] => {
    const content = releaseContents.get(name);
    if (content === undefined) throw new Error(`Missing loaded release input: ${name}`);
    return content.split(/\r?\n/gu).flatMap((line, index) => {
      if (!line.trim()) return [];
      try {
        return [JSON.parse(line) as T];
      } catch (error) {
        throw new Error(
          `${join(releaseDir, name)}:${index + 1}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  };
  const treatmentPhysicality = loadOccurrenceTreatmentPhysicalityContract({
    rootDir,
    contractPath:
      options.treatmentPhysicalityContractPath ??
      DEFAULT_OCCURRENCE_TREATMENT_PHYSICALITY_CONTRACT_PATH,
    releaseId,
  });
  const busLaneTreatmentScope = loadBusLaneTreatmentScopeContract({
    rootDir,
    contractDir:
      options.busLaneTreatmentScopeContractDir ??
      DEFAULT_BUS_LANE_TREATMENT_SCOPE_CONTRACT_DIR,
  });
  const build = buildRelationshipCompletenessAudit({
    releaseId,
    ...(reviewedCurrentCorpusMigration
      ? { reproductionCommand: REVIEWED_CURRENT_CORPUS_MIGRATION_REPRODUCTION_COMMAND }
      : {}),
    occurrences: parseReleaseJsonl<OperationalOccurrenceRow>("operational_occurrences.jsonl"),
    treatments: parseReleaseJsonl<MtaCanonicalRecord>("treatment_components.jsonl"),
    events: parseReleaseJsonl<MtaCanonicalRecord>("events.jsonl"),
    projects: parseReleaseJsonl<MtaCanonicalRecord>("projects.jsonl"),
    corridors: parseReleaseJsonl<MtaCanonicalRecord>("corridors.jsonl"),
    routes: parseReleaseJsonl<MtaCanonicalRecord>("routes.jsonl"),
    routeAnchors: parseReleaseJsonl<RouteAnchorRow>("route_anchors.jsonl"),
    routeAnchorReview,
    releaseScopedRouteReview: true,
    relations: parseReleaseJsonl<MtaCanonicalRecord>("relations.jsonl"),
    coverageGaps,
    relationshipDispositions,
    treatmentPhysicality,
    busLaneTreatmentScope,
    inputPins: [
      releaseManifestPin,
      ...releasePins,
      coverageManifestPin,
      coverageLedgerPin,
      ...dispositionPins,
      routeReviewPin,
    ],
  });
  const canonicalRecords = releaseInputs
    .filter((name) => name !== "operational_occurrences.jsonl" && name !== "route_anchors.jsonl")
    .flatMap((name) => parseReleaseJsonl<MtaCanonicalRecord>(name));
  const dispositionIssues = validateRelationshipDispositionLedgerForRelease(
    canonicalRecords,
    relationshipDispositions,
  );
  if (dispositionIssues.length > 0) {
    throw new Error(`Relationship disposition ledger does not match release ${releaseId}:\n${dispositionIssues.join("\n")}`);
  }
  if (!build.summary.occurrence_treatment_physicality.review_ledger_complete) {
    throw new Error(
      `Occurrence-treatment physicality ledger drifted for release ${releaseId}: ` +
        `${stableJson(build.summary.occurrence_treatment_physicality.finding_counts as unknown as JsonValue)}`,
    );
  }
  return {
    ...build,
    outputDir,
    relationshipDispositions: [...relationshipDispositions].sort((left, right) =>
      left.decision_id.localeCompare(right.decision_id)),
  };
}

/**
 * Validate disposition targets and evidence against the immutable release graph used by this
 * audit. A reviewed decision may name a relation created by a later, still-unmaterialized corpus
 * migration; that forward relation is not part of the historical release and therefore cannot
 * make the release-scoped loader fail or make the disposition valid for that release.
 *
 * Decisions whose target did not yet exist in the release and graph-investigation references
 * introduced after the release are outside this historical projection. For decisions whose target
 * does exist, target kind and exact evidence remain strictly checked. The ordinary current-corpus
 * materialization boundary continues to call validateRelationshipDispositionLedger with the full
 * decision and all graph references, so this release projection cannot relax current enforcement.
 */
export function validateRelationshipDispositionLedgerForRelease(
  releaseRecords: readonly MtaCanonicalRecord[],
  decisions: readonly RelationshipDispositionDecision[],
): string[] {
  const releaseRecordIds = new Set(releaseRecords.map((record) => record.record_id));
  const releaseDecisions = [...decisions]
    .filter((decision) => releaseRecordIds.has(decision.record_id))
    .sort((left, right) => left.decision_id.localeCompare(right.decision_id))
    .map((decision): RelationshipDispositionDecision => ({
      ...decision,
      related_record_ids: decision.related_record_ids.filter((recordId) => releaseRecordIds.has(recordId)),
      investigation: {
        ...decision.investigation,
        graph_record_ids_checked: decision.investigation.graph_record_ids_checked
          .filter((recordId) => releaseRecordIds.has(recordId)),
      },
    }));
  return validateRelationshipDispositionLedger(releaseRecords, {
    decisions: releaseDecisions,
    byRecordId: new Map(releaseDecisions.map((decision) => [decision.record_id, decision])),
  });
}

type CompletenessSubjectRow =
  | OccurrenceCompletenessRow
  | OccurrenceTreatmentPhysicalityCompletenessRow
  | BusLaneTreatmentCompletenessRow
  | OperationalEventCompletenessRow
  | RouteIdentityCompletenessRow;

function role(
  name: string,
  missing: boolean,
  recordIds: Iterable<string> = [],
  applicable = true,
): CanonicalRelationshipCompletenessRoleMirror {
  const ids = uniqueSorted(recordIds);
  // A parent warning can subsume its dependent roles (for example ROUTE_MISSING suppresses a
  // second GTFS warning). SQL still needs those dependent roles to be honestly missing rather
  // than represented as a satisfied row with a fabricated cardinality.
  const status = !applicable ? "not_applicable" : missing || ids.length === 0 ? "missing" : "satisfied";
  return {
    role: name,
    status,
    bindingCount: status === "satisfied" ? ids.length : 0,
    recordIds: status === "satisfied" ? ids : [],
  };
}

function occurrenceMirrorRoles(row: OccurrenceCompletenessRow): CanonicalRelationshipCompletenessRoleMirror[] {
  const has = (code: RelationshipCompletenessWarningCode) => row.warning_codes.includes(code);
  const bundle = row.treatment_record_ids.length > 1;
  const physical = row.physical_scope_requirement === "corridor_or_segment_required" ||
    row.physical_scope_requirement === "point_or_stop_required";
  const physicalScopeMissing =
    has("RC_OCCURRENCE_PHYSICAL_SCOPE_MISSING") ||
    has("RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_MISSING") ||
    has("RC_OCCURRENCE_PHYSICAL_SCOPE_EVIDENCE_MISSING") ||
    has("RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_INVALID") ||
    has("RC_OCCURRENCE_POINT_SCOPE_CONTRACT_REQUIRED");
  return [
    // Operational occurrences are derived projections rather than canonical records. Bind the
    // projection-only identity/status/onset roles to the canonical realized event records that
    // establish them; the occurrence subject itself intentionally has no canonical_record_id.
    role(
      "canonical_occurrence_identity",
      has("RC_OCCURRENCE_IDENTITY_MISSING") || has("RC_OCCURRENCE_IDENTITY_AMBIGUOUS"),
      row.event_record_ids,
    ),
    role("realized_status", has("RC_OCCURRENCE_REALIZED_IDENTITY_INVALID"), row.event_record_ids),
    role("canonical_event_identity", has("RC_OCCURRENCE_REALIZED_EVENT_IDENTITY_MISSING"), row.event_record_ids),
    role("route_membership", has("RC_OCCURRENCE_ROUTE_MISSING"), row.route_record_ids),
    role("gtfs_route_anchor", has("RC_OCCURRENCE_GTFS_ROUTE_MISSING"), row.route_record_ids),
    role("route_identity_evidence", has("RC_OCCURRENCE_ROUTE_IDENTITY_EVIDENCE_MISSING"), row.route_record_ids),
    role("route_scope_evidence", has("RC_OCCURRENCE_ROUTE_SCOPE_EVIDENCE_MISSING"), row.route_record_ids),
    role("treatment_membership", has("RC_OCCURRENCE_TREATMENT_MISSING"), row.treatment_record_ids),
    role("treatment_definition_evidence", has("RC_OCCURRENCE_TREATMENT_DEFINITION_EVIDENCE_MISSING"), row.treatment_record_ids),
    role("treatment_scope_evidence", has("RC_OCCURRENCE_TREATMENT_SCOPE_EVIDENCE_MISSING"), row.treatment_record_ids),
    role("treatment_bundle_identity", has("RC_OCCURRENCE_TREATMENT_BUNDLE_IDENTITY_MISSING"), row.treatment_record_ids, bundle),
    role("treatment_bundle_evidence", has("RC_OCCURRENCE_TREATMENT_BUNDLE_EVIDENCE_MISSING"), row.treatment_record_ids, bundle),
    role("operational_onset", has("RC_OCCURRENCE_ONSET_MISSING"), row.event_record_ids),
    role("operational_onset_precision", has("RC_OCCURRENCE_ONSET_PRECISION_INVALID"), row.event_record_ids),
    role("event_date_evidence", has("RC_OCCURRENCE_EVENT_DATE_EVIDENCE_MISSING"), row.event_record_ids),
    role("timeline_evidence", has("RC_OCCURRENCE_TIMELINE_EVIDENCE_MISSING"), row.event_record_ids),
    role("phase_identity", has("RC_OCCURRENCE_PHASE_IDENTITY_MISSING"), row.phase_record_ids),
    role(
      "phase_relation_or_single_phase_disposition",
      has("RC_OCCURRENCE_PHASE_RELATION_MISSING"),
      row.phase_relation_record_ids.length > 0 ? row.phase_relation_record_ids : row.phase_record_ids,
    ),
    role(
      "reviewed_treatment_physicality",
      has("RC_OCCURRENCE_PHYSICALITY_REVIEW_REQUIRED"),
      row.treatment_record_ids,
    ),
    role(
      "physical_scope",
      physicalScopeMissing,
      [...row.physical_scope_record_ids, ...row.physical_scope_relation_record_ids],
      physical,
    ),
  ];
}

function treatmentMirrorRoles(
  row: OccurrenceTreatmentPhysicalityCompletenessRow,
): CanonicalRelationshipCompletenessRoleMirror[] {
  return [role(
    "immutable_treatment_physicality_decision",
    row.warning_codes.includes("RC_TREATMENT_PHYSICALITY_REVIEW_REQUIRED"),
    [row.treatment_record_id],
  )];
}

function busLaneTreatmentMirrorRoles(
  row: BusLaneTreatmentCompletenessRow,
): CanonicalRelationshipCompletenessRoleMirror[] {
  const accountingMissing = row.warning_codes.includes("RC_BUS_LANE_TREATMENT_SELECTOR_ACCOUNTING_REQUIRED");
  const scopeOrDispositionMissing = row.warning_codes.includes(
    "RC_BUS_LANE_TREATMENT_SCOPE_OR_DISPOSITION_REQUIRED",
  );
  const evidenceMissing = row.warning_codes.includes("RC_BUS_LANE_TREATMENT_EVIDENCE_MISSING");
  const scopeOrDispositionBindings = row.physical_scope_satisfied
    ? [
        row.treatment_record_id,
        ...row.physical_scope_record_ids,
        ...row.physical_scope_relation_record_ids,
      ]
    : [row.treatment_record_id];
  return [
    role("immutable_bus_lane_inventory_accounting", accountingMissing, [row.treatment_record_id]),
    role(
      "canonical_physical_scope_or_evidence_bound_nonprojectable_disposition",
      scopeOrDispositionMissing,
      scopeOrDispositionBindings,
    ),
    role("exact_scope_or_disposition_evidence", evidenceMissing, [row.treatment_record_id]),
  ];
}

function eventMirrorRoles(row: OperationalEventCompletenessRow): CanonicalRelationshipCompletenessRoleMirror[] {
  const has = (code: RelationshipCompletenessWarningCode) => row.warning_codes.includes(code);
  const nonProjectable = row.primary_disposition !== "eligible_occurrence_present";
  return [
    role("reviewed_occurrence_or_nonprojectable_disposition", has("RC_OPERATIONAL_EVENT_REVIEW_OR_DISPOSITION_REQUIRED"), [row.event_record_id]),
    role(
      "versioned_nonprojectable_disposition",
      has("RC_OPERATIONAL_EVENT_VERSIONED_DISPOSITION_REQUIRED"),
      [row.event_record_id],
      nonProjectable,
    ),
    role("occurrence_coverage_reconciliation", has("RC_OPERATIONAL_EVENT_OCCURRENCE_COVERAGE_CONFLICT"), [row.event_record_id]),
  ];
}

function routeMirrorRoles(row: RouteIdentityCompletenessRow): CanonicalRelationshipCompletenessRoleMirror[] {
  return [
    role(
      "canonical_gtfs_anchor_or_typed_nonprojectable_disposition",
      row.warning_codes.includes("RC_ROUTE_IDENTITY_ACCOUNTING_REQUIRED"),
      [row.route_record_id],
    ),
    role(
      "route_identity_evidence",
      row.warning_codes.includes("RC_ROUTE_IDENTITY_EVIDENCE_MISSING"),
      [row.route_record_id],
    ),
  ];
}

function completenessSubjectMirror(row: CompletenessSubjectRow): CanonicalRelationshipCompletenessSubjectMirror {
  if (row.selector === "eligible_operational_occurrence") {
    return {
      contractId: RELATIONSHIP_COMPLETENESS_CONTRACT_ID,
      selector: row.selector,
      subjectId: row.occurrence_id,
      subjectKind: "operational_occurrence",
      canonicalRecordId: null,
      primaryDisposition: row.primary_disposition,
      studyProjectable: true,
      warningCodes: [...row.warning_codes],
      roles: occurrenceMirrorRoles(row),
      detailJson: row as unknown as JsonValue,
    };
  }
  if (row.selector === "eligible_occurrence_treatment_physicality") {
    return {
      contractId: RELATIONSHIP_COMPLETENESS_CONTRACT_ID,
      selector: row.selector,
      subjectId: row.treatment_record_id,
      subjectKind: "treatment_component",
      canonicalRecordId: row.treatment_record_id,
      primaryDisposition: row.primary_disposition,
      studyProjectable: false,
      warningCodes: [...row.warning_codes],
      roles: treatmentMirrorRoles(row),
      detailJson: row as unknown as JsonValue,
    };
  }
  if (row.selector === "bus_lane_family_treatment") {
    return {
      contractId: RELATIONSHIP_COMPLETENESS_CONTRACT_ID,
      selector: row.selector,
      subjectId: row.treatment_record_id,
      subjectKind: "treatment_component",
      canonicalRecordId: row.treatment_record_id,
      primaryDisposition: row.primary_disposition,
      studyProjectable: false,
      warningCodes: [...row.warning_codes],
      roles: busLaneTreatmentMirrorRoles(row),
      detailJson: row as unknown as JsonValue,
    };
  }
  if (row.selector === "route_identity") {
    return {
      contractId: RELATIONSHIP_COMPLETENESS_CONTRACT_ID,
      selector: row.selector,
      subjectId: row.route_record_id,
      subjectKind: "route",
      canonicalRecordId: row.route_record_id,
      primaryDisposition: row.primary_disposition,
      studyProjectable: row.study_projectable,
      warningCodes: [...row.warning_codes],
      roles: routeMirrorRoles(row),
      detailJson: row as unknown as JsonValue,
    };
  }
  return {
    contractId: RELATIONSHIP_COMPLETENESS_CONTRACT_ID,
    selector: row.selector,
    subjectId: row.event_record_id,
    subjectKind: "event",
    canonicalRecordId: row.event_record_id,
    primaryDisposition: row.primary_disposition,
    studyProjectable: row.study_projectable,
    warningCodes: [...row.warning_codes],
    roles: eventMirrorRoles(row),
    detailJson: row as unknown as JsonValue,
  };
}

export function relationshipCompletenessDbMirror(
  loaded: LoadedRelationshipCompletenessArtifacts,
  mode: "warning" | "enforce" = "warning",
): CanonicalRelationshipCompletenessMirror {
  const rows: CompletenessSubjectRow[] = [
    ...loaded.occurrenceRows,
    ...loaded.treatmentRows,
    ...loaded.busLaneTreatmentRows,
    ...loaded.eventRows,
    ...loaded.routeRows,
  ];
  const subjects = rows.map(completenessSubjectMirror).sort((left, right) =>
    left.selector.localeCompare(right.selector) || left.subjectId.localeCompare(right.subjectId));
  const findings = rows.flatMap((row) => {
    const subject = completenessSubjectMirror(row);
    return row.warning_codes.map((code) => {
      const detail = { code, selector: subject.selector, subject_id: subject.subjectId, row };
      return {
        findingId: `relationship-completeness-finding:${sha256(stableJson(detail as unknown as JsonValue)).slice(0, 24)}`,
        contractId: RELATIONSHIP_COMPLETENESS_CONTRACT_ID,
        code,
        severity: "warning" as const,
        selector: subject.selector,
        subjectId: subject.subjectId,
        detailJson: detail as unknown as JsonValue,
      };
    });
  }).sort((left, right) => left.findingId.localeCompare(right.findingId));
  const promotion = (selector: RelationshipCompletenessWarningDefinition["selector"]) =>
    RELATIONSHIP_COMPLETENESS_WARNING_DEFINITIONS
      .filter((definition) => definition.selector === selector)
      .map((definition) => `${definition.code}: ${definition.promotion_criterion}`)
      .join(" ");
  const selectorContracts = [
    {
      contractId: RELATIONSHIP_COMPLETENESS_CONTRACT_ID,
      selector: "eligible_operational_occurrence",
      selectorClass: "enforcement_candidate_plus_schema_migration",
      expectedCount: loaded.summary.occurrences.eligible_occurrence_count,
      actualCount: loaded.occurrenceRows.length,
      enforcementEligible: loaded.summary.enforcement_migration.eligible_occurrence_core_roles_ready &&
        loaded.summary.enforcement_migration.phase_contract_ready &&
        loaded.summary.enforcement_migration.physical_scope_contract_ready,
      promotionCriterion: promotion("eligible_operational_occurrence"),
    },
    {
      contractId: RELATIONSHIP_COMPLETENESS_CONTRACT_ID,
      selector: "eligible_occurrence_treatment_physicality",
      selectorClass: "reviewed_full_denominator",
      expectedCount: loaded.summary.occurrence_treatment_physicality.denominator_count,
      actualCount: loaded.treatmentRows.length,
      enforcementEligible: loaded.summary.enforcement_migration.treatment_physicality_contract_ready &&
        loaded.summary.enforcement_migration.treatment_physicality_final_release_guard_ready,
      promotionCriterion: promotion("eligible_occurrence_treatment_physicality"),
    },
    {
      contractId: RELATIONSHIP_COMPLETENESS_CONTRACT_ID,
      selector: "bus_lane_family_treatment",
      selectorClass: "reviewed_full_denominator",
      expectedCount: loaded.summary.bus_lane_treatments.denominator_count,
      actualCount: loaded.busLaneTreatmentRows.length,
      enforcementEligible: loaded.summary.enforcement_migration.bus_lane_treatment_completeness_ready,
      promotionCriterion: promotion("bus_lane_family_treatment"),
    },
    {
      contractId: RELATIONSHIP_COMPLETENESS_CONTRACT_ID,
      selector: "operational_event_family",
      selectorClass: "reviewed_full_denominator",
      expectedCount: loaded.summary.operational_events.denominator_count,
      actualCount: loaded.eventRows.length,
      enforcementEligible: loaded.summary.enforcement_migration.operational_event_completeness_ready,
      promotionCriterion: promotion("operational_event_family"),
    },
    {
      contractId: RELATIONSHIP_COMPLETENESS_CONTRACT_ID,
      selector: "route_identity",
      selectorClass: "reviewed_full_denominator",
      expectedCount: loaded.summary.route_identities.denominator_count,
      actualCount: loaded.routeRows.length,
      enforcementEligible: loaded.summary.enforcement_migration.route_identity_completeness_ready,
      promotionCriterion: promotion("route_identity"),
    },
  ];
  const routeDispositions = loaded.routeRows
    .filter((row) => row.primary_disposition === "reviewed_non_projectable_disposition")
    .map((row) => {
      if (
        !row.disposition_decision_id ||
        !row.disposition_reviewed_at ||
        !row.disposition_reason ||
        !row.reviewed_non_projectable_disposition
      ) {
        throw new Error(`route completeness row ${row.route_record_id} has an incomplete reviewed disposition`);
      }
      return {
        decisionId: row.disposition_decision_id,
        contractId: "route-identity-dispositions-v1",
        selector: "route_identity",
        recordId: row.route_record_id,
        recordKind: "route" as const,
        primaryDisposition: row.reviewed_non_projectable_disposition,
        studyProjectable: false,
        waiver: true,
        reviewedAt: row.disposition_reviewed_at,
        reviewedBy: "route-identity-dispositions-v1",
        reason: row.disposition_reason,
        evidenceIds: [...row.disposition_evidence_ids],
        decisionJson: row as unknown as JsonValue,
      };
    });
  return {
    dispositions: [...loaded.relationshipDispositions.map((decision) => ({
      decisionId: decision.decision_id,
      contractId: decision.contract_id,
      selector: decision.selector,
      recordId: decision.record_id,
      recordKind: decision.record_kind,
      primaryDisposition: decision.primary_disposition,
      studyProjectable: decision.study_projectable,
      waiver: decision.waiver,
      reviewedAt: decision.reviewed_at,
      reviewedBy: decision.reviewed_by,
      reason: decision.reason,
      evidenceIds: [...decision.evidence_ids],
      decisionJson: decision as unknown as JsonValue,
    })), ...routeDispositions].sort((left, right) => left.decisionId.localeCompare(right.decisionId)),
    subjects,
    findings,
    selectorContracts,
    enforcement: {
      contractId: RELATIONSHIP_COMPLETENESS_CONTRACT_ID,
      mode,
      hardModeReady: loaded.summary.enforcement_migration.hard_mode_ready,
      inputFingerprint: loaded.summary.input_fingerprint,
      criteriaJson: loaded.summary.enforcement_migration as unknown as JsonValue,
    },
  };
}

export function syncRelationshipCompletenessToCanonicalDb(
  loaded: LoadedRelationshipCompletenessArtifacts,
) {
  const relationshipMode = relationshipContractValidationMode(loadRelationshipContract());
  const mode = relationshipMode === "enforce" ? "enforce" : "warning";
  if (mode === "enforce" && !loaded.summary.enforcement_migration.hard_mode_ready) {
    throw new Error(
      `relationship completeness enforcement criteria are not ready for ${loaded.summary.release_id}; ` +
      `warning backlog=${Object.values(loaded.summary.warning_instances_by_code).reduce((sum, count) => sum + count, 0)}`,
    );
  }
  const path = canonicalDbPath();
  if (!existsSync(path)) throw new Error(`canonical.db not found at ${path}; re-run materialize`);
  const db = openCanonicalDb(path, { readonly: true });
  let records: MtaCanonicalRecord[];
  let submissions: Array<{ submission_id: string; run_id: string }>;
  let identitySupersessions: Array<{ identity: string; canonicalRecordId: string }>;
  try {
    records = readCanonicalRecordsFromDb(db);
    submissions = (db.query(
      "SELECT DISTINCT submission_id, run_id FROM record_submissions WHERE run_id IS NOT NULL ORDER BY submission_id",
    ).all() as Array<{ submission_id: string; run_id: string }>);
    identitySupersessions = (db.query(
      `SELECT identity_value AS identity, canonical_record_id AS canonicalRecordId
       FROM canonical_identities
       WHERE identity_class = 'superseded'
       ORDER BY identity_value, canonical_record_id`,
    ).all() as Array<{ identity: string; canonicalRecordId: string }>);
  } finally {
    db.close();
  }
  const dispositionIssues = validateRelationshipDispositionLedger(records, {
    decisions: loaded.relationshipDispositions,
    byRecordId: new Map(loaded.relationshipDispositions.map((decision) => [decision.record_id, decision])),
  });
  if (dispositionIssues.length > 0) {
    throw new Error(`Cannot mirror relationship dispositions into canonical.db:\n${dispositionIssues.join("\n")}`);
  }
  const audit = auditRelationshipGraph(records, { mode: mode === "enforce" ? "enforce" : "warn", includeOrphans: false });
  const errors = audit.findings.filter((finding) => finding.severity === "error");
  if (errors.length > 0) {
    throw new Error(`Cannot mirror relationship completeness with ${errors.length} graph error(s)`);
  }
  return rebuildCanonicalDb(records, {
    // rebuildCanonicalDb only consumes these two provenance keys. The canonical DB remains the
    // sole read store for this derived-store refresh; producer journals are not rematerialized.
    submissions: submissions as import("@mta-wiki/db/types").MtaSubmissionEntry[],
    identitySupersessions,
    relationshipFindings: audit.findings,
    relationshipCompleteness: relationshipCompletenessDbMirror(loaded, mode),
  });
}

export function writeRelationshipCompletenessArtifacts(
  options: WriteRelationshipCompletenessArtifactsOptions = {},
): WriteRelationshipCompletenessArtifactsResult {
  const loaded = loadRelationshipCompletenessArtifacts(options);
  mkdirSync(loaded.outputDir, { recursive: true });
  for (const [name, content] of Object.entries(loaded.contents).sort(([left], [right]) => left.localeCompare(right))) {
    writeFileSync(join(loaded.outputDir, name), content, "utf8");
  }
  return { outputDir: loaded.outputDir, summary: loaded.summary, manifest: loaded.manifest };
}

export function relationshipCompletenessReproductionCommand(
  rootDir = repoRoot,
  options: Pick<WriteRelationshipCompletenessArtifactsOptions, "reviewedCurrentCorpusMigration"> = {},
): string {
  return `cd ${relative(process.cwd(), rootDir) || "."} && ` +
    (options.reviewedCurrentCorpusMigration
      ? REVIEWED_CURRENT_CORPUS_MIGRATION_REPRODUCTION_COMMAND
      : DEFAULT_RELATIONSHIP_COMPLETENESS_REPRODUCTION_COMMAND);
}
