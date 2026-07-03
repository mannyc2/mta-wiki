import { describe, expect, it } from "bun:test";
import { computeRouteAnchors, routeAnchorsJsonl, type GtfsRoute } from "@mta-wiki/pipeline/materialize/route-anchors";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";

function route(recordId: string, payload: JsonObject, aliases: string[] = [], sourceIds: string[] = ["source_a"]): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_aliases: aliases,
    record_kind: "route",
    source_id: sourceIds[0] ?? "source_a",
    source_ids: sourceIds,
    local_observation_id: recordId,
    display_name: recordId,
    payload,
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-03T00:00:00.000Z",
  };
}

const gtfs = (routeId: string, shortName = routeId): GtfsRoute => ({
  route_id: routeId,
  short_name: shortName,
  long_name: `${shortName} test route`,
  agency_id: "MTA NYCT",
  borough: "Brooklyn",
  gtfs_feed_date: "2026-03-19_mta_bus_all",
});

describe("computeRouteAnchors", () => {
  it("anchors a B44 variant set to the umbrella short-name match and records variants", () => {
    const rows = computeRouteAnchors(
      [
        route("route_b44-sbs", { route_id: "B44", route_label: "B44 SBS", route_record_scope: "true_route" }, ["route_b44-plus"]),
        route("route_b44-brt-phase2", { route_id: "B44", route_label: "B44", route_record_scope: "true_route" }),
        route("route_b44-local", { route_id: "B44", route_label: "B44 Local", route_record_scope: "true_route" }),
        route("route_b44-limited", { route_id: "B44", route_label: "B44 Limited", route_record_scope: "true_route" }),
      ],
      [gtfs("B44")],
    );

    expect(rows).toEqual([
      {
        gtfs_route_id: "B44",
        canonical_route_record_id: "route_b44-brt-phase2",
        variant_record_ids: ["route_b44-limited", "route_b44-local", "route_b44-sbs"],
        aliases: ["B44", "B44 Limited", "B44 Local", "B44 SBS", "route_b44-plus"],
        disposition: "true_route",
        anchor_reason: "label_matches_gtfs_short_name",
      },
    ]);
  });

  it("anchors a single true-route candidate with a deterministic reason", () => {
    const rows = computeRouteAnchors([route("route_b35", { route_id: "B35", route_label: "Church Avenue", route_record_scope: "true_route" })], [gtfs("B35")]);
    expect(rows[0]?.canonical_route_record_id).toBe("route_b35");
    expect(rows[0]?.anchor_reason).toBe("max_source_count");
  });

  it("emits no_wiki_coverage when GTFS has no canonical route candidate", () => {
    const rows = computeRouteAnchors([], [gtfs("Q99")]);
    expect(rows[0]).toEqual({
      gtfs_route_id: "Q99",
      canonical_route_record_id: null,
      variant_record_ids: [],
      aliases: [],
      disposition: "no_wiki_coverage",
      anchor_reason: null,
    });
  });

  it("lets a reviewed override win over deterministic rules", () => {
    const rows = computeRouteAnchors(
      [
        route("route_b1-primary", { route_id: "B1", route_label: "B1", route_record_scope: "true_route" }),
        route("route_b1-reviewed", { route_id: "B1", route_label: "B1 Reviewed", route_record_scope: "true_route" }),
      ],
      [gtfs("B1")],
      { B1: "route_b1-reviewed" },
    );
    expect(rows[0]?.canonical_route_record_id).toBe("route_b1-reviewed");
    expect(rows[0]?.anchor_reason).toBe("manual_override");
  });

  it("uses lexicographic tiebreak when labels and source breadth do not decide", () => {
    const rows = computeRouteAnchors(
      [
        route("route_b2_z", { route_id: "B2", route_label: "B2 East", route_record_scope: "true_route" }),
        route("route_b2_a", { route_id: "B2", route_label: "B2 West", route_record_scope: "true_route" }),
      ],
      [gtfs("B2")],
    );
    expect(rows[0]?.canonical_route_record_id).toBe("route_b2_a");
    expect(rows[0]?.anchor_reason).toBe("lexicographic_tiebreak");
  });

  it("emits reviewed null-route disposition rows", () => {
    const rows = computeRouteAnchors([route("route_b3-draft-plan", { route_label: "B3", route_name: "Avenue U" })], []);
    expect(rows).toEqual([
      {
        gtfs_route_id: null,
        canonical_route_record_id: "route_b3-draft-plan",
        variant_record_ids: [],
        aliases: ["Avenue U", "B3"],
        disposition: "proposal",
        anchor_reason: "Draft-plan proposal record tied to B3 planning context rather than an operating GTFS route id.",
      },
    ]);
  });

  it("is deterministic when inputs are shuffled", () => {
    const records = [
      route("route_b4_b", { route_id: "B4", route_label: "B4 West", route_record_scope: "true_route" }, ["route_b4-west"], ["source_a", "source_b"]),
      route("route_b4_a", { route_id: "B4", route_label: "B4 East", route_record_scope: "true_route" }),
      route("route_b3-draft-plan", { route_label: "B3", route_name: "Avenue U" }),
    ];
    const first = routeAnchorsJsonl(computeRouteAnchors(records, [gtfs("B4"), gtfs("B5")]));
    const second = routeAnchorsJsonl(computeRouteAnchors([...records].reverse(), [gtfs("B5"), gtfs("B4")]));
    expect(second).toBe(first);
  });
});
