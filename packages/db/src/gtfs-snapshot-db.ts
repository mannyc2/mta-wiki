/// <reference path="./bun-sqlite.d.ts" />
import type { Database } from "bun:sqlite";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  SERVICE_MODES,
  parseGtfsSnapshotManifestV2,
  routeFamilyId,
  sevenDateServiceWindow,
  verifyGtfsSnapshotDirectory,
  type ActivityValue,
  type CatalogGtfsDisagreementRow,
  type CatalogRouteRow,
  type DatasetId,
  type GtfsSnapshotManifestV2,
  type ReliabilityStatus,
  type RouteActivityRow,
  type RouteInventoryRow,
  type ServiceMode,
} from "./gtfs-snapshot.js";
import { stableJson } from "./stable-json.js";

const DATASETS = new Set<DatasetId>(["mta-nyct-bus", "mta-bus-company"]);
const ACTIVITY_VALUES = new Set<ActivityValue>(["yes", "no", "indeterminate"]);
const RELIABILITY_VALUES = new Set<ReliabilityStatus>(["reliable", "indeterminate"]);
const SERVICE_MODE_VALUES = new Set<ServiceMode>(SERVICE_MODES);
const SHA256 = /^[0-9a-f]{64}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SAFE_SNAPSHOT_ID = /^([A-Za-z0-9][A-Za-z0-9._-]*)\n$/u;

const INVENTORY_KEYS = [
  "agency_id",
  "catalog_effective_as_of_date",
  "catalog_in_effect",
  "component_feed_ids",
  "dataset_id",
  "declared_in_feed",
  "designation_literals",
  "display_label",
  "display_label_source",
  "frequencies_present",
  "gtfs_route_id",
  "label_diff",
  "label_fallback",
  "normalized_service_modes",
  "raw_route_type",
  "reliable_interval_derivation",
  "reliable_interval_end",
  "reliable_interval_start",
  "reliability_status",
  "route_desc",
  "route_family_id",
  "route_long_name",
  "route_short_name",
  "scheduled_in_window",
  "scheduled_service_dates",
  "scheduled_trip_template_date_count",
  "snapshot_id",
  "source_route_id",
] as const;

const ACTIVITY_KEYS = [
  "component_feed_ids",
  "dataset_id",
  "frequencies_present",
  "gtfs_route_id",
  "reliability_status",
  "scheduled_in_window",
  "scheduled_service_dates",
  "scheduled_trip_template_date_count",
  "snapshot_id",
  "source_route_id",
] as const;

const CATALOG_KEYS = [
  "artifact_sha256",
  "contract_id",
  "dataset_id",
  "designation_literals",
  "effective_as_of_date",
  "exact_route_id",
  "in_effect",
  "normalized_service_modes",
  "route_description",
  "route_long_name",
  "route_short_name",
  "schema_version",
  "source_row_count",
  "valid_from",
  "valid_to",
] as const;

const DISAGREEMENT_KEYS = [
  "catalog_dataset_id",
  "catalog_effective_as_of_date",
  "catalog_route_id",
  "comparison_basis",
  "contract_id",
  "disagreement_type",
  "equality_claim",
  "exact_route_id",
  "gtfs_as_of_date",
  "gtfs_dataset_id",
  "gtfs_snapshot_id",
  "gtfs_source_route_id",
  "schema_version",
] as const;

export type SelectedGtfsSnapshotLoadResult =
  | {
    selected: false;
    snapshot_id: null;
    manifest_sha256: null;
    route_inventory: 0;
    route_activity: 0;
    catalog_routes: 0;
    catalog_disagreements: 0;
  }
  | {
    selected: true;
    snapshot_id: string;
    manifest_sha256: string;
    route_inventory: number;
    route_activity: number;
    catalog_routes: number;
    catalog_disagreements: number;
  };

type ValidatedSnapshot = {
  manifest: GtfsSnapshotManifestV2;
  manifestSha256: string;
  inventory: RouteInventoryRow[];
  activity: RouteActivityRow[];
  catalog: CatalogRouteRow[];
  disagreements: CatalogGtfsDisagreementRow[];
};

export function gtfsReferenceRoot(): string {
  return join(repoRoot, "data", "reference", "gtfs");
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  const allowed = new Set(expected);
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(`${path}: strict keys mismatch; missing=[${missing.sort()}] unexpected=[${unexpected.sort()}]`);
  }
}

function textValue(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`${path}: expected string`);
  return value;
}

function nonEmpty(value: unknown, path: string): string {
  const result = textValue(value, path);
  if (result.length === 0) throw new Error(`${path}: expected non-empty string`);
  return result;
}

function nullableNonEmpty(value: unknown, path: string): string | null {
  if (value === null) return null;
  return nonEmpty(value, path);
}

function labelDiff(
  value: unknown,
  path: string,
): RouteInventoryRow["label_diff"] {
  if (value === null) return null;
  const row = record(value, path);
  exactKeys(row, ["current_bus_routes_route_short_name", "gtfs_route_short_name"], path);
  const current = nonEmpty(row.current_bus_routes_route_short_name, `${path}.current_bus_routes_route_short_name`);
  const gtfs = nonEmpty(row.gtfs_route_short_name, `${path}.gtfs_route_short_name`);
  if (current === gtfs) throw new Error(`${path}: source labels must differ`);
  return {
    current_bus_routes_route_short_name: current,
    gtfs_route_short_name: gtfs,
  };
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path}: expected boolean`);
  return value;
}

function integer(value: unknown, path: string, positive = false): number {
  if (!Number.isSafeInteger(value) || (positive ? (value as number) <= 0 : (value as number) < 0)) {
    throw new Error(`${path}: expected ${positive ? "positive" : "non-negative"} safe integer`);
  }
  return value as number;
}

function isoDate(value: unknown, path: string): string {
  const result = nonEmpty(value, path);
  const parsed = new Date(`${result}T12:00:00Z`);
  if (!ISO_DATE.test(result) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new Error(`${path}: expected valid YYYY-MM-DD`);
  }
  return result;
}

function sha256(value: unknown, path: string): string {
  const result = nonEmpty(value, path);
  if (!SHA256.test(result)) throw new Error(`${path}: expected lowercase SHA-256`);
  return result;
}

function literal<T extends string>(value: unknown, allowed: ReadonlySet<T>, path: string): T {
  const result = nonEmpty(value, path) as T;
  if (!allowed.has(result)) throw new Error(`${path}: unsupported value ${JSON.stringify(result)}`);
  return result;
}

function strings(value: unknown, path: string, allowEmpty = false): string[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  const result = value.map((entry, index) => allowEmpty
    ? textValue(entry, `${path}[${index}]`)
    : nonEmpty(entry, `${path}[${index}]`));
  assertSortedUnique(result, path);
  return result;
}

function modes(value: unknown, path: string): ServiceMode[] {
  return strings(value, path).map((entry, index) =>
    literal(entry, SERVICE_MODE_VALUES, `${path}[${index}]`));
}

function assertSortedUnique(values: string[], path: string): void {
  if (new Set(values).size !== values.length || stableJson(values) !== stableJson([...values].sort())) {
    throw new Error(`${path}: expected sorted unique values`);
  }
}

function parseJsonl(path: string): unknown[] {
  return readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line) as unknown;
    } catch (error) {
      throw new Error(`${path}:${index + 1}: invalid JSON: ${String(error)}`);
    }
  });
}

function dataset(value: unknown, path: string): DatasetId {
  return literal(value, DATASETS, path);
}

function activityValue(value: unknown, path: string): ActivityValue {
  return literal(value, ACTIVITY_VALUES, path);
}

function reliability(value: unknown, path: string): ReliabilityStatus {
  return literal(value, RELIABILITY_VALUES, path);
}

function componentFeeds(
  value: unknown,
  expectedDataset: DatasetId,
  componentDatasets: ReadonlyMap<string, DatasetId>,
  path: string,
): string[] {
  const result = strings(value, path);
  if (result.length === 0) throw new Error(`${path}: expected at least one component feed`);
  for (const component of result) {
    const componentDataset = componentDatasets.get(component);
    if (!componentDataset) throw new Error(`${path}: unknown component feed ${component}`);
    if (componentDataset !== expectedDataset) {
      throw new Error(`${path}: component ${component} belongs to ${componentDataset}, not ${expectedDataset}`);
    }
  }
  return result;
}

function serviceDates(value: unknown, manifest: GtfsSnapshotManifestV2, path: string): string[] {
  const result = strings(value, path).map((date, index) => isoDate(date, `${path}[${index}]`));
  const window = new Set(sevenDateServiceWindow(manifest.as_of_date));
  for (const date of result) if (!window.has(date)) throw new Error(`${path}: date ${date} is outside the selected service window`);
  return result;
}

function assertReliableActivity(row: RouteActivityRow | RouteInventoryRow, path: string): void {
  if (row.reliability_status === "indeterminate") {
    if (row.scheduled_in_window !== "indeterminate") throw new Error(`${path}: unreliable interval must keep scheduled status indeterminate`);
    return;
  }
  if (row.reliability_status !== "reliable") return;
  const expected = row.scheduled_trip_template_date_count > 0 ? "yes" : "no";
  if (row.scheduled_in_window !== expected) {
    throw new Error(`${path}: reliable scheduled status disagrees with trip-template/date count`);
  }
  if ((row.scheduled_service_dates.length > 0) !== (expected === "yes")) {
    throw new Error(`${path}: reliable scheduled dates disagree with scheduled status`);
  }
}

function parseInventoryRow(
  value: unknown,
  index: number,
  manifest: GtfsSnapshotManifestV2,
  componentDatasets: ReadonlyMap<string, DatasetId>,
): RouteInventoryRow {
  const path = `route_inventory.jsonl:${index + 1}`;
  const row = record(value, path);
  exactKeys(row, INVENTORY_KEYS, path);
  const datasetId = dataset(row.dataset_id, `${path}.dataset_id`);
  const sourceRouteId = nonEmpty(row.source_route_id, `${path}.source_route_id`);
  const gtfsRouteId = nonEmpty(row.gtfs_route_id, `${path}.gtfs_route_id`);
  const componentFeedIds = componentFeeds(row.component_feed_ids, datasetId, componentDatasets, `${path}.component_feed_ids`);
  if (sourceRouteId !== gtfsRouteId) throw new Error(`${path}: source_route_id must equal gtfs_route_id`);
  if (row.declared_in_feed !== true) throw new Error(`${path}.declared_in_feed: expected true`);
  const result: RouteInventoryRow = {
    dataset_id: datasetId,
    component_feed_ids: componentFeedIds,
    source_route_id: sourceRouteId,
    gtfs_route_id: gtfsRouteId,
    agency_id: nullableNonEmpty(row.agency_id, `${path}.agency_id`),
    raw_route_type: nonEmpty(row.raw_route_type, `${path}.raw_route_type`),
    route_family_id: nonEmpty(row.route_family_id, `${path}.route_family_id`),
    route_short_name: nullableNonEmpty(row.route_short_name, `${path}.route_short_name`),
    route_long_name: nullableNonEmpty(row.route_long_name, `${path}.route_long_name`),
    route_desc: nullableNonEmpty(row.route_desc, `${path}.route_desc`),
    declared_in_feed: true,
    catalog_in_effect: activityValue(row.catalog_in_effect, `${path}.catalog_in_effect`),
    catalog_effective_as_of_date: isoDate(row.catalog_effective_as_of_date, `${path}.catalog_effective_as_of_date`),
    reliable_interval_start: isoDate(row.reliable_interval_start, `${path}.reliable_interval_start`),
    reliable_interval_end: isoDate(row.reliable_interval_end, `${path}.reliable_interval_end`),
    reliable_interval_derivation: literal(
      row.reliable_interval_derivation,
      new Set(["component_feed_bounds_intersection_v1"] as const),
      `${path}.reliable_interval_derivation`,
    ),
    reliability_status: reliability(row.reliability_status, `${path}.reliability_status`),
    scheduled_in_window: activityValue(row.scheduled_in_window, `${path}.scheduled_in_window`),
    scheduled_service_dates: serviceDates(row.scheduled_service_dates, manifest, `${path}.scheduled_service_dates`),
    scheduled_trip_template_date_count: integer(row.scheduled_trip_template_date_count, `${path}.scheduled_trip_template_date_count`),
    frequencies_present: bool(row.frequencies_present, `${path}.frequencies_present`),
    designation_literals: strings(row.designation_literals, `${path}.designation_literals`),
    normalized_service_modes: modes(row.normalized_service_modes, `${path}.normalized_service_modes`),
    display_label: nonEmpty(row.display_label, `${path}.display_label`),
    display_label_source: literal(
      row.display_label_source,
      new Set(["current_bus_routes", "gtfs", "source_route_id"] as const),
      `${path}.display_label_source`,
    ),
    label_fallback: row.label_fallback === null
      ? null
      : literal(row.label_fallback, new Set(["source_route_id"] as const), `${path}.label_fallback`),
    label_diff: labelDiff(row.label_diff, `${path}.label_diff`),
    snapshot_id: nonEmpty(row.snapshot_id, `${path}.snapshot_id`),
  };
  if (result.snapshot_id !== manifest.snapshot_id) throw new Error(`${path}: snapshot_id mismatch`);
  if (result.catalog_effective_as_of_date !== manifest.current_catalog.effective_as_of_date) {
    throw new Error(`${path}: catalog effective date mismatch`);
  }
  if (result.route_family_id !== routeFamilyId(result.source_route_id)) throw new Error(`${path}: route_family_id mismatch`);
  if (result.catalog_in_effect === "indeterminate") throw new Error(`${path}: complete catalog cannot yield indeterminate membership`);
  const componentRows = componentFeedIds.map((id) => manifest.components.find((component) => component.component_feed_id === id)!);
  const expectedReliableStart = componentRows.map((component) => component.reliable_interval_start).sort().at(-1)!;
  const expectedReliableEnd = componentRows.map((component) => component.reliable_interval_end).sort()[0]!;
  if (
    result.reliable_interval_start !== expectedReliableStart
    || result.reliable_interval_end !== expectedReliableEnd
  ) throw new Error(`${path}: reliable interval differs from component-feed intersection`);
  const expectedReliability = expectedReliableStart <= manifest.service_window_start
    && expectedReliableEnd >= manifest.service_window_end
    ? "reliable"
    : "indeterminate";
  if (result.reliability_status !== expectedReliability) {
    throw new Error(`${path}: reliability status differs from route-level interval coverage`);
  }
  assertReliableActivity(result, path);
  return result;
}

function parseActivityRow(
  value: unknown,
  index: number,
  manifest: GtfsSnapshotManifestV2,
  componentDatasets: ReadonlyMap<string, DatasetId>,
): RouteActivityRow {
  const path = `route_activity.jsonl:${index + 1}`;
  const row = record(value, path);
  exactKeys(row, ACTIVITY_KEYS, path);
  const datasetId = dataset(row.dataset_id, `${path}.dataset_id`);
  const sourceRouteId = nonEmpty(row.source_route_id, `${path}.source_route_id`);
  const gtfsRouteId = nonEmpty(row.gtfs_route_id, `${path}.gtfs_route_id`);
  if (sourceRouteId !== gtfsRouteId) throw new Error(`${path}: source_route_id must equal gtfs_route_id`);
  const result: RouteActivityRow = {
    dataset_id: datasetId,
    component_feed_ids: componentFeeds(row.component_feed_ids, datasetId, componentDatasets, `${path}.component_feed_ids`),
    source_route_id: sourceRouteId,
    gtfs_route_id: gtfsRouteId,
    scheduled_service_dates: serviceDates(row.scheduled_service_dates, manifest, `${path}.scheduled_service_dates`),
    scheduled_trip_template_date_count: integer(row.scheduled_trip_template_date_count, `${path}.scheduled_trip_template_date_count`),
    scheduled_in_window: activityValue(row.scheduled_in_window, `${path}.scheduled_in_window`),
    reliability_status: reliability(row.reliability_status, `${path}.reliability_status`),
    frequencies_present: bool(row.frequencies_present, `${path}.frequencies_present`),
    snapshot_id: nonEmpty(row.snapshot_id, `${path}.snapshot_id`),
  };
  if (result.snapshot_id !== manifest.snapshot_id) throw new Error(`${path}: snapshot_id mismatch`);
  assertReliableActivity(result, path);
  return result;
}

function parseCatalogRow(value: unknown, index: number, manifest: GtfsSnapshotManifestV2): CatalogRouteRow {
  const path = `catalog_routes.jsonl:${index + 1}`;
  const row = record(value, path);
  exactKeys(row, CATALOG_KEYS, path);
  if (row.schema_version !== 1 || row.contract_id !== "current-bus-route-catalog-row-v1") {
    throw new Error(`${path}: unsupported catalog row contract`);
  }
  if (row.dataset_id !== "h2wf-afav" || row.in_effect !== "yes") {
    throw new Error(`${path}: expected effective h2wf-afav row`);
  }
  const result: CatalogRouteRow = {
    schema_version: 1,
    contract_id: "current-bus-route-catalog-row-v1",
    dataset_id: "h2wf-afav",
    artifact_sha256: sha256(row.artifact_sha256, `${path}.artifact_sha256`),
    exact_route_id: nonEmpty(row.exact_route_id, `${path}.exact_route_id`),
    route_short_name: nullableNonEmpty(row.route_short_name, `${path}.route_short_name`),
    route_long_name: nullableNonEmpty(row.route_long_name, `${path}.route_long_name`),
    route_description: nullableNonEmpty(row.route_description, `${path}.route_description`),
    effective_as_of_date: isoDate(row.effective_as_of_date, `${path}.effective_as_of_date`),
    valid_from: isoDate(row.valid_from, `${path}.valid_from`),
    valid_to: isoDate(row.valid_to, `${path}.valid_to`),
    in_effect: "yes",
    designation_literals: strings(row.designation_literals, `${path}.designation_literals`),
    normalized_service_modes: modes(row.normalized_service_modes, `${path}.normalized_service_modes`),
    source_row_count: integer(row.source_row_count, `${path}.source_row_count`, true),
  };
  if (
    result.artifact_sha256 !== manifest.current_catalog.artifact_sha256
    || result.effective_as_of_date !== manifest.current_catalog.effective_as_of_date
  ) throw new Error(`${path}: catalog artifact/date mismatch`);
  if (result.valid_from > result.effective_as_of_date || result.valid_to < result.effective_as_of_date) {
    throw new Error(`${path}: row is not effective on selected date`);
  }
  return result;
}

function parseDisagreementRow(
  value: unknown,
  index: number,
  manifest: GtfsSnapshotManifestV2,
): CatalogGtfsDisagreementRow {
  const path = `catalog_gtfs_disagreements.jsonl:${index + 1}`;
  const row = record(value, path);
  exactKeys(row, DISAGREEMENT_KEYS, path);
  if (row.schema_version !== 1 || row.contract_id !== "current-catalog-gtfs-disagreement-v1") {
    throw new Error(`${path}: unsupported disagreement contract`);
  }
  if (
    row.comparison_basis !== "exact_case_sensitive_route_id"
    || row.equality_claim !== false
    || row.catalog_dataset_id !== "h2wf-afav"
  ) throw new Error(`${path}: invalid exact-comparison semantics`);
  const disagreementType = literal(
    row.disagreement_type,
    new Set(["catalog_only", "gtfs_only"] as const),
    `${path}.disagreement_type`,
  );
  const exactRouteId = nonEmpty(row.exact_route_id, `${path}.exact_route_id`);
  const result: CatalogGtfsDisagreementRow = {
    schema_version: 1,
    contract_id: "current-catalog-gtfs-disagreement-v1",
    disagreement_type: disagreementType,
    exact_route_id: exactRouteId,
    comparison_basis: "exact_case_sensitive_route_id",
    equality_claim: false,
    catalog_dataset_id: "h2wf-afav",
    catalog_effective_as_of_date: isoDate(row.catalog_effective_as_of_date, `${path}.catalog_effective_as_of_date`),
    catalog_route_id: nullableNonEmpty(row.catalog_route_id, `${path}.catalog_route_id`),
    gtfs_snapshot_id: nonEmpty(row.gtfs_snapshot_id, `${path}.gtfs_snapshot_id`),
    gtfs_as_of_date: isoDate(row.gtfs_as_of_date, `${path}.gtfs_as_of_date`),
    gtfs_dataset_id: row.gtfs_dataset_id === null ? null : dataset(row.gtfs_dataset_id, `${path}.gtfs_dataset_id`),
    gtfs_source_route_id: nullableNonEmpty(row.gtfs_source_route_id, `${path}.gtfs_source_route_id`),
  };
  if (
    result.catalog_effective_as_of_date !== manifest.current_catalog.effective_as_of_date
    || result.gtfs_snapshot_id !== manifest.snapshot_id
    || result.gtfs_as_of_date !== manifest.as_of_date
  ) throw new Error(`${path}: selected snapshot/date mismatch`);
  if (disagreementType === "catalog_only") {
    if (
      result.catalog_route_id !== exactRouteId
      || result.gtfs_dataset_id !== null
      || result.gtfs_source_route_id !== null
    ) throw new Error(`${path}: malformed catalog_only disposition`);
  } else if (
    result.catalog_route_id !== null
    || result.gtfs_dataset_id === null
    || result.gtfs_source_route_id !== exactRouteId
  ) throw new Error(`${path}: malformed gtfs_only disposition`);
  return result;
}

function identityKey(row: Pick<RouteInventoryRow | RouteActivityRow, "dataset_id" | "source_route_id">): string {
  return `${row.dataset_id}\u0000${row.source_route_id}`;
}

function activityProjection(row: RouteActivityRow | RouteInventoryRow): string {
  return stableJson({
    component_feed_ids: row.component_feed_ids,
    dataset_id: row.dataset_id,
    frequencies_present: row.frequencies_present,
    gtfs_route_id: row.gtfs_route_id,
    reliability_status: row.reliability_status,
    scheduled_in_window: row.scheduled_in_window,
    scheduled_service_dates: row.scheduled_service_dates,
    scheduled_trip_template_date_count: row.scheduled_trip_template_date_count,
    snapshot_id: row.snapshot_id,
    source_route_id: row.source_route_id,
  });
}

function validateCrossArtifactInvariants(snapshot: ValidatedSnapshot): void {
  const { manifest, inventory, activity, catalog, disagreements } = snapshot;
  const inventoryKeys = inventory.map(identityKey);
  const activityKeys = activity.map(identityKey);
  assertSortedUnique(inventoryKeys, "route_inventory identities");
  assertSortedUnique(activityKeys, "route_activity identities");
  if (stableJson(inventoryKeys) !== stableJson(activityKeys)) {
    throw new Error("selected GTFS snapshot: inventory/activity identity sets differ");
  }
  const activityByKey = new Map(activity.map((row) => [identityKey(row), row]));
  for (const inventoryRow of inventory) {
    const activityRow = activityByKey.get(identityKey(inventoryRow));
    if (!activityRow || activityProjection(inventoryRow) !== activityProjection(activityRow)) {
      throw new Error(`selected GTFS snapshot: inventory/activity facts differ for ${identityKey(inventoryRow)}`);
    }
  }

  const inventoryByExact = new Map<string, RouteInventoryRow>();
  for (const row of inventory) {
    if (inventoryByExact.has(row.source_route_id)) {
      throw new Error(`selected GTFS snapshot: exported exact route collision for ${row.source_route_id}`);
    }
    inventoryByExact.set(row.source_route_id, row);
  }
  const catalogIds = catalog.map((row) => row.exact_route_id);
  assertSortedUnique(catalogIds, "catalog exact identities");
  const catalogById = new Map(catalog.map((row) => [row.exact_route_id, row]));

  for (const row of inventory) {
    const current = catalogById.get(row.source_route_id);
    if (row.catalog_in_effect !== (current ? "yes" : "no")) {
      throw new Error(`${row.source_route_id}: catalog membership differs from complete exact universe`);
    }
    const expectedDesignations = current?.designation_literals ?? [];
    const expectedModes = current?.normalized_service_modes ?? [];
    if (
      stableJson(row.designation_literals) !== stableJson(expectedDesignations)
      || stableJson(row.normalized_service_modes) !== stableJson(expectedModes)
    ) throw new Error(`${row.source_route_id}: catalog designation facts differ`);
    const displayLabel = current?.route_short_name || row.route_short_name || row.source_route_id;
    const displaySource = current?.route_short_name
      ? "current_bus_routes"
      : row.route_short_name
        ? "gtfs"
        : "source_route_id";
    if (row.display_label !== displayLabel || row.display_label_source !== displaySource) {
      throw new Error(`${row.source_route_id}: official display-label precedence differs`);
    }
    const expectedFallback = displaySource === "source_route_id" ? "source_route_id" : null;
    if (row.label_fallback !== expectedFallback) throw new Error(`${row.source_route_id}: label fallback provenance differs`);
    const expectedLabelDiff = current?.route_short_name && row.route_short_name && current.route_short_name !== row.route_short_name
      ? {
        current_bus_routes_route_short_name: current.route_short_name,
        gtfs_route_short_name: row.route_short_name,
      }
      : null;
    if (stableJson(row.label_diff) !== stableJson(expectedLabelDiff)) {
      throw new Error(`${row.source_route_id}: label-difference provenance differs`);
    }
  }

  const expectedCatalogOnly = catalogIds.filter((id) => !inventoryByExact.has(id)).sort();
  const expectedGtfsOnly = [...inventoryByExact.keys()].filter((id) => !catalogById.has(id)).sort();
  const disagreementKeys = disagreements.map((row) => `${row.disagreement_type}\u0000${row.exact_route_id}`);
  assertSortedUnique(disagreementKeys, "catalog disagreement identities");
  const actualCatalogOnly = disagreements.filter((row) => row.disagreement_type === "catalog_only").map((row) => row.exact_route_id).sort();
  const actualGtfsOnly = disagreements.filter((row) => row.disagreement_type === "gtfs_only").map((row) => row.exact_route_id).sort();
  if (
    stableJson(actualCatalogOnly) !== stableJson(expectedCatalogOnly)
    || stableJson(actualGtfsOnly) !== stableJson(expectedGtfsOnly)
  ) throw new Error("selected GTFS snapshot: disagreement ledger is not the exact symmetric difference");
  for (const row of disagreements) {
    if (row.disagreement_type === "catalog_only") {
      if (!catalogById.has(row.exact_route_id) || inventoryByExact.has(row.exact_route_id)) {
        throw new Error(`${row.exact_route_id}: false catalog_only disagreement`);
      }
    } else {
      const inventoryRow = inventoryByExact.get(row.exact_route_id);
      if (!inventoryRow || catalogById.has(row.exact_route_id) || inventoryRow.dataset_id !== row.gtfs_dataset_id) {
        throw new Error(`${row.exact_route_id}: false gtfs_only disagreement`);
      }
    }
  }

  if (
    inventory.length !== manifest.counts.route_identity_count
    || activity.length !== manifest.counts.route_activity_count
    || catalog.length !== manifest.counts.catalog_identity_count
    || expectedCatalogOnly.length !== manifest.counts.catalog_only_count
    || expectedGtfsOnly.length !== manifest.counts.gtfs_only_count
  ) throw new Error("selected GTFS snapshot: validated row counts differ from manifest");
}

function selectedSnapshotDirectory(stageDir: string): { snapshotId: string; directory: string } | undefined {
  const pointerPath = join(stageDir, "SELECTED");
  if (!existsSync(pointerPath)) return undefined;
  const pointerStat = lstatSync(pointerPath);
  if (!pointerStat.isFile() || pointerStat.isSymbolicLink()) {
    throw new Error(`GTFS SELECTED must be a regular non-symlink file: ${pointerPath}`);
  }
  const bytes = readFileSync(pointerPath, "utf8");
  const match = SAFE_SNAPSHOT_ID.exec(bytes);
  if (!match) throw new Error("GTFS SELECTED must contain one safe snapshot ID followed by exactly one newline");
  const snapshotId = match[1]!;
  const snapshotsRoot = join(stageDir, "snapshots");
  const directory = join(snapshotsRoot, snapshotId);
  if (!existsSync(directory)) throw new Error(`GTFS SELECTED targets missing snapshot ${snapshotId}`);
  const directoryStat = lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error(`GTFS SELECTED snapshot must be a regular directory: ${directory}`);
  }
  const rootReal = realpathSync(snapshotsRoot);
  const directoryReal = realpathSync(directory);
  const fromRoot = relative(rootReal, directoryReal);
  if (fromRoot.length === 0 || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error(`GTFS SELECTED snapshot escapes snapshots root: ${snapshotId}`);
  }
  return { snapshotId, directory };
}

function readValidatedSnapshot(stageDir: string): ValidatedSnapshot | undefined {
  const selected = selectedSnapshotDirectory(stageDir);
  if (!selected) return undefined;

  // This must remain the first snapshot-content operation: no row is parsed or loaded before the
  // immutable directory verifier binds declared paths, bytes, hashes, and logical counts.
  const verification = verifyGtfsSnapshotDirectory(selected.directory);
  if (verification.snapshot_id !== selected.snapshotId) {
    throw new Error(`GTFS SELECTED ${selected.snapshotId} points to manifest snapshot ${verification.snapshot_id}`);
  }
  const manifest = parseGtfsSnapshotManifestV2(
    JSON.parse(readFileSync(join(selected.directory, "manifest.json"), "utf8")) as unknown,
  );
  const componentDatasets = new Map(manifest.components.map((component) => [
    component.component_feed_id,
    component.dataset_id,
  ]));
  const inventory = parseJsonl(join(selected.directory, "route_inventory.jsonl"))
    .map((row, index) => parseInventoryRow(row, index, manifest, componentDatasets));
  const activity = parseJsonl(join(selected.directory, "route_activity.jsonl"))
    .map((row, index) => parseActivityRow(row, index, manifest, componentDatasets));
  const catalog = parseJsonl(join(selected.directory, "catalog_routes.jsonl"))
    .map((row, index) => parseCatalogRow(row, index, manifest));
  const disagreements = parseJsonl(join(selected.directory, "catalog_gtfs_disagreements.jsonl"))
    .map((row, index) => parseDisagreementRow(row, index, manifest));
  const snapshot: ValidatedSnapshot = {
    manifest,
    manifestSha256: verification.manifest_sha256,
    inventory,
    activity,
    catalog,
    disagreements,
  };
  validateCrossArtifactInvariants(snapshot);
  return snapshot;
}

/** Strictly verify and load the tracked SELECTED snapshot. An absent pointer intentionally leaves
 * all new reference tables empty so pre-selection and synthetic rebuilds keep working. */
export function loadSelectedGtfsSnapshotTables(
  db: Database,
  stageDir: string = gtfsReferenceRoot(),
): SelectedGtfsSnapshotLoadResult {
  const snapshot = readValidatedSnapshot(stageDir);
  if (!snapshot) {
    return {
      selected: false,
      snapshot_id: null,
      manifest_sha256: null,
      route_inventory: 0,
      route_activity: 0,
      catalog_routes: 0,
      catalog_disagreements: 0,
    };
  }
  const { manifest } = snapshot;
  db.prepare(`INSERT INTO ref_gtfs_snapshots
    (snapshot_id, manifest_sha256, contract_id, schema_version, dataset_id, captured_at,
     as_of_date, service_window_start, service_window_end, merge_policy, id_remapping_policy,
     catalog_dataset_id, catalog_artifact_sha256, catalog_effective_as_of_date,
     route_identity_count, route_activity_count, catalog_identity_count, catalog_only_count, gtfs_only_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    manifest.snapshot_id,
    snapshot.manifestSha256,
    manifest.contract_id,
    manifest.schema_version,
    manifest.dataset_id,
    manifest.captured_at,
    manifest.as_of_date,
    manifest.service_window_start,
    manifest.service_window_end,
    manifest.merge_policy,
    manifest.id_remapping_policy,
    manifest.current_catalog.dataset_id,
    manifest.current_catalog.artifact_sha256,
    manifest.current_catalog.effective_as_of_date,
    manifest.counts.route_identity_count,
    manifest.counts.route_activity_count,
    manifest.counts.catalog_identity_count,
    manifest.counts.catalog_only_count,
    manifest.counts.gtfs_only_count,
  );

  const insertInventory = db.prepare(`INSERT INTO ref_gtfs_route_inventory
    (snapshot_id, dataset_id, source_route_id, gtfs_route_id, component_feed_ids_json, agency_id,
     raw_route_type, route_family_id, route_short_name, route_long_name, route_desc, declared_in_feed,
     catalog_in_effect, catalog_effective_as_of_date, reliable_interval_start, reliable_interval_end,
     reliable_interval_derivation, reliability_status, scheduled_in_window,
     scheduled_service_dates_json, scheduled_trip_template_date_count, frequencies_present,
     designation_literals_json, normalized_service_modes_json, display_label, display_label_source,
     label_fallback, label_diff_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of snapshot.inventory) insertInventory.run(
    row.snapshot_id, row.dataset_id, row.source_route_id, row.gtfs_route_id,
    stableJson(row.component_feed_ids), row.agency_id, row.raw_route_type, row.route_family_id,
    row.route_short_name, row.route_long_name, row.route_desc, 1, row.catalog_in_effect,
    row.catalog_effective_as_of_date, row.reliable_interval_start, row.reliable_interval_end,
    row.reliable_interval_derivation, row.reliability_status, row.scheduled_in_window,
    stableJson(row.scheduled_service_dates), row.scheduled_trip_template_date_count,
    row.frequencies_present ? 1 : 0, stableJson(row.designation_literals),
    stableJson(row.normalized_service_modes), row.display_label, row.display_label_source,
    row.label_fallback, row.label_diff === null ? null : stableJson(row.label_diff),
  );

  const insertActivity = db.prepare(`INSERT INTO ref_gtfs_route_activity
    (snapshot_id, dataset_id, source_route_id, gtfs_route_id, component_feed_ids_json,
     scheduled_service_dates_json, scheduled_trip_template_date_count, scheduled_in_window,
     reliability_status, frequencies_present)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of snapshot.activity) insertActivity.run(
    row.snapshot_id, row.dataset_id, row.source_route_id, row.gtfs_route_id,
    stableJson(row.component_feed_ids), stableJson(row.scheduled_service_dates),
    row.scheduled_trip_template_date_count, row.scheduled_in_window, row.reliability_status,
    row.frequencies_present ? 1 : 0,
  );

  const insertCatalog = db.prepare(`INSERT INTO ref_current_bus_route_catalog
    (snapshot_id, exact_route_id, schema_version, contract_id, dataset_id, artifact_sha256,
     route_short_name, route_long_name, route_description, effective_as_of_date, valid_from,
     valid_to, in_effect, designation_literals_json, normalized_service_modes_json, source_row_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of snapshot.catalog) insertCatalog.run(
    manifest.snapshot_id, row.exact_route_id, row.schema_version, row.contract_id, row.dataset_id,
    row.artifact_sha256, row.route_short_name, row.route_long_name, row.route_description,
    row.effective_as_of_date, row.valid_from, row.valid_to, row.in_effect,
    stableJson(row.designation_literals), stableJson(row.normalized_service_modes), row.source_row_count,
  );

  const insertDisagreement = db.prepare(`INSERT INTO ref_gtfs_catalog_disagreements
    (snapshot_id, disagreement_type, exact_route_id, schema_version, contract_id, comparison_basis,
     equality_claim, catalog_dataset_id, catalog_effective_as_of_date, catalog_route_id,
     gtfs_snapshot_id, gtfs_as_of_date, gtfs_dataset_id, gtfs_source_route_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of snapshot.disagreements) insertDisagreement.run(
    manifest.snapshot_id, row.disagreement_type, row.exact_route_id, row.schema_version,
    row.contract_id, row.comparison_basis, 0, row.catalog_dataset_id,
    row.catalog_effective_as_of_date, row.catalog_route_id, row.gtfs_snapshot_id,
    row.gtfs_as_of_date, row.gtfs_dataset_id, row.gtfs_source_route_id,
  );

  return {
    selected: true,
    snapshot_id: manifest.snapshot_id,
    manifest_sha256: snapshot.manifestSha256,
    route_inventory: snapshot.inventory.length,
    route_activity: snapshot.activity.length,
    catalog_routes: snapshot.catalog.length,
    catalog_disagreements: snapshot.disagreements.length,
  };
}
