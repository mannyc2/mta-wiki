import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { derivedRelationCoverage, type DerivedRelationCoverage } from "@mta-wiki/pipeline/records/derived-relations";
import { identityDoNotMergeSuppressed } from "@mta-wiki/db/identity";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import { normalizeRelationKind } from "@mta-wiki/pipeline/records/relations";
import { sourceBlockById } from "@mta-wiki/pipeline/sources/source-prep";
import { readSubmissionEntries } from "@mta-wiki/pipeline/records/submissions";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaEvidenceRef, MtaObservationKind, MtaSubmissionEntry } from "@mta-wiki/db/types";

export type OntologyAgentId =
  | "route-service-identity"
  | "project-corridor-spatial"
  | "entity-source-role"
  | "metric-claim-ontology"
  | "relation-ontology"
  | "lifecycle-intervention-taxonomy"
  | "source-gap-resolution";

export type OntologyReviewOptions = {
  subject?: string | undefined;
  limit?: number | undefined;
  include?: string | undefined;
  exclude?: string | undefined;
};

export type OntologyAgentDefinition = {
  agent_id: OntologyAgentId;
  name: string;
  purpose: string;
  owns: string[];
  decision_contract: string[];
};

export type OntologyReviewCandidate = {
  candidate_id: string;
  agent_id: OntologyAgentId;
  category: string;
  priority: number;
  title: string;
  reasons: string[];
  decision_options: string[];
  record_kind?: MtaObservationKind | undefined;
  record_id?: string | undefined;
  record_ids?: string[] | undefined;
  field?: string | undefined;
  value?: string | undefined;
  count?: number | undefined;
  source_ids?: string[] | undefined;
  examples?: JsonObject[] | undefined;
  data?: JsonObject | undefined;
};

export type OntologyReviewManifest = {
  run_id: string;
  generated_at: string;
  output_dir: string;
  selected_agents: OntologyAgentId[];
  paths: {
    latest: string;
    candidates_jsonl: string;
    packets_dir: string;
    agents_json: string;
    readme: string;
  };
  counts: {
    agents: number;
    candidates: number;
    canonical_records: number;
    submissions: number;
    accepted_submissions: number;
    rejected_submissions: number;
  };
  agents: Array<{
    agent_id: OntologyAgentId;
    name: string;
    candidate_count: number;
    packet_path: string;
    top_categories: Record<string, number>;
  }>;
};

type IdentityCluster = {
  cluster_id: string;
  kind: "entity" | "project" | "corridor" | "route";
  priority: number;
  record_ids: string[];
  review_reasons: string[];
  packet_path?: string | undefined;
};

type SchemaAuditField = {
  field: string;
  accepted_occurrences: number;
  canonical_occurrences: number;
  canonical_distinct_string_values: number;
  classification: string;
  canonical_value_kind: string;
  accepted_coverage: number;
  canonical_coverage: number;
  canonical_sample_values?: string[] | undefined;
};

type SchemaAuditKind = {
  observation_kind: string;
  fields: SchemaAuditField[];
};

const AGENTS: OntologyAgentDefinition[] = [
  {
    agent_id: "route-service-identity",
    name: "Route & Service Identity Agent",
    purpose: "Normalize route identity, service variants, plus/SBS/local policy, route-id authority, and route merge/split decisions.",
    owns: ["route identity", "route_type/service_variant", "MTA plus route surfaces", "route merge/split and do-not-merge decisions"],
    decision_contract: ["merge", "do_not_merge", "split_record", "alias", "canonical_value", "needs_more_data", "no_change"],
  },
  {
    agent_id: "project-corridor-spatial",
    name: "Project/Corridor Spatial Identity Agent",
    purpose: "Normalize project and corridor identity, corridor limits, street/borough scope, and route-list context on spatial records.",
    owns: ["project identity", "corridor identity", "street/limits/borough scope", "project/corridor route-list context"],
    decision_contract: ["merge", "do_not_merge", "weak_alias", "missing_identity_field", "relation_candidate", "needs_more_data", "no_change"],
  },
  {
    agent_id: "entity-source-role",
    name: "Entity & Source-Role Agent",
    purpose: "Normalize agencies, publishers, operators, people-vs-agency distinctions, source roles, and parent/owner organization context.",
    owns: ["entity identity", "entity_type", "publisher/operator/agency source roles", "parent organization context"],
    decision_contract: ["merge", "do_not_merge", "canonical_value", "relation_candidate", "entity_type_mapping", "needs_more_data", "no_change"],
  },
  {
    agent_id: "metric-claim-ontology",
    name: "Metric & Claim Ontology Agent",
    purpose: "Normalize metric units, metric dimensions, claim data/change types, and metric/claim relation-context fields.",
    owns: ["metric_claim.unit", "unit_normalized other bucket", "metric dimensions", "claim data_type/change_type", "metric route/source context"],
    decision_contract: ["canonical_value", "alias_field", "relation_candidate", "open_normalizer", "reject_mapping", "needs_more_data", "no_change"],
  },
  {
    agent_id: "relation-ontology",
    name: "Relation Ontology Agent",
    purpose: "Normalize relation families, exact relation-kind aliases, endpoint shape, and relation-context fields that should become explicit relations.",
    owns: ["relation_family", "relation_kind", "raw_relation_kind aliases", "endpoint shape", "relation payload route/context fields"],
    decision_contract: [
      "relation_family_mapping",
      "canonical_relation_kind",
      "relation_alias",
      "endpoint_fix",
      "relation_candidate",
      "keep_relation_kind_passthrough",
      "reject_mapping",
      "needs_more_data",
      "no_change",
    ],
  },
  {
    agent_id: "lifecycle-intervention-taxonomy",
    name: "Lifecycle & Intervention Taxonomy Agent",
    purpose: "Normalize event, treatment, project-family, status, and document-time lifecycle taxonomy while preserving source literals.",
    owns: ["event_family", "treatment_family", "project_family", "document_time_status", "date/status semantics"],
    decision_contract: ["canonical_value", "family_alias", "bounded_normalizer", "keep_other_passthrough", "reject_mapping", "needs_more_data", "no_change"],
  },
  {
    agent_id: "source-gap-resolution",
    name: "Source Gap & Caveat Resolution Agent",
    purpose: "Review source gaps as document-scoped caveats, corpus-resolvable gaps, or extraction issues, using wiki/sources search hints before treating something as missing.",
    owns: ["source_gap.gap_kind", "source_gap.missing_information", "source-scoped caveats", "cross-source resolution candidates"],
    decision_contract: ["resolved_by_source", "remains_source_scoped_caveat", "convert_to_claim_caveat", "canonical_value", "needs_more_data", "no_change"],
  },
];

const AGENT_BY_ID = new Map(AGENTS.map((agent) => [agent.agent_id, agent]));

function ontologyReviewDir() {
  return join(repoRoot, "data", "ontology-review");
}

function nowRunId(date = new Date()) {
  return `${date.toISOString().replace(/[:.]/gu, "-")}_ontology-review`;
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

function relativePath(path: string) {
  return relative(repoRoot, path).split("/").join("/");
}

function readJsonl(path: string): JsonObject[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as JsonObject);
}

function readIdentityClusters(): IdentityCluster[] {
  return readJsonl(join(repoRoot, "data", "identity-review", "clusters.jsonl")).flatMap((row) => {
    const kind = typeof row.kind === "string" ? row.kind : undefined;
    if (kind !== "entity" && kind !== "project" && kind !== "corridor" && kind !== "route") return [];
    const recordIds = Array.isArray(row.record_ids) ? row.record_ids.filter((value): value is string => typeof value === "string") : [];
    const reviewReasons = Array.isArray(row.review_reasons) ? row.review_reasons.filter((value): value is string => typeof value === "string") : [];
    return [
      {
        cluster_id: String(row.cluster_id ?? ""),
        kind,
        priority: typeof row.priority === "number" ? row.priority : 0,
        record_ids: recordIds,
        review_reasons: reviewReasons,
        packet_path: typeof row.packet_path === "string" ? row.packet_path : undefined,
      },
    ];
  });
}

function readQuarantineBlockers() {
  const blockers = new Map<string, string>();
  const manifestPath = join(repoRoot, "data", "identity-review", "accepted", "manifest.json");
  if (!existsSync(manifestPath)) return blockers;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as JsonObject;
  const quarantined = Array.isArray(manifest.quarantined) ? manifest.quarantined : [];
  for (const item of quarantined) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const object = item as JsonObject;
    const clusterId = typeof object.cluster_id === "string" ? object.cluster_id : undefined;
    const blocker = typeof object.blocker === "string" ? object.blocker : undefined;
    if (clusterId && blocker) blockers.set(clusterId, blocker);
  }
  return blockers;
}

function readSchemaAuditKinds() {
  const latest = join(repoRoot, "data", "identity-review", "schema-audit", "latest.json");
  if (!existsSync(latest)) return [];
  const manifest = JSON.parse(readFileSync(latest, "utf8")) as { kinds?: SchemaAuditKind[] | undefined };
  return manifest.kinds ?? [];
}

function stringValue(value: JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringValues(value: JsonValue | undefined): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))].sort();
}

function normalizedToken(value: string) {
  return value
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9+]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function shortText(value: string, max = 220) {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function sourceIds(record: MtaCanonicalRecord) {
  return uniqueStrings([record.source_id, ...(record.source_ids ?? [])]);
}

function evidenceExamples(record: MtaCanonicalRecord, max = 2): JsonObject[] {
  const examples: JsonObject[] = [];
  const seen = new Set<string>();
  for (const ref of record.evidence_refs.slice(0, 12)) {
    const key = `${ref.source_id}#${ref.block_id ?? ref.evidence_id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    examples.push(evidenceExample(ref));
    if (examples.length >= max) break;
  }
  return examples;
}

function evidenceExample(ref: MtaEvidenceRef): JsonObject {
  let snippet: string | undefined;
  if (ref.source_id && ref.block_id) {
    try {
      snippet = shortText(sourceBlockById(ref.source_id, ref.block_id).raw_text);
    } catch {
      snippet = undefined;
    }
  }

  return {
    source_id: ref.source_id,
    block_id: ref.block_id,
    page_number: ref.page_number,
    role: ref.role,
    snippet,
  };
}

function valueCounts(records: MtaCanonicalRecord[], field: string) {
  const counts = new Map<string, { count: number; records: MtaCanonicalRecord[] }>();
  for (const record of records) {
    for (const value of stringValues(record.payload[field])) {
      const key = value.trim();
      const entry = counts.get(key) ?? { count: 0, records: [] };
      entry.count += 1;
      if (entry.records.length < 4) entry.records.push(record);
      counts.set(key, entry);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
}

function openNormalizerValueNeedsCompanion(value: JsonValue | undefined) {
  if (typeof value === "string") return value.trim().length > 0;
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string");
}

function aliasFieldCoveredByCanonical(records: MtaCanonicalRecord[], aliasField: string, canonicalField: string) {
  const recordsWithAlias = records.filter((record) => record.payload[aliasField] !== undefined);
  if (recordsWithAlias.length === 0) return false;
  return recordsWithAlias.every((record) => {
    const aliasValue = stringValue(record.payload[aliasField]);
    const canonicalValue = stringValue(record.payload[canonicalField]);
    return aliasValue !== undefined && canonicalValue === aliasValue;
  });
}

function candidate(input: OntologyReviewCandidate): OntologyReviewCandidate {
  return input;
}

function compactRecord(record: MtaCanonicalRecord): JsonObject {
  return {
    record_id: record.record_id,
    display_name: record.display_name,
    source_ids: sourceIds(record),
    local_observation_ids: record.local_observation_ids ?? [record.local_observation_id],
    aliases: record.record_aliases ?? [],
    payload: record.payload,
  };
}

function representativeRecord(record: MtaCanonicalRecord): JsonObject {
  return {
    record_id: record.record_id,
    record_kind: record.record_kind,
    display_name: record.display_name,
    source_ids: sourceIds(record),
    payload: record.payload,
    evidence_examples: evidenceExamples(record, 1),
  };
}

function valueCountExamples(
  counts: Array<[string, { count: number; records: MtaCanonicalRecord[] }]>,
  options: { maxValues?: number | undefined; maxRepresentativeRecords?: number | undefined } = {},
) {
  const maxValues = options.maxValues ?? 12;
  const maxRepresentativeRecords = options.maxRepresentativeRecords ?? 3;
  return counts.slice(0, maxValues).map(([value, info]) => ({
    value,
    count: info.count,
    records: info.records.map((record) => record.record_id),
    representative_records: info.records.slice(0, maxRepresentativeRecords).map(representativeRecord),
  }));
}

function fieldMappingReviewPolicy(): JsonObject {
  return {
    mapping_relation_classifications: ["exact_alias", "broader_narrower", "inverse_direction", "related_but_distinct", "needs_more_data"],
    mapping_decision_rule:
      "Emit field_value_mapping or relation_kind_mapping only when mapping_relation is exact_alias and representative records show the same record meaning/query semantics. Do not map broader/narrower, inverse-direction, or merely related values.",
    context_expectation: "Use representative_records payloads and endpoints, not only value labels or frequency counts, before deciding.",
  };
}

function boundedTaxonomyReviewPolicy(): JsonObject {
  return {
    taxonomy_mode: "bounded_normalizer_with_other_passthrough",
    decision_rule:
      "Add or remap a family value only when representative raw literals share the same lifecycle/intervention meaning. Otherwise preserve the raw literal and keep the runner-owned family as other.",
    closed_universe_guard:
      "The family field is closed for first-pass grouping, but raw source fields remain pass-through so novel or uncertain source language is not rejected.",
  };
}

function recordsByKind(records: MtaCanonicalRecord[]) {
  const map = new Map<MtaObservationKind, MtaCanonicalRecord[]>();
  for (const record of records) map.set(record.record_kind, [...(map.get(record.record_kind) ?? []), record]);
  return map;
}

function acceptedEntries(entries: MtaSubmissionEntry[]) {
  return entries.filter((entry) => entry.validation.state === "accepted");
}

function entriesWithPayloadField(entries: MtaSubmissionEntry[], kind: MtaObservationKind, field: string) {
  return entries.filter((entry) => entry.tool_args.observation_kind === kind && entry.tool_args.payload?.[field] !== undefined);
}

function schemaField(kinds: SchemaAuditKind[], kind: MtaObservationKind, field: string) {
  return kinds.find((item) => item.observation_kind === kind)?.fields.find((item) => item.field === field);
}

const DERIVED_RELATION_COVERAGE_CACHE = new WeakMap<MtaCanonicalRecord[], DerivedRelationCoverage[]>();

function derivedCoverageForRecords(records: MtaCanonicalRecord[]) {
  const cached = DERIVED_RELATION_COVERAGE_CACHE.get(records);
  if (cached) return cached;
  const coverage = derivedRelationCoverage(records);
  DERIVED_RELATION_COVERAGE_CACHE.set(records, coverage);
  return coverage;
}

function derivedCoverageForField(records: MtaCanonicalRecord[], kind: MtaObservationKind, field: string) {
  return derivedCoverageForRecords(records).filter((row) => row.origin_kind === kind && row.field === field && row.records_with_field > 0);
}

function derivedCoverageSummary(rows: DerivedRelationCoverage[]) {
  return rows.reduce(
    (summary, row) => ({
      records_with_field: summary.records_with_field + row.records_with_field,
      value_count: summary.value_count + row.value_count,
      derived_count: summary.derived_count + row.derived_count,
      already_present_count: summary.already_present_count + row.already_present_count,
      unresolved_count: summary.unresolved_count + row.unresolved_count,
      skipped_self_count: summary.skipped_self_count + row.skipped_self_count,
    }),
    {
      records_with_field: 0,
      value_count: 0,
      derived_count: 0,
      already_present_count: 0,
      unresolved_count: 0,
      skipped_self_count: 0,
    },
  );
}

function derivedCoverageData(rows: DerivedRelationCoverage[]): JsonObject[] {
  return rows.map((row) => ({
    rule_id: row.rule_id,
    relation_kind: row.relation_kind,
    direction: row.direction,
    records_with_field: row.records_with_field,
    value_count: row.value_count,
    derived_count: row.derived_count,
    already_present_count: row.already_present_count,
    unresolved_count: row.unresolved_count,
    skipped_self_count: row.skipped_self_count,
  }));
}

function relationContextCandidate(
  agentId: OntologyAgentId,
  kind: MtaObservationKind,
  field: string,
  records: MtaCanonicalRecord[],
  options: {
    title: string;
    suggestedRelation?: string | undefined;
    priority?: number | undefined;
    reason?: string | undefined;
  },
) {
  const matching = records.filter((record) => record.record_kind === kind && record.payload[field] !== undefined);
  if (matching.length === 0) return undefined;
  const values = valueCounts(matching, field).slice(0, 12);
  const derivedCoverage = derivedCoverageForField(records, kind, field);
  const coverageSummary = derivedCoverageSummary(derivedCoverage);
  const coveredCount = coverageSummary.derived_count + coverageSummary.already_present_count;
  const coverageReason =
    derivedCoverage.length > 0
      ? `Deterministic derived-relation coverage: ${coveredCount} endpoint values are already present or derivable (${coverageSummary.already_present_count} already present, ${coverageSummary.derived_count} newly derivable); ${coverageSummary.unresolved_count} remain unresolved/pass-through and ${coverageSummary.skipped_self_count} self-links were skipped.`
      : undefined;
  return candidate({
    candidate_id: `${agentId}:relation-context:${kind}.${field}`,
    agent_id: agentId,
    category: "relation_context_field",
    priority: options.priority ?? 120 + matching.length,
    title: options.title,
    record_kind: kind,
    field,
    count: matching.length,
    reasons: uniqueStrings([
      options.reason ?? `${kind}.${field} appears on ${matching.length} canonical records but points at external records/context, not a closed enum.`,
      options.suggestedRelation ? `Suggested relation family: ${options.suggestedRelation}.` : "Review whether values should become explicit relation candidates.",
      coverageReason,
    ]),
    decision_options: ["relation_candidate", "keep_passthrough", "alias_field", "needs_more_data", "no_change"],
    examples: valueCountExamples(values, { maxValues: 12, maxRepresentativeRecords: 3 }),
    data:
      derivedCoverage.length > 0
        ? {
            derived_relation_coverage: derivedCoverageData(derivedCoverage),
          }
        : undefined,
  });
}

function routeVariantFromRecord(record: MtaCanonicalRecord) {
  const values = uniqueStrings([
    stringValue(record.payload.service_variant),
    stringValue(record.payload.route_type_normalized),
    stringValue(record.payload.route_type),
    ...stringValues(record.payload.route_label),
    ...stringValues(record.payload.route_name),
    ...stringValues(record.payload.route),
    record.record_id,
    ...(record.record_aliases ?? []),
  ]).join(" ");
  const lower = values.toLowerCase();
  return uniqueStrings([
    lower.includes("select_bus_service") || /\bsbs\b/u.test(lower) || /\+/u.test(values) ? "sbs" : undefined,
    /\blocal\b/u.test(lower) ? "local" : undefined,
    lower.includes("limited") ? "limited_stop" : undefined,
    lower.includes("express") ? "express" : undefined,
  ]);
}

function routeBase(record: MtaCanonicalRecord) {
  const labels = uniqueStrings([
    stringValue(record.payload.route_id),
    stringValue(record.payload.internal_route_id),
    stringValue(record.payload.route_label),
    stringValue(record.payload.route_name),
    stringValue(record.payload.route),
    record.record_id,
    ...(record.record_aliases ?? []),
  ]);
  for (const label of labels) {
    const upper = label.toUpperCase();
    const match = /\b(BX|[BMQS])\s*-?\s*(\d{1,3}[A-Z]?)/u.exec(upper);
    if (match?.[1] && match[2]) return `${match[1]}${match[2]}`;
  }
  return undefined;
}

function recordIdPairs(recordIds: string[]) {
  const ids = uniqueStrings(recordIds);
  const pairs: Array<[string, string]> = [];
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      pairs.push([ids[left]!, ids[right]!]);
    }
  }
  return pairs;
}

function unsuppressedIdentityPairs(kind: MtaObservationKind, recordIds: string[]) {
  return recordIdPairs(recordIds).filter(([left, right]) => !identityDoNotMergeSuppressed(kind, left, right));
}

function pairData(pairs: Array<[string, string]>): JsonObject[] {
  return pairs.map(([left_record_id, right_record_id]) => ({ left_record_id, right_record_id }));
}

function identityClusterCandidates(clusters: IdentityCluster[], blockers: Map<string, string>) {
  const candidates: OntologyReviewCandidate[] = [];
  for (const cluster of clusters) {
    const allPairs = recordIdPairs(cluster.record_ids);
    const pairsNeedingReview = unsuppressedIdentityPairs(cluster.kind, cluster.record_ids);
    if (allPairs.length > 0 && pairsNeedingReview.length === 0) continue;

    const agentId =
      cluster.kind === "route"
        ? "route-service-identity"
        : cluster.kind === "entity"
          ? "entity-source-role"
          : "project-corridor-spatial";
    const blocker = blockers.get(cluster.cluster_id);
    candidates.push(
      candidate({
        candidate_id: `${agentId}:identity-cluster:${cluster.cluster_id}`,
        agent_id: agentId,
        category: blocker ? "quarantined_identity_cluster" : "identity_cluster",
        priority: cluster.priority + (blocker ? 200 : 0),
        title: `${cluster.kind} identity cluster ${cluster.cluster_id}`,
        record_kind: cluster.kind,
        record_ids: cluster.record_ids,
        reasons: uniqueStrings([
          ...cluster.review_reasons,
          allPairs.length > pairsNeedingReview.length
            ? `${allPairs.length - pairsNeedingReview.length} pair(s) already have explicit do-not-merge overrides; ${pairsNeedingReview.length} pair(s) remain for review.`
            : undefined,
          blocker ? `quarantined blocker: ${blocker}` : undefined,
          cluster.packet_path ? `identity packet: ${cluster.packet_path}` : undefined,
        ]),
        decision_options: ["merge", "do_not_merge", "split_record", "weak_alias", "missing_identity_field", "needs_more_data", "no_change"],
        data: {
          cluster_id: cluster.cluster_id,
          packet_path: cluster.packet_path,
          quarantine_blocker: blocker,
          identity_pairs_needing_review: pairData(pairsNeedingReview),
        },
      }),
    );
  }
  return candidates;
}

function routeCandidates(records: MtaCanonicalRecord[], clusters: IdentityCluster[], blockers: Map<string, string>) {
  const routeRecords = records.filter((record) => record.record_kind === "route");
  const candidates = identityClusterCandidates(clusters.filter((cluster) => cluster.kind === "route"), blockers);

  for (const record of routeRecords) {
    const variants = routeVariantFromRecord(record);
    const merged = record.payload._merged_field_values;
    const mergedText = merged && typeof merged === "object" && !Array.isArray(merged) ? JSON.stringify(merged).toLowerCase() : "";
    const mergedHasConflict = mergedText.includes("local") && (mergedText.includes("sbs") || mergedText.includes("select bus service"));
    const datedVariant = /^route_[a-z0-9]+-(?:local|sbs|limited|express)-\d{4}$/u.test(record.record_id);
    if (!mergedHasConflict && !datedVariant) continue;

    candidates.push(
      candidate({
        candidate_id: `route-service-identity:route-variant:${record.record_id}`,
        agent_id: "route-service-identity",
        category: mergedHasConflict ? "route_variant_merge_conflict" : "dated_route_variant",
        priority: mergedHasConflict ? 450 : 260,
        title: mergedHasConflict ? `Route variant merge conflict: ${record.record_id}` : `Dated route variant identity: ${record.record_id}`,
        record_kind: "route",
        record_id: record.record_id,
        source_ids: sourceIds(record),
        reasons: [
          mergedHasConflict
            ? "Merged field values include both local and SBS/select-service surfaces; review for split/do-not-merge."
            : "Record id carries a year suffix for a service variant; review whether canonical identity should collapse to an undated route variant alias.",
          `Detected variants: ${variants.join(", ") || "(none)"}.`,
        ],
        decision_options: ["split_record", "do_not_merge", "alias", "canonical_value", "needs_more_data", "no_change"],
        examples: evidenceExamples(record),
        data: compactRecord(record),
      }),
    );
  }

  const byBase = new Map<string, MtaCanonicalRecord[]>();
  for (const record of routeRecords) {
    const base = routeBase(record);
    if (!base) continue;
    byBase.set(base, [...(byBase.get(base) ?? []), record]);
  }
  for (const [base, group] of byBase) {
    const variantSet = uniqueStrings(group.flatMap((record) => routeVariantFromRecord(record)));
    if (group.length < 2 || variantSet.length < 2) continue;
    const allPairs = recordIdPairs(group.map((record) => record.record_id));
    const pairsNeedingReview = unsuppressedIdentityPairs(
      "route",
      group.map((record) => record.record_id),
    );
    if (allPairs.length > 0 && pairsNeedingReview.length === 0) continue;

    candidates.push(
      candidate({
        candidate_id: `route-service-identity:base-route-variants:${normalizedToken(base)}`,
        agent_id: "route-service-identity",
        category: "base_route_variant_set",
        priority: 200 + group.length * 20 + variantSet.length * 25,
        title: `Base route ${base} has multiple service-variant records`,
        record_kind: "route",
        record_ids: group.map((record) => record.record_id),
        reasons: [
          `Base route ${base} has ${group.length} route records and variants ${variantSet.join(", ")}.`,
          "Review which variants are distinct canonical records and which aliases belong together.",
          allPairs.length > pairsNeedingReview.length
            ? `${allPairs.length - pairsNeedingReview.length} pair(s) already have explicit do-not-merge overrides; ${pairsNeedingReview.length} pair(s) remain for review.`
            : "No explicit do-not-merge override covers the current variant-pair set.",
        ],
        decision_options: ["merge", "do_not_merge", "split_record", "alias", "needs_more_data", "no_change"],
        examples: group.slice(0, 6).map(compactRecord),
        data: {
          identity_pairs_needing_review: pairData(pairsNeedingReview),
        },
      }),
    );
  }

  for (const [field, suggestedRelation] of [
    ["program", "part_of_program"],
    ["operator", "operated_by"],
    ["agency", "operated_by"],
    ["corridors", "operates_on_corridor"],
    ["routes", "related_route"],
  ] as const) {
    const item = relationContextCandidate("route-service-identity", "route", field, records, {
      title: `Route field ${field} should be reviewed as relation context`,
      suggestedRelation,
      priority: field === "program" ? 180 : 130,
    });
    if (item) candidates.push(item);
  }

  return candidates;
}

function projectCorridorCandidates(records: MtaCanonicalRecord[], clusters: IdentityCluster[], blockers: Map<string, string>) {
  const candidates = identityClusterCandidates(
    clusters.filter((cluster) => cluster.kind === "project" || cluster.kind === "corridor"),
    blockers,
  );

  for (const [kind, field, relation, priority] of [
    ["project", "routes_served", "serves_route", 180],
    ["project", "operator", "operated_by", 130],
    ["project", "owner", "owned_by", 125],
    ["project", "publisher", "published_by", 120],
    ["project", "program", "part_of_program", 120],
    ["corridor", "routes", "operates_on_corridor", 170],
    ["corridor", "routes_served", "operates_on_corridor", 170],
  ] as const) {
    const item = relationContextCandidate("project-corridor-spatial", kind, field, records, {
      title: `${kind}.${field} should be reviewed as relation context`,
      suggestedRelation: relation,
      priority,
    });
    if (item) candidates.push(item);
  }

  return candidates;
}

function entitySourceCandidates(records: MtaCanonicalRecord[], clusters: IdentityCluster[], blockers: Map<string, string>) {
  const candidates = identityClusterCandidates(clusters.filter((cluster) => cluster.kind === "entity"), blockers);
  const sources = records.filter((record) => record.record_kind === "source");
  const publishers = valueCounts(sources, "publisher");
  if (publishers.length > 0) {
    candidates.push(
      candidate({
        candidate_id: "entity-source-role:source-publishers",
        agent_id: "entity-source-role",
        category: "source_publisher_role",
        priority: 180 + publishers.reduce((sum, [, info]) => sum + info.count, 0),
        title: "Source publisher strings should map to entity/source-role decisions",
        record_kind: "source",
        field: "publisher",
        count: publishers.reduce((sum, [, info]) => sum + info.count, 0),
        reasons: ["Source publisher is relation context; normalize aliases without erasing source literals or changing publisher/source-role meaning."],
        decision_options: ["relation_candidate", "canonical_value", "entity_alias", "needs_more_data", "no_change"],
        examples: valueCountExamples(publishers, { maxValues: 20, maxRepresentativeRecords: 3 }),
        data: {
          mapping_review_policy: fieldMappingReviewPolicy(),
        },
      }),
    );
  }

  const entities = records.filter((record) => record.record_kind === "entity");
  const entityTypes = valueCounts(entities, "entity_type");
  if (entityTypes.length > 0) {
    candidates.push(
      candidate({
        candidate_id: "entity-source-role:entity-type-values",
        agent_id: "entity-source-role",
        category: "entity_type_mapping",
        priority: 140 + entityTypes.length,
        title: "Entity type values need open mapping and person/agency safeguards",
        record_kind: "entity",
        field: "entity_type",
        count: entities.filter((record) => record.payload.entity_type !== undefined).length,
        reasons: ["Entity type has many literal forms; normalize families while preserving person/title vs agency distinctions."],
        decision_options: ["entity_type_mapping", "canonical_value", "do_not_merge", "needs_more_data", "no_change"],
        examples: valueCountExamples(entityTypes, { maxValues: 24, maxRepresentativeRecords: 3 }),
        data: {
          mapping_review_policy: fieldMappingReviewPolicy(),
        },
      }),
    );
  }

  for (const [field, relation] of [
    ["publisher", "published_by"],
    ["organization", "part_of_agency"],
    ["owner", "owned_by"],
    ["parent_organization", "part_of_agency"],
    ["parent_entity", "part_of_agency"],
    ["agency", "related_agency"],
    ["office", "part_of_agency"],
  ] as const) {
    const item = relationContextCandidate("entity-source-role", "entity", field, records, {
      title: `Entity field ${field} should be reviewed as relation context`,
      suggestedRelation: relation,
      priority: 115,
    });
    if (item) candidates.push(item);
  }

  return candidates;
}

function metricClaimCandidates(records: MtaCanonicalRecord[], entries: MtaSubmissionEntry[], schemaKinds: SchemaAuditKind[]) {
  const candidates: OntologyReviewCandidate[] = [];
  const metrics = records.filter((record) => record.record_kind === "metric_claim");
  const unitOther = new Map<string, { count: number; records: MtaCanonicalRecord[]; raw: string }>();
  for (const record of metrics) {
    const normalized = record.payload.unit_normalized;
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) continue;
    const family = stringValue(normalized.unit_family);
    if (family !== "other") continue;
    const normalizedUnit = stringValue(normalized.normalized_unit) ?? stringValue(record.payload.unit) ?? "unknown";
    const raw = stringValue(normalized.raw_text) ?? stringValue(record.payload.unit) ?? normalizedUnit;
    const item = unitOther.get(normalizedUnit) ?? { count: 0, records: [], raw };
    item.count += 1;
    if (item.records.length < 5) item.records.push(record);
    unitOther.set(normalizedUnit, item);
  }
  for (const [normalizedUnit, info] of [...unitOther.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 30)) {
    candidates.push(
      candidate({
        candidate_id: `metric-claim-ontology:unit-other:${normalizedToken(normalizedUnit)}`,
        agent_id: "metric-claim-ontology",
        category: "unit_other_bucket",
        priority: 260 + info.count,
        title: `Metric unit in other bucket: ${info.raw}`,
        record_kind: "metric_claim",
        field: "unit",
        value: info.raw,
        count: info.count,
        source_ids: uniqueStrings(info.records.flatMap(sourceIds)),
        reasons: ["unit_normalized.unit_family is other; review whether this should map to a known family/unit or remain passthrough."],
        decision_options: ["canonical_value", "open_normalizer", "reject_mapping", "needs_more_data", "no_change"],
        examples: info.records.map(compactRecord),
      }),
    );
  }

  for (const field of ["units", "value_unit"]) {
    const matches = entriesWithPayloadField(acceptedEntries(entries), "metric_claim", field);
    if (matches.length === 0) continue;
    if (aliasFieldCoveredByCanonical(metrics, field, "unit")) continue;
    candidates.push(
      candidate({
        candidate_id: `metric-claim-ontology:alias-field:metric_claim.${field}`,
        agent_id: "metric-claim-ontology",
        category: "alias_field",
        priority: 190 + matches.length,
        title: `Metric field ${field} should alias to unit`,
        record_kind: "metric_claim",
        field,
        count: matches.length,
        reasons: [`${field} appears in ${matches.length} accepted submissions; current ontology prefers metric_claim.unit.`],
        decision_options: ["alias_field", "canonical_value", "needs_more_data", "no_change"],
        examples: matches.slice(0, 8).map((entry) => ({
          submission_id: entry.submission_id,
          local_observation_id: entry.tool_args.local_observation_id,
          value: entry.tool_args.payload?.[field],
          unit: entry.tool_args.payload?.unit,
        })),
      }),
    );
  }

  for (const [field, relation] of [
    ["route_label", "route has_metric metric_claim"],
    ["route", "route has_metric metric_claim"],
    ["source_system", "entity/project has_metric metric_claim"],
    ["entity", "entity/project has_metric metric_claim"],
  ] as const) {
    const item = relationContextCandidate("metric-claim-ontology", "metric_claim", field, records, {
      title: `Metric field ${field} should be reviewed as relation context`,
      suggestedRelation: relation,
      priority: field === "route_label" ? 210 : 150,
    });
    if (item) candidates.push(item);
  }

  for (const field of ["direction", "day_type", "mode", "scenario", "demographic_group", "comparison", "time_period", "service_type"]) {
    const audit = schemaField(schemaKinds, "metric_claim", field);
    if (!audit || audit.canonical_occurrences < 5) continue;
    const recordsWithField = metrics.filter((record) => openNormalizerValueNeedsCompanion(record.payload[field]));
    const companionField = `${field}_normalized`;
    const companionCoverage = recordsWithField.filter((record) => record.payload[companionField] !== undefined).length;
    if (recordsWithField.length > 0 && companionCoverage === recordsWithField.length) continue;
    candidates.push(
      candidate({
        candidate_id: `metric-claim-ontology:open-normalizer:metric_claim.${field}`,
        agent_id: "metric-claim-ontology",
        category: "open_normalizer_field",
        priority: 120 + audit.canonical_occurrences,
        title: `Metric field ${field} is an open-normalizer candidate`,
        record_kind: "metric_claim",
        field,
        count: audit.canonical_occurrences,
        reasons: [
          `${field}: canonical=${audit.canonical_occurrences}, distinct=${audit.canonical_distinct_string_values}, class=${audit.classification}, value_kind=${audit.canonical_value_kind}.`,
          "Review as open normalization, not closed enum validation.",
        ],
        decision_options: ["open_normalizer", "canonical_value", "reject_mapping", "needs_more_data", "no_change"],
        examples: (audit.canonical_sample_values ?? []).slice(0, 8).map((value) => ({ value })),
      }),
    );
  }

  const claims = records.filter((record) => record.record_kind === "claim");
  for (const field of ["data_type", "change_type"]) {
    const audit = schemaField(schemaKinds, "claim", field);
    if (!audit || audit.canonical_occurrences < 5) continue;
    const recordsWithField = claims.filter((record) => openNormalizerValueNeedsCompanion(record.payload[field]));
    const companionField = `${field}_normalized`;
    const companionCoverage = recordsWithField.filter((record) => record.payload[companionField] !== undefined).length;
    if (recordsWithField.length > 0 && companionCoverage === recordsWithField.length) continue;
    candidates.push(
      candidate({
        candidate_id: `metric-claim-ontology:open-normalizer:claim.${field}`,
        agent_id: "metric-claim-ontology",
        category: "open_normalizer_field",
        priority: 120 + audit.canonical_occurrences,
        title: `Claim field ${field} is an open-normalizer candidate`,
        record_kind: "claim",
        field,
        count: audit.canonical_occurrences,
        reasons: [
          `${field}: canonical=${audit.canonical_occurrences}, distinct=${audit.canonical_distinct_string_values}, class=${audit.classification}, value_kind=${audit.canonical_value_kind}.`,
          "Review as open normalization, not relation context or closed enum validation.",
        ],
        decision_options: ["open_normalizer", "canonical_value", "reject_mapping", "needs_more_data", "no_change"],
        examples: (audit.canonical_sample_values ?? []).slice(0, 8).map((value) => ({ value })),
      }),
    );
  }

  for (const field of ["route", "routes", "source"]) {
    const item = relationContextCandidate("metric-claim-ontology", "claim", field, records, {
      title: `Claim field ${field} needs ontology review`,
      suggestedRelation: field === "route" || field === "routes" ? "route has_claim claim" : field === "source" ? "data_provided_by" : undefined,
      priority: 110,
    });
    if (item) candidates.push(item);
  }

  return candidates;
}

function relationCandidates(records: MtaCanonicalRecord[]) {
  const candidates: OntologyReviewCandidate[] = [];
  const relations = records.filter((record) => record.record_kind === "relation");
  const relationKinds = valueCounts(relations, "relation_kind");
  const relationFamilies = valueCounts(relations, "relation_family");
  const otherFamilyRecords = relations.filter((record) => stringValue(record.payload.relation_family) === "other");
  if (relationKinds.length > 0) {
    candidates.push(
      candidate({
        candidate_id: "relation-ontology:relation-kind-inventory",
        agent_id: "relation-ontology",
        category: "relation_kind_inventory",
        priority: 300 + relationKinds.length,
        title: "Relation kind inventory needs alias consolidation",
        record_kind: "relation",
        field: "relation_kind",
        count: relations.length,
        reasons: [
          `${relations.length} canonical relations use ${relationKinds.length} distinct relation_kind values.`,
          `The runner groups them into ${relationFamilies.length} bounded relation_family values; ${otherFamilyRecords.length} relations remain in the other passthrough bucket.`,
          "Do not infer aliases from labels alone; compare representative relation payloads and endpoint direction before mapping.",
        ],
        decision_options: [
          "relation_family_mapping",
          "canonical_relation_kind",
          "relation_alias",
          "endpoint_fix",
          "keep_relation_kind_passthrough",
          "reject_mapping",
          "needs_more_data",
          "no_change",
        ],
        examples: valueCountExamples(relationKinds, { maxValues: 60, maxRepresentativeRecords: 3 }),
        data: {
          mapping_review_policy: fieldMappingReviewPolicy(),
          bounded_family_policy: {
            taxonomy_mode: "bounded_relation_family_with_other_passthrough",
            decision_rule:
              "Map a relation_kind into a family when representative endpoints share the same broad ontology role; emit relation_alias only for exact same-direction aliases.",
            passthrough_rule: "Keep relation_kind raw and relation_family=other when labels or endpoint directions are ambiguous.",
          },
          relation_family_inventory: valueCountExamples(relationFamilies, { maxValues: relationFamilies.length, maxRepresentativeRecords: 2 }),
          other_family_records: otherFamilyRecords.slice(0, 12).map(representativeRecord),
        },
      }),
    );
  }

  const rawKindRelations = relations.filter((record) => {
    const raw = stringValue(record.payload.raw_relation_kind);
    if (!raw) return false;
    const relationKind = stringValue(record.payload.relation_kind);
    return !relationKind || normalizeRelationKind(raw) !== normalizeRelationKind(relationKind);
  });
  const rawKinds = valueCounts(rawKindRelations, "raw_relation_kind");
  if (rawKinds.length > 0) {
    candidates.push(
      candidate({
        candidate_id: "relation-ontology:raw-relation-kind-aliases",
        agent_id: "relation-ontology",
        category: "raw_relation_kind_alias",
        priority: 220 + rawKinds.length,
        title: "Raw relation kind values need explicit alias review",
        record_kind: "relation",
        field: "raw_relation_kind",
        count: rawKinds.reduce((sum, [, info]) => sum + info.count, 0),
        reasons: [
          "raw_relation_kind values preserve pre-normalization relation labels and should map to canonical relation_kind aliases only when representative records preserve meaning.",
        ],
        decision_options: ["relation_family_mapping", "relation_alias", "canonical_relation_kind", "reject_mapping", "needs_more_data", "no_change"],
        examples: valueCountExamples(rawKinds, { maxValues: rawKinds.length, maxRepresentativeRecords: 3 }),
        data: {
          mapping_review_policy: fieldMappingReviewPolicy(),
        },
      }),
    );
  }

  for (const field of ["routes", "routes_affected", "contractor", "hotline", "old_location", "new_location"]) {
    const item = relationContextCandidate("relation-ontology", "relation", field, records, {
      title: `Relation payload field ${field} should be reviewed for endpoint/context shape`,
      suggestedRelation: "endpoint_fix or additional relation",
      priority: 100,
    });
    if (item) candidates.push(item);
  }

  return candidates;
}

type SourceSearchDocument = {
  source_id: string;
  path: string;
  text: string;
  lower: string;
};

const SOURCE_SEARCH_STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "available",
  "before",
  "but",
  "can",
  "data",
  "document",
  "due",
  "for",
  "from",
  "future",
  "gap",
  "has",
  "have",
  "included",
  "information",
  "into",
  "missing",
  "not",
  "report",
  "reported",
  "reports",
  "source",
  "states",
  "subsequent",
  "that",
  "the",
  "this",
  "until",
  "was",
  "were",
  "will",
  "with",
]);

function sourceSearchBody(markdown: string) {
  if (!markdown.startsWith("---")) return markdown;
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return markdown;
  return markdown.slice(end + "\n---".length);
}

function readSourceSearchDocuments(): SourceSearchDocument[] {
  const dir = join(repoRoot, "wiki", "sources");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const path = join(dir, file);
      const text = sourceSearchBody(readFileSync(path, "utf8"));
      return {
        source_id: file.slice(0, -".md".length),
        path: relativePath(path),
        text,
        lower: text.toLowerCase(),
      };
    });
}

function tokenSearchTerms(text: string) {
  return uniqueStrings(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, " ")
      .split(/\s+/u)
      .filter((token) => token.length >= 3 && !SOURCE_SEARCH_STOPWORDS.has(token)),
  ).slice(0, 16);
}

function sourceGapSearchText(record: MtaCanonicalRecord) {
  return uniqueStrings([
    stringValue(record.payload.missing_information),
    stringValue(record.payload.gap_text),
    stringValue(record.payload.description),
    stringValue(record.payload.gap_kind),
    stringValue(record.raw_text),
  ]).join(" ");
}

function sourceGapPrimarySearchTerms(record: MtaCanonicalRecord) {
  const primary = uniqueStrings([stringValue(record.payload.missing_information), stringValue(record.raw_text)]).join(" ");
  return tokenSearchTerms(primary);
}

function sourceSnippet(doc: SourceSearchDocument, term: string) {
  const index = doc.lower.indexOf(term.toLowerCase());
  if (index < 0) return undefined;
  const start = Math.max(0, index - 120);
  const end = Math.min(doc.text.length, index + term.length + 180);
  return shortText(doc.text.slice(start, end), 320);
}

function searchSourcesForGap(record: MtaCanonicalRecord, docs: SourceSearchDocument[]) {
  const primaryTerms = sourceGapPrimarySearchTerms(record);
  const terms = tokenSearchTerms(sourceGapSearchText(record));
  if (terms.length === 0) return { terms, matches: [] as JsonObject[] };

  const matches = docs.flatMap((doc) => {
    if (doc.source_id === record.source_id) return [];
    const matchedTerms = terms.filter((term) => doc.lower.includes(term));
    if (matchedTerms.length === 0) return [];
    const matchedPrimaryTerms = primaryTerms.filter((term) => doc.lower.includes(term));
    if (primaryTerms.length > 0 && matchedPrimaryTerms.length === 0) return [];
    const score = matchedTerms.reduce((sum, term) => {
      const weight = primaryTerms.includes(term) ? 20 : 4;
      return sum + weight + Math.max(2, Math.min(12, term.length));
    }, 0);
    const snippets = uniqueStrings(
      [...matchedPrimaryTerms, ...matchedTerms]
        .slice(0, 4)
        .map((term) => sourceSnippet(doc, term))
        .filter((snippet): snippet is string => Boolean(snippet)),
    ).slice(0, 2);
    return [
      {
        source_id: doc.source_id,
        path: doc.path,
        score,
        matched_terms: matchedTerms,
        primary_terms_matched: matchedPrimaryTerms,
        snippets,
      },
    ];
  });

  matches.sort((a, b) => {
    const scoreA = typeof a.score === "number" ? a.score : 0;
    const scoreB = typeof b.score === "number" ? b.score : 0;
    return scoreB - scoreA || String(a.source_id).localeCompare(String(b.source_id));
  });

  return { terms, matches: matches.slice(0, 8) };
}

function sourceGapCandidates(records: MtaCanonicalRecord[]) {
  const candidates: OntologyReviewCandidate[] = [];
  const gaps = records.filter((record) => record.record_kind === "source_gap");
  if (gaps.length === 0) return candidates;

  const gapKinds = valueCounts(gaps, "gap_kind");
  if (gapKinds.length > 0) {
    const normalizedGapKinds = valueCounts(gaps, "gap_kind_normalized");
    candidates.push(
      candidate({
        candidate_id: "source-gap-resolution:gap-kind-inventory",
        agent_id: "source-gap-resolution",
        category: "source_gap_kind_inventory",
        priority: 180 + gapKinds.length,
        title: "Source gap kind values need caveat/resolution semantics",
        record_kind: "source_gap",
        field: "gap_kind",
        count: gaps.length,
        reasons: [
          "Review whether each gap_kind maps to the bounded runner-owned gap_kind_normalized taxonomy, remains other, or needs source-backed resolution evidence.",
          "Do not treat absence in one source as corpus-level absence without checking other source pages.",
        ],
        decision_options: ["canonical_value", "remains_source_scoped_caveat", "resolved_by_source", "needs_more_data", "no_change"],
        examples: valueCountExamples(gapKinds, { maxValues: gapKinds.length, maxRepresentativeRecords: 3 }),
        data: {
          mapping_review_policy: fieldMappingReviewPolicy(),
          bounded_taxonomy_policy: boundedTaxonomyReviewPolicy(),
          gap_kind_normalized_inventory: valueCountExamples(normalizedGapKinds, { maxValues: normalizedGapKinds.length, maxRepresentativeRecords: 2 }),
        },
      }),
    );
  }

  const docs = readSourceSearchDocuments();
  for (const gap of gaps) {
    const { terms, matches } = searchSourcesForGap(gap, docs);
    const hasMatches = matches.length > 0;
    candidates.push(
      candidate({
        candidate_id: `source-gap-resolution:gap:${gap.record_id}`,
        agent_id: "source-gap-resolution",
        category: hasMatches ? "source_gap_possible_resolution" : "source_gap_unresolved_caveat",
        priority: 220 + (hasMatches ? 80 : 0) + Math.min(80, matches.length * 10),
        title: `Review source gap: ${gap.display_name}`,
        record_kind: "source_gap",
        record_id: gap.record_id,
        source_ids: uniqueStrings([gap.source_id, ...matches.map((match) => (typeof match.source_id === "string" ? match.source_id : undefined))]),
        reasons: [
          "Source gaps should represent a source-stated caveat or missing information, not a claim that the corpus lacks the fact.",
          hasMatches
            ? "wiki/sources search found possible resolving/context sources; inspect them before leaving this gap unresolved."
            : "wiki/sources search found no obvious resolving source page; still review the gap as document-scoped rather than global absence.",
        ],
        decision_options: ["resolved_by_source", "remains_source_scoped_caveat", "convert_to_claim_caveat", "canonical_value", "needs_more_data", "no_change"],
        examples: [
          {
            source_gap: compactRecord(gap),
            original_evidence: evidenceExamples(gap),
            search_terms: terms,
            possible_source_matches: matches,
            searched_source_pages: docs.length,
          },
        ],
      }),
    );
  }

  return candidates;
}

function lifecycleCandidates(records: MtaCanonicalRecord[], schemaKinds: SchemaAuditKind[]) {
  const candidates: OntologyReviewCandidate[] = [];
  for (const [kind, rawField, familyField, label, priority] of [
    ["event", "event_kind", "event_family", "Event family", 220],
    ["treatment_component", "treatment_kind", "treatment_family", "Treatment family", 220],
    ["project", "project_type", "project_family", "Project family", 180],
    ["project", "status", "document_time_status", "Document-time project status", 180],
  ] as const) {
    const typedKind = kind as MtaObservationKind;
    const typedRecords = records.filter((record) => record.record_kind === typedKind);
    const families = valueCounts(typedRecords, familyField);
    if (families.length > 0) {
      const otherRecords = typedRecords.filter((record) => stringValue(record.payload[familyField]) === "other");
      candidates.push(
        candidate({
          candidate_id: `lifecycle-intervention-taxonomy:family:${typedKind}.${familyField}`,
          agent_id: "lifecycle-intervention-taxonomy",
          category: "family_inventory",
          priority: priority + families.length,
          title: `${label} inventory`,
          record_kind: typedKind,
          field: familyField,
          count: typedRecords.filter((record) => record.payload[familyField] !== undefined).length,
          reasons: [
            `Review ${familyField} as a bounded runner-owned taxonomy derived from raw ${rawField}. Preserve raw literals.`,
            otherRecords.length > 0
              ? `${otherRecords.length} records currently map to other; these are the expansion/review queue.`
              : "No records currently map to other; keep the taxonomy closed unless evidence shows an exact missing family.",
          ],
          decision_options: ["family_alias", "canonical_value", "bounded_normalizer", "keep_other_passthrough", "reject_mapping", "needs_more_data", "no_change"],
          examples: valueCountExamples(families, { maxValues: 40, maxRepresentativeRecords: 3 }),
          data: {
            mapping_review_policy: fieldMappingReviewPolicy(),
            bounded_taxonomy_policy: boundedTaxonomyReviewPolicy(),
            other_bucket_records: otherRecords.slice(0, 12).map(representativeRecord),
          },
        }),
      );
    }

    const audit = schemaField(schemaKinds, typedKind, rawField);
    if (audit && audit.canonical_occurrences >= 10) {
      candidates.push(
        candidate({
          candidate_id: `lifecycle-intervention-taxonomy:raw-field:${typedKind}.${rawField}`,
          agent_id: "lifecycle-intervention-taxonomy",
          category: "raw_lifecycle_field",
          priority: 120 + audit.canonical_occurrences,
          title: `${typedKind}.${rawField} raw literals feed ${familyField}`,
          record_kind: typedKind,
          field: rawField,
          count: audit.canonical_occurrences,
          reasons: [
            `${rawField}: canonical=${audit.canonical_occurrences}, distinct=${audit.canonical_distinct_string_values}, class=${audit.classification}.`,
            "Review bounded mapping rules without replacing source literals; uncertain values stay raw and map to other.",
          ],
          decision_options: ["bounded_normalizer", "canonical_value", "keep_other_passthrough", "reject_mapping", "needs_more_data", "no_change"],
          examples: (audit.canonical_sample_values ?? []).slice(0, 8).map((value) => ({ value })),
          data: {
            bounded_taxonomy_policy: boundedTaxonomyReviewPolicy(),
          },
        }),
      );
    }
  }

  return candidates;
}

function buildCandidates(records: MtaCanonicalRecord[], submissions: MtaSubmissionEntry[], schemaKinds: SchemaAuditKind[], clusters: IdentityCluster[]) {
  const blockers = readQuarantineBlockers();
  return [
    ...routeCandidates(records, clusters, blockers),
    ...projectCorridorCandidates(records, clusters, blockers),
    ...entitySourceCandidates(records, clusters, blockers),
    ...metricClaimCandidates(records, submissions, schemaKinds),
    ...relationCandidates(records),
    ...lifecycleCandidates(records, schemaKinds),
    ...sourceGapCandidates(records),
  ].sort((a, b) => b.priority - a.priority || a.agent_id.localeCompare(b.agent_id) || a.candidate_id.localeCompare(b.candidate_id));
}

function selectedAgentIds(subject: string | undefined): OntologyAgentId[] {
  if (!subject) return AGENTS.map((agent) => agent.agent_id);
  const matches = AGENTS.filter((agent) => agent.agent_id === subject || agent.name.toLowerCase().includes(subject.toLowerCase()));
  if (matches.length === 0) throw new Error(`Unknown ontology agent: ${subject}`);
  return matches.map((agent) => agent.agent_id);
}

function filterCandidates(candidates: OntologyReviewCandidate[], options: OntologyReviewOptions) {
  const agentIds = new Set(selectedAgentIds(options.subject));
  const include = options.include ? new RegExp(options.include, "iu") : undefined;
  const exclude = options.exclude ? new RegExp(options.exclude, "iu") : undefined;
  const byAgent = new Map<OntologyAgentId, number>();
  const filtered: OntologyReviewCandidate[] = [];

  for (const candidate of candidates) {
    if (!agentIds.has(candidate.agent_id)) continue;
    const haystack = JSON.stringify({
      candidate_id: candidate.candidate_id,
      agent_id: candidate.agent_id,
      category: candidate.category,
      title: candidate.title,
      field: candidate.field,
      value: candidate.value,
      reasons: candidate.reasons,
    });
    if (include && !include.test(haystack)) continue;
    if (exclude && exclude.test(haystack)) continue;
    const count = byAgent.get(candidate.agent_id) ?? 0;
    if (options.limit && count >= options.limit) continue;
    byAgent.set(candidate.agent_id, count + 1);
    filtered.push(candidate);
  }

  return filtered;
}

function categoryCounts(candidates: OntologyReviewCandidate[]) {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) counts[candidate.category] = (counts[candidate.category] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function renderPacket(agent: OntologyAgentDefinition, candidates: OntologyReviewCandidate[]) {
  const lines: string[] = [
    `# ${agent.name}`,
    "",
    `Agent id: \`${agent.agent_id}\``,
    "",
    "## Purpose",
    "",
    agent.purpose,
    "",
    "## Owns",
    "",
    ...agent.owns.map((item) => `- ${item}`),
    "",
    "## Decision Contract",
    "",
    "Submit review decisions only as append-only normalization decisions. Do not edit canonical JSONL, wiki pages, source pages, or source literals directly.",
    "",
    ...agent.decision_contract.map((item) => `- ${item}`),
    "",
    "## Candidate Summary",
    "",
    `Candidates: ${candidates.length}`,
    "",
    ...Object.entries(categoryCounts(candidates)).map(([category, count]) => `- ${category}: ${count}`),
    "",
    "## Candidates",
    "",
  ];

  for (const item of candidates) {
    lines.push(`### ${item.candidate_id}`, "");
    lines.push(`- Category: ${item.category}`);
    lines.push(`- Priority: ${item.priority}`);
    if (item.record_kind) lines.push(`- Record kind: ${item.record_kind}`);
    if (item.record_id) lines.push(`- Record id: ${item.record_id}`);
    if (item.record_ids?.length) lines.push(`- Record ids: ${item.record_ids.join(", ")}`);
    if (item.field) lines.push(`- Field: ${item.field}`);
    if (item.value) lines.push(`- Value: ${item.value}`);
    if (item.count !== undefined) lines.push(`- Count: ${item.count}`);
    if (item.source_ids?.length) lines.push(`- Source ids: ${item.source_ids.join(", ")}`);
    lines.push(`- Title: ${item.title}`);
    lines.push(`- Decision options: ${item.decision_options.join(", ")}`);
    lines.push("");
    lines.push("Reasons:");
    for (const reason of item.reasons) lines.push(`- ${reason}`);
    if (item.examples?.length) {
      lines.push("");
      lines.push("Examples:");
      lines.push("```json");
      lines.push(JSON.stringify(item.examples.slice(0, 8), null, 2));
      lines.push("```");
    }
    if (item.data) {
      lines.push("");
      lines.push("Data:");
      lines.push("```json");
      lines.push(JSON.stringify(item.data, null, 2));
      lines.push("```");
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function renderReadme(manifest: OntologyReviewManifest) {
  return `# Ontology Review

Generated by \`bun packages/cli/src/cli.ts ontology-review\`.

This directory stages deterministic work queues for specialized ontology agents. It is not a
canonical data surface and does not apply changes by itself.

## Current Run

- Run: \`${manifest.run_id}\`
- Candidates: ${manifest.counts.candidates}
- Agents: ${manifest.counts.agents}
- Manifest: \`${manifest.paths.latest}\`
- Candidate JSONL: \`${manifest.paths.candidates_jsonl}\`
- Packets: \`${manifest.paths.packets_dir}\`

## Contract

Ontology agents may recommend normalization decisions, merge/split decisions, aliases, relation
candidates, and open normalizer mappings. They must preserve source literals and cite candidate
context. Deterministic code applies accepted decisions in a later pass.

These packets are async task queues, not automatic ingest side effects. Ingest/materialize may add
deterministic companions and exact derived relations immediately, while unresolved or ambiguous
items remain pass-through candidates for the owning ontology agent.
`;
}

export function ontologyAgentDefinitions() {
  return AGENTS;
}

export function generateOntologyReview(options: OntologyReviewOptions = {}): OntologyReviewManifest {
  const runId = nowRunId();
  const outputDir = ontologyReviewDir();
  const packetsDir = join(outputDir, "packets");
  const candidatesPath = join(outputDir, "candidates.jsonl");
  const latestPath = join(outputDir, "latest.json");
  const agentsPath = join(outputDir, "agents.json");
  const readmePath = join(outputDir, "README.md");

  const canonicalRecords = readCanonicalRecords();
  const submissions = readSubmissionEntries();
  const schemaKinds = readSchemaAuditKinds();
  const clusters = readIdentityClusters();
  const candidates = filterCandidates(buildCandidates(canonicalRecords, submissions, schemaKinds, clusters), options);
  const selected = selectedAgentIds(options.subject);
  const candidateGroups = new Map<OntologyAgentId, OntologyReviewCandidate[]>();
  for (const id of selected) candidateGroups.set(id, []);
  for (const item of candidates) candidateGroups.set(item.agent_id, [...(candidateGroups.get(item.agent_id) ?? []), item]);

  mkdir(outputDir);
  mkdir(packetsDir);
  writeJsonl(candidatesPath, candidates);
  writeJson(agentsPath, AGENTS);

  const agentSummaries = selected.map((agentId) => {
    const agent = AGENT_BY_ID.get(agentId);
    if (!agent) throw new Error(`Missing ontology agent definition: ${agentId}`);
    const agentCandidates = candidateGroups.get(agentId) ?? [];
    const packetPath = join(packetsDir, `${agent.agent_id}.md`);
    writeFileSync(packetPath, renderPacket(agent, agentCandidates), "utf8");
    return {
      agent_id: agent.agent_id,
      name: agent.name,
      candidate_count: agentCandidates.length,
      packet_path: relativePath(packetPath),
      top_categories: categoryCounts(agentCandidates),
    };
  });

  const manifest: OntologyReviewManifest = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    output_dir: relativePath(outputDir),
    selected_agents: selected,
    paths: {
      latest: relativePath(latestPath),
      candidates_jsonl: relativePath(candidatesPath),
      packets_dir: relativePath(packetsDir),
      agents_json: relativePath(agentsPath),
      readme: relativePath(readmePath),
    },
    counts: {
      agents: selected.length,
      candidates: candidates.length,
      canonical_records: canonicalRecords.length,
      submissions: submissions.length,
      accepted_submissions: submissions.filter((entry) => entry.validation.state === "accepted").length,
      rejected_submissions: submissions.filter((entry) => entry.validation.state === "rejected").length,
    },
    agents: agentSummaries,
  };

  writeJson(latestPath, manifest);
  writeFileSync(readmePath, renderReadme(manifest), "utf8");
  return manifest;
}
