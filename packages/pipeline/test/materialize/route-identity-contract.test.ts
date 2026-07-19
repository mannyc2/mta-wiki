import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import {
  parseGtfsSnapshotManifestV2,
  parseRouteInventoryJsonl,
  routeFamilyId,
  serializeGtfsSnapshotManifestV2,
  serializeRouteInventoryJsonl,
  type GtfsSnapshotManifestV2,
  type RouteInventoryRow,
} from "../../src/materialize/route-identity-contract.js";

const manifest = JSON.parse(readFileSync(
  `${repoRoot}/data/reference/gtfs/snapshots/mta-bus-2026-07-18-route-provenance-v1/manifest.json`,
  "utf8",
)) as GtfsSnapshotManifestV2;

const row: RouteInventoryRow = {
  dataset_id: "mta-nyct-bus", component_feed_ids: ["nyct-brooklyn"], source_route_id: "B44+", gtfs_route_id: "B44+",
  agency_id: "MTA NYCT", raw_route_type: "3", route_family_id: "B44", route_short_name: "B44-SBS", route_long_name: null,
  route_desc: null, declared_in_feed: true, catalog_in_effect: "yes", catalog_effective_as_of_date: "2026-07-18",
  reliability_status: "reliable", scheduled_in_window: "yes", scheduled_service_dates: ["2026-07-18"],
  scheduled_trip_template_date_count: 1, frequencies_present: false, designation_literals: ["route_type:SBS"],
  normalized_service_modes: ["sbs"], display_label: "B44-SBS", display_label_source: "current_bus_routes",
  reliable_interval_start: "2026-06-27", reliable_interval_end: "2026-09-05",
  reliable_interval_derivation: "component_feed_bounds_intersection_v1", label_fallback: null, label_diff: null,
  snapshot_id: "mta-bus-2026-07-18-route-provenance-v1",
};

describe("route identity contracts", () => {
  it("self-decodes deterministic manifest and inventory bytes", () => {
    expect(parseGtfsSnapshotManifestV2(JSON.parse(serializeGtfsSnapshotManifestV2(manifest)))).toEqual(manifest);
    expect(parseRouteInventoryJsonl(serializeRouteInventoryJsonl([row]))).toEqual([row]);
    expect(routeFamilyId("M14A+")).toBe("M14A");
  });
  it("fails closed on unknown fields, modes, identity collapse, and uncovered windows", () => {
    expect(() => parseGtfsSnapshotManifestV2({ ...manifest, surprise: true })).toThrow("strict keys mismatch");
    expect(() => parseGtfsSnapshotManifestV2({ ...manifest, service_window_start: "2026-07-11" })).toThrow("service window");
    expect(() => parseRouteInventoryJsonl(`${stableJson({ ...row, gtfs_route_id: "B44" })}\n`)).toThrow("must equal");
    expect(() => parseRouteInventoryJsonl(`${stableJson({ ...row, normalized_service_modes: ["future_mode"] })}\n`)).toThrow("unsupported value");
  });
});
