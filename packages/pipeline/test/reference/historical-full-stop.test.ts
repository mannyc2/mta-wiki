import { describe, expect, it } from "bun:test";
import {
  compareFullStopPatterns,
  fullStopPatternsForDate,
  historicalFullStopReplayHash,
  type HistoricalFullStopPattern,
} from "../../src/reference/historical-full-stop";
import type { GtfsStaticSnapshot } from "../../src/reference/gtfs-static";

function pattern(
  patternId: string,
  routeId: string,
  stopIds: readonly string[],
  stopNames: readonly string[] = stopIds,
): HistoricalFullStopPattern {
  return {
    pattern_id: patternId,
    snapshot_id: `snapshot-${patternId}`,
    service_date: "2025-06-30",
    route_id: routeId,
    direction_id: "0",
    trip_count: 1,
    trip_ids: [`trip-${patternId}`],
    shape_ids: [`shape-${patternId}`],
    headsigns: ["Revenue"],
    stops: stopIds.map((stop_id, index) => ({ stop_id, stop_name: stopNames[index] ?? "" })),
    period_trip_counts: [{ period: "am_peak", trip_count: 1 }],
  };
}

function snapshotFixture(): GtfsStaticSnapshot {
  return {
    snapshot: {
      snapshot_id: "fixture-snapshot",
      kind: "gtfs_static",
      source_id: "fixture_source",
      label: "fixture",
      retrieved_at: "2025-06-30T00:00:00Z",
      source_url: "https://example.test/official.zip",
      service_window: { start: "2025-06-01", end: "2025-07-31" },
      artifacts: [],
    },
    routes: [{
      route_id: "QM44",
      agency_id: "MTABC",
      route_short_name: "QM44",
      route_long_name: "Fixture",
    }],
    stops: [
      { stop_id: "A", stop_name: "Alpha", stop_lat: 40, stop_lon: -73 },
      { stop_id: "N", stop_name: "Non-revenue waypoint", stop_lat: 40.1, stop_lon: -73.1 },
      { stop_id: "B", stop_name: "Beta", stop_lat: 40.2, stop_lon: -73.2 },
      { stop_id: "C", stop_name: "Charlie", stop_lat: 40.3, stop_lon: -73.3 },
      { stop_id: "D", stop_name: "Delta", stop_lat: 40.4, stop_lon: -73.4 },
    ],
    trips: [
      {
        route_id: "QM44",
        service_id: "weekday",
        trip_id: "revenue",
        shape_id: "revenue-shape",
        direction_id: "0",
        trip_headsign: "Midtown",
      },
      {
        route_id: "QM44",
        service_id: "weekday",
        trip_id: "deadhead",
        shape_id: "deadhead-shape",
        direction_id: "0",
        trip_headsign: "NOT IN SERVICE",
      },
    ],
    stop_times: [
      {
        trip_id: "revenue",
        stop_id: "A",
        stop_sequence: 1,
        arrival_time: "07:00:00",
        departure_time: "07:00:00",
        pickup_type: "0",
        drop_off_type: "0",
      },
      {
        trip_id: "revenue",
        stop_id: "N",
        stop_sequence: 2,
        arrival_time: "07:05:00",
        departure_time: "07:05:00",
        pickup_type: "1",
        drop_off_type: "1",
      },
      {
        trip_id: "revenue",
        stop_id: "B",
        stop_sequence: 3,
        arrival_time: "07:10:00",
        departure_time: "07:10:00",
        pickup_type: "0",
        drop_off_type: "0",
      },
      {
        trip_id: "deadhead",
        stop_id: "C",
        stop_sequence: 1,
        arrival_time: "07:00:00",
        departure_time: "07:00:00",
      },
      {
        trip_id: "deadhead",
        stop_id: "D",
        stop_sequence: 2,
        arrival_time: "07:10:00",
        departure_time: "07:10:00",
      },
    ],
    shapes: [],
    calendar: [{
      service_id: "weekday",
      start_date: "20250601",
      end_date: "20250731",
      weekdays: [true, true, true, true, true, false, false],
    }],
    calendar_dates: [],
    agencies: [],
  };
}

describe("historical full-stop evidence", () => {
  it("filters non-revenue trips and non-revenue stop-time waypoints", () => {
    const patterns = fullStopPatternsForDate(snapshotFixture(), "2025-06-30", "QM44");
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.trip_ids).toEqual(["revenue"]);
    expect(patterns[0]?.stops.map((stop) => stop.stop_id)).toEqual(["A", "B"]);
    expect(patterns[0]?.period_trip_counts).toEqual([{ period: "am_peak", trip_count: 1 }]);
  });

  it("keeps identical stop IDs authoritative when stop names change", () => {
    const before = pattern("before", "X64", ["A", "B"], ["Old Alpha", "Beta"]);
    const after = pattern("after", "QM64", ["A", "B"], ["New Alpha", "Beta"]);
    const comparison = compareFullStopPatterns(before, after);
    expect(comparison.accepted).toBe(true);
    expect(comparison.classification).toBe("route_rename");
    expect(comparison.renamed_stops).toEqual([{
      stop_id: "A",
      before_stop_name: "Old Alpha",
      after_stop_name: "New Alpha",
    }]);
    expect(comparison.equivalences.every((row) => row.equivalence_basis === "identical_stop_id")).toBe(true);
  });

  it("rejects correspondence with only one exact shared boundary", () => {
    const comparison = compareFullStopPatterns(
      pattern("before", "Q34", ["A", "B"]),
      pattern("after", "Q61", ["A", "C"]),
    );
    expect(comparison.accepted).toBe(false);
    expect(comparison.boundary_stop_ids).toEqual([]);
    expect(comparison.rejection_reason).toBe("insufficient_two_boundary_identity");
  });

  it("emits the complete removed-stop set for a matched full chain", () => {
    const comparison = compareFullStopPatterns(
      pattern("before", "QM44", ["A", "B", "C", "D"]),
      pattern("after", "QM44", ["A", "D"]),
    );
    expect(comparison.accepted).toBe(true);
    expect(comparison.boundary_stop_ids).toEqual(["A", "D"]);
    expect(comparison.stops_removed.map((stop) => stop.stop_id)).toEqual(["B", "C"]);
    expect(comparison.stops_added).toEqual([]);
  });

  it("pins terminal extension boundaries without equating different terminal IDs", () => {
    const comparison = compareFullStopPatterns(
      pattern("before", "X64", ["A", "B", "C"]),
      pattern("after", "QM64", ["A", "B", "C", "D", "E"]),
    );
    expect(comparison.terminal_changes).toEqual([{
      end: "suffix",
      classification: "extension",
      shared_boundary_stop_id: "C",
      before_boundary_stop_ids: [],
      after_boundary_stop_ids: ["C", "E"],
      stops_added: [
        { stop_id: "D", stop_name: "D" },
        { stop_id: "E", stop_name: "E" },
      ],
      stops_removed: [],
    }]);
    expect(comparison.equivalences.some((row) => row.after_stop_id === "E")).toBe(false);
  });

  it("replays the same artifact set independently of input ordering", () => {
    const distribution = { accepted: 2, rejected: 1 };
    const left = historicalFullStopReplayHash("manifest", [
      { path: "b.json", sha256: "b" },
      { path: "a.json", sha256: "a" },
    ], distribution);
    const right = historicalFullStopReplayHash("manifest", [
      { path: "a.json", sha256: "a" },
      { path: "b.json", sha256: "b" },
    ], distribution);
    expect(left).toBe(right);
  });
});
