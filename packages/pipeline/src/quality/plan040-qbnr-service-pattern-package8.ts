import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8 =
  "plan-040-qbnr-service-pattern-package-8-evidence-only-v1" as const;
export const PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256 =
  "b616771483efb83f294b07946dcd5386788cb05ba8da6c6a810a30cc39e04d19" as const;
export const PLAN040_PACKAGE_8_SERVICE_CHANGE_HTML_SHA256 =
  "4b5dc9ca398980a3803e076378acefd7ac3ec04343e0ac32db95a17c1d51226d" as const;
export const PLAN040_PACKAGE_8_SCHEDULE_CSV_SHA256 =
  "c592686da8a1cabdc8b559db4d4ae15d5a663adbe08f332e196215fd377be7c5" as const;
export const PLAN040_PACKAGE_8_SCHEDULE_RECEIPT_SHA256 =
  "82cc442de9b9c0356965f678c8491a78a093eea8eca06bac29d67747355a58c3" as const;
export const PLAN040_PACKAGE_8_SCHEDULE_BLOCKS_SHA256 =
  "e12d18baf0ed5f6fb019d877922861df44fd99805f58f5b4b8344de89b71658d" as const;
export const PLAN040_PACKAGE_8_QUEENS_CORRECTION_SHA1 =
  "6db867de2ce30f47ae0ee763f422dc34fb7a9f9f" as const;
export const PLAN040_PACKAGE_8_BUSCO_CORRECTION_SHA1 =
  "a35da13d0a8c311de05d3558e9e80d2a472c21d2" as const;

export const PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS = {
  package_2: {
    acquisition:
      "f7b8a17c27c7d09f025dbcb7448099fe60bbc59147acac236f05875bada38a39",
    evidence:
      "48acf849f9d66508d4a8253c102bfaf04758a619603d7d79aeaaf83c2cc5958e",
    draft:
      "ade4e511ab132d3b8eb4f7fa2225dcab0e84d8e8921cc5bd7e3c3126fb61ba5a",
  },
  package_4: {
    acquisition:
      "3f804faabcbb769d037033eeeececda59fd93a3052a2d739f16680b1befe9431",
    evidence:
      "f105bd93bfeb2b0504e9819885f55d67c77e14840836dbc58ab06ced5b6c2072",
    draft:
      "04fc4c0168eda1081ed5338b77794ba61be4c1346854ed1f9a628945607113ed",
  },
  package_7_draft:
    "ee62990a38ebb787cf009ea1236618bf69cfd4e5bdbc32ce94bbc1720ed224a8",
  package_3: {
    acquisition:
      "7417deb4c56f12d98a9ec61f486cad9b0caeb7121819b1824e874643454f697e",
    evidence:
      "149809f528571fc3e49808a61ee83670121db536e691ffae88b70579e8e9ccf8",
    correction_manifest:
      "43a17a230eb70e9b7c322d2125b0db99910f035e688652624d4ce0e97a08a1d4",
  },
  extent_ledger:
    "63725f2aceca12047ff75198b9e9a131d26355ae6b1bf4efff5a6a430f7e039b",
  grain_ledger:
    "ee2eb50241d9f1b0bfb4b03eb200049309a17b930efc4511ab678c7b4c473d00",
} as const;

export const PLAN040_PACKAGE_8_WAVES = [
  {
    wave_id: "P8-A",
    label: "schedule_to_gtfs_shape_source_gap",
    candidate_count: 15,
    route_count: 8,
    evidence_verdict: "receipt_terminal_unresolved",
    review_mode: "dual_independent_source_gap_risk_review",
  },
  {
    wave_id: "P8-B",
    label: "active_inventory_missing_staged_candidate_document",
    candidate_count: 15,
    route_count: 10,
    evidence_verdict: "receipt_terminal_unresolved",
    review_mode: "dual_independent_source_gap_risk_review",
  },
] as const;

export type Plan040Package8WaveId =
  (typeof PLAN040_PACKAGE_8_WAVES)[number]["wave_id"];

export const PLAN040_PACKAGE_8_CANDIDATES = [
  ["P8-A", "Q17", "treatment_q17-limited-discontinuation-2025"],
  ["P8-A", "Q23", "treatment_q23-29-avenue-discontinuation-2025"],
  ["P8-A", "Q23", "treatment_q23-astoria-segment-replacement-2025"],
  ["P8-A", "Q23", "treatment_q23-forest-hills-reroute-2025"],
  ["P8-A", "Q23", "treatment_q23-northern-reroute-2025"],
  ["P8-A", "Q25", "treatment_q25-limited-discontinuation-2025"],
  ["P8-A", "Q27", "treatment_q27-holly-kissena-reroute-2025"],
  ["P8-A", "Q27", "treatment_q27-limited-discontinuation-2025"],
  ["P8-A", "Q76", "treatment_q76-college-point-reroute-2025"],
  ["P8-A", "Q76", "treatment_q76-q20b-service-replacement-2025"],
  ["P8-A", "Q83", "treatment_q83-limited-discontinuation-2025"],
  ["P8-A", "Q83", "treatment_q83-overnight-24-7-service-2025"],
  ["P8-A", "Q83", "treatment_q83-overnight-lirr-discontinuation-2025"],
  ["P8-A", "Q110", "treatment_q110-hempstead-replacement-2025"],
  ["P8-A", "QM4", "treatment_qm4-frequency-span-adjustment-2025"],
  ["P8-B", "Q4", "treatment_q4-limited-discontinuation-2025"],
  ["P8-B", "Q5", "treatment_q5-limited-discontinuation-2025"],
  ["P8-B", "Q5", "treatment_q5-weekday-terminal-discontinuation-2025"],
  ["P8-B", "Q13", "treatment_q13-sanford-avenue-reroute-2025"],
  ["P8-B", "Q36", "treatment_q36-limited-discontinuation-2025"],
  ["P8-B", "Q36", "treatment_q36-queens-village-reroute-2025"],
  ["P8-B", "Q36", "treatment_q36-weekend-full-route-2025"],
  ["P8-B", "Q46", "treatment_q46-glen-oaks-replacement-2025"],
  ["P8-B", "Q46", "treatment_q46-limited-discontinuation-2025"],
  ["P8-B", "Q85", "treatment_q85-green-acres-branch-replacement-2025"],
  ["P8-B", "Q85", "treatment_q85-limited-discontinuation-2025"],
  ["P8-B", "Q113", "treatment_q113-jamaica-minor-change-2025"],
  ["P8-B", "QM6", "treatment_qm6-frequency-span-adjustment-2025"],
  ["P8-B", "QM10", "treatment_qm10-frequency-span-adjustment-2025"],
  ["P8-B", "QM11", "treatment_qm11-forest-hills-streamlining-2025"],
] as const;

export type Plan040Package8RouteId =
  (typeof PLAN040_PACKAGE_8_CANDIDATES)[number][1];

export type Plan040Package8BoundaryInventory = {
  source_id: string;
  snapshot_id: string;
  feed_family: "queens" | "busco";
  target_date: "2025-06-27" | "2025-06-28" | "2025-06-29" | "2025-06-30";
  calendar_and_calendar_dates_expanded: true;
  active_service_ids: string[];
  active_service_id_sha256: string;
  route_row_count: 1;
  route_trip_row_count: number;
  active_route_trip_count: number;
  active_shape_ids: string[];
  active_shape_id_sha256: string;
  ordered_full_stop_pattern_count: number;
  ordered_full_stop_pattern_shape_ids: string[];
  receipt_path: string;
  receipt_sha256: string;
  zip_sha1: string;
  zip_sha256: string;
  inventory_role:
    "raw_active_gtfs_inventory_nonauthorizing_not_schedule_trip_type_validated";
};

export type Plan040Package8CandidateEvidence = {
  candidate_key: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  treatment_family: "service_pattern";
  gtfs_route_id: Plan040Package8RouteId;
  risk_wave_id: Plan040Package8WaveId;
  source_statement: {
    source_id: "mta_queens_bus_network_redesign_service_changes";
    evidence_id: string;
    block_id: string;
    block_sha256: string;
    treatment_kind: string;
    raw_text: string;
  };
  source_row: {
    source_html_sha256:
      typeof PLAN040_PACKAGE_8_SERVICE_CHANGE_HTML_SHA256;
    route_row: Plan040Package8RouteId;
    row_sha256: string;
    implementation_statement: string;
    candidate_change_context: string[];
    anchors: Array<{ text: string; href: string }>;
  };
  exact_candidate_searches: string[];
  immutable_p2_p4_context: null | {
    origin: "package_2" | "package_4";
    evidence_path: string;
    evidence_sha256: string;
    stop_removal_candidate_key: string;
    candidate_document: {
      source_id: string;
      source_url: string;
      receipt_sha256: string;
      pdf_sha256: string;
      layout_text_sha256: string;
      raw_text_sha256: string;
      document_is_full_stop_chain: false;
      nonexclusive_context: true;
    };
  };
  boundary_inventory: {
    pre: Plan040Package8BoundaryInventory;
    post: Plan040Package8BoundaryInventory;
    same_feed_family: true;
    both_boundaries_active: true;
  };
  schedule_to_gtfs_shape_gap: null | {
    schedule_source_id: "mta_bus_schedules_2025_candidate_windows";
    passenger_policy: "any_trip_type_except_2_3_4";
    excluded_nonrevenue_trip_types: ["2", "3", "4"];
    pre: Plan040Package8ShapeComparison;
    post: Plan040Package8ShapeComparison;
    pre_shape_sets_match: true;
    post_shape_sets_match: false;
    binding_status:
      "blocked_post_schedule_gtfs_shape_identity_mismatch";
  };
  schedule_trip_type_validation: null | {
    source_id: "mta_bus_schedules_2025_candidate_windows";
    source_csv_sha256: typeof PLAN040_PACKAGE_8_SCHEDULE_CSV_SHA256;
    acquisition_receipt_sha256:
      typeof PLAN040_PACKAGE_8_SCHEDULE_RECEIPT_SHA256;
    blocks_sha256: typeof PLAN040_PACKAGE_8_SCHEDULE_BLOCKS_SHA256;
    passenger_policy: "any_trip_type_except_2_3_4";
    excluded_nonrevenue_trip_types: ["2", "3", "4"];
    raw_gtfs_inventory_role:
      "nonauthorizing_not_schedule_trip_type_validated";
    pre: Plan040Package8ScheduleValidationBoundary;
    post: Plan040Package8ScheduleValidationBoundary;
    binding_status:
      | "validated_exact_passenger_shape_sets_match_both_boundaries"
      | "blocked_post_schedule_gtfs_shape_identity_mismatch";
  };
  correction_sensitivity?: {
    feed_family: "queens" | "busco";
    published_initial_post_sha1: string;
    correction_version_sha1:
      | typeof PLAN040_PACKAGE_8_QUEENS_CORRECTION_SHA1
      | typeof PLAN040_PACKAGE_8_BUSCO_CORRECTION_SHA1;
    status:
      "nonauthorizing_initial_shape_mismatch_may_be_correction_sensitive";
    corrected_first_week_diff_status: "blocked_not_run";
    correction_bytes_used: false;
    corrected_diff_used: false;
  };
  candidate_document_gap: null | {
    required_source_roles: [
      "candidate_specific_service_detail",
      "candidate_specific_schedule_or_timetable",
    ];
    exact_url_searches: Array<{
      source_role:
        | "candidate_specific_service_detail"
        | "candidate_specific_schedule_or_timetable";
      source_url: string;
      matched_staged_source_ids: [];
    }>;
    source_role_gap_codes: [
      "candidate_specific_service_detail_not_staged",
      "candidate_specific_schedule_or_timetable_not_staged",
    ];
    binding_status:
      "blocked_missing_staged_candidate_document";
    external_acquisition_performed: false;
  };
  ledger_snapshot: {
    extent_verdict: "unreviewed";
    grain_verdict: "unreviewed";
    grain_spatial_verdict: "unreviewed";
    current_extent_kind: "unresolved";
    extent_receipt_ids: [];
    grain_receipt_ids: [];
    extent_decision_id: null;
    grain_decision_id: null;
    extent_updated_at: null;
    grain_updated_at: null;
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

export type Plan040Package8ShapeComparison = {
  schedule_date: string;
  schedule_passenger_shape_ids: string[];
  gtfs_full_stop_shape_ids: string[];
  schedule_only_shape_ids: string[];
  gtfs_only_shape_ids: string[];
  schedule_slice_sha256: string;
};

export type Plan040Package8ScheduleValidationBoundary = {
  schedule_date: string;
  route_id: Plan040Package8RouteId;
  operator: "NYCT" | "MTA Bus";
  row_count: number;
  trip_type_rows: Record<string, number>;
  schedule_passenger_shape_ids: string[];
  schedule_nonrevenue_shape_ids: string[];
  ambiguous_shape_ids: string[];
  gtfs_active_full_stop_shape_ids: string[];
  matched_passenger_shape_ids: string[];
  schedule_only_passenger_shape_ids: string[];
  gtfs_only_active_shape_ids: string[];
  shape_sets_match: boolean;
  schedule_slice_sha256: string;
};

export type Plan040Package8CorrectionIdentity = {
  feed_family: "queens" | "busco";
  version_sha1:
    | typeof PLAN040_PACKAGE_8_QUEENS_CORRECTION_SHA1
    | typeof PLAN040_PACKAGE_8_BUSCO_CORRECTION_SHA1;
  fetched_at: string;
  metadata_url: string | null;
  service_window: { start: string; end: string };
  route_count: number;
  stop_count: number;
  stop_time_count: number;
  trip_count: number;
  member_sha1s: Record<string, string>;
  acquisition_status: "full_sha1_observed_bytes_not_accepted";
  exact_zip_bytes_status: "blocked_unavailable";
  exact_member_bytes_status:
    | "queens_partial_content_matches_routes_member_mismatch"
    | "busco_no_exact_correction_members_accepted";
  zip_sha256: null;
  correction_bytes_used: false;
  corrected_diff_used: false;
};

export type Plan040Package8VersionSeparation = {
  immutable_correction_context: {
    package_3_acquisition: { path: string; sha256: string };
    package_3_evidence: { path: string; sha256: string };
    correction_manifest: { path: string; sha256: string };
  };
  published_launch_diff: {
    status: "completed_from_accepted_initial_feed_bytes";
    comparison_role: "published_launch_diff";
    initial_post_versions: {
      queens: {
        source_id: "gtfs_static_20250626_queens_post_qbnr";
        zip_sha1: "c868290ddcd79c69712d809ece96d96dbad2c613";
        zip_sha256:
          "4db0f151dc541f2669dde72f104c7803b0f99258bc5d14278b04c8016ce7471a";
      };
      busco: {
        source_id: "gtfs_static_20250626_busco_post_qbnr";
        zip_sha1: "54653b3fafb5fabc5ab1c941780b871343138440";
        zip_sha256:
          "7d0e5651d5cc5c3ac86973dc664e16a05e9245bea156f566c39e71506128670e";
      };
    };
    correction_version_sha1s_used: [];
    correction_bytes_used: false;
  };
  corrected_first_week_diff: {
    status: "blocked_not_run";
    comparison_role: "corrected_first_week_diff";
    corrections: {
      queens: Plan040Package8CorrectionIdentity;
      busco: Plan040Package8CorrectionIdentity;
    };
    comparison_run: false;
    correction_bytes_used: false;
    corrected_diff_used: false;
    published_launch_outcomes_reclassified: false;
    block_reason:
      "exact_correction_zip_bytes_unavailable_and_required_member_set_not_accepted";
  };
};

export type Plan040Package8Draft = {
  schema_version: 1;
  package_id: typeof PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8;
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 30;
  route_count: 18;
  candidate_key_sha256:
    typeof PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256;
  wave_partition: typeof PLAN040_PACKAGE_8_WAVES;
  scope_reconciliation: {
    prior_wave_b_estimate: 16;
    exact_wave_b_count: 15;
    reconciliation:
      "reconciled_to_exact_ledger_rows_no_one_boundary_route_added";
    guessed_candidate_count: 0;
    forced_one_boundary_route_count: 0;
  };
  evidence_verdict_distribution: {
    receipt_terminal_unresolved: 30;
  };
  proposed_extent_decision_count: 0;
  proposed_grain_decision_count: 0;
  persisted_extent_decision_count: 0;
  persisted_grain_decision_count: 0;
  prior_package_overlap: Record<
    | "package_2"
    | "package_4"
    | "package_5"
    | "package_6"
    | "package_7"
    | "exemplar",
    0
  >;
  candidates: Plan040Package8CandidateEvidence[];
  version_separation: Plan040Package8VersionSeparation;
  review_protocol: {
    dual_independent_review_required: true;
    owner_gate_allowed_before_dual_review: false;
    persistence_allowed_before_owner_gate: false;
  };
  authorization_state:
    "evidence_draft_pending_dual_independent_source_gap_review_no_gate_no_acceptance_no_persistence";
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export function plan040Package8ReplayHash(value: JsonValue): string {
  return sha256(`${stableJson(value)}\n`);
}

export function buildPlan040Package8Draft(input: {
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package8CandidateEvidence[];
  versionSeparation: Plan040Package8VersionSeparation;
  priorCandidateKeys: Record<
    | "package_2"
    | "package_4"
    | "package_5"
    | "package_6"
    | "package_7"
    | "exemplar",
    string[]
  >;
}): Plan040Package8Draft {
  const versionSeparation = input.versionSeparation;
  const queensCorrection =
    versionSeparation.corrected_first_week_diff.corrections.queens;
  const buscoCorrection =
    versionSeparation.corrected_first_week_diff.corrections.busco;
  const identityMatches = (left: string, right: string): boolean =>
    left === right;
  if (
    versionSeparation.immutable_correction_context.package_3_acquisition
        .sha256 !==
      PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_3.acquisition ||
    versionSeparation.immutable_correction_context.package_3_evidence
        .sha256 !==
      PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_3.evidence ||
    versionSeparation.immutable_correction_context.correction_manifest
        .sha256 !==
      PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_3.correction_manifest ||
    versionSeparation.published_launch_diff.status !==
      "completed_from_accepted_initial_feed_bytes" ||
    versionSeparation.published_launch_diff.comparison_role !==
      "published_launch_diff" ||
    versionSeparation.published_launch_diff.initial_post_versions.queens
        .zip_sha1 !== "c868290ddcd79c69712d809ece96d96dbad2c613" ||
    versionSeparation.published_launch_diff.initial_post_versions.busco
        .zip_sha1 !== "54653b3fafb5fabc5ab1c941780b871343138440" ||
    versionSeparation.published_launch_diff.correction_version_sha1s_used
        .length !== 0 ||
    versionSeparation.published_launch_diff.correction_bytes_used ||
    versionSeparation.corrected_first_week_diff.status !==
      "blocked_not_run" ||
    versionSeparation.corrected_first_week_diff.comparison_role !==
      "corrected_first_week_diff" ||
    versionSeparation.corrected_first_week_diff.comparison_run ||
    versionSeparation.corrected_first_week_diff.correction_bytes_used ||
    versionSeparation.corrected_first_week_diff.corrected_diff_used ||
    versionSeparation.corrected_first_week_diff
      .published_launch_outcomes_reclassified ||
    queensCorrection.feed_family !== "queens" ||
    queensCorrection.version_sha1 !==
      PLAN040_PACKAGE_8_QUEENS_CORRECTION_SHA1 ||
    queensCorrection.exact_zip_bytes_status !== "blocked_unavailable" ||
    queensCorrection.exact_member_bytes_status !==
      "queens_partial_content_matches_routes_member_mismatch" ||
    queensCorrection.correction_bytes_used ||
    queensCorrection.corrected_diff_used ||
    buscoCorrection.feed_family !== "busco" ||
    buscoCorrection.version_sha1 !==
      PLAN040_PACKAGE_8_BUSCO_CORRECTION_SHA1 ||
    buscoCorrection.exact_zip_bytes_status !== "blocked_unavailable" ||
    buscoCorrection.exact_member_bytes_status !==
      "busco_no_exact_correction_members_accepted" ||
    buscoCorrection.correction_bytes_used ||
    buscoCorrection.corrected_diff_used ||
    identityMatches(
      queensCorrection.version_sha1,
      versionSeparation.published_launch_diff.initial_post_versions.queens
        .zip_sha1,
    ) ||
    identityMatches(
      buscoCorrection.version_sha1,
      versionSeparation.published_launch_diff.initial_post_versions.busco
        .zip_sha1,
    )
  ) {
    throw new Error(
      "Plan 040 Package 8 correction-version separation drifted or mixed",
    );
  }
  const expected = new Map<string, {
    waveId: Plan040Package8WaveId;
    routeId: Plan040Package8RouteId;
  }>(
    PLAN040_PACKAGE_8_CANDIDATES.map(([waveId, routeId, treatmentId]) => [
      treatmentId,
      { waveId, routeId },
    ]),
  );
  const byTreatment = new Map(input.candidates.map((candidate) => [
    candidate.treatment_record_id,
    candidate,
  ]));
  if (
    input.candidates.length !== 30 ||
    byTreatment.size !== 30 ||
    [...expected.keys()].some((id) => !byTreatment.has(id))
  ) {
    throw new Error("Plan 040 Package 8 requires exact 30-treatment parity");
  }
  const candidates = PLAN040_PACKAGE_8_CANDIDATES.map(([, , id]) =>
    byTreatment.get(id)!);
  const keys = candidates.map((candidate) => candidate.candidate_key).sort();
  if (
    new Set(keys).size !== 30 ||
    sha256(`${keys.join("\n")}\n`) !==
      PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256
  ) {
    throw new Error("Plan 040 Package 8 candidate-key scope drifted");
  }
  if (
    new Set(candidates.map((candidate) =>
      candidate.gtfs_route_id)).size !== 18
  ) {
    throw new Error("Plan 040 Package 8 requires exact 18-route parity");
  }

  for (const candidate of candidates) {
    const specification = expected.get(candidate.treatment_record_id)!;
    const commonValid =
      candidate.risk_wave_id === specification.waveId &&
      candidate.gtfs_route_id === specification.routeId &&
      candidate.treatment_family === "service_pattern" &&
      candidate.source_statement.raw_text.trim().length > 0 &&
      candidate.source_statement.evidence_id.trim().length > 0 &&
      candidate.source_row.source_html_sha256 ===
        PLAN040_PACKAGE_8_SERVICE_CHANGE_HTML_SHA256 &&
      candidate.source_row.route_row === candidate.gtfs_route_id &&
      candidate.exact_candidate_searches.length >= 3 &&
      candidate.boundary_inventory.same_feed_family &&
      candidate.boundary_inventory.both_boundaries_active &&
      candidate.boundary_inventory.pre.feed_family ===
        candidate.boundary_inventory.post.feed_family &&
      candidate.boundary_inventory.pre.active_route_trip_count > 0 &&
      candidate.boundary_inventory.post.active_route_trip_count > 0 &&
      candidate.boundary_inventory.pre.active_shape_ids.length > 0 &&
      candidate.boundary_inventory.post.active_shape_ids.length > 0 &&
      candidate.boundary_inventory.pre.inventory_role ===
        "raw_active_gtfs_inventory_nonauthorizing_not_schedule_trip_type_validated" &&
      candidate.boundary_inventory.post.inventory_role ===
        "raw_active_gtfs_inventory_nonauthorizing_not_schedule_trip_type_validated" &&
      candidate.ledger_snapshot.extent_verdict === "unreviewed" &&
      candidate.ledger_snapshot.grain_verdict === "unreviewed" &&
      candidate.ledger_snapshot.grain_spatial_verdict === "unreviewed" &&
      candidate.ledger_snapshot.current_extent_kind === "unresolved" &&
      candidate.ledger_snapshot.extent_receipt_ids.length === 0 &&
      candidate.ledger_snapshot.grain_receipt_ids.length === 0 &&
      candidate.ledger_snapshot.extent_decision_id === null &&
      candidate.ledger_snapshot.grain_decision_id === null &&
      candidate.ledger_snapshot.extent_updated_at === null &&
      candidate.ledger_snapshot.grain_updated_at === null &&
      candidate.unresolved_gap_codes.length > 0 &&
      candidate.evidence_verdict === "receipt_terminal_unresolved" &&
      candidate.proposed_extent_decision === null &&
      candidate.proposed_grain_decision === null &&
      candidate.persisted_extent_decision === null &&
      candidate.persisted_grain_decision === null &&
      !candidate.authorizes_occurrence &&
      !candidate.authorizes_study &&
      !candidate.authorizes_cross_product &&
      !candidate.authorizes_decision_persistence;
    if (!commonValid) {
      throw new Error(
        `${candidate.treatment_record_id}: Package 8 evidence, ledger, or authority scope drifted`,
      );
    }
    if (candidate.risk_wave_id === "P8-A") {
      const gap = candidate.schedule_to_gtfs_shape_gap;
      const correction = candidate.correction_sensitivity;
      const expectedCorrection = candidate.boundary_inventory.post
          .feed_family === "queens"
        ? PLAN040_PACKAGE_8_QUEENS_CORRECTION_SHA1
        : PLAN040_PACKAGE_8_BUSCO_CORRECTION_SHA1;
      if (
        !candidate.immutable_p2_p4_context ||
        candidate.candidate_document_gap !== null ||
        candidate.schedule_trip_type_validation !== null ||
        !gap ||
        !gap.pre_shape_sets_match ||
        gap.post_shape_sets_match ||
        gap.pre.schedule_only_shape_ids.length !== 0 ||
        gap.pre.gtfs_only_shape_ids.length !== 0 ||
        gap.post.schedule_only_shape_ids.length === 0 ||
        gap.post.gtfs_only_shape_ids.length === 0 ||
        gap.binding_status !==
          "blocked_post_schedule_gtfs_shape_identity_mismatch" ||
        !correction ||
        correction.feed_family !==
          candidate.boundary_inventory.post.feed_family ||
        correction.published_initial_post_sha1 !==
          candidate.boundary_inventory.post.zip_sha1 ||
        correction.correction_version_sha1 !== expectedCorrection ||
        correction.status !==
          "nonauthorizing_initial_shape_mismatch_may_be_correction_sensitive" ||
        correction.corrected_first_week_diff_status !== "blocked_not_run" ||
        correction.correction_bytes_used ||
        correction.corrected_diff_used ||
        !candidate.unresolved_gap_codes.includes(
          "post_schedule_gtfs_shape_identity_mismatch",
        ) ||
        !candidate.unresolved_gap_codes.includes(
          "initial_shape_mismatch_may_be_correction_sensitive",
        ) ||
        !candidate.unresolved_gap_codes.includes(
          "corrected_first_week_diff_blocked_not_run",
        )
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: P8-A shape-source gap drifted`,
        );
      }
    } else {
      const gap = candidate.candidate_document_gap;
      const schedule = candidate.schedule_trip_type_validation;
      const correctionSensitive = candidate.gtfs_route_id === "Q36" ||
        candidate.gtfs_route_id === "Q85";
      const correction = candidate.correction_sensitivity;
      const scheduleCommonValid =
        schedule?.source_id ===
          "mta_bus_schedules_2025_candidate_windows" &&
        schedule.source_csv_sha256 ===
          PLAN040_PACKAGE_8_SCHEDULE_CSV_SHA256 &&
        schedule.acquisition_receipt_sha256 ===
          PLAN040_PACKAGE_8_SCHEDULE_RECEIPT_SHA256 &&
        schedule.blocks_sha256 ===
          PLAN040_PACKAGE_8_SCHEDULE_BLOCKS_SHA256 &&
        schedule.passenger_policy === "any_trip_type_except_2_3_4" &&
        schedule.excluded_nonrevenue_trip_types.join(",") === "2,3,4" &&
        schedule.raw_gtfs_inventory_role ===
          "nonauthorizing_not_schedule_trip_type_validated" &&
        schedule.pre.route_id === candidate.gtfs_route_id &&
        schedule.post.route_id === candidate.gtfs_route_id &&
        schedule.pre.schedule_date.startsWith(
          candidate.boundary_inventory.pre.target_date,
        ) &&
        schedule.post.schedule_date.startsWith(
          candidate.boundary_inventory.post.target_date,
        ) &&
        schedule.pre.ambiguous_shape_ids.length === 0 &&
        schedule.post.ambiguous_shape_ids.length === 0 &&
        stableJson(
          schedule.pre.gtfs_active_full_stop_shape_ids as unknown as JsonValue,
        ) === stableJson(
          candidate.boundary_inventory.pre
            .ordered_full_stop_pattern_shape_ids as unknown as JsonValue,
        ) &&
        stableJson(
          schedule.post.gtfs_active_full_stop_shape_ids as unknown as JsonValue,
        ) === stableJson(
          candidate.boundary_inventory.post
            .ordered_full_stop_pattern_shape_ids as unknown as JsonValue,
        ) &&
        schedule.pre.shape_sets_match &&
        schedule.pre.schedule_only_passenger_shape_ids.length === 0 &&
        schedule.pre.gtfs_only_active_shape_ids.length === 0;
      if (
        candidate.immutable_p2_p4_context !== null ||
        candidate.schedule_to_gtfs_shape_gap !== null ||
        !scheduleCommonValid ||
        !gap ||
        gap.exact_url_searches.length !== 2 ||
        gap.exact_url_searches.some((search) =>
          search.matched_staged_source_ids.length !== 0) ||
        gap.external_acquisition_performed ||
        gap.binding_status !==
          "blocked_missing_staged_candidate_document" ||
        !candidate.unresolved_gap_codes.includes(
          "candidate_specific_service_detail_not_staged",
        ) ||
        !candidate.unresolved_gap_codes.includes(
          "candidate_specific_schedule_or_timetable_not_staged",
        )
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: P8-B candidate-document gap drifted`,
        );
      }
      if (correctionSensitive) {
        const expected = candidate.gtfs_route_id === "Q36"
          ? {
            schedule: ["Q360169", "Q360170", "Q360186", "Q360187"],
            gtfs: ["Q360166", "Q360168", "Q360169", "Q360170"],
            matched: ["Q360169", "Q360170"],
            scheduleOnly: ["Q360186", "Q360187"],
            gtfsOnly: ["Q360166", "Q360168"],
          }
          : {
            schedule: ["Q850420", "Q850437"],
            gtfs: ["Q850420", "Q850421"],
            matched: ["Q850420"],
            scheduleOnly: ["Q850437"],
            gtfsOnly: ["Q850421"],
          };
        if (
          schedule.binding_status !==
            "blocked_post_schedule_gtfs_shape_identity_mismatch" ||
          schedule.post.shape_sets_match ||
          stableJson(
            schedule.post.schedule_passenger_shape_ids as unknown as JsonValue,
          ) !== stableJson(expected.schedule as unknown as JsonValue) ||
          stableJson(
            schedule.post.gtfs_active_full_stop_shape_ids as unknown as JsonValue,
          ) !== stableJson(expected.gtfs as unknown as JsonValue) ||
          stableJson(
            schedule.post.matched_passenger_shape_ids as unknown as JsonValue,
          ) !== stableJson(expected.matched as unknown as JsonValue) ||
          stableJson(
            schedule.post
              .schedule_only_passenger_shape_ids as unknown as JsonValue,
          ) !== stableJson(expected.scheduleOnly as unknown as JsonValue) ||
          stableJson(
            schedule.post.gtfs_only_active_shape_ids as unknown as JsonValue,
          ) !== stableJson(expected.gtfsOnly as unknown as JsonValue) ||
          !correction ||
          correction.published_initial_post_sha1 !==
            candidate.boundary_inventory.post.zip_sha1 ||
          correction.correction_version_sha1 !==
            PLAN040_PACKAGE_8_QUEENS_CORRECTION_SHA1 ||
          correction.status !==
            "nonauthorizing_initial_shape_mismatch_may_be_correction_sensitive" ||
          correction.corrected_first_week_diff_status !== "blocked_not_run" ||
          correction.correction_bytes_used ||
          correction.corrected_diff_used ||
          !candidate.unresolved_gap_codes.includes(
            "post_schedule_gtfs_shape_identity_mismatch",
          ) ||
          !candidate.unresolved_gap_codes.includes(
            "initial_shape_mismatch_may_be_correction_sensitive",
          ) ||
          !candidate.unresolved_gap_codes.includes(
            "corrected_first_week_diff_blocked_not_run",
          )
        ) {
          throw new Error(
            `${candidate.treatment_record_id}: P8-B passenger-validation mismatch drifted`,
          );
        }
      } else if (
        correction !== undefined ||
        schedule.binding_status !==
          "validated_exact_passenger_shape_sets_match_both_boundaries" ||
        !schedule.post.shape_sets_match ||
        schedule.post.schedule_only_passenger_shape_ids.length !== 0 ||
        schedule.post.gtfs_only_active_shape_ids.length !== 0
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: P8-B passenger validation drifted`,
        );
      }
    }
  }

  for (const wave of PLAN040_PACKAGE_8_WAVES) {
    const rows = candidates.filter((candidate) =>
      candidate.risk_wave_id === wave.wave_id);
    if (
      rows.length !== wave.candidate_count ||
      new Set(rows.map((candidate) =>
        candidate.gtfs_route_id)).size !== wave.route_count
    ) {
      throw new Error(`${wave.wave_id}: exact wave parity drifted`);
    }
  }

  const candidateKeySet = new Set(keys);
  for (
    const [packageId, priorKeys] of
    Object.entries(input.priorCandidateKeys)
  ) {
    if (priorKeys.some((key) => candidateKeySet.has(key))) {
      throw new Error(`Plan 040 Package 8 overlaps ${packageId}`);
    }
  }

  return {
    schema_version: 1,
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8,
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 30,
    route_count: 18,
    candidate_key_sha256: PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256,
    wave_partition: PLAN040_PACKAGE_8_WAVES,
    scope_reconciliation: {
      prior_wave_b_estimate: 16,
      exact_wave_b_count: 15,
      reconciliation:
        "reconciled_to_exact_ledger_rows_no_one_boundary_route_added",
      guessed_candidate_count: 0,
      forced_one_boundary_route_count: 0,
    },
    evidence_verdict_distribution: {
      receipt_terminal_unresolved: 30,
    },
    proposed_extent_decision_count: 0,
    proposed_grain_decision_count: 0,
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    prior_package_overlap: {
      package_2: 0,
      package_4: 0,
      package_5: 0,
      package_6: 0,
      package_7: 0,
      exemplar: 0,
    },
    candidates,
    version_separation: versionSeparation,
    review_protocol: {
      dual_independent_review_required: true,
      owner_gate_allowed_before_dual_review: false,
      persistence_allowed_before_owner_gate: false,
    },
    authorization_state:
      "evidence_draft_pending_dual_independent_source_gap_review_no_gate_no_acceptance_no_persistence",
    external_acquisition_performed: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}
