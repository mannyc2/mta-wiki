import { describe, expect, it } from "bun:test";
import { identityPairKey, readIdentityDoNotMergeOverrides, readIdentityOverrides } from "@mta-wiki/db/identity";

describe("current identity override guardrails", () => {
  it("keeps reviewed remaining identity-review aliases in the durable merge overrides", () => {
    const aliases = readIdentityOverrides().aliases ?? {};

    expect(aliases.entity?.["entity_meeting-doc-151646-jose-la-salle"]).toBe("entity_jose-lasalle-nov2022");
    expect(aliases.entity?.["entity_lk-comstock-cpc-may2022"]).toBe("entity_lk-comstock-and-company-llc");
    expect(aliases.entity?.["entity_meeting-doc-199016-hdr"]).toBe("entity_meeting-doc-127956-hdr");
    expect(aliases.entity?.["entity_meeting-doc-176516-21tech"]).toBe("entity_meeting-doc-176501-21tech");
    expect(aliases.entity?.["entity_meeting-doc-135596-mta-corporate-compliance"]).toBe("entity_mta-corporate-compliance-125256");
    expect(aliases.entity?.["entity_mta-overall"]).toBe("entity_mta-metropolitan-transportation-authority");
    expect(aliases.project?.["project_grand-central-trainshed"]).toBe("project_grand-central-train-shed");
  });

  it("keeps reviewed bundle and role-acronym distinctions in durable do-not-merge overrides", () => {
    const pairs = readIdentityDoNotMergeOverrides().pairs ?? {};
    const entityPairs = new Set((pairs.entity ?? []).map((entry) => identityPairKey(entry.record_ids?.[0] ?? "", entry.record_ids?.[1] ?? "")));
    const routePairs = new Set((pairs.route ?? []).map((entry) => identityPairKey(entry.record_ids?.[0] ?? "", entry.record_ids?.[1] ?? "")));

    expect(entityPairs.has(identityPairKey("entity_mckissack-iec", "entity_meeting-doc-111791-michael-baker"))).toBe(true);
    expect(entityPairs.has(identityPairKey("entity_dept-of-subways-crichlow", "entity_nyct-dos-dob-mtabc-201766"))).toBe(true);
    expect(entityPairs.has(identityPairKey("entity_brooklyn-community-board-1", "entity_community-board-1-bronx-2012-02"))).toBe(true);
    expect(entityPairs.has(identityPairKey("entity_brooklyn-community-board-1", "entity_community-board-1-manhattan-2013-06"))).toBe(true);
    expect(entityPairs.has(identityPairKey("entity_community-board-1-bronx-2012-02", "entity_community-board-1-manhattan-2013-06"))).toBe(true);
    expect(entityPairs.has(identityPairKey("entity_community-advisory-committee-2015", "entity_community-advisory-committee-webster"))).toBe(true);
    expect(entityPairs.has(identityPairKey("entity_frank-farrell-mta-acting-evp-buses", "entity_mta-nyct-evp-frank-farrell"))).toBe(true);
    expect(entityPairs.has(identityPairKey("entity_mta-entity-update-2025", "entity_mta-metropolitan-transportation-authority"))).toBe(true);
    expect(entityPairs.has(identityPairKey("entity_meeting-doc-135596-mta-corporate-compliance", "entity_mta-corporate-compliance-125256"))).toBe(false);
    expect(routePairs.has(identityPairKey("route_b46-local-2012", "route_b46-local-limited-20110915"))).toBe(true);
    expect(routePairs.has(identityPairKey("route_able-s79-sbs", "route_s79-hylan-2010"))).toBe(true);
    expect(routePairs.has(identityPairKey("route_sim23-madison-ave-cb6-jun2025", "route_sim23-sim24-express-bus"))).toBe(true);
    expect(routePairs.has(identityPairKey("route_q15a-historical-2025", "route_q15-qbnr-2025"))).toBe(true);
    expect(routePairs.has(identityPairKey("route_q20-2014-10-07-flushing-jamaica", "route_q20b-cb12-2011"))).toBe(true);
    expect(routePairs.has(identityPairKey("route_q20-2014-10-07-flushing-jamaica", "route_q20-qbnr-2025"))).toBe(true);
  });
});
