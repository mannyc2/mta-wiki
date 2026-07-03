import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";
import { readConfig } from "@mta-wiki/core/config";
import { repoRoot } from "@mta-wiki/core/paths";
import { sourceBlockById } from "@mta-wiki/pipeline/sources/source-prep";
import type { JsonObject, MtaEvidenceRef, MtaObservationKind, MtaSubmissionEntry, StagedSourceBlock } from "@mta-wiki/db/types";

export type MtaIngestAuditWarning = {
  code: string;
  message: string;
  source_id?: string | undefined;
  local_observation_id?: string | undefined;
  observation_kind?: MtaObservationKind | undefined;
  block_id?: string | undefined;
};

export type MtaIngestAuditReport = {
  run_id: string;
  submission_path: string;
  transcript_path?: string | undefined;
  source_ids: string[];
  rows: number;
  state_counts: Record<string, number>;
  observation_kind_counts: Record<string, number>;
  evidence_ref_count: number;
  unique_evidence_block_count: number;
  evidence_text_source_counts: Record<string, number>;
  evidence_source_surface_counts: Record<string, number>;
  evidence_block_kind_counts: Record<string, number>;
  max_evidence_refs_per_observation: number;
  transcript: {
    found: boolean;
    normalization_skipped: boolean;
    read_source_calls: number;
    search_source_calls: number;
    read_evidence_calls: number;
    submit_observation_calls: number;
    read_source_returned_blocks: number[];
    read_evidence_block_ids: string[];
  };
  usage?: {
    request_count: number;
    total_tokens: number;
    estimated_cost: number;
    accepted_per_1k_tokens?: number | undefined;
    cost_per_accepted_submission?: number | undefined;
  } | undefined;
  warnings: MtaIngestAuditWarning[];
};

function submissionsDir() {
  return join(repoRoot, "data", "submissions");
}

function transcriptsRunsDir() {
  return join(repoRoot, readConfig().transcriptsDir, "runs");
}

function increment(counts: Record<string, number>, key: string | undefined) {
  const resolved = key && key.trim() ? key : "unknown";
  counts[resolved] = (counts[resolved] ?? 0) + 1;
}

function resolveSubmissionPath(target: string | undefined) {
  if (!target) {
    const dir = submissionsDir();
    const latest = existsSync(dir)
      ? readdirSync(dir)
          .filter((name) => name.endsWith(".jsonl"))
          .map((name) => join(dir, name))
          .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
      : undefined;
    if (!latest) throw new Error("No submission runs found in data/submissions.");
    return latest;
  }

  const candidates = [
    isAbsolute(target) ? target : join(repoRoot, target),
    join(submissionsDir(), target),
    target.endsWith(".jsonl") ? undefined : join(submissionsDir(), `${target}.jsonl`),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const found = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (found) return found;

  throw new Error(`Submission run not found: ${target}`);
}

function readSubmissionFile(path: string) {
  const content = readFileSync(path, "utf8");
  const entries: MtaSubmissionEntry[] = [];
  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as MtaSubmissionEntry);
    } catch (error) {
      throw new Error(`Invalid JSONL in ${relative(repoRoot, path)}:${index + 1}: ${String(error)}`);
    }
  }
  return entries;
}

function resolveTranscriptEventsPath(runId: string) {
  const exact = join(transcriptsRunsDir(), runId, "events.jsonl");
  if (existsSync(exact)) return exact;

  if (!existsSync(transcriptsRunsDir())) return undefined;
  const matches = readdirSync(transcriptsRunsDir())
    .filter((name) => name === runId || name.includes(runId))
    .map((name) => join(transcriptsRunsDir(), name, "events.jsonl"))
    .filter((path) => existsSync(path));

  return matches[0];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function compactText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function includesLoose(haystack: string, needle: string) {
  const compactNeedle = compactText(needle);
  if (!compactNeedle || compactNeedle.length < 4) return true;
  return compactText(haystack).includes(compactNeedle);
}

function evidenceTextForRefs(refs: MtaEvidenceRef[]) {
  const chunks: string[] = [];
  for (const ref of refs) {
    if (!ref.source_id || !ref.block_id) continue;
    try {
      chunks.push(sourceBlockById(ref.source_id, ref.block_id).raw_text);
    } catch {
      continue;
    }
  }
  return chunks.join("\n");
}

function supportedEntityFields(entry: MtaSubmissionEntry) {
  const payload = entry.tool_args.payload ?? {};
  const fields = ["entity_name", "operator", "owner", "owner_name", "manager", "manager_name", "lead_agency", "publisher", "agency_name"];
  return fields
    .map((field) => ({ field, value: stringValue(payload[field]) }))
    .filter((field): field is { field: string; value: string } => Boolean(field.value));
}

function addPayloadSupportWarnings(entry: MtaSubmissionEntry, warnings: MtaIngestAuditWarning[]) {
  if (entry.validation.state !== "accepted") return;
  if (entry.tool_args.observation_kind === "source") return;

  const evidenceText = evidenceTextForRefs((entry.tool_args.evidence_refs ?? []) as MtaEvidenceRef[]);
  if (!evidenceText) return;

  for (const { field, value } of supportedEntityFields(entry)) {
    if (includesLoose(evidenceText, value)) continue;
    warnings.push({
      code: "payload_field_not_in_evidence",
      message: `Payload field ${field}=${JSON.stringify(value)} is not textually present in the cited evidence. This may be valid normalization, but it needs human review.`,
      source_id: entry.tool_args.source_id,
      local_observation_id: entry.tool_args.local_observation_id,
      observation_kind: entry.tool_args.observation_kind,
    });
  }
}

function addRelationSupportWarnings(entry: MtaSubmissionEntry, warnings: MtaIngestAuditWarning[]) {
  if (entry.validation.state !== "accepted" || entry.tool_args.observation_kind !== "relation") return;

  const relationKind = stringValue(entry.tool_args.payload?.relation_kind);
  if (!relationKind) return;

  const evidenceText = evidenceTextForRefs((entry.tool_args.evidence_refs ?? []) as MtaEvidenceRef[]);
  if (!evidenceText) return;

  const checks: Record<string, RegExp> = {
    has_owner: /\b(owner|owned|manages?|managed|lead|led|responsible|administered?)\b/iu,
    managed_by: /\b(manages?|managed|lead|led|responsible|administered?)\b/iu,
    operated_by: /\b(operates?|operated|operator|service operated)\b/iu,
  };
  const pattern = checks[relationKind];
  if (!pattern || pattern.test(evidenceText)) return;

  warnings.push({
    code: "weak_relation_evidence",
    message: `Relation kind ${relationKind} is supported by evidence that lacks an obvious ownership/management/operator cue.`,
    source_id: entry.tool_args.source_id,
    local_observation_id: entry.tool_args.local_observation_id,
    observation_kind: entry.tool_args.observation_kind,
  });
}

function auditTranscript(eventsPath: string | undefined) {
  const transcript: MtaIngestAuditReport["transcript"] = {
    found: Boolean(eventsPath),
    normalization_skipped: false,
    read_source_calls: 0,
    search_source_calls: 0,
    read_evidence_calls: 0,
    submit_observation_calls: 0,
    read_source_returned_blocks: [],
    read_evidence_block_ids: [],
  };
  let usage: MtaIngestAuditReport["usage"];

  if (!eventsPath) return { transcript, usage };

  const content = readFileSync(eventsPath, "utf8");
  for (const line of content.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    if (
      !line.includes('"type":"tool_execution_start"') &&
      !line.includes('"type":"mta_tool_read_source"') &&
      !line.includes('"type":"mta_source_normalization_skipped"') &&
      !line.includes('"type":"usage_recorded"')
    ) {
      continue;
    }

    const event = JSON.parse(line) as {
      type?: string;
      toolName?: string;
      args?: JsonObject;
      returnedBlocks?: number;
      requestCount?: number;
      totalTokens?: number;
      cost?: number;
    };

    if (event.type === "mta_source_normalization_skipped") {
      transcript.normalization_skipped = true;
      continue;
    }

    if (event.type === "mta_tool_read_source") {
      if (typeof event.returnedBlocks === "number") transcript.read_source_returned_blocks.push(event.returnedBlocks);
      continue;
    }

    if (event.type === "usage_recorded") {
      usage = {
        request_count: event.requestCount ?? usage?.request_count ?? 0,
        total_tokens: event.totalTokens ?? usage?.total_tokens ?? 0,
        estimated_cost: event.cost ?? usage?.estimated_cost ?? 0,
      };
      continue;
    }

    if (event.type !== "tool_execution_start") continue;
    if (event.toolName === "mta_read_source") transcript.read_source_calls += 1;
    if (event.toolName === "mta_search_source") transcript.search_source_calls += 1;
    if (event.toolName === "mta_read_evidence") {
      transcript.read_evidence_calls += 1;
      const blockId = stringValue(event.args?.block_id);
      if (blockId) transcript.read_evidence_block_ids.push(blockId);
    }
    if (event.toolName === "mta_submit_observation") transcript.submit_observation_calls += 1;
  }

  return { transcript, usage };
}

function blockForRef(ref: MtaEvidenceRef): StagedSourceBlock | undefined {
  if (!ref.source_id || !ref.block_id) return undefined;
  return sourceBlockById(ref.source_id, ref.block_id);
}

export function auditIngestRun(target?: string): MtaIngestAuditReport {
  const submissionPath = resolveSubmissionPath(target);
  const entries = readSubmissionFile(submissionPath);
  const runId = entries[0]?.run_id ?? basename(submissionPath).replace(/\.jsonl$/u, "");
  const transcriptPath = resolveTranscriptEventsPath(runId);
  const warnings: MtaIngestAuditWarning[] = [];
  const sourceIds = new Set<string>();
  const uniqueEvidenceBlocks = new Set<string>();
  const stateCounts: Record<string, number> = {};
  const observationKindCounts: Record<string, number> = {};
  const evidenceTextSourceCounts: Record<string, number> = {};
  const evidenceSourceSurfaceCounts: Record<string, number> = {};
  const evidenceBlockKindCounts: Record<string, number> = {};
  let evidenceRefCount = 0;
  let maxEvidenceRefsPerObservation = 0;

  for (const entry of entries) {
    sourceIds.add(entry.tool_args.source_id);
    increment(stateCounts, entry.validation.state);
    increment(observationKindCounts, entry.tool_args.observation_kind);

    if (entry.validation.state === "rejected") {
      warnings.push({
        code: "rejected_submission",
        message: entry.validation.issues.join("; ") || "Submission was rejected.",
        source_id: entry.tool_args.source_id,
        local_observation_id: entry.tool_args.local_observation_id,
        observation_kind: entry.tool_args.observation_kind,
      });
    }

    const refs = (entry.tool_args.evidence_refs ?? []) as MtaEvidenceRef[];
    maxEvidenceRefsPerObservation = Math.max(maxEvidenceRefsPerObservation, refs.length);
    if (refs.length === 0) {
      warnings.push({
        code: "missing_evidence",
        message: "Observation has no evidence refs.",
        source_id: entry.tool_args.source_id,
        local_observation_id: entry.tool_args.local_observation_id,
        observation_kind: entry.tool_args.observation_kind,
      });
    }
    if (refs.length > 4) {
      warnings.push({
        code: "many_evidence_refs",
        message: `Observation cites ${refs.length} evidence refs. Consider whether a parent block or tighter split would be clearer.`,
        source_id: entry.tool_args.source_id,
        local_observation_id: entry.tool_args.local_observation_id,
        observation_kind: entry.tool_args.observation_kind,
      });
    }

    for (const ref of refs) {
      evidenceRefCount += 1;
      increment(evidenceTextSourceCounts, ref.text_source);
      if (!ref.text_sha256) {
        warnings.push({
          code: "missing_raw_hash",
          message: "Evidence ref is missing raw text hash.",
          source_id: ref.source_id,
          local_observation_id: entry.tool_args.local_observation_id,
          observation_kind: entry.tool_args.observation_kind,
          block_id: ref.block_id,
        });
      }
      if (ref.text_source !== "raw_text") {
        warnings.push({
          code: "non_raw_text_source",
          message: `Evidence ref uses ${ref.text_source ?? "unknown"} instead of raw_text.`,
          source_id: ref.source_id,
          local_observation_id: entry.tool_args.local_observation_id,
          observation_kind: entry.tool_args.observation_kind,
          block_id: ref.block_id,
        });
      }
      if (ref.source_id && ref.block_id) uniqueEvidenceBlocks.add(`${ref.source_id}#${ref.block_id}`);

      let block: StagedSourceBlock | undefined;
      try {
        block = blockForRef(ref);
      } catch (error) {
        warnings.push({
          code: "unknown_evidence_block",
          message: String(error instanceof Error ? error.message : error),
          source_id: ref.source_id,
          local_observation_id: entry.tool_args.local_observation_id,
          observation_kind: entry.tool_args.observation_kind,
          block_id: ref.block_id,
        });
      }
      if (!block) continue;

      increment(evidenceSourceSurfaceCounts, block.source_surface);
      increment(evidenceBlockKindCounts, block.block_kind);
      if (block.source_surface !== "chandra_ocr" && block.source_surface !== "pdf_text") {
        warnings.push({
          code: "non_primary_evidence_surface",
          message: `Evidence ref resolves to ${block.source_surface}; primary source evidence blocks should be preferred when present.`,
          source_id: ref.source_id,
          local_observation_id: entry.tool_args.local_observation_id,
          observation_kind: entry.tool_args.observation_kind,
          block_id: ref.block_id,
        });
      }
      if (ref.text_sha256 && ref.text_sha256 !== block.raw_text_sha256) {
        warnings.push({
          code: "raw_hash_mismatch",
          message: "Evidence ref hash does not match the current block raw text hash.",
          source_id: ref.source_id,
          local_observation_id: entry.tool_args.local_observation_id,
          observation_kind: entry.tool_args.observation_kind,
          block_id: ref.block_id,
        });
      }
    }

    addPayloadSupportWarnings(entry, warnings);
    addRelationSupportWarnings(entry, warnings);
  }

  const transcriptAudit = auditTranscript(transcriptPath);
  if (transcriptAudit.transcript.found && !transcriptAudit.transcript.normalization_skipped) {
    warnings.push({
      code: "normalization_not_skipped",
      message: "Transcript does not show ingest-time normalization being skipped.",
    });
  }
  const accepted = stateCounts.accepted ?? 0;
  if (transcriptAudit.usage && transcriptAudit.usage.total_tokens > 0) {
    transcriptAudit.usage.accepted_per_1k_tokens = accepted / (transcriptAudit.usage.total_tokens / 1000);
  }
  if (transcriptAudit.usage && transcriptAudit.usage.estimated_cost > 0 && accepted > 0) {
    transcriptAudit.usage.cost_per_accepted_submission = transcriptAudit.usage.estimated_cost / accepted;
  }

  return {
    run_id: runId,
    submission_path: relative(repoRoot, submissionPath),
    transcript_path: transcriptPath ? relative(repoRoot, transcriptPath) : undefined,
    source_ids: [...sourceIds].sort(),
    rows: entries.length,
    state_counts: stateCounts,
    observation_kind_counts: observationKindCounts,
    evidence_ref_count: evidenceRefCount,
    unique_evidence_block_count: uniqueEvidenceBlocks.size,
    evidence_text_source_counts: evidenceTextSourceCounts,
    evidence_source_surface_counts: evidenceSourceSurfaceCounts,
    evidence_block_kind_counts: evidenceBlockKindCounts,
    max_evidence_refs_per_observation: maxEvidenceRefsPerObservation,
    transcript: transcriptAudit.transcript,
    usage: transcriptAudit.usage,
    warnings,
  };
}

export function writeIngestAuditReport(report: MtaIngestAuditReport) {
  const dir = join(repoRoot, "data", "audits");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${report.run_id}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return path;
}
