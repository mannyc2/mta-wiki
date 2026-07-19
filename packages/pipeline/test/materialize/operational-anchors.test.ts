import { describe, expect, it } from "bun:test";
import type { JsonObject, MtaCanonicalRecord, MtaObservationKind } from "@mta-wiki/db/types";
import {
  validateOperationalAnchorReviewDecisions,
  type OperationalAnchorReviewDecision,
} from "@mta-wiki/pipeline/materialize/operational-anchor-review";
import {
  computeOperationalAnchorProjection,
  computeOperationalAnchors,
  operationalAnchorsJsonl,
  summarizeOperationalAnchors,
} from "@mta-wiki/pipeline/materialize/operational-anchors";
import type { RouteAnchorRow } from "@mta-wiki/pipeline/materialize/route-anchors";

function record(id: string, kind: MtaObservationKind, payload: JsonObject = {}, withEvidence = true): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: "source_test",
    local_observation_id: id,
    display_name: id,
    payload,
    evidence_refs: withEvidence
      ? [{ source_id: "source_test", evidence_id: `source_test#${id}_block`, block_id: `${id}_block`, page_number: 1 }]
      : [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-11T00:00:00.000Z",
  };
}

function relation(
  id: string,
  kind: string,
  subjectId: string,
  objectId: string,
  assertionStatus: string,
  extra: JsonObject = {},
): MtaCanonicalRecord {
  return record(id, "relation", {
    relation_kind: kind,
    relation_family: kind === "has_timeline_event" ? "timeline_context" : kind === "has_treatment" ? "treatment_context" : "route_scope",
    subject_id: subjectId,
    object_id: objectId,
    assertion_status: assertionStatus,
    ...extra,
  });
}

function routeAnchor(recordId: string, gtfsRouteId: string, disposition = "true_route"): RouteAnchorRow {
  return {
    gtfs_route_id: gtfsRouteId,
    canonical_route_record_id: recordId,
    variant_record_ids: [],
    aliases: [gtfsRouteId],
    disposition,
    anchor_reason: "test",
  };
}

function officialSource(): MtaCanonicalRecord {
  return record("source_source_test", "source", { publisher: "NYC DOT" });
}

function projectAnchorFixture(input: {
  assertionStatus?: string;
  dateNormalized?: string | null;
  datePrecision?: string;
  extraRoutes?: string[];
  extraTreatmentFamilies?: string[];
  eventEvidence?: boolean;
} = {}): { records: MtaCanonicalRecord[]; routeAnchors: RouteAnchorRow[] } {
  const projectId = "project_test";
  const eventId = "event_test_launch";
  const routeIds = ["route_b1", ...(input.extraRoutes ?? [])];
  const treatmentFamilies = ["bus_lane", ...(input.extraTreatmentFamilies ?? [])];
  const eventPayload: JsonObject = {
    event_kind: "launch",
    event_family: "launch",
    lifecycle_phase: "launched",
    date_precision: input.datePrecision ?? "day",
    ...(input.dateNormalized === null
      ? {}
      : {
          date_text: input.dateNormalized ?? "2024-06-15",
          date_normalized: input.dateNormalized ?? "2024-06-15",
        }),
  };
  const records = [
    officialSource(),
    record(projectId, "project"),
    record(eventId, "event", eventPayload, input.eventEvidence ?? true),
    relation(
      "relation_project_event",
      "has_timeline_event",
      projectId,
      eventId,
      input.assertionStatus ?? "delivered",
      { as_of_date: "2024-07" },
    ),
    ...routeIds.flatMap((routeId, index) => [
      record(routeId, "route", { route_id: routeId.replace("route_", "").toUpperCase() }),
      relation(`relation_project_route_${index}`, "serves_route", projectId, routeId, "delivered", { as_of_date: "2024-07" }),
    ]),
    ...treatmentFamilies.flatMap((family, index) => {
      const treatmentId = `treatment_${index}`;
      return [
        record(treatmentId, "treatment_component", { treatment_family: family }),
        relation(`relation_project_treatment_${index}`, "has_treatment", projectId, treatmentId, "delivered", { as_of_date: "2024-07" }),
      ];
    }),
  ];
  return {
    records,
    routeAnchors: routeIds.map((routeId) => routeAnchor(routeId, routeId.replace("route_", "").toUpperCase())),
  };
}

function directAnchorFixture(input: {
  assertionStatus?: string;
  dateNormalized?: string | null;
  datePrecision?: string;
  lifecyclePhase?: string;
  eventEvidence?: boolean;
  timelineEvidence?: boolean;
  routeScopeEvidence?: boolean;
  routeTreatmentStatus?: string;
} = {}): { records: MtaCanonicalRecord[]; routeAnchors: RouteAnchorRow[] } {
  const routeId = "route_b1";
  const treatmentId = "treatment_bus_lane";
  const eventId = "event_bus_lane_launch";
  const routeTreatment = relation(
    "relation_route_treatment",
    "has_treatment",
    routeId,
    treatmentId,
    input.routeTreatmentStatus ?? "delivered",
  );
  routeTreatment.evidence_refs = input.routeScopeEvidence === false ? [] : routeTreatment.evidence_refs;
  const timeline = relation(
    "relation_treatment_event",
    "has_timeline_event",
    treatmentId,
    eventId,
    input.assertionStatus ?? "delivered",
    { as_of_date: "2024-07" },
  );
  timeline.evidence_refs = input.timelineEvidence === false ? [] : timeline.evidence_refs;
  return {
    records: [
      officialSource(),
      record(routeId, "route", { route_id: "B1" }),
      record(treatmentId, "treatment_component", { treatment_family: "bus_lane" }),
      record(
        eventId,
        "event",
        {
          event_kind: "launch",
          event_family: "launch",
          lifecycle_phase: input.lifecyclePhase ?? "launched",
          date_precision: input.datePrecision ?? "day",
          ...(input.dateNormalized === null
            ? {}
            : {
                date_text: input.dateNormalized ?? "2024-06-15",
                date_normalized: input.dateNormalized ?? "2024-06-15",
              }),
        },
        input.eventEvidence ?? true,
      ),
      routeTreatment,
      timeline,
    ],
    routeAnchors: [routeAnchor(routeId, "B1")],
  };
}

function reviewedProjectDecision(overrides: Partial<OperationalAnchorReviewDecision> = {}): OperationalAnchorReviewDecision {
  return {
    artifact_path: "test/reviewed-project.json",
    schema_version: 1,
    decision_id: "reviewed-project",
    review_state: "accepted",
    accepted_at: "2026-07-11T00:00:00.000Z",
    reviewer: "test-reviewer",
    rationale: "Test reviewer confirmed one atomic route, treatment, and event tuple from the bound evidence.",
    source_id: "source_test",
    event_record_id: "event_test_launch",
    timeline_relation_record_id: "relation_project_event",
    route_record_id: "route_b1",
    route_scope_relation_record_id: "relation_project_route_0",
    treatment_record_id: "treatment_0",
    treatment_scope_relation_record_id: "relation_project_treatment_0",
    treatment_family: "bus_lane",
    expected_operational_date: "2024-06-15",
    expected_date_precision: "day",
    evidence_bindings: [
      {
        role: "event_date",
        record_id: "event_test_launch",
        source_id: "source_test",
        evidence_id: "source_test#event_test_launch_block",
      },
      {
        role: "timeline_relation",
        record_id: "relation_project_event",
        source_id: "source_test",
        evidence_id: "source_test#relation_project_event_block",
      },
      {
        role: "route_identity",
        record_id: "route_b1",
        source_id: "source_test",
        evidence_id: "source_test#route_b1_block",
      },
      {
        role: "route_scope",
        record_id: "relation_project_route_0",
        source_id: "source_test",
        evidence_id: "source_test#relation_project_route_0_block",
      },
      {
        role: "treatment_definition",
        record_id: "treatment_0",
        source_id: "source_test",
        evidence_id: "source_test#treatment_0_block",
      },
      {
        role: "treatment_scope",
        record_id: "relation_project_treatment_0",
        source_id: "source_test",
        evidence_id: "source_test#relation_project_treatment_0_block",
      },
      {
        role: "route_treatment_event_bridge",
        record_id: "project_test",
        source_id: "source_test",
        evidence_id: "source_test#project_test_block",
      },
    ],
    ...overrides,
  };
}

describe("operational anchor export", () => {
  it("separates reviewed overlays from broad rows and distinct events", () => {
    const fixture = projectAnchorFixture();
    const projection = computeOperationalAnchorProjection(fixture.records, fixture.routeAnchors, {
      reviewDecisions: [reviewedProjectDecision()],
    });
    const summary = summarizeOperationalAnchors(projection.rows, {
      canonicalEventCount: 1,
      operationalFamilyEventCount: 1,
      entryGate: projection.entry_gate,
    });

    expect(summary.row_count).toBe(2);
    expect(summary.broad_row_count).toBe(1);
    expect(summary.reviewed_row_count).toBe(1);
    expect(summary.distinct_operational_event_count).toBe(1);
    expect(summary.study_eligible_reviewed_count).toBe(1);
    expect(summary.funnel.timeline_linked_operational_events).toBe(1);
    expect(summary.funnel.timeline_linked_distinct_events).toBe(1);
    expect(summary.funnel.unlinked_operational_events).toBe(0);
  });

  it("counts timeline relations rejected by the operational entry gate", () => {
    const fixture = directAnchorFixture();
    fixture.records.push(
      record("project_not_event", "project"),
      relation("relation_to_non_event", "has_timeline_event", "route_b1", "project_not_event", "delivered"),
      record("event_publication", "event", { event_family: "publication" }),
      relation("relation_to_publication", "has_timeline_event", "route_b1", "event_publication", "delivered"),
    );

    const projection = computeOperationalAnchorProjection(fixture.records, fixture.routeAnchors);
    expect(projection.rows).toHaveLength(1);
    expect(projection.entry_gate).toEqual({
      relations_examined: 3,
      non_event_timeline_objects: 1,
      non_operational_event_objects: 1,
    });
  });

  it("adds an atomic reviewed anchor without promoting the broad inherited project row", () => {
    const fixture = projectAnchorFixture();
    const recordsBefore = structuredClone(fixture.records);
    const rows = computeOperationalAnchors(fixture.records, fixture.routeAnchors, {
      reviewDecisions: [reviewedProjectDecision()],
    });
    const broad = rows.find((row) => row.anchor_id === "operational:event_test_launch");
    const reviewed = rows.find((row) => row.anchor_id === "operational-reviewed:reviewed-project");

    expect(broad?.scope_resolution).toBe("unreviewed_inherited");
    expect(broad?.study_eligible).toBe(false);
    expect(reviewed?.gtfs_route_ids).toEqual(["B1"]);
    expect(reviewed?.treatment_record_ids).toEqual(["treatment_0"]);
    expect(reviewed?.scope_resolution).toBe("reviewed_inherited");
    expect(reviewed?.evidence_coverage).toEqual({ event: true, timeline: true, route_scope: true, treatment_scope: true });
    expect(reviewed?.exclusion_reasons).toEqual([]);
    expect(reviewed?.study_eligible).toBe(true);
    expect(fixture.records).toEqual(recordsBefore);
  });

  it("treats rich exact_service route anchors as trusted while unknown dispositions stay closed", () => {
    const fixture = projectAnchorFixture();
    fixture.routeAnchors[0] = {
      ...fixture.routeAnchors[0]!,
      disposition: "exact_service",
    };
    const reviewed = computeOperationalAnchors(fixture.records, fixture.routeAnchors, {
      reviewDecisions: [reviewedProjectDecision()],
    }).find((row) => row.anchor_id === "operational-reviewed:reviewed-project");
    expect(reviewed?.gtfs_route_ids).toEqual(["B1"]);

    fixture.routeAnchors[0] = {
      ...fixture.routeAnchors[0]!,
      disposition: "unreviewed_future_disposition",
    };
    expect(() => computeOperationalAnchors(fixture.records, fixture.routeAnchors, {
      reviewDecisions: [reviewedProjectDecision()],
    })).toThrow("requires exactly one trusted GTFS route");
  });

  it("quarantines a reviewed decision when an evidence binding is not exact", () => {
    const fixture = projectAnchorFixture();
    const decision = reviewedProjectDecision({
      evidence_bindings: reviewedProjectDecision().evidence_bindings.map((binding) =>
        binding.role === "event_date" ? { ...binding, evidence_id: "source_test#missing" } : binding,
      ),
    });
    const report = validateOperationalAnchorReviewDecisions([decision], fixture.records);

    expect(report.accepted).toEqual([]);
    expect(report.quarantined).toHaveLength(1);
    expect(report.quarantined[0]?.reasons).toContain("evidence source_test#missing is not an exact ref on event_test_launch");
    expect(() =>
      computeOperationalAnchors(fixture.records, fixture.routeAnchors, { reviewDecisions: [decision] }),
    ).toThrow("Operational-anchor review decision validation failed");
  });

  it("quarantines every duplicate atomic review instead of choosing one by file order", () => {
    const fixture = projectAnchorFixture();
    const first = reviewedProjectDecision();
    const second = reviewedProjectDecision({ decision_id: "reviewed-project-duplicate", artifact_path: "test/reviewed-project-duplicate.json" });
    const report = validateOperationalAnchorReviewDecisions([second, first], fixture.records);

    expect(report.accepted).toEqual([]);
    expect(report.quarantined.map((entry) => entry.decision_id).sort()).toEqual(["reviewed-project", "reviewed-project-duplicate"]);
    expect(report.quarantined.every((entry) => entry.code === "conflicting_operational_anchor_review")).toBe(true);
  });

  it("keeps singleton project inheritance visible but ineligible until reviewed", () => {
    const fixture = projectAnchorFixture();
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor).toBeDefined();
    expect(anchor?.temporal_role).toBe("realized_operational");
    expect(anchor?.gtfs_route_ids).toEqual(["B1"]);
    expect(anchor?.treatment_families).toEqual(["bus_lane"]);
    expect(anchor?.scope_resolution).toBe("unreviewed_inherited");
    expect(anchor?.exclusion_reasons).toContain("unreviewed_inherited_scope");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("admits a delivered route-to-treatment-to-event chain with complete evidence", () => {
    const fixture = directAnchorFixture();
    const event = fixture.records.find((candidate) => candidate.record_id === "event_bus_lane_launch");
    if (!event?.evidence_refs[0]) throw new Error("missing event evidence fixture");
    event.evidence_refs[0].text_sha256 = `sha256:${"a".repeat(64)}`;
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.temporal_role).toBe("realized_operational");
    expect(anchor?.gtfs_route_ids).toEqual(["B1"]);
    expect(anchor?.treatment_record_ids).toEqual(["treatment_bus_lane"]);
    expect(anchor?.scope_resolution).toBe("direct");
    expect(anchor?.route_scope_direct).toBe(true);
    expect(anchor?.treatment_scope_direct).toBe(true);
    expect(anchor?.evidence_coverage).toEqual({ event: true, timeline: true, route_scope: true, treatment_scope: true });
    expect(anchor?.evidence_refs.find((ref) => ref.record_id === event.record_id)?.text_sha256).toBe(
      "a".repeat(64),
    );
    expect(anchor?.exclusion_reasons).toEqual([]);
    expect(anchor?.study_eligible).toBe(true);
  });

  it("never substitutes a source publication date for a missing operational onset", () => {
    const fixture = directAnchorFixture({ dateNormalized: null, datePrecision: "unknown" });
    const source = fixture.records.find((candidate) => candidate.record_kind === "source");
    if (!source) throw new Error("missing source fixture");
    source.payload.published_date_normalized = "2024-06-15";
    source.payload.published_date_precision = "day";
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.candidate_operational_date_normalized).toBeNull();
    expect(anchor?.normalized_date).toBe("2024-07");
    expect(anchor?.temporal_role).toBe("status_as_of");
    expect(anchor?.exclusion_reasons).toContain("missing_operational_date");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("never exports a dated publication-family event as an operational anchor", () => {
    const fixture = directAnchorFixture();
    const event = fixture.records.find((candidate) => candidate.record_kind === "event");
    if (!event) throw new Error("missing event fixture");
    event.payload.event_family = "publication";

    expect(computeOperationalAnchors(fixture.records, fixture.routeAnchors)).toEqual([]);
  });

  it("keeps planned operational dates but never admits them to studies", () => {
    const fixture = projectAnchorFixture({ assertionStatus: "planned" });
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.temporal_role).toBe("planned_operational");
    expect(anchor?.exclusion_reasons).toContain("non_realized_operational_date");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("labels relation as-of dates as status-as-of instead of operational dates", () => {
    const fixture = projectAnchorFixture({ dateNormalized: null, datePrecision: "unknown" });
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.temporal_role).toBe("status_as_of");
    expect(anchor?.normalized_date).toBe("2024-07");
    expect(anchor?.status_as_of_dates).toEqual(["2024-07"]);
    expect(anchor?.exclusion_reasons).toContain("status_as_of_only");
    expect(anchor?.exclusion_reasons).toContain("missing_operational_date");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("exports ambiguous project scope once without route-treatment cross products", () => {
    const fixture = projectAnchorFixture({ extraRoutes: ["route_b2"], extraTreatmentFamilies: ["queue_jump"] });
    const anchors = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.gtfs_route_ids).toEqual(["B1", "B2"]);
    expect(anchors[0]?.treatment_families).toEqual(["bus_lane", "queue_jump"]);
    expect(anchors[0]?.scope_resolution).toBe("ambiguous");
    expect(anchors[0]?.conflict_states).toEqual([]);
    expect(anchors[0]?.exclusion_reasons).toContain("ambiguous_route_scope");
    expect(anchors[0]?.exclusion_reasons).toContain("ambiguous_treatment_scope");
    expect(anchors[0]?.study_eligible).toBe(false);
  });

  it("excludes year-only dates and reason-codes every missing evidence edge", () => {
    const fixture = directAnchorFixture({
      dateNormalized: "2024",
      datePrecision: "year",
      eventEvidence: false,
      timelineEvidence: false,
      routeScopeEvidence: false,
    });
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.exclusion_reasons).toContain("imprecise_operational_date");
    expect(anchor?.exclusion_reasons).toContain("missing_event_evidence");
    expect(anchor?.exclusion_reasons).toContain("missing_timeline_evidence");
    expect(anchor?.exclusion_reasons).toContain("missing_route_scope_evidence");
    expect(anchor?.exclusion_reasons).toContain("missing_treatment_scope_evidence");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("excludes season-only operational dates even with otherwise complete direct evidence", () => {
    const fixture = directAnchorFixture({ dateNormalized: "2024-summer", datePrecision: "season" });
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.candidate_operational_date_precision).toBe("season");
    expect(anchor?.exclusion_reasons).toContain("imprecise_operational_date");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("excludes a delivered event whose lifecycle phase remains ambiguous", () => {
    const fixture = directAnchorFixture({ lifecyclePhase: "other" });
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.temporal_role).toBe("realized_operational");
    expect(anchor?.exclusion_reasons).toContain("ambiguous_lifecycle_phase");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("does not classify in-progress, unknown, cancelled, deferred, or excluded dates as planned", () => {
    for (const status of ["in_progress", "unknown", "cancelled", "deferred", "excluded"]) {
      const fixture = directAnchorFixture({ assertionStatus: status });
      const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);
      expect(anchor?.temporal_role).toBe("status_as_of");
      expect(anchor?.candidate_operational_date_normalized).toBe("2024-06-15");
      expect(anchor?.study_eligible).toBe(false);
    }
  });

  it("reason-codes a missing candidate date even when the timeline status is unknown", () => {
    const fixture = directAnchorFixture({ assertionStatus: "unknown", dateNormalized: null });
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.candidate_operational_date_normalized).toBeNull();
    expect(anchor?.exclusion_reasons).toContain("missing_operational_date");
  });

  it("keeps two treatment records of one family ambiguous", () => {
    const fixture = projectAnchorFixture({ extraTreatmentFamilies: ["bus_lane"] });
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.treatment_families).toEqual(["bus_lane"]);
    expect(anchor?.treatment_record_ids).toHaveLength(2);
    expect(anchor?.scope_resolution).toBe("ambiguous");
    expect(anchor?.exclusion_reasons).toContain("ambiguous_treatment_scope");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("does not use unconfirmed scope edges to construct a causal route-treatment chain", () => {
    const fixture = directAnchorFixture({ routeTreatmentStatus: "unknown" });
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.gtfs_route_ids).toEqual([]);
    expect(anchor?.scope_resolution).toBe("missing");
    expect(anchor?.exclusion_reasons).toContain("missing_route_scope");
    expect(anchor?.exclusion_reasons).not.toContain("missing_route_scope_evidence");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("does not resolve a canonical route through an untrusted route-anchor disposition", () => {
    const fixture = directAnchorFixture();
    fixture.routeAnchors = [routeAnchor("route_b1", "B1", "split_candidate")];
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.route_record_ids).toEqual(["route_b1"]);
    expect(anchor?.gtfs_route_ids).toEqual([]);
    expect(anchor?.exclusion_reasons).toContain("unmatched_gtfs_route");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("quarantines partially mapped multi-record route scope", () => {
    const fixture = directAnchorFixture();
    fixture.records.push(
      record("route_unmatched", "route", { route_id: "B2" }),
      relation("relation_unmatched_route_treatment", "has_treatment", "route_unmatched", "treatment_bus_lane", "delivered"),
    );
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.gtfs_route_ids).toEqual(["B1"]);
    expect(anchor?.unmatched_route_record_ids).toEqual(["route_unmatched"]);
    expect(anchor?.route_scope_resolution).toBe("ambiguous");
    expect(anchor?.exclusion_reasons).toContain("partially_unmatched_gtfs_route");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("does not admit quarantined scope endpoints", () => {
    const fixture = directAnchorFixture();
    const route = fixture.records.find((candidate) => candidate.record_id === "route_b1");
    if (!route) throw new Error("missing test route");
    route.review_state = "quarantined";
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.exclusion_reasons).toContain("quarantined_record");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("requires official source authority and source-stated causal edges", () => {
    const fixture = directAnchorFixture();
    const source = fixture.records.find((candidate) => candidate.record_id === "source_source_test");
    const relationRecord = fixture.records.find((candidate) => candidate.record_id === "relation_route_treatment");
    if (!source || !relationRecord) throw new Error("missing test authority records");
    source.payload.publisher = "Example advocacy organization";
    relationRecord.truth_status = "derived";
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.source_authority).toBe("non_official");
    expect(anchor?.truth_statuses).toEqual(["derived", "source_stated"]);
    expect(anchor?.exclusion_reasons).toContain("untrusted_source_authority");
    expect(anchor?.exclusion_reasons).toContain("non_source_stated_evidence");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("recognizes official NYC publisher aliases used by captured city sources", () => {
    for (const publisher of [
      "NYC DOT",
      "New York City DOT",
      "New York City Department of Transportation",
      "NYC Mayor's Office",
      "Office of the Mayor",
    ]) {
      const fixture = directAnchorFixture();
      const source = fixture.records.find((candidate) => candidate.record_id === "source_source_test");
      if (!source) throw new Error("missing test authority record");
      source.payload.publisher = publisher;
      const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);
      expect(anchor?.source_authority).toBe("official_public_agency");
      expect(anchor?.exclusion_reasons).not.toContain("untrusted_source_authority");
    }
  });

  it("requires a bounded treatment family for a scoped treatment record", () => {
    const fixture = directAnchorFixture();
    const treatment = fixture.records.find((candidate) => candidate.record_id === "treatment_bus_lane");
    if (!treatment) throw new Error("missing test treatment");
    delete treatment.payload.treatment_family;
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.treatment_record_ids).toEqual(["treatment_bus_lane"]);
    expect(anchor?.treatment_families).toEqual([]);
    expect(anchor?.exclusion_reasons).toContain("missing_treatment_family");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("quarantines a delivered assertion whose as-of date predates the candidate event", () => {
    const fixture = directAnchorFixture();
    const timeline = fixture.records.find((candidate) => candidate.record_id === "relation_treatment_event");
    if (!timeline) throw new Error("missing test timeline");
    timeline.payload.as_of_date = "2024-05";
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.conflict_states).toContain("temporal_order_conflict");
    expect(anchor?.exclusion_reasons).toContain("future_delivered_status");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("quarantines incompatible normalized date candidates while preserving precedence", () => {
    const fixture = directAnchorFixture();
    const event = fixture.records.find((candidate) => candidate.record_id === "event_bus_lane_launch");
    if (!event) throw new Error("missing test event");
    event.payload.event_date = "June 15, 2024";
    event.payload.date_text = "July 1, 2024";
    event.payload.date_normalized = "2024-06-15";

    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);
    expect(anchor?.candidate_operational_date_source_field).toBe("event_date");
    expect(anchor?.candidate_operational_date_normalized).toBe("2024-06-15");
    expect(anchor?.candidate_operational_dates_normalized).toEqual(["2024-06-15", "2024-07-01"]);
    expect(anchor?.conflict_states).toContain("date_conflict");
    expect(anchor?.exclusion_reasons).toContain("conflicting_date_evidence");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("does not treat a redundant year as conflicting with a more precise date", () => {
    const fixture = directAnchorFixture();
    const event = fixture.records.find((candidate) => candidate.record_id === "event_bus_lane_launch");
    if (!event) throw new Error("missing test event");
    event.payload.year = 2024;

    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);
    expect(anchor?.candidate_operational_dates_normalized).toEqual(["2024", "2024-06-15"]);
    expect(anchor?.conflict_states).not.toContain("date_conflict");
    expect(anchor?.study_eligible).toBe(true);
  });

  it("does not promote a January 1 placeholder above the source's year-only literal", () => {
    const fixture = directAnchorFixture();
    const event = fixture.records.find((candidate) => candidate.record_id === "event_bus_lane_launch");
    if (!event) throw new Error("missing test event");
    event.payload.date = "2024-01-01";
    event.payload.date_text = "2024";
    event.payload.date_normalized = "2024-01-01";

    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);
    expect(anchor?.candidate_operational_date_source_field).toBe("date_text");
    expect(anchor?.candidate_operational_date_normalized).toBe("2024");
    expect(anchor?.candidate_operational_date_precision).toBe("year");
    expect(anchor?.exclusion_reasons).toContain("imprecise_operational_date");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("preserves malformed year-range literals without exporting an invalid normalized month", () => {
    const fixture = directAnchorFixture({ dateNormalized: "2019-21", datePrecision: "month" });
    const [anchor] = computeOperationalAnchors(fixture.records, fixture.routeAnchors);

    expect(anchor?.candidate_operational_date_raw).toBe("2019-21");
    expect(anchor?.candidate_operational_date_normalized).toBeNull();
    expect(anchor?.candidate_operational_date_precision).toBe("unknown");
    expect(anchor?.candidate_operational_date_candidates).toEqual([]);
    expect(anchor?.exclusion_reasons).toContain("missing_operational_date");
    expect(anchor?.study_eligible).toBe(false);
  });

  it("keeps operational change identity stable when only year, month, month-year, and season literals change", () => {
    const first = directAnchorFixture({ dateNormalized: "2015-07", datePrecision: "month" });
    const second = directAnchorFixture({ dateNormalized: "2016-08", datePrecision: "month" });
    const firstEvent = first.records.find((candidate) => candidate.record_id === "event_bus_lane_launch");
    const secondEvent = second.records.find((candidate) => candidate.record_id === "event_bus_lane_launch");
    const firstTimeline = first.records.find((candidate) => candidate.record_id === "relation_treatment_event");
    const secondTimeline = second.records.find((candidate) => candidate.record_id === "relation_treatment_event");
    if (!firstEvent || !secondEvent || !firstTimeline || !secondTimeline) throw new Error("missing date-free identity fixture records");
    firstEvent.payload.event_name = "M86 launch July 2015, summer 2015, 2015-fall, 2015-07, 2015";
    secondEvent.payload.event_name = "M86 launch August 2016, summer 2016, 2016-fall, 2016-08, 2016";
    firstTimeline.payload.as_of_date = "2017";
    secondTimeline.payload.as_of_date = "2017";

    const [firstRow] = computeOperationalAnchors(first.records, first.routeAnchors);
    const [secondRow] = computeOperationalAnchors(second.records, second.routeAnchors);
    expect(firstRow?.operational_change_id).toBe(secondRow?.operational_change_id);
  });

  it("reports resolved route scope before missing treatment scope in the cumulative funnel", () => {
    const records = [
      officialSource(),
      record("route_b1", "route", { route_id: "B1" }),
      record("event_route_launch", "event", {
        event_kind: "launch",
        event_family: "launch",
        date_text: "2024-06",
        date_normalized: "2024-06",
        date_precision: "month",
      }),
      relation("relation_route_event", "has_timeline_event", "route_b1", "event_route_launch", "delivered", {
        as_of_date: "2024-07",
      }),
    ];
    const projection = computeOperationalAnchorProjection(records, [routeAnchor("route_b1", "B1")]);
    const summary = summarizeOperationalAnchors(projection.rows, {
      canonicalEventCount: 1,
      operationalFamilyEventCount: 1,
      entryGate: projection.entry_gate,
    });

    expect(summary.funnel.resolved_route_scope).toBe(1);
    expect(summary.funnel.resolved_treatment_scope).toBe(0);
  });

  it("is deterministic and produces a reason-coded summary", () => {
    const fixture = directAnchorFixture();
    fixture.records.push(
      record("event_test_planned", "event", {
        event_kind: "launch",
        event_family: "launch",
        lifecycle_phase: "launched",
        date_text: "2025-02",
        date_normalized: "2025-02",
        date_precision: "month",
      }),
      relation("relation_treatment_event_planned", "has_timeline_event", "treatment_bus_lane", "event_test_planned", "planned", {
        as_of_date: "2024-07",
      }),
    );
    const projectionA = computeOperationalAnchorProjection(fixture.records, fixture.routeAnchors);
    const projectionB = computeOperationalAnchorProjection([...fixture.records].reverse(), [...fixture.routeAnchors].reverse());
    const anchorsA = projectionA.rows;
    const anchorsB = projectionB.rows;

    expect(operationalAnchorsJsonl(anchorsA)).toBe(operationalAnchorsJsonl(anchorsB));
    const summary = summarizeOperationalAnchors(anchorsA, {
      canonicalEventCount: 2,
      operationalFamilyEventCount: 2,
      entryGate: projectionA.entry_gate,
    });
    expect(summary.row_count).toBe(2);
    expect(summary.study_eligible_count).toBe(1);
    expect(summary.counts_by_exclusion_reason.non_realized_operational_date).toBe(1);
    expect(summary.funnel).toEqual({
      canonical_events: 2,
      operational_family_events_total: 2,
      timeline_linked_operational_events: 2,
      timeline_linked_distinct_events: 2,
      unlinked_operational_events: 0,
      candidate_operational_date_present: 2,
      realized_operational: 1,
      realized_day_or_month: 1,
      resolved_route_scope: 1,
      resolved_treatment_scope: 1,
      evidence_complete: 1,
      conflict_free: 1,
      study_eligible: 1,
    });
  });
});
