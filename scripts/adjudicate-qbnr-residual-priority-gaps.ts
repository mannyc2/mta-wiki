import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  parseOperationalCoverageAcceptedDecision,
  type OperationalCoverageAcceptedDecision,
  type OperationalCoverageDimension,
} from "../packages/pipeline/src/quality/operational-coverage";

const SOURCE_ID = "mta_queens_bus_network_redesign_service_changes";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const DECIDED_AT = "2026-07-13T05:45:00.000Z";
const BASELINE_PRIORITY_QUEUE_SHA256 = "13da1445f26392652e11a5f7b1835f85b9c23408ccc4d3d306f468ed09c43902";
const OCCURRENCE_FIXTURE_SHA256 = "41a3431277e3a4994b38115bf26a3365f75907a09f284abd2c99640b7ac21ca8";
const EXPECTED_QBNR_OCCURRENCES = 121;
const EXPECTED_PHASE_1_OCCURRENCES = 83;
const EXPECTED_PHASE_2_OCCURRENCES = 38;

const queuePath = join(repoRoot, "data/quality/operational-coverage/priority-queue.jsonl");
const occurrencePath = join(repoRoot, "data/contract-fixtures/operational-occurrences-v1/operational_occurrences.jsonl");
const decisionDir = join(repoRoot, "data/operational-anchor-review/ledger-decisions/decisions");
const correctionPath = join(repoRoot, "data/semantic-corrections/corrections.jsonl");
const receiptPath = join(repoRoot, "data/quality/acquisition/receipts/qbnr-ocr-date-defect-b62-q103-2025.json");

type QueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: OperationalCoverageDimension;
  priority: boolean;
  source_ids: string[];
  status: "open" | "ready_for_review" | "terminal";
  verdict: string;
};

type OccurrenceRow = {
  occurrence_id: string;
  study_projection_eligible: boolean;
  resolved_onset: { date: string };
  evidence_bindings: Array<{ source_id: string; evidence_id: string; record_id: string }>;
};

type GapSpec = {
  eventId: string;
  dimension: OperationalCoverageDimension;
  gapId: string;
  selector: "phase_1" | "phase_2" | "all_qbnr" | "all_qbnr_retrospective";
};

const eventGapSpecs = [
  {
    eventId: "event_170921-queens-bus-phase1-launch",
    selector: "phase_1",
    gaps: {
      delivered_status: "operational-coverage:0efe0d75713aaf9219dfcebe",
      route: "operational-coverage:07f4ee25ba01ff7c943409d4",
      treatment: "operational-coverage:9236fd01ac08bae89fdc3dfa",
    },
  },
  {
    eventId: "event_qbnr-phase1-end-june-2025",
    selector: "phase_1",
    gaps: {
      delivered_status: "operational-coverage:11f7fa3c1e241da148eab06b",
      route: "operational-coverage:ec2a5f90688b7a9f727c8748",
      treatment: "operational-coverage:84f8561ecb009ebf35e5d657",
    },
  },
  {
    eventId: "event_queens-bus-redesign-phase1-launch-june29-2025",
    selector: "phase_1",
    gaps: {
      delivered_status: "operational-coverage:7af819d5e43897444c911ace",
      route: "operational-coverage:d8593973ef422f01aef70d81",
      treatment: "operational-coverage:d9967b59043b66904e64a4cf",
    },
  },
  {
    eventId: "event_170921-queens-bus-phase2-launch",
    selector: "phase_2",
    gaps: {
      delivered_status: "operational-coverage:f52c4b0baa81e85b21d3f8f0",
      route: "operational-coverage:5c56a663aa66c28eb0216c9c",
      treatment: "operational-coverage:0dae44904b1b87be7770d865",
    },
  },
  {
    eventId: "event_qbnr-phase2-end-aug-2025",
    selector: "phase_2",
    gaps: {
      delivered_status: "operational-coverage:4b1ec535f0998f5220bf63a6",
      route: "operational-coverage:357e460cd1828f7fceb6349c",
      treatment: "operational-coverage:6a5b2bf070ad80a858114c58",
    },
  },
  {
    eventId: "event_queens-bus-redesign-phase2-launch-aug31-2025",
    selector: "phase_2",
    gaps: {
      delivered_status: "operational-coverage:5ba51554fdfe77b93ddaffba",
      route: "operational-coverage:45dd3045070322bc90d91414",
      treatment: "operational-coverage:a9b2bf1ff109628219637775",
    },
  },
  {
    eventId: "event_phased-implementation-mid2025",
    selector: "all_qbnr",
    gaps: {
      date_precision: "operational-coverage:537d28d5ea49ed430c096fc3",
      delivered_status: "operational-coverage:87f292c96799ce27c7259fb6",
      route: "operational-coverage:32f239f57cb178319443c846",
      treatment: "operational-coverage:13f8fa411b2ad5244f942b16",
    },
  },
  {
    eventId: "event_qbnr-implementation-2025",
    selector: "all_qbnr_retrospective",
    gaps: {
      date_precision: "operational-coverage:a13261b3e8e90e4ad33a525e",
      delivered_status: "operational-coverage:b52c55b598159ec4ae8463ac",
      route: "operational-coverage:341dd357987605bcd558d4bc",
      treatment: "operational-coverage:f592a4c616bec582666f18bb",
    },
  },
  {
    eventId: "event_qbnr-implementation-summer-fall2025",
    selector: "all_qbnr",
    gaps: {
      timeline_subject: "operational-coverage:60d1f3e237335b9661abe505",
    },
  },
] as const;

const gapSpecs: GapSpec[] = eventGapSpecs.flatMap((event) =>
  Object.entries(event.gaps).map(([dimension, gapId]) => ({
    eventId: event.eventId,
    dimension: dimension as OperationalCoverageDimension,
    gapId,
    selector: event.selector,
  })),
);

const retractedFalseGapIds = [
  "operational-coverage:1bb3ab952238ba72daf229ea",
  "operational-coverage:3767ea1ed7fb9feb849ce748",
  "operational-coverage:4628780b06a452e40c49afb5",
  "operational-coverage:8c06619d99742fb6b9bd62ed",
  "operational-coverage:902fb6ea7983b2c78626f2d2",
  "operational-coverage:985cd77483dc0d5241eab4c6",
  "operational-coverage:a5acd32b8aaf2523e7dc5e8f",
  "operational-coverage:e1f0efa1458301fad68d038b",
] as const;

const transferPolicyGapIds = [
  "operational-coverage:10e40a631feba82245978d60",
  "operational-coverage:9136a8a9b970d32f47d31dd0",
  "operational-coverage:b15c7958c6913dfa79b2dcfe",
] as const;

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function slug(value: string): string {
  return value.replace(/^event_/u, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function decisionId(spec: GapSpec): string {
  return `qbnr-residual-${slug(spec.eventId)}-${spec.dimension}-superseded-by-approved-occurrences`;
}

function selectorRationale(selector: GapSpec["selector"]): string {
  if (selector === "phase_1") {
    return "This project-level Phase 1 description is not an independent route-level occurrence. The accepted occurrence fixture already contains 83 source-complete QBNR route occurrences on June 29 or June 30, 2025, each with exact route, treatment, date, and delivered scope. Recovering scope on the coarse duplicate would risk route-treatment cross-products, so this diagnostic is not applicable.";
  }
  if (selector === "phase_2") {
    return "This project-level Phase 2 description is not an independent route-level occurrence. The accepted occurrence fixture already contains 38 source-complete QBNR route occurrences on August 31 or September 2, 2025, each with exact route, treatment, date, and delivered scope. Recovering scope on the coarse duplicate would risk route-treatment cross-products, so this diagnostic is not applicable.";
  }
  if (selector === "all_qbnr_retrospective") {
    return "This retrospective project-level QBNR implementation summary is not an independent route-level occurrence. The accepted occurrence fixture already contains all 121 source-complete QBNR route occurrences with exact route, treatment, date, and delivered scope. Scoping this umbrella duplicate would add no studyable fact and could create route-treatment cross-products, so this diagnostic is not applicable.";
  }
  return "This coarse prospective QBNR implementation description is not an independent route-level occurrence. The accepted occurrence fixture already contains all 121 source-complete QBNR route occurrences with exact route, treatment, date, and delivered scope. Linking or scoping this duplicate would add no studyable fact and could create route-treatment cross-products, so this diagnostic is not applicable.";
}

function expectedDecision(spec: GapSpec): OperationalCoverageAcceptedDecision {
  return parseOperationalCoverageAcceptedDecision(
    {
      schema_version: 1,
      decision_id: decisionId(spec),
      gap_id: spec.gapId,
      prior_verdict: "unreviewed",
      verdict: "not_applicable",
      reviewer: REVIEWER,
      decided_at: DECIDED_AT,
      rationale: selectorRationale(spec.selector),
      proposal_ids: [],
      evidence_refs: [],
      search_receipt_ids: [],
    },
    decisionId(spec),
  );
}

function assertCorrectionJournal(): void {
  const corrections = readJsonl<Record<string, unknown>>(correctionPath);
  const expected = [
    {
      correction_id: "core-coverage-qbnr-b62-ocr-date-retraction-20260713",
      record_id: "event_b62-extension-aug2025",
      cascade: ["relation_qbnr-timeline-b62-ext"],
    },
    {
      correction_id: "core-coverage-qbnr-q103-ocr-date-retraction-20260713",
      record_id: "event_q103-reroute-aug2025",
      cascade: ["relation_qbnr-timeline-q103-reroute"],
    },
  ];
  for (const item of expected) {
    const correction = corrections.find((candidate) => candidate.correction_id === item.correction_id);
    assert(correction, `Missing semantic correction ${item.correction_id}`);
    assert(correction.op === "retract_record", `${item.correction_id} must retract the false event`);
    assert(correction.record_id === item.record_id, `${item.correction_id} record guard changed`);
    assert(
      stableJson(correction.cascade as JsonValue) === stableJson(item.cascade as JsonValue),
      `${item.correction_id} cascade changed`,
    );
    assert(
      correction.source_decision === "data/quality/acquisition/receipts/qbnr-ocr-date-defect-b62-q103-2025.json",
      `${item.correction_id} must cite the OCR adjudication receipt`,
    );
  }
}

function assertReceipt(): void {
  assert(existsSync(receiptPath), "Missing QBNR OCR adjudication receipt");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as Record<string, any>;
  assert(receipt.receipt_id === "qbnr-ocr-date-defect-b62-q103-2025", "OCR receipt_id changed");
  assert(
    receipt.source?.artifact_sha256 === "70d1bca820dde50ac82fa8c1e5021fe14f9c24bd64b0da59f607a7dc641b697a",
    "OCR receipt PDF hash changed",
  );
  assert(receipt.ocr_defect?.correct_visual_literal === "Starting August 31", "OCR adjudication changed");
  assert(
    stableJson(receipt.coverage_baseline?.removed_false_gap_ids as JsonValue) ===
      stableJson([...retractedFalseGapIds] as JsonValue),
    "OCR receipt false-gap inventory changed",
  );
}

function assertOccurrences(): void {
  const content = readFileSync(occurrencePath);
  assert(sha256(content) === OCCURRENCE_FIXTURE_SHA256, "Operational occurrence fixture changed before residual adjudication");
  const rows = readJsonl<OccurrenceRow>(occurrencePath);
  const qbnr = rows.filter(
    (row) =>
      row.study_projection_eligible &&
      row.evidence_bindings.some((binding) => binding.source_id === SOURCE_ID),
  );
  assert(qbnr.length === EXPECTED_QBNR_OCCURRENCES, `Expected 121 approved QBNR occurrences, found ${qbnr.length}`);
  const phase1 = qbnr.filter((row) => ["2025-06-29", "2025-06-30"].includes(row.resolved_onset.date));
  const phase2 = qbnr.filter((row) => ["2025-08-31", "2025-09-02"].includes(row.resolved_onset.date));
  assert(phase1.length === EXPECTED_PHASE_1_OCCURRENCES, `Expected 83 Phase 1 occurrences, found ${phase1.length}`);
  assert(phase2.length === EXPECTED_PHASE_2_OCCURRENCES, `Expected 38 Phase 2 occurrences, found ${phase2.length}`);
  for (const [occurrenceId, evidenceId] of [
    ["occurrence:18bf68576411afed0305dfed", `${SOURCE_ID}#p001_b0101`],
    ["occurrence:c52f5ae327c2f0f315749440", `${SOURCE_ID}#p001_b0092`],
  ] as const) {
    const row = qbnr.find((candidate) => candidate.occurrence_id === occurrenceId);
    assert(row?.resolved_onset.date === "2025-08-31", `${occurrenceId} no longer resolves to 2025-08-31`);
    assert(row.evidence_bindings.some((binding) => binding.evidence_id === evidenceId), `${occurrenceId} lost clean official evidence`);
  }
}

function assertExactResidualInventory(queue: QueueRow[], preState: boolean): void {
  const qbnrRows = queue.filter(
    (row) => row.source_ids.includes(SOURCE_ID) || row.event_record_id === "event_qbnr-implementation-summer-fall2025",
  );
  const openResiduals = qbnrRows.filter((row) => row.status === "open");
  const expectedOpenIds = new Set(preState ? [
    ...gapSpecs.map((spec) => spec.gapId),
    ...transferPolicyGapIds,
    ...retractedFalseGapIds,
  ] : [...transferPolicyGapIds]);
  assert(openResiduals.length === expectedOpenIds.size, `Expected ${expectedOpenIds.size} open QBNR residual rows, found ${openResiduals.length}`);
  assert(
    openResiduals.every((row) => expectedOpenIds.has(row.gap_id)),
    `Unexpected open QBNR residual gap(s): ${openResiduals.filter((row) => !expectedOpenIds.has(row.gap_id)).map((row) => row.gap_id).join(", ")}`,
  );
  for (const spec of gapSpecs) {
    const row = qbnrRows.find((candidate) => candidate.gap_id === spec.gapId);
    assert(row, `Missing target gap ${spec.gapId}`);
    assert(row.event_record_id === spec.eventId && row.dimension === spec.dimension, `${spec.gapId} identity changed`);
    assert(row.priority, `${spec.gapId} is no longer priority`);
    if (preState) {
      assert(row.status === "open" && row.verdict === "unreviewed", `${spec.gapId} is not open/unreviewed at baseline`);
    } else {
      assert(row.status === "terminal" && row.verdict === "not_applicable", `${spec.gapId} is not terminal after adjudication`);
    }
  }
  for (const gapId of transferPolicyGapIds) {
    const row = qbnrRows.find((candidate) => candidate.gap_id === gapId);
    assert(row?.event_record_id === "event_meeting-doc-174076-transfer-policy-launch", `${gapId} transfer-policy identity changed`);
    assert(row.status === "open" && row.verdict === "unreviewed", `${gapId} must remain genuinely open`);
  }
  if (preState) {
    for (const gapId of retractedFalseGapIds) {
      const row = qbnrRows.find((candidate) => candidate.gap_id === gapId);
      assert(row?.status === "open" && row.verdict === "unreviewed", `${gapId} is not an open false-OCR gap at baseline`);
    }
  } else {
    assert(
      queue.every((row) => !retractedFalseGapIds.includes(row.gap_id as (typeof retractedFalseGapIds)[number])),
      "A false OCR gap survived canonical retraction",
    );
  }
}

function writeOrVerifyDecisions(allowWrite: boolean): void {
  mkdirSync(decisionDir, { recursive: true });
  for (const spec of gapSpecs) {
    const decision = expectedDecision(spec);
    const path = join(decisionDir, `${decision.decision_id}.json`);
    const content = `${JSON.stringify(decision, null, 2)}\n`;
    if (existsSync(path)) {
      const existing = JSON.parse(readFileSync(path, "utf8")) as JsonValue;
      assert(stableJson(existing) === stableJson(decision as unknown as JsonValue), `${path} conflicts with the exact generated decision`);
      continue;
    }
    assert(allowWrite, `${path} is missing after the baseline changed`);
    writeFileSync(path, content, "utf8");
  }
}

assert(gapSpecs.length === 27, `Expected 27 coarse QBNR decisions, found ${gapSpecs.length}`);
assert(new Set(gapSpecs.map((spec) => spec.gapId)).size === gapSpecs.length, "Duplicate target gap_id");
assertCorrectionJournal();
assertReceipt();
assertOccurrences();

const queueContent = readFileSync(queuePath);
const preState = sha256(queueContent) === BASELINE_PRIORITY_QUEUE_SHA256;
const queue = readJsonl<QueueRow>(queuePath);
assertExactResidualInventory(queue, preState);
writeOrVerifyDecisions(preState);

process.stdout.write(
  `${preState ? "Generated" : "Verified"} ${gapSpecs.length} QBNR residual ledger decisions; ` +
    `${retractedFalseGapIds.length} false OCR gaps are governed by semantic retraction; ` +
    `${transferPolicyGapIds.length} genuine transfer-policy gaps remain open.\n`,
);
