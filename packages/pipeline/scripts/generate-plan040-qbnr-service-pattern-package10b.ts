import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  compareFullStopPatterns,
  fullStopPatternsForDate,
  type HistoricalFullStopPattern,
} from "../src/reference/historical-full-stop.js";
import { loadGtfsStaticSnapshot } from "../src/reference/gtfs-static.js";
import {
  loadOperationalSnapshotRegistry,
  snapshotById,
} from "../src/reference/snapshot-registry.js";
import type { MemberGrainDecision } from
  "../src/quality/member-grain-decisions.js";
import type {
  MemberExtentLedgerRow,
  MemberGrainLedgerRow,
} from "../src/quality/member-extent-ledger.js";
import {
  PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_10B_ACQUISITION_PINS,
  PLAN040_PACKAGE_10B_COMPARISON_IDS,
  PLAN040_PACKAGE_10B_COMPARISON_PINS,
  PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256,
  PLAN040_PACKAGE_10B_EXCLUSION_HASHES,
  PLAN040_PACKAGE_10B_PATTERN_IDS,
  PLAN040_PACKAGE_10B_POST_10A_PINS,
  PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS,
  PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_PINS,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B,
  buildPlan040Package10bDraft,
  type Plan040Package10bCandidateEvidence,
  type Plan040Package10bComparisonReceiptRef,
  type Plan040Package10bExclusion,
  type Plan040Package10bPreservedPackage8,
} from "../src/quality/plan040-qbnr-service-pattern-package10b.js";
import type { Plan040Package8VersionSeparation } from
  "../src/quality/plan040-qbnr-service-pattern-package8.js";
import type {
  ExactEvidenceBinding,
  MemberExtentDecision,
} from "../src/quality/study-readiness-v1.js";

const riskRoot = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk",
);
const evidenceRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10b-evidence-v1.json";
const draftRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10b-evidence-draft-v1.json";
const comparisonReceiptRelative =
  "data/quality/acquisition/receipts/member-extent-evidence/" +
  "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1.json";
const comparisonReceiptSourceId =
  "plan_040_qbnr_service_pattern_package_10b_full_stop_equivalence" as const;
const extentLedgerPath = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-ledger.jsonl",
);
const grainLedgerPath = join(
  repoRoot,
  "data/quality/operational-reference/member-grain-ledger.jsonl",
);

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const readJsonl = <T>(path: string): T[] =>
  readFileSync(path, "utf8").trim().split("\n")
    .filter(Boolean).map((line) => JSON.parse(line) as T);
const clone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
const writeStable = (path: string, value: JsonValue): void =>
  writeFileSync(path, `${stableJson(value)}\n`);

const extentRows = readJsonl<MemberExtentLedgerRow>(extentLedgerPath);
const grainRows = readJsonl<MemberGrainLedgerRow>(grainLedgerPath);
if (
  sha256(readFileSync(extentLedgerPath)) !==
    PLAN040_PACKAGE_10B_POST_10A_PINS.extent_ledger ||
  sha256(readFileSync(grainLedgerPath)) !==
    PLAN040_PACKAGE_10B_POST_10A_PINS.grain_ledger
) {
  throw new Error("Package 10B requires the exact post-10A ledgers");
}

const priorLedger = (treatmentRecordId: string) => {
  const extent = extentRows.find((row) =>
    row.treatment_record_id === treatmentRecordId
  );
  const grain = grainRows.find((row) =>
    row.treatment_record_id === treatmentRecordId
  );
  if (!extent || !grain) {
    throw new Error(`${treatmentRecordId}: ledger rows missing`);
  }
  return { extent_row: extent, grain_row: grain };
};

const q82Chains = [
  {
    pattern_id: PLAN040_PACKAGE_10B_PATTERN_IDS.direction_0,
    direction_id: "0",
    shape_id: "Q820026",
    trip_count: 51,
    trip_id_sha256:
      "767222be7e09be59894427ee12bcc1f814b39f7828d5fd4dad29fda04de5627a",
    stop_ids: [
      "700816", "503984", "501908", "505096", "500018", "503965",
      "500022", "501925", "501927", "552247", "552248", "552249",
      "505131", "701055", "500122", "904250",
    ],
    stop_chain_sha256:
      "9c85b382e78fcf4db6d219ec72c2636413e8dc2c1dd1a01a110ecb6d186b9eae",
  },
  {
    pattern_id: PLAN040_PACKAGE_10B_PATTERN_IDS.direction_1,
    direction_id: "1",
    shape_id: "Q820032",
    trip_count: 51,
    trip_id_sha256:
      "81d7841bd9bd2717fb02b5bcd68da3327be333f3d2794f3febe30aac915c5bb4",
    stop_ids: [
      "553437", "500123", "500125", "552252", "552727", "501962",
      "501964", "501966", "500072", "500074", "500080", "501414",
      "700815",
    ],
    stop_chain_sha256:
      "08dc890c186a6d93297f019b06957885ab179a04193c0149beca1f00c0175c11",
  },
] as const;

const q82LaunchEvidence = {
  launch_feed: {
    source_id: "gtfs_static_20250626_queens_post_qbnr",
    receipt_path:
      "raw/sources/gtfs_static_20250626_queens_post_qbnr/receipt.json",
    receipt_sha256:
      "0a66e26e639674b88bd1d0251d6a15f4cab2205e794fa14a3d75367c43394eeb",
    zip_sha1: "c868290ddcd79c69712d809ece96d96dbad2c613",
    zip_sha256:
      "4db0f151dc541f2669dde72f104c7803b0f99258bc5d14278b04c8016ce7471a",
    target_date: "2025-06-29",
    calendar_policy: "calendar_plus_calendar_dates",
    active_service_id_sha256:
      "813619a6d363ab72fdd0cb45bfd96d6606349584e15854b0978a7a55631f78fd",
    active_trip_count: 102,
    active_direction_counts: { "0": 51, "1": 51 },
    active_shape_ids: ["Q820026", "Q820032"],
    active_trip_id_sha256:
      "f199027fee425aa9c72bda60e8a29afdcbc496ba72b86b0f88a66670555f59e2",
  },
  launch_schedule: {
    source_id: "mta_bus_schedules_2025_candidate_windows",
    source_csv_sha256: PLAN040_PACKAGE_10B_POST_10A_PINS.schedule_csv,
    acquisition_receipt_sha256:
      PLAN040_PACKAGE_10B_POST_10A_PINS.schedule_receipt,
    blocks_sha256: PLAN040_PACKAGE_10B_POST_10A_PINS.schedule_blocks,
    schedule_date: "2025-06-29T00:00:00.000",
    route_id: "Q82",
    row_count: 578,
    trip_type_rows: { "1": 510, "2": 34, "3": 34 },
    passenger_policy: "any_trip_type_except_2_3_4",
    passenger_shape_ids: ["Q820026", "Q820032"],
    nonrevenue_shape_ids: ["Q820002", "Q820030"],
    slice_sha256:
      "11fda16e73a93a41e3d1e256d5fd6622906216e2b19484a8513ff0050b0d53b3",
  },
  full_stop_chains: q82Chains,
  complete_active_trip_coverage: true,
} as const;

const operationalRegistry = loadOperationalSnapshotRegistry();
const loadPatterns = (
  snapshotId: string,
  date: string,
  routeId: string,
): HistoricalFullStopPattern[] =>
  fullStopPatternsForDate(
    loadGtfsStaticSnapshot(
      snapshotById(operationalRegistry, snapshotId),
      ["calendar", "calendar_dates", "routes", "stops", "stop_times", "trips"],
      repoRoot,
      new Set([routeId]),
    ),
    date,
    routeId,
  );
const q82CanonicalPatterns = loadPatterns(
  "gtfs-static-20250626-queens-post-qbnr",
  "2025-06-29",
  "Q82",
);
const q110CanonicalPatterns = loadPatterns(
  "gtfs-static-20250625-busco-pre-qbnr",
  "2025-06-28",
  "Q110",
);
const q36CanonicalPatterns = loadPatterns(
  "gtfs-static-20250615-queens-pre-qbnr",
  "2025-06-28",
  "Q36",
);
const patternInventory = (pattern: HistoricalFullStopPattern) => ({
  pattern_id: pattern.pattern_id,
  snapshot_id: pattern.snapshot_id,
  service_date: pattern.service_date,
  route_id: pattern.route_id,
  direction_id: pattern.direction_id,
  trip_count: pattern.trip_count,
  trip_id_sha256: sortedHash(pattern.trip_ids),
  shape_ids: pattern.shape_ids,
  stop_count: pattern.stops.length,
  stop_ids: pattern.stops.map((stop) => stop.stop_id),
  stops: pattern.stops,
  stop_chain_sha256: sha256(
    `${pattern.stops.map((stop) => stop.stop_id).join("\n")}\n`,
  ),
});
const successorPatternInventories = q82CanonicalPatterns.map(patternInventory);
const predecessorPatternInventories = [
  ...q110CanonicalPatterns,
  ...q36CanonicalPatterns,
].map(patternInventory);
const canonicalPatternIds = {
  q82_direction_0: q82CanonicalPatterns.find((row) =>
    row.direction_id === "0")?.pattern_id,
  q82_direction_1: q82CanonicalPatterns.find((row) =>
    row.direction_id === "1")?.pattern_id,
  q110_direction_0: q110CanonicalPatterns.find((row) =>
    row.direction_id === "0")?.pattern_id,
  q110_direction_1: q110CanonicalPatterns.find((row) =>
    row.direction_id === "1")?.pattern_id,
  q36_direction_0: q36CanonicalPatterns.find((row) =>
    row.direction_id === "0")?.pattern_id,
  q36_direction_1: q36CanonicalPatterns.find((row) =>
    row.direction_id === "1")?.pattern_id,
};
if (
  canonicalPatternIds.q82_direction_0 !==
    PLAN040_PACKAGE_10B_PATTERN_IDS.direction_0 ||
  canonicalPatternIds.q82_direction_1 !==
    PLAN040_PACKAGE_10B_PATTERN_IDS.direction_1 ||
  canonicalPatternIds.q110_direction_0 !==
    PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q110_direction_0 ||
  canonicalPatternIds.q110_direction_1 !==
    PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q110_direction_1 ||
  canonicalPatternIds.q36_direction_0 !==
    PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q36_direction_0 ||
  canonicalPatternIds.q36_direction_1 !==
    PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_IDS.q36_direction_1
) {
  throw new Error("Package 10B canonical pattern identities drifted");
}
for (const chain of q82Chains) {
  const canonical = successorPatternInventories.find((pattern) =>
    pattern.direction_id === chain.direction_id);
  if (
    canonical?.pattern_id !== chain.pattern_id ||
    canonical.trip_count !== chain.trip_count ||
    canonical.trip_id_sha256 !== chain.trip_id_sha256 ||
    canonical.stop_chain_sha256 !== chain.stop_chain_sha256 ||
    stableJson(canonical.stop_ids as JsonValue) !==
      stableJson(chain.stop_ids as unknown as JsonValue)
  ) {
    throw new Error(`Q82 direction ${chain.direction_id}: canonical chain drifted`);
  }
}
for (const pin of Object.values(
  PLAN040_PACKAGE_10B_PREDECESSOR_PATTERN_PINS,
)) {
  const canonical = predecessorPatternInventories.find((pattern) =>
    pattern.pattern_id === pin.pattern_id);
  if (
    canonical?.trip_count !== pin.trip_count ||
    canonical.trip_id_sha256 !== pin.trip_id_sha256 ||
    canonical.stop_count !== pin.stop_count ||
    canonical.stop_chain_sha256 !== pin.stop_chain_sha256
  ) {
    throw new Error(`${pin.pattern_id}: predecessor chain pin drifted`);
  }
}

const comparisonSpecs = [
  {
    predecessor_route_id: "Q110",
    direction_id: "0",
    named_street_scope: "Hempstead Av",
    treatment_record_id:
      "treatment_q82-q110-hempstead-replacement-2025",
    source_evidence_id:
      "mta_queens_bus_network_redesign_service_changes#p001_b0079",
    boundary_stop_ids: ["552248", "500122"],
    expected_comparison_id:
      PLAN040_PACKAGE_10B_COMPARISON_IDS.q110_direction_0,
  },
  {
    predecessor_route_id: "Q110",
    direction_id: "1",
    named_street_scope: "Hempstead Av",
    boundary_rationale:
      "Stop 501962 JAMAICA AV/212 PL is the exact shared immediately-after-Hempstead boundary; it is not claimed as Hempstead Av interior.",
    treatment_record_id:
      "treatment_q82-q110-hempstead-replacement-2025",
    source_evidence_id:
      "mta_queens_bus_network_redesign_service_changes#p001_b0079",
    boundary_stop_ids: ["500123", "501962"],
    expected_comparison_id:
      PLAN040_PACKAGE_10B_COMPARISON_IDS.q110_direction_1,
  },
  {
    predecessor_route_id: "Q36",
    direction_id: "0",
    named_street_scope: "212 St/212 Pl",
    treatment_record_id: "treatment_q82-q36-212-replacement-2025",
    source_evidence_id:
      "mta_queens_bus_network_redesign_service_changes#p001_b0079",
    boundary_stop_ids: ["500022", "501927"],
    expected_comparison_id:
      PLAN040_PACKAGE_10B_COMPARISON_IDS.q36_direction_0,
  },
  {
    predecessor_route_id: "Q36",
    direction_id: "1",
    named_street_scope: "212 St/212 Pl",
    treatment_record_id: "treatment_q82-q36-212-replacement-2025",
    source_evidence_id:
      "mta_queens_bus_network_redesign_service_changes#p001_b0079",
    boundary_stop_ids: ["501962", "501966"],
    expected_comparison_id:
      PLAN040_PACKAGE_10B_COMPARISON_IDS.q36_direction_1,
  },
] as const;
const sliceByBounds = (
  pattern: HistoricalFullStopPattern,
  bounds: readonly [string, string] | readonly string[],
) => {
  const ids = pattern.stops.map((stop) => stop.stop_id);
  const start = ids.indexOf(bounds[0]!);
  const end = ids.indexOf(bounds[1]!);
  if (start < 0 || end < start) {
    throw new Error(
      `${pattern.pattern_id}: invalid selected bounds ${bounds.join("..")}`,
    );
  }
  return pattern.stops.slice(start, end + 1);
};
const stopEvidence = (
  pattern: HistoricalFullStopPattern,
  stopId: string,
) => {
  const stop = pattern.stops.find((row) => row.stop_id === stopId);
  if (!stop) throw new Error(`${pattern.pattern_id}: stop ${stopId} missing`);
  return stop;
};
const comparisonInventories = comparisonSpecs.map((spec) => {
  const predecessors = spec.predecessor_route_id === "Q110"
    ? q110CanonicalPatterns
    : q36CanonicalPatterns;
  const before = predecessors.find((row) =>
    row.direction_id === spec.direction_id)!;
  const after = q82CanonicalPatterns.find((row) =>
    row.direction_id === spec.direction_id)!;
  const full = compareFullStopPatterns(before, after);
  if (
    full.comparison_id !== spec.expected_comparison_id ||
    !full.accepted
  ) {
    throw new Error(`${spec.predecessor_route_id} ${spec.direction_id}: comparison drifted`);
  }
  const beforeSlice = sliceByBounds(before, spec.boundary_stop_ids);
  const afterSlice = sliceByBounds(after, spec.boundary_stop_ids);
  const afterIds = new Set(afterSlice.map((stop) => stop.stop_id));
  const beforeIds = new Set(beforeSlice.map((stop) => stop.stop_id));
  const identicalIds = beforeSlice.map((stop) => stop.stop_id)
    .filter((stopId) => afterIds.has(stopId));
  const beforeOnly = beforeSlice.filter((stop) => !afterIds.has(stop.stop_id));
  const afterOnly = afterSlice.filter((stop) => !beforeIds.has(stop.stop_id));
  const selectedIds = new Set([
    ...beforeSlice.map((stop) => stop.stop_id),
    ...afterSlice.map((stop) => stop.stop_id),
  ]);
  const outsideSharedIds = full.shared_stop_ids.filter((stopId) =>
    !selectedIds.has(stopId));
  const selectedPayload = {
    named_street_scope: spec.named_street_scope,
    ...("boundary_rationale" in spec
      ? { boundary_rationale: spec.boundary_rationale }
      : {}),
    source_evidence_id: spec.source_evidence_id,
    boundary_stop_ids: [...spec.boundary_stop_ids],
    boundary_stop_evidence: spec.boundary_stop_ids.map((stopId) => ({
      stop_id: stopId,
      before_stop_name: stopEvidence(before, stopId).stop_name,
      after_stop_name: stopEvidence(after, stopId).stop_name,
    })),
    before_stop_ids: beforeSlice.map((stop) => stop.stop_id),
    after_stop_ids: afterSlice.map((stop) => stop.stop_id),
    identical_stop_id_equivalences: identicalIds.map((stopId) => ({
      before_stop_id: stopId,
      after_stop_id: stopId,
      before_stop_name: stopEvidence(before, stopId).stop_name,
      after_stop_name: stopEvidence(after, stopId).stop_name,
      equivalence_basis: "identical_stop_id" as const,
    })),
    before_only_stop_ids: beforeOnly.map((stop) => stop.stop_id),
    before_only_stops: beforeOnly.map((stop) => ({
      ...stop,
      disposition: "unresolved_no_equivalence_authorized",
    })),
    after_only_stop_ids: afterOnly.map((stop) => stop.stop_id),
    after_only_stops: afterOnly.map((stop) => ({
      ...stop,
      disposition: "unresolved_no_equivalence_authorized",
    })),
    shared_stop_ids_outside_candidate_slice: outsideSharedIds,
    shared_stops_outside_candidate_slice: outsideSharedIds.map((stopId) => ({
      stop_id: stopId,
      before_stop_name: stopEvidence(before, stopId).stop_name,
      after_stop_name: stopEvidence(after, stopId).stop_name,
      exclusion_reason:
        `outside_source_named_${spec.named_street_scope.replaceAll(/[^A-Za-z0-9]+/gu, "_").toLowerCase()}_candidate_slice`,
    })),
    changed_id_equivalence_authorized: false,
    changed_id_disposition: "unresolved_no_equivalence_authorized",
  };
  return {
    comparison_id: full.comparison_id,
    predecessor_pattern_id: before.pattern_id,
    successor_pattern_id: after.pattern_id,
    predecessor_route_id: before.route_id,
    successor_route_id: after.route_id,
    direction_id: spec.direction_id,
    treatment_record_id: spec.treatment_record_id,
    full_chain_comparison: full,
    full_chain_comparison_sha256: sha256(
      `${stableJson(full as unknown as JsonValue)}\n`,
    ),
    selected_candidate_slice: {
      ...selectedPayload,
      comparison_sha256: sha256(
        `${stableJson(selectedPayload as unknown as JsonValue)}\n`,
      ),
    },
  };
});
for (const pin of Object.values(PLAN040_PACKAGE_10B_COMPARISON_PINS)) {
  const canonical = comparisonInventories.find((comparison) =>
    comparison.comparison_id === pin.comparison_id);
  if (
    canonical?.full_chain_comparison_sha256 !==
      pin.full_chain_comparison_sha256 ||
    canonical.selected_candidate_slice.comparison_sha256 !==
      pin.selected_candidate_slice_sha256
  ) {
    throw new Error(
      `${pin.comparison_id}: comparison pin drifted ` +
      `(full=${canonical?.full_chain_comparison_sha256 ?? "missing"} ` +
      `selected=${canonical?.selected_candidate_slice.comparison_sha256 ?? "missing"})`,
    );
  }
}

const comparisonReceipt = {
  schema_version: 1,
  receipt_id:
    "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1",
  source_id: comparisonReceiptSourceId,
  upstream_pins: PLAN040_PACKAGE_10B_ACQUISITION_PINS,
  accepted_snapshot_inputs: [
    {
      snapshot_id: "gtfs-static-20250625-busco-pre-qbnr",
      source_id: "gtfs_static_20250625_busco_pre_qbnr",
      service_date: "2025-06-28",
      receipt_path:
        "raw/sources/gtfs_static_20250625_busco_pre_qbnr/receipt.json",
      receipt_sha256:
        "de2d6e8c9a5cf700b0bee32e53634f1d2b984a8c3b8e41b51f84991cb3b7cae9",
      zip_path:
        "raw/sources/gtfs_static_20250625_busco_pre_qbnr/source.zip",
      zip_sha1: "a52f278150cd9bc03082f76fccd57f1c8c331d3c",
      zip_sha256:
        "eb4fd60a8dfa63bac5e4cd3204e61b48420b474724cac708d115615e547ff3e1",
      calendar_expansion: {
        policy: "calendar_plus_calendar_dates",
        active_service_ids: [
          "BPPB5-BP_B5-Saturday-02", "CPPB5-CP_B5-Saturday-02",
          "ECPB5-EC_B5-Saturday-02", "FRPB5-FR_B5-Saturday-12",
          "JKPB5-JK_B5-Saturday-02", "LGPB5-LG_B5-Saturday-02",
          "SCPB5-SC_B5-Saturday-02", "YOPB5-YO_B5-Saturday-02",
        ],
        active_service_id_sha256:
          "fb9b616264a00d7ad49aa365f4d80e47847d23b7ab217d3ba36b4de4ea1753d3",
      },
    },
    {
      snapshot_id: "gtfs-static-20250615-queens-pre-qbnr",
      source_id: "gtfs_static_20250615_queens_pre_qbnr",
      service_date: "2025-06-28",
      receipt_path:
        "raw/sources/gtfs_static_20250615_queens_pre_qbnr/receipt.json",
      receipt_sha256:
        "07fc854e9d4f2e980048741b335c95f781f03b8a8914c4eb0acd51bd92c540c6",
      zip_path:
        "raw/sources/gtfs_static_20250615_queens_pre_qbnr/source.zip",
      zip_sha1: "c96466458c55036cd6feeadc291bf5951d6c3274",
      zip_sha256:
        "2ddcb01c8ceb6c822a28819570692af99491be0967412e130d7a26131820e6ef",
      calendar_expansion: {
        policy: "calendar_plus_calendar_dates",
        active_service_ids: [
          "CS_B5-Saturday", "JA_B5-Saturday", "QV_B5-Saturday",
        ],
        active_service_id_sha256:
          "ba9cebbfaf0a038948405f4b35c85459e22f22e21de2dd89c73f6ca3b326ab03",
      },
    },
    {
      snapshot_id: "gtfs-static-20250626-queens-post-qbnr",
      source_id: "gtfs_static_20250626_queens_post_qbnr",
      service_date: "2025-06-29",
      receipt_path:
        "raw/sources/gtfs_static_20250626_queens_post_qbnr/receipt.json",
      receipt_sha256:
        "0a66e26e639674b88bd1d0251d6a15f4cab2205e794fa14a3d75367c43394eeb",
      zip_path:
        "raw/sources/gtfs_static_20250626_queens_post_qbnr/source.zip",
      zip_sha1: "c868290ddcd79c69712d809ece96d96dbad2c613",
      zip_sha256:
        "4db0f151dc541f2669dde72f104c7803b0f99258bc5d14278b04c8016ce7471a",
      calendar_expansion: {
        policy: "calendar_plus_calendar_dates",
        active_service_ids: [
          "CS_C5-Sunday", "CS_C5-Weekday-BM", "JA_C5-Sunday",
          "QV_C5-Sunday", "QV_C5-Weekday-BM",
        ],
        active_service_id_sha256:
          "813619a6d363ab72fdd0cb45bfd96d6606349584e15854b0978a7a55631f78fd",
      },
    },
  ],
  coverage: {
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
  },
  predecessor_patterns: predecessorPatternInventories,
  successor_patterns: successorPatternInventories,
  comparisons: comparisonInventories,
  equivalence_policy: {
    accepted_equivalence:
      "identical_stop_id_or_separately_cited_first_party_crosswalk_only",
    applied_equivalence: "identical_stop_id_only",
    first_party_crosswalk_search_outcome:
      "no_crosswalk_found_not_required_for_identical_stop_id_equivalences",
    proximity_name_coordinate_or_adjacency_equivalence_authorized: false,
    before_only_and_after_only_stops:
      "unresolved_no_equivalence_authorized",
  },
  changed_id_guesses: [
    {
      before_stop_ids: ["500120", "500121"],
      after_stop_ids: ["701055"],
      context: "Q110 direction 0 selected Hempstead Av slice",
      status: "unresolved_no_equivalence_authorized",
    },
    {
      before_stop_ids: ["552250"],
      after_stop_ids: ["552727"],
      context:
        "Q110 direction 1 selected Hempstead Av transition slice before the exact shared 501962 boundary",
      status: "unresolved_no_equivalence_authorized",
    },
    {
      before_stop_ids: ["500071"],
      after_stop_ids: ["500072"],
      context:
        "Q36 direction 1 immediately outside selected 212 St/212 Pl slice",
      status: "unresolved_no_equivalence_authorized",
    },
  ],
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
writeStable(
  join(repoRoot, comparisonReceiptRelative),
  comparisonReceipt as unknown as JsonValue,
);
const comparisonReceiptRef: Plan040Package10bComparisonReceiptRef = {
  path: comparisonReceiptRelative,
  sha256: sha256(readFileSync(join(repoRoot, comparisonReceiptRelative))),
  receipt_id:
    "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1",
  source_id: comparisonReceiptSourceId,
  upstream_pins: PLAN040_PACKAGE_10B_ACQUISITION_PINS,
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
if (
  comparisonReceiptRef.sha256 !==
    PLAN040_PACKAGE_10B_COMPARISON_RECEIPT_SHA256
) {
  throw new Error(
    "Package 10B comparison receipt bytes drifted " +
    `(actual=${comparisonReceiptRef.sha256})`,
  );
}

const binding = (
  treatmentRecordId: string,
  role: string,
  sourceId: string,
  evidenceId: string,
): ExactEvidenceBinding => ({
  role,
  record_id: treatmentRecordId,
  source_id: sourceId,
  evidence_id: evidenceId,
});
const sortedBindings = (
  values: ExactEvidenceBinding[],
): ExactEvidenceBinding[] =>
  values.sort((left, right) =>
    [
      left.role, left.record_id, left.source_id, left.evidence_id,
    ].join("\0").localeCompare([
      right.role, right.record_id, right.source_id, right.evidence_id,
    ].join("\0")));

const decisionBindings = (treatmentRecordId: string) =>
  sortedBindings([
    binding(
      treatmentRecordId,
      "candidate_service_change_statement",
      "mta_queens_bus_network_redesign_service_changes",
      "mta_queens_bus_network_redesign_service_changes#p001_b0079",
    ),
    binding(
      treatmentRecordId,
      "launch_schedule_trip_type_validation",
      "mta_bus_schedules_2025_candidate_windows",
      "mta_bus_schedules_2025_candidate_windows#p001_b0001",
    ),
    binding(
      treatmentRecordId,
      "full_stop_equivalence_receipt",
      comparisonReceiptSourceId,
      `${comparisonReceiptSourceId}#${comparisonReceipt.receipt_id}`,
    ),
    ...q82Chains.map((chain) =>
      binding(
        treatmentRecordId,
        "successor_ordered_full_stop_chain",
        comparisonReceiptSourceId,
        `${comparisonReceiptSourceId}#${chain.pattern_id}`,
      )),
  ]);

const reviewedAt = "1970-01-01T00:00:00Z";
const reviewedBy = "pending-plan-040-package-10b-dual-risk-review";
const q82Base = {
  occurrence_id: "occurrence:136f3d32a53a62f096f8f44e",
  route_record_id: "route_q82-queens",
  gtfs_route_id: "Q82" as const,
  treatment_family: "service_pattern" as const,
  source_statement: {
    source_id:
      "mta_queens_bus_network_redesign_service_changes" as const,
    evidence_id:
      "mta_queens_bus_network_redesign_service_changes#p001_b0079",
    block_id: "p001_b0079" as const,
    block_sha256:
      "sha256:b0ab037f3bdf260561c984b18c873bfa743e84c64c2cf0df8d9834403b1100c4",
    source_quote: "",
    route_row_sha256:
      "6faea54f3495cfdd52eb359cff527aea92c5210ce6038c9cecc3e07ac0c48e0d",
  },
  persisted_extent_decision: null,
  persisted_grain_decision: null,
  authorizes_occurrence: false as const,
  authorizes_study: false as const,
  authorizes_cross_product: false as const,
  authorizes_decision_persistence: false as const,
};

function q82Candidate(input: {
  treatmentRecordId:
    | "treatment_q82-belmont-jamaica-connection-2025"
    | "treatment_q82-q110-hempstead-replacement-2025"
    | "treatment_q82-q36-212-replacement-2025";
  sourceQuote: string;
  resolution: "route_wide" | "bounded_segment";
  components: MemberExtentDecision["components"];
  predecessor: null | {
    route_id: "Q110" | "Q36";
    source_id:
      | "gtfs_static_20250625_busco_pre_qbnr"
      | "gtfs_static_20250615_queens_pre_qbnr";
    receipt_sha256: string;
    zip_sha1: string;
    zip_sha256: string;
    active_trip_count: number;
    active_direction_counts: Record<string, number>;
    shape_ids: string[];
    schedule_row_count: number;
    schedule_passenger_shape_ids: string[];
    schedule_slice_sha256: string;
    source_evidence_id: string;
  };
  lineage: MemberGrainDecision["lineage_segments"];
  rejected: string[];
}): Plan040Package10bCandidateEvidence {
  const slug = input.treatmentRecordId
    .replace("treatment_", "").replace("-2025", "");
  const extentId = `member-extent-review:plan040-package10b-${slug}`;
  const evidenceBindings = decisionBindings(input.treatmentRecordId);
  const predecessorPatterns = input.predecessor
    ? predecessorPatternInventories.filter((pattern) =>
      pattern.route_id === input.predecessor?.route_id)
    : [];
  const candidateComparisons = input.predecessor
    ? comparisonInventories.filter((comparison) =>
      comparison.treatment_record_id === input.treatmentRecordId)
    : [];
  if (input.predecessor) {
    evidenceBindings.push(
      binding(
        input.treatmentRecordId,
        "predecessor_service_change_statement",
        "mta_queens_bus_network_redesign_service_changes",
        input.predecessor.source_evidence_id,
      ),
      ...predecessorPatterns.map((pattern) =>
        binding(
          input.treatmentRecordId,
          "predecessor_ordered_full_stop_chain",
          comparisonReceiptSourceId,
          `${comparisonReceiptSourceId}#${pattern.pattern_id}`,
        )),
      ...candidateComparisons.map((comparison) =>
        binding(
          input.treatmentRecordId,
          "candidate_bound_full_stop_comparison",
          comparisonReceiptSourceId,
          `${comparisonReceiptSourceId}#${comparison.comparison_id}`,
        )),
    );
    sortedBindings(evidenceBindings);
  }
  const extent: MemberExtentDecision = {
    decision_id: extentId,
    occurrence_id: q82Base.occurrence_id,
    route_record_id: q82Base.route_record_id,
    treatment_record_id: input.treatmentRecordId,
    resolution: input.resolution,
    components: input.components,
    evidence_bindings: evidenceBindings,
    missing_roles: [],
    rationale: input.resolution === "route_wide"
      ? "The first-party statement defines the new Q82 as the Belmont Park-to-Jamaica connection; the route component is therefore route-wide while service grain remains limited to exact launch-weekend patterns."
      : input.treatmentRecordId ===
          "treatment_q82-q110-hempstead-replacement-2025"
      ? "The first-party Hempstead Av replacement statement is bound through exact shared stop 501962 immediately after the named street segment. Stop 501962 is a boundary, not claimed as Hempstead Av interior; changed stop identifiers remain unresolved."
      : "The first-party replacement statement is bound only to shared stop identifiers observed in the exact predecessor and successor evidence. Adjacent or skipped stop identities are not inferred.",
    reviewed_at: reviewedAt,
    reviewed_by: reviewedBy,
  };
  const grain: MemberGrainDecision = {
    schema_version: 1,
    contract_id: "member-grain-decision-v1",
    decision_id: `member-grain-review:plan040-package10b-${slug}`,
    occurrence_id: q82Base.occurrence_id,
    route_record_id: q82Base.route_record_id,
    gtfs_route_id: "Q82",
    treatment_record_id: input.treatmentRecordId,
    member_extent_decision_id: extentId,
    service_scope: {
      kind: "trip_subset",
      periods: ["weekend"],
      directions: ["0", "1"],
      pattern_ids: Object.values(PLAN040_PACKAGE_10B_PATTERN_IDS).sort(),
      description:
        "Only the exact accepted initial-post Q82 passenger patterns on the implementation-date weekend slice.",
    },
    lineage_segments: input.lineage,
    evidence_bindings: evidenceBindings,
    rationale: input.predecessor
      ? input.treatmentRecordId ===
          "treatment_q82-q110-hempstead-replacement-2025"
        ? "The two exact Q82 launch patterns are retained; direction 1 runs through changed Hempstead stop identifiers to exact shared boundary 501962, which is not claimed as Hempstead interior."
        : "The two exact Q82 launch patterns are retained, with predecessor lineage limited to shared stop identifiers and exact direction-specific bounds."
      : "The two exact Q82 launch patterns are retained as the only structured service selectors.",
    reviewed_at: reviewedAt,
    reviewed_by: reviewedBy,
  };
  const key =
    `${q82Base.occurrence_id}\0${q82Base.route_record_id}\0${input.treatmentRecordId}`;
  return {
    ...q82Base,
    candidate_key: key,
    treatment_record_id: input.treatmentRecordId,
    source_statement: {
      ...q82Base.source_statement,
      source_quote: input.sourceQuote,
    },
    prior_ledger_state: priorLedger(input.treatmentRecordId),
    accepted_evidence: {
      ...clone(q82LaunchEvidence),
      comparison_receipt: comparisonReceiptRef,
      predecessor_context: input.predecessor,
      predecessor_full_stop_chains: clone(predecessorPatterns),
      candidate_full_stop_comparisons: clone(candidateComparisons),
      rejected_identifier_inferences: input.rejected,
      accepted_initial_post_only: true,
      correction_bytes_used: false,
    },
    exact_candidate_searches: [
      `candidate_key=${key}`,
      "source_id=mta_queens_bus_network_redesign_service_changes evidence_id=mta_queens_bus_network_redesign_service_changes#p001_b0079",
      `source_quote=${JSON.stringify(input.sourceQuote)}`,
      "accepted_post=gtfs_static_20250626_queens_post_qbnr date=2025-06-29 patterns=Q820026,Q820032 trips=102",
      "schedule_source=mta_bus_schedules_2025_candidate_windows date=2025-06-29 route=Q82 rows=578 passenger_shapes=Q820026,Q820032",
      `extent_resolution=${input.resolution} grain=trip_subset directions=0,1 period=weekend`,
      `lineage_predecessor=${input.predecessor?.route_id ?? "none"} rejected_identifier_inferences=${input.rejected.join(",")}`,
      "version_role=published_launch_diff corrected_first_week_diff=blocked_not_run",
    ],
    unresolved_gap_codes: [],
    evidence_verdict: "positive_extent_and_grain_proposed",
    proposed_extent_decision: extent,
    proposed_grain_decision: grain,
  };
}

const q110Lineage = [
  {
    predecessor_gtfs_route_id: "Q110",
    successor_gtfs_route_id: "Q82",
    direction: "0",
    boundary_stop_ids: ["500122", "552248"] as [string, string],
    shared_stop_ids: ["500122", "505131", "552248", "552249"],
  },
  {
    predecessor_gtfs_route_id: "Q110",
    successor_gtfs_route_id: "Q82",
    direction: "1",
    boundary_stop_ids: ["500123", "501962"] as [string, string],
    shared_stop_ids: ["500123", "500125", "501962", "552252"],
  },
];
const q36Lineage = [
  {
    predecessor_gtfs_route_id: "Q36",
    successor_gtfs_route_id: "Q82",
    direction: "0",
    boundary_stop_ids: ["500022", "501927"] as [string, string],
    shared_stop_ids: ["500022", "501925", "501927"],
  },
  {
    predecessor_gtfs_route_id: "Q36",
    successor_gtfs_route_id: "Q82",
    direction: "1",
    boundary_stop_ids: ["501962", "501966"] as [string, string],
    shared_stop_ids: ["501962", "501964", "501966"],
  },
];

const candidates: Plan040Package10bCandidateEvidence[] = [
  q82Candidate({
    treatmentRecordId: "treatment_q82-belmont-jamaica-connection-2025",
    sourceQuote: "The new Q82 will connect Belmont Park to Jamaica,",
    resolution: "route_wide",
    components: [{
      component_kind: "route",
      identity_namespace: "canonical_record",
      identifiers: ["route_q82-queens"],
      description:
        "The exact first-party statement defines the full new Q82 connection from Belmont Park to Jamaica.",
    }],
    predecessor: null,
    lineage: [],
    rejected: [
      "no_occurrence_inference_from_post_inventory",
      "no_predecessor_lineage_for_route_wide_connection",
    ],
  }),
  q82Candidate({
    treatmentRecordId: "treatment_q82-q110-hempstead-replacement-2025",
    sourceQuote: "replacing Q110 service on Hempstead Av",
    resolution: "bounded_segment",
    components: q110Lineage.map((segment) => ({
      component_kind: "segment" as const,
      identity_namespace: "source_literal_v1" as const,
      identifiers: segment.shared_stop_ids,
      description:
        segment.direction === "1"
          ? "Direction 1 exact shared Q110/Q82 stop set bounded by 500123 and 501962; 501962 is the immediately-after-Hempstead boundary, not claimed as Hempstead interior."
          : `Direction ${segment.direction} exact shared Q110/Q82 stop set bounded by ${segment.boundary_stop_ids.join(" and ")}.`,
    })),
    predecessor: {
      route_id: "Q110",
      source_id: "gtfs_static_20250625_busco_pre_qbnr",
      receipt_sha256:
        "de2d6e8c9a5cf700b0bee32e53634f1d2b984a8c3b8e41b51f84991cb3b7cae9",
      zip_sha1: "a52f278150cd9bc03082f76fccd57f1c8c331d3c",
      zip_sha256:
        "eb4fd60a8dfa63bac5e4cd3204e61b48420b474724cac708d115615e547ff3e1",
      active_trip_count: 185,
      active_direction_counts: { "0": 92, "1": 93 },
      shape_ids: ["Q1100159", "Q1100175"],
      schedule_row_count: 1166,
      schedule_passenger_shape_ids: ["Q1100159", "Q1100175"],
      schedule_slice_sha256:
        "5f67dd9c3ad851e22413f972ab196cdffd252811259eac4ef295b4bb6ccee7fa",
      source_evidence_id:
        "mta_queens_bus_network_redesign_service_changes#p001_b0094",
    },
    lineage: q110Lineage,
    rejected: [
      "500120_500121_to_701055_unresolved_no_equivalence_authorized",
      "552250_to_552727_unresolved_no_equivalence_authorized",
    ],
  }),
  q82Candidate({
    treatmentRecordId: "treatment_q82-q36-212-replacement-2025",
    sourceQuote: "and Q36 service on 212 St/212 Pl.",
    resolution: "bounded_segment",
    components: q36Lineage.map((segment) => ({
      component_kind: "segment" as const,
      identity_namespace: "source_literal_v1" as const,
      identifiers: segment.shared_stop_ids,
      description:
        `Direction ${segment.direction} exact shared Q36/Q82 stop set bounded by ${segment.boundary_stop_ids.join(" and ")}.`,
    })),
    predecessor: {
      route_id: "Q36",
      source_id: "gtfs_static_20250615_queens_pre_qbnr",
      receipt_sha256:
        "07fc854e9d4f2e980048741b335c95f781f03b8a8914c4eb0acd51bd92c540c6",
      zip_sha1: "c96466458c55036cd6feeadc291bf5951d6c3274",
      zip_sha256:
        "2ddcb01c8ceb6c822a28819570692af99491be0967412e130d7a26131820e6ef",
      active_trip_count: 138,
      active_direction_counts: { "0": 69, "1": 69 },
      shape_ids: ["Q360175", "Q360181"],
      schedule_row_count: 1277,
      schedule_passenger_shape_ids: ["Q360175", "Q360181"],
      schedule_slice_sha256:
        "253f380f21752fe85f6ad31593259c1760fef96a42552b1925391ac5551b24ee",
      source_evidence_id:
        "mta_queens_bus_network_redesign_service_changes#p001_b0041",
    },
    lineage: q36Lineage,
    rejected: [
      "500071_to_500072_unresolved_no_equivalence_authorized",
      "skipped_local_stops_unresolved_no_equivalence_authorized",
    ],
  }),
];

type ReviewPacket = {
  packet_id: string;
  occurrence_id: string;
  operational_onset: { resolver_ids: string[] };
  member_extents: Array<Record<string, JsonValue>>;
};
const packetPath = join(
  repoRoot,
  "data/quality/study-readiness/v1/research/reviewed-candidate-packets.jsonl",
);
const q89Packet = readJsonl<ReviewPacket>(packetPath).find((row) =>
  row.packet_id === "study-readiness-review:ea9e0f1db4ffbcd5d34356ed"
);
const q89MemberDecision = q89Packet?.member_extents.find((row) =>
  row.decision_id === "member-extent-review:53b053d72d04f18923d31522"
);
if (!q89Packet || !q89MemberDecision) {
  throw new Error("Package 10B exact Q89 prior review is missing");
}
const q89Key =
  "occurrence:2748598653b74d33fcdce3d1\0route_q89-proposed-new\0" +
  "treatment_q89-q85-green-acres-replacement-2025";
const q89Gaps = [
  "bounded_scope_identity_missing",
  "prior_reviewed_member_extent_unresolved_preserved",
  "post_schedule_gtfs_shape_identity_mismatch",
  "initial_shape_mismatch_may_be_correction_sensitive",
  "corrected_first_week_diff_blocked_not_run",
  "candidate_specific_service_detail_not_staged",
  "candidate_specific_schedule_or_timetable_not_staged",
  "candidate_scope_not_bound_to_exact_versioned_member_extent",
];
candidates.push({
  candidate_key: q89Key,
  occurrence_id: "occurrence:2748598653b74d33fcdce3d1",
  route_record_id: "route_q89-proposed-new",
  gtfs_route_id: "Q89",
  treatment_record_id: "treatment_q89-q85-green-acres-replacement-2025",
  treatment_family: "service_pattern",
  source_statement: {
    source_id: "mta_queens_bus_network_redesign_service_changes",
    evidence_id:
      "mta_queens_bus_network_redesign_service_changes#p001_b0086",
    block_id: "p001_b0086",
    block_sha256:
      "sha256:0ce6db6806027c9aad26d3da3cd566c85b3986127ed6984db62927bb55a25eec",
    source_quote:
      "The new Q89 will replace the existing Q85 Green Acres branch.",
    route_row_sha256:
      "34cfe023ca541c84f46b1033b5436fa62fc41bf45cce9c89036714411666cf7f",
  },
  prior_ledger_state:
    priorLedger("treatment_q89-q85-green-acres-replacement-2025"),
  accepted_evidence: {
    prior_review: {
      path:
        "data/quality/study-readiness/v1/research/reviewed-candidate-packets.jsonl",
      packet_id: q89Packet.packet_id,
      packet_row_sha256:
        "e40620337b00dbe1e40b1c4ec789cf69df5b1728e75d24fa51bfcb8f5758ae24",
      member_extent_decision_id:
        "member-extent-review:53b053d72d04f18923d31522",
      occurrence_review_decision_id: "q89-route-redesign-2025-06-29",
      exact_member_decision: q89MemberDecision,
    },
    initial_post_inventory: {
      source_id: "gtfs_static_20250626_queens_post_qbnr",
      receipt_sha256:
        "0a66e26e639674b88bd1d0251d6a15f4cab2205e794fa14a3d75367c43394eeb",
      zip_sha1: "c868290ddcd79c69712d809ece96d96dbad2c613",
      active_trip_count: 78,
      shape_ids: ["Q890011", "Q890016"],
      complete_active_trip_coverage: true,
    },
    schedule_slice: {
      source_id: "mta_bus_schedules_2025_candidate_windows",
      source_csv_sha256: PLAN040_PACKAGE_10B_POST_10A_PINS.schedule_csv,
      route_id: "Q89",
      row_count: 669,
      passenger_shape_ids: ["Q890020", "Q890021"],
      slice_sha256:
        "ec7383300d24376861265abfc0beaaca9f48b47d6139c0db2623bdb57afce5cd",
      shape_identity_matches_initial_post: false,
    },
    correction_bytes_used: false,
    corrected_first_week_diff_run: false,
  },
  exact_candidate_searches: [
    `candidate_key=${q89Key}`,
    "packet_id=study-readiness-review:ea9e0f1db4ffbcd5d34356ed packet_row_sha256=e40620337b00dbe1e40b1c4ec789cf69df5b1728e75d24fa51bfcb8f5758ae24",
    "member_extent_decision_id=member-extent-review:53b053d72d04f18923d31522 missing_role=bounded_scope_identity",
    "occurrence_review_decision_id=q89-route-redesign-2025-06-29",
    "source_id=mta_queens_bus_network_redesign_service_changes evidence_id=mta_queens_bus_network_redesign_service_changes#p001_b0086",
    "initial_post route=Q89 active_trips=78 shapes=Q890011,Q890016",
    "schedule route=Q89 rows=669 passenger_shapes=Q890020,Q890021 shape_match=false",
    "candidate_specific_service_detail staged_match_count=0 candidate_specific_schedule_or_timetable staged_match_count=0",
  ],
  unresolved_gap_codes: q89Gaps,
  evidence_verdict: "receipt_terminal_unresolved_preserved",
  proposed_extent_decision: null,
  proposed_grain_decision: null,
  persisted_extent_decision: null,
  persisted_grain_decision: null,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
});

const package8Treatments = [
  "treatment_q110-hempstead-replacement-2025",
  "treatment_q36-limited-discontinuation-2025",
  "treatment_q36-queens-village-reroute-2025",
  "treatment_q36-weekend-full-route-2025",
];
const preservedPackage8: Plan040Package10bPreservedPackage8 = {
  evidence_artifact: {
    path:
      "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-8-evidence-v1.json",
    sha256: PLAN040_PACKAGE_10B_POST_10A_PINS.package_8_evidence,
  },
  absence_receipt: {
    path:
      "data/quality/acquisition/receipts/member-extent/" +
      "plan-040-qbnr-service-pattern-package-8-reviewed-absence-v1.json",
    sha256: PLAN040_PACKAGE_10B_POST_10A_PINS.package_8_absence_receipt,
  },
  treatment_record_ids: package8Treatments,
  extent_rows: package8Treatments.map((id) => priorLedger(id).extent_row),
  grain_rows: package8Treatments.map((id) => priorLedger(id).grain_row),
  predecessor_context_changes_rows: false,
};

type Package10aEvidence = {
  exclusions: Array<{
    scope_id: string;
    candidate_keys: string[];
    candidate_key_sha256: string;
  }>;
  version_separation: Plan040Package8VersionSeparation;
};
const package10a = readJson<Package10aEvidence>(join(
  riskRoot,
  "plan-040-qbnr-service-pattern-package-10a-evidence-v1.json",
));
const currentKeys = new Set(candidates.map((candidate) =>
  candidate.candidate_key));
const risk12 = package10a.exclusions.find((row) => row.scope_id === "risk_12")!;
const remainingRisk8 = risk12.candidate_keys.filter((key) =>
  !currentKeys.has(key));
const q67 = package10a.exclusions.find((row) => row.scope_id === "q67")!;
const q48q75 = package10a.exclusions.find((row) =>
  row.scope_id === "q48_q75"
)!;
const limitedStopSiblings = [
  "occurrence:136f3d32a53a62f096f8f44e\0route_q82-queens\0treatment_q82-limited-stops-2025",
  "occurrence:2748598653b74d33fcdce3d1\0route_q89-proposed-new\0treatment_q89-limited-stops-2025",
];
const exclusions: Plan040Package10bExclusion[] = [
  {
    scope_id: "remaining_risk_8",
    candidate_count: remainingRisk8.length,
    candidate_keys: remainingRisk8,
    candidate_key_sha256: sortedHash(remainingRisk8),
    overlap_count: 0,
  },
  {
    scope_id: "q67",
    candidate_count: q67.candidate_keys.length,
    candidate_keys: q67.candidate_keys,
    candidate_key_sha256: q67.candidate_key_sha256,
    overlap_count: 0,
  },
  {
    scope_id: "q48_q75",
    candidate_count: q48q75.candidate_keys.length,
    candidate_keys: q48q75.candidate_keys,
    candidate_key_sha256: q48q75.candidate_key_sha256,
    overlap_count: 0,
  },
  {
    scope_id: "limited_stop_siblings",
    candidate_count: limitedStopSiblings.length,
    candidate_keys: limitedStopSiblings,
    candidate_key_sha256: sortedHash(limitedStopSiblings),
    overlap_count: 0,
  },
];
for (const exclusion of exclusions) {
  if (
    exclusion.candidate_key_sha256 !==
      PLAN040_PACKAGE_10B_EXCLUSION_HASHES[exclusion.scope_id]
  ) {
    throw new Error(`${exclusion.scope_id}: exclusion hash drifted`);
  }
}

function priorPackageKeys(): string[] {
  const keys = new Set<string>();
  for (const name of readdirSync(riskRoot)) {
    if (
      !name.endsWith(".json") ||
      name.includes("package-10b") ||
      (!name.includes("evidence") && !name.includes("decision-draft"))
    ) continue;
    const parsed = readJson<{
      candidates?: Array<{
        candidate_key?: string;
        occurrence_id?: string;
        route_record_id?: string;
        treatment_record_id?: string;
      }>;
      decisions?: Array<{
        occurrence_id: string;
        route_record_id: string;
        treatment_record_id: string;
      }>;
    }>(join(riskRoot, name));
    for (const row of parsed.candidates ?? parsed.decisions ?? []) {
      if (row.candidate_key) keys.add(row.candidate_key);
      else if (
        row.occurrence_id && row.route_record_id && row.treatment_record_id
      ) {
        keys.add(
          `${row.occurrence_id}\0${row.route_record_id}\0${row.treatment_record_id}`,
        );
      }
    }
  }
  return [...keys];
}

if (
  sortedHash(candidates.map((candidate) => candidate.candidate_key)) !==
    PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256
) {
  throw new Error("Package 10B exact candidate scope hash drifted");
}
const priorKeys = priorPackageKeys();
const overlap = candidates.filter((candidate) =>
  priorKeys.includes(candidate.candidate_key));
if (overlap.length !== 0) {
  throw new Error(`Package 10B overlaps ${overlap.length} prior candidates`);
}

const evidence = {
  schema_version: 1,
  manifest_id:
    "plan-040-qbnr-service-pattern-package-10b-evidence-freeze-v1",
  package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B,
  candidate_count: 4,
  route_count: 2,
  candidate_key_sha256: PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
  immutable_inputs: {
    post_10a_pins: PLAN040_PACKAGE_10B_POST_10A_PINS,
    source_artifacts: {
      service_change_html: {
        path:
          "raw/sources/mta_queens_bus_network_redesign_service_changes/source.html",
        sha256: PLAN040_PACKAGE_10B_POST_10A_PINS.service_change_html,
      },
      service_change_blocks: {
        path:
          "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
        sha256: PLAN040_PACKAGE_10B_POST_10A_PINS.service_change_blocks,
      },
      schedule_csv: {
        path: "raw/sources/mta_bus_schedules_2025_candidate_windows/source.csv",
        sha256: PLAN040_PACKAGE_10B_POST_10A_PINS.schedule_csv,
      },
      schedule_receipt: {
        path:
          "raw/sources/mta_bus_schedules_2025_candidate_windows/receipt.json",
        sha256: PLAN040_PACKAGE_10B_POST_10A_PINS.schedule_receipt,
      },
      schedule_blocks: {
        path:
          "raw/sources/mta_bus_schedules_2025_candidate_windows/blocks.jsonl",
        sha256: PLAN040_PACKAGE_10B_POST_10A_PINS.schedule_blocks,
      },
    },
  },
  comparison_receipt: comparisonReceiptRef,
  candidates,
  exclusions,
  prior_package_overlap_count: 0,
  preserved_package_8_predecessor_rows: preservedPackage8,
  version_separation: package10a.version_separation,
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 3,
    receipt_terminal_unresolved_preserved: 1,
  },
  proposed_extent_distribution: {
    route_wide: 1,
    bounded_segment: 2,
    unresolved: 1,
  },
  proposed_grain_distribution: {
    trip_subset: 3,
    unresolved: 1,
  },
  review_protocol: {
    review_mode:
      "dual_independent_mixed_positive_and_source_gap_risk_review",
    independent_review_required: true,
    dual_independent_review_required: true,
    owner_gate_created: false,
    owner_acceptance_created: false,
    persistence_performed: false,
  },
  authorization_state:
    "evidence_freeze_pending_dual_independent_review_no_gate_no_acceptance_no_persistence",
  proposed_extent_decision_count: 3,
  proposed_grain_decision_count: 3,
  persisted_extent_decision_count: 0,
  persisted_grain_decision_count: 0,
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};

writeStable(
  join(repoRoot, evidenceRelative),
  evidence as unknown as JsonValue,
);
const evidenceSha256 = sha256(readFileSync(join(repoRoot, evidenceRelative)));
const draft = buildPlan040Package10bDraft({
  evidenceManifestPath: evidenceRelative,
  evidenceManifestSha256: evidenceSha256,
  candidates,
  exclusions,
  comparisonReceipt: comparisonReceiptRef,
  preservedPackage8,
  priorCandidateKeys: priorKeys,
  versionSeparation: package10a.version_separation,
});
writeStable(
  join(repoRoot, draftRelative),
  draft as unknown as JsonValue,
);

process.stdout.write(`${stableJson({
  candidate_count: 4,
  comparison_receipt_path: comparisonReceiptRelative,
  comparison_receipt_sha256: comparisonReceiptRef.sha256,
  evidence_path: evidenceRelative,
  evidence_sha256: evidenceSha256,
  draft_path: draftRelative,
  draft_sha256: sha256(readFileSync(join(repoRoot, draftRelative))),
  verdict_distribution: evidence.evidence_verdict_distribution,
  authorization_state: draft.authorization_state,
} as unknown as JsonValue)}\n`);
