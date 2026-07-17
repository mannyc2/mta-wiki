/**
 * Versioned SQL-side completeness contract. The pipeline owns the authoritative audit, while
 * these constants keep the derived SQLite mirror fail-closed: enforce mode is admitted only for
 * this exact selector set, and disposition waivers may target only the selector associated with
 * their reviewed record class.
 */
export const RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID =
  "relationship-completeness-v1" as const;

export const RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS = [
  "bus_lane_family_treatment",
  "eligible_occurrence_treatment_physicality",
  "eligible_operational_occurrence",
  "operational_event_family",
  "route_identity",
] as const;

/** Frozen warning inventory for the v1 completeness enforcement migration. Keeping the exact
 * codes in the DB-layer contract prevents a proof artifact from making a backlog disappear by
 * omitting a warning definition or its zero-count bucket. */
export const RELATIONSHIP_COMPLETENESS_REQUIRED_WARNING_CODES = [
  "RC_BUS_LANE_TREATMENT_EVIDENCE_MISSING",
  "RC_BUS_LANE_TREATMENT_SCOPE_OR_DISPOSITION_REQUIRED",
  "RC_BUS_LANE_TREATMENT_SELECTOR_ACCOUNTING_REQUIRED",
  "RC_OCCURRENCE_EVENT_DATE_EVIDENCE_MISSING",
  "RC_OCCURRENCE_GTFS_ROUTE_MISSING",
  "RC_OCCURRENCE_IDENTITY_AMBIGUOUS",
  "RC_OCCURRENCE_IDENTITY_MISSING",
  "RC_OCCURRENCE_ONSET_MISSING",
  "RC_OCCURRENCE_ONSET_PRECISION_INVALID",
  "RC_OCCURRENCE_PHASE_IDENTITY_MISSING",
  "RC_OCCURRENCE_PHASE_RELATION_MISSING",
  "RC_OCCURRENCE_PHYSICALITY_REVIEW_REQUIRED",
  "RC_OCCURRENCE_PHYSICAL_SCOPE_EVIDENCE_MISSING",
  "RC_OCCURRENCE_PHYSICAL_SCOPE_MISSING",
  "RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_INVALID",
  "RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_MISSING",
  "RC_OCCURRENCE_POINT_SCOPE_CONTRACT_REQUIRED",
  "RC_OCCURRENCE_REALIZED_EVENT_IDENTITY_MISSING",
  "RC_OCCURRENCE_REALIZED_IDENTITY_INVALID",
  "RC_OCCURRENCE_ROUTE_IDENTITY_EVIDENCE_MISSING",
  "RC_OCCURRENCE_ROUTE_MISSING",
  "RC_OCCURRENCE_ROUTE_SCOPE_EVIDENCE_MISSING",
  "RC_OCCURRENCE_TIMELINE_EVIDENCE_MISSING",
  "RC_OCCURRENCE_TREATMENT_BUNDLE_EVIDENCE_MISSING",
  "RC_OCCURRENCE_TREATMENT_BUNDLE_IDENTITY_MISSING",
  "RC_OCCURRENCE_TREATMENT_DEFINITION_EVIDENCE_MISSING",
  "RC_OCCURRENCE_TREATMENT_MISSING",
  "RC_OCCURRENCE_TREATMENT_SCOPE_EVIDENCE_MISSING",
  "RC_OPERATIONAL_EVENT_OCCURRENCE_COVERAGE_CONFLICT",
  "RC_OPERATIONAL_EVENT_REVIEW_OR_DISPOSITION_REQUIRED",
  "RC_OPERATIONAL_EVENT_VERSIONED_DISPOSITION_REQUIRED",
  "RC_ROUTE_IDENTITY_ACCOUNTING_REQUIRED",
  "RC_ROUTE_IDENTITY_EVIDENCE_MISSING",
  "RC_TREATMENT_PHYSICALITY_REVIEW_REQUIRED",
] as const;

/**
 * Frozen reviewed bus-lane inventory for the v1 enforcement migration. This is intentionally
 * not derived from the completeness summary: a self-consistent but shrunken summary must not be
 * able to authorize enforcement.
 */
export const RELATIONSHIP_COMPLETENESS_BUS_LANE_INVENTORY_V1 = {
  decisions: {
    path:
      "data/relationship-integrity/dispositions/v1/bus-lane-treatments/decisions.jsonl",
    row_count: 669,
    sha256:
      "6d9e8a5d16bc2066434411e96051400cdbee1617c110266e0b3fbfa22b794439",
  },
  counts_by_primary_disposition: {
    aggregate_or_unbounded_treatment: 110,
    non_lane_supporting_feature: 17,
    non_physical_enforcement_or_control: 42,
    physical_scope_satisfied: 163,
    review_required: 0,
    reviewed_non_projectable_physical_scope_unproven: 337,
  },
} as const;

export type RelationshipCompletenessRequiredSelector =
  (typeof RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS)[number];

export const RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR = {
  bus_lane_family_treatment:
    "bus_lane_family_treatment",
  operational_event: "operational_event_family",
  route_identity: "route_identity",
} as const satisfies Record<string, RelationshipCompletenessRequiredSelector>;
