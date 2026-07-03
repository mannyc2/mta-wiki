import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { buildHarnessAgent, positiveIntegerEnv } from "@mta-wiki/core/agent";
import { readConfig } from "@mta-wiki/core/config";
import { selectModel, type ModelSelection } from "@mta-wiki/core/models";
import { repoRoot } from "@mta-wiki/core/paths";
import { createHarnessSession } from "@mta-wiki/core/session";
import { createWikiReactorSandboxTools, sandboxSystemPrompt } from "@mta-wiki/core/sandbox";
import { createTranscript, type TranscriptWriter } from "@mta-wiki/core/transcript";
import type { HarnessConfig, HarnessRunOptions } from "@mta-wiki/core/types";
import { assistantText } from "@mta-wiki/core/usage";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/materialize";
import type { OntologyAgentId, OntologyReviewCandidate, OntologyReviewManifest } from "@mta-wiki/agents/ontology-review";
import { ontologyAgentDefinitions } from "@mta-wiki/agents/ontology-review";
import { RELATION_FAMILIES } from "@mta-wiki/pipeline/records/relations";
import { readSubmissionEntries } from "@mta-wiki/pipeline/records/submissions";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaEvidenceRef, MtaObservationKind, MtaSubmissionEntry } from "@mta-wiki/db/types";

// Ontology-normalize packets run longer than the lib default; bump the provider timeout.
const ONTOLOGY_NORMALIZE_TIMEOUT_MS = 180_000;
const DEFAULT_CONCURRENCY = 2;

const DECISION_TYPES = new Set([
  "merge_records",
  "do_not_merge",
  "split_record",
  "canonical_id",
  "alias",
  "field_value_mapping",
  "field_alias",
  "relation_family_mapping",
  "relation_kind_mapping",
  "relation_candidate",
  "source_gap_resolution",
  "source_gap_caveat",
  "convert_gap_to_claim_caveat",
  "needs_more_data",
  "no_change",
]);

const MAPPING_DECISION_TYPES = new Set(["field_value_mapping", "relation_kind_mapping"]);
const RELATION_FAMILY_DECISION_TYPES = new Set(["relation_family_mapping"]);
const RECORD_DECISION_TYPES = new Set(["merge_records", "do_not_merge", "split_record", "canonical_id", "alias"]);
const SOURCE_GAP_DECISION_TYPES = new Set(["source_gap_resolution", "source_gap_caveat", "convert_gap_to_claim_caveat"]);
const MAPPING_RELATION_TYPES = new Set(["exact_alias", "broader_narrower", "inverse_direction", "related_but_distinct", "needs_more_data"]);

export type OntologyNormalizeOptions = HarnessRunOptions & {
  subject?: string | undefined;
  limit?: number | undefined;
  include?: string | undefined;
  exclude?: string | undefined;
  concurrency?: number | undefined;
  onProgress?: ((event: OntologyNormalizeProgressEvent) => void) | undefined;
};

export type OntologyNormalizeProgressEvent =
  | {
      type: "run_start";
      run_id: string;
      packet_count: number;
      concurrency: number;
      dry_run: boolean;
      model: string;
      provider: string;
      output_dir: string;
    }
  | {
      type: "packet_start" | "packet_prompt_ready" | "packet_model_request" | "packet_model_response" | "packet_validated" | "packet_written" | "packet_failed";
      run_id: string;
      agent_id: OntologyAgentId;
      packet_path: string;
      candidate_count: number;
      transcript_dir?: string | undefined;
      session_path?: string | undefined;
      elapsed_ms?: number | undefined;
      response_chars?: number | undefined;
      decision_count?: number | undefined;
      validated_decision_count?: number | undefined;
      quarantined_decision_count?: number | undefined;
      raw_response_path?: string | undefined;
      error?: string | undefined;
    }
  | {
      type: "packet_model_wait";
      run_id: string;
      agent_id: OntologyAgentId;
      packet_path: string;
      elapsed_ms: number;
    }
  | {
      type: "run_written";
      run_id: string;
      manifest_path: string;
      decisions_path: string;
      quarantine_path: string;
      decision_count: number;
      validated_decision_count: number;
      quarantined_decision_count: number;
    };

export type OntologyNormalizeResult = {
  agent_id: OntologyAgentId;
  packet_path: string;
  status: "planned" | "completed" | "failed";
  decision_count: number;
  validated_decision_count: number;
  quarantined_decision_count: number;
  raw_response_path?: string | undefined;
  transcript_dir?: string | undefined;
  session_path?: string | undefined;
  error?: string | undefined;
};

export type OntologyNormalizeRunManifest = {
  run_id: string;
  generated_at: string;
  dry_run: boolean;
  profile_name: string;
  provider: string;
  model: string;
  concurrency: number;
  ontology_review_run_id: string;
  packet_count: number;
  completed: number;
  failed: number;
  planned: number;
  decision_count: number;
  validated_decision_count: number;
  quarantined_decision_count: number;
  paths: {
    output_dir: string;
    runs_dir: string;
    manifest: string;
    latest: string;
    decisions_jsonl: string;
    quarantine_jsonl: string;
    raw_responses_dir: string;
  };
  results: OntologyNormalizeResult[];
};

export type OntologyDecisionValidation = {
  valid: boolean;
  issues: string[];
  warnings: string[];
};

export type OntologyNormalizePacket = {
  agent_id: OntologyAgentId;
  name: string;
  packet_path: string;
  candidate_count: number;
  candidates: OntologyReviewCandidate[];
};

export type OntologyDecisionValidationContext = {
  candidatesById: Map<string, OntologyReviewCandidate>;
  recordsById: Map<string, MtaCanonicalRecord>;
  sourceIds: Set<string>;
  valuesByKindField: Map<string, Set<string>>;
};

function ontologyReviewDir() {
  return join(repoRoot, "data", "ontology-review");
}

function ontologyDecisionsDir() {
  return join(repoRoot, "data", "ontology-decisions");
}

function nowRunId(date = new Date()) {
  return `${date.toISOString().replace(/[:.]/gu, "-")}_ontology-normalize-run`;
}

function mkdir(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, value: unknown) {
  mkdir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonl(path: string, values: unknown[]) {
  mkdir(dirname(path));
  writeFileSync(path, values.length ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "", "utf8");
}

function progress(options: OntologyNormalizeOptions, event: OntologyNormalizeProgressEvent) {
  options.onProgress?.(event);
}

function relativePath(path: string) {
  return relative(repoRoot, path).split("/").join("/");
}

export function parseJsonResponse(text: string): JsonValue {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fencedBlocks = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gu)].map((match) => match[1]?.trim()).filter((value): value is string => Boolean(value));
  candidates.push(...fencedBlocks.reverse());

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

function readJsonl(path: string): JsonObject[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as JsonObject);
}

function readOntologyReviewManifest(): OntologyReviewManifest {
  const latest = join(ontologyReviewDir(), "latest.json");
  if (!existsSync(latest)) throw new Error(`No ontology review manifest found at ${relativePath(latest)}. Run \`ontology-review\` first.`);
  return JSON.parse(readFileSync(latest, "utf8")) as OntologyReviewManifest;
}

function readOntologyCandidates(manifest: OntologyReviewManifest): OntologyReviewCandidate[] {
  return readJsonl(resolve(repoRoot, manifest.paths.candidates_jsonl)) as OntologyReviewCandidate[];
}

function ontologyNormalizePackets(options: OntologyNormalizeOptions): { manifest: OntologyReviewManifest; packets: OntologyNormalizePacket[] } {
  const manifest = readOntologyReviewManifest();
  const candidates = readOntologyCandidates(manifest);
  const candidatesByAgent = new Map<OntologyAgentId, OntologyReviewCandidate[]>();
  for (const candidate of candidates) {
    candidatesByAgent.set(candidate.agent_id, [...(candidatesByAgent.get(candidate.agent_id) ?? []), candidate]);
  }

  const definitions = new Map(ontologyAgentDefinitions().map((agent) => [agent.agent_id, agent]));
  const include = options.include ? new RegExp(options.include, "iu") : undefined;
  const exclude = options.exclude ? new RegExp(options.exclude, "iu") : undefined;
  const subject = options.subject?.toLowerCase();

  let packets = manifest.agents.flatMap((agentSummary) => {
    const definition = definitions.get(agentSummary.agent_id);
    if (!definition) return [];
    const agentCandidates = candidatesByAgent.get(agentSummary.agent_id) ?? [];
    const filteredCandidates = agentCandidates.filter((candidate) => {
      const candidateHaystack = JSON.stringify({
        agent_id: candidate.agent_id,
        candidate_id: candidate.candidate_id,
        category: candidate.category,
        title: candidate.title,
        field: candidate.field,
        value: candidate.value,
        reasons: candidate.reasons,
      });
      if (include && !include.test(candidateHaystack)) return false;
      if (exclude && exclude.test(candidateHaystack)) return false;
      return true;
    });
    if (filteredCandidates.length === 0) return [];
    const packet: OntologyNormalizePacket = {
      agent_id: agentSummary.agent_id,
      name: agentSummary.name,
      packet_path: agentSummary.packet_path,
      candidate_count: filteredCandidates.length,
      candidates: filteredCandidates,
    };
    return [packet];
  });

  packets = packets.filter((packet) => {
    if (subject && packet.agent_id !== subject && !packet.name.toLowerCase().includes(subject)) return false;
    const haystack = JSON.stringify({
      agent_id: packet.agent_id,
      name: packet.name,
      packet_path: packet.packet_path,
      candidate_ids: packet.candidates.map((candidate) => candidate.candidate_id),
      categories: packet.candidates.map((candidate) => candidate.category),
      titles: packet.candidates.map((candidate) => candidate.title),
    });
    if (!include && exclude && exclude.test(haystack)) return false;
    return true;
  });

  if (options.limit) packets = packets.slice(0, options.limit);
  if (packets.length === 0) throw new Error("No ontology review packets matched the requested filters.");
  return { manifest, packets };
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

function stringValues(value: JsonValue | undefined): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function addValue(values: Map<string, Set<string>>, kind: string, field: string, value: JsonValue | undefined) {
  const key = `${kind}.${field}`;
  const set = values.get(key) ?? new Set<string>();
  for (const item of stringValues(value)) set.add(item);
  values.set(key, set);
}

function buildValidationContext(candidates: OntologyReviewCandidate[], records: MtaCanonicalRecord[], submissions: MtaSubmissionEntry[]): OntologyDecisionValidationContext {
  const valuesByKindField = new Map<string, Set<string>>();
  for (const record of records) {
    for (const [field, value] of Object.entries(record.payload)) addValue(valuesByKindField, record.record_kind, field, value);
  }
  for (const entry of submissions) {
    if (entry.validation.state !== "accepted") continue;
    for (const [field, value] of Object.entries(entry.tool_args.payload ?? {})) addValue(valuesByKindField, entry.tool_args.observation_kind, field, value);
  }

  const sourceIds = new Set<string>();
  for (const record of records) {
    if (record.record_kind === "source") sourceIds.add(record.source_id);
    for (const sourceId of [record.source_id, ...(record.source_ids ?? [])]) sourceIds.add(sourceId);
  }

  return {
    candidatesById: new Map(candidates.map((candidate) => [candidate.candidate_id, candidate])),
    recordsById: new Map(records.map((record) => [record.record_id, record])),
    sourceIds,
    valuesByKindField,
  };
}

function isSlugSafe(value: string) {
  return /^[a-z0-9][a-z0-9_-]*$/u.test(value);
}

function isDecisionIdSafe(value: string) {
  return /^[a-z0-9][a-z0-9_.:-]*$/u.test(value);
}

function valuesFor(context: OntologyDecisionValidationContext, kind: string | undefined, field: string | undefined) {
  if (!kind || !field) return undefined;
  return context.valuesByKindField.get(`${kind}.${field}`);
}

function evidenceRefs(value: JsonValue | undefined): MtaEvidenceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const object = asObject(item);
    const sourceId = asString(object?.source_id);
    if (!sourceId) return [];
    return [
      {
        source_id: sourceId,
        evidence_id: asString(object?.evidence_id),
        source_path: asString(object?.source_path),
        page_number: typeof object?.page_number === "number" ? object.page_number : undefined,
        block_id: asString(object?.block_id),
        block_range: asString(object?.block_range),
        role: asString(object?.role),
        source_quote: asString(object?.source_quote),
      },
    ];
  });
}

function validateRecordIds(decision: JsonObject, context: OntologyDecisionValidationContext, issues: string[]) {
  const recordIds = [...asStringArray(decision.record_ids), asString(decision.record_id)].filter((value): value is string => Boolean(value));
  const kinds = new Set<string>();
  for (const recordId of recordIds) {
    const record = context.recordsById.get(recordId);
    if (!record) {
      issues.push(`record id "${recordId}" does not exist`);
      continue;
    }
    kinds.add(record.record_kind);
  }
  if (recordIds.length > 1 && kinds.size > 1) issues.push("record_ids must all have the same record_kind");
}

function allowedDecisionTypesForCandidate(candidate: OntologyReviewCandidate | undefined) {
  if (!candidate) return DECISION_TYPES;
  if (candidate.category === "relation_kind_inventory") return new Set(["relation_family_mapping", "relation_kind_mapping", "needs_more_data", "no_change"]);
  return DECISION_TYPES;
}

export function validateOntologyDecision(decision: JsonObject, context: OntologyDecisionValidationContext): OntologyDecisionValidation {
  const issues: string[] = [];
  const warnings: string[] = [];

  const decisionId = asString(decision.decision_id);
  if (!decisionId) issues.push("decision_id is required");
  else if (!isDecisionIdSafe(decisionId)) issues.push(`decision_id "${decisionId}" must be lowercase slug-safe`);

  const candidateId = asString(decision.candidate_id);
  const candidate = candidateId ? context.candidatesById.get(candidateId) : undefined;
  if (!candidateId) issues.push("candidate_id is required");
  else if (!candidate) issues.push(`candidate_id "${candidateId}" was not in the packet`);

  const decisionType = asString(decision.decision_type);
  if (!decisionType || !DECISION_TYPES.has(decisionType)) {
    issues.push(`decision_type must be one of ${[...DECISION_TYPES].join(", ")}`);
  } else {
    const allowed = allowedDecisionTypesForCandidate(candidate);
    if (!allowed.has(decisionType)) {
      issues.push(`decision_type "${decisionType}" is not allowed for candidate category ${candidate?.category ?? "(unknown)"}; use ${[...allowed].join(", ")}`);
    }
  }

  if (!asString(decision.summary)) issues.push("summary is required");
  if (!asString(decision.rationale)) issues.push("rationale is required");

  if (decisionType && RECORD_DECISION_TYPES.has(decisionType)) {
    validateRecordIds(decision, context, issues);
    const canonicalId = asString(decision.canonical_id);
    if (canonicalId) {
      if (!isSlugSafe(canonicalId)) issues.push(`canonical_id "${canonicalId}" must be lowercase slug-safe`);
      const target = context.recordsById.get(canonicalId);
      const recordId = asString(decision.record_id);
      if (target && target.record_id !== recordId) issues.push(`canonical_id "${canonicalId}" already exists as another record`);
    }
    for (const alias of asStringArray(decision.aliases)) {
      if (!isSlugSafe(alias)) issues.push(`alias "${alias}" must be lowercase slug-safe`);
    }
  }

  if (decisionType && MAPPING_DECISION_TYPES.has(decisionType)) {
    const field = asString(decision.field) ?? candidate?.field;
    const recordKind = asString(decision.record_kind) ?? candidate?.record_kind;
    const from = asString(decision.from);
    const to = asString(decision.to);
    const mappingRelation = asString(decision.mapping_relation);
    if (!field) issues.push("mapping decisions require field");
    if (!from) issues.push("mapping decisions require from");
    if (!to) issues.push("mapping decisions require to");
    if (!mappingRelation) issues.push("mapping decisions require mapping_relation");
    else if (!MAPPING_RELATION_TYPES.has(mappingRelation)) issues.push(`mapping_relation must be one of ${[...MAPPING_RELATION_TYPES].join(", ")}`);
    else if (mappingRelation !== "exact_alias") {
      issues.push(`mapping_relation "${mappingRelation}" cannot be emitted as ${decisionType}; use needs_more_data, no_change, or a more specific decision type`);
    }
    if (decisionType === "relation_kind_mapping" && !from && asString(decision.relation_kind)) {
      issues.push("relation_kind_mapping must put the observed value in from, not relation_kind");
    }
    if (to && !isSlugSafe(to)) issues.push(`mapping target "${to}" must be lowercase slug-safe`);
    const observedValues = decisionType === "relation_kind_mapping" ? valuesFor(context, "relation", field ?? "relation_kind") : valuesFor(context, recordKind, field);
    if (from && observedValues && !observedValues.has(from)) {
      issues.push(`from value "${from}" was not observed for ${recordKind ?? "relation"}.${field}`);
    }
    if (from && !observedValues) warnings.push(`could not verify observed values for ${recordKind ?? "(unknown)"}.${field ?? "(unknown)"}`);
  }

  if (decisionType && RELATION_FAMILY_DECISION_TYPES.has(decisionType)) {
    const field = asString(decision.field) ?? candidate?.field ?? "relation_kind";
    const from = asString(decision.from);
    const to = asString(decision.to);
    if (field !== "relation_kind") issues.push("relation_family_mapping field must be relation_kind");
    if (!from) issues.push("relation_family_mapping requires from");
    if (!to) issues.push("relation_family_mapping requires to");
    else if (!RELATION_FAMILIES.includes(to as (typeof RELATION_FAMILIES)[number])) {
      issues.push(`relation_family_mapping target "${to}" must be one of ${RELATION_FAMILIES.join(", ")}`);
    }
    const observedValues = valuesFor(context, "relation", "relation_kind");
    if (from && observedValues && !observedValues.has(from)) {
      issues.push(`from value "${from}" was not observed for relation.relation_kind`);
    }
    if (from && !observedValues) warnings.push("could not verify observed values for relation.relation_kind");
  }

  if (decisionType === "field_alias") {
    const fromField = asString(decision.from_field) ?? asString(decision.field);
    const toField = asString(decision.to_field);
    if (!fromField) issues.push("field_alias decisions require from_field");
    if (!toField) issues.push("field_alias decisions require to_field");
  }

  if (decisionType === "relation_candidate") {
    const relationKind = asString(decision.relation_kind);
    if (!relationKind) issues.push("relation_candidate requires relation_kind");
    else if (!isSlugSafe(relationKind)) issues.push(`relation_kind "${relationKind}" must be lowercase slug-safe`);
    for (const key of ["subject_id", "object_id"] as const) {
      const id = asString(decision[key]);
      if (id && !context.recordsById.has(id)) issues.push(`${key} "${id}" does not exist`);
    }
  }

  if (decisionType && SOURCE_GAP_DECISION_TYPES.has(decisionType)) {
    const sourceGapRecordId = asString(decision.source_gap_record_id) ?? asString(decision.record_id);
    if (!sourceGapRecordId) issues.push("source gap decisions require source_gap_record_id");
    const sourceGapRecord = sourceGapRecordId ? context.recordsById.get(sourceGapRecordId) : undefined;
    if (sourceGapRecordId && !sourceGapRecord) issues.push(`source_gap_record_id "${sourceGapRecordId}" does not exist`);
    if (sourceGapRecord && sourceGapRecord.record_kind !== "source_gap") issues.push(`${sourceGapRecordId} is ${sourceGapRecord.record_kind}, not source_gap`);
    if (decisionType === "source_gap_resolution") {
      const resolvingSourceIds = asStringArray(decision.resolving_source_ids);
      if (resolvingSourceIds.length === 0) issues.push("source_gap_resolution requires resolving_source_ids");
      for (const sourceId of resolvingSourceIds) {
        if (!context.sourceIds.has(sourceId) && !existsSync(join(repoRoot, "wiki", "sources", `${sourceId}.md`))) {
          issues.push(`resolving source_id "${sourceId}" does not exist`);
        }
      }
      if (evidenceRefs(decision.evidence_refs).length === 0) issues.push("source_gap_resolution requires evidence_refs");
    }
  }

  return { valid: issues.length === 0, issues, warnings };
}

export function validateOntologyDecisionEnvelope(packet: OntologyNormalizePacket, parsed: JsonValue | undefined, context: OntologyDecisionValidationContext) {
  const root = asObject(parsed);
  if (!root) {
    return {
      decisions: [] as JsonObject[],
      validated: [] as JsonObject[],
      quarantined: [
        {
          agent_id: packet.agent_id,
          packet_path: packet.packet_path,
          issues: ["response is not a JSON object"],
        },
      ] as JsonObject[],
    };
  }

  const envelopeIssues: string[] = [];
  if (asString(root.agent_id) !== packet.agent_id) envelopeIssues.push(`agent_id must equal "${packet.agent_id}"`);
  const rawDecisions = Array.isArray(root.decisions) ? root.decisions : undefined;
  if (!rawDecisions) envelopeIssues.push("decisions must be an array");

  const decisions: JsonObject[] = [];
  const validated: JsonObject[] = [];
  const quarantined: JsonObject[] = [];
  const seenDecisionIds = new Set<string>();

  if (rawDecisions) {
    for (const [index, rawDecision] of rawDecisions.entries()) {
      const decision = asObject(rawDecision);
      if (!decision) {
        quarantined.push({
          agent_id: packet.agent_id,
          packet_path: packet.packet_path,
          decision_index: index,
          issues: ["decision is not an object"],
          raw_decision: rawDecision,
        });
        continue;
      }

      const normalized: JsonObject = {
        ...decision,
        agent_id: packet.agent_id,
        packet_path: packet.packet_path,
      };
      decisions.push(normalized);
      const validation = validateOntologyDecision(normalized, context);
      const decisionId = asString(normalized.decision_id);
      if (decisionId && seenDecisionIds.has(decisionId)) validation.issues.push(`duplicate decision_id "${decisionId}" in packet response`);
      if (decisionId) seenDecisionIds.add(decisionId);

      const row = {
        ...normalized,
        validation,
      };
      if (validation.valid) validated.push(row);
      else quarantined.push(row);
    }
  }

  if (envelopeIssues.length > 0) {
    quarantined.unshift({
      agent_id: packet.agent_id,
      packet_path: packet.packet_path,
      issues: envelopeIssues,
      raw_response: root,
    });
  }

  return { decisions, validated, quarantined };
}

function ontologyNormalizeSystemPrompt(config: HarnessConfig) {
  return [
    "You are the second-pass ontology normalizer for the MTA wiki.",
    "You receive one data-driven ontology review packet. Your job is to submit typed normalization decisions, not suggestions, prose, or code changes.",
    "These decisions are audit artifacts only. They are machine-validated and quarantined on failure; they are not automatically materialized.",
    "Use the packet counts, examples, candidate ids, record ids, source ids, and local repository context. Do not use external knowledge.",
    "Prefer precise, conservative decisions. If a packet is too noisy or evidence is insufficient, return needs_more_data or no_change decisions.",
    "Preserve source literals. Decisions may add normalized companions, aliases, relation candidates, or caveat/resolution records; they must not rewrite cited source text.",
    "For source gaps, inspect the provided possible_source_matches and fetch source pages/blocks when needed before declaring a gap resolved.",
    "You must call `mta_submit_ontology_decisions` exactly once with the final decision envelope. Do not put the decision envelope in assistant text.",
    "The packet JSON is authoritative for the candidate ids and candidate set. Do not make decisions for candidates that are not present in the packet JSON.",
    "For any mapping decision, first classify the value pair as exact_alias, broader_narrower, inverse_direction, related_but_distinct, or needs_more_data using representative_records when present.",
    "Emit `field_value_mapping` or `relation_kind_mapping` only for exact_alias pairs that preserve record meaning and query semantics. Do not map inverse-direction, broader/narrower, or merely related values.",
    "For `relation_kind_inventory` candidates, use `relation_family_mapping` for broad family classification and `relation_kind_mapping` only for exact aliases. Put the observed relation_kind value in `from`; `relation_kind` is only for relation_candidate decisions.",
    "`mta_submit_ontology_decisions` argument shape:",
    JSON.stringify(
      {
        agent_id: "must equal packet agent_id",
        audit: {
          packet_quality: "good | mixed | poor",
          notes: "short audit note about whether this packet was decision-ready",
        },
        decisions: [
          {
            decision_id: "lowercase stable id unique within this packet",
            candidate_id: "candidate id from the packet",
            decision_type:
              "merge_records | do_not_merge | split_record | canonical_id | alias | field_value_mapping | field_alias | relation_family_mapping | relation_kind_mapping | relation_candidate | source_gap_resolution | source_gap_caveat | convert_gap_to_claim_caveat | needs_more_data | no_change",
            summary: "short machine-readable summary",
            rationale: "short reason grounded in packet evidence",
            record_kind: "optional observation kind",
            record_id: "optional existing record_id",
            record_ids: ["optional existing record ids"],
            canonical_id: "optional lowercase id for canonical_id decisions",
            aliases: ["optional lowercase aliases"],
            field: "optional payload field",
            from: "required observed value for field_value_mapping, relation_family_mapping, or relation_kind_mapping",
            to: "required normalized value for field_value_mapping, relation_family_mapping, or relation_kind_mapping",
            mapping_relation: "required for mapping decisions; must be exact_alias",
            from_field: "optional source field for field_alias",
            to_field: "optional target field for field_alias",
            relation_kind: "optional lowercase relation kind for relation_candidate only; never use this instead of from",
            subject_id: "optional existing record_id",
            object_id: "optional existing record_id",
            source_gap_record_id: "optional source_gap record_id",
            resolving_source_ids: ["optional source ids for source_gap_resolution"],
            evidence_refs: [{ source_id: "source id", block_id: "block id when available", page_number: 1, role: "supporting" }],
          },
        ],
      },
      null,
      2,
    ),
    sandboxSystemPrompt("ontology-normalize", config),
  ].join("\n\n");
}

function ontologyNormalizePrompt(packet: OntologyNormalizePacket) {
  const packetData = {
    agent_id: packet.agent_id,
    name: packet.name,
    packet_path: packet.packet_path,
    candidate_count: packet.candidate_count,
    candidates: packet.candidates,
  };

  return `Normalize this ontology packet into typed decisions. Submit the final envelope with mta_submit_ontology_decisions.

Packet data:

\`\`\`json
${JSON.stringify(packetData, null, 2)}
\`\`\`
`;
}

function packetRunSummary(packet: OntologyNormalizePacket, selection: ModelSelection, dryRun: boolean, sessionPath: string) {
  return `# ontology-normalize-run ${packet.agent_id}

- Packet: \`${packet.packet_path}\`
- Candidates: \`${packet.candidate_count}\`
- Profile: \`${selection.profileName}\`
- Model: \`${selection.model.provider}/${selection.model.id}\`
- Dry run: \`${dryRun}\`
- Session: \`${relative(repoRoot, sessionPath)}\`
`;
}

async function buildOntologyNormalizeAgent(config: HarnessConfig, selection: ModelSelection, transcript: TranscriptWriter) {
  const bundle = await createHarnessSession(config, transcript.runId);
  let submittedEnvelope: JsonObject | undefined;
  const submitOntologyDecisionsParameters = Type.Object({
    agent_id: Type.String({ description: "Must equal the packet agent_id." }),
    audit: Type.Optional(Type.Any({ description: "Short audit metadata about packet quality and decision readiness." })),
    decisions: Type.Array(
      Type.Object(
        {
          decision_id: Type.String({ description: "Lowercase stable id unique within this packet." }),
          candidate_id: Type.String({ description: "Candidate id from the packet JSON." }),
          decision_type: Type.String({ description: "Typed ontology decision. Use mapping types only for exact_alias mappings." }),
          summary: Type.String(),
          rationale: Type.String({ description: "Ground this in packet examples and representative_records when present." }),
          record_kind: Type.Optional(Type.String()),
          record_id: Type.Optional(Type.String()),
          record_ids: Type.Optional(Type.Array(Type.String())),
          canonical_id: Type.Optional(Type.String()),
          aliases: Type.Optional(Type.Array(Type.String())),
          field: Type.Optional(Type.String()),
          from: Type.Optional(Type.String({ description: "Required observed value for field_value_mapping, relation_family_mapping, or relation_kind_mapping." })),
          to: Type.Optional(Type.String({ description: "Required normalized value for field_value_mapping, relation_family_mapping, or relation_kind_mapping." })),
          mapping_relation: Type.Optional(
            Type.String({ description: "Required for mapping decisions. Must be exact_alias; otherwise do not emit a mapping decision." }),
          ),
          from_field: Type.Optional(Type.String()),
          to_field: Type.Optional(Type.String()),
          relation_kind: Type.Optional(Type.String({ description: "Use for relation_candidate only; do not use instead of from." })),
          subject_id: Type.Optional(Type.String()),
          object_id: Type.Optional(Type.String()),
          source_gap_record_id: Type.Optional(Type.String()),
          resolving_source_ids: Type.Optional(Type.Array(Type.String())),
          evidence_refs: Type.Optional(Type.Array(Type.Any())),
        },
        { additionalProperties: true },
      ),
    ),
  });
  const submitOntologyDecisionsTool: AgentTool<typeof submitOntologyDecisionsParameters> = {
    name: "mta_submit_ontology_decisions",
    label: "Submit Ontology Decisions",
    description: "Submit the final ontology normalization decision envelope for this packet. Call exactly once when ready.",
    parameters: submitOntologyDecisionsParameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      submittedEnvelope = params as JsonObject;
      transcript.write("mta_tool_submit_ontology_decisions", {
        agentId: params.agent_id,
        decisionCount: params.decisions.length,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                state: "accepted_for_validation",
                instruction: "Ontology decision envelope captured. Stop now.",
              },
              null,
              2,
            ),
          },
        ],
        details: {
          agentId: params.agent_id,
          decisionCount: params.decisions.length,
        },
        terminate: true,
      };
    },
  };
  const { agent, sessionPath } = buildHarnessAgent({
    selection,
    transcript,
    bundle,
    tools: [...createWikiReactorSandboxTools(config, "ontology-normalize"), submitOntologyDecisionsTool],
    streamOptions: { timeoutMs: ONTOLOGY_NORMALIZE_TIMEOUT_MS },
    systemPrompt: ontologyNormalizeSystemPrompt(config),
  });

  return { agent, sessionPath, submittedEnvelope: () => submittedEnvelope };
}

async function runOneOntologyNormalizePacket(
  packet: OntologyNormalizePacket,
  config: HarnessConfig,
  selection: ModelSelection,
  runId: string,
  options: OntologyNormalizeOptions,
  context: OntologyDecisionValidationContext,
  rawResponsesDir: string,
): Promise<{ result: OntologyNormalizeResult; validated: JsonObject[]; quarantined: JsonObject[] }> {
  const packetStartedAt = Date.now();
  progress(options, {
    type: "packet_start",
    run_id: runId,
    agent_id: packet.agent_id,
    packet_path: packet.packet_path,
    candidate_count: packet.candidate_count,
  });
  const transcript = createTranscript(config, "ontology-normalize-run", packet.agent_id, options.dryRun);
  const { agent, sessionPath, submittedEnvelope } = await buildOntologyNormalizeAgent(config, selection, transcript);
  const prompt = ontologyNormalizePrompt(packet);
  transcript.writeSummary(packetRunSummary(packet, selection, options.dryRun, sessionPath));
  progress(options, {
    type: "packet_prompt_ready",
    run_id: runId,
    agent_id: packet.agent_id,
    packet_path: packet.packet_path,
    candidate_count: packet.candidate_count,
    transcript_dir: relative(repoRoot, transcript.runDir),
    session_path: relative(repoRoot, sessionPath),
    elapsed_ms: Date.now() - packetStartedAt,
  });

  if (options.dryRun) {
    transcript.writeResponse(`Dry run prepared for ${packet.agent_id}.

Prompt:

${prompt}
`);
    return {
      result: {
        agent_id: packet.agent_id,
        packet_path: packet.packet_path,
        status: "planned",
        decision_count: 0,
        validated_decision_count: 0,
        quarantined_decision_count: 0,
        transcript_dir: relative(repoRoot, transcript.runDir),
        session_path: relative(repoRoot, sessionPath),
      },
      validated: [],
      quarantined: [],
    };
  }

  progress(options, {
    type: "packet_model_request",
    run_id: runId,
    agent_id: packet.agent_id,
    packet_path: packet.packet_path,
    candidate_count: packet.candidate_count,
    elapsed_ms: Date.now() - packetStartedAt,
  });
  const heartbeat = setInterval(() => {
    progress(options, {
      type: "packet_model_wait",
      run_id: runId,
      agent_id: packet.agent_id,
      packet_path: packet.packet_path,
      elapsed_ms: Date.now() - packetStartedAt,
    });
  }, 30_000);
  let responseText: string;
  try {
    responseText = assistantText(await agent.prompt(prompt));
  } finally {
    clearInterval(heartbeat);
  }
  const toolEnvelope = submittedEnvelope();
  progress(options, {
    type: "packet_model_response",
    run_id: runId,
    agent_id: packet.agent_id,
    packet_path: packet.packet_path,
    candidate_count: packet.candidate_count,
    elapsed_ms: Date.now() - packetStartedAt,
    response_chars: toolEnvelope ? JSON.stringify(toolEnvelope).length : responseText.length,
  });
  transcript.writeResponse(responseText || (toolEnvelope ? "[ontology decisions submitted via mta_submit_ontology_decisions]" : ""));

  let parsed: JsonValue | undefined;
  let parseError: string | undefined;
  if (toolEnvelope) {
    parsed = toolEnvelope;
  } else {
    try {
      parsed = parseJsonResponse(responseText);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }

  const rawResponsePath = join(rawResponsesDir, `${packet.agent_id}.json`);
  const envelope = {
    ontology_normalize_run_id: runId,
    normalized_at: new Date().toISOString(),
    agent_id: packet.agent_id,
    packet_path: packet.packet_path,
    profile_name: selection.profileName,
    provider: selection.model.provider,
    model: selection.model.id,
    response_mode: toolEnvelope ? "tool" : "assistant_text",
    parsed_response: parsed,
    parse_error: parseError,
    raw_response: toolEnvelope ? undefined : responseText,
    transcript_dir: relative(repoRoot, transcript.runDir),
    session_path: relative(repoRoot, sessionPath),
  };
  writeJson(rawResponsePath, envelope);

  const parsedValidation = parseError
    ? {
        decisions: [] as JsonObject[],
        validated: [] as JsonObject[],
        quarantined: [
          {
            agent_id: packet.agent_id,
            packet_path: packet.packet_path,
            issues: [`model did not call mta_submit_ontology_decisions and response did not contain parseable JSON: ${parseError}`],
            raw_response: responseText,
          },
        ] as JsonObject[],
      }
    : validateOntologyDecisionEnvelope(packet, parsed, context);
  progress(options, {
    type: "packet_validated",
    run_id: runId,
    agent_id: packet.agent_id,
    packet_path: packet.packet_path,
    candidate_count: packet.candidate_count,
    elapsed_ms: Date.now() - packetStartedAt,
    decision_count: parsedValidation.decisions.length,
    validated_decision_count: parsedValidation.validated.length,
    quarantined_decision_count: parsedValidation.quarantined.length,
    raw_response_path: relativePath(rawResponsePath),
  });

  return {
    result: {
      agent_id: packet.agent_id,
      packet_path: packet.packet_path,
      status: "completed",
      decision_count: parsedValidation.decisions.length,
      validated_decision_count: parsedValidation.validated.length,
      quarantined_decision_count: parsedValidation.quarantined.length,
      raw_response_path: relativePath(rawResponsePath),
      transcript_dir: relative(repoRoot, transcript.runDir),
      session_path: relative(repoRoot, sessionPath),
    },
    validated: parsedValidation.validated,
    quarantined: parsedValidation.quarantined,
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

export async function runOntologyNormalizePackets(options: OntologyNormalizeOptions): Promise<OntologyNormalizeRunManifest> {
  const config = readConfig();
  const selection = selectModel(config, options);
  const { manifest: ontologyReviewManifest, packets } = ontologyNormalizePackets(options);
  const canonicalRecords = readCanonicalRecords();
  const submissions = readSubmissionEntries();
  const context = buildValidationContext(
    packets.flatMap((packet) => packet.candidates),
    canonicalRecords,
    submissions,
  );

  const generatedAt = new Date().toISOString();
  const runId = nowRunId(new Date(generatedAt));
  const outputDir = join(ontologyDecisionsDir(), runId);
  const runsDir = join(ontologyDecisionsDir(), "runs");
  const manifestPath = join(runsDir, `${runId}.json`);
  const latestPath = join(runsDir, "latest.json");
  const decisionsPath = join(outputDir, "validated-decisions.jsonl");
  const quarantinePath = join(outputDir, "quarantined-decisions.jsonl");
  const rawResponsesDir = join(outputDir, "raw-responses");
  const concurrency = options.concurrency ?? positiveIntegerEnv("MTA_ONTOLOGY_NORMALIZE_CONCURRENCY") ?? DEFAULT_CONCURRENCY;

  mkdir(outputDir);
  mkdir(runsDir);
  mkdir(rawResponsesDir);
  progress(options, {
    type: "run_start",
    run_id: runId,
    packet_count: packets.length,
    concurrency,
    dry_run: options.dryRun,
    provider: selection.model.provider,
    model: selection.model.id,
    output_dir: relativePath(outputDir),
  });

  const packetRuns = await mapWithConcurrency(packets, concurrency, async (packet) => {
    try {
      const packetRun = await runOneOntologyNormalizePacket(packet, config, selection, runId, options, context, rawResponsesDir);
      progress(options, {
        type: "packet_written",
        run_id: runId,
        agent_id: packet.agent_id,
        packet_path: packet.packet_path,
        candidate_count: packet.candidate_count,
        decision_count: packetRun.result.decision_count,
        validated_decision_count: packetRun.result.validated_decision_count,
        quarantined_decision_count: packetRun.result.quarantined_decision_count,
        raw_response_path: packetRun.result.raw_response_path,
      });
      return packetRun;
    } catch (error) {
      progress(options, {
        type: "packet_failed",
        run_id: runId,
        agent_id: packet.agent_id,
        packet_path: packet.packet_path,
        candidate_count: packet.candidate_count,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        result: {
          agent_id: packet.agent_id,
          packet_path: packet.packet_path,
          status: "failed" as const,
          decision_count: 0,
          validated_decision_count: 0,
          quarantined_decision_count: 0,
          error: error instanceof Error ? error.message : String(error),
        },
        validated: [] as JsonObject[],
        quarantined: [] as JsonObject[],
      };
    }
  });

  const validated = packetRuns.flatMap((run) => run.validated);
  const quarantined = packetRuns.flatMap((run) => run.quarantined);
  writeJsonl(decisionsPath, validated);
  writeJsonl(quarantinePath, quarantined);

  const results = packetRuns.map((run) => run.result);
  const manifest: OntologyNormalizeRunManifest = {
    run_id: runId,
    generated_at: generatedAt,
    dry_run: options.dryRun,
    profile_name: selection.profileName,
    provider: selection.model.provider,
    model: selection.model.id,
    concurrency,
    ontology_review_run_id: ontologyReviewManifest.run_id,
    packet_count: results.length,
    completed: results.filter((result) => result.status === "completed").length,
    failed: results.filter((result) => result.status === "failed").length,
    planned: results.filter((result) => result.status === "planned").length,
    decision_count: results.reduce((sum, result) => sum + result.decision_count, 0),
    validated_decision_count: validated.length,
    quarantined_decision_count: quarantined.length,
    paths: {
      output_dir: relativePath(outputDir),
      runs_dir: relativePath(runsDir),
      manifest: relativePath(manifestPath),
      latest: relativePath(latestPath),
      decisions_jsonl: relativePath(decisionsPath),
      quarantine_jsonl: relativePath(quarantinePath),
      raw_responses_dir: relativePath(rawResponsesDir),
    },
    results,
  };

  writeJson(manifestPath, manifest);
  writeJson(latestPath, manifest);
  progress(options, {
    type: "run_written",
    run_id: runId,
    manifest_path: relativePath(manifestPath),
    decisions_path: relativePath(decisionsPath),
    quarantine_path: relativePath(quarantinePath),
    decision_count: manifest.decision_count,
    validated_decision_count: manifest.validated_decision_count,
    quarantined_decision_count: manifest.quarantined_decision_count,
  });
  return manifest;
}
