import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";

type EvidenceBinding = {
  role: string;
  record_id: string;
  source_id: string;
  evidence_id: string;
};

type ScopedRoute = {
  route_record_id: string;
  gtfs_route_id: string;
  evidence_bindings: EvidenceBinding[];
};

type AtomicTreatment = {
  kind: "atomic";
  member: {
    treatment_record_id: string;
    treatment_family: string;
    evidence_bindings: EvidenceBinding[];
  };
};

type AcceptedOccurrenceDecision = {
  decision_id: string;
  review_state: string;
  occurrence_id: string;
  founding_key: string;
  resolved_status: string;
  resolved_onset: {
    date: string;
    precision: string;
    evidence_bindings: EvidenceBinding[];
  };
  routes: ScopedRoute[];
  treatment_scope_kind: string;
  treatment: AtomicTreatment;
};

type ProjectedOccurrence = {
  occurrence_id: string;
  occurrence_review_decision_id: string;
  founding_key: string;
  review_state: string;
  resolved_status: string;
  resolved_onset: {
    date: string;
    precision: string;
    evidence_bindings: EvidenceBinding[];
  };
  routes: ScopedRoute[];
  treatment: AtomicTreatment;
  provenance: {
    event_record_ids: string[];
    treatment_record_ids: string[];
  };
  study_projection_eligible: boolean;
};

type RouteCandidateFixture = {
  candidates: Array<{
    occurrence_id: string;
    route_id: string;
    treatment_kind: string;
    analysis_family: string;
    member_treatment_families: string[];
  }>;
};

type SemanticCorrection = {
  correction_id: string;
  record_id: string;
  guards: { payload: Record<string, unknown> };
  patch: { set: Record<string, unknown> };
  source_decision: string;
};

const summer = {
  eventId: "event_express-bus-service-increases-begin-june-30-2024",
  projectId: "project_summer-2024-express-bus-service-additions",
  treatmentId: "treatment_weekday-express-bus-trip-additions-summer-2024",
  treatmentRelationId: "relation_summer-2024-express-additions-has-weekday-trip-additions",
  timelineRelationId: "relation_summer-2024-express-additions-has-june-30-start",
  decisionId: "express-bus-trip-additions-2024-06-30",
  decisionPath:
    "data/operational-occurrence-review/accepted/decisions/express-bus-trip-additions-2024-06-30.json",
  occurrenceId: "occurrence:8fd87e702db534906b401f11",
  date: "2024-06-30",
  lifecycle: "planned",
  eventEvidenceId: "mta_express_bus_service_increases_june30_2024#p001_b0050",
  deliveredEvidenceId: "meeting_doc_146846#p001_c0005",
} as const;

const fall = {
  eventId: "event_express-bus-schedule-readjustment-effective-2024-09-01",
  projectId: "project_fall-2024-express-bus-trip-readjustment",
  treatmentId: "treatment_weekday-express-bus-trip-discontinuation-fall-2024",
  treatmentRelationId: "relation_fall-2024-express-readjustment-has-weekday-trip-discontinuation",
  timelineRelationId: "relation_fall-2024-express-readjustment-has-september-1-schedule-adjustment",
  decisionId: "express-bus-trip-discontinuation-2024-09-01",
  decisionPath:
    "data/operational-occurrence-review/accepted/decisions/express-bus-trip-discontinuation-2024-09-01.json",
  occurrenceId: "occurrence:1dddfb078a97dd148a4e123d",
  date: "2024-09-01",
  lifecycle: "modified",
  eventEvidenceId: "ny_open_data_mta_bus_schedule_boundaries_2024#p001_b0016",
  deliveredEvidenceId: "meeting_doc_160441#p003_c0004",
} as const;

const expectedGtfsRouteIds = ["BM2", "BM5", "SIM1C", "SIM23", "SIM24", "SIM4C"];
const expectedRouteRecordIds = [
  "route_bm2-brt-south-brooklyn-2017",
  "route_bm5-brt-south-brooklyn-2017",
  "route_sim1c-meeting-doc-138456",
  "route_sim23-madison-ave-cb6-jun2025",
  "route_sim24-madison-ave-cb6-jun2025",
  "route_sim4c-meeting-doc-138456",
];

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as T;
}

function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(join(repoRoot, relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function byRecordId(records: readonly MtaCanonicalRecord[], recordId: string): MtaCanonicalRecord {
  const record = records.find((candidate) => candidate.record_id === recordId);
  if (!record) throw new Error(`missing canonical record ${recordId}`);
  return record;
}

function sortedRouteIds(routes: readonly ScopedRoute[]): string[] {
  return routes.map((route) => route.gtfs_route_id).sort();
}

function sortedRouteRecordIds(routes: readonly ScopedRoute[]): string[] {
  return routes.map((route) => route.route_record_id).sort();
}

function simplifiedBindings(bindings: readonly EvidenceBinding[]): Array<Pick<EvidenceBinding, "role" | "evidence_id">> {
  return bindings.map(({ role, evidence_id }) => ({ role, evidence_id }));
}

describe("paired 2024 express-bus trip additions and discontinuation", () => {
  const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
  const projects = readJsonl<MtaCanonicalRecord>("data/canonical/projects.jsonl");
  const treatments = readJsonl<MtaCanonicalRecord>("data/canonical/treatment_components.jsonl");
  const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");
  const sources = readJsonl<MtaCanonicalRecord>("data/canonical/sources.jsonl");
  const corrections = readJsonl<SemanticCorrection>("data/semantic-corrections/corrections.jsonl");
  const decisions = [
    readJson<AcceptedOccurrenceDecision>(summer.decisionPath),
    readJson<AcceptedOccurrenceDecision>(fall.decisionPath),
  ];
  const projectedOccurrences = readJsonl<ProjectedOccurrence>(
    "data/contract-fixtures/operational-occurrences-v1/operational_occurrences.jsonl",
  );

  it("keeps the planned addition and realized fall modification as distinct evidence-backed graphs", () => {
    const summerEvent = byRecordId(events, summer.eventId);
    expect(summerEvent.payload).toMatchObject({
      lifecycle_phase: summer.lifecycle,
      date_normalized: summer.date,
      date_precision: "day",
    });
    expect(summerEvent.evidence_refs.map((ref) => ref.evidence_id)).toContain(summer.eventEvidenceId);

    const fallEvent = byRecordId(events, fall.eventId);
    expect(fallEvent.payload).toMatchObject({
      lifecycle_phase: fall.lifecycle,
      date_normalized: fall.date,
      date_precision: "day",
    });
    expect(fallEvent.evidence_refs.map((ref) => ref.evidence_id)).toContain(fall.eventEvidenceId);

    expect(summer.projectId).not.toBe(fall.projectId);
    expect(summer.treatmentId).not.toBe(fall.treatmentId);
    const summerProject = byRecordId(projects, summer.projectId);
    expect(summerProject.payload.status).toBe("implemented");
    expect(summerProject.payload.document_time_status).toBe("planned");
    expect(summerProject.source_ids.sort()).toEqual(["meeting_doc_140461", "meeting_doc_146846"]);
    expect(summerProject.record_aliases).toContain("project_meeting-doc-140461-express-bus-additions-2024");
    expect(summerProject.payload._merged_field_values).toMatchObject({
      status: ["planned", "implemented"],
      document_time_status: ["planned", "implemented"],
    });
    expect(byRecordId(projects, fall.projectId).payload.status).toBe("implemented");
    expect(byRecordId(treatments, summer.treatmentId).payload.treatment_family).toBe("service_pattern");
    expect(byRecordId(treatments, fall.treatmentId).payload.treatment_family).toBe("service_pattern");

    const pairedTreatmentRelations = relations
      .filter(
        (relation) =>
          [summer.projectId, fall.projectId].includes(String(relation.payload.subject_id)) &&
          [summer.treatmentId, fall.treatmentId].includes(String(relation.payload.object_id)),
      )
      .map((relation) => [relation.payload.subject_id, relation.payload.object_id]);
    expect(pairedTreatmentRelations).toEqual([
      [fall.projectId, fall.treatmentId],
      [summer.projectId, summer.treatmentId],
    ]);

    const expectedRelations = [
      [summer.treatmentRelationId, summer.projectId, summer.treatmentId, summer.deliveredEvidenceId],
      [summer.timelineRelationId, summer.projectId, summer.eventId, summer.deliveredEvidenceId],
      [fall.treatmentRelationId, fall.projectId, fall.treatmentId, fall.deliveredEvidenceId],
      [fall.timelineRelationId, fall.projectId, fall.eventId, fall.deliveredEvidenceId],
    ] as const;
    for (const [relationId, subjectId, objectId, evidenceId] of expectedRelations) {
      const relation = byRecordId(relations, relationId);
      expect(relation.payload).toMatchObject({
        subject_id: subjectId,
        object_id: objectId,
        assertion_status: "delivered",
      });
      expect(relation.evidence_refs.map((ref) => ref.evidence_id)).toContain(evidenceId);
    }
  });

  it("corrects press/express false positives while preserving each official source class", () => {
    const expected = [
      [
        "source_ny-open-data-mta-bus-schedule-boundaries-2024",
        "dataset_documentation",
        "core-coverage-schedule-query-dataset-authority-tier-20260713",
      ],
      ["source_meeting-doc-138456", "board_material", "core-coverage-meeting-doc-138456-board-authority-tier-20260713"],
      ["source_meeting-doc-146846", "board_material", "core-coverage-meeting-doc-146846-board-authority-tier-20260713"],
      ["source_meeting-doc-160441", "board_material", "core-coverage-meeting-doc-160441-board-authority-tier-20260713"],
      [
        "source_fordham-rd-major-deegan-expwy-boston-rd-jun2021",
        "plan_document",
        "core-coverage-fordham-expressway-presentation-authority-tier-20260713",
      ],
    ] as const;

    for (const [sourceId, authorityTier, correctionId] of expected) {
      expect(byRecordId(sources, sourceId).payload.authority_tier).toBe(authorityTier);
      expect(corrections.find((candidate) => candidate.correction_id === correctionId)).toMatchObject({
        record_id: sourceId,
        guards: { payload: { authority_tier: "press_release" } },
        patch: { set: { authority_tier: authorityTier } },
      });
    }
  });

  it("accepts two atomic realized occurrences over the same six routes without crossing treatments", () => {
    const expectedByDecisionId = new Map([
      [summer.decisionId, summer],
      [fall.decisionId, fall],
    ]);

    for (const decision of decisions) {
      const expected = expectedByDecisionId.get(decision.decision_id);
      if (!expected) throw new Error(`unexpected express-bus decision ${decision.decision_id}`);
      expect(decision).toMatchObject({
        review_state: "approved",
        occurrence_id: expected.occurrenceId,
        founding_key: `event:${expected.eventId}`,
        resolved_status: "realized",
        treatment_scope_kind: "atomic",
        treatment: {
          kind: "atomic",
          member: {
            treatment_record_id: expected.treatmentId,
            treatment_family: "service_pattern",
          },
        },
        resolved_onset: { date: expected.date, precision: "day" },
      });
      expect(sortedRouteIds(decision.routes)).toEqual(expectedGtfsRouteIds);
      expect(sortedRouteRecordIds(decision.routes)).toEqual(expectedRouteRecordIds);
      expect(simplifiedBindings(decision.resolved_onset.evidence_bindings)).toEqual([
        { role: "event_date", evidence_id: expected.eventEvidenceId },
        { role: "timeline_relation", evidence_id: expected.deliveredEvidenceId },
      ]);
      expect(simplifiedBindings(decision.treatment.member.evidence_bindings)).toEqual([
        { role: "treatment_definition", evidence_id: expected.deliveredEvidenceId },
        { role: "treatment_scope", evidence_id: expected.deliveredEvidenceId },
      ]);
    }

    const summerDecision = decisions.find((decision) => decision.decision_id === summer.decisionId)!;
    for (const route of summerDecision.routes) {
      const expectedEvidenceId = ["SIM23", "SIM24"].includes(route.gtfs_route_id)
        ? "meeting_doc_146846#p003_c0004"
        : "meeting_doc_146846#p002_c0013";
      expect(new Set(route.evidence_bindings.map((binding) => binding.evidence_id))).toEqual(
        new Set([expectedEvidenceId]),
      );
      expect(route.evidence_bindings.map((binding) => binding.role).sort()).toEqual([
        "route_identity",
        "route_scope",
      ]);
    }

    const fallDecision = decisions.find((decision) => decision.decision_id === fall.decisionId)!;
    for (const route of fallDecision.routes) {
      expect(new Set(route.evidence_bindings.map((binding) => binding.evidence_id))).toEqual(
        new Set(["meeting_doc_160441#p003_c0005"]),
      );
      expect(route.evidence_bindings.map((binding) => binding.role).sort()).toEqual([
        "route_identity",
        "route_scope",
      ]);
    }
  });

  it("projects exactly those two treatment identities and six route candidates apiece", () => {
    const expectedByOccurrenceId = new Map([
      [summer.occurrenceId, summer],
      [fall.occurrenceId, fall],
    ]);
    const pairedOccurrences = projectedOccurrences.filter((occurrence) =>
      expectedByOccurrenceId.has(occurrence.occurrence_id),
    );
    expect(pairedOccurrences).toHaveLength(2);

    for (const occurrence of pairedOccurrences) {
      const expected = expectedByOccurrenceId.get(occurrence.occurrence_id)!;
      expect(occurrence).toMatchObject({
        occurrence_review_decision_id: expected.decisionId,
        founding_key: `event:${expected.eventId}`,
        review_state: "approved",
        resolved_status: "realized",
        resolved_onset: { date: expected.date, precision: "day" },
        treatment: {
          kind: "atomic",
          member: {
            treatment_record_id: expected.treatmentId,
            treatment_family: "service_pattern",
          },
        },
        provenance: {
          event_record_ids: [expected.eventId],
          treatment_record_ids: [expected.treatmentId],
        },
        study_projection_eligible: true,
      });
      expect(sortedRouteIds(occurrence.routes)).toEqual(expectedGtfsRouteIds);
      expect(sortedRouteRecordIds(occurrence.routes)).toEqual(expectedRouteRecordIds);
    }

    const pairedTreatmentOccurrences = projectedOccurrences.filter(
      (occurrence) =>
        occurrence.treatment.kind === "atomic" &&
        [summer.treatmentId, fall.treatmentId].includes(occurrence.treatment.member.treatment_record_id),
    );
    expect(
      pairedTreatmentOccurrences.map((occurrence) => [
        occurrence.occurrence_id,
        occurrence.treatment.member.treatment_record_id,
      ]),
    ).toEqual([
      [fall.occurrenceId, fall.treatmentId],
      [summer.occurrenceId, summer.treatmentId],
    ]);

    const routeCandidates = readJson<RouteCandidateFixture>(
      "data/contract-fixtures/operational-occurrences-v1/expected_route_candidates.json",
    ).candidates.filter((candidate) => expectedByOccurrenceId.has(candidate.occurrence_id));
    expect(routeCandidates).toHaveLength(12);
    for (const occurrenceId of [summer.occurrenceId, fall.occurrenceId]) {
      const candidates = routeCandidates.filter((candidate) => candidate.occurrence_id === occurrenceId);
      expect(candidates.map((candidate) => candidate.route_id).sort()).toEqual(expectedGtfsRouteIds);
      expect(
        candidates.every(
          (candidate) =>
            candidate.treatment_kind === "atomic" &&
            candidate.analysis_family === "service_pattern" &&
            candidate.member_treatment_families.join(",") === "service_pattern",
        ),
      ).toBe(true);
    }
  });
});
