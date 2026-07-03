import { describe, expect, it } from "bun:test";
import { identityKeysForInput, identityKeysForRecord, identityOverrideTarget, recordScorableValues } from "../src/identity.js";
import type { MtaCanonicalRecord, MtaSubmitObservationInput } from "../src/types.js";

function routeInput(overrides: Partial<MtaSubmitObservationInput>): MtaSubmitObservationInput {
  return {
    source_id: "test_source",
    observation_kind: "route",
    local_observation_id: "route_test",
    label: "Test route",
    payload: {},
    evidence_refs: [],
    ...overrides,
  };
}

function routeRecord(overrides: Partial<MtaCanonicalRecord>): MtaCanonicalRecord {
  return {
    record_id: "route_test",
    record_kind: "route",
    source_id: "test_source",
    source_ids: ["test_source"],
    local_observation_id: "route_test",
    local_observation_ids: ["route_test"],
    display_name: "Test route",
    payload: {},
    evidence_refs: [],
    submission_ids: ["sub_route_test"],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-06-08T00:00:00.000Z",
    ...overrides,
  };
}

function entityInput(overrides: Partial<MtaSubmitObservationInput>): MtaSubmitObservationInput {
  return {
    source_id: "test_source",
    observation_kind: "entity",
    local_observation_id: "entity_test",
    label: "Test entity",
    payload: {},
    evidence_refs: [],
    ...overrides,
  };
}

function entityInputRecord(overrides: Partial<MtaCanonicalRecord>): MtaCanonicalRecord {
  return {
    record_id: "entity_test",
    record_kind: "entity",
    source_id: "test_source",
    source_ids: ["test_source"],
    local_observation_id: "entity_test",
    local_observation_ids: ["entity_test"],
    display_name: "Test entity",
    payload: {},
    evidence_refs: [],
    submission_ids: ["sub_entity_test"],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-06-08T00:00:00.000Z",
    ...overrides,
  };
}

function projectRecord(overrides: Partial<MtaCanonicalRecord>): MtaCanonicalRecord {
  return {
    record_id: "project_test",
    record_kind: "project",
    source_id: "test_source",
    source_ids: ["test_source"],
    local_observation_id: "project_test",
    local_observation_ids: ["project_test"],
    display_name: "Test project",
    payload: {},
    evidence_refs: [],
    submission_ids: ["sub_project_test"],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-06-08T00:00:00.000Z",
    ...overrides,
  };
}

function corridorInput(overrides: Partial<MtaSubmitObservationInput>): MtaSubmitObservationInput {
  return {
    source_id: "test_source",
    observation_kind: "corridor",
    local_observation_id: "corridor_test",
    label: "Test corridor",
    payload: {},
    evidence_refs: [],
    ...overrides,
  };
}

function corridorRecord(overrides: Partial<MtaCanonicalRecord>): MtaCanonicalRecord {
  return {
    record_id: "corridor_test",
    record_kind: "corridor",
    source_id: "test_source",
    source_ids: ["test_source"],
    local_observation_id: "corridor_test",
    local_observation_ids: ["corridor_test"],
    display_name: "Test corridor",
    payload: {},
    evidence_refs: [],
    submission_ids: ["sub_corridor_test"],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-06-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("route identity keys", () => {
  it("resolves reviewed LIRR branch route aliases through durable overrides", () => {
    expect(identityOverrideTarget("route", "route_far-rockaway-branch-127546")).toBe("route_lirr-far-rockaway-branch-2023");
  });

  it("distinguishes S shuttle services by deterministic route-name context", () => {
    const fortySecond = identityKeysForInput(
      routeInput({
        local_observation_id: "route_42_st_shuttle",
        label: "42 St Shuttle",
        payload: {
          route_id: "S",
          route_label: "42 St Shuttle",
          route_type: "shuttle",
          borough: "Manhattan",
        },
      }),
    );
    const rockaway = identityKeysForInput(
      routeInput({
        local_observation_id: "route_rockaway_park_shuttle",
        label: "S Shuttle (Rockaway Park Shuttle)",
        payload: {
          route_id: "S",
          route_name: "Rockaway Park Shuttle",
          route_type: "shuttle",
          borough: "Queens",
        },
      }),
    );

    expect(fortySecond).toContain("route_s-42-st-shuttle");
    expect(rockaway).toContain("route_s-rockaway-park-shuttle");
    expect(fortySecond).not.toContain("route_s-rockaway-park-shuttle");
    expect(rockaway).not.toContain("route_s-42-st-shuttle");
    expect(fortySecond).not.toContain("route_s");
    expect(rockaway).not.toContain("route_s");
  });

  it("keeps slash-paired route labels from emitting member-route identity keys", () => {
    const keys = identityKeysForInput(
      routeInput({
        local_observation_id: "route_bx40_bx42",
        label: "Bx40/42",
        payload: {
          route_id: "Bx40/42",
          routes: ["Bx40", "Bx42"],
          route_name: "Bx40",
          route_type: "local",
        },
      }),
    );

    expect(keys).toContain("route_bx40-bx42");
    expect(keys).not.toContain("route_bx40");
    expect(keys).not.toContain("route_bx42");
  });

  it("ignores display-only slash bundles when structured fields identify one route", () => {
    const keys = identityKeysForInput(
      routeInput({
        local_observation_id: "route_m34_sbs",
        label: "M34/M34A on 34th Street Busway",
        payload: {
          route_id: "M34",
          route_label: "M34 SBS",
          route: "M34 SBS",
          route_name: "M34+",
          internal_route_id: "M34+",
          route_id_authority: "mta_internal",
          source_route_surface: "mta_route_id",
        },
      }),
    );

    expect(keys).toContain("route_m34-sbs");
    expect(keys).not.toContain("route_m34-m34a");
  });

  it("does not collapse large route lists onto the first two listed routes", () => {
    const keys = identityKeysForInput(
      routeInput({
        local_observation_id: "route_express_routes",
        label: "Express Bus Routes",
        payload: {
          route_id: "SIM8/8X/22/25/26/30",
          routes: ["SIM8", "SIM8X", "SIM22", "SIM25", "SIM26", "SIM30"],
          route_type: "express",
        },
      }),
    );

    expect(keys).not.toContain("route_sim8-sim8x");
    expect(keys).not.toContain("route_sim8");
    expect(keys).not.toContain("route_sim8x");
  });

  it("emits mode-qualified identity keys for subway letter routes", () => {
    for (const token of ["A", "Q", "Z"]) {
      const keys = identityKeysForInput(
        routeInput({
          local_observation_id: `route_${token.toLowerCase()}_subway`,
          label: `${token} Subway Line`,
          payload: {
            route_id: token,
            route_label: token,
            route_type: "subway",
            mode: "subway",
          },
        }),
      );

      expect(keys).toContain(`route_${token.toLowerCase()}-subway`);
      expect(keys).not.toContain(`route_${token.toLowerCase()}`);
    }
  });

  it("emits mode-qualified identity keys for numeric subway routes", () => {
    for (const token of ["1", "2", "7"]) {
      const keys = identityKeysForInput(
        routeInput({
          local_observation_id: `route_${token}_subway`,
          label: `${token} line`,
          payload: {
            route_id: token,
            route_name: `${token} line`,
            route_type: "subway",
            mode: "subway",
          },
        }),
      );

      expect(keys).toContain(`route_${token}-subway`);
      expect(keys).not.toContain(`route_${token}`);
    }
  });

  it("does not infer subway keys for same-letter bus routes", () => {
    const keys = identityKeysForInput(
      routeInput({
        local_observation_id: "route_q_local",
        label: "Q local route",
        payload: {
          route_id: "Q",
          route_type: "local",
          service_variant: "local",
        },
      }),
    );

    expect(keys).not.toContain("route_q-subway");
    expect(keys).not.toContain("route_q");
  });

  it("prunes stale base aliases when record aliases include letter-suffixed bus routes", () => {
    const b103e = identityKeysForRecord(
      routeRecord({
        record_id: "route_b103e-express-cb18-jun2017",
        record_aliases: ["route_b103", "route_b103e"],
        display_name: "B103E Express",
        payload: {
          route_id: "B103E",
          route_type: "express",
        },
      }),
    );
    const q20a = identityKeysForRecord(
      routeRecord({
        record_id: "route_q20-2014-10-07-flushing-jamaica",
        record_aliases: ["route_q20", "route_q20a"],
        display_name: "Q20A",
        payload: {
          route_id: "Q20A",
          route_type: "local",
        },
      }),
    );

    expect(b103e).toContain("route_b103e");
    expect(b103e).not.toContain("route_b103");
    expect(q20a).toContain("route_q20a");
    expect(q20a).not.toContain("route_q20");
  });

  it("prunes stale base aliases when variant-specific route aliases or record ids are present", () => {
    const m15Local = identityKeysForRecord(
      routeRecord({
        record_id: "route_m15-local-2010-09-14",
        record_aliases: ["route_m15", "route_m15-local"],
        display_name: "M15 Local",
        payload: {
          route_id: "M15",
          route_type: "local",
          service_variant: "local",
        },
      }),
    );
    const b46LocalLimited = identityKeysForRecord(
      routeRecord({
        record_id: "route_b46-local-limited-20110915",
        record_aliases: ["route_b46", "route_b46-local-limited"],
        display_name: "B46 Local and Limited",
        payload: {
          route_id: "B46",
          route_type: "local and limited",
          service_variant: "local_limited",
        },
      }),
    );

    expect(m15Local).toContain("route_m15-local");
    expect(m15Local).not.toContain("route_m15");
    expect(b46LocalLimited).toContain("route_b46-local-limited");
    expect(b46LocalLimited).not.toContain("route_b46");
  });
});

describe("entity identity keys", () => {
  it("resolves reviewed Corporate Compliance aliases through durable overrides", () => {
    expect(identityOverrideTarget("entity", "entity_meeting-doc-135596-mta-corporate-compliance")).toBe("entity_mta-corporate-compliance-125256");
  });

  it("resolves reviewed TLC aliases through durable overrides", () => {
    expect(identityOverrideTarget("entity", "entity_tlc-2011-34th-sbs")).toBe("entity_nyc-tlc-2024");
  });

  it("uses borough-qualified community-board keys when borough context is known", () => {
    const brooklyn = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_community_board_5_brooklyn",
        label: "Community Board 5",
        payload: {
          entity_name: "Community Board 5",
          entity_type: "community board",
          borough: "Brooklyn",
        },
      }),
    );
    const manhattan = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_community_board_5_manhattan",
        label: "Community Board 5",
        payload: {
          entity_name: "Community Board 5",
          entity_type: "community board",
          extra_fields: { borough: "Manhattan" },
        },
      }),
    );

    expect(brooklyn).toContain("entity_brooklyn-community-board-5");
    expect(manhattan).toContain("entity_manhattan-community-board-5");
    expect(brooklyn).not.toContain("entity_community-board-5");
    expect(manhattan).not.toContain("entity_community-board-5");
  });

  it("keeps generic community-board keys when borough context is unknown", () => {
    const keys = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_community_board_5",
        label: "Community Board 5",
        payload: {
          entity_name: "Community Board 5",
          entity_type: "community board",
        },
      }),
    );

    expect(keys).toContain("entity_community-board-5");
    expect(keys.some((key) => /^entity_(?:bronx|brooklyn|manhattan|queens|staten-island)-community-board-5$/u.test(key))).toBe(false);
  });

  it("uses reviewed borough-scoped keys for source-scoped community-board records", () => {
    const keys = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_community-board-1-bronx-2012-02",
        record_aliases: ["entity_community-board-1"],
        display_name: "Community Board 1",
        payload: {
          entity_name: "Community Board 1",
          entity_type: "community board",
        },
      }),
    );

    expect(keys).toContain("entity_bronx-community-board-1");
    expect(keys).toContain("entity_community-board-1-bronx-2012-02");
    expect(keys).not.toContain("entity_community-board-1");
  });

  it("does not assign parent board keys to community-board committees", () => {
    const keys = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_bronx_community_board_2_edc",
        label: "Bronx Community Board 2 Economic Development Committee",
        payload: {
          entity_name: "Bronx Community Board 2 Economic Development Committee",
          entity_type: "community board committee",
          borough: "Bronx",
        },
      }),
    );

    expect(keys).toContain("entity_bronx-community-board-2-economic-development-committee");
    expect(keys).not.toContain("entity_bronx-community-board-2");
    expect(keys).not.toContain("entity_community-board-2");
  });

  it("does not use differing parent agency names as identity keys for child units", () => {
    const department = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_department_of_subways",
        label: "Department of Subways",
        payload: {
          entity_name: "Department of Subways",
          agency_name: "New York City Transit",
          entity_type: "department",
        },
      }),
    );
    const bureau = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_nypd_transit_bureau",
        label: "NYPD's Transit Bureau",
        payload: {
          entity_name: "NYPD's Transit Bureau",
          agency_name: "New York City Police Department",
          entity_type: "agency bureau",
        },
      }),
    );

    expect(department).toContain("entity_department-of-subways");
    expect(department).not.toContain("entity_mta-nyct");
    expect(bureau).toContain("entity_nypd-s-transit-bureau");
    expect(bureau).not.toContain("entity_new-york-city-police-department");
  });

  it("still uses matching agency-name aliases for true agency records", () => {
    const keys = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_nyc_dot",
        label: "New York City Department of Transportation",
        payload: {
          entity_name: "New York City Department of Transportation",
          agency_name: "NYCDOT",
          entity_type: "government agency",
        },
      }),
    );

    expect(keys).toContain("entity_nyc-dot");
  });

  it("prunes generic community advisory committee aliases when a scoped CAC key is present", () => {
    const flushing = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_community_advisory_committee_flushing_jamaica",
        label: "Flushing-Jamaica Community Advisory Committee",
        payload: {
          entity_name: "Community Advisory Committee",
          name: "Flushing-Jamaica Community Advisory Committee",
          entity_type: "community advisory committee",
        },
      }),
    );
    const hylan = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_hylan-cac",
        record_aliases: ["entity_community-advisory-committee", "entity_community-advisory-committee-cac"],
        display_name: "Hylan CAC",
        payload: {
          entity_name: "Hylan CAC",
          entity_type: "community advisory committee",
        },
      }),
    );

    expect(flushing).toContain("entity_flushing-jamaica-community-advisory-committee");
    expect(flushing).not.toContain("entity_community-advisory-committee");
    expect(hylan).toContain("entity_hylan-cac");
    expect(hylan).not.toContain("entity_community-advisory-committee");
    expect(hylan).not.toContain("entity_community-advisory-committee-cac");
  });

  it("keeps non-generic advisory committee identity surfaces", () => {
    const generic = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_community_advisory_committee",
        label: "Community Advisory Committee",
        payload: {
          entity_name: "Community Advisory Committee",
        },
      }),
    );
    const company = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_cac_industries",
        label: "CAC Industries",
        payload: {
          entity_name: "CAC Industries",
        },
      }),
    );
    const pcac = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_permanent_citizens_advisory_committee",
        label: "Permanent Citizens Advisory Committee to the MTA",
        payload: {
          entity_name: "Permanent Citizens Advisory Committee to the MTA",
        },
      }),
    );

    expect(generic).toContain("entity_community-advisory-committee");
    expect(company).toContain("entity_cac-industries");
    expect(pcac).toContain("entity_permanent-citizens-advisory-committee-to-the-mta");
  });

  it("prunes generic scoped-role aliases when a more specific role key is present", () => {
    const metroNorthPresident = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_mnr_president",
        label: "President, Metro-North Railroad",
        payload: {
          entity_name: "President",
          agency_name: "Metro-North Railroad",
          entity_type: "role",
        },
      }),
    );
    const mtaSafetyOfficer = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_mta_chief_safety_officer",
        label: "MTA Chief Safety Officer",
        payload: {
          entity_name: "Chief Safety Officer",
          agency_name: "MTA",
          entity_type: "role",
        },
      }),
    );
    const genericPresident = identityKeysForInput(
      entityInput({
        local_observation_id: "entity_president",
        label: "President",
        payload: {
          entity_name: "President",
          entity_type: "role",
        },
      }),
    );

    expect(metroNorthPresident).toContain("entity_president-metro-north-railroad");
    expect(metroNorthPresident).not.toContain("entity_president");
    expect(mtaSafetyOfficer).toContain("entity_mta-chief-safety-officer");
    expect(mtaSafetyOfficer).not.toContain("entity_chief-safety-officer");
    expect(genericPresident).toContain("entity_president");
  });

  it("prunes Grand Central Madison station and operating-company alias leakage", () => {
    const station = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_grand-central-madison-127546",
        record_aliases: ["entity_grand-central-madison", "entity_meeting-doc-121001-gcmoc"],
        display_name: "Grand Central Madison",
        payload: {
          entity_name: "Grand Central Madison",
          entity_type: "station",
          acronym: "GCM",
        },
      }),
    );
    const operatingCompany = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_meeting-doc-121001-gcmoc",
        record_aliases: ["entity_grand-central-madison", "entity_grand-central-madison-concourse-operating-company"],
        display_name: "Grand Central Madison Concourse Operating Company",
        payload: {
          entity_name: "Grand Central Madison Concourse Operating Company",
          acronym: "GCMCOC",
          entity_type: "agency",
          parent_organization: "Metropolitan Transportation Authority",
          description: "A subsidiary created to operate the Grand Central Madison Terminal.",
        },
      }),
    );

    expect(station).toContain("entity_grand-central-madison");
    expect(station).not.toContain("entity_meeting-doc-121001-gcmoc");
    expect(operatingCompany).toContain("entity_grand-central-madison-concourse-operating-company");
    expect(operatingCompany).not.toContain("entity_grand-central-madison");
  });

  it("prunes reviewed broad entity aliases while preserving scoped firm aliases", () => {
    const michaelBaker = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_meeting-doc-111791-michael-baker",
        record_aliases: [
          "entity_independent-engineering-consultant",
          "entity_independent-engineering-consultant-iec-michael-baker-international",
          "entity_michael-baker-international",
        ],
        display_name: "Michael Baker International",
        payload: {
          entity_name: "Michael Baker International",
          entity_type: "consultant",
          description: "Independent Engineering Consultant (IEC) for MTA Capital Program",
          organization: "Michael Baker International",
          role: "MTA Independent Engineering Consultant (IEC)",
        },
      }),
    );
    const genericIec = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_meeting-doc-164901-iec",
        record_aliases: ["entity_independent-engineering-consultant"],
        display_name: "Independent Engineering Consultant",
        payload: {
          entity_name: "Independent Engineering Consultant",
          entity_type: "organization",
          acronym: "IEC",
        },
      }),
    );
    const bloombergVendor = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_meeting-doc-155136-bloomberg",
        record_aliases: ["entity_bloomberg"],
        display_name: "Bloomberg: Terminals and Communication Lines, PeopleSoft Data Licenses and MTM Pricing",
        payload: {
          entity_name: "Bloomberg",
          entity_type: "organization",
          description: "Provider of terminals, communication lines, PeopleSoft data licenses, and MTM pricing to MTA",
        },
      }),
    );
    const bloombergNews = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_bloomberg-news-org",
        record_aliases: ["entity_bloomberg", "entity_bloomberg-news-organization"],
        display_name: "Bloomberg (news organization)",
        payload: {
          entity_name: "Bloomberg",
          entity_type: "news_organization",
        },
      }),
    );
    const nysdotCommissioner = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_ny-state-dot",
        record_aliases: ["entity_commissioner-of-transportation", "entity_new-york-state-department-of-transportation", "entity_ny-state-dot"],
        display_name: "Commissioner of Transportation",
        payload: {
          entity_name: "New York State Department of Transportation",
          entity_type: "role",
          role: "Commissioner of Transportation",
        },
      }),
    );
    const nysdotAgency = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_ny-sdod-lga-aa",
        record_aliases: ["entity_new-york-state-department-of-transportation"],
        display_name: "New York State Department of Transportation",
        payload: {
          entity_name: "New York State Department of Transportation",
          entity_type: "agency",
        },
      }),
    );
    const subwayBusAggregate = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_nyct-dos-dob-mtabc-201766",
        record_aliases: [
          "entity_nyc-transit-department-of-subways",
          "entity_nyc-transit-department-of-subways-department-of-buses-and-mta-bus-company",
        ],
        display_name: "NYC Transit Department of Subways, Department of Buses, and MTA Bus Company",
        payload: {
          entity_name: "NYC Transit Department of Subways",
          entity_type: "aggregate_scope",
          description: "NYC Transit Department of Subways, Department of Buses, and MTA Bus Company",
        },
      }),
    );
    const subwayDepartment = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_nyct-dept-of-subways",
        record_aliases: ["entity_nyc-transit-department-of-subways"],
        display_name: "NYC Transit Department of Subways",
        payload: {
          entity_name: "NYC Transit Department of Subways",
          entity_type: "department",
        },
      }),
    );
    const meetingDocMta = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_meeting-doc-64066-mta",
        display_name: "Metropolitan Transportation Authority",
        payload: {
          entity_name: "Metropolitan Transportation Authority",
          entity_type: "agency",
        },
      }),
    );
    const canonicalMta = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_mta-entity-update-2025",
        display_name: "Metropolitan Transportation Authority (MTA)",
        payload: {
          entity_name: "Metropolitan Transportation Authority",
          acronym: "MTA",
          entity_type: "transit_authority",
        },
      }),
    );
    const mtaPublicBenefitCorporation = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_mta-metropolitan-transportation-authority",
        record_aliases: ["entity_metropolitan-transportation-authority-mta"],
        display_name: "Metropolitan Transportation Authority (MTA)",
        payload: {
          entity_name: "Metropolitan Transportation Authority",
          acronym: "MTA",
          entity_type: "public benefit corporation",
        },
      }),
    );
    const mtaRealEstate = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_mta-real-estate",
        record_aliases: ["entity_meeting-doc-mta-real-estate", "entity_mta-real-estate-department"],
        display_name: "MTA Real Estate",
        payload: {
          entity_name: "MTA Real Estate",
          entity_type: "agency department",
          organization: "Metropolitan Transportation Authority",
        },
      }),
    );
    const mtaRealEstateDepartment = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_mta-real-estate-department",
        display_name: "MTA Real Estate Department",
        payload: {
          entity_name: "MTA Real Estate Department",
          entity_type: "department",
          organization: "Metropolitan Transportation Authority",
        },
      }),
    );
    const mtaTodProgram = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_mta-tod-meeting-doc-160301",
        record_aliases: [
          "entity_meeting-doc-151836-mta-tod",
          "entity_meeting-doc-170991-tod",
          "entity_meeting-doc-mta-tod",
          "entity_mta-real-estate-tod",
          "entity_mta-transit-oriented-development",
          "entity_mta-transit-oriented-development-tod",
        ],
        display_name: "MTA Transit Oriented Development (TOD)",
        payload: {
          entity_name: "MTA Transit Oriented Development",
          acronym: "TOD",
          entity_type: "program",
          parent_organization: "Metropolitan Transportation Authority",
        },
      }),
    );
    const mtaTodDepartment = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_mta-real-estate-tod",
        record_aliases: ["entity_mta-transit-oriented-development", "entity_mta-transit-oriented-development-tod"],
        display_name: "MTA Transit-Oriented Development (TOD)",
        payload: {
          entity_name: "MTA Transit-Oriented Development",
          acronym: "TOD",
          entity_type: "department",
          organization: "Metropolitan Transportation Authority",
        },
      }),
    );
    const frankFarrellRole = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_mta-nyct-evp-frank-farrell",
        record_aliases: ["entity_frank-farrell", "entity_frank-farrell-department-of-buses"],
        display_name: "Frank Farrell, Acting EVP, Department of Buses",
        payload: {
          entity_name: "Frank Farrell",
          entity_type: "government_official",
          role: "Acting Executive Vice President, Department of Buses",
        },
      }),
    );
    const frankFarrellPerson = identityKeysForRecord(
      entityInputRecord({
        record_id: "entity_frank-farrell-mta-acting-evp-buses",
        record_aliases: ["entity_frank-farrell"],
        display_name: "Frank Farrell",
        payload: {
          entity_name: "Frank Farrell",
          entity_type: "person",
        },
      }),
    );

    expect(michaelBaker).toContain("entity_michael-baker-international");
    expect(michaelBaker).toContain("entity_independent-engineering-consultant-iec-michael-baker-international");
    expect(michaelBaker).not.toContain("entity_independent-engineering-consultant");
    expect(genericIec).toContain("entity_independent-engineering-consultant");
    expect(bloombergVendor).not.toContain("entity_bloomberg");
    expect(bloombergNews).toContain("entity_bloomberg");
    expect(nysdotCommissioner).toContain("entity_commissioner-of-transportation");
    expect(nysdotCommissioner).toContain("entity_ny-state-dot");
    expect(nysdotCommissioner).not.toContain("entity_new-york-state-department-of-transportation");
    expect(nysdotAgency).toContain("entity_new-york-state-department-of-transportation");
	    expect(subwayBusAggregate).toContain("entity_nyc-transit-department-of-subways-department-of-buses-and-mta-bus-company");
	    expect(subwayBusAggregate).not.toContain("entity_nyc-transit-department-of-subways");
	    expect(subwayDepartment).toContain("entity_nyc-transit-department-of-subways");
    expect(meetingDocMta).toContain("entity_meeting-doc-64066-mta");
    expect(meetingDocMta).not.toContain("entity_mta");
    expect(canonicalMta).toContain("entity_mta-entity-update-2025");
    expect(canonicalMta).toContain("entity_mta");
    expect(canonicalMta).toContain("entity_metropolitan-transportation-authority-mta");
    expect(mtaPublicBenefitCorporation).toContain("entity_mta-metropolitan-transportation-authority");
    expect(mtaPublicBenefitCorporation).not.toContain("entity_mta");
    expect(mtaPublicBenefitCorporation).not.toContain("entity_metropolitan-transportation-authority-mta");
    expect(mtaRealEstate).toContain("entity_mta-real-estate");
    expect(mtaRealEstate).toContain("entity_meeting-doc-mta-real-estate");
    expect(mtaRealEstate).not.toContain("entity_mta-real-estate-department");
    expect(mtaRealEstateDepartment).toContain("entity_mta-real-estate-department");
    expect(mtaTodProgram).toContain("entity_mta-tod-meeting-doc-160301");
    expect(mtaTodProgram).toContain("entity_meeting-doc-151836-mta-tod");
    expect(mtaTodProgram).toContain("entity_meeting-doc-170991-tod");
    expect(mtaTodProgram).toContain("entity_meeting-doc-mta-tod");
    expect(mtaTodProgram).not.toContain("entity_mta-real-estate-tod");
    expect(mtaTodProgram).not.toContain("entity_mta-transit-oriented-development");
    expect(mtaTodProgram).not.toContain("entity_mta-transit-oriented-development-tod");
    expect(mtaTodDepartment).toContain("entity_mta-real-estate-tod");
    expect(mtaTodDepartment).toContain("entity_mta-transit-oriented-development");
    expect(mtaTodDepartment).toContain("entity_mta-transit-oriented-development-tod");
    expect(frankFarrellRole).toContain("entity_frank-farrell-department-of-buses");
    expect(frankFarrellRole).not.toContain("entity_frank-farrell");
    expect(frankFarrellPerson).toContain("entity_frank-farrell");
	  });
});

describe("project identity keys", () => {
  it("prunes reviewed broad project aliases while preserving scoped lookup text", () => {
    const phase2 = projectRecord({
      record_id: "project_jamaica-capacity-improvement-phase2",
      record_aliases: ["project_jamaica-capacity-improvement-project", "project_jamaica-capacity-improvement-project-phase-2"],
      display_name: "Jamaica Capacity Improvement Project Phase 2",
      payload: {
        project_name: "Jamaica Capacity Improvement Project",
        name: "Jamaica Capacity Improvement Project Phase 2",
      },
    });
    const parent = projectRecord({
      record_id: "project_jamaica-capacity-improvement",
      record_aliases: ["project_jamaica-capacity-improvement-project"],
      display_name: "Jamaica Capacity Improvement Project",
      payload: {
        project_name: "Jamaica Capacity Improvement Project",
      },
    });
    const security = projectRecord({
      record_id: "project_security-initiatives-nyct",
      record_aliases: ["project_security-initiatives", "project_security-initiatives-nyct"],
      display_name: "NYCT Security Initiatives",
      payload: {
        project_name: "Security Initiatives",
        agency: "NYCT",
      },
    });

    expect(identityKeysForRecord(phase2)).toContain("project_jamaica-capacity-improvement-project-phase-2");
    expect(identityKeysForRecord(phase2)).not.toContain("project_jamaica-capacity-improvement-project");
    expect(identityKeysForRecord(parent)).toContain("project_jamaica-capacity-improvement-project");
    expect(identityKeysForRecord(security)).not.toContain("project_security-initiatives");
    expect(recordScorableValues(phase2)).toContain("Jamaica Capacity Improvement Project");
  });
});

describe("corridor identity keys", () => {
  it("prunes bare corridor aliases when payload geography scopes the corridor", () => {
    const keys = identityKeysForInput(
      corridorInput({
        local_observation_id: "corridor_broadway_upper_manhattan",
        label: "Broadway",
        payload: {
          corridor_name: "Broadway",
          limits: "157th Street to 220th Street",
          borough: "Manhattan",
        },
      }),
    );

    expect(keys).not.toContain("corridor_broadway");
    expect(keys).toContain("corridor_broadway-upper-manhattan");
  });

  it("keeps scoped corridor aliases while pruning the bare street alias", () => {
    const keys = identityKeysForInput(
      corridorInput({
        local_observation_id: "corridor_cross_bay_north_165",
        label: "Cross Bay Boulevard (north of 165 Av)",
        payload: {
          corridor_name: "Cross Bay Boulevard (north of 165 Av)",
          street: "Cross Bay Boulevard",
          limits: "north of 165 Av",
          borough: "Queens",
        },
      }),
    );

    expect(keys).toContain("corridor_cross-bay-blvd-north-of-165-av");
    expect(keys).not.toContain("corridor_cross-bay-blvd");
  });

  it("keeps bare corridor aliases when no scoped geography is present", () => {
    const keys = identityKeysForInput(
      corridorInput({
        local_observation_id: "corridor_broadway",
        label: "Broadway",
        payload: {
          corridor_name: "Broadway",
        },
      }),
    );

    expect(keys).toContain("corridor_broadway");
  });

  it("protects the primary record id while pruning other bare scoped aliases", () => {
    const keys = identityKeysForRecord(
      corridorRecord({
        record_id: "corridor_broadway",
        display_name: "Broadway",
        payload: {
          corridor_name: "Broadway",
          limits: "157th Street to 220th Street",
          borough: "Manhattan",
        },
      }),
    );

    expect(keys).toContain("corridor_broadway");
  });
});
