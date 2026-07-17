import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import type { JsonObject, JsonValue, MtaCanonicalRecord } from "../packages/db/src/types.js";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read.js";
import {
  readSemanticCorrections,
  semanticCorrectionsPath,
  type SemanticCorrectionEntry,
} from "../packages/pipeline/src/records/semantic-corrections.js";

const RECEIPT_RELATIVE_PATH =
  "data/quality/acquisition/receipts/prospective-residual-lifecycle-review-2023-2026.json";
const RECEIPT_PATH = join(repoRoot, RECEIPT_RELATIVE_PATH);
const EXPECTED_RECEIPT_SHA256 = "8507a6868bd8125bc4682eb15c5a93a3d26056825e6b885c897b14b2423ba698";
const EXPECTED_EVENT_INVENTORY_SHA256 = "f0a612503c77437a8ef3736c383ac4a05e456afcccf9287e04e6ad0202e3f838";
const EXPECTED_RELATION_INVENTORY_SHA256 = "0a7eb3208f39e02fc4707249908096cf983095ddbd1a4ca397695a34101a7591";
const EXPECTED_CORRECTION_INVENTORY_SHA256 = "f11fa829844e98518c37b4200c11d8a41ddc4bfdce5cf3e6a36ec45b432b0048";
const EXCLUDED_REAL_EVENT_ID = "event_queue-jump-implementation-fall2024";

type IncomingRelationPin = {
  record_id: string;
  assertion_status: "planned" | "proposed";
  payload_sha256: string;
};

type SupportingEvidencePin = {
  evidence_id: string;
  evidence_sha256: string;
  literals: string[];
};

type LifecycleDecision = {
  sequence: number;
  correction_id: string;
  record_id: string;
  source_id: string;
  prior_lifecycle_phase: "other" | "launched";
  event_evidence_id: string;
  event_evidence_sha256: string;
  event_evidence_literals?: string[];
  prior_payload_sha256: string;
  planned_payload_sha256: string;
  incoming_relation: IncomingRelationPin | null;
  supporting_evidence: SupportingEvidencePin | null;
  basis: string;
};

type LifecycleReceipt = {
  schema_version: 1;
  receipt_id: string;
  status: string;
  operator: string;
  reviewed_at: string;
  acquisition_method: string;
  scope: {
    correction_count: number;
    prior_lifecycle_counts: { other: number; launched: number };
    corrected_lifecycle_phase: "planned";
    relation_backed_count: number;
    direct_prospective_evidence_count: number;
    event_inventory_sha256: string;
    relation_inventory_sha256: string;
    excluded_event_record_ids: string[];
    rule: string;
  };
  lifecycle_decisions: LifecycleDecision[];
  evidence_strength: {
    strong_relation_backed_event_count: number;
    strong_direct_wording_event_ids: string[];
    contextual_next_steps_event_ids: string[];
    weak_spot: string;
    anti_inference: string;
  };
  reproducibility: {
    work_order_script: string;
    semantic_corrections_path: string;
    apply_flag: "--apply";
    applied: boolean;
    expected_patch: {
      op: "patch_payload";
      set: { lifecycle_phase: "planned" };
    };
  };
};

type SourceBlock = {
  block_id: string;
  raw_text: string;
  raw_text_sha256: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function stableSha256(value: unknown): string {
  return sha256(stableJson(value as JsonValue));
}

function readReceipt(): LifecycleReceipt {
  const content = readFileSync(RECEIPT_PATH);
  assert(sha256(content) === EXPECTED_RECEIPT_SHA256, `${RECEIPT_RELATIVE_PATH} changed`);
  const receipt = JSON.parse(content.toString("utf8")) as LifecycleReceipt;
  assert(receipt.schema_version === 1, "Lifecycle receipt schema_version changed");
  assert(
    receipt.receipt_id === "prospective-residual-lifecycle-review-2023-2026",
    "Lifecycle receipt_id changed",
  );
  assert(receipt.status === "reviewed_work_order_not_applied", "Lifecycle receipt status changed");
  assert(receipt.operator === "codex-corpus-completion-2026-07-13", "Lifecycle receipt operator changed");
  assert(receipt.reviewed_at === "2026-07-13T19:15:00Z", "Lifecycle receipt review time changed");
  assert(receipt.acquisition_method === "existing_staged_official_sources_only", "Acquisition method changed");
  assert(receipt.scope.correction_count === 26, "Receipt must bind exactly 26 lifecycle corrections");
  assert(receipt.lifecycle_decisions.length === 26, "Receipt must contain exactly 26 lifecycle decisions");
  assert(receipt.scope.prior_lifecycle_counts.other === 24, "Receipt other lifecycle count changed");
  assert(receipt.scope.prior_lifecycle_counts.launched === 2, "Receipt launched lifecycle count changed");
  assert(receipt.scope.corrected_lifecycle_phase === "planned", "Receipt target lifecycle changed");
  assert(receipt.scope.relation_backed_count === 18, "Receipt relation-backed count changed");
  assert(receipt.scope.direct_prospective_evidence_count === 8, "Receipt direct-evidence count changed");
  assert(
    receipt.scope.event_inventory_sha256 === EXPECTED_EVENT_INVENTORY_SHA256,
    "Receipt event inventory fingerprint changed",
  );
  assert(
    receipt.scope.relation_inventory_sha256 === EXPECTED_RELATION_INVENTORY_SHA256,
    "Receipt relation inventory fingerprint changed",
  );
  assert(
    stableJson(receipt.scope.excluded_event_record_ids as unknown as JsonValue) ===
      stableJson([EXCLUDED_REAL_EVENT_ID] as unknown as JsonValue),
    "Receipt excluded-event boundary changed",
  );
  assert(receipt.reproducibility.work_order_script === "scripts/curate-prospective-residual-lifecycles.ts", "Work-order script path changed");
  assert(receipt.reproducibility.semantic_corrections_path === "data/semantic-corrections/corrections.jsonl", "Correction path changed");
  assert(receipt.reproducibility.apply_flag === "--apply", "Apply flag changed");
  assert(receipt.reproducibility.applied === false, "This receipt must remain a not-yet-applied work order");
  return receipt;
}

function expectedCorrectionId(decision: LifecycleDecision): string {
  const number = String(decision.sequence).padStart(2, "0");
  const slug = decision.record_id.replace(/^event_/u, "").replaceAll("_", "-");
  return `core-coverage-prospective-residual-${number}-${slug}-planned-20260713`;
}

function assertReceiptInventory(receipt: LifecycleReceipt): void {
  const decisions = receipt.lifecycle_decisions;
  const recordIds = new Set<string>();
  const correctionIds = new Set<string>();
  const sortedRecordIds = decisions.map((decision) => decision.record_id).sort();
  assert(
    stableJson(decisions.map((decision) => decision.record_id) as unknown as JsonValue) ===
      stableJson(sortedRecordIds as unknown as JsonValue),
    "Lifecycle decision inventory is not sorted by record_id",
  );
  for (const [index, decision] of decisions.entries()) {
    assert(decision.sequence === index + 1, `${decision.record_id} sequence changed`);
    assert(decision.correction_id === expectedCorrectionId(decision), `${decision.record_id} correction_id changed`);
    assert(!recordIds.has(decision.record_id), `Duplicate lifecycle target ${decision.record_id}`);
    assert(!correctionIds.has(decision.correction_id), `Duplicate correction id ${decision.correction_id}`);
    assert(decision.record_id !== EXCLUDED_REAL_EVENT_ID, "Real Fall 2024 Tremont queue-jump event entered the work order");
    assert(decision.basis.trim().length > 0, `${decision.record_id} is missing review basis`);
    assert(decision.source_id.trim().length > 0, `${decision.record_id} is missing source_id`);
    assert(decision.event_evidence_id.startsWith(`${decision.source_id}#`), `${decision.record_id} event evidence source changed`);
    assert(/^sha256:[a-f0-9]{64}$/u.test(decision.event_evidence_sha256), `${decision.record_id} event evidence hash is invalid`);
    assert(/^[a-f0-9]{64}$/u.test(decision.prior_payload_sha256), `${decision.record_id} prior payload hash is invalid`);
    assert(/^[a-f0-9]{64}$/u.test(decision.planned_payload_sha256), `${decision.record_id} planned payload hash is invalid`);
    if (decision.incoming_relation === null) {
      assert(
        (decision.event_evidence_literals?.length ?? 0) > 0,
        `${decision.record_id} lacks both an incoming prospective relation and direct event literals`,
      );
    } else {
      assert(
        decision.incoming_relation.assertion_status === "planned" ||
          decision.incoming_relation.assertion_status === "proposed",
        `${decision.record_id} incoming relation is not prospective`,
      );
    }
    recordIds.add(decision.record_id);
    correctionIds.add(decision.correction_id);
  }
  assert(
    decisions.filter((decision) => decision.prior_lifecycle_phase === "other").length === 24,
    "Expected exactly 24 legacy-other events",
  );
  assert(
    decisions.filter((decision) => decision.prior_lifecycle_phase === "launched").length === 2,
    "Expected exactly two false-launched events",
  );
  assert(decisions.filter((decision) => decision.incoming_relation !== null).length === 18, "Expected 18 relation-backed events");
  assert(decisions.filter((decision) => decision.incoming_relation === null).length === 8, "Expected eight direct-evidence events");
  assert(receipt.evidence_strength.strong_relation_backed_event_count === 18, "Evidence-strength count changed");
  assert(receipt.evidence_strength.contextual_next_steps_event_ids.length === 6, "Expected six contextual Next Steps events");
}

const blocksBySource = new Map<string, Map<string, SourceBlock>>();

function sourceBlock(evidenceId: string): SourceBlock {
  const separator = evidenceId.indexOf("#");
  assert(separator > 0 && separator < evidenceId.length - 1, `Invalid evidence id ${evidenceId}`);
  const sourceId = evidenceId.slice(0, separator);
  const blockId = evidenceId.slice(separator + 1);
  let blocks = blocksBySource.get(sourceId);
  if (!blocks) {
    const path = join(repoRoot, "raw", "sources", sourceId, "blocks.jsonl");
    blocks = new Map(
      readFileSync(path, "utf8")
        .split(/\r?\n/u)
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as SourceBlock)
        .map((block) => [block.block_id, block]),
    );
    blocksBySource.set(sourceId, blocks);
  }
  const block = blocks.get(blockId);
  assert(block, `Missing source block ${evidenceId}`);
  return block;
}

function assertBlockPin(evidenceId: string, expectedSha256: string, literals: readonly string[]): void {
  const block = sourceBlock(evidenceId);
  assert(block.raw_text_sha256 === expectedSha256, `${evidenceId} evidence hash changed`);
  for (const literal of literals) {
    assert(block.raw_text.includes(literal), `${evidenceId} lost ${JSON.stringify(literal)}`);
  }
}

function requiredRecord(recordsById: ReadonlyMap<string, MtaCanonicalRecord>, recordId: string, kind: string): MtaCanonicalRecord {
  const record = recordsById.get(recordId);
  assert(record, `Missing canonical ${kind} ${recordId}`);
  assert(record.record_kind === kind, `${recordId} is no longer a ${kind}`);
  assert(record.truth_status === "source_stated", `${recordId} truth_status changed`);
  assert(record.review_state !== "quarantined" && record.review_state !== "retracted", `${recordId} is not usable`);
  return record;
}

function priorPayload(event: MtaCanonicalRecord, decision: LifecycleDecision): JsonObject {
  return { ...event.payload, lifecycle_phase: decision.prior_lifecycle_phase };
}

function plannedPayload(event: MtaCanonicalRecord): JsonObject {
  return { ...event.payload, lifecycle_phase: "planned" };
}

function assertCanonicalEvidence(
  receipt: LifecycleReceipt,
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): Map<string, MtaCanonicalRecord> {
  const eventsById = new Map<string, MtaCanonicalRecord>();
  const relations: MtaCanonicalRecord[] = [];
  for (const decision of receipt.lifecycle_decisions) {
    const event = requiredRecord(recordsById, decision.record_id, "event");
    assert(
      event.payload.lifecycle_phase === decision.prior_lifecycle_phase || event.payload.lifecycle_phase === "planned",
      `${decision.record_id} lifecycle is neither ${decision.prior_lifecycle_phase} nor planned`,
    );
    assert(
      (event.source_ids ?? [event.source_id]).includes(decision.source_id),
      `${decision.record_id} lost source ${decision.source_id}`,
    );
    assert(stableSha256(priorPayload(event, decision)) === decision.prior_payload_sha256, `${decision.record_id} prior payload changed`);
    assert(stableSha256(plannedPayload(event)) === decision.planned_payload_sha256, `${decision.record_id} planned payload changed`);
    const eventRef = event.evidence_refs.find((ref) => ref.evidence_id === decision.event_evidence_id);
    assert(eventRef, `${decision.record_id} lost event evidence ${decision.event_evidence_id}`);
    assert(eventRef.text_sha256 === decision.event_evidence_sha256, `${decision.record_id} canonical evidence hash changed`);
    assertBlockPin(decision.event_evidence_id, decision.event_evidence_sha256, decision.event_evidence_literals ?? []);

    if (decision.supporting_evidence) {
      assertBlockPin(
        decision.supporting_evidence.evidence_id,
        decision.supporting_evidence.evidence_sha256,
        decision.supporting_evidence.literals,
      );
    }

    if (decision.incoming_relation) {
      const relation = requiredRecord(recordsById, decision.incoming_relation.record_id, "relation");
      assert(relation.payload.relation_kind === "has_timeline_event", `${relation.record_id} relation kind changed`);
      assert(relation.payload.object_id === decision.record_id, `${relation.record_id} no longer targets ${decision.record_id}`);
      assert(
        relation.payload.assertion_status === decision.incoming_relation.assertion_status,
        `${relation.record_id} assertion status changed`,
      );
      assert(stableSha256(relation.payload) === decision.incoming_relation.payload_sha256, `${relation.record_id} payload changed`);
      assert(
        relation.evidence_refs.some((ref) => ref.evidence_id === decision.event_evidence_id),
        `${relation.record_id} no longer shares ${decision.event_evidence_id} with its event`,
      );
      relations.push(relation);
    }
    eventsById.set(event.record_id, event);
  }

  const priorEvents = receipt.lifecycle_decisions.map((decision) => {
    const event = eventsById.get(decision.record_id)!;
    return { ...event, payload: priorPayload(event, decision) };
  });
  assert(stableSha256(priorEvents) === EXPECTED_EVENT_INVENTORY_SHA256, "Prospective event inventory changed");
  relations.sort((left, right) => left.record_id.localeCompare(right.record_id));
  assert(stableSha256(relations) === EXPECTED_RELATION_INVENTORY_SHA256, "Prospective relation inventory changed");
  return eventsById;
}

function correctionFor(
  receipt: LifecycleReceipt,
  decision: LifecycleDecision,
  event: MtaCanonicalRecord,
): SemanticCorrectionEntry {
  return {
    correction_id: decision.correction_id,
    op: "patch_payload",
    record_id: decision.record_id,
    guards: { payload: priorPayload(event, decision) },
    patch: { set: { lifecycle_phase: "planned" } },
    cascade: [],
    reason:
      `${decision.basis} Correct only lifecycle_phase to planned; preserve the source literal, date fields, ` +
      "identity, relations, and evidence references.",
    source_decision: RECEIPT_RELATIVE_PATH,
    reviewed_at: receipt.reviewed_at,
    provenance: "human",
  };
}

function assertExistingCorrectionState(
  expected: readonly SemanticCorrectionEntry[],
  eventsById: ReadonlyMap<string, MtaCanonicalRecord>,
): { existing: SemanticCorrectionEntry[]; pending: SemanticCorrectionEntry[] } {
  const corrections = readSemanticCorrections();
  const byCorrectionId = new Map<string, SemanticCorrectionEntry[]>();
  for (const correction of corrections) {
    const matches = byCorrectionId.get(correction.correction_id) ?? [];
    matches.push(correction);
    byCorrectionId.set(correction.correction_id, matches);
  }
  const expectedIds = new Set(expected.map((correction) => correction.correction_id));
  const targetIds = new Set(expected.map((correction) => correction.record_id));
  const foreignLifecycleCorrections = corrections.filter((correction) => {
    if (!targetIds.has(correction.record_id) || expectedIds.has(correction.correction_id)) return false;
    if (correction.op !== "patch_payload") return false;
    const set = correction.patch.set;
    return typeof set === "object" && set !== null && !Array.isArray(set) && "lifecycle_phase" in set;
  });
  assert(
    foreignLifecycleCorrections.length === 0,
    `Conflicting lifecycle corrections already target this work order: ${foreignLifecycleCorrections
      .map((correction) => correction.correction_id)
      .sort()
      .join(", ")}`,
  );

  const existing: SemanticCorrectionEntry[] = [];
  const pending: SemanticCorrectionEntry[] = [];
  for (const correction of expected) {
    const matches = byCorrectionId.get(correction.correction_id) ?? [];
    assert(matches.length <= 1, `Duplicate existing correction id ${correction.correction_id}`);
    const event = eventsById.get(correction.record_id)!;
    if (matches.length === 1) {
      assert(
        stableJson(matches[0] as unknown as JsonValue) === stableJson(correction as unknown as JsonValue),
        `Existing correction ${correction.correction_id} conflicts with this work order`,
      );
      existing.push(correction);
      continue;
    }
    assert(
      event.payload.lifecycle_phase === correction.guards.payload?.lifecycle_phase,
      `${correction.record_id} is already changed without its exact work-order correction`,
    );
    pending.push(correction);
  }
  return { existing, pending };
}

function appendPendingCorrections(pending: readonly SemanticCorrectionEntry[]): void {
  if (pending.length === 0) return;
  const path = semanticCorrectionsPath();
  const content = readFileSync(path, "utf8");
  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  const additions = pending.map((correction) => JSON.stringify(correction)).join("\n");
  appendFileSync(path, `${separator}${additions}\n`, "utf8");

  const after = readSemanticCorrections();
  for (const expected of pending) {
    const matches = after.filter((correction) => correction.correction_id === expected.correction_id);
    assert(matches.length === 1, `Failed to append exactly one ${expected.correction_id}`);
    assert(
      stableJson(matches[0] as unknown as JsonValue) === stableJson(expected as unknown as JsonValue),
      `Appended correction ${expected.correction_id} changed`,
    );
  }
}

const args = process.argv.slice(2);
assert(args.length <= 1 && args.every((arg) => arg === "--apply"), "Usage: bun scripts/curate-prospective-residual-lifecycles.ts [--apply]");
const apply = args.includes("--apply");
const receipt = readReceipt();
assertReceiptInventory(receipt);
const records = readCanonicalRecordsFromJsonl();
const recordsById = new Map(records.map((record) => [record.record_id, record]));
const eventsById = assertCanonicalEvidence(receipt, recordsById);
const expectedCorrections = receipt.lifecycle_decisions.map((decision) =>
  correctionFor(receipt, decision, eventsById.get(decision.record_id)!),
);
assert(
  stableSha256(expectedCorrections) === EXPECTED_CORRECTION_INVENTORY_SHA256,
  "Generated correction inventory changed",
);
const state = assertExistingCorrectionState(expectedCorrections, eventsById);

if (apply) appendPendingCorrections(state.pending);

const result = {
  mode: apply ? "apply" : "dry_run",
  receipt_id: receipt.receipt_id,
  correction_count: expectedCorrections.length,
  existing_exact_count: state.existing.length,
  pending_count: state.pending.length,
  appended_count: apply ? state.pending.length : 0,
  prior_lifecycle_counts: receipt.scope.prior_lifecycle_counts,
  corrected_lifecycle_phase: "planned",
  excluded_real_event_id: EXCLUDED_REAL_EVENT_ID,
  event_record_ids: receipt.lifecycle_decisions.map((decision) => decision.record_id),
  evidence_weak_spot: receipt.evidence_strength.weak_spot,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
