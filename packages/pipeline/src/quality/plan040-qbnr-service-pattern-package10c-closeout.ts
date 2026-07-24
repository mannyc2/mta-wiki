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
  extentDecisionKey,
  validateMemberExtentDecision,
  type MemberExtentDecision,
} from "./study-readiness-v1.js";

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
export const PLAN040_PACKAGE_10C_GATE_SHA256 =
  "b0218d9eaca9855a47a87c28657f06c33f7ecc2e099f1a93412936d25a52fc00" as const;
export const PLAN040_PACKAGE_10C_ACCEPTANCE_SHA256 =
  "410a22f6994f11ecd00ab62a94f496c60ab11dae4834e918df92953f8b019bc9" as const;
export const PLAN040_PACKAGE_10C_EXTENT_DECISIONS_SHA256 =
  "8d1ecf8a1597bc6a44a64341e057b962ab3b380317670895b72da5ca005f8bb5" as const;
export const PLAN040_PACKAGE_10C_GRAIN_DECISIONS_SHA256 =
  "63ff2059c1c38fbedb84b84e3d11d82bb9d12970f035b27c69778f313c10d9a3" as const;
export const PLAN040_PACKAGE_10C_ABSENCE_RECEIPT_SHA256 =
  "7b67ac3dc6a4b8a1638a0c7367157187bfe5cb63159b9cf818c1c8f025428f83" as const;
export const PLAN040_PACKAGE_10C_POST_PERSISTENCE_PINS = {
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
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_EXTENT_DECISIONS_PATH =
  join(
    repoRoot,
    "data/quality/operational-reference/member-extent-ledger-decisions/" +
      "plan-040-qbnr-service-pattern-package-10c-v1.json",
  );
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_GRAIN_DECISIONS_PATH =
  join(
    repoRoot,
    "data/quality/operational-reference/member-grain-decisions/" +
      "plan-040-qbnr-service-pattern-package-10c-v1.json",
  );
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_ABSENCE_RECEIPT_PATH =
  join(
    repoRoot,
    "data/quality/acquisition/receipts/member-extent/" +
      "plan-040-qbnr-service-pattern-package-10c-reviewed-absence-v1.json",
  );

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

type Plan040Package10cGateAndAcceptance =
  ReturnType<typeof buildPlan040Package10cGateAndAcceptance>;

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
      `Plan 040 Package 10C ${label} drifted outside owner acceptance`,
    );
  }
}

function q20ConflictSearchRecord(
  candidate: Plan040Package10cDraft["candidates"][number],
): string {
  const evidence = candidate.accepted_evidence as {
    canonical_treatment_record_id: string;
    preserved_occurrence_decision: {
      path: string;
      artifact_sha256: string;
      decision_id: string;
      decision_row_sha256: string;
      occurrence_id: string;
      review_state: string;
      exact_member_treatment_record_ids: string[];
    };
    scope_conflict: {
      candidate_route_id: string;
      statement_named_replacement_route_id: string;
      canonical_treatment_row_sha256: string;
      ontology_correction_performed: boolean;
      occurrence_decision_changed: boolean;
    };
  };
  return [
    `candidate=${candidate.candidate_key}`,
    `source_statement=${candidate.source_statement.evidence_id}@` +
      `${candidate.source_statement.block_sha256}/` +
      `${JSON.stringify(candidate.source_statement.source_quote)}`,
    `canonical_treatment=${evidence.canonical_treatment_record_id}@` +
      `${evidence.scope_conflict.canonical_treatment_row_sha256}`,
    `scope_conflict=candidate_route_${evidence.scope_conflict.candidate_route_id}` +
      `_statement_names_${evidence.scope_conflict.statement_named_replacement_route_id}`,
    `preserved_occurrence=${evidence.preserved_occurrence_decision.path}@` +
      `${evidence.preserved_occurrence_decision.artifact_sha256}/` +
      `${evidence.preserved_occurrence_decision.decision_id}/` +
      `${evidence.preserved_occurrence_decision.decision_row_sha256}/` +
      `${evidence.preserved_occurrence_decision.review_state}`,
    `preserved_occurrence_members=` +
      `${evidence.preserved_occurrence_decision.exact_member_treatment_record_ids.join(",")}`,
    `exact_searches=${candidate.exact_candidate_searches.join(" | ")}`,
    `prior_extent_ledger=${candidate.prior_ledger_state.extent_row.ledger_id}`,
    `prior_grain_ledger=${candidate.prior_ledger_state.grain_row.ledger_id}`,
    `gaps=${candidate.unresolved_gap_codes.join(",")}`,
    `ontology_correction_performed=${evidence.scope_conflict.ontology_correction_performed}`,
    `occurrence_decision_changed=${evidence.scope_conflict.occurrence_decision_changed}`,
    "occurrence_inference_prohibited=true",
    "result=reviewed_terminal_canonical_treatment_route_scope_conflict",
  ].join("; ");
}

export function buildPlan040Package10cAcceptedArtifacts(input: {
  draft: Plan040Package10cDraft;
  gate: Plan040Package10cGateAndAcceptance["gate"];
  acceptance: Plan040Package10cGateAndAcceptance["acceptance"];
}): {
  extentDecisions: MemberExtentDecision[];
  grainDecisions: MemberGrainDecision[];
  absenceReceipt: MemberExtentAbsenceReceipt;
} {
  validatePlan040Package10cGateAndAcceptance({
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
      "standing_owner_accepted_exact_4_positive_decision_pairs_and_exact_1_q20_scope_conflict_reviewed_absence_only" ||
    input.acceptance.authorizes_decision_persistence !== true ||
    input.acceptance.authorizes_reviewed_absence_receipt_persistence !==
      true ||
    input.acceptance.authorizes_occurrence !== false ||
    input.acceptance.authorizes_study !== false ||
    input.acceptance.authorizes_cross_product !== false ||
    !input.acceptance.preservation_invariants
      .accepted_q20_occurrence_unchanged ||
    !input.acceptance.preservation_invariants
      .q20_treatment_ontology_unchanged
  ) {
    throw new Error(
      "Plan 040 Package 10C acceptance does not authorize this persistence scope",
    );
  }
  const positive = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "positive_extent_and_grain_proposed"
  );
  const unresolved = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict ===
      "receipt_terminal_unresolved_preserved"
  );
  const q20Conflict = unresolved[0];
  if (
    positive.length !== 4 ||
    positive.some((candidate) =>
      !candidate.proposed_extent_decision ||
      !candidate.proposed_grain_decision ||
      candidate.unresolved_gap_codes.length !== 0) ||
    unresolved.length !== 1 ||
    q20Conflict?.candidate_key !==
      "occurrence:b18b9a4512c3b2860dd8aa29\u0000" +
        "route_q20-qbnr-2025\u0000" +
        "treatment_q20-q20b-replacement-2025" ||
    q20Conflict.proposed_extent_decision !== null ||
    q20Conflict.proposed_grain_decision !== null ||
    !q20Conflict.unresolved_gap_codes.includes(
      "canonical_treatment_route_scope_conflict",
    )
  ) {
    throw new Error(
      "Plan 040 Package 10C persistence verdict split drifted",
    );
  }

  assertExactValues(
    input.acceptance.authorized_positive_persistence.candidate_keys,
    positive.map((candidate) => candidate.candidate_key),
    "positive candidate keys",
  );
  assertExactValues(
    input.acceptance.authorized_positive_persistence.extent_decision_ids,
    positive.map((candidate) =>
      candidate.proposed_extent_decision!.decision_id),
    "extent decision ids",
  );
  assertExactValues(
    input.acceptance.authorized_positive_persistence.grain_decision_ids,
    positive.map((candidate) =>
      candidate.proposed_grain_decision!.decision_id),
    "grain decision ids",
  );
  assertExactValues(
    input.acceptance.authorized_reviewed_absence_receipt.candidate_keys,
    [q20Conflict.candidate_key],
    "reviewed absence candidate keys",
  );
  assertExactValues(
    input.acceptance.authorized_reviewed_absence_receipt.surfaces,
    ["member_extent", "member_grain"],
    "reviewed absence surfaces",
  );
  if (
    input.acceptance.authorized_reviewed_absence_receipt.receipt_id !==
      "plan-040-qbnr-service-pattern-package-10c-reviewed-absence-v1" ||
    input.acceptance.authorized_reviewed_absence_receipt.candidate_count !==
      1 ||
    input.acceptance.authorized_reviewed_absence_receipt
        .required_gap_code !==
      "canonical_treatment_route_scope_conflict" ||
    input.acceptance.authorized_reviewed_absence_receipt
        .verdict_by_surface.member_extent !==
      "reviewed_terminal_canonical_treatment_route_scope_conflict" ||
    input.acceptance.authorized_reviewed_absence_receipt
        .verdict_by_surface.member_grain !==
      "reviewed_terminal_canonical_treatment_route_scope_conflict"
  ) {
    throw new Error(
      "Plan 040 Package 10C reviewed absence authorization drifted",
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
  const extentByKey = new Map(extentDecisions.map((decision) => [
    extentDecisionKey(decision),
    decision,
  ]));
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
      decision.service_scope.kind !== "trip_subset" ||
      stableJson(decision.service_scope.periods as JsonValue) !==
        stableJson(["weekend"] as JsonValue)
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
  if (
    extentDecisions.filter((decision) =>
      decision.resolution === "route_wide").length !== 3 ||
    extentDecisions.filter((decision) =>
      decision.resolution === "bounded_segment").length !== 1
  ) {
    throw new Error(
      "Plan 040 Package 10C accepted extent distribution drifted",
    );
  }

  const absenceReceipt: MemberExtentAbsenceReceipt = {
    schema_version: MEMBER_EXTENT_LEDGER_SCHEMA_VERSION,
    contract_id: MEMBER_EXTENT_ABSENCE_CONTRACT_ID,
    receipt_id:
      input.acceptance.authorized_reviewed_absence_receipt.receipt_id,
    surfaces: ["member_extent", "member_grain"],
    extent_keys: [{
      occurrence_id: q20Conflict.occurrence_id,
      route_record_id: q20Conflict.route_record_id,
      treatment_record_id: q20Conflict.treatment_record_id,
    }],
    exact_searches: [q20ConflictSearchRecord(q20Conflict)],
    urls_inspected: [
      "https://www.mta.info/project/queens-bus-network-redesign/service-changes",
    ],
    rationale:
      "Standing owner acceptance records reviewed terminal absence for the exact Package 10C " +
      "Q20/Q20B candidate on both member-extent and member-grain surfaces. The canonical " +
      "treatment is attached to Q20, while its exact source statement says Q20B service is " +
      "replaced by Q76, so candidate-specific extent and grain remain unresolved under " +
      "canonical_treatment_route_scope_conflict. The accepted Q20 occurrence decision and " +
      "treatment ontology are preserved byte-for-byte; this receipt authorizes no occurrence, " +
      "study, cross-product, positive extent, positive grain, or changed-ID inference.",
    reviewed_at: input.acceptance.accepted_at,
    reviewed_by: input.acceptance.accepted_by,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  return { extentDecisions, grainDecisions, absenceReceipt };
}

export function acceptPlan040Package10cDecisionPackage(): {
  extentDecisionPath: string;
  extentDecisionSha256: string;
  grainDecisionPath: string;
  grainDecisionSha256: string;
  absenceReceiptPath: string;
  absenceReceiptSha256: string;
  extentDecisionCount: 4;
  grainDecisionCount: 4;
  absenceCandidateCount: 1;
} {
  for (const [path, expectedSha256, label] of [
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_DRAFT_PATH,
      PLAN040_PACKAGE_10C_DRAFT_SHA256,
      "draft",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_GATE_PATH,
      PLAN040_PACKAGE_10C_GATE_SHA256,
      "dual-review gate",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_ACCEPTANCE_PATH,
      PLAN040_PACKAGE_10C_ACCEPTANCE_SHA256,
      "owner acceptance",
    ],
  ] as const) {
    const actualSha256 = fileSha256(path);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Plan 040 Package 10C ${label} pin drifted: ${actualSha256}`,
      );
    }
  }
  const draft = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package10cDraft;
  const gate = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_GATE_PATH,
      "utf8",
    ),
  ) as Plan040Package10cGateAndAcceptance["gate"];
  const acceptance = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_ACCEPTANCE_PATH,
      "utf8",
    ),
  ) as Plan040Package10cGateAndAcceptance["acceptance"];
  const accepted = buildPlan040Package10cAcceptedArtifacts({
    draft,
    gate,
    acceptance,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_EXTENT_DECISIONS_PATH,
    { decisions: accepted.extentDecisions },
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_GRAIN_DECISIONS_PATH,
    { decisions: accepted.grainDecisions },
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_ABSENCE_RECEIPT_PATH,
    { receipts: [accepted.absenceReceipt] },
  );
  return {
    extentDecisionPath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_EXTENT_DECISIONS_PATH,
    extentDecisionSha256: fileSha256(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_EXTENT_DECISIONS_PATH,
    ),
    grainDecisionPath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_GRAIN_DECISIONS_PATH,
    grainDecisionSha256: fileSha256(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_GRAIN_DECISIONS_PATH,
    ),
    absenceReceiptPath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_ABSENCE_RECEIPT_PATH,
    absenceReceiptSha256: fileSha256(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_ABSENCE_RECEIPT_PATH,
    ),
    extentDecisionCount: 4,
    grainDecisionCount: 4,
    absenceCandidateCount: 1,
  };
}
