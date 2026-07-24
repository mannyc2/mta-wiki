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
    | "package_10b_accepted_sibling_decisions";
  candidate_keys: string[];
  candidate_key_sha256: string;
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

function validateCandidate(candidate: Plan040Package11CandidateEvidence): void {
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
    !candidate.immutable_candidate_rows.treatment_row_sha256
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
      grain.lineage_segments.length !== 0
    ) {
      throw new Error("Plan 040 Package 11 Q82 proposal drifted");
    }
    return;
  }

  if (candidate.proposed_extent_decision !== null) {
    throw new Error(`${candidate.treatment_record_id}: unexpected extent proposal`);
  }
  if (positiveGrainOnly.has(candidate.treatment_record_id)) {
    if (candidate.evidence_verdict !== "positive_grain_only_proposed") {
      throw new Error(`${candidate.treatment_record_id}: verdict drifted`);
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
        ).length !== 4
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
}

export function buildPlan040Package11Draft(input: {
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package11CandidateEvidence[];
  exclusions: Plan040Package11Exclusion[];
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
  candidates.forEach(validateCandidate);
  if (
    input.exclusions.length !== 3 ||
    input.exclusions.some((row) =>
      !row.unchanged ||
      row.candidate_key_sha256 !== sortedHash(row.candidate_keys) ||
      row.candidate_keys.some((key) => keys.includes(key)))
  ) {
    throw new Error("Plan 040 Package 11 exclusions drifted");
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
