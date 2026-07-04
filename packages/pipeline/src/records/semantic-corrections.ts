import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaEvidenceRef, MtaValidationIssue } from "@mta-wiki/db/types";

export type SemanticCorrectionOp =
  | "retract_record"
  | "patch_payload"
  | "replace_endpoint"
  | "recite_evidence"
  | "set_review_state"
  | "supersede_record";

export type SemanticCorrectionProvenance = "deterministic_rule" | "llm_triage" | "human";

export type SemanticCorrectionGuards = {
  payload?: JsonObject | undefined;
};

export type SemanticCorrectionEntry = {
  correction_id: string;
  op: SemanticCorrectionOp;
  record_id: string;
  guards: SemanticCorrectionGuards;
  patch: JsonObject;
  cascade: string[];
  reason: string;
  source_decision: string;
  reviewed_at: string;
  provenance: SemanticCorrectionProvenance;
};

export type SemanticCorrectionApplySummary = {
  total: number;
  applied: number;
  skipped: number;
  appliedByOp: Record<string, number>;
  skippedByOp: Record<string, number>;
  appliedBySourceDecision: Record<string, number>;
};

export type SemanticCorrectionApplyResult = {
  records: MtaCanonicalRecord[];
  summary: SemanticCorrectionApplySummary;
  issues: MtaValidationIssue[];
};

export type SemanticCorrectionReadResult = {
  entries: SemanticCorrectionEntry[];
  issues: MtaValidationIssue[];
};

const CORRECTIONS_PATH = join(repoRoot, "data/semantic-corrections/corrections.jsonl");
const ISSUE_CODE = "invalid_semantic_correction";
const SKIPPED_CODE = "semantic_correction_skipped";
const OPS = new Set<SemanticCorrectionOp>([
  "retract_record",
  "patch_payload",
  "replace_endpoint",
  "recite_evidence",
  "set_review_state",
  "supersede_record",
]);
const PROVENANCE = new Set<SemanticCorrectionProvenance>(["deterministic_rule", "llm_triage", "human"]);

export function semanticCorrectionsPath(): string {
  return CORRECTIONS_PATH;
}

export function semanticCorrectionsExist(): boolean {
  return existsSync(CORRECTIONS_PATH);
}

export function readSemanticCorrections(): SemanticCorrectionEntry[] {
  const result = readSemanticCorrectionsWithIssues();
  if (result.issues.length > 0) {
    const first = result.issues[0]!;
    throw new Error(`${first.code}: ${first.message}${first.path ? ` (${first.path})` : ""}`);
  }
  return result.entries;
}

export function readSemanticCorrectionsWithIssues(path = CORRECTIONS_PATH): SemanticCorrectionReadResult {
  if (!existsSync(path)) return { entries: [], issues: [] };

  const relativePath = relative(repoRoot, path);
  const entries: SemanticCorrectionEntry[] = [];
  const issues: MtaValidationIssue[] = [];
  const content = readFileSync(path, "utf8");
  for (const [lineIndex, line] of content.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    const entryPath = `${relativePath}:${lineIndex + 1}`;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      issues.push({
        code: ISSUE_CODE,
        path: entryPath,
        message: `semantic correction line must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    const entry = parseSemanticCorrectionEntry(parsed, entryPath, issues);
    if (entry) entries.push(entry);
  }
  return { entries, issues };
}

export function writeSemanticCorrections(entries: SemanticCorrectionEntry[], path = CORRECTIONS_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  const content = entries.map((entry) => JSON.stringify(entry)).join("\n");
  writeFileSync(path, content ? `${content}\n` : "", "utf8");
}

export function validateSemanticCorrections(options: { records?: MtaCanonicalRecord[] | undefined; path?: string | undefined } = {}): MtaValidationIssue[] {
  const path = options.path ?? CORRECTIONS_PATH;
  const result = readSemanticCorrectionsWithIssues(path);
  const issues = [...result.issues];
  const seen = new Set<string>();
  const recordsById = options.records ? new Map(options.records.map((record) => [record.record_id, record])) : undefined;

  for (const [index, entry] of result.entries.entries()) {
    const entryPath = `${relative(repoRoot, path)}:${index + 1}`;
    if (seen.has(entry.correction_id)) {
      issues.push({ code: ISSUE_CODE, path: entryPath, message: `duplicate correction_id ${entry.correction_id}` });
    }
    seen.add(entry.correction_id);
    if (recordsById && !recordsById.has(entry.record_id)) {
      issues.push({ code: ISSUE_CODE, path: entryPath, recordId: entry.record_id, message: `record_id ${entry.record_id} does not exist before semantic corrections` });
    }
    issues.push(...validatePatchShape(entry, entryPath, recordsById));
  }

  if (issues.length === 0 && options.records) {
    try {
      issues.push(...withSemanticCorrections(options.records, result.entries).issues);
    } catch (error) {
      issues.push({
        code: ISSUE_CODE,
        path: relative(repoRoot, path),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return issues;
}

export function withSemanticCorrections(records: readonly MtaCanonicalRecord[], corrections = readSemanticCorrections()): SemanticCorrectionApplyResult {
  const byId = new Map(records.map((record) => [record.record_id, cloneRecord(record)]));
  const order = records.map((record) => record.record_id);
  const issues: MtaValidationIssue[] = [];
  const summary = emptySummary(corrections.length);

  for (const correction of [...corrections].sort((a, b) => a.correction_id.localeCompare(b.correction_id))) {
    const record = byId.get(correction.record_id);
    if (!record) {
      skip(summary, issues, correction, `record_id ${correction.record_id} is not present`);
      continue;
    }
    const guardMismatch = firstGuardMismatch(record, correction.guards);
    if (guardMismatch) {
      skip(summary, issues, correction, guardMismatch);
      continue;
    }

    const applied = applyCorrection(byId, correction);
    if (!applied) {
      skip(summary, issues, correction, "correction target is not applicable in the current record set");
      continue;
    }
    bump(summary.appliedByOp, correction.op);
    bump(summary.appliedBySourceDecision, correction.source_decision);
    summary.applied += 1;
  }

  return {
    records: order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
    summary,
    issues,
  };
}

function applyCorrection(byId: Map<string, MtaCanonicalRecord>, correction: SemanticCorrectionEntry): boolean {
  switch (correction.op) {
    case "retract_record":
      return retractRecord(byId, correction);
    case "patch_payload":
      return patchPayload(byId, correction);
    case "replace_endpoint":
      return replaceEndpoint(byId, correction);
    case "recite_evidence":
      return reciteEvidence(byId, correction);
    case "set_review_state":
      return setReviewState(byId, correction);
    case "supersede_record":
      return supersedeRecord(byId, correction);
  }
}

function retractRecord(byId: Map<string, MtaCanonicalRecord>, correction: SemanticCorrectionEntry): boolean {
  const referrers = relationReferrers(byId, correction.record_id).map((record) => record.record_id).sort();
  const cascade = [...correction.cascade].sort();
  const missing = referrers.filter((id) => !cascade.includes(id));
  if (missing.length > 0) {
    throw new Error(`semantic correction ${correction.correction_id} has incomplete cascade for ${correction.record_id}; missing relation ids: ${missing.join(", ")}`);
  }
  byId.delete(correction.record_id);
  for (const id of cascade) byId.delete(id);
  return true;
}

function patchPayload(byId: Map<string, MtaCanonicalRecord>, correction: SemanticCorrectionEntry): boolean {
  const set = objectValue(correction.patch.set);
  if (!set) return false;
  const record = byId.get(correction.record_id);
  if (!record) return false;
  record.payload = { ...record.payload, ...set };
  return true;
}

function replaceEndpoint(byId: Map<string, MtaCanonicalRecord>, correction: SemanticCorrectionEntry): boolean {
  const field = correction.patch.field;
  const to = correction.patch.to;
  if ((field !== "subject_id" && field !== "object_id") || typeof to !== "string" || !byId.has(to)) return false;
  const record = byId.get(correction.record_id);
  if (!record || record.record_kind !== "relation") return false;
  record.payload = { ...record.payload, [field]: to };
  return true;
}

function reciteEvidence(byId: Map<string, MtaCanonicalRecord>, correction: SemanticCorrectionEntry): boolean {
  const refs = correction.patch.evidence_refs;
  if (!Array.isArray(refs)) return false;
  const record = byId.get(correction.record_id);
  if (!record) return false;
  record.evidence_refs = refs.map((ref) => ({ ...(ref as MtaEvidenceRef) }));
  return true;
}

function setReviewState(byId: Map<string, MtaCanonicalRecord>, correction: SemanticCorrectionEntry): boolean {
  const reviewState = correction.patch.review_state;
  const truthStatus = correction.patch.truth_status;
  if (typeof reviewState !== "string" || !reviewState.trim()) return false;
  if (truthStatus !== undefined && (typeof truthStatus !== "string" || !truthStatus.trim())) return false;
  const record = byId.get(correction.record_id);
  if (!record) return false;
  record.review_state = reviewState;
  if (typeof truthStatus === "string") record.truth_status = truthStatus;
  return true;
}

function supersedeRecord(byId: Map<string, MtaCanonicalRecord>, correction: SemanticCorrectionEntry): boolean {
  const survivorRecordId = correction.patch.survivor_record_id;
  if (typeof survivorRecordId !== "string" || !byId.has(survivorRecordId)) return false;
  const removedId = correction.record_id;
  for (const cascadeId of correction.cascade) byId.delete(cascadeId);
  byId.delete(removedId);
  for (const record of byId.values()) {
    if (record.record_kind !== "relation") continue;
    const nextPayload = { ...record.payload };
    let changed = false;
    if (nextPayload.subject_id === removedId) {
      nextPayload.subject_id = survivorRecordId;
      changed = true;
    }
    if (nextPayload.object_id === removedId) {
      nextPayload.object_id = survivorRecordId;
      changed = true;
    }
    if (changed) record.payload = nextPayload;
  }
  const remaining = relationReferrers(byId, removedId).map((record) => record.record_id).sort();
  if (remaining.length > 0) {
    throw new Error(`semantic correction ${correction.correction_id} left references to superseded ${removedId}: ${remaining.join(", ")}`);
  }
  return true;
}

function relationReferrers(byId: Map<string, MtaCanonicalRecord>, recordId: string): MtaCanonicalRecord[] {
  return [...byId.values()].filter(
    (record) => record.record_kind === "relation" && (record.payload.subject_id === recordId || record.payload.object_id === recordId),
  );
}

function firstGuardMismatch(record: MtaCanonicalRecord, guards: SemanticCorrectionGuards): string | undefined {
  for (const [field, expected] of Object.entries(guards.payload ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const actual = record.payload[field];
    if (stableJson((actual ?? null) as JsonValue) !== stableJson((expected ?? null) as JsonValue)) {
      return `guard mismatch on payload.${field}: expected ${stableJson((expected ?? null) as JsonValue)}, found ${stableJson((actual ?? null) as JsonValue)}`;
    }
  }
  return undefined;
}

function skip(summary: SemanticCorrectionApplySummary, issues: MtaValidationIssue[], correction: SemanticCorrectionEntry, message: string): void {
  summary.skipped += 1;
  bump(summary.skippedByOp, correction.op);
  issues.push({
    code: SKIPPED_CODE,
    path: relative(repoRoot, CORRECTIONS_PATH),
    recordId: correction.record_id,
    message: `semantic correction ${correction.correction_id} skipped: ${message}`,
  });
}

function emptySummary(total: number): SemanticCorrectionApplySummary {
  return {
    total,
    applied: 0,
    skipped: 0,
    appliedByOp: {},
    skippedByOp: {},
    appliedBySourceDecision: {},
  };
}

function bump(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function parseSemanticCorrectionEntry(value: unknown, path: string, issues: MtaValidationIssue[]): SemanticCorrectionEntry | undefined {
  if (!isRecord(value)) {
    issues.push({ code: ISSUE_CODE, path, message: "semantic correction entry must be a JSON object" });
    return undefined;
  }

  const correctionId = stringField(value, "correction_id");
  const op = stringField(value, "op");
  const recordId = stringField(value, "record_id");
  const guards = objectField(value, "guards");
  const patch = objectField(value, "patch");
  const cascade = stringArrayField(value, "cascade");
  const reason = stringField(value, "reason");
  const sourceDecision = stringField(value, "source_decision");
  const reviewedAt = stringField(value, "reviewed_at");
  const provenance = stringField(value, "provenance");

  for (const [field, present] of [
    ["correction_id", correctionId],
    ["op", op],
    ["record_id", recordId],
    ["guards", guards],
    ["patch", patch],
    ["cascade", cascade],
    ["reason", reason],
    ["source_decision", sourceDecision],
    ["reviewed_at", reviewedAt],
    ["provenance", provenance],
  ] as const) {
    if (present === undefined) issues.push({ code: ISSUE_CODE, path, message: `semantic correction ${field} must be present and valid` });
  }

  if (op && !OPS.has(op as SemanticCorrectionOp)) issues.push({ code: ISSUE_CODE, path, message: `unknown semantic correction op ${op}` });
  if (provenance && !PROVENANCE.has(provenance as SemanticCorrectionProvenance)) issues.push({ code: ISSUE_CODE, path, message: `unknown semantic correction provenance ${provenance}` });
  if (guards && guards.payload !== undefined && !isRecord(guards.payload)) {
    issues.push({ code: ISSUE_CODE, path, message: "semantic correction guards.payload must be a JSON object when present" });
  }

  if (!correctionId || !op || !recordId || !guards || !patch || !cascade || !reason || !sourceDecision || !reviewedAt || !provenance) {
    return undefined;
  }
  if (!OPS.has(op as SemanticCorrectionOp) || !PROVENANCE.has(provenance as SemanticCorrectionProvenance)) return undefined;
  if (guards.payload !== undefined && !isRecord(guards.payload)) return undefined;

  return {
    correction_id: correctionId,
    op: op as SemanticCorrectionOp,
    record_id: recordId,
    guards: { payload: guards.payload as JsonObject | undefined },
    patch: patch as JsonObject,
    cascade,
    reason,
    source_decision: sourceDecision,
    reviewed_at: reviewedAt,
    provenance: provenance as SemanticCorrectionProvenance,
  };
}

function validatePatchShape(entry: SemanticCorrectionEntry, path: string, recordsById: Map<string, MtaCanonicalRecord> | undefined): MtaValidationIssue[] {
  const issues: MtaValidationIssue[] = [];
  const patch = entry.patch;
  if (entry.op === "retract_record" && Object.keys(patch).length > 0) {
    issues.push({ code: ISSUE_CODE, path, recordId: entry.record_id, message: "retract_record patch must be empty" });
  }
  if (entry.op === "patch_payload" && !objectValue(patch.set)) {
    issues.push({ code: ISSUE_CODE, path, recordId: entry.record_id, message: "patch_payload patch.set must be an object" });
  }
  if (entry.op === "replace_endpoint") {
    if (patch.field !== "subject_id" && patch.field !== "object_id") {
      issues.push({ code: ISSUE_CODE, path, recordId: entry.record_id, message: "replace_endpoint patch.field must be subject_id or object_id" });
    }
    if (typeof patch.to !== "string" || !patch.to.trim()) {
      issues.push({ code: ISSUE_CODE, path, recordId: entry.record_id, message: "replace_endpoint patch.to must be a non-empty string" });
    } else if (recordsById && !recordsById.has(patch.to)) {
      issues.push({ code: ISSUE_CODE, path, recordId: entry.record_id, message: `replace_endpoint target ${patch.to} does not exist before semantic corrections` });
    }
  }
  if (entry.op === "recite_evidence" && !Array.isArray(patch.evidence_refs)) {
    issues.push({ code: ISSUE_CODE, path, recordId: entry.record_id, message: "recite_evidence patch.evidence_refs must be an array" });
  }
  if (entry.op === "set_review_state") {
    if (typeof patch.review_state !== "string" || !patch.review_state.trim()) {
      issues.push({ code: ISSUE_CODE, path, recordId: entry.record_id, message: "set_review_state patch.review_state must be a non-empty string" });
    }
    if (patch.truth_status !== undefined && (typeof patch.truth_status !== "string" || !patch.truth_status.trim())) {
      issues.push({ code: ISSUE_CODE, path, recordId: entry.record_id, message: "set_review_state patch.truth_status must be a non-empty string when present" });
    }
  }
  if (entry.op === "supersede_record") {
    if (typeof patch.survivor_record_id !== "string" || !patch.survivor_record_id.trim()) {
      issues.push({ code: ISSUE_CODE, path, recordId: entry.record_id, message: "supersede_record patch.survivor_record_id must be a non-empty string" });
    } else if (recordsById && !recordsById.has(patch.survivor_record_id)) {
      issues.push({ code: ISSUE_CODE, path, recordId: entry.record_id, message: `supersede survivor ${patch.survivor_record_id} does not exist before semantic corrections` });
    }
  }
  return issues;
}

function cloneRecord(record: MtaCanonicalRecord): MtaCanonicalRecord {
  return JSON.parse(JSON.stringify(record)) as MtaCanonicalRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectValue(value: JsonValue | undefined): JsonObject | undefined {
  return isRecord(value) ? (value as JsonObject) : undefined;
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function objectField(record: Record<string, unknown>, field: string): Record<string, unknown> | undefined {
  const value = record[field];
  return isRecord(value) ? value : undefined;
}

function stringArrayField(record: Record<string, unknown>, field: string): string[] | undefined {
  const value = record[field];
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : undefined;
}
