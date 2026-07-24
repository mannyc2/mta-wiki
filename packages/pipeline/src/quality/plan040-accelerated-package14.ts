import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

export const PLAN040_ACCELERATED_PACKAGE_14 =
  "plan-040-accelerated-package-14-evidence-only-v1" as const;
export const PLAN040_PACKAGE_14_BASE_CHECKPOINT_COMMIT =
  "7519ccab0813ba94078a52c11eb087f157831b4d" as const;
export const PLAN040_PACKAGE_14_DISCOVERY_SHA256 =
  "b1f090843ea26b76c305fc62a1fcae3085451f5872077822d36c2b141634f30c" as const;
export const PLAN040_PACKAGE_14_CANDIDATE_COUNT = 36 as const;
export const PLAN040_PACKAGE_14_POSITIVE_COUNT = 8 as const;
export const PLAN040_PACKAGE_14_SOURCE_GAP_COUNT = 28 as const;
export const PLAN040_PACKAGE_14_EXACT_ABSENCE_COUNT = 0 as const;
export const PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256 =
  "322bee12c4d945bf6dc16b7b7951ab04c161255244fff97cdc8b1aea6a1702d4" as const;
export const PLAN040_PACKAGE_14_POSITIVE_KEY_SHA256 =
  "a8e976e1540bab1642c0dabb9e6f534c1822d664f8d377ad6a07d3af80d8a67f" as const;
export const PLAN040_PACKAGE_14_SOURCE_GAP_KEY_SHA256 =
  "758ceba44e68646aef4c63a2e8f4a67a9eb7f0a286ce9b3525ce1f91fb1a6e98" as const;
export const PLAN040_PACKAGE_14_PACKAGE_13_EXCLUSION_COUNT = 31 as const;
export const PLAN040_PACKAGE_14_PACKAGE_13_EXCLUSION_SHA256 =
  "7643e1bcbe254f48096c4d23f236aa812f2398e1db5e600bfba65a94fcad2a02" as const;
export const PLAN040_PACKAGE_14_RESIDUAL_EXCLUSION_COUNT = 29 as const;
export const PLAN040_PACKAGE_14_RESIDUAL_EXCLUSION_SHA256 =
  "08e0dd19f26e3bc079a23d97583ed72ed9743b62497073608677ee92e8af1813" as const;
export const PLAN040_PACKAGE_14_SIBLING_COUNT = 3 as const;
export const PLAN040_PACKAGE_14_SIBLING_SHA256 =
  "a625ae43d2ac8dfc3565822f142269ef9abdd5fe7d1a336aaada936f56591d03" as const;

export const PLAN040_PACKAGE_14_PARTITIONS = {
  qbnr6: {
    count: 6,
    key_sha256:
      "4c3c39e67336a70e951856b17f8d9e3ebd7d95a139291fd053c9426af04dae00",
    positive_count: 1,
    source_gap_count: 5,
  },
  express20: {
    count: 20,
    key_sha256:
      "ebf2e43217e9cd002a022e5b11d0aed50d98a76a48b9dd67b724de17d9721cf8",
    positive_count: 0,
    source_gap_count: 20,
  },
  ace7: {
    count: 7,
    key_sha256:
      "0ec55227b14197f7fc74c867dd5e55a13080fd98cd81432a16e6ede5e070252c",
    positive_count: 6,
    source_gap_count: 1,
  },
  legacySbs3: {
    count: 3,
    key_sha256:
      "1c74d3af3634e43820a51faac76b281dccf03b1d98da56f17eb144b1d3fa0194",
    positive_count: 1,
    source_gap_count: 2,
  },
} as const;

export type Plan040Package14Partition = keyof typeof PLAN040_PACKAGE_14_PARTITIONS;

export type Plan040Package14Candidate = {
  candidate_key: string;
  partition: Plan040Package14Partition;
  proposed_verdict:
    | "positive_extent_and_grain"
    | "source_gap_blocked_extent_and_grain";
  canonical_route: JsonValue;
  canonical_route_row_sha256: string;
  canonical_treatment: JsonValue;
  canonical_treatment_row_sha256: string;
  current_extent_row: JsonValue;
  current_extent_row_sha256: string;
  current_grain_row: JsonValue;
  current_grain_row_sha256: string;
  exact_route_bindings: JsonValue[];
  exact_treatment_evidence_refs: JsonValue[];
  occurrence_decision_id: string;
  occurrence_decision_row_sha256: string;
  proposed_positive_decisions: JsonValue | null;
  proposed_source_gap_overlay: JsonValue | null;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

export type Plan040Package14Discovery = {
  schema_version: number;
  report_id: string;
  base_checkpoint_commit: string;
  observed_commit: string;
  exact_scope: {
    candidate_count: number;
    candidate_key_sha256: string;
    candidate_keys: string[];
    positive_candidate_count: number;
    positive_candidate_key_sha256: string;
    terminal_source_gap_count: number;
    terminal_source_gap_key_sha256: string;
    actual_absence_count: number;
    extent_only_positive_count: number;
    partitions: Record<
      Plan040Package14Partition,
      {
        candidate_count: number;
        candidate_key_sha256: string;
        candidate_keys: string[];
        positive_count: number;
        source_gap_count: number;
      }
    >;
  };
  preservation: {
    excluded_scope_overlap_count: number;
    package_13_candidate_keys: string[];
    package_13_exclusion_count: number;
    package_13_exclusion_key_sha256: string;
    residual_candidate_keys: string[];
    residual_exclusion_count: number;
    residual_exclusion_key_sha256: string;
    same_occurrence_sibling_count: number;
    same_occurrence_sibling_key_sha256: string;
    same_occurrence_siblings: Array<{
      candidate_key: string;
      extent_row: JsonValue;
      extent_row_sha256: string;
      grain_row: JsonValue;
      grain_row_sha256: string;
    }>;
  };
  candidate_details: Plan040Package14Candidate[];
  q110_positive_rederivation: JsonValue;
  immutable_inputs: JsonValue;
  authority: {
    authorizes_occurrence: false;
    authorizes_study: false;
    authorizes_cross_product: false;
    authorizes_decision_persistence: false;
  };
  semantic_corrections: {
    required_projection: string;
    prohibited_projection: string;
    terminal_receipts_are_not_actual_absences: true;
  };
  version_separation: JsonValue;
  review_protocol: JsonValue;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
export const plan040Package14SortedHash = (
  values: readonly string[],
): string => sha256(`${[...values].sort().join("\n")}\n`);
export const plan040Package14RowHash = (value: JsonValue): string =>
  sha256(`${stableJson(value)}\n`);

const assertNoAuthority = (value: Plan040Package14Discovery): void => {
  if (
    value.authority.authorizes_occurrence ||
    value.authority.authorizes_study ||
    value.authority.authorizes_cross_product ||
    value.authority.authorizes_decision_persistence
  ) {
    throw new Error("Package 14 discovery gained authority");
  }
};

export function validatePlan040Package14Discovery(
  value: Plan040Package14Discovery,
): void {
  assertNoAuthority(value);
  const scope = value.exact_scope;
  const preservation = value.preservation;
  if (
    scope.candidate_count !== PLAN040_PACKAGE_14_CANDIDATE_COUNT ||
    scope.positive_candidate_count !== PLAN040_PACKAGE_14_POSITIVE_COUNT ||
    scope.terminal_source_gap_count !== PLAN040_PACKAGE_14_SOURCE_GAP_COUNT ||
    scope.actual_absence_count !== PLAN040_PACKAGE_14_EXACT_ABSENCE_COUNT ||
    scope.extent_only_positive_count !== 0 ||
    scope.candidate_key_sha256 !== PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256 ||
    scope.positive_candidate_key_sha256 !==
      PLAN040_PACKAGE_14_POSITIVE_KEY_SHA256 ||
    scope.terminal_source_gap_key_sha256 !==
      PLAN040_PACKAGE_14_SOURCE_GAP_KEY_SHA256 ||
    plan040Package14SortedHash(scope.candidate_keys) !==
      PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256
  ) {
    throw new Error("Package 14 exact scope drifted");
  }
  if (
    preservation.package_13_exclusion_count !==
      PLAN040_PACKAGE_14_PACKAGE_13_EXCLUSION_COUNT ||
    preservation.package_13_exclusion_key_sha256 !==
      PLAN040_PACKAGE_14_PACKAGE_13_EXCLUSION_SHA256 ||
    preservation.residual_exclusion_count !==
      PLAN040_PACKAGE_14_RESIDUAL_EXCLUSION_COUNT ||
    preservation.residual_exclusion_key_sha256 !==
      PLAN040_PACKAGE_14_RESIDUAL_EXCLUSION_SHA256 ||
    preservation.same_occurrence_sibling_count !==
      PLAN040_PACKAGE_14_SIBLING_COUNT ||
    preservation.same_occurrence_sibling_key_sha256 !==
      PLAN040_PACKAGE_14_SIBLING_SHA256 ||
    preservation.excluded_scope_overlap_count !== 0
  ) {
    throw new Error("Package 14 preservation scope drifted");
  }
  const candidateKeys = new Set(scope.candidate_keys);
  const excludedKeys = [
    ...preservation.package_13_candidate_keys,
    ...preservation.residual_candidate_keys,
    ...preservation.same_occurrence_siblings.map((row) => row.candidate_key),
  ];
  if (
    candidateKeys.size !== PLAN040_PACKAGE_14_CANDIDATE_COUNT ||
    excludedKeys.some((key) => candidateKeys.has(key))
  ) {
    throw new Error("Package 14 candidate/exclusion overlap detected");
  }

  for (const [partitionName, expected] of Object.entries(
    PLAN040_PACKAGE_14_PARTITIONS,
  )) {
    const name = partitionName as Plan040Package14Partition;
    const actual = scope.partitions[name];
    if (
      actual.candidate_count !== expected.count ||
      actual.candidate_key_sha256 !== expected.key_sha256 ||
      actual.positive_count !== expected.positive_count ||
      actual.source_gap_count !== expected.source_gap_count ||
      plan040Package14SortedHash(actual.candidate_keys) !== expected.key_sha256
    ) {
      throw new Error(`Package 14 ${name} partition drifted`);
    }
  }

  const positives = value.candidate_details.filter(
    (row) => row.proposed_verdict === "positive_extent_and_grain",
  );
  const gaps = value.candidate_details.filter(
    (row) => row.proposed_verdict === "source_gap_blocked_extent_and_grain",
  );
  if (
    value.candidate_details.length !== PLAN040_PACKAGE_14_CANDIDATE_COUNT ||
    plan040Package14SortedHash(
      value.candidate_details.map((row) => row.candidate_key),
    ) !== PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256 ||
    positives.length !== PLAN040_PACKAGE_14_POSITIVE_COUNT ||
    gaps.length !== PLAN040_PACKAGE_14_SOURCE_GAP_COUNT ||
    plan040Package14SortedHash(positives.map((row) => row.candidate_key)) !==
      PLAN040_PACKAGE_14_POSITIVE_KEY_SHA256 ||
    plan040Package14SortedHash(gaps.map((row) => row.candidate_key)) !==
      PLAN040_PACKAGE_14_SOURCE_GAP_KEY_SHA256
  ) {
    throw new Error("Package 14 candidate verdict partition drifted");
  }
  for (const candidate of value.candidate_details) {
    if (
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product
    ) {
      throw new Error(`${candidate.candidate_key}: candidate gained authority`);
    }
    if (
      plan040Package14RowHash(candidate.canonical_route) !==
        candidate.canonical_route_row_sha256 ||
      plan040Package14RowHash(candidate.canonical_treatment) !==
        candidate.canonical_treatment_row_sha256 ||
      plan040Package14RowHash(candidate.current_extent_row) !==
        candidate.current_extent_row_sha256 ||
      plan040Package14RowHash(candidate.current_grain_row) !==
        candidate.current_grain_row_sha256
    ) {
      throw new Error(`${candidate.candidate_key}: frozen row hash drifted`);
    }
    if (candidate.proposed_verdict === "positive_extent_and_grain") {
      if (
        candidate.proposed_positive_decisions === null ||
        candidate.proposed_source_gap_overlay !== null
      ) {
        throw new Error(`${candidate.candidate_key}: positive evidence incomplete`);
      }
    } else if (
      candidate.proposed_positive_decisions !== null ||
      candidate.proposed_source_gap_overlay === null ||
      stableJson(candidate.proposed_source_gap_overlay).includes(
        "absent_in_source",
      )
    ) {
      throw new Error(`${candidate.candidate_key}: source-gap evidence drifted`);
    }
  }
  if (
    value.semantic_corrections.required_projection !==
      "member-source-gap-overlay-v1 with blocked_upstream verdict on both surfaces" ||
    !value.semantic_corrections.prohibited_projection.includes(
      "absent_in_source",
    ) ||
    !value.semantic_corrections.terminal_receipts_are_not_actual_absences
  ) {
    throw new Error("Package 14 nonabsence source-gap semantics drifted");
  }
}

export function buildPlan040Package14Evidence(
  discovery: Plan040Package14Discovery,
  receiptRefs: Record<string, { path: string; sha256: string }>,
): JsonValue {
  validatePlan040Package14Discovery(discovery);
  return {
    schema_version: 1,
    manifest_id: "plan-040-accelerated-package-14-evidence-v1",
    package_id: PLAN040_ACCELERATED_PACKAGE_14,
    frozen_discovery_receipt: receiptRefs.discovery,
    partition_receipts: {
      qbnr6: receiptRefs.qbnr6,
      express20: receiptRefs.express20,
      ace7: receiptRefs.ace7,
      legacy_sbs3: receiptRefs.legacySbs3,
    },
    q110_complete_ordered_full_stop_chains: receiptRefs.q110Chains,
    source_gap_receipt: receiptRefs.sourceGaps,
    current_freeze_state: receiptRefs.currentFreeze,
    candidate_count: PLAN040_PACKAGE_14_CANDIDATE_COUNT,
    candidate_key_sha256: PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256,
    positive_extent_and_grain_count: PLAN040_PACKAGE_14_POSITIVE_COUNT,
    positive_extent_and_grain_key_sha256:
      PLAN040_PACKAGE_14_POSITIVE_KEY_SHA256,
    blocked_extent_and_grain_count: PLAN040_PACKAGE_14_SOURCE_GAP_COUNT,
    blocked_extent_and_grain_key_sha256:
      PLAN040_PACKAGE_14_SOURCE_GAP_KEY_SHA256,
    exact_absence_count: PLAN040_PACKAGE_14_EXACT_ABSENCE_COUNT,
    partitions: discovery.exact_scope.partitions,
    preservation: discovery.preservation,
    historical_discovery_snapshot: {
      observed_commit: discovery.observed_commit,
      base_checkpoint_commit: discovery.base_checkpoint_commit,
      immutable_inputs: discovery.immutable_inputs,
      classification:
        "historical_discovery_snapshot_only_superseded_by_current_freeze_state",
      current_authority: false,
    },
    observed_commit: PLAN040_PACKAGE_14_BASE_CHECKPOINT_COMMIT,
    candidate_state_pins: discovery.candidate_details.map((row) => ({
      candidate_key: row.candidate_key,
      partition: row.partition,
      proposed_verdict: row.proposed_verdict,
      canonical_route_row_sha256: row.canonical_route_row_sha256,
      canonical_treatment_row_sha256: row.canonical_treatment_row_sha256,
      current_extent_row_sha256: row.current_extent_row_sha256,
      current_grain_row_sha256: row.current_grain_row_sha256,
      occurrence_decision_id: row.occurrence_decision_id,
      occurrence_decision_row_sha256: row.occurrence_decision_row_sha256,
    })),
    version_separation: discovery.version_separation,
    review_protocol: discovery.review_protocol,
    gate_created: false,
    owner_acceptance_created: false,
    persistence_performed: false,
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    authorization_state:
      "evidence_frozen_pending_dual_independent_review_no_gate_no_acceptance_no_persistence",
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}
