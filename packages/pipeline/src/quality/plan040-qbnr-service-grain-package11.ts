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

export const PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11 =
  "plan-040-qbnr-service-grain-package-11-evidence-only-v1" as const;

export const PLAN040_PACKAGE_11_Q82_CANDIDATE_KEY_SHA256 =
  "61e7db64a20451175aee641a6aca8fb5e074cecf6339b41a5439d5cd6af7e19a" as const;
export const PLAN040_PACKAGE_11_GRAIN_ONLY_CANDIDATE_KEY_SHA256 =
  "ea10efc86608dde12e40e776f95d7a6ef30da83e68d5b7728edeeedd1941cf7b" as const;
export const PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256 =
  "bff3e73e619e8224c60f6360235903d9e3e0850a44b26a545fe63fbbb20570fd" as const;
export const PLAN040_PACKAGE_11_REJECTED_DISCOVERY_SHA256_PREFIX =
  "b8929342" as const;

export const PLAN040_PACKAGE_11_CANDIDATES = [
  ["Q82", "treatment_q82-limited-stops-2025"],
  ["Q45", "treatment_q45-all-day-frequent-service-2025"],
  ["Q45", "treatment_q45-direct-connection-2025"],
  ["Q63", "treatment_q63-limited-stops-2025"],
  ["Q63", "treatment_q63-northern-boulevard-connection-2025"],
  ["Q80", "treatment_q80-frequency-overnight-service-2025"],
  ["Q80", "treatment_q80-q10-limited-branch-replacement-2025"],
  ["Q86", "treatment_q86-limited-stops-2025"],
  ["Q86", "treatment_q86-q5-q85-branch-combination-2025"],
  ["Q87", "treatment_q87-limited-stops-2025"],
  ["Q87", "treatment_q87-q5-green-acres-replacement-2025"],
  ["QM68", "treatment_qm68-route-rename-2025"],
] as const;

export const PLAN040_PACKAGE_11_GLOBAL_PINS = {
  extent_ledger:
    "677586944219a59e1d6d74b7bf7c6b39150a99a0a84dce6bdc4fac11cf9057e9",
  grain_ledger:
    "bb6c5aca8bff36494e6c1e0857d2a6e722c3fb523cd2aca2ee8b17f3fa2730cf",
  bridge_ledger:
    "6c82b4a37067e6c7de563e373c7187c75a15610118da6fa3c64cdb70133e755b",
  study_manifest:
    "2aca7fc78f36440a89db0b85a23baf69d421bc93ebe22e32514285670f7dd882",
  member_extent_contract:
    "2898c276271722374ce81b23d02d2110ddef198055cdfcb81e1d6c29094144c4",
  member_extent_manifest:
    "51ad2e7d37f751f9278bf695342a0497803601efe0ad0ada3c49ad85e8cd8158",
  occurrence_decisions:
    "80e530c9953e59a767afcb2f0d61202d9a9209469075f41f993fe7469ee45883",
  treatment_components:
    "a9b76c3b7121fc87d0f190a44fb00f182229d8d309968d3ba00a8c27a1492bae",
  routes:
    "8ea0278c7acae7585cbe0c85e3fa9407d8ca49b1ca12327b60318b676122a5c0",
  events:
    "ef803fd144062c5299f6137952db4a8f9964be54b1578b9743e227797c0bd972",
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
  package_10b_evidence:
    "43877f6b9461ce904f8536789b28bc746afc42c15be02115cdbe8317ce4334c6",
  package_10b_full_stop_receipt:
    "09475af217f46307c25ada24ff0fcdc98b2f24e999f956586b6d02df041d7aec",
  package_9_evidence:
    "376a3e9f184a24530d344eea0f53842fabce2e83ab2eb12b21bc59fd7ee10a7c",
  package_10d_evidence:
    "2420151d952fe8699a3db4d372f80dea215fb9df59598e87a57dd698d8811b2a",
  package_10d_gate:
    "028de64a4ab4ef7d1d3aff9db8dec7a512b780106b075e11b82e158ab4808509",
  package_10d_acceptance:
    "3020c59c952e584e72d9c19610ed945f6fef472afc0679580ae08e91ed501de0",
  package_10d_extent_decisions:
    "6d3b5948bfb9e44c073fa6bd19b52dcb08b21a8b50fab96a02987fb6ec94d2b1",
  package_10d_grain_decisions:
    "571971292568abfa1d8e85d77318c012a955935cbb5dd5de90d5e28482c8c521",
  queens_pre_receipt:
    "07fc854e9d4f2e980048741b335c95f781f03b8a8914c4eb0acd51bd92c540c6",
  queens_post_receipt:
    "0a66e26e639674b88bd1d0251d6a15f4cab2205e794fa14a3d75367c43394eeb",
} as const;

export const PLAN040_PACKAGE_11_Q82_PATTERN_IDS = [
  "historical-full-stop-pattern:c97d65b9140c8cf53b45d350",
  "historical-full-stop-pattern:e09dcd02793958baccb601c5",
] as const;
export const PLAN040_PACKAGE_11_Q45_PATTERN_IDS = [
  "historical-full-stop-pattern:3d8663f6da3d3ff3520baff9",
  "historical-full-stop-pattern:3def450ff1019eb379c18e7d",
] as const;
export const PLAN040_PACKAGE_11_Q86_PATTERN_IDS = [
  "historical-full-stop-pattern:7107696679d0590465ebd108",
  "historical-full-stop-pattern:e7d30ef334e9adf2a72b5eec",
] as const;
export const PLAN040_PACKAGE_11_QM68_COMPARISON_IDS = [
  "historical-full-stop-comparison:28d7f7b8d25ec2c5a0ea01cc",
  "historical-full-stop-comparison:511bf816db926e48013d32c2",
  "historical-full-stop-comparison:9d15a66ded0866bd35d2a9c3",
  "historical-full-stop-comparison:e63ba8d93b2c293c1177967f",
] as const;

export const PLAN040_PACKAGE_11_POSITIVE_PATTERN_PINS = {
  q45_direction_0: {
    pattern_id: "historical-full-stop-pattern:3d8663f6da3d3ff3520baff9",
    snapshot_id: "gtfs-static-20250626-queens-post-qbnr",
    service_date: "2025-06-29",
    route_id: "Q45",
    direction_id: "0",
    trip_count: 72,
    trip_id_sha256:
      "4dcc02dd043cf04b7b1031fd6d6b3b7908686a7971f2070d78e805b1436c12fe",
    shape_ids: ["Q450028"],
    stop_count: 14,
    stop_chain_sha256:
      "14855db6f7378a30aed0228b9faeb9743745c1039dae4bfc727e8e7d9e934675",
  },
  q45_direction_1: {
    pattern_id: "historical-full-stop-pattern:3def450ff1019eb379c18e7d",
    snapshot_id: "gtfs-static-20250626-queens-post-qbnr",
    service_date: "2025-06-29",
    route_id: "Q45",
    direction_id: "1",
    trip_count: 75,
    trip_id_sha256:
      "c33ebc264cdd8af39d587dec7f9f1a9094f3d550684320de82cec2e9639c9e88",
    shape_ids: ["Q450023"],
    stop_count: 14,
    stop_chain_sha256:
      "31fee3512c93e1583831ce1f8cd89b1238564d9312fd1dbff063a71a95609d72",
  },
  q86_direction_0: {
    pattern_id: "historical-full-stop-pattern:e7d30ef334e9adf2a72b5eec",
    snapshot_id: "gtfs-static-20250626-queens-post-qbnr",
    service_date: "2025-06-29",
    route_id: "Q86",
    direction_id: "0",
    trip_count: 36,
    trip_id_sha256:
      "0e55cd8fed6964a874dc38f44b1e39229b2931ab9df76b433ff0bf4e62b6cb95",
    shape_ids: ["Q860045"],
    stop_count: 24,
    stop_chain_sha256:
      "e4a182539ba78bde8f983013a6896f61f4ebdb084415e0592428cd33607f8f85",
  },
  q86_direction_1: {
    pattern_id: "historical-full-stop-pattern:7107696679d0590465ebd108",
    snapshot_id: "gtfs-static-20250626-queens-post-qbnr",
    service_date: "2025-06-29",
    route_id: "Q86",
    direction_id: "1",
    trip_count: 37,
    trip_id_sha256:
      "bbe451c1f0f0eeb4fe7488eed52dc4114a23310221ab052cec87fb0a5a7540d7",
    shape_ids: ["Q860044"],
    stop_count: 25,
    stop_chain_sha256:
      "378de9f7ea0ae884e332d9a6f48b7286c470c708c239dc03ff21c09c012cb020",
  },
} as const;

export const PLAN040_PACKAGE_11_POSITIVE_PATTERN_RECEIPT_SHA256 =
  "73ea977e2e3d0365a53e6b817d7429b777abafe1acbd37921d8b2b0d98f9ac89" as const;

export type Plan040Package11PositivePatternReceiptRef = {
  path:
    "data/quality/acquisition/receipts/member-extent-evidence/plan-040-qbnr-service-grain-package-11-positive-patterns-v1.json";
  sha256: string;
  receipt_id:
    "plan-040-qbnr-service-grain-package-11-positive-patterns-v1";
  source_id:
    "plan_040_qbnr_service_grain_package_11_positive_patterns";
  snapshot_id: "gtfs-static-20250626-queens-post-qbnr";
  service_date: "2025-06-29";
  replay_derived: true;
  normal_file_verified: true;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package11CandidateEvidence = {
  candidate_key: string;
  occurrence_id: string;
  route_record_id: string;
  gtfs_route_id: (typeof PLAN040_PACKAGE_11_CANDIDATES)[number][0];
  treatment_record_id:
    (typeof PLAN040_PACKAGE_11_CANDIDATES)[number][1];
  treatment_family: string;
  source_statement: {
    source_id: "mta_queens_bus_network_redesign_service_changes";
    evidence_id: string;
    block_id: string;
    block_sha256: string;
    source_quote: string;
  };
  immutable_candidate_rows: {
    occurrence_decision: JsonValue;
    occurrence_row_sha256: string;
    treatment_component: JsonValue;
    treatment_row_sha256: string;
    extent_ledger_row_sha256: string;
    grain_ledger_row_sha256: string;
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
    | "positive_grain_only_proposed"
    | "structured_unresolved_grain_proposed";
  proposed_extent_decision: MemberExtentDecision | null;
  proposed_grain_decision: MemberGrainDecision;
  persisted_extent_decision: null;
  persisted_grain_decision: null;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package11Exclusion = {
  scope_id:
    | "q89_residual_limited_stop"
    | "qm68_midtown_stop_additions"
    | "package_10b_accepted_sibling_decisions"
    | "package_10d_q48_limited_stop_sibling"
    | "historical_old_q48_context";
  candidate_keys: string[];
  candidate_key_sha256: string;
  preservation_evidence: Record<string, JsonValue>;
  unchanged: true;
};

export type Plan040Package11Draft = {
  schema_version: 1;
  package_id: typeof PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11;
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 12;
  route_count: 7;
  candidate_scope_discovery: {
    q82_candidate_key_sha256:
      typeof PLAN040_PACKAGE_11_Q82_CANDIDATE_KEY_SHA256;
    grain_only_11_candidate_key_sha256:
      typeof PLAN040_PACKAGE_11_GRAIN_ONLY_CANDIDATE_KEY_SHA256;
    combined_12_candidate_key_sha256:
      typeof PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256;
    rejected_supplied_discovery_sha256_prefix:
      typeof PLAN040_PACKAGE_11_REJECTED_DISCOVERY_SHA256_PREFIX;
    rejected_hash_is_authoritative: false;
  };
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 1;
    positive_grain_only_proposed: 4;
    structured_unresolved_grain_proposed: 7;
  };
  proposed_extent_distribution: { bounded_segment: 1 };
  proposed_grain_distribution: {
    periods: 1;
    trip_subset: 3;
    all_service: 1;
    unresolved: 7;
  };
  candidates: Plan040Package11CandidateEvidence[];
  exclusions: Plan040Package11Exclusion[];
  positive_pattern_receipt: Plan040Package11PositivePatternReceiptRef;
  immutable_inputs: typeof PLAN040_PACKAGE_11_GLOBAL_PINS;
  review_protocol: {
    review_mode: "dual_independent_residual_service_grain_review";
    independent_review_required: true;
    dual_independent_review_required: true;
    owner_gate_created: false;
    owner_acceptance_created: false;
    persistence_performed: false;
  };
  correction_version_state: {
    corrected_version_sha1:
      "6db867de2ce30f47ae0ee763f422dc34fb7a9f9f";
    exact_bytes_status: "blocked_unavailable";
    comparison_run: false;
    outcomes_reclassified: false;
  };
  authorization_state:
    "evidence_draft_pending_dual_independent_review_no_gate_no_acceptance_no_persistence";
  proposed_extent_decision_count: 1;
  proposed_grain_decision_count: 12;
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

export function plan040Package11ReplayHash(value: JsonValue): string {
  return sha256(`${stableJson(value)}\n`);
}

const expected = new Map(PLAN040_PACKAGE_11_CANDIDATES.map(
  ([route, treatment]) => [treatment, route],
));
const positiveGrainOnly = new Set([
  "treatment_q45-all-day-frequent-service-2025",
  "treatment_q45-direct-connection-2025",
  "treatment_q86-limited-stops-2025",
  "treatment_qm68-route-rename-2025",
]);
const unresolved = new Set([
  "treatment_q63-limited-stops-2025",
  "treatment_q63-northern-boulevard-connection-2025",
  "treatment_q80-frequency-overnight-service-2025",
  "treatment_q80-q10-limited-branch-replacement-2025",
  "treatment_q86-q5-q85-branch-combination-2025",
  "treatment_q87-limited-stops-2025",
  "treatment_q87-q5-green-acres-replacement-2025",
]);

function validateCandidate(
  candidate: Plan040Package11CandidateEvidence,
  positivePatternReceipt: Plan040Package11PositivePatternReceiptRef,
): void {
  const route = expected.get(candidate.treatment_record_id);
  const grain = parseMemberGrainDecision(
    candidate.proposed_grain_decision,
    `${candidate.treatment_record_id}.grain`,
  );
  if (
    !route ||
    route !== candidate.gtfs_route_id ||
    candidate.candidate_key !== [
      candidate.occurrence_id,
      candidate.route_record_id,
      candidate.treatment_record_id,
    ].join("\0") ||
    candidate.exact_candidate_searches.length < 10 ||
    candidate.persisted_extent_decision !== null ||
    candidate.persisted_grain_decision !== null ||
    candidate.authorizes_occurrence ||
    candidate.authorizes_study ||
    candidate.authorizes_cross_product ||
    candidate.authorizes_decision_persistence ||
    !candidate.source_statement.source_quote.trim() ||
    !candidate.immutable_candidate_rows.occurrence_row_sha256 ||
    !candidate.immutable_candidate_rows.treatment_row_sha256 ||
    grain.evidence_bindings.some((binding) =>
      binding.evidence_id.endsWith("#blocks"))
  ) {
    throw new Error(`${candidate.treatment_record_id}: frozen evidence drifted`);
  }
  if (
    grain.occurrence_id !== candidate.occurrence_id ||
    grain.route_record_id !== candidate.route_record_id ||
    grain.gtfs_route_id !== candidate.gtfs_route_id ||
    grain.treatment_record_id !== candidate.treatment_record_id
  ) {
    throw new Error(`${candidate.treatment_record_id}: grain identity drifted`);
  }

  if (candidate.treatment_record_id === "treatment_q82-limited-stops-2025") {
    const extent = candidate.proposed_extent_decision;
    if (!extent) throw new Error("Package 11 Q82 extent proposal is required");
    validateMemberExtentDecision(extent);
    const identifiers = extent.components.flatMap((row) => row.identifiers);
    if (
      candidate.evidence_verdict !== "positive_extent_and_grain_proposed" ||
      extent.resolution !== "bounded_segment" ||
      !sameJson([...identifiers].sort(), [
        "500018", "500022", "500072", "500074", "500080", "501414",
        "501908", "503965", "503984", "505096",
      ]) ||
      grain.member_extent_decision_id !== extent.decision_id ||
      grain.service_scope.kind !== "trip_subset" ||
      !sameJson(grain.service_scope.periods, ["weekend"]) ||
      !sameJson(grain.service_scope.directions, ["0", "1"]) ||
      !sameJson(grain.service_scope.pattern_ids, [
        ...PLAN040_PACKAGE_11_Q82_PATTERN_IDS,
      ]) ||
      grain.lineage_segments.length !== 0 ||
      !sameJson(
        grain.evidence_bindings.filter((binding) =>
          binding.role === "successor_ordered_full_stop_chain")
          .map((binding) => binding.evidence_id).sort(),
        PLAN040_PACKAGE_11_Q82_PATTERN_IDS.map((patternId) =>
          "plan_040_qbnr_service_pattern_package_10b_full_stop_equivalence#" +
          patternId).sort(),
      ) ||
      grain.evidence_bindings.filter((binding) =>
        binding.role === "full_stop_equivalence_receipt" &&
        binding.evidence_id ===
          "plan_040_qbnr_service_pattern_package_10b_full_stop_equivalence#" +
          "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1"
      ).length !== 1 ||
      grain.evidence_bindings.filter((binding) =>
        binding.role === "schedule_timepoint_validation" &&
        binding.evidence_id ===
          "mta_bus_schedules_2025_candidate_windows#" +
          "date=2025-06-29&route=Q82&trip_types=1"
      ).length !== 1 ||
      grain.evidence_bindings.some((binding) =>
        binding.role === "schedule_validation")
    ) {
      throw new Error("Plan 040 Package 11 Q82 proposal drifted");
    }
    return;
  }

  if (candidate.proposed_extent_decision !== null) {
    throw new Error(`${candidate.treatment_record_id}: unexpected extent proposal`);
  }
  if (positiveGrainOnly.has(candidate.treatment_record_id)) {
    const evidence = candidate.accepted_evidence as {
      accepted_gtfs_patterns?: Array<{
        pattern_id?: string;
        snapshot_id?: string;
        service_date?: string;
        route_id?: string;
        direction_id?: string;
        trip_count?: number;
        trip_id_sha256?: string;
        shape_ids?: string[];
        stop_count?: number;
        stop_chain_sha256?: string;
      }>;
      accepted_gtfs_pattern_receipt?: Plan040Package11PositivePatternReceiptRef;
      schedule_and_pattern_context?: {
        passenger_schedule_rows?: Array<{
          direction_id?: string;
          shape_id?: string;
          stop_time_row_count?: number;
          trip_start_count?: number;
        }>;
      };
      schedule_policy?: {
        retained_trip_types?: string[];
        excluded_trip_types?: string[];
        retained_passenger_stop_time_row_count?: number;
        retained_passenger_trip_start_count?: number;
      };
    };
    if (candidate.evidence_verdict !== "positive_grain_only_proposed") {
      throw new Error(`${candidate.treatment_record_id}: verdict drifted`);
    }
    if (
      candidate.gtfs_route_id === "Q45" ||
      candidate.gtfs_route_id === "Q86"
    ) {
      const pins = candidate.gtfs_route_id === "Q45"
        ? [
          PLAN040_PACKAGE_11_POSITIVE_PATTERN_PINS.q45_direction_0,
          PLAN040_PACKAGE_11_POSITIVE_PATTERN_PINS.q45_direction_1,
        ]
        : [
          PLAN040_PACKAGE_11_POSITIVE_PATTERN_PINS.q86_direction_0,
          PLAN040_PACKAGE_11_POSITIVE_PATTERN_PINS.q86_direction_1,
        ];
      const patterns = evidence.accepted_gtfs_patterns ?? [];
      const scheduleRows =
        evidence.schedule_and_pattern_context?.passenger_schedule_rows ?? [];
      const patternBindings = grain.evidence_bindings.filter((binding) =>
        binding.role === "accepted_ordered_full_stop_pattern");
      const receiptBindings = grain.evidence_bindings.filter((binding) =>
        binding.role === "accepted_gtfs_pattern_receipt");
      const scheduleBindings = grain.evidence_bindings.filter((binding) =>
        binding.role === "schedule_validation");
      if (
        !sameJson(evidence.accepted_gtfs_pattern_receipt, positivePatternReceipt) ||
        patterns.length !== 2 ||
        !pins.every((pin) => patterns.some((pattern) =>
          pattern.pattern_id === pin.pattern_id &&
          pattern.snapshot_id === pin.snapshot_id &&
          pattern.service_date === pin.service_date &&
          pattern.route_id === pin.route_id &&
          pattern.direction_id === pin.direction_id &&
          pattern.trip_count === pin.trip_count &&
          pattern.trip_id_sha256 === pin.trip_id_sha256 &&
          sameJson(pattern.shape_ids, pin.shape_ids) &&
          pattern.stop_count === pin.stop_count &&
          pattern.stop_chain_sha256 === pin.stop_chain_sha256
        )) ||
        !sameJson(patternBindings.map((binding) => binding.evidence_id).sort(), pins
          .map((pin) =>
            `${positivePatternReceipt.source_id}#${pin.pattern_id}`)
          .sort()) ||
        receiptBindings.length !== 1 ||
        receiptBindings[0]?.evidence_id !==
          `${positivePatternReceipt.source_id}#candidate=${
            candidate.treatment_record_id
          }` ||
        scheduleBindings.length !== 1 ||
        scheduleBindings[0]?.evidence_id !==
          `mta_bus_schedules_2025_candidate_windows#date=2025-06-29&route=${
            candidate.gtfs_route_id
          }&trip_types=1` ||
        scheduleRows.length !== 2 ||
        !pins.every((pin) => scheduleRows.some((row) =>
          row.direction_id === pin.direction_id &&
          row.shape_id === pin.shape_ids[0] &&
          row.trip_start_count === pin.trip_count &&
          row.stop_time_row_count === (
            pin.pattern_id ===
                PLAN040_PACKAGE_11_POSITIVE_PATTERN_PINS.q45_direction_0
                  .pattern_id
              ? 288
              : pin.pattern_id ===
                  PLAN040_PACKAGE_11_POSITIVE_PATTERN_PINS.q45_direction_1
                    .pattern_id
                ? 300
                : pin.pattern_id ===
                    PLAN040_PACKAGE_11_POSITIVE_PATTERN_PINS.q86_direction_0
                      .pattern_id
                  ? 324
                  : 296
          )
        ))
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: accepted GTFS evidence drifted`,
        );
      }
    }
    if (
      candidate.treatment_record_id ===
        "treatment_q45-all-day-frequent-service-2025" &&
      (
        grain.service_scope.kind !== "periods" ||
        !sameJson(grain.service_scope.periods, ["all_day"]) ||
        !sameJson(grain.service_scope.directions, ["0", "1"]) ||
        !sameJson(grain.service_scope.pattern_ids, [
          ...PLAN040_PACKAGE_11_Q45_PATTERN_IDS,
        ])
      )
    ) {
      throw new Error("Plan 040 Package 11 Q45 all-day scope drifted");
    }
    if (
      candidate.treatment_record_id ===
        "treatment_q45-direct-connection-2025" &&
      (
        grain.service_scope.kind !== "trip_subset" ||
        !sameJson(grain.service_scope.periods, ["weekend"]) ||
        !sameJson(grain.service_scope.pattern_ids, [
          ...PLAN040_PACKAGE_11_Q45_PATTERN_IDS,
        ])
      )
    ) {
      throw new Error("Plan 040 Package 11 Q45 connection scope drifted");
    }
    if (
      candidate.treatment_record_id === "treatment_q86-limited-stops-2025" &&
      (
        grain.service_scope.kind !== "trip_subset" ||
        !sameJson(grain.service_scope.periods, ["weekend"]) ||
        !sameJson(grain.service_scope.pattern_ids, [
          ...PLAN040_PACKAGE_11_Q86_PATTERN_IDS,
        ]) ||
        stableJson(candidate as unknown as JsonValue).includes('"Rush"')
      )
    ) {
      throw new Error("Plan 040 Package 11 Q86 limited scope drifted");
    }
    if (
      candidate.treatment_record_id === "treatment_qm68-route-rename-2025" &&
      (
        grain.service_scope.kind !== "all_service" ||
        grain.lineage_segments.length !== 3 ||
        grain.evidence_bindings.filter(
          (row) => row.role === "lineage_comparison",
        ).length !== 4 ||
        !sameJson(evidence.schedule_policy?.retained_trip_types, ["13"]) ||
        !sameJson(evidence.schedule_policy?.excluded_trip_types, [
          "2", "3", "4",
        ]) ||
        evidence.schedule_policy?.retained_passenger_stop_time_row_count !==
          105 ||
        evidence.schedule_policy?.retained_passenger_trip_start_count !== 21
        ||
        !grain.evidence_bindings.some((binding) =>
          binding.evidence_id ===
            "mta_bus_schedules_2025_candidate_windows#" +
              "date=2025-06-30&route=QM68&trip_types=13")
      )
    ) {
      throw new Error("Plan 040 Package 11 QM68 rename lineage drifted");
    }
    return;
  }

  if (
    !unresolved.has(candidate.treatment_record_id) ||
    candidate.evidence_verdict !== "structured_unresolved_grain_proposed" ||
    grain.service_scope.kind !== "unresolved" ||
    grain.service_scope.missing_roles.length === 0 ||
    candidate.unresolved_gap_codes.length === 0 ||
    grain.lineage_segments.length !== 0
  ) {
    throw new Error(`${candidate.treatment_record_id}: unresolved state drifted`);
  }
  if (candidate.gtfs_route_id === "Q80") {
    const evidence = candidate.accepted_evidence as {
      schedule_and_pattern_context?: {
        schedule_date?: string;
        total_stop_time_row_count?: number;
        trip_type_stop_time_row_counts?: Record<string, number>;
        accepted_post_gtfs_end_date?: string;
        effective_date_full_stop_inventory_present?: boolean;
      };
    };
    if (
      evidence.schedule_and_pattern_context?.schedule_date !== "2025-08-31" ||
      evidence.schedule_and_pattern_context.total_stop_time_row_count !== 844 ||
      !sameJson(
        evidence.schedule_and_pattern_context.trip_type_stop_time_row_counts,
        { "1": 780, "2": 30, "3": 28, "4": 6 },
      ) ||
      evidence.schedule_and_pattern_context.accepted_post_gtfs_end_date !==
        "2025-08-30" ||
      evidence.schedule_and_pattern_context
        .effective_date_full_stop_inventory_present ||
      !sameJson(grain.service_scope.missing_roles, [
        "effective_date_full_stop_inventory",
        "frequency_evidence",
        "later_feed_lineage",
      ])
    ) {
      throw new Error(`${candidate.treatment_record_id}: Q80 evidence drifted`);
    }
  }
  if (
    candidate.treatment_record_id ===
      "treatment_q86-q5-q85-branch-combination-2025"
  ) {
    if (
      !sameJson(grain.service_scope.missing_roles, [
        "branch_lineage_mapping",
        "direction_lineage_mapping",
      ]) ||
      "accepted_gtfs_pattern_receipt" in candidate.accepted_evidence ||
      "accepted_gtfs_patterns" in candidate.accepted_evidence ||
      grain.evidence_bindings.some((binding) =>
        binding.role === "accepted_gtfs_pattern_receipt" ||
        binding.role === "accepted_ordered_full_stop_pattern")
    ) {
      throw new Error(
        "Plan 040 Package 11 unresolved Q86 branch evidence drifted",
      );
    }
  }
}

export function buildPlan040Package11Draft(input: {
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package11CandidateEvidence[];
  exclusions: Plan040Package11Exclusion[];
  positivePatternReceipt: Plan040Package11PositivePatternReceiptRef;
}): Plan040Package11Draft {
  const byTreatment = new Map(input.candidates.map((candidate) => [
    candidate.treatment_record_id,
    candidate,
  ]));
  const candidates = PLAN040_PACKAGE_11_CANDIDATES.map(
    ([, treatment]) => byTreatment.get(treatment)!,
  );
  const keys = candidates.map((candidate) => candidate?.candidate_key);
  if (
    candidates.some((candidate) => !candidate) ||
    byTreatment.size !== 12 ||
    sortedHash(keys) !== PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256 ||
    sortedHash(keys.slice(0, 1)) !==
      PLAN040_PACKAGE_11_Q82_CANDIDATE_KEY_SHA256 ||
    sortedHash(keys.slice(1)) !==
      PLAN040_PACKAGE_11_GRAIN_ONLY_CANDIDATE_KEY_SHA256
  ) {
    throw new Error("Plan 040 Package 11 candidate scope drifted");
  }
  if (
    input.positivePatternReceipt.sha256 !==
      PLAN040_PACKAGE_11_POSITIVE_PATTERN_RECEIPT_SHA256 ||
    input.positivePatternReceipt.receipt_id !==
      "plan-040-qbnr-service-grain-package-11-positive-patterns-v1" ||
    input.positivePatternReceipt.source_id !==
      "plan_040_qbnr_service_grain_package_11_positive_patterns" ||
    input.positivePatternReceipt.snapshot_id !==
      "gtfs-static-20250626-queens-post-qbnr" ||
    input.positivePatternReceipt.service_date !== "2025-06-29" ||
    !input.positivePatternReceipt.replay_derived ||
    !input.positivePatternReceipt.normal_file_verified ||
    input.positivePatternReceipt.authorizes_occurrence ||
    input.positivePatternReceipt.authorizes_study ||
    input.positivePatternReceipt.authorizes_cross_product ||
    input.positivePatternReceipt.authorizes_decision_persistence
  ) {
    throw new Error("Plan 040 Package 11 positive pattern receipt drifted");
  }
  candidates.forEach((candidate) =>
    validateCandidate(candidate, input.positivePatternReceipt));
  const receiptCandidateIds = new Set([
    "treatment_q45-all-day-frequent-service-2025",
    "treatment_q45-direct-connection-2025",
    "treatment_q86-limited-stops-2025",
  ]);
  if (candidates.some((candidate) =>
    candidate.proposed_grain_decision.evidence_bindings.some((binding) =>
      binding.role === "accepted_gtfs_pattern_receipt" &&
      (
        !receiptCandidateIds.has(candidate.treatment_record_id) ||
        binding.evidence_id !==
          `${input.positivePatternReceipt.source_id}#candidate=${
            candidate.treatment_record_id
          }`
      )))) {
    throw new Error("Plan 040 Package 11 receipt candidate anchor drifted");
  }
  if (
    input.exclusions.length !== 5 ||
    input.exclusions.some((row) =>
      !row.unchanged ||
      row.candidate_key_sha256 !== sortedHash(row.candidate_keys) ||
      row.candidate_keys.some((key) => keys.includes(key)))
  ) {
    throw new Error("Plan 040 Package 11 exclusions drifted");
  }
  const exclusionById = new Map(input.exclusions.map((row) => [
    row.scope_id,
    row,
  ]));
  const q89 = exclusionById.get("q89_residual_limited_stop");
  const q48Sibling = exclusionById.get(
    "package_10d_q48_limited_stop_sibling",
  );
  const historicalQ48 = exclusionById.get("historical_old_q48_context");
  if (
    !q89?.candidate_keys.every((key) =>
      key.endsWith("\0treatment_q89-limited-stops-2025")) ||
    q89.candidate_keys.some((key) =>
      key.includes("treatment_q89-q85-green-acres-replacement-2025")) ||
    q89.preservation_evidence.extent_ledger_row_sha256 !==
      "c25ee1679f2b8ef7a126386ec8649c5548ae28b2bc35e375ebbadfc0d2716c8b" ||
    q89.preservation_evidence.grain_ledger_row_sha256 !==
      "cf18c0e125a0b26c78ecd3cb6c16c52a9c62bc78dcab31c88c071aedb0900e5d" ||
    !q48Sibling?.candidate_keys.every((key) =>
      key.endsWith("\0treatment_q48-limited-stops-2025")) ||
    q48Sibling?.preservation_evidence.extent_ledger_row_sha256 !==
      "15bc0ac4d8e324d486bff5a21fcdfc829d086f21991371570657ecce941442b4" ||
    q48Sibling?.preservation_evidence.grain_ledger_row_sha256 !==
      "ccbfb6e8094dda3fcb0f0576b9b249aabc6e9bdacf4fa0c21268f51fbc8df8a0" ||
    q48Sibling?.preservation_evidence.accepted_main_extent_ledger_row_sha256 !==
      "746fb66028ded6478dff38eb634de6378b88631f0c3b7ec9b7ac0255ee481957" ||
    q48Sibling?.preservation_evidence.accepted_main_grain_ledger_row_sha256 !==
      "da8251518fbfedabb8c2cb8bb1c866fc4aa7a7b3627db21b0918e8f22f27937d" ||
    q48Sibling?.preservation_evidence.package_10d_evidence_sha256 !==
      PLAN040_PACKAGE_11_GLOBAL_PINS.package_10d_evidence ||
    q48Sibling?.preservation_evidence.package_10d_gate_sha256 !==
      PLAN040_PACKAGE_11_GLOBAL_PINS.package_10d_gate ||
    q48Sibling?.preservation_evidence.package_10d_acceptance_sha256 !==
      PLAN040_PACKAGE_11_GLOBAL_PINS.package_10d_acceptance ||
    !sameJson(historicalQ48?.candidate_keys, [
      "canonical-treatment\u0000" +
        "treatment_q48-historical-discontinuation-replacement-2025",
    ]) ||
    historicalQ48?.preservation_evidence.treatment_row_sha256 !==
      "5a2e8b5b03f3523698593ac8de1df1f2d8ccc5bab35916c5671ba9053fda2bbb" ||
    historicalQ48?.preservation_evidence.route_row_sha256 !==
      "1d4763a12754ca0242e8ed4bcb08eaf00992f079792e0107435e52115a2a9957" ||
    historicalQ48?.preservation_evidence.occurrence_membership_present !==
      false ||
    historicalQ48?.preservation_evidence.extent_ledger_row_count !== 0 ||
    historicalQ48?.preservation_evidence.grain_ledger_row_count !== 0
  ) {
    throw new Error("Plan 040 Package 11 preservation exclusions drifted");
  }

  return {
    schema_version: 1,
    package_id: PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11,
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 12,
    route_count: 7,
    candidate_scope_discovery: {
      q82_candidate_key_sha256:
        PLAN040_PACKAGE_11_Q82_CANDIDATE_KEY_SHA256,
      grain_only_11_candidate_key_sha256:
        PLAN040_PACKAGE_11_GRAIN_ONLY_CANDIDATE_KEY_SHA256,
      combined_12_candidate_key_sha256:
        PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256,
      rejected_supplied_discovery_sha256_prefix:
        PLAN040_PACKAGE_11_REJECTED_DISCOVERY_SHA256_PREFIX,
      rejected_hash_is_authoritative: false,
    },
    evidence_verdict_distribution: {
      positive_extent_and_grain_proposed: 1,
      positive_grain_only_proposed: 4,
      structured_unresolved_grain_proposed: 7,
    },
    proposed_extent_distribution: { bounded_segment: 1 },
    proposed_grain_distribution: {
      periods: 1,
      trip_subset: 3,
      all_service: 1,
      unresolved: 7,
    },
    candidates,
    exclusions: input.exclusions,
    positive_pattern_receipt: input.positivePatternReceipt,
    immutable_inputs: PLAN040_PACKAGE_11_GLOBAL_PINS,
    review_protocol: {
      review_mode: "dual_independent_residual_service_grain_review",
      independent_review_required: true,
      dual_independent_review_required: true,
      owner_gate_created: false,
      owner_acceptance_created: false,
      persistence_performed: false,
    },
    correction_version_state: {
      corrected_version_sha1:
        "6db867de2ce30f47ae0ee763f422dc34fb7a9f9f",
      exact_bytes_status: "blocked_unavailable",
      comparison_run: false,
      outcomes_reclassified: false,
    },
    authorization_state:
      "evidence_draft_pending_dual_independent_review_no_gate_no_acceptance_no_persistence",
    proposed_extent_decision_count: 1,
    proposed_grain_decision_count: 12,
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    external_acquisition_performed: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}
