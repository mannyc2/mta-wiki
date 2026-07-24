import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_3 =
  "plan-040-qbnr-stop-removal-package-3-evidence-only-v1" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_1_MANIFEST_SHA256 =
  "43a17a230eb70e9b7c322d2125b0db99910f035e688652624d4ce0e97a08a1d4" as const;
export const PLAN040_Q67_CORRECTION_SHA1 =
  "6db867de2ce30f47ae0ee763f422dc34fb7a9f9f" as const;
export const PLAN040_PHASE_2_INITIAL_BUSCO_SHA1 =
  "e1c52ddfd8bece8f782dea60ee4d61f258f68e18" as const;
export const PLAN040_PHASE_2_LATER_BUSCO_SHA1 =
  "fb0e2c097635e5dfa495870b2b177b02762c9ecc" as const;
export const PLAN040_PHASE_2_PRE_BUSCO_SHA1 =
  "54653b3fafb5fabc5ab1c941780b871343138440" as const;

export const PLAN040_PACKAGE_3_ROUTE_ORDER = [
  "Q67",
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

export type Plan040Package3RouteId =
  (typeof PLAN040_PACKAGE_3_ROUTE_ORDER)[number];

export type Plan040Package3ScheduleSlice = {
  source_id: "mta_bus_schedules_2025_candidate_windows";
  schedule_date: string;
  route_id: Plan040Package3RouteId;
  operator: "NYCT" | "MTA Bus";
  row_count: number;
  trip_type_rows: Record<string, number>;
  passenger_shape_ids: string[];
  nonrevenue_shape_ids: string[];
  ambiguous_shape_ids: string[];
  shape_trip_type_rows: Array<{
    shape_id: string;
    trip_type_rows: Record<string, number>;
  }>;
};

export type Plan040Package3StopListBlock = {
  evidence_id: string;
  block_id: string;
  page_number: number;
  raw_text_sha256: string;
  normalized_text: string;
};

export type Plan040Package3CandidateEvidence = {
  candidate_key: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  gtfs_route_id: Plan040Package3RouteId;
  implementation_date: string;
  implementation_phase: "phase_1" | "phase_2";
  service_change_evidence: {
    evidence_id: string;
    block_sha256: string;
    captured_stop_statement: string;
  };
  stop_list: {
    source_id: string;
    source_url: string;
    receipt_sha256: string;
    pdf_sha256: string;
    layout_text_sha256: string;
    raw_text_sha256: string;
    blocks_sha256: string;
    removed_statement_blocks: Plan040Package3StopListBlock[];
    binding_status:
      | "candidate_route_stop_list_exact"
      | "shared_q47_profile_q33_route_variant_ambiguous";
  };
  pre_inventory: {
    source_id: string;
    zip_sha1: string;
    zip_sha256: string;
    target_date: string;
    service_window: { start: string; end: string };
    active_service_ids: string[];
    active_service_id_sha256: string;
    route_trip_row_count: number;
    active_trip_count: number;
    active_shape_ids: string[];
  };
  required_post_inventory: {
    role:
      | "q67_exact_first_week_correction"
      | "phase_2_initial_busco_full_stop_inventory";
    target_date: string;
    version_sha1: string;
    zip_sha256: null;
    zip_bytes_status: "blocked_whole_zip_bytes_unavailable";
    member_bytes_status:
      | "verified_content_addressed_operational_members_6_of_6"
      | "blocked_no_verified_required_member_matches";
    calendar_expansion_status:
      | "computed_from_verified_content_addressed_members"
      | "not_computed_required_member_bytes_unavailable";
    ordered_stop_comparison_status:
      | "unavailable_zero_q67_trips_in_verified_trips_member"
      | "not_computed_required_member_bytes_unavailable";
    q67_correction_sensitivity: {
      correction_member_source_id:
        "gtfs_static_20250626_queens_post_qbnr";
      verified_operational_member_names: [
        "calendar.txt",
        "calendar_dates.txt",
        "shapes.txt",
        "stop_times.txt",
        "stops.txt",
        "trips.txt",
      ];
      unavailable_member_names: ["routes.txt"];
      service_dates: Array<{
        service_date: "2025-06-29" | "2025-06-30";
        active_service_ids: string[];
        active_service_id_sha256: string;
        q67_trip_count: 0;
        q67_shape_ids: [];
      }>;
      q67_route_trip_row_count: 0;
      q67_shape_row_count: 0;
      q67_shape_ids: [];
      stop_time_rows_scanned: 652139;
      q67_stop_time_row_count: 0;
      stop_rows_scanned: 1391;
      q67_referenced_stop_count: 0;
      ordered_chain_count: 0;
      ordered_chain_status: "unavailable_zero_q67_trips";
    } | null;
  };
  schedule_validation: {
    pre: Plan040Package3ScheduleSlice;
    post: Plan040Package3ScheduleSlice;
    pre_binding: {
      matched_passenger_shape_ids: string[];
      unmatched_passenger_shape_ids: string[];
      excluded_nonrevenue_shape_ids: string[];
      ambiguous_shape_ids: string[];
      status:
        | "matched_with_unresolved_exclusions"
        | "matched_no_unresolved_shapes"
        | "reviewed_unresolved_unmatched_or_ambiguous";
    };
    post_binding: {
      status:
        | "blocked_post_gtfs_required_members_unavailable"
        | "reviewed_unresolved_zero_gtfs_trips_and_unmatched_schedule_shapes";
      unmatched_passenger_shape_ids: string[];
      excluded_nonrevenue_shape_ids: string[];
      ambiguous_shape_ids: string[];
    };
  };
  unresolved_gap_codes: string[];
  evidence_verdict: "acquisition_blocked_no_terminalization";
  proposed_extent_decision: null;
  proposed_grain_decision: null;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package3Draft = {
  schema_version: 1;
  package_id: typeof PLAN040_QBNR_STOP_REMOVAL_PACKAGE_3;
  package_1_manifest: { path: string; sha256: string };
  acquisition_receipt: { path: string; sha256: string };
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 13;
  source_count: 12;
  candidate_key_sha256: string;
  phase_distribution: { q67_correction: 1; phase_2_initial_busco: 12 };
  evidence_verdict_distribution: {
    acquisition_blocked_no_terminalization: 13;
  };
  proposed_decision_count: 0;
  persisted_decision_count: 0;
  proposed_grain_decision_count: 0;
  persisted_grain_decision_count: 0;
  candidates: Plan040Package3CandidateEvidence[];
  version_separation: {
    launch_initial_pre_phase_2_sha1: typeof PLAN040_PHASE_2_PRE_BUSCO_SHA1;
    q67_correction_sha1: typeof PLAN040_Q67_CORRECTION_SHA1;
    phase_2_initial_sha1: typeof PLAN040_PHASE_2_INITIAL_BUSCO_SHA1;
    phase_2_later_sha1: typeof PLAN040_PHASE_2_LATER_BUSCO_SHA1;
    later_phase_2_version_is_not_substitute: true;
  };
  equivalence_policy: {
    automatic_equivalence: "identical_stop_id_only";
    changed_id_name_coordinate_or_proximity_equivalence: false;
    q61_lineage_inference: false;
  };
  freeze_readiness:
    "frozen_evidence_only_blocked_package_not_ready_for_risk_review_or_owner_gate";
  authorization_state: "evidence_only_no_gate_no_persistence";
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildPlan040Package3Draft(input: {
  acquisitionReceiptPath: string;
  acquisitionReceiptSha256: string;
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package3CandidateEvidence[];
}): Plan040Package3Draft {
  const expectedRoutes = [...PLAN040_PACKAGE_3_ROUTE_ORDER];
  const byRoute = new Map(input.candidates.map((candidate) => [
    candidate.gtfs_route_id,
    candidate,
  ]));
  if (
    input.candidates.length !== 13 ||
    byRoute.size !== 13 ||
    expectedRoutes.some((routeId) => !byRoute.has(routeId))
  ) {
    throw new Error("Plan 040 Package 3 requires exact 13-route parity");
  }
  const candidates = expectedRoutes.map((routeId) => byRoute.get(routeId)!);
  const keys = candidates.map((candidate) => candidate.candidate_key).sort();
  if (new Set(keys).size !== 13) {
    throw new Error("Plan 040 Package 3 candidate keys are not unique");
  }
  for (const candidate of candidates) {
    if (
      candidate.evidence_verdict !== "acquisition_blocked_no_terminalization" ||
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence
    ) {
      throw new Error(
        `${candidate.gtfs_route_id}: Package 3 must remain evidence-only and fail closed`,
      );
    }
    if (
      candidate.required_post_inventory.zip_bytes_status !==
        "blocked_whole_zip_bytes_unavailable" ||
      candidate.required_post_inventory.zip_sha256 !== null
    ) {
      throw new Error(
        `${candidate.gtfs_route_id}: unavailable exact post ZIP gained unsupported provenance`,
      );
    }
    if (candidate.gtfs_route_id === "Q67") {
      if (
        candidate.required_post_inventory.member_bytes_status !==
          "verified_content_addressed_operational_members_6_of_6" ||
        candidate.required_post_inventory.calendar_expansion_status !==
          "computed_from_verified_content_addressed_members" ||
        candidate.required_post_inventory.ordered_stop_comparison_status !==
          "unavailable_zero_q67_trips_in_verified_trips_member" ||
        candidate.required_post_inventory.q67_correction_sensitivity === null
      ) {
        throw new Error("Q67: verified correction member sensitivity drifted");
      }
    } else if (
      candidate.required_post_inventory.member_bytes_status !==
        "blocked_no_verified_required_member_matches" ||
      candidate.required_post_inventory.calendar_expansion_status !==
        "not_computed_required_member_bytes_unavailable" ||
      candidate.required_post_inventory.ordered_stop_comparison_status !==
        "not_computed_required_member_bytes_unavailable" ||
      candidate.required_post_inventory.q67_correction_sensitivity !== null
    ) {
      throw new Error(
        `${candidate.gtfs_route_id}: Phase 2 member-byte blocker drifted`,
      );
    }
  }
  return {
    schema_version: 1,
    package_id: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_3,
    package_1_manifest: {
      path:
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-stop-removal-acquisition-manifest-v1.json",
      sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_1_MANIFEST_SHA256,
    },
    acquisition_receipt: {
      path: input.acquisitionReceiptPath,
      sha256: input.acquisitionReceiptSha256,
    },
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 13,
    source_count: 12,
    candidate_key_sha256: sha256(`${keys.join("\n")}\n`),
    phase_distribution: { q67_correction: 1, phase_2_initial_busco: 12 },
    evidence_verdict_distribution: {
      acquisition_blocked_no_terminalization: 13,
    },
    proposed_decision_count: 0,
    persisted_decision_count: 0,
    proposed_grain_decision_count: 0,
    persisted_grain_decision_count: 0,
    candidates,
    version_separation: {
      launch_initial_pre_phase_2_sha1: PLAN040_PHASE_2_PRE_BUSCO_SHA1,
      q67_correction_sha1: PLAN040_Q67_CORRECTION_SHA1,
      phase_2_initial_sha1: PLAN040_PHASE_2_INITIAL_BUSCO_SHA1,
      phase_2_later_sha1: PLAN040_PHASE_2_LATER_BUSCO_SHA1,
      later_phase_2_version_is_not_substitute: true,
    },
    equivalence_policy: {
      automatic_equivalence: "identical_stop_id_only",
      changed_id_name_coordinate_or_proximity_equivalence: false,
      q61_lineage_inference: false,
    },
    freeze_readiness:
      "frozen_evidence_only_blocked_package_not_ready_for_risk_review_or_owner_gate",
    authorization_state: "evidence_only_no_gate_no_persistence",
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}

export function plan040Package3ReplayHash(value: JsonValue): string {
  return sha256(`${stableJson(value)}\n`);
}
