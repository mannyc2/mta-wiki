import { createHash } from "node:crypto";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { OperationalAnchorRow } from "@mta-wiki/pipeline/materialize/operational-anchors";
import type { OperationalOccurrenceRow } from "@mta-wiki/pipeline/materialize/operational-occurrences";
import { isOfficialPublicPublisher } from "@mta-wiki/pipeline/records/source-authority";

export const OPERATIONAL_COVERAGE_SCHEMA_VERSION = 1 as const;
export const DEFAULT_OPERATIONAL_STUDY_WINDOW = { start: "2023-04-01", end: "2026-12-31" } as const;

export type OperationalCoverageDateInterval = {
  start: string;
  end: string;
};

export type OperationalCoverageDimension =
  | "timeline_subject"
  | "route"
  | "treatment"
  | "date_precision"
  | "delivered_status";

export type OperationalCoverageVerdict =
  | "unreviewed"
  | "relation_missing"
  | "record_missing"
  | "absent_in_source"
  | "bundle_documented"
  | "bundle_ambiguous"
  | "not_applicable"
  | "ambiguous_conflict";

export type OperationalCoveragePriorityBasis = "date_window" | "recent_priority_family";
export type OperationalCoveragePriorityFamily = "route_redesign" | "transit_signal_priority" | "busway";

export type OperationalCoverageDecisionEvidenceRef = {
  record_id: string;
  source_id: string;
  evidence_id: string;
  block_id: string | null;
};

export type OperationalCoverageAcceptedDecision = {
  schema_version: typeof OPERATIONAL_COVERAGE_SCHEMA_VERSION;
  decision_id: string;
  gap_id: string;
  prior_verdict: OperationalCoverageVerdict;
  verdict: Exclude<OperationalCoverageVerdict, "unreviewed">;
  reviewer: string;
  decided_at: string;
  rationale: string;
  proposal_ids: string[];
  evidence_refs: OperationalCoverageDecisionEvidenceRef[];
  search_receipt_ids: string[];
};

export type OperationalCoverageSearchReceiptSourceSearch = {
  source_id: string;
  queries: string[];
  matching_block_ids: string[];
};

export type OperationalCoverageSearchReceiptRegistrySearch = {
  queries: string[];
  title_filters: string[];
  publisher_filters: string[];
  matched_source_ids: string[];
};

export type OperationalCoverageSearchReceipt = {
  schema_version: typeof OPERATIONAL_COVERAGE_SCHEMA_VERSION;
  receipt_id: string;
  gap_id: string;
  reviewer: string;
  searched_at: string;
  rationale: string;
  corpus_fingerprint: string;
  source_searches: OperationalCoverageSearchReceiptSourceSearch[];
  registry_search: OperationalCoverageSearchReceiptRegistrySearch;
};

export type OperationalCoverageGap = {
  schema_version: typeof OPERATIONAL_COVERAGE_SCHEMA_VERSION;
  gap_id: string;
  anchor_ids: string[];
  event_record_id: string;
  event_display_name: string;
  event_family: "implementation" | "launch";
  resolved_occurrence_ids: string[];
  dimension: OperationalCoverageDimension;
  source_ids: string[];
  required_search_source_ids: string[];
  context_record_ids: string[];
  candidate_record_ids: string[];
  candidate_date_intervals: OperationalCoverageDateInterval[];
  route_record_ids: string[];
  gtfs_route_ids: string[];
  treatment_record_ids: string[];
  treatment_families: string[];
  priority: boolean;
  priority_basis: OperationalCoveragePriorityBasis[];
  priority_families: OperationalCoveragePriorityFamily[];
  verdict: OperationalCoverageVerdict;
  verdict_basis: `review:${string}` | null;
  decision_ids: string[];
  proposal_ids: string[];
  evidence_refs: OperationalCoverageDecisionEvidenceRef[];
  search_receipt_ids: string[];
  updated_at: string | null;
};

export type OperationalCoverageQueueRow = OperationalCoverageGap & {
  status: "open" | "ready_for_review" | "terminal";
};

export type OperationalCoveragePopulationSummary = {
  canonical_operational_events: number;
  canonical_events_in_study_window: number;
  canonical_events_before_study_window: number;
  canonical_events_after_study_window: number;
  canonical_events_with_conflicting_outside_dates: number;
  canonical_events_undated: number;
  broad_anchor_rows: number;
  distinct_timeline_linked_events: number;
  duplicate_broad_anchor_rows: number;
  unlinked_operational_events: number;
  reviewed_overlay_rows: number;
  reviewed_overlay_distinct_events: number;
  duplicate_reviewed_overlay_rows: number;
  occurrence_rows: number;
  distinct_occurrences: number;
  eligible_occurrences: number;
  bundle_occurrences: number;
  multi_route_occurrences: number;
  eligible_occurrence_route_pairs: number;
  unique_eligible_gtfs_routes: number;
};

export type OperationalCoverageCompletionSummary = {
  gap_rows: number;
  priority_gap_rows: number;
  priority_open_rows: number;
  priority_adjudicated_recoverable_rows: number;
  priority_terminal_rows: number;
  counts_by_dimension: Record<OperationalCoverageDimension, number>;
  counts_by_verdict: Record<OperationalCoverageVerdict, number>;
};

export type OperationalCoverageSummary = {
  schema_version: typeof OPERATIONAL_COVERAGE_SCHEMA_VERSION;
  population: OperationalCoveragePopulationSummary;
  completion: OperationalCoverageCompletionSummary;
};

export type OperationalCoverageInput = {
  canonical_records: readonly MtaCanonicalRecord[];
  operational_anchor_rows: readonly OperationalAnchorRow[];
  operational_occurrence_rows: readonly OperationalOccurrenceRow[];
  accepted_ledger_decisions?: readonly OperationalCoverageAcceptedDecision[];
  accepted_search_receipts?: readonly OperationalCoverageSearchReceipt[];
  corpus_fingerprint?: string;
  study_window?: OperationalCoverageDateInterval;
};

export type OperationalCoverageLedger = {
  schema_version: typeof OPERATIONAL_COVERAGE_SCHEMA_VERSION;
  corpus_fingerprint: string | null;
  study_window: OperationalCoverageDateInterval;
  gaps: OperationalCoverageGap[];
  queue: OperationalCoverageQueueRow[];
  summary: OperationalCoverageSummary;
};

const dimensions: readonly OperationalCoverageDimension[] = [
  "timeline_subject",
  "route",
  "treatment",
  "date_precision",
  "delivered_status",
];
const verdicts: readonly OperationalCoverageVerdict[] = [
  "unreviewed",
  "relation_missing",
  "record_missing",
  "absent_in_source",
  "bundle_documented",
  "bundle_ambiguous",
  "not_applicable",
  "ambiguous_conflict",
];
const terminalVerdicts = new Set<OperationalCoverageVerdict>([
  "absent_in_source",
  "not_applicable",
  "ambiguous_conflict",
]);
const realizedLifecyclePhases = new Set([
  "completed",
  "expanded",
  "installed",
  "launched",
  "modified",
  "piloted",
  "resumed",
]);
const resolvedScopeStates = new Set(["direct", "reviewed_inherited"]);
const operationalFamilies = new Set(["implementation", "launch"]);
const sourcePublicationWindow = { start: "2023-01-01", end: "2026-12-31" } as const;
const eventDateFields = [
  "date_normalized",
  "event_date_normalized",
  "implementation_date_normalized",
  "launch_date_normalized",
  "date_text",
  "event_date",
  "date",
] as const;
const sourcePublicationDateFields = [
  "published_date_normalized",
  "published_date",
  "document_date_normalized",
  "document_date",
  "date_normalized",
] as const;

function token(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Invalid operational coverage decision ${field}: expected non-empty strings`);
  }
  return uniqueSorted(value as string[]);
}

function parseDateInterval(value: unknown): OperationalCoverageDateInterval | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  const yearMatch = /^(\d{4})$/u.exec(normalized);
  if (yearMatch) return { start: `${yearMatch[1]}-01-01`, end: `${yearMatch[1]}-12-31` };

  const seasonMatch = /^(\d{4})-(?:winter|spring|summer|fall|autumn)$/u.exec(normalized);
  if (seasonMatch) return { start: `${seasonMatch[1]}-01-01`, end: `${seasonMatch[1]}-12-31` };

  const monthMatch = /^(\d{4})-(\d{2})$/u.exec(normalized);
  if (monthMatch) {
    const month = Number(monthMatch[2]);
    if (month < 1 || month > 12) return null;
    const lastDay = new Date(Date.UTC(Number(monthMatch[1]), month, 0)).getUTCDate();
    return {
      start: `${monthMatch[1]}-${monthMatch[2]}-01`,
      end: `${monthMatch[1]}-${monthMatch[2]}-${String(lastDay).padStart(2, "0")}`,
    };
  }

  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})(?:t.*)?$/u.exec(normalized);
  if (!dayMatch) return null;
  const year = Number(dayMatch[1]);
  const month = Number(dayMatch[2]);
  const day = Number(dayMatch[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return null;
  const date = `${dayMatch[1]}-${dayMatch[2]}-${dayMatch[3]}`;
  return { start: date, end: date };
}

function intervalsFromValues(values: Iterable<unknown>): OperationalCoverageDateInterval[] {
  const intervals = [...values].flatMap((value) => {
    const interval = parseDateInterval(value);
    return interval ? [interval] : [];
  });
  return [...new Map(intervals.map((interval) => [`${interval.start}|${interval.end}`, interval])).values()]
    .sort((left, right) => left.start.localeCompare(right.start) || left.end.localeCompare(right.end));
}

function fallbackYearIntervals(values: Iterable<unknown>): OperationalCoverageDateInterval[] {
  const years = [...values].flatMap((value) => {
    if (typeof value !== "string" || parseDateInterval(value)) return [];
    return [...value.matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)/gu)].map((match) => match[1]!);
  });
  return uniqueSorted(years).map((year) => ({ start: `${year}-01-01`, end: `${year}-12-31` }));
}

function intersects(left: OperationalCoverageDateInterval, right: OperationalCoverageDateInterval): boolean {
  return left.start <= right.end && left.end >= right.start;
}

function gapId(eventId: string, dimension: OperationalCoverageDimension): string {
  return `operational-coverage:${createHash("sha256").update(`${eventId}\0${dimension}`).digest("hex").slice(0, 24)}`;
}

function sourceIdsFor(record: MtaCanonicalRecord): string[] {
  return uniqueSorted([record.source_id, ...(record.source_ids ?? [])].filter(Boolean));
}

function priorityFamiliesIn(value: unknown): OperationalCoveragePriorityFamily[] {
  const found = new Set<OperationalCoveragePriorityFamily>();
  const visit = (candidate: unknown): void => {
    if (typeof candidate === "string") {
      const normalized = candidate.toLowerCase().replace(/[_-]+/gu, " ");
      if (/\b(?:route|bus network) redesign\b/u.test(normalized)) found.add("route_redesign");
      if (/\btransit signal priority\b|\b(?:tsp|itsp)\b/u.test(normalized)) found.add("transit_signal_priority");
      if (/\bbusway\b/u.test(normalized)) found.add("busway");
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const item of Object.values(candidate)) visit(item);
    }
  };
  visit(value);
  return [...found].sort((left, right) => left.localeCompare(right));
}

function explicitSignalPriorityIn(value: unknown): boolean {
  if (typeof value === "string") {
    const normalized = value.toLowerCase().replace(/[_-]+/gu, " ");
    return /\btransit signal priority\b|\b(?:tsp|itsp)\b/u.test(normalized);
  }
  if (Array.isArray(value)) return value.some(explicitSignalPriorityIn);
  return false;
}

function scalarFamily(record: MtaCanonicalRecord, field: string): string {
  return typeof record.payload[field] === "string" ? token(record.payload[field]) : "";
}

function priorityFamiliesForTreatmentRecord(record: MtaCanonicalRecord): OperationalCoveragePriorityFamily[] {
  const found = new Set(priorityFamiliesIn([record.display_name, record.raw_text, record.payload]));
  const explicitSignalPriority =
    record.record_kind === "treatment_component" &&
    scalarFamily(record, "treatment_family") === "signal_priority" &&
    explicitSignalPriorityIn([
      record.display_name,
      record.raw_text,
      record.payload.treatment_kind,
      record.payload.description,
      record.evidence_refs.map((ref) => ref.source_quote),
    ]);
  if (!explicitSignalPriority) {
    found.delete("transit_signal_priority");
  }
  return [...found].sort((left, right) => left.localeCompare(right));
}

const busProjectFamilies = new Set([
  "bus_lane",
  "bus_network_redesign",
  "bus_priority",
  "busway",
  "sbs_or_brt",
  "signal_priority",
]);

function recordHasEvidenceFrom(record: MtaCanonicalRecord, sourceIds: ReadonlySet<string>): boolean {
  return record.evidence_refs.some((ref) => sourceIds.has(ref.source_id));
}

function linkedProjectSupportsBusContext(
  record: MtaCanonicalRecord,
  directSourceIds: ReadonlySet<string>,
): boolean {
  return record.record_kind === "project" &&
    busProjectFamilies.has(scalarFamily(record, "project_family")) &&
    recordHasEvidenceFrom(record, directSourceIds);
}

function treatmentSupportsSignalPriorityContext(
  record: MtaCanonicalRecord,
  directSourceIds: ReadonlySet<string>,
): boolean {
  if (
    record.record_kind !== "treatment_component" ||
    scalarFamily(record, "treatment_family") !== "signal_priority"
  ) return false;

  if (record.evidence_refs.some((ref) =>
    directSourceIds.has(ref.source_id) && explicitSignalPriorityIn(ref.source_quote))) return true;

  const recordSourceIds = new Set(sourceIdsFor(record));
  const evidenceSourceIds = new Set(record.evidence_refs.map((ref) => ref.source_id));
  const [recordSourceId] = recordSourceIds;
  const [evidenceSourceId] = evidenceSourceIds;
  if (
    recordSourceIds.size !== 1 ||
    evidenceSourceIds.size !== 1 ||
    recordSourceId !== evidenceSourceId ||
    !recordSourceId ||
    !directSourceIds.has(recordSourceId)
  ) return false;

  return explicitSignalPriorityIn([
    record.display_name,
    record.raw_text,
    record.payload.treatment_kind,
    record.payload.description,
  ]);
}

function busStudySignalIn(value: unknown): boolean {
  let found = false;
  const visit = (candidate: unknown): void => {
    if (found) return;
    if (typeof candidate === "string") {
      const normalized = candidate.toLowerCase().replace(/[_-]+/gu, " ");
      found = /\b(?:bus|busway|sbs|tsp|itsp)\b|select bus service|transit signal priority|route redesign|automated bus lane enforcement/u.test(
        normalized,
      );
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const item of Object.values(candidate)) visit(item);
    }
  };
  visit(value);
  return found;
}

function officialSource(record: MtaCanonicalRecord): boolean {
  const publisherText = ["publisher", "agency", "authority", "issuing_agency"]
    .map((field) => token(record.payload[field]))
    .filter(Boolean)
    .join(" ");
  return isOfficialPublicPublisher(publisherText);
}

function sourcePublishedInPriorityWindow(record: MtaCanonicalRecord): boolean {
  return sourcePublicationDateFields
    .flatMap((field) => intervalsFromValues([record.payload[field]]))
    .some((interval) => intersects(interval, sourcePublicationWindow));
}

function validateStudyWindow(window: OperationalCoverageDateInterval): OperationalCoverageDateInterval {
  const start = parseDateInterval(window.start);
  const end = parseDateInterval(window.end);
  if (!start || !end || start.start !== start.end || end.start !== end.end || start.start > end.end) {
    throw new Error("Invalid operational coverage study window: expected ordered YYYY-MM-DD bounds");
  }
  return { start: start.start, end: end.end };
}

function validateEvidenceRefs(value: unknown, decisionId: string): OperationalCoverageDecisionEvidenceRef[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid operational coverage decision ${decisionId}.evidence_refs: expected array`);
  }
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error(`Invalid operational coverage decision ${decisionId}.evidence_refs[${index}]`);
    }
    const input = candidate as Partial<OperationalCoverageDecisionEvidenceRef>;
    if (
      typeof input.record_id !== "string" || !input.record_id.trim() ||
      typeof input.source_id !== "string" || !input.source_id.trim() ||
      typeof input.evidence_id !== "string" || !input.evidence_id.trim() ||
      (input.block_id !== null && (typeof input.block_id !== "string" || !input.block_id.trim()))
    ) throw new Error(`Invalid operational coverage decision ${decisionId}.evidence_refs[${index}]`);
    return {
      record_id: input.record_id,
      source_id: input.source_id,
      evidence_id: input.evidence_id,
      block_id: input.block_id ?? null,
    };
  }).sort((left, right) =>
    `${left.record_id}|${left.source_id}|${left.evidence_id}`.localeCompare(
      `${right.record_id}|${right.source_id}|${right.evidence_id}`,
    ),
  );
}

function requiredDecisionString(object: Record<string, unknown>, field: string, path: string): string {
  const value = object[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid operational coverage decision ${path}.${field}: expected non-empty string`);
  }
  return value.trim();
}

export function parseOperationalCoverageAcceptedDecision(
  value: unknown,
  path = "operational coverage decision",
): OperationalCoverageAcceptedDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid operational coverage decision ${path}: expected object`);
  }
  const object = value as Record<string, unknown>;
  const allowed = new Set([
    "schema_version",
    "decision_id",
    "gap_id",
    "prior_verdict",
    "verdict",
    "reviewer",
    "decided_at",
    "rationale",
    "proposal_ids",
    "evidence_refs",
    "search_receipt_ids",
  ]);
  const extras = Object.keys(object).filter((key) => !allowed.has(key));
  if (extras.length > 0) {
    throw new Error(`Invalid operational coverage decision ${path}: unexpected fields ${extras.sort().join(", ")}`);
  }
  if (object.schema_version !== OPERATIONAL_COVERAGE_SCHEMA_VERSION) {
    throw new Error(`Invalid operational coverage decision ${path}.schema_version`);
  }
  const priorVerdict = requiredDecisionString(object, "prior_verdict", path) as OperationalCoverageVerdict;
  const verdict = requiredDecisionString(object, "verdict", path) as OperationalCoverageVerdict;
  if (!verdicts.includes(priorVerdict) || !verdicts.includes(verdict) || verdict === "unreviewed") {
    throw new Error(`Invalid operational coverage decision ${path}: invalid verdict`);
  }
  const decisionId = requiredDecisionString(object, "decision_id", path);
  return {
    schema_version: OPERATIONAL_COVERAGE_SCHEMA_VERSION,
    decision_id: decisionId,
    gap_id: requiredDecisionString(object, "gap_id", path),
    prior_verdict: priorVerdict,
    verdict,
    reviewer: requiredDecisionString(object, "reviewer", path),
    decided_at: requiredDecisionString(object, "decided_at", path),
    rationale: requiredDecisionString(object, "rationale", path),
    proposal_ids: stringArray(object.proposal_ids, `${path}.proposal_ids`),
    evidence_refs: validateEvidenceRefs(object.evidence_refs, decisionId),
    search_receipt_ids: stringArray(object.search_receipt_ids, `${path}.search_receipt_ids`),
  };
}

function strictReceiptObject(
  value: unknown,
  path: string,
  allowedFields: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid operational coverage search receipt ${path}: expected object`);
  }
  const object = value as Record<string, unknown>;
  const allowed = new Set(allowedFields);
  const extras = Object.keys(object).filter((key) => !allowed.has(key));
  if (extras.length > 0) {
    throw new Error(
      `Invalid operational coverage search receipt ${path}: unexpected fields ${extras.sort().join(", ")}`,
    );
  }
  return object;
}

function requiredReceiptArray(value: unknown, path: string): string[] {
  const values = stringArray(value, path);
  if (values.length === 0) {
    throw new Error(`Invalid operational coverage search receipt ${path}: expected at least one string`);
  }
  return values;
}

export function parseOperationalCoverageSearchReceipt(
  value: unknown,
  path = "operational coverage search receipt",
): OperationalCoverageSearchReceipt {
  const object = strictReceiptObject(value, path, [
    "schema_version",
    "receipt_id",
    "gap_id",
    "reviewer",
    "searched_at",
    "rationale",
    "corpus_fingerprint",
    "source_searches",
    "registry_search",
  ]);
  if (object.schema_version !== OPERATIONAL_COVERAGE_SCHEMA_VERSION) {
    throw new Error(`Invalid operational coverage search receipt ${path}.schema_version`);
  }
  const receiptId = requiredDecisionString(object, "receipt_id", path);
  const searchedAt = requiredDecisionString(object, "searched_at", path);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(searchedAt) ||
    Number.isNaN(Date.parse(searchedAt))
  ) throw new Error(`Invalid operational coverage search receipt ${path}: searched_at must be ISO UTC`);
  const corpusFingerprint = requiredDecisionString(object, "corpus_fingerprint", path);
  if (!/^[a-f0-9]{64}$/u.test(corpusFingerprint)) {
    throw new Error(`Invalid operational coverage search receipt ${path}: invalid corpus_fingerprint`);
  }
  if (!Array.isArray(object.source_searches) || object.source_searches.length === 0) {
    throw new Error(`Invalid operational coverage search receipt ${path}.source_searches`);
  }
  const sourceSearches = object.source_searches.map((candidate, index) => {
    const searchPath = `${path}.source_searches[${index}]`;
    const search = strictReceiptObject(candidate, searchPath, ["source_id", "queries", "matching_block_ids"]);
    return {
      source_id: requiredDecisionString(search, "source_id", searchPath),
      queries: requiredReceiptArray(search.queries, `${searchPath}.queries`),
      matching_block_ids: stringArray(search.matching_block_ids, `${searchPath}.matching_block_ids`),
    } satisfies OperationalCoverageSearchReceiptSourceSearch;
  }).sort((left, right) => left.source_id.localeCompare(right.source_id));
  if (new Set(sourceSearches.map((search) => search.source_id)).size !== sourceSearches.length) {
    throw new Error(`Invalid operational coverage search receipt ${path}: duplicate source search`);
  }
  const registry = strictReceiptObject(
    object.registry_search,
    `${path}.registry_search`,
    ["queries", "title_filters", "publisher_filters", "matched_source_ids"],
  );
  return {
    schema_version: OPERATIONAL_COVERAGE_SCHEMA_VERSION,
    receipt_id: receiptId,
    gap_id: requiredDecisionString(object, "gap_id", path),
    reviewer: requiredDecisionString(object, "reviewer", path),
    searched_at: searchedAt,
    rationale: requiredDecisionString(object, "rationale", path),
    corpus_fingerprint: corpusFingerprint,
    source_searches: sourceSearches,
    registry_search: {
      queries: requiredReceiptArray(registry.queries, `${path}.registry_search.queries`),
      title_filters: stringArray(registry.title_filters, `${path}.registry_search.title_filters`),
      publisher_filters: stringArray(registry.publisher_filters, `${path}.registry_search.publisher_filters`),
      matched_source_ids: stringArray(registry.matched_source_ids, `${path}.registry_search.matched_source_ids`),
    },
  };
}

function eventDateIntervals(event: MtaCanonicalRecord, rows: readonly OperationalAnchorRow[]): OperationalCoverageDateInterval[] {
  const values = [
    ...eventDateFields.map((field) => event.payload[field]),
    event.display_name,
    ...rows.flatMap((row) => [
      row.candidate_operational_date_normalized,
      ...row.candidate_operational_dates_normalized,
      ...row.candidate_operational_date_candidates.map((candidate) => candidate.normalized),
    ]),
  ];
  const intervals = [...intervalsFromValues(values), ...fallbackYearIntervals(values)];
  return [...new Map(intervals.map((interval) => [`${interval.start}|${interval.end}`, interval])).values()]
    .sort((left, right) => left.start.localeCompare(right.start) || left.end.localeCompare(right.end));
}

function uniqueOperationalEvents(records: readonly MtaCanonicalRecord[]): MtaCanonicalRecord[] {
  const byId = new Map<string, MtaCanonicalRecord>();
  for (const record of [...records].sort((left, right) => left.record_id.localeCompare(right.record_id))) {
    if (record.record_kind !== "event" || !operationalFamilies.has(token(record.payload.event_family))) continue;
    if (byId.has(record.record_id)) throw new Error(`Duplicate canonical operational event id: ${record.record_id}`);
    byId.set(record.record_id, record);
  }
  return [...byId.values()];
}

function emptyCountRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function evidenceKey(ref: OperationalCoverageDecisionEvidenceRef): string {
  return `${ref.record_id}|${ref.source_id}|${ref.evidence_id}|${ref.block_id ?? ""}`;
}

export function buildOperationalCoverageLedger(input: OperationalCoverageInput): OperationalCoverageLedger {
  const studyWindow = validateStudyWindow(input.study_window ?? DEFAULT_OPERATIONAL_STUDY_WINDOW);
  const corpusFingerprint = input.corpus_fingerprint ?? null;
  if (corpusFingerprint !== null && !/^[a-f0-9]{64}$/u.test(corpusFingerprint)) {
    throw new Error("Invalid operational coverage input: invalid corpus_fingerprint");
  }
  const records = [...input.canonical_records].sort((left, right) => left.record_id.localeCompare(right.record_id));
  const events = uniqueOperationalEvents(records);
  const eventIds = new Set(events.map((event) => event.record_id));
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const broadRows = input.operational_anchor_rows
    .filter((row) => row.anchor_id.startsWith("operational:"))
    .sort((left, right) => left.anchor_id.localeCompare(right.anchor_id));
  const reviewedRows = input.operational_anchor_rows
    .filter((row) => row.anchor_id.startsWith("operational-reviewed:"))
    .sort((left, right) => left.anchor_id.localeCompare(right.anchor_id));
  const classifiedAnchorCount = broadRows.length + reviewedRows.length;
  if (classifiedAnchorCount !== input.operational_anchor_rows.length) {
    throw new Error("Operational coverage received an anchor row with an unknown anchor_id prefix");
  }
  for (const row of broadRows) {
    if (!eventIds.has(row.event_record_id)) {
      throw new Error(`Broad operational anchor references a non-operational event: ${row.event_record_id}`);
    }
  }

  const rowsByEvent = new Map<string, OperationalAnchorRow[]>();
  for (const row of broadRows) {
    const rows = rowsByEvent.get(row.event_record_id) ?? [];
    rows.push(row);
    rowsByEvent.set(row.event_record_id, rows);
  }
  const linkedEventIds = new Set(rowsByEvent.keys());
  const occurrenceIdsByEvent = new Map<string, Set<string>>();
  for (const occurrence of input.operational_occurrence_rows) {
    const observationEventIds = occurrence.observations.map((observation) => observation.event_record_id);
    for (const eventId of uniqueSorted([...occurrence.provenance.event_record_ids, ...observationEventIds])) {
      const occurrenceIds = occurrenceIdsByEvent.get(eventId) ?? new Set<string>();
      occurrenceIds.add(occurrence.occurrence_id);
      occurrenceIdsByEvent.set(eventId, occurrenceIds);
    }
  }
  const recordsBySource = new Map<string, MtaCanonicalRecord[]>();
  for (const record of records) {
    for (const sourceId of sourceIdsFor(record)) {
      const sourceRecords = recordsBySource.get(sourceId) ?? [];
      sourceRecords.push(record);
      recordsBySource.set(sourceId, sourceRecords);
    }
  }

  const gaps: OperationalCoverageGap[] = [];
  const dateClasses = {
    in_window: 0,
    before: 0,
    after: 0,
    conflicting_outside: 0,
    undated: 0,
  };

  for (const event of events) {
    const rows = rowsByEvent.get(event.record_id) ?? [];
    const sourceIds = uniqueSorted([
      ...sourceIdsFor(event),
      ...rows.flatMap((row) => [row.source_id, ...row.source_ids]),
    ]);
    const associatedRecords = [...new Map(
      sourceIds.flatMap((sourceId) => recordsBySource.get(sourceId) ?? []).map((record) => [record.record_id, record]),
    ).values()];
    const sourceRecords = associatedRecords.filter((record) => record.record_kind === "source");
    const sameSourceSubjectCandidates = associatedRecords.filter((record) =>
      record.record_id !== event.record_id &&
      ["project", "route", "corridor", "treatment_component"].includes(record.record_kind),
    );
    const intervals = eventDateIntervals(event, rows);
    const inStudyWindow = intervals.some((interval) => intersects(interval, studyWindow));
    if (intervals.length === 0) dateClasses.undated += 1;
    else if (inStudyWindow) dateClasses.in_window += 1;
    else if (intervals.every((interval) => interval.end < studyWindow.start)) dateClasses.before += 1;
    else if (intervals.every((interval) => interval.start > studyWindow.end)) dateClasses.after += 1;
    else dateClasses.conflicting_outside += 1;

    const routeAndTreatmentRecords = uniqueSorted(rows.flatMap((row) => [
      ...row.route_record_ids,
      ...row.treatment_record_ids,
    ])).flatMap((recordId) => {
      const record = recordsById.get(recordId);
      return record ? [record] : [];
    });
    const treatmentRecords = uniqueSorted(rows.flatMap((row) => row.treatment_record_ids)).flatMap((recordId) => {
      const record = recordsById.get(recordId);
      return record ? [record] : [];
    });
    let hasDirectLinkedSignalPriorityProject = false;
    let hasContextualSignalPriorityCandidate = false;
    for (const row of rows) {
      const eventEvidenceSourceIds = new Set(row.evidence_refs
        .filter((ref) => ref.role === "event")
        .map((ref) => ref.source_id));
      const timelineEvidenceSourceIds = new Set(row.evidence_refs
        .filter((ref) => ref.role === "timeline_relation")
        .map((ref) => ref.source_id));
      const directRowSourceIds = [...eventEvidenceSourceIds]
        .filter((sourceId) => timelineEvidenceSourceIds.has(sourceId));
      const linkedProjectRecords = uniqueSorted([
        ...row.project_record_ids,
        ...row.subject_record_ids,
      ]).flatMap((recordId) => {
        const record = recordsById.get(recordId);
        return record?.record_kind === "project" ? [record] : [];
      });
      for (const sourceId of directRowSourceIds) {
        const sourceScope = new Set([sourceId]);
        const directBusProjects = linkedProjectRecords.filter((record) =>
          linkedProjectSupportsBusContext(record, sourceScope));
        if (directBusProjects.some((record) => scalarFamily(record, "project_family") === "signal_priority")) {
          hasDirectLinkedSignalPriorityProject = true;
        }
        if (
          directBusProjects.length > 0 &&
          (recordsBySource.get(sourceId) ?? []).some((record) =>
            treatmentSupportsSignalPriorityContext(record, sourceScope))
        ) {
          hasContextualSignalPriorityCandidate = true;
        }
      }
    }
    const priorityFamilies = uniqueSorted([
      ...priorityFamiliesIn([
        event.display_name,
        event.payload,
        ...rows.flatMap((row) => [row.treatment_families, row.event_family]),
        ...sourceRecords.flatMap((record) => [record.display_name, record.payload.title]),
      ]),
      ...treatmentRecords.flatMap(priorityFamiliesForTreatmentRecord),
      ...(hasDirectLinkedSignalPriorityProject || hasContextualSignalPriorityCandidate
        ? ["transit_signal_priority" as const]
        : []),
    ]) as OperationalCoveragePriorityFamily[];
    const publishedOfficialSource = sourceRecords.some(
      (source) => officialSource(source) && sourcePublishedInPriorityWindow(source),
    );
    const busRelevant =
      priorityFamilies.length > 0 ||
      rows.some((row) => row.gtfs_route_ids.length > 0) ||
      busStudySignalIn([
        event.display_name,
        event.payload,
        ...routeAndTreatmentRecords.flatMap((record) => [record.display_name, record.payload]),
      ]);
    const intersectsPriorityFamilyWindow = intervals.length === 0 || intervals.some(
      (interval) => intersects(interval, sourcePublicationWindow),
    );
    const priorityBasis = uniqueSorted([
      ...(inStudyWindow && busRelevant ? ["date_window" as const] : []),
      ...(publishedOfficialSource && priorityFamilies.length > 0 && intersectsPriorityFamilyWindow
        ? ["recent_priority_family" as const]
        : []),
    ]) as OperationalCoveragePriorityBasis[];

    const shared = {
      schema_version: OPERATIONAL_COVERAGE_SCHEMA_VERSION,
      anchor_ids: uniqueSorted(rows.map((row) => row.anchor_id)),
      event_record_id: event.record_id,
      event_display_name: event.display_name,
      event_family: token(event.payload.event_family) as "implementation" | "launch",
      resolved_occurrence_ids: uniqueSorted(occurrenceIdsByEvent.get(event.record_id) ?? []),
      source_ids: sourceIds,
      candidate_date_intervals: intervals,
      route_record_ids: uniqueSorted(rows.flatMap((row) => row.route_record_ids)),
      gtfs_route_ids: uniqueSorted(rows.flatMap((row) => row.gtfs_route_ids)),
      treatment_record_ids: uniqueSorted(rows.flatMap((row) => row.treatment_record_ids)),
      treatment_families: uniqueSorted(rows.flatMap((row) => row.treatment_families)),
      priority: priorityBasis.length > 0,
      priority_basis: priorityBasis,
      priority_families: priorityFamilies,
      verdict: "unreviewed" as const,
      verdict_basis: null,
      decision_ids: [],
      proposal_ids: [],
      evidence_refs: [],
      search_receipt_ids: [],
      updated_at: null,
    };
    const addGap = (dimension: OperationalCoverageDimension): void => {
      const rowContextRecordIds = uniqueSorted(rows.flatMap((row) => [
        ...row.timeline_relation_record_ids,
        ...row.project_record_ids,
        ...row.subject_record_ids,
        ...row.route_record_ids,
        ...row.unmatched_route_record_ids,
        ...row.treatment_record_ids,
        ...row.evidence_refs.map((ref) => ref.record_id),
      ]));
      const dimensionCandidates = sameSourceSubjectCandidates.filter((record) =>
        dimension === "timeline_subject" ||
        (dimension === "route" && record.record_kind === "route") ||
        (dimension === "treatment" && record.record_kind === "treatment_component"),
      );
      const contextRecordIds = uniqueSorted([event.record_id, ...rowContextRecordIds]);
      const candidateRecordIds = uniqueSorted(dimensionCandidates.map((record) => record.record_id));
      const requiredSearchSourceIds = uniqueSorted([
        ...sourceIds,
        ...[...contextRecordIds, ...candidateRecordIds].flatMap((recordId) => {
          const record = recordsById.get(recordId);
          return record ? sourceIdsFor(record) : [];
        }),
      ]);
      gaps.push({
        ...shared,
        gap_id: gapId(event.record_id, dimension),
        dimension,
        context_record_ids: contextRecordIds,
        candidate_record_ids: candidateRecordIds,
        required_search_source_ids: requiredSearchSourceIds,
      });
    };

    if (rows.length === 0) {
      addGap("timeline_subject");
      continue;
    }
    const routeComplete = rows.some(
      (row) =>
        row.gtfs_route_ids.length === 1 &&
        row.unmatched_route_record_ids.length === 0 &&
        resolvedScopeStates.has(row.route_scope_resolution) &&
        row.evidence_coverage.route_scope,
    );
    const treatmentComplete = rows.some(
      (row) =>
        row.treatment_record_ids.length === 1 &&
        row.treatment_families.length === 1 &&
        resolvedScopeStates.has(row.treatment_scope_resolution) &&
        row.evidence_coverage.treatment_scope,
    );
    const dateComplete = rows.some(
      (row) =>
        row.candidate_operational_date_normalized !== null &&
        (row.candidate_operational_date_precision === "day" || row.candidate_operational_date_precision === "month"),
    );
    const deliveredComplete = rows.some((row) => {
      const hasRealizedLifecycle =
        row.lifecycle_phase !== null && realizedLifecyclePhases.has(row.lifecycle_phase);
      if (!hasRealizedLifecycle) return false;
      if (row.temporal_role === "realized_operational") return true;
      return (
        row.temporal_role === "status_as_of" &&
        row.assertion_statuses.length === 1 &&
        row.assertion_statuses[0] === "delivered" &&
        !row.conflict_states.includes("status_conflict")
      );
    });
    if (!routeComplete) addGap("route");
    if (!treatmentComplete) addGap("treatment");
    if (!dateComplete) addGap("date_precision");
    if (!deliveredComplete) addGap("delivered_status");
  }

  const gapMap = new Map(gaps.map((gap) => [gap.gap_id, gap]));
  const decisionIds = new Set<string>();
  const searchReceipts = (input.accepted_search_receipts ?? []).map((receipt) =>
    parseOperationalCoverageSearchReceipt(receipt, receipt.receipt_id || "search receipt"),
  );
  if (searchReceipts.length > 0 && corpusFingerprint === null) {
    throw new Error("Invalid operational coverage input: search receipts require a corpus_fingerprint");
  }
  const searchReceiptsById = new Map(searchReceipts.map((receipt) => [receipt.receipt_id, receipt]));
  if (searchReceiptsById.size !== searchReceipts.length) {
    throw new Error("Invalid operational coverage input: duplicate search receipt id");
  }
  const decisions = [...(input.accepted_ledger_decisions ?? [])].sort(
    (left, right) => left.decided_at.localeCompare(right.decided_at) || left.decision_id.localeCompare(right.decision_id),
  );
  for (const decision of decisions) {
    const nextVerdict = decision.verdict as OperationalCoverageVerdict;
    const priorVerdict = decision.prior_verdict as OperationalCoverageVerdict;
    if (decision.schema_version !== OPERATIONAL_COVERAGE_SCHEMA_VERSION) {
      throw new Error(`Invalid operational coverage decision ${decision.decision_id}: unsupported schema_version`);
    }
    if (!decision.decision_id?.trim() || decisionIds.has(decision.decision_id)) {
      throw new Error(`Invalid operational coverage decision id: ${decision.decision_id}`);
    }
    decisionIds.add(decision.decision_id);
    if (!verdicts.includes(priorVerdict) || !verdicts.includes(nextVerdict) || nextVerdict === "unreviewed") {
      throw new Error(`Invalid operational coverage decision ${decision.decision_id}: invalid verdict`);
    }
    const gap = gapMap.get(decision.gap_id);
    if (!gap) throw new Error(`Invalid operational coverage decision ${decision.decision_id}: unknown gap ${decision.gap_id}`);
    if (gap.verdict !== priorVerdict) {
      throw new Error(`Invalid operational coverage decision ${decision.decision_id}: stale prior_verdict for ${decision.gap_id}`);
    }
    if (!decision.reviewer?.trim() || !decision.rationale?.trim()) {
      throw new Error(`Invalid operational coverage decision ${decision.decision_id}: reviewer and rationale are required`);
    }
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(decision.decided_at) ||
      Number.isNaN(Date.parse(decision.decided_at))
    ) throw new Error(`Invalid operational coverage decision ${decision.decision_id}: decided_at must be ISO UTC`);

    const proposalIds = stringArray(decision.proposal_ids, `${decision.decision_id}.proposal_ids`);
    const searchReceiptIds = stringArray(decision.search_receipt_ids, `${decision.decision_id}.search_receipt_ids`);
    const evidenceRefs = validateEvidenceRefs(decision.evidence_refs, decision.decision_id);
    const unrelatedEvidence = evidenceRefs.find(
      (ref) =>
        !gap.context_record_ids.includes(ref.record_id) ||
        !gap.required_search_source_ids.includes(ref.source_id),
    );
    if (unrelatedEvidence) {
      throw new Error(
        `Invalid operational coverage decision ${decision.decision_id}: evidence ${unrelatedEvidence.record_id}/${unrelatedEvidence.source_id} is unrelated to ${decision.gap_id}`,
      );
    }
    for (const receiptId of searchReceiptIds) {
      const receipt = searchReceiptsById.get(receiptId);
      if (!receipt) {
        throw new Error(
          `Invalid operational coverage decision ${decision.decision_id}: unknown search receipt ${receiptId}`,
        );
      }
      if (receipt.gap_id !== gap.gap_id) {
        throw new Error(
          `Invalid operational coverage decision ${decision.decision_id}: search receipt ${receiptId} is bound to another gap`,
        );
      }
      if (receipt.corpus_fingerprint !== corpusFingerprint) {
        throw new Error(
          `Invalid operational coverage decision ${decision.decision_id}: stale corpus fingerprint on search receipt ${receiptId}`,
        );
      }
      const searchedSourceIds = new Set(receipt.source_searches.map((search) => search.source_id));
      const missingRequiredSource = gap.required_search_source_ids.find((sourceId) => !searchedSourceIds.has(sourceId));
      if (missingRequiredSource) {
        throw new Error(
          `Invalid operational coverage decision ${decision.decision_id}: search receipt ${receiptId} did not search required source ${missingRequiredSource}`,
        );
      }
      const unmatchedRegistrySource = receipt.registry_search.matched_source_ids.find(
        (sourceId) => !searchedSourceIds.has(sourceId),
      );
      if (unmatchedRegistrySource) {
        throw new Error(
          `Invalid operational coverage decision ${decision.decision_id}: search receipt ${receiptId} did not search registry match ${unmatchedRegistrySource}`,
        );
      }
      if (
        nextVerdict === "absent_in_source" &&
        receipt.source_searches.some((search) => search.matching_block_ids.length > 0)
      ) {
        throw new Error(
          `Invalid operational coverage decision ${decision.decision_id}: absent_in_source receipt ${receiptId} contains matching blocks`,
        );
      }
    }
    if (nextVerdict === "absent_in_source" && searchReceiptIds.length === 0) {
      throw new Error(`Invalid operational coverage decision ${decision.decision_id}: absent_in_source requires a search receipt`);
    }
    if (
      ["relation_missing", "record_missing", "bundle_documented", "bundle_ambiguous", "ambiguous_conflict"].includes(nextVerdict) &&
      evidenceRefs.length === 0 &&
      proposalIds.length === 0
    ) throw new Error(`Invalid operational coverage decision ${decision.decision_id}: evidence or proposal is required`);

    gap.verdict = nextVerdict;
    gap.verdict_basis = `review:${decision.decision_id}`;
    gap.decision_ids = uniqueSorted([...gap.decision_ids, decision.decision_id]);
    gap.proposal_ids = uniqueSorted([...gap.proposal_ids, ...proposalIds]);
    gap.evidence_refs = [...new Map(
      [...gap.evidence_refs, ...evidenceRefs].map((ref) => [evidenceKey(ref), ref]),
    ).values()].sort((left, right) => evidenceKey(left).localeCompare(evidenceKey(right)));
    gap.search_receipt_ids = uniqueSorted([...gap.search_receipt_ids, ...searchReceiptIds]);
    gap.updated_at = decision.decided_at;
  }

  gaps.sort((left, right) => left.gap_id.localeCompare(right.gap_id));
  const eligibleOccurrenceIds = new Set(
    input.operational_occurrence_rows.filter((row) => row.study_projection_eligible).map((row) => row.occurrence_id),
  );
  const occurrenceIds = new Set(input.operational_occurrence_rows.map((row) => row.occurrence_id));
  const bundleOccurrenceIds = new Set(
    input.operational_occurrence_rows.filter((row) => row.treatment.kind === "bundle").map((row) => row.occurrence_id),
  );
  const routesByOccurrence = new Map<string, Set<string>>();
  const eligiblePairs = new Set<string>();
  const eligibleRoutes = new Set<string>();
  for (const row of input.operational_occurrence_rows) {
    const routes = routesByOccurrence.get(row.occurrence_id) ?? new Set<string>();
    for (const route of row.routes) {
      routes.add(route.gtfs_route_id);
      if (row.study_projection_eligible) {
        eligiblePairs.add(`${row.occurrence_id}\0${route.gtfs_route_id}`);
        eligibleRoutes.add(route.gtfs_route_id);
      }
    }
    routesByOccurrence.set(row.occurrence_id, routes);
  }
  const multiRouteOccurrenceCount = [...routesByOccurrence.values()].filter((routes) => routes.size > 1).length;
  const countsByDimension = emptyCountRecord(dimensions);
  const countsByVerdict = emptyCountRecord(verdicts);
  for (const gap of gaps) {
    countsByDimension[gap.dimension] += 1;
    countsByVerdict[gap.verdict] += 1;
  }
  const priorityGaps = gaps.filter((gap) => gap.priority);
  const queue = priorityGaps.map((gap): OperationalCoverageQueueRow => ({
    ...gap,
    status: gap.verdict === "unreviewed" ? "open" : terminalVerdicts.has(gap.verdict) ? "terminal" : "ready_for_review",
  })).sort((left, right) =>
    `${left.event_record_id}|${left.dimension}|${left.gap_id}`.localeCompare(
      `${right.event_record_id}|${right.dimension}|${right.gap_id}`,
    ),
  );

  const summary: OperationalCoverageSummary = {
    schema_version: OPERATIONAL_COVERAGE_SCHEMA_VERSION,
    population: {
      canonical_operational_events: events.length,
      canonical_events_in_study_window: dateClasses.in_window,
      canonical_events_before_study_window: dateClasses.before,
      canonical_events_after_study_window: dateClasses.after,
      canonical_events_with_conflicting_outside_dates: dateClasses.conflicting_outside,
      canonical_events_undated: dateClasses.undated,
      broad_anchor_rows: broadRows.length,
      distinct_timeline_linked_events: linkedEventIds.size,
      duplicate_broad_anchor_rows: broadRows.length - linkedEventIds.size,
      unlinked_operational_events: events.length - linkedEventIds.size,
      reviewed_overlay_rows: reviewedRows.length,
      reviewed_overlay_distinct_events: new Set(reviewedRows.map((row) => row.event_record_id)).size,
      duplicate_reviewed_overlay_rows: reviewedRows.filter((row) => linkedEventIds.has(row.event_record_id)).length,
      occurrence_rows: input.operational_occurrence_rows.length,
      distinct_occurrences: occurrenceIds.size,
      eligible_occurrences: eligibleOccurrenceIds.size,
      bundle_occurrences: bundleOccurrenceIds.size,
      multi_route_occurrences: multiRouteOccurrenceCount,
      eligible_occurrence_route_pairs: eligiblePairs.size,
      unique_eligible_gtfs_routes: eligibleRoutes.size,
    },
    completion: {
      gap_rows: gaps.length,
      priority_gap_rows: priorityGaps.length,
      priority_open_rows: priorityGaps.filter((gap) => gap.verdict === "unreviewed").length,
      priority_adjudicated_recoverable_rows: priorityGaps.filter(
        (gap) => gap.verdict !== "unreviewed" && !terminalVerdicts.has(gap.verdict),
      ).length,
      priority_terminal_rows: priorityGaps.filter((gap) => terminalVerdicts.has(gap.verdict)).length,
      counts_by_dimension: countsByDimension,
      counts_by_verdict: countsByVerdict,
    },
  };

  return {
    schema_version: OPERATIONAL_COVERAGE_SCHEMA_VERSION,
    corpus_fingerprint: corpusFingerprint,
    study_window: studyWindow,
    gaps,
    queue,
    summary,
  };
}

export const computeOperationalCoverage = buildOperationalCoverageLedger;
