import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { PAYLOAD_SCHEMA_VERSION, requiredPayloadAnchors } from "@mta-wiki/db/kind-registry";
import { normalizeObservationPayload } from "@mta-wiki/pipeline/ontology/normalizers";
import { ontologyWarningsForPayload } from "@mta-wiki/pipeline/ontology/ontology";
import { validatePayloadSchema } from "@mta-wiki/db/payload-schemas";
import { stableHash } from "@mta-wiki/db/stable-json";
import { evidenceId, readStagedSourceBlocks, sourceBlockById, sourceBlocksRelativePath } from "@mta-wiki/pipeline/sources/source-prep";
import type { JsonObject, JsonValue, MtaEvidenceRef, MtaEvidenceSubmissionRef, MtaSubmitObservationInput, MtaSubmissionEntry } from "@mta-wiki/db/types";

const OBSERVATION_KINDS = new Set([
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
]);

function submissionsDir() {
  return join(repoRoot, "data", "submissions");
}

export function submissionPath(runId: string) {
  return join(submissionsDir(), `${runId}.jsonl`);
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePayload(payload: unknown): JsonObject {
  if (payload === undefined || payload === null) return {};

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return {};

    try {
      const parsed = JSON.parse(trimmed) as JsonValue;
      return isJsonObject(parsed) ? parsed : { value: parsed };
    } catch {
      return { text: payload };
    }
  }

  if (isJsonObject(payload)) return payload;
  return { value: payload as JsonValue };
}

function stringPayloadField(payload: JsonObject | undefined, field: string) {
  const value = payload?.[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizedQuoteText(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function normalizedSourceQuote(ref: MtaEvidenceSubmissionRef) {
  return typeof ref.source_quote === "string" && ref.source_quote.trim() ? normalizedQuoteText(ref.source_quote) : undefined;
}

function normalizeEvidenceRef(ref: MtaEvidenceSubmissionRef): MtaEvidenceRef {
  const parsedEvidenceId = ref.evidence_id?.split("#");
  const sourceId = ref.source_id || (parsedEvidenceId?.length === 2 ? parsedEvidenceId[0] : undefined);
  const blockId = ref.block_id || ref.block_range || (parsedEvidenceId?.length === 2 ? parsedEvidenceId[1] : undefined);
  const sourceQuote = normalizedSourceQuote(ref);

  if (!sourceId || !blockId) {
    return {
      source_id: sourceId ?? "",
      evidence_id: ref.evidence_id,
      block_id: blockId,
      block_range: ref.block_range,
      role: ref.role,
      source_quote: sourceQuote,
    };
  }

  const normalizedPath = sourceBlocksRelativePath(sourceId);
  let block: ReturnType<typeof sourceBlockById>;
  try {
    block = sourceBlockById(sourceId, blockId);
  } catch {
    return {
      source_id: sourceId,
      evidence_id: evidenceId(sourceId, blockId),
      source_path: normalizedPath,
      block_id: blockId,
      block_range: blockId.includes("..") ? blockId : ref.block_range,
      role: ref.role,
      source_quote: sourceQuote,
    };
  }

  const normalizedId = evidenceId(sourceId, block.block_id);
  return {
    source_id: sourceId,
    evidence_id: normalizedId,
    source_path: normalizedPath,
    page_number: block.page_number,
    block_id: block.block_id,
    block_range: block.block_id.includes("..") ? block.block_id : undefined,
    child_block_ids: block.child_block_ids,
    text_sha256: block.raw_text_sha256,
    text_source: "raw_text",
    role: ref.role,
    source_quote: sourceQuote,
  };
}

function primarySourceSurfaces(sourceId: string) {
  const blocks = readStagedSourceBlocks(sourceId);
  const pdfSurfaces = new Set(blocks.filter((block) => block.source_surface === "chandra_ocr" || block.source_surface === "pdf_text").map((block) => block.source_surface));
  return pdfSurfaces.size > 0 ? pdfSurfaces : undefined;
}

// Fold typographic variants so a straight-quote/hyphen quote matches OCR'd curly quotes and
// en/em dashes. Applied only for the presence check; the stored source_quote stays literal.
function foldPunctuationForMatch(value: string) {
  return value
    .replace(/[‘’‚‛]/gu, "'")
    .replace(/[“”„‟]/gu, '"')
    .replace(/[‐-―−]/gu, "-");
}

export function quoteIsInBlock(quote: string, rawText: string) {
  const norm = (value: string) => foldPunctuationForMatch(normalizedQuoteText(value)).toLowerCase();
  return norm(rawText).includes(norm(quote));
}

function validateBlockEvidence(input: MtaSubmitObservationInput, issues: string[]) {
  const primarySurfaces = new Map<string, ReturnType<typeof primarySourceSurfaces>>();
  for (const [index, ref] of (input.evidence_refs ?? []).entries()) {
    if (!ref.source_id || !ref.block_id) continue;

    try {
      const block = sourceBlockById(ref.source_id, ref.block_id);
      if (!primarySurfaces.has(ref.source_id)) {
        primarySurfaces.set(ref.source_id, primarySourceSurfaces(ref.source_id));
      }
      const primarySurface = primarySurfaces.get(ref.source_id);
      if (primarySurface && !primarySurface.has(block.source_surface)) {
        issues.push(`evidence_refs[${index}] must cite the primary source evidence blocks for this source`);
      }
      if (ref.source_path !== sourceBlocksRelativePath(ref.source_id)) {
        issues.push(`evidence_refs[${index}].source_path must point to blocks.jsonl`);
      }
      if (ref.evidence_id !== evidenceId(ref.source_id, ref.block_id)) {
        issues.push(`evidence_refs[${index}].evidence_id mismatch`);
      }
      if (ref.page_number !== block.page_number) {
        issues.push(`evidence_refs[${index}].page_number mismatch`);
      }
      if (ref.text_sha256 !== block.raw_text_sha256) {
        issues.push(`evidence_refs[${index}].text_sha256 mismatch`);
      }
      if (ref.source_quote !== undefined) {
        if (ref.source_quote.length > 280) {
          issues.push(`evidence_refs[${index}].source_quote must be 280 characters or fewer`);
        }
        if (!quoteIsInBlock(ref.source_quote, block.raw_text)) {
          issues.push(`evidence_refs[${index}].source_quote is not present in the cited block`);
        }
      }
    } catch (error) {
      issues.push(`evidence_refs[${index}] unknown source block: ${String(error instanceof Error ? error.message : error)}`);
    }
  }
}

export function relationEndpointIssues(input: MtaSubmitObservationInput, knownLocalObservationIds: Set<string>) {
  if (input.observation_kind !== "relation") return [];

  const issues: string[] = [];
  for (const [field, recordField] of [
    ["subject_local_observation_id", "subject_id"],
    ["object_local_observation_id", "object_id"],
  ] as const) {
    // Canonicalizer-authored relations target canonical ids directly and may span sources.
    if (typeof input.payload?.[recordField] === "string") continue;
    const value = input.payload?.[field];
    if (typeof value !== "string" || knownLocalObservationIds.has(value)) continue;

    issues.push(
      `${field} references missing local observation id "${value}". Submit an observation with local_observation_id "${value}" before submitting this relation.`,
    );
  }

  return issues;
}

function validateRelationPayload(input: MtaSubmitObservationInput, issues: string[]) {
  if (input.observation_kind !== "relation") return;

  if (typeof input.payload?.text === "string") {
    issues.push("relation payload must be structured JSON, not an unparsed text payload");
  }

  if (!stringPayloadField(input.payload, "relation_kind")) {
    issues.push("relation payload.relation_kind is required");
  }
  for (const [localField, recordField] of [
    ["subject_local_observation_id", "subject_id"],
    ["object_local_observation_id", "object_id"],
  ] as const) {
    if (!stringPayloadField(input.payload, localField) && !stringPayloadField(input.payload, recordField)) {
      issues.push(`relation payload.${localField} (or canonical ${recordField}) is required`);
    }
  }
}

function validateMetricPayload(input: MtaSubmitObservationInput, issues: string[]) {
  if (input.observation_kind !== "metric_claim") return;

  const payload = input.payload ?? {};
  const hasScalarValue = typeof payload.value === "number";
  const hasRange = typeof payload.value_min === "number" && typeof payload.value_max === "number";
  if (payload.value !== undefined && typeof payload.value !== "number") {
    issues.push("metric_claim payload.value must normalize to a number; use value_min/value_max for ranges");
  }
  if (!hasScalarValue && !hasRange && payload.raw_value_text !== undefined) {
    issues.push("metric_claim payload with raw_value_text should include normalized numeric value or value_min/value_max");
  }
}

function normalizedRouteVariant(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");
  if (normalized === "select_bus_service" || normalized === "sbs") return "sbs";
  if (normalized === "local" || normalized === "local_bus") return "local";
  if (normalized === "local_limited" || normalized === "local_and_limited" || normalized === "limited_local" || normalized === "limited_and_local") {
    return "local_limited";
  }
  if (normalized === "limited" || normalized === "limited_stop" || normalized === "limited_stop_bus") return "limited_stop";
  if (normalized === "express" || normalized === "express_bus") return "express";
  return normalized || undefined;
}

function routeVariantFromPayload(payload: JsonObject | undefined) {
  return (
    normalizedRouteVariant(stringPayloadField(payload, "service_variant")) ??
    normalizedRouteVariant(stringPayloadField(payload, "route_type_normalized")) ??
    normalizedRouteVariant(stringPayloadField(payload, "source_route_type_phrase")) ??
    normalizedRouteVariant(stringPayloadField(payload, "route_type"))
  );
}

function routeVariantFromRecordId(recordId: string | undefined) {
  if (!recordId) return undefined;
  if (/-local-limited(?:_|$)/u.test(recordId)) return "local_limited";
  if (/-sbs(?:_|$)/u.test(recordId)) return "sbs";
  if (/-local(?:_|$)/u.test(recordId)) return "local";
  if (/-limited(?:_|$)/u.test(recordId)) return "limited_stop";
  if (/-express(?:_|$)/u.test(recordId)) return "express";
  return undefined;
}

function hasSlashCombinedRouteVariant(value: string | undefined) {
  if (!value) return false;
  const normalized = value.toLowerCase().replace(/select\s+bus\s+service/gu, "sbs");
  return (
    /\bsbs\s*\/\s*local\b|\blocal\s*\/\s*sbs\b|\bsbs\s*\/\s*limited\b|\blimited\s*\/\s*sbs\b/u.test(normalized) ||
    /\blocal\s*\/\s*(?:limited|ltd)\b|\b(?:limited|ltd)\s*\/\s*local\b/u.test(normalized)
  );
}

function hasCombinedRouteVariant(value: string | undefined) {
  if (!value) return false;
  const normalized = value.toLowerCase().replace(/select\s+bus\s+service/gu, "sbs");
  return hasSlashCombinedRouteVariant(value) || /\blocal\s*(?:and|&)\s*(?:limited|ltd)\b|\b(?:limited|ltd)\s*(?:and|&)\s*local\b/u.test(normalized);
}

function routeHasNamedShuttleContext(input: MtaSubmitObservationInput) {
  const values = [
    input.label,
    stringPayloadField(input.payload, "route_name"),
    stringPayloadField(input.payload, "route_label"),
    stringPayloadField(input.payload, "description"),
  ];
  return values.some((value) => {
    if (!value) return false;
    const normalized = value.toLowerCase();
    return (
      /\b42\s*(?:st|street)\b/u.test(normalized) ||
      normalized.includes("rockaway park") ||
      normalized.includes("franklin ave") ||
      normalized.includes("franklin avenue") ||
      normalized.includes("broad channel") ||
      normalized.includes("beach 116")
    );
  });
}

function validateRouteTargetPayload(input: MtaSubmitObservationInput, issues: string[]) {
  if (input.observation_kind !== "route") return;

  const routeIdentityValues = [
    input.label,
    stringPayloadField(input.payload, "route_id"),
    stringPayloadField(input.payload, "route_name"),
    stringPayloadField(input.payload, "route_label"),
    stringPayloadField(input.payload, "route"),
    stringPayloadField(input.payload, "branding_label"),
  ];
  if (routeIdentityValues.some(hasCombinedRouteVariant)) {
    issues.push(
      "route identity fields contain a combined service variant such as SBS/Local, Local/Limited, or Local and Limited; submit separate variant records when source-backed, or model the phrase as corridor/list context instead of one route identity",
    );
  }

  const routeId = stringPayloadField(input.payload, "route_id");
  const routeType = normalizedRouteVariant(stringPayloadField(input.payload, "route_type_normalized")) ?? normalizedRouteVariant(stringPayloadField(input.payload, "route_type"));
  if (routeId?.toUpperCase() === "S" && routeType === "shuttle" && !routeHasNamedShuttleContext(input)) {
    issues.push('route payload with route_id "S" and shuttle type must include a disambiguating route_label, route_name, or description such as 42 St Shuttle or Rockaway Park Shuttle');
  }

  if (!input.target_record_id) return;

  const targetVariant = routeVariantFromRecordId(input.target_record_id);
  const payloadVariant = routeVariantFromPayload(input.payload);
  if (!targetVariant || !payloadVariant || targetVariant === payloadVariant) return;

  issues.push(
    `route target_record_id ${input.target_record_id} implies service_variant "${targetVariant}" but payload implies "${payloadVariant}"; submit a separate route record or remove the contradictory variant instead of merging service variants`,
  );
}

function validateTablePayload(input: MtaSubmitObservationInput, issues: string[]) {
  if (input.observation_kind !== "table") return;

  issues.push(
    "table observation_kind is deprecated; cite source table/table-like blocks directly and submit substantive facts as metric_claim, claim, entity, route, corridor, project, treatment_component, or source_gap records",
  );

  const payload = input.payload ?? {};
  const bulkyFields = ["rows", "columns", "headers", "headings", "values", "members", "rows_partial_sample"];
  const present = bulkyFields.filter((field) => hasPayloadValue(payload, field));
  if (present.length > 0) {
    issues.push(
      `table payload should be a lightweight source-table anchor, not parsed table content; move facts to metric_claim/claim/entity records and cite table blocks instead of submitting: ${present.join(", ")}`,
    );
  }
}

function normalizedEntityType(payload: JsonObject | undefined) {
  return stringPayloadField(payload, "entity_type")?.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");
}

function validateEntityPayload(input: MtaSubmitObservationInput, issues: string[]) {
  if (input.observation_kind !== "entity") return;

  const entityType = normalizedEntityType(input.payload);
  const entityName = stringPayloadField(input.payload, "entity_name") ?? stringPayloadField(input.payload, "name");
  if (entityType !== "person" || !entityName || !entityName.includes("/")) return;

  issues.push(
    "entity payload.entity_name appears to contain multiple slash-delimited people; submit separate person records when supported, or model the line as source/contact context instead of one durable person identity",
  );
}

function hasPayloadValue(payload: JsonObject | undefined, field: string) {
  const value = payload?.[field];
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function hasAnyPayloadValue(payload: JsonObject | undefined, fields: string[]) {
  return fields.some((field) => hasPayloadValue(payload, field));
}

export const REQUIRED_PAYLOAD_ANCHORS: Partial<Record<MtaSubmitObservationInput["observation_kind"], string[]>> = requiredPayloadAnchors();

function validatePayloadAnchors(input: MtaSubmitObservationInput, issues: string[]) {
  const fields = REQUIRED_PAYLOAD_ANCHORS[input.observation_kind];
  if (!fields) return;

  if (!hasAnyPayloadValue(input.payload, fields)) {
    issues.push(`${input.observation_kind} payload must include at least one of: ${fields.join(", ")}`);
  }

  const payloadKeys = Object.keys(input.payload ?? {});
  if (payloadKeys.length === 1 && hasPayloadValue(input.payload, "text") && input.observation_kind !== "claim" && input.observation_kind !== "source_gap") {
    issues.push(`${input.observation_kind} payload must be structured JSON, not only an unparsed text field`);
  }
}

function validatePayloadByKind(input: MtaSubmitObservationInput, issues: string[]) {
  validatePayloadAnchors(input, issues);
  validateRelationPayload(input, issues);
  validateMetricPayload(input, issues);
  validateRouteTargetPayload(input, issues);
  validateTablePayload(input, issues);
  validateEntityPayload(input, issues);
}

export function validateSubmitInput(input: MtaSubmitObservationInput) {
  const issues: string[] = [];
  if (!input.source_id) issues.push("source_id is required");
  if (!input.local_observation_id) issues.push("local_observation_id is required");
  if (!OBSERVATION_KINDS.has(input.observation_kind)) {
    issues.push(`unsupported observation_kind: ${input.observation_kind}`);
  }
  if (!input.evidence_refs || input.evidence_refs.length === 0) {
    issues.push("evidence_refs must include at least one source block");
  }

  for (const [index, ref] of (input.evidence_refs ?? []).entries()) {
    if (!ref.source_id) issues.push(`evidence_refs[${index}].source_id is required`);
    if (!ref.block_id) {
      issues.push(`evidence_refs[${index}].block_id is required`);
    }
  }

  validateBlockEvidence(input, issues);
  validatePayloadByKind(input, issues);

  return issues;
}

export function normalizeSubmitInput(input: MtaSubmitObservationInput): MtaSubmitObservationInput {
  const observationKind = input.observation_kind;
  const payload = normalizeObservationPayload(observationKind, normalizePayload(input.payload));
  return {
    source_id: input.source_id,
    observation_kind: observationKind,
    local_observation_id: input.local_observation_id,
    target_record_id: input.target_record_id,
    create_new: input.create_new,
    label: input.label,
    raw_text: input.raw_text,
    payload,
    evidence_refs: (input.evidence_refs ?? []).map(normalizeEvidenceRef),
    ...(input.escape_justification ? { escape_justification: input.escape_justification } : {}),
  };
}

export function createSubmissionEntry(
  runId: string,
  input: MtaSubmitObservationInput,
  submittedAt = new Date().toISOString(),
  additionalIssues: string[] = [],
): MtaSubmissionEntry {
  const submittedPayload = normalizePayload(input.payload);
  const normalized = normalizeSubmitInput(input);
  const issues = [...validateSubmitInput(normalized), ...additionalIssues];
  const schemaResult = validatePayloadSchema(input.observation_kind, submittedPayload);
  const warnings = [
    ...ontologyWarningsForPayload(input.observation_kind, submittedPayload, normalized.payload),
    // Schema findings stay advisory at the journal layer; enforce mode gates at the tool boundary only.
    ...schemaResult.issues.map((issue) => `schema: ${issue}`),
    ...schemaResult.unknown_fields.map((field) => `schema: ${input.observation_kind}.${field} is not a known field; use an existing field or extra_fields`),
  ];
  const toolArgsSha256 = stableHash(normalized as unknown as JsonObject);

  return {
    submission_id: `sub_${toolArgsSha256.slice(0, 16)}`,
    run_id: runId,
    submitted_at: submittedAt,
    tool_args_sha256: `sha256:${toolArgsSha256}`,
    schema_version: PAYLOAD_SCHEMA_VERSION,
    tool_args: normalized,
    validation: {
      state: issues.length === 0 ? "accepted" : "rejected",
      issues,
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  };
}

export function appendSubmission(runId: string, input: MtaSubmitObservationInput): MtaSubmissionEntry {
  const normalized = normalizeSubmitInput(input);
  const knownLocalObservationIds = new Set(
    readSubmissionEntries()
      .filter((entry) => entry.validation.state === "accepted" && entry.tool_args.source_id === normalized.source_id)
      .map((entry) => entry.tool_args.local_observation_id),
  );
  const entry = createSubmissionEntry(runId, input, new Date().toISOString(), relationEndpointIssues(normalized, knownLocalObservationIds));
  mkdirSync(submissionsDir(), { recursive: true });
  appendFileSync(submissionPath(runId), `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export function readSubmissionEntries(): MtaSubmissionEntry[] {
  const dir = submissionsDir();
  if (!existsSync(dir)) return [];

  const entries: MtaSubmissionEntry[] = [];
  for (const fileName of readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort()) {
    const content = readFileSync(join(dir, fileName), "utf8");
    for (const [index, line] of content.split(/\r?\n/u).entries()) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as MtaSubmissionEntry);
      } catch (error) {
        throw new Error(`Invalid JSONL in data/submissions/${fileName}:${index + 1}: ${String(error)}`);
      }
    }
  }

  return entries;
}
