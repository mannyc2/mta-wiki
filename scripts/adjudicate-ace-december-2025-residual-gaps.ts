import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types.js";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read.js";
import { loadOperationalOccurrenceIdentityRegistry } from "../packages/pipeline/src/materialize/operational-occurrence-identity.js";
import { loadOperationalOccurrenceAcceptedDecisions } from "../packages/pipeline/src/materialize/operational-occurrence-review.js";
import {
  parseOperationalCoverageAcceptedDecision,
  type OperationalCoverageAcceptedDecision,
  type OperationalCoverageDecisionEvidenceRef,
  type OperationalCoverageDimension,
} from "../packages/pipeline/src/quality/operational-coverage.js";

const REVIEWER = "codex-corpus-completion-2026-07-13";
const DECIDED_AT = "2026-07-13T22:45:00.000Z";
const SOURCE_ID = "nyct_key_performance_metrics_doc194001";
const PROJECT_ID = "project_ace-b60-b68-m57-warning-cohort-2025-12-08";
const EVENT_ID = "event_ace-program-expansion-dec2025";
const TREATMENT_ID = "treatment_ace-b60-b68-m57-warning-phase-2025-12-08";
const TIMELINE_RELATION_ID = "relation_ace-b60-b68-m57-warning-has-activation-2025-12-08";
const TREATMENT_RELATION_ID = "relation_ace-b60-b68-m57-warning-has-treatment-2025-12-08";
const PART_OF_PROGRAM_RELATION_ID = "relation_ace-b60-b68-m57-warning-part-of-program";
const OCCURRENCE_DECISION_ID = "ace-b60-b68-m57-warning-phase-2025-12-08";
const OCCURRENCE_ID = "occurrence:1ed365a241353614f72f025e";
const EVENT_DATE = "2025-12-08";
const queuePath = join(repoRoot, "data/quality/operational-coverage/priority-queue.jsonl");
const decisionDir = join(repoRoot, "data/operational-anchor-review/ledger-decisions/decisions");

const routeSpecs = [
  {
    relationId: "relation_ace-b60-b68-m57-2025-12-08-affects-b60",
    routeRecordId: "route_b60",
    gtfsRouteId: "B60",
  },
  {
    relationId: "relation_ace-b60-b68-m57-2025-12-08-affects-b68",
    routeRecordId: "route_b68-nyct-2025",
    gtfsRouteId: "B68",
  },
  {
    relationId: "relation_ace-b60-b68-m57-2025-12-08-affects-m57",
    routeRecordId: "route_m57-nyct-2025",
    gtfsRouteId: "M57",
  },
] as const;

const gapSpecs = [
  {
    gapId: "operational-coverage:cb81df5ab159c18671171291",
    dimension: "route",
    decisionId:
      "ace-b60-b68-m57-warning-phase-2025-12-08-route-gap-superseded-by-approved-occurrence",
  },
  {
    gapId: "operational-coverage:64381715a1777d38c32034f4",
    dimension: "treatment",
    decisionId:
      "ace-b60-b68-m57-warning-phase-2025-12-08-treatment-gap-superseded-by-approved-occurrence",
  },
] as const satisfies readonly {
  gapId: string;
  dimension: OperationalCoverageDimension;
  decisionId: string;
}[];

type QueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: OperationalCoverageDimension;
  priority: boolean;
  status: "open" | "ready_for_review" | "terminal";
  verdict: string;
  decision_ids: string[];
  resolved_occurrence_ids: string[];
  route_record_ids: string[];
  gtfs_route_ids: string[];
  treatment_record_ids: string[];
  treatment_families: string[];
};

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
  kind: MtaCanonicalRecord["record_kind"],
): MtaCanonicalRecord {
  const record = recordsById.get(recordId);
  assert(record, `Missing canonical record ${recordId}`);
  assert(record.record_kind === kind, `${recordId} is ${record.record_kind}, expected ${kind}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
  assert(record.source_ids.includes(SOURCE_ID), `${recordId} lost source ${SOURCE_ID}`);
  assert(record.evidence_refs.length > 0, `${recordId} lost source evidence`);
  return record;
}

function assertRelation(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  relationId: string,
  relationKind: string,
  objectId: string,
): void {
  const relation = requiredRecord(recordsById, relationId, "relation");
  assert(relation.payload.relation_kind === relationKind, `${relationId} kind changed`);
  assert(relation.payload.subject_id === PROJECT_ID, `${relationId} subject changed`);
  assert(relation.payload.object_id === objectId, `${relationId} object changed`);
  assert(relation.payload.assertion_status === "delivered", `${relationId} is not delivered`);
  assert(relation.payload.as_of_date === EVENT_DATE, `${relationId} as_of_date changed`);
}

function assertCanonicalGraph(records: readonly MtaCanonicalRecord[]): Map<string, MtaCanonicalRecord> {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const event = requiredRecord(recordsById, EVENT_ID, "event");
  assert(event.payload.event_family === "implementation", `${EVENT_ID} family changed`);
  assert(event.payload.lifecycle_phase === "expanded", `${EVENT_ID} is no longer realized`);
  assert(event.payload.event_date === "December 8", `${EVENT_ID} source literal changed`);
  assert(event.payload.date_normalized === EVENT_DATE, `${EVENT_ID} date changed`);
  assert(event.payload.date_precision === "day", `${EVENT_ID} lost exact-day precision`);

  const project = requiredRecord(recordsById, PROJECT_ID, "project");
  assert(project.payload.status === "implemented", `${PROJECT_ID} status changed`);
  assert(project.payload.document_time_status === "implemented", `${PROJECT_ID} document-time status changed`);
  assert(project.payload.implementation_date === EVENT_DATE, `${PROJECT_ID} date changed`);

  const treatment = requiredRecord(recordsById, TREATMENT_ID, "treatment_component");
  assert(
    treatment.payload.treatment_family === "automated_bus_lane_enforcement",
    `${TREATMENT_ID} family changed`,
  );
  assert(treatment.payload.implementation_date === EVENT_DATE, `${TREATMENT_ID} date changed`);
  assert(
    String(treatment.payload.description).includes("does not claim that fines began"),
    `${TREATMENT_ID} lost the fine-bearing non-claim`,
  );

  assertRelation(recordsById, TIMELINE_RELATION_ID, "has_timeline_event", EVENT_ID);
  assertRelation(recordsById, TREATMENT_RELATION_ID, "has_treatment", TREATMENT_ID);
  assertRelation(
    recordsById,
    PART_OF_PROGRAM_RELATION_ID,
    "part_of_program",
    "project_ace-automated-camera-enforcement",
  );
  for (const route of routeSpecs) {
    requiredRecord(recordsById, route.routeRecordId, "route");
    assertRelation(recordsById, route.relationId, "affects_route", route.routeRecordId);
  }

  const projectRelations = records.filter(
    (record) => record.record_kind === "relation" && record.payload.subject_id === PROJECT_ID,
  );
  const idsFor = (kind: string): string[] =>
    projectRelations
      .filter((record) => record.payload.relation_kind === kind)
      .map((record) => record.record_id)
      .sort();
  assert(
    stableJson(idsFor("has_timeline_event") as unknown as JsonValue) ===
      stableJson([TIMELINE_RELATION_ID] as unknown as JsonValue),
    `${PROJECT_ID} timeline graph changed`,
  );
  assert(
    stableJson(idsFor("has_treatment") as unknown as JsonValue) ===
      stableJson([TREATMENT_RELATION_ID] as unknown as JsonValue),
    `${PROJECT_ID} treatment graph is no longer atomic`,
  );
  assert(
    stableJson(idsFor("affects_route") as unknown as JsonValue) ===
      stableJson(routeSpecs.map((route) => route.relationId).sort() as unknown as JsonValue),
    `${PROJECT_ID} route graph is no longer bounded`,
  );
  return recordsById;
}

function assertPromotion(): void {
  const accepted = loadOperationalOccurrenceAcceptedDecisions().filter(
    (decision) => decision.decision_id === OCCURRENCE_DECISION_ID,
  );
  assert(accepted.length === 1, `Apply approved occurrence ${OCCURRENCE_DECISION_ID} first`);
  const decision = accepted[0]!;
  assert(decision.review_state === "approved", `${OCCURRENCE_DECISION_ID} is not approved`);
  assert(decision.occurrence_id === OCCURRENCE_ID, `${OCCURRENCE_DECISION_ID} occurrence changed`);
  assert(decision.founding_key === `event:${EVENT_ID}`, `${OCCURRENCE_DECISION_ID} founding key changed`);
  assert(
    stableJson(decision.observation_event_record_ids as unknown as JsonValue) ===
      stableJson([EVENT_ID] as unknown as JsonValue),
    `${OCCURRENCE_DECISION_ID} founding event changed`,
  );
  const expectedRelationIds = [
    TIMELINE_RELATION_ID,
    TREATMENT_RELATION_ID,
    ...routeSpecs.map((route) => route.relationId),
  ].sort();
  assert(
    stableJson([...decision.observation_relation_record_ids].sort() as unknown as JsonValue) ===
      stableJson(expectedRelationIds as unknown as JsonValue),
    `${OCCURRENCE_DECISION_ID} observation graph changed`,
  );
  assert(
    !decision.observation_relation_record_ids.includes(PART_OF_PROGRAM_RELATION_ID),
    `${OCCURRENCE_DECISION_ID} imported umbrella program scope`,
  );
  assert(decision.resolved_status === "realized", `${OCCURRENCE_DECISION_ID} is not realized`);
  assert(decision.resolved_onset.date === EVENT_DATE, `${OCCURRENCE_DECISION_ID} onset changed`);
  assert(decision.resolved_onset.precision === "day", `${OCCURRENCE_DECISION_ID} precision changed`);
  assert(decision.treatment_scope_kind === "atomic", `${OCCURRENCE_DECISION_ID} is not atomic`);
  assert(
    decision.treatment.kind === "atomic" &&
      decision.treatment.member.treatment_record_id === TREATMENT_ID &&
      decision.treatment.member.treatment_family === "automated_bus_lane_enforcement",
    `${OCCURRENCE_DECISION_ID} treatment changed`,
  );
  const actualRoutes = decision.routes
    .map((route) => ({ routeRecordId: route.route_record_id, gtfsRouteId: route.gtfs_route_id }))
    .sort((left, right) => left.gtfsRouteId.localeCompare(right.gtfsRouteId));
  const expectedRoutes = routeSpecs
    .map((route) => ({ routeRecordId: route.routeRecordId, gtfsRouteId: route.gtfsRouteId }))
    .sort((left, right) => left.gtfsRouteId.localeCompare(right.gtfsRouteId));
  assert(
    stableJson(actualRoutes as unknown as JsonValue) === stableJson(expectedRoutes as unknown as JsonValue),
    `${OCCURRENCE_DECISION_ID} route scope changed`,
  );

  const identities = loadOperationalOccurrenceIdentityRegistry().filter(
    (identity) => identity.occurrence_id === OCCURRENCE_ID,
  );
  assert(identities.length === 1, `Missing unique identity ${OCCURRENCE_ID}`);
  const identity = identities[0]!;
  assert(identity.founding_key === `event:${EVENT_ID}`, `${OCCURRENCE_ID} founding key changed`);
  assert(identity.decision_id === OCCURRENCE_DECISION_ID, `${OCCURRENCE_ID} decision changed`);
  assert(!identity.tombstoned, `${OCCURRENCE_ID} is tombstoned`);
}

function evidenceRefs(event: MtaCanonicalRecord): OperationalCoverageDecisionEvidenceRef[] {
  return event.evidence_refs
    .map((ref) => {
      assert(ref.evidence_id, `${EVENT_ID} has an evidence ref without evidence_id`);
      return {
        record_id: EVENT_ID,
        source_id: ref.source_id,
        evidence_id: ref.evidence_id,
        block_id: ref.block_id ?? ref.evidence_id.split("#")[1] ?? null,
      };
    })
    .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));
}

function expectedDecision(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  spec: (typeof gapSpecs)[number],
): OperationalCoverageAcceptedDecision {
  const event = requiredRecord(recordsById, EVENT_ID, "event");
  const rationale =
    spec.dimension === "route"
      ? `Approved exact-day occurrence ${OCCURRENCE_ID} binds the bounded December 8, 2025 ACE warning-phase cohort only to B60, B68, and M57. The broad raw route diagnostic is superseded by that reviewed occurrence; importing route candidates or route scope from the umbrella ACE program would create an unsupported cross-product.`
      : `Approved exact-day occurrence ${OCCURRENCE_ID} binds the bounded December 8, 2025 ACE warning-phase cohort to one atomic automated_bus_lane_enforcement treatment. The broad raw treatment diagnostic is superseded by that reviewed occurrence. Warning-phase activation is the operational onset here, without inferring a later fine-bearing enforcement date.`;
  return parseOperationalCoverageAcceptedDecision(
    {
      schema_version: 1,
      decision_id: spec.decisionId,
      gap_id: spec.gapId,
      prior_verdict: "unreviewed",
      verdict: "not_applicable",
      reviewer: REVIEWER,
      decided_at: DECIDED_AT,
      rationale,
      proposal_ids: [],
      evidence_refs: evidenceRefs(event),
      search_receipt_ids: [],
    },
    spec.decisionId,
  );
}

function queueCounts(queue: readonly QueueRow[]): { total: number; open: number; terminal: number; ready: number } {
  return {
    total: queue.length,
    open: queue.filter((row) => row.status === "open").length,
    terminal: queue.filter((row) => row.status === "terminal").length,
    ready: queue.filter((row) => row.status === "ready_for_review").length,
  };
}

function assertQueueInventory(queue: readonly QueueRow[]): "pre" | "post" {
  const rows = queue.filter((row) => row.event_record_id === EVENT_ID);
  assert(rows.length === 2, `Expected exactly two ${EVENT_ID} priority gaps, found ${rows.length}`);
  const expectedByGap = new Map(gapSpecs.map((spec) => [spec.gapId, spec]));
  for (const row of rows) {
    const spec = expectedByGap.get(row.gap_id);
    assert(spec, `Unexpected ${EVENT_ID} gap ${row.gap_id}`);
    assert(row.dimension === spec.dimension, `${row.gap_id} dimension changed`);
    assert(row.priority, `${row.gap_id} is no longer priority`);
    assert(
      stableJson(row.resolved_occurrence_ids as unknown as JsonValue) ===
        stableJson([OCCURRENCE_ID] as unknown as JsonValue),
      `${row.gap_id} is not resolved to ${OCCURRENCE_ID}; regenerate coverage after promotion`,
    );
    assert(
      stableJson([...row.route_record_ids].sort() as unknown as JsonValue) ===
        stableJson(routeSpecs.map((route) => route.routeRecordId).sort() as unknown as JsonValue),
      `${row.gap_id} resolved route scope changed`,
    );
    assert(
      stableJson([...row.gtfs_route_ids].sort() as unknown as JsonValue) ===
        stableJson(routeSpecs.map((route) => route.gtfsRouteId).sort() as unknown as JsonValue),
      `${row.gap_id} GTFS route scope changed`,
    );
    assert(
      stableJson(row.treatment_record_ids as unknown as JsonValue) ===
        stableJson([TREATMENT_ID] as unknown as JsonValue),
      `${row.gap_id} treatment scope changed`,
    );
    assert(
      stableJson(row.treatment_families as unknown as JsonValue) ===
        stableJson(["automated_bus_lane_enforcement"] as unknown as JsonValue),
      `${row.gap_id} treatment family changed`,
    );
  }

  const pre = rows.every(
    (row) => row.status === "open" && row.verdict === "unreviewed" && row.decision_ids.length === 0,
  );
  const post = rows.every((row) => {
    const spec = expectedByGap.get(row.gap_id)!;
    return (
      row.status === "terminal" &&
      row.verdict === "not_applicable" &&
      stableJson(row.decision_ids as unknown as JsonValue) ===
        stableJson([spec.decisionId] as unknown as JsonValue)
    );
  });
  assert(pre || post, `The ${EVENT_ID} gaps are in a mixed or unexpected review state`);
  const expectedCounts = pre
    ? { total: 489, open: 2, terminal: 487, ready: 0 }
    : { total: 489, open: 0, terminal: 489, ready: 0 };
  const actualCounts = queueCounts(queue);
  assert(
    stableJson(actualCounts as unknown as JsonValue) === stableJson(expectedCounts as unknown as JsonValue),
    `Priority queue counts changed: ${JSON.stringify(actualCounts)}`,
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
    assert(state === "pre", `${path} is missing after post-adjudication coverage`);
    if (apply) {
      writeFileSync(path, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
      written += 1;
    } else {
      pending += 1;
    }
  }
  return { decisions, written, verified, pending };
}

assert(gapSpecs.length === 2, "Expected exactly two December 2025 ACE residual gaps");
const recordsById = assertCanonicalGraph(readCanonicalRecordsFromJsonl());
assertPromotion();
const queue = readJsonl<QueueRow>(queuePath);
const state = assertQueueInventory(queue);
const apply = process.argv.includes("--apply");
const result = writeOrVerifyDecisions(recordsById, state, apply);

process.stdout.write(
  `${JSON.stringify(
    {
      mode: apply ? "apply" : "dry_run",
      state,
      occurrence_id: OCCURRENCE_ID,
      gap_count: result.decisions.length,
      written_count: result.written,
      verified_existing_count: result.verified,
      pending_count: result.pending,
      expected_post_counts: { total: 489, open: 0, terminal: 489, ready: 0 },
      decision_ids: result.decisions.map((decision) => decision.decision_id),
    },
    null,
    2,
  )}\n`,
);
