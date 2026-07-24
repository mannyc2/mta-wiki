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
  extentDecisionKey,
  validateMemberExtentDecision,
  type MemberExtentDecision,
} from "./study-readiness-v1.js";
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
export const PLAN040_PACKAGE_11_GATE_SHA256 =
  "ec277d0872919b975e0871ad75af7d1413e4eb0dbd3d02e7d5fd150ebfa9eb3e" as const;
export const PLAN040_PACKAGE_11_ACCEPTANCE_SHA256 =
  "a54f5eaa415af1f0e62fa50302eb3769154ae9587a4b519f6337614043335110" as const;
export const PLAN040_PACKAGE_11_EXTENT_DECISIONS_SHA256 =
  "6ada5b34e43379160a36991f15f8698ccf4e3a2985a23e3d4a7ef39c54454dc0";
export const PLAN040_PACKAGE_11_GRAIN_DECISIONS_SHA256 =
  "b44afec8ac1e99d1793c26fee994ea7243f7ebd2f8f1622d097a6d7c98dc991b";
export const PLAN040_PACKAGE_11_GRAIN_ONLY_EXTENT_ROW_PINS = {
  "member-extent-review:ae33c3c10ba9cca06dc01a56":
    "d6ed6a2cd2663d89d859dc8ff2815c7358ca0bdcedf640c2d6033254b9f324b6",
  "member-extent-review:ea11416fe15938b292b96ae9":
    "633d3bb007b60619e682fee3d4cb511a369890e61c16b6c51e2188d17924957b",
  "member-extent-review:e4e7cdc399281b2527a402fa":
    "849fccfa3f5523856154c4df76372408b900b886622809c74fc42dcefe87737c",
  "member-extent-review:653788039e48fe15118d6874":
    "de9f8dd3abecb602253911296464b76083ca167aabd5dd14c1cd60c7e10b8640",
  "member-extent-review:abd3040a78bbc19e8fe9e6bb":
    "7d08b0df11cc3f139ec0e2db3a35c1699531c7758979240d7caed1346471c0a7",
  "member-extent-review:df05eab7e8db9c2288df667f":
    "2a4b4533dbfe69d96c197dabd90bab18dbcb2b1f2b27ae975098d8a6c13db37f",
  "member-extent-review:1f5bfe3fde988855502a3718":
    "c1d824b4c67f3d0d61410e4d01198ffd0f3b02a645fcdc40eea35429979b0353",
  "member-extent-review:11def9ffcb4a7b9280e04c0f":
    "16562d03d43be379fc1dd5359cb5936254c504b1418644350f8cf2b47c9f8baa",
  "member-extent-review:f71122496fb7b6b055bde2dd":
    "762916420b60e25477452a9d744d037b6f3a1d11361c37a836e7e2b52b7742ea",
  "member-extent-review:3040f6409ebb10b6550fd498":
    "79d1f6f03501163867889aa08a0cbe3b912146ad37f3ab5b103958381401bea6",
  "member-extent-review:8b21c0a3d8d33b6ec5a4e0df":
    "94f89553fad7966a81b053293415c3caaf4f907856c583962ba12a30249eb32d",
} as const;
export const PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS = {
  extent_ledger:
    "b6ec884cc6e0a38f09fa69b99f1b844b00b82def1477f7e48e52378fc8673c5b",
  grain_ledger:
    "362538a4e870914a6c148dfb546018da1f69e81725766eba8feb891ef0fb77de",
  bridge_ledger:
    "f937c0ed6d420e35b6eb878292ac671ff24d5d6c2e86e0cc9fa47be377ef183e",
  study_manifest:
    "cb40a045d09ffca2e59d4d96722a09f9832c715f50afb9aee35080eb4b97207c",
  member_extent_contract:
    "5566b2a536bd2d3f2e513b32af0a46a7efc18854414ea3c1dacd37d22d250b5f",
  member_extent_manifest:
    "d8126f8017c899726fc6c7181f0dfdc84f773066af54bc9f2ee769703bed9253",
  member_extent_review_ledger:
    "9bee9b8f1e4e0358822dbf38ae5840c4f6d9ae834e1aaaf20c492c608065f57c",
  member_extent_summary:
    "7897a943ea6c14166346260af65a94625ce629fadc59e26db24df8e21d17adba",
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
export const PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_EXTENT_DECISIONS_PATH =
  join(
    repoRoot,
    "data/quality/operational-reference/member-extent-ledger-decisions/" +
      "plan-040-qbnr-service-grain-package-11-v1.json",
  );
export const PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GRAIN_DECISIONS_PATH =
  join(
    repoRoot,
    "data/quality/operational-reference/member-grain-decisions/" +
      "plan-040-qbnr-service-grain-package-11-v1.json",
  );

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

type Plan040Package11GateAndAcceptance =
  ReturnType<typeof buildPlan040Package11GateAndAcceptance>;

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
      `Plan 040 Package 11 ${label} drifted outside owner acceptance`,
    );
  }
}

export function buildPlan040Package11AcceptedArtifacts(input: {
  draft: Plan040Package11Draft;
  gate: Plan040Package11GateAndAcceptance["gate"];
  acceptance: Plan040Package11GateAndAcceptance["acceptance"];
}): {
  extentDecisions: MemberExtentDecision[];
  grainDecisions: MemberGrainDecision[];
} {
  validatePlan040Package11GateAndAcceptance({
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
      "owner_accepted_exact_1_extent_and_12_grain_decisions_only" ||
    !input.acceptance.authorizes_decision_persistence ||
    input.acceptance.authorizes_occurrence ||
    input.acceptance.authorizes_study ||
    input.acceptance.authorizes_cross_product ||
    input.acceptance.authorizes_ontology ||
    input.acceptance.authorizes_corrections ||
    !input.acceptance.preservation_invariants
      .existing_grain_only_extent_decisions_byte_identical ||
    !input.acceptance.preservation_invariants
      .occurrence_decisions_unchanged ||
    !input.acceptance.preservation_invariants
      .study_authorization_unchanged ||
    !input.acceptance.preservation_invariants
      .cross_product_authorization_unchanged ||
    !input.acceptance.preservation_invariants
      .treatment_ontology_unchanged ||
    !input.acceptance.preservation_invariants
      .correction_state_unchanged ||
    !input.acceptance.preservation_invariants.exclusions_unchanged ||
    !input.acceptance.preservation_invariants
      .package_12_frozen_bytes_unchanged ||
    !input.acceptance.preservation_invariants
      .absence_projection_prohibited_for_unresolved_grain
  ) {
    throw new Error(
      "Plan 040 Package 11 acceptance does not authorize this persistence scope",
    );
  }
  const candidates = input.draft.candidates;
  const extentCandidates = candidates.filter((candidate) =>
    candidate.proposed_extent_decision !== null);
  const unresolvedCandidates = candidates.filter((candidate) =>
    candidate.evidence_verdict ===
      "structured_unresolved_grain_proposed");
  if (
    candidates.length !== 12 ||
    extentCandidates.length !== 1 ||
    unresolvedCandidates.length !== 7 ||
    extentCandidates[0]?.proposed_extent_decision?.resolution !==
      "bounded_segment" ||
    unresolvedCandidates.some((candidate) =>
      candidate.proposed_grain_decision.service_scope.kind !== "unresolved" ||
      candidate.unresolved_gap_codes.length === 0) ||
    candidates.some((candidate) =>
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence)
  ) {
    throw new Error(
      "Plan 040 Package 11 persistence verdict split drifted",
    );
  }

  assertExactValues(
    input.acceptance.authorized_exact_persistence.candidate_keys,
    candidates.map((candidate) => candidate.candidate_key),
    "candidate keys",
  );
  assertExactValues(
    input.acceptance.authorized_exact_persistence.extent_decision_ids,
    extentCandidates.map((candidate) =>
      candidate.proposed_extent_decision!.decision_id),
    "extent decision ids",
  );
  assertExactValues(
    input.acceptance.authorized_exact_persistence.grain_decision_ids,
    candidates.map((candidate) =>
      candidate.proposed_grain_decision.decision_id),
    "grain decision ids",
  );

  const extentDecisions = extentCandidates.map((candidate) => {
    const decision = {
      ...candidate.proposed_extent_decision!,
      reviewed_at: input.acceptance.accepted_at,
      reviewed_by: input.acceptance.accepted_by,
    };
    validateMemberExtentDecision(decision);
    if (
      extentDecisionKey(decision) !== candidate.candidate_key ||
      decision.resolution !== "bounded_segment"
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: accepted extent key drifted`,
      );
    }
    return decision;
  });
  const newExtentByKey = new Map(extentDecisions.map((decision) => [
    extentDecisionKey(decision),
    decision,
  ]));
  const grainDecisions = candidates.map((candidate) => {
    const decision = parseMemberGrainDecision({
      ...candidate.proposed_grain_decision,
      reviewed_at: input.acceptance.accepted_at,
      reviewed_by: input.acceptance.accepted_by,
    });
    const newExtent = newExtentByKey.get(candidate.candidate_key);
    const expectedExtentDecisionId = newExtent?.decision_id ??
      candidate.prior_ledger_state.grain_row.member_extent_decision_id;
    if (
      memberGrainDecisionKey(decision) !== candidate.candidate_key ||
      decision.member_extent_decision_id !== expectedExtentDecisionId ||
      (
        candidate.evidence_verdict ===
          "structured_unresolved_grain_proposed"
          ? decision.service_scope.kind !== "unresolved" ||
            stableJson(
              decision.service_scope.missing_roles as unknown as JsonValue,
            ) !== stableJson(candidate.unresolved_gap_codes as JsonValue)
          : decision.service_scope.kind === "unresolved"
      )
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: accepted grain state drifted`,
      );
    }
    return decision;
  }).sort((left, right) =>
    memberGrainDecisionKey(left).localeCompare(
      memberGrainDecisionKey(right),
    ));
  if (
    extentDecisions.length !== 1 ||
    grainDecisions.length !== 12 ||
    grainDecisions.filter((decision) =>
      decision.service_scope.kind === "unresolved").length !== 7
  ) {
    throw new Error(
      "Plan 040 Package 11 accepted decision distribution drifted",
    );
  }
  return { extentDecisions, grainDecisions };
}

export function acceptPlan040Package11DecisionPackage(): {
  extentDecisionPath: string;
  extentDecisionSha256: string;
  grainDecisionPath: string;
  grainDecisionSha256: string;
  extentDecisionCount: 1;
  grainDecisionCount: 12;
} {
  for (const [path, expectedSha256, label] of [
    [
      join(repoRoot, EVIDENCE_PATH),
      PLAN040_PACKAGE_11_EVIDENCE_SHA256,
      "evidence",
    ],
    [
      PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_DRAFT_PATH,
      PLAN040_PACKAGE_11_DRAFT_SHA256,
      "draft",
    ],
    [
      join(repoRoot, RECEIPT_PATH),
      PLAN040_PACKAGE_11_RECEIPT_SHA256,
      "positive pattern receipt",
    ],
    [
      PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GATE_PATH,
      PLAN040_PACKAGE_11_GATE_SHA256,
      "dual-review gate",
    ],
    [
      PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_ACCEPTANCE_PATH,
      PLAN040_PACKAGE_11_ACCEPTANCE_SHA256,
      "owner acceptance",
    ],
  ] as const) {
    const actualSha256 = fileSha256(path);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Plan 040 Package 11 ${label} pin drifted: ${actualSha256}`,
      );
    }
  }
  const draft = JSON.parse(
    readFileSync(PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_DRAFT_PATH, "utf8"),
  ) as Plan040Package11Draft;
  const gate = JSON.parse(
    readFileSync(PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GATE_PATH, "utf8"),
  ) as Plan040Package11GateAndAcceptance["gate"];
  const acceptance = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_ACCEPTANCE_PATH,
      "utf8",
    ),
  ) as Plan040Package11GateAndAcceptance["acceptance"];
  const accepted = buildPlan040Package11AcceptedArtifacts({
    draft,
    gate,
    acceptance,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_EXTENT_DECISIONS_PATH,
    { decisions: accepted.extentDecisions },
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GRAIN_DECISIONS_PATH,
    { decisions: accepted.grainDecisions },
  );
  const extentDecisionSha256 = fileSha256(
    PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_EXTENT_DECISIONS_PATH,
  );
  const grainDecisionSha256 = fileSha256(
    PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GRAIN_DECISIONS_PATH,
  );
  if (
    (
      PLAN040_PACKAGE_11_EXTENT_DECISIONS_SHA256 &&
      extentDecisionSha256 !==
        PLAN040_PACKAGE_11_EXTENT_DECISIONS_SHA256
    ) ||
    (
      PLAN040_PACKAGE_11_GRAIN_DECISIONS_SHA256 &&
      grainDecisionSha256 !==
        PLAN040_PACKAGE_11_GRAIN_DECISIONS_SHA256
    )
  ) {
    throw new Error(
      "Plan 040 Package 11 persisted decision output pin drifted",
    );
  }
  return {
    extentDecisionPath:
      PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_EXTENT_DECISIONS_PATH,
    extentDecisionSha256,
    grainDecisionPath:
      PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GRAIN_DECISIONS_PATH,
    grainDecisionSha256,
    extentDecisionCount: 1,
    grainDecisionCount: 12,
  };
}
