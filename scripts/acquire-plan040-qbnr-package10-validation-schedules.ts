import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { parseCsv } from "../packages/db/src/import-gtfs";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import { BUS_SCHEDULE_COLUMNS } from "../packages/pipeline/src/reference/bus-schedules";
import { fileSha256 } from "../packages/pipeline/src/reference/snapshot-registry";
import {
  buildSourceBlocksFromText,
  rebuildSourceBlocks,
} from "../packages/pipeline/src/sources/source-prep";

const SOURCE_ID =
  "mta_bus_schedules_2025_plan040_p10_validation_2026_07_24";
const SOURCE_URL =
  "https://data.ny.gov/Transportation/MTA-Bus-Schedules-2025/t4bz-xqa9";
const DATASET_ID = "t4bz-xqa9";
const EXTRACTED_AT = "2026-07-24T15:12:28Z";
const DUCKDB_PATH = "/home/cjpher/.local/bin/duckdb";
const DUCKDB_VERSION = "v1.5.2 (Variegata) 8a5851971f";
const TRACKER_ROOT = "/mnt/models/dev/bus-reliability-tracker";
const PARTITION_PATH =
  `${TRACKER_ROOT}/data/raw/socrata-partitioned/bus_schedules_2025/` +
  "schedule-2025/chunks/schedule_date-2025-06-01-to-2025-07-01/rows.csv";
const PARTITION_MANIFEST_PATH =
  `${TRACKER_ROOT}/data/raw/socrata-partitioned/bus_schedules_2025/` +
  "schedule-2025/partition-manifest.json";
const SOURCE_METADATA_PATH =
  `${TRACKER_ROOT}/knowledge/raw/metadata/bus_schedules_2025.json`;
const DATASET_METADATA_PATH =
  `${TRACKER_ROOT}/knowledge/raw/metadata/t4bz-xqa9.json`;
const DURABLE_RECEIPT_RELATIVE =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-package-10-validation-schedules-v1.json";

const INPUT_PINS = {
  partition: {
    bytes: 2_560_376_947,
    sha256:
      "03f9b289512658133225bbda03aad00ceb5a405aa4ae24a50a39dd11b8a8df55",
  },
  partition_manifest: {
    bytes: 5_183,
    sha256:
      "23df32e0d6b7d744cf3076f8a1535ca06bfc4d724000465b779607bbe403adb0",
  },
  source_metadata: {
    bytes: 99_859,
    sha256:
      "14fb6e55305fe15aa9a79301ebdcbf44097cb8958c5716514b22952856b12cba",
  },
  dataset_metadata: {
    bytes: 50_016,
    sha256:
      "4546d6e11a7014cfe0463fb1f18f31a4927a73bccf2e09b127d5b0d22af6c7cc",
  },
} as const;

const OUTPUT_PINS = {
  bytes: 890_047,
  row_count: 3_727,
  sha256:
    "af9e368d93c8fe879e1cd42145ff116a815a6e9464436bb1244fa350c9ffb1fa",
} as const;

const PARTITION_COLUMNS = [
  "Schedule Day",
  "Day Type",
  "Borough",
  "Operator",
  "Service ID",
  "Direction",
  "Shape ID",
  "Trip Type",
  "Route ID",
  "Stop Sequence",
  "Stop ID",
  "Stop Name",
  "Schedule Time",
  "Origin",
  "Destination",
  "School",
  "Revenue Stop",
  "Timepoint",
  "Boarding",
  "Alighting",
  "Distance from Start",
  "Trip Headsign",
  "Block ID",
  "Depot Code",
  "Bundle",
] as const;

const SELECT = [
  `strftime(strptime("Schedule Day", '%m/%d/%Y'), ` +
    `'%Y-%m-%dT00:00:00.000') AS schedule_date`,
  `"Day Type" AS day_type`,
  `"Borough" AS borough`,
  `"Operator" AS operator`,
  `"Service ID" AS service_id`,
  `"Direction" AS direction`,
  `"Shape ID" AS shape_id`,
  `"Trip Type" AS trip_type`,
  `"Route ID" AS route_id`,
  `"Stop Sequence" AS stop_sequence`,
  `"Stop ID" AS stop_id`,
  `"Stop Name" AS stop_name`,
  `strftime(strptime("Schedule Time", '%m/%d/%Y %I:%M:%S %p'), ` +
    `'%Y-%m-%dT%H:%M:%S.000') AS schedule_time`,
  `"Origin" AS origin`,
  `"Destination" AS destination`,
  `"School" AS school`,
  `"Revenue Stop" AS revenue_stop`,
  `"Timepoint" AS timepoint`,
  `"Boarding" AS boarding`,
  `"Alighting" AS alighting`,
  `"Distance from Start" AS distance_from_start`,
  `"Trip Headsign" AS trip_headsign`,
  `"Block ID" AS block_id`,
  `"Depot Code" AS depot_code`,
  `"Bundle" AS bundle`,
].join(", ");
const WHERE =
  `(("Schedule Day" = '06/27/2025' AND "Route ID" IN ('Q20A','Q20B')) ` +
  `OR ("Schedule Day" = '06/29/2025' AND ` +
  `"Route ID" IN ('Q14','Q90','Q98')))`;
const ORDER =
  "schedule_date, route_id, direction, service_id, block_id, shape_id, " +
  "CAST(stop_sequence AS INTEGER), schedule_time, stop_id";
const QUERY =
  `SELECT ${SELECT} FROM read_csv('${PARTITION_PATH}', ` +
  `header=true, all_varchar=true) WHERE ${WHERE} ORDER BY ${ORDER}`;

const EXPECTED_SLICES = [
  {
    schedule_date: "2025-06-27",
    route_id: "Q20A",
    operator: "NYCT",
    row_count: 1_032,
    trip_type_rows: { "1": 946, "2": 40, "3": 44, "4": 2 },
    passenger_shape_ids: ["Q20A0071", "Q20A0087"],
    shape_trip_type_rows: [
      { shape_id: "Q20A0001", trip_type: "3", row_count: 26 },
      { shape_id: "Q20A0002", trip_type: "3", row_count: 18 },
      { shape_id: "Q20A0003", trip_type: "2", row_count: 18 },
      { shape_id: "Q20A0005", trip_type: "2", row_count: 22 },
      { shape_id: "Q20A0009", trip_type: "4", row_count: 2 },
      { shape_id: "Q20A0071", trip_type: "1", row_count: 512 },
      { shape_id: "Q20A0087", trip_type: "1", row_count: 434 },
    ],
  },
  {
    schedule_date: "2025-06-27",
    route_id: "Q20B",
    operator: "NYCT",
    row_count: 845,
    trip_type_rows: { "1": 773, "2": 38, "3": 34 },
    passenger_shape_ids: ["Q20B0057", "Q20B0068"],
    shape_trip_type_rows: [
      { shape_id: "Q20B0001", trip_type: "2", row_count: 16 },
      { shape_id: "Q20B0002", trip_type: "3", row_count: 16 },
      { shape_id: "Q20B0003", trip_type: "2", row_count: 22 },
      { shape_id: "Q20B0005", trip_type: "3", row_count: 18 },
      { shape_id: "Q20B0057", trip_type: "1", row_count: 416 },
      { shape_id: "Q20B0068", trip_type: "1", row_count: 357 },
    ],
  },
  {
    schedule_date: "2025-06-29",
    route_id: "Q14",
    operator: "NYCT",
    row_count: 844,
    trip_type_rows: { "1": 680, "2": 82, "3": 82 },
    passenger_shape_ids: ["Q140008", "Q140009"],
    shape_trip_type_rows: [
      { shape_id: "Q140001", trip_type: "2", row_count: 12 },
      { shape_id: "Q140003", trip_type: "3", row_count: 70 },
      { shape_id: "Q140004", trip_type: "2", row_count: 70 },
      { shape_id: "Q140007", trip_type: "3", row_count: 12 },
      { shape_id: "Q140008", trip_type: "1", row_count: 340 },
      { shape_id: "Q140009", trip_type: "1", row_count: 340 },
    ],
  },
  {
    schedule_date: "2025-06-29",
    route_id: "Q90",
    operator: "NYCT",
    row_count: 358,
    trip_type_rows: { "12": 338, "2": 10, "3": 10 },
    passenger_shape_ids: ["Q901243", "Q901247", "Q901249"],
    shape_trip_type_rows: [
      { shape_id: "Q901243", trip_type: "12", row_count: 15 },
      { shape_id: "Q901244", trip_type: "3", row_count: 10 },
      { shape_id: "Q901247", trip_type: "12", row_count: 176 },
      { shape_id: "Q901249", trip_type: "12", row_count: 147 },
      { shape_id: "Q901250", trip_type: "2", row_count: 10 },
    ],
  },
  {
    schedule_date: "2025-06-29",
    route_id: "Q98",
    operator: "NYCT",
    row_count: 648,
    trip_type_rows: { "12": 512, "2": 68, "3": 68 },
    passenger_shape_ids: ["Q980041", "Q980045"],
    shape_trip_type_rows: [
      { shape_id: "Q980032", trip_type: "3", row_count: 66 },
      { shape_id: "Q980038", trip_type: "3", row_count: 2 },
      { shape_id: "Q980041", trip_type: "12", row_count: 260 },
      { shape_id: "Q980043", trip_type: "2", row_count: 8 },
      { shape_id: "Q980044", trip_type: "2", row_count: 60 },
      { shape_id: "Q980045", trip_type: "12", row_count: 252 },
    ],
  },
] as const;

type ScheduleRow = Record<(typeof BUS_SCHEDULE_COLUMNS)[number], string>;

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertFilePin(
  path: string,
  pin: { bytes: number; sha256: string },
  label: string,
): void {
  if (
    !existsSync(path) ||
    statSync(path).size !== pin.bytes ||
    fileSha256(path) !== pin.sha256
  ) {
    throw new Error(`${label} identity drifted: ${path}`);
  }
}

function partitionHeader(): string[] {
  const descriptor = openSync(PARTITION_PATH, "r");
  const buffer = Buffer.allocUnsafe(4_096);
  try {
    const bytes = readSync(descriptor, buffer, 0, buffer.length, 0);
    const firstLine = buffer.subarray(0, bytes).toString("utf8").split(/\r?\n/u)[0];
    if (!firstLine) throw new Error("Partition header is empty");
    return parseCsv(`${firstLine}\n`)[0] ?? [];
  } finally {
    closeSync(descriptor);
  }
}

function verifyOrWrite(
  path: string,
  contents: Uint8Array | string,
  check: boolean,
): void {
  const expected =
    typeof contents === "string" ? Buffer.from(contents) : Buffer.from(contents);
  if (existsSync(path)) {
    if (!readFileSync(path).equals(expected)) {
      throw new Error(`Refusing to overwrite changed ${path}`);
    }
    return;
  }
  if (check) throw new Error(`Required staged artifact is missing: ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, expected);
}

function rowObject(cells: string[]): ScheduleRow {
  return Object.fromEntries(
    BUS_SCHEDULE_COLUMNS.map((column, index) => [column, cells[index] ?? ""]),
  ) as ScheduleRow;
}

function scheduleDate(value: string): string {
  return value.slice(0, 10);
}

function compareText(left: string, right: string): number {
  if (left === "") return right === "" ? 0 : 1;
  if (right === "") return -1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareRows(left: ScheduleRow, right: ScheduleRow): number {
  for (const field of [
    "schedule_date",
    "route_id",
    "direction",
    "service_id",
    "block_id",
    "shape_id",
  ] as const) {
    const compared = compareText(left[field], right[field]);
    if (compared !== 0) return compared;
  }
  const stopSequence =
    Number(left.stop_sequence) - Number(right.stop_sequence);
  if (stopSequence !== 0) return stopSequence;
  return compareText(left.schedule_time, right.schedule_time) ||
    compareText(left.stop_id, right.stop_id);
}

function inspectCsv(csv: string) {
  const parsed = parseCsv(csv);
  const header = parsed.shift();
  if (
    !header ||
    stableJson(header as unknown as JsonValue) !==
      stableJson([...BUS_SCHEDULE_COLUMNS] as unknown as JsonValue)
  ) {
    throw new Error("Plan 040 Package 10 validation source header drifted");
  }
  const rows = parsed.map(rowObject);
  if (rows.length !== OUTPUT_PINS.row_count) {
    throw new Error(`Expected ${OUTPUT_PINS.row_count} data rows; received ${rows.length}`);
  }
  const sortedRows = [...rows].sort(compareRows);
  if (
    stableJson(rows as unknown as JsonValue) !==
      stableJson(sortedRows as unknown as JsonValue)
  ) {
    throw new Error("Plan 040 Package 10 validation source order drifted");
  }
  const sortKeys = rows.map((row) =>
    [
      row.schedule_date,
      row.route_id,
      row.direction,
      row.service_id,
      row.block_id,
      row.shape_id,
      String(Number(row.stop_sequence)),
      row.schedule_time,
      row.stop_id,
    ].join("\u001f")
  );
  if (new Set(sortKeys).size !== rows.length) {
    throw new Error("Plan 040 Package 10 validation order key is not unique");
  }

  const slices = EXPECTED_SLICES.map((expected) => {
    const selected = rows.filter((row) =>
      scheduleDate(row.schedule_date) === expected.schedule_date &&
      row.route_id === expected.route_id
    );
    const operators = [...new Set(selected.map((row) => row.operator))].sort();
    const tripTypeRows = Object.fromEntries(
      [...new Set(selected.map((row) => row.trip_type))].sort().map((tripType) => [
        tripType,
        selected.filter((row) => row.trip_type === tripType).length,
      ]),
    );
    const shapeTripTypeRows = [...new Set(
      selected.map((row) => `${row.shape_id}\u001f${row.trip_type}`),
    )].sort().map((key) => {
      const [shapeId = "", tripType = ""] = key.split("\u001f");
      return {
        shape_id: shapeId,
        trip_type: tripType,
        row_count: selected.filter((row) =>
          row.shape_id === shapeId && row.trip_type === tripType
        ).length,
      };
    });
    const passengerShapeIds = [...new Set(
      selected
        .filter((row) => !["2", "3", "4"].includes(row.trip_type))
        .map((row) => row.shape_id),
    )].sort();
    const actual = {
      schedule_date: expected.schedule_date,
      route_id: expected.route_id,
      operator: operators.length === 1 ? operators[0] : operators.join(","),
      row_count: selected.length,
      trip_type_rows: tripTypeRows,
      passenger_shape_ids: passengerShapeIds,
      shape_trip_type_rows: shapeTripTypeRows,
    };
    if (
      stableJson(actual as unknown as JsonValue) !==
        stableJson(expected as unknown as JsonValue)
    ) {
      throw new Error(
        `${expected.schedule_date} ${expected.route_id}: exact source slice drifted`,
      );
    }
    return actual;
  });

  const selectedKeys = new Set(
    EXPECTED_SLICES.map((slice) => `${slice.schedule_date}\u001f${slice.route_id}`),
  );
  if (
    rows.some((row) =>
      !selectedKeys.has(`${scheduleDate(row.schedule_date)}\u001f${row.route_id}`)
    )
  ) {
    throw new Error("Plan 040 Package 10 validation source contains an extra slice");
  }
  return { rows, slices };
}

for (const [path, pin, label] of [
  [PARTITION_PATH, INPUT_PINS.partition, "partition"],
  [
    PARTITION_MANIFEST_PATH,
    INPUT_PINS.partition_manifest,
    "partition manifest",
  ],
  [SOURCE_METADATA_PATH, INPUT_PINS.source_metadata, "source metadata"],
  [DATASET_METADATA_PATH, INPUT_PINS.dataset_metadata, "dataset metadata"],
] as const) {
  assertFilePin(path, pin, label);
}

if (
  stableJson(partitionHeader() as unknown as JsonValue) !==
    stableJson([...PARTITION_COLUMNS] as unknown as JsonValue) ||
  PARTITION_COLUMNS.length !== BUS_SCHEDULE_COLUMNS.length ||
  BUS_SCHEDULE_COLUMNS.length !== 25
) {
  throw new Error("Official 25-column bus-schedule schema drifted");
}
const version = Bun.spawnSync([DUCKDB_PATH, "--version"], {
  stdout: "pipe",
  stderr: "pipe",
});
if (
  version.exitCode !== 0 ||
  version.stdout.toString().trim() !== DUCKDB_VERSION
) {
  throw new Error(
    `DuckDB identity drifted: ${version.stdout.toString().trim()} ` +
      version.stderr.toString().trim(),
  );
}

const check = process.argv.includes("--check");
const stagingRoot = mkdtempSync(
  join(tmpdir(), "plan040-package10-validation-schedules-"),
);
const extractedPath = join(stagingRoot, "source.csv");
try {
  const copySql =
    `COPY (${QUERY}) TO '${extractedPath}' ` +
    `(HEADER, DELIMITER ',', QUOTE '"', ESCAPE '"', FORCE_QUOTE *);`;
  const extracted = Bun.spawnSync([DUCKDB_PATH, "-c", copySql], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (extracted.exitCode !== 0) {
    throw new Error(
      `DuckDB extraction failed: ${extracted.stderr.toString()}`,
    );
  }
  assertFilePin(extractedPath, OUTPUT_PINS, "extracted source");
  const sourceBytes = readFileSync(extractedPath);
  const inspection = inspectCsv(sourceBytes.toString("utf8"));

  const sourceRoot = join(repoRoot, "raw", "sources", SOURCE_ID);
  const sourcePath = join(sourceRoot, "source.csv");
  const metadataPath = join(sourceRoot, "metadata.json");
  const textPath = join(sourceRoot, "text.txt");
  const blocksPath = join(sourceRoot, "blocks.jsonl");
  const rawReceiptPath = join(sourceRoot, "receipt.json");
  const durableReceiptPath = join(repoRoot, DURABLE_RECEIPT_RELATIVE);
  const metadata = {
    byteLength: OUTPUT_PINS.bytes,
    contentType: "text/csv",
    documentDate: "2025",
    publisher: "Metropolitan Transportation Authority",
    retrievedAt: EXTRACTED_AT,
    sha256: OUTPUT_PINS.sha256,
    sourceGroup: "operational_reference",
    sourceId: SOURCE_ID,
    sourceUrl: SOURCE_URL,
    title:
      "MTA Bus Schedules 2025: Plan 040 Package 10 validation slices",
  };
  const text =
    "MTA Bus Schedules 2025 Plan 040 Package 10 validation slices.\n" +
    "Exact requested slices: 2025-06-27 Q20A/Q20B; " +
    "2025-06-29 Q14/Q90/Q98.\n" +
    `Rows: ${OUTPUT_PINS.row_count}. No source rows in those slices were excluded.\n` +
    `Source CSV SHA-256: ${OUTPUT_PINS.sha256}.\n`;
  const metadataBytes = `${stableJson(metadata as unknown as JsonValue)}\n`;
  verifyOrWrite(sourcePath, sourceBytes, check);
  verifyOrWrite(metadataPath, metadataBytes, check);
  verifyOrWrite(textPath, text, check);

  const expectedBlocks = `${
    buildSourceBlocksFromText(SOURCE_ID, text)
      .map((block) => JSON.stringify(block))
      .join("\n")
  }\n`;
  if (existsSync(blocksPath)) {
    verifyOrWrite(blocksPath, expectedBlocks, check);
  } else {
    if (check) throw new Error(`Required staged artifact is missing: ${blocksPath}`);
    const rebuilt = rebuildSourceBlocks(SOURCE_ID);
    if (
      rebuilt.blockCount === 0 ||
      readFileSync(blocksPath, "utf8") !== expectedBlocks
    ) {
      throw new Error("Normal source block staging drifted");
    }
  }

  const blocksSha256 = fileSha256(blocksPath);
  const receipt = {
    schema_version: 1,
    receipt_id: "plan-040-qbnr-package-10-validation-schedules-v1",
    source_id: SOURCE_ID,
    dataset_id: DATASET_ID,
    source_url: SOURCE_URL,
    extracted_at: EXTRACTED_AT,
    acquisition_mode: "authoritative_local_partition_exact_slice",
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_member_extent_or_grain_decision: false,
    input_artifacts: {
      partition: {
        path: PARTITION_PATH,
        ...INPUT_PINS.partition,
      },
      partition_manifest: {
        path: PARTITION_MANIFEST_PATH,
        ...INPUT_PINS.partition_manifest,
      },
      source_metadata: {
        path: SOURCE_METADATA_PATH,
        ...INPUT_PINS.source_metadata,
      },
      dataset_metadata: {
        path: DATASET_METADATA_PATH,
        ...INPUT_PINS.dataset_metadata,
      },
    },
    extraction: {
      executable: DUCKDB_PATH,
      duckdb_version: DUCKDB_VERSION,
      input_schema: {
        source_columns: PARTITION_COLUMNS,
        output_columns: BUS_SCHEDULE_COLUMNS,
        column_count: BUS_SCHEDULE_COLUMNS.length,
      },
      query: QUERY,
      where: WHERE,
      order_by: ORDER,
      row_selection_uses_trip_type: false,
      row_exclusion_count: 0,
      requested_slices_exhaustive: true,
    },
    output_artifacts: {
      source_csv: {
        path: `raw/sources/${SOURCE_ID}/source.csv`,
        ...OUTPUT_PINS,
      },
      metadata: {
        path: `raw/sources/${SOURCE_ID}/metadata.json`,
        bytes: Buffer.byteLength(metadataBytes),
        sha256: sha256(metadataBytes),
      },
      blocks: {
        path: `raw/sources/${SOURCE_ID}/blocks.jsonl`,
        bytes: statSync(blocksPath).size,
        sha256: blocksSha256,
        block_count: buildSourceBlocksFromText(SOURCE_ID, text).length,
      },
    },
    row_count: inspection.rows.length,
    route_row_counts: Object.fromEntries(
      inspection.slices.map((slice) => [slice.route_id, slice.row_count]),
    ),
    schedule_slices: inspection.slices,
    trip_type_preservation: {
      passenger_diagnostic_policy: "any_trip_type_except_2_3_4",
      classification_is_downstream_only: true,
      extraction_includes_every_trip_type: true,
      shape_trip_type_counts_pinned: true,
    },
  };
  const receiptBytes = `${stableJson(receipt as unknown as JsonValue)}\n`;
  verifyOrWrite(rawReceiptPath, receiptBytes, check);
  verifyOrWrite(durableReceiptPath, receiptBytes, check);

  console.log(stableJson({
    status: check ? "checked" : "acquired",
    source_id: SOURCE_ID,
    source_csv_sha256: OUTPUT_PINS.sha256,
    source_csv_bytes: OUTPUT_PINS.bytes,
    receipt_sha256: sha256(receiptBytes),
    blocks_sha256: blocksSha256,
    row_count: inspection.rows.length,
    route_row_counts: receipt.route_row_counts,
    authorizes_occurrence: false,
    authorizes_member_extent_or_grain_decision: false,
  } as unknown as JsonValue));
} finally {
  rmSync(stagingRoot, { recursive: true, force: true });
}
