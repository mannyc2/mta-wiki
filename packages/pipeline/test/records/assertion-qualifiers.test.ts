// S2.4 assertion qualifiers + dangling references (docs/step-2-implementation-plan.md §S2.4, §5).

import { describe, expect, it } from "bun:test";
import { withAssertionQualifiers } from "@mta-wiki/pipeline/records/assertion-qualifiers";
import { danglingReferences } from "@mta-wiki/pipeline/records/derived-relations";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";

function rec(id: string, kind: MtaCanonicalRecord["record_kind"], payload: JsonObject, extra: Partial<MtaCanonicalRecord> = {}): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: extra.source_id ?? "src",
    source_ids: extra.source_ids ?? [extra.source_id ?? "src"],
    local_observation_id: id,
    local_observation_ids: [id],
    display_name: id,
    payload,
    evidence_refs: [],
    submission_ids: ["sub"],
    truth_status: "source_stated",
    review_state: extra.review_state ?? "unreviewed",
    generated_at: "2026-06-10T00:00:00.000Z",
    ...extra,
  };
}

describe("withAssertionQualifiers", () => {
  it("normalizes assertion_status from an endpoint's status field", () => {
    const records = [
      rec("project_x", "project", { document_time_status: "implemented" }),
      rec("route_y", "route", {}),
      rec("relation_1", "relation", { relation_kind: "serves_route", subject_id: "project_x", object_id: "route_y" }),
    ];
    withAssertionQualifiers(records);
    expect(records[2]!.payload.assertion_status).toBe("delivered");
  });

  it("prefers an explicit relation status and defaults to unknown otherwise", () => {
    const records = [
      rec("a", "project", {}),
      rec("b", "route", {}),
      rec("rel_prop", "relation", { relation_kind: "serves_route", subject_id: "a", object_id: "b", status: "proposed" }),
      rec("rel_unk", "relation", { relation_kind: "serves_route", subject_id: "a", object_id: "b" }),
    ];
    withAssertionQualifiers(records);
    expect(records[2]!.payload.assertion_status).toBe("proposed");
    expect(records[3]!.payload.assertion_status).toBe("unknown");
  });

  it("marks present-tense route corridor operation relations as delivered", () => {
    const records = [
      rec("route_b35", "route", { route_id: "B35", route_record_scope: "true_route" }),
      rec("corridor_church", "corridor", { corridor_name: "Church Avenue" }),
      rec("rel", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_b35",
        object_id: "corridor_church",
        description: "B35 runs along Church Ave corridor.",
      }),
      rec("rel_current_with_adjacent_proposed_change", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_b35",
        object_id: "corridor_church",
        description: "B35 currently operates on Church Avenue and is proposed for a terminal swap.",
      }),
      rec("rel_current_with_adjacent_proposed_treatment", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_b35",
        object_id: "corridor_church",
        description: "B35 operates on Church Avenue where SBS stations are proposed.",
      }),
    ];

    withAssertionQualifiers(records);
    expect(records[2]!.payload.assertion_status).toBe("delivered");
    expect(records[3]!.payload.assertion_status).toBe("delivered");
    expect(records[4]!.payload.assertion_status).toBe("delivered");
  });

  it("classifies planned and proposed route corridor operation relations from explicit operation text", () => {
    const records = [
      rec("route_bx41", "route", { route_id: "Bx41", route_record_scope: "true_route" }),
      rec("corridor_webster", "corridor", { corridor_name: "Webster Avenue" }),
      rec("rel_future", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_bx41",
        object_id: "corridor_webster",
        description: "Bx41 SBS will operate along the Webster Avenue corridor.",
      }),
      rec("rel_would", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_bx41",
        object_id: "corridor_webster",
        description: "M23 SBS would operate on 23rd Street.",
      }),
      rec("rel_proposed", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_bx41",
        object_id: "corridor_webster",
        description: "Proposed route operates on Webster Avenue.",
      }),
      rec(
        "rel_source_quote",
        "relation",
        {
          relation_kind: "operates_on_corridor",
          relation_family: "corridor_scope",
          subject_id: "route_bx41",
          object_id: "corridor_webster",
        },
        { evidence_refs: [{ source_id: "src", source_quote: "Northbound Bx41 SBS will travel on Webster Avenue." }] },
      ),
      rec("rel_candidate", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_bx41",
        object_id: "corridor_webster",
        description: "Candidate route could operate on Webster Avenue.",
      }),
      rec("rel_to_be", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_bx41",
        object_id: "corridor_webster",
        description: "Route to be operated on Webster Avenue.",
      }),
    ];

    withAssertionQualifiers(records);
    expect(records[2]!.payload.assertion_status).toBe("planned");
    expect(records[3]!.payload.assertion_status).toBe("unknown");
    expect(records[4]!.payload.assertion_status).toBe("proposed");
    expect(records[5]!.payload.assertion_status).toBe("planned");
    expect(records[6]!.payload.assertion_status).toBe("unknown");
    expect(records[7]!.payload.assertion_status).toBe("unknown");
  });

  it("uses token-aware future guards for current route-corridor descriptions", () => {
    const records = [
      rec("route_bx41", "route", { route_id: "Bx41", route_record_scope: "true_route" }),
      rec("corridor_webster", "corridor", { corridor_name: "Webster Avenue" }),
      rec("rel_williamsbridge", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_bx41",
        object_id: "corridor_webster",
        description: "Bx41 SBS operates on the Webster Avenue corridor from The Hub to Williamsbridge.",
      }),
      rec("rel_travels", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_bx41",
        object_id: "corridor_webster",
        description: "B24 travels along Marcy Av between Borinquen Pl and Broadway.",
      }),
      rec("rel_primary", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_bx41",
        object_id: "corridor_webster",
        description: "B41 is the primary route on Flatbush Ave.",
      }),
      rec("rel_utilizes", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_bx41",
        object_id: "corridor_webster",
        description: "Bx7 bus route utilizes the Broadway corridor.",
      }),
      rec("rel_serves", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_bx41",
        object_id: "corridor_webster",
        description: "M60 SBS serves the 125th Street corridor.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.slice(2)) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("keeps non route-corridor operation surfaces unknown", () => {
    const records = [
      rec("project_b35", "project", { project_name: "B35 bus improvements" }),
      rec("corridor_church", "corridor", { corridor_name: "Church Avenue" }),
      rec("route_bq", "route", { route_id: "B/Q", route_type: "subway", route_record_scope: "true_route" }),
      rec("route_q20", "route", { route_id: "Q20A/Q20B", route_record_scope: "split_candidate" }),
      rec("route_b35", "route", { route_id: "B35", route_record_scope: "true_route" }),
      rec("rel", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "project_b35",
        object_id: "corridor_church",
        description: "B35 runs along Church Ave corridor.",
      }),
      rec("rel_subway", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_bq",
        object_id: "corridor_church",
        description: "B/Q subway serves the Kings Highway corridor.",
      }),
      rec("rel_split", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_q20",
        object_id: "corridor_church",
        description: "Q20A/Q20B serves the Main Street corridor.",
      }),
      rec("rel_missing_description", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_q20",
        object_id: "corridor_church",
      }),
      rec("rel_derived", "relation", {
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
        subject_id: "route_b35",
        object_id: "corridor_church",
        derived_relation: true,
        description: "B35 will operate on Church Avenue.",
      }),
    ];

    withAssertionQualifiers(records);
    expect(records[5]!.payload.assertion_status).toBe("unknown");
    expect(records[6]!.payload.assertion_status).toBe("unknown");
    expect(records[7]!.payload.assertion_status).toBe("unknown");
    expect(records[8]!.payload.assertion_status).toBe("unknown");
    expect(records[9]!.payload.assertion_status).toBe("unknown");
  });

  it("marks true bus route corridor operations from source context as delivered", () => {
    const sourceExtra = { source_id: "corridor_source", source_ids: ["corridor_source"], evidence_refs: [{ source_id: "corridor_source" }] };
    const relationExtra = { source_id: "corridor_source", source_ids: ["corridor_source"], evidence_refs: [{ source_id: "corridor_source", source_quote: "Route appears in the source corridor route table." }] };
    const records = [
      rec("source_update", "source", { title: "Lexington Avenue Bus Lane Upgrades", content_type: "presentation", description: "Update includes existing bus routes and proposed capital improvements." }, { source_id: "corridor_source" }),
      rec("route_m101", "route", { route_id: "M101", route_record_scope: "true_route", route_type: "local_bus" }, sourceExtra),
      rec("route_m60", "route", { route_id: "M60", route_record_scope: "true_route" }, sourceExtra),
      rec("corridor_lex", "corridor", { corridor_name: "Lexington Avenue" }, sourceExtra),
      rec("corridor_125", "corridor", { corridor_name: "125th Street" }, sourceExtra),
      rec("rel_local", "relation", { relation_kind: "operates_on_corridor", relation_family: "corridor_scope", subject_id: "route_m101", object_id: "corridor_lex" }, relationExtra),
      rec("rel_source_bus_context", "relation", { relation_kind: "operates_on_corridor", relation_family: "corridor_scope", subject_id: "route_m60", object_id: "corridor_125" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    expect(records[5]!.payload.assertion_status).toBe("delivered");
    expect(records[6]!.payload.assertion_status).toBe("delivered");
  });

  it("keeps source-context corridor inference away from draft/proposed sources, split routes, and rail routes", () => {
    const sourceExtra = { source_id: "corridor_source", source_ids: ["corridor_source"], evidence_refs: [{ source_id: "corridor_source" }] };
    const planRelationExtra = { source_id: "plan_source", source_ids: ["plan_source"], evidence_refs: [{ source_id: "plan_source", source_quote: "Route appears in the proposed source table." }] };
    const relationExtra = { source_id: "corridor_source", source_ids: ["corridor_source"], evidence_refs: [{ source_id: "corridor_source", source_quote: "Route appears in the source corridor route table." }] };
    const records = [
      rec("source_update", "source", { title: "Bus Priority Project Update", content_type: "presentation" }, { source_id: "corridor_source" }),
      rec("source_plan", "source", { title: "Draft Bus Service Plan", content_type: "presentation" }, { source_id: "plan_source" }),
      rec("route_true", "route", { route_id: "B35", route_record_scope: "true_route", route_type: "local_bus" }, sourceExtra),
      rec("route_split", "route", { route_id: "Q52/Q53", route_record_scope: "split_candidate", route_type: "select_bus_service" }, sourceExtra),
      rec("route_subway", "route", { route_id: "Q", route_record_scope: "true_route", route_type: "subway" }, sourceExtra),
      rec("corridor_church", "corridor", { corridor_name: "Church Avenue" }, sourceExtra),
      rec("rel_plan_source", "relation", { relation_kind: "operates_on_corridor", relation_family: "corridor_scope", subject_id: "route_true", object_id: "corridor_church" }, planRelationExtra),
      rec("rel_split", "relation", { relation_kind: "operates_on_corridor", relation_family: "corridor_scope", subject_id: "route_split", object_id: "corridor_church" }, relationExtra),
      rec("rel_subway", "relation", { relation_kind: "operates_on_corridor", relation_family: "corridor_scope", subject_id: "route_subway", object_id: "corridor_church" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks true-route operated-by agency relations as delivered", () => {
    const records = [
      rec("route_m15", "route", { route_id: "M15", route_record_scope: "true_route" }),
      rec("entity_nyct", "entity", { entity_name: "MTA NYCT" }),
      rec("rel", "relation", {
        relation_kind: "operated_by",
        relation_family: "agency_role",
        subject_id: "route_m15",
        object_id: "entity_nyct",
        description: "M15 SBS is operated by MTA NYCT.",
      }),
      rec("rel_no_is", "relation", {
        relation_kind: "operated_by",
        relation_family: "agency_role",
        subject_id: "route_m15",
        object_id: "entity_nyct",
        description: "B82 operated by New York City Transit.",
      }),
      rec("rel_active_voice", "relation", {
        relation_kind: "operated_by",
        relation_family: "agency_role",
        subject_id: "route_m15",
        object_id: "entity_nyct",
        description: "MTA NYCT operates the M15 SBS route.",
      }),
      rec("rel_missing_description", "relation", {
        relation_kind: "operated_by",
        relation_family: "agency_role",
        subject_id: "route_m15",
        object_id: "entity_nyct",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.slice(2)) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("marks agency operates true-route relations as delivered", () => {
    const records = [
      rec("entity_nyct", "entity", { entity_name: "MTA NYCT" }),
      rec("route_m14", "route", { route_id: "M14", route_record_scope: "true_route" }),
      rec("rel", "relation", {
        relation_kind: "operates",
        relation_family: "agency_role",
        subject_id: "entity_nyct",
        object_id: "route_m14",
        description: "MTA New York City Transit operates the M14 A/D Select Bus Service.",
      }),
      rec("rel_missing_description", "relation", {
        relation_kind: "operates",
        relation_family: "agency_role",
        subject_id: "entity_nyct",
        object_id: "route_m14",
      }),
    ];

    withAssertionQualifiers(records);
    expect(records[2]!.payload.assertion_status).toBe("delivered");
    expect(records[3]!.payload.assertion_status).toBe("delivered");
  });

  it("keeps route operator inference scoped to present-tense true-route agency relations", () => {
    const records = [
      rec("route_split", "route", { route_id: "B103", route_record_scope: "split_candidate" }),
      rec("route_true", "route", { route_id: "M15", route_record_scope: "true_route" }),
      rec("corridor_34", "corridor", { corridor_name: "34th Street" }),
      rec("entity_nyct", "entity", { entity_name: "MTA NYCT" }),
      rec("rel_split", "relation", {
        relation_kind: "operated_by",
        relation_family: "agency_role",
        subject_id: "route_split",
        object_id: "entity_nyct",
        description: "B103 is operated by MTA Bus.",
      }),
      rec("rel_corridor", "relation", {
        relation_kind: "operated_by",
        relation_family: "agency_role",
        subject_id: "corridor_34",
        object_id: "entity_nyct",
        description: "34th Street is operated by MTA.",
      }),
      rec("rel_operates_route", "relation", {
        relation_kind: "operates_route",
        relation_family: "route_scope",
        subject_id: "entity_nyct",
        object_id: "route_true",
        description: "MTA NYCT operates the M15 SBS route.",
      }),
      rec("rel_active_voice", "relation", {
        relation_kind: "operated_by",
        relation_family: "agency_role",
        subject_id: "route_true",
        object_id: "entity_nyct",
        description: "MTA NYCT operates the M15 SBS route.",
      }),
      rec("rel_missing_description", "relation", {
        relation_kind: "operated_by",
        relation_family: "agency_role",
        subject_id: "route_true",
        object_id: "entity_nyct",
      }),
      rec("rel_future", "relation", {
        relation_kind: "operated_by",
        relation_family: "agency_role",
        subject_id: "route_true",
        object_id: "entity_nyct",
        description: "M15 SBS will be operated by MTA NYCT.",
      }),
      rec("rel_operates_corridor", "relation", {
        relation_kind: "operates",
        relation_family: "agency_role",
        subject_id: "entity_nyct",
        object_id: "corridor_34",
        description: "MTA NYCT operates on 34th Street.",
      }),
      rec("rel_operates_future", "relation", {
        relation_kind: "operates",
        relation_family: "agency_role",
        subject_id: "entity_nyct",
        object_id: "route_true",
        description: "MTA NYCT will operate the route.",
      }),
    ];

    withAssertionQualifiers(records);
    expect(records[4]!.payload.assertion_status).toBe("unknown");
    expect(records[5]!.payload.assertion_status).toBe("unknown");
    expect(records[6]!.payload.assertion_status).toBe("delivered");
    expect(records[7]!.payload.assertion_status).toBe("delivered");
    expect(records[8]!.payload.assertion_status).toBe("delivered");
    expect(records[9]!.payload.assertion_status).toBe("unknown");
    expect(records[10]!.payload.assertion_status).toBe("unknown");
    expect(records[11]!.payload.assertion_status).toBe("unknown");
  });

  it("marks source published-by entity relations as delivered", () => {
    const records = [
      rec("source_report", "source", { title: "Staff Summary" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("rel", "relation", {
        relation_kind: "published_by",
        relation_family: "publication_role",
        subject_id: "source_report",
        object_id: "entity_mta",
        description: "Staff Summary was published by MTA.",
      }),
    ];

    withAssertionQualifiers(records);
    expect(records[2]!.payload.assertion_status).toBe("delivered");
  });

  it("keeps published-by inference scoped to source-to-entity publication edges", () => {
    const records = [
      rec("source_report", "source", { title: "Staff Summary" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("entity_report", "entity", { entity_name: "Annual Report" }),
      rec("rel_entity_subject", "relation", {
        relation_kind: "published_by",
        relation_family: "publication_role",
        subject_id: "entity_report",
        object_id: "entity_mta",
        description: "Annual Report published by MTA.",
      }),
      rec("rel_entity_object", "relation", {
        relation_kind: "published_by",
        relation_family: "publication_role",
        subject_id: "source_report",
        object_id: "source_report",
        description: "Report published by source.",
      }),
      rec("rel_wrong_family", "relation", {
        relation_kind: "published_by",
        relation_family: "agency_role",
        subject_id: "source_report",
        object_id: "entity_mta",
        description: "Staff Summary was published by MTA.",
      }),
    ];

    withAssertionQualifiers(records);
    expect(records[3]!.payload.assertion_status).toBe("unknown");
    expect(records[4]!.payload.assertion_status).toBe("unknown");
    expect(records[5]!.payload.assertion_status).toBe("unknown");
  });

  it("marks source/entity publication authorship relations as delivered", () => {
    const records = [
      rec("source_staff_summary", "source", { title: "Staff Summary" }, { source_id: "summary_source" }),
      rec("source_report", "source", { title: "Annual Report" }, { source_id: "report_source" }),
      rec("entity_nyct", "entity", { entity_name: "MTA NYCT" }, { source_id: "summary_source" }),
      rec("entity_author", "entity", { entity_name: "Jaibala Patel" }, { source_id: "report_source" }),
      rec("entity_consultant", "entity", { entity_name: "McKinsey & Co." }, { source_id: "report_source" }),
      rec("rel_prepared", "relation", {
        relation_kind: "prepared_by",
        relation_family: "publication_role",
        subject_id: "source_staff_summary",
        object_id: "entity_nyct",
        description: "Staff summary prepared by MTA NYCT.",
      }, { source_id: "summary_source", source_ids: ["summary_source"] }),
      rec("rel_authored", "relation", {
        relation_kind: "authored_by",
        relation_family: "publication_role",
        subject_id: "source_report",
        object_id: "entity_author",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_inverse_authored", "relation", {
        relation_kind: "authored_by",
        relation_family: "publication_role",
        subject_id: "entity_author",
        object_id: "source_report",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_inverse_prepared", "relation", {
        relation_kind: "prepared",
        relation_family: "publication_role",
        subject_id: "entity_consultant",
        object_id: "source_report",
        description: "Consultant prepared the financial scenarios used in the report.",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("keeps publication authorship inference scoped away from wrong endpoints, wrong family, future wording, and source mismatch", () => {
    const records = [
      rec("source_report", "source", { title: "Staff Summary" }, { source_id: "report_source" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }, { source_id: "report_source" }),
      rec("project_bus", "project", { project_name: "Bus Program" }, { source_id: "report_source" }),
      rec("rel_wrong_endpoint", "relation", {
        relation_kind: "prepared_by",
        relation_family: "publication_role",
        subject_id: "source_report",
        object_id: "project_bus",
        description: "Staff summary prepared by project team.",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_wrong_family", "relation", {
        relation_kind: "prepared_by",
        relation_family: "agency_role",
        subject_id: "source_report",
        object_id: "entity_mta",
        description: "Staff summary prepared by MTA.",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_future", "relation", {
        relation_kind: "prepared_by",
        relation_family: "publication_role",
        subject_id: "source_report",
        object_id: "entity_mta",
        description: "Staff summary will be prepared by MTA.",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_inverse_wrong_source", "relation", {
        relation_kind: "authored_by",
        relation_family: "publication_role",
        subject_id: "entity_mta",
        object_id: "source_report",
      }, { source_id: "other_source", source_ids: ["other_source"] }),
      rec("rel_inverse_future", "relation", {
        relation_kind: "prepared",
        relation_family: "publication_role",
        subject_id: "entity_mta",
        object_id: "source_report",
        description: "MTA will prepare the report.",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.slice(3)) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks source subject publication relations as delivered when relation provenance matches the source endpoint", () => {
    const records = [
      rec("source_crime", "source", { title: "January 2023 Crime Report" }, { source_id: "crime_source" }),
      rec("source_finance", "source", { title: "Financial and Ridership Report" }, { source_id: "finance_source" }),
      rec("entity_subway", "entity", { entity_name: "NYCT Subway" }, { source_id: "crime_source" }),
      rec("entity_lirr", "entity", { entity_name: "Long Island Rail Road" }, { source_id: "finance_source" }),
      rec(
        "rel_about",
        "relation",
        {
          relation_kind: "about",
          relation_family: "publication_role",
          subject_id: "source_crime",
          object_id: "entity_subway",
          description: "The crime report provides statistics about the NYCT Subway system.",
        },
        { source_id: "crime_source", source_ids: ["crime_source"] },
      ),
      rec(
        "rel_about_entity",
        "relation",
        {
          relation_kind: "about_entity",
          relation_family: "publication_role",
          subject_id: "source_finance",
          object_id: "entity_lirr",
        },
        { source_id: "finance_source", source_ids: ["finance_source"] },
      ),
      rec(
        "rel_covers",
        "relation",
        {
          relation_kind: "covers",
          relation_family: "publication_role",
          subject_id: "source_finance",
          object_id: "entity_lirr",
          description: "Financial and Ridership Report covering Long Island Rail Road.",
        },
        { source_id: "finance_source", source_ids: ["finance_source"] },
      ),
    ];

    withAssertionQualifiers(records);
    for (const record of records.slice(4)) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("marks source publication scope, audience, attribution, and submission relations as delivered with matching provenance", () => {
    const relationKinds = [
      "covers_entity",
      "pertains_to",
      "is_about",
      "addresses_entity",
      "description_about",
      "report_subject",
      "prepared_for",
      "published_for",
      "committee_work_plan_of",
      "drafted_by",
      "has_author",
      "sourced_from",
      "sponsored_by",
    ];
    const records = [
      rec("source_report", "source", { title: "Committee Work Plan" }, { source_id: "report_source" }),
      rec("source_may_report", "source", { title: "May 2025 Crime Report" }, { source_id: "crime_source" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }, { source_id: "report_source" }),
      rec("entity_nypd", "entity", { entity_name: "NYPD Transit Bureau" }, { source_id: "crime_source" }),
      ...relationKinds.map((relationKind) =>
        rec(
          `rel_${relationKind}`,
          "relation",
          {
            relation_kind: relationKind,
            relation_family: "publication_role",
            subject_id: "source_report",
            object_id: "entity_mta",
            description: `Source relation ${relationKind} names MTA.`,
          },
          { source_id: "report_source", source_ids: ["report_source"] },
        ),
      ),
      rec(
        "rel_submitted_by",
        "relation",
        {
          relation_kind: "submitted_by",
          relation_family: "agency_role",
          subject_id: "source_report",
          object_id: "entity_mta",
          description: "The report is submitted by MTA.",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_submitted_by_may_report",
        "relation",
        {
          relation_kind: "submitted_by",
          relation_family: "agency_role",
          subject_id: "source_may_report",
          object_id: "entity_nypd",
        },
        { source_id: "crime_source", source_ids: ["crime_source"] },
      ),
      rec(
        "rel_presented_by",
        "relation",
        {
          relation_kind: "presented_by",
          relation_family: "agency_role",
          subject_id: "source_report",
          object_id: "entity_mta",
          description: "The source presentation was presented by MTA.",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_presented_by_may_report",
        "relation",
        {
          relation_kind: "presented_by",
          relation_family: "agency_role",
          subject_id: "source_may_report",
          object_id: "entity_nypd",
        },
        { source_id: "crime_source", source_ids: ["crime_source"] },
      ),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("keeps source publication relation inference scoped away from wrong endpoint kinds, wrong family, provenance mismatch, and temporal wording", () => {
    const records = [
      rec("source_report", "source", { title: "Report" }, { source_id: "report_source" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }, { source_id: "report_source" }),
      rec("claim_report", "claim", { claim_name: "report claim" }, { source_id: "report_source" }),
      rec("event_meeting", "event", { event_name: "Committee Meeting" }, { source_id: "report_source" }),
      rec(
        "rel_event_object",
        "relation",
        {
          relation_kind: "prepared_for",
          relation_family: "publication_role",
          subject_id: "source_report",
          object_id: "event_meeting",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_claim_object",
        "relation",
        {
          relation_kind: "covers",
          relation_family: "publication_role",
          subject_id: "source_report",
          object_id: "claim_report",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_wrong_family",
        "relation",
        {
          relation_kind: "prepared_for",
          relation_family: "agency_role",
          subject_id: "source_report",
          object_id: "entity_mta",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_wrong_publication_family",
        "relation",
        {
          relation_kind: "about",
          relation_family: "dependency_or_reference",
          subject_id: "source_report",
          object_id: "entity_mta",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_mismatched_source",
        "relation",
        {
          relation_kind: "about",
          relation_family: "publication_role",
          subject_id: "source_report",
          object_id: "entity_mta",
        },
        { source_id: "other_source", source_ids: ["other_source"] },
      ),
      rec(
        "rel_future",
        "relation",
        {
          relation_kind: "prepared_for",
          relation_family: "publication_role",
          subject_id: "source_report",
          object_id: "entity_mta",
          description: "Report will be prepared for MTA.",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_submitted_by_event",
        "relation",
        {
          relation_kind: "submitted_by",
          relation_family: "agency_role",
          subject_id: "event_meeting",
          object_id: "entity_mta",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_submitted_by_future",
        "relation",
        {
          relation_kind: "submitted_by",
          relation_family: "agency_role",
          subject_id: "source_report",
          object_id: "entity_mta",
          description: "Report will be submitted by MTA.",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_presented_by_event",
        "relation",
        {
          relation_kind: "presented_by",
          relation_family: "agency_role",
          subject_id: "event_meeting",
          object_id: "entity_mta",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_presented_by_mismatched_source",
        "relation",
        {
          relation_kind: "presented_by",
          relation_family: "agency_role",
          subject_id: "source_report",
          object_id: "entity_mta",
        },
        { source_id: "other_source", source_ids: ["other_source"] },
      ),
      rec(
        "rel_presented_by_future",
        "relation",
        {
          relation_kind: "presented_by",
          relation_family: "agency_role",
          subject_id: "source_report",
          object_id: "entity_mta",
          description: "Report will be presented by MTA.",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks publication document link relations as delivered for source/event/claim document endpoints", () => {
    const records = [
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("entity_committee", "entity", { entity_name: "Finance Committee" }),
      rec("source_financial", "source", { title: "Financial Performance Report" }),
      rec("source_workplan", "source", { title: "2026 Work Plan" }),
      rec("event_release", "event", { event_family: "publication", event_kind: "data_release" }),
      rec("event_meeting", "event", { event_family: "public_engagement", event_kind: "board_meeting" }),
      rec("claim_section", "claim", { claim_name: "Annual procurement report" }),
      rec("rel_publishes_source", "relation", {
        relation_kind: "publishes",
        relation_family: "publication_role",
        subject_id: "entity_mta",
        object_id: "source_financial",
      }),
      rec("rel_releases_event", "relation", {
        relation_kind: "releases",
        relation_family: "publication_role",
        subject_id: "entity_mta",
        object_id: "event_release",
        description: "MTA released the dataset in 2023.",
      }),
      rec("rel_has_workplan", "relation", {
        relation_kind: "has_workplan",
        relation_family: "publication_role",
        subject_id: "entity_committee",
        object_id: "source_workplan",
      }),
      rec("rel_has_document", "relation", {
        relation_kind: "has_document",
        relation_family: "publication_role",
        subject_id: "event_meeting",
        object_id: "source_financial",
      }),
      rec("rel_source_claim_section", "relation", {
        relation_kind: "includes_section",
        relation_family: "publication_role",
        subject_id: "source_financial",
        object_id: "claim_section",
      }),
      rec("rel_claim_source_section", "relation", {
        relation_kind: "is_part_of",
        relation_family: "publication_role",
        subject_id: "claim_section",
        object_id: "source_financial",
      }),
      rec("rel_subject_of", "relation", {
        relation_kind: "subject_of",
        relation_family: "publication_role",
        subject_id: "entity_mta",
        object_id: "source_financial",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("keeps publication document link inference scoped away from wrong endpoints, wrong family, and future wording", () => {
    const records = [
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("entity_report", "entity", { entity_name: "Annual Report" }),
      rec("source_report", "source", { title: "Report" }),
      rec("event_service", "event", { event_family: "service_change", event_kind: "service_change" }),
      rec("claim_section", "claim", { claim_name: "Report section" }),
      rec("rel_published_by_entity", "relation", {
        relation_kind: "published_by",
        relation_family: "publication_role",
        subject_id: "entity_report",
        object_id: "entity_mta",
      }),
      rec("rel_wrong_event_family", "relation", {
        relation_kind: "releases",
        relation_family: "publication_role",
        subject_id: "entity_mta",
        object_id: "event_service",
      }),
      rec("rel_wrong_family", "relation", {
        relation_kind: "has_document",
        relation_family: "dependency_or_reference",
        subject_id: "event_service",
        object_id: "source_report",
      }),
      rec("rel_future", "relation", {
        relation_kind: "publishes",
        relation_family: "publication_role",
        subject_id: "entity_mta",
        object_id: "source_report",
        description: "MTA will publish the report.",
      }),
      rec("rel_wrong_claim_direction", "relation", {
        relation_kind: "includes_section",
        relation_family: "publication_role",
        subject_id: "claim_section",
        object_id: "source_report",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks entity delivered-report publication relations as delivered", () => {
    const records = [
      rec("entity_presenter", "entity", { entity_name: "President NYCT", entity_type: "person" }),
      rec("entity_agency", "entity", { entity_name: "MTA NYCT" }),
      rec("source_minutes", "source", { title: "Committee Minutes" }),
      rec("event_committee", "event", { event_family: "public_engagement", event_kind: "committee_meeting" }),
      rec("claim_update", "claim", { claim_name: "Jamaica Bus Terminal update" }),
      rec("rel_source", "relation", {
        relation_kind: "delivered_report",
        relation_family: "publication_role",
        subject_id: "entity_presenter",
        object_id: "source_minutes",
      }),
      rec("rel_event", "relation", {
        relation_kind: "delivered_report",
        relation_family: "publication_role",
        subject_id: "entity_presenter",
        object_id: "event_committee",
        description: "President delivered the safety and security report at the committee meeting.",
      }),
      rec("rel_claim", "relation", {
        relation_kind: "delivered_report",
        relation_family: "publication_role",
        subject_id: "entity_presenter",
        object_id: "claim_update",
      }),
      rec("rel_entity", "relation", {
        relation_kind: "delivered_report",
        relation_family: "publication_role",
        subject_id: "entity_presenter",
        object_id: "entity_agency",
        description: "President delivered the President's Report.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("keeps delivered-report publication inference scoped away from wrong shapes and future wording", () => {
    const records = [
      rec("entity_presenter", "entity", { entity_name: "President NYCT", entity_type: "person" }),
      rec("source_minutes", "source", { title: "Committee Minutes" }),
      rec("event_committee", "event", { event_family: "public_engagement", event_kind: "committee_meeting" }),
      rec("rel_wrong_family", "relation", {
        relation_kind: "delivered_report",
        relation_family: "agency_role",
        subject_id: "entity_presenter",
        object_id: "source_minutes",
      }),
      rec("rel_non_entity_subject", "relation", {
        relation_kind: "delivered_report",
        relation_family: "publication_role",
        subject_id: "event_committee",
        object_id: "source_minutes",
      }),
      rec("rel_self", "relation", {
        relation_kind: "delivered_report",
        relation_family: "publication_role",
        subject_id: "entity_presenter",
        object_id: "entity_presenter",
      }),
      rec("rel_future", "relation", {
        relation_kind: "delivered_report",
        relation_family: "publication_role",
        subject_id: "entity_presenter",
        object_id: "source_minutes",
        description: "President will deliver the report at the next meeting.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks scheduled timeline and agenda relations as planned", () => {
    const records = [
      rec("entity_committee", "entity", { entity_name: "NYCT Committee" }),
      rec("source_workplan", "source", { title: "2024 WORK PLAN", content_type: "work plan" }, { source_id: "workplan_source" }),
      rec("event_april", "event", { event_name: "April 2025 committee meeting" }),
      rec("event_agenda", "event", { event_name: "April 2025 agenda" }),
      rec("event_workplan_agenda", "event", {
        event_name: "April 2024 Agenda",
        event_kind: "committee meeting agenda",
        date_normalized: "2024-04",
      }),
      rec("event_workplan_meeting", "event", {
        event_name: "April 2024 Committee Meeting",
        event_kind: "committee meeting",
        date_normalized: "2024-04",
      }),
      rec("rel_meeting", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_committee",
        object_id: "event_april",
        description: "NYCT Committee April 2025 scheduled meeting",
      }),
      rec("rel_agenda", "relation", {
        relation_kind: "has_agenda_item",
        relation_family: "timeline_context",
        subject_id: "entity_committee",
        object_id: "event_agenda",
        description: "Transit Committee April 2025 scheduled agenda items",
      }),
      rec("rel_workplan_agenda", "relation", {
        relation_kind: "has_agenda_event",
        relation_family: "timeline_context",
        subject_id: "source_workplan",
        object_id: "event_workplan_agenda",
        description: "The work plan lists the April agenda item.",
      }),
      rec(
        "rel_entity_workplan_meeting",
        "relation",
        {
          relation_kind: "has_timeline_event",
          relation_family: "timeline_context",
          subject_id: "entity_committee",
          object_id: "event_workplan_meeting",
          description: "Committee meeting listed in the work plan.",
        },
        { source_id: "workplan_source", source_ids: ["workplan_source"] },
      ),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("planned");
  });

  it("keeps scheduled timeline inference scoped away from no-item and non-timeline edges", () => {
    const records = [
      rec("entity_committee", "entity", { entity_name: "NYCT Committee" }),
      rec("source_workplan", "source", { title: "2025 WORK PLAN", content_type: "work plan" }, { source_id: "workplan_source" }),
      rec("source_report", "source", { title: "Committee Report", content_type: "report" }, { source_id: "report_source" }),
      rec("event_july", "event", { event_name: "July 2025 committee meeting" }),
      rec("event_no_items", "event", {
        event_name: "August 2025 Agenda",
        event_kind: "committee meeting agenda",
        date_normalized: "2025-08",
        description: "No Items",
      }),
      rec("event_wrong_kind", "event", {
        event_name: "Bus launch",
        event_kind: "project_launch",
        date_normalized: "2025-08",
      }),
      rec("event_budget", "event", {
        event_name: "Budget Presentation",
        event_kind: "budget_presentation",
        date_normalized: "2025-08",
      }),
      rec("event_no_date", "event", {
        event_name: "September 2025 Agenda",
        event_kind: "committee meeting agenda",
      }),
      rec("metric_item", "metric_claim", { metric_name: "scheduled_count" }),
      rec("rel_no_items", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_committee",
        object_id: "event_july",
        description: "July 2025 scheduled committee meeting - No Items",
      }),
      rec("rel_no_meeting", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_committee",
        object_id: "event_july",
        description: "Bridges and Tunnels Committee has no meeting scheduled in August 2025",
      }),
      rec("rel_metric", "relation", {
        relation_kind: "has_metric",
        relation_family: "metric_context",
        subject_id: "entity_committee",
        object_id: "metric_item",
        description: "Scheduled item count",
      }),
      rec("rel_presented_at", "relation", {
        relation_kind: "presented_at",
        relation_family: "timeline_context",
        subject_id: "entity_committee",
        object_id: "event_july",
        description: "Report scheduled for committee presentation",
      }),
      rec("rel_workplan_no_items", "relation", {
        relation_kind: "has_agenda_event",
        relation_family: "timeline_context",
        subject_id: "source_workplan",
        object_id: "event_no_items",
        description: "The work plan lists no items for the month.",
      }),
      rec("rel_workplan_wrong_kind", "relation", {
        relation_kind: "has_agenda_event",
        relation_family: "timeline_context",
        subject_id: "source_workplan",
        object_id: "event_wrong_kind",
        description: "The work plan lists the bus launch.",
      }),
      rec("rel_workplan_no_date", "relation", {
        relation_kind: "has_agenda_event",
        relation_family: "timeline_context",
        subject_id: "source_workplan",
        object_id: "event_no_date",
        description: "The work plan lists the September agenda item.",
      }),
      rec(
        "rel_entity_workplan_no_items",
        "relation",
        {
          relation_kind: "has_timeline_event",
          relation_family: "timeline_context",
          subject_id: "entity_committee",
          object_id: "event_no_items",
          description: "Committee work plan says No Items scheduled.",
        },
        { source_id: "workplan_source", source_ids: ["workplan_source"] },
      ),
      rec(
        "rel_entity_workplan_wrong_kind",
        "relation",
        {
          relation_kind: "has_timeline_event",
          relation_family: "timeline_context",
          subject_id: "entity_committee",
          object_id: "event_budget",
          description: "Budget presentation listed in work plan.",
        },
        { source_id: "workplan_source", source_ids: ["workplan_source"] },
      ),
      rec(
        "rel_entity_workplan_no_date",
        "relation",
        {
          relation_kind: "has_timeline_event",
          relation_family: "timeline_context",
          subject_id: "entity_committee",
          object_id: "event_no_date",
          description: "Committee meeting listed in work plan.",
        },
        { source_id: "workplan_source", source_ids: ["workplan_source"] },
      ),
      rec(
        "rel_entity_non_workplan_source",
        "relation",
        {
          relation_kind: "has_timeline_event",
          relation_family: "timeline_context",
          subject_id: "entity_committee",
          object_id: "event_july",
          description: "Committee meeting listed in a report.",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks work-plan agenda item relations as planned", () => {
    const records = [
      rec("source_workplan", "source", { title: "2024 Work Plan - Agenda Items" }, { source_id: "workplan_source" }),
      rec("entity_nyct", "entity", { entity_name: "NYC Transit Committee Members" }),
      rec("entity_bus", "entity", { entity_name: "MTA Bus Company" }),
      rec("claim_budget", "claim", { claim_name: "2025 Budget Adoption" }),
      rec("event_jan", "event", {
        event_family: "governance",
        event_kind: "agenda_item",
        event_name: "January 2024 Agenda Items",
        date_normalized: "2024-01",
      }),
      rec("event_meeting", "event", {
        event_family: "public_engagement",
        event_kind: "committee_agenda_item",
        event_name: "February 2024 Committee Meeting Agenda",
        date_normalized: "2024-02",
      }),
      rec("event_no_items", "event", {
        event_family: "public_engagement",
        event_kind: "committee_meeting_agenda",
        event_name: "March 2024 - No Items",
        date_normalized: "2024-03",
        description: "No items scheduled.",
      }),
      rec("event_workplan_meeting", "event", {
        event_family: "public_engagement",
        event_kind: "committee_meeting",
        event_name: "December 2024 NYCT Committee Meeting",
      }),
      rec("rel_entity_agenda", "relation", {
        relation_kind: "has_agenda_item",
        relation_family: "timeline_context",
        subject_id: "entity_nyct",
        object_id: "event_jan",
        description: "Approval of 2024 NYCT Committee Work Plan",
      }, { source_id: "workplan_source", source_ids: ["workplan_source"] }),
      rec("rel_subject_agenda", "relation", {
        relation_kind: "subject_of_agenda_item",
        relation_family: "timeline_context",
        subject_id: "entity_bus",
        object_id: "event_meeting",
        description: "MTA Bus budget presented as Transit Committee agenda item.",
      }, { source_id: "workplan_source", source_ids: ["workplan_source"] }),
      rec("rel_event_claim", "relation", {
        relation_kind: "has_agenda_item",
        relation_family: "timeline_context",
        subject_id: "event_workplan_meeting",
        object_id: "claim_budget",
        description: "December 2024 meeting includes 2025 Budget adoption.",
      }, { source_id: "workplan_source", source_ids: ["workplan_source"] }),
      rec("rel_no_items", "relation", {
        relation_kind: "has_agenda_item",
        relation_family: "timeline_context",
        subject_id: "entity_nyct",
        object_id: "event_no_items",
        description: "Transit Committee March 2024 - No Items",
      }, { source_id: "workplan_source", source_ids: ["workplan_source"] }),
    ];

    withAssertionQualifiers(records);
    expect(records.find((record) => record.record_id === "rel_entity_agenda")!.payload.assertion_status).toBe("planned");
    expect(records.find((record) => record.record_id === "rel_subject_agenda")!.payload.assertion_status).toBe("planned");
    expect(records.find((record) => record.record_id === "rel_event_claim")!.payload.assertion_status).toBe("planned");
    expect(records.find((record) => record.record_id === "rel_no_items")!.payload.assertion_status).toBe("unknown");
  });

  it("marks held public-engagement meeting timeline events as delivered", () => {
    const records = [
      rec("source_minutes", "source", { title: "Minutes of the MTA Finance Committee Meeting", published_date_normalized: "2026-03-23" }, { source_id: "minutes_source" }),
      rec("source_exhibit", "source", { title: "Exhibit Book Finance Committee Meeting", published_date_normalized: "2026-05-20" }, { source_id: "exhibit_source" }),
      rec("entity_finance", "entity", { entity_name: "MTA Finance Committee" }, { source_id: "minutes_source" }),
      rec("entity_fmtac", "entity", { entity_name: "FMTAC" }, { source_id: "exhibit_source" }),
      rec("event_finance", "event", {
        event_family: "public_engagement",
        event_kind: "committee meeting",
        event_name: "MTA Finance Committee Meeting",
        date_normalized: "2026-03-23",
      }),
      rec("event_board", "event", {
        event_family: "public_engagement",
        event_kind: "annual_board_meeting",
        event_name: "FMTAC Annual Board Meeting",
        date_normalized: "2026-05-20",
      }),
      rec(
        "rel_finance",
        "relation",
        {
          relation_kind: "has_timeline_event",
          relation_family: "timeline_context",
          subject_id: "entity_finance",
          object_id: "event_finance",
          description: "Regular monthly meeting of the MTA Finance Committee held on March 23, 2026.",
        },
        { source_id: "minutes_source", source_ids: ["minutes_source"] },
      ),
      rec(
        "rel_board",
        "relation",
        {
          relation_kind: "has_timeline_event",
          relation_family: "timeline_context",
          subject_id: "entity_fmtac",
          object_id: "event_board",
          description: "FMTAC held its 2026 Annual Board Meeting on May 20, 2026.",
        },
        { source_id: "exhibit_source", source_ids: ["exhibit_source"] },
      ),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("classifies dated public meeting timeline events from source-relative dates", () => {
    const records = [
      rec("source_minutes", "source", { title: "MTA Board Meeting Minutes", published_date_normalized: "2025-05-28" }, { source_id: "minutes_source" }),
      rec("source_agenda", "source", { title: "MTA Headquarters Procurements", published_date_normalized: "2025-09-26" }, { source_id: "agenda_source" }),
      rec("source_workplan", "source", { title: "2025 Committee Work Plan", published_date_normalized: "2025-09-26" }, { source_id: "workplan_source" }),
      rec("entity_mta", "entity", { entity_name: "Metropolitan Transportation Authority" }),
      rec("corridor_webster", "corridor", { corridor_name: "Webster Avenue Corridor" }),
      rec("source_subject", "source", { title: "Chair's Presentation" }, { source_id: "source_subject" }),
      rec("event_delivered", "event", {
        event_family: "public_engagement",
        event_kind: "board_meeting",
        event_name: "MTA Board Meeting",
        date_normalized: "2025-05-28",
      }),
      rec("event_planned", "event", {
        event_family: "public_engagement",
        event_kind: "board meeting",
        event_name: "MTA Board meeting",
        date_normalized: "2025-09-30",
      }),
      rec("event_source_subject", "event", {
        event_family: "public_engagement",
        event_kind: "board committee meeting",
        event_name: "Finance Committee Meeting",
        date_normalized: "2025-05-28",
      }),
      rec("event_corridor", "event", {
        event_family: "public_engagement",
        event_kind: "community advisory committee meeting",
        event_name: "Webster Avenue SBS CAC Meeting",
        date_normalized: "2025-05-28",
      }),
      rec("event_no_meeting", "event", {
        event_family: "public_engagement",
        event_kind: "committee_meeting",
        event_name: "No meeting",
        date_normalized: "2025-05-28",
      }),
      rec("rel_delivered", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_mta",
        object_id: "event_delivered",
        description: "MTA Board Meeting where the Chair's Presentation was delivered.",
      }, { source_id: "minutes_source", source_ids: ["minutes_source"] }),
      rec("rel_planned", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_mta",
        object_id: "event_planned",
        description: "MTA Board meeting on 09/30/25 to vote on procurement actions.",
      }, { source_id: "agenda_source", source_ids: ["agenda_source"] }),
      rec("rel_source_subject", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "source_subject",
        object_id: "event_source_subject",
        description: "The presentation was delivered at the Finance Committee Meeting.",
      }, { source_id: "minutes_source", source_ids: ["minutes_source"] }),
      rec("rel_corridor", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "corridor_webster",
        object_id: "event_corridor",
        description: "CAC Meeting for Webster Avenue SBS project held on May 28, 2025.",
      }, { source_id: "minutes_source", source_ids: ["minutes_source"] }),
      rec("rel_workplan", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_mta",
        object_id: "event_planned",
        description: "Committee meeting listed in the work plan.",
      }, { source_id: "workplan_source", source_ids: ["workplan_source"] }),
      rec("rel_no_meeting", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_mta",
        object_id: "event_no_meeting",
        description: "No meetings held.",
      }, { source_id: "minutes_source", source_ids: ["minutes_source"] }),
    ];

    withAssertionQualifiers(records);
    expect(records.find((record) => record.record_id === "rel_delivered")!.payload.assertion_status).toBe("delivered");
    expect(records.find((record) => record.record_id === "rel_planned")!.payload.assertion_status).toBe("planned");
    expect(records.find((record) => record.record_id === "rel_source_subject")!.payload.assertion_status).toBe("delivered");
    expect(records.find((record) => record.record_id === "rel_corridor")!.payload.assertion_status).toBe("delivered");
    expect(records.find((record) => record.record_id === "rel_workplan")!.payload.assertion_status).toBe("unknown");
    expect(records.find((record) => record.record_id === "rel_no_meeting")!.payload.assertion_status).toBe("unknown");
  });

  it("keeps held-meeting timeline inference scoped away from no-meeting, future dates, and approval agenda text", () => {
    const records = [
      rec("source_minutes", "source", { title: "Minutes of Committee Meeting", published_date_normalized: "2025-10-27" }, { source_id: "minutes_source" }),
      rec("source_workplan", "source", { title: "2025 Committee Work Plan", published_date_normalized: "2025-10-27" }, { source_id: "workplan_source" }),
      rec("entity_committee", "entity", { entity_name: "MTA Committee" }, { source_id: "minutes_source" }),
      rec("event_no_meeting", "event", {
        event_family: "public_engagement",
        event_kind: "committee_meeting",
        event_name: "August 2025 - No Meetings Held",
        date_normalized: "2025-08",
        description: "No meetings held.",
      }),
      rec("event_future", "event", {
        event_family: "public_engagement",
        event_kind: "committee_meeting",
        event_name: "Future Committee Meeting",
        date_normalized: "2025-11-01",
      }),
      rec("event_workplan", "event", {
        event_family: "public_engagement",
        event_kind: "committee_meeting",
        event_name: "Work Plan Committee Meeting",
        date_normalized: "2025-10-27",
      }),
      rec("event_agenda", "event", {
        event_family: "public_engagement",
        event_kind: "board_meeting",
        event_name: "Board meeting to consider approval",
        date_normalized: "2025-10-27",
      }),
      rec("event_source_subject", "event", {
        event_family: "public_engagement",
        event_kind: "committee_meeting",
        event_name: "Source subject meeting",
        date_normalized: "2025-10-27",
      }),
      rec("rel_no_meeting", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_committee",
        object_id: "event_no_meeting",
        description: "No meetings held in August 2025.",
      }, { source_id: "minutes_source", source_ids: ["minutes_source"] }),
      rec("rel_future", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_committee",
        object_id: "event_future",
        description: "Committee held a meeting on November 1, 2025.",
      }, { source_id: "minutes_source", source_ids: ["minutes_source"] }),
      rec("rel_workplan", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_committee",
        object_id: "event_workplan",
        description: "Committee held a meeting on October 27, 2025.",
      }, { source_id: "workplan_source", source_ids: ["workplan_source"] }),
      rec("rel_source_subject", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "source_minutes",
        object_id: "event_source_subject",
        description: "Committee held a meeting on October 27, 2025.",
      }, { source_id: "minutes_source", source_ids: ["minutes_source"] }),
      rec("rel_agenda", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_committee",
        object_id: "event_agenda",
        description: "MTA Board meeting to consider approval of a policy.",
      }, { source_id: "minutes_source", source_ids: ["minutes_source"] }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation" && !["rel_workplan", "rel_source_subject"].includes(candidate.record_id))) expect(record.payload.assertion_status).toBe("unknown");
    expect(records.find((record) => record.record_id === "rel_workplan")!.payload.assertion_status).toBe("planned");
    expect(records.find((record) => record.record_id === "rel_source_subject")!.payload.assertion_status).toBe("delivered");
  });

  it("marks meeting-agenda authorization request timeline events as planned", () => {
    const records = [
      rec("source_agenda", "source", { title: "MTA Board Meeting Agenda and Staff Summary Packet" }, { source_id: "agenda_source" }),
      rec("entity_real_estate", "entity", { entity_name: "MTA Real Estate" }, { source_id: "agenda_source" }),
      rec("event_license", "event", {
        event_family: "approval",
        event_kind: "authorization",
        event_name: "License Agreement with BNSF Railway Company",
        date_normalized: "2025-06-25",
      }),
      rec(
        "rel_auth",
        "relation",
        {
          relation_kind: "has_timeline_event",
          relation_family: "timeline_context",
          subject_id: "entity_real_estate",
          object_id: "event_license",
        },
        {
          source_id: "agenda_source",
          source_ids: ["agenda_source"],
          evidence_refs: [{ source_id: "agenda_source", source_quote: "MTA Real Estate hereby requests authorization to enter into a license agreement." }],
        },
      ),
    ];

    withAssertionQualifiers(records);
    expect(records[3]!.payload.assertion_status).toBe("planned");
  });

  it("keeps meeting-agenda authorization inference scoped away from work plans, generic approvals, no-items, and completed actions", () => {
    const records = [
      rec("source_agenda", "source", { title: "MTA Board Meeting Agenda and Staff Summary Packet" }, { source_id: "agenda_source" }),
      rec("source_workplan", "source", { title: "2025 Committee Work Plan" }, { source_id: "workplan_source" }),
      rec("entity_real_estate", "entity", { entity_name: "MTA Real Estate" }, { source_id: "agenda_source" }),
      rec("event_auth", "event", {
        event_family: "approval",
        event_kind: "authorization",
        event_name: "License Agreement",
        date_normalized: "2025-06-25",
      }),
      rec("event_no_date", "event", {
        event_family: "approval",
        event_kind: "authorization",
        event_name: "License Agreement",
      }),
      rec("event_board_auth", "event", {
        event_family: "approval",
        event_kind: "board_authorization",
        event_name: "Board Authorization",
        date_normalized: "2025-06-25",
      }),
      rec(
        "rel_workplan",
        "relation",
        {
          relation_kind: "has_timeline_event",
          relation_family: "timeline_context",
          subject_id: "entity_real_estate",
          object_id: "event_auth",
        },
        {
          source_id: "workplan_source",
          source_ids: ["workplan_source"],
          evidence_refs: [{ source_id: "workplan_source", source_quote: "MTA Real Estate requests authorization." }],
        },
      ),
      rec(
        "rel_no_date",
        "relation",
        {
          relation_kind: "has_timeline_event",
          relation_family: "timeline_context",
          subject_id: "entity_real_estate",
          object_id: "event_no_date",
        },
        {
          source_id: "agenda_source",
          source_ids: ["agenda_source"],
          evidence_refs: [{ source_id: "agenda_source", source_quote: "MTA Real Estate requests authorization." }],
        },
      ),
      rec(
        "rel_board_auth",
        "relation",
        {
          relation_kind: "has_timeline_event",
          relation_family: "timeline_context",
          subject_id: "entity_real_estate",
          object_id: "event_board_auth",
        },
        {
          source_id: "agenda_source",
          source_ids: ["agenda_source"],
          evidence_refs: [{ source_id: "agenda_source", source_quote: "MTA Real Estate requests authorization." }],
        },
      ),
      rec(
        "rel_no_items",
        "relation",
        {
          relation_kind: "has_timeline_event",
          relation_family: "timeline_context",
          subject_id: "entity_real_estate",
          object_id: "event_auth",
        },
        {
          source_id: "agenda_source",
          source_ids: ["agenda_source"],
          evidence_refs: [{ source_id: "agenda_source", source_quote: "No Items. MTA Real Estate requests authorization." }],
        },
      ),
      rec(
        "rel_authorized",
        "relation",
        {
          relation_kind: "has_timeline_event",
          relation_family: "timeline_context",
          subject_id: "entity_real_estate",
          object_id: "event_auth",
        },
        {
          source_id: "agenda_source",
          source_ids: ["agenda_source"],
          evidence_refs: [{ source_id: "agenda_source", source_quote: "The Board authorized the agreement." }],
        },
      ),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("classifies entity and source implementation timeline events from comparable source dates", () => {
    const records = [
      rec("source_report", "source", { title: "Operations Report", published_date_normalized: "2025-02-01" }, { source_id: "report_source" }),
      rec("source_after", "source", { title: "Completed Operations Report", published_date_normalized: "2025-05-01" }, { source_id: "after_source" }),
      rec("entity_lirr", "entity", { entity_name: "LIRR" }),
      rec("entity_nypd", "entity", { entity_name: "NYPD" }),
      rec("event_holiday", "event", {
        event_family: "implementation",
        event_kind: "holiday_service",
        date_normalized: "2025-03-17",
        description: "LIRR will operate extra holiday service.",
      }),
      rec("event_timetable", "event", {
        event_family: "implementation",
        event_kind: "timetable_change",
        date_normalized: "2025-03-03",
        description: "LIRR will adjust schedules beginning March 3.",
      }),
      rec("event_cameras", "event", {
        event_family: "implementation",
        event_kind: "program_implementation",
        date_normalized: "2022-10",
        description: "NYPD implemented the Cops, Cameras, and Care program.",
      }),
      rec("event_safe_passage", "event", {
        event_family: "implementation",
        event_kind: "operation",
        date_normalized: "2025-04-01",
        description: "NYPD coordinated safe passage operation.",
      }),
      rec("rel_holiday", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_lirr",
        object_id: "event_holiday",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_timetable", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "source_report",
        object_id: "event_timetable",
        description: "LIRR will adjust schedules beginning March 3.",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_cameras", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_nypd",
        object_id: "event_cameras",
      }, { source_id: "after_source", source_ids: ["after_source"] }),
      rec("rel_safe_passage", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_nypd",
        object_id: "event_safe_passage",
      }, { source_id: "after_source", source_ids: ["after_source"] }),
    ];

    withAssertionQualifiers(records);
    expect(records.find((record) => record.record_id === "rel_holiday")!.payload.assertion_status).toBe("planned");
    expect(records.find((record) => record.record_id === "rel_timetable")!.payload.assertion_status).toBe("planned");
    expect(records.find((record) => record.record_id === "rel_cameras")!.payload.assertion_status).toBe("delivered");
    expect(records.find((record) => record.record_id === "rel_safe_passage")!.payload.assertion_status).toBe("delivered");
  });

  it("keeps entity implementation timeline inference scoped away from weak dates, route subjects, conditionals, and public meetings", () => {
    const records = [
      rec("source_report", "source", { title: "Operations Report", published_date_normalized: "2025-02-01" }, { source_id: "report_source" }),
      rec("source_no_date", "source", { title: "Operations Report" }, { source_id: "no_date_source" }),
      rec("entity_lirr", "entity", { entity_name: "LIRR" }),
      rec("route_m34", "route", { route_id: "M34", route_record_scope: "true_route" }),
      rec("event_no_date", "event", {
        event_family: "implementation",
        event_kind: "holiday_service",
        description: "LIRR will operate extra service.",
      }),
      rec("event_year_only", "event", {
        event_family: "implementation",
        event_kind: "trackwork",
        date_normalized: "2025",
        description: "Trackwork started.",
      }),
      rec("event_route", "event", {
        event_family: "implementation",
        event_kind: "implementation",
        date_normalized: "2025-01-01",
        description: "M34 SBS would be implemented in the future.",
      }),
      rec("event_conditional", "event", {
        event_family: "implementation",
        event_kind: "implementation",
        date_normalized: "2025-01-01",
        description: "Implementation if approved by the Board.",
      }),
      rec("event_meeting", "event", {
        event_family: "public_engagement",
        event_kind: "committee_meeting",
        date_normalized: "2025-03-01",
        description: "Public committee meeting.",
      }),
      rec("rel_no_event_date", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_lirr",
        object_id: "event_no_date",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_no_source_date", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_lirr",
        object_id: "event_route",
      }, { source_id: "no_date_source", source_ids: ["no_date_source"] }),
      rec("rel_year_only", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_lirr",
        object_id: "event_year_only",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_route_subject", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "route_m34",
        object_id: "event_route",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_conditional", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_lirr",
        object_id: "event_conditional",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_public_meeting", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_lirr",
        object_id: "event_meeting",
      }, { source_id: "report_source", source_ids: ["report_source"] }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks true-route implementation timeline events as delivered", () => {
    const records = [
      rec("route_bx12", "route", { route_id: "Bx12", route_record_scope: "true_route" }),
      rec("event_launch", "event", {
        event_kind: "implementation",
        event_family: "implementation",
        date_normalized: "2008-06",
        description: "Bx12 SBS implemented on Fordham Road.",
      }),
      rec("event_fare", "event", {
        event_kind: "service_implementation",
        event_family: "implementation",
        date_normalized: "2011-11",
        description: "Off-board fare payment began on the route.",
      }),
      rec("rel_launch", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "route_bx12",
        object_id: "event_launch",
      }),
      rec("rel_fare", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "route_bx12",
        object_id: "event_fare",
      }),
    ];

    withAssertionQualifiers(records);
    expect(records[3]!.payload.assertion_status).toBe("delivered");
    expect(records[4]!.payload.assertion_status).toBe("delivered");
  });

  it("keeps route implementation timeline inference scoped away from split routes, undated events, wrong kinds, and proposed text", () => {
    const records = [
      rec("route_true", "route", { route_id: "Bx12", route_record_scope: "true_route" }),
      rec("route_split", "route", { route_id: "M34/M34A", route_record_scope: "split_candidate" }),
      rec("event_launch", "event", {
        event_kind: "implementation",
        event_family: "implementation",
        date_normalized: "2011-11",
        description: "M34/M34A SBS implemented on 34th Street.",
      }),
      rec("event_no_date", "event", {
        event_kind: "implementation",
        event_family: "implementation",
        description: "Bx12 SBS implemented on Fordham Road.",
      }),
      rec("event_wrong_kind", "event", {
        event_kind: "budget_presentation",
        event_family: "implementation",
        date_normalized: "2025-02",
        description: "Budget presentation opened discussion.",
      }),
      rec("event_proposed", "event", {
        event_kind: "implementation",
        event_family: "implementation",
        date_normalized: "2025-02",
        description: "Route would be implemented in the future.",
      }),
      rec("rel_split", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "route_split",
        object_id: "event_launch",
      }),
      rec("rel_no_date", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "route_true",
        object_id: "event_no_date",
      }),
      rec("rel_wrong_kind", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "route_true",
        object_id: "event_wrong_kind",
      }),
      rec("rel_proposed", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "route_true",
        object_id: "event_proposed",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks dated entity approval and adoption timeline events as delivered", () => {
    const records = [
      rec("entity_board", "entity", { entity_name: "MTA Board" }),
      rec("event_charter", "event", {
        event_family: "approval",
        event_kind: "charter_adoption",
        date_normalized: "2024-01-01",
        description: "The committee charter was adopted as amended.",
      }),
      rec("event_authorization", "event", {
        event_family: "approval",
        event_kind: "board_authorization",
        date_normalized: "2024-02-01",
        description: "Board authorized the agreement.",
      }),
      rec("event_resolution", "event", {
        event_family: "approval",
        event_kind: "resolution_adoption",
        date_normalized: "2024-03-01",
        description: "TBTA adopted the resolution.",
      }),
      rec("rel_charter", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_board",
        object_id: "event_charter",
      }),
      rec("rel_authorization", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_board",
        object_id: "event_authorization",
      }),
      rec("rel_resolution", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_board",
        object_id: "event_resolution",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("keeps approval timeline inference scoped away from approval-to, recommendation, undated, and non-entity edges", () => {
    const records = [
      rec("entity_board", "entity", { entity_name: "MTA Board" }),
      rec("event_context", "event", { event_name: "Board meeting" }),
      rec("event_generic", "event", {
        event_family: "approval",
        event_kind: "board_authorization",
        date_normalized: "2024-01-01",
        description: "Authorization for MTA to enter into an agreement.",
      }),
      rec("event_approval_to", "event", {
        event_family: "approval",
        event_kind: "board_authorization",
        date_normalized: "2024-01-01",
        description: "Approval to amend the contract.",
      }),
      rec("event_recommendation", "event", {
        event_family: "approval",
        event_kind: "board_adoption",
        date_normalized: "2024-01-01",
        description: "Committee recommends Board approval.",
      }),
      rec("event_undated", "event", {
        event_family: "approval",
        event_kind: "adoption",
        description: "Board adopted the item.",
      }),
      rec("event_wrong_kind", "event", {
        event_family: "approval",
        event_kind: "board_action",
        date_normalized: "2024-01-01",
        description: "Board approved the item.",
      }),
      rec("rel_generic", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_board",
        object_id: "event_generic",
      }),
      rec("rel_approval_to", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_board",
        object_id: "event_approval_to",
      }),
      rec("rel_recommendation", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_board",
        object_id: "event_recommendation",
      }),
      rec("rel_undated", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_board",
        object_id: "event_undated",
      }),
      rec("rel_wrong_kind", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "entity_board",
        object_id: "event_wrong_kind",
      }),
      rec("rel_event_subject", "relation", {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_id: "event_context",
        object_id: "event_wrong_kind",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks static entity organization hierarchy relations as delivered", () => {
    const records = [
      rec("entity_mta", "entity", { entity_name: "Metropolitan Transportation Authority" }),
      rec("entity_lirr", "entity", { entity_name: "Long Island Rail Road" }),
      rec("entity_board", "entity", { entity_name: "MTA Board" }),
      rec("entity_finance", "entity", { entity_name: "Finance Committee" }),
      rec("entity_bt", "entity", { entity_name: "MTA Bridges and Tunnels" }),
      rec("entity_tbta", "entity", { entity_name: "Triborough Bridge and Tunnel Authority" }),
      rec("entity_nyct", "entity", { entity_name: "MTA New York City Transit" }),
      rec("entity_procurement", "entity", { entity_name: "MTA Procurement" }),
      rec("entity_hq", "entity", { entity_name: "MTA HQ" }),
      rec("entity_chernat", "entity", { entity_name: "Olga Chernat" }),
      rec("entity_finance_dept", "entity", { entity_name: "MTA Finance Department" }),
      rec("entity_wsp", "entity", { entity_name: "WSP USA Inc." }),
      rec("entity_jv", "entity", { entity_name: "WSP and Atlas Joint Venture" }),
      rec("rel_lirr", "relation", {
        relation_kind: "part_of_agency",
        relation_family: "organization_hierarchy",
        subject_id: "entity_lirr",
        object_id: "entity_mta",
        description: "LIRR operating under MTA.",
      }),
      rec("rel_finance", "relation", {
        relation_kind: "part_of_agency",
        relation_family: "organization_hierarchy",
        subject_id: "entity_finance",
        object_id: "entity_board",
      }),
      rec("rel_part_of", "relation", {
        relation_kind: "part_of",
        relation_family: "organization_hierarchy",
        subject_id: "entity_lirr",
        object_id: "entity_mta",
        description: "Long Island Rail Road is a constituent operating agency of the MTA.",
      }),
      rec("rel_parent_org", "relation", {
        relation_kind: "parent_organization",
        relation_family: "organization_hierarchy",
        subject_id: "entity_bt",
        object_id: "entity_mta",
        description: "Bridges and Tunnels is an agency of the Metropolitan Transportation Authority.",
      }),
      rec("rel_has_sub", "relation", {
        relation_kind: "has_subsidiary",
        relation_family: "organization_hierarchy",
        subject_id: "entity_mta",
        object_id: "entity_bt",
        description: "MTA parent of Bridges and Tunnels.",
      }),
      rec("rel_subsidiary", "relation", {
        relation_kind: "subsidiary_of",
        relation_family: "organization_hierarchy",
        subject_id: "entity_bt",
        object_id: "entity_mta",
      }),
      rec("rel_parent_of", "relation", {
        relation_kind: "parent_of",
        relation_family: "organization_hierarchy",
        subject_id: "entity_mta",
        object_id: "entity_nyct",
      }),
      rec("rel_parent_entity", "relation", {
        relation_kind: "parent_entity",
        relation_family: "organization_hierarchy",
        subject_id: "entity_tbta",
        object_id: "entity_mta",
      }),
      rec("rel_has_agency", "relation", {
        relation_kind: "has_agency",
        relation_family: "organization_hierarchy",
        subject_id: "entity_mta",
        object_id: "entity_lirr",
      }),
      rec("rel_has_component", "relation", {
        relation_kind: "has_component",
        relation_family: "organization_hierarchy",
        subject_id: "entity_mta",
        object_id: "entity_nyct",
        description: "MTA includes MTA New York City Transit as a reporting entity component.",
      }),
      rec("rel_parent_subsidiary", "relation", {
        relation_kind: "parent_subsidiary",
        relation_family: "organization_hierarchy",
        subject_id: "entity_mta",
        object_id: "entity_bt",
      }),
      rec("rel_belongs_to", "relation", {
        relation_kind: "belongs_to",
        relation_family: "organization_hierarchy",
        subject_id: "entity_procurement",
        object_id: "entity_hq",
        description: "MTA Procurement belongs to MTA Headquarters.",
      }),
      rec("rel_member_of", "relation", {
        relation_kind: "member_of",
        relation_family: "organization_hierarchy",
        subject_id: "entity_chernat",
        object_id: "entity_finance_dept",
        description: "Olga Chernat is from the MTA Finance Department.",
      }),
      rec("rel_jv_member", "relation", {
        relation_kind: "member_of",
        relation_family: "organization_hierarchy",
        subject_id: "entity_wsp",
        object_id: "entity_jv",
        description: "WSP USA Inc. is a member of the joint venture.",
      }),
      rec("rel_includes_agency", "relation", {
        relation_kind: "includes_agency",
        relation_family: "organization_hierarchy",
        subject_id: "entity_mta",
        object_id: "entity_nyct",
        description: "MTA includes NYC Transit as an agency in consolidated reporting.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("keeps static organization hierarchy inference scoped away from self-links, non-entity endpoints, wrong shapes, raw aliases, and temporal wording", () => {
    const records = [
      rec("entity_mta", "entity", { entity_name: "Metropolitan Transportation Authority" }),
      rec("entity_future", "entity", { entity_name: "Future Agency" }),
      rec("route_m15", "route", { route_id: "M15", route_record_scope: "true_route" }),
      rec("project_bus", "project", { project_name: "Bus Program" }),
      rec("source_report", "source", { title: "Report" }),
      rec("rel_self", "relation", {
        relation_kind: "part_of_agency",
        relation_family: "organization_hierarchy",
        subject_id: "entity_mta",
        object_id: "entity_mta",
        description: "MTA part of MTA.",
      }),
      rec("rel_route", "relation", {
        relation_kind: "part_of_agency",
        relation_family: "organization_hierarchy",
        subject_id: "route_m15",
        object_id: "entity_mta",
        description: "M15 part of MTA.",
      }),
      rec("rel_project", "relation", {
        relation_kind: "part_of_agency",
        relation_family: "organization_hierarchy",
        subject_id: "entity_future",
        object_id: "project_bus",
        description: "Future Agency part of Bus Program.",
      }),
      rec("rel_source", "relation", {
        relation_kind: "part_of",
        relation_family: "organization_hierarchy",
        subject_id: "entity_future",
        object_id: "source_report",
        description: "Entity record part of source context.",
      }),
      rec("rel_wrong_family", "relation", {
        relation_kind: "part_of_agency",
        relation_family: "agency_role",
        subject_id: "entity_future",
        object_id: "entity_mta",
        description: "Future Agency part of MTA.",
      }),
      rec("rel_wrong_kind", "relation", {
        relation_kind: "managed_by",
        relation_family: "organization_hierarchy",
        subject_id: "entity_future",
        object_id: "entity_mta",
        description: "Future Agency managed by MTA.",
      }),
      rec("rel_raw_alias", "relation", {
        relation_kind: "agency_hierarchy",
        relation_family: "organization_hierarchy",
        subject_id: "entity_future",
        object_id: "entity_mta",
        description: "Future Agency part of MTA.",
      }),
      rec("rel_future", "relation", {
        relation_kind: "part_of",
        relation_family: "organization_hierarchy",
        subject_id: "entity_future",
        object_id: "entity_mta",
        description: "Future Agency will be part of MTA.",
      }),
      rec("rel_former", "relation", {
        relation_kind: "has_subsidiary",
        relation_family: "organization_hierarchy",
        subject_id: "entity_future",
        object_id: "entity_mta",
        description: "Former agency was part of MTA.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.slice(5)) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks static entity agency-role relations as delivered", () => {
    const records = [
      rec("entity_person", "entity", { entity_name: "Jane Doe" }),
      rec("entity_department", "entity", { entity_name: "MTA Finance Department" }),
      rec("entity_president", "entity", { entity_name: "Transit President" }),
      rec("entity_nyct", "entity", { entity_name: "MTA NYCT" }),
      rec("entity_officer", "entity", { entity_name: "Chief Safety Officer" }),
      rec("entity_tbta", "entity", { entity_name: "MTA Bridges and Tunnels" }),
      rec("entity_committee", "entity", { entity_name: "MTA Board Committee" }),
      rec("entity_lirr", "entity", { entity_name: "Long Island Rail Road" }),
      rec("entity_auditor", "entity", { entity_name: "External Auditor" }),
      rec("entity_pension_board", "entity", { entity_name: "Pension Board" }),
      rec("entity_manager", "entity", { entity_name: "Project Manager" }),
      rec("entity_liaison", "entity", { entity_name: "Financial Liaison" }),
      rec("rel_works_for", "relation", {
        relation_kind: "works_for",
        relation_family: "agency_role",
        subject_id: "entity_person",
        object_id: "entity_department",
        description: "Jane Doe is Deputy Chief, Financial Services at MTA Finance Department.",
      }),
      rec("rel_president", "relation", {
        relation_kind: "president_of",
        relation_family: "agency_role",
        subject_id: "entity_president",
        object_id: "entity_nyct",
      }),
      rec("rel_has_officer", "relation", {
        relation_kind: "has_officer",
        relation_family: "agency_role",
        subject_id: "entity_tbta",
        object_id: "entity_officer",
        description: "MTA Bridges and Tunnels has Chief Safety Officer Jane Doe.",
      }),
      rec("rel_oversees", "relation", {
        relation_kind: "oversees",
        relation_family: "agency_role",
        subject_id: "entity_committee",
        object_id: "entity_lirr",
        description: "The committee monitors and oversees LIRR operations.",
      }),
      rec("rel_has_leader", "relation", {
        relation_kind: "has_leader",
        relation_family: "agency_role",
        subject_id: "entity_nyct",
        object_id: "entity_president",
        description: "MTA NYCT has a president.",
      }),
      rec("rel_serves_as", "relation", {
        relation_kind: "serves_as",
        relation_family: "agency_role",
        subject_id: "entity_auditor",
        object_id: "entity_pension_board",
        description: "External Auditor serves as auditor for the Pension Board.",
      }),
      rec("rel_project_manager", "relation", {
        relation_kind: "project_manager_for",
        relation_family: "agency_role",
        subject_id: "entity_manager",
        object_id: "entity_nyct",
        description: "Project Manager is listed for NYCT procurements.",
      }),
      rec("rel_liaison", "relation", {
        relation_kind: "financial_liaison_for",
        relation_family: "agency_role",
        subject_id: "entity_liaison",
        object_id: "entity_lirr",
        description: "Financial Liaison serves as liaison for LIRR.",
      }),
      rec("rel_interim_president", "relation", {
        relation_kind: "is_interim_president_of",
        relation_family: "agency_role",
        subject_id: "entity_president",
        object_id: "entity_lirr",
        description: "Transit President is Interim President of LIRR.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("marks expanded static agency-role exact kinds as delivered", () => {
    const roleKinds = [
      "accountable_executive_for",
      "chief_safety_officer_for",
      "employs",
      "external_auditor",
      "financial_liaison_for",
      "has_employee",
      "has_leader",
      "has_personnel",
      "has_project_manager",
      "holds_position",
      "is_department_head_of",
      "is_executive_vice_president_of",
      "is_financial_liaison_for",
      "is_interim_president_of",
      "is_leader_of",
      "is_liaison_for",
      "is_officer_of",
      "lead_by",
      "leads",
      "leads_entity",
      "overseen_by",
      "oversees",
      "project_manager",
      "project_manager_for",
      "senior_vice_president_of",
      "serves_as",
      "transaction_manager_for",
      "under_direction_of",
      "vice_president_of",
    ];
    const records = [
      rec("entity_subject", "entity", { entity_name: "Role Holder" }),
      rec("entity_object", "entity", { entity_name: "Agency Unit" }),
      ...roleKinds.map((relationKind) =>
        rec(`rel_${relationKind}`, "relation", {
          relation_kind: relationKind,
          relation_family: "agency_role",
          subject_id: "entity_subject",
          object_id: "entity_object",
          description: `Role Holder has agency role ${relationKind} for Agency Unit.`,
        }),
      ),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("marks static agency officeholder and liaison aliases as delivered when role text is explicit", () => {
    const relationKinds = ["has_role", "chairs", "has_liaison", "leads_organization", "is_principal_of"];
    const records = [
      rec("entity_rinaldi", "entity", { entity_name: "Catherine Rinaldi" }),
      rec("entity_lirr", "entity", { entity_name: "Long Island Rail Road" }),
      ...relationKinds.map((relationKind) =>
        rec(
          `rel_${relationKind}`,
          "relation",
          {
            relation_kind: relationKind,
            relation_family: "agency_role",
            subject_id: "entity_rinaldi",
            object_id: "entity_lirr",
            description: `Catherine Rinaldi serves as president and financial liaison for LIRR via ${relationKind}.`,
          },
          { evidence_refs: [{ source_id: "src", source_quote: "President and financial liaison." }] },
        ),
      ),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("keeps static agency-role inference scoped away from non-entity endpoints, self-links, temporal wording, and unrelated role kinds", () => {
    const records = [
      rec("entity_person", "entity", { entity_name: "Jane Doe" }),
      rec("entity_department", "entity", { entity_name: "MTA Finance Department" }),
      rec("entity_former", "entity", { entity_name: "Former President Jane Doe" }, { display_name: "Former President Jane Doe" }),
      rec("source_report", "source", { title: "Staff Summary" }),
      rec("event_meeting", "event", { event_name: "Committee Meeting" }),
      rec("rel_non_entity", "relation", {
        relation_kind: "works_for",
        relation_family: "agency_role",
        subject_id: "entity_person",
        object_id: "source_report",
        description: "Jane Doe is Deputy Chief, Financial Services at MTA Finance Department.",
      }),
      rec("rel_self", "relation", {
        relation_kind: "works_for",
        relation_family: "agency_role",
        subject_id: "entity_person",
        object_id: "entity_person",
        description: "Jane Doe works for Jane Doe.",
      }),
      rec("rel_future", "relation", {
        relation_kind: "president_of",
        relation_family: "agency_role",
        subject_id: "entity_person",
        object_id: "entity_department",
        description: "Jane Doe will be president of the department.",
      }),
      rec("rel_former_display_name", "relation", {
        relation_kind: "president_of",
        relation_family: "agency_role",
        subject_id: "entity_former",
        object_id: "entity_department",
      }),
      rec("rel_wrong_kind", "relation", {
        relation_kind: "proposed_as",
        relation_family: "agency_role",
        subject_id: "entity_person",
        object_id: "entity_department",
        description: "Jane Doe proposed as committee chair.",
      }),
      rec("rel_reports_to_action", "relation", {
        relation_kind: "reports_to",
        relation_family: "agency_role",
        subject_id: "entity_person",
        object_id: "entity_department",
        description: "Jane Doe reports compliance status to the department.",
      }),
      rec("rel_officeholder_event", "relation", {
        relation_kind: "chairs",
        relation_family: "agency_role",
        subject_id: "entity_person",
        object_id: "event_meeting",
        description: "Jane Doe chairs the committee meeting.",
      }),
      rec("rel_officeholder_self", "relation", {
        relation_kind: "has_role",
        relation_family: "agency_role",
        subject_id: "entity_person",
        object_id: "entity_person",
        description: "Jane Doe has role President.",
      }),
      rec("rel_officeholder_future", "relation", {
        relation_kind: "has_liaison",
        relation_family: "agency_role",
        subject_id: "entity_person",
        object_id: "entity_department",
        description: "Jane Doe will be financial liaison.",
      }),
      rec("rel_officeholder_no_signal", "relation", {
        relation_kind: "has_role",
        relation_family: "agency_role",
        subject_id: "entity_person",
        object_id: "entity_department",
        description: "Jane Doe is associated with the department.",
      }),
      rec("rel_appointed_as", "relation", {
        relation_kind: "appointed_as",
        relation_family: "agency_role",
        subject_id: "entity_person",
        object_id: "entity_department",
        description: "Jane Doe would serve as trustee.",
      }),
      rec("rel_wrong_family", "relation", {
        relation_kind: "works_for",
        relation_family: "partnership_engagement",
        subject_id: "entity_person",
        object_id: "entity_department",
        description: "Jane Doe works for the department.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks active entity route-operator relations as delivered", () => {
    const records = [
      rec("entity_lirr", "entity", { entity_name: "MTA Long Island Rail Road" }),
      rec("route_babylon", "route", { route_id: "Babylon Branch", route_record_scope: "true_route" }, { display_name: "Babylon Branch" }),
      rec("route_q59", "route", { route_id: "Q59", route_record_scope: "true_route" }, { display_name: "Q59 bus" }),
      rec("rel_branch", "relation", {
        relation_kind: "operates_route",
        relation_family: "route_scope",
        subject_id: "entity_lirr",
        object_id: "route_babylon",
      }),
      rec("rel_bus", "relation", {
        relation_kind: "operates_route",
        relation_family: "route_scope",
        subject_id: "entity_lirr",
        object_id: "route_q59",
        description: "Grand Avenue Depot operates Q59 bus route.",
      }),
    ];

    withAssertionQualifiers(records);
    expect(records[3]!.payload.assertion_status).toBe("delivered");
    expect(records[4]!.payload.assertion_status).toBe("delivered");
  });

  it("keeps active route-operator inference scoped away from proposed labels, non-true routes, and wrong endpoints", () => {
    const records = [
      rec("entity_depot", "entity", { entity_name: "Grand Avenue Depot" }),
      rec("route_proposed", "route", { route_id: "B38", route_record_scope: "true_route" }, { display_name: "Proposed B38 Local" }),
      rec("route_split", "route", { route_id: "Q52/Q53", route_record_scope: "split_candidate" }, { display_name: "Q52/Q53 SBS" }),
      rec("corridor_qns", "corridor", { corridor_name: "Queens Boulevard" }),
      rec("rel_proposed", "relation", {
        relation_kind: "operates_route",
        relation_family: "route_scope",
        subject_id: "entity_depot",
        object_id: "route_proposed",
        description: "Grand Avenue Depot operates B38 bus route.",
      }),
      rec("rel_split", "relation", {
        relation_kind: "operates_route",
        relation_family: "route_scope",
        subject_id: "entity_depot",
        object_id: "route_split",
        description: "Depot operates Q52/Q53 route.",
      }),
      rec("rel_wrong_endpoint", "relation", {
        relation_kind: "operates_route",
        relation_family: "route_scope",
        subject_id: "entity_depot",
        object_id: "corridor_qns",
        description: "Depot operates on Queens Boulevard.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.slice(4)) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks static agency service, ownership, and terminal location relations as delivered", () => {
    const records = [
      rec("entity_njt", "entity", { entity_name: "NJ Transit" }),
      rec("entity_mnr", "entity", { entity_name: "Metro-North Railroad" }),
      rec("entity_mta", "entity", { entity_name: "Metropolitan Transportation Authority" }),
      rec("entity_fmtac", "entity", { entity_name: "First Mutual Transportation Assurance Company" }),
      rec("entity_gct", "entity", { entity_name: "Grand Central Terminal", entity_type: "terminal" }),
      rec("entity_pescatore", "entity", { entity_name: "Pescatore Seafood Company", entity_type: "business" }),
      rec("corridor_lower_montauk", "corridor", { corridor_name: "Lower Montauk Branch" }),
      rec("rel_operates", "relation", {
        relation_kind: "operates",
        relation_family: "agency_role",
        subject_id: "entity_njt",
        object_id: "entity_mnr",
        description: "NJ Transit operates West of Hudson trains for Metro-North Railroad.",
      }),
      rec("rel_service", "relation", {
        relation_kind: "provides_service_to",
        relation_family: "agency_role",
        subject_id: "entity_njt",
        object_id: "entity_mnr",
      }),
      rec("rel_entity_owned", "relation", {
        relation_kind: "owned_by",
        relation_family: "ownership_role",
        subject_id: "entity_fmtac",
        object_id: "entity_mta",
        description: "FMTAC is the MTA's captive insurance company.",
      }),
      rec("rel_corridor_owned", "relation", {
        relation_kind: "owned_by",
        relation_family: "ownership_role",
        subject_id: "corridor_lower_montauk",
        object_id: "entity_mnr",
        description: "The MTA Long Island Rail Road owns the Lower Montauk Branch.",
      }),
      rec("rel_located_at_terminal", "relation", {
        relation_kind: "located_at",
        relation_family: "location_scope",
        subject_id: "entity_pescatore",
        object_id: "entity_gct",
        description: "Pescatore Seafood Company operates at Grand Central Terminal.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("keeps agency service, ownership, and location inference scoped away from unsafe shapes", () => {
    const records = [
      rec("entity_njt", "entity", { entity_name: "NJ Transit" }),
      rec("entity_future", "entity", { entity_name: "Future Operator" }),
      rec("entity_mnr", "entity", { entity_name: "Metro-North Railroad" }),
      rec("entity_gct", "entity", { entity_name: "Grand Central Terminal", entity_type: "terminal" }),
      rec("entity_future_shop", "entity", { entity_name: "Future Shop", entity_type: "business" }),
      rec("entity_vendor", "entity", { entity_name: "Vendor", entity_type: "vendor" }),
      rec("event_license", "event", { event_name: "New License" }),
      rec("claim_service", "claim", { claim_name: "service claim" }),
      rec("source_report", "source", { title: "Report" }),
      rec("rel_claim_object", "relation", {
        relation_kind: "operates",
        relation_family: "agency_role",
        subject_id: "entity_njt",
        object_id: "claim_service",
        description: "NJ Transit operates West of Hudson trains.",
      }),
      rec("rel_self", "relation", {
        relation_kind: "operates",
        relation_family: "agency_role",
        subject_id: "entity_njt",
        object_id: "entity_njt",
        description: "NJ Transit operates itself.",
      }),
      rec("rel_future", "relation", {
        relation_kind: "operates",
        relation_family: "agency_role",
        subject_id: "entity_future",
        object_id: "entity_mnr",
        description: "Future Operator will operate service for Metro-North.",
      }),
      rec("rel_wrong_family", "relation", {
        relation_kind: "operates",
        relation_family: "partnership_engagement",
        subject_id: "entity_njt",
        object_id: "entity_mnr",
        description: "NJ Transit operates service for Metro-North.",
      }),
      rec("rel_source_owned", "relation", {
        relation_kind: "owned_by",
        relation_family: "ownership_role",
        subject_id: "source_report",
        object_id: "entity_mnr",
        description: "Report owned by Metro-North.",
      }),
      rec("rel_owned_future", "relation", {
        relation_kind: "owned_by",
        relation_family: "ownership_role",
        subject_id: "entity_future",
        object_id: "entity_mnr",
        description: "Future Operator will be owned by Metro-North.",
      }),
      rec("rel_event_location", "relation", {
        relation_kind: "located_at",
        relation_family: "location_scope",
        subject_id: "event_license",
        object_id: "entity_gct",
        description: "New license is located at Grand Central Terminal.",
      }),
      rec("rel_non_terminal_location", "relation", {
        relation_kind: "located_at",
        relation_family: "location_scope",
        subject_id: "entity_future_shop",
        object_id: "entity_vendor",
        description: "Future Shop is located at Vendor headquarters.",
      }),
      rec("rel_future_location", "relation", {
        relation_kind: "located_at",
        relation_family: "location_scope",
        subject_id: "entity_future_shop",
        object_id: "entity_gct",
        description: "Future Shop will be located at Grand Central Terminal.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks executed entity funding and agreement relations as delivered", () => {
    const records = [
      rec("source_may", "source", { title: "May 2025 Finance Committee Book", published_date_normalized: "2025-05-01" }, { source_id: "may_source" }),
      rec("source_direct", "source", { title: "Report on Agreements Entered Into Directly by the Real Estate Department", published_date_normalized: "2025-05-01" }, { source_id: "direct_source" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("entity_tbta", "entity", { entity_name: "TBTA" }),
      rec("entity_dutchess", "entity", { entity_name: "Dutchess County" }),
      rec("entity_lirr", "entity", { entity_name: "LIRR" }),
      rec("entity_vendor", "entity", { entity_name: "Vendor" }),
      rec("rel_transfer", "relation", {
        relation_kind: "transfers_funds_to",
        relation_family: "funding_award",
        subject_id: "entity_tbta",
        object_id: "entity_mta",
        description: "TBTA transfers operating surplus to MTA.",
      }),
      rec(
        "rel_payment",
        "relation",
        {
          relation_kind: "makes_payment_to",
          relation_family: "funding_award",
          subject_id: "entity_mta",
          object_id: "entity_dutchess",
          description: "MTA is required to make Mass Transportation Operating Assistance payments to Dutchess County.",
        },
        { source_id: "may_source", source_ids: ["may_source"] },
      ),
      rec("rel_license", "relation", {
        relation_kind: "entered_agreement_with",
        relation_family: "funding_award",
        subject_id: "entity_lirr",
        object_id: "entity_vendor",
        description: "LIRR short term license agreement with Mill Road.",
      }),
      rec("rel_executed", "relation", {
        relation_kind: "contracted_with",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "entity_vendor",
        description: "MTA executed contract with vendor.",
      }),
      rec("rel_contracted_by", "relation", {
        relation_kind: "contracted_by",
        relation_family: "funding_award",
        subject_id: "entity_vendor",
        object_id: "entity_mta",
        description: "Vendor contracted by MTA.",
      }),
      rec(
        "rel_direct_license",
        "relation",
        {
          relation_kind: "licenses",
          relation_family: "funding_award",
          subject_id: "entity_lirr",
          object_id: "entity_vendor",
          description: "LIRR licenses retail space to vendor.",
        },
        { source_id: "direct_source", source_ids: ["direct_source"] },
      ),
      rec(
        "rel_direct_counterparty",
        "relation",
        {
          relation_kind: "has_counterparty",
          relation_family: "funding_award",
          subject_id: "entity_lirr",
          object_id: "entity_vendor",
          description: "Vendor is the counterparty to the agreement.",
        },
        { source_id: "direct_source", source_ids: ["direct_source"] },
      ),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("classifies relation-owned procurement proposal funding relations as proposed", () => {
    const records = [
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("entity_vendor", "entity", { entity_name: "Vendor" }),
      rec("entity_polluted", "entity", { entity_name: "Polluted Vendor", description: "MTA proposes to award a contract to this vendor." }),
      rec("event_award", "event", { event_family: "approval" }),
      rec("rel_awarded_contract", "relation", {
        relation_kind: "awarded_contract",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "entity_vendor",
        description: "MTA proposes to award a contract to Vendor.",
      }),
      rec("rel_awards_contract_to", "relation", {
        relation_kind: "awards_contract_to",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "entity_vendor",
        description: "MTA proposes award to Vendor.",
      }),
      rec("rel_contract_vendor", "relation", {
        relation_kind: "contract_vendor",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "entity_vendor",
        description: "MTA proposes non-competitive procurement with Vendor.",
      }),
      rec("rel_endpoint_contamination", "relation", {
        relation_kind: "awarded_contract",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "entity_polluted",
      }),
      rec("rel_wrong_kind", "relation", {
        relation_kind: "procured_by",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "entity_vendor",
        description: "MTA proposes to award a contract to Vendor.",
      }),
      rec("rel_approval_request", "relation", {
        relation_kind: "awards_contract_to",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "entity_vendor",
        description: "MTA asks the Board to approve the award to Vendor.",
      }),
      rec("rel_ratification", "relation", {
        relation_kind: "awarded_contract",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "entity_vendor",
        description: "MTA proposes to award and requests ratification.",
      }),
      rec("rel_non_entity_endpoint", "relation", {
        relation_kind: "awarded_contract",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "event_award",
        description: "MTA proposes to award a contract to Vendor.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const id of ["rel_awarded_contract", "rel_awards_contract_to", "rel_contract_vendor"]) expect(records.find((record) => record.record_id === id)!.payload.assertion_status).toBe("proposed");
    for (const id of ["rel_endpoint_contamination", "rel_wrong_kind", "rel_approval_request", "rel_ratification", "rel_non_entity_endpoint"]) expect(records.find((record) => record.record_id === id)!.payload.assertion_status).toBe("unknown");
  });

  it("keeps funding inference scoped away from approval/proposal, mixed endpoints, self-links, and empty text", () => {
    const records = [
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("entity_vendor", "entity", { entity_name: "Vendor" }),
      rec("event_award", "event", { event_family: "approval" }),
      rec("source_direct", "source", { title: "Report on Agreements Entered Into Directly by the Real Estate Department" }, { source_id: "direct_source" }),
      rec("source_agenda", "source", { title: "Finance Committee Agenda Action Requested" }, { source_id: "agenda_source" }),
      rec("rel_request", "relation", {
        relation_kind: "contracted_with",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "entity_vendor",
        description: "MTA requests authorization to award the contract.",
      }),
      rec("rel_to_enter", "relation", {
        relation_kind: "entered_agreement_with",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "entity_vendor",
        description: "MTA seeks approval to enter into a lease.",
      }),
      rec("rel_expected", "relation", {
        relation_kind: "makes_payment_to",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "entity_vendor",
        description: "Payments are expected to be made.",
      }),
      rec("rel_mixed_endpoint", "relation", {
        relation_kind: "contracted_with",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "event_award",
        description: "MTA executed contract.",
      }),
      rec("rel_self", "relation", {
        relation_kind: "transfers_funds_to",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "entity_mta",
        description: "MTA transfers funds to MTA.",
      }),
      rec("rel_empty", "relation", {
        relation_kind: "entered_agreement_with",
        relation_family: "funding_award",
        subject_id: "entity_mta",
        object_id: "entity_vendor",
      }),
      rec(
        "rel_report_scope",
        "relation",
        {
          relation_kind: "reports_agreements_for",
          relation_family: "funding_award",
          subject_id: "entity_mta",
          object_id: "entity_vendor",
          description: "Real Estate Department reports agreements for NYCT.",
        },
        { source_id: "direct_source", source_ids: ["direct_source"] },
      ),
      rec(
        "rel_direct_agenda_request",
        "relation",
        {
          relation_kind: "licenses",
          relation_family: "funding_award",
          subject_id: "entity_mta",
          object_id: "entity_vendor",
          description: "Authorization to enter into a license agreement.",
        },
        { source_id: "agenda_source", source_ids: ["agenda_source"] },
      ),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("classifies partnership event roles and formal partnership artifacts", () => {
    const records = [
      rec("source_minutes", "source", { title: "May 2024 Meeting Summary", published_date_normalized: "2024-05-15" }, { source_id: "minutes_source" }),
      rec("source_workplan", "source", { title: "2025 Work Plan", content_type: "work plan", published_date_normalized: "2025-01-01" }, { source_id: "workplan_source" }),
      rec("source_prior", "source", { title: "Committee Book", published_date_normalized: "2025-01-01" }, { source_id: "prior_source" }),
      rec("event_meeting", "event", { event_family: "public_engagement", date_normalized: "2024-05-01" }),
      rec("event_workplan", "event", { event_family: "public_engagement", date_normalized: "2025-07-01", description: "Adopted budget presentation." }),
      rec("event_future", "event", { event_family: "implementation", date_normalized: "2025-03-01" }),
      rec("entity_dot", "entity", { entity_name: "NYC DOT" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("entity_twu", "entity", { entity_name: "TWU" }),
      rec(
        "rel_organized",
        "relation",
        {
          relation_kind: "organized_by",
          relation_family: "partnership_engagement",
          subject_id: "event_meeting",
          object_id: "entity_dot",
        },
        { source_id: "minutes_source", source_ids: ["minutes_source"] },
      ),
      rec("rel_participant", "relation", {
        relation_kind: "has_participant",
        relation_family: "partnership_engagement",
        subject_id: "event_meeting",
        object_id: "entity_mta",
        description: "MTA attended and discussed the project.",
      }),
      rec(
        "rel_workplan",
        "relation",
        {
          relation_kind: "has_participant",
          relation_family: "partnership_engagement",
          subject_id: "event_workplan",
          object_id: "entity_mta",
        },
        { source_id: "workplan_source", source_ids: ["workplan_source"] },
      ),
      rec(
        "rel_future_date",
        "relation",
        {
          relation_kind: "organized_by",
          relation_family: "partnership_engagement",
          subject_id: "event_future",
          object_id: "entity_mta",
          description: "MTA will provide an update.",
        },
        { source_id: "prior_source", source_ids: ["prior_source"] },
      ),
      rec("rel_mou", "relation", {
        relation_kind: "has_partner",
        relation_family: "partnership_engagement",
        subject_id: "entity_mta",
        object_id: "entity_dot",
        description: "MTA entered into a memorandum of understanding with NYC DOT.",
      }),
      rec("rel_task_force", "relation", {
        relation_kind: "collaborates_with",
        relation_family: "partnership_engagement",
        subject_id: "entity_mta",
        object_id: "entity_twu",
        description: "MTA and TWU established a joint task force.",
      }),
    ];

    withAssertionQualifiers(records);
    expect(records[9]!.payload.assertion_status).toBe("delivered");
    expect(records[10]!.payload.assertion_status).toBe("delivered");
    expect(records[11]!.payload.assertion_status).toBe("planned");
    expect(records[12]!.payload.assertion_status).toBe("planned");
    expect(records[13]!.payload.assertion_status).toBe("delivered");
    expect(records[14]!.payload.assertion_status).toBe("delivered");
  });

  it("keeps partnership inference scoped away from missing dates, generic collaboration, and wrong shapes", () => {
    const records = [
      rec("event_undated", "event", { event_family: "public_engagement" }),
      rec("event_wrong_family", "event", { event_family: "service_change", date_normalized: "2025-01-01" }),
      rec("entity_dot", "entity", { entity_name: "NYC DOT" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("rel_undated", "relation", {
        relation_kind: "organized_by",
        relation_family: "partnership_engagement",
        subject_id: "event_undated",
        object_id: "entity_dot",
        description: "NYC DOT hosted the meeting.",
      }),
      rec("rel_wrong_event_family", "relation", {
        relation_kind: "has_participant",
        relation_family: "partnership_engagement",
        subject_id: "event_wrong_family",
        object_id: "entity_mta",
        description: "MTA attended.",
      }),
      rec("rel_generic_partner", "relation", {
        relation_kind: "has_partner",
        relation_family: "partnership_engagement",
        subject_id: "entity_mta",
        object_id: "entity_dot",
        description: "MTA and NYC DOT are committed to working together.",
      }),
      rec("rel_imperative", "relation", {
        relation_kind: "collaborates_with",
        relation_family: "partnership_engagement",
        subject_id: "entity_mta",
        object_id: "entity_dot",
        description: "Collaborate with partner agencies.",
      }),
      rec("rel_wrong_shape", "relation", {
        relation_kind: "has_partner",
        relation_family: "partnership_engagement",
        subject_id: "event_wrong_family",
        object_id: "entity_dot",
        description: "Executed agreement.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks source claim containment relations as delivered when relation provenance and evidence match the source endpoint", () => {
    const records = [
      rec("source_report", "source", { title: "Crime Report" }, { source_id: "report_source" }),
      rec("claim_purpose", "claim", { claim_text: "The report provides statistical information." }, { source_id: "report_source" }),
      rec(
        "rel_source_has_claim",
        "relation",
        {
          relation_kind: "has_claim",
          relation_family: "claim_context",
          subject_id: "source_report",
          object_id: "claim_purpose",
        },
        {
          source_id: "report_source",
          source_ids: ["report_source"],
          evidence_refs: [
            {
              source_id: "report_source",
              evidence_id: "report_source#p001_c0001",
              source_path: "raw/sources/report_source/blocks.jsonl",
              page_number: 1,
              block_id: "p001_c0001",
              text_sha256: "sha256:test",
              text_source: "raw_text",
            },
          ],
        },
      ),
    ];

    withAssertionQualifiers(records);
    expect(records[2]!.payload.assertion_status).toBe("delivered");
  });

  it("keeps source claim containment inference scoped away from wrong endpoints, source mismatch, missing evidence, and provenance mismatch", () => {
    const records = [
      rec("source_report", "source", { title: "Crime Report" }, { source_id: "report_source" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }, { source_id: "report_source" }),
      rec("claim_same_source", "claim", { claim_text: "Same source claim." }, { source_id: "report_source" }),
      rec("claim_other_source", "claim", { claim_text: "Other source claim." }, { source_id: "other_source" }),
      rec(
        "rel_entity_has_claim",
        "relation",
        {
          relation_kind: "has_claim",
          relation_family: "claim_context",
          subject_id: "entity_mta",
          object_id: "claim_same_source",
        },
        {
          source_id: "report_source",
          source_ids: ["report_source"],
          evidence_refs: [
            {
              source_id: "report_source",
              evidence_id: "report_source#p001_c0001",
              source_path: "raw/sources/report_source/blocks.jsonl",
              page_number: 1,
              block_id: "p001_c0001",
              text_sha256: "sha256:test",
              text_source: "raw_text",
            },
          ],
        },
      ),
      rec(
        "rel_claim_source_mismatch",
        "relation",
        {
          relation_kind: "has_claim",
          relation_family: "claim_context",
          subject_id: "source_report",
          object_id: "claim_other_source",
        },
        {
          source_id: "report_source",
          source_ids: ["report_source"],
          evidence_refs: [
            {
              source_id: "report_source",
              evidence_id: "report_source#p001_c0001",
              source_path: "raw/sources/report_source/blocks.jsonl",
              page_number: 1,
              block_id: "p001_c0001",
              text_sha256: "sha256:test",
              text_source: "raw_text",
            },
          ],
        },
      ),
      rec(
        "rel_missing_evidence",
        "relation",
        {
          relation_kind: "has_claim",
          relation_family: "claim_context",
          subject_id: "source_report",
          object_id: "claim_same_source",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_provenance_mismatch",
        "relation",
        {
          relation_kind: "has_claim",
          relation_family: "claim_context",
          subject_id: "source_report",
          object_id: "claim_same_source",
        },
        {
          source_id: "other_source",
          source_ids: ["other_source"],
          evidence_refs: [
            {
              source_id: "report_source",
              evidence_id: "report_source#p001_c0001",
              source_path: "raw/sources/report_source/blocks.jsonl",
              page_number: 1,
              block_id: "p001_c0001",
              text_sha256: "sha256:test",
              text_source: "raw_text",
            },
          ],
        },
      ),
    ];

    withAssertionQualifiers(records);
    expect(records.find((record) => record.record_id === "rel_entity_has_claim")!.payload.assertion_status).toBe("delivered");
    for (const record of records.slice(4).filter((record) => record.record_id !== "rel_entity_has_claim")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks source presentation/report audience relations as delivered for board and committee recipients", () => {
    const records = [
      rec("source_presentation", "source", { title: "Bus Priority Presentation to Community Board 8", content_type: "presentation", description: "Presentation to Community Board 8" }, { source_id: "presentation_source" }),
      rec("source_report", "source", { title: "Financial Performance Report", content_type: "financial report", description: "Report to the Finance Committee" }, { source_id: "report_source" }),
      rec("entity_board", "entity", { entity_name: "Community Board 8", entity_type: "community board" }, { source_id: "presentation_source" }),
      rec("entity_committee", "entity", { entity_name: "Finance Committee", entity_type: "committee" }, { source_id: "report_source" }),
      rec("rel_presentation", "relation", { relation_kind: "presented_to", relation_family: "claim_context", subject_id: "source_presentation", object_id: "entity_board", description: "Presentation to Community Board 8" }, { source_id: "presentation_source", source_ids: ["presentation_source"] }),
      rec("rel_report", "relation", { relation_kind: "presented_to", relation_family: "claim_context", subject_id: "source_report", object_id: "entity_committee", description: "Financial Performance Report presented to Finance Committee" }, { source_id: "report_source", source_ids: ["report_source"] }),
    ];

    withAssertionQualifiers(records);
    expect(records[4]!.payload.assertion_status).toBe("delivered");
    expect(records[5]!.payload.assertion_status).toBe("delivered");
  });

  it("keeps source presentation audience inference scoped away from non-source subjects, non-audience entities, source mismatches, and proposal/future wording", () => {
    const records = [
      rec("source_presentation", "source", { title: "Proposed Fare and Toll Changes Presentation", content_type: "presentation", description: "Proposed 2023 fare and toll changes presentation" }, { source_id: "presentation_source" }),
      rec("source_report", "source", { title: "Financial Performance Report", content_type: "report" }, { source_id: "report_source" }),
      rec("event_report", "event", { event_kind: "recurring_report" }, { source_id: "report_source" }),
      rec("entity_committee", "entity", { entity_name: "Finance Committee", entity_type: "committee" }, { source_id: "report_source" }),
      rec("entity_staff", "entity", { entity_name: "Finance Staff", entity_type: "department" }, { source_id: "report_source" }),
      rec("entity_presenter", "entity", { entity_name: "MTA Construction & Development", entity_type: "agency" }, { source_id: "report_source" }),
      rec("rel_event_subject", "relation", { relation_kind: "presented_to", relation_family: "claim_context", subject_id: "event_report", object_id: "entity_committee", description: "Monthly report to committee." }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_non_audience", "relation", { relation_kind: "presented_to", relation_family: "claim_context", subject_id: "source_report", object_id: "entity_staff", description: "Report presented to staff." }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_source_mismatch", "relation", { relation_kind: "presented_to", relation_family: "claim_context", subject_id: "source_report", object_id: "entity_committee", description: "Report presented to Finance Committee." }, { source_id: "other_source", source_ids: ["other_source"] }),
      rec("rel_proposed", "relation", { relation_kind: "presented_to", relation_family: "claim_context", subject_id: "source_presentation", object_id: "entity_committee", description: "Proposed fare changes presentation to committee." }, { source_id: "presentation_source", source_ids: ["presentation_source"] }),
      rec("rel_future", "relation", { relation_kind: "presented_to", relation_family: "claim_context", subject_id: "source_report", object_id: "entity_committee", description: "Report will be presented to Finance Committee." }, { source_id: "report_source", source_ids: ["report_source"] }),
      rec("rel_entity_subject", "relation", { relation_kind: "presented_to", relation_family: "claim_context", subject_id: "entity_presenter", object_id: "entity_committee", description: "Agency presented to committee." }, { source_id: "report_source", source_ids: ["report_source"] }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.slice(6)) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("classifies evidenced claim presentation and recurring agenda relations", () => {
    const evidence = [{ source_id: "presentation_source" }];
    const workPlanEvidence = [{ source_id: "workplan_source" }];
    const records = [
      rec("source_presentation", "source", { title: "B46 Select Bus Service Community Board Presentation", content_type: "presentation" }, { source_id: "presentation_source" }),
      rec("source_workplan", "source", { title: "2026 Committee Work Plan", content_type: "work plan" }, { source_id: "workplan_source" }),
      rec("entity_nyct", "entity", { entity_name: "MTA NYCT Reference" }, { source_id: "presentation_source" }),
      rec("entity_cb", "entity", { entity_name: "Brooklyn Community Board 18", entity_type: "community board" }, { source_id: "presentation_source" }),
      rec("entity_staff", "entity", { entity_name: "Finance Staff", entity_type: "department" }, { source_id: "presentation_source" }),
      rec("entity_committee", "entity", { entity_name: "Metro-North Railroad Committee", entity_type: "committee" }, { source_id: "workplan_source" }),
      rec("event_finance", "event", { event_name: "Finance Report", description: "The Finance Report is provided monthly." }, { source_id: "workplan_source" }),
      rec("claim_financial", "claim", { claim_text: "The Financial Report is a recurring agenda item." }, { source_id: "workplan_source", source_ids: ["workplan_source"], evidence_refs: workPlanEvidence }),
      rec("rel_entity_presented", "relation", {
        relation_kind: "presented_to",
        relation_family: "claim_context",
        subject_id: "entity_nyct",
        object_id: "entity_cb",
        description: "New York City Transit presented the B46 SBS proposal to Brooklyn Community Board 18.",
      }, { source_id: "presentation_source", source_ids: ["presentation_source"], evidence_refs: evidence }),
      rec("rel_event_report", "relation", {
        relation_kind: "presented_to",
        relation_family: "claim_context",
        subject_id: "event_finance",
        object_id: "entity_committee",
        description: "The Finance Report is provided monthly to the Metro-North Railroad Committee.",
      }, { source_id: "workplan_source", source_ids: ["workplan_source"], evidence_refs: workPlanEvidence }),
      rec("rel_recurring", "relation", {
        relation_kind: "has_recurring_agenda_item",
        relation_family: "claim_context",
        subject_id: "entity_committee",
        object_id: "claim_financial",
        description: "The Committee has a recurring Financial Report agenda item.",
      }, { source_id: "workplan_source", source_ids: ["workplan_source"], evidence_refs: workPlanEvidence }),
      rec("rel_missing_evidence", "relation", {
        relation_kind: "presented_to",
        relation_family: "claim_context",
        subject_id: "entity_nyct",
        object_id: "entity_cb",
        description: "New York City Transit presented to Community Board 18.",
      }, { source_id: "presentation_source", source_ids: ["presentation_source"] }),
      rec("rel_non_audience", "relation", {
        relation_kind: "presented_to",
        relation_family: "claim_context",
        subject_id: "entity_nyct",
        object_id: "entity_staff",
        description: "New York City Transit presented to finance staff.",
      }, { source_id: "presentation_source", source_ids: ["presentation_source"], evidence_refs: evidence }),
      rec("rel_future", "relation", {
        relation_kind: "presented_to",
        relation_family: "claim_context",
        subject_id: "entity_nyct",
        object_id: "entity_cb",
        description: "Presentation will be presented to Community Board 18.",
      }, { source_id: "presentation_source", source_ids: ["presentation_source"], evidence_refs: evidence }),
    ];

    withAssertionQualifiers(records);
    expect(records.find((record) => record.record_id === "rel_entity_presented")!.payload.assertion_status).toBe("delivered");
    expect(records.find((record) => record.record_id === "rel_event_report")!.payload.assertion_status).toBe("planned");
    expect(records.find((record) => record.record_id === "rel_recurring")!.payload.assertion_status).toBe("planned");
    expect(records.find((record) => record.record_id === "rel_missing_evidence")!.payload.assertion_status).toBe("unknown");
    expect(records.find((record) => record.record_id === "rel_non_audience")!.payload.assertion_status).toBe("unknown");
    expect(records.find((record) => record.record_id === "rel_future")!.payload.assertion_status).toBe("unknown");
  });

  it("classifies scoped route and corridor claim relations with same-source evidence", () => {
    const claimExtra = { source_id: "report_source", source_ids: ["report_source"], evidence_refs: [{ source_id: "report_source" }] };
    const relationExtra = { source_id: "report_source", source_ids: ["report_source"], evidence_refs: [{ source_id: "report_source" }] };
    const records = [
      rec("route_bx6", "route", { route_id: "Bx6" }),
      rec("corridor_125", "corridor", { corridor_name: "125th Street" }),
      rec("claim_delivered", "claim", { claim_text: "Bus reliability has improved and trips are faster after pre-payment." }, claimExtra),
      rec("claim_corridor", "claim", { claim_text: "Many residents do not own a car and commute by transit." }, claimExtra),
      rec("claim_planned", "claim", { claim_text: "The route will travel on Rogers Avenue and will serve new stops." }, claimExtra),
      rec("claim_proposed", "claim", { claim_text: "We propose operating the route on Woodhaven Boulevard." }, claimExtra),
      rec("rel_delivered", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "route_bx6", object_id: "claim_delivered" }, relationExtra),
      rec("rel_corridor", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "corridor_125", object_id: "claim_corridor" }, relationExtra),
      rec("rel_planned", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "route_bx6", object_id: "claim_planned" }, relationExtra),
      rec("rel_proposed", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "route_bx6", object_id: "claim_proposed" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    expect(records[6]!.payload.assertion_status).toBe("delivered");
    expect(records[7]!.payload.assertion_status).toBe("delivered");
    expect(records[8]!.payload.assertion_status).toBe("planned");
    expect(records[9]!.payload.assertion_status).toBe("proposed");
  });

  it("classifies scoped claim change-type relations with same-source evidence", () => {
    const claimExtra = { source_id: "report_source", source_ids: ["report_source"], evidence_refs: [{ source_id: "report_source" }] };
    const relationExtra = { source_id: "report_source", source_ids: ["report_source"], evidence_refs: [{ source_id: "report_source" }] };
    const records = [
      rec("entity_lirr", "entity", { entity_name: "LIRR" }),
      rec("route_q52", "route", { route_id: "Q52", route_record_scope: "true_route" }),
      rec("corridor_125", "corridor", { corridor_name: "125th Street" }),
      rec("claim_favorable", "claim", { claim_text: "Operating revenue variance was favorable.", change_type: "favorable" }, claimExtra),
      rec("claim_decrease", "claim", { claim_text: "Stop time decreased after SBS.", change_type_normalized: { normalized_value: "decrease" } }, claimExtra),
      rec("claim_ongoing", "claim", { claim_text: "Open data publication is ongoing.", change_type: "ongoing" }, claimExtra),
      rec("claim_planned", "claim", { claim_text: "Integration is coming soon.", change_type: "coming_soon" }, claimExtra),
      rec("claim_proposed", "claim", { claim_text: "Route extension proposed in the plan.", change_type: "proposed" }, claimExtra),
      rec("rel_favorable", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "entity_lirr", object_id: "claim_favorable" }, relationExtra),
      rec("rel_decrease", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "route_q52", object_id: "claim_decrease" }, relationExtra),
      rec("rel_ongoing", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "entity_lirr", object_id: "claim_ongoing" }, relationExtra),
      rec("rel_planned", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "corridor_125", object_id: "claim_planned" }, relationExtra),
      rec("rel_proposed", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "route_q52", object_id: "claim_proposed" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    expect(records.find((record) => record.record_id === "rel_favorable")!.payload.assertion_status).toBe("delivered");
    expect(records.find((record) => record.record_id === "rel_decrease")!.payload.assertion_status).toBe("delivered");
    expect(records.find((record) => record.record_id === "rel_ongoing")!.payload.assertion_status).toBe("in_progress");
    expect(records.find((record) => record.record_id === "rel_planned")!.payload.assertion_status).toBe("planned");
    expect(records.find((record) => record.record_id === "rel_proposed")!.payload.assertion_status).toBe("proposed");
  });

  it("classifies same-source source-stated subject claim relations", () => {
    const claimExtra = { source_id: "report_source", source_ids: ["report_source"], evidence_refs: [{ source_id: "report_source" }] };
    const relationExtra = { source_id: "report_source", source_ids: ["report_source"], evidence_refs: [{ source_id: "report_source" }] };
    const records = [
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("event_meeting", "event", { event_name: "Board Meeting" }),
      rec("project_bus", "project", { project_name: "Bus Priority Program" }),
      rec("claim_static", "claim", { claim_text: "The report describes the MTA mission statement." }, claimExtra),
      rec("claim_future", "claim", { claim_text: "The agency will present a revised bus priority plan." }, claimExtra),
      rec("claim_proposed", "claim", { claim_text: "The proposed bus lane would reduce delays." }, claimExtra),
      rec("claim_ongoing", "claim", { claim_text: "Open data publication is ongoing.", change_type: "ongoing" }, claimExtra),
      rec("rel_static", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "entity_mta", object_id: "claim_static" }, relationExtra),
      rec("rel_future", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "event_meeting", object_id: "claim_future" }, relationExtra),
      rec("rel_proposed", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "project_bus", object_id: "claim_proposed" }, relationExtra),
      rec("rel_ongoing", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "entity_mta", object_id: "claim_ongoing" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    expect(records.find((record) => record.record_id === "rel_static")!.payload.assertion_status).toBe("delivered");
    expect(records.find((record) => record.record_id === "rel_future")!.payload.assertion_status).toBe("planned");
    expect(records.find((record) => record.record_id === "rel_proposed")!.payload.assertion_status).toBe("proposed");
    expect(records.find((record) => record.record_id === "rel_ongoing")!.payload.assertion_status).toBe("in_progress");
  });

  it("keeps source-stated claim inference away from mixed/provenance mismatch, missing evidence, and no-proposed wording", () => {
    const claimExtra = { source_id: "report_source", source_ids: ["report_source"], evidence_refs: [{ source_id: "report_source" }] };
    const relationExtra = { source_id: "report_source", source_ids: ["report_source"], evidence_refs: [{ source_id: "report_source" }] };
    const records = [
      rec("route_b44", "route", { route_id: "B44" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("claim_delivered", "claim", { claim_text: "The report shows reliability improved." }, claimExtra),
      rec("claim_mixed", "claim", { claim_text: "ABLE is active and will be implemented on additional routes." }, claimExtra),
      rec("claim_other_source", "claim", { claim_text: "Ridership increased." }, { source_id: "other_source", source_ids: ["other_source"], evidence_refs: [{ source_id: "other_source" }] }),
      rec("claim_no_proposed", "claim", { claim_text: "No proposed revisions will not be implemented." }, claimExtra),
      rec("rel_entity", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "entity_mta", object_id: "claim_delivered" }, relationExtra),
      rec("rel_mixed", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "route_b44", object_id: "claim_mixed" }, relationExtra),
      rec("rel_mismatch", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "route_b44", object_id: "claim_other_source" }, relationExtra),
      rec("rel_no_proposed", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "route_b44", object_id: "claim_no_proposed" }, relationExtra),
      rec("rel_missing_relation_evidence", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "route_b44", object_id: "claim_delivered" }, { source_id: "report_source", source_ids: ["report_source"] }),
    ];

    withAssertionQualifiers(records);
    expect(records.find((record) => record.record_id === "rel_entity")!.payload.assertion_status).toBe("delivered");
    for (const record of records.filter((candidate) => candidate.record_kind === "relation" && candidate.record_id !== "rel_entity")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("lets source-stated claim fallback handle excluded change-type values without crossing source mismatches", () => {
    const claimExtra = { source_id: "report_source", source_ids: ["report_source"], evidence_refs: [{ source_id: "report_source" }] };
    const relationExtra = { source_id: "report_source", source_ids: ["report_source"], evidence_refs: [{ source_id: "report_source" }] };
    const records = [
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("event_board", "event", { event_name: "Board Meeting" }),
      rec("claim_new", "claim", { claim_text: "New recommendation seeking authorization.", change_type: "new" }, claimExtra),
      rec("claim_maintained", "claim", { claim_text: "Maintained charter responsibility.", change_type: "maintained" }, claimExtra),
      rec("claim_adoption", "claim", { claim_text: "Recommended Board adoption of the final proposed budget.", change_type: "adoption" }, claimExtra),
      rec("claim_service_addition", "claim", { claim_text: "Service addition will now stop here.", change_type: "service_addition" }, claimExtra),
      rec("claim_ongoing_done", "claim", { claim_text: "Ongoing effort completed in 2025.", change_type: "ongoing" }, claimExtra),
      rec("claim_other_source", "claim", { claim_text: "Operating revenue variance was favorable.", change_type: "favorable" }, { source_id: "other_source", source_ids: ["other_source"], evidence_refs: [{ source_id: "other_source" }] }),
      rec("rel_new", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "entity_mta", object_id: "claim_new" }, relationExtra),
      rec("rel_maintained", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "entity_mta", object_id: "claim_maintained" }, relationExtra),
      rec("rel_adoption", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "entity_mta", object_id: "claim_adoption" }, relationExtra),
      rec("rel_service_addition", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "entity_mta", object_id: "claim_service_addition" }, relationExtra),
      rec("rel_event_subject", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "event_board", object_id: "claim_new" }, relationExtra),
      rec("rel_ongoing_done", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "entity_mta", object_id: "claim_ongoing_done" }, relationExtra),
      rec("rel_source_mismatch", "relation", { relation_kind: "has_claim", relation_family: "claim_context", subject_id: "entity_mta", object_id: "claim_other_source" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    expect(records.find((record) => record.record_id === "rel_new")!.payload.assertion_status).toBe("delivered");
    expect(records.find((record) => record.record_id === "rel_maintained")!.payload.assertion_status).toBe("delivered");
    expect(records.find((record) => record.record_id === "rel_adoption")!.payload.assertion_status).toBe("delivered");
    expect(records.find((record) => record.record_id === "rel_service_addition")!.payload.assertion_status).toBe("planned");
    expect(records.find((record) => record.record_id === "rel_event_subject")!.payload.assertion_status).toBe("delivered");
    expect(records.find((record) => record.record_id === "rel_ongoing_done")!.payload.assertion_status).toBe("unknown");
    expect(records.find((record) => record.record_id === "rel_source_mismatch")!.payload.assertion_status).toBe("unknown");
  });

  it("marks source metric containment relations as delivered when relation provenance matches the source endpoint", () => {
    const records = [
      rec("source_report", "source", { title: "Financial Report" }, { source_id: "report_source" }),
      rec("metric_positions", "metric_claim", { metric_name: "total_positions", value: 42 }, { source_id: "report_source" }),
      rec("metric_stewards", "metric_claim", { metric_name: "data_stewards", value: 58 }, { source_id: "report_source" }),
      rec(
        "rel_includes_metric",
        "relation",
        {
          relation_kind: "includes",
          relation_family: "metric_context",
          subject_id: "source_report",
          object_id: "metric_positions",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_metric_of_source",
        "relation",
        {
          relation_kind: "metric_of_source",
          relation_family: "metric_context",
          subject_id: "metric_stewards",
          object_id: "source_report",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
    ];

    withAssertionQualifiers(records);
    expect(records[3]!.payload.assertion_status).toBe("delivered");
    expect(records[4]!.payload.assertion_status).toBe("delivered");
  });

  it("keeps metric containment inference scoped away from has-metric, proposed metrics, wrong endpoints, and provenance mismatch", () => {
    const records = [
      rec("source_report", "source", { title: "Financial Report" }, { source_id: "report_source" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }, { source_id: "report_source" }),
      rec("metric_goal", "metric_claim", { metric_name: "commitment_goal", value: "$173M" }, { source_id: "report_source" }),
      rec(
        "rel_has_metric",
        "relation",
        {
          relation_kind: "has_metric",
          relation_family: "metric_context",
          subject_id: "entity_mta",
          object_id: "metric_goal",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_proposes_metric",
        "relation",
        {
          relation_kind: "proposes",
          relation_family: "metric_context",
          subject_id: "entity_mta",
          object_id: "metric_goal",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_wrong_endpoint",
        "relation",
        {
          relation_kind: "includes",
          relation_family: "metric_context",
          subject_id: "source_report",
          object_id: "entity_mta",
        },
        { source_id: "report_source", source_ids: ["report_source"] },
      ),
      rec(
        "rel_mismatched_source",
        "relation",
        {
          relation_kind: "includes",
          relation_family: "metric_context",
          subject_id: "source_report",
          object_id: "metric_goal",
        },
        { source_id: "other_source", source_ids: ["other_source"] },
      ),
    ];

    withAssertionQualifiers(records);
    for (const record of records.slice(3)) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("classifies scoped has-metric relations from metric labels and same-source evidence", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Metric appears in the same source table." }] };
    const records = [
      rec("entity_mta", "entity", { entity_name: "MTA" }, { source_id: "metric_source" }),
      rec("route_b46", "route", { route_id: "B46", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("corridor_main", "corridor", { corridor_name: "Main Street" }, { source_id: "metric_source" }),
      rec("metric_ytd", "metric_claim", { metric_name: "ytd_actual_operating_revenue", raw_value_text: "$42M", unit: "money" }, metricExtra("YTD actual operating revenue as of March.")),
      rec("metric_actual_budget", "metric_claim", { metric_name: "actual_vs_budget_revenue", raw_value_text: "$4M", unit: "money" }, metricExtra("Actual vs budget variance is favorable.")),
      rec("metric_actual_forecast", "metric_claim", { metric_name: "actual_vs_forecast_ridership", raw_value_text: "102%", unit: "percentage" }, metricExtra("Actual vs forecast ridership is reported.")),
      rec("metric_before_after", "metric_claim", { metric_name: "travel_time_change", raw_value_text: "-8 minutes", unit: "duration" }, metricExtra("Travel time improved after implementation.")),
      rec("metric_forecast", "metric_claim", { metric_name: "farebox_revenue", scenario: "Mid-Year Forecast", raw_value_text: "$10M", unit: "money" }, metricExtra("Mid-Year Forecast farebox revenue.")),
      rec("metric_budget", "metric_claim", { metric_name: "operating_expense", scenario: "Adopted Budget", raw_value_text: "$10M", unit: "money" }, metricExtra("Adopted Budget operating expense.")),
      rec("metric_goal", "metric_claim", { metric_name: "commitment_goal", raw_value_text: "$173M", unit: "money" }, metricExtra("Commitment goal for the year.")),
      rec("metric_projected", "metric_claim", { metric_name: "projected_time_savings", raw_value_text: "6 minutes", unit: "duration" }, metricExtra("Projected time savings.")),
      rec("metric_proposed_budget", "metric_claim", { metric_name: "depreciation", label: "Final Proposed Budget", raw_value_text: "$12M", unit: "money" }, metricExtra("Final Proposed Budget depreciation.")),
      rec("metric_initial_proposal", "metric_claim", { metric_name: "initial_proposal_amount", raw_value_text: "$12M", unit: "money" }, metricExtra("Initial proposal amount.")),
      rec("rel_ytd", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_ytd" }, relationExtra),
      rec("rel_actual_budget", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_actual_budget" }, relationExtra),
      rec("rel_actual_forecast", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_actual_forecast" }, relationExtra),
      rec("rel_before_after", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_b46", object_id: "metric_before_after" }, relationExtra),
      rec("rel_forecast", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_forecast" }, relationExtra),
      rec("rel_budget", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_budget" }, relationExtra),
      rec("rel_goal", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_goal" }, relationExtra),
      rec("rel_projected", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "corridor_main", object_id: "metric_projected" }, relationExtra),
      rec("rel_proposed_budget", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_proposed_budget" }, relationExtra),
      rec("rel_initial_proposal", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_initial_proposal" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const id of ["rel_ytd", "rel_actual_budget", "rel_actual_forecast", "rel_before_after"]) expect(records.find((record) => record.record_id === id)!.payload.assertion_status).toBe("delivered");
    for (const id of ["rel_forecast", "rel_budget", "rel_goal", "rel_projected"]) expect(records.find((record) => record.record_id === id)!.payload.assertion_status).toBe("planned");
    for (const id of ["rel_proposed_budget", "rel_initial_proposal"]) expect(records.find((record) => record.record_id === id)!.payload.assertion_status).toBe("proposed");
  });

  it("marks concrete reported-period metrics as delivered from payload or source-title period anchors", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Metric appears in the same source table." }] };
    const records = [
      rec("source_report", "source", { title: "June 2025 Financial Report", content_type: "financial report" }, { source_id: "metric_source" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }, { source_id: "metric_source" }),
      rec("route_m79", "route", { route_id: "M79", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("metric_report_money", "metric_claim", { metric_name: "operating_revenue", raw_value_text: "$42M", unit_normalized: { unit_family: "money", normalized_unit: "dollars" } }, metricExtra("Operating revenue was $42M.")),
      rec("metric_payload_period_money", "metric_claim", { metric_name: "contract_amount", raw_value_text: "$12M", period: "July 2024", unit_normalized: { unit_family: "money", normalized_unit: "dollars" } }, metricExtra("Contract amount $12M.")),
      rec("metric_source_period_speed", "metric_claim", { metric_name: "average_speed", value: 8.4, unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("Average speed 8.4 mph.")),
      rec("rel_report_money", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_report_money" }, relationExtra),
      rec("rel_payload_period_money", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_payload_period_money" }, relationExtra),
      rec("rel_source_period_speed", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_m79", object_id: "metric_source_period_speed" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const id of ["rel_report_money", "rel_payload_period_money", "rel_source_period_speed"]) {
      expect(records.find((record) => record.record_id === id)!.payload.assertion_status).toBe("delivered");
    }
  });

  it("keeps reported-period metric inference away from generic dated sources, budgets, feasibility text, and missing evidence", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Metric appears in the same source table." }] };
    const records = [
      rec("source_generic", "source", { title: "Undated Operating Memo", published_date_normalized: "2025-06-01" }, { source_id: "metric_source" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }, { source_id: "metric_source" }),
      rec("metric_no_anchor", "metric_claim", { metric_name: "operating_revenue", raw_value_text: "$42M", unit_normalized: { unit_family: "money", normalized_unit: "dollars" } }, metricExtra("Operating revenue $42M.")),
      rec("metric_budget", "metric_claim", { metric_name: "operating_revenue", raw_value_text: "$42M", unit_normalized: { unit_family: "money", normalized_unit: "dollars" } }, metricExtra("June 2025 adopted budget operating revenue $42M.")),
      rec("metric_feasibility", "metric_claim", { metric_name: "line_feasibility", raw_value_text: "42%", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("2025 feasibility study line feasibility score 42%.")),
      rec("metric_missing_evidence", "metric_claim", { metric_name: "average_speed", value: 8.4, unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, { source_id: "metric_source", source_ids: ["metric_source"] }),
      rec("rel_no_anchor", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_no_anchor" }, relationExtra),
      rec("rel_budget", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_budget" }, relationExtra),
      rec("rel_feasibility", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_feasibility" }, relationExtra),
      rec("rel_missing_evidence", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_missing_evidence" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const id of ["rel_no_anchor", "rel_feasibility", "rel_missing_evidence"]) {
      expect(records.find((record) => record.record_id === id)!.payload.assertion_status).toBe("unknown");
    }
    expect(records.find((record) => record.record_id === "rel_budget")!.payload.assertion_status).toBe("planned");
  });

  it("marks observed bus-route and corridor operating metrics as delivered without explicit date fields", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Observed metric appears in the same source table." }] };
    const records = [
      rec("source_progress", "source", { title: "Webster Avenue Select Bus Service Progress Report", content_type: "progress report", description: "Progress deck covering bus performance results and proposed capital improvements." }, { source_id: "metric_source" }),
      rec("route_bx12", "route", { route_id: "Bx12", route_record_scope: "true_route", mode: "bus" }, { source_id: "metric_source" }),
      rec("route_bx6", "route", { route_id: "Bx6", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("corridor_webster", "corridor", { corridor_name: "Webster Avenue" }, { source_id: "metric_source" }),
      rec("metric_speed", "metric_claim", { metric_name: "average_speed", value: 7.8, unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("Average speed on Bx12 SBS was 7.8 mph.")),
      rec("metric_satisfaction", "metric_claim", { metric_name: "customer_satisfaction", value: 98, unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("Bx12 SBS achieved 98% customer satisfaction.")),
      rec("metric_late_bus", "metric_claim", { metric_name: "late_bus_percentage", value: 14.1, unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("Peak period late buses eastbound in 2017 after SBS launch.")),
      rec("metric_car_free", "metric_claim", { metric_name: "car_free_households", value: 71, unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("71% of households near the Webster Avenue corridor do not own a car.")),
      rec("rel_speed", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_bx12", object_id: "metric_speed" }, relationExtra),
      rec("rel_satisfaction", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_bx12", object_id: "metric_satisfaction" }, relationExtra),
      rec("rel_late_bus", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_bx6", object_id: "metric_late_bus" }, relationExtra),
      rec("rel_car_free", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "corridor_webster", object_id: "metric_car_free" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("keeps bus and corridor operating metric inference away from proposals, non-bus routes, money rows, missing values, and split routes", () => {
    const metricExtra = (sourceId: string, quote: string) => ({ source_id: sourceId, source_ids: [sourceId], evidence_refs: [{ source_id: sourceId, source_quote: quote }] });
    const relationExtra = (sourceId: string) => ({ source_id: sourceId, source_ids: [sourceId], evidence_refs: [{ source_id: sourceId, source_quote: "Metric appears in the same source table." }] });
    const records = [
      rec("source_progress", "source", { title: "Bus Priority Project Update" }, { source_id: "metric_source" }),
      rec("source_plan", "source", { title: "Woodhaven Select Bus Service Proposed Service Plan" }, { source_id: "proposal_source" }),
      rec("route_q52", "route", { route_id: "Q52", route_record_scope: "true_route", mode: "bus" }, { source_id: "proposal_source" }),
      rec("route_split", "route", { route_id: "Q52/Q53", route_record_scope: "split_candidate", mode: "bus" }, { source_id: "metric_source" }),
      rec("route_subway", "route", { route_id: "B", route_record_scope: "true_route", route_type: "subway" }, { source_id: "metric_source" }),
      rec("route_bx12", "route", { route_id: "Bx12", route_record_scope: "true_route", mode: "bus" }, { source_id: "metric_source" }),
      rec("metric_future", "metric_claim", { metric_name: "travel_time_savings", raw_value_text: "25-35% faster", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("proposal_source", "Bus lanes will make Q52/Q53 service 25-35% faster.")),
      rec("metric_split", "metric_claim", { metric_name: "average_speed", value: 7.2, unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("metric_source", "Average speed on the combined Q52/Q53 corridor was 7.2 mph.")),
      rec("metric_subway", "metric_claim", { metric_name: "average_speed", value: 19, unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("metric_source", "Average speed on the subway line was 19 mph.")),
      rec("metric_money", "metric_claim", { metric_name: "implementation_cost", value: 12, unit_normalized: { unit_family: "money", normalized_unit: "dollars" } }, metricExtra("metric_source", "Implementation cost was $12 million.")),
      rec("metric_missing_value", "metric_claim", { metric_name: "average_speed", unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("metric_source", "Average speed row without a value.")),
      rec("rel_future", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_q52", object_id: "metric_future" }, relationExtra("proposal_source")),
      rec("rel_split", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_split", object_id: "metric_split" }, relationExtra("metric_source")),
      rec("rel_subway", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_subway", object_id: "metric_subway" }, relationExtra("metric_source")),
      rec("rel_money", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_bx12", object_id: "metric_money" }, relationExtra("metric_source")),
      rec("rel_missing_value", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_bx12", object_id: "metric_missing_value" }, relationExtra("metric_source")),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("marks observed ridership has-metric relations as delivered", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Ridership metric appears in the same source table." }] };
    const records = [
      rec("entity_lirr", "entity", { entity_name: "LIRR" }, { source_id: "metric_source" }),
      rec("route_b44", "route", { route_id: "B44", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("corridor_125", "corridor", { corridor_name: "125th Street" }, { source_id: "metric_source" }),
      rec("metric_annual", "metric_claim", { metric_name: "annual_ridership", value: 12345, year: "2025", unit_normalized: { unit_family: "ridership" } }, metricExtra("Annual ridership for 2025.")),
      rec("metric_daily", "metric_claim", { metric_name: "daily_riders", raw_value_text: "32,000 riders", unit_normalized: { unit_family: "ridership" } }, metricExtra("Daily bus riders.")),
      rec("metric_weekday", "metric_claim", { metric_name: "weekday_boardings", raw_value_text: "6,912 boardings", unit_normalized: { unit_family: "ridership" } }, metricExtra("Weekday boardings.")),
      rec("rel_annual", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_annual" }, relationExtra),
      rec("rel_daily", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_b44", object_id: "metric_daily" }, relationExtra),
      rec("rel_weekday", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "corridor_125", object_id: "metric_weekday" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("marks observed ridership-change has-metric relations as delivered", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Ridership-change metric appears in the same source table." }] };
    const records = [
      rec("entity_lirr", "entity", { entity_name: "LIRR" }, { source_id: "metric_source" }),
      rec("route_m15", "route", { route_id: "M15", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("metric_entity_change", "metric_claim", { metric_name: "ridership_change", value: 9.4, period: "May 2025", comparison: "May 2024", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("May 2025 ridership was 9.4% higher than May 2024.")),
      rec("metric_route_change", "metric_claim", { metric_name: "ridership_change", raw_value_text: "30% increase from Limited to SBS", comparison: "Limited to SBS", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("30% increase from Limited to SBS.")),
      rec("metric_count_change", "metric_claim", { metric_name: "ridership_change", raw_value_text: "50 thousand trips (9.6%)", period: "second quarter 2023", comparison_period: "second quarter of 2022", unit_normalized: { unit_family: "count", normalized_unit: "trips" } }, metricExtra("Ridership increased by 50 thousand trips in the second quarter.")),
      rec("rel_entity_change", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_entity_change" }, relationExtra),
      rec("rel_route_change", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_m15", object_id: "metric_route_change" }, relationExtra),
      rec("rel_count_change", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_count_change" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("marks observed elevator and escalator availability metrics as delivered", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Availability metric appears in the same source table." }] };
    const records = [
      rec("entity_mnr", "entity", { entity_name: "Metro-North Railroad" }, { source_id: "metric_source" }),
      rec("route_hudson", "route", { route_id: "Hudson Line", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("metric_elevator", "metric_claim", { metric_name: "elevator_availability", value: 98.8, period: "2024", unit_normalized: { unit_family: "percentage" } }, metricExtra("BEACON 056I 98.8%")),
      rec("metric_escalator", "metric_claim", { metric_name: "escalator_availability", raw_value_text: "99.7%", period: "2024", unit_normalized: { unit_family: "percentage" } }, metricExtra("WHITE PLAINS 99.7%")),
      rec("rel_elevator", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_elevator" }, relationExtra),
      rec("rel_escalator", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_hudson", object_id: "metric_escalator" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("marks observed workforce has-metric relations as delivered", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Workforce metric appears in the same source table." }] };
    const records = [
      rec("entity_mnr", "entity", { entity_name: "Metro-North Railroad" }, { source_id: "metric_source" }),
      rec("metric_employees", "metric_claim", { metric_name: "female_workforce", value: 123, period: "Q3 2025", unit_normalized: { unit_family: "workforce", normalized_unit: "employees" } }, metricExtra("Female workforce 123 employees, lower than Forecast.")),
      rec("metric_positions", "metric_claim", { metric_name: "staffing_non_reimbursable", raw_value_text: "2,400 positions", year: "2025", unit_normalized: { unit_family: "workforce", normalized_unit: "positions" } }, metricExtra("Non-reimbursable staffing 2,400 positions.")),
      rec("metric_fte", "metric_claim", { metric_name: "full_time_equivalents", value: 14.5, time_period: "FY2025", unit_normalized: { unit_family: "workforce", normalized_unit: "full_time_equivalents" } }, metricExtra("14.5 full-time equivalents.")),
      rec("metric_headcount", "metric_claim", { metric_name: "sir_headcount_dec2024", value: 322, unit_normalized: { unit_family: "workforce", normalized_unit: "headcount" } }, { ...metricExtra("SIR headcount Dec2024."), display_name: "SIR headcount Dec2024" }),
      rec("rel_employees", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_employees" }, relationExtra),
      rec("rel_positions", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_positions" }, relationExtra),
      rec("rel_fte", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_fte" }, relationExtra),
      rec("rel_headcount", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_headcount" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("marks observed complaint and lawsuit has-metric relations as delivered", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Complaint metric appears in the same source table." }] };
    const records = [
      rec("entity_mnr", "entity", { entity_name: "Metro-North Railroad" }, { source_id: "metric_source" }),
      rec("metric_eeo", "metric_claim", { metric_name: "eeo_complaints_filed", value: 28, period: "January 1, 2023 - June 30, 2023", unit_normalized: { unit_family: "count", normalized_unit: "complaints" } }, metricExtra("EEO complaints filed January 1, 2023 - June 30, 2023.")),
      rec("metric_title_vi", "metric_claim", { metric_name: "title_vi_lawsuits_filed", value: 0, year: "2025" }, metricExtra("Title VI lawsuits filed in 2025.")),
      rec("metric_basis", "metric_claim", { metric_name: "title_vii_external_complaints_by_basis", raw_value_text: "2", period: "Q2 2023" }, metricExtra("Title VII external complaints by basis, Q2 2023.")),
      rec("rel_eeo", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_eeo" }, relationExtra),
      rec("rel_title_vi", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_title_vi" }, relationExtra),
      rec("rel_basis", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_basis" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("marks observed mean-distance-between-failures has-metric relations as delivered", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "MDBF metric appears in the same source table." }] };
    const records = [
      rec("entity_mnr", "entity", { entity_name: "Metro-North Railroad" }, { source_id: "metric_source" }),
      rec("entity_sir", "entity", { entity_name: "Staten Island Railway" }, { source_id: "metric_source" }),
      rec("metric_mdbf", "metric_claim", { metric_name: "mean_distance_between_failures", value: 277753, period: "August 2023", unit_normalized: { unit_family: "distance", normalized_unit: "miles" } }, metricExtra("MDBF for August 2023 was 277,753 miles, above the goal.")),
      rec("metric_singular_mdbf", "metric_claim", { metric_name: "mean_distance_between_failure", raw_value_text: "373,000 miles", period: "YTD February 2024", unit_normalized: { unit_family: "distance", normalized_unit: "miles" } }, metricExtra("YTD February 2024 mean-distance-between-failure was 373,000 miles.")),
      rec("rel_mdbf", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_mdbf" }, relationExtra),
      rec("rel_singular_mdbf", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_sir", object_id: "metric_singular_mdbf" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    expect(records[4]!.payload.assertion_status).toBe("delivered");
    expect(records[5]!.payload.assertion_status).toBe("delivered");
  });

  it("marks observed on-time performance has-metric relations as delivered", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "OTP metric appears in the same source table." }] };
    const records = [
      rec("entity_lirr", "entity", { entity_name: "LIRR" }, { source_id: "metric_source" }),
      rec("route_harlem", "route", { route_id: "Harlem Line", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("metric_otp", "metric_claim", { metric_name: "on_time_performance", value: 95.95, period: "October 2024", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("On-time performance was 95.95%, above the goal of 94%.")),
      rec("metric_line", "metric_claim", { metric_name: "on_time_performance_by_line", raw_value_text: "94.1%", period: "January 2026", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("Harlem Line OTP January 2026 was 94.1%.")),
      rec("metric_weekday", "metric_claim", { metric_name: "weekday_on_time_performance", value: 96.9, year: "2025", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("SIR weekday on-time performance 2025.")),
      rec("rel_otp", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_otp" }, relationExtra),
      rec("rel_line", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_harlem", object_id: "metric_line" }, relationExtra),
      rec("rel_weekday", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_weekday" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("marks observed service-delivery has-metric relations as delivered", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Service-delivery metric appears in the same source table." }] };
    const records = [
      rec("entity_mnr", "entity", { entity_name: "Metro-North Railroad" }, { source_id: "metric_source" }),
      rec("metric_delivered", "metric_claim", { metric_name: "service_delivered", value: 99.6, period: "January 2026", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("Metro-North January 2026 service delivered was 99.6%.")),
      rec("metric_delivered_rate", "metric_claim", { metric_name: "service_delivered_rate", raw_value_text: "99.9%", period: "October 2024", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("Metro-North service-delivered rate for October was 99.9 percent.")),
      rec("metric_delivery_rate", "metric_claim", { metric_name: "service_delivery_rate", value: 99.9, period: "March 2024", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("Metro-North's service delivery rate remains at 99.9% in March.")),
      rec("rel_delivered", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_delivered" }, relationExtra),
      rec("rel_delivered_rate", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_delivered_rate" }, relationExtra),
      rec("rel_delivery_rate", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_delivery_rate" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("marks observed true-route travel-time has-metric relations as delivered", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Travel-time metric appears in the same source table." }] };
    const records = [
      rec("route_s79", "route", { route_id: "S79", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("route_q53", "route", { route_id: "Q53", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("metric_travel_time", "metric_claim", { metric_name: "travel_time", value: 39.2, comparison_period: "after", unit_normalized: { unit_family: "duration", normalized_unit: "minutes" } }, metricExtra("S79 SBS to Brooklyn AM peak after: 39.2 minutes.")),
      rec("metric_bus_travel_time", "metric_claim", { metric_name: "bus_travel_time", raw_value_text: "6.4", time_period: "February-May 2018", unit_normalized: { unit_family: "duration", normalized_unit: "minutes" } }, metricExtra("Q53 northbound segment bus travel time: 6.4 minutes.")),
      rec("rel_travel_time", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_s79", object_id: "metric_travel_time" }, relationExtra),
      rec("rel_bus_travel_time", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_q53", object_id: "metric_bus_travel_time" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("marks observed true-route bus-speed has-metric relations as delivered", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Bus-speed metric appears in the same source table." }] };
    const records = [
      rec("route_bx12", "route", { route_id: "Bx12", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("route_q53", "route", { route_id: "Q53", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("route_m79", "route", { route_id: "M79", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("route_b44", "route", { route_id: "B44", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("metric_bus_speed", "metric_claim", { metric_name: "bus_speed", value: 6.3, date: "April 2023", unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("Fordham Rd average bus speed after ABLE, April 2023: 6.3 mph.")),
      rec("metric_travel_speed", "metric_claim", { metric_name: "travel_speed", raw_value_text: "14.1", year: "2014", time_period: "AM Rush", unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("Q53 northbound speed AM Rush 2014: 14.1 mph.")),
      rec("metric_peak_speed", "metric_claim", { metric_name: "peak_period_bus_speed", value: 7.6, period: "2019 peak hour", unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("Bx12 SBS peak period bus speed in 2019 was 7.6 mph.")),
      rec("metric_average_bus_speed", "metric_claim", { metric_name: "average_bus_speed", value: 8.4, comparison_period: "October 2024", unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("Average bus speed October 2024: 8.4 mph.")),
      rec("rel_bus_speed", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_bx12", object_id: "metric_bus_speed" }, relationExtra),
      rec("rel_travel_speed", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_q53", object_id: "metric_travel_speed" }, relationExtra),
      rec("rel_peak_speed", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_m79", object_id: "metric_peak_speed" }, relationExtra),
      rec("rel_average_bus_speed", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_b44", object_id: "metric_average_bus_speed" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("delivered");
  });

  it("keeps scoped has-metric inference away from weak labels, endpoint mismatches, and missing evidence", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Metric appears in the same source table." }] };
    const records = [
      rec("entity_mta", "entity", { entity_name: "MTA" }, { source_id: "metric_source" }),
      rec("claim_fee", "claim", { claim_name: "license fee" }, { source_id: "metric_source" }),
      rec("event_report", "event", { event_name: "financial report" }, { source_id: "metric_source" }),
      rec("metric_comparison_period", "metric_claim", { metric_name: "operating_revenue", comparison_period: "Adopted Budget", raw_value_text: "$42M" }, metricExtra("Operating revenue.")),
      rec("metric_above_goal", "metric_claim", { metric_name: "actual_above_goal", raw_value_text: "105%" }, metricExtra("Actual performance above goal.")),
      rec("metric_savings_proposal", "metric_claim", { metric_name: "savings_from_initial_proposal", raw_value_text: "$4M" }, metricExtra("Savings from initial proposal.")),
      rec("metric_description_only", "metric_claim", { metric_name: "operating_revenue", raw_value_text: "$42M" }, metricExtra("Operating revenue.")),
      rec("metric_missing_evidence", "metric_claim", { metric_name: "ytd_actual_operating_revenue", raw_value_text: "$42M" }, { source_id: "metric_source", source_ids: ["metric_source"] }),
      rec("rel_comparison_period", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_comparison_period" }, relationExtra),
      rec("rel_above_goal", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_above_goal" }, relationExtra),
      rec("rel_savings_proposal", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_savings_proposal" }, relationExtra),
      rec("rel_claim_subject", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "claim_fee", object_id: "metric_description_only" }, relationExtra),
      rec("rel_event_subject", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "event_report", object_id: "metric_description_only" }, relationExtra),
      rec("rel_missing_relation_evidence", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_description_only", description: "Actual reported metric." }, { source_id: "metric_source", source_ids: ["metric_source"] }),
      rec("rel_description_only", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_description_only", description: "Actual reported metric." }, relationExtra),
      rec("rel_metric_missing_evidence", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mta", object_id: "metric_missing_evidence" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("keeps bus-speed metric inference away from future text, aggregate routes, weak units, missing values, missing anchors, and missing evidence", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Bus-speed metric appears in the same source table." }] };
    const records = [
      rec("route_true", "route", { route_id: "Bx12", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("route_split", "route", { route_id: "Q52/Q53", route_record_scope: "split_candidate" }, { source_id: "metric_source" }),
      rec("metric_future", "metric_claim", { metric_name: "bus_speed", value: 7.2, year: "2026", raw_text: "Bus speed will be 7.2 mph.", unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("Bus speed will be 7.2 mph.")),
      rec("metric_split", "metric_claim", { metric_name: "bus_speed", value: 7.2, year: "2024", unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("Bus speed 7.2 mph.")),
      rec("metric_wrong_unit", "metric_claim", { metric_name: "bus_speed", value: 7.2, year: "2024", unit_normalized: { unit_family: "duration", normalized_unit: "minutes" } }, metricExtra("Bus speed value in minutes.")),
      rec("metric_missing_value", "metric_claim", { metric_name: "travel_speed", year: "2024", unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("Travel speed row without a value.")),
      rec("metric_missing_anchor", "metric_claim", { metric_name: "peak_period_bus_speed", value: 7.2, unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("Peak bus speed 7.2 mph.")),
      rec("metric_average_speed", "metric_claim", { metric_name: "average_speed", value: 7.2, year: "2024", unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, metricExtra("Average speed 7.2 mph.")),
      rec("metric_missing_evidence", "metric_claim", { metric_name: "bus_speed", value: 7.2, year: "2024", unit_normalized: { unit_family: "speed", normalized_unit: "mph" } }, { source_id: "metric_source", source_ids: ["metric_source"] }),
      rec("rel_future", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_true", object_id: "metric_future" }, relationExtra),
      rec("rel_split", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_split", object_id: "metric_split" }, relationExtra),
      rec("rel_wrong_unit", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_true", object_id: "metric_wrong_unit" }, relationExtra),
      rec("rel_missing_value", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_true", object_id: "metric_missing_value" }, relationExtra),
      rec("rel_missing_anchor", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_true", object_id: "metric_missing_anchor" }, relationExtra),
      rec("rel_average_speed", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_true", object_id: "metric_average_speed" }, relationExtra),
      rec("rel_missing_evidence", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_true", object_id: "metric_missing_evidence" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("keeps travel-time metric inference away from future text, aggregate routes, weak units, missing values, missing anchors, and missing evidence", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Travel-time metric appears in the same source table." }] };
    const records = [
      rec("route_true", "route", { route_id: "M15", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("route_split", "route", { route_id: "Q52/Q53", route_record_scope: "split_candidate" }, { source_id: "metric_source" }),
      rec("metric_future", "metric_claim", { metric_name: "travel_time", value: 20, period: "2026", raw_text: "Travel time will be 20 minutes.", unit_normalized: { unit_family: "duration", normalized_unit: "minutes" } }, metricExtra("Travel time will be 20 minutes.")),
      rec("metric_aggregate", "metric_claim", { metric_name: "bus_travel_time", value: 18, period: "2018", unit_normalized: { unit_family: "duration", normalized_unit: "minutes" } }, metricExtra("Travel time 18 minutes.")),
      rec("metric_wrong_unit", "metric_claim", { metric_name: "travel_time", value: 18, period: "2018", unit_normalized: { unit_family: "distance", normalized_unit: "miles" } }, metricExtra("Travel time value in miles.")),
      rec("metric_missing_value", "metric_claim", { metric_name: "travel_time", period: "2018", unit_normalized: { unit_family: "duration", normalized_unit: "minutes" } }, metricExtra("Travel time row without a value.")),
      rec("metric_missing_anchor", "metric_claim", { metric_name: "bus_travel_time", value: 18, unit_normalized: { unit_family: "duration", normalized_unit: "minutes" } }, metricExtra("Travel time 18 minutes.")),
      rec("metric_missing_evidence", "metric_claim", { metric_name: "travel_time", value: 18, period: "2018", unit_normalized: { unit_family: "duration", normalized_unit: "minutes" } }, { source_id: "metric_source", source_ids: ["metric_source"] }),
      rec("rel_future", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_true", object_id: "metric_future" }, relationExtra),
      rec("rel_aggregate", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_split", object_id: "metric_aggregate" }, relationExtra),
      rec("rel_wrong_unit", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_true", object_id: "metric_wrong_unit" }, relationExtra),
      rec("rel_missing_value", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_true", object_id: "metric_missing_value" }, relationExtra),
      rec("rel_missing_anchor", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_true", object_id: "metric_missing_anchor" }, relationExtra),
      rec("rel_missing_evidence", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_true", object_id: "metric_missing_evidence" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("keeps MDBF metric inference away from non-entity subjects, weak units, missing values, missing anchors, future text, and missing evidence", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "MDBF metric appears in the same source table." }] };
    const records = [
      rec("entity_mnr", "entity", { entity_name: "Metro-North Railroad" }, { source_id: "metric_source" }),
      rec("route_hudson", "route", { route_id: "Hudson Line", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("metric_route_subject", "metric_claim", { metric_name: "mean_distance_between_failures", value: 277753, period: "August 2023", unit_normalized: { unit_family: "distance", normalized_unit: "miles" } }, metricExtra("MDBF for August 2023 was 277,753 miles.")),
      rec("metric_wrong_unit", "metric_claim", { metric_name: "mean_distance_between_failures", value: 277753, period: "August 2023", unit_normalized: { unit_family: "count", normalized_unit: "failures" } }, metricExtra("MDBF failures count.")),
      rec("metric_missing_value", "metric_claim", { metric_name: "mean_distance_between_failure", period: "August 2023", unit_normalized: { unit_family: "distance", normalized_unit: "miles" } }, metricExtra("MDBF row without value.")),
      rec("metric_missing_anchor", "metric_claim", { metric_name: "mean_distance_between_failure", value: 277753, unit_normalized: { unit_family: "distance", normalized_unit: "miles" } }, metricExtra("MDBF was 277,753 miles.")),
      rec("metric_future", "metric_claim", { metric_name: "mean_distance_between_failures", value: 277753, period: "2026", raw_text: "MDBF will be 277,753 miles.", unit_normalized: { unit_family: "distance", normalized_unit: "miles" } }, metricExtra("MDBF will be 277,753 miles.")),
      rec("metric_missing_evidence", "metric_claim", { metric_name: "mean_distance_between_failures", value: 277753, period: "August 2023", unit_normalized: { unit_family: "distance", normalized_unit: "miles" } }, { source_id: "metric_source", source_ids: ["metric_source"] }),
      rec("rel_route_subject", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_hudson", object_id: "metric_route_subject" }, relationExtra),
      rec("rel_wrong_unit", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_wrong_unit" }, relationExtra),
      rec("rel_missing_value", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_missing_value" }, relationExtra),
      rec("rel_missing_anchor", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_missing_anchor" }, relationExtra),
      rec("rel_future", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_future" }, relationExtra),
      rec("rel_missing_evidence", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_missing_evidence" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("keeps service-delivery metric inference away from changes, weak units, missing anchors, and future text", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Service-delivery metric appears in the same source table." }] };
    const records = [
      rec("entity_mnr", "entity", { entity_name: "Metro-North Railroad" }, { source_id: "metric_source" }),
      rec("metric_change", "metric_claim", { metric_name: "service_delivery_change", value: 1.2, period: "2025", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("Service delivery change.")),
      rec("metric_wrong_unit", "metric_claim", { metric_name: "service_delivered_rate", value: 99, period: "2025", unit_normalized: { unit_family: "count", normalized_unit: "trains" } }, metricExtra("Service delivered count.")),
      rec("metric_unanchored", "metric_claim", { metric_name: "service_delivered", value: 99.9, unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("Service delivered 99.9%.")),
      rec("metric_future", "metric_claim", { metric_name: "service_delivery_rate", value: 99.9, period: "2026", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("Expected future service delivery will be 99.9%.")),
      rec("rel_change", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_change" }, relationExtra),
      rec("rel_wrong_unit", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_wrong_unit" }, relationExtra),
      rec("rel_unanchored", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_unanchored" }, relationExtra),
      rec("rel_future", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_future" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("keeps on-time performance metric inference away from projects, changes, weak units, missing anchors, and future text", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "OTP metric appears in the same source table." }] };
    const records = [
      rec("entity_lirr", "entity", { entity_name: "LIRR" }, { source_id: "metric_source" }),
      rec("metric_project", "metric_claim", { metric_name: "project_on_time_performance", value: 99, period: "2025", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("Project OTP was 99%.")),
      rec("metric_change", "metric_claim", { metric_name: "on_time_performance_change", value: 7, period: "2025", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("OTP improved by 7 points.")),
      rec("metric_wrong_unit", "metric_claim", { metric_name: "on_time_performance", value: 95, period: "2025", unit_normalized: { unit_family: "count", normalized_unit: "trains" } }, metricExtra("On-time performance count.")),
      rec("metric_unanchored", "metric_claim", { metric_name: "on_time_performance", value: 96, unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("LIRR on-time performance 96%.")),
      rec("metric_future", "metric_claim", { metric_name: "on_time_performance", value: 96, period: "2026", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("Expected future on-time performance will be 96%.")),
      rec("rel_project", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_project" }, relationExtra),
      rec("rel_change", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_change" }, relationExtra),
      rec("rel_wrong_unit", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_wrong_unit" }, relationExtra),
      rec("rel_unanchored", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_unanchored" }, relationExtra),
      rec("rel_future", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_future" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("keeps complaint and lawsuit metric inference away from plans, missing anchors, non-entity subjects, and weak units", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Complaint metric appears in the same source table." }] };
    const records = [
      rec("entity_mnr", "entity", { entity_name: "Metro-North Railroad" }, { source_id: "metric_source" }),
      rec("route_m15", "route", { route_id: "M15", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("metric_planned", "metric_claim", { metric_name: "eeo_complaints_filed", label: "Planned complaint intake", value: 28, year: "2025", unit_normalized: { unit_family: "count", normalized_unit: "complaints" } }, metricExtra("Planned complaint intake.")),
      rec("metric_unanchored", "metric_claim", { metric_name: "title_vi_complaints_by_basis", value: 2, unit_normalized: { unit_family: "count", normalized_unit: "complaints" } }, metricExtra("Title VI complaints by basis.")),
      rec("metric_route_subject", "metric_claim", { metric_name: "eeo_complaints_filed", value: 3, year: "2025", unit_normalized: { unit_family: "count", normalized_unit: "complaints" } }, metricExtra("EEO complaints filed in 2025.")),
      rec("metric_weak_unit", "metric_claim", { metric_name: "complaint_response_rate", value: 95, year: "2025", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("Complaint response rate in 2025.")),
      rec("metric_missing_evidence", "metric_claim", { metric_name: "title_vi_lawsuits_filed", value: 0, year: "2025" }, { source_id: "metric_source", source_ids: ["metric_source"] }),
      rec("rel_planned", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_planned" }, relationExtra),
      rec("rel_unanchored", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_unanchored" }, relationExtra),
      rec("rel_route_subject", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_m15", object_id: "metric_route_subject" }, relationExtra),
      rec("rel_weak_unit", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_weak_unit" }, relationExtra),
      rec("rel_missing_evidence", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_missing_evidence" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("keeps ridership-change metric inference away from future text, weak units, missing anchors, and missing evidence", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Ridership-change metric appears in the same source table." }] };
    const records = [
      rec("entity_lirr", "entity", { entity_name: "LIRR" }, { source_id: "metric_source" }),
      rec("metric_future", "metric_claim", { metric_name: "ridership_change", value: 10, period: "2026", raw_value_text: "Ridership will increase 10%.", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("Ridership will increase 10%.")),
      rec("metric_wrong_unit", "metric_claim", { metric_name: "ridership_change", value: 10, period: "2025", unit_normalized: { unit_family: "money", normalized_unit: "dollars" } }, metricExtra("Ridership increased 10 dollars.")),
      rec("metric_missing_anchor", "metric_claim", { metric_name: "ridership_change", value: 10, raw_value_text: "+10%", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, metricExtra("+10%.")),
      rec("metric_missing_evidence", "metric_claim", { metric_name: "ridership_change", value: 10, period: "2025", unit_normalized: { unit_family: "percentage", normalized_unit: "percent" } }, { source_id: "metric_source", source_ids: ["metric_source"] }),
      rec("rel_future", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_future" }, relationExtra),
      rec("rel_wrong_unit", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_wrong_unit" }, relationExtra),
      rec("rel_missing_anchor", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_missing_anchor" }, relationExtra),
      rec("rel_missing_evidence", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_missing_evidence" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("keeps workforce metric inference away from estimates, variance, weak anchors, non-entity subjects, and missing evidence", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Workforce metric appears in the same source table." }] };
    const records = [
      rec("entity_mnr", "entity", { entity_name: "Metro-North Railroad" }, { source_id: "metric_source" }),
      rec("route_sir", "route", { route_id: "SIR", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("metric_final_estimate", "metric_claim", { metric_name: "total_positions", label: "Final Estimate", value: 100, year: "2025", unit_normalized: { unit_family: "workforce", normalized_unit: "positions" } }, metricExtra("Final estimate total positions.")),
      rec("metric_variance", "metric_claim", { metric_name: "positions_variance", value: -4, year: "2025", unit_normalized: { unit_family: "workforce", normalized_unit: "positions" } }, metricExtra("Positions variance vs final estimate.")),
      rec("metric_unanchored", "metric_claim", { metric_name: "employees_mobilized", value: 12, unit_normalized: { unit_family: "workforce", normalized_unit: "employees" } }, metricExtra("Employees mobilized.")),
      rec("metric_wrong_unit", "metric_claim", { metric_name: "sworn_officer_strength", value: 500, year: "2025", unit_normalized: { unit_family: "workforce", normalized_unit: "sworn_officers" } }, metricExtra("Sworn officer strength.")),
      rec("metric_missing_evidence", "metric_claim", { metric_name: "total_positions", value: 100, year: "2025", unit_normalized: { unit_family: "workforce", normalized_unit: "positions" } }, { source_id: "metric_source", source_ids: ["metric_source"] }),
      rec("rel_final_estimate", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_final_estimate" }, relationExtra),
      rec("rel_variance", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_variance" }, relationExtra),
      rec("rel_unanchored", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_unanchored" }, relationExtra),
      rec("rel_wrong_unit", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_wrong_unit" }, relationExtra),
      rec("rel_route_subject", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_sir", object_id: "metric_unanchored" }, relationExtra),
      rec("rel_missing_evidence", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_missing_evidence" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("keeps equipment availability metric inference away from satisfaction, wrong units, missing anchors, and future text", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Availability metric appears in the same source table." }] };
    const records = [
      rec("entity_mnr", "entity", { entity_name: "Metro-North Railroad" }, { source_id: "metric_source" }),
      rec("metric_satisfaction", "metric_claim", { metric_name: "key_driver_satisfaction", label: "Seat Availability", value: 79, period: "2025", unit_normalized: { unit_family: "percentage" } }, metricExtra("Seat Availability 79%.")),
      rec("metric_wrong_unit", "metric_claim", { metric_name: "elevator_availability", value: 98.8, period: "2024", unit_normalized: { unit_family: "count" } }, metricExtra("Elevator availability 98.8%.")),
      rec("metric_no_anchor", "metric_claim", { metric_name: "escalator_availability", value: 99.7, unit_normalized: { unit_family: "percentage" } }, metricExtra("Escalator availability 99.7%.")),
      rec("metric_future", "metric_claim", { metric_name: "elevator_availability", value: 98.8, period: "2025", unit_normalized: { unit_family: "percentage" } }, metricExtra("Expected future elevator availability 98.8%.")),
      rec("rel_satisfaction", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_satisfaction" }, relationExtra),
      rec("rel_wrong_unit", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_wrong_unit" }, relationExtra),
      rec("rel_no_anchor", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_no_anchor" }, relationExtra),
      rec("rel_future", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_mnr", object_id: "metric_future" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("unknown");
  });

  it("keeps observed ridership metric inference away from plans, estimates, missing anchors, and table bleed", () => {
    const metricExtra = (quote: string) => ({ source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: quote }] });
    const relationExtra = { source_id: "metric_source", source_ids: ["metric_source"], evidence_refs: [{ source_id: "metric_source", source_quote: "Metric appears in the same source table." }] };
    const records = [
      rec("entity_lirr", "entity", { entity_name: "LIRR" }, { source_id: "metric_source" }),
      rec("route_q52", "route", { route_id: "Q52", route_record_scope: "true_route" }, { source_id: "metric_source" }),
      rec("metric_estimate", "metric_claim", { metric_name: "fixed_route_ridership", raw_value_text: "1,000 riders", year: "2025", unit_normalized: { unit_family: "ridership" } }, metricExtra("Final estimate of fixed-route ridership.")),
      rec("metric_proposed", "metric_claim", { metric_name: "daily_bus_riders", raw_value_text: "30,000", period: "daily", unit_normalized: { unit_family: "ridership" } }, metricExtra("Proposed Q52/Q53 service plan daily riders.")),
      rec("metric_no_anchor", "metric_claim", { metric_name: "corridor_ridership", raw_value_text: "32,000 riders", unit_normalized: { unit_family: "ridership" } }, metricExtra("Corridor ridership.")),
      rec("metric_safety_bleed", "metric_claim", { metric_name: "customer_accident_rate", raw_value_text: "1.2", year: "2025", unit_normalized: { unit_family: "rate" }, raw_text: "Safety rate table with neighboring Ridership column." }, metricExtra("Ridership header appears next to safety rate.")),
      rec("metric_no_value", "metric_claim", { metric_name: "annual_ridership", year: "2025", unit_normalized: { unit_family: "ridership" } }, metricExtra("Annual ridership row with no value.")),
      rec("rel_estimate", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_estimate" }, relationExtra),
      rec("rel_proposed", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "route_q52", object_id: "metric_proposed" }, relationExtra),
      rec("rel_no_anchor", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_no_anchor" }, relationExtra),
      rec("rel_safety_bleed", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_safety_bleed" }, relationExtra),
      rec("rel_no_value", "relation", { relation_kind: "has_metric", relation_family: "metric_context", subject_id: "entity_lirr", object_id: "metric_no_value" }, relationExtra),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation" && candidate.record_id !== "rel_proposed")) expect(record.payload.assertion_status).toBe("unknown");
    expect(records.find((record) => record.record_id === "rel_proposed")!.payload.assertion_status).toBe("proposed");
  });

  it("normalizes corridor treatment relation descriptions with explicit lifecycle wording", () => {
    const records = [
      rec("corridor_125", "corridor", { corridor_name: "125th Street" }),
      rec("route_bx36", "route", { route_id: "Bx36", route_record_scope: "true_route" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("entity_nypd", "entity", { entity_name: "NYPD" }),
      rec("treatment_limited", "treatment_component", { treatment_kind: "limited stops" }),
      rec("treatment_panels", "treatment_component", { treatment_kind: "bus time panels" }),
      rec("treatment_lanes", "treatment_component", { treatment_kind: "bus lanes" }),
      rec("treatment_able", "treatment_component", { treatment_kind: "ABLE", description: "Active automated bus lane enforcement cameras." }),
      rec("treatment_flood_doors", "treatment_component", { treatment_kind: "flood doors", description: "Flood doors installed at tunnel portals." }),
      rec("treatment_gate_guards", "treatment_component", { treatment_kind: "gate guards" }),
      rec("rel_proposed", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "corridor_125",
        object_id: "treatment_limited",
        description: "Limited stops treatment proposed for 125th Street SBS.",
      }),
      rec("rel_planned", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "corridor_125",
        object_id: "treatment_panels",
        description: "Additional Bus Time panels to be installed at other 125th St stops in 2015.",
      }),
      rec("rel_delivered", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "corridor_125",
        object_id: "treatment_lanes",
        description: "Dedicated lanes for buses and right turns installed on 125th Street.",
      }),
      rec("rel_route_delivered", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "route_bx36",
        object_id: "treatment_able",
      }),
      rec("rel_implements_treatment", "relation", {
        relation_kind: "implements_treatment",
        relation_family: "treatment_context",
        subject_id: "entity_mta",
        object_id: "treatment_flood_doors",
      }),
      rec("rel_enforced_by", "relation", {
        relation_kind: "enforced_by",
        relation_family: "agency_role",
        subject_id: "treatment_lanes",
        object_id: "entity_nypd",
        description: "NYPD issues summons for bus lane violations.",
      }),
      rec("rel_agency_implements", "relation", {
        relation_kind: "implements",
        relation_family: "agency_role",
        subject_id: "entity_mta",
        object_id: "treatment_gate_guards",
        description: "MTA deployed gate guards at stations.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) {
      const expected = record.record_id === "rel_proposed" ? "proposed" : record.record_id === "rel_planned" ? "planned" : "delivered";
      expect(record.payload.assertion_status).toBe(expected);
    }
  });

  it("marks future treatment evidence as planned without using subject text as a veto", () => {
    const records = [
      rec("corridor_future", "corridor", { corridor_name: "Future Nostrand Avenue SBS corridor", description: "Future corridor context." }),
      rec("route_b44", "route", { route_id: "B44", route_record_scope: "true_route" }),
      rec("treatment_bulbs", "treatment_component", { treatment_kind: "bus bulbs" }),
      rec("treatment_tsp", "treatment_component", { treatment_kind: "transit signal priority" }),
      rec("treatment_lanes", "treatment_component", { treatment_kind: "offset bus lanes" }),
      rec("rel_bulbs", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "corridor_future",
        object_id: "treatment_bulbs",
        description: "Sidewalks will extend out to the bus lane at selected bus stops.",
      }),
      rec("rel_tsp", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "corridor_future",
        object_id: "treatment_tsp",
        source_quote: "Buses will get an extended green light.",
      }),
      rec("rel_offset_lanes", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "corridor_future",
        object_id: "treatment_lanes",
        description: "NYC DOT will implement offset bus lanes in 2015.",
      }),
      rec(
        "rel_lane_effect",
        "relation",
        {
          relation_kind: "has_treatment",
          relation_family: "treatment_context",
          subject_id: "route_b44",
          object_id: "treatment_lanes",
        },
        { evidence_refs: [{ source_id: "src", source_quote: "Bus lanes will be in effect during peak periods." }] },
      ),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation")) expect(record.payload.assertion_status).toBe("planned");
  });

  it("keeps treatment lifecycle description inference scoped to safe endpoints and unambiguous lifecycle text", () => {
    const records = [
      rec("project_125", "project", { project_name: "125th Street SBS" }),
      rec("corridor_125", "corridor", { corridor_name: "125th Street" }),
      rec("entity_mta", "entity", { entity_name: "MTA" }),
      rec("entity_nypd", "entity", { entity_name: "NYPD may issue summonses" }),
      rec("treatment_lanes", "treatment_component", { treatment_kind: "bus lanes" }),
      rec("treatment_pilot", "treatment_component", { treatment_kind: "pilot treatment", description: "Pilot treatment expected to expand." }),
      rec("rel_non_corridor", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "project_125",
        object_id: "treatment_lanes",
        description: "Bus lanes installed on 125th Street.",
      }),
      rec("rel_non_treatment", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "corridor_125",
        object_id: "project_125",
        description: "Bus lanes installed on 125th Street.",
      }),
      rec("rel_missing_description", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "corridor_125",
        object_id: "treatment_lanes",
      }),
      rec("rel_mixed_lifecycle", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "corridor_125",
        object_id: "treatment_pilot",
        description: "Pilot treatment installed at one location with projected expansion.",
      }),
      rec("rel_future_enforcement", "relation", {
        relation_kind: "enforced_by",
        relation_family: "agency_role",
        subject_id: "treatment_lanes",
        object_id: "entity_nypd",
        description: "Bus lanes will be enforced by NYPD.",
      }),
      rec("rel_implements_pilot", "relation", {
        relation_kind: "implements",
        relation_family: "agency_role",
        subject_id: "entity_mta",
        object_id: "treatment_pilot",
        description: "MTA will explore upcoming pilot installations.",
      }),
      rec("rel_implements_wrong_endpoint", "relation", {
        relation_kind: "implements",
        relation_family: "agency_role",
        subject_id: "entity_mta",
        object_id: "project_125",
        description: "MTA installed the treatment.",
      }),
      rec("rel_implements_treatment_projected", "relation", {
        relation_kind: "implements_treatment",
        relation_family: "treatment_context",
        subject_id: "entity_mta",
        object_id: "treatment_lanes",
        description: "Bike racks installed at some sites with additional deployment projected by 2026.",
      }),
      rec("rel_generic_heading", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "corridor_125",
        object_id: "treatment_lanes",
        description: "Dedicated Bus Lanes.",
      }),
      rec("rel_generic_station", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "corridor_125",
        object_id: "treatment_lanes",
        description: "SBS Station.",
      }),
      rec("rel_proposed_future", "relation", {
        relation_kind: "has_treatment",
        relation_family: "treatment_context",
        subject_id: "corridor_125",
        object_id: "treatment_lanes",
        description: "PROPOSED bus lanes will be in effect after implementation.",
      }),
    ];

    withAssertionQualifiers(records);
    for (const record of records.filter((candidate) => candidate.record_kind === "relation" && candidate.record_id !== "rel_proposed_future")) expect(record.payload.assertion_status).toBe("unknown");
    expect(records.find((record) => record.record_id === "rel_proposed_future")!.payload.assertion_status).toBe("proposed");
  });

  it("takes as_of_date from the payload, else the citing source's published date", () => {
    const records = [
      rec("source_s", "source", { published_date_normalized: "2021-06" }, { source_id: "s" }),
      rec("p", "project", {}, { source_id: "s" }),
      rec("r", "route", {}, { source_id: "s" }),
      rec("rel_payload_date", "relation", { relation_kind: "serves_route", subject_id: "p", object_id: "r", date: "2019-03-05" }, { source_id: "s" }),
      rec("rel_source_date", "relation", { relation_kind: "serves_route", subject_id: "p", object_id: "r" }, { source_id: "s" }),
    ];
    withAssertionQualifiers(records);
    expect(records[3]!.payload.as_of_date).toBe("2019-03-05");
    expect(records[4]!.payload.as_of_date).toBe("2021-06");
  });
});

describe("danglingReferences", () => {
  it("records an unresolved context reference (no candidate)", () => {
    const records = [rec("metric_1", "metric_claim", { metric_name: "ridership", route_label: "ZZ999-nonexistent" })];
    const dangling = danglingReferences(records);
    const hit = dangling.find((d) => d.origin_record_id === "metric_1" && d.value === "ZZ999-nonexistent");
    expect(hit?.reason).toBe("unresolved");
    expect(hit?.candidate_ids).toEqual([]);
  });

  it("records an ambiguous reference when multiple route variants match", () => {
    const records = [
      rec("route_m1_local", "route", { route_id: "M1", route_type: "local" }),
      rec("route_m1_sbs", "route", { route_id: "M1", route_type: "select_bus_service" }),
      rec("metric_2", "metric_claim", { metric_name: "ridership", route_label: "M1" }),
    ];
    const hit = danglingReferences(records).find((d) => d.origin_record_id === "metric_2");
    expect(hit?.reason).toBe("ambiguous");
    expect(hit?.candidate_ids.length).toBeGreaterThan(1);
  });
});
