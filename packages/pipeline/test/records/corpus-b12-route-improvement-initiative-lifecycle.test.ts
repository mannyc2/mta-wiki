import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";

type SourceBlock = {
  block_id: string;
  page_number: number;
  raw_text: string;
  raw_text_sha256: string;
};

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
  observation_event_record_ids: string[];
  observation_relation_record_ids: string[];
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

type CoverageQueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: string;
  status: string;
  verdict: string;
  decision_ids: string[];
  resolved_occurrence_ids: string[];
};

const sourceId = "meeting_doc_143341";
const eventId = "event_route-improvement-initiative-start";
const projectId = "project_dob-route-improvement-initiative";
const routeId = "route_b12-ace";
const treatmentId = "treatment_b12-deliberate-proactive-service-management";
const timelineRelationId = "relation_rii-has-timeline-event-launch";
const routeRelationId = "relation_rii-serves-b12";
const treatmentRelationId = "relation_rii-b12-has-deliberate-proactive-service-management";
const anchorDecisionId = "b12-route-improvement-initiative-2024-01";
const occurrenceDecisionId = "b12-route-improvement-initiative-start-2024-01";
const occurrenceId = "occurrence:5110ac089234f4641e170f5e";

const blockPins = new Map([
  ["p003_c0005", {
    sha256: "sha256:d4f212c84e28586aaa5c1efdf39ad1bd2e9bceefe59f3c41a65a8eb24a5ef308",
    literals: ["improving service on the B12", "DOB's Route Improvement Initiative"],
  }],
  ["p003_c0006", {
    sha256: "sha256:e87e796834a61be41b21c38fbf6927232956bc72fc86b3270db2fe4fbb99a8da",
    literals: ["Since the program's inception in January 2024", "service delivery on the B12 has improved"],
  }],
  ["p003_c0007", {
    sha256: "sha256:d0b1bda9e8de2057087c8ee8d95f01c7b7088e4c55757309ee79dbbead030441",
    literals: ["Deliberate and proactive service management, from the road to Bus Command"],
  }],
  ["p003_c0011", {
    sha256: "sha256:70c9b0ecb1b5799d9ed3a74181d6dac9d5039c044bc900136a8a0c0f87b1ee30",
    literals: ["managing meal reliefs", "regulating departures"],
  }],
  ["p004_c0011", {
    sha256: "sha256:1c29eca33f75f2e5d6dda24095e2605d4b4787abf300943c611a099e502ce9ca",
    literals: ["reducing bunching", "schedule adherence"],
  }],
] as const);

const artifactHashes = {
  "metadata.json": "feccd263adc23b6ffe733936c178c25615f2cfa8d47fda17da6abef9b7409ac2",
  "source.pdf": "1695a37fe9c8aa7990bc0c52db0ffbe600e90e828a2aa12f8fe58559d07a24d5",
  "blocks.jsonl": "c9fec17bd49d215cb61d46f046e3514dd7405e4cc1bc6ff225bf5451c769be71",
} as const;

const generatedArtifactPaths = [
  `data/operational-anchor-review/accepted/decisions/${anchorDecisionId}.json`,
  `data/operational-occurrence-review/accepted/decisions/${occurrenceDecisionId}.json`,
  "data/operational-anchor-review/ledger-decisions/decisions/b12-rii-raw-route-diagnostic-superseded.json",
  "data/operational-anchor-review/ledger-decisions/decisions/b12-rii-platform-barrier-contamination-superseded.json",
] as const;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

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

function evidenceIds(record: MtaCanonicalRecord): string[] {
  return record.evidence_refs.map((ref) => ref.evidence_id).sort();
}

const generatedArtifactsReady =
  readJsonl<MtaCanonicalRecord>("data/canonical/treatment_components.jsonl")
    .some((record) => record.record_id === treatmentId) &&
  generatedArtifactPaths.every((path) => existsSync(join(repoRoot, path)));

describe("B12 Route Improvement Initiative source and existing graph", () => {
  it("pins the official page-3/page-4 evidence and excludes the page-5 subway story", () => {
    for (const [filename, expected] of Object.entries(artifactHashes)) {
      expect(sha256(readFileSync(join(repoRoot, "raw/sources", sourceId, filename)))).toBe(expected);
    }
    const blocks = new Map(
      readJsonl<SourceBlock>(`raw/sources/${sourceId}/blocks.jsonl`).map((block) => [block.block_id, block]),
    );
    for (const [blockId, pin] of blockPins) {
      const block = blocks.get(blockId);
      expect(block?.raw_text_sha256).toBe(pin.sha256);
      for (const literal of pin.literals) expect(block?.raw_text).toContain(literal);
      expect(block?.page_number).toBe(blockId === "p004_c0011" ? 4 : 3);
    }
    expect([...blockPins.keys()].some((blockId) => blockId.startsWith("p005_"))).toBe(false);
  });

  it("reuses the exact launched event, B12 route, and delivered timeline/route relations", () => {
    const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
    const projects = readJsonl<MtaCanonicalRecord>("data/canonical/projects.jsonl");
    const routes = readJsonl<MtaCanonicalRecord>("data/canonical/routes.jsonl");
    const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");

    expect(byRecordId(events, eventId).payload).toMatchObject({
      event_family: "launch",
      lifecycle_phase: "launched",
      date_text: "January 2024",
      date_normalized: "2024-01",
      date_precision: "month",
    });
    expect(evidenceIds(byRecordId(events, eventId))).toContain(`${sourceId}#p003_c0006`);
    expect(byRecordId(projects, projectId).source_ids).toContain(sourceId);
    expect(byRecordId(routes, routeId).payload.route_id).toBe("B12");
    expect(evidenceIds(byRecordId(routes, routeId))).toEqual(
      expect.arrayContaining([`${sourceId}#p003_c0005`, `${sourceId}#p003_c0006`]),
    );

    expect(byRecordId(relations, timelineRelationId).payload).toMatchObject({
      relation_kind: "has_timeline_event",
      subject_id: projectId,
      object_id: eventId,
      assertion_status: "delivered",
      as_of_date: "2024-06",
    });
    expect(byRecordId(relations, routeRelationId).payload).toMatchObject({
      relation_kind: "serves_route",
      subject_id: projectId,
      object_id: routeId,
      assertion_status: "delivered",
      as_of_date: "2024-06",
    });
  });
});

describe("B12 Route Improvement Initiative integrated lifecycle", () => {
  if (!generatedArtifactsReady) {
    it.skip("awaits application, materialization, promotion, and projection of the prepared B12 artifacts", () => {});
    return;
  }

  it("materializes one exact service-management treatment and delivered treatment relation", () => {
    const treatments = readJsonl<MtaCanonicalRecord>("data/canonical/treatment_components.jsonl");
    const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");
    const treatment = byRecordId(treatments, treatmentId);
    expect(treatment.payload).toMatchObject({
      treatment_kind: "Route Improvement Initiative service-management program",
      treatment_family: "service_pattern",
    });
    expect(treatment.payload.description).toContain("does not state that every enumerated tactic began");
    expect(evidenceIds(treatment)).toEqual([
      `${sourceId}#p003_c0007`,
      `${sourceId}#p003_c0011`,
      `${sourceId}#p004_c0011`,
    ]);
    expect(treatment.evidence_refs.some((ref) => ref.block_id.startsWith("p005_"))).toBe(false);

    const relation = byRecordId(relations, treatmentRelationId);
    expect(relation.payload).toMatchObject({
      relation_kind: "has_treatment",
      relation_family: "treatment_context",
      subject_id: projectId,
      object_id: treatmentId,
      assertion_status: "delivered",
      as_of_date: "2024-06",
    });
    expect(evidenceIds(relation)).toEqual([
      `${sourceId}#p003_c0007`,
      `${sourceId}#p003_c0011`,
      `${sourceId}#p004_c0011`,
    ]);
    expect(relation.payload.description).toContain("does not assign each tactic");
    expect(readJson<{
      temporal_adjudication: {
        onset_applies_to: string;
        component_onset_disposition: string;
        prohibited_inference: string;
      };
    }>("data/quality/acquisition/receipts/b12-route-improvement-initiative-january-2024.json"))
      .toMatchObject({
        temporal_adjudication: {
          onset_applies_to: expect.stringContaining("program-level"),
          component_onset_disposition: expect.stringContaining("Unknown"),
          prohibited_inference: expect.stringContaining("Do not project"),
        },
      });
  });

  it("approves one atomic B12 occurrence without platform-barrier contamination", () => {
    const anchor = readJson<AnchorDecision>(generatedArtifactPaths[0]);
    const occurrence = readJson<AtomicOccurrenceDecision>(generatedArtifactPaths[1]);
    const projected = readJsonl<ProjectedOccurrence>(
      "data/contract-fixtures/operational-occurrences-v1/operational_occurrences.jsonl",
    );

    expect(anchor).toMatchObject({
      decision_id: anchorDecisionId,
      review_state: "accepted",
      source_id: sourceId,
      event_record_id: eventId,
      timeline_relation_record_id: timelineRelationId,
      route_record_id: routeId,
      route_scope_relation_record_id: routeRelationId,
      treatment_record_id: treatmentId,
      treatment_scope_relation_record_id: treatmentRelationId,
      treatment_family: "service_pattern",
      expected_operational_date: "2024-01",
      expected_date_precision: "month",
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
    expect(new Set(anchor.evidence_bindings.map((binding) => binding.evidence_id))).toEqual(
      new Set([`${sourceId}#p003_c0005`, `${sourceId}#p003_c0006`, `${sourceId}#p003_c0007`]),
    );
    expect(anchor.evidence_bindings
      .filter((binding) => binding.role === "route_treatment_event_bridge")
      .map((binding) => binding.record_id))
      .toEqual([projectId, eventId, treatmentId]);

    expect(occurrence).toMatchObject({
      decision_id: occurrenceDecisionId,
      review_state: "approved",
      occurrence_id: occurrenceId,
      founding_key: `event:${eventId}`,
      observation_event_record_ids: [eventId],
      resolved_status: "realized",
      resolved_onset: { date: "2024-01", precision: "month" },
      routes: [{ route_record_id: routeId, gtfs_route_id: "B12" }],
      treatment_scope_kind: "atomic",
      treatment: {
        kind: "atomic",
        member: { treatment_record_id: treatmentId, treatment_family: "service_pattern" },
      },
    });
    expect(occurrence.routes).toHaveLength(1);
    expect(occurrence.observation_relation_record_ids).toEqual(
      [timelineRelationId, routeRelationId, treatmentRelationId].sort(),
    );

    const row = projected.find((candidate) => candidate.occurrence_id === occurrenceId);
    expect(row).toMatchObject({
      occurrence_review_decision_id: occurrenceDecisionId,
      source_ids: [sourceId],
      routes: [{ route_record_id: routeId, gtfs_route_id: "B12" }],
      treatment: {
        kind: "atomic",
        member: { treatment_record_id: treatmentId, treatment_family: "service_pattern" },
      },
      provenance: {
        event_record_ids: [eventId],
        route_record_ids: [routeId],
        treatment_record_ids: [treatmentId],
      },
      study_projection_eligible: true,
    });
    expect(row?.provenance.treatment_record_ids).not.toContain("treatment_platform-safety-barriers");
    expect(row?.evidence_bindings.some((binding) => binding.evidence_id.includes("#p005_"))).toBe(false);
  });

  it("terminalizes the raw route diagnostic and contaminated treatment diagnostic", () => {
    const queue = readJsonl<CoverageQueueRow>("data/quality/operational-coverage/priority-queue.jsonl");
    const expected = new Map([
      ["operational-coverage:260343c95fe8f8701ac4659f", "b12-rii-raw-route-diagnostic-superseded"],
      ["operational-coverage:96d717ecb3ff4b31a32730d2", "b12-rii-platform-barrier-contamination-superseded"],
    ]);
    for (const [gapId, decisionId] of expected) {
      expect(queue.find((row) => row.gap_id === gapId)).toMatchObject({
        event_record_id: eventId,
        status: "terminal",
        verdict: "not_applicable",
        decision_ids: [decisionId],
        resolved_occurrence_ids: [occurrenceId],
      });
      expect(
        readJson<{ gap_id: string; verdict: string }>(
          `data/operational-anchor-review/ledger-decisions/decisions/${decisionId}.json`,
        ),
      ).toMatchObject({ gap_id: gapId, verdict: "not_applicable" });
    }
  });
});
