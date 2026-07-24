import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  PLAN040_PACKAGE_7_CANDIDATE_KEY_SHA256,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7,
  plan040Package7ReplayHash,
  type Plan040Package7Draft,
} from "./plan040-qbnr-service-pattern-package7.js";

export const PLAN040_PACKAGE_7_INITIAL_REVIEWED_COMMIT =
  "df98f5eea1375efb40d7eea64f64029955b8dbc5" as const;
export const PLAN040_PACKAGE_7_APPROVED_COMMIT =
  "3a650523bae486e9c7c6037c16c8a4f185cd1cee" as const;
export const PLAN040_PACKAGE_7_EVIDENCE_SHA256 =
  "ae2b3885a7a534a754e6b9f54868cd604dd5983e993bccbf210fe5e4f13281a2" as const;
export const PLAN040_PACKAGE_7_DRAFT_SHA256 =
  "ee62990a38ebb787cf009ea1236618bf69cfd4e5bdbc32ce94bbc1720ed224a8" as const;

const PACKAGE_7_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-7-evidence-v1.json";
const PACKAGE_7_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-7-evidence-draft-v1.json";
const PACKAGE_7_GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-7-dual-review-gate-v1.json";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_DRAFT_PATH =
  join(repoRoot, PACKAGE_7_DRAFT_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_GATE_PATH =
  join(repoRoot, PACKAGE_7_GATE_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_ACCEPTANCE_PATH =
  join(
    repoRoot,
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-7-owner-acceptance-v1.json",
  );

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const artifactPins = () => ({
  evidence: {
    path: PACKAGE_7_EVIDENCE_PATH,
    sha256: PLAN040_PACKAGE_7_EVIDENCE_SHA256,
  },
  draft: {
    path: PACKAGE_7_DRAFT_PATH,
    sha256: PLAN040_PACKAGE_7_DRAFT_SHA256,
    replay_sha256: PLAN040_PACKAGE_7_DRAFT_SHA256,
  },
});

export function buildPlan040Package7GateAndAcceptance(input: {
  draft: Plan040Package7Draft;
  acceptedAt: string;
}) {
  const draftHash = plan040Package7ReplayHash(
    input.draft as unknown as JsonValue,
  );
  if (draftHash !== PLAN040_PACKAGE_7_DRAFT_SHA256) {
    throw new Error(`Plan 040 Package 7 draft hash drifted: ${draftHash}`);
  }
  const positive = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "evidence_complete_positive_draft");
  const unresolved = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "receipt_terminal_unresolved");
  if (
    input.draft.candidate_count !== 20 ||
    input.draft.route_count !== 17 ||
    input.draft.candidate_key_sha256 !==
      PLAN040_PACKAGE_7_CANDIDATE_KEY_SHA256 ||
    positive.length !== 10 ||
    unresolved.length !== 10 ||
    positive.some((candidate) =>
      !candidate.proposed_extent_decision ||
      !candidate.proposed_grain_decision ||
      candidate.unresolved_gap_codes.length !== 0) ||
    unresolved.some((candidate) =>
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0) ||
    input.draft.persisted_extent_decision_count !== 0 ||
    input.draft.persisted_grain_decision_count !== 0 ||
    input.draft.authorizes_occurrence ||
    input.draft.authorizes_study ||
    input.draft.authorizes_cross_product ||
    input.draft.authorizes_decision_persistence
  ) {
    throw new Error(
      "Plan 040 Package 7 frozen verdict or authorization scope drifted",
    );
  }

  const positiveKeys = positive
    .map((candidate) => candidate.candidate_key)
    .sort();
  const unresolvedKeys = unresolved
    .map((candidate) => candidate.candidate_key)
    .sort();
  const positiveKeySha256 = sha256(`${positiveKeys.join("\n")}\n`);
  const unresolvedKeySha256 = sha256(`${unresolvedKeys.join("\n")}\n`);
  const extentDecisionIds = positive
    .map((candidate) => candidate.proposed_extent_decision!.decision_id)
    .sort();
  const grainDecisionIds = positive
    .map((candidate) => candidate.proposed_grain_decision!.decision_id)
    .sort();
  const reviewerResults = [
    {
      role: "independent_main_advisor_evidence_review",
      reviewer_id: "main_advisor",
      reviewed_commit: PLAN040_PACKAGE_7_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
    {
      role: "independent_provenance_and_fail_closed_audit",
      reviewer_id: "plan040_package7_independent_audit",
      reviewed_commit: PLAN040_PACKAGE_7_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
  ];
  const gate = {
    schema_version: 1,
    gate_id:
      "plan-040-qbnr-service-pattern-package-7-dual-review-gate-v1",
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7,
    reviewed_commit: PLAN040_PACKAGE_7_APPROVED_COMMIT,
    review_history: [{
      commit: PLAN040_PACKAGE_7_INITIAL_REVIEWED_COMMIT,
      verdict: "REFUTE" as const,
      superseded_by: PLAN040_PACKAGE_7_APPROVED_COMMIT,
      findings: [
        "q114_nested_extent_component_sets",
        "qm20_flat_selector_overpromotion",
      ],
      resolution:
        "Q114 was union-normalized and QM20 was demoted to terminal unresolved.",
    }],
    artifacts: artifactPins(),
    candidate_count: 20,
    route_count: 17,
    candidate_key_sha256: input.draft.candidate_key_sha256,
    verdict_distribution: {
      evidence_complete_positive_draft: 10,
      receipt_terminal_unresolved: 10,
    },
    extent_distribution: {
      bounded_segment: 8,
      route_wide: 2,
      unresolved: 10,
    },
    grain_distribution: {
      periods: 2,
      trip_subset: 8,
      unresolved: 10,
    },
    positive_candidate_count: 10,
    positive_candidate_key_sha256: positiveKeySha256,
    unresolved_candidate_count: 10,
    unresolved_candidate_key_sha256: unresolvedKeySha256,
    reviewer_results: reviewerResults,
    checkpoint_tests: {
      focused: {
        pass: 11,
        fail: 0,
        assertions: 914,
        status: "pass" as const,
      },
      combined_package_6_and_7: {
        pass: 22,
        fail: 0,
        assertions: 1226,
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
        sha256: PLAN040_PACKAGE_7_DRAFT_SHA256,
        status: "pass" as const,
      },
      full_repository: {
        status: "checkpoint_not_required" as const,
        reason:
          "20 closures since the repaired checkpoint is below the accelerated 25-candidate threshold.",
      },
    },
    authorization_state:
      "dual_review_approved_pending_owner_delegate_acceptance",
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    persisted_absence_receipt_count: 0,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
    authorizes_decision_persistence: false as const,
    authorizes_reviewed_absence_receipt_persistence: false as const,
  };
  const gateSha256 = sha256(
    `${stableJson(gate as unknown as JsonValue)}\n`,
  );
  const acceptance = {
    schema_version: 1,
    acceptance_id:
      "plan-040-qbnr-service-pattern-package-7-owner-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    gate: { path: PACKAGE_7_GATE_PATH, sha256: gateSha256 },
    artifacts: artifactPins(),
    candidate_count: 20,
    route_count: 17,
    candidate_key_sha256: input.draft.candidate_key_sha256,
    verdict_distribution: {
      evidence_complete_positive_draft: 10,
      receipt_terminal_unresolved: 10,
    },
    reviewer_results: {
      main_advisor: "APPROVE" as const,
      plan040_package7_independent_audit: "APPROVE" as const,
    },
    authorized_positive_persistence: {
      candidate_count: 10,
      candidate_key_sha256: positiveKeySha256,
      candidate_keys: positiveKeys,
      extent_decision_ids: extentDecisionIds,
      grain_decision_ids: grainDecisionIds,
    },
    authorized_reviewed_absence_receipt: {
      receipt_id:
        "plan-040-qbnr-service-pattern-package-7-reviewed-absence-v1",
      candidate_count: 10,
      candidate_key_sha256: unresolvedKeySha256,
      candidate_keys: unresolvedKeys,
      surfaces: ["member_extent", "member_grain"],
      verdict_by_surface: {
        member_extent: "reviewed_terminal_unresolved",
        member_grain: "reviewed_terminal_unresolved",
      },
    },
    authorization_state:
      "owner_delegate_accepted_exact_10_positive_decision_pairs_and_exact_10_key_reviewed_absence_only",
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    persisted_absence_receipt_count: 0,
    authorizes_decision_persistence: true as const,
    authorizes_reviewed_absence_receipt_persistence: true as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
  };
  return { gate, gateSha256, acceptance };
}

export function validatePlan040Package7GateAndAcceptance(input: {
  draft: Plan040Package7Draft;
  gate: unknown;
  acceptance: unknown;
  acceptedAt: string;
}) {
  const expected = buildPlan040Package7GateAndAcceptance({
    draft: input.draft,
    acceptedAt: input.acceptedAt,
  });
  if (
    stableJson(input.gate as JsonValue) !==
      stableJson(expected.gate as unknown as JsonValue)
  ) {
    throw new Error("Plan 040 Package 7 dual-review gate drifted");
  }
  if (
    stableJson(input.acceptance as JsonValue) !==
      stableJson(expected.acceptance as unknown as JsonValue)
  ) {
    throw new Error("Plan 040 Package 7 owner/delegate acceptance drifted");
  }
  return {
    candidate_count: 20,
    positive_candidate_count: 10,
    unresolved_candidate_count: 10,
    authorized_extent_decision_count: 10,
    authorized_grain_decision_count: 10,
    authorized_absence_candidate_count: 10,
    persisted_decision_count: 0,
    persisted_absence_receipt_count: 0,
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
        `Refusing to overwrite immutable Plan 040 Package 7 artifact ${
          relative(repoRoot, path)
        }`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function writePlan040Package7GateAndAcceptance(input: {
  acceptedAt: string;
}) {
  const draft = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package7Draft;
  const built = buildPlan040Package7GateAndAcceptance({
    draft,
    acceptedAt: input.acceptedAt,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_GATE_PATH,
    built.gate,
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_ACCEPTANCE_PATH,
    built.acceptance,
  );
  return {
    gatePath: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_GATE_PATH,
    gateSha256: built.gateSha256,
    acceptancePath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_ACCEPTANCE_PATH,
    acceptanceSha256: sha256(
      `${stableJson(built.acceptance as unknown as JsonValue)}\n`,
    ),
  };
}
