import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, StagedSourceBlock, StagedSourceMetadata } from "@mta-wiki/db/types";

export const OPERATIONAL_REFERENCE_SCHEMA_VERSION = 1 as const;
export const OPERATIONAL_REFERENCE_REGISTRY_ID = "operational-reference-snapshots-v1" as const;
export const OPERATIONAL_REFERENCE_REGISTRY_PATH = join(
  repoRoot,
  "data/reference/operational/snapshots.json",
);
export const BUS_SCHEDULE_FIELD_METADATA_PATH = join(
  repoRoot,
  "data/reference/operational/bus-schedule-field-metadata.json",
);

export const GTFS_MEMBER_NAMES = [
  "agency.txt",
  "calendar.txt",
  "calendar_dates.txt",
  "routes.txt",
  "shapes.txt",
  "stops.txt",
  "stop_times.txt",
  "trips.txt",
] as const;

export type OperationalSnapshotKind = "gtfs_static" | "dot_bus_lanes" | "bus_schedules_year";

export type OperationalSnapshotArtifact = {
  path: string;
  sha256: string;
  bytes: number;
  rows?: number | undefined;
};

export type OperationalSnapshot = {
  snapshot_id: string;
  kind: OperationalSnapshotKind;
  source_id: string;
  label: string;
  retrieved_at: string;
  source_url: string;
  dataset_id?: string | undefined;
  service_window?: { start: string; end: string } | undefined;
  request_universe_sha256?: string | undefined;
  request_window_count?: number | undefined;
  artifacts: OperationalSnapshotArtifact[];
};

export type OperationalSnapshotRegistry = {
  schema_version: typeof OPERATIONAL_REFERENCE_SCHEMA_VERSION;
  registry_id: typeof OPERATIONAL_REFERENCE_REGISTRY_ID;
  snapshots: OperationalSnapshot[];
  supporting_artifacts: Array<OperationalSnapshotArtifact & { kind: "bus_schedule_field_metadata" }>;
};

export type OperationalReferenceValidationIssue = {
  code: "invalid_operational_reference";
  path: string;
  message: string;
};

export type OperationalReferenceSnapshotStatus = {
  snapshot_id: string;
  source_id: string;
  status: "verified" | "skipped_no_operational_reference_raw" | "invalid_operational_reference";
};

export type OperationalReferenceValidation = {
  registry: OperationalSnapshotRegistry | undefined;
  registry_sha256: string | undefined;
  issues: OperationalReferenceValidationIssue[];
  snapshots: OperationalReferenceSnapshotStatus[];
};

const LOCAL_GTFS_ROOT =
  "/mnt/models/dev/bus-reliability-tracker/data/raw/gtfs-static/current/20260531T010822Z";
const LOCAL_DOT_JSON =
  "/mnt/models/dev/bus-reliability-tracker/data/raw/interventions/bus-lanes-local-streets.json";
const LOCAL_DOT_CSV =
  "/mnt/models/dev/bus-reliability-tracker/data/raw/socrata-bulk/nyc_dot_bus_lanes_local_streets/rows.csv";

const GTFS_BUNDLES = [
  { slug: "bronx", file: "bus_gtfs_bronx", feed: "gtfs_bx" },
  { slug: "brooklyn", file: "bus_gtfs_brooklyn", feed: "gtfs_b" },
  { slug: "manhattan", file: "bus_gtfs_manhattan", feed: "gtfs_m" },
  { slug: "queens", file: "bus_gtfs_queens", feed: "gtfs_q" },
  { slug: "staten_island", file: "bus_gtfs_staten_island", feed: "gtfs_si" },
  { slug: "mta_bus_company", file: "bus_gtfs_mta_bus_company", feed: "gtfs_busco" },
] as const;

function sha256Bytes(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeImmutable(path: string, value: Uint8Array | string): void {
  const incoming = typeof value === "string" ? Buffer.from(value) : value;
  if (existsSync(path)) {
    const current = readFileSync(path);
    if (current.byteLength !== incoming.byteLength || sha256Bytes(current) !== sha256Bytes(incoming)) {
      throw new Error(`Refusing to overwrite immutable operational artifact ${relative(repoRoot, path)}`);
    }
    return;
  }
  writeFileSync(path, incoming);
}

function copyImmutable(source: string, target: string): void {
  if (existsSync(target)) {
    if (statSync(source).size !== statSync(target).size || fileSha256(source) !== fileSha256(target)) {
      throw new Error(`Refusing to overwrite immutable operational artifact ${relative(repoRoot, target)}`);
    }
    return;
  }
  copyFileSync(source, target);
}

export function fileSha256(path: string): string {
  const hash = createHash("sha256");
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  try {
    for (;;) {
      const bytes = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

function countDataRows(path: string): number {
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  let lines = 0;
  let bytesRead = 0;
  let lastByte: number | undefined;
  try {
    for (;;) {
      const bytes = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      bytesRead += bytes;
      lastByte = buffer[bytes - 1];
      for (let index = 0; index < bytes; index += 1) if (buffer[index] === 10) lines += 1;
    }
  } finally {
    closeSync(descriptor);
  }
  if (bytesRead === 0) return 0;
  if (lastByte !== 10) lines += 1;
  return Math.max(0, lines - 1);
}

function normalizedDate(value: string): string {
  if (!/^\d{8}$/u.test(value)) throw new Error(`Invalid compact GTFS date: ${value}`);
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function csvCells(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.replace(/\r$/u, ""));
  return cells;
}

function gtfsServiceWindow(calendarPath: string, calendarDatesPath: string): { start: string; end: string } {
  const dates: string[] = [];
  const calendarLines = readFileSync(calendarPath, "utf8").split(/\n/u).filter(Boolean);
  const calendarHeader = csvCells(calendarLines.shift() ?? "");
  const startIndex = calendarHeader.indexOf("start_date");
  const endIndex = calendarHeader.indexOf("end_date");
  for (const line of calendarLines) {
    const cells = csvCells(line);
    if (cells[startIndex]) dates.push(cells[startIndex]!);
    if (cells[endIndex]) dates.push(cells[endIndex]!);
  }
  const exceptionLines = readFileSync(calendarDatesPath, "utf8").split(/\n/u).filter(Boolean);
  const exceptionHeader = csvCells(exceptionLines.shift() ?? "");
  const dateIndex = exceptionHeader.indexOf("date");
  for (const line of exceptionLines) {
    const value = csvCells(line)[dateIndex];
    if (value) dates.push(value);
  }
  dates.sort();
  const start = dates[0];
  const end = dates.at(-1);
  if (!start || !end) throw new Error(`Unable to derive GTFS service window from ${calendarPath}`);
  return { start: normalizedDate(start), end: normalizedDate(end) };
}

function blockForText(sourceId: string, text: string): StagedSourceBlock {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return {
    source_id: sourceId,
    block_id: "p001_b0001",
    page_number: 1,
    reading_order: 1,
    source_surface: "ocr_text",
    block_kind: "text",
    raw_source_path: `raw/sources/${sourceId}/text.txt`,
    raw_start_char: 0,
    raw_end_char: text.length,
    raw_text: text,
    normalized_text: normalized,
    raw_text_sha256: sha256Bytes(text),
    normalized_text_sha256: sha256Bytes(normalized),
  };
}

function writeSourceScaffold(sourceId: string, metadata: StagedSourceMetadata, receiptText: string): void {
  const sourceDir = join(repoRoot, "raw/sources", sourceId);
  mkdirSync(sourceDir, { recursive: true });
  writeImmutable(join(sourceDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  writeImmutable(join(sourceDir, "text.txt"), receiptText);
  writeImmutable(join(sourceDir, "blocks.jsonl"), `${JSON.stringify(blockForText(sourceId, receiptText))}\n`);
}

function artifact(path: string, rows?: number): OperationalSnapshotArtifact {
  const absolutePath = join(repoRoot, path);
  return {
    path,
    sha256: fileSha256(absolutePath),
    bytes: statSync(absolutePath).size,
    ...(rows === undefined ? {} : { rows }),
  };
}

function headerValue(headers: string, name: string): string | undefined {
  const match = headers.match(new RegExp(`^${name}:\\s*(.+?)\\r?$`, "imu"));
  return match?.[1]?.trim();
}

export function stageLocalGtfsSnapshots(): OperationalSnapshot[] {
  if (!existsSync(LOCAL_GTFS_ROOT)) throw new Error(`Missing local GTFS capture: ${LOCAL_GTFS_ROOT}`);
  const snapshots: OperationalSnapshot[] = [];
  for (const bundle of GTFS_BUNDLES) {
    const sourceId = `gtfs_static_20260531_${bundle.slug}`;
    const sourceDir = join(repoRoot, "raw/sources", sourceId);
    const zipSource = join(LOCAL_GTFS_ROOT, `${bundle.file}.zip`);
    const headersSource = join(LOCAL_GTFS_ROOT, `${bundle.file}.headers.txt`);
    if (!existsSync(zipSource) || !existsSync(headersSource)) {
      throw new Error(`Missing local GTFS bundle files for ${bundle.file}`);
    }
    mkdirSync(join(sourceDir, "extracted"), { recursive: true });
    const zipTarget = join(sourceDir, "source.zip");
    copyImmutable(zipSource, zipTarget);
    copyImmutable(headersSource, join(sourceDir, "headers.txt"));
    for (const member of GTFS_MEMBER_NAMES) {
      const result = spawnSync("/usr/bin/unzip", ["-p", zipTarget, member], {
        encoding: null,
        maxBuffer: 1024 * 1024 * 512,
      });
      if (result.status !== 0 || !result.stdout) {
        throw new Error(`Unable to extract ${member} from ${zipTarget}: ${String(result.stderr)}`);
      }
      writeImmutable(join(sourceDir, "extracted", member), result.stdout);
    }
    const headers = readFileSync(headersSource, "utf8");
    const members = GTFS_MEMBER_NAMES.map((member) => {
      const path = join(sourceDir, "extracted", member);
      return { member, sha256: fileSha256(path), bytes: statSync(path).size, rows: countDataRows(path) };
    });
    const serviceWindow = gtfsServiceWindow(
      join(sourceDir, "extracted/calendar.txt"),
      join(sourceDir, "extracted/calendar_dates.txt"),
    );
    const zipSha = fileSha256(zipTarget);
    const receipt = {
      schema_version: 1,
      source_id: sourceId,
      snapshot_label: "20260531T010822Z",
      official_url: `https://rrgtfsfeeds.s3.amazonaws.com/${bundle.feed}.zip`,
      retrieved_at: headerValue(headers, "Date") ?? "Sun, 31 May 2026 01:09:00 GMT",
      etag: headerValue(headers, "ETag") ?? null,
      last_modified: headerValue(headers, "Last-Modified") ?? null,
      zip_sha256: zipSha,
      zip_bytes: statSync(zipTarget).size,
      service_window: serviceWindow,
      members,
    };
    writeImmutable(join(sourceDir, "receipt.json"), `${stableJson(receipt as unknown as JsonValue)}\n`);
    const receiptText = [
      `Official MTA GTFS static capture for ${bundle.slug}.`,
      `Retrieved: ${receipt.retrieved_at}`,
      `ZIP SHA-256: ${zipSha}`,
      `Service window: ${serviceWindow.start} through ${serviceWindow.end}`,
      ...members.map((member) => `${member.member}: ${member.rows} rows, SHA-256 ${member.sha256}`),
      "",
    ].join("\n");
    writeSourceScaffold(sourceId, {
      sourceId,
      title: `MTA GTFS static ${bundle.slug} 2026-05-31`,
      publisher: "Metropolitan Transportation Authority",
      sourceGroup: "gtfs_static",
      sourceUrl: receipt.official_url,
      documentDate: "2026-05-31",
      retrievedAt: receipt.retrieved_at,
      contentType: "application/zip",
      sha256: zipSha,
      byteLength: statSync(zipTarget).size,
      termsNote: `Immutable retrieval receipt. ETag ${receipt.etag ?? "unavailable"}; Last-Modified ${receipt.last_modified ?? "unavailable"}.`,
      etag: receipt.etag,
      lastModified: receipt.last_modified,
    }, receiptText);
    const base = `raw/sources/${sourceId}`;
    snapshots.push({
      snapshot_id: `gtfs-static-20260531-${bundle.slug}`,
      kind: "gtfs_static",
      source_id: sourceId,
      label: "20260531T010822Z",
      retrieved_at: receipt.retrieved_at,
      source_url: receipt.official_url,
      service_window: serviceWindow,
      artifacts: [
        artifact(`${base}/source.zip`),
        artifact(`${base}/receipt.json`),
        ...members.map((member) => artifact(`${base}/extracted/${member.member}`, member.rows)),
      ],
    });
  }
  return snapshots;
}

export function stageLocalDotSnapshot(): OperationalSnapshot {
  if (!existsSync(LOCAL_DOT_JSON) || !existsSync(LOCAL_DOT_CSV)) {
    throw new Error("Missing local NYC DOT bus-lane capture");
  }
  const sourceId = "nyc_dot_bus_lanes_local_streets_2026_07_11";
  const sourceDir = join(repoRoot, "raw/sources", sourceId);
  mkdirSync(sourceDir, { recursive: true });
  copyImmutable(LOCAL_DOT_JSON, join(sourceDir, "source.json"));
  copyImmutable(LOCAL_DOT_CSV, join(sourceDir, "rows.csv"));
  const parsed = JSON.parse(readFileSync(LOCAL_DOT_JSON, "utf8")) as {
    fetchedAt: string;
    rows: unknown[];
  };
  const receipt = {
    schema_version: 1,
    source_id: sourceId,
    dataset_id: "ycrg-ses3",
    retrieved_at: parsed.fetchedAt,
    json_rows: parsed.rows.length,
    csv_rows: countDataRows(LOCAL_DOT_CSV),
    json_sha256: fileSha256(LOCAL_DOT_JSON),
    csv_sha256: fileSha256(LOCAL_DOT_CSV),
    representation_note: "The tracker JSON projection omits empty Socrata columns; rows.csv preserves the complete export schema.",
  };
  writeImmutable(join(sourceDir, "receipt.json"), `${stableJson(receipt as unknown as JsonValue)}\n`);
  const receiptText = [
    "Official NYC DOT Bus Lanes: Local Streets capture (dataset ycrg-ses3).",
    `Retrieved: ${parsed.fetchedAt}`,
    `JSON features: ${parsed.rows.length}; CSV rows: ${receipt.csv_rows}.`,
    receipt.representation_note,
    "",
  ].join("\n");
  writeSourceScaffold(sourceId, {
    sourceId,
    title: "NYC DOT Bus Lanes: Local Streets 2026-07-11",
    publisher: "New York City Department of Transportation",
    sourceGroup: "operational_reference",
    sourceUrl: "https://data.cityofnewyork.us/resource/ycrg-ses3",
    documentDate: "2026-07-11",
    retrievedAt: parsed.fetchedAt,
    contentType: "application/json",
    sha256: receipt.json_sha256,
    byteLength: statSync(LOCAL_DOT_JSON).size,
  }, receiptText);
  const base = `raw/sources/${sourceId}`;
  return {
    snapshot_id: "nyc-dot-bus-lanes-local-streets-2026-07-11",
    kind: "dot_bus_lanes",
    source_id: sourceId,
    label: "2026-07-11",
    retrieved_at: parsed.fetchedAt,
    source_url: "https://data.cityofnewyork.us/resource/ycrg-ses3",
    dataset_id: "ycrg-ses3",
    artifacts: [
      artifact(`${base}/source.json`, parsed.rows.length),
      artifact(`${base}/rows.csv`, receipt.csv_rows),
      artifact(`${base}/receipt.json`),
    ],
  };
}

export function stageDownloadedDotSnapshot(input: {
  date: string;
  retrievedAt: string;
  geojsonPath: string;
  responseHeadersPath: string;
}): OperationalSnapshot {
  const dateSlug = input.date.replaceAll("-", "_");
  const sourceId = `nyc_dot_bus_lanes_local_streets_${dateSlug}`;
  const sourceDir = join(repoRoot, "raw/sources", sourceId);
  mkdirSync(sourceDir, { recursive: true });
  copyImmutable(input.geojsonPath, join(sourceDir, "source.geojson"));
  copyImmutable(input.responseHeadersPath, join(sourceDir, "headers.txt"));
  const parsed = JSON.parse(readFileSync(input.geojsonPath, "utf8")) as { features?: unknown[] };
  if (!Array.isArray(parsed.features)) throw new Error("Fresh DOT capture is not a GeoJSON FeatureCollection");
  const receipt = {
    schema_version: 1,
    source_id: sourceId,
    dataset_id: "ycrg-ses3",
    retrieved_at: input.retrievedAt,
    feature_count: parsed.features.length,
    geojson_sha256: fileSha256(input.geojsonPath),
    geojson_bytes: statSync(input.geojsonPath).size,
  };
  writeImmutable(join(sourceDir, "receipt.json"), `${stableJson(receipt as unknown as JsonValue)}\n`);
  const receiptText = [
    "Fresh official NYC DOT Bus Lanes: Local Streets GeoJSON export (dataset ycrg-ses3).",
    `Retrieved: ${input.retrievedAt}`,
    `Features: ${parsed.features.length}; SHA-256 ${receipt.geojson_sha256}.`,
    "",
  ].join("\n");
  writeSourceScaffold(sourceId, {
    sourceId,
    title: `NYC DOT Bus Lanes: Local Streets ${input.date}`,
    publisher: "New York City Department of Transportation",
    sourceGroup: "operational_reference",
    sourceUrl: "https://data.cityofnewyork.us/resource/ycrg-ses3.geojson",
    documentDate: input.date,
    retrievedAt: input.retrievedAt,
    contentType: "application/geo+json",
    sha256: receipt.geojson_sha256,
    byteLength: statSync(input.geojsonPath).size,
  }, receiptText);
  const base = `raw/sources/${sourceId}`;
  return {
    snapshot_id: `nyc-dot-bus-lanes-local-streets-${input.date}`,
    kind: "dot_bus_lanes",
    source_id: sourceId,
    label: input.date,
    retrieved_at: input.retrievedAt,
    source_url: "https://data.cityofnewyork.us/resource/ycrg-ses3.geojson",
    dataset_id: "ycrg-ses3",
    artifacts: [
      artifact(`${base}/source.geojson`, parsed.features.length),
      artifact(`${base}/receipt.json`),
    ],
  };
}

export function stageScheduleSnapshot(input: {
  year: number;
  datasetId: string;
  retrievedAt: string;
  csvPath: string;
  receiptPath: string;
  requestUniverseSha256: string;
  requestWindowCount: number;
  minDate: string;
  maxDate: string;
  sourceId?: string | undefined;
  snapshotId?: string | undefined;
  label?: string | undefined;
}): OperationalSnapshot {
  const sourceId = input.sourceId ?? `mta_bus_schedules_${input.year}_candidate_windows`;
  const sourceDir = join(repoRoot, "raw/sources", sourceId);
  mkdirSync(sourceDir, { recursive: true });
  copyImmutable(input.csvPath, join(sourceDir, "source.csv"));
  copyImmutable(input.receiptPath, join(sourceDir, "receipt.json"));
  const rows = countDataRows(input.csvPath);
  const csvSha = fileSha256(input.csvPath);
  const receiptText = [
    `Official MTA Bus Schedules ${input.year} event-window capture (dataset ${input.datasetId}).`,
    `Retrieved: ${input.retrievedAt}`,
    `Rows: ${rows}; SHA-256 ${csvSha}.`,
    `Captured schedule dates: ${input.minDate} through ${input.maxDate}.`,
    `Request windows: ${input.requestWindowCount}; universe SHA-256 ${input.requestUniverseSha256}.`,
    "",
  ].join("\n");
  writeSourceScaffold(sourceId, {
    sourceId,
    title: `MTA Bus Schedules ${input.year}: candidate event windows`,
    publisher: "Metropolitan Transportation Authority",
    sourceGroup: "operational_reference",
    sourceUrl: `https://data.ny.gov/resource/${input.datasetId}`,
    documentDate: String(input.year),
    retrievedAt: input.retrievedAt,
    contentType: "text/csv",
    sha256: csvSha,
    byteLength: statSync(input.csvPath).size,
  }, receiptText);
  const base = `raw/sources/${sourceId}`;
  return {
    snapshot_id: input.snapshotId ?? `mta-bus-schedules-${input.year}-candidate-windows`,
    kind: "bus_schedules_year",
    source_id: sourceId,
    label: input.label ?? `${input.year}-candidate-windows`,
    retrieved_at: input.retrievedAt,
    source_url: `https://data.ny.gov/resource/${input.datasetId}`,
    dataset_id: input.datasetId,
    service_window: { start: input.minDate, end: input.maxDate },
    request_universe_sha256: input.requestUniverseSha256,
    request_window_count: input.requestWindowCount,
    artifacts: [
      artifact(`${base}/source.csv`, rows),
      artifact(`${base}/receipt.json`),
    ],
  };
}

export function writeOperationalSnapshotRegistry(snapshots: readonly OperationalSnapshot[]): OperationalSnapshotRegistry {
  const supportingArtifacts: OperationalSnapshotRegistry["supporting_artifacts"] = existsSync(BUS_SCHEDULE_FIELD_METADATA_PATH) ? [{
    kind: "bus_schedule_field_metadata",
    path: relative(repoRoot, BUS_SCHEDULE_FIELD_METADATA_PATH),
    sha256: fileSha256(BUS_SCHEDULE_FIELD_METADATA_PATH),
    bytes: statSync(BUS_SCHEDULE_FIELD_METADATA_PATH).size,
  }] : [];
  const registry: OperationalSnapshotRegistry = {
    schema_version: OPERATIONAL_REFERENCE_SCHEMA_VERSION,
    registry_id: OPERATIONAL_REFERENCE_REGISTRY_ID,
    snapshots: [...snapshots].sort((left, right) => left.snapshot_id.localeCompare(right.snapshot_id)),
    supporting_artifacts: supportingArtifacts,
  };
  mkdirSync(dirname(OPERATIONAL_REFERENCE_REGISTRY_PATH), { recursive: true });
  writeFileSync(OPERATIONAL_REFERENCE_REGISTRY_PATH, `${stableJson(registry as unknown as JsonValue)}\n`, "utf8");
  return registry;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateExactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${label}: unknown keys ${unknown.sort().join(", ")}`);
}

function decodeRegistry(value: unknown): OperationalSnapshotRegistry {
  if (!isObject(value)) throw new Error("registry must be an object");
  validateExactKeys(value, ["schema_version", "registry_id", "snapshots", "supporting_artifacts"], "registry");
  if (value.schema_version !== OPERATIONAL_REFERENCE_SCHEMA_VERSION ||
      value.registry_id !== OPERATIONAL_REFERENCE_REGISTRY_ID || !Array.isArray(value.snapshots)) {
    throw new Error("registry header is invalid");
  }
  const snapshots = value.snapshots.map((raw, index): OperationalSnapshot => {
    if (!isObject(raw)) throw new Error(`snapshots[${index}] must be an object`);
    validateExactKeys(raw, [
      "snapshot_id", "kind", "source_id", "label", "retrieved_at", "source_url", "dataset_id",
      "service_window", "request_universe_sha256", "request_window_count", "artifacts",
    ], `snapshots[${index}]`);
    if (typeof raw.snapshot_id !== "string" || typeof raw.source_id !== "string" ||
        typeof raw.label !== "string" || typeof raw.retrieved_at !== "string" ||
        typeof raw.source_url !== "string" ||
        !["gtfs_static", "dot_bus_lanes", "bus_schedules_year"].includes(String(raw.kind)) ||
        !Array.isArray(raw.artifacts)) {
      throw new Error(`snapshots[${index}] has invalid required fields`);
    }
    if (raw.service_window !== undefined) {
      if (!isObject(raw.service_window)) throw new Error(`snapshots[${index}].service_window is invalid`);
      validateExactKeys(raw.service_window, ["start", "end"], `snapshots[${index}].service_window`);
      if (typeof raw.service_window.start !== "string" || typeof raw.service_window.end !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/u.test(raw.service_window.start) || !/^\d{4}-\d{2}-\d{2}$/u.test(raw.service_window.end)) {
        throw new Error(`snapshots[${index}].service_window is invalid`);
      }
    }
    if ((raw.dataset_id !== undefined && typeof raw.dataset_id !== "string") ||
        (raw.request_universe_sha256 !== undefined && !/^[a-f0-9]{64}$/u.test(String(raw.request_universe_sha256))) ||
        (raw.request_window_count !== undefined && (typeof raw.request_window_count !== "number" ||
          !Number.isInteger(raw.request_window_count) || raw.request_window_count < 0))) {
      throw new Error(`snapshots[${index}] has invalid optional fields`);
    }
    const artifacts = raw.artifacts.map((rawArtifact, artifactIndex): OperationalSnapshotArtifact => {
      if (!isObject(rawArtifact)) throw new Error(`snapshots[${index}].artifacts[${artifactIndex}] must be an object`);
      validateExactKeys(rawArtifact, ["path", "sha256", "bytes", "rows"], `artifact ${index}/${artifactIndex}`);
      if (typeof rawArtifact.path !== "string" || !/^[a-f0-9]{64}$/u.test(String(rawArtifact.sha256)) ||
          typeof rawArtifact.bytes !== "number" || !Number.isInteger(rawArtifact.bytes) || rawArtifact.bytes < 0 ||
          (rawArtifact.rows !== undefined && (typeof rawArtifact.rows !== "number" || !Number.isInteger(rawArtifact.rows) || rawArtifact.rows < 0))) {
        throw new Error(`snapshots[${index}].artifacts[${artifactIndex}] is invalid`);
      }
      return {
        path: rawArtifact.path,
        sha256: String(rawArtifact.sha256),
        bytes: rawArtifact.bytes,
        ...(typeof rawArtifact.rows === "number" ? { rows: rawArtifact.rows } : {}),
      };
    });
    return {
      snapshot_id: raw.snapshot_id,
      kind: raw.kind as OperationalSnapshotKind,
      source_id: raw.source_id,
      label: raw.label,
      retrieved_at: raw.retrieved_at,
      source_url: raw.source_url,
      ...(typeof raw.dataset_id === "string" ? { dataset_id: raw.dataset_id } : {}),
      ...(raw.service_window === undefined ? {} : { service_window: raw.service_window as { start: string; end: string } }),
      ...(typeof raw.request_universe_sha256 === "string" ? { request_universe_sha256: raw.request_universe_sha256 } : {}),
      ...(typeof raw.request_window_count === "number" ? { request_window_count: raw.request_window_count } : {}),
      artifacts,
    };
  });
  if (value.supporting_artifacts !== undefined && !Array.isArray(value.supporting_artifacts)) {
    throw new Error("registry.supporting_artifacts must be an array");
  }
  const supportingArtifacts = (value.supporting_artifacts ?? []).map((raw, index) => {
    if (!isObject(raw)) throw new Error(`supporting_artifacts[${index}] must be an object`);
    validateExactKeys(raw, ["kind", "path", "sha256", "bytes"], `supporting_artifacts[${index}]`);
    if (raw.kind !== "bus_schedule_field_metadata" || typeof raw.path !== "string" ||
        !/^[a-f0-9]{64}$/u.test(String(raw.sha256)) || typeof raw.bytes !== "number" ||
        !Number.isInteger(raw.bytes) || raw.bytes < 0) {
      throw new Error(`supporting_artifacts[${index}] is invalid`);
    }
    return { kind: "bus_schedule_field_metadata" as const, path: raw.path, sha256: String(raw.sha256), bytes: raw.bytes };
  });
  const ids = snapshots.map((snapshot) => snapshot.snapshot_id);
  if (new Set(ids).size !== ids.length) throw new Error("snapshot ids must be unique");
  if (ids.some((id, index) => id !== [...ids].sort()[index])) throw new Error("snapshots must be sorted by snapshot_id");
  return {
    schema_version: OPERATIONAL_REFERENCE_SCHEMA_VERSION,
    registry_id: OPERATIONAL_REFERENCE_REGISTRY_ID,
    snapshots,
    supporting_artifacts: supportingArtifacts,
  };
}

export function loadOperationalSnapshotRegistry(path = OPERATIONAL_REFERENCE_REGISTRY_PATH): OperationalSnapshotRegistry {
  return decodeRegistry(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export function loadOperationalSnapshotRegistryIfPresent(
  path = OPERATIONAL_REFERENCE_REGISTRY_PATH,
): OperationalSnapshotRegistry | undefined {
  return existsSync(path) ? loadOperationalSnapshotRegistry(path) : undefined;
}

export function operationalSnapshotRegistrySha256(path = OPERATIONAL_REFERENCE_REGISTRY_PATH): string {
  return fileSha256(path);
}

export function snapshotById(registry: OperationalSnapshotRegistry, snapshotId: string): OperationalSnapshot {
  const snapshot = registry.snapshots.find((candidate) => candidate.snapshot_id === snapshotId);
  if (!snapshot) throw new Error(`Unknown operational snapshot: ${snapshotId}`);
  return snapshot;
}

export function snapshotsByKind(
  registry: OperationalSnapshotRegistry,
  kind: OperationalSnapshotKind,
): OperationalSnapshot[] {
  return registry.snapshots.filter((snapshot) => snapshot.kind === kind);
}

export function selectOperationalSnapshots(
  registry: OperationalSnapshotRegistry,
  snapshotIds: readonly string[],
  expectedKind: OperationalSnapshotKind,
): OperationalSnapshot[] {
  if (snapshotIds.length === 0) throw new Error(`Explicit ${expectedKind} snapshot ids are required`);
  if (new Set(snapshotIds).size !== snapshotIds.length) throw new Error(`Duplicate ${expectedKind} snapshot id`);
  return [...snapshotIds].map((snapshotId) => {
    const snapshot = snapshotById(registry, snapshotId);
    if (snapshot.kind !== expectedKind) {
      throw new Error(`${snapshotId}: expected ${expectedKind}, received ${snapshot.kind}`);
    }
    return snapshot;
  });
}

export function validateOperationalReferenceRegistry(
  path = OPERATIONAL_REFERENCE_REGISTRY_PATH,
  root = repoRoot,
): OperationalReferenceValidation {
  const issues: OperationalReferenceValidationIssue[] = [];
  const statuses: OperationalReferenceSnapshotStatus[] = [];
  if (!existsSync(path)) {
    issues.push({ code: "invalid_operational_reference", path: relative(root, path), message: "Operational reference registry is missing." });
    return { registry: undefined, registry_sha256: undefined, issues, snapshots: statuses };
  }
  let registry: OperationalSnapshotRegistry;
  try {
    registry = loadOperationalSnapshotRegistry(path);
  } catch (error) {
    issues.push({
      code: "invalid_operational_reference",
      path: relative(root, path),
      message: error instanceof Error ? error.message : String(error),
    });
    return { registry: undefined, registry_sha256: fileSha256(path), issues, snapshots: statuses };
  }
  for (const snapshot of registry.snapshots) {
    const sourceDir = join(root, "raw/sources", snapshot.source_id);
    if (!existsSync(sourceDir)) {
      statuses.push({ snapshot_id: snapshot.snapshot_id, source_id: snapshot.source_id, status: "skipped_no_operational_reference_raw" });
      continue;
    }
    let valid = true;
    const metadataPath = join(sourceDir, "metadata.json");
    if (!existsSync(metadataPath)) {
      valid = false;
      issues.push({ code: "invalid_operational_reference", path: relative(root, metadataPath), message: "Present operational source is missing metadata.json." });
    } else {
      try {
        const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as unknown;
        const metadataArtifact = isObject(metadata) && typeof metadata.sha256 === "string"
          ? snapshot.artifacts.find((artifact) => artifact.sha256 === metadata.sha256)
          : undefined;
        if (!isObject(metadata) || metadata.sourceId !== snapshot.source_id || typeof metadata.sha256 !== "string" ||
            !/^[a-f0-9]{64}$/u.test(metadata.sha256) || !metadataArtifact ||
            typeof metadata.byteLength !== "number" || !Number.isInteger(metadata.byteLength) ||
            metadata.byteLength !== metadataArtifact.bytes) {
          throw new Error("metadata sourceId/sha256/byteLength does not match the operational source contract");
        }
      } catch (error) {
        valid = false;
        issues.push({ code: "invalid_operational_reference", path: relative(root, metadataPath), message: error instanceof Error ? error.message : String(error) });
      }
    }
    for (const expected of snapshot.artifacts) {
      const absolute = resolve(root, expected.path);
      const expectedPrefix = resolve(sourceDir);
      if (absolute !== expectedPrefix && !absolute.startsWith(`${expectedPrefix}/`)) {
        valid = false;
        issues.push({ code: "invalid_operational_reference", path: expected.path, message: `Artifact escapes source ${snapshot.source_id}.` });
        continue;
      }
      if (!existsSync(absolute)) {
        valid = false;
        issues.push({ code: "invalid_operational_reference", path: expected.path, message: "Registered operational artifact is missing." });
        continue;
      }
      const actualBytes = statSync(absolute).size;
      const actualSha = fileSha256(absolute);
      if (actualBytes !== expected.bytes || actualSha !== expected.sha256) {
        valid = false;
        issues.push({
          code: "invalid_operational_reference",
          path: expected.path,
          message: `Expected ${expected.bytes} bytes/${expected.sha256}; got ${actualBytes} bytes/${actualSha}.`,
        });
      }
    }
    statuses.push({
      snapshot_id: snapshot.snapshot_id,
      source_id: snapshot.source_id,
      status: valid ? "verified" : "invalid_operational_reference",
    });
  }
  for (const expected of registry.supporting_artifacts) {
    const absolute = resolve(root, expected.path);
    if (!existsSync(absolute)) {
      issues.push({ code: "invalid_operational_reference", path: expected.path, message: "Registered operational supporting artifact is missing." });
      continue;
    }
    const actualBytes = statSync(absolute).size;
    const actualSha = fileSha256(absolute);
    if (actualBytes !== expected.bytes || actualSha !== expected.sha256) {
      issues.push({
        code: "invalid_operational_reference",
        path: expected.path,
        message: `Expected ${expected.bytes} bytes/${expected.sha256}; got ${actualBytes} bytes/${actualSha}.`,
      });
    }
  }
  return { registry, registry_sha256: fileSha256(path), issues, snapshots: statuses };
}

export function mergeOperationalSnapshots(
  existing: readonly OperationalSnapshot[],
  replacements: readonly OperationalSnapshot[],
): OperationalSnapshot[] {
  const byId = new Map(existing.map((snapshot) => [snapshot.snapshot_id, snapshot]));
  for (const snapshot of replacements) {
    const current = byId.get(snapshot.snapshot_id);
    if (current && stableJson(current as unknown as JsonValue) !== stableJson(snapshot as unknown as JsonValue)) {
      throw new Error(`Refusing to replace immutable operational snapshot ${snapshot.snapshot_id}`);
    }
    byId.set(snapshot.snapshot_id, current ?? snapshot);
  }
  return [...byId.values()].sort((left, right) => left.snapshot_id.localeCompare(right.snapshot_id));
}

export function operationalReferenceLocalPaths(): {
  gtfsRoot: string;
  dotJson: string;
  dotCsv: string;
} {
  return { gtfsRoot: LOCAL_GTFS_ROOT, dotJson: LOCAL_DOT_JSON, dotCsv: LOCAL_DOT_CSV };
}
