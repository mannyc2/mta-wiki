import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaEvidenceRef, StagedSourceBlock } from "@mta-wiki/db/types";
import { FILE_BY_KIND } from "@mta-wiki/pipeline/materialize/canonical-read";
import { parseReleaseManifest, type ReleaseManifest } from "@mta-wiki/pipeline/materialize/export-release";

const SAMPLE_LIMIT = 100;
const SAMPLE_TARGETS = {
  route_scoped_relation: 100,
  treatment_component: 50,
  event: 75,
  metric_claim: 75,
} as const;

export const THRESHOLDS = {
  judgeHumanAgreementMin: 0.90,
  seededRecallOverallMin: 0.85,
  seededRecallCriticalMin: 0.90,
  controlFalseFlagMax: 0.05,
  resampleLenientMin: 0.94,
  resampleUnsupportedWrongMax: 0.05,
  dedupAutoGroupPrecisionMin: 0.95,
  costPerAcceptedCorrectionMaxUsd: 0.25,
} as const;

export type EvidenceResolutionFailure = {
  record_id: string;
  record_kind: string;
  ref_index: number;
  source_id: string | null;
  block_id: string | null;
  text_sha256: string | null;
  reason: string;
};

export type EvidenceResolutionSummary = {
  total_refs: number;
  resolved_refs: number;
  unresolved_refs: number;
  resolution_rate: number;
  sample_failures: EvidenceResolutionFailure[];
};

export type QuoteContainsValueFailure = {
  record_id: string;
  record_kind: string;
  payload_path: string;
  value: string;
  sample_quote: string;
};

export type QuoteContainsValueKindSummary = {
  records_checked: number;
  values_checked: number;
  values_contained: number;
  values_missing: number;
  contains_rate: number | null;
  sample_failures: QuoteContainsValueFailure[];
};

export type QuoteContainsValueSummary = {
  by_kind: Record<string, QuoteContainsValueKindSummary>;
};

export type EventDateWindowFlag = {
  record_id: string;
  source_id: string;
  event_date_normalized: string;
  source_published_date_normalized: string | null;
  reason: string;
};

export type RouteIdSanityFlag = {
  record_id: string;
  display_name: string;
  route_id: string | null;
  reason: string;
};

export type CrossFieldSanitySummary = {
  event_date_window: {
    records_checked: number;
    skipped_no_event_date: number;
    skipped_no_source_date: number;
    flagged: number;
    sample_flags: EventDateWindowFlag[];
  };
  route_id_sanity: {
    records_checked: number;
    valid: number;
    flagged: number;
    sample_flags: RouteIdSanityFlag[];
  };
};

export type SemanticInvariantCounts = {
  relation_self_loops_open: number;
  relation_self_loops_quarantined: number;
  event_completion_target_completed_open: number;
  event_completion_target_completed_quarantined: number;
};

export type SameSourceDuplicationKindSummary = {
  groups: number;
  affected_records: number;
  sample_groups: Array<{ key: string; record_ids: string[] }>;
};

export type SameSourceDuplicationSummary = Record<"relations" | "events" | "metric_claims" | "claims" | "treatment_components", SameSourceDuplicationKindSummary>;

export type CorrectionsLedgerStats = {
  entries: number;
  by_op: Record<string, number>;
  by_provenance: Record<string, number>;
  by_lane: Record<string, number>;
  cost_per_accepted_correction_usd: number | null;
  cost_definition: string;
};

export type DeterministicQualityReport = {
  release_id: string;
  release_dir: string;
  record_count: number;
  evidence_ref_resolution: EvidenceResolutionSummary;
  quote_contains_value: QuoteContainsValueSummary;
  cross_field_sanity: CrossFieldSanitySummary;
  semantic_invariant_counts: SemanticInvariantCounts;
  same_source_duplication: SameSourceDuplicationSummary;
  corrections_ledger_stats: CorrectionsLedgerStats;
  thresholds: typeof THRESHOLDS;
};

export type QualityReportWriteResult = {
  releaseId: string;
  dir: string;
  deterministicPath: string;
  deterministic: DeterministicQualityReport;
};

export type SampleGroup = keyof typeof SAMPLE_TARGETS;

export type EvidenceBlockText = {
  source_id: string | null;
  block_id: string | null;
  source_quote?: string | undefined;
  block_text?: string | undefined;
  error?: string | undefined;
};

export type SampleAuditSeedRow = {
  sample_group: SampleGroup;
  sample_index: number;
  record_id: string;
  record_kind: string;
  evidence_ref_count: number;
};

type ReleaseAnchorRow = {
  gtfs_route_id?: string | null | undefined;
  canonical_route_record_id?: string | null | undefined;
  variant_record_ids?: string[] | undefined;
  disposition?: string | undefined;
};

type ResolvedBlock = {
  block: StagedSourceBlock;
  error?: undefined;
} | {
  block?: undefined;
  error: string;
};

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function qualityRoot(rootDir: string) {
  return join(rootDir, "data", "quality");
}

export function qualityDir(releaseId: string, rootDir = repoRoot) {
  return join(qualityRoot(rootDir), releaseId);
}

function releasesRoot(rootDir: string) {
  return join(rootDir, "data", "exports", "releases");
}

export function latestReleaseId(rootDir = repoRoot) {
  return readFileSync(join(releasesRoot(rootDir), "LATEST"), "utf8").trim();
}

export function releaseDir(releaseId: string, rootDir = repoRoot) {
  return join(releasesRoot(rootDir), releaseId);
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

export function readReleaseManifest(releaseId: string, rootDir = repoRoot): ReleaseManifest {
  return parseReleaseManifest(JSON.parse(readFileSync(join(releaseDir(releaseId, rootDir), "manifest.json"), "utf8")));
}

export function readReleaseRecords(releaseId: string, rootDir = repoRoot): MtaCanonicalRecord[] {
  const dir = releaseDir(releaseId, rootDir);
  const records: MtaCanonicalRecord[] = [];
  for (const filename of [...FILE_BY_KIND.values()].sort()) {
    records.push(...readJsonl<MtaCanonicalRecord>(join(dir, filename)));
  }
  return records.sort((a, b) => a.record_kind.localeCompare(b.record_kind) || a.record_id.localeCompare(b.record_id));
}

function readRouteAnchors(releaseId: string, rootDir = repoRoot): ReleaseAnchorRow[] {
  return readJsonl<ReleaseAnchorRow>(join(releaseDir(releaseId, rootDir), "route_anchors.jsonl"));
}

type SourceBlockCache = Map<string, StagedSourceBlock[]>;

function blocksPath(rootDir: string, sourceId: string) {
  return join(rootDir, "raw", "sources", sourceId, "blocks.jsonl");
}

function readBlocks(rootDir: string, sourceId: string, cache: SourceBlockCache) {
  const cached = cache.get(sourceId);
  if (cached) return cached;

  const path = blocksPath(rootDir, sourceId);
  if (!existsSync(path)) throw new Error(`missing blocks.jsonl for ${sourceId}`);
  const blocks = readJsonl<StagedSourceBlock>(path);
  cache.set(sourceId, blocks);
  return blocks;
}

function resolveAliasBlockId(blockId: string, blocks: StagedSourceBlock[]): string {
  if (blocks.some((block) => block.block_id === blockId)) return blockId;

  const rangeParts = blockId.split("..");
  if (rangeParts.length === 2 && rangeParts[0] && rangeParts[1]) {
    return `${resolveAliasBlockId(rangeParts[0], blocks)}..${resolveAliasBlockId(rangeParts[1], blocks)}`;
  }

  const alias = /^(p\d{3,})_b(\d{4,})$/u.exec(blockId);
  if (!alias) return blockId;
  const [, pageId, ordinal] = alias;
  const chandraId = `${pageId}_c${ordinal}`;
  return blocks.find((block) => block.block_id === chandraId && block.source_surface === "chandra_ocr")?.block_id ?? blockId;
}

function blockRange(sourceId: string, blockRangeId: string, blocks: StagedSourceBlock[]): StagedSourceBlock {
  const [startId, endId, ...rest] = blockRangeId.split("..");
  if (!startId || !endId || rest.length > 0) throw new Error(`invalid block range ${sourceId}#${blockRangeId}`);
  const start = blocks.find((block) => block.block_id === startId);
  const end = blocks.find((block) => block.block_id === endId);
  if (!start || !end) throw new Error(`unknown block range ${sourceId}#${blockRangeId}`);
  if (start.page_number !== end.page_number) throw new Error(`block range crosses pages ${sourceId}#${blockRangeId}`);

  const page = blocks.filter((block) => block.page_number === start.page_number);
  const startIndex = page.findIndex((block) => block.block_id === start.block_id);
  const endIndex = page.findIndex((block) => block.block_id === end.block_id);
  if (startIndex === -1 || endIndex === -1) throw new Error(`unknown block range ${sourceId}#${blockRangeId}`);
  const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  const children = page.slice(from, to + 1);
  const rawText = children.map((block) => block.raw_text).join("\n");
  const normalizedText = children.map((block) => block.normalized_text).join("\n");

  return {
    source_id: sourceId,
    block_id: `${start.block_id}..${end.block_id}`,
    page_number: start.page_number,
    reading_order: Math.min(...children.map((block) => block.reading_order)),
    source_surface: start.source_surface,
    block_kind: "range",
    child_block_ids: children.map((block) => block.block_id),
    source_line_ids: [...new Set(children.flatMap((block) => block.source_line_ids ?? []))].sort(),
    raw_source_path: `raw/sources/${sourceId}/blocks.jsonl`,
    raw_start_char: Math.min(...children.map((block) => block.raw_start_char)),
    raw_end_char: Math.max(...children.map((block) => block.raw_end_char)),
    raw_text: rawText,
    normalized_text: normalizedText,
    raw_text_sha256: sha256(rawText),
    normalized_text_sha256: sha256(normalizedText),
  };
}

function resolveBlock(rootDir: string, ref: MtaEvidenceRef, cache: SourceBlockCache): ResolvedBlock {
  if (!ref.source_id) return { error: "missing source_id" };
  const blockId = ref.block_id ?? ref.block_range;
  if (!blockId) return { error: "missing block_id" };

  try {
    const blocks = readBlocks(rootDir, ref.source_id, cache);
    const resolvedId = resolveAliasBlockId(blockId, blocks);
    const block = blocks.find((candidate) => candidate.block_id === resolvedId);
    if (block) return { block };
    if (resolvedId.includes("..")) return { block: blockRange(ref.source_id, resolvedId, blocks) };
    return { error: `unknown source block ${ref.source_id}#${blockId}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function evidenceBlockText(ref: MtaEvidenceRef, rootDir = repoRoot): EvidenceBlockText {
  const result = resolveBlock(rootDir, ref, new Map());
  return {
    source_id: ref.source_id || null,
    block_id: ref.block_id ?? ref.block_range ?? null,
    source_quote: ref.source_quote,
    block_text: result.block?.raw_text,
    error: result.error,
  };
}

function textHashForRef(block: StagedSourceBlock, ref: MtaEvidenceRef) {
  return ref.text_source === "normalized_text" ? block.normalized_text_sha256 : block.raw_text_sha256;
}

function samplePush<T>(items: T[], item: T) {
  if (items.length < SAMPLE_LIMIT) items.push(item);
}

export function evidenceResolution(records: MtaCanonicalRecord[], rootDir = repoRoot): EvidenceResolutionSummary {
  const cache: SourceBlockCache = new Map();
  const failures: EvidenceResolutionFailure[] = [];
  let total = 0;
  let resolved = 0;

  for (const record of records) {
    for (const [index, ref] of record.evidence_refs.entries()) {
      total += 1;
      const result = resolveBlock(rootDir, ref, cache);
      const expected = result.block ? textHashForRef(result.block, ref) : undefined;
      const reason = result.error ?? (!ref.text_sha256 ? "missing text_sha256" : ref.text_sha256 !== expected ? "text_sha256 mismatch" : undefined);
      if (!reason) {
        resolved += 1;
        continue;
      }

      samplePush(failures, {
        record_id: record.record_id,
        record_kind: record.record_kind,
        ref_index: index,
        source_id: ref.source_id || null,
        block_id: ref.block_id ?? ref.block_range ?? null,
        text_sha256: ref.text_sha256 ?? null,
        reason,
      });
    }
  }

  const unresolved = total - resolved;
  return {
    total_refs: total,
    resolved_refs: resolved,
    unresolved_refs: unresolved,
    resolution_rate: total === 0 ? 1 : resolved / total,
    sample_failures: failures,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const SKIP_VALUE_KEYS = new Set([
  "assertion_status",
  "confidence",
  "date_precision",
  "date_source_field",
  "event_family",
  "event_kind",
  "lifecycle_phase",
  "lifecycle_phase_other",
  "object_id",
  "object_kind",
  "object_local_observation_id",
  "precision",
  "project_kind",
  "publisher",
  "relation_family",
  "relation_kind",
  "review_state",
  "route_record_scope",
  "route_record_scope_reason",
  "source_id",
  "subject_id",
  "subject_kind",
  "subject_local_observation_id",
  "treatment_kind",
  "truth_status",
]);

function candidateKey(key: string) {
  if (key.startsWith("_")) return false;
  if (SKIP_VALUE_KEYS.has(key)) return false;
  if (key.endsWith("_id") || key.endsWith("_ids")) return false;
  if (key.endsWith("_normalized") && key !== "date_text_normalized") return false;
  return /(?:amount|boardings|cost|count|date|delay|dollar|duration|frequency|headway|hour|lane|metric|mile|minute|month|mph|number|percent|percentage|period|rate|ratio|reliability|ridership|score|second|speed|time|trip|value|vehicle|volume|year)/u.test(key);
}

function scalarCandidate(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/\d/u.test(trimmed)) return trimmed;
  return undefined;
}

function payloadCandidates(payload: JsonObject, prefix: string[] = []): Array<{ path: string; value: string }> {
  const result: Array<{ path: string; value: string }> = [];
  for (const [key, value] of Object.entries(payload)) {
    const path = [...prefix, key];
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        const scalar = candidateKey(key) ? scalarCandidate(item) : undefined;
        if (scalar) result.push({ path: [...path, String(index)].join("."), value: scalar });
        if (isPlainObject(item)) result.push(...payloadCandidates(item as JsonObject, [...path, String(index)]));
      }
      continue;
    }
    if (isPlainObject(value)) {
      result.push(...payloadCandidates(value as JsonObject, path));
      continue;
    }
    const scalar = candidateKey(key) ? scalarCandidate(value) : undefined;
    if (scalar) result.push({ path: path.join("."), value: scalar });
  }
  return result;
}

function normalizeComparable(value: string) {
  return value
    .toLowerCase()
    .replace(/[$,%]/gu, "")
    .replace(/\bjan(?:uary)?\b/gu, "01")
    .replace(/\bfeb(?:ruary)?\b/gu, "02")
    .replace(/\bmar(?:ch)?\b/gu, "03")
    .replace(/\bapr(?:il)?\b/gu, "04")
    .replace(/\bmay\b/gu, "05")
    .replace(/\bjun(?:e)?\b/gu, "06")
    .replace(/\bjul(?:y)?\b/gu, "07")
    .replace(/\baug(?:ust)?\b/gu, "08")
    .replace(/\bsep(?:t|tember)?\b/gu, "09")
    .replace(/\boct(?:ober)?\b/gu, "10")
    .replace(/\bnov(?:ember)?\b/gu, "11")
    .replace(/\bdec(?:ember)?\b/gu, "12")
    .replace(/[^a-z0-9.]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function compactComparable(value: string) {
  return normalizeComparable(value).replace(/[^a-z0-9.]+/gu, "");
}

function numericTokens(value: string) {
  return normalizeComparable(value)
    .match(/\d+(?:\.\d+)?/gu)
    ?.map((token) => token.replace(/^0+(?=\d)/u, ""))
    .filter((token) => token.length > 0) ?? [];
}

export function quoteContainsValue(quote: string, value: string) {
  const quoteNorm = normalizeComparable(quote);
  const valueNorm = normalizeComparable(value);
  if (!valueNorm) return false;
  if (quoteNorm.includes(valueNorm)) return true;
  if (compactComparable(quote).includes(compactComparable(value))) return true;

  const tokens = numericTokens(value);
  if (tokens.length === 0) return false;
  const quoteTokens = new Set(numericTokens(quote));
  return tokens.every((token) => quoteTokens.has(token));
}

function emptyQuoteSummary(): QuoteContainsValueKindSummary {
  return {
    records_checked: 0,
    values_checked: 0,
    values_contained: 0,
    values_missing: 0,
    contains_rate: null,
    sample_failures: [],
  };
}

export function quoteContainsValueSummary(records: MtaCanonicalRecord[]): QuoteContainsValueSummary {
  const byKind: Record<string, QuoteContainsValueKindSummary> = {};

  for (const record of records) {
    const quotes = record.evidence_refs.map((ref) => ref.source_quote).filter((quote): quote is string => typeof quote === "string" && quote.trim().length > 0);
    if (quotes.length === 0) continue;

    const candidates = payloadCandidates(record.payload);
    if (candidates.length === 0) continue;

    const summary = (byKind[record.record_kind] ??= emptyQuoteSummary());
    summary.records_checked += 1;
    for (const candidate of candidates) {
      summary.values_checked += 1;
      if (quotes.some((quote) => quoteContainsValue(quote, candidate.value))) {
        summary.values_contained += 1;
      } else {
        summary.values_missing += 1;
        samplePush(summary.sample_failures, {
          record_id: record.record_id,
          record_kind: record.record_kind,
          payload_path: candidate.path,
          value: candidate.value,
          sample_quote: quotes[0] ?? "",
        });
      }
    }
  }

  for (const summary of Object.values(byKind)) {
    summary.contains_rate = summary.values_checked === 0 ? null : summary.values_contained / summary.values_checked;
  }

  return { by_kind: Object.fromEntries(Object.entries(byKind).sort(([a], [b]) => a.localeCompare(b))) };
}

function stringField(payload: JsonObject, field: string) {
  const value = payload[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function dateToUtc(value: string) {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/u.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) - 1 : 0;
  const day = match[3] ? Number(match[3]) : 1;
  const time = Date.UTC(year, month, day);
  return Number.isFinite(time) ? time : undefined;
}

function years(ms: number) {
  return ms * 365.25 * 24 * 60 * 60 * 1000;
}

function sourcePublishedDate(source: MtaCanonicalRecord | undefined) {
  if (!source) return undefined;
  return stringField(source.payload, "published_date_normalized") ?? stringField(source.payload, "date_normalized");
}

export function crossFieldSanity(records: MtaCanonicalRecord[], releaseId: string, rootDir = repoRoot): CrossFieldSanitySummary {
  const sources = new Map(records.filter((record) => record.record_kind === "source").map((record) => [record.source_id, record]));
  const eventFlags: EventDateWindowFlag[] = [];
  let eventFlagCount = 0;
  let eventChecked = 0;
  let skippedNoEventDate = 0;
  let skippedNoSourceDate = 0;

  for (const record of records) {
    if (record.record_kind !== "event") continue;
    const eventDate = stringField(record.payload, "date_normalized");
    if (!eventDate) {
      skippedNoEventDate += 1;
      continue;
    }
    const sourceDate = sourcePublishedDate(sources.get(record.source_id));
    if (!sourceDate) {
      skippedNoSourceDate += 1;
      continue;
    }
    const eventTime = dateToUtc(eventDate);
    const sourceTime = dateToUtc(sourceDate);
    if (eventTime === undefined || sourceTime === undefined) {
      skippedNoEventDate += eventTime === undefined ? 1 : 0;
      skippedNoSourceDate += sourceTime === undefined ? 1 : 0;
      continue;
    }
    eventChecked += 1;
    if (eventTime < sourceTime - years(50) || eventTime > sourceTime + years(5)) {
      eventFlagCount += 1;
      samplePush(eventFlags, {
        record_id: record.record_id,
        source_id: record.source_id,
        event_date_normalized: eventDate,
        source_published_date_normalized: sourceDate,
        reason: eventTime < sourceTime - years(50) ? "event_date_more_than_50y_before_source" : "event_date_more_than_5y_after_source",
      });
    }
  }

  const anchors = readRouteAnchors(releaseId, rootDir);
  const gtfsIds = new Set(anchors.map((row) => row.gtfs_route_id).filter((value): value is string => typeof value === "string" && value.trim().length > 0));
  const anchoredRecordIds = new Set(
    anchors.flatMap((row) => [
      ...(typeof row.canonical_route_record_id === "string" && row.canonical_route_record_id ? [row.canonical_route_record_id] : []),
      ...(row.variant_record_ids ?? []),
    ]),
  );
  const routeFlags: RouteIdSanityFlag[] = [];
  let routeChecked = 0;
  let routeValid = 0;

  for (const record of records) {
    if (record.record_kind !== "route") continue;
    routeChecked += 1;
    const routeId = stringField(record.payload, "route_id")?.toUpperCase() ?? null;
    if (routeId && gtfsIds.has(routeId)) {
      routeValid += 1;
      continue;
    }
    if (anchoredRecordIds.has(record.record_id)) {
      routeValid += 1;
      continue;
    }
    samplePush(routeFlags, {
      record_id: record.record_id,
      display_name: record.display_name,
      route_id: routeId,
      reason: routeId ? "route_id_not_in_gtfs_or_anchor_rows" : "missing_route_id",
    });
  }

  return {
    event_date_window: {
      records_checked: eventChecked,
      skipped_no_event_date: skippedNoEventDate,
      skipped_no_source_date: skippedNoSourceDate,
      flagged: eventFlagCount,
      sample_flags: eventFlags,
    },
    route_id_sanity: {
      records_checked: routeChecked,
      valid: routeValid,
      flagged: routeChecked - routeValid,
      sample_flags: routeFlags,
    },
  };
}

export function semanticInvariantCounts(records: MtaCanonicalRecord[]): SemanticInvariantCounts {
  const counts: SemanticInvariantCounts = {
    relation_self_loops_open: 0,
    relation_self_loops_quarantined: 0,
    event_completion_target_completed_open: 0,
    event_completion_target_completed_quarantined: 0,
  };
  for (const record of records) {
    const quarantined = record.review_state === "quarantined";
    if (record.record_kind === "relation" && typeof record.payload.subject_id === "string" && record.payload.subject_id === record.payload.object_id) {
      if (quarantined) counts.relation_self_loops_quarantined += 1;
      else counts.relation_self_loops_open += 1;
    }
    if (record.record_kind === "event") {
      const eventKind = typeof record.payload.event_kind === "string" ? record.payload.event_kind.toLowerCase() : "";
      if (eventKind.includes("target") && record.payload.lifecycle_phase === "completed") {
        if (quarantined) counts.event_completion_target_completed_quarantined += 1;
        else counts.event_completion_target_completed_open += 1;
      }
    }
  }
  return counts;
}

export function sameSourceDuplication(records: MtaCanonicalRecord[]): SameSourceDuplicationSummary {
  return {
    relations: duplicateSummary(records.filter((record) => record.record_kind === "relation"), (record) =>
      [record.payload.relation_kind, record.payload.subject_id, record.payload.object_id, record.source_id, record.payload.as_of_date ?? ""].map(stringKey).join("\0"),
    ),
    events: duplicateSummary(records.filter((record) => record.record_kind === "event"), (record) => [record.display_name, record.source_id].join("\0")),
    metric_claims: duplicateSummary(records.filter((record) => record.record_kind === "metric_claim"), (record) =>
      [record.source_id, record.payload.metric_name, record.payload.unit, record.payload.period, record.payload.value, record.payload.scope].map(stringKey).join("\0"),
    ),
    claims: duplicateSummary(records.filter((record) => record.record_kind === "claim"), (record) => [record.display_name, record.source_id].join("\0")),
    treatment_components: duplicateSummary(records.filter((record) => record.record_kind === "treatment_component"), (record) => [record.display_name, record.source_id].join("\0")),
  };
}

export function correctionsLedgerStats(rootDir = repoRoot): CorrectionsLedgerStats {
  const path = join(rootDir, "data/semantic-corrections/corrections.jsonl");
  const entries = readJsonl<{ op?: string; provenance?: string; source_decision?: string }>(path);
  return {
    entries: entries.length,
    by_op: countStrings(entries.map((entry) => entry.op).filter((value): value is string => Boolean(value))),
    by_provenance: countStrings(entries.map((entry) => entry.provenance).filter((value): value is string => Boolean(value))),
    by_lane: countStrings(entries.map((entry) => entry.source_decision).filter((value): value is string => Boolean(value))),
    cost_per_accepted_correction_usd: semanticSweepCostPerAcceptedCorrection(rootDir, entries.length),
    cost_definition:
      "cost_per_accepted_correction = sum usage.estimated_cost_usd across semantic-sweep + triage + calibration runs in data/semantic-sweep divided by applied llm_triage|human corrections; deterministic_rule corrections are free and excluded",
  };
}

export function deterministicQualityReport(releaseId: string, rootDir = repoRoot): DeterministicQualityReport {
  const records = readReleaseRecords(releaseId, rootDir);
  return {
    release_id: releaseId,
    release_dir: relative(rootDir, releaseDir(releaseId, rootDir)),
    record_count: records.length,
    evidence_ref_resolution: evidenceResolution(records, rootDir),
    quote_contains_value: quoteContainsValueSummary(records),
    cross_field_sanity: crossFieldSanity(records, releaseId, rootDir),
    semantic_invariant_counts: semanticInvariantCounts(records),
    same_source_duplication: sameSourceDuplication(records),
    corrections_ledger_stats: correctionsLedgerStats(rootDir),
    thresholds: THRESHOLDS,
  };
}

function duplicateSummary(records: MtaCanonicalRecord[], keyFor: (record: MtaCanonicalRecord) => string): SameSourceDuplicationKindSummary {
  const groups = new Map<string, string[]>();
  for (const record of records) {
    const key = keyFor(record);
    const ids = groups.get(key);
    if (ids) ids.push(record.record_id);
    else groups.set(key, [record.record_id]);
  }
  const duplicates = [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key: key.split("\0").join("|"), record_ids: ids.sort() }))
    .sort((a, b) => b.record_ids.length - a.record_ids.length || a.key.localeCompare(b.key));
  return {
    groups: duplicates.length,
    affected_records: duplicates.reduce((sum, group) => sum + group.record_ids.length, 0),
    sample_groups: duplicates.slice(0, SAMPLE_LIMIT),
  };
}

function stringKey(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return stableJson(value);
}

function countStrings(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function semanticSweepCostPerAcceptedCorrection(rootDir: string, correctionEntries: number): number | null {
  const sweepDir = join(rootDir, "data/semantic-sweep");
  if (!existsSync(sweepDir) || correctionEntries === 0) return null;
  return null;
}

function hashForSample(seed: string, group: string, recordId: string) {
  return createHash("sha256").update(`${seed}:${group}:${recordId}`).digest("hex");
}

function sortedSample(records: MtaCanonicalRecord[], releaseId: string, group: SampleGroup, count: number) {
  return [...records]
    .sort((a, b) => hashForSample(releaseId, group, a.record_id).localeCompare(hashForSample(releaseId, group, b.record_id)) || a.record_id.localeCompare(b.record_id))
    .slice(0, count);
}

function isRouteScopedRelation(record: MtaCanonicalRecord) {
  if (record.record_kind !== "relation") return false;
  const family = stringField(record.payload, "relation_family");
  if (family === "route_scope") return true;
  const subject = stringField(record.payload, "subject_id");
  const object = stringField(record.payload, "object_id");
  return Boolean(subject?.startsWith("route_") || object?.startsWith("route_"));
}

export function stratifiedSampleRows(records: MtaCanonicalRecord[], releaseId: string): SampleAuditSeedRow[] {
  const groups: Record<SampleGroup, MtaCanonicalRecord[]> = {
    route_scoped_relation: records.filter(isRouteScopedRelation),
    treatment_component: records.filter((record) => record.record_kind === "treatment_component"),
    event: records.filter((record) => record.record_kind === "event"),
    metric_claim: records.filter((record) => record.record_kind === "metric_claim"),
  };

  const rows: SampleAuditSeedRow[] = [];
  for (const [group, target] of Object.entries(SAMPLE_TARGETS) as Array<[SampleGroup, number]>) {
    for (const [index, record] of sortedSample(groups[group], releaseId, group, target).entries()) {
      rows.push({
        sample_group: group,
        sample_index: index + 1,
        record_id: record.record_id,
        record_kind: record.record_kind,
        evidence_ref_count: record.evidence_refs.length,
      });
    }
  }
  return rows;
}

export function writeDeterministicQualityReport(releaseId = latestReleaseId(), rootDir = repoRoot): QualityReportWriteResult {
  const deterministic = deterministicQualityReport(releaseId, rootDir);
  const dir = qualityDir(releaseId, rootDir);
  mkdirSync(dir, { recursive: true });
  const deterministicPath = join(dir, "deterministic.json");
  writeFileSync(deterministicPath, `${stableJson(deterministic as unknown as JsonValue)}\n`, "utf8");
  return { releaseId, dir, deterministicPath, deterministic };
}
