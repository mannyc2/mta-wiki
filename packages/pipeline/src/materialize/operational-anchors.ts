import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaEvidenceRef } from "@mta-wiki/db/types";
import {
  assertOperationalAnchorReviewDecisions,
  type OperationalAnchorReviewDecision,
  type OperationalAnchorReviewEvidenceRole,
} from "@mta-wiki/pipeline/materialize/operational-anchor-review";
import type { RouteAnchorRow } from "@mta-wiki/pipeline/materialize/route-anchors";
import { normalizeDateText } from "@mta-wiki/pipeline/ontology/normalizers";

export const OPERATIONAL_ANCHOR_SCHEMA_VERSION = 1 as const;

export type OperationalAnchorTemporalRole = "status_as_of" | "planned_operational" | "realized_operational";

export type OperationalAnchorScopeResolution = "direct" | "reviewed_inherited" | "unreviewed_inherited" | "ambiguous" | "missing";

export type OperationalAnchorConflictState =
  | "date_conflict"
  | "route_identity_conflict"
  | "status_conflict"
  | "temporal_order_conflict";

export type OperationalAnchorExclusionReason =
  | "ambiguous_lifecycle_phase"
  | "ambiguous_route_scope"
  | "ambiguous_treatment_scope"
  | "conflicting_date_evidence"
  | "conflicting_route_identity"
  | "conflicting_status_evidence"
  | "imprecise_operational_date"
  | "missing_event_evidence"
  | "missing_operational_date"
  | "missing_route_scope"
  | "missing_route_scope_evidence"
  | "missing_timeline_evidence"
  | "missing_treatment_scope"
  | "missing_treatment_scope_evidence"
  | "missing_treatment_family"
  | "non_realized_operational_date"
  | "non_source_stated_evidence"
  | "partially_unmatched_gtfs_route"
  | "quarantined_record"
  | "status_as_of_only"
  | "future_delivered_status"
  | "unconfirmed_inherited_scope"
  | "unmatched_gtfs_route"
  | "unreviewed_inherited_scope"
  | "untrusted_source_authority"
  | "unsupported_subject_scope";

export type OperationalAnchorSourceAuthority = "mixed" | "non_official" | "official_public_agency" | "unknown";

export type OperationalAnchorEvidenceRef = {
  record_id: string;
  source_id: string;
  evidence_id: string | null;
  block_id: string | null;
  page_number: number | null;
  text_sha256: string | null;
  role: "event" | "route_scope" | "timeline_relation" | "treatment_scope";
};

export type OperationalAnchorEvidenceCoverage = {
  event: boolean;
  timeline: boolean;
  route_scope: boolean;
  treatment_scope: boolean;
};

export type OperationalAnchorDateCandidate = {
  source_field: string;
  raw: string;
  normalized: string;
  precision: string;
  origin: "canonical_scalar" | "merged_field" | "normalized_companion" | "payload_field";
};

export type OperationalAnchorRow = {
  schema_version: typeof OPERATIONAL_ANCHOR_SCHEMA_VERSION;
  anchor_id: string;
  operational_change_id: string;
  event_record_id: string;
  timeline_relation_record_ids: string[];
  project_record_ids: string[];
  subject_record_ids: string[];
  subject_record_kinds: string[];
  route_record_ids: string[];
  unmatched_route_record_ids: string[];
  gtfs_route_ids: string[];
  treatment_record_ids: string[];
  treatment_families: string[];
  route_scope_direct: boolean;
  treatment_scope_direct: boolean;
  temporal_role: OperationalAnchorTemporalRole;
  raw_date: string | null;
  normalized_date: string | null;
  date_precision: string;
  candidate_operational_date_raw: string | null;
  candidate_operational_date_normalized: string | null;
  candidate_operational_date_precision: string;
  candidate_operational_date_source_field: string | null;
  candidate_operational_date_candidates: OperationalAnchorDateCandidate[];
  candidate_operational_dates_normalized: string[];
  status_as_of_dates: string[];
  event_family: string;
  lifecycle_phase: string | null;
  assertion_statuses: string[];
  truth_status: string;
  truth_statuses: string[];
  review_state: string;
  source_id: string;
  source_ids: string[];
  source_authority: OperationalAnchorSourceAuthority;
  source_publishers: string[];
  route_scope_resolution: OperationalAnchorScopeResolution;
  treatment_scope_resolution: OperationalAnchorScopeResolution;
  scope_resolution: OperationalAnchorScopeResolution;
  conflict_states: OperationalAnchorConflictState[];
  evidence_coverage: OperationalAnchorEvidenceCoverage;
  evidence_refs: OperationalAnchorEvidenceRef[];
  exclusion_reasons: OperationalAnchorExclusionReason[];
  study_eligible: boolean;
};

export type OperationalAnchorSummary = {
  schema_version: typeof OPERATIONAL_ANCHOR_SCHEMA_VERSION;
  row_count: number;
  broad_row_count: number;
  reviewed_row_count: number;
  distinct_operational_event_count: number;
  study_eligible_count: number;
  study_eligible_reviewed_count: number;
  counts_by_temporal_role: Record<string, number>;
  counts_by_scope_resolution: Record<string, number>;
  counts_by_exclusion_reason: Record<string, number>;
  entry_gate: OperationalAnchorEntryGate;
  broad_funnel: OperationalAnchorBroadFunnel;
  funnel: {
    canonical_events: number;
    operational_family_events_total: number;
    timeline_linked_operational_events: number;
    timeline_linked_distinct_events: number;
    unlinked_operational_events: number;
    candidate_operational_date_present: number;
    realized_operational: number;
    realized_day_or_month: number;
    resolved_route_scope: number;
    resolved_treatment_scope: number;
    evidence_complete: number;
    conflict_free: number;
    study_eligible: number;
  };
};

export type OperationalAnchorBroadFunnel = {
  operational_family_events_total: number;
  timeline_linked_distinct_events: number;
  unlinked_operational_events: number;
  candidate_operational_date_present: number;
  realized_operational: number;
  realized_day_or_month: number;
  resolved_route_scope: number;
  resolved_treatment_scope: number;
  evidence_complete: number;
  conflict_free: number;
  study_eligible: number;
};

export type OperationalAnchorEntryGate = {
  relations_examined: number;
  non_event_timeline_objects: number;
  non_operational_event_objects: number;
};

export type OperationalAnchorProjection = {
  rows: OperationalAnchorRow[];
  entry_gate: OperationalAnchorEntryGate;
};

export type ComputeOperationalAnchorsOptions = {
  reviewDecisions?: readonly OperationalAnchorReviewDecision[] | undefined;
};

type Relation = {
  record: MtaCanonicalRecord;
  kind: string;
  subjectId: string;
  objectId: string;
  assertionStatus: string;
};

type Scope = {
  routeRecordIds: string[];
  routeEvidenceRecords: MtaCanonicalRecord[];
  treatmentRecordIds: string[];
  treatmentEvidenceRecords: MtaCanonicalRecord[];
  projectRecordIds: string[];
  routeDirect: boolean;
  treatmentDirect: boolean;
  inheritedScopeConfirmed: boolean;
  unsupportedSubject: boolean;
};

type EventDate = {
  raw: string | null;
  normalized: string | null;
  precision: string;
  sourceField: string | null;
};

const operationalEventFamilies = new Set(["implementation", "launch"]);
const preciseOperationalDatePrecisions = new Set(["day", "month"]);
const realizedLifecyclePhases = new Set([
  "completed",
  "expanded",
  "installed",
  "launched",
  "modified",
  "piloted",
  "resumed",
]);
const plannedStatuses = new Set(["planned", "proposed"]);
const routeScopeKinds = new Set(["affects_route", "serves_route"]);
const eventRouteScopeKinds = new Set(["affects_route"]);

export function countOperationalFamilyEvents(records: readonly MtaCanonicalRecord[]): number {
  return records.filter(
    (record) => record.record_kind === "event" && operationalEventFamilies.has(text(record.payload.event_family) ?? ""),
  ).length;
}

function text(value: JsonValue | undefined): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function relationFromRecord(record: MtaCanonicalRecord): Relation | null {
  if (record.record_kind !== "relation") return null;
  const kind = text(record.payload.relation_kind);
  const subjectId = text(record.payload.subject_id);
  const objectId = text(record.payload.object_id);
  if (!kind || !subjectId || !objectId) return null;
  return {
    record,
    kind,
    subjectId,
    objectId,
    assertionStatus: text(record.payload.assertion_status) ?? "unknown",
  };
}

function uniqueSorted<T extends string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function selectedScopeRelations(relations: readonly Relation[]): Relation[] {
  return relations
    .filter((relation) => relation.assertionStatus === "delivered")
    .sort((a, b) => a.record.record_id.localeCompare(b.record.record_id));
}

function outgoingRelations(relations: readonly Relation[], subjectId: string, kinds: ReadonlySet<string>): Relation[] {
  return selectedScopeRelations(relations.filter((relation) => relation.subjectId === subjectId && kinds.has(relation.kind)));
}

function incomingTreatmentRelations(relations: readonly Relation[], treatmentId: string): Relation[] {
  return selectedScopeRelations(relations.filter((relation) => relation.kind === "has_treatment" && relation.objectId === treatmentId));
}

function scopeForEvent(input: {
  event: MtaCanonicalRecord;
  timelines: readonly Relation[];
  relations: readonly Relation[];
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>;
}): Scope {
  const timelineSubjects = input.timelines.flatMap((timeline) => {
    const subject = input.recordsById.get(timeline.subjectId);
    return subject ? [subject] : [];
  });
  const projectRecordIds = new Set(timelineSubjects.filter((subject) => subject.record_kind === "project").map((subject) => subject.record_id));
  const directRouteIds = new Set(timelineSubjects.filter((subject) => subject.record_kind === "route").map((subject) => subject.record_id));
  const directTreatmentIds = new Set(
    timelineSubjects.filter((subject) => subject.record_kind === "treatment_component").map((subject) => subject.record_id),
  );
  const directRouteEvidence = input.timelines
    .filter((timeline) => input.recordsById.get(timeline.subjectId)?.record_kind === "route")
    .map((timeline) => timeline.record);
  const directTreatmentEvidence = input.timelines
    .filter((timeline) => input.recordsById.get(timeline.subjectId)?.record_kind === "treatment_component")
    .map((timeline) => timeline.record);

  const eventRouteRelations = outgoingRelations(input.relations, input.event.record_id, eventRouteScopeKinds);
  for (const relation of eventRouteRelations) directRouteIds.add(relation.objectId);
  directRouteEvidence.push(...eventRouteRelations.map((relation) => relation.record));

  const inheritedRouteRelations: Relation[] = [];
  const inheritedTreatmentRelations: Relation[] = [];
  let unsupportedSubject = false;

  for (const subject of timelineSubjects) {
    if (subject.record_kind === "project" || subject.record_kind === "corridor") {
      inheritedRouteRelations.push(...outgoingRelations(input.relations, subject.record_id, routeScopeKinds));
      inheritedTreatmentRelations.push(...outgoingRelations(input.relations, subject.record_id, new Set(["has_treatment"])));
      continue;
    }
    if (subject.record_kind === "route") {
      inheritedTreatmentRelations.push(...outgoingRelations(input.relations, subject.record_id, new Set(["has_treatment"])));
      continue;
    }
    if (subject.record_kind === "treatment_component") {
      for (const parentRelation of incomingTreatmentRelations(input.relations, subject.record_id)) {
        const parent = input.recordsById.get(parentRelation.subjectId);
        if (parent?.record_kind === "route") {
          directRouteIds.add(parent.record_id);
          directRouteEvidence.push(parentRelation.record);
        } else if (parent?.record_kind === "project" || parent?.record_kind === "corridor") {
          if (parent.record_kind === "project") projectRecordIds.add(parent.record_id);
          inheritedRouteRelations.push(...outgoingRelations(input.relations, parent.record_id, routeScopeKinds));
        }
      }
      continue;
    }
    if (subject.record_kind !== "event") unsupportedSubject = true;
  }

  const routeRelations = selectedScopeRelations(inheritedRouteRelations);
  const treatmentRelations = selectedScopeRelations(inheritedTreatmentRelations);
  const routeRecordIds =
    directRouteIds.size > 0 ? uniqueSorted(directRouteIds) : uniqueSorted(routeRelations.map((relation) => relation.objectId));
  const treatmentRecordIds =
    directTreatmentIds.size > 0
      ? uniqueSorted(directTreatmentIds)
      : uniqueSorted(treatmentRelations.map((relation) => relation.objectId));
  const inheritedRelationsUsed = [
    ...(directRouteIds.size > 0 ? [] : routeRelations),
    ...(directTreatmentIds.size > 0 ? [] : treatmentRelations),
  ];

  return {
    routeRecordIds,
    routeEvidenceRecords:
      directRouteIds.size > 0 ? uniqueRecords(directRouteEvidence) : uniqueRecords(routeRelations.map((relation) => relation.record)),
    treatmentRecordIds,
    treatmentEvidenceRecords:
      directTreatmentIds.size > 0
        ? uniqueRecords(directTreatmentEvidence)
        : uniqueRecords(treatmentRelations.map((relation) => relation.record)),
    projectRecordIds: uniqueSorted(projectRecordIds),
    routeDirect: directRouteIds.size > 0,
    treatmentDirect: directTreatmentIds.size > 0,
    inheritedScopeConfirmed: inheritedRelationsUsed.every((relation) => relation.assertionStatus === "delivered"),
    unsupportedSubject,
  };
}

function uniqueRecords(records: readonly MtaCanonicalRecord[]): MtaCanonicalRecord[] {
  return [...new Map(records.map((record) => [record.record_id, record])).values()].sort((a, b) => a.record_id.localeCompare(b.record_id));
}

function routeAnchorIndex(
  routeAnchors: readonly RouteAnchorRow[],
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): ReadonlyMap<string, string[]> {
  const index = new Map<string, Set<string>>();
  for (const anchor of routeAnchors) {
    if (!anchor.gtfs_route_id || anchor.disposition !== "true_route") continue;
    for (const recordId of [anchor.canonical_route_record_id, ...anchor.variant_record_ids]) {
      if (!recordId) continue;
      if (
        recordId !== anchor.canonical_route_record_id &&
        text(recordsById.get(recordId)?.payload.route_record_scope) !== "true_route"
      ) {
        continue;
      }
      const values = index.get(recordId) ?? new Set<string>();
      values.add(anchor.gtfs_route_id);
      index.set(recordId, values);
    }
  }
  return new Map([...index.entries()].map(([recordId, values]) => [recordId, uniqueSorted(values)]));
}

function treatmentFamilies(recordIds: readonly string[], recordsById: ReadonlyMap<string, MtaCanonicalRecord>): string[] {
  return uniqueSorted(
    recordIds.flatMap((recordId) => {
      const payload = recordsById.get(recordId)?.payload;
      if (!payload) return [];
      const family = text(payload.treatment_family) ?? text(payload.treatment_kind) ?? text(payload.component_kind);
      return family ? [family] : [];
    }),
  );
}

function normalizedDateLiteral(value: JsonValue | undefined): { normalized: string; precision: string } | null {
  const raw = text(value);
  if (!raw) return null;
  const normalized = normalizeDateText(raw);
  const normalizedDate = text(normalized.normalized_date);
  if (!normalizedDate) return null;
  const detectedPrecision = precisionFromNormalized(normalizedDate);
  if (detectedPrecision === "unknown") return null;
  return { normalized: normalizedDate, precision: detectedPrecision };
}

function precisionFromNormalized(value: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (day) {
    const year = Number(day[1]);
    const month = Number(day[2]);
    const dayOfMonth = Number(day[3]);
    const parsed = new Date(Date.UTC(year, month - 1, dayOfMonth));
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === dayOfMonth
    ) {
      return "day";
    }
    return "unknown";
  }
  const month = /^\d{4}-(\d{2})$/u.exec(value);
  if (month) {
    const monthNumber = Number(month[1]);
    return monthNumber >= 1 && monthNumber <= 12 ? "month" : "unknown";
  }
  if (/^\d{4}$/u.test(value)) return "year";
  if (/^\d{4}-(?:winter|spring|summer|fall)$/u.test(value)) return "season";
  return "unknown";
}

function eventDate(payload: JsonObject): EventDate {
  const fields = ["event_date", "date", "date_text", "year"] as const;
  let fallback: { raw: string; field: string } | null = null;
  const parsed = new Map<string, { raw: string; normalized: string; precision: string }>();
  for (const field of fields) {
    const raw = text(payload[field]);
    if (!raw) continue;
    fallback ??= { raw, field };
    const normalized = normalizedDateLiteral(payload[field]);
    if (!normalized) continue;
    parsed.set(field, { raw, normalized: normalized.normalized, precision: normalized.precision });
  }
  for (const field of fields) {
    const candidate = parsed.get(field);
    if (!candidate) continue;
    const sourceLiteral = parsed.get("date_text");
    if (
      (field === "event_date" || field === "date") &&
      /^\d{4}-01-01$/u.test(candidate.normalized) &&
      sourceLiteral?.precision === "year" &&
      candidate.normalized.startsWith(`${sourceLiteral.normalized}-`)
    ) {
      return { ...sourceLiteral, sourceField: "date_text" };
    }
    return { ...candidate, sourceField: field };
  }
  const normalizedValue = text(payload.date_normalized);
  const normalizedPrecision = normalizedValue ? precisionFromNormalized(normalizedValue) : "unknown";
  return {
    raw: fallback?.raw ?? null,
    normalized: normalizedPrecision === "unknown" ? null : normalizedValue,
    precision: normalizedPrecision,
    sourceField: fallback?.field ?? null,
  };
}

function precisionForStatusDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return "day";
  if (/^\d{4}-\d{2}$/u.test(value)) return "month";
  if (/^\d{4}$/u.test(value)) return "year";
  return "unknown";
}

function eventDateCandidates(payload: JsonObject): OperationalAnchorDateCandidate[] {
  const candidates = new Map<string, OperationalAnchorDateCandidate>();
  const add = (candidate: OperationalAnchorDateCandidate): void => {
    const key = [candidate.source_field, candidate.raw, candidate.normalized, candidate.precision, candidate.origin].join("|");
    candidates.set(key, candidate);
  };
  const scalar = text(payload.date_normalized);
  const scalarPrecision = scalar ? precisionFromNormalized(scalar) : "unknown";
  if (scalar && scalarPrecision !== "unknown") {
    add({
      source_field: "date_normalized",
      raw: scalar,
      normalized: scalar,
      precision: scalarPrecision,
      origin: "canonical_scalar",
    });
  }
  const fields = ["event_date", "date", "date_text", "year"] as const;
  for (const field of fields) {
    const raw = text(payload[field]);
    const normalized = normalizedDateLiteral(payload[field]);
    if (raw && normalized) {
      add({ source_field: field, raw, normalized: normalized.normalized, precision: normalized.precision, origin: "payload_field" });
    }
    const companion = payload[`${field}_normalized`];
    if (isJsonObject(companion)) {
      const companionNormalized = text(companion.normalized_date);
      const companionPrecision = companionNormalized
        ? precisionFromNormalized(companionNormalized)
        : "unknown";
      if (companionNormalized && companionPrecision !== "unknown") {
        add({
          source_field: `${field}_normalized`,
          raw: text(companion.raw_text) ?? raw ?? companionNormalized,
          normalized: companionNormalized,
          precision: companionPrecision,
          origin: "normalized_companion",
        });
      }
    }
  }
  const merged = payload._merged_field_values;
  if (isJsonObject(merged)) {
    for (const field of [...fields, "date_normalized"] as const) {
      const values = merged[field];
      if (!Array.isArray(values)) continue;
      for (const value of values) {
        const raw = text(value);
        if (!raw) continue;
        const normalized =
          field === "date_normalized"
            ? precisionFromNormalized(raw) === "unknown"
              ? null
              : { normalized: raw, precision: precisionFromNormalized(raw) }
            : normalizedDateLiteral(value);
        if (normalized) {
          add({ source_field: `_merged_field_values.${field}`, raw, normalized: normalized.normalized, precision: normalized.precision, origin: "merged_field" });
        }
      }
      const companionValues = merged[`${field}_normalized`];
      if (!Array.isArray(companionValues)) continue;
      for (const value of companionValues) {
        if (!isJsonObject(value)) continue;
        const normalized = text(value.normalized_date);
        const normalizedPrecision = normalized ? precisionFromNormalized(normalized) : "unknown";
        if (!normalized || normalizedPrecision === "unknown") continue;
        add({
          source_field: `_merged_field_values.${field}_normalized`,
          raw: text(value.raw_text) ?? normalized,
          normalized,
          precision: normalizedPrecision,
          origin: "normalized_companion",
        });
      }
    }
  }
  return [...candidates.values()].sort((left, right) =>
    [left.source_field, left.raw, left.normalized, left.precision, left.origin]
      .join("|")
      .localeCompare([right.source_field, right.raw, right.normalized, right.precision, right.origin].join("|")),
  );
}

function broaderDateContains(broader: string, narrower: string): boolean {
  if (/^\d{4}$/u.test(broader)) return narrower.startsWith(`${broader}-`);
  if (/^\d{4}-\d{2}$/u.test(broader)) return /^\d{4}-\d{2}-\d{2}$/u.test(narrower) && narrower.startsWith(`${broader}-`);
  return false;
}

function hasDateConflict(candidates: readonly string[]): boolean {
  const mostSpecific = candidates.filter(
    (candidate) => !candidates.some((other) => other !== candidate && broaderDateContains(candidate, other)),
  );
  return mostSpecific.length > 1;
}

function normalizedDateBounds(value: string): { start: string; end: string } | null {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return { start: value, end: value };
  if (/^\d{4}-\d{2}$/u.test(value)) return { start: `${value}-01`, end: `${value}-31` };
  if (/^\d{4}$/u.test(value)) return { start: `${value}-01-01`, end: `${value}-12-31` };
  const season = /^(\d{4})-(winter|spring|summer|fall)$/u.exec(value);
  if (!season) return null;
  const year = season[1];
  const months = { winter: ["01", "03"], spring: ["03", "06"], summer: ["06", "09"], fall: ["09", "12"] } as const;
  const range = months[season[2] as keyof typeof months];
  return { start: `${year}-${range[0]}-01`, end: `${year}-${range[1]}-31` };
}

function futureDeliveredStatus(candidate: EventDate, timelines: readonly Relation[]): boolean {
  if (!candidate.normalized) return false;
  const candidateBounds = normalizedDateBounds(candidate.normalized);
  if (!candidateBounds) return false;
  return timelines.some((timeline) => {
    if (timeline.assertionStatus !== "delivered") return false;
    const asOf = text(timeline.record.payload.as_of_date);
    if (!asOf) return false;
    const asOfBounds = normalizedDateBounds(asOf);
    return asOfBounds ? candidateBounds.start > asOfBounds.end : false;
  });
}

function temporalFields(event: MtaCanonicalRecord, timelines: readonly Relation[]): {
  role: OperationalAnchorTemporalRole;
  rawDate: string | null;
  normalizedDate: string | null;
  precision: string;
  candidate: EventDate;
  statuses: string[];
  statusAsOfDates: string[];
} {
  const candidate = eventDate(event.payload);
  const statuses = uniqueSorted(timelines.map((timeline) => timeline.assertionStatus));
  const statusAsOfDates = uniqueSorted(
    timelines.flatMap((timeline) => {
      const value = text(timeline.record.payload.as_of_date);
      return value ? [value] : [];
    }),
  );
  if (candidate.normalized && statuses.length === 1 && statuses[0] === "delivered") {
    return {
      role: "realized_operational",
      rawDate: candidate.raw,
      normalizedDate: candidate.normalized,
      precision: candidate.precision,
      candidate,
      statuses,
      statusAsOfDates,
    };
  }
  if (candidate.normalized && statuses.length > 0 && statuses.every((status) => plannedStatuses.has(status))) {
    return {
      role: "planned_operational",
      rawDate: candidate.raw,
      normalizedDate: candidate.normalized,
      precision: candidate.precision,
      candidate,
      statuses,
      statusAsOfDates,
    };
  }
  const statusDate = statusAsOfDates.length === 1 ? statusAsOfDates[0] ?? null : null;
  return {
    role: "status_as_of",
    rawDate: statusDate,
    normalizedDate: statusDate,
    precision: statusDate ? precisionForStatusDate(statusDate) : "unknown",
    candidate,
    statuses,
    statusAsOfDates,
  };
}

function evidenceRef(record: MtaCanonicalRecord, ref: MtaEvidenceRef, role: OperationalAnchorEvidenceRef["role"]): OperationalAnchorEvidenceRef {
  const rawTextSha256 = ref.text_sha256 ?? null;
  const textSha256 = rawTextSha256?.replace(/^sha256:/u, "") ?? null;
  if (textSha256 !== null && !/^[a-f0-9]{64}$/u.test(textSha256)) {
    throw new Error(
      `Invalid evidence text_sha256 on ${record.record_id}: expected SHA-256 hex with optional sha256: prefix`,
    );
  }
  return {
    record_id: record.record_id,
    source_id: ref.source_id,
    evidence_id: ref.evidence_id ?? null,
    block_id: ref.block_id ?? null,
    page_number: ref.page_number ?? null,
    text_sha256: textSha256,
    role,
  };
}

function evidenceFor(input: {
  event: MtaCanonicalRecord;
  timelines: readonly Relation[];
  scope: Scope;
}): { coverage: OperationalAnchorEvidenceCoverage; refs: OperationalAnchorEvidenceRef[] } {
  const coverage = {
    event: input.event.evidence_refs.length > 0,
    timeline: input.timelines.length > 0 && input.timelines.every((timeline) => timeline.record.evidence_refs.length > 0),
    route_scope:
      input.scope.routeEvidenceRecords.length > 0 && input.scope.routeEvidenceRecords.every((record) => record.evidence_refs.length > 0),
    treatment_scope:
      input.scope.treatmentEvidenceRecords.length > 0 && input.scope.treatmentEvidenceRecords.every((record) => record.evidence_refs.length > 0),
  } satisfies OperationalAnchorEvidenceCoverage;
  const refs = [
    ...input.event.evidence_refs.map((ref) => evidenceRef(input.event, ref, "event")),
    ...input.timelines.flatMap((timeline) => timeline.record.evidence_refs.map((ref) => evidenceRef(timeline.record, ref, "timeline_relation"))),
    ...input.scope.routeEvidenceRecords.flatMap((record) => record.evidence_refs.map((ref) => evidenceRef(record, ref, "route_scope"))),
    ...input.scope.treatmentEvidenceRecords.flatMap((record) =>
      record.evidence_refs.map((ref) => evidenceRef(record, ref, "treatment_scope")),
    ),
  ];
  const byKey = new Map<string, OperationalAnchorEvidenceRef>();
  for (const ref of refs) {
    const key = [ref.record_id, ref.source_id, ref.evidence_id ?? "", ref.block_id ?? "", ref.role].join("|");
    byKey.set(key, ref);
  }
  return {
    coverage,
    refs: [...byKey.values()].sort((a, b) =>
      [a.record_id, a.source_id, a.block_id ?? "", a.role].join("|").localeCompare([b.record_id, b.source_id, b.block_id ?? "", b.role].join("|")),
    ),
  };
}

function sourceRecordIndex(records: readonly MtaCanonicalRecord[]): ReadonlyMap<string, MtaCanonicalRecord> {
  const index = new Map<string, MtaCanonicalRecord>();
  for (const record of records) {
    if (record.record_kind !== "source") continue;
    const keys = new Set([record.record_id, record.source_id, ...(record.source_ids ?? [])]);
    if (record.record_id.startsWith("source_")) keys.add(record.record_id.slice("source_".length));
    for (const key of keys) {
      index.set(key, record);
      index.set(key.replaceAll("-", "_"), record);
      index.set(key.replaceAll("_", "-"), record);
    }
  }
  return index;
}

function isOfficialPublicPublisher(value: string): boolean {
  return /\b(?:mta|metropolitan transportation authority|new york city transit|nyc transit|nyc dot|nycdot|new york city department of transportation)\b/iu.test(
    value,
  );
}

function sourceAuthority(
  sourceIds: readonly string[],
  sourcesByKey: ReadonlyMap<string, MtaCanonicalRecord>,
): { authority: OperationalAnchorSourceAuthority; publishers: string[] } {
  if (sourceIds.length === 0) return { authority: "unknown", publishers: [] };
  const publishers = uniqueSorted(
    sourceIds.flatMap((sourceId) => {
      const publisher = text(sourcesByKey.get(sourceId)?.payload.publisher);
      return publisher ? [publisher] : [];
    }),
  );
  const resolvedCount = sourceIds.filter((sourceId) => sourcesByKey.has(sourceId)).length;
  const officialCount = sourceIds.filter((sourceId) => {
    const publisher = text(sourcesByKey.get(sourceId)?.payload.publisher);
    return publisher ? isOfficialPublicPublisher(publisher) : false;
  }).length;
  if (officialCount === sourceIds.length) return { authority: "official_public_agency", publishers };
  if (officialCount > 0) return { authority: "mixed", publishers };
  if (resolvedCount === sourceIds.length && publishers.length > 0) return { authority: "non_official", publishers };
  return { authority: "unknown", publishers };
}

function dimensionScopeResolution(count: number, direct: boolean, forcedAmbiguous = false): OperationalAnchorScopeResolution {
  if (count === 0) return "missing";
  if (count > 1 || forcedAmbiguous) return "ambiguous";
  if (direct) return "direct";
  return "unreviewed_inherited";
}

function combinedScopeResolution(
  route: OperationalAnchorScopeResolution,
  treatment: OperationalAnchorScopeResolution,
): OperationalAnchorScopeResolution {
  if (route === "missing" || treatment === "missing") return "missing";
  if (route === "ambiguous" || treatment === "ambiguous") return "ambiguous";
  if (route === "unreviewed_inherited" || treatment === "unreviewed_inherited") return "unreviewed_inherited";
  if (route === "reviewed_inherited" || treatment === "reviewed_inherited") return "reviewed_inherited";
  return "direct";
}

function exclusions(input: {
  temporal: ReturnType<typeof temporalFields>;
  lifecyclePhase: string | null;
  routeRecordCount: number;
  gtfsRouteCount: number;
  unmatchedRouteRecordCount: number;
  treatmentRecordCount: number;
  treatmentFamilyCount: number;
  scopeResolution: OperationalAnchorScopeResolution;
  inheritedScopeConfirmed: boolean;
  evidenceCoverage: OperationalAnchorEvidenceCoverage;
  reviewStates: readonly string[];
  conflictStates: readonly OperationalAnchorConflictState[];
  truthStatuses: readonly string[];
  sourceAuthority: OperationalAnchorSourceAuthority;
  unsupportedSubject: boolean;
}): OperationalAnchorExclusionReason[] {
  const reasons = new Set<OperationalAnchorExclusionReason>();
  if (!input.lifecyclePhase || !realizedLifecyclePhases.has(input.lifecyclePhase)) {
    reasons.add("ambiguous_lifecycle_phase");
  }
  if (input.temporal.role === "status_as_of") reasons.add("status_as_of_only");
  if (input.temporal.role === "planned_operational") reasons.add("non_realized_operational_date");
  if (!input.temporal.candidate.normalized) reasons.add("missing_operational_date");
  if (input.temporal.candidate.normalized && !preciseOperationalDatePrecisions.has(input.temporal.candidate.precision)) {
    reasons.add("imprecise_operational_date");
  }
  if (input.routeRecordCount === 0) reasons.add("missing_route_scope");
  else if (input.gtfsRouteCount === 0) reasons.add("unmatched_gtfs_route");
  else if (input.gtfsRouteCount > 1) reasons.add("ambiguous_route_scope");
  if (input.gtfsRouteCount > 0 && input.unmatchedRouteRecordCount > 0) reasons.add("partially_unmatched_gtfs_route");
  if (input.treatmentRecordCount === 0) reasons.add("missing_treatment_scope");
  else if (input.treatmentRecordCount > 1) reasons.add("ambiguous_treatment_scope");
  if (input.treatmentRecordCount > 0 && input.treatmentFamilyCount === 0) reasons.add("missing_treatment_family");
  if (input.scopeResolution === "unreviewed_inherited") reasons.add("unreviewed_inherited_scope");
  if (input.scopeResolution === "unreviewed_inherited" && !input.inheritedScopeConfirmed) reasons.add("unconfirmed_inherited_scope");
  if (!input.evidenceCoverage.event) reasons.add("missing_event_evidence");
  if (!input.evidenceCoverage.timeline) reasons.add("missing_timeline_evidence");
  if (input.routeRecordCount > 0 && !input.evidenceCoverage.route_scope) reasons.add("missing_route_scope_evidence");
  if (input.treatmentRecordCount > 0 && !input.evidenceCoverage.treatment_scope) reasons.add("missing_treatment_scope_evidence");
  if (input.reviewStates.includes("quarantined")) reasons.add("quarantined_record");
  if (input.conflictStates.includes("date_conflict")) reasons.add("conflicting_date_evidence");
  if (input.conflictStates.includes("route_identity_conflict")) reasons.add("conflicting_route_identity");
  if (input.conflictStates.includes("status_conflict")) reasons.add("conflicting_status_evidence");
  if (input.conflictStates.includes("temporal_order_conflict")) reasons.add("future_delivered_status");
  if (input.truthStatuses.some((status) => status !== "source_stated")) reasons.add("non_source_stated_evidence");
  if (input.sourceAuthority !== "official_public_agency") reasons.add("untrusted_source_authority");
  if (input.unsupportedSubject) reasons.add("unsupported_subject_scope");
  return uniqueSorted(reasons);
}

function normalizedSemanticLabel(event: MtaCanonicalRecord): string {
  const label = text(event.payload.event_name) ?? event.display_name;
  return label
    .toLowerCase()
    .replace(/\b(?:19|20)\d{2}-\d{1,2}(?:-\d{1,2})?\b/gu, " ")
    .replace(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*(?:19|20)\d{2})?\b/giu, " ")
    .replace(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(?:19|20)\d{2}\b/giu, " ")
    .replace(/\b(?:(?:winter|spring|summer|fall|autumn)[ -]+(?:19|20)\d{2}|(?:19|20)\d{2}[ -]+(?:winter|spring|summer|fall|autumn))\b/giu, " ")
    .replace(/\b(?:19|20)\d{2}\b/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function operationalChangeId(input: {
  event: MtaCanonicalRecord;
  projectRecordIds: readonly string[];
  subjectRecordIds: readonly string[];
  gtfsRouteIds: readonly string[];
  treatmentFamilies: readonly string[];
}): string {
  const components = [
    input.projectRecordIds.length > 0 ? input.projectRecordIds.join(",") : input.subjectRecordIds.join(","),
    input.gtfsRouteIds.join(","),
    input.treatmentFamilies.join(","),
    text(input.event.payload.event_family) ?? "unknown",
    normalizedSemanticLabel(input.event),
  ];
  return `change:${createHash("sha256").update(components.join("|")).digest("hex").slice(0, 24)}`;
}

function reviewedEvidenceRole(role: OperationalAnchorReviewEvidenceRole): OperationalAnchorEvidenceRef["role"] {
  if (role === "event_date") return "event";
  if (role === "timeline_relation" || role === "route_treatment_event_bridge") return "timeline_relation";
  if (role === "route_identity" || role === "route_scope") return "route_scope";
  return "treatment_scope";
}

function reviewedOperationalAnchorRows(input: {
  decisions: readonly OperationalAnchorReviewDecision[];
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>;
  sourcesByKey: ReadonlyMap<string, MtaCanonicalRecord>;
  gtfsByRouteRecord: ReadonlyMap<string, string[]>;
}): OperationalAnchorRow[] {
  return input.decisions.map((decision) => {
    const event = input.recordsById.get(decision.event_record_id);
    const timelineRecord = input.recordsById.get(decision.timeline_relation_record_id);
    const route = input.recordsById.get(decision.route_record_id);
    const routeScopeRecord = input.recordsById.get(decision.route_scope_relation_record_id);
    const treatment = input.recordsById.get(decision.treatment_record_id);
    const treatmentScopeRecord = input.recordsById.get(decision.treatment_scope_relation_record_id);
    const timeline = timelineRecord ? relationFromRecord(timelineRecord) : null;
    if (!event || !timelineRecord || !timeline || !route || !routeScopeRecord || !treatment || !treatmentScopeRecord) {
      throw new Error(`Reviewed operational-anchor decision ${decision.decision_id} lost a validated canonical binding`);
    }
    const subject = input.recordsById.get(timeline.subjectId);
    if (!subject) throw new Error(`Reviewed operational-anchor decision ${decision.decision_id} lost subject ${timeline.subjectId}`);

    const gtfsRouteIds = input.gtfsByRouteRecord.get(route.record_id) ?? [];
    if (gtfsRouteIds.length !== 1) {
      throw new Error(
        `Reviewed operational-anchor decision ${decision.decision_id} requires exactly one trusted GTFS route for ${route.record_id}; found ${gtfsRouteIds.length}`,
      );
    }
    const temporal = temporalFields(event, [timeline]);
    if (
      temporal.role !== "realized_operational" ||
      temporal.candidate.normalized !== decision.expected_operational_date ||
      temporal.candidate.precision !== decision.expected_date_precision
    ) {
      throw new Error(`Reviewed operational-anchor decision ${decision.decision_id} no longer resolves to its reviewed realized date`);
    }
    const dateCandidates = eventDateCandidates(event.payload);
    const normalizedDateCandidates = uniqueSorted(dateCandidates.map((candidate) => candidate.normalized));
    if (hasDateConflict(normalizedDateCandidates)) {
      throw new Error(`Reviewed operational-anchor decision ${decision.decision_id} has conflicting canonical event dates`);
    }

    const evidenceRefs = decision.evidence_bindings.map((binding) => {
      const record = input.recordsById.get(binding.record_id);
      const ref = record?.evidence_refs.find(
        (candidate) => candidate.source_id === binding.source_id && candidate.evidence_id === binding.evidence_id,
      );
      if (!record || !ref) {
        throw new Error(`Reviewed operational-anchor decision ${decision.decision_id} lost evidence ${binding.evidence_id}`);
      }
      return evidenceRef(record, ref, reviewedEvidenceRole(binding.role));
    });
    const uniqueEvidenceRefs = [...new Map(
      evidenceRefs.map((ref) => [
        [ref.record_id, ref.source_id, ref.evidence_id ?? "", ref.block_id ?? "", ref.role].join("|"),
        ref,
      ]),
    ).values()].sort((left, right) =>
      [left.record_id, left.source_id, left.block_id ?? "", left.role]
        .join("|")
        .localeCompare([right.record_id, right.source_id, right.block_id ?? "", right.role].join("|")),
    );
    const sourceIds = uniqueSorted(uniqueEvidenceRefs.map((ref) => ref.source_id));
    const authority = sourceAuthority(sourceIds, input.sourcesByKey);
    const qualityRecords = uniqueRecords([
      event,
      timelineRecord,
      route,
      routeScopeRecord,
      treatment,
      treatmentScopeRecord,
      subject,
      ...decision.evidence_bindings.flatMap((binding) => {
        const record = input.recordsById.get(binding.record_id);
        return record ? [record] : [];
      }),
    ]);
    const truthStatuses = uniqueSorted(qualityRecords.map((record) => record.truth_status));
    const evidenceCoverage = {
      event: true,
      timeline: true,
      route_scope: true,
      treatment_scope: true,
    } satisfies OperationalAnchorEvidenceCoverage;
    const conflictStates = uniqueSorted<OperationalAnchorConflictState>([
      ...(futureDeliveredStatus(temporal.candidate, [timeline]) ? ["temporal_order_conflict" as const] : []),
    ]);
    const exclusionReasons = exclusions({
      temporal,
      lifecyclePhase: text(event.payload.lifecycle_phase),
      routeRecordCount: 1,
      gtfsRouteCount: 1,
      unmatchedRouteRecordCount: 0,
      treatmentRecordCount: 1,
      treatmentFamilyCount: 1,
      scopeResolution: "reviewed_inherited",
      inheritedScopeConfirmed: true,
      evidenceCoverage,
      reviewStates: qualityRecords.map((record) => record.review_state),
      conflictStates,
      truthStatuses,
      sourceAuthority: authority.authority,
      unsupportedSubject: false,
    });
    if (exclusionReasons.length > 0) {
      throw new Error(
        `Reviewed operational-anchor decision ${decision.decision_id} is not export-safe: ${exclusionReasons.join(", ")}`,
      );
    }
    const projectRecordIds = subject.record_kind === "project" ? [subject.record_id] : [];

    return {
      schema_version: OPERATIONAL_ANCHOR_SCHEMA_VERSION,
      anchor_id: `operational-reviewed:${decision.decision_id}`,
      operational_change_id: operationalChangeId({
        event,
        projectRecordIds,
        subjectRecordIds: [subject.record_id],
        gtfsRouteIds,
        treatmentFamilies: [decision.treatment_family],
      }),
      event_record_id: event.record_id,
      timeline_relation_record_ids: [timelineRecord.record_id],
      project_record_ids: projectRecordIds,
      subject_record_ids: [subject.record_id],
      subject_record_kinds: [subject.record_kind],
      route_record_ids: [route.record_id],
      unmatched_route_record_ids: [],
      gtfs_route_ids: gtfsRouteIds,
      treatment_record_ids: [treatment.record_id],
      treatment_families: [decision.treatment_family],
      route_scope_direct: false,
      treatment_scope_direct: false,
      temporal_role: temporal.role,
      raw_date: temporal.rawDate,
      normalized_date: temporal.normalizedDate,
      date_precision: temporal.precision,
      candidate_operational_date_raw: temporal.candidate.raw,
      candidate_operational_date_normalized: temporal.candidate.normalized,
      candidate_operational_date_precision: temporal.candidate.precision,
      candidate_operational_date_source_field: temporal.candidate.sourceField,
      candidate_operational_date_candidates: dateCandidates,
      candidate_operational_dates_normalized: normalizedDateCandidates,
      status_as_of_dates: temporal.statusAsOfDates,
      event_family: text(event.payload.event_family) ?? "unknown",
      lifecycle_phase: text(event.payload.lifecycle_phase),
      assertion_statuses: temporal.statuses,
      truth_status: event.truth_status,
      truth_statuses: truthStatuses,
      review_state: "accepted",
      source_id: decision.source_id,
      source_ids: sourceIds,
      source_authority: authority.authority,
      source_publishers: authority.publishers,
      route_scope_resolution: "reviewed_inherited",
      treatment_scope_resolution: "reviewed_inherited",
      scope_resolution: "reviewed_inherited",
      conflict_states: conflictStates,
      evidence_coverage: evidenceCoverage,
      evidence_refs: uniqueEvidenceRefs,
      exclusion_reasons: [],
      study_eligible: true,
    };
  });
}

export function computeOperationalAnchorProjection(
  records: readonly MtaCanonicalRecord[],
  routeAnchors: readonly RouteAnchorRow[],
  options: ComputeOperationalAnchorsOptions = {},
): OperationalAnchorProjection {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const sourcesByKey = sourceRecordIndex(records);
  const relations = records.flatMap((record) => {
    const relation = relationFromRecord(record);
    return relation ? [relation] : [];
  });
  const gtfsByRouteRecord = routeAnchorIndex(routeAnchors, recordsById);
  const reviewDecisions = assertOperationalAnchorReviewDecisions(
    options.reviewDecisions ?? [],
    records,
  );
  const entryGate: OperationalAnchorEntryGate = {
    relations_examined: 0,
    non_event_timeline_objects: 0,
    non_operational_event_objects: 0,
  };
  const timelinesByEvent = new Map<string, Relation[]>();
  for (const relation of relations) {
    if (relation.kind !== "has_timeline_event") continue;
    entryGate.relations_examined += 1;
    const event = recordsById.get(relation.objectId);
    if (!event || event.record_kind !== "event") {
      entryGate.non_event_timeline_objects += 1;
      continue;
    }
    if (!operationalEventFamilies.has(text(event.payload.event_family) ?? "")) {
      entryGate.non_operational_event_objects += 1;
      continue;
    }
    const timelines = timelinesByEvent.get(event.record_id) ?? [];
    timelines.push(relation);
    timelinesByEvent.set(event.record_id, timelines);
  }

  const rows: OperationalAnchorRow[] = [];
  for (const [eventId, timelinesUnsorted] of timelinesByEvent) {
    const event = recordsById.get(eventId);
    if (!event) continue;
    const timelines = [...timelinesUnsorted].sort((a, b) => a.record.record_id.localeCompare(b.record.record_id));
    const subjects = timelines.flatMap((timeline) => {
      const subject = recordsById.get(timeline.subjectId);
      return subject ? [subject] : [];
    });
    const scope = scopeForEvent({ event, timelines, relations, recordsById });
    const unmatchedRouteRecordIds = scope.routeRecordIds.filter((recordId) => (gtfsByRouteRecord.get(recordId)?.length ?? 0) === 0);
    const routeIdentityConflict = scope.routeRecordIds.some((recordId) => (gtfsByRouteRecord.get(recordId)?.length ?? 0) > 1);
    const gtfsRouteIds = uniqueSorted(scope.routeRecordIds.flatMap((recordId) => gtfsByRouteRecord.get(recordId) ?? []));
    const families = treatmentFamilies(scope.treatmentRecordIds, recordsById);
    const temporal = temporalFields(event, timelines);
    const dateCandidates = eventDateCandidates(event.payload);
    const normalizedDateCandidates = uniqueSorted(dateCandidates.map((candidate) => candidate.normalized));
    const conflictStates = uniqueSorted<OperationalAnchorConflictState>([
      ...(hasDateConflict(normalizedDateCandidates) ? ["date_conflict" as const] : []),
      ...(routeIdentityConflict ? ["route_identity_conflict" as const] : []),
      ...(temporal.statuses.length > 1 ? ["status_conflict" as const] : []),
      ...(futureDeliveredStatus(temporal.candidate, timelines) ? ["temporal_order_conflict" as const] : []),
    ]);
    const routeScopeState = dimensionScopeResolution(gtfsRouteIds.length, scope.routeDirect, unmatchedRouteRecordIds.length > 0);
    const treatmentScopeState = dimensionScopeResolution(scope.treatmentRecordIds.length, scope.treatmentDirect);
    const scopeState = combinedScopeResolution(routeScopeState, treatmentScopeState);
    const evidence = evidenceFor({ event, timelines, scope });
    const sourceIds = uniqueSorted([event.source_id, ...(event.source_ids ?? []), ...evidence.refs.map((ref) => ref.source_id)]);
    const authority = sourceAuthority(sourceIds, sourcesByKey);
    const qualityRecords = uniqueRecords([
      event,
      ...timelines.map((timeline) => timeline.record),
      ...subjects,
      ...scope.routeRecordIds.flatMap((recordId) => {
        const record = recordsById.get(recordId);
        return record ? [record] : [];
      }),
      ...scope.treatmentRecordIds.flatMap((recordId) => {
        const record = recordsById.get(recordId);
        return record ? [record] : [];
      }),
      ...scope.routeEvidenceRecords,
      ...scope.treatmentEvidenceRecords,
    ]);
    const truthStatuses = uniqueSorted(qualityRecords.map((record) => record.truth_status));
    const exclusionReasons = exclusions({
      temporal,
      lifecyclePhase: text(event.payload.lifecycle_phase),
      routeRecordCount: scope.routeRecordIds.length,
      gtfsRouteCount: gtfsRouteIds.length,
      unmatchedRouteRecordCount: unmatchedRouteRecordIds.length,
      treatmentRecordCount: scope.treatmentRecordIds.length,
      treatmentFamilyCount: families.length,
      scopeResolution: scopeState,
      inheritedScopeConfirmed: scope.inheritedScopeConfirmed,
      evidenceCoverage: evidence.coverage,
      reviewStates: qualityRecords.map((record) => record.review_state),
      conflictStates,
      truthStatuses,
      sourceAuthority: authority.authority,
      unsupportedSubject: scope.unsupportedSubject,
    });
    const subjectRecordIds = uniqueSorted(subjects.map((subject) => subject.record_id));

    rows.push({
      schema_version: OPERATIONAL_ANCHOR_SCHEMA_VERSION,
      anchor_id: `operational:${event.record_id}`,
      operational_change_id: operationalChangeId({
        event,
        projectRecordIds: scope.projectRecordIds,
        subjectRecordIds,
        gtfsRouteIds,
        treatmentFamilies: families,
      }),
      event_record_id: event.record_id,
      timeline_relation_record_ids: timelines.map((timeline) => timeline.record.record_id),
      project_record_ids: scope.projectRecordIds,
      subject_record_ids: subjectRecordIds,
      subject_record_kinds: uniqueSorted(subjects.map((subject) => subject.record_kind)),
      route_record_ids: scope.routeRecordIds,
      unmatched_route_record_ids: unmatchedRouteRecordIds,
      gtfs_route_ids: gtfsRouteIds,
      treatment_record_ids: scope.treatmentRecordIds,
      treatment_families: families,
      route_scope_direct: scope.routeDirect,
      treatment_scope_direct: scope.treatmentDirect,
      temporal_role: temporal.role,
      raw_date: temporal.rawDate,
      normalized_date: temporal.normalizedDate,
      date_precision: temporal.precision,
      candidate_operational_date_raw: temporal.candidate.raw,
      candidate_operational_date_normalized: temporal.candidate.normalized,
      candidate_operational_date_precision: temporal.candidate.precision,
      candidate_operational_date_source_field: temporal.candidate.sourceField,
      candidate_operational_date_candidates: dateCandidates,
      candidate_operational_dates_normalized: normalizedDateCandidates,
      status_as_of_dates: temporal.statusAsOfDates,
      event_family: text(event.payload.event_family) ?? "unknown",
      lifecycle_phase: text(event.payload.lifecycle_phase),
      assertion_statuses: temporal.statuses,
      truth_status: event.truth_status,
      truth_statuses: truthStatuses,
      review_state: event.review_state,
      source_id: event.source_id,
      source_ids: sourceIds,
      source_authority: authority.authority,
      source_publishers: authority.publishers,
      route_scope_resolution: routeScopeState,
      treatment_scope_resolution: treatmentScopeState,
      scope_resolution: scopeState,
      conflict_states: conflictStates,
      evidence_coverage: evidence.coverage,
      evidence_refs: evidence.refs,
      exclusion_reasons: exclusionReasons,
      study_eligible: exclusionReasons.length === 0,
    });
  }

  rows.push(
    ...reviewedOperationalAnchorRows({
      decisions: reviewDecisions,
      recordsById,
      sourcesByKey,
      gtfsByRouteRecord,
    }),
  );

  return {
    rows: rows.sort((a, b) => a.anchor_id.localeCompare(b.anchor_id)),
    entry_gate: entryGate,
  };
}

export function computeOperationalAnchors(
  records: readonly MtaCanonicalRecord[],
  routeAnchors: readonly RouteAnchorRow[],
  options: ComputeOperationalAnchorsOptions = {},
): OperationalAnchorRow[] {
  return computeOperationalAnchorProjection(records, routeAnchors, options).rows;
}

function countBy(values: Iterable<string>): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function summarizeOperationalAnchors(
  rows: readonly OperationalAnchorRow[],
  input: {
    canonicalEventCount: number;
    operationalFamilyEventCount: number;
    entryGate: OperationalAnchorEntryGate;
  },
): OperationalAnchorSummary {
  const broadRows = rows.filter((row) => row.anchor_id.startsWith("operational:"));
  const reviewedRows = rows.filter((row) => row.anchor_id.startsWith("operational-reviewed:"));
  const distinctOperationalEventCount = new Set(broadRows.map((row) => row.event_record_id)).size;
  const timelineLinkedDistinctEvents = new Set(broadRows.map((row) => row.event_record_id)).size;
  const operationalFamilyEventsTotal = input.operationalFamilyEventCount;
  if (operationalFamilyEventsTotal < timelineLinkedDistinctEvents) {
    throw new Error(
      `operational family event count ${operationalFamilyEventsTotal} is smaller than ${timelineLinkedDistinctEvents} timeline-linked distinct events`,
    );
  }
  const broadDated = broadRows.filter((row) => row.candidate_operational_date_normalized !== null);
  const broadRealized = broadDated.filter((row) => row.temporal_role === "realized_operational");
  const broadPrecise = broadRealized.filter((row) => preciseOperationalDatePrecisions.has(row.candidate_operational_date_precision));
  const broadRouteResolved = broadPrecise.filter(
    (row) =>
      row.gtfs_route_ids.length === 1 &&
      (row.route_scope_resolution === "direct" || row.route_scope_resolution === "reviewed_inherited"),
  );
  const broadTreatmentResolved = broadRouteResolved.filter(
    (row) =>
      row.treatment_record_ids.length === 1 &&
      (row.treatment_scope_resolution === "direct" || row.treatment_scope_resolution === "reviewed_inherited"),
  );
  const broadEvidenceComplete = broadTreatmentResolved.filter((row) => Object.values(row.evidence_coverage).every(Boolean));
  const broadConflictFree = broadEvidenceComplete.filter((row) => row.conflict_states.length === 0);
  return {
    schema_version: OPERATIONAL_ANCHOR_SCHEMA_VERSION,
    row_count: rows.length,
    broad_row_count: broadRows.length,
    reviewed_row_count: reviewedRows.length,
    distinct_operational_event_count: distinctOperationalEventCount,
    study_eligible_count: rows.filter((row) => row.study_eligible).length,
    study_eligible_reviewed_count: reviewedRows.filter((row) => row.study_eligible).length,
    counts_by_temporal_role: countBy(rows.map((row) => row.temporal_role)),
    counts_by_scope_resolution: countBy(rows.map((row) => row.scope_resolution)),
    counts_by_exclusion_reason: countBy(rows.flatMap((row) => row.exclusion_reasons)),
    entry_gate: input.entryGate,
    broad_funnel: {
      operational_family_events_total: operationalFamilyEventsTotal,
      timeline_linked_distinct_events: timelineLinkedDistinctEvents,
      unlinked_operational_events: operationalFamilyEventsTotal - timelineLinkedDistinctEvents,
      candidate_operational_date_present: broadDated.length,
      realized_operational: broadRealized.length,
      realized_day_or_month: broadPrecise.length,
      resolved_route_scope: broadRouteResolved.length,
      resolved_treatment_scope: broadTreatmentResolved.length,
      evidence_complete: broadEvidenceComplete.length,
      conflict_free: broadConflictFree.length,
      study_eligible: broadRows.filter((row) => row.study_eligible).length,
    },
    funnel: {
      canonical_events: input.canonicalEventCount,
      operational_family_events_total: operationalFamilyEventsTotal,
      timeline_linked_operational_events: broadRows.length,
      timeline_linked_distinct_events: timelineLinkedDistinctEvents,
      unlinked_operational_events: operationalFamilyEventsTotal - timelineLinkedDistinctEvents,
      candidate_operational_date_present: broadDated.length,
      realized_operational: broadRealized.length,
      realized_day_or_month: broadPrecise.length,
      resolved_route_scope: broadRouteResolved.length,
      resolved_treatment_scope: broadTreatmentResolved.length,
      evidence_complete: broadEvidenceComplete.length,
      conflict_free: broadConflictFree.length,
      study_eligible: broadRows.filter((row) => row.study_eligible).length,
    },
  };
}

export function operationalAnchorsJsonl(rows: readonly OperationalAnchorRow[]): string {
  return rows.map((row) => stableJson(row as unknown as JsonValue)).join("\n") + (rows.length > 0 ? "\n" : "");
}

export function operationalAnchorSummaryJson(summary: OperationalAnchorSummary): string {
  return `${stableJson(summary as unknown as JsonValue)}\n`;
}

export function writeOperationalAnchorsJsonl(path: string, rows: readonly OperationalAnchorRow[]): void {
  writeFileSync(path, operationalAnchorsJsonl(rows), "utf8");
}
