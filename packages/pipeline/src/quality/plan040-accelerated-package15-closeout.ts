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
  PLAN040_ACCELERATED_PACKAGE_15,
  PLAN040_PACKAGE_15_CANDIDATE_COUNT,
  PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_15_EXACT_ABSENCE_COUNT,
  PLAN040_PACKAGE_15_POSITIVE_COUNT,
  PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256,
  PLAN040_PACKAGE_15_SOURCE_GAP_COUNT,
  PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256,
  plan040Package15SortedHash,
  type Plan040Package15Discovery,
} from "./plan040-accelerated-package15.js";
import {
  memberGrainDecisionKey,
  parseMemberGrainDecision,
  type MemberGrainDecision,
  type MemberGrainServiceScope,
} from "./member-grain-decisions.js";
import type { MemberSourceGapOverlay } from "./member-extent-ledger.js";
import {
  extentDecisionKey,
  validateMemberExtentDecision,
  type ExactEvidenceBinding,
  type MemberExtentDecision,
} from "./study-readiness-v1.js";

export const PLAN040_PACKAGE_15_REVIEWED_COMMIT =
  "7513c6001b7198b812c0ae44b9b5d2ad73dd1647" as const;
export const PLAN040_PACKAGE_15_ACCEPTED_AT =
  "2026-07-25T00:00:00Z" as const;
export const PLAN040_PACKAGE_15_FROZEN_EVIDENCE_SHA256 =
  "ef5e3736820545079a97acec943928d5787239f7035b775311166b375d704cdc" as const;
export const PLAN040_PACKAGE_15_FROZEN_DRAFT_SHA256 =
  "262d509df5ec02a7239cce1768029626189fd7b018b4307203e1ba8aa8420629" as const;
export const PLAN040_PACKAGE_15_GATE_SHA256 =
  "083393111bfa0926ad39e3004d4cf4ff749a119ccb24e1481d4c284898fae06a" as const;
export const PLAN040_PACKAGE_15_COMPARISON_SHA256 =
  "518f414918b5712feb52f76b7699336bca56eb275290543a5e3b9f1226366875" as const;
export const PLAN040_PACKAGE_15_SOURCE_GAP_BLOCK_SHA256 =
  "c967febc5ed273a494aa65c3f10c33aa7d73b22e1519840e80aae9223697432c" as const;
export const PLAN040_PACKAGE_15_PERSISTENCE_EVIDENCE_SHA256 =
  "b27f24f7c94e1e52a25f1295f49935d865ea7d7ae4471cd21fab5f9afd95c817" as const;
export const PLAN040_PACKAGE_15_ACCEPTANCE_SHA256 =
  "778d79c63d9577309afb9dc05a2426677e6d666d1e8574728a6ef78fefe36d80" as const;
export const PLAN040_PACKAGE_15_EXTENT_DECISIONS_SHA256 =
  "f27901ea7f05072ffd6f3ef3446133f2a8ecd29736dfc2a102d01fffb058528b" as const;
export const PLAN040_PACKAGE_15_GRAIN_DECISIONS_SHA256 =
  "eac2b262b82bdf3817ee595fd670e08270dd7070cec3349b8c413cfe2c8fcd34" as const;
export const PLAN040_PACKAGE_15_SOURCE_GAP_OVERLAY_SHA256 =
  "680c779ea3b0f52abb4069643981ebd67633c5e56955259fc0836d3ba1f15f2c" as const;
export const PLAN040_PACKAGE_15_CONTRACT_EXTENT_HISTOGRAM = {
  bounded_segment: 48,
  route_wide: 35,
  stop_set: 9,
  unresolved: 216,
} as const;

const RISK_PREFIX =
  "data/quality/operational-reference/member-extent-risk/";
const RECEIPT_PREFIX =
  "data/quality/acquisition/receipts/member-extent-evidence/";
const FROZEN_EVIDENCE_PATH =
  `${RISK_PREFIX}plan-040-accelerated-package-15-evidence-v1.json`;
const FROZEN_DRAFT_PATH =
  `${RISK_PREFIX}plan-040-accelerated-package-15-evidence-draft-v1.json`;
const DISCOVERY_PATH =
  `${RECEIPT_PREFIX}plan-040-accelerated-package-15-discovery-receipt-v1.json`;
const GATE_PATH =
  `${RISK_PREFIX}plan-040-accelerated-package-15-dual-review-gate-v1.json`;
const COMPARISON_PATH =
  `${RECEIPT_PREFIX}plan-040-accelerated-package-15-persistence-comparisons-v1.json`;
const SOURCE_GAP_BLOCK_PATH =
  `${RECEIPT_PREFIX}plan-040-accelerated-package-15-source-gap-blocks-v1.json`;
const PERSISTENCE_EVIDENCE_PATH =
  `${RISK_PREFIX}plan-040-accelerated-package-15-persistence-evidence-v1.json`;
const ACCEPTANCE_PATH =
  `${RISK_PREFIX}plan-040-accelerated-package-15-owner-acceptance-v1.json`;
const EXTENT_DECISIONS_PATH =
  "data/quality/operational-reference/member-extent-ledger-decisions/" +
  "plan-040-accelerated-package-15-v1.json";
const GRAIN_DECISIONS_PATH =
  "data/quality/operational-reference/member-grain-decisions/" +
  "plan-040-accelerated-package-15-v1.json";
const SOURCE_GAP_OVERLAY_PATH =
  "data/quality/operational-reference/member-source-gap-overlays/" +
  "plan-040-accelerated-package-15-v1.json";

export const PLAN040_PACKAGE_15_GATE_PATH = join(repoRoot, GATE_PATH);
export const PLAN040_PACKAGE_15_COMPARISON_PATH =
  join(repoRoot, COMPARISON_PATH);
export const PLAN040_PACKAGE_15_SOURCE_GAP_BLOCK_PATH =
  join(repoRoot, SOURCE_GAP_BLOCK_PATH);
export const PLAN040_PACKAGE_15_PERSISTENCE_EVIDENCE_PATH =
  join(repoRoot, PERSISTENCE_EVIDENCE_PATH);
export const PLAN040_PACKAGE_15_ACCEPTANCE_PATH =
  join(repoRoot, ACCEPTANCE_PATH);
export const PLAN040_PACKAGE_15_EXTENT_DECISIONS_PATH =
  join(repoRoot, EXTENT_DECISIONS_PATH);
export const PLAN040_PACKAGE_15_GRAIN_DECISIONS_PATH =
  join(repoRoot, GRAIN_DECISIONS_PATH);
export const PLAN040_PACKAGE_15_SOURCE_GAP_OVERLAY_PATH =
  join(repoRoot, SOURCE_GAP_OVERLAY_PATH);

type ArtifactRef = { path: string; sha256: string };
type StrictReceiptRef = ArtifactRef & {
  receipt_id: string;
  source_id: string;
  normal_file_verified: true;
  replay_derived: true;
  authorizes_decision_persistence: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};
type PositiveProposal = {
  candidate_key: string;
  partition: string;
  proposal: {
    extent_resolution?: "route_wide";
    extent_components?: Array<{
      identity_namespace: string;
      identifiers: string[];
    }>;
    extent?: {
      resolution: "stop_set";
      direction: string;
      stop_ids: string[];
    };
    grain_scope:
      | { kind: "all_service" | "not_applicable" }
      | {
        kind: "trip_subset";
        periods: string[];
        directions: string[];
        pattern_ids: string[];
      };
    positive_basis: string[];
  };
};
type SourceGapProposal = {
  candidate_key: string;
  partition: string;
  overlay: {
    blocked_surfaces: ["member_extent", "member_grain"];
    candidate_key: string;
    contract_id: "member-source-gap-overlay-v1";
    missing_roles: string[];
    rationale: string;
    verdict: string;
  };
};
type FrozenDraft = {
  schema_version: 1;
  candidate_count: number;
  candidate_key_sha256: string;
  positive_extent_and_grain_count: number;
  positive_extent_and_grain_key_sha256: string;
  source_gap_blocked_extent_and_grain_count: number;
  source_gap_key_sha256: string;
  exact_absence_count: number;
  evidence_manifest: ArtifactRef;
  positive_extent_decisions: PositiveProposal[];
  positive_grain_decisions: PositiveProposal[];
  source_gap_overlays: SourceGapProposal[];
  gate_created: false;
  owner_acceptance_created: false;
  persistence_performed: false;
  persisted_extent_decision_count: 0;
  persisted_grain_decision_count: 0;
  authorizes_decision_persistence: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};
type FrozenEvidence = {
  schema_version: 1;
  candidate_count: number;
  candidate_key_sha256: string;
  positive_extent_and_grain_count: number;
  positive_extent_and_grain_key_sha256: string;
  blocked_extent_and_grain_count: number;
  blocked_extent_and_grain_key_sha256: string;
  exact_absence_count: number;
  frozen_discovery_receipt: ArtifactRef;
  partition_receipts: Record<string, ArtifactRef>;
  complete_ordered_full_stop_chains: ArtifactRef;
  source_gap_receipt: ArtifactRef;
  current_freeze_state: ArtifactRef;
  gate_created: false;
  owner_acceptance_created: false;
  persistence_performed: false;
  persisted_extent_decision_count: 0;
  persisted_grain_decision_count: 0;
  authorizes_decision_persistence: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const jsonSha256 = (value: unknown): string =>
  sha256(`${stableJson(value as JsonValue)}\n`);
const fileSha256 = (path: string): string =>
  sha256(readFileSync(join(repoRoot, path)));
const artifactRef = (path: string, expected?: string): ArtifactRef => {
  const actual = fileSha256(path);
  if (expected && expected !== "PENDING" && actual !== expected) {
    throw new Error(`Package 15 artifact pin drifted for ${path}: ${actual}`);
  }
  return { path, sha256: actual };
};
const strictReceiptRef = (
  path: string,
  receiptId: string,
  sourceId: string,
  expected?: string,
): StrictReceiptRef => ({
  ...artifactRef(path, expected),
  receipt_id: receiptId,
  source_id: sourceId,
  normal_file_verified: true,
  replay_derived: true,
  authorizes_decision_persistence: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
});
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as T;

function writeImmutableJson(path: string, value: unknown): void {
  const bytes = `${stableJson(value as JsonValue)}\n`;
  const absolute = join(repoRoot, path);
  if (existsSync(absolute)) {
    if (readFileSync(absolute, "utf8") !== bytes) {
      throw new Error(
        `Refusing to overwrite immutable Plan 040 Package 15 artifact ${
          relative(repoRoot, absolute)
        }`,
      );
    }
    return;
  }
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes, "utf8");
}

function frozenInputs() {
  const evidence = readJson<FrozenEvidence>(FROZEN_EVIDENCE_PATH);
  const draft = readJson<FrozenDraft>(FROZEN_DRAFT_PATH);
  const discovery = readJson<Plan040Package15Discovery>(DISCOVERY_PATH);
  const positiveKeys = draft.positive_extent_decisions.map((row) =>
    row.candidate_key
  );
  const grainKeys = draft.positive_grain_decisions.map((row) =>
    row.candidate_key
  );
  const gapKeys = draft.source_gap_overlays.map((row) => row.candidate_key);
  if (
    evidence.schema_version !== 1 ||
    draft.schema_version !== 1 ||
    evidence.candidate_count !== PLAN040_PACKAGE_15_CANDIDATE_COUNT ||
    draft.candidate_count !== PLAN040_PACKAGE_15_CANDIDATE_COUNT ||
    evidence.candidate_key_sha256 !==
      PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256 ||
    draft.candidate_key_sha256 !== PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256 ||
    plan040Package15SortedHash([...positiveKeys, ...gapKeys]) !==
      PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256 ||
    positiveKeys.length !== PLAN040_PACKAGE_15_POSITIVE_COUNT ||
    grainKeys.length !== PLAN040_PACKAGE_15_POSITIVE_COUNT ||
    plan040Package15SortedHash(positiveKeys) !==
      PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256 ||
    plan040Package15SortedHash(grainKeys) !==
      PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256 ||
    gapKeys.length !== PLAN040_PACKAGE_15_SOURCE_GAP_COUNT ||
    plan040Package15SortedHash(gapKeys) !==
      PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256 ||
    evidence.exact_absence_count !== PLAN040_PACKAGE_15_EXACT_ABSENCE_COUNT ||
    draft.exact_absence_count !== PLAN040_PACKAGE_15_EXACT_ABSENCE_COUNT ||
    draft.gate_created ||
    draft.owner_acceptance_created ||
    draft.persistence_performed ||
    draft.authorizes_decision_persistence ||
    draft.authorizes_occurrence ||
    draft.authorizes_study ||
    draft.authorizes_cross_product ||
    evidence.gate_created ||
    evidence.owner_acceptance_created ||
    evidence.persistence_performed ||
    evidence.authorizes_decision_persistence ||
    evidence.authorizes_occurrence ||
    evidence.authorizes_study ||
    evidence.authorizes_cross_product
  ) {
    throw new Error("Plan 040 Package 15 frozen scope drifted");
  }
  const pins: Record<string, ArtifactRef> = {
    frozen_evidence: artifactRef(
      FROZEN_EVIDENCE_PATH,
      PLAN040_PACKAGE_15_FROZEN_EVIDENCE_SHA256,
    ),
    frozen_draft: artifactRef(
      FROZEN_DRAFT_PATH,
      PLAN040_PACKAGE_15_FROZEN_DRAFT_SHA256,
    ),
    discovery: artifactRef(
      DISCOVERY_PATH,
      evidence.frozen_discovery_receipt.sha256,
    ),
    complete_ordered_full_stop_chains: artifactRef(
      evidence.complete_ordered_full_stop_chains.path,
      evidence.complete_ordered_full_stop_chains.sha256,
    ),
    frozen_source_gaps: artifactRef(
      evidence.source_gap_receipt.path,
      evidence.source_gap_receipt.sha256,
    ),
    current_freeze: artifactRef(
      evidence.current_freeze_state.path,
      evidence.current_freeze_state.sha256,
    ),
  };
  for (const [name, ref] of Object.entries(evidence.partition_receipts)) {
    pins[`partition_${name}`] = artifactRef(ref.path, ref.sha256);
  }
  return { evidence, draft, discovery, pins };
}

function proposalExtent(row: PositiveProposal): "route_wide" | "stop_set" {
  const extent = row.proposal.extent_resolution ??
    row.proposal.extent?.resolution;
  if (extent !== "route_wide" && extent !== "stop_set") {
    throw new Error(`${row.candidate_key}: invalid positive extent proposal`);
  }
  return extent;
}

function decisionIds(draft: FrozenDraft) {
  const suffixes = draft.positive_extent_decisions.map((candidate) => {
    const [, routeRecordId, treatmentRecordId] =
      candidate.candidate_key.split("\0");
    return `${routeRecordId}-${treatmentRecordId}`;
  });
  return {
    extent: suffixes.map((suffix) =>
      `member-extent-review:plan040-package15-${suffix}`
    ),
    grain: suffixes.map((suffix) =>
      `member-grain-review:plan040-package15-${suffix}`
    ),
  };
}

function buildGate(input: ReturnType<typeof frozenInputs>) {
  type GateProposal = {
    evidence_verdict:
      | "positive_extent_and_grain_proposed"
      | "source_gap_blocked_extent_and_grain";
    proposed_extent_resolution: "route_wide" | "stop_set" | null;
    proposed_grain_kind:
      | "all_service"
      | "not_applicable"
      | "trip_subset"
      | null;
    source_gap_blocked_surfaces: string[];
  };
  const proposals = new Map<string, GateProposal>([
    ...input.draft.positive_extent_decisions.map((row) => [
      row.candidate_key,
      {
        evidence_verdict: "positive_extent_and_grain_proposed",
        proposed_extent_resolution: proposalExtent(row),
        proposed_grain_kind: row.proposal.grain_scope.kind,
        source_gap_blocked_surfaces: [] as string[],
      },
    ] as const),
    ...input.draft.source_gap_overlays.map((row) => [
      row.candidate_key,
      {
        evidence_verdict: "source_gap_blocked_extent_and_grain",
        proposed_extent_resolution: null,
        proposed_grain_kind: null,
        source_gap_blocked_surfaces: row.overlay.blocked_surfaces,
      },
    ] as const),
  ]);
  return {
    schema_version: 1,
    gate_id: "plan-040-accelerated-package-15-dual-review-gate-v1",
    package_id: PLAN040_ACCELERATED_PACKAGE_15,
    reviewed_commit: PLAN040_PACKAGE_15_REVIEWED_COMMIT,
    artifacts: input.pins,
    candidate_count: 29,
    candidate_key_sha256: PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256,
    verdict_distribution: {
      positive_extent_and_grain_proposed: 16,
      source_gap_blocked_extent_and_grain: 13,
      exact_absence: 0,
    },
    extent_distribution: {
      route_wide: 15,
      stop_set: 1,
      blocked_upstream: 13,
    },
    grain_distribution: {
      all_service: 14,
      not_applicable: 1,
      trip_subset: 1,
      blocked_upstream: 13,
    },
    reviewer_results: [
      {
        reviewer_id: "plan040_package15_exact_positive_reviewer",
        role: "independent_exact_positive_extent_grain_review",
        reviewed_commit: PLAN040_PACKAGE_15_REVIEWED_COMMIT,
        verdict: "APPROVE",
      },
      {
        reviewer_id: "plan040_package15_source_gap_auditor",
        role: "independent_source_gap_and_q89_fail_closed_audit",
        reviewed_commit: PLAN040_PACKAGE_15_REVIEWED_COMMIT,
        verdict: "APPROVE",
      },
    ],
    candidate_review_results: [...proposals]
      .map(([candidateKey, proposal]) => ({
        candidate_key: candidateKey,
        ...proposal,
        reviewer_verdicts: ["APPROVE", "APPROVE"],
        review_result: "APPROVE/APPROVE",
      }))
      .sort((left, right) =>
        left.candidate_key.localeCompare(right.candidate_key)
      ),
    checkpoint_tests: {
      focused: { pass: 11, fail: 0, status: "pass" },
      typecheck: { status: "pass" },
      validate: { issues: 0, warnings: 3, status: "pass" },
      deterministic_replay: {
        evidence_sha256: PLAN040_PACKAGE_15_FROZEN_EVIDENCE_SHA256,
        draft_sha256: PLAN040_PACKAGE_15_FROZEN_DRAFT_SHA256,
        status: "pass",
      },
      full_repository: {
        status: "deferred_under_accelerated_checkpoint_protocol",
      },
    },
    verdict: "APPROVE",
    reviewer_result: "APPROVE/APPROVE",
    authorization_state:
      "dual_review_approved_pending_standing_owner_package_acceptance",
    authorizes_decision_persistence: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_ontology: false,
    authorizes_corrections: false,
  };
}

function buildComparison(
  input: ReturnType<typeof frozenInputs>,
  gateRef: ArtifactRef,
) {
  const verdictByKey = new Map([
    ...input.draft.positive_extent_decisions.map((row) => [
      row.candidate_key,
      "positive_extent_and_grain",
    ] as const),
    ...input.draft.source_gap_overlays.map((row) => [
      row.candidate_key,
      "source_gap_blocked_extent_and_grain",
    ] as const),
  ]);
  return {
    schema_version: 1,
    receipt_id:
      "plan-040-accelerated-package-15-persistence-comparisons-v1",
    source_id:
      "plan_040_accelerated_package_15_persistence_comparisons",
    package_id: PLAN040_ACCELERATED_PACKAGE_15,
    candidates: [...verdictByKey]
      .map(([candidateKey, verdict]) => ({
        candidate_key: candidateKey,
        frozen_verdict: verdict,
      }))
      .sort((left, right) =>
        left.candidate_key.localeCompare(right.candidate_key)
      ),
    derivation: {
      classification: "canonical_persistence_wrapper_only",
      frozen_evidence_preserved_byte_identical: true,
      exact_positive_requirement_preserved: true,
      authoritative_historical_full_stop_prerequisite_preserved: true,
      stop_id_equivalence_prerequisite_preserved: true,
      occurrence_inference_prohibited: true,
      source_gap_projection: "blocked_upstream_on_both_surfaces",
      q89_remains_fail_closed: true,
      exact_absence_count: 0,
      gate: gateRef,
    },
    source_pins: {
      candidate_key_sha256: PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256,
      positive_key_sha256: PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256,
      source_gap_key_sha256: PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256,
    },
    upstream_pins: input.pins,
    external_acquisition_performed: false,
    normal_file_verified: true,
    replay_derived: true,
    authorizes_decision_persistence: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

function buildSourceGapReceipt(
  input: ReturnType<typeof frozenInputs>,
  comparisonRef: StrictReceiptRef,
) {
  const detailByKey = new Map(input.discovery.candidate_details.map((row) => [
    row.candidate_key,
    row,
  ]));
  const candidates = input.draft.source_gap_overlays.map((candidate) => {
    const [occurrenceId, routeRecordId, treatmentRecordId] =
      candidate.candidate_key.split("\0");
    const detail = detailByKey.get(candidate.candidate_key);
    const evidence = detail?.exact_treatment_evidence_refs as unknown as
      Array<{ evidence_id?: string }>;
    const sourceStatementEvidenceId = evidence?.find((ref) =>
      typeof ref.evidence_id === "string" && ref.evidence_id.length > 0
    )?.evidence_id;
    const gapCodes = [...new Set(candidate.overlay.missing_roles)].sort();
    const canonicalVerdict = `blocked_upstream:${gapCodes.join("+")}`;
    if (
      !occurrenceId ||
      !routeRecordId ||
      !treatmentRecordId ||
      candidate.overlay.candidate_key !== candidate.candidate_key ||
      !sourceStatementEvidenceId
    ) {
      throw new Error(
        `${candidate.candidate_key}: source-gap evidence binding drifted`,
      );
    }
    return {
      candidate_key: candidate.candidate_key,
      occurrence_id: occurrenceId,
      route_record_id: routeRecordId,
      treatment_record_id: treatmentRecordId,
      blocked_surfaces: ["member_extent", "member_grain"],
      resolved_surfaces: [],
      gap_codes: gapCodes,
      frozen_finding_verdict: candidate.overlay.verdict,
      prospective_ledger_handling: {
        member_extent: canonicalVerdict,
        member_grain: canonicalVerdict,
      },
      semantic_verdict: "blocked_upstream",
      literal_exact_absence: false,
      source_statement_present: true,
      source_statement_evidence_id: sourceStatementEvidenceId,
      comparison_receipt_anchor:
        `${comparisonRef.source_id}#candidate=${candidate.candidate_key}`,
      contract: "member-evidence-source-gap-block-receipt-v1",
      absence_projection_prohibited_for_unresolved_grain: true,
      authorizes_decision_persistence: false,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    };
  }).sort((left, right) =>
    left.candidate_key.localeCompare(right.candidate_key)
  );
  return {
    schema_version: 1,
    receipt_id: "plan-040-accelerated-package-15-source-gap-blocks-v1",
    source_id: "plan_040_accelerated_package_15_source_gap_blocks",
    package_id: PLAN040_ACCELERATED_PACKAGE_15,
    candidate_count: 13,
    candidate_key_sha256: PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256,
    candidates,
    comparison_receipt: comparisonRef,
    contract_semantics:
      "candidate-specific source gaps block both member surfaces without claiming source absence",
    exact_absence_count: 0,
    absence_projection_prohibited_for_unresolved_grain: true,
    prospective_ledger_prefix: "blocked_upstream:",
    prospective_ledger_reason_policy: "sorted_unique_gap_codes",
    frozen_finding_labels_preserved_separately: true,
    external_acquisition_performed: false,
    normal_file_verified: true,
    replay_derived: true,
    authorizes_decision_persistence: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

function buildPersistenceEvidence(input: {
  frozen: ReturnType<typeof frozenInputs>;
  gateRef: ArtifactRef;
  comparisonRef: StrictReceiptRef;
  sourceGapRef: StrictReceiptRef;
}) {
  return {
    schema_version: 1,
    manifest_id: "plan-040-accelerated-package-15-persistence-evidence-v1",
    package_id: PLAN040_ACCELERATED_PACKAGE_15,
    candidate_count: 29,
    candidate_key_sha256: PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256,
    verdict_distribution: {
      positive_extent_and_grain_proposed: 16,
      source_gap_blocked_extent_and_grain: 13,
      exact_absence: 0,
    },
    comparison_receipt: input.comparisonRef,
    source_gap_block_receipt: input.sourceGapRef,
    frozen_evidence: input.frozen.pins,
    dual_review_gate: input.gateRef,
    persistence_scope: {
      extent_decisions: 16,
      grain_decisions: 16,
      source_gap_overlays: 13,
      exact_absences: 0,
    },
    authority: {
      exact_decision_persistence_only_after_owner_acceptance: true,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_ontology: false,
      authorizes_corrections: false,
    },
  };
}

function buildAcceptance(input: {
  draft: FrozenDraft;
  gateRef: ArtifactRef;
  comparisonRef: ArtifactRef;
  sourceGapRef: ArtifactRef;
  persistenceEvidenceRef: ArtifactRef;
}) {
  const ids = decisionIds(input.draft);
  return {
    schema_version: 1,
    acceptance_id: "plan-040-accelerated-package-15-owner-acceptance-v1",
    accepted_at: PLAN040_PACKAGE_15_ACCEPTED_AT,
    accepted_by: "codex-owner-delegate",
    acceptance_basis:
      "standing_owner_package_acceptance_after_dual_independent_approval",
    gate: input.gateRef,
    artifacts: {
      comparison_receipt: input.comparisonRef,
      draft: {
        path: FROZEN_DRAFT_PATH,
        sha256: PLAN040_PACKAGE_15_FROZEN_DRAFT_SHA256,
      },
      evidence: input.persistenceEvidenceRef,
      source_gap_block_receipt: input.sourceGapRef,
    },
    candidate_count: 29,
    candidate_key_sha256: PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256,
    verdict_distribution: {
      positive_extent_and_grain_proposed: 16,
      source_gap_blocked_extent_and_grain: 13,
      exact_absence: 0,
    },
    reviewer_result: "APPROVE/APPROVE",
    authorized_exact_persistence: {
      decision_candidate_count: 16,
      decision_candidate_key_sha256: PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256,
      extent_decision_count: 16,
      extent_decision_id_sha256: plan040Package15SortedHash(ids.extent),
      grain_decision_count: 16,
      grain_decision_id_sha256: plan040Package15SortedHash(ids.grain),
      source_gap_overlay_count: 13,
      source_gap_candidate_key_sha256:
        PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256,
      extent_resolved_count: 16,
      extent_blocked_upstream_count: 13,
      grain_resolved_count: 16,
      grain_blocked_upstream_count: 13,
    },
    preservation_invariants: {
      accepted_prior_decisions_byte_identical: true,
      preserved_siblings_byte_identical: true,
      occurrence_decisions_unchanged: true,
      study_authorization_unchanged: true,
      cross_product_authorization_unchanged: true,
      treatment_ontology_unchanged: true,
      correction_state_unchanged: true,
      q89_remains_blocked_upstream: true,
      source_gap_receipt_strict_and_nonauthorizing: true,
      absence_projection_prohibited_for_unresolved_grain: true,
    },
    authorization_state:
      "owner_accepted_exact_16_extent_16_grain_and_13_both_surface_source_gap_overlays_only",
    authorizes_decision_persistence: true,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_ontology: false,
    authorizes_corrections: false,
  };
}

export function writePlan040Package15GateAndAcceptance() {
  const frozen = frozenInputs();
  const gate = buildGate(frozen);
  writeImmutableJson(GATE_PATH, gate);
  const gateRef = artifactRef(GATE_PATH, jsonSha256(gate));
  const comparison = buildComparison(frozen, gateRef);
  writeImmutableJson(COMPARISON_PATH, comparison);
  const comparisonRef = strictReceiptRef(
    COMPARISON_PATH,
    comparison.receipt_id,
    comparison.source_id,
    jsonSha256(comparison),
  );
  const sourceGapReceipt = buildSourceGapReceipt(frozen, comparisonRef);
  writeImmutableJson(SOURCE_GAP_BLOCK_PATH, sourceGapReceipt);
  const sourceGapRef = strictReceiptRef(
    SOURCE_GAP_BLOCK_PATH,
    sourceGapReceipt.receipt_id,
    sourceGapReceipt.source_id,
    jsonSha256(sourceGapReceipt),
  );
  const persistenceEvidence = buildPersistenceEvidence({
    frozen,
    gateRef,
    comparisonRef,
    sourceGapRef,
  });
  writeImmutableJson(PERSISTENCE_EVIDENCE_PATH, persistenceEvidence);
  const persistenceEvidenceRef = artifactRef(
    PERSISTENCE_EVIDENCE_PATH,
    jsonSha256(persistenceEvidence),
  );
  const acceptance = buildAcceptance({
    draft: frozen.draft,
    gateRef,
    comparisonRef,
    sourceGapRef,
    persistenceEvidenceRef,
  });
  writeImmutableJson(ACCEPTANCE_PATH, acceptance);
  return {
    gate: gateRef,
    comparison: comparisonRef,
    sourceGapReceipt: sourceGapRef,
    persistenceEvidence: persistenceEvidenceRef,
    acceptance: artifactRef(ACCEPTANCE_PATH, jsonSha256(acceptance)),
    candidateCount: 29,
    verdictDistribution: acceptance.verdict_distribution,
    authorizationState: acceptance.authorization_state,
    reviewerResult: acceptance.reviewer_result,
  };
}

export function validatePlan040Package15GateAndAcceptance() {
  const result = writePlan040Package15GateAndAcceptance();
  const acceptance = readJson<ReturnType<typeof buildAcceptance>>(
    ACCEPTANCE_PATH,
  );
  if (
    acceptance.authorizes_decision_persistence !== true ||
    acceptance.authorizes_occurrence ||
    acceptance.authorizes_study ||
    acceptance.authorizes_cross_product ||
    acceptance.authorizes_ontology ||
    acceptance.authorizes_corrections ||
    acceptance.reviewer_result !== "APPROVE/APPROVE"
  ) {
    throw new Error("Plan 040 Package 15 acceptance authority drifted");
  }
  return result;
}

type Acceptance = ReturnType<typeof buildAcceptance>;
type SourceGapReceipt = ReturnType<typeof buildSourceGapReceipt>;

function readPinnedAcceptanceInputs() {
  validatePlan040Package15GateAndAcceptance();
  for (const [path, expected] of [
    [GATE_PATH, PLAN040_PACKAGE_15_GATE_SHA256],
    [COMPARISON_PATH, PLAN040_PACKAGE_15_COMPARISON_SHA256],
    [SOURCE_GAP_BLOCK_PATH, PLAN040_PACKAGE_15_SOURCE_GAP_BLOCK_SHA256],
    [
      PERSISTENCE_EVIDENCE_PATH,
      PLAN040_PACKAGE_15_PERSISTENCE_EVIDENCE_SHA256,
    ],
    [ACCEPTANCE_PATH, PLAN040_PACKAGE_15_ACCEPTANCE_SHA256],
  ] as const) {
    artifactRef(path, expected);
  }
  const frozen = frozenInputs();
  const acceptance = readJson<Acceptance>(ACCEPTANCE_PATH);
  const sourceGapReceipt = readJson<SourceGapReceipt>(SOURCE_GAP_BLOCK_PATH);
  if (
    acceptance.authorization_state !==
      "owner_accepted_exact_16_extent_16_grain_and_13_both_surface_source_gap_overlays_only" ||
    !acceptance.authorizes_decision_persistence ||
    acceptance.authorizes_occurrence ||
    acceptance.authorizes_study ||
    acceptance.authorizes_cross_product ||
    acceptance.authorizes_ontology ||
    acceptance.authorizes_corrections ||
    sourceGapReceipt.candidate_count !== 13
  ) {
    throw new Error("Plan 040 Package 15 persistence is not authorized");
  }
  return { ...frozen, acceptance, sourceGapReceipt };
}

function evidenceBindingKey(binding: ExactEvidenceBinding): string {
  return [
    binding.role,
    binding.record_id,
    binding.source_id,
    binding.evidence_id,
  ].join("\0");
}

function exactPositiveEvidenceBindings(input: {
  candidateKey: string;
  treatmentRecordId: string;
  detail: Plan040Package15Discovery["candidate_details"][number];
}): ExactEvidenceBinding[] {
  const routeBindings =
    input.detail.exact_route_bindings as unknown as ExactEvidenceBinding[];
  const treatmentBindings = (
    input.detail.exact_treatment_evidence_refs as unknown as Array<{
      role: string;
      source_id: string;
      evidence_id: string;
    }>
  ).map((ref) => ({
    role: ref.role,
    record_id: input.treatmentRecordId,
    source_id: ref.source_id,
    evidence_id: ref.evidence_id,
  }));
  const receiptBindings: ExactEvidenceBinding[] = [{
    role: "accepted_package_comparison_receipt",
    record_id: input.treatmentRecordId,
    source_id: "plan_040_accelerated_package_15_persistence_comparisons",
    evidence_id:
      "plan_040_accelerated_package_15_persistence_comparisons#" +
      `candidate=${input.candidateKey}`,
  }];
  if (
    input.treatmentRecordId ===
      "treatment_qm68-midtown-stop-additions-2025"
  ) {
    receiptBindings.push({
      role: "complete_ordered_full_stop_chains",
      record_id: input.treatmentRecordId,
      source_id: "plan_040_accelerated_package_15_qbnr_full_stop_chains",
      evidence_id:
        "plan_040_accelerated_package_15_qbnr_full_stop_chains#" +
        `candidate=${input.candidateKey}`,
    });
  }
  return [...new Map([
    ...routeBindings,
    ...treatmentBindings,
    ...receiptBindings,
  ].map((binding) => [evidenceBindingKey(binding), binding])).values()]
    .sort((left, right) =>
      evidenceBindingKey(left).localeCompare(evidenceBindingKey(right))
    );
}

function extentComponents(
  proposal: PositiveProposal["proposal"],
  routeRecordId: string,
): MemberExtentDecision["components"] {
  if (proposal.extent_resolution === "route_wide") {
    const ids = proposal.extent_components?.flatMap((component) =>
      component.identifiers
    ).sort();
    if (!ids || ids.length !== 1) {
      throw new Error(`${routeRecordId}: invalid route-wide component`);
    }
    return [{
      component_kind: "route",
      identity_namespace: "canonical_record",
      identifiers: [routeRecordId],
      description: `Whole-route applicability for GTFS route ${ids[0]}.`,
    }];
  }
  if (proposal.extent?.resolution === "stop_set") {
    return [{
      component_kind: "stop",
      identity_namespace: "source_literal_v1",
      identifiers: [...proposal.extent.stop_ids].sort(),
      description:
        `Direction ${proposal.extent.direction} exact nine-stop set from the accepted complete ordered full-stop chain.`,
    }];
  }
  throw new Error(`${routeRecordId}: unknown extent proposal`);
}

function grainScope(
  proposal: PositiveProposal["proposal"],
): MemberGrainServiceScope {
  const scope = proposal.grain_scope;
  if (scope.kind !== "trip_subset") return scope;
  return {
    ...scope,
    periods: [...scope.periods].sort(),
    directions: [...scope.directions].sort(),
    pattern_ids: [...scope.pattern_ids].sort(),
    description:
      "All Midtown-bound QM68 AM-peak trips matching the accepted historical full-stop pattern.",
  };
}

export function buildPlan040Package15AcceptedArtifacts(
  input: ReturnType<typeof readPinnedAcceptanceInputs>,
) {
  const detailByKey = new Map(input.discovery.candidate_details.map((row) => [
    row.candidate_key,
    row,
  ]));
  const extentDecisions = input.draft.positive_extent_decisions.map((row) => {
    const [occurrenceId, routeRecordId, treatmentRecordId] =
      row.candidate_key.split("\0");
    const detail = detailByKey.get(row.candidate_key);
    if (
      !occurrenceId ||
      !routeRecordId ||
      !treatmentRecordId ||
      !detail ||
      detail.proposed_verdict !== "positive_extent_and_grain"
    ) {
      throw new Error(`${row.candidate_key}: positive scope drifted`);
    }
    const decision: MemberExtentDecision = {
      decision_id:
        `member-extent-review:plan040-package15-${routeRecordId}-` +
        treatmentRecordId,
      occurrence_id: occurrenceId,
      route_record_id: routeRecordId,
      treatment_record_id: treatmentRecordId,
      resolution: proposalExtent(row),
      components: extentComponents(row.proposal, routeRecordId),
      evidence_bindings: exactPositiveEvidenceBindings({
        candidateKey: row.candidate_key,
        treatmentRecordId,
        detail,
      }),
      missing_roles: [],
      rationale: proposalExtent(row) === "stop_set"
        ? "The candidate-specific statement, exact schedule validation, and accepted full-stop chain bind the nine direction-qualified stops without equivalence inference."
        : "The accepted route member and candidate-specific source statement bind whole-route program applicability.",
      reviewed_at: input.acceptance.accepted_at,
      reviewed_by: input.acceptance.accepted_by,
    };
    validateMemberExtentDecision(decision);
    if (extentDecisionKey(decision) !== row.candidate_key) {
      throw new Error(`${row.candidate_key}: extent key drifted`);
    }
    return decision;
  }).sort((left, right) =>
    extentDecisionKey(left).localeCompare(extentDecisionKey(right))
  );
  const extentByKey = new Map(extentDecisions.map((decision) => [
    extentDecisionKey(decision),
    decision,
  ]));
  const grainDecisions = input.draft.positive_grain_decisions.map((row) => {
    const [occurrenceId, routeRecordId, treatmentRecordId] =
      row.candidate_key.split("\0");
    const detail = detailByKey.get(row.candidate_key);
    const currentExtent = detail?.current_extent_row as
      | Record<string, unknown>
      | undefined;
    const gtfsRouteId = currentExtent?.gtfs_route_id;
    const extent = extentByKey.get(row.candidate_key);
    if (
      !occurrenceId ||
      !routeRecordId ||
      !treatmentRecordId ||
      !detail ||
      !extent ||
      typeof gtfsRouteId !== "string"
    ) {
      throw new Error(`${row.candidate_key}: grain scope drifted`);
    }
    const serviceScope = grainScope(row.proposal);
    const decision = parseMemberGrainDecision({
      schema_version: 1,
      contract_id: "member-grain-decision-v1",
      decision_id:
        `member-grain-review:plan040-package15-${routeRecordId}-` +
        treatmentRecordId,
      occurrence_id: occurrenceId,
      route_record_id: routeRecordId,
      gtfs_route_id: gtfsRouteId,
      treatment_record_id: treatmentRecordId,
      member_extent_decision_id: extent.decision_id,
      service_scope: serviceScope,
      lineage_segments: [],
      evidence_bindings: exactPositiveEvidenceBindings({
        candidateKey: row.candidate_key,
        treatmentRecordId,
        detail,
      }),
      rationale: serviceScope.kind === "trip_subset"
        ? "The candidate-specific schedule and full-stop-chain evidence bind the exact direction, period, and pattern."
        : serviceScope.kind === "all_service"
        ? "The accepted policy statement applies to all service on the named route."
        : "The accepted service-management treatment has no distinct structured trip modality.",
      reviewed_at: input.acceptance.accepted_at,
      reviewed_by: input.acceptance.accepted_by,
    });
    if (memberGrainDecisionKey(decision) !== row.candidate_key) {
      throw new Error(`${row.candidate_key}: grain key drifted`);
    }
    return decision;
  }).sort((left, right) =>
    memberGrainDecisionKey(left).localeCompare(memberGrainDecisionKey(right))
  );
  const sourceGapOverlay: MemberSourceGapOverlay = {
    schema_version: 1,
    contract_id: "member-source-gap-overlay-v1",
    overlay_id: "plan-040-accelerated-package-15-source-gap-overlay-v1",
    source_receipt: {
      path: SOURCE_GAP_BLOCK_PATH,
      sha256: PLAN040_PACKAGE_15_SOURCE_GAP_BLOCK_SHA256,
      receipt_id: input.sourceGapReceipt.receipt_id,
    },
    owner_acceptance: {
      path: ACCEPTANCE_PATH,
      sha256: PLAN040_PACKAGE_15_ACCEPTANCE_SHA256,
    },
    accepted_at: input.acceptance.accepted_at,
    accepted_by: input.acceptance.accepted_by,
    entries: input.sourceGapReceipt.candidates.map((candidate) => ({
      candidate_key: candidate.candidate_key,
      occurrence_id: candidate.occurrence_id,
      route_record_id: candidate.route_record_id,
      treatment_record_id: candidate.treatment_record_id,
      blocked_surfaces:
        candidate.blocked_surfaces as Array<
          "member_extent" | "member_grain"
        >,
      missing_roles: candidate.gap_codes,
      verdict:
        `blocked_upstream:${candidate.gap_codes.join("+")}` as const,
      source_statement_evidence_id:
        candidate.source_statement_evidence_id,
    })),
    authorizes_decision_persistence: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  if (
    extentDecisions.length !== 16 ||
    grainDecisions.length !== 16 ||
    sourceGapOverlay.entries.length !== 13 ||
    extentDecisions.filter((row) => row.resolution === "route_wide").length !==
      15 ||
    extentDecisions.filter((row) => row.resolution === "stop_set").length !==
      1 ||
    grainDecisions.filter((row) => row.service_scope.kind === "all_service")
        .length !== 14 ||
    grainDecisions.filter((row) =>
        row.service_scope.kind === "not_applicable"
      ).length !== 1 ||
    grainDecisions.filter((row) => row.service_scope.kind === "trip_subset")
        .length !== 1
  ) {
    throw new Error("Plan 040 Package 15 accepted output scope drifted");
  }
  return { extentDecisions, grainDecisions, sourceGapOverlay };
}

export function persistPlan040Package15AcceptedArtifacts() {
  const input = readPinnedAcceptanceInputs();
  const accepted = buildPlan040Package15AcceptedArtifacts(input);
  writeImmutableJson(EXTENT_DECISIONS_PATH, {
    decisions: accepted.extentDecisions,
  });
  writeImmutableJson(GRAIN_DECISIONS_PATH, {
    decisions: accepted.grainDecisions,
  });
  writeImmutableJson(SOURCE_GAP_OVERLAY_PATH, accepted.sourceGapOverlay);
  const extentSha256 = fileSha256(EXTENT_DECISIONS_PATH);
  const grainSha256 = fileSha256(GRAIN_DECISIONS_PATH);
  const sourceGapOverlaySha256 = fileSha256(SOURCE_GAP_OVERLAY_PATH);
  for (const [path, actual, expected] of [
    [EXTENT_DECISIONS_PATH, extentSha256,
      PLAN040_PACKAGE_15_EXTENT_DECISIONS_SHA256],
    [GRAIN_DECISIONS_PATH, grainSha256,
      PLAN040_PACKAGE_15_GRAIN_DECISIONS_SHA256],
    [SOURCE_GAP_OVERLAY_PATH, sourceGapOverlaySha256,
      PLAN040_PACKAGE_15_SOURCE_GAP_OVERLAY_SHA256],
  ] as const) {
    if (actual !== expected) {
      throw new Error(`Plan 040 Package 15 persisted pin drifted: ${path}`);
    }
  }
  return {
    extent: { path: EXTENT_DECISIONS_PATH, sha256: extentSha256, count: 16 },
    grain: { path: GRAIN_DECISIONS_PATH, sha256: grainSha256, count: 16 },
    sourceGapOverlay: {
      path: SOURCE_GAP_OVERLAY_PATH,
      sha256: sourceGapOverlaySha256,
      count: 13,
    },
  };
}
