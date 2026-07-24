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
  PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256,
  PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11,
  plan040Package11ReplayHash,
  type Plan040Package11Draft,
} from "./plan040-qbnr-service-grain-package11.js";

export const PLAN040_PACKAGE_11_APPROVED_COMMIT =
  "249f722078031b96732ad42fb8402fefad08805c" as const;
export const PLAN040_PACKAGE_11_EVIDENCE_SHA256 =
  "5980bdc4723956e36df9734b5180e9eb3b3ecf11d995d1ba75b004326d5ce4d3" as const;
export const PLAN040_PACKAGE_11_DRAFT_SHA256 =
  "c4c0aed52bdeb0d82492857f14afb2d39d5ac1b7a82f4e5deacab7bb2779ff2e" as const;
export const PLAN040_PACKAGE_11_RECEIPT_SHA256 =
  "73ea977e2e3d0365a53e6b817d7429b777abafe1acbd37921d8b2b0d98f9ac89" as const;

const EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-grain-package-11-evidence-v1.json";
const DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-grain-package-11-evidence-draft-v1.json";
const RECEIPT_PATH =
  "data/quality/acquisition/receipts/member-extent-evidence/" +
  "plan-040-qbnr-service-grain-package-11-positive-patterns-v1.json";
const GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-grain-package-11-dual-review-gate-v1.json";
const ACCEPTANCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-grain-package-11-owner-acceptance-v1.json";

export const PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_DRAFT_PATH =
  join(repoRoot, DRAFT_PATH);
export const PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GATE_PATH =
  join(repoRoot, GATE_PATH);
export const PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_ACCEPTANCE_PATH =
  join(repoRoot, ACCEPTANCE_PATH);

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const artifactPins = () => ({
  evidence: {
    path: EVIDENCE_PATH,
    sha256: PLAN040_PACKAGE_11_EVIDENCE_SHA256,
  },
  draft: {
    path: DRAFT_PATH,
    sha256: PLAN040_PACKAGE_11_DRAFT_SHA256,
  },
  positive_pattern_receipt: {
    path: RECEIPT_PATH,
    sha256: PLAN040_PACKAGE_11_RECEIPT_SHA256,
  },
});

export function buildPlan040Package11GateAndAcceptance(input: {
  draft: Plan040Package11Draft;
  acceptedAt: string;
}) {
  const candidates = input.draft.candidates;
  const positiveExtent = candidates.filter((candidate) =>
    candidate.evidence_verdict ===
      "positive_extent_and_grain_proposed");
  const positiveGrain = candidates.filter((candidate) =>
    candidate.evidence_verdict === "positive_grain_only_proposed");
  const unresolved = candidates.filter((candidate) =>
    candidate.evidence_verdict ===
      "structured_unresolved_grain_proposed");
  if (
    plan040Package11ReplayHash(input.draft as unknown as JsonValue) !==
      PLAN040_PACKAGE_11_DRAFT_SHA256 ||
    input.draft.evidence_manifest.sha256 !==
      PLAN040_PACKAGE_11_EVIDENCE_SHA256 ||
    input.draft.positive_pattern_receipt.sha256 !==
      PLAN040_PACKAGE_11_RECEIPT_SHA256 ||
    input.draft.candidate_count !== 12 ||
    input.draft.route_count !== 7 ||
    candidates.length !== 12 ||
    sortedHash(candidates.map((candidate) => candidate.candidate_key)) !==
      PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256 ||
    positiveExtent.length !== 1 ||
    positiveGrain.length !== 4 ||
    unresolved.length !== 7 ||
    positiveExtent[0]?.proposed_extent_decision?.resolution !==
      "bounded_segment" ||
    positiveExtent[0]?.proposed_grain_decision.service_scope.kind !==
      "trip_subset" ||
    positiveGrain.some((candidate) =>
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision.service_scope.kind === "unresolved") ||
    unresolved.some((candidate) =>
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision.service_scope.kind !== "unresolved" ||
      candidate.proposed_grain_decision.service_scope.missing_roles.length ===
        0 ||
      stableJson(
        (candidate.proposed_grain_decision.service_scope.missing_roles as
          unknown) as JsonValue,
      ) !== stableJson(candidate.unresolved_gap_codes as JsonValue)) ||
    candidates.some((candidate) =>
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence) ||
    input.draft.persisted_extent_decision_count !== 0 ||
    input.draft.persisted_grain_decision_count !== 0 ||
    input.draft.external_acquisition_performed ||
    input.draft.authorizes_occurrence ||
    input.draft.authorizes_study ||
    input.draft.authorizes_cross_product ||
    input.draft.authorizes_decision_persistence ||
    input.draft.correction_version_state.comparison_run ||
    input.draft.correction_version_state.outcomes_reclassified
  ) {
    throw new Error(
      "Plan 040 Package 11 frozen verdict or authorization scope drifted",
    );
  }

  const candidateKeys = candidates.map((candidate) =>
    candidate.candidate_key).sort();
  const reviewerResults = [
    {
      reviewer_id: "main_advisor",
      role: "independent_exact_extent_grain_and_blocked_state_review",
      reviewed_commit: PLAN040_PACKAGE_11_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
    {
      reviewer_id: "plan040_package11_independent_audit",
      role: "independent_provenance_schedule_and_preservation_audit",
      reviewed_commit: PLAN040_PACKAGE_11_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
  ];
  const verdictDistribution = {
    positive_extent_and_grain_proposed: 1,
    positive_grain_only_proposed: 4,
    structured_unresolved_grain_proposed: 7,
  } as const;
  const gate = {
    schema_version: 1,
    gate_id:
      "plan-040-qbnr-service-grain-package-11-dual-review-gate-v1",
    package_id: PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11,
    reviewed_commit: PLAN040_PACKAGE_11_APPROVED_COMMIT,
    artifacts: artifactPins(),
    candidate_count: 12,
    route_count: 7,
    candidate_key_sha256: PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    extent_distribution: { bounded_segment: 1 },
    grain_distribution: {
      periods: 1,
      trip_subset: 3,
      all_service: 1,
      unresolved: 7,
    },
    reviewer_results: reviewerResults,
    checkpoint_tests: {
      focused: {
        pass: 16,
        fail: 0,
        assertions: 111,
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
        receipt_sha256: PLAN040_PACKAGE_11_RECEIPT_SHA256,
        evidence_sha256: PLAN040_PACKAGE_11_EVIDENCE_SHA256,
        draft_sha256: PLAN040_PACKAGE_11_DRAFT_SHA256,
        status: "pass" as const,
      },
      full_repository: {
        status: "deferred_to_owner_checkpoint" as const,
        shared_validation_or_materialization_semantics_changed: false,
      },
    },
    verdict: "APPROVE" as const,
    authorization_state:
      "dual_review_approved_pending_explicit_owner_acceptance",
    authorizes_decision_persistence: false as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
    authorizes_ontology: false as const,
    authorizes_corrections: false as const,
  };
  const gateSha256 = sha256(
    `${stableJson(gate as unknown as JsonValue)}\n`,
  );
  const acceptance = {
    schema_version: 1,
    acceptance_id:
      "plan-040-qbnr-service-grain-package-11-owner-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    acceptance_basis: "explicit_owner_accelerated_package_wide_acceptance",
    gate: { path: GATE_PATH, sha256: gateSha256 },
    artifacts: artifactPins(),
    candidate_count: 12,
    route_count: 7,
    candidate_key_sha256: PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    reviewer_results: reviewerResults,
    authorized_exact_persistence: {
      candidate_count: 12,
      candidate_key_sha256: sortedHash(candidateKeys),
      candidate_keys: candidateKeys,
      extent_decision_count: 1,
      extent_decision_ids: positiveExtent.map((candidate) =>
        candidate.proposed_extent_decision!.decision_id).sort(),
      grain_decision_count: 12,
      grain_decision_ids: candidates.map((candidate) =>
        candidate.proposed_grain_decision.decision_id).sort(),
      terminal_resolved_grain_count: 5,
      terminal_blocked_upstream_grain_count: 7,
    },
    preservation_invariants: {
      existing_grain_only_extent_decisions_byte_identical: true,
      occurrence_decisions_unchanged: true,
      study_authorization_unchanged: true,
      cross_product_authorization_unchanged: true,
      treatment_ontology_unchanged: true,
      correction_state_unchanged: true,
      exclusions_unchanged: true,
      package_12_frozen_bytes_unchanged: true,
      absence_projection_prohibited_for_unresolved_grain: true,
    },
    authorization_state:
      "owner_accepted_exact_1_extent_and_12_grain_decisions_only",
    authorizes_decision_persistence: true as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
    authorizes_ontology: false as const,
    authorizes_corrections: false as const,
  };
  return { gate, gateSha256, acceptance };
}

export function validatePlan040Package11GateAndAcceptance(input: {
  draft: Plan040Package11Draft;
  gate: unknown;
  acceptance: unknown;
  acceptedAt: string;
}) {
  const expected = buildPlan040Package11GateAndAcceptance({
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
      "Plan 040 Package 11 gate or owner acceptance drifted",
    );
  }
  return {
    candidate_count: 12,
    authorized_extent_decision_count: 1,
    authorized_grain_decision_count: 12,
    terminal_blocked_upstream_grain_count: 7,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
    authorizes_ontology: false as const,
    authorizes_corrections: false as const,
  };
}

function writeImmutableJson(path: string, value: unknown): void {
  const contents = `${stableJson(value as JsonValue)}\n`;
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== contents) {
      throw new Error(
        `Refusing to overwrite immutable Plan 040 Package 11 artifact ${
          relative(repoRoot, path)
        }`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function writePlan040Package11GateAndAcceptance(input: {
  acceptedAt: string;
}) {
  const draft = JSON.parse(
    readFileSync(PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_DRAFT_PATH, "utf8"),
  ) as Plan040Package11Draft;
  const built = buildPlan040Package11GateAndAcceptance({
    draft,
    acceptedAt: input.acceptedAt,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GATE_PATH,
    built.gate,
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_ACCEPTANCE_PATH,
    built.acceptance,
  );
  return {
    gatePath: PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GATE_PATH,
    gateSha256: built.gateSha256,
    acceptancePath: PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_ACCEPTANCE_PATH,
    acceptanceSha256: sha256(
      `${stableJson(built.acceptance as unknown as JsonValue)}\n`,
    ),
  };
}
