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
  PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12,
  PLAN040_PACKAGE_12_CANDIDATE_KEY_SHA256,
  plan040Package12ReplayHash,
  type Plan040Package12Draft,
} from "./plan040-flatbush-physical-grain-package12.js";

export const PLAN040_PACKAGE_12_APPROVED_COMMIT =
  "b578b8f8d8e3ac460fd6e4e07f109afe6c5112c5" as const;
export const PLAN040_PACKAGE_12_EVIDENCE_SHA256 =
  "4134a3afc2ce8c2f6fcecd9b12f941c1967511f1401132620b3750d916bc7736" as const;
export const PLAN040_PACKAGE_12_DRAFT_SHA256 =
  "60095cd79d13f3174961a93aec1cfae5f5e481f6373914a2075502a7a8a7c23b" as const;

const EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-flatbush-physical-grain-package-12-evidence-v1.json";
const DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-flatbush-physical-grain-package-12-evidence-draft-v1.json";
const GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-flatbush-physical-grain-package-12-dual-review-gate-v1.json";
const ACCEPTANCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-flatbush-physical-grain-package-12-owner-acceptance-v1.json";

export const PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_DRAFT_PATH =
  join(repoRoot, DRAFT_PATH);
export const PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GATE_PATH =
  join(repoRoot, GATE_PATH);
export const PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_ACCEPTANCE_PATH =
  join(repoRoot, ACCEPTANCE_PATH);

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const artifactPins = () => ({
  evidence: {
    path: EVIDENCE_PATH,
    sha256: PLAN040_PACKAGE_12_EVIDENCE_SHA256,
  },
  draft: {
    path: DRAFT_PATH,
    sha256: PLAN040_PACKAGE_12_DRAFT_SHA256,
  },
});

export function buildPlan040Package12GateAndAcceptance(input: {
  draft: Plan040Package12Draft;
  acceptedAt: string;
}) {
  const candidates = input.draft.candidates;
  if (
    plan040Package12ReplayHash(input.draft as unknown as JsonValue) !==
      PLAN040_PACKAGE_12_DRAFT_SHA256 ||
    input.draft.evidence_manifest.sha256 !==
      PLAN040_PACKAGE_12_EVIDENCE_SHA256 ||
    input.draft.candidate_count !== 2 ||
    input.draft.route_count !== 2 ||
    input.draft.candidate_key_sha256 !==
      PLAN040_PACKAGE_12_CANDIDATE_KEY_SHA256 ||
    candidates.length !== 2 ||
    candidates.some((candidate) =>
      candidate.evidence_verdict !==
        "positive_grain_not_applicable_proposed" ||
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision.service_scope.kind !==
        "not_applicable" ||
      candidate.proposed_grain_decision.lineage_segments.length !== 0 ||
      candidate.proposed_grain_decision.member_extent_decision_id === null ||
      candidate.source_binding.raw_source_packet_present ||
      !candidate.source_binding.canonical_and_submission_evidence_frozen ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence) ||
    !input.draft.source_packet_state.accepted_submission_journal_frozen ||
    !input.draft.source_packet_state.canonical_evidence_ref_frozen ||
    input.draft.source_packet_state.raw_source_packet_present ||
    input.draft.proposed_extent_decision_count !== 0 ||
    input.draft.persisted_extent_decision_count !== 0 ||
    input.draft.persisted_grain_decision_count !== 0 ||
    input.draft.external_acquisition_performed ||
    input.draft.authorizes_occurrence ||
    input.draft.authorizes_study ||
    input.draft.authorizes_cross_product ||
    input.draft.authorizes_decision_persistence
  ) {
    throw new Error(
      "Plan 040 Package 12 frozen verdict or authorization scope drifted",
    );
  }

  const candidateKeys = candidates.map((candidate) =>
    candidate.candidate_key).sort();
  const reviewerResults = [
    {
      reviewer_id: "main_advisor",
      role: "independent_physical_grain_and_extent_link_review",
      reviewed_commit: PLAN040_PACKAGE_12_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
    {
      reviewer_id: "plan040_package12_independent_audit",
      role: "independent_source_gap_and_nonauthority_audit",
      reviewed_commit: PLAN040_PACKAGE_12_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
  ];
  const verdictDistribution = {
    positive_grain_not_applicable_proposed: 2,
  } as const;
  const gate = {
    schema_version: 1,
    gate_id:
      "plan-040-flatbush-physical-grain-package-12-dual-review-gate-v1",
    package_id: PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12,
    reviewed_commit: PLAN040_PACKAGE_12_APPROVED_COMMIT,
    artifacts: artifactPins(),
    candidate_count: 2,
    route_count: 2,
    candidate_key_sha256: PLAN040_PACKAGE_12_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    extent_distribution: {},
    grain_distribution: { not_applicable: 2 },
    reviewer_results: reviewerResults,
    source_gap_state: {
      raw_source_packet_present: false,
      accepted_submission_journal_frozen: true,
      canonical_evidence_ref_frozen: true,
      authorizes_external_fact_inference: false,
    },
    checkpoint_tests: {
      focused: {
        pass: 21,
        fail: 0,
        assertions: 168,
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
        evidence_sha256: PLAN040_PACKAGE_12_EVIDENCE_SHA256,
        draft_sha256: PLAN040_PACKAGE_12_DRAFT_SHA256,
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
      "plan-040-flatbush-physical-grain-package-12-owner-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    acceptance_basis: "explicit_owner_accelerated_package_wide_acceptance",
    gate: { path: GATE_PATH, sha256: gateSha256 },
    artifacts: artifactPins(),
    candidate_count: 2,
    route_count: 2,
    candidate_key_sha256: PLAN040_PACKAGE_12_CANDIDATE_KEY_SHA256,
    verdict_distribution: verdictDistribution,
    reviewer_results: reviewerResults,
    authorized_exact_persistence: {
      candidate_count: 2,
      candidate_key_sha256: sortedHash(candidateKeys),
      candidate_keys: candidateKeys,
      extent_decision_count: 0,
      extent_decision_ids: [] as string[],
      grain_decision_count: 2,
      grain_decision_ids: candidates.map((candidate) =>
        candidate.proposed_grain_decision.decision_id).sort(),
      not_applicable_grain_count: 2,
    },
    preservation_invariants: {
      existing_extent_decisions_byte_identical: true,
      occurrence_decisions_unchanged: true,
      study_outputs_unchanged: true,
      cross_product_authorization_unchanged: true,
      treatment_ontology_unchanged: true,
      missing_raw_source_preserved: true,
      source_gap_nonauthorizing: true,
      external_acquisition_prohibited: true,
    },
    authorization_state:
      "owner_accepted_exact_2_not_applicable_grain_decisions_only",
    authorizes_decision_persistence: true as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
    authorizes_ontology: false as const,
    authorizes_corrections: false as const,
  };
  return { gate, gateSha256, acceptance };
}

export function validatePlan040Package12GateAndAcceptance(input: {
  draft: Plan040Package12Draft;
  gate: unknown;
  acceptance: unknown;
  acceptedAt: string;
}) {
  const expected = buildPlan040Package12GateAndAcceptance({
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
      "Plan 040 Package 12 gate or owner acceptance drifted",
    );
  }
  return {
    candidate_count: 2,
    authorized_extent_decision_count: 0,
    authorized_grain_decision_count: 2,
    not_applicable_grain_count: 2,
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
        `Refusing to overwrite immutable Plan 040 Package 12 artifact ${
          relative(repoRoot, path)
        }`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function writePlan040Package12GateAndAcceptance(input: {
  acceptedAt: string;
}) {
  const draft = JSON.parse(
    readFileSync(
      PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package12Draft;
  const built = buildPlan040Package12GateAndAcceptance({
    draft,
    acceptedAt: input.acceptedAt,
  });
  writeImmutableJson(
    PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GATE_PATH,
    built.gate,
  );
  writeImmutableJson(
    PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_ACCEPTANCE_PATH,
    built.acceptance,
  );
  return {
    gatePath: PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GATE_PATH,
    gateSha256: built.gateSha256,
    acceptancePath:
      PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_ACCEPTANCE_PATH,
    acceptanceSha256: sha256(
      `${stableJson(built.acceptance as unknown as JsonValue)}\n`,
    ),
  };
}
