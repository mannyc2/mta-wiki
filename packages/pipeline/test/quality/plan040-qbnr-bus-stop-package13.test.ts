import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  PLAN040_PACKAGE_13_CANDIDATE_COUNT,
  PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256,
  PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT,
  PLAN040_PACKAGE_13_EXCLUSION_COUNT,
  PLAN040_PACKAGE_13_POSITIVE_COUNT,
  PLAN040_PACKAGE_13_POSITIVE_KEY_SHA256,
  PLAN040_PACKAGE_13_SIBLING_COUNT,
  PLAN040_PACKAGE_13_TERMINAL_COUNT,
  PLAN040_PACKAGE_13_TERMINAL_KEY_SHA256,
  PLAN040_PACKAGE_13_TERMINAL_RECEIPT_SHA256,
  validatePlan040Package13Evidence,
  type Plan040Package13CandidateEvidence,
  type Plan040Package13Exclusion,
  type Plan040Package13PreservedSibling,
} from "../../src/quality/plan040-qbnr-bus-stop-package13.js";

const riskRoot = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk",
);
const evidencePath = join(
  riskRoot,
  "plan-040-qbnr-bus-stop-package-13-evidence-v1.json",
);
const draftPath = join(
  riskRoot,
  "plan-040-qbnr-bus-stop-package-13-evidence-draft-v1.json",
);
const comparisonPath = join(
  repoRoot,
  "data/quality/acquisition/receipts/member-extent-evidence/" +
    "plan-040-qbnr-bus-stop-package-13-full-stop-comparisons-v1.json",
);
const terminalPath = join(
  repoRoot,
  "data/quality/acquisition/receipts/member-extent-evidence/" +
    "plan-040-qbnr-bus-stop-package-13-terminal-gaps-v1.json",
);
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;

type Evidence = {
  candidates: Plan040Package13CandidateEvidence[];
  preserved_siblings: Plan040Package13PreservedSibling[];
  exclusions: Plan040Package13Exclusion[];
  candidate_key_sha256: string;
  positive_candidate_key_sha256: string;
  terminal_candidate_key_sha256: string;
  exact_absence_count: number;
  immutable_inputs: {
    upstream_pins: Record<string, { path: string; sha256: string }>;
  };
  gate_created: boolean;
  owner_acceptance_created: boolean;
  persistence_performed: boolean;
  authorizes_occurrence: boolean;
  authorizes_study: boolean;
  authorizes_cross_product: boolean;
  authorizes_decision_persistence: boolean;
};
type ComparisonCandidate = {
  candidate_key: string;
  source_statement: { quote: string; full_block: string };
  candidate_stop_list_context: null | {
    exact_referenced_rows: Array<{
      evidence_id: string;
      block_row_sha256: string;
    }>;
  };
  schedule_validation: null | {
    retained_passenger_trip_types: string[];
    excluded_nonrevenue_trip_types: string[];
    passenger_shape_ids: string[];
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
  comparisons: Array<{
    comparison_id: string;
    equivalences: Array<{
      before_stop_id: string;
      after_stop_id: string;
      equivalence_basis: string;
    }>;
  }>;
  exact_identifier_policy: string;
  changed_identifier_equivalence_authorized: false;
};
type ComparisonReceipt = {
  candidates: ComparisonCandidate[];
  derivation: {
    complete_ordered_stop_chains: boolean;
    excluded_nonrevenue_trip_types: string[];
  };
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};
type TerminalReceipt = {
  candidate_count: number;
  exact_absence_count: number;
  candidates: Array<{
    candidate_key: string;
    gap_codes: string[];
    literal_exact_absence: false;
    semantic_verdict: string;
  }>;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

describe("Plan 040 QBNR bus-stop Package 13 evidence freeze", () => {
  const evidence = readJson<Evidence>(evidencePath);
  const comparison = readJson<ComparisonReceipt>(comparisonPath);
  const terminal = readJson<TerminalReceipt>(terminalPath);

  test("freezes the exact 31-member 19/12/0 partition", () => {
    validatePlan040Package13Evidence(evidence);
    const positive = evidence.candidates.filter((row) =>
      row.evidence_verdict === "positive_extent_and_grain_proposed"
    );
    const unresolved = evidence.candidates.filter((row) =>
      row.evidence_verdict === "receipt_terminal_unresolved_preserved"
    );
    expect(evidence.candidates).toHaveLength(PLAN040_PACKAGE_13_CANDIDATE_COUNT);
    expect(positive).toHaveLength(PLAN040_PACKAGE_13_POSITIVE_COUNT);
    expect(unresolved).toHaveLength(PLAN040_PACKAGE_13_TERMINAL_COUNT);
    expect(evidence.exact_absence_count).toBe(
      PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT,
    );
    expect(sortedHash(evidence.candidates.map((row) => row.candidate_key)))
      .toBe(PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256);
    expect(sortedHash(positive.map((row) => row.candidate_key)))
      .toBe(PLAN040_PACKAGE_13_POSITIVE_KEY_SHA256);
    expect(sortedHash(unresolved.map((row) => row.candidate_key)))
      .toBe(PLAN040_PACKAGE_13_TERMINAL_KEY_SHA256);
  });

  test("pins immutable normal-file candidate receipts", () => {
    for (const path of [comparisonPath, terminalPath]) {
      const stat = lstatSync(path);
      expect(stat.isFile()).toBe(true);
      expect(stat.isSymbolicLink()).toBe(false);
    }
    expect(sha256(readFileSync(comparisonPath)))
      .toBe(PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256);
    expect(sha256(readFileSync(terminalPath)))
      .toBe(PLAN040_PACKAGE_13_TERMINAL_RECEIPT_SHA256);
    expect(comparison.candidates).toHaveLength(31);
    expect(terminal.candidates).toHaveLength(12);
  });

  test("retains complete chains, exact-ID-only comparisons, and trip policy", () => {
    expect(comparison.derivation.complete_ordered_stop_chains).toBe(true);
    expect(comparison.derivation.excluded_nonrevenue_trip_types)
      .toEqual(["2", "3", "4"]);
    for (const candidate of comparison.candidates) {
      expect(candidate.source_statement.full_block)
        .toContain(candidate.source_statement.quote);
      for (const pattern of [
        ...candidate.pre_patterns,
        ...candidate.post_patterns,
      ]) {
        expect(pattern.stops).toHaveLength(pattern.stop_count);
        expect(pattern.stop_ids).toEqual(
          pattern.stops.map((stop) => stop.stop_id),
        );
        expect(pattern.stop_chain_sha256).toBe(
          sha256(`${pattern.stop_ids.join("\n")}\n`),
        );
      }
      for (const row of candidate.comparisons) {
        for (const equivalence of row.equivalences) {
          expect(equivalence.before_stop_id).toBe(equivalence.after_stop_id);
          expect(equivalence.equivalence_basis).toBe("identical_stop_id");
        }
      }
      expect(candidate.changed_identifier_equivalence_authorized).toBe(false);
      if (candidate.schedule_validation) {
        expect(candidate.schedule_validation.excluded_nonrevenue_trip_types)
          .toEqual(["2", "3", "4"]);
        expect(candidate.schedule_validation.retained_passenger_trip_types)
          .not.toContain("2");
        expect(candidate.schedule_validation.retained_passenger_trip_types)
          .not.toContain("3");
        expect(candidate.schedule_validation.retained_passenger_trip_types)
          .not.toContain("4");
      }
    }
  });

  test("keeps partial direction grain and immutable lineage reuse precise", () => {
    const byTreatment = new Map(evidence.candidates.map((row) =>
      [row.treatment_record_id, row]));
    for (const [treatment, direction, gap] of [
      ["treatment_q27-limited-stops-2025", "1",
        "post_direction_0_schedule_shape_mismatch"],
      ["treatment_q36-limited-stops-2025", "0",
        "post_direction_1_schedule_shape_mismatch"],
      ["treatment_q85-limited-stops-2025", "0",
        "post_direction_1_schedule_shape_mismatch"],
    ] as const) {
      const candidate = byTreatment.get(treatment)!;
      expect(candidate.proposed_grain_decision?.service_scope.kind)
        .toBe("trip_subset");
      if (candidate.proposed_grain_decision?.service_scope.kind ===
          "trip_subset") {
        expect(candidate.proposed_grain_decision.service_scope.directions)
          .toEqual([direction]);
      }
      expect(candidate.preserved_scope_gap).toBe(gap);
    }
    for (const [treatment, predecessor] of [
      ["treatment_q48-limited-stops-2025", "Q46"],
      ["treatment_q75-limited-stops-2025", "Q30"],
      ["treatment_qm63-midtown-stop-additions-2025", "X63"],
    ] as const) {
      const segments =
        byTreatment.get(treatment)!.proposed_grain_decision!.lineage_segments;
      expect(segments).toHaveLength(2);
      expect(segments.every((row) =>
        row.predecessor_gtfs_route_id === predecessor)).toBe(true);
    }
    const qm63 = byTreatment.get(
      "treatment_qm63-midtown-stop-additions-2025",
    )!;
    expect(qm63.proposed_extent_decision?.resolution).toBe("stop_set");
    expect(qm63.proposed_extent_decision?.components[0]?.identifiers)
      .toEqual([
        "402144", "402146", "404295", "404297", "404298", "404300",
        "404877", "450041", "904045",
      ]);
    if (qm63.proposed_grain_decision?.service_scope.kind === "trip_subset") {
      expect(qm63.proposed_grain_decision.service_scope.directions)
        .toEqual(["1"]);
    }
  });

  test("terminalizes 12 distinct gaps without claiming literal absence", () => {
    expect(terminal.candidate_count).toBe(PLAN040_PACKAGE_13_TERMINAL_COUNT);
    expect(terminal.exact_absence_count).toBe(0);
    expect(terminal.candidates.every((row) =>
      row.literal_exact_absence === false &&
      row.semantic_verdict === "reviewed_terminal_nonauthorizing_gap" &&
      row.gap_codes.length > 0
    )).toBe(true);
    const gaps = new Set(terminal.candidates.flatMap((row) => row.gap_codes));
    expect(gaps.has(
      "effective_2025_08_31_outside_accepted_initial_post_full_stop_window",
    )).toBe(true);
    expect(gaps.has("schedule_gtfs_validation_missing")).toBe(true);
    expect(gaps.has(
      "candidate_named_stop_pair_not_named_and_not_isolatable_from_changed_id_diff",
    )).toBe(true);
  });

  test("preserves 38 siblings and excludes only the exact current five", () => {
    expect(evidence.preserved_siblings).toHaveLength(
      PLAN040_PACKAGE_13_SIBLING_COUNT,
    );
    expect(evidence.exclusions).toHaveLength(PLAN040_PACKAGE_13_EXCLUSION_COUNT);
    const exclusions = evidence.exclusions.map((row) => row.candidate_key);
    expect(exclusions.some((key) =>
      key.endsWith("\0treatment_q24-jamaica-turnaround-2025"))).toBe(true);
    for (const treatment of [
      "treatment_q89-limited-stops-2025",
      "treatment_q67-stop-removal-2025",
      "treatment_qm34-stop-removal-2025",
      "treatment_qm68-midtown-stop-additions-2025",
    ]) {
      expect(exclusions.some((key) => key.endsWith(`\0${treatment}`))).toBe(true);
    }
    expect(exclusions.some((key) =>
      key.includes("treatment_q82-limited-stops-2025"))).toBe(false);
  });

  test("preserves prior package pins and creates no authority", () => {
    expect(Object.keys(evidence.immutable_inputs.upstream_pins).sort())
      .toEqual([
        "package_10d_evidence",
        "package_10d_grain",
        "package_11_evidence",
        "package_12_evidence",
        "package_9_grain",
      ]);
    for (const pin of Object.values(
      evidence.immutable_inputs.upstream_pins,
    )) {
      expect(sha256(readFileSync(join(repoRoot, pin.path)))).toBe(pin.sha256);
    }
    expect(evidence.gate_created).toBe(false);
    expect(evidence.owner_acceptance_created).toBe(false);
    expect(evidence.persistence_performed).toBe(false);
    expect(evidence.authorizes_occurrence).toBe(false);
    expect(evidence.authorizes_study).toBe(false);
    expect(evidence.authorizes_cross_product).toBe(false);
    expect(evidence.authorizes_decision_persistence).toBe(false);
    expect(readFileSync(draftPath, "utf8")).not.toContain(
      '"owner_acceptance_created":true',
    );
  });
});
