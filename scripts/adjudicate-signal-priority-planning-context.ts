import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import {
  parseOperationalCoverageAcceptedDecision,
  type OperationalCoverageAcceptedDecision,
  type OperationalCoverageDecisionEvidenceRef,
  type OperationalCoverageDimension,
} from "../packages/pipeline/src/quality/operational-coverage";

const EVENT_ID = "event_project-implementation-late-2025-2026";
const PROJECT_ID = "project_grand-st-grand-av-safety-bus-priority";
const TIMELINE_RELATION_ID = "relation_project-timeline-implementation_2";
const TSP_TREATMENT_ID = "treatment_tsp-transit-signal-priority";
const SOURCE_ID = "grand_ave_metropolitan_ave_queens_blvd_nov2024";
const EVENT_EVIDENCE_ID = `${SOURCE_ID}#p022_c0002`;
const TSP_EVIDENCE_ID = `${SOURCE_ID}#p020_c0002`;
const BASELINE_PRIORITY_QUEUE_SHA256 = "67a6736b8142cc56127797e7a3c60eccf01f3893c631b8e59fff1a14a3a81cd0";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const DECIDED_AT = "2026-07-13T07:25:00.000Z";

const queuePath = join(repoRoot, "data/quality/operational-coverage/priority-queue.jsonl");
const decisionDir = join(repoRoot, "data/operational-anchor-review/ledger-decisions/decisions");

type QueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: OperationalCoverageDimension;
  priority: boolean;
  priority_families: string[];
  status: "open" | "ready_for_review" | "terminal";
  verdict: string;
  candidate_record_ids: string[];
};

type GapSpec = {
  dimension: OperationalCoverageDimension;
  gapId: string;
  decisionId: string;
  rationale: string;
};

const gapSpecs: GapSpec[] = [
  {
    dimension: "date_precision",
    gapId: "operational-coverage:28e64ed9e96647fd9769773f",
    decisionId: "grand-ave-planning-context-date-not-applicable",
    rationale: "The source states only a prospective implementation target of late 2025 or 2026. It does not report a realized operational onset, and the exact project timeline relation is explicitly planned as of November 12, 2024. This planning milestone cannot found a study occurrence, so day/month onset refinement is not applicable to this record.",
  },
  {
    dimension: "delivered_status",
    gapId: "operational-coverage:d2ef6677e3c236f55705e11d",
    decisionId: "grand-ave-planning-context-delivered-status-not-applicable",
    rationale: "The exact project timeline relation is explicitly planned as of November 12, 2024, and the event text is an implementation target rather than a delivery statement. Candidate project treatments are design options, not evidence that any treatment was delivered. This planning milestone is not a realized operational occurrence, so delivered-status recovery is not applicable.",
  },
  {
    dimension: "route",
    gapId: "operational-coverage:91332156f9623b4e8ffdbf8c",
    decisionId: "grand-ave-planning-context-route-not-applicable",
    rationale: "This is a prospective project-level implementation target, not a realized route-level occurrence. The same presentation mentions several routes across project and network context, but supplies no delivered event-to-route scope. Assigning those candidates to the planning milestone would create an unsupported route-treatment cross-product, so route recovery is not applicable.",
  },
  {
    dimension: "treatment",
    gapId: "operational-coverage:3b966f10af76524407fe2165",
    decisionId: "grand-ave-planning-context-treatment-not-applicable",
    rationale: "The presentation documents Transit Signal Priority and several bus-lane configurations as candidate tools and design alternatives. It does not select, scope, or report delivery of TSP—or any other candidate treatment—for this prospective implementation target. The candidate is useful for coverage review but must not be promoted into treatment scope, so recovery is not applicable.",
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

function evidenceRef(recordId: string, evidenceId: string): OperationalCoverageDecisionEvidenceRef {
  return {
    record_id: recordId,
    source_id: SOURCE_ID,
    evidence_id: evidenceId,
    block_id: evidenceId.split("#")[1] ?? null,
  };
}

function expectedDecision(spec: GapSpec): OperationalCoverageAcceptedDecision {
  const evidenceRefs = [
    evidenceRef(EVENT_ID, EVENT_EVIDENCE_ID),
    evidenceRef(TIMELINE_RELATION_ID, EVENT_EVIDENCE_ID),
  ];
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
    evidence_refs: evidenceRefs,
    search_receipt_ids: [],
  }, spec.decisionId);
}

function requiredRecord(recordsById: ReadonlyMap<string, MtaCanonicalRecord>, recordId: string): MtaCanonicalRecord {
  const record = recordsById.get(recordId);
  assert(record, `Missing canonical record ${recordId}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
  return record;
}

function assertEvidence(record: MtaCanonicalRecord, evidenceId: string, quote: string): void {
  const ref = record.evidence_refs.find((candidate) =>
    candidate.source_id === SOURCE_ID && candidate.evidence_id === evidenceId);
  assert(ref, `${record.record_id} lost ${evidenceId}`);
  assert(ref.source_quote === quote, `${record.record_id} evidence quote changed`);
}

function assertCanonicalContext(): void {
  const records = readCanonicalRecordsFromJsonl();
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const event = requiredRecord(recordsById, EVENT_ID);
  const relation = requiredRecord(recordsById, TIMELINE_RELATION_ID);
  const project = requiredRecord(recordsById, PROJECT_ID);
  const treatment = requiredRecord(recordsById, TSP_TREATMENT_ID);
  assertEvidence(event, EVENT_EVIDENCE_ID, "Implementation in late 2025 or 2026");
  assertEvidence(relation, EVENT_EVIDENCE_ID, "Implementation in late 2025 or 2026");
  assertEvidence(treatment, TSP_EVIDENCE_ID, "Transit Signal Priority (TSP)");
  assert(relation.payload.subject_id === PROJECT_ID && relation.payload.object_id === EVENT_ID, "Timeline endpoints changed");
  assert(relation.payload.assertion_status === "planned", "Timeline relation is no longer planned");
  assert(project.payload.project_family === "bus_priority", "Project family changed");
  assert(treatment.payload.treatment_family === "signal_priority", "TSP family changed");
}

function assertInventory(queue: QueueRow[], preState: boolean): void {
  const rows = queue.filter((row) => row.event_record_id === EVENT_ID);
  assert(rows.length === gapSpecs.length, `Expected four Grand Avenue priority gaps, found ${rows.length}`);
  for (const spec of gapSpecs) {
    const row = rows.find((candidate) => candidate.gap_id === spec.gapId);
    assert(row, `Missing ${spec.gapId}`);
    assert(row.dimension === spec.dimension, `${spec.gapId} dimension changed`);
    assert(row.priority && row.priority_families.includes("transit_signal_priority"), `${spec.gapId} lost TSP priority`);
    if (preState) {
      assert(row.status === "open" && row.verdict === "unreviewed", `${spec.gapId} is not open at baseline`);
    } else {
      assert(row.status === "terminal" && row.verdict === "not_applicable", `${spec.gapId} is not terminal after review`);
    }
  }
  const treatmentGap = rows.find((row) => row.dimension === "treatment");
  assert(treatmentGap?.candidate_record_ids.includes(TSP_TREATMENT_ID), "TSP no longer appears only as a treatment candidate");
}

function writeOrVerifyDecisions(allowWrite: boolean): void {
  mkdirSync(decisionDir, { recursive: true });
  for (const spec of gapSpecs) {
    const decision = expectedDecision(spec);
    const path = join(decisionDir, `${decision.decision_id}.json`);
    if (existsSync(path)) {
      const existing = JSON.parse(readFileSync(path, "utf8")) as JsonValue;
      assert(stableJson(existing) === stableJson(decision as unknown as JsonValue), `${path} conflicts with generated decision`);
      continue;
    }
    assert(allowWrite, `${path} is missing after the review baseline changed`);
    writeFileSync(path, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
  }
}

assert(gapSpecs.length === 4 && new Set(gapSpecs.map((spec) => spec.gapId)).size === 4, "Target gap inventory drifted");
assertCanonicalContext();
const queueContent = readFileSync(queuePath);
const queue = readJsonl<QueueRow>(queuePath);
const preState = gapSpecs.every((spec) =>
  queue.some((row) => row.gap_id === spec.gapId && row.status === "open" && row.verdict === "unreviewed"));
if (preState) {
  assert(sha256(queueContent) === BASELINE_PRIORITY_QUEUE_SHA256, "Priority queue changed before Grand Avenue adjudication");
}
assertInventory(queue, preState);
writeOrVerifyDecisions(preState);

process.stdout.write(`${preState ? "Generated" : "Verified"} four evidence-scoped Grand Avenue planning decisions.\n`);
