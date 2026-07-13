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
  schema_version: number;
  decision_id: string;
  review_state: string;
  accepted_at: string;
  reviewer: string;
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
  source_ids: string[];
  exclusion_reasons: string[];
  provenance: {
    anchor_review_decision_ids: string[];
    event_record_ids: string[];
    relation_record_ids: string[];
    route_record_ids: string[];
    treatment_record_ids: string[];
  };
  study_projection_eligible: boolean;
};

type OccurrenceIdentity = {
  schema_version: number;
  occurrence_id: string;
  founding_key: string;
  founding_event_record_ids: string[];
  resolution_cluster_id: string | null;
  aliases: string[];
  tombstoned: boolean;
  decision_id: string | null;
  issued_at: string;
};

type ReviewSnapshot<T> = {
  decisions: T[];
};

type OccurrenceSnapshotDecision = AcceptedOccurrenceDecision & {
  anchor_review_decision_ids: string[];
};

type AnchorSnapshotDecision = {
  decision_id: string;
  event_record_id: string;
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

type CoverageQueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: string;
  status: string;
  verdict: string;
  decision_ids: string[];
  resolved_occurrence_ids: string[];
};

type CoverageDecision = {
  decision_id: string;
  gap_id: string;
  verdict: string;
};

type SemanticCorrection = {
  correction_id: string;
  op: string;
  record_id: string;
  patch: {
    set?: Record<string, unknown>;
    survivor_record_id?: string;
  };
  source_decision: string;
};

type AcquisitionReceipt = {
  scope: {
    umbrella_project_record_id: string;
    bounded_project_record_id: string;
    installation_start_event_record_id: string;
    installation_completion_event_record_id: string;
    treatment_record_id: string;
    route_record_ids: string[];
    gtfs_route_ids: string[];
  };
  temporal_adjudication: {
    installation_start_date_normalized: string;
    installation_start_date_precision: string;
    installation_start_lifecycle_phase: string;
    exact_physical_start_date: null;
    exact_operational_activation_date: null;
    installation_completion_date_normalized: string;
    installation_completion_date_precision: string;
    installation_completion_event_disposition: string;
  };
  route_scope_adjudication: {
    scope_kind: string;
    route_count: number;
  };
  treatment_adjudication: {
    scope_kind: string;
    treatment_family: string;
    location: string;
    excluded_from_occurrence: string[];
  };
  reproducibility: {
    semantic_correction_ids: string[];
    promotion_script: string;
    focused_test: string;
  };
};

const startSourceId = "nyc_dot_flatbush_installation_begins_2025";
const retrospectiveSourceId = "flatbush_ave_bus_priority_mtp_briefing_apr2026";
const umbrellaProjectId = "project_flatbush-avenue-bus-priority-brooklyn";
const phaseProjectId = "project_flatbush-phase1-center-running-bus-lanes-livingston-state";
const startEventId = "event_flatbush-phase1-installation-start-sep2025";
const completionEventId = "event_flatbush-av-phase1-installed-fall2025";
const treatmentId = "treatment_flatbush-phase1-center-running-bus-lanes-livingston-state";
const b41RouteId = "route_b41-ace";
const b67RouteId = "route_b67-flatbush-ave-apr2026";
const decisionId = "flatbush-phase1-center-running-bus-lanes-2025-09";
const occurrenceId = "occurrence:8c987704152b459014217d44";
const foundingKey = `event:${startEventId}`;
const receiptPath = "data/quality/acquisition/receipts/flatbush-phase1-center-running-bus-lanes-september-2025.json";
const decisionPath = `data/operational-occurrence-review/accepted/decisions/${decisionId}.json`;

const relationIds = {
  start: "relation_flatbush-phase1-has-start-event-sep2025",
  completion: "relation_flatbush-phase1-has-completion-event-fall2025",
  b41: "relation_flatbush-phase1-serves-b41",
  b67: "relation_flatbush-phase1-serves-b67",
  treatment: "relation_flatbush-phase1-has-center-running-bus-lanes",
  hierarchy: "relation_flatbush-phase1-part-of-flatbush-bus-priority",
} as const;

const sourcePins = [
  {
    sourceId: startSourceId,
    artifacts: {
      "metadata.json": "03f92386d2e6de2facff88444745e2e278ea235cdfdab28c31c4935e3a7257f3",
      "source.html": "42e3fce8811426b7d9e25aa0006410cdd8cfa3cd5acd0802e5801e778cc4ceef",
      "text.txt": "c88793d2b7ccef96fa2ab65d054d87f44636a949ebca545d1c1a397856a68af0",
      "blocks.jsonl": "2812da6393c39a0c16dc4123730c2875a2f468d98e6cbb75bd4141966e0d303b",
    },
    blocks: [
      ["p001_b0010", 1, "sha256:4fef80e1db0fa85209905b3c4a19a99c88d1a6daee024e17f8756ace80490109", ["September 25, 2025"]],
      ["p001_b0016", 1, "sha256:7c79ef32ed8ded041b89c331891e98770b5a811e6220ce1f756c75cf6c833273", ["work will start this week", "center-running bus lanes"]],
      ["p001_b0019", 1, "sha256:30013ba6828a02a6e555ca70f1e04b4ea1a417a91797600a3df13fb8e2b3180a", ["between Livingston Street and State Street", "remaining work to be completed next year"]],
      ["p001_b0021", 1, "sha256:b1dba41e356e7d7c3c9b1c3de4a953e710a554b1445cd38d292406e96eada3ac", ["B41", "serves nearly the entire eight-mile Flatbush Avenue corridor"]],
      ["p001_b0030", 1, "sha256:9dd1c4270b6411aa26140a6c4d1912c4e24960c57b24b8a987f8a363a2a4ee7c", ["first two blocks of bus lanes", "should be completed within two weeks"]],
    ],
  },
  {
    sourceId: retrospectiveSourceId,
    artifacts: {
      "metadata.json": "7de89144dcb896ad64ae3b14f29df6d8ae4fe29ca530ebfa8615cfd2f1d456a7",
      "source.pdf": "1041b579d5a32ed1be7bb247a0ead5384d7d67119a88adab4f985e9fd93ae5f6",
      "blocks.jsonl": "4a13c7a218c0f16f7ceb483a1117a5703caaee83c64b8e6b315d32a3312072b6",
    },
    blocks: [
      ["p004_c0002", 4, "sha256:04e364443480c8b2cda313fd5461a4e0c68f70b891b2d9d39735d13513839e29", ["split implementation of the design into two phases", "Last fall, DOT installed center-running bus lanes between Livingston St and State St"]],
      ["p012_c0003", 12, "sha256:a09c92b214644314aa222043296bc4de95d621c270347d9c1800af0f664410aa", ["B41 and B67 buses traveling straight in the bus lanes along Flatbush Av"]],
    ],
  },
] as const;

const foldClusters = [
  {
    eventId: "event_flatbush-av-bus-lanes-open-late-fall2026",
    relationId: "relation_project-has-event-bus-lanes-open",
    date: "2026-fall",
    precision: "season",
    sourceIds: [
      "flatbush_ave_bus_priority_cb6_oct2025",
      "flatbush_ave_bus_priority_cb8_oct2025",
      retrospectiveSourceId,
      "flatbush_ave_bus_priority_sept2025",
    ],
    duplicateEventIds: [
      "event_bus-lanes-open-late-fall-2026",
      "event_bus-lanes-open-late-fall2026",
      "event_bus-lanes-open-late-fall2026_2",
    ],
    duplicateRelationIds: [
      "relation_rel-project-has-event-latefall2026-open",
      "relation_project-timeline-bus-lanes-open",
      "relation_project-timeline-bus-lanes-open-2026",
    ],
  },
  {
    eventId: "event_goal-implement-2025",
    relationId: "relation_project-has-timeline-implement-2025",
    date: "2025",
    precision: "year",
    sourceIds: ["flatbush_ave_cb2_jun2025", "flatbush_ave_cb6_jun2025", "flatbush_ave_cb8_jun2025"],
    duplicateEventIds: ["event_flatbush-goal-implement-2025", "event_implementation-goal-2025-flatbush"],
    duplicateRelationIds: [
      "relation_project-event-implement-2025",
      "relation_project-has-timeline-event-implementation-2025",
    ],
  },
  {
    eventId: "event_proposed-implementation-spring-summer2025",
    relationId: "relation_project-has-timeline-event-implementation_5",
    date: "2025-summer",
    precision: "season",
    sourceIds: ["flatbush_ave_cab2_jun2024", "flatbush_ave_cb2_jun2024", "flatbush_ave_cb6_jun2024"],
    duplicateEventIds: [
      "event_proposed-implementation-spring-summer2025_2",
      "event_spring-summer2025-proposed-implementation",
    ],
    duplicateRelationIds: [
      "relation_project-has-implementation-2025",
      "relation_project-has-timeline-spring-summer2025",
    ],
  },
] as const;

const markingsEventId = "event_install-bus-lane-markings-fall2025_2";

const expectedCorrectionIds = [
  "core-coverage-flatbush-01-phase1-september-start-realized-20260713",
  "core-coverage-flatbush-02-phase1-project-resolved-status-20260713",
  "core-coverage-flatbush-03-phase1-completion-relation-delivered-20260713",
  "core-coverage-flatbush-04-mtp-source-publisher-20260713",
  "core-coverage-flatbush-10-latefall2026-cb6-event-fold-20260713",
  "core-coverage-flatbush-11-latefall2026-cb8-event-fold-20260713",
  "core-coverage-flatbush-12-latefall2026-september-event-fold-20260713",
  "core-coverage-flatbush-13-latefall2026-cb6-relation-fold-20260713",
  "core-coverage-flatbush-14-latefall2026-cb8-relation-fold-20260713",
  "core-coverage-flatbush-15-latefall2026-september-relation-fold-20260713",
  "core-coverage-flatbush-16-latefall2026-survivor-planned-20260713",
  "core-coverage-flatbush-20-goal2025-cb6-event-fold-20260713",
  "core-coverage-flatbush-21-goal2025-cb8-event-fold-20260713",
  "core-coverage-flatbush-22-goal2025-cb6-relation-fold-20260713",
  "core-coverage-flatbush-23-goal2025-cb8-relation-fold-20260713",
  "core-coverage-flatbush-24-goal2025-survivor-planned-20260713",
  "core-coverage-flatbush-30-spring-summer2025-cb6-event-fold-20260713",
  "core-coverage-flatbush-31-spring-summer2025-cab-event-fold-20260713",
  "core-coverage-flatbush-32-spring-summer2025-cb6-relation-fold-20260713",
  "core-coverage-flatbush-33-spring-summer2025-cab-relation-fold-20260713",
  "core-coverage-flatbush-34-spring-summer2025-survivor-planned-20260713",
  "core-coverage-flatbush-40-fall2025-markings-forecast-planned-20260713",
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
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function byRecordId(records: readonly MtaCanonicalRecord[], recordId: string): MtaCanonicalRecord {
  const record = records.find((candidate) => candidate.record_id === recordId);
  if (!record) throw new Error(`missing canonical record ${recordId}`);
  return record;
}

function evidenceIds(record: MtaCanonicalRecord): string[] {
  return record.evidence_refs.map((ref) => ref.evidence_id);
}

function sortedRoutePairs(routes: readonly ScopedRoute[]): Array<[string, string]> {
  return routes
    .map((route) => [route.route_record_id, route.gtfs_route_id] as [string, string])
    .sort(([left], [right]) => left.localeCompare(right));
}

function simplifiedBindings(bindings: readonly EvidenceBinding[]): Array<Pick<EvidenceBinding, "role" | "record_id" | "evidence_id">> {
  return bindings.map(({ role, record_id, evidence_id }) => ({ role, record_id, evidence_id }));
}

describe("Flatbush Phase 1 September 2025 source and canonical lifecycle", () => {
  it("pins both official source captures and the bounded start, completion, route, and treatment blocks", () => {
    for (const sourcePin of sourcePins) {
      const sourceRoot = join(repoRoot, "raw/sources", sourcePin.sourceId);
      for (const [filename, expectedHash] of Object.entries(sourcePin.artifacts)) {
        expect(sha256(readFileSync(join(sourceRoot, filename)))).toBe(expectedHash);
      }

      const blocks = new Map(
        readJsonl<SourceBlock>(`raw/sources/${sourcePin.sourceId}/blocks.jsonl`)
          .map((block) => [block.block_id, block]),
      );
      for (const [blockId, pageNumber, blockHash, literals] of sourcePin.blocks) {
        const block = blocks.get(blockId);
        expect(block?.page_number).toBe(pageNumber);
        expect(block?.raw_text_sha256).toBe(blockHash);
        for (const literal of literals) expect(block?.raw_text).toContain(literal);
      }
    }
  });

  it("keeps the publication day separate from the month-level realized installation start and Fall completion", () => {
    const sources = readJsonl<MtaCanonicalRecord>("data/canonical/sources.jsonl");
    const projects = readJsonl<MtaCanonicalRecord>("data/canonical/projects.jsonl");
    const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
    const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");

    expect(byRecordId(sources, "source_nyc-dot-flatbush-installation-begins-2025").payload).toMatchObject({
      authority_tier: "press_release",
      date_text: "September 25, 2025",
      published_date_normalized: "2025-09-25",
      published_date_precision: "day",
    });
    expect(byRecordId(sources, "source_flatbush-ave-bus-priority-mtp-briefing-apr2026").payload).toMatchObject({
      publisher: "NYC DOT",
      authority_tier: "board_material",
      source_url: "https://www.nyc.gov/html/dot/downloads/pdf/flatbush-ave-bus-priority-mtp-briefing-apr2026.pdf",
      published_date_normalized: "2026-04",
      published_date_precision: "month",
    });

    const phaseProject = byRecordId(projects, phaseProjectId);
    expect(phaseProject.payload).toMatchObject({
      project_name: "Flatbush Avenue Phase 1 Center-Running Bus Lanes",
      project_family: "bus_priority",
      project_type: "center-running bus lanes",
      status: "implemented",
      document_time_status: "planned",
      geography: "Flatbush Avenue between Livingston Street and State Street",
    });
    expect(phaseProject.source_ids).toEqual([startSourceId]);
    expect(phaseProject.record_aliases).toContain("project_flatbush-ave-phase-1-center-running-bus-lanes");
    expect(phaseProject.record_id).not.toBe(umbrellaProjectId);

    const start = byRecordId(events, startEventId);
    expect(start.payload).toMatchObject({
      event_kind: "installation start",
      event_family: "implementation",
      lifecycle_phase: "installed",
      date_text: "September 2025",
      date_normalized: "2025-09",
      date_precision: "month",
      date_text_normalized: {
        raw_text: "September 2025",
        normalized_date: "2025-09",
        precision: "month",
      },
    });
    expect(evidenceIds(start)).toEqual([
      `${startSourceId}#p001_b0010`,
      `${startSourceId}#p001_b0016`,
      `${startSourceId}#p001_b0019`,
    ]);

    const completion = byRecordId(events, completionEventId);
    expect(completion.payload).toMatchObject({
      event_kind: "installation",
      event_family: "implementation",
      lifecycle_phase: "installed",
      date_text: "Fall 2025",
      date_normalized: "2025-fall",
      date_precision: "season",
    });
    expect(evidenceIds(completion)).toEqual([`${retrospectiveSourceId}#p004_c0002`]);
    expect(completion.record_id).not.toBe(start.record_id);
    expect(start.record_aliases ?? []).not.toContain(completionEventId);

    expect(byRecordId(relations, "relation_project-has-event-phase1-installed").payload).toMatchObject({
      subject_id: umbrellaProjectId,
      object_id: completionEventId,
      assertion_status: "delivered",
    });
  });

  it("binds only B41, B67, and one atomic two-block bus-lane treatment to the bounded phase project", () => {
    const routes = readJsonl<MtaCanonicalRecord>("data/canonical/routes.jsonl");
    const treatments = readJsonl<MtaCanonicalRecord>("data/canonical/treatment_components.jsonl");
    const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");

    expect(byRecordId(routes, b41RouteId).payload.route_id).toBe("B41");
    expect(byRecordId(routes, b67RouteId).payload.route_id).toBe("B67");

    const treatment = byRecordId(treatments, treatmentId);
    expect(treatment.payload).toMatchObject({
      treatment_kind: "center-running bus lanes",
      treatment_family: "bus_lane",
      location_text: "Flatbush Avenue between Livingston Street and State Street",
      date_text: "September 2025",
    });
    expect(String(treatment.payload.description)).toContain("excludes the later State Street-to-Grand Army Plaza treatment bundle");
    expect(evidenceIds(treatment)).toEqual([`${startSourceId}#p001_b0019`]);

    const scopedKinds = new Set(["has_timeline_event", "serves_route", "has_treatment", "part_of_program"]);
    const scopedRelations = relations.filter(
      (relation) => relation.payload.subject_id === phaseProjectId && scopedKinds.has(String(relation.payload.relation_kind)),
    );
    expect(scopedRelations.map((relation) => relation.record_id).sort()).toEqual(
      Object.values(relationIds).sort(),
    );
    expect(scopedRelations.every((relation) => relation.payload.assertion_status === "delivered")).toBe(true);

    expect(byRecordId(relations, relationIds.start).payload.object_id).toBe(startEventId);
    expect(byRecordId(relations, relationIds.completion).payload.object_id).toBe(completionEventId);
    expect(byRecordId(relations, relationIds.hierarchy).payload.object_id).toBe(umbrellaProjectId);

    const routeRelations = scopedRelations.filter((relation) => relation.payload.relation_kind === "serves_route");
    expect(routeRelations.map((relation) => relation.payload.object_id).sort()).toEqual([b41RouteId, b67RouteId].sort());
    for (const relation of routeRelations) {
      expect(new Set(evidenceIds(relation))).toEqual(new Set([
        `${retrospectiveSourceId}#p004_c0002`,
        `${retrospectiveSourceId}#p012_c0003`,
      ]));
    }

    const treatmentRelations = scopedRelations.filter((relation) => relation.payload.relation_kind === "has_treatment");
    expect(treatmentRelations.map((relation) => relation.payload.object_id)).toEqual([treatmentId]);
    expect(evidenceIds(treatmentRelations[0]!)).toEqual([`${retrospectiveSourceId}#p004_c0002`]);
  });

  it("folds duplicate planning observations with provenance while retaining planned forecast survivors", () => {
    const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
    const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");

    for (const fold of foldClusters) {
      const event = byRecordId(events, fold.eventId);
      expect(event.payload).toMatchObject({
        lifecycle_phase: "planned",
        date_normalized: fold.date,
        date_precision: fold.precision,
      });
      expect([...event.source_ids].sort()).toEqual([...fold.sourceIds].sort());
      expect(new Set(event.evidence_refs.map((ref) => ref.source_id))).toEqual(new Set(fold.sourceIds));

      const relation = byRecordId(relations, fold.relationId);
      expect(relation.payload).toMatchObject({
        subject_id: umbrellaProjectId,
        object_id: fold.eventId,
        assertion_status: "planned",
      });
      expect([...relation.source_ids].sort()).toEqual([...fold.sourceIds].sort());
      expect(new Set(relation.evidence_refs.map((ref) => ref.source_id))).toEqual(new Set(fold.sourceIds));

      for (const duplicateId of fold.duplicateEventIds) {
        expect(events.some((candidate) => candidate.record_id === duplicateId)).toBe(false);
      }
      for (const duplicateId of fold.duplicateRelationIds) {
        expect(relations.some((candidate) => candidate.record_id === duplicateId)).toBe(false);
      }
    }

    expect(byRecordId(events, markingsEventId).payload).toMatchObject({
      lifecycle_phase: "planned",
      date_text: "Fall 2025",
      date_normalized: "2025-fall",
      date_precision: "season",
    });
  });

  it("pins the temporal, duplicate-fold, and Phase 2 exclusion adjudication", () => {
    const receipt = readJson<AcquisitionReceipt>(receiptPath);
    expect(receipt.scope).toEqual({
      umbrella_project_record_id: umbrellaProjectId,
      bounded_project_record_id: phaseProjectId,
      installation_start_event_record_id: startEventId,
      installation_completion_event_record_id: completionEventId,
      treatment_record_id: treatmentId,
      route_record_ids: [b41RouteId, b67RouteId],
      gtfs_route_ids: ["B41", "B67"],
    });
    expect(receipt.temporal_adjudication).toMatchObject({
      installation_start_date_normalized: "2025-09",
      installation_start_date_precision: "month",
      installation_start_lifecycle_phase: "installed",
      exact_physical_start_date: null,
      exact_operational_activation_date: null,
      installation_completion_date_normalized: "2025-fall",
      installation_completion_date_precision: "season",
    });
    expect(receipt.temporal_adjudication.installation_completion_event_disposition).toContain("separate canonical event");
    expect(receipt.route_scope_adjudication).toMatchObject({ scope_kind: "explicit_bounded_multiroute", route_count: 2 });
    expect(receipt.treatment_adjudication).toMatchObject({
      scope_kind: "atomic",
      treatment_family: "bus_lane",
      location: "Flatbush Avenue between Livingston Street and State Street",
    });
    expect(receipt.treatment_adjudication.excluded_from_occurrence).toEqual(
      expect.arrayContaining([
        "State Street-to-Grand Army Plaza Phase 2 center-running bus lanes",
        "Phase 2 bus boarding islands",
        "pedestrian-space and curb/loading changes",
      ]),
    );
    expect(receipt.reproducibility).toMatchObject({
      semantic_correction_ids: expectedCorrectionIds,
      promotion_script: "scripts/promote-flatbush-phase1-installation-september-2025.ts",
      focused_test: "packages/pipeline/test/records/corpus-flatbush-phase1-installation-september-2025.test.ts",
    });

    const corrections = readJsonl<SemanticCorrection>("data/semantic-corrections/corrections.jsonl")
      .filter((correction) => expectedCorrectionIds.includes(correction.correction_id as typeof expectedCorrectionIds[number]));
    expect(corrections.map((correction) => correction.correction_id).sort()).toEqual([...expectedCorrectionIds].sort());
    expect(corrections.every((correction) => correction.source_decision === receiptPath)).toBe(true);
    expect(corrections.filter((correction) => correction.op === "supersede_record")).toHaveLength(14);
    expect(corrections.filter((correction) => correction.op === "patch_payload")).toHaveLength(8);
    expect(corrections.some(
      (correction) => correction.op === "supersede_record" && [startEventId, completionEventId].includes(correction.record_id),
    )).toBe(false);
  });
});

describe("Flatbush Phase 1 September 2025 occurrence promotion and coverage", () => {
  it("promotes one direct two-route atomic occurrence and registers its persistent identity", () => {
    expect(existsSync(join(repoRoot, decisionPath))).toBe(true);
    const decision = readJson<AcceptedOccurrenceDecision>(decisionPath);
    expect(decision).toMatchObject({
      schema_version: 1,
      decision_id: decisionId,
      review_state: "approved",
      accepted_at: "2026-07-13T18:45:00.000Z",
      occurrence_id: occurrenceId,
      founding_key: foundingKey,
      observation_event_record_ids: [startEventId],
      resolved_status: "realized",
      resolved_onset: { date: "2025-09", precision: "month" },
      treatment_scope_kind: "atomic",
      treatment: {
        kind: "atomic",
        member: { treatment_record_id: treatmentId, treatment_family: "bus_lane" },
      },
    });
    expect(decision.observation_relation_record_ids.sort()).toEqual([
      relationIds.start,
      relationIds.b41,
      relationIds.b67,
      relationIds.treatment,
    ].sort());
    expect(decision.observation_event_record_ids).not.toContain(completionEventId);
    expect(decision.observation_relation_record_ids).not.toContain(relationIds.completion);
    expect(decision.observation_relation_record_ids).not.toContain(relationIds.hierarchy);
    expect(sortedRoutePairs(decision.routes)).toEqual([
      [b41RouteId, "B41"],
      [b67RouteId, "B67"],
    ]);

    expect(simplifiedBindings(decision.resolved_onset.evidence_bindings)).toEqual([
      { role: "event_date", record_id: startEventId, evidence_id: `${startSourceId}#p001_b0010` },
      { role: "event_date", record_id: startEventId, evidence_id: `${startSourceId}#p001_b0016` },
      { role: "timeline_relation", record_id: relationIds.start, evidence_id: `${retrospectiveSourceId}#p004_c0002` },
    ]);
    expect(simplifiedBindings(decision.routes.find((route) => route.gtfs_route_id === "B41")!.evidence_bindings)).toEqual([
      { role: "route_identity", record_id: b41RouteId, evidence_id: `${startSourceId}#p001_b0021` },
      { role: "route_scope", record_id: relationIds.b41, evidence_id: `${retrospectiveSourceId}#p012_c0003` },
    ]);
    expect(simplifiedBindings(decision.routes.find((route) => route.gtfs_route_id === "B67")!.evidence_bindings)).toEqual([
      { role: "route_identity", record_id: b67RouteId, evidence_id: `${retrospectiveSourceId}#p012_c0003` },
      { role: "route_scope", record_id: relationIds.b67, evidence_id: `${retrospectiveSourceId}#p012_c0003` },
    ]);
    expect(simplifiedBindings(decision.treatment.member.evidence_bindings)).toEqual([
      { role: "treatment_definition", record_id: treatmentId, evidence_id: `${startSourceId}#p001_b0019` },
      { role: "treatment_scope", record_id: relationIds.treatment, evidence_id: `${retrospectiveSourceId}#p004_c0002` },
    ]);

    expect(`occurrence:${sha256(foundingKey).slice(0, 24)}`).toBe(occurrenceId);
    const registryMatches = readJsonl<OccurrenceIdentity>("data/operational-occurrence-identities/registry.jsonl")
      .filter((entry) => entry.founding_key === foundingKey || entry.occurrence_id === occurrenceId);
    expect(registryMatches).toEqual([{
      schema_version: 1,
      occurrence_id: occurrenceId,
      founding_key: foundingKey,
      founding_event_record_ids: [startEventId],
      resolution_cluster_id: null,
      aliases: [],
      tombstoned: false,
      decision_id: decisionId,
      issued_at: "2026-07-13T18:45:00.000Z",
    }]);

    const occurrenceSnapshot = readJson<ReviewSnapshot<OccurrenceSnapshotDecision>>(
      "data/contract-fixtures/operational-occurrences-v1/operational_occurrence_review_decisions.json",
    );
    expect(occurrenceSnapshot.decisions.filter((candidate) => candidate.decision_id === decisionId)).toMatchObject([{
      occurrence_id: occurrenceId,
      founding_key: foundingKey,
      anchor_review_decision_ids: [],
    }]);
    const anchorSnapshot = readJson<ReviewSnapshot<AnchorSnapshotDecision>>(
      "data/contract-fixtures/operational-occurrences-v1/operational_anchor_review_decisions.json",
    );
    expect(anchorSnapshot.decisions.some((candidate) => candidate.event_record_id === startEventId)).toBe(false);
  });

  it("projects exactly one eligible Flatbush occurrence and exactly two route-treatment pairs", () => {
    const projected = readJsonl<ProjectedOccurrence>(
      "data/contract-fixtures/operational-occurrences-v1/operational_occurrences.jsonl",
    );
    const flatbushOccurrences = projected.filter(
      (candidate) =>
        candidate.founding_key === foundingKey ||
        candidate.provenance.event_record_ids.includes(startEventId) ||
        candidate.provenance.treatment_record_ids.includes(treatmentId),
    );
    expect(flatbushOccurrences).toHaveLength(1);
    const occurrence = flatbushOccurrences[0]!;
    expect(occurrence).toMatchObject({
      occurrence_id: occurrenceId,
      occurrence_review_decision_id: decisionId,
      founding_key: foundingKey,
      review_state: "approved",
      resolved_status: "realized",
      resolved_onset: { date: "2025-09", precision: "month" },
      source_ids: [retrospectiveSourceId, startSourceId],
      exclusion_reasons: [],
      provenance: {
        anchor_review_decision_ids: [],
        event_record_ids: [startEventId],
        relation_record_ids: [relationIds.treatment, relationIds.start, relationIds.b41, relationIds.b67].sort(),
        route_record_ids: [b41RouteId, b67RouteId],
        treatment_record_ids: [treatmentId],
      },
      treatment: {
        kind: "atomic",
        member: { treatment_record_id: treatmentId, treatment_family: "bus_lane" },
      },
      study_projection_eligible: true,
    });
    expect(sortedRoutePairs(occurrence.routes)).toEqual([
      [b41RouteId, "B41"],
      [b67RouteId, "B67"],
    ]);

    const nonFounderEventIds = new Set([
      completionEventId,
      ...foldClusters.map((fold) => fold.eventId),
      markingsEventId,
    ]);
    expect(projected.some((candidate) =>
      candidate.provenance.event_record_ids.some((eventId) => nonFounderEventIds.has(eventId))
    )).toBe(false);

    const candidates = readJson<RouteCandidateFixture>(
      "data/contract-fixtures/operational-occurrences-v1/expected_route_candidates.json",
    ).candidates.filter((candidate) => candidate.occurrence_id === occurrenceId);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.route_id).sort()).toEqual(["B41", "B67"]);
    expect(candidates.every((candidate) =>
      candidate.treatment_kind === "atomic" &&
      candidate.analysis_family === "bus_lane" &&
      candidate.member_treatment_families.join(",") === "bus_lane"
    )).toBe(true);
  });

  it("terminalizes bounded remaining diagnostics and removes folded event diagnostics from the queue", () => {
    const queue = readJsonl<CoverageQueueRow>("data/quality/operational-coverage/priority-queue.jsonl");
    const correctedEventIds = new Set([
      startEventId,
      completionEventId,
      ...foldClusters.map((fold) => fold.eventId),
      markingsEventId,
    ]);
    const foldedEventIds = new Set(foldClusters.flatMap((fold) => [...fold.duplicateEventIds]));

    const boundedRows = queue.filter((row) => correctedEventIds.has(row.event_record_id));
    expect(boundedRows.length).toBeGreaterThan(0);
    for (const row of boundedRows) {
      expect(row).toMatchObject({ status: "terminal", verdict: "not_applicable" });
      expect(row.decision_ids.length).toBeGreaterThan(0);
      for (const ledgerDecisionId of row.decision_ids) {
        const ledgerPath = `data/operational-anchor-review/ledger-decisions/decisions/${ledgerDecisionId}.json`;
        expect(existsSync(join(repoRoot, ledgerPath))).toBe(true);
        expect(readJson<CoverageDecision>(ledgerPath)).toMatchObject({
          decision_id: ledgerDecisionId,
          gap_id: row.gap_id,
          verdict: "not_applicable",
        });
      }
    }
    expect(queue.some((row) => foldedEventIds.has(row.event_record_id))).toBe(false);
  });
});
