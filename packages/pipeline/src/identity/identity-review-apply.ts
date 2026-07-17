import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  identityOverrideTarget,
  identityPairKey,
  isGlobalRecordKind,
  readIdentityDoNotMergeOverrides,
  readIdentityOverrides,
  type GlobalMtaRecordKind,
} from "@mta-wiki/db/identity";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import {
  GLOBAL_KINDS,
  doNotMergePath,
  mergesPath,
  sortedAliasesWithAdditions,
  sortedDoNotMergeWithAdditions,
  writeJsonFile,
} from "@mta-wiki/pipeline/identity/identity-override-writes";
import type { JsonValue, MtaCanonicalRecord, MtaValidationIssue } from "@mta-wiki/db/types";

type ReviewActionSummary = {
  merge_group_count: number;
  do_not_merge_count: number;
  weak_alias_count: number;
  missing_field_count: number;
  ambiguous_count: number;
  confidence: string;
};

type ReviewDoNotMergeDecision = {
  record_ids: [string, string];
  reason: string;
};

type ReviewWeakAliasDecision = {
  record_id: string;
  aliases: string[];
  reason?: string | undefined;
};

type ReviewMissingFieldDecision = {
  record_id: string;
  fields: string[];
};

export type AcceptedIdentityReviewDecision = {
  path: string;
  version: 1;
  review_state: "accepted" | "corrected";
  accepted_at: string;
  reviewer: string;
  source: string;
  cluster_id: string;
  kind: GlobalMtaRecordKind;
  packet_path: string;
  suggestion_path: string;
  source_review_run_id?: string | undefined;
  model?: string | undefined;
  action_summary: ReviewActionSummary;
  merge_groups: string[][];
  do_not_merge: ReviewDoNotMergeDecision[];
  weak_aliases: ReviewWeakAliasDecision[];
  missing_fields: ReviewMissingFieldDecision[];
  ambiguous: unknown[];
  suggested_rules: string[];
  rationale: string;
};

export type QuarantinedIdentityReviewDecision = {
  path: string;
  version: 1;
  review_state: "quarantined";
  accepted_at: string;
  reviewer: string;
  source: string;
  cluster_id: string;
  kind: GlobalMtaRecordKind;
  packet_path: string;
  suggestion_path: string;
  source_review_run_id?: string | undefined;
  model?: string | undefined;
  quarantine: {
    blocker: string;
    note?: string | undefined;
  };
  original_merge_groups: string[][];
  original_do_not_merge: ReviewDoNotMergeDecision[];
};

export type IdentityReviewAcceptedArtifactsReport = {
  path: string;
  manifest_path: string;
  issues: MtaValidationIssue[];
  counts: {
    accepted: number;
    corrected: number;
    quarantined: number;
    total: number;
  };
  decisions: AcceptedIdentityReviewDecision[];
  quarantined: QuarantinedIdentityReviewDecision[];
};

export type IdentityReviewApplyOptions = {
  dryRun?: boolean | undefined;
  force?: boolean | undefined;
  subject?: string | undefined;
  include?: string | undefined;
  exclude?: string | undefined;
  limit?: number | undefined;
};

export type IdentityReviewAliasPlan = {
  kind: GlobalMtaRecordKind;
  alias: string;
  target: string;
  cluster_id: string;
  decision_path: string;
  merge_group: string[];
};

export type IdentityReviewDoNotMergePlan = {
  kind: GlobalMtaRecordKind;
  record_ids: [string, string];
  reason: string;
  cluster_id: string;
  decision_path: string;
  reviewed_at: string;
};

export type IdentityReviewApplyConflict = {
  kind: GlobalMtaRecordKind;
  record_id: string;
  existing_target: string;
  proposed_target: string;
  cluster_id: string;
  decision_path: string;
};

export type IdentityReviewApplyReport = {
  generated_at: string;
  dry_run: boolean;
  wrote: boolean;
  paths: {
    accepted_dir: string;
    merges_path: string;
    do_not_merge_path: string;
  };
  selected_decision_count: number;
  quarantined_decision_count: number;
  validation_issues: MtaValidationIssue[];
  merge_group_count: number;
  do_not_merge_count: number;
  alias_additions: IdentityReviewAliasPlan[];
  aliases_already_present: IdentityReviewAliasPlan[];
  do_not_merge_additions: IdentityReviewDoNotMergePlan[];
  do_not_merge_already_present: IdentityReviewDoNotMergePlan[];
  conflicts: IdentityReviewApplyConflict[];
};

function relativePath(path: string) {
  return relative(repoRoot, path).split("/").join("/");
}

function acceptedDir() {
  return join(repoRoot, "data", "identity-review", "accepted");
}

function decisionsDir() {
  return join(acceptedDir(), "decisions");
}

function quarantineDir() {
  return join(acceptedDir(), "quarantine");
}

function issue(issues: MtaValidationIssue[], code: string, message: string, path?: string | undefined) {
  issues.push({
    code,
    message,
    ...(path ? { path: relativePath(path) } : {}),
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonObject(path: string, issues: MtaValidationIssue[], code: string) {
  if (!existsSync(path)) {
    issue(issues, code, `Missing JSON artifact: ${relativePath(path)}`, path);
    return undefined;
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isObject(parsed)) {
      issue(issues, code, "JSON artifact must be an object.", path);
      return undefined;
    }
    return parsed;
  } catch (error) {
    issue(issues, code, `Unable to parse JSON artifact: ${error instanceof Error ? error.message : String(error)}`, path);
    return undefined;
  }
}

function jsonFiles(dir: string) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(dir, name));
}

function requiredString(object: Record<string, unknown>, field: string, path: string, issues: MtaValidationIssue[], code: string) {
  const value = object[field];
  if (typeof value === "string" && value.trim()) return value;
  issue(issues, code, `Field ${field} must be a non-empty string.`, path);
  return "";
}

function optionalString(object: Record<string, unknown>, field: string, path: string, issues: MtaValidationIssue[], code: string) {
  const value = object[field];
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  issue(issues, code, `Field ${field} must be a string when present.`, path);
  return undefined;
}

function requiredNumber(object: Record<string, unknown>, field: string, path: string, issues: MtaValidationIssue[], code: string) {
  const value = object[field];
  if (Number.isInteger(value) && typeof value === "number") return value;
  issue(issues, code, `Field ${field} must be an integer.`, path);
  return 0;
}

function stringArray(value: unknown, field: string, path: string, issues: MtaValidationIssue[], code: string) {
  if (!Array.isArray(value)) {
    issue(issues, code, `Field ${field} must be an array of strings.`, path);
    return [];
  }

  const values: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry === "string" && entry.trim()) {
      values.push(entry);
      continue;
    }
    issue(issues, code, `Field ${field}[${index}] must be a non-empty string.`, path);
  }
  return values;
}

function stringMatrix(value: unknown, field: string, path: string, issues: MtaValidationIssue[], code: string, kind: GlobalMtaRecordKind) {
  if (!Array.isArray(value)) {
    issue(issues, code, `Field ${field} must be an array of record-id arrays.`, path);
    return [];
  }

  const groups: string[][] = [];
  for (const [index, entry] of value.entries()) {
    const group = stringArray(entry, `${field}[${index}]`, path, issues, code);
    if (group.length < 2) {
      issue(issues, code, `Field ${field}[${index}] must contain at least two record ids.`, path);
    }
    validateRecordIds(group, kind, `${field}[${index}]`, path, issues, code);
    if (new Set(group).size !== group.length) {
      issue(issues, code, `Field ${field}[${index}] must not contain duplicate record ids.`, path);
    }
    groups.push([...new Set(group)]);
  }
  return groups;
}

function validateRecordIds(ids: string[], kind: GlobalMtaRecordKind, field: string, path: string, issues: MtaValidationIssue[], code: string) {
  for (const id of ids) {
    if (id.startsWith(`${kind}_`)) continue;
    issue(issues, code, `Field ${field} contains ${id}, which does not match kind ${kind}.`, path);
  }
}

function parseDoNotMergeArray(value: unknown, field: string, path: string, issues: MtaValidationIssue[], code: string, kind: GlobalMtaRecordKind) {
  if (!Array.isArray(value)) {
    issue(issues, code, `Field ${field} must be an array.`, path);
    return [];
  }

  const decisions: ReviewDoNotMergeDecision[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    if (!isObject(entry)) {
      issue(issues, code, `Field ${field}[${index}] must be an object.`, path);
      continue;
    }

    const ids = stringArray(entry.record_ids, `${field}[${index}].record_ids`, path, issues, code);
    if (ids.length !== 2) {
      issue(issues, code, `Field ${field}[${index}].record_ids must contain exactly two record ids.`, path);
      continue;
    }
    validateRecordIds(ids, kind, `${field}[${index}].record_ids`, path, issues, code);
    const key = identityPairKey(ids[0]!, ids[1]!);
    if (seen.has(key)) {
      issue(issues, code, `Field ${field} repeats do-not-merge pair ${key}.`, path);
    }
    seen.add(key);
    decisions.push({
      record_ids: [ids[0]!, ids[1]!],
      reason: requiredString(entry, "reason", path, issues, code),
    });
  }
  return decisions;
}

function parseWeakAliases(value: unknown, path: string, issues: MtaValidationIssue[], code: string, kind: GlobalMtaRecordKind) {
  if (!Array.isArray(value)) {
    issue(issues, code, "Field weak_aliases must be an array.", path);
    return [];
  }

  const aliases: ReviewWeakAliasDecision[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isObject(entry)) {
      issue(issues, code, `Field weak_aliases[${index}] must be an object.`, path);
      continue;
    }

    const recordId = requiredString(entry, "record_id", path, issues, code);
    validateRecordIds(recordId ? [recordId] : [], kind, `weak_aliases[${index}].record_id`, path, issues, code);
    aliases.push({
      record_id: recordId,
      aliases: stringArray(entry.aliases, `weak_aliases[${index}].aliases`, path, issues, code),
      reason: optionalString(entry, "reason", path, issues, code),
    });
  }
  return aliases;
}

function parseMissingFields(value: unknown, path: string, issues: MtaValidationIssue[], code: string, kind: GlobalMtaRecordKind) {
  if (!Array.isArray(value)) {
    issue(issues, code, "Field missing_fields must be an array.", path);
    return [];
  }

  const missing: ReviewMissingFieldDecision[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isObject(entry)) {
      issue(issues, code, `Field missing_fields[${index}] must be an object.`, path);
      continue;
    }

    const recordId = requiredString(entry, "record_id", path, issues, code);
    validateRecordIds(recordId ? [recordId] : [], kind, `missing_fields[${index}].record_id`, path, issues, code);
    missing.push({
      record_id: recordId,
      fields: stringArray(entry.fields, `missing_fields[${index}].fields`, path, issues, code),
    });
  }
  return missing;
}

function parseActionSummary(value: unknown, path: string, issues: MtaValidationIssue[], code: string) {
  if (!isObject(value)) {
    issue(issues, code, "Field action_summary must be an object.", path);
    return {
      merge_group_count: 0,
      do_not_merge_count: 0,
      weak_alias_count: 0,
      missing_field_count: 0,
      ambiguous_count: 0,
      confidence: "",
    };
  }

  return {
    merge_group_count: requiredNumber(value, "merge_group_count", path, issues, code),
    do_not_merge_count: requiredNumber(value, "do_not_merge_count", path, issues, code),
    weak_alias_count: requiredNumber(value, "weak_alias_count", path, issues, code),
    missing_field_count: requiredNumber(value, "missing_field_count", path, issues, code),
    ambiguous_count: requiredNumber(value, "ambiguous_count", path, issues, code),
    confidence: requiredString(value, "confidence", path, issues, code),
  };
}

function parseCommonReviewFields(object: Record<string, unknown>, path: string, issues: MtaValidationIssue[], code: string) {
  const version = object.version;
  if (version !== 1) {
    issue(issues, code, "Field version must be 1.", path);
  }

  const clusterId = requiredString(object, "cluster_id", path, issues, code);
  const expectedClusterId = basename(path).replace(/\.json$/u, "");
  if (clusterId && clusterId !== expectedClusterId) {
    issue(issues, code, `Field cluster_id must match file name ${expectedClusterId}.`, path);
  }

  const rawKind = requiredString(object, "kind", path, issues, code);
  const kind = isGlobalRecordKind(rawKind) ? rawKind : undefined;
  if (!kind) {
    issue(issues, code, `Field kind must be one of ${GLOBAL_KINDS.join(", ")}.`, path);
  }

  return {
    version: 1 as const,
    accepted_at: requiredString(object, "accepted_at", path, issues, code),
    reviewer: requiredString(object, "reviewer", path, issues, code),
    source: requiredString(object, "source", path, issues, code),
    cluster_id: clusterId,
    kind,
    packet_path: requiredString(object, "packet_path", path, issues, code),
    suggestion_path: requiredString(object, "suggestion_path", path, issues, code),
    source_review_run_id: optionalString(object, "source_review_run_id", path, issues, code),
    model: optionalString(object, "model", path, issues, code),
  };
}

function validateSummaryCounts(
  summary: ReviewActionSummary,
  decision: Pick<AcceptedIdentityReviewDecision, "merge_groups" | "do_not_merge" | "weak_aliases" | "missing_fields" | "ambiguous">,
  path: string,
  issues: MtaValidationIssue[],
  code: string,
) {
  const comparisons = [
    ["merge_group_count", summary.merge_group_count, decision.merge_groups.length],
    ["do_not_merge_count", summary.do_not_merge_count, decision.do_not_merge.length],
    ["weak_alias_count", summary.weak_alias_count, decision.weak_aliases.length],
    ["missing_field_count", summary.missing_field_count, decision.missing_fields.length],
    ["ambiguous_count", summary.ambiguous_count, decision.ambiguous.length],
  ] as const;

  for (const [field, expected, actual] of comparisons) {
    if (expected === actual) continue;
    issue(issues, code, `action_summary.${field} is ${expected}, but parsed actions contain ${actual}.`, path);
  }
}

function validateMergePairOverlap(decision: AcceptedIdentityReviewDecision, path: string, issues: MtaValidationIssue[], code: string) {
  const mergePairs = new Set<string>();
  for (const group of decision.merge_groups) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        mergePairs.add(identityPairKey(group[i]!, group[j]!));
      }
    }
  }

  for (const entry of decision.do_not_merge) {
    const key = identityPairKey(entry.record_ids[0], entry.record_ids[1]);
    if (!mergePairs.has(key)) continue;
    issue(issues, code, `Pair ${key} appears in both merge_groups and do_not_merge.`, path);
  }
}

function parseAcceptedDecision(path: string, issues: MtaValidationIssue[]): AcceptedIdentityReviewDecision | undefined {
  const code = "invalid_identity_review_decision";
  const object = readJsonObject(path, issues, code);
  if (!object) return undefined;

  const state = requiredString(object, "review_state", path, issues, code);
  if (state !== "accepted" && state !== "corrected") {
    issue(issues, code, "Decision files must have review_state accepted or corrected.", path);
    return undefined;
  }

  const common = parseCommonReviewFields(object, path, issues, code);
  if (!common.kind) return undefined;

  const actionSummary = parseActionSummary(object.action_summary, path, issues, code);
  const ambiguous = Array.isArray(object.ambiguous) ? object.ambiguous : [];
  if (!Array.isArray(object.ambiguous)) {
    issue(issues, code, "Field ambiguous must be an array.", path);
  }

  const decision: AcceptedIdentityReviewDecision = {
    ...common,
    path: relativePath(path),
    review_state: state,
    kind: common.kind,
    action_summary: actionSummary,
    merge_groups: stringMatrix(object.merge_groups, "merge_groups", path, issues, code, common.kind),
    do_not_merge: parseDoNotMergeArray(object.do_not_merge, "do_not_merge", path, issues, code, common.kind),
    weak_aliases: parseWeakAliases(object.weak_aliases, path, issues, code, common.kind),
    missing_fields: parseMissingFields(object.missing_fields, path, issues, code, common.kind),
    ambiguous,
    suggested_rules: stringArray(object.suggested_rules ?? [], "suggested_rules", path, issues, code),
    rationale: requiredString(object, "rationale", path, issues, code),
  };

  validateSummaryCounts(actionSummary, decision, path, issues, code);
  validateMergePairOverlap(decision, path, issues, code);
  return decision;
}

function parseQuarantineDecision(path: string, issues: MtaValidationIssue[]): QuarantinedIdentityReviewDecision | undefined {
  const code = "invalid_identity_review_quarantine";
  const object = readJsonObject(path, issues, code);
  if (!object) return undefined;

  const state = requiredString(object, "review_state", path, issues, code);
  if (state !== "quarantined") {
    issue(issues, code, "Quarantine files must have review_state quarantined.", path);
    return undefined;
  }

  const common = parseCommonReviewFields(object, path, issues, code);
  if (!common.kind) return undefined;
  if (!isObject(object.quarantine)) {
    issue(issues, code, "Field quarantine must be an object.", path);
  }
  const quarantine = isObject(object.quarantine) ? object.quarantine : {};

  return {
    ...common,
    path: relativePath(path),
    review_state: "quarantined" as const,
    kind: common.kind,
    quarantine: {
      blocker: requiredString(quarantine, "blocker", path, issues, code),
      note: optionalString(quarantine, "note", path, issues, code),
    },
    original_merge_groups: stringMatrix(object.original_merge_groups, "original_merge_groups", path, issues, code, common.kind),
    original_do_not_merge: parseDoNotMergeArray(object.original_do_not_merge, "original_do_not_merge", path, issues, code, common.kind),
  };
}

function manifestPath() {
  return join(acceptedDir(), "manifest.json");
}

function manifestEntries(value: unknown, field: string, path: string, issues: MtaValidationIssue[]) {
  const code = "invalid_identity_review_manifest";
  if (!Array.isArray(value)) {
    issue(issues, code, `Field ${field} must be an array.`, path);
    return [];
  }

  const entries: Array<{ cluster_id: string; kind: string; review_state: string; path: string; blocker?: string | undefined }> = [];
  for (const [index, entry] of value.entries()) {
    if (!isObject(entry)) {
      issue(issues, code, `Field ${field}[${index}] must be an object.`, path);
      continue;
    }
    entries.push({
      cluster_id: requiredString(entry, "cluster_id", path, issues, code),
      kind: requiredString(entry, "kind", path, issues, code),
      review_state: requiredString(entry, "review_state", path, issues, code),
      path: requiredString(entry, "path", path, issues, code),
      blocker: optionalString(entry, "blocker", path, issues, code),
    });
  }
  return entries;
}

function validateManifest(
  decisions: AcceptedIdentityReviewDecision[],
  quarantined: QuarantinedIdentityReviewDecision[],
  issues: MtaValidationIssue[],
) {
  const path = manifestPath();
  const code = "invalid_identity_review_manifest";
  const manifest = readJsonObject(path, issues, code);
  if (!manifest) return;

  if (manifest.version !== 1) {
    issue(issues, code, "Field version must be 1.", path);
  }

  if (!isObject(manifest.counts)) {
    issue(issues, code, "Field counts must be an object.", path);
    return;
  }

  const accepted = requiredNumber(manifest.counts, "accepted", path, issues, code);
  const corrected = requiredNumber(manifest.counts, "corrected", path, issues, code);
  const quarantinedCount = requiredNumber(manifest.counts, "quarantined", path, issues, code);
  const total = requiredNumber(manifest.counts, "total", path, issues, code);
  const actualAccepted = decisions.filter((decision) => decision.review_state === "accepted").length;
  const actualCorrected = decisions.filter((decision) => decision.review_state === "corrected").length;

  const countChecks = [
    ["accepted", accepted, actualAccepted],
    ["corrected", corrected, actualCorrected],
    ["quarantined", quarantinedCount, quarantined.length],
    ["total", total, decisions.length + quarantined.length],
  ] as const;

  for (const [field, expected, actual] of countChecks) {
    if (expected === actual) continue;
    issue(issues, code, `counts.${field} is ${expected}, but artifact files contain ${actual}.`, path);
  }

  const decisionPaths = new Set(decisions.map((decision) => decision.path));
  const quarantinePaths = new Set(quarantined.map((decision) => decision.path));
  const acceptedEntries = manifestEntries(manifest.accepted, "accepted", path, issues);
  const quarantineEntries = manifestEntries(manifest.quarantined, "quarantined", path, issues);

  for (const entry of acceptedEntries) {
    if (entry.review_state !== "accepted" && entry.review_state !== "corrected") {
      issue(issues, code, `Manifest accepted entry ${entry.cluster_id} has invalid review_state ${entry.review_state}.`, path);
    }
    if (!decisionPaths.has(entry.path)) {
      issue(issues, code, `Manifest accepted entry points to missing decision file ${entry.path}.`, path);
    }
  }

  for (const decisionPath of decisionPaths) {
    if (acceptedEntries.some((entry) => entry.path === decisionPath)) continue;
    issue(issues, code, `Decision file ${decisionPath} is not listed in manifest.accepted.`, path);
  }

  for (const entry of quarantineEntries) {
    if (entry.review_state !== "quarantined") {
      issue(issues, code, `Manifest quarantine entry ${entry.cluster_id} has invalid review_state ${entry.review_state}.`, path);
    }
    if (!entry.blocker) {
      issue(issues, code, `Manifest quarantine entry ${entry.cluster_id} must include blocker.`, path);
    }
    if (!quarantinePaths.has(entry.path)) {
      issue(issues, code, `Manifest quarantine entry points to missing quarantine file ${entry.path}.`, path);
    }
  }

  for (const quarantinePathValue of quarantinePaths) {
    if (quarantineEntries.some((entry) => entry.path === quarantinePathValue)) continue;
    issue(issues, code, `Quarantine file ${quarantinePathValue} is not listed in manifest.quarantined.`, path);
  }
}

export function validateIdentityReviewAcceptedArtifacts(): IdentityReviewAcceptedArtifactsReport {
  const base = acceptedDir();
  const manifest = manifestPath();
  const issues: MtaValidationIssue[] = [];
  if (!existsSync(base)) {
    return {
      path: relativePath(base),
      manifest_path: relativePath(manifest),
      issues,
      counts: { accepted: 0, corrected: 0, quarantined: 0, total: 0 },
      decisions: [],
      quarantined: [],
    };
  }

  const decisions = jsonFiles(decisionsDir())
    .map((path) => parseAcceptedDecision(path, issues))
    .filter((decision): decision is AcceptedIdentityReviewDecision => Boolean(decision));
  const quarantined = jsonFiles(quarantineDir())
    .map((path) => parseQuarantineDecision(path, issues))
    .filter((decision): decision is QuarantinedIdentityReviewDecision => Boolean(decision));

  validateManifest(decisions, quarantined, issues);

  return {
    path: relativePath(base),
    manifest_path: relativePath(manifest),
    issues,
    counts: {
      accepted: decisions.filter((decision) => decision.review_state === "accepted").length,
      corrected: decisions.filter((decision) => decision.review_state === "corrected").length,
      quarantined: quarantined.length,
      total: decisions.length + quarantined.length,
    },
    decisions,
    quarantined,
  };
}

function validateKindMap(value: unknown, field: string, path: string, issues: MtaValidationIssue[], code: string) {
  if (value === undefined) return;
  if (!isObject(value)) {
    issue(issues, code, `Field ${field} must be an object keyed by record kind.`, path);
    return;
  }

  for (const kind of Object.keys(value)) {
    if (isGlobalRecordKind(kind)) continue;
    issue(issues, code, `Field ${field} contains unknown global record kind ${kind}.`, path);
  }
}

function validateAliasOverrides(issues: MtaValidationIssue[]) {
  const path = mergesPath();
  if (!existsSync(path)) return;

  const code = "invalid_identity_override_merges";
  const object = readJsonObject(path, issues, code);
  if (!object) return;
  if (object.version !== 1) {
    issue(issues, code, "Field version must be 1.", path);
  }
  validateKindMap(object.aliases, "aliases", path, issues, code);
  if (!isObject(object.aliases)) return;

  for (const [kind, aliases] of Object.entries(object.aliases)) {
    if (!isGlobalRecordKind(kind) || !isObject(aliases)) continue;
    for (const [alias, target] of Object.entries(aliases)) {
      if (typeof target !== "string" || !target.trim()) {
        issue(issues, code, `Alias ${kind}.${alias} must point to a non-empty string target.`, path);
        continue;
      }
      validateRecordIds([alias, target], kind, `aliases.${kind}`, path, issues, code);
      if (alias === target) {
        issue(issues, code, `Alias ${kind}.${alias} points to itself.`, path);
      }
    }

    for (const alias of Object.keys(aliases)) {
      const seen = new Set<string>([alias]);
      let next = aliases[alias];
      while (typeof next === "string" && isObject(aliases) && aliases[next] !== undefined) {
        if (seen.has(next)) {
          issue(issues, code, `Alias cycle detected for ${kind}.${alias}.`, path);
          break;
        }
        seen.add(next);
        next = aliases[next];
      }
    }
  }
}

function validateDoNotMergeOverrides(issues: MtaValidationIssue[]) {
  const path = doNotMergePath();
  if (!existsSync(path)) return;

  const code = "invalid_identity_override_do_not_merge";
  const object = readJsonObject(path, issues, code);
  if (!object) return;
  if (object.version !== 1) {
    issue(issues, code, "Field version must be 1.", path);
  }
  validateKindMap(object.pairs, "pairs", path, issues, code);
  if (!isObject(object.pairs)) return;

  for (const [kind, entries] of Object.entries(object.pairs)) {
    if (!isGlobalRecordKind(kind)) continue;
    parseDoNotMergeArray(entries, `pairs.${kind}`, path, issues, code, kind);
  }
}

export function validateIdentityOverrideArtifacts() {
  const issues: MtaValidationIssue[] = [];
  validateAliasOverrides(issues);
  validateDoNotMergeOverrides(issues);
  return issues;
}

function includeDecision(decision: AcceptedIdentityReviewDecision, options: IdentityReviewApplyOptions) {
  if (options.subject) {
    const normalized = basename(options.subject).replace(/\.json$/u, "");
    if (normalized !== decision.cluster_id && normalized !== basename(decision.path).replace(/\.json$/u, "")) return false;
  }

  const include = options.include ? new RegExp(options.include, "iu") : undefined;
  const exclude = options.exclude ? new RegExp(options.exclude, "iu") : undefined;
  const haystack = [
    decision.cluster_id,
    decision.kind,
    decision.path,
    decision.rationale,
    ...decision.merge_groups.flat(),
    ...decision.do_not_merge.flatMap((entry) => entry.record_ids),
  ].join("\n");

  if (include && !include.test(haystack)) return false;
  if (exclude && exclude.test(haystack)) return false;
  return true;
}

function payloadFieldCount(value: JsonValue | undefined): number {
  if (value === undefined || value === null || typeof value !== "object") return value === undefined ? 0 : 1;
  let count = 0;
  const entries = Array.isArray(value) ? value : Object.values(value);
  for (const entry of entries) {
    count += payloadFieldCount(entry);
  }
  return count;
}

function isProvenanceScopedId(id: string) {
  return /-(?:ace|addendum-update|entity-update-\d{4}|nyct-\d{4}|open-data-plan|queens|update-\d{4}|\d{4})$/u.test(id);
}

function targetScore(kind: GlobalMtaRecordKind, id: string, group: string[], recordsById: Map<string, MtaCanonicalRecord>) {
  const record = recordsById.get(id);
  let score = 0;
  if (record) {
    score += 1_000;
    score += (record.source_ids?.length ?? 1) * 100;
    score += (record.local_observation_ids?.length ?? 1) * 20;
    score += record.submission_ids.length * 50;
    score += record.evidence_refs.length * 15;
    score += payloadFieldCount(record.payload) * 5;
    if (record.display_name !== record.local_observation_id) score += 10;
  }
  if (!/_\d+$/u.test(id)) score += 25;
  score += isProvenanceScopedId(id) ? -100 : 350;
  for (const groupId of group) {
    if (identityOverrideTarget(kind, groupId) === id) score += 10_000;
  }
  return score;
}

function chooseMergeTarget(kind: GlobalMtaRecordKind, group: string[], recordsById: Map<string, MtaCanonicalRecord>) {
  return [...group].sort((a, b) => {
    const scoreDiff = targetScore(kind, b, group, recordsById) - targetScore(kind, a, group, recordsById);
    if (scoreDiff !== 0) return scoreDiff;
    return a.length - b.length || a.localeCompare(b);
  })[0]!;
}

function sortAliasPlan(a: IdentityReviewAliasPlan, b: IdentityReviewAliasPlan) {
  return a.kind.localeCompare(b.kind) || a.target.localeCompare(b.target) || a.alias.localeCompare(b.alias) || a.cluster_id.localeCompare(b.cluster_id);
}

function sortDoNotMergePlan(a: IdentityReviewDoNotMergePlan, b: IdentityReviewDoNotMergePlan) {
  return (
    a.kind.localeCompare(b.kind) ||
    a.record_ids[0].localeCompare(b.record_ids[0]) ||
    a.record_ids[1].localeCompare(b.record_ids[1]) ||
    a.cluster_id.localeCompare(b.cluster_id)
  );
}

function mergePlans(decisions: AcceptedIdentityReviewDecision[]) {
  const recordsById = new Map(readCanonicalRecords().map((record) => [record.record_id, record]));
  const currentAliases = readIdentityOverrides().aliases ?? {};
  const aliasAdditions: IdentityReviewAliasPlan[] = [];
  const aliasesAlreadyPresent: IdentityReviewAliasPlan[] = [];
  const conflicts: IdentityReviewApplyConflict[] = [];

  for (const decision of decisions) {
    for (const mergeGroup of decision.merge_groups) {
      const group = [...new Set(mergeGroup)].sort();
      const target = chooseMergeTarget(decision.kind, group, recordsById);
      for (const alias of group) {
        if (alias === target) continue;
        const existingTarget = currentAliases[decision.kind]?.[alias];
        const resolvedTarget = identityOverrideTarget(decision.kind, alias);
        const plan: IdentityReviewAliasPlan = {
          kind: decision.kind,
          alias,
          target,
          cluster_id: decision.cluster_id,
          decision_path: decision.path,
          merge_group: group,
        };

        if (existingTarget === target || resolvedTarget === target) {
          aliasesAlreadyPresent.push(plan);
          continue;
        }
        if (existingTarget && existingTarget !== target) {
          conflicts.push({
            kind: decision.kind,
            record_id: alias,
            existing_target: existingTarget,
            proposed_target: target,
            cluster_id: decision.cluster_id,
            decision_path: decision.path,
          });
          continue;
        }
        aliasAdditions.push(plan);
      }
    }
  }

  return {
    aliasAdditions: aliasAdditions.sort(sortAliasPlan),
    aliasesAlreadyPresent: aliasesAlreadyPresent.sort(sortAliasPlan),
    conflicts,
  };
}

function doNotMergePlans(decisions: AcceptedIdentityReviewDecision[]) {
  const additions: IdentityReviewDoNotMergePlan[] = [];
  const alreadyPresent: IdentityReviewDoNotMergePlan[] = [];
  const seen = new Set<string>();

  for (const decision of decisions) {
    for (const entry of decision.do_not_merge) {
      const recordIds = [...entry.record_ids].sort() as [string, string];
      const key = `${decision.kind}\0${identityPairKey(recordIds[0], recordIds[1])}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const plan: IdentityReviewDoNotMergePlan = {
        kind: decision.kind,
        record_ids: recordIds,
        reason: entry.reason,
        cluster_id: decision.cluster_id,
        decision_path: decision.path,
        reviewed_at: decision.accepted_at,
      };

      if (readIdentityDoNotMergeOverrides().pairs?.[decision.kind]?.some((existing) => {
        const ids = existing.record_ids;
        return Array.isArray(ids) && ids.length === 2 && identityPairKey(ids[0]!, ids[1]!) === identityPairKey(recordIds[0], recordIds[1]);
      })) {
        alreadyPresent.push(plan);
      } else {
        additions.push(plan);
      }
    }
  }

  return {
    additions: additions.sort(sortDoNotMergePlan),
    alreadyPresent: alreadyPresent.sort(sortDoNotMergePlan),
  };
}

export function applyIdentityReviewDecisions(options: IdentityReviewApplyOptions = {}): IdentityReviewApplyReport {
  const review = validateIdentityReviewAcceptedArtifacts();
  const overrideIssues = validateIdentityOverrideArtifacts();
  const validationIssues = [...review.issues, ...overrideIssues];
  const allSelected = review.decisions.filter((decision) => includeDecision(decision, options));
  const selected = options.limit ? allSelected.slice(0, options.limit) : allSelected;
  const merges = mergePlans(selected);
  const doNotMerge = doNotMergePlans(selected);
  const dryRun = options.dryRun || !options.force;

  let wrote = false;
  if (!dryRun && validationIssues.length === 0 && merges.conflicts.length === 0) {
    writeJsonFile(mergesPath(), sortedAliasesWithAdditions(merges.aliasAdditions));
    writeJsonFile(
      doNotMergePath(),
      sortedDoNotMergeWithAdditions(
        doNotMerge.additions.map((addition) => ({
          kind: addition.kind,
          record_ids: addition.record_ids,
          reason: addition.reason,
          source_decision: addition.decision_path,
          reviewed_at: addition.reviewed_at,
        })),
      ),
    );
    wrote = true;
  }

  return {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    wrote,
    paths: {
      accepted_dir: relativePath(acceptedDir()),
      merges_path: relativePath(mergesPath()),
      do_not_merge_path: relativePath(doNotMergePath()),
    },
    selected_decision_count: selected.length,
    quarantined_decision_count: review.quarantined.length,
    validation_issues: validationIssues,
    merge_group_count: selected.reduce((sum, decision) => sum + decision.merge_groups.length, 0),
    do_not_merge_count: selected.reduce((sum, decision) => sum + decision.do_not_merge.length, 0),
    alias_additions: merges.aliasAdditions,
    aliases_already_present: merges.aliasesAlreadyPresent,
    do_not_merge_additions: doNotMerge.additions,
    do_not_merge_already_present: doNotMerge.alreadyPresent,
    conflicts: merges.conflicts,
  };
}

export function identityDoNotMergeOverrideIssueSuppressed(kind: string, leftRecordId: string, rightRecordId: string) {
  if (!isGlobalRecordKind(kind)) return false;

  const resolvedPair = identityPairKey(
    identityOverrideTarget(kind, leftRecordId) ?? leftRecordId,
    identityOverrideTarget(kind, rightRecordId) ?? rightRecordId,
  );

  return isGlobalRecordKind(kind) && readIdentityDoNotMergeOverrides().pairs?.[kind]?.some((entry) => {
    const ids = entry.record_ids;
    if (!Array.isArray(ids) || ids.length !== 2) return false;
    return (
      identityPairKey(ids[0]!, ids[1]!) === identityPairKey(leftRecordId, rightRecordId) ||
      identityPairKey(identityOverrideTarget(kind, ids[0]!) ?? ids[0]!, identityOverrideTarget(kind, ids[1]!) ?? ids[1]!) === resolvedPair
    );
  });
}
