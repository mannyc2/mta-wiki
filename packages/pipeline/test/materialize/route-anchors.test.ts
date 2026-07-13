import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeRouteAnchors,
  readRouteAnchorReview,
  routeAnchorsJsonl,
  type GtfsRoute,
  type ReviewedNonGtfsRouteDispositions,
} from "@mta-wiki/pipeline/materialize/route-anchors";
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

  it("excludes a reviewed historical route-number reuse before selecting the current anchor", () => {
    const historical = route(
      "route_q48-serves-lga-2011",
      { route_id: "Q48", route_label: "Q48", route_record_scope: "true_route" },
      ["route_q48"],
      ["source_2011", "source_2012"],
    );
    const current = route(
      "route_q48-qbnr-2025",
      { route_id: "Q48", route_label: "Q48", route_record_scope: "true_route" },
      [],
      ["source_2025"],
    );
    const dispositions: ReviewedNonGtfsRouteDispositions = {
      "route_q48-serves-lga-2011": {
        disposition: "historical_retired",
        reason: "The 2011 airport route was retired; the current Q48 reuses its number for a distinct service.",
        expected_route_id: "Q48",
      },
    };

    const rows = computeRouteAnchors(
      [historical, current],
      [gtfs("Q48")],
      { Q48: "route_q48-qbnr-2025" },
      dispositions,
    );

    expect(rows).toEqual([
      {
        gtfs_route_id: "Q48",
        canonical_route_record_id: "route_q48-qbnr-2025",
        variant_record_ids: [],
        aliases: ["Q48"],
        disposition: "true_route",
        anchor_reason: "manual_override",
      },
      {
        gtfs_route_id: null,
        canonical_route_record_id: "route_q48-serves-lga-2011",
        variant_record_ids: [],
        aliases: ["Q48", "route_q48"],
        disposition: "historical_retired",
        anchor_reason: "The 2011 airport route was retired; the current Q48 reuses its number for a distinct service.",
      },
    ]);
    expect(rows[0]?.variant_record_ids).not.toContain("route_q48-serves-lga-2011");

    const shuffled = computeRouteAnchors(
      [current, historical],
      [gtfs("Q48")],
      { Q48: "route_q48-qbnr-2025" },
      dispositions,
    );
    expect(routeAnchorsJsonl(shuffled)).toBe(routeAnchorsJsonl(rows));
  });

  it("fails closed on stale or inapplicable reviewed non-GTFS dispositions", () => {
    const historical = route("route_q48-old", { route_id: "Q48", route_label: "Q48", route_record_scope: "true_route" });

    expect(() =>
      computeRouteAnchors([historical], [gtfs("Q48")], {}, {
        "route_missing": {
          disposition: "historical_retired",
          reason: "Missing record",
          expected_route_id: "Q48",
        },
      }),
    ).toThrow("is stale: canonical record not found");

    expect(() =>
      computeRouteAnchors([historical], [gtfs("Q48")], {}, {
        "route_q48-old": {
          disposition: "historical_retired",
          reason: "Stale route-number binding",
          expected_route_id: "Q49",
        },
      }),
    ).toThrow('is stale: expected route_id "Q49", found "Q48"');

    expect(() =>
      computeRouteAnchors([historical], [gtfs("Q48")], {}, {
        "route_q48-old": {
          disposition: "proposal",
          reason: "Wrong disposition for a literal route id",
          expected_route_id: "Q48",
        },
      }),
    ).toThrow("disposition must be historical_retired");

    expect(() =>
      computeRouteAnchors(
        [historical],
        [gtfs("Q48")],
        { Q48: "route_q48-old" },
        {
          "route_q48-old": {
            disposition: "historical_retired",
            reason: "Retired route",
            expected_route_id: "Q48",
          },
        },
      ),
    ).toThrow("points to non-candidate route_q48-old");

    expect(() =>
      computeRouteAnchors(
        [route("route_b3-draft-plan", { route_id: "B3", route_label: "B3" })],
        [gtfs("B3")],
      ),
    ).toThrow("is stale: expected route_id null, found \"B3\"");

    expect(() =>
      computeRouteAnchors(
        [route("route_q48-current", { route_id: "Q48", route_label: "Q48", route_record_scope: "true_route" })],
        [gtfs("Q48")],
        { Q84: "route_q48-current" },
      ),
    ).toThrow("Route anchor override for Q84 is stale: GTFS route not found");
  });

  it("strictly parses reviewed route-anchor exception files", () => {
    const dir = mkdtempSync(join(tmpdir(), "route-anchor-review-"));
    try {
      const path = join(dir, "review.json");
      expect(() => readRouteAnchorReview(path)).toThrow("Reviewed route-anchor exception file is required");
      writeFileSync(
        path,
        JSON.stringify({
          overrides: { Q48: "route_q48-current" },
          non_gtfs_dispositions: {
            "route_q48-old": {
              disposition: "historical_retired",
              reason: "Reviewed number reuse",
              expected_route_id: "Q48",
            },
          },
        }),
      );
      expect(readRouteAnchorReview(path)).toEqual({
        overrides: { Q48: "route_q48-current" },
        non_gtfs_dispositions: {
          "route_q48-old": {
            disposition: "historical_retired",
            reason: "Reviewed number reuse",
            expected_route_id: "Q48",
          },
        },
      });

      writeFileSync(path, JSON.stringify({ overrides: {}, non_gtfs_dispositions: [] }));
      expect(() => readRouteAnchorReview(path)).toThrow("expected object");

      writeFileSync(
        path,
        JSON.stringify({
          overrides: {},
          non_gtfs_dispositions: {
            "route_q48-old": { disposition: "historical_retired", reason: "Missing freshness binding" },
          },
        }),
      );
      expect(() => readRouteAnchorReview(path)).toThrow("expected_route_id must be non-empty string or null");

      writeFileSync(
        path,
        JSON.stringify({
          overrides: {},
          non_gtfs_dispositions: {
            "route_q48-old": { disposition: "historical_retried", reason: "Typo", expected_route_id: "Q48" },
          },
        }),
      );
      expect(() => readRouteAnchorReview(path)).toThrow("disposition must be one of");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
