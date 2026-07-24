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
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_INITIAL_REVIEWED_COMMIT =
  "707a6d3e1f00eccb7f28c6e2c5e01b5730d007b6" as const;
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_AMENDED_REVIEWED_COMMIT =
  "bcadc49aec3f50765ec388d1f6dc16c6cd152d15" as const;
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_ACQUISITION_SHA256 =
  "fe597387e7a9d1a4072316be8f706bca6b3ce785983b5aabc104bdc23c4ec84a" as const;
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_EVIDENCE_SHA256 =
  "4315d767821963f43bbef7416b893c74995601a79be6d5b5070e9db6e521f2a9" as const;
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_DRAFT_SHA256 =
  "4ddd5302bef65687106d7ac16cfb2199ed05341526ce1d3707e9afd66a00b85c" as const;
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_GATE_SHA256 =
  "8584597e5e48d5e8a2459565bfc12be9880b3f8e73eb3b818f3de0a3653427b3" as const;
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_ACCEPTANCE_SHA256 =
  "89e05147c7dd3feb21904f8bfe08baba61332c7aa6087002bc4626d6f9794032" as const;

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

export const PLAN040_PACKAGE_6_AUDITED_CURRENT_OUTCOMES = [
  {
    wave_id: "P6-A",
    positive_count: 0,
    terminal_absence_count: 11,
  },
  {
    wave_id: "P6-B",
    positive_count: 0,
    terminal_absence_count: 7,
  },
  {
    wave_id: "P6-C",
    positive_count: 0,
    terminal_absence_count: 3,
  },
  {
    wave_id: "P6-D",
    positive_count: 0,
    terminal_absence_count: 3,
  },
  {
    wave_id: "P6-E",
    positive_count: 0,
    terminal_absence_count: 5,
  },
] as const;

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
  current_evidence_positive_eligible: false;
  positive_eligibility_requires_new_exact_post_full_stop_and_id_equivalence_evidence_plus_review:
    true;
  independent_audit_completed: true;
  review_outcome_state: "audited_current_evidence_terminal_absence";
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
  audited_current_outcomes:
    typeof PLAN040_PACKAGE_6_AUDITED_CURRENT_OUTCOMES;
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
  future_positive_prerequisites: {
    exact_post_feed_version_sha1:
      typeof PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1;
    new_exact_post_full_stop_member_bytes_required: true;
    reviewed_stop_id_equivalence_required: true;
    independent_review_required_after_new_evidence: true;
    review_alone_sufficient: false;
  };
  freeze_readiness:
    "audited_current_evidence_terminal_absence_reaudit_required_after_new_prerequisite_evidence";
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
      candidate.current_evidence_positive_eligible !== false ||
      !candidate
        .positive_eligibility_requires_new_exact_post_full_stop_and_id_equivalence_evidence_plus_review ||
      !candidate.independent_audit_completed ||
      candidate.review_outcome_state !==
        "audited_current_evidence_terminal_absence" ||
      !candidate.risk_flags.includes(
        "current_evidence_not_positive_eligible",
      ) ||
      !candidate.unresolved_gap_codes.includes(
        "positive_eligibility_requires_new_exact_post_full_stop_and_id_equivalence_evidence_plus_review",
      ) ||
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
    audited_current_outcomes:
      PLAN040_PACKAGE_6_AUDITED_CURRENT_OUTCOMES,
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
    future_positive_prerequisites: {
      exact_post_feed_version_sha1:
        PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1,
      new_exact_post_full_stop_member_bytes_required: true,
      reviewed_stop_id_equivalence_required: true,
      independent_review_required_after_new_evidence: true,
      review_alone_sufficient: false,
    },
    freeze_readiness:
      "audited_current_evidence_terminal_absence_reaudit_required_after_new_prerequisite_evidence",
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

const PACKAGE_6_ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-service-pattern-package-6-acquisition-v1.json";
const PACKAGE_6_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-6-evidence-v1.json";
const PACKAGE_6_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-6-evidence-draft-v1.json";
const PACKAGE_6_GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-6-dual-review-gate-v1.json";
const PACKAGE_6_ACCEPTANCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-6-owner-acceptance-v1.json";

function package6ArtifactPins() {
  return {
    acquisition: {
      path: PACKAGE_6_ACQUISITION_PATH,
      sha256:
        PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_ACQUISITION_SHA256,
    },
    evidence: {
      path: PACKAGE_6_EVIDENCE_PATH,
      sha256:
        PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_EVIDENCE_SHA256,
    },
    draft: {
      path: PACKAGE_6_DRAFT_PATH,
      sha256: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_DRAFT_SHA256,
      replay_sha256:
        PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_DRAFT_SHA256,
    },
  };
}

export function buildPlan040Package6GateAndAcceptance(input: {
  draft: Plan040Package6Draft;
  acceptedAt: string;
}) {
  const replayHash = plan040Package6ReplayHash(
    input.draft as unknown as JsonValue,
  );
  const candidateKeys = input.draft.candidates
    .map((candidate) => candidate.candidate_key)
    .sort();
  const candidateKeySha256 = sha256(`${candidateKeys.join("\n")}\n`);
  if (
    replayHash !==
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_DRAFT_SHA256 ||
    input.draft.acquisition_receipt.sha256 !==
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_ACQUISITION_SHA256 ||
    input.draft.evidence_manifest.sha256 !==
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_EVIDENCE_SHA256 ||
    input.draft.candidate_count !== 29 ||
    candidateKeys.length !== 29 ||
    candidateKeySha256 !== PLAN040_PACKAGE_6_CANDIDATE_KEY_SHA256 ||
    input.draft.candidate_key_sha256 !==
      PLAN040_PACKAGE_6_CANDIDATE_KEY_SHA256 ||
    stableJson(
        input.draft.audited_current_outcomes as unknown as JsonValue,
      ) !==
      stableJson(
        PLAN040_PACKAGE_6_AUDITED_CURRENT_OUTCOMES as unknown as JsonValue,
      ) ||
    input.draft.evidence_verdict_distribution
        .receipt_terminal_unresolved !== 29 ||
    input.draft.proposed_decision_count !== 0 ||
    input.draft.persisted_decision_count !== 0 ||
    input.draft.proposed_grain_decision_count !== 0 ||
    input.draft.persisted_grain_decision_count !== 0 ||
    input.draft.future_positive_prerequisites
        .exact_post_feed_version_sha1 !==
      PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1 ||
    input.draft.future_positive_prerequisites
        .new_exact_post_full_stop_member_bytes_required !== true ||
    input.draft.future_positive_prerequisites
        .reviewed_stop_id_equivalence_required !== true ||
    input.draft.future_positive_prerequisites
        .independent_review_required_after_new_evidence !== true ||
    input.draft.future_positive_prerequisites.review_alone_sufficient !==
      false ||
    input.draft.authorizes_occurrence ||
    input.draft.authorizes_study ||
    input.draft.authorizes_cross_product ||
    input.draft.authorizes_decision_persistence ||
    input.draft.candidates.some((candidate) =>
      candidate.evidence_verdict !== "receipt_terminal_unresolved" ||
      candidate.current_evidence_positive_eligible !== false ||
      candidate
          .positive_eligibility_requires_new_exact_post_full_stop_and_id_equivalence_evidence_plus_review !==
        true ||
      candidate.independent_audit_completed !== true ||
      candidate.review_outcome_state !==
        "audited_current_evidence_terminal_absence" ||
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence)
  ) {
    throw new Error(
      "Plan 040 Package 6 amended audit, exact hash, or authority scope drifted",
    );
  }

  const reviewerResults = [
    {
      role: "independent_main_advisor_amended_package_review",
      reviewer_id: "main_advisor",
      reviewed_commit:
        PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_AMENDED_REVIEWED_COMMIT,
      verdict: "APPROVE" as const,
    },
    {
      role: "independent_package_6_evidence_and_fail_closed_audit",
      reviewer_id: "plan040_package6_independent_audit",
      verdict: "APPROVE" as const,
      review_history: [
        {
          reviewed_commit:
            PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_INITIAL_REVIEWED_COMMIT,
          verdict: "REFUTE" as const,
          finding:
            "review alone could not cure missing exact e1c52 post full-stop bytes and reviewed stop-ID equivalence",
        },
        {
          reviewed_commit:
            PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_AMENDED_REVIEWED_COMMIT,
          verdict: "APPROVE" as const,
          finding:
            "amendment correctly records 0 positive and 29 terminal current-evidence outcomes with new-evidence prerequisites",
        },
      ],
    },
  ];
  const gate = {
    schema_version: 1,
    gate_id:
      "plan-040-qbnr-service-pattern-package-6-dual-review-gate-v1",
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6,
    reviewed_commit:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_AMENDED_REVIEWED_COMMIT,
    preserved_review_history: {
      initial_refuted_commit:
        PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_INITIAL_REVIEWED_COMMIT,
      amended_approved_commit:
        PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_AMENDED_REVIEWED_COMMIT,
    },
    artifacts: package6ArtifactPins(),
    candidate_count: 29,
    candidate_key_sha256: candidateKeySha256,
    evidence_verdict_distribution: {
      receipt_terminal_unresolved: 29,
    },
    audited_current_outcomes:
      PLAN040_PACKAGE_6_AUDITED_CURRENT_OUTCOMES,
    current_positive_candidate_count: 0,
    reviewed_terminal_unresolved_candidate_count: 29,
    future_positive_prerequisites:
      input.draft.future_positive_prerequisites,
    reviewer_results: reviewerResults,
    checkpoint_tests: {
      focused_p6: {
        pass: 7,
        fail: 0,
        assertions: 164,
        status: "pass" as const,
      },
      typecheck: { status: "pass" as const },
      validate: {
        issues: 0,
        warnings: 3,
        status: "pass" as const,
      },
      deterministic_replay: {
        sha256:
          PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_DRAFT_SHA256,
        status: "pass" as const,
      },
      full_repository: {
        status:
          "scheduled_after_receipt_persistence_53_candidate_checkpoint" as const,
        timeout_seconds: 900,
        pinned_baseline: {
          classification:
            "known_missing_corpus_environment_family",
          pass: 1665,
          skip: 1,
          fail: 9,
          error: 1,
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
      "plan-040-qbnr-service-pattern-package-6-owner-acceptance-v1",
    accepted_at: input.acceptedAt,
    accepted_by: "codex-owner-delegate",
    gate: {
      path: PACKAGE_6_GATE_PATH,
      sha256: gateSha256,
    },
    artifacts: package6ArtifactPins(),
    candidate_count: 29,
    candidate_key_sha256: candidateKeySha256,
    evidence_verdict_distribution: {
      receipt_terminal_unresolved: 29,
    },
    audited_current_outcomes:
      PLAN040_PACKAGE_6_AUDITED_CURRENT_OUTCOMES,
    reviewer_results: reviewerResults,
    authorized_positive_persistence: {
      candidate_count: 0,
      candidate_keys: [] as string[],
      extent_decision_ids: [] as string[],
      grain_decision_ids: [] as string[],
    },
    authorized_reviewed_absence_receipt: {
      receipt_id:
        "plan-040-qbnr-service-pattern-package-6-reviewed-absence-v1",
      candidate_count: 29,
      candidate_key_sha256: candidateKeySha256,
      candidate_keys: candidateKeys,
      surfaces: ["member_extent", "member_grain"] as const,
      verdict_by_surface: {
        member_extent: "reviewed_terminal_unresolved" as const,
        member_grain: "reviewed_terminal_unresolved" as const,
      },
    },
    future_positive_prerequisites:
      input.draft.future_positive_prerequisites,
    authorization_state:
      "owner_delegate_accepted_exact_29_key_reviewed_absence_only",
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

export function validatePlan040Package6GateAndAcceptance(input: {
  draft: Plan040Package6Draft;
  gate: unknown;
  acceptance: unknown;
  acceptedAt: string;
}) {
  const expected = buildPlan040Package6GateAndAcceptance({
    draft: input.draft,
    acceptedAt: input.acceptedAt,
  });
  if (
    stableJson(input.gate as JsonValue) !==
      stableJson(expected.gate as unknown as JsonValue)
  ) {
    throw new Error("Plan 040 Package 6 dual-review gate drifted");
  }
  if (
    stableJson(input.acceptance as JsonValue) !==
      stableJson(expected.acceptance as unknown as JsonValue)
  ) {
    throw new Error(
      "Plan 040 Package 6 owner/delegate acceptance drifted",
    );
  }
  return {
    candidate_count: 29,
    positive_candidate_count: 0,
    reviewed_terminal_unresolved_candidate_count: 29,
    authorized_extent_decision_count: 0,
    authorized_grain_decision_count: 0,
    authorized_absence_candidate_count: 29,
    persisted_decision_count: 0,
    persisted_absence_receipt_count: 0,
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
  };
}

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_DRAFT_PATH = join(
  repoRoot,
  PACKAGE_6_DRAFT_PATH,
);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_GATE_PATH = join(
  repoRoot,
  PACKAGE_6_GATE_PATH,
);
export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_ACCEPTANCE_PATH =
  join(repoRoot, PACKAGE_6_ACCEPTANCE_PATH);

function writeImmutablePlan040Package6Json(
  path: string,
  value: unknown,
): void {
  const contents = `${stableJson(value as JsonValue)}\n`;
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== contents) {
      throw new Error(
        `Refusing to overwrite immutable Plan 040 Package 6 artifact ` +
        `${relative(repoRoot, path)}`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function writePlan040Package6GateAndAcceptance(input: {
  acceptedAt: string;
}) {
  const draft = JSON.parse(
    readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_DRAFT_PATH,
      "utf8",
    ),
  ) as Plan040Package6Draft;
  const result = buildPlan040Package6GateAndAcceptance({
    draft,
    acceptedAt: input.acceptedAt,
  });
  writeImmutablePlan040Package6Json(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_GATE_PATH,
    result.gate,
  );
  writeImmutablePlan040Package6Json(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_ACCEPTANCE_PATH,
    result.acceptance,
  );
  return {
    gatePath: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_GATE_PATH,
    gateSha256: result.gateSha256,
    acceptancePath:
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_6_ACCEPTANCE_PATH,
    acceptanceSha256: sha256(
      `${stableJson(result.acceptance as unknown as JsonValue)}\n`,
    ),
  };
}
