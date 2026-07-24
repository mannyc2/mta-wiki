import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import type { JsonValue } from "../../../db/src/types";
import {
  memberGrainDecisionKey,
  parseMemberGrainDecision,
} from "../../src/quality/member-grain-decisions";
import {
  PLAN040_PACKAGE_7_APPROVED_COMMIT,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_ACCEPTANCE_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_GATE_PATH,
  buildPlan040Package7GateAndAcceptance,
  validatePlan040Package7GateAndAcceptance,
} from "../../src/quality/plan040-qbnr-service-pattern-package7-closeout";
import {
  PLAN040_PACKAGE_7_CANDIDATES,
  PLAN040_PACKAGE_7_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS,
  PLAN040_PACKAGE_7_WAVES,
  buildPlan040Package7Draft,
  plan040Package7ReplayHash,
  type Plan040Package7CandidateEvidence,
  type Plan040Package7Draft,
} from "../../src/quality/plan040-qbnr-service-pattern-package7";
import {
  extentDecisionKey,
  validateMemberExtentDecision,
} from "../../src/quality/study-readiness-v1";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const evidencePath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-7-evidence-v1.json`;
const draftPath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-7-evidence-draft-v1.json`;
const p2DraftPath =
  `${riskRoot}/plan-040-qbnr-stop-removal-package-2-decision-draft-v1.json`;
const p4DraftPath =
  `${riskRoot}/plan-040-qbnr-stop-removal-package-4-evidence-draft-v1.json`;
const p5DraftPath =
  `${riskRoot}/plan-040-qbnr-stop-removal-package-5-evidence-draft-v1.json`;
const p6DraftPath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-6-evidence-draft-v1.json`;
const exemplarPath =
  `${repoRoot}/data/quality/operational-reference/` +
  "member-extent-ledger-decisions/plan-040-exemplar-v1.json";
const extentLedgerPath =
  `${repoRoot}/data/quality/operational-reference/member-extent-ledger.jsonl`;
const grainLedgerPath =
  `${repoRoot}/data/quality/operational-reference/member-grain-ledger.jsonl`;

const EVIDENCE_SHA256 =
  "ae2b3885a7a534a754e6b9f54868cd604dd5983e993bccbf210fe5e4f13281a2";
const DRAFT_SHA256 =
  "ee62990a38ebb787cf009ea1236618bf69cfd4e5bdbc32ce94bbc1720ed224a8";

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const readJsonl = (path: string): Array<Record<string, unknown>> => {
  const text = readFileSync(path, "utf8").trim();
  return text
    ? text.split("\n").map((line) =>
      JSON.parse(line) as Record<string, unknown>)
    : [];
};

type Package7Evidence = {
  immutable_reuse: {
    package_2: Record<"acquisition" | "evidence" | "draft", {
      path: string;
      sha256: string;
    }>;
    package_4: Record<"acquisition" | "evidence" | "draft", {
      path: string;
      sha256: string;
    }>;
    reacquisition_performed: false;
    source_bytes_recomputed: false;
  };
  accepted_launch_feed_identities: Array<{
    boundary: "pre" | "post";
    family: "queens" | "busco";
    source_id: string;
    zip_sha1: string;
    zip_sha256: string;
    receipt_sha256: string;
  }>;
  candidate_count: number;
  route_count: number;
  candidate_key_sha256: string;
  wave_partition: typeof PLAN040_PACKAGE_7_WAVES;
  current_outcome_distribution: Record<string, number>;
  pristine_ledger_inputs: {
    extent: { path: string; sha256: string };
    grain: { path: string; sha256: string };
  };
  existing_phase_1_terminal_context: {
    absence_decision_count: number;
    absence_decision_keys: string[];
    reused_positive_stop_removal_context_count: number;
    reused_positive_stop_removal_keys: string[];
    candidate_key_overlap_count: number;
  };
  exclusion_checks: Record<string, {
    prior_candidate_count: number;
    overlap_count: number;
  }>;
  equivalence_policy: {
    automatic_equivalence: string;
    changed_id_name_coordinate_or_proximity_equivalence: boolean;
    route_document_or_schedule_presence_can_infer_occurrence: boolean;
  };
  candidates: Plan040Package7CandidateEvidence[];
  authorization_state: string;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const priorKeys = (path: string): string[] => {
  const parsed = readJson<{
    candidates?: Array<{ candidate_key: string }>;
    decisions?: Array<{
      occurrence_id: string;
      route_record_id: string;
      treatment_record_id: string;
    }>;
  }>(path);
  return (
    parsed.candidates?.map((candidate) => candidate.candidate_key) ??
      parsed.decisions?.map(extentDecisionKey) ??
      []
  ).sort();
};

const buildInput = (
  evidence: Package7Evidence,
  candidates = evidence.candidates,
) => ({
  evidenceManifestPath:
    "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-7-evidence-v1.json",
  evidenceManifestSha256: EVIDENCE_SHA256,
  candidates,
  priorCandidateKeys: {
    package_2: priorKeys(p2DraftPath),
    package_4: priorKeys(p4DraftPath),
    package_5: priorKeys(p5DraftPath),
    package_6: priorKeys(p6DraftPath),
    exemplar: priorKeys(exemplarPath),
  },
  existingPhase1AbsenceKeys:
    evidence.existing_phase_1_terminal_context.absence_decision_keys,
  reusedPositiveStopRemovalKeys:
    evidence.existing_phase_1_terminal_context
      .reused_positive_stop_removal_keys,
});

describe("Plan 040 QBNR Package 7 accelerated evidence and decision draft", () => {
  it("freezes the exact 20 candidates, 17 routes, and four risk waves", () => {
    const evidenceBytes = readFileSync(evidencePath);
    const draftBytes = readFileSync(draftPath);
    const evidence = JSON.parse(
      evidenceBytes.toString("utf8"),
    ) as Package7Evidence;
    const draft = JSON.parse(
      draftBytes.toString("utf8"),
    ) as Plan040Package7Draft;

    expect(sha256(evidenceBytes)).toBe(EVIDENCE_SHA256);
    expect(sha256(draftBytes)).toBe(DRAFT_SHA256);
    expect(plan040Package7ReplayHash(
      draft as unknown as JsonValue,
    )).toBe(DRAFT_SHA256);
    expect(evidence.candidate_count).toBe(20);
    expect(evidence.route_count).toBe(17);
    expect(draft.candidate_count).toBe(20);
    expect(draft.route_count).toBe(17);
    expect(draft.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_7_CANDIDATE_KEY_SHA256,
    );
    expect(evidence.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_7_CANDIDATE_KEY_SHA256,
    );
    expect(draft.wave_partition).toEqual(PLAN040_PACKAGE_7_WAVES);
    expect(evidence.wave_partition).toEqual(PLAN040_PACKAGE_7_WAVES);
    expect(draft.candidates.map((candidate) => [
      candidate.risk_wave_id,
      candidate.gtfs_route_id,
      candidate.treatment_record_id,
      candidate.expected_outcome,
    ])).toEqual(PLAN040_PACKAGE_7_CANDIDATES);
    expect(new Set(draft.candidates.map((candidate) =>
      candidate.gtfs_route_id)).size).toBe(17);
    expect(PLAN040_PACKAGE_7_WAVES.map((wave) => {
      const rows = draft.candidates.filter((candidate) =>
        candidate.risk_wave_id === wave.wave_id);
      return [
        rows.length,
        rows.filter((candidate) =>
          candidate.expected_outcome === "positive").length,
        rows.filter((candidate) =>
          candidate.expected_outcome === "unresolved").length,
      ];
    })).toEqual([
      [9, 8, 1],
      [2, 0, 2],
      [1, 0, 1],
      [8, 2, 6],
    ]);
  });

  it("reuses immutable P2/P4 bytes and pins all four accepted feeds", () => {
    const evidence = readJson<Package7Evidence>(evidencePath);
    expect(evidence.immutable_reuse).toEqual({
      package_2: {
        acquisition: expect.objectContaining({
          sha256:
            PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_2.acquisition,
        }),
        evidence: expect.objectContaining({
          sha256:
            PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_2.evidence,
        }),
        draft: expect.objectContaining({
          sha256:
            PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_2.draft,
        }),
      },
      package_4: {
        acquisition: expect.objectContaining({
          sha256:
            PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_4.acquisition,
        }),
        evidence: expect.objectContaining({
          sha256:
            PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_4.evidence,
        }),
        draft: expect.objectContaining({
          sha256:
            PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_4.draft,
        }),
      },
      reacquisition_performed: false,
      source_bytes_recomputed: false,
    });
    expect(evidence.accepted_launch_feed_identities.map((feed) => [
      feed.family,
      feed.boundary,
      feed.source_id,
      feed.zip_sha1,
    ])).toEqual([
      [
        "queens",
        "pre",
        "gtfs_static_20250615_queens_pre_qbnr",
        "c96466458c55036cd6feeadc291bf5951d6c3274",
      ],
      [
        "busco",
        "pre",
        "gtfs_static_20250625_busco_pre_qbnr",
        "a52f278150cd9bc03082f76fccd57f1c8c331d3c",
      ],
      [
        "queens",
        "post",
        "gtfs_static_20250626_queens_post_qbnr",
        "c868290ddcd79c69712d809ece96d96dbad2c613",
      ],
      [
        "busco",
        "post",
        "gtfs_static_20250626_busco_post_qbnr",
        "54653b3fafb5fabc5ab1c941780b871343138440",
      ],
    ]);
  });

  it("expands exact launch dates and binds only passenger full-stop chains", () => {
    const evidence = readJson<Package7Evidence>(evidencePath);
    expect(new Set(evidence.candidates.map((candidate) =>
      `${candidate.boundary_inventory.pre.target_date}→` +
      candidate.boundary_inventory.post.target_date))).toEqual(new Set([
      "2025-06-27→2025-06-30",
      "2025-06-28→2025-06-29",
    ]));
    for (const candidate of evidence.candidates) {
      for (const boundary of [
        candidate.boundary_inventory.pre,
        candidate.boundary_inventory.post,
      ]) {
        expect(boundary.calendar_and_calendar_dates_expanded).toBe(true);
        expect(boundary.active_service_ids.length).toBeGreaterThan(0);
        expect(boundary.active_service_id_sha256).toBe(
          sha256(`${boundary.active_service_ids.join("\n")}\n`),
        );
        expect(boundary.route_row_count).toBe(1);
        expect(boundary.route_trip_row_count).toBeGreaterThan(0);
        expect(boundary.active_route_trip_count).toBeGreaterThan(0);
        expect(boundary.ordered_full_stop_pattern_count).toBeGreaterThan(0);
        expect(boundary.ordered_full_stop_pattern_trip_count).toBeGreaterThan(0);
      }
      expect(candidate.schedule_validation.passenger_policy).toBe(
        "any_trip_type_except_2_3_4",
      );
      expect(
        candidate.schedule_validation.excluded_nonrevenue_trip_types,
      ).toEqual(["2", "3", "4"]);
      expect(
        candidate.schedule_validation
          .every_selected_pattern_is_schedule_validated_passenger,
      ).toBe(true);
      for (const pattern of [
        ...candidate.ordered_full_stop_evidence.pre_patterns,
        ...candidate.ordered_full_stop_evidence.post_patterns,
      ]) {
        expect(
          (pattern.schedule_validation as Record<string, unknown>).status,
        ).toBe("accepted_passenger_shape");
        expect((pattern.stops as unknown[]).length).toBeGreaterThan(1);
      }
    }
  });

  it("keeps candidate documents nonexclusive and equivalence identifier-only", () => {
    const evidence = readJson<Package7Evidence>(evidencePath);
    expect(evidence.equivalence_policy).toEqual({
      automatic_equivalence: "identical_stop_id_only",
      changed_id_name_coordinate_or_proximity_equivalence: false,
      route_document_or_schedule_presence_can_infer_occurrence: false,
    });
    for (const candidate of evidence.candidates) {
      expect(candidate.exact_candidate_searches.length).toBeGreaterThan(0);
      expect(candidate.source_statement.raw_text.length).toBeGreaterThan(0);
      expect(candidate.source_statement.evidence_id.length).toBeGreaterThan(0);
      expect(candidate.candidate_document.binding_status).toBe(
        "candidate_route_document_exact_nonexclusive",
      );
      expect(candidate.candidate_document.document_is_full_stop_chain).toBe(
        false,
      );
      expect(candidate.candidate_document.nonexclusive_context).toBe(true);
      expect(
        candidate.ordered_full_stop_evidence.equivalence_basis,
      ).toBe("identical_stop_id_only");
      expect(
        candidate.ordered_full_stop_evidence.nonexclusive_full_route_context,
      ).toBe(true);
    }
  });

  it("strictly validates 10 linked extent/grain proposals and 10 fail-closed outcomes", () => {
    const draft = readJson<Plan040Package7Draft>(draftPath);
    expect(draft.evidence_verdict_distribution).toEqual({
      evidence_complete_positive_draft: 10,
      receipt_terminal_unresolved: 10,
    });
    expect(draft.proposed_extent_distribution).toEqual({
      bounded_segment: 8,
      route_wide: 2,
      unresolved: 10,
    });
    expect(draft.proposed_grain_distribution).toEqual({
      periods: 2,
      trip_subset: 8,
      unresolved: 10,
    });
    const positives = draft.candidates.filter((candidate) =>
      candidate.expected_outcome === "positive");
    const unresolved = draft.candidates.filter((candidate) =>
      candidate.expected_outcome === "unresolved");
    expect(positives).toHaveLength(10);
    expect(unresolved).toHaveLength(10);
    for (const candidate of positives) {
      const extent = candidate.proposed_extent_decision!;
      const grain = parseMemberGrainDecision(
        candidate.proposed_grain_decision!,
      );
      expect(() => validateMemberExtentDecision(extent)).not.toThrow();
      const componentKeys = extent.components.map((component) =>
        JSON.stringify(component));
      expect(new Set(componentKeys).size).toBe(componentKeys.length);
      for (let leftIndex = 0; leftIndex < extent.components.length; leftIndex += 1) {
        const left = extent.components[leftIndex]!;
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < extent.components.length;
          rightIndex += 1
        ) {
          const right = extent.components[rightIndex]!;
          if (
            left.component_kind !== right.component_kind ||
            left.description !== right.description
          ) {
            continue;
          }
          const leftIds = new Set(left.identifiers);
          const rightIds = new Set(right.identifiers);
          expect(
            left.identifiers.length < right.identifiers.length &&
              left.identifiers.every((identifier) => rightIds.has(identifier)),
          ).toBe(false);
          expect(
            right.identifiers.length < left.identifiers.length &&
              right.identifiers.every((identifier) => leftIds.has(identifier)),
          ).toBe(false);
        }
      }
      expect(extentDecisionKey(extent)).toBe(candidate.candidate_key);
      expect(memberGrainDecisionKey(grain)).toBe(candidate.candidate_key);
      expect(grain.member_extent_decision_id).toBe(extent.decision_id);
      expect(grain.lineage_segments).toEqual([]);
      expect(candidate.unresolved_gap_codes).toEqual([]);
    }
    for (const candidate of unresolved) {
      expect(candidate.proposed_extent_decision).toBeNull();
      expect(candidate.proposed_grain_decision).toBeNull();
      expect(candidate.unresolved_gap_codes.length).toBeGreaterThan(0);
      expect(candidate.evidence_verdict).toBe(
        "receipt_terminal_unresolved",
      );
    }
  });

  it("union-normalizes Q114 extent while retaining both comparisons and all three patterns", () => {
    const draft = readJson<Plan040Package7Draft>(draftPath);
    const q114 = draft.candidates.find((candidate) =>
      candidate.treatment_record_id ===
        "treatment_q114-jamaica-minor-change-2025")!;
    expect(q114.proposed_extent_decision?.components).toEqual([{
      component_kind: "segment",
      identity_namespace: "source_literal_v1",
      identifiers: [
        "500249",
        "503166",
        "503169",
        "503789",
        "505264",
        "982492",
      ],
      description:
        "Direction 0 exact launch-boundary changed region 505264 to route-end; pre/post identifiers remain distinct.",
    }]);
    expect(q114.proposed_extent_decision?.evidence_bindings
      .filter((binding) => binding.role === "ordered_full_stop_chain")
      .map((binding) => binding.evidence_id)).toEqual([
        "gtfs_static_20250626_busco_post_qbnr#historical-full-stop-comparison:0e3d3d9c8474f0548ff2591b",
        "gtfs_static_20250626_busco_post_qbnr#historical-full-stop-comparison:28f12c943b71fc2139ab860c",
      ]);
    expect(q114.proposed_grain_decision?.service_scope).toEqual({
      kind: "trip_subset",
      periods: ["weekend"],
      directions: ["0"],
      pattern_ids: [
        "historical-full-stop-pattern:57bceedb5585609d3f7d3cc5",
        "historical-full-stop-pattern:8fa79013886bdb7fcd9605a2",
        "historical-full-stop-pattern:d2d584252034cb1f4f051725",
      ],
      description:
        "Only the receipt-pinned passenger patterns whose ordered chains contain the candidate-specific changed region.",
    });
  });

  it("fails QM20 closed because flat selectors include unchanged combinations", () => {
    const draft = readJson<Plan040Package7Draft>(draftPath);
    const qm20 = draft.candidates.find((candidate) =>
      candidate.treatment_record_id ===
        "treatment_qm20-frequency-decrease-2025")!;
    expect(qm20.expected_outcome).toBe("unresolved");
    expect(qm20.evidence_verdict).toBe("receipt_terminal_unresolved");
    expect(qm20.proposed_extent_decision).toBeNull();
    expect(qm20.proposed_grain_decision).toBeNull();
    expect(qm20.unresolved_gap_codes).toEqual([
      "flat_selector_cross_product_includes_unchanged_period_direction_combinations",
      "maintained_super_express_pattern_is_nonexclusive_unchanged_context",
    ]);
    expect(qm20.source_statement.raw_text).toBe(
      "Peak and midday frequencies will decrease.",
    );
    const patterns = [
      ...qm20.ordered_full_stop_evidence.pre_patterns,
      ...qm20.ordered_full_stop_evidence.post_patterns,
    ] as Array<{
      direction_id: string;
      headsigns: string[];
      period_trip_counts: Array<{ period: string; trip_count: number }>;
    }>;
    const count = (
      side: "pre" | "post",
      direction: string,
      period: string,
      superExpress = false,
    ): number => {
      const rows = (side === "pre"
        ? qm20.ordered_full_stop_evidence.pre_patterns
        : qm20.ordered_full_stop_evidence.post_patterns) as typeof patterns;
      return rows
        .filter((pattern) =>
          pattern.direction_id === direction &&
          pattern.headsigns.some((headsign) =>
            headsign.includes("SUPER EXPRESS")) === superExpress)
        .flatMap((pattern) => pattern.period_trip_counts)
        .filter((entry) => entry.period === period)
        .reduce((sum, entry) => sum + entry.trip_count, 0);
    };
    expect(patterns.some((pattern) =>
      pattern.headsigns.some((headsign) =>
        headsign.includes("SUPER EXPRESS")))).toBe(true);
    expect([count("pre", "0", "midday"), count("post", "0", "midday")])
      .toEqual([5, 5]);
    expect([count("pre", "1", "pm_peak"), count("post", "1", "pm_peak")])
      .toEqual([4, 4]);
    expect([
      count("pre", "0", "pm_peak", true),
      count("post", "0", "pm_peak", true),
    ]).toEqual([3, 3]);
  });

  it("preserves endpoint, variant, nonlike-day, and span ambiguity", () => {
    const draft = readJson<Plan040Package7Draft>(draftPath);
    const byTreatment = new Map(draft.candidates.map((candidate) => [
      candidate.treatment_record_id,
      candidate,
    ]));
    expect(byTreatment.get(
      "treatment_q31-bay-terrace-terminal-2025",
    )?.unresolved_gap_codes).toContain(
      "named_terminal_is_inside_ordered_turn_loop_not_chain_endpoint",
    );
    for (const route of ["qm12", "qm42"]) {
      expect(byTreatment.get(
        `treatment_${route}-metropolitan-shortening-2025`,
      )?.unresolved_gap_codes).toContain(
        "changed_id_endpoint_equivalence_forbidden",
      );
    }
    expect(byTreatment.get(
      "treatment_q43-limited-discontinuation-2025",
    )?.unresolved_gap_codes).toContain(
      "limited_variant_not_present_as_distinct_schedule_validated_pattern",
    );
    expect(byTreatment.get(
      "treatment_qm2-frequency-decrease-2025",
    )?.unresolved_gap_codes).toContain(
      "weekend_boundary_uses_nonlike_day_comparison",
    );
    for (const route of ["qm8", "qm32", "qm36", "qm42"]) {
      expect(byTreatment.get(
        route === "qm8"
          ? "treatment_qm8-span-adjustment-2025"
          : `treatment_${route}-frequency-span-adjustment-2025`,
      )?.unresolved_gap_codes).toContain(
        "exact_service_span_boundary_times_missing",
      );
    }
  });

  it("excludes prior packages, all 16 absence decisions, and unrelated occurrences", () => {
    const evidence = readJson<Package7Evidence>(evidencePath);
    const draft = readJson<Plan040Package7Draft>(draftPath);
    expect(Object.values(evidence.exclusion_checks).every((entry) =>
      entry.overlap_count === 0)).toBe(true);
    expect(draft.exclusions.prior_package_overlap).toEqual({
      package_2: 0,
      package_4: 0,
      package_5: 0,
      package_6: 0,
      exemplar: 0,
    });
    expect(
      evidence.existing_phase_1_terminal_context.absence_decision_count,
    ).toBe(16);
    expect(
      evidence.existing_phase_1_terminal_context.absence_decision_keys,
    ).toHaveLength(16);
    expect(
      evidence.existing_phase_1_terminal_context
        .reused_positive_stop_removal_context_count,
    ).toBe(1);
    expect(
      evidence.existing_phase_1_terminal_context.candidate_key_overlap_count,
    ).toBe(0);
    expect(draft.exclusions.unrelated_occurrence_inference_count).toBe(0);
  });

  it("keeps both ledgers pristine before accepted decisions are persisted", () => {
    const evidence = readJson<Package7Evidence>(evidencePath);
    const draft = readJson<Plan040Package7Draft>(draftPath);
    expect(evidence.pristine_ledger_inputs.extent.sha256).toBe(
      sha256(readFileSync(extentLedgerPath)),
    );
    expect(evidence.pristine_ledger_inputs.grain.sha256).toBe(
      sha256(readFileSync(grainLedgerPath)),
    );
    const candidateKeys = new Set(draft.candidates.map((candidate) =>
      candidate.candidate_key));
    const extentRows = readJsonl(extentLedgerPath).filter((row) =>
      candidateKeys.has(extentDecisionKey(row as {
        occurrence_id: string;
        route_record_id: string;
        treatment_record_id: string;
      })));
    const grainRows = readJsonl(grainLedgerPath).filter((row) =>
      candidateKeys.has(extentDecisionKey(row as {
        occurrence_id: string;
        route_record_id: string;
        treatment_record_id: string;
      })));
    expect(extentRows).toHaveLength(20);
    expect(grainRows).toHaveLength(20);
    expect(extentRows.every((row) =>
      row.verdict === "unreviewed" &&
      (row.receipt_ids as unknown[]).length === 0)).toBe(true);
    expect(grainRows.every((row) =>
      row.verdict === "unreviewed" &&
      (row.receipt_ids as unknown[]).length === 0)).toBe(true);
    expect(draft.persisted_extent_decision_count).toBe(0);
    expect(draft.persisted_grain_decision_count).toBe(0);
    expect(draft.authorizes_occurrence).toBe(false);
    expect(draft.authorizes_study).toBe(false);
    expect(draft.authorizes_cross_product).toBe(false);
    expect(draft.authorizes_decision_persistence).toBe(false);
  });

  it("freezes a compact dual-review gate and exact owner acceptance", () => {
    expect(existsSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_GATE_PATH,
    )).toBe(true);
    expect(existsSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_ACCEPTANCE_PATH,
    )).toBe(true);
    const draft = readJson<Plan040Package7Draft>(draftPath);
    const gate = readJson<Record<string, unknown>>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_GATE_PATH,
    );
    const acceptance = readJson<Record<string, unknown>>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_7_ACCEPTANCE_PATH,
    );
    expect(validatePlan040Package7GateAndAcceptance({
      draft,
      gate,
      acceptance,
      acceptedAt: acceptance.accepted_at as string,
    })).toEqual({
      candidate_count: 20,
      positive_candidate_count: 10,
      unresolved_candidate_count: 10,
      authorized_extent_decision_count: 10,
      authorized_grain_decision_count: 10,
      authorized_absence_candidate_count: 10,
      persisted_decision_count: 0,
      persisted_absence_receipt_count: 0,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(gate.reviewed_commit).toBe(
      PLAN040_PACKAGE_7_APPROVED_COMMIT,
    );
    expect(gate).not.toHaveProperty("candidate_keys");
    expect(gate).not.toHaveProperty("extent_decision_ids");
    expect(gate).not.toHaveProperty("grain_decision_ids");
    expect(gate.authorization_state).toBe(
      "dual_review_approved_pending_owner_delegate_acceptance",
    );
    expect(gate.authorizes_decision_persistence).toBe(false);
    expect(gate.authorizes_occurrence).toBe(false);
    expect(acceptance.authorizes_decision_persistence).toBe(true);
    expect(acceptance.authorizes_reviewed_absence_receipt_persistence)
      .toBe(true);
    expect(acceptance.authorizes_occurrence).toBe(false);
    expect(buildPlan040Package7GateAndAcceptance({
      draft,
      acceptedAt: acceptance.accepted_at as string,
    }).gate).toEqual(gate);
  });

  it("rebuilds deterministically and rejects scope or authority mutations", () => {
    const evidence = readJson<Package7Evidence>(evidencePath);
    const draft = readJson<Plan040Package7Draft>(draftPath);
    expect(buildPlan040Package7Draft(buildInput(evidence))).toEqual(draft);

    const authorized = structuredClone(evidence.candidates);
    authorized[0]!.authorizes_occurrence = true as false;
    expect(() =>
      buildPlan040Package7Draft(buildInput(evidence, authorized))).toThrow(
        "evidence, ledger, or authority scope drifted",
      );

    const unresolvedPromoted = structuredClone(evidence.candidates);
    const unresolved = unresolvedPromoted.find((candidate) =>
      candidate.expected_outcome === "unresolved")!;
    unresolved.proposed_extent_decision = structuredClone(
      evidence.candidates.find((candidate) =>
        candidate.expected_outcome === "positive")!
        .proposed_extent_decision,
    );
    expect(() =>
      buildPlan040Package7Draft(
        buildInput(evidence, unresolvedPromoted),
      )).toThrow("unresolved fail-closed scope drifted");

    const calendarRemoved = structuredClone(evidence.candidates);
    calendarRemoved[0]!.boundary_inventory.pre
      .calendar_and_calendar_dates_expanded = false as true;
    expect(() =>
      buildPlan040Package7Draft(
        buildInput(evidence, calendarRemoved),
      )).toThrow("evidence, ledger, or authority scope drifted");

    const duplicateComponent = structuredClone(evidence.candidates);
    const positive = duplicateComponent.find((candidate) =>
      candidate.proposed_extent_decision !== null)!;
    positive.proposed_extent_decision!.components.push(
      structuredClone(positive.proposed_extent_decision!.components[0]!),
    );
    expect(() =>
      buildPlan040Package7Draft(
        buildInput(evidence, duplicateComponent),
      )).toThrow("duplicate exact extent components");

    const nestedComponent = structuredClone(evidence.candidates);
    const q114 = nestedComponent.find((candidate) =>
      candidate.treatment_record_id ===
        "treatment_q114-jamaica-minor-change-2025")!;
    const q114Component = q114.proposed_extent_decision!.components[0]!;
    q114.proposed_extent_decision!.components.push({
      ...structuredClone(q114Component),
      identifiers: q114Component.identifiers.slice(0, -1),
    });
    expect(() =>
      buildPlan040Package7Draft(
        buildInput(evidence, nestedComponent),
      )).toThrow("nested extent component identifier sets");

    const qm20Promoted = structuredClone(evidence.candidates);
    const qm20 = qm20Promoted.find((candidate) =>
      candidate.treatment_record_id ===
        "treatment_qm20-frequency-decrease-2025")!;
    const qm12 = evidence.candidates.find((candidate) =>
      candidate.treatment_record_id ===
        "treatment_qm12-frequency-decrease-2025")!;
    qm20.proposed_extent_decision = structuredClone(
      qm12.proposed_extent_decision,
    );
    qm20.proposed_grain_decision = structuredClone(
      qm12.proposed_grain_decision,
    );
    expect(() =>
      buildPlan040Package7Draft(
        buildInput(evidence, qm20Promoted),
      )).toThrow("unresolved fail-closed scope drifted");

    const overlapInput = buildInput(evidence);
    overlapInput.priorCandidateKeys.package_6 = [
      evidence.candidates[0]!.candidate_key,
    ];
    expect(() => buildPlan040Package7Draft(overlapInput)).toThrow(
      "overlaps package_6",
    );
  });
});
