import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  compareFullStopPatterns,
  fullStopPatternsForDate,
  type HistoricalFullStopPattern,
  type HistoricalPatternComparison,
} from "../src/reference/historical-full-stop.js";
import {
  loadGtfsStaticSnapshot,
  type GtfsStaticSnapshot,
} from "../src/reference/gtfs-static.js";
import {
  loadOperationalSnapshotRegistry,
  snapshotById,
} from "../src/reference/snapshot-registry.js";
import type {
  MemberExtentLedgerRow,
  MemberGrainLedgerRow,
} from "../src/quality/member-extent-ledger.js";
import type {
  MemberGrainDecision,
  MemberGrainLineageSegment,
} from "../src/quality/member-grain-decisions.js";
import {
  PLAN040_PACKAGE_13_CANDIDATE_COUNT,
  PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_13_BLOCKED_EXTENT_AND_GRAIN_COUNT,
  PLAN040_PACKAGE_13_BLOCKED_EXTENT_AND_GRAIN_KEY_SHA256,
  PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256,
  PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT,
  PLAN040_PACKAGE_13_EXCLUSION_COUNT,
  PLAN040_PACKAGE_13_POSITIVE_EXTENT_AND_GRAIN_COUNT,
  PLAN040_PACKAGE_13_POSITIVE_EXTENT_AND_GRAIN_KEY_SHA256,
  PLAN040_PACKAGE_13_POSITIVE_EXTENT_ONLY_COUNT,
  PLAN040_PACKAGE_13_POSITIVE_EXTENT_ONLY_KEY_SHA256,
  PLAN040_PACKAGE_13_SIBLING_COUNT,
  PLAN040_PACKAGE_13_SOURCE_GAP_COUNT,
  PLAN040_PACKAGE_13_SOURCE_GAP_KEY_SHA256,
  PLAN040_PACKAGE_13_SOURCE_GAP_RECEIPT_SHA256,
  PLAN040_QBNR_BUS_STOP_PACKAGE_13,
  buildPlan040Package13Draft,
  validatePlan040Package13Evidence,
  type Plan040Package13CandidateEvidence,
  type Plan040Package13Exclusion,
  type Plan040Package13PreservedSibling,
  type Plan040Package13ReceiptRef,
} from "../src/quality/plan040-qbnr-bus-stop-package13.js";
import type {
  ExactEvidenceBinding,
  MemberExtentDecision,
} from "../src/quality/study-readiness-v1.js";

const checkOnly = process.argv.includes("--check");
const riskRoot = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk",
);
const evidenceRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-bus-stop-package-13-evidence-v1.json";
const draftRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-bus-stop-package-13-evidence-draft-v1.json";
const comparisonRelative =
  "data/quality/acquisition/receipts/member-extent-evidence/" +
  "plan-040-qbnr-bus-stop-package-13-full-stop-comparisons-v1.json";
const sourceGapRelative =
  "data/quality/acquisition/receipts/member-extent-evidence/" +
  "plan-040-qbnr-bus-stop-package-13-source-gap-blocks-v1.json";

const SOURCE_PINS = {
  service_change_html:
    "4b5dc9ca398980a3803e076378acefd7ac3ec04343e0ac32db95a17c1d51226d",
  service_change_blocks:
    "7b46befc331051265d4e7f9ff86ef8dde908474759ec1e94f9cfe28764a28490",
  routes:
    "8ea0278c7acae7585cbe0c85e3fa9407d8ca49b1ca12327b60318b676122a5c0",
  treatments:
    "a9b76c3b7121fc87d0f190a44fb00f182229d8d309968d3ba00a8c27a1492bae",
  occurrence_export:
    "80e530c9953e59a767afcb2f0d61202d9a9209469075f41f993fe7469ee45883",
  schedule_csv:
    "c592686da8a1cabdc8b559db4d4ae15d5a663adbe08f332e196215fd377be7c5",
  schedule_receipt:
    "82cc442de9b9c0356965f678c8491a78a093eea8eca06bac29d67747355a58c3",
  schedule_blocks:
    "e12d18baf0ed5f6fb019d877922861df44fd99805f58f5b4b8344de89b71658d",
  snapshot_registry:
    "3372c2309f903ea1f069828619c925760ed8246daa1b1bf591f81aea0bfe7798",
  queens_pre_receipt:
    "07fc854e9d4f2e980048741b335c95f781f03b8a8914c4eb0acd51bd92c540c6",
  queens_post_receipt:
    "0a66e26e639674b88bd1d0251d6a15f4cab2205e794fa14a3d75367c43394eeb",
  busco_pre_receipt:
    "de2d6e8c9a5cf700b0bee32e53634f1d2b984a8c3b8e41b51f84991cb3b7cae9",
  busco_post_receipt:
    "3315b84e194d8fb6c0efeed5c9342d54113c19a0ea5fe0111c76e336d61a054d",
} as const;
const CHECKPOINT_PINS = {
  extent_ledger:
    "b6ec884cc6e0a38f09fa69b99f1b844b00b82def1477f7e48e52378fc8673c5b",
  grain_ledger:
    "362538a4e870914a6c148dfb546018da1f69e81725766eba8feb891ef0fb77de",
  bridge:
    "f937c0ed6d420e35b6eb878292ac671ff24d5d6c2e86e0cc9fa47be377ef183e",
  study_manifest:
    "cb40a045d09ffca2e59d4d96722a09f9832c715f50afb9aee35080eb4b97207c",
  extent_contract:
    "5566b2a536bd2d3f2e513b32af0a46a7efc18854414ea3c1dacd37d22d250b5f",
  extent_manifest:
    "d8126f8017c899726fc6c7181f0dfdc84f773066af54bc9f2ee769703bed9253",
} as const;
const UPSTREAM_PINS = {
  package_9_grain: {
    path:
      "data/quality/operational-reference/member-grain-decisions/" +
      "plan-040-qbnr-service-pattern-package-9-v1.json",
    sha256:
      "e9ace85279043ad384651da4ecf15dc52c27d84df2978c5455e63600c6a5bbc9",
  },
  package_10d_grain: {
    path:
      "data/quality/operational-reference/member-grain-decisions/" +
      "plan-040-qbnr-service-pattern-package-10d-v1.json",
    sha256:
      "571971292568abfa1d8e85d77318c012a955935cbb5dd5de90d5e28482c8c521",
  },
  package_10d_evidence: {
    path:
      "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-10d-evidence-v1.json",
    sha256:
      "2420151d952fe8699a3db4d372f80dea215fb9df59598e87a57dd698d8811b2a",
  },
  package_11_evidence: {
    path:
      "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-grain-package-11-evidence-v1.json",
    sha256:
      "5980bdc4723956e36df9734b5180e9eb3b3ecf11d995d1ba75b004326d5ce4d3",
  },
  package_12_evidence: {
    path:
      "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-flatbush-physical-grain-package-12-evidence-v1.json",
    sha256:
      "4134a3afc2ce8c2f6fcecd9b12f941c1967511f1401132620b3750d916bc7736",
  },
} as const;
const INITIAL_SCOPE_PROVENANCE = {
  base_checkpoint_commit: "6c3ff63bfb766ca6c56c649b77256d6f22f53eb2",
  discovery_report: {
    original_path: "/tmp/plan040-qbnr31-discovery-report.json",
    sha256:
      "cf5070f44ba6bdd5c3e159c6bf2f6a0af20eb5307562d7ceace14c3fb11db2a4",
  },
  sibling_preservation_report: {
    original_path: "/tmp/plan040-qbnr31-sibling-preservation.tsv",
    sha256:
      "8929a1858b69131cef9aac48dca531b705437f0a2d1cc660432f05d2f113468b",
  },
  replay_dependency: false,
  normalized_scope_is_frozen_in_evidence: true,
} as const;

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const stableBytes = (value: JsonValue): string => `${stableJson(value)}\n`;
const rowSha256 = (value: unknown): string =>
  sha256(stableBytes(value as JsonValue));
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const sorted = (values: readonly string[]): string[] =>
  [...new Set(values)].sort();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const readJsonl = <T>(path: string): T[] =>
  readFileSync(path, "utf8").trim().split("\n").filter(Boolean)
    .map((line) => JSON.parse(line) as T);
const assertPinned = (path: string, expected: string): void => {
  const actual = sha256(readFileSync(join(repoRoot, path)));
  if (actual !== expected) throw new Error(`${path}: expected ${expected}, got ${actual}`);
};
const writeStable = (path: string, value: JsonValue): void => {
  const bytes = stableBytes(value);
  if (checkOnly) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== bytes) {
      throw new Error(`Deterministic replay drifted: ${path}`);
    }
  } else writeFileSync(path, bytes);
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

type FrozenCandidateSpecSource = {
  candidate_key: string;
  verdict: string;
  gtfs_route_id: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  source_statement: {
    block_id: string;
    quote: string;
  };
  candidate_stop_list_source: string | null;
  proposed: null | {
    extent: "bounded_segment" | "stop_set";
    component?: string;
    component_ids?: string[];
    scope: string;
    preserved_gap?: string;
    stop_list_refs?: string[];
    immutable_reuse?: string;
  };
};
type CandidateSpec = {
  candidate_key: string;
  verdict:
    | "positive_extent_and_grain_proposed"
    | "positive_extent_proposed_grain_blocked"
    | "source_gap_blocked_extent_and_grain";
  gtfs_route_id: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  block_id: string;
  quote: string;
  candidate_stop_list_source: string | null;
  dates: { pre: string; post: string } | null;
  expected_schedule_passenger_shapes: string[];
  expected_pre_pattern_ids: string[];
  expected_post_pattern_ids: string[];
  expected_matched_post_pattern_ids: string[];
  expected_comparison_ids: string[];
  proposed: FrozenCandidateSpecSource["proposed"];
  source_gap_codes: string[];
  occurrence_decision_path: string;
};
type SeedCandidateSpec = CandidateSpec;
type FrozenEvidenceSeed = {
  candidate_specs: SeedCandidateSpec[];
};
const evidencePath = join(repoRoot, evidenceRelative);
if (!existsSync(evidencePath)) {
  throw new Error(
    `${evidenceRelative}: frozen candidate specification is required for replay`,
  );
}
const candidateSpecs = readJson<FrozenEvidenceSeed>(evidencePath).candidate_specs
  .map((spec): CandidateSpec => {
    const base: Omit<CandidateSpec, "verdict" | "proposed"> = {
      candidate_key: spec.candidate_key,
      gtfs_route_id: spec.gtfs_route_id,
      occurrence_id: spec.occurrence_id,
      route_record_id: spec.route_record_id,
      treatment_record_id: spec.treatment_record_id,
      block_id: spec.block_id,
      quote: spec.quote,
      candidate_stop_list_source: spec.candidate_stop_list_source,
      dates: spec.dates,
      expected_schedule_passenger_shapes:
        spec.expected_schedule_passenger_shapes,
      expected_pre_pattern_ids: spec.expected_pre_pattern_ids,
      expected_post_pattern_ids: spec.expected_post_pattern_ids,
      expected_matched_post_pattern_ids:
        spec.expected_matched_post_pattern_ids,
      expected_comparison_ids: spec.expected_comparison_ids,
      source_gap_codes: spec.source_gap_codes,
      occurrence_decision_path: spec.occurrence_decision_path,
    };
    if (spec.treatment_record_id ===
        "treatment_qm8-east-34-stop-addition-2025") {
      return {
        ...base,
        verdict: "positive_extent_and_grain_proposed",
        expected_comparison_ids: [
          "historical-full-stop-comparison:e0e98ebdc33c41388f11c289",
          "historical-full-stop-comparison:af58c70e8d6accba99efd522",
        ],
        proposed: spec.proposed
          ? {
            ...spec.proposed,
            scope:
              "weekday_trip_subset_two_component_containing_patterns",
          }
          : null,
      };
    }
    if (spec.treatment_record_id === "treatment_q28-limited-stops-2025") {
      return {
        ...base,
        verdict: "positive_extent_proposed_grain_blocked",
        proposed: {
          extent: "bounded_segment",
          component: "Northern Blvd",
          scope: "source_literal_bounded_extent_grain_unresolved",
        },
      };
    }
    if (spec.treatment_record_id === "treatment_q84-limited-stops-2025") {
      return {
        ...base,
        verdict: "positive_extent_proposed_grain_blocked",
        proposed: {
          extent: "bounded_segment",
          component: "Merrick Blvd",
          scope: "source_literal_bounded_extent_grain_unresolved",
        },
      };
    }
    return {
      ...base,
      proposed: spec.proposed,
      verdict: spec.verdict === "positive_extent_and_grain_proposed"
        ? "positive_extent_and_grain_proposed"
        : "source_gap_blocked_extent_and_grain",
    };
  });

const candidateKeyHash = sortedHash(candidateSpecs.map((row) => row.candidate_key));
const positiveExtentAndGrain = candidateSpecs.filter((row) =>
  row.verdict === "positive_extent_and_grain_proposed"
);
const positiveExtentOnly = candidateSpecs.filter((row) =>
  row.verdict === "positive_extent_proposed_grain_blocked"
);
const blockedExtentAndGrain = candidateSpecs.filter((row) =>
  row.verdict === "source_gap_blocked_extent_and_grain"
);
const sourceGapCandidates = [
  ...positiveExtentOnly,
  ...blockedExtentAndGrain,
];
if (
  candidateSpecs.length !== PLAN040_PACKAGE_13_CANDIDATE_COUNT ||
  positiveExtentAndGrain.length !==
    PLAN040_PACKAGE_13_POSITIVE_EXTENT_AND_GRAIN_COUNT ||
  positiveExtentOnly.length !== PLAN040_PACKAGE_13_POSITIVE_EXTENT_ONLY_COUNT ||
  blockedExtentAndGrain.length !==
    PLAN040_PACKAGE_13_BLOCKED_EXTENT_AND_GRAIN_COUNT ||
  sourceGapCandidates.length !== PLAN040_PACKAGE_13_SOURCE_GAP_COUNT ||
  candidateKeyHash !== PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256 ||
  sortedHash(positiveExtentAndGrain.map((row) => row.candidate_key)) !==
    PLAN040_PACKAGE_13_POSITIVE_EXTENT_AND_GRAIN_KEY_SHA256 ||
  sortedHash(positiveExtentOnly.map((row) => row.candidate_key)) !==
    PLAN040_PACKAGE_13_POSITIVE_EXTENT_ONLY_KEY_SHA256 ||
  sortedHash(blockedExtentAndGrain.map((row) => row.candidate_key)) !==
    PLAN040_PACKAGE_13_BLOCKED_EXTENT_AND_GRAIN_KEY_SHA256 ||
  sortedHash(sourceGapCandidates.map((row) => row.candidate_key)) !==
    PLAN040_PACKAGE_13_SOURCE_GAP_KEY_SHA256
) {
  throw new Error("Package 13 frozen candidate partition drifted");
}

for (const [path, expected] of [
  ["raw/sources/mta_queens_bus_network_redesign_service_changes/source.html",
    SOURCE_PINS.service_change_html],
  ["raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
    SOURCE_PINS.service_change_blocks],
  ["data/canonical/routes.jsonl", SOURCE_PINS.routes],
  ["data/canonical/treatment_components.jsonl", SOURCE_PINS.treatments],
  ["data/exports/releases/v1-rc26/operational_occurrence_review_decisions.json",
    SOURCE_PINS.occurrence_export],
  ["raw/sources/mta_bus_schedules_2025_candidate_windows/receipt.json",
    SOURCE_PINS.schedule_receipt],
  ["raw/sources/mta_bus_schedules_2025_candidate_windows/blocks.jsonl",
    SOURCE_PINS.schedule_blocks],
  ["data/reference/operational/snapshots.json", SOURCE_PINS.snapshot_registry],
  ["raw/sources/gtfs_static_20250615_queens_pre_qbnr/receipt.json",
    SOURCE_PINS.queens_pre_receipt],
  ["raw/sources/gtfs_static_20250626_queens_post_qbnr/receipt.json",
    SOURCE_PINS.queens_post_receipt],
  ["raw/sources/gtfs_static_20250625_busco_pre_qbnr/receipt.json",
    SOURCE_PINS.busco_pre_receipt],
  ["raw/sources/gtfs_static_20250626_busco_post_qbnr/receipt.json",
    SOURCE_PINS.busco_post_receipt],
  ["data/quality/operational-reference/member-extent-ledger.jsonl",
    CHECKPOINT_PINS.extent_ledger],
  ["data/quality/operational-reference/member-grain-ledger.jsonl",
    CHECKPOINT_PINS.grain_ledger],
  ["data/quality/study-readiness/v1/bridge-ledger.jsonl",
    CHECKPOINT_PINS.bridge],
  ["data/quality/study-readiness/v1/manifest.json",
    CHECKPOINT_PINS.study_manifest],
  ["data/contracts/operational-occurrence-member-extent/v1/" +
    "operational_occurrence_member_extents.jsonl",
    CHECKPOINT_PINS.extent_contract],
  ["data/contracts/operational-occurrence-member-extent/v1/manifest.json",
    CHECKPOINT_PINS.extent_manifest],
] as const) assertPinned(path, expected);
for (const pin of Object.values(UPSTREAM_PINS)) {
  assertPinned(pin.path, pin.sha256);
}

type SourceBlock = {
  source_id: string;
  block_id: string;
  raw_text: string;
  raw_text_sha256: string;
};
type CanonicalRow = {
  record_id: string;
};
const sourceBlocks = readJsonl<SourceBlock>(join(
  repoRoot,
  "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
));
const blockById = new Map(sourceBlocks.map((row) => [row.block_id, row]));
const stopListContext = (spec: CandidateSpec): JsonValue | null => {
  const sourceId = spec.candidate_stop_list_source;
  if (!sourceId) return null;
  const blocksRelative = `raw/sources/${sourceId}/blocks.jsonl`;
  const blocksPath = join(repoRoot, blocksRelative);
  const rows = readJsonl<SourceBlock>(blocksPath);
  const byId = new Map(rows.map((row) => [row.block_id, row]));
  const refs = spec.proposed?.stop_list_refs ?? [];
  const exactRows = refs.map((ref) => {
    const [refSourceId, blockId] = ref.split("#");
    if (refSourceId !== sourceId || !blockId) {
      throw new Error(`${spec.treatment_record_id}: malformed stop-list ref ${ref}`);
    }
    const row = byId.get(blockId);
    if (!row) throw new Error(`${spec.treatment_record_id}: missing ${ref}`);
    if (row.raw_text_sha256 !== `sha256:${sha256(row.raw_text)}`) {
      throw new Error(`${ref}: block hash drifted`);
    }
    return {
      evidence_id: ref,
      block_row: row,
      block_row_sha256: rowSha256(row),
    };
  });
  return {
    source_id: sourceId,
    blocks_path: blocksRelative,
    blocks_sha256: sha256(readFileSync(blocksPath)),
    exact_referenced_rows: exactRows,
  };
};
const routeRows = readJsonl<CanonicalRow>(join(repoRoot, "data/canonical/routes.jsonl"));
const treatmentRows = readJsonl<CanonicalRow>(join(
  repoRoot,
  "data/canonical/treatment_components.jsonl",
));
const routeById = new Map(routeRows.map((row) => [row.record_id, row]));
const treatmentById = new Map(treatmentRows.map((row) => [row.record_id, row]));
const extentRows = readJsonl<MemberExtentLedgerRow>(join(
  repoRoot,
  "data/quality/operational-reference/member-extent-ledger.jsonl",
));
const grainRows = readJsonl<MemberGrainLedgerRow>(join(
  repoRoot,
  "data/quality/operational-reference/member-grain-ledger.jsonl",
));
const extentByTreatment = new Map(extentRows.map((row) =>
  [row.treatment_record_id, row]));
const grainByTreatment = new Map(grainRows.map((row) =>
  [row.treatment_record_id, row]));

type ScheduleSlice = {
  route_id: string;
  schedule_date: string;
  raw_line_sha256: string;
  row_count: number;
  trip_type_rows: Record<string, number>;
  trip_type_trip_starts: Record<string, number>;
  retained_passenger_trip_types: string[];
  excluded_nonrevenue_trip_types: ["2", "3", "4"];
  passenger_shape_ids: string[];
  excluded_shape_ids: string[];
  shape_rows: Array<{
    shape_id: string;
    trip_type: string;
    row_count: number;
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
    } else if (char !== "\r" && char !== "\n") cell += char;
  }
  if (cells.length < count) cells.push(cell);
  return cells;
};
const scanScheduleSlices = (): Map<string, ScheduleSlice> => {
  const targets = new Set(candidateSpecs.flatMap((row) =>
    row.dates ? [`${row.gtfs_route_id}\0${row.dates.post}`] : []
  ));
  const summaries = new Map<string, {
    hash: ReturnType<typeof createHash>;
    rows: number;
    types: Map<string, number>;
    starts: Map<string, number>;
    shapes: Map<string, { type: string; rows: number; starts: number }>;
  }>();
  const path = join(
    repoRoot,
    "raw/sources/mta_bus_schedules_2025_candidate_windows/source.csv",
  );
  const fileHash = createHash("sha256");
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  let carry = "";
  let firstLine = true;
  const accept = (line: string) => {
    if (firstLine) {
      firstLine = false;
      return;
    }
    const cells = csvCells(line, 10);
    const key = `${cells[8] ?? ""}\0${(cells[0] ?? "").slice(0, 10)}`;
    if (!targets.has(key)) return;
    const type = cells[7] ?? "";
    const shape = cells[6] ?? "";
    const summary = summaries.get(key) ?? {
      hash: createHash("sha256"),
      rows: 0,
      types: new Map(),
      starts: new Map(),
      shapes: new Map(),
    };
    summary.hash.update(`${line}\n`);
    summary.rows += 1;
    summary.types.set(type, (summary.types.get(type) ?? 0) + 1);
    const isStart = cells[9] === "1";
    if (isStart) summary.starts.set(type, (summary.starts.get(type) ?? 0) + 1);
    const shapeRow = summary.shapes.get(shape) ??
      { type, rows: 0, starts: 0 };
    if (shapeRow.type !== type) {
      throw new Error(`${key}/${shape}: shape spans multiple trip types`);
    }
    shapeRow.rows += 1;
    if (isStart) shapeRow.starts += 1;
    summary.shapes.set(shape, shapeRow);
    summaries.set(key, summary);
  };
  try {
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      const chunk = buffer.subarray(0, count);
      fileHash.update(chunk);
      const text = carry + chunk.toString("utf8");
      const lines = text.split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) accept(line.replace(/\r$/u, ""));
    }
    if (carry) accept(carry.replace(/\r$/u, ""));
  } finally {
    closeSync(descriptor);
  }
  const actualFileHash = fileHash.digest("hex");
  if (actualFileHash !== SOURCE_PINS.schedule_csv) {
    throw new Error(`schedule CSV drifted: ${actualFileHash}`);
  }
  return new Map([...targets].map((key) => {
    const [routeId, scheduleDate] = key.split("\0") as [string, string];
    const value = summaries.get(key);
    if (!value) {
      return [key, {
        route_id: routeId,
        schedule_date: scheduleDate,
        raw_line_sha256: sha256(""),
        row_count: 0,
        trip_type_rows: {},
        trip_type_trip_starts: {},
        retained_passenger_trip_types: [],
        excluded_nonrevenue_trip_types: ["2", "3", "4"],
        passenger_shape_ids: [],
        excluded_shape_ids: [],
        shape_rows: [],
      }];
    }
    const shapeRows = [...value.shapes].map(([shapeId, row]) => ({
      shape_id: shapeId,
      trip_type: row.type,
      row_count: row.rows,
      trip_start_count: row.starts,
    })).sort((left, right) => left.shape_id.localeCompare(right.shape_id));
    const excluded = new Set(["2", "3", "4"]);
    return [key, {
      route_id: routeId,
      schedule_date: scheduleDate,
      raw_line_sha256: value.hash.digest("hex"),
      row_count: value.rows,
      trip_type_rows: Object.fromEntries([...value.types].sort()),
      trip_type_trip_starts: Object.fromEntries([...value.starts].sort()),
      retained_passenger_trip_types:
        sorted([...value.types.keys()].filter((type) => !excluded.has(type))),
      excluded_nonrevenue_trip_types: ["2", "3", "4"],
      passenger_shape_ids:
        shapeRows.filter((row) => !excluded.has(row.trip_type))
          .map((row) => row.shape_id),
      excluded_shape_ids:
        shapeRows.filter((row) => excluded.has(row.trip_type))
          .map((row) => row.shape_id),
      shape_rows: shapeRows,
    }];
  }));
};
const scheduleSlices = scanScheduleSlices();

const registry = loadOperationalSnapshotRegistry();
const targetRoutes = new Set(candidateSpecs.flatMap((row) =>
  row.dates ? [row.gtfs_route_id] : []
));
const loadSnapshot = (snapshotId: string): GtfsStaticSnapshot =>
  loadGtfsStaticSnapshot(
    snapshotById(registry, snapshotId),
    ["calendar", "calendar_dates", "routes", "stops", "stop_times", "trips"],
    repoRoot,
    targetRoutes,
  );
const snapshots = {
  queens_pre: loadSnapshot("gtfs-static-20250615-queens-pre-qbnr"),
  busco_pre: loadSnapshot("gtfs-static-20250625-busco-pre-qbnr"),
  queens_post: loadSnapshot("gtfs-static-20250626-queens-post-qbnr"),
  busco_post: loadSnapshot("gtfs-static-20250626-busco-post-qbnr"),
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
  stop_chain_sha256:
    sha256(`${pattern.stops.map((stop) => stop.stop_id).join("\n")}\n`),
});
const patternIds = (patterns: readonly HistoricalFullStopPattern[]): string[] =>
  patterns.map((row) => row.pattern_id);
const selectPatterns = (
  spec: CandidateSpec,
  boundary: "pre" | "post",
): { snapshot: GtfsStaticSnapshot | null; patterns: HistoricalFullStopPattern[] } => {
  if (!spec.dates) return { snapshot: null, patterns: [] };
  const date = spec.dates[boundary];
  const choices = boundary === "pre"
    ? [snapshots.queens_pre, snapshots.busco_pre]
    : [snapshots.queens_post, snapshots.busco_post];
  const expected = boundary === "pre"
    ? spec.expected_pre_pattern_ids
    : spec.expected_post_pattern_ids;
  const candidates = choices.map((snapshot) => ({
    snapshot,
    patterns: fullStopPatternsForDate(snapshot, date, spec.gtfs_route_id),
  }));
  const exact = candidates.filter((row) =>
    stableJson(patternIds(row.patterns) as JsonValue) ===
      stableJson(expected as JsonValue)
  );
  if (exact.length !== 1) {
    if (expected.length === 0 && candidates.every((row) => row.patterns.length === 0)) {
      return { snapshot: null, patterns: [] };
    }
    throw new Error(
      `${spec.treatment_record_id}: ${boundary} pattern family selection drifted`,
    );
  }
  return exact[0]!;
};
const allComparisons = (
  before: HistoricalFullStopPattern[],
  after: HistoricalFullStopPattern[],
): HistoricalPatternComparison[] =>
  before.flatMap((left) =>
    after.map((right) => compareFullStopPatterns(left, right))
  ).sort((left, right) => left.comparison_id.localeCompare(right.comparison_id));

const serviceDateCompact = (date: string): string => date.replaceAll("-", "");
const weekdayIndex = (date: string): number =>
  (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const calendarExpansion = (
  snapshot: GtfsStaticSnapshot | null,
  date: string | null,
  routeId: string,
): JsonValue | null => {
  if (!snapshot || !date) return null;
  const compact = serviceDateCompact(date);
  const weekday = weekdayIndex(date);
  const base = snapshot.calendar.filter((row) =>
    compact >= row.start_date &&
    compact <= row.end_date &&
    row.weekdays[weekday]
  ).map((row) => row.service_id);
  const added = snapshot.calendar_dates.filter((row) =>
    row.date === compact && row.exception_type === "1"
  ).map((row) => row.service_id ?? "").filter(Boolean);
  const removed = snapshot.calendar_dates.filter((row) =>
    row.date === compact && row.exception_type === "2"
  ).map((row) => row.service_id ?? "").filter(Boolean);
  const active = new Set(base);
  for (const id of added) active.add(id);
  for (const id of removed) active.delete(id);
  const routeServiceIds = new Set(snapshot.trips.filter((trip) =>
    trip.route_id === routeId
  ).map((trip) => trip.service_id));
  return {
    snapshot_id: snapshot.snapshot.snapshot_id,
    service_date: date,
    date_role:
      "accepted_initial_launch_reference_calendar_plus_calendar_dates",
    weekday_index_monday_zero: weekday,
    calendar_base_route_service_ids:
      sorted(base.filter((id) => routeServiceIds.has(id))),
    calendar_dates_added_route_service_ids:
      sorted(added.filter((id) => routeServiceIds.has(id))),
    calendar_dates_removed_route_service_ids:
      sorted(removed.filter((id) => routeServiceIds.has(id))),
    active_route_service_ids:
      sorted([...active].filter((id) => routeServiceIds.has(id))),
    calendar_and_calendar_dates_expanded: true,
  };
};

type DecisionsFile = { decisions: MemberGrainDecision[] };
const p10dDecisions = readJson<DecisionsFile>(
  join(repoRoot, UPSTREAM_PINS.package_10d_grain.path),
).decisions;
const p9Decisions = readJson<DecisionsFile>(
  join(repoRoot, UPSTREAM_PINS.package_9_grain.path),
).decisions;
const reusedLineage = (spec: CandidateSpec): {
  source_package: string | null;
  source_decision_id: string | null;
  lineage_segments: MemberGrainLineageSegment[];
} => {
  const treatment = spec.treatment_record_id;
  const source = treatment === "treatment_q48-limited-stops-2025"
    ? p10dDecisions.find((row) =>
      row.treatment_record_id === "treatment_q48-glen-oaks-branch-2025")
    : treatment === "treatment_q75-limited-stops-2025"
    ? p10dDecisions.find((row) =>
      row.treatment_record_id === "treatment_q75-q30-short-trip-replacement-2025")
    : treatment === "treatment_qm63-midtown-stop-additions-2025"
    ? p9Decisions.find((row) =>
      row.treatment_record_id === "treatment_qm63-route-rename-2025")
    : undefined;
  return {
    source_package: source
      ? treatment.includes("qm63") ? "package_9" : "package_10d"
      : null,
    source_decision_id: source?.decision_id ?? null,
    lineage_segments: clone(source?.lineage_segments ?? []),
  };
};

type CandidateComparison = {
  candidate_key: string;
  treatment_record_id: string;
  source_statement: JsonValue;
  candidate_stop_list_context: JsonValue | null;
  accepted_date_evidence: JsonValue;
  schedule_validation: ScheduleSlice | null;
  pre_patterns: JsonValue[];
  post_patterns: JsonValue[];
  schedule_matched_post_pattern_ids: string[];
  component_containing_post_pattern_ids: string[];
  selected_comparison_ids: string[];
  comparisons: HistoricalPatternComparison[];
  exact_identifier_policy: string;
  changed_identifier_equivalence_authorized: false;
  reused_lineage: ReturnType<typeof reusedLineage>;
};
const componentContainingPatternIds = (
  spec: CandidateSpec,
  patterns: HistoricalFullStopPattern[],
  matchedPatternIds: string[],
): string[] => {
  if (spec.proposed?.extent !== "stop_set") return matchedPatternIds;
  const componentIds = new Set(spec.proposed.component_ids ?? []);
  return matchedPatternIds.filter((patternId) => {
    const pattern = patterns.find((row) => row.pattern_id === patternId);
    return pattern?.stops.some((stop) => componentIds.has(stop.stop_id)) ??
      false;
  });
};
const candidateComparisons: CandidateComparison[] = candidateSpecs.map((spec) => {
  const block = blockById.get(spec.block_id);
  if (!block || !block.raw_text.includes(spec.quote)) {
    throw new Error(`${spec.treatment_record_id}: exact source statement missing`);
  }
  if (block.raw_text_sha256 !== `sha256:${sha256(block.raw_text)}`) {
    throw new Error(`${spec.block_id}: source block hash drifted`);
  }
  const pre = selectPatterns(spec, "pre");
  const post = selectPatterns(spec, "post");
  const schedule = spec.dates
    ? scheduleSlices.get(`${spec.gtfs_route_id}\0${spec.dates.post}`) ?? null
    : null;
  if (
    schedule &&
    stableJson(schedule.passenger_shape_ids as JsonValue) !==
      stableJson(spec.expected_schedule_passenger_shapes as JsonValue)
  ) {
    throw new Error(`${spec.treatment_record_id}: passenger schedule shapes drifted`);
  }
  const matched = post.patterns.filter((pattern) =>
    pattern.shape_ids.some((shape) => schedule?.passenger_shape_ids.includes(shape))
  );
  if (
    stableJson(patternIds(matched) as JsonValue) !==
      stableJson(spec.expected_matched_post_pattern_ids as JsonValue)
  ) {
    throw new Error(`${spec.treatment_record_id}: schedule-matched patterns drifted`);
  }
  const completeComparisons = allComparisons(pre.patterns, post.patterns);
  const comparisonById = new Map(completeComparisons.map((row) =>
    [row.comparison_id, row]));
  const selectedComparisons = spec.expected_comparison_ids.map((id) =>
    comparisonById.get(id)
  );
  if (selectedComparisons.some((row) => !row)) {
    throw new Error(
      `${spec.treatment_record_id}: selected comparison is absent from the ` +
        "independently rederived complete comparison inventory",
    );
  }
  return {
    candidate_key: spec.candidate_key,
    treatment_record_id: spec.treatment_record_id,
    source_statement: {
      source_id: block.source_id,
      block_id: block.block_id,
      evidence_id: `${block.source_id}#${block.block_id}`,
      quote: spec.quote,
      full_block: block.raw_text,
      full_block_sha256: block.raw_text_sha256,
    },
    candidate_stop_list_context: stopListContext(spec),
    accepted_date_evidence: spec.dates ? {
      pre: calendarExpansion(pre.snapshot, spec.dates.pre, spec.gtfs_route_id),
      post: calendarExpansion(post.snapshot, spec.dates.post, spec.gtfs_route_id),
      accepted_initial_post_only: true,
      corrected_first_week_bytes_used: false,
    } : {
      pre: null,
      post: null,
      accepted_initial_post_only: true,
      corrected_first_week_bytes_used: false,
      outside_accepted_window: true,
    },
    schedule_validation: schedule,
    pre_patterns: pre.patterns.map((row) =>
      patternInventory(row) as unknown as JsonValue),
    post_patterns: post.patterns.map((row) =>
      patternInventory(row) as unknown as JsonValue),
    schedule_matched_post_pattern_ids: patternIds(matched),
    component_containing_post_pattern_ids: componentContainingPatternIds(
      spec,
      post.patterns,
      patternIds(matched),
    ),
    selected_comparison_ids: selectedComparisons.map((row) => row!.comparison_id),
    comparisons: completeComparisons,
    exact_identifier_policy:
      "identical_gtfs_stop_id_only_no_name_coordinate_or_proximity_equivalence",
    changed_identifier_equivalence_authorized: false,
    reused_lineage: reusedLineage(spec),
  };
});
const comparisonByKey = new Map(candidateComparisons.map((row) =>
  [row.candidate_key, row]));
const selectedPatternIds = (
  spec: CandidateSpec,
  comparison: CandidateComparison,
): string[] => {
  const componentContaining = comparison.component_containing_post_pattern_ids;
  if (spec.treatment_record_id ===
      "treatment_qm63-midtown-stop-additions-2025") {
    return componentContaining.filter((id) => {
      const pattern = comparison.post_patterns.find((row) =>
        (row as { pattern_id: string }).pattern_id === id
      ) as { direction_id: string } | undefined;
      return pattern?.direction_id === "1";
    });
  }
  const scope = spec.proposed?.scope ?? "";
  const direction = scope.includes("direction_0") ? "0"
    : scope.includes("direction_1") ? "1"
    : null;
  return componentContaining.filter((id) => {
    if (!direction) return true;
    const pattern = comparison.post_patterns.find((row) =>
      (row as { pattern_id: string }).pattern_id === id
    ) as { direction_id: string } | undefined;
    return pattern?.direction_id === direction;
  });
};
for (const spec of candidateSpecs) {
  const comparison = comparisonByKey.get(spec.candidate_key)!;
  const selectedPatterns = new Set(selectedPatternIds(spec, comparison));
  const comparisonsById = new Map(comparison.comparisons.map((row) =>
    [row.comparison_id, row]));
  for (const comparisonId of comparison.selected_comparison_ids) {
    const selectedComparison = comparisonsById.get(comparisonId);
    if (
      !selectedComparison ||
      !selectedPatterns.has(selectedComparison.after_pattern_id)
    ) {
      throw new Error(
        `${spec.treatment_record_id}: selected comparison ${comparisonId} ` +
          "is not bound to a selected component-containing post pattern",
      );
    }
  }
}

const comparisonReceiptBody = {
  schema_version: 1,
  receipt_id:
    "plan-040-qbnr-bus-stop-package-13-full-stop-comparisons-v1",
  source_id:
    "plan_040_qbnr_bus_stop_package_13_full_stop_comparisons",
  package_id: PLAN040_QBNR_BUS_STOP_PACKAGE_13,
  derivation: {
    candidate_specific: true,
    accepted_calendar_and_calendar_dates_expanded: true,
    complete_ordered_stop_chains: true,
    comparison_inventory: "all_candidate_pre_post_pattern_pairs",
    stop_set_pattern_scope_policy:
      "each proposed grain pattern must contain at least one authorized component stop_id",
    selected_comparison_binding_policy:
      "each selected comparison after_pattern_id is a selected component-containing post pattern",
    schedule_passenger_policy: "any_trip_type_except_2_3_4",
    excluded_nonrevenue_trip_types: ["2", "3", "4"],
    exact_identifier_policy:
      "identical_gtfs_stop_id_only_no_name_coordinate_or_proximity_equivalence",
    changed_identifier_equivalence_authorized: false,
  },
  candidates: candidateComparisons,
  source_pins: SOURCE_PINS,
  upstream_pins: UPSTREAM_PINS,
  replay_derived: true,
  normal_file_verified: true,
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
} satisfies JsonValue;
writeImmutableNormalFile(
  join(repoRoot, comparisonRelative),
  comparisonReceiptBody,
);
const comparisonReceipt: Plan040Package13ReceiptRef = {
  path: comparisonRelative,
  sha256: sha256(stableBytes(comparisonReceiptBody)),
  receipt_id:
    "plan-040-qbnr-bus-stop-package-13-full-stop-comparisons-v1",
  source_id:
    "plan_040_qbnr_bus_stop_package_13_full_stop_comparisons",
  normal_file_verified: true,
  replay_derived: true,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
if (comparisonReceipt.sha256 !==
    PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256) {
  throw new Error("Package 13 comparison receipt hash drifted");
}

const blockedUpstreamReason = (spec: CandidateSpec): string =>
  sorted(spec.source_gap_codes).join("+");
const sourceGapEntries = sourceGapCandidates.map((spec) => {
  const blockedSurfaces = spec.verdict ===
      "positive_extent_proposed_grain_blocked"
    ? ["member_grain"]
    : ["member_extent", "member_grain"];
  const blockedReason = blockedUpstreamReason(spec);
  return {
    candidate_key: spec.candidate_key,
    occurrence_id: spec.occurrence_id,
    route_record_id: spec.route_record_id,
    treatment_record_id: spec.treatment_record_id,
    contract: "member-evidence-source-gap-block-receipt-v1",
    blocked_surfaces: blockedSurfaces,
    resolved_surfaces: spec.verdict ===
        "positive_extent_proposed_grain_blocked"
      ? ["member_extent"]
      : [],
    semantic_verdict: "blocked_upstream",
    prospective_ledger_handling: Object.fromEntries(
      blockedSurfaces.map((surface) =>
        [surface, `blocked_upstream:${blockedReason}`]
      ),
    ),
    absence_projection_prohibited_for_unresolved_grain: true,
    source_statement_present: true,
    literal_exact_absence: false,
    gap_codes: spec.source_gap_codes,
    source_statement_evidence_id:
      `mta_queens_bus_network_redesign_service_changes#${spec.block_id}`,
    comparison_receipt_anchor:
      `${comparisonReceipt.source_id}#candidate=${spec.candidate_key}`,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
});
const sourceGapReceiptBody = {
  schema_version: 1,
  receipt_id: "plan-040-qbnr-bus-stop-package-13-source-gap-blocks-v1",
  source_id: "plan_040_qbnr_bus_stop_package_13_source_gap_blocks",
  package_id: PLAN040_QBNR_BUS_STOP_PACKAGE_13,
  candidate_count: sourceGapEntries.length,
  candidate_key_sha256:
    sortedHash(sourceGapEntries.map((row) => row.candidate_key)),
  exact_absence_count: PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT,
  contract_semantics:
    "candidate-specific source gap blocks authority without claiming source absence",
  absence_projection_prohibited_for_unresolved_grain: true,
  prospective_ledger_prefix: "blocked_upstream:",
  prospective_ledger_reason_policy: "sorted_unique_gap_codes",
  candidates: sourceGapEntries,
  comparison_receipt: comparisonReceipt,
  replay_derived: true,
  normal_file_verified: true,
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
} satisfies JsonValue;
writeImmutableNormalFile(
  join(repoRoot, sourceGapRelative),
  sourceGapReceiptBody,
);
const sourceGapReceipt: Plan040Package13ReceiptRef = {
  path: sourceGapRelative,
  sha256: sha256(stableBytes(sourceGapReceiptBody)),
  receipt_id: "plan-040-qbnr-bus-stop-package-13-source-gap-blocks-v1",
  source_id: "plan_040_qbnr_bus_stop_package_13_source_gap_blocks",
  normal_file_verified: true,
  replay_derived: true,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
if (sourceGapReceipt.sha256 !== PLAN040_PACKAGE_13_SOURCE_GAP_RECEIPT_SHA256) {
  throw new Error("Package 13 source-gap receipt hash drifted");
}

const decisionFiles = readdirSync(join(
  repoRoot,
  "data/operational-occurrence-review/accepted/decisions",
)).filter((name) => name.endsWith(".json"));
const occurrenceDecisions = new Map(decisionFiles.map((name) => {
  const path = join(
    repoRoot,
    "data/operational-occurrence-review/accepted/decisions",
    name,
  );
  const value = readJson<{ occurrence_id: string }>(path);
  return [value.occurrence_id, {
    path: relative(repoRoot, path),
    sha256: sha256(readFileSync(path)),
    value,
  }];
}));
const binding = (
  spec: CandidateSpec,
  role: string,
  sourceId: string,
  evidenceId: string,
): ExactEvidenceBinding => ({
  role,
  record_id: spec.treatment_record_id,
  source_id: sourceId,
  evidence_id: evidenceId,
});
const sortedBindings = (
  bindings: ExactEvidenceBinding[],
): ExactEvidenceBinding[] =>
  bindings.sort((left, right) =>
    [left.role, left.record_id, left.source_id, left.evidence_id].join("\0")
      .localeCompare(
        [right.role, right.record_id, right.source_id, right.evidence_id]
          .join("\0"),
      )
  );
const buildExtent = (
  spec: CandidateSpec,
  bindings: ExactEvidenceBinding[],
): MemberExtentDecision => {
  const proposed = spec.proposed!;
  const identifiers = proposed.extent === "stop_set"
    ? sorted(proposed.component_ids ?? [])
    : [proposed.component ?? ""];
  return {
    decision_id:
      `member-extent-review:plan040-package13-${spec.treatment_record_id}`,
    occurrence_id: spec.occurrence_id,
    route_record_id: spec.route_record_id,
    treatment_record_id: spec.treatment_record_id,
    resolution: proposed.extent,
    components: [{
      component_kind: proposed.extent === "stop_set" ? "stop" : "segment",
      identity_namespace: "source_literal_v1",
      identifiers,
      description: proposed.extent === "stop_set"
        ? "Exact candidate-bound GTFS stop identifiers from the named stop-list evidence."
        : `Exact source-named treatment segment: ${proposed.component}`,
    }],
    evidence_bindings: bindings,
    missing_roles: [],
    rationale: spec.verdict === "positive_extent_proposed_grain_blocked"
      ? "The exact source literal identifies the bounded treatment segment. " +
        "This spatial proposal does not resolve the blocked service grain."
      : "The proposal is limited to the exact source statement, accepted " +
        "initial-launch calendar expansion, passenger schedule slice, and " +
        "candidate-specific ordered full-stop evidence. Changed identifiers " +
        "remain unresolved.",
    reviewed_at: "1970-01-01T00:00:00Z",
    reviewed_by: "pending-plan-040-package-13-dual-independent-review",
  };
};
const buildGrain = (
  spec: CandidateSpec,
  comparison: CandidateComparison,
  extentDecision: MemberExtentDecision,
  bindings: ExactEvidenceBinding[],
): MemberGrainDecision => {
  const selectedIds = selectedPatternIds(spec, comparison);
  const patterns = comparison.post_patterns.filter((row) =>
    selectedIds.includes((row as { pattern_id: string }).pattern_id)
  ) as unknown as Array<{
    pattern_id: string;
    direction_id: string;
    period_trip_counts: Array<{ period: string }>;
  }>;
  return {
    schema_version: 1,
    contract_id: "member-grain-decision-v1",
    decision_id:
      `member-grain-review:plan040-package13-${spec.treatment_record_id}`,
    occurrence_id: spec.occurrence_id,
    route_record_id: spec.route_record_id,
    gtfs_route_id: spec.gtfs_route_id,
    treatment_record_id: spec.treatment_record_id,
    member_extent_decision_id: extentDecision.decision_id,
    service_scope: {
      kind: "trip_subset",
      periods: sorted(patterns.flatMap((row) =>
        row.period_trip_counts.map((period) => period.period)
      )),
      directions: sorted(patterns.map((row) => row.direction_id)),
      pattern_ids: sorted(selectedIds),
      description:
        `Exact candidate scope ${spec.proposed!.scope}; no unlisted trip, ` +
        "direction, period, or pattern is inferred.",
    },
    lineage_segments: comparison.reused_lineage.lineage_segments,
    evidence_bindings: bindings,
    rationale:
      "Trip grain is structured from exact accepted post patterns that match the " +
      "passenger schedule after excluding trip types 2, 3, and 4. Any reused lineage " +
      "is copied from the named immutable reviewed package only.",
    reviewed_at: "1970-01-01T00:00:00Z",
    reviewed_by: "pending-plan-040-package-13-dual-independent-review",
  };
};
const buildBlockedGrain = (
  spec: CandidateSpec,
  extentDecision: MemberExtentDecision,
  bindings: ExactEvidenceBinding[],
): MemberGrainDecision => ({
  schema_version: 1,
  contract_id: "member-grain-decision-v1",
  decision_id:
    `member-grain-review:plan040-package13-${spec.treatment_record_id}`,
  occurrence_id: spec.occurrence_id,
  route_record_id: spec.route_record_id,
  gtfs_route_id: spec.gtfs_route_id,
  treatment_record_id: spec.treatment_record_id,
  member_extent_decision_id: extentDecision.decision_id,
  service_scope: {
    kind: "unresolved",
    missing_roles: sorted(spec.source_gap_codes),
  },
  lineage_segments: [],
  evidence_bindings: bindings,
  rationale:
    "Candidate validation inputs remain incomplete. No service modality is asserted.",
  reviewed_at: "1970-01-01T00:00:00Z",
  reviewed_by: "pending-plan-040-package-13-dual-independent-review",
});

const candidates: Plan040Package13CandidateEvidence[] =
  candidateSpecs.map((spec) => {
    const comparison = comparisonByKey.get(spec.candidate_key)!;
    const route = routeById.get(spec.route_record_id);
    const treatment = treatmentById.get(spec.treatment_record_id);
    const extent = extentByTreatment.get(spec.treatment_record_id);
    const grain = grainByTreatment.get(spec.treatment_record_id);
    const occurrence = occurrenceDecisions.get(spec.occurrence_id);
    if (!route || !treatment || !extent || !grain || !occurrence) {
      throw new Error(`${spec.treatment_record_id}: immutable current row missing`);
    }
    if (occurrence.path !== spec.occurrence_decision_path) {
      throw new Error(`${spec.treatment_record_id}: occurrence decision path drifted`);
    }
    const exactBindings = sortedBindings([
      binding(
        spec,
        "candidate_source_statement",
        "mta_queens_bus_network_redesign_service_changes",
        `mta_queens_bus_network_redesign_service_changes#${spec.block_id}`,
      ),
      binding(
        spec,
        "candidate_full_stop_comparison_receipt",
        comparisonReceipt.source_id,
        `${comparisonReceipt.source_id}#candidate=${spec.candidate_key}`,
      ),
      ...(spec.dates ? [binding(
        spec,
        "candidate_schedule_slice_excluding_trip_types_2_3_4",
        "mta_bus_schedules_2025_candidate_windows",
        `mta_bus_schedules_2025_candidate_windows#date=${spec.dates.post}` +
          `&route=${spec.gtfs_route_id}`,
      )] : []),
      ...((spec.proposed?.stop_list_refs ?? []).map((ref) => {
        const [sourceId] = ref.split("#");
        return binding(spec, "candidate_stop_list_row", sourceId!, ref);
      })),
      ...(comparison.reused_lineage.source_decision_id ? [binding(
        spec,
        "immutable_reviewed_lineage_reuse",
        comparison.reused_lineage.source_package!,
        comparison.reused_lineage.source_decision_id,
      )] : []),
      ...(spec.verdict !== "positive_extent_and_grain_proposed"
        ? [binding(
          spec,
          "candidate_source_gap_block_receipt",
          sourceGapReceipt.source_id,
          `${sourceGapReceipt.source_id}#candidate=${spec.candidate_key}`,
        )]
        : []),
    ]);
    let proposedExtent: MemberExtentDecision | null = null;
    let proposedGrain: MemberGrainDecision | null = null;
    if (spec.verdict === "positive_extent_and_grain_proposed") {
      proposedExtent = buildExtent(spec, exactBindings);
      proposedGrain = buildGrain(
        spec,
        comparison,
        proposedExtent,
        exactBindings,
      );
    } else if (
      spec.verdict === "positive_extent_proposed_grain_blocked"
    ) {
      proposedExtent = buildExtent(spec, exactBindings);
      proposedGrain = buildBlockedGrain(
        spec,
        proposedExtent,
        exactBindings,
      );
    }
    return {
      candidate_key: spec.candidate_key,
      gtfs_route_id: spec.gtfs_route_id,
      occurrence_id: spec.occurrence_id,
      route_record_id: spec.route_record_id,
      treatment_record_id: spec.treatment_record_id,
      treatment_family: "bus_stop_or_boarding",
      evidence_verdict: spec.verdict,
      source_statement: comparison.source_statement,
      immutable_rows: {
        extent_ledger_row: extent,
        extent_ledger_row_sha256: rowSha256(extent),
        grain_ledger_row: grain,
        grain_ledger_row_sha256: rowSha256(grain),
        canonical_route_row: route,
        canonical_route_row_sha256: rowSha256(route),
        canonical_treatment_row: treatment,
        canonical_treatment_row_sha256: rowSha256(treatment),
        occurrence_decision_path: occurrence.path,
        occurrence_decision_sha256: occurrence.sha256,
        occurrence_decision: occurrence.value,
      },
      comparison_evidence: {
        receipt: comparisonReceipt,
        candidate_anchor:
          `${comparisonReceipt.source_id}#candidate=${spec.candidate_key}`,
        schedule_matched_post_pattern_ids:
          comparison.schedule_matched_post_pattern_ids,
        selected_comparison_ids: comparison.selected_comparison_ids,
        reused_lineage: comparison.reused_lineage,
      },
      source_gap_block_receipt: spec.verdict !==
          "positive_extent_and_grain_proposed"
        ? {
          receipt: sourceGapReceipt,
          candidate_anchor:
            `${sourceGapReceipt.source_id}#candidate=${spec.candidate_key}`,
          semantic_verdict: "blocked_upstream",
          prospective_ledger_handling:
            `blocked_upstream:${blockedUpstreamReason(spec)}`,
          absence_projection_prohibited_for_unresolved_grain: true,
          literal_exact_absence: false,
          gap_codes: spec.source_gap_codes,
        }
        : null,
      preserved_scope_gap: spec.proposed?.preserved_gap ?? null,
      proposed_extent_decision: proposedExtent,
      proposed_grain_decision: proposedGrain,
      persisted_extent_decision: null,
      persisted_grain_decision: null,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_decision_persistence: false,
    };
  });

const candidateKeys = new Set(candidates.map((row) => row.candidate_key));
const candidateOccurrences = new Set(candidates.map((row) => row.occurrence_id));
const preservedSiblings: Plan040Package13PreservedSibling[] = extentRows
  .filter((row) => {
    const key =
      `${row.occurrence_id}\0${row.route_record_id}\0${row.treatment_record_id}`;
    return candidateOccurrences.has(row.occurrence_id) &&
      !candidateKeys.has(key) && row.verdict !== "unreviewed";
  }).map((extent) => {
    const grain = grainByTreatment.get(extent.treatment_record_id);
    if (!grain) throw new Error(`${extent.treatment_record_id}: sibling grain missing`);
    return {
      candidate_key:
        `${extent.occurrence_id}\0${extent.route_record_id}\0` +
        extent.treatment_record_id,
      extent_row: extent as unknown as JsonValue,
      extent_row_sha256: rowSha256(extent),
      grain_row: grain as unknown as JsonValue,
      grain_row_sha256: rowSha256(grain),
    };
  }).sort((left, right) => left.candidate_key.localeCompare(right.candidate_key));
const exclusionRows = extentRows.filter((row) => {
  const key =
    `${row.occurrence_id}\0${row.route_record_id}\0${row.treatment_record_id}`;
  if (candidateKeys.has(key) || row.verdict !== "unreviewed") return false;
  return row.treatment_family === "bus_stop_or_boarding" ||
    candidateOccurrences.has(row.occurrence_id);
});
const exclusions: Plan040Package13Exclusion[] = exclusionRows.map((extent) => {
  const grain = grainByTreatment.get(extent.treatment_record_id);
  if (!grain) throw new Error(`${extent.treatment_record_id}: exclusion grain missing`);
  return {
    candidate_key:
      `${extent.occurrence_id}\0${extent.route_record_id}\0` +
      extent.treatment_record_id,
    reason: extent.treatment_family === "bus_stop_or_boarding"
      ? "remaining_unreviewed_bus_stop_or_boarding_outside_package"
      : "unreviewed_same_occurrence_non_bus_stop_sibling",
    extent_row: extent as unknown as JsonValue,
    extent_row_sha256: rowSha256(extent),
    grain_row: grain as unknown as JsonValue,
    grain_row_sha256: rowSha256(grain),
  };
}).sort((left, right) => left.candidate_key.localeCompare(right.candidate_key));
if (
  preservedSiblings.length !== PLAN040_PACKAGE_13_SIBLING_COUNT ||
  exclusions.length !== PLAN040_PACKAGE_13_EXCLUSION_COUNT
) {
  throw new Error(
    `Package 13 sibling/exclusion drift: ${preservedSiblings.length}/` +
      exclusions.length,
  );
}

const package10a = readJson<{ version_separation: JsonValue }>(join(
  riskRoot,
  "plan-040-qbnr-service-pattern-package-10a-evidence-v1.json",
));
const evidence = {
  schema_version: 1,
  manifest_id: "plan-040-qbnr-bus-stop-package-13-evidence-freeze-v1",
  package_id: PLAN040_QBNR_BUS_STOP_PACKAGE_13,
  candidate_count: candidates.length,
  positive_extent_and_grain_count: positiveExtentAndGrain.length,
  positive_extent_only_blocked_grain_count: positiveExtentOnly.length,
  blocked_extent_and_grain_count: blockedExtentAndGrain.length,
  source_gap_block_receipt_count: sourceGapCandidates.length,
  exact_absence_count: PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT,
  candidate_key_sha256: PLAN040_PACKAGE_13_CANDIDATE_KEY_SHA256,
  positive_extent_and_grain_key_sha256:
    PLAN040_PACKAGE_13_POSITIVE_EXTENT_AND_GRAIN_KEY_SHA256,
  positive_extent_only_key_sha256:
    PLAN040_PACKAGE_13_POSITIVE_EXTENT_ONLY_KEY_SHA256,
  blocked_extent_and_grain_key_sha256:
    PLAN040_PACKAGE_13_BLOCKED_EXTENT_AND_GRAIN_KEY_SHA256,
  source_gap_key_sha256: PLAN040_PACKAGE_13_SOURCE_GAP_KEY_SHA256,
  candidate_specs: candidateSpecs,
  immutable_inputs: {
    initial_scope_provenance: INITIAL_SCOPE_PROVENANCE,
    checkpoint_pins: CHECKPOINT_PINS,
    source_pins: SOURCE_PINS,
    upstream_pins: UPSTREAM_PINS,
  },
  comparison_receipt: comparisonReceipt,
  source_gap_block_receipt: sourceGapReceipt,
  candidates,
  preserved_sibling_count: preservedSiblings.length,
  preserved_sibling_key_sha256:
    sortedHash(preservedSiblings.map((row) => row.candidate_key)),
  preserved_siblings: preservedSiblings,
  exclusion_count: exclusions.length,
  exclusion_key_sha256: sortedHash(exclusions.map((row) => row.candidate_key)),
  exclusions,
  version_separation: package10a.version_separation,
  review_protocol: {
    review_mode: "dual_independent_candidate_specific_extent_and_grain_review",
    dual_independent_review_required: true,
    dual_review_follows_separately: true,
  },
  proposed_extent_decision_count:
    positiveExtentAndGrain.length + positiveExtentOnly.length,
  proposed_positive_grain_decision_count: positiveExtentAndGrain.length,
  proposed_blocked_grain_decision_count: positiveExtentOnly.length,
  persisted_extent_decision_count: 0,
  persisted_grain_decision_count: 0,
  gate_created: false,
  owner_acceptance_created: false,
  persistence_performed: false,
  authorization_state:
    "evidence_freeze_pending_dual_independent_review_no_gate_no_acceptance_no_persistence",
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
validatePlan040Package13Evidence(evidence);
writeStable(evidencePath, evidence as unknown as JsonValue);
const evidenceSha256 = sha256(readFileSync(evidencePath));
const draft = buildPlan040Package13Draft({
  evidenceManifestPath: evidenceRelative,
  evidenceManifestSha256: evidenceSha256,
  candidates,
  preservedSiblings,
  exclusions,
  comparisonReceipt,
  sourceGapReceipt,
});
writeStable(join(repoRoot, draftRelative), draft);

process.stdout.write(`${stableJson({
  package_id: PLAN040_QBNR_BUS_STOP_PACKAGE_13,
  candidate_count: candidates.length,
  positive_extent_and_grain_count: positiveExtentAndGrain.length,
  positive_extent_only_blocked_grain_count: positiveExtentOnly.length,
  blocked_extent_and_grain_count: blockedExtentAndGrain.length,
  source_gap_block_count: sourceGapCandidates.length,
  exact_absence_count: PLAN040_PACKAGE_13_EXACT_ABSENCE_COUNT,
  preserved_sibling_count: preservedSiblings.length,
  exclusion_count: exclusions.length,
  comparison_receipt_path: comparisonRelative,
  comparison_receipt_sha256: comparisonReceipt.sha256,
  source_gap_receipt_path: sourceGapRelative,
  source_gap_receipt_sha256: sourceGapReceipt.sha256,
  evidence_path: evidenceRelative,
  evidence_sha256: evidenceSha256,
  draft_path: draftRelative,
  draft_sha256: sha256(readFileSync(join(repoRoot, draftRelative))),
  replay_mode: checkOnly ? "check" : "write",
} as JsonValue)}\n`);
