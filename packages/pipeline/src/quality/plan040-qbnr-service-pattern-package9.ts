import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  memberGrainDecisionKey,
  parseMemberGrainDecision,
  type MemberGrainDecision,
} from "./member-grain-decisions.js";
import type { Plan040Package8VersionSeparation } from "./plan040-qbnr-service-pattern-package8.js";
import {
  extentDecisionKey,
  validateMemberExtentDecision,
  type MemberExtentDecision,
} from "./study-readiness-v1.js";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9 =
  "plan-040-qbnr-service-pattern-package-9-evidence-only-v1" as const;
export const PLAN040_PACKAGE_9_CANDIDATE_KEY_SHA256 =
  "ea37749a45575b8752a3a984ea57218f272fa251072bed23ef02f91e4b69a0b7" as const;
export const PLAN040_PACKAGE_9_WAVE_A_KEY_SHA256 =
  "ce5aad42d4df6d284574401a755c9786198fcacc36810e2e75d5f49a601433f9" as const;
export const PLAN040_PACKAGE_9_WAVE_B_KEY_SHA256 =
  "2f57e1d94cc4d56f30afa5929c8fe15caabb2e081febb44f51d13b0d38f67516" as const;

export const PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS = {
  package_2: {
    acquisition:
      "f7b8a17c27c7d09f025dbcb7448099fe60bbc59147acac236f05875bada38a39",
    evidence:
      "48acf849f9d66508d4a8253c102bfaf04758a619603d7d79aeaaf83c2cc5958e",
    draft:
      "ade4e511ab132d3b8eb4f7fa2225dcab0e84d8e8921cc5bd7e3c3126fb61ba5a",
  },
  package_4: {
    acquisition:
      "3f804faabcbb769d037033eeeececda59fd93a3052a2d739f16680b1befe9431",
    evidence:
      "f105bd93bfeb2b0504e9819885f55d67c77e14840836dbc58ab06ced5b6c2072",
    draft:
      "04fc4c0168eda1081ed5338b77794ba61be4c1346854ed1f9a628945607113ed",
  },
  package_8: {
    evidence:
      "3ee567af00c9eab1a50b823674cddc36f554a475b7e485f0fab3cd257858c192",
    draft:
      "a5e53299617523fa152072a55ca2fa1f9e9515750d6595a9706c737f0c3db152",
  },
  service_change_html:
    "4b5dc9ca398980a3803e076378acefd7ac3ec04343e0ac32db95a17c1d51226d",
  treatment_components:
    "a9b76c3b7121fc87d0f190a44fb00f182229d8d309968d3ba00a8c27a1492bae",
  main_schedule_source:
    "c592686da8a1cabdc8b559db4d4ae15d5a663adbe08f332e196215fd377be7c5",
  x63_x68_schedule: {
    receipt:
      "c4d9bee3669c57d30cec6d2dc3b752c94357573a53042aa5d9b4256c901d9a66",
    source:
      "c2e6c6e85dc7b4e8d3a443b668b4d1af36af952af83f92ab4972ea792d74c9d8",
    blocks:
      "f22cd51f47446dcb22b76ebba572c0653128b3033dc8aeccee3e2b788a3c8006",
  },
  q61_lineage:
    "474022382ec0abe89c632bec3147bbf46c0b0fcd12e940d3ef5f16cc1631622a",
  extent_ledger:
    "02b88ffa272b12fa7de655089d2c313b70b3e16d2f564d20267cfd2bce1b00a8",
  grain_ledger:
    "7d259e04bca44e2628e86dea8dea285e34cf8d7a1b1f65c520a9b65420a8f4f3",
} as const;

export const PLAN040_PACKAGE_9_WAVES = [
  {
    wave_id: "P9-A",
    label: "explicit_cross_route_predecessor_lineage",
    candidate_count: 11,
    route_count: 6,
    positive_count: 0,
    unresolved_count: 11,
    review_mode: "dual_independent_lineage_risk_review",
    candidate_key_sha256: PLAN040_PACKAGE_9_WAVE_A_KEY_SHA256,
  },
  {
    wave_id: "P9-B",
    label: "cross_family_predecessor_inventory",
    candidate_count: 11,
    route_count: 4,
    positive_count: 2,
    unresolved_count: 9,
    review_mode: "dual_independent_cross_family_risk_review",
    candidate_key_sha256: PLAN040_PACKAGE_9_WAVE_B_KEY_SHA256,
  },
] as const;

export type Plan040Package9WaveId =
  (typeof PLAN040_PACKAGE_9_WAVES)[number]["wave_id"];

export const PLAN040_PACKAGE_9_CANDIDATES = [
  ["P9-A", "Q15", "treatment_q15-154-street-replacement-2025"],
  ["P9-A", "Q15", "treatment_q15-q15a-routing-2025"],
  ["P9-A", "Q112", "treatment_q112-east-new-york-extension-2025"],
  ["P9-A", "Q1", "treatment_q1-springfield-service-replacement-2025"],
  ["P9-A", "Q12", "treatment_q12-sanford-service-replacement-2025"],
  ["P9-A", "Q30", "treatment_q30-q75-terminal-replacement-2025"],
  ["P9-A", "Q65", "treatment_q65-college-point-segment-replacement-2025"],
  ["P9-A", "Q65", "treatment_q65-flushing-reroute-2025"],
  ["P9-A", "Q65", "treatment_q65-flushing-shortening-2025"],
  ["P9-A", "Q65", "treatment_q65-limited-discontinuation-2025"],
  ["P9-A", "Q65", "treatment_q65-q12-service-replacement-2025"],
  ["P9-B", "QM63", "treatment_qm63-avenue-service-discontinuation-2025"],
  ["P9-B", "QM63", "treatment_qm63-frequency-span-adjustment-2025"],
  ["P9-B", "QM63", "treatment_qm63-queens-reroute-2025"],
  ["P9-B", "QM63", "treatment_qm63-route-rename-2025"],
  ["P9-B", "Q26", "treatment_q26-college-point-extension-2025"],
  ["P9-B", "Q26", "treatment_q26-flushing-reroute-2025"],
  ["P9-B", "Q26", "treatment_q26-frequency-span-adjustment-2025"],
  ["P9-B", "Q26", "treatment_q26-q65-service-replacement-2025"],
  ["P9-B", "Q38", "treatment_q38-northern-segment-replacement-2025"],
  ["P9-B", "Q38", "treatment_q38-route-split-2025"],
  ["P9-B", "QM68", "treatment_qm68-avenue-service-discontinuation-2025"],
] as const;

export type Plan040Package9RouteId =
  (typeof PLAN040_PACKAGE_9_CANDIDATES)[number][1];

export type Plan040Package9Outcome = "positive" | "unresolved";

export const PLAN040_PACKAGE_9_EXPECTED_OUTCOMES: Record<
  (typeof PLAN040_PACKAGE_9_CANDIDATES)[number][2],
  Plan040Package9Outcome
> = Object.fromEntries(
  PLAN040_PACKAGE_9_CANDIDATES.map(([, , treatmentId]) => [
    treatmentId,
    [
      "treatment_qm63-frequency-span-adjustment-2025",
      "treatment_qm63-route-rename-2025",
    ].includes(treatmentId) ? "positive" : "unresolved",
  ]),
) as Record<
  (typeof PLAN040_PACKAGE_9_CANDIDATES)[number][2],
  Plan040Package9Outcome
>;

export type Plan040Package9FeedFamily = "queens" | "busco";
export type Plan040Package9InventoryTransitionClassification =
  | "same_family_same_route_id"
  | "cross_feed_family_same_route_id"
  | "same_family_predecessor_route_rename";

export type Plan040Package9InventoryTransitionSpec = {
  pre_feed_family: Plan040Package9FeedFamily;
  post_feed_family: Plan040Package9FeedFamily;
  pre_route_id: string;
  post_route_id: string;
  classification: Plan040Package9InventoryTransitionClassification;
};

export const PLAN040_PACKAGE_9_INVENTORY_TRANSITIONS: Record<
  Plan040Package9RouteId,
  Plan040Package9InventoryTransitionSpec
> = {
  Q1: {
    pre_feed_family: "queens",
    post_feed_family: "queens",
    pre_route_id: "Q1",
    post_route_id: "Q1",
    classification: "same_family_same_route_id",
  },
  Q112: {
    pre_feed_family: "busco",
    post_feed_family: "busco",
    pre_route_id: "Q112",
    post_route_id: "Q112",
    classification: "same_family_same_route_id",
  },
  Q12: {
    pre_feed_family: "queens",
    post_feed_family: "queens",
    pre_route_id: "Q12",
    post_route_id: "Q12",
    classification: "same_family_same_route_id",
  },
  Q15: {
    pre_feed_family: "queens",
    post_feed_family: "queens",
    pre_route_id: "Q15",
    post_route_id: "Q15",
    classification: "same_family_same_route_id",
  },
  Q26: {
    pre_feed_family: "queens",
    post_feed_family: "busco",
    pre_route_id: "Q26",
    post_route_id: "Q26",
    classification: "cross_feed_family_same_route_id",
  },
  Q30: {
    pre_feed_family: "queens",
    post_feed_family: "queens",
    pre_route_id: "Q30",
    post_route_id: "Q30",
    classification: "same_family_same_route_id",
  },
  Q38: {
    pre_feed_family: "busco",
    post_feed_family: "queens",
    pre_route_id: "Q38",
    post_route_id: "Q38",
    classification: "cross_feed_family_same_route_id",
  },
  Q65: {
    pre_feed_family: "busco",
    post_feed_family: "busco",
    pre_route_id: "Q65",
    post_route_id: "Q65",
    classification: "same_family_same_route_id",
  },
  QM63: {
    pre_feed_family: "queens",
    post_feed_family: "queens",
    pre_route_id: "X63",
    post_route_id: "QM63",
    classification: "same_family_predecessor_route_rename",
  },
  QM68: {
    pre_feed_family: "queens",
    post_feed_family: "queens",
    pre_route_id: "X68",
    post_route_id: "QM68",
    classification: "same_family_predecessor_route_rename",
  },
};

export type Plan040Package9ServiceSpanSlice = {
  source_id: string;
  source_csv_sha256: string;
  route_id: string;
  schedule_date: string;
  passenger_policy: "any_trip_type_except_2_3_4";
  by_direction: Array<{
    direction: string;
    first_departure: string;
    last_departure: string;
    trip_count: number;
    departure_time_sha256: string;
  }>;
};

export type Plan040Package9LineageSpec = {
  relation:
    | "replacement"
    | "routing_inheritance"
    | "extension_on_current_routing"
    | "route_rename"
    | "route_split"
    | "same_route_change";
  named_from_routes: string[];
  named_to_routes: string[];
  cross_route: boolean;
};

export const PLAN040_PACKAGE_9_LINEAGE_SPECS: Record<
  (typeof PLAN040_PACKAGE_9_CANDIDATES)[number][2],
  Plan040Package9LineageSpec
> = {
  "treatment_q15-154-street-replacement-2025": {
    relation: "replacement",
    named_from_routes: ["Q15"],
    named_to_routes: ["Q61"],
    cross_route: true,
  },
  "treatment_q15-q15a-routing-2025": {
    relation: "routing_inheritance",
    named_from_routes: ["Q15A"],
    named_to_routes: ["Q15"],
    cross_route: true,
  },
  "treatment_q112-east-new-york-extension-2025": {
    relation: "extension_on_current_routing",
    named_from_routes: ["Q7"],
    named_to_routes: ["Q112"],
    cross_route: true,
  },
  "treatment_q1-springfield-service-replacement-2025": {
    relation: "replacement",
    named_from_routes: ["Q1"],
    named_to_routes: ["Q36"],
    cross_route: true,
  },
  "treatment_q12-sanford-service-replacement-2025": {
    relation: "replacement",
    named_from_routes: ["Q12"],
    named_to_routes: ["Q13", "Q65"],
    cross_route: true,
  },
  "treatment_q30-q75-terminal-replacement-2025": {
    relation: "replacement",
    named_from_routes: ["Q30"],
    named_to_routes: ["Q75"],
    cross_route: true,
  },
  "treatment_q65-college-point-segment-replacement-2025": {
    relation: "replacement",
    named_from_routes: ["Q65"],
    named_to_routes: ["Q26"],
    cross_route: true,
  },
  "treatment_q65-flushing-reroute-2025": {
    relation: "same_route_change",
    named_from_routes: ["Q65"],
    named_to_routes: ["Q65"],
    cross_route: false,
  },
  "treatment_q65-flushing-shortening-2025": {
    relation: "same_route_change",
    named_from_routes: ["Q65"],
    named_to_routes: ["Q65"],
    cross_route: false,
  },
  "treatment_q65-limited-discontinuation-2025": {
    relation: "same_route_change",
    named_from_routes: ["Q65"],
    named_to_routes: ["Q65"],
    cross_route: false,
  },
  "treatment_q65-q12-service-replacement-2025": {
    relation: "replacement",
    named_from_routes: ["Q12"],
    named_to_routes: ["Q65"],
    cross_route: true,
  },
  "treatment_qm63-avenue-service-discontinuation-2025": {
    relation: "route_rename",
    named_from_routes: ["X63"],
    named_to_routes: ["QM63"],
    cross_route: true,
  },
  "treatment_qm63-frequency-span-adjustment-2025": {
    relation: "route_rename",
    named_from_routes: ["X63"],
    named_to_routes: ["QM63"],
    cross_route: true,
  },
  "treatment_qm63-queens-reroute-2025": {
    relation: "route_rename",
    named_from_routes: ["X63"],
    named_to_routes: ["QM63"],
    cross_route: true,
  },
  "treatment_qm63-route-rename-2025": {
    relation: "route_rename",
    named_from_routes: ["X63"],
    named_to_routes: ["QM63"],
    cross_route: true,
  },
  "treatment_q26-college-point-extension-2025": {
    relation: "same_route_change",
    named_from_routes: ["Q26"],
    named_to_routes: ["Q26"],
    cross_route: false,
  },
  "treatment_q26-flushing-reroute-2025": {
    relation: "same_route_change",
    named_from_routes: ["Q26"],
    named_to_routes: ["Q26"],
    cross_route: false,
  },
  "treatment_q26-frequency-span-adjustment-2025": {
    relation: "same_route_change",
    named_from_routes: ["Q26"],
    named_to_routes: ["Q26"],
    cross_route: false,
  },
  "treatment_q26-q65-service-replacement-2025": {
    relation: "replacement",
    named_from_routes: ["Q65"],
    named_to_routes: ["Q26"],
    cross_route: true,
  },
  "treatment_q38-northern-segment-replacement-2025": {
    relation: "replacement",
    named_from_routes: ["Q38"],
    named_to_routes: ["Q14"],
    cross_route: true,
  },
  "treatment_q38-route-split-2025": {
    relation: "route_split",
    named_from_routes: ["Q38"],
    named_to_routes: ["Q38", "Q14"],
    cross_route: true,
  },
  "treatment_qm68-avenue-service-discontinuation-2025": {
    relation: "route_rename",
    named_from_routes: ["X68"],
    named_to_routes: ["QM68"],
    cross_route: true,
  },
};

export const PLAN040_PACKAGE_9_Q61_OWNER_WARNING =
  "Former Q15, Q34, and new Q61 attribution is not ready-made lineage: retain each candidate-specific statement and reviewed chain separately; do not infer same-member identity." as const;

export type Plan040Package9CandidateEvidence = {
  candidate_key: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id:
    (typeof PLAN040_PACKAGE_9_CANDIDATES)[number][2];
  treatment_family: "service_pattern";
  gtfs_route_id: Plan040Package9RouteId;
  risk_wave_id: Plan040Package9WaveId;
  source_statement: {
    source_id: "mta_queens_bus_network_redesign_service_changes";
    evidence_id: string;
    block_id: string;
    block_sha256: string;
    treatment_kind: string;
    raw_text: string;
  };
  source_row: {
    source_html_sha256:
      typeof PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.service_change_html;
    route_row: Plan040Package9RouteId;
    row_sha256: string;
    implementation_statement: string;
    candidate_change_context: string[];
  };
  immutable_candidate_context: {
    origin: "package_2" | "package_4";
    evidence_path: string;
    evidence_sha256: string;
    stop_removal_candidate_key: string;
    prior_candidate_sha256: string;
    pre_source_id: string;
    post_source_id: string;
    pre_gtfs_route_id: string;
    post_gtfs_route_id: string;
    pre_target_date: string;
    post_target_date: string;
  };
  inventory_transition: Plan040Package9InventoryTransitionSpec & {
    evidence_basis: "accepted_launch_feed_inventory";
    same_feed_family_is_identity: false;
    same_route_id_is_identity: false;
    cross_feed_family_equivalence_authorized: false;
    automatic_predecessor_route_id_equivalence_authorized: false;
    explicit_route_rename_statement: {
      treatment_record_id:
        | "treatment_qm63-route-rename-2025"
        | "treatment_qm68-route-rename-2025";
      evidence_id: string;
      raw_text: string;
    } | null;
    reviewed_predecessor_successor_lineage_authorized: boolean;
  };
  schedule_trip_type_validation: {
    passenger_policy: "any_trip_type_except_2_3_4";
    excluded_nonrevenue_trip_types: ["2", "3", "4"];
    pre: Record<string, JsonValue>;
    post: Record<string, JsonValue>;
    pre_unmatched_pattern_count: number;
    post_unmatched_pattern_count: number;
    unmatched_patterns_retained_for_review: true;
    x63_x68_supplemental_source_used: boolean;
  };
  ordered_full_stop_evidence: {
    calendar_and_calendar_dates_expanded: true;
    automatic_equivalence: "identical_stop_id_only";
    name_coordinate_or_proximity_equivalence: false;
    pre_patterns: Array<Record<string, JsonValue>>;
    post_patterns: Array<Record<string, JsonValue>>;
    comparisons: Array<Record<string, JsonValue>>;
    complete_ordered_stop_chains: true;
    candidate_route_context_is_nonexclusive: true;
  };
  lineage_review: Plan040Package9LineageSpec & {
    candidate_statement_bound_separately: true;
    same_member_lineage_authorized: boolean;
    automatic_route_id_equivalence_authorized: false;
    review_status:
      | "reviewed_candidate_specific_lineage_authorized"
      | "reviewed_unresolved";
    q61_owner_warning: typeof PLAN040_PACKAGE_9_Q61_OWNER_WARNING | null;
  };
  service_modality_assessment: {
    assessment_status:
      | "complete_route_wide_all_service"
      | "complete_route_wide_structured_periods"
      | "blocked";
    positive_basis_codes: string[];
    blocking_gap_codes: string[];
    structured_periods: string[];
    structured_directions: string[];
    structured_pattern_ids: string[];
    exact_pre_span: Plan040Package9ServiceSpanSlice | null;
    exact_post_span: Plan040Package9ServiceSpanSlice | null;
  };
  exact_candidate_searches: string[];
  ledger_snapshot: {
    extent_verdict: "unreviewed";
    grain_verdict: "unreviewed";
    grain_spatial_verdict: "unreviewed";
    current_extent_kind: "unresolved";
    extent_receipt_ids: [];
    grain_receipt_ids: [];
    extent_decision_id: null;
    grain_decision_id: null;
    extent_updated_at: null;
    grain_updated_at: null;
  };
  unresolved_gap_codes: string[];
  evidence_verdict:
    | "evidence_complete_positive_draft"
    | "receipt_terminal_unresolved";
  proposed_extent_decision: MemberExtentDecision | null;
  proposed_grain_decision: MemberGrainDecision | null;
  persisted_extent_decision: null;
  persisted_grain_decision: null;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package9Draft = {
  schema_version: 1;
  package_id: typeof PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9;
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 22;
  route_count: 10;
  candidate_key_sha256:
    typeof PLAN040_PACKAGE_9_CANDIDATE_KEY_SHA256;
  wave_partition: typeof PLAN040_PACKAGE_9_WAVES;
  evidence_verdict_distribution: {
    evidence_complete_positive_draft: 2;
    receipt_terminal_unresolved: 20;
  };
  proposed_extent_distribution: { route_wide: 2; unresolved: 20 };
  proposed_grain_distribution: {
    all_service: 1;
    periods: 1;
    unresolved: 20;
  };
  proposed_extent_decision_count: 2;
  proposed_grain_decision_count: 2;
  persisted_extent_decision_count: 0;
  persisted_grain_decision_count: 0;
  prior_package_overlap: Record<
    | "exemplar"
    | "package_2"
    | "package_4"
    | "package_5"
    | "package_6"
    | "package_7"
    | "package_8",
    0
  >;
  candidates: Plan040Package9CandidateEvidence[];
  version_separation: Plan040Package8VersionSeparation;
  identity_policy: {
    automatic_equivalence: "identical_stop_id_only";
    name_coordinate_or_proximity_equivalence: false;
    cross_route_presence_is_identity: false;
    route_rename_is_automatic_id_equivalence: false;
    occurrence_inference_from_schedule_or_route_name: false;
  };
  review_protocol: {
    dual_independent_review_required: true;
    review_unit: "P9-A_and_P9-B";
    owner_gate_allowed_before_dual_review: false;
    persistence_allowed_before_owner_gate: false;
  };
  authorization_state:
    "evidence_and_decision_draft_pending_dual_independent_lineage_review_no_gate_no_acceptance_no_persistence";
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export function plan040Package9ReplayHash(value: JsonValue): string {
  return sha256(`${stableJson(value)}\n`);
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left as JsonValue) === stableJson(right as JsonValue);
}

function validateVersionSeparation(
  versionSeparation: Plan040Package8VersionSeparation,
): void {
  if (
    versionSeparation.published_launch_diff.comparison_role !==
      "published_launch_diff" ||
    versionSeparation.published_launch_diff.status !==
      "completed_from_accepted_initial_feed_bytes" ||
    versionSeparation.published_launch_diff.correction_bytes_used ||
    versionSeparation.published_launch_diff.correction_version_sha1s_used
        .length !== 0 ||
    versionSeparation.corrected_first_week_diff.comparison_role !==
      "corrected_first_week_diff" ||
    versionSeparation.corrected_first_week_diff.status !==
      "blocked_not_run" ||
    versionSeparation.corrected_first_week_diff.comparison_run ||
    versionSeparation.corrected_first_week_diff.correction_bytes_used ||
    versionSeparation.corrected_first_week_diff.corrected_diff_used ||
    versionSeparation.corrected_first_week_diff
      .published_launch_outcomes_reclassified ||
    versionSeparation.corrected_first_week_diff.corrections.queens
        .version_sha1 !== "6db867de2ce30f47ae0ee763f422dc34fb7a9f9f" ||
    versionSeparation.corrected_first_week_diff.corrections.busco
        .version_sha1 !== "a35da13d0a8c311de05d3558e9e80d2a472c21d2" ||
    versionSeparation.corrected_first_week_diff.corrections.queens
        .correction_bytes_used ||
    versionSeparation.corrected_first_week_diff.corrections.busco
        .correction_bytes_used
  ) {
    throw new Error(
      "Plan 040 Package 9 correction-version separation drifted or mixed",
    );
  }
}

function validateScheduleSlice(slice: Record<string, JsonValue>): void {
  const shapeRows = slice.shape_trip_type_rows;
  const passengerShapes = slice.passenger_shape_ids;
  const nonrevenueShapes = slice.nonrevenue_shape_ids;
  if (
    !Array.isArray(shapeRows) ||
    !Array.isArray(passengerShapes) ||
    !Array.isArray(nonrevenueShapes)
  ) {
    throw new Error("Plan 040 Package 9 schedule slice is incomplete");
  }
  const passenger = new Set<string>();
  const nonrevenue = new Set<string>();
  for (const raw of shapeRows) {
    const row = raw as {
      shape_id?: unknown;
      trip_type_rows?: unknown;
    };
    if (
      typeof row.shape_id !== "string" ||
      !row.trip_type_rows ||
      typeof row.trip_type_rows !== "object" ||
      Array.isArray(row.trip_type_rows)
    ) {
      throw new Error("Plan 040 Package 9 schedule shape row is malformed");
    }
    const types = Object.keys(row.trip_type_rows as Record<string, unknown>);
    if (types.some((type) => !["2", "3", "4"].includes(type))) {
      passenger.add(row.shape_id);
    } else {
      nonrevenue.add(row.shape_id);
    }
  }
  if (
    !sameJson([...passenger].sort(), [...passengerShapes].sort()) ||
    !sameJson([...nonrevenue].sort(), [...nonrevenueShapes].sort())
  ) {
    throw new Error(
      "Plan 040 Package 9 schedule trip_type classification drifted",
    );
  }
}

function validateOrderedStopAndComparisonEvidence(
  candidate: Plan040Package9CandidateEvidence,
): void {
  for (const [index, pattern] of [
    ...candidate.ordered_full_stop_evidence.pre_patterns,
    ...candidate.ordered_full_stop_evidence.post_patterns,
  ].entries()) {
    if (!Array.isArray(pattern.stops) || pattern.stops.length === 0) {
      throw new Error(
        `${candidate.treatment_record_id}: ordered pattern ${index} is empty`,
      );
    }
    for (const [stopIndex, rawStop] of pattern.stops.entries()) {
      if (
        !rawStop ||
        typeof rawStop !== "object" ||
        Array.isArray(rawStop) ||
        typeof rawStop.stop_id !== "string" ||
        rawStop.stop_id.trim().length === 0
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: ordered pattern ${index} stop ${stopIndex} lacks an exact stop ID`,
        );
      }
    }
  }
  for (
    const [comparisonIndex, comparison] of
      candidate.ordered_full_stop_evidence.comparisons.entries()
  ) {
    if (!Array.isArray(comparison.equivalences)) {
      throw new Error(
        `${candidate.treatment_record_id}: comparison ${comparisonIndex} equivalences are missing`,
      );
    }
    for (
      const [equivalenceIndex, rawEquivalence] of
        comparison.equivalences.entries()
    ) {
      if (
        !rawEquivalence ||
        typeof rawEquivalence !== "object" ||
        Array.isArray(rawEquivalence)
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: comparison ${comparisonIndex} equivalence ${equivalenceIndex} is malformed`,
        );
      }
      const equivalence = rawEquivalence as Record<string, JsonValue>;
      if (
        equivalence.equivalence_basis !== "identical_stop_id" ||
        typeof equivalence.before_stop_id !== "string" ||
        equivalence.before_stop_id.trim().length === 0 ||
        typeof equivalence.after_stop_id !== "string" ||
        equivalence.after_stop_id.trim().length === 0 ||
        equivalence.before_stop_id !== equivalence.after_stop_id
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: comparison ${comparisonIndex} contains forbidden non-identical-stop equivalence`,
        );
      }
    }
  }
}

export function buildPlan040Package9Draft(input: {
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package9CandidateEvidence[];
  versionSeparation: Plan040Package8VersionSeparation;
  priorCandidateKeys: Record<
    | "exemplar"
    | "package_2"
    | "package_4"
    | "package_5"
    | "package_6"
    | "package_7"
    | "package_8",
    string[]
  >;
}): Plan040Package9Draft {
  validateVersionSeparation(input.versionSeparation);
  const expected = new Map(
    PLAN040_PACKAGE_9_CANDIDATES.map(([waveId, routeId, treatmentId]) => [
      treatmentId,
      { waveId, routeId },
    ]),
  );
  const byTreatment = new Map(input.candidates.map((candidate) => [
    candidate.treatment_record_id,
    candidate,
  ]));
  if (
    input.candidates.length !== 22 ||
    byTreatment.size !== 22 ||
    [...expected.keys()].some((id) => !byTreatment.has(id))
  ) {
    throw new Error("Plan 040 Package 9 requires exact 22-treatment parity");
  }
  const candidates = PLAN040_PACKAGE_9_CANDIDATES.map(([, , id]) =>
    byTreatment.get(id)!);
  const keys = candidates.map((candidate) => candidate.candidate_key).sort();
  const waveAKeys = candidates
    .filter((candidate) => candidate.risk_wave_id === "P9-A")
    .map((candidate) => candidate.candidate_key)
    .sort();
  const waveBKeys = candidates
    .filter((candidate) => candidate.risk_wave_id === "P9-B")
    .map((candidate) => candidate.candidate_key)
    .sort();
  if (
    new Set(keys).size !== 22 ||
    sha256(`${keys.join("\n")}\n`) !==
      PLAN040_PACKAGE_9_CANDIDATE_KEY_SHA256 ||
    sha256(`${waveAKeys.join("\n")}\n`) !==
      PLAN040_PACKAGE_9_WAVE_A_KEY_SHA256 ||
    sha256(`${waveBKeys.join("\n")}\n`) !==
      PLAN040_PACKAGE_9_WAVE_B_KEY_SHA256
  ) {
    throw new Error("Plan 040 Package 9 candidate-key scope drifted");
  }
  if (
    new Set(candidates.map((candidate) => candidate.gtfs_route_id)).size !==
      10
  ) {
    throw new Error("Plan 040 Package 9 requires exact 10-route parity");
  }

  for (const candidate of candidates) {
    const spec = expected.get(candidate.treatment_record_id)!;
    const lineage = PLAN040_PACKAGE_9_LINEAGE_SPECS[
      candidate.treatment_record_id
    ];
    const expectedOutcome =
      PLAN040_PACKAGE_9_EXPECTED_OUTCOMES[candidate.treatment_record_id];
    const inventory =
      PLAN040_PACKAGE_9_INVENTORY_TRANSITIONS[candidate.gtfs_route_id];
    validateScheduleSlice(candidate.schedule_trip_type_validation.pre);
    validateScheduleSlice(candidate.schedule_trip_type_validation.post);
    validateOrderedStopAndComparisonEvidence(candidate);
    if (
      candidate.risk_wave_id !== spec.waveId ||
      candidate.gtfs_route_id !== spec.routeId ||
      candidate.treatment_family !== "service_pattern" ||
      candidate.source_statement.source_id !==
        "mta_queens_bus_network_redesign_service_changes" ||
      candidate.source_statement.raw_text.trim().length === 0 ||
      candidate.source_statement.evidence_id.trim().length === 0 ||
      candidate.source_row.source_html_sha256 !==
        PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.service_change_html ||
      candidate.source_row.route_row !== candidate.gtfs_route_id ||
      candidate.exact_candidate_searches.length < 4 ||
      !sameJson(
        {
          relation: candidate.lineage_review.relation,
          named_from_routes: candidate.lineage_review.named_from_routes,
          named_to_routes: candidate.lineage_review.named_to_routes,
          cross_route: candidate.lineage_review.cross_route,
        },
        lineage,
      ) ||
      !candidate.lineage_review.candidate_statement_bound_separately ||
      candidate.lineage_review.automatic_route_id_equivalence_authorized ||
      candidate.schedule_trip_type_validation.passenger_policy !==
        "any_trip_type_except_2_3_4" ||
      candidate.schedule_trip_type_validation
          .excluded_nonrevenue_trip_types.join(",") !== "2,3,4" ||
      !candidate.schedule_trip_type_validation
        .unmatched_patterns_retained_for_review ||
      !candidate.ordered_full_stop_evidence
        .calendar_and_calendar_dates_expanded ||
      candidate.ordered_full_stop_evidence.automatic_equivalence !==
        "identical_stop_id_only" ||
      candidate.ordered_full_stop_evidence
        .name_coordinate_or_proximity_equivalence ||
      !candidate.ordered_full_stop_evidence.complete_ordered_stop_chains ||
      !candidate.ordered_full_stop_evidence
        .candidate_route_context_is_nonexclusive ||
      !sameJson(
        {
          pre_feed_family:
            candidate.inventory_transition.pre_feed_family,
          post_feed_family:
            candidate.inventory_transition.post_feed_family,
          pre_route_id: candidate.inventory_transition.pre_route_id,
          post_route_id: candidate.inventory_transition.post_route_id,
          classification: candidate.inventory_transition.classification,
        },
        inventory,
      ) ||
      candidate.immutable_candidate_context.pre_gtfs_route_id !==
        inventory.pre_route_id ||
      candidate.immutable_candidate_context.post_gtfs_route_id !==
        inventory.post_route_id ||
      candidate.inventory_transition.evidence_basis !==
        "accepted_launch_feed_inventory" ||
      candidate.inventory_transition.same_feed_family_is_identity ||
      candidate.inventory_transition.same_route_id_is_identity ||
      candidate.inventory_transition
        .cross_feed_family_equivalence_authorized ||
      candidate.inventory_transition
        .automatic_predecessor_route_id_equivalence_authorized ||
      candidate.ledger_snapshot.extent_verdict !== "unreviewed" ||
      candidate.ledger_snapshot.grain_verdict !== "unreviewed" ||
      candidate.ledger_snapshot.grain_spatial_verdict !== "unreviewed" ||
      candidate.ledger_snapshot.current_extent_kind !== "unresolved" ||
      candidate.ledger_snapshot.extent_receipt_ids.length !== 0 ||
      candidate.ledger_snapshot.grain_receipt_ids.length !== 0 ||
      candidate.ledger_snapshot.extent_decision_id !== null ||
      candidate.ledger_snapshot.grain_decision_id !== null ||
      candidate.ledger_snapshot.extent_updated_at !== null ||
      candidate.ledger_snapshot.grain_updated_at !== null ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: Package 9 evidence or authority scope drifted`,
      );
    }
    const isQ61Sensitive = candidate.treatment_record_id ===
      "treatment_q15-154-street-replacement-2025";
    if (
      (isQ61Sensitive &&
        candidate.lineage_review.q61_owner_warning !==
          PLAN040_PACKAGE_9_Q61_OWNER_WARNING) ||
      (!isQ61Sensitive &&
        candidate.lineage_review.q61_owner_warning !== null)
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: Package 9 Q61 warning drifted`,
      );
    }
    const predecessorRename =
      inventory.classification === "same_family_predecessor_route_rename";
    const lineageAuthorized = predecessorRename;
    if (
      candidate.schedule_trip_type_validation
          .x63_x68_supplemental_source_used !== predecessorRename ||
      (predecessorRename &&
        !["QM63", "QM68"].includes(candidate.gtfs_route_id))
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: Package 9 predecessor schedule binding drifted`,
      );
    }
    if (
      candidate.risk_wave_id === "P9-A" &&
      inventory.classification !== "same_family_same_route_id"
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: P9-A must retain same-family/current-route inventory context`,
      );
    }
    const explicitRename =
      candidate.inventory_transition.explicit_route_rename_statement;
    if (
      candidate.inventory_transition
          .reviewed_predecessor_successor_lineage_authorized !==
        lineageAuthorized ||
      candidate.lineage_review.same_member_lineage_authorized !==
        lineageAuthorized ||
      candidate.lineage_review.review_status !==
        (lineageAuthorized
          ? "reviewed_candidate_specific_lineage_authorized"
          : "reviewed_unresolved") ||
      (lineageAuthorized && !explicitRename) ||
      (!lineageAuthorized && explicitRename !== null) ||
      (explicitRename &&
        (explicitRename.raw_text !==
          `The ${inventory.pre_route_id} will be renamed the ${inventory.post_route_id}.` ||
          !explicitRename.evidence_id.trim()))
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: explicit inventory lineage assessment drifted`,
      );
    }
    const mustRetainUnmatched = ["Q26", "Q65"].includes(
      candidate.gtfs_route_id,
    );
    if (
      mustRetainUnmatched &&
      candidate.schedule_trip_type_validation.post_unmatched_pattern_count ===
        0
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: unmatched schedule rows were silently dropped`,
      );
    }

    if (expectedOutcome === "positive") {
      if (
        candidate.evidence_verdict !==
          "evidence_complete_positive_draft" ||
        !candidate.proposed_extent_decision ||
        !candidate.proposed_grain_decision ||
        candidate.unresolved_gap_codes.length !== 0 ||
        candidate.service_modality_assessment.blocking_gap_codes.length !==
          0 ||
        candidate.service_modality_assessment.positive_basis_codes.length ===
          0
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: positive supportability assessment drifted`,
        );
      }
      validateMemberExtentDecision(candidate.proposed_extent_decision);
      const grain = parseMemberGrainDecision(
        candidate.proposed_grain_decision,
        candidate.treatment_record_id,
      );
      if (
        extentDecisionKey(candidate.proposed_extent_decision) !==
          candidate.candidate_key ||
        memberGrainDecisionKey(grain) !== candidate.candidate_key ||
        grain.member_extent_decision_id !==
          candidate.proposed_extent_decision.decision_id ||
        candidate.proposed_extent_decision.resolution !== "route_wide"
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: positive extent/grain link drifted`,
        );
      }
      const isRename = candidate.treatment_record_id ===
        "treatment_qm63-route-rename-2025";
      if (
        candidate.service_modality_assessment.assessment_status !==
          (isRename
            ? "complete_route_wide_all_service"
            : "complete_route_wide_structured_periods") ||
        grain.service_scope.kind !== (isRename ? "all_service" : "periods")
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: positive modality scope drifted`,
        );
      }
      if (
        !isRename &&
        (!candidate.service_modality_assessment.exact_pre_span ||
          !candidate.service_modality_assessment.exact_post_span ||
          !sameJson(
            candidate.service_modality_assessment.structured_periods,
            ["am_peak", "evening", "off_period", "pm_peak"],
          ) ||
          !sameJson(
            candidate.service_modality_assessment.structured_directions,
            ["0", "1"],
          ))
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: frequency/span selectors drifted`,
        );
      }
      if (!isRename) {
        const preSpan =
          candidate.service_modality_assessment.exact_pre_span!;
        const postSpan =
          candidate.service_modality_assessment.exact_post_span!;
        if (
          preSpan.source_csv_sha256 !==
            PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.x63_x68_schedule.source ||
          postSpan.source_csv_sha256 !==
            PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.main_schedule_source ||
          !sameJson(
            preSpan.by_direction.map((row) => ({
              direction: row.direction,
              first_departure: row.first_departure,
              last_departure: row.last_departure,
              trip_count: row.trip_count,
            })),
            [
              {
                direction: "E",
                first_departure: "2025-06-27T15:49:00.000",
                last_departure: "2025-06-27T19:00:00.000",
                trip_count: 14,
              },
              {
                direction: "W",
                first_departure: "2025-06-27T05:21:00.000",
                last_departure: "2025-06-27T08:10:00.000",
                trip_count: 11,
              },
            ],
          ) ||
          !sameJson(
            postSpan.by_direction.map((row) => ({
              direction: row.direction,
              first_departure: row.first_departure,
              last_departure: row.last_departure,
              trip_count: row.trip_count,
            })),
            [
              {
                direction: "E",
                first_departure: "2025-06-30T15:50:00.000",
                last_departure: "2025-06-30T19:00:00.000",
                trip_count: 13,
              },
              {
                direction: "W",
                first_departure: "2025-06-30T05:20:00.000",
                last_departure: "2025-06-30T08:15:00.000",
                trip_count: 11,
              },
            ],
          )
        ) {
          throw new Error(
            `${candidate.treatment_record_id}: exact frequency/span schedule evidence drifted`,
          );
        }
      }
    } else if (
      candidate.evidence_verdict !== "receipt_terminal_unresolved" ||
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0 ||
      candidate.service_modality_assessment.assessment_status !== "blocked" ||
      candidate.service_modality_assessment.blocking_gap_codes.length === 0 ||
      !sameJson(
        candidate.unresolved_gap_codes,
        candidate.service_modality_assessment.blocking_gap_codes,
      )
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: unresolved supportability assessment drifted`,
      );
    }
  }

  for (const wave of PLAN040_PACKAGE_9_WAVES) {
    const rows = candidates.filter((candidate) =>
      candidate.risk_wave_id === wave.wave_id);
    if (
      rows.length !== wave.candidate_count ||
      rows.filter((candidate) =>
        PLAN040_PACKAGE_9_EXPECTED_OUTCOMES[
          candidate.treatment_record_id
        ] === "positive").length !== wave.positive_count ||
      rows.filter((candidate) =>
        PLAN040_PACKAGE_9_EXPECTED_OUTCOMES[
          candidate.treatment_record_id
        ] === "unresolved").length !== wave.unresolved_count
    ) {
      throw new Error(`${wave.wave_id}: risk-wave outcome parity drifted`);
    }
  }

  const candidateKeySet = new Set(keys);
  const priorPackageOverlap = Object.fromEntries(
    Object.entries(input.priorCandidateKeys).map(([name, prior]) => [
      name,
      prior.filter((key) => candidateKeySet.has(key)).length,
    ]),
  ) as Plan040Package9Draft["prior_package_overlap"];
  if (Object.values(priorPackageOverlap).some((count) => count !== 0)) {
    throw new Error("Plan 040 Package 9 overlaps a prior reviewed package");
  }

  return {
    schema_version: 1,
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9,
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 22,
    route_count: 10,
    candidate_key_sha256: PLAN040_PACKAGE_9_CANDIDATE_KEY_SHA256,
    wave_partition: PLAN040_PACKAGE_9_WAVES,
    evidence_verdict_distribution: {
      evidence_complete_positive_draft: 2,
      receipt_terminal_unresolved: 20,
    },
    proposed_extent_distribution: { route_wide: 2, unresolved: 20 },
    proposed_grain_distribution: {
      all_service: 1,
      periods: 1,
      unresolved: 20,
    },
    proposed_extent_decision_count: 2,
    proposed_grain_decision_count: 2,
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    prior_package_overlap: priorPackageOverlap,
    candidates,
    version_separation: input.versionSeparation,
    identity_policy: {
      automatic_equivalence: "identical_stop_id_only",
      name_coordinate_or_proximity_equivalence: false,
      cross_route_presence_is_identity: false,
      route_rename_is_automatic_id_equivalence: false,
      occurrence_inference_from_schedule_or_route_name: false,
    },
    review_protocol: {
      dual_independent_review_required: true,
      review_unit: "P9-A_and_P9-B",
      owner_gate_allowed_before_dual_review: false,
      persistence_allowed_before_owner_gate: false,
    },
    authorization_state:
      "evidence_and_decision_draft_pending_dual_independent_lineage_review_no_gate_no_acceptance_no_persistence",
    external_acquisition_performed: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}
