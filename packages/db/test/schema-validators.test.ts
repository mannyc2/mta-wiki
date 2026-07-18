// B2 (row validators from the single model source) + B5 (rebuild-based versioning) gates.

import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANONICAL_DB_VERSION, openCanonicalDb, rebuildCanonicalDb } from "../src/canonical-db.js";
import { requiredColumns, validateRow } from "../src/schema-validators.js";

describe("schema row validators (B2)", () => {
  it("required columns mirror the records NOT NULL / PRIMARY KEY columns", () => {
    expect(requiredColumns("records")).toEqual([
      "display_name",
      "generated_at",
      "local_observation_id",
      "payload",
      "primary_source_id",
      "record_id",
      "record_kind",
      "review_state",
      "truth_status",
    ]);
  });

  it("accepts a complete records row and rejects a missing NOT NULL field", () => {
    const ok = {
      record_id: "r1",
      record_kind: "route",
      display_name: "M14",
      raw_text: null,
      local_observation_id: "obs1",
      primary_source_id: "src1",
      payload: "{}",
      truth_status: "source_stated",
      review_state: "unreviewed",
      generated_at: "2026-06-10T00:00:00Z",
    };
    expect(validateRow("records", ok)).toEqual([]);
    const { display_name, ...missing } = ok;
    expect(validateRow("records", missing).length).toBeGreaterThan(0);
  });

  it("accepts null for a nullable promoted column and rejects a stray key", () => {
    expect(validateRow("routes", { record_id: "r1", route_id: null })).toEqual([]);
    expect(validateRow("routes", { record_id: "r1", route_id: "M14" })).toEqual([]);
    expect(validateRow("routes", { record_id: "r1", not_a_column: "x" }).length).toBeGreaterThan(0);
  });

  it("validates the complete exact route-inventory SQL projection", () => {
    const row = {
      snapshot_id: "mta-bus-2026-07-18",
      dataset_id: "mta-nyct-bus",
      source_route_id: "B44+",
      gtfs_route_id: "B44+",
      component_feed_ids_json: '["nyct-brooklyn"]',
      agency_id: "MTA NYCT",
      raw_route_type: "3",
      route_family_id: "B44",
      route_short_name: "B44-SBS",
      route_long_name: "Sheepshead Bay - Williamsburg",
      route_desc: null,
      declared_in_feed: 1,
      catalog_in_effect: "yes",
      catalog_effective_as_of_date: "2026-07-18",
      reliable_interval_start: "2026-06-27",
      reliable_interval_end: "2026-09-05",
      reliable_interval_derivation: "component_feed_bounds_intersection_v1",
      reliability_status: "reliable",
      scheduled_in_window: "yes",
      scheduled_service_dates_json: '["2026-07-18"]',
      scheduled_trip_template_date_count: 10,
      frequencies_present: 0,
      designation_literals_json: '["route_type:SBS","trip_type:14"]',
      normalized_service_modes_json: '["sbs"]',
      display_label: "B44-SBS",
      display_label_source: "current_bus_routes",
      label_fallback: null,
      label_diff_json: null,
    };
    expect(validateRow("ref_gtfs_route_inventory", row)).toEqual([]);
    expect(requiredColumns("ref_gtfs_route_inventory")).toEqual(expect.arrayContaining([
      "snapshot_id",
      "dataset_id",
      "source_route_id",
      "gtfs_route_id",
      "catalog_in_effect",
      "scheduled_in_window",
      "display_label",
    ]));
    const { snapshot_id, ...missingSnapshot } = row;
    expect(validateRow("ref_gtfs_route_inventory", missingSnapshot).length).toBeGreaterThan(0);
    expect(validateRow("ref_gtfs_route_inventory", { ...row, extra: "drift" }).length).toBeGreaterThan(0);
  });

  it("returns [] for unknown tables (no validator) rather than throwing", () => {
    expect(validateRow("nonexistent_table", { a: 1 })).toEqual([]);
  });
});

describe("rebuild-based versioning (B5)", () => {
  it("a freshly rebuilt DB carries user_version === CANONICAL_DB_VERSION and opens cleanly", () => {
    const path = join(tmpdir(), "version-gate.db");
    rebuildCanonicalDb([], {
      path,
      evidenceRegistry: { provenance: "test_fixture", entries: [] },
    });
    const db = openCanonicalDb(path, { readonly: true });
    try {
      const version = Number((db.query("PRAGMA user_version").get() as { user_version: number }).user_version);
      expect(version).toBe(CANONICAL_DB_VERSION);
    } finally {
      db.close();
    }
  });
});
