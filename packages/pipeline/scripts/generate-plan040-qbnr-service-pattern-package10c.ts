import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
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
  PLAN040_PACKAGE_10C_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_10C_COMPARISON_PINS,
  PLAN040_PACKAGE_10C_COMPARISON_RECEIPT_SHA256,
  PLAN040_PACKAGE_10C_EXCLUSION_HASHES,
  PLAN040_PACKAGE_10C_PATTERN_PINS,
  PLAN040_PACKAGE_10C_POST_10B_PINS,
  PLAN040_PACKAGE_10C_Q20_BOUND_PINS,
  PLAN040_PACKAGE_10C_SOURCE_PINS,
  PLAN040_PACKAGE_10C_UPSTREAM_PINS,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C,
  buildPlan040Package10cDraft,
  type Plan040Package10cCandidateEvidence,
  type Plan040Package10cComparisonReceiptRef,
  type Plan040Package10cExclusion,
} from "../src/quality/plan040-qbnr-service-pattern-package10c.js";
import type { Plan040Package8VersionSeparation } from
  "../src/quality/plan040-qbnr-service-pattern-package8.js";
import type {
  ExactEvidenceBinding,
  MemberExtentDecision,
} from "../src/quality/study-readiness-v1.js";
import {
  PLAN040_PACKAGE_10C_POST_PERSISTENCE_PINS,
} from
  "../src/quality/plan040-qbnr-service-pattern-package10c-closeout.js";

const riskRoot = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk",
);
const evidenceRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10c-evidence-v1.json";
const draftRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10c-evidence-draft-v1.json";
const comparisonReceiptRelative =
  "data/quality/acquisition/receipts/member-extent-evidence/" +
  "plan-040-qbnr-service-pattern-package-10c-full-stop-equivalence-v1.json";
const comparisonReceiptSourceId =
  "plan_040_qbnr_service_pattern_package_10c_full_stop_equivalence" as const;
const extentLedgerPath = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-ledger.jsonl",
);
const grainLedgerPath = join(
  repoRoot,
  "data/quality/operational-reference/member-grain-ledger.jsonl",
);
const checkOnly = process.argv.includes("--check");

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
const stableBytes = (value: JsonValue): string => `${stableJson(value)}\n`;
const writeStable = (path: string, value: JsonValue): void => {
  const bytes = stableBytes(value);
  if (checkOnly) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== bytes) {
      throw new Error(`Deterministic replay drifted: ${path}`);
    }
    return;
  }
  writeFileSync(path, bytes);
};
const writeImmutable = (path: string, value: JsonValue): void => {
  const bytes = stableBytes(value);
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== bytes) {
      throw new Error(`Refusing to overwrite frozen receipt ${path}`);
    }
    return;
  }
  if (checkOnly) throw new Error(`Missing frozen receipt ${path}`);
  writeFileSync(path, bytes);
};

const assertPinnedFile = (relativePath: string, expected: string): void => {
  const actual = sha256(readFileSync(join(repoRoot, relativePath)));
  if (actual !== expected) {
    throw new Error(`${relativePath}: expected ${expected}, got ${actual}`);
  }
};
const assertOneOfPinnedFile = (
  relativePath: string,
  expected: readonly string[],
): string => {
  const actual = sha256(readFileSync(join(repoRoot, relativePath)));
  if (!expected.includes(actual)) {
    throw new Error(
      `${relativePath}: expected one of ${expected.join(", ")}, got ${actual}`,
    );
  }
  return actual;
};

const currentExtentLedgerSha256 = assertOneOfPinnedFile(
  "data/quality/operational-reference/member-extent-ledger.jsonl",
  [
    PLAN040_PACKAGE_10C_POST_10B_PINS.extent_ledger,
    PLAN040_PACKAGE_10C_POST_PERSISTENCE_PINS.extent_ledger,
  ],
);
const currentGrainLedgerSha256 = assertOneOfPinnedFile(
  "data/quality/operational-reference/member-grain-ledger.jsonl",
  [
    PLAN040_PACKAGE_10C_POST_10B_PINS.grain_ledger,
    PLAN040_PACKAGE_10C_POST_PERSISTENCE_PINS.grain_ledger,
  ],
);
assertOneOfPinnedFile(
  "data/quality/study-readiness/v1/bridge-ledger.jsonl",
  [
    PLAN040_PACKAGE_10C_POST_10B_PINS.bridge,
    PLAN040_PACKAGE_10C_POST_PERSISTENCE_PINS.bridge_ledger,
  ],
);
assertOneOfPinnedFile(
  "data/quality/study-readiness/v1/manifest.json",
  [
    PLAN040_PACKAGE_10C_POST_10B_PINS.study_manifest,
    PLAN040_PACKAGE_10C_POST_PERSISTENCE_PINS.study_manifest,
  ],
);
assertPinnedFile(
  "raw/sources/mta_queens_bus_network_redesign_service_changes/source.html",
  PLAN040_PACKAGE_10C_SOURCE_PINS.service_change_html,
);
assertPinnedFile(
  "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
  PLAN040_PACKAGE_10C_SOURCE_PINS.service_change_blocks,
);
assertPinnedFile(
  "data/canonical/treatment_components.jsonl",
  PLAN040_PACKAGE_10C_SOURCE_PINS.treatment_components,
);
assertPinnedFile(
  "raw/sources/mta_bus_schedules_2025_candidate_windows/source.csv",
  PLAN040_PACKAGE_10C_SOURCE_PINS.existing_schedule_csv,
);
assertPinnedFile(
  "raw/sources/mta_bus_schedules_2025_candidate_windows/receipt.json",
  PLAN040_PACKAGE_10C_SOURCE_PINS.existing_schedule_receipt,
);
assertPinnedFile(
  "raw/sources/mta_bus_schedules_2025_candidate_windows/blocks.jsonl",
  PLAN040_PACKAGE_10C_SOURCE_PINS.existing_schedule_blocks,
);
const p10ScheduleRoot =
  "raw/sources/mta_bus_schedules_2025_plan040_p10_validation_2026_07_24";
assertPinnedFile(
  `${p10ScheduleRoot}/source.csv`,
  PLAN040_PACKAGE_10C_SOURCE_PINS.package_10_schedule_csv,
);
assertPinnedFile(
  `${p10ScheduleRoot}/receipt.json`,
  PLAN040_PACKAGE_10C_SOURCE_PINS.package_10_schedule_receipt,
);
assertPinnedFile(
  `${p10ScheduleRoot}/blocks.jsonl`,
  PLAN040_PACKAGE_10C_SOURCE_PINS.package_10_schedule_blocks,
);
assertPinnedFile(
  "raw/sources/gtfs_static_20250615_queens_pre_qbnr/receipt.json",
  PLAN040_PACKAGE_10C_SOURCE_PINS.queens_pre_receipt,
);
assertPinnedFile(
  "raw/sources/gtfs_static_20250626_queens_post_qbnr/receipt.json",
  PLAN040_PACKAGE_10C_SOURCE_PINS.queens_post_receipt,
);
assertPinnedFile(
  "data/exports/releases/v1-rc26/operational_occurrence_review_decisions.json",
  PLAN040_PACKAGE_10C_SOURCE_PINS.occurrence_decisions,
);
for (const pin of Object.values(PLAN040_PACKAGE_10C_UPSTREAM_PINS)) {
  assertPinnedFile(pin.path, pin.sha256);
}

const extentRows = readJsonl<MemberExtentLedgerRow>(extentLedgerPath);
const grainRows = readJsonl<MemberGrainLedgerRow>(grainLedgerPath);
const frozenPriorLedger = existsSync(join(repoRoot, evidenceRelative))
  ? new Map(readJson<{
    candidates: Plan040Package10cCandidateEvidence[];
  }>(join(repoRoot, evidenceRelative)).candidates.map((candidate) => [
    candidate.treatment_record_id,
    candidate.prior_ledger_state,
  ]))
  : null;
const priorLedger = (treatmentRecordId: string) => {
  const frozen = frozenPriorLedger?.get(
    treatmentRecordId as
      Plan040Package10cCandidateEvidence["treatment_record_id"],
  );
  if (frozen) return frozen;
  if (
    currentExtentLedgerSha256 !==
      PLAN040_PACKAGE_10C_POST_10B_PINS.extent_ledger ||
    currentGrainLedgerSha256 !==
      PLAN040_PACKAGE_10C_POST_10B_PINS.grain_ledger
  ) {
    throw new Error(
      `${treatmentRecordId}: frozen pre-persistence ledger state missing`,
    );
  }
  const extent = extentRows.find((row) =>
    row.treatment_record_id === treatmentRecordId
  );
  const grain = grainRows.find((row) =>
    row.treatment_record_id === treatmentRecordId
  );
  if (!extent || !grain) {
    throw new Error(`${treatmentRecordId}: exact ledger rows missing`);
  }
  return { extent_row: extent, grain_row: grain };
};

const registry = loadOperationalSnapshotRegistry();
const loadPatterns = (
  snapshotId: string,
  date: string,
  routeId: string,
): HistoricalFullStopPattern[] =>
  fullStopPatternsForDate(
    loadGtfsStaticSnapshot(
      snapshotById(registry, snapshotId),
      ["calendar", "calendar_dates", "routes", "stops", "stop_times", "trips"],
      repoRoot,
      new Set([routeId]),
    ),
    date,
    routeId,
  );
const preSnapshotId = "gtfs-static-20250615-queens-pre-qbnr";
const postSnapshotId = "gtfs-static-20250626-queens-post-qbnr";
const patternSets = {
  q20a: loadPatterns(preSnapshotId, "2025-06-27", "Q20A"),
  q20: loadPatterns(postSnapshotId, "2025-06-29", "Q20"),
  q48: loadPatterns(preSnapshotId, "2025-06-28", "Q48"),
  q90: loadPatterns(postSnapshotId, "2025-06-29", "Q90"),
  q98: loadPatterns(postSnapshotId, "2025-06-29", "Q98"),
};
const patternInventory = (pattern: HistoricalFullStopPattern) => ({
  pattern_id: pattern.pattern_id,
  snapshot_id: pattern.snapshot_id,
  service_date: pattern.service_date,
  route_id: pattern.route_id,
  direction_id: pattern.direction_id,
  trip_count: pattern.trip_count,
  trip_id_sha256: sortedHash(pattern.trip_ids),
  shape_ids: pattern.shape_ids,
  headsigns: pattern.headsigns,
  period_trip_counts: pattern.period_trip_counts,
  stop_count: pattern.stops.length,
  stop_ids: pattern.stops.map((stop) => stop.stop_id),
  stops: pattern.stops,
  stop_chain_sha256: sha256(
    `${pattern.stops.map((stop) => stop.stop_id).join("\n")}\n`,
  ),
});
const inventories = Object.fromEntries(
  Object.entries(patternSets).map(([key, patterns]) => [
    key,
    patterns.map(patternInventory),
  ]),
);
const pinByPatternId = new Map(Object.values(
  PLAN040_PACKAGE_10C_PATTERN_PINS,
).map((pin) => [pin.pattern_id, pin]));
const allPatternInventories = Object.values(inventories).flat();
if (
  allPatternInventories.length !== 11 ||
  pinByPatternId.size !== 11
) {
  throw new Error("Package 10C exact 11-pattern inventory drifted");
}
for (const inventory of allPatternInventories) {
  const pin = pinByPatternId.get(inventory.pattern_id);
  if (
    !pin ||
    inventory.trip_count !== pin.trip_count ||
    inventory.trip_id_sha256 !== pin.trip_id_sha256 ||
    inventory.stop_count !== pin.stop_count ||
    inventory.stop_chain_sha256 !== pin.stop_chain_sha256
  ) {
    throw new Error(`${inventory.pattern_id}: canonical pattern pin drifted`);
  }
}

const byId = (id: string): HistoricalFullStopPattern => {
  const pattern = Object.values(patternSets).flat().find((row) =>
    row.pattern_id === id
  );
  if (!pattern) throw new Error(`${id}: pattern missing`);
  return pattern;
};
const comparisonSpecs = [
  [
    PLAN040_PACKAGE_10C_PATTERN_PINS.q20a_direction_0.pattern_id,
    PLAN040_PACKAGE_10C_PATTERN_PINS.q20_direction_0.pattern_id,
  ],
  [
    PLAN040_PACKAGE_10C_PATTERN_PINS.q20a_direction_1.pattern_id,
    PLAN040_PACKAGE_10C_PATTERN_PINS.q20_direction_1.pattern_id,
  ],
  [
    PLAN040_PACKAGE_10C_PATTERN_PINS.q48_direction_0_long.pattern_id,
    PLAN040_PACKAGE_10C_PATTERN_PINS.q90_direction_0.pattern_id,
  ],
  [
    PLAN040_PACKAGE_10C_PATTERN_PINS.q48_direction_0_short.pattern_id,
    PLAN040_PACKAGE_10C_PATTERN_PINS.q90_direction_0.pattern_id,
  ],
  [
    PLAN040_PACKAGE_10C_PATTERN_PINS.q48_direction_1.pattern_id,
    PLAN040_PACKAGE_10C_PATTERN_PINS.q90_direction_1.pattern_id,
  ],
] as const;
const comparisonInventories = comparisonSpecs.map(([beforeId, afterId]) => {
  const before = byId(beforeId);
  const after = byId(afterId);
  const comparison = compareFullStopPatterns(before, after);
  const beforeIds = new Set(before.stops.map((stop) => stop.stop_id));
  const afterIds = new Set(after.stops.map((stop) => stop.stop_id));
  const identical = comparison.shared_stop_ids;
  return {
    comparison_id: comparison.comparison_id,
    predecessor_pattern_id: before.pattern_id,
    successor_pattern_id: after.pattern_id,
    predecessor_route_id: before.route_id,
    successor_route_id: after.route_id,
    direction_id: before.direction_id,
    full_chain_comparison: comparison,
    full_chain_comparison_sha256: sha256(
      `${stableJson(comparison as unknown as JsonValue)}\n`,
    ),
    identical_stop_id_equivalences: identical.map((stopId) => ({
      before_stop_id: stopId,
      after_stop_id: stopId,
      before_stop_name: before.stops.find((stop) =>
        stop.stop_id === stopId)!.stop_name,
      after_stop_name: after.stops.find((stop) =>
        stop.stop_id === stopId)!.stop_name,
      equivalence_basis: "identical_stop_id",
    })),
    before_only_stops: before.stops
      .filter((stop) => !afterIds.has(stop.stop_id))
      .map((stop) => ({
        ...stop,
        disposition: "unresolved_no_equivalence_authorized",
      })),
    after_only_stops: after.stops
      .filter((stop) => !beforeIds.has(stop.stop_id))
      .map((stop) => ({
        ...stop,
        disposition: "unresolved_no_equivalence_authorized",
      })),
    changed_id_equivalence_authorized: false,
  };
});
const comparisonPinById = new Map(Object.values(
  PLAN040_PACKAGE_10C_COMPARISON_PINS,
).map((pin) => [pin.comparison_id, pin]));
if (
  comparisonInventories.length !== 5 ||
  comparisonPinById.size !== 5
) {
  throw new Error("Package 10C exact five-comparison inventory drifted");
}
for (const comparison of comparisonInventories) {
  const pin = comparisonPinById.get(comparison.comparison_id);
  if (
    !pin ||
    comparison.full_chain_comparison_sha256 !==
      pin.full_chain_comparison_sha256
  ) {
    throw new Error(
      `${comparison.comparison_id}: canonical comparison pin drifted`,
    );
  }
}

const selectedSlice = (
  pattern: HistoricalFullStopPattern,
  first: string,
  last: string,
) => {
  const ids = pattern.stops.map((stop) => stop.stop_id);
  const start = ids.indexOf(first);
  const end = ids.indexOf(last);
  if (start < 0 || end < start) {
    throw new Error(`${pattern.pattern_id}: invalid slice ${first}..${last}`);
  }
  return pattern.stops.slice(start, end + 1);
};
const q20BoundSpecs = [
  {
    direction_id: "0",
    first: "504980",
    last: "504999",
    expected: PLAN040_PACKAGE_10C_Q20_BOUND_PINS.direction_0,
  },
  {
    direction_id: "1",
    first: "505032",
    last: "504559",
    expected: PLAN040_PACKAGE_10C_Q20_BOUND_PINS.direction_1,
  },
] as const;
const q20BoundSlices = q20BoundSpecs.map((spec) => {
  const beforePattern = patternSets.q20a.find((row) =>
    row.direction_id === spec.direction_id)!;
  const afterPattern = patternSets.q20.find((row) =>
    row.direction_id === spec.direction_id)!;
  const before = selectedSlice(beforePattern, spec.first, spec.last);
  const after = selectedSlice(afterPattern, spec.first, spec.last);
  const beforeIds = new Set(before.map((stop) => stop.stop_id));
  const afterIds = new Set(after.map((stop) => stop.stop_id));
  const payload = {
    direction_id: spec.direction_id,
    before,
    after,
  };
  const selectedSliceSha256 = sha256(
    `${stableJson(payload as unknown as JsonValue)}\n`,
  );
  if (selectedSliceSha256 !== spec.expected) {
    throw new Error(`Q20 direction ${spec.direction_id}: bound slice drifted`);
  }
  return {
    ...payload,
    predecessor_pattern_id: beforePattern.pattern_id,
    successor_pattern_id: afterPattern.pattern_id,
    boundary_stop_ids_route_order: [spec.first, spec.last],
    identical_stop_id_equivalences: [spec.first, spec.last].map((stopId) => ({
      before_stop_id: stopId,
      after_stop_id: stopId,
      equivalence_basis: "identical_stop_id",
    })),
    before_only_stops: before.filter((stop) => !afterIds.has(stop.stop_id))
      .map((stop) => ({
        ...stop,
        disposition: "unresolved_no_equivalence_authorized",
      })),
    after_only_stops: after.filter((stop) => !beforeIds.has(stop.stop_id))
      .map((stop) => ({
        ...stop,
        disposition: "unresolved_no_equivalence_authorized",
      })),
    changed_interior_identifiers_unresolved: true,
    changed_id_equivalence_authorized: false,
    selected_slice_sha256: selectedSliceSha256,
  };
});

const comparisonReceipt = {
  schema_version: 1,
  receipt_id:
    "plan-040-qbnr-service-pattern-package-10c-full-stop-equivalence-v1",
  source_id: comparisonReceiptSourceId,
  upstream_pins: PLAN040_PACKAGE_10C_UPSTREAM_PINS,
  accepted_snapshot_inputs: [
    {
      snapshot_id: preSnapshotId,
      source_id: "gtfs_static_20250615_queens_pre_qbnr",
      service_dates: ["2025-06-27", "2025-06-28"],
      receipt_path:
        "raw/sources/gtfs_static_20250615_queens_pre_qbnr/receipt.json",
      receipt_sha256: PLAN040_PACKAGE_10C_SOURCE_PINS.queens_pre_receipt,
      zip_path:
        "raw/sources/gtfs_static_20250615_queens_pre_qbnr/source.zip",
      zip_sha1: PLAN040_PACKAGE_10C_SOURCE_PINS.queens_pre_zip_sha1,
      zip_sha256: PLAN040_PACKAGE_10C_SOURCE_PINS.queens_pre_zip_sha256,
      calendar_expansion_policy: "calendar_plus_calendar_dates",
    },
    {
      snapshot_id: postSnapshotId,
      source_id: "gtfs_static_20250626_queens_post_qbnr",
      service_dates: ["2025-06-29"],
      receipt_path:
        "raw/sources/gtfs_static_20250626_queens_post_qbnr/receipt.json",
      receipt_sha256: PLAN040_PACKAGE_10C_SOURCE_PINS.queens_post_receipt,
      zip_path:
        "raw/sources/gtfs_static_20250626_queens_post_qbnr/source.zip",
      zip_sha1: PLAN040_PACKAGE_10C_SOURCE_PINS.queens_post_zip_sha1,
      zip_sha256: PLAN040_PACKAGE_10C_SOURCE_PINS.queens_post_zip_sha256,
      calendar_expansion_policy: "calendar_plus_calendar_dates",
    },
  ],
  coverage: {
    predecessor_route_count: 2,
    predecessor_pattern_count: 5,
    predecessor_active_trip_count: 250,
    predecessor_covered_trip_count: 250,
    predecessor_active_trip_coverage_percent: 100,
    successor_route_count: 3,
    successor_pattern_count: 6,
    successor_active_trip_count: 392,
    successor_covered_trip_count: 392,
    successor_active_trip_coverage_percent: 100,
  },
  predecessor_patterns: [...inventories.q20a, ...inventories.q48],
  successor_patterns: [
    ...inventories.q20,
    ...inventories.q90,
    ...inventories.q98,
  ],
  comparisons: comparisonInventories,
  q20_jamaica_candidate_bound_slices: q20BoundSlices,
  q98_non_lineage_context: {
    exact_statement:
      "The new Q98 will provide a more direct alternative to the Q58 , " +
      "connecting Flushing to Ridgewood via Horace Harding Expwy and Queens Blvd.",
    q58_lineage_status:
      "not_asserted_alternative_direct_connection_not_replacement",
    q58_schedule_context_is_nonexclusive: true,
    missing_brooklyn_historical_feed_nonblocking: true,
    predecessor_comparison_performed: false,
  },
  equivalence_policy: {
    accepted_equivalence:
      "identical_stop_id_or_separately_cited_first_party_crosswalk_only",
    applied_equivalence: "identical_stop_id_only",
    changed_identifier_equivalence_authorized: false,
    before_only_and_after_only_stops:
      "unresolved_no_equivalence_authorized",
    proximity_name_coordinate_or_adjacency_equivalence_authorized: false,
  },
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
writeImmutable(
  join(repoRoot, comparisonReceiptRelative),
  comparisonReceipt as unknown as JsonValue,
);
const comparisonReceiptRef: Plan040Package10cComparisonReceiptRef = {
  path: comparisonReceiptRelative,
  sha256: sha256(readFileSync(join(repoRoot, comparisonReceiptRelative))),
  receipt_id:
    "plan-040-qbnr-service-pattern-package-10c-full-stop-equivalence-v1",
  source_id: comparisonReceiptSourceId,
  upstream_pins: PLAN040_PACKAGE_10C_UPSTREAM_PINS,
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
if (
  comparisonReceiptRef.sha256 !==
    PLAN040_PACKAGE_10C_COMPARISON_RECEIPT_SHA256
) {
  throw new Error(
    "Package 10C comparison receipt bytes drifted " +
    `(actual=${comparisonReceiptRef.sha256})`,
  );
}

type SourceBlock = {
  source_id: string;
  block_id: string;
  raw_text: string;
  raw_text_sha256: string;
};
const sourceBlocks = readJsonl<SourceBlock>(join(
  repoRoot,
  "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
));
const sourceBlock = (
  blockId: "p001_b0023" | "p001_b0087" | "p001_b0088",
  expectedHash: string,
): SourceBlock => {
  const block = sourceBlocks.find((row) => row.block_id === blockId);
  if (!block || block.raw_text_sha256 !== expectedHash) {
    throw new Error(`${blockId}: source block drifted`);
  }
  return block;
};
const q20Block = sourceBlock(
  "p001_b0023",
  "sha256:0645ac27103cd691a5817a0808299e4993c7f7538210710f4c34244e748f4b1b",
);
const q90Block = sourceBlock(
  "p001_b0087",
  "sha256:c258de96ea5347965ae513f20fae6522e2474f9a9b89b8a44f90ebc3c3fa13bd",
);
const q98Block = sourceBlock(
  "p001_b0088",
  "sha256:202cfdd832adb6e050a1a7192b2de6124a3ba754f326b12a8dd86cdca62daced",
);

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
const comparisonForRoute = (route: "Q20" | "Q90") =>
  comparisonInventories.filter((comparison) =>
    comparison.successor_route_id === route);
const patternsForRoute = (route: "Q20" | "Q90" | "Q98") =>
  (inventories[route.toLowerCase() as "q20" | "q90" | "q98"]);
const reviewedAt = "1970-01-01T00:00:00Z";
const reviewedBy = "pending-plan-040-package-10c-dual-risk-review";

const scheduleEvidence = {
  Q20: {
    source_id: "mta_bus_schedules_2025_candidate_windows",
    source_csv_sha256: PLAN040_PACKAGE_10C_SOURCE_PINS.existing_schedule_csv,
    schedule_date: "2025-06-29T00:00:00.000",
    route_id: "Q20",
    row_count: 1322,
    trip_type_rows: { "1": 1162, "2": 80, "3": 80 },
    passenger_policy: "any_trip_type_except_2_3_4",
    passenger_shape_ids: ["Q200290", "Q200297"],
  },
  Q90: {
    source_id:
      "mta_bus_schedules_2025_plan040_p10_validation_2026_07_24",
    source_csv_sha256: PLAN040_PACKAGE_10C_SOURCE_PINS.package_10_schedule_csv,
    schedule_date: "2025-06-29T00:00:00.000",
    route_id: "Q90",
    row_count: 358,
    trip_type_rows: { "12": 338, "2": 10, "3": 10 },
    passenger_policy: "any_trip_type_except_2_3_4",
    passenger_shape_ids: ["Q901243", "Q901247", "Q901249"],
  },
  Q98: {
    source_id:
      "mta_bus_schedules_2025_plan040_p10_validation_2026_07_24",
    source_csv_sha256: PLAN040_PACKAGE_10C_SOURCE_PINS.package_10_schedule_csv,
    schedule_date: "2025-06-29T00:00:00.000",
    route_id: "Q98",
    row_count: 648,
    trip_type_rows: { "12": 512, "2": 68, "3": 68 },
    passenger_policy: "any_trip_type_except_2_3_4",
    passenger_shape_ids: ["Q980041", "Q980045"],
  },
} as const;

function positiveCandidate(input: {
  occurrenceId: string;
  routeRecordId: string;
  gtfsRouteId: "Q20" | "Q90" | "Q98";
  treatmentRecordId:
    | "treatment_q20-college-point-jamaica-connection-2025"
    | "treatment_q20-jamaica-avenue-approach-2025"
    | "treatment_q90-q48-laguardia-replacement-2025"
    | "treatment_q98-flushing-ridgewood-connection-2025";
  block: SourceBlock;
  sourceQuote: string;
  resolution: "route_wide" | "bounded_segment";
  components: MemberExtentDecision["components"];
  predecessorRouteId: "Q20A" | "Q48" | null;
  lineage: MemberGrainDecision["lineage_segments"];
  q20Bounds?: typeof q20BoundSlices;
}): Plan040Package10cCandidateEvidence {
  const key =
    `${input.occurrenceId}\0${input.routeRecordId}\0${input.treatmentRecordId}`;
  const successorPatterns = patternsForRoute(input.gtfsRouteId);
  const comparisons = input.gtfsRouteId === "Q20" ||
      input.gtfsRouteId === "Q90"
    ? comparisonForRoute(input.gtfsRouteId)
    : [];
  const predecessorPatterns = input.predecessorRouteId === "Q20A"
    ? inventories.q20a
    : input.predecessorRouteId === "Q48"
    ? inventories.q48
    : [];
  const evidenceId =
    `${input.block.source_id}#${input.block.block_id}`;
  const evidenceBindings = sortedBindings([
    binding(
      input.treatmentRecordId,
      "candidate_service_change_statement",
      input.block.source_id,
      evidenceId,
    ),
    binding(
      input.treatmentRecordId,
      "launch_schedule_trip_type_validation",
      scheduleEvidence[input.gtfsRouteId].source_id,
      `${scheduleEvidence[input.gtfsRouteId].source_id}#route=${input.gtfsRouteId}`,
    ),
    binding(
      input.treatmentRecordId,
      "full_stop_equivalence_receipt",
      comparisonReceiptSourceId,
      `${comparisonReceiptSourceId}#${comparisonReceipt.receipt_id}`,
    ),
    ...successorPatterns.map((pattern) =>
      binding(
        input.treatmentRecordId,
        "successor_ordered_full_stop_chain",
        comparisonReceiptSourceId,
        `${comparisonReceiptSourceId}#${pattern.pattern_id}`,
      )),
    ...predecessorPatterns.map((pattern) =>
      binding(
        input.treatmentRecordId,
        "predecessor_ordered_full_stop_chain",
        comparisonReceiptSourceId,
        `${comparisonReceiptSourceId}#${pattern.pattern_id}`,
      )),
    ...comparisons.map((comparison) =>
      binding(
        input.treatmentRecordId,
        "candidate_full_stop_comparison",
        comparisonReceiptSourceId,
        `${comparisonReceiptSourceId}#${comparison.comparison_id}`,
      )),
  ]);
  const slug = input.treatmentRecordId
    .replace("treatment_", "").replace("-2025", "");
  const extentId = `member-extent-review:plan040-package10c-${slug}`;
  const extent: MemberExtentDecision = {
    decision_id: extentId,
    occurrence_id: input.occurrenceId,
    route_record_id: input.routeRecordId,
    treatment_record_id: input.treatmentRecordId,
    resolution: input.resolution,
    components: input.components,
    evidence_bindings: evidenceBindings,
    missing_roles: [],
    rationale: input.resolution === "route_wide"
      ? "The exact first-party statement defines the whole named connection or replacement; the proposed extent is route-wide while service grain stays limited to exact launch-weekend patterns."
      : "The Jamaica approach proposal is limited to the two exact direction-specific shared boundary pairs; changed interior stop identifiers remain unresolved and are not equated.",
    reviewed_at: reviewedAt,
    reviewed_by: reviewedBy,
  };
  const grain: MemberGrainDecision = {
    schema_version: 1,
    contract_id: "member-grain-decision-v1",
    decision_id: `member-grain-review:plan040-package10c-${slug}`,
    occurrence_id: input.occurrenceId,
    route_record_id: input.routeRecordId,
    gtfs_route_id: input.gtfsRouteId,
    treatment_record_id: input.treatmentRecordId,
    member_extent_decision_id: extentId,
    service_scope: {
      kind: "trip_subset",
      periods: ["weekend"],
      directions: ["0", "1"],
      pattern_ids: successorPatterns.map((pattern) =>
        pattern.pattern_id).sort(),
      description:
        `Only the exact accepted initial-post ${input.gtfsRouteId} ` +
        "passenger patterns on the implementation-date weekend slice.",
    },
    lineage_segments: input.lineage,
    evidence_bindings: evidenceBindings,
    rationale: input.lineage.length > 0
      ? "Exact launch patterns are retained with predecessor lineage limited to identical shared stop identifiers; before-only and after-only identifiers remain unresolved."
      : "Exact launch patterns are retained as structured selectors; the source calls Q58 an alternative, so no cross-route correspondence is encoded.",
    reviewed_at: reviewedAt,
    reviewed_by: reviewedBy,
  };
  return {
    candidate_key: key,
    occurrence_id: input.occurrenceId,
    route_record_id: input.routeRecordId,
    gtfs_route_id: input.gtfsRouteId,
    treatment_record_id: input.treatmentRecordId,
    treatment_family: "service_pattern",
    source_statement: {
      source_id: "mta_queens_bus_network_redesign_service_changes",
      evidence_id: evidenceId,
      block_id: input.block.block_id,
      block_sha256: input.block.raw_text_sha256,
      source_quote: input.sourceQuote,
    },
    prior_ledger_state: priorLedger(input.treatmentRecordId),
    accepted_evidence: {
      comparison_receipt: comparisonReceiptRef,
      source_row_raw_text: input.block.raw_text,
      launch_schedule: scheduleEvidence[input.gtfsRouteId],
      successor_full_stop_patterns: clone(successorPatterns),
      predecessor_full_stop_patterns: clone(predecessorPatterns),
      full_stop_comparisons: clone(comparisons),
      q20_jamaica_bound_slices: clone(input.q20Bounds ?? []),
      q58_lineage: input.gtfsRouteId === "Q98"
        ? {
          status:
            "not_asserted_alternative_direct_connection_not_replacement",
          q58_schedule_context: {
            source_id: "mta_bus_schedules_2025_candidate_windows",
            route_id: "Q58",
            schedule_date: "2025-06-28T00:00:00.000",
            row_count: 2964,
            passenger_shape_ids: [
              "Q580561", "Q580562", "Q580568", "Q580592",
            ],
            nonexclusive_context_only: true,
          },
          missing_brooklyn_historical_feed_nonblocking: true,
        }
        : null,
      exact_identifier_policy: "identical_stop_ids_only",
      changed_identifier_equivalence_authorized: false,
    },
    exact_candidate_searches: [
      `candidate_key=${key}`,
      `source_id=${input.block.source_id} evidence_id=${evidenceId}`,
      `source_quote=${JSON.stringify(input.sourceQuote)}`,
      `accepted_post=${postSnapshotId} date=2025-06-29 route=${input.gtfsRouteId}`,
      `successor_patterns=${successorPatterns.map((row) =>
        row.pattern_id).sort().join(",")}`,
      `launch_schedule_source=${scheduleEvidence[input.gtfsRouteId].source_id} route=${input.gtfsRouteId} rows=${scheduleEvidence[input.gtfsRouteId].row_count}`,
      `extent_resolution=${input.resolution} grain=trip_subset directions=0,1 period=weekend`,
      `predecessor_route=${input.predecessorRouteId ?? "none"} comparison_ids=${comparisons.map((row) =>
        row.comparison_id).sort().join(",")}`,
      "equivalence_policy=identical_stop_ids_only before_after_only=unresolved",
    ],
    unresolved_gap_codes: [],
    evidence_verdict: "positive_extent_and_grain_proposed",
    proposed_extent_decision: extent,
    proposed_grain_decision: grain,
    persisted_extent_decision: null,
    persisted_grain_decision: null,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}

const q20Lineage: MemberGrainDecision["lineage_segments"] = [
  {
    predecessor_gtfs_route_id: "Q20A",
    successor_gtfs_route_id: "Q20",
    direction: "0",
    boundary_stop_ids: ["503964", "505021"],
    shared_stop_ids: comparisonInventories[0]!.full_chain_comparison
      .shared_stop_ids.slice().sort(),
  },
  {
    predecessor_gtfs_route_id: "Q20A",
    successor_gtfs_route_id: "Q20",
    direction: "1",
    boundary_stop_ids: ["504985", "505022"],
    shared_stop_ids: comparisonInventories[1]!.full_chain_comparison
      .shared_stop_ids.slice().sort(),
  },
].sort((left, right) =>
  stableJson(left as unknown as JsonValue).localeCompare(
    stableJson(right as unknown as JsonValue),
  ));
const q20JamaicaLineage: MemberGrainDecision["lineage_segments"] = [
  {
    predecessor_gtfs_route_id: "Q20A",
    successor_gtfs_route_id: "Q20",
    direction: "0",
    boundary_stop_ids: ["504980", "504999"],
    shared_stop_ids: ["504980", "504999"],
  },
  {
    predecessor_gtfs_route_id: "Q20A",
    successor_gtfs_route_id: "Q20",
    direction: "1",
    boundary_stop_ids: ["504559", "505032"],
    shared_stop_ids: ["504559", "505032"],
  },
].sort((left, right) =>
  stableJson(left as unknown as JsonValue).localeCompare(
    stableJson(right as unknown as JsonValue),
  ));
const q90Lineage: MemberGrainDecision["lineage_segments"] = [
  {
    predecessor_gtfs_route_id: "Q48",
    successor_gtfs_route_id: "Q90",
    direction: "0",
    boundary_stop_ids: ["502547", "503900"],
    shared_stop_ids: ["502547", "502549", "503900"],
  },
  {
    predecessor_gtfs_route_id: "Q48",
    successor_gtfs_route_id: "Q90",
    direction: "1",
    boundary_stop_ids: ["502578", "904242"],
    shared_stop_ids: ["502578", "502580", "503848", "504485", "904242"],
  },
].sort((left, right) =>
  stableJson(left as unknown as JsonValue).localeCompare(
    stableJson(right as unknown as JsonValue),
  ));

const candidates: Plan040Package10cCandidateEvidence[] = [
  positiveCandidate({
    occurrenceId: "occurrence:b18b9a4512c3b2860dd8aa29",
    routeRecordId: "route_q20-qbnr-2025",
    gtfsRouteId: "Q20",
    treatmentRecordId:
      "treatment_q20-college-point-jamaica-connection-2025",
    block: q20Block,
    sourceQuote:
      "The Q20 will connect College Point and Jamaica using the existing Q20A routing along 20 Av and Main St.",
    resolution: "route_wide",
    components: [{
      component_kind: "route",
      identity_namespace: "canonical_record",
      identifiers: ["route_q20-qbnr-2025"],
      description:
        "The exact first-party statement defines the complete Q20 College Point-to-Jamaica connection.",
    }],
    predecessorRouteId: "Q20A",
    lineage: q20Lineage,
  }),
  positiveCandidate({
    occurrenceId: "occurrence:b18b9a4512c3b2860dd8aa29",
    routeRecordId: "route_q20-qbnr-2025",
    gtfsRouteId: "Q20",
    treatmentRecordId: "treatment_q20-jamaica-avenue-approach-2025",
    block: q20Block,
    sourceQuote:
      "To the south, the Q20 will approach Downtown Jamaica via Jamaica Av instead of Sutphin Blvd.",
    resolution: "bounded_segment",
    components: [
      {
        component_kind: "segment",
        identity_namespace: "source_literal_v1",
        identifiers: ["504980", "504999"],
        description:
          "Direction 0 route-order bounds 504980 to 504999; changed interior stop identifiers remain unresolved.",
      },
      {
        component_kind: "segment",
        identity_namespace: "source_literal_v1",
        identifiers: ["504559", "505032"],
        description:
          "Direction 1 route-order bounds 505032 to 504559; identifiers are sorted in the contract and changed interiors remain unresolved.",
      },
    ],
    predecessorRouteId: "Q20A",
    lineage: q20JamaicaLineage,
    q20Bounds: q20BoundSlices,
  }),
  positiveCandidate({
    occurrenceId: "occurrence:d93f0e5c985dd9f201320c7b",
    routeRecordId: "route_q90-qbnr-2025",
    gtfsRouteId: "Q90",
    treatmentRecordId: "treatment_q90-q48-laguardia-replacement-2025",
    block: q90Block,
    sourceQuote:
      "The new Q90 will replace existing Q48 service between Flushing and LaGuardia Airport with a faster, more direct service through Willets Point.",
    resolution: "route_wide",
    components: [{
      component_kind: "route",
      identity_namespace: "canonical_record",
      identifiers: ["route_q90-qbnr-2025"],
      description:
        "The exact first-party statement defines the complete Q90 Flushing-to-LaGuardia replacement connection.",
    }],
    predecessorRouteId: "Q48",
    lineage: q90Lineage,
  }),
  positiveCandidate({
    occurrenceId: "occurrence:a8dd6f3a8e3204d0eeb69c4e",
    routeRecordId: "route_q98-qbnr-2025",
    gtfsRouteId: "Q98",
    treatmentRecordId:
      "treatment_q98-flushing-ridgewood-connection-2025",
    block: q98Block,
    sourceQuote:
      "The new Q98 will provide a more direct alternative to the Q58 , connecting Flushing to Ridgewood via Horace Harding Expwy and Queens Blvd.",
    resolution: "route_wide",
    components: [{
      component_kind: "route",
      identity_namespace: "canonical_record",
      identifiers: ["route_q98-qbnr-2025"],
      description:
        "The exact first-party statement defines the complete Q98 Flushing-to-Ridgewood connection.",
    }],
    predecessorRouteId: null,
    lineage: [],
  }),
];

type OccurrenceReviewArtifact = {
  decisions: Array<Record<string, JsonValue> & {
    decision_id: string;
    occurrence_id: string;
    review_state: string;
    treatment: {
      kind: string;
      members?: Array<{ treatment_record_id: string }>;
    };
  }>;
};
const occurrenceArtifact = readJson<OccurrenceReviewArtifact>(join(
  repoRoot,
  "data/exports/releases/v1-rc26/operational_occurrence_review_decisions.json",
));
const q20OccurrenceDecision = occurrenceArtifact.decisions.find((row) =>
  row.decision_id === "q20-route-redesign-2025-06-29"
);
if (!q20OccurrenceDecision) {
  throw new Error("Q20 preserved occurrence decision missing");
}
const q20DecisionRowSha256 = sha256(
  `${stableJson(q20OccurrenceDecision as unknown as JsonValue)}\n`,
);
const q20MemberIds = q20OccurrenceDecision.treatment.members
  ?.map((row) => row.treatment_record_id).sort() ?? [];
if (
  q20DecisionRowSha256 !==
    PLAN040_PACKAGE_10C_SOURCE_PINS.q20_occurrence_decision_row ||
  q20OccurrenceDecision.occurrence_id !==
    "occurrence:b18b9a4512c3b2860dd8aa29" ||
  q20OccurrenceDecision.review_state !== "approved" ||
  stableJson(q20MemberIds as JsonValue) !== stableJson([
    "treatment_q20-college-point-jamaica-connection-2025",
    "treatment_q20-jamaica-avenue-approach-2025",
    "treatment_q20-q20b-replacement-2025",
  ] as JsonValue)
) {
  throw new Error("Q20 preserved occurrence decision drifted");
}
const q20ConflictTreatmentId =
  "treatment_q20-q20b-replacement-2025" as const;
type CanonicalTreatment = Record<string, JsonValue> & {
  record_id: string;
  raw_text: string;
};
const q20ConflictTreatment = readJsonl<CanonicalTreatment>(join(
  repoRoot,
  "data/canonical/treatment_components.jsonl",
)).find((row) => row.record_id === q20ConflictTreatmentId);
if (!q20ConflictTreatment) {
  throw new Error("Q20 conflict canonical treatment row missing");
}
const q20ConflictTreatmentRowSha256 = sha256(
  `${stableJson(q20ConflictTreatment as unknown as JsonValue)}\n`,
);
if (
  q20ConflictTreatmentRowSha256 !==
    PLAN040_PACKAGE_10C_SOURCE_PINS.q20_conflict_treatment_row ||
  q20ConflictTreatment.raw_text !==
    "Existing Q20B service on 14 Av will be discontinued and replaced by the Q76 ."
) {
  throw new Error("Q20 conflict canonical treatment row drifted");
}
const q20ConflictKey =
  "occurrence:b18b9a4512c3b2860dd8aa29\0route_q20-qbnr-2025\0" +
  q20ConflictTreatmentId;
candidates.push({
  candidate_key: q20ConflictKey,
  occurrence_id: "occurrence:b18b9a4512c3b2860dd8aa29",
  route_record_id: "route_q20-qbnr-2025",
  gtfs_route_id: "Q20",
  treatment_record_id: q20ConflictTreatmentId,
  treatment_family: "service_pattern",
  source_statement: {
    source_id: "mta_queens_bus_network_redesign_service_changes",
    evidence_id:
      "mta_queens_bus_network_redesign_service_changes#p001_b0023",
    block_id: "p001_b0023",
    block_sha256: q20Block.raw_text_sha256,
    source_quote:
      "Existing Q20B service on 14 Av will be discontinued and replaced by the Q76 .",
  },
  prior_ledger_state: priorLedger(q20ConflictTreatmentId),
  accepted_evidence: {
    exact_source_row_raw_text: q20Block.raw_text,
    canonical_treatment_record_id: q20ConflictTreatmentId,
    canonical_treatment_record: q20ConflictTreatment,
    preserved_occurrence_decision: {
      path:
        "data/exports/releases/v1-rc26/operational_occurrence_review_decisions.json",
      artifact_sha256: PLAN040_PACKAGE_10C_SOURCE_PINS.occurrence_decisions,
      decision_id: q20OccurrenceDecision.decision_id,
      decision_row_sha256: q20DecisionRowSha256,
      occurrence_id: q20OccurrenceDecision.occurrence_id,
      review_state: q20OccurrenceDecision.review_state,
      exact_member_treatment_record_ids: q20MemberIds,
      exact_decision: q20OccurrenceDecision,
    },
    scope_conflict: {
      candidate_route_id: "Q20",
      candidate_treatment_literal_names_q20b: true,
      statement_named_replacement_route_id: "Q76",
      statement_names_q20_as_replacement_route: false,
      canonical_treatment_row_sha256: q20ConflictTreatmentRowSha256,
      ontology_correction_performed: false,
      occurrence_decision_changed: false,
    },
    terminal_policy:
      "preserve_prior_occurrence_and_leave_member_extent_and_grain_unresolved",
  },
  exact_candidate_searches: [
    `candidate_key=${q20ConflictKey}`,
    "canonical_treatment_record_id=treatment_q20-q20b-replacement-2025",
    "source_id=mta_queens_bus_network_redesign_service_changes evidence_id=mta_queens_bus_network_redesign_service_changes#p001_b0023",
    "exact_statement=Existing Q20B service on 14 Av will be discontinued and replaced by the Q76 .",
    "candidate_route_id=Q20 statement_named_replacement_route_id=Q76",
    `canonical_treatment_row_sha256=${q20ConflictTreatmentRowSha256}`,
    "occurrence_decision_id=q20-route-redesign-2025-06-29 review_state=approved",
    `occurrence_decision_row_sha256=${q20DecisionRowSha256}`,
    `occurrence_member_ids=${q20MemberIds.join(",")}`,
    "ontology_correction_performed=false occurrence_decision_changed=false",
  ],
  unresolved_gap_codes: [
    "canonical_treatment_route_scope_conflict",
    "exact_candidate_statement_names_q76_not_q20",
  ],
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

type Package10bEvidence = {
  exclusions: Array<{
    scope_id: string;
    candidate_keys: string[];
    candidate_key_sha256: string;
  }>;
};
type Package10aEvidence = {
  version_separation: Plan040Package8VersionSeparation;
};
const package10b = readJson<Package10bEvidence>(join(
  riskRoot,
  "plan-040-qbnr-service-pattern-package-10b-evidence-v1.json",
));
const package10a = readJson<Package10aEvidence>(join(
  riskRoot,
  "plan-040-qbnr-service-pattern-package-10a-evidence-v1.json",
));
const currentKeys = new Set(candidates.map((candidate) =>
  candidate.candidate_key));
const exclusionFrom10b = (
  scopeId: "remaining_risk_8" | "q67" | "q48_q75" | "limited_stop_siblings",
  outputScopeId:
    "remaining_q39_q58_q14" | "q67" | "q48_q75" | "limited_stop_siblings",
): Plan040Package10cExclusion => {
  const source = package10b.exclusions.find((row) =>
    row.scope_id === scopeId);
  if (!source) throw new Error(`${scopeId}: Package 10B exclusion missing`);
  const keys = source.candidate_keys.filter((key) => !currentKeys.has(key));
  return {
    scope_id: outputScopeId,
    candidate_count: keys.length,
    candidate_keys: keys,
    candidate_key_sha256: sortedHash(keys),
    overlap_count: 0,
  };
};
const exclusions: Plan040Package10cExclusion[] = [
  exclusionFrom10b("remaining_risk_8", "remaining_q39_q58_q14"),
  exclusionFrom10b("q67", "q67"),
  exclusionFrom10b("q48_q75", "q48_q75"),
  exclusionFrom10b("limited_stop_siblings", "limited_stop_siblings"),
];
for (const exclusion of exclusions) {
  if (
    exclusion.candidate_key_sha256 !==
      PLAN040_PACKAGE_10C_EXCLUSION_HASHES[exclusion.scope_id]
  ) {
    throw new Error(`${exclusion.scope_id}: exclusion hash drifted`);
  }
}

function priorPackageKeys(): string[] {
  const keys = new Set<string>();
  for (const name of readdirSync(riskRoot)) {
    if (
      !name.endsWith(".json") ||
      name.includes("package-10c") ||
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
    PLAN040_PACKAGE_10C_CANDIDATE_KEY_SHA256
) {
  throw new Error("Package 10C exact candidate scope hash drifted");
}
const priorKeys = priorPackageKeys();
if (candidates.some((candidate) =>
  priorKeys.includes(candidate.candidate_key))) {
  throw new Error("Package 10C overlaps a prior frozen candidate");
}

const evidence = {
  schema_version: 1,
  manifest_id:
    "plan-040-qbnr-service-pattern-package-10c-evidence-freeze-v1",
  package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C,
  candidate_count: 5,
  route_count: 3,
  candidate_key_sha256: PLAN040_PACKAGE_10C_CANDIDATE_KEY_SHA256,
  immutable_inputs: {
    post_10b_pins: PLAN040_PACKAGE_10C_POST_10B_PINS,
    source_artifacts: PLAN040_PACKAGE_10C_SOURCE_PINS,
    upstream_historical_full_stop: PLAN040_PACKAGE_10C_UPSTREAM_PINS,
  },
  comparison_receipt: comparisonReceiptRef,
  candidates,
  exclusions,
  prior_package_overlap_count: 0,
  version_separation: package10a.version_separation,
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 4,
    receipt_terminal_unresolved_preserved: 1,
  },
  proposed_extent_distribution: {
    route_wide: 3,
    bounded_segment: 1,
    unresolved: 1,
  },
  proposed_grain_distribution: {
    trip_subset: 4,
    unresolved: 1,
  },
  review_protocol: {
    review_mode:
      "dual_independent_mixed_positive_and_scope_conflict_risk_review",
    independent_review_required: true,
    dual_independent_review_required: true,
    owner_gate_created: false,
    owner_acceptance_created: false,
    persistence_performed: false,
  },
  authorization_state:
    "evidence_freeze_pending_dual_independent_review_no_gate_no_acceptance_no_persistence",
  proposed_extent_decision_count: 4,
  proposed_grain_decision_count: 4,
  persisted_extent_decision_count: 0,
  persisted_grain_decision_count: 0,
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
writeStable(join(repoRoot, evidenceRelative), evidence as unknown as JsonValue);
const evidenceSha256 = sha256(readFileSync(join(repoRoot, evidenceRelative)));
const draft = buildPlan040Package10cDraft({
  evidenceManifestPath: evidenceRelative,
  evidenceManifestSha256: evidenceSha256,
  candidates,
  exclusions,
  comparisonReceipt: comparisonReceiptRef,
  priorCandidateKeys: priorKeys,
  versionSeparation: package10a.version_separation,
});
writeStable(join(repoRoot, draftRelative), draft as unknown as JsonValue);

process.stdout.write(`${stableJson({
  candidate_count: 5,
  comparison_count: 5,
  full_stop_pattern_count: 11,
  comparison_receipt_path: comparisonReceiptRelative,
  comparison_receipt_sha256: comparisonReceiptRef.sha256,
  evidence_path: evidenceRelative,
  evidence_sha256: evidenceSha256,
  draft_path: draftRelative,
  draft_sha256: sha256(readFileSync(join(repoRoot, draftRelative))),
  verdict_distribution: evidence.evidence_verdict_distribution,
  authorization_state: draft.authorization_state,
  replay_mode: checkOnly ? "check" : "write",
} as unknown as JsonValue)}\n`);
