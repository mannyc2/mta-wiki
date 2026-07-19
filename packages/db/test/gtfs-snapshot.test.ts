import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  currentRouteDesignations,
  deriveRouteActivity,
  installGtfsSnapshot,
  mergeRoutePartitions,
  parseGtfsAcquisitionReceiptV1,
  parseGtfsSnapshotManifestV2,
  serializeGtfsSnapshotManifestV2,
  sevenDateServiceWindow,
  verifyGtfsSnapshotDirectory,
  type AcquisitionReceiptComponentV1,
  type FeedPartition,
  type GtfsAcquisitionReceiptV1,
} from "../src/gtfs-snapshot.js";
import { stableJson } from "../src/stable-json.js";
import type { JsonValue } from "../src/types.js";

function part(id: string, dataset: FeedPartition["dataset_id"], route = "B44+"): FeedPartition {
  return { component_feed_id: id, dataset_id: dataset, reliable_interval_start: "2026-06-27", reliable_interval_end: "2026-09-05",
    routes: [{ route_id: route, agency_id: "MTA NYCT", route_short_name: "B44-SBS", route_long_name: "Nostrand", route_type: "3" }],
    trips: [{ route_id: route, service_id: "WK", trip_id: `${id}-1` }],
    calendar: [{ service_id: "WK", monday: "1", tuesday: "1", wednesday: "1", thursday: "1", friday: "1", saturday: "0", sunday: "0", start_date: "20260627", end_date: "20260905" }], calendar_dates: [] };
}
describe("GTFS snapshot derivation", () => {
  it("uses seven consecutive service dates ending on the as-of date", () => expect(sevenDateServiceWindow("2026-07-18")).toEqual(["2026-07-12","2026-07-13","2026-07-14","2026-07-15","2026-07-16","2026-07-17","2026-07-18"]));
  it("merges identical NYCT partition catalogs but preserves component provenance", () => {
    const rows = mergeRoutePartitions([part("brooklyn", "mta-nyct-bus"), part("queens", "mta-nyct-bus")]);
    expect(rows).toHaveLength(1); expect(rows[0]!.component_feed_ids).toEqual(["brooklyn", "queens"]); expect(rows[0]!.source_route_id).toBe(rows[0]!.gtfs_route_id);
  });
  it("fails on non-identical shared definitions and cross-namespace exported collisions", () => {
    const changed = part("queens", "mta-nyct-bus"); changed.routes[0]!.route_short_name = "WRONG";
    expect(() => mergeRoutePartitions([part("brooklyn", "mta-nyct-bus"), changed])).toThrow("non-identical");
    expect(() => mergeRoutePartitions([part("brooklyn", "mta-nyct-bus"), part("busco", "mta-bus-company")])).toThrow("exported route collision");
  });
  it("derives weekday activity and keeps incomplete windows indeterminate", () => {
    const activity = deriveRouteActivity([part("brooklyn", "mta-nyct-bus")], "2026-07-18")[0]!;
    expect(activity.scheduled_service_dates).toEqual(["2026-07-13","2026-07-14","2026-07-15","2026-07-16","2026-07-17"]); expect(activity.scheduled_trip_template_date_count).toBe(5);
    const incomplete = part("brooklyn", "mta-nyct-bus"); incomplete.reliable_interval_start = "2026-07-13";
    expect(deriveRouteActivity([incomplete], "2026-07-18")[0]!.scheduled_in_window).toBe("indeterminate");
  });
  it("maps plural official modes and fails closed on unknown literals", () => {
    expect(currentRouteDesignations([{ valid_from: "2026-06-28", valid_to: "2026-09-05", in_effect: "true", route_id: "B44+", trip_type: "14", route_type: "SBS" }]).normalized_service_modes).toEqual(["sbs"]);
    expect(() => currentRouteDesignations([{ valid_from: "x", valid_to: "x", in_effect: "true", route_id: "X", trip_type: "99" }])).toThrow("unknown trip_type");
    expect(() => currentRouteDesignations([{ valid_from: "x", valid_to: "x", in_effect: "true", route_id: "X", trip_type: "14", route_type: "Local" }])).toThrow("disagreement");
  });
});

const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const rowCounts: Record<string, number> = {
  "agency.txt": 1,
  "calendar.txt": 1,
  "calendar_dates.txt": 0,
  "feed_info.txt": 1,
  "frequencies.txt": 1,
  "routes.txt": 1,
  "stop_times.txt": 2,
  "stops.txt": 2,
  "trips.txt": 1,
};

function fixture(options: {
  unknownStopReference?: boolean;
  brokenStopFk?: boolean;
  currentLabelDiff?: boolean;
  sourceIdLabelFallback?: boolean;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "mta-wiki-gtfs-snapshot-test-"));
  const feeds: Record<string, string> = {};
  const components: AcquisitionReceiptComponentV1[] = [];
  const ids = ["nyct-brooklyn","nyct-bronx","nyct-manhattan","nyct-queens","nyct-staten-island","mta-bus-company"];
  for (const [index, id] of ids.entries()) {
    const busco = id === "mta-bus-company";
    const datasetId = busco ? "mta-bus-company" : "mta-nyct-bus";
    const routeId = busco ? "Q1" : "B44+";
    const agencyId = busco ? "MTABC" : "MTA NYCT";
    const directory = join(root, id);
    mkdirSync(directory);
    const files: Record<string, string> = {
      "agency.txt": `agency_id,agency_name,agency_url,agency_timezone,agency_lang\n${agencyId},${busco ? "MTA Bus Company" : "MTA New York City Transit"},https://www.mta.info,America/New_York,en\n`,
      "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,1,1,20260701,20260731\n",
      "calendar_dates.txt": "service_id,date,exception_type\n",
      "feed_info.txt": `feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version\nMTA New York City Transit,https://www.mta.info,en,20260701,20260731,${id}-v1\n`,
      "routes.txt": `route_id,agency_id,route_short_name,route_long_name,route_desc,route_type,route_color,route_text_color\n${routeId},${agencyId},${busco ? options.sourceIdLabelFallback ? "" : "Q1" : "B44-SBS"},Long name,Description,3,00AEEF,FFFFFF\n`,
      "stop_times.txt": options.unknownStopReference
        ? `trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_booking_rule_id\nT,08:00:00,08:00:00,S1,1,RULE\nT,08:10:00,08:10:00,${options.brokenStopFk ? "MISSING" : "S2"},2,RULE\n`
        : `trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT,08:00:00,08:00:00,S1,1\nT,08:10:00,08:10:00,${options.brokenStopFk ? "MISSING" : "S2"},2\n`,
      "stops.txt": "stop_id,stop_name,stop_desc,stop_lat,stop_lon\nS1,One,,40,-73\nS2,Two,,40,-73\n",
      "trips.txt": `route_id,service_id,trip_id,trip_headsign,direction_id,block_id,shape_id\n${routeId},WK,T,Head,0,,\n`,
    };
    if (index === 0) files["frequencies.txt"] = "trip_id,start_time,end_time,headway_secs\nT,08:00:00,09:00:00,600\n";
    for (const [name, bytes] of Object.entries(files)) writeFileSync(join(directory, name), bytes);
    const archiveName = `${id}.zip`;
    const archivePath = join(root, archiveName);
    writeFileSync(archivePath, `receipt-pinned archive fixture for ${id}\n`);
    feeds[id] = directory;
    components.push({
      component_feed_id: id,
      dataset_id: datasetId,
      official_url: `https://example.test/${archiveName}`,
      local_artifact_name: archiveName,
      archive_sha256: sha256(readFileSync(archivePath)),
      feed_version: `${id}-v1`,
      feed_start_date: "2026-07-01",
      feed_end_date: "2026-07-31",
      reliable_interval_start: "2026-07-01",
      reliable_interval_end: "2026-07-31",
      agency_timezone: "America/New_York",
      routes_sha256: sha256(readFileSync(join(directory, "routes.txt"))),
      files: Object.fromEntries(Object.keys(files).sort().map((name) => {
        const bytes = readFileSync(join(directory, name));
        return [name, { path: name, sha256: sha256(bytes), bytes: bytes.length, rows: rowCounts[name]! }];
      })),
      frequencies_present: index === 0,
      conditional_location_files_present: false,
    });
  }
  const currentPath = join(root, "current_bus_routes.json");
  const current = [
    { valid_from: "2026-07-01T00:00:00.000", valid_to: "2026-07-31T00:00:00.000", in_effect: "true", route_id: "B44+", route_short_name: options.currentLabelDiff ? "B44 Official SBS" : "B44-SBS", route_long_name: "Long name", route_description: "Description", trip_type: "14", route_type: "SBS" },
    { valid_from: "2026-07-01T00:00:00.000", valid_to: "2026-07-31T00:00:00.000", in_effect: "true", route_id: "Q6", route_short_name: "Q6", route_long_name: "Long name", route_description: "Description", trip_type: "1", route_type: "Local" },
  ];
  writeFileSync(currentPath, JSON.stringify(current));
  const currentBytes = readFileSync(currentPath);
  const receipt: GtfsAcquisitionReceiptV1 = {
    schema_version: 1,
    contract_id: "gtfs-acquisition-receipt-v1",
    snapshot_id: "fixture-2026-07-18",
    as_of_date: "2026-07-18",
    service_window_start: "2026-07-12",
    service_window_end: "2026-07-18",
    captured_at: "2026-07-18T00:00:00Z",
    accepted_by: "test owner",
    accepted_at: "2026-07-18T00:00:00Z",
    acceptance_scope: "fixture",
    acceptance_rationale: "fixture",
    merge_policy: "shared-nyct-route-namespace-v1",
    components,
    current_bus_routes: {
      dataset_id: "h2wf-afav",
      official_url: "https://example.test/current.json",
      local_artifact_name: "current_bus_routes.json",
      sha256: sha256(currentBytes),
      captured_at: "2026-07-18T00:00:00Z",
      effective_as_of_date: "2026-07-18",
      valid_from: "2026-07-01",
      valid_to: "2026-07-31",
      row_count: 2,
      exact_route_id_count: 2,
      complete_universe: true,
      freshness_rule: "inclusive validity bounds",
    },
  };
  const receiptPath = join(root, "receipt.json");
  writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);
  return { root, feeds, currentPath, receiptPath, receipt };
}

function rewriteCompactOutput(
  directory: string,
  name: "route_activity.jsonl" | "route_inventory.jsonl",
  mutate: (rows: Array<Record<string, unknown>>) => void,
): void {
  const path = join(directory, name);
  const rows = readFileSync(path, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  mutate(rows);
  const bytes = `${rows.map((row) => stableJson(row as unknown as JsonValue)).join("\n")}\n`;
  writeFileSync(path, bytes);
  const manifestPath = join(directory, "manifest.json");
  const manifest = parseGtfsSnapshotManifestV2(JSON.parse(readFileSync(manifestPath, "utf8")));
  manifest.outputs[name] = { path: name, sha256: sha256(bytes), bytes: Buffer.byteLength(bytes), rows: rows.length };
  writeFileSync(manifestPath, serializeGtfsSnapshotManifestV2(manifest));
}

function rewriteCompactTextOutput(directory: string, name: "routes.txt", bytes: string): void {
  writeFileSync(join(directory, name), bytes);
  const manifestPath = join(directory, "manifest.json");
  const manifest = parseGtfsSnapshotManifestV2(JSON.parse(readFileSync(manifestPath, "utf8")));
  manifest.outputs[name] = {
    path: name,
    sha256: sha256(bytes),
    bytes: Buffer.byteLength(bytes),
    rows: bytes.trimEnd().split("\n").length - 1,
  };
  writeFileSync(manifestPath, serializeGtfsSnapshotManifestV2(manifest));
}

describe("strict receipt-backed GTFS snapshot installer", () => {
  it("strict-decodes receipt-v1 and rejects unknown keys or date drift", () => {
    const value = fixture();
    try {
      expect(parseGtfsAcquisitionReceiptV1(value.receipt).components).toHaveLength(6);
      expect(() => parseGtfsAcquisitionReceiptV1({ ...value.receipt, invented: true })).toThrow("strict keys mismatch");
      expect(() => parseGtfsAcquisitionReceiptV1({ ...value.receipt, service_window_start: "2026-07-11" })).toThrow("seven dates");
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  });

  it("double-builds, offline-verifies, and atomically installs exact identities and catalog disagreements", () => {
    const value = fixture();
    try {
      const snapshotsRoot = join(value.root, "snapshots");
      const installed = installGtfsSnapshot({ receiptPath: value.receiptPath, feeds: value.feeds, currentBusRoutesPath: value.currentPath, snapshotsRoot });
      expect(installed.route_identity_count).toBe(2);
      expect(installed.catalog_identity_count).toBe(2);
      expect(installed.catalog_only_count).toBe(1);
      expect(installed.gtfs_only_count).toBe(1);
      const verified = verifyGtfsSnapshotDirectory(installed.directory);
      expect(verified.deterministic_tree).toEqual(installed.deterministic_tree);
      const manifest = parseGtfsSnapshotManifestV2(JSON.parse(readFileSync(join(installed.directory, "manifest.json"), "utf8")));
      expect(manifest.current_catalog.catalog_routes.rows).toBe(2);
      const inventory = readFileSync(join(installed.directory, "route_inventory.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
      const b44 = inventory.find((row) => row.source_route_id === "B44+");
      expect(b44.gtfs_route_id).toBe("B44+");
      expect(b44.component_feed_ids).toHaveLength(5);
      expect(b44.display_label).toBe("B44-SBS");
      expect(b44.scheduled_trip_template_date_count).toBe(35);
      expect(b44.frequencies_present).toBe(true);
      const disagreements = readFileSync(join(installed.directory, "catalog_gtfs_disagreements.jsonl"), "utf8");
      expect(disagreements).toContain('"exact_route_id":"Q6"');
      expect(disagreements).toContain('"exact_route_id":"Q1"');
      expect(() => installGtfsSnapshot({ receiptPath: value.receiptPath, feeds: value.feeds, currentBusRoutesPath: value.currentPath, snapshotsRoot })).toThrow("cannot be overwritten");
      writeFileSync(join(installed.directory, "route_inventory.jsonl"), `${readFileSync(join(installed.directory, "route_inventory.jsonl"), "utf8")}{}\n`);
      expect(() => verifyGtfsSnapshotDirectory(installed.directory)).toThrow("bytes/SHA-256 mismatch");
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  });

  it("fails closed on archive drift, broken stop FKs, and unknown conditional reference classes", () => {
    const archiveDrift = fixture();
    try {
      writeFileSync(join(archiveDrift.root, "nyct-brooklyn.zip"), "drift");
      expect(() => installGtfsSnapshot({ receiptPath: archiveDrift.receiptPath, feeds: archiveDrift.feeds, currentBusRoutesPath: archiveDrift.currentPath, snapshotsRoot: join(archiveDrift.root, "snapshots") })).toThrow("archive SHA-256 mismatch");
    } finally {
      rmSync(archiveDrift.root, { recursive: true, force: true });
    }
    const brokenFk = fixture({ brokenStopFk: true });
    try {
      expect(() => installGtfsSnapshot({ receiptPath: brokenFk.receiptPath, feeds: brokenFk.feeds, currentBusRoutesPath: brokenFk.currentPath, snapshotsRoot: join(brokenFk.root, "snapshots") })).toThrow("unknown stop MISSING");
    } finally {
      rmSync(brokenFk.root, { recursive: true, force: true });
    }
    const unknownConditional = fixture({ unknownStopReference: true });
    try {
      expect(() => installGtfsSnapshot({ receiptPath: unknownConditional.receiptPath, feeds: unknownConditional.feeds, currentBusRoutesPath: unknownConditional.currentPath, snapshotsRoot: join(unknownConditional.root, "snapshots") })).toThrow("unknown conditional stop_times reference class");
    } finally {
      rmSync(unknownConditional.root, { recursive: true, force: true });
    }
  });

  it("records Current-vs-GTFS label differences and exact source-ID fallback provenance", () => {
    const different = fixture({ currentLabelDiff: true });
    try {
      const installed = installGtfsSnapshot({
        receiptPath: different.receiptPath,
        feeds: different.feeds,
        currentBusRoutesPath: different.currentPath,
        snapshotsRoot: join(different.root, "snapshots"),
      });
      const inventory = readFileSync(join(installed.directory, "route_inventory.jsonl"), "utf8")
        .trimEnd().split("\n").map((line) => JSON.parse(line));
      const b44 = inventory.find((row) => row.source_route_id === "B44+");
      expect(b44.display_label).toBe("B44 Official SBS");
      expect(b44.label_fallback).toBeNull();
      expect(b44.label_diff).toEqual({
        current_bus_routes_route_short_name: "B44 Official SBS",
        gtfs_route_short_name: "B44-SBS",
      });
    } finally {
      rmSync(different.root, { recursive: true, force: true });
    }

    const fallback = fixture({ sourceIdLabelFallback: true });
    try {
      const installed = installGtfsSnapshot({
        receiptPath: fallback.receiptPath,
        feeds: fallback.feeds,
        currentBusRoutesPath: fallback.currentPath,
        snapshotsRoot: join(fallback.root, "snapshots"),
      });
      const inventory = readFileSync(join(installed.directory, "route_inventory.jsonl"), "utf8")
        .trimEnd().split("\n").map((line) => JSON.parse(line));
      const q1 = inventory.find((row) => row.source_route_id === "Q1");
      expect(q1.display_label).toBe("Q1");
      expect(q1.display_label_source).toBe("source_route_id");
      expect(q1.label_fallback).toBe("source_route_id");
      expect(q1.label_diff).toBeNull();
    } finally {
      rmSync(fallback.root, { recursive: true, force: true });
    }
  });

  it("rejects re-signed semantic drift, undeclared files, and symlinks", () => {
    const activityDrift = fixture();
    try {
      const installed = installGtfsSnapshot({
        receiptPath: activityDrift.receiptPath,
        feeds: activityDrift.feeds,
        currentBusRoutesPath: activityDrift.currentPath,
        snapshotsRoot: join(activityDrift.root, "snapshots"),
      });
      rewriteCompactOutput(installed.directory, "route_activity.jsonl", (rows) => {
        rows[0]!.frequencies_present = !rows[0]!.frequencies_present;
      });
      expect(() => verifyGtfsSnapshotDirectory(installed.directory)).toThrow("activity projection differs");
    } finally {
      rmSync(activityDrift.root, { recursive: true, force: true });
    }

    const unknownEnum = fixture();
    try {
      const installed = installGtfsSnapshot({
        receiptPath: unknownEnum.receiptPath,
        feeds: unknownEnum.feeds,
        currentBusRoutesPath: unknownEnum.currentPath,
        snapshotsRoot: join(unknownEnum.root, "snapshots"),
      });
      rewriteCompactOutput(installed.directory, "route_inventory.jsonl", (rows) => {
        rows[0]!.scheduled_in_window = "future";
      });
      expect(() => verifyGtfsSnapshotDirectory(installed.directory)).toThrow("expected one of");
    } finally {
      rmSync(unknownEnum.root, { recursive: true, force: true });
    }

    const routeProjectionDrift = fixture();
    try {
      const installed = installGtfsSnapshot({
        receiptPath: routeProjectionDrift.receiptPath,
        feeds: routeProjectionDrift.feeds,
        currentBusRoutesPath: routeProjectionDrift.currentPath,
        snapshotsRoot: join(routeProjectionDrift.root, "snapshots"),
      });
      const routes = readFileSync(join(installed.directory, "routes.txt"), "utf8").replace("B44-SBS", "B44-DRIFT");
      rewriteCompactTextOutput(installed.directory, "routes.txt", routes);
      expect(() => verifyGtfsSnapshotDirectory(installed.directory)).toThrow("projection differs from route inventory");
    } finally {
      rmSync(routeProjectionDrift.root, { recursive: true, force: true });
    }

    const pathDrift = fixture();
    try {
      const installed = installGtfsSnapshot({
        receiptPath: pathDrift.receiptPath,
        feeds: pathDrift.feeds,
        currentBusRoutesPath: pathDrift.currentPath,
        snapshotsRoot: join(pathDrift.root, "snapshots"),
      });
      const extraPath = join(installed.directory, "undeclared.txt");
      writeFileSync(extraPath, "not declared\n");
      expect(() => verifyGtfsSnapshotDirectory(installed.directory)).toThrow("exact file set mismatch");
      rmSync(extraPath);
      const receiptBackup = join(pathDrift.root, "installed-receipt.json");
      renameSync(join(installed.directory, "receipt.json"), receiptBackup);
      symlinkSync(receiptBackup, join(installed.directory, "receipt.json"));
      expect(() => verifyGtfsSnapshotDirectory(installed.directory)).toThrow("regular file");
    } finally {
      rmSync(pathDrift.root, { recursive: true, force: true });
    }
  });
});
