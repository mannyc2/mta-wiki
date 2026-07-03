import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { buildHarnessAgent, positiveIntegerEnv } from "@mta-wiki/core/agent";
import { readConfig } from "@mta-wiki/core/config";
import { selectModel, type ModelSelection } from "@mta-wiki/core/models";
import { repoRoot } from "@mta-wiki/core/paths";
import { createHarnessSession } from "@mta-wiki/core/session";
import { createTranscript, type TranscriptWriter } from "@mta-wiki/core/transcript";
import type { HarnessConfig, IdentityReviewRunManifest, IdentityReviewRunOptions } from "@mta-wiki/core/types";
import { assistantText } from "@mta-wiki/core/usage";
import { validateRepo } from "@mta-wiki/pipeline/validate";
import { identityKeysForRecord, identityPairKey, isGlobalRecordKind, readIdentityDoNotMergeOverrides } from "@mta-wiki/db/identity";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/materialize";
import { sourceBlockById } from "@mta-wiki/pipeline/sources/source-prep";
import { shortHash } from "@mta-wiki/db/stable-json";
import { readSubmissionEntries } from "@mta-wiki/pipeline/records/submissions";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaEvidenceRef, MtaValidationIssue } from "@mta-wiki/db/types";

type GlobalRecordKind = "entity" | "project" | "corridor" | "route";

export type IdentityReviewOptions = {
  limit?: number | undefined;
  include?: string | undefined;
  exclude?: string | undefined;
};

export type IdentityReviewManifest = {
  run_id: string;
  generated_at: string;
  output_dir: string;
  paths: {
    latest: string;
    records_jsonl: string;
    candidate_edges_jsonl: string;
    clusters_jsonl: string;
    validation_issues_jsonl: string;
    packets_dir: string;
    llm_suggestions_dir: string;
    accepted_dir: string;
  };
  counts: {
    total_global_records: number;
    review_records: number;
    candidate_edges: number;
    clusters: number;
    packet_count: number;
    validation_issues: number;
    duplicate_global_identity_issues: number;
    relation_endpoint_shape_issues: number;
  };
  top_clusters: Array<{
    cluster_id: string;
    kind: GlobalRecordKind;
    priority: number;
    record_count: number;
    edge_count: number;
    packet_path: string;
    review_reasons: string[];
  }>;
};

type EvidenceSample = {
  source_id: string;
  block_id?: string | undefined;
  page_number?: number | undefined;
  role?: string | undefined;
  evidence_id?: string | undefined;
  source_quote?: string | undefined;
  snippet?: string | undefined;
};

type RelationContext = {
  relation_id: string;
  relation_kind: string;
  direction: "incoming" | "outgoing";
  other_record_id?: string | undefined;
  other_record_kind?: string | undefined;
  other_display_name?: string | undefined;
  source_ids: string[];
};

type IdentityReviewRecord = {
  record_id: string;
  record_kind: GlobalRecordKind;
  display_name: string;
  source_id: string;
  source_ids: string[];
  local_observation_id: string;
  local_observation_ids: string[];
  record_aliases: string[];
  identity_keys: string[];
  source_labels: string[];
  payload_identity_fields: JsonObject;
  relation_context: RelationContext[];
  evidence_samples: EvidenceSample[];
  submission_ids: string[];
  submissions: Array<{
    submission_id: string;
    run_id: string;
    source_id: string;
    local_observation_id: string;
    target_record_id?: string | undefined;
    create_new?: boolean | undefined;
    label?: string | undefined;
  }>;
  pointers: {
    wiki_path: string;
    canonical_jsonl: string;
    canonical_db: string;
  };
};

type CandidateEdge = {
  edge_id: string;
  kind: GlobalRecordKind;
  left_record_id: string;
  right_record_id: string;
  score: number;
  sources: string[];
  signals: string[];
  negative_signals: string[];
  validation_issue_codes: string[];
  validation_messages: string[];
  shared_keys: string[];
};

type CandidateEdgeSuppressionSet = ReadonlySet<string>;

type ReviewCluster = {
  cluster_id: string;
  kind: GlobalRecordKind;
  priority: number;
  record_ids: string[];
  edge_ids: string[];
  review_reasons: string[];
  packet_path: string;
};

const IDENTITY_FIELDS_BY_KIND: Record<GlobalRecordKind, string[]> = {
  entity: [
    "entity_name",
    "name",
    "agency_name",
    "short_name",
    "acronym",
    "entity_type",
    "operator",
    "owner",
    "publisher",
    "data_source",
    "description",
  ],
  project: [
    "project_name",
    "name",
    "project_type",
    "program",
    "status",
    "description",
    "corridors",
    "routes",
    "routes_served",
    "launch_date_text",
  ],
  corridor: [
    "corridor_name",
    "name",
    "street",
    "streets",
    "limits",
    "from",
    "to",
    "borough",
    "description",
    "routes",
    "routes_served",
  ],
  route: [
    "route_id",
    "route_name",
    "route",
    "route_label",
    "routes",
    "base_route_id",
    "service_variant",
    "variant",
    "branch",
    "dataset_label",
    "description",
  ],
};

function identityReviewDir() {
  return join(repoRoot, "data", "identity-review");
}

function nowRunId(date = new Date()) {
  return `${date.toISOString().replace(/[:.]/gu, "-")}_identity-review`;
}

function nowReviewRunId(date = new Date()) {
  return `${date.toISOString().replace(/[:.]/gu, "-")}_identity-review-run`;
}

const DEFAULT_REVIEW_CONCURRENCY = 4;
const DEFAULT_REVIEW_MAX_ATTEMPTS = 2;
const DEFAULT_REVIEW_RETRY_DELAY_MS = 60_000;

function mkdir(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, value: unknown) {
  mkdir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonl(path: string, values: unknown[]) {
  mkdir(dirname(path));
  const content = values.map((value) => JSON.stringify(value)).join("\n");
  writeFileSync(path, content ? `${content}\n` : "", "utf8");
}

function readJsonl(path: string): JsonObject[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as JsonObject);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))].sort();
}

function stringValue(value: JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function valuesAsStrings(value: JsonValue | undefined): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function normalizedText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/\bselect\s+bus\s+service\b/gu, "sbs")
    .replace(/\bavenue\b/gu, "ave")
    .replace(/\bstreet\b/gu, "st")
    .replace(/\broad\b/gu, "rd")
    .replace(/\bboulevard\b/gu, "blvd")
    .replace(/[^a-z0-9+]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function compactText(value: string) {
  return normalizedText(value).replace(/\s+/gu, "");
}

function shortText(value: string, max = 320) {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function canonicalJsonlPath(kind: GlobalRecordKind) {
  const fileName =
    kind === "entity" ? "entities.jsonl" : kind === "project" ? "projects.jsonl" : kind === "corridor" ? "corridors.jsonl" : "routes.jsonl";
  return join(repoRoot, "data", "canonical", fileName);
}

function wikiPath(record: MtaCanonicalRecord) {
  if (record.record_kind === "project") return join(repoRoot, "wiki", "projects", `${record.record_id}.md`);
  if (record.record_kind === "corridor") return join(repoRoot, "wiki", "corridors", `${record.record_id}.md`);
  if (record.record_kind === "route") return join(repoRoot, "wiki", "routes", `${record.record_id}.md`);
  return join(repoRoot, "wiki", "entities", `${record.record_id}.md`);
}

function relativePath(path: string) {
  return relative(repoRoot, path).split("/").join("/");
}

function payloadIdentityFields(record: MtaCanonicalRecord): JsonObject {
  const fields = IDENTITY_FIELDS_BY_KIND[record.record_kind as GlobalRecordKind] ?? [];
  const payload = record.payload ?? {};
  const result: JsonObject = {};
  for (const field of fields) {
    const value = payload[field];
    if (value !== undefined) result[field] = value;
  }
  return result;
}

function sourceLabels(record: MtaCanonicalRecord) {
  const labels = new Set<string>();
  for (const value of [
    record.display_name,
    record.raw_text,
    record.local_observation_id,
    ...(record.local_observation_ids ?? []),
    ...(record.record_aliases ?? []),
  ]) {
    if (value) labels.add(value);
  }

  const fields = IDENTITY_FIELDS_BY_KIND[record.record_kind as GlobalRecordKind] ?? [];
  for (const field of fields) {
    const value = record.payload[field];
    const single = stringValue(value);
    if (single) labels.add(single);
    for (const item of valuesAsStrings(value)) labels.add(item);
  }

  return [...labels].sort();
}

function evidenceSamples(refs: MtaEvidenceRef[]) {
  const samples: EvidenceSample[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.source_id}#${ref.block_id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let snippet: string | undefined;
    if (ref.source_id && ref.block_id) {
      try {
        snippet = shortText(sourceBlockById(ref.source_id, ref.block_id).raw_text);
      } catch {
        snippet = undefined;
      }
    }

    samples.push({
      source_id: ref.source_id,
      block_id: ref.block_id,
      page_number: ref.page_number,
      role: ref.role,
      evidence_id: ref.evidence_id,
      source_quote: ref.source_quote,
      snippet,
    });

    if (samples.length >= 3) break;
  }
  return samples;
}

function relationKind(record: MtaCanonicalRecord) {
  return typeof record.payload.relation_kind === "string" && record.payload.relation_kind.trim() ? record.payload.relation_kind.trim() : "unknown";
}

function buildRelationContext(records: MtaCanonicalRecord[]) {
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const contexts = new Map<string, RelationContext[]>();

  for (const relation of records) {
    if (relation.record_kind !== "relation") continue;
    const subjectId = stringValue(relation.payload.subject_id);
    const objectId = stringValue(relation.payload.object_id);
    const kind = relationKind(relation);
    const sourceIds = uniqueStrings([relation.source_id, ...(relation.source_ids ?? [])]);

    if (subjectId) {
      const object = objectId ? byId.get(objectId) : undefined;
      contexts.set(subjectId, [
        ...(contexts.get(subjectId) ?? []),
        {
          relation_id: relation.record_id,
          relation_kind: kind,
          direction: "outgoing",
          other_record_id: objectId,
          other_record_kind: object?.record_kind,
          other_display_name: object?.display_name,
          source_ids: sourceIds,
        },
      ]);
    }

    if (objectId) {
      const subject = subjectId ? byId.get(subjectId) : undefined;
      contexts.set(objectId, [
        ...(contexts.get(objectId) ?? []),
        {
          relation_id: relation.record_id,
          relation_kind: kind,
          direction: "incoming",
          other_record_id: subjectId,
          other_record_kind: subject?.record_kind,
          other_display_name: subject?.display_name,
          source_ids: sourceIds,
        },
      ]);
    }
  }

  return contexts;
}

function submissionLookup() {
  const byId = new Map<string, IdentityReviewRecord["submissions"][number]>();
  for (const entry of readSubmissionEntries()) {
    byId.set(entry.submission_id, {
      submission_id: entry.submission_id,
      run_id: entry.run_id,
      source_id: entry.tool_args.source_id,
      local_observation_id: entry.tool_args.local_observation_id,
      target_record_id: entry.tool_args.target_record_id,
      create_new: entry.tool_args.create_new,
      label: entry.tool_args.label,
    });
  }
  return byId;
}

function reviewRecord(record: MtaCanonicalRecord, relationContexts: Map<string, RelationContext[]>, submissionsById: Map<string, IdentityReviewRecord["submissions"][number]>): IdentityReviewRecord {
  const kind = record.record_kind as GlobalRecordKind;
  return {
    record_id: record.record_id,
    record_kind: kind,
    display_name: record.display_name,
    source_id: record.source_id,
    source_ids: uniqueStrings([record.source_id, ...(record.source_ids ?? [])]),
    local_observation_id: record.local_observation_id,
    local_observation_ids: uniqueStrings([record.local_observation_id, ...(record.local_observation_ids ?? [])]),
    record_aliases: record.record_aliases ?? [],
    identity_keys: identityKeysForRecord(record),
    source_labels: sourceLabels(record),
    payload_identity_fields: payloadIdentityFields(record),
    relation_context: (relationContexts.get(record.record_id) ?? []).slice(0, 16),
    evidence_samples: evidenceSamples(record.evidence_refs),
    submission_ids: record.submission_ids,
    submissions: record.submission_ids.map((id) => submissionsById.get(id)).filter((entry): entry is IdentityReviewRecord["submissions"][number] => Boolean(entry)),
    pointers: {
      wiki_path: relativePath(wikiPath(record)),
      canonical_jsonl: relativePath(canonicalJsonlPath(kind)),
      canonical_db: "data/canonical.db",
    },
  };
}

function edgeId(kind: GlobalRecordKind, left: string, right: string, reason: string) {
  return `${kind}:${[left, right].sort().join("<>")}:${reason}`;
}

function suppressionKey(kind: GlobalRecordKind, left: string, right: string) {
  return `${kind}:${identityPairKey(left, right)}`;
}

function doNotMergeSuppressionSet() {
  const suppressions = new Set<string>();
  const pairs = readIdentityDoNotMergeOverrides().pairs ?? {};
  for (const [kind, entries] of Object.entries(pairs)) {
    if (!isGlobalRecordKind(kind)) continue;
    for (const entry of entries ?? []) {
      const ids = entry.record_ids;
      if (Array.isArray(ids) && ids.length === 2 && ids[0] && ids[1]) {
        suppressions.add(suppressionKey(kind, ids[0], ids[1]));
      }
    }
  }
  return suppressions;
}

function addEdge(edges: Map<string, CandidateEdge>, input: Omit<CandidateEdge, "edge_id">, suppressions?: CandidateEdgeSuppressionSet | undefined) {
  const sortedIds = [input.left_record_id, input.right_record_id].sort();
  const left = sortedIds[0];
  const right = sortedIds[1];
  if (!left || !right) return;
  if (left === right) return;
  if (suppressions?.has(suppressionKey(input.kind, left, right))) return;
  const id = edgeId(input.kind, left, right, input.signals[0] ?? "candidate");
  const previous = edges.get(id);
  if (!previous) {
    edges.set(id, {
      ...input,
      edge_id: id,
      left_record_id: left,
      right_record_id: right,
      sources: uniqueStrings(input.sources),
      signals: uniqueStrings(input.signals),
      negative_signals: uniqueStrings(input.negative_signals),
      validation_issue_codes: uniqueStrings(input.validation_issue_codes),
      validation_messages: uniqueStrings(input.validation_messages),
      shared_keys: uniqueStrings(input.shared_keys),
    });
    return;
  }

  previous.score = Math.max(previous.score, input.score);
  previous.sources = uniqueStrings([...previous.sources, ...input.sources]);
  previous.signals = uniqueStrings([...previous.signals, ...input.signals]);
  previous.negative_signals = uniqueStrings([...previous.negative_signals, ...input.negative_signals]);
  previous.validation_issue_codes = uniqueStrings([...previous.validation_issue_codes, ...input.validation_issue_codes]);
  previous.validation_messages = uniqueStrings([...previous.validation_messages, ...input.validation_messages]);
  previous.shared_keys = uniqueStrings([...previous.shared_keys, ...input.shared_keys]);
}

function parseDuplicateIssue(issue: MtaValidationIssue) {
  const match = /Global (entity|project|corridor|route) records (\S+) and (\S+) share identity key (\S+)\./u.exec(issue.message);
  if (!match) return undefined;
  return {
    kind: match[1] as GlobalRecordKind,
    left: match[2]!,
    right: match[3]!,
    key: match[4]!,
  };
}

function exactAtomicRouteBase(value: string | undefined) {
  if (!value) return undefined;
  const upper = value.toUpperCase().replace(/SELECT\s+BUS\s+SERVICE/gu, "SBS");
  if (/\//u.test(upper)) return undefined;
  if (/\bM\s*14\s*(?:A\s*D|AD)\b/u.test(upper)) return "M14-AD";

  const compact = upper.replace(/[^A-Z0-9]+/gu, "");
  if (/^(?:SIM|BX|[BMQS])\d{1,3}[A-Z]?$/.test(compact)) return compact;
  return undefined;
}

function routeVariantInfo(fields: JsonObject) {
  const variantText = uniqueStrings([
    stringValue(fields.service_variant),
    stringValue(fields.route_type_normalized),
    stringValue(fields.route_type),
    stringValue(fields.route_label),
    stringValue(fields.route_name),
  ]).join(" ");
  const upper = variantText.toUpperCase().replace(/SELECT\s+BUS\s+SERVICE/gu, "SBS");
  const normalized = normalizedText(variantText);
  const variants = uniqueStrings([
    /\bSBS\b/u.test(upper) || normalized.includes("sbs") ? "sbs" : undefined,
    /\blocal\b/u.test(normalized) ? "local" : undefined,
    /\blimited\b/u.test(normalized) ? "limited" : undefined,
    /\+/u.test(variantText) ? "plus-label" : undefined,
    /\bACE\b/u.test(upper) ? "ace-dataset" : undefined,
  ]);
  return variants;
}

export function identityReviewRouteInfoForTest(input: { source_labels: string[]; payload_identity_fields: JsonObject }) {
  const fields = input.payload_identity_fields;
  const routeId = stringValue(fields.route_id);
  const exactRouteId = exactAtomicRouteBase(routeId);
  if (routeId && !exactRouteId) return { baseRoute: undefined, variants: routeVariantInfo(fields) };

  const baseRoute =
    exactRouteId ??
    exactAtomicRouteBase(stringValue(fields.route)) ??
    exactAtomicRouteBase(stringValue(fields.route_label)) ??
    exactAtomicRouteBase(stringValue(fields.route_name)) ??
    exactAtomicRouteBase(input.source_labels.find((label) => exactAtomicRouteBase(label)));

  return { baseRoute, variants: routeVariantInfo(fields) };
}

function routeInfo(record: IdentityReviewRecord) {
  const { baseRoute, variants } = identityReviewRouteInfoForTest({
    source_labels: record.source_labels,
    payload_identity_fields: record.payload_identity_fields,
  });
  return { baseRoute, variants };
}

function corridorInfo(record: IdentityReviewRecord) {
  const fields = record.payload_identity_fields;
  const streets = valuesAsStrings(fields.streets);
  const streetValues = uniqueStrings([
    stringValue(fields.street),
    stringValue(fields.corridor_name),
    stringValue(fields.name),
    ...(streets.length === 1 ? streets : []),
  ]);
  const streetKey = streetValues.map(normalizedText).find((value) => value.length >= 3);
  const borough = stringValue(fields.borough);
  const limits = uniqueStrings([stringValue(fields.limits), stringValue(fields.from), stringValue(fields.to)]).join(" | ");
  return {
    streetKey,
    borough: borough ? normalizedText(borough) : undefined,
    limits: limits ? normalizedText(limits) : undefined,
    isAggregateStreetList: streets.length > 1,
  };
}

function communityBoardBorough(record: IdentityReviewRecord) {
  const fields = record.payload_identity_fields;
  const haystack = normalizedText(
    uniqueStrings([
      record.record_id,
      stringValue(fields.entity_name),
      stringValue(fields.name),
      stringValue(fields.short_name),
      stringValue(fields.acronym),
      stringValue(fields.description),
      ...(record.source_labels ?? []),
      ...(record.local_observation_ids ?? []),
    ]).join(" "),
  );
  if (!/\b(?:community board|cb)\s*\d+\b/u.test(haystack)) return undefined;
  if (/\bstaten island\b/u.test(haystack)) return "staten island";
  if (/\bbronx\b/u.test(haystack)) return "bronx";
  if (/\bbrooklyn\b/u.test(haystack)) return "brooklyn";
  if (/\bmanhattan\b/u.test(haystack)) return "manhattan";
  if (/\bqueens\b/u.test(haystack)) return "queens";
  return undefined;
}

function entityInfo(record: IdentityReviewRecord) {
  const fields = record.payload_identity_fields;
  const primaryNameKey = uniqueStrings([stringValue(fields.entity_name), stringValue(fields.name), stringValue(fields.short_name), stringValue(fields.acronym)])
    .map(compactText)
    .find((value) => value.length >= 3);
  const agencyFallbackNameKey = stringValue(fields.agency_name) ? compactText(stringValue(fields.agency_name)!) : undefined;
  return {
    entityType: stringValue(fields.entity_type),
    communityBoardBorough: communityBoardBorough(record),
    nameKey: primaryNameKey ?? (agencyFallbackNameKey && agencyFallbackNameKey.length >= 3 ? agencyFallbackNameKey : undefined),
  };
}

function projectInfo(record: IdentityReviewRecord) {
  const fields = record.payload_identity_fields;
  return {
    nameKey: uniqueStrings([stringValue(fields.project_name), stringValue(fields.name)])
      .map(compactText)
      .find((value) => value.length >= 4),
  };
}

function pairRecords(records: IdentityReviewRecord[], callback: (left: IdentityReviewRecord, right: IdentityReviewRecord) => void) {
  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      callback(records[i]!, records[j]!);
    }
  }
}

function candidateEdges(records: IdentityReviewRecord[], validationIssues: MtaValidationIssue[], suppressions: CandidateEdgeSuppressionSet = doNotMergeSuppressionSet()) {
  const edges = new Map<string, CandidateEdge>();
  const byId = new Map(records.map((record) => [record.record_id, record]));

  for (const issue of validationIssues) {
    const duplicate = issue.code === "duplicate_global_identity" ? parseDuplicateIssue(issue) : undefined;
    if (!duplicate) continue;
    addEdge(edges, {
      kind: duplicate.kind,
      left_record_id: duplicate.left,
      right_record_id: duplicate.right,
      score: 100,
      sources: [byId.get(duplicate.left)?.source_id, byId.get(duplicate.right)?.source_id].filter((source): source is string => Boolean(source)),
      signals: [`validator_duplicate_identity:${duplicate.key}`],
      negative_signals: [],
      validation_issue_codes: [issue.code],
      validation_messages: [issue.message],
      shared_keys: [duplicate.key],
    }, suppressions);
  }

  const byKind: Partial<Record<GlobalRecordKind, IdentityReviewRecord[]>> = {};
  for (const record of records) {
    byKind[record.record_kind] = [...(byKind[record.record_kind] ?? []), record];
  }

  pairRecords(byKind.route ?? [], (left, right) => {
    const leftInfo = routeInfo(left);
    const rightInfo = routeInfo(right);
    if (!leftInfo.baseRoute || leftInfo.baseRoute !== rightInfo.baseRoute) return;
    const sameVariants = leftInfo.variants.some((variant) => rightInfo.variants.includes(variant));
    const negative = sameVariants ? [] : [`variant mismatch or missing variant: ${leftInfo.variants.join(",") || "unknown"} vs ${rightInfo.variants.join(",") || "unknown"}`];
    addEdge(edges, {
      kind: "route",
      left_record_id: left.record_id,
      right_record_id: right.record_id,
      score: sameVariants ? 80 : 55,
      sources: [...left.source_ids, ...right.source_ids],
      signals: [`shared_base_route:${leftInfo.baseRoute}`],
      negative_signals: negative,
      validation_issue_codes: [],
      validation_messages: [],
      shared_keys: [`route_base:${leftInfo.baseRoute}`],
    }, suppressions);
  });

  pairRecords(byKind.corridor ?? [], (left, right) => {
    const leftInfo = corridorInfo(left);
    const rightInfo = corridorInfo(right);
    if (leftInfo.isAggregateStreetList || rightInfo.isAggregateStreetList) return;
    if (!leftInfo.streetKey || leftInfo.streetKey !== rightInfo.streetKey) return;
    const negative = uniqueStrings([
      leftInfo.borough && rightInfo.borough && leftInfo.borough !== rightInfo.borough ? `different boroughs: ${leftInfo.borough} vs ${rightInfo.borough}` : undefined,
      leftInfo.limits && rightInfo.limits && leftInfo.limits !== rightInfo.limits ? "different or partially different limits" : undefined,
    ]);
    if (negative.length > 0) return;
    addEdge(edges, {
      kind: "corridor",
      left_record_id: left.record_id,
      right_record_id: right.record_id,
      score: 75,
      sources: [...left.source_ids, ...right.source_ids],
      signals: [`shared_corridor_street:${leftInfo.streetKey}`],
      negative_signals: [],
      validation_issue_codes: [],
      validation_messages: [],
      shared_keys: [`corridor_street:${leftInfo.streetKey}`],
    }, suppressions);
  });

  pairRecords(byKind.entity ?? [], (left, right) => {
    const leftInfo = entityInfo(left);
    const rightInfo = entityInfo(right);
    if (!leftInfo.nameKey || leftInfo.nameKey !== rightInfo.nameKey) return;
    if (leftInfo.communityBoardBorough && rightInfo.communityBoardBorough && leftInfo.communityBoardBorough !== rightInfo.communityBoardBorough) return;
    const negative = leftInfo.entityType && rightInfo.entityType && leftInfo.entityType !== rightInfo.entityType ? [`different entity_type: ${leftInfo.entityType} vs ${rightInfo.entityType}`] : [];
    addEdge(edges, {
      kind: "entity",
      left_record_id: left.record_id,
      right_record_id: right.record_id,
      score: negative.length > 0 ? 60 : 85,
      sources: [...left.source_ids, ...right.source_ids],
      signals: [`shared_entity_name:${leftInfo.nameKey}`],
      negative_signals: negative,
      validation_issue_codes: [],
      validation_messages: [],
      shared_keys: [`entity_name:${leftInfo.nameKey}`],
    }, suppressions);
  });

  pairRecords(byKind.project ?? [], (left, right) => {
    const leftInfo = projectInfo(left);
    const rightInfo = projectInfo(right);
    if (leftInfo.nameKey && leftInfo.nameKey === rightInfo.nameKey) {
      addEdge(edges, {
        kind: "project",
        left_record_id: left.record_id,
        right_record_id: right.record_id,
        score: 85,
        sources: [...left.source_ids, ...right.source_ids],
        signals: [`shared_project_name:${leftInfo.nameKey}`],
        negative_signals: [],
        validation_issue_codes: [],
        validation_messages: [],
        shared_keys: [`project_name:${leftInfo.nameKey}`],
      }, suppressions);
    }
  });

  return [...edges.values()].sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind) || a.left_record_id.localeCompare(b.left_record_id));
}

export function identityReviewCandidateEdgesForTest(
  records: Array<Pick<IdentityReviewRecord, "record_id" | "record_kind" | "source_ids" | "payload_identity_fields"> & { source_labels?: string[] }>,
  suppressions: CandidateEdgeSuppressionSet = new Set(),
) {
  return candidateEdges(records.map((record) => ({ ...record, source_labels: record.source_labels ?? [] })) as IdentityReviewRecord[], [], suppressions);
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  add(value: string) {
    if (!this.parent.has(value)) this.parent.set(value, value);
  }

  find(value: string): string {
    this.add(value);
    const parent = this.parent.get(value)!;
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    const [root, child] = [leftRoot, rightRoot].sort();
    this.parent.set(child!, root!);
  }
}

function clusters(records: IdentityReviewRecord[], edges: CandidateEdge[], packetsDir: string, limit: number | undefined) {
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const byEdgeId = new Map(edges.map((edge) => [edge.edge_id, edge]));
  const uf = new UnionFind();

  for (const edge of edges) {
    uf.union(edge.left_record_id, edge.right_record_id);
  }

  const recordIdsWithEdges = new Set(edges.flatMap((edge) => [edge.left_record_id, edge.right_record_id]));
  const buckets = new Map<string, Set<string>>();
  for (const id of recordIdsWithEdges) {
    const root = uf.find(id);
    buckets.set(root, new Set([...(buckets.get(root) ?? []), id]));
  }

  const built = [...buckets.values()]
    .map((ids) => {
      const recordIds = [...ids].sort();
      const kind = byId.get(recordIds[0]!)?.record_kind ?? "entity";
      const clusterEdges = edges.filter((edge) => ids.has(edge.left_record_id) && ids.has(edge.right_record_id));
      const validationEdgeCount = clusterEdges.filter((edge) => edge.validation_issue_codes.length > 0).length;
      const priority = validationEdgeCount * 100 + clusterEdges.reduce((sum, edge) => sum + edge.score, 0) + recordIds.length;
      const reviewReasons = uniqueStrings([
        ...clusterEdges.flatMap((edge) => edge.validation_issue_codes.map((code) => `validator:${code}`)),
        ...clusterEdges.flatMap((edge) => edge.signals),
        ...clusterEdges.flatMap((edge) => edge.negative_signals.map((signal) => `negative:${signal}`)),
      ]).slice(0, 20);
      return {
        kind,
        priority,
        record_ids: recordIds,
        edge_ids: clusterEdges.map((edge) => edge.edge_id).sort(),
        review_reasons: reviewReasons,
      };
    })
    .sort((a, b) => b.priority - a.priority || a.kind.localeCompare(b.kind) || a.record_ids[0]!.localeCompare(b.record_ids[0]!));

  const selected = limit ? built.slice(0, Math.max(1, limit)) : built;
  return selected.map((cluster): ReviewCluster => {
    // Content-derived id: stable across regenerations so suggestion/decision artifacts keyed by
    // cluster_id stay valid and re-runs dedupe, unlike the old positional route_cluster_001 ids.
    const clusterId = `${cluster.kind}_cluster_${shortHash(cluster.record_ids, 10)}`;
    const packetPath = join(packetsDir, `${clusterId}.md`);
    return {
      cluster_id: clusterId,
      kind: cluster.kind,
      priority: cluster.priority,
      record_ids: cluster.record_ids,
      edge_ids: cluster.edge_ids.filter((id) => byEdgeId.has(id)),
      review_reasons: cluster.review_reasons,
      packet_path: relativePath(packetPath),
    };
  });
}

function jsonBlock(value: unknown) {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

function packetMarkdown(cluster: ReviewCluster, recordMap: Map<string, IdentityReviewRecord>, edgeMap: Map<string, CandidateEdge>) {
  const records = cluster.record_ids.map((id) => recordMap.get(id)).filter((record): record is IdentityReviewRecord => Boolean(record));
  const edges = cluster.edge_ids.map((id) => edgeMap.get(id)).filter((edge): edge is CandidateEdge => Boolean(edge));

  const lines: string[] = [
    "# Identity Review Packet",
    "",
    `cluster_id: ${cluster.cluster_id}`,
    `kind: ${cluster.kind}`,
    `priority: ${cluster.priority}`,
    "",
    "## Review Reasons",
    "",
    ...cluster.review_reasons.map((reason) => `- ${reason}`),
    "",
    "## Records",
    "",
  ];

  for (const record of records) {
    lines.push(
      `### ${record.record_id}`,
      "",
      `display_name: ${record.display_name}`,
      `wiki_path: ${record.pointers.wiki_path}`,
      `canonical_jsonl: ${record.pointers.canonical_jsonl}`,
      `source_ids: ${record.source_ids.join(", ")}`,
      `local_observation_ids: ${record.local_observation_ids.join(", ")}`,
      `record_aliases: ${record.record_aliases.join(", ") || "(none)"}`,
      "",
      "payload_identity_fields:",
      jsonBlock(record.payload_identity_fields),
      "",
      "source_labels:",
      ...record.source_labels.slice(0, 24).map((label) => `- ${label}`),
      "",
      "identity_keys:",
      ...record.identity_keys.slice(0, 32).map((key) => `- ${key}`),
      "",
      "relation_context:",
      jsonBlock(record.relation_context.slice(0, 10)),
      "",
      "evidence_samples:",
      jsonBlock(record.evidence_samples),
      "",
      "submission_pointers:",
      jsonBlock(record.submissions.slice(0, 10)),
      "",
    );
  }

  lines.push("## Candidate Edges", "", jsonBlock(edges), "");
  lines.push(
    "## Reviewer Task",
    "",
    "Use the record pointers above to fetch more context if needed. Expected context tools can read wiki paths, canonical JSONL records, submission ids, and source evidence blocks by `source_id` plus `block_id`. Return JSON only. Do not invent facts beyond the provided records and fetched context.",
    "",
    "Classify each record pair or group as one of:",
    "",
    "- `merge`: records are the same canonical identity.",
    "- `do_not_merge`: records are lookalikes or related but distinct.",
    "- `ambiguous`: more source context or reviewer judgment is needed.",
    "",
    "When recommending merge or do-not-merge, explain whether the decisive evidence is a strong identity field, source label, local id, relation context, or missing scope.",
    "",
    "Expected JSON shape:",
    jsonBlock({
      cluster_id: cluster.cluster_id,
      kind: cluster.kind,
      merge_groups: [["record_a", "record_b"]],
      do_not_merge: [
        {
          record_ids: ["record_a", "record_b"],
          reason: "Shared broad label is insufficient because ...",
        },
      ],
      weak_aliases: [
        {
          record_id: "record_a",
          aliases: ["source literal"],
          reason: "Useful for search, not merge authority.",
        },
      ],
      missing_fields: [
        {
          record_id: "record_a",
          fields: ["borough", "limits"],
        },
      ],
      ambiguous: [
        {
          record_ids: ["record_a", "record_b"],
          needed_context: ["specific evidence refs or wiki pages to fetch"],
        },
      ],
      suggested_rules: ["Generalizable identity rule, if any."],
      confidence: "low|medium|high",
      rationale: "Short rationale.",
    }),
    "",
  );

  return lines.join("\n");
}

function reviewReadme(manifest: IdentityReviewManifest) {
  return [
    "# Identity Review Artifacts",
    "",
    "This directory is generated by `bun packages/cli/src/cli.ts identity-review`.",
    "",
    "LLMs may use these files to suggest merges, do-not-merge rules, weak aliases, and missing identity fields. Model suggestions should be written under `llm-suggestions/` and reviewed before anything is promoted into `accepted/` or `data/identity-overrides/`.",
    "",
    "Important files:",
    "",
    `- \`${manifest.paths.records_jsonl}\`: identity-relevant global records included in current review clusters.`,
    `- \`${manifest.paths.candidate_edges_jsonl}\`: deterministic candidate pair signals.`,
    `- \`${manifest.paths.clusters_jsonl}\`: connected candidate clusters.`,
    `- \`${manifest.paths.validation_issues_jsonl}\`: validator issues at generation time.`,
    `- \`${manifest.paths.packets_dir}/\`: compact Markdown packets for LLM review.`,
    `- \`${manifest.paths.llm_suggestions_dir}/\`: suggested model outputs, not automatically trusted.`,
    `- \`${manifest.paths.accepted_dir}/\`: reviewer-approved merge/do-not-merge artifacts.`,
    "",
    "Review contract:",
    "",
    "- LLMs suggest only.",
    "- Deterministic code and human-reviewed override files decide canonical identity.",
    "- Local observation ids and source labels are provenance/search context unless explicitly promoted by reviewed rules.",
    "",
    "LLM review runner:",
    "",
    "- Run `bun packages/cli/src/cli.ts identity-review-run --concurrency 4` to review packets with isolated model sessions.",
    "- The runner writes one suggestion envelope per packet under `llm-suggestions/` and a batch manifest under `llm-suggestions/review-runs/`.",
    "- Re-run with `--force` to replace existing packet suggestions.",
    "",
  ].join("\n");
}

function includeCluster(cluster: ReviewCluster, recordsById: Map<string, IdentityReviewRecord>, include: RegExp | undefined, exclude: RegExp | undefined) {
  const haystack = [
    cluster.cluster_id,
    cluster.kind,
    ...cluster.review_reasons,
    ...cluster.record_ids,
    ...cluster.record_ids.flatMap((id) => {
      const record = recordsById.get(id);
      return record ? [record.display_name, ...record.source_ids, ...record.source_labels] : [];
    }),
  ].join("\n");

  if (include && !include.test(haystack)) return false;
  if (exclude && exclude.test(haystack)) return false;
  return true;
}

type IdentityReviewPacket = {
  cluster_id: string;
  kind: GlobalRecordKind;
  priority: number;
  packet_path: string;
  record_ids: string[];
  review_reasons: string[];
};

function readReviewClusters(): ReviewCluster[] {
  const clustersPath = join(identityReviewDir(), "clusters.jsonl");
  if (!existsSync(clustersPath)) {
    throw new Error("Identity review clusters are missing. Run `bun packages/cli/src/cli.ts identity-review` first.");
  }

  return readFileSync(clustersPath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ReviewCluster);
}

function normalizePacketSubject(value: string) {
  return basename(value).replace(/\.md$/u, "");
}

function includeReviewPacket(packet: IdentityReviewPacket, subject: string | undefined, include: RegExp | undefined, exclude: RegExp | undefined) {
  if (subject) {
    const normalizedSubject = normalizePacketSubject(subject);
    const normalizedPacket = normalizePacketSubject(packet.packet_path);
    if (normalizedSubject !== packet.cluster_id && normalizedSubject !== normalizedPacket) return false;
  }

  const haystack = [packet.cluster_id, packet.kind, packet.packet_path, ...packet.record_ids, ...packet.review_reasons].join("\n");
  if (include && !include.test(haystack)) return false;
  if (exclude && exclude.test(haystack)) return false;
  return true;
}

function identityReviewPackets(options: IdentityReviewRunOptions): IdentityReviewPacket[] {
  const include = options.include ? new RegExp(options.include, "iu") : undefined;
  const exclude = options.exclude ? new RegExp(options.exclude, "iu") : undefined;
  const packets = readReviewClusters()
    .map((cluster): IdentityReviewPacket => ({
      cluster_id: cluster.cluster_id,
      kind: cluster.kind,
      priority: cluster.priority,
      packet_path: cluster.packet_path,
      record_ids: cluster.record_ids,
      review_reasons: cluster.review_reasons,
    }))
    .filter((packet) => includeReviewPacket(packet, options.subject, include, exclude));

  return options.limit ? packets.slice(0, options.limit) : packets;
}

const MERGE_CANON_PATH = "docs/identity-merge-canon.md";

function mergeCanonText() {
  const canonPath = join(repoRoot, MERGE_CANON_PATH);
  if (!existsSync(canonPath)) {
    throw new Error(`Identity merge canon is missing at ${MERGE_CANON_PATH}; it is required for identity review.`);
  }
  return readFileSync(canonPath, "utf8").trim();
}

function identityReviewSystemPrompt(_config: HarnessConfig) {
  return [
    "You review generated MTA wiki global-identity candidates.",
    "Your job is to classify whether records in one packet are the same canonical identity, related but distinct, weak aliases, or ambiguous.",
    "Use only the packet text. Do not use external knowledge.",
    "The packet includes the record identity fields, aliases, source labels, relation context, evidence samples, and review reasons needed for the decision.",
    "Do not modify files, canonical JSONL, wiki pages, submissions, overrides, or accepted review artifacts.",
    `Decide every merge/do-not-merge strictly by the merge canon below (from \`${MERGE_CANON_PATH}\`). Cite the decisive rule and identity field in each decision's reason/rationale.`,
    mergeCanonText(),
    "Return JSON only. No Markdown fences, commentary, or prose outside the JSON object.",
  ].join("\n\n");
}

function identityReviewPrompt(packetPath: string, packetText: string) {
  return `Review this identity packet and return the requested JSON only.

Packet path: \`${packetPath}\`

\`\`\`markdown
${packetText.trimEnd()}
\`\`\`
`;
}

function packetRunSummary(packet: IdentityReviewPacket, selection: ModelSelection, dryRun: boolean, sessionPath: string, suggestionPath: string) {
  return `# identity-review-run ${packet.cluster_id}

- Packet: \`${packet.packet_path}\`
- Kind: \`${packet.kind}\`
- Profile: \`${selection.profileName}\`
- Model: \`${selection.model.provider}/${selection.model.id}\`
- Dry run: \`${dryRun}\`
- Suggestion: \`${relativePath(suggestionPath)}\`
- Session: \`${relative(repoRoot, sessionPath)}\`
`;
}

function parseJsonResponse(text: string) {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

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

async function buildIdentityReviewAgent(config: HarnessConfig, selection: ModelSelection, transcript: TranscriptWriter) {
  const bundle = await createHarnessSession(config, transcript.runId);
  return buildHarnessAgent({
    selection,
    transcript,
    bundle,
    tools: [],
    systemPrompt: identityReviewSystemPrompt(config),
  });
}

function suggestionPathFor(packet: IdentityReviewPacket) {
  return join(identityReviewDir(), "llm-suggestions", `${packet.cluster_id}.json`);
}

export function identityReviewSuggestionState(path: string): "missing" | "valid" | "retryable" {
  if (!existsSync(path)) return "missing";
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as JsonValue;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "retryable";
    const envelope = parsed as JsonObject;
    if (envelope.parse_error) return "retryable";
    const suggestion = envelope.suggestion;
    if (!suggestion || typeof suggestion !== "object" || Array.isArray(suggestion)) return "retryable";
    return "valid";
  } catch {
    return "retryable";
  }
}

function retryableIdentityReviewError(message: string | undefined, rawResponse: string | undefined) {
  const text = [message, rawResponse].filter(Boolean).join("\n").toLowerCase();
  return (
    text.length === 0 ||
    text.includes("429") ||
    text.includes("rate limit") ||
    text.includes("timeout") ||
    text.includes("temporar") ||
    text.includes("overloaded") ||
    text.includes("status code") ||
    text.includes("response did not contain parseable json") ||
    text.includes("unexpected end of json input") ||
    text.includes("unexpected end of input")
  );
}

function reviewMaxAttempts(options: IdentityReviewRunOptions) {
  return options.maxAttempts ?? positiveIntegerEnv("MTA_IDENTITY_REVIEW_MAX_ATTEMPTS") ?? DEFAULT_REVIEW_MAX_ATTEMPTS;
}

function reviewRetryDelayMs() {
  return positiveIntegerEnv("MTA_IDENTITY_REVIEW_RETRY_DELAY_MS") ?? DEFAULT_REVIEW_RETRY_DELAY_MS;
}

async function runOneIdentityReviewPacket(
  packet: IdentityReviewPacket,
  config: HarnessConfig,
  selection: ModelSelection,
  runId: string,
  options: IdentityReviewRunOptions,
): Promise<IdentityReviewRunManifest["results"][number]> {
  const suggestionPath = suggestionPathFor(packet);
  const existing = identityReviewSuggestionState(suggestionPath);
  if (existing === "valid" && !options.force) {
    return {
      cluster_id: packet.cluster_id,
      packet_path: packet.packet_path,
      suggestion_path: relativePath(suggestionPath),
      status: "skipped",
      error: "suggestion already exists; pass --force to replace it",
    };
  }

  const packetAbsolutePath = resolve(repoRoot, packet.packet_path);
  const packetText = readFileSync(packetAbsolutePath, "utf8");
  const prompt = identityReviewPrompt(packet.packet_path, packetText);
  const maxAttempts = reviewMaxAttempts(options);
  const retryDelayMs = reviewRetryDelayMs();
  let lastFailure: IdentityReviewRunManifest["results"][number] | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const transcriptSubject = attempt === 1 ? packet.cluster_id : `${packet.cluster_id}_retry-${attempt}`;
    const transcript = createTranscript(config, "identity-review-run", transcriptSubject, options.dryRun);
    const { agent, sessionPath } = await buildIdentityReviewAgent(config, selection, transcript);
    transcript.writeSummary(packetRunSummary(packet, selection, options.dryRun, sessionPath, suggestionPath));

    if (options.dryRun) {
      transcript.writeResponse(`Dry run prepared for ${packet.cluster_id}.

Prompt:

${prompt}
`);
      return {
        cluster_id: packet.cluster_id,
        packet_path: packet.packet_path,
        suggestion_path: relativePath(suggestionPath),
        transcript_dir: relative(repoRoot, transcript.runDir),
        session_path: relative(repoRoot, sessionPath),
        status: "planned",
        attempts: attempt,
      };
    }

    let responseText = "";
    let parsed: JsonValue | undefined;
    let parseError: string | undefined;
    try {
      responseText = assistantText(await agent.prompt(prompt));
      transcript.writeResponse(responseText);
      parsed = parseJsonResponse(responseText);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
      if (!responseText) transcript.writeResponse(`[identity-review failed before parseable response] ${parseError}`);
    }

    const envelope = {
      review_run_id: runId,
      reviewed_at: new Date().toISOString(),
      packet_path: packet.packet_path,
      cluster_id: packet.cluster_id,
      kind: packet.kind,
      profile_name: selection.profileName,
      provider: selection.model.provider,
      model: selection.model.id,
      attempt,
      max_attempts: maxAttempts,
      suggestion: parsed,
      parse_error: parseError,
      raw_response: parseError ? responseText : undefined,
      transcript_dir: relative(repoRoot, transcript.runDir),
      session_path: relative(repoRoot, sessionPath),
    };

    writeJson(suggestionPath, envelope);
    transcript.writeSummary(packetRunSummary(packet, selection, options.dryRun, sessionPath, suggestionPath));

    if (!parseError) {
      return {
        cluster_id: packet.cluster_id,
        packet_path: packet.packet_path,
        suggestion_path: relativePath(suggestionPath),
        transcript_dir: relative(repoRoot, transcript.runDir),
        session_path: relative(repoRoot, sessionPath),
        status: "completed",
        attempts: attempt,
      };
    }

    lastFailure = {
      cluster_id: packet.cluster_id,
      packet_path: packet.packet_path,
      suggestion_path: relativePath(suggestionPath),
      transcript_dir: relative(repoRoot, transcript.runDir),
      session_path: relative(repoRoot, sessionPath),
      status: "failed",
      attempts: attempt,
      error: `Suggestion JSON parse error: ${parseError}`,
    };

    if (attempt < maxAttempts && retryableIdentityReviewError(parseError, responseText)) {
      await sleep(retryDelayMs);
      continue;
    }

    return lastFailure;
  }

  return lastFailure ?? {
    cluster_id: packet.cluster_id,
    packet_path: packet.packet_path,
    suggestion_path: relativePath(suggestionPath),
    status: "failed",
    attempts: maxAttempts,
    error: "Identity review exhausted attempts without a completed suggestion.",
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

export async function runIdentityReviewPackets(options: IdentityReviewRunOptions): Promise<IdentityReviewRunManifest> {
  const config = readConfig();
  const selection = selectModel(config, options);
  const generatedAt = new Date().toISOString();
  const runId = nowReviewRunId(new Date(generatedAt));
  const suggestionsDir = join(identityReviewDir(), "llm-suggestions");
  const reviewRunsDir = join(suggestionsDir, "review-runs");
  const manifestPath = join(reviewRunsDir, `${runId}.json`);
  const latestPath = join(reviewRunsDir, "latest.json");
  const packets = identityReviewPackets(options);
  const concurrency = options.concurrency ?? positiveIntegerEnv("MTA_IDENTITY_REVIEW_CONCURRENCY") ?? DEFAULT_REVIEW_CONCURRENCY;

  mkdir(suggestionsDir);
  mkdir(reviewRunsDir);

  if (packets.length === 0) {
    throw new Error("No identity review packets matched the requested filters.");
  }

  const results = await mapWithConcurrency(packets, concurrency, async (packet) => {
    try {
      return await runOneIdentityReviewPacket(packet, config, selection, runId, options);
    } catch (error) {
      return {
        cluster_id: packet.cluster_id,
        packet_path: packet.packet_path,
        suggestion_path: relativePath(suggestionPathFor(packet)),
        status: "failed" as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const manifest: IdentityReviewRunManifest = {
    run_id: runId,
    generated_at: generatedAt,
    dry_run: options.dryRun,
    profile_name: selection.profileName,
    provider: selection.model.provider,
    model: selection.model.id,
    concurrency,
    packet_count: results.length,
    completed: results.filter((result) => result.status === "completed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    paths: {
      suggestions_dir: relativePath(suggestionsDir),
      review_runs_dir: relativePath(reviewRunsDir),
      manifest: relativePath(manifestPath),
      latest: relativePath(latestPath),
    },
    results,
  };

  writeJson(manifestPath, manifest);
  writeJson(latestPath, manifest);

  return manifest;
}

export function generateIdentityReview(options: IdentityReviewOptions = {}): IdentityReviewManifest {
  const generatedAt = new Date().toISOString();
  const runId = nowRunId(new Date(generatedAt));
  const outputDir = identityReviewDir();
  const packetsDir = join(outputDir, "packets");
  const llmSuggestionsDir = join(outputDir, "llm-suggestions");
  const acceptedDir = join(outputDir, "accepted");

  mkdir(packetsDir);
  mkdir(llmSuggestionsDir);
  mkdir(acceptedDir);

  const canonicalRecords = readCanonicalRecords();
  const validation = validateRepo();
  const relationContexts = buildRelationContext(canonicalRecords);
  const submissionsById = submissionLookup();
  const globalRecords = canonicalRecords
    .filter((record) => isGlobalRecordKind(record.record_kind))
    .map((record) => reviewRecord(record, relationContexts, submissionsById));

  const edges = candidateEdges(globalRecords, validation.issues);
  const recordsById = new Map(globalRecords.map((record) => [record.record_id, record]));
  const include = options.include ? new RegExp(options.include, "iu") : undefined;
  const exclude = options.exclude ? new RegExp(options.exclude, "iu") : undefined;
  const selectedClusters = clusters(globalRecords, edges, packetsDir, options.limit).filter((cluster) => includeCluster(cluster, recordsById, include, exclude));
  const selectedRecordIds = new Set(selectedClusters.flatMap((cluster) => cluster.record_ids));
  const selectedEdgeIds = new Set(selectedClusters.flatMap((cluster) => cluster.edge_ids));
  const selectedRecords = globalRecords.filter((record) => selectedRecordIds.has(record.record_id));
  const selectedEdges = edges.filter((edge) => selectedEdgeIds.has(edge.edge_id));
  const selectedValidationIssues = validation.issues.filter((issue) => {
    if (issue.code !== "duplicate_global_identity") return true;
    const duplicate = parseDuplicateIssue(issue);
    return duplicate ? selectedRecordIds.has(duplicate.left) || selectedRecordIds.has(duplicate.right) : true;
  });

  for (const existingPacket of existsSync(packetsDir) ? readdirSync(packetsDir).filter((name) => name.endsWith(".md")) : []) {
    unlinkSync(join(packetsDir, existingPacket));
  }

  const edgeMap = new Map(selectedEdges.map((edge) => [edge.edge_id, edge]));
  for (const cluster of selectedClusters) {
    writeFileSync(join(repoRoot, cluster.packet_path), packetMarkdown(cluster, recordsById, edgeMap), "utf8");
  }

  const recordsPath = join(outputDir, "records.jsonl");
  const edgesPath = join(outputDir, "candidate_edges.jsonl");
  const clustersPath = join(outputDir, "clusters.jsonl");
  const validationPath = join(outputDir, "validation_issues.jsonl");
  const latestPath = join(outputDir, "latest.json");

  writeJsonl(recordsPath, selectedRecords);
  writeJsonl(edgesPath, selectedEdges);
  writeJsonl(clustersPath, selectedClusters);
  writeJsonl(validationPath, selectedValidationIssues);

  const manifest: IdentityReviewManifest = {
    run_id: runId,
    generated_at: generatedAt,
    output_dir: relativePath(outputDir),
    paths: {
      latest: relativePath(latestPath),
      records_jsonl: relativePath(recordsPath),
      candidate_edges_jsonl: relativePath(edgesPath),
      clusters_jsonl: relativePath(clustersPath),
      validation_issues_jsonl: relativePath(validationPath),
      packets_dir: relativePath(packetsDir),
      llm_suggestions_dir: relativePath(llmSuggestionsDir),
      accepted_dir: relativePath(acceptedDir),
    },
    counts: {
      total_global_records: globalRecords.length,
      review_records: selectedRecords.length,
      candidate_edges: selectedEdges.length,
      clusters: selectedClusters.length,
      packet_count: selectedClusters.length,
      validation_issues: selectedValidationIssues.length,
      duplicate_global_identity_issues: validation.issues.filter((issue) => issue.code === "duplicate_global_identity").length,
      relation_endpoint_shape_issues: validation.issues.filter((issue) => issue.code === "unexpected_relation_endpoint_shape").length,
    },
    top_clusters: selectedClusters.slice(0, 20).map((cluster) => ({
      cluster_id: cluster.cluster_id,
      kind: cluster.kind,
      priority: cluster.priority,
      record_count: cluster.record_ids.length,
      edge_count: cluster.edge_ids.length,
      packet_path: cluster.packet_path,
      review_reasons: cluster.review_reasons,
    })),
  };

  writeJson(latestPath, manifest);
  writeFileSync(join(outputDir, "README.md"), reviewReadme(manifest), "utf8");

  // Read back once in development catches accidental non-JSONL output before the CLI reports success.
  readJsonl(recordsPath);
  readJsonl(edgesPath);
  readJsonl(clustersPath);
  readJsonl(validationPath);

  return manifest;
}
