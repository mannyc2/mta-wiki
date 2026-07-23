/**
 * Adapter for the official annual MTA Bus Schedules Socrata datasets.
 *
 * The captured field list is pinned in `BUS_SCHEDULE_COLUMNS`: `route_id`,
 * cardinal `direction`, timepoint `stop_id`/`stop_name`, published path key
 * `shape_id`, `schedule_time`, `schedule_date`, `day_type`, and the remaining
 * service/boarding labels. One row is one scheduled timepoint stop. `service_id`
 * is a service/day code and `block_id` is vehicle-work context; neither is a
 * trip identifier, so path patterns group only by direction + shape_id.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  appendFileSync,
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { StringDecoder } from "node:string_decoder";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { type CsvRecord, type GtfsCoordinateIndex } from "./gtfs-static.js";
import {
  stageScheduleSnapshot,
  fileSha256,
  loadOperationalSnapshotRegistry,
  loadOperationalSnapshotRegistryIfPresent,
  OPERATIONAL_REFERENCE_REGISTRY_PATH,
  snapshotsByKind,
  validateOperationalReferenceRegistry,
  type OperationalSnapshot,
} from "./snapshot-registry.js";

export const BUS_SCHEDULE_DATASETS = {
  2023: "x5mx-4rfs",
  2024: "udt9-hvjq",
  2025: "t4bz-xqa9",
  2026: "4fnn-qsea",
} as const;

export const BUS_SCHEDULE_COLUMNS = [
  "schedule_date", "day_type", "borough", "operator", "service_id", "direction", "shape_id",
  "trip_type", "route_id", "stop_sequence", "stop_id", "stop_name", "schedule_time", "origin",
  "destination", "school", "revenue_stop", "timepoint", "boarding", "alighting", "distance_from_start",
  "trip_headsign", "block_id", "depot_code", "bundle",
] as const;

export const BUS_SCHEDULE_ROUTE_BATCH_SIZE = 20 as const;
export const BASE_BUS_SCHEDULE_SNAPSHOT_IDS = [2023, 2024, 2025, 2026].map((year) =>
  `mta-bus-schedules-${year}-candidate-windows`);

export type BusScheduleRow = {
  schedule_date: string;
  day_type: string;
  borough: string;
  operator: string;
  service_id: string;
  direction: string;
  shape_id: string;
  trip_type: string;
  route_id: string;
  stop_sequence: number;
  stop_id: string;
  stop_name: string;
  schedule_time: string;
  origin: string;
  destination: string;
  school: string;
  revenue_stop: string;
  timepoint: string;
  boarding: string;
  alighting: string;
  distance_from_start: number | null;
  trip_headsign: string;
  block_id: string;
  depot_code: string;
  bundle: string;
};

export type ScheduleRequestWindow = {
  year: 2023 | 2024 | 2025 | 2026;
  dataset_id: string;
  route_ids: string[];
  start: string;
  end: string;
  reasons: string[];
  candidate_ids: string[];
};

export type ScheduleRequestUniverse = {
  schema_version: 1;
  generated_from: {
    bridge_ledger: string;
    tracker_input: string;
    tracker_input_sha256: string;
    member_extent_companion: string;
  };
  windows: ScheduleRequestWindow[];
};

type BridgeRow = {
  candidate_id: string;
  downstream_disposition: string;
  occurrence_id: string | null;
};

type TrackerInputRow = {
  candidate_id: string;
  route_id: string;
  implementation_date: string | null;
  date_precision: string | null;
  occurrence_id: string | null;
};

type MemberExtentRow = {
  occurrence_id: string;
  gtfs_route_id: string;
};

const BRIDGE_LEDGER = "data/quality/study-readiness/v1/bridge-ledger.jsonl";
const TRACKER_INPUT = "data/quality/study-readiness/v1/tracker-rc26-input.json";
const MEMBER_COMPANION =
  "data/exports/releases/v1-rc27/member-extent/data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl";

function readJsonl<T>(path: string): T[] {
  return readFileSync(join(repoRoot, path), "utf8")
    .split(/\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function isoDate(value: string): string {
  return value.slice(0, 10);
}

function dateAdd(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid ISO date: ${value}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function yearFor(date: string): number {
  return Number(date.slice(0, 4));
}

function clampWindow(start: string, end: string, year: number): { start: string; end: string } | undefined {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const clamped = { start: start < yearStart ? yearStart : start, end: end > yearEnd ? yearEnd : end };
  return clamped.start <= clamped.end ? clamped : undefined;
}

function trackerInputRows(): TrackerInputRow[] {
  const parsed = JSON.parse(readFileSync(join(repoRoot, TRACKER_INPUT), "utf8")) as { rows?: unknown };
  if (!Array.isArray(parsed.rows)) throw new Error(`${TRACKER_INPUT}: expected rows array`);
  return parsed.rows.map((raw, index) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error(`${TRACKER_INPUT}: rows[${index}] must be an object`);
    }
    const row = raw as Record<string, unknown>;
    if (typeof row.candidate_id !== "string" || typeof row.route_id !== "string" ||
        (row.implementation_date !== null && typeof row.implementation_date !== "string") ||
        (row.date_precision !== null && typeof row.date_precision !== "string") ||
        (row.occurrence_id !== null && typeof row.occurrence_id !== "string")) {
      throw new Error(`${TRACKER_INPUT}: rows[${index}] has invalid typed identity/date fields`);
    }
    return {
      candidate_id: row.candidate_id,
      route_id: row.route_id,
      implementation_date: row.implementation_date,
      date_precision: row.date_precision,
      occurrence_id: row.occurrence_id,
    };
  });
}

function exactTrackerDate(row: TrackerInputRow): string {
  if (row.date_precision !== "day" || !row.implementation_date || !/^\d{4}-\d{2}-\d{2}$/u.test(row.implementation_date)) {
    throw new Error(`${row.candidate_id}: event-window schedules require a day-precision imported tracker date`);
  }
  return row.implementation_date;
}

type MutableWindow = {
  year: 2023 | 2024 | 2025 | 2026;
  start: string;
  end: string;
  routeIds: Set<string>;
  reasons: Set<string>;
  candidateIds: Set<string>;
};

export function buildScheduleRequestUniverse(): ScheduleRequestUniverse {
  const bridge = readJsonl<BridgeRow>(BRIDGE_LEDGER);
  const trackerPath = join(repoRoot, TRACKER_INPUT);
  const tracker = trackerInputRows();
  const trackerByCandidate = new Map(tracker.map((row) => [row.candidate_id, row]));
  const occurrenceDates = new Map<string, { date: string; candidateId: string }>();
  for (const row of tracker) {
    if (row.occurrence_id) occurrenceDates.set(row.occurrence_id, { date: exactTrackerDate(row), candidateId: row.candidate_id });
  }
  const raw: MutableWindow[] = [];
  const add = (routeId: string, date: string, radius: number, reason: string, candidateId: string) => {
    const start = dateAdd(date, -radius);
    const end = dateAdd(date, radius);
    for (let year = yearFor(start); year <= yearFor(end); year += 1) {
      if (!(year in BUS_SCHEDULE_DATASETS)) continue;
      const clamped = clampWindow(start, end, year);
      if (!clamped) continue;
      raw.push({
        year: year as MutableWindow["year"],
        start: clamped.start,
        end: clamped.end,
        routeIds: new Set([routeId]),
        reasons: new Set([reason]),
        candidateIds: new Set([candidateId]),
      });
    }
  };
  for (const row of bridge) {
    const trackerRow = trackerByCandidate.get(row.candidate_id);
    if (!trackerRow) throw new Error(`${row.candidate_id}: bridge row is missing from pinned tracker input`);
    const date = exactTrackerDate(trackerRow);
    if (row.downstream_disposition === "source_fixable_bus_lane_occurrence_identity") {
      add(trackerRow.route_id, date, 7, "bus_lane_candidate_plus_minus_7_days", row.candidate_id);
    } else if (row.downstream_disposition === "source_fixable_member_treatment_extent") {
      add(trackerRow.route_id, date, 28, "member_extent_candidate_plus_minus_28_days", row.candidate_id);
    }
  }
  if (existsSync(join(repoRoot, MEMBER_COMPANION))) {
    for (const row of readJsonl<MemberExtentRow>(MEMBER_COMPANION)) {
      const occurrence = occurrenceDates.get(row.occurrence_id);
      if (occurrence) add(row.gtfs_route_id, occurrence.date, 28, "member_extent_companion_route_plus_minus_28_days", occurrence.candidateId);
    }
  }
  const q61 = tracker.find((row) => row.route_id === "Q61" && row.implementation_date === "2025-06-29");
  if (q61) {
    add("Q15", "2025-06-29", 28, "q61_predecessor_route", q61.candidate_id);
    add("Q34", "2025-06-29", 28, "q61_predecessor_route", q61.candidate_id);
  }
  for (const routeId of ["Q61", "QM44", "QM64"]) {
    add(routeId, "2026-05-31", 0, "current_gtfs_service_window_probe", `probe:${routeId}:2026-05-31`);
  }

  // Combining routes with identical windows keeps receipts compact while preserving every exact request.
  const byWindow = new Map<string, MutableWindow>();
  for (const window of raw) {
    const key = `${window.year}\0${window.start}\0${window.end}`;
    const target = byWindow.get(key) ?? {
      year: window.year,
      start: window.start,
      end: window.end,
      routeIds: new Set<string>(),
      reasons: new Set<string>(),
      candidateIds: new Set<string>(),
    };
    for (const value of window.routeIds) target.routeIds.add(value);
    for (const value of window.reasons) target.reasons.add(value);
    for (const value of window.candidateIds) target.candidateIds.add(value);
    byWindow.set(key, target);
  }
  const windows = [...byWindow.values()]
    .map((window): ScheduleRequestWindow => ({
      year: window.year,
      dataset_id: BUS_SCHEDULE_DATASETS[window.year],
      route_ids: [...window.routeIds].sort(),
      start: window.start,
      end: window.end,
      reasons: [...window.reasons].sort(),
      candidate_ids: [...window.candidateIds].sort(),
    }))
    .sort((left, right) => left.year - right.year || left.start.localeCompare(right.start) || left.end.localeCompare(right.end));
  return {
    schema_version: 1,
    generated_from: {
      bridge_ledger: BRIDGE_LEDGER,
      tracker_input: TRACKER_INPUT,
      tracker_input_sha256: createHash("sha256").update(readFileSync(trackerPath)).digest("hex"),
      member_extent_companion: MEMBER_COMPANION,
    },
    windows,
  };
}

function scheduleRow(raw: CsvRecord, index: number): BusScheduleRow {
  for (const field of BUS_SCHEDULE_COLUMNS) {
    if (!(field in raw)) throw new Error(`Schedule row ${index} is missing column ${field}`);
  }
  const sequence = Number(raw.stop_sequence);
  const distance = raw.distance_from_start ? Number(raw.distance_from_start) : null;
  if (!Number.isFinite(sequence) || (distance !== null && !Number.isFinite(distance))) {
    throw new Error(`Schedule row ${index} has invalid numeric fields`);
  }
  return {
    schedule_date: isoDate(raw.schedule_date!),
    day_type: raw.day_type!,
    borough: raw.borough!,
    operator: raw.operator!,
    service_id: raw.service_id!,
    direction: raw.direction!,
    shape_id: raw.shape_id!,
    trip_type: raw.trip_type!,
    route_id: raw.route_id!,
    stop_sequence: sequence,
    stop_id: raw.stop_id!,
    stop_name: raw.stop_name!,
    schedule_time: raw.schedule_time!,
    origin: raw.origin!,
    destination: raw.destination!,
    school: raw.school!,
    revenue_stop: raw.revenue_stop!,
    timepoint: raw.timepoint!,
    boarding: raw.boarding!,
    alighting: raw.alighting!,
    distance_from_start: distance,
    trip_headsign: raw.trip_headsign!,
    block_id: raw.block_id!,
    depot_code: raw.depot_code!,
    bundle: raw.bundle!,
  };
}

export type ScheduleRowWindow = { route_id: string; start: string; end: string };

function csvLineCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else if ((char === "\r" || char === "\n") && !quoted) {
      if (char === "\r" && line[index + 1] === "\n") index += 1;
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  if (quoted) throw new Error("Unterminated quoted CSV row");
  return cells;
}

function visitBusScheduleCsv(
  path: string,
  windows: readonly ScheduleRowWindow[] | undefined,
  visitor: (row: BusScheduleRow) => void,
): void {
  const windowsByRoute = windows === undefined ? undefined : new Map<string, ScheduleRowWindow[]>();
  for (const window of windows ?? []) {
    const routeWindows = windowsByRoute!.get(window.route_id) ?? [];
    routeWindows.push(window);
    windowsByRoute!.set(window.route_id, routeWindows);
  }
  const descriptor = openSync(path, "r");
  const decoder = new StringDecoder("utf8");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  let carry = "";
  let quoted = false;
  let header: string[] | undefined;
  let rowIndex = 0;
  const accept = (line: string) => {
    if (!line.trim()) return;
    const cells = csvLineCells(line);
    if (!header) {
      header = cells.map((value, index) => index === 0 ? value.replace(/^\uFEFF/u, "") : value);
      for (const field of BUS_SCHEDULE_COLUMNS) if (!header.includes(field)) throw new Error(`${path}: missing schedule column ${field}`);
      return;
    }
    rowIndex += 1;
    const routeId = cells[header.indexOf("route_id")] ?? "";
    const date = isoDate(cells[header.indexOf("schedule_date")] ?? "");
    const routeWindows = windowsByRoute?.get(routeId);
    if (windowsByRoute && (!routeWindows || !routeWindows.some((window) => date >= window.start && date <= window.end))) return;
    const raw = Object.fromEntries(header.map((field, index) => [field, cells[index] ?? ""]));
    visitor(scheduleRow(raw, rowIndex));
  };
  const scan = (chunk: string, final = false) => {
    const carryLength = carry.length;
    const text = carry + chunk;
    let rowStart = 0;
    for (let index = carryLength; index < text.length; index += 1) {
      const char = text[index]!;
      if (char === '"') quoted = !quoted;
      if (char === "\n" && !quoted) {
        accept(text.slice(rowStart, index + 1));
        rowStart = index + 1;
      }
    }
    carry = text.slice(rowStart);
    if (final && carry.length > 0) {
      if (quoted) throw new Error(`${path}: unterminated quoted CSV record`);
      accept(carry);
      carry = "";
    }
  };
  try {
    for (;;) {
      const bytes = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      scan(decoder.write(buffer.subarray(0, bytes)));
    }
    scan(decoder.end(), true);
  } finally {
    closeSync(descriptor);
  }
}

/** Streams the capture once and retains only requested route/date windows. */
export function loadBusScheduleCsv(path: string, windows?: readonly ScheduleRowWindow[]): BusScheduleRow[] {
  const output: BusScheduleRow[] = [];
  visitBusScheduleCsv(path, windows, (row) => output.push(row));
  return output;
}

/**
 * Lane-specific bounded reducer: repeated daily departures collapse during the
 * file scan to one earliest row per exact route/date/direction/shape/stop key.
 */
export function loadBusSchedulePatternCsv(path: string, windows: readonly ScheduleRowWindow[]): BusScheduleRow[] {
  const patterns = new Map<string, BusScheduleRow>();
  visitBusScheduleCsv(path, windows, (row) => {
    const key = [row.route_id, row.schedule_date, row.direction, row.shape_id, row.stop_sequence, row.stop_id].join("\0");
    const prior = patterns.get(key);
    if (!prior || row.schedule_time < prior.schedule_time ||
        (row.schedule_time === prior.schedule_time && stableJson(row as unknown as JsonValue) < stableJson(prior as unknown as JsonValue))) {
      patterns.set(key, row);
    }
  });
  return [...patterns.values()].sort((left, right) => left.schedule_date.localeCompare(right.schedule_date) ||
    left.route_id.localeCompare(right.route_id) || left.direction.localeCompare(right.direction) ||
    left.shape_id.localeCompare(right.shape_id) || left.stop_sequence - right.stop_sequence || left.stop_id.localeCompare(right.stop_id));
}

export function loadBusScheduleSnapshot(
  snapshot: OperationalSnapshot,
  windows?: readonly ScheduleRowWindow[],
  rootDir = repoRoot,
): BusScheduleRow[] {
  if (snapshot.kind !== "bus_schedules_year") throw new Error(`${snapshot.snapshot_id} is not a yearly bus-schedules snapshot`);
  const path = join(rootDir, "raw/sources", snapshot.source_id, "source.csv");
  return loadBusScheduleCsv(path, windows);
}

export function loadBusSchedulePatternSnapshot(
  snapshot: OperationalSnapshot,
  windows: readonly ScheduleRowWindow[],
  rootDir = repoRoot,
): BusScheduleRow[] {
  if (snapshot.kind !== "bus_schedules_year") throw new Error(`${snapshot.snapshot_id} is not a yearly bus-schedules snapshot`);
  return loadBusSchedulePatternCsv(join(rootDir, "raw/sources", snapshot.source_id, "source.csv"), windows);
}

function scheduleSort(left: CsvRecord, right: CsvRecord): number {
  for (const field of [
    "schedule_date", "route_id", "direction", "service_id", "block_id", "shape_id", "stop_sequence", "schedule_time", "stop_id",
  ]) {
    const comparison = (left[field] ?? "").localeCompare(right[field] ?? "");
    if (comparison !== 0) return comparison;
  }
  return stableJson(left as unknown as JsonValue).localeCompare(stableJson(right as unknown as JsonValue));
}

function csvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function renderScheduleCsv(rows: readonly CsvRecord[]): string {
  const header = BUS_SCHEDULE_COLUMNS.join(",");
  const lines = rows.map((row) => BUS_SCHEDULE_COLUMNS.map((field) => csvCell(row[field] ?? "")).join(","));
  return `${header}\n${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export type QueryReceipt = {
  window_start: string;
  window_end: string;
  route_ids: string[];
  route_chunk_index: number;
  where: string;
  order: string;
  page_size: number;
  page_count: number;
  row_count: number;
};

function scheduleSortKey(row: CsvRecord): string {
  return [
    "schedule_date", "route_id", "direction", "service_id", "block_id", "shape_id", "stop_sequence", "schedule_time", "stop_id",
  ].map((field) => row[field] ?? "").join("\u0001");
}

async function fetchWindow(
  datasetId: string,
  window: ScheduleRequestWindow,
  routeIds: readonly string[],
  routeChunkIndex: number,
  unsortedPath: string,
): Promise<QueryReceipt> {
  if (routeIds.length === 0 || routeIds.length > BUS_SCHEDULE_ROUTE_BATCH_SIZE) {
    throw new Error(`Schedule route batch must contain 1-${BUS_SCHEDULE_ROUTE_BATCH_SIZE} routes`);
  }
  const routeClause = routeIds.map(sqlLiteral).join(",");
  const where = `schedule_date between '${window.start}T00:00:00.000' and '${window.end}T23:59:59.999' AND route_id in (${routeClause})`;
  const order = "schedule_date,route_id,direction,service_id,block_id,shape_id,stop_sequence,schedule_time,stop_id";
  const pageSize = 50_000;
  let pageCount = 0;
  let rowCount = 0;
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`https://data.ny.gov/resource/${datasetId}.json`);
    url.searchParams.set("$select", BUS_SCHEDULE_COLUMNS.join(","));
    url.searchParams.set("$where", where);
    url.searchParams.set("$order", order);
    url.searchParams.set("$limit", String(pageSize));
    url.searchParams.set("$offset", String(offset));
    const response = await fetch(url, { headers: { "User-Agent": "mta-wiki-operational-reference/1" } });
    if (!response.ok) throw new Error(`Schedule query failed ${response.status}: ${url.toString()}`);
    const value = await response.json() as unknown;
    if (!Array.isArray(value)) throw new Error(`Schedule query did not return an array: ${url.toString()}`);
    const page = value.map((entry, index): CsvRecord => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new Error(`Schedule query page row ${index} is not an object`);
      }
      const source = entry as Record<string, unknown>;
      return Object.fromEntries(BUS_SCHEDULE_COLUMNS.map((field) => [field, source[field] === undefined || source[field] === null ? "" : String(source[field])]));
    });
    pageCount += 1;
    rowCount += page.length;
    if (page.length > 0) {
      appendFileSync(unsortedPath, `${page.map((row) => `${scheduleSortKey(row)}\t${stableJson(row as unknown as JsonValue)}`).join("\n")}\n`, "utf8");
    }
    if (page.length < pageSize) break;
  }
  return {
    window_start: window.start,
    window_end: window.end,
    route_ids: [...routeIds],
    route_chunk_index: routeChunkIndex,
    where,
    order,
    page_size: pageSize,
    page_count: pageCount,
    row_count: rowCount,
  };
}

export function routeChunks(routeIds: readonly string[]): string[][] {
  const sorted = [...routeIds].sort();
  const output: string[][] = [];
  for (let index = 0; index < sorted.length; index += BUS_SCHEDULE_ROUTE_BATCH_SIZE) {
    output.push(sorted.slice(index, index + BUS_SCHEDULE_ROUTE_BATCH_SIZE));
  }
  return output;
}

export function assertCompleteRouteChunks(window: ScheduleRequestWindow, receipts: readonly QueryReceipt[]): void {
  const expected = routeChunks(window.route_ids);
  const actual = receipts
    .filter((receipt) => receipt.window_start === window.start && receipt.window_end === window.end)
    .sort((left, right) => left.route_chunk_index - right.route_chunk_index);
  if (actual.length !== expected.length || expected.some((chunk, index) =>
    stableJson(chunk as unknown as JsonValue) !== stableJson(actual[index]?.route_ids as unknown as JsonValue))) {
    throw new Error(`${window.year} ${window.start}..${window.end}: incomplete route chunk receipts`);
  }
}

function existingScheduleSnapshot(
  year: 2023 | 2024 | 2025 | 2026,
  datasetId: string,
  universeSha: string,
  windows: readonly ScheduleRequestWindow[],
): OperationalSnapshot | undefined {
  const sourceId = `mta_bus_schedules_${year}_candidate_windows`;
  const sourceDir = join(repoRoot, "raw/sources", sourceId);
  const csvPath = join(sourceDir, "source.csv");
  const receiptPath = join(sourceDir, "receipt.json");
  if (!existsSync(sourceDir)) return undefined;
  if (!existsSync(csvPath) || !existsSync(receiptPath)) {
    throw new Error(`${sourceId}: incomplete resumable source; source.csv and receipt.json are both required`);
  }
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as {
    dataset_id?: string;
    retrieved_at?: string;
    requests_complete?: boolean;
    request_universe_sha256?: string;
    merged_sha256?: string;
    merged_row_count?: number;
    min_schedule_date?: string;
    max_schedule_date?: string;
    queries?: QueryReceipt[];
  };
  if (receipt.dataset_id !== datasetId || receipt.requests_complete !== true ||
      receipt.request_universe_sha256 !== universeSha || receipt.merged_sha256 !== fileSha256(csvPath) ||
      typeof receipt.retrieved_at !== "string" || typeof receipt.merged_row_count !== "number" ||
      typeof receipt.min_schedule_date !== "string" || typeof receipt.max_schedule_date !== "string" ||
      !Array.isArray(receipt.queries)) {
    throw new Error(`${sourceId}: resumable receipt does not match the exact request universe/content`);
  }
  for (const window of windows) assertCompleteRouteChunks(window, receipt.queries);
  const base = `raw/sources/${sourceId}`;
  return {
    snapshot_id: `mta-bus-schedules-${year}-candidate-windows`,
    kind: "bus_schedules_year",
    source_id: sourceId,
    label: `${year}-candidate-windows`,
    retrieved_at: receipt.retrieved_at,
    source_url: `https://data.ny.gov/resource/${datasetId}`,
    dataset_id: datasetId,
    service_window: { start: receipt.min_schedule_date, end: receipt.max_schedule_date },
    request_universe_sha256: universeSha,
    request_window_count: windows.length,
    artifacts: [
      { path: `${base}/source.csv`, sha256: receipt.merged_sha256, bytes: statSync(csvPath).size, rows: receipt.merged_row_count },
      { path: `${base}/receipt.json`, sha256: fileSha256(receiptPath), bytes: statSync(receiptPath).size },
    ],
  };
}

async function sortedJsonlToCsv(sortedPath: string, csvPath: string): Promise<{
  rowCount: number;
  minDate: string;
  maxDate: string;
}> {
  const output = createWriteStream(csvPath, { encoding: "utf8" });
  output.write(`${BUS_SCHEDULE_COLUMNS.join(",")}\n`);
  const lines = createInterface({ input: createReadStream(sortedPath, { encoding: "utf8" }), crlfDelay: Infinity });
  let rowCount = 0;
  let minDate = "";
  let maxDate = "";
  for await (const line of lines) {
    if (!line) continue;
    const separator = line.indexOf("\t");
    if (separator === -1) throw new Error("Sorted schedule row has no key separator");
    const row = JSON.parse(line.slice(separator + 1)) as CsvRecord;
    const date = isoDate(row.schedule_date ?? "");
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
    rowCount += 1;
    if (!output.write(`${BUS_SCHEDULE_COLUMNS.map((field) => csvCell(row[field] ?? "")).join(",")}\n`)) {
      await once(output, "drain");
    }
  }
  output.end();
  await once(output, "finish");
  if (rowCount === 0 || !minDate || !maxDate) throw new Error("Merged schedule capture is empty");
  return { rowCount, minDate, maxDate };
}

export type ScheduleCaptureResult = {
  snapshots: OperationalSnapshot[];
  universe: ScheduleRequestUniverse;
  universe_sha256: string;
};

export const X64_PREDECESSOR_SNAPSHOT_ID = "mta-bus-schedules-2025-x64-predecessor-2026-07-23" as const;

export function registeredX64PredecessorSnapshot(
  snapshots: readonly OperationalSnapshot[],
): OperationalSnapshot | undefined {
  const matches = snapshots.filter((snapshot) => snapshot.snapshot_id === X64_PREDECESSOR_SNAPSHOT_ID);
  if (matches.length > 1) throw new Error(`${X64_PREDECESSOR_SNAPSHOT_ID}: duplicate immutable snapshot id`);
  const snapshot = matches[0];
  if (snapshot && (snapshot.kind !== "bus_schedules_year" || snapshot.source_id !== "mta_bus_schedules_2025_x64_predecessor_2026_07_23")) {
    throw new Error(`${X64_PREDECESSOR_SNAPSHOT_ID}: immutable identity metadata mismatch`);
  }
  return snapshot;
}

export function loadRegisteredX64PredecessorSnapshot(
  registryPath = OPERATIONAL_REFERENCE_REGISTRY_PATH,
): OperationalSnapshot | undefined {
  if (!existsSync(registryPath)) return undefined;
  return registeredX64PredecessorSnapshot(loadOperationalSnapshotRegistry(registryPath).snapshots);
}

export async function captureX64PredecessorSnapshot(): Promise<OperationalSnapshot> {
  const existing = loadRegisteredX64PredecessorSnapshot();
  if (existing) return existing;
  const sourceId = "mta_bus_schedules_2025_x64_predecessor_2026_07_23";
  const datasetId = BUS_SCHEDULE_DATASETS[2025];
  const window: ScheduleRequestWindow = {
    year: 2025,
    dataset_id: datasetId,
    route_ids: ["X64"],
    start: "2025-06-02",
    end: "2025-07-28",
    reasons: ["qm64_documented_x64_predecessor_plus_minus_28_days"],
    candidate_ids: ["occurrence:8e0377c6acfe62e1a61d910b"],
  };
  const universe = {
    schema_version: 1,
    generated_from: {
      source_record: "event_qm64-qbnr-rename-2025-06-30",
      evidence_literal: "The X64 became the QM64 on June 30, 2025.",
    },
    windows: [window],
  };
  const universeSha = createHash("sha256").update(`${stableJson(universe as unknown as JsonValue)}\n`).digest("hex");
  const root = mkdtempSync(join(tmpdir(), "mta-wiki-x64-capture-"));
  const unsortedPath = join(root, "rows.unsorted.txt");
  const sortedPath = join(root, "rows.sorted.txt");
  writeFileSync(unsortedPath, "", "utf8");
  const retrievedAt = new Date().toISOString();
  const queries = [await fetchWindow(datasetId, window, ["X64"], 0, unsortedPath)];
  assertCompleteRouteChunks(window, queries);
  const sortedDescriptor = openSync(sortedPath, "w");
  const sortResult = spawnSync("/usr/bin/sort", ["-u", unsortedPath], {
    stdio: ["ignore", sortedDescriptor, "inherit"],
    env: { ...process.env, LC_ALL: "C" },
  });
  closeSync(sortedDescriptor);
  if (sortResult.status !== 0) throw new Error(`X64 schedule sort failed with status ${sortResult.status}`);
  const csvPath = join(root, "source.csv");
  const merged = await sortedJsonlToCsv(sortedPath, csvPath);
  const receipt = {
    schema_version: 1,
    source_id: sourceId,
    dataset_id: datasetId,
    source_url: `https://data.ny.gov/resource/${datasetId}`,
    retrieved_at: retrievedAt,
    columns: [...BUS_SCHEDULE_COLUMNS],
    requests_complete: true,
    route_batch_size: BUS_SCHEDULE_ROUTE_BATCH_SIZE,
    expected_query_count: 1,
    request_universe_sha256: universeSha,
    request_windows: [window],
    queries,
    query_row_count: queries[0]!.row_count,
    merged_row_count: merged.rowCount,
    merged_sha256: fileSha256(csvPath),
    min_schedule_date: merged.minDate,
    max_schedule_date: merged.maxDate,
  };
  const receiptPath = join(root, "receipt.json");
  writeFileSync(receiptPath, `${stableJson(receipt as unknown as JsonValue)}\n`, "utf8");
  const snapshot = stageScheduleSnapshot({
    year: 2025,
    datasetId,
    retrievedAt,
    csvPath,
    receiptPath,
    requestUniverseSha256: universeSha,
    requestWindowCount: 1,
    minDate: merged.minDate,
    maxDate: merged.maxDate,
    sourceId,
    snapshotId: X64_PREDECESSOR_SNAPSHOT_ID,
    label: "2025-x64-predecessor-2026-07-23",
  });
  rmSync(root, { recursive: true, force: true });
  return snapshot;
}

export async function captureScheduleSnapshots(
  universe = buildScheduleRequestUniverse(),
): Promise<ScheduleCaptureResult> {
  const universeBytes = `${stableJson(universe as unknown as JsonValue)}\n`;
  const universeSha = createHash("sha256").update(universeBytes).digest("hex");
  const registry = loadOperationalSnapshotRegistryIfPresent();
  if (registry) {
    const existing = snapshotsByKind(registry, "bus_schedules_year")
      .filter((snapshot) => BASE_BUS_SCHEDULE_SNAPSHOT_IDS.includes(snapshot.snapshot_id));
    if (existing.length > 0) {
      if (existing.length !== 4 || existing.some((snapshot) => snapshot.request_universe_sha256 !== universeSha)) {
        throw new Error("Existing schedule snapshots do not form the exact immutable four-year request universe; use new versioned source/snapshot ids for a recapture");
      }
      const validation = validateOperationalReferenceRegistry();
      const statuses = new Map(validation.snapshots.map((status) => [status.snapshot_id, status.status]));
      if (existing.some((snapshot) => statuses.get(snapshot.snapshot_id) !== "verified")) {
        throw new Error("Existing immutable schedule snapshot raw is absent or invalid; refusing to overwrite fixed snapshot ids");
      }
      return { snapshots: existing, universe, universe_sha256: universeSha };
    }
  }
  const retrievedAt = new Date().toISOString();
  const captureRoot = mkdtempSync(join(tmpdir(), "mta-wiki-schedule-capture-"));
  const universePath = join(captureRoot, "schedule-request-universe.json");
  mkdirSync(dirname(universePath), { recursive: true });
  writeFileSync(universePath, universeBytes, "utf8");
  const snapshots: OperationalSnapshot[] = [];
  for (const year of [2023, 2024, 2025, 2026] as const) {
    const windows = universe.windows.filter((window) => window.year === year);
    if (windows.length === 0) throw new Error(`Schedule request universe has no ${year} windows`);
    const datasetId = BUS_SCHEDULE_DATASETS[year];
    const resumed = existingScheduleSnapshot(year, datasetId, universeSha, windows);
    if (resumed) {
      snapshots.push(resumed);
      continue;
    }
    const tempRoot = join(captureRoot, `schedule-${year}`);
    mkdirSync(tempRoot, { recursive: true });
    const unsortedPath = join(tempRoot, "rows.unsorted.txt");
    const sortedPath = join(tempRoot, "rows.sorted.txt");
    writeFileSync(unsortedPath, "", "utf8");
    const queries: QueryReceipt[] = [];
    for (const window of windows) {
      const chunks = routeChunks(window.route_ids);
      for (const [chunkIndex, chunk] of chunks.entries()) {
        queries.push(await fetchWindow(datasetId, window, chunk, chunkIndex, unsortedPath));
      }
      assertCompleteRouteChunks(window, queries);
    }
    const sortedDescriptor = openSync(sortedPath, "w");
    const sortResult = spawnSync("/usr/bin/sort", ["-u", unsortedPath], {
      stdio: ["ignore", sortedDescriptor, "inherit"],
      env: { ...process.env, LC_ALL: "C" },
    });
    closeSync(sortedDescriptor);
    if (sortResult.status !== 0) throw new Error(`Schedule sort failed for ${year} with status ${sortResult.status}`);
    const csvPath = join(tempRoot, "source.csv");
    const merged = await sortedJsonlToCsv(sortedPath, csvPath);
    const receipt = {
      schema_version: 1,
      source_id: `mta_bus_schedules_${year}_candidate_windows`,
      dataset_id: datasetId,
      source_url: `https://data.ny.gov/resource/${datasetId}`,
      retrieved_at: retrievedAt,
      columns: [...BUS_SCHEDULE_COLUMNS],
      requests_complete: true,
      route_batch_size: BUS_SCHEDULE_ROUTE_BATCH_SIZE,
      expected_query_count: windows.reduce((sum, window) => sum + routeChunks(window.route_ids).length, 0),
      request_universe_sha256: universeSha,
      request_windows: windows,
      queries,
      query_row_count: queries.reduce((sum, query) => sum + query.row_count, 0),
      merged_row_count: merged.rowCount,
      merged_sha256: fileSha256(csvPath),
      min_schedule_date: merged.minDate,
      max_schedule_date: merged.maxDate,
    };
    const receiptPath = join(tempRoot, "receipt.json");
    writeFileSync(receiptPath, `${stableJson(receipt as unknown as JsonValue)}\n`, "utf8");
    snapshots.push(stageScheduleSnapshot({
      year,
      datasetId,
      retrievedAt,
      csvPath,
      receiptPath,
      requestUniverseSha256: universeSha,
      requestWindowCount: windows.length,
      minDate: merged.minDate,
      maxDate: merged.maxDate,
    }));
    rmSync(tempRoot, { recursive: true, force: true });
  }
  rmSync(captureRoot, { recursive: true, force: true });
  return { snapshots, universe, universe_sha256: universeSha };
}

export function scheduleDates(rows: readonly BusScheduleRow[], routeId?: string): string[] {
  return [...new Set(rows.filter((row) => routeId === undefined || row.route_id === routeId).map((row) => row.schedule_date))].sort();
}

export function nearestScheduleDate(
  rows: readonly BusScheduleRow[],
  routeId: string,
  targetDate: string,
  maximumLagDays: number,
  side: "nearest" | "on_or_before" | "on_or_after" = "nearest",
): { date: string; lag_days: number } | undefined {
  const target = new Date(`${targetDate}T00:00:00Z`).valueOf();
  const candidates = scheduleDates(rows, routeId)
    .filter((date) => side === "nearest" || (side === "on_or_before" ? date <= targetDate : date >= targetDate))
    .map((date) => ({ date, lag_days: Math.round(Math.abs(new Date(`${date}T00:00:00Z`).valueOf() - target) / 86_400_000) }))
    .filter((candidate) => candidate.lag_days <= maximumLagDays)
    .sort((left, right) => left.lag_days - right.lag_days || left.date.localeCompare(right.date));
  return candidates[0];
}

export type ScheduleStopChain = {
  route_id: string;
  schedule_date: string;
  direction: string;
  service_id: string;
  shape_id: string;
  block_id: string;
  stops: BusScheduleRow[];
};

export function scheduleStopChains(
  rows: readonly BusScheduleRow[],
  routeId: string,
  scheduleDate: string,
): ScheduleStopChain[] {
  // The official dataset contains scheduled *timepoint* stops and has no trip_id.
  // shape_id is the documented path identity. Repeated trips are therefore reduced
  // to one exact (stop_sequence, stop_id) pattern per direction+shape. This can prove
  // a positive path alignment, but omitted non-timepoint stops cannot prove a negative.
  const groups = new Map<string, BusScheduleRow[]>();
  for (const row of rows) {
    if (row.route_id !== routeId || row.schedule_date !== scheduleDate) continue;
    const key = [row.direction, row.shape_id].join("\0");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, stops]) => {
    const [direction, shapeId] = key.split("\0");
    const uniquePattern = new Map<string, BusScheduleRow>();
    for (const stop of stops) {
      const patternKey = `${stop.stop_sequence}\0${stop.stop_id}`;
      const prior = uniquePattern.get(patternKey);
      if (!prior || stop.schedule_time.localeCompare(prior.schedule_time) < 0) uniquePattern.set(patternKey, stop);
    }
    return {
      route_id: routeId,
      schedule_date: scheduleDate,
      direction: direction ?? "",
      service_id: "timepoint_pattern",
      shape_id: shapeId ?? "",
      block_id: "not_a_trip_identifier",
      stops: [...uniquePattern.values()].sort((left, right) => left.stop_sequence - right.stop_sequence || left.stop_id.localeCompare(right.stop_id)),
    };
  }).sort((left, right) => left.direction.localeCompare(right.direction) || right.stops.length - left.stops.length || left.shape_id.localeCompare(right.shape_id));
}

export function representativeScheduleChains(
  rows: readonly BusScheduleRow[],
  routeId: string,
  scheduleDate: string,
): ScheduleStopChain[] {
  const chains = scheduleStopChains(rows, routeId, scheduleDate);
  const byDirection = new Map<string, ScheduleStopChain>();
  for (const chain of chains) {
    const prior = byDirection.get(chain.direction);
    if (!prior || chain.stops.length > prior.stops.length ||
        (chain.stops.length === prior.stops.length && chain.shape_id < prior.shape_id)) {
      byDirection.set(chain.direction, chain);
    }
  }
  return [...byDirection.values()].sort((left, right) => left.direction.localeCompare(right.direction));
}

export function coordinateCoverage(chain: ScheduleStopChain, gtfs: GtfsCoordinateIndex): {
  covered: number;
  total: number;
  share: number;
} {
  const unique = [...new Set(chain.stops.map((stop) => stop.stop_id))];
  const routeStops = gtfs.stopsByRoute.get(chain.route_id) ?? gtfs.stops;
  const covered = unique.filter((stopId) => routeStops.has(stopId)).length;
  return { covered, total: unique.length, share: unique.length === 0 ? 0 : covered / unique.length };
}
