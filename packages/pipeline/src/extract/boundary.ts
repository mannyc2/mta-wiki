import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { stableHash, stableJson } from "@mta-wiki/db/stable-json";
import { allKindSpecs, kindSpec, RUNNER_OWNED_FIELDS, type KindFieldSpec } from "@mta-wiki/db/kind-registry";
import { validatePayloadSchema } from "@mta-wiki/db/payload-schemas";
import type { JsonObject, JsonValue, MtaEvidenceRef, MtaObservationKind, StagedSourceBlock } from "@mta-wiki/db/types";
import { ASSERTION_STATUSES } from "@mta-wiki/pipeline/records/assertion-qualifiers";
import { RELATION_FAMILIES } from "@mta-wiki/pipeline/records/relations";
import type { ReplayBaselineFile, ReplayEvidenceIdentity, ReplayProjectedRecord } from "@mta-wiki/pipeline/replay/replay";

export type ExtractedRecordDraft = {
  record_kind: MtaObservationKind;
  display_name?: string | undefined;
  local_observation_id?: string | undefined;
  target_record_id?: string | undefined;
  raw_text?: string | undefined;
  truth_status?: string | undefined;
  review_state?: string | undefined;
  payload?: JsonObject | undefined;
  evidence_refs?: MtaEvidenceRef[] | undefined;
};

export type ExtractAgentEnvelope = {
  source_id: string;
  records: ExtractedRecordDraft[];
};

export type ExtractReviewEntry = {
  source_id: string;
  severity: "warning" | "error";
  code: string;
  message: string;
  record_kind?: MtaObservationKind | undefined;
  display_name?: string | undefined;
  local_observation_id?: string | undefined;
  raw_record?: JsonValue | undefined;
};

export type ExtractBoundaryResult = {
  source_id: string;
  records: ReplayProjectedRecord[];
  review: ExtractReviewEntry[];
  input_record_count: number;
  accepted_record_count: number;
  enum_miss_count: number;
};

export type ExtractEnumVocabulary = Record<string, string[]>;

const KIND_VALUES: MtaObservationKind[] = [
  "source",
  "entity",
  "project",
  "corridor",
  "route",
  "treatment_component",
  "event",
  "claim",
  "metric_claim",
  "table",
  "source_gap",
  "relation",
];

export function defaultExtractEnumVocabulary(): ExtractEnumVocabulary {
  return {
    relation_family: [...RELATION_FAMILIES],
    assertion_status: [...ASSERTION_STATUSES],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isObject(value);
}

function isKind(value: unknown): value is MtaObservationKind {
  return typeof value === "string" && KIND_VALUES.includes(value as MtaObservationKind);
}

function issue(result: ExtractBoundaryResult, entry: ExtractReviewEntry) {
  result.review.push(entry);
}

function jsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  return value as JsonValue;
}

function stripJsonFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/u);
  if (fenced?.[1]) return fenced[1].trim();
  const firstObject = trimmed.indexOf("{");
  const lastObject = trimmed.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) return trimmed.slice(firstObject, lastObject + 1);
  return trimmed;
}

export function parseExtractAgentEnvelope(text: string): ExtractAgentEnvelope {
  const parsed = JSON.parse(stripJsonFence(text)) as unknown;
  if (!isObject(parsed)) throw new Error("Extract output must be a JSON object.");
  if (typeof parsed.source_id !== "string" || !parsed.source_id.trim()) throw new Error("Extract output source_id must be a non-empty string.");
  if (!Array.isArray(parsed.records)) throw new Error("Extract output records must be an array.");
  return parsed as ExtractAgentEnvelope;
}

function fieldSpecsByName(kind: MtaObservationKind) {
  return new Map((kindSpec(kind)?.fields ?? []).map((field) => [field.name, field]));
}

function expectedType(value: JsonValue | undefined, type: KindFieldSpec["type"]) {
  if (value === undefined || value === null) return true;
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "string_array":
      return Array.isArray(value) && value.every((entry) => typeof entry === "string");
    case "string_or_number":
      return typeof value === "string" || typeof value === "number";
    case "string_or_string_array":
      return typeof value === "string" || (Array.isArray(value) && value.every((entry) => typeof entry === "string"));
    case "string_or_boolean":
      return typeof value === "string" || typeof value === "boolean";
    case "json":
      return true;
  }
}

function finalSchemaFieldAllowed(name: string) {
  return RUNNER_OWNED_FIELDS.has(name) || name.endsWith("_normalized");
}

function coerceEnumMisses(
  sourceId: string,
  draft: ExtractedRecordDraft,
  payload: JsonObject,
  enumVocabulary: ExtractEnumVocabulary,
  result: ExtractBoundaryResult,
) {
  let count = 0;
  for (const [field, allowedValues] of Object.entries(enumVocabulary)) {
    const value = payload[field];
    if (typeof value !== "string" || allowedValues.includes(value) || value === "other") continue;
    const extra = isJsonObject(payload.extra_fields) ? { ...payload.extra_fields } : {};
    extra[`${field}_other_text`] = value;
    payload.extra_fields = extra;
    payload[field] = "other";
    count += 1;
    issue(result, {
      source_id: sourceId,
      severity: "warning",
      code: "enum_miss_coerced_to_other",
      message: `${field}=${value} is outside the closed vocabulary; stored as other and flagged for review.`,
      record_kind: draft.record_kind,
      display_name: draft.display_name,
      local_observation_id: draft.local_observation_id,
      raw_record: draft as unknown as JsonValue,
    });
  }
  return count;
}

function normalizePayload(sourceId: string, draft: ExtractedRecordDraft, result: ExtractBoundaryResult, enumVocabulary: ExtractEnumVocabulary) {
  const payload: JsonObject = isJsonObject(draft.payload) ? { ...draft.payload } : {};
  normalizeRelationEndpointAliases(payload, draft.record_kind);
  const specs = fieldSpecsByName(draft.record_kind);
  const extra = isJsonObject(payload.extra_fields) ? { ...payload.extra_fields } : {};

  for (const [name, value] of Object.entries(payload)) {
    if (value === undefined || name === "extra_fields" || name.startsWith("_")) continue;
    const spec = specs.get(name);
    if (!spec && !finalSchemaFieldAllowed(name)) {
      extra[name] = value;
      delete payload[name];
      issue(result, {
        source_id: sourceId,
        severity: "warning",
        code: "unknown_field_moved_to_extra_fields",
        message: `${draft.record_kind}.${name} is not in the final-schema registry; moved to extra_fields.`,
        record_kind: draft.record_kind,
        display_name: draft.display_name,
        local_observation_id: draft.local_observation_id,
      });
      continue;
    }
    if (spec && !expectedType(value, spec.type)) {
      issue(result, {
        source_id: sourceId,
        severity: "error",
        code: "invalid_payload_type",
        message: `${draft.record_kind}.${name} has the wrong JSON type for ${spec.type}.`,
        record_kind: draft.record_kind,
        display_name: draft.display_name,
        local_observation_id: draft.local_observation_id,
        raw_record: draft as unknown as JsonValue,
      });
    }
  }

  if (Object.keys(extra).length > 0) payload.extra_fields = extra;
  result.enum_miss_count += coerceEnumMisses(sourceId, draft, payload, enumVocabulary, result);
  validateNormalizedPayload(sourceId, draft, payload, result);
  return payload;
}

function normalizeRelationEndpointAliases(payload: JsonObject, kind: MtaObservationKind) {
  if (kind !== "relation") return;
  const subjectLocal = payload.subject_local_observation_id;
  const objectLocal = payload.object_local_observation_id;
  if (typeof payload.subject_id !== "string" && typeof subjectLocal === "string" && subjectLocal.trim()) payload.subject_id = subjectLocal;
  if (typeof payload.object_id !== "string" && typeof objectLocal === "string" && objectLocal.trim()) payload.object_id = objectLocal;
}

function schemaPayload(payload: JsonObject) {
  const stripped: JsonObject = {};
  for (const [name, value] of Object.entries(payload)) {
    if (RUNNER_OWNED_FIELDS.has(name) || name.endsWith("_normalized")) continue;
    stripped[name] = value;
  }
  return stripped;
}

function validateNormalizedPayload(sourceId: string, draft: ExtractedRecordDraft, payload: JsonObject, result: ExtractBoundaryResult) {
  const schemaResult = validatePayloadSchema(draft.record_kind, schemaPayload(payload));
  for (const schemaIssue of schemaResult.issues) {
    issue(result, {
      source_id: sourceId,
      severity: "error",
      code: "payload_schema_issue",
      message: schemaIssue,
      record_kind: draft.record_kind,
      display_name: draft.display_name,
      local_observation_id: draft.local_observation_id,
      raw_record: draft as unknown as JsonValue,
    });
  }
  for (const warning of schemaResult.warnings) {
    issue(result, {
      source_id: sourceId,
      severity: "warning",
      code: "payload_schema_warning",
      message: warning,
      record_kind: draft.record_kind,
      display_name: draft.display_name,
      local_observation_id: draft.local_observation_id,
    });
  }
}

function evidenceIdentity(ref: MtaEvidenceRef): ReplayEvidenceIdentity {
  return {
    source_id: ref.source_id,
    block_id: ref.block_id ?? ref.block_range ?? ref.evidence_id?.split("#").slice(1).join("#") ?? "",
    page_number: ref.page_number,
    role: ref.role,
    text_sha256: ref.text_sha256,
  };
}

function validateEvidence(
  sourceId: string,
  draft: ExtractedRecordDraft,
  blocksById: Map<string, StagedSourceBlock> | undefined,
  result: ExtractBoundaryResult,
) {
  const refs = draft.evidence_refs ?? [];
  if (refs.length === 0) {
    issue(result, {
      source_id: sourceId,
      severity: "error",
      code: "missing_evidence_refs",
      message: "Extracted records must cite at least one evidence ref.",
      record_kind: draft.record_kind,
      display_name: draft.display_name,
      local_observation_id: draft.local_observation_id,
      raw_record: draft as unknown as JsonValue,
    });
    return [];
  }

  const identities: ReplayEvidenceIdentity[] = [];
  for (const ref of refs) {
    const blockId = ref.block_id ?? ref.block_range ?? ref.evidence_id?.split("#").slice(1).join("#");
    if (ref.source_id !== sourceId || !blockId || !ref.source_quote) {
      issue(result, {
        source_id: sourceId,
        severity: "error",
        code: "invalid_evidence_ref",
        message: "Evidence refs must include the current source_id, block_id, and source_quote.",
        record_kind: draft.record_kind,
        display_name: draft.display_name,
        local_observation_id: draft.local_observation_id,
        raw_record: ref as unknown as JsonValue,
      });
      continue;
    }
    const block = blocksById?.get(blockId);
    if (blocksById && !block) {
      issue(result, {
        source_id: sourceId,
        severity: "error",
        code: "unknown_evidence_block",
        message: `Evidence block ${blockId} does not exist for ${sourceId}.`,
        record_kind: draft.record_kind,
        display_name: draft.display_name,
        local_observation_id: draft.local_observation_id,
      });
      continue;
    }
    if (block && !quoteMatchesBlock(ref.source_quote, block)) {
      issue(result, {
        source_id: sourceId,
        severity: "error",
        code: "evidence_quote_not_in_block",
        message: `Evidence quote is not present in ${sourceId}#${blockId}.`,
        record_kind: draft.record_kind,
        display_name: draft.display_name,
        local_observation_id: draft.local_observation_id,
      });
      continue;
    }
    identities.push(evidenceIdentity({ ...ref, block_id: blockId }));
  }
  return identities.sort(
    (a, b) =>
      a.source_id.localeCompare(b.source_id) ||
      a.block_id.localeCompare(b.block_id) ||
      (a.role ?? "").localeCompare(b.role ?? "") ||
      (a.page_number ?? 0) - (b.page_number ?? 0) ||
      (a.text_sha256 ?? "").localeCompare(b.text_sha256 ?? ""),
  );
}

function evidenceComparable(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—―]/gu, "-")
    .replace(/[•▪■●]/gu, " ")
    .replace(/\b(\d+)\s+(st|nd|rd|th)\b/gu, "$1$2")
    .replace(/&/gu, " and ")
    .replace(/\s+/gu, " ")
    .trim();
}

function quoteMatchesBlock(quote: string, block: StagedSourceBlock) {
  if (block.raw_text.includes(quote) || block.normalized_text.includes(quote)) return true;
  const normalizedQuote = evidenceComparable(quote);
  return normalizedQuote.length > 0 && (evidenceComparable(block.raw_text).includes(normalizedQuote) || evidenceComparable(block.normalized_text).includes(normalizedQuote));
}

function relationProjection(kind: MtaObservationKind, payload: JsonObject): ReplayProjectedRecord["relation"] {
  if (kind !== "relation") return undefined;
  return {
    subject_id: typeof payload.subject_id === "string" ? payload.subject_id : undefined,
    object_id: typeof payload.object_id === "string" ? payload.object_id : undefined,
    relation_family: typeof payload.relation_family === "string" ? payload.relation_family : undefined,
    relation_kind: typeof payload.relation_kind === "string" ? payload.relation_kind : undefined,
    assertion_status: typeof payload.assertion_status === "string" ? payload.assertion_status : undefined,
  };
}

function fallbackRecordId(sourceId: string, draft: ExtractedRecordDraft, payload: JsonObject) {
  return (
    draft.target_record_id ??
    draft.local_observation_id ??
    `${draft.record_kind}_${stableHash({ source_id: sourceId, display_name: displayNameForDraft(draft, payload), payload } as unknown as JsonValue).slice(0, 12)}`
  );
}

function payloadString(payload: JsonObject, fields: string[]) {
  for (const field of fields) {
    const value = payload[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return undefined;
}

function displayNameForDraft(draft: ExtractedRecordDraft, payload: JsonObject) {
  if (typeof draft.display_name === "string" && draft.display_name.trim()) return draft.display_name.trim();
  const specAnchors = kindSpec(draft.record_kind)?.anchors ?? [];
  const common =
    draft.record_kind === "relation"
      ? [
          typeof payload.relation_kind === "string" ? payload.relation_kind : undefined,
          typeof payload.subject_id === "string" || typeof payload.object_id === "string" ? `${payload.subject_id ?? "?"} -> ${payload.object_id ?? "?"}` : undefined,
        ]
      : [
          payloadString(payload, [
            "title",
            "label",
            "name",
            "project_name",
            "corridor_name",
            "route_id",
            "route_name",
            "entity_name",
            "event_name",
            "claim_text",
            "metric_name",
            "treatment_name",
            "description",
            ...specAnchors,
          ]),
        ];
  return common.filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" ").trim();
}

function projectedOrder(a: ReplayProjectedRecord, b: ReplayProjectedRecord) {
  return (
    a.record_kind.localeCompare(b.record_kind) ||
    stableHash(a as unknown as JsonValue).localeCompare(stableHash(b as unknown as JsonValue)) ||
    (a.v1_record_id ?? "").localeCompare(b.v1_record_id ?? "")
  );
}

export function validateExtractEnvelope(
  envelope: ExtractAgentEnvelope,
  options: {
    sourceId?: string | undefined;
    sourceBlocks?: StagedSourceBlock[] | undefined;
    enumVocabulary?: ExtractEnumVocabulary | undefined;
  } = {},
): ExtractBoundaryResult {
  const sourceId = options.sourceId ?? envelope.source_id;
  const result: ExtractBoundaryResult = {
    source_id: sourceId,
    records: [],
    review: [],
    input_record_count: envelope.records.length,
    accepted_record_count: 0,
    enum_miss_count: 0,
  };
  if (envelope.source_id !== sourceId) {
    issue(result, { source_id: sourceId, severity: "error", code: "source_id_mismatch", message: `Output source_id ${envelope.source_id} does not match ${sourceId}.` });
  }

  const blocksById = options.sourceBlocks ? new Map(options.sourceBlocks.map((block) => [block.block_id, block])) : undefined;
  const enumVocabulary = options.enumVocabulary ?? defaultExtractEnumVocabulary();
  const knownKinds = new Set(allKindSpecs().map((spec) => spec.observation_kind));

  for (const rawDraft of envelope.records) {
    if (!isKind(rawDraft.record_kind) || !knownKinds.has(rawDraft.record_kind)) {
      issue(result, {
        source_id: sourceId,
        severity: "error",
        code: "invalid_record_kind",
        message: `Invalid record_kind: ${String(rawDraft.record_kind)}`,
        raw_record: rawDraft as unknown as JsonValue,
      });
      continue;
    }
    const draft = rawDraft;
    const beforeErrors = result.review.filter((entry) => entry.severity === "error").length;
    const payload = normalizePayload(sourceId, draft, result, enumVocabulary);
    const displayName = displayNameForDraft(draft, payload);
    if (!displayName) {
      issue(result, {
        source_id: sourceId,
        severity: "error",
        code: "missing_display_name",
        message: "Extracted record display_name must be a non-empty string.",
        record_kind: draft.record_kind,
        local_observation_id: draft.local_observation_id,
        raw_record: draft as unknown as JsonValue,
      });
      continue;
    }

    const evidence = validateEvidence(sourceId, draft, blocksById, result);
    const afterErrors = result.review.filter((entry) => entry.severity === "error").length;
    if (afterErrors > beforeErrors || evidence.length === 0) continue;

    result.records.push({
      v1_record_id: fallbackRecordId(sourceId, draft, payload),
      record_kind: draft.record_kind,
      display_name: displayName,
      raw_text: draft.raw_text,
      truth_status: draft.truth_status ?? "source_stated",
      review_state: draft.review_state ?? "unreviewed",
      payload,
      relation: relationProjection(draft.record_kind, payload),
      evidence_refs: evidence,
    });
  }

  result.records.sort(projectedOrder);
  result.accepted_record_count = result.records.length;
  return result;
}

export function replayFileFromExtractResult(result: ExtractBoundaryResult, releaseId: string): ReplayBaselineFile {
  return {
    baseline_version: 1,
    release_id: releaseId,
    source_id: result.source_id,
    record_count: result.records.length,
    records: result.records,
  };
}

export function writeExtractReplayFile(path: string, result: ExtractBoundaryResult, releaseId: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${stableJson(replayFileFromExtractResult(result, releaseId) as unknown as JsonValue)}\n`, "utf8");
}

export function writeExtractReviewFile(path: string, result: ExtractBoundaryResult) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${stableJson(result.review as unknown as JsonValue)}\n`, "utf8");
}

export function readExtractAgentEnvelope(path: string) {
  return parseExtractAgentEnvelope(readFileSync(path, "utf8"));
}
