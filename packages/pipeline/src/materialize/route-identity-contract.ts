import { createHash } from "node:crypto";
import {
  parseGtfsSnapshotManifestV2 as parseInstalledGtfsSnapshotManifestV2,
  serializeGtfsSnapshotManifestV2 as serializeInstalledGtfsSnapshotManifestV2,
  type GtfsSnapshotManifestV2 as InstalledGtfsSnapshotManifestV2,
} from "@mta-wiki/db/gtfs-snapshot";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

export const SERVICE_MODES = ["local", "local_limited", "limited_stop", "sbs", "express", "rush", "school_local", "school_limited"] as const;
export const IDENTITY_SCOPES = ["exact_service", "route_family_context", "aggregate_context", "unresolved"] as const;
export const SERVICE_CLASSES = ["regular_mta_bus", "proposal", "temporary", "external", "non_bus", "undetermined", "not_applicable"] as const;
export const RECORD_TEMPORAL_SCOPES = ["current_description", "historical_description", "future_description", "undetermined", "not_applicable"] as const;
export const ACTIVITY_VALUES = ["yes", "no", "indeterminate"] as const;
export const RELIABILITY_STATUSES = ["reliable", "indeterminate"] as const;

export type ServiceMode = (typeof SERVICE_MODES)[number];
export type IdentityScope = (typeof IDENTITY_SCOPES)[number];
export type ServiceClass = (typeof SERVICE_CLASSES)[number];
export type RecordTemporalScope = (typeof RECORD_TEMPORAL_SCOPES)[number];
export type ActivityValue = (typeof ACTIVITY_VALUES)[number];
export type ReliabilityStatus = (typeof RELIABILITY_STATUSES)[number];

export type ArtifactMetadata = { path: string; sha256: string; bytes: number; rows: number };
export type CurrentCatalogDescriptorV1 = {
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
export type GtfsSnapshotManifestV2 = InstalledGtfsSnapshotManifestV2;
export type RouteInventoryRow = {
  dataset_id: string; component_feed_ids: string[]; source_route_id: string; gtfs_route_id: string;
  agency_id: string | null; raw_route_type: string; route_family_id: string;
  route_short_name: string | null; route_long_name: string | null; route_desc: string | null;
  declared_in_feed: true; catalog_in_effect: ActivityValue; catalog_effective_as_of_date: string;
  reliability_status: ReliabilityStatus; scheduled_in_window: ActivityValue;
  scheduled_service_dates: string[]; scheduled_trip_template_date_count: number; frequencies_present: boolean;
  designation_literals: string[]; normalized_service_modes: ServiceMode[]; display_label: string;
  display_label_source: "current_bus_routes" | "gtfs" | "source_route_id";
  reliable_interval_start: string; reliable_interval_end: string;
  reliable_interval_derivation: "component_feed_bounds_intersection_v1";
  label_fallback: "source_route_id" | null;
  label_diff: { current_bus_routes_route_short_name: string; gtfs_route_short_name: string } | null;
  snapshot_id: string;
};

export type RouteRecordBinding = {
  route_record_id: string; route_family_id: string | null; dataset_id: string | null;
  component_feed_ids: string[]; source_route_id: string | null; gtfs_route_id: string | null;
  service_variant: ServiceMode | null; identity_scope: IdentityScope; service_class: ServiceClass;
  record_temporal_scope: RecordTemporalScope; projectable: boolean; presentation_primary: boolean; derivation: string;
  evidence_ids: string[]; canonical_record_fingerprint: string;
};
export const ROUTE_BINDING_IDENTITY_BASES = ["deterministic_exact", "reviewed_exact_mapping", "reviewed_nonidentity_disposition"] as const;
export const ROUTE_BINDING_DECISION_KINDS = ["current_primary", "current_ineligible", "historical_description", "future_description", "aggregate_context", "route_family_context", "external_service", "non_bus_service", "temporary_service"] as const;
export const ROUTE_BINDING_REVIEWED_AXES = ["identity_mapping", "identity_scope", "service_class", "record_temporal_scope", "presentation_primary"] as const;
export const ROUTE_BINDING_INELIGIBILITY_REASONS = ["identity_not_exact", "service_class_not_regular_mta_bus", "record_not_current", "raw_route_type_not_3", "catalog_not_in_effect", "reliability_not_proven", "not_scheduled_in_window"] as const;
export type RouteBindingIdentityBasis = (typeof ROUTE_BINDING_IDENTITY_BASES)[number];
export type RouteBindingDecisionKind = (typeof ROUTE_BINDING_DECISION_KINDS)[number];
export type RouteBindingReviewedAxis = (typeof ROUTE_BINDING_REVIEWED_AXES)[number];
export type RouteBindingIneligibilityReason = (typeof ROUTE_BINDING_INELIGIBILITY_REASONS)[number];
export type RouteIdentityRecordBindingCommonV1 = RouteRecordBinding & {
  identity_basis: RouteBindingIdentityBasis;
  expected_gtfs_identity_fingerprint: string | null;
  decision_kind: RouteBindingDecisionKind;
  ineligibility_reasons: RouteBindingIneligibilityReason[];
};
export type DeterministicRouteIdentityRecordBindingV1 = RouteIdentityRecordBindingCommonV1 & {
  decision_id?: never; accepted_by?: never; accepted_at?: never; rationale?: never; reviewed_axes?: never;
};
export type ReviewedRouteIdentityRecordBindingV1 = RouteIdentityRecordBindingCommonV1 & {
  decision_id: string; accepted_by: string; accepted_at: string; rationale: string; reviewed_axes: RouteBindingReviewedAxis[];
};
export type RouteIdentityRecordBindingV1 = DeterministicRouteIdentityRecordBindingV1 | ReviewedRouteIdentityRecordBindingV1;
export type RouteIdentitySnapshotV1 = {
  schema_version: 1; contract_id: "route-identity-snapshot-v1"; gtfs_snapshot_id: string;
  gtfs_snapshot: GtfsSnapshotManifestV2; gtfs_snapshot_sha256: string; reviewed_decision_sha256: string;
  current_catalog: CurrentCatalogDescriptorV1;
  service_identity_count: number; service_identities_sha256: string; service_identities: RouteInventoryRow[];
  record_binding_count: number; record_bindings_sha256: string; record_bindings: RouteIdentityRecordBindingV1[];
  expected_route_anchors_count: number; expected_route_anchors_sha256: string;
};

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  const extra = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (extra.length || missing.length) throw new Error(`${path}: strict keys mismatch; missing=[${missing.sort()}] unexpected=[${extra.sort()}]`);
}
function string(value: unknown, path: string): string { if (typeof value !== "string" || !value) throw new Error(`${path}: expected non-empty string`); return value; }
function isoDate(value: unknown, path: string): string { const result = string(value, path); if (!/^\d{4}-\d{2}-\d{2}$/u.test(result)) throw new Error(`${path}: expected YYYY-MM-DD`); return result; }
function isoInstant(value: unknown, path: string): string { const result = string(value, path); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(result) || Number.isNaN(Date.parse(result))) throw new Error(`${path}: expected UTC ISO-8601 instant`); return result; }
function sha(value: unknown, path: string): string { const result = string(value, path); if (!/^[0-9a-f]{64}$/u.test(result)) throw new Error(`${path}: expected lowercase SHA-256`); return result; }
function nonnegativeInteger(value: unknown, path: string): number { if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${path}: expected nonnegative integer`); return value as number; }
function artifact(value: unknown, expectedPath: string, path: string): ArtifactMetadata {
  const row = object(value, path);
  exactKeys(row, ["path","sha256","bytes","rows"], path);
  if (row.path !== expectedPath) throw new Error(`${path}.path: expected ${expectedPath}`);
  sha(row.sha256, `${path}.sha256`);
  nonnegativeInteger(row.bytes, `${path}.bytes`);
  nonnegativeInteger(row.rows, `${path}.rows`);
  return row as ArtifactMetadata;
}
function tuple<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] { if (typeof value !== "string" || !values.includes(value)) throw new Error(`${path}: unsupported value ${JSON.stringify(value)}`); return value as T[number]; }
function sortedUnique(values: string[], path: string): void { if (new Set(values).size !== values.length || values.join("\n") !== [...values].sort().join("\n")) throw new Error(`${path}: must be sorted and unique`); }
function stringArray(value: unknown, path: string): string[] { if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) throw new Error(`${path}: expected non-empty string array`); sortedUnique(value as string[], path); return value as string[]; }
function nullableString(value: unknown, path: string): string | null { if (value === null) return null; return string(value, path); }
function sha256(bytes: string): string { return createHash("sha256").update(bytes).digest("hex"); }
export function routeFamilyId(sourceRouteId: string): string { return sourceRouteId.endsWith("+") ? sourceRouteId.slice(0, -1) : sourceRouteId; }

export function parseGtfsSnapshotManifestV2(input: unknown): GtfsSnapshotManifestV2 {
  return parseInstalledGtfsSnapshotManifestV2(input);
}

export function serializeGtfsSnapshotManifestV2(value: GtfsSnapshotManifestV2): string {
  return serializeInstalledGtfsSnapshotManifestV2(value);
}

export function parseRouteInventoryJsonl(bytes: string): RouteInventoryRow[] {
  if (!bytes.endsWith("\n") || bytes.includes("\r") || bytes.includes("\n\n")) throw new Error("route_inventory.jsonl: expected canonical newline-delimited JSON");
  const rows = bytes.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    const path = `route_inventory.jsonl:${index + 1}`;
    const row = object(JSON.parse(line), path);
    if (stableJson(row as unknown as JsonValue) !== line) throw new Error(path + ": expected canonical stable JSON");
    const keys = ["dataset_id","component_feed_ids","source_route_id","gtfs_route_id","agency_id","raw_route_type","route_family_id","route_short_name","route_long_name","route_desc","declared_in_feed","catalog_in_effect","catalog_effective_as_of_date","reliability_status","scheduled_in_window","scheduled_service_dates","scheduled_trip_template_date_count","frequencies_present","designation_literals","normalized_service_modes","display_label","display_label_source","reliable_interval_start","reliable_interval_end","reliable_interval_derivation","label_fallback","label_diff","snapshot_id"];
    exactKeys(row, keys, path);
    tuple(row.dataset_id, ["mta-nyct-bus", "mta-bus-company"] as const, path + ".dataset_id");
    const components = stringArray(row.component_feed_ids, path + ".component_feed_ids");
    if (components.length === 0) throw new Error(path + ".component_feed_ids: exact identity requires at least one component");
    const sourceRouteId = string(row.source_route_id, path + ".source_route_id");
    if (sourceRouteId !== string(row.gtfs_route_id, path + ".gtfs_route_id")) throw new Error(path + ": source_route_id must equal gtfs_route_id");
    nullableString(row.agency_id, path + ".agency_id");
    string(row.raw_route_type, path + ".raw_route_type");
    if (row.route_family_id !== routeFamilyId(sourceRouteId)) throw new Error(path + ": wrong route_family_id");
    nullableString(row.route_short_name, path + ".route_short_name");
    nullableString(row.route_long_name, path + ".route_long_name");
    nullableString(row.route_desc, path + ".route_desc");
    if (row.declared_in_feed !== true) throw new Error(path + ".declared_in_feed: expected true");
    const catalogInEffect = tuple(row.catalog_in_effect, ACTIVITY_VALUES, path + ".catalog_in_effect");
    isoDate(row.catalog_effective_as_of_date, path + ".catalog_effective_as_of_date");
    const reliability = tuple(row.reliability_status, RELIABILITY_STATUSES, path + ".reliability_status");
    const scheduled = tuple(row.scheduled_in_window, ACTIVITY_VALUES, path + ".scheduled_in_window");
    const serviceDates = stringArray(row.scheduled_service_dates, path + ".scheduled_service_dates");
    serviceDates.forEach((date, dateIndex) => isoDate(date, path + ".scheduled_service_dates[" + String(dateIndex) + "]"));
    const templateCount = nonnegativeInteger(row.scheduled_trip_template_date_count, path + ".scheduled_trip_template_date_count");
    if (typeof row.frequencies_present !== "boolean") throw new Error(path + ".frequencies_present: expected boolean");
    if ((reliability === "reliable") !== (scheduled !== "indeterminate")) throw new Error(path + ": reliability and scheduled-in-window determination disagree");
    if ((scheduled === "yes") !== (serviceDates.length > 0 && templateCount > 0)) throw new Error(path + ": scheduled service dates/count do not reconcile with scheduled_in_window");
    if (scheduled !== "yes" && (serviceDates.length !== 0 || templateCount !== 0)) throw new Error(path + ": non-yes activity must not claim scheduled dates/templates");
    const designationLiterals = stringArray(row.designation_literals, path + ".designation_literals");
    const modes = stringArray(row.normalized_service_modes, path + ".normalized_service_modes");
    modes.forEach((mode, modeIndex) => tuple(mode, SERVICE_MODES, path + ".normalized_service_modes[" + String(modeIndex) + "]"));
    if ((designationLiterals.length === 0) !== (modes.length === 0)) throw new Error(path + ": every official designation set must map exhaustively and no mode may be inferred without one");
    if (catalogInEffect === "no" && designationLiterals.length > 0) throw new Error(path + ": catalog-absent identity cannot carry Current Bus Routes designations");
    const displayLabel = string(row.display_label, path + ".display_label");
    const displaySource = tuple(row.display_label_source, ["current_bus_routes", "gtfs", "source_route_id"] as const, path + ".display_label_source");
    const intervalStart = isoDate(row.reliable_interval_start, path + ".reliable_interval_start");
    const intervalEnd = isoDate(row.reliable_interval_end, path + ".reliable_interval_end");
    if (intervalStart > intervalEnd) throw new Error(path + ": reliable interval is reversed");
    if (row.reliable_interval_derivation !== "component_feed_bounds_intersection_v1") throw new Error(path + ".reliable_interval_derivation: unsupported value");
    if (row.label_fallback !== null && row.label_fallback !== "source_route_id") throw new Error(path + ".label_fallback: unsupported value");
    if ((row.label_fallback === "source_route_id") !== (displaySource === "source_route_id")) throw new Error(path + ": label fallback provenance disagrees with display source");
    let labelDiff: { current_bus_routes_route_short_name: string; gtfs_route_short_name: string } | null = null;
    if (row.label_diff !== null) {
      const diff = object(row.label_diff, path + ".label_diff");
      exactKeys(diff, ["current_bus_routes_route_short_name", "gtfs_route_short_name"], path + ".label_diff");
      labelDiff = {
        current_bus_routes_route_short_name: string(diff.current_bus_routes_route_short_name, path + ".label_diff.current_bus_routes_route_short_name"),
        gtfs_route_short_name: string(diff.gtfs_route_short_name, path + ".label_diff.gtfs_route_short_name"),
      };
      if (labelDiff.current_bus_routes_route_short_name === labelDiff.gtfs_route_short_name || labelDiff.gtfs_route_short_name !== row.route_short_name) throw new Error(path + ": label_diff must record distinct exact official literals");
      if (displaySource !== "current_bus_routes" || displayLabel !== labelDiff.current_bus_routes_route_short_name) throw new Error(path + ": label_diff does not reconcile with display-label precedence");
    }
    if (displaySource === "gtfs" && (row.route_short_name === null || displayLabel !== row.route_short_name || labelDiff !== null)) throw new Error(path + ": GTFS display-label provenance mismatch");
    if (displaySource === "source_route_id" && (row.route_short_name !== null || displayLabel !== sourceRouteId || labelDiff !== null)) throw new Error(path + ": source-route fallback provenance mismatch");
    if (displaySource === "current_bus_routes" && labelDiff === null && row.route_short_name !== null && displayLabel !== row.route_short_name) throw new Error(path + ": unnamed current/GTFS label difference");
    string(row.snapshot_id, path + ".snapshot_id");
    return row as RouteInventoryRow;
  });
  if (rows.length === 0) throw new Error("route_inventory.jsonl: production inventory cannot be empty");
  const identities = rows.map((row) => `${row.dataset_id}\0${row.source_route_id}`); sortedUnique(identities, "route identities");
  return rows;
}

export function serializeRouteInventoryJsonl(rows: RouteInventoryRow[]): string {
  const bytes = rows.map((row) => stableJson(row)).join("\n") + (rows.length ? "\n" : "");
  parseRouteInventoryJsonl(bytes);
  return bytes;
}

export function routeInventoryFingerprint(row: RouteInventoryRow): string {
  return sha256(stableJson(row as unknown as JsonValue));
}

export function serializeRouteIdentityRecordBindingsJsonl(rows: RouteIdentityRecordBindingV1[]): string {
  return rows.map((row) => stableJson(row as unknown as JsonValue)).join("\n") + (rows.length ? "\n" : "");
}

export function parseRouteIdentitySnapshotV1(input: unknown): RouteIdentitySnapshotV1 {
  const root = object(input, "route identity snapshot");
  exactKeys(root, ["schema_version","contract_id","gtfs_snapshot_id","gtfs_snapshot","gtfs_snapshot_sha256","reviewed_decision_sha256","current_catalog","service_identity_count","service_identities_sha256","service_identities","record_binding_count","record_bindings_sha256","record_bindings","expected_route_anchors_count","expected_route_anchors_sha256"], "route identity snapshot");
  if (root.schema_version !== 1 || root.contract_id !== "route-identity-snapshot-v1") throw new Error("route identity snapshot: expected v1 contract");
  const snapshotId = string(root.gtfs_snapshot_id, "gtfs_snapshot_id");
  const gtfsSnapshot = parseGtfsSnapshotManifestV2(root.gtfs_snapshot);
  if (gtfsSnapshot.snapshot_id !== snapshotId) throw new Error("gtfs_snapshot_id: descriptor snapshot_id mismatch");
  if (sha(root.gtfs_snapshot_sha256, "gtfs_snapshot_sha256") !== sha256(serializeGtfsSnapshotManifestV2(gtfsSnapshot))) throw new Error("gtfs_snapshot_sha256: canonical descriptor digest mismatch");
  sha(root.reviewed_decision_sha256, "reviewed_decision_sha256");
  const serviceIdentityCount = nonnegativeInteger(root.service_identity_count, "service_identity_count");
  const serviceIdentitiesSha256 = sha(root.service_identities_sha256, "service_identities_sha256");
  const recordBindingCount = nonnegativeInteger(root.record_binding_count, "record_binding_count");
  const recordBindingsSha256 = sha(root.record_bindings_sha256, "record_bindings_sha256");
  sha(root.expected_route_anchors_sha256, "expected_route_anchors_sha256");
  nonnegativeInteger(root.expected_route_anchors_count, "expected_route_anchors_count");

  const catalog = object(root.current_catalog, "current_catalog");
  exactKeys(catalog, ["contract_version","dataset_id","artifact_sha256","effective_as_of_date","catalog_routes","catalog_gtfs_disagreements","catalog_identity_count","catalog_only_count","gtfs_only_count"], "current_catalog");
  if (catalog.contract_version !== 1 || catalog.dataset_id !== "h2wf-afav") throw new Error("current_catalog: expected h2wf-afav contract v1");
  sha(catalog.artifact_sha256, "current_catalog.artifact_sha256");
  isoDate(catalog.effective_as_of_date, "current_catalog.effective_as_of_date");
  const catalogRoutes = artifact(catalog.catalog_routes, "catalog_routes.jsonl", "current_catalog.catalog_routes");
  const disagreements = artifact(catalog.catalog_gtfs_disagreements, "catalog_gtfs_disagreements.jsonl", "current_catalog.catalog_gtfs_disagreements");
  const catalogCount = nonnegativeInteger(catalog.catalog_identity_count, "current_catalog.catalog_identity_count");
  const catalogOnlyCount = nonnegativeInteger(catalog.catalog_only_count, "current_catalog.catalog_only_count");
  const gtfsOnlyCount = nonnegativeInteger(catalog.gtfs_only_count, "current_catalog.gtfs_only_count");
  if (catalogRoutes.rows !== catalogCount) throw new Error("current_catalog: catalog route count does not reconcile");
  if (disagreements.rows !== catalogOnlyCount + gtfsOnlyCount) throw new Error("current_catalog: disagreement counts do not reconcile");
  if (stableJson(catalog as unknown as JsonValue) !== stableJson(gtfsSnapshot.current_catalog as unknown as JsonValue)) throw new Error("current_catalog: must exactly equal gtfs_snapshot.current_catalog");

  if (!Array.isArray(root.service_identities) || !Array.isArray(root.record_bindings)) throw new Error("route identity snapshot: expected arrays");
  const serviceRows = parseRouteInventoryJsonl(root.service_identities.map((row) => stableJson(row as JsonValue)).join("\n") + (root.service_identities.length ? "\n" : ""));
  const serviceBytes = serializeRouteInventoryJsonl(serviceRows);
  const inventoryOutput = gtfsSnapshot.outputs["route_inventory.jsonl"];
  if (!inventoryOutput) throw new Error("gtfs_snapshot.outputs: missing route_inventory.jsonl descriptor");
  if (serviceRows.length !== serviceIdentityCount || serviceRows.length !== gtfsSnapshot.counts.route_identity_count || serviceRows.length !== inventoryOutput.rows) throw new Error("service_identities: count does not reconcile with snapshot metadata");
  if (sha256(serviceBytes) !== serviceIdentitiesSha256 || serviceIdentitiesSha256 !== inventoryOutput.sha256 || Buffer.byteLength(serviceBytes) !== inventoryOutput.bytes) throw new Error("service_identities: bytes/hash do not reconcile with snapshot metadata");
  const componentById = new Map(gtfsSnapshot.components.map((component) => [component.component_feed_id, component]));
  for (const identity of serviceRows) {
    if (identity.snapshot_id !== root.gtfs_snapshot_id) throw new Error("service_identities: snapshot_id mismatch");
    if (identity.catalog_effective_as_of_date !== catalog.effective_as_of_date) throw new Error("service_identities: current-catalog effective date mismatch");
    if (identity.catalog_in_effect === "indeterminate") throw new Error("service_identities: complete production catalog cannot yield indeterminate membership");
    const components = identity.component_feed_ids.map((componentId) => componentById.get(componentId));
    if (components.some((component) => !component)) throw new Error(identity.source_route_id + ": identity references an undeclared component feed");
    if (components.some((component) => component!.dataset_id !== identity.dataset_id)) throw new Error(identity.source_route_id + ": identity component dataset mismatch");
    const intervalStart = components.map((component) => component!.reliable_interval_start).sort().at(-1)!;
    const intervalEnd = components.map((component) => component!.reliable_interval_end).sort().at(0)!;
    if (identity.reliable_interval_start !== intervalStart || identity.reliable_interval_end !== intervalEnd) throw new Error(identity.source_route_id + ": reliable interval is not the component-bounds intersection");
    if (identity.scheduled_service_dates.some((date) => date < gtfsSnapshot.service_window_start || date > gtfsSnapshot.service_window_end)) throw new Error(identity.source_route_id + ": scheduled service date is outside the declared seven-date window");
  }
  const catalogYesCount = serviceRows.filter((row) => row.catalog_in_effect === "yes").length;
  const catalogNoCount = serviceRows.filter((row) => row.catalog_in_effect === "no").length;
  if (catalogYesCount + catalogOnlyCount !== catalogCount || catalogNoCount !== gtfsOnlyCount) throw new Error("current_catalog: identity membership counts do not reconcile");
  const serviceByIdentity = new Map(serviceRows.map((row) => [row.dataset_id + "\0" + row.source_route_id, row]));
  const projectableByIdentity = new Map<string, Array<{ routeRecordId: string; presentationPrimary: boolean }>>();
  const reviewedDecisionIds: string[] = [];
  const ids = root.record_bindings.map((raw, index) => {
    const binding = object(raw, `record_bindings[${index}]`);
    const commonKeys = ["route_record_id","route_family_id","dataset_id","component_feed_ids","source_route_id","gtfs_route_id","service_variant","identity_scope","service_class","record_temporal_scope","projectable","presentation_primary","derivation","evidence_ids","canonical_record_fingerprint","identity_basis","expected_gtfs_identity_fingerprint","decision_kind","ineligibility_reasons"] as const;
    const reviewed = Object.hasOwn(binding, "decision_id");
    exactKeys(binding, reviewed ? [...commonKeys,"decision_id","accepted_by","accepted_at","rationale","reviewed_axes"] : commonKeys, `record_bindings[${index}]`);
    const componentFeedIds = stringArray(binding.component_feed_ids, `record_bindings[${index}].component_feed_ids`);
    stringArray(binding.evidence_ids, `record_bindings[${index}].evidence_ids`);
    sha(binding.canonical_record_fingerprint, `record_bindings[${index}].canonical_record_fingerprint`);
    const identityBasis = tuple(binding.identity_basis, ROUTE_BINDING_IDENTITY_BASES, `record_bindings[${index}].identity_basis`);
    const decisionKind = tuple(binding.decision_kind, ROUTE_BINDING_DECISION_KINDS, `record_bindings[${index}].decision_kind`);
    const ineligibilityReasons = stringArray(binding.ineligibility_reasons, `record_bindings[${index}].ineligibility_reasons`);
    ineligibilityReasons.forEach((reason, reasonIndex) => tuple(reason, ROUTE_BINDING_INELIGIBILITY_REASONS, `record_bindings[${index}].ineligibility_reasons[${reasonIndex}]`));
    let reviewedAxes: RouteBindingReviewedAxis[] = [];
    if (reviewed) {
      reviewedDecisionIds.push(string(binding.decision_id, `record_bindings[${index}].decision_id`));
      string(binding.accepted_by, `record_bindings[${index}].accepted_by`);
      isoInstant(binding.accepted_at, `record_bindings[${index}].accepted_at`);
      string(binding.rationale, `record_bindings[${index}].rationale`);
      const axes = stringArray(binding.reviewed_axes, `record_bindings[${index}].reviewed_axes`);
      if (axes.length === 0) throw new Error(`record_bindings[${index}].reviewed_axes: reviewed binding requires at least one axis`);
      reviewedAxes = axes.map((axis, axisIndex) => tuple(axis, ROUTE_BINDING_REVIEWED_AXES, `record_bindings[${index}].reviewed_axes[${axisIndex}]`));
    } else if (identityBasis !== "deterministic_exact") {
      throw new Error(`record_bindings[${index}]: non-deterministic binding requires reviewed attribution`);
    }
    if (identityBasis === "reviewed_exact_mapping" && !reviewedAxes.includes("identity_mapping")) throw new Error(`record_bindings[${index}]: reviewed exact mapping must attribute identity_mapping`);
    if (identityBasis === "deterministic_exact" && reviewedAxes.includes("identity_mapping")) throw new Error(`record_bindings[${index}]: deterministic exact identity cannot be attributed to a human reviewer`);
    if (identityBasis === "reviewed_nonidentity_disposition" && !reviewedAxes.includes("identity_scope")) throw new Error(`record_bindings[${index}]: reviewed nonidentity disposition must attribute identity_scope`);
    const identityScope = tuple(binding.identity_scope, IDENTITY_SCOPES, `record_bindings[${index}].identity_scope`);
    const serviceClass = tuple(binding.service_class, SERVICE_CLASSES, `record_bindings[${index}].service_class`);
    const temporalScope = tuple(binding.record_temporal_scope, RECORD_TEMPORAL_SCOPES, `record_bindings[${index}].record_temporal_scope`);
    if (serviceClass === "undetermined" || temporalScope === "undetermined") throw new Error(`record_bindings[${index}]: unreviewed binding blocks a release snapshot`);
    if (binding.service_variant !== null) tuple(binding.service_variant, SERVICE_MODES, `record_bindings[${index}].service_variant`);
    if (typeof binding.projectable !== "boolean") throw new Error(`record_bindings[${index}].projectable: expected boolean`);
    if (typeof binding.presentation_primary !== "boolean") throw new Error(`record_bindings[${index}].presentation_primary: expected boolean`);
    string(binding.derivation, `record_bindings[${index}].derivation`);
    const routeFamily = nullableString(binding.route_family_id, `record_bindings[${index}].route_family_id`);
    nullableString(binding.dataset_id, `record_bindings[${index}].dataset_id`);
    nullableString(binding.source_route_id, `record_bindings[${index}].source_route_id`);
    nullableString(binding.gtfs_route_id, `record_bindings[${index}].gtfs_route_id`);
    const exactFields = [binding.dataset_id, binding.source_route_id, binding.gtfs_route_id];
    const hasExact = exactFields.every((value) => typeof value === "string" && value.length > 0);
    if (exactFields.some((value) => value !== null) !== hasExact) throw new Error(`record_bindings[${index}]: exact identity fields must be all-null or complete`);
    if ((identityScope === "exact_service") !== hasExact) throw new Error(`record_bindings[${index}]: identity_scope and exact identity fields disagree`);
    if (hasExact ? componentFeedIds.length === 0 : componentFeedIds.length !== 0) throw new Error(`record_bindings[${index}]: component feeds must be nonempty exactly when an exact identity is present`);
    if (hasExact && binding.source_route_id !== binding.gtfs_route_id) throw new Error(`record_bindings[${index}]: source_route_id must equal gtfs_route_id`);
    const identity = hasExact ? serviceByIdentity.get(String(binding.dataset_id) + "\0" + String(binding.source_route_id)) : undefined;
    if (hasExact && !identity) throw new Error(`record_bindings[${index}]: exact identity is absent from service_identities`);
    if (identity) {
      if (routeFamily !== identity.route_family_id || stableJson(componentFeedIds as unknown as JsonValue) !== stableJson(identity.component_feed_ids as unknown as JsonValue)) throw new Error(`record_bindings[${index}]: exact identity components/family differ from service identity`);
      if (binding.expected_gtfs_identity_fingerprint !== routeInventoryFingerprint(identity)) throw new Error(`record_bindings[${index}]: stale GTFS identity fingerprint`);
    } else if (binding.expected_gtfs_identity_fingerprint !== null) {
      throw new Error(`record_bindings[${index}]: nonidentity binding must have null GTFS fingerprint`);
    }
    if ((identityBasis === "deterministic_exact" || identityBasis === "reviewed_exact_mapping") !== Boolean(identity)) throw new Error(`record_bindings[${index}]: identity basis and exact target disagree`);
    const expectedReasons: RouteBindingIneligibilityReason[] = [];
    if (identityScope !== "exact_service" || !identity) expectedReasons.push("identity_not_exact");
    if (serviceClass !== "regular_mta_bus") expectedReasons.push("service_class_not_regular_mta_bus");
    if (temporalScope !== "current_description") expectedReasons.push("record_not_current");
    if (identity) {
      if (identity.raw_route_type !== "3") expectedReasons.push("raw_route_type_not_3");
      if (identity.catalog_in_effect !== "yes") expectedReasons.push("catalog_not_in_effect");
      if (identity.reliability_status !== "reliable") expectedReasons.push("reliability_not_proven");
      if (identity.scheduled_in_window !== "yes") expectedReasons.push("not_scheduled_in_window");
    }
    expectedReasons.sort();
    if (stableJson(expectedReasons as unknown as JsonValue) !== stableJson(ineligibilityReasons as unknown as JsonValue)) throw new Error(`record_bindings[${index}]: ineligibility reasons do not match the exact predicate`);
    const shouldProject = Boolean(
      identityScope === "exact_service" &&
      serviceClass === "regular_mta_bus" &&
      temporalScope === "current_description" &&
      identity?.raw_route_type === "3" &&
      identity?.catalog_in_effect === "yes" &&
      identity?.reliability_status === "reliable" &&
      identity?.scheduled_in_window === "yes"
    );
    if (binding.projectable !== shouldProject) throw new Error(`record_bindings[${index}]: projectable is not the exact operational-eligibility predicate`);
    if (!binding.projectable && binding.presentation_primary) throw new Error(`record_bindings[${index}]: nonprojectable binding cannot be presentation primary`);
    switch (decisionKind) {
      case "current_primary":
        if (!binding.projectable || !binding.presentation_primary || identityScope !== "exact_service" || serviceClass !== "regular_mta_bus" || temporalScope !== "current_description") throw new Error(`record_bindings[${index}]: current_primary decision fields do not reconcile`);
        break;
      case "current_ineligible":
        if (binding.projectable || binding.presentation_primary || identityScope !== "exact_service" || serviceClass !== "regular_mta_bus" || temporalScope !== "current_description") throw new Error(`record_bindings[${index}]: current_ineligible decision fields do not reconcile`);
        break;
      case "historical_description":
        if (binding.projectable || binding.presentation_primary || serviceClass !== "regular_mta_bus" || temporalScope !== "historical_description" || (identityScope !== "exact_service" && identityScope !== "unresolved")) throw new Error(`record_bindings[${index}]: historical_description decision fields do not reconcile`);
        break;
      case "future_description":
        if (binding.projectable || binding.presentation_primary || serviceClass !== "proposal" || temporalScope !== "future_description" || (identityScope !== "exact_service" && identityScope !== "unresolved")) throw new Error(`record_bindings[${index}]: future_description decision fields do not reconcile`);
        break;
      case "aggregate_context":
        if (binding.projectable || binding.presentation_primary || identityScope !== "aggregate_context" || serviceClass !== "not_applicable" || temporalScope !== "not_applicable") throw new Error(`record_bindings[${index}]: aggregate_context decision fields do not reconcile`);
        break;
      case "route_family_context":
        if (binding.projectable || binding.presentation_primary || identityScope !== "route_family_context" || serviceClass !== "not_applicable" || temporalScope !== "not_applicable") throw new Error(`record_bindings[${index}]: route_family_context decision fields do not reconcile`);
        break;
      case "external_service":
        if (binding.projectable || binding.presentation_primary || identityScope !== "unresolved" || serviceClass !== "external" || temporalScope !== "current_description") throw new Error(`record_bindings[${index}]: external_service decision fields do not reconcile`);
        break;
      case "non_bus_service":
        if (binding.projectable || binding.presentation_primary || identityScope !== "unresolved" || serviceClass !== "non_bus" || temporalScope !== "not_applicable") throw new Error(`record_bindings[${index}]: non_bus_service decision fields do not reconcile`);
        break;
      case "temporary_service":
        if (binding.projectable || binding.presentation_primary || serviceClass !== "temporary" || (identityScope !== "exact_service" && identityScope !== "unresolved") || (temporalScope !== "current_description" && temporalScope !== "historical_description")) throw new Error(`record_bindings[${index}]: temporary_service decision fields do not reconcile`);
        break;
      default: assertNever(decisionKind, "route binding decision kind");
    }
    const routeRecordId = string(binding.route_record_id, `record_bindings[${index}].route_record_id`);
    if (binding.projectable) {
      const key = String(binding.dataset_id) + "\0" + String(binding.source_route_id);
      const group = projectableByIdentity.get(key) ?? [];
      group.push({ routeRecordId, presentationPrimary: binding.presentation_primary });
      projectableByIdentity.set(key, group);
    }
    return routeRecordId;
  });
  sortedUnique(ids, "record_bindings.route_record_id");
  sortedUnique(reviewedDecisionIds, "record_bindings.decision_id");
  const bindingRows = root.record_bindings as RouteIdentityRecordBindingV1[];
  const bindingBytes = serializeRouteIdentityRecordBindingsJsonl(bindingRows);
  if (bindingRows.length !== recordBindingCount) throw new Error("record_bindings: count does not reconcile");
  if (sha256(bindingBytes) !== recordBindingsSha256) throw new Error("record_bindings: deterministic JSONL hash does not reconcile");
  for (const [identity, bindings] of projectableByIdentity) {
    if (bindings.filter((binding) => binding.presentationPrimary).length !== 1) throw new Error(identity + ": projectable identity requires exactly one presentation primary");
  }
  return root as RouteIdentitySnapshotV1;
}

export function serializeRouteIdentitySnapshotV1(value: RouteIdentitySnapshotV1): string {
  parseRouteIdentitySnapshotV1(value); const bytes = `${stableJson(value)}\n`; parseRouteIdentitySnapshotV1(JSON.parse(bytes)); return bytes;
}

export function assertNever(value: never, context: string): never { throw new Error(`${context}: unsupported value ${String(value)}`); }
