import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { buildHarnessAgent, positiveIntegerEnv } from "@mta-wiki/core/agent";
import { readConfig } from "@mta-wiki/core/config";
import { selectModel, type ModelSelection } from "@mta-wiki/core/models";
import { repoRoot } from "@mta-wiki/core/paths";
import { createHarnessSession } from "@mta-wiki/core/session";
import { createTranscript, type TranscriptWriter } from "@mta-wiki/core/transcript";
import type { HarnessConfig, HarnessRunOptions } from "@mta-wiki/core/types";
import { assistantText } from "@mta-wiki/core/usage";
import type { JsonObject, JsonValue } from "@mta-wiki/db/types";
import type { SchemaAuditEnumCandidate, SchemaAuditField, SchemaAuditKind, SchemaAuditManifest } from "@mta-wiki/pipeline/ontology/schema-audit";

// Step 2 of the payload-tightening move: an LLM proposes typed payload schemas
// (canonical enum closures, value normalization, escape hatches) from the
// schema-audit aggregates. The corpus is incomplete, so proposals are biased
// open by default and validated at the tool layer: the model may only normalize
// values that actually appear in the corpus, and a closed enum must cover every
// observed value. Proposals are staged for review; nothing is enforced here.

const DEFAULT_CONCURRENCY = 3;

const FIELD_DECISIONS = new Set(["enum", "free_text", "structured", "relation_context", "drop", "needs_more_data"]);
const KEY_DISPOSITIONS = new Set(["promote_enum", "promote_field", "relation_context", "escape_hatch", "alias", "drop", "needs_more_data"]);

export type SchemaProposalOptions = HarnessRunOptions & {
  include?: string | undefined;
  exclude?: string | undefined;
  concurrency?: number | undefined;
  force?: boolean | undefined;
};

export type SchemaProposalResult = {
  observation_kind: string;
  proposal_path?: string | undefined;
  status: "planned" | "completed" | "skipped" | "failed";
  valid?: boolean | undefined;
  schema_issues: string[];
  warnings: string[];
  transcript_dir?: string | undefined;
  session_path?: string | undefined;
  error?: string | undefined;
};

export type SchemaProposalRunManifest = {
  run_id: string;
  generated_at: string;
  dry_run: boolean;
  profile_name: string;
  provider: string;
  model: string;
  concurrency: number;
  audit_manifest: string;
  kind_count: number;
  completed: number;
  skipped: number;
  failed: number;
  invalid: number;
  paths: {
    proposals_dir: string;
    runs_dir: string;
    manifest: string;
    latest: string;
  };
  results: SchemaProposalResult[];
};

function schemaAuditDir() {
  return join(repoRoot, "data", "identity-review", "schema-audit");
}

function proposalsDir() {
  return join(repoRoot, "data", "identity-review", "llm-suggestions", "schema-proposals");
}

function nowRunId(date = new Date()) {
  return `${date.toISOString().replace(/[:.]/gu, "-")}_schema-proposal-run`;
}

function mkdir(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, value: unknown) {
  mkdir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function relativePath(path: string) {
  return relative(repoRoot, path).split("/").join("/");
}

export function readSchemaAuditManifest(): SchemaAuditManifest {
  const latestPath = join(schemaAuditDir(), "latest.json");
  if (!existsSync(latestPath)) {
    throw new Error(`No schema audit found at ${relativePath(latestPath)}. Run \`schema-audit\` first.`);
  }
  return JSON.parse(readFileSync(latestPath, "utf8")) as SchemaAuditManifest;
}

function parseJsonResponse(text: string): JsonValue {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1));

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as JsonValue;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Response did not contain parseable JSON.");
}

// A kind's audit slice, reshaped into the minimal context the proposer needs.
type ProposalPacket = {
  observation_kind: string;
  submission_count: number;
  accepted_count: number;
  rejected_count: number;
  declared_anchor_fields: string[];
  enum_candidates: Array<{
    field: string;
    occurrences: number;
    accepted_occurrences: number;
    rejected_occurrences: number;
    canonical_occurrences: number;
    coverage: number;
    distinct_values: number;
    accepted_distinct_values: number;
    canonical_distinct_values: number;
    value_kind: string;
    accepted_value_kind: string;
    canonical_value_kind: string;
    closure_readiness: "saturated" | "open";
    corpus_values: string[];
    accepted_values: string[];
    canonical_values_observed: string[];
    value_counts: Array<{ value: string; count: number }>;
    accepted_value_counts: Array<{ value: string; count: number }>;
    canonical_value_counts: Array<{ value: string; count: number }>;
  }>;
  additional_keys: Array<{
    field: string;
    occurrences: number;
    accepted_occurrences: number;
    rejected_occurrences: number;
    canonical_occurrences: number;
    coverage: number;
    accepted_coverage: number;
    canonical_coverage: number;
    value_kind: string;
    accepted_value_kind: string;
    canonical_value_kind: string;
    classification: string;
    sample_values: string[];
    accepted_sample_values: string[];
    canonical_sample_values: string[];
  }>;
};

function buildProposalPacket(kind: SchemaAuditKind): ProposalPacket {
  const fieldByName = new Map<string, SchemaAuditField>(kind.fields.map((field) => [field.field, field]));
  const enumCandidates = kind.enum_candidates.map((candidate: SchemaAuditEnumCandidate) => ({
    field: candidate.field,
    occurrences: candidate.occurrences,
    accepted_occurrences: candidate.accepted_occurrences,
    rejected_occurrences: candidate.rejected_occurrences,
    canonical_occurrences: candidate.canonical_occurrences,
    coverage: fieldByName.get(candidate.field)?.coverage ?? 0,
    distinct_values: candidate.distinct_values,
    accepted_distinct_values: candidate.accepted_distinct_values,
    canonical_distinct_values: candidate.canonical_distinct_values,
    value_kind: fieldByName.get(candidate.field)?.value_kind ?? "unknown",
    accepted_value_kind: fieldByName.get(candidate.field)?.accepted_value_kind ?? "unknown",
    canonical_value_kind: fieldByName.get(candidate.field)?.canonical_value_kind ?? "unknown",
    closure_readiness: candidate.closure_readiness,
    corpus_values: candidate.proposed_closure,
    accepted_values: candidate.accepted_closure,
    canonical_values_observed: candidate.canonical_closure,
    value_counts: candidate.value_counts,
    accepted_value_counts: candidate.accepted_value_counts,
    canonical_value_counts: candidate.canonical_value_counts,
  }));

  const enumFieldNames = new Set(enumCandidates.map((candidate) => candidate.field));
  const additionalKeys = kind.additional_keys
    .filter((field) => !enumFieldNames.has(field))
    .map((field) => {
      const stats = fieldByName.get(field);
      return {
        field,
        occurrences: stats?.occurrences ?? 0,
        accepted_occurrences: stats?.accepted_occurrences ?? 0,
        rejected_occurrences: stats?.rejected_occurrences ?? 0,
        canonical_occurrences: stats?.canonical_occurrences ?? 0,
        coverage: stats?.coverage ?? 0,
        accepted_coverage: stats?.accepted_coverage ?? 0,
        canonical_coverage: stats?.canonical_coverage ?? 0,
        value_kind: stats?.value_kind ?? "unknown",
        accepted_value_kind: stats?.accepted_value_kind ?? "unknown",
        canonical_value_kind: stats?.canonical_value_kind ?? "unknown",
        classification: stats?.classification ?? "unknown",
        sample_values: stats?.sample_values ?? [],
        accepted_sample_values: stats?.accepted_sample_values ?? [],
        canonical_sample_values: stats?.canonical_sample_values ?? [],
      };
    });

  return {
    observation_kind: kind.observation_kind,
    submission_count: kind.submission_count,
    accepted_count: kind.accepted_count,
    rejected_count: kind.rejected_count,
    declared_anchor_fields: kind.declared_anchor_fields,
    enum_candidates: enumCandidates,
    additional_keys: additionalKeys,
  };
}

function systemPrompt() {
  return [
    "You propose typed payload schemas for one MTA observation kind, derived from a field/value audit.",
    "The audit corpus is INCOMPLETE and still growing. Schemas must tolerate values you have not yet seen.",
    "Do your semantic job; do NOT judge how confident you are and do NOT decide whether an enum is closed. Closure is decided separately from corpus-saturation statistics, not by you. Every enum is treated as open with an escape hatch.",
    "Hard rules:",
    "- Only normalize values that appear in the provided corpus_values. Never invent a value that is not present.",
    "- Use accepted_occurrences and canonical_occurrences to decide whether a field is mature enough to promote. all/occurrences includes rejected submissions and is discovery-only.",
    "- Map every observed corpus value to a canonical value via `value_mapping`. The canonical set is just the distinct `to` values; a separate `canonical_values` list is optional and need not be kept in sync.",
    "- Merge case and synonym variants to one canonical snake_case value (e.g. 'Local', 'local_bus' -> 'local').",
    "- Always provide an `escape_hatch` ({other_value, other_text_field}) for an enum.",
    "- A field may be relation_context even when it has repeated enum-like values. Program/initiative names, source systems, publishers, agencies, participants, routes-served lists, and affiliations are relation context, not identity fields.",
    "- Mixed-type fields are not safe enums unless you propose an explicit split; prefer free_text, relation_context, or needs_more_data.",
    "- Use decision `needs_more_data` when the sample is too thin to normalize responsibly, rather than guessing.",
    "Return a single JSON object only. No Markdown fences, commentary, or prose outside the JSON object.",
    "JSON shape:",
    JSON.stringify(
      {
        observation_kind: "string (must equal the requested kind)",
        field_proposals: [
          {
            field: "string (one of the provided enum_candidates fields)",
            decision: "enum | free_text | structured | relation_context | drop | needs_more_data",
            canonical_values: ["snake_case canonical value"],
            value_mapping: [{ from: "corpus value", to: "canonical value" }],
            escape_hatch: { other_value: "other", other_text_field: "field_other" },
            rationale: "short reason",
          },
        ],
        key_dispositions: [
          { key: "string (one of the provided additional_keys)", disposition: "promote_enum | promote_field | relation_context | escape_hatch | alias | drop | needs_more_data", target: "optional canonical field/record", rationale: "short reason" },
        ],
        notes: "optional",
      },
      null,
      2,
    ),
  ].join("\n\n");
}

function proposalPrompt(packet: ProposalPacket) {
  return `Propose a payload schema for observation_kind \`${packet.observation_kind}\`. Return the requested JSON only.

\`\`\`json
${JSON.stringify(packet, null, 2)}
\`\`\`
`;
}

function asObject(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function asString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

// The schema-enforcement gate. `issues` invalidate the proposal (not promotable);
// `warnings` are advisory (e.g. closing an enum without high confidence).
export function validateProposal(packet: ProposalPacket, parsed: JsonValue | undefined): { issues: string[]; warnings: string[] } {
  const issues: string[] = [];
  const warnings: string[] = [];

  const root = asObject(parsed);
  if (!root) return { issues: ["proposal is not a JSON object"], warnings };

  if (asString(root.observation_kind) !== packet.observation_kind) {
    issues.push(`observation_kind must equal "${packet.observation_kind}"`);
  }

  const candidateFields = new Map(packet.enum_candidates.map((candidate) => [candidate.field, candidate]));
  const additionalKeyNames = new Set(packet.additional_keys.map((key) => key.field));

  const fieldProposals = Array.isArray(root.field_proposals) ? root.field_proposals : undefined;
  if (!fieldProposals) {
    issues.push("field_proposals must be an array");
  } else {
    const seen = new Set<string>();
    for (const [index, raw] of fieldProposals.entries()) {
      const proposal = asObject(raw);
      if (!proposal) {
        issues.push(`field_proposals[${index}] is not an object`);
        continue;
      }
      const field = asString(proposal.field);
      if (!field || !candidateFields.has(field)) {
        issues.push(`field_proposals[${index}].field "${field ?? ""}" is not a presented enum candidate`);
        continue;
      }
      seen.add(field);
      const candidate = candidateFields.get(field);
      const corpusValues = new Set(candidate?.corpus_values ?? []);

      const decision = asString(proposal.decision);
      if (!decision || !FIELD_DECISIONS.has(decision)) issues.push(`${field}: decision must be one of ${[...FIELD_DECISIONS].join(", ")}`);
      if (!asString(proposal.rationale)) issues.push(`${field}: rationale is required`);
      if (decision === "enum" && candidate?.accepted_occurrences === 0) {
        warnings.push(`${field}: enum is based on zero accepted observations; keep discovery-only until accepted/canonical evidence exists`);
      }
      if (decision === "enum" && candidate?.value_kind === "mixed") {
        warnings.push(`${field}: mixed-type field proposed as enum; split boolean/object/source-role usage before enforcement`);
      }

      const mapping = Array.isArray(proposal.value_mapping) ? proposal.value_mapping : [];
      for (const [mapIndex, rawEntry] of mapping.entries()) {
        const entry = asObject(rawEntry);
        const from = asString(entry?.from);
        const to = asString(entry?.to);
        if (!from || !to) {
          issues.push(`${field}.value_mapping[${mapIndex}] must have non-empty from/to`);
          continue;
        }
        // Anti-hallucination: a mapped source value must exist in the corpus. The
        // canonical set is derived from the distinct `to` values, so there is no
        // separate canonical_values list to keep in sync (which only invited
        // self-inconsistency without adding any real guard).
        if (!corpusValues.has(from)) issues.push(`${field}.value_mapping[${mapIndex}].from "${from}" is not an observed corpus value`);
      }

      // Closure is deferred, so every enum must carry an escape hatch.
      if (decision === "enum" && !asObject(proposal.escape_hatch)) {
        warnings.push(`${field}: enum should declare an escape_hatch (other_value/other_text_field)`);
      }
    }

    for (const candidate of packet.enum_candidates) {
      if (!seen.has(candidate.field)) warnings.push(`no proposal returned for enum candidate "${candidate.field}"`);
    }
  }

  const keyDispositions = Array.isArray(root.key_dispositions) ? root.key_dispositions : [];
  for (const [index, raw] of keyDispositions.entries()) {
    const entry = asObject(raw);
    const key = asString(entry?.key);
    const disposition = asString(entry?.disposition);
    if (!key || (!additionalKeyNames.has(key) && !candidateFields.has(key))) {
      // Unknown/invented key: hard fail (hallucination).
      issues.push(`key_dispositions[${index}].key "${key ?? ""}" is not a presented field`);
      continue;
    }
    if (!additionalKeyNames.has(key)) {
      // Known field, wrong bucket: the disposition belongs in field_proposals. Warn, don't invalidate.
      warnings.push(`key_dispositions[${index}].key "${key}" is an enum-candidate field; put its disposition in field_proposals`);
      continue;
    }
    if (!disposition || !KEY_DISPOSITIONS.has(disposition)) issues.push(`key_dispositions[${index}] (${key}): disposition must be one of ${[...KEY_DISPOSITIONS].join(", ")}`);
  }

  return { issues, warnings };
}

async function buildProposalAgent(config: HarnessConfig, selection: ModelSelection, transcript: TranscriptWriter) {
  const bundle = await createHarnessSession(config, transcript.runId);
  return buildHarnessAgent({
    selection,
    transcript,
    bundle,
    tools: [],
    // Empirically, this model's "max" (xhigh) effort did NOT improve structured-
    // output validity here — it over-normalized (e.g. mapping names/counts) and
    // tripped the gate more often than "high". Stay at "high".
    systemPrompt: systemPrompt(),
  });
}

function proposalPathFor(observationKind: string) {
  return join(proposalsDir(), `${observationKind}.json`);
}

async function runOneProposal(
  kind: SchemaAuditKind,
  config: HarnessConfig,
  selection: ModelSelection,
  runId: string,
  options: SchemaProposalOptions,
): Promise<SchemaProposalResult> {
  const observationKind = kind.observation_kind;
  const proposalPath = proposalPathFor(observationKind);
  if (existsSync(proposalPath) && !options.force) {
    return {
      observation_kind: observationKind,
      proposal_path: relativePath(proposalPath),
      status: "skipped",
      schema_issues: [],
      warnings: [],
      error: "proposal already exists; pass --force to replace it",
    };
  }

  const packet = buildProposalPacket(kind);
  const transcript = createTranscript(config, "schema-proposal-run", observationKind, options.dryRun);
  const { agent, sessionPath } = await buildProposalAgent(config, selection, transcript);
  const prompt = proposalPrompt(packet);

  if (options.dryRun) {
    transcript.writeResponse(`Dry run prepared for ${observationKind}.\n\nPrompt:\n\n${prompt}\n`);
    return {
      observation_kind: observationKind,
      proposal_path: relativePath(proposalPath),
      status: "planned",
      schema_issues: [],
      warnings: [],
      transcript_dir: relative(repoRoot, transcript.runDir),
      session_path: relative(repoRoot, sessionPath),
    };
  }

  const responseText = assistantText(await agent.prompt(prompt));
  transcript.writeResponse(responseText);

  let parsed: JsonValue | undefined;
  let parseError: string | undefined;
  try {
    parsed = parseJsonResponse(responseText);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  const { issues, warnings } = parseError ? { issues: [`response did not contain parseable JSON: ${parseError}`], warnings: [] } : validateProposal(packet, parsed);
  const valid = issues.length === 0;

  const envelope = {
    schema_proposal_run_id: runId,
    proposed_at: new Date().toISOString(),
    observation_kind: observationKind,
    profile_name: selection.profileName,
    provider: selection.model.provider,
    model: selection.model.id,
    audit_packet: packet,
    // Closure is decided here, deterministically — never by the model. While
    // deferred, every enum stays open; closure_signals records which enums the
    // corpus says are saturated enough to revisit closing later.
    closure_policy: "deferred",
    closure_signals: packet.enum_candidates.map((candidate) => ({
      field: candidate.field,
      closure_readiness: candidate.closure_readiness,
      occurrences: candidate.occurrences,
      accepted_occurrences: candidate.accepted_occurrences,
      canonical_occurrences: candidate.canonical_occurrences,
      coverage: candidate.coverage,
    })),
    valid,
    schema_issues: issues,
    warnings,
    proposal: valid ? parsed : undefined,
    raw_response: valid ? undefined : responseText,
    transcript_dir: relative(repoRoot, transcript.runDir),
    session_path: relative(repoRoot, sessionPath),
  };

  writeJson(proposalPath, envelope);

  return {
    observation_kind: observationKind,
    proposal_path: relativePath(proposalPath),
    status: "completed",
    valid,
    schema_issues: issues,
    warnings,
    transcript_dir: relative(repoRoot, transcript.runDir),
    session_path: relative(repoRoot, sessionPath),
    error: valid ? undefined : `proposal failed schema validation with ${issues.length} issue(s)`,
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) break;
        results[index] = await worker(items[index]!, index);
      }
    }),
  );

  return results;
}

export async function runSchemaEnumProposals(options: SchemaProposalOptions): Promise<SchemaProposalRunManifest> {
  const config = readConfig();
  const selection = selectModel(config, options);
  const audit = readSchemaAuditManifest();
  const generatedAt = new Date().toISOString();
  const runId = nowRunId(new Date(generatedAt));

  const include = options.include ? new RegExp(options.include, "iu") : undefined;
  const exclude = options.exclude ? new RegExp(options.exclude, "iu") : undefined;
  const kinds = audit.kinds.filter((kind) => {
    if (kind.enum_candidates.length === 0 && kind.additional_keys.length === 0) return false;
    if (include && !include.test(kind.observation_kind)) return false;
    if (exclude && exclude.test(kind.observation_kind)) return false;
    return true;
  });

  if (kinds.length === 0) {
    throw new Error("No observation kinds with enum candidates or additional keys matched the requested filters.");
  }

  const dir = proposalsDir();
  const runsDir = join(dir, "runs");
  const manifestPath = join(runsDir, `${runId}.json`);
  const latestPath = join(runsDir, "latest.json");
  const concurrency = options.concurrency ?? positiveIntegerEnv("MTA_SCHEMA_PROPOSAL_CONCURRENCY") ?? DEFAULT_CONCURRENCY;

  mkdir(dir);
  mkdir(runsDir);

  const results = await mapWithConcurrency(kinds, concurrency, async (kind) => {
    try {
      return await runOneProposal(kind, config, selection, runId, options);
    } catch (error) {
      return {
        observation_kind: kind.observation_kind,
        proposal_path: relativePath(proposalPathFor(kind.observation_kind)),
        status: "failed" as const,
        schema_issues: [],
        warnings: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const manifest: SchemaProposalRunManifest = {
    run_id: runId,
    generated_at: generatedAt,
    dry_run: options.dryRun,
    profile_name: selection.profileName,
    provider: selection.model.provider,
    model: selection.model.id,
    concurrency,
    audit_manifest: audit.paths.latest,
    kind_count: results.length,
    completed: results.filter((result) => result.status === "completed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    invalid: results.filter((result) => result.status === "completed" && result.valid === false).length,
    paths: {
      proposals_dir: relativePath(dir),
      runs_dir: relativePath(runsDir),
      manifest: relativePath(manifestPath),
      latest: relativePath(latestPath),
    },
    results,
  };

  writeJson(manifestPath, manifest);
  writeJson(latestPath, manifest);

  return manifest;
}
