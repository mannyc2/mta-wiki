import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { repoRoot } from "../packages/core/src/paths";
import { parseCsv } from "../packages/db/src/import-gtfs";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  buildPlan040QbnrStopRemovalAcquisitionManifest,
  type Plan040Q67ScheduleSensitivityReceipt,
  plan040QbnrAcquisitionReplayHash,
} from "../packages/pipeline/src/quality/plan040-qbnr-stop-removal-acquisition";

const outputPath = resolve(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-stop-removal-acquisition-manifest-v1.json",
);
const scheduleSensitivityPath = resolve(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-schedule-trip-type-sensitivity-v1.json",
);
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const snapshot = (sourceId: string) => {
  const base = `raw/sources/${sourceId}`;
  return {
    receiptJson: read(`${base}/receipt.json`),
    tripsCsv: read(`${base}/extracted/trips.txt`),
    calendarCsv: read(`${base}/extracted/calendar.txt`),
    calendarDatesCsv: read(`${base}/extracted/calendar_dates.txt`),
  };
};
const scheduleBase = "raw/sources/mta_bus_schedules_2025_candidate_windows";
const scheduleMetadataJson = read(`${scheduleBase}/metadata.json`);
const scheduleAcquisitionReceiptJson = read(`${scheduleBase}/receipt.json`);
const scheduleSourcePath = resolve(repoRoot, scheduleBase, "source.csv");
const scheduleX64Base = "raw/sources/mta_bus_schedules_2025_x64_predecessor_2026_07_23";
const scheduleX64MetadataJson = read(`${scheduleX64Base}/metadata.json`);
const scheduleX64AcquisitionReceiptJson = read(`${scheduleX64Base}/receipt.json`);
const scheduleX64SourcePath = resolve(repoRoot, scheduleX64Base, "source.csv");

type SliceSpec = {
  scheduleDate: string;
  routeId: string;
  operator: "NYCT" | "MTA Bus";
  passengerTripType: "1" | "12" | "13";
  selectedShapes: Record<string, number>;
};

const mainSliceSpecs: SliceSpec[] = [
  {
    scheduleDate: "2025-06-30T00:00:00.000",
    routeId: "Q67",
    operator: "NYCT",
    passengerTripType: "1",
    selectedShapes: {},
  },
  {
    scheduleDate: "2025-06-30T00:00:00.000",
    routeId: "Q61",
    operator: "NYCT",
    passengerTripType: "12",
    selectedShapes: { Q610025: 430, Q610024: 332 },
  },
  {
    scheduleDate: "2025-06-27T00:00:00.000",
    routeId: "QM44",
    operator: "MTA Bus",
    passengerTripType: "13",
    selectedShapes: { QM440063: 16, QM440062: 35 },
  },
  {
    scheduleDate: "2025-06-30T00:00:00.000",
    routeId: "QM44",
    operator: "MTA Bus",
    passengerTripType: "13",
    selectedShapes: { QM440060: 16, QM440064: 30 },
  },
  {
    scheduleDate: "2025-06-30T00:00:00.000",
    routeId: "QM64",
    operator: "NYCT",
    passengerTripType: "13",
    selectedShapes: { QM640035: 36, QM640034: 56 },
  },
];
const x64SliceSpecs: SliceSpec[] = [{
  scheduleDate: "2025-06-27T00:00:00.000",
  routeId: "X64",
  operator: "NYCT",
  passengerTripType: "13",
  selectedShapes: { X640016: 36, X640017: 48 },
}];

async function scanScheduleSource(input: {
  sourceId: string;
  sourcePath: string;
  acquisitionReceiptJson: string;
  specs: SliceSpec[];
}) {
  const hash = createHash("sha256");
  const stream = createReadStream(input.sourcePath);
  stream.on("data", (chunk) => hash.update(chunk));
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let sourceRowCount = 0;
  let headerSeen = false;
  let header: string[] = [];
  const accumulators = new Map(input.specs.map((spec) => [
    `${spec.scheduleDate}\u0000${spec.routeId}`,
    {
      spec,
      tripTypes: new Map<string, number>(),
      selectedShapeTypes: new Map<string, Map<string, number>>(),
      nonrevenueShapes: new Set<string>(),
      nonrevenuePassengerHeadsignRows: 0,
      operators: new Set<string>(),
    },
  ]));
  for await (const line of lines) {
    if (!headerSeen) {
      if (!line.startsWith(
        "schedule_date,day_type,borough,operator,service_id,direction,shape_id,trip_type,route_id,",
      )) {
        throw new Error("Q67 schedule sensitivity source header drifted");
      }
      header = parseCsv(`${line}\n`)[0]!;
      headerSeen = true;
      continue;
    }
    if (line.length === 0) continue;
    sourceRowCount += 1;
    const firstFields = line.split(",", 9);
    const accumulator = accumulators.get(`${firstFields[0]}\u0000${firstFields[8]}`);
    if (!accumulator) continue;
    const cells = parseCsv(`${line}\n`)[0]!;
    const row = Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]));
    const tripType = row.trip_type!;
    const shapeId = row.shape_id!;
    accumulator.operators.add(row.operator!);
    accumulator.tripTypes.set(tripType, (accumulator.tripTypes.get(tripType) ?? 0) + 1);
    if (["2", "3", "4"].includes(tripType)) {
      accumulator.nonrevenueShapes.add(shapeId);
      if (!/(?:NOT\s+IN\s+SERVICE|DEADHEAD)/iu.test(row.trip_headsign ?? "")) {
        accumulator.nonrevenuePassengerHeadsignRows += 1;
      }
    }
    if (Object.hasOwn(accumulator.spec.selectedShapes, shapeId)) {
      const types = accumulator.selectedShapeTypes.get(shapeId) ?? new Map<string, number>();
      types.set(tripType, (types.get(tripType) ?? 0) + 1);
      accumulator.selectedShapeTypes.set(shapeId, types);
    }
  }
  const sourceCsvSha256 = hash.digest("hex");
  const slices = [...accumulators.values()].map((accumulator) => {
    if (
      accumulator.operators.size !== 1 ||
      !accumulator.operators.has(accumulator.spec.operator)
    ) {
      throw new Error(`${accumulator.spec.routeId}: expected exact schedule operator`);
    }
    const selectedShapes = Object.entries(accumulator.spec.selectedShapes).map(
      ([shapeId, expectedCount]) => {
        const types = accumulator.selectedShapeTypes.get(shapeId);
        if (
          !types ||
          types.size !== 1 ||
          types.get(accumulator.spec.passengerTripType) !== expectedCount
        ) {
          throw new Error(`${accumulator.spec.routeId} ${shapeId}: selected shape trip_type/count drifted`);
        }
        if (accumulator.nonrevenueShapes.has(shapeId)) {
          throw new Error(`${accumulator.spec.routeId} ${shapeId}: selected shape overlaps nonrevenue shapes`);
        }
        return {
          shape_id: shapeId,
          passenger_trip_type: accumulator.spec.passengerTripType,
          timepoint_row_count: expectedCount,
        };
      },
    );
    const tripTypeRows = Object.fromEntries(
      [...accumulator.tripTypes.entries()].sort(([left], [right]) => left.localeCompare(right)),
    );
    return {
      source_id: input.sourceId,
      schedule_date: accumulator.spec.scheduleDate.slice(0, 10),
      route_id: accumulator.spec.routeId,
      operator: accumulator.spec.operator,
      trip_type_rows: tripTypeRows,
      nonrevenue_passenger_headsign_rows: accumulator.nonrevenuePassengerHeadsignRows,
      selected_shapes: selectedShapes,
      nonrevenue_shape_ids: [...accumulator.nonrevenueShapes].sort(),
      selected_shape_sensitivity: selectedShapes.length > 0
        ? "no_selected_pattern_impact" as const
        : "not_applicable_q67_correction_archive_pending" as const,
    };
  });
  return {
    sourceInput: {
      source_id: input.sourceId,
      source_csv_sha256: sourceCsvSha256,
      source_row_count: sourceRowCount,
      source_acquisition_receipt_sha256: createHash("sha256")
        .update(input.acquisitionReceiptJson)
        .digest("hex"),
    },
    slices,
  };
}

async function deriveScheduleSensitivity(): Promise<Plan040Q67ScheduleSensitivityReceipt> {
  const main = await scanScheduleSource({
    sourceId: "mta_bus_schedules_2025_candidate_windows",
    sourcePath: scheduleSourcePath,
    acquisitionReceiptJson: scheduleAcquisitionReceiptJson,
    specs: mainSliceSpecs,
  });
  const x64 = await scanScheduleSource({
    sourceId: "mta_bus_schedules_2025_x64_predecessor_2026_07_23",
    sourcePath: scheduleX64SourcePath,
    acquisitionReceiptJson: scheduleX64AcquisitionReceiptJson,
    specs: x64SliceSpecs,
  });
  const q67 = main.slices.find((slice) => slice.route_id === "Q67")!;
  return {
    schema_version: 1,
    receipt_id: "plan-040-schedule-trip-type-sensitivity-v1",
    source_id: "mta_bus_schedules_2025_candidate_windows",
    source_url: "https://data.ny.gov/resource/t4bz-xqa9",
    source_csv_sha256: main.sourceInput.source_csv_sha256,
    source_row_count: main.sourceInput.source_row_count,
    source_acquisition_receipt_sha256: main.sourceInput.source_acquisition_receipt_sha256,
    filter: {
      schedule_date: "2025-06-30",
      operator: "NYCT",
      route_id: "Q67",
    },
    timepoint_row_count: Object.values(q67.trip_type_rows)
      .reduce((sum, count) => sum + count, 0),
    trip_type_distribution: {
      revenue: q67.trip_type_rows["1"] ?? 0,
      pull_out: q67.trip_type_rows["2"] ?? 0,
      pull_in: q67.trip_type_rows["3"] ?? 0,
      deadhead: q67.trip_type_rows["4"] ?? 0,
    },
    source_inputs: [main.sourceInput, x64.sourceInput],
    slices: [...main.slices, ...x64.slices],
    accepted_exemplar_shape_sensitivity: {
      status: "no_selected_pattern_impact",
      scope: "selected_accepted_pattern_shapes_only",
      unmatched_or_other_shapes: "excluded_reviewed_unresolved",
      accepted_decision_effect: "no_amendment_required",
    },
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

const scheduleSensitivityReceipt = await deriveScheduleSensitivity();
const manifest = buildPlan040QbnrStopRemovalAcquisitionManifest({
  ledgerJsonl: read("data/quality/operational-reference/member-extent-ledger.jsonl"),
  treatmentJsonl: read("data/canonical/treatment_components.jsonl"),
  routeTreatmentScopesJsonl: read("data/exports/releases/v1-rc26/route_treatment_scopes.jsonl"),
  sourceBlocksJsonl: read(
    "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
  ),
  sourceHtml: read("raw/sources/mta_queens_bus_network_redesign_service_changes/source.html"),
  sourceMetadata: JSON.parse(read(
    "raw/sources/mta_queens_bus_network_redesign_service_changes/metadata.json",
  )) as unknown,
  inventorySnapshots: {
    phase_1_queens_pre: snapshot("gtfs_static_20250615_queens_pre_qbnr"),
    phase_1_busco_pre: snapshot("gtfs_static_20250625_busco_pre_qbnr"),
    phase_1_queens_post: snapshot("gtfs_static_20250626_queens_post_qbnr"),
    phase_1_busco_post: snapshot("gtfs_static_20250626_busco_post_qbnr"),
  },
  scheduleSourceMetadataJson: scheduleMetadataJson,
  scheduleSourceAcquisitionReceiptJson: scheduleAcquisitionReceiptJson,
  scheduleX64MetadataJson,
  scheduleX64AcquisitionReceiptJson,
  scheduleSensitivityReceipt,
});
const bytes = `${stableJson(manifest as unknown as JsonValue)}\n`;
const scheduleSensitivityBytes =
  `${stableJson(scheduleSensitivityReceipt as unknown as JsonValue)}\n`;
if (process.argv.includes("--check")) {
  if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== bytes) {
    throw new Error("Plan 040 QBNR stop-removal acquisition manifest is stale");
  }
  if (
    !existsSync(scheduleSensitivityPath) ||
    readFileSync(scheduleSensitivityPath, "utf8") !== scheduleSensitivityBytes
  ) {
    throw new Error("Plan 040 Q67 schedule sensitivity receipt is stale");
  }
} else {
  writeFileSync(outputPath, bytes);
  writeFileSync(scheduleSensitivityPath, scheduleSensitivityBytes);
}
console.log(JSON.stringify({
  output_path: outputPath,
  replay_sha256: plan040QbnrAcquisitionReplayHash(manifest),
  candidate_count: manifest.candidate_count,
  key_count: manifest.key_count,
  candidate_key_sha256: manifest.candidate_key_sha256,
  phase_feed_distribution: manifest.phase_feed_distribution,
  schedule_trip_type_sensitivity_path: scheduleSensitivityPath,
  schedule_trip_type_sensitivity_sha256: createHash("sha256")
    .update(scheduleSensitivityBytes)
    .digest("hex"),
  decision_count: manifest.decision_count,
}));
