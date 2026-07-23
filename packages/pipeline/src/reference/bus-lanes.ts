/**
 * Adapter for the NYC DOT Bus Lanes: Local Streets operational dataset.
 *
 * Observed capture fields include `street`/`facility`, `boro`, `lane_type*`,
 * `direction`/`bltrafdir`, `open_dates`, `year*`, `last_updat`, `chron_id*`,
 * and `segmentid`; representations vary between the tracker JSON/CSV and fresh
 * GeoJSON. Every raw property is retained verbatim in `attributes`. The typed
 * labels are indexing aids, not normalized intervention identity or inferred
 * extent. Geometry is expected to be WGS84 lon/lat.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import type { JsonValue } from "@mta-wiki/db/types";
import { parseCsv, type CsvRecord } from "./gtfs-static.js";
import type { OperationalSnapshot } from "./snapshot-registry.js";

export type Coordinate = { lat: number; lon: number };

export type BusLaneFeature = {
  feature_id: string;
  lane_group_id: string;
  facility: string;
  street: string;
  borough: string;
  direction: string;
  opened: string;
  attributes: Record<string, JsonValue | undefined>;
  lines: Coordinate[][];
};

type GeoJsonGeometry = {
  type?: string;
  coordinates?: unknown;
};

type GeoJsonFeature = {
  id?: string | number;
  type?: string;
  geometry?: GeoJsonGeometry | null;
  properties?: Record<string, unknown> | null;
};

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedKeys(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
}

function stringValue(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key.toLowerCase()];
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
  }
  return "";
}

function coordinate(value: unknown): Coordinate | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  return { lat, lon };
}

function geometryLines(geometry: GeoJsonGeometry | null | undefined): Coordinate[][] {
  if (!geometry) return [];
  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    const line = geometry.coordinates.map(coordinate).filter((value): value is Coordinate => value !== undefined);
    return line.length >= 2 ? [line] : [];
  }
  if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .filter(Array.isArray)
      .map((rawLine) => rawLine.map(coordinate).filter((value): value is Coordinate => value !== undefined))
      .filter((line) => line.length >= 2);
  }
  return [];
}

export function parseWktMultiLineString(value: string): Coordinate[][] {
  const match = /^\s*(?:MULTI)?LINESTRING\s*\((.*)\)\s*$/iu.exec(value);
  if (!match?.[1]) return [];
  let body = match[1].trim();
  const multi = /^\s*\(/u.test(body);
  if (multi && body.startsWith("(") && body.endsWith(")")) body = body.slice(1, -1);
  const chunks = multi ? body.split(/\)\s*,\s*\(/u) : [body];
  return chunks.map((chunk) => chunk.replace(/^\(/u, "").replace(/\)$/u, "").split(/\s*,\s*/u)
    .map((pair) => {
      const [lon, lat] = pair.trim().split(/\s+/u).map(Number);
      return Number.isFinite(lat) && Number.isFinite(lon) ? { lat: lat!, lon: lon! } : undefined;
    })
    .filter((entry): entry is Coordinate => entry !== undefined))
    .filter((line) => line.length >= 2);
}

function jsonAttributes(row: Record<string, unknown>): Record<string, JsonValue | undefined> {
  const output: Record<string, JsonValue | undefined> = {};
  for (const [key, value] of Object.entries(row).sort(([left], [right]) => left.localeCompare(right))) {
    if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") continue;
    output[key] = value as JsonValue;
  }
  return output;
}

function laneFeature(input: {
  row: Record<string, unknown>;
  geometry: GeoJsonGeometry | null | undefined;
  index: number;
  featureId?: string | undefined;
}): BusLaneFeature | undefined {
  const row = normalizedKeys(input.row);
  const lines = geometryLines(input.geometry);
  if (lines.length === 0) return undefined;
  const segmentId = stringValue(row, "segmentid", "segment_id", "objectid") || String(input.index + 1);
  const facility = stringValue(row, "facility");
  const street = stringValue(row, "street") || facility;
  const borough = stringValue(row, "boro", "borough");
  const direction = stringValue(row, "direction");
  const opened = stringValue(row, "open_dates", "open_date", "year1");
  return {
    feature_id: input.featureId ?? segmentId,
    lane_group_id: [borough || "unknown", street || "unknown"].join("|"),
    facility,
    street,
    borough,
    direction,
    opened,
    attributes: jsonAttributes(input.row),
    lines,
  };
}

function trackerJsonFeatures(path: string): BusLaneFeature[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { rows?: unknown[] };
  if (!Array.isArray(parsed.rows)) throw new Error(`${path}: expected tracker rows array`);
  return parsed.rows.map((raw, index) => {
    const row = object(raw);
    return laneFeature({
      row,
      geometry: object(row.the_geom) as GeoJsonGeometry,
      index,
    });
  }).filter((value): value is BusLaneFeature => value !== undefined);
}

function geoJsonFeatures(path: string): BusLaneFeature[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { type?: string; features?: GeoJsonFeature[] };
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error(`${path}: expected a GeoJSON FeatureCollection`);
  }
  return parsed.features.map((feature, index) => laneFeature({
    row: feature.properties ?? {},
    geometry: feature.geometry,
    index,
    ...(feature.id === undefined ? {} : { featureId: String(feature.id) }),
  })).filter((value): value is BusLaneFeature => value !== undefined);
}

function csvFeatures(path: string): BusLaneFeature[] {
  return parseCsv(readFileSync(path, "utf8")).map((raw: CsvRecord, index) => {
    const normalized = normalizedKeys(raw);
    const geometry = stringValue(normalized, "the_geom");
    const lines = parseWktMultiLineString(geometry);
    if (lines.length === 0) return undefined;
    return laneFeature({
      row: raw,
      geometry: { type: "MultiLineString", coordinates: lines.map((line) => line.map((point) => [point.lon, point.lat])) },
      index,
    });
  }).filter((value): value is BusLaneFeature => value !== undefined);
}

export function loadBusLaneSnapshot(snapshot: OperationalSnapshot, rootDir = repoRoot): BusLaneFeature[] {
  if (snapshot.kind !== "dot_bus_lanes") throw new Error(`${snapshot.snapshot_id} is not a DOT bus-lane snapshot`);
  const sourceDir = join(rootDir, "raw/sources", snapshot.source_id);
  const geojson = join(sourceDir, "source.geojson");
  const json = join(sourceDir, "source.json");
  const csv = join(sourceDir, "rows.csv");
  const features = existsSync(geojson)
    ? geoJsonFeatures(geojson)
    : existsSync(json)
      ? trackerJsonFeatures(json)
      : existsSync(csv)
        ? csvFeatures(csv)
        : [];
  if (features.length === 0) throw new Error(`${snapshot.snapshot_id}: no usable WGS84 lane features`);
  return features.sort((left, right) => left.lane_group_id.localeCompare(right.lane_group_id) || left.feature_id.localeCompare(right.feature_id));
}

export type BusLaneGroup = {
  lane_group_id: string;
  facility: string;
  street: string;
  borough: string;
  direction: string;
  directions?: string[] | undefined;
  opened: string;
  features: BusLaneFeature[];
};

export function groupBusLaneFeatures(features: readonly BusLaneFeature[]): BusLaneGroup[] {
  const groups = new Map<string, BusLaneFeature[]>();
  for (const feature of features) {
    const group = groups.get(feature.lane_group_id) ?? [];
    group.push(feature);
    groups.set(feature.lane_group_id, group);
  }
  return [...groups.entries()].map(([laneGroupId, members]) => ({
    lane_group_id: laneGroupId,
    facility: members[0]?.facility ?? "",
    street: members[0]?.street ?? members[0]?.facility ?? "",
    borough: members[0]?.borough ?? "",
    direction: members[0]?.direction ?? "",
    directions: [...new Set(members.map((member) => member.direction).filter(Boolean))].sort(),
    opened: members[0]?.opened ?? "",
    features: members.sort((left, right) => left.feature_id.localeCompare(right.feature_id)),
  })).sort((left, right) => left.lane_group_id.localeCompare(right.lane_group_id));
}
