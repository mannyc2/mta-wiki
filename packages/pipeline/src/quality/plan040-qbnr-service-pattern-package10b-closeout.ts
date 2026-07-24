import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { fileSha256 } from "../reference/snapshot-registry.js";
import {
  MEMBER_EXTENT_ABSENCE_CONTRACT_ID,
  MEMBER_EXTENT_LEDGER_SCHEMA_VERSION,
  type MemberExtentAbsenceReceipt,
} from "./member-extent-ledger.js";
import {
  memberGrainDecisionKey,
  parseMemberGrainDecision,
  type MemberGrainDecision,
} from "./member-grain-decisions.js";
import {
  PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B,
  plan040Package10bReplayHash,
  type Plan040Package10bDraft,
} from "./plan040-qbnr-service-pattern-package10b.js";
import {
  extentDecisionKey,
  validateMemberExtentDecision,
  type MemberExtentDecision,
} from "./study-readiness-v1.js";

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
export const PLAN040_PACKAGE_10B_PATH_AMENDMENT_COMMIT =
  "bf8a2e9692c8654a5d16ce5ce4bc093e549feffd" as const;
export const PLAN040_PACKAGE_10B_PATH_REVIEW_GATE_SHA256 =
  "c56aebde2d43dc94cbdeb684112beb6454e701d25c4e570d630e70f5f5466601" as const;
export const PLAN040_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_SHA256 =
  "daa5c604d75c44432336f0010444d21e53b55aa929ca899e0caad66c8076a963" as const;
export const PLAN040_PACKAGE_10B_EXTENT_DECISIONS_SHA256 =
  "90481c9f87b49ae02b01f6a9085eaecb727b44527ffd560f2b8019dff737d746" as const;
export const PLAN040_PACKAGE_10B_GRAIN_DECISIONS_SHA256 =
  "df46021d5c62f1c128399c05d931ea83ada58d26ddc205ad5656f94403f0445d" as const;
export const PLAN040_PACKAGE_10B_ABSENCE_RECEIPT_SHA256 =
  "ab1bc3150c8c3ffc1dd14f93ea18a821831a83e07ea485ac7df4c2b4b220043f" as const;
export const PLAN040_PACKAGE_10B_POST_PERSISTENCE_PINS = {
  extent_ledger:
    "677586944219a59e1d6d74b7bf7c6b39150a99a0a84dce6bdc4fac11cf9057e9",
  grain_ledger:
    "bb6c5aca8bff36494e6c1e0857d2a6e722c3fb523cd2aca2ee8b17f3fa2730cf",
  bridge_ledger:
    "6c82b4a37067e6c7de563e373c7187c75a15610118da6fa3c64cdb70133e755b",
  study_manifest:
    "2aca7fc78f36440a89db0b85a23baf69d421bc93ebe22e32514285670f7dd882",
  member_extent_contract:
    "2898c276271722374ce81b23d02d2110ddef198055cdfcb81e1d6c29094144c4",
  member_extent_manifest:
    "51ad2e7d37f751f9278bf695342a0497803601efe0ad0ada3c49ad85e8cd8158",
  operational_occurrences:
    "6cb8654efee370d7444405ce3a0cdb8ce6fa394e6ada2347982cbec49df701ef",
  reviewed_candidate_packets:
    "0ac700c48740fff5eb36b626b8dee72f95212378c0b40bc3dc6265b32c3d5844",
} as const;

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
const PACKAGE_10B_ACCEPTANCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10b-owner-acceptance-v1.json";
const PACKAGE_10B_PATH_REVIEW_GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10b-path-review-gate-v1.json";
const PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10b-path-review-supplemental-acceptance-v1.json";

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
  join(repoRoot, PACKAGE_10B_ACCEPTANCE_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_GATE_PATH =
  join(repoRoot, PACKAGE_10B_PATH_REVIEW_GATE_PATH);
export const
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH =
    join(repoRoot, PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_EXTENT_DECISIONS_PATH =
  join(
    repoRoot,
    "data/quality/operational-reference/member-extent-ledger-decisions/" +
      "plan-040-qbnr-service-pattern-package-10b-v1.json",
  );
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GRAIN_DECISIONS_PATH =
  join(
    repoRoot,
    "data/quality/operational-reference/member-grain-decisions/" +
      "plan-040-qbnr-service-pattern-package-10b-v1.json",
  );
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ABSENCE_RECEIPT_PATH =
  join(
    repoRoot,
    "data/quality/acquisition/receipts/member-extent/" +
      "plan-040-qbnr-service-pattern-package-10b-reviewed-absence-v1.json",
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

export function buildPlan040Package10bPathReviewAndAcceptance(input: {
  acceptedAt: string;
}) {
  const artifacts = {
    comparison_receipt: {
      path: PACKAGE_10B_COMPARISON_RECEIPT_PATH,
      sha256: PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256,
      file_kind: "regular_file" as const,
    },
    evidence: {
      path: PACKAGE_10B_EVIDENCE_PATH,
      sha256: PLAN040_PACKAGE_10B_EVIDENCE_SHA256,
    },
    draft: {
      path: PACKAGE_10B_DRAFT_PATH,
      sha256: PLAN040_PACKAGE_10B_DRAFT_SHA256,
    },
    original_gate: {
      path: PACKAGE_10B_GATE_PATH,
      sha256: PLAN040_PACKAGE_10B_GATE_SHA256,
    },
    original_acceptance: {
      path: PACKAGE_10B_ACCEPTANCE_PATH,
      sha256: PLAN040_PACKAGE_10B_ACCEPTANCE_SHA256,
    },
  };
  const reviewerResults = [
    {
      reviewer_id: "main_advisor",
      role: "independent_regular_file_path_review",
      reviewed_commit: PLAN040_PACKAGE_10B_PATH_AMENDMENT_COMMIT,
      verdict: "APPROVE" as const,
    },
    {
      reviewer_id: "plan040_package10b_path_migration_audit",
      role: "independent_path_only_supersession_audit",
      reviewed_commit: PLAN040_PACKAGE_10B_PATH_AMENDMENT_COMMIT,
      verdict: "APPROVE" as const,
    },
  ];
  const invariants = {
    receipt_bytes_unchanged: true,
    receipt_sha256_unchanged: true,
    candidate_keys_unchanged: true,
    verdicts_unchanged: true,
    proposed_decisions_unchanged: true,
    prior_reviewer_results_unchanged: true,
    prior_authorization_unchanged: true,
    shared_loader_semantics_unchanged: true,
    persistence_performed: false,
  } as const;
  const gate = {
    schema_version: 1,
    gate_id:
      "plan-040-qbnr-service-pattern-package-10b-path-review-gate-v1",
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B,
    reviewed_commit: PLAN040_PACKAGE_10B_PATH_AMENDMENT_COMMIT,
    amendment_id:
      "plan-040-qbnr-service-pattern-package-10b-receipt-path-amendment-v1",
    review_scope:
      "regular_file_location_byte_identity_and_nonsemantic_supersession_only",
    artifacts,
    candidate_count: 4,
    candidate_key_sha256: PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
    verdict_distribution: {
      positive_extent_and_grain_proposed: 3,
      receipt_terminal_unresolved_preserved: 1,
    },
    reviewer_results: reviewerResults,
    invariants,
    verdict: "APPROVE" as const,
    authorization_state:
      "fresh_compact_dual_path_review_approved_pending_owner_supplemental_acceptance",
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
      "plan-040-qbnr-service-pattern-package-10b-path-review-supplemental-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    acceptance_basis: "standing_owner_accelerated_checkpoint_protocol",
    gate: {
      path: PACKAGE_10B_PATH_REVIEW_GATE_PATH,
      sha256: gateSha256,
    },
    reviewed_commit: PLAN040_PACKAGE_10B_PATH_AMENDMENT_COMMIT,
    artifacts,
    candidate_count: 4,
    candidate_key_sha256: PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
    reviewer_results: reviewerResults,
    invariants,
    authorization_state:
      "owner_supplementally_accepted_path_only_amendment_for_combined_validation_with_prior_acceptance",
    authorizes_path_amendment_integration: true as const,
    authorizes_previously_accepted_persistence_after_combined_validation:
      true as const,
    authorizes_new_or_changed_decisions: false as const,
    authorizes_decision_persistence: false as const,
    authorizes_reviewed_absence_receipt_persistence: false as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
  };
  return { gate, gateSha256, acceptance };
}

export function writePlan040Package10bPathReviewAndAcceptance(input: {
  acceptedAt: string;
}) {
  for (const [path, expectedSha256, label] of [
    [
      join(repoRoot, PACKAGE_10B_COMPARISON_RECEIPT_PATH),
      PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256,
      "comparison receipt",
    ],
    [
      join(repoRoot, PACKAGE_10B_EVIDENCE_PATH),
      PLAN040_PACKAGE_10B_EVIDENCE_SHA256,
      "evidence",
    ],
    [
      join(repoRoot, PACKAGE_10B_DRAFT_PATH),
      PLAN040_PACKAGE_10B_DRAFT_SHA256,
      "draft",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GATE_PATH,
      PLAN040_PACKAGE_10B_GATE_SHA256,
      "original gate",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ACCEPTANCE_PATH,
      PLAN040_PACKAGE_10B_ACCEPTANCE_SHA256,
      "original acceptance",
    ],
  ] as const) {
    if (fileSha256(path) !== expectedSha256) {
      throw new Error(`Plan 040 Package 10B ${label} pin drifted`);
    }
  }
  const receiptStat = lstatSync(
    join(repoRoot, PACKAGE_10B_COMPARISON_RECEIPT_PATH),
  );
  if (!receiptStat.isFile() || receiptStat.isSymbolicLink()) {
    throw new Error(
      "Plan 040 Package 10B comparison receipt must be a regular non-symlink file",
    );
  }
  const built = buildPlan040Package10bPathReviewAndAcceptance(input);
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_GATE_PATH,
    built.gate,
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH,
    built.acceptance,
  );
  return {
    gatePath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_GATE_PATH,
    gateSha256: built.gateSha256,
    acceptancePath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH,
    acceptanceSha256: sha256(
      `${stableJson(built.acceptance as unknown as JsonValue)}\n`,
    ),
  };
}

type Plan040Package10bGateAndAcceptance =
  ReturnType<typeof buildPlan040Package10bGateAndAcceptance>;
type Plan040Package10bPathReviewAndAcceptance =
  ReturnType<typeof buildPlan040Package10bPathReviewAndAcceptance>;

function assertExactValues(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  if (
    stableJson([...actual].sort() as JsonValue) !==
      stableJson([...expected].sort() as JsonValue)
  ) {
    throw new Error(
      `Plan 040 Package 10B ${label} drifted outside owner acceptance`,
    );
  }
}

function q89SearchRecord(
  candidate: Plan040Package10bDraft["candidates"][number],
): string {
  const evidence = candidate.accepted_evidence as {
    prior_review: {
      packet_id: string;
      packet_row_sha256: string;
      member_extent_decision_id: string;
      occurrence_review_decision_id: string;
    };
    initial_post_inventory: {
      source_id: string;
      receipt_sha256: string;
      zip_sha1: string;
      active_trip_count: number;
      shape_ids: string[];
    };
    schedule_slice: {
      source_id: string;
      source_csv_sha256: string;
      row_count: number;
      passenger_shape_ids: string[];
      slice_sha256: string;
      shape_identity_matches_initial_post: boolean;
    };
  };
  return [
    `candidate=${candidate.candidate_key}`,
    `source_statement=${candidate.source_statement.evidence_id}@` +
      `${candidate.source_statement.block_sha256}/` +
      `${JSON.stringify(candidate.source_statement.source_quote)}`,
    `prior_review=${evidence.prior_review.packet_id}@` +
      `${evidence.prior_review.packet_row_sha256}/` +
      `${evidence.prior_review.member_extent_decision_id}/` +
      `${evidence.prior_review.occurrence_review_decision_id}/` +
      "preserved_without_supersession",
    `initial_post=${evidence.initial_post_inventory.source_id}/` +
      `receipt=${evidence.initial_post_inventory.receipt_sha256}/` +
      `zip=${evidence.initial_post_inventory.zip_sha1}/` +
      `trips=${evidence.initial_post_inventory.active_trip_count}/` +
      `shapes=${evidence.initial_post_inventory.shape_ids.join(",")}`,
    `schedule=${evidence.schedule_slice.source_id}@` +
      `${evidence.schedule_slice.source_csv_sha256}/` +
      `rows=${evidence.schedule_slice.row_count}/` +
      `shapes=${evidence.schedule_slice.passenger_shape_ids.join(",")}/` +
      `slice=${evidence.schedule_slice.slice_sha256}/` +
      `initial_match=${evidence.schedule_slice.shape_identity_matches_initial_post}`,
    `exact_searches=${candidate.exact_candidate_searches.join(" | ")}`,
    `prior_extent_ledger=${candidate.prior_ledger_state.extent_row.ledger_id}`,
    `prior_grain_ledger=${candidate.prior_ledger_state.grain_row.ledger_id}`,
    "occurrence_inference_prohibited=true",
    "prior_occurrence_preserved=true",
    "prior_member_extent_decision_preserved=true",
    "result=receipt_terminal_unresolved_preserved",
    `gaps=${candidate.unresolved_gap_codes.join(",")}`,
  ].join("; ");
}

export function buildPlan040Package10bAcceptedArtifacts(input: {
  draft: Plan040Package10bDraft;
  gate: Plan040Package10bGateAndAcceptance["gate"];
  acceptance: Plan040Package10bGateAndAcceptance["acceptance"];
  pathReviewGate: Plan040Package10bPathReviewAndAcceptance["gate"];
  pathReviewAcceptance:
    Plan040Package10bPathReviewAndAcceptance["acceptance"];
}): {
  extentDecisions: MemberExtentDecision[];
  grainDecisions: MemberGrainDecision[];
  absenceReceipt: MemberExtentAbsenceReceipt;
} {
  validatePlan040Package10bGateAndAcceptance({
    draft: input.draft,
    gate: input.gate,
    acceptance: input.acceptance,
    acceptedAt: input.acceptance.accepted_at,
  });
  const expectedPathReview =
    buildPlan040Package10bPathReviewAndAcceptance({
      acceptedAt: input.pathReviewAcceptance.accepted_at,
    });
  if (
    stableJson(input.pathReviewGate as unknown as JsonValue) !==
      stableJson(expectedPathReview.gate as unknown as JsonValue) ||
    stableJson(input.pathReviewAcceptance as unknown as JsonValue) !==
      stableJson(expectedPathReview.acceptance as unknown as JsonValue)
  ) {
    throw new Error(
      "Plan 040 Package 10B path-review approval or supplemental acceptance drifted",
    );
  }
  if (
    input.acceptance.authorization_state !==
      "owner_delegate_accepted_exact_3_positive_decision_pairs_and_exact_1_key_preserved_reviewed_absence_only" ||
    input.acceptance.authorizes_decision_persistence !== true ||
    input.acceptance.authorizes_reviewed_absence_receipt_persistence !==
      true ||
    input.acceptance.authorizes_occurrence !== false ||
    input.acceptance.authorizes_study !== false ||
    input.acceptance.authorizes_cross_product !== false ||
    input.pathReviewGate.verdict !== "APPROVE" ||
    input.pathReviewGate.reviewer_results.some((review) =>
      review.verdict !== "APPROVE") ||
    input.pathReviewAcceptance
        .authorizes_path_amendment_integration !== true ||
    input.pathReviewAcceptance
        .authorizes_previously_accepted_persistence_after_combined_validation !==
      true ||
    input.pathReviewAcceptance.authorizes_new_or_changed_decisions !==
      false ||
    input.pathReviewAcceptance.authorizes_occurrence !== false ||
    input.pathReviewAcceptance.authorizes_study !== false ||
    input.pathReviewAcceptance.authorizes_cross_product !== false
  ) {
    throw new Error(
      "Plan 040 Package 10B combined owner acceptance does not authorize this persistence scope",
    );
  }
  const positive = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "positive_extent_and_grain_proposed"
  );
  const unresolved = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict ===
      "receipt_terminal_unresolved_preserved"
  );
  if (
    positive.length !== 3 ||
    positive.some((candidate) =>
      !candidate.proposed_extent_decision ||
      !candidate.proposed_grain_decision ||
      candidate.unresolved_gap_codes.length !== 0) ||
    unresolved.length !== 1 ||
    unresolved.some((candidate) =>
      candidate.gtfs_route_id !== "Q89" ||
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0)
  ) {
    throw new Error(
      "Plan 040 Package 10B persistence inputs no longer match the accepted verdict split",
    );
  }
  const q89 = unresolved[0]!;
  if (
    q89.occurrence_id !== "occurrence:2748598653b74d33fcdce3d1" ||
    q89.prior_ledger_state.extent_row.ledger_id !==
      "member-extent-ledger:06d3feaca1f812078748a979" ||
    q89.prior_ledger_state.grain_row.ledger_id !==
      "member-grain-ledger:06d3feaca1f812078748a979" ||
    q89.prior_ledger_state.extent_row.packet_id !==
      "study-readiness-review:ea9e0f1db4ffbcd5d34356ed" ||
    q89.prior_ledger_state.grain_row.member_extent_decision_id !==
      "member-extent-review:53b053d72d04f18923d31522" ||
    q89.prior_ledger_state.extent_row.current_extent_kind !== "unresolved" ||
    q89.prior_ledger_state.grain_row.current_extent_kind !== "unresolved"
  ) {
    throw new Error(
      "Plan 040 Package 10B Q89 prior unresolved state drifted",
    );
  }

  const positiveKeys = positive.map((candidate) =>
    candidate.candidate_key
  ).sort();
  const unresolvedKeys = [q89.candidate_key];
  const proposedExtentIds = positive.map((candidate) =>
    candidate.proposed_extent_decision!.decision_id
  ).sort();
  const proposedGrainIds = positive.map((candidate) =>
    candidate.proposed_grain_decision!.decision_id
  ).sort();
  assertExactValues(
    input.acceptance.authorized_positive_persistence.candidate_keys,
    positiveKeys,
    "positive candidate keys",
  );
  assertExactValues(
    input.acceptance.authorized_positive_persistence.extent_decision_ids,
    proposedExtentIds,
    "extent decision ids",
  );
  assertExactValues(
    input.acceptance.authorized_positive_persistence.grain_decision_ids,
    proposedGrainIds,
    "grain decision ids",
  );
  assertExactValues(
    input.acceptance.authorized_reviewed_absence_receipt.candidate_keys,
    unresolvedKeys,
    "reviewed absence candidate keys",
  );
  assertExactValues(
    input.acceptance.authorized_reviewed_absence_receipt.surfaces,
    ["member_extent", "member_grain"],
    "reviewed absence surfaces",
  );
  const unresolvedKeySha256 = sha256(`${q89.candidate_key}\n`);
  if (
    input.acceptance.authorized_reviewed_absence_receipt.receipt_id !==
      "plan-040-qbnr-service-pattern-package-10b-reviewed-absence-v1" ||
    input.acceptance.authorized_reviewed_absence_receipt.candidate_count !==
      1 ||
    input.acceptance.authorized_reviewed_absence_receipt
        .candidate_key_sha256 !== unresolvedKeySha256 ||
    input.acceptance.authorized_reviewed_absence_receipt
        .verdict_by_surface.member_extent !==
      "reviewed_terminal_unresolved_preserved" ||
    input.acceptance.authorized_reviewed_absence_receipt
        .verdict_by_surface.member_grain !==
      "reviewed_terminal_unresolved_preserved"
  ) {
    throw new Error(
      "Plan 040 Package 10B reviewed absence authorization drifted",
    );
  }

  const extentDecisions = positive.map((candidate) => {
    const decision = {
      ...candidate.proposed_extent_decision!,
      reviewed_at: input.acceptance.accepted_at,
      reviewed_by: input.acceptance.accepted_by,
    };
    validateMemberExtentDecision(decision);
    if (extentDecisionKey(decision) !== candidate.candidate_key) {
      throw new Error(
        `${candidate.treatment_record_id}: accepted extent key drifted`,
      );
    }
    return decision;
  }).sort((left, right) =>
    extentDecisionKey(left).localeCompare(extentDecisionKey(right)));
  const extentByKey = new Map(
    extentDecisions.map((decision) => [
      extentDecisionKey(decision),
      decision,
    ]),
  );
  const grainDecisions = positive.map((candidate) => {
    const decision = parseMemberGrainDecision({
      ...candidate.proposed_grain_decision!,
      reviewed_at: input.acceptance.accepted_at,
      reviewed_by: input.acceptance.accepted_by,
    });
    const extentDecision = extentByKey.get(candidate.candidate_key);
    if (
      memberGrainDecisionKey(decision) !== candidate.candidate_key ||
      decision.member_extent_decision_id !== extentDecision?.decision_id ||
      decision.service_scope.kind !== "trip_subset"
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: accepted extent/grain link drifted`,
      );
    }
    return decision;
  }).sort((left, right) =>
    memberGrainDecisionKey(left).localeCompare(
      memberGrainDecisionKey(right),
    ));
  const extentDistribution = Object.fromEntries(
    ["route_wide", "bounded_segment"].map((resolution) => [
      resolution,
      extentDecisions.filter((decision) =>
        decision.resolution === resolution).length,
    ]),
  );
  if (
    extentDistribution.route_wide !== 1 ||
    extentDistribution.bounded_segment !== 2
  ) {
    throw new Error(
      "Plan 040 Package 10B accepted extent distribution drifted",
    );
  }

  const exactSearch = q89SearchRecord(q89);
  const absenceReceipt: MemberExtentAbsenceReceipt = {
    schema_version: MEMBER_EXTENT_LEDGER_SCHEMA_VERSION,
    contract_id: MEMBER_EXTENT_ABSENCE_CONTRACT_ID,
    receipt_id:
      input.acceptance.authorized_reviewed_absence_receipt.receipt_id,
    surfaces: ["member_extent", "member_grain"],
    extent_keys: [{
      occurrence_id: q89.occurrence_id,
      route_record_id: q89.route_record_id,
      treatment_record_id: q89.treatment_record_id,
    }],
    exact_searches: [exactSearch],
    urls_inspected: [
      "https://www.mta.info/project/queens-bus-network-redesign/service-changes",
    ],
    rationale:
      "Owner-delegate accepted reviewed absence for the exact Package 10B Q89/Q85 Green Acres " +
      "replacement candidate after dual independent risk review. The exact prior Q89 packet, " +
      "reviewed unresolved member-extent decision, occurrence, ledger rows, source gaps, initial-" +
      "post versus schedule shape mismatch, candidate-specific searches, and correction-version " +
      "separation remain preserved without supersession. This receipt authorizes no occurrence, " +
      "study, cross-product, positive extent, or positive grain inference.",
    reviewed_at: input.acceptance.accepted_at,
    reviewed_by: input.acceptance.accepted_by,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  return { extentDecisions, grainDecisions, absenceReceipt };
}

export function acceptPlan040Package10bDecisionPackage(): {
  extentDecisionPath: string;
  extentDecisionSha256: string;
  grainDecisionPath: string;
  grainDecisionSha256: string;
  absenceReceiptPath: string;
  absenceReceiptSha256: string;
  extentDecisionCount: 3;
  grainDecisionCount: 3;
  absenceCandidateCount: 1;
} {
  for (const [path, expectedSha256, label] of [
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_DRAFT_PATH,
      PLAN040_PACKAGE_10B_DRAFT_SHA256,
      "draft",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GATE_PATH,
      PLAN040_PACKAGE_10B_GATE_SHA256,
      "dual-review gate",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ACCEPTANCE_PATH,
      PLAN040_PACKAGE_10B_ACCEPTANCE_SHA256,
      "owner acceptance",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_GATE_PATH,
      PLAN040_PACKAGE_10B_PATH_REVIEW_GATE_SHA256,
      "path-review gate",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH,
      PLAN040_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_SHA256,
      "path-review supplemental acceptance",
    ],
  ] as const) {
    const actualSha256 = fileSha256(path);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Plan 040 Package 10B ${label} pin drifted: ${actualSha256}`,
      );
    }
  }
  const comparisonReceiptPath = join(
    repoRoot,
    PACKAGE_10B_COMPARISON_RECEIPT_PATH,
  );
  const comparisonReceiptStat = lstatSync(comparisonReceiptPath);
  if (
    !comparisonReceiptStat.isFile() ||
    comparisonReceiptStat.isSymbolicLink() ||
    fileSha256(comparisonReceiptPath) !==
      PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256
  ) {
    throw new Error(
      "Plan 040 Package 10B comparison receipt regular-file pin drifted",
    );
  }
  const draft = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package10bDraft;
  const gate = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GATE_PATH,
      "utf8",
    ),
  ) as Plan040Package10bGateAndAcceptance["gate"];
  const acceptance = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ACCEPTANCE_PATH,
      "utf8",
    ),
  ) as Plan040Package10bGateAndAcceptance["acceptance"];
  const pathReviewGate = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_GATE_PATH,
      "utf8",
    ),
  ) as Plan040Package10bPathReviewAndAcceptance["gate"];
  const pathReviewAcceptance = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH,
      "utf8",
    ),
  ) as Plan040Package10bPathReviewAndAcceptance["acceptance"];
  const accepted = buildPlan040Package10bAcceptedArtifacts({
    draft,
    gate,
    acceptance,
    pathReviewGate,
    pathReviewAcceptance,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_EXTENT_DECISIONS_PATH,
    { decisions: accepted.extentDecisions },
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GRAIN_DECISIONS_PATH,
    { decisions: accepted.grainDecisions },
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ABSENCE_RECEIPT_PATH,
    { receipts: [accepted.absenceReceipt] },
  );
  return {
    extentDecisionPath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_EXTENT_DECISIONS_PATH,
    extentDecisionSha256: fileSha256(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_EXTENT_DECISIONS_PATH,
    ),
    grainDecisionPath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GRAIN_DECISIONS_PATH,
    grainDecisionSha256: fileSha256(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GRAIN_DECISIONS_PATH,
    ),
    absenceReceiptPath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ABSENCE_RECEIPT_PATH,
    absenceReceiptSha256: fileSha256(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ABSENCE_RECEIPT_PATH,
    ),
    extentDecisionCount: 3,
    grainDecisionCount: 3,
    absenceCandidateCount: 1,
  };
}
