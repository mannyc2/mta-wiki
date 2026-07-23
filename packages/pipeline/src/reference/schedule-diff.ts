import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  loadBusScheduleSnapshot,
  nearestScheduleDate,
  scheduleStopChains,
  type BusScheduleRow,
  type ScheduleRowWindow,
  type ScheduleStopChain,
} from "./bus-schedules.js";
import { buildGtfsCoordinateIndex, loadGtfsStaticSnapshot, type GtfsCoordinateIndex } from "./gtfs-static.js";
import {
  loadOperationalSnapshotRegistry,
  operationalSnapshotRegistrySha256,
  selectOperationalSnapshots,
  type OperationalSnapshot,
} from "./snapshot-registry.js";

export const SCHEDULE_DIFF_PERIODS = {
  am_peak: { start_hour: 6, end_hour: 10, day_types: ["Weekday"] },
  midday: { start_hour: 10, end_hour: 15, day_types: ["Weekday"] },
  pm_peak: { start_hour: 15, end_hour: 19, day_types: ["Weekday"] },
  evening: { start_hour: 19, end_hour: 24, day_types: ["Weekday"] },
  weekend: { start_hour: 0, end_hour: 24, day_types: ["Saturday", "Sunday"] },
} as const;

export const SCHEDULE_DEPARTURE_KEY_FIELDS = ["schedule_time", "direction", "shape_id", "block_id", "service_id"] as const;

export type PeriodStatistic = {
  period: keyof typeof SCHEDULE_DIFF_PERIODS;
  trip_count: number;
  mean_headway_minutes: number | null;
};

export type TimepointStop = {
  stop_id: string;
  stop_name: string;
  last_seen?: string | undefined;
  first_seen?: string | undefined;
};

export type TimepointEndpoint = {
  stop_id: string;
  stop_name: string;
};

export type DirectionDiff = {
  direction: string;
  shape_patterns_before: ShapePatternSummary[];
  shape_patterns_after: ShapePatternSummary[];
  variant_disagreement: boolean;
  timepoint_stops_removed: TimepointStop[];
  timepoint_stops_added: TimepointStop[];
  endpoints_before: TimepointEndpoint[];
  endpoints_after: TimepointEndpoint[];
  span_change: { miles: number | null };
  trips_per_period_before: PeriodStatistic[];
  trips_per_period_after: PeriodStatistic[];
};

export type ShapePatternSummary = {
  shape_id: string;
  stop_ids: string[];
  endpoints: TimepointEndpoint[];
  miles: number | null;
};

export type CorrespondenceSegment = {
  old_route_id: string;
  direction: string;
  predecessor_shape_id: string;
  successor_shape_id: string;
  predecessor_service_date: string;
  boundary_stops: TimepointEndpoint[];
  shared_timepoint_stop_ids: string[];
  miles: number | null;
};

export type CorrespondenceResult = {
  old_route_id: string;
  predecessor_service_date: string | null;
  predecessor_shape_count: number;
  successor_shape_count: number;
  exact_shared_shape_pair_count: number;
  status: "matched_exact_timepoint_ids" | "no_exact_shared_timepoint_stop_id" | "predecessor_schedule_unavailable";
};

export type NewRouteRemainder = {
  direction: string;
  shape_id: string;
  timepoint_stops: TimepointStop[];
};

export type ReceiptReference = {
  snapshot_id: string;
  path: string;
  sha256: string;
};

export type ScheduleDiffDossier = {
  schema_version: 1;
  route_id: string;
  before_route_id: string;
  after_route_id: string;
  requested_before_date: string;
  requested_after_date: string;
  before_service_date: string | null;
  after_service_date: string | null;
  before_lag_days: number | null;
  after_lag_days: number | null;
  direction_diffs: DirectionDiff[];
  correspondence_segments: CorrespondenceSegment[];
  correspondence_results: CorrespondenceResult[];
  new_route_remainder: NewRouteRemainder[];
  snapshot_ids: string[];
  registry_sha256: string;
  query_receipts: ReceiptReference[];
  field_metadata: { path: string; sha256: string } | null;
  parameters: {
    maximum_schedule_lag_days: 28;
    periods: typeof SCHEDULE_DIFF_PERIODS;
    departure_key_fields: typeof SCHEDULE_DEPARTURE_KEY_FIELDS;
    correspondence_algorithm: "longest_common_stop_subsequence_v1";
  };
  inputs: {
    gtfs_snapshot_ids: string[];
    schedule_snapshot_ids: string[];
  };
};

function scheduleSnapshotsForYear(snapshots: readonly OperationalSnapshot[], year: number): OperationalSnapshot[] {
  const matches = snapshots.filter((candidate) => candidate.label.startsWith(String(year)));
  if (matches.length === 0) throw new Error(`No schedule snapshot registered for ${year}`);
  return matches.sort((left, right) => left.snapshot_id.localeCompare(right.snapshot_id));
}

function shiftedDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function routeRows(rows: readonly BusScheduleRow[], routeId: string, date: string, direction: string): BusScheduleRow[] {
  return rows.filter((row) => row.route_id === routeId && row.schedule_date === date && row.direction === direction);
}

function observedStop(stop: BusScheduleRow, date: string, side: "before" | "after"): TimepointStop {
  return {
    stop_id: stop.stop_id,
    stop_name: stop.stop_name,
    ...(side === "before" ? { last_seen: date } : { first_seen: date }),
  };
}

export function compareTimepointPatterns(
  beforeStops: readonly BusScheduleRow[],
  afterStops: readonly BusScheduleRow[],
  beforeDate: string,
  afterDate: string,
): Pick<DirectionDiff, "timepoint_stops_removed" | "timepoint_stops_added" | "endpoints_before" | "endpoints_after"> {
  const beforeIds = new Set(beforeStops.map((stop) => stop.stop_id));
  const afterIds = new Set(afterStops.map((stop) => stop.stop_id));
  const endpointObjects = (stops: readonly BusScheduleRow[]): TimepointEndpoint[] =>
    [stops[0], stops.at(-1)]
      .filter((value): value is BusScheduleRow => value !== undefined)
      .map((stop) => ({ stop_id: stop.stop_id, stop_name: stop.stop_name }));
  return {
    timepoint_stops_removed: beforeStops.filter((stop) => !afterIds.has(stop.stop_id)).map((stop) => observedStop(stop, beforeDate, "before")),
    timepoint_stops_added: afterStops.filter((stop) => !beforeIds.has(stop.stop_id)).map((stop) => observedStop(stop, afterDate, "after")),
    endpoints_before: endpointObjects(beforeStops),
    endpoints_after: endpointObjects(afterStops),
  };
}

function receiptReference(snapshot: OperationalSnapshot): ReceiptReference {
  const receipt = snapshot.artifacts.find((artifact) => artifact.path.endsWith("/receipt.json"));
  if (!receipt) throw new Error(`${snapshot.snapshot_id}: registered query receipt is missing`);
  return { snapshot_id: snapshot.snapshot_id, path: receipt.path, sha256: receipt.sha256 };
}

function chainMiles(stopIds: readonly string[], gtfs: GtfsCoordinateIndex, routeId: string): number | null {
  const routeStops = gtfs.stopsByRoute.get(routeId) ?? gtfs.stops;
  const points = stopIds.map((stopId) => routeStops.get(stopId)).filter((value) => value !== undefined);
  if (points.length < 2 || points.length / Math.max(1, stopIds.length) < 0.8) return null;
  let meters = 0;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1]!;
    const right = points[index]!;
    const lat = (left.stop_lat + right.stop_lat) * Math.PI / 360;
    const x = (right.stop_lon - left.stop_lon) * Math.PI / 180 * Math.cos(lat);
    const y = (right.stop_lat - left.stop_lat) * Math.PI / 180;
    meters += Math.sqrt(x * x + y * y) * 6_371_008.8;
  }
  return meters / 1609.344;
}

function scheduleMinute(value: string): number | undefined {
  const match = /T(\d{2}):(\d{2}):/u.exec(value);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : undefined;
}

export function periodStatistics(rows: readonly BusScheduleRow[]): PeriodStatistic[] {
  const origins = rows.filter((row) => row.origin === "1" || row.stop_sequence === 1);
  return Object.entries(SCHEDULE_DIFF_PERIODS).map(([name, period]) => {
    const departures = new Map<string, number>();
    for (const row of origins) {
      if (!(period.day_types as readonly string[]).includes(row.day_type)) continue;
      const minute = scheduleMinute(row.schedule_time);
      if (minute === undefined || minute < period.start_hour * 60 || minute >= period.end_hour * 60) continue;
      const key = SCHEDULE_DEPARTURE_KEY_FIELDS.map((field) => row[field]).join("\0");
      departures.set(key, minute);
    }
    const minutes = [...departures.values()].sort((left, right) => left - right);
    const headways = minutes.slice(1).map((value, index) => value - minutes[index]!);
    return {
      period: name as keyof typeof SCHEDULE_DIFF_PERIODS,
      trip_count: departures.size,
      mean_headway_minutes: headways.length === 0 ? null : headways.reduce((sum, value) => sum + value, 0) / headways.length,
    };
  });
}

export function longestCommonStopSubsequence(left: readonly string[], right: readonly string[]): string[] {
  const lengths = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      lengths[leftIndex]![rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? lengths[leftIndex - 1]![rightIndex - 1]! + 1
        : Math.max(lengths[leftIndex - 1]![rightIndex]!, lengths[leftIndex]![rightIndex - 1]!);
    }
  }
  const output: string[] = [];
  let leftIndex = left.length;
  let rightIndex = right.length;
  while (leftIndex > 0 && rightIndex > 0) {
    if (left[leftIndex - 1] === right[rightIndex - 1]) {
      output.push(left[leftIndex - 1]!);
      leftIndex -= 1;
      rightIndex -= 1;
    } else if (lengths[leftIndex - 1]![rightIndex]! >= lengths[leftIndex]![rightIndex - 1]!) {
      leftIndex -= 1;
    } else {
      rightIndex -= 1;
    }
  }
  return output.reverse();
}

function chainsByDirection(chains: readonly ScheduleStopChain[]): Map<string, ScheduleStopChain[]> {
  const output = new Map<string, ScheduleStopChain[]>();
  for (const chain of chains) {
    const values = output.get(chain.direction) ?? [];
    values.push(chain);
    output.set(chain.direction, values);
  }
  return output;
}

function aggregatePatternStops(chains: readonly ScheduleStopChain[]): BusScheduleRow[] {
  const byStop = new Map<string, BusScheduleRow>();
  for (const chain of [...chains].sort((left, right) => left.shape_id.localeCompare(right.shape_id))) {
    for (const stop of chain.stops) if (!byStop.has(stop.stop_id)) byStop.set(stop.stop_id, stop);
  }
  return [...byStop.values()];
}

function patternEndpoints(stops: readonly BusScheduleRow[]): TimepointEndpoint[] {
  return [stops[0], stops.at(-1)]
    .filter((value): value is BusScheduleRow => value !== undefined)
    .map((stop) => ({ stop_id: stop.stop_id, stop_name: stop.stop_name }))
    .filter((stop, index, values) => values.findIndex((value) => value.stop_id === stop.stop_id) === index);
}

function patternInventory(chains: readonly ScheduleStopChain[], gtfs: GtfsCoordinateIndex, routeId: string): ShapePatternSummary[] {
  return [...chains].sort((left, right) => left.shape_id.localeCompare(right.shape_id)).map((chain) => ({
    shape_id: chain.shape_id,
    stop_ids: chain.stops.map((stop) => stop.stop_id),
    endpoints: patternEndpoints(chain.stops),
    miles: chainMiles(chain.stops.map((stop) => stop.stop_id), gtfs, routeId),
  }));
}

export function buildScheduleDiff(input: {
  routeId: string;
  beforeDate: string;
  afterDate: string;
  correspondRoutes?: readonly string[] | undefined;
  beforeRouteId?: string | undefined;
  gtfsSnapshotIds: readonly string[];
  scheduleSnapshotIds: readonly string[];
  rootDir?: string | undefined;
  registryPath?: string | undefined;
}): ScheduleDiffDossier {
  const rootDir = input.rootDir ?? repoRoot;
  const registryPath = input.registryPath ?? join(rootDir, "data/reference/operational/snapshots.json");
  const registry = loadOperationalSnapshotRegistry(registryPath);
  const scheduleSnapshots = selectOperationalSnapshots(registry, input.scheduleSnapshotIds, "bus_schedules_year");
  const gtfsSnapshots = selectOperationalSnapshots(registry, input.gtfsSnapshotIds, "gtfs_static");
  const beforeRouteId = input.beforeRouteId ?? input.routeId;
  const coordinateRouteIds = new Set([input.routeId, beforeRouteId, ...(input.correspondRoutes ?? [])]);
  const gtfs = buildGtfsCoordinateIndex(gtfsSnapshots.map((snapshot) =>
    loadGtfsStaticSnapshot(snapshot, ["routes", "stops", "trips"], rootDir, coordinateRouteIds)));
  const beforeSnapshots = scheduleSnapshotsForYear(scheduleSnapshots, Number(input.beforeDate.slice(0, 4)));
  const afterSnapshots = scheduleSnapshotsForYear(scheduleSnapshots, Number(input.afterDate.slice(0, 4)));
  const scheduleWindows: ScheduleRowWindow[] = [{
    route_id: input.routeId,
    start: shiftedDate(input.beforeDate, -28),
    end: shiftedDate(input.afterDate, 28),
  }, {
    route_id: beforeRouteId,
    start: shiftedDate(input.beforeDate, -28),
    end: input.beforeDate,
  }, ...(input.correspondRoutes ?? []).map((routeId) => ({
    route_id: routeId,
    start: shiftedDate(input.beforeDate, -28),
    end: input.beforeDate,
  }))];
  const rowsBySnapshot = new Map<string, BusScheduleRow[]>();
  const rowsFor = (snapshot: OperationalSnapshot) => {
    const existing = rowsBySnapshot.get(snapshot.snapshot_id);
    if (existing) return existing;
    const loaded = loadBusScheduleSnapshot(snapshot, scheduleWindows, rootDir);
    rowsBySnapshot.set(snapshot.snapshot_id, loaded);
    return loaded;
  };
  const rowsByYear = new Map<number, BusScheduleRow[]>();
  const rowsForYear = (year: number, snapshots: readonly OperationalSnapshot[]) => {
    const existing = rowsByYear.get(year);
    if (existing) return existing;
    const byExactRow = new Map<string, BusScheduleRow>();
    for (const row of snapshots.flatMap(rowsFor)) byExactRow.set(stableJson(row as unknown as JsonValue), row);
    const rows = [...byExactRow.values()].sort((left, right) => left.schedule_date.localeCompare(right.schedule_date) ||
      left.route_id.localeCompare(right.route_id) || left.direction.localeCompare(right.direction) ||
      left.shape_id.localeCompare(right.shape_id) || left.stop_sequence - right.stop_sequence || left.stop_id.localeCompare(right.stop_id) ||
      left.schedule_time.localeCompare(right.schedule_time) || left.block_id.localeCompare(right.block_id));
    rowsByYear.set(year, rows);
    return rows;
  };
  const beforeRows = rowsForYear(Number(input.beforeDate.slice(0, 4)), beforeSnapshots);
  const afterRows = rowsForYear(Number(input.afterDate.slice(0, 4)), afterSnapshots);
  const beforeNearest = nearestScheduleDate(beforeRows, beforeRouteId, input.beforeDate, 28, "on_or_before");
  const afterNearest = nearestScheduleDate(afterRows, input.routeId, input.afterDate, 28, "on_or_after");
  const beforeDate = beforeNearest?.date ?? null;
  const afterDate = afterNearest?.date ?? null;
  const directions = [...new Set([
    ...(beforeDate ? beforeRows.filter((row) => row.route_id === beforeRouteId && row.schedule_date === beforeDate).map((row) => row.direction) : []),
    ...(afterDate ? afterRows.filter((row) => row.route_id === input.routeId && row.schedule_date === afterDate).map((row) => row.direction) : []),
  ])].sort();
  const directionDiffs = directions.map((direction): DirectionDiff => {
    const oldRows = beforeDate ? routeRows(beforeRows, beforeRouteId, beforeDate, direction) : [];
    const newRows = afterDate ? routeRows(afterRows, input.routeId, afterDate, direction) : [];
    const oldChains = beforeDate ? scheduleStopChains(beforeRows, beforeRouteId, beforeDate).filter((chain) => chain.direction === direction) : [];
    const newChains = afterDate ? scheduleStopChains(afterRows, input.routeId, afterDate).filter((chain) => chain.direction === direction) : [];
    const oldStops = aggregatePatternStops(oldChains);
    const newStops = aggregatePatternStops(newChains);
    const oldPatterns = patternInventory(oldChains, gtfs, beforeRouteId);
    const newPatterns = patternInventory(newChains, gtfs, input.routeId);
    const uniquePatterns = (patterns: readonly ShapePatternSummary[]) => new Set(patterns.map((pattern) => pattern.stop_ids.join("\0"))).size;
    const variantDisagreement = uniquePatterns(oldPatterns) > 1 || uniquePatterns(newPatterns) > 1;
    const comparison = compareTimepointPatterns(oldStops, newStops, beforeDate ?? input.beforeDate, afterDate ?? input.afterDate);
    return {
      direction,
      ...comparison,
      endpoints_before: [...new Map(oldPatterns.flatMap((pattern) => pattern.endpoints).map((stop) => [stop.stop_id, stop])).values()],
      endpoints_after: [...new Map(newPatterns.flatMap((pattern) => pattern.endpoints).map((stop) => [stop.stop_id, stop])).values()],
      shape_patterns_before: oldPatterns,
      shape_patterns_after: newPatterns,
      variant_disagreement: variantDisagreement,
      span_change: {
        miles: oldPatterns.length === 1 && newPatterns.length === 1 && oldPatterns[0]!.miles !== null && newPatterns[0]!.miles !== null
          ? newPatterns[0]!.miles! - oldPatterns[0]!.miles! : null,
      },
      trips_per_period_before: periodStatistics(oldRows),
      trips_per_period_after: periodStatistics(newRows),
    };
  });

  const afterChains = afterDate ? chainsByDirection(scheduleStopChains(afterRows, input.routeId, afterDate)) : new Map<string, ScheduleStopChain[]>();
  const correspondence: CorrespondenceSegment[] = [];
  const correspondenceResults: CorrespondenceResult[] = [];
  const inheritedByDirection = new Map<string, Set<string>>();
  for (const predecessorRoute of [...(input.correspondRoutes ?? [])].sort()) {
    const predecessorNearest = nearestScheduleDate(beforeRows, predecessorRoute, input.beforeDate, 28, "on_or_before");
    if (!predecessorNearest) {
      correspondenceResults.push({
        old_route_id: predecessorRoute,
        predecessor_service_date: null,
        predecessor_shape_count: 0,
        successor_shape_count: [...afterChains.values()].reduce((sum, chains) => sum + chains.length, 0),
        exact_shared_shape_pair_count: 0,
        status: "predecessor_schedule_unavailable",
      });
      continue;
    }
    const predecessorChains = scheduleStopChains(beforeRows, predecessorRoute, predecessorNearest.date);
    let exactSharedShapePairCount = 0;
    for (const predecessor of predecessorChains) {
      for (const successor of afterChains.get(predecessor.direction) ?? []) {
        const oldStops = predecessor.stops.map((stop) => stop.stop_id);
        const newStops = successor.stops.map((stop) => stop.stop_id);
        const common = longestCommonStopSubsequence(oldStops, newStops);
        if (common.length === 0) continue;
        exactSharedShapePairCount += 1;
        const inherited = inheritedByDirection.get(predecessor.direction) ?? new Set<string>();
        for (const stopId of common) inherited.add(stopId);
        inheritedByDirection.set(predecessor.direction, inherited);
        const boundaries = [common[0], common.at(-1)]
          .filter((value): value is string => value !== undefined)
          .map((stopId) => successor.stops.find((stop) => stop.stop_id === stopId))
          .filter((value): value is BusScheduleRow => value !== undefined)
          .map((stop) => ({ stop_id: stop.stop_id, stop_name: stop.stop_name }));
        correspondence.push({
          old_route_id: predecessorRoute,
          direction: predecessor.direction,
          predecessor_shape_id: predecessor.shape_id,
          successor_shape_id: successor.shape_id,
          predecessor_service_date: predecessorNearest.date,
          boundary_stops: boundaries.filter((stop, index, values) => values.findIndex((value) => value.stop_id === stop.stop_id) === index),
          shared_timepoint_stop_ids: common,
          miles: chainMiles(common, gtfs, input.routeId),
        });
      }
    }
    correspondenceResults.push({
      old_route_id: predecessorRoute,
      predecessor_service_date: predecessorNearest.date,
      predecessor_shape_count: predecessorChains.length,
      successor_shape_count: [...afterChains.values()].reduce((sum, chains) => sum + chains.length, 0),
      exact_shared_shape_pair_count: exactSharedShapePairCount,
      status: exactSharedShapePairCount > 0 ? "matched_exact_timepoint_ids" : "no_exact_shared_timepoint_stop_id",
    });
  }
  const newRouteRemainder = [...afterChains.entries()].flatMap(([direction, chains]) => chains.map((chain): NewRouteRemainder => {
    const inherited = inheritedByDirection.get(direction) ?? new Set<string>();
    return {
      direction,
      shape_id: chain.shape_id,
      timepoint_stops: afterDate
        ? chain.stops.filter((stop) => !inherited.has(stop.stop_id)).map((stop) => observedStop(stop, afterDate, "after"))
        : [],
    };
  }));
  const scheduleInputs = [...new Map([...beforeSnapshots, ...afterSnapshots].map((snapshot) => [snapshot.snapshot_id, snapshot])).values()];
  return {
    schema_version: 1,
    route_id: input.routeId,
    before_route_id: beforeRouteId,
    after_route_id: input.routeId,
    requested_before_date: input.beforeDate,
    requested_after_date: input.afterDate,
    before_service_date: beforeDate,
    after_service_date: afterDate,
    before_lag_days: beforeNearest?.lag_days ?? null,
    after_lag_days: afterNearest?.lag_days ?? null,
    direction_diffs: directionDiffs,
    correspondence_segments: correspondence.sort((left, right) => left.old_route_id.localeCompare(right.old_route_id) ||
      left.direction.localeCompare(right.direction) || left.predecessor_shape_id.localeCompare(right.predecessor_shape_id) ||
      left.successor_shape_id.localeCompare(right.successor_shape_id)),
    correspondence_results: correspondenceResults,
    new_route_remainder: newRouteRemainder,
    snapshot_ids: [...new Set([...scheduleInputs.map((snapshot) => snapshot.snapshot_id), ...gtfsSnapshots.map((snapshot) => snapshot.snapshot_id)])].sort(),
    registry_sha256: operationalSnapshotRegistrySha256(registryPath),
    query_receipts: scheduleInputs.map(receiptReference).sort((left, right) => left.snapshot_id.localeCompare(right.snapshot_id)),
    field_metadata: (() => {
      const metadata = registry.supporting_artifacts.find((artifact) => artifact.kind === "bus_schedule_field_metadata");
      return metadata ? { path: metadata.path, sha256: metadata.sha256 } : null;
    })(),
    parameters: {
      maximum_schedule_lag_days: 28,
      periods: SCHEDULE_DIFF_PERIODS,
      departure_key_fields: SCHEDULE_DEPARTURE_KEY_FIELDS,
      correspondence_algorithm: "longest_common_stop_subsequence_v1",
    },
    inputs: {
      gtfs_snapshot_ids: gtfsSnapshots.map((snapshot) => snapshot.snapshot_id),
      schedule_snapshot_ids: scheduleSnapshots.map((snapshot) => snapshot.snapshot_id),
    },
  };
}

export function writeScheduleDiffDossier(input: {
  routeId: string;
  beforeDate: string;
  afterDate: string;
  correspondRoutes?: readonly string[] | undefined;
  beforeRouteId?: string | undefined;
  gtfsSnapshotIds: readonly string[];
  scheduleSnapshotIds: readonly string[];
  rootDir?: string | undefined;
  registryPath?: string | undefined;
  outputPath?: string | undefined;
}): { dossier: ScheduleDiffDossier; path: string; sha256: string } {
  const dossier = buildScheduleDiff(input);
  const path = input.outputPath ?? join(
    repoRoot,
    "data/quality/operational-reference/schedule-diff",
    `${input.routeId.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}__${input.beforeDate}__${input.afterDate}.json`,
  );
  const bytes = `${stableJson(dossier as unknown as JsonValue)}\n`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, "utf8");
  return { dossier, path, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export function writeRequiredScheduleDiffDossiers(selection: {
  gtfsSnapshotIds: readonly string[];
  scheduleSnapshotIds: readonly string[];
}): Array<{ dossier: ScheduleDiffDossier; path: string; sha256: string }> {
  return [
    writeScheduleDiffDossier({ ...selection, routeId: "Q61", beforeDate: "2025-06-28", afterDate: "2025-06-29", correspondRoutes: ["Q15", "Q34"] }),
    writeScheduleDiffDossier({ ...selection, routeId: "QM44", beforeDate: "2025-06-27", afterDate: "2025-06-30" }),
    writeScheduleDiffDossier({ ...selection, routeId: "QM64", beforeRouteId: "X64", beforeDate: "2025-06-27", afterDate: "2025-06-30", correspondRoutes: ["X64"] }),
  ];
}
