import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  parseMemberGrainDecision,
  type MemberGrainDecision,
} from "./member-grain-decisions.js";
import {
  validateMemberExtentDecision,
  type MemberExtentDecision,
} from "./study-readiness-v1.js";

export const PLAN040_QBNR_BUS_STOP_PACKAGE_13 =
  "plan-040-qbnr-bus-stop-package-13-evidence-only-v1" as const;
export const PLAN040_PACKAGE_13_CANDIDATE_COUNT = 31 as const;
export const PLAN040_PACKAGE_13_POSITIVE_EXTENT_AND_GRAIN_COUNT = 19 as const;
export const PLAN040_PACKAGE_13_POSITIVE_EXTENT_ONLY_COUNT = 2 as const;
export const PLAN040_PACKAGE_13_BLOCKED_EXTENT_AND_GRAIN_COUNT = 10 as const;
export const PLAN040_PACKAGE_13_SOURCE_GAP_COUNT = 12 as const;
export const PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT = 0 as const;
export const PLAN040_PACKAGE_13_SIBLING_COUNT = 38 as const;
export const PLAN040_PACKAGE_13_EXCLUSION_COUNT = 5 as const;
export const PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256 =
  "7643e1bcbe254f48096c4d23f236aa812f2398e1db5e600bfba65a94fcad2a02" as const;
export const PLAN040_PACKAGE_13_POSITIVE_EXTENT_AND_GRAIN_KEY_SHA256 =
  "e2bcf19f69fc9bb5eff8fee290baaa5b7c904c93c615aaf02c3bf5243e3b5276" as const;
export const PLAN040_PACKAGE_13_POSITIVE_EXTENT_ONLY_KEY_SHA256 =
  "0f3c7545a2fd5d6e1d49a14b6d90f67c1b9b0de8ec64e925285864b178fc1a42" as const;
export const PLAN040_PACKAGE_13_BLOCKED_EXTENT_AND_GRAIN_KEY_SHA256 =
  "d22346db3f4b03ac8854462f6e4c441beabc462483143762582d3c05fe173127" as const;
export const PLAN040_PACKAGE_13_SOURCE_GAP_KEY_SHA256 =
  "0103e8f755bdd78cae2e0ba4a06c3efe8ba1f8af0657a62b08ed2f89d47219b8" as const;
export const PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256 =
  "17604733a3cb1a40a020df04fe5883c62910ea1695f6ebef8ab59979324264b2" as const;
export const PLAN040_PACKAGE_13_SOURCE_GAP_RECEIPT_SHA256 =
  "2ee6e730caad80e545b149b46165ab5ad6c3569875a81874f3bf1b8bd859d661" as const;

export type Plan040Package13ReceiptRef = {
  path: string;
  sha256: string;
  receipt_id: string;
  source_id: string;
  normal_file_verified: true;
  replay_derived: true;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package13CandidateEvidence = {
  candidate_key: string;
  gtfs_route_id: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  treatment_family: "bus_stop_or_boarding";
  evidence_verdict:
    | "positive_extent_and_grain_proposed"
    | "positive_extent_proposed_grain_blocked"
    | "source_gap_blocked_extent_and_grain";
  source_statement: JsonValue;
  immutable_rows: JsonValue;
  comparison_evidence: JsonValue;
  source_gap_block_receipt: JsonValue | null;
  preserved_scope_gap: string | null;
  proposed_extent_decision: MemberExtentDecision | null;
  proposed_grain_decision: MemberGrainDecision | null;
  persisted_extent_decision: null;
  persisted_grain_decision: null;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package13PreservedSibling = {
  candidate_key: string;
  extent_row: JsonValue;
  extent_row_sha256: string;
  grain_row: JsonValue;
  grain_row_sha256: string;
};

export type Plan040Package13Exclusion = {
  candidate_key: string;
  reason:
    | "remaining_unreviewed_bus_stop_or_boarding_outside_package"
    | "unreviewed_same_occurrence_non_bus_stop_sibling";
  extent_row: JsonValue;
  extent_row_sha256: string;
  grain_row: JsonValue;
  grain_row_sha256: string;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);

function assertCandidatePartition(
  candidates: readonly Plan040Package13CandidateEvidence[],
): void {
  if (candidates.length !== PLAN040_PACKAGE_13_CANDIDATE_COUNT) {
    throw new Error("Package 13 exact 31-candidate scope drifted");
  }
  const positiveExtentAndGrain = candidates.filter((row) =>
    row.evidence_verdict === "positive_extent_and_grain_proposed"
  );
  const positiveExtentOnly = candidates.filter((row) =>
    row.evidence_verdict === "positive_extent_proposed_grain_blocked"
  );
  const blockedExtentAndGrain = candidates.filter((row) =>
    row.evidence_verdict === "source_gap_blocked_extent_and_grain"
  );
  const sourceGaps = [...positiveExtentOnly, ...blockedExtentAndGrain];
  if (
    positiveExtentAndGrain.length !==
      PLAN040_PACKAGE_13_POSITIVE_EXTENT_AND_GRAIN_COUNT ||
    positiveExtentOnly.length !==
      PLAN040_PACKAGE_13_POSITIVE_EXTENT_ONLY_COUNT ||
    blockedExtentAndGrain.length !==
      PLAN040_PACKAGE_13_BLOCKED_EXTENT_AND_GRAIN_COUNT ||
    sourceGaps.length !== PLAN040_PACKAGE_13_SOURCE_GAP_COUNT ||
    sortedHash(candidates.map((row) => row.candidate_key)) !==
      PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256 ||
    sortedHash(positiveExtentAndGrain.map((row) => row.candidate_key)) !==
      PLAN040_PACKAGE_13_POSITIVE_EXTENT_AND_GRAIN_KEY_SHA256 ||
    sortedHash(positiveExtentOnly.map((row) => row.candidate_key)) !==
      PLAN040_PACKAGE_13_POSITIVE_EXTENT_ONLY_KEY_SHA256 ||
    sortedHash(blockedExtentAndGrain.map((row) => row.candidate_key)) !==
      PLAN040_PACKAGE_13_BLOCKED_EXTENT_AND_GRAIN_KEY_SHA256 ||
    sortedHash(sourceGaps.map((row) => row.candidate_key)) !==
      PLAN040_PACKAGE_13_SOURCE_GAP_KEY_SHA256
  ) {
    throw new Error("Package 13 candidate partition hash drifted");
  }
  for (const candidate of candidates) {
    if (
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence
    ) {
      throw new Error(`${candidate.candidate_key}: evidence freeze gained authority`);
    }
    if (candidate.evidence_verdict === "positive_extent_and_grain_proposed") {
      if (
        !candidate.proposed_extent_decision ||
        !candidate.proposed_grain_decision ||
        candidate.source_gap_block_receipt !== null ||
        candidate.proposed_grain_decision.service_scope.kind === "unresolved"
      ) {
        throw new Error(`${candidate.candidate_key}: positive proposal is incomplete`);
      }
      validateMemberExtentDecision(candidate.proposed_extent_decision);
      parseMemberGrainDecision(candidate.proposed_grain_decision);
    } else if (
      candidate.evidence_verdict ===
        "positive_extent_proposed_grain_blocked"
    ) {
      if (
        !candidate.proposed_extent_decision ||
        candidate.proposed_extent_decision.resolution !== "bounded_segment" ||
        !candidate.proposed_grain_decision ||
        candidate.proposed_grain_decision.service_scope.kind !== "unresolved" ||
        candidate.source_gap_block_receipt === null
      ) {
        throw new Error(
          `${candidate.candidate_key}: extent-only blocked-grain proposal is incomplete`,
        );
      }
      validateMemberExtentDecision(candidate.proposed_extent_decision);
      parseMemberGrainDecision(candidate.proposed_grain_decision);
    } else if (
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.source_gap_block_receipt === null
    ) {
      throw new Error(`${candidate.candidate_key}: blocked candidate gained a proposal`);
    }
  }
}

export function buildPlan040Package13Draft(input: {
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package13CandidateEvidence[];
  preservedSiblings: Plan040Package13PreservedSibling[];
  exclusions: Plan040Package13Exclusion[];
  comparisonReceipt: Plan040Package13ReceiptRef;
  sourceGapReceipt: Plan040Package13ReceiptRef;
}): JsonValue {
  assertCandidatePartition(input.candidates);
  if (input.preservedSiblings.length !== PLAN040_PACKAGE_13_SIBLING_COUNT) {
    throw new Error("Package 13 exact 38-sibling preservation set drifted");
  }
  if (input.exclusions.length !== PLAN040_PACKAGE_13_EXCLUSION_COUNT) {
    throw new Error("Package 13 exact five-candidate exclusion set drifted");
  }
  const candidateKeys = new Set(input.candidates.map((row) => row.candidate_key));
  const siblingKeys = new Set(input.preservedSiblings.map((row) => row.candidate_key));
  const exclusionKeys = new Set(input.exclusions.map((row) => row.candidate_key));
  if (
    siblingKeys.size !== input.preservedSiblings.length ||
    exclusionKeys.size !== input.exclusions.length ||
    [...siblingKeys, ...exclusionKeys].some((key) => candidateKeys.has(key)) ||
    [...siblingKeys].some((key) => exclusionKeys.has(key))
  ) {
    throw new Error("Package 13 candidate, sibling, and exclusion scopes overlap");
  }
  return {
    schema_version: 1,
    manifest_id: "plan-040-qbnr-bus-stop-package-13-evidence-draft-v1",
    package_id: PLAN040_QBNR_BUS_STOP_PACKAGE_13,
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    comparison_receipt: input.comparisonReceipt,
    source_gap_block_receipt: input.sourceGapReceipt,
    candidate_count: input.candidates.length,
    positive_extent_and_grain_count:
      PLAN040_PACKAGE_13_POSITIVE_EXTENT_AND_GRAIN_COUNT,
    positive_extent_only_blocked_grain_count:
      PLAN040_PACKAGE_13_POSITIVE_EXTENT_ONLY_COUNT,
    blocked_extent_and_grain_count:
      PLAN040_PACKAGE_13_BLOCKED_EXTENT_AND_GRAIN_COUNT,
    source_gap_block_receipt_count: PLAN040_PACKAGE_13_SOURCE_GAP_COUNT,
    exact_absence_count: PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT,
    candidate_key_sha256: PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256,
    positive_extent_and_grain_key_sha256:
      PLAN040_PACKAGE_13_POSITIVE_EXTENT_AND_GRAIN_KEY_SHA256,
    positive_extent_only_key_sha256:
      PLAN040_PACKAGE_13_POSITIVE_EXTENT_ONLY_KEY_SHA256,
    blocked_extent_and_grain_key_sha256:
      PLAN040_PACKAGE_13_BLOCKED_EXTENT_AND_GRAIN_KEY_SHA256,
    source_gap_key_sha256: PLAN040_PACKAGE_13_SOURCE_GAP_KEY_SHA256,
    preserved_sibling_count: input.preservedSiblings.length,
    preserved_sibling_key_sha256:
      sortedHash(input.preservedSiblings.map((row) => row.candidate_key)),
    exclusion_count: input.exclusions.length,
    exclusion_key_sha256:
      sortedHash(input.exclusions.map((row) => row.candidate_key)),
    proposed_extent_decisions: input.candidates.flatMap((candidate) =>
      candidate.proposed_extent_decision
        ? [candidate.proposed_extent_decision as unknown as JsonValue]
        : []
    ),
    proposed_positive_grain_decisions: input.candidates.flatMap((candidate) =>
      candidate.evidence_verdict === "positive_extent_and_grain_proposed" &&
        candidate.proposed_grain_decision
        ? [candidate.proposed_grain_decision as unknown as JsonValue]
        : []
    ),
    proposed_blocked_grain_decisions: input.candidates.flatMap((candidate) =>
      candidate.evidence_verdict ===
          "positive_extent_proposed_grain_blocked" &&
        candidate.proposed_grain_decision
        ? [candidate.proposed_grain_decision as unknown as JsonValue]
        : []
    ),
    source_gap_blocks: input.candidates.flatMap((candidate) =>
      candidate.source_gap_block_receipt
        ? [candidate.source_gap_block_receipt]
        : []
    ),
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    gate_created: false,
    owner_acceptance_created: false,
    persistence_performed: false,
    authorization_state:
      "evidence_freeze_pending_dual_independent_review_no_gate_no_acceptance_no_persistence",
    external_acquisition_performed: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}

export function validatePlan040Package13Evidence(value: {
  candidates: Plan040Package13CandidateEvidence[];
  preserved_siblings: Plan040Package13PreservedSibling[];
  exclusions: Plan040Package13Exclusion[];
  exact_absence_count: number;
  gate_created: boolean;
  owner_acceptance_created: boolean;
  persistence_performed: boolean;
  authorizes_occurrence: boolean;
  authorizes_study: boolean;
  authorizes_cross_product: boolean;
  authorizes_decision_persistence: boolean;
}): void {
  assertCandidatePartition(value.candidates);
  if (
    value.preserved_siblings.length !== PLAN040_PACKAGE_13_SIBLING_COUNT ||
    value.exclusions.length !== PLAN040_PACKAGE_13_EXCLUSION_COUNT ||
    value.exact_absence_count !== PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT ||
    value.gate_created ||
    value.owner_acceptance_created ||
    value.persistence_performed ||
    value.authorizes_occurrence ||
    value.authorizes_study ||
    value.authorizes_cross_product ||
    value.authorizes_decision_persistence
  ) {
    throw new Error("Package 13 evidence contract drifted");
  }
  const sourceGapBytes = stableJson(value.candidates.flatMap((candidate) =>
    candidate.source_gap_block_receipt
      ? [candidate.source_gap_block_receipt]
      : []
  ) as JsonValue);
  if (
    !sourceGapBytes.includes(
      "absence_projection_prohibited_for_unresolved_grain",
    ) ||
    sourceGapBytes.includes("absent_in_source") ||
    sourceGapBytes.includes("member-extent-absence-receipt-v1")
  ) {
    throw new Error("Package 13 source-gap/block contract drifted");
  }
}
