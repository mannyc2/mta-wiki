import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types.js";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read.js";
import {
  loadOperationalOccurrenceIdentityRegistry,
  type OperationalOccurrenceIdentityEntry,
} from "../packages/pipeline/src/materialize/operational-occurrence-identity.js";
import {
  loadOperationalOccurrenceAcceptedDecisions,
  type OperationalOccurrenceAcceptedDecision,
} from "../packages/pipeline/src/materialize/operational-occurrence-review.js";
import {
  parseOperationalCoverageAcceptedDecision,
  type OperationalCoverageAcceptedDecision,
  type OperationalCoverageDecisionEvidenceRef,
  type OperationalCoverageDimension,
} from "../packages/pipeline/src/quality/operational-coverage.js";

const REVIEWER = "codex-corpus-completion-2026-07-13";
const OCCURRENCE_ACCEPTED_AT = "2026-07-13T20:15:00.000Z";
const DECIDED_AT = "2026-07-13T20:20:00.000Z";
const PROGRAM_PROJECT_ID = "project_ace-automated-camera-enforcement";
const APRIL_EVENT_ID = "event_ace-expansion-manhattan-apr2025";
const APRIL_TIMELINE_RELATION_ID = "relation_ace-project-has-event-expansion";
const queuePath = join(repoRoot, "data/quality/operational-coverage/priority-queue.jsonl");
const decisionDir = join(repoRoot, "data/operational-anchor-review/ledger-decisions/decisions");

type QueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: OperationalCoverageDimension;
  priority: boolean;
  status: "open" | "ready_for_review" | "terminal";
  verdict: string;
  decision_ids: string[];
  resolved_occurrence_ids: string[];
};

type CohortSpec = {
  projectId: string;
  eventId: string;
  treatmentId: string;
  timelineRelationId: string;
  treatmentRelationId: string;
  partOfRelationId: string;
  routeRelations: Array<{ relationId: string; routeRecordId: string; gtfsRouteId: string }>;
  date: string;
  occurrenceDecisionId: string;
  occurrenceId: string;
};

type GapSpec = {
  gapId: string;
  eventId: string;
  dimension: OperationalCoverageDimension;
  decisionId: string;
  disposition: "approved_occurrence" | "prospective_forecast";
  occurrenceId: string | null;
};

const cohortSpecs: CohortSpec[] = [
  {
    projectId: "project_ace-m2-m4-implementation-2025-05-19",
    eventId: "event_ace-m2-m4-implementation-2025-05-19",
    treatmentId: "treatment_ace-m2-m4-implementation-2025-05-19",
    timelineRelationId: "relation_ace-m2-m4-has-implementation-2025-05-19",
    treatmentRelationId: "relation_ace-m2-m4-may19-has-enforcement",
    partOfRelationId: "relation_ace-m2-m4-may19-part-of-program",
    routeRelations: [
      {
        relationId: "relation_ace-m2-m4-2025-05-19-affects-m2",
        routeRecordId: "route_m2-ace",
        gtfsRouteId: "M2",
      },
      {
        relationId: "relation_ace-m2-m4-2025-05-19-affects-m4",
        routeRecordId: "route_m4-ace",
        gtfsRouteId: "M4",
      },
    ],
    date: "2025-05-19",
    occurrenceDecisionId: "ace-m2-m4-implementation-2025-05-19",
    occurrenceId: "occurrence:2eb555e5b3999b7cdaae5004",
  },
  {
    projectId: "project_ace-m42-m100-bx5-implementation-2025-05-27",
    eventId: "event_ace-m42-m100-bx5-implementation-2025-05-27",
    treatmentId: "treatment_ace-m42-m100-bx5-implementation-2025-05-27",
    timelineRelationId: "relation_ace-m42-m100-bx5-has-implementation-2025-05-27",
    treatmentRelationId: "relation_ace-m42-m100-bx5-may27-has-enforcement",
    partOfRelationId: "relation_ace-m42-m100-bx5-may27-part-of-program",
    routeRelations: [
      {
        relationId: "relation_ace-m42-m100-bx5-2025-05-27-affects-bx5",
        routeRecordId: "route_bx5-addendum-update",
        gtfsRouteId: "BX5",
      },
      {
        relationId: "relation_ace-m42-m100-bx5-2025-05-27-affects-m100",
        routeRecordId: "route_m100-ace",
        gtfsRouteId: "M100",
      },
      {
        relationId: "relation_ace-m42-m100-bx5-2025-05-27-affects-m42",
        routeRecordId: "route_m42-ace",
        gtfsRouteId: "M42",
      },
    ],
    date: "2025-05-27",
    occurrenceDecisionId: "ace-m42-m100-bx5-implementation-2025-05-27",
    occurrenceId: "occurrence:475b9dffbfed4fbc29dd53ac",
  },
];

const gapSpecs: GapSpec[] = [
  {
    gapId: "operational-coverage:ca2e33eccdceaa4780832e0b",
    eventId: cohortSpecs[0]!.eventId,
    dimension: "route",
    decisionId: "ace-may19-2025-route-gap-superseded-by-approved-occurrence",
    disposition: "approved_occurrence",
    occurrenceId: cohortSpecs[0]!.occurrenceId,
  },
  {
    gapId: "operational-coverage:244705ab490add8ae436a82c",
    eventId: cohortSpecs[0]!.eventId,
    dimension: "treatment",
    decisionId: "ace-may19-2025-treatment-gap-superseded-by-approved-occurrence",
    disposition: "approved_occurrence",
    occurrenceId: cohortSpecs[0]!.occurrenceId,
  },
  {
    gapId: "operational-coverage:e7726fa5b81a59a2bf817e87",
    eventId: cohortSpecs[1]!.eventId,
    dimension: "route",
    decisionId: "ace-may27-2025-route-gap-superseded-by-approved-occurrence",
    disposition: "approved_occurrence",
    occurrenceId: cohortSpecs[1]!.occurrenceId,
  },
  {
    gapId: "operational-coverage:61b364969fed72337b4fbfc1",
    eventId: cohortSpecs[1]!.eventId,
    dimension: "treatment",
    decisionId: "ace-may27-2025-treatment-gap-superseded-by-approved-occurrence",
    disposition: "approved_occurrence",
    occurrenceId: cohortSpecs[1]!.occurrenceId,
  },
  {
    gapId: "operational-coverage:74d19eb5d2ce553225eb7ca3",
    eventId: APRIL_EVENT_ID,
    dimension: "delivered_status",
    decisionId: "ace-april-2025-plan-delivered-status-not-applicable",
    disposition: "prospective_forecast",
    occurrenceId: null,
  },
  {
    gapId: "operational-coverage:92bf38fc65618c3fbcf12e46",
    eventId: APRIL_EVENT_ID,
    dimension: "route",
    decisionId: "ace-april-2025-plan-route-scope-not-applicable",
    disposition: "prospective_forecast",
    occurrenceId: null,
  },
  {
    gapId: "operational-coverage:fec4c50f7496efd0858692df",
    eventId: APRIL_EVENT_ID,
    dimension: "treatment",
    decisionId: "ace-april-2025-plan-treatment-scope-not-applicable",
    disposition: "prospective_forecast",
    occurrenceId: null,
  },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function requiredRecord(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  recordId: string,
  kind?: MtaCanonicalRecord["record_kind"],
): MtaCanonicalRecord {
  const record = recordsById.get(recordId);
  assert(record, `Missing canonical record ${recordId}; apply the ACE May 2025 curation and materialize first`);
  if (kind) assert(record.record_kind === kind, `${recordId} is ${record.record_kind}, expected ${kind}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
  assert(record.evidence_refs.length > 0, `${recordId} lost source evidence`);
  return record;
}

function assertRelation(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  relationId: string,
  relationKind: string,
  subjectId: string,
  objectId: string,
  assertionStatus: "delivered" | "planned",
): MtaCanonicalRecord {
  const relation = requiredRecord(recordsById, relationId, "relation");
  assert(relation.payload.relation_kind === relationKind, `${relationId} relation kind changed`);
  assert(relation.payload.subject_id === subjectId, `${relationId} subject changed`);
  assert(relation.payload.object_id === objectId, `${relationId} object changed`);
  assert(relation.payload.assertion_status === assertionStatus, `${relationId} assertion status changed`);
  return relation;
}

function assertCanonicalGraph(records: readonly MtaCanonicalRecord[]): Map<string, MtaCanonicalRecord> {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  for (const spec of cohortSpecs) {
    const event = requiredRecord(recordsById, spec.eventId, "event");
    assert(event.payload.event_family === "implementation", `${spec.eventId} event family changed`);
    assert(event.payload.lifecycle_phase === "expanded", `${spec.eventId} lifecycle changed`);
    assert(event.payload.date_normalized === spec.date, `${spec.eventId} date changed`);
    assert(event.payload.date_precision === "day", `${spec.eventId} is no longer exact-day`);

    const project = requiredRecord(recordsById, spec.projectId, "project");
    assert(project.payload.status === "implemented", `${spec.projectId} status changed`);
    assert(project.payload.document_time_status === "implemented", `${spec.projectId} document-time status changed`);
    assert(project.payload.implementation_date === spec.date, `${spec.projectId} implementation date changed`);

    const treatment = requiredRecord(recordsById, spec.treatmentId, "treatment_component");
    assert(
      treatment.payload.treatment_family === "automated_bus_lane_enforcement",
      `${spec.treatmentId} treatment family changed`,
    );
    assert(treatment.payload.implementation_date === spec.date, `${spec.treatmentId} implementation date changed`);

    assertRelation(
      recordsById,
      spec.timelineRelationId,
      "has_timeline_event",
      spec.projectId,
      spec.eventId,
      "delivered",
    );
    assertRelation(
      recordsById,
      spec.treatmentRelationId,
      "has_treatment",
      spec.projectId,
      spec.treatmentId,
      "delivered",
    );
    assertRelation(
      recordsById,
      spec.partOfRelationId,
      "part_of_program",
      spec.projectId,
      PROGRAM_PROJECT_ID,
      "delivered",
    );
    for (const route of spec.routeRelations) {
      requiredRecord(recordsById, route.routeRecordId, "route");
      assertRelation(
        recordsById,
        route.relationId,
        "affects_route",
        spec.projectId,
        route.routeRecordId,
        "delivered",
      );
    }

    const projectRelations = records.filter(
      (record) => record.record_kind === "relation" && record.payload.subject_id === spec.projectId,
    );
    const relationIds = (kind: string): string[] =>
      projectRelations
        .filter((relation) => relation.payload.relation_kind === kind)
        .map((relation) => relation.record_id)
        .sort();
    assert(
      stableJson(relationIds("has_timeline_event") as unknown as JsonValue) ===
        stableJson([spec.timelineRelationId] as unknown as JsonValue),
      `${spec.projectId} timeline graph changed`,
    );
    assert(
      stableJson(relationIds("affects_route") as unknown as JsonValue) ===
        stableJson(spec.routeRelations.map((route) => route.relationId).sort() as unknown as JsonValue),
      `${spec.projectId} route graph is no longer bounded`,
    );
    assert(
      stableJson(relationIds("has_treatment") as unknown as JsonValue) ===
        stableJson([spec.treatmentRelationId] as unknown as JsonValue),
      `${spec.projectId} treatment graph is no longer atomic`,
    );
    assert(
      stableJson(relationIds("part_of_program") as unknown as JsonValue) ===
        stableJson([spec.partOfRelationId] as unknown as JsonValue),
      `${spec.projectId} program membership changed`,
    );
  }

  const aprilEvent = requiredRecord(recordsById, APRIL_EVENT_ID, "event");
  assert(aprilEvent.payload.event_family === "implementation", `${APRIL_EVENT_ID} event family changed`);
  assert(aprilEvent.payload.lifecycle_phase === "planned", `${APRIL_EVENT_ID} must remain planned`);
  assert(aprilEvent.payload.date_normalized === "2025-04", `${APRIL_EVENT_ID} date changed`);
  assert(aprilEvent.payload.date_precision === "month", `${APRIL_EVENT_ID} precision changed`);
  const aprilTimeline = assertRelation(
    recordsById,
    APRIL_TIMELINE_RELATION_ID,
    "has_timeline_event",
    PROGRAM_PROJECT_ID,
    APRIL_EVENT_ID,
    "planned",
  );
  assert(aprilTimeline.payload.as_of_date === "2025-03-24", `${APRIL_TIMELINE_RELATION_ID} as-of date changed`);
  return recordsById;
}

function assertPromotedOccurrence(
  decision: OperationalOccurrenceAcceptedDecision,
  identity: OperationalOccurrenceIdentityEntry,
  spec: CohortSpec,
): void {
  assert(decision.review_state === "approved", `${spec.occurrenceDecisionId} is not approved`);
  assert(decision.reviewer === REVIEWER, `${spec.occurrenceDecisionId} reviewer changed`);
  assert(decision.accepted_at === OCCURRENCE_ACCEPTED_AT, `${spec.occurrenceDecisionId} acceptance time changed`);
  assert(decision.occurrence_id === spec.occurrenceId, `${spec.occurrenceDecisionId} occurrence identity changed`);
  assert(decision.founding_key === `event:${spec.eventId}`, `${spec.occurrenceDecisionId} founding key changed`);
  assert(
    stableJson(decision.observation_event_record_ids as unknown as JsonValue) ===
      stableJson([spec.eventId] as unknown as JsonValue),
    `${spec.occurrenceDecisionId} founding event changed`,
  );
  const expectedRelationIds = [
    spec.timelineRelationId,
    spec.treatmentRelationId,
    ...spec.routeRelations.map((route) => route.relationId),
  ].sort();
  assert(
    stableJson([...decision.observation_relation_record_ids].sort() as unknown as JsonValue) ===
      stableJson(expectedRelationIds as unknown as JsonValue),
    `${spec.occurrenceDecisionId} observation graph changed`,
  );
  assert(decision.resolved_status === "realized", `${spec.occurrenceDecisionId} is no longer realized`);
  assert(decision.resolved_onset.date === spec.date, `${spec.occurrenceDecisionId} onset changed`);
  assert(decision.resolved_onset.precision === "day", `${spec.occurrenceDecisionId} lost exact-day precision`);
  assert(decision.resolved_onset.evidence_bindings.length > 0, `${spec.occurrenceDecisionId} onset lost evidence`);

  const routes = decision.routes
    .map((route) => ({ routeRecordId: route.route_record_id, gtfsRouteId: route.gtfs_route_id }))
    .sort((left, right) => left.gtfsRouteId.localeCompare(right.gtfsRouteId));
  const expectedRoutes = spec.routeRelations
    .map((route) => ({ routeRecordId: route.routeRecordId, gtfsRouteId: route.gtfsRouteId }))
    .sort((left, right) => left.gtfsRouteId.localeCompare(right.gtfsRouteId));
  assert(
    stableJson(routes as unknown as JsonValue) === stableJson(expectedRoutes as unknown as JsonValue),
    `${spec.occurrenceDecisionId} route scope changed`,
  );
  assert(decision.routes.every((route) => route.evidence_bindings.length > 0), `${spec.occurrenceDecisionId} route evidence changed`);
  assert(decision.treatment_scope_kind === "atomic", `${spec.occurrenceDecisionId} is no longer atomic`);
  assert(
    decision.treatment.kind === "atomic" &&
      decision.treatment.member.treatment_record_id === spec.treatmentId &&
      decision.treatment.member.treatment_family === "automated_bus_lane_enforcement" &&
      decision.treatment.member.evidence_bindings.length > 0,
    `${spec.occurrenceDecisionId} treatment scope changed`,
  );

  assert(identity.occurrence_id === spec.occurrenceId, `${spec.occurrenceId} registry identity changed`);
  assert(identity.founding_key === `event:${spec.eventId}`, `${spec.occurrenceId} registry founding key changed`);
  assert(
    stableJson(identity.founding_event_record_ids as unknown as JsonValue) === stableJson([spec.eventId] as unknown as JsonValue),
    `${spec.occurrenceId} registry founding event changed`,
  );
  assert(identity.decision_id === spec.occurrenceDecisionId, `${spec.occurrenceId} registry decision changed`);
  assert(identity.issued_at === OCCURRENCE_ACCEPTED_AT, `${spec.occurrenceId} registry issue time changed`);
  assert(identity.resolution_cluster_id === null, `${spec.occurrenceId} unexpectedly became a resolution cluster`);
  assert(!identity.tombstoned && identity.aliases.length === 0, `${spec.occurrenceId} registry state changed`);
}

function assertPromotion(): void {
  const accepted = loadOperationalOccurrenceAcceptedDecisions();
  const identities = loadOperationalOccurrenceIdentityRegistry();
  for (const spec of cohortSpecs) {
    const decisions = accepted.filter((candidate) => candidate.decision_id === spec.occurrenceDecisionId);
    assert(decisions.length === 1, `Apply approved occurrence ${spec.occurrenceDecisionId} before residual adjudication`);
    const identity = identities.find((candidate) => candidate.occurrence_id === spec.occurrenceId);
    assert(identity, `Missing persistent identity ${spec.occurrenceId}`);
    assertPromotedOccurrence(decisions[0]!, identity, spec);
  }
  assert(
    !accepted.some((decision) => decision.observation_event_record_ids.includes(APRIL_EVENT_ID)),
    `${APRIL_EVENT_ID} is a prospective forecast and must not be promoted`,
  );
  assert(
    !identities.some((identity) => identity.founding_event_record_ids.includes(APRIL_EVENT_ID)),
    `${APRIL_EVENT_ID} unexpectedly owns a persistent occurrence identity`,
  );
}

function evidenceRefs(event: MtaCanonicalRecord): OperationalCoverageDecisionEvidenceRef[] {
  return event.evidence_refs
    .map((ref) => {
      assert(ref.evidence_id, `${event.record_id} has an evidence ref without evidence_id`);
      return {
        record_id: event.record_id,
        source_id: ref.source_id,
        evidence_id: ref.evidence_id,
        block_id: ref.block_id ?? ref.evidence_id.split("#")[1] ?? null,
      };
    })
    .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));
}

function rationale(spec: GapSpec): string {
  if (spec.disposition === "approved_occurrence") {
    const cohort = cohortSpecs.find((candidate) => candidate.occurrenceId === spec.occurrenceId);
    assert(cohort, `Missing cohort for ${spec.gapId}`);
    const routeList = cohort.routeRelations.map((route) => route.gtfsRouteId).join(", ");
    return spec.dimension === "route"
      ? `Approved exact-day occurrence ${cohort.occurrenceId} binds the bounded ${cohort.date} ACE cohort only to ${routeList}. The broad raw route diagnostic is superseded by that reviewed occurrence; importing route scope from the umbrella ACE program would create an unsupported cross-product.`
      : `Approved exact-day occurrence ${cohort.occurrenceId} binds the bounded ${cohort.date} ACE cohort to one atomic automated_bus_lane_enforcement treatment. The broad raw treatment diagnostic is superseded by that reviewed occurrence; importing other treatments from the umbrella ACE program would create an unsupported cross-product.`;
  }
  if (spec.dimension === "delivered_status") {
    return "The March 24, 2025 source explicitly describes this April expansion as planned. It is faithful prospective history, not evidence that an operational occurrence was delivered, and the later exact-day May cohorts must not retroactively convert this forecast into a realized event.";
  }
  if (spec.dimension === "route") {
    return "The March 24, 2025 forecast names only two future Manhattan routes and does not identify them. Retrospectively assigning M2 and M4 from the separately reviewed May 19 occurrence would turn a prospective diagnostic into an unsupported duplicate, so route-scope adjudication is not applicable.";
  }
  return "The March 24, 2025 forecast describes a planned ACE program expansion but does not independently establish a delivered atomic treatment. The separately reviewed May occurrences preserve the realized treatment history without promoting or cross-joining this prospective diagnostic.";
}

function expectedDecision(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  spec: GapSpec,
): OperationalCoverageAcceptedDecision {
  const event = requiredRecord(recordsById, spec.eventId, "event");
  return parseOperationalCoverageAcceptedDecision(
    {
      schema_version: 1,
      decision_id: spec.decisionId,
      gap_id: spec.gapId,
      prior_verdict: "unreviewed",
      verdict: "not_applicable",
      reviewer: REVIEWER,
      decided_at: DECIDED_AT,
      rationale: rationale(spec),
      proposal_ids: [],
      evidence_refs: evidenceRefs(event),
      search_receipt_ids: [],
    },
    spec.decisionId,
  );
}

function stateCounts(queue: readonly QueueRow[]): { total: number; open: number; terminal: number; ready: number } {
  return {
    total: queue.length,
    open: queue.filter((row) => row.status === "open").length,
    terminal: queue.filter((row) => row.status === "terminal").length,
    ready: queue.filter((row) => row.status === "ready_for_review").length,
  };
}

function assertQueueInventory(queue: QueueRow[]): "pre" | "post" {
  const expectedByGap = new Map(gapSpecs.map((spec) => [spec.gapId, spec]));
  assert(expectedByGap.size === 7, `Expected seven unique ACE residual gaps, found ${expectedByGap.size}`);
  const targetEventIds = new Set([APRIL_EVENT_ID, ...cohortSpecs.map((spec) => spec.eventId)]);
  const eventRows = queue.filter((row) => targetEventIds.has(row.event_record_id));
  assert(eventRows.length === 7, `Expected exactly seven gaps across the three ACE events, found ${eventRows.length}`);
  assert(
    eventRows.every((row) => expectedByGap.has(row.gap_id)),
    `Unexpected ACE event gap(s): ${eventRows.filter((row) => !expectedByGap.has(row.gap_id)).map((row) => row.gap_id).join(", ")}`,
  );

  for (const row of eventRows) {
    const expected = expectedByGap.get(row.gap_id);
    assert(expected, `Unexpected target gap ${row.gap_id}`);
    assert(row.event_record_id === expected.eventId, `${row.gap_id} event identity changed`);
    assert(row.dimension === expected.dimension, `${row.gap_id} dimension changed`);
    assert(row.priority, `${row.gap_id} is no longer priority`);
    const expectedOccurrences = expected.occurrenceId ? [expected.occurrenceId] : [];
    assert(
      stableJson([...row.resolved_occurrence_ids].sort() as unknown as JsonValue) ===
        stableJson(expectedOccurrences as unknown as JsonValue),
      `${row.gap_id} occurrence resolution changed; promote both cohorts and rematerialize before adjudication`,
    );
  }

  const pre = eventRows.every(
    (row) => row.status === "open" && row.verdict === "unreviewed" && row.decision_ids.length === 0,
  );
  const post = eventRows.every((row) => {
    const expected = expectedByGap.get(row.gap_id)!;
    return (
      row.status === "terminal" &&
      row.verdict === "not_applicable" &&
      stableJson(row.decision_ids as unknown as JsonValue) === stableJson([expected.decisionId] as unknown as JsonValue)
    );
  });
  assert(pre || post, "The seven ACE residual gaps are in a mixed or unexpected review state");

  const counts = stateCounts(queue);
  const expectedCounts = pre
    ? { total: 488, open: 112, terminal: 376, ready: 0 }
    : { total: 488, open: 105, terminal: 383, ready: 0 };
  assert(
    stableJson(counts as unknown as JsonValue) === stableJson(expectedCounts as unknown as JsonValue),
    `Priority queue counts changed: ${JSON.stringify(counts)}`,
  );
  return pre ? "pre" : "post";
}

function writeOrVerifyDecisions(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  state: "pre" | "post",
  apply: boolean,
): { decisions: OperationalCoverageAcceptedDecision[]; written: number; verified: number; pending: number } {
  const decisions = gapSpecs.map((spec) => expectedDecision(recordsById, spec));
  if (apply) mkdirSync(decisionDir, { recursive: true });
  let written = 0;
  let verified = 0;
  let pending = 0;
  for (const decision of decisions) {
    const path = join(decisionDir, `${decision.decision_id}.json`);
    if (existsSync(path)) {
      const existing = JSON.parse(readFileSync(path, "utf8")) as JsonValue;
      assert(
        stableJson(existing) === stableJson(decision as unknown as JsonValue),
        `${path} conflicts with the generated decision`,
      );
      verified += 1;
      continue;
    }
    assert(state === "pre", `${path} is missing after the queue reached post-adjudication state`);
    if (apply) {
      writeFileSync(path, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
      written += 1;
    } else {
      pending += 1;
    }
  }
  return { decisions, written, verified, pending };
}

assert(cohortSpecs.length === 2, "Expected exactly two promoted ACE cohorts");
assert(gapSpecs.length === 7, "Expected exactly seven ACE residual gap decisions");
const records = readCanonicalRecordsFromJsonl();
const recordsById = assertCanonicalGraph(records);
assertPromotion();
const queue = readJsonl<QueueRow>(queuePath);
const state = assertQueueInventory(queue);
const apply = process.argv.includes("--apply");
const result = writeOrVerifyDecisions(recordsById, state, apply);

process.stdout.write(`${JSON.stringify({
  mode: apply ? "apply" : "dry_run",
  state,
  occurrence_ids: cohortSpecs.map((spec) => spec.occurrenceId),
  gap_count: result.decisions.length,
  written_count: result.written,
  verified_existing_count: result.verified,
  pending_count: result.pending,
  expected_post_counts: { total: 488, open: 105, terminal: 383, ready: 0 },
  decision_ids: result.decisions.map((decision) => decision.decision_id),
}, null, 2)}\n`);
