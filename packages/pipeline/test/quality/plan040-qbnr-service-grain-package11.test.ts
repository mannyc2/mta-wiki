import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import type { JsonValue } from "../../../db/src/types";
import {
  PLAN040_PACKAGE_11_CANDIDATES,
  PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_11_GLOBAL_PINS,
  PLAN040_PACKAGE_11_GRAIN_ONLY_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_11_POSITIVE_PATTERN_PINS,
  PLAN040_PACKAGE_11_POSITIVE_PATTERN_RECEIPT_SHA256,
  PLAN040_PACKAGE_11_Q82_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_11_Q82_PATTERN_IDS,
  PLAN040_PACKAGE_11_QM68_COMPARISON_IDS,
  buildPlan040Package11Draft,
  plan040Package11ReplayHash,
  type Plan040Package11CandidateEvidence,
  type Plan040Package11Draft,
  type Plan040Package11Exclusion,
  type Plan040Package11PositivePatternReceiptRef,
} from "../../src/quality/plan040-qbnr-service-grain-package11";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const evidencePath =
  `${riskRoot}/plan-040-qbnr-service-grain-package-11-evidence-v1.json`;
const draftPath =
  `${riskRoot}/plan-040-qbnr-service-grain-package-11-evidence-draft-v1.json`;
const positivePatternReceiptPath =
  `${repoRoot}/data/quality/acquisition/receipts/member-extent-evidence/` +
  "plan-040-qbnr-service-grain-package-11-positive-patterns-v1.json";
const EVIDENCE_SHA256 =
  "149d71d7aa82a3b1e4a6161ac232fe0bde921dee1cf6510aaa725fd16b51ffa7";
const DRAFT_SHA256 =
  "b2acc40f1318fae9eac127cea796273601327d959c89f26674887ae5af612e7b";

type Package11Evidence = {
  candidate_count: 12;
  route_count: 7;
  candidate_key_sha256: string;
  candidate_scope_discovery: {
    q82_candidate_key_sha256: string;
    grain_only_11_candidate_key_sha256: string;
    combined_12_candidate_key_sha256: string;
    rejected_supplied_discovery_sha256_prefix: "b8929342";
    rejected_hash_is_authoritative: false;
  };
  candidates: Plan040Package11CandidateEvidence[];
  exclusions: Plan040Package11Exclusion[];
  positive_pattern_receipt: Plan040Package11PositivePatternReceiptRef;
  immutable_inputs: typeof PLAN040_PACKAGE_11_GLOBAL_PINS;
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 1;
    positive_grain_only_proposed: 4;
    structured_unresolved_grain_proposed: 7;
  };
  proposed_extent_distribution: { bounded_segment: 1 };
  proposed_grain_distribution: {
    periods: 1;
    trip_subset: 3;
    all_service: 1;
    unresolved: 7;
  };
  review_protocol: {
    independent_review_required: true;
    dual_independent_review_required: true;
    owner_gate_created: false;
    owner_acceptance_created: false;
    persistence_performed: false;
  };
  external_acquisition_performed: false;
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
const inputFor = (
  evidence: Package11Evidence,
  candidates = evidence.candidates,
  exclusions = evidence.exclusions,
) => ({
  evidenceManifestPath:
    "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-grain-package-11-evidence-v1.json",
  evidenceManifestSha256: EVIDENCE_SHA256,
  candidates,
  exclusions,
  positivePatternReceipt: evidence.positive_pattern_receipt,
});

describe("Plan 040 Package 11 residual service-grain evidence freeze", () => {
  const evidenceBytes = readFileSync(evidencePath);
  const draftBytes = readFileSync(draftPath);
  const evidence = JSON.parse(
    evidenceBytes.toString("utf8"),
  ) as Package11Evidence;
  const draft = JSON.parse(
    draftBytes.toString("utf8"),
  ) as Plan040Package11Draft;

  it("freezes the corrected exact 12-candidate discovery and replay", () => {
    const receiptStat = lstatSync(positivePatternReceiptPath);
    expect(sha256(evidenceBytes)).toBe(EVIDENCE_SHA256);
    expect(sha256(draftBytes)).toBe(DRAFT_SHA256);
    expect(sha256(readFileSync(positivePatternReceiptPath))).toBe(
      PLAN040_PACKAGE_11_POSITIVE_PATTERN_RECEIPT_SHA256,
    );
    expect(receiptStat.isFile()).toBe(true);
    expect(receiptStat.isSymbolicLink()).toBe(false);
    expect(evidence.positive_pattern_receipt).toEqual(
      draft.positive_pattern_receipt,
    );
    expect(evidence.candidate_count).toBe(12);
    expect(evidence.route_count).toBe(7);
    expect(sortedHash(evidence.candidates.map((row) =>
      row.candidate_key))).toBe(PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256);
    expect(sortedHash([evidence.candidates[0]!.candidate_key])).toBe(
      PLAN040_PACKAGE_11_Q82_CANDIDATE_KEY_SHA256,
    );
    expect(sortedHash(evidence.candidates.slice(1).map((row) =>
      row.candidate_key))).toBe(
      PLAN040_PACKAGE_11_GRAIN_ONLY_CANDIDATE_KEY_SHA256,
    );
    expect(evidence.candidate_scope_discovery).toEqual({
      q82_candidate_key_sha256:
        PLAN040_PACKAGE_11_Q82_CANDIDATE_KEY_SHA256,
      grain_only_11_candidate_key_sha256:
        PLAN040_PACKAGE_11_GRAIN_ONLY_CANDIDATE_KEY_SHA256,
      combined_12_candidate_key_sha256:
        PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256,
      rejected_supplied_discovery_sha256_prefix: "b8929342",
      rejected_hash_is_authoritative: false,
    });
    expect(buildPlan040Package11Draft(inputFor(evidence))).toEqual(draft);
    expect(plan040Package11ReplayHash(
      draft as unknown as JsonValue,
    )).toBe(sha256(draftBytes));
  });

  it("keeps exactly the requested route-treatment members", () => {
    expect(evidence.candidates.map((row) => [
      row.gtfs_route_id,
      row.treatment_record_id,
    ])).toEqual([...PLAN040_PACKAGE_11_CANDIDATES]);
    expect(evidence.candidates.some((row) =>
      row.treatment_record_id ===
        "treatment_qm68-midtown-stop-additions-2025")).toBe(false);
  });

  it("proposes the exact Q82 Hillside extent and weekend grain", () => {
    const q82 = evidence.candidates[0]!;
    expect(q82.treatment_record_id).toBe("treatment_q82-limited-stops-2025");
    expect(q82.proposed_extent_decision?.resolution).toBe("bounded_segment");
    expect(q82.proposed_extent_decision?.components.flatMap((row) =>
      row.identifiers).sort()).toEqual([
      "500018", "500022", "500072", "500074", "500080", "501414",
      "501908", "503965", "503984", "505096",
    ]);
    expect(q82.proposed_grain_decision.service_scope).toEqual({
      kind: "trip_subset",
      periods: ["weekend"],
      directions: ["0", "1"],
      pattern_ids: [...PLAN040_PACKAGE_11_Q82_PATTERN_IDS],
      description:
        "Weekend passenger trips on both accepted initial Q82 patterns.",
    });
    expect(q82.proposed_grain_decision.lineage_segments).toEqual([]);
    expect(q82.accepted_evidence.q82_scope_review).toMatchObject({
      predecessor_route_selected: null,
      local_service_routes_are_context_only: ["Q1", "Q3", "Q76"],
      package_10b_sibling_decisions_changed: false,
      q89_residual_exclusion_changed: false,
    });
  });

  it("freezes four positive grain-only proposals and seven unresolved rows", () => {
    expect(evidence.evidence_verdict_distribution).toEqual({
      positive_extent_and_grain_proposed: 1,
      positive_grain_only_proposed: 4,
      structured_unresolved_grain_proposed: 7,
    });
    expect(evidence.proposed_grain_distribution).toEqual({
      periods: 1,
      trip_subset: 3,
      all_service: 1,
      unresolved: 7,
    });
    const positive = evidence.candidates.filter((row) =>
      row.evidence_verdict === "positive_grain_only_proposed");
    const unresolved = evidence.candidates.filter((row) =>
      row.evidence_verdict === "structured_unresolved_grain_proposed");
    expect(positive.map((row) => row.treatment_record_id)).toEqual([
      "treatment_q45-all-day-frequent-service-2025",
      "treatment_q45-direct-connection-2025",
      "treatment_q86-limited-stops-2025",
      "treatment_qm68-route-rename-2025",
    ]);
    expect(unresolved).toHaveLength(7);
    expect(unresolved.every((row) =>
      row.proposed_grain_decision.service_scope.kind === "unresolved" &&
      row.unresolved_gap_codes.length > 0 &&
      (row.accepted_evidence.post_acceptance_disposition as {
        prospective_ledger_verdict: string;
        current_ledger_changed: boolean;
      }).prospective_ledger_verdict === "blocked_upstream" &&
      !(row.accepted_evidence.post_acceptance_disposition as {
        current_ledger_changed: boolean;
      }).current_ledger_changed
    )).toBe(true);
    const q80 = unresolved.find((row) => row.gtfs_route_id === "Q80")!;
    expect(q80.accepted_evidence.schedule_and_pattern_context).toMatchObject({
      schedule_date: "2025-08-31",
      total_stop_time_row_count: 844,
      trip_type_stop_time_row_counts: {
        "1": 780,
        "2": 30,
        "3": 28,
        "4": 6,
      },
      accepted_post_gtfs_end_date: "2025-08-30",
      effective_date_full_stop_inventory_present: false,
    });
    expect(q80.unresolved_gap_codes).toEqual([
      "effective_date_full_stop_inventory",
      "frequency_evidence",
      "later_feed_lineage",
    ]);
  });

  it("binds Q45 and Q86 to exact accepted GTFS patterns and trip counts", () => {
    for (
      const [routeId, stopRows, tripStarts] of [
        ["Q45", [288, 300], [72, 75]],
        ["Q86", [296, 324], [36, 37]],
      ] as const
    ) {
      const candidate = evidence.candidates.find((row) =>
        row.gtfs_route_id === routeId &&
        row.evidence_verdict === "positive_grain_only_proposed")!;
      const accepted = candidate.accepted_evidence as {
        accepted_gtfs_patterns: Array<{
          pattern_id: string;
          trip_count: number;
          trip_id_sha256: string;
          stop_chain_sha256: string;
        }>;
        schedule_and_pattern_context: {
          passenger_schedule_rows: Array<{
            stop_time_row_count: number;
            trip_start_count: number;
          }>;
        };
      };
      const pins = Object.values(PLAN040_PACKAGE_11_POSITIVE_PATTERN_PINS)
        .filter((pin) => pin.route_id === routeId);
      expect(accepted.accepted_gtfs_patterns).toHaveLength(2);
      expect(pins.every((pin) => accepted.accepted_gtfs_patterns.some(
        (row) =>
          row.pattern_id === pin.pattern_id &&
          row.trip_count === pin.trip_count &&
          row.trip_id_sha256 === pin.trip_id_sha256 &&
          row.stop_chain_sha256 === pin.stop_chain_sha256,
      ))).toBe(true);
      expect(accepted.schedule_and_pattern_context.passenger_schedule_rows
        .map((row) => row.stop_time_row_count).sort((a, b) => a - b))
        .toEqual([...stopRows]);
      expect(accepted.schedule_and_pattern_context.passenger_schedule_rows
        .map((row) => row.trip_start_count).sort((a, b) => a - b))
        .toEqual([...tripStarts]);
      expect(candidate.proposed_grain_decision.evidence_bindings.filter(
        (row) => row.role === "accepted_ordered_full_stop_pattern",
      )).toHaveLength(2);
      expect(candidate.proposed_grain_decision.evidence_bindings.some(
        (row) => row.evidence_id.endsWith("#blocks"),
      )).toBe(false);
    }
  });

  it("deduplicates QM68 lineage to three segments while binding four comparisons", () => {
    const qm68 = evidence.candidates.find((row) =>
      row.treatment_record_id === "treatment_qm68-route-rename-2025")!;
    expect(qm68.proposed_grain_decision.service_scope).toEqual({
      kind: "all_service",
    });
    expect(qm68.proposed_grain_decision.lineage_segments).toHaveLength(3);
    expect(qm68.proposed_grain_decision.lineage_segments.map((row) =>
      row.boundary_stop_ids)).toEqual([
      ["402143", "502079"],
      ["502091", "551691"],
      ["502091", "904045"],
    ]);
    expect(qm68.proposed_grain_decision.evidence_bindings.filter((row) =>
      row.role === "lineage_comparison").map((row) => row.record_id).sort())
      .toEqual([...PLAN040_PACKAGE_11_QM68_COMPARISON_IDS].sort());
    expect(qm68.accepted_evidence.schedule_policy).toEqual({
      excluded_trip_types: ["2", "3", "4"],
      retained_passenger_stop_time_row_count: 105,
      retained_passenger_trip_start_count: 21,
      retained_trip_types: ["13"],
    });
  });

  it("pins prior ledgers, receipts, exclusions, and all nonauthority flags", () => {
    expect(evidence.immutable_inputs).toEqual(PLAN040_PACKAGE_11_GLOBAL_PINS);
    expect(evidence.exclusions.map((row) => row.scope_id)).toEqual([
      "q89_residual_limited_stop",
      "qm68_midtown_stop_additions",
      "package_10b_accepted_sibling_decisions",
      "package_10d_q48_limited_stop_sibling",
      "historical_old_q48_context",
    ]);
    expect(evidence.exclusions[0]!.candidate_keys[0]!.endsWith(
      "\0treatment_q89-limited-stops-2025",
    )).toBe(true);
    expect(evidence.exclusions[3]!.preservation_evidence).toMatchObject({
      extent_ledger_row_sha256:
        "15bc0ac4d8e324d486bff5a21fcdfc829d086f21991371570657ecce941442b4",
      grain_ledger_row_sha256:
        "ccbfb6e8094dda3fcb0f0576b9b249aabc6e9bdacf4fa0c21268f51fbc8df8a0",
      accepted_main_extent_ledger_row_sha256:
        "746fb66028ded6478dff38eb634de6378b88631f0c3b7ec9b7ac0255ee481957",
      accepted_main_grain_ledger_row_sha256:
        "da8251518fbfedabb8c2cb8bb1c866fc4aa7a7b3627db21b0918e8f22f27937d",
    });
    expect(evidence.exclusions[4]!.preservation_evidence).toMatchObject({
      treatment_row_sha256:
        "5a2e8b5b03f3523698593ac8de1df1f2d8ccc5bab35916c5671ba9053fda2bbb",
      route_row_sha256:
        "1d4763a12754ca0242e8ed4bcb08eaf00992f079792e0107435e52115a2a9957",
      occurrence_membership_present: false,
      extent_ledger_row_count: 0,
      grain_ledger_row_count: 0,
    });
    expect(evidence.candidates.every((row) =>
      row.prior_ledger_state.grain_row.verdict === "unreviewed" &&
      row.persisted_extent_decision === null &&
      row.persisted_grain_decision === null &&
      !row.authorizes_occurrence &&
      !row.authorizes_study &&
      !row.authorizes_cross_product &&
      !row.authorizes_decision_persistence
    )).toBe(true);
    expect(evidence.review_protocol).toMatchObject({
      independent_review_required: true,
      dual_independent_review_required: true,
      owner_gate_created: false,
      owner_acceptance_created: false,
      persistence_performed: false,
    });
    expect(evidence.external_acquisition_performed).toBe(false);
    expect(evidence.authorizes_occurrence).toBe(false);
    expect(evidence.authorizes_study).toBe(false);
    expect(evidence.authorizes_cross_product).toBe(false);
    expect(evidence.authorizes_decision_persistence).toBe(false);
  });

  it("fails closed on Q82 scope or Q86 temporal-selector drift", () => {
    const q82Tamper = clone(evidence.candidates);
    q82Tamper[0]!.proposed_extent_decision!.components[0]!.identifiers[0] =
      "999999";
    expect(() => buildPlan040Package11Draft(inputFor(
      evidence,
      q82Tamper,
    ))).toThrow();

    const q86Tamper = clone(evidence.candidates);
    const q86 = q86Tamper.find((row) =>
      row.treatment_record_id === "treatment_q86-limited-stops-2025")!;
    (q86.accepted_evidence as Record<string, JsonValue>).invalid_selector =
      "Rush";
    expect(() => buildPlan040Package11Draft(inputFor(
      evidence,
      q86Tamper,
    ))).toThrow("Q86 limited scope drifted");

    const patternTamper = clone(evidence.candidates);
    const q45 = patternTamper.find((row) =>
      row.treatment_record_id ===
        "treatment_q45-all-day-frequent-service-2025")!;
    ((q45.accepted_evidence as {
      accepted_gtfs_patterns: Array<{ trip_id_sha256: string }>;
    }).accepted_gtfs_patterns[0]!).trip_id_sha256 = "0".repeat(64);
    expect(() => buildPlan040Package11Draft(inputFor(
      evidence,
      patternTamper,
    ))).toThrow("accepted GTFS evidence drifted");
  });

  it("fails closed on authority or exclusion overlap", () => {
    const authorityTamper = clone(evidence.candidates);
    (authorityTamper[0] as unknown as { authorizes_study: boolean })
      .authorizes_study = true;
    expect(() => buildPlan040Package11Draft(inputFor(
      evidence,
      authorityTamper,
    ))).toThrow("frozen evidence drifted");

    const receiptTamper = clone(evidence);
    receiptTamper.positive_pattern_receipt.sha256 = "0".repeat(64);
    expect(() => buildPlan040Package11Draft(inputFor(
      receiptTamper,
    ))).toThrow("positive pattern receipt drifted");

    const exclusionTamper = clone(evidence.exclusions);
    exclusionTamper[0]!.candidate_keys = [
      evidence.candidates[0]!.candidate_key,
    ];
    exclusionTamper[0]!.candidate_key_sha256 = sortedHash(
      exclusionTamper[0]!.candidate_keys,
    );
    expect(() => buildPlan040Package11Draft(inputFor(
      evidence,
      evidence.candidates,
      exclusionTamper,
    ))).toThrow("exclusions drifted");
  });
});
