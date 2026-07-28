import { describe, expect, it } from "bun:test";
import { corpusIt } from "../support/local-test-profile";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import type { JsonValue } from "../../../db/src/types";
import type {
  MemberExtentAbsenceReceipt,
  MemberExtentLedgerRow,
  MemberGrainLedgerRow,
} from "../../src/quality/member-extent-ledger";
import {
  PLAN040_PACKAGE_15_EXTENT_VERDICT_HISTOGRAM,
  PLAN040_PACKAGE_15_GRAIN_VERDICT_HISTOGRAM,
} from "../../src/quality/plan040-accelerated-package15-closeout";
import { PLAN041_POST_CLOSURE_PROJECTION_PINS } from
  "../../src/quality/plan041-projection-successor";
import {
  loadMemberExtentAbsenceReceipts,
} from "../../src/quality/member-extent-ledger";
import {
  memberGrainDecisionKey,
  type MemberGrainDecision,
} from "../../src/quality/member-grain-decisions";
import {
  PLAN040_PACKAGE_10B_CANDIDATES,
  PLAN040_PACKAGE_10B_ACQUISITION_PINS,
  PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_10B_COMPARISON_IDS,
  PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256,
  PLAN040_PACKAGE_10B_EXCLUSION_HASHES,
  PLAN040_PACKAGE_10B_PATTERN_IDS,
  PLAN040_PACKAGE_10B_POST_10A_PINS,
  PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS,
  buildPlan040Package10bDraft,
  plan040Package10bReplayHash,
  type Plan040Package10bCandidateEvidence,
  type Plan040Package10bComparisonReceiptRef,
  type Plan040Package10bDraft,
  type Plan040Package10bExclusion,
  type Plan040Package10bPreservedPackage8,
} from "../../src/quality/plan040-qbnr-service-pattern-package10b";
import type { Plan040Package8VersionSeparation } from
  "../../src/quality/plan040-qbnr-service-pattern-package8";
import {
  extentDecisionKey,
  type MemberExtentDecision,
} from "../../src/quality/study-readiness-v1";
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
  PLAN040_PACKAGE_10B_ACCEPTANCE_SHA256,
  PLAN040_PACKAGE_10B_ABSENCE_RECEIPT_SHA256,
  PLAN040_PACKAGE_10B_APPROVED_COMMIT,
  PLAN040_PACKAGE_10B_EXTENT_DECISIONS_SHA256,
  PLAN040_PACKAGE_10B_GATE_SHA256,
  PLAN040_PACKAGE_10B_GRAIN_DECISIONS_SHA256,
  PLAN040_PACKAGE_10B_PATH_AMENDMENT_COMMIT,
  PLAN040_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_SHA256,
  PLAN040_PACKAGE_10B_PATH_REVIEW_GATE_SHA256,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ACCEPTANCE_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ABSENCE_RECEIPT_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_EXTENT_DECISIONS_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GATE_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GRAIN_DECISIONS_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_GATE_PATH,
  buildPlan040Package10bGateAndAcceptance,
  buildPlan040Package10bAcceptedArtifacts,
  buildPlan040Package10bPathReviewAndAcceptance,
  validatePlan040Package10bGateAndAcceptance,
} from
  "../../src/quality/plan040-qbnr-service-pattern-package10b-closeout";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const evidencePath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-10b-evidence-v1.json`;
const draftPath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-10b-evidence-draft-v1.json`;
const comparisonReceiptPath =
  `${repoRoot}/data/quality/acquisition/receipts/member-extent-evidence/` +
  "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1.json";
const EVIDENCE_SHA256 =
  "43877f6b9461ce904f8536789b28bc746afc42c15be02115cdbe8317ce4334c6";
const DRAFT_SHA256 =
  "90680f7321edb260901ac4861a63256e3ae8b6df59e85363f808454cf83990d8";
const ACCEPTED_AT = "2026-07-24T14:23:38Z";
const PRIOR_COMPARISON_RECEIPT_RELATIVE =
  "data/quality/acquisition/receipts/member-extent/" +
  "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1.json";
const CURRENT_COMPARISON_RECEIPT_RELATIVE =
  "data/quality/acquisition/receipts/member-extent-evidence/" +
  "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1.json";

type Package10bEvidence = {
  candidate_count: 4;
  route_count: 2;
  candidate_key_sha256: string;
  candidates: Plan040Package10bCandidateEvidence[];
  exclusions: Plan040Package10bExclusion[];
  prior_package_overlap_count: 0;
  comparison_receipt: Plan040Package10bComparisonReceiptRef;
  preserved_package_8_predecessor_rows: Plan040Package10bPreservedPackage8;
  immutable_inputs: {
    post_10a_pins: typeof PLAN040_PACKAGE_10B_POST_10A_PINS;
    source_artifacts: Record<string, { path: string; sha256: string }>;
  };
  version_separation: Plan040Package8VersionSeparation;
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 3;
    receipt_terminal_unresolved_preserved: 1;
  };
  proposed_extent_distribution: {
    route_wide: 1;
    bounded_segment: 2;
    unresolved: 1;
  };
  proposed_grain_distribution: {
    trip_subset: 3;
    unresolved: 1;
  };
  authorization_state: string;
  proposed_extent_decision_count: 3;
  proposed_grain_decision_count: 3;
  persisted_extent_decision_count: 0;
  persisted_grain_decision_count: 0;
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

type FullStopPatternReceipt = {
  pattern_id: string;
  snapshot_id: string;
  service_date: string;
  route_id: string;
  direction_id: string;
  trip_count: number;
  trip_id_sha256: string;
  shape_ids: string[];
  stop_count: number;
  stop_ids: string[];
  stops: Array<{ stop_id: string; stop_name: string }>;
  stop_chain_sha256: string;
};

type FullStopComparisonReceipt = {
  comparison_id: string;
  predecessor_pattern_id: string;
  successor_pattern_id: string;
  predecessor_route_id: string;
  successor_route_id: string;
  direction_id: string;
  treatment_record_id: string;
  full_chain_comparison: JsonValue;
  full_chain_comparison_sha256: string;
  selected_candidate_slice: {
    named_street_scope: string;
    boundary_rationale?: string;
    source_evidence_id: string;
    boundary_stop_ids: string[];
    boundary_stop_evidence: Array<{
      stop_id: string;
      before_stop_name: string;
      after_stop_name: string;
    }>;
    before_stop_ids: string[];
    after_stop_ids: string[];
    identical_stop_id_equivalences: Array<{
      before_stop_id: string;
      after_stop_id: string;
      before_stop_name: string;
      after_stop_name: string;
      equivalence_basis: string;
    }>;
    before_only_stop_ids: string[];
    before_only_stops: Array<{
      stop_id: string;
      stop_name: string;
      disposition: string;
    }>;
    after_only_stop_ids: string[];
    after_only_stops: Array<{
      stop_id: string;
      stop_name: string;
      disposition: string;
    }>;
    shared_stop_ids_outside_candidate_slice: string[];
    shared_stops_outside_candidate_slice: Array<{
      stop_id: string;
      before_stop_name: string;
      after_stop_name: string;
      exclusion_reason: string;
    }>;
    changed_id_equivalence_authorized: boolean;
    changed_id_disposition: string;
    comparison_sha256: string;
  };
};

type FullStopComparisonReceiptArtifact = {
  receipt_id: string;
  source_id: string;
  upstream_pins: typeof PLAN040_PACKAGE_10B_ACQUISITION_PINS;
  accepted_snapshot_inputs: Array<{
    snapshot_id: string;
    source_id: string;
    service_date: string;
    receipt_path: string;
    receipt_sha256: string;
    zip_path: string;
    zip_sha1: string;
    zip_sha256: string;
    calendar_expansion: {
      policy: string;
      active_service_ids: string[];
      active_service_id_sha256: string;
    };
  }>;
  coverage: {
    predecessor_route_count: number;
    predecessor_pattern_count: number;
    predecessor_active_trip_count: number;
    predecessor_covered_trip_count: number;
    predecessor_active_trip_coverage_percent: number;
    successor_route_count: number;
    successor_pattern_count: number;
    successor_active_trip_count: number;
    successor_covered_trip_count: number;
    successor_active_trip_coverage_percent: number;
  };
  predecessor_patterns: FullStopPatternReceipt[];
  successor_patterns: FullStopPatternReceipt[];
  comparisons: FullStopComparisonReceipt[];
  equivalence_policy: {
    accepted_equivalence: string;
    applied_equivalence: string;
    first_party_crosswalk_search_outcome: string;
    proximity_name_coordinate_or_adjacency_equivalence_authorized: boolean;
    before_only_and_after_only_stops: string;
  };
  changed_id_guesses: Array<{
    before_stop_ids: string[];
    after_stop_ids: string[];
    context: string;
    status: string;
  }>;
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const sha1 = (value: Uint8Array | string): string =>
  createHash("sha1").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const readJsonl = <T>(path: string): T[] =>
  readFileSync(path, "utf8").trim().split("\n")
    .filter(Boolean).map((line) => JSON.parse(line) as T);
const clone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const inputFor = (
  evidence: Package10bEvidence,
  candidates = evidence.candidates,
  exclusions = evidence.exclusions,
  preservedPackage8 = evidence.preserved_package_8_predecessor_rows,
  comparisonReceipt = evidence.comparison_receipt,
) => ({
  evidenceManifestPath:
    "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-10b-evidence-v1.json",
  evidenceManifestSha256: EVIDENCE_SHA256,
  candidates,
  exclusions,
  preservedPackage8,
  priorCandidateKeys: [] as string[],
  versionSeparation: evidence.version_separation,
  comparisonReceipt,
});

type CsvRow = Record<string, string>;
const csvRows = (path: string): CsvRow[] => {
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/u);
  const fields = lines.shift()!.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(fields.map((field, index) => [
      field,
      values[index] ?? "",
    ]));
  });
};

const activeServiceIds = (
  root: string,
  date: string,
  weekday: string,
): string[] => {
  const calendar = csvRows(`${root}/calendar.txt`);
  const exceptions = csvRows(`${root}/calendar_dates.txt`);
  const active = new Set(calendar.filter((row) =>
    row[weekday] === "1" &&
    row.start_date! <= date &&
    row.end_date! >= date
  ).map((row) => row.service_id!));
  for (const row of exceptions.filter((row) => row.date === date)) {
    if (row.exception_type === "1") active.add(row.service_id!);
    if (row.exception_type === "2") active.delete(row.service_id!);
  }
  return [...active].sort();
};

const routeInventory = (
  root: string,
  routeId: string,
  date: string,
  weekday: string,
) => {
  const services = activeServiceIds(root, date, weekday);
  const trips = csvRows(`${root}/trips.txt`).filter((row) =>
    row.route_id === routeId && services.includes(row.service_id!)
  );
  return {
    services,
    trips,
    directionCounts: Object.fromEntries(["0", "1"].map((direction) => [
      direction,
      trips.filter((row) => row.direction_id === direction).length,
    ])),
    shapes: [...new Set(trips.map((row) => row.shape_id!))].sort(),
  };
};

const recomputedPatterns = (
  snapshotId: string,
  serviceDate: string,
  routeId: string,
) => fullStopPatternsForDate(
  loadGtfsStaticSnapshot(
    snapshotById(loadOperationalSnapshotRegistry(), snapshotId),
    ["calendar", "calendar_dates", "routes", "stops", "stop_times", "trips"],
    repoRoot,
    new Set([routeId]),
  ),
  serviceDate,
  routeId,
);

const scheduleSlices = async () => {
  const target = new Map([
    ["2025-06-29T00:00:00.000\0Q82", [] as string[][]],
    ["2025-06-29T00:00:00.000\0Q89", [] as string[][]],
    ["2025-06-28T00:00:00.000\0Q110", [] as string[][]],
    ["2025-06-28T00:00:00.000\0Q36", [] as string[][]],
  ]);
  const path =
    `${repoRoot}/raw/sources/mta_bus_schedules_2025_candidate_windows/source.csv`;
  const hasher = createHash("sha256");
  const reader = Bun.file(path).stream().getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let headerSeen = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hasher.update(value);
    const text = carry + decoder.decode(value, { stream: true });
    const lines = text.split("\n");
    carry = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.replace(/\r$/u, "");
      if (!headerSeen) {
        headerSeen = true;
        continue;
      }
      const values = line.split(",");
      target.get(`${values[0]}\0${values[8]}`)?.push(values);
    }
  }
  const tail = (carry + decoder.decode()).replace(/\r$/u, "");
  if (tail) {
    const values = tail.split(",");
    target.get(`${values[0]}\0${values[8]}`)?.push(values);
  }
  return { sha256: hasher.digest("hex"), target };
};

describe("Plan 040 QBNR Package 10B mixed-risk evidence freeze", () => {
  it("freezes the exact four-key scope and deterministically rebuilds the draft", () => {
    const evidenceBytes = readFileSync(evidencePath);
    const draftBytes = readFileSync(draftPath);
    const evidence = JSON.parse(
      evidenceBytes.toString("utf8"),
    ) as Package10bEvidence;
    const draft = JSON.parse(
      draftBytes.toString("utf8"),
    ) as Plan040Package10bDraft;
    expect(sha256(evidenceBytes)).toBe(EVIDENCE_SHA256);
    expect(sha256(draftBytes)).toBe(DRAFT_SHA256);
    expect(sha256(
      evidenceBytes.toString("utf8").replaceAll(
        CURRENT_COMPARISON_RECEIPT_RELATIVE,
        PRIOR_COMPARISON_RECEIPT_RELATIVE,
      ),
    )).toBe(
      "d0e41e3368d0eae0cc8425ad4f354aaae75bf678c5c0036d985913d786a75b2a",
    );
    expect(sha256(
      draftBytes.toString("utf8").replaceAll(
        CURRENT_COMPARISON_RECEIPT_RELATIVE,
        PRIOR_COMPARISON_RECEIPT_RELATIVE,
      ).replaceAll(
        EVIDENCE_SHA256,
        "d0e41e3368d0eae0cc8425ad4f354aaae75bf678c5c0036d985913d786a75b2a",
      ),
    )).toBe(
      "f65c3827d9adedfc6a537e19d48835934f31c1b87ea2a373d657316a85981f83",
    );
    expect(plan040Package10bReplayHash(
      draft as unknown as JsonValue,
    )).toBe(DRAFT_SHA256);
    expect(evidence.candidate_count).toBe(4);
    expect(evidence.route_count).toBe(2);
    expect(evidence.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
    );
    expect(sortedHash(evidence.candidates.map((row) =>
      row.candidate_key))).toBe(PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256);
    expect(evidence.candidates.map((candidate) => [
      candidate.gtfs_route_id,
      candidate.treatment_record_id,
    ])).toEqual(PLAN040_PACKAGE_10B_CANDIDATES);
    const rebuilt = buildPlan040Package10bDraft(inputFor(evidence));
    expect(rebuilt).toEqual(draft);
    expect(plan040Package10bReplayHash(
      rebuilt as unknown as JsonValue,
    )).toBe(DRAFT_SHA256);
  });

  corpusIt("pins the accepted source, feed, schedule, and prior-ledger bytes", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);
    for (const [name, artifact] of Object.entries(
      evidence.immutable_inputs.source_artifacts,
    )) {
      if (name === "schedule_csv") continue;
      expect(sha256(readFileSync(`${repoRoot}/${artifact.path}`))).toBe(
        artifact.sha256,
      );
    }
    expect(evidence.immutable_inputs.post_10a_pins.extent_ledger)
      .toBe(PLAN040_PACKAGE_10B_POST_10A_PINS.extent_ledger);
    expect(evidence.immutable_inputs.post_10a_pins.grain_ledger)
      .toBe(PLAN040_PACKAGE_10B_POST_10A_PINS.grain_ledger);
    const blocks = readJsonl<{
      block_id: string;
      raw_text_sha256: string;
      raw_text: string;
    }>(
      `${repoRoot}/raw/sources/` +
        "mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
    );
    expect(blocks.find((row) => row.block_id === "p001_b0079")).toEqual(
      expect.objectContaining({
        raw_text_sha256:
          "sha256:b0ab037f3bdf260561c984b18c873bfa743e84c64c2cf0df8d9834403b1100c4",
        raw_text: expect.stringContaining(
          "replacing Q110 service on Hempstead Av and Q36 service on 212 St/212 Pl.",
        ),
      }),
    );
    expect(blocks.find((row) => row.block_id === "p001_b0086")).toEqual(
      expect.objectContaining({
        raw_text_sha256:
          "sha256:0ce6db6806027c9aad26d3da3cd566c85b3986127ed6984db62927bb55a25eec",
        raw_text: expect.stringContaining(
          "replace the existing Q85 Green Acres branch",
        ),
      }),
    );
  });

  corpusIt("pins and independently recomputes complete predecessor/successor chains and comparisons", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);
    const receiptBytes = readFileSync(comparisonReceiptPath);
    const receipt = JSON.parse(
      receiptBytes.toString("utf8"),
    ) as FullStopComparisonReceiptArtifact;
    expect(sha256(receiptBytes)).toBe(
      PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256,
    );
    expect(lstatSync(comparisonReceiptPath).isFile()).toBe(true);
    expect(lstatSync(comparisonReceiptPath).isSymbolicLink()).toBe(false);
    expect(evidence.comparison_receipt).toEqual({
      path:
        "data/quality/acquisition/receipts/member-extent-evidence/" +
        "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1.json",
      sha256: PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256,
      receipt_id:
        "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1",
      source_id:
        "plan_040_qbnr_service_pattern_package_10b_full_stop_equivalence",
      upstream_pins: PLAN040_PACKAGE_10B_ACQUISITION_PINS,
      external_acquisition_performed: false,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_decision_persistence: false,
    });
    expect(receipt.upstream_pins).toEqual(PLAN040_PACKAGE_10B_ACQUISITION_PINS);
    for (const pin of Object.values(receipt.upstream_pins)) {
      expect(sha256(readFileSync(`${repoRoot}/${pin.path}`))).toBe(pin.sha256);
    }
    for (const snapshot of receipt.accepted_snapshot_inputs) {
      const receiptFile = readFileSync(`${repoRoot}/${snapshot.receipt_path}`);
      const zipFile = readFileSync(`${repoRoot}/${snapshot.zip_path}`);
      expect(sha256(receiptFile)).toBe(snapshot.receipt_sha256);
      expect(sha1(zipFile)).toBe(snapshot.zip_sha1);
      expect(sha256(zipFile)).toBe(snapshot.zip_sha256);
      expect(sortedHash(snapshot.calendar_expansion.active_service_ids)).toBe(
        snapshot.calendar_expansion.active_service_id_sha256,
      );
      expect(snapshot.calendar_expansion.policy).toBe(
        "calendar_plus_calendar_dates",
      );
    }
    expect(receipt.coverage).toEqual({
      predecessor_route_count: 2,
      predecessor_pattern_count: 4,
      predecessor_active_trip_count: 323,
      predecessor_covered_trip_count: 323,
      predecessor_active_trip_coverage_percent: 100,
      successor_route_count: 1,
      successor_pattern_count: 2,
      successor_active_trip_count: 102,
      successor_covered_trip_count: 102,
      successor_active_trip_coverage_percent: 100,
    });

    const recomputed = [
      ...recomputedPatterns(
        "gtfs-static-20250625-busco-pre-qbnr",
        "2025-06-28",
        "Q110",
      ),
      ...recomputedPatterns(
        "gtfs-static-20250615-queens-pre-qbnr",
        "2025-06-28",
        "Q36",
      ),
      ...recomputedPatterns(
        "gtfs-static-20250626-queens-post-qbnr",
        "2025-06-29",
        "Q82",
      ),
    ];
    expect(receipt.predecessor_patterns.map((row) => row.pattern_id)).toEqual([
      PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q110_direction_0,
      PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q110_direction_1,
      PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q36_direction_0,
      PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q36_direction_1,
    ]);
    expect(receipt.successor_patterns.map((row) => row.pattern_id)).toEqual([
      PLAN040_PACKAGE_10B_PATTERN_IDS.direction_0,
      PLAN040_PACKAGE_10B_PATTERN_IDS.direction_1,
    ]);
    for (const frozen of [
      ...receipt.predecessor_patterns,
      ...receipt.successor_patterns,
    ]) {
      const actual = recomputed.find((row) =>
        row.pattern_id === frozen.pattern_id)!;
      expect(actual).toBeDefined();
      expect(frozen.snapshot_id).toBe(actual.snapshot_id);
      expect(frozen.service_date).toBe(actual.service_date);
      expect(frozen.route_id).toBe(actual.route_id);
      expect(frozen.direction_id).toBe(actual.direction_id);
      expect(frozen.trip_count).toBe(actual.trip_count);
      expect(frozen.trip_id_sha256).toBe(sortedHash(actual.trip_ids));
      expect(frozen.shape_ids).toEqual(actual.shape_ids);
      expect(frozen.stop_count).toBe(actual.stops.length);
      expect(frozen.stop_ids).toEqual(
        actual.stops.map((stop) => stop.stop_id),
      );
      expect(frozen.stops).toEqual(actual.stops);
      expect(frozen.stop_chain_sha256).toBe(
        sha256(`${frozen.stop_ids.join("\n")}\n`),
      );
    }

    const recomputedById = new Map(recomputed.map((row) => [
      row.pattern_id,
      row,
    ]));
    expect(receipt.comparisons.map((row) => row.comparison_id)).toEqual([
      PLAN040_PACKAGE_10B_COMPARISON_IDS.q110_direction_0,
      PLAN040_PACKAGE_10B_COMPARISON_IDS.q110_direction_1,
      PLAN040_PACKAGE_10B_COMPARISON_IDS.q36_direction_0,
      PLAN040_PACKAGE_10B_COMPARISON_IDS.q36_direction_1,
    ]);
    for (const frozen of receipt.comparisons) {
      const actual = compareFullStopPatterns(
        recomputedById.get(frozen.predecessor_pattern_id)!,
        recomputedById.get(frozen.successor_pattern_id)!,
      );
      expect(actual.comparison_id).toBe(frozen.comparison_id);
      expect(actual as unknown as JsonValue).toEqual(
        frozen.full_chain_comparison,
      );
      expect(frozen.full_chain_comparison_sha256).toBe(
        sha256(`${stableJson(actual as unknown as JsonValue)}\n`),
      );
    }

    const selected = Object.fromEntries(receipt.comparisons.map((row) => [
      row.comparison_id,
      {
        bounds: row.selected_candidate_slice.boundary_stop_ids,
        before: row.selected_candidate_slice.before_stop_ids,
        after: row.selected_candidate_slice.after_stop_ids,
        identical:
          row.selected_candidate_slice.identical_stop_id_equivalences.map(
            (stop) => stop.before_stop_id,
          ),
        outside:
          row.selected_candidate_slice.shared_stop_ids_outside_candidate_slice,
      },
    ]));
    expect(selected).toEqual({
      [PLAN040_PACKAGE_10B_COMPARISON_IDS.q110_direction_0]: {
        bounds: ["552248", "500122"],
        before: [
          "552248", "552249", "505131", "500120", "500121", "500122",
        ],
        after: ["552248", "552249", "505131", "701055", "500122"],
        identical: ["552248", "552249", "505131", "500122"],
        outside: ["904250"],
      },
      [PLAN040_PACKAGE_10B_COMPARISON_IDS.q110_direction_1]: {
        bounds: ["500123", "501962"],
        before: [
          "500123", "500124", "500125", "552252", "552250", "501962",
        ],
        after: ["500123", "500125", "552252", "552727", "501962"],
        identical: ["500123", "500125", "552252", "501962"],
        outside: ["553437"],
      },
      [PLAN040_PACKAGE_10B_COMPARISON_IDS.q36_direction_0]: {
        bounds: ["500022", "501927"],
        before: ["500022", "501924", "501925", "501926", "501927"],
        after: ["500022", "501925", "501927"],
        identical: ["500022", "501925", "501927"],
        outside: ["503984", "501908", "505096", "500018", "503965"],
      },
      [PLAN040_PACKAGE_10B_COMPARISON_IDS.q36_direction_1]: {
        bounds: ["501962", "501966"],
        before: ["501962", "501963", "501964", "501965", "501966"],
        after: ["501962", "501964", "501966"],
        identical: ["501962", "501964", "501966"],
        outside: ["500072", "500074", "500080", "501414"],
      },
    });
    for (const comparison of receipt.comparisons) {
      const slice = comparison.selected_candidate_slice;
      expect(slice.identical_stop_id_equivalences.every((stop) =>
        stop.before_stop_id === stop.after_stop_id &&
        stop.equivalence_basis === "identical_stop_id"
      )).toBe(true);
      expect(slice.before_only_stops.every((stop) =>
        stop.disposition === "unresolved_no_equivalence_authorized"
      )).toBe(true);
      expect(slice.after_only_stops.every((stop) =>
        stop.disposition === "unresolved_no_equivalence_authorized"
      )).toBe(true);
      expect(slice.changed_id_equivalence_authorized).toBe(false);
      expect(slice.changed_id_disposition).toBe(
        "unresolved_no_equivalence_authorized",
      );
    }
    const q110Direction1 = receipt.comparisons.find((row) =>
      row.comparison_id ===
        PLAN040_PACKAGE_10B_COMPARISON_IDS.q110_direction_1)!;
    expect(q110Direction1.selected_candidate_slice.boundary_stop_evidence)
      .toEqual([
        expect.objectContaining({
          stop_id: "500123",
          before_stop_name: expect.stringContaining("HEMPSTEAD"),
          after_stop_name: expect.stringContaining("HEMPSTEAD"),
        }),
        expect.objectContaining({
          stop_id: "501962",
          before_stop_name: "JAMAICA AV/212 PL",
          after_stop_name: "JAMAICA AV/212 PL",
        }),
      ]);
    expect(q110Direction1.selected_candidate_slice.boundary_rationale).toBe(
      "Stop 501962 JAMAICA AV/212 PL is the exact shared immediately-after-Hempstead boundary; it is not claimed as Hempstead Av interior.",
    );
    expect(
      q110Direction1.selected_candidate_slice
        .shared_stops_outside_candidate_slice,
    ).not.toContainEqual(expect.objectContaining({ stop_id: "501962" }));
    expect(receipt.changed_id_guesses).toEqual([
      expect.objectContaining({
        before_stop_ids: ["500120", "500121"],
        after_stop_ids: ["701055"],
        status: "unresolved_no_equivalence_authorized",
      }),
      expect.objectContaining({
        before_stop_ids: ["552250"],
        after_stop_ids: ["552727"],
        status: "unresolved_no_equivalence_authorized",
      }),
      expect.objectContaining({
        before_stop_ids: ["500071"],
        after_stop_ids: ["500072"],
        status: "unresolved_no_equivalence_authorized",
      }),
    ]);
    expect(receipt.equivalence_policy).toEqual({
      accepted_equivalence:
        "identical_stop_id_or_separately_cited_first_party_crosswalk_only",
      applied_equivalence: "identical_stop_id_only",
      first_party_crosswalk_search_outcome:
        "no_crosswalk_found_not_required_for_identical_stop_id_equivalences",
      proximity_name_coordinate_or_adjacency_equivalence_authorized: false,
      before_only_and_after_only_stops:
        "unresolved_no_equivalence_authorized",
    });
    expect(stableJson(receipt as unknown as JsonValue)).not.toContain(
      "not_equivalent",
    );
    expect(receipt.external_acquisition_performed).toBe(false);
    expect(receipt.authorizes_occurrence).toBe(false);
    expect(receipt.authorizes_study).toBe(false);
    expect(receipt.authorizes_cross_product).toBe(false);
    expect(receipt.authorizes_decision_persistence).toBe(false);
  });

  corpusIt("recomputes accepted initial GTFS inventories and exact Q82 chains", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);
    const queensPost =
      `${repoRoot}/raw/sources/gtfs_static_20250626_queens_post_qbnr/extracted`;
    const q82 = routeInventory(queensPost, "Q82", "20250629", "sunday");
    const q89 = routeInventory(queensPost, "Q89", "20250629", "sunday");
    expect(sortedHash(q82.services)).toBe(
      "813619a6d363ab72fdd0cb45bfd96d6606349584e15854b0978a7a55631f78fd",
    );
    expect(q82.trips).toHaveLength(102);
    expect(q82.directionCounts).toEqual({ "0": 51, "1": 51 });
    expect(q82.shapes).toEqual(["Q820026", "Q820032"]);
    expect(sortedHash(q82.trips.map((row) => row.trip_id!))).toBe(
      "f199027fee425aa9c72bda60e8a29afdcbc496ba72b86b0f88a66670555f59e2",
    );
    expect(q89.trips).toHaveLength(78);
    expect(q89.shapes).toEqual(["Q890011", "Q890016"]);

    const q82Candidate = evidence.candidates[0]!;
    const accepted = q82Candidate.accepted_evidence as {
      full_stop_chains: Array<{
        direction_id: string;
        shape_id: string;
        trip_count: number;
        trip_id_sha256: string;
        stop_ids: string[];
        stop_chain_sha256: string;
        pattern_id: string;
      }>;
    };
    const activeTripIds = new Set(q82.trips.map((row) => row.trip_id!));
    const stopTimes = csvRows(`${queensPost}/stop_times.txt`).filter((row) =>
      activeTripIds.has(row.trip_id!)
    );
    for (const chain of accepted.full_stop_chains) {
      const trips = q82.trips.filter((row) => row.shape_id === chain.shape_id);
      const exemplar = trips[0]!.trip_id!;
      const stops = stopTimes.filter((row) => row.trip_id === exemplar)
        .sort((left, right) =>
          Number(left.stop_sequence) - Number(right.stop_sequence))
        .map((row) => row.stop_id!);
      expect(trips).toHaveLength(chain.trip_count);
      expect(sortedHash(trips.map((row) => row.trip_id!))).toBe(
        chain.trip_id_sha256,
      );
      expect(stops).toEqual(chain.stop_ids);
      expect(sha256(`${stops.join("\n")}\n`)).toBe(
        chain.stop_chain_sha256,
      );
      expect(chain.pattern_id).toBe(
        PLAN040_PACKAGE_10B_PATTERN_IDS[
          chain.direction_id === "0" ? "direction_0" : "direction_1"
        ],
      );
    }
  });

  corpusIt("recomputes the four exact schedule slices and passenger shape sets", async () => {
    const { sha256: sourceSha, target } = await scheduleSlices();
    expect(sourceSha).toBe(PLAN040_PACKAGE_10B_POST_10A_PINS.schedule_csv);
    const expected = {
      "2025-06-29T00:00:00.000\0Q82": [
        578,
        { "1": 510, "2": 34, "3": 34 },
        ["Q820026", "Q820032"],
      ],
      "2025-06-29T00:00:00.000\0Q89": [
        669,
        null,
        ["Q890020", "Q890021"],
      ],
      "2025-06-28T00:00:00.000\0Q110": [
        1166,
        null,
        ["Q1100159", "Q1100175"],
      ],
      "2025-06-28T00:00:00.000\0Q36": [
        1277,
        null,
        ["Q360175", "Q360181"],
      ],
    } as const;
    for (const [key, [count, types, passengerShapes]] of Object.entries(
      expected,
    )) {
      const rows = target.get(key)!;
      expect(rows).toHaveLength(count);
      if (types) {
        expect(Object.fromEntries(
          [...new Set(rows.map((row) => row[7]!))].sort().map((type) => [
            type,
            rows.filter((row) => row[7] === type).length,
          ]),
        )).toEqual(types);
      }
      expect([...new Set(rows.filter((row) =>
        !["2", "3", "4"].includes(row[7]!)).map((row) => row[6]!))]
        .sort()).toEqual(passengerShapes);
    }
  }, 30_000);

  it("proposes one route-wide and two bounded Q82 decisions without identifier inference", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);
    const q82 = evidence.candidates.filter((candidate) =>
      candidate.gtfs_route_id === "Q82"
    );
    expect(q82.map((candidate) =>
      candidate.proposed_extent_decision!.resolution)).toEqual([
      "route_wide",
      "bounded_segment",
      "bounded_segment",
    ]);
    for (const candidate of q82) {
      const grain = candidate.proposed_grain_decision!;
      expect(grain.service_scope).toEqual({
        kind: "trip_subset",
        periods: ["weekend"],
        directions: ["0", "1"],
        pattern_ids: Object.values(PLAN040_PACKAGE_10B_PATTERN_IDS).sort(),
        description:
          "Only the exact accepted initial-post Q82 passenger patterns on the implementation-date weekend slice.",
      });
      const evidence = candidate.accepted_evidence as {
        comparison_receipt: Plan040Package10bComparisonReceiptRef;
        predecessor_full_stop_chains: FullStopPatternReceipt[];
        candidate_full_stop_comparisons: FullStopComparisonReceipt[];
      };
      expect(evidence.comparison_receipt).toEqual(
        readJson<Package10bEvidence>(evidencePath).comparison_receipt,
      );
      const receiptSource = evidence.comparison_receipt.source_id;
      const bindingIds = candidate.proposed_extent_decision!.evidence_bindings
        .map((binding) => binding.evidence_id);
      expect(Object.values(PLAN040_PACKAGE_10B_PATTERN_IDS).every((id) =>
        bindingIds.includes(`${receiptSource}#${id}`)
      )).toBe(true);
      expect(bindingIds).toContain(
        `${receiptSource}#${evidence.comparison_receipt.receipt_id}`,
      );
      expect(grain.evidence_bindings).toEqual(
        candidate.proposed_extent_decision!.evidence_bindings,
      );
      expect(candidate.persisted_extent_decision).toBeNull();
      expect(candidate.persisted_grain_decision).toBeNull();
    }
    expect(q82[0]!.proposed_grain_decision!.lineage_segments).toEqual([]);
    expect(q82[1]!.proposed_grain_decision!.lineage_segments).toEqual([
      {
        predecessor_gtfs_route_id: "Q110",
        successor_gtfs_route_id: "Q82",
        direction: "0",
        boundary_stop_ids: ["500122", "552248"],
        shared_stop_ids: ["500122", "505131", "552248", "552249"],
      },
      {
        predecessor_gtfs_route_id: "Q110",
        successor_gtfs_route_id: "Q82",
        direction: "1",
        boundary_stop_ids: ["500123", "501962"],
        shared_stop_ids: ["500123", "500125", "501962", "552252"],
      },
    ]);
    expect(q82[1]!.proposed_extent_decision!.components[1]).toEqual(
      expect.objectContaining({
        identifiers: ["500123", "500125", "501962", "552252"],
        description: expect.stringContaining(
          "immediately-after-Hempstead boundary, not claimed as Hempstead interior",
        ),
      }),
    );
    expect(q82[1]!.proposed_extent_decision!.rationale).toContain(
      "Stop 501962 is a boundary, not claimed as Hempstead Av interior",
    );
    const expectedReplacementBindings = [
      {
        candidate: q82[1]!,
        predecessorIds: [
          PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q110_direction_0,
          PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q110_direction_1,
        ],
        comparisonIds: [
          PLAN040_PACKAGE_10B_COMPARISON_IDS.q110_direction_0,
          PLAN040_PACKAGE_10B_COMPARISON_IDS.q110_direction_1,
        ],
      },
      {
        candidate: q82[2]!,
        predecessorIds: [
          PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q36_direction_0,
          PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q36_direction_1,
        ],
        comparisonIds: [
          PLAN040_PACKAGE_10B_COMPARISON_IDS.q36_direction_0,
          PLAN040_PACKAGE_10B_COMPARISON_IDS.q36_direction_1,
        ],
      },
    ];
    for (
      const { candidate, predecessorIds, comparisonIds } of
        expectedReplacementBindings
    ) {
      const accepted = candidate.accepted_evidence as {
        comparison_receipt: Plan040Package10bComparisonReceiptRef;
        predecessor_full_stop_chains: FullStopPatternReceipt[];
        candidate_full_stop_comparisons: FullStopComparisonReceipt[];
      };
      const bindingIds = candidate.proposed_extent_decision!.evidence_bindings
        .map((binding) => binding.evidence_id);
      expect(accepted.predecessor_full_stop_chains.map((row) =>
        row.pattern_id)).toEqual(predecessorIds);
      expect(accepted.candidate_full_stop_comparisons.map((row) =>
        row.comparison_id)).toEqual(comparisonIds);
      expect([...predecessorIds, ...comparisonIds].every((id) =>
        bindingIds.includes(`${accepted.comparison_receipt.source_id}#${id}`)
      )).toBe(true);
      expect(bindingIds.some((id) => id.includes("#route:"))).toBe(false);
    }
    expect(
      (q82[0]!.accepted_evidence as {
        predecessor_full_stop_chains: unknown[];
      }).predecessor_full_stop_chains,
    ).toEqual([]);
    expect(
      (q82[0]!.accepted_evidence as {
        candidate_full_stop_comparisons: unknown[];
      }).candidate_full_stop_comparisons,
    ).toEqual([]);
    const rejected = q82.flatMap((candidate) =>
      (candidate.accepted_evidence as {
        rejected_identifier_inferences: string[];
      }).rejected_identifier_inferences);
    expect(rejected).toContain(
      "500120_500121_to_701055_unresolved_no_equivalence_authorized",
    );
    expect(rejected).toContain(
      "552250_to_552727_unresolved_no_equivalence_authorized",
    );
    expect(rejected).toContain(
      "500071_to_500072_unresolved_no_equivalence_authorized",
    );
    expect(rejected).toContain(
      "skipped_local_stops_unresolved_no_equivalence_authorized",
    );
  });

  it("preserves Q89 identity and the accepted P8 Q110/Q36 absence rows exactly", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);
    const q89 = evidence.candidates[3]!;
    const currentExtentRows = readJsonl<MemberExtentLedgerRow>(
      `${repoRoot}/data/quality/operational-reference/member-extent-ledger.jsonl`,
    );
    const currentGrainRows = readJsonl<MemberGrainLedgerRow>(
      `${repoRoot}/data/quality/operational-reference/member-grain-ledger.jsonl`,
    );
    expect(q89.prior_ledger_state.extent_row).toEqual(
      expect.objectContaining({
        ledger_id: "member-extent-ledger:06d3feaca1f812078748a979",
        packet_id: "study-readiness-review:ea9e0f1db4ffbcd5d34356ed",
        current_extent_kind: "unresolved",
      }),
    );
    expect(q89.prior_ledger_state.grain_row).toEqual(
      expect.objectContaining({
        ledger_id: "member-grain-ledger:06d3feaca1f812078748a979",
        member_extent_decision_id:
          "member-extent-review:53b053d72d04f18923d31522",
        service_scope: null,
        lineage_segments: [],
      }),
    );
    expect(currentExtentRows.find((row) =>
      row.treatment_record_id === q89.treatment_record_id
    )).toEqual({
      ...q89.prior_ledger_state.extent_row,
      verdict: "absent_in_source",
      verdict_basis:
        "receipt:plan-040-qbnr-service-pattern-package-10b-reviewed-absence-v1",
      receipt_ids: [
        "plan-040-qbnr-service-pattern-package-10b-reviewed-absence-v1",
      ],
      updated_at: ACCEPTED_AT,
    });
    expect(currentGrainRows.find((row) =>
      row.treatment_record_id === q89.treatment_record_id
    )).toEqual({
      ...q89.prior_ledger_state.grain_row,
      spatial_verdict: "absent_in_source",
      verdict: "absent_in_source",
      verdict_basis:
        "receipt:plan-040-qbnr-service-pattern-package-10b-reviewed-absence-v1",
      receipt_ids: [
        "plan-040-qbnr-service-pattern-package-10b-reviewed-absence-v1",
      ],
      updated_at: ACCEPTED_AT,
    });
    expect(q89.proposed_extent_decision).toBeNull();
    expect(q89.proposed_grain_decision).toBeNull();
    expect(q89.unresolved_gap_codes).toEqual([
      "bounded_scope_identity_missing",
      "prior_reviewed_member_extent_unresolved_preserved",
      "post_schedule_gtfs_shape_identity_mismatch",
      "initial_shape_mismatch_may_be_correction_sensitive",
      "corrected_first_week_diff_blocked_not_run",
      "candidate_specific_service_detail_not_staged",
      "candidate_specific_schedule_or_timetable_not_staged",
      "candidate_scope_not_bound_to_exact_versioned_member_extent",
    ]);

    const preserved = evidence.preserved_package_8_predecessor_rows;
    expect(sha256(readFileSync(
      `${repoRoot}/${preserved.evidence_artifact.path}`,
    ))).toBe(preserved.evidence_artifact.sha256);
    expect(sha256(readFileSync(
      `${repoRoot}/${preserved.absence_receipt.path}`,
    ))).toBe(preserved.absence_receipt.sha256);
    expect(preserved.predecessor_context_changes_rows).toBe(false);
    expect([...preserved.extent_rows, ...preserved.grain_rows].every((row) =>
      row.verdict === "absent_in_source" &&
      row.receipt_ids[0] ===
        "plan-040-qbnr-service-pattern-package-8-reviewed-absence-v1"
    )).toBe(true);
    for (const prior of preserved.extent_rows) {
      expect(currentExtentRows.find((row) =>
        extentDecisionKey(row) === extentDecisionKey(prior)
      )).toEqual(prior);
    }
    for (const prior of preserved.grain_rows) {
      expect(currentGrainRows.find((row) =>
        memberGrainDecisionKey(row) === memberGrainDecisionKey(prior)
      )).toEqual(prior);
    }
  });

  it("pins all exclusions, comparison roles, and pre-persistence authority", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);
    const draft = readJson<Plan040Package10bDraft>(draftPath);
    expect(Object.fromEntries(evidence.exclusions.map((row) => [
      row.scope_id,
      row.candidate_key_sha256,
    ]))).toEqual(PLAN040_PACKAGE_10B_EXCLUSION_HASHES);
    expect(evidence.exclusions.every((row) =>
      row.overlap_count === 0 &&
      sortedHash(row.candidate_keys) === row.candidate_key_sha256
    )).toBe(true);
    expect(evidence.version_separation.published_launch_diff).toEqual(
      expect.objectContaining({
        status: "completed_from_accepted_initial_feed_bytes",
        comparison_role: "published_launch_diff",
        correction_bytes_used: false,
        correction_version_sha1s_used: [],
      }),
    );
    expect(evidence.version_separation.corrected_first_week_diff).toEqual(
      expect.objectContaining({
        status: "blocked_not_run",
        comparison_role: "corrected_first_week_diff",
        comparison_run: false,
        correction_bytes_used: false,
        corrected_diff_used: false,
        published_launch_outcomes_reclassified: false,
      }),
    );
    expect(draft.evidence_verdict_distribution).toEqual({
      positive_extent_and_grain_proposed: 3,
      receipt_terminal_unresolved_preserved: 1,
    });
    expect(draft.proposed_extent_distribution).toEqual({
      route_wide: 1,
      bounded_segment: 2,
      unresolved: 1,
    });
    expect(draft.proposed_grain_distribution).toEqual({
      trip_subset: 3,
      unresolved: 1,
    });
    expect(draft.review_protocol).toEqual({
      review_mode:
        "dual_independent_mixed_positive_and_source_gap_risk_review",
      independent_review_required: true,
      dual_independent_review_required: true,
      owner_gate_created: false,
      owner_acceptance_created: false,
      persistence_performed: false,
    });
    expect(draft.authorization_state).toBe(
      "evidence_draft_pending_dual_independent_review_no_gate_no_acceptance_no_persistence",
    );
    expect(draft.persisted_extent_decision_count).toBe(0);
    expect(draft.persisted_grain_decision_count).toBe(0);
    expect(draft.authorizes_occurrence).toBe(false);
    expect(draft.authorizes_decision_persistence).toBe(false);
    expect(existsSync(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-10b-dual-review-gate-v1.json`,
    )).toBe(true);
    expect(existsSync(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-10b-owner-acceptance-v1.json`,
    )).toBe(true);
  });

  it("freezes the compact dual-review gate and one exact package acceptance", () => {
    const draft = readJson<Plan040Package10bDraft>(draftPath);
    const gate = readJson<Record<string, unknown>>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GATE_PATH,
    );
    const acceptance = readJson<Record<string, unknown>>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ACCEPTANCE_PATH,
    );
    expect(sha256(readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GATE_PATH,
    ))).toBe(PLAN040_PACKAGE_10B_GATE_SHA256);
    expect(sha256(readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ACCEPTANCE_PATH,
    ))).toBe(PLAN040_PACKAGE_10B_ACCEPTANCE_SHA256);
    expect(validatePlan040Package10bGateAndAcceptance({
      draft,
      gate,
      acceptance,
      acceptedAt: ACCEPTED_AT,
    })).toEqual({
      candidate_count: 4,
      positive_candidate_count: 3,
      unresolved_candidate_count: 1,
      authorized_extent_decision_count: 3,
      authorized_grain_decision_count: 3,
      authorized_absence_candidate_count: 1,
      persisted_decision_count: 0,
      persisted_absence_receipt_count: 0,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(gate).toEqual(expect.objectContaining({
      reviewed_commit: PLAN040_PACKAGE_10B_APPROVED_COMMIT,
      candidate_count: 4,
      candidate_key_sha256: PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
      verdict_distribution: {
        positive_extent_and_grain_proposed: 3,
        receipt_terminal_unresolved_preserved: 1,
      },
      authorization_state:
        "dual_review_approved_pending_owner_delegate_acceptance",
      authorizes_decision_persistence: false,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    }));
    expect(gate.reviewer_results).toEqual([
      expect.objectContaining({ verdict: "APPROVE" }),
      expect.objectContaining({ verdict: "APPROVE" }),
    ]);
    expect(gate.path_migration).toEqual(expect.objectContaining({
      amendment_id:
        "plan-040-qbnr-service-pattern-package-10b-receipt-path-amendment-v1",
      amendment_kind: "path_only_nonsemantic_supersession",
      prior_artifacts: expect.objectContaining({
        comparison_receipt: {
          path: PRIOR_COMPARISON_RECEIPT_RELATIVE,
          sha256: PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256,
        },
        gate_sha256:
          "f719470a012399382a5108ceec4962467d49c6ddba6b0010d2d75012cbe3f7d1",
        acceptance_sha256:
          "22586299d637d8e54ae638a94db14efc44342f52876a68874bc5fe3693869e86",
      }),
      current_comparison_receipt: {
        path: CURRENT_COMPARISON_RECEIPT_RELATIVE,
        sha256: PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256,
        file_kind: "regular_file",
      },
      unchanged: {
        receipt_bytes: true,
        candidate_keys: true,
        verdicts: true,
        proposed_decisions: true,
        reviewer_results: true,
        authorization: true,
      },
      prior_artifacts_retained_in_git_history: true,
      shared_loader_semantics_changed: false,
      fresh_compact_dual_path_review_required_before_persistence: true,
      path_review_status: "pending",
    }));
    const priorGate = clone(gate) as unknown as {
      artifacts: {
        comparison_receipt: { path: string };
        evidence: { sha256: string };
        draft: { sha256: string };
      };
      checkpoint_tests: {
        deterministic_replay: {
          evidence_sha256: string;
          draft_sha256: string;
        };
      };
      path_migration?: unknown;
    };
    delete priorGate.path_migration;
    priorGate.artifacts.comparison_receipt.path =
      PRIOR_COMPARISON_RECEIPT_RELATIVE;
    priorGate.artifacts.evidence.sha256 =
      "d0e41e3368d0eae0cc8425ad4f354aaae75bf678c5c0036d985913d786a75b2a";
    priorGate.artifacts.draft.sha256 =
      "f65c3827d9adedfc6a537e19d48835934f31c1b87ea2a373d657316a85981f83";
    priorGate.checkpoint_tests.deterministic_replay.evidence_sha256 =
      priorGate.artifacts.evidence.sha256;
    priorGate.checkpoint_tests.deterministic_replay.draft_sha256 =
      priorGate.artifacts.draft.sha256;
    expect(sha256(
      `${stableJson(priorGate as unknown as JsonValue)}\n`,
    )).toBe(
      "f719470a012399382a5108ceec4962467d49c6ddba6b0010d2d75012cbe3f7d1",
    );
    expect(acceptance).toEqual(expect.objectContaining({
      accepted_at: ACCEPTED_AT,
      accepted_by: "codex-owner-delegate",
      candidate_count: 4,
      candidate_key_sha256: PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
      authorization_state:
        "owner_delegate_accepted_exact_3_positive_decision_pairs_and_exact_1_key_preserved_reviewed_absence_only",
      authorizes_decision_persistence: true,
      authorizes_reviewed_absence_receipt_persistence: true,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    }));
    expect(acceptance.path_migration).toEqual(gate.path_migration);
    const priorAcceptance = clone(acceptance) as unknown as {
      artifacts: {
        comparison_receipt: { path: string };
        evidence: { sha256: string };
        draft: { sha256: string };
      };
      gate: { sha256: string };
      path_migration?: unknown;
    };
    delete priorAcceptance.path_migration;
    priorAcceptance.artifacts.comparison_receipt.path =
      PRIOR_COMPARISON_RECEIPT_RELATIVE;
    priorAcceptance.artifacts.evidence.sha256 =
      "d0e41e3368d0eae0cc8425ad4f354aaae75bf678c5c0036d985913d786a75b2a";
    priorAcceptance.artifacts.draft.sha256 =
      "f65c3827d9adedfc6a537e19d48835934f31c1b87ea2a373d657316a85981f83";
    priorAcceptance.gate.sha256 =
      "f719470a012399382a5108ceec4962467d49c6ddba6b0010d2d75012cbe3f7d1";
    expect(sha256(
      `${stableJson(priorAcceptance as unknown as JsonValue)}\n`,
    )).toBe(
      "22586299d637d8e54ae638a94db14efc44342f52876a68874bc5fe3693869e86",
    );
    expect(
      acceptance.authorized_positive_persistence,
    ).toEqual(expect.objectContaining({
      candidate_count: 3,
      candidate_keys: draft.candidates.slice(0, 3)
        .map((candidate) => candidate.candidate_key).sort(),
      extent_decision_ids: draft.candidates.slice(0, 3)
        .map((candidate) =>
          candidate.proposed_extent_decision!.decision_id).sort(),
      grain_decision_ids: draft.candidates.slice(0, 3)
        .map((candidate) =>
          candidate.proposed_grain_decision!.decision_id).sort(),
    }));
    expect(
      acceptance.authorized_reviewed_absence_receipt,
    ).toEqual(expect.objectContaining({
      receipt_id:
        "plan-040-qbnr-service-pattern-package-10b-reviewed-absence-v1",
      candidate_count: 1,
      candidate_keys: [draft.candidates[3]!.candidate_key],
      surfaces: ["member_extent", "member_grain"],
    }));

    const rebuilt = buildPlan040Package10bGateAndAcceptance({
      draft,
      acceptedAt: ACCEPTED_AT,
    });
    expect(rebuilt.gate).toEqual(gate);
    expect(rebuilt.acceptance).toEqual(acceptance);
    const mutation = clone(gate) as unknown as {
      reviewer_results: Array<{ verdict: string }>;
    };
    mutation.reviewer_results[1]!.verdict = "REFUTE";
    expect(() =>
      validatePlan040Package10bGateAndAcceptance({
        draft,
        gate: mutation,
        acceptance,
        acceptedAt: ACCEPTED_AT,
      })
    ).toThrow(/gate drifted/u);
  });

  it("records fresh dual path approval and standing supplemental acceptance separately", () => {
    const gate = readJson<Record<string, unknown>>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_GATE_PATH,
    );
    const acceptance = readJson<Record<string, unknown>>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH,
    );
    expect(sha256(readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_GATE_PATH,
    ))).toBe(PLAN040_PACKAGE_10B_PATH_REVIEW_GATE_SHA256);
    expect(sha256(readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH,
    ))).toBe(PLAN040_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_SHA256);
    const rebuilt = buildPlan040Package10bPathReviewAndAcceptance({
      acceptedAt: "2026-07-24T14:52:52Z",
    });
    expect(gate).toEqual(rebuilt.gate);
    expect(acceptance).toEqual(rebuilt.acceptance);
    expect(gate).toEqual(expect.objectContaining({
      reviewed_commit: PLAN040_PACKAGE_10B_PATH_AMENDMENT_COMMIT,
      candidate_count: 4,
      candidate_key_sha256: PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
      verdict: "APPROVE",
      authorization_state:
        "fresh_compact_dual_path_review_approved_pending_owner_supplemental_acceptance",
      authorizes_decision_persistence: false,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    }));
    expect(gate.reviewer_results).toEqual([
      expect.objectContaining({
        reviewed_commit: PLAN040_PACKAGE_10B_PATH_AMENDMENT_COMMIT,
        verdict: "APPROVE",
      }),
      expect.objectContaining({
        reviewed_commit: PLAN040_PACKAGE_10B_PATH_AMENDMENT_COMMIT,
        verdict: "APPROVE",
      }),
    ]);
    expect(gate.invariants).toEqual({
      receipt_bytes_unchanged: true,
      receipt_sha256_unchanged: true,
      candidate_keys_unchanged: true,
      verdicts_unchanged: true,
      proposed_decisions_unchanged: true,
      prior_reviewer_results_unchanged: true,
      prior_authorization_unchanged: true,
      shared_loader_semantics_unchanged: true,
      persistence_performed: false,
    });
    expect(acceptance).toEqual(expect.objectContaining({
      accepted_at: "2026-07-24T14:52:52Z",
      accepted_by: "codex-owner-delegate",
      acceptance_basis: "standing_owner_accelerated_checkpoint_protocol",
      reviewed_commit: PLAN040_PACKAGE_10B_PATH_AMENDMENT_COMMIT,
      authorization_state:
        "owner_supplementally_accepted_path_only_amendment_for_combined_validation_with_prior_acceptance",
      authorizes_path_amendment_integration: true,
      authorizes_previously_accepted_persistence_after_combined_validation:
        true,
      authorizes_new_or_changed_decisions: false,
      authorizes_decision_persistence: false,
      authorizes_reviewed_absence_receipt_persistence: false,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    }));
    expect(
      (acceptance.gate as { sha256: string }).sha256,
    ).toBe(PLAN040_PACKAGE_10B_PATH_REVIEW_GATE_SHA256);
  });

  it("persists exactly three linked decisions and one Q89 dual-surface reviewed absence", () => {
    const draft = readJson<Plan040Package10bDraft>(draftPath);
    const gate = readJson<ReturnType<
      typeof buildPlan040Package10bGateAndAcceptance
    >["gate"]>(PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GATE_PATH);
    const acceptance = readJson<ReturnType<
      typeof buildPlan040Package10bGateAndAcceptance
    >["acceptance"]>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ACCEPTANCE_PATH,
    );
    const pathReviewGate = readJson<ReturnType<
      typeof buildPlan040Package10bPathReviewAndAcceptance
    >["gate"]>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_GATE_PATH,
    );
    const pathReviewAcceptance = readJson<ReturnType<
      typeof buildPlan040Package10bPathReviewAndAcceptance
    >["acceptance"]>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH,
    );
    const accepted = buildPlan040Package10bAcceptedArtifacts({
      draft,
      gate,
      acceptance,
      pathReviewGate,
      pathReviewAcceptance,
    });
    const extentArtifact = readJson<{ decisions: MemberExtentDecision[] }>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_EXTENT_DECISIONS_PATH,
    );
    const grainArtifact = readJson<{ decisions: MemberGrainDecision[] }>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GRAIN_DECISIONS_PATH,
    );
    const absenceArtifact = readJson<{
      receipts: MemberExtentAbsenceReceipt[];
    }>(PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ABSENCE_RECEIPT_PATH);
    expect(sha256(readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_EXTENT_DECISIONS_PATH,
    ))).toBe(PLAN040_PACKAGE_10B_EXTENT_DECISIONS_SHA256);
    expect(sha256(readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GRAIN_DECISIONS_PATH,
    ))).toBe(PLAN040_PACKAGE_10B_GRAIN_DECISIONS_SHA256);
    expect(sha256(readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ABSENCE_RECEIPT_PATH,
    ))).toBe(PLAN040_PACKAGE_10B_ABSENCE_RECEIPT_SHA256);
    expect(extentArtifact.decisions).toEqual(accepted.extentDecisions);
    expect(grainArtifact.decisions).toEqual(accepted.grainDecisions);
    expect(absenceArtifact.receipts).toEqual([accepted.absenceReceipt]);
    expect(extentArtifact.decisions).toHaveLength(3);
    expect(grainArtifact.decisions).toHaveLength(3);
    expect(Object.fromEntries(
      ["route_wide", "bounded_segment"].map((resolution) => [
        resolution,
        extentArtifact.decisions.filter((decision) =>
          decision.resolution === resolution
        ).length,
      ]),
    )).toEqual({ route_wide: 1, bounded_segment: 2 });
    const extentByKey = new Map(extentArtifact.decisions.map((decision) => [
      extentDecisionKey(decision),
      decision,
    ]));
    for (const decision of grainArtifact.decisions) {
      expect(decision.service_scope.kind).toBe("trip_subset");
      expect(decision.member_extent_decision_id).toBe(
        extentByKey.get(memberGrainDecisionKey(decision))!.decision_id,
      );
      expect(decision.reviewed_at).toBe(ACCEPTED_AT);
      expect(decision.reviewed_by).toBe("codex-owner-delegate");
    }
    expect(extentArtifact.decisions.every((decision) =>
      decision.reviewed_at === ACCEPTED_AT &&
      decision.reviewed_by === "codex-owner-delegate"
    )).toBe(true);
    const receipt = absenceArtifact.receipts[0]!;
    expect(receipt.receipt_id).toBe(
      "plan-040-qbnr-service-pattern-package-10b-reviewed-absence-v1",
    );
    expect(receipt.surfaces).toEqual(["member_extent", "member_grain"]);
    expect(receipt.extent_keys).toHaveLength(1);
    expect(receipt.exact_searches).toHaveLength(1);
    expect(receipt.exact_searches[0]).toContain(
      "study-readiness-review:ea9e0f1db4ffbcd5d34356ed",
    );
    expect(receipt.exact_searches[0]).toContain(
      "member-extent-review:53b053d72d04f18923d31522",
    );
    expect(receipt.exact_searches[0]).toContain(
      "preserved_without_supersession",
    );
    expect(receipt.authorizes_study).toBe(false);
    expect(receipt.authorizes_cross_product).toBe(false);
    expect(lstatSync(comparisonReceiptPath).isFile()).toBe(true);
    expect(lstatSync(comparisonReceiptPath).isSymbolicLink()).toBe(false);
    expect(sha256(readFileSync(comparisonReceiptPath))).toBe(
      PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256,
    );
    expect(loadMemberExtentAbsenceReceipts([
      `${repoRoot}/data/quality/acquisition/receipts/member-extent`,
    ]).some((candidate) =>
      candidate.receipt_id === receipt.receipt_id
    )).toBe(true);

    const unauthorized = clone(pathReviewGate);
    unauthorized.reviewer_results[1]!.verdict = "REFUTE" as "APPROVE";
    expect(() =>
      buildPlan040Package10bAcceptedArtifacts({
        draft,
        gate,
        acceptance,
        pathReviewGate: unauthorized,
        pathReviewAcceptance,
      })
    ).toThrow(/path-review|acceptance/u);
  });

  it("replays deterministic ledgers and study surfaces without widening authority", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);
    const extentRows = readJsonl<MemberExtentLedgerRow>(
      `${repoRoot}/data/quality/operational-reference/member-extent-ledger.jsonl`,
    );
    const grainRows = readJsonl<MemberGrainLedgerRow>(
      `${repoRoot}/data/quality/operational-reference/member-grain-ledger.jsonl`,
    );
    expect(extentRows).toHaveLength(308);
    expect(grainRows).toHaveLength(308);
    expect(Object.fromEntries([...new Set(extentRows.map((row) =>
      row.verdict))].sort().map((verdict) => [
      verdict,
      extentRows.filter((row) => row.verdict === verdict).length,
    ]))).toEqual(PLAN040_PACKAGE_15_EXTENT_VERDICT_HISTOGRAM);
    expect(Object.fromEntries([...new Set(grainRows.map((row) =>
      row.verdict))].sort().map((verdict) => [
      verdict,
      grainRows.filter((row) => row.verdict === verdict).length,
    ]))).toEqual(PLAN040_PACKAGE_15_GRAIN_VERDICT_HISTOGRAM);

    const positive = evidence.candidates.slice(0, 3);
    for (const candidate of positive) {
      const extent = extentRows.find((row) =>
        extentDecisionKey(row) === candidate.candidate_key
      )!;
      const grain = grainRows.find((row) =>
        memberGrainDecisionKey(row) === candidate.candidate_key
      )!;
      expect(extent).toEqual(expect.objectContaining({
        current_extent_kind:
          candidate.proposed_extent_decision!.resolution,
        verdict:
          `resolved:${candidate.proposed_extent_decision!.resolution}`,
        receipt_ids: [],
        authorizes_study: false,
        authorizes_cross_product: false,
      }));
      expect(grain).toEqual(expect.objectContaining({
        current_extent_kind:
          candidate.proposed_extent_decision!.resolution,
        spatial_verdict:
          `resolved:${candidate.proposed_extent_decision!.resolution}`,
        member_extent_decision_id:
          candidate.proposed_extent_decision!.decision_id,
        service_scope:
          candidate.proposed_grain_decision!.service_scope,
        lineage_segments:
          candidate.proposed_grain_decision!.lineage_segments,
        verdict: "resolved",
        receipt_ids: [],
        authorizes_study: false,
        authorizes_cross_product: false,
      }));
    }

    const pinnedFiles = {
      extent_ledger:
        `${repoRoot}/data/quality/operational-reference/member-extent-ledger.jsonl`,
      grain_ledger:
        `${repoRoot}/data/quality/operational-reference/member-grain-ledger.jsonl`,
      bridge_ledger:
        `${repoRoot}/data/quality/study-readiness/v1/bridge-ledger.jsonl`,
      study_manifest:
        `${repoRoot}/data/quality/study-readiness/v1/manifest.json`,
      member_extent_contract:
        `${repoRoot}/data/contracts/operational-occurrence-member-extent/v1/` +
          "operational_occurrence_member_extents.jsonl",
      member_extent_manifest:
        `${repoRoot}/data/contracts/operational-occurrence-member-extent/v1/manifest.json`,
      operational_occurrences:
        `${repoRoot}/data/exports/releases/v1-rc26/operational_occurrences.jsonl`,
      reviewed_candidate_packets:
        `${repoRoot}/data/quality/study-readiness/v1/research/` +
          "reviewed-candidate-packets.jsonl",
    };
    for (const [name, path] of Object.entries(pinnedFiles)) {
      expect(sha256(readFileSync(path))).toBe(
        PLAN041_POST_CLOSURE_PROJECTION_PINS[
          name as keyof typeof PLAN041_POST_CLOSURE_PROJECTION_PINS
        ],
      );
    }

    type BridgeRow = {
      candidate_route_id: string | null;
      occurrence_id: string | null;
      authorizes_study: false;
      authorizes_cross_product: false;
      treatment_extent: {
        members: Array<{
          treatment_record_id: string;
          extent: string;
          decision_id: string | null;
          authorizes_study: false;
          authorizes_cross_product: false;
        }>;
      };
    };
    const bridgeRows = readJsonl<BridgeRow>(pinnedFiles.bridge_ledger);
    const q82Bridge = bridgeRows.find((row) =>
      row.candidate_route_id === "Q82" &&
      row.occurrence_id === "occurrence:136f3d32a53a62f096f8f44e"
    )!;
    const q89Bridge = bridgeRows.find((row) =>
      row.candidate_route_id === "Q89" &&
      row.occurrence_id === "occurrence:2748598653b74d33fcdce3d1"
    )!;
    expect(q82Bridge.treatment_extent.members.filter((member) =>
      positive.some((candidate) =>
        candidate.treatment_record_id === member.treatment_record_id
      )
    ).map((member) => [
      member.treatment_record_id,
      member.extent,
      member.decision_id,
    ])).toEqual(positive.map((candidate) => [
      candidate.treatment_record_id,
      candidate.proposed_extent_decision!.resolution,
      candidate.proposed_extent_decision!.decision_id,
    ]));
    expect(q89Bridge.treatment_extent.members.find((member) =>
      member.treatment_record_id ===
        "treatment_q89-q85-green-acres-replacement-2025"
    )).toEqual(expect.objectContaining({
      extent: "unresolved",
      decision_id: "member-extent-review:53b053d72d04f18923d31522",
      authorizes_study: false,
      authorizes_cross_product: false,
    }));
    expect([
      ...extentRows,
      ...grainRows,
      q82Bridge,
      q89Bridge,
    ].every((row) =>
      row.authorizes_study === false &&
      row.authorizes_cross_product === false
    )).toBe(true);
  });

  it("fails closed on chain, Q89 preservation, P8, and exclusion drift", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);

    const chain = clone(evidence.candidates);
    (chain[0]!.accepted_evidence as {
      full_stop_chains: Array<{ stop_ids: string[] }>;
    }).full_stop_chains[0]!.stop_ids.reverse();
    expect(() =>
      buildPlan040Package10bDraft(
        inputFor(evidence, chain),
      )
    ).toThrow(/Q82 evidence/u);

    const comparison = clone(evidence.candidates);
    (comparison[1]!.accepted_evidence as {
      candidate_full_stop_comparisons: Array<{
        selected_candidate_slice: {
          identical_stop_id_equivalences: unknown[];
        };
      }>;
    }).candidate_full_stop_comparisons[0]!
      .selected_candidate_slice.identical_stop_id_equivalences = [];
    expect(() =>
      buildPlan040Package10bDraft(
        inputFor(evidence, comparison),
      )
    ).toThrow(/predecessor comparator/u);

    const boundary = clone(evidence.candidates);
    boundary[1]!.proposed_grain_decision!.lineage_segments[1]!
      .boundary_stop_ids = ["500123", "552252"];
    expect(() =>
      buildPlan040Package10bDraft(
        inputFor(evidence, boundary),
      )
    ).toThrow(/predecessor comparator/u);

    const receiptDrift = clone(evidence.comparison_receipt) as unknown as {
      sha256: string;
      upstream_pins: {
        snapshot_registry: { sha256: string };
      };
    };
    receiptDrift.sha256 = "0".repeat(64);
    receiptDrift.upstream_pins.snapshot_registry.sha256 = "0".repeat(64);
    expect(() =>
      buildPlan040Package10bDraft(
        inputFor(
          evidence,
          evidence.candidates,
          evidence.exclusions,
          evidence.preserved_package_8_predecessor_rows,
          receiptDrift as unknown as Plan040Package10bComparisonReceiptRef,
        ),
      )
    ).toThrow(/comparison receipt/u);

    const q89 = clone(evidence.candidates);
    q89[3]!.proposed_extent_decision =
      clone(q89[0]!.proposed_extent_decision);
    expect(() =>
      buildPlan040Package10bDraft(
        inputFor(evidence, q89),
      )
    ).toThrow(/Q89 preservation/u);

    const p8 = clone(evidence.preserved_package_8_predecessor_rows);
    p8.extent_rows[0]!.verdict = "unreviewed";
    expect(() =>
      buildPlan040Package10bDraft(
        inputFor(evidence, evidence.candidates, evidence.exclusions, p8),
      )
    ).toThrow(/P8 predecessor/u);

    const exclusions = clone(evidence.exclusions);
    exclusions[0]!.candidate_keys.pop();
    expect(() =>
      buildPlan040Package10bDraft(
        inputFor(evidence, evidence.candidates, exclusions),
      )
    ).toThrow(/exclusion/u);
  });
});
