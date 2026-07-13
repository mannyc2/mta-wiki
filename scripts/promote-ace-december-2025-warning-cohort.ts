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

const DECISION_ID = "ace-b60-b68-m57-warning-phase-2025-12-08";
const EXPECTED_OCCURRENCE_ID = "occurrence:1ed365a241353614f72f025e";
const FOUNDING_KEY = "event:event_ace-program-expansion-dec2025";
const PROJECT_ID = "project_ace-b60-b68-m57-warning-cohort-2025-12-08";
const EVENT_ID = "event_ace-program-expansion-dec2025";
const TREATMENT_ID = "treatment_ace-b60-b68-m57-warning-phase-2025-12-08";
const TIMELINE_RELATION_ID = "relation_ace-b60-b68-m57-warning-has-activation-2025-12-08";
const TREATMENT_RELATION_ID = "relation_ace-b60-b68-m57-warning-has-treatment-2025-12-08";
const PROGRAM_RELATION_ID = "relation_ace-b60-b68-m57-warning-part-of-program";
const ACE_PROGRAM_PROJECT_ID = "project_ace-automated-camera-enforcement";
const ONSET = "2025-12-08";
const SOURCE_ID = "nyct_key_performance_metrics_doc194001";
const ROUTE_ANCHOR_PATH = "data/exports/releases/v1-rc18/route_anchors.jsonl";
const ROUTE_ANCHOR_SHA256 = "517b8f74a89e70ec4791d0bf327da6224bb9a6b2ea44eaf8162d704721659239";
const ACQUISITION_RECEIPT_PATH =
  "data/quality/acquisition/receipts/ace-b60-b68-m57-warning-phase-december-8-2025.json";
const ACQUISITION_RECEIPT_SHA256 = "7b9d63000090cf22821949db5087d2b2b5611ada41059cc5069aaf356c159fdb";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const ACCEPTED_AT = "2026-07-13T22:45:00.000Z";
const EXPECTED_OCCURRENCE_COUNT = 135;
const EXPECTED_ELIGIBLE_COUNT = 134;
const EXPECTED_ELIGIBLE_ROUTE_PAIR_COUNT = 172;
const EXPECTED_ATOMIC_COUNT = 50;
const EXPECTED_BUNDLE_COUNT = 85;
const EXPECTED_MULTI_ROUTE_COUNT = 10;

interface EvidencePin {
  sourceId: string;
  evidenceId: string;
  blockId: string;
  sha256: string;
  requiredLiterals: readonly string[];
}

interface SourceBlock {
  block_id: string;
  source_id: string;
  raw_text: string;
  raw_text_sha256: string;
}

interface RouteSpec {
  gtfsRouteId: "B60" | "B68" | "M57";
  routeRecordId: string;
  relationId: string;
}

const evidencePins = {
  reportMonth: {
    sourceId: SOURCE_ID,
    evidenceId: `${SOURCE_ID}#p001_c0002`,
    blockId: "p001_c0002",
    sha256: "sha256:1c2e7d7242d4937bffeb7ae2ac5b4071b084298424eb1637e9c216f6f292d64f",
    requiredLiterals: ["December 2025"],
  },
  reportDate: {
    sourceId: SOURCE_ID,
    evidenceId: `${SOURCE_ID}#p003_c0003`,
    blockId: "p003_c0003",
    sha256: "sha256:da018863a9eae42e35f1a801fc448de9d224d07d24d389b5c264e09564cfb624",
    requiredLiterals: ["December 15, 2025"],
  },
  activation: {
    sourceId: SOURCE_ID,
    evidenceId: `${SOURCE_ID}#p010_c0011`,
    blockId: "p010_c0011",
    sha256: "sha256:e147dfa103fac9d1499e269c62864619e13cdfd4b3540e71e98ebfb706cd1a42",
    requiredLiterals: [
      "On December 8",
      "the B68 and B60 in Brooklyn and the M57 in Manhattan entered a 60-day warning phase",
    ],
  },
  warningDefinition: {
    sourceId: SOURCE_ID,
    evidenceId: `${SOURCE_ID}#p011_c0009`,
    blockId: "p011_c0009",
    sha256: "sha256:2d2318454276de1fad6ef39bbd54826456515f6b382b2a9e95ab426545adf858",
    requiredLiterals: [
      "lanes, bus stops, or double-parked received warning notices",
      "These routes joined 51 already covered by ACE",
    ],
  },
} as const satisfies Record<string, EvidencePin>;

const routes = [
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
] as const satisfies readonly RouteSpec[];

const allPins = Object.values(evidencePins);
const datePins = [evidencePins.activation, evidencePins.reportMonth, evidencePins.reportDate] as const;
const retiredUmbrellaRouteRelationIds = [
  "relation_ace-covers-b60",
  "relation_ace-covers-b68",
  "relation_ace-covers-m57",
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
    `Missing canonical record ${recordId}; apply scripts/curate-ace-december-2025-warning-cohort.ts and materialize first`,
  );
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
  recordId: string,
  relationKind: string,
  relationFamily: string,
  objectId: string,
): MtaCanonicalRecord {
  const relation = requiredRecord(recordsById, recordId, "relation");
  assert(relation.payload.relation_kind === relationKind, `${recordId} relation kind changed`);
  assert(relation.payload.relation_family === relationFamily, `${recordId} relation family changed`);
  assert(relation.payload.subject_id === PROJECT_ID, `${recordId} subject changed`);
  assert(relation.payload.object_id === objectId, `${recordId} object changed`);
  assert(relation.payload.assertion_status === "delivered", `${recordId} is not delivered`);
  assert(relation.payload.as_of_date === ONSET, `${recordId} as_of_date changed`);
  for (const pin of allPins) assertRecordEvidence(relation, pin);
  return relation;
}

function assertAuthority(routeAnchors: readonly RouteAnchorRow[]): void {
  const routeAnchorBytes = readFileSync(join(repoRoot, ROUTE_ANCHOR_PATH));
  assert(sha256(routeAnchorBytes) === ROUTE_ANCHOR_SHA256, `${ROUTE_ANCHOR_PATH} hash changed`);
  assert(
    sha256(readFileSync(join(repoRoot, ACQUISITION_RECEIPT_PATH))) === ACQUISITION_RECEIPT_SHA256,
    `${ACQUISITION_RECEIPT_PATH} changed`,
  );

  const artifactHashes = {
    "metadata.json": "641b84213f03daa8591e9fbc9f1d7325eea12daed2d55770448fe87173fa35d0",
    "source.pdf": "61b015b7778c176b182d4d81422aaf27c06f0ee6ad2953cb494cbff9453b2f19",
    "text.txt": "94e7d39757e0cb7c39f580341d8fdb990c2637be87c7ece9bee55a83a83bd68e",
    "blocks.jsonl": "068d54b750065e0a05d2b1b696d64eaf5171763908626207115060c5bf7f7ee7",
  } as const;
  for (const [name, expectedHash] of Object.entries(artifactHashes)) {
    const path = join(repoRoot, "raw/sources", SOURCE_ID, name);
    assert(sha256(readFileSync(path)) === expectedHash, `${SOURCE_ID}/${name} hash changed`);
  }

  const blocks = new Map(
    readJsonl<SourceBlock>(join(repoRoot, "raw/sources", SOURCE_ID, "blocks.jsonl")).map((block) => [
      block.block_id,
      block,
    ]),
  );
  for (const pin of allPins) {
    const block = blocks.get(pin.blockId);
    assert(block?.source_id === SOURCE_ID, `Missing staged evidence ${pin.evidenceId}`);
    assert(block.raw_text_sha256 === pin.sha256, `${pin.evidenceId} staged evidence hash changed`);
    for (const literal of pin.requiredLiterals) {
      assert(block.raw_text.includes(literal), `${pin.evidenceId} lost ${JSON.stringify(literal)}`);
    }
  }

  for (const route of routes) {
    const matches = routeAnchors.filter((anchor) => anchor.gtfs_route_id === route.gtfsRouteId);
    assert(matches.length === 1, `Expected one rc18 route anchor for ${route.gtfsRouteId}`);
    const anchor = matches[0];
    assert(anchor?.disposition === "true_route", `${route.gtfsRouteId} rc18 anchor is not a true route`);
    assert(
      anchor.canonical_route_record_id === route.routeRecordId,
      `${route.gtfsRouteId} rc18 canonical route changed`,
    );
    assert(anchor.variant_record_ids.length === 0, `${route.gtfsRouteId} rc18 anchor gained variants`);
  }
}

function assertBoundedCohortGraph(
  records: readonly MtaCanonicalRecord[],
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): void {
  const project = requiredRecord(recordsById, PROJECT_ID, "project");
  assert(project.payload.project_family === "enforcement_program", `${PROJECT_ID} family changed`);
  assert(project.payload.status === "implemented", `${PROJECT_ID} status changed`);
  assert(project.payload.document_time_status === "implemented", `${PROJECT_ID} document-time status changed`);
  assert(project.payload.implementation_date === ONSET, `${PROJECT_ID} implementation date changed`);
  assert(project.payload.date_normalized === ONSET, `${PROJECT_ID} normalized date changed`);
  assert(project.payload.date_precision === "day", `${PROJECT_ID} date precision changed`);
  assert(
    typeof project.payload.description === "string" &&
      project.payload.description.includes("does not assert a fine-bearing start date"),
    `${PROJECT_ID} lost its fine-bearing non-claim`,
  );
  for (const pin of allPins) assertRecordEvidence(project, pin);

  const event = requiredRecord(recordsById, EVENT_ID, "event");
  assert(event.payload.event_kind === "ACE warning-phase activation", `${EVENT_ID} kind changed`);
  assert(event.payload.event_family === "implementation", `${EVENT_ID} family changed`);
  assert(event.payload.lifecycle_phase === "expanded", `${EVENT_ID} lifecycle changed`);
  assert(event.payload.event_date === "December 8", `${EVENT_ID} source date literal changed`);
  assert(event.payload.date_normalized === ONSET, `${EVENT_ID} date changed`);
  assert(event.payload.date_precision === "day", `${EVENT_ID} precision changed`);
  assert(
    event.payload.description ===
      "ACE expanded to B60, B68, and M57 when the three routes entered a 60-day warning phase on December 8, 2025; the source does not establish the later fine-bearing start date.",
    `${EVENT_ID} warning-phase description changed`,
  );
  const nestedDate = event.payload.event_date_normalized;
  assert(
    typeof nestedDate === "object" &&
      nestedDate !== null &&
      !Array.isArray(nestedDate) &&
      nestedDate.raw_text === "December 8" &&
      nestedDate.normalized_date === ONSET &&
      nestedDate.precision === "day",
    `${EVENT_ID} nested date conflicts with the exact warning-phase onset`,
  );
  for (const pin of allPins) assertRecordEvidence(event, pin);

  const treatment = requiredRecord(recordsById, TREATMENT_ID, "treatment_component");
  assert(
    treatment.payload.treatment_family === "automated_bus_lane_enforcement",
    `${TREATMENT_ID} family changed`,
  );
  assert(
    treatment.payload.treatment_kind === "Automated Camera Enforcement (ACE) 60-day warning-phase activation",
    `${TREATMENT_ID} kind changed`,
  );
  assert(treatment.payload.location_text === "B60, B68, and M57", `${TREATMENT_ID} location changed`);
  assert(treatment.payload.implementation_date === ONSET, `${TREATMENT_ID} date changed`);
  assert(
    typeof treatment.payload.description === "string" &&
      treatment.payload.description.includes("does not claim that fines began that day"),
    `${TREATMENT_ID} lost its fine-bearing non-claim`,
  );
  for (const pin of allPins) assertRecordEvidence(treatment, pin);

  assertRelation(recordsById, TIMELINE_RELATION_ID, "has_timeline_event", "timeline_context", EVENT_ID);
  assertRelation(recordsById, TREATMENT_RELATION_ID, "has_treatment", "treatment_context", TREATMENT_ID);
  assertRelation(
    recordsById,
    PROGRAM_RELATION_ID,
    "part_of_program",
    "program_project_scope",
    ACE_PROGRAM_PROJECT_ID,
  );

  for (const route of routes) {
    const routeRecord = requiredRecord(recordsById, route.routeRecordId, "route");
    assert(routeRecord.payload.route_id === route.gtfsRouteId, `${route.routeRecordId} route literal changed`);
    assert(routeRecord.payload.route_record_scope === "true_route", `${route.routeRecordId} is not a true route`);
    assertRecordEvidence(routeRecord, evidencePins.activation);
    assertRelation(recordsById, route.relationId, "affects_route", "route_scope", route.routeRecordId);
  }

  const scopedRelations = records.filter(
    (record) =>
      record.record_kind === "relation" &&
      record.truth_status === "source_stated" &&
      record.review_state !== "quarantined" &&
      record.payload.subject_id === PROJECT_ID,
  );
  const expectedRelationIds = [
    TIMELINE_RELATION_ID,
    TREATMENT_RELATION_ID,
    PROGRAM_RELATION_ID,
    ...routes.map((route) => route.relationId),
  ].sort();
  assert(
    stableJson(scopedRelations.map((record) => record.record_id).sort() as unknown as JsonValue) ===
      stableJson(expectedRelationIds as unknown as JsonValue),
    `${PROJECT_ID} graph contains missing or unrelated relations`,
  );

  for (const relationId of retiredUmbrellaRouteRelationIds) {
    assert(!recordsById.has(relationId), `${relationId} malformed umbrella route edge reappeared`);
  }
}

function occurrenceDecision(
  records: readonly MtaCanonicalRecord[],
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): OperationalOccurrenceAcceptedDecision {
  assertBoundedCohortGraph(records, recordsById);
  const identity = newOperationalOccurrenceIdentityEntry({
    foundingKey: FOUNDING_KEY,
    foundingEventRecordIds: [EVENT_ID],
    decisionId: DECISION_ID,
    issuedAt: ACCEPTED_AT,
  });
  assert(identity.occurrence_id === EXPECTED_OCCURRENCE_ID, `${DECISION_ID} occurrence identity changed`);

  return parseOperationalOccurrenceAcceptedDecision({
    schema_version: 1,
    decision_id: DECISION_ID,
    review_state: "approved",
    accepted_at: ACCEPTED_AT,
    reviewer: REVIEWER,
    rationale:
      "The official December 2025 MTA committee book states that B60, B68, and M57 entered one 60-day ACE warning phase on December 8. The report context resolves the source literal to December 8, 2025, and the warning definition establishes a realized operational treatment onset. This decision binds exactly those three routes to one atomic automated_bus_lane_enforcement treatment. It does not infer that fine-bearing enforcement began on December 8, calculate a later fine-bearing date from the 60-day period, or inherit any other route from the umbrella ACE program.",
    occurrence_id: identity.occurrence_id,
    founding_key: identity.founding_key,
    observation_event_record_ids: [EVENT_ID],
    observation_relation_record_ids: [
      TIMELINE_RELATION_ID,
      TREATMENT_RELATION_ID,
      ...routes.map((route) => route.relationId),
    ].sort(),
    resolved_status: "realized",
    resolved_onset: {
      date: ONSET,
      precision: "day",
      evidence_bindings: [
        ...datePins.map((pin) => binding(recordsById, "event_date", EVENT_ID, pin)),
        ...datePins.map((pin) => binding(recordsById, "timeline_relation", TIMELINE_RELATION_ID, pin)),
      ],
    },
    routes: routes.map((route) => ({
      route_record_id: route.routeRecordId,
      gtfs_route_id: route.gtfsRouteId,
      evidence_bindings: [
        binding(recordsById, "route_identity", route.routeRecordId, evidencePins.activation),
        binding(recordsById, "route_scope", route.relationId, evidencePins.activation),
      ],
    })),
    treatment_scope_kind: "atomic",
    treatment: {
      kind: "atomic",
      member: {
        treatment_record_id: TREATMENT_ID,
        treatment_family: "automated_bus_lane_enforcement",
        evidence_bindings: [
          binding(recordsById, "treatment_definition", TREATMENT_ID, evidencePins.activation),
          binding(recordsById, "treatment_definition", TREATMENT_ID, evidencePins.warningDefinition),
          binding(recordsById, "treatment_scope", TREATMENT_RELATION_ID, evidencePins.activation),
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
      `${decision.founding_key} identity differs`,
    );
    return assertOperationalOccurrenceIdentityRegistry(existing);
  }
  return assertOperationalOccurrenceIdentityRegistry([...existing, expected]);
}

function writeArtifacts(
  decision: OperationalOccurrenceAcceptedDecision,
  identities: readonly OperationalOccurrenceIdentityEntry[],
): void {
  const decisionPath = join(
    repoRoot,
    "data/operational-occurrence-review/accepted/decisions",
    `${decision.decision_id}.json`,
  );
  const decisionBytes = `${JSON.stringify(decision, null, 2)}\n`;
  if (existsSync(decisionPath)) {
    assert(readFileSync(decisionPath, "utf8") === decisionBytes, `Refusing to overwrite non-equivalent ${decisionPath}`);
  } else {
    mkdirSync(dirname(decisionPath), { recursive: true });
    writeFileSync(decisionPath, decisionBytes, "utf8");
  }

  const registryPath = join(repoRoot, "data/operational-occurrence-identities/registry.jsonl");
  const registryBytes = `${identities.map((entry) => stableJson(entry as unknown as JsonValue)).join("\n")}\n`;
  if (existsSync(registryPath)) {
    const current = loadOperationalOccurrenceIdentityRegistry();
    const currentEntry = current.find((entry) => entry.founding_key === FOUNDING_KEY);
    if (currentEntry) {
      assert(
        stableJson(currentEntry as unknown as JsonValue) ===
          stableJson(identities.find((entry) => entry.founding_key === FOUNDING_KEY)! as unknown as JsonValue),
        `Refusing to overwrite a divergent ${FOUNDING_KEY} identity`,
      );
    }
  }
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, registryBytes, "utf8");
}

const routeAnchors = readJsonl<RouteAnchorRow>(join(repoRoot, ROUTE_ANCHOR_PATH));
assertAuthority(routeAnchors);
const records = readCanonicalRecordsFromJsonl();
const recordsById = new Map(records.map((record) => [record.record_id, record]));
const decision = occurrenceDecision(records, recordsById);
const identities = identityRegistry(decision);
assert(identities.length === EXPECTED_OCCURRENCE_COUNT, `Projected identity registry has ${identities.length} rows`);

const existingReviews = loadOperationalOccurrenceAcceptedDecisions().filter(
  (candidate) => candidate.decision_id !== DECISION_ID,
);
const rows = computeOperationalOccurrences(records, routeAnchors, {
  reviewDecisions: loadOperationalAnchorReviewDecisions(),
  occurrenceReviewDecisions: [...existingReviews, decision],
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
assert(
  rows.filter((row) => row.treatment.kind === "atomic").length === EXPECTED_ATOMIC_COUNT,
  `Projected atomic occurrence count is not ${EXPECTED_ATOMIC_COUNT}`,
);
assert(
  rows.filter((row) => row.treatment.kind === "bundle").length === EXPECTED_BUNDLE_COUNT,
  `Projected bundle occurrence count is not ${EXPECTED_BUNDLE_COUNT}`,
);
assert(
  rows.filter((row) => row.routes.length > 1).length === EXPECTED_MULTI_ROUTE_COUNT,
  `Projected multi-route occurrence count is not ${EXPECTED_MULTI_ROUTE_COUNT}`,
);

const matchingRows = rows.filter((row) => row.occurrence_id === EXPECTED_OCCURRENCE_ID);
assert(matchingRows.length === 1, `${DECISION_ID} projected ${matchingRows.length} times`);
const row = matchingRows[0];
assert(row?.study_projection_eligible, `${DECISION_ID} is not study projection eligible`);
assert(row.resolved_status === "realized", `${DECISION_ID} is not realized`);
assert(row.resolved_onset.date === ONSET && row.resolved_onset.precision === "day", `${DECISION_ID} onset changed`);
assert(
  stableJson(row.routes.map((route) => route.gtfs_route_id).sort() as unknown as JsonValue) ===
    stableJson(routes.map((route) => route.gtfsRouteId).sort() as unknown as JsonValue),
  `${DECISION_ID} route scope changed`,
);
assert(
  row.treatment.kind === "atomic" &&
    row.treatment.member.treatment_record_id === TREATMENT_ID &&
    row.treatment.member.treatment_family === "automated_bus_lane_enforcement",
  `${DECISION_ID} treatment scope changed`,
);
assert(
  stableJson(row.provenance.event_record_ids as unknown as JsonValue) === stableJson([EVENT_ID] as unknown as JsonValue),
  `${DECISION_ID} contains unrelated event provenance`,
);
const expectedRelationIds = [
  TIMELINE_RELATION_ID,
  TREATMENT_RELATION_ID,
  ...routes.map((route) => route.relationId),
].sort();
assert(
  stableJson(row.provenance.relation_record_ids.slice().sort() as unknown as JsonValue) ===
    stableJson(expectedRelationIds as unknown as JsonValue),
  `${DECISION_ID} contains unrelated relation provenance`,
);
assert(
  !row.provenance.relation_record_ids.includes(PROGRAM_RELATION_ID) &&
    retiredUmbrellaRouteRelationIds.every((relationId) => !row.provenance.relation_record_ids.includes(relationId)),
  `${DECISION_ID} inherited umbrella-program scope`,
);

const apply = process.argv.includes("--apply");
if (apply) writeArtifacts(decision, identities);
process.stdout.write(
  `${JSON.stringify(
    {
      mode: apply ? "applied" : "dry-run",
      decision_id: decision.decision_id,
      founding_key: decision.founding_key,
      occurrence_id: decision.occurrence_id,
      resolved_onset: decision.resolved_onset,
      routes: decision.routes.map((route) => ({
        gtfs_route_id: route.gtfs_route_id,
        route_record_id: route.route_record_id,
      })),
      treatment: decision.treatment,
      projected_occurrences: rows.length,
      projected_eligible_occurrences: rows.filter((candidate) => candidate.study_projection_eligible).length,
      projected_eligible_route_pairs: rows
        .filter((candidate) => candidate.study_projection_eligible)
        .reduce((sum, candidate) => sum + candidate.routes.length, 0),
      projected_atomic_occurrences: rows.filter((candidate) => candidate.treatment.kind === "atomic").length,
      projected_bundle_occurrences: rows.filter((candidate) => candidate.treatment.kind === "bundle").length,
      projected_multi_route_occurrences: rows.filter((candidate) => candidate.routes.length > 1).length,
      identity_registry_rows: identities.length,
      rc18_route_anchor_sha256: ROUTE_ANCHOR_SHA256,
      acquisition_receipt_sha256: ACQUISITION_RECEIPT_SHA256,
      excluded_relation_record_ids: [PROGRAM_RELATION_ID, ...retiredUmbrellaRouteRelationIds],
      explicit_non_claim: "No fine-bearing enforcement onset is inferred from December 8 or the 60-day period.",
    },
    null,
    2,
  )}\n`,
);
