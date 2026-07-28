import { describe, expect, it } from "bun:test";
import { corpusIt } from "../support/local-test-profile";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import type { JsonValue } from "../../../db/src/types";
import {
  compareFullStopPatterns,
  fullStopPatternsForDate,
} from "../../src/reference/historical-full-stop";
import { loadGtfsStaticSnapshot } from "../../src/reference/gtfs-static";
import {
  loadOperationalSnapshotRegistry,
  snapshotById,
} from "../../src/reference/snapshot-registry";
import {
  PLAN040_PACKAGE_10D_CANDIDATES,
  PLAN040_PACKAGE_10D_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_10D_COMPARISON_PINS,
  PLAN040_PACKAGE_10D_COMPARISON_RECEIPT_SHA256,
  PLAN040_PACKAGE_10D_EXCLUSION_HASHES,
  PLAN040_PACKAGE_10D_PATTERN_PINS,
  PLAN040_PACKAGE_10D_POST_10C_PINS,
  PLAN040_PACKAGE_10D_SOURCE_PINS,
  buildPlan040Package10dDraft,
  plan040Package10dReplayHash,
  type Plan040Package10dCandidateEvidence,
  type Plan040Package10dComparisonReceiptRef,
  type Plan040Package10dDraft,
  type Plan040Package10dExclusion,
} from "../../src/quality/plan040-qbnr-service-pattern-package10d";
import type { Plan040Package8VersionSeparation } from
  "../../src/quality/plan040-qbnr-service-pattern-package8";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const evidencePath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-10d-evidence-v1.json`;
const draftPath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-10d-evidence-draft-v1.json`;
const receiptPath =
  `${repoRoot}/data/quality/acquisition/receipts/member-extent-evidence/` +
  "plan-040-qbnr-service-pattern-package-10d-full-stop-equivalence-v1.json";
const EVIDENCE_SHA256 =
  "2420151d952fe8699a3db4d372f80dea215fb9df59598e87a57dd698d8811b2a";
const DRAFT_SHA256 =
  "c54bf0feb4808d2f49154b42332ff6ef894bc8a6c08c5c291f9702c03e42e40f";

type Package10dEvidence = {
  candidate_count: 2;
  route_count: 2;
  candidate_key_sha256: string;
  candidates: Plan040Package10dCandidateEvidence[];
  exclusions: Plan040Package10dExclusion[];
  prior_package_overlap_count: 0;
  comparison_receipt: Plan040Package10dComparisonReceiptRef;
  immutable_inputs: {
    post_10c_pins: typeof PLAN040_PACKAGE_10D_POST_10C_PINS;
    source_artifacts: typeof PLAN040_PACKAGE_10D_SOURCE_PINS;
  };
  version_separation: Plan040Package8VersionSeparation;
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 2;
  };
  proposed_extent_distribution: { route_wide: 2 };
  proposed_grain_distribution: { trip_subset: 2 };
  review_protocol: {
    review_mode: string;
    independent_review_required: true;
    dual_independent_review_required: true;
    owner_gate_created: false;
    owner_acceptance_created: false;
    persistence_performed: false;
  };
  authorization_state: string;
  proposed_extent_decision_count: 2;
  proposed_grain_decision_count: 2;
  persisted_extent_decision_count: 0;
  persisted_grain_decision_count: 0;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

type PatternReceipt = {
  pattern_id: string;
  route_id: string;
  direction_id: string;
  trip_count: number;
  trip_id_sha256: string;
  shape_ids: string[];
  headsigns: string[];
  stop_count: number;
  stop_ids: string[];
  stop_chain_sha256: string;
};
type ComparisonReceipt = {
  comparison_role: string;
  comparison_id: string;
  predecessor_pattern_id: string;
  successor_pattern_id: string;
  full_chain_comparison: JsonValue;
  full_chain_comparison_sha256: string;
  identical_stop_id_equivalences: Array<{
    before_stop_id: string;
    after_stop_id: string;
    equivalence_basis: string;
  }>;
  before_only_stops: Array<{
    stop_id: string;
    disposition: string;
  }>;
  after_only_stops: Array<{
    stop_id: string;
    disposition: string;
  }>;
  changed_id_equivalence_authorized: false;
};
type ReceiptArtifact = {
  receipt_id: string;
  activation_checks: Array<{
    route_id: string;
    source_statement_effective_date: string;
    published_post_pre_effective_date: string;
    published_post_pre_effective_active_pattern_count: number;
    published_post_pre_effective_active_trip_count: number;
    effective_date: string;
    effective_day_type: string;
    effective_active_pattern_count: number;
    effective_active_trip_count: number;
    activation_basis: string;
  }>;
  predecessor_pattern_selection: {
    q48_primary_q46_glen_oaks_local: PatternReceipt[];
    q48_q46_limited_variant_sensitivity_only: PatternReceipt[];
    q75_primary_q30_qcc_short_trips: PatternReceipt[];
    q75_q30_little_neck_excluded_non_lineage: PatternReceipt[];
  };
  successor_patterns: PatternReceipt[];
  comparisons: ComparisonReceipt[];
  lineage_policy: {
    q30_little_neck_included_in_q75_lineage: false;
    q46_limited_variant_comparisons_affect_primary_lineage: false;
  };
  equivalence_policy: {
    applied_equivalence: string;
    changed_identifier_equivalence_authorized: false;
    before_only_and_after_only_stops: string;
  };
  normal_file_required: true;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const clone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
const patterns = (snapshotId: string, date: string, routeId: string) =>
  fullStopPatternsForDate(
    loadGtfsStaticSnapshot(
      snapshotById(loadOperationalSnapshotRegistry(), snapshotId),
      ["calendar", "calendar_dates", "routes", "stops", "stop_times", "trips"],
      repoRoot,
      new Set([routeId]),
    ),
    date,
    routeId,
  );
const inputFor = (
  evidence: Package10dEvidence,
  candidates = evidence.candidates,
  exclusions = evidence.exclusions,
  receipt = evidence.comparison_receipt,
  versionSeparation = evidence.version_separation,
) => ({
  evidenceManifestPath:
    "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-10d-evidence-v1.json",
  evidenceManifestSha256: EVIDENCE_SHA256,
  candidates,
  exclusions,
  comparisonReceipt: receipt,
  priorCandidateKeys: [] as string[],
  versionSeparation,
});

describe("Plan 040 QBNR Package 10D weekday lineage evidence freeze", () => {
  it("freezes the exact two-candidate proposal scope and deterministic draft", () => {
    const evidenceBytes = readFileSync(evidencePath);
    const draftBytes = readFileSync(draftPath);
    const evidence = JSON.parse(
      evidenceBytes.toString("utf8"),
    ) as Package10dEvidence;
    const draft = JSON.parse(
      draftBytes.toString("utf8"),
    ) as Plan040Package10dDraft;

    expect(sha256(evidenceBytes)).toBe(EVIDENCE_SHA256);
    expect(sha256(draftBytes)).toBe(DRAFT_SHA256);
    expect(evidence.candidate_count).toBe(2);
    expect(evidence.route_count).toBe(2);
    expect(sortedHash(evidence.candidates.map((row) =>
      row.candidate_key))).toBe(PLAN040_PACKAGE_10D_CANDIDATE_KEY_SHA256);
    expect(evidence.candidates.map((row) => [
      row.gtfs_route_id,
      row.treatment_record_id,
    ]).sort()).toEqual([...PLAN040_PACKAGE_10D_CANDIDATES].sort());
    expect(evidence.evidence_verdict_distribution).toEqual({
      positive_extent_and_grain_proposed: 2,
    });
    expect(evidence.proposed_extent_distribution).toEqual({ route_wide: 2 });
    expect(evidence.proposed_grain_distribution).toEqual({ trip_subset: 2 });
    expect(buildPlan040Package10dDraft(inputFor(evidence))).toEqual(draft);
    expect(plan040Package10dReplayHash(
      draft as unknown as JsonValue,
    )).toBe(sha256(draftBytes));
  });

  corpusIt("proves the candidate-specific Sunday-zero and Monday-active date role", () => {
    const receipt = readJson<ReceiptArtifact>(receiptPath);
    const q48Sunday = patterns(
      "gtfs-static-20250626-queens-post-qbnr",
      "2025-06-29",
      "Q48",
    );
    const q75Sunday = patterns(
      "gtfs-static-20250626-queens-post-qbnr",
      "2025-06-29",
      "Q75",
    );
    const q48Monday = patterns(
      "gtfs-static-20250626-queens-post-qbnr",
      "2025-06-30",
      "Q48",
    );
    const q75Monday = patterns(
      "gtfs-static-20250626-queens-post-qbnr",
      "2025-06-30",
      "Q75",
    );
    expect(q48Sunday).toHaveLength(0);
    expect(q75Sunday).toHaveLength(0);
    expect(q48Monday.reduce((sum, row) => sum + row.trip_count, 0)).toBe(129);
    expect(q75Monday.reduce((sum, row) => sum + row.trip_count, 0)).toBe(159);
    expect(receipt.activation_checks).toEqual([
      {
        route_id: "Q48",
        source_statement_effective_date: "2025-06-30",
        published_post_pre_effective_date: "2025-06-29",
        published_post_pre_effective_active_pattern_count: 0,
        published_post_pre_effective_active_trip_count: 0,
        effective_date: "2025-06-30",
        effective_day_type: "Monday",
        effective_active_pattern_count: 2,
        effective_active_trip_count: 129,
        activation_basis: "calendar_plus_calendar_dates",
      },
      {
        route_id: "Q75",
        source_statement_effective_date: "2025-06-30",
        published_post_pre_effective_date: "2025-06-29",
        published_post_pre_effective_active_pattern_count: 0,
        published_post_pre_effective_active_trip_count: 0,
        effective_date: "2025-06-30",
        effective_day_type: "Monday",
        effective_active_pattern_count: 2,
        effective_active_trip_count: 159,
        activation_basis: "calendar_plus_calendar_dates",
      },
    ]);
  });

  corpusIt("recomputes every selected pattern and full comparison from accepted bytes", () => {
    const receiptBytes = readFileSync(receiptPath);
    const stat = lstatSync(receiptPath);
    const receipt = JSON.parse(
      receiptBytes.toString("utf8"),
    ) as ReceiptArtifact;
    expect(stat.isFile()).toBeTrue();
    expect(stat.isSymbolicLink()).toBeFalse();
    expect(sha256(receiptBytes)).toBe(
      PLAN040_PACKAGE_10D_COMPARISON_RECEIPT_SHA256,
    );

    const allPatterns = [
      ...patterns(
        "gtfs-static-20250615-queens-pre-qbnr",
        "2025-06-27",
        "Q46",
      ),
      ...patterns(
        "gtfs-static-20250615-queens-pre-qbnr",
        "2025-06-27",
        "Q30",
      ),
      ...patterns(
        "gtfs-static-20250626-queens-post-qbnr",
        "2025-06-30",
        "Q48",
      ),
      ...patterns(
        "gtfs-static-20250626-queens-post-qbnr",
        "2025-06-30",
        "Q75",
      ),
    ];
    const selected = [
      ...receipt.predecessor_pattern_selection.q48_primary_q46_glen_oaks_local,
      ...receipt.predecessor_pattern_selection
        .q48_q46_limited_variant_sensitivity_only,
      ...receipt.predecessor_pattern_selection.q75_primary_q30_qcc_short_trips,
      ...receipt.predecessor_pattern_selection
        .q75_q30_little_neck_excluded_non_lineage,
      ...receipt.successor_patterns,
    ];
    expect(selected).toHaveLength(12);
    expect(new Set(selected.map((row) => row.pattern_id)).size).toBe(12);
    for (const frozen of selected) {
      const pattern = allPatterns.find((row) =>
        row.pattern_id === frozen.pattern_id)!;
      const pin = Object.values(PLAN040_PACKAGE_10D_PATTERN_PINS).find((row) =>
        row.pattern_id === frozen.pattern_id)!;
      expect(pattern).toBeDefined();
      expect(pattern.trip_count).toBe(pin.trip_count);
      expect(sortedHash(pattern.trip_ids)).toBe(pin.trip_id_sha256);
      expect(pattern.shape_ids).toEqual(pin.shape_ids);
      expect(pattern.stops).toHaveLength(pin.stop_count);
      expect(sha256(
        `${pattern.stops.map((stop) => stop.stop_id).join("\n")}\n`,
      )).toBe(pin.stop_chain_sha256);
    }
    expect(receipt.comparisons).toHaveLength(6);
    for (const row of receipt.comparisons) {
      const before = allPatterns.find((pattern) =>
        pattern.pattern_id === row.predecessor_pattern_id)!;
      const after = allPatterns.find((pattern) =>
        pattern.pattern_id === row.successor_pattern_id)!;
      const comparison = compareFullStopPatterns(before, after);
      const pin = Object.values(PLAN040_PACKAGE_10D_COMPARISON_PINS)
        .find((value) => value.comparison_id === row.comparison_id)!;
      expect(comparison.comparison_id).toBe(pin.comparison_id);
      expect(sha256(
        `${stableJson(comparison as unknown as JsonValue)}\n`,
      )).toBe(pin.full_chain_comparison_sha256);
      expect(row.full_chain_comparison_sha256).toBe(
        pin.full_chain_comparison_sha256,
      );
      expect(row.identical_stop_id_equivalences.every((pair) =>
        pair.before_stop_id === pair.after_stop_id &&
        pair.equivalence_basis === "identical_stop_id"
      )).toBeTrue();
      expect(row.before_only_stops.every((stop) =>
        stop.disposition === "unresolved_no_equivalence_authorized"
      )).toBeTrue();
      expect(row.after_only_stops.every((stop) =>
        stop.disposition === "unresolved_no_equivalence_authorized"
      )).toBeTrue();
      expect(row.changed_id_equivalence_authorized).toBeFalse();
    }
  });

  it("uses Q46 local primary with limited sensitivity and Q30 QCC only", () => {
    const evidence = readJson<Package10dEvidence>(evidencePath);
    const receipt = readJson<ReceiptArtifact>(receiptPath);
    const q48 = evidence.candidates.find((row) =>
      row.gtfs_route_id === "Q48")!;
    const q75 = evidence.candidates.find((row) =>
      row.gtfs_route_id === "Q75")!;
    const q48Accepted = q48.accepted_evidence as {
      primary_full_stop_comparisons: Array<{ comparison_id: string }>;
      limited_variant_sensitivity: {
        comparison_ids: string[];
        affects_primary_lineage: false;
      };
      launch_schedule: {
        retained_trip_types: string[];
        excluded_trip_types: string[];
        passenger_shape_ids: string[];
        gtfs_successor_shape_ids: string[];
        shape_match: true;
      };
    };
    const q75Accepted = q75.accepted_evidence as {
      primary_full_stop_comparisons: Array<{ comparison_id: string }>;
      q30_little_neck_exclusion: {
        pattern_ids: string[];
        included_in_lineage: false;
      };
      launch_schedule: {
        retained_trip_types: string[];
        excluded_trip_types: string[];
        passenger_shape_ids: string[];
        gtfs_successor_shape_ids: string[];
        shape_match: true;
      };
    };
    expect(q48Accepted.primary_full_stop_comparisons.map((row) =>
      row.comparison_id).sort()).toEqual([
        PLAN040_PACKAGE_10D_COMPARISON_PINS.q46_local_direction_0
          .comparison_id,
        PLAN040_PACKAGE_10D_COMPARISON_PINS.q46_local_direction_1
          .comparison_id,
      ].sort());
    expect(q48Accepted.limited_variant_sensitivity.comparison_ids).toEqual([
      PLAN040_PACKAGE_10D_COMPARISON_PINS
        .q46_limited_sensitivity_direction_0.comparison_id,
      PLAN040_PACKAGE_10D_COMPARISON_PINS
        .q46_limited_sensitivity_direction_1.comparison_id,
    ].sort());
    expect(q48Accepted.limited_variant_sensitivity.affects_primary_lineage)
      .toBeFalse();
    expect(q75Accepted.primary_full_stop_comparisons.map((row) =>
      row.comparison_id).sort()).toEqual([
        PLAN040_PACKAGE_10D_COMPARISON_PINS.q30_qcc_direction_0.comparison_id,
        PLAN040_PACKAGE_10D_COMPARISON_PINS.q30_qcc_direction_1.comparison_id,
      ].sort());
    expect(q75Accepted.q30_little_neck_exclusion.pattern_ids).toEqual([
      PLAN040_PACKAGE_10D_PATTERN_PINS.q30_little_neck_direction_0.pattern_id,
      PLAN040_PACKAGE_10D_PATTERN_PINS.q30_little_neck_direction_1.pattern_id,
    ].sort());
    expect(q75Accepted.q30_little_neck_exclusion.included_in_lineage).toBeFalse();
    expect(receipt.lineage_policy).toMatchObject({
      q30_little_neck_included_in_q75_lineage: false,
      q46_limited_variant_comparisons_affect_primary_lineage: false,
    });

    for (const candidate of [q48, q75]) {
      expect(candidate.proposed_extent_decision.resolution).toBe("route_wide");
      expect(candidate.proposed_grain_decision.service_scope).toMatchObject({
        kind: "trip_subset",
        periods: ["weekday"],
        directions: ["0", "1"],
      });
      const accepted = candidate.accepted_evidence as {
        launch_schedule: {
          retained_trip_types: string[];
          excluded_trip_types: string[];
          passenger_shape_ids: string[];
          gtfs_successor_shape_ids: string[];
          shape_match: true;
        };
      };
      expect(accepted.launch_schedule.retained_trip_types).toEqual(["1", "12"]);
      expect(accepted.launch_schedule.excluded_trip_types).toEqual([
        "2",
        "3",
        "4",
      ]);
      expect(accepted.launch_schedule.shape_match).toBeTrue();
      expect(accepted.launch_schedule.passenger_shape_ids).toEqual(
        accepted.launch_schedule.gtfs_successor_shape_ids,
      );
    }
  });

  it("pins approved occurrences and preserves both limited-stop siblings", () => {
    const evidence = readJson<Package10dEvidence>(evidencePath);
    const expectedRows = {
      Q48: {
        occurrence:
          PLAN040_PACKAGE_10D_SOURCE_PINS.q48_occurrence_row,
        sibling: "treatment_q48-limited-stops-2025",
      },
      Q75: {
        occurrence:
          PLAN040_PACKAGE_10D_SOURCE_PINS.q75_occurrence_row,
        sibling: "treatment_q75-limited-stops-2025",
      },
    } as const;
    for (const candidate of evidence.candidates) {
      const accepted = candidate.accepted_evidence as {
        preserved_occurrence_decision: {
          decision_row_sha256: string;
          review_state: string;
          exact_member_treatment_record_ids: string[];
        };
        preserved_limited_stop_sibling: {
          treatment_record_id: string;
          occurrence_membership_preserved: true;
          extent_or_grain_change_performed: false;
          occurrence_membership_change_performed: false;
        };
      };
      expect(accepted.preserved_occurrence_decision.decision_row_sha256).toBe(
        expectedRows[candidate.gtfs_route_id].occurrence,
      );
      expect(accepted.preserved_occurrence_decision.review_state).toBe(
        "approved",
      );
      expect(accepted.preserved_occurrence_decision
        .exact_member_treatment_record_ids).toContain(
          expectedRows[candidate.gtfs_route_id].sibling,
        );
      expect(accepted.preserved_limited_stop_sibling).toMatchObject({
        treatment_record_id: expectedRows[candidate.gtfs_route_id].sibling,
        occurrence_membership_preserved: true,
        extent_or_grain_change_performed: false,
        occurrence_membership_change_performed: false,
      });
    }
    const siblingExclusion = evidence.exclusions.find((row) =>
      row.scope_id === "current_occurrence_limited_stop_siblings")!;
    expect(siblingExclusion.candidate_count).toBe(2);
    expect(siblingExclusion.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_10D_EXCLUSION_HASHES
        .current_occurrence_limited_stop_siblings,
    );
  });

  it("fails closed on date, lineage, correction, exclusion, or authority drift", () => {
    const evidence = readJson<Package10dEvidence>(evidencePath);
    const dateDrift = clone(evidence.candidates);
    (dateDrift[0]!.accepted_evidence as {
      date_role: { published_post_pre_effective_active_trip_count: number };
    }).date_role.published_post_pre_effective_active_trip_count = 1;
    expect(() => buildPlan040Package10dDraft(inputFor(
      evidence,
      dateDrift,
    ))).toThrow("evidence drifted");

    const lineageDrift = clone(evidence.candidates);
    (lineageDrift[0]!.accepted_evidence as {
      limited_variant_sensitivity: {
        affects_primary_lineage: boolean;
      };
    }).limited_variant_sensitivity.affects_primary_lineage = true;
    expect(() => buildPlan040Package10dDraft(inputFor(
      evidence,
      lineageDrift,
    ))).toThrow("variant sensitivity drifted");

    const exclusionDrift = clone(evidence.exclusions);
    exclusionDrift[3]!.candidate_keys = exclusionDrift[3]!.candidate_keys
      .slice(0, 1);
    expect(() => buildPlan040Package10dDraft(inputFor(
      evidence,
      evidence.candidates,
      exclusionDrift,
    ))).toThrow("exclusion drifted");

    const correctionDrift = clone(evidence.version_separation);
    correctionDrift.corrected_first_week_diff.correction_bytes_used = true;
    expect(() => buildPlan040Package10dDraft(inputFor(
      evidence,
      evidence.candidates,
      evidence.exclusions,
      evidence.comparison_receipt,
      correctionDrift,
    ))).toThrow("correction-version separation drifted");

    const authorityDrift = clone(evidence.candidates);
    (authorityDrift[0] as unknown as {
      authorizes_occurrence: boolean;
    }).authorizes_occurrence = true;
    expect(() => buildPlan040Package10dDraft(inputFor(
      evidence,
      authorityDrift,
    ))).toThrow("evidence drifted");
  });

  it("keeps the freeze nonauthorizing with no gate, acceptance, or persistence", () => {
    const evidence = readJson<Package10dEvidence>(evidencePath);
    for (const exclusion of evidence.exclusions) {
      expect(exclusion.candidate_key_sha256).toBe(
        PLAN040_PACKAGE_10D_EXCLUSION_HASHES[exclusion.scope_id],
      );
      expect(exclusion.candidate_key_sha256).toBe(
        sortedHash(exclusion.candidate_keys),
      );
      expect(exclusion.overlap_count).toBe(0);
    }
    expect(evidence.prior_package_overlap_count).toBe(0);
    expect(evidence.review_protocol).toMatchObject({
      review_mode:
        "dual_independent_lineage_variant_and_sibling_scope_risk_review",
      independent_review_required: true,
      dual_independent_review_required: true,
      owner_gate_created: false,
      owner_acceptance_created: false,
      persistence_performed: false,
    });
    expect(evidence.authorization_state).toContain(
      "no_gate_no_acceptance_no_persistence",
    );
    expect(evidence.persisted_extent_decision_count).toBe(0);
    expect(evidence.persisted_grain_decision_count).toBe(0);
    expect(evidence.authorizes_occurrence).toBeFalse();
    expect(evidence.authorizes_study).toBeFalse();
    expect(evidence.authorizes_cross_product).toBeFalse();
    expect(evidence.authorizes_decision_persistence).toBeFalse();
    expect(existsSync(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-10d-dual-review-gate-v1.json`,
    )).toBeTrue();
    expect(existsSync(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-10d-owner-acceptance-v1.json`,
    )).toBeTrue();
    expect(existsSync(
      `${repoRoot}/data/quality/operational-reference/member-extent-ledger-decisions/plan-040-qbnr-service-pattern-package-10d-v1.json`,
    )).toBeTrue();
    expect(existsSync(
      `${repoRoot}/data/quality/operational-reference/member-grain-decisions/plan-040-qbnr-service-pattern-package-10d-v1.json`,
    )).toBeTrue();
  });
});
