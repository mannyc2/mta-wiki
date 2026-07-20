import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { readConfig } from "@mta-wiki/core/config";
import { selectModel, type ModelSelection } from "@mta-wiki/core/models";
import { repoRoot } from "@mta-wiki/core/paths";
import { createTranscript } from "@mta-wiki/core/transcript";
import type { HarnessRunOptions } from "@mta-wiki/core/types";
import { assistantText } from "@mta-wiki/core/usage";
import { stableJson } from "@mta-wiki/db/stable-json";
import { allKindSpecs } from "@mta-wiki/db/kind-registry";
import { readIdentityDoNotMergeOverrides, type GlobalMtaRecordKind } from "@mta-wiki/db/identity";
import type { JsonObject, JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import { buildScopedAgent, modelSummary } from "@mta-wiki/agents/shared";
import { readReleaseRecords, releaseDir } from "@mta-wiki/pipeline/quality/release-quality";
import { ingestPromptSourcePacket } from "@mta-wiki/pipeline/sources/source-packet";
import { readStagedSourceBlocks } from "@mta-wiki/pipeline/sources/source-prep";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import {
  defaultExtractEnumVocabulary,
  parseExtractAgentEnvelope,
  validateExtractEnvelope,
  writeExtractReplayFile,
  writeExtractReviewFile,
  type ExtractBoundaryResult,
  type ExtractEnumVocabulary,
} from "@mta-wiki/pipeline/extract/boundary";
import { anchorMatchExtractResult, type AnchorDoNotMergePair } from "@mta-wiki/pipeline/identity/anchor-match";

export const DEFAULT_EXTRACT_RELEASE_ID = "v1-rc25";
export const DEFAULT_EXTRACT_RUN_ID = "v2-extract-dev";

export type ExtractRunOptions = HarnessRunOptions & {
  sourceId: string;
  releaseId?: string | undefined;
  runId?: string | undefined;
  mockResponsePath?: string | undefined;
};

export type ExtractRunResult = {
  sourceId: string;
  releaseId: string;
  runId: string;
  dryRun: boolean;
  outputPath?: string | undefined;
  reviewPath?: string | undefined;
  rawResponsePath?: string | undefined;
  promptPath?: string | undefined;
  transcriptDir?: string | undefined;
  sessionPath?: string | undefined;
  accepted: number;
  reviewed: number;
  enumMisses: number;
  profileName: string;
  provider: string;
  model: string;
};

type TaxonomyFile = {
  assertion_statuses?: string[] | undefined;
  families?: Array<{ family: string; kinds?: unknown[] | undefined }> | undefined;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function relationTaxonomyPath(releaseId: string, rootDir = repoRoot) {
  return join(releaseDir(releaseId, rootDir), "taxonomy.json");
}

function valueSet(records: MtaCanonicalRecord[], field: string) {
  return [...new Set(records.map((record) => record.payload[field]).filter((value): value is string => typeof value === "string" && value.trim().length > 0))].sort();
}

export function extractEnumVocabulary(releaseId = DEFAULT_EXTRACT_RELEASE_ID, rootDir = repoRoot): ExtractEnumVocabulary {
  const taxonomy = existsSync(relationTaxonomyPath(releaseId, rootDir)) ? readJson<TaxonomyFile>(relationTaxonomyPath(releaseId, rootDir)) : {};
  const records = existsSync(releaseDir(releaseId, rootDir)) ? readReleaseRecords(releaseId, rootDir) : [];
  const defaultVocabulary = defaultExtractEnumVocabulary();
  const defaultRelationFamilies = defaultVocabulary.relation_family ?? [];
  const defaultAssertionStatuses = defaultVocabulary.assertion_status ?? [];
  return {
    ...defaultVocabulary,
    relation_family: taxonomy.families?.map((entry) => entry.family).filter((family): family is string => typeof family === "string" && family.length > 0).sort() ?? defaultRelationFamilies,
    assertion_status: taxonomy.assertion_statuses?.filter((status): status is string => typeof status === "string" && status.length > 0).sort() ?? defaultAssertionStatuses,
    event_family: valueSet(records, "event_family"),
    treatment_family: valueSet(records, "treatment_family"),
    project_family: valueSet(records, "project_family"),
    document_time_status: valueSet(records, "document_time_status"),
    lifecycle_phase: valueSet(records, "lifecycle_phase"),
  };
}

export function buildExtractContract(releaseId = DEFAULT_EXTRACT_RELEASE_ID, rootDir = repoRoot) {
  const taxonomy = existsSync(relationTaxonomyPath(releaseId, rootDir)) ? readJson<TaxonomyFile>(relationTaxonomyPath(releaseId, rootDir)) : {};
  const enumVocabulary = extractEnumVocabulary(releaseId, rootDir);
  const contract = {
    contract_version: 1,
    release_id: releaseId,
    output_shape: {
      source_id: "string",
      records: [
        {
          record_kind: "source|entity|project|corridor|route|treatment_component|event|claim|metric_claim|source_gap|relation",
          display_name: "string",
          local_observation_id: "optional stable local id",
          target_record_id: "optional existing canonical id when the source clearly refers to an existing global record",
          payload: "final-schema JSON object; use other + extra_fields.<field>_other_text for closed-enum misses",
          evidence_refs: [{ source_id: "string", block_id: "string", source_quote: "verbatim quote from that block" }],
        },
      ],
    },
    evidence_contract: [
      "Every record must cite source_id, block_id, and source_quote.",
      "source_quote must be an exact substring copied from the cited source block, preserving OCR spacing and punctuation.",
      "The cited block must support the full assertion, including endpoints, dates, values, and relation direction.",
      "Use the smallest complete block or same-page range; do not cite a block that only proves an endpoint label.",
    ],
    relation_contract: [
      "Relation payloads must use subject_id and object_id for endpoints.",
      "Endpoint values may be local_observation_id values from records in the same output or existing canonical record ids.",
      "Do not emit subject_local_observation_id or object_local_observation_id; the boundary accepts them only as a compatibility fallback.",
    ],
    enum_vocabulary: enumVocabulary,
    relation_taxonomy: taxonomy,
    record_schemas: allKindSpecs()
      .filter((spec) => !spec.deprecated)
      .map((spec) => ({
        observation_kind: spec.observation_kind,
        summary: spec.summary,
        anchors: spec.anchors,
        preferred_fields: spec.preferred_fields,
        fields: spec.fields,
        runner_companions: spec.runner_companions,
        relation_context_fields: spec.relation_context_fields,
      })),
  };
  return `${stableJson(contract as unknown as JsonValue)}\n`;
}

export function extractSystemPrompt() {
  return [
    "You are the v2 extraction stage for the MTA Wiki.",
    "Return only valid JSON. Do not call tools. Do not write prose outside JSON.",
    "Extract final-schema records directly from the supplied source packet.",
    "Preserve source literals in raw fields, but include final-schema companions when the contract vocabulary provides them.",
    "If a closed enum value does not fit, use other and put the source literal in extra_fields.<field>_other_text.",
    "Every record must include display_name and evidence_refs with source_id, block_id, and an exact source_quote copied from the cited block.",
    "Relation payloads must use subject_id and object_id endpoint fields.",
  ].join("\n");
}

export function extractPrompt(sourceId: string, sourcePacket: string, contract: string) {
  return `Extract source \`${sourceId}\` into the v2 final-schema replay format.

Contract JSON:
\`\`\`json
${contract.trim()}
\`\`\`

Source packet:
\`\`\`markdown
${sourcePacket.trimEnd()}
\`\`\`

Return exactly:
\`\`\`json
{"source_id":"${sourceId}","records":[]}
\`\`\`
with the records populated.`;
}

function replayRunDir(runId: string) {
  return join(repoRoot, "data", "replay", "runs", runId);
}

function promptPath(runId: string, sourceId: string) {
  return join(replayRunDir(runId), "prompts", `${sourceId}.md`);
}

function rawResponsePath(runId: string, sourceId: string) {
  return join(replayRunDir(runId), "raw", `${sourceId}.md`);
}

function outputPath(runId: string, sourceId: string) {
  return join(replayRunDir(runId), `${sourceId}.json`);
}

function reviewPath(runId: string, sourceId: string) {
  return join(replayRunDir(runId), "review", `${sourceId}.json`);
}

function writeText(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

function readDoNotMergePairs(): AnchorDoNotMergePair[] {
  const overrides = readIdentityDoNotMergeOverrides();
  const pairs: AnchorDoNotMergePair[] = [];
  for (const [kind, entries] of Object.entries(overrides.pairs ?? {}) as Array<[GlobalMtaRecordKind, Array<{ record_ids?: string[] | undefined; reason?: string | undefined }>]>) {
    for (const entry of entries ?? []) {
      if (entry.record_ids?.length !== 2) continue;
      pairs.push({ kind, record_ids: [entry.record_ids[0]!, entry.record_ids[1]!] as [string, string], reason: entry.reason });
    }
  }
  return pairs;
}

function processResponse(sourceId: string, releaseId: string, runId: string, responseText: string, canonicalRecords: MtaCanonicalRecord[]): ExtractBoundaryResult {
  const envelope = parseExtractAgentEnvelope(responseText);
  const blocks = readStagedSourceBlocks(sourceId);
  const boundary = validateExtractEnvelope(envelope, {
    sourceId,
    sourceBlocks: blocks,
    enumVocabulary: extractEnumVocabulary(releaseId),
  });
  const anchored = anchorMatchExtractResult(boundary, canonicalRecords, readDoNotMergePairs()).extraction;
  writeExtractReplayFile(outputPath(runId, sourceId), anchored, releaseId);
  writeExtractReviewFile(reviewPath(runId, sourceId), anchored);
  writeText(rawResponsePath(runId, sourceId), responseText);
  return anchored;
}

function summary(result: ExtractRunResult, selection: ModelSelection, sessionPath?: string | undefined) {
  return `# extract ${result.sourceId}

- Source: \`${result.sourceId}\`
${modelSummary(selection)}
- Release: \`${result.releaseId}\`
- Replay run: \`${result.runId}\`
- Dry run: \`${result.dryRun}\`
${sessionPath ? `- Session: \`${relative(repoRoot, sessionPath)}\`\n` : ""}- Accepted records: \`${result.accepted}\`
- Review entries: \`${result.reviewed}\`
- Enum misses: \`${result.enumMisses}\`
${result.outputPath ? `- Output: \`${relative(repoRoot, result.outputPath)}\`\n` : ""}${result.reviewPath ? `- Review: \`${relative(repoRoot, result.reviewPath)}\`\n` : ""}`;
}

export async function runExtractSource(options: ExtractRunOptions): Promise<ExtractRunResult> {
  const releaseId = options.releaseId ?? DEFAULT_EXTRACT_RELEASE_ID;
  const runId = options.runId ?? DEFAULT_EXTRACT_RUN_ID;
  const config = readConfig();
  const selection = selectModel(config, options);
  const sourcePacket = ingestPromptSourcePacket(options.sourceId).text;
  const contract = buildExtractContract(releaseId);
  const prompt = extractPrompt(options.sourceId, sourcePacket, contract);
  const promptFile = promptPath(runId, options.sourceId);
  writeText(promptFile, prompt);

  const base: ExtractRunResult = {
    sourceId: options.sourceId,
    releaseId,
    runId,
    dryRun: options.dryRun,
    promptPath: promptFile,
    accepted: 0,
    reviewed: 0,
    enumMisses: 0,
    profileName: selection.profileName,
    provider: selection.model.provider,
    model: selection.model.id,
  };

  if (options.mockResponsePath) {
    const processed = processResponse(options.sourceId, releaseId, runId, readFileSync(options.mockResponsePath, "utf8"), readCanonicalRecords());
    return {
      ...base,
      outputPath: outputPath(runId, options.sourceId),
      reviewPath: reviewPath(runId, options.sourceId),
      rawResponsePath: rawResponsePath(runId, options.sourceId),
      accepted: processed.accepted_record_count,
      reviewed: processed.review.length,
      enumMisses: processed.enum_miss_count,
    };
  }

  const transcript = createTranscript(config, "extract", options.sourceId, options.dryRun);
  const dryRunResult = { ...base, transcriptDir: transcript.runDir };
  if (options.dryRun) {
    transcript.writeSummary(summary(dryRunResult, selection));
    transcript.writeResponse(`Dry run prepared for extract ${options.sourceId}.\n\nPrompt:\n\n${prompt}`);
    return dryRunResult;
  }

  const { agent, sessionPath } = await buildScopedAgent(config, selection, transcript, [], extractSystemPrompt());
  const runBase = { ...base, transcriptDir: transcript.runDir, sessionPath };
  transcript.writeSummary(summary(runBase, selection, sessionPath));
  const responseText = assistantText(await agent.prompt(prompt));
  transcript.writeResponse(responseText);
  const processed = processResponse(options.sourceId, releaseId, runId, responseText, readCanonicalRecords());
  const result = {
    ...runBase,
    outputPath: outputPath(runId, options.sourceId),
    reviewPath: reviewPath(runId, options.sourceId),
    rawResponsePath: rawResponsePath(runId, options.sourceId),
    accepted: processed.accepted_record_count,
    reviewed: processed.review.length,
    enumMisses: processed.enum_miss_count,
  };
  transcript.writeSummary(summary(result, selection, sessionPath));
  return result;
}

export function extractRunActualDir(runId: string) {
  return replayRunDir(runId);
}

export function mockResponsePathForSource(sourceId: string, dir: string) {
  return join(dir, `${basename(sourceId)}.json`);
}
