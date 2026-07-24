import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  memberGrainDecisionKey,
  parseMemberGrainDecision,
  type MemberGrainDecision,
} from "./member-grain-decisions.js";
import {
  extentDecisionKey,
  validateMemberExtentDecision,
  type MemberExtentDecision,
} from "./study-readiness-v1.js";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7 =
  "plan-040-qbnr-service-pattern-package-7-evidence-only-v1" as const;
export const PLAN040_PACKAGE_7_CANDIDATE_KEY_SHA256 =
  "ec3f88006c05651b8760937dac98a5f6e17c0210327dbbeabdcad35cb701e1e0" as const;

export const PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS = {
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
} as const;

export const PLAN040_PACKAGE_7_WAVES = [
  {
    wave_id: "P7-A",
    label: "direct_geometry",
    candidate_count: 9,
    positive_count: 8,
    unresolved_count: 1,
    review_mode: "dual_independent_risk_review",
  },
  {
    wave_id: "P7-B",
    label: "express_shortening",
    candidate_count: 2,
    positive_count: 0,
    unresolved_count: 2,
    review_mode: "dual_independent_risk_review",
  },
  {
    wave_id: "P7-C",
    label: "q43_limited_variant",
    candidate_count: 1,
    positive_count: 0,
    unresolved_count: 1,
    review_mode: "dual_independent_risk_review",
  },
  {
    wave_id: "P7-D",
    label: "express_frequency_or_span",
    candidate_count: 8,
    positive_count: 2,
    unresolved_count: 6,
    review_mode: "dual_independent_risk_review",
  },
] as const;

export type Plan040Package7WaveId =
  (typeof PLAN040_PACKAGE_7_WAVES)[number]["wave_id"];

export const PLAN040_PACKAGE_7_CANDIDATES = [
  ["P7-A", "Q1", "treatment_q1-western-extension-2025", "positive"],
  ["P7-A", "Q12", "treatment_q12-western-reroute-2025", "positive"],
  ["P7-A", "Q16", "treatment_q16-francis-lewis-discontinuation-2025", "positive"],
  ["P7-A", "Q30", "treatment_q30-jamaica-minor-change-2025", "positive"],
  ["P7-A", "Q31", "treatment_q31-bay-terrace-terminal-2025", "unresolved"],
  ["P7-A", "Q31", "treatment_q31-bell-boulevard-reroute-2025", "positive"],
  ["P7-A", "Q77", "treatment_q77-springfield-147-extension-2025", "positive"],
  ["P7-A", "Q88", "treatment_q88-elmhurst-turnaround-2025", "positive"],
  ["P7-A", "Q114", "treatment_q114-jamaica-minor-change-2025", "positive"],
  ["P7-B", "QM12", "treatment_qm12-metropolitan-shortening-2025", "unresolved"],
  ["P7-B", "QM42", "treatment_qm42-metropolitan-shortening-2025", "unresolved"],
  ["P7-C", "Q43", "treatment_q43-limited-discontinuation-2025", "unresolved"],
  ["P7-D", "QM2", "treatment_qm2-frequency-decrease-2025", "unresolved"],
  ["P7-D", "QM8", "treatment_qm8-span-adjustment-2025", "unresolved"],
  ["P7-D", "QM12", "treatment_qm12-frequency-decrease-2025", "positive"],
  ["P7-D", "QM20", "treatment_qm20-frequency-decrease-2025", "unresolved"],
  ["P7-D", "QM21", "treatment_qm21-frequency-decrease-2025", "positive"],
  ["P7-D", "QM32", "treatment_qm32-frequency-span-adjustment-2025", "unresolved"],
  ["P7-D", "QM36", "treatment_qm36-frequency-span-adjustment-2025", "unresolved"],
  ["P7-D", "QM42", "treatment_qm42-frequency-span-adjustment-2025", "unresolved"],
] as const;

export type Plan040Package7RouteId =
  (typeof PLAN040_PACKAGE_7_CANDIDATES)[number][1];
export type Plan040Package7Outcome =
  (typeof PLAN040_PACKAGE_7_CANDIDATES)[number][3];

export type Plan040Package7ChangedRegion = {
  comparison_id: string;
  direction_id: string;
  before_pattern_id: string;
  after_pattern_id: string;
  left_shared_stop_id: string | null;
  right_shared_stop_id: string | null;
  before_stops: Array<{ stop_id: string; stop_name: string }>;
  after_stops: Array<{ stop_id: string; stop_name: string }>;
};

export type Plan040Package7CandidateEvidence = {
  candidate_key: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  treatment_family: "service_pattern";
  gtfs_route_id: Plan040Package7RouteId;
  risk_wave_id: Plan040Package7WaveId;
  expected_outcome: Plan040Package7Outcome;
  immutable_evidence_origin: "package_2" | "package_4";
  immutable_candidate_ref: {
    path: string;
    sha256: string;
    stop_removal_candidate_key: string;
  };
  source_statement: {
    source_id: "mta_queens_bus_network_redesign_service_changes";
    evidence_id: string;
    block_id: string;
    block_sha256: string;
    treatment_kind: string;
    raw_text: string;
  };
  exact_candidate_searches: string[];
  candidate_document: {
    source_id: string;
    source_url: string;
    receipt_sha256: string;
    pdf_sha256: string;
    layout_text_sha256: string;
    raw_text_sha256: string;
    binding_status: "candidate_route_document_exact_nonexclusive";
    document_is_full_stop_chain: false;
    nonexclusive_context: true;
  };
  boundary_inventory: {
    pre: Plan040Package7BoundaryInventory;
    post: Plan040Package7BoundaryInventory;
  };
  schedule_validation: {
    passenger_policy: "any_trip_type_except_2_3_4";
    excluded_nonrevenue_trip_types: ["2", "3", "4"];
    pre: Record<string, JsonValue>;
    post: Record<string, JsonValue>;
    every_selected_pattern_is_schedule_validated_passenger: true;
  };
  ordered_full_stop_evidence: {
    equivalence_basis: "identical_stop_id_only";
    pre_patterns: Array<Record<string, JsonValue>>;
    post_patterns: Array<Record<string, JsonValue>>;
    comparisons: Array<Record<string, JsonValue>>;
    candidate_changed_regions: Plan040Package7ChangedRegion[];
    nonexclusive_full_route_context: true;
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
  nonexclusive_context_codes: string[];
  evidence_verdict:
    | "evidence_complete_positive_draft"
    | "receipt_terminal_unresolved";
  proposed_extent_decision: MemberExtentDecision | null;
  proposed_grain_decision: MemberGrainDecision | null;
  persisted_extent_decision: null;
  persisted_grain_decision: null;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package7BoundaryInventory = {
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
  ordered_full_stop_pattern_count: number;
  ordered_full_stop_pattern_trip_count: number;
  receipt_path: string;
  receipt_sha256: string;
  zip_sha1: string;
  zip_sha256: string;
};

export type Plan040Package7Draft = {
  schema_version: 1;
  package_id: typeof PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7;
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 20;
  route_count: 17;
  candidate_key_sha256:
    typeof PLAN040_PACKAGE_7_CANDIDATE_KEY_SHA256;
  wave_partition: typeof PLAN040_PACKAGE_7_WAVES;
  evidence_verdict_distribution: {
    evidence_complete_positive_draft: 10;
    receipt_terminal_unresolved: 10;
  };
  proposed_extent_distribution: {
    bounded_segment: 8;
    route_wide: 2;
    unresolved: 10;
  };
  proposed_grain_distribution: {
    periods: 2;
    trip_subset: 8;
    unresolved: 10;
  };
  proposed_extent_decision_count: 10;
  proposed_grain_decision_count: 10;
  persisted_extent_decision_count: 0;
  persisted_grain_decision_count: 0;
  exclusions: {
    prior_package_overlap: Record<
      "package_2" | "package_4" | "package_5" | "package_6" | "exemplar",
      0
    >;
    existing_phase_1_absence_decision_count: 16;
    existing_phase_1_absence_overlap_count: 0;
    reused_positive_stop_removal_context_count: 1;
    reused_positive_stop_removal_overlap_count: 0;
    unrelated_occurrence_inference_count: 0;
  };
  candidates: Plan040Package7CandidateEvidence[];
  equivalence_policy: {
    automatic_equivalence: "identical_stop_id_only";
    changed_id_name_coordinate_or_proximity_equivalence: false;
    route_document_or_schedule_presence_can_infer_occurrence: false;
  };
  authorization_state:
    "evidence_and_decision_draft_pending_dual_independent_wave_review_no_gate_no_acceptance_no_persistence";
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export function plan040Package7ReplayHash(value: JsonValue): string {
  return sha256(`${stableJson(value)}\n`);
}

export function buildPlan040Package7Draft(input: {
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package7CandidateEvidence[];
  priorCandidateKeys: Record<
    "package_2" | "package_4" | "package_5" | "package_6" | "exemplar",
    string[]
  >;
  existingPhase1AbsenceKeys: string[];
  reusedPositiveStopRemovalKeys: string[];
}): Plan040Package7Draft {
  const expected = new Map<string, {
    waveId: Plan040Package7WaveId;
    routeId: Plan040Package7RouteId;
    outcome: Plan040Package7Outcome;
  }>(
    PLAN040_PACKAGE_7_CANDIDATES.map(
      ([waveId, routeId, treatmentId, outcome]) => [
        treatmentId,
        { waveId, routeId, outcome },
      ],
    ),
  );
  const byTreatment = new Map(input.candidates.map((candidate) => [
    candidate.treatment_record_id,
    candidate,
  ]));
  if (
    input.candidates.length !== 20 ||
    byTreatment.size !== 20 ||
    [...expected.keys()].some((id) => !byTreatment.has(id))
  ) {
    throw new Error("Plan 040 Package 7 requires exact 20-treatment parity");
  }
  const candidates = PLAN040_PACKAGE_7_CANDIDATES.map(([, , id]) =>
    byTreatment.get(id)!);
  const keys = candidates.map((candidate) => candidate.candidate_key).sort();
  if (
    new Set(keys).size !== 20 ||
    sha256(`${keys.join("\n")}\n`) !==
      PLAN040_PACKAGE_7_CANDIDATE_KEY_SHA256
  ) {
    throw new Error("Plan 040 Package 7 candidate-key scope drifted");
  }
  if (new Set(candidates.map((candidate) => candidate.gtfs_route_id)).size !== 17) {
    throw new Error("Plan 040 Package 7 requires exact 17-route parity");
  }

  for (const candidate of candidates) {
    const specification = expected.get(candidate.treatment_record_id)!;
    if (
      candidate.risk_wave_id !== specification.waveId ||
      candidate.gtfs_route_id !== specification.routeId ||
      candidate.expected_outcome !== specification.outcome ||
      candidate.treatment_family !== "service_pattern" ||
      candidate.ledger_snapshot.extent_verdict !== "unreviewed" ||
      candidate.ledger_snapshot.grain_verdict !== "unreviewed" ||
      candidate.ledger_snapshot.current_extent_kind !== "unresolved" ||
      candidate.ledger_snapshot.extent_receipt_ids.length !== 0 ||
      candidate.ledger_snapshot.grain_receipt_ids.length !== 0 ||
      candidate.ledger_snapshot.extent_decision_id !== null ||
      candidate.ledger_snapshot.grain_decision_id !== null ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence ||
      candidate.source_statement.raw_text.trim().length === 0 ||
      candidate.source_statement.evidence_id.trim().length === 0 ||
      candidate.exact_candidate_searches.length === 0 ||
      !candidate.boundary_inventory.pre.calendar_and_calendar_dates_expanded ||
      !candidate.boundary_inventory.post.calendar_and_calendar_dates_expanded ||
      !candidate.schedule_validation
        .every_selected_pattern_is_schedule_validated_passenger ||
      candidate.ordered_full_stop_evidence.equivalence_basis !==
        "identical_stop_id_only" ||
      candidate.ordered_full_stop_evidence.pre_patterns.length === 0 ||
      candidate.ordered_full_stop_evidence.post_patterns.length === 0
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: evidence, ledger, or authority scope drifted`,
      );
    }

    if (candidate.expected_outcome === "positive") {
      if (
        candidate.evidence_verdict !== "evidence_complete_positive_draft" ||
        !candidate.proposed_extent_decision ||
        !candidate.proposed_grain_decision ||
        candidate.unresolved_gap_codes.length !== 0
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: positive draft parity drifted`,
        );
      }
      validateMemberExtentDecision(candidate.proposed_extent_decision);
      const componentKeys = candidate.proposed_extent_decision.components.map(
        (component) => stableJson(component as unknown as JsonValue),
      );
      if (new Set(componentKeys).size !== componentKeys.length) {
        throw new Error(
          `${candidate.treatment_record_id}: duplicate exact extent components`,
        );
      }
      for (
        let leftIndex = 0;
        leftIndex < candidate.proposed_extent_decision.components.length;
        leftIndex += 1
      ) {
        const left =
          candidate.proposed_extent_decision.components[leftIndex]!;
        const leftIds = new Set(left.identifiers);
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < candidate.proposed_extent_decision.components.length;
          rightIndex += 1
        ) {
          const right =
            candidate.proposed_extent_decision.components[rightIndex]!;
          if (
            left.component_kind !== right.component_kind ||
            left.description !== right.description
          ) {
            continue;
          }
          const rightIds = new Set(right.identifiers);
          const leftNested =
            leftIds.size < rightIds.size &&
            left.identifiers.every((id) => rightIds.has(id));
          const rightNested =
            rightIds.size < leftIds.size &&
            right.identifiers.every((id) => leftIds.has(id));
          if (leftNested || rightNested) {
            throw new Error(
              `${candidate.treatment_record_id}: nested extent component identifier sets`,
            );
          }
        }
      }
      const grain = parseMemberGrainDecision(
        candidate.proposed_grain_decision,
        candidate.treatment_record_id,
      );
      if (
        extentDecisionKey(candidate.proposed_extent_decision) !==
          candidate.candidate_key ||
        memberGrainDecisionKey(grain) !== candidate.candidate_key ||
        grain.member_extent_decision_id !==
          candidate.proposed_extent_decision.decision_id
      ) {
        throw new Error(
          `${candidate.treatment_record_id}: extent/grain decision link drifted`,
        );
      }
    } else if (
      candidate.evidence_verdict !== "receipt_terminal_unresolved" ||
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.unresolved_gap_codes.length === 0
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: unresolved fail-closed scope drifted`,
      );
    }
  }

  for (const wave of PLAN040_PACKAGE_7_WAVES) {
    const rows = candidates.filter((candidate) =>
      candidate.risk_wave_id === wave.wave_id);
    if (
      rows.length !== wave.candidate_count ||
      rows.filter((candidate) => candidate.expected_outcome === "positive")
          .length !== wave.positive_count ||
      rows.filter((candidate) => candidate.expected_outcome === "unresolved")
          .length !== wave.unresolved_count
    ) {
      throw new Error(`${wave.wave_id}: risk-wave outcome parity drifted`);
    }
  }

  const candidateKeySet = new Set(keys);
  for (const [packageId, priorKeys] of Object.entries(input.priorCandidateKeys)) {
    if (priorKeys.some((key) => candidateKeySet.has(key))) {
      throw new Error(`Plan 040 Package 7 overlaps ${packageId}`);
    }
  }
  if (
    input.existingPhase1AbsenceKeys.length !== 16 ||
    input.reusedPositiveStopRemovalKeys.length !== 1 ||
    input.existingPhase1AbsenceKeys.some((key) => candidateKeySet.has(key)) ||
    input.reusedPositiveStopRemovalKeys.some((key) =>
      candidateKeySet.has(key))
  ) {
    throw new Error(
      "Plan 040 Package 7 existing Phase 1 decision exclusions drifted",
    );
  }

  return {
    schema_version: 1,
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7,
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 20,
    route_count: 17,
    candidate_key_sha256: PLAN040_PACKAGE_7_CANDIDATE_KEY_SHA256,
    wave_partition: PLAN040_PACKAGE_7_WAVES,
    evidence_verdict_distribution: {
      evidence_complete_positive_draft: 10,
      receipt_terminal_unresolved: 10,
    },
    proposed_extent_distribution: {
      bounded_segment: 8,
      route_wide: 2,
      unresolved: 10,
    },
    proposed_grain_distribution: {
      periods: 2,
      trip_subset: 8,
      unresolved: 10,
    },
    proposed_extent_decision_count: 10,
    proposed_grain_decision_count: 10,
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    exclusions: {
      prior_package_overlap: {
        package_2: 0,
        package_4: 0,
        package_5: 0,
        package_6: 0,
        exemplar: 0,
      },
      existing_phase_1_absence_decision_count: 16,
      existing_phase_1_absence_overlap_count: 0,
      reused_positive_stop_removal_context_count: 1,
      reused_positive_stop_removal_overlap_count: 0,
      unrelated_occurrence_inference_count: 0,
    },
    candidates,
    equivalence_policy: {
      automatic_equivalence: "identical_stop_id_only",
      changed_id_name_coordinate_or_proximity_equivalence: false,
      route_document_or_schedule_presence_can_infer_occurrence: false,
    },
    authorization_state:
      "evidence_and_decision_draft_pending_dual_independent_wave_review_no_gate_no_acceptance_no_persistence",
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}
