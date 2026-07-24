import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import type { JsonValue } from "../../../db/src/types";
import {
  PLAN040_PACKAGE_9_CANDIDATES,
  PLAN040_PACKAGE_9_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_9_EXPECTED_OUTCOMES,
  PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS,
  PLAN040_PACKAGE_9_INVENTORY_TRANSITIONS,
  PLAN040_PACKAGE_9_WAVES,
  buildPlan040Package9Draft,
  plan040Package9ReplayHash,
  type Plan040Package9CandidateEvidence,
  type Plan040Package9Draft,
} from "../../src/quality/plan040-qbnr-service-pattern-package9";
import { extentDecisionKey } from "../../src/quality/study-readiness-v1";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const evidencePath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-9-evidence-v1.json`;
const draftPath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-9-evidence-draft-v1.json`;
const EVIDENCE_SHA256 =
  "6869e20c3229d6acf1ddb5269c59a26e5d85800efa24ca227ab953df4cb46e86";
const DRAFT_SHA256 =
  "db10ffe52f43f466774764fbd65339f669a61770cde0372e08807db8d5c06a67";

type Package9Evidence = {
  candidate_count: number;
  route_count: number;
  candidate_key_sha256: string;
  wave_partition: typeof PLAN040_PACKAGE_9_WAVES;
  current_outcome_distribution: {
    evidence_complete_positive_draft: number;
    receipt_terminal_unresolved: number;
  };
  immutable_inputs: {
    main_schedule_source: { source_id: string; path: string; sha256: string };
    accepted_launch_feeds: Array<Record<string, JsonValue>>;
  };
  candidates: Plan040Package9CandidateEvidence[];
  exclusion_checks: Record<string, {
    prior_candidate_count: number;
    overlap_count: number;
  }>;
  version_separation: Plan040Package9Draft["version_separation"];
  authorization_state: string;
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const priorKeys = (path: string): string[] => {
  const parsed = readJson<{
    candidates?: Array<{ candidate_key: string }>;
    decisions?: Array<{
      occurrence_id: string;
      route_record_id: string;
      treatment_record_id: string;
    }>;
  }>(path);
  return parsed.candidates?.map((candidate) => candidate.candidate_key) ??
    parsed.decisions?.map(extentDecisionKey) ??
    [];
};
const clone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
const buildInput = (
  evidence: Package9Evidence,
  candidates = evidence.candidates,
) => ({
  evidenceManifestPath:
    "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-9-evidence-v1.json",
  evidenceManifestSha256: EVIDENCE_SHA256,
  candidates,
  versionSeparation: evidence.version_separation,
  priorCandidateKeys: {
    exemplar: priorKeys(
      `${repoRoot}/data/quality/operational-reference/` +
      "member-extent-ledger-decisions/plan-040-exemplar-v1.json",
    ),
    package_2: priorKeys(
      `${riskRoot}/plan-040-qbnr-stop-removal-package-2-decision-draft-v1.json`,
    ),
    package_4: priorKeys(
      `${riskRoot}/plan-040-qbnr-stop-removal-package-4-evidence-draft-v1.json`,
    ),
    package_5: priorKeys(
      `${riskRoot}/plan-040-qbnr-stop-removal-package-5-evidence-draft-v1.json`,
    ),
    package_6: priorKeys(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-6-evidence-draft-v1.json`,
    ),
    package_7: priorKeys(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-7-evidence-draft-v1.json`,
    ),
    package_8: priorKeys(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-8-evidence-draft-v1.json`,
    ),
  },
});

describe("Plan 040 QBNR Package 9 accelerated lineage-risk freeze", () => {
  it("freezes the exact 22 candidates as two 11-row waves", () => {
    const evidenceBytes = readFileSync(evidencePath);
    const draftBytes = readFileSync(draftPath);
    const evidence = JSON.parse(
      evidenceBytes.toString("utf8"),
    ) as Package9Evidence;
    const draft = JSON.parse(
      draftBytes.toString("utf8"),
    ) as Plan040Package9Draft;

    expect(sha256(evidenceBytes)).toBe(EVIDENCE_SHA256);
    expect(sha256(draftBytes)).toBe(DRAFT_SHA256);
    expect(plan040Package9ReplayHash(
      draft as unknown as JsonValue,
    )).toBe(DRAFT_SHA256);
    expect(evidence.candidate_count).toBe(22);
    expect(evidence.route_count).toBe(10);
    expect(evidence.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_9_CANDIDATE_KEY_SHA256,
    );
    expect(draft.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_9_CANDIDATE_KEY_SHA256,
    );
    expect(evidence.wave_partition).toEqual(PLAN040_PACKAGE_9_WAVES);
    expect(draft.wave_partition).toEqual(PLAN040_PACKAGE_9_WAVES);
    expect(draft.candidates.map((candidate) => [
      candidate.risk_wave_id,
      candidate.gtfs_route_id,
      candidate.treatment_record_id,
    ])).toEqual(PLAN040_PACKAGE_9_CANDIDATES);
    expect(PLAN040_PACKAGE_9_WAVES.map((wave) => {
      const rows = draft.candidates.filter((candidate) =>
        candidate.risk_wave_id === wave.wave_id);
      return [
        rows.length,
        new Set(rows.map((candidate) => candidate.gtfs_route_id)).size,
      ];
    })).toEqual([[11, 6], [11, 4]]);
  });

  it("records assessed supportability as two positive drafts and 20 exact gaps", () => {
    const draft = readJson<Plan040Package9Draft>(draftPath);
    expect(draft.evidence_verdict_distribution).toEqual({
      evidence_complete_positive_draft: 2,
      receipt_terminal_unresolved: 20,
    });
    expect(draft.proposed_extent_distribution).toEqual({
      route_wide: 2,
      unresolved: 20,
    });
    expect(draft.proposed_grain_distribution).toEqual({
      all_service: 1,
      periods: 1,
      unresolved: 20,
    });
    const positives = draft.candidates.filter((candidate) =>
      candidate.evidence_verdict ===
        "evidence_complete_positive_draft");
    expect(positives.map((candidate) =>
      candidate.treatment_record_id).sort()).toEqual([
      "treatment_qm63-frequency-span-adjustment-2025",
      "treatment_qm63-route-rename-2025",
    ]);
    for (const candidate of draft.candidates) {
      const expected =
        PLAN040_PACKAGE_9_EXPECTED_OUTCOMES[
          candidate.treatment_record_id
        ];
      if (expected === "positive") {
        expect(candidate.proposed_extent_decision).not.toBeNull();
        expect(candidate.proposed_grain_decision).not.toBeNull();
        expect(candidate.unresolved_gap_codes).toEqual([]);
      } else {
        expect(candidate.evidence_verdict).toBe(
          "receipt_terminal_unresolved",
        );
        expect(candidate.proposed_extent_decision).toBeNull();
        expect(candidate.proposed_grain_decision).toBeNull();
        expect(candidate.unresolved_gap_codes.length).toBeGreaterThan(0);
        expect(candidate.service_modality_assessment.blocking_gap_codes)
          .toEqual(candidate.unresolved_gap_codes);
      }
    }
  });

  it("makes every inventory transition explicit without silent equivalence", () => {
    const draft = readJson<Plan040Package9Draft>(draftPath);
    for (const candidate of draft.candidates) {
      const transition = candidate.inventory_transition;
      expect(transition).toEqual(expect.objectContaining(
        PLAN040_PACKAGE_9_INVENTORY_TRANSITIONS[
          candidate.gtfs_route_id
        ],
      ));
      expect(transition.same_feed_family_is_identity).toBe(false);
      expect(transition.same_route_id_is_identity).toBe(false);
      expect(transition.cross_feed_family_equivalence_authorized).toBe(
        false,
      );
      expect(
        transition.automatic_predecessor_route_id_equivalence_authorized,
      ).toBe(false);
      if (candidate.risk_wave_id === "P9-A") {
        expect(transition.classification).toBe(
          "same_family_same_route_id",
        );
      }
    }
    const p9B = Object.fromEntries(
      draft.candidates.filter((candidate) =>
        candidate.risk_wave_id === "P9-B").map((candidate) => [
        candidate.gtfs_route_id,
        candidate.inventory_transition,
      ]),
    );
    expect(p9B.Q26).toEqual(expect.objectContaining({
      pre_feed_family: "queens",
      post_feed_family: "busco",
      pre_route_id: "Q26",
      post_route_id: "Q26",
      classification: "cross_feed_family_same_route_id",
    }));
    expect(p9B.Q38).toEqual(expect.objectContaining({
      pre_feed_family: "busco",
      post_feed_family: "queens",
      pre_route_id: "Q38",
      post_route_id: "Q38",
      classification: "cross_feed_family_same_route_id",
    }));
    expect(p9B.QM63).toEqual(expect.objectContaining({
      pre_feed_family: "queens",
      post_feed_family: "queens",
      pre_route_id: "X63",
      post_route_id: "QM63",
      classification: "same_family_predecessor_route_rename",
    }));
    expect(p9B.QM68).toEqual(expect.objectContaining({
      pre_feed_family: "queens",
      post_feed_family: "queens",
      pre_route_id: "X68",
      post_route_id: "QM68",
      classification: "same_family_predecessor_route_rename",
    }));
  });

  it("separates explicit X63-to-QM63 lineage from automatic ID equivalence", () => {
    const draft = readJson<Plan040Package9Draft>(draftPath);
    const qmRows = draft.candidates.filter((candidate) =>
      candidate.gtfs_route_id === "QM63");
    expect(qmRows).toHaveLength(4);
    for (const candidate of qmRows) {
      expect(candidate.inventory_transition
        .reviewed_predecessor_successor_lineage_authorized).toBe(true);
      expect(candidate.lineage_review.same_member_lineage_authorized).toBe(
        true,
      );
      expect(
        candidate.lineage_review.automatic_route_id_equivalence_authorized,
      ).toBe(false);
      expect(candidate.inventory_transition.explicit_route_rename_statement)
        .toEqual(expect.objectContaining({
          treatment_record_id: "treatment_qm63-route-rename-2025",
          raw_text: "The X63 will be renamed the QM63.",
        }));
    }
    const rename = qmRows.find((candidate) =>
      candidate.treatment_record_id ===
        "treatment_qm63-route-rename-2025")!;
    expect(rename.service_modality_assessment.assessment_status).toBe(
      "complete_route_wide_all_service",
    );
    expect(rename.proposed_extent_decision?.resolution).toBe("route_wide");
    expect(rename.proposed_grain_decision?.service_scope).toEqual({
      kind: "all_service",
    });
    expect(rename.proposed_grain_decision?.lineage_segments).toHaveLength(
      2,
    );
  });

  it("binds the QM63 frequency/span draft to exact trips, spans, and periods", () => {
    const evidence = readJson<Package9Evidence>(evidencePath);
    const frequency = evidence.candidates.find((candidate) =>
      candidate.treatment_record_id ===
        "treatment_qm63-frequency-span-adjustment-2025")!;
    const assessment = frequency.service_modality_assessment;
    expect(evidence.immutable_inputs.main_schedule_source.sha256).toBe(
      PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.main_schedule_source,
    );
    expect(assessment.assessment_status).toBe(
      "complete_route_wide_structured_periods",
    );
    expect(assessment.structured_periods).toEqual([
      "am_peak",
      "evening",
      "off_period",
      "pm_peak",
    ]);
    expect(assessment.structured_directions).toEqual(["0", "1"]);
    expect(assessment.exact_pre_span?.by_direction.map((row) => [
      row.direction,
      row.first_departure,
      row.last_departure,
      row.trip_count,
    ])).toEqual([
      ["E", "2025-06-27T15:49:00.000", "2025-06-27T19:00:00.000", 14],
      ["W", "2025-06-27T05:21:00.000", "2025-06-27T08:10:00.000", 11],
    ]);
    expect(assessment.exact_post_span?.by_direction.map((row) => [
      row.direction,
      row.first_departure,
      row.last_departure,
      row.trip_count,
    ])).toEqual([
      ["E", "2025-06-30T15:50:00.000", "2025-06-30T19:00:00.000", 13],
      ["W", "2025-06-30T05:20:00.000", "2025-06-30T08:15:00.000", 11],
    ]);
    expect(frequency.proposed_extent_decision?.resolution).toBe(
      "route_wide",
    );
    expect(frequency.proposed_grain_decision?.service_scope).toEqual({
      kind: "periods",
      periods: assessment.structured_periods,
      directions: assessment.structured_directions,
      pattern_ids: assessment.structured_pattern_ids,
    });
  });

  it("carries only nonempty stop IDs and exact identical-stop equivalences", () => {
    const draft = readJson<Plan040Package9Draft>(draftPath);
    for (const candidate of draft.candidates) {
      const patterns = [
        ...candidate.ordered_full_stop_evidence.pre_patterns,
        ...candidate.ordered_full_stop_evidence.post_patterns,
      ];
      for (const pattern of patterns) {
        expect(Array.isArray(pattern.stops)).toBe(true);
        for (
          const stop of pattern.stops as Array<Record<string, JsonValue>>
        ) {
          expect(String(stop.stop_id).trim()).not.toBe("");
        }
      }
      for (
        const comparison of
          candidate.ordered_full_stop_evidence.comparisons
      ) {
        for (
          const equivalence of comparison.equivalences as
            Array<Record<string, JsonValue>>
        ) {
          expect(equivalence.equivalence_basis).toBe(
            "identical_stop_id",
          );
          expect(equivalence.before_stop_id).toBe(
            equivalence.after_stop_id,
          );
          expect(String(equivalence.before_stop_id).trim()).not.toBe("");
        }
      }
    }
  });

  it("remains draft-only, nonauthorizing, and disjoint from prior packages", () => {
    const evidence = readJson<Package9Evidence>(evidencePath);
    const draft = readJson<Plan040Package9Draft>(draftPath);
    expect(Object.values(draft.prior_package_overlap)).toEqual(
      Array(7).fill(0),
    );
    expect(Object.values(evidence.exclusion_checks).map((row) =>
      row.overlap_count)).toEqual(Array(7).fill(0));
    expect(draft.persisted_extent_decision_count).toBe(0);
    expect(draft.persisted_grain_decision_count).toBe(0);
    expect(draft.review_protocol).toEqual({
      dual_independent_review_required: true,
      review_unit: "P9-A_and_P9-B",
      owner_gate_allowed_before_dual_review: false,
      persistence_allowed_before_owner_gate: false,
    });
    for (const value of [evidence, draft, ...draft.candidates]) {
      expect(value.authorizes_occurrence).toBe(false);
      expect(value.authorizes_study).toBe(false);
      expect(value.authorizes_cross_product).toBe(false);
      expect(value.authorizes_decision_persistence).toBe(false);
    }
    expect(evidence.external_acquisition_performed).toBe(false);
  });

  it("rebuilds deterministically and fails closed on structural drift", () => {
    const evidence = readJson<Package9Evidence>(evidencePath);
    const rebuilt = buildPlan040Package9Draft(buildInput(evidence));
    expect(rebuilt).toEqual(readJson<Plan040Package9Draft>(draftPath));

    const alteredTransition = clone(evidence.candidates);
    alteredTransition[0]!.inventory_transition.pre_feed_family = "busco";
    expect(() =>
      buildPlan040Package9Draft(
        buildInput(evidence, alteredTransition),
      )).toThrow("evidence or authority scope drifted");

    const alteredStop = clone(evidence.candidates);
    const firstPattern =
      alteredStop[0]!.ordered_full_stop_evidence.pre_patterns[0]!;
    (firstPattern.stops as Array<Record<string, JsonValue>>)[0]!.stop_id =
      "";
    expect(() =>
      buildPlan040Package9Draft(
        buildInput(evidence, alteredStop),
      )).toThrow("lacks an exact stop ID");

    const alteredEquivalence = clone(evidence.candidates);
    const candidateWithEquivalence = alteredEquivalence.find((candidate) =>
      candidate.ordered_full_stop_evidence.comparisons.some(
        (comparison) =>
          Array.isArray(comparison.equivalences) &&
          comparison.equivalences.length > 0,
      ))!;
    const comparison = candidateWithEquivalence
      .ordered_full_stop_evidence.comparisons.find((row) =>
        Array.isArray(row.equivalences) &&
        row.equivalences.length > 0)!;
    const equivalence =
      (comparison.equivalences as Array<Record<string, JsonValue>>)[0]!;
    equivalence.equivalence_basis = "name_and_coordinate";
    expect(() =>
      buildPlan040Package9Draft(
        buildInput(evidence, alteredEquivalence),
      )).toThrow("forbidden non-identical-stop equivalence");

    const hiddenUnmatched = clone(evidence.candidates);
    const q26 = hiddenUnmatched.find((candidate) =>
      candidate.gtfs_route_id === "Q26")!;
    q26.schedule_trip_type_validation.post_unmatched_pattern_count = 0;
    expect(() =>
      buildPlan040Package9Draft(
        buildInput(evidence, hiddenUnmatched),
      )).toThrow("silently dropped");

    const unauthorized = clone(evidence.candidates);
    unauthorized[0]!.authorizes_study = true as false;
    expect(() =>
      buildPlan040Package9Draft(
        buildInput(evidence, unauthorized),
      )).toThrow("evidence or authority scope drifted");
  });
});
