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

const DECISION_ID = "flatbush-phase1-center-running-bus-lanes-2025-09";
const PROJECT_ID = "project_flatbush-phase1-center-running-bus-lanes-livingston-state";
const EVENT_ID = "event_flatbush-phase1-installation-start-sep2025";
const COMPLETION_EVENT_ID = "event_flatbush-av-phase1-installed-fall2025";
const TREATMENT_ID = "treatment_flatbush-phase1-center-running-bus-lanes-livingston-state";
const TIMELINE_RELATION_ID = "relation_flatbush-phase1-has-start-event-sep2025";
const COMPLETION_RELATION_ID = "relation_flatbush-phase1-has-completion-event-fall2025";
const TREATMENT_RELATION_ID = "relation_flatbush-phase1-has-center-running-bus-lanes";
const START_SOURCE_ID = "nyc_dot_flatbush_installation_begins_2025";
const RETROSPECTIVE_SOURCE_ID = "flatbush_ave_bus_priority_mtp_briefing_apr2026";
const ROUTE_ANCHOR_PATH = "data/exports/releases/v1-rc14/route_anchors.jsonl";
const ROUTE_ANCHOR_SHA256 = "517b8f74a89e70ec4791d0bf327da6224bb9a6b2ea44eaf8162d704721659239";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const ACCEPTED_AT = "2026-07-13T18:45:00.000Z";

const evidencePins = {
  publicationDate: {
    sourceId: START_SOURCE_ID,
    evidenceId: `${START_SOURCE_ID}#p001_b0010`,
    sha256: "sha256:4fef80e1db0fa85209905b3c4a19a99c88d1a6daee024e17f8756ace80490109",
  },
  installationStart: {
    sourceId: START_SOURCE_ID,
    evidenceId: `${START_SOURCE_ID}#p001_b0016`,
    sha256: "sha256:7c79ef32ed8ded041b89c331891e98770b5a811e6220ce1f756c75cf6c833273",
  },
  phaseScope: {
    sourceId: START_SOURCE_ID,
    evidenceId: `${START_SOURCE_ID}#p001_b0019`,
    sha256: "sha256:30013ba6828a02a6e555ca70f1e04b4ea1a417a91797600a3df13fb8e2b3180a",
  },
  b41Identity: {
    sourceId: START_SOURCE_ID,
    evidenceId: `${START_SOURCE_ID}#p001_b0021`,
    sha256: "sha256:b1dba41e356e7d7c3c9b1c3de4a953e710a554b1445cd38d292406e96eada3ac",
  },
  deliveredPhase: {
    sourceId: RETROSPECTIVE_SOURCE_ID,
    evidenceId: `${RETROSPECTIVE_SOURCE_ID}#p004_c0002`,
    sha256: "sha256:04e364443480c8b2cda313fd5461a4e0c68f70b891b2d9d39735d13513839e29",
  },
  routeScope: {
    sourceId: RETROSPECTIVE_SOURCE_ID,
    evidenceId: `${RETROSPECTIVE_SOURCE_ID}#p012_c0003`,
    sha256: "sha256:a09c92b214644314aa222043296bc4de95d621c270347d9c1800af0f664410aa",
  },
} as const;

type EvidencePin = (typeof evidencePins)[keyof typeof evidencePins];

const routeSpecs = [
  {
    routeRecordId: "route_b41-ace",
    gtfsRouteId: "B41",
    relationId: "relation_flatbush-phase1-serves-b41",
    identityPin: evidencePins.b41Identity,
  },
  {
    routeRecordId: "route_b67-flatbush-ave-apr2026",
    gtfsRouteId: "B67",
    relationId: "relation_flatbush-phase1-serves-b67",
    identityPin: evidencePins.routeScope,
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
  assert(
    record,
    `Missing canonical record ${recordId}; apply the Flatbush Phase 1 curation and semantic corrections, then materialize`,
  );
  if (kind) assert(record.record_kind === kind, `${recordId} is ${record.record_kind}, expected ${kind}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
  return record;
}

function binding(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  role: OperationalOccurrenceEvidenceBinding["role"],
  recordId: string,
  pin: EvidencePin,
): OperationalOccurrenceEvidenceBinding {
  const record = requiredRecord(recordsById, recordId);
  const ref = record.evidence_refs.find(
    (candidate) => candidate.source_id === pin.sourceId && candidate.evidence_id === pin.evidenceId,
  );
  assert(ref, `${recordId} lacks exact evidence ${pin.evidenceId}`);
  assert(ref.text_sha256 === pin.sha256, `${recordId}/${pin.evidenceId} hash changed`);
  return { role, record_id: recordId, source_id: pin.sourceId, evidence_id: pin.evidenceId };
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
  assert(relation.payload.as_of_date === "2026-04", `${recordId} as_of_date changed`);
}

function assertBoundedPhaseGraph(
  records: readonly MtaCanonicalRecord[],
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): void {
  const project = requiredRecord(recordsById, PROJECT_ID, "project");
  assert(project.payload.status === "implemented", `${PROJECT_ID} status changed`);
  assert(project.payload.document_time_status === "planned", `${PROJECT_ID} lost its source-time status`);
  assert(project.payload.geography === "Flatbush Avenue between Livingston Street and State Street", `${PROJECT_ID} geography changed`);

  const event = requiredRecord(recordsById, EVENT_ID, "event");
  assert(event.payload.event_family === "implementation", `${EVENT_ID} family changed`);
  assert(event.payload.lifecycle_phase === "installed", `${EVENT_ID} lifecycle changed`);
  assert(event.payload.date_text === "September 2025", `${EVENT_ID} source-resolution date text changed`);
  assert(event.payload.date_normalized === "2025-09", `${EVENT_ID} date changed`);
  assert(event.payload.date_precision === "month", `${EVENT_ID} precision changed`);
  const normalizedDate = event.payload.date_text_normalized;
  assert(
    typeof normalizedDate === "object" &&
      normalizedDate !== null &&
      !Array.isArray(normalizedDate) &&
      normalizedDate.normalized_date === "2025-09" &&
      normalizedDate.precision === "month",
    `${EVENT_ID} nested normalized date conflicts with the month-level onset`,
  );

  const completion = requiredRecord(recordsById, COMPLETION_EVENT_ID, "event");
  assert(completion.payload.date_normalized === "2025-fall", `${COMPLETION_EVENT_ID} date changed`);
  assert(completion.payload.date_precision === "season", `${COMPLETION_EVENT_ID} precision changed`);

  const treatment = requiredRecord(recordsById, TREATMENT_ID, "treatment_component");
  assert(treatment.payload.treatment_family === "bus_lane", `${TREATMENT_ID} family changed`);
  assert(treatment.payload.treatment_kind === "center-running bus lanes", `${TREATMENT_ID} kind changed`);
  assert(
    treatment.payload.location_text === "Flatbush Avenue between Livingston Street and State Street",
    `${TREATMENT_ID} location changed`,
  );

  assertRelation(recordsById, TIMELINE_RELATION_ID, "has_timeline_event", EVENT_ID);
  assertRelation(recordsById, COMPLETION_RELATION_ID, "has_timeline_event", COMPLETION_EVENT_ID);
  assertRelation(recordsById, TREATMENT_RELATION_ID, "has_treatment", TREATMENT_ID);
  for (const route of routeSpecs) {
    const routeRecord = requiredRecord(recordsById, route.routeRecordId, "route");
    assert(routeRecord.payload.route_id === route.gtfsRouteId, `${route.routeRecordId} GTFS identity changed`);
    assertRelation(recordsById, route.relationId, "serves_route", route.routeRecordId);
  }

  const scopedRelations = records.filter(
    (record) =>
      record.record_kind === "relation" &&
      record.truth_status === "source_stated" &&
      record.review_state !== "quarantined" &&
      record.payload.subject_id === PROJECT_ID,
  );
  const relationIds = (kind: string): string[] =>
    scopedRelations
      .filter((record) => record.payload.relation_kind === kind)
      .map((record) => record.record_id)
      .sort();
  assert(
    stableJson(relationIds("has_timeline_event") as unknown as JsonValue) ===
      stableJson([COMPLETION_RELATION_ID, TIMELINE_RELATION_ID].sort() as unknown as JsonValue),
    `${PROJECT_ID} timeline graph changed`,
  );
  assert(
    stableJson(relationIds("serves_route") as unknown as JsonValue) ===
      stableJson(routeSpecs.map((route) => route.relationId).sort() as unknown as JsonValue),
    `${PROJECT_ID} route graph is no longer bounded to B41 and B67`,
  );
  assert(
    stableJson(relationIds("has_treatment") as unknown as JsonValue) ===
      stableJson([TREATMENT_RELATION_ID] as unknown as JsonValue),
    `${PROJECT_ID} treatment graph is no longer atomic`,
  );
}

function occurrenceDecision(
  records: readonly MtaCanonicalRecord[],
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): OperationalOccurrenceAcceptedDecision {
  assertBoundedPhaseGraph(records, recordsById);
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
    rationale: "The September 25, 2025 official NYC DOT announcement establishes that installation of the bounded Livingston Street-to-State Street Phase 1 center-running bus lanes began during September 2025, and the April 2026 official retrospective confirms that this same two-block phase was installed during Fall 2025. This decision uses September only as a month-level installation-commencement onset: it does not invent an exact work-start day, fine-bearing day, or operational-completion day. It binds only B41 and B67 and one atomic bus_lane treatment, while preserving the separate season-precision completion event and excluding Phase 2 islands, pedestrian-space, curb-management, signal-priority, camera-enforcement, and reroute scope.",
    occurrence_id: identity.occurrence_id,
    founding_key: identity.founding_key,
    observation_event_record_ids: [EVENT_ID],
    observation_relation_record_ids: [
      TIMELINE_RELATION_ID,
      ...routeSpecs.map((route) => route.relationId),
      TREATMENT_RELATION_ID,
    ].sort(),
    resolved_status: "realized",
    resolved_onset: {
      date: "2025-09",
      precision: "month",
      evidence_bindings: [
        binding(recordsById, "event_date", EVENT_ID, evidencePins.publicationDate),
        binding(recordsById, "event_date", EVENT_ID, evidencePins.installationStart),
        binding(recordsById, "timeline_relation", TIMELINE_RELATION_ID, evidencePins.deliveredPhase),
      ],
    },
    routes: routeSpecs.map((route) => ({
      route_record_id: route.routeRecordId,
      gtfs_route_id: route.gtfsRouteId,
      evidence_bindings: [
        binding(recordsById, "route_identity", route.routeRecordId, route.identityPin),
        binding(recordsById, "route_scope", route.relationId, evidencePins.routeScope),
      ],
    })),
    treatment_scope_kind: "atomic",
    treatment: {
      kind: "atomic",
      member: {
        treatment_record_id: TREATMENT_ID,
        treatment_family: "bus_lane",
        evidence_bindings: [
          binding(recordsById, "treatment_definition", TREATMENT_ID, evidencePins.phaseScope),
          binding(recordsById, "treatment_scope", TREATMENT_RELATION_ID, evidencePins.deliveredPhase),
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
      "Existing Flatbush Phase 1 occurrence identity differs",
    );
    return assertOperationalOccurrenceIdentityRegistry(existing);
  }
  return assertOperationalOccurrenceIdentityRegistry([...existing, expected]);
}

function writeArtifacts(
  decision: OperationalOccurrenceAcceptedDecision,
  identities: readonly OperationalOccurrenceIdentityEntry[],
): void {
  const path = join(repoRoot, "data/operational-occurrence-review/accepted/decisions", `${decision.decision_id}.json`);
  const bytes = `${JSON.stringify(decision, null, 2)}\n`;
  if (existsSync(path)) assert(readFileSync(path, "utf8") === bytes, `Refusing to overwrite non-equivalent ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, bytes, "utf8");
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
const decision = occurrenceDecision(records, recordsById);
const identities = identityRegistry(decision);
const existingOccurrenceReviews = loadOperationalOccurrenceAcceptedDecisions().filter(
  (candidate) => candidate.decision_id !== DECISION_ID,
);
const rows = computeOperationalOccurrences(records, routeAnchors, {
  reviewDecisions: loadOperationalAnchorReviewDecisions(),
  occurrenceReviewDecisions: [...existingOccurrenceReviews, decision],
  identityRegistry: identities,
});
const row = rows.find((candidate) => candidate.occurrence_id === decision.occurrence_id);
assert(row?.study_projection_eligible, "Flatbush Phase 1 occurrence is not study projection eligible");
assert(
  rows.filter((candidate) => candidate.occurrence_id === decision.occurrence_id).length === 1,
  "Flatbush Phase 1 occurrence projected more than once",
);
assert(
  stableJson(row.routes.map((route) => route.gtfs_route_id).sort() as unknown as JsonValue) ===
    stableJson(["B41", "B67"] as unknown as JsonValue),
  "Flatbush Phase 1 route scope changed",
);
assert(
  row.treatment.kind === "atomic" &&
    row.treatment.member.treatment_record_id === TREATMENT_ID &&
    row.treatment.member.treatment_family === "bus_lane",
  "Flatbush Phase 1 treatment scope changed",
);
assert(
  !row.provenance.event_record_ids.includes(COMPLETION_EVENT_ID) &&
    !row.provenance.relation_record_ids.includes(COMPLETION_RELATION_ID),
  "The separate Fall 2025 completion milestone leaked into the September installation-start occurrence",
);

const apply = process.argv.includes("--apply");
if (apply) writeArtifacts(decision, identities);
console.log(JSON.stringify({
  mode: apply ? "applied" : "dry-run",
  decision_id: decision.decision_id,
  occurrence_id: decision.occurrence_id,
  onset: row.resolved_onset,
  route_count: row.routes.length,
  gtfs_route_ids: row.routes.map((route) => route.gtfs_route_id),
  treatment_record_id: row.treatment.kind === "atomic" ? row.treatment.member.treatment_record_id : null,
  treatment_family: row.treatment.kind === "atomic" ? row.treatment.member.treatment_family : null,
  projected_occurrences: rows.length,
  projected_eligible_occurrences: rows.filter((candidate) => candidate.study_projection_eligible).length,
  projected_eligible_route_pairs: rows
    .filter((candidate) => candidate.study_projection_eligible)
    .reduce((sum, candidate) => sum + candidate.routes.length, 0),
  route_anchor_sha256: ROUTE_ANCHOR_SHA256,
}, null, 2));
