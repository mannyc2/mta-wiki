import { closeSync, openSync, readFileSync, readSync } from "node:fs";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { repoRoot } from "@mta-wiki/core/paths";
import type { OperationalSnapshot } from "./snapshot-registry.js";

export type CsvRecord = Record<string, string>;

export function parseCsv(text: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows.shift()?.map((value, index) => index === 0 ? value.replace(/^\uFEFF/u, "") : value);
  if (!header || header.length === 0) return [];
  return rows.map((values) => Object.fromEntries(header.map((key, index) => [key!, values[index] ?? ""])));
}

export type GtfsRoute = {
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
};

export type GtfsStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
};

export type GtfsTrip = {
  route_id: string;
  service_id: string;
  trip_id: string;
  shape_id: string;
  direction_id: string;
  trip_headsign?: string | undefined;
};

export type GtfsStopTime = {
  trip_id: string;
  stop_id: string;
  stop_sequence: number;
  arrival_time: string;
  departure_time: string;
  pickup_type?: string | undefined;
  drop_off_type?: string | undefined;
};

export type GtfsShapePoint = {
  shape_id: string;
  lat: number;
  lon: number;
  sequence: number;
  distance_traveled: number | null;
};

export type GtfsCalendar = {
  service_id: string;
  start_date: string;
  end_date: string;
  weekdays: readonly boolean[];
};

export type GtfsStaticSnapshot = {
  snapshot: OperationalSnapshot;
  routes: GtfsRoute[];
  stops: GtfsStop[];
  trips: GtfsTrip[];
  stop_times: GtfsStopTime[];
  shapes: GtfsShapePoint[];
  calendar: GtfsCalendar[];
  calendar_dates: CsvRecord[];
  agencies: CsvRecord[];
};

export type GtfsTableName =
  | "agency"
  | "calendar"
  | "calendar_dates"
  | "routes"
  | "shapes"
  | "stops"
  | "stop_times"
  | "trips";

function routeExternalAliases(route: CsvRecord | GtfsRoute): string[] {
  const shortName = route.route_short_name ?? "";
  return shortName
    ? [...new Set([shortName, shortName.replace(/-SBS$/u, "")])]
    : [route.route_id ?? ""].filter(Boolean);
}

function requireText(row: CsvRecord, field: string, context: string): string {
  const value = row[field];
  if (value === undefined || value === "") throw new Error(`${context}: missing ${field}`);
  return value;
}

function finiteNumber(value: string, context: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${context}: invalid number ${value}`);
  return number;
}

function snapshotFile(snapshot: OperationalSnapshot, name: string, rootDir: string): string {
  if (snapshot.kind !== "gtfs_static") throw new Error(`${snapshot.snapshot_id} is not GTFS static`);
  return join(rootDir, "raw/sources", snapshot.source_id, "extracted", `${name}.txt`);
}

function rowsFor(snapshot: OperationalSnapshot, name: string, rootDir: string): CsvRecord[] {
  return parseCsv(readFileSync(snapshotFile(snapshot, name, rootDir), "utf8"));
}

function csvCellAt(line: string, targetIndex: number): string {
  let cell = "";
  let cellIndex = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        if (cellIndex === targetIndex) cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      if (cellIndex === targetIndex) return cell;
      cellIndex += 1;
    } else if (cellIndex === targetIndex && char !== "\r" && char !== "\n") cell += char;
  }
  return cellIndex === targetIndex ? cell : "";
}

function rowsForFiltered(
  snapshot: OperationalSnapshot,
  name: string,
  rootDir: string,
  field: string,
  allowed: ReadonlySet<string>,
): CsvRecord[] {
  if (allowed.size === 0) return [];
  const path = snapshotFile(snapshot, name, rootDir);
  const descriptor = openSync(path, "r");
  const decoder = new StringDecoder("utf8");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  let carry = "";
  let quoted = false;
  let headerLine: string | undefined;
  let fieldIndex = -1;
  const output: CsvRecord[] = [];
  const accept = (line: string) => {
    if (!line.trim()) return;
    if (!headerLine) {
      headerLine = line;
      // parseCsv treats a single line as a header, so add one synthetic row to recover keys.
      fieldIndex = Object.keys(parseCsv(`${line}${line.endsWith("\n") ? "" : "\n"}fixture\n`)[0] ?? {}).indexOf(field);
      if (fieldIndex < 0) throw new Error(`${path}: missing filter field ${field}`);
      return;
    }
    if (!allowed.has(csvCellAt(line, fieldIndex))) return;
    const row = parseCsv(`${headerLine}${headerLine.endsWith("\n") ? "" : "\n"}${line}`)[0];
    if (row) output.push(row);
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
    if (final && carry.length > 0) accept(carry);
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
  return output;
}

export function loadGtfsStaticSnapshot(
  snapshot: OperationalSnapshot,
  requestedTables: readonly GtfsTableName[] = [
    "agency", "calendar", "calendar_dates", "routes", "shapes", "stops", "stop_times", "trips",
  ],
  rootDir = repoRoot,
  routeIds?: ReadonlySet<string> | undefined,
): GtfsStaticSnapshot {
  const requested = new Set(requestedTables);
  const agencies = requested.has("agency") ? rowsFor(snapshot, "agency", rootDir) : [];
  const calendarRows = requested.has("calendar") ? rowsFor(snapshot, "calendar", rootDir) : [];
  const calendarDates = requested.has("calendar_dates") ? rowsFor(snapshot, "calendar_dates", rootDir) : [];
  const allRouteRows = requested.has("routes") ? rowsFor(snapshot, "routes", rootDir) : [];
  const routeRows = routeIds === undefined ? allRouteRows : allRouteRows.filter((route) =>
    routeExternalAliases(route).some((alias) => routeIds.has(alias)));
  const allTripRows = requested.has("trips") || requested.has("stop_times") || (requested.has("shapes") && routeIds !== undefined)
    ? rowsFor(snapshot, "trips", rootDir) : [];
  const rawRouteIds = routeIds === undefined ? undefined : new Set(routeRows.filter((route) => routeIds.has(route.route_id ?? "") ||
    routeIds.has(route.route_short_name ?? "") || routeIds.has((route.route_short_name ?? "").replace(/-SBS$/u, ""))).map((route) => route.route_id));
  const tripRows = rawRouteIds === undefined ? allTripRows : allTripRows.filter((trip) => rawRouteIds.has(trip.route_id ?? ""));
  const selectedShapeIds = new Set(tripRows.map((trip) => trip.shape_id ?? "").filter(Boolean));
  const shapeRows = requested.has("shapes")
    ? (routeIds === undefined ? rowsFor(snapshot, "shapes", rootDir) : rowsFor(snapshot, "shapes", rootDir).filter((shape) => selectedShapeIds.has(shape.shape_id ?? "")))
    : [];
  const stopRows = requested.has("stops") ? rowsFor(snapshot, "stops", rootDir) : [];
  const stopTimeRows = requested.has("stop_times")
    ? (routeIds === undefined ? rowsFor(snapshot, "stop_times", rootDir) : rowsForFiltered(snapshot, "stop_times", rootDir, "trip_id", new Set(tripRows.map((trip) => trip.trip_id ?? ""))))
    : [];
  return {
    snapshot,
    agencies,
    calendar_dates: calendarDates,
    calendar: calendarRows.map((row, index) => ({
      service_id: requireText(row, "service_id", `calendar[${index}]`),
      start_date: requireText(row, "start_date", `calendar[${index}]`),
      end_date: requireText(row, "end_date", `calendar[${index}]`),
      weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        .map((field) => row[field] === "1"),
    })),
    routes: routeRows.map((row, index) => ({
      route_id: requireText(row, "route_id", `routes[${index}]`),
      agency_id: row.agency_id ?? "",
      route_short_name: row.route_short_name ?? "",
      route_long_name: row.route_long_name ?? "",
    })),
    stops: stopRows.map((row, index) => ({
      stop_id: requireText(row, "stop_id", `stops[${index}]`),
      stop_name: row.stop_name ?? "",
      stop_lat: finiteNumber(requireText(row, "stop_lat", `stops[${index}]`), `stops[${index}].stop_lat`),
      stop_lon: finiteNumber(requireText(row, "stop_lon", `stops[${index}]`), `stops[${index}].stop_lon`),
    })),
    trips: tripRows.map((row, index) => ({
      route_id: requireText(row, "route_id", `trips[${index}]`),
      service_id: requireText(row, "service_id", `trips[${index}]`),
      trip_id: requireText(row, "trip_id", `trips[${index}]`),
      shape_id: row.shape_id ?? "",
      direction_id: row.direction_id ?? "",
      trip_headsign: row.trip_headsign ?? "",
    })),
    stop_times: stopTimeRows.map((row, index) => ({
      trip_id: requireText(row, "trip_id", `stop_times[${index}]`),
      stop_id: requireText(row, "stop_id", `stop_times[${index}]`),
      stop_sequence: finiteNumber(requireText(row, "stop_sequence", `stop_times[${index}]`), `stop_times[${index}].stop_sequence`),
      arrival_time: row.arrival_time ?? "",
      departure_time: row.departure_time ?? "",
      pickup_type: row.pickup_type ?? "",
      drop_off_type: row.drop_off_type ?? "",
    })),
    shapes: shapeRows.map((row, index) => ({
      shape_id: requireText(row, "shape_id", `shapes[${index}]`),
      lat: finiteNumber(requireText(row, "shape_pt_lat", `shapes[${index}]`), `shapes[${index}].shape_pt_lat`),
      lon: finiteNumber(requireText(row, "shape_pt_lon", `shapes[${index}]`), `shapes[${index}].shape_pt_lon`),
      sequence: finiteNumber(requireText(row, "shape_pt_sequence", `shapes[${index}]`), `shapes[${index}].shape_pt_sequence`),
      distance_traveled: row.shape_dist_traveled ? finiteNumber(row.shape_dist_traveled, `shapes[${index}].shape_dist_traveled`) : null,
    })),
  };
}

export type GtfsCoordinateIndex = {
  stops: Map<string, GtfsStop>;
  stopsByRoute: Map<string, Map<string, GtfsStop>>;
  shapes: Map<string, GtfsShapePoint[]>;
  routeShapes: Map<string, Array<{ shape_id: string; direction_id: string }>>;
  shapeStops: Map<string, string[]>;
};

export function buildGtfsCoordinateIndex(snapshots: readonly GtfsStaticSnapshot[]): GtfsCoordinateIndex {
  const stops = new Map<string, GtfsStop>();
  const stopsByRoute = new Map<string, Map<string, GtfsStop>>();
  const ambiguousStopsByRoute = new Map<string, Set<string>>();
  const shapes = new Map<string, GtfsShapePoint[]>();
  const routeShapes = new Map<string, Map<string, string>>();
  const shapeStops = new Map<string, string[]>();
  for (const snapshot of snapshots) {
    for (const stop of snapshot.stops) {
      const prior = stops.get(stop.stop_id);
      // Raw stop_id is feed-local in practice. Preserve the first global value
      // for unambiguous lookups; route-scoped maps below select the owning feed.
      if (!prior) stops.set(stop.stop_id, stop);
    }
    for (const point of snapshot.shapes) {
      // GTFS shape_id is feed-local. Namespace it before combining the six borough/company feeds.
      const namespacedShapeId = `${snapshot.snapshot.snapshot_id}:${point.shape_id}`;
      const points = shapes.get(namespacedShapeId) ?? [];
      points.push(point);
      shapes.set(namespacedShapeId, points);
    }
    const activeRawRouteIds = new Set(snapshot.trips.map((trip) => trip.route_id));
    const aliasesByRouteId = new Map(snapshot.routes
      .filter((route) => activeRawRouteIds.size === 0 || activeRawRouteIds.has(route.route_id))
      .map((route) => [route.route_id, routeExternalAliases(route)]));
    const snapshotStops = new Map(snapshot.stops.map((stop) => [stop.stop_id, stop]));
    for (const aliases of aliasesByRouteId.values()) {
      for (const routeId of new Set(aliases)) {
        const prior = stopsByRoute.get(routeId);
        if (!prior) {
          stopsByRoute.set(routeId, new Map(snapshotStops));
          continue;
        }
        // Cross-borough routes can be published in more than one feed. Merge
        // identical/feed-unique stops, but drop a feed-local id whose coordinates
        // disagree so historical geometry fails closed instead of choosing a feed.
        const ambiguous = ambiguousStopsByRoute.get(routeId) ?? new Set<string>();
        for (const [stopId, stop] of snapshotStops) {
          if (ambiguous.has(stopId)) continue;
          const existing = prior.get(stopId);
          if (!existing) prior.set(stopId, stop);
          else if (existing.stop_lat !== stop.stop_lat || existing.stop_lon !== stop.stop_lon) {
            prior.delete(stopId);
            ambiguous.add(stopId);
          }
        }
        ambiguousStopsByRoute.set(routeId, ambiguous);
      }
    }
    const stopTimesByTrip = new Map<string, GtfsStopTime[]>();
    for (const stopTime of snapshot.stop_times) {
      const values = stopTimesByTrip.get(stopTime.trip_id) ?? [];
      values.push(stopTime);
      stopTimesByTrip.set(stopTime.trip_id, values);
    }
    const representativeTripByShape = new Map<string, { trip_id: string; stop_ids: string[] }>();
    for (const trip of snapshot.trips) {
      if (!trip.shape_id) continue;
      const namespacedShapeId = `${snapshot.snapshot.snapshot_id}:${trip.shape_id}`;
      for (const routeId of new Set(aliasesByRouteId.get(trip.route_id) ?? [trip.route_id])) {
        const shapesForRoute = routeShapes.get(routeId) ?? new Map<string, string>();
        const priorDirection = shapesForRoute.get(namespacedShapeId);
        if (priorDirection !== undefined && priorDirection !== trip.direction_id) {
          throw new Error(`GTFS shape ${namespacedShapeId} has conflicting directions for route ${routeId}`);
        }
        shapesForRoute.set(namespacedShapeId, trip.direction_id);
        routeShapes.set(routeId, shapesForRoute);
      }
      const stopIds = [...(stopTimesByTrip.get(trip.trip_id) ?? [])]
        .sort((left, right) => left.stop_sequence - right.stop_sequence || left.stop_id.localeCompare(right.stop_id))
        .map((stopTime) => stopTime.stop_id);
      const prior = representativeTripByShape.get(namespacedShapeId);
      if (!prior || stopIds.length > prior.stop_ids.length || (stopIds.length === prior.stop_ids.length && trip.trip_id < prior.trip_id)) {
        representativeTripByShape.set(namespacedShapeId, { trip_id: trip.trip_id, stop_ids: stopIds });
      }
    }
    for (const [shapeId, representative] of representativeTripByShape) shapeStops.set(shapeId, representative.stop_ids);
  }
  for (const points of shapes.values()) points.sort((left, right) => left.sequence - right.sequence);
  return {
    stops,
    stopsByRoute,
    shapes,
    shapeStops,
    routeShapes: new Map([...routeShapes].map(([routeId, entries]) => [
      routeId,
      [...entries].map(([shape_id, direction_id]) => ({ shape_id, direction_id }))
        .sort((left, right) => left.direction_id.localeCompare(right.direction_id) || left.shape_id.localeCompare(right.shape_id)),
    ])),
  };
}

export function gtfsDateWithinSnapshot(snapshot: OperationalSnapshot, date: string): boolean {
  return snapshot.kind === "gtfs_static" && snapshot.service_window !== undefined &&
    date >= snapshot.service_window.start && date <= snapshot.service_window.end;
}
