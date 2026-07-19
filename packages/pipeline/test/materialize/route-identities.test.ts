import { describe, expect, it } from "bun:test";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import { buildRouteIdentityAudit, proposeRouteBindings, routeIdentityAuditSha256 } from "../../src/materialize/route-identities.js";
import type { RouteInventoryRow } from "../../src/materialize/route-identity-contract.js";

function record(id: string, payload: Record<string, string>): MtaCanonicalRecord { return { record_id: id, record_kind: "route", source_id: "s", source_ids: ["s"], local_observation_id: id, local_observation_ids: [id], display_name: id, raw_text: null, payload, evidence_refs: [], submission_ids: [], truth_status: "source_stated", review_state: "unreviewed", generated_at: "2026-07-18T00:00:00Z" }; }
function identity(id: string): RouteInventoryRow { return { dataset_id: "mta-nyct-bus", component_feed_ids: ["nyct-brooklyn"], source_route_id: id, gtfs_route_id: id, agency_id: "MTA NYCT", raw_route_type: "3", route_family_id: id.replace(/\+$/u, ""), route_short_name: id, route_long_name: null, route_desc: null, declared_in_feed: true, catalog_in_effect: "yes", catalog_effective_as_of_date: "2026-07-18", reliability_status: "reliable", scheduled_in_window: "yes", scheduled_service_dates: ["2026-07-18"], scheduled_trip_template_date_count: 1, frequencies_present: false, designation_literals: [], normalized_service_modes: [], display_label: id, display_label_source: "gtfs", reliable_interval_start: "2026-06-27", reliable_interval_end: "2026-09-05", reliable_interval_derivation: "component_feed_bounds_intersection_v1", label_fallback: null, label_diff: null, snapshot_id: "s" }; }

describe("route identity proposals", () => {
  it("uses authoritative internal ID before exact source ID and never family-falls back", () => {
    const rows = proposeRouteBindings([record("sbs", { route_id: "B44", internal_route_id: "B44+", route_id_authority: "mta_internal", service_variant: "sbs" }), record("local", { route_id: "B44", service_variant: "local" }), record("family", { route_id: "b44" })], [identity("B44"), identity("B44+")]);
    expect(rows.map((row) => row.gtfs_route_id)).toEqual([null, "B44", "B44+"]);
    expect(rows[0]!.derivation).toBe("no_exact_case_sensitive_identity_v1"); expect(rows[2]!.derivation).toBe("authoritative_internal_route_id_exact_v1");
    expect(rows.every((row) => row.projectable === false && row.proposed_only)).toBeTrue();
  });
  it("is deterministic and rejects exported collisions", () => {
    const records = [record("b", { route_id: "B44" }), record("a", { route_id: "B44+" })]; const inventory = [identity("B44"), identity("B44+")];
    const left = buildRouteIdentityAudit("s", records, inventory); const right = buildRouteIdentityAudit("s", [...records].reverse(), [...inventory].reverse());
    expect(routeIdentityAuditSha256(left)).toBe(routeIdentityAuditSha256(right));
    expect(() => proposeRouteBindings(records, [identity("B44"), identity("B44")])).toThrow("collision");
  });
});
