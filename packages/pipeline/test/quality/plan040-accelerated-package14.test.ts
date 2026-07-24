import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  PLAN040_PACKAGE_14_CANDIDATE_COUNT,
  PLAN040_PACKAGE_14_BASE_CHECKPOINT_COMMIT,
  PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_14_DISCOVERY_SHA256,
  PLAN040_PACKAGE_14_EXACT_ABSENCE_COUNT,
  PLAN040_PACKAGE_14_PACKAGE_13_EXCLUSION_COUNT,
  PLAN040_PACKAGE_14_PACKAGE_13_EXCLUSION_SHA256,
  PLAN040_PACKAGE_14_PARTITIONS,
  PLAN040_PACKAGE_14_POSITIVE_COUNT,
  PLAN040_PACKAGE_14_POSITIVE_KEY_SHA256,
  PLAN040_PACKAGE_14_RESIDUAL_EXCLUSION_COUNT,
  PLAN040_PACKAGE_14_RESIDUAL_EXCLUSION_SHA256,
  PLAN040_PACKAGE_14_SIBLING_COUNT,
  PLAN040_PACKAGE_14_SIBLING_SHA256,
  PLAN040_PACKAGE_14_SOURCE_GAP_COUNT,
  PLAN040_PACKAGE_14_SOURCE_GAP_KEY_SHA256,
  plan040Package14SortedHash,
  validatePlan040Package14Discovery,
  writePlan040Package14ImmutableNormalFile,
  type Plan040Package14Discovery,
} from "../../src/quality/plan040-accelerated-package14.js";

const receiptRoot = join(
  repoRoot,
  "data/quality/acquisition/receipts/member-extent-evidence",
);
const riskRoot = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk",
);
const discoveryPath = join(
  receiptRoot,
  "plan-040-accelerated-package-14-discovery-receipt-v1.json",
);
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

type PartitionReceipt = {
  partition: string;
  candidate_count: number;
  positive_count: number;
  source_gap_count: number;
  exact_absence_count: number;
  candidates: Array<{
    candidate_key: string;
    proposed_verdict: string;
    exact_treatment_evidence_refs: unknown[];
    exact_route_bindings: unknown[];
    proposed_positive_decisions: null | {
      extent_resolution: string;
      extent_components: Array<{
        identity_namespace: string;
        identifiers: string[];
      }>;
      grain_scope: { kind: string };
      positive_basis: string[];
    };
    proposed_source_gap_overlay: null | {
      blocked_surfaces: string[];
      missing_roles: string[];
      source_statement_evidence_id: string;
      verdict: string;
    };
  }>;
  q110_positive_rederivation: null | {
    candidate_key: string;
    pre_service_date: string;
    post_service_date: string;
    pre_snapshot_id: string;
    post_snapshot_id: string;
    version_role: string;
    corrected_first_week_diff_used: boolean;
    exact_identifier_policy: string;
    calendar_policy: string;
    pre_patterns: Array<{
      pattern_id: string;
      direction_id: string;
      stop_chain_sha256: string;
    }>;
    post_patterns: Array<{
      pattern_id: string;
      direction_id: string;
      stop_chain_sha256: string;
    }>;
    dominant_direction_comparisons: Array<{
      comparison_id: string;
      direction_id: string;
      equivalences: Array<{
        before_stop_id: string;
        after_stop_id: string;
        equivalence_basis: string;
      }>;
    }>;
    schedule_validation: {
      all_pre_patterns_passenger: boolean;
      all_post_patterns_passenger: boolean;
      excluded_nonrevenue_trip_types: string[];
      slices: Array<{
        schedule_date: string;
        passenger_shape_ids: string[];
        excluded_shape_ids: string[];
        shape_rows: Array<{ shape_id: string; trip_type: string }>;
      }>;
    };
  };
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};
type SourceGapReceipt = {
  overlay_contract: string;
  candidate_count: number;
  semantic_verdict: string;
  literal_absence_count: number;
  absent_in_source_projection_permitted: false;
  candidates: Array<{
    candidate_key: string;
    exact_treatment_evidence_refs: unknown[];
    exact_route_bindings: unknown[];
    source_gap_overlay: {
      blocked_surfaces: string[];
      missing_roles: string[];
      source_statement_evidence_id: string;
      verdict: string;
    };
  }>;
};
type Q110ChainReceipt = {
  derivation: {
    route_id: "Q110";
    calendar_policy: "calendar_plus_calendar_dates";
    revenue_filter: string;
    exact_identifier_policy: string;
  };
  pre_patterns: Array<{
    pattern_id: string;
    stop_count: number;
    stop_ids: string[];
    stops: Array<{ stop_id: string; stop_name: string }>;
    stop_chain_sha256: string;
  }>;
  post_patterns: Array<{
    pattern_id: string;
    stop_count: number;
    stop_ids: string[];
    stops: Array<{ stop_id: string; stop_name: string }>;
    stop_chain_sha256: string;
  }>;
  version_role: "published_launch_diff";
  corrected_first_week_diff_used: false;
};
type Evidence = {
  candidate_count: number;
  positive_extent_and_grain_count: number;
  blocked_extent_and_grain_count: number;
  exact_absence_count: number;
  partition_receipts: Record<string, { path: string; sha256: string }>;
  q110_complete_ordered_full_stop_chains: { path: string; sha256: string };
  source_gap_receipt: { path: string; sha256: string };
  current_freeze_state: { path: string; sha256: string };
  observed_commit: string;
  historical_discovery_snapshot: {
    observed_commit: string;
    classification: string;
    current_authority: false;
  };
  candidate_state_pins: unknown[];
  gate_created: false;
  owner_acceptance_created: false;
  persistence_performed: false;
  persisted_extent_decision_count: number;
  persisted_grain_decision_count: number;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

describe("Plan 040 accelerated Package 14 evidence freeze", () => {
  const discovery = readJson<Plan040Package14Discovery>(discoveryPath);
  const qbnr6 = readJson<PartitionReceipt>(
    join(receiptRoot, "plan-040-accelerated-package-14-qbnr6-evidence-v1.json"),
  );
  const express20 = readJson<PartitionReceipt>(
    join(
      receiptRoot,
      "plan-040-accelerated-package-14-express20-source-gaps-v1.json",
    ),
  );
  const ace7 = readJson<PartitionReceipt>(
    join(receiptRoot, "plan-040-accelerated-package-14-ace7-evidence-v1.json"),
  );
  const legacySbs3 = readJson<PartitionReceipt>(
    join(
      receiptRoot,
      "plan-040-accelerated-package-14-legacy-sbs3-evidence-v1.json",
    ),
  );
  const sourceGaps = readJson<SourceGapReceipt>(
    join(
      receiptRoot,
      "plan-040-accelerated-package-14-source-gap-overlays-v1.json",
    ),
  );
  const q110Chains = readJson<Q110ChainReceipt>(
    join(
      receiptRoot,
      "plan-040-accelerated-package-14-q110-full-stop-chains-v1.json",
    ),
  );
  const evidence = readJson<Evidence>(
    join(riskRoot, "plan-040-accelerated-package-14-evidence-v1.json"),
  );
  const currentFreeze = readJson<{
    observed_commit: string;
    supersedes_historical_discovery_observed_commit: string;
    current_whole_file_pins: Record<
      string,
      { path: string; sha256: string; size_bytes: number }
    >;
    candidate_current_state: unknown[];
    preserved_sibling_state: unknown[];
    current_state_verified: true;
    authorizes_decision_persistence: false;
  }>(
    join(
      receiptRoot,
      "plan-040-accelerated-package-14-current-freeze-state-v1.json",
    ),
  );

  test("pins the exact 36-key 8-positive/28-source-gap/0-absence scope", () => {
    expect(() => validatePlan040Package14Discovery(discovery)).not.toThrow();
    expect(discovery.exact_scope.candidate_count).toBe(
      PLAN040_PACKAGE_14_CANDIDATE_COUNT,
    );
    expect(discovery.exact_scope.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_14_CANDIDATE_KEY_SHA256,
    );
    expect(discovery.exact_scope.positive_candidate_count).toBe(
      PLAN040_PACKAGE_14_POSITIVE_COUNT,
    );
    expect(discovery.exact_scope.positive_candidate_key_sha256).toBe(
      PLAN040_PACKAGE_14_POSITIVE_KEY_SHA256,
    );
    expect(discovery.exact_scope.terminal_source_gap_count).toBe(
      PLAN040_PACKAGE_14_SOURCE_GAP_COUNT,
    );
    expect(discovery.exact_scope.terminal_source_gap_key_sha256).toBe(
      PLAN040_PACKAGE_14_SOURCE_GAP_KEY_SHA256,
    );
    expect(discovery.exact_scope.actual_absence_count).toBe(
      PLAN040_PACKAGE_14_EXACT_ABSENCE_COUNT,
    );
    expect(sha256(readFileSync(discoveryPath))).toBe(
      PLAN040_PACKAGE_14_DISCOVERY_SHA256,
    );
  });

  test("keeps QBNR6, Express20, ACE7, and SBS3 evidence isolated", () => {
    for (const [receipt, name] of [
      [qbnr6, "qbnr6"],
      [express20, "express20"],
      [ace7, "ace7"],
      [legacySbs3, "legacySbs3"],
    ] as const) {
      const expected = PLAN040_PACKAGE_14_PARTITIONS[name];
      expect(receipt.partition).toBe(name);
      expect(receipt.candidate_count).toBe(expected.count);
      expect(receipt.positive_count).toBe(expected.positive_count);
      expect(receipt.source_gap_count).toBe(expected.source_gap_count);
      expect(receipt.exact_absence_count).toBe(0);
      expect(
        plan040Package14SortedHash(
          receipt.candidates.map((row) => row.candidate_key),
        ),
      ).toBe(expected.key_sha256);
    }
  });

  test("pins Package 13, residual 29, siblings, and prior decision state", () => {
    expect(discovery.preservation.package_13_exclusion_count).toBe(
      PLAN040_PACKAGE_14_PACKAGE_13_EXCLUSION_COUNT,
    );
    expect(discovery.preservation.package_13_exclusion_key_sha256).toBe(
      PLAN040_PACKAGE_14_PACKAGE_13_EXCLUSION_SHA256,
    );
    expect(discovery.preservation.residual_exclusion_count).toBe(
      PLAN040_PACKAGE_14_RESIDUAL_EXCLUSION_COUNT,
    );
    expect(discovery.preservation.residual_exclusion_key_sha256).toBe(
      PLAN040_PACKAGE_14_RESIDUAL_EXCLUSION_SHA256,
    );
    expect(discovery.preservation.same_occurrence_sibling_count).toBe(
      PLAN040_PACKAGE_14_SIBLING_COUNT,
    );
    expect(discovery.preservation.same_occurrence_sibling_key_sha256).toBe(
      PLAN040_PACKAGE_14_SIBLING_SHA256,
    );
    expect(evidence.candidate_state_pins).toHaveLength(
      PLAN040_PACKAGE_14_CANDIDATE_COUNT,
    );
  });

  test("supersedes stale discovery commit pins with the exact repaired checkpoint", () => {
    expect(currentFreeze.observed_commit).toBe(
      PLAN040_PACKAGE_14_BASE_CHECKPOINT_COMMIT,
    );
    expect(currentFreeze.supersedes_historical_discovery_observed_commit).toBe(
      discovery.observed_commit,
    );
    expect(evidence.observed_commit).toBe(
      PLAN040_PACKAGE_14_BASE_CHECKPOINT_COMMIT,
    );
    expect(evidence.historical_discovery_snapshot.observed_commit).toBe(
      discovery.observed_commit,
    );
    expect(evidence.historical_discovery_snapshot.classification).toContain(
      "historical_discovery_snapshot_only",
    );
    expect(evidence.historical_discovery_snapshot.current_authority).toBe(false);
    expect(currentFreeze.current_state_verified).toBe(true);
    expect(currentFreeze.authorizes_decision_persistence).toBe(false);
    expect(currentFreeze.candidate_current_state).toHaveLength(36);
    expect(currentFreeze.preserved_sibling_state).toHaveLength(3);
    for (const [name, pin] of Object.entries(
      currentFreeze.current_whole_file_pins,
    )) {
      expect(pin.size_bytes).toBeGreaterThan(0);
      expect(pin.sha256).toMatch(/^[0-9a-f]{64}$/);
      if (name !== "extentLedger" && name !== "grainLedger") {
        const bytes = readFileSync(join(repoRoot, pin.path));
        expect(bytes.byteLength).toBe(pin.size_bytes);
        expect(sha256(bytes)).toBe(pin.sha256);
      }
    }
  });

  test("Q110 uses calendar-expanded initial BusCo full-stop chains only", () => {
    const q110 = qbnr6.q110_positive_rederivation;
    expect(q110).not.toBeNull();
    if (q110 === null) throw new Error("Q110 receipt missing");
    expect(q110.pre_service_date).toBe("2025-06-27");
    expect(q110.post_service_date).toBe("2025-06-30");
    expect(q110.pre_snapshot_id).toBe("gtfs-static-20250625-busco-pre-qbnr");
    expect(q110.post_snapshot_id).toBe("gtfs-static-20250626-busco-post-qbnr");
    expect(q110.calendar_policy).toContain("calendar");
    expect(q110.calendar_policy).toContain("calendar_dates");
    expect(q110.version_role).toBe("published_launch_diff");
    expect(q110.corrected_first_week_diff_used).toBe(false);
    expect(q110.pre_patterns.length).toBeGreaterThan(0);
    expect(q110.post_patterns.length).toBeGreaterThan(0);
    expect(
      q110.pre_patterns.every((row) =>
        row.pattern_id.startsWith("historical-full-stop-pattern:")
      ),
    ).toBe(true);
    expect(
      q110.post_patterns.every((row) =>
        row.pattern_id.startsWith("historical-full-stop-pattern:")
      ),
    ).toBe(true);
  });

  test("Q110 excludes trip_type 2/3/4 and uses identical stop IDs only", () => {
    const q110 = qbnr6.q110_positive_rederivation;
    if (q110 === null) throw new Error("Q110 receipt missing");
    expect(q110.schedule_validation.excluded_nonrevenue_trip_types).toEqual([
      "2",
      "3",
      "4",
    ]);
    expect(q110.schedule_validation.all_pre_patterns_passenger).toBe(true);
    expect(q110.schedule_validation.all_post_patterns_passenger).toBe(true);
    for (const slice of q110.schedule_validation.slices) {
      const byShape = new Map(
        slice.shape_rows.map((row) => [row.shape_id, row.trip_type]),
      );
      expect(
        slice.passenger_shape_ids.every((shape) => byShape.get(shape) === "1"),
      ).toBe(true);
      expect(
        slice.excluded_shape_ids.every((shape) =>
          ["2", "3", "4"].includes(byShape.get(shape) ?? "")
        ),
      ).toBe(true);
    }
    for (const comparison of q110.dominant_direction_comparisons) {
      expect(
        comparison.equivalences.every((row) =>
          row.before_stop_id === row.after_stop_id &&
          row.equivalence_basis === "identical_stop_id"
        ),
      ).toBe(true);
    }
  });

  test("Q110 freezes every selected complete ordered stop chain", () => {
    const q110 = qbnr6.q110_positive_rederivation;
    if (q110 === null) throw new Error("Q110 receipt missing");
    expect(q110Chains.derivation.route_id).toBe("Q110");
    expect(q110Chains.derivation.calendar_policy).toBe(
      "calendar_plus_calendar_dates",
    );
    expect(q110Chains.derivation.revenue_filter).toContain("trip_type_1");
    expect(q110Chains.version_role).toBe("published_launch_diff");
    expect(q110Chains.corrected_first_week_diff_used).toBe(false);
    expect(q110Chains.pre_patterns).toHaveLength(q110.pre_patterns.length);
    expect(q110Chains.post_patterns).toHaveLength(q110.post_patterns.length);
    const summaries = new Map(
      [...q110.pre_patterns, ...q110.post_patterns].map((row) => [
        row.pattern_id,
        row,
      ]),
    );
    for (const pattern of [
      ...q110Chains.pre_patterns,
      ...q110Chains.post_patterns,
    ]) {
      const summary = summaries.get(pattern.pattern_id);
      expect(summary).toBeDefined();
      expect(pattern.stop_ids).toHaveLength(pattern.stop_count);
      expect(pattern.stops).toHaveLength(pattern.stop_count);
      expect(pattern.stop_count).toBeGreaterThan(1);
      expect(pattern.stop_chain_sha256).toBe(summary?.stop_chain_sha256);
      expect(
        sha256(`${pattern.stop_ids.join("\n")}\n`),
      ).toBe(pattern.stop_chain_sha256);
      expect(
        pattern.stops.map((stop) => stop.stop_id),
      ).toEqual(pattern.stop_ids);
    }
  });

  test("ACE positives are exactly B60/B68/M57 and Bx20/Bx3/Bx7 route-wide", () => {
    const positiveRoutes = ace7.candidates
      .filter((row) => row.proposed_verdict === "positive_extent_and_grain")
      .map((row) => row.candidate_key.split("\0")[1])
      .sort();
    expect(positiveRoutes).toEqual([
      "route_b60",
      "route_b68-nyct-2025",
      "route_bx20-ace",
      "route_bx3",
      "route_bx7-ace",
      "route_m57-nyct-2025",
    ]);
    for (const candidate of ace7.candidates) {
      if (candidate.proposed_positive_decisions === null) continue;
      expect(candidate.proposed_positive_decisions.extent_resolution).toBe(
        "route_wide",
      );
      expect(candidate.proposed_positive_decisions.grain_scope.kind).toBe(
        "not_applicable",
      );
    }
    const bx36 = ace7.candidates.find((row) =>
      row.candidate_key.includes("\0route_bx36\0")
    );
    expect(bx36?.proposed_source_gap_overlay?.missing_roles).toContain(
      "ace_corridor_endpoint_inventory",
    );
  });

  test("M86 RTI is exactly nine direction-qualified source literals", () => {
    const rti = legacySbs3.candidates.find((row) =>
      row.candidate_key.endsWith("\0treatment_real-time-info-m86")
    );
    const proposal = rti?.proposed_positive_decisions;
    expect(proposal?.extent_resolution).toBe("stop_set");
    expect(proposal?.grain_scope.kind).toBe("not_applicable");
    expect(proposal?.extent_components).toHaveLength(1);
    expect(proposal?.extent_components[0]?.identity_namespace).toBe(
      "source_literal_v1",
    );
    expect(
      [...(proposal?.extent_components[0]?.identifiers ?? [])].sort(),
    ).toEqual([
      "eastbound:Amsterdam Avenue",
      "eastbound:Central Park West",
      "eastbound:Columbus Avenue",
      "eastbound:First Avenue",
      "eastbound:Madison Avenue",
      "westbound:Central Park West",
      "westbound:Columbus Avenue",
      "westbound:Fifth Avenue",
      "westbound:York Avenue & E 87th Street",
    ]);
  });

  test("all 28 source statements remain nonabsence blocked overlays", () => {
    expect(sourceGaps.overlay_contract).toBe("member-source-gap-overlay-v1");
    expect(sourceGaps.candidate_count).toBe(PLAN040_PACKAGE_14_SOURCE_GAP_COUNT);
    expect(sourceGaps.semantic_verdict).toBe("blocked_upstream");
    expect(sourceGaps.literal_absence_count).toBe(0);
    expect(sourceGaps.absent_in_source_projection_permitted).toBe(false);
    for (const candidate of sourceGaps.candidates) {
      expect(candidate.exact_treatment_evidence_refs.length).toBeGreaterThan(0);
      expect(candidate.exact_route_bindings.length).toBeGreaterThan(0);
      expect(candidate.source_gap_overlay.blocked_surfaces).toEqual([
        "member_extent",
        "member_grain",
      ]);
      expect(candidate.source_gap_overlay.missing_roles.length).toBeGreaterThan(
        0,
      );
      expect(candidate.source_gap_overlay.source_statement_evidence_id).not
        .toBe("");
      expect(candidate.source_gap_overlay.verdict).toStartWith(
        "blocked_upstream:",
      );
    }
    expect(
      sourceGaps.candidates.some((candidate) =>
        candidate.source_gap_overlay.verdict.includes("absent_in_source")
      ),
    ).toBe(false);
  });

  test("freezes normal files with no gate, acceptance, persistence, or authority", () => {
    const artifactPaths = [
      discoveryPath,
      ...Object.values(evidence.partition_receipts).map((ref) =>
        join(repoRoot, ref.path)
      ),
      join(repoRoot, evidence.q110_complete_ordered_full_stop_chains.path),
      join(repoRoot, evidence.source_gap_receipt.path),
      join(repoRoot, evidence.current_freeze_state.path),
      join(riskRoot, "plan-040-accelerated-package-14-evidence-v1.json"),
      join(riskRoot, "plan-040-accelerated-package-14-evidence-draft-v1.json"),
    ];
    for (const path of artifactPaths) {
      const stat = lstatSync(path);
      expect(stat.isFile()).toBe(true);
      expect(stat.isSymbolicLink()).toBe(false);
    }
    for (const ref of [
      ...Object.values(evidence.partition_receipts),
      evidence.q110_complete_ordered_full_stop_chains,
      evidence.source_gap_receipt,
      evidence.current_freeze_state,
    ]) {
      expect(sha256(readFileSync(join(repoRoot, ref.path)))).toBe(ref.sha256);
    }
    expect(evidence.candidate_count).toBe(36);
    expect(evidence.positive_extent_and_grain_count).toBe(8);
    expect(evidence.blocked_extent_and_grain_count).toBe(28);
    expect(evidence.exact_absence_count).toBe(0);
    expect(evidence.gate_created).toBe(false);
    expect(evidence.owner_acceptance_created).toBe(false);
    expect(evidence.persistence_performed).toBe(false);
    expect(evidence.persisted_extent_decision_count).toBe(0);
    expect(evidence.persisted_grain_decision_count).toBe(0);
    expect(evidence.authorizes_occurrence).toBe(false);
    expect(evidence.authorizes_study).toBe(false);
    expect(evidence.authorizes_cross_product).toBe(false);
    expect(evidence.authorizes_decision_persistence).toBe(false);
  });

  test("immutable receipt writes refuse drift and non-normal paths", () => {
    const root = mkdtempSync(join(tmpdir(), "plan040-package14-immutable-"));
    const receipt = join(root, "receipt.json");
    const missingCheck = join(root, "missing-check.json");
    const target = join(root, "target.json");
    const link = join(root, "link.json");
    const value = { receipt_id: "fixture", schema_version: 1 };
    writePlan040Package14ImmutableNormalFile(receipt, value, false);
    const original = readFileSync(receipt, "utf8");
    expect(() =>
      writePlan040Package14ImmutableNormalFile(receipt, value, false)
    ).not.toThrow();
    expect(readFileSync(receipt, "utf8")).toBe(original);
    expect(() =>
      writePlan040Package14ImmutableNormalFile(
        receipt,
        { receipt_id: "drift", schema_version: 1 },
        false,
      )
    ).toThrow("Refusing to overwrite frozen receipt");
    expect(() =>
      writePlan040Package14ImmutableNormalFile(missingCheck, value, true)
    ).toThrow("Missing frozen receipt");
    writeFileSync(target, "{}\n");
    symlinkSync(target, link);
    expect(() =>
      writePlan040Package14ImmutableNormalFile(link, value, false)
    ).toThrow("Frozen receipt is not a normal file");
  });
});
