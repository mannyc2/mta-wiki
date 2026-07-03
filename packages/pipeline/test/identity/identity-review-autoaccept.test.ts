import { describe, expect, it } from "bun:test";
import { evaluateSuggestionForAutoAccept } from "@mta-wiki/pipeline/identity/identity-review-autoaccept";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";

function record(recordId: string, kind: MtaCanonicalRecord["record_kind"], payload: JsonObject, aliases: string[] = []): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_aliases: aliases,
    record_kind: kind,
    source_id: "test_source",
    local_observation_id: recordId.replace(/-/gu, "_"),
    display_name: recordId,
    payload,
    evidence_refs: [],
    submission_ids: ["sub_test"],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-06-10T00:00:00.000Z",
  };
}

function recordMap(...records: MtaCanonicalRecord[]) {
  return new Map(records.map((entry) => [entry.record_id, entry]));
}

describe("identity review auto-accept gate", () => {
  const m15Local = record("route_m15-local-2010", "route", { route_id: "M15", route_label: "M15 Local and Limited", service_variant: "local_limited" });
  const m15LocalV2 = record("route_m15-local-2010-v2", "route", { route_id: "M15", route_label: "M15 Local and Limited", service_variant: "local_limited" });
  const m15Sbs = record("route_m15-sbs", "route", { route_id: "M15", service_variant: "sbs" });

  it("auto-accepts a merge whose members share a strong key with no contradictions", () => {
    const evaluation = evaluateSuggestionForAutoAccept(
      "route",
      { merge_groups: [["route_m15-local-2010", "route_m15-local-2010-v2"]], do_not_merge: [], ambiguous: [] },
      recordMap(m15Local, m15LocalV2, m15Sbs),
    );
    expect(evaluation.accepted_merge_groups).toEqual([["route_m15-local-2010", "route_m15-local-2010-v2"]]);
    expect(evaluation.rejections).toEqual([]);
  });

  it("rejects a merge across contradicting service variants", () => {
    const evaluation = evaluateSuggestionForAutoAccept(
      "route",
      { merge_groups: [["route_m15-local-2010", "route_m15-sbs"]], do_not_merge: [], ambiguous: [] },
      recordMap(m15Local, m15Sbs),
    );
    expect(evaluation.accepted_merge_groups).toEqual([]);
    expect(evaluation.rejections[0]?.reason).toContain("service_variant local_limited vs sbs");
  });

  it("rejects a merge whose members share no strong identity key", () => {
    const b44 = record("route_b44-sbs", "route", { route_id: "B44", service_variant: "sbs" });
    const q44 = record("route_q44-sbs", "route", { route_id: "Q44", service_variant: "sbs" });
    const evaluation = evaluateSuggestionForAutoAccept(
      "route",
      { merge_groups: [["route_b44-sbs", "route_q44-sbs"]], do_not_merge: [], ambiguous: [] },
      recordMap(b44, q44),
    );
    expect(evaluation.accepted_merge_groups).toEqual([]);
    expect(evaluation.rejections[0]?.reason).toContain("no strong identity key");
  });

  it("rejects actions touching records the suggestion marks ambiguous", () => {
    const evaluation = evaluateSuggestionForAutoAccept(
      "route",
      {
        merge_groups: [["route_m15-local-2010", "route_m15-local-2010-v2"]],
        do_not_merge: [],
        ambiguous: [{ record_ids: ["route_m15-local-2010-v2"], needed_context: ["unclear variant"] }],
      },
      recordMap(m15Local, m15LocalV2),
    );
    expect(evaluation.accepted_merge_groups).toEqual([]);
    expect(evaluation.rejections[0]?.reason).toContain("ambiguous");
  });

  it("rejects merges with members missing from the corpus", () => {
    const evaluation = evaluateSuggestionForAutoAccept(
      "route",
      { merge_groups: [["route_m15-local-2010", "route_m15-gone"]], do_not_merge: [], ambiguous: [] },
      recordMap(m15Local),
    );
    expect(evaluation.accepted_merge_groups).toEqual([]);
    expect(evaluation.rejections[0]?.reason).toContain("not in the current canonical corpus");
  });

  it("accepts a do-not-merge with a verified variant distinction", () => {
    const evaluation = evaluateSuggestionForAutoAccept(
      "route",
      {
        merge_groups: [],
        do_not_merge: [{ record_ids: ["route_m15-local-2010", "route_m15-sbs"], reason: "service_variant differs: local vs sbs" }],
        ambiguous: [],
      },
      recordMap(m15Local, m15Sbs),
    );
    expect(evaluation.accepted_do_not_merge).toHaveLength(1);
    expect(evaluation.rejections).toEqual([]);
  });

  it("rejects a do-not-merge whose cited variant distinction is contradicted by the records", () => {
    const evaluation = evaluateSuggestionForAutoAccept(
      "route",
      {
        merge_groups: [],
        do_not_merge: [{ record_ids: ["route_m15-local-2010", "route_m15-local-2010-v2"], reason: "different service_variant" }],
        ambiguous: [],
      },
      recordMap(m15Local, m15LocalV2),
    );
    expect(evaluation.accepted_do_not_merge).toEqual([]);
    expect(evaluation.rejections[0]?.reason).toContain("not supported by the records");
  });

  it("rejects a do-not-merge that cites no strong identity field", () => {
    const evaluation = evaluateSuggestionForAutoAccept(
      "route",
      {
        merge_groups: [],
        do_not_merge: [{ record_ids: ["route_m15-local-2010", "route_m15-sbs"], reason: "they feel different" }],
        ambiguous: [],
      },
      recordMap(m15Local, m15Sbs),
    );
    expect(evaluation.accepted_do_not_merge).toEqual([]);
    expect(evaluation.rejections[0]?.reason).toContain("does not cite a strong identity field");
  });

  it("accepts entity authority-vs-subsidiary do-not-merge on citation even with matching entity_type", () => {
    const mta = record("entity_mta", "entity", { entity_name: "Metropolitan Transportation Authority", entity_type: "agency" });
    const nyct = record("entity_mta-nyct", "entity", { entity_name: "MTA New York City Transit", entity_type: "agency" });
    const evaluation = evaluateSuggestionForAutoAccept(
      "entity",
      {
        merge_groups: [],
        do_not_merge: [{ record_ids: ["entity_mta", "entity_mta-nyct"], reason: "Authority vs subsidiary never merge." }],
        ambiguous: [],
      },
      recordMap(mta, nyct),
    );
    expect(evaluation.accepted_do_not_merge).toHaveLength(1);
  });

  it("rejects entity merges across contradicting entity_type", () => {
    const agency = record("entity_nyc-ddc", "entity", { entity_name: "NYC DDC", entity_type: "agency" }, ["entity_ddc"]);
    const person = record("entity_ddc-commissioner", "entity", { entity_name: "DDC Commissioner", entity_type: "person" }, ["entity_ddc"]);
    const evaluation = evaluateSuggestionForAutoAccept(
      "entity",
      { merge_groups: [["entity_nyc-ddc", "entity_ddc-commissioner"]], do_not_merge: [], ambiguous: [] },
      recordMap(agency, person),
    );
    expect(evaluation.accepted_merge_groups).toEqual([]);
    expect(evaluation.rejections[0]?.reason).toContain("entity_type agency vs person");
  });
});
