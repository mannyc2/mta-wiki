import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { parseCsv } from "../packages/db/src/import-gtfs";
import { stableHash, stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import { rebuildSourceBlocks } from "../packages/pipeline/src/sources/source-prep";

const SOURCE_ID = "mta_bus_schedules_2025_x63_x68_predecessors_2026_07_24";
const SOURCE_URL = "https://data.ny.gov/resource/t4bz-xqa9.csv";
const DATASET_URL = "https://data.ny.gov/resource/t4bz-xqa9";
const RETRIEVED_AT = "2026-07-24T03:17:50Z";
const WINDOW_START = "2025-06-02";
const WINDOW_END = "2025-07-28";
const ROUTE_IDS = ["X63", "X68"] as const;
const ORDER =
  "schedule_date,route_id,direction,service_id,block_id,shape_id," +
  "stop_sequence,schedule_time,stop_id";
const WHERE =
  "schedule_date between '2025-06-02T00:00:00.000' and " +
  "'2025-07-28T23:59:59.999' AND route_id in ('X63','X68')";
const HEADER = [
  "schedule_date",
  "day_type",
  "borough",
  "operator",
  "service_id",
  "direction",
  "shape_id",
  "trip_type",
  "route_id",
  "stop_sequence",
  "stop_id",
  "stop_name",
  "schedule_time",
  "origin",
  "destination",
  "school",
  "revenue_stop",
  "timepoint",
  "boarding",
  "alighting",
  "distance_from_start",
  "trip_headsign",
  "block_id",
  "depot_code",
  "bundle",
];

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactWrite(path: string, contents: Uint8Array | string): void {
  if (existsSync(path)) {
    const current = readFileSync(path);
    const expected = typeof contents === "string" ? Buffer.from(contents) : Buffer.from(contents);
    if (!current.equals(expected)) throw new Error(`Refusing to overwrite changed ${path}`);
    return;
  }
  writeFileSync(path, contents);
}

function inspectCsv(csv: string) {
  const rows = parseCsv(csv);
  const header = rows.shift();
  if (!header || stableJson(header as unknown as JsonValue) !== stableJson(HEADER)) {
    throw new Error("X63/X68 schedule source header drifted");
  }
  const routeCounts = Object.fromEntries(ROUTE_IDS.map((routeId) => [routeId, 0]));
  const targetDateCounts = Object.fromEntries(ROUTE_IDS.map((routeId) => [routeId, 0]));
  const targetDateShapes = Object.fromEntries(
    ROUTE_IDS.map((routeId) => [routeId, new Set<string>()]),
  ) as Record<(typeof ROUTE_IDS)[number], Set<string>>;
  let minScheduleDate = "";
  let maxScheduleDate = "";
  for (const [index, cells] of rows.entries()) {
    const row = Object.fromEntries(HEADER.map((name, field) => [name, cells[field] ?? ""]));
    if (!ROUTE_IDS.includes(row.route_id as (typeof ROUTE_IDS)[number])) {
      throw new Error(`Unexpected route ${row.route_id} at X63/X68 schedule row ${index + 2}`);
    }
    if (row.operator !== "NYCT") {
      throw new Error(`Unexpected operator ${row.operator} at X63/X68 schedule row ${index + 2}`);
    }
    const routeId = row.route_id as (typeof ROUTE_IDS)[number];
    routeCounts[routeId] += 1;
    const date = row.schedule_date.slice(0, 10);
    if (!minScheduleDate || date < minScheduleDate) minScheduleDate = date;
    if (!maxScheduleDate || date > maxScheduleDate) maxScheduleDate = date;
    if (date === "2025-06-27") {
      targetDateCounts[routeId] += 1;
      targetDateShapes[routeId].add(row.shape_id);
    }
  }
  for (const routeId of ROUTE_IDS) {
    if (routeCounts[routeId] === 0 || targetDateCounts[routeId] === 0) {
      throw new Error(`${routeId}: exact first-party predecessor schedule slice is empty`);
    }
  }
  return {
    row_count: rows.length,
    route_row_counts: routeCounts,
    target_date_row_counts: targetDateCounts,
    target_date_shape_ids: Object.fromEntries(
      ROUTE_IDS.map((routeId) => [routeId, [...targetDateShapes[routeId]].sort()]),
    ),
    min_schedule_date: minScheduleDate,
    max_schedule_date: maxScheduleDate,
  };
}

const root = join(repoRoot, "raw", "sources", SOURCE_ID);
const sourcePath = join(root, "source.csv");
const metadataPath = join(root, "metadata.json");
const receiptPath = join(root, "receipt.json");
const textPath = join(root, "text.txt");
const check = process.argv.includes("--check");

if (!existsSync(sourcePath)) {
  if (check) throw new Error("X63/X68 predecessor schedule source is not staged");
  const response = Bun.spawnSync([
    "curl",
    "-sSL",
    "--fail",
    "--max-time",
    "120",
    "--get",
    "--data-urlencode",
    "$limit=50000",
    "--data-urlencode",
    `$where=${WHERE}`,
    "--data-urlencode",
    `$order=${ORDER}`,
    SOURCE_URL,
  ], { stdout: "pipe", stderr: "pipe" });
  if (response.exitCode !== 0) {
    throw new Error(`X63/X68 predecessor schedule download failed: ${response.stderr.toString()}`);
  }
  mkdirSync(root, { recursive: true });
  exactWrite(sourcePath, new Uint8Array(response.stdout));
}

const sourceBytes = readFileSync(sourcePath);
const csv = sourceBytes.toString("utf8");
const inspection = inspectCsv(csv);
const requestWindow = {
  candidate_ids: [
    "occurrence:4dc018a72fe45633f36e2d50",
    "occurrence:bca0b565b6971c90a6af9e55",
  ],
  dataset_id: "t4bz-xqa9",
  end: WINDOW_END,
  reasons: ["qm63_qm68_documented_predecessor_plus_minus_28_days"],
  route_ids: ROUTE_IDS,
  start: WINDOW_START,
  year: 2025,
};
const sourceSha256 = sha256(sourceBytes);
const receipt = {
  schema_version: 1,
  source_id: SOURCE_ID,
  source_url: DATASET_URL,
  dataset_id: "t4bz-xqa9",
  retrieved_at: RETRIEVED_AT,
  columns: HEADER,
  expected_query_count: 1,
  queries: [{
    route_chunk_index: 0,
    route_ids: ROUTE_IDS,
    window_start: WINDOW_START,
    window_end: WINDOW_END,
    where: WHERE,
    order: ORDER,
    page_size: 50_000,
    page_count: 1,
    row_count: inspection.row_count,
  }],
  request_windows: [requestWindow],
  request_universe_sha256: stableHash(requestWindow as unknown as JsonValue),
  query_row_count: inspection.row_count,
  merged_row_count: inspection.row_count,
  merged_sha256: sourceSha256,
  min_schedule_date: inspection.min_schedule_date,
  max_schedule_date: inspection.max_schedule_date,
  route_row_counts: inspection.route_row_counts,
  target_date: "2025-06-27",
  target_date_row_counts: inspection.target_date_row_counts,
  target_date_shape_ids: inspection.target_date_shape_ids,
  route_batch_size: 20,
  requests_complete: true,
};
const metadata = {
  sourceId: SOURCE_ID,
  title: "MTA Bus Schedules 2025: X63 and X68 predecessor validation slice",
  publisher: "Metropolitan Transportation Authority",
  sourceGroup: "operational_reference",
  sourceUrl: DATASET_URL,
  documentDate: "2025",
  retrievedAt: RETRIEVED_AT,
  contentType: "text/csv",
  sha256: sourceSha256,
  byteLength: sourceBytes.byteLength,
};
const text =
  `MTA Bus Schedules 2025 predecessor validation slice for X63 and X68.\n` +
  `Target date: 2025-06-27.\nRows: ${inspection.row_count}.\n` +
  `SHA-256: ${sourceSha256}.\n`;
const metadataBytes = `${stableJson(metadata as unknown as JsonValue)}\n`;
const receiptBytes = `${stableJson(receipt as unknown as JsonValue)}\n`;
if (check) {
  if (
    !existsSync(metadataPath) ||
    !existsSync(receiptPath) ||
    !existsSync(textPath) ||
    readFileSync(metadataPath, "utf8") !== metadataBytes ||
    readFileSync(receiptPath, "utf8") !== receiptBytes ||
    readFileSync(textPath, "utf8") !== text
  ) {
    throw new Error("X63/X68 predecessor schedule receipt is stale");
  }
} else {
  exactWrite(metadataPath, metadataBytes);
  exactWrite(receiptPath, receiptBytes);
  exactWrite(textPath, text);
}
const blocks = rebuildSourceBlocks(SOURCE_ID);
if (blocks.blockCount === 0) {
  throw new Error("X63/X68 predecessor schedule source preparation produced no evidence blocks");
}
console.log(JSON.stringify({
  status: check ? "checked" : "acquired",
  source_id: SOURCE_ID,
  source_csv_sha256: sourceSha256,
  ...inspection,
}));
