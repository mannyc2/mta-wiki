import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import { readCanonicalRecordsFromJsonl } from "@mta-wiki/pipeline/materialize/canonical-read";
import { loadOperationalOccurrenceIdentityRegistry } from "@mta-wiki/pipeline/materialize/operational-occurrence-identity";
import { loadOperationalOccurrenceAcceptedDecisions } from "@mta-wiki/pipeline/materialize/operational-occurrence-review";
import { readSemanticCorrections } from "@mta-wiki/pipeline/records/semantic-corrections";
import { describe, expect, it } from "bun:test";

const sourceId = "nyct_key_performance_metrics_doc194001";
const projectId = "project_ace-b60-b68-m57-warning-cohort-2025-12-08";
const eventId = "event_ace-program-expansion-dec2025";
const treatmentId = "treatment_ace-b60-b68-m57-warning-phase-2025-12-08";
const occurrenceId = "occurrence:1ed365a241353614f72f025e";
const occurrenceDecisionId = "ace-b60-b68-m57-warning-phase-2025-12-08";
const foundingKey = `event:${eventId}`;
const oldDecisionId = "non-study-ace-program-expansion-dec2025-timeline-subject-not-applicable";
const oldGapId = "operational-coverage:ee9721813dc1e45e440d0589";
const oldDecisionSha256 = "c89594a8ccb5896cfc1798b336aa64b45de04c966817beea8edd45627aa4fe70";

const relations = {
  timeline: "relation_ace-b60-b68-m57-warning-has-activation-2025-12-08",
  treatment: "relation_ace-b60-b68-m57-warning-has-treatment-2025-12-08",
  hierarchy: "relation_ace-b60-b68-m57-warning-part-of-program",
  routes: [
    {
      gtfsRouteId: "B60",
      routeRecordId: "route_b60",
      relationId: "relation_ace-b60-b68-m57-2025-12-08-affects-b60",
    },
    {
      gtfsRouteId: "B68",
      routeRecordId: "route_b68-nyct-2025",
      relationId: "relation_ace-b60-b68-m57-2025-12-08-affects-b68",
    },
    {
      gtfsRouteId: "M57",
      routeRecordId: "route_m57-nyct-2025",
      relationId: "relation_ace-b60-b68-m57-2025-12-08-affects-m57",
    },
  ],
} as const;

const successorGaps = [
  {
    dimension: "route",
    gapId: "operational-coverage:cb81df5ab159c18671171291",
    decisionId:
      "ace-b60-b68-m57-warning-phase-2025-12-08-route-gap-superseded-by-approved-occurrence",
    decisionSha256: "9d6420e687f6c3fb15798d44c38447fe2a8ce1f5b2b1fb8e53f31d3c120efa55",
  },
  {
    dimension: "treatment",
    gapId: "operational-coverage:64381715a1777d38c32034f4",
    decisionId:
      "ace-b60-b68-m57-warning-phase-2025-12-08-treatment-gap-superseded-by-approved-occurrence",
    decisionSha256: "e2b21c3c98100878864bb4a081e63117056d6b711436fece4211dadfaca97f75",
  },
] as const;

type SourceBlock = {
  block_id: string;
  page_number: number;
  raw_text: string;
  raw_text_sha256: string;
};

type CoverageQueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: string;
  status: string;
  verdict: string;
  decision_ids: string[];
  resolved_occurrence_ids: string[];
  route_record_ids: string[];
  gtfs_route_ids: string[];
  treatment_record_ids: string[];
  treatment_families: string[];
};

type OccurrenceFixtureRow = {
  occurrence_id: string;
  founding_key: string;
  occurrence_review_decision_id: string | null;
  resolved_status: string;
  resolved_onset: { date: string | null; precision: string };
  study_projection_eligible: boolean;
  routes: Array<{ route_record_id: string; gtfs_route_id: string }>;
  treatment: {
    kind: string;
    member?: { treatment_record_id: string; treatment_family: string };
  };
  provenance: {
    event_record_ids: string[];
    relation_record_ids: string[];
    route_record_ids: string[];
    treatment_record_ids: string[];
  };
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function path(relativePath: string): string {
  return join(repoRoot, relativePath);
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path(relativePath), "utf8")) as T;
}

function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(path(relativePath), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function requiredRecord(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  recordId: string,
  kind: MtaCanonicalRecord["record_kind"],
): MtaCanonicalRecord {
  const record = recordsById.get(recordId);
  expect(record, `missing ${recordId}`).toBeDefined();
  expect(record?.record_kind).toBe(kind);
  expect(record?.truth_status).toBe("source_stated");
  expect(record?.review_state).not.toBe("quarantined");
  expect(record?.source_ids).toContain(sourceId);
  return record!;
}

function expectRelation(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  relationId: string,
  relationKind: string,
  objectId: string,
): void {
  const relation = requiredRecord(recordsById, relationId, "relation");
  expect(relation.payload).toMatchObject({
    relation_kind: relationKind,
    subject_id: projectId,
    object_id: objectId,
    assertion_status: "delivered",
    as_of_date: "2025-12-08",
  });
}

describe("December 2025 B60/B68/M57 ACE warning-phase cohort", () => {
  it("pins the official source, exact date resolution, and bounded canonical graph", () => {
    const receiptPath =
      "data/quality/acquisition/receipts/ace-b60-b68-m57-warning-phase-december-8-2025.json";
    expect(sha256(readFileSync(path(receiptPath)))).toBe(
      "7b9d63000090cf22821949db5087d2b2b5611ada41059cc5069aaf356c159fdb",
    );

    const artifactHashes = {
      "metadata.json": "641b84213f03daa8591e9fbc9f1d7325eea12daed2d55770448fe87173fa35d0",
      "source.pdf": "61b015b7778c176b182d4d81422aaf27c06f0ee6ad2953cb494cbff9453b2f19",
      "text.txt": "94e7d39757e0cb7c39f580341d8fdb990c2637be87c7ece9bee55a83a83bd68e",
      "blocks.jsonl": "068d54b750065e0a05d2b1b696d64eaf5171763908626207115060c5bf7f7ee7",
    } as const;
    for (const [filename, expectedHash] of Object.entries(artifactHashes)) {
      expect(sha256(readFileSync(path(`raw/sources/${sourceId}/${filename}`)))).toBe(expectedHash);
    }

    const blocks = new Map(
      readJsonl<SourceBlock>(`raw/sources/${sourceId}/blocks.jsonl`).map((block) => [block.block_id, block]),
    );
    for (const [blockId, page, expectedHash, literals] of [
      [
        "p001_c0002",
        1,
        "sha256:1c2e7d7242d4937bffeb7ae2ac5b4071b084298424eb1637e9c216f6f292d64f",
        ["December 2025"],
      ],
      [
        "p003_c0003",
        3,
        "sha256:da018863a9eae42e35f1a801fc448de9d224d07d24d389b5c264e09564cfb624",
        ["December 15, 2025"],
      ],
      [
        "p010_c0011",
        10,
        "sha256:e147dfa103fac9d1499e269c62864619e13cdfd4b3540e71e98ebfb706cd1a42",
        ["On December 8", "the B68 and B60 in Brooklyn and the M57 in Manhattan entered a 60-day warning phase"],
      ],
      [
        "p011_c0009",
        11,
        "sha256:2d2318454276de1fad6ef39bbd54826456515f6b382b2a9e95ab426545adf858",
        ["lanes, bus stops, or double-parked received warning notices"],
      ],
    ] as const) {
      const block = blocks.get(blockId);
      expect(block).toMatchObject({ page_number: page, raw_text_sha256: expectedHash });
      for (const literal of literals) expect(block?.raw_text).toContain(literal);
    }

    const records = readCanonicalRecordsFromJsonl();
    const recordsById = new Map(records.map((record) => [record.record_id, record]));
    const event = requiredRecord(recordsById, eventId, "event");
    expect(event.payload).toMatchObject({
      event_kind: "ACE warning-phase activation",
      event_date: "December 8",
      event_date_normalized: {
        raw_text: "December 8",
        normalized_date: "2025-12-08",
        precision: "day",
      },
      event_family: "implementation",
      lifecycle_phase: "expanded",
      date_normalized: "2025-12-08",
      date_precision: "day",
    });
    expect(String(event.payload.description)).toContain("does not establish the later fine-bearing start date");

    const project = requiredRecord(recordsById, projectId, "project");
    expect(project.payload).toMatchObject({
      project_family: "enforcement_program",
      status: "implemented",
      document_time_status: "implemented",
      implementation_date: "2025-12-08",
      date_normalized: "2025-12-08",
      date_precision: "day",
    });
    const treatment = requiredRecord(recordsById, treatmentId, "treatment_component");
    expect(treatment.payload).toMatchObject({
      treatment_kind: "Automated Camera Enforcement (ACE) 60-day warning-phase activation",
      treatment_family: "automated_bus_lane_enforcement",
      location_text: "B60, B68, and M57",
      implementation_date: "2025-12-08",
    });
    expect(String(treatment.payload.description)).toContain("does not claim that fines began that day");

    expectRelation(recordsById, relations.timeline, "has_timeline_event", eventId);
    expectRelation(recordsById, relations.treatment, "has_treatment", treatmentId);
    expectRelation(
      recordsById,
      relations.hierarchy,
      "part_of_program",
      "project_ace-automated-camera-enforcement",
    );
    for (const route of relations.routes) {
      const routeRecord = requiredRecord(recordsById, route.routeRecordId, "route");
      expect(routeRecord.payload.route_id).toBe(route.gtfsRouteId);
      expectRelation(recordsById, route.relationId, "affects_route", route.routeRecordId);
    }

    const projectRelationIds = records
      .filter((record) => record.record_kind === "relation" && record.payload.subject_id === projectId)
      .map((record) => record.record_id)
      .sort();
    expect(projectRelationIds).toEqual(
      [relations.timeline, relations.treatment, relations.hierarchy, ...relations.routes.map((route) => route.relationId)].sort(),
    );
    for (const relationId of ["relation_ace-covers-b60", "relation_ace-covers-b68", "relation_ace-covers-m57"]) {
      expect(recordsById.has(relationId)).toBeFalse();
    }
    const correctionIds = new Set(readSemanticCorrections().map((correction) => correction.correction_id));
    for (const routeId of ["b60", "b68", "m57"]) {
      expect(correctionIds).toContain(
        `core-coverage-ace-dec2025-10-retract-umbrella-covers-${routeId}-20260713`,
      );
    }
  });

  it("preserves the retired interpretation and promotes one exact non-leaking occurrence", () => {
    const activeOldDecision = `data/operational-anchor-review/ledger-decisions/decisions/${oldDecisionId}.json`;
    const retiredPath = `data/operational-anchor-review/ledger-decisions/retired/${oldDecisionId}.json`;
    expect(existsSync(path(activeOldDecision))).toBeFalse();
    expect(sha256(readFileSync(path(retiredPath)))).toBe(
      "acd4e0d13683fd4e5509595a93b2653b4a66cd9c25f509805acbb1a2bbcc5ab6",
    );
    const retired = readJson<{
      retired_decision_id: string;
      retired_decision_sha256: string;
      replacement_context: {
        occurrence_id: string;
        successor_gap_ids: string[];
        successor_decision_ids: string[];
        explicit_non_claim: string;
      };
      original_decision: { gap_id: string; verdict: string };
    }>(retiredPath);
    expect(retired).toMatchObject({
      retired_decision_id: oldDecisionId,
      retired_decision_sha256: oldDecisionSha256,
      original_decision: { gap_id: oldGapId, verdict: "not_applicable" },
      replacement_context: {
        occurrence_id: occurrenceId,
        successor_gap_ids: successorGaps.map((gap) => gap.gapId),
        successor_decision_ids: successorGaps.map((gap) => gap.decisionId),
        explicit_non_claim: "No fine-bearing enforcement onset is inferred.",
      },
    });

    const decisionPath =
      `data/operational-occurrence-review/accepted/decisions/${occurrenceDecisionId}.json`;
    expect(sha256(readFileSync(path(decisionPath)))).toBe(
      "9ef28a070ba393880b4b9e83406e4d323e594198448f9db04fc9f3b76fa48c8e",
    );
    const decisions = loadOperationalOccurrenceAcceptedDecisions().filter(
      (decision) => decision.decision_id === occurrenceDecisionId,
    );
    expect(decisions).toHaveLength(1);
    const decision = decisions[0]!;
    expect(decision).toMatchObject({
      review_state: "approved",
      occurrence_id: occurrenceId,
      founding_key: foundingKey,
      observation_event_record_ids: [eventId],
      resolved_status: "realized",
      resolved_onset: { date: "2025-12-08", precision: "day" },
      treatment_scope_kind: "atomic",
      treatment: {
        kind: "atomic",
        member: {
          treatment_record_id: treatmentId,
          treatment_family: "automated_bus_lane_enforcement",
        },
      },
    });
    const occurrenceRelations = [
      relations.timeline,
      relations.treatment,
      ...relations.routes.map((route) => route.relationId),
    ].sort();
    expect([...decision.observation_relation_record_ids].sort()).toEqual(occurrenceRelations);
    expect(decision.observation_relation_record_ids).not.toContain(relations.hierarchy);
    expect(decision.routes.map((route) => [route.gtfs_route_id, route.route_record_id])).toEqual(
      relations.routes.map((route) => [route.gtfsRouteId, route.routeRecordId]),
    );
    expect(decision.rationale).toContain("does not infer that fine-bearing enforcement began on December 8");
    expect(`occurrence:${sha256(foundingKey).slice(0, 24)}`).toBe(occurrenceId);

    const identities = loadOperationalOccurrenceIdentityRegistry().filter(
      (identity) => identity.occurrence_id === occurrenceId || identity.founding_key === foundingKey,
    );
    expect(identities).toHaveLength(1);
    expect(identities[0]).toMatchObject({
      occurrence_id: occurrenceId,
      founding_key: foundingKey,
      founding_event_record_ids: [eventId],
      decision_id: occurrenceDecisionId,
      tombstoned: false,
      aliases: [],
    });

    const fixtureRows = readJsonl<OccurrenceFixtureRow>(
      "data/contract-fixtures/operational-occurrences-v1/operational_occurrences.jsonl",
    ).filter((row) => row.occurrence_id === occurrenceId);
    expect(fixtureRows).toHaveLength(1);
    expect(fixtureRows[0]).toMatchObject({
      founding_key: foundingKey,
      occurrence_review_decision_id: occurrenceDecisionId,
      resolved_status: "realized",
      resolved_onset: { date: "2025-12-08", precision: "day" },
      study_projection_eligible: true,
      treatment: {
        kind: "atomic",
        member: {
          treatment_record_id: treatmentId,
          treatment_family: "automated_bus_lane_enforcement",
        },
      },
      provenance: {
        event_record_ids: [eventId],
        relation_record_ids: occurrenceRelations,
        route_record_ids: relations.routes.map((route) => route.routeRecordId),
        treatment_record_ids: [treatmentId],
      },
    });
    expect(fixtureRows[0]?.routes.map((route) => route.gtfs_route_id)).toEqual(["B60", "B68", "M57"]);
    expect(fixtureRows[0]?.provenance.relation_record_ids).not.toContain(relations.hierarchy);
  });

  it("terminalizes both successor diagnostics and keeps all search receipts on the final corpus", () => {
    const queue = readJsonl<CoverageQueueRow>("data/quality/operational-coverage/priority-queue.jsonl");
    expect(queue).toHaveLength(494);
    expect(queue.filter((row) => row.status === "open")).toHaveLength(0);
    expect(queue.filter((row) => row.status === "terminal")).toHaveLength(494);
    const eventRows = queue.filter((row) => row.event_record_id === eventId);
    expect(eventRows).toHaveLength(2);
    for (const gap of successorGaps) {
      const row = eventRows.find((candidate) => candidate.gap_id === gap.gapId);
      expect(row).toMatchObject({
        dimension: gap.dimension,
        status: "terminal",
        verdict: "not_applicable",
        decision_ids: [gap.decisionId],
        resolved_occurrence_ids: [occurrenceId],
        route_record_ids: relations.routes.map((route) => route.routeRecordId),
        gtfs_route_ids: ["B60", "B68", "M57"],
        treatment_record_ids: [treatmentId],
        treatment_families: ["automated_bus_lane_enforcement"],
      });
      const decisionPath = `data/operational-anchor-review/ledger-decisions/decisions/${gap.decisionId}.json`;
      expect(sha256(readFileSync(path(decisionPath)))).toBe(gap.decisionSha256);
      expect(readJson<{ gap_id: string; verdict: string }>(decisionPath)).toMatchObject({
        gap_id: gap.gapId,
        verdict: "not_applicable",
      });
    }
    expect(queue.some((row) => row.gap_id === oldGapId)).toBeFalse();

    const manifest = readJson<{ corpus_fingerprint: string; occurrence_identity_count: number }>(
      "data/quality/operational-coverage/manifest.json",
    );
    expect(manifest.occurrence_identity_count).toBe(135);
    for (const receiptName of [
      "broadway-center-running-lane-exact-onset-search",
      "dekalb-lafayette-summer-2024-temp-lanes-exact-onset-search",
      "tremont-queue-jump-fall-2024-exact-onset-search",
    ]) {
      const receipt = readJson<{ corpus_fingerprint: string }>(
        `data/operational-anchor-review/ledger-decisions/search-receipts/${receiptName}.json`,
      );
      expect(receipt.corpus_fingerprint).toBe(manifest.corpus_fingerprint);
    }
  });
});
