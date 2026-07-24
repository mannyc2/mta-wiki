import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  memberGrainDecisionKey,
  parseMemberGrainDecision,
  type MemberGrainDecision,
} from "./member-grain-decisions.js";
import type { MemberSourceGapOverlay } from "./member-extent-ledger.js";
import { fileSha256 } from "../reference/snapshot-registry.js";
import {
  extentDecisionKey,
  validateMemberExtentDecision,
  type MemberExtentDecision,
} from "./study-readiness-v1.js";
import {
  PLAN040_PACKAGE_13_BLOCKED_EXTENT_AND_GRAIN_COUNT,
  PLAN040_PACKAGE_13_CANDIDATE_COUNT,
  PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256,
  PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT,
  PLAN040_PACKAGE_13_POSITIVE_EXTENT_AND_GRAIN_COUNT,
  PLAN040_PACKAGE_13_POSITIVE_EXTENT_ONLY_COUNT,
  PLAN040_PACKAGE_13_SOURCE_GAP_COUNT,
  PLAN040_PACKAGE_13_SOURCE_GAP_KEY_SHA256,
  PLAN040_PACKAGE_13_SOURCE_GAP_RECEIPT_SHA256,
  PLAN040_QBNR_BUS_STOP_PACKAGE_13,
  validatePlan040Package13Evidence,
  type Plan040Package13CandidateEvidence,
  type Plan040Package13Exclusion,
  type Plan040Package13PreservedSibling,
  type Plan040Package13ReceiptRef,
} from "./plan040-qbnr-bus-stop-package13.js";

export const PLAN040_PACKAGE_13_APPROVED_COMMIT =
  "3603ce6913f4c222e8fee7cb6b6af894d213d7f9" as const;
export const PLAN040_PACKAGE_13_EVIDENCE_SHA256 =
  "580314cc4e042d36f7bb41650edcf55e0f8ebaf7da1693a76af7d2146f79030c" as const;
export const PLAN040_PACKAGE_13_DRAFT_SHA256 =
  "2b1372551959f39e2a14481b9c57fdc64a0be07bdc001878fc01f0021954771a" as const;
export const PLAN040_PACKAGE_13_GATE_SHA256 =
  "323bba3399a2a7064e94e7c0ddf2bb31bb0da00ceb13e976032bf66f01493be8" as const;
export const PLAN040_PACKAGE_13_ACCEPTANCE_SHA256 =
  "5c34ecc6539c66f711dae2f6337969b3b6c0ae8a9a16786bf861eb759726093b" as const;
export const PLAN040_PACKAGE_13_EXTENT_DECISIONS_SHA256 =
  "35f9dc504c96caa2095e0b2905c7d1d512f01485634b810f4d65fbfa9e2e1645";
export const PLAN040_PACKAGE_13_GRAIN_DECISIONS_SHA256 =
  "3340a13eca188babb2f43344f8a7ecdf008f893cf3dd5cc3814c71cbab62c940";
export const PLAN040_PACKAGE_13_SOURCE_GAP_OVERLAY_SHA256 =
  "f5f6ded5b9e000e05a35b2956dad64ed6a37044ab836aa958a4b01803f512581";
export const PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS = {
  extent_ledger:
    "06323143214794dc50628239cd67c0b641704ad9c2b9b25883f26b60c06f3daf",
  grain_ledger:
    "eaa4803cc4e8ef9c07beef4014eb2f82c5b9aafd8e9d899514320f6c7f7120f7",
  bridge_ledger:
    "c053736116774006a40a15e218a97e60e575785a6fbf6c6fccce5c8abd904cfd",
  bridge_summary:
    "701f5238c36d9f66b531c0860da04a4cceff4053a87885f63e1865613eadd139",
  consumer_priority_manifest:
    "d1427e1d300905a5d96432fa2e0f3b468be458f447c01c406b4f6f7a03ae5d30",
  study_manifest:
    "ea552dd8ed6eb3622b41547be4960eb125591b12efe5d590a42a5ca5ebafc874",
  member_extent_contract:
    "11b15f1419b36c5b125e9a57545ae5e97bac9c0877b0585df5c2d28472fc4e21",
  member_extent_manifest:
    "44a66c5f1652f2a2e35ee5b383d6b5cc806964bee4fc768b9a56cabba239ed42",
  member_extent_review_ledger:
    "c390b19ca4a0c5e7bdfba1541230c59ec2899c9f6669237604e46381da23eb15",
  member_extent_summary:
    "e5ecc67539eeabcf1359628d4587cf5b57978f4313fc8ce6ed97bcd5f8190c88",
  operational_occurrences:
    "6cb8654efee370d7444405ce3a0cdb8ce6fa394e6ada2347982cbec49df701ef",
  operational_occurrence_decisions:
    "80e530c9953e59a767afcb2f0d61202d9a9209469075f41f993fe7469ee45883",
  treatment_components:
    "a9b76c3b7121fc87d0f190a44fb00f182229d8d309968d3ba00a8c27a1492bae",
  reviewed_candidate_packets:
    "0ac700c48740fff5eb36b626b8dee72f95212378c0b40bc3dc6265b32c3d5844",
} as const;

const EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-bus-stop-package-13-evidence-v1.json";
const DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-bus-stop-package-13-evidence-draft-v1.json";
const COMPARISON_RECEIPT_PATH =
  "data/quality/acquisition/receipts/member-extent-evidence/" +
  "plan-040-qbnr-bus-stop-package-13-full-stop-comparisons-v1.json";
const SOURCE_GAP_RECEIPT_PATH =
  "data/quality/acquisition/receipts/member-extent-evidence/" +
  "plan-040-qbnr-bus-stop-package-13-source-gap-blocks-v1.json";
const GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-bus-stop-package-13-dual-review-gate-v1.json";
const ACCEPTANCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-bus-stop-package-13-owner-acceptance-v1.json";
const EXTENT_DECISIONS_PATH =
  "data/quality/operational-reference/member-extent-ledger-decisions/" +
  "plan-040-qbnr-bus-stop-package-13-v1.json";
const GRAIN_DECISIONS_PATH =
  "data/quality/operational-reference/member-grain-decisions/" +
  "plan-040-qbnr-bus-stop-package-13-v1.json";
const SOURCE_GAP_OVERLAY_PATH =
  "data/quality/operational-reference/member-source-gap-overlays/" +
  "plan-040-qbnr-bus-stop-package-13-v1.json";

export const PLAN040_QBNR_BUS_STOP_PACKAGE_13_EVIDENCE_PATH =
  join(repoRoot, EVIDENCE_PATH);
export const PLAN040_QBNR_BUS_STOP_PACKAGE_13_DRAFT_PATH =
  join(repoRoot, DRAFT_PATH);
export const PLAN040_QBNR_BUS_STOP_PACKAGE_13_GATE_PATH =
  join(repoRoot, GATE_PATH);
export const PLAN040_QBNR_BUS_STOP_PACKAGE_13_ACCEPTANCE_PATH =
  join(repoRoot, ACCEPTANCE_PATH);
export const PLAN040_QBNR_BUS_STOP_PACKAGE_13_EXTENT_DECISIONS_PATH =
  join(repoRoot, EXTENT_DECISIONS_PATH);
export const PLAN040_QBNR_BUS_STOP_PACKAGE_13_GRAIN_DECISIONS_PATH =
  join(repoRoot, GRAIN_DECISIONS_PATH);
export const PLAN040_QBNR_BUS_STOP_PACKAGE_13_SOURCE_GAP_OVERLAY_PATH =
  join(repoRoot, SOURCE_GAP_OVERLAY_PATH);

type Plan040Package13EvidenceArtifact = {
  candidates: Plan040Package13CandidateEvidence[];
  preserved_siblings: Plan040Package13PreservedSibling[];
  exclusions: Plan040Package13Exclusion[];
  candidate_count: number;
  positive_extent_and_grain_count: number;
  positive_extent_only_blocked_grain_count: number;
  blocked_extent_and_grain_count: number;
  source_gap_block_receipt_count: number;
  exact_absence_count: number;
  candidate_key_sha256: string;
  comparison_receipt: Plan040Package13ReceiptRef;
  source_gap_block_receipt: Plan040Package13ReceiptRef;
  gate_created: boolean;
  owner_acceptance_created: boolean;
  persistence_performed: boolean;
  authorizes_occurrence: boolean;
  authorizes_study: boolean;
  authorizes_cross_product: boolean;
  authorizes_decision_persistence: boolean;
};

type Plan040Package13Draft = {
  evidence_manifest: { path: string; sha256: string };
  comparison_receipt: Plan040Package13ReceiptRef;
  source_gap_block_receipt: Plan040Package13ReceiptRef;
  candidate_count: number;
  positive_extent_and_grain_count: number;
  positive_extent_only_blocked_grain_count: number;
  blocked_extent_and_grain_count: number;
  source_gap_block_receipt_count: number;
  exact_absence_count: number;
  candidate_key_sha256: string;
  proposed_extent_decisions: JsonValue[];
  proposed_positive_grain_decisions: JsonValue[];
  proposed_blocked_grain_decisions: JsonValue[];
  source_gap_blocks: JsonValue[];
  persisted_extent_decision_count: number;
  persisted_grain_decision_count: number;
  gate_created: boolean;
  owner_acceptance_created: boolean;
  persistence_performed: boolean;
  authorizes_occurrence: boolean;
  authorizes_study: boolean;
  authorizes_cross_product: boolean;
  authorizes_decision_persistence: boolean;
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...new Set(values)].sort().join("\n")}\n`);
const jsonSha256 = (value: unknown): string =>
  sha256(`${stableJson(value as JsonValue)}\n`);

const artifactPins = () => ({
  evidence: {
    path: EVIDENCE_PATH,
    sha256: PLAN040_PACKAGE_13_EVIDENCE_SHA256,
  },
  draft: {
    path: DRAFT_PATH,
    sha256: PLAN040_PACKAGE_13_DRAFT_SHA256,
  },
  comparison_receipt: {
    path: COMPARISON_RECEIPT_PATH,
    sha256: PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256,
  },
  source_gap_block_receipt: {
    path: SOURCE_GAP_RECEIPT_PATH,
    sha256: PLAN040_PACKAGE_13_SOURCE_GAP_RECEIPT_SHA256,
  },
});

function candidatePartitions(evidence: Plan040Package13EvidenceArtifact) {
  const positiveExtentAndGrain = evidence.candidates.filter((candidate) =>
    candidate.evidence_verdict === "positive_extent_and_grain_proposed"
  );
  const positiveExtentOnly = evidence.candidates.filter((candidate) =>
    candidate.evidence_verdict ===
      "positive_extent_proposed_grain_blocked"
  );
  const blockedExtentAndGrain = evidence.candidates.filter((candidate) =>
    candidate.evidence_verdict === "source_gap_blocked_extent_and_grain"
  );
  const decisionCandidates = [
    ...positiveExtentAndGrain,
    ...positiveExtentOnly,
  ];
  const sourceGapCandidates = [
    ...positiveExtentOnly,
    ...blockedExtentAndGrain,
  ];
  return {
    positiveExtentAndGrain,
    positiveExtentOnly,
    blockedExtentAndGrain,
    decisionCandidates,
    sourceGapCandidates,
  };
}

function assertFrozenScope(input: {
  evidence: Plan040Package13EvidenceArtifact;
  draft: Plan040Package13Draft;
}): ReturnType<typeof candidatePartitions> {
  validatePlan040Package13Evidence(input.evidence);
  const partitions = candidatePartitions(input.evidence);
  const extentDecisions = input.evidence.candidates.flatMap((candidate) =>
    candidate.proposed_extent_decision
      ? [candidate.proposed_extent_decision]
      : []
  );
  const grainDecisions = input.evidence.candidates.flatMap((candidate) =>
    candidate.proposed_grain_decision
      ? [candidate.proposed_grain_decision]
      : []
  );
  if (
    input.evidence.candidate_count !== PLAN040_PACKAGE_13_CANDIDATE_COUNT ||
    input.draft.candidate_count !== PLAN040_PACKAGE_13_CANDIDATE_COUNT ||
    input.evidence.candidate_key_sha256 !==
      PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256 ||
    input.draft.candidate_key_sha256 !==
      PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256 ||
    sortedHash(input.evidence.candidates.map((row) => row.candidate_key)) !==
      PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256 ||
    partitions.positiveExtentAndGrain.length !==
      PLAN040_PACKAGE_13_POSITIVE_EXTENT_AND_GRAIN_COUNT ||
    partitions.positiveExtentOnly.length !==
      PLAN040_PACKAGE_13_POSITIVE_EXTENT_ONLY_COUNT ||
    partitions.blockedExtentAndGrain.length !==
      PLAN040_PACKAGE_13_BLOCKED_EXTENT_AND_GRAIN_COUNT ||
    partitions.sourceGapCandidates.length !==
      PLAN040_PACKAGE_13_SOURCE_GAP_COUNT ||
    sortedHash(partitions.sourceGapCandidates.map((row) =>
      row.candidate_key)) !== PLAN040_PACKAGE_13_SOURCE_GAP_KEY_SHA256 ||
    input.evidence.exact_absence_count !==
      PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT ||
    input.draft.exact_absence_count !==
      PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT ||
    input.draft.evidence_manifest.sha256 !==
      PLAN040_PACKAGE_13_EVIDENCE_SHA256 ||
    input.evidence.comparison_receipt.sha256 !==
      PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256 ||
    input.draft.comparison_receipt.sha256 !==
      PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256 ||
    input.evidence.source_gap_block_receipt.sha256 !==
      PLAN040_PACKAGE_13_SOURCE_GAP_RECEIPT_SHA256 ||
    input.draft.source_gap_block_receipt.sha256 !==
      PLAN040_PACKAGE_13_SOURCE_GAP_RECEIPT_SHA256 ||
    extentDecisions.length !== 21 ||
    grainDecisions.length !== 21 ||
    extentDecisions.filter((decision) =>
      decision.resolution === "bounded_segment").length !== 18 ||
    extentDecisions.filter((decision) =>
      decision.resolution === "stop_set").length !== 3 ||
    grainDecisions.filter((decision) =>
      decision.service_scope.kind === "trip_subset").length !== 19 ||
    grainDecisions.filter((decision) =>
      decision.service_scope.kind === "unresolved").length !== 2 ||
    input.draft.proposed_extent_decisions.length !== 21 ||
    input.draft.proposed_positive_grain_decisions.length !== 19 ||
    input.draft.proposed_blocked_grain_decisions.length !== 2 ||
    input.draft.source_gap_blocks.length !== 12 ||
    input.evidence.gate_created ||
    input.evidence.owner_acceptance_created ||
    input.evidence.persistence_performed ||
    input.evidence.authorizes_decision_persistence ||
    input.evidence.authorizes_occurrence ||
    input.evidence.authorizes_study ||
    input.evidence.authorizes_cross_product ||
    input.draft.gate_created ||
    input.draft.owner_acceptance_created ||
    input.draft.persistence_performed ||
    input.draft.persisted_extent_decision_count !== 0 ||
    input.draft.persisted_grain_decision_count !== 0 ||
    input.draft.authorizes_decision_persistence ||
    input.draft.authorizes_occurrence ||
    input.draft.authorizes_study ||
    input.draft.authorizes_cross_product
  ) {
    throw new Error(
      "Plan 040 Package 13 frozen verdict or authorization scope drifted",
    );
  }
  return partitions;
}

export function buildPlan040Package13GateAndAcceptance(input: {
  evidence: Plan040Package13EvidenceArtifact;
  draft: Plan040Package13Draft;
  acceptedAt: string;
}) {
  const partitions = assertFrozenScope(input);
  const reviewerResults = [
    {
      reviewer_id: "main_advisor",
      role: "independent_exact_extent_grain_and_source_gap_review",
      reviewed_commit: PLAN040_PACKAGE_13_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
    {
      reviewer_id: "plan040_package13_independent_audit",
      role: "independent_pattern_binding_provenance_and_preservation_audit",
      reviewed_commit: PLAN040_PACKAGE_13_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
  ];
  const verdictDistribution = {
    positive_extent_and_grain_proposed: 19,
    positive_extent_proposed_grain_blocked: 2,
    source_gap_blocked_extent_and_grain: 10,
    source_gap_block_receipt: 12,
    exact_absence: 0,
  } as const;
  const candidateReviewResults = input.evidence.candidates
    .map((candidate) => ({
      candidate_key: candidate.candidate_key,
      gtfs_route_id: candidate.gtfs_route_id,
      treatment_record_id: candidate.treatment_record_id,
      evidence_verdict: candidate.evidence_verdict,
      proposed_extent_resolution:
        candidate.proposed_extent_decision?.resolution ?? null,
      proposed_grain_kind:
        candidate.proposed_grain_decision?.service_scope.kind ?? null,
      source_gap_blocked_surfaces:
        candidate.evidence_verdict ===
            "positive_extent_proposed_grain_blocked"
          ? ["member_grain"]
          : candidate.evidence_verdict ===
              "source_gap_blocked_extent_and_grain"
          ? ["member_extent", "member_grain"]
          : [],
      reviewer_verdicts: ["APPROVE", "APPROVE"] as const,
      review_result: "APPROVE/APPROVE" as const,
    }))
    .sort((left, right) =>
      left.candidate_key.localeCompare(right.candidate_key)
    );
  const gate = {
    schema_version: 1,
    gate_id: "plan-040-qbnr-bus-stop-package-13-dual-review-gate-v1",
    package_id: PLAN040_QBNR_BUS_STOP_PACKAGE_13,
    reviewed_commit: PLAN040_PACKAGE_13_APPROVED_COMMIT,
    artifacts: artifactPins(),
    candidate_count: 31,
    route_count: 30,
    candidate_key_sha256: PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    extent_distribution: {
      bounded_segment: 18,
      stop_set: 3,
      blocked_upstream: 10,
    },
    grain_distribution: {
      trip_subset: 19,
      unresolved_decision: 2,
      blocked_upstream: 12,
    },
    reviewer_results: reviewerResults,
    candidate_review_results: candidateReviewResults,
    checkpoint_tests: {
      focused: {
        pass: 10,
        fail: 0,
        assertions: 3446,
        status: "pass" as const,
      },
      typecheck: { status: "pass" as const },
      validate: {
        issues: 0,
        release_contract_issues: 0,
        warnings: 3,
        status: "pass" as const,
      },
      deterministic_replay: {
        evidence_sha256: PLAN040_PACKAGE_13_EVIDENCE_SHA256,
        draft_sha256: PLAN040_PACKAGE_13_DRAFT_SHA256,
        comparison_receipt_sha256:
          PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256,
        source_gap_receipt_sha256:
          PLAN040_PACKAGE_13_SOURCE_GAP_RECEIPT_SHA256,
        status: "pass" as const,
      },
      full_repository: {
        status: "deferred_to_owner_checkpoint" as const,
      },
    },
    verdict: "APPROVE" as const,
    reviewer_result: "APPROVE/APPROVE" as const,
    authorization_state:
      "dual_review_approved_pending_explicit_owner_acceptance",
    authorizes_decision_persistence: false as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
    authorizes_ontology: false as const,
    authorizes_corrections: false as const,
  };
  const gateSha256 = jsonSha256(gate);
  const extentDecisions = partitions.decisionCandidates.map((candidate) =>
    candidate.proposed_extent_decision!
  );
  const grainDecisions = partitions.decisionCandidates.map((candidate) =>
    candidate.proposed_grain_decision!
  );
  const acceptance = {
    schema_version: 1,
    acceptance_id:
      "plan-040-qbnr-bus-stop-package-13-owner-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    acceptance_basis: "standing_owner_package_acceptance_after_dual_approval",
    gate: { path: GATE_PATH, sha256: gateSha256 },
    artifacts: artifactPins(),
    candidate_count: 31,
    candidate_key_sha256: PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    reviewer_result: "APPROVE/APPROVE" as const,
    authorized_exact_persistence: {
      decision_candidate_count: 21,
      decision_candidate_key_sha256: sortedHash(
        partitions.decisionCandidates.map((candidate) =>
          candidate.candidate_key
        ),
      ),
      extent_decision_count: 21,
      extent_decision_id_sha256: sortedHash(
        extentDecisions.map((decision) => decision.decision_id),
      ),
      grain_decision_count: 21,
      grain_decision_id_sha256: sortedHash(
        grainDecisions.map((decision) => decision.decision_id),
      ),
      source_gap_overlay_count: 12,
      source_gap_candidate_key_sha256:
        PLAN040_PACKAGE_13_SOURCE_GAP_KEY_SHA256,
      extent_resolved_count: 21,
      extent_blocked_upstream_count: 10,
      grain_resolved_count: 19,
      grain_blocked_upstream_count: 12,
    },
    preservation_invariants: {
      accepted_prior_decisions_byte_identical: true,
      preserved_siblings_byte_identical: true,
      occurrence_decisions_unchanged: true,
      study_authorization_unchanged: true,
      cross_product_authorization_unchanged: true,
      treatment_ontology_unchanged: true,
      correction_state_unchanged: true,
      source_gap_receipt_strict_and_nonauthorizing: true,
      absence_projection_prohibited_for_unresolved_grain: true,
    },
    authorization_state:
      "owner_accepted_exact_21_extent_21_grain_and_12_source_gap_overlays_only",
    authorizes_decision_persistence: true as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
    authorizes_ontology: false as const,
    authorizes_corrections: false as const,
  };
  return { gate, gateSha256, acceptance };
}

export function validatePlan040Package13GateAndAcceptance(input: {
  evidence: Plan040Package13EvidenceArtifact;
  draft: Plan040Package13Draft;
  gate: unknown;
  acceptance: unknown;
  acceptedAt: string;
}) {
  const expected = buildPlan040Package13GateAndAcceptance({
    evidence: input.evidence,
    draft: input.draft,
    acceptedAt: input.acceptedAt,
  });
  if (
    stableJson(input.gate as JsonValue) !==
      stableJson(expected.gate as unknown as JsonValue) ||
    stableJson(input.acceptance as JsonValue) !==
      stableJson(expected.acceptance as unknown as JsonValue)
  ) {
    throw new Error(
      "Plan 040 Package 13 gate or owner acceptance drifted",
    );
  }
  return {
    candidate_count: 31,
    authorized_extent_decision_count: 21,
    authorized_grain_decision_count: 21,
    extent_blocked_upstream_count: 10,
    grain_blocked_upstream_count: 12,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
    authorizes_ontology: false as const,
    authorizes_corrections: false as const,
  };
}

function writeImmutableJson(path: string, value: unknown): void {
  const contents = `${stableJson(value as JsonValue)}\n`;
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== contents) {
      throw new Error(
        `Refusing to overwrite immutable Plan 040 Package 13 artifact ${
          relative(repoRoot, path)
        }`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function writePlan040Package13GateAndAcceptance(input: {
  acceptedAt: string;
}) {
  const evidence = JSON.parse(readFileSync(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_EVIDENCE_PATH,
    "utf8",
  )) as Plan040Package13EvidenceArtifact;
  const draft = JSON.parse(readFileSync(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_DRAFT_PATH,
    "utf8",
  )) as Plan040Package13Draft;
  const built = buildPlan040Package13GateAndAcceptance({
    evidence,
    draft,
    acceptedAt: input.acceptedAt,
  });
  writeImmutableJson(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_GATE_PATH,
    built.gate,
  );
  writeImmutableJson(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_ACCEPTANCE_PATH,
    built.acceptance,
  );
  return {
    gatePath: PLAN040_QBNR_BUS_STOP_PACKAGE_13_GATE_PATH,
    gateSha256: built.gateSha256,
    acceptancePath: PLAN040_QBNR_BUS_STOP_PACKAGE_13_ACCEPTANCE_PATH,
    acceptanceSha256: jsonSha256(built.acceptance),
  };
}

type Plan040Package13GateAndAcceptance =
  ReturnType<typeof buildPlan040Package13GateAndAcceptance>;

type StrictSourceGapReceipt = {
  receipt_id: string;
  source_id: string;
  candidate_count: number;
  candidate_key_sha256: string;
  exact_absence_count: number;
  absence_projection_prohibited_for_unresolved_grain: true;
  candidates: Array<{
    candidate_key: string;
    occurrence_id: string;
    route_record_id: string;
    treatment_record_id: string;
    blocked_surfaces: Array<"member_extent" | "member_grain">;
    resolved_surfaces: Array<"member_extent" | "member_grain">;
    gap_codes: string[];
    prospective_ledger_handling: Record<string, string>;
    semantic_verdict: "blocked_upstream";
    literal_exact_absence: false;
    source_statement_present: true;
    source_statement_evidence_id: string;
    absence_projection_prohibited_for_unresolved_grain: true;
    authorizes_decision_persistence: false;
    authorizes_occurrence: false;
    authorizes_study: false;
    authorizes_cross_product: false;
  }>;
  authorizes_decision_persistence: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

function assertAcceptedHash(
  actual: readonly string[],
  expectedSha256: string,
  label: string,
): void {
  if (sortedHash(actual) !== expectedSha256) {
    throw new Error(
      `Plan 040 Package 13 ${label} drifted outside owner acceptance`,
    );
  }
}

export function buildPlan040Package13AcceptedArtifacts(input: {
  evidence: Plan040Package13EvidenceArtifact;
  draft: Plan040Package13Draft;
  gate: Plan040Package13GateAndAcceptance["gate"];
  acceptance: Plan040Package13GateAndAcceptance["acceptance"];
  sourceGapReceipt: StrictSourceGapReceipt;
}): {
  extentDecisions: MemberExtentDecision[];
  grainDecisions: MemberGrainDecision[];
  sourceGapOverlay: MemberSourceGapOverlay;
} {
  validatePlan040Package13GateAndAcceptance({
    evidence: input.evidence,
    draft: input.draft,
    gate: input.gate,
    acceptance: input.acceptance,
    acceptedAt: input.acceptance.accepted_at,
  });
  const partitions = candidatePartitions(input.evidence);
  if (
    input.gate.verdict !== "APPROVE" ||
    input.gate.reviewer_result !== "APPROVE/APPROVE" ||
    input.gate.reviewer_results.some((review) =>
      review.verdict !== "APPROVE"
    ) ||
    input.acceptance.reviewer_result !== "APPROVE/APPROVE" ||
    input.acceptance.authorization_state !==
      "owner_accepted_exact_21_extent_21_grain_and_12_source_gap_overlays_only" ||
    !input.acceptance.authorizes_decision_persistence ||
    input.acceptance.authorizes_occurrence ||
    input.acceptance.authorizes_study ||
    input.acceptance.authorizes_cross_product ||
    input.acceptance.authorizes_ontology ||
    input.acceptance.authorizes_corrections ||
    !input.acceptance.preservation_invariants
      .accepted_prior_decisions_byte_identical ||
    !input.acceptance.preservation_invariants
      .preserved_siblings_byte_identical ||
    !input.acceptance.preservation_invariants
      .occurrence_decisions_unchanged ||
    !input.acceptance.preservation_invariants
      .study_authorization_unchanged ||
    !input.acceptance.preservation_invariants
      .cross_product_authorization_unchanged ||
    !input.acceptance.preservation_invariants
      .treatment_ontology_unchanged ||
    !input.acceptance.preservation_invariants.correction_state_unchanged ||
    !input.acceptance.preservation_invariants
      .source_gap_receipt_strict_and_nonauthorizing ||
    !input.acceptance.preservation_invariants
      .absence_projection_prohibited_for_unresolved_grain
  ) {
    throw new Error(
      "Plan 040 Package 13 acceptance does not authorize this persistence scope",
    );
  }

  const decisionCandidates = partitions.decisionCandidates;
  assertAcceptedHash(
    decisionCandidates.map((candidate) => candidate.candidate_key),
    input.acceptance.authorized_exact_persistence
      .decision_candidate_key_sha256,
    "decision candidate keys",
  );
  assertAcceptedHash(
    decisionCandidates.map((candidate) =>
      candidate.proposed_extent_decision!.decision_id
    ),
    input.acceptance.authorized_exact_persistence.extent_decision_id_sha256,
    "extent decision ids",
  );
  assertAcceptedHash(
    decisionCandidates.map((candidate) =>
      candidate.proposed_grain_decision!.decision_id
    ),
    input.acceptance.authorized_exact_persistence.grain_decision_id_sha256,
    "grain decision ids",
  );

  const extentDecisions = decisionCandidates.map((candidate) => {
    const decision = {
      ...candidate.proposed_extent_decision!,
      reviewed_at: input.acceptance.accepted_at,
      reviewed_by: input.acceptance.accepted_by,
    };
    validateMemberExtentDecision(decision);
    if (
      extentDecisionKey(decision) !== candidate.candidate_key ||
      decision.resolution === "unresolved"
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: accepted extent state drifted`,
      );
    }
    return decision;
  }).sort((left, right) =>
    extentDecisionKey(left).localeCompare(extentDecisionKey(right))
  );
  const extentByKey = new Map(extentDecisions.map((decision) =>
    [extentDecisionKey(decision), decision]
  ));
  const grainDecisions = decisionCandidates.map((candidate) => {
    const decision = parseMemberGrainDecision({
      ...candidate.proposed_grain_decision!,
      reviewed_at: input.acceptance.accepted_at,
      reviewed_by: input.acceptance.accepted_by,
    });
    const extent = extentByKey.get(candidate.candidate_key)!;
    const unresolved = candidate.evidence_verdict ===
      "positive_extent_proposed_grain_blocked";
    if (
      memberGrainDecisionKey(decision) !== candidate.candidate_key ||
      decision.member_extent_decision_id !== extent.decision_id ||
      (
        unresolved
          ? decision.service_scope.kind !== "unresolved"
          : decision.service_scope.kind !== "trip_subset"
      )
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: accepted grain state drifted`,
      );
    }
    return decision;
  }).sort((left, right) =>
    memberGrainDecisionKey(left).localeCompare(
      memberGrainDecisionKey(right),
    )
  );
  if (
    extentDecisions.length !== 21 ||
    grainDecisions.length !== 21 ||
    grainDecisions.filter((decision) =>
      decision.service_scope.kind === "trip_subset").length !== 19 ||
    grainDecisions.filter((decision) =>
      decision.service_scope.kind === "unresolved").length !== 2
  ) {
    throw new Error(
      "Plan 040 Package 13 accepted decision distribution drifted",
    );
  }

  const receipt = input.sourceGapReceipt;
  if (
    receipt.receipt_id !==
      "plan-040-qbnr-bus-stop-package-13-source-gap-blocks-v1" ||
    receipt.candidate_count !== 12 ||
    receipt.candidate_key_sha256 !==
      PLAN040_PACKAGE_13_SOURCE_GAP_KEY_SHA256 ||
    receipt.exact_absence_count !== 0 ||
    !receipt.absence_projection_prohibited_for_unresolved_grain ||
    receipt.authorizes_decision_persistence ||
    receipt.authorizes_occurrence ||
    receipt.authorizes_study ||
    receipt.authorizes_cross_product ||
    receipt.candidates.length !== 12 ||
    receipt.candidates.some((candidate) => {
      const missingRoles = [...new Set(candidate.gap_codes)].sort();
      const reason = `blocked_upstream:${missingRoles.join("+")}`;
      return (
        candidate.semantic_verdict !== "blocked_upstream" ||
        candidate.literal_exact_absence ||
        !candidate.source_statement_present ||
        !candidate.absence_projection_prohibited_for_unresolved_grain ||
        candidate.authorizes_decision_persistence ||
        candidate.authorizes_occurrence ||
        candidate.authorizes_study ||
        candidate.authorizes_cross_product ||
        candidate.blocked_surfaces.some((surface) =>
          candidate.prospective_ledger_handling[surface] !== reason
        )
      );
    })
  ) {
    throw new Error("Plan 040 Package 13 strict source-gap receipt drifted");
  }
  assertAcceptedHash(
    receipt.candidates.map((candidate) => candidate.candidate_key),
    input.acceptance.authorized_exact_persistence
      .source_gap_candidate_key_sha256,
    "source-gap candidate keys",
  );
  const sourceGapOverlay: MemberSourceGapOverlay = {
    schema_version: 1,
    contract_id: "member-source-gap-overlay-v1",
    overlay_id: "plan-040-qbnr-bus-stop-package-13-source-gap-overlay-v1",
    source_receipt: {
      path: SOURCE_GAP_RECEIPT_PATH,
      sha256: PLAN040_PACKAGE_13_SOURCE_GAP_RECEIPT_SHA256,
      receipt_id: receipt.receipt_id,
    },
    owner_acceptance: {
      path: ACCEPTANCE_PATH,
      sha256: PLAN040_PACKAGE_13_ACCEPTANCE_SHA256,
    },
    accepted_at: input.acceptance.accepted_at,
    accepted_by: input.acceptance.accepted_by,
    entries: receipt.candidates.map((candidate) => {
      const missingRoles = [...new Set(candidate.gap_codes)].sort();
      return {
        candidate_key: candidate.candidate_key,
        occurrence_id: candidate.occurrence_id,
        route_record_id: candidate.route_record_id,
        treatment_record_id: candidate.treatment_record_id,
        blocked_surfaces: [...candidate.blocked_surfaces].sort(),
        missing_roles: missingRoles,
        verdict: `blocked_upstream:${missingRoles.join("+")}` as const,
        source_statement_evidence_id:
          candidate.source_statement_evidence_id,
      };
    }).sort((left, right) =>
      left.candidate_key.localeCompare(right.candidate_key)
    ),
    authorizes_decision_persistence: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  return { extentDecisions, grainDecisions, sourceGapOverlay };
}

export function acceptPlan040Package13DecisionPackage(): {
  extentDecisionPath: string;
  extentDecisionSha256: string;
  grainDecisionPath: string;
  grainDecisionSha256: string;
  sourceGapOverlayPath: string;
  sourceGapOverlaySha256: string;
  extentDecisionCount: 21;
  grainDecisionCount: 21;
  sourceGapOverlayCount: 12;
} {
  for (const [path, expectedSha256, label] of [
    [
      PLAN040_QBNR_BUS_STOP_PACKAGE_13_EVIDENCE_PATH,
      PLAN040_PACKAGE_13_EVIDENCE_SHA256,
      "evidence",
    ],
    [
      PLAN040_QBNR_BUS_STOP_PACKAGE_13_DRAFT_PATH,
      PLAN040_PACKAGE_13_DRAFT_SHA256,
      "draft",
    ],
    [
      join(repoRoot, COMPARISON_RECEIPT_PATH),
      PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256,
      "comparison receipt",
    ],
    [
      join(repoRoot, SOURCE_GAP_RECEIPT_PATH),
      PLAN040_PACKAGE_13_SOURCE_GAP_RECEIPT_SHA256,
      "source-gap receipt",
    ],
    [
      PLAN040_QBNR_BUS_STOP_PACKAGE_13_GATE_PATH,
      PLAN040_PACKAGE_13_GATE_SHA256,
      "dual-review gate",
    ],
    [
      PLAN040_QBNR_BUS_STOP_PACKAGE_13_ACCEPTANCE_PATH,
      PLAN040_PACKAGE_13_ACCEPTANCE_SHA256,
      "owner acceptance",
    ],
  ] as const) {
    const actualSha256 = fileSha256(path);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Plan 040 Package 13 ${label} pin drifted: ${actualSha256}`,
      );
    }
  }
  const evidence = JSON.parse(readFileSync(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_EVIDENCE_PATH,
    "utf8",
  )) as Plan040Package13EvidenceArtifact;
  const draft = JSON.parse(readFileSync(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_DRAFT_PATH,
    "utf8",
  )) as Plan040Package13Draft;
  const gate = JSON.parse(readFileSync(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_GATE_PATH,
    "utf8",
  )) as Plan040Package13GateAndAcceptance["gate"];
  const acceptance = JSON.parse(readFileSync(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_ACCEPTANCE_PATH,
    "utf8",
  )) as Plan040Package13GateAndAcceptance["acceptance"];
  const sourceGapReceipt = JSON.parse(readFileSync(
    join(repoRoot, SOURCE_GAP_RECEIPT_PATH),
    "utf8",
  )) as StrictSourceGapReceipt;
  const accepted = buildPlan040Package13AcceptedArtifacts({
    evidence,
    draft,
    gate,
    acceptance,
    sourceGapReceipt,
  });
  writeImmutableJson(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_EXTENT_DECISIONS_PATH,
    { decisions: accepted.extentDecisions },
  );
  writeImmutableJson(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_GRAIN_DECISIONS_PATH,
    { decisions: accepted.grainDecisions },
  );
  writeImmutableJson(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_SOURCE_GAP_OVERLAY_PATH,
    accepted.sourceGapOverlay,
  );
  const extentDecisionSha256 = fileSha256(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_EXTENT_DECISIONS_PATH,
  );
  const grainDecisionSha256 = fileSha256(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_GRAIN_DECISIONS_PATH,
  );
  const sourceGapOverlaySha256 = fileSha256(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_SOURCE_GAP_OVERLAY_PATH,
  );
  if (
    (
      PLAN040_PACKAGE_13_EXTENT_DECISIONS_SHA256 &&
      extentDecisionSha256 !== PLAN040_PACKAGE_13_EXTENT_DECISIONS_SHA256
    ) ||
    (
      PLAN040_PACKAGE_13_GRAIN_DECISIONS_SHA256 &&
      grainDecisionSha256 !== PLAN040_PACKAGE_13_GRAIN_DECISIONS_SHA256
    ) ||
    (
      PLAN040_PACKAGE_13_SOURCE_GAP_OVERLAY_SHA256 &&
      sourceGapOverlaySha256 !==
        PLAN040_PACKAGE_13_SOURCE_GAP_OVERLAY_SHA256
    )
  ) {
    throw new Error(
      "Plan 040 Package 13 persisted artifact output pin drifted",
    );
  }
  return {
    extentDecisionPath:
      PLAN040_QBNR_BUS_STOP_PACKAGE_13_EXTENT_DECISIONS_PATH,
    extentDecisionSha256,
    grainDecisionPath:
      PLAN040_QBNR_BUS_STOP_PACKAGE_13_GRAIN_DECISIONS_PATH,
    grainDecisionSha256,
    sourceGapOverlayPath:
      PLAN040_QBNR_BUS_STOP_PACKAGE_13_SOURCE_GAP_OVERLAY_PATH,
    sourceGapOverlaySha256,
    extentDecisionCount: 21,
    grainDecisionCount: 21,
    sourceGapOverlayCount: 12,
  };
}
