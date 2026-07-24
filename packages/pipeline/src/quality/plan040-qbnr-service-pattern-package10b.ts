import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  parseMemberGrainDecision,
  type MemberGrainDecision,
} from "./member-grain-decisions.js";
import type {
  MemberExtentLedgerRow,
  MemberGrainLedgerRow,
} from "./member-extent-ledger.js";
import {
  validateMemberExtentDecision,
  type MemberExtentDecision,
} from "./study-readiness-v1.js";
import type { Plan040Package8VersionSeparation } from
  "./plan040-qbnr-service-pattern-package8.js";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B =
  "plan-040-qbnr-service-pattern-package-10b-evidence-only-v1" as const;
export const PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256 =
  "2237cc097f276d0487a042a541fd520e2f2e9f243ff87d269e3297a771686fe8" as const;

export const PLAN040_PACKAGE_10B_CANDIDATES = [
  ["Q82", "treatment_q82-belmont-jamaica-connection-2025"],
  ["Q82", "treatment_q82-q110-hempstead-replacement-2025"],
  ["Q82", "treatment_q82-q36-212-replacement-2025"],
  ["Q89", "treatment_q89-q85-green-acres-replacement-2025"],
] as const;

export const PLAN040_PACKAGE_10B_POST_10A_PINS = {
  extent_ledger:
    "d9961bbb79aafa0f461459a4d9657481b5b68b47f599e6f2064b56326ef8a213",
  grain_ledger:
    "b7105e2fa5c0d58ad05fe6145eb9bf845e765e067f5d902ba344d635fa126fa6",
  bridge:
    "39b6749ba129bb78acd84117a08087fe409b1b000911914ee6419a13cb82c2f5",
  study_manifest:
    "889e79e4729e2159c187044bcdc47e44cdbd1f4b4b0f1b89c22d125abfdd0a7c",
  package_8_evidence:
    "3ee567af00c9eab1a50b823674cddc36f554a475b7e485f0fab3cd257858c192",
  package_8_absence_receipt:
    "0b0e60398c750dc29ab76cbb9d70886f72abe8a42c2c9127fc005eb8d6d1e8b4",
  package_10a_evidence:
    "2d0bb750a8ecec2dcd2f686085669007696f96476aa3fe6af1d1c4156923acc6",
  service_change_html:
    "4b5dc9ca398980a3803e076378acefd7ac3ec04343e0ac32db95a17c1d51226d",
  service_change_blocks:
    "7b46befc331051265d4e7f9ff86ef8dde908474759ec1e94f9cfe28764a28490",
  schedule_csv:
    "c592686da8a1cabdc8b559db4d4ae15d5a663adbe08f332e196215fd377be7c5",
  schedule_receipt:
    "82cc442de9b9c0356965f678c8491a78a093eea8eca06bac29d67747355a58c3",
  schedule_blocks:
    "e12d18baf0ed5f6fb019d877922861df44fd99805f58f5b4b8344de89b71658d",
} as const;

export const PLAN040_PACKAGE_10B_EXCLUSION_HASHES = {
  remaining_risk_8:
    "627520fca31b7091bc65678f596287dad637a2a8b77a793b04862e598a2ec440",
  q67: "0839dcd8540add7e2065ff6027492dcc13f70442b149da5a0fae16ef7fb4ea24",
  q48_q75:
    "9e9184a961b11ade5bc8ed1ce1f6d65818b2cad7fc9f62535012faa302f53b5c",
  limited_stop_siblings:
    "2c2808e1afa357866c3daa2ff1b707fe11cb4cb30699f587260808b006baf7d3",
} as const;

export const PLAN040_PACKAGE_10B_PATTERN_IDS = {
  direction_0:
    "historical-full-stop-pattern:c97d65b9140c8cf53b45d350",
  direction_1:
    "historical-full-stop-pattern:e09dcd02793958baccb601c5",
} as const;

export const PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS = {
  q110_direction_0:
    "historical-full-stop-pattern:709a937ad8704daeaed0cbb1",
  q110_direction_1:
    "historical-full-stop-pattern:473ed9ee3830a5451690eb34",
  q36_direction_0:
    "historical-full-stop-pattern:24f1bc9fad23c06d627e7725",
  q36_direction_1:
    "historical-full-stop-pattern:e38b6ec5c64fbe9be7ca8c08",
} as const;

export const PLAN040_PACKAGE_10B_COMPARISON_IDS = {
  q110_direction_0:
    "historical-full-stop-comparison:e2fe094ff7dd60273ee1e156",
  q110_direction_1:
    "historical-full-stop-comparison:082b077725233b8ac1e9520d",
  q36_direction_0:
    "historical-full-stop-comparison:5734666f6b5e92324405ffb8",
  q36_direction_1:
    "historical-full-stop-comparison:80d91071b9ddd11b83db0e50",
} as const;

export const PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_PINS = {
  q110_direction_0: {
    pattern_id: PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q110_direction_0,
    trip_count: 92,
    trip_id_sha256:
      "43239f083f862df9d8d8e63734558cb1bc20234ff5f7a4a2b19fbcf097f23f4e",
    stop_count: 34,
    stop_chain_sha256:
      "d88fcab6757bddc7ab49f027ce926a9238021abb797e08f715fbff0d68df78cb",
  },
  q110_direction_1: {
    pattern_id: PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q110_direction_1,
    trip_count: 93,
    trip_id_sha256:
      "6f1fdcb34a62e420e88ec3bd27fddfd474c02721d96d71e0a26369a3bd95d4b9",
    stop_count: 34,
    stop_chain_sha256:
      "35d3d3c063486cc12010deedc51905cb9f1368a6bdc19ca2f748b280cedcec46",
  },
  q36_direction_0: {
    pattern_id: PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q36_direction_0,
    trip_count: 69,
    trip_id_sha256:
      "100534f0ca3fc9ce7879a4f612b274247c0a192179be91dec0f358e6ad3d6532",
    stop_count: 38,
    stop_chain_sha256:
      "d23394c85bd51b5e0ee21653b80c969ea0369ff881b21f22d1fd4c185f1e91d2",
  },
  q36_direction_1: {
    pattern_id: PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q36_direction_1,
    trip_count: 69,
    trip_id_sha256:
      "ae968666c69f9b3fd5e08b671e195f7534636ad4f674abd65b42d760e061958a",
    stop_count: 40,
    stop_chain_sha256:
      "912cc11c33950bc4bde7f4de8f878587b41d504f834f665076261b23cfc52ec9",
  },
} as const;

export const PLAN040_PACKAGE_10B_COMPARISON_PINS = {
  q110_direction_0: {
    comparison_id: PLAN040_PACKAGE_10B_COMPARISON_IDS.q110_direction_0,
    full_chain_comparison_sha256:
      "68de60f2d420a7319461679c5fa9207830c9e6baec3235f2451aef20a8296c3e",
    selected_candidate_slice_sha256:
      "893651b8805c6005d5aa736f85cfe1268bfffb09b626a7a3eb4ad99d05ec10f8",
  },
  q110_direction_1: {
    comparison_id: PLAN040_PACKAGE_10B_COMPARISON_IDS.q110_direction_1,
    full_chain_comparison_sha256:
      "4242e93389b40906827a637d5f9fdae831e3adc3afa7efd6002f52cfd47b593c",
    selected_candidate_slice_sha256:
      "8c7d31d19f49588636c07590fadd3a97a96bf8731fb6ef8f14a92793fea1725f",
  },
  q36_direction_0: {
    comparison_id: PLAN040_PACKAGE_10B_COMPARISON_IDS.q36_direction_0,
    full_chain_comparison_sha256:
      "3607c9b3ee3b33a594010c109e89c0d2fa216ec37d9a5a15dcf1ed011e4624f8",
    selected_candidate_slice_sha256:
      "be183fc48b337d2f061759894197849ff6ad3f586755093bbaf1c9e7128730b7",
  },
  q36_direction_1: {
    comparison_id: PLAN040_PACKAGE_10B_COMPARISON_IDS.q36_direction_1,
    full_chain_comparison_sha256:
      "2bf4584aa62fe0e718d808a1f5586bc815bd83113dac5424ef33bd67c62721cb",
    selected_candidate_slice_sha256:
      "a8b69a1b97cca5e01845849ef6f9c88d4f6be05179ab4989d27e2cdecbdd12cc",
  },
} as const;

export const PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256 =
  "bdc2dc5a9ac8aa1e5fa37d7c07de316cc2dc85030766ff2ef2be66236a93e44a" as const;

export const PLAN040_PACKAGE_10B_ACQUISITION_PINS = {
  historical_full_stop_acquisition: {
    path:
      "data/quality/acquisition/receipts/" +
      "plan-040-historical-full-stop-acquisition.json",
    sha256:
      "842c109e99b326add639f78c5468e6d24a1f33521a7091655203349c7fd7c95d",
  },
  acquisition_manifest: {
    path:
      "data/quality/operational-reference/historical-full-stop/" +
      "acquisition-manifest.json",
    sha256:
      "c68ba18ec3b65ebb240fec631954adfaa778ced3f459cd896c3f8cacb5f73f58",
  },
  snapshot_registry: {
    path: "data/reference/operational/snapshots.json",
    sha256:
      "3372c2309f903ea1f069828619c925760ed8246daa1b1bf591f81aea0bfe7798",
  },
} as const;

export type Plan040Package10bComparisonReceiptRef = {
  path:
    "data/quality/acquisition/receipts/member-extent/plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1.json";
  sha256: string;
  receipt_id:
    "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1";
  source_id:
    "plan_040_qbnr_service_pattern_package_10b_full_stop_equivalence";
  upstream_pins: typeof PLAN040_PACKAGE_10B_ACQUISITION_PINS;
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package10bCandidateEvidence = {
  candidate_key: string;
  occurrence_id: string;
  route_record_id: string;
  gtfs_route_id: "Q82" | "Q89";
  treatment_record_id:
    (typeof PLAN040_PACKAGE_10B_CANDIDATES)[number][1];
  treatment_family: "service_pattern";
  source_statement: {
    source_id: "mta_queens_bus_network_redesign_service_changes";
    evidence_id: string;
    block_id: "p001_b0079" | "p001_b0086";
    block_sha256: string;
    source_quote: string;
    route_row_sha256: string;
  };
  prior_ledger_state: {
    extent_row: MemberExtentLedgerRow;
    grain_row: MemberGrainLedgerRow;
  };
  accepted_evidence: Record<string, JsonValue>;
  exact_candidate_searches: string[];
  unresolved_gap_codes: string[];
  evidence_verdict:
    | "positive_extent_and_grain_proposed"
    | "receipt_terminal_unresolved_preserved";
  proposed_extent_decision: MemberExtentDecision | null;
  proposed_grain_decision: MemberGrainDecision | null;
  persisted_extent_decision: null;
  persisted_grain_decision: null;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package10bExclusion = {
  scope_id: keyof typeof PLAN040_PACKAGE_10B_EXCLUSION_HASHES;
  candidate_count: number;
  candidate_keys: string[];
  candidate_key_sha256: string;
  overlap_count: 0;
};

export type Plan040Package10bPreservedPackage8 = {
  evidence_artifact: { path: string; sha256: string };
  absence_receipt: { path: string; sha256: string };
  treatment_record_ids: string[];
  extent_rows: MemberExtentLedgerRow[];
  grain_rows: MemberGrainLedgerRow[];
  predecessor_context_changes_rows: false;
};

export type Plan040Package10bDraft = {
  schema_version: 1;
  package_id: typeof PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B;
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 4;
  route_count: 2;
  candidate_key_sha256:
    typeof PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256;
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 3;
    receipt_terminal_unresolved_preserved: 1;
  };
  proposed_extent_distribution: {
    route_wide: 1;
    bounded_segment: 2;
    unresolved: 1;
  };
  proposed_grain_distribution: {
    trip_subset: 3;
    unresolved: 1;
  };
  candidates: Plan040Package10bCandidateEvidence[];
  exclusions: Plan040Package10bExclusion[];
  prior_package_overlap_count: 0;
  comparison_receipt: Plan040Package10bComparisonReceiptRef;
  preserved_package_8_predecessor_rows: Plan040Package10bPreservedPackage8;
  post_10a_pins: typeof PLAN040_PACKAGE_10B_POST_10A_PINS;
  version_separation: Plan040Package8VersionSeparation;
  review_protocol: {
    review_mode: "dual_independent_mixed_positive_and_source_gap_risk_review";
    independent_review_required: true;
    dual_independent_review_required: true;
    owner_gate_created: false;
    owner_acceptance_created: false;
    persistence_performed: false;
  };
  authorization_state:
    "evidence_draft_pending_dual_independent_review_no_gate_no_acceptance_no_persistence";
  proposed_extent_decision_count: 3;
  proposed_grain_decision_count: 3;
  persisted_extent_decision_count: 0;
  persisted_grain_decision_count: 0;
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const sameJson = (left: unknown, right: unknown): boolean =>
  stableJson(left as JsonValue) === stableJson(right as JsonValue);

export function plan040Package10bReplayHash(value: JsonValue): string {
  return sha256(`${stableJson(value)}\n`);
}

function validateVersionSeparation(
  value: Plan040Package8VersionSeparation,
): void {
  if (
    value.published_launch_diff.status !==
      "completed_from_accepted_initial_feed_bytes" ||
    value.published_launch_diff.correction_bytes_used ||
    value.published_launch_diff.correction_version_sha1s_used.length !== 0 ||
    value.corrected_first_week_diff.status !== "blocked_not_run" ||
    value.corrected_first_week_diff.comparison_run ||
    value.corrected_first_week_diff.correction_bytes_used ||
    value.corrected_first_week_diff.corrected_diff_used ||
    value.corrected_first_week_diff.published_launch_outcomes_reclassified
  ) {
    throw new Error("Plan 040 Package 10B correction-version separation drifted");
  }
}

function validateQ82Positive(
  candidate: Plan040Package10bCandidateEvidence,
  comparisonReceipt: Plan040Package10bComparisonReceiptRef,
): void {
  const extent = candidate.proposed_extent_decision;
  const grain = candidate.proposed_grain_decision;
  if (!extent || !grain) {
    throw new Error(`${candidate.treatment_record_id}: positive draft missing`);
  }
  validateMemberExtentDecision(extent);
  parseMemberGrainDecision(grain, `${candidate.treatment_record_id}.grain`);
  const expectedResolution = candidate.treatment_record_id ===
      "treatment_q82-belmont-jamaica-connection-2025"
    ? "route_wide"
    : "bounded_segment";
  const expectedLineage = candidate.treatment_record_id ===
      "treatment_q82-belmont-jamaica-connection-2025"
    ? 0
    : 2;
  if (
    extent.resolution !== expectedResolution ||
    grain.service_scope.kind !== "trip_subset" ||
    stableJson(grain.service_scope.directions as JsonValue) !==
      stableJson(["0", "1"]) ||
    stableJson(grain.service_scope.periods as JsonValue) !==
      stableJson(["weekend"]) ||
    stableJson(grain.service_scope.pattern_ids as JsonValue) !==
      stableJson(Object.values(PLAN040_PACKAGE_10B_PATTERN_IDS).sort()) ||
    grain.lineage_segments.length !== expectedLineage ||
    candidate.evidence_verdict !== "positive_extent_and_grain_proposed"
  ) {
    throw new Error(`${candidate.treatment_record_id}: conservative Q82 draft drifted`);
  }
  const evidence = candidate.accepted_evidence as {
    launch_feed?: {
      active_trip_count?: number;
      active_direction_counts?: Record<string, number>;
      active_shape_ids?: string[];
      active_trip_id_sha256?: string;
    };
    launch_schedule?: {
      row_count?: number;
      passenger_shape_ids?: string[];
      trip_type_rows?: Record<string, number>;
      slice_sha256?: string;
    };
    full_stop_chains?: Array<{
      pattern_id: string;
      direction_id: string;
      shape_id: string;
      trip_count: number;
      trip_id_sha256: string;
      stop_ids: string[];
      stop_chain_sha256: string;
    }>;
    rejected_identifier_inferences?: string[];
    comparison_receipt?: Plan040Package10bComparisonReceiptRef;
    predecessor_full_stop_chains?: Array<{
      pattern_id: string;
      direction_id: string;
      trip_count: number;
      trip_id_sha256: string;
      stop_count: number;
      stop_ids: string[];
      stop_chain_sha256: string;
    }>;
    candidate_full_stop_comparisons?: Array<{
      comparison_id: string;
      direction_id: string;
      full_chain_comparison: JsonValue;
      full_chain_comparison_sha256: string;
      selected_candidate_slice: {
        boundary_stop_ids: string[];
        identical_stop_id_equivalences: Array<{
          before_stop_id: string;
          after_stop_id: string;
          equivalence_basis: string;
        }>;
        before_only_stop_ids: string[];
        after_only_stop_ids: string[];
        shared_stop_ids_outside_candidate_slice: string[];
        changed_id_equivalence_authorized: boolean;
        comparison_sha256: string;
      };
    }>;
  };
  if (
    evidence.launch_feed?.active_trip_count !== 102 ||
    stableJson(evidence.launch_feed.active_direction_counts as JsonValue) !==
      stableJson({ "0": 51, "1": 51 }) ||
    stableJson(evidence.launch_feed.active_shape_ids as JsonValue) !==
      stableJson(["Q820026", "Q820032"]) ||
    evidence.launch_feed.active_trip_id_sha256 !==
      "f199027fee425aa9c72bda60e8a29afdcbc496ba72b86b0f88a66670555f59e2" ||
    evidence.launch_schedule?.row_count !== 578 ||
    stableJson(evidence.launch_schedule.passenger_shape_ids as JsonValue) !==
      stableJson(["Q820026", "Q820032"]) ||
    stableJson(evidence.launch_schedule.trip_type_rows as JsonValue) !==
      stableJson({ "1": 510, "2": 34, "3": 34 }) ||
    evidence.launch_schedule.slice_sha256 !==
      "11fda16e73a93a41e3d1e256d5fd6622906216e2b19484a8513ff0050b0d53b3" ||
    evidence.full_stop_chains?.length !== 2 ||
    evidence.full_stop_chains.some((chain) =>
      chain.stop_chain_sha256 !==
        sha256(`${chain.stop_ids.join("\n")}\n`) ||
      chain.pattern_id !==
        PLAN040_PACKAGE_10B_PATTERN_IDS[
          chain.direction_id === "0" ? "direction_0" : "direction_1"
        ]) ||
    (evidence.rejected_identifier_inferences?.length ?? 0) < 2 ||
    !sameJson(evidence.comparison_receipt, comparisonReceipt)
  ) {
    throw new Error(`${candidate.treatment_record_id}: accepted Q82 evidence drifted`);
  }
  const replacementRoute = candidate.treatment_record_id ===
      "treatment_q82-q110-hempstead-replacement-2025"
    ? "q110"
    : candidate.treatment_record_id ===
        "treatment_q82-q36-212-replacement-2025"
    ? "q36"
    : null;
  const expectedComparisons = replacementRoute === "q110"
    ? [
      PLAN040_PACKAGE_10B_COMPARISON_IDS.q110_direction_0,
      PLAN040_PACKAGE_10B_COMPARISON_IDS.q110_direction_1,
    ]
    : replacementRoute === "q36"
    ? [
      PLAN040_PACKAGE_10B_COMPARISON_IDS.q36_direction_0,
      PLAN040_PACKAGE_10B_COMPARISON_IDS.q36_direction_1,
    ]
    : [];
  const expectedPredecessors = replacementRoute === "q110"
    ? [
      PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q110_direction_0,
      PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q110_direction_1,
    ]
    : replacementRoute === "q36"
    ? [
      PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q36_direction_0,
      PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q36_direction_1,
    ]
    : [];
  const comparisons = evidence.candidate_full_stop_comparisons ?? [];
  const predecessors = evidence.predecessor_full_stop_chains ?? [];
  const expectedPredecessorIds = new Set<string>(expectedPredecessors);
  const expectedComparisonIds = new Set<string>(expectedComparisons);
  const expectedPredecessorPins = Object.values(
    PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_PINS,
  ).filter((pin) => expectedPredecessorIds.has(pin.pattern_id));
  const expectedComparisonPins = Object.values(
    PLAN040_PACKAGE_10B_COMPARISON_PINS,
  ).filter((pin) => expectedComparisonIds.has(pin.comparison_id));
  const comparisonContentDrifted = comparisons.some((row) => {
    const {
      comparison_sha256: selectedSha256,
      ...selectedCandidateSlice
    } = row.selected_candidate_slice;
    return row.full_chain_comparison_sha256 !== sha256(
      `${stableJson(row.full_chain_comparison)}\n`,
    ) ||
      selectedSha256 !== sha256(
        `${stableJson(selectedCandidateSlice as unknown as JsonValue)}\n`,
      );
  });
  const bindingIds = extent.evidence_bindings.map((binding) =>
    binding.evidence_id);
  if (
    !Object.values(PLAN040_PACKAGE_10B_PATTERN_IDS).every((id) =>
      bindingIds.includes(`${comparisonReceipt.source_id}#${id}`)) ||
    !expectedComparisons.every((id) =>
      bindingIds.includes(`${comparisonReceipt.source_id}#${id}`)) ||
    !expectedPredecessors.every((id) =>
      bindingIds.includes(`${comparisonReceipt.source_id}#${id}`)) ||
    comparisons.length !== expectedComparisons.length ||
    predecessors.length !== expectedPredecessors.length ||
    !sameJson(
      comparisons.map((row) => row.comparison_id).sort(),
      [...expectedComparisons].sort(),
    ) ||
    !sameJson(
      predecessors.map((row) => row.pattern_id).sort(),
      [...expectedPredecessors].sort(),
    ) ||
    predecessors.some((row) =>
      row.trip_count <= 0 ||
      row.trip_id_sha256.length !== 64 ||
      row.stop_ids.length < 2 ||
      row.stop_chain_sha256 !== sha256(`${row.stop_ids.join("\n")}\n`)) ||
    !expectedPredecessorPins.every((pin) =>
      predecessors.some((row) =>
        row.pattern_id === pin.pattern_id &&
        row.trip_count === pin.trip_count &&
        row.trip_id_sha256 === pin.trip_id_sha256 &&
        row.stop_count === pin.stop_count &&
        row.stop_ids.length === pin.stop_count &&
        row.stop_chain_sha256 === pin.stop_chain_sha256)) ||
    !expectedComparisonPins.every((pin) =>
      comparisons.some((row) =>
        row.comparison_id === pin.comparison_id &&
        row.full_chain_comparison_sha256 ===
          pin.full_chain_comparison_sha256 &&
        row.selected_candidate_slice.comparison_sha256 ===
          pin.selected_candidate_slice_sha256)) ||
    comparisonContentDrifted ||
    comparisons.some((row) =>
      row.selected_candidate_slice.boundary_stop_ids.length !== 2 ||
      row.selected_candidate_slice.identical_stop_id_equivalences.length <
        2 ||
      row.selected_candidate_slice.identical_stop_id_equivalences.some(
        (equivalence) =>
          equivalence.before_stop_id !== equivalence.after_stop_id ||
          equivalence.equivalence_basis !== "identical_stop_id",
      ) ||
      row.selected_candidate_slice.changed_id_equivalence_authorized)
  ) {
    throw new Error(
      `${candidate.treatment_record_id}: authoritative predecessor comparator drifted`,
    );
  }
}

function validateQ89Preservation(
  candidate: Plan040Package10bCandidateEvidence,
): void {
  const extent = candidate.prior_ledger_state.extent_row;
  const grain = candidate.prior_ledger_state.grain_row;
  const evidence = candidate.accepted_evidence as {
    prior_review?: Record<string, JsonValue>;
    initial_post_inventory?: Record<string, JsonValue>;
    schedule_slice?: Record<string, JsonValue>;
  };
  const exactGaps = [
    "bounded_scope_identity_missing",
    "prior_reviewed_member_extent_unresolved_preserved",
    "post_schedule_gtfs_shape_identity_mismatch",
    "initial_shape_mismatch_may_be_correction_sensitive",
    "corrected_first_week_diff_blocked_not_run",
    "candidate_specific_service_detail_not_staged",
    "candidate_specific_schedule_or_timetable_not_staged",
    "candidate_scope_not_bound_to_exact_versioned_member_extent",
  ];
  if (
    extent.ledger_id !== "member-extent-ledger:06d3feaca1f812078748a979" ||
    grain.ledger_id !== "member-grain-ledger:06d3feaca1f812078748a979" ||
    extent.packet_id !== "study-readiness-review:ea9e0f1db4ffbcd5d34356ed" ||
    grain.packet_id !== extent.packet_id ||
    grain.member_extent_decision_id !==
      "member-extent-review:53b053d72d04f18923d31522" ||
    extent.current_extent_kind !== "unresolved" ||
    grain.current_extent_kind !== "unresolved" ||
    grain.service_scope !== null ||
    grain.lineage_segments.length !== 0 ||
    candidate.proposed_extent_decision !== null ||
    candidate.proposed_grain_decision !== null ||
    candidate.evidence_verdict !==
      "receipt_terminal_unresolved_preserved" ||
    stableJson(candidate.unresolved_gap_codes as JsonValue) !==
      stableJson(exactGaps as JsonValue) ||
    evidence.prior_review?.packet_row_sha256 !==
      "e40620337b00dbe1e40b1c4ec789cf69df5b1728e75d24fa51bfcb8f5758ae24" ||
    evidence.prior_review?.occurrence_review_decision_id !==
      "q89-route-redesign-2025-06-29" ||
    evidence.initial_post_inventory?.active_trip_count !== 78 ||
    stableJson(evidence.initial_post_inventory?.shape_ids as JsonValue) !==
      stableJson(["Q890011", "Q890016"]) ||
    evidence.schedule_slice?.row_count !== 669 ||
    stableJson(evidence.schedule_slice?.passenger_shape_ids as JsonValue) !==
      stableJson(["Q890020", "Q890021"]) ||
    evidence.schedule_slice?.slice_sha256 !==
      "ec7383300d24376861265abfc0beaaca9f48b47d6139c0db2623bdb57afce5cd"
  ) {
    throw new Error("Plan 040 Package 10B Q89 preservation drifted");
  }
}

function validatePreservedPackage8(
  value: Plan040Package10bPreservedPackage8,
): void {
  if (
    value.evidence_artifact.sha256 !==
      PLAN040_PACKAGE_10B_POST_10A_PINS.package_8_evidence ||
    value.absence_receipt.sha256 !==
      PLAN040_PACKAGE_10B_POST_10A_PINS.package_8_absence_receipt ||
    value.treatment_record_ids.length !== 4 ||
    value.extent_rows.length !== 4 ||
    value.grain_rows.length !== 4 ||
    value.predecessor_context_changes_rows ||
    [...value.extent_rows, ...value.grain_rows].some((row) =>
      row.verdict !== "absent_in_source" ||
      row.receipt_ids[0] !==
        "plan-040-qbnr-service-pattern-package-8-reviewed-absence-v1")
  ) {
    throw new Error("Plan 040 Package 10B P8 predecessor preservation drifted");
  }
}

export function buildPlan040Package10bDraft(input: {
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package10bCandidateEvidence[];
  exclusions: Plan040Package10bExclusion[];
  comparisonReceipt: Plan040Package10bComparisonReceiptRef;
  preservedPackage8: Plan040Package10bPreservedPackage8;
  priorCandidateKeys: string[];
  versionSeparation: Plan040Package8VersionSeparation;
}): Plan040Package10bDraft {
  validateVersionSeparation(input.versionSeparation);
  validatePreservedPackage8(input.preservedPackage8);
  if (
    input.comparisonReceipt.path !==
      "data/quality/acquisition/receipts/member-extent/plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1.json" ||
    input.comparisonReceipt.sha256 !==
      PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256 ||
    input.comparisonReceipt.receipt_id !==
      "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1" ||
    !sameJson(
      input.comparisonReceipt.upstream_pins,
      PLAN040_PACKAGE_10B_ACQUISITION_PINS,
    ) ||
    input.comparisonReceipt.external_acquisition_performed ||
    input.comparisonReceipt.authorizes_occurrence ||
    input.comparisonReceipt.authorizes_study ||
    input.comparisonReceipt.authorizes_cross_product ||
    input.comparisonReceipt.authorizes_decision_persistence
  ) {
    throw new Error("Plan 040 Package 10B comparison receipt drifted");
  }
  const byTreatment = new Map(input.candidates.map((candidate) => [
    candidate.treatment_record_id,
    candidate,
  ]));
  const candidates = PLAN040_PACKAGE_10B_CANDIDATES.map(
    ([, treatmentId]) => byTreatment.get(treatmentId)!,
  );
  const keys = candidates.map((candidate) => candidate?.candidate_key);
  if (
    candidates.some((candidate) => !candidate) ||
    byTreatment.size !== 4 ||
    sortedHash(keys) !== PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256 ||
    input.priorCandidateKeys.some((key) => keys.includes(key))
  ) {
    throw new Error("Plan 040 Package 10B candidate scope or overlap drifted");
  }
  for (const candidate of candidates) {
    if (
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence ||
      candidate.exact_candidate_searches.length < 6
    ) {
      throw new Error(`${candidate.treatment_record_id}: authority drifted`);
    }
    if (candidate.gtfs_route_id === "Q82") {
      validateQ82Positive(candidate, input.comparisonReceipt);
    }
    else validateQ89Preservation(candidate);
  }
  if (
    input.exclusions.length !== 4 ||
    input.exclusions.some((row) =>
      row.candidate_key_sha256 !==
        PLAN040_PACKAGE_10B_EXCLUSION_HASHES[row.scope_id] ||
      row.candidate_key_sha256 !== sortedHash(row.candidate_keys) ||
      row.candidate_keys.length !== row.candidate_count ||
      row.overlap_count !== 0 ||
      row.candidate_keys.some((key) => keys.includes(key)))
  ) {
    throw new Error("Plan 040 Package 10B exclusion drifted");
  }
  return {
    schema_version: 1,
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B,
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 4,
    route_count: 2,
    candidate_key_sha256: PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
    evidence_verdict_distribution: {
      positive_extent_and_grain_proposed: 3,
      receipt_terminal_unresolved_preserved: 1,
    },
    proposed_extent_distribution: {
      route_wide: 1,
      bounded_segment: 2,
      unresolved: 1,
    },
    proposed_grain_distribution: {
      trip_subset: 3,
      unresolved: 1,
    },
    candidates,
    exclusions: input.exclusions,
    prior_package_overlap_count: 0,
    comparison_receipt: input.comparisonReceipt,
    preserved_package_8_predecessor_rows: input.preservedPackage8,
    post_10a_pins: PLAN040_PACKAGE_10B_POST_10A_PINS,
    version_separation: input.versionSeparation,
    review_protocol: {
      review_mode:
        "dual_independent_mixed_positive_and_source_gap_risk_review",
      independent_review_required: true,
      dual_independent_review_required: true,
      owner_gate_created: false,
      owner_acceptance_created: false,
      persistence_performed: false,
    },
    authorization_state:
      "evidence_draft_pending_dual_independent_review_no_gate_no_acceptance_no_persistence",
    proposed_extent_decision_count: 3,
    proposed_grain_decision_count: 3,
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    external_acquisition_performed: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}
