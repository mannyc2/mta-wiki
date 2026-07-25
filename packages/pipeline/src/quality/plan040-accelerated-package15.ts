import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

export const PLAN040_ACCELERATED_PACKAGE_15 =
  "plan-040-accelerated-package-15-final-residual-evidence-only-v1" as const;
// Re-pinned once to the post-Package-14 checkpoint before the evidence freeze is
// committed.
export const PLAN040_PACKAGE_15_BASE_CHECKPOINT_COMMIT =
  "6872b500ebbab3dc82c3b2477cfec69832c4a145" as const;
export const PLAN040_PACKAGE_15_SOURCE_REPORT_SHA256 =
  "1b304eb9b225c1f8a4710149cb8c870b7d90aa9231fdd97f6381c48b3a68c4ab" as const;
// Filled after the normal-file discovery receipt is seeded from the independently
// reviewed read-only report.
export const PLAN040_PACKAGE_15_DISCOVERY_SHA256 =
  "948807a1a8e92b098c4079d3e66c457416922c22078cbaf6227998d14daa6ebd" as const;
export const PLAN040_PACKAGE_15_CANDIDATE_COUNT = 29 as const;
export const PLAN040_PACKAGE_15_POSITIVE_COUNT = 16 as const;
export const PLAN040_PACKAGE_15_SOURCE_GAP_COUNT = 13 as const;
export const PLAN040_PACKAGE_15_EXACT_ABSENCE_COUNT = 0 as const;
export const PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256 =
  "08e0dd19f26e3bc079a23d97583ed72ed9743b62497073608677ee92e8af1813" as const;
export const PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256 =
  "fc7ac6af723f4e3d473bc5ba88cb7444fd1413c37aacfc90ce1854c465f9084b" as const;
export const PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256 =
  "ef19a20c141141c81c470f8a4a2c244c0ba1b4de25744ef48569ddda372cf9d9" as const;
export const PLAN040_PACKAGE_15_Q89_CANDIDATE_KEY =
  "occurrence:2748598653b74d33fcdce3d1\u0000route_q89-proposed-new\u0000treatment_q89-limited-stops-2025" as const;
export const PLAN040_PACKAGE_15_Q89_DOWNGRADE_POSITIVE_KEY_SHA256 =
  "fc7ac6af723f4e3d473bc5ba88cb7444fd1413c37aacfc90ce1854c465f9084b" as const;
export const PLAN040_PACKAGE_15_Q89_DOWNGRADE_SOURCE_GAP_KEY_SHA256 =
  "ef19a20c141141c81c470f8a4a2c244c0ba1b4de25744ef48569ddda372cf9d9" as const;
export const PLAN040_PACKAGE_15_Q89_AFFIRM_POSITIVE_KEY_SHA256 =
  "483a6b85def38542d7320cf045b7abd9c1eeda06edcaa38ce9746d5f4acf6fbd" as const;
export const PLAN040_PACKAGE_15_Q89_AFFIRM_SOURCE_GAP_KEY_SHA256 =
  "5b7952b99a188ef83b1bc38037785c81a0700b7f1bcadce4e3b5f2d8e921c343" as const;

export const PLAN040_PACKAGE_15_PARTITIONS = {
  programApplicability15: {
    report_name: "program-applicability-15",
    count: 15,
    key_sha256:
      "0c679afda2fba06e65d65482079243331e32e075c821f83cc6d63b6f168d11b1",
    positive_count: 15,
    source_gap_count: 0,
  },
  qbnrExactChain2: {
    report_name: "qbnr-exact-chain-2",
    count: 2,
    key_sha256:
      "d535b2df662cfc60b7b1667d968c75dc672aea1dc858488f66f3bda48a69c530",
    positive_count: 1,
    source_gap_count: 1,
  },
  inventorySourceGap12: {
    report_name: "inventory-source-gap-12",
    count: 12,
    key_sha256:
      "5b7952b99a188ef83b1bc38037785c81a0700b7f1bcadce4e3b5f2d8e921c343",
    positive_count: 0,
    source_gap_count: 12,
  },
} as const;

export type Plan040Package15Partition =
  keyof typeof PLAN040_PACKAGE_15_PARTITIONS;

export type Plan040Package15Candidate = {
  candidate_key: string;
  gtfs_route_id: string;
  partition: Plan040Package15Partition;
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
  occurrence_decision: JsonValue;
  occurrence_decision_id: string;
  occurrence_decision_row_sha256: string;
  physicality_decision: JsonValue | null;
  physicality_decision_row_sha256: string | null;
  exact_route_bindings: JsonValue[];
  exact_treatment_evidence_refs: JsonValue[];
  proposed_positive_decisions: JsonValue | null;
  proposed_source_gap_overlay: JsonValue | null;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

export type Plan040Package15Discovery = {
  schema_version: 1;
  report_id: string;
  source_report: {
    path_not_persisted: string;
    sha256: string;
    report_id: string;
    classification: string;
  };
  base_checkpoint_commit: string;
  exact_scope: {
    candidate_count: number;
    candidate_key_sha256: string;
    candidate_keys: string[];
    positive_candidate_count: number;
    positive_candidate_key_sha256: string;
    terminal_source_gap_count: number;
    terminal_source_gap_key_sha256: string;
    actual_absence_count: number;
    partitions: Record<
      Plan040Package15Partition,
      {
        candidate_count: number;
        candidate_key_sha256: string;
        candidate_keys: string[];
        positive_count: number;
        source_gap_count: number;
      }
    >;
  };
  candidate_details: Plan040Package15Candidate[];
  qbnr_exact_chain_findings: JsonValue;
  inventory_source_gap_findings: JsonValue;
  q89_review_outcome_matrix: JsonValue;
  immutable_inputs: JsonValue;
  semantic_corrections: {
    required_projection: string;
    prohibited_projection: string;
    terminal_receipts_are_not_actual_absences: true;
    q89_schedule_shape_mismatch_requires_explicit_review: true;
  };
  version_separation: JsonValue;
  review_protocol: JsonValue;
  authority: {
    authorizes_occurrence: false;
    authorizes_study: false;
    authorizes_cross_product: false;
    authorizes_decision_persistence: false;
  };
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const plan040Package15SortedHash = (
  values: readonly string[],
): string => sha256(`${[...values].sort().join("\n")}\n`);

export const plan040Package15RowHash = (value: JsonValue): string =>
  sha256(`${stableJson(value)}\n`);

export function writePlan040Package15ImmutableNormalFile(
  path: string,
  value: JsonValue,
  checkOnly: boolean,
): void {
  const bytes = `${stableJson(value)}\n`;
  if (existsSync(path)) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Frozen receipt is not a normal file: ${path}`);
    }
    if (readFileSync(path, "utf8") !== bytes) {
      throw new Error(`Refusing to overwrite frozen receipt ${path}`);
    }
    return;
  }
  if (checkOnly) throw new Error(`Missing frozen receipt ${path}`);
  writeFileSync(path, bytes);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Created receipt is not a normal file: ${path}`);
  }
}

export function validatePlan040Package15Discovery(
  value: Plan040Package15Discovery,
): void {
  if (
    value.authority.authorizes_occurrence ||
    value.authority.authorizes_study ||
    value.authority.authorizes_cross_product ||
    value.authority.authorizes_decision_persistence
  ) {
    throw new Error("Package 15 discovery gained authority");
  }
  if (
    value.source_report.sha256 !== PLAN040_PACKAGE_15_SOURCE_REPORT_SHA256 ||
    value.base_checkpoint_commit !==
      PLAN040_PACKAGE_15_BASE_CHECKPOINT_COMMIT ||
    value.exact_scope.candidate_count !==
      PLAN040_PACKAGE_15_CANDIDATE_COUNT ||
    value.exact_scope.candidate_key_sha256 !==
      PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256 ||
    value.exact_scope.positive_candidate_count !==
      PLAN040_PACKAGE_15_POSITIVE_COUNT ||
    value.exact_scope.positive_candidate_key_sha256 !==
      PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256 ||
    value.exact_scope.terminal_source_gap_count !==
      PLAN040_PACKAGE_15_SOURCE_GAP_COUNT ||
    value.exact_scope.terminal_source_gap_key_sha256 !==
      PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256 ||
    value.exact_scope.actual_absence_count !==
      PLAN040_PACKAGE_15_EXACT_ABSENCE_COUNT ||
    plan040Package15SortedHash(value.exact_scope.candidate_keys) !==
      PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256
  ) {
    throw new Error("Package 15 exact scope drifted");
  }

  for (const [name, expected] of Object.entries(
    PLAN040_PACKAGE_15_PARTITIONS,
  )) {
    const partition = name as Plan040Package15Partition;
    const actual = value.exact_scope.partitions[partition];
    if (
      actual.candidate_count !== expected.count ||
      actual.candidate_key_sha256 !== expected.key_sha256 ||
      actual.positive_count !== expected.positive_count ||
      actual.source_gap_count !== expected.source_gap_count ||
      plan040Package15SortedHash(actual.candidate_keys) !== expected.key_sha256
    ) {
      throw new Error(`Package 15 ${partition} scope drifted`);
    }
  }

  const positives = value.candidate_details.filter(
    (row) => row.proposed_verdict === "positive_extent_and_grain",
  );
  const sourceGaps = value.candidate_details.filter(
    (row) => row.proposed_verdict === "source_gap_blocked_extent_and_grain",
  );
  if (
    value.candidate_details.length !== PLAN040_PACKAGE_15_CANDIDATE_COUNT ||
    plan040Package15SortedHash(
        value.candidate_details.map((row) => row.candidate_key),
      ) !== PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256 ||
    positives.length !== PLAN040_PACKAGE_15_POSITIVE_COUNT ||
    plan040Package15SortedHash(
        positives.map((row) => row.candidate_key),
      ) !== PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256 ||
    sourceGaps.length !== PLAN040_PACKAGE_15_SOURCE_GAP_COUNT ||
    plan040Package15SortedHash(
        sourceGaps.map((row) => row.candidate_key),
      ) !== PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256
  ) {
    throw new Error("Package 15 verdict partition drifted");
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
      plan040Package15RowHash(candidate.canonical_route) !==
        candidate.canonical_route_row_sha256 ||
      plan040Package15RowHash(candidate.canonical_treatment) !==
        candidate.canonical_treatment_row_sha256 ||
      plan040Package15RowHash(candidate.current_extent_row) !==
        candidate.current_extent_row_sha256 ||
      plan040Package15RowHash(candidate.current_grain_row) !==
        candidate.current_grain_row_sha256 ||
      plan040Package15RowHash(candidate.occurrence_decision) !==
        candidate.occurrence_decision_row_sha256 ||
      (candidate.physicality_decision !== null &&
        plan040Package15RowHash(candidate.physicality_decision) !==
          candidate.physicality_decision_row_sha256)
    ) {
      throw new Error(`${candidate.candidate_key}: immutable row pin drifted`);
    }
    if (candidate.proposed_verdict === "positive_extent_and_grain") {
      if (
        candidate.proposed_positive_decisions === null ||
        candidate.proposed_source_gap_overlay !== null
      ) {
        throw new Error(`${candidate.candidate_key}: positive proposal incomplete`);
      }
    } else if (
      candidate.proposed_positive_decisions !== null ||
      candidate.proposed_source_gap_overlay === null ||
      stableJson(candidate.proposed_source_gap_overlay).includes(
        "absent_in_source",
      )
    ) {
      throw new Error(`${candidate.candidate_key}: source-gap proposal drifted`);
    }
  }

  if (
    value.semantic_corrections.required_projection !==
      "member-source-gap-overlay-v1 with blocked_upstream verdict on both surfaces" ||
    !value.semantic_corrections.prohibited_projection.includes(
      "absent_in_source",
    ) ||
    !value.semantic_corrections.terminal_receipts_are_not_actual_absences ||
    !value.semantic_corrections.q89_schedule_shape_mismatch_requires_explicit_review
  ) {
    throw new Error("Package 15 fail-closed semantics drifted");
  }
  const q89Outcomes = value.q89_review_outcome_matrix as {
    selected_outcome: string;
    candidate_specific_schedule_gtfs_passenger_join_proven: boolean;
    unchanged_scope: { candidate_count: number; candidate_key_sha256: string };
    affirm_positive: {
      positive_count: number;
      source_gap_count: number;
      exact_absence_count: number;
      positive_key_sha256: string;
      source_gap_key_sha256: string;
    };
    downgrade_only_q89: {
      changed_candidate_key: string;
      positive_count: number;
      source_gap_count: number;
      exact_absence_count: number;
      positive_key_sha256: string;
      source_gap_key_sha256: string;
      proposed_source_gap_overlay: JsonValue;
    };
  };
  if (
    q89Outcomes.unchanged_scope.candidate_count !==
      PLAN040_PACKAGE_15_CANDIDATE_COUNT ||
    q89Outcomes.unchanged_scope.candidate_key_sha256 !==
      PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256 ||
    q89Outcomes.selected_outcome !==
      "downgrade_only_q89_to_blocked_upstream" ||
    q89Outcomes.candidate_specific_schedule_gtfs_passenger_join_proven ||
    q89Outcomes.affirm_positive.positive_count !== 17 ||
    q89Outcomes.affirm_positive.source_gap_count !== 12 ||
    q89Outcomes.affirm_positive.exact_absence_count !== 0 ||
    q89Outcomes.affirm_positive.positive_key_sha256 !==
      PLAN040_PACKAGE_15_Q89_AFFIRM_POSITIVE_KEY_SHA256 ||
    q89Outcomes.affirm_positive.source_gap_key_sha256 !==
      PLAN040_PACKAGE_15_Q89_AFFIRM_SOURCE_GAP_KEY_SHA256 ||
    q89Outcomes.downgrade_only_q89.changed_candidate_key !==
      PLAN040_PACKAGE_15_Q89_CANDIDATE_KEY ||
    q89Outcomes.downgrade_only_q89.positive_count !== 16 ||
    q89Outcomes.downgrade_only_q89.source_gap_count !== 13 ||
    q89Outcomes.downgrade_only_q89.exact_absence_count !== 0 ||
    q89Outcomes.downgrade_only_q89.positive_key_sha256 !==
      PLAN040_PACKAGE_15_Q89_DOWNGRADE_POSITIVE_KEY_SHA256 ||
    q89Outcomes.downgrade_only_q89.source_gap_key_sha256 !==
      PLAN040_PACKAGE_15_Q89_DOWNGRADE_SOURCE_GAP_KEY_SHA256 ||
    stableJson(
      q89Outcomes.downgrade_only_q89.proposed_source_gap_overlay,
    ).includes("absent_in_source")
  ) {
    throw new Error("Package 15 Q89 review outcome matrix drifted");
  }
}

export function buildPlan040Package15Evidence(
  discovery: Plan040Package15Discovery,
  receiptRefs: Record<string, { path: string; sha256: string }>,
): JsonValue {
  validatePlan040Package15Discovery(discovery);
  return {
    schema_version: 1,
    manifest_id: "plan-040-accelerated-package-15-evidence-v1",
    package_id: PLAN040_ACCELERATED_PACKAGE_15,
    frozen_discovery_receipt: receiptRefs.discovery,
    partition_receipts: {
      program_applicability_15: receiptRefs.program,
      qbnr_exact_chain_2: receiptRefs.exactChains,
      inventory_source_gap_12: receiptRefs.inventoryGaps,
    },
    complete_ordered_full_stop_chains: receiptRefs.fullStopChains,
    source_gap_receipt: receiptRefs.sourceGaps,
    current_freeze_state: receiptRefs.currentFreeze,
    candidate_count: PLAN040_PACKAGE_15_CANDIDATE_COUNT,
    candidate_key_sha256: PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256,
    positive_extent_and_grain_count: PLAN040_PACKAGE_15_POSITIVE_COUNT,
    positive_extent_and_grain_key_sha256:
      PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256,
    blocked_extent_and_grain_count: PLAN040_PACKAGE_15_SOURCE_GAP_COUNT,
    blocked_extent_and_grain_key_sha256:
      PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256,
    exact_absence_count: PLAN040_PACKAGE_15_EXACT_ABSENCE_COUNT,
    partitions: discovery.exact_scope.partitions,
    qbnr_exact_chain_findings: discovery.qbnr_exact_chain_findings,
    inventory_source_gap_findings: discovery.inventory_source_gap_findings,
    q89_review_outcome_matrix: discovery.q89_review_outcome_matrix,
    version_separation: discovery.version_separation,
    review_protocol: discovery.review_protocol,
    observed_commit: PLAN040_PACKAGE_15_BASE_CHECKPOINT_COMMIT,
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
