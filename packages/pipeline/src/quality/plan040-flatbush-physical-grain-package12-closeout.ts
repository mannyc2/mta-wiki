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
import { fileSha256 } from "../reference/snapshot-registry.js";
import {
  memberGrainDecisionKey,
  parseMemberGrainDecision,
  type MemberGrainDecision,
} from "./member-grain-decisions.js";
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
export const PLAN040_PACKAGE_12_GATE_SHA256 =
  "117cd3568c9381c45461aa273002c44a2705bafd39be9fb0cb934a2376857fb6" as const;
export const PLAN040_PACKAGE_12_ACCEPTANCE_SHA256 =
  "42b95822f68cc47441ff56492b662e2ea78fa3b4973794908ef459ec122bb8b6" as const;
export const PLAN040_PACKAGE_12_GRAIN_DECISIONS_SHA256 =
  "e0c1129bbaa8e2dae377b0d412171cef748e1a04de158cba2388019d308a2f59";
export const PLAN040_PACKAGE_12_POST_PERSISTENCE_PINS = {
  extent_ledger:
    "06323143214794dc50628239cd67c0b641704ad9c2b9b25883f26b60c06f3daf",
  grain_ledger:
    "eaa4803cc4e8ef9c07beef4014eb2f82c5b9aafd8e9d899514320f6c7f7120f7",
  bridge_ledger:
    "c053736116774006a40a15e218a97e60e575785a6fbf6c6fccce5c8abd904cfd",
  study_manifest:
    "ea552dd8ed6eb3622b41547be4960eb125591b12efe5d590a42a5ca5ebafc874",
  member_extent_contract:
    "11b15f1419b36c5b125e9a57545ae5e97bac9c0877b0585df5c2d28472fc4e21",
  member_extent_manifest:
    "44a66c5f1652f2a2e35ee5b383d6b5cc806964bee4fc768b9a56cabba239ed42",
  member_extent_review_ledger:
    "c390b19ca4a0c5e7bdfba1541230c59ec2899c9f6669237604e46381da23eb15",
  member_extent_summary:
    "e5ecc67539eeabcf1359628d4587cf5b57978f4313fc8ce6ed97bcd5f8190c88",
  operational_occurrences:
    "6cb8654efee370d7444405ce3a0cdb8ce6fa394e6ada2347982cbec49df701ef",
  operational_occurrence_decisions:
    "80e530c9953e59a767afcb2f0d61202d9a9209469075f41f993fe7469ee45883",
  treatment_components:
    "a9b76c3b7121fc87d0f190a44fb00f182229d8d309968d3ba00a8c27a1492bae",
  reviewed_candidate_packets:
    "0ac700c48740fff5eb36b626b8dee72f95212378c0b40bc3dc6265b32c3d5844",
} as const;

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
export const PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GRAIN_DECISIONS_PATH =
  join(
    repoRoot,
    "data/quality/operational-reference/member-grain-decisions/" +
      "plan-040-flatbush-physical-grain-package-12-v1.json",
  );

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

type Plan040Package12GateAndAcceptance =
  ReturnType<typeof buildPlan040Package12GateAndAcceptance>;

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
      `Plan 040 Package 12 ${label} drifted outside owner acceptance`,
    );
  }
}

export function buildPlan040Package12AcceptedArtifacts(input: {
  draft: Plan040Package12Draft;
  gate: Plan040Package12GateAndAcceptance["gate"];
  acceptance: Plan040Package12GateAndAcceptance["acceptance"];
}): {
  grainDecisions: MemberGrainDecision[];
} {
  validatePlan040Package12GateAndAcceptance({
    draft: input.draft,
    gate: input.gate,
    acceptance: input.acceptance,
    acceptedAt: input.acceptance.accepted_at,
  });
  if (
    input.gate.verdict !== "APPROVE" ||
    input.gate.reviewer_results.some((review) =>
      review.verdict !== "APPROVE") ||
    input.acceptance.authorization_state !==
      "owner_accepted_exact_2_not_applicable_grain_decisions_only" ||
    !input.acceptance.authorizes_decision_persistence ||
    input.acceptance.authorizes_occurrence ||
    input.acceptance.authorizes_study ||
    input.acceptance.authorizes_cross_product ||
    input.acceptance.authorizes_ontology ||
    input.acceptance.authorizes_corrections ||
    !input.acceptance.preservation_invariants
      .existing_extent_decisions_byte_identical ||
    !input.acceptance.preservation_invariants
      .occurrence_decisions_unchanged ||
    !input.acceptance.preservation_invariants.study_outputs_unchanged ||
    !input.acceptance.preservation_invariants
      .cross_product_authorization_unchanged ||
    !input.acceptance.preservation_invariants
      .treatment_ontology_unchanged ||
    !input.acceptance.preservation_invariants.missing_raw_source_preserved ||
    !input.acceptance.preservation_invariants.source_gap_nonauthorizing ||
    !input.acceptance.preservation_invariants.external_acquisition_prohibited ||
    existsSync(join(
      repoRoot,
      "raw/sources/nyc_dot_flatbush_installation_begins_2025",
    ))
  ) {
    throw new Error(
      "Plan 040 Package 12 acceptance does not authorize this persistence scope",
    );
  }
  const candidates = input.draft.candidates;
  if (
    candidates.length !== 2 ||
    candidates.some((candidate) =>
      candidate.evidence_verdict !==
        "positive_grain_not_applicable_proposed" ||
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision.service_scope.kind !==
        "not_applicable" ||
      candidate.proposed_grain_decision.lineage_segments.length !== 0 ||
      candidate.proposed_grain_decision.member_extent_decision_id !==
        candidate.prior_ledger_state.extent_row.verdict_basis?.replace(
          /^review:/u,
          "",
        ) ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence)
  ) {
    throw new Error(
      "Plan 040 Package 12 persistence verdict split drifted",
    );
  }
  assertExactValues(
    input.acceptance.authorized_exact_persistence.candidate_keys,
    candidates.map((candidate) => candidate.candidate_key),
    "candidate keys",
  );
  assertExactValues(
    input.acceptance.authorized_exact_persistence.extent_decision_ids,
    [],
    "extent decision ids",
  );
  assertExactValues(
    input.acceptance.authorized_exact_persistence.grain_decision_ids,
    candidates.map((candidate) =>
      candidate.proposed_grain_decision.decision_id),
    "grain decision ids",
  );
  const grainDecisions = candidates.map((candidate) => {
    const decision = parseMemberGrainDecision({
      ...candidate.proposed_grain_decision,
      reviewed_at: input.acceptance.accepted_at,
      reviewed_by: input.acceptance.accepted_by,
    });
    if (
      memberGrainDecisionKey(decision) !== candidate.candidate_key ||
      decision.member_extent_decision_id !==
        candidate.proposed_grain_decision.member_extent_decision_id ||
      decision.service_scope.kind !== "not_applicable" ||
      decision.lineage_segments.length !== 0
    ) {
      throw new Error(
        `${candidate.gtfs_route_id}: accepted not_applicable grain drifted`,
      );
    }
    return decision;
  }).sort((left, right) =>
    memberGrainDecisionKey(left).localeCompare(
      memberGrainDecisionKey(right),
    ));
  if (
    grainDecisions.length !== 2 ||
    grainDecisions.some((decision) =>
      decision.service_scope.kind !== "not_applicable")
  ) {
    throw new Error(
      "Plan 040 Package 12 accepted decision distribution drifted",
    );
  }
  return { grainDecisions };
}

export function acceptPlan040Package12DecisionPackage(): {
  grainDecisionPath: string;
  grainDecisionSha256: string;
  grainDecisionCount: 2;
} {
  for (const [path, expectedSha256, label] of [
    [
      join(repoRoot, EVIDENCE_PATH),
      PLAN040_PACKAGE_12_EVIDENCE_SHA256,
      "evidence",
    ],
    [
      PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_DRAFT_PATH,
      PLAN040_PACKAGE_12_DRAFT_SHA256,
      "draft",
    ],
    [
      PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GATE_PATH,
      PLAN040_PACKAGE_12_GATE_SHA256,
      "dual-review gate",
    ],
    [
      PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_ACCEPTANCE_PATH,
      PLAN040_PACKAGE_12_ACCEPTANCE_SHA256,
      "owner acceptance",
    ],
  ] as const) {
    const actualSha256 = fileSha256(path);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Plan 040 Package 12 ${label} pin drifted: ${actualSha256}`,
      );
    }
  }
  const draft = JSON.parse(
    readFileSync(
      PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package12Draft;
  const gate = JSON.parse(
    readFileSync(
      PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GATE_PATH,
      "utf8",
    ),
  ) as Plan040Package12GateAndAcceptance["gate"];
  const acceptance = JSON.parse(
    readFileSync(
      PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_ACCEPTANCE_PATH,
      "utf8",
    ),
  ) as Plan040Package12GateAndAcceptance["acceptance"];
  const accepted = buildPlan040Package12AcceptedArtifacts({
    draft,
    gate,
    acceptance,
  });
  writeImmutableJson(
    PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GRAIN_DECISIONS_PATH,
    { decisions: accepted.grainDecisions },
  );
  const grainDecisionSha256 = fileSha256(
    PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GRAIN_DECISIONS_PATH,
  );
  if (
    PLAN040_PACKAGE_12_GRAIN_DECISIONS_SHA256 &&
    grainDecisionSha256 !== PLAN040_PACKAGE_12_GRAIN_DECISIONS_SHA256
  ) {
    throw new Error(
      "Plan 040 Package 12 persisted decision output pin drifted",
    );
  }
  return {
    grainDecisionPath:
      PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GRAIN_DECISIONS_PATH,
    grainDecisionSha256,
    grainDecisionCount: 2,
  };
}
