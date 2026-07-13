import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import {
  assertOperationalAnchorReviewDecisions,
  loadOperationalAnchorReviewDecisions,
  type OperationalAnchorReviewDecision,
  type OperationalAnchorReviewEvidenceBinding,
} from "../packages/pipeline/src/materialize/operational-anchor-review";
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
  type OperationalCoverageDecisionEvidenceRef,
  type OperationalCoverageDimension,
} from "../packages/pipeline/src/quality/operational-coverage";

const ANCHOR_DECISION_ID = "ace-2024-06-20-bx36";
const OCCURRENCE_DECISION_ID = "ace-bx36-activation-2024-06-20";
const PROJECT_ID = "project_ace-automated-camera-enforcement";
const EVENT_ID = "event_tremont-ace-cameras-operative";
const ROUTE_ID = "route_bx36";
const GTFS_ROUTE_ID = "BX36";
const TREATMENT_ID = "treatment_bx36-ace-activation-tremont-avenue";
const TIMELINE_RELATION_ID = "relation_ace-bx36-has-june-20-2024-activation";
const ROUTE_RELATION_ID = "relation_ace-bx36-activation-affects-bx36";
const TREATMENT_RELATION_ID = "relation_ace-bx36-activation-has-camera-enforcement";
const SOURCE_ID = "tremont_ave_bus_priority_cb6_nov2024";
const EVIDENCE_ID = `${SOURCE_ID}#p026_c0002`;
const EVIDENCE_SHA256 = "sha256:628378b1a7db2a7e622d1f0e79ca61e6f1593f096a1e9732e5adaff5c05adfc2";
const ROUTE_ANCHOR_PATH = "data/exports/releases/v1-rc12/route_anchors.jsonl";
const ROUTE_ANCHOR_SHA256 = "517b8f74a89e70ec4791d0bf327da6224bb9a6b2ea44eaf8162d704721659239";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const ANCHOR_ACCEPTED_AT = "2026-07-13T13:20:00.000Z";
const OCCURRENCE_ACCEPTED_AT = "2026-07-13T13:25:00.000Z";
const DECIDED_AT = "2026-07-13T13:30:00.000Z";

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
  assert(record, `Missing canonical record ${recordId}`);
  if (kind) assert(record.record_kind === kind, `${recordId} is ${record.record_kind}, expected ${kind}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
  return record;
}

function binding(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  role: OperationalOccurrenceEvidenceBinding["role"],
  recordId: string,
): OperationalOccurrenceEvidenceBinding {
  const record = requiredRecord(recordsById, recordId);
  const ref = record.evidence_refs.find(
    (candidate) => candidate.source_id === SOURCE_ID && candidate.evidence_id === EVIDENCE_ID,
  );
  assert(ref, `${recordId} lacks exact evidence ${EVIDENCE_ID}`);
  assert(ref.text_sha256 === EVIDENCE_SHA256, `${recordId} exact evidence hash changed`);
  return { role, record_id: recordId, source_id: SOURCE_ID, evidence_id: EVIDENCE_ID };
}

function anchorBinding(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  role: OperationalAnchorReviewEvidenceBinding["role"],
  recordId: string,
): OperationalAnchorReviewEvidenceBinding {
  return binding(recordsById, role, recordId) as OperationalAnchorReviewEvidenceBinding;
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

function anchorDecision(
  records: readonly MtaCanonicalRecord[],
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): OperationalAnchorReviewDecision {
  const event = requiredRecord(recordsById, EVENT_ID, "event");
  assert(event.payload.event_family === "implementation", `${EVENT_ID} family changed`);
  assert(event.payload.lifecycle_phase === "launched", `${EVENT_ID} lifecycle changed`);
  assert(event.payload.date_normalized === "2024-06-20", `${EVENT_ID} date changed`);
  assert(event.payload.date_precision === "day", `${EVENT_ID} precision changed`);
  requiredRecord(recordsById, PROJECT_ID, "project");
  requiredRecord(recordsById, ROUTE_ID, "route");
  const treatment = requiredRecord(recordsById, TREATMENT_ID, "treatment_component");
  assert(treatment.payload.treatment_family === "automated_bus_lane_enforcement", `${TREATMENT_ID} family changed`);
  assertRelation(recordsById, TIMELINE_RELATION_ID, "has_timeline_event", EVENT_ID);
  assertRelation(recordsById, ROUTE_RELATION_ID, "affects_route", ROUTE_ID);
  assertRelation(recordsById, TREATMENT_RELATION_ID, "has_treatment", TREATMENT_ID);

  const decision: OperationalAnchorReviewDecision = {
    schema_version: 1,
    decision_id: ANCHOR_DECISION_ID,
    review_state: "accepted",
    accepted_at: ANCHOR_ACCEPTED_AT,
    reviewer: REVIEWER,
    rationale: "The official November 2024 NYC DOT presentation states in one block that ACE on-bus and fixed-location cameras were in effect on Tremont Avenue for the Bx36 route since June 20, 2024. The same block defines the camera-enforcement treatment and explains that the first 60 days after activation are warnings. This review selects only Bx36 and the source-scoped automated_bus_lane_enforcement component; it does not inherit the ACE project's other routes or treatments.",
    source_id: SOURCE_ID,
    event_record_id: EVENT_ID,
    timeline_relation_record_id: TIMELINE_RELATION_ID,
    route_record_id: ROUTE_ID,
    route_scope_relation_record_id: ROUTE_RELATION_ID,
    treatment_record_id: TREATMENT_ID,
    treatment_scope_relation_record_id: TREATMENT_RELATION_ID,
    treatment_family: "automated_bus_lane_enforcement",
    expected_operational_date: "2024-06-20",
    expected_date_precision: "day",
    evidence_bindings: [
      anchorBinding(recordsById, "event_date", EVENT_ID),
      anchorBinding(recordsById, "timeline_relation", TIMELINE_RELATION_ID),
      anchorBinding(recordsById, "route_identity", ROUTE_ID),
      anchorBinding(recordsById, "route_scope", ROUTE_RELATION_ID),
      anchorBinding(recordsById, "treatment_definition", TREATMENT_ID),
      anchorBinding(recordsById, "treatment_scope", TREATMENT_RELATION_ID),
      anchorBinding(recordsById, "route_treatment_event_bridge", EVENT_ID),
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
    rationale: "The official November 2024 presentation retrospectively binds one exact Bx36 ACE activation to June 20, 2024 and to one source-scoped automated_bus_lane_enforcement treatment. June 20 is the realized camera activation and warning-period onset: the source says cameras issue warnings for the first 60 days after activation, so this occurrence does not mislabel the date as the later start of violation issuance. Project-wide route and treatment candidates are intentionally excluded.",
    occurrence_id: identity.occurrence_id,
    founding_key: identity.founding_key,
    observation_event_record_ids: [EVENT_ID],
    observation_relation_record_ids: [TIMELINE_RELATION_ID, ROUTE_RELATION_ID, TREATMENT_RELATION_ID].sort(),
    resolved_status: "realized",
    resolved_onset: {
      date: "2024-06-20",
      precision: "day",
      evidence_bindings: [
        binding(recordsById, "event_date", EVENT_ID),
        binding(recordsById, "timeline_relation", TIMELINE_RELATION_ID),
      ],
    },
    routes: [
      {
        route_record_id: ROUTE_ID,
        gtfs_route_id: GTFS_ROUTE_ID,
        evidence_bindings: [
          binding(recordsById, "route_identity", ROUTE_ID),
          binding(recordsById, "route_scope", ROUTE_RELATION_ID),
        ],
      },
    ],
    treatment_scope_kind: "atomic",
    treatment: {
      kind: "atomic",
      member: {
        treatment_record_id: TREATMENT_ID,
        treatment_family: "automated_bus_lane_enforcement",
        evidence_bindings: [
          binding(recordsById, "treatment_definition", TREATMENT_ID),
          binding(recordsById, "treatment_scope", TREATMENT_RELATION_ID),
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
      "Existing Bx36 occurrence identity differs",
    );
    return assertOperationalOccurrenceIdentityRegistry(existing);
  }
  return assertOperationalOccurrenceIdentityRegistry([...existing, expected]);
}

const exactEvidenceRef: OperationalCoverageDecisionEvidenceRef = {
  record_id: EVENT_ID,
  source_id: SOURCE_ID,
  evidence_id: EVIDENCE_ID,
  block_id: "p026_c0002",
};
const mayEvidenceRef: OperationalCoverageDecisionEvidenceRef = {
  record_id: "event_ace-implementation-may-2024",
  source_id: "meeting_doc_128931",
  evidence_id: "meeting_doc_128931#p004_c0011",
  block_id: "p004_c0011",
};

const ledgerSpecs: LedgerSpec[] = [
  {
    decisionId: "ace-may-2024-plan-delivered-status-not-applicable",
    gapId: "operational-coverage:1db065afb47b01f0b0a49326",
    eventId: "event_ace-implementation-may-2024",
    dimension: "delivered_status",
    rationale: (occurrenceId) => `The November 2023 minutes describe a future fourteen-route May 2024 ACE plan, not delivery. Approved occurrence ${occurrenceId} separately establishes only the exact Bx36 June 20 activation. The umbrella plan's delivered-status gap is therefore terminal and must not be filled by generalizing one route's retrospective evidence to thirteen unnamed routes.`,
    evidenceRefs: [mayEvidenceRef],
  },
  {
    decisionId: "ace-may-2024-plan-route-scope-not-applicable",
    gapId: "operational-coverage:440b7cf7f31e0f8fe9e327ac",
    eventId: "event_ace-implementation-may-2024",
    dimension: "route",
    rationale: (occurrenceId) => `The coarse May plan says fourteen routes but does not name them. Approved occurrence ${occurrenceId} resolves Bx36 from a distinct exact retrospective event; attaching the ACE project's full route inventory to the May plan would invent event scope.`,
    evidenceRefs: [mayEvidenceRef],
  },
  {
    decisionId: "ace-may-2024-plan-treatment-scope-not-applicable",
    gapId: "operational-coverage:55e22e05e9994a18d9ef8bc4",
    eventId: "event_ace-implementation-may-2024",
    dimension: "treatment",
    rationale: (occurrenceId) => `The May planning record does not bind its unnamed fourteen routes to one canonical treatment component. Approved occurrence ${occurrenceId} uses a distinct source-scoped automated_bus_lane_enforcement component for Bx36; projecting that component or unrelated project treatments onto the umbrella plan would create false scope.`,
    evidenceRefs: [mayEvidenceRef],
  },
  {
    decisionId: "ace-bx36-raw-project-route-diagnostic-superseded",
    gapId: "operational-coverage:94e0a8841a4f2040b93043e0",
    eventId: EVENT_ID,
    dimension: "route",
    rationale: (occurrenceId) => `The raw broad projection inherits the ACE project's citywide route inventory and is intentionally ambiguous. Accepted anchor review ${ANCHOR_DECISION_ID} and approved occurrence ${occurrenceId} bind this exact event only to Bx36, so mutating the project-wide graph to make the raw diagnostic singular is not applicable.`,
    evidenceRefs: [exactEvidenceRef],
  },
  {
    decisionId: "ace-bx36-raw-project-treatment-diagnostic-superseded",
    gapId: "operational-coverage:eeeb82fb604526ec426037c5",
    eventId: EVENT_ID,
    dimension: "treatment",
    rationale: (occurrenceId) => `The raw broad projection inherits multiple historical ACE and Tremont treatment candidates from the program project. Accepted anchor review ${ANCHOR_DECISION_ID} and approved occurrence ${occurrenceId} select only the source-scoped automated_bus_lane_enforcement component; rewriting the project graph merely to silence the raw diagnostic is not applicable.`,
    evidenceRefs: [exactEvidenceRef],
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
assert(row?.study_projection_eligible, "Bx36 ACE occurrence is not study projection eligible");
assert(rows.filter((candidate) => candidate.occurrence_id === occurrence.occurrence_id).length === 1, "Bx36 ACE occurrence projected more than once");
assert(row.routes.length === 1 && row.routes[0]?.gtfs_route_id === GTFS_ROUTE_ID, "Bx36 route scope changed");
assert(
  row.treatment.kind === "atomic" &&
    row.treatment.member.treatment_record_id === TREATMENT_ID &&
    row.treatment.member.treatment_family === "automated_bus_lane_enforcement",
  "Bx36 ACE treatment scope changed",
);

const apply = process.argv.includes("--apply");
if (apply) writeArtifacts(anchor, occurrence, identities, ledger);
console.log(JSON.stringify({
  mode: apply ? "applied" : "dry-run",
  anchor_decision_id: anchor.decision_id,
  occurrence_decision_id: occurrence.decision_id,
  occurrence_id: occurrence.occurrence_id,
  route_count: row.routes.length,
  projected_occurrences: rows.length,
  projected_eligible_occurrences: rows.filter((candidate) => candidate.study_projection_eligible).length,
  projected_eligible_route_pairs: rows
    .filter((candidate) => candidate.study_projection_eligible)
    .reduce((sum, candidate) => sum + candidate.routes.length, 0),
  terminal_decision_ids: ledger.map((decision) => decision.decision_id),
  route_anchor_sha256: ROUTE_ANCHOR_SHA256,
}, null, 2));
