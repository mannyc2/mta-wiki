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
  buildPlan040Package2CandidateEvidence,
  type Plan040Package2CandidateEvidence,
  type Plan040Package2ScheduleSlice,
} from "./plan040-qbnr-stop-removal-package2.js";
import type { Plan040AcquisitionCandidate } from "./plan040-qbnr-stop-removal-acquisition.js";
import type { HistoricalFullStopPattern } from "../reference/historical-full-stop.js";
import { fileSha256 } from "../reference/snapshot-registry.js";
import {
  MEMBER_EXTENT_ABSENCE_CONTRACT_ID,
  MEMBER_EXTENT_LEDGER_SCHEMA_VERSION,
  type MemberExtentAbsenceReceipt,
} from "./member-extent-ledger.js";
import { extentDecisionKey } from "./study-readiness-v1.js";

export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4 =
  "plan-040-qbnr-stop-removal-package-4-evidence-only-v1" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_REVIEWED_COMMIT =
  "ead95f107779bfdbbf4e1343f9db835e4c95119d" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ACQUISITION_SHA256 =
  "3f804faabcbb769d037033eeeececda59fd93a3052a2d739f16680b1befe9431" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_EVIDENCE_SHA256 =
  "f105bd93bfeb2b0504e9819885f55d67c77e14840836dbc58ab06ced5b6c2072" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_DRAFT_SHA256 =
  "04fc4c0168eda1081ed5338b77794ba61be4c1346854ed1f9a628945607113ed" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_GATE_SHA256 =
  "8194f8d0769e5d552cabab9669385487e52592e9bbd2121a898214dc2af57be7" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ACCEPTANCE_SHA256 =
  "08381028607d4ac2cffea33891eb87b5dade22e44ff40133f8d7171b090169fb" as const;

export const PLAN040_PACKAGE_4_ROUTE_ORDER = [
  "Q12",
  "Q17",
  "Q2",
  "Q25",
  "Q29",
  "Q3",
  "Q31",
  "Q39",
  "Q43",
  "Q50",
  "Q54",
  "Q55",
  "Q58",
  "Q59",
  "Q64",
  "Q66",
  "QM2",
  "QM4",
  "QM5",
  "Q42",
  "QM21",
  "QM32",
  "QM35",
] as const;

export type Plan040Package4RouteId =
  (typeof PLAN040_PACKAGE_4_ROUTE_ORDER)[number];

export type Plan040Package4BoundaryClass =
  | "complete_weekend_launch_boundary"
  | "complete_weekday_launch_boundary"
  | "cross_family_transfer_incomplete"
  | "pre_inventory_absent"
  | "both_boundary_inventories_absent";

export type Plan040Package4CandidateEvidence =
  Plan040Package2CandidateEvidence & {
    gtfs_route_id: Plan040Package4RouteId;
    boundary_evidence: {
      boundary_class: Plan040Package4BoundaryClass;
      complete_active_trip_boundary: boolean;
      pre_feed_family: "queens" | "busco";
      post_feed_family: "queens" | "busco";
      pre_route_row_count: number;
      pre_route_trip_row_count: number;
      pre_active_trip_count: number;
      post_route_row_count: number;
      post_route_trip_row_count: number;
      post_active_trip_count: number;
      route_row_presence_is_not_trip_inventory: true;
      cross_family_context: boolean;
    };
    risk_flags: string[];
  };

export type Plan040Package4Draft = {
  schema_version: 1;
  package_id: typeof PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4;
  extent_ledger: { path: string; sha256: string };
  grain_ledger: { path: string; sha256: string };
  prior_packages: Array<{
    package_id: "plan040-package2" | "plan040-package3";
    path: string;
    sha256: string;
    candidate_count: number;
    overlap_count: 0;
  }>;
  acquisition_receipt: { path: string; sha256: string };
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 23;
  source_count: 23;
  candidate_key_sha256: string;
  boundary_distribution: Record<Plan040Package4BoundaryClass, number>;
  evidence_verdict_distribution: {
    evidence_complete_stop_set: number;
    receipt_terminal_unresolved: number;
  };
  proposed_extent_distribution: {
    stop_set: number;
    unresolved: number;
  };
  proposed_decision_count: number;
  persisted_decision_count: 0;
  proposed_grain_distribution: {
    trip_subset: number;
    unresolved: number;
  };
  proposed_grain_decision_count: number;
  persisted_grain_decision_count: 0;
  candidates: Plan040Package4CandidateEvidence[];
  equivalence_policy: {
    automatic_equivalence: "identical_stop_id_only";
    changed_id_name_coordinate_or_proximity_equivalence: false;
    route_row_presence_is_trip_inventory: false;
  };
  correction_version_semantics: {
    accepted_launch_feeds_only: true;
    corrections_are_separate_non_authorizing_context: true;
  };
  freeze_readiness: "frozen_evidence_only_ready_for_dual_independent_risk_review";
  authorization_state: "evidence_only_no_gate_no_persistence";
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildPlan040Package4CandidateEvidence(input: {
  candidate: Plan040AcquisitionCandidate;
  boundary: Plan040Package4CandidateEvidence["boundary_evidence"];
  stopListSourceId: string;
  stopListPdfSha256: string;
  stopListLayoutTextSha256: string;
  stopListRawTextSha256: string;
  stopListText: string;
  stopListBlocksJsonl: string;
  prePatterns: HistoricalFullStopPattern[];
  postPatterns: HistoricalFullStopPattern[];
  preScheduleSlice: Plan040Package2ScheduleSlice;
  postScheduleSlice: Plan040Package2ScheduleSlice;
}): Plan040Package4CandidateEvidence {
  const computationalCandidate: Plan040AcquisitionCandidate = {
    ...input.candidate,
    // The Package 2 comparison routine requires this literal, but Package 4
    // independently records and enforces actual trip-inventory completeness.
    inventory_status: "accepted_reused",
  };
  const base = buildPlan040Package2CandidateEvidence({
    candidate: computationalCandidate,
    stopListSourceId: input.stopListSourceId,
    stopListPdfSha256: input.stopListPdfSha256,
    stopListLayoutTextSha256: input.stopListLayoutTextSha256,
    stopListRawTextSha256: input.stopListRawTextSha256,
    stopListText: input.stopListText,
    stopListBlocksJsonl: input.stopListBlocksJsonl,
    prePatterns: input.prePatterns,
    postPatterns: input.postPatterns,
    preScheduleSlice: input.preScheduleSlice,
    postScheduleSlice: input.postScheduleSlice,
  });
  const riskFlags = [
    "possible_extent_and_grain_creation_requires_dual_review",
    ...(input.boundary.cross_family_context
      ? ["cross_family_context_requires_dual_review"]
      : []),
    ...(!input.boundary.complete_active_trip_boundary
      ? ["incomplete_active_trip_boundary"]
      : []),
  ].sort();
  if (input.boundary.complete_active_trip_boundary) {
    return {
      ...base,
      gtfs_route_id: input.candidate.gtfs_route_id as Plan040Package4RouteId,
      boundary_evidence: input.boundary,
      risk_flags: riskFlags,
    };
  }
  return {
    ...base,
    gtfs_route_id: input.candidate.gtfs_route_id as Plan040Package4RouteId,
    unresolved_gap_codes: [...new Set([
      ...base.unresolved_gap_codes,
      "incomplete_active_trip_boundary",
      input.boundary.boundary_class,
    ])].sort(),
    evidence_verdict: "receipt_terminal_unresolved",
    proposed_extent_decision: null,
    proposed_grain_decision: null,
    boundary_evidence: input.boundary,
    risk_flags: riskFlags,
  };
}

export function buildPlan040Package4Draft(input: {
  extentLedger: { path: string; sha256: string };
  grainLedger: { path: string; sha256: string };
  priorPackages: Plan040Package4Draft["prior_packages"];
  acquisitionReceiptPath: string;
  acquisitionReceiptSha256: string;
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package4CandidateEvidence[];
}): Plan040Package4Draft {
  const byRoute = new Map(input.candidates.map((candidate) => [
    candidate.gtfs_route_id,
    candidate,
  ]));
  if (
    input.candidates.length !== 23 ||
    byRoute.size !== 23 ||
    PLAN040_PACKAGE_4_ROUTE_ORDER.some((routeId) => !byRoute.has(routeId))
  ) {
    throw new Error("Plan 040 Package 4 requires exact 23-route parity");
  }
  if (
    input.priorPackages.length !== 2 ||
    input.priorPackages.some((entry) => entry.overlap_count !== 0)
  ) {
    throw new Error("Plan 040 Package 4 prior-package overlap proof drifted");
  }
  const candidates = PLAN040_PACKAGE_4_ROUTE_ORDER.map((routeId) =>
    byRoute.get(routeId)!);
  const keys = candidates.map((candidate) => candidate.candidate_key).sort();
  if (new Set(keys).size !== 23) {
    throw new Error("Plan 040 Package 4 candidate keys are not unique");
  }
  for (const candidate of candidates) {
    const boundary = candidate.boundary_evidence;
    if (
      boundary.route_row_presence_is_not_trip_inventory !== true ||
      boundary.complete_active_trip_boundary !==
        (boundary.pre_active_trip_count > 0 && boundary.post_active_trip_count > 0)
    ) {
      throw new Error(`${candidate.gtfs_route_id}: boundary completeness drifted`);
    }
    if (
      !boundary.complete_active_trip_boundary &&
      (
        candidate.evidence_verdict !== "receipt_terminal_unresolved" ||
        candidate.proposed_extent_decision !== null ||
        candidate.proposed_grain_decision !== null
      )
    ) {
      throw new Error(`${candidate.gtfs_route_id}: incomplete boundary gained authority`);
    }
    if (
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence
    ) {
      throw new Error(`${candidate.gtfs_route_id}: Package 4 gained unsupported authority`);
    }
  }
  const positive = candidates.filter((candidate) =>
    candidate.evidence_verdict === "evidence_complete_stop_set").length;
  const boundaryDistribution = Object.fromEntries(
    [
      "complete_weekend_launch_boundary",
      "complete_weekday_launch_boundary",
      "cross_family_transfer_incomplete",
      "pre_inventory_absent",
      "both_boundary_inventories_absent",
    ].map((boundaryClass) => [
      boundaryClass,
      candidates.filter((candidate) =>
        candidate.boundary_evidence.boundary_class === boundaryClass).length,
    ]),
  ) as Record<Plan040Package4BoundaryClass, number>;
  return {
    schema_version: 1,
    package_id: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4,
    extent_ledger: input.extentLedger,
    grain_ledger: input.grainLedger,
    prior_packages: input.priorPackages,
    acquisition_receipt: {
      path: input.acquisitionReceiptPath,
      sha256: input.acquisitionReceiptSha256,
    },
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 23,
    source_count: 23,
    candidate_key_sha256: sha256(`${keys.join("\n")}\n`),
    boundary_distribution: boundaryDistribution,
    evidence_verdict_distribution: {
      evidence_complete_stop_set: positive,
      receipt_terminal_unresolved: 23 - positive,
    },
    proposed_extent_distribution: {
      stop_set: positive,
      unresolved: 23 - positive,
    },
    proposed_decision_count: positive,
    persisted_decision_count: 0,
    proposed_grain_distribution: {
      trip_subset: positive,
      unresolved: 23 - positive,
    },
    proposed_grain_decision_count: positive,
    persisted_grain_decision_count: 0,
    candidates,
    equivalence_policy: {
      automatic_equivalence: "identical_stop_id_only",
      changed_id_name_coordinate_or_proximity_equivalence: false,
      route_row_presence_is_trip_inventory: false,
    },
    correction_version_semantics: {
      accepted_launch_feeds_only: true,
      corrections_are_separate_non_authorizing_context: true,
    },
    freeze_readiness:
      "frozen_evidence_only_ready_for_dual_independent_risk_review",
    authorization_state: "evidence_only_no_gate_no_persistence",
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}

export function plan040Package4ReplayHash(value: JsonValue): string {
  return sha256(`${stableJson(value)}\n`);
}

const PACKAGE_4_ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-stop-removal-package-4-acquisition-v1.json";
const PACKAGE_4_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-4-evidence-v1.json";
const PACKAGE_4_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-4-evidence-draft-v1.json";
const PACKAGE_4_GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-4-dual-review-gate-v1.json";

function package4ArtifactPins() {
  return {
    acquisition: {
      path: PACKAGE_4_ACQUISITION_PATH,
      sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ACQUISITION_SHA256,
    },
    evidence: {
      path: PACKAGE_4_EVIDENCE_PATH,
      sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_EVIDENCE_SHA256,
    },
    draft: {
      path: PACKAGE_4_DRAFT_PATH,
      sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_DRAFT_SHA256,
      replay_sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_DRAFT_SHA256,
    },
  };
}

export function buildPlan040Package4GateAndAcceptance(input: {
  draft: Plan040Package4Draft;
  acceptedAt: string;
}) {
  const draftHash = plan040Package4ReplayHash(
    input.draft as unknown as JsonValue,
  );
  const unresolved = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "receipt_terminal_unresolved");
  if (
    draftHash !== PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_DRAFT_SHA256 ||
    input.draft.candidate_count !== 23 ||
    input.draft.candidate_key_sha256 !==
      "68e73dc82486efb1744a1b826694af767b7e609dfeadbe9ab4b038a681d40eca" ||
    unresolved.length !== 23 ||
    unresolved.some((candidate) =>
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0) ||
    input.draft.proposed_decision_count !== 0 ||
    input.draft.persisted_decision_count !== 0 ||
    input.draft.proposed_grain_decision_count !== 0 ||
    input.draft.persisted_grain_decision_count !== 0 ||
    input.draft.authorizes_occurrence ||
    input.draft.authorizes_study ||
    input.draft.authorizes_cross_product ||
    input.draft.authorizes_decision_persistence
  ) {
    throw new Error(
      "Plan 040 Package 4 frozen verdict, hash, or authorization scope drifted",
    );
  }
  const unresolvedKeys = unresolved
    .map((candidate) => candidate.candidate_key)
    .sort();
  const unresolvedKeySha256 = sha256(`${unresolvedKeys.join("\n")}\n`);
  const reviewerResults = [
    {
      role: "independent_main_advisor_evidence_review",
      reviewer_id: "main_advisor",
      verdict: "APPROVE" as const,
    },
    {
      role: "independent_provenance_and_fail_closed_audit",
      reviewer_id: "plan040_package4_independent_audit",
      verdict: "APPROVE" as const,
    },
  ];
  const gate = {
    schema_version: 1,
    gate_id: "plan-040-qbnr-stop-removal-package-4-dual-review-gate-v1",
    package_id: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4,
    reviewed_commit: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_REVIEWED_COMMIT,
    artifacts: package4ArtifactPins(),
    candidate_count: 23,
    candidate_key_sha256: input.draft.candidate_key_sha256,
    boundary_distribution: input.draft.boundary_distribution,
    evidence_verdict_distribution: {
      evidence_complete_stop_set: 0,
      receipt_terminal_unresolved: 23,
    },
    proposed_extent_distribution: { stop_set: 0, unresolved: 23 },
    proposed_grain_distribution: { trip_subset: 0, unresolved: 23 },
    unresolved_candidate_count: 23,
    unresolved_candidate_key_sha256: unresolvedKeySha256,
    reviewer_results: reviewerResults,
    checkpoint_tests: {
      focused: { pass: 4, fail: 0, assertions: 242, status: "pass" as const },
      typecheck: { status: "pass" as const },
      validate: {
        issues: 0,
        release_contract_issues: 0,
        warnings: 3,
        status: "pass" as const,
      },
      deterministic_replay: {
        sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_DRAFT_SHA256,
        status: "pass" as const,
      },
      full_repository: {
        status: "scheduled_after_persistence_checkpoint" as const,
        reason:
          "required_at_47_cumulative_new_closures_since_last_full_suite",
      },
    },
    authorization_state:
      "dual_review_approved_pending_owner_delegate_acceptance",
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    persisted_absence_receipt_count: 0,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
    authorizes_decision_persistence: false as const,
    authorizes_reviewed_absence_receipt_persistence: false as const,
  };
  const gateSha256 = sha256(
    `${stableJson(gate as unknown as JsonValue)}\n`,
  );
  const acceptance = {
    schema_version: 1,
    acceptance_id:
      "plan-040-qbnr-stop-removal-package-4-owner-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    gate: { path: PACKAGE_4_GATE_PATH, sha256: gateSha256 },
    artifacts: package4ArtifactPins(),
    candidate_count: 23,
    candidate_key_sha256: input.draft.candidate_key_sha256,
    evidence_verdict_distribution: {
      evidence_complete_stop_set: 0,
      receipt_terminal_unresolved: 23,
    },
    reviewer_results: {
      main_advisor: "APPROVE" as const,
      plan040_package4_independent_audit: "APPROVE" as const,
    },
    authorized_positive_persistence: {
      candidate_count: 0,
      candidate_keys: [] as string[],
      extent_decision_ids: [] as string[],
      grain_decision_ids: [] as string[],
    },
    authorized_reviewed_absence_receipt: {
      receipt_id:
        "plan-040-qbnr-stop-removal-package-4-reviewed-absence-v1",
      candidate_count: 23,
      candidate_key_sha256: unresolvedKeySha256,
      candidate_keys: unresolvedKeys,
      surfaces: ["member_extent", "member_grain"] as const,
      verdict_by_surface: {
        member_extent: "reviewed_terminal_unresolved" as const,
        member_grain: "reviewed_terminal_unresolved" as const,
      },
    },
    authorization_state:
      "owner_delegate_accepted_exact_23_key_reviewed_absence_only",
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    persisted_absence_receipt_count: 0,
    authorizes_decision_persistence: false as const,
    authorizes_reviewed_absence_receipt_persistence: true as const,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
  };
  return { gate, gateSha256, acceptance };
}

export function validatePlan040Package4GateAndAcceptance(input: {
  draft: Plan040Package4Draft;
  gate: unknown;
  acceptance: unknown;
  acceptedAt: string;
}) {
  const expected = buildPlan040Package4GateAndAcceptance({
    draft: input.draft,
    acceptedAt: input.acceptedAt,
  });
  if (
    stableJson(input.gate as JsonValue) !==
      stableJson(expected.gate as unknown as JsonValue)
  ) {
    throw new Error("Plan 040 Package 4 dual-review gate drifted");
  }
  if (
    stableJson(input.acceptance as JsonValue) !==
      stableJson(expected.acceptance as unknown as JsonValue)
  ) {
    throw new Error("Plan 040 Package 4 owner/delegate acceptance drifted");
  }
  return {
    candidate_count: 23,
    positive_candidate_count: 0,
    unresolved_candidate_count: 23,
    authorized_extent_decision_count: 0,
    authorized_grain_decision_count: 0,
    authorized_absence_candidate_count: 23,
    persisted_decision_count: 0,
    persisted_absence_receipt_count: 0,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
  };
}

type Plan040Package4GateAndAcceptance =
  ReturnType<typeof buildPlan040Package4GateAndAcceptance>;

export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_DRAFT_PATH = join(
  repoRoot,
  PACKAGE_4_DRAFT_PATH,
);
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_GATE_PATH = join(
  repoRoot,
  PACKAGE_4_GATE_PATH,
);
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ACCEPTANCE_PATH = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-stop-removal-package-4-owner-acceptance-v1.json",
);
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ABSENCE_RECEIPT_PATH = join(
  repoRoot,
  "data/quality/acquisition/receipts/member-extent/" +
    "plan-040-qbnr-stop-removal-package-4-reviewed-absence-v1.json",
);

function writeImmutablePlan040Package4Json(
  path: string,
  value: unknown,
): void {
  const contents = `${stableJson(value as JsonValue)}\n`;
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== contents) {
      throw new Error(
        `Refusing to overwrite immutable Plan 040 Package 4 artifact ` +
        `${relative(repoRoot, path)}`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

function assertExactPlan040Package4Values(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  if (
    stableJson([...actual].sort() as JsonValue) !==
      stableJson([...expected].sort() as JsonValue)
  ) {
    throw new Error(
      `Plan 040 Package 4 ${label} drifted outside owner acceptance`,
    );
  }
}

export function buildPlan040Package4AcceptedArtifacts(input: {
  draft: Plan040Package4Draft;
  gate: Plan040Package4GateAndAcceptance["gate"];
  acceptance: Plan040Package4GateAndAcceptance["acceptance"];
}): {
  extentDecisions: [];
  grainDecisions: [];
  absenceReceipt: MemberExtentAbsenceReceipt;
} {
  validatePlan040Package4GateAndAcceptance({
    draft: input.draft,
    gate: input.gate,
    acceptance: input.acceptance,
    acceptedAt: input.acceptance.accepted_at,
  });
  if (
    input.acceptance.authorization_state !==
      "owner_delegate_accepted_exact_23_key_reviewed_absence_only" ||
    input.acceptance.authorizes_decision_persistence !== false ||
    input.acceptance.authorizes_reviewed_absence_receipt_persistence !== true ||
    input.acceptance.authorizes_occurrence !== false ||
    input.acceptance.authorizes_study !== false ||
    input.acceptance.authorizes_cross_product !== false ||
    input.acceptance.authorized_positive_persistence.candidate_count !== 0 ||
    input.acceptance.authorized_positive_persistence.candidate_keys.length !== 0 ||
    input.acceptance.authorized_positive_persistence.extent_decision_ids.length !== 0 ||
    input.acceptance.authorized_positive_persistence.grain_decision_ids.length !== 0
  ) {
    throw new Error(
      "Plan 040 Package 4 owner acceptance does not authorize receipt-only persistence",
    );
  }
  const unresolved = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "receipt_terminal_unresolved");
  if (
    unresolved.length !== 23 ||
    unresolved.some((candidate) =>
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0 ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence)
  ) {
    throw new Error(
      "Plan 040 Package 4 persistence inputs no longer match the accepted terminal split",
    );
  }
  const unresolvedKeys = unresolved
    .map((candidate) => candidate.candidate_key)
    .sort();
  assertExactPlan040Package4Values(
    input.acceptance.authorized_reviewed_absence_receipt.candidate_keys,
    unresolvedKeys,
    "reviewed absence candidate keys",
  );
  assertExactPlan040Package4Values(
    input.acceptance.authorized_reviewed_absence_receipt.surfaces,
    ["member_extent", "member_grain"],
    "reviewed absence surfaces",
  );
  const unresolvedKeySha256 = sha256(`${unresolvedKeys.join("\n")}\n`);
  if (
    input.acceptance.authorized_reviewed_absence_receipt.receipt_id !==
      "plan-040-qbnr-stop-removal-package-4-reviewed-absence-v1" ||
    input.acceptance.authorized_reviewed_absence_receipt.candidate_count !== 23 ||
    input.acceptance.authorized_reviewed_absence_receipt.candidate_key_sha256 !==
      unresolvedKeySha256 ||
    input.acceptance.authorized_reviewed_absence_receipt.verdict_by_surface
        .member_extent !== "reviewed_terminal_unresolved" ||
    input.acceptance.authorized_reviewed_absence_receipt.verdict_by_surface
        .member_grain !== "reviewed_terminal_unresolved"
  ) {
    throw new Error(
      "Plan 040 Package 4 reviewed absence authorization drifted",
    );
  }
  const exactSearches = unresolved.map((candidate) => {
    if (
      !/^https:\/\/www\.mta\.info\/document\/[0-9]+$/u.test(
        candidate.stop_list_url,
      )
    ) {
      throw new Error(
        `${candidate.gtfs_route_id}: reviewed absence URL is not an exact MTA document URL`,
      );
    }
    return [
      `candidate=${candidate.candidate_key}`,
      `route=${candidate.gtfs_route_id}`,
      `official_stop_list=${candidate.stop_list_url}`,
      `exact_search=Removed rows in ${candidate.stop_list_source_id}`,
      `pre=${candidate.pre_source_id}@${candidate.pre_target_date}/` +
        `${candidate.pre_gtfs_route_id}`,
      `post=${candidate.post_source_id}@${candidate.post_target_date}/` +
        `${candidate.post_gtfs_route_id}`,
      `pre_schedule=${candidate.pre_schedule_slice.source_id}@` +
        `${candidate.pre_schedule_slice.schedule_date}/` +
        `${candidate.pre_schedule_slice.route_id}`,
      `post_schedule=${candidate.post_schedule_slice.source_id}@` +
        `${candidate.post_schedule_slice.schedule_date}/` +
        `${candidate.post_schedule_slice.route_id}`,
      `boundary=${candidate.boundary_evidence.boundary_class}`,
      `complete_active_trip_boundary=` +
        `${candidate.boundary_evidence.complete_active_trip_boundary}`,
      "route_row_presence_is_not_trip_inventory=true",
      "result=receipt_terminal_unresolved",
      `gaps=${candidate.unresolved_gap_codes.join(",")}`,
      `nonexclusive_context=${candidate.nonexclusive_context_codes.join(",")}`,
    ].join("; ");
  }).sort();
  if (new Set(exactSearches).size !== 23) {
    throw new Error(
      "Plan 040 Package 4 requires one exact search record per candidate",
    );
  }
  const urlsInspected = [
    ...new Set(unresolved.map((candidate) => candidate.stop_list_url)),
  ].sort();
  if (urlsInspected.length !== 23) {
    throw new Error(
      "Plan 040 Package 4 requires one exact official stop-list URL per candidate",
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
    urls_inspected: urlsInspected,
    rationale:
      "Owner-delegate accepted reviewed absence for the exact 23 Package 4 " +
      "candidates that remained receipt-terminal unresolved after dual independent " +
      "review of candidate-specific MTA stop lists, accepted launch GTFS feeds, " +
      "calendar-derived service boundaries, ordered stop chains, and schedule trip " +
      "types. This records terminal member-extent and member-grain ledger review only. " +
      "Unresolved bindings, source gaps, incomplete active-trip boundaries, route " +
      "variants, and nonexclusive context remain preserved; route-row presence is not " +
      "trip inventory, corrections remain separate and non-authorizing, and no " +
      "occurrence, study, cross-product, positive extent, or positive grain decision " +
      "is authorized.",
    reviewed_at: input.acceptance.accepted_at,
    reviewed_by: input.acceptance.accepted_by,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  return {
    extentDecisions: [],
    grainDecisions: [],
    absenceReceipt,
  };
}

export function acceptPlan040Package4ReceiptPackage(): {
  absenceReceiptPath: string;
  absenceReceiptSha256: string;
  extentDecisionCount: 0;
  grainDecisionCount: 0;
  absenceCandidateCount: 23;
} {
  const requiredPins = [
    [
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_DRAFT_PATH,
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_DRAFT_SHA256,
      "draft",
    ],
    [
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_GATE_PATH,
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_GATE_SHA256,
      "dual-review gate",
    ],
    [
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ACCEPTANCE_PATH,
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ACCEPTANCE_SHA256,
      "owner acceptance",
    ],
  ] as const;
  for (const [path, expectedSha256, label] of requiredPins) {
    const actualSha256 = fileSha256(path);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Plan 040 Package 4 ${label} pin drifted: ${actualSha256}`,
      );
    }
  }
  const draft = JSON.parse(
    readFileSync(PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_DRAFT_PATH, "utf8"),
  ) as Plan040Package4Draft;
  const gate = JSON.parse(
    readFileSync(PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_GATE_PATH, "utf8"),
  ) as Plan040Package4GateAndAcceptance["gate"];
  const acceptance = JSON.parse(
    readFileSync(
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ACCEPTANCE_PATH,
      "utf8",
    ),
  ) as Plan040Package4GateAndAcceptance["acceptance"];
  const accepted = buildPlan040Package4AcceptedArtifacts({
    draft,
    gate,
    acceptance,
  });
  writeImmutablePlan040Package4Json(
    PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ABSENCE_RECEIPT_PATH,
    { receipts: [accepted.absenceReceipt] },
  );
  return {
    absenceReceiptPath:
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ABSENCE_RECEIPT_PATH,
    absenceReceiptSha256: fileSha256(
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ABSENCE_RECEIPT_PATH,
    ),
    extentDecisionCount: 0,
    grainDecisionCount: 0,
    absenceCandidateCount: 23,
  };
}
