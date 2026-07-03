import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, relative } from "node:path";
import { readConfig } from "../packages/core/src/config.ts";
import { selectModel, getModelApiKey } from "../packages/core/src/models.ts";
import { repoRoot } from "../packages/core/src/paths.ts";
import { stableJson } from "../packages/db/src/stable-json.ts";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types.ts";
import { evidenceBlockText, latestReleaseId, qualityDir, readReleaseRecords, stratifiedSampleRows, type SampleAuditSeedRow } from "../packages/pipeline/src/quality/release-quality.ts";

type Verdict = "supported" | "partially_supported" | "unsupported" | "wrong";

type JudgeResult = {
  record_id: string;
  verdict: Verdict;
  relied_on_span: string;
  rationale: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

type JudgeUsage = {
  requests: number;
  input: number;
  output: number;
  estimatedCost: number;
};

type SampleAuditRow = SampleAuditSeedRow & {
  release_id: string;
  human_review: boolean;
  judge: {
    method: "llm_record_vs_cited_block";
    profile: string;
    provider: string;
    model: string;
  };
  verdict: Verdict;
  relied_on_span: string;
  rationale: string;
};

const BATCH_SIZE = 1;
const MAX_BLOCK_CHARS = 1800;
const HUMAN_REVIEW_TARGET = 50;

function optionValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function parseJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function sampleKey(row: Pick<SampleAuditSeedRow, "sample_group" | "record_id">) {
  return `${row.sample_group}:${row.record_id}`;
}

function writeAuditRows(path: string, rows: SampleAuditRow[]) {
  writeFileSync(path, rows.map((row) => stableJson(row as unknown as JsonValue)).join("\n") + (rows.length > 0 ? "\n" : ""), "utf8");
}

function truncate(value: string | undefined, maxChars: number) {
  if (!value) return undefined;
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}\n[TRUNCATED ${value.length - maxChars} chars]`;
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function humanReviewIds(rows: SampleAuditSeedRow[], releaseId: string) {
  return new Set(
    [...rows]
      .sort((a, b) => stableHash(`${releaseId}:human:${a.sample_group}:${a.record_id}`).localeCompare(stableHash(`${releaseId}:human:${b.sample_group}:${b.record_id}`)))
      .slice(0, HUMAN_REVIEW_TARGET)
      .map((row) => `${row.sample_group}:${row.record_id}`),
  );
}

function recordForPrompt(record: MtaCanonicalRecord) {
  return {
    record_id: record.record_id,
    record_kind: record.record_kind,
    display_name: record.display_name,
    payload: record.payload,
    evidence: record.evidence_refs.map((ref) => {
      const evidence = evidenceBlockText(ref);
      return {
        source_id: evidence.source_id,
        block_id: evidence.block_id,
        source_quote: evidence.source_quote,
        block_text: truncate(evidence.block_text, MAX_BLOCK_CHARS),
        error: evidence.error,
      };
    }),
  };
}

function promptForBatch(records: MtaCanonicalRecord[]) {
  return `Judge each MTA wiki canonical record against ONLY its cited evidence blocks.

Verdicts:
- supported: the record's main structured claim(s) are directly supported by the cited block text.
- partially_supported: some important fields are supported, but one or more meaningful fields are missing or too specific.
- unsupported: the cited block is related but does not support the record's structured claim.
- wrong: the cited block contradicts the record or supports a different claim.

Return only JSON with this exact shape:
{"results":[{"record_id":"...","verdict":"supported|partially_supported|unsupported|wrong","relied_on_span":"short exact span from block text","rationale":"one concise sentence"}]}

Records:
${JSON.stringify(records.map(recordForPrompt))}`;
}

function parseResults(text: string): JudgeResult[] {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("```") ? trimmed.replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "") : trimmed;
  const parsed = JSON.parse(jsonText) as { results?: JudgeResult[] };
  if (!Array.isArray(parsed.results)) throw new Error("Judge response missing results array");
  return parsed.results;
}

async function judgeRecords(options: {
  baseUrl: string;
  apiKey: string;
  provider: string;
  model: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  records: MtaCanonicalRecord[];
}): Promise<{ results: Map<string, JudgeResult>; usage: JudgeUsage; content: string }> {
  const rawResponse = await fetch(`${options.baseUrl.replace(/\/$/u, "")}/chat/completions`, {
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
        { role: "user", content: promptForBatch(options.records) },
      ],
      temperature: 0,
      max_completion_tokens: 2000,
    }),
  });
  if (!rawResponse.ok) {
    throw new Error(`Judge request failed ${rawResponse.status}: ${await rawResponse.text()}`);
  }
  const response = (await rawResponse.json()) as ChatCompletionResponse;
  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty judge response");
  const input = response.usage?.prompt_tokens ?? 0;
  const output = response.usage?.completion_tokens ?? 0;
  return {
    results: new Map(parseResults(content).map((result) => [result.record_id, result])),
    usage: {
      requests: 1,
      input,
      output,
      estimatedCost: (input * options.inputCostPerMillion + output * options.outputCostPerMillion) / 1_000_000,
    },
    content,
  };
}

function countsBy<T extends string>(values: T[]) {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function groupSummary(rows: SampleAuditRow[]) {
  const groups = new Map<string, SampleAuditRow[]>();
  for (const row of rows) groups.set(row.sample_group, [...(groups.get(row.sample_group) ?? []), row]);
  return Object.fromEntries(
    [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([group, groupRows]) => {
      const supported = groupRows.filter((row) => row.verdict === "supported").length;
      const partial = groupRows.filter((row) => row.verdict === "partially_supported").length;
      return [
        group,
        {
          total: groupRows.length,
          verdict_counts: countsBy(groupRows.map((row) => row.verdict)),
          strict_precision: supported / groupRows.length,
          lenient_precision: (supported + partial) / groupRows.length,
        },
      ];
    }),
  );
}

function priorUsage(path: string) {
  const parsed = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as { usage?: { requests?: unknown; input_tokens?: unknown; output_tokens?: unknown; estimated_cost_usd?: unknown } } : {};
  return {
    requests: typeof parsed.usage?.requests === "number" ? parsed.usage.requests : 0,
    input: typeof parsed.usage?.input_tokens === "number" ? parsed.usage.input_tokens : 0,
    output: typeof parsed.usage?.output_tokens === "number" ? parsed.usage.output_tokens : 0,
    estimatedCost: typeof parsed.usage?.estimated_cost_usd === "number" ? parsed.usage.estimated_cost_usd : 0,
  };
}

function writeSummary(path: string, releaseId: string, profile: string, provider: string, model: string, rows: SampleAuditRow[], usage: { requests: number; input: number; output: number; estimatedCost: number }) {
  const supported = rows.filter((row) => row.verdict === "supported").length;
  const partial = rows.filter((row) => row.verdict === "partially_supported").length;
  const summary = {
    release_id: releaseId,
    audit_method: "llm_record_vs_cited_block",
    owner_approval: "User requested full completion with full permission on 2026-07-03.",
    profile,
    provider,
    model,
    sample_seed: releaseId,
    target_rows: 300,
    total_rows: rows.length,
    verdict_counts: countsBy(rows.map((row) => row.verdict)),
    strict_precision: rows.length === 0 ? null : supported / rows.length,
    lenient_precision: rows.length === 0 ? null : (supported + partial) / rows.length,
    by_sample_group: groupSummary(rows),
    human_review: {
      flagged_rows: rows.filter((row) => row.human_review).length,
      completed_rows: 0,
      agreement_rate: null,
      status: "flagged_pending_owner_spot_check",
    },
    usage: {
      requests: usage.requests,
      input_tokens: usage.input,
      output_tokens: usage.output,
      estimated_cost_usd: Number(usage.estimatedCost.toFixed(6)),
    },
  };
  writeFileSync(path, `${stableJson(summary as unknown as JsonValue)}\n`, "utf8");
}

async function main() {
  const releaseId = optionValue(process.argv, "--id") ?? process.argv[2] ?? latestReleaseId();
  const profile = optionValue(process.argv, "--profile") ?? "pioneer-deepseek-flash";
  const rawLimit = optionValue(process.argv, "--limit");
  const limit = rawLimit === undefined ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error(`--limit must be a positive integer: ${rawLimit}`);
  const config = readConfig();
  const selection = selectModel(config, { profileName: profile });
  const apiKey = getModelApiKey(selection);
  if (!apiKey) throw new Error(`Missing API key for ${profile}`);
  if (!selection.model.baseUrl) throw new Error(`Model ${selection.model.id} has no baseUrl`);

  const records = readReleaseRecords(releaseId);
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const sample = stratifiedSampleRows(records, releaseId);
  const reviewIds = humanReviewIds(sample, releaseId);
  const dir = qualityDir(releaseId);
  mkdirSync(dir, { recursive: true });
  const auditPath = join(dir, "sample-audit.jsonl");
  const summaryPath = join(dir, "summary.json");
  const existingByKey = new Map<string, SampleAuditRow>();
  for (const row of parseJsonl<SampleAuditRow>(auditPath)) {
    existingByKey.set(sampleKey(row), row);
  }
  const existing = sample.map((row) => existingByKey.get(sampleKey(row))).filter((row): row is SampleAuditRow => Boolean(row));
  writeAuditRows(auditPath, existing);
  const completed = new Set(existing.map(sampleKey));
  const rows = [...existing];
  const usage = priorUsage(summaryPath);
  const judgeOptions = {
    baseUrl: selection.model.baseUrl,
    apiKey,
    provider: selection.model.provider,
    model: selection.model.id,
    inputCostPerMillion: selection.model.cost?.input ?? 0,
    outputCostPerMillion: selection.model.cost?.output ?? 0,
  };

  const pending = sample.filter((row) => !completed.has(sampleKey(row))).slice(0, limit);
  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE);
    const batchRecords = batch.map((row) => byId.get(row.record_id)).filter((record): record is MtaCanonicalRecord => Boolean(record));
    const judged = await judgeRecords({ ...judgeOptions, records: batchRecords });
    usage.requests += judged.usage.requests;
    usage.input += judged.usage.input;
    usage.output += judged.usage.output;
    usage.estimatedCost += judged.usage.estimatedCost;

    for (const row of batch) {
      let result = judged.results.get(row.record_id);
      if (!result) {
        const record = byId.get(row.record_id);
        if (!record) throw new Error(`Missing sampled record ${row.record_id}`);
        const retry = await judgeRecords({ ...judgeOptions, records: [record] });
        usage.requests += retry.usage.requests;
        usage.input += retry.usage.input;
        usage.output += retry.usage.output;
        usage.estimatedCost += retry.usage.estimatedCost;
        result = retry.results.get(row.record_id);
        if (!result) throw new Error(`Judge response omitted ${row.record_id}: ${retry.content}`);
      }
      const auditRow: SampleAuditRow = {
        ...row,
        release_id: releaseId,
        human_review: reviewIds.has(sampleKey(row)),
        judge: {
          method: "llm_record_vs_cited_block",
          profile,
          provider: selection.model.provider,
          model: selection.model.id,
        },
        verdict: result.verdict,
        relied_on_span: result.relied_on_span,
        rationale: result.rationale,
      };
      appendFileSync(auditPath, `${stableJson(auditRow as unknown as JsonValue)}\n`, "utf8");
      rows.push(auditRow);
      completed.add(sampleKey(row));
    }

    writeSummary(summaryPath, releaseId, profile, selection.model.provider, selection.model.id, rows, usage);
    console.log(`Audited ${rows.length}/${sample.length} rows -> ${relative(repoRoot, auditPath)}`);
  }

  writeSummary(summaryPath, releaseId, profile, selection.model.provider, selection.model.id, rows, usage);
  console.log(`Sample audit complete: ${rows.length} rows, summary ${relative(repoRoot, summaryPath)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
