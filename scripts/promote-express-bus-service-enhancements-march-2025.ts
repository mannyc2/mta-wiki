import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types.js";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read.js";
import { loadOperationalAnchorReviewDecisions } from "../packages/pipeline/src/materialize/operational-anchor-review.js";
import {
  assertOperationalOccurrenceIdentityRegistry,
  loadOperationalOccurrenceIdentityRegistry,
  newOperationalOccurrenceIdentityEntry,
  type OperationalOccurrenceIdentityEntry,
} from "../packages/pipeline/src/materialize/operational-occurrence-identity.js";
import {
  loadOperationalOccurrenceAcceptedDecisions,
  parseOperationalOccurrenceAcceptedDecision,
  type OperationalOccurrenceAcceptedDecision,
} from "../packages/pipeline/src/materialize/operational-occurrence-review.js";
import {
  computeOperationalOccurrences,
  type OperationalOccurrenceEvidenceBinding,
} from "../packages/pipeline/src/materialize/operational-occurrences.js";
import type { RouteAnchorRow } from "../packages/pipeline/src/materialize/route-anchors.js";
import {
  parseOperationalCoverageAcceptedDecision,
  type OperationalCoverageAcceptedDecision,
} from "../packages/pipeline/src/quality/operational-coverage.js";

const DECISION_ID = "express-bus-service-enhancements-2025-03";
const PROJECT_ID = "project_spring-2025-express-bus-service-enhancements";
const EVENT_ID = "event_express-bus-service-enhancements-took-effect-march-2025";
const TREATMENT_ID = "treatment_weekday-express-bus-trip-additions-spring-2025";
const PLANNING_TIMELINE_RELATION_ID = "relation_spring-2025-express-enhancements-has-spring-plan";
const TIMELINE_RELATION_ID = "relation_spring-2025-express-enhancements-has-march-onset";
const TREATMENT_RELATION_ID = "relation_spring-2025-express-enhancements-has-weekday-trip-additions";
const PLANNING_SOURCE_ID = "meeting_doc_160441";
const RETROSPECTIVE_SOURCE_ID = "meeting_doc_171141";
const PLANNING_SCOPE_EVIDENCE_ID = `${PLANNING_SOURCE_ID}#p003_c0005`;
const TREATMENT_EVIDENCE_ID = `${PLANNING_SOURCE_ID}#p003_c0004`;
const REALIZED_EVIDENCE_ID = `${RETROSPECTIVE_SOURCE_ID}#p005_c0003`;
const REPORT_DATE_EVIDENCE_ID = `${RETROSPECTIVE_SOURCE_ID}#p001_c0003`;
const TREATMENT_LOCAL_ID = "treatment_weekday_express_bus_trip_additions_spring_2025";
const PLANNING_TREATMENT_LOCAL_ID = "treatment_weekday_express_bus_trip_additions_spring_2025_planning_scope";
const TREATMENT_SUBMISSION_IDS = ["sub_7cc6abb10d883a67", "sub_d0977dfc24fd8139"] as const;
const ROUTE_ANCHOR_PATH = "data/exports/releases/v1-rc13/route_anchors.jsonl";
const ROUTE_ANCHOR_SHA256 = "517b8f74a89e70ec4791d0bf327da6224bb9a6b2ea44eaf8162d704721659239";
const RAW_ROUTE_GAP_ID = "operational-coverage:6dbaecb40a5de7e881f84bc3";
const RAW_TREATMENT_GAP_ID = "operational-coverage:6b290978620e7597f521c343";
const PLANNING_EVENT_ID = "event_meeting-doc-160441-express-spring-2025";
const PLANNING_DATE_GAP_ID = "operational-coverage:6aab3b03b1a97ab76aee0282";
const PLANNING_STATUS_GAP_ID = "operational-coverage:02c71a8d29f201953736bc0b";
const PLANNING_ROUTE_GAP_ID = "operational-coverage:57254515441c06387665b6e9";
const PLANNING_TREATMENT_GAP_ID = "operational-coverage:2bff8ef1db2f15516d594e0e";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const ACCEPTED_AT = "2026-07-13T16:10:00.000Z";
const DECIDED_AT = "2026-07-13T16:10:30.000Z";

const evidenceHashes = new Map([
  [PLANNING_SCOPE_EVIDENCE_ID, "sha256:a1cb3550e548ba0e4cc902da5e264574b62e2318fcfe0a6f5418eb28d04373de"],
  [TREATMENT_EVIDENCE_ID, "sha256:730a088e5bef117b4b219c33d1ed4a5918f303f53260c116cf651770b2dfedb9"],
  [REALIZED_EVIDENCE_ID, "sha256:db189e9145a8c754be91933d52adbc9aaa176fd33d9ceb6ebc781642dde94f80"],
  [REPORT_DATE_EVIDENCE_ID, "sha256:80aa190c5d97a47a5acde989e25d4d3cfbe123dce4a1d4b36ce74a1efe63058f"],
]);

const routeSpecs = [
  { routeRecordId: "route_bm2-brt-south-brooklyn-2017", gtfsRouteId: "BM2", relationSuffix: "bm2" },
  { routeRecordId: "route_bm5-brt-south-brooklyn-2017", gtfsRouteId: "BM5", relationSuffix: "bm5" },
  { routeRecordId: "route_sim1c-meeting-doc-138456", gtfsRouteId: "SIM1C", relationSuffix: "sim1c" },
  { routeRecordId: "route_sim4c-meeting-doc-138456", gtfsRouteId: "SIM4C", relationSuffix: "sim4c" },
  { routeRecordId: "route_sim23-madison-ave-cb6-jun2025", gtfsRouteId: "SIM23", relationSuffix: "sim23" },
  { routeRecordId: "route_sim24-madison-ave-cb6-jun2025", gtfsRouteId: "SIM24", relationSuffix: "sim24" },
  { routeRecordId: "route_meeting-doc-160441-x27", gtfsRouteId: "X27", relationSuffix: "x27" },
  { routeRecordId: "route_qm15-qbb-study", gtfsRouteId: "QM15", relationSuffix: "qm15" },
] as const;

type QueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: string;
  status: string;
  verdict: string;
  decision_ids: string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
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
  assert(record, `Missing canonical record ${recordId}; run the curation script with --apply and materialize first`);
  if (kind) assert(record.record_kind === kind, `${recordId} is ${record.record_kind}, expected ${kind}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
  return record;
}

function binding(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  role: OperationalOccurrenceEvidenceBinding["role"],
  recordId: string,
  sourceId: string,
  evidenceId: string,
): OperationalOccurrenceEvidenceBinding {
  const record = requiredRecord(recordsById, recordId);
  const ref = record.evidence_refs.find(
    (candidate) => candidate.source_id === sourceId && candidate.evidence_id === evidenceId,
  );
  assert(ref, `${recordId} lacks exact evidence ${evidenceId}`);
  const expectedHash = evidenceHashes.get(evidenceId);
  assert(expectedHash && ref.text_sha256 === expectedHash, `${recordId}/${evidenceId} hash changed`);
  return { role, record_id: recordId, source_id: sourceId, evidence_id: evidenceId };
}

function assertRelation(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  recordId: string,
  relationKind: string,
  objectId: string,
): void {
  const relation = requiredRecord(recordsById, recordId, "relation");
  assert(relation.payload.relation_kind === relationKind, `${recordId} relation kind changed`);
  assert(relation.payload.subject_id === PROJECT_ID, `${recordId} subject changed`);
  assert(relation.payload.object_id === objectId, `${recordId} object changed`);
  assert(relation.payload.assertion_status === "delivered", `${recordId} is not delivered`);
}

function assertPlannedTimelineRelation(recordsById: ReadonlyMap<string, MtaCanonicalRecord>): void {
  const relation = requiredRecord(recordsById, PLANNING_TIMELINE_RELATION_ID, "relation");
  assert(relation.payload.relation_kind === "has_timeline_event", `${PLANNING_TIMELINE_RELATION_ID} kind changed`);
  assert(relation.payload.subject_id === PROJECT_ID, `${PLANNING_TIMELINE_RELATION_ID} subject changed`);
  assert(relation.payload.object_id === PLANNING_EVENT_ID, `${PLANNING_TIMELINE_RELATION_ID} object changed`);
  assert(relation.payload.assertion_status === "planned", `${PLANNING_TIMELINE_RELATION_ID} must remain planned`);
  assert(relation.payload.as_of_date === "2024-12-10", `${PLANNING_TIMELINE_RELATION_ID} as-of date changed`);
}

function assertTreatmentFold(recordsById: ReadonlyMap<string, MtaCanonicalRecord>): MtaCanonicalRecord {
  const matchingTreatments = [...recordsById.values()].filter(
    (record) =>
      record.record_kind === "treatment_component" &&
      record.record_id.startsWith("treatment_weekday-express-bus-trip-additions-spring-2025"),
  );
  assert(
    matchingTreatments.length === 1 && matchingTreatments[0]?.record_id === TREATMENT_ID,
    "Expected exactly one folded Spring 2025 express treatment, found " +
      (matchingTreatments.map((record) => record.record_id).join(", ") || "none"),
  );
  const treatment = requiredRecord(recordsById, TREATMENT_ID, "treatment_component");
  assert(treatment.source_id === RETROSPECTIVE_SOURCE_ID, TREATMENT_ID + " primary source changed");
  assert(
    stableJson(treatment.source_ids as unknown as JsonValue) ===
      stableJson([PLANNING_SOURCE_ID, RETROSPECTIVE_SOURCE_ID] as unknown as JsonValue),
    TREATMENT_ID + " source provenance changed",
  );
  assert(treatment.local_observation_id === TREATMENT_LOCAL_ID, TREATMENT_ID + " primary local id changed");
  assert(
    stableJson(treatment.local_observation_ids as unknown as JsonValue) ===
      stableJson([TREATMENT_LOCAL_ID, PLANNING_TREATMENT_LOCAL_ID] as unknown as JsonValue),
    TREATMENT_ID + " local-id provenance changed",
  );
  assert(
    stableJson(treatment.submission_ids as unknown as JsonValue) ===
      stableJson([...TREATMENT_SUBMISSION_IDS] as unknown as JsonValue),
    TREATMENT_ID + " submission provenance changed",
  );
  for (const evidenceId of [TREATMENT_EVIDENCE_ID, PLANNING_SCOPE_EVIDENCE_ID, REALIZED_EVIDENCE_ID]) {
    const ref = treatment.evidence_refs.find((candidate) => candidate.evidence_id === evidenceId);
    assert(ref, TREATMENT_ID + " lacks folded evidence " + evidenceId);
    assert(ref.text_sha256 === evidenceHashes.get(evidenceId), TREATMENT_ID + "/" + evidenceId + " hash changed");
  }
  return treatment;
}

function occurrenceDecision(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): OperationalOccurrenceAcceptedDecision {
  const planningEvent = requiredRecord(recordsById, PLANNING_EVENT_ID, "event");
  assert(planningEvent.payload.date_normalized === "2025-spring", `${PLANNING_EVENT_ID} date changed`);
  assert(planningEvent.payload.date_precision === "season", `${PLANNING_EVENT_ID} precision changed`);
  assert(planningEvent.payload.lifecycle_phase === "planned", `${PLANNING_EVENT_ID} must remain prospective`);
  assertPlannedTimelineRelation(recordsById);

  const event = requiredRecord(recordsById, EVENT_ID, "event");
  assert(event.payload.event_family === "implementation", `${EVENT_ID} family changed`);
  assert(event.payload.lifecycle_phase === "expanded", `${EVENT_ID} lifecycle changed`);
  assert(event.payload.date_text === "March", `${EVENT_ID} must preserve the source's month literal`);
  assert(event.payload.date_normalized === "2025-03", `${EVENT_ID} resolved date changed`);
  assert(event.payload.date_precision === "month", `${EVENT_ID} precision changed`);
  requiredRecord(recordsById, PROJECT_ID, "project");
  const treatment = assertTreatmentFold(recordsById);
  assert(treatment.payload.treatment_family === "service_pattern", `${TREATMENT_ID} family changed`);
  assertRelation(recordsById, TIMELINE_RELATION_ID, "has_timeline_event", EVENT_ID);
  assertRelation(recordsById, TREATMENT_RELATION_ID, "has_treatment", TREATMENT_ID);
  for (const route of routeSpecs) {
    const routeRecord = requiredRecord(recordsById, route.routeRecordId, "route");
    assert(routeRecord.payload.route_id === route.gtfsRouteId, `${route.routeRecordId} GTFS identity changed`);
    assertRelation(
      recordsById,
      `relation_spring-2025-express-enhancements-affect-${route.relationSuffix}`,
      "affects_route",
      route.routeRecordId,
    );
  }

  const identity = newOperationalOccurrenceIdentityEntry({
    foundingKey: `event:${EVENT_ID}`,
    foundingEventRecordIds: [EVENT_ID],
    decisionId: DECISION_ID,
    issuedAt: ACCEPTED_AT,
  });
  return parseOperationalOccurrenceAcceptedDecision({
    schema_version: 1,
    decision_id: DECISION_ID,
    review_state: "approved",
    accepted_at: ACCEPTED_AT,
    reviewer: REVIEWER,
    rationale: "The official April 28, 2025 MTA retrospective says that eight express-bus route changes took effect in March. The dated report resolves the source's month literal to March 2025, while the earlier official approval table names BM2, BM5, SIM1C, SIM4C, SIM23, SIM24, X27, and QM15 and defines their added weekday peak trips. This decision preserves the earlier Spring 2025 planning event as a separate season-precision planning surface and approves one realized, atomic service_pattern occurrence without inventing a day.",
    occurrence_id: identity.occurrence_id,
    founding_key: identity.founding_key,
    observation_event_record_ids: [EVENT_ID],
    observation_relation_record_ids: [
      TIMELINE_RELATION_ID,
      TREATMENT_RELATION_ID,
      ...routeSpecs.map((route) => `relation_spring-2025-express-enhancements-affect-${route.relationSuffix}`),
    ].sort(),
    resolved_status: "realized",
    resolved_onset: {
      date: "2025-03",
      precision: "month",
      evidence_bindings: [
        binding(recordsById, "event_date", EVENT_ID, RETROSPECTIVE_SOURCE_ID, REALIZED_EVIDENCE_ID),
        binding(
          recordsById,
          "timeline_relation",
          TIMELINE_RELATION_ID,
          RETROSPECTIVE_SOURCE_ID,
          REALIZED_EVIDENCE_ID,
        ),
      ],
    },
    routes: routeSpecs.map((route) => {
      const scopeRelationId = `relation_spring-2025-express-enhancements-affect-${route.relationSuffix}`;
      return {
        route_record_id: route.routeRecordId,
        gtfs_route_id: route.gtfsRouteId,
        evidence_bindings: [
          binding(recordsById, "route_identity", route.routeRecordId, PLANNING_SOURCE_ID, PLANNING_SCOPE_EVIDENCE_ID),
          binding(recordsById, "route_scope", scopeRelationId, PLANNING_SOURCE_ID, PLANNING_SCOPE_EVIDENCE_ID),
        ],
      };
    }),
    treatment_scope_kind: "atomic",
    treatment: {
      kind: "atomic",
      member: {
        treatment_record_id: TREATMENT_ID,
        treatment_family: "service_pattern",
        evidence_bindings: [
          binding(recordsById, "treatment_definition", TREATMENT_ID, PLANNING_SOURCE_ID, TREATMENT_EVIDENCE_ID),
          binding(recordsById, "treatment_scope", TREATMENT_RELATION_ID, PLANNING_SOURCE_ID, TREATMENT_EVIDENCE_ID),
        ],
      },
    },
  }, DECISION_ID);
}

function identityRegistry(decision: OperationalOccurrenceAcceptedDecision): OperationalOccurrenceIdentityEntry[] {
  const existing = loadOperationalOccurrenceIdentityRegistry();
  const expected = newOperationalOccurrenceIdentityEntry({
    foundingKey: decision.founding_key,
    foundingEventRecordIds: decision.observation_event_record_ids,
    decisionId: decision.decision_id,
    issuedAt: ACCEPTED_AT,
  });
  const current = existing.find((entry) => entry.founding_key === expected.founding_key);
  if (current) {
    assert(
      stableJson(current as unknown as JsonValue) === stableJson(expected as unknown as JsonValue),
      "Existing Spring 2025 express occurrence identity differs",
    );
    return assertOperationalOccurrenceIdentityRegistry(existing);
  }
  return assertOperationalOccurrenceIdentityRegistry([...existing, expected]);
}

function ledgerDecisions(queue: readonly QueueRow[], occurrenceId: string): OperationalCoverageAcceptedDecision[] {
  const realizedEventGaps = queue.filter((candidate) => candidate.event_record_id === EVENT_ID);
  assert(
    realizedEventGaps.length === 2 &&
      realizedEventGaps.some((row) => row.gap_id === RAW_ROUTE_GAP_ID && row.dimension === "route") &&
      realizedEventGaps.some((row) => row.gap_id === RAW_TREATMENT_GAP_ID && row.dimension === "treatment"),
    `Unexpected raw gaps for ${EVENT_ID}: ${realizedEventGaps.map((row) => `${row.dimension}:${row.gap_id}`).join(", ") || "none"}`,
  );

  const planningEventGaps = queue.filter((candidate) => candidate.event_record_id === PLANNING_EVENT_ID);
  const expectedPlanningGaps = new Map([
    [PLANNING_DATE_GAP_ID, "date_precision"],
    [PLANNING_STATUS_GAP_ID, "delivered_status"],
    [PLANNING_ROUTE_GAP_ID, "route"],
    [PLANNING_TREATMENT_GAP_ID, "treatment"],
  ]);
  assert(
    planningEventGaps.length === expectedPlanningGaps.size &&
      planningEventGaps.every((row) => expectedPlanningGaps.get(row.gap_id) === row.dimension),
    `Unexpected raw gaps for ${PLANNING_EVENT_ID}: ${planningEventGaps.map((row) => `${row.dimension}:${row.gap_id}`).join(", ") || "none"}`,
  );

  const specs = [
    {
      decisionId: "spring-2025-express-realized-raw-multiroute-diagnostic-superseded",
      gapId: RAW_ROUTE_GAP_ID,
      eventId: EVENT_ID,
      dimension: "route",
      rationale: `The raw anchor diagnostic requires exactly one route and therefore flags this deliberately multi-route package. Approved occurrence ${occurrenceId} preserves all eight directly evidenced route bindings; forcing the canonical event graph down to one route would discard official scope. The raw route diagnostic is superseded by the reviewed occurrence.`,
    },
    {
      decisionId: "spring-2025-express-realized-raw-treatment-diagnostic-superseded",
      gapId: RAW_TREATMENT_GAP_ID,
      eventId: EVENT_ID,
      dimension: "treatment",
      rationale: `The raw source-neighborhood diagnostic sees unrelated fare-gate treatments from the April report alongside the directly linked weekday express-bus trip additions. Approved occurrence ${occurrenceId} binds the realized March event only to ${TREATMENT_ID} as one atomic service_pattern treatment, so the ambiguous raw diagnostic is superseded.`,
    },
    {
      decisionId: "spring-2025-express-planning-date-superseded-by-march-occurrence",
      gapId: PLANNING_DATE_GAP_ID,
      eventId: PLANNING_EVENT_ID,
      dimension: "date_precision",
      rationale: `The December staff summary states only the prospective Spring 2025 schedule window. The separate official retrospective establishes the realized March 2025 onset used by approved occurrence ${occurrenceId}; refining the planning record itself would overwrite its source-time precision, so this study-date diagnostic is not applicable.`,
    },
    {
      decisionId: "spring-2025-express-planning-status-remains-prospective",
      gapId: PLANNING_STATUS_GAP_ID,
      eventId: PLANNING_EVENT_ID,
      dimension: "delivered_status",
      rationale: `This event and its project relation intentionally preserve the December 2024 prospective plan. Delivery is represented separately by approved March occurrence ${occurrenceId}; changing the planning surface to delivered would collapse source-time status, so this raw delivered-status diagnostic is not applicable.`,
    },
    {
      decisionId: "spring-2025-express-planning-raw-multiroute-diagnostic-superseded",
      gapId: PLANNING_ROUTE_GAP_ID,
      eventId: PLANNING_EVENT_ID,
      dimension: "route",
      rationale: `The planned package directly covers eight routes, while the raw anchor diagnostic requires exactly one. Approved occurrence ${occurrenceId} preserves all eight realized route bindings and the planning event remains non-realized history, so a singular raw route anchor is not applicable.`,
    },
    {
      decisionId: "spring-2025-express-planning-raw-treatment-diagnostic-superseded",
      gapId: PLANNING_TREATMENT_GAP_ID,
      eventId: PLANNING_EVENT_ID,
      dimension: "treatment",
      rationale: `The planned project directly identifies ${TREATMENT_ID}, but the raw source-neighborhood diagnostic also sees unrelated treatments. Approved occurrence ${occurrenceId} carries the exact atomic service_pattern scope; the prospective event must not become a second study occurrence, so this raw treatment diagnostic is not applicable.`,
    },
  ] as const;

  return specs.map((spec) => {
    const row = queue.find((candidate) => candidate.gap_id === spec.gapId);
    assert(row, `Missing priority gap ${spec.gapId}`);
    assert(row.event_record_id === spec.eventId, `${spec.gapId} event changed`);
    assert(row.dimension === spec.dimension, `${spec.gapId} dimension changed`);
    if (row.status !== "terminal") {
      assert(row.status === "open" && row.verdict === "unreviewed", `${spec.gapId} is no longer open/unreviewed`);
    } else {
      assert(row.decision_ids.includes(spec.decisionId), `${spec.gapId} terminal decision changed`);
    }
    return parseOperationalCoverageAcceptedDecision({
      schema_version: 1,
      decision_id: spec.decisionId,
      gap_id: spec.gapId,
      prior_verdict: "unreviewed",
      verdict: "not_applicable",
      reviewer: REVIEWER,
      decided_at: DECIDED_AT,
      rationale: spec.rationale,
      proposal_ids: [],
      evidence_refs: [],
      search_receipt_ids: [],
    }, spec.decisionId);
  });
}

function writeArtifacts(
  decision: OperationalOccurrenceAcceptedDecision,
  identities: readonly OperationalOccurrenceIdentityEntry[],
  gapDecisions: readonly OperationalCoverageAcceptedDecision[],
): void {
  const artifacts = new Map<string, string>([
    [
      join(repoRoot, "data/operational-occurrence-review/accepted/decisions", `${decision.decision_id}.json`),
      `${JSON.stringify(decision, null, 2)}\n`,
    ],
    ...gapDecisions.map((gapDecision) => [
      join(repoRoot, "data/operational-anchor-review/ledger-decisions/decisions", `${gapDecision.decision_id}.json`),
      `${JSON.stringify(gapDecision, null, 2)}\n`,
    ] as [string, string]),
  ]);
  for (const [path, bytes] of artifacts) {
    if (existsSync(path)) assert(readFileSync(path, "utf8") === bytes, `Refusing to overwrite non-equivalent ${path}`);
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path)) writeFileSync(path, bytes, "utf8");
  }
  writeFileSync(
    join(repoRoot, "data/operational-occurrence-identities/registry.jsonl"),
    `${identities.map((entry) => stableJson(entry as unknown as JsonValue)).join("\n")}\n`,
    "utf8",
  );
}

const routeAnchorBytes = readFileSync(join(repoRoot, ROUTE_ANCHOR_PATH));
assert(sha256(routeAnchorBytes) === ROUTE_ANCHOR_SHA256, `${ROUTE_ANCHOR_PATH} hash changed`);
const routeAnchors = readJsonl<RouteAnchorRow>(join(repoRoot, ROUTE_ANCHOR_PATH));
const records = readCanonicalRecordsFromJsonl();
const recordsById = new Map(records.map((record) => [record.record_id, record]));
const decision = occurrenceDecision(recordsById);
const identities = identityRegistry(decision);
const queue = readJsonl<QueueRow>(join(repoRoot, "data/quality/operational-coverage/priority-queue.jsonl"));
const gapDecisions = ledgerDecisions(queue, decision.occurrence_id);
const existingOccurrenceReviews = loadOperationalOccurrenceAcceptedDecisions().filter(
  (candidate) => candidate.decision_id !== DECISION_ID,
);
const rows = computeOperationalOccurrences(records, routeAnchors, {
  reviewDecisions: loadOperationalAnchorReviewDecisions(),
  occurrenceReviewDecisions: [...existingOccurrenceReviews, decision],
  identityRegistry: identities,
});
const row = rows.find((candidate) => candidate.occurrence_id === decision.occurrence_id);
assert(row?.study_projection_eligible, "Spring 2025 express occurrence is not study projection eligible");
assert(
  rows.filter((candidate) => candidate.occurrence_id === decision.occurrence_id).length === 1,
  "Spring 2025 express occurrence projected more than once",
);
assert(row.routes.length === routeSpecs.length, "Spring 2025 express occurrence did not produce eight routes");
assert(
  row.treatment.kind === "atomic" &&
    row.treatment.member.treatment_record_id === TREATMENT_ID &&
    row.treatment.member.treatment_family === "service_pattern",
  "Spring 2025 express treatment changed",
);

const apply = process.argv.includes("--apply");
if (apply) writeArtifacts(decision, identities, gapDecisions);
console.log(JSON.stringify({
  mode: apply ? "applied" : "dry-run",
  decision_id: decision.decision_id,
  occurrence_id: decision.occurrence_id,
  route_count: row.routes.length,
  projected_occurrences: rows.length,
  projected_eligible_occurrences: rows.filter((candidate) => candidate.study_projection_eligible).length,
  projected_eligible_route_pairs: rows
    .filter((candidate) => candidate.study_projection_eligible)
    .reduce((sum, candidate) => sum + candidate.routes.length, 0),
  ledger_decision_ids: gapDecisions.map((decision) => decision.decision_id),
  route_anchor_sha256: ROUTE_ANCHOR_SHA256,
}, null, 2));
