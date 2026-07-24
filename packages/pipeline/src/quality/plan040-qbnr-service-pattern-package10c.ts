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
import type { Plan040Package8VersionSeparation } from
  "./plan040-qbnr-service-pattern-package8.js";
import {
  validateMemberExtentDecision,
  type MemberExtentDecision,
} from "./study-readiness-v1.js";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C =
  "plan-040-qbnr-service-pattern-package-10c-evidence-only-v1" as const;
export const PLAN040_PACKAGE_10C_CANDIDATE_KEY_SHA256 =
  "6e6c1bdcf1056ba5a2a5bcabbd1fbba1426d0d5e4a25e6ca9750f635c834a15a" as const;

export const PLAN040_PACKAGE_10C_CANDIDATES = [
  ["Q20", "treatment_q20-college-point-jamaica-connection-2025"],
  ["Q20", "treatment_q20-jamaica-avenue-approach-2025"],
  ["Q20", "treatment_q20-q20b-replacement-2025"],
  ["Q90", "treatment_q90-q48-laguardia-replacement-2025"],
  ["Q98", "treatment_q98-flushing-ridgewood-connection-2025"],
] as const;

export const PLAN040_PACKAGE_10C_POST_10B_PINS = {
  extent_ledger:
    "85ae65827341e85eb9f221776a25bb1d66e6594b38892ee4484a9106d042cdea",
  grain_ledger:
    "f374aa9d11240081e9c6fa69a92e3e71300dc8faa6e8362d068a241489655402",
  bridge:
    "8801f97900d6663f9090b47cfaff32ed4a4911911296faab1bd74a8b047a0d96",
  study_manifest:
    "06c6430bf3ae713c6777335ff51b1abbf02e37717820f7e2d3270ba678a8a5d3",
} as const;

export const PLAN040_PACKAGE_10C_SOURCE_PINS = {
  service_change_html:
    "4b5dc9ca398980a3803e076378acefd7ac3ec04343e0ac32db95a17c1d51226d",
  service_change_blocks:
    "7b46befc331051265d4e7f9ff86ef8dde908474759ec1e94f9cfe28764a28490",
  treatment_components:
    "a9b76c3b7121fc87d0f190a44fb00f182229d8d309968d3ba00a8c27a1492bae",
  existing_schedule_csv:
    "c592686da8a1cabdc8b559db4d4ae15d5a663adbe08f332e196215fd377be7c5",
  existing_schedule_receipt:
    "82cc442de9b9c0356965f678c8491a78a093eea8eca06bac29d67747355a58c3",
  existing_schedule_blocks:
    "e12d18baf0ed5f6fb019d877922861df44fd99805f58f5b4b8344de89b71658d",
  package_10_schedule_csv:
    "af9e368d93c8fe879e1cd42145ff116a815a6e9464436bb1244fa350c9ffb1fa",
  package_10_schedule_receipt:
    "f40140d24c7edeef113a793982b376f603957f6922d9b94137f3679acf12f0e0",
  package_10_schedule_blocks:
    "bbaa8fc50ce2598e7e00b97dd7ecdb8c4400ecf3d43168cfd09fc3fe95cbdbde",
  queens_pre_receipt:
    "07fc854e9d4f2e980048741b335c95f781f03b8a8914c4eb0acd51bd92c540c6",
  queens_pre_zip_sha1: "c96466458c55036cd6feeadc291bf5951d6c3274",
  queens_pre_zip_sha256:
    "2ddcb01c8ceb6c822a28819570692af99491be0967412e130d7a26131820e6ef",
  queens_post_receipt:
    "0a66e26e639674b88bd1d0251d6a15f4cab2205e794fa14a3d75367c43394eeb",
  queens_post_zip_sha1: "c868290ddcd79c69712d809ece96d96dbad2c613",
  queens_post_zip_sha256:
    "4db0f151dc541f2669dde72f104c7803b0f99258bc5d14278b04c8016ce7471a",
  occurrence_decisions:
    "80e530c9953e59a767afcb2f0d61202d9a9209469075f41f993fe7469ee45883",
  q20_occurrence_decision_row:
    "7b00d2a3d2e02c917b7badd3f389e53255ff9b31d518b4bcc061de252a5941ef",
  q20_conflict_treatment_row:
    "03135f6fc3746ea1ec6e80f68ec4d94cab434869f77d870a5fca6e690a7a84bf",
} as const;

export const PLAN040_PACKAGE_10C_EXCLUSION_HASHES = {
  remaining_q39_q58_q14:
    "68f9438ea35af69c737457fef27b4fb2a7897c8da74b650299abd4b508bfdf7f",
  q67: "0839dcd8540add7e2065ff6027492dcc13f70442b149da5a0fae16ef7fb4ea24",
  q48_q75:
    "9e9184a961b11ade5bc8ed1ce1f6d65818b2cad7fc9f62535012faa302f53b5c",
  limited_stop_siblings:
    "2c2808e1afa357866c3daa2ff1b707fe11cb4cb30699f587260808b006baf7d3",
} as const;

export const PLAN040_PACKAGE_10C_PATTERN_PINS = {
  q20a_direction_0: {
    pattern_id: "historical-full-stop-pattern:36179710d64d6c2e91957600",
    trip_count: 62,
    trip_id_sha256:
      "7133033a73b916bde3c16ec29eb2052bc80dc0f61304129a9dbf235cf0e91c8d",
    stop_count: 58,
    stop_chain_sha256:
      "6487dd4c5ee2657567a5d3e0d49950da2f7e468f10390ae0582fde477237a49e",
  },
  q20a_direction_1: {
    pattern_id: "historical-full-stop-pattern:aede1187174112854f75f568",
    trip_count: 64,
    trip_id_sha256:
      "0deb566bafea6ac256f0139a6a04d0d81f3e822d0b9a9a7cea9e44a5f5c00bb1",
    stop_count: 61,
    stop_chain_sha256:
      "5768deee82de8fa940fd3b9068cf5fbbf910183537e8815ab511ff1a3d7c83cd",
  },
  q20_direction_0: {
    pattern_id: "historical-full-stop-pattern:b722bf646550a84fce8ac6cb",
    trip_count: 82,
    trip_id_sha256:
      "83511faf095f81aaf49165df34fc9e0d254b4fd884cd4b111149491ad78e7959",
    stop_count: 40,
    stop_chain_sha256:
      "2b90e95ae9f2c9a15d174efa977dde7c289f7e09f23314c315ce25a99c25a928",
  },
  q20_direction_1: {
    pattern_id: "historical-full-stop-pattern:ca77732928770e6d1c6a50ca",
    trip_count: 84,
    trip_id_sha256:
      "5c20a6ff1b3a056de783878c37ada2284b10c2fb801492f8e1171d70f00b7c19",
    stop_count: 42,
    stop_chain_sha256:
      "e74a14bb7ce2e26699be65979bc221c2618a09ccabdab6ddda568e72845452e8",
  },
  q48_direction_0_long: {
    pattern_id: "historical-full-stop-pattern:8493077a314d1ef30a2fac89",
    trip_count: 45,
    trip_id_sha256:
      "39ee48656f5d4389f50ec267bc60d7c38777a62764b56c6cd507a26a16d22e9c",
    stop_count: 20,
    stop_chain_sha256:
      "c18b3664bde069f9061847f58bacccfdfa86e4620102755375159af36cd7eca2",
  },
  q48_direction_0_short: {
    pattern_id: "historical-full-stop-pattern:e16683450dd0693e06942250",
    trip_count: 17,
    trip_id_sha256:
      "a4f376dee88de174dcbdec13a9625d323709cbd305b98d19437d4836c764d49e",
    stop_count: 19,
    stop_chain_sha256:
      "516b60999a46ce0fe49b14f7446d3abb5db70c45f9758f57b862b42966813fcf",
  },
  q48_direction_1: {
    pattern_id: "historical-full-stop-pattern:15cd6cf9262a5e689158cba6",
    trip_count: 62,
    trip_id_sha256:
      "09e019994efbaa78b84673004f09f74f39efb504ba991e1bac87c265044a602a",
    stop_count: 31,
    stop_chain_sha256:
      "a3b3fafe62b5819c896b8d6a88ac66c9b056d5228f8566fc48e654b20b856968",
  },
  q90_direction_0: {
    pattern_id: "historical-full-stop-pattern:574bdd864ce1e899cb027df7",
    trip_count: 49,
    trip_id_sha256:
      "17e6bfcb154707b2ba976ae82a500f9401529b1ceb50f41803613e5d761e2e74",
    stop_count: 8,
    stop_chain_sha256:
      "d8cd28e10a985c7e5a40d1932bbc3a749861a271c7c4b3ebcf4e23f161903c09",
  },
  q90_direction_1: {
    pattern_id: "historical-full-stop-pattern:5ce6fcedd2d4d679f87a33a8",
    trip_count: 49,
    trip_id_sha256:
      "158109fc62f488a052c651d0b20822c7345e4d9cdebbcee7e728990c9f1358e3",
    stop_count: 9,
    stop_chain_sha256:
      "aa20f2743a0a0545147119834dea8dbca7b3aea4d120c41da91d6235a72ea5ee",
  },
  q98_direction_0: {
    pattern_id: "historical-full-stop-pattern:7d062ab9ce55a6556a614092",
    trip_count: 65,
    trip_id_sha256:
      "50caf4b01e8c0bcd49cdbc9bfa8a31c3ff5686caaa1dce689675766ba0e27136",
    stop_count: 17,
    stop_chain_sha256:
      "519e6e45f02e6cc2af6b77a5c3800d6124ccca409d5eabdbb52bcde330430183",
  },
  q98_direction_1: {
    pattern_id: "historical-full-stop-pattern:7f9a24a5872b7f10fa558e62",
    trip_count: 63,
    trip_id_sha256:
      "40dbfe988169de0b78465210ae7f528ab2af6a2289690af17804991d846df4c7",
    stop_count: 17,
    stop_chain_sha256:
      "383c61982ce4950b9bdb6b94748e86ef563348a6eb27815d869fe6519957bd12",
  },
} as const;

export const PLAN040_PACKAGE_10C_COMPARISON_PINS = {
  q20a_direction_0: {
    comparison_id:
      "historical-full-stop-comparison:1dcf87094c7db70c30ef9510",
    full_chain_comparison_sha256:
      "adef9f2ba3fce26633614c30f800deac266601907cb524e2a74a18b6c3ee26f7",
  },
  q20a_direction_1: {
    comparison_id:
      "historical-full-stop-comparison:d706635e280887e4b598d08e",
    full_chain_comparison_sha256:
      "5fd9f8894fccfd7cb3f13579efa31486a13406c318c42f12ea08adf27ee941c2",
  },
  q48_direction_0_long: {
    comparison_id:
      "historical-full-stop-comparison:7d65d8317a2969055b87060e",
    full_chain_comparison_sha256:
      "6de730a57dcf9c33c5438de05408e0d06f19e3206c8c8262be3429034ebbdee1",
  },
  q48_direction_0_short: {
    comparison_id:
      "historical-full-stop-comparison:01393ba7a4f5013cf6d620c4",
    full_chain_comparison_sha256:
      "80fb353075b04cd14879d71e0b18af44d811d7190e840b31a6d3c6a27489070d",
  },
  q48_direction_1: {
    comparison_id:
      "historical-full-stop-comparison:bbc05d50435af757b19ee158",
    full_chain_comparison_sha256:
      "9758c4e65b14e3df0e251df3d4eba04be7b10509c51c50c962bbc5bf1b2a2c60",
  },
} as const;

export const PLAN040_PACKAGE_10C_Q20_BOUND_PINS = {
  direction_0:
    "98bda97d489d9c5de3385661694c3fba91caa4e2bb0bc119fb55da8c09ce8271",
  direction_1:
    "457b485114e1825d3b97232cf37fb7673b6f4af7cb3e5d1bf1fea60c607d9519",
} as const;

export const PLAN040_PACKAGE_10C_UPSTREAM_PINS = {
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

export const PLAN040_PACKAGE_10C_COMPARISON_RECEIPT_SHA256 =
  "b0309c4e57862353b6da9c0f7eb5e749123db941f8ff4af067546b7c6ddcf966" as const;

export type Plan040Package10cComparisonReceiptRef = {
  path:
    "data/quality/acquisition/receipts/member-extent-evidence/plan-040-qbnr-service-pattern-package-10c-full-stop-equivalence-v1.json";
  sha256: string;
  receipt_id:
    "plan-040-qbnr-service-pattern-package-10c-full-stop-equivalence-v1";
  source_id:
    "plan_040_qbnr_service_pattern_package_10c_full_stop_equivalence";
  upstream_pins: typeof PLAN040_PACKAGE_10C_UPSTREAM_PINS;
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package10cCandidateEvidence = {
  candidate_key: string;
  occurrence_id: string;
  route_record_id: string;
  gtfs_route_id: "Q20" | "Q90" | "Q98";
  treatment_record_id:
    (typeof PLAN040_PACKAGE_10C_CANDIDATES)[number][1];
  treatment_family: "service_pattern";
  source_statement: {
    source_id: "mta_queens_bus_network_redesign_service_changes";
    evidence_id: string;
    block_id: string;
    block_sha256: string;
    source_quote: string;
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

export type Plan040Package10cExclusion = {
  scope_id: keyof typeof PLAN040_PACKAGE_10C_EXCLUSION_HASHES;
  candidate_count: number;
  candidate_keys: string[];
  candidate_key_sha256: string;
  overlap_count: 0;
};

export type Plan040Package10cDraft = {
  schema_version: 1;
  package_id: typeof PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C;
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 5;
  route_count: 3;
  candidate_key_sha256:
    typeof PLAN040_PACKAGE_10C_CANDIDATE_KEY_SHA256;
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 4;
    receipt_terminal_unresolved_preserved: 1;
  };
  proposed_extent_distribution: {
    route_wide: 3;
    bounded_segment: 1;
    unresolved: 1;
  };
  proposed_grain_distribution: {
    trip_subset: 4;
    unresolved: 1;
  };
  candidates: Plan040Package10cCandidateEvidence[];
  exclusions: Plan040Package10cExclusion[];
  prior_package_overlap_count: 0;
  comparison_receipt: Plan040Package10cComparisonReceiptRef;
  post_10b_pins: typeof PLAN040_PACKAGE_10C_POST_10B_PINS;
  version_separation: Plan040Package8VersionSeparation;
  review_protocol: {
    review_mode: "dual_independent_mixed_positive_and_scope_conflict_risk_review";
    independent_review_required: true;
    dual_independent_review_required: true;
    owner_gate_created: false;
    owner_acceptance_created: false;
    persistence_performed: false;
  };
  authorization_state:
    "evidence_draft_pending_dual_independent_review_no_gate_no_acceptance_no_persistence";
  proposed_extent_decision_count: 4;
  proposed_grain_decision_count: 4;
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

export function plan040Package10cReplayHash(value: JsonValue): string {
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
    throw new Error("Plan 040 Package 10C correction-version separation drifted");
  }
}

const expectedPositive = {
  "treatment_q20-college-point-jamaica-connection-2025": {
    resolution: "route_wide",
    pattern_ids: [
      PLAN040_PACKAGE_10C_PATTERN_PINS.q20_direction_0.pattern_id,
      PLAN040_PACKAGE_10C_PATTERN_PINS.q20_direction_1.pattern_id,
    ],
    lineage_count: 2,
    comparison_ids: [
      PLAN040_PACKAGE_10C_COMPARISON_PINS.q20a_direction_0.comparison_id,
      PLAN040_PACKAGE_10C_COMPARISON_PINS.q20a_direction_1.comparison_id,
    ],
  },
  "treatment_q20-jamaica-avenue-approach-2025": {
    resolution: "bounded_segment",
    pattern_ids: [
      PLAN040_PACKAGE_10C_PATTERN_PINS.q20_direction_0.pattern_id,
      PLAN040_PACKAGE_10C_PATTERN_PINS.q20_direction_1.pattern_id,
    ],
    lineage_count: 2,
    comparison_ids: [
      PLAN040_PACKAGE_10C_COMPARISON_PINS.q20a_direction_0.comparison_id,
      PLAN040_PACKAGE_10C_COMPARISON_PINS.q20a_direction_1.comparison_id,
    ],
  },
  "treatment_q90-q48-laguardia-replacement-2025": {
    resolution: "route_wide",
    pattern_ids: [
      PLAN040_PACKAGE_10C_PATTERN_PINS.q90_direction_0.pattern_id,
      PLAN040_PACKAGE_10C_PATTERN_PINS.q90_direction_1.pattern_id,
    ],
    lineage_count: 2,
    comparison_ids: [
      PLAN040_PACKAGE_10C_COMPARISON_PINS.q48_direction_0_long.comparison_id,
      PLAN040_PACKAGE_10C_COMPARISON_PINS.q48_direction_0_short.comparison_id,
      PLAN040_PACKAGE_10C_COMPARISON_PINS.q48_direction_1.comparison_id,
    ],
  },
  "treatment_q98-flushing-ridgewood-connection-2025": {
    resolution: "route_wide",
    pattern_ids: [
      PLAN040_PACKAGE_10C_PATTERN_PINS.q98_direction_0.pattern_id,
      PLAN040_PACKAGE_10C_PATTERN_PINS.q98_direction_1.pattern_id,
    ],
    lineage_count: 0,
    comparison_ids: [],
  },
} as const;

function validatePositive(
  candidate: Plan040Package10cCandidateEvidence,
  comparisonReceipt: Plan040Package10cComparisonReceiptRef,
): void {
  const expected = expectedPositive[
    candidate.treatment_record_id as keyof typeof expectedPositive
  ];
  const extent = candidate.proposed_extent_decision;
  const grain = candidate.proposed_grain_decision;
  const evidence = candidate.accepted_evidence as {
    comparison_receipt?: Plan040Package10cComparisonReceiptRef;
    successor_full_stop_patterns?: Array<{ pattern_id: string }>;
    predecessor_full_stop_patterns?: Array<{ pattern_id: string }>;
    full_stop_comparisons?: Array<{
      comparison_id: string;
      full_chain_comparison_sha256: string;
    }>;
    launch_schedule?: {
      passenger_policy?: string;
      passenger_shape_ids?: string[];
    };
    q20_jamaica_bound_slices?: Array<{
      direction_id: string;
      boundary_stop_ids_route_order: string[];
      changed_interior_identifiers_unresolved: boolean;
      selected_slice_sha256: string;
    }>;
    q58_lineage?: {
      status?: string;
      missing_brooklyn_historical_feed_nonblocking?: boolean;
    };
  };
  if (!expected || !extent || !grain) {
    throw new Error(`${candidate.treatment_record_id}: positive draft missing`);
  }
  validateMemberExtentDecision(extent);
  parseMemberGrainDecision(grain, `${candidate.treatment_record_id}.grain`);
  const comparisonIds = (evidence.full_stop_comparisons ?? [])
    .map((row) => row.comparison_id).sort();
  const successorPatternIds = (evidence.successor_full_stop_patterns ?? [])
    .map((row) => row.pattern_id).sort();
  if (
    extent.resolution !== expected.resolution ||
    grain.service_scope.kind !== "trip_subset" ||
    !sameJson(grain.service_scope.periods, ["weekend"]) ||
    !sameJson(grain.service_scope.directions, ["0", "1"]) ||
    !sameJson(grain.service_scope.pattern_ids, [...expected.pattern_ids].sort()) ||
    grain.lineage_segments.length !== expected.lineage_count ||
    !sameJson(successorPatternIds, [...expected.pattern_ids].sort()) ||
    !sameJson(comparisonIds, [...expected.comparison_ids].sort()) ||
    evidence.launch_schedule?.passenger_policy !==
      "any_trip_type_except_2_3_4" ||
    !sameJson(evidence.comparison_receipt, comparisonReceipt) ||
    candidate.evidence_verdict !== "positive_extent_and_grain_proposed"
  ) {
    throw new Error(`${candidate.treatment_record_id}: positive evidence drifted`);
  }
  if (
    candidate.treatment_record_id ===
      "treatment_q20-jamaica-avenue-approach-2025"
  ) {
    const bounds = evidence.q20_jamaica_bound_slices ?? [];
    if (
      bounds.length !== 2 ||
      !bounds.every((row) => row.changed_interior_identifiers_unresolved) ||
      !bounds.some((row) =>
        row.direction_id === "0" &&
        sameJson(row.boundary_stop_ids_route_order, ["504980", "504999"]) &&
        row.selected_slice_sha256 ===
          PLAN040_PACKAGE_10C_Q20_BOUND_PINS.direction_0) ||
      !bounds.some((row) =>
        row.direction_id === "1" &&
        sameJson(row.boundary_stop_ids_route_order, ["505032", "504559"]) &&
        row.selected_slice_sha256 ===
          PLAN040_PACKAGE_10C_Q20_BOUND_PINS.direction_1)
    ) {
      throw new Error("Plan 040 Package 10C Q20 bound evidence drifted");
    }
  }
  if (
    candidate.treatment_record_id ===
      "treatment_q98-flushing-ridgewood-connection-2025" &&
    (
      evidence.q58_lineage?.status !==
        "not_asserted_alternative_direct_connection_not_replacement" ||
      !evidence.q58_lineage.missing_brooklyn_historical_feed_nonblocking ||
      (evidence.predecessor_full_stop_patterns?.length ?? 0) !== 0 ||
      (evidence.full_stop_comparisons?.length ?? 0) !== 0
    )
  ) {
    throw new Error("Plan 040 Package 10C Q98 non-lineage drifted");
  }
}

function validateQ20Conflict(
  candidate: Plan040Package10cCandidateEvidence,
): void {
  const evidence = candidate.accepted_evidence as {
    preserved_occurrence_decision?: {
      decision_id?: string;
      artifact_sha256?: string;
      decision_row_sha256?: string;
      review_state?: string;
    };
    scope_conflict?: {
      candidate_route_id?: string;
      statement_named_replacement_route_id?: string;
      canonical_treatment_row_sha256?: string;
      ontology_correction_performed?: boolean;
    };
  };
  if (
    candidate.proposed_extent_decision !== null ||
    candidate.proposed_grain_decision !== null ||
    candidate.evidence_verdict !==
      "receipt_terminal_unresolved_preserved" ||
    !sameJson(candidate.unresolved_gap_codes, [
      "canonical_treatment_route_scope_conflict",
      "exact_candidate_statement_names_q76_not_q20",
    ]) ||
    evidence.preserved_occurrence_decision?.decision_id !==
      "q20-route-redesign-2025-06-29" ||
    evidence.preserved_occurrence_decision.artifact_sha256 !==
      PLAN040_PACKAGE_10C_SOURCE_PINS.occurrence_decisions ||
    evidence.preserved_occurrence_decision.decision_row_sha256 !==
      PLAN040_PACKAGE_10C_SOURCE_PINS.q20_occurrence_decision_row ||
    evidence.preserved_occurrence_decision.review_state !== "approved" ||
    evidence.scope_conflict?.candidate_route_id !== "Q20" ||
    evidence.scope_conflict.statement_named_replacement_route_id !== "Q76" ||
    evidence.scope_conflict.canonical_treatment_row_sha256 !==
      PLAN040_PACKAGE_10C_SOURCE_PINS.q20_conflict_treatment_row ||
    evidence.scope_conflict.ontology_correction_performed
  ) {
    throw new Error("Plan 040 Package 10C Q20 scope conflict drifted");
  }
}

export function buildPlan040Package10cDraft(input: {
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package10cCandidateEvidence[];
  exclusions: Plan040Package10cExclusion[];
  comparisonReceipt: Plan040Package10cComparisonReceiptRef;
  priorCandidateKeys: string[];
  versionSeparation: Plan040Package8VersionSeparation;
}): Plan040Package10cDraft {
  validateVersionSeparation(input.versionSeparation);
  if (
    input.comparisonReceipt.path !==
      "data/quality/acquisition/receipts/member-extent-evidence/plan-040-qbnr-service-pattern-package-10c-full-stop-equivalence-v1.json" ||
    input.comparisonReceipt.sha256 !==
      PLAN040_PACKAGE_10C_COMPARISON_RECEIPT_SHA256 ||
    input.comparisonReceipt.receipt_id !==
      "plan-040-qbnr-service-pattern-package-10c-full-stop-equivalence-v1" ||
    !sameJson(
      input.comparisonReceipt.upstream_pins,
      PLAN040_PACKAGE_10C_UPSTREAM_PINS,
    ) ||
    input.comparisonReceipt.external_acquisition_performed ||
    input.comparisonReceipt.authorizes_occurrence ||
    input.comparisonReceipt.authorizes_study ||
    input.comparisonReceipt.authorizes_cross_product ||
    input.comparisonReceipt.authorizes_decision_persistence
  ) {
    throw new Error("Plan 040 Package 10C comparison receipt drifted");
  }
  const byTreatment = new Map(input.candidates.map((candidate) => [
    candidate.treatment_record_id,
    candidate,
  ]));
  const candidates = PLAN040_PACKAGE_10C_CANDIDATES.map(
    ([, treatmentId]) => byTreatment.get(treatmentId)!,
  );
  const keys = candidates.map((candidate) => candidate?.candidate_key);
  if (
    candidates.some((candidate) => !candidate) ||
    byTreatment.size !== 5 ||
    sortedHash(keys) !== PLAN040_PACKAGE_10C_CANDIDATE_KEY_SHA256 ||
    input.priorCandidateKeys.some((key) => keys.includes(key))
  ) {
    throw new Error("Plan 040 Package 10C candidate scope or overlap drifted");
  }
  for (const candidate of candidates) {
    if (
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence ||
      candidate.exact_candidate_searches.length < 7
    ) {
      throw new Error(`${candidate.treatment_record_id}: authority drifted`);
    }
    if (
      candidate.treatment_record_id ===
        "treatment_q20-q20b-replacement-2025"
    ) validateQ20Conflict(candidate);
    else validatePositive(candidate, input.comparisonReceipt);
  }
  if (
    input.exclusions.length !== 4 ||
    input.exclusions.some((row) =>
      row.candidate_key_sha256 !==
        PLAN040_PACKAGE_10C_EXCLUSION_HASHES[row.scope_id] ||
      row.candidate_key_sha256 !== sortedHash(row.candidate_keys) ||
      row.candidate_keys.length !== row.candidate_count ||
      row.overlap_count !== 0 ||
      row.candidate_keys.some((key) => keys.includes(key)))
  ) {
    throw new Error("Plan 040 Package 10C exclusion drifted");
  }
  return {
    schema_version: 1,
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C,
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 5,
    route_count: 3,
    candidate_key_sha256: PLAN040_PACKAGE_10C_CANDIDATE_KEY_SHA256,
    evidence_verdict_distribution: {
      positive_extent_and_grain_proposed: 4,
      receipt_terminal_unresolved_preserved: 1,
    },
    proposed_extent_distribution: {
      route_wide: 3,
      bounded_segment: 1,
      unresolved: 1,
    },
    proposed_grain_distribution: {
      trip_subset: 4,
      unresolved: 1,
    },
    candidates,
    exclusions: input.exclusions,
    prior_package_overlap_count: 0,
    comparison_receipt: input.comparisonReceipt,
    post_10b_pins: PLAN040_PACKAGE_10C_POST_10B_PINS,
    version_separation: input.versionSeparation,
    review_protocol: {
      review_mode:
        "dual_independent_mixed_positive_and_scope_conflict_risk_review",
      independent_review_required: true,
      dual_independent_review_required: true,
      owner_gate_created: false,
      owner_acceptance_created: false,
      persistence_performed: false,
    },
    authorization_state:
      "evidence_draft_pending_dual_independent_review_no_gate_no_acceptance_no_persistence",
    proposed_extent_decision_count: 4,
    proposed_grain_decision_count: 4,
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    external_acquisition_performed: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}
