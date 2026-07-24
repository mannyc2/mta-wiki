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
  PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8,
  plan040Package8ReplayHash,
  type Plan040Package8CandidateEvidence,
  type Plan040Package8Draft,
} from "./plan040-qbnr-service-pattern-package8.js";
import {
  extentDecisionKey,
} from "./study-readiness-v1.js";

export const PLAN040_PACKAGE_8_INITIAL_REVIEWED_COMMIT =
  "47c975d47ddf1232092dd0fc196c37562d4a0564" as const;
export const PLAN040_PACKAGE_8_APPROVED_COMMIT =
  "1da8976df4626d33588e0788b82874826cd561f4" as const;
export const PLAN040_PACKAGE_8_EVIDENCE_SHA256 =
  "3ee567af00c9eab1a50b823674cddc36f554a475b7e485f0fab3cd257858c192" as const;
export const PLAN040_PACKAGE_8_DRAFT_SHA256 =
  "a5e53299617523fa152072a55ca2fa1f9e9515750d6595a9706c737f0c3db152" as const;
export const PLAN040_PACKAGE_8_GATE_SHA256 =
  "efa525b03fe3cb56858a865e2e7e394ffbb9b765be7dc97cd9ee8eadfeff45c9" as const;
export const PLAN040_PACKAGE_8_ACCEPTANCE_SHA256 =
  "a6aa324ad0aef61c5dae054d30661057d5973848b26263cc0a555582124d17e8" as const;
export const PLAN040_PACKAGE_8_ABSENCE_RECEIPT_SHA256 =
  "0b0e60398c750dc29ab76cbb9d70886f72abe8a42c2c9127fc005eb8d6d1e8b4" as const;

const PACKAGE_8_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-8-evidence-v1.json";
const PACKAGE_8_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-8-evidence-draft-v1.json";
const PACKAGE_8_GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-8-dual-review-gate-v1.json";
const PACKAGE_8_ACCEPTANCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-8-owner-acceptance-v1.json";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_DRAFT_PATH =
  join(repoRoot, PACKAGE_8_DRAFT_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_GATE_PATH =
  join(repoRoot, PACKAGE_8_GATE_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ACCEPTANCE_PATH =
  join(repoRoot, PACKAGE_8_ACCEPTANCE_PATH);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ABSENCE_RECEIPT_PATH =
  join(
    repoRoot,
    "data/quality/acquisition/receipts/member-extent/" +
      "plan-040-qbnr-service-pattern-package-8-reviewed-absence-v1.json",
  );

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const artifactPins = () => ({
  evidence: {
    path: PACKAGE_8_EVIDENCE_PATH,
    sha256: PLAN040_PACKAGE_8_EVIDENCE_SHA256,
  },
  draft: {
    path: PACKAGE_8_DRAFT_PATH,
    sha256: PLAN040_PACKAGE_8_DRAFT_SHA256,
    replay_sha256: PLAN040_PACKAGE_8_DRAFT_SHA256,
  },
});

export function buildPlan040Package8GateAndAcceptance(input: {
  draft: Plan040Package8Draft;
  acceptedAt: string;
}) {
  const replayHash = plan040Package8ReplayHash(
    input.draft as unknown as JsonValue,
  );
  const terminal = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "receipt_terminal_unresolved");
  if (
    replayHash !== PLAN040_PACKAGE_8_DRAFT_SHA256 ||
    input.draft.candidate_count !== 30 ||
    input.draft.route_count !== 18 ||
    input.draft.candidate_key_sha256 !==
      PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256 ||
    terminal.length !== 30 ||
    terminal.some((candidate) =>
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0 ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence) ||
    input.draft.persisted_extent_decision_count !== 0 ||
    input.draft.persisted_grain_decision_count !== 0 ||
    input.draft.authorizes_occurrence ||
    input.draft.authorizes_study ||
    input.draft.authorizes_cross_product ||
    input.draft.authorizes_decision_persistence
  ) {
    throw new Error(
      "Plan 040 Package 8 frozen verdict or authorization scope drifted",
    );
  }
  const candidateKeys = terminal
    .map((candidate) => candidate.candidate_key)
    .sort();
  const candidateKeySha256 = sha256(`${candidateKeys.join("\n")}\n`);
  if (candidateKeySha256 !== PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256) {
    throw new Error("Plan 040 Package 8 accepted candidate keys drifted");
  }
  const reviewerResults = [
    {
      role: "independent_main_advisor_evidence_review",
      reviewer_id: "main_advisor",
      reviewed_commit: PLAN040_PACKAGE_8_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
    {
      role: "independent_provenance_and_fail_closed_audit",
      reviewer_id: "plan040_package8_independent_audit",
      reviewed_commit: PLAN040_PACKAGE_8_APPROVED_COMMIT,
      verdict: "APPROVE" as const,
    },
  ];
  const gate = {
    schema_version: 1,
    gate_id:
      "plan-040-qbnr-service-pattern-package-8-dual-review-gate-v1",
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8,
    reviewed_commit: PLAN040_PACKAGE_8_APPROVED_COMMIT,
    review_history: [{
      commit: PLAN040_PACKAGE_8_INITIAL_REVIEWED_COMMIT,
      verdict: "REFUTE" as const,
      superseded_by: PLAN040_PACKAGE_8_APPROVED_COMMIT,
      findings: [
        "correction_version_separation_missing",
        "trip_type_revenue_validation_missing_for_wave_b",
      ],
      resolution:
        "Commit 1da8976d pinned immutable correction identities and blocked corrected comparison, " +
        "then added exact trip_type passenger validation, raw-inventory nonauthorization, and " +
        "terminal Q36/Q85 mismatch partitions without changing any candidate outcome.",
    }],
    artifacts: artifactPins(),
    candidate_count: 30,
    route_count: 18,
    candidate_key_sha256: candidateKeySha256,
    verdict_distribution: {
      receipt_terminal_unresolved: 30,
    },
    wave_distribution: {
      "P8-A": 15,
      "P8-B": 15,
    },
    current_positive_candidate_count: 0,
    reviewed_terminal_unresolved_candidate_count: 30,
    correction_sensitive_candidate_count: terminal.filter((candidate) =>
      candidate.correction_sensitivity !== undefined).length,
    wave_b_schedule_validation: {
      exact_match_candidate_count: terminal.filter((candidate) =>
        candidate.risk_wave_id === "P8-B" &&
        candidate.schedule_trip_type_validation?.pre.shape_sets_match &&
        candidate.schedule_trip_type_validation.post.shape_sets_match).length,
      terminal_mismatch_candidate_count: terminal.filter((candidate) =>
        candidate.risk_wave_id === "P8-B" &&
        candidate.schedule_trip_type_validation?.pre.shape_sets_match &&
        !candidate.schedule_trip_type_validation.post.shape_sets_match).length,
      terminal_mismatch_routes: ["Q36", "Q85"],
    },
    reviewer_results: reviewerResults,
    checkpoint_tests: {
      focused_package_8: {
        pass: 8,
        fail: 0,
        assertions: 1277,
        status: "pass" as const,
      },
      combined_package_7_and_8: {
        pass: 21,
        fail: 0,
        assertions: 2222,
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
        sha256: PLAN040_PACKAGE_8_DRAFT_SHA256,
        status: "pass" as const,
      },
      full_repository: {
        status:
          "scheduled_after_persistence_50_candidate_checkpoint" as const,
        closure_count_since_repaired_baseline: 50,
        pinned_repaired_baseline: {
          path:
            "data/quality/operational-reference/member-extent-risk/" +
            "plan-040-package-6-checkpoint-repaired-baseline-v1.json",
          pass: 1727,
          skip: 1,
          fail: 9,
          error: 1,
          test_count: 1737,
          file_count: 144,
          expect_call_count: 600438,
          failure_family_id: "known_missing_corpus_environment_family",
        },
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
      "plan-040-qbnr-service-pattern-package-8-owner-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    gate: { path: PACKAGE_8_GATE_PATH, sha256: gateSha256 },
    artifacts: artifactPins(),
    candidate_count: 30,
    route_count: 18,
    candidate_key_sha256: candidateKeySha256,
    verdict_distribution: {
      receipt_terminal_unresolved: 30,
    },
    reviewer_results: {
      main_advisor: "APPROVE" as const,
      plan040_package8_independent_audit: "APPROVE" as const,
    },
    authorized_positive_persistence: {
      candidate_count: 0,
      candidate_keys: [] as string[],
      extent_decision_ids: [] as string[],
      grain_decision_ids: [] as string[],
    },
    authorized_reviewed_absence_receipt: {
      receipt_id:
        "plan-040-qbnr-service-pattern-package-8-reviewed-absence-v1",
      candidate_count: 30,
      candidate_key_sha256: candidateKeySha256,
      candidate_keys: candidateKeys,
      surfaces: ["member_extent", "member_grain"] as const,
      verdict_by_surface: {
        member_extent: "reviewed_terminal_unresolved" as const,
        member_grain: "reviewed_terminal_unresolved" as const,
      },
    },
    authorization_state:
      "owner_delegate_accepted_exact_30_key_reviewed_absence_only",
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

export function validatePlan040Package8GateAndAcceptance(input: {
  draft: Plan040Package8Draft;
  gate: unknown;
  acceptance: unknown;
  acceptedAt: string;
}) {
  const expected = buildPlan040Package8GateAndAcceptance({
    draft: input.draft,
    acceptedAt: input.acceptedAt,
  });
  if (
    stableJson(input.gate as JsonValue) !==
      stableJson(expected.gate as unknown as JsonValue)
  ) {
    throw new Error("Plan 040 Package 8 dual-review gate drifted");
  }
  if (
    stableJson(input.acceptance as JsonValue) !==
      stableJson(expected.acceptance as unknown as JsonValue)
  ) {
    throw new Error(
      "Plan 040 Package 8 owner/delegate acceptance drifted",
    );
  }
  return {
    candidate_count: 30,
    positive_candidate_count: 0,
    reviewed_terminal_unresolved_candidate_count: 30,
    authorized_extent_decision_count: 0,
    authorized_grain_decision_count: 0,
    authorized_absence_candidate_count: 30,
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
        `Refusing to overwrite immutable Plan 040 Package 8 artifact ${
          relative(repoRoot, path)
        }`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function writePlan040Package8GateAndAcceptance(input: {
  acceptedAt: string;
}) {
  const draft = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package8Draft;
  const built = buildPlan040Package8GateAndAcceptance({
    draft,
    acceptedAt: input.acceptedAt,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_GATE_PATH,
    built.gate,
  );
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ACCEPTANCE_PATH,
    built.acceptance,
  );
  return {
    gatePath: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_GATE_PATH,
    gateSha256: built.gateSha256,
    acceptancePath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ACCEPTANCE_PATH,
    acceptanceSha256: sha256(
      `${stableJson(built.acceptance as unknown as JsonValue)}\n`,
    ),
  };
}

type Plan040Package8GateAndAcceptance =
  ReturnType<typeof buildPlan040Package8GateAndAcceptance>;

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
      `Plan 040 Package 8 ${label} drifted outside owner acceptance`,
    );
  }
}

function candidateSearchRecord(
  candidate: Plan040Package8CandidateEvidence,
): string {
  const exactDocumentSearches = candidate.risk_wave_id === "P8-A"
    ? [
      `candidate_document_url=${candidate.immutable_p2_p4_context!.candidate_document.source_url}`,
      `candidate_document_source=${candidate.immutable_p2_p4_context!.candidate_document.source_id}`,
      "candidate_document_nonexclusive_context=true",
    ]
    : candidate.candidate_document_gap!.exact_url_searches.map((search) =>
      `${search.source_role}=${search.source_url}/staged_matches=0`);
  const scheduleSearches = candidate.risk_wave_id === "P8-A"
    ? [
      `pre_schedule_shape_ids=${candidate.schedule_to_gtfs_shape_gap!.pre.schedule_passenger_shape_ids.join(",")}`,
      `post_schedule_shape_ids=${candidate.schedule_to_gtfs_shape_gap!.post.schedule_passenger_shape_ids.join(",")}`,
      `post_schedule_only_shape_ids=${candidate.schedule_to_gtfs_shape_gap!.post.schedule_only_shape_ids.join(",")}`,
      `post_gtfs_only_shape_ids=${candidate.schedule_to_gtfs_shape_gap!.post.gtfs_only_shape_ids.join(",")}`,
    ]
    : [
      `pre_schedule_shape_ids=${candidate.schedule_trip_type_validation!.pre.schedule_passenger_shape_ids.join(",")}`,
      `post_schedule_shape_ids=${candidate.schedule_trip_type_validation!.post.schedule_passenger_shape_ids.join(",")}`,
      `post_schedule_only_shape_ids=${candidate.schedule_trip_type_validation!.post.schedule_only_passenger_shape_ids.join(",")}`,
      `post_gtfs_only_shape_ids=${candidate.schedule_trip_type_validation!.post.gtfs_only_active_shape_ids.join(",")}`,
    ];
  const correctionSearches = candidate.correction_sensitivity
    ? [
      `published_initial_post_sha1=${candidate.correction_sensitivity.published_initial_post_sha1}`,
      `correction_version_sha1=${candidate.correction_sensitivity.correction_version_sha1}`,
      "corrected_first_week_diff=blocked_not_run",
      "correction_bytes_used=false",
    ]
    : [];
  return [
    `candidate=${candidate.candidate_key}`,
    `route=${candidate.gtfs_route_id}`,
    `risk_wave=${candidate.risk_wave_id}`,
    `service_change=${candidate.source_statement.evidence_id}`,
    `pre=${candidate.boundary_inventory.pre.source_id}@` +
      `${candidate.boundary_inventory.pre.target_date}/${candidate.gtfs_route_id}`,
    `post=${candidate.boundary_inventory.post.source_id}@` +
      `${candidate.boundary_inventory.post.target_date}/${candidate.gtfs_route_id}`,
    "raw_gtfs_inventory_nonauthorizing=true",
    ...exactDocumentSearches,
    ...scheduleSearches,
    ...correctionSearches,
    `exact_searches=${candidate.exact_candidate_searches.join(" | ")}`,
    "occurrence_inference_prohibited=true",
    "result=receipt_terminal_unresolved",
    `gaps=${candidate.unresolved_gap_codes.join(",")}`,
  ].join("; ");
}

export function buildPlan040Package8AcceptedArtifacts(input: {
  draft: Plan040Package8Draft;
  gate: Plan040Package8GateAndAcceptance["gate"];
  acceptance: Plan040Package8GateAndAcceptance["acceptance"];
}): {
  extentDecisions: [];
  grainDecisions: [];
  absenceReceipt: MemberExtentAbsenceReceipt;
} {
  validatePlan040Package8GateAndAcceptance({
    draft: input.draft,
    gate: input.gate,
    acceptance: input.acceptance,
    acceptedAt: input.acceptance.accepted_at,
  });
  if (
    input.acceptance.authorization_state !==
      "owner_delegate_accepted_exact_30_key_reviewed_absence_only" ||
    input.acceptance.authorizes_decision_persistence !== false ||
    input.acceptance.authorizes_reviewed_absence_receipt_persistence !==
      true ||
    input.acceptance.authorizes_occurrence !== false ||
    input.acceptance.authorizes_study !== false ||
    input.acceptance.authorizes_cross_product !== false ||
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
      "Plan 040 Package 8 owner acceptance does not authorize receipt-only persistence",
    );
  }
  const terminal = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "receipt_terminal_unresolved");
  if (
    terminal.length !== 30 ||
    terminal.some((candidate) =>
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0 ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence)
  ) {
    throw new Error(
      "Plan 040 Package 8 persistence inputs no longer match the accepted 0-positive/30-terminal split",
    );
  }
  const terminalKeys = terminal
    .map((candidate) => candidate.candidate_key)
    .sort();
  assertExactValues(
    input.acceptance.authorized_reviewed_absence_receipt.candidate_keys,
    terminalKeys,
    "reviewed absence candidate keys",
  );
  assertExactValues(
    input.acceptance.authorized_reviewed_absence_receipt.surfaces,
    ["member_extent", "member_grain"],
    "reviewed absence surfaces",
  );
  const terminalKeySha256 = sha256(`${terminalKeys.join("\n")}\n`);
  if (
    terminalKeySha256 !== PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256 ||
    input.acceptance.authorized_reviewed_absence_receipt.receipt_id !==
      "plan-040-qbnr-service-pattern-package-8-reviewed-absence-v1" ||
    input.acceptance.authorized_reviewed_absence_receipt.candidate_count !==
      30 ||
    input.acceptance.authorized_reviewed_absence_receipt
        .candidate_key_sha256 !== terminalKeySha256 ||
    input.acceptance.authorized_reviewed_absence_receipt
        .verdict_by_surface.member_extent !==
      "reviewed_terminal_unresolved" ||
    input.acceptance.authorized_reviewed_absence_receipt
        .verdict_by_surface.member_grain !==
      "reviewed_terminal_unresolved"
  ) {
    throw new Error(
      "Plan 040 Package 8 reviewed absence authorization drifted",
    );
  }
  const exactSearches = terminal.map(candidateSearchRecord).sort();
  if (new Set(exactSearches).size !== 30) {
    throw new Error(
      "Plan 040 Package 8 requires one exact search record per candidate",
    );
  }
  const urlsInspected = [...new Set(terminal.flatMap((candidate) =>
    candidate.risk_wave_id === "P8-A"
      ? [
        candidate.immutable_p2_p4_context!.candidate_document.source_url,
      ]
      : candidate.candidate_document_gap!.exact_url_searches.map((search) =>
        search.source_url)))].sort();
  if (
    urlsInspected.length !== 28 ||
    urlsInspected.some((url) => !url.startsWith("https://www.mta.info/"))
  ) {
    throw new Error(
      "Plan 040 Package 8 requires the exact 28-URL official review set",
    );
  }
  const absenceReceipt: MemberExtentAbsenceReceipt = {
    schema_version: MEMBER_EXTENT_LEDGER_SCHEMA_VERSION,
    contract_id: MEMBER_EXTENT_ABSENCE_CONTRACT_ID,
    receipt_id:
      input.acceptance.authorized_reviewed_absence_receipt.receipt_id,
    surfaces: ["member_extent", "member_grain"],
    extent_keys: terminal.map((candidate) => ({
      occurrence_id: candidate.occurrence_id,
      route_record_id: candidate.route_record_id,
      treatment_record_id: candidate.treatment_record_id,
    })).sort((left, right) =>
      extentDecisionKey(left).localeCompare(extentDecisionKey(right))),
    exact_searches: exactSearches,
    urls_inspected: urlsInspected,
    rationale:
      "Owner-delegate accepted reviewed absence for the exact 30 Package 8 service-pattern " +
      "candidates after dual independent review of the amended frozen package. This records " +
      "terminal member-extent and member-grain ledger review only. Immutable Package 2, 3, " +
      "and 4 receipts; exact candidate-specific searches; unresolved candidate-document and " +
      "schedule/GTFS shape bindings; source gaps; nonexclusive context; raw GTFS inventory " +
      "nonauthorization; and the prohibition on occurrence inference remain preserved. The " +
      "published-launch comparison uses only accepted initial feed bytes. Exact first-week " +
      "correction bytes remain unavailable, so the corrected comparison was not run and no " +
      "outcome was reclassified. No occurrence, study, cross-product, positive extent, or " +
      "positive grain decision is authorized.",
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

export function acceptPlan040Package8ReceiptPackage(): {
  absenceReceiptPath: string;
  absenceReceiptSha256: string;
  extentDecisionCount: 0;
  grainDecisionCount: 0;
  absenceCandidateCount: 30;
} {
  const requiredPins = [
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_DRAFT_PATH,
      PLAN040_PACKAGE_8_DRAFT_SHA256,
      "draft",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_GATE_PATH,
      PLAN040_PACKAGE_8_GATE_SHA256,
      "dual-review gate",
    ],
    [
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ACCEPTANCE_PATH,
      PLAN040_PACKAGE_8_ACCEPTANCE_SHA256,
      "owner acceptance",
    ],
  ] as const;
  for (const [path, expectedSha256, label] of requiredPins) {
    const actualSha256 = fileSha256(path);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Plan 040 Package 8 ${label} pin drifted: ${actualSha256}`,
      );
    }
  }
  const draft = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package8Draft;
  const gate = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_GATE_PATH,
      "utf8",
    ),
  ) as Plan040Package8GateAndAcceptance["gate"];
  const acceptance = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ACCEPTANCE_PATH,
      "utf8",
    ),
  ) as Plan040Package8GateAndAcceptance["acceptance"];
  const accepted = buildPlan040Package8AcceptedArtifacts({
    draft,
    gate,
    acceptance,
  });
  writeImmutableJson(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ABSENCE_RECEIPT_PATH,
    { receipts: [accepted.absenceReceipt] },
  );
  return {
    absenceReceiptPath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ABSENCE_RECEIPT_PATH,
    absenceReceiptSha256: fileSha256(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ABSENCE_RECEIPT_PATH,
    ),
    extentDecisionCount: 0,
    grainDecisionCount: 0,
    absenceCandidateCount: 30,
  };
}
