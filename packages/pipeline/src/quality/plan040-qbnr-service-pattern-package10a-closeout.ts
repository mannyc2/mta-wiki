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
export const PLAN040_PACKAGE_10A_GATE_SHA256 =
  "d839d7c21e14af139f26414967291f6a8cfe1aa1d3546a0aa789e678b0f17a4b" as const;
export const PLAN040_PACKAGE_10A_ACCEPTANCE_SHA256 =
  "4762b8231d581a4b9a89028029458a796076706c5f51e40726978ff5bcbe96f1" as const;
export const PLAN040_PACKAGE_10A_ABSENCE_RECEIPT_SHA256 =
  "87d60e8710a1bfcc2ddfc8f5ec5b8c68db77556336a94f0dcd84ef9e6d80650a" as const;

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
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ABSENCE_RECEIPT_PATH =
  join(
    repoRoot,
    "data/quality/acquisition/receipts/member-extent/" +
      "plan-040-qbnr-service-pattern-package-10a-reviewed-absence-v1.json",
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

type Plan040Package10aGateAndAcceptance =
  ReturnType<typeof buildPlan040Package10aGateAndAcceptance>;

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
      `Plan 040 Package 10A ${label} drifted outside owner acceptance`,
    );
  }
}

function candidateSearchRecord(
  candidate: Plan040Package10aDraft["candidates"][number],
): string {
  const { pre, post } = candidate.accepted_launch_inventory;
  return [
    `candidate=${candidate.candidate_key}`,
    `source_statement=${candidate.source_statement.evidence_id}@` +
      `${candidate.source_statement.block_sha256}/` +
      `${JSON.stringify(candidate.source_statement.raw_text)}`,
    `source_row=${candidate.source_row.route_row}@` +
      `${candidate.source_row.row_sha256}`,
    `pre=${pre.source_id}@${pre.target_date}/receipt=` +
      `${pre.receipt_sha256}/zip=${pre.source_zip_sha256}/` +
      `route_rows=${pre.route_row_count}/all_trips=` +
      `${pre.all_route_trip_count}/active_trips=` +
      `${pre.active_route_trip_count}/calendar=` +
      `${pre.calendar_expansion.active_service_id_sha256}`,
    `post=${post.source_id}@${post.target_date}/receipt=` +
      `${post.receipt_sha256}/zip=${post.source_zip_sha256}/` +
      `route_rows=${post.route_row_count}/all_trips=` +
      `${post.all_route_trip_count}/active_trips=` +
      `${post.active_route_trip_count}/calendar=` +
      `${post.calendar_expansion.active_service_id_sha256}`,
    `post_full_stop_chains=${
      candidate.post_full_stop_chains.patterns.map((pattern) =>
        `${pattern.pattern_id}@${pattern.stop_chain_sha256}/` +
        `trips=${pattern.trip_count}/stops=${pattern.stop_count}`
      ).join("|")
    }/covered=${candidate.post_full_stop_chains.covered_trip_count}`,
    `candidate_detail=${candidate.candidate_detail_source_gap.exact_url}/` +
      `staged_matches=` +
      `${candidate.candidate_detail_source_gap.staged_metadata_matches}`,
    `launch_schedule=${candidate.schedule_detail_gap.source_id}@` +
      `${candidate.schedule_detail_gap.source_sha256}/route_rows=` +
      `${candidate.schedule_detail_gap.route_row_count}/launch_rows=` +
      `${candidate.schedule_detail_gap.launch_date_row_count}`,
    `exact_searches=${candidate.exact_candidate_searches.join(" | ")}`,
    "predecessor_route_named=false",
    "post_only_presence_authorizes_occurrence=false",
    "post_only_presence_authorizes_routewide_extent=false",
    "post_only_presence_authorizes_lineage=false",
    "corrected_first_week_diff=blocked_not_run_separate_nonauthorizing",
    `prior_extent_ledger=${candidate.prior_ledger_state.extent_row.ledger_id}`,
    `prior_grain_ledger=${candidate.prior_ledger_state.grain_row.ledger_id}`,
    "result=receipt_terminal_unresolved",
    `gaps=${candidate.unresolved_gap_codes.join(",")}`,
  ].join("; ");
}

export function buildPlan040Package10aAcceptedReceipt(input: {
  draft: Plan040Package10aDraft;
  gate: Plan040Package10aGateAndAcceptance["gate"];
  acceptance: Plan040Package10aGateAndAcceptance["acceptance"];
}): MemberExtentAbsenceReceipt {
  validatePlan040Package10aGateAndAcceptance({
    draft: input.draft,
    gate: input.gate,
    acceptance: input.acceptance,
    acceptedAt: input.acceptance.accepted_at,
  });
  if (
    input.acceptance.authorization_state !==
      "owner_delegate_accepted_exact_4_key_reviewed_absence_only" ||
    input.acceptance.authorizes_decision_persistence ||
    !input.acceptance.authorizes_reviewed_absence_receipt_persistence ||
    input.acceptance.authorizes_occurrence ||
    input.acceptance.authorizes_study ||
    input.acceptance.authorizes_cross_product ||
    input.acceptance.authorized_positive_persistence.candidate_count !==
      0 ||
    input.acceptance.authorized_positive_persistence.candidate_keys
      .length !== 0 ||
    input.acceptance.authorized_positive_persistence.extent_decision_ids
      .length !== 0 ||
    input.acceptance.authorized_positive_persistence.grain_decision_ids
      .length !== 0
  ) {
    throw new Error(
      "Plan 040 Package 10A owner acceptance does not authorize this absence-only persistence scope",
    );
  }
  const unresolved = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "receipt_terminal_unresolved"
  );
  if (
    unresolved.length !== 4 ||
    unresolved.some((candidate) =>
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0
    )
  ) {
    throw new Error(
      "Plan 040 Package 10A persistence inputs no longer match the accepted absence-only verdict",
    );
  }
  const unresolvedKeys = unresolved.map((candidate) =>
    candidate.candidate_key
  ).sort();
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
  if (
    input.acceptance.authorized_reviewed_absence_receipt.receipt_id !==
      "plan-040-qbnr-service-pattern-package-10a-reviewed-absence-v1" ||
    input.acceptance.authorized_reviewed_absence_receipt.candidate_count !==
      4 ||
    input.acceptance.authorized_reviewed_absence_receipt
        .candidate_key_sha256 !==
      PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256 ||
    input.acceptance.authorized_reviewed_absence_receipt
        .verdict_by_surface.member_extent !==
      "reviewed_terminal_unresolved" ||
    input.acceptance.authorized_reviewed_absence_receipt
        .verdict_by_surface.member_grain !==
      "reviewed_terminal_unresolved"
  ) {
    throw new Error(
      "Plan 040 Package 10A reviewed absence authorization drifted",
    );
  }
  const exactSearches = unresolved.map(candidateSearchRecord).sort();
  if (new Set(exactSearches).size !== 4) {
    throw new Error(
      "Plan 040 Package 10A requires one exact search record per candidate",
    );
  }
  return {
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
      [
        left.occurrence_id,
        left.route_record_id,
        left.treatment_record_id,
      ].join("\0").localeCompare([
        right.occurrence_id,
        right.route_record_id,
        right.treatment_record_id,
      ].join("\0"))
    ),
    exact_searches: exactSearches,
    urls_inspected: [
      "https://www.mta.info/project/queens-bus-network-redesign/service-changes",
    ],
    rationale:
      "Owner-delegate accepted reviewed absence for the exact four Package 10A candidates after " +
      "one independent review and automated fail-closed tests. Each source statement names no " +
      "predecessor; the accepted pre launch feed contains the route row but zero route trips, " +
      "while the accepted post launch feed contains positive active inventory and complete ordered " +
      "full-stop chains. Under exact-positive policy, post-only presence does not authorize a new " +
      "occurrence, predecessor lineage, route-wide extent, or member-grain decision. Exact candidate " +
      "detail sources and exact launch-date schedule bindings remain missing; later nonlaunch rows " +
      "are nonauthorizing. Correction-version separation, complete prior ledger fields, and exact " +
      "risk12/Q67/Q48-Q75 exclusions remain preserved. No occurrence, study, cross-product, positive " +
      "extent, or positive grain inference is authorized.",
    reviewed_at: input.acceptance.accepted_at,
    reviewed_by: input.acceptance.accepted_by,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

export function acceptPlan040Package10aReceiptPackage(): {
  absenceReceiptPath: string;
  absenceReceiptSha256: string;
  extentDecisionCount: 0;
  grainDecisionCount: 0;
  absenceCandidateCount: 4;
} {
  for (const [path, expectedSha256, label] of [
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_DRAFT_PATH,
      PLAN040_PACKAGE_10A_DRAFT_SHA256,
      "draft",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_GATE_PATH,
      PLAN040_PACKAGE_10A_GATE_SHA256,
      "independent-review gate",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ACCEPTANCE_PATH,
      PLAN040_PACKAGE_10A_ACCEPTANCE_SHA256,
      "owner acceptance",
    ],
  ] as const) {
    const actualSha256 = fileSha256(path);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Plan 040 Package 10A ${label} pin drifted: ${actualSha256}`,
      );
    }
  }
  const draft = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package10aDraft;
  const gate = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_GATE_PATH,
      "utf8",
    ),
  ) as Plan040Package10aGateAndAcceptance["gate"];
  const acceptance = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ACCEPTANCE_PATH,
      "utf8",
    ),
  ) as Plan040Package10aGateAndAcceptance["acceptance"];
  const receipt = buildPlan040Package10aAcceptedReceipt({
    draft,
    gate,
    acceptance,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ABSENCE_RECEIPT_PATH,
    { receipts: [receipt] },
  );
  return {
    absenceReceiptPath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ABSENCE_RECEIPT_PATH,
    absenceReceiptSha256: fileSha256(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ABSENCE_RECEIPT_PATH,
    ),
    extentDecisionCount: 0,
    grainDecisionCount: 0,
    absenceCandidateCount: 4,
  };
}
