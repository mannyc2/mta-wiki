import { stableHash, stableJson } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";

export const FACT_DEDUP_KINDS = ["relation", "event", "metric_claim", "claim", "treatment_component"] as const;
export type FactDedupKind = (typeof FACT_DEDUP_KINDS)[number];

export type FactKeyLane = "same_source" | "cross_source_exact" | "near_miss_bucket";

export type FactKey = {
  kind: FactDedupKind;
  lane: FactKeyLane;
  key: string;
  parts: Record<string, string>;
};

export type AnchorIndex = Map<string, string[]>;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function isFactDedupKind(kind: string): kind is FactDedupKind {
  return (FACT_DEDUP_KINDS as readonly string[]).includes(kind);
}

export function factKeyId(kind: FactDedupKind, lane: FactKeyLane, parts: Record<string, string>): string {
  return `${kind}:${lane}:${stableHash(parts as JsonObject).slice(0, 20)}`;
}

export function tokenSet(value: string): string[] {
  const normalized = value
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
  if (!normalized) return [];
  return [...new Set(normalized.split(/\s+/u).filter((token) => token.length > 0 && !STOPWORDS.has(token)))].sort();
}

export function tokenSetHash(value: string): string {
  return stableHash(tokenSet(value));
}

export function normalizedText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizedTextHash(value: string): string {
  return stableHash(normalizedText(value));
}

export function buildAnchorIndex(records: readonly MtaCanonicalRecord[]): AnchorIndex {
  const anchors = new Map<string, Set<string>>();
  for (const record of records) {
    if (record.record_kind !== "relation") continue;
    const subjectId = stringValue(record.payload.subject_id);
    const objectId = stringValue(record.payload.object_id);
    const relationKind = stringValue(record.payload.relation_kind);
    const relationFamily = stringValue(record.payload.relation_family);
    if (!subjectId || !objectId) continue;
    if (!isAnchoringRelation(relationKind, relationFamily)) continue;
    const set = anchors.get(objectId) ?? new Set<string>();
    set.add(subjectId);
    anchors.set(objectId, set);
  }
  return new Map([...anchors.entries()].map(([recordId, values]) => [recordId, [...values].sort()]));
}

export function anchorRecordId(record: MtaCanonicalRecord, anchors: AnchorIndex): string | undefined {
  const values = anchors.get(record.record_id) ?? [];
  if (values.length === 0) return undefined;
  if (values.length === 1) return values[0];
  return `multi:${values.join("+")}`;
}

export function sameSourceFactKey(record: MtaCanonicalRecord, anchors: AnchorIndex = new Map()): FactKey | undefined {
  if (!isFactDedupKind(record.record_kind)) return undefined;
  const kind = record.record_kind;
  if (kind === "relation") {
    return factKey(kind, "same_source", {
      relation_kind: stringPart(record.payload.relation_kind),
      subject_id: stringPart(record.payload.subject_id),
      object_id: stringPart(record.payload.object_id),
      primary_source_id: record.source_id,
      as_of_date: stringPart(record.payload.as_of_date),
    });
  }
  if (kind === "event") {
    return factKey(kind, "same_source", {
      primary_source_id: record.source_id,
      event_family: stringPart(record.payload.event_family ?? record.payload.event_kind),
      date: datePart(record.payload),
      name_token_hash: tokenSetHash(eventName(record)),
    });
  }
  if (kind === "metric_claim") {
    return factKey(kind, "same_source", {
      primary_source_id: record.source_id,
      metric_name: stringPart(record.payload.metric_name),
      unit: stringPart(record.payload.unit),
      period: stringPart(record.payload.period),
      value: valuePart(record.payload.value),
      scope: stringPart(record.payload.scope),
    });
  }
  if (kind === "claim") {
    return factKey(kind, "same_source", {
      primary_source_id: record.source_id,
      claim_text_hash: normalizedTextHash(claimText(record)),
    });
  }
  return factKey(kind, "same_source", {
    primary_source_id: record.source_id,
    treatment_kind: stringPart(record.payload.treatment_kind),
    treatment_family: stringPart(record.payload.treatment_family),
    location_token_hash: tokenSetHash(treatmentLocation(record)),
    anchor_record_id: stringPart(anchorRecordId(record, anchors)),
  });
}

export function crossSourceExactFactKey(record: MtaCanonicalRecord, anchors: AnchorIndex): FactKey | undefined {
  if (!isFactDedupKind(record.record_kind)) return undefined;
  const kind = record.record_kind;
  if (kind === "relation") {
    return factKey(kind, "cross_source_exact", {
      relation_kind: stringPart(record.payload.relation_kind),
      subject_id: stringPart(record.payload.subject_id),
      object_id: stringPart(record.payload.object_id),
      as_of_date: stringPart(record.payload.as_of_date),
    });
  }

  const anchor = anchorRecordId(record, anchors);
  if (!anchor && kind !== "event") return undefined;
  if (kind === "event") {
    return factKey(kind, "cross_source_exact", {
      anchor_record_id: stringPart(anchor),
      event_family: stringPart(record.payload.event_family ?? record.payload.event_kind),
      date: datePart(record.payload),
      name_token_hash: tokenSetHash(eventName(record)),
    });
  }
  if (kind === "metric_claim") {
    return factKey(kind, "cross_source_exact", {
      anchor_record_id: anchor!,
      metric_name: stringPart(record.payload.metric_name),
      unit_normalized: unitPart(record.payload),
      period: stringPart(record.payload.period),
      value: valuePart(record.payload.value),
    });
  }
  if (kind === "claim") {
    return factKey(kind, "cross_source_exact", {
      anchor_record_id: anchor!,
      claim_text_hash: normalizedTextHash(claimText(record)),
    });
  }
  return factKey(kind, "cross_source_exact", {
    anchor_record_id: anchor!,
    treatment_kind: stringPart(record.payload.treatment_kind),
    treatment_family: stringPart(record.payload.treatment_family),
    location_token_hash: tokenSetHash(treatmentLocation(record)),
  });
}

export function eventNearMissBucketKey(record: MtaCanonicalRecord, anchors: AnchorIndex): FactKey | undefined {
  if (record.record_kind !== "event") return undefined;
  const anchor = anchorRecordId(record, anchors);
  if (!anchor) return undefined;
  return factKey("event", "near_miss_bucket", {
    anchor_record_id: anchor,
    event_family: stringPart(record.payload.event_family ?? record.payload.event_kind),
    date: datePart(record.payload),
  });
}

export function factKeyComparable(value: FactKey): string {
  return stableJson(value.parts as JsonObject);
}

function factKey(kind: FactDedupKind, lane: FactKeyLane, parts: Record<string, string>): FactKey {
  return { kind, lane, key: factKeyId(kind, lane, parts), parts };
}

function isAnchoringRelation(relationKind: string | undefined, relationFamily: string | undefined): boolean {
  return (
    relationKind === "has_timeline_event" ||
    relationKind === "has_metric" ||
    relationKind === "has_claim" ||
    relationKind === "has_treatment" ||
    relationFamily === "timeline_context" ||
    relationFamily === "metric_context" ||
    relationFamily === "claim_context" ||
    relationFamily === "treatment_context"
  );
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringPart(value: JsonValue | undefined): string {
  if (typeof value === "string") return normalizedText(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function valuePart(value: JsonValue | undefined): string {
  if (value === undefined) return "";
  return stableJson(value);
}

function datePart(payload: JsonObject): string {
  return stringPart(payload.date_normalized ?? payload.date_text ?? payload.date);
}

function eventName(record: MtaCanonicalRecord): string {
  return stringValue(record.payload.event_name) ?? stringValue(record.payload.description) ?? record.display_name;
}

function claimText(record: MtaCanonicalRecord): string {
  return stringValue(record.payload.claim_text) ?? stringValue(record.payload.description) ?? record.raw_text ?? record.display_name;
}

function treatmentLocation(record: MtaCanonicalRecord): string {
  const normalized = record.payload.locations_normalized;
  if (typeof normalized === "string") return normalized;
  if (isJsonObject(normalized) && typeof normalized.raw_text === "string") return normalized.raw_text;
  return stringValue(record.payload.locations) ?? stringValue(record.payload.location) ?? "";
}

function unitPart(payload: JsonObject): string {
  const normalized = payload.unit_normalized;
  if (typeof normalized === "string") return normalizedText(normalized);
  if (isJsonObject(normalized)) {
    const normalizedUnit = stringValue(normalized.normalized_unit);
    const unitFamily = stringValue(normalized.unit_family);
    const scale = normalized.scale;
    return [normalizedUnit, unitFamily, typeof scale === "number" ? String(scale) : undefined].filter(Boolean).join(":");
  }
  return stringPart(payload.unit);
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
