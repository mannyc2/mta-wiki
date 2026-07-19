import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { parseGtfsTable } from "./import-gtfs.js";
import { stableJson } from "./stable-json.js";
import type { JsonValue } from "./types.js";

export const SERVICE_MODES = [
  "local",
  "local_limited",
  "limited_stop",
  "sbs",
  "express",
  "rush",
  "school_local",
  "school_limited",
] as const;
export type ServiceMode = (typeof SERVICE_MODES)[number];
export type DatasetId = "mta-nyct-bus" | "mta-bus-company";
export type ActivityValue = "yes" | "no" | "indeterminate";
export type ReliabilityStatus = "reliable" | "indeterminate";
export type ArtifactMetadata = { path: string; sha256: string; bytes: number; rows: number };

const SHA256 = /^[0-9a-f]{64}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const BASE_GTFS_FILES = [
  "agency.txt",
  "calendar.txt",
  "calendar_dates.txt",
  "feed_info.txt",
  "routes.txt",
  "stop_times.txt",
  "stops.txt",
  "trips.txt",
] as const;
const OPTIONAL_GTFS_FILES = [
  "frequencies.txt",
  "location_groups.txt",
  "locations.geojson",
] as const;
const OUTPUT_FILES = [
  "agency.txt",
  "catalog_gtfs_disagreements.jsonl",
  "catalog_routes.jsonl",
  "feed_info.txt",
  "receipt.json",
  "route_activity.jsonl",
  "route_inventory.jsonl",
  "routes.txt",
] as const;

export type AcquisitionReceiptComponentV1 = {
  component_feed_id: string;
  dataset_id: DatasetId;
  official_url: string;
  local_artifact_name: string;
  archive_sha256: string;
  feed_version: string;
  feed_start_date: string;
  feed_end_date: string;
  reliable_interval_start: string;
  reliable_interval_end: string;
  agency_timezone: "America/New_York";
  routes_sha256: string;
  files: Record<string, ArtifactMetadata>;
  frequencies_present: boolean;
  conditional_location_files_present: boolean;
};

export type CurrentBusRoutesReceiptV1 = {
  dataset_id: "h2wf-afav";
  official_url: string;
  local_artifact_name: string;
  sha256: string;
  captured_at: string;
  effective_as_of_date: string;
  valid_from: string;
  valid_to: string;
  row_count: number;
  exact_route_id_count: number;
  complete_universe: true;
  freshness_rule: string;
};

export type GtfsAcquisitionReceiptV1 = {
  schema_version: 1;
  contract_id: "gtfs-acquisition-receipt-v1";
  snapshot_id: string;
  as_of_date: string;
  service_window_start: string;
  service_window_end: string;
  captured_at: string;
  accepted_by: string;
  accepted_at: string;
  acceptance_scope: string;
  acceptance_rationale: string;
  merge_policy: "shared-nyct-route-namespace-v1";
  components: AcquisitionReceiptComponentV1[];
  current_bus_routes: CurrentBusRoutesReceiptV1;
};

export type CurrentBusRouteRow = {
  valid_from: string;
  valid_to: string;
  in_effect: string | boolean;
  route_id: string;
  route_short_name?: string;
  route_long_name?: string;
  route_description?: string;
  trip_type?: string | number;
  route_type?: string;
};

export type CatalogRouteRow = {
  schema_version: 1;
  contract_id: "current-bus-route-catalog-row-v1";
  dataset_id: "h2wf-afav";
  artifact_sha256: string;
  exact_route_id: string;
  route_short_name: string | null;
  route_long_name: string | null;
  route_description: string | null;
  effective_as_of_date: string;
  valid_from: string;
  valid_to: string;
  in_effect: "yes";
  designation_literals: string[];
  normalized_service_modes: ServiceMode[];
  source_row_count: number;
};

export type CatalogGtfsDisagreementRow = {
  schema_version: 1;
  contract_id: "current-catalog-gtfs-disagreement-v1";
  disagreement_type: "catalog_only" | "gtfs_only";
  exact_route_id: string;
  comparison_basis: "exact_case_sensitive_route_id";
  equality_claim: false;
  catalog_dataset_id: "h2wf-afav";
  catalog_effective_as_of_date: string;
  catalog_route_id: string | null;
  gtfs_snapshot_id: string;
  gtfs_as_of_date: string;
  gtfs_dataset_id: DatasetId | null;
  gtfs_source_route_id: string | null;
};

export type RouteActivityRow = {
  dataset_id: DatasetId;
  component_feed_ids: string[];
  source_route_id: string;
  gtfs_route_id: string;
  scheduled_service_dates: string[];
  scheduled_trip_template_date_count: number;
  scheduled_in_window: ActivityValue;
  reliability_status: ReliabilityStatus;
  frequencies_present: boolean;
  snapshot_id?: string;
};

export type RouteInventoryRow = {
  dataset_id: DatasetId;
  component_feed_ids: string[];
  source_route_id: string;
  gtfs_route_id: string;
  agency_id: string | null;
  raw_route_type: string;
  route_family_id: string;
  route_short_name: string | null;
  route_long_name: string | null;
  route_desc: string | null;
  declared_in_feed: true;
  catalog_in_effect: ActivityValue;
  catalog_effective_as_of_date: string;
  reliable_interval_start: string;
  reliable_interval_end: string;
  reliable_interval_derivation: "component_feed_bounds_intersection_v1";
  reliability_status: ReliabilityStatus;
  scheduled_in_window: ActivityValue;
  scheduled_service_dates: string[];
  scheduled_trip_template_date_count: number;
  frequencies_present: boolean;
  designation_literals: string[];
  normalized_service_modes: ServiceMode[];
  display_label: string;
  display_label_source: "current_bus_routes" | "gtfs" | "source_route_id";
  label_fallback: "source_route_id" | null;
  label_diff: {
    current_bus_routes_route_short_name: string;
    gtfs_route_short_name: string;
  } | null;
  snapshot_id: string;
};

export type FeedPartition = {
  component_feed_id: string;
  dataset_id: DatasetId;
  reliable_interval_start: string;
  reliable_interval_end: string;
  routes: Array<Record<string, string>>;
  trips: Array<Record<string, string>>;
  calendar: Array<Record<string, string>>;
  calendar_dates: Array<Record<string, string>>;
  frequency_trip_ids?: Set<string>;
};

type ValidatedFeed = FeedPartition & {
  component: AcquisitionReceiptComponentV1;
  agencies: Array<Record<string, string>>;
  feedInfo: Array<Record<string, string>>;
  publisher: string;
  frequency_route_ids: Set<string>;
};

export type GtfsSnapshotManifestV2 = {
  schema_version: 2;
  contract_id: "gtfs-route-reference-snapshot-v2";
  snapshot_id: string;
  dataset_id: "mta-bus-static";
  captured_at: string;
  as_of_date: string;
  service_window_start: string;
  service_window_end: string;
  merge_policy: "shared-nyct-route-namespace-v1";
  id_remapping_policy: "component-feed-prefixed-foreign-keys-v1";
  current_catalog: {
    contract_version: 1;
    dataset_id: "h2wf-afav";
    artifact_sha256: string;
    effective_as_of_date: string;
    catalog_routes: ArtifactMetadata;
    catalog_gtfs_disagreements: ArtifactMetadata;
    catalog_identity_count: number;
    catalog_only_count: number;
    gtfs_only_count: number;
  };
  components: Array<{
    component_feed_id: string;
    dataset_id: DatasetId;
    official_url: string;
    archive_sha256: string;
    feed_version: string;
    publisher: string;
    feed_start_date: string;
    feed_end_date: string;
    reliable_interval_start: string;
    reliable_interval_end: string;
    agency_timezone: "America/New_York";
    frequencies_present: boolean;
    conditional_location_files_present: boolean;
    files: Record<string, ArtifactMetadata>;
  }>;
  outputs: Record<string, ArtifactMetadata>;
  counts: {
    route_identity_count: number;
    route_activity_count: number;
    catalog_identity_count: number;
    catalog_only_count: number;
    gtfs_only_count: number;
  };
};

export type InstallGtfsSnapshotOptions = {
  receiptPath: string;
  feeds: Record<string, string>;
  currentBusRoutesPath: string;
  snapshotsRoot: string;
};

export type InstallGtfsSnapshotResult = {
  snapshot_id: string;
  directory: string;
  manifest_sha256: string;
  route_identity_count: number;
  catalog_identity_count: number;
  catalog_only_count: number;
  gtfs_only_count: number;
  deterministic_tree: Array<{ path: string; sha256: string; bytes: number }>;
};

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  const expected = new Set(keys);
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  if (missing.length || unexpected.length) {
    throw new Error(`${path}: strict keys mismatch; missing=[${missing.sort()}] unexpected=[${unexpected.sort()}]`);
  }
}

function nonEmpty(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${path}: expected non-empty string`);
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path}: expected boolean`);
  return value;
}

function count(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${path}: expected non-negative safe integer`);
  return value as number;
}

function sha(value: unknown, path: string): string {
  const result = nonEmpty(value, path);
  if (!SHA256.test(result)) throw new Error(`${path}: expected lowercase SHA-256`);
  return result;
}

function isoDate(value: unknown, path: string): string {
  const result = nonEmpty(value, path);
  if (!ISO_DATE.test(result) || Number.isNaN(Date.parse(`${result}T12:00:00Z`))) throw new Error(`${path}: expected valid YYYY-MM-DD`);
  return result;
}

function timestamp(value: unknown, path: string): string {
  const result = nonEmpty(value, path);
  if (Number.isNaN(Date.parse(result))) throw new Error(`${path}: expected timestamp`);
  return result;
}

function sortedUnique(values: string[], path: string): void {
  if (new Set(values).size !== values.length || values.join("\n") !== [...values].sort().join("\n")) {
    throw new Error(`${path}: must be sorted and unique`);
  }
}

function enumValue<const Values extends readonly string[]>(value: unknown, values: Values, path: string): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new Error(`${path}: expected one of [${values.join(", ")}]`);
  }
  return value as Values[number];
}

function datasetId(value: unknown, path: string): DatasetId {
  return enumValue(value, ["mta-nyct-bus", "mta-bus-company"] as const, path);
}

function nullableNonEmpty(value: unknown, path: string): string | null {
  if (value === null) return null;
  return nonEmpty(value, path);
}

function stringArray(value: unknown, path: string, options: { nonEmpty?: boolean } = {}): string[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  const result = value.map((entry, index) => nonEmpty(entry, `${path}[${index}]`));
  if (options.nonEmpty && result.length === 0) throw new Error(`${path}: expected non-empty array`);
  sortedUnique(result, path);
  return result;
}

function safeRelativePath(value: unknown, path: string): string {
  const result = nonEmpty(value, path);
  if (resolve("/", result) !== `/${result}` || result.includes("..") || result.includes("\\") || result.startsWith("/")) {
    throw new Error(`${path}: expected safe relative path`);
  }
  return result;
}

function parseArtifactMetadata(value: unknown, path: string): ArtifactMetadata {
  const row = object(value, path);
  exactKeys(row, ["path", "sha256", "bytes", "rows"], path);
  return {
    path: safeRelativePath(row.path, `${path}.path`),
    sha256: sha(row.sha256, `${path}.sha256`),
    bytes: count(row.bytes, `${path}.bytes`),
    rows: count(row.rows, `${path}.rows`),
  };
}

export function sha256Bytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}

export function gtfsDate(value: string, path = "date"): string {
  const raw = value.trim();
  if (/^\d{8}$/u.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`;
  const iso = raw.slice(0, 10);
  if (ISO_DATE.test(iso)) return iso;
  throw new Error(`${path}: invalid date ${JSON.stringify(value)}`);
}

function shift(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function sevenDateServiceWindow(asOfDate: string): string[] {
  const end = gtfsDate(asOfDate, "as_of_date");
  return Array.from({ length: 7 }, (_, index) => shift(end, index - 6));
}

function* csvRows(text: string): Generator<string[]> {
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      if (row.length > 1 || row[0]!.trim()) yield row;
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV: unterminated quoted field");
  if (field.length || row.length) {
    row.push(field);
    if (row.length > 1 || row[0]!.trim()) yield row;
  }
}

function csvDataRowCount(text: string): number {
  let rows = -1;
  for (const _ of csvRows(text)) rows += 1;
  return Math.max(0, rows);
}

function csvEscape(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function serializeCsv(headers: string[], rows: Array<Record<string, string>>): string {
  return `${headers.join(",")}\n${rows.map((row) => headers.map((key) => csvEscape(row[key] ?? "")).join(",")).join("\n")}\n`;
}

function artifactMetadata(path: string, bytes: string | Uint8Array, rows: number): ArtifactMetadata {
  const encoded = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes);
  return { path, sha256: sha256Bytes(encoded), bytes: encoded.length, rows };
}

function parseReceiptComponent(raw: unknown, index: number): AcquisitionReceiptComponentV1 {
  const path = `components[${index}]`;
  const row = object(raw, path);
  exactKeys(row, [
    "component_feed_id",
    "dataset_id",
    "official_url",
    "local_artifact_name",
    "archive_sha256",
    "feed_version",
    "feed_start_date",
    "feed_end_date",
    "reliable_interval_start",
    "reliable_interval_end",
    "agency_timezone",
    "routes_sha256",
    "files",
    "frequencies_present",
    "conditional_location_files_present",
  ], path);
  const dataset = nonEmpty(row.dataset_id, `${path}.dataset_id`);
  if (dataset !== "mta-nyct-bus" && dataset !== "mta-bus-company") throw new Error(`${path}.dataset_id: unsupported value ${dataset}`);
  if (row.agency_timezone !== "America/New_York") throw new Error(`${path}.agency_timezone: expected America/New_York`);
  const filesObject = object(row.files, `${path}.files`);
  const allowedFiles = new Set<string>([...BASE_GTFS_FILES, ...OPTIONAL_GTFS_FILES]);
  const unknown = Object.keys(filesObject).filter((name) => !allowedFiles.has(name));
  if (unknown.length) throw new Error(`${path}.files: unknown derivation files [${unknown.sort()}]`);
  for (const required of BASE_GTFS_FILES) if (!Object.hasOwn(filesObject, required)) throw new Error(`${path}.files: missing ${required}`);
  const files = Object.fromEntries(Object.entries(filesObject).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => {
    const metadata = parseArtifactMetadata(value, `${path}.files.${name}`);
    if (metadata.path !== name) throw new Error(`${path}.files.${name}.path: must equal file key`);
    return [name, metadata];
  }));
  const frequenciesPresent = bool(row.frequencies_present, `${path}.frequencies_present`);
  if (frequenciesPresent !== Object.hasOwn(files, "frequencies.txt")) throw new Error(`${path}: frequencies declaration/files mismatch`);
  const conditionalPresent = bool(row.conditional_location_files_present, `${path}.conditional_location_files_present`);
  const conditionalFiles = OPTIONAL_GTFS_FILES.filter((name) => name !== "frequencies.txt" && Object.hasOwn(files, name));
  if (conditionalPresent !== (conditionalFiles.length > 0)) throw new Error(`${path}: conditional location declaration/files mismatch`);
  const routesSha = sha(row.routes_sha256, `${path}.routes_sha256`);
  if (routesSha !== files["routes.txt"]!.sha256) throw new Error(`${path}.routes_sha256: must match files.routes.txt.sha256`);
  return {
    component_feed_id: nonEmpty(row.component_feed_id, `${path}.component_feed_id`),
    dataset_id: dataset,
    official_url: nonEmpty(row.official_url, `${path}.official_url`),
    local_artifact_name: safeRelativePath(row.local_artifact_name, `${path}.local_artifact_name`),
    archive_sha256: sha(row.archive_sha256, `${path}.archive_sha256`),
    feed_version: nonEmpty(row.feed_version, `${path}.feed_version`),
    feed_start_date: isoDate(row.feed_start_date, `${path}.feed_start_date`),
    feed_end_date: isoDate(row.feed_end_date, `${path}.feed_end_date`),
    reliable_interval_start: isoDate(row.reliable_interval_start, `${path}.reliable_interval_start`),
    reliable_interval_end: isoDate(row.reliable_interval_end, `${path}.reliable_interval_end`),
    agency_timezone: "America/New_York",
    routes_sha256: routesSha,
    files,
    frequencies_present: frequenciesPresent,
    conditional_location_files_present: conditionalPresent,
  };
}

function parseReceiptWithoutSelfDecode(input: unknown, skipSelfDecode: boolean): GtfsAcquisitionReceiptV1 {
  const root = object(input, "GTFS acquisition receipt");
  exactKeys(root, ["schema_version","contract_id","snapshot_id","as_of_date","service_window_start","service_window_end","captured_at","accepted_by","accepted_at","acceptance_scope","acceptance_rationale","merge_policy","components","current_bus_routes"], "GTFS acquisition receipt");
  if (root.schema_version !== 1 || root.contract_id !== "gtfs-acquisition-receipt-v1" || root.merge_policy !== "shared-nyct-route-namespace-v1") throw new Error("GTFS acquisition receipt: expected accepted receipt-v1/shared namespace contract");
  const asOfDate = isoDate(root.as_of_date, "as_of_date");
  const window = sevenDateServiceWindow(asOfDate);
  if (root.service_window_start !== window[0] || root.service_window_end !== window[6]) throw new Error("GTFS acquisition receipt: service window must be seven dates ending on as_of_date");
  if (!Array.isArray(root.components) || root.components.length === 0) throw new Error("GTFS acquisition receipt: components must be non-empty");
  const components = root.components.map(parseReceiptComponent);
  const ids = components.map((component) => component.component_feed_id);
  if (new Set(ids).size !== ids.length) throw new Error("GTFS acquisition receipt: duplicate component_feed_id");
  for (const component of components) {
    if (component.feed_start_date > component.feed_end_date) throw new Error(`${component.component_feed_id}: reversed feed interval`);
    if (component.reliable_interval_start < component.feed_start_date || component.reliable_interval_end > component.feed_end_date) throw new Error(`${component.component_feed_id}: reliable interval exceeds feed bounds`);
    if (component.reliable_interval_start > window[0]! || component.reliable_interval_end < window[6]!) throw new Error(`${component.component_feed_id}: reliable interval does not cover service window`);
  }
  const current = object(root.current_bus_routes, "current_bus_routes");
  exactKeys(current, ["dataset_id","official_url","local_artifact_name","sha256","captured_at","effective_as_of_date","valid_from","valid_to","row_count","exact_route_id_count","complete_universe","freshness_rule"], "current_bus_routes");
  if (current.dataset_id !== "h2wf-afav" || current.complete_universe !== true) throw new Error("current_bus_routes: expected complete h2wf-afav universe");
  const currentAsOf = isoDate(current.effective_as_of_date, "current_bus_routes.effective_as_of_date");
  if (currentAsOf !== asOfDate) throw new Error("current_bus_routes: effective_as_of_date must equal GTFS as_of_date");
  const result: GtfsAcquisitionReceiptV1 = {
    schema_version: 1,
    contract_id: "gtfs-acquisition-receipt-v1",
    snapshot_id: nonEmpty(root.snapshot_id, "snapshot_id"),
    as_of_date: asOfDate,
    service_window_start: window[0]!,
    service_window_end: window[6]!,
    captured_at: timestamp(root.captured_at, "captured_at"),
    accepted_by: nonEmpty(root.accepted_by, "accepted_by"),
    accepted_at: timestamp(root.accepted_at, "accepted_at"),
    acceptance_scope: nonEmpty(root.acceptance_scope, "acceptance_scope"),
    acceptance_rationale: nonEmpty(root.acceptance_rationale, "acceptance_rationale"),
    merge_policy: "shared-nyct-route-namespace-v1",
    components,
    current_bus_routes: {
      dataset_id: "h2wf-afav",
      official_url: nonEmpty(current.official_url, "current_bus_routes.official_url"),
      local_artifact_name: safeRelativePath(current.local_artifact_name, "current_bus_routes.local_artifact_name"),
      sha256: sha(current.sha256, "current_bus_routes.sha256"),
      captured_at: timestamp(current.captured_at, "current_bus_routes.captured_at"),
      effective_as_of_date: currentAsOf,
      valid_from: isoDate(current.valid_from, "current_bus_routes.valid_from"),
      valid_to: isoDate(current.valid_to, "current_bus_routes.valid_to"),
      row_count: count(current.row_count, "current_bus_routes.row_count"),
      exact_route_id_count: count(current.exact_route_id_count, "current_bus_routes.exact_route_id_count"),
      complete_universe: true,
      freshness_rule: nonEmpty(current.freshness_rule, "current_bus_routes.freshness_rule"),
    },
  };
  if (!skipSelfDecode) parseReceiptWithoutSelfDecode(JSON.parse(stableJson(result)), true);
  return result;
}

export function parseGtfsAcquisitionReceiptV1(input: unknown): GtfsAcquisitionReceiptV1 {
  return parseReceiptWithoutSelfDecode(input, false);
}

export function serializeGtfsAcquisitionReceiptV1(receipt: GtfsAcquisitionReceiptV1): string {
  const parsed = parseReceiptWithoutSelfDecode(receipt, false);
  const bytes = `${stableJson(parsed)}\n`;
  parseReceiptWithoutSelfDecode(JSON.parse(bytes), true);
  return bytes;
}

const TRIP_MODES: Record<string, ServiceMode> = {
  "1": "local",
  "10": "school_limited",
  "11": "school_local",
  "12": "limited_stop",
  "13": "express",
  "14": "sbs",
};
const ROUTE_MODES: Record<string, ServiceMode> = {
  Local: "local",
  Limited: "limited_stop",
  Express: "express",
  SBS: "sbs",
};

export function currentRouteDesignations(rows: CurrentBusRouteRow[]): { designation_literals: string[]; normalized_service_modes: ServiceMode[] } {
  const literals = new Set<string>();
  const modes = new Set<ServiceMode>();
  for (const row of rows) {
    const trip = row.trip_type === undefined ? "" : String(row.trip_type);
    const route = row.route_type?.trim() ?? "";
    const tripMode = trip ? TRIP_MODES[trip] : undefined;
    if (trip && !tripMode) throw new Error(`unknown trip_type ${trip}`);
    let routeMode: ServiceMode | undefined;
    if (route) {
      if (route === "School") {
        if (trip !== "10" && trip !== "11") throw new Error("School requires trip_type 10 or 11");
        routeMode = tripMode;
      } else {
        routeMode = ROUTE_MODES[route];
        if (!routeMode) throw new Error(`unknown route_type ${route}`);
      }
    }
    if (tripMode && routeMode && tripMode !== routeMode) throw new Error(`route_type/trip_type disagreement: ${route}/${trip}`);
    if (trip) literals.add(`trip_type:${trip}`);
    if (route) literals.add(`route_type:${route}`);
    if (tripMode) modes.add(tripMode);
    if (routeMode) modes.add(routeMode);
  }
  return { designation_literals: [...literals].sort(), normalized_service_modes: [...modes].sort() };
}

function routeDefinition(row: Record<string, string>): string {
  return stableJson(row);
}

export function mergeRoutePartitions(partitions: FeedPartition[]): Array<{
  dataset_id: DatasetId;
  source_route_id: string;
  gtfs_route_id: string;
  component_feed_ids: string[];
  route: Record<string, string>;
}> {
  const componentIds = partitions.map((partition) => partition.component_feed_id);
  if (new Set(componentIds).size !== componentIds.length) throw new Error("duplicate component feed input");
  const merged = new Map<string, {
    dataset_id: DatasetId;
    source_route_id: string;
    gtfs_route_id: string;
    component_feed_ids: string[];
    route: Record<string, string>;
  }>();
  const exported = new Map<string, DatasetId>();
  for (const part of [...partitions].sort((a, b) => a.component_feed_id.localeCompare(b.component_feed_id))) {
    for (const route of part.routes) {
      const id = route.route_id;
      if (!id) throw new Error(`${part.component_feed_id}: empty source route_id`);
      const key = `${part.dataset_id}\0${id}`;
      const prior = merged.get(key);
      if (prior && routeDefinition(prior.route) !== routeDefinition(route)) throw new Error(`${key}: non-identical duplicate route definition`);
      const other = exported.get(id);
      if (other && other !== part.dataset_id) throw new Error(`${id}: exported route collision across ${other} and ${part.dataset_id}`);
      exported.set(id, part.dataset_id);
      if (prior) prior.component_feed_ids.push(part.component_feed_id);
      else merged.set(key, { dataset_id: part.dataset_id, source_route_id: id, gtfs_route_id: id, component_feed_ids: [part.component_feed_id], route });
    }
  }
  return [...merged.values()]
    .map((row) => ({ ...row, component_feed_ids: [...new Set(row.component_feed_ids)].sort() }))
    .sort((a, b) => `${a.dataset_id}\0${a.source_route_id}`.localeCompare(`${b.dataset_id}\0${b.source_route_id}`));
}

function activeServices(part: FeedPartition, dates: string[]): Map<string, Set<string>> {
  const result = new Map(dates.map((date) => [date, new Set<string>()]));
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (const row of part.calendar) {
    const start = gtfsDate(row.start_date ?? "", "calendar.start_date");
    const end = gtfsDate(row.end_date ?? "", "calendar.end_date");
    for (const date of dates) {
      const weekday = weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
      if (date >= start && date <= end && row[weekday] === "1") result.get(date)!.add(row.service_id!);
    }
  }
  for (const row of part.calendar_dates) {
    const set = result.get(gtfsDate(row.date ?? "", "calendar_dates.date"));
    if (!set) continue;
    if (row.exception_type === "1") set.add(row.service_id!);
    else if (row.exception_type === "2") set.delete(row.service_id!);
    else throw new Error(`unsupported exception_type ${row.exception_type}`);
  }
  return result;
}

export function deriveRouteActivity(partitions: FeedPartition[], asOfDate: string, snapshotId?: string): RouteActivityRow[] {
  const dates = sevenDateServiceWindow(asOfDate);
  const merged = mergeRoutePartitions(partitions);
  const accumulators = new Map<string, { dates: Set<string>; templates: number; frequencies: boolean }>();
  for (const identity of merged) accumulators.set(`${identity.dataset_id}\0${identity.source_route_id}`, { dates: new Set(), templates: 0, frequencies: false });
  for (const part of partitions) {
    const active = activeServices(part, dates);
    for (const trip of part.trips) {
      const key = `${part.dataset_id}\0${trip.route_id}`;
      const accumulator = accumulators.get(key);
      if (!accumulator) throw new Error(`${part.component_feed_id}: trip references undeclared route ${trip.route_id}`);
      for (const date of dates) {
        if (active.get(date)!.has(trip.service_id!)) {
          accumulator.dates.add(date);
          accumulator.templates += 1;
        }
      }
      if (part.frequency_trip_ids?.has(trip.trip_id!)) accumulator.frequencies = true;
    }
  }
  const byComponent = new Map(partitions.map((part) => [part.component_feed_id, part]));
  return merged.map((identity) => {
    const accumulator = accumulators.get(`${identity.dataset_id}\0${identity.source_route_id}`)!;
    const reliable = identity.component_feed_ids.every((id) => {
      const part = byComponent.get(id)!;
      return part.reliable_interval_start <= dates[0]! && part.reliable_interval_end >= dates[6]!;
    });
    const result: RouteActivityRow = {
      dataset_id: identity.dataset_id,
      component_feed_ids: identity.component_feed_ids,
      source_route_id: identity.source_route_id,
      gtfs_route_id: identity.gtfs_route_id,
      scheduled_service_dates: reliable ? [...accumulator.dates].sort() : [],
      scheduled_trip_template_date_count: reliable ? accumulator.templates : 0,
      scheduled_in_window: reliable ? (accumulator.dates.size ? "yes" : "no") : "indeterminate",
      reliability_status: reliable ? "reliable" : "indeterminate",
      frequencies_present: accumulator.frequencies,
    };
    if (snapshotId) result.snapshot_id = snapshotId;
    return result;
  });
}

function validateRawArtifact(directory: string, name: string, metadata: ArtifactMetadata): string {
  const path = join(directory, metadata.path);
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`${path}: missing receipt-pinned file`);
  const buffer = readFileSync(path);
  if (buffer.length !== metadata.bytes) throw new Error(`${name}: byte count mismatch; expected ${metadata.bytes}, got ${buffer.length}`);
  const digest = sha256Bytes(buffer);
  if (digest !== metadata.sha256) throw new Error(`${name}: SHA-256 mismatch; expected ${metadata.sha256}, got ${digest}`);
  const text = buffer.toString("utf8");
  const rows = name.endsWith(".json") || name.endsWith(".geojson")
    ? (() => {
        const parsed = JSON.parse(text) as unknown;
        if (Array.isArray(parsed)) return parsed.length;
        const geo = object(parsed, name);
        return Array.isArray(geo.features) ? geo.features.length : 1;
      })()
    : csvDataRowCount(text);
  if (rows !== metadata.rows) throw new Error(`${name}: logical row count mismatch; expected ${metadata.rows}, got ${rows}`);
  return text;
}

function resolveFeedDirectory(component: AcquisitionReceiptComponentV1, input: string): { directory: string; cleanup?: string } {
  if (!existsSync(input)) throw new Error(`${component.component_feed_id}: feed input does not exist: ${input}`);
  let archive: string;
  if (statSync(input).isDirectory()) {
    archive = join(dirname(input), component.local_artifact_name);
    if (!existsSync(archive)) throw new Error(`${component.component_feed_id}: directory input requires receipt-pinned sibling archive ${archive}`);
  } else {
    archive = input;
  }
  if (basename(archive) !== component.local_artifact_name) throw new Error(`${component.component_feed_id}: archive name must be ${component.local_artifact_name}`);
  const archiveDigest = sha256File(archive);
  if (archiveDigest !== component.archive_sha256) throw new Error(`${component.component_feed_id}: archive SHA-256 mismatch`);
  if (statSync(input).isDirectory()) return { directory: input };
  const entries = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
  if (entries.status !== 0) throw new Error(`${component.component_feed_id}: cannot inspect ZIP: ${entries.stderr.trim()}`);
  for (const entry of entries.stdout.split(/\r?\n/u).filter(Boolean)) {
    if (entry.startsWith("/") || entry.split("/").includes("..") || entry.includes("\\")) throw new Error(`${component.component_feed_id}: unsafe ZIP entry ${entry}`);
  }
  const extracted = mkdtempSync(join(tmpdir(), `mta-wiki-${component.component_feed_id}-`));
  const unzip = spawnSync("unzip", ["-qq", archive, "-d", extracted], { encoding: "utf8" });
  if (unzip.status !== 0) {
    rmSync(extracted, { recursive: true, force: true });
    throw new Error(`${component.component_feed_id}: cannot extract ZIP: ${unzip.stderr.trim()}`);
  }
  return { directory: extracted, cleanup: extracted };
}

function requireColumns(rows: Array<Record<string, string>>, columns: string[], path: string, header: string[]): void {
  const available = new Set(rows.length ? Object.keys(rows[0]!) : header);
  for (const column of columns) if (!available.has(column)) throw new Error(`${path}: missing required column ${column}`);
}

function uniqueIds(rows: Array<Record<string, string>>, key: string, path: string): Set<string> {
  const ids = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const value = row[key];
    if (!value) throw new Error(`${path}:${index + 2}: empty ${key}`);
    if (ids.has(value)) throw new Error(`${path}: duplicate ${key} ${value}`);
    ids.add(value);
  }
  return ids;
}

function locationsFromGeoJson(text: string): Set<string> {
  const root = object(JSON.parse(text), "locations.geojson");
  if (root.type !== "FeatureCollection" || !Array.isArray(root.features)) throw new Error("locations.geojson: expected FeatureCollection");
  const ids = new Set<string>();
  for (const [index, raw] of root.features.entries()) {
    const feature = object(raw, `locations.geojson.features[${index}]`);
    const properties = object(feature.properties ?? {}, `locations.geojson.features[${index}].properties`);
    const id = typeof feature.id === "string" && feature.id ? feature.id : typeof properties.location_id === "string" ? properties.location_id : typeof properties.stop_id === "string" ? properties.stop_id : "";
    if (!id) throw new Error(`locations.geojson.features[${index}]: missing stable location identifier`);
    if (ids.has(id)) throw new Error(`locations.geojson: duplicate location identifier ${id}`);
    ids.add(id);
  }
  return ids;
}

function validateFeed(component: AcquisitionReceiptComponentV1, input: string): ValidatedFeed {
  const resolved = resolveFeedDirectory(component, input);
  try {
    for (const name of BASE_GTFS_FILES) validateRawArtifact(resolved.directory, name, component.files[name]!);
    for (const name of OPTIONAL_GTFS_FILES) {
      const declared = component.files[name];
      const present = existsSync(join(resolved.directory, name));
      if (Boolean(declared) !== present) throw new Error(`${component.component_feed_id}: ${name} declaration/presence mismatch`);
      if (declared) validateRawArtifact(resolved.directory, name, declared);
    }
    const table = (name: string) => parseGtfsTable(readFileSync(join(resolved.directory, name), "utf8"));
    const tableHeader = (name: string) => {
      const first = csvRows(readFileSync(join(resolved.directory, name), "utf8")).next();
      return first.done ? [] : first.value.map((value) => value.trim().replace(/^﻿/u, ""));
    };
    const agencies = table("agency.txt");
    const feedInfo = table("feed_info.txt");
    const routes = table("routes.txt");
    const trips = table("trips.txt");
    const calendar = table("calendar.txt");
    const calendarDates = table("calendar_dates.txt");
    const stops = table("stops.txt");
    requireColumns(agencies, ["agency_id","agency_name","agency_timezone"], "agency.txt", tableHeader("agency.txt"));
    requireColumns(feedInfo, ["feed_publisher_name","feed_start_date","feed_end_date","feed_version"], "feed_info.txt", tableHeader("feed_info.txt"));
    requireColumns(routes, ["route_id","agency_id","route_short_name","route_long_name","route_desc","route_type"], "routes.txt", tableHeader("routes.txt"));
    requireColumns(trips, ["route_id","service_id","trip_id"], "trips.txt", tableHeader("trips.txt"));
    requireColumns(calendar, ["service_id","monday","tuesday","wednesday","thursday","friday","saturday","sunday","start_date","end_date"], "calendar.txt", tableHeader("calendar.txt"));
    requireColumns(calendarDates, ["service_id","date","exception_type"], "calendar_dates.txt", tableHeader("calendar_dates.txt"));
    requireColumns(stops, ["stop_id"], "stops.txt", tableHeader("stops.txt"));
    const agencyIds = uniqueIds(agencies, "agency_id", "agency.txt");
    if (agencies.some((row) => row.agency_timezone !== "America/New_York")) throw new Error(`${component.component_feed_id}: agency_timezone must be America/New_York`);
    if (component.agency_timezone !== "America/New_York") throw new Error(`${component.component_feed_id}: receipt timezone mismatch`);
    if (feedInfo.length !== 1) throw new Error(`${component.component_feed_id}: feed_info.txt must have exactly one row`);
    const info = feedInfo[0]!;
    if (info.feed_version !== component.feed_version || gtfsDate(info.feed_start_date ?? "", "feed_info.feed_start_date") !== component.feed_start_date || gtfsDate(info.feed_end_date ?? "", "feed_info.feed_end_date") !== component.feed_end_date) {
      throw new Error(`${component.component_feed_id}: feed_info bounds/version do not match receipt`);
    }
    const routeIds = uniqueIds(routes, "route_id", "routes.txt");
    for (const route of routes) {
      if (route.agency_id && !agencyIds.has(route.agency_id)) throw new Error(`${component.component_feed_id}: route ${route.route_id} references unknown agency ${route.agency_id}`);
      if (!route.route_type) throw new Error(`${component.component_feed_id}: route ${route.route_id} has empty route_type`);
    }
    const calendarIds = uniqueIds(calendar, "service_id", "calendar.txt");
    for (const row of calendar) {
      for (const day of ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]) if (row[day] !== "0" && row[day] !== "1") throw new Error(`${component.component_feed_id}: invalid ${day} flag for ${row.service_id}`);
      if (gtfsDate(row.start_date ?? "", "calendar.start_date") > gtfsDate(row.end_date ?? "", "calendar.end_date")) throw new Error(`${component.component_feed_id}: reversed calendar interval for ${row.service_id}`);
    }
    const serviceIds = new Set(calendarIds);
    const exceptionKeys = new Set<string>();
    for (const row of calendarDates) {
      if (!row.service_id) throw new Error(`${component.component_feed_id}: calendar_dates has empty service_id`);
      const date = gtfsDate(row.date ?? "", "calendar_dates.date");
      if (row.exception_type !== "1" && row.exception_type !== "2") throw new Error(`${component.component_feed_id}: unsupported calendar exception ${row.exception_type}`);
      const key = `${row.service_id}\0${date}`;
      if (exceptionKeys.has(key)) throw new Error(`${component.component_feed_id}: duplicate calendar_dates key ${key}`);
      exceptionKeys.add(key);
      serviceIds.add(row.service_id);
    }
    const tripIds = uniqueIds(trips, "trip_id", "trips.txt");
    for (const trip of trips) {
      if (!routeIds.has(trip.route_id!)) throw new Error(`${component.component_feed_id}: trip ${trip.trip_id} references unknown route ${trip.route_id}`);
      if (!serviceIds.has(trip.service_id!)) throw new Error(`${component.component_feed_id}: trip ${trip.trip_id} references unknown service ${trip.service_id}`);
    }
    const stopIds = uniqueIds(stops, "stop_id", "stops.txt");
    for (const stop of stops) if (stop.parent_station && !stopIds.has(stop.parent_station)) throw new Error(`${component.component_feed_id}: stop ${stop.stop_id} references unknown parent_station ${stop.parent_station}`);
    const locationGroups = component.files["location_groups.txt"] ? uniqueIds(table("location_groups.txt"), "location_group_id", "location_groups.txt") : new Set<string>();
    const locations = component.files["locations.geojson"] ? locationsFromGeoJson(readFileSync(join(resolved.directory, "locations.geojson"), "utf8")) : new Set<string>();
    const stopTimesText = readFileSync(join(resolved.directory, "stop_times.txt"), "utf8");
    const iterator = csvRows(stopTimesText);
    const first = iterator.next();
    if (first.done) throw new Error(`${component.component_feed_id}: empty stop_times.txt`);
    const header = first.value.map((value) => value.trim().replace(/^﻿/u, ""));
    for (const required of ["trip_id","stop_sequence"]) if (!header.includes(required)) throw new Error(`${component.component_feed_id}: stop_times.txt missing ${required}`);
    const knownIdColumns = new Set(["trip_id","stop_id","location_group_id","location_id"]);
    for (const key of header.filter((value) => value.endsWith("_id"))) if (!knownIdColumns.has(key)) throw new Error(`${component.component_feed_id}: unknown conditional stop_times reference class ${key}`);
    const indexes = new Map(header.map((key, index) => [key, index]));
    const coveredTrips = new Set<string>();
    let rowNumber = 1;
    for (const cells of iterator) {
      rowNumber += 1;
      const value = (key: string) => (cells[indexes.get(key) ?? -1] ?? "").trim();
      const tripId = value("trip_id");
      if (!tripIds.has(tripId)) throw new Error(`${component.component_feed_id}: stop_times:${rowNumber} references unknown trip ${tripId}`);
      const sequence = value("stop_sequence");
      if (!/^\d+$/u.test(sequence)) throw new Error(`${component.component_feed_id}: stop_times:${rowNumber} invalid stop_sequence ${sequence}`);
      const stopId = value("stop_id");
      const locationGroupId = value("location_group_id");
      const locationId = value("location_id");
      const references = [stopId, locationGroupId, locationId].filter(Boolean);
      if (references.length !== 1) throw new Error(`${component.component_feed_id}: stop_times:${rowNumber} must reference exactly one stop/location class`);
      if (stopId && !stopIds.has(stopId)) throw new Error(`${component.component_feed_id}: stop_times:${rowNumber} references unknown stop ${stopId}`);
      if (locationGroupId && !locationGroups.has(locationGroupId)) throw new Error(`${component.component_feed_id}: stop_times:${rowNumber} references unknown location_group ${locationGroupId}`);
      if (locationId && !locations.has(locationId)) throw new Error(`${component.component_feed_id}: stop_times:${rowNumber} references unknown location ${locationId}`);
      coveredTrips.add(tripId);
    }
    for (const tripId of tripIds) if (!coveredTrips.has(tripId)) throw new Error(`${component.component_feed_id}: trip ${tripId} has no stop_times coverage`);
    const frequencyTripIds = new Set<string>();
    if (component.files["frequencies.txt"]) {
      const frequencies = table("frequencies.txt");
      requireColumns(frequencies, ["trip_id","start_time","end_time","headway_secs"], "frequencies.txt", tableHeader("frequencies.txt"));
      for (const [index, row] of frequencies.entries()) {
        if (!tripIds.has(row.trip_id!)) throw new Error(`${component.component_feed_id}: frequencies:${index + 2} references unknown trip ${row.trip_id}`);
        if (!/^\d+$/u.test(row.headway_secs ?? "") || Number(row.headway_secs) <= 0) throw new Error(`${component.component_feed_id}: frequencies:${index + 2} invalid headway_secs`);
        frequencyTripIds.add(row.trip_id!);
      }
    }
    const frequencyRouteIds = new Set(trips.filter((trip) => frequencyTripIds.has(trip.trip_id!)).map((trip) => trip.route_id!));
    return {
      component_feed_id: component.component_feed_id,
      dataset_id: component.dataset_id,
      reliable_interval_start: component.reliable_interval_start,
      reliable_interval_end: component.reliable_interval_end,
      routes,
      trips,
      calendar,
      calendar_dates: calendarDates,
      frequency_trip_ids: frequencyTripIds,
      component,
      agencies,
      feedInfo,
      publisher: info.feed_publisher_name!,
      frequency_route_ids: frequencyRouteIds,
    };
  } finally {
    if (resolved.cleanup) rmSync(resolved.cleanup, { recursive: true, force: true });
  }
}

export function readFeedPartition(input: Omit<FeedPartition, "routes" | "trips" | "calendar" | "calendar_dates"> & { directory: string }): FeedPartition {
  const table = (name: string) => parseGtfsTable(readFileSync(join(input.directory, name), "utf8"));
  const agency = table("agency.txt");
  if (agency.some((row) => row.agency_timezone !== "America/New_York")) throw new Error(`${input.component_feed_id}: agency_timezone must be America/New_York`);
  return { ...input, routes: table("routes.txt"), trips: table("trips.txt"), calendar: table("calendar.txt"), calendar_dates: table("calendar_dates.txt") };
}

function consistentLiteral(rows: CurrentBusRouteRow[], key: "route_short_name" | "route_long_name" | "route_description", routeId: string): string | null {
  const values = [...new Set(rows.map((row) => row[key]?.trim()).filter((value): value is string => Boolean(value)))].sort();
  if (values.length > 1) throw new Error(`Current Bus Routes ${routeId}: conflicting ${key} literals [${values.join(", ")}]`);
  return values[0] ?? null;
}

function parseCurrentCatalog(path: string, receipt: CurrentBusRoutesReceiptV1): CatalogRouteRow[] {
  const bytes = readFileSync(path);
  if (bytes.length === 0) throw new Error("Current Bus Routes: empty artifact");
  if (sha256Bytes(bytes) !== receipt.sha256) throw new Error("Current Bus Routes: SHA-256 mismatch");
  const raw = JSON.parse(bytes.toString("utf8")) as unknown;
  if (!Array.isArray(raw) || raw.length !== receipt.row_count) throw new Error(`Current Bus Routes: expected ${receipt.row_count} rows`);
  const grouped = new Map<string, CurrentBusRouteRow[]>();
  for (const [index, value] of raw.entries()) {
    const row = object(value, `Current Bus Routes[${index}]`) as CurrentBusRouteRow;
    const routeId = nonEmpty(row.route_id, `Current Bus Routes[${index}].route_id`);
    const validFrom = gtfsDate(nonEmpty(row.valid_from, `Current Bus Routes[${index}].valid_from`));
    const validTo = gtfsDate(nonEmpty(row.valid_to, `Current Bus Routes[${index}].valid_to`));
    if (validFrom !== receipt.valid_from || validTo !== receipt.valid_to) throw new Error(`Current Bus Routes[${index}]: validity bounds differ from receipt`);
    if (receipt.effective_as_of_date < validFrom || receipt.effective_as_of_date > validTo) throw new Error(`Current Bus Routes[${index}]: artifact is not effective on as_of_date`);
    if (row.in_effect !== true && row.in_effect !== "true") throw new Error(`Current Bus Routes[${index}]: selected complete universe contains non-effective row`);
    const rows = grouped.get(routeId) ?? [];
    rows.push(row);
    grouped.set(routeId, rows);
  }
  if (grouped.size !== receipt.exact_route_id_count) throw new Error(`Current Bus Routes: exact identity count mismatch; expected ${receipt.exact_route_id_count}, got ${grouped.size}`);
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([routeId, rows]) => {
    const designations = currentRouteDesignations(rows);
    return {
      schema_version: 1,
      contract_id: "current-bus-route-catalog-row-v1",
      dataset_id: "h2wf-afav",
      artifact_sha256: receipt.sha256,
      exact_route_id: routeId,
      route_short_name: consistentLiteral(rows, "route_short_name", routeId),
      route_long_name: consistentLiteral(rows, "route_long_name", routeId),
      route_description: consistentLiteral(rows, "route_description", routeId),
      effective_as_of_date: receipt.effective_as_of_date,
      valid_from: receipt.valid_from,
      valid_to: receipt.valid_to,
      in_effect: "yes",
      designation_literals: designations.designation_literals,
      normalized_service_modes: designations.normalized_service_modes,
      source_row_count: rows.length,
    };
  });
}

export function routeFamilyId(sourceRouteId: string): string {
  return sourceRouteId.endsWith("+") ? sourceRouteId.slice(0, -1) : sourceRouteId;
}

function jsonl(rows: unknown[]): string {
  return rows.map((row) => stableJson(row as never)).join("\n") + (rows.length ? "\n" : "");
}

function buildDisagreements(
  receipt: GtfsAcquisitionReceiptV1,
  catalog: CatalogRouteRow[],
  identities: ReturnType<typeof mergeRoutePartitions>,
): CatalogGtfsDisagreementRow[] {
  const catalogIds = new Set(catalog.map((row) => row.exact_route_id));
  const gtfsById = new Map(identities.map((row) => [row.source_route_id, row]));
  const rows: CatalogGtfsDisagreementRow[] = [];
  for (const routeId of [...catalogIds].filter((id) => !gtfsById.has(id)).sort()) {
    rows.push({
      schema_version: 1,
      contract_id: "current-catalog-gtfs-disagreement-v1",
      disagreement_type: "catalog_only",
      exact_route_id: routeId,
      comparison_basis: "exact_case_sensitive_route_id",
      equality_claim: false,
      catalog_dataset_id: "h2wf-afav",
      catalog_effective_as_of_date: receipt.as_of_date,
      catalog_route_id: routeId,
      gtfs_snapshot_id: receipt.snapshot_id,
      gtfs_as_of_date: receipt.as_of_date,
      gtfs_dataset_id: null,
      gtfs_source_route_id: null,
    });
  }
  for (const identity of identities.filter((row) => !catalogIds.has(row.source_route_id))) {
    rows.push({
      schema_version: 1,
      contract_id: "current-catalog-gtfs-disagreement-v1",
      disagreement_type: "gtfs_only",
      exact_route_id: identity.source_route_id,
      comparison_basis: "exact_case_sensitive_route_id",
      equality_claim: false,
      catalog_dataset_id: "h2wf-afav",
      catalog_effective_as_of_date: receipt.as_of_date,
      catalog_route_id: null,
      gtfs_snapshot_id: receipt.snapshot_id,
      gtfs_as_of_date: receipt.as_of_date,
      gtfs_dataset_id: identity.dataset_id,
      gtfs_source_route_id: identity.source_route_id,
    });
  }
  return rows.sort((a, b) => `${a.disagreement_type}\0${a.exact_route_id}`.localeCompare(`${b.disagreement_type}\0${b.exact_route_id}`));
}

function buildInventory(
  receipt: GtfsAcquisitionReceiptV1,
  identities: ReturnType<typeof mergeRoutePartitions>,
  activity: RouteActivityRow[],
  catalog: CatalogRouteRow[],
): RouteInventoryRow[] {
  const activityById = new Map(activity.map((row) => [`${row.dataset_id}\0${row.source_route_id}`, row]));
  const catalogById = new Map(catalog.map((row) => [row.exact_route_id, row]));
  const componentById = new Map(receipt.components.map((component) => [component.component_feed_id, component]));
  return identities.map((identity) => {
    const scheduled = activityById.get(`${identity.dataset_id}\0${identity.source_route_id}`)!;
    const current = catalogById.get(identity.source_route_id);
    const gtfsLabel = identity.route.route_short_name || null;
    const displayLabel = current?.route_short_name || gtfsLabel || identity.source_route_id;
    const displaySource = current?.route_short_name ? "current_bus_routes" : gtfsLabel ? "gtfs" : "source_route_id";
    const intervalComponents = identity.component_feed_ids.map((id) => componentById.get(id)!);
    const reliableIntervalStart = intervalComponents.map((component) => component.reliable_interval_start).sort().at(-1)!;
    const reliableIntervalEnd = intervalComponents.map((component) => component.reliable_interval_end).sort()[0]!;
    const labelDiff = current?.route_short_name && gtfsLabel && current.route_short_name !== gtfsLabel
      ? {
        current_bus_routes_route_short_name: current.route_short_name,
        gtfs_route_short_name: gtfsLabel,
      }
      : null;
    return {
      dataset_id: identity.dataset_id,
      component_feed_ids: identity.component_feed_ids,
      source_route_id: identity.source_route_id,
      gtfs_route_id: identity.gtfs_route_id,
      agency_id: identity.route.agency_id || null,
      raw_route_type: identity.route.route_type ?? "",
      route_family_id: routeFamilyId(identity.source_route_id),
      route_short_name: gtfsLabel,
      route_long_name: identity.route.route_long_name || null,
      route_desc: identity.route.route_desc || null,
      declared_in_feed: true,
      catalog_in_effect: current ? "yes" : "no",
      catalog_effective_as_of_date: receipt.as_of_date,
      reliable_interval_start: reliableIntervalStart,
      reliable_interval_end: reliableIntervalEnd,
      reliable_interval_derivation: "component_feed_bounds_intersection_v1",
      reliability_status: scheduled.reliability_status,
      scheduled_in_window: scheduled.scheduled_in_window,
      scheduled_service_dates: scheduled.scheduled_service_dates,
      scheduled_trip_template_date_count: scheduled.scheduled_trip_template_date_count,
      frequencies_present: scheduled.frequencies_present,
      designation_literals: current?.designation_literals ?? [],
      normalized_service_modes: current?.normalized_service_modes ?? [],
      display_label: displayLabel,
      display_label_source: displaySource,
      label_fallback: displaySource === "source_route_id" ? "source_route_id" : null,
      label_diff: labelDiff,
      snapshot_id: receipt.snapshot_id,
    };
  });
}

function compactRoutes(identities: ReturnType<typeof mergeRoutePartitions>): string {
  const headers = ["route_id","agency_id","route_short_name","route_long_name","route_desc","route_type","route_color","route_text_color"];
  return serializeCsv(headers, identities.map((identity) => Object.fromEntries(headers.map((key) => [key, identity.route[key] ?? ""]))));
}

function compactAgencies(feeds: ValidatedFeed[]): string {
  const headers = ["agency_id","agency_name","agency_url","agency_timezone","agency_lang","agency_phone"];
  const rows = new Map<string, Record<string, string>>();
  for (const feed of feeds) for (const agency of feed.agencies) {
    const existing = rows.get(agency.agency_id!);
    const normalized = Object.fromEntries(headers.map((key) => [key, agency[key] ?? ""]));
    if (existing && stableJson(existing) !== stableJson(normalized)) throw new Error(`agency ${agency.agency_id}: non-identical shared definition`);
    rows.set(agency.agency_id!, normalized);
  }
  return serializeCsv(headers, [...rows.values()].sort((a, b) => a.agency_id!.localeCompare(b.agency_id!)));
}

function compactFeedInfo(feeds: ValidatedFeed[]): string {
  const sourceHeaders = ["feed_publisher_name","feed_publisher_url","feed_lang","feed_start_date","feed_end_date","feed_version","feed_contact_url"];
  const headers = ["component_feed_id", ...sourceHeaders];
  const rows = feeds.map((feed) => ({
    component_feed_id: feed.component_feed_id,
    ...Object.fromEntries(sourceHeaders.map((key) => [key, feed.feedInfo[0]![key] ?? ""])),
  })).sort((a, b) => a.component_feed_id.localeCompare(b.component_feed_id));
  return serializeCsv(headers, rows);
}

function writeOutput(directory: string, name: string, bytes: string): ArtifactMetadata {
  writeFileSync(join(directory, name), bytes, "utf8");
  const rows = name.endsWith(".jsonl") ? bytes.split("\n").filter(Boolean).length : name.endsWith(".txt") ? csvDataRowCount(bytes) : 1;
  return artifactMetadata(name, bytes, rows);
}

function assertProductionComponents(receipt: GtfsAcquisitionReceiptV1): void {
  if (receipt.components.length !== 6) throw new Error(`${receipt.snapshot_id}: production receipt must declare exactly six component feeds`);
  const nyct = receipt.components.filter((component) => component.dataset_id === "mta-nyct-bus");
  const busco = receipt.components.filter((component) => component.dataset_id === "mta-bus-company");
  if (nyct.length !== 5 || busco.length !== 1) throw new Error(`${receipt.snapshot_id}: expected five shared NYCT partitions and one separate Bus Company feed`);
}

function buildSnapshotOnce(options: InstallGtfsSnapshotOptions, outputDirectory: string): GtfsSnapshotManifestV2 {
  const receiptBytes = readFileSync(options.receiptPath);
  const receipt = parseReceiptWithoutSelfDecode(JSON.parse(receiptBytes.toString("utf8")), false);
  assertProductionComponents(receipt);
  const inputIds = Object.keys(options.feeds).sort();
  const receiptIds = receipt.components.map((component) => component.component_feed_id).sort();
  if (inputIds.join("\n") !== receiptIds.join("\n")) throw new Error(`feed inputs must exactly match receipt components; expected [${receiptIds}], got [${inputIds}]`);
  if (basename(options.currentBusRoutesPath) !== receipt.current_bus_routes.local_artifact_name) throw new Error(`Current Bus Routes artifact name must be ${receipt.current_bus_routes.local_artifact_name}`);
  mkdirSync(outputDirectory, { recursive: true });
  const feeds = receipt.components.map((component) => validateFeed(component, options.feeds[component.component_feed_id]!));
  const identities = mergeRoutePartitions(feeds);
  const activity = deriveRouteActivity(feeds, receipt.as_of_date, receipt.snapshot_id);
  const catalog = parseCurrentCatalog(options.currentBusRoutesPath, receipt.current_bus_routes);
  const disagreements = buildDisagreements(receipt, catalog, identities);
  const inventory = buildInventory(receipt, identities, activity, catalog);
  const outputs: Record<string, ArtifactMetadata> = {};
  outputs["route_inventory.jsonl"] = writeOutput(outputDirectory, "route_inventory.jsonl", jsonl(inventory));
  outputs["route_activity.jsonl"] = writeOutput(outputDirectory, "route_activity.jsonl", jsonl(activity));
  outputs["catalog_routes.jsonl"] = writeOutput(outputDirectory, "catalog_routes.jsonl", jsonl(catalog));
  outputs["catalog_gtfs_disagreements.jsonl"] = writeOutput(outputDirectory, "catalog_gtfs_disagreements.jsonl", jsonl(disagreements));
  outputs["routes.txt"] = writeOutput(outputDirectory, "routes.txt", compactRoutes(identities));
  outputs["agency.txt"] = writeOutput(outputDirectory, "agency.txt", compactAgencies(feeds));
  outputs["feed_info.txt"] = writeOutput(outputDirectory, "feed_info.txt", compactFeedInfo(feeds));
  // Preserve the accepted tracked receipt bytes exactly; strict parse/self-decode above
  // validates its semantics without silently rewriting the operator-owned artifact.
  outputs["receipt.json"] = writeOutput(outputDirectory, "receipt.json", receiptBytes.toString("utf8"));
  const catalogOnly = disagreements.filter((row) => row.disagreement_type === "catalog_only").length;
  const gtfsOnly = disagreements.filter((row) => row.disagreement_type === "gtfs_only").length;
  const manifest: GtfsSnapshotManifestV2 = {
    schema_version: 2,
    contract_id: "gtfs-route-reference-snapshot-v2",
    snapshot_id: receipt.snapshot_id,
    dataset_id: "mta-bus-static",
    captured_at: receipt.captured_at,
    as_of_date: receipt.as_of_date,
    service_window_start: receipt.service_window_start,
    service_window_end: receipt.service_window_end,
    merge_policy: "shared-nyct-route-namespace-v1",
    id_remapping_policy: "component-feed-prefixed-foreign-keys-v1",
    current_catalog: {
      contract_version: 1,
      dataset_id: "h2wf-afav",
      artifact_sha256: receipt.current_bus_routes.sha256,
      effective_as_of_date: receipt.current_bus_routes.effective_as_of_date,
      catalog_routes: outputs["catalog_routes.jsonl"]!,
      catalog_gtfs_disagreements: outputs["catalog_gtfs_disagreements.jsonl"]!,
      catalog_identity_count: catalog.length,
      catalog_only_count: catalogOnly,
      gtfs_only_count: gtfsOnly,
    },
    components: feeds.map((feed) => ({
      component_feed_id: feed.component_feed_id,
      dataset_id: feed.dataset_id,
      official_url: feed.component.official_url,
      archive_sha256: feed.component.archive_sha256,
      feed_version: feed.component.feed_version,
      publisher: feed.publisher,
      feed_start_date: feed.component.feed_start_date,
      feed_end_date: feed.component.feed_end_date,
      reliable_interval_start: feed.component.reliable_interval_start,
      reliable_interval_end: feed.component.reliable_interval_end,
      agency_timezone: "America/New_York" as const,
      frequencies_present: feed.component.frequencies_present,
      conditional_location_files_present: feed.component.conditional_location_files_present,
      files: feed.component.files,
    })).sort((a, b) => a.component_feed_id.localeCompare(b.component_feed_id)),
    outputs: Object.fromEntries(Object.entries(outputs).sort(([a], [b]) => a.localeCompare(b))),
    counts: {
      route_identity_count: inventory.length,
      route_activity_count: activity.length,
      catalog_identity_count: catalog.length,
      catalog_only_count: catalogOnly,
      gtfs_only_count: gtfsOnly,
    },
  };
  const manifestBytes = serializeGtfsSnapshotManifestV2(manifest);
  writeFileSync(join(outputDirectory, "manifest.json"), manifestBytes, "utf8");
  return manifest;
}

function parseManifestComponent(raw: unknown, index: number): GtfsSnapshotManifestV2["components"][number] {
  const path = `components[${index}]`;
  const row = object(raw, path);
  exactKeys(row, ["component_feed_id","dataset_id","official_url","archive_sha256","feed_version","publisher","feed_start_date","feed_end_date","reliable_interval_start","reliable_interval_end","agency_timezone","frequencies_present","conditional_location_files_present","files"], path);
  const dataset = nonEmpty(row.dataset_id, `${path}.dataset_id`);
  if (dataset !== "mta-nyct-bus" && dataset !== "mta-bus-company") throw new Error(`${path}: unsupported dataset_id`);
  if (row.agency_timezone !== "America/New_York") throw new Error(`${path}: unsupported timezone`);
  const filesObject = object(row.files, `${path}.files`);
  const allowedFiles = new Set<string>([...BASE_GTFS_FILES, ...OPTIONAL_GTFS_FILES]);
  const unknownFiles = Object.keys(filesObject).filter((name) => !allowedFiles.has(name));
  if (unknownFiles.length) throw new Error(`${path}.files: unknown derivation files [${unknownFiles.sort()}]`);
  for (const required of BASE_GTFS_FILES) if (!Object.hasOwn(filesObject, required)) throw new Error(`${path}.files: missing ${required}`);
  const files = Object.fromEntries(Object.entries(filesObject).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => {
    const metadata = parseArtifactMetadata(value, `${path}.files.${name}`);
    if (metadata.path !== name) throw new Error(`${path}.files.${name}.path: must equal file key`);
    return [name, metadata];
  }));
  const frequenciesPresent = bool(row.frequencies_present, `${path}.frequencies_present`);
  if (frequenciesPresent !== Object.hasOwn(files, "frequencies.txt")) throw new Error(`${path}: frequencies declaration/files mismatch`);
  const conditionalPresent = bool(row.conditional_location_files_present, `${path}.conditional_location_files_present`);
  const conditionalFiles = OPTIONAL_GTFS_FILES.filter((name) => name !== "frequencies.txt" && Object.hasOwn(files, name));
  if (conditionalPresent !== (conditionalFiles.length > 0)) throw new Error(`${path}: conditional location declaration/files mismatch`);
  return {
    component_feed_id: nonEmpty(row.component_feed_id, `${path}.component_feed_id`),
    dataset_id: dataset,
    official_url: nonEmpty(row.official_url, `${path}.official_url`),
    archive_sha256: sha(row.archive_sha256, `${path}.archive_sha256`),
    feed_version: nonEmpty(row.feed_version, `${path}.feed_version`),
    publisher: nonEmpty(row.publisher, `${path}.publisher`),
    feed_start_date: isoDate(row.feed_start_date, `${path}.feed_start_date`),
    feed_end_date: isoDate(row.feed_end_date, `${path}.feed_end_date`),
    reliable_interval_start: isoDate(row.reliable_interval_start, `${path}.reliable_interval_start`),
    reliable_interval_end: isoDate(row.reliable_interval_end, `${path}.reliable_interval_end`),
    agency_timezone: "America/New_York",
    frequencies_present: frequenciesPresent,
    conditional_location_files_present: conditionalPresent,
    files,
  };
}

function parseManifestWithoutSelfDecode(input: unknown, skipSelfDecode: boolean): GtfsSnapshotManifestV2 {
  const root = object(input, "GTFS snapshot manifest");
  exactKeys(root, ["schema_version","contract_id","snapshot_id","dataset_id","captured_at","as_of_date","service_window_start","service_window_end","merge_policy","id_remapping_policy","current_catalog","components","outputs","counts"], "GTFS snapshot manifest");
  if (root.schema_version !== 2 || root.contract_id !== "gtfs-route-reference-snapshot-v2" || root.dataset_id !== "mta-bus-static") throw new Error("GTFS snapshot manifest: expected v2 mta-bus-static contract");
  if (root.merge_policy !== "shared-nyct-route-namespace-v1" || root.id_remapping_policy !== "component-feed-prefixed-foreign-keys-v1") throw new Error("GTFS snapshot manifest: unsupported merge/remapping policy");
  const asOf = isoDate(root.as_of_date, "as_of_date");
  const window = sevenDateServiceWindow(asOf);
  if (root.service_window_start !== window[0] || root.service_window_end !== window[6]) throw new Error("GTFS snapshot manifest: invalid service window");
  if (!Array.isArray(root.components) || root.components.length !== 6) throw new Error("GTFS snapshot manifest: expected six components");
  const components = root.components.map(parseManifestComponent);
  sortedUnique(components.map((component) => component.component_feed_id), "components.component_feed_id");
  const outputsObject = object(root.outputs, "outputs");
  const outputNames = Object.keys(outputsObject).sort();
  if (outputNames.join("\n") !== [...OUTPUT_FILES].sort().join("\n")) throw new Error(`outputs: expected exact compact output set [${[...OUTPUT_FILES].sort()}]`);
  const outputs = Object.fromEntries(outputNames.map((name) => {
    const metadata = parseArtifactMetadata(outputsObject[name], `outputs.${name}`);
    if (metadata.path !== name) throw new Error(`outputs.${name}.path: must equal output key`);
    return [name, metadata];
  }));
  const current = object(root.current_catalog, "current_catalog");
  exactKeys(current, ["contract_version","dataset_id","artifact_sha256","effective_as_of_date","catalog_routes","catalog_gtfs_disagreements","catalog_identity_count","catalog_only_count","gtfs_only_count"], "current_catalog");
  if (current.contract_version !== 1 || current.dataset_id !== "h2wf-afav") throw new Error("current_catalog: unsupported contract/dataset");
  const catalogRoutes = parseArtifactMetadata(current.catalog_routes, "current_catalog.catalog_routes");
  const disagreements = parseArtifactMetadata(current.catalog_gtfs_disagreements, "current_catalog.catalog_gtfs_disagreements");
  if (
    stableJson(catalogRoutes) !== stableJson(outputs["catalog_routes.jsonl"]!)
    || stableJson(disagreements) !== stableJson(outputs["catalog_gtfs_disagreements.jsonl"]!)
  ) throw new Error("current_catalog: artifact pointers must equal output metadata");
  const countsObject = object(root.counts, "counts");
  exactKeys(countsObject, ["route_identity_count","route_activity_count","catalog_identity_count","catalog_only_count","gtfs_only_count"], "counts");
  const result: GtfsSnapshotManifestV2 = {
    schema_version: 2,
    contract_id: "gtfs-route-reference-snapshot-v2",
    snapshot_id: nonEmpty(root.snapshot_id, "snapshot_id"),
    dataset_id: "mta-bus-static",
    captured_at: timestamp(root.captured_at, "captured_at"),
    as_of_date: asOf,
    service_window_start: window[0]!,
    service_window_end: window[6]!,
    merge_policy: "shared-nyct-route-namespace-v1",
    id_remapping_policy: "component-feed-prefixed-foreign-keys-v1",
    current_catalog: {
      contract_version: 1,
      dataset_id: "h2wf-afav",
      artifact_sha256: sha(current.artifact_sha256, "current_catalog.artifact_sha256"),
      effective_as_of_date: isoDate(current.effective_as_of_date, "current_catalog.effective_as_of_date"),
      catalog_routes: catalogRoutes,
      catalog_gtfs_disagreements: disagreements,
      catalog_identity_count: count(current.catalog_identity_count, "current_catalog.catalog_identity_count"),
      catalog_only_count: count(current.catalog_only_count, "current_catalog.catalog_only_count"),
      gtfs_only_count: count(current.gtfs_only_count, "current_catalog.gtfs_only_count"),
    },
    components,
    outputs,
    counts: {
      route_identity_count: count(countsObject.route_identity_count, "counts.route_identity_count"),
      route_activity_count: count(countsObject.route_activity_count, "counts.route_activity_count"),
      catalog_identity_count: count(countsObject.catalog_identity_count, "counts.catalog_identity_count"),
      catalog_only_count: count(countsObject.catalog_only_count, "counts.catalog_only_count"),
      gtfs_only_count: count(countsObject.gtfs_only_count, "counts.gtfs_only_count"),
    },
  };
  if (result.current_catalog.effective_as_of_date !== asOf) throw new Error("current_catalog: effective_as_of_date must equal as_of_date");
  if (result.current_catalog.catalog_identity_count !== result.counts.catalog_identity_count || result.current_catalog.catalog_only_count !== result.counts.catalog_only_count || result.current_catalog.gtfs_only_count !== result.counts.gtfs_only_count) throw new Error("current_catalog: counts differ from manifest counts");
  if (!skipSelfDecode) parseManifestWithoutSelfDecode(JSON.parse(stableJson(result)), true);
  return result;
}

export function parseGtfsSnapshotManifestV2(input: unknown): GtfsSnapshotManifestV2 {
  return parseManifestWithoutSelfDecode(input, false);
}

export function serializeGtfsSnapshotManifestV2(manifest: GtfsSnapshotManifestV2): string {
  const parsed = parseManifestWithoutSelfDecode(manifest, false);
  const bytes = `${stableJson(parsed)}\n`;
  parseManifestWithoutSelfDecode(JSON.parse(bytes), true);
  return bytes;
}

function parseJsonl(path: string, bytes: string): Array<Record<string, unknown>> {
  if (!bytes.endsWith("\n") || bytes.includes("\r") || bytes.includes("\n\n")) throw new Error(`${path}: expected canonical newline-delimited JSON`);
  const lines = bytes.slice(0, -1).split("\n").filter(Boolean);
  return lines.map((line, index) => {
    const row = object(JSON.parse(line), `${path}:${index + 1}`);
    if (stableJson(row as unknown as JsonValue) !== line) throw new Error(`${path}:${index + 1}: expected canonical stable JSON`);
    return row;
  });
}

function parseCanonicalCompactCsv(
  directory: string,
  name: "agency.txt" | "feed_info.txt" | "routes.txt",
  headers: string[],
): Array<Record<string, string>> {
  const text = readFileSync(join(directory, name), "utf8");
  if (!text.endsWith("\n") || text.includes("\r")) throw new Error(`${name}: expected canonical LF-terminated CSV bytes`);
  const iterator = csvRows(text);
  const first = iterator.next();
  if (first.done || first.value.join("\0") !== headers.join("\0")) throw new Error(`${name}: expected exact canonical header [${headers}]`);
  const rows = parseGtfsTable(text);
  if (serializeCsv(headers, rows) !== text) throw new Error(`${name}: expected canonical sorted serializer bytes`);
  return rows;
}

function assertExactSnapshotDirectory(directory: string): void {
  const root = lstatSync(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("GTFS snapshot: expected a real directory, not a symlink");
  const expected = ["manifest.json", ...OUTPUT_FILES].sort();
  const entries = readdirSync(directory).sort();
  if (entries.join("\n") !== expected.join("\n")) {
    const expectedSet = new Set(expected);
    const actualSet = new Set(entries);
    const missing = expected.filter((name) => !actualSet.has(name));
    const unexpected = entries.filter((name) => !expectedSet.has(name));
    throw new Error(`GTFS snapshot: exact file set mismatch; missing=[${missing}] unexpected=[${unexpected}]`);
  }
  for (const name of entries) {
    const entry = lstatSync(join(directory, name));
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`GTFS snapshot: ${name} must be a regular file, not a symlink or directory`);
  }
}

function validateScheduledProjection(
  row: Record<string, unknown>,
  path: string,
  manifest: GtfsSnapshotManifestV2,
): Pick<RouteActivityRow, "scheduled_service_dates" | "scheduled_trip_template_date_count" | "scheduled_in_window" | "reliability_status" | "frequencies_present"> {
  const scheduledDates = stringArray(row.scheduled_service_dates, `${path}.scheduled_service_dates`);
  for (const [index, value] of scheduledDates.entries()) {
    const date = isoDate(value, `${path}.scheduled_service_dates[${index}]`);
    if (date < manifest.service_window_start || date > manifest.service_window_end) throw new Error(`${path}.scheduled_service_dates[${index}]: outside declared service window`);
  }
  const templates = count(row.scheduled_trip_template_date_count, `${path}.scheduled_trip_template_date_count`);
  const activity = enumValue(row.scheduled_in_window, ["yes", "no", "indeterminate"] as const, `${path}.scheduled_in_window`);
  const reliability = enumValue(row.reliability_status, ["reliable", "indeterminate"] as const, `${path}.reliability_status`);
  const frequencies = bool(row.frequencies_present, `${path}.frequencies_present`);
  if (reliability === "reliable" && activity === "indeterminate") throw new Error(`${path}: reliable interval cannot yield indeterminate activity`);
  if (reliability === "indeterminate" && activity !== "indeterminate") throw new Error(`${path}: unreliable interval must yield indeterminate activity`);
  if (activity === "yes" && (scheduledDates.length === 0 || templates === 0)) throw new Error(`${path}: scheduled=yes requires dates and trip templates`);
  if (activity !== "yes" && (scheduledDates.length !== 0 || templates !== 0)) throw new Error(`${path}: scheduled=${activity} must not claim dates or trip templates`);
  return {
    scheduled_service_dates: scheduledDates,
    scheduled_trip_template_date_count: templates,
    scheduled_in_window: activity,
    reliability_status: reliability,
    frequencies_present: frequencies,
  };
}

function verifyCompactArtifacts(directory: string, manifest: GtfsSnapshotManifestV2): void {
  for (const [name, metadata] of Object.entries(manifest.outputs)) {
    const path = join(directory, metadata.path);
    if (resolve(path) !== resolve(directory, name)) throw new Error(`${name}: output path escapes snapshot directory`);
    const bytes = readFileSync(path);
    if (bytes.length !== metadata.bytes || sha256Bytes(bytes) !== metadata.sha256) throw new Error(`${name}: output bytes/SHA-256 mismatch`);
    const rows = name.endsWith(".jsonl") ? bytes.toString("utf8").split(/\r?\n/u).filter(Boolean).length : name.endsWith(".txt") ? csvDataRowCount(bytes.toString("utf8")) : 1;
    if (rows !== metadata.rows) throw new Error(`${name}: output logical row count mismatch`);
  }
  const receiptBytes = readFileSync(join(directory, "receipt.json"), "utf8");
  const receipt = parseReceiptWithoutSelfDecode(JSON.parse(receiptBytes), false);
  if (receipt.snapshot_id !== manifest.snapshot_id || receipt.as_of_date !== manifest.as_of_date || receipt.current_bus_routes.sha256 !== manifest.current_catalog.artifact_sha256) throw new Error("receipt.json: snapshot/current-catalog binding mismatch");
  if (receipt.captured_at !== manifest.captured_at || receipt.service_window_start !== manifest.service_window_start || receipt.service_window_end !== manifest.service_window_end || receipt.merge_policy !== manifest.merge_policy) throw new Error("receipt.json: manifest provenance mismatch");
  const receiptComponents = new Map(receipt.components.map((component) => [component.component_feed_id, component]));
  for (const component of manifest.components) {
    const pinned = receiptComponents.get(component.component_feed_id);
    if (!pinned) throw new Error(`${component.component_feed_id}: manifest component is absent from receipt`);
    const manifestProjection = {
      component_feed_id: component.component_feed_id,
      dataset_id: component.dataset_id,
      official_url: component.official_url,
      archive_sha256: component.archive_sha256,
      feed_version: component.feed_version,
      feed_start_date: component.feed_start_date,
      feed_end_date: component.feed_end_date,
      reliable_interval_start: component.reliable_interval_start,
      reliable_interval_end: component.reliable_interval_end,
      agency_timezone: component.agency_timezone,
      frequencies_present: component.frequencies_present,
      conditional_location_files_present: component.conditional_location_files_present,
      files: component.files,
    };
    const receiptProjection = {
      component_feed_id: pinned.component_feed_id,
      dataset_id: pinned.dataset_id,
      official_url: pinned.official_url,
      archive_sha256: pinned.archive_sha256,
      feed_version: pinned.feed_version,
      feed_start_date: pinned.feed_start_date,
      feed_end_date: pinned.feed_end_date,
      reliable_interval_start: pinned.reliable_interval_start,
      reliable_interval_end: pinned.reliable_interval_end,
      agency_timezone: pinned.agency_timezone,
      frequencies_present: pinned.frequencies_present,
      conditional_location_files_present: pinned.conditional_location_files_present,
      files: pinned.files,
    };
    if (stableJson(manifestProjection) !== stableJson(receiptProjection)) throw new Error(`${component.component_feed_id}: manifest component differs from receipt`);
  }
  const inventory = parseJsonl("route_inventory.jsonl", readFileSync(join(directory, "route_inventory.jsonl"), "utf8"));
  const activity = parseJsonl("route_activity.jsonl", readFileSync(join(directory, "route_activity.jsonl"), "utf8"));
  const catalog = parseJsonl("catalog_routes.jsonl", readFileSync(join(directory, "catalog_routes.jsonl"), "utf8"));
  const disagreements = parseJsonl("catalog_gtfs_disagreements.jsonl", readFileSync(join(directory, "catalog_gtfs_disagreements.jsonl"), "utf8"));
  const routes = parseCanonicalCompactCsv(directory, "routes.txt", ["route_id","agency_id","route_short_name","route_long_name","route_desc","route_type","route_color","route_text_color"]);
  const agencies = parseCanonicalCompactCsv(directory, "agency.txt", ["agency_id","agency_name","agency_url","agency_timezone","agency_lang","agency_phone"]);
  const feedInfo = parseCanonicalCompactCsv(directory, "feed_info.txt", ["component_feed_id","feed_publisher_name","feed_publisher_url","feed_lang","feed_start_date","feed_end_date","feed_version","feed_contact_url"]);
  if (inventory.length !== manifest.counts.route_identity_count || activity.length !== manifest.counts.route_activity_count || catalog.length !== manifest.counts.catalog_identity_count) throw new Error("compact artifacts: manifest count mismatch");
  const inventoryIds = inventory.map((row, index) => {
    const path = `route_inventory.jsonl:${index + 1}`;
    exactKeys(row, ["dataset_id","component_feed_ids","source_route_id","gtfs_route_id","agency_id","raw_route_type","route_family_id","route_short_name","route_long_name","route_desc","declared_in_feed","catalog_in_effect","catalog_effective_as_of_date","reliable_interval_start","reliable_interval_end","reliable_interval_derivation","reliability_status","scheduled_in_window","scheduled_service_dates","scheduled_trip_template_date_count","frequencies_present","designation_literals","normalized_service_modes","display_label","display_label_source","label_fallback","label_diff","snapshot_id"], path);
    const dataset = datasetId(row.dataset_id, `${path}.dataset_id`);
    const components = stringArray(row.component_feed_ids, `${path}.component_feed_ids`, { nonEmpty: true });
    for (const componentId of components) {
      const component = manifest.components.find((candidate) => candidate.component_feed_id === componentId);
      if (!component || component.dataset_id !== dataset) throw new Error(`${path}: component ${componentId} does not belong to ${dataset}`);
    }
    const sourceRouteId = nonEmpty(row.source_route_id, `${path}.source_route_id`);
    if (sourceRouteId !== nonEmpty(row.gtfs_route_id, `${path}.gtfs_route_id`)) throw new Error(`${path}: source_route_id must equal gtfs_route_id`);
    nullableNonEmpty(row.agency_id, `${path}.agency_id`);
    nonEmpty(row.raw_route_type, `${path}.raw_route_type`);
    nullableNonEmpty(row.route_short_name, `${path}.route_short_name`);
    nullableNonEmpty(row.route_long_name, `${path}.route_long_name`);
    nullableNonEmpty(row.route_desc, `${path}.route_desc`);
    if (row.declared_in_feed !== true) throw new Error(`${path}.declared_in_feed: expected true`);
    enumValue(row.catalog_in_effect, ["yes", "no", "indeterminate"] as const, `${path}.catalog_in_effect`);
    if (row.snapshot_id !== manifest.snapshot_id || isoDate(row.catalog_effective_as_of_date, `${path}.catalog_effective_as_of_date`) !== manifest.as_of_date) throw new Error(`${path}: snapshot/date mismatch`);
    if (row.route_family_id !== routeFamilyId(sourceRouteId)) throw new Error(`${path}: invalid route family`);
    const reliableStart = isoDate(row.reliable_interval_start, `${path}.reliable_interval_start`);
    const reliableEnd = isoDate(row.reliable_interval_end, `${path}.reliable_interval_end`);
    if (reliableStart > reliableEnd) throw new Error(`${path}: reversed reliable interval`);
    if (row.reliable_interval_derivation !== "component_feed_bounds_intersection_v1") throw new Error(`${path}: unsupported reliable interval derivation`);
    const expectedComponents = components.map((componentId) => manifest.components.find((component) => component.component_feed_id === componentId)!);
    const expectedReliableStart = expectedComponents.map((component) => component.reliable_interval_start).sort().at(-1)!;
    const expectedReliableEnd = expectedComponents.map((component) => component.reliable_interval_end).sort()[0]!;
    if (reliableStart !== expectedReliableStart || reliableEnd !== expectedReliableEnd) throw new Error(`${path}: reliable interval differs from component-feed intersection`);
    const scheduled = validateScheduledProjection(row, path, manifest);
    const expectedReliability = reliableStart <= manifest.service_window_start && reliableEnd >= manifest.service_window_end
      ? "reliable"
      : "indeterminate";
    if (scheduled.reliability_status !== expectedReliability) throw new Error(`${path}: reliability status differs from route-level interval coverage`);
    stringArray(row.designation_literals, `${path}.designation_literals`);
    for (const mode of stringArray(row.normalized_service_modes, `${path}.normalized_service_modes`)) enumValue(mode, SERVICE_MODES, `${path}.normalized_service_modes`);
    nonEmpty(row.display_label, `${path}.display_label`);
    enumValue(row.display_label_source, ["current_bus_routes", "gtfs", "source_route_id"] as const, `${path}.display_label_source`);
    if (row.label_fallback !== null && row.label_fallback !== "source_route_id") throw new Error(`${path}.label_fallback: unsupported fallback`);
    if (row.label_diff !== null) {
      const diff = object(row.label_diff, `${path}.label_diff`);
      exactKeys(diff, ["current_bus_routes_route_short_name","gtfs_route_short_name"], `${path}.label_diff`);
      nonEmpty(diff.current_bus_routes_route_short_name, `${path}.label_diff.current_bus_routes_route_short_name`);
      nonEmpty(diff.gtfs_route_short_name, `${path}.label_diff.gtfs_route_short_name`);
      if (diff.current_bus_routes_route_short_name === diff.gtfs_route_short_name) throw new Error(`${path}.label_diff: source labels must differ`);
    }
    return `${dataset}\0${sourceRouteId}`;
  });
  sortedUnique(inventoryIds, "route_inventory identities");
  if (routes.length !== inventory.length) throw new Error("routes.txt: row count differs from route inventory");
  for (const [index, route] of routes.entries()) {
    const source = inventory[index]!;
    const projection = {
      route_id: source.source_route_id,
      agency_id: source.agency_id ?? "",
      route_short_name: source.route_short_name ?? "",
      route_long_name: source.route_long_name ?? "",
      route_desc: source.route_desc ?? "",
      route_type: source.raw_route_type,
    };
    const compactProjection = Object.fromEntries(Object.keys(projection).map((key) => [key, route[key] ?? ""]));
    if (stableJson(compactProjection) !== stableJson(projection as unknown as JsonValue)) throw new Error(`routes.txt:${index + 2}: projection differs from route inventory`);
  }
  const agencyIds = agencies.map((row, index) => {
    const id = nonEmpty(row.agency_id, `agency.txt:${index + 2}.agency_id`);
    if (row.agency_timezone !== "America/New_York") throw new Error(`agency.txt:${index + 2}: agency_timezone must be America/New_York`);
    return id;
  });
  sortedUnique(agencyIds, "agency.txt agency IDs");
  const referencedAgencyIds = [...new Set(routes.map((route) => route.agency_id).filter(Boolean))].sort();
  for (const id of referencedAgencyIds) if (!agencyIds.includes(id!)) throw new Error(`routes.txt: references unknown agency ${id}`);
  if (feedInfo.length !== manifest.components.length) throw new Error("feed_info.txt: row count differs from manifest components");
  const feedInfoIds = feedInfo.map((row, index) => {
    const path = `feed_info.txt:${index + 2}`;
    const componentId = nonEmpty(row.component_feed_id, `${path}.component_feed_id`);
    const component = manifest.components.find((candidate) => candidate.component_feed_id === componentId);
    if (!component) throw new Error(`${path}: unknown component_feed_id ${componentId}`);
    if (
      row.feed_publisher_name !== component.publisher
      || gtfsDate(row.feed_start_date ?? "", `${path}.feed_start_date`) !== component.feed_start_date
      || gtfsDate(row.feed_end_date ?? "", `${path}.feed_end_date`) !== component.feed_end_date
      || row.feed_version !== component.feed_version
    ) throw new Error(`${path}: projection differs from manifest component`);
    return componentId;
  });
  sortedUnique(feedInfoIds, "feed_info.txt component IDs");
  const inventoryById = new Map(inventoryIds.map((id, index) => [id, inventory[index]!]));
  const activityIds = activity.map((row, index) => {
    const path = `route_activity.jsonl:${index + 1}`;
    exactKeys(row, ["dataset_id","component_feed_ids","source_route_id","gtfs_route_id","scheduled_service_dates","scheduled_trip_template_date_count","scheduled_in_window","reliability_status","frequencies_present","snapshot_id"], path);
    const dataset = datasetId(row.dataset_id, `${path}.dataset_id`);
    const components = stringArray(row.component_feed_ids, `${path}.component_feed_ids`, { nonEmpty: true });
    const sourceRouteId = nonEmpty(row.source_route_id, `${path}.source_route_id`);
    if (sourceRouteId !== nonEmpty(row.gtfs_route_id, `${path}.gtfs_route_id`) || row.snapshot_id !== manifest.snapshot_id) throw new Error(`${path}: identity/snapshot mismatch`);
    const scheduled = validateScheduledProjection(row, path, manifest);
    const id = `${dataset}\0${sourceRouteId}`;
    const source = inventoryById.get(id);
    if (!source) throw new Error(`${path}: identity absent from route inventory`);
    const projection = {
      component_feed_ids: components,
      scheduled_service_dates: scheduled.scheduled_service_dates,
      scheduled_trip_template_date_count: scheduled.scheduled_trip_template_date_count,
      scheduled_in_window: scheduled.scheduled_in_window,
      reliability_status: scheduled.reliability_status,
      frequencies_present: scheduled.frequencies_present,
    };
    const inventoryProjection = {
      component_feed_ids: source.component_feed_ids,
      scheduled_service_dates: source.scheduled_service_dates,
      scheduled_trip_template_date_count: source.scheduled_trip_template_date_count,
      scheduled_in_window: source.scheduled_in_window,
      reliability_status: source.reliability_status,
      frequencies_present: source.frequencies_present,
    };
    if (stableJson(projection) !== stableJson(inventoryProjection as unknown as JsonValue)) throw new Error(`${path}: activity projection differs from route inventory`);
    return id;
  });
  sortedUnique(activityIds, "route_activity identities");
  if (activityIds.join("\n") !== inventoryIds.join("\n")) throw new Error("route_activity.jsonl: identities differ from inventory");
  const catalogIds = catalog.map((row, index) => {
    const path = `catalog_routes.jsonl:${index + 1}`;
    exactKeys(row, ["schema_version","contract_id","dataset_id","artifact_sha256","exact_route_id","route_short_name","route_long_name","route_description","effective_as_of_date","valid_from","valid_to","in_effect","designation_literals","normalized_service_modes","source_row_count"], path);
    if (row.schema_version !== 1 || row.contract_id !== "current-bus-route-catalog-row-v1" || row.dataset_id !== "h2wf-afav" || row.artifact_sha256 !== manifest.current_catalog.artifact_sha256 || row.effective_as_of_date !== manifest.as_of_date || row.in_effect !== "yes") throw new Error(`${path}: contract/snapshot mismatch`);
    const exactRouteId = nonEmpty(row.exact_route_id, `${path}.exact_route_id`);
    nullableNonEmpty(row.route_short_name, `${path}.route_short_name`);
    nullableNonEmpty(row.route_long_name, `${path}.route_long_name`);
    nullableNonEmpty(row.route_description, `${path}.route_description`);
    const validFrom = isoDate(row.valid_from, `${path}.valid_from`);
    const validTo = isoDate(row.valid_to, `${path}.valid_to`);
    if (validFrom > manifest.as_of_date || validTo < manifest.as_of_date) throw new Error(`${path}: row does not cover effective as-of date`);
    stringArray(row.designation_literals, `${path}.designation_literals`);
    for (const mode of stringArray(row.normalized_service_modes, `${path}.normalized_service_modes`)) enumValue(mode, SERVICE_MODES, `${path}.normalized_service_modes`);
    if (count(row.source_row_count, `${path}.source_row_count`) === 0) throw new Error(`${path}.source_row_count: expected positive count`);
    return exactRouteId;
  });
  sortedUnique(catalogIds, "catalog exact identities");
  let catalogOnly = 0;
  let gtfsOnly = 0;
  const disagreementIds: string[] = [];
  for (const [index, row] of disagreements.entries()) {
    const path = `catalog_gtfs_disagreements.jsonl:${index + 1}`;
    exactKeys(row, ["schema_version","contract_id","disagreement_type","exact_route_id","comparison_basis","equality_claim","catalog_dataset_id","catalog_effective_as_of_date","catalog_route_id","gtfs_snapshot_id","gtfs_as_of_date","gtfs_dataset_id","gtfs_source_route_id"], path);
    if (row.schema_version !== 1 || row.contract_id !== "current-catalog-gtfs-disagreement-v1" || row.equality_claim !== false || row.comparison_basis !== "exact_case_sensitive_route_id" || row.catalog_dataset_id !== "h2wf-afav") throw new Error(`${path}: invalid contract/equality semantics`);
    if (row.catalog_effective_as_of_date !== manifest.as_of_date || row.gtfs_as_of_date !== manifest.as_of_date || row.gtfs_snapshot_id !== manifest.snapshot_id) throw new Error(`${path}: snapshot/date mismatch`);
    const type = enumValue(row.disagreement_type, ["catalog_only", "gtfs_only"] as const, `${path}.disagreement_type`);
    const exactRouteId = nonEmpty(row.exact_route_id, `${path}.exact_route_id`);
    if (type === "catalog_only") {
      catalogOnly += 1;
      if (row.catalog_route_id !== exactRouteId || row.gtfs_dataset_id !== null || row.gtfs_source_route_id !== null) throw new Error(`${path}: invalid catalog-only disposition`);
    } else {
      gtfsOnly += 1;
      datasetId(row.gtfs_dataset_id, `${path}.gtfs_dataset_id`);
      if (row.catalog_route_id !== null || row.gtfs_source_route_id !== exactRouteId) throw new Error(`${path}: invalid GTFS-only disposition`);
    }
    disagreementIds.push(`${type}\0${exactRouteId}`);
  }
  sortedUnique(disagreementIds, "catalog disagreement identities");
  if (catalogOnly !== manifest.counts.catalog_only_count || gtfsOnly !== manifest.counts.gtfs_only_count) throw new Error("catalog disagreements: count mismatch");
  const catalogSet = new Set(catalogIds);
  const inventoryExactSet = new Set(inventory.map((row) => nonEmpty(row.source_route_id, "route_inventory.source_route_id")));
  const expectedDisagreements = [
    ...catalogIds.filter((id) => !inventoryExactSet.has(id)).map((id) => `catalog_only\0${id}`),
    ...[...inventoryExactSet].filter((id) => !catalogSet.has(id)).sort().map((id) => `gtfs_only\0${id}`),
  ];
  if (disagreementIds.join("\n") !== expectedDisagreements.join("\n")) throw new Error("catalog disagreements: rows do not equal exact catalog/GTFS set differences");
  const catalogById = new Map(catalogIds.map((id, index) => [id, catalog[index]!]));
  for (const row of inventory) {
    const exact = nonEmpty(row.source_route_id, "route_inventory.source_route_id");
    const current = catalogSet.has(exact);
    if (row.catalog_in_effect !== (current ? "yes" : "no")) throw new Error(`${exact}: catalog_in_effect disagrees with exact catalog membership`);
    const catalogRow = catalogById.get(exact);
    const currentShortName = catalogRow?.route_short_name as string | null | undefined;
    const gtfsShortName = row.route_short_name as string | null;
    const expectedLabel = currentShortName ?? gtfsShortName ?? exact;
    const expectedSource = currentShortName ? "current_bus_routes" : gtfsShortName ? "gtfs" : "source_route_id";
    if (row.display_label !== expectedLabel || row.display_label_source !== expectedSource) throw new Error(`${exact}: display label violates official precedence`);
    const expectedFallback = expectedSource === "source_route_id" ? "source_route_id" : null;
    if (row.label_fallback !== expectedFallback) throw new Error(`${exact}: label fallback provenance differs`);
    const expectedLabelDiff = currentShortName && gtfsShortName && currentShortName !== gtfsShortName
      ? {
        current_bus_routes_route_short_name: currentShortName,
        gtfs_route_short_name: gtfsShortName,
      }
      : null;
    if (stableJson(row.label_diff as JsonValue) !== stableJson(expectedLabelDiff as JsonValue)) throw new Error(`${exact}: label-difference provenance differs`);
    const expectedLiterals = catalogRow?.designation_literals ?? [];
    const expectedModes = catalogRow?.normalized_service_modes ?? [];
    if (
      stableJson(row.designation_literals as JsonValue) !== stableJson(expectedLiterals as JsonValue)
      || stableJson(row.normalized_service_modes as JsonValue) !== stableJson(expectedModes as JsonValue)
    ) throw new Error(`${exact}: designation/mode projection differs from exact catalog row`);
  }
}

export function verifyGtfsSnapshotDirectory(directory: string): InstallGtfsSnapshotResult {
  assertExactSnapshotDirectory(directory);
  const manifestPath = join(directory, "manifest.json");
  const manifestBytes = readFileSync(manifestPath);
  const manifest = parseManifestWithoutSelfDecode(JSON.parse(manifestBytes.toString("utf8")), false);
  if (manifestBytes.toString("utf8") !== serializeGtfsSnapshotManifestV2(manifest)) throw new Error("manifest.json: expected canonical serialized bytes");
  verifyCompactArtifacts(directory, manifest);
  return {
    snapshot_id: manifest.snapshot_id,
    directory,
    manifest_sha256: sha256Bytes(manifestBytes),
    route_identity_count: manifest.counts.route_identity_count,
    catalog_identity_count: manifest.counts.catalog_identity_count,
    catalog_only_count: manifest.counts.catalog_only_count,
    gtfs_only_count: manifest.counts.gtfs_only_count,
    deterministic_tree: directoryTree(directory),
  };
}

export function directoryTree(directory: string): Array<{ path: string; sha256: string; bytes: number }> {
  const result: Array<{ path: string; sha256: string; bytes: number }> = [];
  const walk = (root: string) => {
    for (const name of readdirSync(root).sort()) {
      const path = join(root, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`${path}: deterministic tree rejects symbolic links`);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) {
        const relativePath = relative(directory, path).split(sep).join("/");
        const bytes = readFileSync(path);
        result.push({ path: relativePath, sha256: sha256Bytes(bytes), bytes: bytes.length });
      }
    }
  };
  walk(directory);
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

export function installGtfsSnapshot(options: InstallGtfsSnapshotOptions): InstallGtfsSnapshotResult {
  const receipt = parseReceiptWithoutSelfDecode(JSON.parse(readFileSync(options.receiptPath, "utf8")), false);
  mkdirSync(options.snapshotsRoot, { recursive: true });
  const destination = join(options.snapshotsRoot, receipt.snapshot_id);
  if (existsSync(destination)) throw new Error(`${receipt.snapshot_id}: snapshot directory already exists; immutable IDs cannot be overwritten`);
  const first = mkdtempSync(join(options.snapshotsRoot, `.${receipt.snapshot_id}.build-a-`));
  const second = mkdtempSync(join(options.snapshotsRoot, `.${receipt.snapshot_id}.build-b-`));
  let installed = false;
  try {
    buildSnapshotOnce(options, first);
    const firstVerification = verifyGtfsSnapshotDirectory(first);
    buildSnapshotOnce(options, second);
    verifyGtfsSnapshotDirectory(second);
    const left = directoryTree(first);
    const right = directoryTree(second);
    if (stableJson(left) !== stableJson(right)) throw new Error(`${receipt.snapshot_id}: deterministic double-build path/SHA tree mismatch`);
    renameSync(first, destination);
    installed = true;
    return { ...firstVerification, directory: destination, deterministic_tree: left };
  } finally {
    if (!installed && existsSync(first)) rmSync(first, { recursive: true, force: true });
    if (existsSync(second)) rmSync(second, { recursive: true, force: true });
  }
}
