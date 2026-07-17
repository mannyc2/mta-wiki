import { describe, expect, it } from "bun:test";
import type { JsonObject, MtaCanonicalRecord, MtaObservationKind } from "@mta-wiki/db/types";
import {
  DERIVED_RELATION_NON_EDGE_DECISIONS_V1,
  derivedRelationCoverage,
  withDerivedRelations,
} from "@mta-wiki/pipeline/records/derived-relations";
import { isReviewedNativeDerivationAbsentSemanticDecision } from "../../../../scripts/apply-relationship-semantic-remediation-v1.ts";

function record(
  recordKind: MtaObservationKind,
  recordId: string,
  displayName: string,
  payload: JsonObject,
): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: recordKind,
    source_id: "derived_relation_semantic_integrity_fixture",
    source_ids: ["derived_relation_semantic_integrity_fixture"],
    local_observation_id: recordId.replace(/-/gu, "_"),
    local_observation_ids: [recordId.replace(/-/gu, "_")],
    display_name: displayName,
    raw_text: displayName,
    payload,
    evidence_refs: [
      {
        source_id: "derived_relation_semantic_integrity_fixture",
        evidence_id: "derived_relation_semantic_integrity_fixture#p001_c0001",
        source_path: "raw/sources/derived_relation_semantic_integrity_fixture/blocks.jsonl",
        page_number: 1,
        block_id: "p001_c0001",
        text_sha256: "sha256:fixture",
        text_source: "raw_text",
      },
    ],
    submission_ids: [`sub_${recordId}`],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-16T03:00:00.000Z",
  };
}

describe("derived relationship semantic integrity", () => {
  it("does not turn broad project operator or entity publisher metadata into relationship edges", () => {
    const agency = record("entity", "entity_fixture-agency", "Fixture Agency", {
      entity_name: "Fixture Agency",
      entity_type: "transit_agency",
    });
    const division = record("entity", "entity_fixture-division", "Fixture Division", {
      entity_name: "Fixture Division",
      entity_type: "division",
      publisher: "Fixture Agency",
    });
    const project = record("project", "project_fixture-project", "Fixture Project", {
      project_name: "Fixture Project",
      operator: "Fixture Agency",
    });

    const relations = withDerivedRelations([agency, division, project]).filter(
      (candidate) => candidate.record_kind === "relation",
    );

    expect(relations).toHaveLength(0);
  });

  it("keeps narrow route-operator and source-publisher derivations", () => {
    const agency = record("entity", "entity_fixture-agency", "Fixture Agency", {
      entity_name: "Fixture Agency",
      entity_type: "transit_agency",
    });
    const route = record("route", "route_fixture-1", "Fixture 1", {
      route_id: "F1",
      operator: "Fixture Agency",
    });
    const source = record("source", "source_fixture-report", "Fixture Report", {
      source_id: "fixture_report",
      title: "Fixture Report",
      publisher: "Fixture Agency",
    });

    const relations = withDerivedRelations([agency, route, source]).filter(
      (candidate) => candidate.record_kind === "relation",
    );
    const tuples = relations.map((candidate) => [
      candidate.payload.derivation_rule,
      candidate.payload.relation_kind,
      candidate.payload.subject_id,
      candidate.payload.object_id,
    ]);

    expect(tuples).toContainEqual([
      "route-operator",
      "operated_by",
      "route_fixture-1",
      "entity_fixture-agency",
    ]);
    expect(tuples).toContainEqual([
      "source-publisher",
      "published_by",
      "source_fixture-report",
      "entity_fixture-agency",
    ]);
  });

  it("suppresses project-program self references in the native rule", () => {
    const project = record("project", "project_fixture-program", "Fixture Program", {
      project_name: "Fixture Program",
      program: "Fixture Program",
    });

    expect(withDerivedRelations([project])).toEqual([project]);
    expect(derivedRelationCoverage([project]).find((row) =>
      row.rule_id === "project-program" && row.field === "program"
    )).toMatchObject({
      value_count: 1,
      derived_count: 0,
      skipped_self_count: 1,
      skipped_reviewed_non_edge_count: 0,
    });
  });

  it("keeps the four reviewed historical Q20 literals but derives no current-Q20 edge", () => {
    const route = record("route", "route_q20-qbnr-2025", "Q20", {
      route_id: "Q20",
      route_label: "Q20",
    });
    const decision = DERIVED_RELATION_NON_EDGE_DECISIONS_V1[0];
    const metrics = decision.origin_record_ids.map((recordId) =>
      record("metric_claim", recordId, recordId, {
        metric_name: recordId,
        route: "Q20",
      })
    );

    const materialized = withDerivedRelations([route, ...metrics]);
    expect(materialized.filter((candidate) => candidate.record_kind === "relation")).toEqual([]);
    for (const metric of metrics) {
      expect(materialized.find((candidate) => candidate.record_id === metric.record_id)?.payload.route).toBe("Q20");
    }
    expect(derivedRelationCoverage([route, ...metrics]).find((row) =>
      row.rule_id === "metric-route-has-metric" && row.field === "route"
    )).toMatchObject({
      value_count: 4,
      derived_count: 0,
      already_present_count: 0,
      skipped_reviewed_non_edge_count: 4,
    });
  });

  it("fails closed when an unseen metric tries to inherit the historical Q20 non-edge", () => {
    const route = record("route", "route_q20-qbnr-2025", "Q20", {
      route_id: "Q20",
      route_label: "Q20",
    });
    const unseen = record("metric_claim", "metric_unreviewed-q20", "Unreviewed Q20 metric", {
      metric_name: "Unreviewed metric",
      route: "Q20",
    });

    expect(() => withDerivedRelations([route, unseen])).toThrow(
      "has no exact versioned non-edge decision",
    );
  });

  it("admits only the exact reviewed East Side Access absence into semantic outcome reconciliation", () => {
    const exact = {
      relation_id:
        "relation_part-of-program-project-annual-2021-east-side-access-project-annual-2021-east-side-access_7abcbc950c",
      terminal_action: "retract_unsupported",
      decision_id:
        "relationship-semantic-remediation-v1/part-0/relation_part-of-program-project-annual-2021-east-side-access-project-annual-2021-east-side-access_7abcbc950c",
    };
    expect(
      isReviewedNativeDerivationAbsentSemanticDecision(exact),
    ).toBe(true);
    expect(
      isReviewedNativeDerivationAbsentSemanticDecision({
        ...exact,
        relation_id: "relation_second_absent_decision",
      }),
    ).toBe(false);
    expect(
      isReviewedNativeDerivationAbsentSemanticDecision({
        ...exact,
        terminal_action: "patch_relation",
      }),
    ).toBe(false);
    expect(
      isReviewedNativeDerivationAbsentSemanticDecision({
        ...exact,
        decision_id: `${exact.decision_id}-wrong`,
      }),
    ).toBe(false);
  });
});
