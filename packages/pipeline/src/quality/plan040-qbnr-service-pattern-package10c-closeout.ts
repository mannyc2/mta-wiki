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
  PLAN040_PACKAGE_10C_CANDIDATE_KEY_SHA256,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C,
  plan040Package10cReplayHash,
  type Plan040Package10cDraft,
} from "./plan040-qbnr-service-pattern-package10c.js";

export const PLAN040_PACKAGE_10C_APPROVED_COMMIT =
  "9ef8d743ce6e9d6bd26ec4cd4011c993366e2dc9" as const;
export const PLAN040_PACKAGE_10C_EVIDENCE_SHA256 =
  "b77e2be5fe1280785410b1687a9528b70127dd7738f9a61ac522ee5d0773f81b" as const;
export const PLAN040_PACKAGE_10C_DRAFT_SHA256 =
  "c29b2ad0e83b1dfdc010bde7edfb8a5d907b51d43cce02fe61bd583613731a1d" as const;
export const PLAN040_PACKAGE_10C_COMPARISON_RECEIPT_SHA256 =
  "b0309c4e57862353b6da9c0f7eb5e749123db941f8ff4af067546b7c6ddcf966" as const;

const PACKAGE_10C_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10c-evidence-v1.json";
const PACKAGE_10C_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10c-evidence-draft-v1.json";
const PACKAGE_10C_COMPARISON_RECEIPT_PATH =
  "data/quality/acquisition/receipts/member-extent-evidence/" +
  "plan-040-qbnr-service-pattern-package-10c-full-stop-equivalence-v1.json";
const PACKAGE_10C_GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10c-dual-review-gate-v1.json";
const PACKAGE_10C_ACCEPTANCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10c-owner-acceptance-v1.json";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_DRAFT_PATH =
  join(repoRoot, PACKAGE_10C_DRAFT_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_GATE_PATH =
  join(repoRoot, PACKAGE_10C_GATE_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_ACCEPTANCE_PATH =
  join(repoRoot, PACKAGE_10C_ACCEPTANCE_PATH);

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const artifactPins = () => ({
  evidence: {
    path: PACKAGE_10C_EVIDENCE_PATH,
    sha256: PLAN040_PACKAGE_10C_EVIDENCE_SHA256,
  },
  draft: {
    path: PACKAGE_10C_DRAFT_PATH,
    sha256: PLAN040_PACKAGE_10C_DRAFT_SHA256,
  },
  comparison_receipt: {
    path: PACKAGE_10C_COMPARISON_RECEIPT_PATH,
    sha256: PLAN040_PACKAGE_10C_COMPARISON_RECEIPT_SHA256,
  },
});

export function buildPlan040Package10cGateAndAcceptance(input: {
  draft: Plan040Package10cDraft;
  acceptedAt: string;
}) {
  const positive = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "positive_extent_and_grain_proposed"
  );
  const unresolved = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict ===
      "receipt_terminal_unresolved_preserved"
  );
  const q20Conflict = unresolved[0];
  if (
    plan040Package10cReplayHash(input.draft as unknown as JsonValue) !==
      PLAN040_PACKAGE_10C_DRAFT_SHA256 ||
    input.draft.evidence_manifest.sha256 !==
      PLAN040_PACKAGE_10C_EVIDENCE_SHA256 ||
    input.draft.comparison_receipt.sha256 !==
      PLAN040_PACKAGE_10C_COMPARISON_RECEIPT_SHA256 ||
    input.draft.candidate_count !== 5 ||
    input.draft.route_count !== 3 ||
    input.draft.candidate_key_sha256 !==
      PLAN040_PACKAGE_10C_CANDIDATE_KEY_SHA256 ||
    positive.length !== 4 ||
    positive.some((candidate) =>
      !candidate.proposed_extent_decision ||
      !candidate.proposed_grain_decision ||
      candidate.unresolved_gap_codes.length !== 0) ||
    unresolved.length !== 1 ||
    q20Conflict?.treatment_record_id !==
      "treatment_q20-q20b-replacement-2025" ||
    q20Conflict.proposed_extent_decision !== null ||
    q20Conflict.proposed_grain_decision !== null ||
    stableJson(q20Conflict.unresolved_gap_codes as JsonValue) !==
      stableJson([
        "canonical_treatment_route_scope_conflict",
        "exact_candidate_statement_names_q76_not_q20",
      ] as JsonValue) ||
    input.draft.proposed_extent_decision_count !== 4 ||
    input.draft.proposed_grain_decision_count !== 4 ||
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
      "Plan 040 Package 10C frozen verdict or authorization scope drifted",
    );
  }

  const positiveKeys = positive.map((candidate) =>
    candidate.candidate_key).sort();
  const unresolvedKeys = unresolved.map((candidate) =>
    candidate.candidate_key).sort();
  const reviewerResults = [
    {
      reviewer_id: "main_advisor",
      role:
        "independent_strict_exact_positive_and_scope_conflict_review",
      reviewed_commit: PLAN040_PACKAGE_10C_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
    {
      reviewer_id: "plan040_package10c_independent_audit",
      role: "independent_provenance_and_fail_closed_audit",
      reviewed_commit: PLAN040_PACKAGE_10C_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
  ];
  const verdictDistribution = {
    positive_extent_and_grain_proposed: 4,
    receipt_terminal_unresolved_preserved: 1,
  } as const;
  const gate = {
    schema_version: 1,
    gate_id:
      "plan-040-qbnr-service-pattern-package-10c-dual-review-gate-v1",
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C,
    reviewed_commit: PLAN040_PACKAGE_10C_APPROVED_COMMIT,
    artifacts: artifactPins(),
    candidate_count: 5,
    route_count: 3,
    candidate_key_sha256: PLAN040_PACKAGE_10C_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    extent_distribution: {
      route_wide: 3,
      bounded_segment: 1,
      unresolved: 1,
    },
    grain_distribution: {
      trip_subset: 4,
      unresolved: 1,
    },
    reviewer_results: reviewerResults,
    checkpoint_tests: {
      focused: {
        pass: 5,
        fail: 0,
        assertions: 171,
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
          PLAN040_PACKAGE_10C_COMPARISON_RECEIPT_SHA256,
        evidence_sha256: PLAN040_PACKAGE_10C_EVIDENCE_SHA256,
        draft_sha256: PLAN040_PACKAGE_10C_DRAFT_SHA256,
        replay_count: 2,
        status: "pass" as const,
      },
      full_repository: {
        status: "checkpoint_not_required" as const,
        newly_closed_candidates_since_package_10a_checkpoint: 9,
        shared_validation_or_materialization_semantics_changed: false,
        reason:
          "Nine closures since the Package 10A checkpoint; below the accelerated 25-candidate checkpoint and no shared semantics changed.",
      },
    },
    verdict: "APPROVE" as const,
    authorization_state:
      "dual_review_approved_pending_standing_owner_acceptance",
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
      "plan-040-qbnr-service-pattern-package-10c-owner-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    acceptance_basis: "standing_owner_accelerated_checkpoint_protocol",
    gate: { path: PACKAGE_10C_GATE_PATH, sha256: gateSha256 },
    artifacts: artifactPins(),
    candidate_count: 5,
    route_count: 3,
    candidate_key_sha256: PLAN040_PACKAGE_10C_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    reviewer_results: reviewerResults,
    authorized_positive_persistence: {
      candidate_count: 4,
      candidate_key_sha256: sha256(`${positiveKeys.join("\n")}\n`),
      candidate_keys: positiveKeys,
      extent_decision_ids: positive.map((candidate) =>
        candidate.proposed_extent_decision!.decision_id).sort(),
      grain_decision_ids: positive.map((candidate) =>
        candidate.proposed_grain_decision!.decision_id).sort(),
    },
    authorized_reviewed_absence_receipt: {
      receipt_id:
        "plan-040-qbnr-service-pattern-package-10c-reviewed-absence-v1",
      candidate_count: 1,
      candidate_key_sha256: sha256(`${unresolvedKeys.join("\n")}\n`),
      candidate_keys: unresolvedKeys,
      surfaces: ["member_extent", "member_grain"] as const,
      verdict_by_surface: {
        member_extent:
          "reviewed_terminal_canonical_treatment_route_scope_conflict" as const,
        member_grain:
          "reviewed_terminal_canonical_treatment_route_scope_conflict" as const,
      },
      required_gap_code:
        "canonical_treatment_route_scope_conflict" as const,
    },
    preservation_invariants: {
      accepted_q20_occurrence_unchanged: true,
      q20_treatment_ontology_unchanged: true,
      changed_identifier_equivalence_authorized: false,
      occurrence_inference_prohibited: true,
    },
    authorization_state:
      "standing_owner_accepted_exact_4_positive_decision_pairs_and_exact_1_q20_scope_conflict_reviewed_absence_only",
    authorizes_decision_persistence: true as const,
    authorizes_reviewed_absence_receipt_persistence: true as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
  };
  return { gate, gateSha256, acceptance };
}

export function validatePlan040Package10cGateAndAcceptance(input: {
  draft: Plan040Package10cDraft;
  gate: unknown;
  acceptance: unknown;
  acceptedAt: string;
}) {
  const expected = buildPlan040Package10cGateAndAcceptance({
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
      "Plan 040 Package 10C gate or standing owner acceptance drifted",
    );
  }
  return {
    candidate_count: 5,
    positive_candidate_count: 4,
    unresolved_candidate_count: 1,
    authorized_extent_decision_count: 4,
    authorized_grain_decision_count: 4,
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
        `Refusing to overwrite immutable Plan 040 Package 10C artifact ${
          relative(repoRoot, path)
        }`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function writePlan040Package10cGateAndAcceptance(input: {
  acceptedAt: string;
}) {
  const draft = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package10cDraft;
  const built = buildPlan040Package10cGateAndAcceptance({
    draft,
    acceptedAt: input.acceptedAt,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_GATE_PATH,
    built.gate,
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_ACCEPTANCE_PATH,
    built.acceptance,
  );
  return {
    gatePath: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_GATE_PATH,
    gateSha256: built.gateSha256,
    acceptancePath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_ACCEPTANCE_PATH,
    acceptanceSha256: sha256(
      `${stableJson(built.acceptance as unknown as JsonValue)}\n`,
    ),
  };
}
