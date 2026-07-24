import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8 =
  "plan-040-qbnr-service-pattern-package-8-evidence-only-v1" as const;
export const PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256 =
  "b616771483efb83f294b07946dcd5386788cb05ba8da6c6a810a30cc39e04d19" as const;
export const PLAN040_PACKAGE_8_SERVICE_CHANGE_HTML_SHA256 =
  "4b5dc9ca398980a3803e076378acefd7ac3ec04343e0ac32db95a17c1d51226d" as const;

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
      if (
        !candidate.immutable_p2_p4_context ||
        candidate.candidate_document_gap !== null ||
        !gap ||
        !gap.pre_shape_sets_match ||
        gap.post_shape_sets_match ||
        gap.pre.schedule_only_shape_ids.length !== 0 ||
        gap.pre.gtfs_only_shape_ids.length !== 0 ||
        gap.post.schedule_only_shape_ids.length === 0 ||
        gap.post.gtfs_only_shape_ids.length === 0 ||
        gap.binding_status !==
          "blocked_post_schedule_gtfs_shape_identity_mismatch" ||
        !candidate.unresolved_gap_codes.includes(
          "post_schedule_gtfs_shape_identity_mismatch",
        )
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: P8-A shape-source gap drifted`,
        );
      }
    } else {
      const gap = candidate.candidate_document_gap;
      if (
        candidate.immutable_p2_p4_context !== null ||
        candidate.schedule_to_gtfs_shape_gap !== null ||
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
