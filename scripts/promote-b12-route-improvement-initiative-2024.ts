import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types.js";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read.js";
import {
  assertOperationalAnchorReviewDecisions,
  loadOperationalAnchorReviewDecisions,
  type OperationalAnchorReviewDecision,
  type OperationalAnchorReviewEvidenceBinding,
} from "../packages/pipeline/src/materialize/operational-anchor-review.js";
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
  type OperationalCoverageDecisionEvidenceRef,
  type OperationalCoverageDimension,
} from "../packages/pipeline/src/quality/operational-coverage.js";

const ANCHOR_DECISION_ID = "b12-route-improvement-initiative-2024-01";
const OCCURRENCE_DECISION_ID = "b12-route-improvement-initiative-start-2024-01";
const PROJECT_ID = "project_dob-route-improvement-initiative";
const EVENT_ID = "event_route-improvement-initiative-start";
const ROUTE_ID = "route_b12-ace";
const GTFS_ROUTE_ID = "B12";
const TREATMENT_ID = "treatment_b12-deliberate-proactive-service-management";
const TIMELINE_RELATION_ID = "relation_rii-has-timeline-event-launch";
const ROUTE_RELATION_ID = "relation_rii-serves-b12";
const TREATMENT_RELATION_ID = "relation_rii-b12-has-deliberate-proactive-service-management";
const SOURCE_ID = "meeting_doc_143341";
const ROUTE_GAP_ID = "operational-coverage:260343c95fe8f8701ac4659f";
const TREATMENT_GAP_ID = "operational-coverage:96d717ecb3ff4b31a32730d2";
const ROUTE_ANCHOR_PATH = "data/exports/releases/v1-rc13/route_anchors.jsonl";
const ROUTE_ANCHOR_SHA256 = "517b8f74a89e70ec4791d0bf327da6224bb9a6b2ea44eaf8162d704721659239";
const ACQUISITION_RECEIPT_PATH = "data/quality/acquisition/receipts/b12-route-improvement-initiative-january-2024.json";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const ANCHOR_ACCEPTED_AT = "2026-07-13T14:20:00.000Z";
const OCCURRENCE_ACCEPTED_AT = "2026-07-13T14:25:00.000Z";
const DECIDED_AT = "2026-07-13T14:30:00.000Z";

const evidencePins = {
  routeProgram: {
    blockId: "p003_c0005",
    sha256: "sha256:d4f212c84e28586aaa5c1efdf39ad1bd2e9bceefe59f3c41a65a8eb24a5ef308",
  },
  onsetAndRoute: {
    blockId: "p003_c0006",
    sha256: "sha256:e87e796834a61be41b21c38fbf6927232956bc72fc86b3270db2fe4fbb99a8da",
  },
  treatmentDefinition: {
    blockId: "p003_c0007",
    sha256: "sha256:d0b1bda9e8de2057087c8ee8d95f01c7b7088e4c55757309ee79dbbead030441",
  },
} as const;

type EvidencePin = (typeof evidencePins)[keyof typeof evidencePins];

type QueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: OperationalCoverageDimension;
  status: "open" | "ready_for_review" | "terminal";
  verdict: string;
  decision_ids: string[];
};

type LedgerSpec = {
  decisionId: string;
  gapId: string;
  eventId: string;
  dimension: OperationalCoverageDimension;
  rationale: (occurrenceId: string) => string;
  evidenceRefs: OperationalCoverageDecisionEvidenceRef[];
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
  assert(
    record,
    `Missing canonical record ${recordId}. Apply scripts/curate-b12-route-improvement-initiative-january-2024.ts and materialize before promotion.`,
  );
  if (kind) assert(record.record_kind === kind, `${recordId} is ${record.record_kind}, expected ${kind}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
  return record;
}

function evidenceId(pin: EvidencePin): string {
  return `${SOURCE_ID}#${pin.blockId}`;
}

function binding(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  role: OperationalOccurrenceEvidenceBinding["role"],
  recordId: string,
  pin: EvidencePin,
): OperationalOccurrenceEvidenceBinding {
  const record = requiredRecord(recordsById, recordId);
  const expectedEvidenceId = evidenceId(pin);
  const ref = record.evidence_refs.find(
    (candidate) => candidate.source_id === SOURCE_ID && candidate.evidence_id === expectedEvidenceId,
  );
  assert(ref, `${recordId} lacks exact evidence ${expectedEvidenceId}`);
  assert(ref.text_sha256 === pin.sha256, `${recordId} evidence ${expectedEvidenceId} hash changed`);
  return { role, record_id: recordId, source_id: SOURCE_ID, evidence_id: expectedEvidenceId };
}

function anchorBinding(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  role: OperationalAnchorReviewEvidenceBinding["role"],
  recordId: string,
  pin: EvidencePin,
): OperationalAnchorReviewEvidenceBinding {
  return binding(recordsById, role, recordId, pin) as OperationalAnchorReviewEvidenceBinding;
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
  assert(relation.payload.as_of_date === "2024-06", `${recordId} as_of_date changed`);
}

function assertNoPlatformBarrierContamination(record: MtaCanonicalRecord): void {
  assert(record.record_id !== "treatment_platform-safety-barriers", `${record.record_id} is the unrelated subway treatment`);
  assert(
    record.evidence_refs.every(
      (ref) => ref.source_id === SOURCE_ID && ref.block_id !== "p005_c0011" && ref.block_id !== "p005_c0012" && ref.block_id !== "p005_c0013",
    ),
    `${record.record_id} contains platform-barrier evidence contamination`,
  );
}

function assertProgramOnsetQualification(
  treatment: MtaCanonicalRecord,
  treatmentRelation: MtaCanonicalRecord,
): void {
  const treatmentDescription = treatment.payload.description;
  assert(typeof treatmentDescription === "string", `${TREATMENT_ID} description is missing`);
  assert(
    treatmentDescription.includes("does not state that every enumerated tactic began at the program's January 2024 inception"),
    `${TREATMENT_ID} lost its program-versus-tactic onset qualification`,
  );

  const relationDescription = treatmentRelation.payload.description;
  assert(typeof relationDescription === "string", `${TREATMENT_RELATION_ID} description is missing`);
  assert(
    relationDescription.includes("does not assign each tactic the program's January 2024 onset"),
    `${TREATMENT_RELATION_ID} lost its program-versus-tactic onset qualification`,
  );

  const receipt = JSON.parse(readFileSync(join(repoRoot, ACQUISITION_RECEIPT_PATH), "utf8")) as {
    status?: unknown;
    scope?: { treatment_record_id?: unknown };
    temporal_adjudication?: {
      occurrence_onset?: unknown;
      onset_applies_to?: unknown;
      component_onset_disposition?: unknown;
      prohibited_inference?: unknown;
    };
  };
  assert(
    receipt.status === "staged_official_program_onset_and_management_scope_reconciled",
    `${ACQUISITION_RECEIPT_PATH} status changed`,
  );
  assert(receipt.scope?.treatment_record_id === TREATMENT_ID, `${ACQUISITION_RECEIPT_PATH} treatment scope changed`);
  assert(receipt.temporal_adjudication?.occurrence_onset === "2024-01", `${ACQUISITION_RECEIPT_PATH} onset changed`);
  assert(
    receipt.temporal_adjudication?.onset_applies_to === "The program-level B12 Route Improvement Initiative service-management package.",
    `${ACQUISITION_RECEIPT_PATH} program-level onset scope changed`,
  );
  assert(
    receipt.temporal_adjudication?.component_onset_disposition ===
      "Unknown. The June retrospective documents individual management tactics but does not state that every tactic began in January 2024.",
    `${ACQUISITION_RECEIPT_PATH} component-onset disposition changed`,
  );
  assert(
    receipt.temporal_adjudication?.prohibited_inference ===
      "Do not project the January program onset onto each enumerated terminal or route-management tactic.",
    `${ACQUISITION_RECEIPT_PATH} prohibited-inference guard changed`,
  );
}

function anchorDecision(
  records: readonly MtaCanonicalRecord[],
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): OperationalAnchorReviewDecision {
  const event = requiredRecord(recordsById, EVENT_ID, "event");
  assert(event.payload.event_family === "launch", `${EVENT_ID} family changed`);
  assert(event.payload.lifecycle_phase === "launched", `${EVENT_ID} lifecycle changed`);
  assert(event.payload.date_normalized === "2024-01", `${EVENT_ID} date changed`);
  assert(event.payload.date_precision === "month", `${EVENT_ID} precision changed`);
  requiredRecord(recordsById, PROJECT_ID, "project");
  requiredRecord(recordsById, ROUTE_ID, "route");
  const treatment = requiredRecord(recordsById, TREATMENT_ID, "treatment_component");
  assert(
    treatment.payload.treatment_kind === "Route Improvement Initiative service-management program",
    `${TREATMENT_ID} exact treatment literal changed`,
  );
  assert(treatment.payload.treatment_family === "service_pattern", `${TREATMENT_ID} family changed`);
  assertNoPlatformBarrierContamination(treatment);
  assertRelation(recordsById, TIMELINE_RELATION_ID, "has_timeline_event", EVENT_ID);
  assertRelation(recordsById, ROUTE_RELATION_ID, "serves_route", ROUTE_ID);
  assertRelation(recordsById, TREATMENT_RELATION_ID, "has_treatment", TREATMENT_ID);
  const treatmentRelation = requiredRecord(recordsById, TREATMENT_RELATION_ID, "relation");
  assertNoPlatformBarrierContamination(treatmentRelation);
  assertProgramOnsetQualification(treatment, treatmentRelation);

  const decision: OperationalAnchorReviewDecision = {
    schema_version: 1,
    decision_id: ANCHOR_DECISION_ID,
    review_state: "accepted",
    accepted_at: ANCHOR_ACCEPTED_AT,
    reviewer: REVIEWER,
    rationale: "The official June 2024 MTA retrospective states that the Route Improvement Initiative began on the B12 in January 2024, identifies B12 directly, and describes deliberate and proactive service management as a key contributor by the June report. This review selects one program-level service_pattern treatment; January dates the initiative package, not every terminal or route-management tactic documented later. It explicitly excludes the unrelated subway platform-safety-barrier story on page 5.",
    source_id: SOURCE_ID,
    event_record_id: EVENT_ID,
    timeline_relation_record_id: TIMELINE_RELATION_ID,
    route_record_id: ROUTE_ID,
    route_scope_relation_record_id: ROUTE_RELATION_ID,
    treatment_record_id: TREATMENT_ID,
    treatment_scope_relation_record_id: TREATMENT_RELATION_ID,
    treatment_family: "service_pattern",
    expected_operational_date: "2024-01",
    expected_date_precision: "month",
    evidence_bindings: [
      anchorBinding(recordsById, "event_date", EVENT_ID, evidencePins.onsetAndRoute),
      anchorBinding(recordsById, "timeline_relation", TIMELINE_RELATION_ID, evidencePins.onsetAndRoute),
      anchorBinding(recordsById, "route_identity", ROUTE_ID, evidencePins.routeProgram),
      anchorBinding(recordsById, "route_scope", ROUTE_RELATION_ID, evidencePins.routeProgram),
      anchorBinding(recordsById, "treatment_definition", TREATMENT_ID, evidencePins.treatmentDefinition),
      anchorBinding(recordsById, "treatment_scope", TREATMENT_RELATION_ID, evidencePins.treatmentDefinition),
      anchorBinding(recordsById, "route_treatment_event_bridge", PROJECT_ID, evidencePins.routeProgram),
      anchorBinding(recordsById, "route_treatment_event_bridge", EVENT_ID, evidencePins.onsetAndRoute),
      anchorBinding(recordsById, "route_treatment_event_bridge", TREATMENT_ID, evidencePins.treatmentDefinition),
    ],
  };
  const existing = loadOperationalAnchorReviewDecisions().filter(
    (candidate) => candidate.decision_id !== ANCHOR_DECISION_ID,
  );
  return assertOperationalAnchorReviewDecisions([...existing, decision], records).find(
    (candidate) => candidate.decision_id === ANCHOR_DECISION_ID,
  )!;
}

function occurrenceDecision(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): OperationalOccurrenceAcceptedDecision {
  const identity = newOperationalOccurrenceIdentityEntry({
    foundingKey: `event:${EVENT_ID}`,
    foundingEventRecordIds: [EVENT_ID],
    decisionId: OCCURRENCE_DECISION_ID,
    issuedAt: OCCURRENCE_ACCEPTED_AT,
  });
  return parseOperationalOccurrenceAcceptedDecision({
    schema_version: 1,
    decision_id: OCCURRENCE_DECISION_ID,
    review_state: "approved",
    accepted_at: OCCURRENCE_ACCEPTED_AT,
    reviewer: REVIEWER,
    rationale: "The June 2024 official retrospective establishes one realized B12 Route Improvement Initiative occurrence with a January 2024 month-level program onset and one atomic service_pattern treatment: the program-level Route Improvement Initiative service-management package. Individual terminal and route-management tactics are documented by June but do not inherit a January onset. The occurrence does not include the platform-safety-barrier treatment from a separate subway story in the same source.",
    occurrence_id: identity.occurrence_id,
    founding_key: identity.founding_key,
    observation_event_record_ids: [EVENT_ID],
    observation_relation_record_ids: [TIMELINE_RELATION_ID, ROUTE_RELATION_ID, TREATMENT_RELATION_ID].sort(),
    resolved_status: "realized",
    resolved_onset: {
      date: "2024-01",
      precision: "month",
      evidence_bindings: [
        binding(recordsById, "event_date", EVENT_ID, evidencePins.onsetAndRoute),
        binding(recordsById, "timeline_relation", TIMELINE_RELATION_ID, evidencePins.onsetAndRoute),
      ],
    },
    routes: [
      {
        route_record_id: ROUTE_ID,
        gtfs_route_id: GTFS_ROUTE_ID,
        evidence_bindings: [
          binding(recordsById, "route_identity", ROUTE_ID, evidencePins.routeProgram),
          binding(recordsById, "route_scope", ROUTE_RELATION_ID, evidencePins.routeProgram),
        ],
      },
    ],
    treatment_scope_kind: "atomic",
    treatment: {
      kind: "atomic",
      member: {
        treatment_record_id: TREATMENT_ID,
        treatment_family: "service_pattern",
        evidence_bindings: [
          binding(recordsById, "treatment_definition", TREATMENT_ID, evidencePins.treatmentDefinition),
          binding(recordsById, "treatment_scope", TREATMENT_RELATION_ID, evidencePins.treatmentDefinition),
        ],
      },
    },
  }, OCCURRENCE_DECISION_ID);
}

function identityRegistry(decision: OperationalOccurrenceAcceptedDecision): OperationalOccurrenceIdentityEntry[] {
  const existing = loadOperationalOccurrenceIdentityRegistry();
  const expected = newOperationalOccurrenceIdentityEntry({
    foundingKey: decision.founding_key,
    foundingEventRecordIds: decision.observation_event_record_ids,
    decisionId: decision.decision_id,
    issuedAt: OCCURRENCE_ACCEPTED_AT,
  });
  const current = existing.find((entry) => entry.founding_key === expected.founding_key);
  if (current) {
    assert(
      stableJson(current as unknown as JsonValue) === stableJson(expected as unknown as JsonValue),
      "Existing B12 Route Improvement Initiative occurrence identity differs",
    );
    return assertOperationalOccurrenceIdentityRegistry(existing);
  }
  return assertOperationalOccurrenceIdentityRegistry([...existing, expected]);
}

const routeEvidenceRef: OperationalCoverageDecisionEvidenceRef = {
  record_id: ROUTE_RELATION_ID,
  source_id: SOURCE_ID,
  evidence_id: evidenceId(evidencePins.routeProgram),
  block_id: evidencePins.routeProgram.blockId,
};
const treatmentEvidenceRef: OperationalCoverageDecisionEvidenceRef = {
  // The coverage ledger requires decision evidence to come from the gap's
  // context graph. The curated project carries this exact treatment block;
  // the new treatment itself is a dimension candidate rather than context.
  record_id: PROJECT_ID,
  source_id: SOURCE_ID,
  evidence_id: evidenceId(evidencePins.treatmentDefinition),
  block_id: evidencePins.treatmentDefinition.blockId,
};

const ledgerSpecs: LedgerSpec[] = [
  {
    decisionId: "b12-rii-raw-route-diagnostic-superseded",
    gapId: ROUTE_GAP_ID,
    eventId: EVENT_ID,
    dimension: "route",
    rationale: (occurrenceId) => `The raw diagnostic did not recognize the already source-backed B12 route relation as a fully reviewed occurrence binding. Accepted anchor review ${ANCHOR_DECISION_ID} and approved occurrence ${occurrenceId} bind this exact January 2024 launch only to canonical route ${ROUTE_ID}/GTFS B12. The raw route gap is therefore superseded and not applicable rather than a reason to mutate the wider project graph.`,
    evidenceRefs: [routeEvidenceRef],
  },
  {
    decisionId: "b12-rii-platform-barrier-contamination-superseded",
    gapId: TREATMENT_GAP_ID,
    eventId: EVENT_ID,
    dimension: "treatment",
    rationale: (occurrenceId) => `The raw diagnostic incorrectly proposed treatment_platform-safety-barriers from a separate subway story on page 5 of the source. Accepted anchor review ${ANCHOR_DECISION_ID} and approved occurrence ${occurrenceId} instead bind the B12 launch to the exact page-3 source-scoped service_pattern treatment ${TREATMENT_ID}. The contaminated raw treatment gap is terminal and not applicable.`,
    evidenceRefs: [treatmentEvidenceRef],
  },
];

function ledgerDecisions(queue: readonly QueueRow[], occurrenceId: string): OperationalCoverageAcceptedDecision[] {
  return ledgerSpecs.map((spec) => {
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
      rationale: spec.rationale(occurrenceId),
      proposal_ids: [],
      evidence_refs: spec.evidenceRefs,
      search_receipt_ids: [],
    }, spec.decisionId);
  });
}

function writeArtifacts(
  anchor: OperationalAnchorReviewDecision,
  occurrence: OperationalOccurrenceAcceptedDecision,
  identities: readonly OperationalOccurrenceIdentityEntry[],
  ledger: readonly OperationalCoverageAcceptedDecision[],
): void {
  const anchorBytes = { ...anchor };
  delete anchorBytes.artifact_path;
  const artifacts = new Map<string, string>([
    [
      join(repoRoot, "data/operational-anchor-review/accepted/decisions", `${anchor.decision_id}.json`),
      `${JSON.stringify(anchorBytes, null, 2)}\n`,
    ],
    [
      join(repoRoot, "data/operational-occurrence-review/accepted/decisions", `${occurrence.decision_id}.json`),
      `${JSON.stringify(occurrence, null, 2)}\n`,
    ],
    ...ledger.map((decision) => [
      join(repoRoot, "data/operational-anchor-review/ledger-decisions/decisions", `${decision.decision_id}.json`),
      `${JSON.stringify(decision, null, 2)}\n`,
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
assert(
  routeAnchors.some(
    (row) => row.canonical_route_record_id === ROUTE_ID && row.gtfs_route_id === GTFS_ROUTE_ID && row.disposition === "true_route",
  ),
  `${ROUTE_ANCHOR_PATH} lost ${ROUTE_ID} -> ${GTFS_ROUTE_ID}`,
);
const records = readCanonicalRecordsFromJsonl();
const recordsById = new Map(records.map((record) => [record.record_id, record]));
const anchor = anchorDecision(records, recordsById);
const occurrence = occurrenceDecision(recordsById);
const identities = identityRegistry(occurrence);
const queue = readJsonl<QueueRow>(join(repoRoot, "data/quality/operational-coverage/priority-queue.jsonl"));
const ledger = ledgerDecisions(queue, occurrence.occurrence_id);
const existingOccurrenceReviews = loadOperationalOccurrenceAcceptedDecisions().filter(
  (candidate) => candidate.decision_id !== OCCURRENCE_DECISION_ID,
);
const existingAnchorReviews = loadOperationalAnchorReviewDecisions().filter(
  (candidate) => candidate.decision_id !== ANCHOR_DECISION_ID,
);
const rows = computeOperationalOccurrences(records, routeAnchors, {
  reviewDecisions: [...existingAnchorReviews, anchor],
  occurrenceReviewDecisions: [...existingOccurrenceReviews, occurrence],
  identityRegistry: identities,
});
const row = rows.find((candidate) => candidate.occurrence_id === occurrence.occurrence_id);
assert(row?.study_projection_eligible, "B12 Route Improvement Initiative occurrence is not study projection eligible");
assert(
  rows.filter((candidate) => candidate.occurrence_id === occurrence.occurrence_id).length === 1,
  "B12 Route Improvement Initiative occurrence projected more than once",
);
assert(row.routes.length === 1 && row.routes[0]?.gtfs_route_id === GTFS_ROUTE_ID, "B12 route scope changed");
assert(
  row.treatment.kind === "atomic" &&
    row.treatment.member.treatment_record_id === TREATMENT_ID &&
    row.treatment.member.treatment_family === "service_pattern",
  "B12 service-management treatment scope changed",
);
assert(
  !row.provenance.treatment_record_ids.includes("treatment_platform-safety-barriers"),
  "B12 occurrence inherited unrelated platform barriers",
);

const apply = process.argv.includes("--apply");
if (apply) writeArtifacts(anchor, occurrence, identities, ledger);
console.log(JSON.stringify({
  mode: apply ? "applied" : "dry-run",
  anchor_decision_id: anchor.decision_id,
  occurrence_decision_id: occurrence.decision_id,
  occurrence_id: occurrence.occurrence_id,
  route_count: row.routes.length,
  treatment_record_id: row.treatment.kind === "atomic" ? row.treatment.member.treatment_record_id : null,
  projected_occurrences: rows.length,
  projected_eligible_occurrences: rows.filter((candidate) => candidate.study_projection_eligible).length,
  projected_eligible_route_pairs: rows
    .filter((candidate) => candidate.study_projection_eligible)
    .reduce((sum, candidate) => sum + candidate.routes.length, 0),
  terminal_decision_ids: ledger.map((decision) => decision.decision_id),
  route_anchor_sha256: ROUTE_ANCHOR_SHA256,
}, null, 2));
