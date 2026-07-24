import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableHash, stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { MemberExtentRow } from "../quality/study-readiness-v1.js";
import {
  loadGtfsStaticSnapshot,
  type GtfsStaticSnapshot,
  type GtfsStop,
  type GtfsStopTime,
  type GtfsTrip,
} from "./gtfs-static.js";
import {
  fileSha256,
  loadOperationalSnapshotRegistry,
  mergeOperationalSnapshots,
  operationalSnapshotRegistrySha256,
  snapshotById,
  stageArchivedGtfsSnapshot,
  writeOperationalSnapshotRegistry,
  type ArchivedGtfsSnapshotInput,
  type OperationalSnapshot,
} from "./snapshot-registry.js";

export const HISTORICAL_FULL_STOP_SCHEMA_VERSION = 1 as const;
export const HISTORICAL_FULL_STOP_MANIFEST_ID = "plan-040-historical-full-stop-v1" as const;
export const HISTORICAL_FULL_STOP_ROOT = join(
  repoRoot,
  "data/quality/operational-reference/historical-full-stop",
);
export const HISTORICAL_FULL_STOP_ACQUISITION_RECEIPT_PATH = join(
  repoRoot,
  "data/quality/acquisition/receipts/plan-040-historical-full-stop-acquisition.json",
);
export const HISTORICAL_FULL_STOP_COMPANION_PATH = join(
  repoRoot,
  "data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl",
);
export const HISTORICAL_FULL_STOP_RISK_ARTIFACT_PATH = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk/plan-040-exemplar-evidence-drift.json",
);

const REQUIRED_GTFS_MEMBERS = [
  "calendar.txt",
  "calendar_dates.txt",
  "shapes.txt",
  "stops.txt",
  "stop_times.txt",
  "trips.txt",
] as const;

const SNAPSHOTS = {
  queens_before: {
    sourceId: "gtfs_static_20250615_queens_pre_qbnr",
    snapshotId: "gtfs-static-20250615-queens-pre-qbnr",
    label: "20250615T221051Z-pre-qbnr",
    title: "MTA Queens GTFS before the 2025 Queens Bus Network Redesign",
    documentDate: "2025-06-15",
    officialUrl: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_q.zip",
    archiveUrl: "https://web.archive.org/web/20250615221051id_/https://rrgtfsfeeds.s3.amazonaws.com/gtfs_q.zip",
    archiveTimestamp: "20250615221051",
    retrievedAt: "2025-06-15T22:10:51Z",
    expectedSha1: "c96466458c55036cd6feeadc291bf5951d6c3274",
    expectedSha256: "2ddcb01c8ceb6c822a28819570692af99491be0967412e130d7a26131820e6ef",
    provenanceUrls: [
      "https://www.transit.land/feeds/f-dr5x-mtanyctbusqueens/versions/c96466458c55036cd6feeadc291bf5951d6c3274",
      "https://mobilitydatabase.org/feeds/gtfs/mdb-520",
    ],
  },
  queens_after: {
    sourceId: "gtfs_static_20250626_queens_post_qbnr",
    snapshotId: "gtfs-static-20250626-queens-post-qbnr",
    label: "20250626T023726Z-post-qbnr",
    title: "MTA Queens GTFS after the 2025 Queens Bus Network Redesign",
    documentDate: "2025-06-26",
    officialUrl: "http://web.mta.info/developers/data/nyct/bus/google_transit_queens.zip",
    archiveUrl: "https://files.mobilitydatabase.org/mdb-520/mdb-520-202506260237/mdb-520-202506260237.zip",
    archiveTimestamp: "202506260237",
    retrievedAt: "2025-06-26T02:37:26.451748Z",
    expectedSha1: "c868290ddcd79c69712d809ece96d96dbad2c613",
    expectedSha256: "4db0f151dc541f2669dde72f104c7803b0f99258bc5d14278b04c8016ce7471a",
    provenanceUrls: [
      "https://www.transit.land/feeds/f-dr5x-mtanyctbusqueens/versions/c868290ddcd79c69712d809ece96d96dbad2c613",
      "https://mobilitydatabase.org/feeds/gtfs/mdb-520",
    ],
  },
  busco_before: {
    sourceId: "gtfs_static_20250625_busco_pre_qbnr",
    snapshotId: "gtfs-static-20250625-busco-pre-qbnr",
    label: "20250625T000529Z-pre-qbnr",
    title: "MTA Bus Company GTFS before the 2025 Queens Bus Network Redesign",
    documentDate: "2025-06-25",
    officialUrl: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_busco.zip",
    archiveUrl: "https://web.archive.org/web/20250625000529id_/https://rrgtfsfeeds.s3.amazonaws.com/gtfs_busco.zip",
    archiveTimestamp: "20250625000529",
    retrievedAt: "2025-06-25T00:05:29Z",
    expectedSha1: "a52f278150cd9bc03082f76fccd57f1c8c331d3c",
    expectedSha256: "eb4fd60a8dfa63bac5e4cd3204e61b48420b474724cac708d115615e547ff3e1",
    provenanceUrls: [
      "https://www.transit.land/feeds/f-dr5r-mtabc/versions/a52f278150cd9bc03082f76fccd57f1c8c331d3c",
      "https://mobilitydatabase.org/feeds/gtfs/mdb-510",
    ],
  },
  busco_after: {
    sourceId: "gtfs_static_20250626_busco_post_qbnr",
    snapshotId: "gtfs-static-20250626-busco-post-qbnr",
    label: "20250626T035401Z-post-qbnr",
    title: "MTA Bus Company GTFS after the 2025 Queens Bus Network Redesign",
    documentDate: "2025-06-26",
    officialUrl: "http://web.mta.info/developers/data/busco/google_transit.zip",
    archiveUrl: "https://files.mobilitydatabase.org/mdb-510/mdb-510-202506260354/mdb-510-202506260354.zip",
    archiveTimestamp: "202506260354",
    retrievedAt: "2025-06-26T03:54:01.879750Z",
    expectedSha1: "54653b3fafb5fabc5ab1c941780b871343138440",
    expectedSha256: "7d0e5651d5cc5c3ac86973dc664e16a05e9245bea156f566c39e71506128670e",
    provenanceUrls: [
      "https://www.transit.land/feeds/f-dr5r-mtabc/versions/54653b3fafb5fabc5ab1c941780b871343138440",
      "https://mobilitydatabase.org/feeds/gtfs/mdb-510",
    ],
  },
} as const;

export type HistoricalSnapshotKey = keyof typeof SNAPSHOTS;

export type HistoricalFullStopStageInput = Record<HistoricalSnapshotKey, string>;

export type HistoricalStop = {
  stop_id: string;
  stop_name: string;
};

export type HistoricalPeriodTripCount = {
  period: "am_peak" | "midday" | "pm_peak" | "evening" | "off_period" | "weekend";
  trip_count: number;
};

export type HistoricalFullStopPattern = {
  pattern_id: string;
  snapshot_id: string;
  service_date: string;
  route_id: string;
  direction_id: string;
  trip_count: number;
  trip_ids: string[];
  shape_ids: string[];
  headsigns: string[];
  stops: HistoricalStop[];
  period_trip_counts: HistoricalPeriodTripCount[];
};

export type HistoricalStopEquivalence = {
  before_stop_id: string;
  after_stop_id: string;
  before_stop_name: string;
  after_stop_name: string;
  equivalence_basis: "identical_stop_id";
};

export type HistoricalPatternComparison = {
  comparison_id: string;
  before_pattern_id: string;
  after_pattern_id: string;
  before_route_id: string;
  after_route_id: string;
  direction_id: string;
  accepted: boolean;
  rejection_reason: "insufficient_two_boundary_identity" | null;
  classification:
    | "unchanged"
    | "route_rename"
    | "stop_set_change"
    | "reroute"
    | "terminal_replacement"
    | "unresolved";
  boundary_stop_ids: string[];
  shared_stop_ids: string[];
  stops_added: HistoricalStop[];
  stops_removed: HistoricalStop[];
  renamed_stops: Array<{
    stop_id: string;
    before_stop_name: string;
    after_stop_name: string;
  }>;
  terminal_changes: Array<{
    end: "prefix" | "suffix";
    classification: "extension" | "truncation" | "replacement";
    shared_boundary_stop_id: string;
    before_boundary_stop_ids: string[];
    after_boundary_stop_ids: string[];
    stops_added: HistoricalStop[];
    stops_removed: HistoricalStop[];
  }>;
  equivalences: HistoricalStopEquivalence[];
};

export type HistoricalFullStopDossier = {
  schema_version: typeof HISTORICAL_FULL_STOP_SCHEMA_VERSION;
  dossier_id: string;
  family_id: "q61_lineage" | "qm44_stop_and_modality" | "qm64_x64_lineage";
  target_dates: { before: string[]; after: string[] };
  input_snapshot_ids: string[];
  patterns: HistoricalFullStopPattern[];
  comparisons: HistoricalPatternComparison[];
  provenance_rule: "identical_stop_ids_only_no_proximity_identity";
};

export type HistoricalFullStopWriteResult = {
  acquisition_receipt_path: string;
  acquisition_receipt_sha256: string;
  acquisition_manifest_path: string;
  acquisition_manifest_sha256: string;
  dossier_paths: string[];
  dossier_sha256s: string[];
  acceptance_manifest_path: string;
  acceptance_manifest_sha256: string;
  replay_hash: string;
  covered_candidate_count: number;
  verdict_distribution: Record<string, number>;
};

export type HistoricalCandidateFactRef = {
  dossier_path: string;
  dossier_sha256: string;
  fact_kind:
    | "lineage_correspondence"
    | "connection_remainder"
    | "period_trip_count_change"
    | "removed_stop_set"
    | "added_stop_set"
    | "terminal_change"
    | "route_rename";
  fact_id: string;
  direction: string;
  identifiers: string[];
};

export type HistoricalCandidateSupportRow = {
  occurrence_id: string;
  route_record_id: string;
  gtfs_route_id: "Q61" | "QM44" | "QM64";
  treatment_record_id: string;
  extent_id: string;
  current_extent_kind: string;
  current_missing_roles: string[];
  historical_evidence_verdict:
    | "bounded_segment_supported"
    | "lineage_supported"
    | "service_scope_supported"
    | "stop_set_supported"
    | "route_rename_supported";
  fact_refs: HistoricalCandidateFactRef[];
  decision_authority: false;
  occurrence_authority: false;
};

function writeImmutableJson(path: string, value: JsonValue): void {
  const contents = `${stableJson(value)}\n`;
  if (existsSync(path)) {
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`Refusing to overwrite frozen artifact ${relative(repoRoot, path)}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

function serviceDateCompact(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error(`Invalid service date ${date}`);
  return date.replaceAll("-", "");
}

function weekdayIndex(date: string): number {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid service date ${date}`);
  return (parsed.getUTCDay() + 6) % 7;
}

function activeServiceIds(snapshot: GtfsStaticSnapshot, date: string): Set<string> {
  const compact = serviceDateCompact(date);
  const weekday = weekdayIndex(date);
  const active = new Set(snapshot.calendar
    .filter((row) => compact >= row.start_date && compact <= row.end_date && row.weekdays[weekday])
    .map((row) => row.service_id));
  for (const exception of snapshot.calendar_dates) {
    if (exception.date !== compact) continue;
    const serviceId = exception.service_id;
    if (!serviceId) continue;
    if (exception.exception_type === "1") active.add(serviceId);
    if (exception.exception_type === "2") active.delete(serviceId);
  }
  return active;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function stopFor(stop: GtfsStop | undefined, stopId: string): HistoricalStop {
  return { stop_id: stopId, stop_name: stop?.stop_name ?? "" };
}

function firstTripMinute(stopTimes: readonly GtfsStopTime[]): number | undefined {
  const value = stopTimes[0]?.departure_time || stopTimes[0]?.arrival_time;
  const match = value?.match(/^(\d{1,2}):(\d{2})/u);
  if (!match) return undefined;
  const hour = Number(match[1]) % 24;
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;
  return hour * 60 + minute;
}

function periodFor(date: string, minute: number | undefined): HistoricalPeriodTripCount["period"] {
  const weekday = weekdayIndex(date);
  if (weekday >= 5) return "weekend";
  if (minute === undefined || minute < 6 * 60) return "off_period";
  if (minute < 10 * 60) return "am_peak";
  if (minute < 15 * 60) return "midday";
  if (minute < 19 * 60) return "pm_peak";
  return "evening";
}

function isRevenueTrip(trip: GtfsTrip): boolean {
  return !/(?:NOT\s+IN\s+SERVICE|DEADHEAD)/iu.test(trip.trip_headsign ?? "");
}

function revenueStopTimes(stopTimes: readonly GtfsStopTime[]): GtfsStopTime[] {
  return [...stopTimes]
    .filter((stopTime) => !(stopTime.pickup_type === "1" && stopTime.drop_off_type === "1"))
    .sort((left, right) =>
      left.stop_sequence - right.stop_sequence || left.stop_id.localeCompare(right.stop_id));
}

export function fullStopPatternsForDate(
  snapshot: GtfsStaticSnapshot,
  date: string,
  routeId: string,
): HistoricalFullStopPattern[] {
  const active = activeServiceIds(snapshot, date);
  const stops = new Map(snapshot.stops.map((stop) => [stop.stop_id, stop]));
  const stopTimesByTrip = new Map<string, GtfsStopTime[]>();
  for (const stopTime of snapshot.stop_times) {
    const values = stopTimesByTrip.get(stopTime.trip_id) ?? [];
    values.push(stopTime);
    stopTimesByTrip.set(stopTime.trip_id, values);
  }
  const groups = new Map<string, {
    direction_id: string;
    stops: HistoricalStop[];
    trip_ids: string[];
    shape_ids: string[];
    headsigns: string[];
    periods: HistoricalPeriodTripCount["period"][];
  }>();
  for (const trip of snapshot.trips) {
    if (trip.route_id !== routeId || !active.has(trip.service_id) || !isRevenueTrip(trip)) continue;
    const ordered = revenueStopTimes(stopTimesByTrip.get(trip.trip_id) ?? []);
    if (ordered.length < 2) continue;
    const chain = ordered.map((stopTime) => stopTime.stop_id);
    const key = `${trip.direction_id}\u0000${chain.join("\u0001")}`;
    const group = groups.get(key) ?? {
      direction_id: trip.direction_id,
      stops: chain.map((stopId) => stopFor(stops.get(stopId), stopId)),
      trip_ids: [],
      shape_ids: [],
      headsigns: [],
      periods: [],
    };
    group.trip_ids.push(trip.trip_id);
    group.shape_ids.push(trip.shape_id);
    group.headsigns.push(trip.trip_headsign ?? "");
    group.periods.push(periodFor(date, firstTripMinute(ordered)));
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const periodCounts = new Map<HistoricalPeriodTripCount["period"], number>();
    for (const period of group.periods) periodCounts.set(period, (periodCounts.get(period) ?? 0) + 1);
    const identity = {
      snapshot_id: snapshot.snapshot.snapshot_id,
      service_date: date,
      route_id: routeId,
      direction_id: group.direction_id,
      stop_ids: group.stops.map((stop) => stop.stop_id),
    };
    return {
      pattern_id: `historical-full-stop-pattern:${stableHash(identity as unknown as JsonValue).slice(0, 24)}`,
      snapshot_id: snapshot.snapshot.snapshot_id,
      service_date: date,
      route_id: routeId,
      direction_id: group.direction_id,
      trip_count: group.trip_ids.length,
      trip_ids: uniqueSorted(group.trip_ids),
      shape_ids: uniqueSorted(group.shape_ids),
      headsigns: uniqueSorted(group.headsigns),
      stops: group.stops,
      period_trip_counts: [...periodCounts]
        .map(([period, trip_count]) => ({ period, trip_count }))
        .sort((left, right) => left.period.localeCompare(right.period)),
    };
  }).sort((left, right) =>
    left.direction_id.localeCompare(right.direction_id) ||
    right.trip_count - left.trip_count ||
    right.stops.length - left.stops.length ||
    left.pattern_id.localeCompare(right.pattern_id));
}

function longestCommonStopIds(before: readonly string[], after: readonly string[]): string[] {
  const lengths = Array.from({ length: before.length + 1 }, () =>
    Array.from({ length: after.length + 1 }, () => 0));
  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      lengths[left]![right] = before[left] === after[right]
        ? 1 + lengths[left + 1]![right + 1]!
        : Math.max(lengths[left + 1]![right]!, lengths[left]![right + 1]!);
    }
  }
  const result: string[] = [];
  let left = 0;
  let right = 0;
  while (left < before.length && right < after.length) {
    if (before[left] === after[right]) {
      result.push(before[left]!);
      left += 1;
      right += 1;
    } else if (lengths[left + 1]![right]! >= lengths[left]![right + 1]!) {
      left += 1;
    } else {
      right += 1;
    }
  }
  return result;
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function comparisonClassification(
  before: HistoricalFullStopPattern,
  after: HistoricalFullStopPattern,
  shared: readonly string[],
  added: readonly HistoricalStop[],
  removed: readonly HistoricalStop[],
): HistoricalPatternComparison["classification"] {
  const beforeIds = before.stops.map((stop) => stop.stop_id);
  const afterIds = after.stops.map((stop) => stop.stop_id);
  if (sameArray(beforeIds, afterIds)) return before.route_id === after.route_id ? "unchanged" : "route_rename";
  const firstShared = shared[0]!;
  const lastShared = shared.at(-1)!;
  const beforeFirst = beforeIds.indexOf(firstShared);
  const beforeLast = beforeIds.lastIndexOf(lastShared);
  const afterFirst = afterIds.indexOf(firstShared);
  const afterLast = afterIds.lastIndexOf(lastShared);
  const interiorChanged =
    beforeIds.slice(beforeFirst + 1, beforeLast).some((stopId) => !new Set(shared).has(stopId)) ||
    afterIds.slice(afterFirst + 1, afterLast).some((stopId) => !new Set(shared).has(stopId));
  if (interiorChanged) return "reroute";
  const endpointChanged = beforeIds[0] !== afterIds[0] || beforeIds.at(-1) !== afterIds.at(-1);
  if (endpointChanged && shared.length >= 2) return "terminal_replacement";
  if (added.length > 0 || removed.length > 0) return "stop_set_change";
  return "reroute";
}

function terminalChanges(
  before: HistoricalFullStopPattern,
  after: HistoricalFullStopPattern,
  shared: readonly string[],
): HistoricalPatternComparison["terminal_changes"] {
  if (shared.length < 2) return [];
  const beforeIds = before.stops.map((stop) => stop.stop_id);
  const afterIds = after.stops.map((stop) => stop.stop_id);
  const beforeById = new Map(before.stops.map((stop) => [stop.stop_id, stop]));
  const afterById = new Map(after.stops.map((stop) => [stop.stop_id, stop]));
  const output: HistoricalPatternComparison["terminal_changes"] = [];
  const add = (
    end: "prefix" | "suffix",
    sharedBoundary: string,
    beforeTailIds: string[],
    afterTailIds: string[],
  ) => {
    if (beforeTailIds.length === 0 && afterTailIds.length === 0) return;
    const classification = beforeTailIds.length > 0 && afterTailIds.length > 0
      ? "replacement"
      : afterTailIds.length > 0 ? "extension" : "truncation";
    const beforeTerminal = end === "prefix" ? beforeTailIds[0] : beforeTailIds.at(-1);
    const afterTerminal = end === "prefix" ? afterTailIds[0] : afterTailIds.at(-1);
    output.push({
      end,
      classification,
      shared_boundary_stop_id: sharedBoundary,
      before_boundary_stop_ids: beforeTerminal
        ? (end === "prefix" ? [beforeTerminal, sharedBoundary] : [sharedBoundary, beforeTerminal])
        : [],
      after_boundary_stop_ids: afterTerminal
        ? (end === "prefix" ? [afterTerminal, sharedBoundary] : [sharedBoundary, afterTerminal])
        : [],
      stops_added: afterTailIds.map((stopId) => afterById.get(stopId)!)
        .filter((stop): stop is HistoricalStop => stop !== undefined),
      stops_removed: beforeTailIds.map((stopId) => beforeById.get(stopId)!)
        .filter((stop): stop is HistoricalStop => stop !== undefined),
    });
  };
  const firstShared = shared[0]!;
  const lastShared = shared.at(-1)!;
  add(
    "prefix",
    firstShared,
    beforeIds.slice(0, beforeIds.indexOf(firstShared)),
    afterIds.slice(0, afterIds.indexOf(firstShared)),
  );
  add(
    "suffix",
    lastShared,
    beforeIds.slice(beforeIds.lastIndexOf(lastShared) + 1),
    afterIds.slice(afterIds.lastIndexOf(lastShared) + 1),
  );
  return output;
}

export function compareFullStopPatterns(
  before: HistoricalFullStopPattern,
  after: HistoricalFullStopPattern,
): HistoricalPatternComparison {
  const beforeById = new Map(before.stops.map((stop) => [stop.stop_id, stop]));
  const afterById = new Map(after.stops.map((stop) => [stop.stop_id, stop]));
  const beforeIds = before.stops.map((stop) => stop.stop_id);
  const afterIds = after.stops.map((stop) => stop.stop_id);
  const shared = longestCommonStopIds(beforeIds, afterIds);
  const distinctBoundaries = shared.length >= 2 && shared[0] !== shared.at(-1);
  const sharedSet = new Set(shared);
  const stopsAdded = after.stops.filter((stop) => !beforeById.has(stop.stop_id));
  const stopsRemoved = before.stops.filter((stop) => !afterById.has(stop.stop_id));
  const renamedStops = shared.flatMap((stopId) => {
    const beforeStop = beforeById.get(stopId)!;
    const afterStop = afterById.get(stopId)!;
    return beforeStop.stop_name !== afterStop.stop_name ? [{
      stop_id: stopId,
      before_stop_name: beforeStop.stop_name,
      after_stop_name: afterStop.stop_name,
    }] : [];
  });
  const accepted = Boolean(distinctBoundaries);
  const identity = {
    before_pattern_id: before.pattern_id,
    after_pattern_id: after.pattern_id,
  };
  return {
    comparison_id: `historical-full-stop-comparison:${stableHash(identity as unknown as JsonValue).slice(0, 24)}`,
    before_pattern_id: before.pattern_id,
    after_pattern_id: after.pattern_id,
    before_route_id: before.route_id,
    after_route_id: after.route_id,
    direction_id: before.direction_id,
    accepted,
    rejection_reason: accepted ? null : "insufficient_two_boundary_identity",
    classification: accepted
      ? comparisonClassification(before, after, shared, stopsAdded, stopsRemoved)
      : "unresolved",
    boundary_stop_ids: accepted ? [shared[0]!, shared.at(-1)!] : [],
    shared_stop_ids: shared,
    stops_added: stopsAdded,
    stops_removed: stopsRemoved,
    renamed_stops: renamedStops,
    terminal_changes: terminalChanges(before, after, shared),
    equivalences: shared.filter((stopId) => sharedSet.has(stopId)).map((stopId) => ({
      before_stop_id: stopId,
      after_stop_id: stopId,
      before_stop_name: beforeById.get(stopId)?.stop_name ?? "",
      after_stop_name: afterById.get(stopId)?.stop_name ?? "",
      equivalence_basis: "identical_stop_id",
    })),
  };
}

function bestComparisons(
  beforePatterns: readonly HistoricalFullStopPattern[],
  afterPatterns: readonly HistoricalFullStopPattern[],
): HistoricalPatternComparison[] {
  return beforePatterns.map((before) => {
    const candidates = afterPatterns
      .filter((after) => after.direction_id === before.direction_id)
      .map((after) => compareFullStopPatterns(before, after))
      .sort((left, right) =>
        Number(right.accepted) - Number(left.accepted) ||
        right.shared_stop_ids.length - left.shared_stop_ids.length ||
        left.stops_added.length + left.stops_removed.length -
          (right.stops_added.length + right.stops_removed.length) ||
        left.after_pattern_id.localeCompare(right.after_pattern_id));
    const selected = candidates[0];
    if (!selected) throw new Error(
      `No direction-compatible after pattern for ${before.route_id} ${before.direction_id}`);
    return selected;
  }).sort((left, right) => left.comparison_id.localeCompare(right.comparison_id));
}

function loadTargetPatterns(
  snapshot: OperationalSnapshot,
  date: string,
  routeIds: readonly string[],
): HistoricalFullStopPattern[] {
  if (!snapshot.service_window || date < snapshot.service_window.start || date > snapshot.service_window.end) {
    throw new Error(`${snapshot.snapshot_id}: target date ${date} is outside the service window`);
  }
  const loaded = loadGtfsStaticSnapshot(
    snapshot,
    ["calendar", "calendar_dates", "routes", "stops", "stop_times", "trips"],
    repoRoot,
    new Set(routeIds),
  );
  return routeIds.flatMap((routeId) => {
    const patterns = fullStopPatternsForDate(loaded, date, routeId);
    if (patterns.length === 0) {
      throw new Error(`${snapshot.snapshot_id}: no active revenue patterns for ${routeId} on ${date}`);
    }
    return patterns;
  });
}

function buildDossiers(registrySnapshots: readonly OperationalSnapshot[]): HistoricalFullStopDossier[] {
  const byId = new Map(registrySnapshots.map((snapshot) => [snapshot.snapshot_id, snapshot]));
  const required = (key: HistoricalSnapshotKey): OperationalSnapshot => {
    const snapshot = byId.get(SNAPSHOTS[key].snapshotId);
    if (!snapshot) throw new Error(`Missing historical snapshot ${SNAPSHOTS[key].snapshotId}`);
    return snapshot;
  };

  const queensBefore = required("queens_before");
  const queensAfter = required("queens_after");
  const buscoBefore = required("busco_before");
  const buscoAfter = required("busco_after");

  const q15 = loadTargetPatterns(queensBefore, "2025-06-28", ["Q15"]);
  const q34 = loadTargetPatterns(buscoBefore, "2025-06-27", ["Q34"]);
  const q61 = loadTargetPatterns(queensAfter, "2025-06-29", ["Q61"]);
  const qm44Before = loadTargetPatterns(buscoBefore, "2025-06-27", ["QM44"]);
  const qm44After = loadTargetPatterns(buscoAfter, "2025-06-30", ["QM44"]);
  const x64 = loadTargetPatterns(queensBefore, "2025-06-27", ["X64"]);
  const qm64 = loadTargetPatterns(queensAfter, "2025-06-30", ["QM64"]);

  return [
    {
      schema_version: HISTORICAL_FULL_STOP_SCHEMA_VERSION,
      dossier_id: "plan-040-historical-full-stop-q61-lineage-v1",
      family_id: "q61_lineage",
      target_dates: { before: ["2025-06-27", "2025-06-28"], after: ["2025-06-29"] },
      input_snapshot_ids: uniqueSorted([
        queensBefore.snapshot_id,
        buscoBefore.snapshot_id,
        queensAfter.snapshot_id,
      ]),
      patterns: [...q15, ...q34, ...q61].sort((left, right) =>
        left.pattern_id.localeCompare(right.pattern_id)),
      comparisons: [
        ...bestComparisons(q15, q61),
        ...bestComparisons(q34, q61),
      ].sort((left, right) => left.comparison_id.localeCompare(right.comparison_id)),
      provenance_rule: "identical_stop_ids_only_no_proximity_identity",
    },
    {
      schema_version: HISTORICAL_FULL_STOP_SCHEMA_VERSION,
      dossier_id: "plan-040-historical-full-stop-qm44-stop-and-modality-v1",
      family_id: "qm44_stop_and_modality",
      target_dates: { before: ["2025-06-27"], after: ["2025-06-30"] },
      input_snapshot_ids: uniqueSorted([buscoBefore.snapshot_id, buscoAfter.snapshot_id]),
      patterns: [...qm44Before, ...qm44After].sort((left, right) =>
        left.pattern_id.localeCompare(right.pattern_id)),
      comparisons: bestComparisons(qm44Before, qm44After),
      provenance_rule: "identical_stop_ids_only_no_proximity_identity",
    },
    {
      schema_version: HISTORICAL_FULL_STOP_SCHEMA_VERSION,
      dossier_id: "plan-040-historical-full-stop-qm64-x64-lineage-v1",
      family_id: "qm64_x64_lineage",
      target_dates: { before: ["2025-06-27"], after: ["2025-06-30"] },
      input_snapshot_ids: uniqueSorted([queensBefore.snapshot_id, queensAfter.snapshot_id]),
      patterns: [...x64, ...qm64].sort((left, right) =>
        left.pattern_id.localeCompare(right.pattern_id)),
      comparisons: bestComparisons(x64, qm64),
      provenance_rule: "identical_stop_ids_only_no_proximity_identity",
    },
  ];
}

function acquisitionReceipt(): JsonValue {
  return {
    schema_version: 1,
    receipt_id: "plan-040-historical-full-stop-acquisition-v1",
    frozen_on: "2026-07-23",
    search_order: [
      {
        order: 1,
        path: "existing_local_captured_artifacts",
        outcome: "no_qualifying_target_window_artifact",
        locations_inspected: [
          "/tmp/mta-wiki-plan-040",
          "/mnt/models/dev/mta-wiki",
          "/mnt/models/dev/bus-reliability-tracker",
        ],
      },
      {
        order: 2,
        path: "official_mta_and_ny_open_data",
        outcome: "live_catalog_only_no_historical_restore_point",
        urls_inspected: [
          "https://data.ny.gov/d/fgm6-ccue",
          "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_q.zip",
          "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_busco.zip",
        ],
      },
      {
        order: 3,
        path: "timestamped_archive_of_exact_official_url",
        outcome: "accepted_four_byte_identical_mta_origin_objects",
        urls_inspected: [
          SNAPSHOTS.queens_before.archiveUrl,
          SNAPSHOTS.queens_after.archiveUrl,
          SNAPSHOTS.busco_before.archiveUrl,
          SNAPSHOTS.busco_after.archiveUrl,
          "https://rrgtfsfeeds.s3.us-east-1.amazonaws.com/gtfs-qbnr-jun-q.zip",
          "https://rrgtfsfeeds.s3.us-east-1.amazonaws.com/gtfs-qbnr-jun-busco.zip",
        ],
        rejected_attempts: [
          "The two MTA preview objects are expired and have no Internet Archive capture.",
          "Transitland historical downloads require an API key; version metadata remained public.",
        ],
      },
      {
        order: 4,
        path: "first_party_stop_id_crosswalk",
        outcome: "no_crosswalk_found_not_required_for_identical_stop_id_equivalences",
        urls_inspected: [
          "https://www.mta.info/document/128416",
          "https://www.mta.info/document/83216",
          "https://www.mta.info/document/83236",
          "https://groups.google.com/g/mtadeveloperresources/c/bhpjtE7x4hY",
        ],
      },
    ],
    accepted_inputs: Object.values(SNAPSHOTS).map((snapshot) => ({
      source_id: snapshot.sourceId,
      snapshot_id: snapshot.snapshotId,
      official_origin_url: snapshot.officialUrl,
      archive_transport_url: snapshot.archiveUrl,
      archive_timestamp: snapshot.archiveTimestamp,
      sha1: snapshot.expectedSha1,
      sha256: snapshot.expectedSha256,
      provenance_urls: [...snapshot.provenanceUrls].sort(),
    })).sort((left, right) => left.snapshot_id.localeCompare(right.snapshot_id)),
    identity_rule: "Only identical stop IDs or separately cited first-party crosswalk rows may authorize equivalence. This receipt contains no proximity-derived equivalence.",
  } as unknown as JsonValue;
}

function requiredInputArtifacts(snapshot: OperationalSnapshot): Array<{
  path: string;
  sha256: string;
  bytes: number;
  rows?: number | undefined;
}> {
  const requiredSuffixes = new Set([
    "/source.zip",
    "/receipt.json",
    ...REQUIRED_GTFS_MEMBERS.map((member) => `/extracted/${member}`),
  ]);
  const artifacts = snapshot.artifacts.filter((artifact) =>
    [...requiredSuffixes].some((suffix) => artifact.path.endsWith(suffix)));
  if (artifacts.length !== REQUIRED_GTFS_MEMBERS.length + 2) {
    throw new Error(`${snapshot.snapshot_id}: incomplete required historical GTFS artifact set`);
  }
  return artifacts.map((artifact) => ({ ...artifact })).sort((left, right) => left.path.localeCompare(right.path));
}

type CandidateSupportSpec = {
  occurrence_id: string;
  route_record_id: string;
  gtfs_route_id: HistoricalCandidateSupportRow["gtfs_route_id"];
  treatment_record_id: string;
  expected_extent_kind: "unresolved" | "route_wide";
  expected_missing_roles: string[];
  verdict: HistoricalCandidateSupportRow["historical_evidence_verdict"];
};

const CANDIDATE_SUPPORT_SPECS = ([
  {
    occurrence_id: "occurrence:347bc4f1a346152697520648",
    route_record_id: "route_qm44-qbnr-2025",
    gtfs_route_id: "QM44",
    treatment_record_id: "treatment_qm44-frequency-decrease-2025",
    expected_extent_kind: "unresolved",
    expected_missing_roles: ["scope_modality"],
    verdict: "service_scope_supported",
  },
  {
    occurrence_id: "occurrence:347bc4f1a346152697520648",
    route_record_id: "route_qm44-qbnr-2025",
    gtfs_route_id: "QM44",
    treatment_record_id: "treatment_qm44-stop-removal-2025",
    expected_extent_kind: "unresolved",
    expected_missing_roles: ["stop_identity"],
    verdict: "stop_set_supported",
  },
  {
    occurrence_id: "occurrence:5d51147fc80a669bfb81da45",
    route_record_id: "route_q61-queens",
    gtfs_route_id: "Q61",
    treatment_record_id: "treatment_q61-beechhurst-flushing-connection-2025",
    expected_extent_kind: "unresolved",
    expected_missing_roles: ["bounded_scope_identity"],
    verdict: "bounded_segment_supported",
  },
  {
    occurrence_id: "occurrence:5d51147fc80a669bfb81da45",
    route_record_id: "route_q61-queens",
    gtfs_route_id: "Q61",
    treatment_record_id: "treatment_q61-q15-beechhurst-replacement-2025",
    expected_extent_kind: "unresolved",
    expected_missing_roles: ["bounded_scope_identity"],
    verdict: "lineage_supported",
  },
  {
    occurrence_id: "occurrence:5d51147fc80a669bfb81da45",
    route_record_id: "route_q61-queens",
    gtfs_route_id: "Q61",
    treatment_record_id: "treatment_q61-q34-linden-hill-replacement-2025",
    expected_extent_kind: "unresolved",
    expected_missing_roles: ["bounded_scope_identity"],
    verdict: "lineage_supported",
  },
  {
    occurrence_id: "occurrence:8e0377c6acfe62e1a61d910b",
    route_record_id: "route_qm64-qbnr-2025",
    gtfs_route_id: "QM64",
    treatment_record_id: "treatment_qm64-avenue-service-discontinuation-2025",
    expected_extent_kind: "unresolved",
    expected_missing_roles: ["bounded_scope_identity"],
    verdict: "bounded_segment_supported",
  },
  {
    occurrence_id: "occurrence:8e0377c6acfe62e1a61d910b",
    route_record_id: "route_qm64-qbnr-2025",
    gtfs_route_id: "QM64",
    treatment_record_id: "treatment_qm64-elmont-extension-2025",
    expected_extent_kind: "unresolved",
    expected_missing_roles: ["bounded_scope_identity"],
    verdict: "bounded_segment_supported",
  },
  {
    occurrence_id: "occurrence:8e0377c6acfe62e1a61d910b",
    route_record_id: "route_qm64-qbnr-2025",
    gtfs_route_id: "QM64",
    treatment_record_id: "treatment_qm64-frequency-decrease-2025",
    expected_extent_kind: "unresolved",
    expected_missing_roles: ["scope_modality"],
    verdict: "service_scope_supported",
  },
  {
    occurrence_id: "occurrence:8e0377c6acfe62e1a61d910b",
    route_record_id: "route_qm64-qbnr-2025",
    gtfs_route_id: "QM64",
    treatment_record_id: "treatment_qm64-midtown-stop-additions-2025",
    expected_extent_kind: "unresolved",
    expected_missing_roles: ["stop_identity"],
    verdict: "stop_set_supported",
  },
  {
    occurrence_id: "occurrence:8e0377c6acfe62e1a61d910b",
    route_record_id: "route_qm64-qbnr-2025",
    gtfs_route_id: "QM64",
    treatment_record_id: "treatment_qm64-route-rename-2025",
    expected_extent_kind: "route_wide",
    expected_missing_roles: [],
    verdict: "route_rename_supported",
  },
  {
    occurrence_id: "occurrence:8e0377c6acfe62e1a61d910b",
    route_record_id: "route_qm64-qbnr-2025",
    gtfs_route_id: "QM64",
    treatment_record_id: "treatment_qm64-stop-removal-2025",
    expected_extent_kind: "unresolved",
    expected_missing_roles: ["stop_identity"],
    verdict: "stop_set_supported",
  },
] satisfies CandidateSupportSpec[]).sort((left, right) =>
  candidateSupportKey(left).localeCompare(candidateSupportKey(right)));

function candidateSupportKey(value: {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
}): string {
  return `${value.occurrence_id}\0${value.route_record_id}\0${value.treatment_record_id}`;
}

function readCurrentCompanionRows(path = HISTORICAL_FULL_STOP_COMPANION_PATH): MemberExtentRow[] {
  return readFileSync(path, "utf8").split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    const parsed = JSON.parse(line) as MemberExtentRow;
    if (stableJson(parsed as unknown as JsonValue) !== line) {
      throw new Error(`${relative(repoRoot, path)}:${index + 1}: expected stable JSON`);
    }
    return [parsed];
  });
}

function candidateFact(
  dossierArtifacts: ReadonlyMap<HistoricalFullStopDossier["family_id"], { path: string; sha256: string }>,
  familyId: HistoricalFullStopDossier["family_id"],
  factKind: HistoricalCandidateFactRef["fact_kind"],
  factId: string,
  direction: string,
  identifiers: readonly string[],
): HistoricalCandidateFactRef {
  const artifact = dossierArtifacts.get(familyId);
  if (!artifact) throw new Error(`Missing dossier artifact for ${familyId}`);
  const sortedIdentifiers = uniqueSorted(identifiers);
  if (sortedIdentifiers.length === 0) throw new Error(`${factId}: candidate fact has no identifiers`);
  return {
    dossier_path: artifact.path,
    dossier_sha256: artifact.sha256,
    fact_kind: factKind,
    fact_id: factId,
    direction,
    identifiers: sortedIdentifiers,
  };
}

function comparisonFacts(
  dossier: HistoricalFullStopDossier,
  dossierArtifacts: ReadonlyMap<HistoricalFullStopDossier["family_id"], { path: string; sha256: string }>,
  comparisons: readonly HistoricalPatternComparison[],
  factKind: HistoricalCandidateFactRef["fact_kind"],
  identifiers: (comparison: HistoricalPatternComparison) => readonly string[],
): HistoricalCandidateFactRef[] {
  return comparisons.map((comparison) => candidateFact(
    dossierArtifacts,
    dossier.family_id,
    factKind,
    comparison.comparison_id,
    comparison.direction_id,
    identifiers(comparison),
  ));
}

function periodChangeFact(
  dossier: HistoricalFullStopDossier,
  dossierArtifacts: ReadonlyMap<HistoricalFullStopDossier["family_id"], { path: string; sha256: string }>,
  comparison: HistoricalPatternComparison,
): HistoricalCandidateFactRef {
  const before = dossier.patterns.find((pattern) => pattern.pattern_id === comparison.before_pattern_id);
  const after = dossier.patterns.find((pattern) => pattern.pattern_id === comparison.after_pattern_id);
  if (!before || !after) throw new Error(`${comparison.comparison_id}: missing pattern for period comparison`);
  const beforeCounts = new Map<string, number>(
    before.period_trip_counts.map((row) => [row.period, row.trip_count]),
  );
  const afterCounts = new Map<string, number>(
    after.period_trip_counts.map((row) => [row.period, row.trip_count]),
  );
  const changed = uniqueSorted([...beforeCounts.keys(), ...afterCounts.keys()]).flatMap((period) => {
    const beforeCount = beforeCounts.get(period) ?? 0;
    const afterCount = afterCounts.get(period) ?? 0;
    return beforeCount === afterCount ? [] : [
      `before:${period}:${beforeCount}`,
      `after:${period}:${afterCount}`,
    ];
  });
  return candidateFact(
    dossierArtifacts,
    dossier.family_id,
    "period_trip_count_change",
    `${comparison.comparison_id}#period_trip_counts`,
    comparison.direction_id,
    changed,
  );
}

function patternSegment(pattern: HistoricalFullStopPattern, first: string, last: string): string[] {
  const ids = pattern.stops.map((stop) => stop.stop_id);
  const firstIndex = ids.indexOf(first);
  const lastIndex = ids.indexOf(last);
  if (firstIndex < 0 || lastIndex < 0) {
    throw new Error(`${pattern.pattern_id}: missing required segment boundary ${first}/${last}`);
  }
  const start = Math.min(firstIndex, lastIndex);
  const end = Math.max(firstIndex, lastIndex);
  return ids.slice(start, end + 1);
}

function candidateFactRefs(
  spec: CandidateSupportSpec,
  dossiers: ReadonlyMap<HistoricalFullStopDossier["family_id"], HistoricalFullStopDossier>,
  dossierArtifacts: ReadonlyMap<HistoricalFullStopDossier["family_id"], { path: string; sha256: string }>,
): HistoricalCandidateFactRef[] {
  const q61 = dossiers.get("q61_lineage");
  const qm44 = dossiers.get("qm44_stop_and_modality");
  const qm64 = dossiers.get("qm64_x64_lineage");
  if (!q61 || !qm44 || !qm64) throw new Error("Historical candidate support requires all three dossiers");

  let refs: HistoricalCandidateFactRef[];
  switch (spec.treatment_record_id) {
    case "treatment_q61-q15-beechhurst-replacement-2025":
      refs = comparisonFacts(
        q61,
        dossierArtifacts,
        q61.comparisons.filter((row) => row.before_route_id === "Q15"),
        "lineage_correspondence",
        (row) => [...row.boundary_stop_ids, ...row.shared_stop_ids],
      );
      break;
    case "treatment_q61-q34-linden-hill-replacement-2025":
      refs = comparisonFacts(
        q61,
        dossierArtifacts,
        q61.comparisons.filter((row) => row.before_route_id === "Q34"),
        "lineage_correspondence",
        (row) => [...row.boundary_stop_ids, ...row.shared_stop_ids],
      );
      break;
    case "treatment_q61-beechhurst-flushing-connection-2025": {
      const q61Patterns = q61.patterns.filter((pattern) => pattern.route_id === "Q61");
      refs = q61Patterns.map((pattern) => {
        const boundaries = pattern.direction_id === "0"
          ? ["501098", "501175"] as const
          : pattern.direction_id === "1" ? ["501196", "501134"] as const : null;
        if (!boundaries) throw new Error(`${pattern.pattern_id}: unexpected Q61 direction`);
        return candidateFact(
          dossierArtifacts,
          q61.family_id,
          "connection_remainder",
          `${pattern.pattern_id}#connection_remainder`,
          pattern.direction_id,
          patternSegment(pattern, boundaries[0], boundaries[1]),
        );
      });
      break;
    }
    case "treatment_qm44-frequency-decrease-2025": {
      const comparison = qm44.comparisons.find((row) => row.direction_id === "1");
      if (!comparison) throw new Error("QM44: missing direction 1 comparison");
      refs = [periodChangeFact(qm44, dossierArtifacts, comparison)];
      break;
    }
    case "treatment_qm44-stop-removal-2025":
      refs = comparisonFacts(
        qm44,
        dossierArtifacts,
        qm44.comparisons,
        "removed_stop_set",
        (row) => row.stops_removed.map((stop) => stop.stop_id),
      );
      break;
    case "treatment_qm64-avenue-service-discontinuation-2025": {
      const comparison = qm64.comparisons.find((row) => row.direction_id === "1");
      const terminal = comparison?.terminal_changes.find((row) => row.end === "suffix");
      if (!comparison || !terminal) throw new Error("QM64: missing Midtown discontinued-segment fact");
      refs = [candidateFact(
        dossierArtifacts,
        qm64.family_id,
        "terminal_change",
        `${comparison.comparison_id}#terminal_changes:suffix`,
        comparison.direction_id,
        [terminal.shared_boundary_stop_id, ...terminal.stops_removed.map((stop) => stop.stop_id)],
      )];
      break;
    }
    case "treatment_qm64-elmont-extension-2025":
      refs = qm64.comparisons.map((comparison) => {
        const terminal = comparison.terminal_changes.find((row) =>
          row.stops_added.some((stop) => stop.stop_id === "700904" || stop.stop_id === "700905"));
        if (!terminal) throw new Error(`${comparison.comparison_id}: missing Elmont terminal change`);
        return candidateFact(
          dossierArtifacts,
          qm64.family_id,
          "terminal_change",
          `${comparison.comparison_id}#terminal_changes:${terminal.end}`,
          comparison.direction_id,
          [terminal.shared_boundary_stop_id, ...terminal.stops_added.map((stop) => stop.stop_id)],
        );
      });
      break;
    case "treatment_qm64-frequency-decrease-2025": {
      const comparison = qm64.comparisons.find((row) => row.direction_id === "1");
      if (!comparison) throw new Error("QM64: missing direction 1 comparison");
      refs = [periodChangeFact(qm64, dossierArtifacts, comparison)];
      break;
    }
    case "treatment_qm64-midtown-stop-additions-2025": {
      const comparison = qm64.comparisons.find((row) => row.direction_id === "1");
      if (!comparison) throw new Error("QM64: missing Midtown-bound comparison");
      const midtownStopIds = [
        "402144", "402146", "404295", "404297", "404298", "404300", "404877", "450041", "904045",
      ];
      const available = new Set(comparison.stops_added.map((stop) => stop.stop_id));
      if (midtownStopIds.some((stopId) => !available.has(stopId))) {
        throw new Error(`${comparison.comparison_id}: incomplete Midtown added-stop set`);
      }
      refs = [candidateFact(
        dossierArtifacts,
        qm64.family_id,
        "added_stop_set",
        `${comparison.comparison_id}#midtown_stops_added`,
        comparison.direction_id,
        midtownStopIds,
      )];
      break;
    }
    case "treatment_qm64-route-rename-2025":
      refs = comparisonFacts(
        qm64,
        dossierArtifacts,
        qm64.comparisons,
        "route_rename",
        (row) => [row.before_route_id, row.after_route_id],
      );
      break;
    case "treatment_qm64-stop-removal-2025":
      refs = comparisonFacts(
        qm64,
        dossierArtifacts,
        qm64.comparisons,
        "removed_stop_set",
        (row) => row.stops_removed.map((stop) => stop.stop_id),
      );
      break;
    default:
      throw new Error(`No historical support mapping for ${spec.treatment_record_id}`);
  }
  if (refs.length === 0) throw new Error(`${spec.treatment_record_id}: candidate has no historical facts`);
  return refs.sort((left, right) =>
    stableJson(left as unknown as JsonValue).localeCompare(stableJson(right as unknown as JsonValue)));
}

export function buildHistoricalCandidateSupportRows(
  companionRows: readonly MemberExtentRow[],
  dossiers: readonly HistoricalFullStopDossier[],
  dossierArtifacts: readonly { family_id: HistoricalFullStopDossier["family_id"]; path: string; sha256: string }[],
): HistoricalCandidateSupportRow[] {
  const targetRouteIds = new Set(["Q61", "QM44", "QM64"]);
  const candidates = companionRows.filter((row) => targetRouteIds.has(row.gtfs_route_id))
    .sort((left, right) => candidateSupportKey(left).localeCompare(candidateSupportKey(right)));
  const candidateKeys = candidates.map(candidateSupportKey);
  const expectedKeys = CANDIDATE_SUPPORT_SPECS.map(candidateSupportKey);
  const missing = expectedKeys.filter((key) => !candidateKeys.includes(key));
  const extra = candidateKeys.filter((key) => !expectedKeys.includes(key));
  if (missing.length > 0 || extra.length > 0 || new Set(candidateKeys).size !== candidateKeys.length) {
    throw new Error(
      `Historical candidate package key drift: missing=${missing.length}, extra=${extra.length}, ` +
      `duplicate=${candidateKeys.length - new Set(candidateKeys).size}`,
    );
  }
  const dossierByFamily = new Map(dossiers.map((dossier) => [dossier.family_id, dossier]));
  const artifactByFamily = new Map(dossierArtifacts.map((artifact) => [
    artifact.family_id,
    { path: artifact.path, sha256: artifact.sha256 },
  ]));
  const rowByKey = new Map(candidates.map((row) => [candidateSupportKey(row), row]));
  return CANDIDATE_SUPPORT_SPECS.map((spec) => {
    const row = rowByKey.get(candidateSupportKey(spec));
    if (!row) throw new Error(`Missing historical candidate ${candidateSupportKey(spec)}`);
    if (row.extent !== spec.expected_extent_kind ||
        stableJson(row.missing_roles as unknown as JsonValue) !==
          stableJson(spec.expected_missing_roles as unknown as JsonValue)) {
      throw new Error(`${spec.treatment_record_id}: current extent or missing-role drift`);
    }
    return {
      occurrence_id: row.occurrence_id,
      route_record_id: row.route_record_id,
      gtfs_route_id: spec.gtfs_route_id,
      treatment_record_id: row.treatment_record_id,
      extent_id: row.extent_id,
      current_extent_kind: row.extent,
      current_missing_roles: [...row.missing_roles],
      historical_evidence_verdict: spec.verdict,
      fact_refs: candidateFactRefs(spec, dossierByFamily, artifactByFamily),
      decision_authority: false,
      occurrence_authority: false,
    };
  });
}

export function writeHistoricalFullStopEvidence(): HistoricalFullStopWriteResult {
  const registry = loadOperationalSnapshotRegistry();
  const historicalSnapshots = Object.values(SNAPSHOTS).map((definition) =>
    snapshotById(registry, definition.snapshotId));
  const dossiers = buildDossiers(registry.snapshots);

  writeImmutableJson(HISTORICAL_FULL_STOP_ACQUISITION_RECEIPT_PATH, acquisitionReceipt());
  const acquisitionReceiptSha = fileSha256(HISTORICAL_FULL_STOP_ACQUISITION_RECEIPT_PATH);

  const acquisitionManifestPath = join(HISTORICAL_FULL_STOP_ROOT, "acquisition-manifest.json");
  const acquisitionManifest = {
    schema_version: HISTORICAL_FULL_STOP_SCHEMA_VERSION,
    manifest_id: HISTORICAL_FULL_STOP_MANIFEST_ID,
    registry_sha256: operationalSnapshotRegistrySha256(),
    acquisition_receipt: {
      path: relative(repoRoot, HISTORICAL_FULL_STOP_ACQUISITION_RECEIPT_PATH),
      sha256: acquisitionReceiptSha,
    },
    snapshots: historicalSnapshots.map((snapshot) => ({
      snapshot_id: snapshot.snapshot_id,
      source_id: snapshot.source_id,
      source_url: snapshot.source_url,
      retrieved_at: snapshot.retrieved_at,
      service_window: snapshot.service_window,
      artifacts: requiredInputArtifacts(snapshot),
    })).sort((left, right) => left.snapshot_id.localeCompare(right.snapshot_id)),
  };
  writeImmutableJson(acquisitionManifestPath, acquisitionManifest as unknown as JsonValue);

  const dossierPaths: string[] = [];
  const dossierHashes: string[] = [];
  for (const dossier of dossiers) {
    const path = join(HISTORICAL_FULL_STOP_ROOT, `${dossier.family_id}.json`);
    writeImmutableJson(path, dossier as unknown as JsonValue);
    dossierPaths.push(path);
    dossierHashes.push(fileSha256(path));
  }
  const dossierArtifacts = dossierPaths.map((path, index) => ({
    path: relative(repoRoot, path),
    sha256: dossierHashes[index]!,
  })).sort((left, right) => left.path.localeCompare(right.path));

  const allComparisons = dossiers.flatMap((dossier) => dossier.comparisons);
  const verdictDistribution = {
    correspondence_accepted: allComparisons.filter((row) => row.accepted).length,
    correspondence_rejected_one_boundary: allComparisons
      .filter((row) => row.rejection_reason === "insufficient_two_boundary_identity").length,
    identical_stop_id_equivalences: allComparisons
      .reduce((sum, row) => sum + row.equivalences.length, 0),
    proximity_equivalences: 0,
  };
  const replayPayload = {
    acquisition_manifest_sha256: fileSha256(acquisitionManifestPath),
    dossiers: dossierArtifacts,
    verdict_distribution: verdictDistribution,
  };
  const replayHash = stableHash(replayPayload as unknown as JsonValue);
  const acceptanceManifestPath = join(HISTORICAL_FULL_STOP_ROOT, "acceptance-manifest.json");
  const acceptanceManifest = {
    schema_version: HISTORICAL_FULL_STOP_SCHEMA_VERSION,
    acceptance_id: "plan-040-step-2a-acceptance-v1",
    acquisition_manifest: {
      path: relative(repoRoot, acquisitionManifestPath),
      sha256: fileSha256(acquisitionManifestPath),
    },
    input_hashes: historicalSnapshots.flatMap((snapshot) =>
      requiredInputArtifacts(snapshot).map((artifact) => ({
        snapshot_id: snapshot.snapshot_id,
        path: artifact.path,
        sha256: artifact.sha256,
      }))).sort((left, right) =>
      left.snapshot_id.localeCompare(right.snapshot_id) || left.path.localeCompare(right.path)),
    dossiers: dossierArtifacts,
    covered_candidate_count: 11,
    covered_route_family_count: 3,
    verdict_distribution: verdictDistribution,
    replay_hash: replayHash,
    authorization_state: "evidence_only_pending_dual_independent_review",
    occurrence_authority: false,
    decision_authority: false,
    identity_rule: "identical_stop_ids_only_no_proximity_identity",
  };
  writeImmutableJson(acceptanceManifestPath, acceptanceManifest as unknown as JsonValue);

  const companionSha256 = fileSha256(HISTORICAL_FULL_STOP_COMPANION_PATH);
  const riskArtifactSha256 = fileSha256(HISTORICAL_FULL_STOP_RISK_ARTIFACT_PATH);
  const riskArtifact = JSON.parse(readFileSync(HISTORICAL_FULL_STOP_RISK_ARTIFACT_PATH, "utf8")) as {
    input_pins?: Array<{ path?: string; sha256?: string }>;
  };
  const riskCompanionPin = riskArtifact.input_pins?.find((pin) =>
    pin.path === relative(repoRoot, HISTORICAL_FULL_STOP_COMPANION_PATH));
  if (riskCompanionPin?.sha256 !== companionSha256) {
    throw new Error("Plan 040 risk artifact does not pin the current member-extent companion");
  }
  const dossierSupportArtifacts = dossiers.map((dossier, index) => ({
    family_id: dossier.family_id,
    path: relative(repoRoot, dossierPaths[index]!),
    sha256: dossierHashes[index]!,
  })).sort((left, right) => left.family_id.localeCompare(right.family_id));
  const candidateSupportRows = buildHistoricalCandidateSupportRows(
    readCurrentCompanionRows(),
    dossiers,
    dossierSupportArtifacts,
  );
  const candidateVerdictDistribution = Object.fromEntries(
    uniqueSorted(candidateSupportRows.map((row) => row.historical_evidence_verdict))
      .map((verdict) => [
        verdict,
        candidateSupportRows.filter((row) => row.historical_evidence_verdict === verdict).length,
      ]),
  );
  const packageInputPins = [
    {
      path: relative(repoRoot, HISTORICAL_FULL_STOP_COMPANION_PATH),
      sha256: companionSha256,
    },
    {
      path: relative(repoRoot, HISTORICAL_FULL_STOP_RISK_ARTIFACT_PATH),
      sha256: riskArtifactSha256,
    },
  ].sort((left, right) => left.path.localeCompare(right.path));
  const candidateReplayPayload = {
    prior_acceptance_manifest_sha256: fileSha256(acceptanceManifestPath),
    package_input_pins: packageInputPins,
    dossiers: dossierSupportArtifacts,
    candidate_support_rows: candidateSupportRows,
    candidate_verdict_distribution: candidateVerdictDistribution,
  };
  const candidateReplayHash = stableHash(candidateReplayPayload as unknown as JsonValue);
  const acceptanceManifestV2Path = join(HISTORICAL_FULL_STOP_ROOT, "acceptance-manifest-v2.json");
  const acceptanceManifestV2 = {
    schema_version: 2,
    acceptance_id: "plan-040-step-2a-acceptance-v2",
    prior_acceptance_manifest: {
      path: relative(repoRoot, acceptanceManifestPath),
      sha256: fileSha256(acceptanceManifestPath),
    },
    package_input_pins: packageInputPins,
    dossiers: dossierSupportArtifacts,
    exact_candidate_key_rule: "current_companion_rows_for_q61_qm44_qm64_exact_expected_keys_v1",
    candidate_support_rows: candidateSupportRows,
    covered_candidate_count: candidateSupportRows.length,
    covered_route_family_count: new Set(candidateSupportRows.map((row) => row.gtfs_route_id)).size,
    candidate_verdict_distribution: candidateVerdictDistribution,
    evidence_fact_distribution: verdictDistribution,
    replay_hash: candidateReplayHash,
    authorization_state: "candidate_evidence_only_pending_dual_independent_review",
    occurrence_authority: false,
    decision_authority: false,
    identity_rule: "identical_stop_ids_only_no_proximity_identity",
  };
  writeImmutableJson(acceptanceManifestV2Path, acceptanceManifestV2 as unknown as JsonValue);
  return {
    acquisition_receipt_path: HISTORICAL_FULL_STOP_ACQUISITION_RECEIPT_PATH,
    acquisition_receipt_sha256: acquisitionReceiptSha,
    acquisition_manifest_path: acquisitionManifestPath,
    acquisition_manifest_sha256: fileSha256(acquisitionManifestPath),
    dossier_paths: dossierPaths,
    dossier_sha256s: dossierHashes,
    acceptance_manifest_path: acceptanceManifestV2Path,
    acceptance_manifest_sha256: fileSha256(acceptanceManifestV2Path),
    replay_hash: candidateReplayHash,
    covered_candidate_count: candidateSupportRows.length,
    verdict_distribution: candidateVerdictDistribution,
  };
}

export function stageHistoricalFullStopEvidence(input: HistoricalFullStopStageInput): HistoricalFullStopWriteResult {
  const archivedInputs = (Object.keys(SNAPSHOTS) as HistoricalSnapshotKey[]).map((key): ArchivedGtfsSnapshotInput => {
    const definition = SNAPSHOTS[key];
    return {
      ...definition,
      provenanceUrls: [...definition.provenanceUrls],
      zipPath: input[key],
    };
  });
  const staged = archivedInputs.map(stageArchivedGtfsSnapshot);
  const registry = loadOperationalSnapshotRegistry();
  writeOperationalSnapshotRegistry(mergeOperationalSnapshots(registry.snapshots, staged));
  return writeHistoricalFullStopEvidence();
}

export function historicalFullStopSnapshotDefinitions(): Readonly<typeof SNAPSHOTS> {
  return SNAPSHOTS;
}

export function historicalFullStopReplayHash(
  acquisitionManifestSha256: string,
  dossierArtifacts: readonly { path: string; sha256: string }[],
  verdictDistribution: Readonly<Record<string, number>>,
): string {
  const payload = {
    acquisition_manifest_sha256: acquisitionManifestSha256,
    dossiers: [...dossierArtifacts].sort((left, right) => left.path.localeCompare(right.path)),
    verdict_distribution: verdictDistribution,
  };
  return createHash("sha256").update(stableJson(payload as unknown as JsonValue)).digest("hex");
}

export function historicalFullStopCandidateReplayHash(input: {
  prior_acceptance_manifest_sha256: string;
  package_input_pins: readonly { path: string; sha256: string }[];
  dossiers: readonly {
    family_id: HistoricalFullStopDossier["family_id"];
    path: string;
    sha256: string;
  }[];
  candidate_support_rows: readonly HistoricalCandidateSupportRow[];
  candidate_verdict_distribution: Readonly<Record<string, number>>;
}): string {
  return createHash("sha256").update(stableJson({
    prior_acceptance_manifest_sha256: input.prior_acceptance_manifest_sha256,
    package_input_pins: [...input.package_input_pins].sort((left, right) => left.path.localeCompare(right.path)),
    dossiers: [...input.dossiers].sort((left, right) => left.family_id.localeCompare(right.family_id)),
    candidate_support_rows: [...input.candidate_support_rows].sort((left, right) =>
      candidateSupportKey(left).localeCompare(candidateSupportKey(right))),
    candidate_verdict_distribution: input.candidate_verdict_distribution,
  } as unknown as JsonValue)).digest("hex");
}
