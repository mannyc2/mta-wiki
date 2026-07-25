import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
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
  PLAN040_PACKAGE_11_CANDIDATES,
  PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_11_GLOBAL_PINS,
  PLAN040_PACKAGE_11_GRAIN_ONLY_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_11_Q45_PATTERN_IDS,
  PLAN040_PACKAGE_11_Q82_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_11_Q82_PATTERN_IDS,
  PLAN040_PACKAGE_11_Q86_PATTERN_IDS,
  PLAN040_PACKAGE_11_QM68_COMPARISON_IDS,
  PLAN040_PACKAGE_11_POSITIVE_PATTERN_PINS,
  PLAN040_PACKAGE_11_POSITIVE_PATTERN_RECEIPT_SHA256,
  PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11,
  buildPlan040Package11Draft,
  type Plan040Package11CandidateEvidence,
  type Plan040Package11Exclusion,
  type Plan040Package11PositivePatternReceiptRef,
} from "../src/quality/plan040-qbnr-service-grain-package11.js";
import type {
  ExactEvidenceBinding,
  MemberExtentDecision,
} from "../src/quality/study-readiness-v1.js";
import {
  PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS,
} from
  "../src/quality/plan040-qbnr-service-grain-package11-closeout.js";
import { PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS } from
  "../src/quality/plan040-accelerated-package14-closeout.js";
import { PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS } from
  "../src/quality/plan040-accelerated-package15-closeout.js";

const riskRoot = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk",
);
const evidenceRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-grain-package-11-evidence-v1.json";
const draftRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-grain-package-11-evidence-draft-v1.json";
const positivePatternReceiptRelative =
  "data/quality/acquisition/receipts/member-extent-evidence/" +
  "plan-040-qbnr-service-grain-package-11-positive-patterns-v1.json";
const checkOnly = process.argv.includes("--check");

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const stableBytes = (value: JsonValue): string => `${stableJson(value)}\n`;
const rowSha256 = (value: unknown): string =>
  sha256(`${stableJson(value as JsonValue)}\n`);
const readJson = <T>(relative: string): T =>
  JSON.parse(readFileSync(join(repoRoot, relative), "utf8")) as T;
const readJsonlWithHashes = <T>(relative: string): Array<{
  row: T;
  sha256: string;
}> => readFileSync(join(repoRoot, relative), "utf8").trim().split("\n")
  .filter(Boolean).map((line) => ({
    row: JSON.parse(line) as T,
    sha256: sha256(`${line}\n`),
  }));
const writeStable = (relative: string, value: JsonValue): void => {
  const path = join(repoRoot, relative);
  const bytes = stableBytes(value);
  if (checkOnly) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== bytes) {
      throw new Error(`Deterministic replay drifted: ${relative}`);
    }
    return;
  }
  writeFileSync(path, bytes);
};
const writeImmutableNormalFile = (
  relative: string,
  value: JsonValue,
): void => {
  const path = join(repoRoot, relative);
  const bytes = stableBytes(value);
  if (existsSync(path)) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Frozen receipt is not a normal file: ${relative}`);
    }
    if (readFileSync(path, "utf8") !== bytes) {
      throw new Error(`Refusing to overwrite frozen receipt ${relative}`);
    }
    return;
  }
  if (checkOnly) throw new Error(`Missing frozen receipt ${relative}`);
  writeFileSync(path, bytes);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Created receipt is not a normal file: ${relative}`);
  }
};
const assertPinned = (relative: string, expected: string): void => {
  const actual = sha256(readFileSync(join(repoRoot, relative)));
  if (actual !== expected) {
    throw new Error(`${relative}: expected ${expected}, got ${actual}`);
  }
};
const assertLargePinned = (relative: string, expected: string): void => {
  const result = spawnSync("sha256sum", [join(repoRoot, relative)], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`sha256sum failed for ${relative}: ${result.stderr}`);
  }
  const actual = result.stdout.trim().split(/\s+/u)[0];
  if (actual !== expected) {
    throw new Error(`${relative}: expected ${expected}, got ${actual}`);
  }
};

const pinnedFiles: Array<[string, string]> = [
  [
    "data/quality/operational-reference/member-extent-ledger.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.extent_ledger,
  ],
  [
    "data/quality/operational-reference/member-grain-ledger.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.grain_ledger,
  ],
  [
    "data/quality/study-readiness/v1/bridge-ledger.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.bridge_ledger,
  ],
  [
    "data/quality/study-readiness/v1/manifest.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.study_manifest,
  ],
  [
    "data/contracts/operational-occurrence-member-extent/v1/" +
      "operational_occurrence_member_extents.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.member_extent_contract,
  ],
  [
    "data/contracts/operational-occurrence-member-extent/v1/manifest.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.member_extent_manifest,
  ],
  [
    "data/exports/releases/v1-rc26/" +
      "operational_occurrence_review_decisions.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.occurrence_decisions,
  ],
  [
    "data/canonical/treatment_components.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.treatment_components,
  ],
  ["data/canonical/routes.jsonl", PLAN040_PACKAGE_11_GLOBAL_PINS.routes],
  ["data/canonical/events.jsonl", PLAN040_PACKAGE_11_GLOBAL_PINS.events],
  [
    "raw/sources/mta_queens_bus_network_redesign_service_changes/source.html",
    PLAN040_PACKAGE_11_GLOBAL_PINS.service_change_html,
  ],
  [
    "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.service_change_blocks,
  ],
  [
    "raw/sources/mta_bus_schedules_2025_candidate_windows/receipt.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.schedule_receipt,
  ],
  [
    "raw/sources/mta_bus_schedules_2025_candidate_windows/blocks.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.schedule_blocks,
  ],
  [
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-10b-evidence-v1.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.package_10b_evidence,
  ],
  [
    "data/quality/acquisition/receipts/member-extent-evidence/" +
      "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.package_10b_full_stop_receipt,
  ],
  [
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-9-evidence-v1.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.package_9_evidence,
  ],
  [
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-10d-evidence-v1.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.package_10d_evidence,
  ],
  [
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-10d-dual-review-gate-v1.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.package_10d_gate,
  ],
  [
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-10d-owner-acceptance-v1.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.package_10d_acceptance,
  ],
  [
    "data/quality/operational-reference/member-extent-ledger-decisions/" +
      "plan-040-qbnr-service-pattern-package-10d-v1.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.package_10d_extent_decisions,
  ],
  [
    "data/quality/operational-reference/member-grain-decisions/" +
      "plan-040-qbnr-service-pattern-package-10d-v1.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.package_10d_grain_decisions,
  ],
  [
    "raw/sources/gtfs_static_20250615_queens_pre_qbnr/receipt.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.queens_pre_receipt,
  ],
  [
    "raw/sources/gtfs_static_20250626_queens_post_qbnr/receipt.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.queens_post_receipt,
  ],
];
const mutablePostPins: Record<string, string> = {
  "data/quality/operational-reference/member-extent-ledger.jsonl":
    PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS.extent_ledger,
  "data/quality/operational-reference/member-grain-ledger.jsonl":
    PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS.grain_ledger,
  "data/quality/study-readiness/v1/bridge-ledger.jsonl":
    PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS.bridge_ledger,
  "data/quality/study-readiness/v1/manifest.json":
    PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS.study_manifest,
  [
    "data/contracts/operational-occurrence-member-extent/v1/" +
      "operational_occurrence_member_extents.jsonl"
  ]: PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS.member_extent_contract,
  "data/contracts/operational-occurrence-member-extent/v1/manifest.json":
    PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS.member_extent_manifest,
};
const package14Pins: Record<string, string> = {
  "data/quality/operational-reference/member-extent-ledger.jsonl":
    PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.extent_ledger,
  "data/quality/operational-reference/member-grain-ledger.jsonl":
    PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.grain_ledger,
  "data/quality/study-readiness/v1/bridge-ledger.jsonl":
    PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.bridge_ledger,
  "data/quality/study-readiness/v1/manifest.json":
    PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.study_manifest,
  [
    "data/contracts/operational-occurrence-member-extent/v1/" +
      "operational_occurrence_member_extents.jsonl"
  ]: PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.member_extent_contract,
  "data/contracts/operational-occurrence-member-extent/v1/manifest.json":
    PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.member_extent_manifest,
};
const package15Pins: Record<string, string> = {
  "data/quality/operational-reference/member-extent-ledger.jsonl":
    PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS.extent_ledger,
  "data/quality/operational-reference/member-grain-ledger.jsonl":
    PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS.grain_ledger,
  "data/quality/study-readiness/v1/bridge-ledger.jsonl":
    PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS.bridge_ledger,
  "data/quality/study-readiness/v1/manifest.json":
    PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS.study_manifest,
  [
    "data/contracts/operational-occurrence-member-extent/v1/" +
      "operational_occurrence_member_extents.jsonl"
  ]: PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS.member_extent_contract,
  "data/contracts/operational-occurrence-member-extent/v1/manifest.json":
    PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS.member_extent_manifest,
};
const initialProjectionPins = Object.fromEntries(
  pinnedFiles.filter(([path]) => mutablePostPins[path]),
) as Record<string, string>;
const acceptedProjectionStates = [
  ["package_11_input", initialProjectionPins],
  ["package_11_post_persistence", mutablePostPins],
  ["package_14_post_persistence", package14Pins],
  ["package_15_post_persistence", package15Pins],
] as const;
const currentProjectionState = acceptedProjectionStates.find(([, pins]) =>
  Object.entries(pins).every(([path, expected]) =>
    sha256(readFileSync(join(repoRoot, path))) === expected
  )
);
if (!currentProjectionState) {
  throw new Error(
    "Package 11 mutable projections do not match one exact accepted " +
      "input or successor state",
  );
}
pinnedFiles.forEach(([path, hash]) => {
  if (!mutablePostPins[path]) assertPinned(path, hash);
});
assertLargePinned(
  "raw/sources/mta_bus_schedules_2025_candidate_windows/source.csv",
  PLAN040_PACKAGE_11_GLOBAL_PINS.schedule_csv,
);

type CanonicalRow = Record<string, unknown> & {
  record_id: string;
  payload?: { treatment_family?: string };
};
type SourceBlock = {
  source_id: string;
  block_id: string;
  raw_text: string;
  raw_text_sha256: string;
};
type OccurrenceDecision = Record<string, unknown> & {
  occurrence_id: string;
  resolved_onset?: {
    date?: string;
    evidence_bindings?: Array<{ role: string; record_id: string }>;
  };
};
type Package9Comparison = {
  comparison_id: string;
  before_route_id: string;
  after_route_id: string;
  direction_id: string;
  boundary_stop_ids: [string, string];
  shared_stop_ids: string[];
};

const extentRows = readJsonlWithHashes<MemberExtentLedgerRow>(
  "data/quality/operational-reference/member-extent-ledger.jsonl",
);
const grainRows = readJsonlWithHashes<MemberGrainLedgerRow>(
  "data/quality/operational-reference/member-grain-ledger.jsonl",
);
const treatmentRows = readJsonlWithHashes<CanonicalRow>(
  "data/canonical/treatment_components.jsonl",
);
const routeRows = readJsonlWithHashes<CanonicalRow>("data/canonical/routes.jsonl");
const eventRows = readJsonlWithHashes<CanonicalRow>("data/canonical/events.jsonl");
const sourceBlocks = readJsonlWithHashes<SourceBlock>(
  "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
);
const occurrenceRoot = readJson<JsonValue>(
  "data/exports/releases/v1-rc26/operational_occurrence_review_decisions.json",
);
const package10b = readJson<{
  candidates: Array<{ candidate_key: string; treatment_record_id: string }>;
}>(
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-10b-evidence-v1.json",
);
const package9 = readJson<{
  candidates: Array<{
    treatment_record_id: string;
    ordered_full_stop_evidence?: {
      comparisons: Package9Comparison[];
    };
  }>;
}>(
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-9-evidence-v1.json",
);

function occurrenceDecisions(value: JsonValue): OccurrenceDecision[] {
  if (Array.isArray(value)) return value.flatMap(occurrenceDecisions);
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, JsonValue>;
  return [
    ...(
      typeof object.occurrence_id === "string" &&
      typeof object.review_state === "string"
        ? [object as unknown as OccurrenceDecision]
        : []
    ),
    ...Object.values(object).flatMap(occurrenceDecisions),
  ];
}
const occurrenceRows = occurrenceDecisions(occurrenceRoot);
const one = <T>(
  rows: Array<{ row: T; sha256: string }>,
  predicate: (row: T) => boolean,
  label: string,
) => {
  const matches = rows.filter(({ row }) => predicate(row));
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly one row, got ${matches.length}`);
  }
  return matches[0]!;
};
const occurrenceOne = (occurrenceId: string) => {
  const matches = occurrenceRows.filter(
    (row) => row.occurrence_id === occurrenceId,
  );
  if (matches.length !== 1) {
    throw new Error(`${occurrenceId}: expected one occurrence decision`);
  }
  const row = matches[0]!;
  return { row, sha256: rowSha256(row) };
};
const sortedBindings = (
  values: ExactEvidenceBinding[],
): ExactEvidenceBinding[] => values.sort((left, right) => [
  left.role, left.record_id, left.source_id, left.evidence_id,
].join("\0").localeCompare([
  right.role, right.record_id, right.source_id, right.evidence_id,
].join("\0")));
const sortedStrings = (values: readonly string[]): string[] =>
  [...values].sort();
const candidateKey = (row: {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
}): string => [
  row.occurrence_id,
  row.route_record_id,
  row.treatment_record_id,
].join("\0");

const metadata = {
  "treatment_q82-limited-stops-2025": {
    block: "p001_b0079",
    verdict: "positive_extent_and_grain_proposed",
  },
  "treatment_q45-all-day-frequent-service-2025": {
    block: "p001_b0050",
    verdict: "positive_grain_only_proposed",
  },
  "treatment_q45-direct-connection-2025": {
    block: "p001_b0050",
    verdict: "positive_grain_only_proposed",
  },
  "treatment_q63-limited-stops-2025": {
    block: "p001_b0066",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_q63-northern-boulevard-connection-2025": {
    block: "p001_b0066",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_q80-frequency-overnight-service-2025": {
    block: "p001_b0078",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_q80-q10-limited-branch-replacement-2025": {
    block: "p001_b0078",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_q86-limited-stops-2025": {
    block: "p001_b0083",
    verdict: "positive_grain_only_proposed",
  },
  "treatment_q86-q5-q85-branch-combination-2025": {
    block: "p001_b0083",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_q87-limited-stops-2025": {
    block: "p001_b0084",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_q87-q5-green-acres-replacement-2025": {
    block: "p001_b0084",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_qm68-route-rename-2025": {
    block: "p001_b0135",
    verdict: "positive_grain_only_proposed",
  },
} as const;

const postSnapshotId = "gtfs-static-20250626-queens-post-qbnr";
const postSnapshot = loadGtfsStaticSnapshot(
  snapshotById(loadOperationalSnapshotRegistry(), postSnapshotId),
  ["calendar", "calendar_dates", "routes", "stops", "stop_times", "trips"],
  repoRoot,
  new Set(["Q45", "Q86"]),
);
const positivePatterns = ["Q45", "Q86"].flatMap((routeId) =>
  fullStopPatternsForDate(postSnapshot, "2025-06-29", routeId));
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
const positivePatternInventories = positivePatterns.map(patternInventory)
  .sort((left, right) => left.pattern_id.localeCompare(right.pattern_id));
for (const pin of Object.values(PLAN040_PACKAGE_11_POSITIVE_PATTERN_PINS)) {
  const inventory = positivePatternInventories.find((row) =>
    row.pattern_id === pin.pattern_id);
  if (
    !inventory ||
    inventory.snapshot_id !== pin.snapshot_id ||
    inventory.service_date !== pin.service_date ||
    inventory.route_id !== pin.route_id ||
    inventory.direction_id !== pin.direction_id ||
    inventory.trip_count !== pin.trip_count ||
    inventory.trip_id_sha256 !== pin.trip_id_sha256 ||
    stableJson(inventory.shape_ids as JsonValue) !==
      stableJson(pin.shape_ids as unknown as JsonValue) ||
    inventory.stop_count !== pin.stop_count ||
    inventory.stop_chain_sha256 !== pin.stop_chain_sha256
  ) {
    throw new Error(`${pin.pattern_id}: accepted GTFS replay drifted`);
  }
}
if (positivePatternInventories.length !== 4) {
  throw new Error("Package 11 accepted positive pattern count drifted");
}

type ScheduleSlice = {
  route_id: string;
  schedule_date: string;
  total_stop_time_row_count: number;
  trip_type_stop_time_row_counts: Record<string, number>;
  trip_type_trip_start_counts: Record<string, number>;
  shape_rows: Array<{
    shape_id: string;
    trip_type: string;
    stop_time_row_count: number;
    trip_start_count: number;
  }>;
};
const csvCells = (line: string, count: number): string[] => {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length && cells.length < count; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else if (char !== "\r" && char !== "\n") {
      cell += char;
    }
  }
  if (cells.length < count) cells.push(cell);
  return cells;
};
const scanScheduleSlices = (): Record<string, ScheduleSlice> => {
  const targets = new Set([
    "Q45\u00002025-06-29",
    "Q86\u00002025-06-29",
    "QM68\u00002025-06-30",
    "Q80\u00002025-08-31",
  ]);
  const summaries = new Map<string, {
    total: number;
    typeRows: Map<string, number>;
    typeStarts: Map<string, number>;
    shapes: Map<string, { type: string; rows: number; starts: number }>;
  }>();
  const path = join(
    repoRoot,
    "raw/sources/mta_bus_schedules_2025_candidate_windows/source.csv",
  );
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  let carry = "";
  let firstLine = true;
  const accept = (line: string) => {
    if (firstLine) {
      firstLine = false;
      return;
    }
    const cells = csvCells(line, 14);
    const scheduleDate = (cells[0] ?? "").slice(0, 10);
    const shapeId = cells[6] ?? "";
    const tripType = cells[7] ?? "";
    const routeId = cells[8] ?? "";
    const stopSequence = cells[9] ?? "";
    const key = `${routeId}\0${scheduleDate}`;
    if (!targets.has(key)) return;
    const summary = summaries.get(key) ?? {
      total: 0,
      typeRows: new Map(),
      typeStarts: new Map(),
      shapes: new Map(),
    };
    summary.total += 1;
    summary.typeRows.set(
      tripType,
      (summary.typeRows.get(tripType) ?? 0) + 1,
    );
    const isStart = stopSequence === "1";
    if (isStart) {
      summary.typeStarts.set(
        tripType,
        (summary.typeStarts.get(tripType) ?? 0) + 1,
      );
    }
    const shape = summary.shapes.get(shapeId) ?? {
      type: tripType,
      rows: 0,
      starts: 0,
    };
    if (shape.type !== tripType) {
      throw new Error(`${shapeId}: schedule trip type drifted`);
    }
    shape.rows += 1;
    if (isStart) shape.starts += 1;
    summary.shapes.set(shapeId, shape);
    summaries.set(key, summary);
  };
  try {
    for (;;) {
      const bytes = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      const text = carry + buffer.subarray(0, bytes).toString("utf8");
      const lines = text.split("\n");
      carry = lines.pop() ?? "";
      lines.forEach(accept);
    }
    if (carry) accept(carry);
  } finally {
    closeSync(descriptor);
  }
  return Object.fromEntries([...targets].sort().map((key) => {
    const [routeId, scheduleDate] = key.split("\0");
    const summary = summaries.get(key);
    if (!routeId || !scheduleDate || !summary) {
      throw new Error(`${key}: schedule slice missing`);
    }
    return [routeId, {
      route_id: routeId,
      schedule_date: scheduleDate,
      total_stop_time_row_count: summary.total,
      trip_type_stop_time_row_counts: Object.fromEntries(
        [...summary.typeRows.entries()].sort(),
      ),
      trip_type_trip_start_counts: Object.fromEntries(
        [...summary.typeStarts.entries()].sort(),
      ),
      shape_rows: [...summary.shapes.entries()].map(([shapeId, value]) => ({
        shape_id: shapeId,
        trip_type: value.type,
        stop_time_row_count: value.rows,
        trip_start_count: value.starts,
      })).sort((left, right) => left.shape_id.localeCompare(right.shape_id)),
    } satisfies ScheduleSlice];
  }));
};
const scheduleSlices = scanScheduleSlices();
const shapeSchedule = (
  routeId: "Q45" | "Q86",
  shapeId: string,
  directionId: string,
) => {
  const row = scheduleSlices[routeId]?.shape_rows.find((value) =>
    value.shape_id === shapeId && value.trip_type === "1");
  if (!row) throw new Error(`${routeId}/${shapeId}: schedule row missing`);
  return {
    direction_id: directionId,
    shape_id: shapeId,
    stop_time_row_count: row.stop_time_row_count,
    trip_start_count: row.trip_start_count,
  };
};
if (
  scheduleSlices.Q80?.total_stop_time_row_count !== 844 ||
  stableJson(
    scheduleSlices.Q80.trip_type_stop_time_row_counts as JsonValue,
  ) !== stableJson({ "1": 780, "2": 30, "3": 28, "4": 6 }) ||
  scheduleSlices.QM68?.trip_type_stop_time_row_counts["13"] !== 105 ||
  scheduleSlices.QM68.trip_type_trip_start_counts["13"] !== 21
) {
  throw new Error("Package 11 schedule slice replay drifted");
}

const scheduleContext: Record<string, JsonValue> = {
  Q45: {
    accepted_snapshot_date: "2025-06-29",
    retained_trip_types: ["1"],
    excluded_trip_types: ["2", "3", "4"],
    passenger_schedule_rows: [
      shapeSchedule("Q45", "Q450028", "0"),
      shapeSchedule("Q45", "Q450023", "1"),
    ],
    pattern_ids: [...PLAN040_PACKAGE_11_Q45_PATTERN_IDS],
  },
  Q63: {
    source_statement_date: "2025-06-29",
    accepted_initial_post_pattern_count: 0,
    corrected_version_sha1:
      "6db867de2ce30f47ae0ee763f422dc34fb7a9f9f",
    corrected_bytes_status: "blocked_unavailable",
    published_launch_conflict_resolution_required: true,
  },
  Q80: {
    source_statement_date: "2025-08-31",
    schedule_date: scheduleSlices.Q80!.schedule_date,
    total_stop_time_row_count:
      scheduleSlices.Q80!.total_stop_time_row_count,
    trip_type_stop_time_row_counts:
      scheduleSlices.Q80!.trip_type_stop_time_row_counts,
    accepted_post_gtfs_end_date: "2025-08-30",
    effective_date_full_stop_inventory_present: false,
    missing_effective_date_evidence: [
      "frequency_evidence",
      "full_stop_patterns",
      "lineage",
    ],
  },
  Q82: {
    accepted_snapshot_date: "2025-06-29",
    retained_trip_types: ["1"],
    excluded_trip_types: ["2", "3", "4"],
    pattern_ids: [...PLAN040_PACKAGE_11_Q82_PATTERN_IDS],
    reused_full_stop_receipt_sha256:
      PLAN040_PACKAGE_11_GLOBAL_PINS.package_10b_full_stop_receipt,
  },
  Q86: {
    accepted_snapshot_date: "2025-06-29",
    retained_trip_types: ["1"],
    excluded_trip_types: ["2", "3", "4"],
    passenger_schedule_rows: [
      shapeSchedule("Q86", "Q860045", "0"),
      shapeSchedule("Q86", "Q860044", "1"),
    ],
    pattern_ids: [...PLAN040_PACKAGE_11_Q86_PATTERN_IDS],
  },
  Q87: {
    source_statement_date: "2025-06-30",
    initial_feed_date: "2025-06-29",
    accepted_feed_date: "2025-06-30",
    initial_pattern_ids: [
      "historical-full-stop-pattern:2ad2f4998674028bd63e541e",
      "historical-full-stop-pattern:8b3b53300bc316f042cca929",
    ],
    accepted_pattern_ids: [
      "historical-full-stop-pattern:882b57b4b88f082b419419c7",
      "historical-full-stop-pattern:efeade8f209d99093e94540b",
    ],
    date_version_review_required: true,
  },
  QM68: {
    accepted_snapshot_date: "2025-06-30",
    predecessor_route_id: "X68",
    successor_route_id: "QM68",
    predecessor_pattern_count: 4,
    successor_pattern_count: 2,
    identical_stop_id_lineage_only: true,
    passenger_schedule_rows: scheduleSlices.QM68!.shape_rows.filter((row) =>
      row.trip_type === "13"),
  },
};

const qm68Package9 = package9.candidates.find((row) =>
  row.treatment_record_id ===
    "treatment_qm68-avenue-service-discontinuation-2025");
const qm68Comparisons = qm68Package9?.ordered_full_stop_evidence?.comparisons
  .filter((row) =>
    PLAN040_PACKAGE_11_QM68_COMPARISON_IDS.includes(
      row.comparison_id as typeof PLAN040_PACKAGE_11_QM68_COMPARISON_IDS[number],
    ));
if (!qm68Comparisons || qm68Comparisons.length !== 4) {
  throw new Error("Package 11 QM68 comparison evidence drifted");
}
const comparisonById = new Map(qm68Comparisons.map((row) => [
  row.comparison_id,
  row,
]));
const selectedLineage = [
  comparisonById.get(PLAN040_PACKAGE_11_QM68_COMPARISON_IDS[1])!,
  comparisonById.get(PLAN040_PACKAGE_11_QM68_COMPARISON_IDS[2])!,
  comparisonById.get(PLAN040_PACKAGE_11_QM68_COMPARISON_IDS[0])!,
].map((row) => ({
  predecessor_gtfs_route_id: row.before_route_id,
  successor_gtfs_route_id: row.after_route_id,
  direction: row.direction_id,
  boundary_stop_ids: sortedStrings(row.boundary_stop_ids) as [string, string],
  shared_stop_ids: sortedStrings(row.shared_stop_ids),
})).sort((left, right) =>
  stableJson(left as unknown as JsonValue)
    .localeCompare(stableJson(right as unknown as JsonValue)));

const positivePatternReceiptBody = {
  schema_version: 1,
  receipt_id:
    "plan-040-qbnr-service-grain-package-11-positive-patterns-v1",
  source_id:
    "plan_040_qbnr_service_grain_package_11_positive_patterns",
  snapshot_id: postSnapshotId,
  service_date: "2025-06-29",
  derivation: {
    algorithm: "accepted_gtfs_active_service_ordered_full_stop_patterns_v1",
    route_ids: ["Q45", "Q86"],
    exact_identifier_policy: "gtfs_stop_id_and_order",
    pattern_count: positivePatternInventories.length,
  },
  accepted_patterns: positivePatternInventories,
  candidate_bindings: [
    {
      treatment_record_id: "treatment_q45-all-day-frequent-service-2025",
      pattern_ids: [...PLAN040_PACKAGE_11_Q45_PATTERN_IDS],
    },
    {
      treatment_record_id: "treatment_q45-direct-connection-2025",
      pattern_ids: [...PLAN040_PACKAGE_11_Q45_PATTERN_IDS],
    },
    {
      treatment_record_id: "treatment_q86-limited-stops-2025",
      pattern_ids: [...PLAN040_PACKAGE_11_Q86_PATTERN_IDS],
    },
  ],
  schedule_cross_check: {
    source_id: "mta_bus_schedules_2025_candidate_windows",
    source_csv_sha256: PLAN040_PACKAGE_11_GLOBAL_PINS.schedule_csv,
    route_dates: [
      {
        route_id: "Q45",
        schedule_date: "2025-06-29",
        passenger_schedule_rows:
          scheduleContext.Q45!.passenger_schedule_rows,
      },
      {
        route_id: "Q86",
        schedule_date: "2025-06-29",
        passenger_schedule_rows:
          scheduleContext.Q86!.passenger_schedule_rows,
      },
    ],
  },
  upstream_pins: {
    queens_post_receipt_sha256:
      PLAN040_PACKAGE_11_GLOBAL_PINS.queens_post_receipt,
    schedule_csv_sha256: PLAN040_PACKAGE_11_GLOBAL_PINS.schedule_csv,
  },
  replay_derived: true,
  normal_file_verified: true,
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
} satisfies JsonValue;
const positivePatternReceiptSha256 = sha256(
  stableBytes(positivePatternReceiptBody),
);
if (
  PLAN040_PACKAGE_11_POSITIVE_PATTERN_RECEIPT_SHA256 &&
  positivePatternReceiptSha256 !==
    PLAN040_PACKAGE_11_POSITIVE_PATTERN_RECEIPT_SHA256
) {
  throw new Error(
    "Package 11 positive pattern receipt replay hash drifted: " +
      positivePatternReceiptSha256,
  );
}
const positivePatternReceipt = {
  path: positivePatternReceiptRelative,
  sha256: positivePatternReceiptSha256,
  receipt_id:
    "plan-040-qbnr-service-grain-package-11-positive-patterns-v1",
  source_id:
    "plan_040_qbnr_service_grain_package_11_positive_patterns",
  snapshot_id: postSnapshotId,
  service_date: "2025-06-29",
  replay_derived: true,
  normal_file_verified: true,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
} satisfies Plan040Package11PositivePatternReceiptRef;

const sourceBinding = (
  treatmentId: string,
  block: SourceBlock,
): ExactEvidenceBinding => ({
  role: "source_statement",
  record_id: treatmentId,
  source_id: block.source_id,
  evidence_id: `${block.source_id}#${block.block_id}`,
});
const scheduleDateByRoute = {
  Q45: "2025-06-29",
  Q63: "2025-06-29",
  Q80: "2025-08-31",
  Q82: "2025-06-29",
  Q86: "2025-06-29",
  Q87: "2025-06-30",
  QM68: "2025-06-30",
} as const;
const retainedTripTypesByRoute = {
  Q45: ["1"],
  Q63: ["1"],
  Q80: ["1"],
  Q82: ["1"],
  Q86: ["1"],
  Q87: ["1"],
  QM68: ["13"],
} as const;
const scheduleBinding = (
  treatmentId: string,
  routeId: keyof typeof scheduleDateByRoute,
): ExactEvidenceBinding => ({
  role: "schedule_validation",
  record_id: treatmentId,
  source_id: "mta_bus_schedules_2025_candidate_windows",
  evidence_id:
    `mta_bus_schedules_2025_candidate_windows#date=${
      scheduleDateByRoute[routeId]
    }&route=${routeId}&trip_types=${
      retainedTripTypesByRoute[routeId].join(",")
    }`,
});
const positivePatternBindings = (
  treatmentId: string,
  routeId: "Q45" | "Q86",
): ExactEvidenceBinding[] => [
  {
    role: "accepted_gtfs_pattern_receipt",
    record_id: treatmentId,
    source_id: positivePatternReceipt.source_id,
    evidence_id:
      `${positivePatternReceipt.source_id}#candidate=${treatmentId}`,
  },
  ...(routeId === "Q45"
    ? PLAN040_PACKAGE_11_Q45_PATTERN_IDS
    : PLAN040_PACKAGE_11_Q86_PATTERN_IDS).map((patternId) => ({
      role: "accepted_ordered_full_stop_pattern",
      record_id: treatmentId,
      source_id: positivePatternReceipt.source_id,
      evidence_id: `${positivePatternReceipt.source_id}#${patternId}`,
    })),
];
const package10bQ82PatternBindings = (
  treatmentId: string,
): ExactEvidenceBinding[] => [
  {
    role: "full_stop_equivalence_receipt",
    record_id: treatmentId,
    source_id:
      "plan_040_qbnr_service_pattern_package_10b_full_stop_equivalence",
    evidence_id:
      "plan_040_qbnr_service_pattern_package_10b_full_stop_equivalence#" +
      "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1",
  },
  ...PLAN040_PACKAGE_11_Q82_PATTERN_IDS.map((patternId) => ({
    role: "successor_ordered_full_stop_chain",
    record_id: treatmentId,
    source_id:
      "plan_040_qbnr_service_pattern_package_10b_full_stop_equivalence",
    evidence_id:
      "plan_040_qbnr_service_pattern_package_10b_full_stop_equivalence#" +
      patternId,
  })),
];
const positivePatternTreatmentIds = new Set([
  "treatment_q45-all-day-frequent-service-2025",
  "treatment_q45-direct-connection-2025",
  "treatment_q86-limited-stops-2025",
]);
const grainDecision = (
  extent: MemberExtentLedgerRow,
  block: SourceBlock,
): MemberGrainDecision => {
  const treatment = extent.treatment_record_id;
  const common = {
    schema_version: 1 as const,
    contract_id: "member-grain-decision-v1" as const,
    decision_id: `member-grain-review:plan040-package11-${treatment}`,
    occurrence_id: extent.occurrence_id,
    route_record_id: extent.route_record_id,
    gtfs_route_id: extent.gtfs_route_id,
    treatment_record_id: treatment,
    member_extent_decision_id: extent.verdict_basis?.replace(/^review:/u, "") ??
      null,
    evidence_bindings: sortedBindings([
      sourceBinding(treatment, block),
      scheduleBinding(
        treatment,
        extent.gtfs_route_id as keyof typeof scheduleDateByRoute,
      ),
      ...(
          positivePatternTreatmentIds.has(treatment) &&
          (extent.gtfs_route_id === "Q45" ||
            extent.gtfs_route_id === "Q86")
        ? positivePatternBindings(treatment, extent.gtfs_route_id)
        : []),
    ]),
    reviewed_at: "2026-07-24T00:00:00.000Z",
    reviewed_by: "codex-plan-040-package-11-evidence-proposal",
  };
  if (treatment === "treatment_q82-limited-stops-2025") {
    return {
      ...common,
      evidence_bindings: sortedBindings([
        sourceBinding(treatment, block),
        {
          ...scheduleBinding(treatment, "Q82"),
          role: "schedule_timepoint_validation",
        },
        ...package10bQ82PatternBindings(treatment),
      ]),
      member_extent_decision_id:
        "member-extent-review:plan040-package11-q82-limited-stops",
      service_scope: {
        kind: "trip_subset",
        periods: ["weekend"],
        directions: ["0", "1"],
        pattern_ids: [...PLAN040_PACKAGE_11_Q82_PATTERN_IDS],
        description:
          "Weekend passenger trips on both accepted initial Q82 patterns.",
      },
      lineage_segments: [],
      rationale:
        "The route-specific source statement and accepted launch artifacts bind the weekend passenger subset.",
    };
  }
  if (treatment === "treatment_q45-all-day-frequent-service-2025") {
    return {
      ...common,
      service_scope: {
        kind: "periods",
        periods: ["all_day"],
        directions: ["0", "1"],
        pattern_ids: [...PLAN040_PACKAGE_11_Q45_PATTERN_IDS],
      },
      lineage_segments: [],
      rationale:
        "The route-specific source statement expressly binds the all-day service period.",
    };
  }
  if (treatment === "treatment_q45-direct-connection-2025") {
    return {
      ...common,
      service_scope: {
        kind: "trip_subset",
        periods: ["weekend"],
        directions: ["0", "1"],
        pattern_ids: [...PLAN040_PACKAGE_11_Q45_PATTERN_IDS],
        description:
          "Weekend passenger trips on both accepted initial Q45 patterns.",
      },
      lineage_segments: [],
      rationale:
        "The accepted initial artifacts bind the source-stated connection to the weekend passenger subset.",
    };
  }
  if (treatment === "treatment_q86-limited-stops-2025") {
    return {
      ...common,
      service_scope: {
        kind: "trip_subset",
        periods: ["weekend"],
        directions: ["0", "1"],
        pattern_ids: [...PLAN040_PACKAGE_11_Q86_PATTERN_IDS],
        description:
          "Weekend passenger trips on both accepted initial Q86 patterns.",
      },
      lineage_segments: [],
      rationale:
        "The route-specific source statement and accepted launch artifacts bind the weekend passenger subset.",
    };
  }
  if (treatment === "treatment_qm68-route-rename-2025") {
    return {
      ...common,
      evidence_bindings: sortedBindings([
        sourceBinding(treatment, block),
        scheduleBinding(treatment, "QM68"),
        ...qm68Comparisons.map((row) => ({
          role: "lineage_comparison",
          record_id: row.comparison_id,
          source_id: "plan_040_qbnr_service_pattern_package_9",
          evidence_id: row.comparison_id,
        })),
      ]),
      service_scope: { kind: "all_service" },
      lineage_segments: selectedLineage,
      rationale:
        "The route rename applies to the complete successor service and three unique identical-ID lineage segments bind all four comparisons.",
    };
  }
  const missingRoles = treatment.startsWith("treatment_q63-")
    ? [
      "corrected_initial_feed_bytes",
      "published_launch_conflict_resolution",
    ]
    : treatment.startsWith("treatment_q80-")
      ? [
        "effective_date_full_stop_inventory",
        "frequency_evidence",
        "later_feed_lineage",
      ]
      : treatment === "treatment_q86-q5-q85-branch-combination-2025"
        ? ["branch_lineage_mapping", "direction_lineage_mapping"]
      : treatment.startsWith("treatment_q87-")
        ? ["accepted_date_resolution", "feed_version_resolution"]
        : ["branch_mapping", "direction_mapping"];
  return {
    ...common,
    service_scope: {
      kind: "unresolved",
      missing_roles: sortedStrings(missingRoles),
    },
    lineage_segments: [],
    rationale:
      "The required published artifacts conflict or do not cover the source-stated effective state.",
  };
};

const q82ExtentDecision = (
  extent: MemberExtentLedgerRow,
  block: SourceBlock,
): MemberExtentDecision => ({
  decision_id: "member-extent-review:plan040-package11-q82-limited-stops",
  occurrence_id: extent.occurrence_id,
  route_record_id: extent.route_record_id,
  treatment_record_id: extent.treatment_record_id,
  resolution: "bounded_segment",
  components: [
    {
      component_kind: "segment",
      identity_namespace: "source_literal_v1",
      identifiers: [
        "500018", "500022", "501908", "503965", "503984", "505096",
      ],
      description:
        "Direction 0 Hillside Avenue limited-stop segment, ordered in the evidence receipt as 503984, 501908, 505096, 500018, 503965, 500022.",
    },
    {
      component_kind: "segment",
      identity_namespace: "source_literal_v1",
      identifiers: ["500072", "500074", "500080", "501414"],
      description:
        "Direction 1 Hillside Avenue limited-stop segment, ordered in the evidence receipt as 500072, 500074, 500080, 501414.",
    },
  ],
  evidence_bindings: sortedBindings([
    {
      ...sourceBinding(extent.treatment_record_id, block),
      role: "scope_evidence",
    },
    {
      role: "full_stop_receipt",
      record_id:
        "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1",
      source_id:
        "plan_040_qbnr_service_pattern_package_10b_full_stop_equivalence",
      evidence_id: PLAN040_PACKAGE_11_GLOBAL_PINS.package_10b_full_stop_receipt,
    },
  ]),
  missing_roles: [],
  rationale:
    "The source names Hillside Avenue and the reused exact-stop receipt resolves the two directional segment members.",
  reviewed_at: "2026-07-24T00:00:00.000Z",
  reviewed_by: "codex-plan-040-package-11-evidence-proposal",
});

type FrozenPackage11Evidence = {
  candidates: Plan040Package11CandidateEvidence[];
  exclusions: Plan040Package11Exclusion[];
};
const frozenPackage11Evidence =
  existsSync(join(repoRoot, evidenceRelative))
    ? readJson<FrozenPackage11Evidence>(evidenceRelative)
    : null;
const frozenCandidateByTreatment = frozenPackage11Evidence
  ? new Map(frozenPackage11Evidence.candidates.map((candidate) => [
    candidate.treatment_record_id,
    candidate,
  ]))
  : null;
const candidates = PLAN040_PACKAGE_11_CANDIDATES.map(
  ([routeId, treatmentId]): Plan040Package11CandidateEvidence => {
    const currentExtent = one(
      extentRows,
      (row) => row.treatment_record_id === treatmentId,
      `${treatmentId} extent ledger`,
    );
    const currentGrain = one(
      grainRows,
      (row) => row.treatment_record_id === treatmentId,
      `${treatmentId} grain ledger`,
    );
    const frozenCandidate = frozenCandidateByTreatment?.get(treatmentId);
    const extent = frozenCandidate
      ? {
        row: frozenCandidate.prior_ledger_state.extent_row,
        sha256:
          frozenCandidate.immutable_candidate_rows.extent_ledger_row_sha256,
      }
      : currentExtent;
    const grain = frozenCandidate
      ? {
        row: frozenCandidate.prior_ledger_state.grain_row,
        sha256:
          frozenCandidate.immutable_candidate_rows.grain_ledger_row_sha256,
      }
      : currentGrain;
    if (
      candidateKey(currentExtent.row) !== candidateKey(extent.row) ||
      candidateKey(currentGrain.row) !== candidateKey(grain.row)
    ) {
      throw new Error(`${treatmentId}: persisted ledger identity drifted`);
    }
    const treatment = one(
      treatmentRows,
      (row) => row.record_id === treatmentId,
      `${treatmentId} treatment`,
    );
    const block = one(
      sourceBlocks,
      (row) => row.block_id === metadata[treatmentId].block,
      `${treatmentId} source block`,
    ).row;
    const occurrence = occurrenceOne(extent.row.occurrence_id);
    const route = one(
      routeRows,
      (row) => row.record_id === extent.row.route_record_id,
      `${treatmentId} route`,
    );
    const eventId = occurrence.row.resolved_onset?.evidence_bindings?.find(
      (binding) => binding.role === "event_date",
    )?.record_id;
    const event = eventId
      ? one(eventRows, (row) => row.record_id === eventId, `${treatmentId} event`)
      : null;
    const proposedGrain = grainDecision(extent.row, block);
    const proposedExtent = treatmentId ===
        "treatment_q82-limited-stops-2025"
      ? q82ExtentDecision(extent.row, block)
      : null;
    const unresolvedGapCodes =
      proposedGrain.service_scope.kind === "unresolved"
        ? proposedGrain.service_scope.missing_roles
        : [];
    const acceptedEvidence: Record<string, JsonValue> = {
      canonical_context: {
        route_record_id: route.row.record_id,
        route_row_sha256: route.sha256,
        event_record_id: event?.row.record_id ?? null,
        event_row_sha256: event?.sha256 ?? null,
      },
      schedule_and_pattern_context: scheduleContext[routeId]!,
      schedule_policy: {
        retained_trip_types: routeId === "QM68" ? ["13"] : ["1"],
        excluded_trip_types: ["2", "3", "4"],
        ...(routeId === "QM68"
          ? {
            retained_passenger_stop_time_row_count: 105,
            retained_passenger_trip_start_count: 21,
          }
          : {}),
      },
      ledger_unchanged_now: true,
    };
    if (
      positivePatternTreatmentIds.has(treatmentId) &&
      (routeId === "Q45" || routeId === "Q86")
    ) {
      const patternIds = routeId === "Q45"
        ? PLAN040_PACKAGE_11_Q45_PATTERN_IDS
        : PLAN040_PACKAGE_11_Q86_PATTERN_IDS;
      acceptedEvidence.accepted_gtfs_patterns =
        positivePatternInventories.filter((row) =>
          patternIds.includes(row.pattern_id as never));
      acceptedEvidence.accepted_gtfs_pattern_receipt =
        positivePatternReceipt as unknown as JsonValue;
    }
    if (treatmentId === "treatment_q82-limited-stops-2025") {
      acceptedEvidence.q82_scope_review = {
        predecessor_route_selected: null,
        local_service_routes_are_context_only: ["Q1", "Q3", "Q76"],
        direction_0_stop_ids: [
          "503984", "501908", "505096", "500018", "503965", "500022",
        ],
        direction_1_stop_ids: ["500072", "500074", "500080", "501414"],
        package_10b_sibling_decisions_changed: false,
        q89_residual_exclusion_changed: false,
      };
    }
    if (treatmentId === "treatment_qm68-route-rename-2025") {
      acceptedEvidence.qm68_lineage_review = {
        comparison_ids: sortedStrings(PLAN040_PACKAGE_11_QM68_COMPARISON_IDS),
        comparison_summaries: qm68Comparisons.map((row) => ({
          comparison_id: row.comparison_id,
          direction_id: row.direction_id,
          boundary_stop_ids: row.boundary_stop_ids,
          shared_stop_ids: row.shared_stop_ids,
          comparison_row_sha256: rowSha256(row),
        })).sort((left, right) =>
          left.comparison_id.localeCompare(right.comparison_id)),
        unique_lineage_segment_count: 3,
        all_four_comparisons_bound: true,
        midtown_stop_additions_in_scope: false,
      };
    }
    if (unresolvedGapCodes.length > 0) {
      acceptedEvidence.post_acceptance_disposition = {
        prospective_ledger_verdict: "blocked_upstream",
        current_ledger_changed: false,
      };
    }
    return {
      candidate_key: candidateKey(extent.row),
      occurrence_id: extent.row.occurrence_id,
      route_record_id: extent.row.route_record_id,
      gtfs_route_id: routeId,
      treatment_record_id: treatmentId,
      treatment_family: extent.row.treatment_family,
      source_statement: {
        source_id: block.source_id as
          "mta_queens_bus_network_redesign_service_changes",
        evidence_id: `${block.source_id}#${block.block_id}`,
        block_id: block.block_id,
        block_sha256: block.raw_text_sha256,
        source_quote: block.raw_text,
      },
      immutable_candidate_rows: {
        occurrence_decision: occurrence.row as unknown as JsonValue,
        occurrence_row_sha256: occurrence.sha256,
        treatment_component: treatment.row as unknown as JsonValue,
        treatment_row_sha256: treatment.sha256,
        extent_ledger_row_sha256: extent.sha256,
        grain_ledger_row_sha256: grain.sha256,
      },
      prior_ledger_state: {
        extent_row: extent.row,
        grain_row: grain.row,
      },
      accepted_evidence: acceptedEvidence,
      exact_candidate_searches: [
        `occurrence_id=${extent.row.occurrence_id}`,
        `route_record_id=${extent.row.route_record_id}`,
        `gtfs_route_id=${routeId}`,
        `treatment_record_id=${treatmentId}`,
        `source_block=${block.block_id}`,
        `source_hash=${block.raw_text_sha256}`,
        `extent_ledger_id=${extent.row.ledger_id}`,
        `grain_ledger_id=${grain.row.ledger_id}`,
        `extent_verdict=${extent.row.verdict}`,
        `grain_verdict=${grain.row.verdict}`,
        `schedule_csv_sha256=${PLAN040_PACKAGE_11_GLOBAL_PINS.schedule_csv}`,
        `occurrence_row_sha256=${occurrence.sha256}`,
      ],
      unresolved_gap_codes: unresolvedGapCodes,
      evidence_verdict: metadata[treatmentId].verdict,
      proposed_extent_decision: proposedExtent,
      proposed_grain_decision: proposedGrain,
      persisted_extent_decision: null,
      persisted_grain_decision: null,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_decision_persistence: false,
    };
  },
);

const candidateKeys = candidates.map((row) => row.candidate_key);
if (
  sortedHash(candidateKeys) !== PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256 ||
  sortedHash(candidateKeys.slice(0, 1)) !==
    PLAN040_PACKAGE_11_Q82_CANDIDATE_KEY_SHA256 ||
  sortedHash(candidateKeys.slice(1)) !==
    PLAN040_PACKAGE_11_GRAIN_ONLY_CANDIDATE_KEY_SHA256
) {
  throw new Error("Package 11 corrected candidate discovery drifted");
}

const exclusionKey = (treatmentId: string): string => candidateKey(one(
  extentRows,
  (row) => row.treatment_record_id === treatmentId,
  `${treatmentId} exclusion`,
).row);
const ledgerPreservation = (treatmentId: string): Record<string, JsonValue> => {
  const extent = one(
    extentRows,
    (row) => row.treatment_record_id === treatmentId,
    `${treatmentId} preserved extent row`,
  );
  const grain = one(
    grainRows,
    (row) => row.treatment_record_id === treatmentId,
    `${treatmentId} preserved grain row`,
  );
  return {
    treatment_record_id: treatmentId,
    extent_ledger_row_sha256: extent.sha256,
    grain_ledger_row_sha256: grain.sha256,
    extent_verdict: extent.row.verdict,
    grain_verdict: grain.row.verdict,
  };
};
const q89LimitedKey = exclusionKey("treatment_q89-limited-stops-2025");
const qm68MidtownKey = exclusionKey(
  "treatment_qm68-midtown-stop-additions-2025",
);
const q48LimitedKey = exclusionKey("treatment_q48-limited-stops-2025");
const historicalQ48Key =
  "canonical-treatment\u0000" +
  "treatment_q48-historical-discontinuation-replacement-2025";
const historicalQ48Treatment = one(
  treatmentRows,
  (row) =>
    row.record_id ===
      "treatment_q48-historical-discontinuation-replacement-2025",
  "historical old Q48 treatment",
);
const historicalQ48Route = one(
  routeRows,
  (row) => row.record_id === "route_q48-serves-lga-2011",
  "historical old Q48 route",
);
if (
  extentRows.some((row) =>
    row.row.treatment_record_id === historicalQ48Treatment.row.record_id) ||
  grainRows.some((row) =>
    row.row.treatment_record_id === historicalQ48Treatment.row.record_id) ||
  stableJson(occurrenceRoot).includes(historicalQ48Treatment.row.record_id)
) {
  throw new Error("Historical old Q48 context acquired occurrence membership");
}
const currentExclusions: Plan040Package11Exclusion[] = [
  {
    scope_id: "q89_residual_limited_stop",
    candidate_keys: [q89LimitedKey],
    candidate_key_sha256: sortedHash([q89LimitedKey]),
    preservation_evidence: ledgerPreservation(
      "treatment_q89-limited-stops-2025",
    ),
    unchanged: true,
  },
  {
    scope_id: "qm68_midtown_stop_additions",
    candidate_keys: [qm68MidtownKey],
    candidate_key_sha256: sortedHash([qm68MidtownKey]),
    preservation_evidence: ledgerPreservation(
      "treatment_qm68-midtown-stop-additions-2025",
    ),
    unchanged: true,
  },
  {
    scope_id: "package_10b_accepted_sibling_decisions",
    candidate_keys: package10b.candidates.map((row) => row.candidate_key).sort(),
    candidate_key_sha256: sortedHash(
      package10b.candidates.map((row) => row.candidate_key),
    ),
    preservation_evidence: {
      package_10b_evidence_sha256:
        PLAN040_PACKAGE_11_GLOBAL_PINS.package_10b_evidence,
      accepted_candidate_count: package10b.candidates.length,
    },
    unchanged: true,
  },
  {
    scope_id: "package_10d_q48_limited_stop_sibling",
    candidate_keys: [q48LimitedKey],
    candidate_key_sha256: sortedHash([q48LimitedKey]),
    preservation_evidence: {
      package_10d_evidence_sha256:
        PLAN040_PACKAGE_11_GLOBAL_PINS.package_10d_evidence,
      package_10d_gate_sha256:
        PLAN040_PACKAGE_11_GLOBAL_PINS.package_10d_gate,
      package_10d_acceptance_sha256:
        PLAN040_PACKAGE_11_GLOBAL_PINS.package_10d_acceptance,
      package_10d_extent_decisions_sha256:
        PLAN040_PACKAGE_11_GLOBAL_PINS.package_10d_extent_decisions,
      package_10d_grain_decisions_sha256:
        PLAN040_PACKAGE_11_GLOBAL_PINS.package_10d_grain_decisions,
      ...ledgerPreservation("treatment_q48-limited-stops-2025"),
      accepted_main_treatment_record_id:
        "treatment_q48-glen-oaks-branch-2025",
      accepted_main_extent_ledger_row_sha256:
        "746fb66028ded6478dff38eb634de6378b88631f0c3b7ec9b7ac0255ee481957",
      accepted_main_grain_ledger_row_sha256:
        "da8251518fbfedabb8c2cb8bb1c866fc4aa7a7b3627db21b0918e8f22f27937d",
    },
    unchanged: true,
  },
  {
    scope_id: "historical_old_q48_context",
    candidate_keys: [historicalQ48Key],
    candidate_key_sha256: sortedHash([historicalQ48Key]),
    preservation_evidence: {
      treatment_record_id: historicalQ48Treatment.row.record_id,
      treatment_row_sha256: historicalQ48Treatment.sha256,
      route_record_id: historicalQ48Route.row.record_id,
      route_row_sha256: historicalQ48Route.sha256,
      occurrence_membership_present: false,
      extent_ledger_row_count: 0,
      grain_ledger_row_count: 0,
    },
    unchanged: true,
  },
];
const exclusions = frozenPackage11Evidence?.exclusions ?? currentExclusions;
if (frozenPackage11Evidence) {
  if (exclusions.length !== currentExclusions.length) {
    throw new Error("Package 11 frozen exclusion count drifted");
  }
  const currentByScope = new Map(currentExclusions.map((exclusion) => [
    exclusion.scope_id,
    exclusion,
  ]));
  for (const exclusion of exclusions) {
    const current = currentByScope.get(exclusion.scope_id);
    if (
      !current ||
      stableJson(exclusion.candidate_keys as JsonValue) !==
        stableJson(current.candidate_keys as JsonValue) ||
      exclusion.candidate_key_sha256 !==
        sortedHash(exclusion.candidate_keys) ||
      exclusion.candidate_key_sha256 !== current.candidate_key_sha256
    ) {
      throw new Error(
        `${exclusion.scope_id}: Package 11 frozen exclusion identity drifted`,
      );
    }
    for (const key of exclusion.candidate_keys) {
      if (key.startsWith("canonical-treatment\0")) continue;
      one(
        extentRows,
        (row) => candidateKey(row) === key,
        `${exclusion.scope_id} current extent identity`,
      );
      one(
        grainRows,
        (row) => candidateKey(row) === key,
        `${exclusion.scope_id} current grain identity`,
      );
    }
  }
}

const evidence = {
  schema_version: 1,
  manifest_id: PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11,
  candidate_count: 12,
  route_count: 7,
  candidate_key_sha256: PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256,
  candidate_scope_discovery: {
    q82_candidate_key_sha256:
      PLAN040_PACKAGE_11_Q82_CANDIDATE_KEY_SHA256,
    grain_only_11_candidate_key_sha256:
      PLAN040_PACKAGE_11_GRAIN_ONLY_CANDIDATE_KEY_SHA256,
    combined_12_candidate_key_sha256:
      PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256,
    rejected_supplied_discovery_sha256_prefix: "b8929342",
    rejected_hash_is_authoritative: false,
  },
  candidates,
  exclusions,
  positive_pattern_receipt: positivePatternReceipt,
  immutable_inputs: PLAN040_PACKAGE_11_GLOBAL_PINS,
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 1,
    positive_grain_only_proposed: 4,
    structured_unresolved_grain_proposed: 7,
  },
  proposed_extent_distribution: { bounded_segment: 1 },
  proposed_grain_distribution: {
    periods: 1,
    trip_subset: 3,
    all_service: 1,
    unresolved: 7,
  },
  review_protocol: {
    review_mode: "dual_independent_residual_service_grain_review",
    independent_review_required: true,
    dual_independent_review_required: true,
    owner_gate_created: false,
    owner_acceptance_created: false,
    persistence_performed: false,
  },
  external_acquisition_performed: false,
  authorization_state:
    "evidence_only_no_gate_no_acceptance_no_persistence",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
} satisfies JsonValue;

writeImmutableNormalFile(
  positivePatternReceiptRelative,
  positivePatternReceiptBody,
);
writeStable(evidenceRelative, evidence);
const evidenceSha256 = sha256(stableBytes(evidence));
const draft = buildPlan040Package11Draft({
  evidenceManifestPath: evidenceRelative,
  evidenceManifestSha256: evidenceSha256,
  candidates,
  exclusions,
  positivePatternReceipt,
});
writeStable(draftRelative, draft as unknown as JsonValue);

console.log(JSON.stringify({
  evidence: evidenceRelative,
  evidence_sha256: evidenceSha256,
  draft: draftRelative,
  draft_sha256: sha256(stableBytes(draft as unknown as JsonValue)),
  check_only: checkOnly,
}));
