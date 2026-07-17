import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import { loadOperationalAnchorReviewDecisions } from "../packages/pipeline/src/materialize/operational-anchor-review";
import {
  assertOperationalOccurrenceIdentityRegistry,
  loadOperationalOccurrenceIdentityRegistry,
  newOperationalOccurrenceIdentityEntry,
  type OperationalOccurrenceIdentityEntry,
} from "../packages/pipeline/src/materialize/operational-occurrence-identity";
import {
  loadOperationalOccurrenceAcceptedDecisions,
  parseOperationalOccurrenceAcceptedDecision,
  type OperationalOccurrenceAcceptedDecision,
} from "../packages/pipeline/src/materialize/operational-occurrence-review";
import {
  computeOperationalOccurrences,
  type OperationalOccurrenceEvidenceBinding,
} from "../packages/pipeline/src/materialize/operational-occurrences";
import type { RouteAnchorRow } from "../packages/pipeline/src/materialize/route-anchors";
import {
  parseOperationalCoverageAcceptedDecision,
  type OperationalCoverageAcceptedDecision,
} from "../packages/pipeline/src/quality/operational-coverage";

const DECISION_ID = "express-bus-trip-additions-2024-06-30";
const EVENT_ID = "event_express-bus-service-increases-begin-june-30-2024";
const TREATMENT_ID = "treatment_weekday-express-bus-trip-additions-summer-2024";
const TIMELINE_RELATION_ID = "relation_summer-2024-express-additions-has-june-30-start";
const TREATMENT_RELATION_ID = "relation_summer-2024-express-additions-has-weekday-trip-additions";
const ANNOUNCEMENT_SOURCE_ID = "mta_express_bus_service_increases_june30_2024";
const RETROSPECTIVE_SOURCE_ID = "meeting_doc_146846";
const ROUTE_ANCHOR_PATH = "data/exports/releases/v1-rc11/route_anchors.jsonl";
const ROUTE_ANCHOR_SHA256 = "27edf0a8cd219cf6281898fb30453942e044593712ed5e8f958958e8944e842f";
const OLD_GAP_ID = "operational-coverage:d49fc1e3fd06d8f668fb5d27";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const ACCEPTED_AT = "2026-07-13T10:40:00.000Z";
const DECIDED_AT = "2026-07-13T10:40:30.000Z";

const routeSpecs = [
  {
    routeRecordId: "route_bm2-brt-south-brooklyn-2017",
    gtfsRouteId: "BM2",
    evidenceId: `${RETROSPECTIVE_SOURCE_ID}#p002_c0013`,
    scopeRelationId: "relation_summer-2024-express-additions-affect-bm2",
  },
  {
    routeRecordId: "route_bm5-brt-south-brooklyn-2017",
    gtfsRouteId: "BM5",
    evidenceId: `${RETROSPECTIVE_SOURCE_ID}#p002_c0013`,
    scopeRelationId: "relation_summer-2024-express-additions-affect-bm5",
  },
  {
    routeRecordId: "route_sim1c-meeting-doc-138456",
    gtfsRouteId: "SIM1C",
    evidenceId: `${RETROSPECTIVE_SOURCE_ID}#p002_c0013`,
    scopeRelationId: "relation_summer-2024-express-additions-affect-sim1c",
  },
  {
    routeRecordId: "route_sim4c-meeting-doc-138456",
    gtfsRouteId: "SIM4C",
    evidenceId: `${RETROSPECTIVE_SOURCE_ID}#p002_c0013`,
    scopeRelationId: "relation_summer-2024-express-additions-affect-sim4c",
  },
  {
    routeRecordId: "route_sim23-madison-ave-cb6-jun2025",
    gtfsRouteId: "SIM23",
    evidenceId: `${RETROSPECTIVE_SOURCE_ID}#p003_c0004`,
    scopeRelationId: "relation_summer-2024-express-additions-affect-sim23",
  },
  {
    routeRecordId: "route_sim24-madison-ave-cb6-jun2025",
    gtfsRouteId: "SIM24",
    evidenceId: `${RETROSPECTIVE_SOURCE_ID}#p003_c0004`,
    scopeRelationId: "relation_summer-2024-express-additions-affect-sim24",
  },
] as const;

type QueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: string;
  status: string;
  verdict: string;
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
  assert(record, `Missing canonical record ${recordId}`);
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
  assert(
    record.evidence_refs.some((ref) => ref.source_id === sourceId && ref.evidence_id === evidenceId),
    `${recordId} lacks exact evidence ${sourceId}/${evidenceId}`,
  );
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
  assert(relation.payload.object_id === objectId, `${recordId} object changed`);
  assert(relation.payload.assertion_status === "delivered", `${recordId} is not delivered`);
}

function occurrenceDecision(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): OperationalOccurrenceAcceptedDecision {
  const event = requiredRecord(recordsById, EVENT_ID, "event");
  assert(event.payload.date_normalized === "2024-06-30" && event.payload.date_precision === "day", "Exact event date changed");
  assertRelation(recordsById, TIMELINE_RELATION_ID, "has_timeline_event", EVENT_ID);
  assertRelation(recordsById, TREATMENT_RELATION_ID, "has_treatment", TREATMENT_ID);
  const treatment = requiredRecord(recordsById, TREATMENT_ID, "treatment_component");
  assert(treatment.payload.treatment_family === "service_pattern", "Treatment family changed");
  for (const route of routeSpecs) {
    requiredRecord(recordsById, route.routeRecordId, "route");
    assertRelation(recordsById, route.scopeRelationId, "affects_route", route.routeRecordId);
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
    rationale: "The dated official MTA announcement specifies a June 30, 2024 start for one six-route peak-period service package. The July 16 official retrospective confirms that the identical weekday trips were added, and the official 2024 schedule feed independently places the 2024Jun bundle in effect June 30. One atomic service_pattern treatment and six delivered route edges preserve the actual shared intervention without inventing route-treatment cross-products or treating the coarse April month-only event as another occurrence.",
    occurrence_id: identity.occurrence_id,
    founding_key: identity.founding_key,
    observation_event_record_ids: [EVENT_ID],
    observation_relation_record_ids: [
      TIMELINE_RELATION_ID,
      TREATMENT_RELATION_ID,
      ...routeSpecs.map((route) => route.scopeRelationId),
    ].sort(),
    resolved_status: "realized",
    resolved_onset: {
      date: "2024-06-30",
      precision: "day",
      evidence_bindings: [
        binding(
          recordsById,
          "event_date",
          EVENT_ID,
          ANNOUNCEMENT_SOURCE_ID,
          `${ANNOUNCEMENT_SOURCE_ID}#p001_b0050`,
        ),
        binding(
          recordsById,
          "timeline_relation",
          TIMELINE_RELATION_ID,
          RETROSPECTIVE_SOURCE_ID,
          `${RETROSPECTIVE_SOURCE_ID}#p001_c0005`,
        ),
      ],
    },
    routes: routeSpecs.map((route) => ({
      route_record_id: route.routeRecordId,
      gtfs_route_id: route.gtfsRouteId,
      evidence_bindings: [
        binding(recordsById, "route_identity", route.routeRecordId, RETROSPECTIVE_SOURCE_ID, route.evidenceId),
        binding(recordsById, "route_scope", route.scopeRelationId, RETROSPECTIVE_SOURCE_ID, route.evidenceId),
      ],
    })),
    treatment_scope_kind: "atomic",
    treatment: {
      kind: "atomic",
      member: {
        treatment_record_id: TREATMENT_ID,
        treatment_family: "service_pattern",
        evidence_bindings: [
          binding(
            recordsById,
            "treatment_definition",
            TREATMENT_ID,
            RETROSPECTIVE_SOURCE_ID,
            `${RETROSPECTIVE_SOURCE_ID}#p001_c0005`,
          ),
          binding(
            recordsById,
            "treatment_scope",
            TREATMENT_RELATION_ID,
            RETROSPECTIVE_SOURCE_ID,
            `${RETROSPECTIVE_SOURCE_ID}#p001_c0005`,
          ),
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
    assert(stableJson(current as unknown as JsonValue) === stableJson(expected as unknown as JsonValue), "Existing occurrence identity differs");
    return assertOperationalOccurrenceIdentityRegistry(existing);
  }
  return assertOperationalOccurrenceIdentityRegistry([...existing, expected]);
}

function ledgerDecision(queue: readonly QueueRow[], occurrenceId: string): OperationalCoverageAcceptedDecision {
  const row = queue.find((candidate) => candidate.gap_id === OLD_GAP_ID);
  assert(row, `Missing priority gap ${OLD_GAP_ID}`);
  assert(row.event_record_id === "event_express-bus-additions-june2024", "Planning gap event changed");
  assert(row.dimension === "timeline_subject", "Planning gap dimension changed");
  if (row.status !== "terminal") {
    assert(row.status === "open" && row.verdict === "unreviewed", "Planning gap is no longer open/unreviewed");
  }
  return parseOperationalCoverageAcceptedDecision({
    schema_version: 1,
    decision_id: "express-bus-month-planning-timeline-superseded-by-june-30-occurrence",
    gap_id: OLD_GAP_ID,
    prior_verdict: "unreviewed",
    verdict: "not_applicable",
    reviewer: REVIEWER,
    decided_at: DECIDED_AT,
    rationale: `The April 26 month-only event is a coarse prospective surface for the same six-route package represented by approved occurrence ${occurrenceId}, whose official exact June 30 announcement and later delivered status are separately evidence-bound. Adding a second timeline link would double-count the intervention.`,
    proposal_ids: [],
    evidence_refs: [],
    search_receipt_ids: [],
  }, "express-bus month planning terminal decision");
}

function writeArtifacts(
  decision: OperationalOccurrenceAcceptedDecision,
  identities: readonly OperationalOccurrenceIdentityEntry[],
  gapDecision: OperationalCoverageAcceptedDecision,
): void {
  const occurrencePath = join(repoRoot, "data/operational-occurrence-review/accepted/decisions", `${decision.decision_id}.json`);
  const ledgerPath = join(repoRoot, "data/operational-anchor-review/ledger-decisions/decisions", `${gapDecision.decision_id}.json`);
  const artifacts = new Map([
    [occurrencePath, `${JSON.stringify(decision, null, 2)}\n`],
    [ledgerPath, `${JSON.stringify(gapDecision, null, 2)}\n`],
  ]);
  for (const [path, bytes] of artifacts) {
    if (existsSync(path)) assert(readFileSync(path, "utf8") === bytes, `Refusing to overwrite non-equivalent ${path}`);
    mkdirSync(join(path, ".."), { recursive: true });
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
const records = readCanonicalRecordsFromJsonl();
const recordsById = new Map(records.map((record) => [record.record_id, record]));
const decision = occurrenceDecision(recordsById);
const identities = identityRegistry(decision);
const queue = readJsonl<QueueRow>(join(repoRoot, "data/quality/operational-coverage/priority-queue.jsonl"));
const gapDecision = ledgerDecision(queue, decision.occurrence_id);
const routeAnchors = readJsonl<RouteAnchorRow>(join(repoRoot, ROUTE_ANCHOR_PATH));
const existingReviews = loadOperationalOccurrenceAcceptedDecisions().filter((review) => review.decision_id !== DECISION_ID);
const rows = computeOperationalOccurrences(records, routeAnchors, {
  reviewDecisions: loadOperationalAnchorReviewDecisions(),
  occurrenceReviewDecisions: [...existingReviews, decision],
  identityRegistry: identities,
});
const row = rows.find((candidate) => candidate.occurrence_id === decision.occurrence_id);
assert(row?.study_projection_eligible, "Express-bus occurrence is not study projection eligible");
assert(
  rows.filter((candidate) => candidate.occurrence_id === decision.occurrence_id).length === 1,
  "Express-bus occurrence was projected more than once",
);
assert(row.routes.length === 6, "Express-bus occurrence did not produce six routes");
assert(row.treatment.kind === "atomic" && row.treatment.member.treatment_family === "service_pattern", "Express-bus treatment changed");

const apply = process.argv.includes("--apply");
if (apply) writeArtifacts(decision, identities, gapDecision);
console.log(JSON.stringify({
  mode: apply ? "applied" : "dry-run",
  decision_id: decision.decision_id,
  occurrence_id: decision.occurrence_id,
  route_count: row.routes.length,
  projected_occurrences: rows.length,
  projected_eligible_occurrences: rows.filter((candidate) => candidate.study_projection_eligible).length,
  projected_eligible_route_pairs: rows.filter((candidate) => candidate.study_projection_eligible).reduce((sum, candidate) => sum + candidate.routes.length, 0),
  ledger_decision_id: gapDecision.decision_id,
  route_anchor_sha256: ROUTE_ANCHOR_SHA256,
}, null, 2));
