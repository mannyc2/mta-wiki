import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableHash } from "@mta-wiki/db/stable-json";
import { readCanonicalRecords, pageRelativePathForCanonicalRecord } from "@mta-wiki/pipeline/materialize/materialize";
import { retiredSubmissionIds } from "@mta-wiki/pipeline/records/submission-overrides";
import { readSubmissionEntries } from "@mta-wiki/pipeline/records/submissions";
import {
  verifyWriterCitations,
  verifyWriterEdits,
  writerRegionPresent,
  type WriterCitationVerification,
  type WriterEditIssue,
  type WriterEditVerification,
} from "@mta-wiki/pipeline/materialize/writer-change-gate";
import { sourceBlockById } from "@mta-wiki/pipeline/sources/source-prep";
import { validateRepo } from "@mta-wiki/pipeline/validate";
import { readReadinessRows, type ReadinessRow } from "./campaign-readiness.js";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaSubmissionEntry } from "@mta-wiki/db/types";

const PAGE_BEARING_KINDS = new Set(["source", "entity", "project", "corridor", "route", "source_gap"]);
const WRITER_PRIORITY_KINDS = new Set(["project", "corridor", "route", "entity", "source_gap"]);
const WRITER_QUEUE_KINDS = new Set(["project", "corridor", "route", "source_gap"]);
const DATA_ONLY_WRITER_KINDS = new Set(["claim", "metric_claim", "event", "treatment_component", "relation"]);

export type PostIngestPlanOptions = {
  campaignId?: string | undefined;
  wave?: number | undefined;
  sourceId?: string | undefined;
};

export type WriterBacklogQueueOptions = {
  limit?: number | undefined;
  recordKinds?: string[] | undefined;
  pagePaths?: string[] | undefined;
};

export type WriterBacklogPacketOptions = {
  limit?: number | undefined;
  offset?: number | undefined;
  recordKinds?: string[] | undefined;
  pagePaths?: string[] | undefined;
};

export type WriterBacklogDispatchPlanOptions = {
  packetsPerShard?: number | undefined;
  maxShards?: number | undefined;
  packetSetPath?: string | undefined;
};

export type WriterBacklogDispatchClaimOptions = {
  limit?: number | undefined;
  owner?: string | undefined;
};

export type WriterBacklogDispatchNextShardOptions = {
  shardId?: string | undefined;
};

export type WriterBacklogDispatchHandoffBatchOptions = {
  limit?: number | undefined;
  skip?: number | undefined;
};

export type WriterBacklogPacketSetManifestOptions = {
  label?: string | undefined;
};

export type SubmissionSourceIdDriftCandidate = {
  submission_id: string;
  run_id: string;
  observation_kind: string;
  local_observation_id: string;
  source_id: string;
  source_exists: boolean;
  evidence_source_ids: string[];
  evidence_all_same: boolean;
  likely_correct_source_id?: string | undefined;
  source_mismatch: boolean;
  likely_truncated: boolean;
};

export type SubmissionSourceIdDriftAudit = {
  ok: boolean;
  summary: {
    total_candidates: number;
    missing_source_id: number;
    source_mismatch: number;
    single_evidence_likely_truncated: number;
    by_kind: Record<string, number>;
  };
  candidates: SubmissionSourceIdDriftCandidate[];
};

export type CodexPostIngestGoalAuditRequirement = {
  requirement: string;
  status: "complete" | "clean" | "prepared_but_paused" | "not_complete" | "blocked";
  evidence: Record<string, JsonValue>;
  conclusion: string;
};

export type CodexPostIngestGoalAudit = {
  generated_at: string;
  objective: string;
  overall_status: "complete" | "not_complete_writer_execution_paused" | "needs_attention";
  completion_decision: string;
  campaign_id: string;
  requirements: CodexPostIngestGoalAuditRequirement[];
  live_gates: {
    validation: {
      issue_count: number;
      submissions: number;
      canonical_records: number;
      wiki_pages: number;
    };
    post_ingest_audit: PostIngestCoverageAudit;
    source_id_drift_audit: SubmissionSourceIdDriftAudit;
    writer_readiness?: WriterBacklogDispatchReadinessReport | undefined;
    writer_prompt_coverage?: WriterBacklogDispatchHandoffPromptCoverageVerification | undefined;
  };
  commands_not_run: string[];
  path: string;
  markdown_path: string;
};

export type PostIngestPlanRecordCard = {
  record_id: string;
  record_kind: string;
  display_name: string;
  source_ids: string[];
  page_path?: string | undefined;
  payload_keys: string[];
  evidence_count: number;
};

export type PostIngestWriterBatch = {
  source_id: string;
  page_bearing_records: number;
  writer_priority_pages: string[];
  data_only_supporting_records: number;
  command: string;
};

export type PostIngestPlan = {
  generated_at: string;
  scope: {
    campaign_id?: string | undefined;
    wave?: number | undefined;
    source_ids: string[];
    wave_report_path?: string | undefined;
    recovered_from?: string | undefined;
  };
  validation: {
    issue_count: number;
    issues_by_code: Record<string, number>;
    duplicate_global_identity: number;
  };
  artifacts: Record<string, string | undefined>;
  records: {
    total_related: number;
    counts_by_kind: Record<string, number>;
    page_bearing: PostIngestPlanRecordCard[];
    data_only_supporting: PostIngestPlanRecordCard[];
  };
  identity_review: {
    clusters: number;
    clusters_in_scope: number;
    suggestions_in_scope: number;
    parse_errors_in_scope: number;
    quarantined_in_scope: number;
  };
  writer_batches: PostIngestWriterBatch[];
  recommended_steps: string[];
  path: string;
};

export type WriterBacklogQueueItem = {
  page_path: string;
  record_id: string;
  record_kind: string;
  display_name: string;
  source_ids: string[];
  evidence_count: number;
  data_only_supporting_records: number;
  score: number;
  suggested_subagent_task: string;
};

export type WriterBacklogQueue = {
  generated_at: string;
  scope: {
    empty_writer_regions: number;
    limit: number;
    record_kinds?: string[] | undefined;
    page_paths?: string[] | undefined;
  };
  items: WriterBacklogQueueItem[];
  path: string;
};

export type WriterBacklogPacketRecord = PostIngestPlanRecordCard & {
  evidence_refs?: Array<{
    source_id: string;
    block_id: string;
  }> | undefined;
  evidence_snippets: Array<{
    source_id: string;
    block_id: string;
    text: string;
  }>;
};

export type WriterBacklogPacket = {
  page_path: string;
  record_id: string;
  record_kind: string;
  display_name: string;
  source_ids: string[];
  queue_position?: number | undefined;
  queue_item_hash?: string | undefined;
  current_writer_region_empty: boolean;
  target_record: WriterBacklogPacketRecord;
  supporting_records: WriterBacklogPacketRecord[];
  instructions: string[];
};

export type WriterBacklogPacketRun = {
  generated_at: string;
  scope: {
    empty_writer_regions: number;
    selected_packets: number;
    limit: number;
    offset: number;
    record_kinds?: string[] | undefined;
    page_paths?: string[] | undefined;
    queue_fingerprint?: string | undefined;
  };
  packets: WriterBacklogPacket[];
  json_path: string;
  markdown_path: string;
};

export type WriterBacklogPacketSetManifestEntry = {
  offset: number;
  path: string;
  packet_count: number;
  page_paths: string[];
};

export type WriterBacklogPacketSetManifest = {
  generated_at: string;
  label: string;
  scope: {
    empty_writer_regions: number;
    packet_coverage: WriterBacklogPacketCoverage;
    source: string;
  };
  packet_files: string[];
  packets: WriterBacklogPacketSetManifestEntry[];
  path: string;
  markdown_path: string;
};

export type WriterBacklogPacketSetManifestVerificationIssue = {
  path?: string | undefined;
  code: string;
  message: string;
};

export type WriterBacklogPacketSetManifestVerification = {
  ok: boolean;
  path: string;
  file_count: number;
  packet_count: number;
  unique_page_count: number;
  duplicate_page_count: number;
  coverage: WriterBacklogPacketCoverage;
  issues: WriterBacklogPacketSetManifestVerificationIssue[];
};

export type WriterBacklogDispatchShard = {
  shard_id: string;
  packet_files: string[];
  packet_count: number;
  page_paths: string[];
  preflight_command: string;
  post_edit_command: string;
  suggested_subagent_prompt: string;
};

export type WriterBacklogDispatchPlan = {
  generated_at: string;
  scope: {
    empty_writer_regions: number;
    packet_coverage: WriterBacklogPacketCoverage;
    packets_per_shard: number;
    max_shards?: number | undefined;
    execution_policy: string;
  };
  shards: WriterBacklogDispatchShard[];
  path: string;
  markdown_path: string;
};

export type WriterBacklogDispatchPlanVerificationIssue = {
  shard_id?: string | undefined;
  code: string;
  message: string;
};

export type WriterBacklogDispatchPlanVerification = {
  ok: boolean;
  path: string;
  shard_count: number;
  packet_file_count: number;
  packet_count: number;
  unique_page_count: number;
  duplicate_page_count: number;
  issues: WriterBacklogDispatchPlanVerificationIssue[];
};

export type WriterBacklogDispatchShardStatus = {
  shard_id: string;
  packet_count: number;
  page_count: number;
  empty_pages: number;
  non_empty_pages: number;
  missing_pages: number;
  state: "not_started" | "in_progress" | "ready_for_post_edit_verification" | "stale_or_missing";
  claim?: {
    owner: string;
    claim_id: string;
    path: string;
    generated_at: string;
  } | undefined;
  preflight_command: string;
  post_edit_command: string;
};

export type WriterBacklogDispatchPlanStatus = {
  path: string;
  shard_count: number;
  packet_count: number;
  empty_pages: number;
  non_empty_pages: number;
  missing_pages: number;
  not_started_shards: number;
  in_progress_shards: number;
  ready_for_post_edit_verification_shards: number;
  stale_or_missing_shards: number;
  claimed_shards: number;
  unclaimed_not_started_shards: number;
  shards: WriterBacklogDispatchShardStatus[];
};

export type WriterBacklogDispatchPlanStatusReport = {
  generated_at: string;
  dispatch_plan_path: string;
  status: WriterBacklogDispatchPlanStatus;
  path: string;
  markdown_path: string;
};

export type WriterBacklogDispatchNextShardReport = {
  generated_at: string;
  dispatch_plan_path: string;
  requested_shard_id?: string | undefined;
  selected: boolean;
  reason?: string | undefined;
  execution_policy: string;
  shard?: WriterBacklogDispatchClaimShard | undefined;
  claim_preflight_command?: string | undefined;
  path: string;
  markdown_path: string;
};

export type WriterBacklogDispatchHandoffBatchReport = {
  generated_at: string;
  dispatch_plan_path: string;
  requested_limit: number;
  requested_skip: number;
  selected_count: number;
  available_claimed_not_started_shards: number;
  execution_policy: string;
  shards: Array<{
    shard: WriterBacklogDispatchClaimShard;
    claim_preflight_command?: string | undefined;
  }>;
  path: string;
  markdown_path: string;
};

export type WriterBacklogDispatchHandoffBatchVerificationIssue = {
  shard_id?: string | undefined;
  path?: string | undefined;
  code: string;
  message: string;
};

export type WriterBacklogDispatchHandoffBatchVerification = {
  ok: boolean;
  path: string;
  dispatch_plan_path?: string | undefined;
  selected_count: number;
  unique_shard_count: number;
  claim_file_count: number;
  packet_file_count: number;
  packet_count: number;
  page_count: number;
  checked_source_blocks: number;
  issues: WriterBacklogDispatchHandoffBatchVerificationIssue[];
};

export type WriterBacklogDispatchHandoffPromptFile = {
  shard_id: string;
  owner?: string | undefined;
  packet_count: number;
  page_count: number;
  path: string;
};

export type WriterBacklogDispatchHandoffPromptsReport = {
  generated_at: string;
  handoff_batch_path: string;
  verification: WriterBacklogDispatchHandoffBatchVerification;
  prompt_count: number;
  execution_policy: string;
  prompts: WriterBacklogDispatchHandoffPromptFile[];
  path: string;
  markdown_path: string;
};

export type WriterBacklogDispatchHandoffPromptsVerificationIssue = {
  shard_id?: string | undefined;
  path?: string | undefined;
  code: string;
  message: string;
};

export type WriterBacklogDispatchHandoffPromptsVerification = {
  ok: boolean;
  path: string;
  handoff_batch_path?: string | undefined;
  prompt_count: number;
  existing_prompt_count: number;
  unique_shard_count: number;
  issues: WriterBacklogDispatchHandoffPromptsVerificationIssue[];
};

export type WriterBacklogDispatchHandoffPromptCoverageIssue = {
  shard_id?: string | undefined;
  path?: string | undefined;
  code: string;
  message: string;
};

export type WriterBacklogDispatchHandoffPromptCoverageReport = {
  path: string;
  ok: boolean;
  prompt_count: number;
  existing_prompt_count: number;
  unique_shard_count: number;
};

export type WriterBacklogDispatchHandoffPromptCoverageVerification = {
  ok: boolean;
  dispatch_plan_path: string;
  prompt_report_count: number;
  prompt_count: number;
  existing_prompt_count: number;
  expected_shard_count: number;
  covered_shard_count: number;
  duplicate_shard_count: number;
  missing_shard_count: number;
  unexpected_shard_count: number;
  reports: WriterBacklogDispatchHandoffPromptCoverageReport[];
  issues: WriterBacklogDispatchHandoffPromptCoverageIssue[];
};

export type WriterBacklogDispatchHandoffPromptCoverageRun = {
  generated_at: string;
  dispatch_plan_path: string;
  prompt_report_paths: string[];
  verification: WriterBacklogDispatchHandoffPromptCoverageVerification;
  execution_policy: string;
  next_when_unpaused: string;
  path: string;
  markdown_path: string;
};

export type WriterBacklogDispatchClaimShard = WriterBacklogDispatchShardStatus & {
  packet_files: string[];
  page_paths: string[];
  suggested_subagent_prompt: string;
};

export type WriterBacklogDispatchClaim = {
  claim_id: string;
  generated_at: string;
  owner: string;
  dispatch_plan_path: string;
  requested_limit: number;
  claimed_count: number;
  skipped_already_claimed_shards: number;
  available_unclaimed_shards: number;
  execution_policy: string;
  claim_preflight_command?: string | undefined;
  shards: WriterBacklogDispatchClaimShard[];
  path: string;
  markdown_path: string;
};

export type WriterBacklogDispatchClaimVerificationIssue = {
  shard_id?: string | undefined;
  code: string;
  message: string;
};

export type WriterBacklogDispatchClaimVerification = {
  ok: boolean;
  path: string;
  dispatch_plan_path?: string | undefined;
  owner?: string | undefined;
  claimed_count: number;
  unique_claimed_shards: number;
  issues: WriterBacklogDispatchClaimVerificationIssue[];
};

export type WriterBacklogDispatchClaimsVerificationIssue = WriterBacklogDispatchClaimVerificationIssue & {
  path?: string | undefined;
};

export type WriterBacklogDispatchClaimsVerification = {
  ok: boolean;
  dispatch_plan_path: string;
  claim_file_count: number;
  claimed_count: number;
  unique_claimed_shards: number;
  unclaimed_not_started_shards: number;
  files: WriterBacklogDispatchClaimVerification[];
  issues: WriterBacklogDispatchClaimsVerificationIssue[];
};

export type WriterBacklogDispatchReadinessReport = {
  generated_at: string;
  ok: boolean;
  execution_policy: string;
  dispatch_plan_path: string;
  packet_set_path?: string | undefined;
  claim_execution: Array<{
    path: string;
    owner?: string | undefined;
    claimed_count: number;
    shard_ids: string[];
    claim_preflight_command?: string | undefined;
  }>;
  packet_set_verification?: WriterBacklogPacketSetManifestVerification | undefined;
  dispatch_verification: WriterBacklogDispatchPlanVerification;
  claims_verification: WriterBacklogDispatchClaimsVerification;
  status: WriterBacklogDispatchPlanStatus;
  readiness: {
    all_shards_claimed: boolean;
    all_pages_unedited: boolean;
    no_missing_pages: boolean;
    no_active_or_completed_writer_regions: boolean;
  };
  path: string;
  markdown_path: string;
};

export type WriterBacklogPacketVerificationIssue = {
  packet_index: number;
  page_path: string;
  code: string;
  message: string;
};

export type WriterBacklogPacketVerification = {
  ok: boolean;
  path: string;
  packet_count: number;
  checked_source_blocks: number;
  issues: WriterBacklogPacketVerificationIssue[];
};

export type WriterBacklogPacketVerificationOptions = {
  checkBacklogFreshness?: boolean | undefined;
};

export type WriterBacklogPacketSetVerificationIssue = {
  path?: string | undefined;
  page_path: string;
  code: string;
  message: string;
};

export type WriterBacklogPacketSetVerification = {
  ok: boolean;
  file_count: number;
  packet_count: number;
  unique_page_count: number;
  duplicate_page_count: number;
  checked_source_blocks: number;
  files: WriterBacklogPacketVerification[];
  issues: WriterBacklogPacketSetVerificationIssue[];
};

export type WriterBacklogPacketEditVerification = {
  ok: boolean;
  packet_file_count: number;
  page_count: number;
  pages: string[];
  packet_issues: WriterEditIssue[];
  packet_verification: WriterBacklogPacketSetVerification;
  edit_verification: WriterEditVerification;
  citation_verification: WriterCitationVerification;
};

export type PostIngestScopePlan = {
  path?: string | undefined;
  source_ids: string[];
};

export type PostIngestCoverageAudit = {
  campaign_id: string;
  readiness: {
    total: number;
    ready: number;
    ingested: number;
    ready_never_ingested: number;
    not_ready: number;
  };
  post_ingest_scope: {
    scoped_sources: number;
    plan_files: number;
  };
  writer_backlog: {
    empty_writer_regions: number;
    status: "paused_by_owner";
    packet_coverage: WriterBacklogPacketCoverage;
  };
  readiness_sources_missing_post_ingest_scope: string[];
  post_ingest_scoped_sources_not_in_readiness: string[];
  ok: boolean;
};

export type WriterBacklogPacketCoverage = {
  status: "not_started" | "partial" | "complete" | "stale_or_overlapping";
  artifact_files: number;
  packet_count: number;
  unique_pages: number;
  duplicate_pages: number;
  covered_current_backlog_pages: number;
  missing_current_backlog_pages: number;
  stale_packet_pages: number;
  min_offset?: number | undefined;
  max_offset?: number | undefined;
};

const WRITER_REGION_CAPTURE_RE = /<!-- mta-wiki:writer:start -->([\s\S]*?)<!-- mta-wiki:writer:end -->/u;

function timestamp() {
  return new Date().toISOString().replace(/[:.]/gu, "-");
}

function readJson(path: string): JsonObject | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as JsonValue;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function repoRelativePath(path: string) {
  const absolutePath = isAbsolute(path) ? resolve(path) : resolve(repoRoot, path);
  const relativePath = relative(repoRoot, absolutePath).replace(/\\/gu, "/");
  if (!relativePath || relativePath.startsWith("../") || relativePath === "..") throw new Error(`Path is outside repository: ${path}`);
  return { absolutePath, relativePath };
}

function readJsonlObjects(path: string): JsonObject[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as JsonValue;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? [parsed as JsonObject] : [];
      } catch {
        return [];
      }
    });
}

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))].sort();
}

function rawSourceIds() {
  const dir = join(repoRoot, "raw", "sources");
  if (!existsSync(dir)) return new Set<string>();
  return new Set(
    readdirSync(dir).filter((sourceId) => existsSync(join(dir, sourceId, "metadata.json"))),
  );
}

function likelyTruncatedSourceId(sourceId: string, likelyCorrectSourceId: string | undefined, localObservationId: string, runId: string) {
  if (!likelyCorrectSourceId) return false;
  const dashed = likelyCorrectSourceId.replace(/_/gu, "-");
  return likelyCorrectSourceId.startsWith(sourceId) || localObservationId.includes(likelyCorrectSourceId) || runId.includes(likelyCorrectSourceId) || runId.includes(dashed);
}

export function auditSubmissionSourceIdDriftRows(
  entries: MtaSubmissionEntry[],
  stagedSourceIds: Set<string>,
  retiredIds: Set<string> = new Set(),
): SubmissionSourceIdDriftAudit {
  const candidates: SubmissionSourceIdDriftCandidate[] = [];

  for (const entry of entries) {
    if (entry.validation.state !== "accepted") continue;
    if (retiredIds.has(entry.submission_id)) continue;

    const sourceId = entry.tool_args.source_id;
    const evidenceSourceIds = uniqueSorted((entry.tool_args.evidence_refs ?? []).map((ref) => ref.source_id).filter(Boolean));
    const sourceExists = stagedSourceIds.has(sourceId);
    const sourceMismatch = evidenceSourceIds.length > 0 && !evidenceSourceIds.includes(sourceId);
    if (sourceExists && !sourceMismatch) continue;

    const evidenceAllSame = evidenceSourceIds.length === 1;
    const likelyCorrectSourceId = evidenceAllSame ? evidenceSourceIds[0] : undefined;
    candidates.push({
      submission_id: entry.submission_id,
      run_id: entry.run_id,
      observation_kind: entry.tool_args.observation_kind,
      local_observation_id: entry.tool_args.local_observation_id,
      source_id: sourceId,
      source_exists: sourceExists,
      evidence_source_ids: evidenceSourceIds,
      evidence_all_same: evidenceAllSame,
      likely_correct_source_id: likelyCorrectSourceId,
      source_mismatch: sourceMismatch,
      likely_truncated: likelyTruncatedSourceId(sourceId, likelyCorrectSourceId, entry.tool_args.local_observation_id, entry.run_id),
    });
  }

  const byKind: Record<string, number> = {};
  for (const candidate of candidates) byKind[candidate.observation_kind] = (byKind[candidate.observation_kind] ?? 0) + 1;

  return {
    ok: candidates.length === 0,
    summary: {
      total_candidates: candidates.length,
      missing_source_id: candidates.filter((candidate) => !candidate.source_exists).length,
      source_mismatch: candidates.filter((candidate) => candidate.source_mismatch).length,
      single_evidence_likely_truncated: candidates.filter(
        (candidate) => !candidate.source_exists && candidate.source_mismatch && candidate.evidence_all_same && candidate.likely_truncated,
      ).length,
      by_kind: byKind,
    },
    candidates,
  };
}

export function auditSubmissionSourceIdDrift(): SubmissionSourceIdDriftAudit {
  return auditSubmissionSourceIdDriftRows(readSubmissionEntries(), rawSourceIds(), retiredSubmissionIds());
}

function latestWriterDispatchReadinessPath() {
  const dir = join(repoRoot, "data", "post-ingest");
  if (!existsSync(dir)) return undefined;
  const candidates = readdirSync(dir)
    .filter((fileName) => fileName.endsWith("_writer-packet-dispatch-readiness.json"))
    .sort();
  const latest = candidates.at(-1);
  return latest ? join(dir, latest) : undefined;
}

function readWriterDispatchReadinessReport(path: string | undefined) {
  if (!path) return undefined;
  const parsed = readJson(path);
  return parsed as WriterBacklogDispatchReadinessReport | undefined;
}

function gateText(ok: boolean) {
  return ok ? "ok" : "needs attention";
}

function codexGoalAuditMarkdown(report: CodexPostIngestGoalAudit) {
  const lines = [
    "# Codex Goal Completion Audit",
    "",
    `Generated: ${report.generated_at}`,
    `Overall status: ${report.overall_status}`,
    "",
    report.completion_decision,
    "",
    "## Live Gates",
    "",
    `- Validation: ${report.live_gates.validation.issue_count} issue(s), ${report.live_gates.validation.submissions} submissions, ${report.live_gates.validation.canonical_records} canonical records, ${report.live_gates.validation.wiki_pages} wiki pages`,
    `- Post-ingest audit: ${gateText(report.live_gates.post_ingest_audit.ok)}; ${report.live_gates.post_ingest_audit.readiness.ready}/${report.live_gates.post_ingest_audit.readiness.total} ready, ${report.live_gates.post_ingest_audit.readiness.ready_never_ingested} ready-never-ingested, ${report.live_gates.post_ingest_audit.readiness.not_ready} not-ready`,
    `- Source-id drift audit: ${gateText(report.live_gates.source_id_drift_audit.ok)}; ${report.live_gates.source_id_drift_audit.summary.total_candidates} candidate(s)`,
  ];
  if (report.live_gates.writer_readiness) {
    lines.push(
      `- Writer dispatch readiness: ${gateText(report.live_gates.writer_readiness.ok)}; ${report.live_gates.writer_readiness.status.claimed_shards}/${report.live_gates.writer_readiness.status.shard_count} claimed shard(s), ${report.live_gates.writer_readiness.status.empty_pages}/${report.live_gates.writer_readiness.status.packet_count} empty packet page(s)`,
    );
  } else {
    lines.push("- Writer dispatch readiness: missing");
  }
  if (report.live_gates.writer_prompt_coverage) {
    lines.push(
      `- Writer prompt coverage: ${gateText(report.live_gates.writer_prompt_coverage.ok)}; ${report.live_gates.writer_prompt_coverage.covered_shard_count}/${report.live_gates.writer_prompt_coverage.expected_shard_count} shard(s), ${report.live_gates.writer_prompt_coverage.existing_prompt_count}/${report.live_gates.writer_prompt_coverage.prompt_count} prompt file(s)`,
    );
  }
  lines.push("", "## Requirements", "");
  for (const requirement of report.requirements) {
    lines.push(`- ${requirement.status}: ${requirement.requirement}`);
    lines.push(`  ${requirement.conclusion}`);
  }
  lines.push("", "## Commands Not Run", "");
  for (const command of report.commands_not_run) lines.push(`- ${command}`);
  lines.push("");
  return lines.join("\n");
}

export function writeCodexPostIngestGoalAudit(options: {
  campaignId?: string | undefined;
  writerReadinessPath?: string | undefined;
  writerPromptCoveragePaths?: string[] | undefined;
} = {}): CodexPostIngestGoalAudit {
  const campaignId = options.campaignId ?? "validation-2026-06";
  const postIngestAudit = auditPostIngestCoverage(campaignId);
  const sourceIdDriftAudit = auditSubmissionSourceIdDrift();
  const validation = validateRepo();
  const writerReadinessPath = options.writerReadinessPath ?? latestWriterDispatchReadinessPath();
  const writerReadiness = readWriterDispatchReadinessReport(writerReadinessPath);
  const writerPromptCoverage = options.writerPromptCoveragePaths && options.writerPromptCoveragePaths.length > 0
    ? verifyWriterBacklogDispatchHandoffPromptCoverage(options.writerPromptCoveragePaths[0]!, options.writerPromptCoveragePaths.slice(1))
    : undefined;
  const validationClean = validation.issues.length === 0;
  const ingestExhausted = postIngestAudit.readiness.ready_never_ingested === 0 && postIngestAudit.readiness.not_ready === 0;
  const scopeClean = postIngestAudit.ok && postIngestAudit.readiness_sources_missing_post_ingest_scope.length === 0 && postIngestAudit.post_ingest_scoped_sources_not_in_readiness.length === 0;
  const sourceIdsClean = sourceIdDriftAudit.ok;
  const writerPrepared = Boolean(writerReadiness?.ok && writerReadiness.readiness.all_shards_claimed && writerReadiness.readiness.all_pages_unedited && writerReadiness.readiness.no_missing_pages);
  const writerPromptsPrepared = writerPromptCoverage === undefined || (writerPromptCoverage.ok && writerPromptCoverage.missing_shard_count === 0 && writerPromptCoverage.duplicate_shard_count === 0);
  const writerExecutionPaused = (writerReadiness?.status.empty_pages ?? postIngestAudit.writer_backlog.empty_writer_regions) > 0;
  const gatesClean = validationClean && ingestExhausted && scopeClean && sourceIdsClean;
  const overallStatus: CodexPostIngestGoalAudit["overall_status"] = gatesClean && writerPrepared && writerPromptsPrepared && writerExecutionPaused
    ? "not_complete_writer_execution_paused"
    : gatesClean && writerPrepared && writerPromptsPrepared && !writerExecutionPaused
      ? "complete"
      : "needs_attention";
  const paths = codexPostIngestGoalAuditPaths();

  const report: CodexPostIngestGoalAudit = {
    generated_at: new Date().toISOString(),
    objective:
      "Orchestrate Codex-only post-ingest work for all completed MTA wiki ingest outputs with unprocessed backlog, while keeping ingest waves running separately at max concurrency without babysitting them.",
    overall_status: overallStatus,
    completion_decision:
      overallStatus === "complete"
        ? "All current goal requirements are satisfied by deterministic evidence."
        : overallStatus === "not_complete_writer_execution_paused"
          ? "Do not mark the goal complete: ingest/source scope and deterministic cleanup gates are clean, and writer dispatch is prepared, but writer execution remains paused with empty writer regions."
          : "Do not mark the goal complete: one or more live gates needs attention.",
    campaign_id: campaignId,
    requirements: [
      {
        requirement: "Keep ingest waves running separately at max concurrency when ready-never-ingested sources exist.",
        status: ingestExhausted ? "complete" : "not_complete",
        evidence: {
          ready_never_ingested: postIngestAudit.readiness.ready_never_ingested,
          not_ready: postIngestAudit.readiness.not_ready,
          ingested: postIngestAudit.readiness.ingested,
          total: postIngestAudit.readiness.total,
        },
        conclusion: ingestExhausted ? "No ingest wave should be launched now because the ready pool is exhausted." : "A ready or not-ready source pool remains and needs orchestration.",
      },
      {
        requirement: "Keep deterministic Codex-only post-ingest cleanup gates clean.",
        status: validationClean && sourceIdsClean ? "clean" : "not_complete",
        evidence: {
          validation_issues: validation.issues.length,
          source_id_drift_candidates: sourceIdDriftAudit.summary.total_candidates,
        },
        conclusion: validationClean && sourceIdsClean ? "Validation and source-id drift gates are clean." : "Validation or source-id drift requires cleanup.",
      },
      {
        requirement: "Ensure every current readiness source has post-ingest scope coverage and no plan-only ghost scope remains.",
        status: scopeClean ? "complete" : "not_complete",
        evidence: {
          scoped_sources: postIngestAudit.post_ingest_scope.scoped_sources,
          plan_files: postIngestAudit.post_ingest_scope.plan_files,
          missing_scope: postIngestAudit.readiness_sources_missing_post_ingest_scope.length,
          plan_only_sources: postIngestAudit.post_ingest_scoped_sources_not_in_readiness.length,
        },
        conclusion: scopeClean ? "Post-ingest scope coverage is complete for the current readiness corpus." : "Post-ingest scope coverage needs reconciliation.",
      },
      {
        requirement: "Prepare writer backlog execution without violating the owner pause.",
        status: writerPrepared && writerPromptsPrepared && writerExecutionPaused ? "prepared_but_paused" : writerPrepared && writerPromptsPrepared ? "complete" : "not_complete",
        evidence: {
          writer_readiness_path: writerReadiness?.path ?? null,
          claimed_shards: writerReadiness?.status.claimed_shards ?? null,
          shard_count: writerReadiness?.status.shard_count ?? null,
          empty_pages: writerReadiness?.status.empty_pages ?? null,
          packet_count: writerReadiness?.status.packet_count ?? null,
          prompt_coverage_shards: writerPromptCoverage?.covered_shard_count ?? null,
          prompt_coverage_expected_shards: writerPromptCoverage?.expected_shard_count ?? null,
          prompt_coverage_files: writerPromptCoverage?.existing_prompt_count ?? null,
        },
        conclusion: writerPrepared && writerPromptsPrepared && writerExecutionPaused
          ? "Writer dispatch is ready, claimed, and prompt-covered, but writer pages remain empty because execution is paused."
          : writerPrepared && writerPromptsPrepared
            ? "Writer dispatch has no remaining empty packet pages."
            : "Writer dispatch readiness or prompt coverage is missing or not ready.",
      },
    ],
    live_gates: {
      validation: {
        issue_count: validation.issues.length,
        submissions: validation.submissionCount,
        canonical_records: validation.canonicalRecordCount,
        wiki_pages: validation.wikiPageCount,
      },
      post_ingest_audit: postIngestAudit,
      source_id_drift_audit: sourceIdDriftAudit,
      writer_readiness: writerReadiness,
      writer_prompt_coverage: writerPromptCoverage,
    },
    commands_not_run: [
      "campaign dedup",
      "canonicalize*",
      "identity-review-run",
      "ontology-normalize-run",
      "write",
      "ask",
      "schema",
      "provider-backed post-ingest commands",
      "writer agents",
      "wiki prose edits",
      "canonical JSONL hand edits",
    ],
    path: relative(repoRoot, paths.jsonPath),
    markdown_path: relative(repoRoot, paths.markdownPath),
  };
  writeFileSync(paths.jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(paths.markdownPath, codexGoalAuditMarkdown(report), "utf8");
  return report;
}

function sourceIdsForRecord(record: MtaCanonicalRecord) {
  return [...new Set([record.source_id, ...(record.source_ids ?? []), ...record.evidence_refs.map((ref) => ref.source_id)].filter(Boolean))].sort();
}

function recordInScope(record: MtaCanonicalRecord, sourceIds: Set<string>) {
  return sourceIdsForRecord(record).some((sourceId) => sourceIds.has(sourceId));
}

function card(record: MtaCanonicalRecord): PostIngestPlanRecordCard {
  return {
    record_id: record.record_id,
    record_kind: record.record_kind,
    display_name: record.display_name,
    source_ids: sourceIdsForRecord(record),
    page_path: pageRelativePathForCanonicalRecord(record),
    payload_keys: Object.keys(record.payload ?? {}).sort(),
    evidence_count: record.evidence_refs.length,
  };
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function emptyWriterRegion(pagePath: string) {
  if (pagePath.startsWith("wiki/sources/")) return false;
  const absolutePath = join(repoRoot, pagePath);
  if (!existsSync(absolutePath)) return false;
  const contents = readFileSync(absolutePath, "utf8");
  const match = WRITER_REGION_CAPTURE_RE.exec(contents);
  return match !== null && match[1]!.trim().length === 0;
}

function writerBacklogQueuePath() {
  return join(repoRoot, "data", "post-ingest", `${timestamp()}_writer-backlog-queue.json`);
}

function writerBacklogPacketPaths(offset: number) {
  const stamp = timestamp();
  const base = join(repoRoot, "data", "post-ingest", `${stamp}_writer-backlog-packets-offset-${offset}`);
  return {
    jsonPath: `${base}.json`,
    markdownPath: `${base}.md`,
  };
}

function writerBacklogPacketSetManifestPaths(label: string) {
  const safeLabel = label.replace(/[^a-z0-9_-]+/giu, "-").replace(/^-+|-+$/gu, "") || "packet-set";
  const base = join(repoRoot, "data", "post-ingest", `${timestamp()}_writer-backlog-packet-set-${safeLabel}`);
  return {
    jsonPath: `${base}.json`,
    markdownPath: `${base}.md`,
  };
}

function writerBacklogDispatchPlanPaths() {
  const base = join(repoRoot, "data", "post-ingest", `${timestamp()}_writer-packet-dispatch-plan`);
  return {
    jsonPath: `${base}.json`,
    markdownPath: `${base}.md`,
  };
}

function writerBacklogDispatchStatusPaths() {
  const base = join(repoRoot, "data", "post-ingest", `${timestamp()}_writer-packet-dispatch-status`);
  return {
    jsonPath: `${base}.json`,
    markdownPath: `${base}.md`,
  };
}

function writerBacklogDispatchClaimPaths() {
  const base = join(repoRoot, "data", "post-ingest", `${timestamp()}_writer-packet-dispatch-claim`);
  return {
    jsonPath: `${base}.json`,
    markdownPath: `${base}.md`,
  };
}

function writerBacklogDispatchReadinessPaths() {
  const base = join(repoRoot, "data", "post-ingest", `${timestamp()}_writer-packet-dispatch-readiness`);
  return {
    jsonPath: `${base}.json`,
    markdownPath: `${base}.md`,
  };
}

function writerBacklogDispatchNextShardPaths() {
  const base = join(repoRoot, "data", "post-ingest", `${timestamp()}_writer-packet-dispatch-next-shard`);
  return {
    jsonPath: `${base}.json`,
    markdownPath: `${base}.md`,
  };
}

function writerBacklogDispatchHandoffBatchPaths() {
  const base = join(repoRoot, "data", "post-ingest", `${timestamp()}_writer-packet-dispatch-handoff-batch`);
  return {
    jsonPath: `${base}.json`,
    markdownPath: `${base}.md`,
  };
}

function writerBacklogDispatchHandoffPromptsPaths() {
  const base = join(repoRoot, "data", "post-ingest", `${timestamp()}_writer-packet-dispatch-handoff-prompts`);
  return {
    jsonPath: `${base}.json`,
    markdownPath: `${base}.md`,
    dirPath: `${base}-files`,
  };
}

function writerBacklogDispatchHandoffPromptCoveragePaths() {
  const base = join(repoRoot, "data", "post-ingest", `${timestamp()}_writer-packet-dispatch-handoff-prompt-coverage`);
  return {
    jsonPath: `${base}.json`,
    markdownPath: `${base}.md`,
  };
}

function codexPostIngestGoalAuditPaths() {
  const base = join(repoRoot, "data", "review_notes", `${timestamp()}_codex-goal-completion-audit`);
  return {
    jsonPath: `${base}.json`,
    markdownPath: `${base}.md`,
  };
}

function writerKindPriority(kind: string) {
  switch (kind) {
    case "project":
      return 1000;
    case "corridor":
      return 850;
    case "route":
      return 700;
    case "source_gap":
      return 250;
    case "entity":
      return 100;
    default:
      return 0;
  }
}

function campaignDir(id: string) {
  return join(repoRoot, "data", "campaigns", id);
}

function recoveredWavePid(campaignId: string, wave: number) {
  const orchestration = readJson(join(repoRoot, "data", "post-ingest", "codex-orchestration-2026-06-21.json"));
  if (!orchestration) return undefined;

  const keys = [`latest_ingest_wave_recovered_wave${wave}`, `latest_ingest_wave_active_wave${wave}`];
  for (const key of keys) {
    const value = orchestration[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (value["wave"] !== wave) continue;
    const pid = value["pid"];
    if (typeof pid === "number" && Number.isInteger(pid)) return String(pid);
    if (typeof pid === "string" && /^\d+$/u.test(pid)) return pid;
  }

  void campaignId;
  return undefined;
}

function acceptedSourceIdsForRecoveredWave(campaignId: string, wave: number) {
  const pid = recoveredWavePid(campaignId, wave);
  if (!pid) return undefined;

  const submissionsDir = join(repoRoot, "data", "submissions");
  if (!existsSync(submissionsDir)) return undefined;

  const sourceIds = new Set<string>();
  const fileRe = new RegExp(`_${pid}-[a-f0-9]+_ingest_(.+)\\.jsonl$`, "u");
  for (const fileName of readdirSync(submissionsDir).sort()) {
    const match = fileRe.exec(fileName);
    if (!match) continue;
    const path = join(submissionsDir, fileName);
    const hasAccepted = readFileSync(path, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .some((line) => {
        try {
          const parsed = JSON.parse(line) as JsonValue;
          return Boolean(
            parsed &&
              typeof parsed === "object" &&
              !Array.isArray(parsed) &&
              parsed["validation"] &&
              typeof parsed["validation"] === "object" &&
              !Array.isArray(parsed["validation"]) &&
              parsed["validation"]["state"] === "accepted",
          );
        } catch {
          return false;
        }
      });
    if (hasAccepted) sourceIds.add(match[1]!.replace(/-/gu, "_"));
  }

  return sourceIds.size > 0
    ? {
        sourceIds: [...sourceIds].sort(),
        recoveredFrom: `data/post-ingest/codex-orchestration-2026-06-21.json pid ${pid} + data/submissions/*_${pid}-*_ingest_*.jsonl`,
      }
    : undefined;
}

function sourceScope(options: PostIngestPlanOptions) {
  const campaignId = options.campaignId ?? "validation-2026-06";
  if (options.wave !== undefined) {
    const waveReportPath = join(campaignDir(campaignId), `wave-${options.wave}`, "report.json");
    const report = readJson(waveReportPath);
    const sourceIds = Array.isArray(report?.sources_selected) ? report.sources_selected.filter((value): value is string => typeof value === "string") : [];
    if (sourceIds.length === 0) {
      const recovered = acceptedSourceIdsForRecoveredWave(campaignId, options.wave);
      if (recovered) return { campaignId, sourceIds: recovered.sourceIds, waveReportPath: undefined, recoveredFrom: recovered.recoveredFrom };
      throw new Error(`No source list found in wave report: ${relative(repoRoot, waveReportPath)}`);
    }
    return { campaignId, sourceIds, waveReportPath };
  }

  if (options.sourceId) return { campaignId: undefined, sourceIds: [options.sourceId], waveReportPath: undefined };
  throw new Error("post-ingest plan requires --wave <n> or a source id subject.");
}

function artifactPaths(campaignId: string | undefined, wave: number | undefined) {
  if (campaignId === undefined || wave === undefined) return {};
  const dir = join(campaignDir(campaignId), `wave-${wave}`);
  return {
    wave_report: existsSync(join(dir, "report.json")) ? relative(repoRoot, join(dir, "report.json")) : undefined,
    canonicalize_report: existsSync(join(dir, "canonicalize-report.json")) ? relative(repoRoot, join(dir, "canonicalize-report.json")) : undefined,
    dedup_report: existsSync(join(dir, "dedup-report.json")) ? relative(repoRoot, join(dir, "dedup-report.json")) : undefined,
  };
}

function identityReviewSummary(relatedRecordIds: Set<string>) {
  const identityDir = join(repoRoot, "data", "identity-review");
  const clusters = readJsonlObjects(join(identityDir, "clusters.jsonl"));
  let clustersInScope = 0;
  let suggestionsInScope = 0;
  let parseErrorsInScope = 0;
  let quarantinedInScope = 0;

  for (const cluster of clusters) {
    const recordIds = Array.isArray(cluster.record_ids) ? cluster.record_ids.filter((id): id is string => typeof id === "string") : [];
    if (!recordIds.some((id) => relatedRecordIds.has(id))) continue;
    clustersInScope += 1;
    const clusterId = typeof cluster.cluster_id === "string" ? cluster.cluster_id : undefined;
    if (!clusterId) continue;
    const suggestion = readJson(join(identityDir, "llm-suggestions", `${clusterId}.json`));
    if (suggestion) {
      suggestionsInScope += 1;
      if (suggestion.parse_error) parseErrorsInScope += 1;
    }
    if (existsSync(join(identityDir, "accepted", "quarantine", `${clusterId}.json`))) quarantinedInScope += 1;
  }

  return {
    clusters: clusters.length,
    clusters_in_scope: clustersInScope,
    suggestions_in_scope: suggestionsInScope,
    parse_errors_in_scope: parseErrorsInScope,
    quarantined_in_scope: quarantinedInScope,
  };
}

function writerBatches(sourceIds: string[], records: MtaCanonicalRecord[]): PostIngestWriterBatch[] {
  return sourceIds.map((sourceId) => {
    const sourceSet = new Set([sourceId]);
    const related = records.filter((record) => recordInScope(record, sourceSet));
    const pagePaths = related
      .filter((record) => WRITER_PRIORITY_KINDS.has(record.record_kind))
      .map((record) => pageRelativePathForCanonicalRecord(record))
      .filter((path): path is string => typeof path === "string")
      .slice(0, 12);
    return {
      source_id: sourceId,
      page_bearing_records: related.filter((record) => PAGE_BEARING_KINDS.has(record.record_kind) && pageRelativePathForCanonicalRecord(record)).length,
      writer_priority_pages: pagePaths,
      data_only_supporting_records: related.filter((record) => DATA_ONLY_WRITER_KINDS.has(record.record_kind)).length,
      command: `bun run harness write ${sourceId} --safe-writer`,
    };
  });
}

function outputPath(options: PostIngestPlanOptions) {
  const scope = options.wave !== undefined ? `wave-${options.wave}` : options.sourceId ?? "source";
  return join(repoRoot, "data", "post-ingest", `${timestamp()}_${scope}.json`);
}

function shortSnippet(text: string) {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > 600 ? `${normalized.slice(0, 597).trimEnd()}...` : normalized;
}

function evidenceSnippets(record: MtaCanonicalRecord, limit = 5): WriterBacklogPacketRecord["evidence_snippets"] {
  const snippets: WriterBacklogPacketRecord["evidence_snippets"] = [];
  const seen = new Set<string>();
  for (const ref of record.evidence_refs) {
    const sourceId = ref.source_id;
    const blockId = ref.block_id;
    if (!sourceId || !blockId) continue;
    const key = `${sourceId}#${blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const block = sourceBlockById(sourceId, blockId);
      snippets.push({
        source_id: sourceId,
        block_id: blockId,
        text: shortSnippet(block.raw_text),
      });
    } catch {
      snippets.push({
        source_id: sourceId,
        block_id: blockId,
        text: "(source block did not resolve during packet generation)",
      });
    }
    if (snippets.length >= limit) break;
  }
  return snippets;
}

function packetEvidenceRefs(record: MtaCanonicalRecord): NonNullable<WriterBacklogPacketRecord["evidence_refs"]> {
  const refs: NonNullable<WriterBacklogPacketRecord["evidence_refs"]> = [];
  const seen = new Set<string>();
  for (const ref of record.evidence_refs) {
    const sourceId = ref.source_id;
    const blockId = ref.block_id;
    if (!sourceId || !blockId) continue;
    const key = `${sourceId}#${blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ source_id: sourceId, block_id: blockId });
  }
  return refs;
}

function packetRecord(record: MtaCanonicalRecord): WriterBacklogPacketRecord {
  return {
    ...card(record),
    evidence_refs: packetEvidenceRefs(record),
    evidence_snippets: evidenceSnippets(record),
  };
}

function writerRegionIsEmpty(pagePath: string) {
  const absolutePath = join(repoRoot, pagePath);
  if (!existsSync(absolutePath)) return false;
  const contents = readFileSync(absolutePath, "utf8");
  const match = WRITER_REGION_CAPTURE_RE.exec(contents);
  return match !== null && match[1]!.trim().length === 0;
}

function writerRegionEmptyCheck(pagePath: string): { ok: true } | { ok: false; code: string; message: string } {
  const absolutePath = join(repoRoot, pagePath);
  if (!existsSync(absolutePath)) return { ok: false, code: "missing_page", message: "packet page_path does not exist" };
  const contents = readFileSync(absolutePath, "utf8");
  const presence = writerRegionPresent(contents);
  if (!presence.ok) {
    const message = presence.message ?? "packet page does not have exactly one writer region";
    const code = message.includes("multiple") ? "multiple_writer_regions" : "missing_writer_region";
    return { ok: false, code, message };
  }
  const match = WRITER_REGION_CAPTURE_RE.exec(contents);
  if (!match || match[1]!.trim().length > 0) return { ok: false, code: "writer_region_not_empty", message: "packet page no longer has an empty writer region" };
  return { ok: true };
}

export function auditPostIngestCoverageRows(campaignId: string, readinessRows: ReadinessRow[], plans: PostIngestScopePlan[]): PostIngestCoverageAudit {
  const readinessSourceIds = uniqueSorted(readinessRows.map((row) => row.source_id));
  const scopedSourceIds = uniqueSorted(plans.flatMap((plan) => plan.source_ids));
  const readinessSet = new Set(readinessSourceIds);
  const scopedSet = new Set(scopedSourceIds);
  const readyNeverIngested = readinessRows.filter((row) => row.ready && !row.ingested);
  const notReady = readinessRows.filter((row) => !row.ready);
  const missingScope = readinessSourceIds.filter((sourceId) => !scopedSet.has(sourceId));
  const scopedNotInReadiness = scopedSourceIds.filter((sourceId) => !readinessSet.has(sourceId));

  return {
    campaign_id: campaignId,
    readiness: {
      total: readinessRows.length,
      ready: readinessRows.filter((row) => row.ready).length,
      ingested: readinessRows.filter((row) => row.ingested).length,
      ready_never_ingested: readyNeverIngested.length,
      not_ready: notReady.length,
    },
    post_ingest_scope: {
      scoped_sources: scopedSourceIds.length,
      plan_files: plans.length,
    },
    writer_backlog: {
      empty_writer_regions: 0,
      status: "paused_by_owner",
      packet_coverage: emptyWriterBacklogPacketCoverage(0),
    },
    readiness_sources_missing_post_ingest_scope: missingScope,
    post_ingest_scoped_sources_not_in_readiness: scopedNotInReadiness,
    ok: readyNeverIngested.length === 0 && notReady.length === 0 && missingScope.length === 0,
  };
}

function readPostIngestScopePlans() {
  const dir = join(repoRoot, "data", "post-ingest");
  if (!existsSync(dir)) return [];

  const plans: PostIngestScopePlan[] = [];
  for (const fileName of readdirSync(dir).sort()) {
    if (!fileName.endsWith(".json")) continue;
    if (fileName.includes("writer-backlog-queue") || fileName === "codex-orchestration-2026-06-21.json") continue;
    const path = join(dir, fileName);
    const parsed = readJson(path);
    const sourceIds = Array.isArray(parsed?.scope) ? [] : parsed?.scope && typeof parsed.scope === "object" && !Array.isArray(parsed.scope)
      ? (parsed.scope.source_ids as JsonValue | undefined)
      : undefined;
    if (!Array.isArray(sourceIds)) continue;
    const ids = sourceIds.filter((value): value is string => typeof value === "string");
    if (ids.length > 0) plans.push({ path: relative(repoRoot, path), source_ids: ids });
  }
  return plans;
}

function emptyWriterBacklogPacketCoverage(currentBacklogPages: number): WriterBacklogPacketCoverage {
  return {
    status: "not_started",
    artifact_files: 0,
    packet_count: 0,
    unique_pages: 0,
    duplicate_pages: 0,
    covered_current_backlog_pages: 0,
    missing_current_backlog_pages: currentBacklogPages,
    stale_packet_pages: 0,
  };
}

export function summarizeWriterBacklogPacketCoverage(
  queueItems: Pick<WriterBacklogQueueItem, "page_path">[],
  packetBatches: Array<{ offset: number; pages: string[] }>,
): WriterBacklogPacketCoverage {
  if (packetBatches.length === 0) return emptyWriterBacklogPacketCoverage(queueItems.length);

  const offsets = packetBatches.map((batch) => batch.offset).sort((a, b) => a - b);
  const packetPages = packetBatches.flatMap((batch) => batch.pages);
  const currentPages = new Set(queueItems.map((item) => item.page_path));
  const packetPageCounts = new Map<string, number>();
  for (const page of packetPages) packetPageCounts.set(page, (packetPageCounts.get(page) ?? 0) + 1);
  const uniquePacketPages = new Set(packetPages);
  const duplicatePages = [...packetPageCounts.values()].filter((count) => count > 1).length;
  const coveredCurrent = [...currentPages].filter((page) => uniquePacketPages.has(page)).length;
  const missingCurrent = queueItems.length - coveredCurrent;
  const stalePacketPages = [...uniquePacketPages].filter((page) => !currentPages.has(page)).length;
  const status =
    duplicatePages > 0 || stalePacketPages > 0
      ? "stale_or_overlapping"
      : missingCurrent === 0 && packetPages.length === queueItems.length
        ? "complete"
        : "partial";

  return {
    status,
    artifact_files: packetBatches.length,
    packet_count: packetPages.length,
    unique_pages: uniquePacketPages.size,
    duplicate_pages: duplicatePages,
    covered_current_backlog_pages: coveredCurrent,
    missing_current_backlog_pages: missingCurrent,
    stale_packet_pages: stalePacketPages,
    min_offset: offsets[0],
    max_offset: offsets.at(-1),
  };
}

function latestWriterBacklogPacketRuns(): Array<{ offset: number; path: string; run: WriterBacklogPacketRun }> {
  const dir = join(repoRoot, "data", "post-ingest");
  if (!existsSync(dir)) return [];

  const latestByOffset = new Map<number, string>();
  for (const fileName of readdirSync(dir).sort()) {
    if (!fileName.endsWith(".json") || !fileName.includes("_writer-backlog-packets-offset-")) continue;
    const match = /_writer-backlog-packets-offset-(\d+)\.json$/u.exec(fileName);
    if (!match) continue;
    const offset = Number(match[1]);
    if (!Number.isInteger(offset) || offset < 0) continue;
    latestByOffset.set(offset, fileName);
  }

  return [...latestByOffset.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([offset, fileName]) => {
      const path = join(dir, fileName);
      try {
        const run = JSON.parse(readFileSync(path, "utf8")) as WriterBacklogPacketRun;
        return [{ offset, path: relative(repoRoot, path), run }];
      } catch {
        return [];
      }
    });
}

function packetPages(run: WriterBacklogPacketRun) {
  return Array.isArray(run.packets) ? run.packets.map((packet) => packet.page_path).filter((pagePath): pagePath is string => typeof pagePath === "string") : [];
}

function manifestEntryFromPacketRun(offset: number, path: string, run: WriterBacklogPacketRun): WriterBacklogPacketSetManifestEntry {
  const pagePaths = packetPages(run);
  return {
    offset,
    path,
    packet_count: pagePaths.length,
    page_paths: pagePaths,
  };
}

function writerBacklogPacketSetMarkdown(manifest: WriterBacklogPacketSetManifest) {
  const lines = [
    "# Writer Backlog Packet Set",
    "",
    `Generated: ${manifest.generated_at}`,
    `Label: ${manifest.label}`,
    `Source: ${manifest.scope.source}`,
    `Backlog: ${manifest.scope.empty_writer_regions} empty writer region(s)`,
    `Coverage: ${manifest.scope.packet_coverage.covered_current_backlog_pages}/${manifest.scope.empty_writer_regions} current pages, ${manifest.scope.packet_coverage.status}`,
    `Packet files: ${manifest.packet_files.length}`,
    `Packets: ${manifest.scope.packet_coverage.packet_count}`,
    "",
    "## Files",
    "",
  ];

  for (const entry of manifest.packets) lines.push(`- offset ${entry.offset}: ${entry.packet_count} packet(s), ${entry.path}`);
  return `${lines.join("\n")}\n`;
}

export function generateWriterBacklogPacketSetManifest(options: WriterBacklogPacketSetManifestOptions = {}): WriterBacklogPacketSetManifest {
  const label = options.label?.trim() || "latest";
  const queueItems = collectWriterBacklogItems();
  const packetRuns = latestWriterBacklogPacketRuns();
  const packetBatches = packetRuns.map(({ offset, run }) => ({ offset, pages: packetPages(run) }));
  const coverage = summarizeWriterBacklogPacketCoverage(queueItems, packetBatches);
  const entries = packetRuns.map(({ offset, path, run }) => manifestEntryFromPacketRun(offset, path, run));
  const paths = writerBacklogPacketSetManifestPaths(label);
  const manifest: WriterBacklogPacketSetManifest = {
    generated_at: new Date().toISOString(),
    label,
    scope: {
      empty_writer_regions: queueItems.length,
      packet_coverage: coverage,
      source: "latest writer-backlog-packets artifact per offset at manifest generation time",
    },
    packet_files: entries.map((entry) => entry.path),
    packets: entries,
    path: relative(repoRoot, paths.jsonPath),
    markdown_path: relative(repoRoot, paths.markdownPath),
  };

  mkdirSync(join(repoRoot, "data", "post-ingest"), { recursive: true });
  writeFileSync(paths.jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(paths.markdownPath, writerBacklogPacketSetMarkdown(manifest), "utf8");
  return manifest;
}

export function verifyWriterBacklogPacketSetManifest(path: string): WriterBacklogPacketSetManifestVerification {
  const { absolutePath, relativePath } = repoRelativePath(path);
  const issues: WriterBacklogPacketSetManifestVerificationIssue[] = [];
  let manifest: WriterBacklogPacketSetManifest;
  try {
    manifest = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogPacketSetManifest;
  } catch (error) {
    return {
      ok: false,
      path: relativePath,
      file_count: 0,
      packet_count: 0,
      unique_page_count: 0,
      duplicate_page_count: 0,
      coverage: emptyWriterBacklogPacketCoverage(0),
      issues: [{ code: "invalid_packet_set_manifest_json", message: error instanceof Error ? error.message : String(error) }],
    };
  }

  const entries = Array.isArray(manifest.packets) ? manifest.packets : [];
  if (!Array.isArray(manifest.packets)) issues.push({ code: "missing_packet_entries", message: "packet-set manifest does not contain a packets array" });
  const packetFiles = Array.isArray(manifest.packet_files) ? manifest.packet_files.filter((file): file is string => typeof file === "string" && file.trim().length > 0) : [];
  if (packetFiles.length !== entries.length) issues.push({ code: "packet_file_entry_count_mismatch", message: `packet_files=${packetFiles.length} but packets=${entries.length}` });

  const packetFileCounts = new Map<string, number>();
  const batches: Array<{ offset: number; pages: string[] }> = [];
  for (const [index, entry] of entries.entries()) {
    const entryPath = typeof entry.path === "string" ? entry.path : "";
    const listedPath = packetFiles[index];
    if (listedPath !== entryPath) issues.push({ path: entryPath || listedPath, code: "packet_file_order_mismatch", message: "packet_files entry does not match packets entry path at the same index" });
    if (entryPath) packetFileCounts.set(entryPath, (packetFileCounts.get(entryPath) ?? 0) + 1);
    const packetPath = entryPath ? join(repoRoot, entryPath) : "";
    if (!entryPath || !existsSync(packetPath)) {
      issues.push({ path: entryPath, code: "missing_packet_file", message: `packet file does not exist: ${entryPath || "(missing)"}` });
      continue;
    }
    try {
      const run = JSON.parse(readFileSync(packetPath, "utf8")) as WriterBacklogPacketRun;
      const pages = packetPages(run);
      batches.push({ offset: entry.offset, pages });
      if (entry.packet_count !== pages.length) issues.push({ path: entryPath, code: "packet_count_mismatch", message: `manifest packet_count=${entry.packet_count} but packet file contains ${pages.length}` });
      if (!Array.isArray(entry.page_paths) || entry.page_paths.length !== pages.length || entry.page_paths.some((pagePath, pageIndex) => pagePath !== pages[pageIndex])) {
        issues.push({ path: entryPath, code: "packet_pages_mismatch", message: "manifest page_paths do not match packet file packet pages" });
      }
    } catch (error) {
      issues.push({ path: entryPath, code: "invalid_packet_file_json", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const duplicatePacketFiles = [...packetFileCounts.values()].filter((count) => count > 1).length;
  if (duplicatePacketFiles > 0) issues.push({ code: "duplicate_packet_files", message: `${duplicatePacketFiles} packet file(s) appear more than once in the manifest` });
  const queueItems = collectWriterBacklogItems();
  const coverage = summarizeWriterBacklogPacketCoverage(queueItems, batches);
  const manifestCoverage = manifest.scope?.packet_coverage;
  if (
    manifestCoverage?.packet_count !== coverage.packet_count ||
    manifestCoverage?.covered_current_backlog_pages !== coverage.covered_current_backlog_pages ||
    manifestCoverage?.status !== coverage.status
  ) {
    issues.push({ code: "coverage_snapshot_mismatch", message: "manifest packet coverage snapshot does not match the current parsed packet files" });
  }

  return {
    ok: issues.length === 0,
    path: relativePath,
    file_count: entries.length,
    packet_count: coverage.packet_count,
    unique_page_count: coverage.unique_pages,
    duplicate_page_count: coverage.duplicate_pages,
    coverage,
    issues,
  };
}

function packetRunsFromPacketSetManifest(path: string): Array<{ offset: number; path: string; run: WriterBacklogPacketRun }> {
  const { absolutePath } = repoRelativePath(path);
  const manifest = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogPacketSetManifest;
  const entries = Array.isArray(manifest.packets) ? manifest.packets : [];
  return entries.flatMap((entry) => {
    try {
      const run = JSON.parse(readFileSync(join(repoRoot, entry.path), "utf8")) as WriterBacklogPacketRun;
      return [{ offset: entry.offset, path: entry.path, run }];
    } catch {
      return [];
    }
  });
}

export function collectWriterBacklogPacketCoverage(queueItems = collectWriterBacklogItems()): WriterBacklogPacketCoverage {
  const packetBatches = latestWriterBacklogPacketRuns().map(({ offset, run }) => ({
    offset,
    pages: packetPages(run),
  }));
  return summarizeWriterBacklogPacketCoverage(queueItems, packetBatches);
}

export function auditPostIngestCoverage(campaignId = "validation-2026-06") {
  const audit = auditPostIngestCoverageRows(campaignId, readReadinessRows(campaignId), readPostIngestScopePlans());
  const queueItems = collectWriterBacklogItems();
  return {
    ...audit,
    writer_backlog: {
      empty_writer_regions: queueItems.length,
      status: "paused_by_owner" as const,
      packet_coverage: collectWriterBacklogPacketCoverage(queueItems),
    },
  };
}

export function generatePostIngestPlan(options: PostIngestPlanOptions): PostIngestPlan {
  const { campaignId, sourceIds, waveReportPath, recoveredFrom } = sourceScope(options);
  const sourceSet = new Set(sourceIds);
  const records = readCanonicalRecords();
  const related = records.filter((record) => recordInScope(record, sourceSet));
  const relatedIds = new Set(related.map((record) => record.record_id));
  const validation = validateRepo();
  const issueCounts = countBy(validation.issues.map((issue) => issue.code));
  const planPath = outputPath(options);

  const pageBearing = related.filter((record) => PAGE_BEARING_KINDS.has(record.record_kind));
  const dataOnly = related.filter((record) => DATA_ONLY_WRITER_KINDS.has(record.record_kind));
  const recommendedSteps = [
    "bun run harness materialize",
    "bun run harness export-jsonl --verify",
    "bun run validate",
  ];
  if ((issueCounts.duplicate_global_identity ?? 0) > 0) {
    recommendedSteps.push(
      options.wave !== undefined
        ? `bun run harness campaign dedup --wave ${options.wave} --force`
        : "bun run harness identity-review && bun run harness identity-review-run --force && bun run harness identity-review-autoaccept --force && bun run harness identity-review-apply --force",
    );
  }
  if (pageBearing.length > 0) recommendedSteps.push("Run selected writer_batches with --safe-writer, then bun run harness verify-writer-edits.");

  const plan: PostIngestPlan = {
    generated_at: new Date().toISOString(),
    scope: {
      campaign_id: campaignId,
      wave: options.wave,
      source_ids: sourceIds,
      wave_report_path: waveReportPath ? relative(repoRoot, waveReportPath) : undefined,
      recovered_from: recoveredFrom,
    },
    validation: {
      issue_count: validation.issues.length,
      issues_by_code: issueCounts,
      duplicate_global_identity: issueCounts.duplicate_global_identity ?? 0,
    },
    artifacts: artifactPaths(campaignId, options.wave),
    records: {
      total_related: related.length,
      counts_by_kind: countBy(related.map((record) => record.record_kind)),
      page_bearing: pageBearing.map(card),
      data_only_supporting: dataOnly.slice(0, 500).map(card),
    },
    identity_review: identityReviewSummary(relatedIds),
    writer_batches: writerBatches(sourceIds, records),
    recommended_steps: recommendedSteps,
    path: relative(repoRoot, planPath),
  };

  mkdirSync(join(repoRoot, "data", "post-ingest"), { recursive: true });
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return plan;
}

export function generateWriterBacklogQueue(options: WriterBacklogQueueOptions = {}): WriterBacklogQueue {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`writer backlog queue limit must be a positive integer: ${limit}`);
  const recordKinds = normalizeWriterRecordKinds(options.recordKinds);
  const pagePaths = normalizeWriterPagePaths(options.pagePaths);

  const candidates = collectWriterBacklogItems(undefined, { recordKinds, pagePaths });
  const queuePath = writerBacklogQueuePath();
  const queue: WriterBacklogQueue = {
    generated_at: new Date().toISOString(),
    scope: {
      empty_writer_regions: candidates.length,
      limit,
      ...(recordKinds.length > 0 ? { record_kinds: recordKinds } : {}),
      ...(pagePaths.length > 0 ? { page_paths: pagePaths } : {}),
    },
    items: candidates.slice(0, limit),
    path: relative(repoRoot, queuePath),
  };

  mkdirSync(join(repoRoot, "data", "post-ingest"), { recursive: true });
  writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  return queue;
}

function normalizeWriterRecordKinds(recordKinds: string[] | undefined) {
  const normalized = [...new Set((recordKinds ?? []).map((kind) => kind.trim()).filter(Boolean))].sort();
  for (const kind of normalized) {
    if (!WRITER_QUEUE_KINDS.has(kind)) throw new Error(`writer backlog record kind is not page-writer eligible: ${kind}`);
  }
  return normalized;
}

function normalizeWriterPagePaths(pagePaths: string[] | undefined) {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawPath of pagePaths ?? []) {
    const path = rawPath.trim();
    if (!path || seen.has(path)) continue;
    if (!path.startsWith("wiki/") || !path.endsWith(".md") || path.startsWith("wiki/sources/")) {
      throw new Error(`writer backlog page path must be a non-source wiki markdown path: ${path}`);
    }
    seen.add(path);
    normalized.push(path);
  }
  return normalized;
}

export function collectWriterBacklogItems(records = readCanonicalRecords(), options: { recordKinds?: string[] | undefined; pagePaths?: string[] | undefined } = {}) {
  const recordKinds = normalizeWriterRecordKinds(options.recordKinds);
  const kindFilter = recordKinds.length > 0 ? new Set(recordKinds) : undefined;
  const pagePaths = normalizeWriterPagePaths(options.pagePaths);
  const pageFilter = pagePaths.length > 0 ? new Set(pagePaths) : undefined;
  const pageOrder = pagePaths.length > 0 ? new Map(pagePaths.map((path, index) => [path, index])) : undefined;
  const dataOnly = records.filter((record) => DATA_ONLY_WRITER_KINDS.has(record.record_kind));
  const sourceIdsByRecord = new Map(records.map((record) => [record.record_id, sourceIdsForRecord(record)]));
  const supportingRecordIdsBySource = new Map<string, Set<string>>();
  for (const record of dataOnly) {
    for (const sourceId of sourceIdsByRecord.get(record.record_id) ?? []) {
      const bucket = supportingRecordIdsBySource.get(sourceId) ?? new Set<string>();
      bucket.add(record.record_id);
      supportingRecordIdsBySource.set(sourceId, bucket);
    }
  }
  const items = records
    .filter((record) => WRITER_QUEUE_KINDS.has(record.record_kind))
    .filter((record) => !kindFilter || kindFilter.has(record.record_kind))
    .flatMap((record): WriterBacklogQueueItem[] => {
      const pagePath = pageRelativePathForCanonicalRecord(record);
      if (pagePath && pageFilter && !pageFilter.has(pagePath)) return [];
      if (!pagePath || !emptyWriterRegion(pagePath)) return [];

      const sourceIds = sourceIdsByRecord.get(record.record_id) ?? [];
      const supportingIds = new Set<string>();
      for (const sourceId of sourceIds) {
        for (const supportingRecordId of supportingRecordIdsBySource.get(sourceId) ?? []) supportingIds.add(supportingRecordId);
      }
      const supporting = supportingIds.size;
      const score = writerKindPriority(record.record_kind) + record.evidence_refs.length * 4 + sourceIds.length * 10 + Math.min(supporting, 100);
      return [
        {
          page_path: pagePath,
          record_id: record.record_id,
          record_kind: record.record_kind,
          display_name: record.display_name,
          source_ids: sourceIds,
          evidence_count: record.evidence_refs.length,
          data_only_supporting_records: supporting,
          score,
          suggested_subagent_task: `Produce a source-backed writer-region draft for ${pagePath}; do not edit files; cite with [[cite:source_id#block_id|label]] primitives.`,
        },
      ];
    });

  if (pageOrder) {
    return items.sort((a, b) => (pageOrder.get(a.page_path) ?? Number.MAX_SAFE_INTEGER) - (pageOrder.get(b.page_path) ?? Number.MAX_SAFE_INTEGER));
  }
  return items.sort((a, b) => b.score - a.score || b.evidence_count - a.evidence_count || a.page_path.localeCompare(b.page_path));
}

function writerBacklogQueueItemHash(item: WriterBacklogQueueItem) {
  return stableHash({
    page_path: item.page_path,
    record_id: item.record_id,
    record_kind: item.record_kind,
    display_name: item.display_name,
    source_ids: item.source_ids,
    evidence_count: item.evidence_count,
    data_only_supporting_records: item.data_only_supporting_records,
    score: item.score,
  });
}

function writerBacklogQueueFingerprint(items: WriterBacklogQueueItem[]) {
  return stableHash({
    items: items.map((item) => ({
      page_path: item.page_path,
      record_id: item.record_id,
      hash: writerBacklogQueueItemHash(item),
    })),
  });
}

export function generateWriterBacklogPackets(options: WriterBacklogPacketOptions = {}): WriterBacklogPacketRun {
  const limit = options.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`writer backlog packet limit must be a positive integer: ${limit}`);
  const offset = options.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) throw new Error(`writer backlog packet offset must be a non-negative integer: ${offset}`);
  const recordKinds = normalizeWriterRecordKinds(options.recordKinds);
  const pagePaths = normalizeWriterPagePaths(options.pagePaths);

  const records = readCanonicalRecords();
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const dataOnly = records.filter((record) => DATA_ONLY_WRITER_KINDS.has(record.record_kind));
  const queueItems = collectWriterBacklogItems(records, { recordKinds, pagePaths });
  const packets = queueItems.slice(offset, offset + limit).flatMap((item, index): WriterBacklogPacket[] => {
    const target = recordsById.get(item.record_id);
    if (!target) return [];
    const queuePosition = offset + index;
    const sourceSet = new Set(item.source_ids);
    const supporting = dataOnly
      .filter((record) => recordInScope(record, sourceSet))
      .sort((a, b) => b.evidence_refs.length - a.evidence_refs.length || a.record_id.localeCompare(b.record_id))
      .slice(0, 40);
    return [
      {
        page_path: item.page_path,
        record_id: item.record_id,
        record_kind: item.record_kind,
        display_name: item.display_name,
        source_ids: item.source_ids,
        queue_position: queuePosition,
        queue_item_hash: writerBacklogQueueItemHash(item),
        current_writer_region_empty: writerRegionIsEmpty(item.page_path),
        target_record: packetRecord(target),
        supporting_records: supporting.map(packetRecord),
        instructions: [
          "Draft only inside the existing writer region for page_path.",
          "Do not edit wiki/sources pages, generated frontmatter, canonical JSONL, or submission journals.",
          "Use inline writer primitives for every record mention where an id is known: [[route:id|label]], [[corridor:id|label]], [[project:id|label]], [[entity:id|label]], or [[metric:id|label]].",
          "Use [[cite:source_id#block_id|label]] citations from evidence_refs for every factual sentence; evidence_snippets are capped text previews, not independent evidence.",
          "Do not write bare source_id#block_id citations in final prose; wrap them in cite primitives so validation and the static site can resolve them.",
          "After any future writer-region edit, run strict explicit-path checks: verify-writer-edits <page_path> and verify-writer-citations <page_path>.",
        ],
      },
    ];
  });

  const paths = writerBacklogPacketPaths(offset);
  const run: WriterBacklogPacketRun = {
    generated_at: new Date().toISOString(),
    scope: {
      empty_writer_regions: queueItems.length,
      selected_packets: packets.length,
      limit,
      offset,
      ...(recordKinds.length > 0 ? { record_kinds: recordKinds } : {}),
      ...(pagePaths.length > 0 ? { page_paths: pagePaths } : {}),
      queue_fingerprint: writerBacklogQueueFingerprint(queueItems),
    },
    packets,
    json_path: relative(repoRoot, paths.jsonPath),
    markdown_path: relative(repoRoot, paths.markdownPath),
  };

  mkdirSync(join(repoRoot, "data", "post-ingest"), { recursive: true });
  writeFileSync(paths.jsonPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  writeFileSync(paths.markdownPath, writerBacklogPacketsMarkdown(run), "utf8");
  return run;
}

function writerDispatchShardPrompt(shardId: string, packetFiles: string[]) {
  return [
    `You are a Codex subagent assigned writer packet shard ${shardId}.`,
    "Do not edit generated frontmatter, wiki/sources pages, canonical JSONL, submission journals, or any file outside the packet page_paths.",
    "Before editing, run the shard preflight command exactly and stop if it fails.",
    "For each packet page, draft only inside the existing writer region using the packet evidence_refs as citations in source_id#block_id form.",
    "After editing, run the shard post-edit command exactly and report changed files plus verifier output.",
    `Packet files: ${packetFiles.join(" ")}`,
  ].join("\n");
}

function writerBacklogDispatchPlanMarkdown(plan: WriterBacklogDispatchPlan) {
  const lines = [
    "# Writer Packet Dispatch Plan",
    "",
    `Generated: ${plan.generated_at}`,
    `Execution policy: ${plan.scope.execution_policy}`,
    `Backlog: ${plan.scope.empty_writer_regions} empty writer region(s)`,
    `Packet coverage: ${plan.scope.packet_coverage.covered_current_backlog_pages}/${plan.scope.empty_writer_regions} current pages, ${plan.scope.packet_coverage.status}`,
    `Shards: ${plan.shards.length}`,
    "",
  ];

  for (const shard of plan.shards) {
    lines.push(`## ${shard.shard_id}`);
    lines.push("");
    lines.push(`Packets: ${shard.packet_count}`);
    lines.push(`Packet files: ${shard.packet_files.join(" ")}`);
    lines.push("");
    lines.push("Preflight:");
    lines.push("```bash");
    lines.push(shard.preflight_command);
    lines.push("```");
    lines.push("");
    lines.push("Post-edit gate:");
    lines.push("```bash");
    lines.push(shard.post_edit_command);
    lines.push("```");
    lines.push("");
    lines.push("Prompt:");
    lines.push("```text");
    lines.push(shard.suggested_subagent_prompt);
    lines.push("```");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export function generateWriterBacklogDispatchPlan(options: WriterBacklogDispatchPlanOptions = {}): WriterBacklogDispatchPlan {
  const packetsPerShard = options.packetsPerShard ?? 25;
  if (!Number.isInteger(packetsPerShard) || packetsPerShard < 1) throw new Error(`writer dispatch packetsPerShard must be a positive integer: ${packetsPerShard}`);
  const maxShards = options.maxShards;
  if (maxShards !== undefined && (!Number.isInteger(maxShards) || maxShards < 1)) throw new Error(`writer dispatch maxShards must be a positive integer: ${maxShards}`);

  const queueItems = collectWriterBacklogItems();
  const packetRuns = options.packetSetPath ? packetRunsFromPacketSetManifest(options.packetSetPath) : latestWriterBacklogPacketRuns();
  const coverage = summarizeWriterBacklogPacketCoverage(
    queueItems,
    packetRuns.map(({ offset, run }) => ({ offset, pages: packetPages(run) })),
  );
  const shards: WriterBacklogDispatchShard[] = [];
  let current: Array<{ path: string; pages: string[] }> = [];
  let currentPacketCount = 0;

  const flush = () => {
    if (current.length === 0 || currentPacketCount === 0) return;
    const shardId = `writer-shard-${String(shards.length + 1).padStart(3, "0")}`;
    const packetFiles = current.map((entry) => entry.path);
    const pagePaths = current.flatMap((entry) => entry.pages);
    shards.push({
      shard_id: shardId,
      packet_files: packetFiles,
      packet_count: currentPacketCount,
      page_paths: pagePaths,
      preflight_command: `bun packages/cli/src/cli.ts verify-writer-packet-set ${packetFiles.join(" ")}`,
      post_edit_command: `bun packages/cli/src/cli.ts verify-writer-packet-edits ${packetFiles.join(" ")}`,
      suggested_subagent_prompt: writerDispatchShardPrompt(shardId, packetFiles),
    });
    current = [];
    currentPacketCount = 0;
  };

  for (const { path, run } of packetRuns) {
    const pages = packetPages(run);
    if (pages.length === 0) continue;
    if (currentPacketCount > 0 && currentPacketCount + pages.length > packetsPerShard) {
      flush();
      if (maxShards !== undefined && shards.length >= maxShards) break;
    }
    current.push({ path, pages });
    currentPacketCount += pages.length;
  }
  if (maxShards === undefined || shards.length < maxShards) flush();

  const paths = writerBacklogDispatchPlanPaths();
  const plan: WriterBacklogDispatchPlan = {
    generated_at: new Date().toISOString(),
    scope: {
      empty_writer_regions: queueItems.length,
      packet_coverage: coverage,
      packets_per_shard: packetsPerShard,
      max_shards: maxShards,
      execution_policy: "Dispatch manifest only. Do not launch writer agents or edit wiki prose until the owner pause is lifted.",
    },
    shards,
    path: relative(repoRoot, paths.jsonPath),
    markdown_path: relative(repoRoot, paths.markdownPath),
  };

  mkdirSync(join(repoRoot, "data", "post-ingest"), { recursive: true });
  writeFileSync(paths.jsonPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeFileSync(paths.markdownPath, writerBacklogDispatchPlanMarkdown(plan), "utf8");
  return plan;
}

export function verifyWriterBacklogDispatchPlan(path: string): WriterBacklogDispatchPlanVerification {
  const { absolutePath, relativePath } = repoRelativePath(path);
  const issues: WriterBacklogDispatchPlanVerificationIssue[] = [];
  let plan: WriterBacklogDispatchPlan;
  try {
    plan = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogDispatchPlan;
  } catch (error) {
    return {
      ok: false,
      path: relativePath,
      shard_count: 0,
      packet_file_count: 0,
      packet_count: 0,
      unique_page_count: 0,
      duplicate_page_count: 0,
      issues: [{ code: "invalid_dispatch_json", message: error instanceof Error ? error.message : String(error) }],
    };
  }

  const shards = Array.isArray(plan.shards) ? plan.shards : [];
  if (!Array.isArray(plan.shards)) issues.push({ code: "missing_shards", message: "dispatch plan does not contain a shards array" });
  const currentBacklogPages = new Set(collectWriterBacklogItems().map((item) => item.page_path));
  const packetFileSet = new Set<string>();
  const packetFileCounts = new Map<string, number>();
  const pageCounts = new Map<string, number>();
  let packetCount = 0;

  for (const [index, shard] of shards.entries()) {
    const shardId = typeof shard.shard_id === "string" && shard.shard_id.trim().length > 0 ? shard.shard_id : `shard-${index}`;
    const packetFiles = Array.isArray(shard.packet_files) ? shard.packet_files.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
    const pagePaths = Array.isArray(shard.page_paths) ? shard.page_paths.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
    if (packetFiles.length === 0) issues.push({ shard_id: shardId, code: "empty_shard_packet_files", message: "shard has no packet files" });
    if (pagePaths.length === 0) issues.push({ shard_id: shardId, code: "empty_shard_pages", message: "shard has no page paths" });
    if (shard.packet_count !== pagePaths.length) {
      issues.push({ shard_id: shardId, code: "shard_packet_count_mismatch", message: `packet_count=${shard.packet_count} but page_paths=${pagePaths.length}` });
    }

    for (const file of packetFiles) {
      packetFileSet.add(file);
      packetFileCounts.set(file, (packetFileCounts.get(file) ?? 0) + 1);
      if (!existsSync(join(repoRoot, file))) {
        issues.push({ shard_id: shardId, code: "missing_packet_file", message: `packet file does not exist: ${file}` });
      }
    }
    const packetFilePages = packetFiles.flatMap((file) => {
      const packetPath = join(repoRoot, file);
      if (!existsSync(packetPath)) return [];
      try {
        const run = JSON.parse(readFileSync(packetPath, "utf8")) as WriterBacklogPacketRun;
        return Array.isArray(run.packets) ? run.packets.map((packet) => packet.page_path).filter((pagePath): pagePath is string => typeof pagePath === "string" && pagePath.trim().length > 0) : [];
      } catch (error) {
        issues.push({ shard_id: shardId, code: "invalid_packet_file_json", message: `${file}: ${error instanceof Error ? error.message : String(error)}` });
        return [];
      }
    });
    if (packetFilePages.length !== pagePaths.length || packetFilePages.some((pagePath, pageIndex) => pagePath !== pagePaths[pageIndex])) {
      issues.push({ shard_id: shardId, code: "packet_file_page_mismatch", message: "shard page_paths do not match the ordered packet pages in shard packet_files" });
    }
    if (typeof shard.packet_count === "number" && shard.packet_count !== packetFilePages.length) {
      issues.push({ shard_id: shardId, code: "packet_file_packet_count_mismatch", message: `packet_count=${shard.packet_count} but packet files contain ${packetFilePages.length} packet(s)` });
    }
    for (const pagePath of pagePaths) {
      pageCounts.set(pagePath, (pageCounts.get(pagePath) ?? 0) + 1);
      if (!currentBacklogPages.has(pagePath)) {
        issues.push({ shard_id: shardId, code: "stale_dispatch_page", message: `page is not in current writer backlog: ${pagePath}` });
      }
    }
    packetCount += pagePaths.length;

    const expectedPreflight = `bun packages/cli/src/cli.ts verify-writer-packet-set ${packetFiles.join(" ")}`;
    const expectedPostEdit = `bun packages/cli/src/cli.ts verify-writer-packet-edits ${packetFiles.join(" ")}`;
    if (shard.preflight_command !== expectedPreflight) {
      issues.push({ shard_id: shardId, code: "preflight_command_mismatch", message: "preflight command does not match shard packet files" });
    }
    if (shard.post_edit_command !== expectedPostEdit) {
      issues.push({ shard_id: shardId, code: "post_edit_command_mismatch", message: "post-edit command does not match shard packet files" });
    }
    if (typeof shard.suggested_subagent_prompt !== "string" || !shard.suggested_subagent_prompt.includes("Do not edit generated frontmatter")) {
      issues.push({ shard_id: shardId, code: "missing_dispatch_prompt_guard", message: "subagent prompt is missing writer-scope guard text" });
    }
  }

  const duplicatePageCount = [...pageCounts.values()].filter((count) => count > 1).length;
  if (duplicatePageCount > 0) issues.push({ code: "duplicate_dispatch_pages", message: `${duplicatePageCount} page(s) appear in multiple dispatch slots` });
  const duplicatePacketFileCount = [...packetFileCounts.values()].filter((count) => count > 1).length;
  if (duplicatePacketFileCount > 0) issues.push({ code: "duplicate_dispatch_packet_files", message: `${duplicatePacketFileCount} packet file(s) appear in multiple dispatch slots` });
  const missingBacklogPages = [...currentBacklogPages].filter((page) => !pageCounts.has(page));
  if (missingBacklogPages.length > 0) {
    issues.push({ code: "missing_backlog_pages", message: `${missingBacklogPages.length} current backlog page(s) are not covered by the dispatch plan` });
  }
  if (plan.scope?.packet_coverage?.covered_current_backlog_pages !== currentBacklogPages.size) {
    issues.push({ code: "coverage_snapshot_not_full", message: "dispatch plan coverage snapshot does not claim full current backlog coverage" });
  }

  return {
    ok: issues.length === 0,
    path: relativePath,
    shard_count: shards.length,
    packet_file_count: packetFileSet.size,
    packet_count: packetCount,
    unique_page_count: pageCounts.size,
    duplicate_page_count: duplicatePageCount,
    issues,
  };
}

function dispatchPageRegionState(pagePath: string): "empty" | "non_empty" | "missing" {
  const absolutePath = join(repoRoot, pagePath);
  if (!existsSync(absolutePath)) return "missing";
  const contents = readFileSync(absolutePath, "utf8");
  const presence = writerRegionPresent(contents);
  if (!presence.ok) return "missing";
  const match = WRITER_REGION_CAPTURE_RE.exec(contents);
  return match && match[1]!.trim().length > 0 ? "non_empty" : "empty";
}

export function writerBacklogDispatchPlanStatus(path: string): WriterBacklogDispatchPlanStatus {
  const { absolutePath, relativePath } = repoRelativePath(path);
  const plan = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogDispatchPlan;
  const shards = Array.isArray(plan.shards) ? plan.shards : [];
  const claimsByShard = readDispatchClaimDetails(relativePath);
  const shardStatuses: WriterBacklogDispatchShardStatus[] = [];

  for (const [index, shard] of shards.entries()) {
    const shardId = typeof shard.shard_id === "string" && shard.shard_id.trim().length > 0 ? shard.shard_id : `shard-${index}`;
    const pagePaths = Array.isArray(shard.page_paths) ? shard.page_paths.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
    let emptyPages = 0;
    let nonEmptyPages = 0;
    let missingPages = 0;
    for (const pagePath of pagePaths) {
      const state = dispatchPageRegionState(pagePath);
      if (state === "empty") emptyPages += 1;
      else if (state === "non_empty") nonEmptyPages += 1;
      else missingPages += 1;
    }
    const state =
      missingPages > 0
        ? "stale_or_missing"
        : nonEmptyPages === 0
          ? "not_started"
          : emptyPages === 0
            ? "ready_for_post_edit_verification"
            : "in_progress";
    shardStatuses.push({
      shard_id: shardId,
      packet_count: typeof shard.packet_count === "number" ? shard.packet_count : pagePaths.length,
      page_count: pagePaths.length,
      empty_pages: emptyPages,
      non_empty_pages: nonEmptyPages,
      missing_pages: missingPages,
      state,
      claim: claimsByShard.get(shardId),
      preflight_command: shard.preflight_command,
      post_edit_command: shard.post_edit_command,
    });
  }

  return {
    path: relativePath,
    shard_count: shardStatuses.length,
    packet_count: shardStatuses.reduce((sum, shard) => sum + shard.packet_count, 0),
    empty_pages: shardStatuses.reduce((sum, shard) => sum + shard.empty_pages, 0),
    non_empty_pages: shardStatuses.reduce((sum, shard) => sum + shard.non_empty_pages, 0),
    missing_pages: shardStatuses.reduce((sum, shard) => sum + shard.missing_pages, 0),
    not_started_shards: shardStatuses.filter((shard) => shard.state === "not_started").length,
    in_progress_shards: shardStatuses.filter((shard) => shard.state === "in_progress").length,
    ready_for_post_edit_verification_shards: shardStatuses.filter((shard) => shard.state === "ready_for_post_edit_verification").length,
    stale_or_missing_shards: shardStatuses.filter((shard) => shard.state === "stale_or_missing").length,
    claimed_shards: shardStatuses.filter((shard) => shard.claim !== undefined).length,
    unclaimed_not_started_shards: shardStatuses.filter((shard) => shard.state === "not_started" && shard.claim === undefined).length,
    shards: shardStatuses,
  };
}

function writerBacklogDispatchStatusMarkdown(report: WriterBacklogDispatchPlanStatusReport) {
  const status = report.status;
  const activeShards = status.shards.filter((shard) => shard.state !== "not_started");
  const lines = [
    "# Writer Packet Dispatch Status",
    "",
    `Generated: ${report.generated_at}`,
    `Dispatch plan: ${report.dispatch_plan_path}`,
    "",
    `Shards: ${status.shard_count}`,
    `Packets: ${status.packet_count}`,
    `Pages: ${status.empty_pages} empty, ${status.non_empty_pages} non-empty, ${status.missing_pages} missing/stale`,
    `Shard states: ${status.not_started_shards} not started, ${status.in_progress_shards} in progress, ${status.ready_for_post_edit_verification_shards} ready for post-edit verification, ${status.stale_or_missing_shards} stale/missing`,
    `Claims: ${status.claimed_shards} claimed, ${status.unclaimed_not_started_shards} unclaimed not-started`,
    "",
  ];

  const claimedShards = status.shards.filter((shard) => shard.claim);
  if (activeShards.length === 0 && claimedShards.length === 0) {
    lines.push("No shard has started; every tracked writer region is still empty.");
    lines.push("");
  }
  if (activeShards.length > 0) {
    lines.push("## Active Shards");
    lines.push("");
    for (const shard of activeShards) {
      lines.push(`- ${shard.shard_id}: ${shard.state}; empty=${shard.empty_pages}, non_empty=${shard.non_empty_pages}, missing=${shard.missing_pages}`);
    }
    lines.push("");
  }
  if (claimedShards.length > 0) {
    lines.push("## Claimed Shards");
    lines.push("");
    for (const shard of claimedShards) {
      lines.push(`- ${shard.shard_id}: ${shard.claim!.owner}, ${shard.claim!.path}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export function writeWriterBacklogDispatchPlanStatus(path: string): WriterBacklogDispatchPlanStatusReport {
  const status = writerBacklogDispatchPlanStatus(path);
  const paths = writerBacklogDispatchStatusPaths();
  const report: WriterBacklogDispatchPlanStatusReport = {
    generated_at: new Date().toISOString(),
    dispatch_plan_path: status.path,
    status,
    path: relative(repoRoot, paths.jsonPath),
    markdown_path: relative(repoRoot, paths.markdownPath),
  };

  mkdirSync(join(repoRoot, "data", "post-ingest"), { recursive: true });
  writeFileSync(paths.jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(paths.markdownPath, writerBacklogDispatchStatusMarkdown(report), "utf8");
  return report;
}

function readExistingDispatchClaims(dispatchPlanPath: string) {
  const dir = join(repoRoot, "data", "post-ingest");
  if (!existsSync(dir)) return new Set<string>();
  const claimed = new Set<string>();
  for (const fileName of readdirSync(dir).sort()) {
    if (!fileName.endsWith("_writer-packet-dispatch-claim.json") && !fileName.includes("_writer-packet-dispatch-claim-")) continue;
    if (!fileName.endsWith(".json")) continue;
    const parsed = readJson(join(dir, fileName));
    if (parsed?.dispatch_plan_path !== dispatchPlanPath) continue;
    const shards = Array.isArray(parsed.shards) ? parsed.shards : [];
    for (const shard of shards) {
      if (!shard || typeof shard !== "object" || Array.isArray(shard)) continue;
      const shardId = shard["shard_id"];
      if (typeof shardId === "string" && shardId.trim().length > 0) claimed.add(shardId);
    }
  }
  return claimed;
}

function readDispatchClaimDetails(dispatchPlanPath: string) {
  const dir = join(repoRoot, "data", "post-ingest");
  const claims = new Map<string, NonNullable<WriterBacklogDispatchShardStatus["claim"]>>();
  if (!existsSync(dir)) return claims;
  for (const fileName of readdirSync(dir).sort()) {
    if (!fileName.endsWith("_writer-packet-dispatch-claim.json") && !fileName.includes("_writer-packet-dispatch-claim-")) continue;
    if (!fileName.endsWith(".json")) continue;
    const path = join(dir, fileName);
    const parsed = readJson(path);
    if (parsed?.dispatch_plan_path !== dispatchPlanPath) continue;
    const owner = typeof parsed.owner === "string" && parsed.owner.trim().length > 0 ? parsed.owner : "unknown";
    const claimId = typeof parsed.claim_id === "string" && parsed.claim_id.trim().length > 0 ? parsed.claim_id : relative(repoRoot, path);
    const generatedAt = typeof parsed.generated_at === "string" && parsed.generated_at.trim().length > 0 ? parsed.generated_at : "";
    const shards = Array.isArray(parsed.shards) ? parsed.shards : [];
    for (const shard of shards) {
      if (!shard || typeof shard !== "object" || Array.isArray(shard)) continue;
      const shardId = shard["shard_id"];
      if (typeof shardId !== "string" || shardId.trim().length === 0) continue;
      claims.set(shardId, {
        owner,
        claim_id: claimId,
        path: relative(repoRoot, path),
        generated_at: generatedAt,
      });
    }
  }
  return claims;
}

function dispatchClaimFiles(dispatchPlanPath: string) {
  const dir = join(repoRoot, "data", "post-ingest");
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const fileName of readdirSync(dir).sort()) {
    if (!fileName.endsWith("_writer-packet-dispatch-claim.json") && !fileName.includes("_writer-packet-dispatch-claim-")) continue;
    if (!fileName.endsWith(".json")) continue;
    const path = join(dir, fileName);
    const parsed = readJson(path);
    if (parsed?.dispatch_plan_path === dispatchPlanPath) files.push(relative(repoRoot, path));
  }
  return files;
}

function writerBacklogDispatchClaimMarkdown(claim: WriterBacklogDispatchClaim) {
  const lines = [
    "# Writer Packet Dispatch Claim",
    "",
    `Claim: ${claim.claim_id}`,
    `Generated: ${claim.generated_at}`,
    `Owner: ${claim.owner}`,
    `Dispatch plan: ${claim.dispatch_plan_path}`,
    `Execution policy: ${claim.execution_policy}`,
    `Claimed shards: ${claim.claimed_count}`,
    `Already claimed shards skipped: ${claim.skipped_already_claimed_shards}`,
    `Available unclaimed shards after claim: ${claim.available_unclaimed_shards}`,
    "",
  ];
  if (claim.claim_preflight_command) {
    lines.push("Claim preflight:");
    lines.push("```bash");
    lines.push(claim.claim_preflight_command);
    lines.push("```");
    lines.push("");
  }

  for (const shard of claim.shards) {
    lines.push(`## ${shard.shard_id}`);
    lines.push("");
    lines.push(`Packets: ${shard.packet_count}`);
    lines.push(`Packet files: ${shard.packet_files.join(" ")}`);
    lines.push("");
    lines.push("Preflight:");
    lines.push("```bash");
    lines.push(shard.preflight_command);
    lines.push("```");
    lines.push("");
    lines.push("Post-edit gate:");
    lines.push("```bash");
    lines.push(shard.post_edit_command);
    lines.push("```");
    lines.push("");
    lines.push("Prompt:");
    lines.push("```text");
    lines.push(shard.suggested_subagent_prompt);
    lines.push("```");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export function verifyWriterBacklogDispatchClaim(path: string): WriterBacklogDispatchClaimVerification {
  const { absolutePath, relativePath } = repoRelativePath(path);
  const issues: WriterBacklogDispatchClaimVerificationIssue[] = [];
  let claim: WriterBacklogDispatchClaim;
  try {
    claim = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogDispatchClaim;
  } catch (error) {
    return {
      ok: false,
      path: relativePath,
      claimed_count: 0,
      unique_claimed_shards: 0,
      issues: [{ code: "invalid_claim_json", message: error instanceof Error ? error.message : String(error) }],
    };
  }

  const dispatchPlanPath = typeof claim.dispatch_plan_path === "string" ? claim.dispatch_plan_path : undefined;
  if (!dispatchPlanPath) issues.push({ code: "missing_dispatch_plan_path", message: "claim does not specify dispatch_plan_path" });
  const owner = typeof claim.owner === "string" && claim.owner.trim().length > 0 ? claim.owner : undefined;
  if (!owner) issues.push({ code: "missing_owner", message: "claim owner is missing" });
  const claimPreflight = typeof claim.claim_preflight_command === "string" ? claim.claim_preflight_command : undefined;
  if (claimPreflight !== undefined && claimPreflight !== `bun packages/cli/src/cli.ts verify-writer-packet-dispatch-claim ${relativePath}`) {
    issues.push({ code: "claim_preflight_command_mismatch", message: "claim_preflight_command does not match this claim artifact path" });
  }
  const shards = Array.isArray(claim.shards) ? claim.shards : [];
  if (!Array.isArray(claim.shards)) issues.push({ code: "missing_claim_shards", message: "claim does not contain a shards array" });
  if (typeof claim.claimed_count === "number" && claim.claimed_count !== shards.length) {
    issues.push({ code: "claimed_count_mismatch", message: `claimed_count=${claim.claimed_count} but shards=${shards.length}` });
  }

  let plan: WriterBacklogDispatchPlan | undefined;
  let status: WriterBacklogDispatchPlanStatus | undefined;
  if (dispatchPlanPath) {
    try {
      const { absolutePath: dispatchAbsolutePath } = repoRelativePath(dispatchPlanPath);
      plan = JSON.parse(readFileSync(dispatchAbsolutePath, "utf8")) as WriterBacklogDispatchPlan;
      status = writerBacklogDispatchPlanStatus(dispatchPlanPath);
    } catch (error) {
      issues.push({ code: "invalid_dispatch_plan", message: error instanceof Error ? error.message : String(error) });
    }
  }
  const planShardsById = new Map((Array.isArray(plan?.shards) ? plan!.shards : []).map((shard) => [shard.shard_id, shard]));
  const statusById = new Map((status?.shards ?? []).map((shard) => [shard.shard_id, shard]));
  const shardCounts = new Map<string, number>();

  for (const shard of shards) {
    const shardId = typeof shard?.shard_id === "string" && shard.shard_id.trim().length > 0 ? shard.shard_id : undefined;
    if (!shardId) {
      issues.push({ code: "missing_claim_shard_id", message: "claim shard is missing shard_id" });
      continue;
    }
    shardCounts.set(shardId, (shardCounts.get(shardId) ?? 0) + 1);
    const planShard = planShardsById.get(shardId);
    if (!planShard) {
      issues.push({ shard_id: shardId, code: "unknown_claim_shard", message: "claimed shard is not present in the dispatch plan" });
      continue;
    }
    const statusShard = statusById.get(shardId);
    if (statusShard?.state !== "not_started") {
      issues.push({ shard_id: shardId, code: "claimed_shard_not_not_started", message: `claimed shard current state is ${statusShard?.state ?? "(missing)"}` });
    }
    if (statusShard?.claim?.path !== relativePath) {
      issues.push({ shard_id: shardId, code: "claim_status_mismatch", message: `dispatch status points at ${statusShard?.claim?.path ?? "(no claim)"} for this shard` });
    }
    if (shard.packet_count !== planShard.packet_count) {
      issues.push({ shard_id: shardId, code: "claim_packet_count_mismatch", message: `claim packet_count=${shard.packet_count} but dispatch plan has ${planShard.packet_count}` });
    }
    if (!Array.isArray(shard.packet_files) || shard.packet_files.length !== planShard.packet_files.length || shard.packet_files.some((file, index) => file !== planShard.packet_files[index])) {
      issues.push({ shard_id: shardId, code: "claim_packet_files_mismatch", message: "claim packet_files do not match dispatch plan packet_files" });
    }
    if (shard.preflight_command !== planShard.preflight_command) {
      issues.push({ shard_id: shardId, code: "claim_preflight_command_mismatch", message: "claim preflight command does not match dispatch plan" });
    }
    if (shard.post_edit_command !== planShard.post_edit_command) {
      issues.push({ shard_id: shardId, code: "claim_post_edit_command_mismatch", message: "claim post-edit command does not match dispatch plan" });
    }
  }

  for (const [shardId, count] of shardCounts) {
    if (count > 1) issues.push({ shard_id: shardId, code: "duplicate_claim_shard", message: `shard appears ${count} times in the claim` });
  }

  return {
    ok: issues.length === 0,
    path: relativePath,
    dispatch_plan_path: dispatchPlanPath,
    owner,
    claimed_count: shards.length,
    unique_claimed_shards: shardCounts.size,
    issues,
  };
}

export function verifyWriterBacklogDispatchClaims(path: string): WriterBacklogDispatchClaimsVerification {
  const { relativePath } = repoRelativePath(path);
  const status = writerBacklogDispatchPlanStatus(path);
  const claimFiles = dispatchClaimFiles(relativePath);
  const files = claimFiles.map((claimPath) => verifyWriterBacklogDispatchClaim(claimPath));
  const issues: WriterBacklogDispatchClaimsVerificationIssue[] = [];
  const shardClaims = new Map<string, string[]>();

  for (const file of files) {
    for (const issue of file.issues) issues.push({ ...issue, path: file.path });
    const parsed = readJson(join(repoRoot, file.path));
    const shards = Array.isArray(parsed?.shards) ? parsed.shards : [];
    for (const shard of shards) {
      if (!shard || typeof shard !== "object" || Array.isArray(shard)) continue;
      const shardId = shard["shard_id"];
      if (typeof shardId !== "string" || shardId.trim().length === 0) continue;
      const paths = shardClaims.get(shardId) ?? [];
      paths.push(file.path);
      shardClaims.set(shardId, paths);
    }
  }

  for (const [shardId, paths] of shardClaims) {
    if (paths.length > 1) {
      issues.push({ shard_id: shardId, code: "duplicate_claimed_shard_across_files", message: `shard is claimed by ${paths.length} files: ${paths.join(", ")}` });
    }
  }
  if (status.claimed_shards !== shardClaims.size) {
    issues.push({ code: "claimed_status_count_mismatch", message: `dispatch status reports ${status.claimed_shards} claimed shard(s), but claim files contain ${shardClaims.size} unique claimed shard(s)` });
  }
  const statusClaimed = new Set(status.shards.filter((shard) => shard.claim).map((shard) => shard.shard_id));
  for (const shardId of shardClaims.keys()) {
    if (!statusClaimed.has(shardId)) issues.push({ shard_id: shardId, code: "claimed_shard_missing_from_status", message: "claim file contains a shard that dispatch status does not mark as claimed" });
  }

  return {
    ok: issues.length === 0,
    dispatch_plan_path: relativePath,
    claim_file_count: files.length,
    claimed_count: [...shardClaims.values()].reduce((sum, paths) => sum + paths.length, 0),
    unique_claimed_shards: shardClaims.size,
    unclaimed_not_started_shards: status.unclaimed_not_started_shards,
    files,
    issues,
  };
}

function writerBacklogDispatchReadinessMarkdown(report: WriterBacklogDispatchReadinessReport) {
  const lines = [
    "# Writer Packet Dispatch Readiness",
    "",
    `Generated: ${report.generated_at}`,
    `Ready: ${report.ok ? "yes" : "no"}`,
    `Execution policy: ${report.execution_policy}`,
    `Dispatch plan: ${report.dispatch_plan_path}`,
  ];
  if (report.packet_set_path) lines.push(`Packet set: ${report.packet_set_path}`);
  lines.push("");
  lines.push(`Dispatch verification: ${report.dispatch_verification.ok ? "ok" : "failed"}`);
  lines.push(`Claims verification: ${report.claims_verification.ok ? "ok" : "failed"}`);
  if (report.packet_set_verification) lines.push(`Packet-set verification: ${report.packet_set_verification.ok ? "ok" : "failed"}`);
  lines.push("");
  lines.push(`Shards: ${report.status.shard_count}`);
  lines.push(`Packets: ${report.status.packet_count}`);
  lines.push(`Claimed shards: ${report.status.claimed_shards}`);
  lines.push(`Unclaimed not-started shards: ${report.status.unclaimed_not_started_shards}`);
  lines.push(`Pages: ${report.status.empty_pages} empty, ${report.status.non_empty_pages} non-empty, ${report.status.missing_pages} missing/stale`);
  lines.push("");
  lines.push("## Readiness Checks");
  lines.push("");
  lines.push(`- all_shards_claimed: ${report.readiness.all_shards_claimed}`);
  lines.push(`- all_pages_unedited: ${report.readiness.all_pages_unedited}`);
  lines.push(`- no_missing_pages: ${report.readiness.no_missing_pages}`);
  lines.push(`- no_active_or_completed_writer_regions: ${report.readiness.no_active_or_completed_writer_regions}`);
  lines.push("");
  lines.push("## Claim Execution Checklist");
  lines.push("");
  for (const claim of report.claim_execution) {
    const firstShard = claim.shard_ids[0] ?? "(none)";
    const lastShard = claim.shard_ids.at(-1) ?? "(none)";
    lines.push(`### ${claim.path}`);
    lines.push("");
    lines.push(`Owner: ${claim.owner ?? "(unknown)"}`);
    lines.push(`Shards: ${claim.claimed_count} (${firstShard}${firstShard === lastShard ? "" : ` through ${lastShard}`})`);
    if (claim.claim_preflight_command) {
      lines.push("");
      lines.push("Claim preflight:");
      lines.push("```bash");
      lines.push(claim.claim_preflight_command);
      lines.push("```");
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function writeWriterBacklogDispatchReadinessReport(path: string, options: { packetSetPath?: string | undefined } = {}): WriterBacklogDispatchReadinessReport {
  const { relativePath } = repoRelativePath(path);
  const dispatchVerification = verifyWriterBacklogDispatchPlan(path);
  const claimsVerification = verifyWriterBacklogDispatchClaims(path);
  const status = writerBacklogDispatchPlanStatus(path);
  const packetSetVerification = options.packetSetPath ? verifyWriterBacklogPacketSetManifest(options.packetSetPath) : undefined;
  const claimExecution = claimsVerification.files.map((file) => {
    const parsed = readJson(join(repoRoot, file.path));
    const shards = Array.isArray(parsed?.shards) ? parsed.shards : [];
    const shardIds = shards.flatMap((shard) =>
      shard && typeof shard === "object" && !Array.isArray(shard) && typeof shard["shard_id"] === "string" ? [shard["shard_id"]] : [],
    );
    return {
      path: file.path,
      owner: file.owner,
      claimed_count: file.claimed_count,
      shard_ids: shardIds,
      claim_preflight_command: typeof parsed?.claim_preflight_command === "string" ? parsed.claim_preflight_command : undefined,
    };
  });
  const readiness = {
    all_shards_claimed: status.shard_count > 0 && status.claimed_shards === status.shard_count && status.unclaimed_not_started_shards === 0,
    all_pages_unedited: status.empty_pages === status.packet_count && status.non_empty_pages === 0,
    no_missing_pages: status.missing_pages === 0 && status.stale_or_missing_shards === 0,
    no_active_or_completed_writer_regions: status.in_progress_shards === 0 && status.ready_for_post_edit_verification_shards === 0,
  };
  const ok =
    dispatchVerification.ok &&
    claimsVerification.ok &&
    (packetSetVerification?.ok ?? true) &&
    readiness.all_shards_claimed &&
    readiness.all_pages_unedited &&
    readiness.no_missing_pages &&
    readiness.no_active_or_completed_writer_regions;
  const paths = writerBacklogDispatchReadinessPaths();
  const report: WriterBacklogDispatchReadinessReport = {
    generated_at: new Date().toISOString(),
    ok,
    execution_policy: "Readiness report only. Do not launch writer agents or edit wiki prose until the owner pause is lifted.",
    dispatch_plan_path: relativePath,
    packet_set_path: options.packetSetPath ? repoRelativePath(options.packetSetPath).relativePath : undefined,
    claim_execution: claimExecution,
    packet_set_verification: packetSetVerification,
    dispatch_verification: dispatchVerification,
    claims_verification: claimsVerification,
    status,
    readiness,
    path: relative(repoRoot, paths.jsonPath),
    markdown_path: relative(repoRoot, paths.markdownPath),
  };

  mkdirSync(join(repoRoot, "data", "post-ingest"), { recursive: true });
  writeFileSync(paths.jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(paths.markdownPath, writerBacklogDispatchReadinessMarkdown(report), "utf8");
  return report;
}

export function claimWriterBacklogDispatchShards(path: string, options: WriterBacklogDispatchClaimOptions = {}): WriterBacklogDispatchClaim {
  const limit = options.limit ?? 1;
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`writer dispatch claim limit must be a positive integer: ${limit}`);
  const owner = options.owner?.trim() || "codex";
  const { absolutePath, relativePath } = repoRelativePath(path);
  const plan = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogDispatchPlan;
  const status = writerBacklogDispatchPlanStatus(path);
  const claimedShardIds = readExistingDispatchClaims(relativePath);
  const planShardsById = new Map((Array.isArray(plan.shards) ? plan.shards : []).map((shard) => [shard.shard_id, shard]));
  const eligible = status.shards.filter((shard) => shard.state === "not_started" && !claimedShardIds.has(shard.shard_id));
  const selected = eligible.slice(0, limit).flatMap((shard): WriterBacklogDispatchClaimShard[] => {
    const planShard = planShardsById.get(shard.shard_id);
    if (!planShard) return [];
    return [
      {
        ...shard,
        packet_files: planShard.packet_files,
        page_paths: planShard.page_paths,
        suggested_subagent_prompt: planShard.suggested_subagent_prompt,
      },
    ];
  });
  const paths = writerBacklogDispatchClaimPaths();
  const claimPath = relative(repoRoot, paths.jsonPath);
  const claim: WriterBacklogDispatchClaim = {
    claim_id: stableHash({ dispatch_plan_path: relativePath, owner, generated_at: new Date().toISOString(), shard_ids: selected.map((shard) => shard.shard_id) }).slice(0, 16),
    generated_at: new Date().toISOString(),
    owner,
    dispatch_plan_path: relativePath,
    requested_limit: limit,
    claimed_count: selected.length,
    skipped_already_claimed_shards: status.shards.filter((shard) => claimedShardIds.has(shard.shard_id)).length,
    available_unclaimed_shards: Math.max(0, eligible.length - selected.length),
    execution_policy: "Claim artifact only. Do not launch writer agents or edit wiki prose until the owner pause is lifted.",
    claim_preflight_command: `bun packages/cli/src/cli.ts verify-writer-packet-dispatch-claim ${claimPath}`,
    shards: selected,
    path: claimPath,
    markdown_path: relative(repoRoot, paths.markdownPath),
  };

  mkdirSync(join(repoRoot, "data", "post-ingest"), { recursive: true });
  writeFileSync(paths.jsonPath, `${JSON.stringify(claim, null, 2)}\n`, "utf8");
  writeFileSync(paths.markdownPath, writerBacklogDispatchClaimMarkdown(claim), "utf8");
  return claim;
}

function writerBacklogDispatchNextShardMarkdown(report: WriterBacklogDispatchNextShardReport) {
  const lines = [
    "# Writer Packet Dispatch Next Shard",
    "",
    `Generated: ${report.generated_at}`,
    `Dispatch plan: ${report.dispatch_plan_path}`,
    `Selected: ${report.selected ? "yes" : "no"}`,
    `Execution policy: ${report.execution_policy}`,
    "",
  ];
  if (!report.selected || !report.shard) {
    lines.push(`Reason: ${report.reason ?? "No eligible shard."}`);
    lines.push("");
    return `${lines.join("\n")}\n`;
  }

  const shard = report.shard;
  lines.push(
    `Shard: ${shard.shard_id}`,
    `Owner: ${shard.claim?.owner ?? "(unclaimed)"}`,
    `Claim file: ${shard.claim?.path ?? "(none)"}`,
    `State: ${shard.state}`,
    `Pages: ${shard.empty_pages} empty, ${shard.non_empty_pages} non-empty, ${shard.missing_pages} missing`,
    "",
    "## Required Commands",
    "",
  );
  if (report.claim_preflight_command) lines.push(`- Claim preflight: \`${report.claim_preflight_command}\``);
  lines.push(`- Shard preflight: \`${shard.preflight_command}\``);
  lines.push(`- Post-edit verification: \`${shard.post_edit_command}\``);
  lines.push("", "## Packet Files", "");
  for (const packetFile of shard.packet_files) lines.push(`- ${packetFile}`);
  lines.push("", "## Page Paths", "");
  for (const pagePath of shard.page_paths) lines.push(`- ${pagePath}`);
  lines.push("", "## Subagent Prompt", "", "```text", shard.suggested_subagent_prompt, "```", "");
  return `${lines.join("\n")}\n`;
}

export function writeWriterBacklogDispatchNextShard(path: string, options: WriterBacklogDispatchNextShardOptions = {}): WriterBacklogDispatchNextShardReport {
  const { absolutePath, relativePath } = repoRelativePath(path);
  const plan = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogDispatchPlan;
  const status = writerBacklogDispatchPlanStatus(path);
  const planShardsById = new Map((Array.isArray(plan.shards) ? plan.shards : []).map((shard) => [shard.shard_id, shard]));
  const requestedShardId = options.shardId?.trim();
  const eligible = status.shards.filter((shard) => shard.state === "not_started" && shard.claim !== undefined);
  const statusShard = requestedShardId ? status.shards.find((shard) => shard.shard_id === requestedShardId) : eligible[0];
  const planShard = statusShard ? planShardsById.get(statusShard.shard_id) : undefined;
  const selected = Boolean(statusShard && planShard && statusShard.state === "not_started" && statusShard.claim !== undefined);
  const paths = writerBacklogDispatchNextShardPaths();
  const reportPath = relative(repoRoot, paths.jsonPath);

  let reason: string | undefined;
  if (!statusShard) reason = requestedShardId ? `Requested shard not found: ${requestedShardId}` : "No claimed not-started shard is available.";
  else if (!planShard) reason = `Selected shard is missing from the dispatch plan: ${statusShard.shard_id}`;
  else if (statusShard.state !== "not_started") reason = `Selected shard is ${statusShard.state}, not not_started.`;
  else if (!statusShard.claim) reason = `Selected shard is not claimed: ${statusShard.shard_id}`;

  const shard: WriterBacklogDispatchClaimShard | undefined = selected && statusShard && planShard
    ? {
        ...statusShard,
        packet_files: planShard.packet_files,
        page_paths: planShard.page_paths,
        suggested_subagent_prompt: planShard.suggested_subagent_prompt,
      }
    : undefined;

  const report: WriterBacklogDispatchNextShardReport = {
    generated_at: new Date().toISOString(),
    dispatch_plan_path: relativePath,
    requested_shard_id: requestedShardId,
    selected,
    reason,
    execution_policy: "Handoff artifact only. Do not launch writer agents or edit wiki prose until the owner pause is lifted.",
    shard,
    claim_preflight_command: shard?.claim?.path ? `bun packages/cli/src/cli.ts verify-writer-packet-dispatch-claim ${shard.claim.path}` : undefined,
    path: reportPath,
    markdown_path: relative(repoRoot, paths.markdownPath),
  };

  mkdirSync(join(repoRoot, "data", "post-ingest"), { recursive: true });
  writeFileSync(paths.jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(paths.markdownPath, writerBacklogDispatchNextShardMarkdown(report), "utf8");
  return report;
}

function writerBacklogDispatchHandoffBatchMarkdown(report: WriterBacklogDispatchHandoffBatchReport) {
  const lines = [
    "# Writer Packet Dispatch Handoff Batch",
    "",
    `Generated: ${report.generated_at}`,
    `Dispatch plan: ${report.dispatch_plan_path}`,
    `Skip: ${report.requested_skip}`,
    `Selected: ${report.selected_count}/${report.available_claimed_not_started_shards} claimed not-started shard(s)`,
    `Execution policy: ${report.execution_policy}`,
    "",
  ];
  if (report.shards.length === 0) {
    lines.push("No claimed not-started shard is available.");
    lines.push("");
    return `${lines.join("\n")}\n`;
  }

  lines.push("## Shards", "");
  for (const entry of report.shards) {
    const shard = entry.shard;
    lines.push(
      `### ${shard.shard_id}`,
      "",
      `Owner: ${shard.claim?.owner ?? "(unclaimed)"}`,
      `Claim file: ${shard.claim?.path ?? "(none)"}`,
      `Packets: ${shard.packet_count}`,
      `Pages: ${shard.page_paths.length}`,
      `Claim preflight: ${entry.claim_preflight_command ?? "(none)"}`,
      `Shard preflight: ${shard.preflight_command}`,
      `Post-edit verification: ${shard.post_edit_command}`,
      "",
      "Packet files:",
    );
    for (const packetFile of shard.packet_files) lines.push(`- ${packetFile}`);
    lines.push("", "Page paths:");
    for (const pagePath of shard.page_paths) lines.push(`- ${pagePath}`);
    lines.push("", "Subagent prompt:", "", "```text", shard.suggested_subagent_prompt, "```", "");
  }
  return `${lines.join("\n")}\n`;
}

export function writeWriterBacklogDispatchHandoffBatch(path: string, options: WriterBacklogDispatchHandoffBatchOptions = {}): WriterBacklogDispatchHandoffBatchReport {
  const limit = options.limit ?? 12;
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`writer dispatch handoff batch limit must be a positive integer: ${limit}`);
  const skip = options.skip ?? 0;
  if (!Number.isInteger(skip) || skip < 0) throw new Error(`writer dispatch handoff batch skip must be a non-negative integer: ${skip}`);
  const { absolutePath, relativePath } = repoRelativePath(path);
  const plan = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogDispatchPlan;
  const status = writerBacklogDispatchPlanStatus(path);
  const planShardsById = new Map((Array.isArray(plan.shards) ? plan.shards : []).map((shard) => [shard.shard_id, shard]));
  const eligible = status.shards.filter((shard) => shard.state === "not_started" && shard.claim !== undefined);
  const shards = eligible.slice(skip, skip + limit).flatMap((statusShard) => {
    const planShard = planShardsById.get(statusShard.shard_id);
    if (!planShard) return [];
    const shard: WriterBacklogDispatchClaimShard = {
      ...statusShard,
      packet_files: planShard.packet_files,
      page_paths: planShard.page_paths,
      suggested_subagent_prompt: planShard.suggested_subagent_prompt,
    };
    return [
      {
        shard,
        claim_preflight_command: shard.claim?.path ? `bun packages/cli/src/cli.ts verify-writer-packet-dispatch-claim ${shard.claim.path}` : undefined,
      },
    ];
  });
  const paths = writerBacklogDispatchHandoffBatchPaths();
  const report: WriterBacklogDispatchHandoffBatchReport = {
    generated_at: new Date().toISOString(),
    dispatch_plan_path: relativePath,
    requested_limit: limit,
    requested_skip: skip,
    selected_count: shards.length,
    available_claimed_not_started_shards: eligible.length,
    execution_policy: "Handoff artifact only. Do not launch writer agents or edit wiki prose until the owner pause is lifted.",
    shards,
    path: relative(repoRoot, paths.jsonPath),
    markdown_path: relative(repoRoot, paths.markdownPath),
  };

  mkdirSync(join(repoRoot, "data", "post-ingest"), { recursive: true });
  writeFileSync(paths.jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(paths.markdownPath, writerBacklogDispatchHandoffBatchMarkdown(report), "utf8");
  return report;
}

export function verifyWriterBacklogDispatchHandoffBatch(path: string): WriterBacklogDispatchHandoffBatchVerification {
  const { absolutePath, relativePath } = repoRelativePath(path);
  const issues: WriterBacklogDispatchHandoffBatchVerificationIssue[] = [];
  let report: WriterBacklogDispatchHandoffBatchReport;
  try {
    report = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogDispatchHandoffBatchReport;
  } catch (error) {
    return {
      ok: false,
      path: relativePath,
      selected_count: 0,
      unique_shard_count: 0,
      claim_file_count: 0,
      packet_file_count: 0,
      packet_count: 0,
      page_count: 0,
      checked_source_blocks: 0,
      issues: [{ code: "invalid_handoff_batch_json", message: error instanceof Error ? error.message : String(error) }],
    };
  }

  const dispatchPlanPath = typeof report.dispatch_plan_path === "string" ? report.dispatch_plan_path : undefined;
  if (!dispatchPlanPath) issues.push({ code: "missing_dispatch_plan_path", message: "handoff batch does not specify dispatch_plan_path" });
  const entries = Array.isArray(report.shards) ? report.shards : [];
  if (!Array.isArray(report.shards)) issues.push({ code: "missing_handoff_shards", message: "handoff batch does not contain a shards array" });
  if (typeof report.selected_count === "number" && report.selected_count !== entries.length) {
    issues.push({ code: "selected_count_mismatch", message: `selected_count=${report.selected_count} but shards=${entries.length}` });
  }

  let status: WriterBacklogDispatchPlanStatus | undefined;
  if (dispatchPlanPath) {
    try {
      status = writerBacklogDispatchPlanStatus(dispatchPlanPath);
    } catch (error) {
      issues.push({ code: "invalid_dispatch_plan", message: error instanceof Error ? error.message : String(error) });
    }
  }
  const statusByShard = new Map((status?.shards ?? []).map((shard) => [shard.shard_id, shard]));
  const seenShardIds = new Set<string>();
  const claimFiles = new Set<string>();
  const packetFiles = new Set<string>();
  let packetCount = 0;
  let pageCount = 0;
  let checkedSourceBlocks = 0;

  for (const entry of entries) {
    const shard = entry?.shard;
    const shardId = typeof shard?.shard_id === "string" ? shard.shard_id : undefined;
    if (!shardId) {
      issues.push({ code: "missing_shard_id", message: "handoff shard entry is missing shard_id" });
      continue;
    }
    if (seenShardIds.has(shardId)) issues.push({ shard_id: shardId, code: "duplicate_handoff_shard", message: "handoff batch contains duplicate shard_id" });
    seenShardIds.add(shardId);

    const current = statusByShard.get(shardId);
    if (!current) issues.push({ shard_id: shardId, code: "unknown_handoff_shard", message: "handoff shard is not present in dispatch status" });
    else {
      if (current.state !== "not_started") issues.push({ shard_id: shardId, code: "handoff_shard_not_not_started", message: `current shard state is ${current.state}` });
      if (!current.claim) issues.push({ shard_id: shardId, code: "handoff_shard_unclaimed", message: "current shard is not claimed" });
      if (current.claim && shard.claim?.path && current.claim.path !== shard.claim.path) {
        issues.push({ shard_id: shardId, code: "handoff_claim_path_mismatch", message: `current claim path is ${current.claim.path}, handoff path is ${shard.claim.path}` });
      }
    }

    const claimPath = shard.claim?.path;
    if (claimPath) {
      claimFiles.add(claimPath);
      const expectedClaimPreflight = `bun packages/cli/src/cli.ts verify-writer-packet-dispatch-claim ${claimPath}`;
      if (entry.claim_preflight_command !== expectedClaimPreflight) {
        issues.push({ shard_id: shardId, path: claimPath, code: "claim_preflight_command_mismatch", message: "handoff claim preflight command does not match claim path" });
      }
    } else {
      issues.push({ shard_id: shardId, code: "missing_claim_path", message: "handoff shard does not include a claim path" });
    }

    for (const packetFile of Array.isArray(shard.packet_files) ? shard.packet_files : []) packetFiles.add(packetFile);
    pageCount += Array.isArray(shard.page_paths) ? shard.page_paths.length : 0;
  }

  for (const claimFile of claimFiles) {
    const claimVerification = verifyWriterBacklogDispatchClaim(claimFile);
    if (!claimVerification.ok) {
      for (const issue of claimVerification.issues) {
        issues.push({ shard_id: issue.shard_id, path: claimFile, code: issue.code, message: issue.message });
      }
    }
  }

  const packetSet = verifyWriterBacklogPacketSet([...packetFiles]);
  packetCount = packetSet.packet_count;
  checkedSourceBlocks = packetSet.checked_source_blocks;
  if (!packetSet.ok) {
    for (const issue of packetSet.issues) {
      issues.push({ path: issue.path, code: issue.code, message: issue.message });
    }
  }

  return {
    ok: issues.length === 0,
    path: relativePath,
    dispatch_plan_path: dispatchPlanPath,
    selected_count: entries.length,
    unique_shard_count: seenShardIds.size,
    claim_file_count: claimFiles.size,
    packet_file_count: packetFiles.size,
    packet_count: packetCount,
    page_count: pageCount,
    checked_source_blocks: checkedSourceBlocks,
    issues,
  };
}

function writerBacklogDispatchHandoffPromptMarkdown(entry: WriterBacklogDispatchHandoffBatchReport["shards"][number]) {
  const shard = entry.shard;
  const lines = [
    `# Writer Shard Handoff: ${shard.shard_id}`,
    "",
    `Owner: ${shard.claim?.owner ?? "(unclaimed)"}`,
    `Claim file: ${shard.claim?.path ?? "(none)"}`,
    `Packets: ${shard.packet_count}`,
    `Pages: ${shard.page_paths.length}`,
    "",
    "## Required Commands",
    "",
  ];
  if (entry.claim_preflight_command) lines.push(`Claim preflight: \`${entry.claim_preflight_command}\``);
  lines.push(`Shard preflight: \`${shard.preflight_command}\``);
  lines.push(`Post-edit verification: \`${shard.post_edit_command}\``);
  lines.push("", "## Allowed Page Paths", "");
  for (const pagePath of shard.page_paths) lines.push(`- ${pagePath}`);
  lines.push("", "## Packet Files", "");
  for (const packetFile of shard.packet_files) lines.push(`- ${packetFile}`);
  lines.push("", "## Prompt", "", "```text", shard.suggested_subagent_prompt, "```", "");
  return `${lines.join("\n")}\n`;
}

function writerBacklogDispatchHandoffPromptsMarkdown(report: WriterBacklogDispatchHandoffPromptsReport) {
  const lines = [
    "# Writer Packet Dispatch Handoff Prompts",
    "",
    `Generated: ${report.generated_at}`,
    `Handoff batch: ${report.handoff_batch_path}`,
    `Verification: ${report.verification.ok ? "ok" : "failed"}`,
    `Prompt files: ${report.prompt_count}`,
    `Execution policy: ${report.execution_policy}`,
    "",
  ];
  for (const prompt of report.prompts) lines.push(`- ${prompt.shard_id}: ${prompt.path}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function writeWriterBacklogDispatchHandoffPrompts(path: string): WriterBacklogDispatchHandoffPromptsReport {
  const { absolutePath, relativePath } = repoRelativePath(path);
  const batch = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogDispatchHandoffBatchReport;
  const verification = verifyWriterBacklogDispatchHandoffBatch(path);
  if (!verification.ok) {
    throw new Error(`handoff batch verification failed; refusing to write prompt files: ${verification.issues.slice(0, 5).map((issue) => issue.code).join(", ")}`);
  }

  const paths = writerBacklogDispatchHandoffPromptsPaths();
  mkdirSync(paths.dirPath, { recursive: true });
  const prompts: WriterBacklogDispatchHandoffPromptFile[] = [];
  for (const entry of batch.shards) {
    const shard = entry.shard;
    const promptPath = join(paths.dirPath, `${shard.shard_id}.md`);
    writeFileSync(promptPath, writerBacklogDispatchHandoffPromptMarkdown(entry), "utf8");
    prompts.push({
      shard_id: shard.shard_id,
      owner: shard.claim?.owner,
      packet_count: shard.packet_count,
      page_count: shard.page_paths.length,
      path: relative(repoRoot, promptPath),
    });
  }

  const report: WriterBacklogDispatchHandoffPromptsReport = {
    generated_at: new Date().toISOString(),
    handoff_batch_path: relativePath,
    verification,
    prompt_count: prompts.length,
    execution_policy: "Prompt files only. Do not launch writer agents or edit wiki prose until the owner pause is lifted.",
    prompts,
    path: relative(repoRoot, paths.jsonPath),
    markdown_path: relative(repoRoot, paths.markdownPath),
  };
  writeFileSync(paths.jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(paths.markdownPath, writerBacklogDispatchHandoffPromptsMarkdown(report), "utf8");
  return report;
}

export function verifyWriterBacklogDispatchHandoffPrompts(path: string): WriterBacklogDispatchHandoffPromptsVerification {
  const { absolutePath, relativePath } = repoRelativePath(path);
  const issues: WriterBacklogDispatchHandoffPromptsVerificationIssue[] = [];
  let report: WriterBacklogDispatchHandoffPromptsReport;
  try {
    report = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogDispatchHandoffPromptsReport;
  } catch (error) {
    return {
      ok: false,
      path: relativePath,
      prompt_count: 0,
      existing_prompt_count: 0,
      unique_shard_count: 0,
      issues: [{ code: "invalid_handoff_prompts_json", message: error instanceof Error ? error.message : String(error) }],
    };
  }

  const handoffBatchPath = typeof report.handoff_batch_path === "string" ? report.handoff_batch_path : undefined;
  if (!handoffBatchPath) issues.push({ code: "missing_handoff_batch_path", message: "handoff prompts report does not specify handoff_batch_path" });
  const batchVerification = handoffBatchPath ? verifyWriterBacklogDispatchHandoffBatch(handoffBatchPath) : undefined;
  if (batchVerification && !batchVerification.ok) {
    for (const issue of batchVerification.issues) {
      issues.push({ shard_id: issue.shard_id, path: issue.path, code: `batch_${issue.code}`, message: issue.message });
    }
  }

  let batch: WriterBacklogDispatchHandoffBatchReport | undefined;
  if (handoffBatchPath) {
    try {
      const { absolutePath: batchAbsolutePath } = repoRelativePath(handoffBatchPath);
      batch = JSON.parse(readFileSync(batchAbsolutePath, "utf8")) as WriterBacklogDispatchHandoffBatchReport;
    } catch (error) {
      issues.push({ path: handoffBatchPath, code: "invalid_handoff_batch_json", message: error instanceof Error ? error.message : String(error) });
    }
  }
  const batchEntriesByShard = new Map((batch?.shards ?? []).map((entry) => [entry.shard.shard_id, entry]));
  const prompts = Array.isArray(report.prompts) ? report.prompts : [];
  if (!Array.isArray(report.prompts)) issues.push({ code: "missing_prompt_files", message: "handoff prompts report does not contain a prompts array" });
  if (typeof report.prompt_count === "number" && report.prompt_count !== prompts.length) {
    issues.push({ code: "prompt_count_mismatch", message: `prompt_count=${report.prompt_count} but prompts=${prompts.length}` });
  }
  const seenShardIds = new Set<string>();
  let existingPromptCount = 0;

  for (const prompt of prompts) {
    const shardId = typeof prompt.shard_id === "string" ? prompt.shard_id : undefined;
    const promptPath = typeof prompt.path === "string" ? prompt.path : undefined;
    if (!shardId) {
      issues.push({ path: promptPath, code: "missing_prompt_shard_id", message: "prompt entry is missing shard_id" });
      continue;
    }
    if (seenShardIds.has(shardId)) issues.push({ shard_id: shardId, path: promptPath, code: "duplicate_prompt_shard", message: "prompt report contains duplicate shard_id" });
    seenShardIds.add(shardId);
    const batchEntry = batchEntriesByShard.get(shardId);
    if (!batchEntry) {
      issues.push({ shard_id: shardId, path: promptPath, code: "prompt_shard_missing_from_batch", message: "prompt shard is not present in the handoff batch" });
    }
    if (!promptPath) {
      issues.push({ shard_id: shardId, code: "missing_prompt_path", message: "prompt entry is missing path" });
      continue;
    }
    const absolutePromptPath = join(repoRoot, promptPath);
    if (!existsSync(absolutePromptPath)) {
      issues.push({ shard_id: shardId, path: promptPath, code: "missing_prompt_file", message: "prompt file does not exist" });
      continue;
    }
    existingPromptCount += 1;
    const contents = readFileSync(absolutePromptPath, "utf8");
    const requiredSnippets = [
      `Writer Shard Handoff: ${shardId}`,
      "Claim preflight:",
      "Shard preflight:",
      "Post-edit verification:",
      "## Allowed Page Paths",
      "## Packet Files",
      "## Prompt",
    ];
    for (const snippet of requiredSnippets) {
      if (!contents.includes(snippet)) issues.push({ shard_id: shardId, path: promptPath, code: "prompt_missing_required_text", message: `prompt file is missing required text: ${snippet}` });
    }
    if (batchEntry) {
      for (const pagePath of batchEntry.shard.page_paths) {
        if (!contents.includes(pagePath)) {
          issues.push({ shard_id: shardId, path: promptPath, code: "prompt_missing_page_path", message: `prompt file is missing page path: ${pagePath}` });
          break;
        }
      }
      for (const packetFile of batchEntry.shard.packet_files) {
        if (!contents.includes(packetFile)) {
          issues.push({ shard_id: shardId, path: promptPath, code: "prompt_missing_packet_file", message: `prompt file is missing packet file: ${packetFile}` });
          break;
        }
      }
      if (!contents.includes(batchEntry.shard.post_edit_command)) {
        issues.push({ shard_id: shardId, path: promptPath, code: "prompt_missing_post_edit_command", message: "prompt file is missing the shard post-edit command" });
      }
    }
  }

  return {
    ok: issues.length === 0,
    path: relativePath,
    handoff_batch_path: handoffBatchPath,
    prompt_count: prompts.length,
    existing_prompt_count: existingPromptCount,
    unique_shard_count: seenShardIds.size,
    issues,
  };
}

export function verifyWriterBacklogDispatchHandoffPromptCoverage(dispatchPlanPath: string, promptReportPaths: string[]): WriterBacklogDispatchHandoffPromptCoverageVerification {
  const { absolutePath: planAbsolutePath, relativePath: planRelativePath } = repoRelativePath(dispatchPlanPath);
  const issues: WriterBacklogDispatchHandoffPromptCoverageIssue[] = [];
  let plan: WriterBacklogDispatchPlan | undefined;
  try {
    plan = JSON.parse(readFileSync(planAbsolutePath, "utf8")) as WriterBacklogDispatchPlan;
  } catch (error) {
    issues.push({ path: planRelativePath, code: "invalid_dispatch_plan_json", message: error instanceof Error ? error.message : String(error) });
  }

  const expectedShardIds = (Array.isArray(plan?.shards) ? plan.shards : []).map((shard) => shard.shard_id).filter((shardId): shardId is string => typeof shardId === "string");
  const expectedShardSet = new Set(expectedShardIds);
  if (plan && !Array.isArray(plan.shards)) issues.push({ path: planRelativePath, code: "missing_dispatch_plan_shards", message: "dispatch plan does not contain a shards array" });
  if (promptReportPaths.length === 0) issues.push({ path: "(prompts)", code: "missing_prompt_reports", message: "at least one handoff prompts JSON path is required" });

  const reports: WriterBacklogDispatchHandoffPromptCoverageReport[] = [];
  const seenByShard = new Map<string, string[]>();
  let promptCount = 0;
  let existingPromptCount = 0;

  for (const promptReportPath of promptReportPaths) {
    let report: WriterBacklogDispatchHandoffPromptsReport | undefined;
    let reportPath = promptReportPath;
    try {
      const { absolutePath, relativePath } = repoRelativePath(promptReportPath);
      reportPath = relativePath;
      report = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogDispatchHandoffPromptsReport;
    } catch (error) {
      issues.push({ path: promptReportPath, code: "invalid_prompt_report_json", message: error instanceof Error ? error.message : String(error) });
      reports.push({ path: promptReportPath, ok: false, prompt_count: 0, existing_prompt_count: 0, unique_shard_count: 0 });
      continue;
    }

    const prompts = Array.isArray(report.prompts) ? report.prompts : [];
    const reportShardIds = new Set<string>();
    let reportExistingPromptCount = 0;
    if (!Array.isArray(report.prompts)) issues.push({ path: reportPath, code: "missing_prompt_files", message: "handoff prompts report does not contain a prompts array" });
    if (typeof report.prompt_count === "number" && report.prompt_count !== prompts.length) {
      issues.push({ path: reportPath, code: "prompt_count_mismatch", message: `prompt_count=${report.prompt_count} but prompts=${prompts.length}` });
    }
    if (!report.verification?.ok) {
      issues.push({ path: reportPath, code: "embedded_handoff_batch_verification_not_ok", message: "prompt report embedded handoff batch verification is not ok" });
    }

    for (const prompt of prompts) {
      const shardId = typeof prompt.shard_id === "string" ? prompt.shard_id : undefined;
      const promptPath = typeof prompt.path === "string" ? prompt.path : undefined;
      if (!shardId) {
        issues.push({ path: promptPath ?? reportPath, code: "missing_prompt_shard_id", message: "prompt entry is missing shard_id" });
        continue;
      }
      if (reportShardIds.has(shardId)) issues.push({ shard_id: shardId, path: reportPath, code: "duplicate_prompt_shard_in_report", message: "prompt report contains duplicate shard_id" });
      reportShardIds.add(shardId);
      if (!promptPath) {
        issues.push({ shard_id: shardId, path: reportPath, code: "missing_prompt_path", message: "prompt entry is missing path" });
      } else if (!existsSync(join(repoRoot, promptPath))) {
        issues.push({ shard_id: shardId, path: promptPath, code: "missing_prompt_file", message: "prompt file does not exist" });
      } else {
        reportExistingPromptCount += 1;
      }

      const paths = seenByShard.get(shardId) ?? [];
      paths.push(reportPath);
      seenByShard.set(shardId, paths);
      if (expectedShardSet.size > 0 && !expectedShardSet.has(shardId)) {
        issues.push({ shard_id: shardId, path: reportPath, code: "unexpected_prompt_shard", message: "prompt shard is not present in the dispatch plan" });
      }
    }
    promptCount += prompts.length;
    existingPromptCount += reportExistingPromptCount;
    reports.push({
      path: reportPath,
      ok: reportExistingPromptCount === prompts.length && reportShardIds.size === prompts.length && report.verification?.ok === true,
      prompt_count: prompts.length,
      existing_prompt_count: reportExistingPromptCount,
      unique_shard_count: reportShardIds.size,
    });
  }

  let duplicateShardCount = 0;
  let unexpectedShardCount = 0;
  for (const [shardId, paths] of seenByShard.entries()) {
    if (paths.length > 1) {
      duplicateShardCount += 1;
      issues.push({ shard_id: shardId, path: paths.join(", "), code: "duplicate_prompt_shard_across_reports", message: "shard appears in more than one prompt report" });
    }
    if (expectedShardSet.size > 0 && !expectedShardSet.has(shardId)) unexpectedShardCount += 1;
  }

  let missingShardCount = 0;
  for (const shardId of expectedShardIds) {
    if (!seenByShard.has(shardId)) {
      missingShardCount += 1;
      issues.push({ shard_id: shardId, path: planRelativePath, code: "missing_prompt_shard", message: "dispatch shard is not covered by any prompt report" });
    }
  }

  return {
    ok: issues.length === 0,
    dispatch_plan_path: planRelativePath,
    prompt_report_count: promptReportPaths.length,
    prompt_count: promptCount,
    existing_prompt_count: existingPromptCount,
    expected_shard_count: expectedShardIds.length,
    covered_shard_count: seenByShard.size,
    duplicate_shard_count: duplicateShardCount,
    missing_shard_count: missingShardCount,
    unexpected_shard_count: unexpectedShardCount,
    reports,
    issues,
  };
}

function writerBacklogDispatchHandoffPromptCoverageMarkdown(report: WriterBacklogDispatchHandoffPromptCoverageRun) {
  const lines = [
    "# Writer Packet Dispatch Handoff Prompt Coverage",
    "",
    `Generated: ${report.generated_at}`,
    `Dispatch plan: ${report.dispatch_plan_path}`,
    `Status: ${report.verification.ok ? "ok" : "failed"}`,
    `Coverage: ${report.verification.covered_shard_count}/${report.verification.expected_shard_count} shard(s)`,
    `Prompt files: ${report.verification.existing_prompt_count}/${report.verification.prompt_count}`,
    `Execution policy: ${report.execution_policy}`,
    "",
    "## Prompt Reports",
    "",
  ];
  for (const promptReport of report.verification.reports) {
    lines.push(`- ${promptReport.ok ? "ok" : "failed"} ${promptReport.path}: ${promptReport.existing_prompt_count}/${promptReport.prompt_count} prompt file(s), ${promptReport.unique_shard_count} unique shard(s)`);
  }
  lines.push("", "## Next When Unpaused", "", report.next_when_unpaused, "");
  if (report.verification.issues.length > 0) {
    lines.push("## Issues", "");
    for (const issue of report.verification.issues.slice(0, 100)) {
      lines.push(`- ${issue.code}${issue.shard_id ? ` ${issue.shard_id}` : ""}${issue.path ? ` (${issue.path})` : ""}: ${issue.message}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}`;
}

export function writeWriterBacklogDispatchHandoffPromptCoverageReport(dispatchPlanPath: string, promptReportPaths: string[]): WriterBacklogDispatchHandoffPromptCoverageRun {
  const verification = verifyWriterBacklogDispatchHandoffPromptCoverage(dispatchPlanPath, promptReportPaths);
  const { relativePath } = repoRelativePath(dispatchPlanPath);
  const paths = writerBacklogDispatchHandoffPromptCoveragePaths();
  const report: WriterBacklogDispatchHandoffPromptCoverageRun = {
    generated_at: new Date().toISOString(),
    dispatch_plan_path: relativePath,
    prompt_report_paths: promptReportPaths.map((path) => repoRelativePath(path).relativePath),
    verification,
    execution_policy: "Coverage report only. Do not launch writer agents or edit wiki prose until the owner pause is lifted.",
    next_when_unpaused:
      "Use the listed prompt files as bounded Codex subagent inputs. Each shard prompt requires running its claim/shard preflight before edits and its post-edit verifier after edits.",
    path: relative(repoRoot, paths.jsonPath),
    markdown_path: relative(repoRoot, paths.markdownPath),
  };
  mkdirSync(join(repoRoot, "data", "post-ingest"), { recursive: true });
  writeFileSync(paths.jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(paths.markdownPath, writerBacklogDispatchHandoffPromptCoverageMarkdown(report), "utf8");
  return report;
}

function packetSnippetRefs(record: WriterBacklogPacketRecord) {
  return record.evidence_snippets.filter((snippet) => snippet.source_id && snippet.block_id);
}

function packetRecordEvidenceRefs(record: WriterBacklogPacketRecord) {
  const value = (record as { evidence_refs?: unknown }).evidence_refs;
  if (value === undefined) {
    return { refs: packetSnippetRefs(record), explicit: false, issues: [] as string[] };
  }
  if (!Array.isArray(value)) {
    return { refs: [] as NonNullable<WriterBacklogPacketRecord["evidence_refs"]>, explicit: true, issues: ["evidence_refs must be an array when present"] };
  }

  const refs: NonNullable<WriterBacklogPacketRecord["evidence_refs"]> = [];
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const [index, ref] of value.entries()) {
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) {
      issues.push(`evidence_refs[${index}] must be an object`);
      continue;
    }
    const sourceId = (ref as { source_id?: unknown }).source_id;
    const blockId = (ref as { block_id?: unknown }).block_id;
    if (typeof sourceId !== "string" || sourceId.trim().length === 0 || typeof blockId !== "string" || blockId.trim().length === 0) {
      issues.push(`evidence_refs[${index}] must include source_id and block_id strings`);
      continue;
    }
    const key = `${sourceId}#${blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ source_id: sourceId, block_id: blockId });
  }
  return { refs, explicit: true, issues };
}

export function verifyWriterBacklogPackets(path: string, options: WriterBacklogPacketVerificationOptions = {}): WriterBacklogPacketVerification {
  const checkBacklogFreshness = options.checkBacklogFreshness ?? true;
  const { absolutePath, relativePath } = repoRelativePath(path);
  const issues: WriterBacklogPacketVerificationIssue[] = [];
  let checkedSourceBlocks = 0;
  let run: WriterBacklogPacketRun;

  try {
    run = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogPacketRun;
  } catch (error) {
    return {
      ok: false,
      path: relativePath,
      packet_count: 0,
      checked_source_blocks: 0,
      issues: [{ packet_index: -1, page_path: relativePath, code: "invalid_packet_json", message: error instanceof Error ? error.message : String(error) }],
    };
  }

  const records = readCanonicalRecords();
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const currentQueueItems = collectWriterBacklogItems(records, {
    recordKinds: Array.isArray(run.scope?.record_kinds) ? run.scope.record_kinds : undefined,
    pagePaths: Array.isArray(run.scope?.page_paths) ? run.scope.page_paths : undefined,
  });
  const packets = Array.isArray(run.packets) ? run.packets : [];
  if (!Array.isArray(run.packets)) {
    issues.push({ packet_index: -1, page_path: relativePath, code: "missing_packets", message: "packet file does not contain a packets array" });
  }

  for (const [index, packet] of packets.entries()) {
    const pagePath = packet.page_path;
    if (!pagePath || typeof pagePath !== "string") {
      issues.push({ packet_index: index, page_path: "(missing)", code: "missing_page_path", message: "packet page_path is missing" });
      continue;
    }
    if (pagePath.startsWith("wiki/sources/") || !pagePath.startsWith("wiki/") || !pagePath.endsWith(".md")) {
      issues.push({ packet_index: index, page_path: pagePath, code: "invalid_page_path", message: "packet page_path must be a non-source wiki markdown page" });
      continue;
    }
    if (!existsSync(join(repoRoot, pagePath))) {
      issues.push({ packet_index: index, page_path: pagePath, code: "missing_page", message: "packet page_path does not exist" });
      continue;
    }
    if (checkBacklogFreshness) {
      const regionCheck = writerRegionEmptyCheck(pagePath);
      if (!regionCheck.ok) {
        issues.push({ packet_index: index, page_path: pagePath, code: regionCheck.code, message: regionCheck.message });
      }
    }
    if (checkBacklogFreshness && (packet.queue_position !== undefined || packet.queue_item_hash !== undefined)) {
      const queuePosition = packet.queue_position;
      if (!Number.isInteger(queuePosition) || queuePosition === undefined || queuePosition < 0) {
        issues.push({ packet_index: index, page_path: pagePath, code: "invalid_queue_position", message: "packet queue_position must be a non-negative integer" });
      } else if (typeof packet.queue_item_hash !== "string" || packet.queue_item_hash.length === 0) {
        issues.push({ packet_index: index, page_path: pagePath, code: "missing_queue_item_hash", message: "packet queue_item_hash is missing" });
      } else {
        const currentQueueItem = currentQueueItems[queuePosition];
        const currentHash = currentQueueItem ? writerBacklogQueueItemHash(currentQueueItem) : undefined;
        if (!currentQueueItem || currentHash !== packet.queue_item_hash) {
          issues.push({
            packet_index: index,
            page_path: pagePath,
            code: "queue_item_drift",
            message: currentQueueItem
              ? `packet queue position ${queuePosition} now points to ${currentQueueItem.page_path} (${currentQueueItem.record_id})`
              : `packet queue position ${queuePosition} is outside the current writer backlog queue`,
          });
        }
      }
    }

    const target = recordsById.get(packet.record_id);
    if (!target) {
      issues.push({ packet_index: index, page_path: pagePath, code: "missing_target_record", message: `target record not found: ${packet.record_id}` });
      continue;
    }
    const expectedPagePath = pageRelativePathForCanonicalRecord(target);
    if (expectedPagePath !== pagePath) {
      issues.push({ packet_index: index, page_path: pagePath, code: "target_page_mismatch", message: `target record now maps to ${expectedPagePath ?? "(no page)"}` });
    }
    if (packet.target_record?.record_id !== packet.record_id) {
      issues.push({ packet_index: index, page_path: pagePath, code: "target_record_mismatch", message: "target_record.record_id does not match packet.record_id" });
    }

    for (const record of [packet.target_record, ...(Array.isArray(packet.supporting_records) ? packet.supporting_records : [])]) {
      if (!record?.record_id || !recordsById.has(record.record_id)) {
        issues.push({ packet_index: index, page_path: pagePath, code: "missing_packet_record", message: `packet record not found: ${record?.record_id ?? "(missing)"}` });
        continue;
      }
      const currentRecord = recordsById.get(record.record_id);
      const expectedRefs = currentRecord ? new Set(packetEvidenceRefs(currentRecord).map((ref) => `${ref.source_id}#${ref.block_id}`)) : undefined;
      const parsedRefs = packetRecordEvidenceRefs(record);
      for (const message of parsedRefs.issues) {
        issues.push({
          packet_index: index,
          page_path: pagePath,
          code: "malformed_packet_evidence_refs",
          message: `${record.record_id}: ${message}`,
        });
      }

      const packetRefKeys = new Set(parsedRefs.refs.map((ref) => `${ref.source_id}#${ref.block_id}`));
      if (expectedRefs && parsedRefs.explicit) {
        for (const expectedRef of expectedRefs) {
          if (!packetRefKeys.has(expectedRef)) {
            issues.push({
              packet_index: index,
              page_path: pagePath,
              code: "missing_packet_evidence_ref",
              message: `${record.record_id} packet evidence_refs is missing current canonical evidence ${expectedRef}`,
            });
          }
        }
      }

      for (const ref of parsedRefs.refs) {
        const key = `${ref.source_id}#${ref.block_id}`;
        if (expectedRefs && !expectedRefs.has(key)) {
          issues.push({
            packet_index: index,
            page_path: pagePath,
            code: "stale_packet_evidence_ref",
            message: `${key} is not present in the current canonical record evidence for ${record.record_id}`,
          });
          continue;
        }
        try {
          sourceBlockById(ref.source_id, ref.block_id);
          checkedSourceBlocks += 1;
        } catch (error) {
          issues.push({
            packet_index: index,
            page_path: pagePath,
            code: "missing_source_block",
            message: `${key} could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    }
  }

  return {
    ok: issues.length === 0,
    path: relativePath,
    packet_count: packets.length,
    checked_source_blocks: checkedSourceBlocks,
    issues,
  };
}

function writerPacketEditPages(paths: string[]) {
  const issues: WriterEditIssue[] = [];
  const pagesByPath = new Map<string, string[]>();
  const normalizedPaths = paths.filter((path) => path.trim().length > 0);

  for (const path of normalizedPaths) {
    const { absolutePath, relativePath } = repoRelativePath(path);
    let run: WriterBacklogPacketRun;
    try {
      run = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogPacketRun;
    } catch (error) {
      issues.push({ path: relativePath, code: "invalid_packet_json", message: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (!Array.isArray(run.packets)) {
      issues.push({ path: relativePath, code: "missing_packets", message: "packet file does not contain a packets array" });
      continue;
    }
    for (const [index, packet] of run.packets.entries()) {
      const pagePath = packet?.page_path;
      if (!pagePath || typeof pagePath !== "string") {
        issues.push({ path: relativePath, code: "missing_packet_page_path", message: `packet ${index} is missing page_path` });
        continue;
      }
      if (pagePath.startsWith("wiki/sources/") || !pagePath.startsWith("wiki/") || !pagePath.endsWith(".md")) {
        issues.push({ path: pagePath, code: "invalid_packet_page_path", message: `packet ${index} in ${relativePath} must target a non-source wiki markdown page` });
        continue;
      }
      const packetRefs = pagesByPath.get(pagePath) ?? [];
      packetRefs.push(`${relativePath}#${index}`);
      pagesByPath.set(pagePath, packetRefs);
    }
  }

  for (const [pagePath, packetRefs] of pagesByPath.entries()) {
    if (packetRefs.length > 1) {
      issues.push({ path: pagePath, code: "duplicate_packet_page", message: `page appears in multiple packet slots: ${packetRefs.join(", ")}` });
    }
  }

  return {
    paths: normalizedPaths,
    pages: [...pagesByPath.keys()].sort(),
    issues,
  };
}

export function verifyWriterBacklogPacketEdits(paths: string[]): WriterBacklogPacketEditVerification {
  const packetPages = writerPacketEditPages(paths);
  const packetVerification = verifyWriterBacklogPacketSet(paths, { checkBacklogFreshness: false });
  if (packetPages.pages.length === 0 && packetPages.issues.length === 0) {
    packetPages.issues.push({ path: "(packets)", code: "missing_packet_paths", message: "at least one packet JSON path is required" });
  }

  const editVerification = verifyWriterEdits({ paths: packetPages.pages });
  const citationVerification = verifyWriterCitations(packetPages.pages);
  for (const issue of packetVerification.issues) {
    packetPages.issues.push({ path: issue.path ?? issue.page_path, code: issue.code, message: issue.message });
  }
  return {
    ok: packetPages.issues.length === 0 && packetVerification.ok && editVerification.ok && citationVerification.ok,
    packet_file_count: packetPages.paths.length,
    page_count: packetPages.pages.length,
    pages: packetPages.pages,
    packet_issues: packetPages.issues,
    packet_verification: packetVerification,
    edit_verification: editVerification,
    citation_verification: citationVerification,
  };
}

export function verifyWriterBacklogPacketSet(paths: string[], options: WriterBacklogPacketVerificationOptions = {}): WriterBacklogPacketSetVerification {
  const issues: WriterBacklogPacketSetVerificationIssue[] = [];
  const normalizedPaths = paths.filter((path) => path.trim().length > 0);
  if (normalizedPaths.length === 0) {
    issues.push({ page_path: "(none)", code: "missing_packet_paths", message: "at least one packet JSON path is required" });
  }

  const files = normalizedPaths.map((path) => verifyWriterBacklogPackets(path, options));
  for (const file of files) {
    for (const issue of file.issues) {
      issues.push({ path: file.path, page_path: issue.page_path, code: issue.code, message: issue.message });
    }
  }

  const pagesByPath = new Map<string, { path: string; packet_index: number }[]>();
  for (const path of normalizedPaths) {
    const { absolutePath, relativePath } = repoRelativePath(path);
    let run: WriterBacklogPacketRun;
    try {
      run = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogPacketRun;
    } catch {
      continue;
    }
    if (!Array.isArray(run.packets)) continue;
    for (const [index, packet] of run.packets.entries()) {
      if (!packet?.page_path || typeof packet.page_path !== "string") continue;
      const occurrences = pagesByPath.get(packet.page_path) ?? [];
      occurrences.push({ path: relativePath, packet_index: index });
      pagesByPath.set(packet.page_path, occurrences);
    }
  }

  let duplicatePageCount = 0;
  for (const [pagePath, occurrences] of pagesByPath.entries()) {
    if (occurrences.length <= 1) continue;
    duplicatePageCount += 1;
    issues.push({
      page_path: pagePath,
      code: "duplicate_packet_page",
      message: `page appears in multiple packet slots: ${occurrences.map((entry) => `${entry.path}#${entry.packet_index}`).join(", ")}`,
    });
  }

  const packetCount = files.reduce((sum, file) => sum + file.packet_count, 0);
  const checkedSourceBlocks = files.reduce((sum, file) => sum + file.checked_source_blocks, 0);
  return {
    ok: issues.length === 0,
    file_count: files.length,
    packet_count: packetCount,
    unique_page_count: pagesByPath.size,
    duplicate_page_count: duplicatePageCount,
    checked_source_blocks: checkedSourceBlocks,
    files,
    issues,
  };
}

function writerBacklogPacketsMarkdown(run: WriterBacklogPacketRun) {
  const lines = [
    "# Writer Backlog Packets",
    "",
    `Generated: ${run.generated_at}`,
    `Selected packets: ${run.scope.selected_packets}/${run.scope.empty_writer_regions}`,
    `Offset: ${run.scope.offset}`,
    "",
  ];
  for (const packet of run.packets) {
    lines.push(`## ${packet.page_path}`, "");
    lines.push(`- Record: ${packet.record_kind} ${packet.record_id}`);
    lines.push(`- Name: ${packet.display_name}`);
    if (packet.queue_position !== undefined) lines.push(`- Queue position: ${packet.queue_position}`);
    lines.push(`- Sources: ${packet.source_ids.join(", ")}`);
    lines.push(`- Supporting records: ${packet.supporting_records.length}`);
    lines.push("");
    lines.push("### Target Evidence");
    for (const snippet of packet.target_record.evidence_snippets) {
      lines.push(`- [${snippet.source_id}#${snippet.block_id}] ${snippet.text}`);
    }
    lines.push("");
    lines.push("### Supporting Records");
    for (const record of packet.supporting_records.slice(0, 12)) {
      lines.push(`- ${record.record_kind} ${record.record_id}: ${record.display_name} (${record.evidence_count} evidence)`);
      for (const snippet of record.evidence_snippets.slice(0, 2)) {
        lines.push(`  - [${snippet.source_id}#${snippet.block_id}] ${snippet.text}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
