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
    "historical-full-stop-pattern:plan040-p10b-q82-9c85b382e78fcf4d",
  direction_1:
    "historical-full-stop-pattern:plan040-p10b-q82-08dc890c186a6d93",
} as const;

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
    (evidence.rejected_identifier_inferences?.length ?? 0) < 2
  ) {
    throw new Error(`${candidate.treatment_record_id}: accepted Q82 evidence drifted`);
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
  preservedPackage8: Plan040Package10bPreservedPackage8;
  priorCandidateKeys: string[];
  versionSeparation: Plan040Package8VersionSeparation;
}): Plan040Package10bDraft {
  validateVersionSeparation(input.versionSeparation);
  validatePreservedPackage8(input.preservedPackage8);
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
    if (candidate.gtfs_route_id === "Q82") validateQ82Positive(candidate);
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
