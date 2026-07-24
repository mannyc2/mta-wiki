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
  PLAN040_PACKAGE_10D_CANDIDATE_KEY_SHA256,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D,
  plan040Package10dReplayHash,
  type Plan040Package10dDraft,
} from "./plan040-qbnr-service-pattern-package10d.js";

export const PLAN040_PACKAGE_10D_APPROVED_COMMIT =
  "d7b599559fbab2831ced0a298d02d1d537a20304" as const;
export const PLAN040_PACKAGE_10D_EVIDENCE_SHA256 =
  "2420151d952fe8699a3db4d372f80dea215fb9df59598e87a57dd698d8811b2a" as const;
export const PLAN040_PACKAGE_10D_DRAFT_SHA256 =
  "c54bf0feb4808d2f49154b42332ff6ef894bc8a6c08c5c291f9702c03e42e40f" as const;
export const PLAN040_PACKAGE_10D_COMPARISON_RECEIPT_SHA256 =
  "76582c438e699c94418b76a86563a7b4fd1be13eb0677b9be8172dd3c45af39b" as const;

const PACKAGE_10D_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10d-evidence-v1.json";
const PACKAGE_10D_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10d-evidence-draft-v1.json";
const PACKAGE_10D_COMPARISON_RECEIPT_PATH =
  "data/quality/acquisition/receipts/member-extent-evidence/" +
  "plan-040-qbnr-service-pattern-package-10d-full-stop-equivalence-v1.json";
const PACKAGE_10D_GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10d-dual-review-gate-v1.json";
const PACKAGE_10D_ACCEPTANCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10d-owner-acceptance-v1.json";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D_DRAFT_PATH =
  join(repoRoot, PACKAGE_10D_DRAFT_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D_GATE_PATH =
  join(repoRoot, PACKAGE_10D_GATE_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D_ACCEPTANCE_PATH =
  join(repoRoot, PACKAGE_10D_ACCEPTANCE_PATH);

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const artifactPins = () => ({
  evidence: {
    path: PACKAGE_10D_EVIDENCE_PATH,
    sha256: PLAN040_PACKAGE_10D_EVIDENCE_SHA256,
  },
  draft: {
    path: PACKAGE_10D_DRAFT_PATH,
    sha256: PLAN040_PACKAGE_10D_DRAFT_SHA256,
  },
  comparison_receipt: {
    path: PACKAGE_10D_COMPARISON_RECEIPT_PATH,
    sha256: PLAN040_PACKAGE_10D_COMPARISON_RECEIPT_SHA256,
  },
});

export function buildPlan040Package10dGateAndAcceptance(input: {
  draft: Plan040Package10dDraft;
  acceptedAt: string;
}) {
  const candidates = input.draft.candidates;
  if (
    plan040Package10dReplayHash(input.draft as unknown as JsonValue) !==
      PLAN040_PACKAGE_10D_DRAFT_SHA256 ||
    input.draft.evidence_manifest.sha256 !==
      PLAN040_PACKAGE_10D_EVIDENCE_SHA256 ||
    input.draft.comparison_receipt.sha256 !==
      PLAN040_PACKAGE_10D_COMPARISON_RECEIPT_SHA256 ||
    input.draft.candidate_count !== 2 ||
    input.draft.route_count !== 2 ||
    input.draft.candidate_key_sha256 !==
      PLAN040_PACKAGE_10D_CANDIDATE_KEY_SHA256 ||
    candidates.length !== 2 ||
    candidates.some((candidate) =>
      candidate.evidence_verdict !==
        "positive_extent_and_grain_proposed" ||
      candidate.proposed_extent_decision.resolution !== "route_wide" ||
      candidate.proposed_grain_decision.service_scope.kind !==
        "trip_subset" ||
      stableJson(
        candidate.proposed_grain_decision.service_scope.periods as JsonValue,
      ) !== stableJson(["weekday"] as JsonValue) ||
      candidate.unresolved_gap_codes.length !== 0 ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence) ||
    input.draft.proposed_extent_decision_count !== 2 ||
    input.draft.proposed_grain_decision_count !== 2 ||
    input.draft.persisted_extent_decision_count !== 0 ||
    input.draft.persisted_grain_decision_count !== 0 ||
    input.draft.external_acquisition_performed ||
    input.draft.authorizes_occurrence ||
    input.draft.authorizes_study ||
    input.draft.authorizes_cross_product ||
    input.draft.authorizes_decision_persistence ||
    input.draft.version_separation.corrected_first_week_diff
      .comparison_run ||
    input.draft.version_separation.corrected_first_week_diff
      .correction_bytes_used ||
    input.draft.version_separation.corrected_first_week_diff
      .corrected_diff_used
  ) {
    throw new Error(
      "Plan 040 Package 10D frozen verdict or authorization scope drifted",
    );
  }

  const candidateKeys = candidates.map((candidate) =>
    candidate.candidate_key).sort();
  const reviewerResults = [
    {
      reviewer_id: "main_advisor",
      role:
        "independent_exact_positive_lineage_and_scope_review",
      reviewed_commit: PLAN040_PACKAGE_10D_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
    {
      reviewer_id: "plan040_package10d_independent_audit",
      role:
        "independent_provenance_full_stop_and_fail_closed_audit",
      reviewed_commit: PLAN040_PACKAGE_10D_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
  ];
  const verdictDistribution = {
    positive_extent_and_grain_proposed: 2,
  } as const;
  const gate = {
    schema_version: 1,
    gate_id:
      "plan-040-qbnr-service-pattern-package-10d-dual-review-gate-v1",
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D,
    reviewed_commit: PLAN040_PACKAGE_10D_APPROVED_COMMIT,
    artifacts: artifactPins(),
    candidate_count: 2,
    route_count: 2,
    candidate_key_sha256: PLAN040_PACKAGE_10D_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    extent_distribution: { route_wide: 2 },
    grain_distribution: { trip_subset: 2 },
    reviewer_results: reviewerResults,
    checkpoint_tests: {
      focused: {
        pass: 7,
        fail: 0,
        assertions: 193,
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
        receipt_sha256:
          PLAN040_PACKAGE_10D_COMPARISON_RECEIPT_SHA256,
        evidence_sha256: PLAN040_PACKAGE_10D_EVIDENCE_SHA256,
        draft_sha256: PLAN040_PACKAGE_10D_DRAFT_SHA256,
        replay_count: 2,
        status: "pass" as const,
      },
      full_repository: {
        status: "checkpoint_not_required" as const,
        newly_closed_candidates_since_package_10a_checkpoint: 11,
        shared_validation_or_materialization_semantics_changed: false,
        reason:
          "Eleven closures since the Package 10A checkpoint; below the accelerated 25-candidate checkpoint and no shared semantics changed.",
      },
    },
    verdict: "APPROVE" as const,
    authorization_state:
      "dual_review_approved_pending_standing_owner_acceptance",
    authorizes_decision_persistence: false as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
  };
  const gateSha256 = sha256(
    `${stableJson(gate as unknown as JsonValue)}\n`,
  );
  const acceptance = {
    schema_version: 1,
    acceptance_id:
      "plan-040-qbnr-service-pattern-package-10d-owner-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    acceptance_basis: "standing_owner_accelerated_checkpoint_protocol",
    gate: { path: PACKAGE_10D_GATE_PATH, sha256: gateSha256 },
    artifacts: artifactPins(),
    candidate_count: 2,
    route_count: 2,
    candidate_key_sha256: PLAN040_PACKAGE_10D_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    reviewer_results: reviewerResults,
    authorized_positive_persistence: {
      candidate_count: 2,
      candidate_key_sha256: sha256(`${candidateKeys.join("\n")}\n`),
      candidate_keys: candidateKeys,
      extent_decision_ids: candidates.map((candidate) =>
        candidate.proposed_extent_decision.decision_id).sort(),
      grain_decision_ids: candidates.map((candidate) =>
        candidate.proposed_grain_decision.decision_id).sort(),
    },
    preservation_invariants: {
      accepted_occurrence_decisions_unchanged: true,
      treatment_ontology_unchanged: true,
      limited_stop_siblings_preserved: true,
      historical_q48_lineage_excluded: true,
      changed_identifier_equivalence_authorized: false,
      occurrence_inference_prohibited: true,
      correction_feed_comparison_run: false,
    },
    authorization_state:
      "standing_owner_accepted_exact_2_positive_extent_and_grain_decision_pairs_only",
    authorizes_decision_persistence: true as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
  };
  return { gate, gateSha256, acceptance };
}

export function validatePlan040Package10dGateAndAcceptance(input: {
  draft: Plan040Package10dDraft;
  gate: unknown;
  acceptance: unknown;
  acceptedAt: string;
}) {
  const expected = buildPlan040Package10dGateAndAcceptance({
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
      "Plan 040 Package 10D gate or standing owner acceptance drifted",
    );
  }
  return {
    candidate_count: 2,
    positive_candidate_count: 2,
    authorized_extent_decision_count: 2,
    authorized_grain_decision_count: 2,
    persisted_decision_count: 0,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
  };
}

function writeImmutableJson(path: string, value: unknown): void {
  const contents = `${stableJson(value as JsonValue)}\n`;
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== contents) {
      throw new Error(
        `Refusing to overwrite immutable Plan 040 Package 10D artifact ${
          relative(repoRoot, path)
        }`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function writePlan040Package10dGateAndAcceptance(input: {
  acceptedAt: string;
}) {
  const draft = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package10dDraft;
  const built = buildPlan040Package10dGateAndAcceptance({
    draft,
    acceptedAt: input.acceptedAt,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D_GATE_PATH,
    built.gate,
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D_ACCEPTANCE_PATH,
    built.acceptance,
  );
  return {
    gatePath: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D_GATE_PATH,
    gateSha256: built.gateSha256,
    acceptancePath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D_ACCEPTANCE_PATH,
    acceptanceSha256: sha256(
      `${stableJson(built.acceptance as unknown as JsonValue)}\n`,
    ),
  };
}
