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

type AtomicOccurrenceDecision = {
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
  routes: Array<{
    route_record_id: string;
    gtfs_route_id: string;
    evidence_bindings: EvidenceBinding[];
  }>;
  treatment_scope_kind: string;
  treatment: {
    kind: string;
    member: {
      treatment_record_id: string;
      treatment_family: string;
      evidence_bindings: EvidenceBinding[];
    };
  };
};

type ProjectedOccurrence = AtomicOccurrenceDecision & {
  occurrence_review_decision_id: string;
  source_ids: string[];
  study_projection_eligible: boolean;
  provenance: {
    anchor_review_decision_ids: string[];
    event_record_ids: string[];
    relation_record_ids: string[];
    route_record_ids: string[];
    treatment_record_ids: string[];
  };
};

type AnchorDecision = {
  decision_id: string;
  review_state: string;
  source_id: string;
  event_record_id: string;
  timeline_relation_record_id: string;
  route_record_id: string;
  route_scope_relation_record_id: string;
  treatment_record_id: string;
  treatment_scope_relation_record_id: string;
  treatment_family: string;
  expected_operational_date: string;
  expected_date_precision: string;
  evidence_bindings: EvidenceBinding[];
};

type SemanticCorrection = {
  correction_id: string;
  record_id: string;
  guards: { payload: Record<string, unknown> };
  patch: { set: Record<string, unknown> };
  source_decision: string;
};

type CoverageQueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: string;
  status: string;
  verdict: string;
  decision_ids: string[];
  resolved_occurrence_ids: string[];
};

const primarySourceId = "tremont_ave_bus_priority_cb6_nov2024";
const primaryEvidenceId = `${primarySourceId}#p026_c0002`;
const eventId = "event_tremont-ace-cameras-operative";
const projectId = "project_ace-automated-camera-enforcement";
const routeId = "route_bx36";
const treatmentId = "treatment_bx36-ace-activation-tremont-avenue";
const occurrenceId = "occurrence:333a3d854315aa8fa6d90e93";
const occurrenceDecisionId = "ace-bx36-activation-2024-06-20";
const anchorDecisionId = "ace-2024-06-20-bx36";
const relationIds = [
  "relation_ace-bx36-activation-affects-bx36",
  "relation_ace-bx36-activation-has-camera-enforcement",
  "relation_ace-bx36-has-june-20-2024-activation",
] as const;

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

describe("ACE Bx36 exact activation lifecycle", () => {
  const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
  const projects = readJsonl<MtaCanonicalRecord>("data/canonical/projects.jsonl");
  const routes = readJsonl<MtaCanonicalRecord>("data/canonical/routes.jsonl");
  const treatments = readJsonl<MtaCanonicalRecord>("data/canonical/treatment_components.jsonl");
  const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");
  const corrections = readJsonl<SemanticCorrection>("data/semantic-corrections/corrections.jsonl");
  const anchor = readJson<AnchorDecision>(
    `data/operational-anchor-review/accepted/decisions/${anchorDecisionId}.json`,
  );
  const occurrence = readJson<AtomicOccurrenceDecision>(
    `data/operational-occurrence-review/accepted/decisions/${occurrenceDecisionId}.json`,
  );
  const projected = readJsonl<ProjectedOccurrence>(
    "data/contract-fixtures/operational-occurrences-v1/operational_occurrences.jsonl",
  );

  it("repairs and reuses the existing exact event while keeping the earlier umbrella event prospective", () => {
    const event = byRecordId(events, eventId);
    expect(event.payload).toMatchObject({
      event_kind: "enforcement activation",
      event_family: "implementation",
      lifecycle_phase: "launched",
      date_text: "6/20/24",
      date_normalized: "2024-06-20",
      date_precision: "day",
      date_text_normalized: {
        raw_text: "6/20/24",
        precision: "unknown",
        confidence: "unparsed",
      },
    });
    expect(event.evidence_refs.map((ref) => ref.evidence_id)).toEqual([primaryEvidenceId]);
    expect(events.filter((candidate) => candidate.evidence_refs.some((ref) => ref.evidence_id === primaryEvidenceId))).toHaveLength(1);
    expect(events.some((candidate) => candidate.record_id === "event_ace-bx36-activation-2024-06-20")).toBe(false);

    expect(byRecordId(events, "event_ace-implementation-may-2024").payload.lifecycle_phase).toBe("planned");
    expect(byRecordId(relations, "relation_ace-has-timeline-event").payload.assertion_status).toBe("planned");

    expect(corrections.find((correction) => correction.correction_id === "core-coverage-ace-bx36-exact-activation-semantics-20260713")).toMatchObject({
      record_id: eventId,
      guards: {
        payload: {
          event_family: "enforcement",
          lifecycle_phase: "other",
          date_precision: "unknown",
        },
      },
      patch: {
        set: {
          event_family: "implementation",
          lifecycle_phase: "launched",
          date_normalized: "2024-06-20",
          date_precision: "day",
        },
      },
      source_decision: "data/quality/acquisition/receipts/ace-bx36-activation-june-20-2024.json",
    });
  });

  it("binds only Bx36 and the source-scoped ACE treatment on delivered relations", () => {
    const route = byRecordId(routes, routeId);
    expect(route.evidence_refs.map((ref) => ref.evidence_id)).toContain(primaryEvidenceId);
    expect(byRecordId(projects, projectId).source_ids).toContain(primarySourceId);

    const treatment = byRecordId(treatments, treatmentId);
    expect(treatment.payload.treatment_family).toBe("automated_bus_lane_enforcement");
    expect(treatment.evidence_refs.map((ref) => ref.evidence_id)).toEqual([primaryEvidenceId]);
    expect(byRecordId(treatments, "treatment_ace-camera-enforcement").payload.treatment_family).toBe("enforcement");

    const expectedObjects = new Map([
      [relationIds[0], routeId],
      [relationIds[1], treatmentId],
      [relationIds[2], eventId],
    ]);
    for (const relationId of relationIds) {
      const relation = byRecordId(relations, relationId);
      expect(relation.payload).toMatchObject({
        subject_id: projectId,
        object_id: expectedObjects.get(relationId),
        assertion_status: "delivered",
        as_of_date: "2024-11-14",
      });
      expect(relation.evidence_refs.map((ref) => ref.evidence_id)).toEqual([primaryEvidenceId]);
    }
  });

  it("approves one atomic Bx36 occurrence without inheriting the fourteen-route program scope", () => {
    expect(anchor).toMatchObject({
      decision_id: anchorDecisionId,
      review_state: "accepted",
      source_id: primarySourceId,
      event_record_id: eventId,
      route_record_id: routeId,
      treatment_record_id: treatmentId,
      treatment_family: "automated_bus_lane_enforcement",
      expected_operational_date: "2024-06-20",
      expected_date_precision: "day",
    });
    expect(new Set(anchor.evidence_bindings.map((binding) => binding.role))).toEqual(
      new Set([
        "event_date",
        "timeline_relation",
        "route_identity",
        "route_scope",
        "treatment_definition",
        "treatment_scope",
        "route_treatment_event_bridge",
      ]),
    );
    expect(new Set(anchor.evidence_bindings.map((binding) => binding.evidence_id))).toEqual(new Set([primaryEvidenceId]));

    expect(occurrence).toMatchObject({
      decision_id: occurrenceDecisionId,
      review_state: "approved",
      occurrence_id: occurrenceId,
      founding_key: `event:${eventId}`,
      resolved_status: "realized",
      resolved_onset: { date: "2024-06-20", precision: "day" },
      routes: [{ route_record_id: routeId, gtfs_route_id: "BX36" }],
      treatment_scope_kind: "atomic",
      treatment: {
        kind: "atomic",
        member: {
          treatment_record_id: treatmentId,
          treatment_family: "automated_bus_lane_enforcement",
        },
      },
    });
    expect(occurrence.routes).toHaveLength(1);

    const row = projected.find((candidate) => candidate.occurrence_id === occurrenceId);
    expect(row).toMatchObject({
      occurrence_review_decision_id: occurrenceDecisionId,
      source_ids: [primarySourceId],
      routes: [{ route_record_id: routeId, gtfs_route_id: "BX36" }],
      treatment: {
        kind: "atomic",
        member: {
          treatment_record_id: treatmentId,
          treatment_family: "automated_bus_lane_enforcement",
        },
      },
      provenance: {
        event_record_ids: [eventId],
        route_record_ids: [routeId],
        treatment_record_ids: [treatmentId],
      },
      study_projection_eligible: true,
    });
  });

  it("terminalizes the three umbrella-plan gaps and the two superseded raw diagnostics", () => {
    const queue = readJsonl<CoverageQueueRow>("data/quality/operational-coverage/priority-queue.jsonl");
    const expected = new Map([
      ["operational-coverage:1db065afb47b01f0b0a49326", "ace-may-2024-plan-delivered-status-not-applicable"],
      ["operational-coverage:440b7cf7f31e0f8fe9e327ac", "ace-may-2024-plan-route-scope-not-applicable"],
      ["operational-coverage:55e22e05e9994a18d9ef8bc4", "ace-may-2024-plan-treatment-scope-not-applicable"],
      ["operational-coverage:94e0a8841a4f2040b93043e0", "ace-bx36-raw-project-route-diagnostic-superseded"],
      ["operational-coverage:eeeb82fb604526ec426037c5", "ace-bx36-raw-project-treatment-diagnostic-superseded"],
    ]);
    for (const [gapId, decisionId] of expected) {
      expect(queue.find((row) => row.gap_id === gapId)).toMatchObject({
        status: "terminal",
        verdict: "not_applicable",
        decision_ids: [decisionId],
      });
      expect(
        readJson<{ gap_id: string; verdict: string }>(
          `data/operational-anchor-review/ledger-decisions/decisions/${decisionId}.json`,
        ),
      ).toMatchObject({ gap_id: gapId, verdict: "not_applicable" });
    }

    const receipt = readJson<{
      scope: { occurrence_id: string; route_record_id: string; treatment_record_id: string };
      identity_adjudication: { disposition: string; reused_event_record_id: string };
      official_corroboration: Array<{ source_id: string }>;
    }>("data/quality/acquisition/receipts/ace-bx36-activation-june-20-2024.json");
    expect(receipt.scope).toEqual({
      project_record_id: projectId,
      event_record_id: eventId,
      route_record_id: routeId,
      gtfs_route_id: "BX36",
      treatment_record_id: treatmentId,
      occurrence_id: occurrenceId,
    });
    expect(receipt.identity_adjudication).toMatchObject({
      disposition: "reuse_existing_event",
      reused_event_record_id: eventId,
    });
    expect(receipt.official_corroboration.map((entry) => entry.source_id)).toContain(
      "tremont_ave_bus_priority_cb6_feb2025",
    );
  });
});
