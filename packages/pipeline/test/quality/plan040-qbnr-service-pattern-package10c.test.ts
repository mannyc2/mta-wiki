import { describe, expect, it } from "bun:test";
import { corpusIt } from "../support/local-test-profile";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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
  PLAN040_PACKAGE_10C_CANDIDATES,
  PLAN040_PACKAGE_10C_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_10C_COMPARISON_PINS,
  PLAN040_PACKAGE_10C_COMPARISON_RECEIPT_SHA256,
  PLAN040_PACKAGE_10C_EXCLUSION_HASHES,
  PLAN040_PACKAGE_10C_PATTERN_PINS,
  PLAN040_PACKAGE_10C_POST_10B_PINS,
  PLAN040_PACKAGE_10C_Q20_BOUND_PINS,
  PLAN040_PACKAGE_10C_SOURCE_PINS,
  buildPlan040Package10cDraft,
  plan040Package10cReplayHash,
  type Plan040Package10cCandidateEvidence,
  type Plan040Package10cComparisonReceiptRef,
  type Plan040Package10cDraft,
  type Plan040Package10cExclusion,
} from "../../src/quality/plan040-qbnr-service-pattern-package10c";
import type { Plan040Package8VersionSeparation } from
  "../../src/quality/plan040-qbnr-service-pattern-package8";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const evidencePath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-10c-evidence-v1.json`;
const draftPath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-10c-evidence-draft-v1.json`;
const receiptPath =
  `${repoRoot}/data/quality/acquisition/receipts/member-extent-evidence/` +
  "plan-040-qbnr-service-pattern-package-10c-full-stop-equivalence-v1.json";
const EVIDENCE_SHA256 =
  "b77e2be5fe1280785410b1687a9528b70127dd7738f9a61ac522ee5d0773f81b";
const DRAFT_SHA256 =
  "c29b2ad0e83b1dfdc010bde7edfb8a5d907b51d43cce02fe61bd583613731a1d";

type Package10cEvidence = {
  candidate_count: 5;
  route_count: 3;
  candidate_key_sha256: string;
  candidates: Plan040Package10cCandidateEvidence[];
  exclusions: Plan040Package10cExclusion[];
  prior_package_overlap_count: 0;
  comparison_receipt: Plan040Package10cComparisonReceiptRef;
  immutable_inputs: {
    post_10b_pins: typeof PLAN040_PACKAGE_10C_POST_10B_PINS;
    source_artifacts: typeof PLAN040_PACKAGE_10C_SOURCE_PINS;
  };
  version_separation: Plan040Package8VersionSeparation;
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 4;
    receipt_terminal_unresolved_preserved: 1;
  };
  proposed_extent_distribution: {
    route_wide: 3;
    bounded_segment: 1;
    unresolved: 1;
  };
  proposed_grain_distribution: {
    trip_subset: 4;
    unresolved: 1;
  };
  review_protocol: {
    review_mode: string;
    dual_independent_review_required: true;
    owner_gate_created: false;
    owner_acceptance_created: false;
    persistence_performed: false;
  };
  authorization_state: string;
  proposed_extent_decision_count: 4;
  proposed_grain_decision_count: 4;
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
  stop_count: number;
  stop_ids: string[];
  stop_chain_sha256: string;
};
type ComparisonReceipt = {
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
  predecessor_patterns: PatternReceipt[];
  successor_patterns: PatternReceipt[];
  comparisons: ComparisonReceipt[];
  q20_jamaica_candidate_bound_slices: Array<{
    direction_id: string;
    boundary_stop_ids_route_order: string[];
    before_only_stops: Array<{ stop_id: string; disposition: string }>;
    after_only_stops: Array<{ stop_id: string; disposition: string }>;
    changed_interior_identifiers_unresolved: true;
    changed_id_equivalence_authorized: false;
    selected_slice_sha256: string;
  }>;
  q98_non_lineage_context: {
    q58_lineage_status: string;
    q58_schedule_context_is_nonexclusive: true;
    missing_brooklyn_historical_feed_nonblocking: true;
    predecessor_comparison_performed: false;
  };
  equivalence_policy: {
    applied_equivalence: string;
    changed_identifier_equivalence_authorized: false;
    before_only_and_after_only_stops: string;
  };
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
const recomputedPatterns = (
  snapshotId: string,
  date: string,
  routeId: string,
) => fullStopPatternsForDate(
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
  evidence: Package10cEvidence,
  candidates = evidence.candidates,
  exclusions = evidence.exclusions,
  receipt = evidence.comparison_receipt,
) => ({
  evidenceManifestPath:
    "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-10c-evidence-v1.json",
  evidenceManifestSha256: EVIDENCE_SHA256,
  candidates,
  exclusions,
  comparisonReceipt: receipt,
  priorCandidateKeys: [] as string[],
  versionSeparation: evidence.version_separation,
});

describe("Plan 040 QBNR Package 10C mixed-risk evidence freeze", () => {
  it("freezes the exact five-candidate proposal scope and deterministic draft", () => {
    const evidenceBytes = readFileSync(evidencePath);
    const draftBytes = readFileSync(draftPath);
    const evidence = JSON.parse(
      evidenceBytes.toString("utf8"),
    ) as Package10cEvidence;
    const draft = JSON.parse(
      draftBytes.toString("utf8"),
    ) as Plan040Package10cDraft;

    expect(sha256(evidenceBytes)).toBe(EVIDENCE_SHA256);
    expect(sha256(draftBytes)).toBe(DRAFT_SHA256);
    expect(evidence.candidate_count).toBe(5);
    expect(evidence.route_count).toBe(3);
    expect(sortedHash(evidence.candidates.map((row) =>
      row.candidate_key))).toBe(PLAN040_PACKAGE_10C_CANDIDATE_KEY_SHA256);
    expect(evidence.candidates.map((row) => [
      row.gtfs_route_id,
      row.treatment_record_id,
    ]).sort()).toEqual([...PLAN040_PACKAGE_10C_CANDIDATES].sort());
    expect(evidence.evidence_verdict_distribution).toEqual({
      positive_extent_and_grain_proposed: 4,
      receipt_terminal_unresolved_preserved: 1,
    });
    expect(evidence.proposed_extent_distribution).toEqual({
      route_wide: 3,
      bounded_segment: 1,
      unresolved: 1,
    });
    expect(evidence.proposed_grain_distribution).toEqual({
      trip_subset: 4,
      unresolved: 1,
    });
    expect(buildPlan040Package10cDraft(inputFor(evidence))).toEqual(draft);
    expect(plan040Package10cReplayHash(
      draft as unknown as JsonValue,
    )).toBe(sha256(draftBytes));
  });

  corpusIt("recomputes all 11 full-stop patterns and five comparisons from pinned feeds", () => {
    const receiptBytes = readFileSync(receiptPath);
    const receipt = JSON.parse(
      receiptBytes.toString("utf8"),
    ) as ReceiptArtifact;
    expect(sha256(receiptBytes)).toBe(
      PLAN040_PACKAGE_10C_COMPARISON_RECEIPT_SHA256,
    );
    const patterns = [
      ...recomputedPatterns(
        "gtfs-static-20250615-queens-pre-qbnr",
        "2025-06-27",
        "Q20A",
      ),
      ...recomputedPatterns(
        "gtfs-static-20250615-queens-pre-qbnr",
        "2025-06-28",
        "Q48",
      ),
      ...recomputedPatterns(
        "gtfs-static-20250626-queens-post-qbnr",
        "2025-06-29",
        "Q20",
      ),
      ...recomputedPatterns(
        "gtfs-static-20250626-queens-post-qbnr",
        "2025-06-29",
        "Q90",
      ),
      ...recomputedPatterns(
        "gtfs-static-20250626-queens-post-qbnr",
        "2025-06-29",
        "Q98",
      ),
    ];
    expect(patterns).toHaveLength(11);
    const patternPins = Object.values(PLAN040_PACKAGE_10C_PATTERN_PINS);
    for (const pattern of patterns) {
      const pin = patternPins.find((row) =>
        row.pattern_id === pattern.pattern_id);
      expect(pin).toBeDefined();
      expect(pattern.trip_count).toBe(pin!.trip_count);
      expect(sortedHash(pattern.trip_ids)).toBe(pin!.trip_id_sha256);
      expect(pattern.stops).toHaveLength(pin!.stop_count);
      expect(sha256(
        `${pattern.stops.map((stop) => stop.stop_id).join("\n")}\n`,
      )).toBe(pin!.stop_chain_sha256);
    }
    expect(receipt.predecessor_patterns).toHaveLength(5);
    expect(receipt.successor_patterns).toHaveLength(6);
    expect(receipt.comparisons).toHaveLength(5);
    for (const row of receipt.comparisons) {
      const before = patterns.find((pattern) =>
        pattern.pattern_id === row.predecessor_pattern_id)!;
      const after = patterns.find((pattern) =>
        pattern.pattern_id === row.successor_pattern_id)!;
      const comparison = compareFullStopPatterns(before, after);
      const pin = Object.values(PLAN040_PACKAGE_10C_COMPARISON_PINS)
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

  it("keeps Q20 bounds changed-ID unresolved and preserves the Q20 conflict", () => {
    const evidence = readJson<Package10cEvidence>(evidencePath);
    const receipt = readJson<ReceiptArtifact>(receiptPath);
    expect(receipt.q20_jamaica_candidate_bound_slices).toHaveLength(2);
    expect(receipt.q20_jamaica_candidate_bound_slices.map((row) => [
      row.direction_id,
      row.boundary_stop_ids_route_order,
      row.selected_slice_sha256,
    ])).toEqual([
      ["0", ["504980", "504999"], PLAN040_PACKAGE_10C_Q20_BOUND_PINS.direction_0],
      ["1", ["505032", "504559"], PLAN040_PACKAGE_10C_Q20_BOUND_PINS.direction_1],
    ]);
    expect(receipt.q20_jamaica_candidate_bound_slices.every((row) =>
      row.changed_interior_identifiers_unresolved &&
      !row.changed_id_equivalence_authorized &&
      row.before_only_stops.length > 0 &&
      row.after_only_stops.length > 0
    )).toBeTrue();

    const conflict = evidence.candidates.find((row) =>
      row.treatment_record_id ===
        "treatment_q20-q20b-replacement-2025")!;
    const accepted = conflict.accepted_evidence as {
      preserved_occurrence_decision: {
        decision_id: string;
        artifact_sha256: string;
        decision_row_sha256: string;
        review_state: string;
        exact_member_treatment_record_ids: string[];
      };
      scope_conflict: {
        candidate_route_id: string;
        statement_named_replacement_route_id: string;
        canonical_treatment_row_sha256: string;
        ontology_correction_performed: boolean;
        occurrence_decision_changed: boolean;
      };
    };
    expect(conflict.unresolved_gap_codes).toEqual([
      "canonical_treatment_route_scope_conflict",
      "exact_candidate_statement_names_q76_not_q20",
    ]);
    expect(conflict.proposed_extent_decision).toBeNull();
    expect(conflict.proposed_grain_decision).toBeNull();
    expect(accepted.preserved_occurrence_decision).toMatchObject({
      decision_id: "q20-route-redesign-2025-06-29",
      artifact_sha256: PLAN040_PACKAGE_10C_SOURCE_PINS.occurrence_decisions,
      decision_row_sha256:
        PLAN040_PACKAGE_10C_SOURCE_PINS.q20_occurrence_decision_row,
      review_state: "approved",
    });
    expect(accepted.scope_conflict).toEqual({
      candidate_route_id: "Q20",
      candidate_treatment_literal_names_q20b: true,
      statement_named_replacement_route_id: "Q76",
      statement_names_q20_as_replacement_route: false,
      canonical_treatment_row_sha256:
        PLAN040_PACKAGE_10C_SOURCE_PINS.q20_conflict_treatment_row,
      ontology_correction_performed: false,
      occurrence_decision_changed: false,
    });
  });

  it("keeps Q98 as a nonexclusive alternative with no Q58 lineage", () => {
    const evidence = readJson<Package10cEvidence>(evidencePath);
    const receipt = readJson<ReceiptArtifact>(receiptPath);
    const q98 = evidence.candidates.find((row) =>
      row.treatment_record_id ===
        "treatment_q98-flushing-ridgewood-connection-2025")!;
    expect(q98.proposed_extent_decision?.resolution).toBe("route_wide");
    expect(q98.proposed_grain_decision?.lineage_segments).toEqual([]);
    expect(
      (q98.accepted_evidence as {
        predecessor_full_stop_patterns: JsonValue[];
        full_stop_comparisons: JsonValue[];
        q58_lineage: { status: string };
      }).predecessor_full_stop_patterns,
    ).toEqual([]);
    expect(
      (q98.accepted_evidence as {
        full_stop_comparisons: JsonValue[];
      }).full_stop_comparisons,
    ).toEqual([]);
    expect(receipt.q98_non_lineage_context).toEqual({
      exact_statement:
        "The new Q98 will provide a more direct alternative to the Q58 , connecting Flushing to Ridgewood via Horace Harding Expwy and Queens Blvd.",
      q58_lineage_status:
        "not_asserted_alternative_direct_connection_not_replacement",
      q58_schedule_context_is_nonexclusive: true,
      missing_brooklyn_historical_feed_nonblocking: true,
      predecessor_comparison_performed: false,
    });
  });

  it("keeps frozen evidence nonauthorizing through downstream closure", () => {
    const evidence = readJson<Package10cEvidence>(evidencePath);
    for (const exclusion of evidence.exclusions) {
      expect(exclusion.candidate_key_sha256).toBe(
        PLAN040_PACKAGE_10C_EXCLUSION_HASHES[exclusion.scope_id],
      );
      expect(exclusion.candidate_key_sha256).toBe(
        sortedHash(exclusion.candidate_keys),
      );
      expect(exclusion.overlap_count).toBe(0);
    }
    expect(evidence.prior_package_overlap_count).toBe(0);
    expect(evidence.review_protocol).toMatchObject({
      review_mode:
        "dual_independent_mixed_positive_and_scope_conflict_risk_review",
      dual_independent_review_required: true,
      owner_gate_created: false,
      owner_acceptance_created: false,
      persistence_performed: false,
    });
    for (const candidate of evidence.candidates) {
      expect(candidate.persisted_extent_decision).toBeNull();
      expect(candidate.persisted_grain_decision).toBeNull();
      expect(candidate.authorizes_occurrence).toBeFalse();
      expect(candidate.authorizes_study).toBeFalse();
      expect(candidate.authorizes_cross_product).toBeFalse();
      expect(candidate.authorizes_decision_persistence).toBeFalse();
      expect(candidate.exact_candidate_searches.length).toBeGreaterThanOrEqual(7);
    }
    expect(existsSync(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-10c-dual-review-gate-v1.json`,
    )).toBeTrue();
    expect(existsSync(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-10c-owner-acceptance-v1.json`,
    )).toBeTrue();
    expect(existsSync(
      `${repoRoot}/data/quality/operational-reference/member-extent-ledger-decisions/plan-040-qbnr-service-pattern-package-10c-v1.json`,
    )).toBeTrue();
    expect(existsSync(
      `${repoRoot}/data/quality/operational-reference/member-grain-decisions/plan-040-qbnr-service-pattern-package-10c-v1.json`,
    )).toBeTrue();
    expect(receiptPath.includes("/member-extent-evidence/")).toBeTrue();
  });
});
