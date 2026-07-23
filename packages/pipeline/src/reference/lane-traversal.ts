import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  coordinateCoverage,
  loadBusSchedulePatternSnapshot,
  nearestScheduleDate,
  scheduleStopChains,
  type BusScheduleRow,
  type ScheduleRowWindow,
  type ScheduleStopChain,
} from "./bus-schedules.js";
import { groupBusLaneFeatures, loadBusLaneSnapshot, type BusLaneGroup, type Coordinate } from "./bus-lanes.js";
import {
  buildGtfsCoordinateIndex,
  gtfsDateWithinSnapshot,
  loadGtfsStaticSnapshot,
  type GtfsCoordinateIndex,
} from "./gtfs-static.js";
import {
  loadOperationalSnapshotRegistry,
  operationalSnapshotRegistrySha256,
  selectOperationalSnapshots,
  type OperationalSnapshot,
} from "./snapshot-registry.js";

export const LANE_TRAVERSAL_PARAMS = {
  stop_coordinate_coverage_floor: 0.8,
  match_radius_m: 25,
  probe_spacing_m: 25,
  confirmed_min_miles: 0.5,
  confirmed_min_share: 0.1,
  maximum_schedule_lag_days: 7,
} as const;

export type LaneTraversalVerdict = "traversal_confirmed" | "traversal_marginal" | "no_traversal" | "geometry_ambiguous";

export type LaneTraversalInputs = {
  gtfs_snapshot_ids: string[];
  lane_snapshot_id: string;
  schedule_snapshot_ids: string[];
  candidate_ledger: { path: string; sha256: string };
  tracker_input: { path: string; sha256: string };
};

export type LaneTraversalRow = {
  schema_version: 1;
  candidate_id: string;
  candidate_date: string | null;
  route_id: string;
  service_date: string | null;
  direction: string | null;
  path_identity: string | null;
  lane_group_id: string | null;
  street: string | null;
  borough: string | null;
  path_source: "gtfs_shape" | "historical_schedule_timepoint_pattern" | "unavailable";
  temporal_lag_days: number | null;
  stop_coordinate_coverage: number;
  route_miles: number;
  overlap_miles: number;
  overlap_share: number;
  span: { first_stop_id: string | null; last_stop_id: string | null; stop_ids: string[] };
  lane_attributes: JsonValue[];
  verdict_class: LaneTraversalVerdict;
  reason: string;
  snapshot_ids: string[];
  generated_from: { registry_sha256: string };
  params: typeof LANE_TRAVERSAL_PARAMS;
  inputs: LaneTraversalInputs;
};

type BridgeRow = {
  candidate_id: string;
  downstream_disposition: string;
};

type TrackerRow = {
  candidate_id: string;
  route_id: string;
  implementation_date: string | null;
  date_precision: string | null;
};

export type CurrentLaneProbeRow = {
  route_id: string;
  direction: string;
  lane_group_id: string;
  street: string;
  borough: string;
  overlap_miles: number;
  overlap_share: number;
  verdict_class: "traversal_confirmed" | "traversal_marginal" | "geometry_ambiguous";
};

type VariantLaneVerdictRow = {
  candidate_id: string;
  direction: string | null;
  path_source: LaneTraversalRow["path_source"];
  path_identity: string | null;
  lane_group_id: string | null;
  verdict_class: LaneTraversalVerdict;
  reason: string;
};

export function reconcileSameDirectionShapeVariantVerdicts<T extends VariantLaneVerdictRow>(
  rows: readonly T[],
): T[] {
  const output = rows.map((row) => ({ ...row }));
  const variantsByGroup = new Map<string, Set<string>>();
  const groupKey = (row: VariantLaneVerdictRow) =>
    [row.candidate_id, row.direction ?? "", row.path_source].join("\0");
  for (const row of output) {
    if (row.path_source === "unavailable" || row.path_identity === null) continue;
    const variants = variantsByGroup.get(groupKey(row)) ?? new Set<string>();
    variants.add(row.path_identity);
    variantsByGroup.set(groupKey(row), variants);
  }
  const isPositive = (row: VariantLaneVerdictRow) =>
    row.verdict_class === "traversal_confirmed" || row.verdict_class === "traversal_marginal";
  const supported = new Set(output.filter((row) =>
    isPositive(row) && row.path_identity !== null && row.lane_group_id !== null).map((row) =>
    [groupKey(row), row.path_identity!, row.lane_group_id!].join("\0")));
  for (const row of output) {
    if (!isPositive(row) || row.path_identity === null || row.lane_group_id === null) continue;
    const variants = variantsByGroup.get(groupKey(row)) ?? new Set<string>();
    if (variants.size > 1 && [...variants].some((variant) =>
      !supported.has([groupKey(row), variant, row.lane_group_id!].join("\0")))) {
      row.verdict_class = "geometry_ambiguous";
      row.reason = "same_direction_shape_variants_disagree_on_lane_identity";
    }
  }
  return output;
}

function readBridge(path: string, rootDir: string): BridgeRow[] {
  return readFileSync(join(rootDir, path), "utf8")
    .split(/\n/u).filter(Boolean).map((line) => JSON.parse(line) as BridgeRow);
}

function readTracker(path: string, rootDir: string): TrackerRow[] {
  const parsed = JSON.parse(readFileSync(join(rootDir, path), "utf8")) as {
    rows?: TrackerRow[];
  };
  if (!Array.isArray(parsed.rows)) throw new Error("tracker-rc26-input.json has no rows array");
  return parsed.rows;
}

function radians(value: number): number {
  return value * Math.PI / 180;
}

export function haversineMeters(left: Coordinate, right: Coordinate): number {
  const earth = 6_371_008.8;
  const dLat = radians(right.lat - left.lat);
  const dLon = radians(right.lon - left.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(left.lat)) * Math.cos(radians(right.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(a)));
}

function projected(point: Coordinate, origin: Coordinate): { x: number; y: number } {
  const earth = 6_371_008.8;
  return {
    x: radians(point.lon - origin.lon) * earth * Math.cos(radians(origin.lat)),
    y: radians(point.lat - origin.lat) * earth,
  };
}

export function pointToSegmentMeters(point: Coordinate, start: Coordinate, end: Coordinate): number {
  const p = projected(point, point);
  const a = projected(start, point);
  const b = projected(end, point);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(a.x, a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function normalizedCardinal(value: string): string {
  return value.trim().toUpperCase().replace(/BOUND$/u, "").replace(/B$/u, "");
}

export function orientedSegmentCompatible(start: Coordinate, end: Coordinate, laneDirection: string): boolean {
  const lane = normalizedCardinal(laneDirection);
  if (!lane || lane === "BOTH" || lane === "TWO-WAY") return true;
  const northing = end.lat - start.lat;
  const easting = (end.lon - start.lon) * Math.cos(radians((start.lat + end.lat) / 2));
  const bearing = Math.abs(northing) >= Math.abs(easting)
    ? northing >= 0 ? "N" : "S"
    : easting >= 0 ? "E" : "W";
  return lane.split(/[^NSEW]+/u).filter(Boolean).includes(bearing);
}

export function negativeTraversalVerdictForPathSource(
  source: LaneTraversalRow["path_source"],
): "no_traversal" | "geometry_ambiguous" {
  return source === "gtfs_shape" ? "no_traversal" : "geometry_ambiguous";
}

export function classifyTraversalOverlap(input: {
  contiguous: boolean;
  overlapMeters: number;
  pathMeters: number;
}): "traversal_confirmed" | "traversal_marginal" | "geometry_ambiguous" {
  if (!input.contiguous) return "geometry_ambiguous";
  const overlapMiles = input.overlapMeters / 1609.344;
  const share = input.pathMeters === 0 ? 0 : input.overlapMeters / input.pathMeters;
  return overlapMiles >= LANE_TRAVERSAL_PARAMS.confirmed_min_miles || share >= LANE_TRAVERSAL_PARAMS.confirmed_min_share
    ? "traversal_confirmed"
    : "traversal_marginal";
}

function bbox(points: readonly Coordinate[]): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  return {
    minLat: Math.min(...points.map((point) => point.lat)),
    maxLat: Math.max(...points.map((point) => point.lat)),
    minLon: Math.min(...points.map((point) => point.lon)),
    maxLon: Math.max(...points.map((point) => point.lon)),
  };
}

function bboxesNear(left: ReturnType<typeof bbox>, right: ReturnType<typeof bbox>, thresholdMeters: number): boolean {
  const latPadding = thresholdMeters / 111_320;
  const lonPadding = thresholdMeters / 84_000;
  return left.minLat - latPadding <= right.maxLat && left.maxLat + latPadding >= right.minLat &&
    left.minLon - lonPadding <= right.maxLon && left.maxLon + lonPadding >= right.minLon;
}

export type TraversalPath = {
  direction: string;
  pathIdentity: string;
  points: Coordinate[];
  stopIds: Array<string | null>;
  locatedStops?: Array<{ stop_id: string; point_index: number }> | undefined;
  coverage: number;
  source: LaneTraversalRow["path_source"];
  snapshotId?: string | undefined;
};

function pathFromChain(chain: ScheduleStopChain, gtfs: GtfsCoordinateIndex): TraversalPath {
  const points: Coordinate[] = [];
  const stopIds: string[] = [];
  for (const stop of chain.stops) {
    const gtfsStop = (gtfs.stopsByRoute.get(chain.route_id) ?? gtfs.stops).get(stop.stop_id);
    if (!gtfsStop) continue;
    const prior = stopIds.at(-1);
    if (prior === stop.stop_id) continue;
    points.push({ lat: gtfsStop.stop_lat, lon: gtfsStop.stop_lon });
    stopIds.push(stop.stop_id);
  }
  return {
    direction: chain.direction,
    pathIdentity: chain.shape_id,
    points,
    stopIds,
    locatedStops: stopIds.map((stop_id, point_index) => ({ stop_id, point_index })),
    coverage: coordinateCoverage(chain, gtfs).share,
    source: "historical_schedule_timepoint_pattern",
  };
}

function currentGtfsPaths(routeId: string, gtfs: GtfsCoordinateIndex, snapshotId: string): TraversalPath[] {
  return (gtfs.routeShapes.get(routeId) ?? []).map(({ shape_id: shapeId, direction_id: directionId }) => {
    const points = (gtfs.shapes.get(shapeId) ?? []).map((point) => ({ lat: point.lat, lon: point.lon }));
    const locatedStops = (gtfs.shapeStops.get(shapeId) ?? []).map((stopId) => {
      const stop = gtfs.stops.get(stopId);
      if (!stop || points.length === 0) return undefined;
      let pointIndex = 0;
      let distance = Number.POSITIVE_INFINITY;
      for (const [index, point] of points.entries()) {
        const candidate = haversineMeters(point, { lat: stop.stop_lat, lon: stop.stop_lon });
        if (candidate < distance) {
          distance = candidate;
          pointIndex = index;
        }
      }
      return { stop_id: stopId, point_index: pointIndex };
    }).filter((value): value is { stop_id: string; point_index: number } => value !== undefined);
    return {
      direction: directionId,
      pathIdentity: shapeId,
      points,
      stopIds: points.map(() => null),
      locatedStops,
      coverage: 1,
      source: "gtfs_shape" as const,
      snapshotId,
    };
  }).filter((path) => path.points.length >= 2);
}

export function overlapWithLane(path: TraversalPath, lane: BusLaneGroup): {
  overlapMeters: number;
  pathMeters: number;
  spanStopIds: string[];
  contiguous: boolean;
  partialAlignment: boolean;
} {
  const laneLines = lane.features.flatMap((feature) => feature.lines.map((line) => ({ line, direction: feature.direction })));
  const pathBox = bbox(path.points);
  const candidateLines = laneLines.filter(({ line }) => bboxesNear(pathBox, bbox(line), LANE_TRAVERSAL_PARAMS.match_radius_m));
  let pathMeters = 0;
  let partialAlignment = false;
  const matched: number[] = [];
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const start = path.points[index]!;
    const end = path.points[index + 1]!;
    const length = haversineMeters(start, end);
    pathMeters += length;
    const probeCount = Math.max(1, Math.ceil(length / LANE_TRAVERSAL_PARAMS.probe_spacing_m));
    const probes = Array.from({ length: probeCount + 1 }, (_, probeIndex) => ({
      lat: start.lat + (end.lat - start.lat) * probeIndex / probeCount,
      lon: start.lon + (end.lon - start.lon) * probeIndex / probeCount,
    }));
    const orientedLines = candidateLines.filter(({ direction }) => orientedSegmentCompatible(start, end, direction));
    // DOT splits a continuous street lane into adjacent raw features. Densely
    // probe against the union of oriented lines in the street+borough group so
    // feature seams join, while any uncovered gap keeps the path ambiguous.
    const probeMatches = probes.map((probe) => orientedLines.some(({ line }) => {
      for (let laneIndex = 0; laneIndex < line.length - 1; laneIndex += 1) {
        if (pointToSegmentMeters(probe, line[laneIndex]!, line[laneIndex + 1]!) <= LANE_TRAVERSAL_PARAMS.match_radius_m) return true;
      }
      return false;
    }));
    const near = probeMatches.length > 0 && probeMatches.every(Boolean);
    if (!near && probeMatches.some(Boolean)) partialAlignment = true;
    if (near) {
      matched.push(index);
    }
  }
  const runs: number[][] = [];
  for (const index of matched) {
    const run = runs.at(-1);
    if (!run || index !== run.at(-1)! + 1) runs.push([index]);
    else run.push(index);
  }
  const selected = runs.sort((left, right) => {
    const miles = (run: number[]) => run.reduce((sum, index) => sum + haversineMeters(path.points[index]!, path.points[index + 1]!), 0);
    return miles(right) - miles(left) || left[0]! - right[0]!;
  })[0] ?? [];
  const overlapMeters = selected.reduce((sum, index) => sum + haversineMeters(path.points[index]!, path.points[index + 1]!), 0);
  const first = selected[0];
  const last = selected.at(-1);
  const locatedStops = path.locatedStops ?? path.stopIds.map((stop_id, point_index) => stop_id === null ? undefined : { stop_id, point_index })
    .filter((value): value is { stop_id: string; point_index: number } => value !== undefined);
  const orderedStops = [...locatedStops].sort((left, right) => left.point_index - right.point_index || left.stop_id.localeCompare(right.stop_id));
  const span = first === undefined || last === undefined
    ? []
    : [
      [...orderedStops].reverse().find((stop) => stop.point_index <= first),
      ...orderedStops.filter((stop) => stop.point_index >= first && stop.point_index <= last + 1),
      orderedStops.find((stop) => stop.point_index >= last + 1),
    ].filter((value): value is { stop_id: string; point_index: number } => value !== undefined).map((stop) => stop.stop_id);
  return {
    overlapMeters,
    pathMeters,
    spanStopIds: [...new Set(span)],
    contiguous: runs.length <= 1,
    partialAlignment,
  };
}

function baseAmbiguous(input: {
  candidateId: string;
  date: string | null;
  routeId: string;
  reason: string;
  registrySha: string;
  snapshotIds?: string[] | undefined;
  serviceDate?: string | undefined;
  direction?: string | undefined;
  coverage?: number | undefined;
  source?: LaneTraversalRow["path_source"] | undefined;
  pathIdentity?: string | undefined;
  lag?: number | undefined;
  inputs: LaneTraversalInputs;
}): LaneTraversalRow {
  return {
    schema_version: 1,
    candidate_id: input.candidateId,
    candidate_date: input.date,
    route_id: input.routeId,
    service_date: input.serviceDate ?? null,
    direction: input.direction || null,
    path_identity: input.pathIdentity ?? null,
    lane_group_id: null,
    street: null,
    borough: null,
    path_source: input.source ?? "unavailable",
    temporal_lag_days: input.lag ?? null,
    stop_coordinate_coverage: input.coverage ?? 0,
    route_miles: 0,
    overlap_miles: 0,
    overlap_share: 0,
    span: { first_stop_id: null, last_stop_id: null, stop_ids: [] },
    lane_attributes: [],
    verdict_class: "geometry_ambiguous",
    reason: input.reason,
    snapshot_ids: [...(input.snapshotIds ?? [])].sort(),
    generated_from: { registry_sha256: input.registrySha },
    params: LANE_TRAVERSAL_PARAMS,
    inputs: input.inputs,
  };
}

export function composeScheduleRowsForYear(
  snapshots: readonly OperationalSnapshot[],
  rowsBySnapshot: ReadonlyMap<string, readonly BusScheduleRow[]>,
  year: number,
): { snapshotIds: string[]; rows: BusScheduleRow[] } {
  const selected = snapshots.filter((snapshot) =>
    snapshot.dataset_id !== undefined && snapshot.label.startsWith(String(year)))
    .sort((left, right) => left.snapshot_id.localeCompare(right.snapshot_id));
  const byExactRow = new Map<string, BusScheduleRow>();
  for (const snapshot of selected) {
    for (const row of rowsBySnapshot.get(snapshot.snapshot_id) ?? []) {
      byExactRow.set(stableJson(row as unknown as JsonValue), row);
    }
  }
  return {
    snapshotIds: selected.map((snapshot) => snapshot.snapshot_id),
    rows: [...byExactRow.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, row]) => row),
  };
}

function shiftedDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildCurrentLaneProbe(input: {
  gtfsSnapshotIds: readonly string[];
  laneSnapshotId: string;
  routeIds: readonly string[];
  serviceDate: string;
  rootDir?: string | undefined;
  registryPath?: string | undefined;
}): CurrentLaneProbeRow[] {
  const rootDir = input.rootDir ?? repoRoot;
  const registryPath = input.registryPath ?? join(rootDir, "data/reference/operational/snapshots.json");
  const registry = loadOperationalSnapshotRegistry(registryPath);
  const gtfsSnapshots = selectOperationalSnapshots(registry, input.gtfsSnapshotIds, "gtfs_static")
    .filter((snapshot) => gtfsDateWithinSnapshot(snapshot, input.serviceDate));
  if (gtfsSnapshots.length === 0) throw new Error(`${input.serviceDate}: no selected GTFS snapshot covers the probe date`);
  const indexes = gtfsSnapshots.map((snapshot) => ({
    snapshot,
    index: buildGtfsCoordinateIndex([loadGtfsStaticSnapshot(snapshot, ["routes", "stops", "stop_times", "shapes", "trips"], rootDir, new Set(input.routeIds))]),
  }));
  const laneSnapshot = selectOperationalSnapshots(registry, [input.laneSnapshotId], "dot_bus_lanes")[0]!;
  const lanes = groupBusLaneFeatures(loadBusLaneSnapshot(laneSnapshot, rootDir));
  const rows: CurrentLaneProbeRow[] = [];
  for (const routeId of [...input.routeIds].sort()) {
    for (const { snapshot, index } of indexes) {
      for (const path of currentGtfsPaths(routeId, index, snapshot.snapshot_id)) {
        for (const lane of lanes) {
          const overlap = overlapWithLane(path, lane);
          if (overlap.overlapMeters === 0 && !overlap.partialAlignment) continue;
          const verdict = overlap.partialAlignment && overlap.overlapMeters === 0
            ? "geometry_ambiguous"
            : classifyTraversalOverlap({ contiguous: overlap.contiguous, overlapMeters: overlap.overlapMeters, pathMeters: overlap.pathMeters });
          rows.push({
            route_id: routeId,
            direction: path.direction,
            lane_group_id: lane.lane_group_id,
            street: lane.street,
            borough: lane.borough,
            overlap_miles: overlap.overlapMeters / 1609.344,
            overlap_share: overlap.pathMeters === 0 ? 0 : overlap.overlapMeters / overlap.pathMeters,
            verdict_class: verdict,
          });
        }
      }
    }
  }
  return rows.sort((left, right) => left.route_id.localeCompare(right.route_id) || left.direction.localeCompare(right.direction) || left.lane_group_id.localeCompare(right.lane_group_id));
}

export function buildLaneTraversalRows(selection: {
  gtfsSnapshotIds: readonly string[];
  laneSnapshotId: string;
  scheduleSnapshotIds: readonly string[];
  candidateLedgerPath: string;
  trackerInputPath?: string | undefined;
  rootDir?: string | undefined;
  registryPath?: string | undefined;
}): LaneTraversalRow[] {
  const rootDir = selection.rootDir ?? repoRoot;
  const registryPath = selection.registryPath ?? join(rootDir, "data/reference/operational/snapshots.json");
  const registry = loadOperationalSnapshotRegistry(registryPath);
  const registrySha = operationalSnapshotRegistrySha256(registryPath);
  const gtfsSnapshots = selectOperationalSnapshots(registry, selection.gtfsSnapshotIds, "gtfs_static");
  const trackerInputPath = selection.trackerInputPath ?? "data/quality/study-readiness/v1/tracker-rc26-input.json";
  const trackerById = new Map(readTracker(trackerInputPath, rootDir).map((row) => [row.candidate_id, row]));
  const candidates = readBridge(selection.candidateLedgerPath, rootDir).filter((row) => row.downstream_disposition === "source_fixable_bus_lane_occurrence_identity");
  const currentRouteIds = new Set(candidates.map((candidate) => trackerById.get(candidate.candidate_id)).filter((tracker): tracker is TrackerRow =>
    tracker !== undefined && tracker.date_precision === "day" && tracker.implementation_date !== null &&
    gtfsSnapshots.some((snapshot) => gtfsDateWithinSnapshot(snapshot, tracker.implementation_date!))).map((tracker) => tracker.route_id));
  const coordinateRouteIds = new Set(candidates.map((candidate) => trackerById.get(candidate.candidate_id)?.route_id).filter((routeId): routeId is string => Boolean(routeId)));
  const historicalGtfsLoaded = gtfsSnapshots.map((snapshot) =>
    loadGtfsStaticSnapshot(snapshot, ["routes", "stops", "trips"], rootDir, coordinateRouteIds));
  const historicalGtfsIndex = buildGtfsCoordinateIndex(historicalGtfsLoaded);
  const currentGtfsLoaded = currentRouteIds.size === 0 ? [] : gtfsSnapshots.map((snapshot) =>
    loadGtfsStaticSnapshot(snapshot, ["routes", "stops", "stop_times", "shapes", "trips"], rootDir, currentRouteIds));
  const gtfsIndexes = new Map(currentGtfsLoaded.map((loaded) => [loaded.snapshot.snapshot_id, buildGtfsCoordinateIndex([loaded])]));
  const scheduleSnapshots = selectOperationalSnapshots(registry, selection.scheduleSnapshotIds, "bus_schedules_year");
  const laneSnapshot = selectOperationalSnapshots(registry, [selection.laneSnapshotId], "dot_bus_lanes")[0]!;
  const laneGroups = groupBusLaneFeatures(loadBusLaneSnapshot(laneSnapshot, rootDir));
  const candidateAbsolute = join(rootDir, selection.candidateLedgerPath);
  const trackerAbsolute = join(rootDir, trackerInputPath);
  const inputs: LaneTraversalInputs = {
    gtfs_snapshot_ids: gtfsSnapshots.map((snapshot) => snapshot.snapshot_id),
    lane_snapshot_id: laneSnapshot.snapshot_id,
    schedule_snapshot_ids: scheduleSnapshots.map((snapshot) => snapshot.snapshot_id),
    candidate_ledger: { path: selection.candidateLedgerPath, sha256: createHash("sha256").update(readFileSync(candidateAbsolute)).digest("hex") },
    tracker_input: { path: trackerInputPath, sha256: createHash("sha256").update(readFileSync(trackerAbsolute)).digest("hex") },
  };
  const scheduleWindowsByYear = new Map<number, ScheduleRowWindow[]>();
  for (const candidate of candidates) {
    const tracker = trackerById.get(candidate.candidate_id);
    if (!tracker?.implementation_date || tracker.date_precision !== "day") continue;
    if (gtfsSnapshots.some((snapshot) => gtfsDateWithinSnapshot(snapshot, tracker.implementation_date!))) continue;
    const year = Number(tracker.implementation_date.slice(0, 4));
    if (year < 2023 || year > 2026) continue;
    const windows = scheduleWindowsByYear.get(year) ?? [];
    windows.push({
      route_id: tracker.route_id,
      start: shiftedDate(tracker.implementation_date, -LANE_TRAVERSAL_PARAMS.maximum_schedule_lag_days),
      end: shiftedDate(tracker.implementation_date, LANE_TRAVERSAL_PARAMS.maximum_schedule_lag_days),
    });
    scheduleWindowsByYear.set(year, windows);
  }
  const scheduleRows = new Map(scheduleSnapshots.map((snapshot) => {
    const year = Number(snapshot.label.slice(0, 4));
    return [snapshot.snapshot_id, loadBusSchedulePatternSnapshot(snapshot, scheduleWindowsByYear.get(year) ?? [], rootDir)] as const;
  }));
  const scheduleRowsByYear = new Map([2023, 2024, 2025, 2026].map((year) => [
    year,
    composeScheduleRowsForYear(scheduleSnapshots, scheduleRows, year),
  ]));
  const output: LaneTraversalRow[] = [];
  for (const candidate of candidates) {
    const tracker = trackerById.get(candidate.candidate_id);
    if (!tracker) throw new Error(`${candidate.candidate_id}: absent from pinned tracker input`);
    const date = tracker.date_precision === "day" && tracker.implementation_date && /^\d{4}-\d{2}-\d{2}$/u.test(tracker.implementation_date)
      ? tracker.implementation_date
      : null;
    if (!date) {
      output.push(baseAmbiguous({ candidateId: candidate.candidate_id, date: null, routeId: tracker.route_id, reason: "candidate_date_not_exact_day", registrySha, inputs }));
      continue;
    }
    const year = Number(date.slice(0, 4));
    const usableGtfs = gtfsSnapshots.filter((snapshot) => gtfsDateWithinSnapshot(snapshot, date));
    let serviceDate: string | null = date;
    let lag = 0;
    let paths: TraversalPath[] = [];
    let pathSnapshotIds: string[] = [];
    if (usableGtfs.length > 0) {
      paths = usableGtfs.flatMap((snapshot) => currentGtfsPaths(tracker.route_id, gtfsIndexes.get(snapshot.snapshot_id)!, snapshot.snapshot_id));
      pathSnapshotIds = [...new Set(paths.map((path) => path.snapshotId).filter((value): value is string => value !== undefined))];
    } else if (year >= 2023 && year <= 2026) {
      const composed = scheduleRowsByYear.get(year)!;
      if (composed.snapshotIds.length === 0) {
        output.push(baseAmbiguous({ candidateId: candidate.candidate_id, date, routeId: tracker.route_id, reason: "no_historical_schedule_snapshot", registrySha, inputs }));
        continue;
      }
      const rows = composed.rows;
      const nearest = nearestScheduleDate(rows, tracker.route_id, date, LANE_TRAVERSAL_PARAMS.maximum_schedule_lag_days);
      if (!nearest) {
        output.push(baseAmbiguous({
          candidateId: candidate.candidate_id,
          date,
          routeId: tracker.route_id,
          reason: "no_dated_schedule_within_7_days",
          registrySha,
          snapshotIds: composed.snapshotIds,
          inputs,
        }));
        continue;
      }
      serviceDate = nearest.date;
      lag = nearest.lag_days;
      paths = scheduleStopChains(rows, tracker.route_id, nearest.date).map((chain) => pathFromChain(chain, historicalGtfsIndex));
      pathSnapshotIds = [...composed.snapshotIds, ...gtfsSnapshots.map((snapshot) => snapshot.snapshot_id)];
    } else {
      // This explicit row is the critical fail-closed boundary: current GTFS never substitutes for historical service.
      output.push(baseAmbiguous({
        candidateId: candidate.candidate_id,
        date,
        routeId: tracker.route_id,
        reason: "historical_schedule_unavailable_pre_2023",
        registrySha,
        inputs,
      }));
      continue;
    }
    if (paths.length === 0) {
      output.push(baseAmbiguous({ candidateId: candidate.candidate_id, date, routeId: tracker.route_id, reason: "no_complete_route_path", registrySha, snapshotIds: pathSnapshotIds, serviceDate: serviceDate ?? undefined, lag, inputs }));
      continue;
    }
    for (const path of paths) {
      if (path.points.length < 2 || path.coverage < LANE_TRAVERSAL_PARAMS.stop_coordinate_coverage_floor || !path.direction) {
        output.push(baseAmbiguous({
          candidateId: candidate.candidate_id,
          date,
          routeId: tracker.route_id,
          reason: path.points.length < 2 ? "insufficient_path_points" : path.coverage < LANE_TRAVERSAL_PARAMS.stop_coordinate_coverage_floor ? "coordinate_coverage_below_0_80" : "direction_unknown",
          registrySha,
          snapshotIds: [...pathSnapshotIds, laneSnapshot.snapshot_id],
          serviceDate: serviceDate ?? undefined,
          direction: path.direction,
          pathIdentity: path.pathIdentity,
          coverage: path.coverage,
          source: path.source,
          lag,
          inputs,
        }));
        continue;
      }
      const matches = laneGroups.map((lane) => ({ lane, overlap: overlapWithLane(path, lane) }))
        .filter(({ overlap }) => overlap.overlapMeters > 0 || overlap.partialAlignment);
      if (matches.length === 0) {
        const pathMeters = path.points.slice(1).reduce((sum, point, index) => sum + haversineMeters(path.points[index]!, point), 0);
        const negativeVerdict = negativeTraversalVerdictForPathSource(path.source);
        output.push({
          ...baseAmbiguous({ candidateId: candidate.candidate_id, date, routeId: tracker.route_id, reason: negativeVerdict === "no_traversal" ? "temporally_aligned_shape_has_no_lane_overlap" : "timepoint_pattern_cannot_prove_negative_traversal", registrySha, inputs }),
          service_date: serviceDate,
          direction: path.direction,
          path_identity: path.pathIdentity,
          path_source: path.source,
          temporal_lag_days: lag,
          stop_coordinate_coverage: path.coverage,
          route_miles: pathMeters / 1609.344,
          verdict_class: negativeVerdict,
          snapshot_ids: [...new Set([...pathSnapshotIds, laneSnapshot.snapshot_id])].sort(),
        });
        continue;
      }
      for (const { lane, overlap } of matches) {
        const overlapMiles = overlap.overlapMeters / 1609.344;
        const pathMiles = overlap.pathMeters / 1609.344;
        const share = overlap.pathMeters === 0 ? 0 : overlap.overlapMeters / overlap.pathMeters;
        const verdictClass = overlap.partialAlignment && overlap.overlapMeters === 0
          ? "geometry_ambiguous"
          : classifyTraversalOverlap({
            contiguous: overlap.contiguous,
            overlapMeters: overlap.overlapMeters,
            pathMeters: overlap.pathMeters,
          });
        output.push({
          schema_version: 1,
          candidate_id: candidate.candidate_id,
          candidate_date: date,
          route_id: tracker.route_id,
          service_date: serviceDate,
          direction: path.direction,
          path_identity: path.pathIdentity,
          lane_group_id: lane.lane_group_id,
          street: lane.street,
          borough: lane.borough,
          path_source: path.source,
          temporal_lag_days: lag,
          stop_coordinate_coverage: path.coverage,
          route_miles: pathMiles,
          overlap_miles: overlapMiles,
          overlap_share: share,
          span: {
            first_stop_id: overlap.spanStopIds[0] ?? null,
            last_stop_id: overlap.spanStopIds.at(-1) ?? null,
            stop_ids: overlap.spanStopIds,
          },
          lane_attributes: lane.features.map((feature) => feature.attributes as JsonValue),
          verdict_class: verdictClass,
          reason: overlap.partialAlignment && overlap.overlapMeters === 0
            ? "partial_lane_alignment_cannot_establish_traversal"
            : verdictClass === "geometry_ambiguous" ? "lane_overlap_noncontiguous" : verdictClass === "traversal_confirmed" ? "overlap_threshold_met" : "overlap_below_confirmation_threshold",
          snapshot_ids: [...new Set([...pathSnapshotIds, laneSnapshot.snapshot_id])].sort(),
          generated_from: { registry_sha256: registrySha },
          params: LANE_TRAVERSAL_PARAMS,
          inputs,
        });
      }
    }
  }
  const reconciled = reconcileSameDirectionShapeVariantVerdicts(output);
  const covered = new Set(reconciled.map((row) => row.candidate_id));
  if (covered.size !== candidates.length) throw new Error(`Lane traversal denominator mismatch: ${covered.size}/${candidates.length}`);
  return reconciled.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id) ||
    (left.direction ?? "").localeCompare(right.direction ?? "") ||
    (left.path_identity ?? "").localeCompare(right.path_identity ?? "") ||
    (left.lane_group_id ?? "").localeCompare(right.lane_group_id ?? ""));
}

export function writeLaneTraversalDossier(
  selection: Parameters<typeof buildLaneTraversalRows>[0],
  outputPath?: string,
): { path: string; rows: LaneTraversalRow[]; sha256: string } {
  const rows = buildLaneTraversalRows(selection);
  const resolvedOutputPath = outputPath ?? join(
    repoRoot,
    "data/quality/operational-reference/lane-traversal",
    `${rows[0]?.inputs.candidate_ledger.sha256 ?? "empty"}__${selection.laneSnapshotId}.jsonl`,
  );
  const bytes = rows.map((row) => stableJson(row as unknown as JsonValue)).join("\n") + "\n";
  mkdirSync(dirname(resolvedOutputPath), { recursive: true });
  writeFileSync(resolvedOutputPath, bytes, "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const summary = {
    schema_version: 1,
    row_count: rows.length,
    candidate_count: new Set(rows.map((row) => row.candidate_id)).size,
    counts_by_verdict: Object.fromEntries(["traversal_confirmed", "traversal_marginal", "no_traversal", "geometry_ambiguous"].map((verdict) => [verdict, rows.filter((row) => row.verdict_class === verdict).length])),
    output_sha256: sha256,
  };
  writeFileSync(resolvedOutputPath.slice(0, -extname(resolvedOutputPath).length) + ".summary.json", `${stableJson(summary as unknown as JsonValue)}\n`, "utf8");
  return { path: resolvedOutputPath, rows, sha256 };
}
