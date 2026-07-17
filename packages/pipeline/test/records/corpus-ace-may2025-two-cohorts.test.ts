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

type OfficialRouteRow = {
  row_id: string;
  route: string;
  program: string;
  implementation_date: string;
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
};

type ReviewSnapshot<T> = {
  decisions: T[];
};

type OccurrenceSnapshotDecision = AcceptedOccurrenceDecision & {
  anchor_review_decision_ids: string[];
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
  schema_version: number;
  decision_id: string;
  gap_id: string;
  prior_verdict: string;
  verdict: string;
};

type OccurrenceSummary = {
  occurrence_count: number;
  study_projection_eligible_count: number;
  candidate_projection_count: number;
};

type SemanticCorrection = {
  correction_id: string;
  op: string;
  record_id: string;
  source_decision: string;
  reason?: string;
};

const cutSourceId = "mta_ace_routes_may2025_cut";
const dictionarySourceId = "ace_routes_dataset_dictionary";
const kpmSourceId = "nyct_key_performance_metrics_june2025";
const minutesSourceId = "meeting_doc_179621";
const umbrellaProjectId = "project_ace-automated-camera-enforcement";
const forecastEventId = "event_ace-expansion-manhattan-apr2025";
const forecastRelationId = "relation_ace-project-has-event-expansion";
const falseJamaicaRelationId = "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5";
const quarantinedSelfLoopId = "relation_rel-ace-routes-expansion";
const receiptPath = "data/quality/acquisition/receipts/ace-may2025-two-cohort-implementation.json";

const officialRows: OfficialRouteRow[] = [
  {
    row_id: "row-a83i_fak4-5nyp",
    route: "M2",
    program: "ACE",
    implementation_date: "2025-05-19T00:00:00.000",
  },
  {
    row_id: "row-s8j7-7i64-49jz",
    route: "M4",
    program: "ACE",
    implementation_date: "2025-05-19T00:00:00.000",
  },
  {
    row_id: "row-5mqc-82pi_cjgy",
    route: "BX5",
    program: "ACE",
    implementation_date: "2025-05-27T00:00:00.000",
  },
  {
    row_id: "row-kur9.r4em.mw3w",
    route: "M100",
    program: "ACE",
    implementation_date: "2025-05-27T00:00:00.000",
  },
  {
    row_id: "row-4ih8.hhxj.srtp",
    route: "M42",
    program: "ACE",
    implementation_date: "2025-05-27T00:00:00.000",
  },
];

const sourcePins = [
  {
    sourceId: cutSourceId,
    artifacts: {
      "metadata.json": "8f8a599f163550a7486affe9ac232055629ae0b16128ad45628d43fe80192371",
      "source.json": "8f206d056b24099c5ff1f03957a94ff06fdfb7c43b52c4630961fbd4ee50b6ea",
      "text.txt": "10149a6594cd379bfb59fa64bb54f043191b8ffe6a4ad4da23cb33c8ac4083d6",
      "blocks.jsonl": "f4a364c38c4048ef20c25865694b25c39c1199c1eca620ada54caf1758ad711f",
    },
    blocks: [
      ["p001_b0001", 1, "sha256:4739a081afb00f16c77a13989ff0a02f30ec781a229f08bf8493ac2bec3a6db1", ["ki2b-sg5y", "8f206d056b24099c5ff1f03957a94ff06fdfb7c43b52c4630961fbd4ee50b6ea"]],
      ["p001_b0002", 1, "sha256:b951f90ce367f9751b5854ba1f3531ea26847dc790157c383068d99499243eb4", ["row-a83i_fak4-5nyp", "\"route\":\"M2\"", "2025-05-19"]],
      ["p001_b0003", 1, "sha256:9f678307c7c631f9cbde51eff922d9af1b4e74d2df00ff29b44c3ff73cde7df2", ["row-s8j7-7i64-49jz", "\"route\":\"M4\"", "2025-05-19"]],
      ["p001_b0004", 1, "sha256:af11743f84deb37d80e5d34e45c25401e17a6496898cf7907adfe41e4c6899bf", ["row-5mqc-82pi_cjgy", "\"route\":\"BX5\"", "2025-05-27"]],
      ["p001_b0005", 1, "sha256:1ade6dcc0b19712835cb6da704c1adf3199af5fdffd3771615f9b11404b7e286", ["row-kur9.r4em.mw3w", "\"route\":\"M100\"", "2025-05-27"]],
      ["p001_b0006", 1, "sha256:08e698e15923feefac5848969f9d9ac96ee67c0d3f3ceb16f0eb6e02671a3f02", ["row-4ih8.hhxj.srtp", "\"route\":\"M42\"", "2025-05-27"]],
    ],
  },
  {
    sourceId: dictionarySourceId,
    artifacts: {
      "metadata.json": "85295354f00456c35a9b00864a229a838f57062e1e09564e3d14a665ae06a442",
      "source.json": "036ee59df32ea069706825915889079432acb27983b3b3f30ac56f7ad448c541",
      "blocks.jsonl": "6a1cebd44436009e112dc40df6da39421b5597d3badba4ecdcc667e8c7f472ec",
    },
    blocks: [
      ["p001_b0136", 1, "sha256:9365d95e2570481960c7b23afc5d4319a92fff2d4055e3c239594b187e239c05", ["date that the program took effect"]],
      ["p001_b0137", 1, "sha256:6067471b839e1c04a8b973e81eae23c38c0fffa31ac36076ef1d41058ff6a91f", ["implementation_date"]],
    ],
  },
  {
    sourceId: kpmSourceId,
    artifacts: {
      "metadata.json": "aa4280f87295631afaccafe78d9f613ee86da6add51f9d35a742fbc6f1492fd9",
      "source.pdf": "aca1f7edc2748df53814b945128c53ebf11fd06e3cc1cb5be6772260308df13e",
      "blocks.jsonl": "05c367fed2e36a6c07f5d97517315a402731d1932f7bbf85aff9a922ed150e99",
    },
    blocks: [
      ["p003_c0003", 3, "sha256:cd869e913bf2d080f629ddf7eb8b23792ba00e43f53f2e35c6a8748cf9779963", ["June 23, 2025"]],
      ["p005_c0003", 5, "sha256:9fc307cf56e4a722aa295141283ba558804bae3171796e5b5e66b9bbad5b9a58", ["Last month, we expanded ACE to five new routes", "M2, M4, M42, M100, and Bx5"]],
    ],
  },
  {
    sourceId: minutesSourceId,
    artifacts: {
      "metadata.json": "2610d7401b95ea2b48f1bff9eef688105d2b97eb10b364e2f46c0afcc20a0508",
      "source.pdf": "c6fde7da5aadf2525f52096311b017d37c0bfdcca250fd606b6ad072b3f75536",
      "blocks.jsonl": "05caa59b480d07f4f4140cf7423f80e29082684b4407fb7062cdccb2483af846",
    },
    blocks: [
      ["p001_c0002", 1, "sha256:d2dcda9b07db4683bd41d224e22a28557f51b72e4f50822f55bbbb2141bf5301", ["June 23, 2025"]],
      ["p003_c0009", 3, "sha256:1c2fe0ec1ad28cd6bc0d4279b6fbddcafba648d000b2e0d1de858a72c6e398f3", ["M2, M4, M42, M100, and Bx5", "are now ACE-enabled"]],
    ],
  },
] as const;

const cohorts = [
  {
    projectId: "project_ace-m2-m4-implementation-2025-05-19",
    eventId: "event_ace-m2-m4-implementation-2025-05-19",
    treatmentId: "treatment_ace-m2-m4-implementation-2025-05-19",
    date: "2025-05-19",
    dateText: "May 19, 2025",
    decisionId: "ace-m2-m4-implementation-2025-05-19",
    occurrenceId: "occurrence:2eb555e5b3999b7cdaae5004",
    relations: {
      timeline: "relation_ace-m2-m4-has-implementation-2025-05-19",
      treatment: "relation_ace-m2-m4-may19-has-enforcement",
      hierarchy: "relation_ace-m2-m4-may19-part-of-program",
    },
    routes: [
      { recordId: "route_m2-ace", gtfsId: "M2", relationId: "relation_ace-m2-m4-2025-05-19-affects-m2", blockId: "p001_b0002" },
      { recordId: "route_m4-ace", gtfsId: "M4", relationId: "relation_ace-m2-m4-2025-05-19-affects-m4", blockId: "p001_b0003" },
    ],
  },
  {
    projectId: "project_ace-m42-m100-bx5-implementation-2025-05-27",
    eventId: "event_ace-m42-m100-bx5-implementation-2025-05-27",
    treatmentId: "treatment_ace-m42-m100-bx5-implementation-2025-05-27",
    date: "2025-05-27",
    dateText: "May 27, 2025",
    decisionId: "ace-m42-m100-bx5-implementation-2025-05-27",
    occurrenceId: "occurrence:475b9dffbfed4fbc29dd53ac",
    relations: {
      timeline: "relation_ace-m42-m100-bx5-has-implementation-2025-05-27",
      treatment: "relation_ace-m42-m100-bx5-may27-has-enforcement",
      hierarchy: "relation_ace-m42-m100-bx5-may27-part-of-program",
    },
    routes: [
      { recordId: "route_bx5-addendum-update", gtfsId: "BX5", relationId: "relation_ace-m42-m100-bx5-2025-05-27-affects-bx5", blockId: "p001_b0004" },
      { recordId: "route_m100-ace", gtfsId: "M100", relationId: "relation_ace-m42-m100-bx5-2025-05-27-affects-m100", blockId: "p001_b0005" },
      { recordId: "route_m42-ace", gtfsId: "M42", relationId: "relation_ace-m42-m100-bx5-2025-05-27-affects-m42", blockId: "p001_b0006" },
    ],
  },
] as const;

const semanticCorrectionIds = [
  "core-coverage-ace-may2025-01-april-forecast-event-planned-20260713",
  "core-coverage-ace-may2025-02-april-forecast-relation-planned-20260713",
  "core-coverage-ace-may2025-10-retract-false-jamaica-edge-20260713",
] as const;

const residualGaps = [
  { gapId: "operational-coverage:ca2e33eccdceaa4780832e0b", eventId: cohorts[0].eventId, dimension: "route", decisionId: "ace-may19-2025-route-gap-superseded-by-approved-occurrence" },
  { gapId: "operational-coverage:244705ab490add8ae436a82c", eventId: cohorts[0].eventId, dimension: "treatment", decisionId: "ace-may19-2025-treatment-gap-superseded-by-approved-occurrence" },
  { gapId: "operational-coverage:e7726fa5b81a59a2bf817e87", eventId: cohorts[1].eventId, dimension: "route", decisionId: "ace-may27-2025-route-gap-superseded-by-approved-occurrence" },
  { gapId: "operational-coverage:61b364969fed72337b4fbfc1", eventId: cohorts[1].eventId, dimension: "treatment", decisionId: "ace-may27-2025-treatment-gap-superseded-by-approved-occurrence" },
  { gapId: "operational-coverage:74d19eb5d2ce553225eb7ca3", eventId: forecastEventId, dimension: "delivered_status", decisionId: "ace-april-2025-plan-delivered-status-not-applicable" },
  { gapId: "operational-coverage:92bf38fc65618c3fbcf12e46", eventId: forecastEventId, dimension: "route", decisionId: "ace-april-2025-plan-route-scope-not-applicable" },
  { gapId: "operational-coverage:fec4c50f7496efd0858692df", eventId: forecastEventId, dimension: "treatment", decisionId: "ace-april-2025-plan-treatment-scope-not-applicable" },
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

function expectedRoutePairs(cohort: typeof cohorts[number]): Array<[string, string]> {
  return cohort.routes
    .map((route) => [route.recordId, route.gtfsId] as [string, string])
    .sort(([left], [right]) => left.localeCompare(right));
}

function occurrenceRelationIds(cohort: typeof cohorts[number]): string[] {
  return [
    cohort.relations.timeline,
    cohort.relations.treatment,
    ...cohort.routes.map((route) => route.relationId),
  ].sort();
}

describe("May 2025 ACE official route cut and two bounded canonical cohorts", () => {
  it("pins every official artifact, evidence block, stable row id, route, and implementation date", () => {
    for (const sourcePin of sourcePins) {
      const sourceRoot = join(repoRoot, "raw/sources", sourcePin.sourceId);
      for (const [filename, expectedHash] of Object.entries(sourcePin.artifacts)) {
        expect(sha256(readFileSync(join(sourceRoot, filename)))).toBe(expectedHash);
      }

      const blocks = new Map(
        readJsonl<SourceBlock>(`raw/sources/${sourcePin.sourceId}/blocks.jsonl`)
          .map((block) => [block.block_id, block]),
      );
      for (const [blockId, pageNumber, expectedHash, literals] of sourcePin.blocks) {
        const block = blocks.get(blockId);
        expect(block?.page_number).toBe(pageNumber);
        expect(block?.raw_text_sha256).toBe(expectedHash);
        for (const literal of literals) expect(block?.raw_text).toContain(literal);
      }
    }

    expect(readJson<OfficialRouteRow[]>(`raw/sources/${cutSourceId}/source.json`)).toEqual(officialRows);
  });

  it("materializes the official cut source card and exactly two delivered bounded graphs", () => {
    const sources = readJsonl<MtaCanonicalRecord>("data/canonical/sources.jsonl");
    const projects = readJsonl<MtaCanonicalRecord>("data/canonical/projects.jsonl");
    const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
    const treatments = readJsonl<MtaCanonicalRecord>("data/canonical/treatment_components.jsonl");
    const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");

    const source = byRecordId(sources, "source_mta-ace-routes-may2025-cut");
    expect(source.source_ids).toEqual([cutSourceId]);
    expect(source.payload).toMatchObject({
      publisher: "Metropolitan Transportation Authority (MTA) Open Data",
      content_type: "official dataset API cut",
      dataset_id: "ki2b-sg5y",
      dataset_rows_updated_at: "2026-06-19T15:14:52Z",
      response_sha256: "8f206d056b24099c5ff1f03957a94ff06fdfb7c43b52c4630961fbd4ee50b6ea",
      row_count: 5,
      authority_tier: "dataset_documentation",
    });
    expect(evidenceIds(source)).toEqual([
      `${cutSourceId}#p001_b0001`,
      ...officialRows.map((_, index) => `${cutSourceId}#p001_b000${index + 2}`),
    ]);

    for (const cohort of cohorts) {
      const project = byRecordId(projects, cohort.projectId);
      expect(project.source_ids).toEqual([cutSourceId]);
      expect(project.payload).toMatchObject({
        project_type: "bounded ACE route implementation cohort",
        project_family: "enforcement_program",
        status: "implemented",
        document_time_status: "implemented",
        implementation_date: cohort.date,
        date_normalized: cohort.date,
        date_precision: "day",
      });
      expect(cohort.projectId).not.toBe(umbrellaProjectId);

      const event = byRecordId(events, cohort.eventId);
      expect(event.source_ids).toEqual([cutSourceId]);
      expect(event.payload).toMatchObject({
        event_kind: "ACE route implementation",
        event_family: "implementation",
        lifecycle_phase: "expanded",
        date_text: cohort.dateText,
        date_normalized: cohort.date,
        date_precision: "day",
      });

      const treatment = byRecordId(treatments, cohort.treatmentId);
      expect(treatment.source_ids).toEqual([cutSourceId]);
      expect(treatment.payload).toMatchObject({
        treatment_kind: "Automated Camera Enforcement (ACE) route implementation",
        treatment_family: "automated_bus_lane_enforcement",
        implementation_date: cohort.date,
      });

      const expectedRelationIds = [
        cohort.relations.timeline,
        cohort.relations.treatment,
        cohort.relations.hierarchy,
        ...cohort.routes.map((route) => route.relationId),
      ].sort();
      const graph = relations.filter((relation) => relation.payload.subject_id === cohort.projectId);
      expect(graph.map((relation) => relation.record_id).sort()).toEqual(expectedRelationIds);
      expect(graph.every((relation) => relation.payload.assertion_status === "delivered")).toBe(true);
      expect(graph.every((relation) => relation.source_ids.length === 1 && relation.source_ids[0] === cutSourceId)).toBe(true);

      expect(byRecordId(relations, cohort.relations.timeline).payload).toMatchObject({
        relation_kind: "has_timeline_event",
        object_id: cohort.eventId,
      });
      expect(byRecordId(relations, cohort.relations.treatment).payload).toMatchObject({
        relation_kind: "has_treatment",
        object_id: cohort.treatmentId,
      });
      expect(byRecordId(relations, cohort.relations.hierarchy).payload).toMatchObject({
        relation_kind: "part_of_program",
        object_id: umbrellaProjectId,
      });

      const routeRelations = graph.filter((relation) => relation.payload.relation_kind === "affects_route");
      expect(routeRelations.map((relation) => relation.payload.object_id).sort()).toEqual(
        cohort.routes.map((route) => route.recordId).sort(),
      );
      expect(graph.filter((relation) => relation.payload.relation_kind === "has_treatment")).toHaveLength(1);
      expect(graph.filter((relation) => relation.payload.relation_kind === "has_timeline_event")).toHaveLength(1);
    }

    const cutUmbrellaLeakage = relations.filter(
      (relation) =>
        relation.payload.subject_id === umbrellaProjectId &&
        relation.source_ids.includes(cutSourceId) &&
        ["affects_route", "serves_route", "has_treatment", "has_timeline_event"].includes(String(relation.payload.relation_kind)),
    );
    expect(cutUmbrellaLeakage).toEqual([]);

    const cohortRouteSets = cohorts.map((cohort) => new Set(cohort.routes.map((route) => route.recordId)));
    expect([...cohortRouteSets[0]!].some((routeId) => cohortRouteSets[1]!.has(routeId))).toBe(false);
    expect(new Set(cohorts.flatMap((cohort) => cohort.routes.map((route) => route.recordId)))).toEqual(new Set([
      "route_bx5-addendum-update",
      "route_m100-ace",
      "route_m2-ace",
      "route_m4-ace",
      "route_m42-ace",
    ]));
  });

  it("preserves the April forecast as planned and retracts both malformed legacy edges", () => {
    const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
    const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");

    expect(byRecordId(events, forecastEventId).payload).toMatchObject({
      lifecycle_phase: "planned",
      date_text: "April 2025",
      date_normalized: "2025-04",
      date_precision: "month",
    });
    expect(byRecordId(relations, forecastRelationId).payload).toMatchObject({
      subject_id: umbrellaProjectId,
      object_id: forecastEventId,
      assertion_status: "planned",
    });
    expect(relations.some((relation) => relation.record_id === falseJamaicaRelationId)).toBe(false);
    expect(relations.some((relation) => relation.record_id === quarantinedSelfLoopId)).toBe(false);

    const corrections = readJsonl<SemanticCorrection>("data/semantic-corrections/corrections.jsonl")
      .filter((correction) => semanticCorrectionIds.includes(correction.correction_id as typeof semanticCorrectionIds[number]));
    expect(corrections.map((correction) => correction.correction_id).sort()).toEqual([...semanticCorrectionIds].sort());
    expect(corrections.map((correction) => [correction.record_id, correction.op]).sort()).toEqual([
      [forecastEventId, "patch_payload"],
      [falseJamaicaRelationId, "retract_record"],
      [forecastRelationId, "patch_payload"],
    ].sort());
    expect(corrections.every((correction) => correction.source_decision === receiptPath)).toBe(true);
    expect(
      readJsonl<SemanticCorrection>("data/semantic-corrections/corrections.jsonl").find(
        (correction) => correction.record_id === quarantinedSelfLoopId && correction.op === "retract_record",
      ),
    ).toMatchObject({
      correction_id: "relationship-integrity-legacy-0158-relation-rel-ace-routes-expansion",
      reason:
        "The edge is a canonical self-loop created by endpoint collapse and does not encode the source-backed subject/object roles; its underlying fact remains on the cited canonical record pending a correctly typed counterpart.",
    });
  });
});

describe("May 2025 ACE occurrence promotion and residual coverage", () => {
  it("promotes exactly two persistent direct occurrences with exact days, routes, and atomic treatments", () => {
    const registry = readJsonl<OccurrenceIdentity>("data/operational-occurrence-identities/registry.jsonl");
    const snapshot = readJson<ReviewSnapshot<OccurrenceSnapshotDecision>>(
      "data/contract-fixtures/operational-occurrences-v1/operational_occurrence_review_decisions.json",
    );

    for (const cohort of cohorts) {
      const foundingKey = `event:${cohort.eventId}`;
      const decisionPath = `data/operational-occurrence-review/accepted/decisions/${cohort.decisionId}.json`;
      expect(existsSync(join(repoRoot, decisionPath))).toBe(true);
      const decision = readJson<AcceptedOccurrenceDecision>(decisionPath);
      expect(decision).toMatchObject({
        schema_version: 1,
        decision_id: cohort.decisionId,
        review_state: "approved",
        occurrence_id: cohort.occurrenceId,
        founding_key: foundingKey,
        observation_event_record_ids: [cohort.eventId],
        resolved_status: "realized",
        resolved_onset: { date: cohort.date, precision: "day" },
        treatment_scope_kind: "atomic",
        treatment: {
          kind: "atomic",
          member: {
            treatment_record_id: cohort.treatmentId,
            treatment_family: "automated_bus_lane_enforcement",
          },
        },
      });
      expect([...decision.observation_relation_record_ids].sort()).toEqual(occurrenceRelationIds(cohort));
      expect(decision.observation_relation_record_ids).not.toContain(cohort.relations.hierarchy);
      expect(sortedRoutePairs(decision.routes)).toEqual(expectedRoutePairs(cohort));

      const allowedRowEvidence = new Set(cohort.routes.map((route) => `${cutSourceId}#${route.blockId}`));
      const allBindings = [
        ...decision.resolved_onset.evidence_bindings,
        ...decision.routes.flatMap((route) => route.evidence_bindings),
        ...decision.treatment.member.evidence_bindings,
      ];
      expect(allBindings.length).toBeGreaterThan(0);
      expect(allBindings.every((binding) =>
        binding.source_id === cutSourceId && allowedRowEvidence.has(binding.evidence_id)
      )).toBe(true);

      for (const expectedRoute of cohort.routes) {
        const route = decision.routes.find((candidate) => candidate.route_record_id === expectedRoute.recordId);
        expect(route?.gtfs_route_id).toBe(expectedRoute.gtfsId);
        expect(route?.evidence_bindings.map((binding) => binding.role).sort()).toEqual(["route_identity", "route_scope"]);
        expect(route?.evidence_bindings.every(
          (binding) => binding.evidence_id === `${cutSourceId}#${expectedRoute.blockId}`,
        )).toBe(true);
      }

      expect(`occurrence:${sha256(foundingKey).slice(0, 24)}`).toBe(cohort.occurrenceId);
      expect(registry.filter((entry) => entry.founding_key === foundingKey || entry.occurrence_id === cohort.occurrenceId)).toMatchObject([{
        schema_version: 1,
        occurrence_id: cohort.occurrenceId,
        founding_key: foundingKey,
        founding_event_record_ids: [cohort.eventId],
        resolution_cluster_id: null,
        aliases: [],
        tombstoned: false,
        decision_id: cohort.decisionId,
      }]);
      expect(snapshot.decisions.filter((candidate) => candidate.decision_id === cohort.decisionId)).toMatchObject([{
        occurrence_id: cohort.occurrenceId,
        founding_key: foundingKey,
        anchor_review_decision_ids: [],
      }]);
    }
  });

  it("projects exactly the two non-leaking eligible cohort occurrences and five route-treatment pairs", () => {
    const projected = readJsonl<ProjectedOccurrence>(
      "data/contract-fixtures/operational-occurrences-v1/operational_occurrences.jsonl",
    );
    const cohortEventIds = new Set(cohorts.map((cohort) => cohort.eventId));
    const cohortTreatmentIds = new Set(cohorts.map((cohort) => cohort.treatmentId));
    const aceMayOccurrences = projected.filter((candidate) =>
      candidate.provenance.event_record_ids.some((eventId) => cohortEventIds.has(eventId)) ||
      candidate.provenance.treatment_record_ids.some((treatmentId) => cohortTreatmentIds.has(treatmentId))
    );
    expect(aceMayOccurrences).toHaveLength(2);

    for (const cohort of cohorts) {
      const occurrence = aceMayOccurrences.find((candidate) => candidate.occurrence_id === cohort.occurrenceId);
      expect(occurrence).toMatchObject({
        occurrence_id: cohort.occurrenceId,
        occurrence_review_decision_id: cohort.decisionId,
        founding_key: `event:${cohort.eventId}`,
        review_state: "approved",
        resolved_status: "realized",
        resolved_onset: { date: cohort.date, precision: "day" },
        source_ids: [cutSourceId],
        exclusion_reasons: [],
        provenance: {
          anchor_review_decision_ids: [],
          event_record_ids: [cohort.eventId],
          route_record_ids: cohort.routes.map((route) => route.recordId),
          treatment_record_ids: [cohort.treatmentId],
        },
        treatment: {
          kind: "atomic",
          member: {
            treatment_record_id: cohort.treatmentId,
            treatment_family: "automated_bus_lane_enforcement",
          },
        },
        study_projection_eligible: true,
      });
      expect(occurrence).toBeDefined();
      expect(sortedRoutePairs(occurrence!.routes)).toEqual(expectedRoutePairs(cohort));
      expect([...occurrence!.provenance.relation_record_ids].sort()).toEqual(occurrenceRelationIds(cohort));
    }

    expect(projected.some((candidate) => candidate.provenance.event_record_ids.includes(forecastEventId))).toBe(false);
    const mayRoutePairs = aceMayOccurrences.flatMap((occurrence) => occurrence.routes.map((route) => [
      occurrence.occurrence_id,
      route.gtfs_route_id,
    ]));
    expect(mayRoutePairs).toHaveLength(5);
    expect(new Set(mayRoutePairs.map(([, gtfsRouteId]) => gtfsRouteId))).toEqual(new Set(["BX5", "M100", "M2", "M4", "M42"]));

    const candidates = readJson<RouteCandidateFixture>(
      "data/contract-fixtures/operational-occurrences-v1/expected_route_candidates.json",
    ).candidates.filter((candidate) => cohorts.some((cohort) => cohort.occurrenceId === candidate.occurrence_id));
    expect(candidates).toHaveLength(5);
    expect(candidates.map((candidate) => candidate.route_id).sort()).toEqual(["BX5", "M100", "M2", "M4", "M42"]);
    expect(candidates.every((candidate) =>
      candidate.treatment_kind === "atomic" &&
      candidate.analysis_family === "automated_bus_lane_enforcement" &&
      candidate.member_treatment_families.join(",") === "automated_bus_lane_enforcement"
    )).toBe(true);
  });

  it("terminalizes all seven residual diagnostics with their reviewed decisions", () => {
    const queue = readJsonl<CoverageQueueRow>("data/quality/operational-coverage/priority-queue.jsonl");
    const rows = queue.filter((row) => residualGaps.some((gap) => gap.gapId === row.gap_id));
    expect(rows.map((row) => row.gap_id).sort()).toEqual(residualGaps.map((gap) => gap.gapId).sort());

    for (const expected of residualGaps) {
      const row = rows.find((candidate) => candidate.gap_id === expected.gapId);
      expect(row).toMatchObject({
        gap_id: expected.gapId,
        event_record_id: expected.eventId,
        dimension: expected.dimension,
        status: "terminal",
        verdict: "not_applicable",
        decision_ids: [expected.decisionId],
      });

      const decisionPath = `data/operational-anchor-review/ledger-decisions/decisions/${expected.decisionId}.json`;
      expect(existsSync(join(repoRoot, decisionPath))).toBe(true);
      expect(readJson<CoverageDecision>(decisionPath)).toMatchObject({
        schema_version: 1,
        decision_id: expected.decisionId,
        gap_id: expected.gapId,
        prior_verdict: "unreviewed",
        verdict: "not_applicable",
      });
    }
  });

  it("pins the current overall fixture totals while preserving the two May cohorts", () => {
    expect(readJson<OccurrenceSummary>(
      "data/contract-fixtures/operational-occurrences-v1/operational_occurrences_summary.json",
    )).toMatchObject({
      occurrence_count: 135,
      study_projection_eligible_count: 134,
      candidate_projection_count: 172,
    });
  });
});
