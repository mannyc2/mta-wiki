import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  assertCompleteRouteChunks,
  BUS_SCHEDULE_COLUMNS,
  buildScheduleRequestUniverse,
  loadBusScheduleCsv,
  loadBusSchedulePatternCsv,
  loadRegisteredX64PredecessorSnapshot,
  nearestScheduleDate,
  registeredX64PredecessorSnapshot,
  representativeScheduleChains,
  routeChunks,
  scheduleStopChains,
  type BusScheduleRow,
  type QueryReceipt,
  type ScheduleRequestWindow,
  X64_PREDECESSOR_SNAPSHOT_ID,
} from "../../src/reference/bus-schedules";
import {
  classifyTraversalOverlap,
  negativeTraversalVerdictForPathSource,
  overlapWithLane,
  orientedSegmentCompatible,
  pointToSegmentMeters,
  writeLaneTraversalDossier,
} from "../../src/reference/lane-traversal";
import { buildGtfsCoordinateIndex, loadGtfsStaticSnapshot, type GtfsStaticSnapshot } from "../../src/reference/gtfs-static";
import { groupBusLaneFeatures, loadBusLaneSnapshot } from "../../src/reference/bus-lanes";
import { compareTimepointPatterns, longestCommonStopSubsequence, periodStatistics, writeScheduleDiffDossier } from "../../src/reference/schedule-diff";
import {
  OPERATIONAL_REFERENCE_REGISTRY_ID,
  OPERATIONAL_REFERENCE_SCHEMA_VERSION,
  loadOperationalSnapshotRegistryIfPresent,
  mergeOperationalSnapshots,
  selectOperationalSnapshots,
  validateOperationalReferenceRegistry,
  type OperationalSnapshot,
  type OperationalSnapshotRegistry,
} from "../../src/reference/snapshot-registry";

function snapshot(input: Partial<OperationalSnapshot> & Pick<OperationalSnapshot, "snapshot_id" | "kind" | "source_id">): OperationalSnapshot {
  return {
    snapshot_id: input.snapshot_id,
    kind: input.kind,
    source_id: input.source_id,
    label: input.label ?? "fixture",
    retrieved_at: input.retrieved_at ?? "2026-07-22T00:00:00Z",
    source_url: input.source_url ?? "https://example.invalid/fixture",
    artifacts: input.artifacts ?? [],
    ...(input.dataset_id ? { dataset_id: input.dataset_id } : {}),
    ...(input.service_window ? { service_window: input.service_window } : {}),
  };
}

function scheduleRow(overrides: Partial<BusScheduleRow> = {}): BusScheduleRow {
  return {
    schedule_date: "2025-06-29",
    day_type: "Weekday",
    borough: "Q",
    operator: "NYCT",
    service_id: "fixture",
    direction: "N",
    shape_id: "shape-a",
    trip_type: "1",
    route_id: "Q1",
    stop_sequence: 1,
    stop_id: "A",
    stop_name: "A",
    schedule_time: "2025-06-29T06:00:00.000",
    origin: "1",
    destination: "0",
    school: "0",
    revenue_stop: "1",
    timepoint: "1",
    boarding: "1",
    alighting: "1",
    distance_from_start: 0,
    trip_headsign: "Fixture",
    block_id: "block-1",
    depot_code: "CS",
    bundle: "fixture",
    ...overrides,
  };
}

describe("operational snapshot registry", () => {
  it("treats only an absent registry as first-capture state", () => {
    const root = mkdtempSync(join(tmpdir(), "operational-registry-presence-test-"));
    const registryPath = join(root, "snapshots.json");
    expect(loadOperationalSnapshotRegistryIfPresent(registryPath)).toBeUndefined();
    writeFileSync(registryPath, "{not-json");
    expect(() => loadOperationalSnapshotRegistryIfPresent(registryPath)).toThrow();
    expect(readFileSync(registryPath, "utf8")).toBe("{not-json");
  });

  it("skips an absent public-clone raw source cleanly and detects a present hash mismatch", () => {
    const root = mkdtempSync(join(tmpdir(), "operational-registry-test-"));
    const registryPath = join(root, "data/reference/operational/snapshots.json");
    mkdirSync(join(root, "data/reference/operational"), { recursive: true });
    const registry: OperationalSnapshotRegistry = {
      schema_version: OPERATIONAL_REFERENCE_SCHEMA_VERSION,
      registry_id: OPERATIONAL_REFERENCE_REGISTRY_ID,
      supporting_artifacts: [],
      snapshots: [snapshot({
        snapshot_id: "fixture",
        kind: "dot_bus_lanes",
        source_id: "fixture_source",
        artifacts: [{ path: "raw/sources/fixture_source/source.json", sha256: "0".repeat(64), bytes: 3 }],
      })],
    };
    writeFileSync(registryPath, `${stableJson(registry as unknown as JsonValue)}\n`);
    const absent = validateOperationalReferenceRegistry(registryPath, root);
    expect(absent.issues).toEqual([]);
    expect(absent.snapshots[0]?.status).toBe("skipped_no_operational_reference_raw");

    mkdirSync(join(root, "raw/sources/fixture_source"), { recursive: true });
    const missingMetadata = validateOperationalReferenceRegistry(registryPath, root);
    expect(missingMetadata.issues.some((issue) => issue.message.includes("missing metadata.json"))).toBe(true);
    writeFileSync(join(root, "raw/sources/fixture_source/metadata.json"), JSON.stringify({ sourceId: "fixture_source", sha256: "0".repeat(64), byteLength: 3 }));
    writeFileSync(join(root, "raw/sources/fixture_source/source.json"), "abc");
    const present = validateOperationalReferenceRegistry(registryPath, root);
    expect(present.snapshots[0]?.status).toBe("invalid_operational_reference");
    expect(present.issues.map((issue) => issue.code)).toEqual(["invalid_operational_reference"]);
  });

  it("rejects invalid optional registry field types instead of dropping them", () => {
    const root = mkdtempSync(join(tmpdir(), "operational-registry-optional-test-"));
    const registryPath = join(root, "snapshots.json");
    writeFileSync(registryPath, JSON.stringify({
      schema_version: OPERATIONAL_REFERENCE_SCHEMA_VERSION,
      registry_id: OPERATIONAL_REFERENCE_REGISTRY_ID,
      supporting_artifacts: [],
      snapshots: [{
        snapshot_id: "fixture", kind: "dot_bus_lanes", source_id: "fixture", label: "fixture",
        retrieved_at: "2026-07-22", source_url: "https://example.invalid", dataset_id: 123, artifacts: [],
      }],
    }));
    const report = validateOperationalReferenceRegistry(registryPath, root);
    expect(report.registry).toBeUndefined();
    expect(report.issues[0]?.message).toContain("invalid optional fields");
  });

  it("requires explicit snapshot ids and fails closed on a wrong kind", () => {
    const registry: OperationalSnapshotRegistry = {
      schema_version: OPERATIONAL_REFERENCE_SCHEMA_VERSION,
      registry_id: OPERATIONAL_REFERENCE_REGISTRY_ID,
      supporting_artifacts: [],
      snapshots: [snapshot({ snapshot_id: "lanes", kind: "dot_bus_lanes", source_id: "lanes" })],
    };
    expect(() => selectOperationalSnapshots(registry, [], "dot_bus_lanes")).toThrow("Explicit");
    expect(() => selectOperationalSnapshots(registry, ["lanes"], "gtfs_static")).toThrow("expected gtfs_static");
    expect(selectOperationalSnapshots(registry, ["lanes"], "dot_bus_lanes")[0]?.snapshot_id).toBe("lanes");
  });

  it("reuses byte-identical snapshot ids and refuses replacement metadata", () => {
    const original = snapshot({ snapshot_id: "lanes", kind: "dot_bus_lanes", source_id: "lanes" });
    expect(mergeOperationalSnapshots([original], [{ ...original }])).toEqual([original]);
    expect(() => mergeOperationalSnapshots([original], [{ ...original, label: "changed" }])).toThrow("immutable operational snapshot");
  });
});

describe("GTFS feed-local identifiers", () => {
  it("loads a synthetic two-route extracted GTFS directory from disk", () => {
    const root = mkdtempSync(join(tmpdir(), "gtfs-loader-test-"));
    const extracted = join(root, "raw/sources/feed/extracted");
    mkdirSync(extracted, { recursive: true });
    const files: Record<string, string> = {
      "agency.txt": "agency_id,agency_name\nA,Fixture\n",
      "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20260101,20261231\n",
      "calendar_dates.txt": "service_id,date,exception_type\nWK,20260704,2\n",
      "routes.txt": "route_id,agency_id,route_short_name,route_long_name\nraw-one,A,R1,Route One\nraw-two,A,R2,Route Two\n",
      "shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\ns1,40,-73,1\ns1,40.01,-73,2\ns2,41,-74,1\ns2,41.01,-74,2\n",
      "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nA,Alpha,40,-73\nB,Beta,40.01,-73\nC,Gamma,41,-74\nD,Delta,41.01,-74\n",
      "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,06:00:00,06:00:00,A,1\nt1,06:10:00,06:10:00,B,2\nt2,07:00:00,07:00:00,C,1\nt2,07:10:00,07:10:00,D,2\n",
      "trips.txt": "route_id,service_id,trip_id,shape_id,direction_id\nraw-one,WK,t1,s1,0\nraw-two,WK,t2,s2,1\n",
    };
    for (const [name, contents] of Object.entries(files)) writeFileSync(join(extracted, name), contents);
    const operational = snapshot({ snapshot_id: "feed", kind: "gtfs_static", source_id: "feed" });
    const loaded = loadGtfsStaticSnapshot(operational, undefined, root);
    expect(loaded.routes.map((route) => route.route_short_name)).toEqual(["R1", "R2"]);
    const index = buildGtfsCoordinateIndex([loaded]);
    expect(index.routeShapes.get("R1")?.[0]?.shape_id).toBe("feed:s1");
    expect(index.shapeStops.get("feed:s2")).toEqual(["C", "D"]);
  });

  it("namespaces colliding raw shape ids across bundle snapshots", () => {
    const one = snapshot({ snapshot_id: "feed-one", kind: "gtfs_static", source_id: "feed_one" });
    const two = snapshot({ snapshot_id: "feed-two", kind: "gtfs_static", source_id: "feed_two" });
    const fixture = (operational: OperationalSnapshot, lat: number): GtfsStaticSnapshot => ({
      snapshot: operational,
      routes: [], stops: [], stop_times: [], calendar: [], calendar_dates: [], agencies: [],
      trips: [{ route_id: "Q1", service_id: "s", trip_id: `${lat}`, shape_id: "same", direction_id: "0" }],
      shapes: [{ shape_id: "same", lat, lon: -73, sequence: 1, distance_traveled: null }],
    });
    const index = buildGtfsCoordinateIndex([fixture(one, 40), fixture(two, 41)]);
    expect(index.shapes.size).toBe(2);
    expect(index.routeShapes.get("Q1")?.map((entry) => entry.shape_id)).toEqual([
      "feed-one:same",
      "feed-two:same",
    ]);
  });

  it("drops conflicting feed-local stop ids for a route alias spanning snapshots", () => {
    const one = snapshot({ snapshot_id: "feed-one", kind: "gtfs_static", source_id: "feed_one" });
    const two = snapshot({ snapshot_id: "feed-two", kind: "gtfs_static", source_id: "feed_two" });
    const fixture = (operational: OperationalSnapshot, conflictLat: number): GtfsStaticSnapshot => ({
      snapshot: operational,
      routes: [{ route_id: "raw", agency_id: "A", route_short_name: "R1", route_long_name: "Route" }],
      stops: [
        { stop_id: "shared", stop_name: "Shared", stop_lat: 40, stop_lon: -73 },
        { stop_id: "conflict", stop_name: "Conflict", stop_lat: conflictLat, stop_lon: -73 },
      ],
      stop_times: [], calendar: [], calendar_dates: [], agencies: [],
      trips: [{ route_id: "raw", service_id: "s", trip_id: `${conflictLat}`, shape_id: "", direction_id: "0" }],
      shapes: [],
    });
    const index = buildGtfsCoordinateIndex([fixture(one, 40), fixture(two, 41)]);
    expect(index.stopsByRoute.get("R1")?.get("shared")?.stop_lat).toBe(40);
    expect(index.stopsByRoute.get("R1")?.has("conflict")).toBe(false);
  });

  it("uses public short-name aliases and trip ownership when raw ids collide", () => {
    const root = mkdtempSync(join(tmpdir(), "gtfs-route-owner-test-"));
    const makeFeed = (sourceId: string, routes: string, trips: string, stopLat: number) => {
      const extracted = join(root, `raw/sources/${sourceId}/extracted`);
      mkdirSync(extracted, { recursive: true });
      writeFileSync(join(extracted, "routes.txt"), `route_id,agency_id,route_short_name,route_long_name\n${routes}\n`);
      writeFileSync(join(extracted, "trips.txt"), `route_id,service_id,trip_id,shape_id,direction_id\n${trips}\n`);
      writeFileSync(join(extracted, "stops.txt"), `stop_id,stop_name,stop_lat,stop_lon\nS,Stop,${stopLat},-73\n`);
      return snapshot({ snapshot_id: sourceId, kind: "gtfs_static", source_id: sourceId });
    };
    const rawCollision = makeFeed("raw-collision", "B1,A,BX1,Bronx Route", "B1,s,t1,,0", 41);
    const publicOwner = makeFeed("public-owner", "K1,A,B1,Brooklyn Route", "K1,s,t2,,0", 40);
    const selected = [rawCollision, publicOwner].map((operational) =>
      loadGtfsStaticSnapshot(operational, ["routes", "stops", "trips"], root, new Set(["B1"])));
    const index = buildGtfsCoordinateIndex(selected);
    expect(index.stopsByRoute.get("B1")?.get("S")?.stop_lat).toBe(40);
    expect(index.stopsByRoute.has("BX1")).toBe(false);
  });
});

describe("scheduled timepoint pattern contract", () => {
  it("streams only requested route/date windows and excludes unrelated rows", () => {
    const root = mkdtempSync(join(tmpdir(), "schedule-stream-test-"));
    const path = join(root, "source.csv");
    const rows = Array.from({ length: 20 }, (_, index) => scheduleRow({
      route_id: index % 2 === 0 ? "Q1" : "Q2",
      schedule_date: index < 10 ? "2025-06-27" : "2025-07-10",
      stop_id: index === 2 ? "S0" : `S${index}`,
      stop_name: index === 0 ? "Main, Street" : `Stop ${index}`,
      schedule_time: index === 2 ? "2025-06-27T07:00:00.000" : "2025-06-27T06:00:00.000",
      block_id: `block-${index}`,
    }));
    const cell = (value: unknown) => {
      const text = value === null ? "" : String(value);
      return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const lines = rows.map((row) => BUS_SCHEDULE_COLUMNS.map((field) => cell(row[field])).join(","));
    writeFileSync(path, `${BUS_SCHEDULE_COLUMNS.join(",")}\n${lines.join("\n")}\n`);
    const loaded = loadBusScheduleCsv(path, [{ route_id: "Q1", start: "2025-06-26", end: "2025-06-28" }]);
    expect(loaded).toHaveLength(5);
    expect(loaded.every((row) => row.route_id === "Q1" && row.schedule_date === "2025-06-27")).toBe(true);
    expect(loaded[0]?.stop_name).toBe("Main, Street");
    const patterns = loadBusSchedulePatternCsv(path, [{ route_id: "Q1", start: "2025-06-26", end: "2025-06-28" }]);
    expect(patterns).toHaveLength(4);
    expect(patterns.find((row) => row.stop_id === "S0")?.schedule_time).toBe("2025-06-27T06:00:00.000");
  });

  it("parses escaped quotes when a quoted field crosses the 8MiB chunk boundary", () => {
    const root = mkdtempSync(join(tmpdir(), "schedule-chunk-boundary-test-"));
    const path = join(root, "source.csv");
    const row = scheduleRow({ route_id: "Q1", schedule_date: "2025-06-27" });
    const header = `${BUS_SCHEDULE_COLUMNS.join(",")}\n`;
    const stopNameIndex = BUS_SCHEDULE_COLUMNS.indexOf("stop_name");
    const values = BUS_SCHEDULE_COLUMNS.map((field) => String(row[field] ?? ""));
    const rowPrefix = `${values.slice(0, stopNameIndex).join(",")},"`;
    const firstEscapedQuoteOffset = 8 * 1024 * 1024 - 1;
    const paddingLength = firstEscapedQuoteOffset - Buffer.byteLength(header + rowPrefix);
    expect(paddingLength).toBeGreaterThan(0);
    const encodedName = `"${"x".repeat(paddingLength)}""tail"`;
    const csv = `${header}${values.slice(0, stopNameIndex).join(",")},${encodedName},${values.slice(stopNameIndex + 1).join(",")}\n`;
    writeFileSync(path, csv);
    const first = loadBusScheduleCsv(path, [{ route_id: "Q1", start: "2025-06-27", end: "2025-06-27" }]);
    const second = loadBusScheduleCsv(path, [{ route_id: "Q1", start: "2025-06-27", end: "2025-06-27" }]);
    expect(first[0]?.stop_name.endsWith('"tail')).toBe(true);
    expect(first[0]?.stop_name).toBe(second[0]?.stop_name);
  });

  it("groups by direction+shape, not block, and chooses the longest deterministic pattern", () => {
    const rows: BusScheduleRow[] = [];
    for (const block of ["block-1", "block-2"]) {
      for (let sequence = 1; sequence <= 5; sequence += 1) {
        rows.push(scheduleRow({ block_id: block, shape_id: "long", stop_sequence: sequence, stop_id: `L${sequence}`, origin: sequence === 1 ? "1" : "0" }));
      }
      for (let sequence = 1; sequence <= 3; sequence += 1) {
        rows.push(scheduleRow({ block_id: block, shape_id: "short", stop_sequence: sequence, stop_id: `S${sequence}`, origin: sequence === 1 ? "1" : "0" }));
      }
    }
    rows.push(...[1, 2, 3, 4].map((sequence) => scheduleRow({ direction: "S", shape_id: "south", stop_sequence: sequence, stop_id: `D${sequence}` })));
    expect(rows).toHaveLength(20);
    const patterns = scheduleStopChains(rows, "Q1", "2025-06-29");
    expect(patterns).toHaveLength(3);
    expect(patterns.find((pattern) => pattern.shape_id === "long")?.stops).toHaveLength(5);
    expect(representativeScheduleChains(rows, "Q1", "2025-06-29").map((pattern) => pattern.shape_id)).toEqual(["long", "south"]);
  });

  it("keeps before and after service-date selection on their requested side", () => {
    const rows = [
      scheduleRow({ schedule_date: "2025-06-27" }),
      scheduleRow({ schedule_date: "2025-06-29" }),
    ];
    expect(nearestScheduleDate(rows, "Q1", "2025-06-28", 28, "on_or_before")?.date).toBe("2025-06-27");
    expect(nearestScheduleDate(rows, "Q1", "2025-06-28", 28, "on_or_after")?.date).toBe("2025-06-29");
    expect(nearestScheduleDate([rows[1]!], "Q1", "2025-06-28", 28, "on_or_before")).toBeUndefined();
    expect(nearestScheduleDate([rows[0]!], "Q1", "2025-06-28", 28, "on_or_after")).toBeUndefined();
  });

  it("pins the request universe to imported tracker date fields and requires every bounded route chunk", () => {
    const universe = buildScheduleRequestUniverse();
    expect(universe.generated_from.tracker_input).toBe("data/quality/study-readiness/v1/tracker-rc26-input.json");
    expect(universe.generated_from.tracker_input_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(universe.windows.some((window) => window.route_ids.includes("Q61") && window.start <= "2025-06-29" && window.end >= "2025-06-29")).toBe(true);

    const window: ScheduleRequestWindow = {
      year: 2025,
      dataset_id: "t4bz-xqa9",
      route_ids: Array.from({ length: 45 }, (_, index) => `Q${String(index + 1).padStart(2, "0")}`),
      start: "2025-06-01",
      end: "2025-06-07",
      reasons: ["fixture"],
      candidate_ids: ["fixture"],
    };
    const chunks = routeChunks(window.route_ids);
    expect(chunks.map((chunk) => chunk.length)).toEqual([20, 20, 5]);
    const receipts = chunks.map((routeIds, routeChunkIndex): QueryReceipt => ({
      window_start: window.start,
      window_end: window.end,
      route_ids: routeIds,
      route_chunk_index: routeChunkIndex,
      where: "fixture",
      order: "fixture",
      page_size: 50_000,
      page_count: 1,
      row_count: 1,
    }));
    expect(() => assertCompleteRouteChunks(window, receipts)).not.toThrow();
    expect(() => assertCompleteRouteChunks(window, receipts.slice(0, 2))).toThrow("incomplete route chunk receipts");
  });

  it("pins the 25-column contract to official schema-response hashes for all four datasets", () => {
    const metadata = JSON.parse(readFileSync(join(process.cwd(), "data/reference/operational/bus-schedule-field-metadata.json"), "utf8")) as {
      columns: Array<{ field_name: string }>;
      datasets: Array<{ dataset_id: string; schema_response_sha256: string }>;
    };
    expect(metadata.columns.map((column) => column.field_name)).toEqual([...BUS_SCHEDULE_COLUMNS]);
    expect(metadata.datasets.map((dataset) => dataset.dataset_id)).toEqual(["x5mx-4rfs", "udt9-hvjq", "t4bz-xqa9", "4fnn-qsea"]);
    expect(metadata.datasets.every((dataset) => /^[a-f0-9]{64}$/u.test(dataset.schema_response_sha256))).toBe(true);
  });

  it("reuses the exact registered X64 supplemental snapshot and rejects identity drift", () => {
    const supplement = snapshot({
      snapshot_id: X64_PREDECESSOR_SNAPSHOT_ID,
      kind: "bus_schedules_year",
      source_id: "mta_bus_schedules_2025_x64_predecessor_2026_07_23",
      label: "2025-x64-predecessor-2026-07-23",
    });
    expect(registeredX64PredecessorSnapshot([supplement])).toBe(supplement);
    expect(() => registeredX64PredecessorSnapshot([{ ...supplement, source_id: "changed" }])).toThrow("identity metadata mismatch");
    const root = mkdtempSync(join(tmpdir(), "x64-malformed-registry-test-"));
    const registryPath = join(root, "snapshots.json");
    writeFileSync(registryPath, "{not-json");
    expect(() => loadRegisteredX64PredecessorSnapshot(registryPath)).toThrow();
  });
});

describe("lane and schedule computation boundaries", () => {
  it("groups lane identity by raw street+borough while retaining divergent facility", () => {
    const root = mkdtempSync(join(tmpdir(), "lane-street-test-"));
    const sourceDir = join(root, "raw/sources/lanes");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "source.geojson"), JSON.stringify({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { street: "RAW STREET", facility: "Program Facility", boro: "Q", direction: "NB" },
        geometry: { type: "LineString", coordinates: [[-73, 40], [-73, 40.01]] },
      }],
    }));
    const features = loadBusLaneSnapshot(snapshot({ snapshot_id: "lanes", kind: "dot_bus_lanes", source_id: "lanes" }), root);
    const group = groupBusLaneFeatures(features)[0]!;
    expect(group.lane_group_id).toBe("Q|RAW STREET");
    expect(group.street).toBe("RAW STREET");
    expect(group.facility).toBe("Program Facility");
  });

  it("runs the disk-backed engine across confirmed, marginal, no-traversal, and ambiguous candidates deterministically", () => {
    const root = mkdtempSync(join(tmpdir(), "lane-engine-test-"));
    const extracted = join(root, "raw/sources/gtfs/extracted");
    mkdirSync(extracted, { recursive: true });
    const shapeLines = [
      "c,40,-73,1", "c,40.01,-73,2", "c,40.02,-73,3",
      "n,40,-73.02,1", "n,40.01,-73.02,2", "n,40.02,-73.02,3",
      ...Array.from({ length: 101 }, (_, index) => `m,${40 + index * 0.0002},-73.1,${index + 1}`),
    ];
    const gtfsFiles: Record<string, string> = {
      "routes.txt": "route_id,agency_id,route_short_name,route_long_name\nC,A,C,Confirmed\nM,A,M,Marginal\nN,A,N,None\n",
      "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nC0,C Start,40,-73\nC1,C End,40.02,-73\nM0,M Start,40,-73.1\nM1,M End,40.02,-73.1\nN0,N Start,40,-73.02\nN1,N End,40.02,-73.02\n",
      "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\ntc,06:00:00,06:00:00,C0,1\ntc,06:20:00,06:20:00,C1,2\ntm,06:00:00,06:00:00,M0,1\ntm,06:20:00,06:20:00,M1,2\ntn,06:00:00,06:00:00,N0,1\ntn,06:20:00,06:20:00,N1,2\n",
      "shapes.txt": `shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n${shapeLines.join("\n")}\n`,
      "trips.txt": "route_id,service_id,trip_id,shape_id,direction_id\nC,WK,tc,c,0\nM,WK,tm,m,0\nN,WK,tn,n,0\n",
    };
    for (const [name, contents] of Object.entries(gtfsFiles)) writeFileSync(join(extracted, name), contents);

    const laneDir = join(root, "raw/sources/lanes");
    mkdirSync(laneDir, { recursive: true });
    writeFileSync(join(laneDir, "source.geojson"), JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { facility: "C Street", boro: "M", direction: "NB" }, geometry: { type: "LineString", coordinates: [[-73, 40], [-73, 40.02]] } },
        { type: "Feature", properties: { facility: "M Street", boro: "M", direction: "NB" }, geometry: { type: "LineString", coordinates: [[-73.1, 40], [-73.1, 40.0006]] } },
      ],
    }));

    const scheduleDir = join(root, "raw/sources/schedules");
    mkdirSync(scheduleDir, { recursive: true });
    const ambiguousRows = [
      scheduleRow({ route_id: "A", schedule_date: "2025-06-01", stop_id: "MISSING1", stop_sequence: 1, shape_id: "a" }),
      scheduleRow({ route_id: "A", schedule_date: "2025-06-01", stop_id: "MISSING2", stop_sequence: 2, shape_id: "a" }),
      scheduleRow({ route_id: "A", schedule_date: "2025-06-01", stop_id: "MISSING3", stop_sequence: 1, shape_id: "b" }),
      scheduleRow({ route_id: "A", schedule_date: "2025-06-01", stop_id: "MISSING4", stop_sequence: 2, shape_id: "b" }),
    ];
    const csvCell = (value: unknown) => value === null ? "" : String(value);
    writeFileSync(join(scheduleDir, "source.csv"), `${BUS_SCHEDULE_COLUMNS.join(",")}\n${ambiguousRows.map((row) => BUS_SCHEDULE_COLUMNS.map((field) => csvCell(row[field])).join(",")).join("\n")}\n`);

    const registryDir = join(root, "data/reference/operational");
    mkdirSync(registryDir, { recursive: true });
    const registry: OperationalSnapshotRegistry = {
      schema_version: OPERATIONAL_REFERENCE_SCHEMA_VERSION,
      registry_id: OPERATIONAL_REFERENCE_REGISTRY_ID,
      supporting_artifacts: [],
      snapshots: [
        snapshot({ snapshot_id: "fixture-gtfs", kind: "gtfs_static", source_id: "gtfs", service_window: { start: "2026-01-01", end: "2026-12-31" } }),
        snapshot({ snapshot_id: "fixture-lanes", kind: "dot_bus_lanes", source_id: "lanes" }),
        snapshot({ snapshot_id: "fixture-schedule", kind: "bus_schedules_year", source_id: "schedules", label: "2025-candidate-windows", dataset_id: "fixture" }),
      ],
    };
    const registryPath = join(registryDir, "snapshots.json");
    writeFileSync(registryPath, `${stableJson(registry as unknown as JsonValue)}\n`);
    writeFileSync(join(root, "bridge.jsonl"), ["confirm", "marginal", "none", "ambiguous"].map((id) => JSON.stringify({ candidate_id: id, downstream_disposition: "source_fixable_bus_lane_occurrence_identity" })).join("\n") + "\n");
    writeFileSync(join(root, "tracker.json"), JSON.stringify({ rows: [
      { candidate_id: "confirm", route_id: "C", implementation_date: "2026-06-01", date_precision: "day" },
      { candidate_id: "marginal", route_id: "M", implementation_date: "2026-06-01", date_precision: "day" },
      { candidate_id: "none", route_id: "N", implementation_date: "2026-06-01", date_precision: "day" },
      { candidate_id: "ambiguous", route_id: "A", implementation_date: "2025-06-01", date_precision: "day" },
    ] }));
    const selection = {
      gtfsSnapshotIds: ["fixture-gtfs"],
      laneSnapshotId: "fixture-lanes",
      scheduleSnapshotIds: ["fixture-schedule"],
      candidateLedgerPath: "bridge.jsonl",
      trackerInputPath: "tracker.json",
      rootDir: root,
      registryPath,
    };
    const first = writeLaneTraversalDossier(selection, join(root, "first.jsonl"));
    const second = writeLaneTraversalDossier(selection, join(root, "second.jsonl"));
    expect(new Set(first.rows.map((row) => row.verdict_class))).toEqual(new Set(["traversal_confirmed", "traversal_marginal", "no_traversal", "geometry_ambiguous"]));
    expect(new Set(first.rows.map((row) => row.candidate_id)).size).toBe(4);
    expect(first.rows.filter((row) => row.candidate_id === "ambiguous").map((row) => row.path_identity)).toEqual(["a", "b"]);
    expect(first.sha256).toBe(second.sha256);
    expect(readFileSync(first.path, "utf8")).toBe(readFileSync(second.path, "utf8"));
  });

  it("uses oriented bearing against cardinal lane direction and fails historical negatives closed", () => {
    expect(orientedSegmentCompatible({ lat: 40, lon: -73 }, { lat: 40.01, lon: -73 }, "NB")).toBe(true);
    expect(orientedSegmentCompatible({ lat: 40, lon: -73 }, { lat: 40.01, lon: -73 }, "SB")).toBe(false);
    expect(negativeTraversalVerdictForPathSource("gtfs_shape")).toBe("no_traversal");
    expect(negativeTraversalVerdictForPathSource("historical_schedule_timepoint_pattern")).toBe("geometry_ambiguous");
    expect(pointToSegmentMeters({ lat: 40.005, lon: -73 }, { lat: 40, lon: -73 }, { lat: 40.01, lon: -73 })).toBeLessThan(0.01);
    const cases = [
      classifyTraversalOverlap({ contiguous: true, overlapMeters: 805, pathMeters: 10_000 }),
      classifyTraversalOverlap({ contiguous: true, overlapMeters: 200, pathMeters: 1_000 }),
      classifyTraversalOverlap({ contiguous: true, overlapMeters: 50, pathMeters: 1_000 }),
      classifyTraversalOverlap({ contiguous: false, overlapMeters: 2_000, pathMeters: 3_000 }),
    ];
    expect(cases).toEqual(["traversal_confirmed", "traversal_confirmed", "traversal_marginal", "geometry_ambiguous"]);
    expect(cases).toEqual([
      classifyTraversalOverlap({ contiguous: true, overlapMeters: 805, pathMeters: 10_000 }),
      classifyTraversalOverlap({ contiguous: true, overlapMeters: 200, pathMeters: 1_000 }),
      classifyTraversalOverlap({ contiguous: true, overlapMeters: 50, pathMeters: 1_000 }),
      classifyTraversalOverlap({ contiguous: false, overlapMeters: 2_000, pathMeters: 3_000 }),
    ]);
  });

  it("does not credit a sparse timepoint span when only its midpoint touches a short lane", () => {
    const overlap = overlapWithLane({
      direction: "N",
      pathIdentity: "fixture",
      points: [{ lat: 40, lon: -73 }, { lat: 40.01, lon: -73 }],
      stopIds: ["A", "B"],
      coverage: 1,
      source: "historical_schedule_timepoint_pattern",
    }, {
      lane_group_id: "M|Fixture",
      facility: "Fixture",
      street: "Fixture Street",
      borough: "M",
      direction: "NB",
      opened: "2020",
      features: [{
        feature_id: "short",
        lane_group_id: "M|Fixture",
        facility: "Fixture",
        street: "Fixture Street",
        borough: "M",
        direction: "NB",
        opened: "2020",
        attributes: {},
        lines: [[{ lat: 40.0049, lon: -73 }, { lat: 40.0051, lon: -73 }]],
      }],
    });
    expect(overlap.partialAlignment).toBe(true);
    expect(overlap.overlapMeters).toBe(0);
  });

  it("marks separated matched runs as non-contiguous geometry", () => {
    const overlap = overlapWithLane({
      direction: "N",
      pathIdentity: "fixture",
      points: [
        { lat: 40, lon: -73 },
        { lat: 40.001, lon: -73 },
        { lat: 40.002, lon: -73 },
        { lat: 40.003, lon: -73 },
      ],
      stopIds: ["A", "B", "C", "D"],
      coverage: 1,
      source: "historical_schedule_timepoint_pattern",
    }, {
      lane_group_id: "M|Separated",
      facility: "Separated",
      street: "Separated Street",
      borough: "M",
      direction: "NB",
      opened: "2020",
      features: [
        {
          feature_id: "first",
          lane_group_id: "M|Separated",
          facility: "Separated",
          street: "Separated Street",
          borough: "M",
          direction: "NB",
          opened: "2020",
          attributes: {},
          lines: [[{ lat: 40, lon: -73 }, { lat: 40.001, lon: -73 }]],
        },
        {
          feature_id: "second",
          lane_group_id: "M|Separated",
          facility: "Separated",
          street: "Separated Street",
          borough: "M",
          direction: "NB",
          opened: "2020",
          attributes: {},
          lines: [[{ lat: 40.002, lon: -73 }, { lat: 40.003, lon: -73 }]],
        },
      ],
    });
    expect(overlap.contiguous).toBe(false);
    expect(classifyTraversalOverlap(overlap)).toBe("geometry_ambiguous");
  });

  it("joins adjacent raw features in one lane group but rejects a group gap", () => {
    const path = {
      direction: "N",
      pathIdentity: "fixture",
      points: [{ lat: 40, lon: -73 }, { lat: 40.01, lon: -73 }],
      stopIds: ["A", "B"],
      coverage: 1,
      source: "historical_schedule_timepoint_pattern" as const,
    };
    const group = (lines: Array<Array<{ lat: number; lon: number }>>) => ({
      lane_group_id: "M|Joined",
      facility: "Joined",
      street: "Joined Street",
      borough: "M",
      direction: "NB",
      opened: "2020",
      features: lines.map((line, index) => ({
        feature_id: String(index), lane_group_id: "M|Joined", facility: "Joined", street: "Joined Street",
        borough: "M", direction: "NB", opened: "2020", attributes: {}, lines: [line],
      })),
    });
    const adjacent = overlapWithLane(path, group([
      [{ lat: 40, lon: -73 }, { lat: 40.005, lon: -73 }],
      [{ lat: 40.005, lon: -73 }, { lat: 40.01, lon: -73 }],
    ]));
    expect(adjacent.contiguous).toBe(true);
    expect(adjacent.overlapMeters).toBeGreaterThan(1_000);
    expect(classifyTraversalOverlap(adjacent)).toBe("traversal_confirmed");

    const gapped = overlapWithLane(path, group([
      [{ lat: 40, lon: -73 }, { lat: 40.003, lon: -73 }],
      [{ lat: 40.007, lon: -73 }, { lat: 40.01, lon: -73 }],
    ]));
    expect(gapped.partialAlignment).toBe(true);
    expect(gapped.overlapMeters).toBe(0);
    const gappedVerdict = gapped.partialAlignment && gapped.overlapMeters === 0
      ? "geometry_ambiguous" : classifyTraversalOverlap(gapped);
    expect(gappedVerdict).toBe("geometry_ambiguous");
  });

  it("reports a removed scheduled timepoint with its name and last-seen date", () => {
    const before = ["A", "B", "C"].map((stopId, index) => scheduleRow({ stop_id: stopId, stop_name: `Stop ${stopId}`, stop_sequence: index + 1 }));
    const after = [before[0]!, before[2]!];
    expect(compareTimepointPatterns(before, after, "2025-06-27", "2025-06-30").timepoint_stops_removed).toEqual([
      { stop_id: "B", stop_name: "Stop B", last_seen: "2025-06-27" },
    ]);
  });

  it("runs the disk-backed schedule-diff engine with correspondence and byte-identical writes", () => {
    const root = mkdtempSync(join(tmpdir(), "schedule-engine-test-"));
    const gtfsDir = join(root, "raw/sources/gtfs/extracted");
    const scheduleDir = join(root, "raw/sources/schedules");
    const supplementDir = join(root, "raw/sources/schedule-supplement");
    mkdirSync(gtfsDir, { recursive: true });
    mkdirSync(scheduleDir, { recursive: true });
    mkdirSync(supplementDir, { recursive: true });
    writeFileSync(join(gtfsDir, "routes.txt"), "route_id,agency_id,route_short_name,route_long_name\nR,A,R,Route\nOLD,A,OLD,Old Route\n");
    writeFileSync(join(gtfsDir, "trips.txt"), "route_id,service_id,trip_id,shape_id,direction_id\nR,s,r,,0\nOLD,s,old,,0\n");
    writeFileSync(join(gtfsDir, "stops.txt"), "stop_id,stop_name,stop_lat,stop_lon\nA,Alpha,40,-73\nB,Beta,40.001,-73\nC,Gamma,40.002,-73\nX,Xray,40.001,-73.001\nY,Yankee,40.001,-72.999\nD,Delta,40.003,-73\n");
    const before = ["A", "B", "C"].flatMap((stopId, index) => [
      scheduleRow({ route_id: "R", schedule_date: "2025-06-27", stop_id: stopId, stop_name: `Stop ${stopId}`, stop_sequence: index + 1, schedule_time: `2025-06-27T06:${String(index * 5).padStart(2, "0")}:00.000`, block_id: "r-1", shape_id: "before", origin: index === 0 ? "1" : "0" }),
      scheduleRow({ route_id: "R", schedule_date: "2025-06-27", stop_id: stopId, stop_name: `Stop ${stopId}`, stop_sequence: index + 1, schedule_time: `2025-06-27T06:${String(10 + index * 5).padStart(2, "0")}:00.000`, block_id: "r-2", shape_id: "before", origin: index === 0 ? "1" : "0" }),
    ]);
    const predecessor = ["A", "B", "C"].map((stopId, index) => scheduleRow({
      route_id: "OLD", schedule_date: "2025-06-27", stop_id: stopId, stop_name: `Stop ${stopId}`,
      stop_sequence: index + 1, block_id: "old", shape_id: "old", origin: index === 0 ? "1" : "0",
    }));
    const after = ["A", "X", "C", "D"].flatMap((stopId, index) => [
      scheduleRow({ route_id: "R", schedule_date: "2025-06-30", stop_id: stopId, stop_name: `Stop ${stopId}`, stop_sequence: index + 1, schedule_time: `2025-06-30T06:${String(index * 5).padStart(2, "0")}:00.000`, block_id: "new-1", shape_id: "after", origin: index === 0 ? "1" : "0" }),
    ]).concat(["A", "Y", "C"].map((stopId, index) =>
      scheduleRow({ route_id: "R", schedule_date: "2025-06-30", stop_id: stopId, stop_name: `Stop ${stopId}`, stop_sequence: index + 1, schedule_time: `2025-06-30T06:${String(30 + index * 5).padStart(2, "0")}:00.000`, block_id: "new-branch", shape_id: "after-branch", origin: index === 0 ? "1" : "0" })));
    const allRows = [...before, ...after];
    const csv = `${BUS_SCHEDULE_COLUMNS.join(",")}\n${allRows.map((row) => BUS_SCHEDULE_COLUMNS.map((field) => String(row[field] ?? "")).join(",")).join("\n")}\n`;
    writeFileSync(join(scheduleDir, "source.csv"), csv);
    const supplementRows = [...predecessor, after[0]!]; // duplicate after row proves exact-row union dedupe.
    writeFileSync(join(supplementDir, "source.csv"), `${BUS_SCHEDULE_COLUMNS.join(",")}\n${supplementRows.map((row) => BUS_SCHEDULE_COLUMNS.map((field) => String(row[field] ?? "")).join(",")).join("\n")}\n`);
    const registryDir = join(root, "data/reference/operational");
    mkdirSync(registryDir, { recursive: true });
    const registry: OperationalSnapshotRegistry = {
      schema_version: OPERATIONAL_REFERENCE_SCHEMA_VERSION,
      registry_id: OPERATIONAL_REFERENCE_REGISTRY_ID,
      supporting_artifacts: [],
      snapshots: [
        snapshot({ snapshot_id: "fixture-gtfs", kind: "gtfs_static", source_id: "gtfs" }),
        snapshot({
          snapshot_id: "fixture-schedule", kind: "bus_schedules_year", source_id: "schedules", label: "2025-candidate-windows",
          artifacts: [{ path: "raw/sources/schedules/receipt.json", sha256: "0".repeat(64), bytes: 0 }],
        }),
        snapshot({
          snapshot_id: "fixture-schedule-supplement", kind: "bus_schedules_year", source_id: "schedule-supplement", label: "2025-old-predecessor",
          artifacts: [{ path: "raw/sources/schedule-supplement/receipt.json", sha256: "1".repeat(64), bytes: 0 }],
        }),
      ],
    };
    const registryPath = join(registryDir, "snapshots.json");
    writeFileSync(registryPath, `${stableJson(registry as unknown as JsonValue)}\n`);
    const input = {
      routeId: "R", beforeRouteId: "OLD", beforeDate: "2025-06-27", afterDate: "2025-06-30", correspondRoutes: ["OLD"],
      gtfsSnapshotIds: ["fixture-gtfs"], scheduleSnapshotIds: ["fixture-schedule", "fixture-schedule-supplement"], rootDir: root, registryPath,
    };
    const first = writeScheduleDiffDossier({ ...input, outputPath: join(root, "first.json") });
    const second = writeScheduleDiffDossier({ ...input, outputPath: join(root, "second.json") });
    expect(first.dossier.direction_diffs[0]?.timepoint_stops_removed.map((stop) => stop.stop_id)).toEqual(["B"]);
    expect(first.dossier.direction_diffs[0]?.timepoint_stops_added.map((stop) => stop.stop_id)).toEqual(["X", "D", "Y"]);
    expect(first.dossier.direction_diffs[0]?.shape_patterns_after.map((pattern) => pattern.shape_id)).toEqual(["after", "after-branch"]);
    expect(first.dossier.direction_diffs[0]?.variant_disagreement).toBe(true);
    expect(first.dossier.before_route_id).toBe("OLD");
    expect(first.dossier.after_route_id).toBe("R");
    expect(first.dossier.direction_diffs[0]?.trips_per_period_after[0]?.trip_count).toBe(2);
    expect(first.dossier.correspondence_segments[0]?.boundary_stops.map((stop) => stop.stop_id)).toEqual(["A", "C"]);
    expect(first.dossier.correspondence_results).toEqual([{
      old_route_id: "OLD", predecessor_service_date: "2025-06-27", predecessor_shape_count: 1,
      successor_shape_count: 2, exact_shared_shape_pair_count: 2, status: "matched_exact_timepoint_ids",
    }]);
    expect(first.dossier.query_receipts[0]?.sha256).toBe("0".repeat(64));
    expect(first.dossier.query_receipts).toHaveLength(2);
    expect(first.sha256).toBe(second.sha256);
    expect(readFileSync(first.path, "utf8")).toBe(readFileSync(second.path, "utf8"));
  });

  it("reports an extension and its named endpoint deterministically", () => {
    const before = ["A", "B"].map((stopId, index) => scheduleRow({ stop_id: stopId, stop_name: `Stop ${stopId}`, stop_sequence: index + 1 }));
    const after = [...before, scheduleRow({ stop_id: "C", stop_name: "Stop C", stop_sequence: 3 })];
    const first = compareTimepointPatterns(before, after, "2025-06-27", "2025-06-30");
    const second = compareTimepointPatterns(before, after, "2025-06-27", "2025-06-30");
    expect(first.timepoint_stops_added).toEqual([{ stop_id: "C", stop_name: "Stop C", first_seen: "2025-06-30" }]);
    expect(first.endpoints_after.at(-1)).toEqual({ stop_id: "C", stop_name: "Stop C" });
    expect(stableJson(first as unknown as JsonValue)).toBe(stableJson(second as unknown as JsonValue));
  });

  it("reports both sides of a timepoint reroute", () => {
    const make = (ids: string[]) => ids.map((stopId, index) => scheduleRow({ stop_id: stopId, stop_name: `Stop ${stopId}`, stop_sequence: index + 1 }));
    const changes = compareTimepointPatterns(make(["A", "B", "C"]), make(["A", "X", "C"]), "2025-06-27", "2025-06-30");
    expect(changes.timepoint_stops_removed.map((stop) => stop.stop_id)).toEqual(["B"]);
    expect(changes.timepoint_stops_added.map((stop) => stop.stop_id)).toEqual(["X"]);
  });

  it("computes deterministic predecessor correspondence", () => {
    expect(longestCommonStopSubsequence(["A", "B", "C", "D"], ["A", "B", "X", "D", "E"])).toEqual(["A", "B", "D"]);
  });

  it("computes explicit scheduled frequency and headway changes", () => {
    const rows = [0, 10, 20].map((minute) => scheduleRow({
      schedule_time: `2025-06-29T06:${String(minute).padStart(2, "0")}:00.000`,
      block_id: `block-${minute}`,
    }));
    const am = periodStatistics(rows).find((period) => period.period === "am_peak");
    expect(am).toEqual({ period: "am_peak", trip_count: 3, mean_headway_minutes: 10 });
    const simultaneous = periodStatistics([
      scheduleRow({ schedule_time: "2025-06-29T06:00:00.000", block_id: "block-a" }),
      scheduleRow({ schedule_time: "2025-06-29T06:00:00.000", block_id: "block-b" }),
    ]).find((period) => period.period === "am_peak");
    expect(simultaneous).toEqual({ period: "am_peak", trip_count: 2, mean_headway_minutes: 0 });
  });
});
