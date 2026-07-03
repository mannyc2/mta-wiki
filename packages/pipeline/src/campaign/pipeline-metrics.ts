import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { readConfig } from "@mta-wiki/core/config";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  identityPairKey,
  isGlobalRecordKind,
  readIdentityDoNotMergeOverrides,
  readIdentityOverrides,
  resolveIdentityCandidates,
  type GlobalMtaRecordKind,
} from "@mta-wiki/db/identity";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/materialize";
import { canonicalDbPath, openCanonicalDb } from "@mta-wiki/db/canonical-db";
import { danglingReferences, derivedRelationCoverage } from "@mta-wiki/pipeline/records/derived-relations";
import { gapCountsByClass } from "@mta-wiki/pipeline/materialize/gap-report";
import { retiredSubmissionIds } from "@mta-wiki/pipeline/records/submission-overrides";
import { readSubmissionEntries } from "@mta-wiki/pipeline/records/submissions";
import type { MtaCanonicalRecord, MtaObservationKind, MtaSubmissionEntry } from "@mta-wiki/db/types";

const DUPLICATE_CANDIDATE_MIN_SCORE = 85;

const ORPHAN_PROBE_KINDS = new Set<MtaObservationKind>([
  "entity",
  "project",
  "route",
  "corridor",
  "treatment_component",
  "metric_claim",
  "claim",
  "event",
]);

export type PipelineKindMetrics = {
  observation_kind: string;
  submissions: number;
  accepted: number;
  rejected: number;
  acceptance_rate: number;
};

export type PipelineRunMetrics = {
  run_id: string;
  submissions: number;
  accepted: number;
  rejected: number;
  acceptance_rate: number;
  usage?: {
    request_count: number;
    total_tokens: number;
    estimated_cost: number;
    cost_per_accepted_submission?: number | undefined;
  } | undefined;
};

export type PipelineDuplicateCandidatePair = {
  kind: GlobalMtaRecordKind;
  record_ids: [string, string];
  score: number;
  reasons: string[];
};

export type PipelineReport = {
  generated_at: string;
  scope: { run_ids: string[] | undefined };
  submissions: {
    total: number;
    accepted: number;
    rejected: number;
    retired: number;
    acceptance_rate: number;
    by_kind: PipelineKindMetrics[];
    rejection_reasons: Record<string, number>;
  };
  runs: PipelineRunMetrics[];
  identity: {
    link_vs_new: {
      global_submissions: number;
      linked: number;
      created_new: number;
      unresolved: number;
      link_ratio: number;
    };
    alias_count: number;
    do_not_merge_pair_count: number;
    duplicate_candidate_pairs: number;
    duplicate_clusters: number;
    duplicate_candidates: PipelineDuplicateCandidatePair[];
  };
  graph: {
    nodes_probed: number;
    connected: number;
    orphans: number;
    orphan_rate: number;
    relation_records: number;
    relation_edges_resolved: number;
    relation_edges_unresolved: number;
    orphans_by_kind: Record<string, number>;
  };
  canonical: {
    total_records: number;
    by_kind: Record<string, number>;
  };
  /** S2.2 / C2.6: source publication-date coverage. `source_undated` is the step-2 gate (≤ 10%);
   *  the named residue is the reviewed-correction queue (data/source-date-overrides.json). */
  sources: {
    total: number;
    dated: number;
    undated: number;
    undated_rate: number;
    by_date_provenance: Record<string, number>;
    undated_source_ids: string[];
  };
  /** S2.4 / C3: edge assertion qualifiers + the dangling-reference (ambiguity-is-data) feed. */
  relations: {
    total_edges: number;
    derived_edges: number;
    authored_edges: number;
    by_assertion_status: Record<string, number>;
    edges_with_as_of_date: number;
    derived_value_count: number;
    derived_resolved: number;
    dangling_total: number;
    dangling_ambiguous: number;
    dangling_unresolved: number;
  };
  /** S2.8 / D1: per-class gap counts (the wave-over-wave trend surface). */
  gaps: Record<string, number>;
};

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

function rejectionReasonKey(issue: string) {
  const colon = issue.indexOf(":");
  const head = colon > 0 && colon < 72 ? issue.slice(0, colon) : issue;
  return head.length > 72 ? `${head.slice(0, 72)}…` : head;
}

function runUsage(runId: string): PipelineRunMetrics["usage"] {
  const eventsPath = join(repoRoot, readConfig().transcriptsDir, "runs", runId, "events.jsonl");
  if (!existsSync(eventsPath)) return undefined;

  let usage: PipelineRunMetrics["usage"];
  for (const line of readFileSync(eventsPath, "utf8").split(/\r?\n/u)) {
    if (!line.includes('"type":"usage_recorded"')) continue;
    try {
      const event = JSON.parse(line) as { type?: string; requestCount?: number; totalTokens?: number; cost?: number };
      if (event.type !== "usage_recorded") continue;
      usage = {
        request_count: event.requestCount ?? usage?.request_count ?? 0,
        total_tokens: event.totalTokens ?? usage?.total_tokens ?? 0,
        estimated_cost: event.cost ?? usage?.estimated_cost ?? 0,
      };
    } catch {
      // skip malformed lines; events.jsonl is advisory for metrics
    }
  }
  return usage;
}

function submissionMetricsByKind(entries: MtaSubmissionEntry[]): PipelineKindMetrics[] {
  const byKind = new Map<string, { submissions: number; accepted: number }>();
  for (const entry of entries) {
    const kind = entry.tool_args.observation_kind ?? "unknown";
    const bucket = byKind.get(kind) ?? { submissions: 0, accepted: 0 };
    bucket.submissions += 1;
    if (entry.validation.state === "accepted") bucket.accepted += 1;
    byKind.set(kind, bucket);
  }
  return [...byKind.entries()]
    .map(([kind, bucket]) => ({
      observation_kind: kind,
      submissions: bucket.submissions,
      accepted: bucket.accepted,
      rejected: bucket.submissions - bucket.accepted,
      acceptance_rate: rate(bucket.accepted, bucket.submissions),
    }))
    .sort((a, b) => b.submissions - a.submissions || a.observation_kind.localeCompare(b.observation_kind));
}

function runMetrics(entries: MtaSubmissionEntry[]): PipelineRunMetrics[] {
  const byRun = new Map<string, { submissions: number; accepted: number }>();
  for (const entry of entries) {
    const bucket = byRun.get(entry.run_id) ?? { submissions: 0, accepted: 0 };
    bucket.submissions += 1;
    if (entry.validation.state === "accepted") bucket.accepted += 1;
    byRun.set(entry.run_id, bucket);
  }

  return [...byRun.entries()]
    .map(([runId, bucket]) => {
      const usage = runUsage(runId);
      if (usage && usage.estimated_cost > 0 && bucket.accepted > 0) {
        usage.cost_per_accepted_submission = Number((usage.estimated_cost / bucket.accepted).toFixed(6));
      }
      return {
        run_id: runId,
        submissions: bucket.submissions,
        accepted: bucket.accepted,
        rejected: bucket.submissions - bucket.accepted,
        acceptance_rate: rate(bucket.accepted, bucket.submissions),
        usage,
      };
    })
    .sort((a, b) => a.run_id.localeCompare(b.run_id));
}

function duplicateCandidatePairs(records: MtaCanonicalRecord[]): PipelineDuplicateCandidatePair[] {
  const doNotMerge = readIdentityDoNotMergeOverrides();
  const suppressed = new Set<string>();
  for (const [kind, pairs] of Object.entries(doNotMerge.pairs ?? {})) {
    for (const pair of pairs ?? []) {
      const ids = pair.record_ids;
      if (Array.isArray(ids) && ids.length === 2) suppressed.add(`${kind}:${identityPairKey(ids[0]!, ids[1]!)}`);
    }
  }

  // Bucket global records by kind once, then resolve each record against only its own kind.
  // resolveIdentityCandidates discards other kinds anyway, so this is byte-identical (the per-kind
  // record order and overall kind order match the original flat scan) but turns the O(n²) scan over
  // the whole corpus into O(Σ kind²) — the kind index made load-bearing without changing output.
  const recordsByKind = new Map<GlobalMtaRecordKind, MtaCanonicalRecord[]>();
  for (const record of records) {
    if (!isGlobalRecordKind(record.record_kind)) continue;
    const list = recordsByKind.get(record.record_kind);
    if (list) list.push(record);
    else recordsByKind.set(record.record_kind, [record]);
  }

  const found = new Map<string, PipelineDuplicateCandidatePair>();
  for (const [kind, kindRecords] of recordsByKind) {
    for (const record of kindRecords) {
      const candidates = resolveIdentityCandidates(kind, record.display_name, kindRecords, 8);
      for (const candidate of candidates) {
        if (candidate.record_id === record.record_id) continue;
        if (candidate.score < DUPLICATE_CANDIDATE_MIN_SCORE) continue;
        const pairKey = identityPairKey(record.record_id, candidate.record_id);
        if (suppressed.has(`${kind}:${pairKey}`)) continue;
        const dedupeKey = `${kind}:${pairKey}`;
        const existing = found.get(dedupeKey);
        if (existing && existing.score >= candidate.score) continue;
        found.set(dedupeKey, {
          kind,
          record_ids: [pairKey.split("<>")[0]!, pairKey.split("<>")[1]!],
          score: candidate.score,
          reasons: candidate.reasons,
        });
      }
    }
  }

  return [...found.values()].sort((a, b) => b.score - a.score || a.record_ids[0].localeCompare(b.record_ids[0]));
}

function duplicateClusterCount(pairs: PipelineDuplicateCandidatePair[]) {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const next = parent.get(id);
    if (next === undefined || next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const pair of pairs) {
    const [left, right] = pair.record_ids;
    if (!parent.has(left)) parent.set(left, left);
    if (!parent.has(right)) parent.set(right, right);
    union(left, right);
  }

  const roots = new Set<string>();
  for (const id of parent.keys()) roots.add(find(id));
  return roots.size;
}

function sourceMetrics(records: MtaCanonicalRecord[]): PipelineReport["sources"] {
  const sources = records.filter((record) => record.record_kind === "source");
  const byProvenance: Record<string, number> = {};
  const undatedSourceIds: string[] = [];
  let dated = 0;
  for (const record of sources) {
    if (typeof record.payload.published_date_normalized === "string") {
      dated += 1;
      // Payload-derived dates (S2.1) carry no provenance marker; the backfill fold (S2.2) does.
      const provenance = typeof record.payload.published_date_provenance === "string" ? record.payload.published_date_provenance : "payload";
      byProvenance[provenance] = (byProvenance[provenance] ?? 0) + 1;
    } else {
      undatedSourceIds.push(record.source_id);
    }
  }
  return {
    total: sources.length,
    dated,
    undated: sources.length - dated,
    undated_rate: rate(sources.length - dated, sources.length),
    by_date_provenance: byProvenance,
    undated_source_ids: undatedSourceIds.sort(),
  };
}

function relationMetrics(records: MtaCanonicalRecord[]): PipelineReport["relations"] {
  const edges = records.filter((record) => record.record_kind === "relation");
  const byAssertionStatus: Record<string, number> = {};
  let derivedEdges = 0;
  let withAsOfDate = 0;
  for (const edge of edges) {
    if (edge.payload.derived_relation === true || edge.review_state === "derived") derivedEdges += 1;
    const status = typeof edge.payload.assertion_status === "string" ? edge.payload.assertion_status : "unknown";
    byAssertionStatus[status] = (byAssertionStatus[status] ?? 0) + 1;
    if (typeof edge.payload.as_of_date === "string") withAsOfDate += 1;
  }
  const coverage = derivedRelationCoverage(records);
  const dangling = danglingReferences(records);
  return {
    total_edges: edges.length,
    derived_edges: derivedEdges,
    authored_edges: edges.length - derivedEdges,
    by_assertion_status: byAssertionStatus,
    edges_with_as_of_date: withAsOfDate,
    derived_value_count: coverage.reduce((sum, c) => sum + c.value_count, 0),
    derived_resolved: coverage.reduce((sum, c) => sum + c.derived_count + c.already_present_count, 0),
    dangling_total: dangling.length,
    dangling_ambiguous: dangling.filter((d) => d.reason === "ambiguous").length,
    dangling_unresolved: dangling.filter((d) => d.reason === "unresolved").length,
  };
}

function graphMetrics(records: MtaCanonicalRecord[]): PipelineReport["graph"] {
  const aliasToId = new Map<string, string>();
  const probed = new Map<string, MtaObservationKind>();
  for (const record of records) {
    aliasToId.set(record.record_id, record.record_id);
    for (const alias of record.record_aliases ?? []) aliasToId.set(alias, record.record_id);
    if (ORPHAN_PROBE_KINDS.has(record.record_kind)) probed.set(record.record_id, record.record_kind);
  }

  const connected = new Set<string>();
  let relationRecords = 0;
  let resolvedEdges = 0;
  let unresolvedEdges = 0;
  for (const record of records) {
    if (record.record_kind !== "relation") continue;
    relationRecords += 1;
    const subjectId = typeof record.payload.subject_id === "string" ? aliasToId.get(record.payload.subject_id) : undefined;
    const objectId = typeof record.payload.object_id === "string" ? aliasToId.get(record.payload.object_id) : undefined;
    if (subjectId && objectId) {
      resolvedEdges += 1;
      connected.add(subjectId);
      connected.add(objectId);
    } else {
      unresolvedEdges += 1;
    }
  }

  const orphansByKind: Record<string, number> = {};
  let orphans = 0;
  for (const [recordId, kind] of probed) {
    if (connected.has(recordId)) continue;
    orphans += 1;
    orphansByKind[kind] = (orphansByKind[kind] ?? 0) + 1;
  }

  return {
    nodes_probed: probed.size,
    connected: probed.size - orphans,
    orphans,
    orphan_rate: rate(orphans, probed.size),
    relation_records: relationRecords,
    relation_edges_resolved: resolvedEdges,
    relation_edges_unresolved: unresolvedEdges,
    orphans_by_kind: orphansByKind,
  };
}

export function generatePipelineReport(options: { runIds?: string[] | undefined } = {}): PipelineReport {
  const allEntries = readSubmissionEntries();
  const runIds = options.runIds && options.runIds.length > 0 ? options.runIds : undefined;
  const entries = runIds ? allEntries.filter((entry) => runIds.includes(entry.run_id)) : allEntries;
  if (runIds && entries.length === 0) {
    throw new Error(`No submissions found for run ids: ${runIds.join(", ")}`);
  }

  const retiredIds = retiredSubmissionIds();
  const accepted = entries.filter((entry) => entry.validation.state === "accepted");
  const retired = entries.filter((entry) => retiredIds.has(entry.submission_id));

  const rejectionReasons: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.validation.state === "accepted") continue;
    for (const issue of entry.validation.issues) {
      const key = rejectionReasonKey(issue);
      rejectionReasons[key] = (rejectionReasons[key] ?? 0) + 1;
    }
  }

  const globalSubmissions = accepted.filter((entry) => isGlobalRecordKind(entry.tool_args.observation_kind));
  const linked = globalSubmissions.filter((entry) => Boolean(entry.tool_args.target_record_id)).length;
  const createdNew = globalSubmissions.filter((entry) => !entry.tool_args.target_record_id && entry.tool_args.create_new === true).length;
  const unresolved = globalSubmissions.length - linked - createdNew;

  const overrides = readIdentityOverrides();
  const aliasCount = Object.values(overrides.aliases ?? {}).reduce((total, aliases) => total + Object.keys(aliases ?? {}).length, 0);
  const doNotMergePairCount = Object.values(readIdentityDoNotMergeOverrides().pairs ?? {}).reduce(
    (total, pairs) => total + (pairs?.length ?? 0),
    0,
  );

  const records = readCanonicalRecords();
  const duplicates = duplicateCandidatePairs(records);

  const byKindCanonical: Record<string, number> = {};
  for (const record of records) {
    byKindCanonical[record.record_kind] = (byKindCanonical[record.record_kind] ?? 0) + 1;
  }

  return {
    generated_at: new Date().toISOString(),
    scope: { run_ids: runIds },
    submissions: {
      total: entries.length,
      accepted: accepted.length,
      rejected: entries.length - accepted.length,
      retired: retired.length,
      acceptance_rate: rate(accepted.length, entries.length),
      by_kind: submissionMetricsByKind(entries),
      rejection_reasons: rejectionReasons,
    },
    runs: runMetrics(entries),
    identity: {
      link_vs_new: {
        global_submissions: globalSubmissions.length,
        linked,
        created_new: createdNew,
        unresolved,
        link_ratio: rate(linked, globalSubmissions.length),
      },
      alias_count: aliasCount,
      do_not_merge_pair_count: doNotMergePairCount,
      duplicate_candidate_pairs: duplicates.length,
      duplicate_clusters: duplicateClusterCount(duplicates),
      duplicate_candidates: duplicates.slice(0, 100),
    },
    graph: graphMetrics(records),
    canonical: {
      total_records: records.length,
      by_kind: byKindCanonical,
    },
    sources: sourceMetrics(records),
    relations: relationMetrics(records),
    gaps: gapCounts(),
  };
}

function gapCounts(): Record<string, number> {
  if (!existsSync(canonicalDbPath())) return {};
  const db = openCanonicalDb(canonicalDbPath(), { readonly: true });
  try {
    return gapCountsByClass(db);
  } finally {
    db.close();
  }
}

export function writePipelineReport(report: PipelineReport, label = "pipeline-report"): string {
  const dir = join(repoRoot, "data", "audits");
  mkdirSync(dir, { recursive: true });
  const stamp = report.generated_at.replace(/[:.]/gu, "-");
  const path = join(dir, `${stamp}_${label}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return relative(repoRoot, path);
}
