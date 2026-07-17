import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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

type ProjectedOccurrence = AcceptedOccurrenceDecision & {
  occurrence_review_decision_id: string;
  provenance: {
    event_record_ids: string[];
    relation_record_ids: string[];
    route_record_ids: string[];
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

type CoverageQueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: string;
  status: string;
  verdict: string;
  decision_ids: string[];
  resolved_occurrence_ids: string[];
};

type SourceBlock = {
  block_id: string;
  raw_text: string;
  raw_text_sha256: string;
};

const decisionId = "express-bus-service-enhancements-2025-03";
const decisionPath = `data/operational-occurrence-review/accepted/decisions/${decisionId}.json`;
const projectId = "project_spring-2025-express-bus-service-enhancements";
const eventId = "event_express-bus-service-enhancements-took-effect-march-2025";
const planningEventId = "event_meeting-doc-160441-express-spring-2025";
const treatmentId = "treatment_weekday-express-bus-trip-additions-spring-2025";
const treatmentRelationId = "relation_spring-2025-express-enhancements-has-weekday-trip-additions";
const planningTimelineRelationId = "relation_spring-2025-express-enhancements-has-spring-plan";
const timelineRelationId = "relation_spring-2025-express-enhancements-has-march-onset";

const routes = [
  { gtfsRouteId: "BM2", recordId: "route_bm2-brt-south-brooklyn-2017", relationSuffix: "bm2" },
  { gtfsRouteId: "BM5", recordId: "route_bm5-brt-south-brooklyn-2017", relationSuffix: "bm5" },
  { gtfsRouteId: "SIM1C", recordId: "route_sim1c-meeting-doc-138456", relationSuffix: "sim1c" },
  { gtfsRouteId: "SIM4C", recordId: "route_sim4c-meeting-doc-138456", relationSuffix: "sim4c" },
  { gtfsRouteId: "SIM23", recordId: "route_sim23-madison-ave-cb6-jun2025", relationSuffix: "sim23" },
  { gtfsRouteId: "SIM24", recordId: "route_sim24-madison-ave-cb6-jun2025", relationSuffix: "sim24" },
  { gtfsRouteId: "X27", recordId: "route_meeting-doc-160441-x27", relationSuffix: "x27" },
  { gtfsRouteId: "QM15", recordId: "route_qm15-qbb-study", relationSuffix: "qm15" },
] as const;

const planningScopeEvidenceId = "meeting_doc_160441#p003_c0005";
const treatmentEvidenceId = "meeting_doc_160441#p003_c0004";
const realizedEvidenceId = "meeting_doc_171141#p005_c0003";
const reportDateEvidenceId = "meeting_doc_171141#p001_c0003";

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

function sortedGtfsRouteIds(scopedRoutes: readonly ScopedRoute[]): string[] {
  return scopedRoutes.map((route) => route.gtfs_route_id).sort();
}

function sortedRouteRecordIds(scopedRoutes: readonly ScopedRoute[]): string[] {
  return scopedRoutes.map((route) => route.route_record_id).sort();
}

const corpusReady = existsSync(join(repoRoot, decisionPath));
const describeCorpus = corpusReady ? describe : describe.skip;

describeCorpus("Spring 2025 express-bus service enhancements", () => {
  it("pins the two official source artifacts and exact planning/realization blocks", () => {
    const sourcePins = [
      {
        sourceId: "meeting_doc_160441",
        pdfSha256: "2cbb8ac03d1b52681982b1bd4d994c17b2f6e6995c1d4806bdf34b0ee8f754b8",
        blocksSha256: "a8e8b7a9a66145447444633e8c96e24afa195d39a8170f6f653c0786fc71efde",
        blocks: [
          ["p002_c0005", "sha256:9f0ebbb72e351ca1ef2ab2434ccd52c0118885848a4dbe4b127d05dc256bac03", "Date December 10, 2024"],
          ["p003_c0004", "sha256:730a088e5bef117b4b219c33d1ed4a5918f303f53260c116cf651770b2dfedb9", "added to the spring 2025 schedules"],
          ["p003_c0005", "sha256:a1cb3550e548ba0e4cc902da5e264574b62e2318fcfe0a6f5418eb28d04373de", "8. QM15 (MTABC)"],
        ],
      },
      {
        sourceId: "meeting_doc_171141",
        pdfSha256: "51da3489ccb15a3fdf6b2fdbbd8603808cff8fd439215afaf1d5057ca4839d8a",
        blocksSha256: "25919e028d70731b69d171dc15e4d35bbdb5b18e2cbb84b1b84e08036e6fc1af",
        blocks: [
          ["p001_c0003", "sha256:80aa190c5d97a47a5acde989e25d4d3cfbe123dce4a1d4b36ce74a1efe63058f", "April 28, 2025"],
          ["p005_c0003", "sha256:db189e9145a8c754be91933d52adbc9aaa176fd33d9ceb6ebc781642dde94f80", "8 express bus routes took effect in March"],
        ],
      },
    ] as const;

    for (const pin of sourcePins) {
      const sourceRoot = join(repoRoot, "raw/sources", pin.sourceId);
      expect(sha256(readFileSync(join(sourceRoot, "source.pdf")))).toBe(pin.pdfSha256);
      expect(sha256(readFileSync(join(sourceRoot, "blocks.jsonl")))).toBe(pin.blocksSha256);
      const blocks = new Map(
        readJsonl<SourceBlock>(`raw/sources/${pin.sourceId}/blocks.jsonl`).map((block) => [block.block_id, block]),
      );
      for (const [blockId, blockHash, literal] of pin.blocks) {
        expect(blocks.get(blockId)?.raw_text_sha256).toBe(blockHash);
        expect(blocks.get(blockId)?.raw_text).toContain(literal);
      }
    }
  });

  it("keeps the season-precision plan separate from the month-precision realized graph", () => {
    const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
    const projects = readJsonl<MtaCanonicalRecord>("data/canonical/projects.jsonl");
    const treatments = readJsonl<MtaCanonicalRecord>("data/canonical/treatment_components.jsonl");
    const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");

    expect(byRecordId(events, planningEventId).payload).toMatchObject({
      lifecycle_phase: "planned",
      description: "Express bus route frequency increases planned for implementation in Spring 2025",
      date_text: "Spring 2025",
      date_normalized: "2025-spring",
      date_precision: "season",
    });
    const realizedEvent = byRecordId(events, eventId);
    expect(realizedEvent.payload).toMatchObject({
      event_family: "implementation",
      lifecycle_phase: "expanded",
      date_text: "March",
      date_normalized: "2025-03",
      date_precision: "month",
    });
    expect(realizedEvent.evidence_refs.map((ref) => ref.evidence_id)).toEqual(
      expect.arrayContaining([realizedEvidenceId, reportDateEvidenceId]),
    );
    const project = byRecordId(projects, projectId);
    expect(project.payload).toMatchObject({
      status: "implemented",
      document_time_status: "implemented",
    });
    expect(project.source_ids).toEqual(["meeting_doc_160441", "meeting_doc_171141"]);
    const treatment = byRecordId(treatments, treatmentId);
    expect(treatment.payload.treatment_family).toBe("service_pattern");
    expect(treatment.source_id).toBe("meeting_doc_171141");
    expect(treatment.source_ids).toEqual(["meeting_doc_160441", "meeting_doc_171141"]);
    expect(treatment.local_observation_ids).toEqual([
      "treatment_weekday_express_bus_trip_additions_spring_2025",
      "treatment_weekday_express_bus_trip_additions_spring_2025_planning_scope",
    ]);
    expect(treatment.submission_ids).toEqual(
      expect.arrayContaining(["sub_7cc6abb10d883a67", "sub_d0977dfc24fd8139"]),
    );
    expect(treatment.evidence_refs.map((ref) => ref.evidence_id)).toEqual(
      expect.arrayContaining([treatmentEvidenceId, planningScopeEvidenceId, realizedEvidenceId]),
    );
    expect(
      treatments.filter((record) =>
        record.record_id.startsWith("treatment_weekday-express-bus-trip-additions-spring-2025"),
      ),
    ).toHaveLength(1);
    const receipt = readJson<{
      reproducibility: { semantic_correction_ids: string[] };
    }>("data/quality/acquisition/receipts/express-bus-service-enhancements-march-2025.json");
    expect(receipt.reproducibility.semantic_correction_ids).toEqual([
      "core-coverage-spring-2025-express-prospective-lifecycle-20260713",
      "core-coverage-spring-2025-express-treatment-cross-source-fold-20260713",
    ]);

    const planningTimeline = byRecordId(relations, planningTimelineRelationId);
    expect(planningTimeline.payload).toMatchObject({
      relation_kind: "has_timeline_event",
      subject_id: projectId,
      object_id: planningEventId,
      assertion_status: "planned",
      as_of_date: "2024-12-10",
      subject_local_observation_id: "project_spring_2025_express_bus_service_enhancements_planning_scope",
    });
    expect(planningTimeline.evidence_refs.map((ref) => ref.evidence_id)).toEqual(
      expect.arrayContaining(["meeting_doc_160441#p002_c0005", "meeting_doc_160441#p001_c0012"]),
    );

    const expectedRelations = [
      [timelineRelationId, "has_timeline_event", eventId, realizedEvidenceId],
      [treatmentRelationId, "has_treatment", treatmentId, treatmentEvidenceId],
      ...routes.map((route) => [
        `relation_spring-2025-express-enhancements-affect-${route.relationSuffix}`,
        "affects_route",
        route.recordId,
        planningScopeEvidenceId,
      ] as const),
    ] as const;
    for (const [relationId, relationKind, objectId, evidenceId] of expectedRelations) {
      const relation = byRecordId(relations, relationId);
      expect(relation.payload).toMatchObject({
        relation_kind: relationKind,
        subject_id: projectId,
        object_id: objectId,
        assertion_status: "delivered",
      });
      expect(relation.evidence_refs.map((ref) => ref.evidence_id)).toContain(evidenceId);
    }
  });

  it("approves exactly one atomic realized occurrence over all eight routes", () => {
    const decision = readJson<AcceptedOccurrenceDecision>(decisionPath);
    const expectedGtfsRouteIds = routes.map((route) => route.gtfsRouteId).sort();
    const expectedRouteRecordIds = routes.map((route) => route.recordId).sort();
    expect(decision).toMatchObject({
      decision_id: decisionId,
      review_state: "approved",
      founding_key: `event:${eventId}`,
      observation_event_record_ids: [eventId],
      resolved_status: "realized",
      resolved_onset: { date: "2025-03", precision: "month" },
      treatment_scope_kind: "atomic",
      treatment: {
        kind: "atomic",
        member: { treatment_record_id: treatmentId, treatment_family: "service_pattern" },
      },
    });
    expect(sortedGtfsRouteIds(decision.routes)).toEqual(expectedGtfsRouteIds);
    expect(sortedRouteRecordIds(decision.routes)).toEqual(expectedRouteRecordIds);
    expect(decision.observation_event_record_ids).not.toContain(planningEventId);
    expect(decision.observation_relation_record_ids).not.toContain(planningTimelineRelationId);
    expect(decision.resolved_onset.evidence_bindings.map((binding) => [binding.role, binding.evidence_id])).toEqual([
      ["event_date", realizedEvidenceId],
      ["timeline_relation", realizedEvidenceId],
    ]);
    expect(decision.treatment.member.evidence_bindings.map((binding) => [binding.role, binding.evidence_id])).toEqual([
      ["treatment_definition", treatmentEvidenceId],
      ["treatment_scope", treatmentEvidenceId],
    ]);
    for (const route of decision.routes) {
      expect(route.evidence_bindings.map((binding) => [binding.role, binding.evidence_id])).toEqual([
        ["route_identity", planningScopeEvidenceId],
        ["route_scope", planningScopeEvidenceId],
      ]);
    }

    const projected = readJsonl<ProjectedOccurrence>(
      "data/contract-fixtures/operational-occurrences-v1/operational_occurrences.jsonl",
    ).filter((row) => row.occurrence_id === decision.occurrence_id);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      occurrence_review_decision_id: decisionId,
      founding_key: `event:${eventId}`,
      resolved_status: "realized",
      resolved_onset: { date: "2025-03", precision: "month" },
      provenance: {
        event_record_ids: [eventId],
        treatment_record_ids: [treatmentId],
      },
      treatment: {
        kind: "atomic",
        member: { treatment_record_id: treatmentId, treatment_family: "service_pattern" },
      },
      study_projection_eligible: true,
    });
    expect(projected[0]!.provenance.event_record_ids).not.toContain(planningEventId);
    expect(projected[0]!.provenance.relation_record_ids).not.toContain(planningTimelineRelationId);
    expect(sortedGtfsRouteIds(projected[0]!.routes)).toEqual(expectedGtfsRouteIds);

    const candidates = readJson<RouteCandidateFixture>(
      "data/contract-fixtures/operational-occurrences-v1/expected_route_candidates.json",
    ).candidates.filter((candidate) => candidate.occurrence_id === decision.occurrence_id);
    expect(candidates).toHaveLength(8);
    expect(candidates.map((candidate) => candidate.route_id).sort()).toEqual(expectedGtfsRouteIds);
    expect(candidates.every((candidate) =>
      candidate.treatment_kind === "atomic" &&
      candidate.analysis_family === "service_pattern" &&
      candidate.member_treatment_families.join(",") === "service_pattern"
    )).toBe(true);
  });

  it("keeps planned diagnostics separate from the superseded realized raw diagnostics", () => {
    const decision = readJson<AcceptedOccurrenceDecision>(decisionPath);
    const queue = readJsonl<CoverageQueueRow>("data/quality/operational-coverage/priority-queue.jsonl");
    const planningGaps = queue.filter((row) => row.event_record_id === planningEventId);
    expect(planningGaps.map((row) => row.dimension).sort()).toEqual(["date_precision", "delivered_status", "route", "treatment"]);
    expect(planningGaps.some((row) => row.dimension === "timeline_subject")).toBe(false);
    expect(planningGaps.every((row) => row.status === "terminal" && row.verdict === "not_applicable")).toBe(true);

    const expected = [
      ["operational-coverage:6dbaecb40a5de7e881f84bc3", eventId, "route", "spring-2025-express-realized-raw-multiroute-diagnostic-superseded", true],
      ["operational-coverage:6b290978620e7597f521c343", eventId, "treatment", "spring-2025-express-realized-raw-treatment-diagnostic-superseded", true],
      ["operational-coverage:6aab3b03b1a97ab76aee0282", planningEventId, "date_precision", "spring-2025-express-planning-date-superseded-by-march-occurrence", false],
      ["operational-coverage:02c71a8d29f201953736bc0b", planningEventId, "delivered_status", "spring-2025-express-planning-status-remains-prospective", false],
      ["operational-coverage:57254515441c06387665b6e9", planningEventId, "route", "spring-2025-express-planning-raw-multiroute-diagnostic-superseded", false],
      ["operational-coverage:2bff8ef1db2f15516d594e0e", planningEventId, "treatment", "spring-2025-express-planning-raw-treatment-diagnostic-superseded", false],
    ] as const;
    expect(queue.filter((row) => row.event_record_id === eventId)).toHaveLength(2);
    for (const [gapId, scopedEventId, dimension, decisionIdForGap, resolvesOccurrence] of expected) {
      const gap = queue.find((row) => row.gap_id === gapId);
      expect(gap).toMatchObject({
        event_record_id: scopedEventId,
        dimension,
        status: "terminal",
        verdict: "not_applicable",
        decision_ids: [decisionIdForGap],
        resolved_occurrence_ids: resolvesOccurrence ? [decision.occurrence_id] : [],
      });
      expect(readJson<{ gap_id: string; verdict: string }>(
        `data/operational-anchor-review/ledger-decisions/decisions/${decisionIdForGap}.json`,
      )).toMatchObject({ gap_id: gapId, verdict: "not_applicable" });
    }
  });
});
