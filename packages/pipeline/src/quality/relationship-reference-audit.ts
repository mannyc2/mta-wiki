import { shortHash, stableJson } from "@mta-wiki/db/stable-json";
import type {
  JsonObject,
  JsonValue,
  MtaCanonicalRecord,
  MtaEvidenceRef,
  MtaObservationKind,
} from "@mta-wiki/db/types";
import { normalizeRelationKind } from "@mta-wiki/pipeline/records/relations";
import {
  derivedRelationCoverage,
  type DerivedRelationCoverage,
} from "@mta-wiki/pipeline/records/derived-relations";
import type { EvidenceBlockIndex } from "@mta-wiki/pipeline/sources/evidence-block-index";
import {
  relationshipReferenceDecisionKey,
  type LoadedRelationshipReferenceContract,
  type RelationshipReferenceMode,
  type RelationshipReferenceReviewDecision,
  type RelationshipReferenceReviewResolution,
  type RelationshipReferenceRule,
} from "./relationship-reference-contract.js";

type Resolution = {
  record: MtaCanonicalRecord;
  targetKind: MtaObservationKind;
  confidence: "exact_canonical_match" | "single_route_base_match";
};

type TargetResolution = {
  resolution: Resolution | undefined;
  candidateIds: string[];
};

export type RelationshipReferencePrimaryDisposition =
  | "exact_resolved_derived_edge"
  | "already_present_edge"
  | "supportable_missing_edge"
  | "self_reference_skipped"
  | "reviewed_supportable_resolution"
  | "reviewed_supportable_existing_edge"
  | "reviewed_non_authoritative_context_literal"
  | "reviewed_non_authoritative_self_reference"
  | "reviewed_temporal_scope_mismatch"
  | "reviewed_unresolved_reference"
  | "reviewed_ambiguous_reference"
  | "unreviewed_self_reference"
  | "unreviewed_unresolved_reference"
  | "unreviewed_ambiguous_reference"
  | "invalid_unreviewed_value";

export type RelationshipReferenceFindingCode =
  | "RELREF_POLICY_RULE_DRIFT"
  | "RELREF_NATIVE_COVERAGE_MISMATCH"
  | "RELREF_INVALID_VALUE"
  | "RELREF_EVIDENCE_MISSING"
  | "RELREF_EVIDENCE_UNRESOLVED"
  | "RELREF_UNREVIEWED_UNRESOLVED"
  | "RELREF_UNREVIEWED_AMBIGUOUS"
  | "RELREF_REVIEWED_UNRESOLVED"
  | "RELREF_REVIEWED_AMBIGUOUS"
  | "RELREF_REVIEWED_CONTEXT_LITERAL"
  | "RELREF_REVIEWED_SELF_REFERENCE"
  | "RELREF_REVIEWED_TEMPORAL_SCOPE_MISMATCH"
  | "RELREF_REVIEWED_NON_EDGE_PRESENT"
  | "RELREF_UNREVIEWED_SELF_REFERENCE"
  | "RELREF_SUPPORTABLE_RESOLUTION_PENDING"
  | "RELREF_REVIEW_DECISION_STALE"
  | "RELREF_REVIEW_DECISION_INVALID";

export type RelationshipReferenceFinding = {
  schema_version: 1;
  contract_id: "relationship-reference-contract-v1";
  finding_id: string;
  code: RelationshipReferenceFindingCode;
  severity: "warning" | "error";
  reference_id: string | null;
  decision_id: string | null;
  rule_id: string | null;
  origin_record_id: string | null;
  field: string | null;
  normalized_value: string | null;
  detail: string;
};

export type RelationshipReferenceAuditRow = {
  schema_version: 1;
  contract_id: "relationship-reference-contract-v1";
  reference_id: string;
  rule_id: string;
  origin_record_id: string;
  origin_kind: MtaObservationKind;
  field: string;
  value: string | null;
  raw_value: JsonValue;
  normalized_value: string | null;
  native_resolution: "resolved" | "unresolved" | "ambiguous" | "self_skipped" | "invalid";
  resolution_confidence: Resolution["confidence"] | null;
  target_record_id: string | null;
  candidate_record_ids: string[];
  relation_kind: string;
  relation_subject_id: string | null;
  relation_object_id: string | null;
  matching_relation_ids: string[];
  review_decision_id: string | null;
  primary_disposition: RelationshipReferencePrimaryDisposition;
  reasons: string[];
  evidence_status: "exact" | "missing" | "unresolved";
  origin_evidence_refs: MtaEvidenceRef[];
};

export type RelationshipReferenceGroup = {
  schema_version: 1;
  contract_id: "relationship-reference-contract-v1";
  group_id: string;
  rule_id: string;
  field: string;
  normalized_value: string;
  literal_values: string[];
  native_resolution: RelationshipReferenceReviewResolution;
  review_strategy: RelationshipReferenceRule["unresolved_review_strategy"];
  context_literal_by_policy: boolean;
  route_like_value: boolean;
  reference_count: number;
  origin_record_ids: string[];
  source_ids_checked: string[];
  evidence_ids_checked: string[];
  canonical_candidate_ids_checked: string[];
  proposed_target_record_id: string | null;
  review_decision_id: string | null;
  review_primary_disposition: RelationshipReferenceReviewDecision["primary_disposition"] | null;
};

export type RelationshipReferenceProposedRemediation = {
  schema_version: 1;
  contract_id: "relationship-reference-contract-v1";
  proposal_id: string;
  remediation_kind:
    | "materialize_evidence_bound_relation";
  rule_id: string;
  field: string;
  relation_kind: string;
  subject_id: string;
  object_id: string;
  target_record_id: string;
  native_resolution: "resolved_missing_edge" | "reviewed_target_not_natively_resolved";
  supporting_reference_ids: string[];
  origin_record_ids: string[];
  origin_evidence_refs: MtaEvidenceRef[];
  reason: string;
  status: "pending_canonical_correction";
  apply_automatically: false;
};

export type RelationshipReferenceCoverage = {
  rule_id: string;
  origin_kind: MtaObservationKind;
  field: string;
  relation_kind: string;
  records_with_field: number;
  value_count: number;
  invalid_value_count: number;
  exact_resolved_derived_edge_count: number;
  already_present_edge_count: number;
  supportable_missing_edge_count: number;
  reviewed_non_edge_count: number;
  unresolved_count: number;
  ambiguous_count: number;
  skipped_self_count: number;
};

export type RelationshipReferenceAudit = {
  schema_version: 1;
  contract_id: "relationship-reference-contract-v1";
  mode: RelationshipReferenceMode;
  rows: RelationshipReferenceAuditRow[];
  groups: RelationshipReferenceGroup[];
  findings: RelationshipReferenceFinding[];
  proposed_remediations: RelationshipReferenceProposedRemediation[];
  coverage: RelationshipReferenceCoverage[];
  native_coverage: DerivedRelationCoverage[];
  summary: {
    canonical_record_count: number;
    policy_rule_count: number;
    policy_field_count: number;
    reference_row_count: number;
    valid_string_value_count: number;
    invalid_value_count: number;
    exact_resolved_derived_edge_count: number;
    already_present_edge_count: number;
    supportable_missing_edge_count: number;
    skipped_self_count: number;
    reviewed_supportable_resolution_count: number;
    reviewed_supportable_existing_edge_count: number;
    reviewed_context_literal_count: number;
    reviewed_self_reference_count: number;
    reviewed_temporal_scope_mismatch_count: number;
    unreviewed_self_reference_count: number;
    reviewed_unresolved_count: number;
    reviewed_ambiguous_count: number;
    unreviewed_unresolved_count: number;
    unreviewed_ambiguous_count: number;
    unresolved_group_count: number;
    ambiguous_group_count: number;
    proposed_remediation_count: number;
    finding_count: number;
    hard_failure_count: number;
    findings_by_code: Record<string, number>;
    primary_dispositions: Record<string, number>;
    policy_rule_drift_count: number;
    native_coverage_mismatch_count: number;
    stale_review_decision_count: number;
  };
};

type AuditOptions = {
  mode?: RelationshipReferenceMode | undefined;
  evidenceIndex?: EvidenceBlockIndex | undefined;
  checkNativeCoverage?: boolean | undefined;
};

const LOOKUP_FIELDS_BY_KIND: Partial<Record<MtaObservationKind, string[]>> = {
  source: ["source_id", "title", "source_title"],
  entity: ["entity_name", "name", "agency_name", "short_name", "acronym"],
  project: ["project_name", "name", "program_name"],
  corridor: ["corridor_name", "name", "street", "streets"],
  route: ["route_id", "internal_route_id", "route_label", "route_name", "route", "branding_label"],
};

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))]
    .sort((left, right) => left.localeCompare(right));
}

/** The native derived-relation resolver uses Array#sort without a comparator. Preserve that
 * exact ordering anywhere it can affect route-base selection or first-edge cardinality; artifact
 * arrays use locale ordering through uniqueStrings instead. */
function nativeUniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))]
    .sort();
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringValues(value: JsonValue | undefined): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function invalidValues(value: JsonValue | undefined): JsonValue[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return value.trim() ? [] : [value];
  if (!Array.isArray(value)) return [value];
  const invalid = value.filter((entry) => typeof entry !== "string" || !entry.trim());
  return [...new Map(invalid.map((entry) => [stableJson(entry), entry])).values()]
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

function payloadStrings(payload: JsonObject, fields: string[]): string[] {
  return nativeUniqueStrings(fields.flatMap((field) => stringValues(payload[field])));
}

export function normalizeRelationshipReferenceValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/\+/gu, " sbs ")
    .replace(/\bselect\s+bus\s+service\b/gu, "sbs")
    .replace(/\bnew\s+york\s+city\s+department\s+of\s+transportation\b/gu, "nyc dot")
    .replace(/\bnyc\s*dot\b/gu, "nyc dot")
    .replace(/\bavenue\b/gu, "ave")
    .replace(/\bstreet\b/gu, "st")
    .replace(/\broad\b/gu, "rd")
    .replace(/\bboulevard\b/gu, "blvd")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function recordIdSurface(record: MtaCanonicalRecord): string {
  const prefix = `${record.record_kind}_`;
  return record.record_id.startsWith(prefix)
    ? record.record_id.slice(prefix.length).replace(/[-_]+/gu, " ")
    : record.record_id.replace(/[-_]+/gu, " ");
}

function routeVariant(record: MtaCanonicalRecord): "sbs" | "local" | "limited_stop" | "express" | undefined {
  const values = nativeUniqueStrings([
    stringValue(record.payload.service_variant),
    stringValue(record.payload.route_type_normalized),
    stringValue(record.payload.route_type),
    ...payloadStrings(record.payload, ["route_id", "internal_route_id", "route_label", "route_name", "route", "branding_label"]),
    record.record_id,
    ...(record.record_aliases ?? []),
  ]).join(" ");
  const lower = values.toLowerCase();
  if (/\b(sbs|select_bus_service|select bus service)\b/u.test(lower) || /\+/u.test(values)) return "sbs";
  if (/\blocal\b/u.test(lower)) return "local";
  if (lower.includes("limited")) return "limited_stop";
  if (lower.includes("express")) return "express";
  return undefined;
}

function routeBaseFromText(value: string): string | undefined {
  const upper = value.toUpperCase().replace(/\+/gu, " SBS ").replace(/SELECT\s+BUS\s+SERVICE/gu, "SBS");
  const m14ad = /\bM\s*14\s*(?:A\s*\/\s*D|A\s*D|AD)\b/u.test(upper);
  const match = m14ad ? undefined : /\b(BX|[BMQS])\s*-?\s*(\d{1,3}[A-Z]?)/u.exec(upper);
  return m14ad ? "M14-AD" : match?.[1] && match[2] ? `${match[1]}${match[2]}` : undefined;
}

function routeBase(record: MtaCanonicalRecord): string | undefined {
  for (const value of nativeUniqueStrings([
    recordIdSurface(record),
    record.display_name,
    ...(record.record_aliases ?? []),
    ...payloadStrings(record.payload, LOOKUP_FIELDS_BY_KIND.route ?? []),
  ])) {
    const base = routeBaseFromText(value);
    if (base) return base;
  }
  return undefined;
}

function routeGeneratedAliases(record: MtaCanonicalRecord): string[] {
  const base = routeBase(record);
  if (!base) return [];
  const variant = routeVariant(record);
  if (variant === "sbs") return [`${base} SBS`, `${base} Select Bus Service`, `${base}+`];
  if (variant === "local") return [`${base} Local`];
  if (variant === "limited_stop") return [`${base} Limited`];
  if (variant === "express") return [`${base} Express`];
  return [base];
}

function isGenericRouteAliasForVariant(record: MtaCanonicalRecord, value: string): boolean {
  if (record.record_kind !== "route" || !routeVariant(record)) return false;
  const base = routeBase(record);
  if (!base) return false;
  const normalized = normalizeRelationshipReferenceValue(value);
  return normalized === normalizeRelationshipReferenceValue(base) ||
    normalized === normalizeRelationshipReferenceValue(`route ${base}`);
}

function shouldIndexValue(record: MtaCanonicalRecord, value: string): boolean {
  return !isGenericRouteAliasForVariant(record, value);
}

function isDataOnlyRouteScope(record: MtaCanonicalRecord): boolean {
  return record.record_kind === "route" && record.payload.route_record_scope === "data_only_scope";
}

function indexValues(record: MtaCanonicalRecord): string[] {
  const fields = LOOKUP_FIELDS_BY_KIND[record.record_kind] ?? [];
  const aliases = (record.record_aliases ?? []).filter((alias) => shouldIndexValue(record, alias));
  return nativeUniqueStrings([
    record.record_id,
    recordIdSurface(record),
    record.local_observation_id,
    record.display_name,
    ...aliases,
    ...payloadStrings(record.payload, fields).filter((value) => shouldIndexValue(record, value)),
    ...(record.record_kind === "route" ? routeGeneratedAliases(record) : []),
  ]).filter((value) => shouldIndexValue(record, value));
}

type ReferenceIndex = Map<MtaObservationKind, Map<string, MtaCanonicalRecord[]>>;

function uniqueByRecordId(records: readonly MtaCanonicalRecord[]): MtaCanonicalRecord[] {
  return [...new Map(records.map((record) => [record.record_id, record])).values()]
    .sort((left, right) => left.record_id.localeCompare(right.record_id));
}

function buildIndex(records: readonly MtaCanonicalRecord[]): ReferenceIndex {
  const index: ReferenceIndex = new Map();
  for (const record of records) {
    if (record.record_kind === "relation" || record.record_kind === "table" || record.record_kind === "source_gap") continue;
    if (isDataOnlyRouteScope(record)) continue;
    for (const value of indexValues(record)) {
      const key = normalizeRelationshipReferenceValue(value);
      if (!key) continue;
      const byKind = index.get(record.record_kind) ?? new Map<string, MtaCanonicalRecord[]>();
      const existing = byKind.get(key) ?? [];
      if (!existing.some((candidate) => candidate.record_id === record.record_id)) {
        byKind.set(key, [...existing, record]);
      }
      index.set(record.record_kind, byKind);
    }
  }
  return index;
}

function hasRouteVariantText(value: string): boolean {
  return /\b(sbs|local|limited|express)\b/u.test(normalizeRelationshipReferenceValue(value));
}

function routeVariantFromQuery(value: string): ReturnType<typeof routeVariant> {
  const key = normalizeRelationshipReferenceValue(value);
  if (/\bsbs\b/u.test(key)) return "sbs";
  if (/\blocal\b/u.test(key)) return "local";
  if (/\blimited\b/u.test(key)) return "limited_stop";
  if (/\bexpress\b/u.test(key)) return "express";
  return undefined;
}

function resolveRoute(
  value: string,
  records: readonly MtaCanonicalRecord[],
  index: ReferenceIndex,
): Resolution | undefined {
  const key = normalizeRelationshipReferenceValue(value);
  const exact = key ? index.get("route")?.get(key) ?? [] : [];
  const queryVariant = routeVariantFromQuery(value);
  const exactMatches = queryVariant ? exact.filter((record) => routeVariant(record) === queryVariant) : exact;
  const uniqueExact = uniqueByRecordId(exactMatches);
  if (uniqueExact.length === 1) {
    return {
      record: uniqueExact[0]!,
      targetKind: "route",
      confidence: "exact_canonical_match",
    };
  }

  const base = routeBaseFromText(value);
  if (!base) return undefined;
  const baseMatches = records.filter(
    (record) => record.record_kind === "route" && !isDataOnlyRouteScope(record) && routeBase(record) === base,
  );
  const variantMatches = queryVariant
    ? baseMatches.filter((record) => routeVariant(record) === queryVariant)
    : baseMatches;
  const uniqueBase = uniqueByRecordId(variantMatches);
  if (
    uniqueBase.length === 1 &&
    (queryVariant || (!hasRouteVariantText(value) && !routeVariant(uniqueBase[0]!)))
  ) {
    return {
      record: uniqueBase[0]!,
      targetKind: "route",
      confidence: queryVariant ? "exact_canonical_match" : "single_route_base_match",
    };
  }
  return undefined;
}

function resolveTarget(
  value: string,
  targetKinds: readonly MtaObservationKind[],
  records: readonly MtaCanonicalRecord[],
  index: ReferenceIndex,
): TargetResolution {
  const resolutions: Resolution[] = [];
  const candidateIds = new Set<string>();
  for (const kind of targetKinds) {
    if (kind === "route") {
      const route = resolveRoute(value, records, index);
      if (route) {
        resolutions.push(route);
        candidateIds.add(route.record.record_id);
      } else {
        for (const record of uniqueByRecordId(index.get("route")?.get(normalizeRelationshipReferenceValue(value)) ?? [])) {
          candidateIds.add(record.record_id);
        }
        const base = routeBaseFromText(value);
        if (base) {
          for (const record of records) {
            if (record.record_kind === "route" && !isDataOnlyRouteScope(record) && routeBase(record) === base) {
              candidateIds.add(record.record_id);
            }
          }
        }
      }
      continue;
    }
    const candidates = uniqueByRecordId(
      index.get(kind)?.get(normalizeRelationshipReferenceValue(value)) ?? [],
    );
    for (const candidate of candidates) candidateIds.add(candidate.record_id);
    if (candidates.length === 1) {
      resolutions.push({
        record: candidates[0]!,
        targetKind: kind,
        confidence: "exact_canonical_match",
      });
    }
  }
  const unique = [...new Map(resolutions.map((resolution) => [resolution.record.record_id, resolution])).values()];
  return {
    resolution: unique.length === 1 ? unique[0] : undefined,
    candidateIds: [...candidateIds].sort((left, right) => left.localeCompare(right)),
  };
}

function reviewedParentheticalTarget(
  value: string,
  targetKinds: readonly MtaObservationKind[],
  index: ReferenceIndex,
): string | undefined {
  if (targetKinds.includes("route")) return undefined;
  const match = /^\s*(.+?)\s*\(([^()]+)\)\s*$/u.exec(value);
  if (!match?.[1] || !match[2]) return undefined;
  if (match[1].trim().toLowerCase() === match[2].trim().toLowerCase()) return undefined;
  const parts = [match[1], match[2]].map(normalizeRelationshipReferenceValue).filter(Boolean);
  if (parts.length !== 2) return undefined;
  const idsByPart = parts.map((part) => {
    const ids = new Set<string>();
    for (const kind of targetKinds) {
      for (const record of index.get(kind)?.get(part) ?? []) ids.add(record.record_id);
    }
    return [...ids].sort((left, right) => left.localeCompare(right));
  });
  if (idsByPart.some((ids) => ids.length !== 1)) return undefined;
  return idsByPart[0]![0] === idsByPart[1]![0] ? idsByPart[0]![0] : undefined;
}

function relationKey(relationKind: string, subjectId: string, objectId: string): string {
  return `${normalizeRelationKind(relationKind)}\0${subjectId}\0${objectId}`;
}

function existingRelationsByKey(records: readonly MtaCanonicalRecord[]): Map<string, MtaCanonicalRecord[]> {
  const result = new Map<string, MtaCanonicalRecord[]>();
  for (const record of records) {
    if (record.record_kind !== "relation") continue;
    const relationKind = stringValue(record.payload.relation_kind);
    const subjectId = stringValue(record.payload.subject_id);
    const objectId = stringValue(record.payload.object_id);
    if (!relationKind || !subjectId || !objectId) continue;
    const key = relationKey(relationKind, subjectId, objectId);
    result.set(key, [...(result.get(key) ?? []), record]);
  }
  for (const values of result.values()) values.sort((left, right) => left.record_id.localeCompare(right.record_id));
  return result;
}

function relationEndpoints(
  rule: RelationshipReferenceRule,
  origin: MtaCanonicalRecord,
  target: MtaCanonicalRecord,
): { subject: MtaCanonicalRecord; object: MtaCanonicalRecord } {
  return rule.direction === "origin_to_target"
    ? { subject: origin, object: target }
    : { subject: target, object: origin };
}

function sortedEvidenceRefs(refs: readonly MtaEvidenceRef[]): MtaEvidenceRef[] {
  return [...refs]
    .map((ref) => JSON.parse(JSON.stringify(ref)) as MtaEvidenceRef)
    .sort((left, right) => stableJson(left as unknown as JsonValue).localeCompare(stableJson(right as unknown as JsonValue)));
}

function evidenceId(ref: MtaEvidenceRef): string | undefined {
  if (ref.evidence_id?.trim()) return ref.evidence_id.trim();
  if (ref.source_id && ref.block_id) return `${ref.source_id}#${ref.block_id}`;
  return undefined;
}

function evidenceStatus(
  refs: readonly MtaEvidenceRef[],
  index: EvidenceBlockIndex | undefined,
): { status: RelationshipReferenceAuditRow["evidence_status"]; details: string[] } {
  if (refs.length === 0) return { status: "missing", details: ["origin record has no evidence_refs"] };
  if (!index) return { status: "exact", details: [] };
  const details: string[] = [];
  for (const ref of refs) {
    if (!ref.source_id || !ref.block_id) {
      details.push("evidence ref lacks source_id or block_id");
      continue;
    }
    const entry = index.byRef.get(`${ref.source_id}\0${ref.block_id}`);
    if (!entry) {
      details.push(`${ref.source_id}#${ref.block_id} is absent from the evidence block index`);
      continue;
    }
    if (ref.evidence_id !== `${ref.source_id}#${ref.block_id}`) {
      details.push(`${ref.source_id}#${ref.block_id} has a non-exact evidence_id`);
    }
    if (ref.source_path !== entry.source_path) {
      details.push(`${ref.source_id}#${ref.block_id} source_path does not match the indexed block`);
    }
    if (ref.page_number !== entry.page_number) {
      details.push(`${ref.source_id}#${ref.block_id} page_number does not match the indexed block`);
    }
    if (ref.text_sha256 !== entry.raw_text_sha256) {
      details.push(`${ref.source_id}#${ref.block_id} text_sha256 does not match the indexed block`);
    }
  }
  return details.length > 0 ? { status: "unresolved", details: uniqueStrings(details) } : { status: "exact", details: [] };
}

function isRouteLikeReference(value: string): boolean {
  const upper = value.toUpperCase().replace(/\+/gu, " SBS ");
  return (
    /\b(?:SIM|BX|[BMQS])\s*-?\s*\d{1,3}[A-Z]?\b/u.test(upper) ||
    /\bM\s*14\s*(?:A\s*\/\s*D|A\s*D|AD)\b/u.test(upper)
  );
}

function referenceId(rule: RelationshipReferenceRule, origin: MtaCanonicalRecord, field: string, rawValue: JsonValue): string {
  return `relationship-reference-v1:${shortHash({
    rule_id: rule.rule_id,
    origin_record_id: origin.record_id,
    field,
    raw_value: rawValue,
  }, 24)}`;
}

function findingSeverity(code: RelationshipReferenceFindingCode, mode: RelationshipReferenceMode): "warning" | "error" {
  if (
    code === "RELREF_REVIEWED_UNRESOLVED" ||
    code === "RELREF_REVIEWED_AMBIGUOUS" ||
    code === "RELREF_REVIEWED_CONTEXT_LITERAL" ||
    code === "RELREF_REVIEWED_SELF_REFERENCE" ||
    code === "RELREF_REVIEWED_TEMPORAL_SCOPE_MISMATCH"
  ) {
    return "warning";
  }
  return mode === "enforce" ? "error" : "warning";
}

function makeFinding(
  mode: RelationshipReferenceMode,
  input: Omit<RelationshipReferenceFinding, "schema_version" | "contract_id" | "finding_id" | "severity">,
): RelationshipReferenceFinding {
  return {
    schema_version: 1,
    contract_id: "relationship-reference-contract-v1",
    finding_id: `relationship-reference-finding-v1:${shortHash(input as unknown as JsonValue, 24)}`,
    severity: findingSeverity(input.code, mode),
    ...input,
  };
}

function derivedEdgeMatchesOrigin(
  relation: MtaCanonicalRecord,
  origin: MtaCanonicalRecord,
  field: string,
  value: string,
): boolean {
  return (
    relation.payload.derived_relation === true &&
    relation.payload.derived_from_record_id === origin.record_id &&
    relation.payload.derived_from_payload_field === field &&
    relation.payload.derived_from_payload_value === value
  );
}

type MutableCoverage = RelationshipReferenceCoverage & { records: Set<string> };

function coverageKey(ruleId: string, field: string): string {
  return `${ruleId}\0${field}`;
}

function emptyCoverage(rule: RelationshipReferenceRule, field: string): MutableCoverage {
  return {
    rule_id: rule.rule_id,
    origin_kind: rule.origin_kind,
    field,
    relation_kind: normalizeRelationKind(rule.relation_kind),
    records_with_field: 0,
    value_count: 0,
    invalid_value_count: 0,
    exact_resolved_derived_edge_count: 0,
    already_present_edge_count: 0,
    supportable_missing_edge_count: 0,
    reviewed_non_edge_count: 0,
    unresolved_count: 0,
    ambiguous_count: 0,
    skipped_self_count: 0,
    records: new Set<string>(),
  };
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function decisionMatchesGroup(
  decision: RelationshipReferenceReviewDecision,
  group: RelationshipReferenceGroup,
): string[] {
  const issues: string[] = [];
  const checks: Array<[string, string[], string[]]> = [
    ["origin_record_ids", decision.origin_record_ids, group.origin_record_ids],
    ["source_ids_checked", decision.source_ids_checked, group.source_ids_checked],
    ["evidence_ids_checked", decision.evidence_ids_checked, group.evidence_ids_checked],
    [
      "canonical_candidate_ids_checked",
      decision.canonical_candidate_ids_checked,
      group.canonical_candidate_ids_checked,
    ],
  ];
  for (const [field, actual, expected] of checks) {
    if (stableJson(actual as unknown as JsonValue) !== stableJson(expected as unknown as JsonValue)) {
      issues.push(`${field} does not exactly match the current group`);
    }
  }
  if (decision.proposed_target_record_id !== group.proposed_target_record_id) {
    issues.push("proposed_target_record_id does not match the current canonical index review");
  }
  return issues;
}

function nativeCoverageMismatches(
  policyCoverage: readonly RelationshipReferenceCoverage[],
  nativeCoverage: readonly DerivedRelationCoverage[],
): Array<{ key: string; detail: string }> {
  const policyByKey = new Map(policyCoverage.map((row) => [coverageKey(row.rule_id, row.field), row]));
  const nativeByKey = new Map(nativeCoverage.map((row) => [coverageKey(row.rule_id, row.field), row]));
  const mismatches: Array<{ key: string; detail: string }> = [];
  const keys = [...new Set([...policyByKey.keys(), ...nativeByKey.keys()])].sort();
  for (const key of keys) {
    const policy = policyByKey.get(key);
    const native = nativeByKey.get(key);
    if (!policy || !native) {
      mismatches.push({
        key,
        detail: !policy ? "native generator field has no v1 reference policy" : "v1 reference policy field is absent from the native generator",
      });
      continue;
    }
    const comparisons: Array<[string, number, number]> = [
      ["records_with_field", policy.records_with_field, native.records_with_field],
      ["value_count", policy.value_count, native.value_count],
      [
        "already_present_count",
        policy.exact_resolved_derived_edge_count + policy.already_present_edge_count,
        native.already_present_count,
      ],
      [
        "derived_count",
        policy.supportable_missing_edge_count,
        native.derived_count,
      ],
      [
        "skipped_reviewed_non_edge_count",
        policy.reviewed_non_edge_count,
        native.skipped_reviewed_non_edge_count,
      ],
      ["unresolved_count", policy.unresolved_count, native.unresolved_count],
      ["ambiguous_count", policy.ambiguous_count, native.ambiguous_count],
      ["skipped_self_count", policy.skipped_self_count, native.skipped_self_count],
    ];
    for (const [field, actual, expected] of comparisons) {
      if (actual !== expected) mismatches.push({ key, detail: `${field}: audit=${actual}, native=${expected}` });
    }
  }
  return mismatches;
}

function proposedRemediations(rows: readonly RelationshipReferenceAuditRow[]): RelationshipReferenceProposedRemediation[] {
  type ProposalSeed = {
    remediation_kind: RelationshipReferenceProposedRemediation["remediation_kind"];
    rule_id: string;
    field: string;
    relation_kind: string;
    subject_id: string;
    object_id: string;
    target_record_id: string;
    native_resolution: RelationshipReferenceProposedRemediation["native_resolution"];
    references: RelationshipReferenceAuditRow[];
  };
  const byKey = new Map<string, ProposalSeed>();
  for (const row of rows) {
    if (
      row.primary_disposition !== "supportable_missing_edge" &&
      row.primary_disposition !== "reviewed_supportable_resolution"
    ) {
      continue;
    }
    if (!row.relation_subject_id || !row.relation_object_id || !row.target_record_id) continue;
    const remediationKind = "materialize_evidence_bound_relation" as const;
    const nativeResolution = row.primary_disposition === "supportable_missing_edge"
      ? "resolved_missing_edge"
      : "reviewed_target_not_natively_resolved";
    const key = [
      remediationKind,
      row.rule_id,
      row.field,
      row.relation_kind,
      row.relation_subject_id,
      row.relation_object_id,
      row.target_record_id,
    ].join("\0");
    const seed = byKey.get(key) ?? {
      remediation_kind: remediationKind,
      rule_id: row.rule_id,
      field: row.field,
      relation_kind: row.relation_kind,
      subject_id: row.relation_subject_id,
      object_id: row.relation_object_id,
      target_record_id: row.target_record_id,
      native_resolution: nativeResolution,
      references: [],
    };
    seed.references.push(row);
    byKey.set(key, seed);
  }
  return [...byKey.values()].map((seed) => {
    const originEvidenceRefs = [
      ...new Map(seed.references.flatMap((row) => row.origin_evidence_refs).map((ref) => [
        stableJson(ref as unknown as JsonValue),
        ref,
      ])).values(),
    ].sort((left, right) => stableJson(left as unknown as JsonValue).localeCompare(stableJson(right as unknown as JsonValue)));
    const identity = {
      remediation_kind: seed.remediation_kind,
      rule_id: seed.rule_id,
      field: seed.field,
      relation_kind: seed.relation_kind,
      subject_id: seed.subject_id,
      object_id: seed.object_id,
      target_record_id: seed.target_record_id,
    };
    return {
      schema_version: 1,
      contract_id: "relationship-reference-contract-v1",
      proposal_id: `relationship-reference-proposal-v1:${shortHash(identity as unknown as JsonValue, 24)}`,
      ...identity,
      native_resolution: seed.native_resolution,
      supporting_reference_ids: uniqueStrings(seed.references.map((row) => row.reference_id)),
      origin_record_ids: uniqueStrings(seed.references.map((row) => row.origin_record_id)),
      origin_evidence_refs: originEvidenceRefs,
      reason: seed.native_resolution === "resolved_missing_edge"
        ? "The native deterministic resolver proves one canonical target and exact endpoints, but the projected graph does not yet contain the evidence-bound edge. Preserve the source payload literal and materialize only the relation supported by the origin evidence."
        : "The long-name and parenthetical acronym surfaces converge on one canonical target, and the projected graph does not yet contain the evidence-bound edge. Preserve the source payload literal; materialize the relation without promoting the full literal to an identity alias.",
      status: "pending_canonical_correction",
      apply_automatically: false,
    } satisfies RelationshipReferenceProposedRemediation;
  }).sort((left, right) => left.proposal_id.localeCompare(right.proposal_id));
}

export function auditRelationshipPayloadReferences(
  records: readonly MtaCanonicalRecord[],
  loaded: LoadedRelationshipReferenceContract,
  options: AuditOptions = {},
): RelationshipReferenceAudit {
  const mode = options.mode ?? "warn";
  const index = buildIndex(records);
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const relationRecordsByKey = existingRelationsByKey(records);
  const relationKeys = new Set(relationRecordsByKey.keys());
  const rows: RelationshipReferenceAuditRow[] = [];
  const findings: RelationshipReferenceFinding[] = [];
  const mutableCoverage = new Map<string, MutableCoverage>();
  const reviewGroupRows = new Map<string, RelationshipReferenceAuditRow[]>();

  for (const rule of loaded.contract.rules) {
    const origins = records.filter((record) => record.record_kind === rule.origin_kind);
    for (const field of rule.fields) {
      const summary = mutableCoverage.get(coverageKey(rule.rule_id, field)) ?? emptyCoverage(rule, field);
      for (const origin of origins) {
        const validValues = nativeUniqueStrings(stringValues(origin.payload[field]));
        const invalid = invalidValues(origin.payload[field]);
        if (validValues.length > 0) summary.records.add(origin.record_id);
        for (const rawValue of invalid) {
          summary.invalid_value_count += 1;
          const id = referenceId(rule, origin, field, rawValue);
          const evidence = sortedEvidenceRefs(origin.evidence_refs);
          const status = evidenceStatus(evidence, options.evidenceIndex);
          const row: RelationshipReferenceAuditRow = {
            schema_version: 1,
            contract_id: "relationship-reference-contract-v1",
            reference_id: id,
            rule_id: rule.rule_id,
            origin_record_id: origin.record_id,
            origin_kind: origin.record_kind,
            field,
            value: null,
            raw_value: rawValue,
            normalized_value: null,
            native_resolution: "invalid",
            resolution_confidence: null,
            target_record_id: null,
            candidate_record_ids: [],
            relation_kind: normalizeRelationKind(rule.relation_kind),
            relation_subject_id: null,
            relation_object_id: null,
            matching_relation_ids: [],
            review_decision_id: null,
            primary_disposition: "invalid_unreviewed_value",
            reasons: ["payload_field_value_is_not_a_non_empty_string"],
            evidence_status: status.status,
            origin_evidence_refs: evidence,
          };
          rows.push(row);
          findings.push(makeFinding(mode, {
            code: "RELREF_INVALID_VALUE",
            reference_id: id,
            decision_id: null,
            rule_id: rule.rule_id,
            origin_record_id: origin.record_id,
            field,
            normalized_value: null,
            detail: `Relationship-like payload field contains an invalid value: ${stableJson(rawValue)}`,
          }));
          if (status.status !== "exact") {
            findings.push(makeFinding(mode, {
              code: status.status === "missing" ? "RELREF_EVIDENCE_MISSING" : "RELREF_EVIDENCE_UNRESOLVED",
              reference_id: id,
              decision_id: null,
              rule_id: rule.rule_id,
              origin_record_id: origin.record_id,
              field,
              normalized_value: null,
              detail: status.details.join("; "),
            }));
          }
        }

        for (const value of validValues) {
          summary.value_count += 1;
          const normalizedValue = normalizeRelationshipReferenceValue(value);
          const id = referenceId(rule, origin, field, value);
          const evidence = sortedEvidenceRefs(origin.evidence_refs);
          const evidenceCheck = evidenceStatus(evidence, options.evidenceIndex);
          const { resolution, candidateIds } = resolveTarget(value, rule.target_kinds, records, index);
          let nativeResolution: RelationshipReferenceAuditRow["native_resolution"];
          let primaryDisposition: RelationshipReferencePrimaryDisposition;
          let targetRecordId: string | null = null;
          let subjectId: string | null = null;
          let objectId: string | null = null;
          let matchingRelationIds: string[] = [];
          let resolutionConfidence: Resolution["confidence"] | null = null;
          let decision: RelationshipReferenceReviewDecision | undefined;
          const reasons: string[] = [];

          if (!resolution) {
            nativeResolution = candidateIds.length > 1 ? "ambiguous" : "unresolved";
            if (nativeResolution === "ambiguous") summary.ambiguous_count += 1;
            else summary.unresolved_count += 1;
            const reviewedTarget = nativeResolution === "unresolved"
              ? reviewedParentheticalTarget(value, rule.target_kinds, index)
              : undefined;
            targetRecordId = reviewedTarget ?? null;
            const candidateIdsChecked = uniqueStrings([
              ...candidateIds,
              ...(reviewedTarget ? [reviewedTarget] : []),
            ]);
            const decisionKey = relationshipReferenceDecisionKey({
              rule_id: rule.rule_id,
              field,
              normalized_value: normalizedValue,
              native_resolution: nativeResolution,
            });
            decision = loaded.decisions_by_key.get(decisionKey);
            if (decision?.primary_disposition === "reviewed_supportable_canonical_target") {
              const target = decision.proposed_target_record_id
                ? recordsById.get(decision.proposed_target_record_id)
                : undefined;
              if (target && rule.target_kinds.includes(target.record_kind)) {
                targetRecordId = target.record_id;
                const endpoints = relationEndpoints(rule, origin, target);
                subjectId = endpoints.subject.record_id;
                objectId = endpoints.object.record_id;
                matchingRelationIds = (relationRecordsByKey.get(
                  relationKey(rule.relation_kind, subjectId, objectId),
                ) ?? []).map((record) => record.record_id);
                if (matchingRelationIds.length > 0) {
                  primaryDisposition = "reviewed_supportable_existing_edge";
                  reasons.push("reviewed_canonical_target_has_existing_evidence_bound_edge");
                } else {
                  primaryDisposition = "reviewed_supportable_resolution";
                  reasons.push("reviewed_long_name_and_parenthetical_acronym_converge_on_one_canonical_target");
                }
              } else {
                primaryDisposition = nativeResolution === "ambiguous"
                  ? "unreviewed_ambiguous_reference"
                  : "unreviewed_unresolved_reference";
                reasons.push("review_decision_target_is_missing_or_wrong_type");
              }
            } else if (decision?.primary_disposition === "reviewed_non_authoritative_context_literal") {
              primaryDisposition = "reviewed_non_authoritative_context_literal";
              reasons.push("reviewed_field_literal_does_not_assert_a_canonical_endpoint_at_required_precision");
            } else if (decision?.primary_disposition === "reviewed_ambiguous_reference_claim") {
              primaryDisposition = "reviewed_ambiguous_reference";
              reasons.push("reviewed_multiple_canonical_candidates_no_identity_guess");
            } else if (decision?.primary_disposition === "reviewed_unresolved_reference_claim") {
              primaryDisposition = "reviewed_unresolved_reference";
              reasons.push("reviewed_no_canonical_target_proved");
            } else {
              primaryDisposition = nativeResolution === "ambiguous"
                ? "unreviewed_ambiguous_reference"
                : "unreviewed_unresolved_reference";
              reasons.push(nativeResolution === "ambiguous"
                ? "multiple_canonical_candidates_unreviewed"
                : "no_canonical_target_unreviewed");
            }
            const provisionalRow: RelationshipReferenceAuditRow = {
              schema_version: 1,
              contract_id: "relationship-reference-contract-v1",
              reference_id: id,
              rule_id: rule.rule_id,
              origin_record_id: origin.record_id,
              origin_kind: origin.record_kind,
              field,
              value,
              raw_value: value,
              normalized_value: normalizedValue,
              native_resolution: nativeResolution,
              resolution_confidence: null,
              target_record_id: targetRecordId,
              candidate_record_ids: candidateIdsChecked,
              relation_kind: normalizeRelationKind(rule.relation_kind),
              relation_subject_id: subjectId,
              relation_object_id: objectId,
              matching_relation_ids: matchingRelationIds,
              review_decision_id: decision?.decision_id ?? null,
              primary_disposition: primaryDisposition,
              reasons: uniqueStrings(reasons),
              evidence_status: evidenceCheck.status,
              origin_evidence_refs: evidence,
            };
            const groupKey = relationshipReferenceDecisionKey({
              rule_id: rule.rule_id,
              field,
              normalized_value: normalizedValue,
              native_resolution: nativeResolution,
            });
            reviewGroupRows.set(groupKey, [...(reviewGroupRows.get(groupKey) ?? []), provisionalRow]);
            rows.push(provisionalRow);
          } else {
            targetRecordId = resolution.record.record_id;
            resolutionConfidence = resolution.confidence;
            const endpoints = relationEndpoints(rule, origin, resolution.record);
            subjectId = endpoints.subject.record_id;
            objectId = endpoints.object.record_id;
            let reviewResolution: Exclude<
              RelationshipReferenceReviewResolution,
              "unresolved" | "ambiguous"
            > | null = null;
            if (rule.skip_self && subjectId === objectId) {
              nativeResolution = "self_skipped";
              summary.skipped_self_count += 1;
              if (rule.rule_id === "project-program") {
                reviewResolution = "resolved_self_reference";
                const reviewKey = relationshipReferenceDecisionKey({
                  rule_id: rule.rule_id,
                  field,
                  normalized_value: normalizedValue,
                  native_resolution: reviewResolution,
                });
                decision = loaded.decisions_by_key.get(reviewKey);
                primaryDisposition = decision?.primary_disposition === "reviewed_non_authoritative_self_reference"
                  ? "reviewed_non_authoritative_self_reference"
                  : "unreviewed_self_reference";
                reasons.push(decision
                  ? "reviewed_project_program_literal_resolves_to_origin_and_is_suppressed_by_the_versioned_rule"
                  : "suppressed_project_program_self_reference_has_no_exact_review_decision");
              } else {
                primaryDisposition = "self_reference_skipped";
                reasons.push("versioned_rule_explicitly_skips_self_edge");
              }
            } else {
              nativeResolution = "resolved";
              const key = relationKey(rule.relation_kind, subjectId, objectId);
              const matches = relationRecordsByKey.get(key) ?? [];
              matchingRelationIds = matches.map((record) => record.record_id);
              const unsafeSelfReference = subjectId === objectId;
              const temporalReviewKey = relationshipReferenceDecisionKey({
                rule_id: rule.rule_id,
                field,
                normalized_value: normalizedValue,
                native_resolution: "resolved_temporal_scope_mismatch",
              });
              const temporalDecision = unsafeSelfReference
                ? undefined
                : loaded.decisions_by_key.get(temporalReviewKey);
              reviewResolution = unsafeSelfReference
                ? "resolved_self_reference"
                : temporalDecision
                  ? "resolved_temporal_scope_mismatch"
                  : null;

              if (reviewResolution) {
                const reviewKey = relationshipReferenceDecisionKey({
                  rule_id: rule.rule_id,
                  field,
                  normalized_value: normalizedValue,
                  native_resolution: reviewResolution,
                });
                decision = loaded.decisions_by_key.get(reviewKey);
                if (reviewResolution === "resolved_self_reference") {
                  if (relationKeys.has(key)) {
                    if (matches.some((relation) => derivedEdgeMatchesOrigin(relation, origin, field, value))) {
                      summary.exact_resolved_derived_edge_count += 1;
                    } else {
                      summary.already_present_edge_count += 1;
                    }
                  } else {
                    summary.reviewed_non_edge_count += 1;
                  }
                  primaryDisposition = decision?.primary_disposition === "reviewed_non_authoritative_self_reference"
                    ? "reviewed_non_authoritative_self_reference"
                    : "unreviewed_self_reference";
                  reasons.push(decision
                    ? "reviewed_project_program_literal_resolves_to_origin_and_cannot_form_a_physical_edge"
                    : "resolved_project_program_self_reference_has_no_exact_review_decision");
                } else {
                  summary.reviewed_non_edge_count += 1;
                  primaryDisposition = "reviewed_temporal_scope_mismatch";
                  reasons.push("reviewed_source_lifecycle_scope_excludes_the_mechanically_resolved_target");
                  if (matches.length > 0) {
                    reasons.push("forbidden_reviewed_non_edge_is_present");
                  }
                }
              } else if (relationKeys.has(key)) {
                if (matches.some((relation) => derivedEdgeMatchesOrigin(relation, origin, field, value))) {
                  primaryDisposition = "exact_resolved_derived_edge";
                  summary.exact_resolved_derived_edge_count += 1;
                  reasons.push("native_exact_resolution_has_origin_attributed_derived_edge");
                } else {
                  primaryDisposition = "already_present_edge";
                  summary.already_present_edge_count += 1;
                  reasons.push("native_exact_resolution_triple_already_exists");
                }
              } else {
                primaryDisposition = "supportable_missing_edge";
                summary.supportable_missing_edge_count += 1;
                relationKeys.add(key);
                reasons.push("native_exact_resolution_proves_missing_edge");
              }
            }
            const resolvedRow: RelationshipReferenceAuditRow = {
              schema_version: 1,
              contract_id: "relationship-reference-contract-v1",
              reference_id: id,
              rule_id: rule.rule_id,
              origin_record_id: origin.record_id,
              origin_kind: origin.record_kind,
              field,
              value,
              raw_value: value,
              normalized_value: normalizedValue,
              native_resolution: nativeResolution,
              resolution_confidence: resolutionConfidence,
              target_record_id: targetRecordId,
              candidate_record_ids: candidateIds,
              relation_kind: normalizeRelationKind(rule.relation_kind),
              relation_subject_id: subjectId,
              relation_object_id: objectId,
              matching_relation_ids: matchingRelationIds,
              review_decision_id: decision?.decision_id ?? null,
              primary_disposition: primaryDisposition,
              reasons: uniqueStrings(reasons),
              evidence_status: evidenceCheck.status,
              origin_evidence_refs: evidence,
            };
            rows.push(resolvedRow);
            if (reviewResolution) {
              const groupKey = relationshipReferenceDecisionKey({
                rule_id: rule.rule_id,
                field,
                normalized_value: normalizedValue,
                native_resolution: reviewResolution,
              });
              reviewGroupRows.set(groupKey, [...(reviewGroupRows.get(groupKey) ?? []), resolvedRow]);
            }
          }

          const row = rows.at(-1)!;
          if (evidenceCheck.status !== "exact") {
            findings.push(makeFinding(mode, {
              code: evidenceCheck.status === "missing" ? "RELREF_EVIDENCE_MISSING" : "RELREF_EVIDENCE_UNRESOLVED",
              reference_id: id,
              decision_id: decision?.decision_id ?? null,
              rule_id: rule.rule_id,
              origin_record_id: origin.record_id,
              field,
              normalized_value: normalizedValue,
              detail: evidenceCheck.details.join("; "),
            }));
          }
          const findingCodeByDisposition: Partial<Record<
            RelationshipReferencePrimaryDisposition,
            RelationshipReferenceFindingCode
          >> = {
            supportable_missing_edge: "RELREF_SUPPORTABLE_RESOLUTION_PENDING",
            reviewed_supportable_resolution: "RELREF_SUPPORTABLE_RESOLUTION_PENDING",
            reviewed_non_authoritative_context_literal: "RELREF_REVIEWED_CONTEXT_LITERAL",
            reviewed_non_authoritative_self_reference: "RELREF_REVIEWED_SELF_REFERENCE",
            reviewed_temporal_scope_mismatch: "RELREF_REVIEWED_TEMPORAL_SCOPE_MISMATCH",
            reviewed_unresolved_reference: "RELREF_REVIEWED_UNRESOLVED",
            reviewed_ambiguous_reference: "RELREF_REVIEWED_AMBIGUOUS",
            unreviewed_self_reference: "RELREF_UNREVIEWED_SELF_REFERENCE",
            unreviewed_unresolved_reference: "RELREF_UNREVIEWED_UNRESOLVED",
            unreviewed_ambiguous_reference: "RELREF_UNREVIEWED_AMBIGUOUS",
          };
          const code = findingCodeByDisposition[row.primary_disposition];
          if (code) {
            findings.push(makeFinding(mode, {
              code,
              reference_id: id,
              decision_id: decision?.decision_id ?? null,
              rule_id: rule.rule_id,
              origin_record_id: origin.record_id,
              field,
              normalized_value: normalizedValue,
              detail: row.reasons.join("; "),
            }));
          }
          if (
            row.primary_disposition === "reviewed_temporal_scope_mismatch" &&
            row.matching_relation_ids.length > 0
          ) {
            findings.push(makeFinding(mode, {
              code: "RELREF_REVIEWED_NON_EDGE_PRESENT",
              reference_id: id,
              decision_id: decision?.decision_id ?? null,
              rule_id: rule.rule_id,
              origin_record_id: origin.record_id,
              field,
              normalized_value: normalizedValue,
              detail: `reviewed non-edge is present as ${row.matching_relation_ids.join(", ")}`,
            }));
          }
        }
      }
      summary.records_with_field = summary.records.size;
      mutableCoverage.set(coverageKey(rule.rule_id, field), summary);
    }
  }

  const coverage = loaded.contract.rules.flatMap((rule) => rule.fields.map((field) => {
    const row = mutableCoverage.get(coverageKey(rule.rule_id, field)) ?? emptyCoverage(rule, field);
    const { records: _records, ...immutable } = row;
    return immutable;
  }));

  const groups: RelationshipReferenceGroup[] = [...reviewGroupRows.entries()].map(([key, groupRows]) => {
    const first = groupRows[0]!;
    const rule = loaded.rules_by_id.get(first.rule_id)!;
    const proposedTarget = uniqueStrings(groupRows.map((row) => row.target_record_id ?? undefined));
    const everyRowProvesSameTarget = proposedTarget.length === 1 &&
      groupRows.every((row) => row.target_record_id === proposedTarget[0]);
    const candidateIds = uniqueStrings(groupRows.flatMap((row) => row.candidate_record_ids));
    const group: RelationshipReferenceGroup = {
      schema_version: 1,
      contract_id: "relationship-reference-contract-v1",
      group_id: `relationship-reference-group-v1:${shortHash(key, 24)}`,
      rule_id: first.rule_id,
      field: first.field,
      normalized_value: first.normalized_value!,
      literal_values: uniqueStrings(groupRows.map((row) => row.value ?? undefined)),
      native_resolution: key.split("\0").at(-1) as RelationshipReferenceReviewResolution,
      review_strategy: rule.unresolved_review_strategy,
      context_literal_by_policy: rule.context_literal_fields.includes(first.field),
      route_like_value: groupRows.some((row) => Boolean(row.value && isRouteLikeReference(row.value))),
      reference_count: groupRows.length,
      origin_record_ids: uniqueStrings(groupRows.map((row) => row.origin_record_id)),
      source_ids_checked: uniqueStrings(groupRows.flatMap((row) => row.origin_evidence_refs.map((ref) => ref.source_id))),
      evidence_ids_checked: uniqueStrings(groupRows.flatMap((row) => row.origin_evidence_refs.map(evidenceId))),
      canonical_candidate_ids_checked: candidateIds,
      proposed_target_record_id:
        (first.native_resolution === "unresolved" || first.native_resolution === "ambiguous") &&
        everyRowProvesSameTarget
          ? proposedTarget[0]!
          : null,
      review_decision_id: first.review_decision_id,
      review_primary_disposition: first.review_decision_id
        ? loaded.decisions.find((decision) => decision.decision_id === first.review_decision_id)?.primary_disposition ?? null
        : null,
    };
    const decision = loaded.decisions_by_key.get(key);
    if (decision) {
      for (const issue of decisionMatchesGroup(decision, group)) {
        findings.push(makeFinding(mode, {
          code: "RELREF_REVIEW_DECISION_STALE",
          reference_id: null,
          decision_id: decision.decision_id,
          rule_id: group.rule_id,
          origin_record_id: null,
          field: group.field,
          normalized_value: group.normalized_value,
          detail: issue,
        }));
      }
      if (
        decision.proposed_target_record_id &&
        (!recordsById.has(decision.proposed_target_record_id) ||
          !rule.target_kinds.includes(recordsById.get(decision.proposed_target_record_id)!.record_kind))
      ) {
        findings.push(makeFinding(mode, {
          code: "RELREF_REVIEW_DECISION_INVALID",
          reference_id: null,
          decision_id: decision.decision_id,
          rule_id: group.rule_id,
          origin_record_id: null,
          field: group.field,
          normalized_value: group.normalized_value,
          detail: "proposed target is missing or is not an allowed endpoint kind",
        }));
      }
    }
    return group;
  }).sort(
    (left, right) =>
      right.reference_count - left.reference_count ||
      left.rule_id.localeCompare(right.rule_id) ||
      left.field.localeCompare(right.field) ||
      left.normalized_value.localeCompare(right.normalized_value) ||
      left.native_resolution.localeCompare(right.native_resolution),
  );

  const activeDecisionIds = new Set(groups.flatMap((group) => group.review_decision_id ? [group.review_decision_id] : []));
  for (const decision of loaded.decisions) {
    if (activeDecisionIds.has(decision.decision_id)) continue;
    findings.push(makeFinding(mode, {
      code: "RELREF_REVIEW_DECISION_STALE",
      reference_id: null,
      decision_id: decision.decision_id,
      rule_id: decision.rule_id,
      origin_record_id: null,
      field: decision.field,
      normalized_value: decision.normalized_value,
      detail: "review decision no longer matches a current relationship-reference review group",
    }));
  }

  const nativeCoverage = options.checkNativeCoverage === false ? [] : derivedRelationCoverage([...records]);
  const coverageMismatches = options.checkNativeCoverage === false
    ? []
    : nativeCoverageMismatches(coverage, nativeCoverage);
  const policyKeys = new Set(coverage.map((row) => coverageKey(row.rule_id, row.field)));
  const nativeKeys = new Set(nativeCoverage.map((row) => coverageKey(row.rule_id, row.field)));
  const driftKeys = options.checkNativeCoverage === false
    ? []
    : [...new Set([
      ...[...policyKeys].filter((key) => !nativeKeys.has(key)),
      ...[...nativeKeys].filter((key) => !policyKeys.has(key)),
    ])].sort();
  for (const key of driftKeys) {
    findings.push(makeFinding(mode, {
      code: "RELREF_POLICY_RULE_DRIFT",
      reference_id: null,
      decision_id: null,
      rule_id: key.split("\0")[0] ?? null,
      origin_record_id: null,
      field: key.split("\0")[1] ?? null,
      normalized_value: null,
      detail: policyKeys.has(key)
        ? "versioned reference policy field is absent from the native derived relation generator"
        : "native derived relation generator field has no versioned reference policy",
    }));
  }
  for (const mismatch of coverageMismatches) {
    findings.push(makeFinding(mode, {
      code: "RELREF_NATIVE_COVERAGE_MISMATCH",
      reference_id: null,
      decision_id: null,
      rule_id: mismatch.key.split("\0")[0] ?? null,
      origin_record_id: null,
      field: mismatch.key.split("\0")[1] ?? null,
      normalized_value: null,
      detail: mismatch.detail,
    }));
  }

  const sortedRows = rows.sort(
    (left, right) =>
      left.rule_id.localeCompare(right.rule_id) ||
      left.field.localeCompare(right.field) ||
      left.origin_record_id.localeCompare(right.origin_record_id) ||
      stableJson(left.raw_value).localeCompare(stableJson(right.raw_value)),
  );
  const sortedFindings = findings.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      (left.rule_id ?? "").localeCompare(right.rule_id ?? "") ||
      (left.field ?? "").localeCompare(right.field ?? "") ||
      (left.origin_record_id ?? "").localeCompare(right.origin_record_id ?? "") ||
      (left.normalized_value ?? "").localeCompare(right.normalized_value ?? "") ||
      left.finding_id.localeCompare(right.finding_id),
  );
  const remediationRows = proposedRemediations(sortedRows);
  const primaryDispositions: Record<string, number> = {};
  for (const row of sortedRows) increment(primaryDispositions, row.primary_disposition);
  const findingsByCode: Record<string, number> = {};
  for (const finding of sortedFindings) increment(findingsByCode, finding.code);
  const primaryCount = (primary: RelationshipReferencePrimaryDisposition) =>
    primaryDispositions[primary] ?? 0;
  if (new Set(sortedRows.map((row) => row.reference_id)).size !== sortedRows.length) {
    throw new Error("relationship reference audit produced duplicate reference_id values");
  }
  const coveredValidValues = coverage.reduce((sum, row) => sum + row.value_count, 0);
  const coveredInvalidValues = coverage.reduce((sum, row) => sum + row.invalid_value_count, 0);
  const validRows = sortedRows.filter((row) => row.native_resolution !== "invalid").length;
  const invalidRows = sortedRows.length - validRows;
  if (coveredValidValues !== validRows || coveredInvalidValues !== invalidRows) {
    throw new Error(
      `relationship reference row accounting mismatch: coverage=${coveredValidValues}/${coveredInvalidValues}, rows=${validRows}/${invalidRows}`,
    );
  }
  const groupedReferences = groups.reduce((sum, group) => sum + group.reference_count, 0);
  const reviewGroupedRows = [...reviewGroupRows.values()].reduce((sum, groupRows) => sum + groupRows.length, 0);
  if (groupedReferences !== reviewGroupedRows) {
    throw new Error(
      `relationship reference group accounting mismatch: groups=${groupedReferences}, rows=${reviewGroupedRows}`,
    );
  }
  if (Object.values(primaryDispositions).reduce((sum, count) => sum + count, 0) !== sortedRows.length) {
    throw new Error("relationship reference exclusive primary dispositions do not reconcile to the row count");
  }

  return {
    schema_version: 1,
    contract_id: "relationship-reference-contract-v1",
    mode,
    rows: sortedRows,
    groups,
    findings: sortedFindings,
    proposed_remediations: remediationRows,
    coverage,
    native_coverage: nativeCoverage,
    summary: {
      canonical_record_count: records.length,
      policy_rule_count: loaded.contract.rules.length,
      policy_field_count: loaded.contract.rules.reduce((sum, rule) => sum + rule.fields.length, 0),
      reference_row_count: sortedRows.length,
      valid_string_value_count: sortedRows.filter((row) => row.native_resolution !== "invalid").length,
      invalid_value_count: primaryCount("invalid_unreviewed_value"),
      exact_resolved_derived_edge_count: primaryCount("exact_resolved_derived_edge"),
      already_present_edge_count: primaryCount("already_present_edge"),
      supportable_missing_edge_count: primaryCount("supportable_missing_edge"),
      skipped_self_count: coverage.reduce((sum, row) => sum + row.skipped_self_count, 0),
      reviewed_supportable_resolution_count: primaryCount("reviewed_supportable_resolution"),
      reviewed_supportable_existing_edge_count: primaryCount("reviewed_supportable_existing_edge"),
      reviewed_context_literal_count: primaryCount("reviewed_non_authoritative_context_literal"),
      reviewed_self_reference_count: primaryCount("reviewed_non_authoritative_self_reference"),
      reviewed_temporal_scope_mismatch_count: primaryCount("reviewed_temporal_scope_mismatch"),
      unreviewed_self_reference_count: primaryCount("unreviewed_self_reference"),
      reviewed_unresolved_count: primaryCount("reviewed_unresolved_reference"),
      reviewed_ambiguous_count: primaryCount("reviewed_ambiguous_reference"),
      unreviewed_unresolved_count: primaryCount("unreviewed_unresolved_reference"),
      unreviewed_ambiguous_count: primaryCount("unreviewed_ambiguous_reference"),
      unresolved_group_count: groups.filter((group) => group.native_resolution === "unresolved").length,
      ambiguous_group_count: groups.filter((group) => group.native_resolution === "ambiguous").length,
      proposed_remediation_count: remediationRows.length,
      finding_count: sortedFindings.length,
      hard_failure_count: sortedFindings.filter((finding) => finding.severity === "error").length,
      findings_by_code: Object.fromEntries(Object.entries(findingsByCode).sort(([left], [right]) => left.localeCompare(right))),
      primary_dispositions: Object.fromEntries(Object.entries(primaryDispositions).sort(([left], [right]) => left.localeCompare(right))),
      policy_rule_drift_count: driftKeys.length,
      native_coverage_mismatch_count: coverageMismatches.length,
      stale_review_decision_count: sortedFindings.filter((finding) => finding.code === "RELREF_REVIEW_DECISION_STALE").length,
    },
  };
}

export function reviewRelationshipReferenceGroups(
  groups: readonly RelationshipReferenceGroup[],
): RelationshipReferenceReviewDecision[] {
  return [...groups].flatMap((group) => {
    // Resolved self and temporal exclusions require an exact, independently reviewed basis.
    // They must never inherit the generic unresolved/ambiguous group-review path.
    if (group.native_resolution !== "unresolved" && group.native_resolution !== "ambiguous") return [];
    if (group.source_ids_checked.length === 0 || group.evidence_ids_checked.length === 0) return [];
    let primaryDisposition: RelationshipReferenceReviewDecision["primary_disposition"];
    let proposedTargetRecordId: string | null = null;
    let reason: string;
    let reasonCodes: string[];
    let exactSupportedClaims: string[];
    let exactUnsupportedClaims: string[];

    if (group.proposed_target_record_id) {
      primaryDisposition = "reviewed_supportable_canonical_target";
      proposedTargetRecordId = group.proposed_target_record_id;
      reason = "The full literal does not resolve natively, but its long-name and parenthetical acronym surfaces independently converge on one allowed canonical target. The audit proposes an evidence-preserving canonicalization; it does not apply it.";
      reasonCodes = ["canonical_target_concordance", "native_reference_normalization_missing"];
      exactSupportedClaims = [`canonical_target:${group.proposed_target_record_id}`];
      exactUnsupportedClaims = ["current_native_payload_resolution"];
    } else if (
      group.context_literal_by_policy ||
      (
        group.review_strategy === "bus_route_reference_or_context_literal" &&
        !group.route_like_value
      )
    ) {
      primaryDisposition = "reviewed_non_authoritative_context_literal";
      reason = group.context_literal_by_policy
        ? "The versioned field policy treats an unresolved source-system literal as method/provenance context. It does not prove that an entity or project owns the metric at canonical-edge precision."
        : "The value does not contain a NYC bus-route identity surface. In this generalized route field it is retained as aggregate, rail, fuel, modal, or other source context and is not promoted to a bus-route edge.";
      reasonCodes = group.context_literal_by_policy
        ? ["context_literal", "source_system_provenance_not_endpoint_claim"]
        : ["context_literal", "no_bus_route_identity_surface"];
      exactSupportedClaims = ["source_context_literal_preserved"];
      exactUnsupportedClaims = ["canonical_relationship_endpoint"];
    } else if (group.native_resolution === "ambiguous") {
      primaryDisposition = "reviewed_ambiguous_reference_claim";
      reason = "The value names a relationship-like target, but the current canonical identity registry returns multiple allowed candidates. The review preserves the ambiguity and does not guess an identity, route variant, agency, publisher, program, corridor, or owner.";
      reasonCodes = ["canonical_identity_ambiguous", "no_identity_guess"];
      exactSupportedClaims = ["relationship_like_reference_claim"];
      exactUnsupportedClaims = ["single_canonical_target"];
    } else {
      primaryDisposition = "reviewed_unresolved_reference_claim";
      reason = "The value names a relationship-like target, but exact canonical, alias, and route-variant resolution proves no allowed endpoint. The review preserves the unresolved claim and does not manufacture an identity or edge.";
      reasonCodes = ["canonical_target_unresolved", "no_identity_invention"];
      exactSupportedClaims = ["relationship_like_reference_claim"];
      exactUnsupportedClaims = ["canonical_relationship_endpoint"];
    }

    const identity = {
      rule_id: group.rule_id,
      field: group.field,
      normalized_value: group.normalized_value,
      native_resolution: group.native_resolution,
    };
    return [{
      schema_version: 1,
      ledger_id: "relationship-reference-review-v1",
      decision_id: `relationship-reference-review-v1:${shortHash(identity as unknown as JsonValue, 24)}`,
      ...identity,
      primary_disposition: primaryDisposition,
      proposed_target_record_id: proposedTargetRecordId,
      reviewed_at: "2026-07-16",
      reviewed_by: "codex-payload-reference-integrity-campaign",
      reason,
      reason_codes: reasonCodes.sort((left, right) => left.localeCompare(right)),
      origin_record_ids: group.origin_record_ids,
      source_ids_checked: group.source_ids_checked,
      evidence_ids_checked: group.evidence_ids_checked,
      canonical_candidate_ids_checked: group.canonical_candidate_ids_checked,
      exact_supported_claims: exactSupportedClaims.sort((left, right) => left.localeCompare(right)),
      exact_unsupported_claims: exactUnsupportedClaims.sort((left, right) => left.localeCompare(right)),
    } satisfies RelationshipReferenceReviewDecision];
  }).sort(
    (left, right) =>
      left.rule_id.localeCompare(right.rule_id) ||
      left.field.localeCompare(right.field) ||
      left.normalized_value.localeCompare(right.normalized_value) ||
      left.native_resolution.localeCompare(right.native_resolution),
  );
}
