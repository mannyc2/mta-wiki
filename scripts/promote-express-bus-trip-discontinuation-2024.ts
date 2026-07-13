import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

const DECISION_ID = "express-bus-trip-discontinuation-2024-09-01";
const EVENT_ID = "event_express-bus-schedule-readjustment-effective-2024-09-01";
const TREATMENT_ID = "treatment_weekday-express-bus-trip-discontinuation-fall-2024";
const TIMELINE_RELATION_ID = "relation_fall-2024-express-readjustment-has-september-1-schedule-adjustment";
const TREATMENT_RELATION_ID = "relation_fall-2024-express-readjustment-has-weekday-trip-discontinuation";
const SCHEDULE_SOURCE_ID = "ny_open_data_mta_bus_schedule_boundaries_2024";
const RETROSPECTIVE_SOURCE_ID = "meeting_doc_160441";
const ROUTE_ANCHOR_PATH = "data/exports/releases/v1-rc11/route_anchors.jsonl";
const ROUTE_ANCHOR_SHA256 = "27edf0a8cd219cf6281898fb30453942e044593712ed5e8f958958e8944e842f";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const ACCEPTED_AT = "2026-07-13T10:50:00.000Z";

const routeSpecs = [
  {
    routeRecordId: "route_bm2-brt-south-brooklyn-2017",
    gtfsRouteId: "BM2",
    scopeRelationId: "relation_fall-2024-express-readjustment-affect-bm2",
  },
  {
    routeRecordId: "route_bm5-brt-south-brooklyn-2017",
    gtfsRouteId: "BM5",
    scopeRelationId: "relation_fall-2024-express-readjustment-affect-bm5",
  },
  {
    routeRecordId: "route_sim1c-meeting-doc-138456",
    gtfsRouteId: "SIM1C",
    scopeRelationId: "relation_fall-2024-express-readjustment-affect-sim1c",
  },
  {
    routeRecordId: "route_sim4c-meeting-doc-138456",
    gtfsRouteId: "SIM4C",
    scopeRelationId: "relation_fall-2024-express-readjustment-affect-sim4c",
  },
  {
    routeRecordId: "route_sim23-madison-ave-cb6-jun2025",
    gtfsRouteId: "SIM23",
    scopeRelationId: "relation_fall-2024-express-readjustment-affect-sim23",
  },
  {
    routeRecordId: "route_sim24-madison-ave-cb6-jun2025",
    gtfsRouteId: "SIM24",
    scopeRelationId: "relation_fall-2024-express-readjustment-affect-sim24",
  },
] as const;

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

function assertMaterializedGraph(recordsById: ReadonlyMap<string, MtaCanonicalRecord>): void {
  const requiredIds = [
    EVENT_ID,
    TREATMENT_ID,
    TIMELINE_RELATION_ID,
    TREATMENT_RELATION_ID,
    ...routeSpecs.map((route) => route.scopeRelationId),
  ];
  const missing = requiredIds.filter((recordId) => !recordsById.has(recordId));
  assert(
    missing.length === 0,
    `The fall 2024 express-bus discontinuation graph has not been materialized. Run materialize after curating it; missing canonical records: ${missing.join(", ")}`,
  );
}

function occurrenceDecision(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): OperationalOccurrenceAcceptedDecision {
  const event = requiredRecord(recordsById, EVENT_ID, "event");
  assert(event.payload.date_normalized === "2024-09-01" && event.payload.date_precision === "day", "Exact event date changed");
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
    rationale: "The official schedule-query capture establishes September 1, 2024 as the formal 2024Sep bundle boundary. The later official retrospective confirms that the identical six-route weekday trip package added in summer was removed in fall. September 3 is the first affected regular weekday after the Sunday boundary and Labor Day, not a competing onset date; the occurrence therefore uses the formal September 1 schedule-effective boundary while preserving that operating-day distinction in review rationale.",
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
      date: "2024-09-01",
      precision: "day",
      evidence_bindings: [
        binding(
          recordsById,
          "event_date",
          EVENT_ID,
          SCHEDULE_SOURCE_ID,
          `${SCHEDULE_SOURCE_ID}#p001_b0016`,
        ),
        binding(
          recordsById,
          "timeline_relation",
          TIMELINE_RELATION_ID,
          RETROSPECTIVE_SOURCE_ID,
          `${RETROSPECTIVE_SOURCE_ID}#p003_c0004`,
        ),
      ],
    },
    routes: routeSpecs.map((route) => ({
      route_record_id: route.routeRecordId,
      gtfs_route_id: route.gtfsRouteId,
      evidence_bindings: [
        binding(
          recordsById,
          "route_identity",
          route.routeRecordId,
          RETROSPECTIVE_SOURCE_ID,
          `${RETROSPECTIVE_SOURCE_ID}#p003_c0005`,
        ),
        binding(
          recordsById,
          "route_scope",
          route.scopeRelationId,
          RETROSPECTIVE_SOURCE_ID,
          `${RETROSPECTIVE_SOURCE_ID}#p003_c0005`,
        ),
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
            `${RETROSPECTIVE_SOURCE_ID}#p003_c0004`,
          ),
          binding(
            recordsById,
            "treatment_scope",
            TREATMENT_RELATION_ID,
            RETROSPECTIVE_SOURCE_ID,
            `${RETROSPECTIVE_SOURCE_ID}#p003_c0004`,
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

function writeArtifacts(
  decision: OperationalOccurrenceAcceptedDecision,
  identities: readonly OperationalOccurrenceIdentityEntry[],
): void {
  const occurrencePath = join(repoRoot, "data/operational-occurrence-review/accepted/decisions", `${decision.decision_id}.json`);
  const bytes = `${JSON.stringify(decision, null, 2)}\n`;
  if (existsSync(occurrencePath)) {
    assert(readFileSync(occurrencePath, "utf8") === bytes, `Refusing to overwrite non-equivalent ${occurrencePath}`);
  } else {
    mkdirSync(dirname(occurrencePath), { recursive: true });
    writeFileSync(occurrencePath, bytes, "utf8");
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
assertMaterializedGraph(recordsById);
const decision = occurrenceDecision(recordsById);
const identities = identityRegistry(decision);
const routeAnchors = readJsonl<RouteAnchorRow>(join(repoRoot, ROUTE_ANCHOR_PATH));
const existingReviews = loadOperationalOccurrenceAcceptedDecisions().filter((review) => review.decision_id !== DECISION_ID);
const rows = computeOperationalOccurrences(records, routeAnchors, {
  reviewDecisions: loadOperationalAnchorReviewDecisions(),
  occurrenceReviewDecisions: [...existingReviews, decision],
  identityRegistry: identities,
});
const row = rows.find((candidate) => candidate.occurrence_id === decision.occurrence_id);
assert(row?.study_projection_eligible, "Express-bus discontinuation occurrence is not study projection eligible");
assert(
  rows.filter((candidate) => candidate.occurrence_id === decision.occurrence_id).length === 1,
  "Express-bus discontinuation occurrence was projected more than once",
);
assert(row.routes.length === 6, "Express-bus discontinuation occurrence did not produce six routes");
assert(
  row.treatment.kind === "atomic" && row.treatment.member.treatment_family === "service_pattern",
  "Express-bus discontinuation treatment changed",
);

const apply = process.argv.includes("--apply");
if (apply) writeArtifacts(decision, identities);
console.log(JSON.stringify({
  mode: apply ? "applied" : "dry-run",
  decision_id: decision.decision_id,
  occurrence_id: decision.occurrence_id,
  route_count: row.routes.length,
  projected_occurrences: rows.length,
  projected_eligible_occurrences: rows.filter((candidate) => candidate.study_projection_eligible).length,
  projected_eligible_route_pairs: rows.filter((candidate) => candidate.study_projection_eligible).reduce((sum, candidate) => sum + candidate.routes.length, 0),
  route_anchor_sha256: ROUTE_ANCHOR_SHA256,
}, null, 2));
