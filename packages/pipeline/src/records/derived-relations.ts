import { slug } from "@mta-wiki/db/identity";
import { normalizeRelationFamily, normalizeRelationKind, relationEndpointShapeIssue } from "@mta-wiki/pipeline/records/relations";
import { shortHash } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaObservationKind } from "@mta-wiki/db/types";

type RelationDirection = "origin_to_target" | "target_to_origin";

type DerivedRelationRule = {
  id: string;
  originKind: MtaObservationKind;
  fields: string[];
  targetKinds: MtaObservationKind[];
  relationKind: string;
  direction: RelationDirection;
  skipSelf?: boolean | undefined;
};

type Resolution = {
  record: MtaCanonicalRecord;
  targetKind: MtaObservationKind;
  confidence: "exact_canonical_match" | "single_route_base_match";
};

export type DerivedRelationCoverage = {
  rule_id: string;
  origin_kind: MtaObservationKind;
  field: string;
  relation_kind: string;
  direction: RelationDirection;
  records_with_field: number;
  value_count: number;
  derived_count: number;
  already_present_count: number;
  /** No candidate matched the referenced label. */
  unresolved_count: number;
  /** Multiple candidates matched — recorded, never guessed (becomes a dangling_reference gap). */
  ambiguous_count: number;
  skipped_self_count: number;
};

/** A relation-context reference that could not become an edge (S2.4 item 3) — the C3 ambiguity-is-data
 *  surface and the S2.8 `dangling_reference` gap class. */
export type DanglingReference = {
  origin_record_id: string;
  origin_kind: MtaObservationKind;
  field: string;
  value: string;
  relation_kind: string;
  reason: "ambiguous" | "unresolved";
  candidate_ids: string[];
};

const DERIVED_RELATION_RULES: DerivedRelationRule[] = [
  {
    id: "metric-route-has-metric",
    originKind: "metric_claim",
    fields: ["route_label", "route"],
    targetKinds: ["route"],
    relationKind: "has_metric",
    direction: "target_to_origin",
  },
  {
    id: "metric-source-system-has-metric",
    originKind: "metric_claim",
    fields: ["source_system", "entity"],
    targetKinds: ["entity", "project"],
    relationKind: "has_metric",
    direction: "target_to_origin",
  },
  {
    id: "claim-route-has-claim",
    originKind: "claim",
    fields: ["route", "routes"],
    targetKinds: ["route"],
    relationKind: "has_claim",
    direction: "target_to_origin",
  },
  {
    id: "project-routes-served",
    originKind: "project",
    fields: ["routes_served", "routes"],
    targetKinds: ["route"],
    relationKind: "serves_route",
    direction: "origin_to_target",
  },
  {
    id: "corridor-routes-served",
    originKind: "corridor",
    fields: ["routes", "routes_served"],
    targetKinds: ["route"],
    relationKind: "operates_on_corridor",
    direction: "target_to_origin",
  },
  {
    id: "route-corridors",
    originKind: "route",
    fields: ["corridors"],
    targetKinds: ["corridor"],
    relationKind: "operates_on_corridor",
    direction: "origin_to_target",
  },
  {
    id: "route-related-routes",
    originKind: "route",
    fields: ["routes", "related_existing_routes"],
    targetKinds: ["route"],
    relationKind: "related_route",
    direction: "origin_to_target",
    skipSelf: true,
  },
  {
    id: "route-program",
    originKind: "route",
    fields: ["program"],
    targetKinds: ["entity", "project"],
    relationKind: "part_of_program",
    direction: "origin_to_target",
  },
  {
    id: "project-program",
    originKind: "project",
    fields: ["program"],
    targetKinds: ["entity", "project"],
    relationKind: "part_of_program",
    direction: "origin_to_target",
  },
  {
    id: "route-operator",
    originKind: "route",
    fields: ["operator", "agency"],
    targetKinds: ["entity"],
    relationKind: "operated_by",
    direction: "origin_to_target",
  },
  {
    id: "project-operator",
    originKind: "project",
    fields: ["operator"],
    targetKinds: ["entity"],
    relationKind: "operated_by",
    direction: "origin_to_target",
  },
  {
    id: "project-owner",
    originKind: "project",
    fields: ["owner"],
    targetKinds: ["entity"],
    relationKind: "owned_by",
    direction: "origin_to_target",
  },
  {
    id: "project-publisher",
    originKind: "project",
    fields: ["publisher"],
    targetKinds: ["entity"],
    relationKind: "published_by",
    direction: "origin_to_target",
  },
  {
    id: "source-publisher",
    originKind: "source",
    fields: ["publisher"],
    targetKinds: ["entity"],
    relationKind: "published_by",
    direction: "origin_to_target",
  },
  {
    id: "entity-organization",
    originKind: "entity",
    fields: ["organization", "agency", "office", "parent_organization", "parent_entity"],
    targetKinds: ["entity"],
    relationKind: "part_of_agency",
    direction: "origin_to_target",
    skipSelf: true,
  },
  {
    id: "entity-owner",
    originKind: "entity",
    fields: ["owner"],
    targetKinds: ["entity"],
    relationKind: "owned_by",
    direction: "origin_to_target",
    skipSelf: true,
  },
  {
    id: "entity-publisher",
    originKind: "entity",
    fields: ["publisher"],
    targetKinds: ["entity"],
    relationKind: "published_by",
    direction: "origin_to_target",
    skipSelf: true,
  },
];

const LOOKUP_FIELDS_BY_KIND: Partial<Record<MtaObservationKind, string[]>> = {
  source: ["source_id", "title", "source_title"],
  entity: ["entity_name", "name", "agency_name", "short_name", "acronym"],
  project: ["project_name", "name", "program_name"],
  corridor: ["corridor_name", "name", "street", "streets"],
  route: ["route_id", "internal_route_id", "route_label", "route_name", "route", "branding_label"],
};

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))].sort();
}

function stringValue(value: JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringValues(value: JsonValue | undefined): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function payloadStrings(payload: JsonObject, fields: string[]) {
  return uniqueStrings(fields.flatMap((field) => stringValues(payload[field])));
}

function lookupKey(value: string) {
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

function recordIdSurface(record: MtaCanonicalRecord) {
  const prefix = `${record.record_kind}_`;
  return record.record_id.startsWith(prefix) ? record.record_id.slice(prefix.length).replace(/[-_]+/gu, " ") : record.record_id.replace(/[-_]+/gu, " ");
}

function routeVariant(record: MtaCanonicalRecord) {
  const values = uniqueStrings([
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

function routeBaseFromText(value: string) {
  const upper = value.toUpperCase().replace(/\+/gu, " SBS ").replace(/SELECT\s+BUS\s+SERVICE/gu, "SBS");
  const m14ad = /\bM\s*14\s*(?:A\s*\/\s*D|A\s*D|AD)\b/u.test(upper);
  const match = m14ad ? undefined : /\b(BX|[BMQS])\s*-?\s*(\d{1,3}[A-Z]?)/u.exec(upper);
  return m14ad ? "M14-AD" : match?.[1] && match[2] ? `${match[1]}${match[2]}` : undefined;
}

function routeBase(record: MtaCanonicalRecord) {
  for (const value of uniqueStrings([recordIdSurface(record), record.display_name, ...(record.record_aliases ?? []), ...payloadStrings(record.payload, LOOKUP_FIELDS_BY_KIND.route ?? [])])) {
    const base = routeBaseFromText(value);
    if (base) return base;
  }
  return undefined;
}

function routeGeneratedAliases(record: MtaCanonicalRecord) {
  const base = routeBase(record);
  if (!base) return [];
  const variant = routeVariant(record);
  if (variant === "sbs") return [`${base} SBS`, `${base} Select Bus Service`, `${base}+`];
  if (variant === "local") return [`${base} Local`];
  if (variant === "limited_stop") return [`${base} Limited`];
  if (variant === "express") return [`${base} Express`];
  return [base];
}

function isGenericRouteAliasForVariant(record: MtaCanonicalRecord, value: string) {
  if (record.record_kind !== "route" || !routeVariant(record)) return false;
  const base = routeBase(record);
  if (!base) return false;
  const normalized = lookupKey(value);
  return normalized === lookupKey(base) || normalized === lookupKey(`route ${base}`);
}

function shouldIndexValue(record: MtaCanonicalRecord, value: string) {
  return !isGenericRouteAliasForVariant(record, value);
}

function isDataOnlyRouteScope(record: MtaCanonicalRecord) {
  return record.record_kind === "route" && record.payload.route_record_scope === "data_only_scope";
}

function indexValues(record: MtaCanonicalRecord) {
  const fields = LOOKUP_FIELDS_BY_KIND[record.record_kind] ?? [];
  const aliases = (record.record_aliases ?? []).filter((alias) => shouldIndexValue(record, alias));
  const values = uniqueStrings([
    record.record_id,
    recordIdSurface(record),
    record.local_observation_id,
    record.display_name,
    ...aliases,
    ...payloadStrings(record.payload, fields).filter((value) => shouldIndexValue(record, value)),
    ...(record.record_kind === "route" ? routeGeneratedAliases(record) : []),
  ]).filter((value) => shouldIndexValue(record, value));
  return values.flatMap((value) => {
    const key = lookupKey(value);
    return key ? [{ key, value }] : [];
  });
}

function buildIndex(records: MtaCanonicalRecord[]) {
  const index = new Map<MtaObservationKind, Map<string, MtaCanonicalRecord[]>>();
  for (const record of records) {
    if (record.record_kind === "relation" || record.record_kind === "table" || record.record_kind === "source_gap") continue;
    if (isDataOnlyRouteScope(record)) continue;
    for (const { key } of indexValues(record)) {
      const byKind = index.get(record.record_kind) ?? new Map<string, MtaCanonicalRecord[]>();
      const existing = byKind.get(key) ?? [];
      if (!existing.some((candidate) => candidate.record_id === record.record_id)) byKind.set(key, [...existing, record]);
      index.set(record.record_kind, byKind);
    }
  }
  return index;
}

function hasRouteVariantText(value: string) {
  const key = lookupKey(value);
  return /\b(sbs|local|limited|express)\b/u.test(key);
}

function routeVariantFromQuery(value: string) {
  const key = lookupKey(value);
  if (/\bsbs\b/u.test(key)) return "sbs";
  if (/\blocal\b/u.test(key)) return "local";
  if (/\blimited\b/u.test(key)) return "limited_stop";
  if (/\bexpress\b/u.test(key)) return "express";
  return undefined;
}

function resolveRoute(value: string, records: MtaCanonicalRecord[], index: Map<MtaObservationKind, Map<string, MtaCanonicalRecord[]>>): Resolution | undefined {
  const key = lookupKey(value);
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
  const baseMatches = records.filter((record) => record.record_kind === "route" && !isDataOnlyRouteScope(record) && routeBase(record) === base);
  const variantMatches = queryVariant ? baseMatches.filter((record) => routeVariant(record) === queryVariant) : baseMatches;
  const uniqueBase = uniqueByRecordId(variantMatches);
  if (uniqueBase.length === 1 && (queryVariant || (!hasRouteVariantText(value) && !routeVariant(uniqueBase[0]!)))) {
    return {
      record: uniqueBase[0]!,
      targetKind: "route",
      confidence: queryVariant ? "exact_canonical_match" : "single_route_base_match",
    };
  }
  return undefined;
}

function uniqueByRecordId(records: MtaCanonicalRecord[]) {
  return [...new Map(records.map((record) => [record.record_id, record])).values()].sort((a, b) => a.record_id.localeCompare(b.record_id));
}

type TargetResolution = { resolution: Resolution | undefined; candidateIds: string[] };

function resolveTarget(
  value: string,
  targetKinds: MtaObservationKind[],
  records: MtaCanonicalRecord[],
  index: Map<MtaObservationKind, Map<string, MtaCanonicalRecord[]>>,
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
        // Record the would-be route candidates so a multi-variant match reads as ambiguous rather
        // than unresolved: the exact-index hits plus the base-id matches resolveRoute weighs (variant
        // routes don't index their bare base, so the base set is where the M86 local-vs-SBS ambiguity lives).
        for (const record of uniqueByRecordId(index.get("route")?.get(lookupKey(value)) ?? [])) candidateIds.add(record.record_id);
        const base = routeBaseFromText(value);
        if (base) for (const record of records) if (record.record_kind === "route" && !isDataOnlyRouteScope(record) && routeBase(record) === base) candidateIds.add(record.record_id);
      }
      continue;
    }
    const candidates = uniqueByRecordId(index.get(kind)?.get(lookupKey(value)) ?? []);
    for (const candidate of candidates) candidateIds.add(candidate.record_id);
    if (candidates.length === 1) resolutions.push({ record: candidates[0]!, targetKind: kind, confidence: "exact_canonical_match" });
  }

  const unique = [...new Map(resolutions.map((resolution) => [resolution.record.record_id, resolution])).values()];
  return { resolution: unique.length === 1 ? unique[0] : undefined, candidateIds: [...candidateIds].sort() };
}

function relationKey(relationKind: string, subjectId: string, objectId: string) {
  return `${normalizeRelationKind(relationKind)}\0${subjectId}\0${objectId}`;
}

function existingRelationKeys(records: MtaCanonicalRecord[]) {
  const keys = new Set<string>();
  for (const record of records) {
    if (record.record_kind !== "relation") continue;
    const relationKind = stringValue(record.payload.relation_kind);
    const subjectId = stringValue(record.payload.subject_id);
    const objectId = stringValue(record.payload.object_id);
    if (relationKind && subjectId && objectId) keys.add(relationKey(relationKind, subjectId, objectId));
  }
  return keys;
}

function relationEndpoints(rule: DerivedRelationRule, origin: MtaCanonicalRecord, target: MtaCanonicalRecord) {
  return rule.direction === "origin_to_target"
    ? { subject: origin, object: target }
    : { subject: target, object: origin };
}

function sourceIds(record: MtaCanonicalRecord) {
  return uniqueStrings([record.source_id, ...(record.source_ids ?? [])]);
}

function derivedRelationRecord(
  rule: DerivedRelationRule,
  origin: MtaCanonicalRecord,
  target: MtaCanonicalRecord,
  field: string,
  value: string,
  confidence: Resolution["confidence"],
): MtaCanonicalRecord | undefined {
  const relationKind = normalizeRelationKind(rule.relationKind);
  const { subject, object } = relationEndpoints(rule, origin, target);
  if (rule.skipSelf && subject.record_id === object.record_id) return undefined;
  const shapeIssue = relationEndpointShapeIssue(relationKind, subject.record_kind, object.record_kind);
  if (shapeIssue) return undefined;

  const identity: JsonObject = {
    relation_kind: relationKind,
    subject_id: subject.record_id,
    object_id: object.record_id,
    origin_record_id: origin.record_id,
    origin_field: field,
    origin_value: value,
  };
  const hash = shortHash(identity, 10);
  const readable = slug(`${relationKind}-${subject.record_id}-${object.record_id}`);
  const localObservationId = `derived_${readable}_${hash}`;
  const payload: JsonObject = {
    relation_kind: relationKind,
    relation_family: normalizeRelationFamily(relationKind),
    subject_local_observation_id: subject.local_observation_id,
    object_local_observation_id: object.local_observation_id,
    subject_id: subject.record_id,
    object_id: object.record_id,
    subject_record_kind: subject.record_kind,
    object_record_kind: object.record_kind,
    derived_relation: true,
    derivation_rule: rule.id,
    derivation_confidence: confidence,
    derived_from_record_id: origin.record_id,
    derived_from_payload_field: field,
    derived_from_payload_value: value,
  };

  return {
    record_id: `relation_${readable}_${hash}`,
    record_kind: "relation",
    source_id: origin.source_id,
    source_ids: sourceIds(origin),
    local_observation_id: localObservationId,
    local_observation_ids: [localObservationId],
    display_name: `${subject.display_name} ${relationKind} ${object.display_name}`,
    raw_text: origin.raw_text,
    payload,
    evidence_refs: origin.evidence_refs,
    submission_ids: origin.submission_ids,
    truth_status: origin.truth_status,
    review_state: "derived",
    generated_at: origin.generated_at,
  };
}

function valuesForRuleField(record: MtaCanonicalRecord, field: string) {
  return uniqueStrings(stringValues(record.payload[field]));
}

type CoverageAccumulator = {
  recordsWithField: Set<string>;
  value_count: number;
  derived_count: number;
  already_present_count: number;
  unresolved_count: number;
  ambiguous_count: number;
  skipped_self_count: number;
};

function coverageKey(rule: DerivedRelationRule, field: string) {
  return `${rule.id}\0${field}`;
}

function emptyCoverage(): CoverageAccumulator {
  return {
    recordsWithField: new Set<string>(),
    value_count: 0,
    derived_count: 0,
    already_present_count: 0,
    unresolved_count: 0,
    ambiguous_count: 0,
    skipped_self_count: 0,
  };
}

export function derivedRelationCoverage(records: MtaCanonicalRecord[]): DerivedRelationCoverage[] {
  return deriveRelations(records, { coverageOnly: true }).coverage;
}

/** Every relation-context reference that did not become an edge — the S2.8 `dangling_reference`
 *  feed. Deterministic; recomputed from records, never persisted to journals. */
export function danglingReferences(records: MtaCanonicalRecord[]): DanglingReference[] {
  return deriveRelations(records, { coverageOnly: true }).dangling;
}

export function withDerivedRelations(records: MtaCanonicalRecord[]): MtaCanonicalRecord[] {
  return deriveRelations(records, { coverageOnly: false }).records;
}

function deriveRelations(records: MtaCanonicalRecord[], options: { coverageOnly: boolean }) {
  const index = buildIndex(records);
  const relationKeys = existingRelationKeys(records);
  const derived: MtaCanonicalRecord[] = [];
  const coverage = new Map<string, CoverageAccumulator>();
  const dangling: DanglingReference[] = [];

  for (const rule of DERIVED_RELATION_RULES) {
    const origins = records.filter((record) => record.record_kind === rule.originKind);
    for (const field of rule.fields) {
      const summary = coverage.get(coverageKey(rule, field)) ?? emptyCoverage();
      for (const origin of origins) {
        const values = valuesForRuleField(origin, field);
        if (values.length > 0) summary.recordsWithField.add(origin.record_id);
        for (const value of values) {
          summary.value_count += 1;
          const { resolution, candidateIds } = resolveTarget(value, rule.targetKinds, records, index);
          if (!resolution) {
            const reason = candidateIds.length > 1 ? "ambiguous" : "unresolved";
            if (reason === "ambiguous") summary.ambiguous_count += 1;
            else summary.unresolved_count += 1;
            dangling.push({
              origin_record_id: origin.record_id,
              origin_kind: origin.record_kind,
              field,
              value,
              relation_kind: normalizeRelationKind(rule.relationKind),
              reason,
              candidate_ids: candidateIds,
            });
            continue;
          }

          const { subject, object } = relationEndpoints(rule, origin, resolution.record);
          if (rule.skipSelf && subject.record_id === object.record_id) {
            summary.skipped_self_count += 1;
            continue;
          }

          const key = relationKey(rule.relationKind, subject.record_id, object.record_id);
          if (relationKeys.has(key)) {
            summary.already_present_count += 1;
            continue;
          }

          const record = derivedRelationRecord(rule, origin, resolution.record, field, value, resolution.confidence);
          if (!record) {
            summary.unresolved_count += 1;
            continue;
          }
          summary.derived_count += 1;
          relationKeys.add(key);
          if (!options.coverageOnly) derived.push(record);
        }
      }
      coverage.set(coverageKey(rule, field), summary);
    }
  }

  return {
    records: options.coverageOnly ? records : [...records, ...derived].sort((a, b) => a.record_id.localeCompare(b.record_id)),
    dangling: dangling.sort(
      (a, b) => a.origin_record_id.localeCompare(b.origin_record_id) || a.field.localeCompare(b.field) || a.value.localeCompare(b.value),
    ),
    coverage: DERIVED_RELATION_RULES.flatMap((rule) =>
      rule.fields.map((field) => {
        const summary = coverage.get(coverageKey(rule, field)) ?? emptyCoverage();
        return {
          rule_id: rule.id,
          origin_kind: rule.originKind,
          field,
          relation_kind: normalizeRelationKind(rule.relationKind),
          direction: rule.direction,
          records_with_field: summary.recordsWithField.size,
          value_count: summary.value_count,
          derived_count: summary.derived_count,
          already_present_count: summary.already_present_count,
          unresolved_count: summary.unresolved_count,
          ambiguous_count: summary.ambiguous_count,
          skipped_self_count: summary.skipped_self_count,
        };
      }),
    ),
  };
}
