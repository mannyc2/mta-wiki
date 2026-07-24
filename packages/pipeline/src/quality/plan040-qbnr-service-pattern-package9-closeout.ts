import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  PLAN040_PACKAGE_9_CANDIDATE_KEY_SHA256,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9,
  plan040Package9ReplayHash,
  type Plan040Package9Draft,
} from "./plan040-qbnr-service-pattern-package9.js";

export const PLAN040_PACKAGE_9_INITIAL_REVIEWED_COMMIT =
  "8328b43624ae2b18e695c27ddb4f07dc5fc96e00" as const;
export const PLAN040_PACKAGE_9_APPROVED_COMMIT =
  "2f3864d2973dc2aa8c75b3fc542525caa95d575b" as const;
export const PLAN040_PACKAGE_9_EVIDENCE_SHA256 =
  "376a3e9f184a24530d344eea0f53842fabce2e83ab2eb12b21bc59fd7ee10a7c" as const;
export const PLAN040_PACKAGE_9_DRAFT_SHA256 =
  "a35e7baa10736e65ee432394313dde58a790c2184015920df613d573e8628481" as const;

const PACKAGE_9_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-9-evidence-v1.json";
const PACKAGE_9_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-9-evidence-draft-v1.json";
const PACKAGE_9_GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-9-dual-review-gate-v1.json";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_DRAFT_PATH =
  join(repoRoot, PACKAGE_9_DRAFT_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_GATE_PATH =
  join(repoRoot, PACKAGE_9_GATE_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_ACCEPTANCE_PATH =
  join(
    repoRoot,
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-9-owner-acceptance-v1.json",
  );

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const artifactPins = () => ({
  evidence: {
    path: PACKAGE_9_EVIDENCE_PATH,
    sha256: PLAN040_PACKAGE_9_EVIDENCE_SHA256,
  },
  draft: {
    path: PACKAGE_9_DRAFT_PATH,
    sha256: PLAN040_PACKAGE_9_DRAFT_SHA256,
  },
});

export function buildPlan040Package9GateAndAcceptance(input: {
  draft: Plan040Package9Draft;
  acceptedAt: string;
}) {
  const replayHash = plan040Package9ReplayHash(
    input.draft as unknown as JsonValue,
  );
  const positive = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "evidence_complete_positive_draft");
  const unresolved = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "receipt_terminal_unresolved");
  if (
    replayHash !== PLAN040_PACKAGE_9_DRAFT_SHA256 ||
    input.draft.candidate_count !== 22 ||
    input.draft.route_count !== 10 ||
    input.draft.candidate_key_sha256 !==
      PLAN040_PACKAGE_9_CANDIDATE_KEY_SHA256 ||
    positive.length !== 2 ||
    unresolved.length !== 20 ||
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
    input.draft.package_9_persistence_delta.new_receipt_count !== 0 ||
    input.draft.package_9_persistence_delta.prior_state_mutation_count !==
      0 ||
    input.draft.authorizes_occurrence ||
    input.draft.authorizes_study ||
    input.draft.authorizes_cross_product ||
    input.draft.authorizes_decision_persistence
  ) {
    throw new Error(
      "Plan 040 Package 9 frozen verdict or authorization scope drifted",
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
      reviewer_id: "main_advisor",
      reviewed_commit: PLAN040_PACKAGE_9_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
    {
      reviewer_id: "plan040_package9_independent_audit",
      reviewed_commit: PLAN040_PACKAGE_9_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
  ];
  const verdictDistribution = {
    evidence_complete_positive_draft: 2,
    receipt_terminal_unresolved: 20,
  } as const;
  const gate = {
    schema_version: 1,
    gate_id:
      "plan-040-qbnr-service-pattern-package-9-dual-review-gate-v1",
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9,
    artifacts: artifactPins(),
    candidate_count: 22,
    verdict_distribution: verdictDistribution,
    authorization_state:
      "dual_review_approved_pending_owner_delegate_acceptance",
    reviewer_results: reviewerResults,
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
      "plan-040-qbnr-service-pattern-package-9-owner-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    gate: { path: PACKAGE_9_GATE_PATH, sha256: gateSha256 },
    artifacts: artifactPins(),
    candidate_count: 22,
    candidate_key_sha256: input.draft.candidate_key_sha256,
    verdict_distribution: verdictDistribution,
    reviewer_results: reviewerResults,
    authorized_positive_persistence: {
      candidate_count: 2,
      candidate_key_sha256: positiveKeySha256,
      candidate_keys: positiveKeys,
      extent_decision_ids: extentDecisionIds,
      grain_decision_ids: grainDecisionIds,
    },
    authorized_reviewed_absence_receipt: {
      receipt_id:
        "plan-040-qbnr-service-pattern-package-9-reviewed-absence-v1",
      candidate_count: 20,
      candidate_key_sha256: unresolvedKeySha256,
      candidate_keys: unresolvedKeys,
      surfaces: ["member_extent", "member_grain"] as const,
      verdict_by_surface: {
        member_extent: "reviewed_terminal_unresolved" as const,
        member_grain: "reviewed_terminal_unresolved" as const,
      },
    },
    authorization_state:
      "owner_delegate_accepted_exact_2_positive_decision_pairs_and_exact_20_key_reviewed_absence_only",
    authorizes_decision_persistence: true as const,
    authorizes_reviewed_absence_receipt_persistence: true as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
  };
  return { gate, gateSha256, acceptance };
}

export function validatePlan040Package9GateAndAcceptance(input: {
  draft: Plan040Package9Draft;
  gate: unknown;
  acceptance: unknown;
  acceptedAt: string;
}) {
  const expected = buildPlan040Package9GateAndAcceptance({
    draft: input.draft,
    acceptedAt: input.acceptedAt,
  });
  if (
    stableJson(input.gate as JsonValue) !==
      stableJson(expected.gate as unknown as JsonValue)
  ) {
    throw new Error("Plan 040 Package 9 dual-review gate drifted");
  }
  if (
    stableJson(input.acceptance as JsonValue) !==
      stableJson(expected.acceptance as unknown as JsonValue)
  ) {
    throw new Error(
      "Plan 040 Package 9 owner/delegate acceptance drifted",
    );
  }
  return {
    candidate_count: 22,
    positive_candidate_count: 2,
    unresolved_candidate_count: 20,
    authorized_extent_decision_count: 2,
    authorized_grain_decision_count: 2,
    authorized_absence_candidate_count: 20,
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
        `Refusing to overwrite immutable Plan 040 Package 9 artifact ${
          relative(repoRoot, path)
        }`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function writePlan040Package9GateAndAcceptance(input: {
  acceptedAt: string;
}) {
  const draft = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package9Draft;
  const built = buildPlan040Package9GateAndAcceptance({
    draft,
    acceptedAt: input.acceptedAt,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_GATE_PATH,
    built.gate,
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_ACCEPTANCE_PATH,
    built.acceptance,
  );
  return {
    gatePath: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_GATE_PATH,
    gateSha256: built.gateSha256,
    acceptancePath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_ACCEPTANCE_PATH,
    acceptanceSha256: sha256(
      `${stableJson(built.acceptance as unknown as JsonValue)}\n`,
    ),
  };
}
