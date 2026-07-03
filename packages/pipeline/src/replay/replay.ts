import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { kindSpec } from "@mta-wiki/db/kind-registry";
import { stableHash, stableJson } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaEvidenceRef, MtaObservationKind } from "@mta-wiki/db/types";
import { readReleaseRecords, releaseDir } from "@mta-wiki/pipeline/quality/release-quality";

export const DEFAULT_REPLAY_RELEASE_ID = "v1-rc5";
export const DEFAULT_REPLAY_SEED = "v2-replay-v1";
export const DEFAULT_REPLAY_TARGET_SOURCE_COUNT = 150;
export const DEFAULT_REPLAY_RUN_ID = "self-diff-v1-rc5";

export type ReplaySourceStratum = "board_book" | "dot_project_pdf" | "other";

export type ReplaySampleManifestSource = {
  source_id: string;
  stratum: ReplaySourceStratum;
  audit_cited: boolean;
  record_ids: string[];
};

export type ReplaySampleManifest = {
  manifest_version: 1;
  release_id: string;
  seed: string;
  target_source_count: number;
  source_count: number;
  audit: {
    audit_record_count: number;
    audit_cited_source_count: number;
    missing_audit_record_ids: string[];
    all_audit_sources_included: boolean;
  };
  corpus_strata_counts: Record<ReplaySourceStratum, number>;
  selected_strata_counts: Record<ReplaySourceStratum, number>;
  sources: ReplaySampleManifestSource[];
};

export type ReplayEvidenceIdentity = {
  source_id: string;
  block_id: string;
  page_number?: number | undefined;
  role?: string | undefined;
  text_sha256?: string | undefined;
};

export type ReplayProjectedRecord = {
  v1_record_id?: string | undefined;
  record_kind: MtaObservationKind;
  display_name: string;
  raw_text?: string | undefined;
  truth_status: string;
  review_state: string;
  payload: JsonObject;
  relation?: {
    subject_id?: string | undefined;
    object_id?: string | undefined;
    relation_family?: string | undefined;
    relation_kind?: string | undefined;
    assertion_status?: string | undefined;
  } | undefined;
  evidence_refs: ReplayEvidenceIdentity[];
};

export type ReplayBaselineFile = {
  baseline_version: 1;
  release_id: string;
  source_id: string;
  record_count: number;
  records: ReplayProjectedRecord[];
};

export type ReplayDiffStatus = "match" | "field_mismatch" | "missing" | "extra";

export type ReplayDiffEntry = {
  status: ReplayDiffStatus;
  record_kind: MtaObservationKind;
  expected_record_id?: string | undefined;
  actual_record_id?: string | undefined;
  match_key?: string | undefined;
  fields?: string[] | undefined;
};

export type ReplayDiffResult = {
  expected_count: number;
  actual_count: number;
  match: number;
  field_mismatch: number;
  missing: number;
  extra: number;
  entries: ReplayDiffEntry[];
};

export type ReplayCollisionKindSummary = {
  collision_buckets: number;
  records_in_collision_buckets: number;
  projection_distinguishable_buckets: number;
  projection_ambiguous_buckets: number;
};

export type ReplayCollisionSummary = {
  bucket_count: number;
  collision_bucket_count: number;
  records_in_collision_buckets: number;
  by_kind: Partial<Record<MtaObservationKind, ReplayCollisionKindSummary>>;
};

export type ReplayKindAgreement = {
  expected: number;
  actual: number;
  match: number;
  field_mismatch: number;
  missing: number;
  extra: number;
  agreement_rate: number | null;
};

export type ReplaySourceAgreement = ReplayKindAgreement & {
  source_id: string;
};

export type ReplayReport = {
  report_version: 1;
  comparison_projection: {
    version: 2;
    payload: string;
    evidence_refs: string;
    relation: string;
  };
  release_id: string;
  run_id: string;
  seed: string;
  manifest_path: string;
  baseline_dir: string;
  actual_dir: string;
  source_count: number;
  self_diff: boolean;
  totals: ReplayKindAgreement;
  by_kind: Partial<Record<MtaObservationKind, ReplayKindAgreement>>;
  source_rows: ReplaySourceAgreement[];
  mismatch_fields_top: Record<string, number>;
  collision_summary: {
    replay_scope: ReplayCollisionSummary;
    full_release: ReplayCollisionSummary;
  };
  v1_precision_bar: {
    overall_lenient: number;
    route_scoped_relations: number;
    treatment_components: number;
    events: number;
    metric_claims: number;
  };
};

export type ReplayEvalResult = {
  manifest: ReplaySampleManifest;
  manifestPath: string;
  baselineDir: string;
  report: ReplayReport;
  reportPath: string;
  markdownPath: string;
};

type SampleAuditRow = {
  record_id: string;
};

type ReplayDiffItem = {
  record: ReplayProjectedRecord;
  index: number;
  projectionKey: string;
  coarseKeys: string[];
};

function replayRoot(rootDir = repoRoot) {
  return join(rootDir, "data", "replay");
}

export function replayManifestPath(rootDir = repoRoot) {
  return join(replayRoot(rootDir), "sample-manifest.json");
}

export function replayBaselineDir(rootDir = repoRoot) {
  return join(replayRoot(rootDir), "baseline");
}

export function replayReportsDir(rootDir = repoRoot) {
  return join(replayRoot(rootDir), "reports");
}

function writeJson(path: string, value: JsonValue) {
  writeFileSync(path, `${stableJson(value)}\n`, "utf8");
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function qualityAuditPath(releaseId: string, rootDir = repoRoot) {
  return join(rootDir, "data", "quality", releaseId, "sample-audit.jsonl");
}

function sortedUnique(values: Iterable<string>) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function hashForSeed(seed: string, value: string) {
  return createHash("sha256").update(`${seed}:${value}`).digest("hex");
}

function stringValue(value: JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stratumForSource(record: MtaCanonicalRecord | undefined): ReplaySourceStratum {
  if (!record) return "other";
  const sourceId = record.source_id;
  const payload = record.payload;
  const authorityTier = stringValue(payload.authority_tier);
  const publisher = stringValue(payload.publisher)?.toLowerCase() ?? "";
  const contentType = stringValue(payload.content_type)?.toLowerCase() ?? "";
  const title = stringValue(payload.title)?.toLowerCase() ?? record.display_name.toLowerCase();

  if (sourceId.startsWith("meeting_doc_") || authorityTier === "board_material") return "board_book";
  const dotPublisher = publisher.includes("nyc dot") || publisher.includes("nycdot") || publisher.includes("department of transportation");
  const projectPdf = contentType.includes("pdf") || contentType.includes("presentation") || title.includes("presentation");
  return dotPublisher && projectPdf ? "dot_project_pdf" : "other";
}

function blankStrataCounts(): Record<ReplaySourceStratum, number> {
  return { board_book: 0, dot_project_pdf: 0, other: 0 };
}

function evidenceBlockId(ref: MtaEvidenceRef) {
  if (ref.block_id) return ref.block_id;
  if (ref.block_range) return ref.block_range;
  if (ref.evidence_id?.includes("#")) return ref.evidence_id.split("#").slice(1).join("#");
  return ref.evidence_id ?? "";
}

function recordIdsByEvidenceSource(records: MtaCanonicalRecord[]) {
  const bySource = new Map<string, Set<string>>();
  for (const record of records) {
    for (const ref of record.evidence_refs) {
      if (!ref.source_id) continue;
      const bucket = bySource.get(ref.source_id) ?? new Set<string>();
      bucket.add(record.record_id);
      bySource.set(ref.source_id, bucket);
    }
  }
  return bySource;
}

function auditCitedSources(records: MtaCanonicalRecord[], releaseId: string, rootDir = repoRoot) {
  const auditRows = readJsonl<SampleAuditRow>(qualityAuditPath(releaseId, rootDir));
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const sources = new Set<string>();
  const missing: string[] = [];
  for (const row of auditRows) {
    const record = byId.get(row.record_id);
    if (!record) {
      missing.push(row.record_id);
      continue;
    }
    for (const ref of record.evidence_refs) if (ref.source_id) sources.add(ref.source_id);
  }
  return { auditRows, sourceIds: sources, missingRecordIds: sortedUnique(missing) };
}

function sourceRecordsBySourceId(records: MtaCanonicalRecord[]) {
  const bySource = new Map<string, MtaCanonicalRecord>();
  for (const record of records) {
    if (record.record_kind === "source") bySource.set(record.source_id, record);
  }
  return bySource;
}

function targetCountsByStratum(corpusCounts: Record<ReplaySourceStratum, number>, target: number) {
  const total = Object.values(corpusCounts).reduce((sum, count) => sum + count, 0);
  if (total === 0) return blankStrataCounts();
  const raw = Object.entries(corpusCounts).map(([stratum, count]) => ({
    stratum: stratum as ReplaySourceStratum,
    floor: Math.floor((count / total) * target),
    remainder: (count / total) * target - Math.floor((count / total) * target),
  }));
  let allocated = raw.reduce((sum, row) => sum + row.floor, 0);
  for (const row of raw.sort((a, b) => b.remainder - a.remainder || a.stratum.localeCompare(b.stratum))) {
    if (allocated >= target) break;
    row.floor += 1;
    allocated += 1;
  }
  const result = blankStrataCounts();
  for (const row of raw) result[row.stratum] = row.floor;
  return result;
}

export function buildReplaySampleManifest(
  records: MtaCanonicalRecord[],
  options: { releaseId?: string | undefined; seed?: string | undefined; targetSourceCount?: number | undefined; rootDir?: string | undefined } = {},
): ReplaySampleManifest {
  const releaseId = options.releaseId ?? DEFAULT_REPLAY_RELEASE_ID;
  const seed = options.seed ?? DEFAULT_REPLAY_SEED;
  const targetSourceCount = options.targetSourceCount ?? DEFAULT_REPLAY_TARGET_SOURCE_COUNT;
  const rootDir = options.rootDir ?? repoRoot;
  const sourceRecords = sourceRecordsBySourceId(records);
  const recordIdsBySource = recordIdsByEvidenceSource(records);
  const audit = auditCitedSources(records, releaseId, rootDir);

  const corpusStrataCounts = blankStrataCounts();
  for (const source of sourceRecords.values()) corpusStrataCounts[stratumForSource(source)] += 1;

  const selected = new Set(audit.sourceIds);
  const targetCounts = targetCountsByStratum(corpusStrataCounts, targetSourceCount);
  for (const stratum of Object.keys(targetCounts).sort() as ReplaySourceStratum[]) {
    const selectedInStratum = [...selected].filter((sourceId) => stratumForSource(sourceRecords.get(sourceId)) === stratum).length;
    const needed = Math.max(0, targetCounts[stratum] - selectedInStratum);
    if (needed === 0) continue;
    const candidates = [...sourceRecords.keys()]
      .filter((sourceId) => !selected.has(sourceId) && stratumForSource(sourceRecords.get(sourceId)) === stratum)
      .sort((a, b) => hashForSeed(seed, `${stratum}:${a}`).localeCompare(hashForSeed(seed, `${stratum}:${b}`)) || a.localeCompare(b));
    for (const sourceId of candidates.slice(0, needed)) selected.add(sourceId);
  }

  const sources: ReplaySampleManifestSource[] = [...selected]
    .sort((a, b) => a.localeCompare(b))
    .map((sourceId) => ({
      source_id: sourceId,
      stratum: stratumForSource(sourceRecords.get(sourceId)),
      audit_cited: audit.sourceIds.has(sourceId),
      record_ids: sortedUnique(recordIdsBySource.get(sourceId) ?? []),
    }));
  const selectedStrataCounts = blankStrataCounts();
  for (const source of sources) selectedStrataCounts[source.stratum] += 1;

  return {
    manifest_version: 1,
    release_id: releaseId,
    seed,
    target_source_count: targetSourceCount,
    source_count: sources.length,
    audit: {
      audit_record_count: audit.auditRows.length,
      audit_cited_source_count: audit.sourceIds.size,
      missing_audit_record_ids: audit.missingRecordIds,
      all_audit_sources_included: [...audit.sourceIds].every((sourceId) => selected.has(sourceId)),
    },
    corpus_strata_counts: corpusStrataCounts,
    selected_strata_counts: selectedStrataCounts,
    sources,
  };
}

export function writeReplaySampleManifest(
  records: MtaCanonicalRecord[],
  options: { releaseId?: string | undefined; seed?: string | undefined; targetSourceCount?: number | undefined; rootDir?: string | undefined } = {},
) {
  const rootDir = options.rootDir ?? repoRoot;
  const manifest = buildReplaySampleManifest(records, options);
  const path = replayManifestPath(rootDir);
  mkdirSync(replayRoot(rootDir), { recursive: true });
  writeJson(path, manifest as unknown as JsonValue);
  return { manifest, path };
}

function relevantEvidenceRefs(record: MtaCanonicalRecord, sourceId: string): ReplayEvidenceIdentity[] {
  return record.evidence_refs
    .filter((ref) => ref.source_id === sourceId)
    .map((ref) => ({
      source_id: ref.source_id,
      block_id: evidenceBlockId(ref),
      page_number: ref.page_number,
      role: ref.role,
      text_sha256: ref.text_sha256,
    }))
    .filter((ref) => ref.block_id.length > 0)
    .sort(
      (a, b) =>
        a.source_id.localeCompare(b.source_id) ||
        a.block_id.localeCompare(b.block_id) ||
        (a.role ?? "").localeCompare(b.role ?? "") ||
        (a.page_number ?? 0) - (b.page_number ?? 0) ||
        (a.text_sha256 ?? "").localeCompare(b.text_sha256 ?? ""),
    );
}

function relationProjection(record: MtaCanonicalRecord): ReplayProjectedRecord["relation"] {
  if (record.record_kind !== "relation") return undefined;
  return {
    subject_id: stringValue(record.payload.subject_id),
    object_id: stringValue(record.payload.object_id),
    relation_family: stringValue(record.payload.relation_family),
    relation_kind: stringValue(record.payload.relation_kind),
    assertion_status: stringValue(record.payload.assertion_status),
  };
}

export function projectRecordForSource(record: MtaCanonicalRecord, sourceId: string): ReplayProjectedRecord | undefined {
  const refs = relevantEvidenceRefs(record, sourceId);
  if (refs.length === 0) return undefined;
  return {
    v1_record_id: record.record_id,
    record_kind: record.record_kind,
    display_name: record.display_name,
    raw_text: record.raw_text,
    truth_status: record.truth_status,
    review_state: record.review_state,
    payload: record.payload,
    relation: relationProjection(record),
    evidence_refs: refs,
  };
}

export function baselineForSource(records: MtaCanonicalRecord[], releaseId: string, sourceId: string): ReplayBaselineFile {
  const projected = records
    .map((record) => projectRecordForSource(record, sourceId))
    .filter((record): record is ReplayProjectedRecord => record !== undefined)
    .sort(projectedRecordOrder);
  return { baseline_version: 1, release_id: releaseId, source_id: sourceId, record_count: projected.length, records: projected };
}

export function writeReplayBaselines(records: MtaCanonicalRecord[], manifest: ReplaySampleManifest, rootDir = repoRoot) {
  const dir = replayBaselineDir(rootDir);
  mkdirSync(dir, { recursive: true });
  for (const source of manifest.sources) {
    const baseline = baselineForSource(records, manifest.release_id, source.source_id);
    writeJson(join(dir, `${source.source_id}.json`), baseline as unknown as JsonValue);
  }
  return dir;
}

function projectedRecordOrder(a: ReplayProjectedRecord, b: ReplayProjectedRecord) {
  return (
    a.record_kind.localeCompare(b.record_kind) ||
    baselineOrderKey(a).localeCompare(baselineOrderKey(b)) ||
    (a.v1_record_id ?? "").localeCompare(b.v1_record_id ?? "")
  );
}

function relationEndpointKey(record: ReplayProjectedRecord) {
  if (record.record_kind !== "relation") return "";
  return `${record.relation?.subject_id ?? ""}->${record.relation?.object_id ?? ""}`;
}

function coarseMatchKeys(record: ReplayProjectedRecord) {
  const endpoint = relationEndpointKey(record);
  const refs = record.evidence_refs.length > 0 ? record.evidence_refs : [{ source_id: "", block_id: "no_evidence" }];
  return sortedUnique(refs.map((ref) => `${record.record_kind}|${endpoint}|${ref.source_id}#${ref.block_id}`));
}

function runnerCompanionFields(kind: MtaObservationKind) {
  const spec = kindSpec(kind);
  if (!spec) return [];
  return spec.runner_companions.flatMap((companion) => companion.companion.match(/[a-z][a-z0-9_]+/gu) ?? []).filter((field) => field !== "or");
}

function comparablePayload(record: ReplayProjectedRecord): JsonObject {
  if (record.record_kind === "relation") return {};
  const spec = kindSpec(record.record_kind);
  const allowed = new Set([...(spec?.fields.map((field) => field.name) ?? []), ...runnerCompanionFields(record.record_kind)]);
  const payload: JsonObject = {};
  for (const [field, value] of Object.entries(record.payload).sort(([a], [b]) => a.localeCompare(b))) {
    if (!allowed.has(field) || field.startsWith("_") || value === undefined) continue;
    payload[field] = value as JsonValue;
  }
  return payload;
}

function comparableRelation(record: ReplayProjectedRecord): ReplayProjectedRecord["relation"] {
  if (record.record_kind !== "relation") return undefined;
  return {
    subject_id: record.relation?.subject_id,
    object_id: record.relation?.object_id,
    relation_family: record.relation?.relation_family,
    relation_kind: record.relation?.relation_kind,
    assertion_status: record.relation?.assertion_status,
  };
}

function comparableEvidenceRefs(record: ReplayProjectedRecord) {
  return sortedUnique(record.evidence_refs.map((ref) => `${ref.source_id}#${ref.block_id}`))
    .map((identity) => {
      const [source_id, block_id] = identity.split("#", 2);
      return { source_id: source_id ?? "", block_id: block_id ?? "" };
    })
    .filter((ref) => ref.source_id && ref.block_id);
}

function comparableRecord(record: ReplayProjectedRecord): JsonObject {
  return {
    record_kind: record.record_kind,
    truth_status: record.truth_status,
    review_state: record.review_state,
    payload: comparablePayload(record),
    relation: comparableRelation(record) as JsonValue,
    evidence_refs: comparableEvidenceRefs(record) as unknown as JsonValue,
  };
}

function baselineOrderRecord(record: ReplayProjectedRecord): JsonObject {
  return {
    record_kind: record.record_kind,
    display_name: record.display_name,
    raw_text: record.raw_text,
    truth_status: record.truth_status,
    review_state: record.review_state,
    payload: record.payload,
    relation: record.relation as JsonValue,
    evidence_refs: record.evidence_refs as unknown as JsonValue,
  };
}

function baselineOrderKey(record: ReplayProjectedRecord) {
  return stableHash(baselineOrderRecord(record) as JsonValue);
}

function projectionKey(record: ReplayProjectedRecord) {
  return stableHash(comparableRecord(record) as JsonValue);
}

function itemOrder(a: ReplayDiffItem, b: ReplayDiffItem) {
  return a.projectionKey.localeCompare(b.projectionKey) || (a.record.v1_record_id ?? "").localeCompare(b.record.v1_record_id ?? "") || a.index - b.index;
}

function shareCoarseKey(a: ReplayDiffItem, b: ReplayDiffItem) {
  const keys = new Set(a.coarseKeys);
  return b.coarseKeys.some((key) => keys.has(key));
}

function firstSharedKey(a: ReplayDiffItem, b: ReplayDiffItem) {
  const bKeys = new Set(b.coarseKeys);
  return a.coarseKeys.find((key) => bKeys.has(key));
}

function flatten(value: JsonValue | undefined, prefix: string, out: Map<string, string>) {
  if (value === undefined) {
    out.set(prefix, "undefined");
    return;
  }
  if (Array.isArray(value)) {
    out.set(prefix, stableJson(value));
    return;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
    if (entries.length === 0) {
      out.set(prefix, "{}");
      return;
    }
    for (const [key, entry] of entries.sort(([a], [b]) => a.localeCompare(b))) {
      flatten(entry as JsonValue, prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }
  out.set(prefix, stableJson(value));
}

function fieldDiffs(expected: ReplayProjectedRecord, actual: ReplayProjectedRecord) {
  const left = new Map<string, string>();
  const right = new Map<string, string>();
  flatten(comparableRecord(expected) as JsonValue, "", left);
  flatten(comparableRecord(actual) as JsonValue, "", right);
  const fields = sortedUnique([...left.keys(), ...right.keys()]);
  return fields.filter((field) => left.get(field) !== right.get(field));
}

function diffItems(records: ReplayProjectedRecord[]): ReplayDiffItem[] {
  return records.map((record, index) => ({ record, index, projectionKey: projectionKey(record), coarseKeys: coarseMatchKeys(record) })).sort(itemOrder);
}

export function diffReplay(expected: ReplayProjectedRecord[], actual: ReplayProjectedRecord[]): ReplayDiffResult {
  const expectedItems = diffItems(expected);
  const actualItems = diffItems(actual);
  const unmatchedActual = new Set(actualItems.map((_, index) => index));
  const matchedExpected = new Set<number>();
  const entries: ReplayDiffEntry[] = [];

  for (const [expectedIndex, expectedItem] of expectedItems.entries()) {
    const actualIndex = actualItems.findIndex((candidate, index) => unmatchedActual.has(index) && candidate.projectionKey === expectedItem.projectionKey && shareCoarseKey(expectedItem, candidate));
    if (actualIndex === -1) continue;
    const actualItem = actualItems[actualIndex]!;
    unmatchedActual.delete(actualIndex);
    matchedExpected.add(expectedIndex);
    entries.push({
      status: "match",
      record_kind: expectedItem.record.record_kind,
      expected_record_id: expectedItem.record.v1_record_id,
      actual_record_id: actualItem.record.v1_record_id,
      match_key: firstSharedKey(expectedItem, actualItem),
    });
  }

  const remainingExpected = expectedItems.filter((_, index) => !matchedExpected.has(index));
  for (const expectedItem of remainingExpected) {
    const candidates = actualItems
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate, index }) => unmatchedActual.has(index) && shareCoarseKey(expectedItem, candidate))
      .sort((a, b) => {
        const diffA = fieldDiffs(expectedItem.record, a.candidate.record).length;
        const diffB = fieldDiffs(expectedItem.record, b.candidate.record).length;
        return diffA - diffB || itemOrder(a.candidate, b.candidate);
      });
    const paired = candidates[0];
    if (!paired) {
      entries.push({
        status: "missing",
        record_kind: expectedItem.record.record_kind,
        expected_record_id: expectedItem.record.v1_record_id,
        match_key: expectedItem.coarseKeys[0],
      });
      continue;
    }
    unmatchedActual.delete(paired.index);
    entries.push({
      status: "field_mismatch",
      record_kind: expectedItem.record.record_kind,
      expected_record_id: expectedItem.record.v1_record_id,
      actual_record_id: paired.candidate.record.v1_record_id,
      match_key: firstSharedKey(expectedItem, paired.candidate),
      fields: fieldDiffs(expectedItem.record, paired.candidate.record),
    });
  }

  for (const index of [...unmatchedActual].sort((a, b) => itemOrder(actualItems[a]!, actualItems[b]!))) {
    const item = actualItems[index]!;
    entries.push({
      status: "extra",
      record_kind: item.record.record_kind,
      actual_record_id: item.record.v1_record_id,
      match_key: item.coarseKeys[0],
    });
  }

  const counts = { match: 0, field_mismatch: 0, missing: 0, extra: 0 };
  for (const entry of entries) counts[entry.status] += 1;
  return { expected_count: expected.length, actual_count: actual.length, ...counts, entries };
}

export function collisionSummary(records: ReplayProjectedRecord[]): ReplayCollisionSummary {
  const buckets = new Map<string, ReplayProjectedRecord[]>();
  for (const record of records) {
    for (const key of coarseMatchKeys(record)) {
      const bucket = buckets.get(key) ?? [];
      bucket.push(record);
      buckets.set(key, bucket);
    }
  }

  const byKind: Partial<Record<MtaObservationKind, ReplayCollisionKindSummary>> = {};
  let collisionBucketCount = 0;
  let recordsInCollisionBuckets = 0;
  for (const [key, bucket] of buckets) {
    const uniqueRecords = [...new Map(bucket.map((record) => [record.v1_record_id ?? projectionKey(record), record])).values()];
    if (uniqueRecords.length < 2) continue;
    collisionBucketCount += 1;
    recordsInCollisionBuckets += uniqueRecords.length;
    const kind = key.split("|")[0] as MtaObservationKind;
    const summary = byKind[kind] ?? {
      collision_buckets: 0,
      records_in_collision_buckets: 0,
      projection_distinguishable_buckets: 0,
      projection_ambiguous_buckets: 0,
    };
    summary.collision_buckets += 1;
    summary.records_in_collision_buckets += uniqueRecords.length;
    const projectionCount = new Set(uniqueRecords.map(projectionKey)).size;
    if (projectionCount === uniqueRecords.length) summary.projection_distinguishable_buckets += 1;
    else summary.projection_ambiguous_buckets += 1;
    byKind[kind] = summary;
  }

  return {
    bucket_count: buckets.size,
    collision_bucket_count: collisionBucketCount,
    records_in_collision_buckets: recordsInCollisionBuckets,
    by_kind: byKind,
  };
}

function allProjectedReleaseRecords(records: MtaCanonicalRecord[]) {
  const projected: ReplayProjectedRecord[] = [];
  for (const record of records) {
    for (const sourceId of sortedUnique(record.evidence_refs.map((ref) => ref.source_id).filter(Boolean))) {
      const row = projectRecordForSource(record, sourceId);
      if (row) projected.push(row);
    }
  }
  return projected.sort(projectedRecordOrder);
}

function readBaselineFile(path: string): ReplayBaselineFile {
  return readJson<ReplayBaselineFile>(path);
}

function readBaselineDir(dir: string) {
  const bySource = new Map<string, ReplayBaselineFile>();
  if (!existsSync(dir)) return bySource;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const baseline = readBaselineFile(join(dir, entry.name));
    bySource.set(baseline.source_id, baseline);
  }
  return bySource;
}

function blankAgreement(): ReplayKindAgreement {
  return { expected: 0, actual: 0, match: 0, field_mismatch: 0, missing: 0, extra: 0, agreement_rate: null };
}

function addAgreement(target: ReplayKindAgreement, diff: ReplayDiffResult, kind?: MtaObservationKind) {
  const entries = kind ? diff.entries.filter((entry) => entry.record_kind === kind) : diff.entries;
  target.match += entries.filter((entry) => entry.status === "match").length;
  target.field_mismatch += entries.filter((entry) => entry.status === "field_mismatch").length;
  target.missing += entries.filter((entry) => entry.status === "missing").length;
  target.extra += entries.filter((entry) => entry.status === "extra").length;
  target.expected += entries.filter((entry) => entry.status !== "extra").length;
  target.actual += entries.filter((entry) => entry.status !== "missing").length;
  target.agreement_rate = target.expected === 0 ? null : target.match / target.expected;
}

function agreementForDiff(sourceId: string, diff: ReplayDiffResult): ReplaySourceAgreement {
  const row: ReplaySourceAgreement = { source_id: sourceId, ...blankAgreement() };
  addAgreement(row, diff);
  return row;
}

function mismatchFieldsTop(diffs: ReplayDiffResult[]) {
  const counts = new Map<string, number>();
  for (const diff of diffs) {
    for (const entry of diff.entries) {
      if (entry.status !== "field_mismatch") continue;
      for (const field of entry.fields ?? []) counts.set(field, (counts.get(field) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40));
}

function assembleReport(input: {
  releaseId: string;
  runId: string;
  seed: string;
  manifestPath: string;
  baselineDir: string;
  actualDir: string;
  sourceCount: number;
  selfDiff: boolean;
  diffs: Array<{ sourceId: string; diff: ReplayDiffResult }>;
  replayRecords: ReplayProjectedRecord[];
  fullReleaseRecords: ReplayProjectedRecord[];
}): ReplayReport {
  const totals = blankAgreement();
  const byKind: Partial<Record<MtaObservationKind, ReplayKindAgreement>> = {};
  for (const { diff } of input.diffs) {
    addAgreement(totals, diff);
    for (const entry of diff.entries) {
      const kindSummary = byKind[entry.record_kind] ?? blankAgreement();
      byKind[entry.record_kind] = kindSummary;
    }
  }
  for (const { diff } of input.diffs) {
    for (const kind of Object.keys(byKind).sort() as MtaObservationKind[]) addAgreement(byKind[kind]!, diff, kind);
  }
  const rawDiffs = input.diffs.map(({ diff }) => diff);

  return {
    report_version: 1,
    comparison_projection: {
      version: 2,
      payload: "Declared kind-registry fields plus runner companion fields; excludes v1-only residue, local endpoint aliases, derivation bookkeeping, and extra_fields.",
      evidence_refs: "Source id and block id only; page number, role, and text hash are ignored for replay equality.",
      relation: "Subject id, object id, relation family, relation kind, and assertion status.",
    },
    release_id: input.releaseId,
    run_id: input.runId,
    seed: input.seed,
    manifest_path: input.manifestPath,
    baseline_dir: input.baselineDir,
    actual_dir: input.actualDir,
    source_count: input.sourceCount,
    self_diff: input.selfDiff,
    totals,
    by_kind: Object.fromEntries(Object.entries(byKind).sort(([a], [b]) => a.localeCompare(b))) as Partial<Record<MtaObservationKind, ReplayKindAgreement>>,
    source_rows: input.diffs.map(({ sourceId, diff }) => agreementForDiff(sourceId, diff)).sort((a, b) => a.source_id.localeCompare(b.source_id)),
    mismatch_fields_top: mismatchFieldsTop(rawDiffs),
    collision_summary: {
      replay_scope: collisionSummary(input.replayRecords),
      full_release: collisionSummary(input.fullReleaseRecords),
    },
    v1_precision_bar: {
      overall_lenient: 0.9,
      route_scoped_relations: 0.82,
      treatment_components: 0.92,
      events: 0.9467,
      metric_claims: 0.9467,
    },
  };
}

function percent(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
}

export function replayReportMarkdown(report: ReplayReport) {
  const lines = [
    `# Replay Eval ${report.run_id}`,
    "",
    `- Release: ${report.release_id}`,
    `- Sources: ${report.source_count}`,
    `- Self diff: ${report.self_diff ? "yes" : "no"}`,
    `- Overall agreement: ${percent(report.totals.agreement_rate)} (${report.totals.match}/${report.totals.expected})`,
    "",
    "## Agreement By Kind",
    "",
    "| Kind | Expected | Actual | Match | Field mismatch | Missing | Extra | Agreement |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const [kind, row] of Object.entries(report.by_kind).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| ${kind} | ${row.expected} | ${row.actual} | ${row.match} | ${row.field_mismatch} | ${row.missing} | ${row.extra} | ${percent(row.agreement_rate)} |`);
  }
  lines.push("", "## Top Mismatch Fields", "", "| Field | Count |", "|---|---:|");
  for (const [field, count] of Object.entries(report.mismatch_fields_top).slice(0, 20)) lines.push(`| ${field} | ${count} |`);
  lines.push("", "## Agreement By Source", "", "| Source | Expected | Actual | Match | Field mismatch | Missing | Extra | Agreement |", "|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of report.source_rows) {
    lines.push(`| ${row.source_id} | ${row.expected} | ${row.actual} | ${row.match} | ${row.field_mismatch} | ${row.missing} | ${row.extra} | ${percent(row.agreement_rate)} |`);
  }
  lines.push("", "## Collision Summary", "", "| Scope | Kind | Buckets | Records | Projection-distinguishable | Projection-ambiguous |", "|---|---|---:|---:|---:|---:|");
  for (const [scope, summary] of Object.entries(report.collision_summary) as Array<[keyof ReplayReport["collision_summary"], ReplayCollisionSummary]>) {
    for (const [kind, row] of Object.entries(summary.by_kind).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`| ${scope} | ${kind} | ${row.collision_buckets} | ${row.records_in_collision_buckets} | ${row.projection_distinguishable_buckets} | ${row.projection_ambiguous_buckets} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function writeReplayEval(options: {
  releaseId?: string | undefined;
  runId?: string | undefined;
  actualDir?: string | undefined;
  actualOnly?: boolean | undefined;
  seed?: string | undefined;
  rootDir?: string | undefined;
} = {}): ReplayEvalResult {
  const rootDir = options.rootDir ?? repoRoot;
  const releaseId = options.releaseId ?? DEFAULT_REPLAY_RELEASE_ID;
  const seed = options.seed ?? DEFAULT_REPLAY_SEED;
  const runId = options.runId ?? DEFAULT_REPLAY_RUN_ID;
  const records = readReleaseRecords(releaseId, rootDir);
  const { manifest, path: manifestPath } = writeReplaySampleManifest(records, { releaseId, seed, rootDir });
  const baselineDir = writeReplayBaselines(records, manifest, rootDir);
  const actualDir = options.actualDir ?? baselineDir;
  const expectedBySource = readBaselineDir(baselineDir);
  const actualBySource = options.actualDir ? readBaselineDir(actualDir) : expectedBySource;
  const selectedSources = options.actualOnly && options.actualDir ? manifest.sources.filter((source) => actualBySource.has(source.source_id)) : manifest.sources;
  const diffs: Array<{ sourceId: string; diff: ReplayDiffResult }> = [];
  const replayRecords: ReplayProjectedRecord[] = [];
  for (const source of selectedSources) {
    const expected = expectedBySource.get(source.source_id)?.records ?? [];
    const actual = actualBySource.get(source.source_id)?.records ?? [];
    replayRecords.push(...expected);
    diffs.push({ sourceId: source.source_id, diff: diffReplay(expected, actual) });
  }

  const report = assembleReport({
    releaseId,
    runId,
    seed,
    manifestPath: relative(rootDir, manifestPath),
    baselineDir: relative(rootDir, baselineDir),
    actualDir: relative(rootDir, actualDir),
    sourceCount: selectedSources.length,
    selfDiff: actualDir === baselineDir,
    diffs,
    replayRecords,
    fullReleaseRecords: allProjectedReleaseRecords(records),
  });
  const reportsDir = replayReportsDir(rootDir);
  mkdirSync(reportsDir, { recursive: true });
  const reportPath = join(reportsDir, `${runId}.json`);
  const markdownPath = join(reportsDir, `${runId}.md`);
  writeJson(reportPath, report as unknown as JsonValue);
  writeFileSync(markdownPath, replayReportMarkdown(report), "utf8");
  return { manifest, manifestPath, baselineDir, report, reportPath, markdownPath };
}

export function readReplayBaselineDir(dir: string) {
  return readBaselineDir(dir);
}

export function sourceIdFromBaselinePath(path: string) {
  return basename(path).replace(/\.json$/u, "");
}
