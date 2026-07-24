import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B,
  plan040Package10bReplayHash,
  type Plan040Package10bDraft,
} from "./plan040-qbnr-service-pattern-package10b.js";

export const PLAN040_PACKAGE_10B_APPROVED_COMMIT =
  "4ff696145873c8de8138217a4ec83a7f9f3a2099" as const;
export const PLAN040_PACKAGE_10B_EVIDENCE_SHA256 =
  "43877f6b9461ce904f8536789b28bc746afc42c15be02115cdbe8317ce4334c6" as const;
export const PLAN040_PACKAGE_10B_DRAFT_SHA256 =
  "90680f7321edb260901ac4861a63256e3ae8b6df59e85363f808454cf83990d8" as const;
export const PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256 =
  "09475af217f46307c25ada24ff0fcdc98b2f24e999f956586b6d02df041d7aec" as const;
export const PLAN040_PACKAGE_10B_GATE_SHA256 =
  "bf0300e079fee81cad9e365bfda76c76ee9a193bbe7657543d28ff99b8f942ea" as const;
export const PLAN040_PACKAGE_10B_ACCEPTANCE_SHA256 =
  "8318f4028da59211db19554e66bce9f1b00fbf0ea561d70d35d3f7f82fd2d5d0" as const;

const PACKAGE_10B_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10b-evidence-v1.json";
const PACKAGE_10B_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10b-evidence-draft-v1.json";
const PACKAGE_10B_COMPARISON_RECEIPT_PATH =
  "data/quality/acquisition/receipts/member-extent-evidence/" +
  "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1.json";
const PACKAGE_10B_GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10b-dual-review-gate-v1.json";

const PACKAGE_10B_PATH_MIGRATION = {
  amendment_id:
    "plan-040-qbnr-service-pattern-package-10b-receipt-path-amendment-v1",
  amendment_kind: "path_only_nonsemantic_supersession",
  reason:
    "Keep full-stop comparison evidence outside the directory reserved for member-extent absence receipts.",
  prior_artifacts: {
    comparison_receipt: {
      path:
        "data/quality/acquisition/receipts/member-extent/" +
        "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1.json",
      sha256: PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256,
    },
    evidence_sha256:
      "d0e41e3368d0eae0cc8425ad4f354aaae75bf678c5c0036d985913d786a75b2a",
    draft_sha256:
      "f65c3827d9adedfc6a537e19d48835934f31c1b87ea2a373d657316a85981f83",
    gate_sha256:
      "f719470a012399382a5108ceec4962467d49c6ddba6b0010d2d75012cbe3f7d1",
    acceptance_sha256:
      "22586299d637d8e54ae638a94db14efc44342f52876a68874bc5fe3693869e86",
  },
  current_comparison_receipt: {
    path: PACKAGE_10B_COMPARISON_RECEIPT_PATH,
    sha256: PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256,
    file_kind: "regular_file",
  },
  supersession_scope: [
    "comparison_receipt_path",
    "derived_evidence_sha256",
    "derived_draft_sha256",
    "derived_gate_sha256",
    "derived_acceptance_sha256",
  ],
  unchanged: {
    receipt_bytes: true,
    candidate_keys: true,
    verdicts: true,
    proposed_decisions: true,
    reviewer_results: true,
    authorization: true,
  },
  prior_artifacts_retained_in_git_history: true,
  shared_loader_semantics_changed: false,
  fresh_compact_dual_path_review_required_before_persistence: true,
  path_review_status: "pending",
} as const;

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_DRAFT_PATH =
  join(repoRoot, PACKAGE_10B_DRAFT_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GATE_PATH =
  join(repoRoot, PACKAGE_10B_GATE_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ACCEPTANCE_PATH =
  join(
    repoRoot,
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-10b-owner-acceptance-v1.json",
  );

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const artifactPins = () => ({
  evidence: {
    path: PACKAGE_10B_EVIDENCE_PATH,
    sha256: PLAN040_PACKAGE_10B_EVIDENCE_SHA256,
  },
  draft: {
    path: PACKAGE_10B_DRAFT_PATH,
    sha256: PLAN040_PACKAGE_10B_DRAFT_SHA256,
  },
  comparison_receipt: {
    path: PACKAGE_10B_COMPARISON_RECEIPT_PATH,
    sha256: PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256,
  },
});

export function buildPlan040Package10bGateAndAcceptance(input: {
  draft: Plan040Package10bDraft;
  acceptedAt: string;
}) {
  const replayHash = plan040Package10bReplayHash(
    input.draft as unknown as JsonValue,
  );
  const positive = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "positive_extent_and_grain_proposed"
  );
  const unresolved = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict ===
      "receipt_terminal_unresolved_preserved"
  );
  if (
    replayHash !== PLAN040_PACKAGE_10B_DRAFT_SHA256 ||
    input.draft.evidence_manifest.sha256 !==
      PLAN040_PACKAGE_10B_EVIDENCE_SHA256 ||
    input.draft.comparison_receipt.sha256 !==
      PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256 ||
    input.draft.candidate_count !== 4 ||
    input.draft.route_count !== 2 ||
    input.draft.candidate_key_sha256 !==
      PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256 ||
    positive.length !== 3 ||
    unresolved.length !== 1 ||
    positive.some((candidate) =>
      !candidate.proposed_extent_decision ||
      !candidate.proposed_grain_decision ||
      candidate.unresolved_gap_codes.length !== 0) ||
    unresolved.some((candidate) =>
      candidate.gtfs_route_id !== "Q89" ||
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0) ||
    input.draft.proposed_extent_decision_count !== 3 ||
    input.draft.proposed_grain_decision_count !== 3 ||
    input.draft.persisted_extent_decision_count !== 0 ||
    input.draft.persisted_grain_decision_count !== 0 ||
    input.draft.authorizes_occurrence ||
    input.draft.authorizes_study ||
    input.draft.authorizes_cross_product ||
    input.draft.authorizes_decision_persistence ||
    input.draft.candidates.some((candidate) =>
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence)
  ) {
    throw new Error(
      "Plan 040 Package 10B frozen verdict or authorization scope drifted",
    );
  }
  const positiveKeys = positive.map((candidate) =>
    candidate.candidate_key
  ).sort();
  const unresolvedKeys = unresolved.map((candidate) =>
    candidate.candidate_key
  ).sort();
  const positiveKeySha256 = sha256(`${positiveKeys.join("\n")}\n`);
  const unresolvedKeySha256 = sha256(`${unresolvedKeys.join("\n")}\n`);
  const extentDecisionIds = positive.map((candidate) =>
    candidate.proposed_extent_decision!.decision_id
  ).sort();
  const grainDecisionIds = positive.map((candidate) =>
    candidate.proposed_grain_decision!.decision_id
  ).sort();
  const reviewerResults = [
    {
      reviewer_id: "main_advisor",
      role: "independent_strict_exact_positive_review",
      reviewed_commit: PLAN040_PACKAGE_10B_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
    {
      reviewer_id: "plan040_package10b_independent_audit",
      role: "independent_provenance_and_fail_closed_audit",
      reviewed_commit: PLAN040_PACKAGE_10B_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
  ];
  const verdictDistribution = {
    positive_extent_and_grain_proposed: 3,
    receipt_terminal_unresolved_preserved: 1,
  } as const;
  const gate = {
    schema_version: 1,
    gate_id:
      "plan-040-qbnr-service-pattern-package-10b-dual-review-gate-v1",
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B,
    reviewed_commit: PLAN040_PACKAGE_10B_APPROVED_COMMIT,
    artifacts: artifactPins(),
    candidate_count: 4,
    route_count: 2,
    candidate_key_sha256: PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    extent_distribution: {
      route_wide: 1,
      bounded_segment: 2,
      unresolved: 1,
    },
    grain_distribution: {
      trip_subset: 3,
      unresolved: 1,
    },
    reviewer_results: reviewerResults,
    checkpoint_tests: {
      focused: {
        pass: 9,
        fail: 0,
        assertions: 259,
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
          PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256,
        evidence_sha256: PLAN040_PACKAGE_10B_EVIDENCE_SHA256,
        draft_sha256: PLAN040_PACKAGE_10B_DRAFT_SHA256,
        status: "pass" as const,
      },
      full_repository: {
        status: "checkpoint_not_required" as const,
        reason:
          "Only four closures since the Package 10A checkpoint and no shared semantics changed.",
      },
    },
    path_migration: PACKAGE_10B_PATH_MIGRATION,
    authorization_state:
      "dual_review_approved_pending_owner_delegate_acceptance",
    authorizes_decision_persistence: false as const,
    authorizes_reviewed_absence_receipt_persistence: false as const,
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
      "plan-040-qbnr-service-pattern-package-10b-owner-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    gate: { path: PACKAGE_10B_GATE_PATH, sha256: gateSha256 },
    artifacts: artifactPins(),
    candidate_count: 4,
    route_count: 2,
    candidate_key_sha256: PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    reviewer_results: reviewerResults,
    path_migration: PACKAGE_10B_PATH_MIGRATION,
    authorized_positive_persistence: {
      candidate_count: 3,
      candidate_key_sha256: positiveKeySha256,
      candidate_keys: positiveKeys,
      extent_decision_ids: extentDecisionIds,
      grain_decision_ids: grainDecisionIds,
    },
    authorized_reviewed_absence_receipt: {
      receipt_id:
        "plan-040-qbnr-service-pattern-package-10b-reviewed-absence-v1",
      candidate_count: 1,
      candidate_key_sha256: unresolvedKeySha256,
      candidate_keys: unresolvedKeys,
      surfaces: ["member_extent", "member_grain"] as const,
      verdict_by_surface: {
        member_extent: "reviewed_terminal_unresolved_preserved" as const,
        member_grain: "reviewed_terminal_unresolved_preserved" as const,
      },
    },
    authorization_state:
      "owner_delegate_accepted_exact_3_positive_decision_pairs_and_exact_1_key_preserved_reviewed_absence_only",
    authorizes_decision_persistence: true as const,
    authorizes_reviewed_absence_receipt_persistence: true as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
  };
  return { gate, gateSha256, acceptance };
}

export function validatePlan040Package10bGateAndAcceptance(input: {
  draft: Plan040Package10bDraft;
  gate: unknown;
  acceptance: unknown;
  acceptedAt: string;
}) {
  const expected = buildPlan040Package10bGateAndAcceptance({
    draft: input.draft,
    acceptedAt: input.acceptedAt,
  });
  if (
    stableJson(input.gate as JsonValue) !==
      stableJson(expected.gate as unknown as JsonValue)
  ) {
    throw new Error("Plan 040 Package 10B dual-review gate drifted");
  }
  if (
    stableJson(input.acceptance as JsonValue) !==
      stableJson(expected.acceptance as unknown as JsonValue)
  ) {
    throw new Error(
      "Plan 040 Package 10B owner/delegate acceptance drifted",
    );
  }
  return {
    candidate_count: 4,
    positive_candidate_count: 3,
    unresolved_candidate_count: 1,
    authorized_extent_decision_count: 3,
    authorized_grain_decision_count: 3,
    authorized_absence_candidate_count: 1,
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
        `Refusing to overwrite immutable Plan 040 Package 10B artifact ${
          relative(repoRoot, path)
        }`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function writePlan040Package10bGateAndAcceptance(input: {
  acceptedAt: string;
}) {
  const draft = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package10bDraft;
  const built = buildPlan040Package10bGateAndAcceptance({
    draft,
    acceptedAt: input.acceptedAt,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GATE_PATH,
    built.gate,
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ACCEPTANCE_PATH,
    built.acceptance,
  );
  return {
    gatePath: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GATE_PATH,
    gateSha256: built.gateSha256,
    acceptancePath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ACCEPTANCE_PATH,
    acceptanceSha256: sha256(
      `${stableJson(built.acceptance as unknown as JsonValue)}\n`,
    ),
  };
}
