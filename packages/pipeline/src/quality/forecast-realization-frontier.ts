import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord, MtaEvidenceRef } from "@mta-wiki/db/types";
import type {
  OperationalCoverageDimension,
  OperationalCoverageQueueRow,
  OperationalCoverageVerdict,
} from "@mta-wiki/pipeline/quality/operational-coverage";

export const FORECAST_REALIZATION_FRONTIER_SCHEMA_VERSION = 1 as const;

export type ForecastTargetDateInterval = {
  start: string;
  end: string;
};

export type ForecastTargetDate = {
  raw: string | null;
  normalized: string | null;
  precision: string;
  interval: ForecastTargetDateInterval | null;
  grace_deadline: string | null;
};

export type ForecastRealizedCandidate = {
  event_record_id: string;
  event_display_name: string;
  event_family: "implementation" | "launch";
  lifecycle_phase: string;
  date_raw: string | null;
  date_normalized: string | null;
  date_precision: string;
  shared_subject_record_ids: string[];
  timeline_relation_record_ids: string[];
  source_ids: string[];
  evidence_fingerprint: string;
};

export type ForecastOperationalDiagnostic = {
  gap_id: string;
  dimension: OperationalCoverageDimension;
  status: "open" | "ready_for_review" | "terminal";
  verdict: OperationalCoverageVerdict;
};

export type ForecastAcquisitionAction =
  | "monitor"
  | "acquire_realization_evidence"
  | "review_realized_candidate"
  | "resolve_target_date";

export type ForecastRealizationTarget = {
  target_id: string;
  forecast_event_record_id: string;
  forecast_event_display_name: string;
  event_family: "implementation" | "launch";
  lifecycle_phase: "planned";
  source_ids: string[];
  forecast_date: ForecastTargetDate;
  as_of: string;
  grace_days: number;
  due_for_acquisition: boolean | null;
  action: ForecastAcquisitionAction;
  frontier_state: "open";
  matchability: "shared_timeline_subject" | "no_timeline_subject";
  subject_record_ids: string[];
  timeline_relation_record_ids: string[];
  realized_candidates: ForecastRealizedCandidate[];
  operational_diagnostics: ForecastOperationalDiagnostic[];
  operational_diagnostic_state: "all_open" | "all_ready_for_review" | "all_terminal" | "mixed";
  evidence_fingerprint: string;
  basis_fingerprint: string;
};

export type ForecastRealizationFrontierSummary = {
  planned_operational_event_count: number;
  acquisition_target_count: number;
  excluded_nonpriority_planned_event_count: number;
  operational_diagnostic_row_count: number;
  operational_terminal_diagnostic_row_count: number;
  targets_due_for_acquisition_count: number;
  targets_not_due_count: number;
  targets_with_unresolved_date_count: number;
  targets_with_realized_candidates_count: number;
  targets_by_action: Record<ForecastAcquisitionAction, number>;
};

export type ForecastRealizationTargetList = {
  schema_version: typeof FORECAST_REALIZATION_FRONTIER_SCHEMA_VERSION;
  as_of: string;
  grace_days: number;
  corpus_fingerprint: string | null;
  operational_coverage_input_fingerprint: string | null;
  selection_basis: "planned implementation/launch events with a priority operational-coverage diagnostic";
  candidate_matching_basis: "shared incoming has_timeline_event subject";
  candidate_policy: "candidate_only_never_auto_close";
  date_interval_policy: "exact day/month bounds; conservative calendar-year bounds for year/season; unknown unresolved";
  frontier_basis_fingerprint: string;
  artifact_fingerprint: string;
  summary: ForecastRealizationFrontierSummary;
  targets: ForecastRealizationTarget[];
};

export type BuildForecastRealizationFrontierInput = {
  records: readonly MtaCanonicalRecord[];
  priorityQueue: readonly OperationalCoverageQueueRow[];
  asOf: string;
  graceDays: number;
  corpusFingerprint?: string | null | undefined;
  operationalCoverageInputFingerprint?: string | null | undefined;
};

const operationalFamilies = new Set(["implementation", "launch"]);
const realizedLifecyclePhases = new Set([
  "completed",
  "expanded",
  "installed",
  "launched",
  "modified",
  "piloted",
  "resumed",
]);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value: unknown): string {
  return sha256(stableJson(value as JsonValue));
}

function token(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sourceIdsFor(record: MtaCanonicalRecord): string[] {
  return uniqueSorted([record.source_id, ...(record.source_ids ?? [])].filter(Boolean));
}

function exactIsoDay(value: string, label: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new Error(`${label} must be an ISO day (YYYY-MM-DD): ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) throw new Error(`${label} is not a valid calendar day: ${value}`);
  return value;
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parsedForecastInterval(normalized: string | null, precision: string): ForecastTargetDateInterval | null {
  if (!normalized) return null;
  if (precision === "day") {
    try {
      const day = exactIsoDay(normalized, "forecast normalized date");
      return { start: day, end: day };
    } catch {
      return null;
    }
  }
  if (precision === "month") {
    const match = /^(\d{4})-(\d{2})$/u.exec(normalized);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    return {
      start: `${match[1]}-${match[2]}-01`,
      end: `${match[1]}-${match[2]}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`,
    };
  }
  if (precision === "year") {
    const match = /^(\d{4})$/u.exec(normalized);
    return match ? { start: `${match[1]}-01-01`, end: `${match[1]}-12-31` } : null;
  }
  if (precision === "season") {
    const match = /^(\d{4})-(winter|spring|summer|fall|autumn)$/u.exec(normalized.toLowerCase());
    if (!match) return null;
    const year = match[1]!;
    // A normalized season is intentionally not promoted to invented month/day
    // boundaries. This mirrors operational coverage's conservative date window.
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  return null;
}

function forecastDate(record: MtaCanonicalRecord, graceDays: number): ForecastTargetDate {
  const raw = stringOrNull(record.payload.date_text ?? record.payload.event_date ?? record.payload.date);
  const normalized = stringOrNull(
    record.payload.date_normalized ?? record.payload.event_date_normalized ?? record.payload.implementation_date_normalized,
  );
  const precision = token(record.payload.date_precision) || "unknown";
  const interval = parsedForecastInterval(normalized, precision);
  return {
    raw,
    normalized,
    precision,
    interval,
    grace_deadline: interval ? addDays(interval.end, graceDays) : null,
  };
}

function evidenceRefSnapshot(ref: MtaEvidenceRef): JsonValue {
  return {
    source_id: ref.source_id,
    evidence_id: ref.evidence_id ?? null,
    block_id: ref.block_id ?? null,
    page_number: ref.page_number ?? null,
    text_sha256: ref.text_sha256 ?? null,
    source_quote: ref.source_quote ?? null,
  };
}

function recordEvidenceSnapshot(record: MtaCanonicalRecord): JsonValue {
  const refs = record.evidence_refs
    .map(evidenceRefSnapshot)
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
  return {
    record_id: record.record_id,
    source_ids: sourceIdsFor(record),
    evidence_refs: refs,
  };
}

function evidenceFingerprint(records: readonly MtaCanonicalRecord[]): string {
  return fingerprint(
    [...records]
      .sort((left, right) => left.record_id.localeCompare(right.record_id))
      .map(recordEvidenceSnapshot),
  );
}

function isTimelineRelation(record: MtaCanonicalRecord): boolean {
  return (
    record.record_kind === "relation" &&
    record.review_state !== "quarantined" &&
    record.payload.relation_kind === "has_timeline_event" &&
    typeof record.payload.subject_id === "string" &&
    Boolean(record.payload.subject_id.trim()) &&
    typeof record.payload.object_id === "string" &&
    Boolean(record.payload.object_id.trim())
  );
}

function isPlannedOperationalEvent(record: MtaCanonicalRecord): boolean {
  return (
    record.record_kind === "event" &&
    record.review_state !== "quarantined" &&
    token(record.payload.lifecycle_phase) === "planned" &&
    operationalFamilies.has(token(record.payload.event_family))
  );
}

function isRealizedOperationalEvent(record: MtaCanonicalRecord): boolean {
  return (
    record.record_kind === "event" &&
    record.review_state !== "quarantined" &&
    realizedLifecyclePhases.has(token(record.payload.lifecycle_phase)) &&
    operationalFamilies.has(token(record.payload.event_family))
  );
}

function diagnosticState(
  diagnostics: readonly ForecastOperationalDiagnostic[],
): ForecastRealizationTarget["operational_diagnostic_state"] {
  const statuses = new Set(diagnostics.map((row) => row.status));
  if (statuses.size !== 1) return "mixed";
  const status = diagnostics[0]?.status;
  if (status === "terminal") return "all_terminal";
  if (status === "ready_for_review") return "all_ready_for_review";
  return "all_open";
}

function emptyActionCounts(): Record<ForecastAcquisitionAction, number> {
  return {
    monitor: 0,
    acquire_realization_evidence: 0,
    review_realized_candidate: 0,
    resolve_target_date: 0,
  };
}

function targetId(eventRecordId: string): string {
  return `forecast-target:${sha256(eventRecordId).slice(0, 24)}`;
}

export function buildForecastRealizationFrontier(
  input: BuildForecastRealizationFrontierInput,
): ForecastRealizationTargetList {
  const asOf = exactIsoDay(input.asOf, "asOf");
  if (!Number.isInteger(input.graceDays) || input.graceDays < 0) {
    throw new Error(`graceDays must be a non-negative integer: ${String(input.graceDays)}`);
  }

  const records = [...input.records].sort((left, right) => left.record_id.localeCompare(right.record_id));
  const events = records.filter((record) => record.record_kind === "event");
  const plannedEvents = events.filter(isPlannedOperationalEvent);
  const realizedEventsById = new Map(events.filter(isRealizedOperationalEvent).map((event) => [event.record_id, event]));
  const relations = records.filter(isTimelineRelation);
  const incomingByEvent = new Map<string, MtaCanonicalRecord[]>();
  const eventRelationsBySubject = new Map<string, MtaCanonicalRecord[]>();
  for (const relation of relations) {
    const objectId = relation.payload.object_id as string;
    const subjectId = relation.payload.subject_id as string;
    incomingByEvent.set(objectId, [...(incomingByEvent.get(objectId) ?? []), relation]);
    eventRelationsBySubject.set(subjectId, [...(eventRelationsBySubject.get(subjectId) ?? []), relation]);
  }
  for (const rows of incomingByEvent.values()) rows.sort((left, right) => left.record_id.localeCompare(right.record_id));
  for (const rows of eventRelationsBySubject.values()) rows.sort((left, right) => left.record_id.localeCompare(right.record_id));

  const queueByEvent = new Map<string, OperationalCoverageQueueRow[]>();
  for (const row of [...input.priorityQueue].sort((left, right) => left.gap_id.localeCompare(right.gap_id))) {
    if (!row.priority) continue;
    queueByEvent.set(row.event_record_id, [...(queueByEvent.get(row.event_record_id) ?? []), row]);
  }
  const selectedEvents = plannedEvents.filter((event) => (queueByEvent.get(event.record_id)?.length ?? 0) > 0);

  const targets = selectedEvents.map((event): ForecastRealizationTarget => {
    const targetRelations = incomingByEvent.get(event.record_id) ?? [];
    const subjectIds = uniqueSorted(targetRelations.map((relation) => relation.payload.subject_id as string));
    const candidateMatches = new Map<string, { event: MtaCanonicalRecord; relations: MtaCanonicalRecord[]; subjects: Set<string> }>();
    for (const subjectId of subjectIds) {
      for (const relation of eventRelationsBySubject.get(subjectId) ?? []) {
        const candidateEventId = relation.payload.object_id as string;
        if (candidateEventId === event.record_id) continue;
        const candidateEvent = realizedEventsById.get(candidateEventId);
        if (!candidateEvent) continue;
        const match = candidateMatches.get(candidateEventId) ?? {
          event: candidateEvent,
          relations: [],
          subjects: new Set<string>(),
        };
        match.relations.push(relation);
        match.subjects.add(subjectId);
        candidateMatches.set(candidateEventId, match);
      }
    }
    const realizedCandidates = [...candidateMatches.values()]
      .sort((left, right) => left.event.record_id.localeCompare(right.event.record_id))
      .map((match): ForecastRealizedCandidate => {
        const candidateRelations = [...new Map(match.relations.map((relation) => [relation.record_id, relation])).values()]
          .sort((left, right) => left.record_id.localeCompare(right.record_id));
        return {
          event_record_id: match.event.record_id,
          event_display_name: match.event.display_name,
          event_family: token(match.event.payload.event_family) as "implementation" | "launch",
          lifecycle_phase: token(match.event.payload.lifecycle_phase),
          date_raw: stringOrNull(match.event.payload.date_text ?? match.event.payload.event_date ?? match.event.payload.date),
          date_normalized: stringOrNull(
            match.event.payload.date_normalized ??
              match.event.payload.event_date_normalized ??
              match.event.payload.implementation_date_normalized,
          ),
          date_precision: token(match.event.payload.date_precision) || "unknown",
          shared_subject_record_ids: uniqueSorted(match.subjects),
          timeline_relation_record_ids: candidateRelations.map((relation) => relation.record_id),
          source_ids: sourceIdsFor(match.event),
          evidence_fingerprint: evidenceFingerprint([match.event, ...candidateRelations]),
        };
      });
    const date = forecastDate(event, input.graceDays);
    const dueForAcquisition = date.grace_deadline === null ? null : asOf > date.grace_deadline;
    const action: ForecastAcquisitionAction = realizedCandidates.length > 0
      ? "review_realized_candidate"
      : dueForAcquisition === null
        ? "resolve_target_date"
        : dueForAcquisition
          ? "acquire_realization_evidence"
          : "monitor";
    const diagnostics = (queueByEvent.get(event.record_id) ?? []).map((row): ForecastOperationalDiagnostic => ({
      gap_id: row.gap_id,
      dimension: row.dimension,
      status: row.status,
      verdict: row.verdict,
    }));
    const targetEvidenceFingerprint = evidenceFingerprint([event, ...targetRelations]);
    const basis = {
      forecast_event: {
        record_id: event.record_id,
        event_family: token(event.payload.event_family),
        lifecycle_phase: token(event.payload.lifecycle_phase),
        date,
      },
      as_of: asOf,
      grace_days: input.graceDays,
      subject_record_ids: subjectIds,
      timeline_relations: targetRelations.map((relation) => ({
        record_id: relation.record_id,
        subject_id: relation.payload.subject_id as string,
        object_id: relation.payload.object_id as string,
        assertion_status: stringOrNull(relation.payload.assertion_status),
      })),
      operational_diagnostic_identity: diagnostics.map((row) => ({
        gap_id: row.gap_id,
        dimension: row.dimension,
      })),
      target_evidence_fingerprint: targetEvidenceFingerprint,
      realized_candidates: realizedCandidates.map((candidate) => ({
        event_record_id: candidate.event_record_id,
        event_family: candidate.event_family,
        lifecycle_phase: candidate.lifecycle_phase,
        date_normalized: candidate.date_normalized,
        date_precision: candidate.date_precision,
        shared_subject_record_ids: candidate.shared_subject_record_ids,
        timeline_relation_record_ids: candidate.timeline_relation_record_ids,
        evidence_fingerprint: candidate.evidence_fingerprint,
      })),
    };
    return {
      target_id: targetId(event.record_id),
      forecast_event_record_id: event.record_id,
      forecast_event_display_name: event.display_name,
      event_family: token(event.payload.event_family) as "implementation" | "launch",
      lifecycle_phase: "planned",
      source_ids: sourceIdsFor(event),
      forecast_date: date,
      as_of: asOf,
      grace_days: input.graceDays,
      due_for_acquisition: dueForAcquisition,
      action,
      frontier_state: "open",
      matchability: subjectIds.length > 0 ? "shared_timeline_subject" : "no_timeline_subject",
      subject_record_ids: subjectIds,
      timeline_relation_record_ids: targetRelations.map((relation) => relation.record_id),
      realized_candidates: realizedCandidates,
      operational_diagnostics: diagnostics,
      operational_diagnostic_state: diagnosticState(diagnostics),
      evidence_fingerprint: targetEvidenceFingerprint,
      basis_fingerprint: fingerprint(basis),
    };
  }).sort((left, right) => left.forecast_event_record_id.localeCompare(right.forecast_event_record_id));

  const actionCounts = emptyActionCounts();
  for (const target of targets) actionCounts[target.action] += 1;
  const operationalDiagnosticRows = targets.flatMap((target) => target.operational_diagnostics);
  const summary: ForecastRealizationFrontierSummary = {
    planned_operational_event_count: plannedEvents.length,
    acquisition_target_count: targets.length,
    excluded_nonpriority_planned_event_count: plannedEvents.length - targets.length,
    operational_diagnostic_row_count: operationalDiagnosticRows.length,
    operational_terminal_diagnostic_row_count: operationalDiagnosticRows.filter((row) => row.status === "terminal").length,
    targets_due_for_acquisition_count: targets.filter((target) => target.due_for_acquisition === true).length,
    targets_not_due_count: targets.filter((target) => target.due_for_acquisition === false).length,
    targets_with_unresolved_date_count: targets.filter((target) => target.due_for_acquisition === null).length,
    targets_with_realized_candidates_count: targets.filter((target) => target.realized_candidates.length > 0).length,
    targets_by_action: actionCounts,
  };
  const frontierBasisFingerprint = fingerprint({
    as_of: asOf,
    grace_days: input.graceDays,
    target_basis_fingerprints: targets.map((target) => ({
      target_id: target.target_id,
      basis_fingerprint: target.basis_fingerprint,
    })),
  });
  const withoutArtifactFingerprint = {
    schema_version: FORECAST_REALIZATION_FRONTIER_SCHEMA_VERSION,
    as_of: asOf,
    grace_days: input.graceDays,
    corpus_fingerprint: input.corpusFingerprint ?? null,
    operational_coverage_input_fingerprint: input.operationalCoverageInputFingerprint ?? null,
    selection_basis: "planned implementation/launch events with a priority operational-coverage diagnostic" as const,
    candidate_matching_basis: "shared incoming has_timeline_event subject" as const,
    candidate_policy: "candidate_only_never_auto_close" as const,
    date_interval_policy: "exact day/month bounds; conservative calendar-year bounds for year/season; unknown unresolved" as const,
    frontier_basis_fingerprint: frontierBasisFingerprint,
    summary,
    targets,
  };
  return {
    ...withoutArtifactFingerprint,
    artifact_fingerprint: fingerprint(withoutArtifactFingerprint),
  };
}
