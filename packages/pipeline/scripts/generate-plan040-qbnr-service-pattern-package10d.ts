import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
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
  PLAN040_PACKAGE_10D_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_10D_COMPARISON_PINS,
  PLAN040_PACKAGE_10D_COMPARISON_RECEIPT_SHA256,
  PLAN040_PACKAGE_10D_EXCLUSION_HASHES,
  PLAN040_PACKAGE_10D_PATTERN_PINS,
  PLAN040_PACKAGE_10D_POST_10C_PINS,
  PLAN040_PACKAGE_10D_SOURCE_PINS,
  PLAN040_PACKAGE_10D_UPSTREAM_PINS,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D,
  buildPlan040Package10dDraft,
  type Plan040Package10dCandidateEvidence,
  type Plan040Package10dComparisonReceiptRef,
  type Plan040Package10dExclusion,
} from "../src/quality/plan040-qbnr-service-pattern-package10d.js";
import type { Plan040Package8VersionSeparation } from
  "../src/quality/plan040-qbnr-service-pattern-package8.js";
import type {
  ExactEvidenceBinding,
  MemberExtentDecision,
} from "../src/quality/study-readiness-v1.js";
import {
  PLAN040_PACKAGE_10D_POST_PERSISTENCE_PINS,
} from
  "../src/quality/plan040-qbnr-service-pattern-package10d-closeout.js";

const riskRoot = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk",
);
const evidenceRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10d-evidence-v1.json";
const draftRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10d-evidence-draft-v1.json";
const comparisonReceiptRelative =
  "data/quality/acquisition/receipts/member-extent-evidence/" +
  "plan-040-qbnr-service-pattern-package-10d-full-stop-equivalence-v1.json";
const comparisonReceiptSourceId =
  "plan_040_qbnr_service_pattern_package_10d_full_stop_equivalence" as const;
const checkOnly = process.argv.includes("--check");

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const stableBytes = (value: JsonValue): string => `${stableJson(value)}\n`;
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const readJsonl = <T>(path: string): T[] =>
  readFileSync(path, "utf8").trim().split("\n")
    .filter(Boolean).map((line) => JSON.parse(line) as T);
const clone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
const rowSha256 = (value: unknown): string =>
  sha256(`${stableJson(value as JsonValue)}\n`);
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
const writeImmutableNormalFile = (path: string, value: JsonValue): void => {
  const bytes = stableBytes(value);
  if (existsSync(path)) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Frozen receipt is not a normal file: ${path}`);
    }
    if (readFileSync(path, "utf8") !== bytes) {
      throw new Error(`Refusing to overwrite frozen receipt ${path}`);
    }
    return;
  }
  if (checkOnly) throw new Error(`Missing frozen receipt ${path}`);
  writeFileSync(path, bytes);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Created receipt is not a normal file: ${path}`);
  }
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
    PLAN040_PACKAGE_10D_POST_10C_PINS.extent_ledger,
    PLAN040_PACKAGE_10D_POST_PERSISTENCE_PINS.extent_ledger,
  ],
);
const currentGrainLedgerSha256 = assertOneOfPinnedFile(
  "data/quality/operational-reference/member-grain-ledger.jsonl",
  [
    PLAN040_PACKAGE_10D_POST_10C_PINS.grain_ledger,
    PLAN040_PACKAGE_10D_POST_PERSISTENCE_PINS.grain_ledger,
  ],
);
assertOneOfPinnedFile(
  "data/quality/study-readiness/v1/bridge-ledger.jsonl",
  [
    PLAN040_PACKAGE_10D_POST_10C_PINS.bridge,
    PLAN040_PACKAGE_10D_POST_PERSISTENCE_PINS.bridge_ledger,
  ],
);
assertOneOfPinnedFile(
  "data/quality/study-readiness/v1/manifest.json",
  [
    PLAN040_PACKAGE_10D_POST_10C_PINS.study_manifest,
    PLAN040_PACKAGE_10D_POST_PERSISTENCE_PINS.study_manifest,
  ],
);
assertOneOfPinnedFile(
  "data/contracts/operational-occurrence-member-extent/v1/" +
    "operational_occurrence_member_extents.jsonl",
  [
    PLAN040_PACKAGE_10D_POST_10C_PINS.member_extent_contract,
    PLAN040_PACKAGE_10D_POST_PERSISTENCE_PINS.member_extent_contract,
  ],
);
assertOneOfPinnedFile(
  "data/contracts/operational-occurrence-member-extent/v1/manifest.json",
  [
    PLAN040_PACKAGE_10D_POST_10C_PINS.operational_manifest,
    PLAN040_PACKAGE_10D_POST_PERSISTENCE_PINS.member_extent_manifest,
  ],
);
assertPinnedFile(
  "raw/sources/mta_queens_bus_network_redesign_service_changes/source.html",
  PLAN040_PACKAGE_10D_SOURCE_PINS.service_change_html,
);
assertPinnedFile(
  "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
  PLAN040_PACKAGE_10D_SOURCE_PINS.service_change_blocks,
);
assertPinnedFile(
  "data/canonical/routes.jsonl",
  PLAN040_PACKAGE_10D_SOURCE_PINS.routes,
);
assertPinnedFile(
  "data/canonical/events.jsonl",
  PLAN040_PACKAGE_10D_SOURCE_PINS.events,
);
assertPinnedFile(
  "data/canonical/treatment_components.jsonl",
  PLAN040_PACKAGE_10D_SOURCE_PINS.treatment_components,
);
assertPinnedFile(
  "data/exports/releases/v1-rc26/operational_occurrence_review_decisions.json",
  PLAN040_PACKAGE_10D_SOURCE_PINS.occurrence_decisions,
);
assertPinnedFile(
  "raw/sources/mta_bus_schedules_2025_candidate_windows/source.csv",
  PLAN040_PACKAGE_10D_SOURCE_PINS.schedule_csv,
);
assertPinnedFile(
  "raw/sources/mta_bus_schedules_2025_candidate_windows/receipt.json",
  PLAN040_PACKAGE_10D_SOURCE_PINS.schedule_receipt,
);
assertPinnedFile(
  "raw/sources/mta_bus_schedules_2025_candidate_windows/blocks.jsonl",
  PLAN040_PACKAGE_10D_SOURCE_PINS.schedule_blocks,
);
assertPinnedFile(
  "raw/sources/gtfs_static_20250615_queens_pre_qbnr/receipt.json",
  PLAN040_PACKAGE_10D_SOURCE_PINS.queens_pre_receipt,
);
assertPinnedFile(
  "raw/sources/gtfs_static_20250626_queens_post_qbnr/receipt.json",
  PLAN040_PACKAGE_10D_SOURCE_PINS.queens_post_receipt,
);
for (const pin of Object.values(PLAN040_PACKAGE_10D_UPSTREAM_PINS)) {
  assertPinnedFile(pin.path, pin.sha256);
}

const extentRows = readJsonl<MemberExtentLedgerRow>(join(
  repoRoot,
  "data/quality/operational-reference/member-extent-ledger.jsonl",
));
const grainRows = readJsonl<MemberGrainLedgerRow>(join(
  repoRoot,
  "data/quality/operational-reference/member-grain-ledger.jsonl",
));
const frozenPriorLedger = existsSync(join(repoRoot, evidenceRelative))
  ? new Map(readJson<{
    candidates: Plan040Package10dCandidateEvidence[];
  }>(join(repoRoot, evidenceRelative)).candidates.flatMap((candidate) => {
    const sibling = candidate.accepted_evidence
      .preserved_limited_stop_sibling as {
        treatment_record_id: string;
        extent_ledger_state: MemberExtentLedgerRow;
        grain_ledger_state: MemberGrainLedgerRow;
      };
    return [
      [candidate.treatment_record_id, candidate.prior_ledger_state],
      [
        sibling.treatment_record_id,
        {
          extent_row: sibling.extent_ledger_state,
          grain_row: sibling.grain_ledger_state,
        },
      ],
    ] as const;
  }))
  : null;
const priorLedger = (treatmentRecordId: string) => {
  const frozen = frozenPriorLedger?.get(
    treatmentRecordId as
      Plan040Package10dCandidateEvidence["treatment_record_id"],
  );
  if (frozen) return frozen;
  if (
    currentExtentLedgerSha256 !==
      PLAN040_PACKAGE_10D_POST_10C_PINS.extent_ledger ||
    currentGrainLedgerSha256 !==
      PLAN040_PACKAGE_10D_POST_10C_PINS.grain_ledger
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
const allQ46Pre = loadPatterns(preSnapshotId, "2025-06-27", "Q46");
const allQ30Pre = loadPatterns(preSnapshotId, "2025-06-27", "Q30");
const q48Sunday = loadPatterns(postSnapshotId, "2025-06-29", "Q48");
const q75Sunday = loadPatterns(postSnapshotId, "2025-06-29", "Q75");
const q48Monday = loadPatterns(postSnapshotId, "2025-06-30", "Q48");
const q75Monday = loadPatterns(postSnapshotId, "2025-06-30", "Q75");
if (
  q48Sunday.length !== 0 ||
  q75Sunday.length !== 0 ||
  q48Monday.reduce((sum, row) => sum + row.trip_count, 0) !== 129 ||
  q75Monday.reduce((sum, row) => sum + row.trip_count, 0) !== 159
) {
  throw new Error("Package 10D effective-date calendar expansion drifted");
}

const allPatterns = [
  ...allQ46Pre,
  ...allQ30Pre,
  ...q48Monday,
  ...q75Monday,
];
const byPatternId = (id: string): HistoricalFullStopPattern => {
  const pattern = allPatterns.find((row) => row.pattern_id === id);
  if (!pattern) throw new Error(`${id}: canonical pattern missing`);
  return pattern;
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
const selectedPatterns = Object.fromEntries(Object.entries(
  PLAN040_PACKAGE_10D_PATTERN_PINS,
).map(([name, pin]) => [name, byPatternId(pin.pattern_id)]));
const patternInventories = Object.fromEntries(Object.entries(selectedPatterns)
  .map(([name, pattern]) => [name, patternInventory(pattern)]));
if (Object.keys(patternInventories).length !== 12) {
  throw new Error("Package 10D exact 12-pattern inventory drifted");
}
for (const [name, inventory] of Object.entries(patternInventories)) {
  const pin = PLAN040_PACKAGE_10D_PATTERN_PINS[
    name as keyof typeof PLAN040_PACKAGE_10D_PATTERN_PINS
  ];
  if (
    inventory.pattern_id !== pin.pattern_id ||
    inventory.trip_count !== pin.trip_count ||
    inventory.trip_id_sha256 !== pin.trip_id_sha256 ||
    stableJson(inventory.shape_ids as JsonValue) !==
      stableJson(pin.shape_ids as unknown as JsonValue) ||
    inventory.stop_count !== pin.stop_count ||
    inventory.stop_chain_sha256 !== pin.stop_chain_sha256
  ) {
    throw new Error(`${name}: canonical pattern pin drifted`);
  }
}

const comparisonSpecs = [
  {
    name: "q46_local_direction_0",
    role: "primary_lineage",
    before:
      PLAN040_PACKAGE_10D_PATTERN_PINS.q46_glen_oaks_local_direction_0
        .pattern_id,
    after: PLAN040_PACKAGE_10D_PATTERN_PINS.q48_direction_0.pattern_id,
  },
  {
    name: "q46_local_direction_1",
    role: "primary_lineage",
    before:
      PLAN040_PACKAGE_10D_PATTERN_PINS.q46_glen_oaks_local_direction_1
        .pattern_id,
    after: PLAN040_PACKAGE_10D_PATTERN_PINS.q48_direction_1.pattern_id,
  },
  {
    name: "q46_limited_sensitivity_direction_0",
    role: "limited_variant_sensitivity_only",
    before:
      PLAN040_PACKAGE_10D_PATTERN_PINS.q46_glen_oaks_limited_direction_0
        .pattern_id,
    after: PLAN040_PACKAGE_10D_PATTERN_PINS.q48_direction_0.pattern_id,
  },
  {
    name: "q46_limited_sensitivity_direction_1",
    role: "limited_variant_sensitivity_only",
    before:
      PLAN040_PACKAGE_10D_PATTERN_PINS.q46_glen_oaks_limited_direction_1
        .pattern_id,
    after: PLAN040_PACKAGE_10D_PATTERN_PINS.q48_direction_1.pattern_id,
  },
  {
    name: "q30_qcc_direction_0",
    role: "primary_lineage",
    before: PLAN040_PACKAGE_10D_PATTERN_PINS.q30_qcc_direction_0.pattern_id,
    after: PLAN040_PACKAGE_10D_PATTERN_PINS.q75_direction_0.pattern_id,
  },
  {
    name: "q30_qcc_direction_1",
    role: "primary_lineage",
    before: PLAN040_PACKAGE_10D_PATTERN_PINS.q30_qcc_direction_1.pattern_id,
    after: PLAN040_PACKAGE_10D_PATTERN_PINS.q75_direction_1.pattern_id,
  },
] as const;
const comparisonInventories = comparisonSpecs.map((spec) => {
  const before = byPatternId(spec.before);
  const after = byPatternId(spec.after);
  const comparison = compareFullStopPatterns(before, after);
  const beforeIds = new Set(before.stops.map((stop) => stop.stop_id));
  const afterIds = new Set(after.stops.map((stop) => stop.stop_id));
  return {
    comparison_role: spec.role,
    comparison_id: comparison.comparison_id,
    predecessor_pattern_id: before.pattern_id,
    successor_pattern_id: after.pattern_id,
    predecessor_route_id: before.route_id,
    successor_route_id: after.route_id,
    direction_id: before.direction_id,
    full_chain_comparison: comparison,
    full_chain_comparison_sha256: rowSha256(comparison),
    identical_stop_id_equivalences: comparison.shared_stop_ids.map(
      (stopId) => ({
        before_stop_id: stopId,
        after_stop_id: stopId,
        before_stop_name: before.stops.find((stop) =>
          stop.stop_id === stopId)!.stop_name,
        after_stop_name: after.stops.find((stop) =>
          stop.stop_id === stopId)!.stop_name,
        equivalence_basis: "identical_stop_id",
      }),
    ),
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
for (const [index, row] of comparisonInventories.entries()) {
  const pin = PLAN040_PACKAGE_10D_COMPARISON_PINS[
    comparisonSpecs[index]!.name
  ];
  if (
    row.comparison_id !== pin.comparison_id ||
    row.full_chain_comparison_sha256 !== pin.full_chain_comparison_sha256
  ) {
    throw new Error(`${comparisonSpecs[index]!.name}: comparison drifted`);
  }
}

const inventory = (
  name: keyof typeof PLAN040_PACKAGE_10D_PATTERN_PINS,
) => patternInventories[name]!;
const comparisonReceipt = {
  schema_version: 1,
  receipt_id:
    "plan-040-qbnr-service-pattern-package-10d-full-stop-equivalence-v1",
  source_id: comparisonReceiptSourceId,
  upstream_pins: PLAN040_PACKAGE_10D_UPSTREAM_PINS,
  accepted_snapshot_inputs: [
    {
      snapshot_id: preSnapshotId,
      source_id: "gtfs_static_20250615_queens_pre_qbnr",
      service_dates: ["2025-06-27"],
      day_roles: ["Friday_pre_comparison"],
      receipt_path:
        "raw/sources/gtfs_static_20250615_queens_pre_qbnr/receipt.json",
      receipt_sha256: PLAN040_PACKAGE_10D_SOURCE_PINS.queens_pre_receipt,
      zip_path:
        "raw/sources/gtfs_static_20250615_queens_pre_qbnr/source.zip",
      zip_sha1: PLAN040_PACKAGE_10D_SOURCE_PINS.queens_pre_zip_sha1,
      zip_sha256: PLAN040_PACKAGE_10D_SOURCE_PINS.queens_pre_zip_sha256,
      calendar_expansion_policy: "calendar_plus_calendar_dates",
    },
    {
      snapshot_id: postSnapshotId,
      source_id: "gtfs_static_20250626_queens_post_qbnr",
      service_dates: ["2025-06-29", "2025-06-30"],
      day_roles: [
        "Sunday_published_post_pre_effective_zero_check",
        "Monday_statement_effective_date",
      ],
      receipt_path:
        "raw/sources/gtfs_static_20250626_queens_post_qbnr/receipt.json",
      receipt_sha256: PLAN040_PACKAGE_10D_SOURCE_PINS.queens_post_receipt,
      zip_path:
        "raw/sources/gtfs_static_20250626_queens_post_qbnr/source.zip",
      zip_sha1: PLAN040_PACKAGE_10D_SOURCE_PINS.queens_post_zip_sha1,
      zip_sha256: PLAN040_PACKAGE_10D_SOURCE_PINS.queens_post_zip_sha256,
      calendar_expansion_policy: "calendar_plus_calendar_dates",
    },
  ],
  activation_checks: [
    {
      route_id: "Q48",
      source_statement_effective_date: "2025-06-30",
      published_post_pre_effective_date: "2025-06-29",
      published_post_pre_effective_active_pattern_count: q48Sunday.length,
      published_post_pre_effective_active_trip_count: 0,
      effective_date: "2025-06-30",
      effective_day_type: "Monday",
      effective_active_pattern_count: q48Monday.length,
      effective_active_trip_count: 129,
      activation_basis: "calendar_plus_calendar_dates",
    },
    {
      route_id: "Q75",
      source_statement_effective_date: "2025-06-30",
      published_post_pre_effective_date: "2025-06-29",
      published_post_pre_effective_active_pattern_count: q75Sunday.length,
      published_post_pre_effective_active_trip_count: 0,
      effective_date: "2025-06-30",
      effective_day_type: "Monday",
      effective_active_pattern_count: q75Monday.length,
      effective_active_trip_count: 159,
      activation_basis: "calendar_plus_calendar_dates",
    },
  ],
  predecessor_pattern_selection: {
    q48_primary_q46_glen_oaks_local: [
      inventory("q46_glen_oaks_local_direction_0"),
      inventory("q46_glen_oaks_local_direction_1"),
    ],
    q48_q46_limited_variant_sensitivity_only: [
      inventory("q46_glen_oaks_limited_direction_0"),
      inventory("q46_glen_oaks_limited_direction_1"),
    ],
    q75_primary_q30_qcc_short_trips: [
      inventory("q30_qcc_direction_0"),
      inventory("q30_qcc_direction_1"),
    ],
    q75_q30_little_neck_excluded_non_lineage: [
      inventory("q30_little_neck_direction_0"),
      inventory("q30_little_neck_direction_1"),
    ],
  },
  successor_patterns: [
    inventory("q48_direction_0"),
    inventory("q48_direction_1"),
    inventory("q75_direction_0"),
    inventory("q75_direction_1"),
  ],
  comparisons: comparisonInventories,
  lineage_policy: {
    q48:
      "Q46_Glen_Oaks_local_primary_only_with_limited_variant_sensitivity_separate",
    q75:
      "Q30_Queensborough_Community_College_short_trip_patterns_only",
    q30_little_neck_included_in_q75_lineage: false,
    q46_limited_variant_comparisons_affect_primary_lineage: false,
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
  normal_file_required: true,
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
const comparisonReceiptPath = join(repoRoot, comparisonReceiptRelative);
writeImmutableNormalFile(
  comparisonReceiptPath,
  comparisonReceipt as unknown as JsonValue,
);
const receiptStat = lstatSync(comparisonReceiptPath);
const comparisonReceiptRef: Plan040Package10dComparisonReceiptRef = {
  path: comparisonReceiptRelative,
  sha256: sha256(readFileSync(comparisonReceiptPath)),
  receipt_id:
    "plan-040-qbnr-service-pattern-package-10d-full-stop-equivalence-v1",
  source_id: comparisonReceiptSourceId,
  upstream_pins: PLAN040_PACKAGE_10D_UPSTREAM_PINS,
  normal_file_verified: receiptStat.isFile() && !receiptStat.isSymbolicLink(),
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
if (
  comparisonReceiptRef.sha256 !==
    PLAN040_PACKAGE_10D_COMPARISON_RECEIPT_SHA256
) {
  throw new Error(
    "Package 10D comparison receipt bytes drifted " +
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
const sourceBlock = (blockId: string, expectedHash: string): SourceBlock => {
  const block = sourceBlocks.find((row) => row.block_id === blockId);
  if (!block || block.raw_text_sha256 !== expectedHash) {
    throw new Error(`${blockId}: source block drifted`);
  }
  return block;
};
const blocks = {
  q48: sourceBlock(
    "p001_b0053",
    PLAN040_PACKAGE_10D_SOURCE_PINS.q48_source_block,
  ),
  q46: sourceBlock(
    "p001_b0051",
    PLAN040_PACKAGE_10D_SOURCE_PINS.q46_companion_block,
  ),
  q75: sourceBlock(
    "p001_b0075",
    PLAN040_PACKAGE_10D_SOURCE_PINS.q75_source_block,
  ),
  q30: sourceBlock(
    "p001_b0035",
    PLAN040_PACKAGE_10D_SOURCE_PINS.q30_companion_block,
  ),
};

type CanonicalRow = Record<string, JsonValue> & {
  record_id: string;
  raw_text: string;
};
const routeRows = readJsonl<CanonicalRow>(join(
  repoRoot,
  "data/canonical/routes.jsonl",
));
const eventRows = readJsonl<CanonicalRow>(join(
  repoRoot,
  "data/canonical/events.jsonl",
));
const treatmentRows = readJsonl<CanonicalRow>(join(
  repoRoot,
  "data/canonical/treatment_components.jsonl",
));
const pinnedCanonicalRow = (
  rows: CanonicalRow[],
  recordId: string,
  expectedHash: string,
): CanonicalRow => {
  const row = rows.find((value) => value.record_id === recordId);
  if (!row || rowSha256(row) !== expectedHash) {
    throw new Error(`${recordId}: canonical row drifted`);
  }
  return row;
};
const canonical = {
  q48: {
    route: pinnedCanonicalRow(
      routeRows,
      "route_q48-glen-oaks-2025",
      PLAN040_PACKAGE_10D_SOURCE_PINS.q48_route_row,
    ),
    event: pinnedCanonicalRow(
      eventRows,
      "event_q48-new-service-start-2025-06-30",
      PLAN040_PACKAGE_10D_SOURCE_PINS.q48_event_row,
    ),
    treatment: pinnedCanonicalRow(
      treatmentRows,
      "treatment_q48-glen-oaks-branch-2025",
      PLAN040_PACKAGE_10D_SOURCE_PINS.q48_treatment_row,
    ),
    sibling: pinnedCanonicalRow(
      treatmentRows,
      "treatment_q48-limited-stops-2025",
      PLAN040_PACKAGE_10D_SOURCE_PINS.q48_sibling_treatment_row,
    ),
  },
  q75: {
    route: pinnedCanonicalRow(
      routeRows,
      "route_q75-qbnr-2025",
      PLAN040_PACKAGE_10D_SOURCE_PINS.q75_route_row,
    ),
    event: pinnedCanonicalRow(
      eventRows,
      "event_q75-qbnr-start-2025-06-30",
      PLAN040_PACKAGE_10D_SOURCE_PINS.q75_event_row,
    ),
    treatment: pinnedCanonicalRow(
      treatmentRows,
      "treatment_q75-q30-short-trip-replacement-2025",
      PLAN040_PACKAGE_10D_SOURCE_PINS.q75_treatment_row,
    ),
    sibling: pinnedCanonicalRow(
      treatmentRows,
      "treatment_q75-limited-stops-2025",
      PLAN040_PACKAGE_10D_SOURCE_PINS.q75_sibling_treatment_row,
    ),
  },
};

type OccurrenceDecision = Record<string, JsonValue> & {
  decision_id: string;
  occurrence_id: string;
  review_state: string;
  resolved_onset: { date: string };
  treatment: {
    kind: string;
    members?: Array<{ treatment_record_id: string }>;
  };
};
const occurrenceArtifact = readJson<{
  decisions: OccurrenceDecision[];
}>(join(
  repoRoot,
  "data/exports/releases/v1-rc26/operational_occurrence_review_decisions.json",
));
const pinnedOccurrence = (
  occurrenceId: string,
  decisionId: string,
  expectedHash: string,
  memberIds: string[],
): OccurrenceDecision => {
  const row = occurrenceArtifact.decisions.find((value) =>
    value.occurrence_id === occurrenceId
  );
  const actualMembers = row?.treatment.members
    ?.map((member) => member.treatment_record_id).sort() ?? [];
  if (
    !row ||
    row.decision_id !== decisionId ||
    row.review_state !== "approved" ||
    row.resolved_onset.date !== "2025-06-30" ||
    rowSha256(row) !== expectedHash ||
    stableJson(actualMembers as JsonValue) !==
      stableJson([...memberIds].sort() as JsonValue)
  ) {
    throw new Error(`${decisionId}: occurrence decision drifted`);
  }
  return row;
};
const occurrences = {
  q48: pinnedOccurrence(
    "occurrence:29fc4436c22b58d52f231964",
    "q48-route-redesign-2025-06-30",
    PLAN040_PACKAGE_10D_SOURCE_PINS.q48_occurrence_row,
    [
      "treatment_q48-glen-oaks-branch-2025",
      "treatment_q48-limited-stops-2025",
    ],
  ),
  q75: pinnedOccurrence(
    "occurrence:5ac0e55f39f63140204859b1",
    "q75-route-redesign-2025-06-30",
    PLAN040_PACKAGE_10D_SOURCE_PINS.q75_occurrence_row,
    [
      "treatment_q75-limited-stops-2025",
      "treatment_q75-q30-short-trip-replacement-2025",
    ],
  ),
};

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
      left.role,
      left.record_id,
      left.source_id,
      left.evidence_id,
    ].join("\0").localeCompare([
      right.role,
      right.record_id,
      right.source_id,
      right.evidence_id,
    ].join("\0")));
const comparisonByName = Object.fromEntries(comparisonSpecs.map(
  (spec, index) => [spec.name, comparisonInventories[index]!],
));
const reviewedAt = "1970-01-01T00:00:00Z";
const reviewedBy = "pending-plan-040-package-10d-dual-risk-review";
const scheduleSourceId = "mta_bus_schedules_2025_candidate_windows";
const scheduleEvidence = {
  Q48: {
    source_id: scheduleSourceId,
    source_csv_sha256: PLAN040_PACKAGE_10D_SOURCE_PINS.schedule_csv,
    schedule_date: "2025-06-30T00:00:00.000",
    route_id: "Q48",
    row_count: 889,
    trip_type_rows: { "1": 711, "2": 78, "3": 76, "4": 24 },
    passenger_policy: "exclude_trip_types_2_3_4_retain_1_12",
    retained_trip_types: ["1", "12"],
    excluded_trip_types: ["2", "3", "4"],
    passenger_shape_ids: ["Q480117", "Q480118"],
    gtfs_successor_shape_ids: ["Q480117", "Q480118"],
    shape_match: true,
  },
  Q75: {
    source_id: scheduleSourceId,
    source_csv_sha256: PLAN040_PACKAGE_10D_SOURCE_PINS.schedule_csv,
    schedule_date: "2025-06-30T00:00:00.000",
    route_id: "Q75",
    row_count: 1065,
    trip_type_rows: { "1": 875, "2": 90, "3": 90, "4": 10 },
    passenger_policy: "exclude_trip_types_2_3_4_retain_1_12",
    retained_trip_types: ["1", "12"],
    excluded_trip_types: ["2", "3", "4"],
    passenger_shape_ids: ["Q750036", "Q750039"],
    gtfs_successor_shape_ids: ["Q750036", "Q750039"],
    shape_match: true,
  },
} as const;
const predecessorScheduleContext = {
  Q46: {
    source_id: scheduleSourceId,
    schedule_date: "2025-06-27T00:00:00.000",
    route_id: "Q46",
    row_count: 3003,
    trip_type_rows: {
      "1": 1715,
      "12": 630,
      "2": 264,
      "3": 264,
      "4": 130,
    },
    passenger_policy: "exclude_trip_types_2_3_4_retain_1_12",
    primary_local_shapes: ["Q460023", "Q460385"],
    limited_sensitivity_shapes: ["Q460324", "Q460388"],
  },
  Q30: {
    source_id: scheduleSourceId,
    schedule_date: "2025-06-27T00:00:00.000",
    route_id: "Q30",
    row_count: 2576,
    trip_type_rows: { "1": 2216, "2": 164, "3": 170, "4": 26 },
    passenger_policy: "exclude_trip_types_2_3_4_retain_1_12",
    qcc_short_trip_shapes: ["Q300052", "Q300122"],
    little_neck_excluded_shapes: ["Q300053", "Q300121"],
  },
} as const;

function buildCandidate(input: {
  key: "q48" | "q75";
  occurrenceId:
    | "occurrence:29fc4436c22b58d52f231964"
    | "occurrence:5ac0e55f39f63140204859b1";
  routeRecordId:
    | "route_q48-glen-oaks-2025"
    | "route_q75-qbnr-2025";
  gtfsRouteId: "Q48" | "Q75";
  treatmentRecordId:
    | "treatment_q48-glen-oaks-branch-2025"
    | "treatment_q75-q30-short-trip-replacement-2025";
  sourceBlock: SourceBlock;
  companionBlock: SourceBlock;
  sourceQuote: string;
  companionQuote: string;
  successorNames:
    | ["q48_direction_0", "q48_direction_1"]
    | ["q75_direction_0", "q75_direction_1"];
  primaryComparisonNames:
    | ["q46_local_direction_0", "q46_local_direction_1"]
    | ["q30_qcc_direction_0", "q30_qcc_direction_1"];
  sensitivityComparisonNames:
    | [
      "q46_limited_sensitivity_direction_0",
      "q46_limited_sensitivity_direction_1",
    ]
    | [];
  predecessorPatternNames:
    | ["q46_glen_oaks_local_direction_0", "q46_glen_oaks_local_direction_1"]
    | ["q30_qcc_direction_0", "q30_qcc_direction_1"];
  sensitivityPatternNames:
    | [
      "q46_glen_oaks_limited_direction_0",
      "q46_glen_oaks_limited_direction_1",
    ]
    | [];
  siblingTreatmentId:
    | "treatment_q48-limited-stops-2025"
    | "treatment_q75-limited-stops-2025";
}): Plan040Package10dCandidateEvidence {
  const candidateKey =
    `${input.occurrenceId}\0${input.routeRecordId}\0${input.treatmentRecordId}`;
  const successor = input.successorNames.map((name) =>
    patternInventories[name]);
  const predecessor = input.predecessorPatternNames.map((name) =>
    patternInventories[name]);
  const primaryComparisons = input.primaryComparisonNames.map((name) =>
    comparisonByName[name]);
  const sensitivityComparisons = input.sensitivityComparisonNames.map(
    (name) => comparisonByName[name],
  );
  const evidenceId =
    `${input.sourceBlock.source_id}#${input.sourceBlock.block_id}`;
  const companionEvidenceId =
    `${input.companionBlock.source_id}#${input.companionBlock.block_id}`;
  const evidenceBindings = sortedBindings([
    binding(
      input.treatmentRecordId,
      "candidate_service_change_statement",
      input.sourceBlock.source_id,
      evidenceId,
    ),
    binding(
      input.treatmentRecordId,
      "predecessor_lineage_statement",
      input.companionBlock.source_id,
      companionEvidenceId,
    ),
    binding(
      input.treatmentRecordId,
      "launch_schedule_trip_type_validation",
      scheduleSourceId,
      `${scheduleSourceId}#date=2025-06-30&route=${input.gtfsRouteId}`,
    ),
    binding(
      input.treatmentRecordId,
      "full_stop_equivalence_receipt",
      comparisonReceiptSourceId,
      `${comparisonReceiptSourceId}#${comparisonReceipt.receipt_id}`,
    ),
    ...successor.map((pattern) =>
      binding(
        input.treatmentRecordId,
        "successor_ordered_full_stop_chain",
        comparisonReceiptSourceId,
        `${comparisonReceiptSourceId}#${pattern.pattern_id}`,
      )),
    ...predecessor.map((pattern) =>
      binding(
        input.treatmentRecordId,
        "predecessor_ordered_full_stop_chain",
        comparisonReceiptSourceId,
        `${comparisonReceiptSourceId}#${pattern.pattern_id}`,
      )),
    ...primaryComparisons.map((comparison) =>
      binding(
        input.treatmentRecordId,
        "candidate_full_stop_comparison",
        comparisonReceiptSourceId,
        `${comparisonReceiptSourceId}#${comparison.comparison_id}`,
      )),
  ]);
  const slug = input.treatmentRecordId
    .replace("treatment_", "").replace("-2025", "");
  const extentId = `member-extent-review:plan040-package10d-${slug}`;
  const extent: MemberExtentDecision = {
    decision_id: extentId,
    occurrence_id: input.occurrenceId,
    route_record_id: input.routeRecordId,
    treatment_record_id: input.treatmentRecordId,
    resolution: "route_wide",
    components: [{
      component_kind: "route",
      identity_namespace: "canonical_record",
      identifiers: [input.routeRecordId],
      description:
        `The exact first-party statement defines the complete ${input.gtfsRouteId} named replacement connection.`,
    }],
    evidence_bindings: evidenceBindings,
    missing_roles: [],
    rationale:
      "The exact first-party statement defines the whole named replacement; " +
      "the proposed extent is route-wide while service grain stays limited to " +
      "the exact Monday implementation-date passenger patterns.",
    reviewed_at: reviewedAt,
    reviewed_by: reviewedBy,
  };
  const lineage: MemberGrainDecision["lineage_segments"] =
    primaryComparisons.map((row) => ({
      predecessor_gtfs_route_id: input.gtfsRouteId === "Q48" ? "Q46" : "Q30",
      successor_gtfs_route_id: input.gtfsRouteId,
      direction: row.direction_id,
      boundary_stop_ids:
        row.full_chain_comparison.boundary_stop_ids.slice().sort(),
      shared_stop_ids:
        row.full_chain_comparison.shared_stop_ids.slice().sort(),
    })).sort((left, right) =>
      stableJson(left as unknown as JsonValue).localeCompare(
        stableJson(right as unknown as JsonValue),
      ));
  const grain: MemberGrainDecision = {
    schema_version: 1,
    contract_id: "member-grain-decision-v1",
    decision_id: `member-grain-review:plan040-package10d-${slug}`,
    occurrence_id: input.occurrenceId,
    route_record_id: input.routeRecordId,
    gtfs_route_id: input.gtfsRouteId,
    treatment_record_id: input.treatmentRecordId,
    member_extent_decision_id: extentId,
    service_scope: {
      kind: "trip_subset",
      periods: ["weekday"],
      directions: ["0", "1"],
      pattern_ids: successor.map((pattern) => pattern.pattern_id).sort(),
      description:
        `Only the exact accepted initial-post ${input.gtfsRouteId} passenger ` +
        "patterns active Monday 2025-06-30.",
    },
    lineage_segments: lineage,
    evidence_bindings: evidenceBindings,
    rationale:
      "Exact Monday launch patterns are retained with predecessor lineage " +
      "limited to the source-named predecessor subset and identical shared " +
      "stop identifiers; changed identifiers remain unresolved.",
    reviewed_at: reviewedAt,
    reviewed_by: reviewedBy,
  };
  const occurrence = occurrences[input.key];
  const canonicalRows = canonical[input.key];
  const exactMemberIds = occurrence.treatment.members
    ?.map((row) => row.treatment_record_id).sort() ?? [];
  const activeTripCount = input.gtfsRouteId === "Q48" ? 129 : 159;
  return {
    candidate_key: candidateKey,
    occurrence_id: input.occurrenceId,
    route_record_id: input.routeRecordId,
    gtfs_route_id: input.gtfsRouteId,
    treatment_record_id: input.treatmentRecordId,
    treatment_family: "service_pattern",
    source_statement: {
      source_id: "mta_queens_bus_network_redesign_service_changes",
      evidence_id: evidenceId,
      block_id: input.sourceBlock.block_id as "p001_b0053" | "p001_b0075",
      block_sha256: input.sourceBlock.raw_text_sha256,
      source_quote: input.sourceQuote,
    },
    prior_ledger_state: priorLedger(input.treatmentRecordId),
    accepted_evidence: {
      comparison_receipt: comparisonReceiptRef,
      exact_source_row_raw_text: input.sourceBlock.raw_text,
      exact_companion_row_raw_text: input.companionBlock.raw_text,
      companion_statement: {
        evidence_id: companionEvidenceId,
        block_sha256: input.companionBlock.raw_text_sha256,
        source_quote: input.companionQuote,
      },
      canonical_rows: {
        treatment: canonicalRows.treatment,
        treatment_row_sha256: rowSha256(canonicalRows.treatment),
        route: canonicalRows.route,
        route_row_sha256: rowSha256(canonicalRows.route),
        event: canonicalRows.event,
        event_row_sha256: rowSha256(canonicalRows.event),
      },
      preserved_occurrence_decision: {
        path:
          "data/exports/releases/v1-rc26/" +
          "operational_occurrence_review_decisions.json",
        artifact_sha256: PLAN040_PACKAGE_10D_SOURCE_PINS.occurrence_decisions,
        occurrence_id: occurrence.occurrence_id,
        decision_id: occurrence.decision_id,
        decision_row_sha256: rowSha256(occurrence),
        review_state: occurrence.review_state,
        resolved_onset: occurrence.resolved_onset,
        exact_member_treatment_record_ids: exactMemberIds,
        exact_decision: occurrence,
      },
      preserved_limited_stop_sibling: {
        treatment_record_id: input.siblingTreatmentId,
        canonical_treatment: canonicalRows.sibling,
        canonical_treatment_row_sha256: rowSha256(canonicalRows.sibling),
        extent_ledger_state: priorLedger(input.siblingTreatmentId).extent_row,
        grain_ledger_state: priorLedger(input.siblingTreatmentId).grain_row,
        occurrence_membership_preserved: true,
        extent_or_grain_change_performed: false,
        occurrence_membership_change_performed: false,
      },
      date_role: {
        statement_effective_date: "2025-06-30",
        pre_comparison_date: "2025-06-27",
        pre_day_type: "Friday",
        published_post_pre_effective_date: "2025-06-29",
        published_post_pre_effective_day_type: "Sunday",
        published_post_pre_effective_active_trip_count: 0,
        effective_date: "2025-06-30",
        effective_day_type: "Monday",
        effective_active_trip_count: activeTripCount,
        activation_basis: "calendar_plus_calendar_dates",
      },
      launch_schedule: scheduleEvidence[input.gtfsRouteId],
      predecessor_schedule_context:
        predecessorScheduleContext[input.gtfsRouteId === "Q48" ? "Q46" : "Q30"],
      successor_full_stop_patterns: clone(successor),
      primary_predecessor_full_stop_patterns: clone(predecessor),
      primary_full_stop_comparisons: clone(primaryComparisons),
      limited_variant_sensitivity: input.gtfsRouteId === "Q48"
        ? {
          predecessor_patterns: clone(input.sensitivityPatternNames.map(
            (name) => patternInventories[name],
          )),
          comparisons: clone(sensitivityComparisons),
          comparison_ids: sensitivityComparisons.map((row) =>
            row.comparison_id).sort(),
          affects_primary_lineage: false,
        }
        : null,
      q30_little_neck_exclusion: input.gtfsRouteId === "Q75"
        ? {
          reason:
            "The source limits Q75 replacement to Q30 Queensborough Community College short trips.",
          pattern_ids: [
            PLAN040_PACKAGE_10D_PATTERN_PINS.q30_little_neck_direction_0
              .pattern_id,
            PLAN040_PACKAGE_10D_PATTERN_PINS.q30_little_neck_direction_1
              .pattern_id,
          ].sort(),
          patterns: [
            inventory("q30_little_neck_direction_0"),
            inventory("q30_little_neck_direction_1"),
          ],
          included_in_lineage: false,
        }
        : null,
      exact_identifier_policy: "identical_stop_ids_only",
      changed_identifier_equivalence_authorized: false,
    } as unknown as Record<string, JsonValue>,
    exact_candidate_searches: [
      `candidate_key=${candidateKey}`,
      `source_id=${input.sourceBlock.source_id} evidence_id=${evidenceId}`,
      `source_quote=${JSON.stringify(input.sourceQuote)}`,
      `companion_evidence_id=${companionEvidenceId} companion_quote=${JSON.stringify(input.companionQuote)}`,
      `canonical_treatment_id=${input.treatmentRecordId} row_sha256=${rowSha256(canonicalRows.treatment)}`,
      `canonical_route_id=${input.routeRecordId} row_sha256=${rowSha256(canonicalRows.route)}`,
      `canonical_event_id=${canonicalRows.event.record_id} row_sha256=${rowSha256(canonicalRows.event)}`,
      `occurrence_id=${input.occurrenceId} decision_id=${occurrence.decision_id} row_sha256=${rowSha256(occurrence)}`,
      "date_role=statement_2025-06-30 pre_2025-06-27 published_post_zero_2025-06-29 effective_2025-06-30",
      `accepted_post=${postSnapshotId} date=2025-06-30 route=${input.gtfsRouteId} active_trips=${activeTripCount}`,
      `successor_patterns=${successor.map((row) => row.pattern_id).sort().join(",")}`,
      `launch_schedule_source=${scheduleSourceId} date=2025-06-30 route=${input.gtfsRouteId} policy=retain_1_12_exclude_2_3_4`,
      `extent_resolution=route_wide grain=trip_subset directions=0,1 period=weekday`,
      `primary_comparison_ids=${primaryComparisons.map((row) =>
        row.comparison_id).sort().join(",")}`,
      `sibling_treatment_id=${input.siblingTreatmentId} preserved=true`,
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

const candidates: Plan040Package10dCandidateEvidence[] = [
  buildCandidate({
    key: "q48",
    occurrenceId: "occurrence:29fc4436c22b58d52f231964",
    routeRecordId: "route_q48-glen-oaks-2025",
    gtfsRouteId: "Q48",
    treatmentRecordId: "treatment_q48-glen-oaks-branch-2025",
    sourceBlock: blocks.q48,
    companionBlock: blocks.q46,
    sourceQuote:
      "The new Q48 will serve the existing Glen Oaks branch of the Q46.",
    companionQuote:
      "The existing Glen Oaks branch will be discontinued and replaced by the new Q48 .",
    successorNames: ["q48_direction_0", "q48_direction_1"],
    primaryComparisonNames: [
      "q46_local_direction_0",
      "q46_local_direction_1",
    ],
    sensitivityComparisonNames: [
      "q46_limited_sensitivity_direction_0",
      "q46_limited_sensitivity_direction_1",
    ],
    predecessorPatternNames: [
      "q46_glen_oaks_local_direction_0",
      "q46_glen_oaks_local_direction_1",
    ],
    sensitivityPatternNames: [
      "q46_glen_oaks_limited_direction_0",
      "q46_glen_oaks_limited_direction_1",
    ],
    siblingTreatmentId: "treatment_q48-limited-stops-2025",
  }),
  buildCandidate({
    key: "q75",
    occurrenceId: "occurrence:5ac0e55f39f63140204859b1",
    routeRecordId: "route_q75-qbnr-2025",
    gtfsRouteId: "Q75",
    treatmentRecordId: "treatment_q75-q30-short-trip-replacement-2025",
    sourceBlock: blocks.q75,
    companionBlock: blocks.q30,
    sourceQuote:
      "The new Q75 will replace existing Q30 short trips between Queensborough Community College and Jamaica.",
    companionQuote:
      "Trips terminating at Queensborough Community College will be served by the new Q75 .",
    successorNames: ["q75_direction_0", "q75_direction_1"],
    primaryComparisonNames: [
      "q30_qcc_direction_0",
      "q30_qcc_direction_1",
    ],
    sensitivityComparisonNames: [],
    predecessorPatternNames: ["q30_qcc_direction_0", "q30_qcc_direction_1"],
    sensitivityPatternNames: [],
    siblingTreatmentId: "treatment_q75-limited-stops-2025",
  }),
];

type Package10cEvidence = {
  exclusions: Array<{
    scope_id: string;
    candidate_keys: string[];
  }>;
};
type Package10aEvidence = {
  version_separation: Plan040Package8VersionSeparation;
};
const package10c = readJson<Package10cEvidence>(join(
  riskRoot,
  "plan-040-qbnr-service-pattern-package-10c-evidence-v1.json",
));
const package10a = readJson<Package10aEvidence>(join(
  riskRoot,
  "plan-040-qbnr-service-pattern-package-10a-evidence-v1.json",
));
const exclusionFrom10c = (
  sourceScopeId: string,
  outputScopeId:
    | "remaining_q39_q58_q14"
    | "q67"
    | "prior_limited_stop_siblings",
): Plan040Package10dExclusion => {
  const source = package10c.exclusions.find((row) =>
    row.scope_id === sourceScopeId
  );
  if (!source) throw new Error(`${sourceScopeId}: Package 10C exclusion missing`);
  return {
    scope_id: outputScopeId,
    candidate_count: source.candidate_keys.length,
    candidate_keys: source.candidate_keys,
    candidate_key_sha256: sortedHash(source.candidate_keys),
    overlap_count: 0,
  };
};
const currentOccurrenceLimitedStopSiblings = [
  "occurrence:29fc4436c22b58d52f231964\0route_q48-glen-oaks-2025\0treatment_q48-limited-stops-2025",
  "occurrence:5ac0e55f39f63140204859b1\0route_q75-qbnr-2025\0treatment_q75-limited-stops-2025",
];
const exclusions: Plan040Package10dExclusion[] = [
  exclusionFrom10c("remaining_q39_q58_q14", "remaining_q39_q58_q14"),
  exclusionFrom10c("q67", "q67"),
  exclusionFrom10c(
    "limited_stop_siblings",
    "prior_limited_stop_siblings",
  ),
  {
    scope_id: "current_occurrence_limited_stop_siblings",
    candidate_count: 2,
    candidate_keys: currentOccurrenceLimitedStopSiblings,
    candidate_key_sha256: sortedHash(currentOccurrenceLimitedStopSiblings),
    overlap_count: 0,
  },
];
for (const exclusion of exclusions) {
  if (
    exclusion.candidate_key_sha256 !==
      PLAN040_PACKAGE_10D_EXCLUSION_HASHES[exclusion.scope_id]
  ) {
    throw new Error(`${exclusion.scope_id}: exclusion hash drifted`);
  }
}

function priorPackageKeys(): string[] {
  const keys = new Set<string>();
  for (const name of readdirSync(riskRoot)) {
    if (
      !name.endsWith(".json") ||
      name.includes("package-10d") ||
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
    PLAN040_PACKAGE_10D_CANDIDATE_KEY_SHA256
) {
  throw new Error("Package 10D exact candidate scope hash drifted");
}
const priorKeys = priorPackageKeys();
if (candidates.some((candidate) =>
  priorKeys.includes(candidate.candidate_key))) {
  throw new Error("Package 10D overlaps a prior frozen candidate");
}

const evidence = {
  schema_version: 1,
  manifest_id:
    "plan-040-qbnr-service-pattern-package-10d-evidence-freeze-v1",
  package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10D,
  candidate_count: 2,
  route_count: 2,
  candidate_key_sha256: PLAN040_PACKAGE_10D_CANDIDATE_KEY_SHA256,
  immutable_inputs: {
    post_10c_pins: PLAN040_PACKAGE_10D_POST_10C_PINS,
    source_artifacts: PLAN040_PACKAGE_10D_SOURCE_PINS,
    upstream_historical_full_stop: PLAN040_PACKAGE_10D_UPSTREAM_PINS,
  },
  comparison_receipt: comparisonReceiptRef,
  candidates,
  exclusions,
  prior_package_overlap_count: 0,
  version_separation: package10a.version_separation,
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 2,
  },
  proposed_extent_distribution: { route_wide: 2 },
  proposed_grain_distribution: { trip_subset: 2 },
  review_protocol: {
    review_mode:
      "dual_independent_lineage_variant_and_sibling_scope_risk_review",
    independent_review_required: true,
    dual_independent_review_required: true,
    owner_gate_created: false,
    owner_acceptance_created: false,
    persistence_performed: false,
  },
  authorization_state:
    "evidence_freeze_pending_dual_independent_review_no_gate_no_acceptance_no_persistence",
  proposed_extent_decision_count: 2,
  proposed_grain_decision_count: 2,
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
const draft = buildPlan040Package10dDraft({
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
  candidate_count: 2,
  comparison_count: 6,
  full_stop_pattern_count: 12,
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
