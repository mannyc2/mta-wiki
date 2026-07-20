import { describe, expect, it } from "bun:test";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { OperationalOccurrenceRow } from "@mta-wiki/pipeline/materialize/operational-occurrences";
import type { RouteIdentitySnapshotV1 } from "@mta-wiki/pipeline/materialize/route-identity-contract";
import {
  buildRouteTreatmentScopeProjection,
  routeTreatmentScopeReconciliationJsonl,
  routeTreatmentScopesJsonl,
  routeTreatmentScopeSummaryJson,
} from "@mta-wiki/pipeline/materialize/route-treatment-scopes";

function record(
  recordId: string,
  recordKind: MtaCanonicalRecord["record_kind"],
  payload: JsonObject = {},
): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: recordKind,
    source_id: "source_fixture",
    local_observation_id: recordId,
    display_name: recordId,
    payload,
    evidence_refs: [{
      source_id: "source_fixture",
      block_id: "p001_b0001",
      evidence_id: "source_fixture#p001_b0001",
      source_path: "raw/sources/source_fixture/blocks.jsonl",
    }],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "reviewed",
    generated_at: "2026-07-20T00:00:00.000Z",
  };
}

function relation(
  recordId: string,
  subjectId: string,
  objectId: string,
  relationFamily: string,
  relationKind: string,
): MtaCanonicalRecord {
  return record(recordId, "relation", {
    subject_id: subjectId,
    object_id: objectId,
    relation_family: relationFamily,
    relation_kind: relationKind,
    assertion_status: "delivered",
  });
}

function snapshot(
  bindings: Array<{
    routeRecordId: string;
    datasetId: "mta-nyct-bus" | "mta-bus-company";
    sourceRouteId: string;
    projectable?: boolean;
  }>,
): RouteIdentitySnapshotV1 {
  return {
    record_bindings: bindings.map((binding) => ({
      route_record_id: binding.routeRecordId,
      route_family_id: binding.sourceRouteId.replace(/\+$/u, ""),
      dataset_id: binding.datasetId,
      component_feed_ids: ["feed"],
      source_route_id: binding.sourceRouteId,
      gtfs_route_id: binding.sourceRouteId,
      service_variant: "local",
      identity_scope: "exact_service",
      service_class: "regular_mta_bus",
      record_temporal_scope: "current_description",
      projectable: binding.projectable ?? true,
      presentation_primary: binding.projectable ?? true,
      derivation: "fixture",
      evidence_ids: ["source_fixture#p001_b0001"],
      canonical_record_fingerprint: "a".repeat(64),
      identity_basis: "deterministic_exact",
      expected_gtfs_identity_fingerprint: "b".repeat(64),
      decision_kind: binding.projectable === false ? "current_ineligible" : "current_primary",
      ineligibility_reasons: binding.projectable === false ? ["catalog_not_in_effect"] : [],
    })),
  } as unknown as RouteIdentitySnapshotV1;
}

function occurrence(input: {
  occurrenceId: string;
  routeRecordId: string;
  gtfsRouteId: string;
  treatments: Array<{ recordId: string; family: string }>;
}): OperationalOccurrenceRow {
  const evidence = (recordId: string, role: "route_identity" | "route_scope" | "treatment_definition" | "treatment_scope") => ({
    role,
    record_id: recordId,
    source_id: "source_fixture",
    evidence_id: "source_fixture#p001_b0001",
  });
  const members = input.treatments.map((treatment) => ({
    treatment_record_id: treatment.recordId,
    treatment_family: treatment.family,
    evidence_bindings: [
      evidence(treatment.recordId, "treatment_definition"),
      evidence(`relation_${treatment.recordId}`, "treatment_scope"),
    ],
  }));
  return {
    occurrence_id: input.occurrenceId,
    routes: [{
      route_record_id: input.routeRecordId,
      gtfs_route_id: input.gtfsRouteId,
      evidence_bindings: [
        evidence(input.routeRecordId, "route_identity"),
        evidence(`relation_${input.routeRecordId}`, "route_scope"),
      ],
    }],
    treatment: members.length === 1
      ? { kind: "atomic", member: members[0]! }
      : {
          kind: "bundle",
          bundle_family: "route_redesign",
          bundle_family_evidence_bindings: [],
          members,
        },
    provenance: {
      relation_record_ids: [
        `relation_${input.routeRecordId}`,
        ...input.treatments.map((treatment) => `relation_${treatment.recordId}`),
      ],
    },
  } as unknown as OperationalOccurrenceRow;
}

describe("route-treatment scope projection", () => {
  it("does not fan Q27 or B57 treatments through shared Queens project membership", () => {
    const project = record("project_queens-bus-network-redesign", "project");
    const q27Route = record("route_q27-ace", "route", { route_id: "Q27" });
    const b57Route = record("route_b57-grand-ave-2024", "route", { route_id: "B57" });
    const unrelatedRoute = record("route_q1", "route", { route_id: "Q1" });
    const q27Treatment = record(
      "treatment_q27-holly-kissena-reroute-2025",
      "treatment_component",
      { treatment_kind: "route rerouting", treatment_family: "service_pattern" },
    );
    const q27StopTreatment = record(
      "treatment_q27-stop-removal-2025",
      "treatment_component",
      { treatment_kind: "stop removal", treatment_family: "bus_stop_or_boarding" },
    );
    const b57Treatment = record(
      "treatment_b57-stop-removal-2025",
      "treatment_component",
      { treatment_kind: "stop removal", treatment_family: "bus_stop_or_boarding" },
    );
    const records = [
      project,
      q27Route,
      b57Route,
      unrelatedRoute,
      q27Treatment,
      q27StopTreatment,
      b57Treatment,
      relation("relation_project_q27", project.record_id, q27Route.record_id, "route_scope", "affects_route"),
      relation("relation_project_b57", project.record_id, b57Route.record_id, "route_scope", "affects_route"),
      relation("relation_project_q1", project.record_id, unrelatedRoute.record_id, "route_scope", "affects_route"),
      relation("relation_project_has_q27", project.record_id, q27Treatment.record_id, "treatment_context", "has_treatment"),
      relation("relation_project_has_q27_stop", project.record_id, q27StopTreatment.record_id, "treatment_context", "has_treatment"),
      relation("relation_project_has_b57", project.record_id, b57Treatment.record_id, "treatment_context", "has_treatment"),
    ];
    const projection = buildRouteTreatmentScopeProjection(
      records,
      snapshot([
        { routeRecordId: q27Route.record_id, datasetId: "mta-bus-company", sourceRouteId: "Q27" },
        { routeRecordId: b57Route.record_id, datasetId: "mta-nyct-bus", sourceRouteId: "B57" },
        { routeRecordId: unrelatedRoute.record_id, datasetId: "mta-bus-company", sourceRouteId: "Q1" },
      ]),
      [
        occurrence({
          occurrenceId: "occurrence:q27",
          routeRecordId: q27Route.record_id,
          gtfsRouteId: "Q27",
          treatments: [
            { recordId: q27Treatment.record_id, family: "service_pattern" },
            { recordId: q27StopTreatment.record_id, family: "bus_stop_or_boarding" },
          ],
        }),
        occurrence({
          occurrenceId: "occurrence:b57",
          routeRecordId: b57Route.record_id,
          gtfsRouteId: "B57",
          treatments: [{ recordId: b57Treatment.record_id, family: "bus_stop_or_boarding" }],
        }),
      ],
    );

    expect(projection.scopes.map((row) => [row.treatment_record_id, row.route_identity.source_route_id])).toEqual([
      ["treatment_b57-stop-removal-2025", "B57"],
      ["treatment_q27-holly-kissena-reroute-2025", "Q27"],
      ["treatment_q27-stop-removal-2025", "Q27"],
    ]);
    expect(projection.scopes.some((row) => row.route_identity.source_route_id === "Q1")).toBe(false);
    expect(projection.reconciliation).toEqual([]);
    expect(projection.summary).toMatchObject({
      treatment_record_count: 3,
      scoped_treatment_record_count: 3,
      route_treatment_scope_count: 3,
      project_treatment_context_relation_count: 3,
      project_membership_authorized_scope_count: 0,
      zero_unexplained_loss: true,
    });
  });

  it("preserves B44 and B44+ exact identities and reconciles unscoped treatments", () => {
    const b44 = record("route_b44", "route", { route_id: "B44" });
    const b44Plus = record("route_b44-sbs", "route", { route_id: "B44+" });
    const localTreatment = record("treatment_b44-local", "treatment_component", {
      treatment_kind: "stop change",
      treatment_family: "bus_stop_or_boarding",
    });
    const plusTreatment = record("treatment_b44-plus", "treatment_component", {
      treatment_kind: "transit signal priority",
      treatment_family: "signal_priority",
    });
    const unresolved = record("treatment_documented_unscoped", "treatment_component", {
      treatment_kind: "BRT toolbox",
      treatment_family: "bus_priority",
    });
    const projection = buildRouteTreatmentScopeProjection(
      [
        b44,
        b44Plus,
        localTreatment,
        plusTreatment,
        unresolved,
        relation("relation_b44_local", b44.record_id, localTreatment.record_id, "treatment_context", "has_treatment"),
        relation("relation_b44_plus", b44Plus.record_id, plusTreatment.record_id, "treatment_context", "has_treatment"),
      ],
      snapshot([
        { routeRecordId: b44.record_id, datasetId: "mta-nyct-bus", sourceRouteId: "B44" },
        { routeRecordId: b44Plus.record_id, datasetId: "mta-nyct-bus", sourceRouteId: "B44+" },
      ]),
      [],
    );

    expect(projection.scopes.map((row) => row.route_identity.source_route_id)).toEqual(["B44", "B44+"]);
    expect(projection.reconciliation).toEqual([
      expect.objectContaining({
        treatment_record_id: "treatment_documented_unscoped",
        raw_treatment_kind: "BRT toolbox",
        reason_code: "no_exact_route_treatment_scope",
      }),
    ]);
    expect(routeTreatmentScopesJsonl(projection.scopes)).toEndWith("\n");
    expect(routeTreatmentScopeReconciliationJsonl(projection.reconciliation)).toEndWith("\n");
    expect(routeTreatmentScopeSummaryJson(projection.summary)).toEndWith("\n");
    expect(projection.summary.zero_unexplained_loss).toBe(true);
  });

  it("fails closed when an occurrence route loses exact identity parity", () => {
    const route = record("route_q27", "route", { route_id: "Q27" });
    const treatment = record("treatment_q27", "treatment_component", {
      treatment_kind: "route rerouting",
      treatment_family: "service_pattern",
    });
    expect(() =>
      buildRouteTreatmentScopeProjection(
        [route, treatment],
        snapshot([{ routeRecordId: route.record_id, datasetId: "mta-bus-company", sourceRouteId: "Q27" }]),
        [occurrence({
          occurrenceId: "occurrence:q27",
          routeRecordId: route.record_id,
          gtfsRouteId: "Q27-SBS",
          treatments: [{ recordId: treatment.record_id, family: "service_pattern" }],
        })],
      )
    ).toThrow("lacks exact projectable identity parity");
  });

  it("fails closed on a future multi-route bundle without an explicit route/member pair contract", () => {
    const q27 = record("route_q27", "route", { route_id: "Q27" });
    const b57 = record("route_b57", "route", { route_id: "B57" });
    const first = record("treatment_first", "treatment_component", {
      treatment_kind: "route rerouting",
      treatment_family: "service_pattern",
    });
    const second = record("treatment_second", "treatment_component", {
      treatment_kind: "stop removal",
      treatment_family: "bus_stop_or_boarding",
    });
    const bundled = occurrence({
      occurrenceId: "occurrence:future-multi-route-bundle",
      routeRecordId: q27.record_id,
      gtfsRouteId: "Q27",
      treatments: [
        { recordId: first.record_id, family: "service_pattern" },
        { recordId: second.record_id, family: "bus_stop_or_boarding" },
      ],
    });
    bundled.routes.push({
      ...bundled.routes[0]!,
      route_record_id: b57.record_id,
      gtfs_route_id: "B57",
    });
    expect(() => buildRouteTreatmentScopeProjection(
      [q27, b57, first, second],
      snapshot([
        { routeRecordId: q27.record_id, datasetId: "mta-bus-company", sourceRouteId: "Q27" },
        { routeRecordId: b57.record_id, datasetId: "mta-nyct-bus", sourceRouteId: "B57" },
      ]),
      [bundled],
    )).toThrow("multi-route bundles require an explicit route/member pair contract");
  });
});
