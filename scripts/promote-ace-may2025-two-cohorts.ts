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

const CUT_SOURCE_ID = "mta_ace_routes_may2025_cut";
const ACE_PROGRAM_PROJECT_ID = "project_ace-automated-camera-enforcement";
const APRIL_FORECAST_EVENT_ID = "event_ace-expansion-manhattan-apr2025";
const APRIL_FORECAST_RELATION_ID = "relation_ace-project-has-event-expansion";
const FALSE_JAMAICA_RELATION_ID = "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5";
const ACE_SELF_LOOP_RELATION_ID = "relation_rel-ace-routes-expansion";
const ROUTE_ANCHOR_PATH = "data/exports/releases/v1-rc15/route_anchors.jsonl";
const ROUTE_ANCHOR_SHA256 = "517b8f74a89e70ec4791d0bf327da6224bb9a6b2ea44eaf8162d704721659239";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const ACCEPTED_AT = "2026-07-13T20:15:00.000Z";
const EXPECTED_OCCURRENCE_COUNT = 134;
const EXPECTED_ELIGIBLE_COUNT = 133;
const EXPECTED_ELIGIBLE_ROUTE_PAIR_COUNT = 169;

interface EvidencePin {
  sourceId: string;
  evidenceId: string;
  sha256: string;
}

interface RouteSpec {
  routeRecordId: string;
  canonicalRouteLiteral: string;
  gtfsRouteId: string;
  relationId: string;
  pin: EvidencePin;
}

interface CohortSpec {
  decisionId: string;
  expectedOccurrenceId: string;
  projectId: string;
  eventId: string;
  treatmentId: string;
  timelineRelationId: string;
  treatmentRelationId: string;
  programRelationId: string;
  date: string;
  dateText: string;
  locationText: string;
  rowPins: readonly EvidencePin[];
  routes: readonly RouteSpec[];
  rationale: string;
}

const cutPins = {
  manifest: {
    sourceId: CUT_SOURCE_ID,
    evidenceId: `${CUT_SOURCE_ID}#p001_b0001`,
    sha256: "sha256:4739a081afb00f16c77a13989ff0a02f30ec781a229f08bf8493ac2bec3a6db1",
  },
  m2: {
    sourceId: CUT_SOURCE_ID,
    evidenceId: `${CUT_SOURCE_ID}#p001_b0002`,
    sha256: "sha256:b951f90ce367f9751b5854ba1f3531ea26847dc790157c383068d99499243eb4",
  },
  m4: {
    sourceId: CUT_SOURCE_ID,
    evidenceId: `${CUT_SOURCE_ID}#p001_b0003`,
    sha256: "sha256:9f678307c7c631f9cbde51eff922d9af1b4e74d2df00ff29b44c3ff73cde7df2",
  },
  bx5: {
    sourceId: CUT_SOURCE_ID,
    evidenceId: `${CUT_SOURCE_ID}#p001_b0004`,
    sha256: "sha256:af11743f84deb37d80e5d34e45c25401e17a6496898cf7907adfe41e4c6899bf",
  },
  m100: {
    sourceId: CUT_SOURCE_ID,
    evidenceId: `${CUT_SOURCE_ID}#p001_b0005`,
    sha256: "sha256:1ade6dcc0b19712835cb6da704c1adf3199af5fdffd3771615f9b11404b7e286",
  },
  m42: {
    sourceId: CUT_SOURCE_ID,
    evidenceId: `${CUT_SOURCE_ID}#p001_b0006`,
    sha256: "sha256:08e698e15923feefac5848969f9d9ac96ee67c0d3f3ceb16f0eb6e02671a3f02",
  },
} as const satisfies Record<string, EvidencePin>;

const dictionaryPins = {
  definition: {
    sourceId: "ace_routes_dataset_dictionary",
    evidenceId: "ace_routes_dataset_dictionary#p001_b0136",
    sha256: "sha256:9365d95e2570481960c7b23afc5d4319a92fff2d4055e3c239594b187e239c05",
  },
  field: {
    sourceId: "ace_routes_dataset_dictionary",
    evidenceId: "ace_routes_dataset_dictionary#p001_b0137",
    sha256: "sha256:6067471b839e1c04a8b973e81eae23c38c0fffa31ac36076ef1d41058ff6a91f",
  },
} as const satisfies Record<string, EvidencePin>;

const corroborationPins = [
  {
    sourceId: "nyct_key_performance_metrics_june2025",
    evidenceId: "nyct_key_performance_metrics_june2025#p005_c0003",
    sha256: "sha256:9fc307cf56e4a722aa295141283ba558804bae3171796e5b5e66b9bbad5b9a58",
  },
  {
    sourceId: "meeting_doc_179621",
    evidenceId: "meeting_doc_179621#p003_c0009",
    sha256: "sha256:1c2fe0ec1ad28cd6bc0d4279b6fbddcafba648d000b2e0d1de858a72c6e398f3",
  },
] as const satisfies readonly EvidencePin[];

const cohortSpecs = [
  {
    decisionId: "ace-m2-m4-implementation-2025-05-19",
    expectedOccurrenceId: "occurrence:2eb555e5b3999b7cdaae5004",
    projectId: "project_ace-m2-m4-implementation-2025-05-19",
    eventId: "event_ace-m2-m4-implementation-2025-05-19",
    treatmentId: "treatment_ace-m2-m4-implementation-2025-05-19",
    timelineRelationId: "relation_ace-m2-m4-has-implementation-2025-05-19",
    treatmentRelationId: "relation_ace-m2-m4-may19-has-enforcement",
    programRelationId: "relation_ace-m2-m4-may19-part-of-program",
    date: "2025-05-19",
    dateText: "May 19, 2025",
    locationText: "M2, M4",
    rowPins: [cutPins.m2, cutPins.m4],
    routes: [
      {
        routeRecordId: "route_m2-ace",
        canonicalRouteLiteral: "M2",
        gtfsRouteId: "M2",
        relationId: "relation_ace-m2-m4-2025-05-19-affects-m2",
        pin: cutPins.m2,
      },
      {
        routeRecordId: "route_m4-ace",
        canonicalRouteLiteral: "M4",
        gtfsRouteId: "M4",
        relationId: "relation_ace-m2-m4-2025-05-19-affects-m4",
        pin: cutPins.m4,
      },
    ],
    rationale: "The official MTA Open Data ACE route cut records M2 and M4 as one exact-day cohort whose program took effect on May 19, 2025; the official dataset dictionary defines implementation_date as the date the program took effect. June 2025 MTA performance materials and committee minutes corroborate that the five-route expansion was delivered, while the row-level cut keeps the May 19 cohort separate from the May 27 cohort. This decision resolves one realized ACE implementation occurrence with only M2 and M4 and one atomic automated_bus_lane_enforcement treatment. It does not reinterpret implementation as the start of fine-bearing enforcement, inherit the March forecast's planned April date, or import Jamaica, Bx35, future Madison Avenue, or unrelated umbrella-program scope.",
  },
  {
    decisionId: "ace-m42-m100-bx5-implementation-2025-05-27",
    expectedOccurrenceId: "occurrence:475b9dffbfed4fbc29dd53ac",
    projectId: "project_ace-m42-m100-bx5-implementation-2025-05-27",
    eventId: "event_ace-m42-m100-bx5-implementation-2025-05-27",
    treatmentId: "treatment_ace-m42-m100-bx5-implementation-2025-05-27",
    timelineRelationId: "relation_ace-m42-m100-bx5-has-implementation-2025-05-27",
    treatmentRelationId: "relation_ace-m42-m100-bx5-may27-has-enforcement",
    programRelationId: "relation_ace-m42-m100-bx5-may27-part-of-program",
    date: "2025-05-27",
    dateText: "May 27, 2025",
    locationText: "BX5, M100, M42",
    rowPins: [cutPins.bx5, cutPins.m100, cutPins.m42],
    routes: [
      {
        routeRecordId: "route_bx5-addendum-update",
        canonicalRouteLiteral: "Bx5",
        gtfsRouteId: "BX5",
        relationId: "relation_ace-m42-m100-bx5-2025-05-27-affects-bx5",
        pin: cutPins.bx5,
      },
      {
        routeRecordId: "route_m100-ace",
        canonicalRouteLiteral: "M100",
        gtfsRouteId: "M100",
        relationId: "relation_ace-m42-m100-bx5-2025-05-27-affects-m100",
        pin: cutPins.m100,
      },
      {
        routeRecordId: "route_m42-ace",
        canonicalRouteLiteral: "M42",
        gtfsRouteId: "M42",
        relationId: "relation_ace-m42-m100-bx5-2025-05-27-affects-m42",
        pin: cutPins.m42,
      },
    ],
    rationale: "The official MTA Open Data ACE route cut records BX5, M100, and M42 as one exact-day cohort whose program took effect on May 27, 2025; the official dataset dictionary defines implementation_date as the date the program took effect. June 2025 MTA performance materials and committee minutes corroborate that the five-route expansion was delivered, while the row-level cut keeps the May 27 cohort separate from the May 19 cohort. This decision resolves one realized ACE implementation occurrence with only BX5, M100, and M42 and one atomic automated_bus_lane_enforcement treatment. It does not reinterpret implementation as the start of fine-bearing enforcement, inherit the March forecast's planned April date, or import Jamaica, Bx35, future Madison Avenue, or unrelated umbrella-program scope.",
  },
] as const satisfies readonly CohortSpec[];

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
  assert(record, `Missing canonical record ${recordId}; apply the curated ACE May 2025 cohort graph, then materialize`);
  if (kind) assert(record.record_kind === kind, `${recordId} is ${record.record_kind}, expected ${kind}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
  return record;
}

function assertRecordEvidence(record: MtaCanonicalRecord, pin: EvidencePin): void {
  const ref = record.evidence_refs.find(
    (candidate) => candidate.source_id === pin.sourceId && candidate.evidence_id === pin.evidenceId,
  );
  assert(ref, `${record.record_id} lacks exact evidence ${pin.evidenceId}`);
  assert(ref.text_sha256 === pin.sha256, `${record.record_id}/${pin.evidenceId} hash changed`);
}

function binding(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  role: OperationalOccurrenceEvidenceBinding["role"],
  recordId: string,
  pin: EvidencePin,
): OperationalOccurrenceEvidenceBinding {
  const record = requiredRecord(recordsById, recordId);
  assertRecordEvidence(record, pin);
  return { role, record_id: recordId, source_id: pin.sourceId, evidence_id: pin.evidenceId };
}

function assertRelation(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  spec: CohortSpec,
  recordId: string,
  relationKind: string,
  objectId: string,
): void {
  const relation = requiredRecord(recordsById, recordId, "relation");
  assert(relation.payload.relation_kind === relationKind, `${recordId} relation kind changed`);
  assert(relation.payload.subject_id === spec.projectId, `${recordId} subject changed`);
  assert(relation.payload.object_id === objectId, `${recordId} object changed`);
  assert(relation.payload.assertion_status === "delivered", `${recordId} is not delivered`);
  assert(relation.payload.as_of_date === spec.date, `${recordId} as_of_date changed`);
}

function assertBoundedCohortGraph(
  records: readonly MtaCanonicalRecord[],
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  spec: CohortSpec,
): void {
  const project = requiredRecord(recordsById, spec.projectId, "project");
  assert(project.payload.project_family === "enforcement_program", `${spec.projectId} family changed`);
  assert(project.payload.status === "implemented", `${spec.projectId} status changed`);
  assert(project.payload.document_time_status === "implemented", `${spec.projectId} document-time status changed`);
  assert(project.payload.implementation_date === spec.date, `${spec.projectId} implementation date changed`);
  assert(project.payload.date_normalized === spec.date, `${spec.projectId} normalized date changed`);
  assert(project.payload.date_precision === "day", `${spec.projectId} precision changed`);
  for (const pin of spec.rowPins) assertRecordEvidence(project, pin);

  const event = requiredRecord(recordsById, spec.eventId, "event");
  assert(event.payload.event_family === "implementation", `${spec.eventId} family changed`);
  assert(event.payload.lifecycle_phase === "expanded", `${spec.eventId} lifecycle changed`);
  assert(event.payload.date_text === spec.dateText, `${spec.eventId} date text changed`);
  assert(event.payload.date_normalized === spec.date, `${spec.eventId} date changed`);
  assert(event.payload.date_precision === "day", `${spec.eventId} precision changed`);
  const normalizedDate = event.payload.date_text_normalized;
  assert(
    typeof normalizedDate === "object" &&
      normalizedDate !== null &&
      !Array.isArray(normalizedDate) &&
      normalizedDate.normalized_date === spec.date &&
      normalizedDate.precision === "day",
    `${spec.eventId} nested normalized date conflicts with the exact-day onset`,
  );
  for (const pin of [...spec.rowPins, ...Object.values(dictionaryPins), ...corroborationPins]) {
    assertRecordEvidence(event, pin);
  }

  const treatment = requiredRecord(recordsById, spec.treatmentId, "treatment_component");
  assert(
    treatment.payload.treatment_family === "automated_bus_lane_enforcement",
    `${spec.treatmentId} family changed`,
  );
  assert(
    treatment.payload.treatment_kind === "Automated Camera Enforcement (ACE) route implementation",
    `${spec.treatmentId} kind changed`,
  );
  assert(treatment.payload.location_text === spec.locationText, `${spec.treatmentId} location changed`);
  assert(treatment.payload.implementation_date === spec.date, `${spec.treatmentId} date changed`);
  for (const pin of spec.rowPins) assertRecordEvidence(treatment, pin);

  assertRelation(recordsById, spec, spec.timelineRelationId, "has_timeline_event", spec.eventId);
  assertRelation(recordsById, spec, spec.treatmentRelationId, "has_treatment", spec.treatmentId);
  assertRelation(recordsById, spec, spec.programRelationId, "part_of_program", ACE_PROGRAM_PROJECT_ID);
  for (const route of spec.routes) {
    const routeRecord = requiredRecord(recordsById, route.routeRecordId, "route");
    assert(routeRecord.payload.route_id === route.canonicalRouteLiteral, `${route.routeRecordId} route literal changed`);
    assert(routeRecord.payload.source_literal === route.gtfsRouteId, `${route.routeRecordId} source literal changed`);
    assert(routeRecord.payload.route_record_scope === "true_route", `${route.routeRecordId} is no longer a true route`);
    assertRecordEvidence(routeRecord, route.pin);
    assertRelation(recordsById, spec, route.relationId, "affects_route", route.routeRecordId);
  }

  const scopedRelations = records.filter(
    (record) =>
      record.record_kind === "relation" &&
      record.truth_status === "source_stated" &&
      record.review_state !== "quarantined" &&
      record.payload.subject_id === spec.projectId,
  );
  const expectedRelationIds = [
    spec.timelineRelationId,
    spec.treatmentRelationId,
    spec.programRelationId,
    ...spec.routes.map((route) => route.relationId),
  ].sort();
  assert(
    stableJson(scopedRelations.map((record) => record.record_id).sort() as unknown as JsonValue) ===
      stableJson(expectedRelationIds as unknown as JsonValue),
    `${spec.projectId} graph contains missing or unrelated relations`,
  );
}

function assertForecastAndLegacySeparation(recordsById: ReadonlyMap<string, MtaCanonicalRecord>): void {
  const forecast = requiredRecord(recordsById, APRIL_FORECAST_EVENT_ID, "event");
  assert(forecast.payload.event_family === "implementation", `${APRIL_FORECAST_EVENT_ID} family changed`);
  assert(forecast.payload.lifecycle_phase === "planned", `${APRIL_FORECAST_EVENT_ID} is no longer planned`);
  assert(forecast.payload.date_normalized === "2025-04", `${APRIL_FORECAST_EVENT_ID} forecast date changed`);
  assert(forecast.payload.date_precision === "month", `${APRIL_FORECAST_EVENT_ID} forecast precision changed`);

  const forecastRelation = requiredRecord(recordsById, APRIL_FORECAST_RELATION_ID, "relation");
  assert(forecastRelation.payload.relation_kind === "has_timeline_event", `${APRIL_FORECAST_RELATION_ID} kind changed`);
  assert(forecastRelation.payload.subject_id === ACE_PROGRAM_PROJECT_ID, `${APRIL_FORECAST_RELATION_ID} subject changed`);
  assert(forecastRelation.payload.object_id === APRIL_FORECAST_EVENT_ID, `${APRIL_FORECAST_RELATION_ID} object changed`);
  assert(forecastRelation.payload.assertion_status === "planned", `${APRIL_FORECAST_RELATION_ID} is no longer planned`);

  assert(!recordsById.has(FALSE_JAMAICA_RELATION_ID), `${FALSE_JAMAICA_RELATION_ID} false Jamaica edge reappeared`);
  const selfLoop = recordsById.get(ACE_SELF_LOOP_RELATION_ID);
  assert(selfLoop?.record_kind === "relation", `Missing quarantined ACE self-loop ${ACE_SELF_LOOP_RELATION_ID}`);
  assert(selfLoop.truth_status === "source_stated", `${ACE_SELF_LOOP_RELATION_ID} truth status changed`);
  assert(selfLoop.review_state === "quarantined", `${ACE_SELF_LOOP_RELATION_ID} escaped quarantine`);
  assert(
    selfLoop.payload.subject_id === "entity_ace-program" && selfLoop.payload.object_id === "entity_ace-program",
    `${ACE_SELF_LOOP_RELATION_ID} is no longer the known ACE self-loop`,
  );
}

function occurrenceDecision(
  records: readonly MtaCanonicalRecord[],
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  spec: CohortSpec,
): OperationalOccurrenceAcceptedDecision {
  assertBoundedCohortGraph(records, recordsById, spec);
  const identity = newOperationalOccurrenceIdentityEntry({
    foundingKey: `event:${spec.eventId}`,
    foundingEventRecordIds: [spec.eventId],
    decisionId: spec.decisionId,
    issuedAt: ACCEPTED_AT,
  });
  assert(identity.occurrence_id === spec.expectedOccurrenceId, `${spec.decisionId} occurrence identity changed`);
  return parseOperationalOccurrenceAcceptedDecision({
    schema_version: 1,
    decision_id: spec.decisionId,
    review_state: "approved",
    accepted_at: ACCEPTED_AT,
    reviewer: REVIEWER,
    rationale: spec.rationale,
    occurrence_id: identity.occurrence_id,
    founding_key: identity.founding_key,
    observation_event_record_ids: [spec.eventId],
    observation_relation_record_ids: [
      spec.timelineRelationId,
      spec.treatmentRelationId,
      ...spec.routes.map((route) => route.relationId),
    ].sort(),
    resolved_status: "realized",
    resolved_onset: {
      date: spec.date,
      precision: "day",
      evidence_bindings: [
        ...spec.rowPins.map((pin) => binding(recordsById, "event_date", spec.eventId, pin)),
        ...spec.rowPins.map((pin) => binding(recordsById, "timeline_relation", spec.timelineRelationId, pin)),
      ],
    },
    routes: spec.routes.map((route) => ({
      route_record_id: route.routeRecordId,
      gtfs_route_id: route.gtfsRouteId,
      evidence_bindings: [
        binding(recordsById, "route_identity", route.routeRecordId, route.pin),
        binding(recordsById, "route_scope", route.relationId, route.pin),
      ],
    })),
    treatment_scope_kind: "atomic",
    treatment: {
      kind: "atomic",
      member: {
        treatment_record_id: spec.treatmentId,
        treatment_family: "automated_bus_lane_enforcement",
        evidence_bindings: [
          ...spec.rowPins.map((pin) => binding(recordsById, "treatment_definition", spec.treatmentId, pin)),
          ...spec.rowPins.map((pin) => binding(recordsById, "treatment_scope", spec.treatmentRelationId, pin)),
        ],
      },
    },
  }, spec.decisionId);
}

function identityRegistry(
  decisions: readonly OperationalOccurrenceAcceptedDecision[],
): OperationalOccurrenceIdentityEntry[] {
  const existing = loadOperationalOccurrenceIdentityRegistry();
  const byKey = new Map(existing.map((entry) => [entry.founding_key, entry]));
  const additions = decisions.flatMap((decision) => {
    const expected = newOperationalOccurrenceIdentityEntry({
      foundingKey: decision.founding_key,
      foundingEventRecordIds: decision.observation_event_record_ids,
      decisionId: decision.decision_id,
      issuedAt: ACCEPTED_AT,
    });
    const current = byKey.get(decision.founding_key);
    if (!current) return [expected];
    assert(
      stableJson(current as unknown as JsonValue) === stableJson(expected as unknown as JsonValue),
      `${decision.founding_key} identity differs`,
    );
    return [];
  });
  return assertOperationalOccurrenceIdentityRegistry([...existing, ...additions]);
}

function assertAuthority(routeAnchors: readonly RouteAnchorRow[]): void {
  const anchorBytes = readFileSync(join(repoRoot, ROUTE_ANCHOR_PATH));
  assert(sha256(anchorBytes) === ROUTE_ANCHOR_SHA256, `${ROUTE_ANCHOR_PATH} hash changed`);

  const artifactHashes = {
    "metadata.json": "8f8a599f163550a7486affe9ac232055629ae0b16128ad45628d43fe80192371",
    "source.json": "8f206d056b24099c5ff1f03957a94ff06fdfb7c43b52c4630961fbd4ee50b6ea",
    "text.txt": "10149a6594cd379bfb59fa64bb54f043191b8ffe6a4ad4da23cb33c8ac4083d6",
    "blocks.jsonl": "f4a364c38c4048ef20c25865694b25c39c1199c1eca620ada54caf1758ad711f",
  } as const;
  for (const [name, expectedHash] of Object.entries(artifactHashes)) {
    const path = join(repoRoot, "raw/sources", CUT_SOURCE_ID, name);
    assert(sha256(readFileSync(path)) === expectedHash, `${CUT_SOURCE_ID}/${name} hash changed`);
  }

  const blocks = readJsonl<Record<string, unknown>>(join(repoRoot, "raw/sources", CUT_SOURCE_ID, "blocks.jsonl"));
  for (const pin of Object.values(cutPins)) {
    const blockId = pin.evidenceId.slice(pin.evidenceId.indexOf("#") + 1);
    const block = blocks.find((candidate) => candidate.block_id === blockId);
    assert(block?.source_id === CUT_SOURCE_ID, `Missing staged cut block ${pin.evidenceId}`);
    assert(block.raw_text_sha256 === pin.sha256, `${pin.evidenceId} staged evidence hash changed`);
  }

  for (const spec of cohortSpecs) {
    for (const route of spec.routes) {
      const matches = routeAnchors.filter((anchor) => anchor.gtfs_route_id === route.gtfsRouteId);
      assert(matches.length === 1, `Expected one rc15 route anchor for ${route.gtfsRouteId}`);
      assert(matches[0]?.disposition === "true_route", `${route.gtfsRouteId} rc15 anchor is not a true route`);
      assert(
        matches[0]?.canonical_route_record_id === route.routeRecordId,
        `${route.gtfsRouteId} rc15 canonical route changed`,
      );
    }
  }
}

function writeArtifacts(
  decisions: readonly OperationalOccurrenceAcceptedDecision[],
  identities: readonly OperationalOccurrenceIdentityEntry[],
): void {
  const decisionDir = join(repoRoot, "data/operational-occurrence-review/accepted/decisions");
  const artifacts = new Map(
    decisions.map((decision) => [join(decisionDir, `${decision.decision_id}.json`), `${JSON.stringify(decision, null, 2)}\n`]),
  );
  for (const [path, bytes] of artifacts) {
    if (existsSync(path)) assert(readFileSync(path, "utf8") === bytes, `Refusing to overwrite non-equivalent ${path}`);
  }
  mkdirSync(decisionDir, { recursive: true });
  for (const [path, bytes] of artifacts) if (!existsSync(path)) writeFileSync(path, bytes, "utf8");
  const registryPath = join(repoRoot, "data/operational-occurrence-identities/registry.jsonl");
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(
    registryPath,
    `${identities.map((entry) => stableJson(entry as unknown as JsonValue)).join("\n")}\n`,
    "utf8",
  );
}

const routeAnchors = readJsonl<RouteAnchorRow>(join(repoRoot, ROUTE_ANCHOR_PATH));
assertAuthority(routeAnchors);
const records = readCanonicalRecordsFromJsonl();
const recordsById = new Map(records.map((record) => [record.record_id, record]));
assertForecastAndLegacySeparation(recordsById);
const decisions = cohortSpecs.map((spec) => occurrenceDecision(records, recordsById, spec));
assert(decisions.length === 2, "ACE May 2025 promotion must contain exactly two accepted decisions");
assert(new Set(decisions.map((decision) => decision.decision_id)).size === 2, "ACE cohort decision ids collided");
assert(new Set(decisions.map((decision) => decision.occurrence_id)).size === 2, "ACE cohort occurrence ids collided");
const identities = identityRegistry(decisions);
const existingReviews = loadOperationalOccurrenceAcceptedDecisions().filter(
  (candidate) => !decisions.some((decision) => decision.decision_id === candidate.decision_id),
);
const rows = computeOperationalOccurrences(records, routeAnchors, {
  reviewDecisions: loadOperationalAnchorReviewDecisions(),
  occurrenceReviewDecisions: [...existingReviews, ...decisions],
  identityRegistry: identities,
});
assert(rows.length === EXPECTED_OCCURRENCE_COUNT, `Projected ${rows.length} occurrences, expected ${EXPECTED_OCCURRENCE_COUNT}`);
assert(
  rows.filter((row) => row.study_projection_eligible).length === EXPECTED_ELIGIBLE_COUNT,
  `Projected eligible occurrence count is not ${EXPECTED_ELIGIBLE_COUNT}`,
);
assert(
  rows
    .filter((row) => row.study_projection_eligible)
    .reduce((sum, row) => sum + row.routes.length, 0) === EXPECTED_ELIGIBLE_ROUTE_PAIR_COUNT,
  `Projected eligible route-pair count is not ${EXPECTED_ELIGIBLE_ROUTE_PAIR_COUNT}`,
);
for (const [index, decision] of decisions.entries()) {
  const spec = cohortSpecs[index];
  assert(spec, `Missing cohort spec for ${decision.decision_id}`);
  const matchingRows = rows.filter((row) => row.occurrence_id === decision.occurrence_id);
  assert(matchingRows.length === 1, `${decision.decision_id} projected ${matchingRows.length} times`);
  const row = matchingRows[0];
  assert(row?.study_projection_eligible, `${decision.decision_id} is not study projection eligible`);
  assert(row.resolved_status === "realized", `${decision.decision_id} is not realized`);
  assert(
    row.resolved_onset.date === spec.date && row.resolved_onset.precision === "day",
    `${decision.decision_id} onset changed`,
  );
  assert(
    stableJson(row.routes.map((route) => route.gtfs_route_id).sort() as unknown as JsonValue) ===
      stableJson(spec.routes.map((route) => route.gtfsRouteId).sort() as unknown as JsonValue),
    `${decision.decision_id} route scope changed`,
  );
  assert(
    row.treatment.kind === "atomic" &&
      row.treatment.member.treatment_record_id === spec.treatmentId &&
      row.treatment.member.treatment_family === "automated_bus_lane_enforcement",
    `${decision.decision_id} treatment scope changed`,
  );
  assert(
    stableJson(row.provenance.event_record_ids as unknown as JsonValue) ===
      stableJson([spec.eventId] as unknown as JsonValue),
    `${decision.decision_id} contains unrelated event provenance`,
  );
  const expectedRelationIds = [
    spec.timelineRelationId,
    spec.treatmentRelationId,
    ...spec.routes.map((route) => route.relationId),
  ].sort();
  assert(
    stableJson(row.provenance.relation_record_ids.slice().sort() as unknown as JsonValue) ===
      stableJson(expectedRelationIds as unknown as JsonValue),
    `${decision.decision_id} contains unrelated relation provenance`,
  );
  assert(
    !row.provenance.event_record_ids.includes(APRIL_FORECAST_EVENT_ID) &&
      !row.provenance.relation_record_ids.includes(APRIL_FORECAST_RELATION_ID) &&
      !row.provenance.relation_record_ids.includes(spec.programRelationId) &&
      !row.provenance.relation_record_ids.includes(ACE_SELF_LOOP_RELATION_ID),
    `${decision.decision_id} inherited forecast, umbrella-program, or quarantined scope`,
  );
}

const apply = process.argv.includes("--apply");
if (apply) writeArtifacts(decisions, identities);
console.log(JSON.stringify({
  mode: apply ? "applied" : "dry-run",
  occurrence_decisions: decisions.map((decision) => ({
    decision_id: decision.decision_id,
    founding_key: decision.founding_key,
    occurrence_id: decision.occurrence_id,
  })),
  identity_registry_rows: identities.length,
  projected_occurrences: rows.length,
  projected_eligible_occurrences: rows.filter((row) => row.study_projection_eligible).length,
  projected_eligible_route_pairs: rows
    .filter((row) => row.study_projection_eligible)
    .reduce((sum, row) => sum + row.routes.length, 0),
  rc15_route_anchor_sha256: ROUTE_ANCHOR_SHA256,
}, null, 2));
