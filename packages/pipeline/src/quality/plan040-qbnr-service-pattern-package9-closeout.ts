import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  PLAN040_PACKAGE_9_CANDIDATE_KEY_SHA256,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9,
  plan040Package9ReplayHash,
  type Plan040Package9Draft,
} from "./plan040-qbnr-service-pattern-package9.js";
import {
  extentDecisionKey,
  validateMemberExtentDecision,
  type MemberExtentDecision,
} from "./study-readiness-v1.js";

export const PLAN040_PACKAGE_9_INITIAL_REVIEWED_COMMIT =
  "8328b43624ae2b18e695c27ddb4f07dc5fc96e00" as const;
export const PLAN040_PACKAGE_9_APPROVED_COMMIT =
  "2f3864d2973dc2aa8c75b3fc542525caa95d575b" as const;
export const PLAN040_PACKAGE_9_EVIDENCE_SHA256 =
  "376a3e9f184a24530d344eea0f53842fabce2e83ab2eb12b21bc59fd7ee10a7c" as const;
export const PLAN040_PACKAGE_9_DRAFT_SHA256 =
  "a35e7baa10736e65ee432394313dde58a790c2184015920df613d573e8628481" as const;
export const PLAN040_PACKAGE_9_GATE_SHA256 =
  "84ff903ffdb6b4b69e5c03ebb7ed8cf6e53b284ebf635704007bcdef93d42907" as const;
export const PLAN040_PACKAGE_9_ACCEPTANCE_SHA256 =
  "13e5d18a32d6d658d08d34d1e3f30de2432abd7e47af23ea25e018e5badf5ae1" as const;
export const PLAN040_PACKAGE_9_EXTENT_DECISIONS_SHA256 =
  "7cbd08441f40bf095a9ac9911b3429c40b52cd0c752c8f134ef7bdfdaec1fff7" as const;
export const PLAN040_PACKAGE_9_GRAIN_DECISIONS_SHA256 =
  "e9ace85279043ad384651da4ecf15dc52c27d84df2978c5455e63600c6a5bbc9" as const;
export const PLAN040_PACKAGE_9_ABSENCE_RECEIPT_SHA256 =
  "3301f2d0e3c33199c59f6a7a3e5e93daa29ff16ff55e060cc43d2ba4a9ada3d8" as const;

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
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_EXTENT_DECISIONS_PATH =
  join(
    repoRoot,
    "data/quality/operational-reference/member-extent-ledger-decisions/" +
      "plan-040-qbnr-service-pattern-package-9-v1.json",
  );
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_GRAIN_DECISIONS_PATH =
  join(
    repoRoot,
    "data/quality/operational-reference/member-grain-decisions/" +
      "plan-040-qbnr-service-pattern-package-9-v1.json",
  );
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_ABSENCE_RECEIPT_PATH =
  join(
    repoRoot,
    "data/quality/acquisition/receipts/member-extent/" +
      "plan-040-qbnr-service-pattern-package-9-reviewed-absence-v1.json",
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

type Plan040Package9GateAndAcceptance =
  ReturnType<typeof buildPlan040Package9GateAndAcceptance>;

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
      `Plan 040 Package 9 ${label} drifted outside owner acceptance`,
    );
  }
}

function candidateSearchRecord(
  candidate: Plan040Package9Draft["candidates"][number],
): string {
  const prior = candidate.ledger_snapshot.prior_review_provenance;
  return [
    `candidate=${candidate.candidate_key}`,
    `risk_wave=${candidate.risk_wave_id}`,
    `source_statement=${candidate.source_statement.evidence_id}`,
    `source_row=${candidate.source_row.route_row}@${candidate.source_row.row_sha256}`,
    `pre=${candidate.immutable_candidate_context.pre_source_id}@` +
      `${candidate.immutable_candidate_context.pre_target_date}/` +
      `${candidate.immutable_candidate_context.pre_gtfs_route_id}`,
    `post=${candidate.immutable_candidate_context.post_source_id}@` +
      `${candidate.immutable_candidate_context.post_target_date}/` +
      `${candidate.immutable_candidate_context.post_gtfs_route_id}`,
    `inventory_transition=${candidate.inventory_transition.pre_feed_family}:` +
      `${candidate.inventory_transition.pre_route_id}->` +
      `${candidate.inventory_transition.post_feed_family}:` +
      `${candidate.inventory_transition.post_route_id}`,
    `lineage=${candidate.lineage_review.named_from_routes.join("+")}->` +
      `${candidate.lineage_review.named_to_routes.join("+")}`,
    `exact_searches=${candidate.exact_candidate_searches.join(" | ")}`,
    "candidate_route_context_nonexclusive=true",
    "automatic_equivalence=identical_stop_id_only",
    "occurrence_inference_prohibited=true",
    prior
      ? `prior_review=${prior.packet.packet_id}/` +
        `${prior.packet.member_extent_decision_id}/preserved_no_supersession`
      : "prior_review=none",
    "result=receipt_terminal_unresolved",
    `gaps=${candidate.unresolved_gap_codes.join(",")}`,
  ].join("; ");
}

export function buildPlan040Package9AcceptedArtifacts(input: {
  draft: Plan040Package9Draft;
  gate: Plan040Package9GateAndAcceptance["gate"];
  acceptance: Plan040Package9GateAndAcceptance["acceptance"];
}): {
  extentDecisions: MemberExtentDecision[];
  grainDecisions: MemberGrainDecision[];
  absenceReceipt: MemberExtentAbsenceReceipt;
} {
  validatePlan040Package9GateAndAcceptance({
    draft: input.draft,
    gate: input.gate,
    acceptance: input.acceptance,
    acceptedAt: input.acceptance.accepted_at,
  });
  if (
    input.acceptance.authorization_state !==
      "owner_delegate_accepted_exact_2_positive_decision_pairs_and_exact_20_key_reviewed_absence_only" ||
    input.acceptance.authorizes_decision_persistence !== true ||
    input.acceptance.authorizes_reviewed_absence_receipt_persistence !==
      true ||
    input.acceptance.authorizes_occurrence !== false ||
    input.acceptance.authorizes_study !== false ||
    input.acceptance.authorizes_cross_product !== false
  ) {
    throw new Error(
      "Plan 040 Package 9 owner acceptance does not authorize this persistence scope",
    );
  }

  const positive = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "evidence_complete_positive_draft");
  const unresolved = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "receipt_terminal_unresolved");
  if (
    positive.length !== 2 ||
    positive.some((candidate) =>
      !candidate.proposed_extent_decision ||
      !candidate.proposed_grain_decision ||
      candidate.unresolved_gap_codes.length !== 0) ||
    unresolved.length !== 20 ||
    unresolved.some((candidate) =>
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0)
  ) {
    throw new Error(
      "Plan 040 Package 9 persistence inputs no longer match the accepted verdict split",
    );
  }

  const positiveKeys = positive
    .map((candidate) => candidate.candidate_key)
    .sort();
  const unresolvedKeys = unresolved
    .map((candidate) => candidate.candidate_key)
    .sort();
  const proposedExtentIds = positive
    .map((candidate) => candidate.proposed_extent_decision!.decision_id)
    .sort();
  const proposedGrainIds = positive
    .map((candidate) => candidate.proposed_grain_decision!.decision_id)
    .sort();
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

  const unresolvedKeySha256 = sha256(`${unresolvedKeys.join("\n")}\n`);
  if (
    input.acceptance.authorized_reviewed_absence_receipt.receipt_id !==
      "plan-040-qbnr-service-pattern-package-9-reviewed-absence-v1" ||
    input.acceptance.authorized_reviewed_absence_receipt.candidate_count !==
      20 ||
    input.acceptance.authorized_reviewed_absence_receipt
        .candidate_key_sha256 !== unresolvedKeySha256 ||
    input.acceptance.authorized_reviewed_absence_receipt
        .verdict_by_surface.member_extent !==
      "reviewed_terminal_unresolved" ||
    input.acceptance.authorized_reviewed_absence_receipt
        .verdict_by_surface.member_grain !==
      "reviewed_terminal_unresolved"
  ) {
    throw new Error(
      "Plan 040 Package 9 reviewed absence authorization drifted",
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
    extentDecisions.map((decision) => [extentDecisionKey(decision), decision]),
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
      decision.member_extent_decision_id !== extentDecision?.decision_id
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

  const exactSearches = unresolved.map(candidateSearchRecord).sort();
  if (new Set(exactSearches).size !== 20) {
    throw new Error(
      "Plan 040 Package 9 requires one exact search record per unresolved candidate",
    );
  }
  const qm68 = unresolved.find((candidate) =>
    candidate.treatment_record_id ===
      "treatment_qm68-avenue-service-discontinuation-2025");
  if (
    !qm68 ||
    qm68.ledger_snapshot.prior_state_classification !==
      "reviewed_unresolved_carried_forward" ||
    qm68.ledger_snapshot.decision_versioning.relationship !==
      "supplements_prior_unresolved_without_supersession" ||
    !qm68.ledger_snapshot.decision_versioning.prior_decision_retained ||
    qm68.ledger_snapshot.decision_versioning
        .supersedes_prior_decision_id !== null
  ) {
    throw new Error(
      "Plan 040 Package 9 QM68 prior reviewed unresolved state drifted",
    );
  }

  const absenceReceipt: MemberExtentAbsenceReceipt = {
    schema_version: MEMBER_EXTENT_LEDGER_SCHEMA_VERSION,
    contract_id: MEMBER_EXTENT_ABSENCE_CONTRACT_ID,
    receipt_id:
      input.acceptance.authorized_reviewed_absence_receipt.receipt_id,
    surfaces: ["member_extent", "member_grain"],
    extent_keys: unresolved.map((candidate) => ({
      occurrence_id: candidate.occurrence_id,
      route_record_id: candidate.route_record_id,
      treatment_record_id: candidate.treatment_record_id,
    })).sort((left, right) =>
      extentDecisionKey(left).localeCompare(extentDecisionKey(right))),
    exact_searches: exactSearches,
    urls_inspected: [
      "https://www.mta.info/project/queens-bus-network-redesign/service-changes",
    ],
    rationale:
      "Owner-delegate accepted reviewed absence for the exact 20 Package 9 candidates that " +
      "remained terminally unresolved after dual independent lineage-risk review. Immutable prior " +
      "receipts, exact candidate-specific searches, unresolved bindings, source gaps, nonexclusive " +
      "route context, unmatched schedule patterns, correction-version separation, and identical-" +
      "stop-ID-only equivalence remain preserved. The QM68 overlay supplements its prior reviewed " +
      "unresolved packet and member-extent decision without supersession. No occurrence, study, " +
      "cross-product, positive extent, or positive grain inference is authorized.",
    reviewed_at: input.acceptance.accepted_at,
    reviewed_by: input.acceptance.accepted_by,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  return { extentDecisions, grainDecisions, absenceReceipt };
}

export function acceptPlan040Package9DecisionPackage(): {
  extentDecisionPath: string;
  extentDecisionSha256: string;
  grainDecisionPath: string;
  grainDecisionSha256: string;
  absenceReceiptPath: string;
  absenceReceiptSha256: string;
  extentDecisionCount: 2;
  grainDecisionCount: 2;
  absenceCandidateCount: 20;
} {
  const requiredPins = [
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_DRAFT_PATH,
      PLAN040_PACKAGE_9_DRAFT_SHA256,
      "draft",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_GATE_PATH,
      PLAN040_PACKAGE_9_GATE_SHA256,
      "dual-review gate",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_ACCEPTANCE_PATH,
      PLAN040_PACKAGE_9_ACCEPTANCE_SHA256,
      "owner acceptance",
    ],
  ] as const;
  for (const [path, expectedSha256, label] of requiredPins) {
    const actualSha256 = fileSha256(path);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Plan 040 Package 9 ${label} pin drifted: ${actualSha256}`,
      );
    }
  }
  const draft = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package9Draft;
  const gate = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_GATE_PATH,
      "utf8",
    ),
  ) as Plan040Package9GateAndAcceptance["gate"];
  const acceptance = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_ACCEPTANCE_PATH,
      "utf8",
    ),
  ) as Plan040Package9GateAndAcceptance["acceptance"];
  const accepted = buildPlan040Package9AcceptedArtifacts({
    draft,
    gate,
    acceptance,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_EXTENT_DECISIONS_PATH,
    { decisions: accepted.extentDecisions },
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_GRAIN_DECISIONS_PATH,
    { decisions: accepted.grainDecisions },
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_ABSENCE_RECEIPT_PATH,
    { receipts: [accepted.absenceReceipt] },
  );
  return {
    extentDecisionPath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_EXTENT_DECISIONS_PATH,
    extentDecisionSha256: fileSha256(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_EXTENT_DECISIONS_PATH,
    ),
    grainDecisionPath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_GRAIN_DECISIONS_PATH,
    grainDecisionSha256: fileSha256(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_GRAIN_DECISIONS_PATH,
    ),
    absenceReceiptPath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_ABSENCE_RECEIPT_PATH,
    absenceReceiptSha256: fileSha256(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9_ABSENCE_RECEIPT_PATH,
    ),
    extentDecisionCount: 2,
    grainDecisionCount: 2,
    absenceCandidateCount: 20,
  };
}
