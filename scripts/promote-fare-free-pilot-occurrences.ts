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
  type OperationalCoverageDimension,
} from "../packages/pipeline/src/quality/operational-coverage";

const SOURCE_ID = "fare_free_bus_pilot_evaluation";
const QBNR_SOURCE_ID = "mta_queens_bus_network_redesign_service_changes";
const PROJECT_ID = "project_fare-free-bus-pilot";
const PROPOSAL_ID = "orp_fare_free_pilot_route_scope_and_resumption_2023_2024";
const PROPOSAL_PATH = `data/operational-anchor-review/proposed/applied/observations/${PROPOSAL_ID}.json`;
const PROPOSAL_SHA256 = "f040e411f43d1c81acd3f90efa2ca5f85e3504dc80c8a6c5d80aaa6e148a8c51";
const ROUTE_ANCHOR_PATH = "data/exports/releases/v1-rc10/route_anchors.jsonl";
const ROUTE_ANCHOR_SHA256 = "43805bea087746a3a7c518c72a1e7c6ea161b16d26fc691dca5c3a1f84061d8b";
const COVERAGE_CORPUS_FINGERPRINT = "30c53918e116f03663194056a914ca58354023287267bd3585cc814f1f570bdf";
const POST_PROMOTION_COVERAGE_CORPUS_FINGERPRINT = "bf18a62888a64bf22e2bb4b23ea8c56589b392828ba55440a333cb3256e6a638";
const BASELINE_PRIORITY_QUEUE_SHA256 = "b6cdb9732977116bed95092b2b8b33b84d1b4c13f74ad1a0ceaf86c3590beb41";
const BASELINE_OCCURRENCE_FIXTURE_SHA256 = "41a3431277e3a4994b38115bf26a3365f75907a09f284abd2c99640b7ac21ca8";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const ACCEPTED_AT = "2026-07-13T06:45:08.000Z";
const DECIDED_AT = "2026-07-13T06:45:30.000Z";
const EXPECTED_OCCURRENCE_COUNT = 126;
const EXPECTED_ELIGIBLE_COUNT = 125;
const EXPECTED_ROUTE_PAIR_COUNT = 140;

const routeScopeRelationIds = [
  "relation_fare-free-pilot-2023-affects-b60",
  "relation_fare-free-pilot-2023-affects-bx18a",
  "relation_fare-free-pilot-2023-affects-bx18b",
  "relation_fare-free-pilot-2023-affects-m116",
  "relation_fare-free-pilot-2023-affects-q4",
  "relation_fare-free-pilot-2023-affects-s46",
  "relation_fare-free-pilot-2023-affects-s96",
] as const;

const routeSpecs = [
  {
    routeRecordId: "route_b60",
    gtfsRouteId: "B60",
    identitySourceId: SOURCE_ID,
    identityEvidenceId: `${SOURCE_ID}#p002_c0006`,
    scopeRelationId: "relation_fare-free-pilot-2023-affects-b60",
  },
  {
    routeRecordId: "route_bx18a",
    gtfsRouteId: "BX18A",
    identitySourceId: SOURCE_ID,
    identityEvidenceId: `${SOURCE_ID}#p020_c0003`,
    scopeRelationId: "relation_fare-free-pilot-2023-affects-bx18a",
  },
  {
    routeRecordId: "route_bx18b",
    gtfsRouteId: "BX18B",
    identitySourceId: SOURCE_ID,
    identityEvidenceId: `${SOURCE_ID}#p020_c0003`,
    scopeRelationId: "relation_fare-free-pilot-2023-affects-bx18b",
  },
  {
    routeRecordId: "route_m116",
    gtfsRouteId: "M116",
    identitySourceId: SOURCE_ID,
    identityEvidenceId: `${SOURCE_ID}#p002_c0006`,
    scopeRelationId: "relation_fare-free-pilot-2023-affects-m116",
  },
  {
    routeRecordId: "route_q4-lcl-ltd",
    gtfsRouteId: "Q4",
    identitySourceId: QBNR_SOURCE_ID,
    identityEvidenceId: `${QBNR_SOURCE_ID}#p001_b0006`,
    scopeRelationId: "relation_fare-free-pilot-2023-affects-q4",
  },
  {
    routeRecordId: "route_s46",
    gtfsRouteId: "S46",
    identitySourceId: SOURCE_ID,
    identityEvidenceId: `${SOURCE_ID}#p023_c0003`,
    scopeRelationId: "relation_fare-free-pilot-2023-affects-s46",
  },
  {
    routeRecordId: "route_s96",
    gtfsRouteId: "S96",
    identitySourceId: SOURCE_ID,
    identityEvidenceId: `${SOURCE_ID}#p023_c0003`,
    scopeRelationId: "relation_fare-free-pilot-2023-affects-s96",
  },
] as const;

type QueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: OperationalCoverageDimension;
  status: "open" | "ready_for_review" | "terminal";
  verdict: string;
};

type GapSpec = {
  gapId: string;
  eventId: string;
  dimension: OperationalCoverageDimension;
  decisionId: string;
  rationale: string;
};

const gapSpecs: GapSpec[] = [
  {
    gapId: "operational-coverage:8b33da6e976e949ed5665fa9",
    eventId: "event_pilot-start_2",
    dimension: "route",
    decisionId: "fare-free-pilot-launch-2023-route-superseded-by-approved-occurrence",
    rationale: "The retrospective official evaluation's pilot-start event now founds one approved seven-route occurrence with exact rc10 route identities and delivered route scope. The broad event-level route diagnostic is therefore superseded and not independently applicable.",
  },
  {
    gapId: "operational-coverage:13f7f170e80121ac0a7a09cf",
    eventId: "event_pilot-start_2",
    dimension: "treatment",
    decisionId: "fare-free-pilot-launch-2023-treatment-superseded-by-approved-occurrence",
    rationale: "The retrospective official evaluation's pilot-start event now founds an approved atomic fare_collection occurrence. The broad event-level treatment diagnostic is therefore superseded and not independently applicable.",
  },
  {
    gapId: "operational-coverage:e55b033cee2d4be945e53ad2",
    eventId: "event_fare-collection-resumed",
    dimension: "route",
    decisionId: "fare-collection-resumption-2024-route-superseded-by-approved-occurrence",
    rationale: "The retrospective official evaluation's fare-resumption event now founds one approved seven-route occurrence with exact rc10 route identities and delivered route scope. The broad event-level route diagnostic is therefore superseded and not independently applicable.",
  },
  {
    gapId: "operational-coverage:6ae1f03dd9d673fed4153775",
    eventId: "event_fare-collection-resumed",
    dimension: "treatment",
    decisionId: "fare-collection-resumption-2024-treatment-superseded-by-approved-occurrence",
    rationale: "The retrospective official evaluation's fare-resumption event now founds an approved atomic fare_collection occurrence using the positive fare-collection-resumption treatment. The broad event-level treatment diagnostic is therefore superseded and not independently applicable.",
  },
  {
    gapId: "operational-coverage:404e75508461ded248f06142",
    eventId: "event_fare-free-bus-pilot-launch",
    dimension: "route",
    decisionId: "fare-free-pilot-duplicate-launch-route-superseded-by-approved-occurrence",
    rationale: "This exact-date launch duplicate is not an independent operational occurrence. The later retrospective evaluation event event_pilot-start_2 founds the approved seven-route September 24, 2023 occurrence, so scoping this duplicate would double-count the same launch.",
  },
  {
    gapId: "operational-coverage:6d5e6417a7eb161be18236ef",
    eventId: "event_fare-free-bus-pilot-launch",
    dimension: "treatment",
    decisionId: "fare-free-pilot-duplicate-launch-treatment-superseded-by-approved-occurrence",
    rationale: "This exact-date launch duplicate is not an independent operational occurrence. The later retrospective evaluation event event_pilot-start_2 founds the approved atomic fare_collection occurrence, so treating this duplicate separately would double-count the same launch.",
  },
  {
    gapId: "operational-coverage:227f7083623cfa019b64a7f4",
    eventId: "event_meeting-doc-114166-fare-free-bus-pilot-start",
    dimension: "route",
    decisionId: "fare-free-pilot-prospective-start-route-not-applicable",
    rationale: "This pre-launch record states only an on-or-before September 25, 2023 upper bound and is not a realized onset. The later retrospective evaluation proves the September 24 launch and founds the approved seven-route occurrence, so route scope is not applicable to this prospective duplicate.",
  },
  {
    gapId: "operational-coverage:19a131a7c76f0ce1c37df525",
    eventId: "event_meeting-doc-114166-fare-free-bus-pilot-start",
    dimension: "treatment",
    decisionId: "fare-free-pilot-prospective-start-treatment-not-applicable",
    rationale: "This pre-launch record states only an on-or-before September 25, 2023 upper bound and is not a realized onset. The later retrospective evaluation proves the September 24 launch and founds the approved atomic fare_collection occurrence, so treatment scope is not applicable to this prospective duplicate.",
  },
  {
    gapId: "operational-coverage:2f57247b4be2340eeff23214",
    eventId: "event_pilot-start",
    dimension: "timeline_subject",
    decisionId: "fare-free-pilot-unlinked-start-duplicate-superseded-by-approved-occurrence",
    rationale: "This unlinked September 24 launch record duplicates the retrospective official evaluation start event that founds the approved occurrence. Adding a second timeline link would double-count the same launch, so the diagnostic is not applicable.",
  },
  {
    gapId: "operational-coverage:56f7a91b984b49b88d27d1df",
    eventId: "event_pilot-end",
    dimension: "timeline_subject",
    decisionId: "fare-free-pilot-unlinked-end-duplicate-superseded-by-approved-occurrence",
    rationale: "This unlinked September 1 fare-resumption record duplicates the retrospective official evaluation end event that founds the approved occurrence. Adding a second timeline link would double-count the same resumption, so the diagnostic is not applicable.",
  },
];

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

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
  recordKind?: MtaCanonicalRecord["record_kind"],
): MtaCanonicalRecord {
  const record = recordsById.get(recordId);
  assert(record, `Missing canonical record ${recordId}`);
  if (recordKind) assert(record.record_kind === recordKind, `${recordId} is ${record.record_kind}, expected ${recordKind}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not source-stated and usable`);
  return record;
}

function evidenceBinding(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  role: OperationalOccurrenceEvidenceBinding["role"],
  recordId: string,
  sourceId: string,
  evidenceId: string,
): OperationalOccurrenceEvidenceBinding {
  const record = requiredRecord(recordsById, recordId);
  assert(
    record.evidence_refs.some((ref) => ref.source_id === sourceId && ref.evidence_id === evidenceId),
    `${recordId} lacks ${sourceId}/${evidenceId}`,
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
  assert(relation.payload.subject_id === PROJECT_ID, `${recordId} subject changed`);
  assert(relation.payload.object_id === objectId, `${recordId} object changed`);
  assert(relation.payload.assertion_status === "delivered", `${recordId} is not delivered`);
}

function occurrenceRoutes(recordsById: ReadonlyMap<string, MtaCanonicalRecord>) {
  return routeSpecs.map((spec) => {
    requiredRecord(recordsById, spec.routeRecordId, "route");
    assertRelation(recordsById, spec.scopeRelationId, "affects_route", spec.routeRecordId);
    return {
      route_record_id: spec.routeRecordId,
      gtfs_route_id: spec.gtfsRouteId,
      evidence_bindings: [
        evidenceBinding(recordsById, "route_identity", spec.routeRecordId, spec.identitySourceId, spec.identityEvidenceId),
        evidenceBinding(recordsById, "route_scope", spec.scopeRelationId, SOURCE_ID, `${SOURCE_ID}#p002_c0006`),
      ],
    };
  });
}

function occurrenceDecision(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  input: {
    decisionId: string;
    eventRecordId: string;
    eventDate: string;
    timelineRelationId: string;
    treatmentRecordId: string;
    treatmentRelationId: string;
    rationale: string;
  },
): OperationalOccurrenceAcceptedDecision {
  requiredRecord(recordsById, input.eventRecordId, "event");
  assertRelation(recordsById, input.timelineRelationId, "has_timeline_event", input.eventRecordId);
  assertRelation(recordsById, input.treatmentRelationId, "has_treatment", input.treatmentRecordId);
  const treatment = requiredRecord(recordsById, input.treatmentRecordId, "treatment_component");
  assert(treatment.payload.treatment_family === "fare_collection", `${input.treatmentRecordId} family changed`);
  return parseOperationalOccurrenceAcceptedDecision({
    schema_version: 1,
    decision_id: input.decisionId,
    review_state: "approved",
    accepted_at: ACCEPTED_AT,
    reviewer: REVIEWER,
    rationale: input.rationale,
    occurrence_id: newOperationalOccurrenceIdentityEntry({
      foundingKey: `event:${input.eventRecordId}`,
      foundingEventRecordIds: [input.eventRecordId],
      decisionId: input.decisionId,
      issuedAt: ACCEPTED_AT,
    }).occurrence_id,
    founding_key: `event:${input.eventRecordId}`,
    observation_event_record_ids: [input.eventRecordId],
    observation_relation_record_ids: [...routeScopeRelationIds, input.timelineRelationId, input.treatmentRelationId].sort(),
    resolved_status: "realized",
    resolved_onset: {
      date: input.eventDate,
      precision: "day",
      evidence_bindings: [
        evidenceBinding(recordsById, "event_date", input.eventRecordId, SOURCE_ID, `${SOURCE_ID}#p002_c0005`),
        evidenceBinding(recordsById, "timeline_relation", input.timelineRelationId, SOURCE_ID, `${SOURCE_ID}#p002_c0005`),
      ],
    },
    routes: occurrenceRoutes(recordsById),
    treatment_scope_kind: "atomic",
    treatment: {
      kind: "atomic",
      member: {
        treatment_record_id: input.treatmentRecordId,
        treatment_family: "fare_collection",
        evidence_bindings: [
          evidenceBinding(recordsById, "treatment_definition", input.treatmentRecordId, SOURCE_ID, `${SOURCE_ID}#p002_c0005`),
          evidenceBinding(recordsById, "treatment_scope", input.treatmentRelationId, SOURCE_ID, `${SOURCE_ID}#p002_c0005`),
        ],
      },
    },
  }, input.decisionId);
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
    assert(stableJson(current as unknown as JsonValue) === stableJson(expected as unknown as JsonValue), `${decision.founding_key} identity differs`);
    return [];
  });
  return assertOperationalOccurrenceIdentityRegistry([...existing, ...additions]);
}

function ledgerDecisions(queue: readonly QueueRow[]): OperationalCoverageAcceptedDecision[] {
  const byGap = new Map(queue.map((row) => [row.gap_id, row]));
  return gapSpecs.map((spec) => {
    const row = byGap.get(spec.gapId);
    assert(row, `Missing priority gap ${spec.gapId}`);
    assert(row.event_record_id === spec.eventId, `${spec.gapId} event changed`);
    assert(row.dimension === spec.dimension, `${spec.gapId} dimension changed`);
    if (row.status !== "terminal") {
      assert(row.status === "open" && row.verdict === "unreviewed", `${spec.gapId} is no longer open/unreviewed`);
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
      proposal_ids: [PROPOSAL_ID],
      evidence_refs: [],
      search_receipt_ids: [],
    }, spec.decisionId);
  });
}

function assertAuthority(): void {
  const proposalBytes = readFileSync(join(repoRoot, PROPOSAL_PATH));
  assert(sha256(proposalBytes) === PROPOSAL_SHA256, `${PROPOSAL_PATH} hash changed`);
  const proposal = JSON.parse(proposalBytes.toString("utf8")) as Record<string, unknown>;
  assert(proposal.proposal_id === PROPOSAL_ID && proposal.review_state === "accepted", "Fare-free proposal is not the accepted artifact");
  const anchorBytes = readFileSync(join(repoRoot, ROUTE_ANCHOR_PATH));
  assert(sha256(anchorBytes) === ROUTE_ANCHOR_SHA256, `${ROUTE_ANCHOR_PATH} hash changed`);
  const manifest = JSON.parse(readFileSync(join(repoRoot, "data/quality/operational-coverage/manifest.json"), "utf8")) as Record<string, unknown>;
  assert(
    manifest.corpus_fingerprint === COVERAGE_CORPUS_FINGERPRINT ||
      manifest.corpus_fingerprint === POST_PROMOTION_COVERAGE_CORPUS_FINGERPRINT,
    "Coverage corpus fingerprint is neither the exact pre-promotion nor post-promotion state",
  );
  assert(manifest.route_anchor_path === ROUTE_ANCHOR_PATH, "Coverage route-anchor path changed");
  assert(manifest.route_anchor_release_id === "v1-rc10", "Coverage route-anchor release changed");
  assert(manifest.route_anchor_sha256 === ROUTE_ANCHOR_SHA256, "Coverage route-anchor hash changed");
}

function writeArtifacts(
  decisions: readonly OperationalOccurrenceAcceptedDecision[],
  identities: readonly OperationalOccurrenceIdentityEntry[],
  gapDecisions: readonly OperationalCoverageAcceptedDecision[],
): void {
  const occurrenceDir = join(repoRoot, "data/operational-occurrence-review/accepted/decisions");
  const ledgerDir = join(repoRoot, "data/operational-anchor-review/ledger-decisions/decisions");
  const artifacts = new Map<string, string>();
  for (const decision of decisions) artifacts.set(join(occurrenceDir, `${decision.decision_id}.json`), `${JSON.stringify(decision, null, 2)}\n`);
  for (const decision of gapDecisions) artifacts.set(join(ledgerDir, `${decision.decision_id}.json`), `${JSON.stringify(decision, null, 2)}\n`);
  for (const [path, bytes] of artifacts) {
    if (existsSync(path)) assert(readFileSync(path, "utf8") === bytes, `Refusing to overwrite non-equivalent artifact ${path}`);
  }
  mkdirSync(occurrenceDir, { recursive: true });
  mkdirSync(ledgerDir, { recursive: true });
  for (const [path, bytes] of artifacts) if (!existsSync(path)) writeFileSync(path, bytes, "utf8");
  const registryBytes = `${identities.map((entry) => stableJson(entry as unknown as JsonValue)).join("\n")}\n`;
  writeFileSync(join(repoRoot, "data/operational-occurrence-identities/registry.jsonl"), registryBytes, "utf8");
}

assertAuthority();
const occurrenceDir = join(repoRoot, "data/operational-occurrence-review/accepted/decisions");
const targetArtifactsExist = [
  join(occurrenceDir, "fare-free-bus-pilot-launch-2023-09-24.json"),
  join(occurrenceDir, "fare-collection-resumption-2024-09-01.json"),
].every(existsSync);
if (!targetArtifactsExist) {
  assert(sha256(readFileSync(join(repoRoot, "data/quality/operational-coverage/priority-queue.jsonl"))) === BASELINE_PRIORITY_QUEUE_SHA256, "Priority queue changed before promotion");
  assert(sha256(readFileSync(join(repoRoot, "data/contract-fixtures/operational-occurrences-v1/operational_occurrences.jsonl"))) === BASELINE_OCCURRENCE_FIXTURE_SHA256, "Occurrence fixture changed before promotion");
}
const records = readCanonicalRecordsFromJsonl();
const recordsById = new Map(records.map((record) => [record.record_id, record]));
const decisions = [
  occurrenceDecision(recordsById, {
    decisionId: "fare-free-bus-pilot-launch-2023-09-24",
    eventRecordId: "event_pilot-start_2",
    eventDate: "2023-09-24",
    timelineRelationId: "relation_rel-project-to-event-start",
    treatmentRecordId: "treatment_fare-free-fare-collection",
    treatmentRelationId: "relation_rel-project-to-treatment",
    rationale: "The retrospective June 2025 official MTA evaluation establishes that the Fare-Free Bus Pilot began September 24, 2023 on seven GTFS-addressable route ids. BX18A/B and S46/S96 are addressability splits of five borough-level report surfaces; their aggregate metrics remain on aggregate records. Exact route identities, delivered route scope, timeline, and the atomic fare_collection treatment are all evidence-bound without route-treatment cross-products.",
  }),
  occurrenceDecision(recordsById, {
    decisionId: "fare-collection-resumption-2024-09-01",
    eventRecordId: "event_fare-collection-resumed",
    eventDate: "2024-09-01",
    timelineRelationId: "relation_rel-project-to-event-end",
    treatmentRecordId: "treatment_fare-collection-resumption-2024",
    treatmentRelationId: "relation_fare-free-pilot-has-fare-collection-resumption-2024",
    rationale: "The retrospective June 2025 official MTA evaluation establishes that fare collection resumed September 1, 2024 on the seven GTFS-addressable pilot route ids. This occurrence uses the positive fare-collection-resumption treatment rather than misrepresenting the zero-fare treatment as beginning on its end date. Aggregate Bx18A/B and S46/S96 metrics remain unsplit.",
  }),
];
const identities = identityRegistry(decisions);
const queue = readJsonl<QueueRow>(join(repoRoot, "data/quality/operational-coverage/priority-queue.jsonl"));
const gapDecisions = ledgerDecisions(queue);
const anchors = readJsonl<RouteAnchorRow>(join(repoRoot, ROUTE_ANCHOR_PATH));
const existingReviews = loadOperationalOccurrenceAcceptedDecisions().filter(
  (review) => !decisions.some((decision) => decision.decision_id === review.decision_id),
);
const rows = computeOperationalOccurrences(records, anchors, {
  reviewDecisions: loadOperationalAnchorReviewDecisions(),
  occurrenceReviewDecisions: [...existingReviews, ...decisions],
  identityRegistry: identities,
});
assert(rows.length === EXPECTED_OCCURRENCE_COUNT, `Projected ${rows.length} occurrences, expected ${EXPECTED_OCCURRENCE_COUNT}`);
assert(rows.filter((row) => row.study_projection_eligible).length === EXPECTED_ELIGIBLE_COUNT, "Eligible occurrence count changed");
assert(rows.filter((row) => row.study_projection_eligible).reduce((sum, row) => sum + row.routes.length, 0) === EXPECTED_ROUTE_PAIR_COUNT, "Eligible route-pair count changed");
for (const decision of decisions) {
  const row = rows.find((candidate) => candidate.occurrence_id === decision.occurrence_id);
  assert(row?.study_projection_eligible, `${decision.decision_id} did not produce an eligible occurrence`);
  assert(row.routes.length === 7, `${decision.decision_id} did not produce seven routes`);
  assert(row.treatment.kind === "atomic" && row.treatment.member.treatment_family === "fare_collection", `${decision.decision_id} treatment changed`);
}

const apply = process.argv.includes("--apply");
if (apply) writeArtifacts(decisions, identities, gapDecisions);
console.log(JSON.stringify({
  mode: apply ? "applied" : "dry-run",
  proposal_id: PROPOSAL_ID,
  occurrence_decisions: decisions.map((decision) => ({ decision_id: decision.decision_id, occurrence_id: decision.occurrence_id })),
  identity_registry_rows: identities.length,
  ledger_decisions: gapDecisions.length,
  projected_occurrences: rows.length,
  projected_eligible_occurrences: rows.filter((row) => row.study_projection_eligible).length,
  projected_eligible_route_pairs: rows.filter((row) => row.study_projection_eligible).reduce((sum, row) => sum + row.routes.length, 0),
  rc10_route_anchor_sha256: ROUTE_ANCHOR_SHA256,
}, null, 2));
