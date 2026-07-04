import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableHash, stableJson } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/materialize";
import {
  FACT_DEDUP_KINDS,
  anchorRecordId,
  buildAnchorIndex,
  crossSourceExactFactKey,
  eventNearMissBucketKey,
  factKeyComparable,
  sameSourceFactKey,
  type AnchorIndex,
  type FactDedupKind,
  type FactKey,
} from "@mta-wiki/pipeline/quality/fact-keys";

export const FACT_DEDUP_ACE_PAIR = ["event_able-ace-expansion-2023", "event_ace-2023-legislature-expansion"] as const;
export const FACT_DEDUP_NEAR_MISS_STOP_PAIR_LIMIT = 10_000;

export type FactDedupRecordCard = {
  record_id: string;
  display_name: string;
  source_id: string;
  anchor_record_id?: string | undefined;
  key_parts?: Record<string, string> | undefined;
};

export type FactDedupGroupSample = {
  key: string;
  parts: Record<string, string>;
  member_count: number;
  record_ids: string[];
  records: FactDedupRecordCard[];
};

export type FactDedupPairSample = {
  bucket_key: string;
  bucket_parts: Record<string, string>;
  record_ids: [string, string];
  records: [FactDedupRecordCard, FactDedupRecordCard];
};

export type FactDedupKindScoutSummary = {
  record_count: number;
  same_source_true_dup_groups: number;
  same_source_affected_records: number;
  cross_source_exact_groups: number;
  cross_source_affected_records: number;
  near_miss_candidate_pairs: number;
  samples: {
    same_source_true_dup_groups: FactDedupGroupSample[];
    cross_source_exact_groups: FactDedupGroupSample[];
    near_miss_candidate_pairs: FactDedupPairSample[];
  };
};

export type FactDedupScoutReport = {
  report_id: string;
  generated_at: string;
  source: "canonical_db";
  record_count: number;
  kind_summaries: Record<FactDedupKind, FactDedupKindScoutSummary>;
  ace_pair: {
    record_ids: typeof FACT_DEDUP_ACE_PAIR;
    present_in_event_near_miss_tier: boolean;
  };
  stop_conditions: {
    near_miss_pair_limit: number;
    near_miss_pair_count: number;
    near_miss_volume_exceeded: boolean;
    ace_pair_missing: boolean;
  };
};

export type FactDedupScoutWriteResult = {
  path: string;
  report: FactDedupScoutReport;
};

export type FactDedupRetirementRecordCard = FactDedupRecordCard & {
  evidence_ref_count: number;
  payload_field_count: number;
  survivor_rank: number;
};

export type FactDedupRetirementAction = {
  op: "retract_record" | "supersede_record";
  record_id: string;
  survivor_record_id?: string | undefined;
  guard_payload: JsonObject;
  cascade: string[];
  reason: string;
};

export type FactDedupRetirementGroup = {
  group_id: string;
  kind: FactDedupKind;
  key: string;
  parts: Record<string, string>;
  survivor_record_id: string;
  loser_record_ids: string[];
  payload_difference_fields: string[];
  records: FactDedupRetirementRecordCard[];
  actions: FactDedupRetirementAction[];
};

export type FactDedupSameSourceDryRunReport = {
  report_id: string;
  generated_at: string;
  source: "canonical_db";
  record_count: number;
  group_count: number;
  action_count: number;
  by_kind: Record<FactDedupKind, { groups: number; actions: number }>;
  groups: FactDedupRetirementGroup[];
};

export type FactDedupSameSourceDryRunWriteResult = {
  jsonPath: string;
  markdownPath: string;
  report: FactDedupSameSourceDryRunReport;
};

type KeyedRecord = {
  record: MtaCanonicalRecord;
  key: FactKey;
  comparable: string;
};

type NearMissRecord = {
  record: MtaCanonicalRecord;
  bucket: FactKey;
  nameKey: string;
};

function factGroupsRoot(rootDir = repoRoot): string {
  return join(rootDir, "data", "fact-groups");
}

export function factDedupScoutPath(runId: string, rootDir = repoRoot): string {
  return join(factGroupsRoot(rootDir), `scout-${runId}.json`);
}

export function factDedupSameSourceDryRunJsonPath(runId: string, rootDir = repoRoot): string {
  return join(factGroupsRoot(rootDir), `same-source-dry-run-${runId}.json`);
}

export function factDedupSameSourceDryRunMarkdownPath(runId: string, rootDir = repoRoot): string {
  return join(factGroupsRoot(rootDir), `same-source-dry-run-${runId}.md`);
}

export function writeFactDedupScout(options: { records?: MtaCanonicalRecord[] | undefined; runId?: string | undefined; rootDir?: string | undefined; now?: () => Date } = {}): FactDedupScoutWriteResult {
  const rootDir = options.rootDir ?? repoRoot;
  const now = options.now ?? (() => new Date());
  const runId = options.runId ?? now().toISOString().slice(0, 10);
  const records = options.records ?? readCanonicalRecords();
  const report = buildFactDedupScout(records, { runId, now });
  const path = factDedupScoutPath(runId, rootDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${stableJson(report as unknown as JsonValue)}\n`, "utf8");
  return { path, report };
}

export function buildFactDedupScout(records: readonly MtaCanonicalRecord[], options: { runId?: string | undefined; now?: () => Date } = {}): FactDedupScoutReport {
  const now = options.now ?? (() => new Date());
  const runId = options.runId ?? now().toISOString().slice(0, 10);
  const anchors = buildAnchorIndex(records);
  const kindSummaries = Object.fromEntries(
    FACT_DEDUP_KINDS.map((kind) => [kind, summarizeKind(kind, records.filter((record) => record.record_kind === kind), anchors)]),
  ) as Record<FactDedupKind, FactDedupKindScoutSummary>;
  const nearMissPairCount = FACT_DEDUP_KINDS.reduce((sum, kind) => sum + kindSummaries[kind].near_miss_candidate_pairs, 0);
  const acePairPresent = eventNearMissPairExists(kindSummaries.event.samples.near_miss_candidate_pairs, FACT_DEDUP_ACE_PAIR);
  const report: FactDedupScoutReport = {
    report_id: `fact-dedup-scout-${runId}`,
    generated_at: now().toISOString(),
    source: "canonical_db",
    record_count: records.length,
    kind_summaries: kindSummaries,
    ace_pair: {
      record_ids: FACT_DEDUP_ACE_PAIR,
      present_in_event_near_miss_tier: acePairPresent,
    },
    stop_conditions: {
      near_miss_pair_limit: FACT_DEDUP_NEAR_MISS_STOP_PAIR_LIMIT,
      near_miss_pair_count: nearMissPairCount,
      near_miss_volume_exceeded: nearMissPairCount > FACT_DEDUP_NEAR_MISS_STOP_PAIR_LIMIT,
      ace_pair_missing: !acePairPresent,
    },
  };
  return report;
}

export function writeFactDedupSameSourceDryRun(options: { records?: MtaCanonicalRecord[] | undefined; runId?: string | undefined; rootDir?: string | undefined; now?: () => Date } = {}): FactDedupSameSourceDryRunWriteResult {
  const rootDir = options.rootDir ?? repoRoot;
  const now = options.now ?? (() => new Date());
  const runId = options.runId ?? now().toISOString().slice(0, 10);
  const records = options.records ?? readCanonicalRecords();
  const report = buildFactDedupSameSourceDryRun(records, { runId, now });
  const jsonPath = factDedupSameSourceDryRunJsonPath(runId, rootDir);
  const markdownPath = factDedupSameSourceDryRunMarkdownPath(runId, rootDir);
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${stableJson(report as unknown as JsonValue)}\n`, "utf8");
  writeFileSync(markdownPath, sameSourceDryRunMarkdown(report), "utf8");
  return { jsonPath, markdownPath, report };
}

export function buildFactDedupSameSourceDryRun(records: readonly MtaCanonicalRecord[], options: { runId?: string | undefined; now?: () => Date } = {}): FactDedupSameSourceDryRunReport {
  const now = options.now ?? (() => new Date());
  const runId = options.runId ?? now().toISOString().slice(0, 10);
  const anchors = buildAnchorIndex(records);
  const groups = sameSourceRetirementGroups(records, anchors);
  const byKind = Object.fromEntries(
    FACT_DEDUP_KINDS.map((kind) => {
      const kindGroups = groups.filter((group) => group.kind === kind);
      return [kind, { groups: kindGroups.length, actions: kindGroups.reduce((sum, group) => sum + group.actions.length, 0) }];
    }),
  ) as Record<FactDedupKind, { groups: number; actions: number }>;
  return {
    report_id: `fact-dedup-same-source-dry-run-${runId}`,
    generated_at: now().toISOString(),
    source: "canonical_db",
    record_count: records.length,
    group_count: groups.length,
    action_count: groups.reduce((sum, group) => sum + group.actions.length, 0),
    by_kind: byKind,
    groups,
  };
}

export function factDedupScoutSummaryText(result: FactDedupScoutWriteResult): string {
  const lines = [`Fact-dedup scout: ${relative(repoRoot, result.path)}`];
  for (const kind of FACT_DEDUP_KINDS) {
    const summary = result.report.kind_summaries[kind];
    lines.push(
      `- ${kind}: records=${summary.record_count} same_source_groups=${summary.same_source_true_dup_groups} ` +
        `same_source_records=${summary.same_source_affected_records} cross_source_exact_groups=${summary.cross_source_exact_groups} ` +
        `cross_source_records=${summary.cross_source_affected_records} near_miss_pairs=${summary.near_miss_candidate_pairs}`,
    );
  }
  lines.push(`ACE near-miss canary: ${result.report.ace_pair.present_in_event_near_miss_tier ? "present" : "MISSING"}`);
  if (result.report.stop_conditions.near_miss_volume_exceeded) {
    lines.push(`STOP: near-miss candidate volume ${result.report.stop_conditions.near_miss_pair_count} > ${result.report.stop_conditions.near_miss_pair_limit}`);
  }
  if (result.report.stop_conditions.ace_pair_missing) {
    lines.push(`STOP: ACE canary pair was not present in the event near-miss tier`);
  }
  return lines.join("\n");
}

export function factDedupSameSourceDryRunSummaryText(result: FactDedupSameSourceDryRunWriteResult): string {
  const lines = [
    `Fact-dedup same-source dry-run: ${relative(repoRoot, result.jsonPath)}`,
    `Review table: ${relative(repoRoot, result.markdownPath)}`,
    `Groups: ${result.report.group_count}; proposed removals: ${result.report.action_count}`,
  ];
  for (const kind of FACT_DEDUP_KINDS) {
    const summary = result.report.by_kind[kind];
    lines.push(`- ${kind}: groups=${summary.groups} proposed_removals=${summary.actions}`);
  }
  return lines.join("\n");
}

function summarizeKind(kind: FactDedupKind, records: MtaCanonicalRecord[], anchors: AnchorIndex): FactDedupKindScoutSummary {
  const sameSource = duplicateGroups(records, (record) => sameSourceFactKey(record, anchors), false);
  const crossSource = duplicateGroups(records, (record) => crossSourceExactFactKey(record, anchors), true);
  const nearMiss = kind === "event" ? eventNearMissPairs(records, anchors) : { count: 0, samples: [] as FactDedupPairSample[] };
  return {
    record_count: records.length,
    same_source_true_dup_groups: sameSource.groups.length,
    same_source_affected_records: sameSource.affectedRecords,
    cross_source_exact_groups: crossSource.groups.length,
    cross_source_affected_records: crossSource.affectedRecords,
    near_miss_candidate_pairs: nearMiss.count,
    samples: {
      same_source_true_dup_groups: sameSource.groups.slice(0, 10),
      cross_source_exact_groups: crossSource.groups.slice(0, 10),
      near_miss_candidate_pairs: nearMiss.samples,
    },
  };
}

function sameSourceRetirementGroups(records: readonly MtaCanonicalRecord[], anchors: AnchorIndex): FactDedupRetirementGroup[] {
  const groups = new Map<string, KeyedRecord[]>();
  for (const record of records) {
    if (!isRetirementKind(record.record_kind)) continue;
    const key = sameSourceFactKey(record, anchors);
    if (!key) continue;
    const comparable = factKeyComparable(key);
    groups.set(comparable, [...(groups.get(comparable) ?? []), { record, key, comparable }]);
  }

  return [...groups.values()]
    .filter((items) => items.length > 1)
    .map((items) => retirementGroup(items, records))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.group_id.localeCompare(b.group_id));
}

function retirementGroup(items: KeyedRecord[], records: readonly MtaCanonicalRecord[]): FactDedupRetirementGroup {
  const key = items[0]!.key;
  const ranked = [...items].sort(compareSurvivor);
  const survivor = ranked[0]!.record;
  const losers = ranked.slice(1).map((item) => item.record);
  return {
    group_id: `same-source:${key.kind}:${stableHash(key.parts as JsonObject).slice(0, 16)}`,
    kind: key.kind,
    key: key.key,
    parts: key.parts,
    survivor_record_id: survivor.record_id,
    loser_record_ids: losers.map((record) => record.record_id).sort(),
    payload_difference_fields: payloadDifferenceFields(items.map((item) => item.record)),
    records: ranked.map((item, index) => retirementCard(item.record, key.parts, index + 1)),
    actions: losers.sort((a, b) => a.record_id.localeCompare(b.record_id)).map((loser) => retirementAction(loser, survivor, records)),
  };
}

function retirementAction(loser: MtaCanonicalRecord, survivor: MtaCanonicalRecord, records: readonly MtaCanonicalRecord[]): FactDedupRetirementAction {
  if (loser.record_kind === "relation") {
    return {
      op: "retract_record",
      record_id: loser.record_id,
      guard_payload: sameSourceGuardPayload(loser),
      cascade: relationReferrers(records, loser.record_id),
      reason: `same-source duplicate of ${survivor.record_id}; survivor selected by evidence refs, payload field count, then record_id`,
    };
  }
  return {
    op: "supersede_record",
    record_id: loser.record_id,
    survivor_record_id: survivor.record_id,
    guard_payload: sameSourceGuardPayload(loser),
    cascade: [],
    reason: `same-source duplicate of ${survivor.record_id}; survivor selected by evidence refs, payload field count, then record_id`,
  };
}

function compareSurvivor(left: KeyedRecord, right: KeyedRecord): number {
  return (
    right.record.evidence_refs.length - left.record.evidence_refs.length ||
    payloadFieldCount(right.record) - payloadFieldCount(left.record) ||
    left.record.record_id.localeCompare(right.record.record_id)
  );
}

function retirementCard(record: MtaCanonicalRecord, keyParts: Record<string, string>, rank: number): FactDedupRetirementRecordCard {
  return {
    ...card(record, keyParts),
    evidence_ref_count: record.evidence_refs.length,
    payload_field_count: payloadFieldCount(record),
    survivor_rank: rank,
  };
}

function sameSourceGuardPayload(record: MtaCanonicalRecord): JsonObject {
  const payload = record.payload;
  if (record.record_kind === "relation") return guard(payload, ["relation_kind", "subject_id", "object_id", "as_of_date"]);
  if (record.record_kind === "event") return guard(payload, ["event_family", "event_kind", "date_normalized", "date_text", "date", "event_name", "description"]);
  if (record.record_kind === "metric_claim") return guard(payload, ["metric_name", "unit", "period", "value", "scope"]);
  if (record.record_kind === "claim") return guard(payload, ["claim_text", "description"]);
  if (record.record_kind === "treatment_component") return guard(payload, ["treatment_kind", "treatment_family", "locations", "location", "locations_normalized"]);
  return {};
}

function guard(payload: JsonObject, fields: string[]): JsonObject {
  return Object.fromEntries(fields.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]])) as JsonObject;
}

function payloadFieldCount(record: MtaCanonicalRecord): number {
  return Object.values(record.payload).filter((value) => value !== undefined).length;
}

function payloadDifferenceFields(records: MtaCanonicalRecord[]): string[] {
  const fields = new Set(records.flatMap((record) => Object.keys(record.payload)));
  return [...fields]
    .filter((field) => new Set(records.map((record) => stableJson((record.payload[field] ?? null) as JsonValue))).size > 1)
    .sort();
}

function relationReferrers(records: readonly MtaCanonicalRecord[], recordId: string): string[] {
  return records
    .filter((record) => record.record_kind === "relation" && (record.payload.subject_id === recordId || record.payload.object_id === recordId))
    .map((record) => record.record_id)
    .sort();
}

function sameSourceDryRunMarkdown(report: FactDedupSameSourceDryRunReport): string {
  const lines = [
    `# ${report.report_id}`,
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Groups: ${report.group_count}`,
    `Proposed removals: ${report.action_count}`,
    "",
    "| Kind | Group | Survivor | Losers | Payload Diff Fields | Key Parts |",
    "|---|---|---|---|---|---|",
  ];
  for (const group of report.groups) {
    lines.push(
      [
        group.kind,
        group.group_id,
        group.survivor_record_id,
        group.loser_record_ids.join("<br>"),
        group.payload_difference_fields.join(", ") || "(none)",
        Object.entries(group.parts)
          .map(([key, value]) => `${key}=${value || "(empty)"}`)
          .join("<br>"),
      ]
        .map(markdownCell)
        .join(" | ")
        .replace(/^/u, "| ")
        .replace(/$/u, " |"),
    );
  }
  return `${lines.join("\n")}\n`;
}

function markdownCell(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\n/gu, "<br>");
}

function isRetirementKind(kind: string): kind is FactDedupKind {
  return (FACT_DEDUP_KINDS as readonly string[]).includes(kind);
}

function duplicateGroups(
  records: MtaCanonicalRecord[],
  keyFor: (record: MtaCanonicalRecord) => FactKey | undefined,
  requireCrossSource: boolean,
): { groups: FactDedupGroupSample[]; affectedRecords: number } {
  const groups = new Map<string, KeyedRecord[]>();
  for (const record of records) {
    const key = keyFor(record);
    if (!key) continue;
    const comparable = factKeyComparable(key);
    groups.set(comparable, [...(groups.get(comparable) ?? []), { record, key, comparable }]);
  }

  const duplicateGroups = [...groups.values()]
    .filter((items) => items.length > 1)
    .filter((items) => !requireCrossSource || new Set(items.map((item) => item.record.source_id)).size > 1)
    .map((items) => groupSample(items))
    .sort((a, b) => b.member_count - a.member_count || a.key.localeCompare(b.key));
  return {
    groups: duplicateGroups,
    affectedRecords: duplicateGroups.reduce((sum, group) => sum + group.member_count, 0),
  };
}

function groupSample(items: KeyedRecord[]): FactDedupGroupSample {
  const sorted = [...items].sort((a, b) => a.record.record_id.localeCompare(b.record.record_id));
  const key = sorted[0]!.key;
  return {
    key: key.key,
    parts: key.parts,
    member_count: sorted.length,
    record_ids: sorted.map((item) => item.record.record_id),
    records: sorted.slice(0, 10).map((item) => card(item.record, item.key.parts)),
  };
}

function eventNearMissPairs(records: MtaCanonicalRecord[], anchors: AnchorIndex): { count: number; samples: FactDedupPairSample[] } {
  const buckets = new Map<string, NearMissRecord[]>();
  for (const record of records) {
    const bucket = eventNearMissBucketKey(record, anchors);
    const exact = crossSourceExactFactKey(record, anchors);
    if (!bucket || !exact) continue;
    const comparable = factKeyComparable(bucket);
    buckets.set(comparable, [...(buckets.get(comparable) ?? []), { record, bucket, nameKey: exact.parts.name_token_hash ?? "" }]);
  }

  let count = 0;
  const samples: FactDedupPairSample[] = [];
  const sortedBuckets = [...buckets.values()].sort((a, b) => a[0]!.bucket.key.localeCompare(b[0]!.bucket.key));
  for (const bucketRecords of sortedBuckets) {
    const sorted = [...bucketRecords].sort((a, b) => a.record.record_id.localeCompare(b.record.record_id));
    for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
        const left = sorted[leftIndex]!;
        const right = sorted[rightIndex]!;
        if (left.record.source_id === right.record.source_id) continue;
        if (left.nameKey === right.nameKey) continue;
        count += 1;
        if (samples.length < 10 || isAcePair([left.record.record_id, right.record.record_id])) {
          const sample = pairSample(left, right);
          if (!samples.some((existing) => samePair(existing.record_ids, sample.record_ids))) samples.push(sample);
        }
      }
    }
  }
  return { count, samples: samples.slice(0, 25) };
}

function pairSample(left: NearMissRecord, right: NearMissRecord): FactDedupPairSample {
  return {
    bucket_key: left.bucket.key,
    bucket_parts: left.bucket.parts,
    record_ids: [left.record.record_id, right.record.record_id],
    records: [card(left.record, { ...left.bucket.parts, name_token_hash: left.nameKey }), card(right.record, { ...right.bucket.parts, name_token_hash: right.nameKey })],
  };
}

function card(record: MtaCanonicalRecord, keyParts?: Record<string, string>): FactDedupRecordCard {
  return {
    record_id: record.record_id,
    display_name: record.display_name,
    source_id: record.source_id,
    anchor_record_id: keyParts?.anchor_record_id,
    key_parts: keyParts,
  };
}

function eventNearMissPairExists(samples: FactDedupPairSample[], pair: readonly [string, string]): boolean {
  return samples.some((sample) => samePair(sample.record_ids, pair));
}

function isAcePair(pair: readonly [string, string]): boolean {
  return samePair(pair, FACT_DEDUP_ACE_PAIR);
}

function samePair(a: readonly [string, string], b: readonly [string, string]): boolean {
  return [...a].sort().join("\0") === [...b].sort().join("\0");
}
