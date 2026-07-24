import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A,
  plan040Package10aReplayHash,
  type Plan040Package10aDraft,
} from "./plan040-qbnr-service-pattern-package10a.js";

export const PLAN040_PACKAGE_10A_REVIEWED_COMMIT =
  "44b8812c1d54ae2b60116e6244530d76d26d53c7" as const;
export const PLAN040_PACKAGE_10A_EVIDENCE_SHA256 =
  "2d0bb750a8ecec2dcd2f686085669007696f96476aa3fe6af1d1c4156923acc6" as const;
export const PLAN040_PACKAGE_10A_DRAFT_SHA256 =
  "e7b2c7b030d1a4a992f55b94a80e0f9c236fa284c9482a5ee50935c0d0c2814e" as const;

const PACKAGE_10A_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10a-evidence-v1.json";
const PACKAGE_10A_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10a-evidence-draft-v1.json";
const PACKAGE_10A_GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10a-independent-review-gate-v1.json";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_DRAFT_PATH =
  join(repoRoot, PACKAGE_10A_DRAFT_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_GATE_PATH =
  join(repoRoot, PACKAGE_10A_GATE_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ACCEPTANCE_PATH =
  join(
    repoRoot,
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-10a-owner-acceptance-v1.json",
  );

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const artifactPins = () => ({
  evidence: {
    path: PACKAGE_10A_EVIDENCE_PATH,
    sha256: PLAN040_PACKAGE_10A_EVIDENCE_SHA256,
  },
  draft: {
    path: PACKAGE_10A_DRAFT_PATH,
    sha256: PLAN040_PACKAGE_10A_DRAFT_SHA256,
  },
});

export function buildPlan040Package10aGateAndAcceptance(input: {
  draft: Plan040Package10aDraft;
  acceptedAt: string;
}) {
  const replayHash = plan040Package10aReplayHash(
    input.draft as unknown as JsonValue,
  );
  const unresolved = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "receipt_terminal_unresolved"
  );
  const positive = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict !== "receipt_terminal_unresolved"
  );
  if (
    replayHash !== PLAN040_PACKAGE_10A_DRAFT_SHA256 ||
    input.draft.evidence_manifest.sha256 !==
      PLAN040_PACKAGE_10A_EVIDENCE_SHA256 ||
    input.draft.candidate_count !== 4 ||
    input.draft.route_count !== 4 ||
    input.draft.candidate_key_sha256 !==
      PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256 ||
    positive.length !== 0 ||
    unresolved.length !== 4 ||
    unresolved.some((candidate) =>
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0 ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence
    ) ||
    input.draft.proposed_extent_decision_count !== 0 ||
    input.draft.proposed_grain_decision_count !== 0 ||
    input.draft.persisted_extent_decision_count !== 0 ||
    input.draft.persisted_grain_decision_count !== 0 ||
    input.draft.authorizes_occurrence ||
    input.draft.authorizes_study ||
    input.draft.authorizes_cross_product ||
    input.draft.authorizes_decision_persistence
  ) {
    throw new Error(
      "Plan 040 Package 10A frozen verdict or authorization scope drifted",
    );
  }
  const unresolvedKeys = unresolved.map((candidate) =>
    candidate.candidate_key
  ).sort();
  const unresolvedKeySha256 = sha256(`${unresolvedKeys.join("\n")}\n`);
  if (
    unresolvedKeySha256 !== PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256
  ) {
    throw new Error("Plan 040 Package 10A unresolved key scope drifted");
  }
  const verdictDistribution = {
    evidence_complete_positive_draft: 0,
    receipt_terminal_unresolved: 4,
  } as const;
  const reviewerResult = {
    reviewer_id: "main_advisor",
    role: "independent_fail_closed_evidence_review",
    reviewed_commit: PLAN040_PACKAGE_10A_REVIEWED_COMMIT,
    verdict: "APPROVE" as const,
  };
  const gate = {
    schema_version: 1,
    gate_id:
      "plan-040-qbnr-service-pattern-package-10a-independent-review-gate-v1",
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A,
    artifacts: artifactPins(),
    candidate_count: 4,
    candidate_key_sha256: PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    authorization_state:
      "independent_review_approved_pending_owner_delegate_acceptance",
    reviewer_result: reviewerResult,
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
      "plan-040-qbnr-service-pattern-package-10a-owner-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    gate: { path: PACKAGE_10A_GATE_PATH, sha256: gateSha256 },
    artifacts: artifactPins(),
    candidate_count: 4,
    candidate_key_sha256: PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    reviewer_result: reviewerResult,
    authorized_positive_persistence: {
      candidate_count: 0,
      candidate_keys: [] as string[],
      extent_decision_ids: [] as string[],
      grain_decision_ids: [] as string[],
    },
    authorized_reviewed_absence_receipt: {
      receipt_id:
        "plan-040-qbnr-service-pattern-package-10a-reviewed-absence-v1",
      candidate_count: 4,
      candidate_key_sha256: unresolvedKeySha256,
      candidate_keys: unresolvedKeys,
      surfaces: ["member_extent", "member_grain"] as const,
      verdict_by_surface: {
        member_extent: "reviewed_terminal_unresolved" as const,
        member_grain: "reviewed_terminal_unresolved" as const,
      },
    },
    authorization_state:
      "owner_delegate_accepted_exact_4_key_reviewed_absence_only",
    authorizes_decision_persistence: false as const,
    authorizes_reviewed_absence_receipt_persistence: true as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
  };
  return { gate, gateSha256, acceptance };
}

export function validatePlan040Package10aGateAndAcceptance(input: {
  draft: Plan040Package10aDraft;
  gate: unknown;
  acceptance: unknown;
  acceptedAt: string;
}) {
  const expected = buildPlan040Package10aGateAndAcceptance({
    draft: input.draft,
    acceptedAt: input.acceptedAt,
  });
  if (
    stableJson(input.gate as JsonValue) !==
      stableJson(expected.gate as unknown as JsonValue)
  ) {
    throw new Error("Plan 040 Package 10A independent-review gate drifted");
  }
  if (
    stableJson(input.acceptance as JsonValue) !==
      stableJson(expected.acceptance as unknown as JsonValue)
  ) {
    throw new Error(
      "Plan 040 Package 10A owner/delegate acceptance drifted",
    );
  }
  return {
    candidate_count: 4,
    positive_candidate_count: 0,
    unresolved_candidate_count: 4,
    authorized_extent_decision_count: 0,
    authorized_grain_decision_count: 0,
    authorized_absence_candidate_count: 4,
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
        `Refusing to overwrite immutable Plan 040 Package 10A artifact ${
          relative(repoRoot, path)
        }`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function writePlan040Package10aGateAndAcceptance(input: {
  acceptedAt: string;
}) {
  const draft = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package10aDraft;
  const built = buildPlan040Package10aGateAndAcceptance({
    draft,
    acceptedAt: input.acceptedAt,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_GATE_PATH,
    built.gate,
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ACCEPTANCE_PATH,
    built.acceptance,
  );
  return {
    gatePath: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_GATE_PATH,
    gateSha256: built.gateSha256,
    acceptancePath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ACCEPTANCE_PATH,
    acceptanceSha256: sha256(
      `${stableJson(built.acceptance as unknown as JsonValue)}\n`,
    ),
  };
}
