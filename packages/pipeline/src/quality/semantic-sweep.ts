import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { getModelApiKey, selectModel } from "@mta-wiki/core/models";
import { repoRoot } from "@mta-wiki/core/paths";
import { readConfig } from "@mta-wiki/core/config";
import { openCanonicalDb } from "@mta-wiki/db/canonical-db";
import { sha256, stableHash, stableJson } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/materialize";
import { evidenceBlockText } from "@mta-wiki/pipeline/quality/release-quality";
import type { JudgeVerdict } from "@mta-wiki/pipeline/quality/judge-calibration";

export const SEMANTIC_SWEEP_PROMPT_VERSION = "semqa-v1";
export const SEMANTIC_SWEEP_METHOD = "llm_record_vs_cited_block";
export const SEMANTIC_SWEEP_LEDGER = "data/semantic-sweep/verdicts.jsonl";
export const SEMANTIC_SWEEP_MAX_BLOCK_CHARS = 1800;
export const SEMANTIC_SWEEP_DEFAULT_BATCH_SIZE = 10;
export const SEMANTIC_SWEEP_DEFAULT_PROFILE = "pioneer-deepseek-flash";

export const JUDGEABLE_KINDS = ["claim", "event", "metric_claim", "relation", "treatment_component"] as const;
export type JudgeableKind = (typeof JUDGEABLE_KINDS)[number];

export type SemanticSweepEvidence = {
  source_id: string | null;
  block_id: string | null;
  source_quote?: string | undefined;
  block_text?: string | undefined;
  block_text_sha256?: string | undefined;
  error?: string | undefined;
};

export type SemanticSweepJudgeInput = {
  record_id: string;
  record_kind: JudgeableKind;
  display_name: string;
  payload: JsonObject;
  evidence: SemanticSweepEvidence[];
  content_key: string;
};

export type SemanticSweepJudgeResult = {
  record_id: string;
  verdict: JudgeVerdict;
  relied_on_span: string;
  rationale: string;
};

export type SemanticSweepUsage = {
  requests: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
};

export type SemanticSweepLedgerRow = {
  record_id: string;
  record_kind: JudgeableKind;
  content_key: string;
  verdict: JudgeVerdict;
  relied_on_span: string;
  rationale: string;
  judge: {
    method: typeof SEMANTIC_SWEEP_METHOD;
    profile: string;
    provider: string;
    model: string;
    prompt_version: typeof SEMANTIC_SWEEP_PROMPT_VERSION;
  };
  run_id: string;
  judged_at: string;
};

export type SemanticSweepRunSummary = {
  run_id: string;
  dry_run: boolean;
  ledger_path: string;
  candidate_records: number;
  skipped_existing: number;
  judged_records: number;
  pending_records: number;
  batch_size: number;
  filters: {
    kinds: string[];
    source_id: string | null;
    limit: number | null;
  };
  judge: {
    method: typeof SEMANTIC_SWEEP_METHOD;
    profile: string;
    provider: string;
    model: string;
    prompt_version: typeof SEMANTIC_SWEEP_PROMPT_VERSION;
  };
  usage: SemanticSweepUsage;
  estimate: {
    basis: "v1_sample_audit_tokens_per_record";
    input_tokens_per_record: number;
    output_tokens_per_record: number;
    estimated_cost_usd: number;
  };
  verdict_counts: Record<string, number>;
};

export type SemanticSweepOptions = {
  rootDir?: string | undefined;
  runId?: string | undefined;
  dryRun?: boolean | undefined;
  limit?: number | undefined;
  kinds?: string[] | undefined;
  sourceId?: string | undefined;
  batchSize?: number | undefined;
  profileName?: string | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  inputs?: SemanticSweepJudgeInput[] | undefined;
  judge?: SemanticSweepJudge | undefined;
  now?: () => Date;
};

export type SemanticSweepJudge = (inputs: SemanticSweepJudgeInput[]) => Promise<{ results: SemanticSweepJudgeResult[]; usage: SemanticSweepUsage; content?: string | undefined }>;

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

const V1_AUDIT_INPUT_TOKENS_PER_RECORD = 358;
const V1_AUDIT_OUTPUT_TOKENS_PER_RECORD = 364;

// Exposure-first ordering is computed in SQLite so the sweep is stable and aligned with the
// materialized graph: route/corridor-connected judgeable records first, project-connected next,
// then everything else by kind/id. The records themselves are still read through the canonical
// reader so prompt construction has the full JSON payload/evidence surface.
const EXPOSURE_ORDER_SQL = `
WITH judgeable AS (
  SELECT record_id, record_kind
  FROM records
  WHERE record_kind IN ('claim','event','metric_claim','relation','treatment_component')
),
routeish AS (
  SELECT record_id FROM records WHERE record_kind IN ('route','corridor')
),
projects AS (
  SELECT record_id FROM records WHERE record_kind = 'project'
),
route_connected AS (
  SELECT rel.record_id
  FROM relations rel
  WHERE rel.relation_family IN ('route_scope','corridor_scope')
     OR (
       rel.relation_family IN ('metric_context','timeline_context','treatment_context')
       AND (rel.subject_id IN (SELECT record_id FROM routeish) OR rel.object_id IN (SELECT record_id FROM routeish))
     )
  UNION
  SELECT rel.subject_id
  FROM relations rel
  WHERE rel.relation_family IN ('route_scope','corridor_scope')
     OR (rel.object_id IN (SELECT record_id FROM routeish) AND rel.relation_family IN ('metric_context','timeline_context','treatment_context'))
  UNION
  SELECT rel.object_id
  FROM relations rel
  WHERE rel.relation_family IN ('route_scope','corridor_scope')
     OR (rel.subject_id IN (SELECT record_id FROM routeish) AND rel.relation_family IN ('metric_context','timeline_context','treatment_context'))
),
project_connected AS (
  SELECT rel.record_id FROM relations rel WHERE rel.subject_id IN (SELECT record_id FROM projects) OR rel.object_id IN (SELECT record_id FROM projects)
  UNION
  SELECT rel.subject_id FROM relations rel WHERE rel.object_id IN (SELECT record_id FROM projects)
  UNION
  SELECT rel.object_id FROM relations rel WHERE rel.subject_id IN (SELECT record_id FROM projects)
)
SELECT j.record_id
FROM judgeable j
LEFT JOIN route_connected rc ON rc.record_id = j.record_id
LEFT JOIN project_connected pc ON pc.record_id = j.record_id
ORDER BY
  CASE WHEN rc.record_id IS NOT NULL THEN 0 WHEN pc.record_id IS NOT NULL THEN 1 ELSE 2 END,
  j.record_kind,
  j.record_id
`;

function semanticSweepRoot(rootDir = repoRoot) {
  return join(rootDir, "data", "semantic-sweep");
}

export function semanticSweepLedgerPath(rootDir = repoRoot) {
  return join(rootDir, SEMANTIC_SWEEP_LEDGER);
}

export function semanticSweepRunSummaryPath(runId: string, rootDir = repoRoot) {
  return join(semanticSweepRoot(rootDir), "runs", `${runId}.json`);
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function writeJson(path: string, value: JsonValue) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${stableJson(value)}\n`, "utf8");
}

function appendJsonl(path: string, rows: JsonValue[]) {
  if (rows.length === 0) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, rows.map((row) => stableJson(row)).join("\n") + "\n", "utf8");
}

function truncate(value: string | undefined, maxChars: number) {
  if (!value) return undefined;
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}\n[TRUNCATED ${value.length - maxChars} chars]`;
}

function isJudgeableKind(value: string): value is JudgeableKind {
  return (JUDGEABLE_KINDS as readonly string[]).includes(value);
}

function filteredKinds(kinds: string[] | undefined): JudgeableKind[] {
  if (!kinds || kinds.length === 0) return [...JUDGEABLE_KINDS];
  const parsed = kinds.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  const invalid = parsed.filter((kind) => !isJudgeableKind(kind));
  if (invalid.length > 0) throw new Error(`semantic-sweep unsupported kind(s): ${invalid.join(", ")}. Judgeable kinds: ${JUDGEABLE_KINDS.join(", ")}`);
  return [...new Set(parsed as JudgeableKind[])].sort();
}

function evidenceForContentKey(evidence: SemanticSweepEvidence[]) {
  return evidence.map((ref) => ({
    source_id: ref.source_id,
    block_id: ref.block_id,
    source_quote: ref.source_quote,
    block_text_sha256: ref.block_text_sha256 ?? (ref.block_text ? sha256(ref.block_text) : undefined),
    error: ref.error,
  }));
}

export function semanticSweepContentKey(input: Omit<SemanticSweepJudgeInput, "content_key">) {
  return stableHash({
    prompt_version: SEMANTIC_SWEEP_PROMPT_VERSION,
    record_id: input.record_id,
    payload: input.payload,
    evidence_refs: evidenceForContentKey(input.evidence),
  } as unknown as JsonValue);
}

export function judgeInputFromRecord(record: MtaCanonicalRecord, rootDir = repoRoot): SemanticSweepJudgeInput | undefined {
  if (!isJudgeableKind(record.record_kind)) return undefined;
  const evidence = record.evidence_refs.map((ref) => {
    const block = evidenceBlockText(ref, rootDir);
    const row: SemanticSweepEvidence = {
      source_id: block.source_id,
      block_id: block.block_id,
    };
    if (block.source_quote !== undefined) row.source_quote = block.source_quote;
    if (block.block_text !== undefined) {
      row.block_text = truncate(block.block_text, SEMANTIC_SWEEP_MAX_BLOCK_CHARS);
      row.block_text_sha256 = sha256(block.block_text);
    }
    if (block.error !== undefined) row.error = block.error;
    return row;
  });
  const input = {
    record_id: record.record_id,
    record_kind: record.record_kind,
    display_name: record.display_name,
    payload: record.payload,
    evidence,
  };
  return { ...input, content_key: semanticSweepContentKey(input) };
}

export function judgeInputFromFixture(row: {
  record_id: string;
  record_kind: string;
  display_name: string;
  payload: JsonObject;
  evidence: SemanticSweepEvidence[];
}): SemanticSweepJudgeInput {
  if (!isJudgeableKind(row.record_kind)) throw new Error(`Fixture ${row.record_id} has non-judgeable kind ${row.record_kind}`);
  const evidence = row.evidence.map((ref) => ({
    ...ref,
    block_text_sha256: ref.block_text_sha256 ?? (ref.block_text ? sha256(ref.block_text) : undefined),
  }));
  const input = {
    record_id: row.record_id,
    record_kind: row.record_kind,
    display_name: row.display_name,
    payload: row.payload,
    evidence,
  };
  return { ...input, content_key: semanticSweepContentKey(input) };
}

export function exposureFirstRecordIds(rootDir = repoRoot): string[] {
  const dbPath = join(rootDir, "data", "canonical.db");
  const db = openCanonicalDb(dbPath, { readonly: true });
  try {
    return (db.query(EXPOSURE_ORDER_SQL).all() as Array<{ record_id: string }>).map((row) => row.record_id);
  } finally {
    db.close();
  }
}

export function corpusJudgeRecords(options: { rootDir?: string | undefined; kinds?: string[] | undefined; sourceId?: string | undefined } = {}): MtaCanonicalRecord[] {
  const rootDir = options.rootDir ?? repoRoot;
  const kinds = new Set(filteredKinds(options.kinds));
  const order = new Map(exposureFirstRecordIds(rootDir).map((recordId, index) => [recordId, index]));
  return readCanonicalRecords()
    .filter((record) => isJudgeableKind(record.record_kind) && kinds.has(record.record_kind) && (!options.sourceId || (record.source_ids ?? []).includes(options.sourceId) || record.source_id === options.sourceId))
    .sort((a, b) => (order.get(a.record_id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.record_id) ?? Number.MAX_SAFE_INTEGER) || a.record_kind.localeCompare(b.record_kind) || a.record_id.localeCompare(b.record_id));
}

export function corpusJudgeInputs(options: { rootDir?: string | undefined; kinds?: string[] | undefined; sourceId?: string | undefined } = {}): SemanticSweepJudgeInput[] {
  const rootDir = options.rootDir ?? repoRoot;
  return corpusJudgeRecords(options)
    .map((record) => judgeInputFromRecord(record, rootDir))
    .filter((input): input is SemanticSweepJudgeInput => Boolean(input));
}

export function promptForSemanticSweepBatch(inputs: SemanticSweepJudgeInput[]) {
  const records = inputs.map((input) => ({
    record_id: input.record_id,
    record_kind: input.record_kind,
    display_name: input.display_name,
    payload: input.payload,
    evidence: input.evidence.map((ref) => ({
      source_id: ref.source_id,
      block_id: ref.block_id,
      source_quote: ref.source_quote,
      block_text: ref.block_text,
      error: ref.error,
    })),
  }));
  return `Judge each MTA wiki canonical record against ONLY its cited evidence blocks.

Verdicts:
- supported: the record's main structured claim(s) are directly supported by the cited block text.
- partially_supported: some important fields are supported, but one or more meaningful fields are missing or too specific.
- unsupported: the cited block is related but does not support the record's structured claim.
- wrong: the cited block contradicts the record or supports a different claim.

Return only JSON with this exact shape:
{"results":[{"record_id":"...","verdict":"supported|partially_supported|unsupported|wrong","relied_on_span":"short exact span from block text","rationale":"one concise sentence"}]}

Records:
${JSON.stringify(records)}`;
}

export function parseSemanticSweepResults(text: string): SemanticSweepJudgeResult[] {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("```") ? trimmed.replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "") : trimmed;
  const parsed = JSON.parse(jsonText) as { results?: SemanticSweepJudgeResult[] };
  if (!Array.isArray(parsed.results)) throw new Error("Judge response missing results array");
  for (const result of parsed.results) {
    if (typeof result.record_id !== "string" || !isJudgeVerdict(result.verdict)) throw new Error(`Invalid judge result: ${stableJson(result as unknown as JsonValue)}`);
  }
  return parsed.results;
}

function isJudgeVerdict(value: unknown): value is JudgeVerdict {
  return value === "supported" || value === "partially_supported" || value === "unsupported" || value === "wrong";
}

function addUsage(left: SemanticSweepUsage, right: SemanticSweepUsage) {
  left.requests += right.requests;
  left.input_tokens += right.input_tokens;
  left.output_tokens += right.output_tokens;
  left.estimated_cost_usd += right.estimated_cost_usd;
}

function emptyUsage(): SemanticSweepUsage {
  return { requests: 0, input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 };
}

function usageFromTokens(input: number, output: number, inputCostPerMillion: number, outputCostPerMillion: number): SemanticSweepUsage {
  return {
    requests: 1,
    input_tokens: input,
    output_tokens: output,
    estimated_cost_usd: (input * inputCostPerMillion + output * outputCostPerMillion) / 1_000_000,
  };
}

function estimateCost(records: number, inputCostPerMillion: number, outputCostPerMillion: number) {
  return ((records * V1_AUDIT_INPUT_TOKENS_PER_RECORD * inputCostPerMillion) + (records * V1_AUDIT_OUTPUT_TOKENS_PER_RECORD * outputCostPerMillion)) / 1_000_000;
}

function countVerdicts(rows: SemanticSweepLedgerRow[]) {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function defaultRunId(now = new Date()) {
  return `semantic-sweep-${now.toISOString().replace(/[:.]/gu, "-")}`;
}

function summaryFor(options: {
  rootDir: string;
  runId: string;
  dryRun: boolean;
  candidateCount: number;
  skippedExisting: number;
  judgedRows: SemanticSweepLedgerRow[];
  pendingRecords: number;
  batchSize: number;
  kinds: string[];
  sourceId: string | undefined;
  limit: number | undefined;
  profile: string;
  provider: string;
  model: string;
  usage: SemanticSweepUsage;
  estimateCost: number;
}): SemanticSweepRunSummary {
  return {
    run_id: options.runId,
    dry_run: options.dryRun,
    ledger_path: relative(options.rootDir, semanticSweepLedgerPath(options.rootDir)),
    candidate_records: options.candidateCount,
    skipped_existing: options.skippedExisting,
    judged_records: options.judgedRows.length,
    pending_records: options.pendingRecords,
    batch_size: options.batchSize,
    filters: {
      kinds: options.kinds,
      source_id: options.sourceId ?? null,
      limit: options.limit ?? null,
    },
    judge: {
      method: SEMANTIC_SWEEP_METHOD,
      profile: options.profile,
      provider: options.provider,
      model: options.model,
      prompt_version: SEMANTIC_SWEEP_PROMPT_VERSION,
    },
    usage: {
      requests: options.usage.requests,
      input_tokens: options.usage.input_tokens,
      output_tokens: options.usage.output_tokens,
      estimated_cost_usd: Number(options.usage.estimated_cost_usd.toFixed(6)),
    },
    estimate: {
      basis: "v1_sample_audit_tokens_per_record",
      input_tokens_per_record: V1_AUDIT_INPUT_TOKENS_PER_RECORD,
      output_tokens_per_record: V1_AUDIT_OUTPUT_TOKENS_PER_RECORD,
      estimated_cost_usd: Number(options.estimateCost.toFixed(6)),
    },
    verdict_counts: countVerdicts(options.judgedRows),
  };
}

export function semanticSweepSummaryText(summary: SemanticSweepRunSummary) {
  return [
    `Semantic sweep ${summary.dry_run ? "dry run" : "run"} ${summary.run_id}`,
    `Candidates: ${summary.candidate_records}`,
    `Skipped existing content keys: ${summary.skipped_existing}`,
    `Judged: ${summary.judged_records}`,
    `Pending after limit/skip: ${summary.pending_records}`,
    `Batch size: ${summary.batch_size}`,
    `Estimated cost for would-judge set: $${summary.estimate.estimated_cost_usd.toFixed(6)}`,
    `Usage: ${summary.usage.requests} request(s), ${summary.usage.input_tokens} input, ${summary.usage.output_tokens} output, $${summary.usage.estimated_cost_usd.toFixed(6)}`,
    `Verdicts: ${Object.entries(summary.verdict_counts).map(([key, count]) => `${key}=${count}`).join(", ") || "(none)"}`,
  ].join("\n");
}

export function createProviderJudge(options: {
  baseUrl: string;
  apiKey: string;
  provider: string;
  model: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}): SemanticSweepJudge {
  return async (inputs) => {
    const response = await fetch(`${options.baseUrl.replace(/\/$/u, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`,
        ...(options.provider === "pioneer" ? { "X-API-Key": options.apiKey } : {}),
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: "system", content: "You are a strict evidence auditor. Use only the supplied cited block text. Return valid JSON only." },
          { role: "user", content: promptForSemanticSweepBatch(inputs) },
        ],
        temperature: 0,
        max_completion_tokens: 2000,
      }),
    });
    if (!response.ok) throw new Error(`Semantic sweep judge request failed ${response.status}: ${await response.text()}`);
    const parsed = await response.json() as ChatCompletionResponse;
    const content = parsed.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty semantic sweep judge response");
    const input = parsed.usage?.prompt_tokens ?? 0;
    const output = parsed.usage?.completion_tokens ?? 0;
    return {
      results: parseSemanticSweepResults(content),
      usage: usageFromTokens(input, output, options.inputCostPerMillion, options.outputCostPerMillion),
      content,
    };
  };
}

function selectionForOptions(options: SemanticSweepOptions) {
  const config = readConfig();
  return selectModel(config, {
    profileName: options.profileName ?? SEMANTIC_SWEEP_DEFAULT_PROFILE,
    provider: options.provider,
    model: options.model,
    dryRun: options.dryRun ?? false,
  });
}

export async function runSemanticSweep(options: SemanticSweepOptions = {}): Promise<SemanticSweepRunSummary> {
  const rootDir = options.rootDir ?? repoRoot;
  const runId = options.runId ?? defaultRunId((options.now ?? (() => new Date()))());
  const batchSize = options.batchSize ?? SEMANTIC_SWEEP_DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error(`semantic-sweep batch size must be positive: ${batchSize}`);
  const kinds = filteredKinds(options.kinds);
  const selection = selectionForOptions(options);
  const inputCost = selection.model.cost?.input ?? 0;
  const outputCost = selection.model.cost?.output ?? 0;
  const ledgerPath = semanticSweepLedgerPath(rootDir);
  const existingKeys = new Set(readJsonl<SemanticSweepLedgerRow>(ledgerPath).map((row) => row.content_key));
  let candidateCount = 0;
  let skippedExisting = 0;
  const limited: SemanticSweepJudgeInput[] = [];

  if (options.inputs) {
    const filtered = options.inputs.filter((input) => kinds.includes(input.record_kind) && (!options.sourceId || input.evidence.some((ref) => ref.source_id === options.sourceId)));
    candidateCount = filtered.length;
    for (const input of filtered) {
      if (existingKeys.has(input.content_key)) {
        skippedExisting += 1;
        continue;
      }
      if (options.limit !== undefined && limited.length >= options.limit) continue;
      limited.push(input);
    }
  } else {
    const records = corpusJudgeRecords({ rootDir, kinds, sourceId: options.sourceId });
    candidateCount = records.length;
    for (const record of records) {
      const input = judgeInputFromRecord(record, rootDir);
      if (!input) continue;
      if (existingKeys.has(input.content_key)) {
        skippedExisting += 1;
        continue;
      }
      if (options.limit !== undefined && limited.length >= options.limit) break;
      limited.push(input);
    }
  }
  const usage = emptyUsage();
  const judgedRows: SemanticSweepLedgerRow[] = [];
  const estimate = estimateCost(limited.length, inputCost, outputCost);

  if (options.dryRun) {
    return summaryFor({
      rootDir,
      runId,
      dryRun: true,
      candidateCount,
      skippedExisting,
      judgedRows,
      pendingRecords: Math.max(0, candidateCount - skippedExisting - limited.length),
      batchSize,
      kinds,
      sourceId: options.sourceId,
      limit: options.limit,
      profile: selection.profileName,
      provider: selection.model.provider,
      model: selection.model.id,
      usage,
      estimateCost: estimate,
    });
  }

  const apiKey = getModelApiKey(selection);
  const judge = options.judge ?? (apiKey && selection.model.baseUrl
    ? createProviderJudge({
        baseUrl: selection.model.baseUrl,
        apiKey,
        provider: selection.model.provider,
        model: selection.model.id,
        inputCostPerMillion: inputCost,
        outputCostPerMillion: outputCost,
      })
    : undefined);
  if (!judge) throw new Error(`Missing API key/baseUrl for semantic-sweep profile ${selection.profileName}; use --dry-run for estimates.`);

  for (let index = 0; index < limited.length; index += batchSize) {
    const batch = limited.slice(index, index + batchSize);
    const judged = await judge(batch);
    addUsage(usage, judged.usage);
    const byId = new Map(judged.results.map((result) => [result.record_id, result]));
    const missing = batch.filter((input) => !byId.has(input.record_id));
    for (const input of missing) {
      const retry = await judge([input]);
      addUsage(usage, retry.usage);
      const result = retry.results.find((row) => row.record_id === input.record_id);
      if (!result) throw new Error(`Semantic sweep judge omitted ${input.record_id}${retry.content ? `: ${retry.content}` : ""}`);
      byId.set(input.record_id, result);
    }

    const rows = batch.map((input) => {
      const result = byId.get(input.record_id);
      if (!result) throw new Error(`Semantic sweep missing result for ${input.record_id}`);
      return {
        record_id: input.record_id,
        record_kind: input.record_kind,
        content_key: input.content_key,
        verdict: result.verdict,
        relied_on_span: result.relied_on_span,
        rationale: result.rationale,
        judge: {
          method: SEMANTIC_SWEEP_METHOD,
          profile: selection.profileName,
          provider: selection.model.provider,
          model: selection.model.id,
          prompt_version: SEMANTIC_SWEEP_PROMPT_VERSION,
        },
        run_id: runId,
        judged_at: (options.now ?? (() => new Date()))().toISOString(),
      } satisfies SemanticSweepLedgerRow;
    });
    appendJsonl(ledgerPath, rows as unknown as JsonValue[]);
    judgedRows.push(...rows);
    writeJson(
      semanticSweepRunSummaryPath(runId, rootDir),
      summaryFor({
        rootDir,
        runId,
        dryRun: false,
        candidateCount,
        skippedExisting,
        judgedRows,
        pendingRecords: Math.max(0, candidateCount - skippedExisting - judgedRows.length),
        batchSize,
        kinds,
        sourceId: options.sourceId,
        limit: options.limit,
        profile: selection.profileName,
        provider: selection.model.provider,
        model: selection.model.id,
        usage,
        estimateCost: estimate,
      }) as unknown as JsonValue,
    );
  }

  return summaryFor({
    rootDir,
    runId,
    dryRun: false,
    candidateCount,
    skippedExisting,
    judgedRows,
    pendingRecords: Math.max(0, candidateCount - skippedExisting - judgedRows.length),
    batchSize,
    kinds,
    sourceId: options.sourceId,
    limit: options.limit,
    profile: selection.profileName,
    provider: selection.model.provider,
    model: selection.model.id,
    usage,
    estimateCost: estimate,
  });
}
