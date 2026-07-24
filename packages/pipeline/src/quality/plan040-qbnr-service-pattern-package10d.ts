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

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D =
  "plan-040-qbnr-service-pattern-package-10d-evidence-only-v1" as const;
export const PLAN040_PACKAGE_10D_CANDIDATE_KEY_SHA256 =
  "9e9184a961b11ade5bc8ed1ce1f6d65818b2cad7fc9f62535012faa302f53b5c" as const;

export const PLAN040_PACKAGE_10D_CANDIDATES = [
  ["Q48", "treatment_q48-glen-oaks-branch-2025"],
  ["Q75", "treatment_q75-q30-short-trip-replacement-2025"],
] as const;

export const PLAN040_PACKAGE_10D_POST_10C_PINS = {
  extent_ledger:
    "9026b6e83b27171870602e7599c5a2201522d78bd9f516b6ebf621170ca9d6e4",
  grain_ledger:
    "7e897b559c55e54ba1274ea400895413a4c8bd25e4be203686f69a4b44df9514",
  bridge:
    "d4f58a1b0aa9f2375de96cf5b77ed92e8c2f9236f930fcd3ecfce81af561a6a1",
  study_manifest:
    "91e5909fd51978e95896a28ffc5d0ac3a9592f3f8fc8e9d21e100a723b71bd50",
  member_extent_contract:
    "1bc6d340462cb13839796c9d41491b7d132c5dd12a48a9a1ec90c85ff998437c",
  operational_manifest:
    "04062744b877de3349d914d70768f63b122dc0fcb370ac7a17765f49e9955755",
  occurrence_decisions:
    "80e530c9953e59a767afcb2f0d61202d9a9209469075f41f993fe7469ee45883",
  treatment_components:
    "a9b76c3b7121fc87d0f190a44fb00f182229d8d309968d3ba00a8c27a1492bae",
} as const;

export const PLAN040_PACKAGE_10D_SOURCE_PINS = {
  service_change_html:
    "4b5dc9ca398980a3803e076378acefd7ac3ec04343e0ac32db95a17c1d51226d",
  service_change_blocks:
    "7b46befc331051265d4e7f9ff86ef8dde908474759ec1e94f9cfe28764a28490",
  routes:
    "8ea0278c7acae7585cbe0c85e3fa9407d8ca49b1ca12327b60318b676122a5c0",
  events:
    "ef803fd144062c5299f6137952db4a8f9964be54b1578b9743e227797c0bd972",
  treatment_components:
    "a9b76c3b7121fc87d0f190a44fb00f182229d8d309968d3ba00a8c27a1492bae",
  occurrence_decisions:
    "80e530c9953e59a767afcb2f0d61202d9a9209469075f41f993fe7469ee45883",
  schedule_csv:
    "c592686da8a1cabdc8b559db4d4ae15d5a663adbe08f332e196215fd377be7c5",
  schedule_receipt:
    "82cc442de9b9c0356965f678c8491a78a093eea8eca06bac29d67747355a58c3",
  schedule_blocks:
    "e12d18baf0ed5f6fb019d877922861df44fd99805f58f5b4b8344de89b71658d",
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
  q48_source_block:
    "sha256:2d86bb2a28c2950f7d20c2914620b66ed3a177234eeab7a66616d68708e2977f",
  q46_companion_block:
    "sha256:818a0e3fd80953c23135ac1c6241551489bf67e1f97fc422e8dcef44d22bb2f4",
  q75_source_block:
    "sha256:f481dd4474426569dd3d1c54dd2de10c52c1e461c4eb991cee063347de6abcbe",
  q30_companion_block:
    "sha256:e43fd1c71a0ba4019c84dbe0986cd5eef781f8d8f47ed3b880952b32331eb027",
  q48_treatment_row:
    "b5c4650056ebf0218e8d8baf4c1765d4ba16a353bc26a23ee2914960bfc2f176",
  q48_route_row:
    "0127bd9e395217327352ac3a4e46d3f91baa6de2a32a0e2ab2b1df9576f1b3ea",
  q48_event_row:
    "e583b4f73ee3e045855047c53c1f428438f110fc4b85de75a0a3b9d40e2958a3",
  q48_occurrence_row:
    "d00bb0950e6f03aba0a7d04193897731a7dcecd62645547183174b63f8c5bea2",
  q48_sibling_treatment_row:
    "04d31e88693c85f6013f3fdb1b79effbee5b648f9915607ec3a6adc2dca42bf4",
  q75_treatment_row:
    "051476d285e94e0662e4df6fe50d794bdced741c319d749ad00ac1e6da8be201",
  q75_route_row:
    "0382e3ad492a33a651216dca71f0c0ab1638e4413f9902e07aad9c494ef0b2ed",
  q75_event_row:
    "ff23cd9db713ffdb43144d3de025de05502cc217cfc72977cb8a9160fe56a79f",
  q75_occurrence_row:
    "d1047547232862dd9057698e279c4b828180ded1e8adc5caf20378fbecc6bd6f",
  q75_sibling_treatment_row:
    "efbd2880e7973776a80d1ee0da104b98c64f7d1cbea2c3bc64417175d437812e",
} as const;

export const PLAN040_PACKAGE_10D_EXCLUSION_HASHES = {
  remaining_q39_q58_q14:
    "68f9438ea35af69c737457fef27b4fb2a7897c8da74b650299abd4b508bfdf7f",
  q67: "0839dcd8540add7e2065ff6027492dcc13f70442b149da5a0fae16ef7fb4ea24",
  prior_limited_stop_siblings:
    "2c2808e1afa357866c3daa2ff1b707fe11cb4cb30699f587260808b006baf7d3",
  current_occurrence_limited_stop_siblings:
    "c98ac066827a15c254575890c77fcec1fc5d85ad21360e94932aa28ca5d847d4",
} as const;

export const PLAN040_PACKAGE_10D_PATTERN_PINS = {
  q46_glen_oaks_local_direction_0: {
    pattern_id: "historical-full-stop-pattern:5258027a37d9549a602c275c",
    trip_count: 67,
    trip_id_sha256:
      "80a3799f28727f4dfc40f163cea355a1c38d265a65362eb8e86ec0fcd7b850fb",
    shape_ids: ["Q460385"],
    stop_count: 47,
    stop_chain_sha256:
      "0f2a044925b48c97960a00c16aa1e9ac944c9c2fd7875d449fc2b62f93b36b23",
  },
  q46_glen_oaks_local_direction_1: {
    pattern_id: "historical-full-stop-pattern:3984a35758b2be1a31ba7f54",
    trip_count: 71,
    trip_id_sha256:
      "f326092f6e7a891727116f68ed6cce5ad1e62e556b9d6d91e3df77fa06a78034",
    shape_ids: ["Q460023"],
    stop_count: 45,
    stop_chain_sha256:
      "ee7a10c134e5ef05524bd5bdb351ed790b15f0d0a33b89e0c0233dddbea45658",
  },
  q46_glen_oaks_limited_direction_0: {
    pattern_id: "historical-full-stop-pattern:8079a510277f2a6315826ca4",
    trip_count: 32,
    trip_id_sha256:
      "1b96ad674bb788548f0c309186df123dc418b1337948401e89dae28edd5c4ebf",
    shape_ids: ["Q460388"],
    stop_count: 28,
    stop_chain_sha256:
      "dbc18389ff48d952cc186963883756d0f5635ba27eaaa96ad50d627d864f23fc",
  },
  q46_glen_oaks_limited_direction_1: {
    pattern_id: "historical-full-stop-pattern:6c8d2ea9e767e881e55ab55c",
    trip_count: 21,
    trip_id_sha256:
      "6485ddcbec05b2ff6689dea55b9981e3c33c215b927b63744ebeb02fb8fdf159",
    shape_ids: ["Q460324"],
    stop_count: 26,
    stop_chain_sha256:
      "b79cf3bf4fd8603d84d0a3848d881672410588a04721eb30f2a7e34ceb052576",
  },
  q30_qcc_direction_0: {
    pattern_id: "historical-full-stop-pattern:f8c55591a4693875fc2606ce",
    trip_count: 74,
    trip_id_sha256:
      "81bf597da530c4476b4811bfc1a8c9f3938c979de154f767e9d9e35a84a511ca",
    shape_ids: ["Q300052"],
    stop_count: 40,
    stop_chain_sha256:
      "0f286bf15789e27c0779d7854c4b0b1b246e3dbca38b217cc96e7bf184e1b412",
  },
  q30_qcc_direction_1: {
    pattern_id: "historical-full-stop-pattern:58e429d74ec3dc51f59a5564",
    trip_count: 55,
    trip_id_sha256:
      "d01b7f63695694caf4d2a45be9c3f5cf3f131a86b924ecb21ccd284c8bef4d7b",
    shape_ids: ["Q300122"],
    stop_count: 43,
    stop_chain_sha256:
      "f586ccd3341a4031765ab7d568612b390883154387c9249d7dc5133223db7441",
  },
  q30_little_neck_direction_0: {
    pattern_id: "historical-full-stop-pattern:1feafae07a8837ea8e9a2db5",
    trip_count: 74,
    trip_id_sha256:
      "a37baf8a7e9056b191ea0cae2d0cb83e0afe6d1f6af0513d10a49426bdfd3cb9",
    shape_ids: ["Q300053"],
    stop_count: 50,
    stop_chain_sha256:
      "838da2cab935049cd40c272f60921155d6f40cf909d9541fc33e425839918e49",
  },
  q30_little_neck_direction_1: {
    pattern_id: "historical-full-stop-pattern:cffbb6d651f6427f0e59043e",
    trip_count: 74,
    trip_id_sha256:
      "3e9e660e543ee6e9b7df33249368496d6e208443c4d05332de9f480505024583",
    shape_ids: ["Q300121"],
    stop_count: 52,
    stop_chain_sha256:
      "bd6891acc13ffa1163ef5ad5c891fe7bd7bcd2f1b5b9f95e5218ee1b1cf59baf",
  },
  q48_direction_0: {
    pattern_id: "historical-full-stop-pattern:f24b49f1d1edb2cba08ee8aa",
    trip_count: 66,
    trip_id_sha256:
      "f2ef033bf79bd60fa04dc50f5732b9cf1a003216307ac97e9623bb8bfd524b61",
    shape_ids: ["Q480118"],
    stop_count: 27,
    stop_chain_sha256:
      "cbc67e52b007c9820ea9c3e923395aecfc2b0b2b19e0983ad835dc34f5b6ae7a",
  },
  q48_direction_1: {
    pattern_id: "historical-full-stop-pattern:c0fcc39c5449fc8d69c7c1f7",
    trip_count: 63,
    trip_id_sha256:
      "b39c9f031798e03fec5a553a06aff1cf6e5f01e182c5359b63e14a163111f6ba",
    shape_ids: ["Q480117"],
    stop_count: 25,
    stop_chain_sha256:
      "77578e37660eaed9f4534ad3f9682ae92e7215d37c5b1b72d51ea02307e0ad71",
  },
  q75_direction_0: {
    pattern_id: "historical-full-stop-pattern:4c5b51de6da6df9c7287b4fd",
    trip_count: 79,
    trip_id_sha256:
      "6175320c05d27fa6e7019cb977d3fc547b16c8c79a6badc0193174fb5e5bcf0d",
    shape_ids: ["Q750036"],
    stop_count: 20,
    stop_chain_sha256:
      "5833945292ad560a458614bd753f4f059ed72f06f18e770a4675e275586b740c",
  },
  q75_direction_1: {
    pattern_id: "historical-full-stop-pattern:e072fcdd712e4cbfd928944f",
    trip_count: 80,
    trip_id_sha256:
      "1541ca7da0e4214ad2110548b379a1558e5f7b6c5b4ff0de1f0dcd8c7735a282",
    shape_ids: ["Q750039"],
    stop_count: 19,
    stop_chain_sha256:
      "704a368940c4381601fab9569a937e53d9c3a633d9548c657df5187fc348770d",
  },
} as const;

export const PLAN040_PACKAGE_10D_COMPARISON_PINS = {
  q46_local_direction_0: {
    comparison_id:
      "historical-full-stop-comparison:b168e24bfb24261f01a9d254",
    full_chain_comparison_sha256:
      "9b0a29615baa6ca0eb85f91f3ba492233f42333f02e6abb944461e1140c53376",
  },
  q46_local_direction_1: {
    comparison_id:
      "historical-full-stop-comparison:cf218330fdd4a3956095e77e",
    full_chain_comparison_sha256:
      "abb896fe51005d12bae8f9fe9f0cd1d9e2ac39fab492305432c0da1897f28538",
  },
  q46_limited_sensitivity_direction_0: {
    comparison_id:
      "historical-full-stop-comparison:42a443cf36a55a3afd6b4eed",
    full_chain_comparison_sha256:
      "fa3e7a23d25a2d7f571f33124471deea82a56fce5b2bb3cb9e518ce472423c04",
  },
  q46_limited_sensitivity_direction_1: {
    comparison_id:
      "historical-full-stop-comparison:f16875de9e1f1b4befa0ef74",
    full_chain_comparison_sha256:
      "700d6635f820cedb6817fb2d611c8d6a5c19211e1d42b7ed78d69b4ba17a6247",
  },
  q30_qcc_direction_0: {
    comparison_id:
      "historical-full-stop-comparison:2459828e461f9f4facdb6637",
    full_chain_comparison_sha256:
      "1c5dc8b32e72014232103690327cf4ca5361fbb80fa91c444d0e6eb9be605b22",
  },
  q30_qcc_direction_1: {
    comparison_id:
      "historical-full-stop-comparison:1b4680c68cbccdbd2e2b183a",
    full_chain_comparison_sha256:
      "63523aaf7d05a2b5926abd5c0925828f36a596bba26ec9684d6024d87d278621",
  },
} as const;

export const PLAN040_PACKAGE_10D_UPSTREAM_PINS = {
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

export const PLAN040_PACKAGE_10D_COMPARISON_RECEIPT_SHA256 =
  "76582c438e699c94418b76a86563a7b4fd1be13eb0677b9be8172dd3c45af39b" as const;

export type Plan040Package10dComparisonReceiptRef = {
  path:
    "data/quality/acquisition/receipts/member-extent-evidence/plan-040-qbnr-service-pattern-package-10d-full-stop-equivalence-v1.json";
  sha256: string;
  receipt_id:
    "plan-040-qbnr-service-pattern-package-10d-full-stop-equivalence-v1";
  source_id:
    "plan_040_qbnr_service_pattern_package_10d_full_stop_equivalence";
  upstream_pins: typeof PLAN040_PACKAGE_10D_UPSTREAM_PINS;
  normal_file_verified: true;
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package10dCandidateEvidence = {
  candidate_key: string;
  occurrence_id:
    | "occurrence:29fc4436c22b58d52f231964"
    | "occurrence:5ac0e55f39f63140204859b1";
  route_record_id:
    | "route_q48-glen-oaks-2025"
    | "route_q75-qbnr-2025";
  gtfs_route_id: "Q48" | "Q75";
  treatment_record_id:
    (typeof PLAN040_PACKAGE_10D_CANDIDATES)[number][1];
  treatment_family: "service_pattern";
  source_statement: {
    source_id: "mta_queens_bus_network_redesign_service_changes";
    evidence_id: string;
    block_id: "p001_b0053" | "p001_b0075";
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
  evidence_verdict: "positive_extent_and_grain_proposed";
  proposed_extent_decision: MemberExtentDecision;
  proposed_grain_decision: MemberGrainDecision;
  persisted_extent_decision: null;
  persisted_grain_decision: null;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package10dExclusion = {
  scope_id: keyof typeof PLAN040_PACKAGE_10D_EXCLUSION_HASHES;
  candidate_count: number;
  candidate_keys: string[];
  candidate_key_sha256: string;
  overlap_count: 0;
};

export type Plan040Package10dDraft = {
  schema_version: 1;
  package_id: typeof PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D;
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 2;
  route_count: 2;
  candidate_key_sha256:
    typeof PLAN040_PACKAGE_10D_CANDIDATE_KEY_SHA256;
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 2;
  };
  proposed_extent_distribution: { route_wide: 2 };
  proposed_grain_distribution: { trip_subset: 2 };
  candidates: Plan040Package10dCandidateEvidence[];
  exclusions: Plan040Package10dExclusion[];
  prior_package_overlap_count: 0;
  comparison_receipt: Plan040Package10dComparisonReceiptRef;
  post_10c_pins: typeof PLAN040_PACKAGE_10D_POST_10C_PINS;
  version_separation: Plan040Package8VersionSeparation;
  review_protocol: {
    review_mode:
      "dual_independent_lineage_variant_and_sibling_scope_risk_review";
    independent_review_required: true;
    dual_independent_review_required: true;
    owner_gate_created: false;
    owner_acceptance_created: false;
    persistence_performed: false;
  };
  authorization_state:
    "evidence_draft_pending_dual_independent_review_no_gate_no_acceptance_no_persistence";
  proposed_extent_decision_count: 2;
  proposed_grain_decision_count: 2;
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

export function plan040Package10dReplayHash(value: JsonValue): string {
  return sha256(`${stableJson(value)}\n`);
}

function validateVersionSeparation(
  value: Plan040Package8VersionSeparation,
): void {
  const correction = value.corrected_first_week_diff.corrections.queens;
  if (
    value.published_launch_diff.status !==
      "completed_from_accepted_initial_feed_bytes" ||
    value.published_launch_diff.correction_bytes_used ||
    value.published_launch_diff.correction_version_sha1s_used.length !== 0 ||
    value.corrected_first_week_diff.status !== "blocked_not_run" ||
    value.corrected_first_week_diff.comparison_run ||
    value.corrected_first_week_diff.correction_bytes_used ||
    value.corrected_first_week_diff.corrected_diff_used ||
    value.corrected_first_week_diff.published_launch_outcomes_reclassified ||
    correction.version_sha1 !== "6db867de2ce30f47ae0ee763f422dc34fb7a9f9f" ||
    correction.exact_zip_bytes_status !== "blocked_unavailable" ||
    correction.correction_bytes_used ||
    correction.corrected_diff_used
  ) {
    throw new Error("Plan 040 Package 10D correction-version separation drifted");
  }
}

const expected = {
  "treatment_q48-glen-oaks-branch-2025": {
    occurrence_id: "occurrence:29fc4436c22b58d52f231964",
    route_record_id: "route_q48-glen-oaks-2025",
    pattern_ids: [
      PLAN040_PACKAGE_10D_PATTERN_PINS.q48_direction_0.pattern_id,
      PLAN040_PACKAGE_10D_PATTERN_PINS.q48_direction_1.pattern_id,
    ],
    primary_comparison_ids: [
      PLAN040_PACKAGE_10D_COMPARISON_PINS.q46_local_direction_0.comparison_id,
      PLAN040_PACKAGE_10D_COMPARISON_PINS.q46_local_direction_1.comparison_id,
    ],
    sensitivity_comparison_ids: [
      PLAN040_PACKAGE_10D_COMPARISON_PINS
        .q46_limited_sensitivity_direction_0.comparison_id,
      PLAN040_PACKAGE_10D_COMPARISON_PINS
        .q46_limited_sensitivity_direction_1.comparison_id,
    ],
    occurrence_row_sha256:
      PLAN040_PACKAGE_10D_SOURCE_PINS.q48_occurrence_row,
    sibling_treatment_record_id: "treatment_q48-limited-stops-2025",
  },
  "treatment_q75-q30-short-trip-replacement-2025": {
    occurrence_id: "occurrence:5ac0e55f39f63140204859b1",
    route_record_id: "route_q75-qbnr-2025",
    pattern_ids: [
      PLAN040_PACKAGE_10D_PATTERN_PINS.q75_direction_0.pattern_id,
      PLAN040_PACKAGE_10D_PATTERN_PINS.q75_direction_1.pattern_id,
    ],
    primary_comparison_ids: [
      PLAN040_PACKAGE_10D_COMPARISON_PINS.q30_qcc_direction_0.comparison_id,
      PLAN040_PACKAGE_10D_COMPARISON_PINS.q30_qcc_direction_1.comparison_id,
    ],
    sensitivity_comparison_ids: [],
    occurrence_row_sha256:
      PLAN040_PACKAGE_10D_SOURCE_PINS.q75_occurrence_row,
    sibling_treatment_record_id: "treatment_q75-limited-stops-2025",
  },
} as const;

function validateCandidate(
  candidate: Plan040Package10dCandidateEvidence,
  comparisonReceipt: Plan040Package10dComparisonReceiptRef,
): void {
  const pin = expected[candidate.treatment_record_id];
  const extent = candidate.proposed_extent_decision;
  const grain = candidate.proposed_grain_decision;
  const evidence = candidate.accepted_evidence as {
    comparison_receipt?: Plan040Package10dComparisonReceiptRef;
    date_role?: {
      statement_effective_date?: string;
      pre_comparison_date?: string;
      pre_day_type?: string;
      published_post_pre_effective_date?: string;
      published_post_pre_effective_active_trip_count?: number;
      effective_date?: string;
      effective_day_type?: string;
      effective_active_trip_count?: number;
      activation_basis?: string;
    };
    launch_schedule?: {
      passenger_policy?: string;
      retained_trip_types?: string[];
      excluded_trip_types?: string[];
      passenger_shape_ids?: string[];
      gtfs_successor_shape_ids?: string[];
      shape_match?: boolean;
    };
    primary_full_stop_comparisons?: Array<{ comparison_id: string }>;
    limited_variant_sensitivity?: {
      comparison_ids?: string[];
      affects_primary_lineage?: boolean;
    } | null;
    q30_little_neck_exclusion?: {
      pattern_ids?: string[];
      included_in_lineage?: boolean;
    } | null;
    preserved_occurrence_decision?: {
      occurrence_id?: string;
      decision_row_sha256?: string;
      review_state?: string;
      exact_member_treatment_record_ids?: string[];
    };
    preserved_limited_stop_sibling?: {
      treatment_record_id?: string;
      extent_or_grain_change_performed?: boolean;
      occurrence_membership_change_performed?: boolean;
    };
    changed_identifier_equivalence_authorized?: boolean;
  };
  validateMemberExtentDecision(extent);
  parseMemberGrainDecision(grain, `${candidate.treatment_record_id}.grain`);
  const comparisonIds = (evidence.primary_full_stop_comparisons ?? [])
    .map((row) => row.comparison_id).sort();
  const dateRole = evidence.date_role;
  if (
    candidate.occurrence_id !== pin.occurrence_id ||
    candidate.route_record_id !== pin.route_record_id ||
    extent.resolution !== "route_wide" ||
    grain.service_scope.kind !== "trip_subset" ||
    !sameJson(grain.service_scope.periods, ["weekday"]) ||
    !sameJson(grain.service_scope.directions, ["0", "1"]) ||
    !sameJson(grain.service_scope.pattern_ids, [...pin.pattern_ids].sort()) ||
    grain.lineage_segments.length !== 2 ||
    !sameJson(comparisonIds, [...pin.primary_comparison_ids].sort()) ||
    !sameJson(evidence.comparison_receipt, comparisonReceipt) ||
    dateRole?.statement_effective_date !== "2025-06-30" ||
    dateRole.pre_comparison_date !== "2025-06-27" ||
    dateRole.pre_day_type !== "Friday" ||
    dateRole.published_post_pre_effective_date !== "2025-06-29" ||
    dateRole.published_post_pre_effective_active_trip_count !== 0 ||
    dateRole.effective_date !== "2025-06-30" ||
    dateRole.effective_day_type !== "Monday" ||
    dateRole.effective_active_trip_count !==
      (candidate.gtfs_route_id === "Q48" ? 129 : 159) ||
    dateRole.activation_basis !== "calendar_plus_calendar_dates" ||
    evidence.launch_schedule?.passenger_policy !==
      "exclude_trip_types_2_3_4_retain_1_12" ||
    !sameJson(evidence.launch_schedule.retained_trip_types, ["1", "12"]) ||
    !sameJson(evidence.launch_schedule.excluded_trip_types, ["2", "3", "4"]) ||
    !evidence.launch_schedule.shape_match ||
    !sameJson(
      [...(evidence.launch_schedule.passenger_shape_ids ?? [])].sort(),
      [...(evidence.launch_schedule.gtfs_successor_shape_ids ?? [])].sort(),
    ) ||
    evidence.preserved_occurrence_decision?.occurrence_id !==
      pin.occurrence_id ||
    evidence.preserved_occurrence_decision.decision_row_sha256 !==
      pin.occurrence_row_sha256 ||
    evidence.preserved_occurrence_decision.review_state !== "approved" ||
    evidence.preserved_limited_stop_sibling?.treatment_record_id !==
      pin.sibling_treatment_record_id ||
    evidence.preserved_limited_stop_sibling.extent_or_grain_change_performed ||
    evidence.preserved_limited_stop_sibling
      .occurrence_membership_change_performed ||
    evidence.changed_identifier_equivalence_authorized ||
    candidate.evidence_verdict !== "positive_extent_and_grain_proposed" ||
    candidate.persisted_extent_decision !== null ||
    candidate.persisted_grain_decision !== null ||
    candidate.authorizes_occurrence ||
    candidate.authorizes_study ||
    candidate.authorizes_cross_product ||
    candidate.authorizes_decision_persistence ||
    candidate.exact_candidate_searches.length < 12
  ) {
    throw new Error(`${candidate.treatment_record_id}: evidence drifted`);
  }
  if (candidate.gtfs_route_id === "Q48") {
    if (
      !sameJson(
        evidence.limited_variant_sensitivity?.comparison_ids,
        [...pin.sensitivity_comparison_ids].sort(),
      ) ||
      evidence.limited_variant_sensitivity?.affects_primary_lineage ||
      evidence.q30_little_neck_exclusion !== null
    ) {
      throw new Error("Plan 040 Package 10D Q48 variant sensitivity drifted");
    }
  } else if (
    evidence.limited_variant_sensitivity !== null ||
    evidence.q30_little_neck_exclusion?.included_in_lineage ||
    !sameJson(evidence.q30_little_neck_exclusion?.pattern_ids, [
      PLAN040_PACKAGE_10D_PATTERN_PINS.q30_little_neck_direction_0.pattern_id,
      PLAN040_PACKAGE_10D_PATTERN_PINS.q30_little_neck_direction_1.pattern_id,
    ].sort())
  ) {
    throw new Error("Plan 040 Package 10D Q75 lineage exclusion drifted");
  }
}

export function buildPlan040Package10dDraft(input: {
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package10dCandidateEvidence[];
  exclusions: Plan040Package10dExclusion[];
  comparisonReceipt: Plan040Package10dComparisonReceiptRef;
  priorCandidateKeys: string[];
  versionSeparation: Plan040Package8VersionSeparation;
}): Plan040Package10dDraft {
  validateVersionSeparation(input.versionSeparation);
  if (
    input.comparisonReceipt.path !==
      "data/quality/acquisition/receipts/member-extent-evidence/plan-040-qbnr-service-pattern-package-10d-full-stop-equivalence-v1.json" ||
    input.comparisonReceipt.sha256 !==
      PLAN040_PACKAGE_10D_COMPARISON_RECEIPT_SHA256 ||
    input.comparisonReceipt.receipt_id !==
      "plan-040-qbnr-service-pattern-package-10d-full-stop-equivalence-v1" ||
    !sameJson(
      input.comparisonReceipt.upstream_pins,
      PLAN040_PACKAGE_10D_UPSTREAM_PINS,
    ) ||
    !input.comparisonReceipt.normal_file_verified ||
    input.comparisonReceipt.external_acquisition_performed ||
    input.comparisonReceipt.authorizes_occurrence ||
    input.comparisonReceipt.authorizes_study ||
    input.comparisonReceipt.authorizes_cross_product ||
    input.comparisonReceipt.authorizes_decision_persistence
  ) {
    throw new Error("Plan 040 Package 10D comparison receipt drifted");
  }
  const byTreatment = new Map(input.candidates.map((candidate) => [
    candidate.treatment_record_id,
    candidate,
  ]));
  const candidates = PLAN040_PACKAGE_10D_CANDIDATES.map(
    ([, treatmentId]) => byTreatment.get(treatmentId)!,
  );
  const keys = candidates.map((candidate) => candidate?.candidate_key);
  if (
    candidates.some((candidate) => !candidate) ||
    byTreatment.size !== 2 ||
    sortedHash(keys) !== PLAN040_PACKAGE_10D_CANDIDATE_KEY_SHA256 ||
    input.priorCandidateKeys.some((key) => keys.includes(key))
  ) {
    throw new Error("Plan 040 Package 10D candidate scope or overlap drifted");
  }
  for (const candidate of candidates) {
    validateCandidate(candidate, input.comparisonReceipt);
  }
  if (
    input.exclusions.length !== 4 ||
    input.exclusions.some((row) =>
      row.candidate_key_sha256 !==
        PLAN040_PACKAGE_10D_EXCLUSION_HASHES[row.scope_id] ||
      row.candidate_key_sha256 !== sortedHash(row.candidate_keys) ||
      row.candidate_keys.length !== row.candidate_count ||
      row.overlap_count !== 0 ||
      row.candidate_keys.some((key) => keys.includes(key)))
  ) {
    throw new Error("Plan 040 Package 10D exclusion drifted");
  }
  return {
    schema_version: 1,
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D,
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 2,
    route_count: 2,
    candidate_key_sha256: PLAN040_PACKAGE_10D_CANDIDATE_KEY_SHA256,
    evidence_verdict_distribution: {
      positive_extent_and_grain_proposed: 2,
    },
    proposed_extent_distribution: { route_wide: 2 },
    proposed_grain_distribution: { trip_subset: 2 },
    candidates,
    exclusions: input.exclusions,
    prior_package_overlap_count: 0,
    comparison_receipt: input.comparisonReceipt,
    post_10c_pins: PLAN040_PACKAGE_10D_POST_10C_PINS,
    version_separation: input.versionSeparation,
    review_protocol: {
      review_mode:
        "dual_independent_lineage_variant_and_sibling_scope_risk_review",
      independent_review_required: true,
      dual_independent_review_required: true,
      owner_gate_created: false,
      owner_acceptance_created: false,
      persistence_performed: false,
    },
    authorization_state:
      "evidence_draft_pending_dual_independent_review_no_gate_no_acceptance_no_persistence",
    proposed_extent_decision_count: 2,
    proposed_grain_decision_count: 2,
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    external_acquisition_performed: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}
