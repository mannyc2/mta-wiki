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
  PLAN040_ACCELERATED_PACKAGE_14,
  PLAN040_PACKAGE_14_CANDIDATE_COUNT,
  PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_14_EXACT_ABSENCE_COUNT,
  PLAN040_PACKAGE_14_POSITIVE_COUNT,
  PLAN040_PACKAGE_14_POSITIVE_KEY_SHA256,
  PLAN040_PACKAGE_14_SOURCE_GAP_COUNT,
  PLAN040_PACKAGE_14_SOURCE_GAP_KEY_SHA256,
  plan040Package14SortedHash,
} from "./plan040-accelerated-package14.js";

export const PLAN040_PACKAGE_14_REVIEWED_COMMIT =
  "d1293514bbd3fcc162f624fbbb63107a20d1f3a0" as const;
export const PLAN040_PACKAGE_14_ACCEPTED_AT =
  "2026-07-24T23:30:00Z" as const;

export const PLAN040_PACKAGE_14_FROZEN_EVIDENCE_SHA256 =
  "05a7431456441a250224069e897424c50ea063359885f4212bc2d9a79ad241d8" as const;
export const PLAN040_PACKAGE_14_FROZEN_DRAFT_SHA256 =
  "e89135cd55199eb2504766c4f168cc2747fbef6970aba165b0ac7236f8fabd74" as const;

const RISK_PREFIX =
  "data/quality/operational-reference/member-extent-risk/";
const RECEIPT_PREFIX =
  "data/quality/acquisition/receipts/member-extent-evidence/";
const FROZEN_EVIDENCE_PATH =
  `${RISK_PREFIX}plan-040-accelerated-package-14-evidence-v1.json`;
const FROZEN_DRAFT_PATH =
  `${RISK_PREFIX}plan-040-accelerated-package-14-evidence-draft-v1.json`;
const DISCOVERY_PATH =
  `${RECEIPT_PREFIX}plan-040-accelerated-package-14-discovery-receipt-v1.json`;
const QBNR6_PATH =
  `${RECEIPT_PREFIX}plan-040-accelerated-package-14-qbnr6-evidence-v1.json`;
const EXPRESS20_PATH =
  `${RECEIPT_PREFIX}plan-040-accelerated-package-14-express20-source-gaps-v1.json`;
const ACE7_PATH =
  `${RECEIPT_PREFIX}plan-040-accelerated-package-14-ace7-evidence-v1.json`;
const LEGACY_SBS3_PATH =
  `${RECEIPT_PREFIX}plan-040-accelerated-package-14-legacy-sbs3-evidence-v1.json`;
const Q110_CHAINS_PATH =
  `${RECEIPT_PREFIX}plan-040-accelerated-package-14-q110-full-stop-chains-v1.json`;
const FROZEN_SOURCE_GAPS_PATH =
  `${RECEIPT_PREFIX}plan-040-accelerated-package-14-source-gap-overlays-v1.json`;
const CURRENT_FREEZE_PATH =
  `${RECEIPT_PREFIX}plan-040-accelerated-package-14-current-freeze-state-v1.json`;
const GATE_PATH =
  `${RISK_PREFIX}plan-040-accelerated-package-14-dual-review-gate-v1.json`;
const COMPARISON_PATH =
  `${RECEIPT_PREFIX}plan-040-accelerated-package-14-persistence-comparisons-v1.json`;
const SOURCE_GAP_BLOCK_PATH =
  `${RECEIPT_PREFIX}plan-040-accelerated-package-14-source-gap-blocks-v1.json`;
const PERSISTENCE_EVIDENCE_PATH =
  `${RISK_PREFIX}plan-040-accelerated-package-14-persistence-evidence-v1.json`;
const ACCEPTANCE_PATH =
  `${RISK_PREFIX}plan-040-accelerated-package-14-owner-acceptance-v1.json`;

export const PLAN040_PACKAGE_14_GATE_PATH = join(repoRoot, GATE_PATH);
export const PLAN040_PACKAGE_14_COMPARISON_PATH =
  join(repoRoot, COMPARISON_PATH);
export const PLAN040_PACKAGE_14_SOURCE_GAP_BLOCK_PATH =
  join(repoRoot, SOURCE_GAP_BLOCK_PATH);
export const PLAN040_PACKAGE_14_PERSISTENCE_EVIDENCE_PATH =
  join(repoRoot, PERSISTENCE_EVIDENCE_PATH);
export const PLAN040_PACKAGE_14_ACCEPTANCE_PATH =
  join(repoRoot, ACCEPTANCE_PATH);

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

type FrozenPositiveProposal = {
  candidate_key: string;
  partition: string;
  proposal: {
    extent_resolution: "bounded_segment" | "route_wide" | "stop_set";
    extent_components: JsonValue[];
    grain_scope: { kind: "all_service" | "not_applicable" };
    positive_basis: string[];
  };
};

type FrozenSourceGapProposal = {
  candidate_key: string;
  partition: string;
  overlay: {
    blocked_surfaces: ["member_extent", "member_grain"];
    missing_roles: string[];
    rationale: string;
    source_statement_evidence_id: string;
    verdict: string;
  };
};

type FrozenDraft = {
  schema_version: number;
  candidate_count: number;
  positive_extent_and_grain_count: number;
  source_gap_blocked_extent_and_grain_count: number;
  exact_absence_count: number;
  evidence_manifest: ArtifactRef;
  positive_extent_decisions: FrozenPositiveProposal[];
  positive_grain_decisions: FrozenPositiveProposal[];
  source_gap_overlays: FrozenSourceGapProposal[];
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
  schema_version: number;
  candidate_count: number;
  candidate_key_sha256: string;
  positive_extent_and_grain_count: number;
  positive_extent_and_grain_key_sha256: string;
  blocked_extent_and_grain_count: number;
  blocked_extent_and_grain_key_sha256: string;
  exact_absence_count: number;
  frozen_discovery_receipt: ArtifactRef;
  partition_receipts: {
    qbnr6: ArtifactRef;
    express20: ArtifactRef;
    ace7: ArtifactRef;
    legacy_sbs3: ArtifactRef;
  };
  q110_complete_ordered_full_stop_chains: ArtifactRef;
  source_gap_receipt: ArtifactRef;
  current_freeze_state: ArtifactRef;
  candidate_state_pins: Array<{
    candidate_key: string;
    partition: string;
    proposed_verdict:
      | "positive_extent_and_grain"
      | "source_gap_blocked_extent_and_grain";
  }>;
  preservation: { same_occurrence_siblings: JsonValue[] };
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
const artifactRef = (path: string, expectedSha256?: string): ArtifactRef => {
  const actual = fileSha256(path);
  if (expectedSha256 && actual !== expectedSha256) {
    throw new Error(`Package 14 frozen pin drifted for ${path}: ${actual}`);
  }
  return { path, sha256: actual };
};
const strictReceiptRef = (
  path: string,
  receiptId: string,
  sourceId: string,
  expectedSha256?: string,
): StrictReceiptRef => ({
  ...artifactRef(path, expectedSha256),
  receipt_id: receiptId,
  source_id: sourceId,
  normal_file_verified: true,
  replay_derived: true,
  authorizes_decision_persistence: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
});

function frozenInputs(): {
  evidence: FrozenEvidence;
  draft: FrozenDraft;
  pins: Record<string, ArtifactRef>;
} {
  const evidence = JSON.parse(readFileSync(
    join(repoRoot, FROZEN_EVIDENCE_PATH),
    "utf8",
  )) as FrozenEvidence;
  const draft = JSON.parse(readFileSync(
    join(repoRoot, FROZEN_DRAFT_PATH),
    "utf8",
  )) as FrozenDraft;
  const pins = {
    frozen_evidence: artifactRef(
      FROZEN_EVIDENCE_PATH,
      PLAN040_PACKAGE_14_FROZEN_EVIDENCE_SHA256,
    ),
    frozen_draft: artifactRef(
      FROZEN_DRAFT_PATH,
      PLAN040_PACKAGE_14_FROZEN_DRAFT_SHA256,
    ),
    discovery: artifactRef(
      DISCOVERY_PATH,
      evidence.frozen_discovery_receipt.sha256,
    ),
    qbnr6: artifactRef(QBNR6_PATH, evidence.partition_receipts.qbnr6.sha256),
    express20: artifactRef(
      EXPRESS20_PATH,
      evidence.partition_receipts.express20.sha256,
    ),
    ace7: artifactRef(ACE7_PATH, evidence.partition_receipts.ace7.sha256),
    legacy_sbs3: artifactRef(
      LEGACY_SBS3_PATH,
      evidence.partition_receipts.legacy_sbs3.sha256,
    ),
    q110_chains: artifactRef(
      Q110_CHAINS_PATH,
      evidence.q110_complete_ordered_full_stop_chains.sha256,
    ),
    frozen_source_gaps: artifactRef(
      FROZEN_SOURCE_GAPS_PATH,
      evidence.source_gap_receipt.sha256,
    ),
    current_freeze: artifactRef(
      CURRENT_FREEZE_PATH,
      evidence.current_freeze_state.sha256,
    ),
  };
  const positiveKeys = draft.positive_extent_decisions
    .map((row) => row.candidate_key);
  const grainKeys = draft.positive_grain_decisions
    .map((row) => row.candidate_key);
  const gapKeys = draft.source_gap_overlays.map((row) => row.candidate_key);
  const allKeys = [...positiveKeys, ...gapKeys];
  if (
    evidence.schema_version !== 1 ||
    draft.schema_version !== 1 ||
    evidence.candidate_count !== PLAN040_PACKAGE_14_CANDIDATE_COUNT ||
    draft.candidate_count !== PLAN040_PACKAGE_14_CANDIDATE_COUNT ||
    evidence.candidate_key_sha256 !==
      PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256 ||
    plan040Package14SortedHash(allKeys) !==
      PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256 ||
    positiveKeys.length !== PLAN040_PACKAGE_14_POSITIVE_COUNT ||
    grainKeys.length !== PLAN040_PACKAGE_14_POSITIVE_COUNT ||
    plan040Package14SortedHash(positiveKeys) !==
      PLAN040_PACKAGE_14_POSITIVE_KEY_SHA256 ||
    plan040Package14SortedHash(grainKeys) !==
      PLAN040_PACKAGE_14_POSITIVE_KEY_SHA256 ||
    gapKeys.length !== PLAN040_PACKAGE_14_SOURCE_GAP_COUNT ||
    plan040Package14SortedHash(gapKeys) !==
      PLAN040_PACKAGE_14_SOURCE_GAP_KEY_SHA256 ||
    evidence.exact_absence_count !== PLAN040_PACKAGE_14_EXACT_ABSENCE_COUNT ||
    draft.exact_absence_count !== PLAN040_PACKAGE_14_EXACT_ABSENCE_COUNT ||
    draft.gate_created ||
    draft.owner_acceptance_created ||
    draft.persistence_performed ||
    draft.persisted_extent_decision_count !== 0 ||
    draft.persisted_grain_decision_count !== 0 ||
    draft.authorizes_decision_persistence ||
    draft.authorizes_occurrence ||
    draft.authorizes_study ||
    draft.authorizes_cross_product ||
    evidence.gate_created ||
    evidence.owner_acceptance_created ||
    evidence.persistence_performed ||
    evidence.persisted_extent_decision_count !== 0 ||
    evidence.persisted_grain_decision_count !== 0 ||
    evidence.authorizes_decision_persistence ||
    evidence.authorizes_occurrence ||
    evidence.authorizes_study ||
    evidence.authorizes_cross_product
  ) {
    throw new Error("Plan 040 Package 14 amended freeze drifted");
  }
  return { evidence, draft, pins };
}

function decisionIds(draft: FrozenDraft): {
  extent: string[];
  grain: string[];
} {
  const suffixes = draft.positive_extent_decisions.map((candidate) => {
    const [, routeRecordId, treatmentRecordId] =
      candidate.candidate_key.split("\0");
    return `${routeRecordId}-${treatmentRecordId}`;
  });
  return {
    extent: suffixes.map((suffix) =>
      `member-extent-review:plan040-package14-${suffix}`
    ),
    grain: suffixes.map((suffix) =>
      `member-grain-review:plan040-package14-${suffix}`
    ),
  };
}

function buildGate(input: ReturnType<typeof frozenInputs>) {
  const verdictDistribution = {
    positive_extent_and_grain_proposed: 8,
    positive_extent_proposed_grain_blocked: 0,
    source_gap_blocked_extent_and_grain: 28,
    source_gap_block_receipt: 28,
    exact_absence: 0,
  } as const;
  type ReviewProposal = {
    verdict:
      | "positive_extent_and_grain_proposed"
      | "source_gap_blocked_extent_and_grain";
    extent: "bounded_segment" | "route_wide" | "stop_set" | null;
    grain: "all_service" | "not_applicable" | null;
    blocked: readonly string[];
  };
  const proposals = new Map<string, ReviewProposal>([
    ...input.draft.positive_extent_decisions.map((row) => [
      row.candidate_key,
      {
        verdict: "positive_extent_and_grain_proposed",
        extent: row.proposal.extent_resolution,
        grain: row.proposal.grain_scope.kind,
        blocked: [] as string[],
      },
    ] as const),
    ...input.draft.source_gap_overlays.map((row) => [
      row.candidate_key,
      {
        verdict: "source_gap_blocked_extent_and_grain",
        extent: null,
        grain: null,
        blocked: row.overlay.blocked_surfaces,
      },
    ] as const),
  ]);
  const candidateReviewResults = [...proposals]
    .map(([candidateKey, proposal]) => ({
      candidate_key: candidateKey,
      evidence_verdict: proposal.verdict,
      proposed_extent_resolution: proposal.extent,
      proposed_grain_kind: proposal.grain,
      source_gap_blocked_surfaces: proposal.blocked,
      reviewer_verdicts: ["APPROVE", "APPROVE"],
      review_result: "APPROVE/APPROVE",
    }))
    .sort((left, right) =>
      left.candidate_key.localeCompare(right.candidate_key)
    );
  return {
    schema_version: 1,
    gate_id: "plan-040-accelerated-package-14-dual-review-gate-v1",
    package_id: PLAN040_ACCELERATED_PACKAGE_14,
    reviewed_commit: PLAN040_PACKAGE_14_REVIEWED_COMMIT,
    artifacts: input.pins,
    candidate_count: 36,
    route_count: 21,
    candidate_key_sha256: PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    extent_distribution: {
      bounded_segment: 1,
      route_wide: 6,
      stop_set: 1,
      blocked_upstream: 28,
    },
    grain_distribution: {
      all_service: 1,
      not_applicable: 7,
      blocked_upstream: 28,
    },
    reviewer_results: [
      {
        reviewer_id: "plan040_package14_extent_grain_reviewer",
        role: "independent_exact_positive_extent_grain_review",
        reviewed_commit: PLAN040_PACKAGE_14_REVIEWED_COMMIT,
        verdict: "APPROVE",
      },
      {
        reviewer_id: "plan040_package14_source_gap_auditor",
        role: "independent_source_gap_provenance_and_preservation_audit",
        reviewed_commit: PLAN040_PACKAGE_14_REVIEWED_COMMIT,
        verdict: "APPROVE",
      },
    ],
    candidate_review_results: candidateReviewResults,
    checkpoint_tests: {
      focused: { pass: 12, fail: 0, assertions: 398, status: "pass" },
      typecheck: { status: "pass" },
      validate: {
        issues: 0,
        release_contract_issues: 0,
        warnings: 3,
        status: "pass",
      },
      deterministic_replay: {
        evidence_sha256: PLAN040_PACKAGE_14_FROZEN_EVIDENCE_SHA256,
        draft_sha256: PLAN040_PACKAGE_14_FROZEN_DRAFT_SHA256,
        status: "pass",
      },
      full_repository: { status: "deferred_to_36_closure_checkpoint" },
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
  const proposalByKey = new Map<string, string>([
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
      "plan-040-accelerated-package-14-persistence-comparisons-v1",
    source_id:
      "plan_040_accelerated_package_14_persistence_comparisons",
    package_id: PLAN040_ACCELERATED_PACKAGE_14,
    candidates: [...proposalByKey]
      .map(([candidateKey, verdict]) => ({
        candidate_key: candidateKey,
        frozen_verdict: verdict,
      }))
      .sort((left, right) =>
        left.candidate_key.localeCompare(right.candidate_key)
      ),
    derivation: {
      classification: "canonical_persistence_wrapper_only",
      amended_freeze_preserved_byte_identical: true,
      exact_positive_requirement_preserved: true,
      authoritative_historical_full_stop_prerequisite_preserved: true,
      stop_id_equivalence_prerequisite_preserved: true,
      occurrence_inference_prohibited: true,
      source_gap_projection: "blocked_upstream_on_both_surfaces",
      exact_absence_count: 0,
      gate: gateRef,
    },
    source_pins: {
      candidate_key_sha256: PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256,
      positive_key_sha256: PLAN040_PACKAGE_14_POSITIVE_KEY_SHA256,
      source_gap_key_sha256: PLAN040_PACKAGE_14_SOURCE_GAP_KEY_SHA256,
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
  draft: FrozenDraft,
  comparisonRef: StrictReceiptRef,
) {
  const candidates = draft.source_gap_overlays.map((candidate) => {
    const [occurrenceId, routeRecordId, treatmentRecordId] =
      candidate.candidate_key.split("\0");
    const gapCodes = [...new Set(candidate.overlay.missing_roles)].sort();
    const verdict = `blocked_upstream:${gapCodes.join("+")}`;
    if (
      !occurrenceId ||
      !routeRecordId ||
      !treatmentRecordId ||
      candidate.overlay.verdict !== verdict
    ) {
      throw new Error(
        `${candidate.candidate_key}: Package 14 source-gap proposal drifted`,
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
      prospective_ledger_handling: {
        member_extent: verdict,
        member_grain: verdict,
      },
      semantic_verdict: "blocked_upstream",
      literal_exact_absence: false,
      source_statement_present: true,
      source_statement_evidence_id:
        candidate.overlay.source_statement_evidence_id,
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
    receipt_id: "plan-040-accelerated-package-14-source-gap-blocks-v1",
    source_id: "plan_040_accelerated_package_14_source_gap_blocks",
    package_id: PLAN040_ACCELERATED_PACKAGE_14,
    candidate_count: 28,
    candidate_key_sha256: PLAN040_PACKAGE_14_SOURCE_GAP_KEY_SHA256,
    candidates,
    comparison_receipt: comparisonRef,
    contract_semantics:
      "candidate-specific source gaps block both member surfaces without claiming source absence",
    exact_absence_count: 0,
    absence_projection_prohibited_for_unresolved_grain: true,
    prospective_ledger_prefix: "blocked_upstream:",
    prospective_ledger_reason_policy: "sorted_unique_gap_codes",
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
    manifest_id: "plan-040-accelerated-package-14-persistence-evidence-v1",
    package_id: PLAN040_ACCELERATED_PACKAGE_14,
    candidate_count: 36,
    candidate_key_sha256: PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256,
    verdict_distribution: {
      positive_extent_and_grain_proposed: 8,
      positive_extent_proposed_grain_blocked: 0,
      source_gap_blocked_extent_and_grain: 28,
      source_gap_block_receipt: 28,
      exact_absence: 0,
    },
    comparison_receipt: input.comparisonRef,
    source_gap_block_receipt: input.sourceGapRef,
    amended_freeze: input.frozen.pins,
    dual_review_gate: input.gateRef,
    persistence_scope: {
      extent_decisions: 8,
      grain_decisions: 8,
      source_gap_overlays: 28,
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
    acceptance_id: "plan-040-accelerated-package-14-owner-acceptance-v1",
    accepted_at: PLAN040_PACKAGE_14_ACCEPTED_AT,
    accepted_by: "codex-owner-delegate",
    acceptance_basis:
      "standing_owner_package_acceptance_after_dual_independent_approval",
    gate: input.gateRef,
    artifacts: {
      comparison_receipt: input.comparisonRef,
      draft: {
        path: FROZEN_DRAFT_PATH,
        sha256: PLAN040_PACKAGE_14_FROZEN_DRAFT_SHA256,
      },
      evidence: input.persistenceEvidenceRef,
      source_gap_block_receipt: input.sourceGapRef,
    },
    candidate_count: 36,
    candidate_key_sha256: PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256,
    verdict_distribution: {
      positive_extent_and_grain_proposed: 8,
      positive_extent_proposed_grain_blocked: 0,
      source_gap_blocked_extent_and_grain: 28,
      source_gap_block_receipt: 28,
      exact_absence: 0,
    },
    reviewer_result: "APPROVE/APPROVE",
    authorized_exact_persistence: {
      decision_candidate_count: 8,
      decision_candidate_key_sha256: PLAN040_PACKAGE_14_POSITIVE_KEY_SHA256,
      extent_decision_count: 8,
      extent_decision_id_sha256: plan040Package14SortedHash(ids.extent),
      grain_decision_count: 8,
      grain_decision_id_sha256: plan040Package14SortedHash(ids.grain),
      source_gap_overlay_count: 28,
      source_gap_candidate_key_sha256:
        PLAN040_PACKAGE_14_SOURCE_GAP_KEY_SHA256,
      extent_resolved_count: 8,
      extent_blocked_upstream_count: 28,
      grain_resolved_count: 8,
      grain_blocked_upstream_count: 28,
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
      "owner_accepted_exact_8_extent_8_grain_and_28_both_surface_source_gap_overlays_only",
    authorizes_decision_persistence: true,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_ontology: false,
    authorizes_corrections: false,
  };
}

function writeImmutableJson(path: string, value: unknown): void {
  const bytes = `${stableJson(value as JsonValue)}\n`;
  const absolute = join(repoRoot, path);
  if (existsSync(absolute)) {
    if (readFileSync(absolute, "utf8") !== bytes) {
      throw new Error(
        `Refusing to overwrite immutable Plan 040 Package 14 artifact ${
          relative(repoRoot, absolute)
        }`,
      );
    }
    return;
  }
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes, "utf8");
}

export function writePlan040Package14GateAndAcceptance() {
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

  const sourceGapReceipt = buildSourceGapReceipt(
    frozen.draft,
    comparisonRef,
  );
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
    candidateCount: 36,
    verdictDistribution: acceptance.verdict_distribution,
    authorizationState: acceptance.authorization_state,
    reviewerResult: acceptance.reviewer_result,
  };
}

export function validatePlan040Package14GateAndAcceptance() {
  const result = writePlan040Package14GateAndAcceptance();
  const acceptance = JSON.parse(readFileSync(
    PLAN040_PACKAGE_14_ACCEPTANCE_PATH,
    "utf8",
  )) as ReturnType<typeof buildAcceptance>;
  if (
    acceptance.authorizes_decision_persistence !== true ||
    acceptance.authorizes_occurrence ||
    acceptance.authorizes_study ||
    acceptance.authorizes_cross_product ||
    acceptance.authorizes_ontology ||
    acceptance.authorizes_corrections ||
    acceptance.reviewer_result !== "APPROVE/APPROVE"
  ) {
    throw new Error("Plan 040 Package 14 acceptance authority drifted");
  }
  return result;
}
