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
export const PLAN040_PACKAGE_13_POSITIVE_COUNT = 19 as const;
export const PLAN040_PACKAGE_13_TERMINAL_COUNT = 12 as const;
export const PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT = 0 as const;
export const PLAN040_PACKAGE_13_SIBLING_COUNT = 38 as const;
export const PLAN040_PACKAGE_13_EXCLUSION_COUNT = 5 as const;
export const PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256 =
  "7643e1bcbe254f48096c4d23f236aa812f2398e1db5e600bfba65a94fcad2a02" as const;
export const PLAN040_PACKAGE_13_POSITIVE_KEY_SHA256 =
  "e2bcf19f69fc9bb5eff8fee290baaa5b7c904c93c615aaf02c3bf5243e3b5276" as const;
export const PLAN040_PACKAGE_13_TERMINAL_KEY_SHA256 =
  "0103e8f755bdd78cae2e0ba4a06c3efe8ba1f8af0657a62b08ed2f89d47219b8" as const;
export const PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256 =
  "b342e8102fae83f915f33f71a22807ca137524b8dc4be1e75342d42b8d1603d2" as const;
export const PLAN040_PACKAGE_13_TERMINAL_RECEIPT_SHA256 =
  "ca2431c9e7741481a1448556ce67ac2880457112b0c090224c2e5bbd3d65db53" as const;

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
    | "receipt_terminal_unresolved_preserved";
  source_statement: JsonValue;
  immutable_rows: JsonValue;
  comparison_evidence: JsonValue;
  terminal_receipt: JsonValue | null;
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
  const positive = candidates.filter((row) =>
    row.evidence_verdict === "positive_extent_and_grain_proposed"
  );
  const terminal = candidates.filter((row) =>
    row.evidence_verdict === "receipt_terminal_unresolved_preserved"
  );
  if (
    positive.length !== PLAN040_PACKAGE_13_POSITIVE_COUNT ||
    terminal.length !== PLAN040_PACKAGE_13_TERMINAL_COUNT ||
    sortedHash(candidates.map((row) => row.candidate_key)) !==
      PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256 ||
    sortedHash(positive.map((row) => row.candidate_key)) !==
      PLAN040_PACKAGE_13_POSITIVE_KEY_SHA256 ||
    sortedHash(terminal.map((row) => row.candidate_key)) !==
      PLAN040_PACKAGE_13_TERMINAL_KEY_SHA256
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
        candidate.terminal_receipt !== null
      ) {
        throw new Error(`${candidate.candidate_key}: positive proposal is incomplete`);
      }
      validateMemberExtentDecision(candidate.proposed_extent_decision);
      parseMemberGrainDecision(candidate.proposed_grain_decision);
    } else if (
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.terminal_receipt === null
    ) {
      throw new Error(`${candidate.candidate_key}: terminal candidate gained a proposal`);
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
  terminalReceipt: Plan040Package13ReceiptRef;
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
    terminal_receipt: input.terminalReceipt,
    candidate_count: input.candidates.length,
    positive_proposal_count: PLAN040_PACKAGE_13_POSITIVE_COUNT,
    terminal_receipt_count: PLAN040_PACKAGE_13_TERMINAL_COUNT,
    exact_absence_count: PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT,
    candidate_key_sha256: PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256,
    positive_candidate_key_sha256: PLAN040_PACKAGE_13_POSITIVE_KEY_SHA256,
    terminal_candidate_key_sha256: PLAN040_PACKAGE_13_TERMINAL_KEY_SHA256,
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
    proposed_grain_decisions: input.candidates.flatMap((candidate) =>
      candidate.proposed_grain_decision
        ? [candidate.proposed_grain_decision as unknown as JsonValue]
        : []
    ),
    proposed_terminal_receipts: input.candidates.flatMap((candidate) =>
      candidate.terminal_receipt ? [candidate.terminal_receipt] : []
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
  const bytes = stableJson(value as unknown as JsonValue);
  if (!bytes.includes("receipt_terminal_unresolved_preserved")) {
    throw new Error("Package 13 terminal contract disappeared");
  }
}
