import { describe, expect, it } from "bun:test";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  applyQbnrTerminalServiceEndDecisions,
  parseQbnrTerminalServiceEndDecisionStore,
  QBNR_PROJECT_RECORD_ID,
  type QbnrTerminalServiceEndDecision,
  type QbnrTerminalServiceEndTreatmentBinding,
  type QbnrTerminalServiceEndWorkUnit,
} from "@mta-wiki/pipeline/records/qbnr-terminal-service-end-decisions";

const sourceId = "mta_queens_bus_network_redesign_service_changes" as const;
const blockId = "p001_b0018";
const blockHash = `sha256:${"a".repeat(64)}`;
const routeId = "route_q15a-historical-2025";
const eventId = "event_q15a-qbnr-end-2025-06-29";
const projectRouteRelationId = "relation_qbnr-2025-affects-q15a";
const projectEventRelationId = "relation_qbnr-has-q15a-end-2025-06-29";

const discontinuationBinding: QbnrTerminalServiceEndTreatmentBinding = {
  canonical_treatment_record_id: "treatment_q15a-discontinuation-2025",
  treatment_family: "service_pattern",
  canonical_project_treatment_relation_record_id: "relation_qbnr-2025-has-q15a-discontinuation",
};
const stopRemovalBinding: QbnrTerminalServiceEndTreatmentBinding = {
  canonical_treatment_record_id: "treatment_q15a-stop-removal-2025",
  treatment_family: "bus_stop",
  canonical_project_treatment_relation_record_id: "relation_qbnr-2025-has-q15a-stop-removal",
};

function decision(
  overrides: Partial<QbnrTerminalServiceEndDecision> = {},
): QbnrTerminalServiceEndDecision {
  return {
    schema_version: 1,
    decision_id: "qbnr-terminal-service-end-q15a-2025-06-29",
    review_state: "approved",
    source_id: sourceId,
    unit_id: "q15a-2025-06-29",
    route_label: "Q15A",
    effective_date: "2025-06-29",
    source_block_id: blockId,
    source_block_sha256: blockHash,
    canonical_project_record_id: QBNR_PROJECT_RECORD_ID,
    canonical_route_record_id: routeId,
    canonical_event_record_id: eventId,
    canonical_project_route_relation_record_id: projectRouteRelationId,
    canonical_project_event_relation_record_id: projectEventRelationId,
    canonical_treatment_bindings: [discontinuationBinding],
    reviewer: "corpus-owner",
    reviewed_at: "2026-07-13T12:00:00Z",
    rationale: "The official row and complete applied recovery graph establish a historical service end.",
    ...overrides,
  };
}

function unit(
  overrides: Partial<QbnrTerminalServiceEndWorkUnit> = {},
): QbnrTerminalServiceEndWorkUnit {
  return {
    unit_id: "q15a-2025-06-29",
    source_id: sourceId,
    source_block_ids: [blockId],
    source_block_sha256s: [blockHash],
    route_label: "Q15A",
    event_kind: "service_end",
    effective_date: "2025-06-29",
    work_status: "pending_canonical_then_terminal",
    canonical_route_record_id: null,
    notes: [],
    ...overrides,
  };
}

function evidence(role: string) {
  return {
    source_id: sourceId,
    evidence_id: `${sourceId}#${blockId}`,
    block_id: blockId,
    text_sha256: blockHash,
    role,
  };
}

function record(
  recordId: string,
  recordKind: MtaCanonicalRecord["record_kind"],
  payload: MtaCanonicalRecord["payload"],
  roles: string[] = [],
): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: recordKind,
    source_id: sourceId,
    local_observation_id: recordId.replace(/-/gu, "_"),
    display_name: recordId,
    payload,
    evidence_refs: roles.map(evidence),
    submission_ids: [`sub_${recordId}`],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-13T12:00:00Z",
  };
}

function projectRelation(
  recordId: string,
  relationKind: string,
  relationFamily: string,
  objectId: string,
  semanticRole: string,
): MtaCanonicalRecord {
  return record(recordId, "relation", {
    relation_kind: relationKind,
    relation_family: relationFamily,
    subject_id: QBNR_PROJECT_RECORD_ID,
    object_id: objectId,
    assertion_status: "delivered",
    as_of_date: "2025-06-29",
    as_of_date_normalized: {
      raw_text: "2025-06-29",
      normalized_date: "2025-06-29",
      precision: "day",
      confidence: "submitted_iso",
    },
  }, ["relationship", semanticRole]);
}

function canonicalRecords(
  bindings: QbnrTerminalServiceEndTreatmentBinding[] = [discontinuationBinding],
): MtaCanonicalRecord[] {
  return [
    record(QBNR_PROJECT_RECORD_ID, "project", { project_name: "Queens Bus Network Redesign" }),
    record(routeId, "route", { route_id: "Q15A" }, ["route_identity"]),
    record(eventId, "event", {
      event_kind: "route service end",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "route service end",
      date_normalized: "2025-06-29",
      date_precision: "day",
    }, ["event_date"]),
    projectRelation(projectRouteRelationId, "affects_route", "route_scope", routeId, "route_scope"),
    projectRelation(projectEventRelationId, "has_timeline_event", "timeline_context", eventId, "timeline_relation"),
    ...bindings.flatMap((binding) => [
      record(
        binding.canonical_treatment_record_id,
        "treatment_component",
        { treatment_family: binding.treatment_family },
        ["treatment_definition"],
      ),
      projectRelation(
        binding.canonical_project_treatment_relation_record_id,
        "has_treatment",
        "treatment_context",
        binding.canonical_treatment_record_id,
        "treatment_scope",
      ),
    ]),
  ];
}

describe("QBNR terminal service-end decisions", () => {
  it("parses the exact approved graph schema and rejects malformed or duplicate bindings", () => {
    const parsed = parseQbnrTerminalServiceEndDecisionStore({
      schema_version: 1,
      source_id: sourceId,
      decisions: [decision()],
    });
    expect(parsed.decisions).toHaveLength(1);

    expect(() => parseQbnrTerminalServiceEndDecisionStore({
      schema_version: 1,
      source_id: sourceId,
      decisions: [{ ...decision(), effective_date: "2025-02-30" }],
    })).toThrow("effective_date must be an ISO calendar date");

    expect(() => parseQbnrTerminalServiceEndDecisionStore({
      schema_version: 1,
      source_id: sourceId,
      decisions: [{ ...decision(), canonical_project_record_id: "project_other" }],
    })).toThrow(`canonical_project_record_id must be ${QBNR_PROJECT_RECORD_ID}`);

    expect(() => parseQbnrTerminalServiceEndDecisionStore({
      schema_version: 1,
      source_id: sourceId,
      decisions: [{
        ...decision(),
        canonical_treatment_bindings: [discontinuationBinding, discontinuationBinding],
      }],
    })).toThrow(`duplicate treatment ${discontinuationBinding.canonical_treatment_record_id}`);

    expect(() => parseQbnrTerminalServiceEndDecisionStore({
      schema_version: 1,
      source_id: sourceId,
      decisions: [{ ...decision(), unsupported: true }],
    })).toThrow("unknown field(s): unsupported");
  });

  it("accepts a complete one-treatment canonical recovery graph", () => {
    const result = applyQbnrTerminalServiceEndDecisions([unit()], [decision()], canonicalRecords());
    expect(result[0]).toMatchObject({
      work_status: "terminal_service_end",
      canonical_route_record_id: routeId,
      canonical_event_record_id: eventId,
      terminal_service_end_decision_id: "qbnr-terminal-service-end-q15a-2025-06-29",
    });
  });

  it("accepts a complete two-treatment canonical recovery graph", () => {
    const bindings = [discontinuationBinding, stopRemovalBinding];
    const result = applyQbnrTerminalServiceEndDecisions(
      [unit()],
      [decision({ canonical_treatment_bindings: bindings })],
      canonicalRecords(bindings),
    );
    expect(result[0]?.work_status).toBe("terminal_service_end");
  });

  it("rejects every missing project edge and missing treatment record", () => {
    const removals = [
      projectRouteRelationId,
      projectEventRelationId,
      discontinuationBinding.canonical_project_treatment_relation_record_id,
      discontinuationBinding.canonical_treatment_record_id,
    ];
    for (const missingId of removals) {
      expect(() => applyQbnrTerminalServiceEndDecisions(
        [unit()],
        [decision()],
        canonicalRecords().filter((candidate) => candidate.record_id !== missingId),
      )).toThrow(`${missingId} does not exist`);
    }
  });

  it("rejects missing, quarantined, or wrong-kind project records", () => {
    expect(() => applyQbnrTerminalServiceEndDecisions(
      [unit()],
      [decision()],
      canonicalRecords().filter((candidate) => candidate.record_id !== QBNR_PROJECT_RECORD_ID),
    )).toThrow(`canonical project ${QBNR_PROJECT_RECORD_ID} does not exist`);

    const quarantined = canonicalRecords();
    quarantined[0] = { ...quarantined[0]!, review_state: "quarantined" };
    expect(() => applyQbnrTerminalServiceEndDecisions([unit()], [decision()], quarantined))
      .toThrow(`${QBNR_PROJECT_RECORD_ID} is quarantined`);

    const wrongKind = canonicalRecords();
    wrongKind[0] = { ...wrongKind[0]!, record_kind: "entity" };
    expect(() => applyQbnrTerminalServiceEndDecisions([unit()], [decision()], wrongKind))
      .toThrow(`has kind entity, expected project`);
  });

  it("rejects wrong relation endpoints, kinds, or payloads", () => {
    const wrongEndpoint = canonicalRecords();
    const routeRelationIndex = wrongEndpoint.findIndex((candidate) => candidate.record_id === projectRouteRelationId);
    wrongEndpoint[routeRelationIndex] = {
      ...wrongEndpoint[routeRelationIndex]!,
      payload: { ...wrongEndpoint[routeRelationIndex]!.payload, object_id: eventId },
    };
    expect(() => applyQbnrTerminalServiceEndDecisions([unit()], [decision()], wrongEndpoint))
      .toThrow("does not match the exact affects_route project subgraph edge");

    const wrongRelationKind = canonicalRecords();
    wrongRelationKind[routeRelationIndex] = {
      ...wrongRelationKind[routeRelationIndex]!,
      payload: { ...wrongRelationKind[routeRelationIndex]!.payload, relation_kind: "has_timeline_event" },
    };
    expect(() => applyQbnrTerminalServiceEndDecisions([unit()], [decision()], wrongRelationKind))
      .toThrow("does not match the exact affects_route project subgraph edge");
  });

  it("rejects quarantined treatments and relations", () => {
    for (const quarantinedId of [
      discontinuationBinding.canonical_treatment_record_id,
      discontinuationBinding.canonical_project_treatment_relation_record_id,
    ]) {
      const records = canonicalRecords().map((candidate) =>
        candidate.record_id === quarantinedId
          ? { ...candidate, review_state: "quarantined" }
          : candidate
      );
      expect(() => applyQbnrTerminalServiceEndDecisions([unit()], [decision()], records))
        .toThrow(`${quarantinedId} is quarantined`);
    }
  });

  it("rejects omitted or extra exact-evidence recovery members", () => {
    const extraTreatment = record(
      "treatment_q15a-unreviewed-extra-2025",
      "treatment_component",
      { treatment_family: "service_pattern" },
      ["treatment_definition"],
    );
    expect(() => applyQbnrTerminalServiceEndDecisions(
      [unit()],
      [decision()],
      [...canonicalRecords(), extraTreatment],
    )).toThrow("canonical recovery subgraph mismatch for treatment_definition");
  });

  it("rejects stale unit pins and incomplete event payloads", () => {
    expect(() => applyQbnrTerminalServiceEndDecisions(
      [unit({ source_block_sha256s: [`sha256:${"b".repeat(64)}`] })],
      [decision()],
      canonicalRecords(),
    )).toThrow("route/date/block/hash pin mismatch");

    const records = canonicalRecords();
    const eventIndex = records.findIndex((candidate) => candidate.record_id === eventId);
    records[eventIndex] = {
      ...records[eventIndex]!,
      payload: { ...records[eventIndex]!.payload, lifecycle_phase_other: "route service start" },
    };
    expect(() => applyQbnrTerminalServiceEndDecisions([unit()], [decision()], records))
      .toThrow("is not the exact day-precise route service-end event");
  });
});
