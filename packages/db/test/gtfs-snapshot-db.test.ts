import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalDbDump } from "../src/canonical-db.js";
import {
  gtfsReferenceRoot,
  loadSelectedGtfsSnapshotTables,
} from "../src/gtfs-snapshot-db.js";
import { SCHEMA_DDL } from "../src/schema-ddl.js";

const SNAPSHOT_ID = "mta-bus-2026-07-18-route-provenance-v1";
const MANIFEST_SHA256 = "aee23d3178f1ae6040b5687a76d156f01f89530b807f8b9865f22fca1c9c09c9";
const work = mkdtempSync(join(tmpdir(), "mta-wiki-gtfs-snapshot-db-"));
const selectedStage = join(work, "selected");

function freshDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const statement of SCHEMA_DDL) db.exec(statement);
  return db;
}

function count(db: Database, table: string): number {
  return Number((db.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
}

beforeAll(() => {
  const snapshots = join(selectedStage, "snapshots");
  mkdirSync(snapshots, { recursive: true });
  cpSync(
    join(gtfsReferenceRoot(), "snapshots", SNAPSHOT_ID),
    join(snapshots, SNAPSHOT_ID),
    { recursive: true },
  );
  writeFileSync(join(selectedStage, "SELECTED"), `${SNAPSHOT_ID}\n`, "utf8");
});

afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("selected immutable route snapshot -> canonical DB", () => {
  it("no-ops when SELECTED is absent", () => {
    const absent = join(work, "absent");
    mkdirSync(absent, { recursive: true });
    const db = freshDb();
    try {
      expect(loadSelectedGtfsSnapshotTables(db, absent)).toEqual({
        selected: false,
        snapshot_id: null,
        manifest_sha256: null,
        route_inventory: 0,
        route_activity: 0,
        catalog_routes: 0,
        catalog_disagreements: 0,
      });
      expect(count(db, "ref_gtfs_snapshots")).toBe(0);
      expect(count(db, "ref_gtfs_route_inventory")).toBe(0);
      expect(count(db, "ref_gtfs_route_activity")).toBe(0);
      expect(count(db, "ref_current_bus_route_catalog")).toBe(0);
      expect(count(db, "ref_gtfs_catalog_disagreements")).toBe(0);
    } finally {
      db.close();
    }
  });

  it("rejects an unsafe or non-canonical pointer before reading snapshot content", () => {
    const unsafe = join(work, "unsafe");
    mkdirSync(unsafe, { recursive: true });
    writeFileSync(join(unsafe, "SELECTED"), "../escape\n", "utf8");
    const db = freshDb();
    try {
      expect(() => loadSelectedGtfsSnapshotTables(db, unsafe)).toThrow(
        "one safe snapshot ID followed by exactly one newline",
      );
      expect(count(db, "ref_gtfs_snapshots")).toBe(0);
    } finally {
      db.close();
    }
  });

  it("loads exact inventory/activity/catalog/disagreement facts with complete parity", () => {
    const db = freshDb();
    try {
      expect(loadSelectedGtfsSnapshotTables(db, selectedStage)).toEqual({
        selected: true,
        snapshot_id: SNAPSHOT_ID,
        manifest_sha256: MANIFEST_SHA256,
        route_inventory: 399,
        route_activity: 399,
        catalog_routes: 386,
        catalog_disagreements: 35,
      });
      expect(count(db, "ref_gtfs_snapshots")).toBe(1);
      expect(count(db, "ref_gtfs_route_inventory")).toBe(399);
      expect(count(db, "ref_gtfs_route_activity")).toBe(399);
      expect(count(db, "ref_current_bus_route_catalog")).toBe(386);
      expect(count(db, "ref_gtfs_catalog_disagreements")).toBe(35);

      const snapshot = db.query(`SELECT manifest_sha256, route_identity_count,
        route_activity_count, catalog_identity_count, catalog_only_count, gtfs_only_count
        FROM ref_gtfs_snapshots`).get() as Record<string, string | number>;
      expect(snapshot).toEqual({
        manifest_sha256: MANIFEST_SHA256,
        route_identity_count: 399,
        route_activity_count: 399,
        catalog_identity_count: 386,
        catalog_only_count: 11,
        gtfs_only_count: 24,
      });
      expect(db.query(`SELECT disagreement_type, COUNT(*) AS count
        FROM ref_gtfs_catalog_disagreements
        GROUP BY disagreement_type
        ORDER BY disagreement_type`).all()).toEqual([
        { disagreement_type: "catalog_only", count: 11 },
        { disagreement_type: "gtfs_only", count: 24 },
      ]);

      const mismatchCount = Number((db.query(`SELECT COUNT(*) AS count
        FROM ref_gtfs_route_inventory inventory
        JOIN ref_gtfs_route_activity activity
          ON activity.snapshot_id = inventory.snapshot_id
         AND activity.dataset_id = inventory.dataset_id
         AND activity.source_route_id = inventory.source_route_id
        WHERE activity.gtfs_route_id IS NOT inventory.gtfs_route_id
           OR activity.component_feed_ids_json IS NOT inventory.component_feed_ids_json
           OR activity.scheduled_service_dates_json IS NOT inventory.scheduled_service_dates_json
           OR activity.scheduled_trip_template_date_count IS NOT inventory.scheduled_trip_template_date_count
           OR activity.scheduled_in_window IS NOT inventory.scheduled_in_window
           OR activity.reliability_status IS NOT inventory.reliability_status
           OR activity.frequencies_present IS NOT inventory.frequencies_present`).get() as { count: number }).count);
      expect(mismatchCount).toBe(0);

      const exactB44 = db.query(`SELECT source_route_id, route_family_id, display_label,
        display_label_source, normalized_service_modes_json, reliable_interval_start,
        reliable_interval_end, reliable_interval_derivation, label_fallback, label_diff_json
        FROM ref_gtfs_route_inventory
        WHERE source_route_id IN ('B44','B44+')
        ORDER BY source_route_id`).all();
      expect(exactB44).toEqual([
        {
          source_route_id: "B44",
          route_family_id: "B44",
          display_label: "B44",
          display_label_source: "current_bus_routes",
          normalized_service_modes_json: '["local"]',
          reliable_interval_start: "2026-06-28",
          reliable_interval_end: "2026-09-05",
          reliable_interval_derivation: "component_feed_bounds_intersection_v1",
          label_fallback: null,
          label_diff_json: null,
        },
        {
          source_route_id: "B44+",
          route_family_id: "B44",
          display_label: "B44-SBS",
          display_label_source: "current_bus_routes",
          normalized_service_modes_json: '["sbs"]',
          reliable_interval_start: "2026-06-28",
          reliable_interval_end: "2026-09-05",
          reliable_interval_derivation: "component_feed_bounds_intersection_v1",
          label_fallback: null,
          label_diff_json: null,
        },
      ]);

      expect(db.query(`SELECT disagreement_type, exact_route_id
        FROM ref_gtfs_catalog_disagreements
        WHERE exact_route_id IN ('Q6','Q06')
        ORDER BY disagreement_type, exact_route_id`).all()).toEqual([
        { disagreement_type: "catalog_only", exact_route_id: "Q6" },
        { disagreement_type: "gtfs_only", exact_route_id: "Q06" },
      ]);
      expect(count(db, "ref_current_bus_route_catalog")).toBe(386);
      expect(db.query("SELECT exact_route_id FROM ref_current_bus_route_catalog WHERE exact_route_id = 'Q6'").get()).toEqual({ exact_route_id: "Q6" });
      expect(db.query("SELECT exact_route_id FROM ref_current_bus_route_catalog WHERE exact_route_id = 'Q06'").get()).toBeNull();
    } finally {
      db.close();
    }
  });

  it("loads deterministically into two independent schema builds", () => {
    const first = freshDb();
    const second = freshDb();
    try {
      loadSelectedGtfsSnapshotTables(first, selectedStage);
      loadSelectedGtfsSnapshotTables(second, selectedStage);
      expect(canonicalDbDump(first)).toBe(canonicalDbDump(second));
    } finally {
      first.close();
      second.close();
    }
  });
});
