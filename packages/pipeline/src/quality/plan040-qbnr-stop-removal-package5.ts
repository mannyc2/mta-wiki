import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

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
