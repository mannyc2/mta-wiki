import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "bun:test";
import { identityReviewCandidateEdgesForTest, identityReviewRouteInfoForTest, identityReviewSuggestionState } from "@mta-wiki/agents/identity-review";

describe("identity review suggestion retry state", () => {
  it("treats parse-error and malformed suggestion files as retryable", () => {
    const dir = mkdtempSync(join(tmpdir(), "mta-identity-review-"));
    try {
      const parseErrorPath = join(dir, "parse-error.json");
      const malformedPath = join(dir, "malformed.json");
      writeFileSync(parseErrorPath, JSON.stringify({ parse_error: "429 status code", raw_response: "" }), "utf8");
      writeFileSync(malformedPath, "{not json", "utf8");

      expect(identityReviewSuggestionState(parseErrorPath)).toBe("retryable");
      expect(identityReviewSuggestionState(malformedPath)).toBe("retryable");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips only suggestion files with a parseable suggestion object", () => {
    const dir = mkdtempSync(join(tmpdir(), "mta-identity-review-"));
    try {
      const validPath = join(dir, "valid.json");
      writeFileSync(validPath, JSON.stringify({ suggestion: { merge_groups: [], do_not_merge: [], ambiguous: [] } }), "utf8");

      expect(identityReviewSuggestionState(validPath)).toBe("valid");
      expect(identityReviewSuggestionState(join(dir, "missing.json"))).toBe("missing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("identity review route base parser", () => {
  it("prefers exact payload route_id over incidental route mentions in labels", () => {
    const info = identityReviewRouteInfoForTest({
      source_labels: ["B82E express route near B82 local context"],
      payload_identity_fields: {
        route_id: "B82E",
        route_type: "express",
        description: "B82E service discussed alongside B82 local service",
      },
    });

    expect(info.baseRoute).toBe("B82E");
    expect(info.baseRoute).not.toBe("B82");
  });

  it("does not reduce distinct Staten Island bus ids to neighboring route mentions", () => {
    const info = identityReviewRouteInfoForTest({
      source_labels: ["S93 route with transfer context near S53"],
      payload_identity_fields: {
        route_id: "S93",
        route_type: "local",
        description: "S93 route discussion mentions S53 transfer context",
      },
    });

    expect(info.baseRoute).toBe("S93");
    expect(info.baseRoute).not.toBe("S53");
  });

  it("does not emit an advisory base route for slash-composite route ids", () => {
    const info = identityReviewRouteInfoForTest({
      source_labels: ["Q52/Q53 SBS proposal"],
      payload_identity_fields: {
        route_id: "Q52/Q53",
        route_label: "Q52/53 SBS",
        route_type: "Select Bus Service",
      },
    });

    expect(info.baseRoute).toBeUndefined();
    expect(info.variants).toContain("sbs");
  });

  it("does not create variant-only duplicate pressure for sparse named SBS routes", () => {
    const sparseRoutes = [
      {
        record_id: "route_34th-st-sbs",
        record_kind: "route" as const,
        source_ids: ["brt_route_index"],
        source_labels: ["34th Street Select Bus Service"],
        payload_identity_fields: {
          route_name: "34th Street Select Bus Service",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
        },
      },
      {
        record_id: "route_fordham-pelham-pkwy-sbs",
        record_kind: "route" as const,
        source_ids: ["brt_route_index"],
        source_labels: ["Fordham Road-Pelham Parkway Select Bus Service"],
        payload_identity_fields: {
          route_name: "Fordham Road-Pelham Parkway Select Bus Service",
          borough: "Bronx",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
        },
      },
      {
        record_id: "route_hylan-blvd-sbs",
        record_kind: "route" as const,
        source_ids: ["brt_route_index"],
        source_labels: ["Hylan Boulevard Select Bus Service"],
        payload_identity_fields: {
          route_name: "Hylan Boulevard Select Bus Service",
          borough: "Staten Island",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
        },
      },
      {
        record_id: "route_woodhaven-crossbay-sbs",
        record_kind: "route" as const,
        source_ids: ["brt_route_index"],
        source_labels: ["Woodhaven and Cross Bay Boulevard Select Bus Service"],
        payload_identity_fields: {
          route_name: "Woodhaven and Cross Bay Boulevard Select Bus Service",
          borough: "Queens",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
        },
      },
    ];

    for (const record of sparseRoutes) {
      const info = identityReviewRouteInfoForTest({
        source_labels: record.source_labels,
        payload_identity_fields: record.payload_identity_fields,
      });
      expect(info.baseRoute).toBeUndefined();
      expect(info.variants).toContain("sbs");
    }

    expect(identityReviewCandidateEdgesForTest(sparseRoutes)).toEqual([]);
  });

  it("does not create advisory duplicate pressure for distinct named S shuttles", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "route_meeting-doc-152171-42-st-shuttle",
        record_kind: "route",
        source_ids: ["meeting_doc_152171"],
        payload_identity_fields: {
          route_id: "S",
          route_label: "42 St Shuttle",
          route_type: "shuttle",
          borough: "Manhattan",
        },
      },
      {
        record_id: "route_meeting-doc-160271-s-shuttle",
        record_kind: "route",
        source_ids: ["meeting_doc_160271"],
        payload_identity_fields: {
          route_id: "S",
          route_name: "Rockaway Park Shuttle",
          route_type: "shuttle",
          borough: "Queens",
        },
      },
    ]);

    expect(edges).toEqual([]);
  });
});

describe("identity review do-not-merge suppressions", () => {
  it("suppresses candidate edges for exact and reversed do-not-merge pairs", () => {
    const records = [
      {
        record_id: "route_m15_local",
        record_kind: "route" as const,
        source_ids: ["source_a"],
        payload_identity_fields: {
          route_id: "M15",
          service_variant: "local",
        },
      },
      {
        record_id: "route_m15_sbs",
        record_kind: "route" as const,
        source_ids: ["source_b"],
        payload_identity_fields: {
          route_id: "M15+",
          service_variant: "sbs",
        },
      },
      {
        record_id: "route_m15_limited",
        record_kind: "route" as const,
        source_ids: ["source_c"],
        payload_identity_fields: {
          route_id: "M15",
          service_variant: "limited_stop",
        },
      },
    ];

    const suppressed = identityReviewCandidateEdgesForTest(records, new Set(["route:route_m15_local<>route_m15_sbs", "route:route_m15_limited<>route_m15_sbs"]));

    expect(suppressed).toHaveLength(1);
    expect(suppressed[0]?.edge_id).toBe("route:route_m15_limited<>route_m15_local:shared_base_route:M15");
  });

  it("still emits candidate edges when a matching do-not-merge suppression is absent", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "entity_cac_a",
        record_kind: "entity",
        source_ids: ["source_a"],
        payload_identity_fields: {
          entity_name: "Community Advisory Committee",
          acronym: "CAC",
          entity_type: "committee",
        },
      },
      {
        record_id: "entity_cac_b",
        record_kind: "entity",
        source_ids: ["source_b"],
        payload_identity_fields: {
          entity_name: "Community Advisory Committee",
          acronym: "CAC",
          entity_type: "committee",
        },
      },
    ]);

    expect(edges).toHaveLength(1);
    expect(edges[0]?.signals).toContain("shared_entity_name:cac");
  });
});

describe("identity review project candidates", () => {
  it("does not cluster projects solely because they share a broad program value", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "project_bx12-sbs",
        record_kind: "project",
        source_ids: ["source_a"],
        payload_identity_fields: {
          project_name: "Bx12 Select Bus Service",
          program: "BRT Phase I Program",
        },
      },
      {
        record_id: "project_34th-st-transitway",
        record_kind: "project",
        source_ids: ["source_b"],
        payload_identity_fields: {
          project_name: "34th Street Transitway",
          program: "BRT Phase I Program",
        },
      },
    ]);

    expect(edges).toHaveLength(0);
  });

  it("still clusters projects that share an exact project-name key", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "project_bx12-sbs-a",
        record_kind: "project",
        source_ids: ["source_a"],
        payload_identity_fields: {
          project_name: "Bx12 Select Bus Service",
        },
      },
      {
        record_id: "project_bx12-sbs-b",
        record_kind: "project",
        source_ids: ["source_b"],
        payload_identity_fields: {
          name: "Bx12 Select Bus Service",
        },
      },
    ]);

    expect(edges).toHaveLength(1);
    expect(edges[0]?.signals).toContain("shared_project_name:bx12sbs");
  });
});

describe("identity review corridor candidates", () => {
  it("does not emit same-street corridor edges when boroughs contradict", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "corridor_broadway_manhattan",
        record_kind: "corridor",
        source_ids: ["source_a"],
        payload_identity_fields: {
          street: "Broadway",
          borough: "Manhattan",
        },
      },
      {
        record_id: "corridor_broadway_queens",
        record_kind: "corridor",
        source_ids: ["source_b"],
        payload_identity_fields: {
          street: "Broadway",
          borough: "Queens",
        },
      },
    ]);

    expect(edges).toHaveLength(0);
  });

  it("does not emit same-street corridor edges when limits contradict", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "corridor_125th_morningside",
        record_kind: "corridor",
        source_ids: ["source_a"],
        payload_identity_fields: {
          street: "125th Street",
          borough: "Manhattan",
          from: "Morningside Avenue",
          to: "Amsterdam Avenue",
        },
      },
      {
        record_id: "corridor_125th_amsterdam",
        record_kind: "corridor",
        source_ids: ["source_b"],
        payload_identity_fields: {
          street: "125th Street",
          borough: "Manhattan",
          from: "Amsterdam Avenue",
          to: "Lexington Avenue",
        },
      },
    ]);

    expect(edges).toHaveLength(0);
  });

  it("does not use multi-street aggregate corridor lists as single-corridor identity", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "corridor_archer_ave_busway",
        record_kind: "corridor",
        source_ids: ["source_a"],
        payload_identity_fields: {
          street: "Archer Avenue",
          borough: "Queens",
        },
      },
      {
        record_id: "corridor_stationary_queens",
        record_kind: "corridor",
        source_ids: ["source_b"],
        payload_identity_fields: {
          corridor_name: "Queens stationary camera corridors",
          streets: ["Archer Avenue", "Northern Boulevard", "Jamaica Avenue"],
          borough: "Queens",
        },
      },
    ]);

    expect(edges).toHaveLength(0);
  });

  it("still emits same-street corridor edges when scoped fields do not contradict", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "corridor_hillside_a",
        record_kind: "corridor",
        source_ids: ["source_a"],
        payload_identity_fields: {
          street: "Hillside Avenue",
          borough: "Queens",
        },
      },
      {
        record_id: "corridor_hillside_b",
        record_kind: "corridor",
        source_ids: ["source_b"],
        payload_identity_fields: {
          corridor_name: "Hillside Avenue",
          borough: "Queens",
        },
      },
    ]);

    expect(edges).toHaveLength(1);
    expect(edges[0]?.signals).toContain("shared_corridor_street:hillside ave");
  });
});

describe("identity review entity candidates", () => {
  it("does not emit same-number community-board edges when boroughs contradict", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "entity_bronx_cb5",
        record_kind: "entity",
        source_ids: ["source_a"],
        payload_identity_fields: {
          entity_name: "Community Board 5",
          entity_type: "community board",
          description: "Bronx community board",
        },
      },
      {
        record_id: "entity_queens_cb5",
        record_kind: "entity",
        source_ids: ["source_b"],
        payload_identity_fields: {
          entity_name: "Community Board 5",
          entity_type: "community board",
          description: "Queens Community Board 5",
        },
      },
    ]);

    expect(edges).toHaveLength(0);
  });

  it("still emits same-number community-board edges when borough context matches", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "entity_bronx_cb5_a",
        record_kind: "entity",
        source_ids: ["source_a"],
        payload_identity_fields: {
          entity_name: "Community Board 5",
          entity_type: "community board",
          description: "Bronx community board",
        },
      },
      {
        record_id: "entity_bronx_cb5_b",
        record_kind: "entity",
        source_ids: ["source_b"],
        payload_identity_fields: {
          entity_name: "Community Board 5",
          entity_type: "community board",
          description: "Bronx Community Board 5",
        },
      },
    ]);

    expect(edges).toHaveLength(1);
    expect(edges[0]?.signals).toContain("shared_entity_name:communityboard5");
  });

  it("uses canonical identity surfaces to suppress community-board edges when payload omits borough", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "entity_community-board-1-bronx-2012-02",
        record_kind: "entity",
        source_ids: ["source_a"],
        payload_identity_fields: {
          entity_name: "Community Board 1",
          entity_type: "community board",
        },
      },
      {
        record_id: "entity_community-board-1-manhattan-2013-06",
        record_kind: "entity",
        source_ids: ["source_b"],
        payload_identity_fields: {
          entity_name: "Community Board 1",
          entity_type: "community board",
          description: "Manhattan Community Board 1",
        },
      },
    ]);

    expect(edges).toHaveLength(0);
  });

  it("does not use agency_name as the identity key when an entity has its own name", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "entity_rob_free",
        record_kind: "entity",
        source_ids: ["source_a"],
        payload_identity_fields: {
          entity_name: "Rob Free",
          agency_name: "Long Island Rail Road",
          entity_type: "person",
        },
      },
      {
        record_id: "entity_rose_davis",
        record_kind: "entity",
        source_ids: ["source_b"],
        payload_identity_fields: {
          entity_name: "Rose Davis",
          agency_name: "Long Island Rail Road",
          entity_type: "person",
        },
      },
    ]);

    expect(edges).toHaveLength(0);
  });

  it("keeps agency_name as a fallback identity key when no own-name fields exist", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "entity_lirr_a",
        record_kind: "entity",
        source_ids: ["source_a"],
        payload_identity_fields: {
          agency_name: "Long Island Rail Road",
          entity_type: "agency",
        },
      },
      {
        record_id: "entity_lirr_b",
        record_kind: "entity",
        source_ids: ["source_b"],
        payload_identity_fields: {
          agency_name: "Long Island Rail Road",
          entity_type: "agency",
        },
      },
    ]);

    expect(edges).toHaveLength(1);
    expect(edges[0]?.signals).toContain("shared_entity_name:longislandrailrd");
  });

  it("still emits entity edges from primary names even when agency names differ", () => {
    const edges = identityReviewCandidateEdgesForTest([
      {
        record_id: "entity_same_name_a",
        record_kind: "entity",
        source_ids: ["source_a"],
        payload_identity_fields: {
          entity_name: "Alex Smith",
          agency_name: "Long Island Rail Road",
          entity_type: "person",
        },
      },
      {
        record_id: "entity_same_name_b",
        record_kind: "entity",
        source_ids: ["source_b"],
        payload_identity_fields: {
          entity_name: "Alex Smith",
          agency_name: "NYCT",
          entity_type: "person",
        },
      },
    ]);

    expect(edges).toHaveLength(1);
    expect(edges[0]?.signals).toContain("shared_entity_name:alexsmith");
  });
});
