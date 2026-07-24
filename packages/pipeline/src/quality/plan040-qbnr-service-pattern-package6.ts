import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6 =
  "plan-040-qbnr-service-pattern-package-6-evidence-only-v1" as const;
export const PLAN040_PACKAGE_6_CANDIDATE_KEY_SHA256 =
  "0b79348c3654245fb5dc58f76c0f683cbb41c3555452a11e5712ee7ee85c6640" as const;
export const PLAN040_PACKAGE_6_PRE_BUSCO_SHA1 =
  "54653b3fafb5fabc5ab1c941780b871343138440" as const;
export const PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1 =
  "e1c52ddfd8bece8f782dea60ee4d61f258f68e18" as const;
export const PLAN040_PACKAGE_6_NON_SUBSTITUTE_POST_BUSCO_SHA1 =
  "fb0e2c097635e5dfa495870b2b177b02762c9ecc" as const;

export const PLAN040_PACKAGE_6_WAVES = [
  {
    wave_id: "P6-A",
    label: "direct_route_geometry_risk",
    candidate_count: 11,
    review_mode: "dual_independent_risk_review",
  },
  {
    wave_id: "P6-B",
    label: "route_variant_cross_route_lineage_risk",
    candidate_count: 7,
    review_mode: "dual_independent_risk_review",
  },
  {
    wave_id: "P6-C",
    label: "q22_branch_segment_heterogeneous_grain_risk",
    candidate_count: 3,
    review_mode: "dual_independent_risk_review",
  },
  {
    wave_id: "P6-D",
    label: "temporal_service_scope_risk",
    candidate_count: 3,
    review_mode: "dual_independent_risk_review",
  },
  {
    wave_id: "P6-E",
    label: "source_gap_and_discrepancy_risk",
    candidate_count: 5,
    review_mode: "dual_independent_risk_review_before_any_gate",
  },
] as const;

export type Plan040Package6WaveId =
  (typeof PLAN040_PACKAGE_6_WAVES)[number]["wave_id"];

export const PLAN040_PACKAGE_6_CANDIDATES = [
  ["P6-A", "Q101", "treatment_q101-northern-shortening-2025"],
  ["P6-A", "Q101", "treatment_q101-southern-hunters-point-reroute-2025"],
  ["P6-A", "Q103", "treatment_q103-queensbridge-waterfront-reroute-extension-2025"],
  ["P6-A", "Q18", "treatment_q18-southern-turnaround-2025"],
  ["P6-A", "Q32", "treatment_q32-queensboro-bridge-routing-change-2025"],
  ["P6-A", "Q35", "treatment_q35-rockaway-beach-reroute-2025"],
  ["P6-A", "Q35", "treatment_q35-rockaways-extension-2025"],
  ["P6-A", "Q37", "treatment_q37-rockaway-lefferts-reroute-2025"],
  ["P6-A", "Q41", "treatment_q41-109-avenue-extension-2025"],
  ["P6-A", "Q41", "treatment_q41-south-richmond-hill-discontinuation-2025"],
  ["P6-A", "Q60", "treatment_q60-queensboro-bridge-routing-change-2025"],
  ["P6-B", "Q10", "treatment_q10-limited-discontinuation-2025"],
  ["P6-B", "Q11", "treatment_q11-pitkin-segment-discontinuation-2025"],
  ["P6-B", "Q11", "treatment_q11-q21-combination-2025"],
  ["P6-B", "Q33", "treatment_q33-laguardia-terminal-a-reroute-2025"],
  ["P6-B", "Q47", "treatment_q47-bulova-all-trip-service-2025"],
  ["P6-B", "Q47", "treatment_q47-terminal-a-replacement-2025"],
  ["P6-B", "Q47", "treatment_q47-woodside-jackson-23-avenue-reroute-extension-2025"],
  ["P6-C", "Q22", "treatment_q22-bayswater-extended-trips-2025"],
  ["P6-C", "Q22", "treatment_q22-beach-116-segment-replacement-2025"],
  ["P6-C", "Q22", "treatment_q22-far-rockaway-extension-2025"],
  ["P6-D", "QM15", "treatment_qm15-frequency-adjustment-2025"],
  ["P6-D", "QM24", "treatment_qm24-frequency-span-adjustment-2025"],
  ["P6-D", "QM25", "treatment_qm25-frequency-span-adjustment-2025"],
  ["P6-E", "Q102", "treatment_q102-queens-court-square-routing-2025"],
  ["P6-E", "Q102", "treatment_q102-roosevelt-island-shortening-2025"],
  ["P6-E", "Q69", "treatment_q69-queens-plaza-termination-change-2025"],
  ["P6-E", "QM16", "treatment_qm16-frequency-adjustment-2025"],
  ["P6-E", "QM17", "treatment_qm17-frequency-span-adjustment-2025"],
] as const;

export type Plan040Package6RouteId =
  (typeof PLAN040_PACKAGE_6_CANDIDATES)[number][1];

export type Plan040Package6CandidateEvidence = {
  candidate_key: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  treatment_family: "service_pattern";
  gtfs_route_id: Plan040Package6RouteId;
  implementation_date: "2025-08-31" | "2025-09-02";
  risk_wave_id: Plan040Package6WaveId;
  risk_flags: string[];
  source_row: {
    source_id: "mta_queens_bus_network_redesign_service_changes";
    source_html_sha256: string;
    route_row: Plan040Package6RouteId;
    row_sha256: string;
    implementation_statement: string;
    candidate_change_context: string[];
    anchors: Array<{ text: string; href: string }>;
  };
  service_change_evidence: {
    evidence_id: string;
    block_sha256: string;
    captured_statement: string;
    treatment_kind: string;
  };
  candidate_document: {
    source_id: string;
    source_url: string;
    source_origin:
      | "reused_immutable_package_3_or_5_document"
      | "package_6_new_exact_candidate_timetable";
    binding_status:
      | "candidate_route_document_exact_non_authorizing"
      | "candidate_timetable_nonexhaustive_timepoints"
      | "candidate_route_document_nonexclusive_q10_q80"
      | "shared_q33_q47_document_nonexclusive"
      | "shared_qm16_qm17_timetable_nonexclusive";
    route_ids: string[];
    shared_document: boolean;
    nonexclusive_context: boolean;
    document_is_full_stop_chain: boolean;
    receipt_path: string;
    receipt_sha256: string;
    pdf_sha256: string;
    layout_text_sha256: string;
    raw_text_sha256: string;
    blocks_sha256: string;
    supporting_statement_blocks: Array<{
      evidence_id: string;
      page_number: number;
      raw_text_sha256: string;
      normalized_text: string;
    }>;
  };
  pre_inventory: {
    source_id: "gtfs_static_20250626_busco_post_qbnr";
    zip_sha1: typeof PLAN040_PACKAGE_6_PRE_BUSCO_SHA1;
    zip_sha256: string;
    target_date: "2025-08-29" | "2025-08-30";
    service_window: { start: string; end: string };
    active_service_ids: string[];
    active_service_id_sha256: string;
    route_row_count: 1;
    route_trip_row_count: number;
    active_trip_count: number;
    active_shape_ids: string[];
    route_row_presence_is_not_trip_inventory: true;
  };
  required_post_inventory: {
    role: "phase_2_initial_busco_service_pattern_inventory";
    target_date: "2025-08-31" | "2025-09-02";
    version_sha1: typeof PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1;
    zip_sha256: null;
    exact_member_metadata: Array<{
      member: string;
      rows: number;
      sha1: string;
    }>;
    bounded_acquisition_search_repeated: false;
    zip_bytes_status: "blocked_whole_zip_bytes_unavailable";
    member_bytes_status: "blocked_no_verified_required_member_matches";
    calendar_expansion_status:
      "not_computed_required_member_bytes_unavailable";
    ordered_stop_comparison_status:
      "not_computed_required_member_bytes_unavailable";
  };
  schedule_validation: {
    pre: Record<string, JsonValue>;
    post: Record<string, JsonValue>;
    revenue_policy: {
      passenger: "any_trip_type_except_2_3_4";
      excluded_nonrevenue_trip_types: ["2", "3", "4"];
      mixed_shape_policy: "reviewed_unresolved";
      unmatched_shape_policy: "reviewed_unresolved";
    };
    pre_binding: Record<string, JsonValue>;
    post_binding: Record<string, JsonValue>;
  };
  ledger_snapshot: {
    extent_verdict: "unreviewed";
    grain_verdict: "unreviewed";
    current_extent_kind: "unresolved";
    extent_receipt_ids: [];
    grain_receipt_ids: [];
    extent_decision_id: null;
    grain_decision_id: null;
  };
  unresolved_gap_codes: string[];
  evidence_verdict: "receipt_terminal_unresolved";
  proposed_extent_decision: null;
  proposed_grain_decision: null;
  persisted_extent_decision: null;
  persisted_grain_decision: null;
  candidate_may_support_positive_after_review: true;
  review_outcome_state: "awaiting_independent_risk_review";
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package6Draft = {
  schema_version: 1;
  package_id: typeof PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6;
  acquisition_receipt: { path: string; sha256: string };
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 29;
  route_count: 20;
  candidate_key_sha256:
    typeof PLAN040_PACKAGE_6_CANDIDATE_KEY_SHA256;
  wave_partition: typeof PLAN040_PACKAGE_6_WAVES;
  evidence_verdict_distribution: { receipt_terminal_unresolved: 29 };
  proposed_decision_count: 0;
  persisted_decision_count: 0;
  proposed_grain_decision_count: 0;
  persisted_grain_decision_count: 0;
  prior_package_overlap: {
    package_2_count: 0;
    package_4_count: 0;
    package_5_count: 0;
  };
  excluded_related_occurrence: {
    occurrence_id: "occurrence:833f69866045c25967353373";
    treatment_record_id:
      "treatment_weekday-express-bus-trip-additions-spring-2025";
    reason: "different_occurrence_source_and_time_context";
    excluded_from_candidate_scope: true;
  };
  candidates: Plan040Package6CandidateEvidence[];
  version_separation: {
    pre_busco_sha1: typeof PLAN040_PACKAGE_6_PRE_BUSCO_SHA1;
    required_initial_post_busco_sha1:
      typeof PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1;
    later_non_substitute_busco_sha1:
      typeof PLAN040_PACKAGE_6_NON_SUBSTITUTE_POST_BUSCO_SHA1;
    later_version_is_not_substitute: true;
    bounded_post_feed_search_repeated: false;
  };
  equivalence_policy: {
    automatic_equivalence: "identical_identifier_only";
    route_name_coordinate_or_proximity_equivalence: false;
    occurrence_inference_from_route_schedule_or_document_presence: false;
  };
  freeze_readiness:
    "frozen_evidence_only_ready_for_five_independent_risk_review_waves";
  authorization_state:
    "evidence_only_no_gate_no_acceptance_no_persistence";
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export function buildPlan040Package6Draft(input: {
  acquisitionReceiptPath: string;
  acquisitionReceiptSha256: string;
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package6CandidateEvidence[];
  package2CandidateKeys: string[];
  package4CandidateKeys: string[];
  package5CandidateKeys: string[];
}): Plan040Package6Draft {
  const expectedByTreatment = new Map<
    string,
    {
      waveId: Plan040Package6WaveId;
      routeId: Plan040Package6RouteId;
    }
  >(
    PLAN040_PACKAGE_6_CANDIDATES.map(([waveId, routeId, treatmentId]) => [
      treatmentId,
      { waveId, routeId },
    ]),
  );
  const byTreatment = new Map(input.candidates.map((candidate) => [
    candidate.treatment_record_id,
    candidate,
  ]));
  if (
    input.candidates.length !== 29 ||
    byTreatment.size !== 29 ||
    [...expectedByTreatment.keys()].some((id) => !byTreatment.has(id))
  ) {
    throw new Error("Plan 040 Package 6 requires exact 29-treatment parity");
  }
  const candidates = PLAN040_PACKAGE_6_CANDIDATES.map(
    ([, , treatmentId]) => byTreatment.get(treatmentId)!,
  );
  const keys = candidates.map((candidate) => candidate.candidate_key).sort();
  if (
    new Set(keys).size !== 29 ||
    sha256(`${keys.join("\n")}\n`) !==
      PLAN040_PACKAGE_6_CANDIDATE_KEY_SHA256
  ) {
    throw new Error("Plan 040 Package 6 candidate-key scope drifted");
  }
  for (const candidate of candidates) {
    const expected = expectedByTreatment.get(
      candidate.treatment_record_id,
    )!;
    if (
      candidate.gtfs_route_id !== expected.routeId ||
      candidate.risk_wave_id !== expected.waveId ||
      candidate.treatment_family !== "service_pattern" ||
      candidate.evidence_verdict !== "receipt_terminal_unresolved" ||
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0 ||
      candidate.risk_flags.length === 0 ||
      candidate.ledger_snapshot.extent_verdict !== "unreviewed" ||
      candidate.ledger_snapshot.grain_verdict !== "unreviewed" ||
      candidate.ledger_snapshot.current_extent_kind !== "unresolved" ||
      candidate.ledger_snapshot.extent_receipt_ids.length !== 0 ||
      candidate.ledger_snapshot.grain_receipt_ids.length !== 0 ||
      candidate.ledger_snapshot.extent_decision_id !== null ||
      candidate.ledger_snapshot.grain_decision_id !== null ||
      !candidate.candidate_may_support_positive_after_review ||
      candidate.review_outcome_state !==
        "awaiting_independent_risk_review" ||
      candidate.required_post_inventory.version_sha1 !==
        PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1 ||
      candidate.required_post_inventory.zip_sha256 !== null ||
      candidate.required_post_inventory
        .bounded_acquisition_search_repeated !== false ||
      candidate.required_post_inventory.calendar_expansion_status !==
        "not_computed_required_member_bytes_unavailable" ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: Package 6 gained unsupported authority or drifted risk scope`,
      );
    }
  }
  for (const wave of PLAN040_PACKAGE_6_WAVES) {
    if (
      candidates.filter((candidate) =>
        candidate.risk_wave_id === wave.wave_id).length !==
        wave.candidate_count
    ) {
      throw new Error(`${wave.wave_id}: candidate wave parity drifted`);
    }
  }
  if (
    new Set(candidates.map((candidate) =>
      candidate.gtfs_route_id)).size !== 20
  ) {
    throw new Error("Plan 040 Package 6 requires exact 20-route parity");
  }
  const package2 = new Set(input.package2CandidateKeys);
  const package4 = new Set(input.package4CandidateKeys);
  const package5 = new Set(input.package5CandidateKeys);
  if (
    keys.some((key) => package2.has(key)) ||
    keys.some((key) => package4.has(key)) ||
    keys.some((key) => package5.has(key))
  ) {
    throw new Error(
      "Plan 040 Package 6 overlaps an accepted or persisted prior package key",
    );
  }
  return {
    schema_version: 1,
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6,
    acquisition_receipt: {
      path: input.acquisitionReceiptPath,
      sha256: input.acquisitionReceiptSha256,
    },
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 29,
    route_count: 20,
    candidate_key_sha256: PLAN040_PACKAGE_6_CANDIDATE_KEY_SHA256,
    wave_partition: PLAN040_PACKAGE_6_WAVES,
    evidence_verdict_distribution: { receipt_terminal_unresolved: 29 },
    proposed_decision_count: 0,
    persisted_decision_count: 0,
    proposed_grain_decision_count: 0,
    persisted_grain_decision_count: 0,
    prior_package_overlap: {
      package_2_count: 0,
      package_4_count: 0,
      package_5_count: 0,
    },
    excluded_related_occurrence: {
      occurrence_id: "occurrence:833f69866045c25967353373",
      treatment_record_id:
        "treatment_weekday-express-bus-trip-additions-spring-2025",
      reason: "different_occurrence_source_and_time_context",
      excluded_from_candidate_scope: true,
    },
    candidates,
    version_separation: {
      pre_busco_sha1: PLAN040_PACKAGE_6_PRE_BUSCO_SHA1,
      required_initial_post_busco_sha1:
        PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1,
      later_non_substitute_busco_sha1:
        PLAN040_PACKAGE_6_NON_SUBSTITUTE_POST_BUSCO_SHA1,
      later_version_is_not_substitute: true,
      bounded_post_feed_search_repeated: false,
    },
    equivalence_policy: {
      automatic_equivalence: "identical_identifier_only",
      route_name_coordinate_or_proximity_equivalence: false,
      occurrence_inference_from_route_schedule_or_document_presence: false,
    },
    freeze_readiness:
      "frozen_evidence_only_ready_for_five_independent_risk_review_waves",
    authorization_state:
      "evidence_only_no_gate_no_acceptance_no_persistence",
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}

export function plan040Package6ReplayHash(value: JsonValue): string {
  return sha256(`${stableJson(value)}\n`);
}
