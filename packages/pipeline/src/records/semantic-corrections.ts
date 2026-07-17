import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaEvidenceRef, MtaValidationIssue } from "@mta-wiki/db/types";

export type SemanticCorrectionOp =
  | "retract_record"
  | "patch_payload"
  | "replace_endpoint"
  | "recite_evidence"
  | "set_record_aliases"
  | "set_review_state"
  | "supersede_record";

export type SemanticCorrectionProvenance = "deterministic_rule" | "llm_triage" | "human";

export type SemanticCorrectionGuards = {
  payload?: JsonObject | undefined;
  record_aliases?: string[] | undefined;
  record_aliases_one_of?: string[][] | undefined;
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
  superseded: number;
  skipped: number;
  appliedByOp: Record<string, number>;
  skippedByOp: Record<string, number>;
  appliedBySourceDecision: Record<string, number>;
};

export type SemanticCorrectionSupersession = {
  correction_id: string;
  superseded_by: string[];
  superseded_by_decisions?: SemanticCorrectionSupersedingDecision[] | undefined;
  reason: string;
};

export type SemanticCorrectionSupersedingDecision = {
  decision_id: string;
  source_path: string;
  source_sha256: string;
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
const SUPERSESSIONS_PATH = join(repoRoot, "data/semantic-corrections/supersessions-v1.json");
const ISSUE_CODE = "invalid_semantic_correction";
const SKIPPED_CODE = "semantic_correction_skipped";
const OPS = new Set<SemanticCorrectionOp>([
  "retract_record",
  "patch_payload",
  "replace_endpoint",
  "recite_evidence",
  "set_record_aliases",
  "set_review_state",
  "supersede_record",
]);
const PROVENANCE = new Set<SemanticCorrectionProvenance>(["deterministic_rule", "llm_triage", "human"]);
const supersedingDecisionSourceCache = new Map<string, Set<string>>();

function parseSupersedingDecisions(
  value: unknown,
  label: string,
): SemanticCorrectionSupersedingDecision[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${label}.superseded_by_decisions must be an array`);
  }
  const decisions = value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`${label}.superseded_by_decisions[${index}] must be an object`);
    }
    const decisionId = stringField(entry, "decision_id");
    const sourcePath = stringField(entry, "source_path");
    const sourceSha256 = stringField(entry, "source_sha256");
    if (
      !decisionId ||
      !sourcePath ||
      !sourceSha256 ||
      !/^[a-f0-9]{64}$/u.test(sourceSha256)
    ) {
      throw new Error(`${label}.superseded_by_decisions[${index}] is invalid`);
    }
    return {
      decision_id: decisionId,
      source_path: sourcePath,
      source_sha256: sourceSha256,
    };
  });
  const keys = decisions.map((decision) =>
    [
      decision.decision_id,
      decision.source_path,
      decision.source_sha256,
    ].join("\0")
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error(`${label}.superseded_by_decisions contains duplicates`);
  }
  return decisions.sort(
    (left, right) =>
      left.decision_id.localeCompare(right.decision_id) ||
      left.source_path.localeCompare(right.source_path),
  );
}

function assertSupersedingDecision(
  decision: SemanticCorrectionSupersedingDecision,
  correctionId: string,
): void {
  if (
    !decision.decision_id.trim() ||
    !decision.source_path.trim() ||
    !/^[a-f0-9]{64}$/u.test(decision.source_sha256) ||
    isAbsolute(decision.source_path)
  ) {
    throw new Error(
      `semantic correction supersession ${correctionId} has an invalid reviewed decision reference`,
    );
  }
  const sourcePath = resolve(repoRoot, decision.source_path);
  const relativeSource = relative(repoRoot, sourcePath);
  if (
    relativeSource === "" ||
    relativeSource.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    relativeSource === ".."
  ) {
    throw new Error(
      `semantic correction supersession ${correctionId} decision source escapes the repository`,
    );
  }
  const cacheKey = `${sourcePath}\0${decision.source_sha256}`;
  let decisionIds = supersedingDecisionSourceCache.get(cacheKey);
  if (!decisionIds) {
    if (!existsSync(sourcePath)) {
      throw new Error(
        `semantic correction supersession ${correctionId} decision source is missing: ${decision.source_path}`,
      );
    }
    const content = readFileSync(sourcePath);
    const actualSha256 = createHash("sha256")
      .update(content)
      .digest("hex");
    if (actualSha256 !== decision.source_sha256) {
      throw new Error(
        `semantic correction supersession ${correctionId} decision source hash mismatch: expected ${decision.source_sha256}, found ${actualSha256}`,
      );
    }
    decisionIds = new Set<string>();
    for (const [lineIndex, line] of content
      .toString("utf8")
      .split(/\r?\n/u)
      .entries()) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        throw new Error(
          `semantic correction supersession decision source ${decision.source_path}:${lineIndex + 1} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (isRecord(parsed)) {
        const id = parsed.decision_id;
        if (typeof id === "string" && id.trim()) decisionIds.add(id);
      }
    }
    supersedingDecisionSourceCache.set(cacheKey, decisionIds);
  }
  if (!decisionIds.has(decision.decision_id)) {
    throw new Error(
      `semantic correction supersession ${correctionId} decision ${decision.decision_id} is absent from ${decision.source_path}`,
    );
  }
}

export function semanticCorrectionsPath(): string {
  return CORRECTIONS_PATH;
}

export function semanticCorrectionsExist(): boolean {
  return existsSync(CORRECTIONS_PATH);
}

export function readSemanticCorrectionSupersessions(
  path = SUPERSESSIONS_PATH,
): SemanticCorrectionSupersession[] {
  if (!existsSync(path)) return [];
  const input = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  if (
    input.schema_version !== 1 ||
    input.contract_id !== "semantic-correction-supersessions-v1" ||
    typeof input.reviewed_at !== "string" ||
    typeof input.reviewed_by !== "string" ||
    typeof input.source_decision !== "string" ||
    !Array.isArray(input.entries)
  ) {
    throw new Error(`Invalid semantic correction supersession contract at ${relative(repoRoot, path)}`);
  }
  const seen = new Set<string>();
  return input.entries.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid semantic correction supersession entry ${index}`);
    const correctionId = stringField(value, "correction_id");
    const supersededBy = stringArrayField(value, "superseded_by");
    const supersededByDecisions = parseSupersedingDecisions(
      value.superseded_by_decisions,
      `semantic correction supersession ${correctionId || index}`,
    );
    const reason = stringField(value, "reason");
    if (
      !correctionId ||
      (!supersededBy?.length && supersededByDecisions.length === 0) ||
      !reason
    ) {
      throw new Error(`Invalid semantic correction supersession entry ${index}`);
    }
    if (seen.has(correctionId)) throw new Error(`Duplicate semantic correction supersession ${correctionId}`);
    seen.add(correctionId);
    return {
      correction_id: correctionId,
      superseded_by: [...new Set(supersededBy ?? [])].sort(),
      superseded_by_decisions:
        supersededByDecisions.length > 0
          ? supersededByDecisions
          : undefined,
      reason,
    };
  }).sort((left, right) => left.correction_id.localeCompare(right.correction_id));
}

export function readSemanticCorrections(): SemanticCorrectionEntry[] {
  const result = readSemanticCorrectionsWithIssues();
  if (result.issues.length > 0) {
    const first = result.issues[0]!;
    throw new Error(`${first.code}: ${first.message}${first.path ? ` (${first.path})` : ""}`);
  }
  return result.entries;
}

/** Resolve the immutable id rewrite surface for the SQLite identity mirror and diagnostics.
 * The authoritative correction journal remains the source; this merely follows transitive
 * supersession chains deterministically and never changes the correction application rules. */
export function semanticSupersessionIdentities(
  corrections: readonly SemanticCorrectionEntry[],
): Array<{ identity: string; canonicalRecordId: string }> {
  const direct = new Map<string, string>();
  for (const correction of corrections) {
    const survivor = correction.op === "supersede_record" ? correction.patch.survivor_record_id : undefined;
    if (typeof survivor === "string" && survivor.trim()) direct.set(correction.record_id, survivor);
  }
  return [...direct.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([identity, firstTarget]) => {
    const visited = new Set([identity]);
    let canonicalRecordId = firstTarget;
    while (direct.has(canonicalRecordId) && !visited.has(canonicalRecordId)) {
      visited.add(canonicalRecordId);
      canonicalRecordId = direct.get(canonicalRecordId)!;
    }
    return { identity, canonicalRecordId };
  });
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
  let supersessions: SemanticCorrectionSupersession[] = [];
  if (path === CORRECTIONS_PATH) {
    try {
      supersessions = readSemanticCorrectionSupersessions();
    } catch (error) {
      issues.push({
        code: ISSUE_CODE,
        path: relative(repoRoot, SUPERSESSIONS_PATH),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
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
      issues.push(...withSemanticCorrections(options.records, result.entries, supersessions).issues);
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

export function withSemanticCorrections(
  records: readonly MtaCanonicalRecord[],
  corrections = readSemanticCorrections(),
  supersessions: readonly SemanticCorrectionSupersession[] = [],
): SemanticCorrectionApplyResult {
  const byId = new Map(records.map((record) => [record.record_id, cloneRecord(record)]));
  const order = records.map((record) => record.record_id);
  const pendingRelationEndpointLocalSync = new Map<string, Set<RelationEndpointRole>>();
  const issues: MtaValidationIssue[] = [];
  const summary = emptySummary(corrections.length);
  const correctionsById = new Map(corrections.map((correction) => [correction.correction_id, correction]));
  const supersessionsById = new Map(supersessions.map((entry) => [entry.correction_id, entry]));
  for (const entry of supersessions) {
    if (!correctionsById.has(entry.correction_id)) {
      throw new Error(`semantic correction supersession references missing correction ${entry.correction_id}`);
    }
    for (const replacementId of entry.superseded_by) {
      if (!correctionsById.has(replacementId)) {
        throw new Error(`semantic correction supersession ${entry.correction_id} references missing replacement ${replacementId}`);
      }
    }
    for (const decision of entry.superseded_by_decisions ?? []) {
      assertSupersedingDecision(decision, entry.correction_id);
    }
    if (
      entry.superseded_by.length === 0 &&
      (entry.superseded_by_decisions?.length ?? 0) === 0
    ) {
      throw new Error(
        `semantic correction supersession ${entry.correction_id} has no replacement correction or reviewed decision`,
      );
    }
  }

  for (const correction of [...corrections].sort((a, b) => a.correction_id.localeCompare(b.correction_id))) {
    if (supersessionsById.has(correction.correction_id)) {
      summary.superseded += 1;
      continue;
    }
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

    const endpointStateBefore = relationEndpointState(record);
    const applied = applyCorrection(byId, correction);
    if (!applied) {
      skip(summary, issues, correction, "correction target is not applicable in the current record set");
      continue;
    }
    trackRelationEndpointLocalSync(
      pendingRelationEndpointLocalSync,
      correction,
      endpointStateBefore,
      byId.get(correction.record_id),
    );
    bump(summary.appliedByOp, correction.op);
    bump(summary.appliedBySourceDecision, correction.source_decision);
    summary.applied += 1;
  }

  for (const entry of supersessions) {
    const correction = correctionsById.get(entry.correction_id)!;
    const record = byId.get(correction.record_id);
    if (record && !firstGuardMismatch(record, correction.guards)) {
      issues.push({
        code: SKIPPED_CODE,
        path: relative(repoRoot, SUPERSESSIONS_PATH),
        recordId: correction.record_id,
        message: `semantic correction supersession ${entry.correction_id} is invalid because the superseded correction remains applicable`,
      });
    }
  }

  synchronizePendingRelationEndpointLocals(byId, pendingRelationEndpointLocalSync);

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
    case "set_record_aliases":
      return setRecordAliases(byId, correction);
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

/**
 * Endpoint-local synchronization is deferred until the complete ordered correction journal has
 * applied. This preserves guard compatibility for reviewed correction chains that first replace an
 * endpoint and then clear its stale source-local pointer. Endpoint writes and explicit null/blank
 * local-pointer writes request synchronization; an explicit non-empty reviewed local pointer cancels
 * that request for the role. The canonical target's primary local observation is deterministic and
 * mirrors the established supersede_record behavior below.
 */
type RelationEndpointRole = "subject" | "object";
type RelationEndpointState = Record<RelationEndpointRole, JsonValue | undefined>;

function relationEndpointState(record: MtaCanonicalRecord): RelationEndpointState | undefined {
  if (record.record_kind !== "relation") return undefined;
  return {
    subject: record.payload.subject_id,
    object: record.payload.object_id,
  };
}

function trackRelationEndpointLocalSync(
  pending: Map<string, Set<RelationEndpointRole>>,
  correction: SemanticCorrectionEntry,
  before: RelationEndpointState | undefined,
  after: MtaCanonicalRecord | undefined,
): void {
  if (!before || !after || after.record_kind !== "relation") return;
  const roles = pending.get(correction.record_id) ?? new Set<RelationEndpointRole>();
  if (correction.op === "replace_endpoint") {
    if (correction.patch.field === "subject_id" && before.subject !== after.payload.subject_id) roles.add("subject");
    if (correction.patch.field === "object_id" && before.object !== after.payload.object_id) roles.add("object");
  }
  if (correction.op === "patch_payload") {
    const set = objectValue(correction.patch.set);
    if (set) {
      for (const role of ["subject", "object"] as const) {
        const endpointField = `${role}_id`;
        const localField = `${role}_local_observation_id`;
        if (Object.hasOwn(set, endpointField) && before[role] !== after.payload[endpointField]) roles.add(role);
        if (!Object.hasOwn(set, localField)) continue;
        const local = set[localField];
        if (local === null || (typeof local === "string" && local.trim() === "")) roles.add(role);
        else if (typeof local === "string") roles.delete(role);
      }
    }
  }
  if (roles.size > 0) pending.set(correction.record_id, roles);
  else pending.delete(correction.record_id);
}

function synchronizePendingRelationEndpointLocals(
  byId: Map<string, MtaCanonicalRecord>,
  pending: ReadonlyMap<string, ReadonlySet<RelationEndpointRole>>,
): void {
  for (const [recordId, roles] of pending) {
    const record = byId.get(recordId);
    if (!record || record.record_kind !== "relation") continue;
    for (const role of roles) {
      const endpointId = record.payload[`${role}_id`];
      if (typeof endpointId !== "string") continue;
      const endpoint = byId.get(endpointId);
      if (endpoint) record.payload[`${role}_local_observation_id`] = endpoint.local_observation_id;
    }
  }
}

function reciteEvidence(byId: Map<string, MtaCanonicalRecord>, correction: SemanticCorrectionEntry): boolean {
  const refs = correction.patch.evidence_refs;
  if (!Array.isArray(refs)) return false;
  const record = byId.get(correction.record_id);
  if (!record) return false;
  record.evidence_refs = refs.map((ref) => ({ ...(ref as MtaEvidenceRef) }));
  return true;
}

function setRecordAliases(byId: Map<string, MtaCanonicalRecord>, correction: SemanticCorrectionEntry): boolean {
  const aliases = correction.patch.record_aliases;
  if (!Array.isArray(aliases) || aliases.some((alias) => typeof alias !== "string" || !alias.trim())) return false;
  const record = byId.get(correction.record_id);
  if (!record) return false;
  const normalized = [...new Set(aliases
    .filter((alias): alias is string => typeof alias === "string" && alias.trim().length > 0)
    .map((alias) => alias.trim()))].sort();
  record.record_aliases = normalized.length > 0 ? normalized : undefined;
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
  const removedRecord = byId.get(removedId);
  const survivorRecord = byId.get(survivorRecordId);
  if (!removedRecord || !survivorRecord) return false;
  if (removedRecord.record_kind !== survivorRecord.record_kind) {
    throw new Error(
      `semantic correction ${correction.correction_id} cannot supersede ${removedRecord.record_kind} ${removedId} ` +
        `with ${survivorRecord.record_kind} ${survivorRecordId}`,
    );
  }
  foldSupersededRecordProvenance(survivorRecord, removedRecord);
  for (const cascadeId of correction.cascade) byId.delete(cascadeId);
  byId.delete(removedId);
  for (const record of byId.values()) {
    if (record.record_kind !== "relation") continue;
    const nextPayload = { ...record.payload };
    let changed = false;
    if (nextPayload.subject_id === removedId) {
      nextPayload.subject_id = survivorRecordId;
      if (typeof nextPayload.subject_local_observation_id === "string") {
        nextPayload.subject_local_observation_id = survivorRecord.local_observation_id;
      }
      changed = true;
    }
    if (nextPayload.object_id === removedId) {
      nextPayload.object_id = survivorRecordId;
      if (typeof nextPayload.object_local_observation_id === "string") {
        nextPayload.object_local_observation_id = survivorRecord.local_observation_id;
      }
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

function foldSupersededRecordProvenance(survivor: MtaCanonicalRecord, removed: MtaCanonicalRecord): void {
  survivor.source_ids = uniqueStrings([
    survivor.source_id,
    ...(survivor.source_ids ?? []),
    removed.source_id,
    ...(removed.source_ids ?? []),
  ]);
  survivor.local_observation_ids = uniqueStrings([
    survivor.local_observation_id,
    ...(survivor.local_observation_ids ?? []),
    removed.local_observation_id,
    ...(removed.local_observation_ids ?? []),
  ]);
  survivor.submission_ids = uniqueStrings([...survivor.submission_ids, ...removed.submission_ids]);

  const evidenceByIdentity = new Map<string, MtaEvidenceRef>();
  for (const ref of [...survivor.evidence_refs, ...removed.evidence_refs]) {
    const identity = stableJson(ref as unknown as JsonValue);
    if (!evidenceByIdentity.has(identity)) evidenceByIdentity.set(identity, { ...ref });
  }
  survivor.evidence_refs = [...evidenceByIdentity.values()];

  survivor.generated_at = latestTimestamp(survivor.generated_at, removed.generated_at);
}

function uniqueStrings(values: readonly string[]): string[] {
  // Match the canonical materializer and SQLite's default binary text order so
  // folded provenance round-trips byte-for-byte through canonical.db.
  return [...new Set(values)].sort();
}

function latestTimestamp(left: string, right: string): string {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime > rightTime ? left : right;
  }
  return left.localeCompare(right) >= 0 ? left : right;
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
  if (guards.record_aliases !== undefined) {
    const actual = [...new Set(record.record_aliases ?? [])].sort();
    const expected = [...new Set(guards.record_aliases)].sort();
    if (stableJson(actual) !== stableJson(expected)) {
      return `guard mismatch on record_aliases: expected ${stableJson(expected)}, found ${stableJson(actual)}`;
    }
  }
  if (guards.record_aliases_one_of !== undefined) {
    const actual = [...new Set(record.record_aliases ?? [])].sort();
    const expectedOptions = guards.record_aliases_one_of
      .map((aliases) => [...new Set(aliases)].sort())
      .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
    if (!expectedOptions.some((expected) => stableJson(actual) === stableJson(expected))) {
      return `guard mismatch on record_aliases: expected one of ${stableJson(expectedOptions)}, found ${stableJson(actual)}`;
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
    superseded: 0,
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
  if (guards && guards.record_aliases !== undefined && !stringArrayValue(guards.record_aliases)) {
    issues.push({ code: ISSUE_CODE, path, message: "semantic correction guards.record_aliases must be a string array when present" });
  }
  if (guards && guards.record_aliases_one_of !== undefined && !stringArrayOptionsValue(guards.record_aliases_one_of)) {
    issues.push({ code: ISSUE_CODE, path, message: "semantic correction guards.record_aliases_one_of must be a non-empty array of non-empty string arrays when present" });
  }
  if (guards && guards.record_aliases !== undefined && guards.record_aliases_one_of !== undefined) {
    issues.push({ code: ISSUE_CODE, path, message: "semantic correction guards must not combine record_aliases and record_aliases_one_of" });
  }

  if (!correctionId || !op || !recordId || !guards || !patch || !cascade || !reason || !sourceDecision || !reviewedAt || !provenance) {
    return undefined;
  }
  if (!OPS.has(op as SemanticCorrectionOp) || !PROVENANCE.has(provenance as SemanticCorrectionProvenance)) return undefined;
  if (guards.payload !== undefined && !isRecord(guards.payload)) return undefined;
  if (guards.record_aliases !== undefined && !stringArrayValue(guards.record_aliases)) return undefined;
  if (guards.record_aliases_one_of !== undefined && !stringArrayOptionsValue(guards.record_aliases_one_of)) return undefined;
  if (guards.record_aliases !== undefined && guards.record_aliases_one_of !== undefined) return undefined;

  return {
    correction_id: correctionId,
    op: op as SemanticCorrectionOp,
    record_id: recordId,
    guards: {
      payload: guards.payload as JsonObject | undefined,
      record_aliases: guards.record_aliases as string[] | undefined,
      record_aliases_one_of: guards.record_aliases_one_of as string[][] | undefined,
    },
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
  if (entry.op === "set_record_aliases" && !stringArrayValue(patch.record_aliases)) {
    issues.push({ code: ISSUE_CODE, path, recordId: entry.record_id, message: "set_record_aliases patch.record_aliases must be a string array" });
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
    } else if (recordsById) {
      const removed = recordsById.get(entry.record_id);
      const survivor = recordsById.get(patch.survivor_record_id);
      if (removed && survivor && removed.record_kind !== survivor.record_kind) {
        issues.push({
          code: ISSUE_CODE,
          path,
          recordId: entry.record_id,
          message: `supersede_record cannot replace ${removed.record_kind} with ${survivor.record_kind}`,
        });
      }
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

function stringArrayValue(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function stringArrayOptionsValue(value: unknown): value is string[][] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => stringArrayValue(entry) && entry.length > 0);
}
