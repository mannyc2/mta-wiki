import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  PLAN040_PACKAGE_15_CANDIDATE_COUNT,
  PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_15_BASE_CHECKPOINT_COMMIT,
  PLAN040_PACKAGE_15_DISCOVERY_SHA256,
  PLAN040_PACKAGE_15_EXACT_ABSENCE_COUNT,
  PLAN040_PACKAGE_15_PARTITIONS,
  PLAN040_PACKAGE_15_POSITIVE_COUNT,
  PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256,
  PLAN040_PACKAGE_15_Q89_AFFIRM_POSITIVE_KEY_SHA256,
  PLAN040_PACKAGE_15_Q89_AFFIRM_SOURCE_GAP_KEY_SHA256,
  PLAN040_PACKAGE_15_Q89_CANDIDATE_KEY,
  PLAN040_PACKAGE_15_Q89_DOWNGRADE_POSITIVE_KEY_SHA256,
  PLAN040_PACKAGE_15_Q89_DOWNGRADE_SOURCE_GAP_KEY_SHA256,
  PLAN040_PACKAGE_15_SOURCE_GAP_COUNT,
  PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256,
  PLAN040_PACKAGE_15_SOURCE_REPORT_SHA256,
  plan040Package15SortedHash,
  validatePlan040Package15Discovery,
  writePlan040Package15ImmutableNormalFile,
  type Plan040Package15Discovery,
} from "../../src/quality/plan040-accelerated-package15.js";

const artifactRoot = process.env.PLAN040_PACKAGE15_ARTIFACT_ROOT === undefined
  ? repoRoot
  : resolve(process.env.PLAN040_PACKAGE15_ARTIFACT_ROOT);
const receiptRoot = join(
  artifactRoot,
  "data/quality/acquisition/receipts/member-extent-evidence",
);
const riskRoot = join(
  artifactRoot,
  "data/quality/operational-reference/member-extent-risk",
);
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

const discoveryPath = join(
  receiptRoot,
  "plan-040-accelerated-package-15-discovery-receipt-v1.json",
);
const partitionPaths = {
  programApplicability15: join(
    receiptRoot,
    "plan-040-accelerated-package-15-program-applicability-15-v1.json",
  ),
  qbnrExactChain2: join(
    receiptRoot,
    "plan-040-accelerated-package-15-qbnr-exact-chain-2-v1.json",
  ),
  inventorySourceGap12: join(
    receiptRoot,
    "plan-040-accelerated-package-15-inventory-source-gap-12-v1.json",
  ),
} as const;

type PartitionReceipt = {
  partition: keyof typeof PLAN040_PACKAGE_15_PARTITIONS;
  candidate_count: number;
  candidate_key_sha256: string;
  positive_count: number;
  source_gap_count: number;
  exact_absence_count: number;
  absent_in_source_projection_permitted: false;
  candidates: Array<{
    candidate_key: string;
    gtfs_route_id: string;
    proposed_verdict: string;
    proposed_positive_decisions: null | {
      extent_resolution?: string;
      extent_components?: Array<{
        identity_namespace: string;
        identifiers: string[];
      }>;
      extent?: {
        resolution: string;
        components?: Array<{ direction: string; stop_ids: string[] }>;
        stop_ids?: string[];
      };
      grain_scope: { kind: string; pattern_ids?: string[] };
    };
    proposed_source_gap_overlay: null | {
      blocked_surfaces: string[];
      missing_roles: string[];
      verdict: string;
    };
    exact_candidate_searches: string[];
  }>;
  semantic_guardrail?: {
    physicality_scope_requirement: string;
    fare_grain: string;
    b12_grain: string;
  } | null;
  ace_missing_source_bytes?: {
    path: string;
    exists: false;
    prior_receipt: { path: string; sha256: string };
  };
  q67_correction_sensitivity?: {
    published_launch_feed: {
      q67_trip_count_2025_06_29: 0;
      q67_trip_count_2025_06_30: 0;
    };
    corrected_first_week_feed: {
      version_sha1: string;
      zip_bytes_status: string;
      comparison_run: false;
      authorizes_positive: false;
    };
  };
};

type FullStopReceipt = {
  version_role: "published_launch_diff";
  calendar_policy: "calendar_plus_calendar_dates";
  revenue_validation_policy: string;
  corrected_first_week_diff_used: false;
  q89: {
    same_trip_chain_evidence: {
      construction: string;
      exact_gtfs_trip_id_join: true;
      schedule_trip_id_or_shape_join: false;
      direction_0_trip_count: 39;
      direction_1_trip_count: 39;
      evidentiary_role: string;
    };
    patterns: Array<{
      pattern_id: string;
      direction_id: string;
      shape_ids: string[];
      headsigns: string[];
      period_trip_counts: Array<{ period: string; trip_count: number }>;
      trip_ids_sha256: string;
      stop_ids: string[];
      stops: Array<{ stop_id: string; stop_name: string }>;
      stop_chain_sha256: string;
    }>;
    source_bounded_segment_stop_ids: {
      direction_0: string[];
      direction_1: string[];
    };
    schedule_validation: {
      passenger_shape_ids: string[];
      gtfs_shape_ids: string[];
      retained_trip_types: string[];
      retained_stop_time_row_count: number;
      retained_trip_start_count: number;
      excluded_trip_types: string[];
      excluded_stop_time_row_counts: Record<string, number>;
      shape_identity_matches: false;
      trip_count_matches_at_route_level: true;
      review_disposition: string;
    };
    acceptable_reviewer_outcomes: {
      selected_outcome: string;
      candidate_specific_schedule_gtfs_passenger_join_proven: false;
      unchanged_scope: {
        candidate_count: number;
        candidate_key_sha256: string;
      };
      affirm_positive: {
        condition_met_in_frozen_evidence: false;
        positive_count: number;
        source_gap_count: number;
        exact_absence_count: number;
        positive_key_sha256: string;
        source_gap_key_sha256: string;
      };
      downgrade_only_q89: {
        condition_met_in_frozen_evidence: true;
        changed_candidate_key: string;
        positive_count: number;
        source_gap_count: number;
        exact_absence_count: number;
        positive_key_sha256: string;
        source_gap_key_sha256: string;
        proposed_source_gap_overlay: {
          blocked_surfaces: string[];
          verdict: string;
        };
      };
    };
  };
  qm68: {
    patterns: Array<{
      pattern_id: string;
      direction_id: string;
      shape_ids: string[];
      period_trip_counts: Array<{ period: string; trip_count: number }>;
      trip_ids_sha256: string;
      stop_ids: string[];
      stop_chain_sha256: string;
    }>;
    required_pattern_id: string;
    exact_midtown_stop_ids: string[];
    schedule_validation: {
      shape_id: string;
      trip_type: string;
      retained_trip_types: string[];
      excluded_trip_types: string[];
      excluded_stop_time_row_counts: Record<string, number>;
      shape_identity_matches: true;
    };
  };
  q67_published_launch_sensitivity: {
    service_date_2025_06_29_pattern_count: 0;
    service_date_2025_06_30_pattern_count: 0;
    correction_bytes_used: false;
    correction_comparison_run: false;
  };
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

describe("Plan 040 accelerated Package 15 evidence freeze", () => {
  const discovery = readJson<Plan040Package15Discovery>(discoveryPath);
  const receipts = Object.fromEntries(
    Object.entries(partitionPaths).map(([name, path]) => [
      name,
      readJson<PartitionReceipt>(path),
    ]),
  ) as Record<keyof typeof partitionPaths, PartitionReceipt>;
  const fullStop = readJson<FullStopReceipt>(
    join(
      receiptRoot,
      "plan-040-accelerated-package-15-qbnr-full-stop-chains-v1.json",
    ),
  );
  const sourceGaps = readJson<{
    candidate_count: number;
    candidate_key_sha256: string;
    semantic_verdict: "blocked_upstream";
    literal_absence_count: 0;
    absent_in_source_projection_permitted: false;
    candidates: Array<{
      candidate_key: string;
      source_gap_overlay: {
        blocked_surfaces: string[];
        verdict: string;
      };
    }>;
  }>(
    join(
      receiptRoot,
      "plan-040-accelerated-package-15-source-gap-overlays-v1.json",
    ),
  );
  const evidence = readJson<Record<string, unknown>>(
    join(riskRoot, "plan-040-accelerated-package-15-evidence-v1.json"),
  );
  const draft = readJson<Record<string, unknown>>(
    join(
      riskRoot,
      "plan-040-accelerated-package-15-evidence-draft-v1.json",
    ),
  );
  const currentFreeze = readJson<{
    observed_commit: string;
    candidate_count: number;
    candidate_key_sha256: string;
    candidate_extent_unreviewed_count: number;
    candidate_grain_unreviewed_count: number;
    outside_package_extent_unreviewed_count: number;
    outside_package_extent_unreviewed_key_sha256: string | null;
    outside_package_grain_unreviewed_count: number;
    outside_package_grain_unreviewed_key_sha256: string | null;
    prefinal_repin_required: boolean;
    current_state_verified: true;
  }>(
    join(
      receiptRoot,
      "plan-040-accelerated-package-15-current-freeze-state-v1.json",
    ),
  );

  test("pins the exact final residual 29 as 16 proposals and 13 nonabsence blocks", () => {
    expect(() => validatePlan040Package15Discovery(discovery)).not.toThrow();
    expect(discovery.source_report.sha256).toBe(
      PLAN040_PACKAGE_15_SOURCE_REPORT_SHA256,
    );
    expect(discovery.base_checkpoint_commit).toBe(
      PLAN040_PACKAGE_15_BASE_CHECKPOINT_COMMIT,
    );
    expect(discovery.exact_scope.candidate_count).toBe(
      PLAN040_PACKAGE_15_CANDIDATE_COUNT,
    );
    expect(discovery.exact_scope.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256,
    );
    expect(discovery.exact_scope.positive_candidate_count).toBe(
      PLAN040_PACKAGE_15_POSITIVE_COUNT,
    );
    expect(discovery.exact_scope.positive_candidate_key_sha256).toBe(
      PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256,
    );
    expect(discovery.exact_scope.terminal_source_gap_count).toBe(
      PLAN040_PACKAGE_15_SOURCE_GAP_COUNT,
    );
    expect(discovery.exact_scope.terminal_source_gap_key_sha256).toBe(
      PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256,
    );
    expect(discovery.exact_scope.actual_absence_count).toBe(
      PLAN040_PACKAGE_15_EXACT_ABSENCE_COUNT,
    );
    const actualDiscoverySha = sha256(readFileSync(discoveryPath));
    if (
      PLAN040_PACKAGE_15_DISCOVERY_SHA256 !==
        "PENDING_POST_PACKAGE_14_REPIN"
    ) {
      expect(actualDiscoverySha).toBe(PLAN040_PACKAGE_15_DISCOVERY_SHA256);
    } else {
      expect(actualDiscoverySha).toHaveLength(64);
    }
  });

  test("keeps the 15/2/12 partitions exact and disjoint", () => {
    const keys = new Set<string>();
    for (const [name, receipt] of Object.entries(receipts) as Array<
      [keyof typeof receipts, PartitionReceipt]
    >) {
      const expected = PLAN040_PACKAGE_15_PARTITIONS[name];
      expect(receipt.partition).toBe(name);
      expect(receipt.candidate_count).toBe(expected.count);
      expect(receipt.candidate_key_sha256).toBe(expected.key_sha256);
      expect(receipt.positive_count).toBe(expected.positive_count);
      expect(receipt.source_gap_count).toBe(expected.source_gap_count);
      expect(receipt.exact_absence_count).toBe(0);
      expect(
        plan040Package15SortedHash(
          receipt.candidates.map((row) => row.candidate_key),
        ),
      ).toBe(expected.key_sha256);
      for (const candidate of receipt.candidates) {
        expect(keys.has(candidate.candidate_key)).toBe(false);
        expect(candidate.exact_candidate_searches.length).toBeGreaterThanOrEqual(
          8,
        );
        expect(candidate.exact_candidate_searches[0]).toBe(
          `candidate_key=${candidate.candidate_key}`,
        );
        keys.add(candidate.candidate_key);
      }
    }
    expect(keys.size).toBe(PLAN040_PACKAGE_15_CANDIDATE_COUNT);
  });

  test("limits program applicability to one exact route component per accepted member", () => {
    const program = receipts.programApplicability15;
    const b12 = program.candidates.filter((row) =>
      row.candidate_key.includes(
        "treatment_b12-deliberate-proactive-service-management",
      )
    );
    const fare = program.candidates.filter((row) =>
      !row.candidate_key.includes(
        "treatment_b12-deliberate-proactive-service-management",
      )
    );
    expect(b12).toHaveLength(1);
    expect(fare).toHaveLength(14);
    for (const candidate of program.candidates) {
      const proposal = candidate.proposed_positive_decisions;
      expect(proposal?.extent_resolution).toBe("route_wide");
      expect(proposal?.extent_components).toEqual([{
        identity_namespace: "gtfs_route_id",
        identifiers: [candidate.gtfs_route_id],
      }]);
    }
    expect(b12[0]?.proposed_positive_decisions?.grain_scope.kind).toBe(
      "not_applicable",
    );
    expect(
      fare.every((row) =>
        row.proposed_positive_decisions?.grain_scope.kind === "all_service"
      ),
    ).toBe(true);
    expect(program.semantic_guardrail?.fare_grain).toContain(
      "no stop, branch, period, or cross-product inference",
    );
    expect(program.semantic_guardrail?.physicality_scope_requirement).toContain(
      "forbids physical-corridor inference",
    );
  });

  test("freezes Q89 exact chains while retaining the unmatched schedule risk", () => {
    const q89Patterns = fullStop.q89.patterns;
    expect(fullStop.q89.same_trip_chain_evidence.exact_gtfs_trip_id_join).toBe(
      true,
    );
    expect(
      fullStop.q89.same_trip_chain_evidence.schedule_trip_id_or_shape_join,
    ).toBe(false);
    expect(fullStop.q89.same_trip_chain_evidence.direction_0_trip_count).toBe(
      39,
    );
    expect(fullStop.q89.same_trip_chain_evidence.direction_1_trip_count).toBe(
      39,
    );
    expect(fullStop.q89.same_trip_chain_evidence.construction).toContain(
      "exact trip_id",
    );
    expect(q89Patterns).toHaveLength(2);
    expect(q89Patterns.map((row) => row.pattern_id).sort()).toEqual([
      "historical-full-stop-pattern:00fc45f5cac25a0b59b8c526",
      "historical-full-stop-pattern:56794d8fd80ba7587fd75ac2",
    ]);
    expect(
      q89Patterns.map((row) => ({
        pattern_id: row.pattern_id,
        direction_id: row.direction_id,
        trip_ids_sha256: row.trip_ids_sha256,
        stop_chain_sha256: row.stop_chain_sha256,
      })),
    ).toEqual([
      {
        pattern_id: "historical-full-stop-pattern:56794d8fd80ba7587fd75ac2",
        direction_id: "0",
        trip_ids_sha256:
          "79ece2368e3ad4d775f995a15b08f9a931a1cefbd2459d2515e3ec6f3e484dd5",
        stop_chain_sha256:
          "a0af3294fa0947b3366d6fc9827cd3e5348bc5fd9e5d48a1e2d5d332b4512232",
      },
      {
        pattern_id: "historical-full-stop-pattern:00fc45f5cac25a0b59b8c526",
        direction_id: "1",
        trip_ids_sha256:
          "8542949abf52c16e7177bc1214ee92c87b476f9285629d7a7bad1d64aea6fe7d",
        stop_chain_sha256:
          "ff346c4051a689f23c3a1e936dcc7ef847fc083ef3355c72a90f934a9a2ccf80",
      },
    ]);
    for (const pattern of q89Patterns) {
      expect(
        sha256(`${pattern.stop_ids.join("\n")}\n`),
      ).toBe(pattern.stop_chain_sha256);
      expect(pattern.headsigns.every((value) => value.includes("RUSH"))).toBe(
        true,
      );
      expect(pattern.period_trip_counts).toEqual([
        { period: "weekend", trip_count: 39 },
      ]);
    }
    expect(fullStop.q89.source_bounded_segment_stop_ids.direction_0).toEqual([
      "500507", "500509", "500512", "504462", "500430",
    ]);
    expect(fullStop.q89.source_bounded_segment_stop_ids.direction_1).toEqual([
      "500369", "500372", "505313", "500454", "500543",
    ]);
    expect(q89Patterns[0]?.stop_ids.slice(16, 21)).toEqual(
      fullStop.q89.source_bounded_segment_stop_ids.direction_0,
    );
    expect(q89Patterns[1]?.stop_ids.slice(2, 7)).toEqual(
      fullStop.q89.source_bounded_segment_stop_ids.direction_1,
    );
    expect(fullStop.q89.schedule_validation.shape_identity_matches).toBe(false);
    expect(fullStop.q89.schedule_validation.retained_trip_types).toEqual(["1"]);
    expect(
      fullStop.q89.schedule_validation.retained_stop_time_row_count,
    ).toBe(585);
    expect(fullStop.q89.schedule_validation.retained_trip_start_count).toBe(78);
    expect(fullStop.q89.schedule_validation.excluded_trip_types).toEqual([
      "2", "3",
    ]);
    expect(
      fullStop.q89.schedule_validation.excluded_stop_time_row_counts,
    ).toEqual({ "2": 42, "3": 42 });
    expect(
      fullStop.q89.schedule_validation.trip_count_matches_at_route_level,
    ).toBe(true);
    expect(fullStop.q89.schedule_validation.passenger_shape_ids).not.toEqual(
      fullStop.q89.schedule_validation.gtfs_shape_ids,
    );
    expect(
      fullStop.q89.schedule_validation.review_disposition,
    ).toContain("dual-review");
    const q89Candidate = receipts.qbnrExactChain2.candidates.find((row) =>
      row.candidate_key === PLAN040_PACKAGE_15_Q89_CANDIDATE_KEY
    );
    expect(q89Candidate?.proposed_verdict).toBe(
      "source_gap_blocked_extent_and_grain",
    );
    expect(q89Candidate?.proposed_positive_decisions).toBeNull();
    expect(q89Candidate?.proposed_source_gap_overlay?.verdict).toBe(
      "blocked_upstream:exact_schedule_to_gtfs_shape_identity+exact_candidate_pattern_revenue_trip_validation",
    );
  });

  test("freezes both deterministic Q89 reviewer outcomes without changing scope", () => {
    const outcomes = fullStop.q89.acceptable_reviewer_outcomes;
    expect(outcomes.selected_outcome).toBe(
      "downgrade_only_q89_to_blocked_upstream",
    );
    expect(
      outcomes.candidate_specific_schedule_gtfs_passenger_join_proven,
    ).toBe(false);
    expect(outcomes.unchanged_scope).toEqual({
      candidate_count: PLAN040_PACKAGE_15_CANDIDATE_COUNT,
      candidate_key_sha256: PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256,
    });
    expect(outcomes.affirm_positive).toMatchObject({
      positive_count: 17,
      source_gap_count: 12,
      exact_absence_count: 0,
      positive_key_sha256:
        PLAN040_PACKAGE_15_Q89_AFFIRM_POSITIVE_KEY_SHA256,
      source_gap_key_sha256:
        PLAN040_PACKAGE_15_Q89_AFFIRM_SOURCE_GAP_KEY_SHA256,
      condition_met_in_frozen_evidence: false,
    });
    expect(outcomes.downgrade_only_q89).toMatchObject({
      changed_candidate_key: PLAN040_PACKAGE_15_Q89_CANDIDATE_KEY,
      positive_count: 16,
      source_gap_count: 13,
      exact_absence_count: 0,
      positive_key_sha256:
        PLAN040_PACKAGE_15_Q89_DOWNGRADE_POSITIVE_KEY_SHA256,
      source_gap_key_sha256:
        PLAN040_PACKAGE_15_Q89_DOWNGRADE_SOURCE_GAP_KEY_SHA256,
      condition_met_in_frozen_evidence: true,
    });
    expect(
      outcomes.downgrade_only_q89.proposed_source_gap_overlay.verdict,
    ).toBe(
      "blocked_upstream:exact_schedule_to_gtfs_shape_identity+exact_candidate_pattern_revenue_trip_validation",
    );
    expect(
      JSON.stringify(
        outcomes.downgrade_only_q89.proposed_source_gap_overlay,
      ),
    ).not.toContain("absent_in_source");
  });

  test("binds QM68 only to the exact Midtown-bound AM pattern and nine stops", () => {
    const qm68Pattern = fullStop.qm68.patterns.find((row) =>
      row.pattern_id === fullStop.qm68.required_pattern_id
    );
    expect(qm68Pattern?.direction_id).toBe("1");
    expect(qm68Pattern?.shape_ids).toEqual(["QM680040"]);
    expect(qm68Pattern?.trip_ids_sha256).toBe(
      "f08c2f708c4e0b908ff1369ce1fca37e2e3ab026d6e4a63fdc7eac21df25b1e3",
    );
    expect(qm68Pattern?.stop_chain_sha256).toBe(
      "341a8c9f27ff99b3eca6b2529e5280dbfe1db627bef73bd48e7d5c6fc86de12c",
    );
    expect(qm68Pattern?.period_trip_counts).toEqual([
      { period: "am_peak", trip_count: 11 },
    ]);
    expect(fullStop.qm68.exact_midtown_stop_ids).toEqual([
      "402144", "402146", "404295", "404877", "404297", "404298",
      "450041", "404300", "904045",
    ]);
    expect(
      fullStop.qm68.exact_midtown_stop_ids.every((stopId) =>
        qm68Pattern?.stop_ids.includes(stopId)
      ),
    ).toBe(true);
    expect(qm68Pattern?.stop_ids.slice(17, 26)).toEqual(
      fullStop.qm68.exact_midtown_stop_ids,
    );
    expect(fullStop.qm68.schedule_validation).toMatchObject({
      shape_id: "QM680040",
      shape_identity_matches: true,
      source_id: "mta_bus_schedules_2025_candidate_windows",
      stop_time_row_count: 55,
      trip_start_count: 11,
      trip_type: "13",
      retained_trip_types: ["13"],
      excluded_trip_types: ["2", "3", "4"],
      excluded_stop_time_row_counts: { "2": 38, "3": 42, "4": 20 },
    });
  });

  test("keeps all 12 inventory gaps blocked_upstream and never absent", () => {
    expect(sourceGaps.candidate_count).toBe(
      PLAN040_PACKAGE_15_SOURCE_GAP_COUNT,
    );
    expect(sourceGaps.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256,
    );
    expect(sourceGaps.semantic_verdict).toBe("blocked_upstream");
    expect(sourceGaps.literal_absence_count).toBe(0);
    expect(sourceGaps.absent_in_source_projection_permitted).toBe(false);
    for (const candidate of sourceGaps.candidates) {
      expect(candidate.source_gap_overlay.blocked_surfaces.sort()).toEqual([
        "member_extent", "member_grain",
      ]);
      expect(candidate.source_gap_overlay.verdict).toStartWith(
        "blocked_upstream:",
      );
      expect(JSON.stringify(candidate.source_gap_overlay)).not.toContain(
        "absent_in_source",
      );
    }
    const inventory = receipts.inventorySourceGap12;
    expect(inventory.ace_missing_source_bytes?.exists).toBe(false);
    expect(inventory.ace_missing_source_bytes?.prior_receipt.sha256).toBe(
      "ff267cf5db39e62c7d432368b74a1d4a39ae7f1071e0c2cb48d6079b0979be0a",
    );
  });

  test("keeps Q67 launch zero-trip and blocked correction states separate", () => {
    expect(
      fullStop.q67_published_launch_sensitivity
        .service_date_2025_06_29_pattern_count,
    ).toBe(0);
    expect(
      fullStop.q67_published_launch_sensitivity
        .service_date_2025_06_30_pattern_count,
    ).toBe(0);
    expect(
      fullStop.q67_published_launch_sensitivity.correction_bytes_used,
    ).toBe(false);
    expect(
      fullStop.q67_published_launch_sensitivity.correction_comparison_run,
    ).toBe(false);
    const sensitivity =
      receipts.inventorySourceGap12.q67_correction_sensitivity;
    expect(
      sensitivity?.corrected_first_week_feed.version_sha1,
    ).toBe("6db867de2ce30f47ae0ee763f422dc34fb7a9f9f");
    expect(sensitivity?.corrected_first_week_feed.comparison_run).toBe(false);
    expect(
      sensitivity?.corrected_first_week_feed.authorizes_positive,
    ).toBe(false);
  });

  test("creates no gate, acceptance, persistence, or downstream authority", () => {
    for (const artifact of [evidence, draft]) {
      expect(artifact.gate_created).toBe(false);
      expect(artifact.owner_acceptance_created).toBe(false);
      expect(artifact.persistence_performed).toBe(false);
      expect(artifact.persisted_extent_decision_count).toBe(0);
      expect(artifact.persisted_grain_decision_count).toBe(0);
      expect(artifact.authorizes_occurrence).toBe(false);
      expect(artifact.authorizes_study).toBe(false);
      expect(artifact.authorizes_cross_product).toBe(false);
      expect(artifact.authorizes_decision_persistence).toBe(false);
    }
  });

  test("pins the final ledger frontier after the post-Package-14 repin", () => {
    expect(currentFreeze.candidate_count).toBe(
      PLAN040_PACKAGE_15_CANDIDATE_COUNT,
    );
    expect(currentFreeze.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256,
    );
    expect(currentFreeze.current_state_verified).toBe(true);
    expect(currentFreeze.observed_commit).toBe(
      PLAN040_PACKAGE_15_BASE_CHECKPOINT_COMMIT,
    );
    expect(currentFreeze.candidate_extent_unreviewed_count).toBe(
      PLAN040_PACKAGE_15_CANDIDATE_COUNT,
    );
    expect(currentFreeze.candidate_grain_unreviewed_count).toBe(
      PLAN040_PACKAGE_15_CANDIDATE_COUNT,
    );
    if (artifactRoot === repoRoot) {
      expect(currentFreeze.prefinal_repin_required).toBe(false);
      expect(currentFreeze.outside_package_extent_unreviewed_count).toBe(0);
      expect(
        currentFreeze.outside_package_extent_unreviewed_key_sha256,
      ).toBeNull();
      expect(currentFreeze.outside_package_grain_unreviewed_count).toBe(0);
      expect(
        currentFreeze.outside_package_grain_unreviewed_key_sha256,
      ).toBeNull();
    } else {
      expect(currentFreeze.prefinal_repin_required).toBe(true);
    }
  });

  test("refuses symlink or changed-byte substitution for immutable receipts", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "plan040-package15-immutable-"),
    );
    const target = join(directory, "target.json");
    const link = join(directory, "receipt.json");
    writeFileSync(target, "{}\n");
    symlinkSync(target, link);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(() =>
      writePlan040Package15ImmutableNormalFile(link, {}, false)
    ).toThrow("not a normal file");

    const normal = join(directory, "normal.json");
    writePlan040Package15ImmutableNormalFile(
      normal,
      { frozen: true },
      false,
    );
    expect(() =>
      writePlan040Package15ImmutableNormalFile(
        normal,
        { frozen: false },
        false,
      )
    ).toThrow("Refusing to overwrite");
  });
});
