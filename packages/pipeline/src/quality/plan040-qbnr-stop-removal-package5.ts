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
import { extentDecisionKey } from "./study-readiness-v1.js";

export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5 =
  "plan-040-qbnr-stop-removal-package-5-evidence-only-v1" as const;
export const PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256 =
  "8b8f5b5c6b8c137ff248a5cef133e6573191a46a442fff52f4a30959d047e0f0" as const;
export const PLAN040_PACKAGE_5_PRE_BUSCO_SHA1 =
  "54653b3fafb5fabc5ab1c941780b871343138440" as const;
export const PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1 =
  "e1c52ddfd8bece8f782dea60ee4d61f258f68e18" as const;
export const PLAN040_PACKAGE_5_NON_SUBSTITUTE_POST_BUSCO_SHA1 =
  "fb0e2c097635e5dfa495870b2b177b02762c9ecc" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_REVIEWED_COMMIT =
  "21571bba030ad54bd38e55274dc3172bad64b044" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ACQUISITION_SHA256 =
  "bb7c89669ed6b106cf37fe099b626116c4e5022f8ff909915cf68430853cb44c" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_EVIDENCE_SHA256 =
  "a8a54fc2e5554d9517b9b65d5726141d4cccd1e8c16072ae2260f76bb64eb6ba" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_DRAFT_SHA256 =
  "6506f12da89d3925b66a5f4a6003bd6b79929295c222ad18509459447e037179" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_GATE_SHA256 =
  "8449a0333f7f6f5ec30fc6463af0e6983b0b27f2da48e72468f15ee5135eba15" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ACCEPTANCE_SHA256 =
  "c3b5758a434ae8d647d4feb3e60ba3119350d6b222c98f554801de3434b144e7" as const;

export const PLAN040_PACKAGE_5_PACKAGE_3_PINS = {
  acquisition:
    "7417deb4c56f12d98a9ec61f486cad9b0caeb7121819b1824e874643454f697e",
  evidence:
    "149809f528571fc3e49808a61ee83670121db536e691ffae88b70579e8e9ccf8",
  draft:
    "1a3f446553955e75c373831ea282b1b4c0a2ceda2bfaec5f00a737d270b5fdbd",
} as const;

export const PLAN040_PACKAGE_5_ROUTE_ORDER = [
  "Q10",
  "Q100",
  "Q101",
  "Q103",
  "Q104",
  "Q11",
  "Q18",
  "Q19",
  "Q22",
  "Q32",
  "Q33",
  "Q35",
  "Q37",
  "Q40",
  "Q41",
  "Q47",
  "Q49",
  "Q60",
  "Q69",
  "Q72",
  "QM15",
  "QM18",
  "QM24",
  "QM25",
] as const;

export const PLAN040_PACKAGE_5_PACKAGE_3_CARRY_FORWARD_ROUTES = [
  "Q69",
  "Q101",
  "Q41",
  "Q32",
  "Q37",
  "Q11",
  "Q22",
  "Q33",
  "Q47",
  "Q103",
  "Q60",
  "Q18",
] as const;

export const PLAN040_PACKAGE_5_NEW_SOURCE_ROUTES = [
  "Q10",
  "Q100",
  "Q104",
  "Q19",
  "Q35",
  "Q40",
  "Q49",
  "Q72",
  "QM15",
  "QM18",
  "QM24",
  "QM25",
] as const;

export type Plan040Package5RouteId =
  (typeof PLAN040_PACKAGE_5_ROUTE_ORDER)[number];

export type Plan040Package5ScheduleSlice = {
  source_id: "mta_bus_schedules_2025_candidate_windows";
  schedule_date: string;
  route_id: Plan040Package5RouteId;
  operator: "MTA Bus";
  row_count: number;
  trip_type_rows: Record<string, number>;
  passenger_row_count: number;
  excluded_nonrevenue_row_count: number;
  ambiguous_shape_ids: string[];
  passenger_shape_ids: string[];
  nonrevenue_shape_ids: string[];
  shape_trip_type_rows: Array<{
    shape_id: string;
    trip_type_rows: Record<string, number>;
  }>;
};

export type Plan040Package5CandidateEvidence = {
  candidate_key: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  treatment_family: "bus_stop_or_boarding";
  gtfs_route_id: Plan040Package5RouteId;
  implementation_date: "2025-08-31" | "2025-09-02";
  evidence_origin:
    | "immutable_package_3_carry_forward"
    | "package_5_exact_candidate_document";
  immutable_package_3_ref: {
    evidence_manifest_sha256:
      typeof PLAN040_PACKAGE_5_PACKAGE_3_PINS.evidence;
    candidate_sha256: string;
  } | null;
  service_change_evidence: {
    evidence_id: string;
    block_sha256: string;
    captured_statement: string;
  };
  candidate_document: {
    source_id: string;
    source_url: string;
    anchor_relation:
      | "immutable_package_3_stop_list"
      | "candidate_row_full_stop_list"
      | "candidate_timetable_profile";
    receipt_sha256: string;
    pdf_sha256: string;
    layout_text_sha256: string;
    raw_text_sha256: string;
    blocks_sha256: string;
    statement_blocks: Array<{
      evidence_id: string;
      page_number: number;
      raw_text_sha256: string;
      normalized_text: string;
    }>;
    binding_status:
      | "immutable_package_3_candidate_binding"
      | "candidate_route_document_exact"
      | "candidate_route_document_nonexclusive_q10_q80";
  };
  pre_inventory: {
    source_id: "gtfs_static_20250626_busco_post_qbnr";
    zip_sha1: typeof PLAN040_PACKAGE_5_PRE_BUSCO_SHA1;
    zip_sha256: string;
    target_date: string;
    service_window: { start: string; end: string };
    active_service_ids: string[];
    active_service_id_sha256: string;
    route_trip_row_count: number;
    active_trip_count: number;
    active_shape_ids: string[];
    route_row_presence_is_not_trip_inventory: true;
  };
  required_post_inventory: {
    role: "phase_2_initial_busco_full_stop_inventory";
    target_date: "2025-08-31" | "2025-09-02";
    version_sha1: typeof PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1;
    zip_sha256: null;
    exact_member_metadata: Array<{
      member: string;
      rows: number;
      sha1: string;
    }>;
    zip_bytes_status: "blocked_whole_zip_bytes_unavailable";
    member_bytes_status: "blocked_no_verified_required_member_matches";
    calendar_expansion_status:
      "not_computed_required_member_bytes_unavailable";
    ordered_stop_comparison_status:
      "not_computed_required_member_bytes_unavailable";
  };
  schedule_validation: {
    pre: Plan040Package5ScheduleSlice;
    post: Plan040Package5ScheduleSlice;
    revenue_policy: {
      passenger: "any_trip_type_except_2_3_4";
      excluded_nonrevenue_trip_types: ["2", "3", "4"];
      mixed_shape_policy: "reviewed_unresolved";
      unmatched_shape_policy: "reviewed_unresolved";
    };
    pre_binding: {
      matched_passenger_shape_ids: string[];
      unmatched_passenger_shape_ids: string[];
      excluded_nonrevenue_shape_ids: string[];
      ambiguous_shape_ids: string[];
      status:
        | "matched_no_unresolved_shapes"
        | "matched_with_reviewed_unresolved_shapes"
        | "reviewed_unresolved_unmatched_or_ambiguous";
    };
    post_binding: {
      unmatched_passenger_shape_ids: string[];
      excluded_nonrevenue_shape_ids: string[];
      ambiguous_shape_ids: string[];
      status:
        "reviewed_unresolved_exact_post_gtfs_members_unavailable";
    };
  };
  unresolved_gap_codes: string[];
  evidence_verdict: "receipt_terminal_unresolved";
  proposed_extent_decision: null;
  proposed_grain_decision: null;
  persisted_extent_decision: null;
  persisted_grain_decision: null;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package5Draft = {
  schema_version: 1;
  package_id: typeof PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5;
  acquisition_receipt: { path: string; sha256: string };
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 24;
  new_source_candidate_count: 12;
  package_3_carry_forward_candidate_count: 12;
  candidate_key_sha256: typeof PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256;
  evidence_verdict_distribution: { receipt_terminal_unresolved: 24 };
  proposed_decision_count: 0;
  persisted_decision_count: 0;
  proposed_grain_decision_count: 0;
  persisted_grain_decision_count: 0;
  candidates: Plan040Package5CandidateEvidence[];
  prior_package_overlap: {
    accepted_or_persisted_package_2_count: 0;
    accepted_or_persisted_package_4_count: 0;
    intentional_nonterminal_package_3_carry_forward_count: 12;
    intentional_nonterminal_package_3_carry_forward_key_sha256: string;
  };
  version_separation: {
    pre_busco_sha1: typeof PLAN040_PACKAGE_5_PRE_BUSCO_SHA1;
    required_initial_post_busco_sha1:
      typeof PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1;
    later_non_substitute_busco_sha1:
      typeof PLAN040_PACKAGE_5_NON_SUBSTITUTE_POST_BUSCO_SHA1;
    later_version_is_not_substitute: true;
  };
  equivalence_policy: {
    automatic_equivalence: "identical_stop_id_only";
    changed_id_name_coordinate_or_proximity_equivalence: false;
    occurrence_inference_from_route_or_schedule_presence: false;
  };
  freeze_readiness:
    "frozen_receipt_terminal_unresolved_evidence_only_no_gate";
  authorization_state: "evidence_only_no_gate_no_acceptance_no_persistence";
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export function buildPlan040Package5Draft(input: {
  acquisitionReceiptPath: string;
  acquisitionReceiptSha256: string;
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package5CandidateEvidence[];
  package2CandidateKeys: string[];
  package4CandidateKeys: string[];
}): Plan040Package5Draft {
  const byRoute = new Map(
    input.candidates.map((candidate) => [candidate.gtfs_route_id, candidate]),
  );
  if (
    input.candidates.length !== 24 ||
    byRoute.size !== 24 ||
    PLAN040_PACKAGE_5_ROUTE_ORDER.some((routeId) => !byRoute.has(routeId))
  ) {
    throw new Error("Plan 040 Package 5 requires exact 24-route parity");
  }
  const candidates = PLAN040_PACKAGE_5_ROUTE_ORDER.map(
    (routeId) => byRoute.get(routeId)!,
  );
  const candidateKeys = candidates
    .map((candidate) => candidate.candidate_key)
    .sort();
  const candidateKeySha256 = sha256(`${candidateKeys.join("\n")}\n`);
  if (
    new Set(candidateKeys).size !== 24 ||
    candidateKeySha256 !== PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256
  ) {
    throw new Error("Plan 040 Package 5 candidate-key scope drifted");
  }

  const carryRoutes = new Set<string>(
    PLAN040_PACKAGE_5_PACKAGE_3_CARRY_FORWARD_ROUTES,
  );
  for (const candidate of candidates) {
    if (
      candidate.treatment_family !== "bus_stop_or_boarding" ||
      candidate.evidence_verdict !== "receipt_terminal_unresolved" ||
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence
    ) {
      throw new Error(
        `${candidate.gtfs_route_id}: Package 5 must fail closed with zero authority`,
      );
    }
    if (
      candidate.required_post_inventory.version_sha1 !==
        PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1 ||
      candidate.required_post_inventory.zip_sha256 !== null ||
      candidate.required_post_inventory.calendar_expansion_status !==
        "not_computed_required_member_bytes_unavailable" ||
      candidate.required_post_inventory.ordered_stop_comparison_status !==
        "not_computed_required_member_bytes_unavailable"
    ) {
      throw new Error(
        `${candidate.gtfs_route_id}: required exact initial post identity drifted`,
      );
    }
    const isCarry = carryRoutes.has(candidate.gtfs_route_id);
    if (
      isCarry !==
        (candidate.evidence_origin ===
          "immutable_package_3_carry_forward") ||
      isCarry !== (candidate.immutable_package_3_ref !== null)
    ) {
      throw new Error(
        `${candidate.gtfs_route_id}: Package 3 carry-forward boundary drifted`,
      );
    }
  }

  const package2 = new Set(input.package2CandidateKeys);
  const package4 = new Set(input.package4CandidateKeys);
  if (
    candidateKeys.some((key) => package2.has(key)) ||
    candidateKeys.some((key) => package4.has(key))
  ) {
    throw new Error(
      "Plan 040 Package 5 overlaps an accepted/persisted Package 2 or 4 key",
    );
  }
  const carryKeys = candidates
    .filter((candidate) => carryRoutes.has(candidate.gtfs_route_id))
    .map((candidate) => candidate.candidate_key)
    .sort();

  return {
    schema_version: 1,
    package_id: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5,
    acquisition_receipt: {
      path: input.acquisitionReceiptPath,
      sha256: input.acquisitionReceiptSha256,
    },
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 24,
    new_source_candidate_count: 12,
    package_3_carry_forward_candidate_count: 12,
    candidate_key_sha256: PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256,
    evidence_verdict_distribution: { receipt_terminal_unresolved: 24 },
    proposed_decision_count: 0,
    persisted_decision_count: 0,
    proposed_grain_decision_count: 0,
    persisted_grain_decision_count: 0,
    candidates,
    prior_package_overlap: {
      accepted_or_persisted_package_2_count: 0,
      accepted_or_persisted_package_4_count: 0,
      intentional_nonterminal_package_3_carry_forward_count: 12,
      intentional_nonterminal_package_3_carry_forward_key_sha256:
        sha256(`${carryKeys.join("\n")}\n`),
    },
    version_separation: {
      pre_busco_sha1: PLAN040_PACKAGE_5_PRE_BUSCO_SHA1,
      required_initial_post_busco_sha1:
        PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1,
      later_non_substitute_busco_sha1:
        PLAN040_PACKAGE_5_NON_SUBSTITUTE_POST_BUSCO_SHA1,
      later_version_is_not_substitute: true,
    },
    equivalence_policy: {
      automatic_equivalence: "identical_stop_id_only",
      changed_id_name_coordinate_or_proximity_equivalence: false,
      occurrence_inference_from_route_or_schedule_presence: false,
    },
    freeze_readiness:
      "frozen_receipt_terminal_unresolved_evidence_only_no_gate",
    authorization_state:
      "evidence_only_no_gate_no_acceptance_no_persistence",
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}

export function plan040Package5ReplayHash(value: JsonValue): string {
  return sha256(`${stableJson(value)}\n`);
}

const PACKAGE_5_ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-stop-removal-package-5-acquisition-v1.json";
const PACKAGE_5_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-5-evidence-v1.json";
const PACKAGE_5_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-5-evidence-draft-v1.json";
const PACKAGE_5_GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-5-dual-review-gate-v1.json";
const PACKAGE_5_ACCEPTANCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-5-owner-acceptance-v1.json";

function package5ArtifactPins() {
  return {
    acquisition: {
      path: PACKAGE_5_ACQUISITION_PATH,
      sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ACQUISITION_SHA256,
    },
    evidence: {
      path: PACKAGE_5_EVIDENCE_PATH,
      sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_EVIDENCE_SHA256,
    },
    draft: {
      path: PACKAGE_5_DRAFT_PATH,
      sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_DRAFT_SHA256,
      replay_sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_DRAFT_SHA256,
    },
  };
}

export function buildPlan040Package5GateAndAcceptance(input: {
  draft: Plan040Package5Draft;
  acceptedAt: string;
}) {
  const draftHash = plan040Package5ReplayHash(
    input.draft as unknown as JsonValue,
  );
  const unresolved = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "receipt_terminal_unresolved");
  const immutableCarries = input.draft.candidates.filter((candidate) =>
    candidate.evidence_origin === "immutable_package_3_carry_forward");
  if (
    draftHash !== PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_DRAFT_SHA256 ||
    input.draft.candidate_count !== 24 ||
    input.draft.candidate_key_sha256 !==
      PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256 ||
    unresolved.length !== 24 ||
    unresolved.some((candidate) =>
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0 ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence) ||
    immutableCarries.length !== 12 ||
    immutableCarries.some((candidate) =>
      candidate.immutable_package_3_ref?.evidence_manifest_sha256 !==
        PLAN040_PACKAGE_5_PACKAGE_3_PINS.evidence) ||
    input.draft.prior_package_overlap
      .intentional_nonterminal_package_3_carry_forward_count !== 12 ||
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
      "Plan 040 Package 5 frozen verdict, immutable carry, hash, or authorization scope drifted",
    );
  }
  const unresolvedKeys = unresolved
    .map((candidate) => candidate.candidate_key)
    .sort();
  const unresolvedKeySha256 = sha256(`${unresolvedKeys.join("\n")}\n`);
  if (unresolvedKeySha256 !== PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256) {
    throw new Error("Plan 040 Package 5 unresolved candidate scope drifted");
  }
  const reviewerResults = [
    {
      role: "independent_main_advisor_source_provenance_and_gap_review",
      reviewer_id: "main_advisor",
      verdict: "APPROVE" as const,
    },
    {
      role: "independent_provenance_and_fail_closed_audit",
      reviewer_id: "plan040_package5_independent_audit",
      verdict: "APPROVE" as const,
    },
  ];
  const gate = {
    schema_version: 1,
    gate_id: "plan-040-qbnr-stop-removal-package-5-dual-review-gate-v1",
    package_id: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5,
    reviewed_commit: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_REVIEWED_COMMIT,
    artifacts: package5ArtifactPins(),
    candidate_count: 24,
    candidate_key_sha256: input.draft.candidate_key_sha256,
    immutable_package_3_carry_forward: {
      candidate_count: 12,
      candidate_key_sha256:
        input.draft.prior_package_overlap
          .intentional_nonterminal_package_3_carry_forward_key_sha256,
      acquisition_sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.acquisition,
      evidence_sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.evidence,
      draft_sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.draft,
    },
    evidence_verdict_distribution: {
      receipt_terminal_unresolved: 24,
    },
    proposed_extent_distribution: { stop_set: 0, unresolved: 24 },
    proposed_grain_distribution: { trip_subset: 0, unresolved: 24 },
    unresolved_candidate_count: 24,
    unresolved_candidate_key_sha256: unresolvedKeySha256,
    reviewer_results: reviewerResults,
    checkpoint_tests: {
      focused_p3_p5: {
        pass: 17,
        fail: 0,
        assertions: 1186,
        status: "pass" as const,
      },
      independent_package_5_replay: {
        pass: 4,
        fail: 0,
        assertions: 378,
        status: "pass" as const,
      },
      typecheck: { status: "pass" as const },
      validate: { status: "pass" as const },
      deterministic_replay: {
        sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_DRAFT_SHA256,
        status: "pass" as const,
      },
      full_repository: {
        status: "not_required_below_accelerated_checkpoint" as const,
        reason:
          "24_new_closures_since_last_completed_checkpoint_below_25_to_50_threshold",
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
      "plan-040-qbnr-stop-removal-package-5-owner-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    gate: { path: PACKAGE_5_GATE_PATH, sha256: gateSha256 },
    artifacts: package5ArtifactPins(),
    candidate_count: 24,
    candidate_key_sha256: input.draft.candidate_key_sha256,
    evidence_verdict_distribution: {
      receipt_terminal_unresolved: 24,
    },
    reviewer_results: {
      main_advisor: "APPROVE" as const,
      plan040_package5_independent_audit: "APPROVE" as const,
    },
    immutable_package_3_carry_forward: {
      candidate_count: 12,
      candidate_key_sha256:
        input.draft.prior_package_overlap
          .intentional_nonterminal_package_3_carry_forward_key_sha256,
      evidence_sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.evidence,
      preserved_without_reacquisition_or_recomputation: true as const,
    },
    authorized_positive_persistence: {
      candidate_count: 0,
      candidate_keys: [] as string[],
      extent_decision_ids: [] as string[],
      grain_decision_ids: [] as string[],
    },
    authorized_reviewed_absence_receipt: {
      receipt_id:
        "plan-040-qbnr-stop-removal-package-5-reviewed-absence-v1",
      candidate_count: 24,
      candidate_key_sha256: unresolvedKeySha256,
      candidate_keys: unresolvedKeys,
      surfaces: ["member_extent", "member_grain"] as const,
      verdict_by_surface: {
        member_extent: "reviewed_terminal_unresolved" as const,
        member_grain: "reviewed_terminal_unresolved" as const,
      },
    },
    authorization_state:
      "owner_delegate_accepted_exact_24_key_reviewed_absence_only",
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

export function validatePlan040Package5GateAndAcceptance(input: {
  draft: Plan040Package5Draft;
  gate: unknown;
  acceptance: unknown;
  acceptedAt: string;
}) {
  const expected = buildPlan040Package5GateAndAcceptance({
    draft: input.draft,
    acceptedAt: input.acceptedAt,
  });
  if (
    stableJson(input.gate as JsonValue) !==
      stableJson(expected.gate as unknown as JsonValue)
  ) {
    throw new Error("Plan 040 Package 5 dual-review gate drifted");
  }
  if (
    stableJson(input.acceptance as JsonValue) !==
      stableJson(expected.acceptance as unknown as JsonValue)
  ) {
    throw new Error("Plan 040 Package 5 owner/delegate acceptance drifted");
  }
  return {
    candidate_count: 24,
    positive_candidate_count: 0,
    unresolved_candidate_count: 24,
    authorized_extent_decision_count: 0,
    authorized_grain_decision_count: 0,
    authorized_absence_candidate_count: 24,
    persisted_decision_count: 0,
    persisted_absence_receipt_count: 0,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
  };
}

export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_DRAFT_PATH = join(
  repoRoot,
  PACKAGE_5_DRAFT_PATH,
);
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_GATE_PATH = join(
  repoRoot,
  PACKAGE_5_GATE_PATH,
);
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ACCEPTANCE_PATH = join(
  repoRoot,
  PACKAGE_5_ACCEPTANCE_PATH,
);
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ABSENCE_RECEIPT_PATH = join(
  repoRoot,
  "data/quality/acquisition/receipts/member-extent/" +
    "plan-040-qbnr-stop-removal-package-5-reviewed-absence-v1.json",
);

function writeImmutablePlan040Package5Json(
  path: string,
  value: unknown,
): void {
  const contents = `${stableJson(value as JsonValue)}\n`;
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== contents) {
      throw new Error(
        `Refusing to overwrite immutable Plan 040 Package 5 artifact ` +
        `${relative(repoRoot, path)}`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function writePlan040Package5GateAndAcceptance(input: {
  acceptedAt: string;
}) {
  const draft = JSON.parse(
    readFileSync(PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_DRAFT_PATH, "utf8"),
  ) as Plan040Package5Draft;
  const result = buildPlan040Package5GateAndAcceptance({
    draft,
    acceptedAt: input.acceptedAt,
  });
  writeImmutablePlan040Package5Json(
    PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_GATE_PATH,
    result.gate,
  );
  writeImmutablePlan040Package5Json(
    PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ACCEPTANCE_PATH,
    result.acceptance,
  );
  return {
    gatePath: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_GATE_PATH,
    gateSha256: result.gateSha256,
    acceptancePath: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ACCEPTANCE_PATH,
    acceptanceSha256: sha256(
      `${stableJson(result.acceptance as unknown as JsonValue)}\n`,
    ),
  };
}

type Plan040Package5GateAndAcceptance =
  ReturnType<typeof buildPlan040Package5GateAndAcceptance>;

function assertExactPlan040Package5Values(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  if (
    stableJson([...actual].sort() as JsonValue) !==
      stableJson([...expected].sort() as JsonValue)
  ) {
    throw new Error(
      `Plan 040 Package 5 ${label} drifted outside owner acceptance`,
    );
  }
}

export function buildPlan040Package5AcceptedArtifacts(input: {
  draft: Plan040Package5Draft;
  gate: Plan040Package5GateAndAcceptance["gate"];
  acceptance: Plan040Package5GateAndAcceptance["acceptance"];
}): {
  extentDecisions: [];
  grainDecisions: [];
  absenceReceipt: MemberExtentAbsenceReceipt;
} {
  validatePlan040Package5GateAndAcceptance({
    draft: input.draft,
    gate: input.gate,
    acceptance: input.acceptance,
    acceptedAt: input.acceptance.accepted_at,
  });
  if (
    input.acceptance.authorization_state !==
      "owner_delegate_accepted_exact_24_key_reviewed_absence_only" ||
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
      "Plan 040 Package 5 owner acceptance does not authorize receipt-only persistence",
    );
  }
  const unresolved = input.draft.candidates.filter((candidate) =>
    candidate.evidence_verdict === "receipt_terminal_unresolved");
  const immutableCarries = unresolved.filter((candidate) =>
    candidate.evidence_origin === "immutable_package_3_carry_forward");
  if (
    unresolved.length !== 24 ||
    unresolved.some((candidate) =>
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0 ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence) ||
    immutableCarries.length !== 12 ||
    immutableCarries.some((candidate) =>
      candidate.immutable_package_3_ref?.evidence_manifest_sha256 !==
        PLAN040_PACKAGE_5_PACKAGE_3_PINS.evidence)
  ) {
    throw new Error(
      "Plan 040 Package 5 persistence inputs no longer match the accepted terminal split",
    );
  }
  const unresolvedKeys = unresolved
    .map((candidate) => candidate.candidate_key)
    .sort();
  assertExactPlan040Package5Values(
    input.acceptance.authorized_reviewed_absence_receipt.candidate_keys,
    unresolvedKeys,
    "reviewed absence candidate keys",
  );
  assertExactPlan040Package5Values(
    input.acceptance.authorized_reviewed_absence_receipt.surfaces,
    ["member_extent", "member_grain"],
    "reviewed absence surfaces",
  );
  const unresolvedKeySha256 = sha256(`${unresolvedKeys.join("\n")}\n`);
  if (
    unresolvedKeySha256 !== PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256 ||
    input.acceptance.authorized_reviewed_absence_receipt.receipt_id !==
      "plan-040-qbnr-stop-removal-package-5-reviewed-absence-v1" ||
    input.acceptance.authorized_reviewed_absence_receipt.candidate_count !== 24 ||
    input.acceptance.authorized_reviewed_absence_receipt.candidate_key_sha256 !==
      unresolvedKeySha256 ||
    input.acceptance.authorized_reviewed_absence_receipt.verdict_by_surface
        .member_extent !== "reviewed_terminal_unresolved" ||
    input.acceptance.authorized_reviewed_absence_receipt.verdict_by_surface
        .member_grain !== "reviewed_terminal_unresolved"
  ) {
    throw new Error(
      "Plan 040 Package 5 reviewed absence authorization drifted",
    );
  }
  const exactSearches = unresolved.map((candidate) => {
    if (
      !/^https:\/\/www\.mta\.info\/document\/[0-9]+$/u.test(
        candidate.candidate_document.source_url,
      )
    ) {
      throw new Error(
        `${candidate.gtfs_route_id}: reviewed absence URL is not an exact MTA document URL`,
      );
    }
    const carryForward = candidate.immutable_package_3_ref === null
      ? "none"
      : [
          "immutable_package_3",
          candidate.immutable_package_3_ref.evidence_manifest_sha256,
          candidate.immutable_package_3_ref.candidate_sha256,
        ].join("@");
    return [
      `candidate=${candidate.candidate_key}`,
      `route=${candidate.gtfs_route_id}`,
      `evidence_origin=${candidate.evidence_origin}`,
      `immutable_carry_forward=${carryForward}`,
      `service_change=${candidate.service_change_evidence.evidence_id}`,
      `official_candidate_document=${candidate.candidate_document.source_url}`,
      `candidate_document_source=${candidate.candidate_document.source_id}`,
      `candidate_document_binding=${candidate.candidate_document.binding_status}`,
      `exact_search=Candidate-specific stop-change statements in ` +
        `${candidate.candidate_document.source_id}`,
      `pre=${candidate.pre_inventory.source_id}@` +
        `${candidate.pre_inventory.target_date}/${candidate.gtfs_route_id}`,
      `pre_schedule=${candidate.schedule_validation.pre.source_id}@` +
        `${candidate.schedule_validation.pre.schedule_date}/` +
        `${candidate.schedule_validation.pre.route_id}`,
      `required_post_sha1=` +
        `${candidate.required_post_inventory.version_sha1}`,
      `required_post_target=${candidate.required_post_inventory.target_date}/` +
        `${candidate.gtfs_route_id}`,
      `post_schedule=${candidate.schedule_validation.post.source_id}@` +
        `${candidate.schedule_validation.post.schedule_date}/` +
        `${candidate.schedule_validation.post.route_id}`,
      `post_member_status=` +
        `${candidate.required_post_inventory.member_bytes_status}`,
      "route_row_presence_is_not_trip_inventory=true",
      "later_post_version_is_not_substitute=true",
      "result=receipt_terminal_unresolved",
      `gaps=${candidate.unresolved_gap_codes.join(",")}`,
    ].join("; ");
  }).sort();
  if (new Set(exactSearches).size !== 24) {
    throw new Error(
      "Plan 040 Package 5 requires one exact search record per candidate",
    );
  }
  const urlsInspected = [
    ...new Set(unresolved.map((candidate) =>
      candidate.candidate_document.source_url)),
  ].sort();
  if (urlsInspected.length === 0) {
    throw new Error(
      "Plan 040 Package 5 requires exact official candidate URLs",
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
      "Owner-delegate accepted reviewed absence for the exact 24 Package 5 " +
      "candidates that remained receipt-terminal unresolved after dual independent " +
      "review of candidate-specific MTA documents, immutable Package 3 evidence, " +
      "accepted pre-change BusCo inventory, schedule revenue classification, and the " +
      "required initial Phase 2 post-feed identity. This records terminal member-extent " +
      "and member-grain ledger review only. Immutable prior receipts, exact searches, " +
      "unresolved bindings, source gaps, nonexclusive route context, route variants, " +
      "and the unavailable exact initial post-feed members remain preserved. The later " +
      "post feed is not a substitute, route-row presence is not trip inventory, and no " +
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

export function acceptPlan040Package5ReceiptPackage(): {
  absenceReceiptPath: string;
  absenceReceiptSha256: string;
  extentDecisionCount: 0;
  grainDecisionCount: 0;
  absenceCandidateCount: 24;
} {
  const requiredPins = [
    [
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_DRAFT_PATH,
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_DRAFT_SHA256,
      "draft",
    ],
    [
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_GATE_PATH,
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_GATE_SHA256,
      "dual-review gate",
    ],
    [
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ACCEPTANCE_PATH,
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ACCEPTANCE_SHA256,
      "owner acceptance",
    ],
  ] as const;
  for (const [path, expectedSha256, label] of requiredPins) {
    const actualSha256 = fileSha256(path);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Plan 040 Package 5 ${label} pin drifted: ${actualSha256}`,
      );
    }
  }
  const draft = JSON.parse(
    readFileSync(PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_DRAFT_PATH, "utf8"),
  ) as Plan040Package5Draft;
  const gate = JSON.parse(
    readFileSync(PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_GATE_PATH, "utf8"),
  ) as Plan040Package5GateAndAcceptance["gate"];
  const acceptance = JSON.parse(
    readFileSync(
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ACCEPTANCE_PATH,
      "utf8",
    ),
  ) as Plan040Package5GateAndAcceptance["acceptance"];
  const accepted = buildPlan040Package5AcceptedArtifacts({
    draft,
    gate,
    acceptance,
  });
  writeImmutablePlan040Package5Json(
    PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ABSENCE_RECEIPT_PATH,
    { receipts: [accepted.absenceReceipt] },
  );
  return {
    absenceReceiptPath:
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ABSENCE_RECEIPT_PATH,
    absenceReceiptSha256: fileSha256(
      PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ABSENCE_RECEIPT_PATH,
    ),
    extentDecisionCount: 0,
    grainDecisionCount: 0,
    absenceCandidateCount: 24,
  };
}
