import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  adaptOperationalObservationFromRelationGraph,
  type OperationalEpisodeAcceptedMapping,
  type OperationalEpisodeEvidenceBinding,
} from "@mta-wiki/pipeline/materialize/operational-episode-adapters";
import type { OperationalOccurrenceIdentityRegistryV2Entry } from "@mta-wiki/pipeline/materialize/operational-occurrence-identity-operations";
import type { OperationalOccurrenceAcceptedDecisionV2 } from "@mta-wiki/pipeline/materialize/operational-occurrence-review";

export const OPERATIONAL_EPISODE_FRONTIER_SCHEMA_VERSION = 1 as const;
export const OPERATIONAL_EPISODE_COHORT_ID = "operational-event-family-v1" as const;
export const OPERATIONAL_EPISODE_ADAPTER_REGISTRY_ID = "operational-episode-adapters-v1" as const;

export type OperationalEpisodeObservationDisposition =
  | "candidate_bearing"
  | "not_episode_evidence"
  | "unsupported_record"
  | "invalid_record"
  | "pending_segmentation";

export type OperationalEpisodeCandidateDisposition =
  | "published"
  | "duplicate_alias"
  | "rejected"
  | "insufficient_evidence"
  | "outside_domain"
  | "retired"
  | "pending_review"
  | "invalid";

export type OperationalEpisodeCohortExclusion = {
  event_record_id: string;
  reason_code: "non_operational_family" | "invalid_operational_record";
};

export type OperationalEpisodeCohort = {
  schema_version: 1;
  cohort_id: typeof OPERATIONAL_EPISODE_COHORT_ID;
  inclusion_rule: {
    record_kind: "event";
    event_families: ["implementation", "launch"];
    accepted_exact_review_membership: true;
    publication_window: null;
  };
  canonical_input_sha256: string;
  admitted_events_sha256: string;
  relevant_relations_sha256: string;
  adapter_registry_sha256: string;
  identity_registry_sha256: string;
  review_snapshot_sha256: string;
  examined_event_count: number;
  included_count: number;
  excluded_count: number;
  included_event_ids: string[];
  exclusions: OperationalEpisodeCohortExclusion[];
};

export type OperationalEpisodeObservationLedgerRow = {
  schema_version: 1;
  cohort_id: typeof OPERATIONAL_EPISODE_COHORT_ID;
  event_record_id: string;
  relation_record_ids: string[];
  source_ids: string[];
  evidence_bindings: OperationalEpisodeEvidenceBinding[];
  adapter_id: "accepted_mapping_v1" | "relation_graph_v1";
  adapter_version: 1;
  adapter_decision_id: string | null;
  candidate_ids: string[];
  disposition: OperationalEpisodeObservationDisposition;
  reason_code: string;
  identity_registry_sha256: string;
  review_snapshot_sha256: string;
};

export type OperationalEpisodeCandidateLedgerRow = {
  schema_version: 1;
  candidate_id: string;
  candidate_key: string;
  observation_event_record_ids: string[];
  observation_relation_record_ids: string[];
  source_ids: string[];
  evidence_bindings: OperationalEpisodeEvidenceBinding[];
  disposition: OperationalEpisodeCandidateDisposition;
  published_occurrence_id: string | null;
  unresolved_active_occurrence_ids: string[];
  canonical_candidate_id: string | null;
  lineage_occurrence_ids: string[];
  successor_occurrence_ids: string[];
  decision_ids: string[];
  review_membership_fingerprint: string | null;
};

export type OperationalEpisodeCandidateDecision = {
  schema_version: 1;
  decision_id: string;
  candidate_key: string;
  disposition: Exclude<
    OperationalEpisodeCandidateDisposition,
    "published" | "pending_review" | "invalid"
  >;
  canonical_candidate_key: string | null;
  successor_occurrence_ids: string[];
  reviewer: string;
  decided_at: string;
  rationale: string;
  evidence_bindings: OperationalEpisodeEvidenceBinding[];
};

export type OperationalEpisodeFrontierSummary = {
  schema_version: 1;
  completeness_profile: "partial" | "complete";
  cohort_observations: number;
  observation_ledger_rows: number;
  candidate_bearing_observations: number;
  non_candidate_observations: number;
  adapter_candidate_count: number;
  candidate_ledger_rows: number;
  counts_by_observation_disposition: Record<OperationalEpisodeObservationDisposition, number>;
  counts_by_candidate_disposition: Record<OperationalEpisodeCandidateDisposition, number>;
  published_distinct_occurrence_ids: number;
  publishable_reviewed_occurrence_ids: number;
  pending_review_distinct_unresolved_identity_ids: number;
  unresolved_active_identity_ids: number;
  active_identity_ids: number;
  pending_count: number;
  invalid_count: number;
  counts_by_reason: Record<string, number>;
  source_concentration: Record<string, number>;
  route_concentration: Record<string, number>;
  corpus_fingerprint: string;
  cohort_fingerprint: string;
  adapter_fingerprint: string;
  decision_fingerprint: string;
  identity_fingerprint: string;
  review_fingerprint: string;
  zero_unexplained_loss: true;
};

export type OperationalEpisodeFrontier = {
  cohort: OperationalEpisodeCohort;
  observation_ledger: OperationalEpisodeObservationLedgerRow[];
  candidate_ledger: OperationalEpisodeCandidateLedgerRow[];
  summary: OperationalEpisodeFrontierSummary;
};

export type BuildOperationalEpisodeFrontierInput = {
  canonical_records: readonly MtaCanonicalRecord[];
  accepted_mappings: readonly OperationalEpisodeAcceptedMapping[];
  candidate_decisions: readonly OperationalEpisodeCandidateDecision[];
  identity_registry: readonly OperationalOccurrenceIdentityRegistryV2Entry[];
  review_decisions: readonly OperationalOccurrenceAcceptedDecisionV2[];
  completeness_profile: "partial" | "complete";
};

const candidateDecisionFields = new Set([
  "candidate_key",
  "canonical_candidate_key",
  "decided_at",
  "decision_id",
  "disposition",
  "evidence_bindings",
  "rationale",
  "reviewer",
  "schema_version",
  "successor_occurrence_ids",
]);
const candidateDecisionEvidenceFields = new Set(["evidence_id", "record_id", "source_id"]);
const observationRowFields = new Set([
  "adapter_decision_id",
  "adapter_id",
  "adapter_version",
  "candidate_ids",
  "cohort_id",
  "disposition",
  "event_record_id",
  "evidence_bindings",
  "identity_registry_sha256",
  "reason_code",
  "relation_record_ids",
  "review_snapshot_sha256",
  "schema_version",
  "source_ids",
]);
const candidateRowFields = new Set([
  "candidate_id",
  "candidate_key",
  "canonical_candidate_id",
  "decision_ids",
  "disposition",
  "evidence_bindings",
  "lineage_occurrence_ids",
  "observation_event_record_ids",
  "observation_relation_record_ids",
  "published_occurrence_id",
  "review_membership_fingerprint",
  "schema_version",
  "source_ids",
  "successor_occurrence_ids",
  "unresolved_active_occurrence_ids",
]);

const observationDispositions: readonly OperationalEpisodeObservationDisposition[] = [
  "candidate_bearing",
  "not_episode_evidence",
  "unsupported_record",
  "invalid_record",
  "pending_segmentation",
];
const candidateDispositions: readonly OperationalEpisodeCandidateDisposition[] = [
  "published",
  "duplicate_alias",
  "rejected",
  "insufficient_evidence",
  "outside_domain",
  "retired",
  "pending_review",
  "invalid",
];
const operationalFamilies = new Set(["implementation", "launch"]);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  return stableJson(value as JsonValue);
}

function fingerprint(value: unknown): string {
  return sha256(canonical(value));
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function strictObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function strictKeys(value: Record<string, unknown>, fields: ReadonlySet<string>, path: string): void {
  const extras = Object.keys(value).filter((field) => !fields.has(field)).sort();
  if (extras.length > 0) throw new Error(`${path}: unknown field(s): ${extras.join(", ")}`);
}

function strictString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function strictStrings(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const result = value.map((entry, index) => strictString(entry, `${path}[${index}]`)).sort();
  if (new Set(result).size !== result.length) throw new Error(`${path} contains duplicates`);
  return result;
}

export function parseOperationalEpisodeCandidateDecision(
  value: unknown,
  path = "operational episode candidate decision",
): OperationalEpisodeCandidateDecision {
  const input = strictObject(value, path);
  strictKeys(input, candidateDecisionFields, path);
  if (input.schema_version !== 1) throw new Error(`${path}.schema_version must be 1`);
  const disposition = strictString(input.disposition, `${path}.disposition`);
  if (!["duplicate_alias", "rejected", "insufficient_evidence", "outside_domain", "retired"].includes(disposition)) {
    throw new Error(`${path}.disposition requires accepted non-publication authority`);
  }
  const decidedAt = strictString(input.decided_at, `${path}.decided_at`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(decidedAt)) {
    throw new Error(`${path}.decided_at must be an ISO-8601 UTC timestamp`);
  }
  if (!Array.isArray(input.evidence_bindings) || input.evidence_bindings.length === 0) {
    throw new Error(`${path}.evidence_bindings must be a non-empty array`);
  }
  const evidenceBindings = input.evidence_bindings.map((entry, index) => {
    const bindingPath = `${path}.evidence_bindings[${index}]`;
    const binding = strictObject(entry, bindingPath);
    strictKeys(binding, candidateDecisionEvidenceFields, bindingPath);
    return {
      record_id: strictString(binding.record_id, `${bindingPath}.record_id`),
      source_id: strictString(binding.source_id, `${bindingPath}.source_id`),
      evidence_id: strictString(binding.evidence_id, `${bindingPath}.evidence_id`),
    };
  }).sort((left, right) =>
    `${left.record_id}|${left.source_id}|${left.evidence_id}`.localeCompare(
      `${right.record_id}|${right.source_id}|${right.evidence_id}`,
    )
  );
  return {
    schema_version: 1,
    decision_id: strictString(input.decision_id, `${path}.decision_id`),
    candidate_key: strictString(input.candidate_key, `${path}.candidate_key`),
    disposition: disposition as OperationalEpisodeCandidateDecision["disposition"],
    canonical_candidate_key: input.canonical_candidate_key === null
      ? null
      : strictString(input.canonical_candidate_key, `${path}.canonical_candidate_key`),
    successor_occurrence_ids: strictStrings(
      input.successor_occurrence_ids,
      `${path}.successor_occurrence_ids`,
    ),
    reviewer: strictString(input.reviewer, `${path}.reviewer`),
    decided_at: decidedAt,
    rationale: strictString(input.rationale, `${path}.rationale`),
    evidence_bindings: evidenceBindings,
  };
}

export function loadOperationalEpisodeCandidateDecisions(
  path: string,
  options: { optionalFixture?: boolean } = {},
): OperationalEpisodeCandidateDecision[] {
  if (!existsSync(path)) {
    if (options.optionalFixture) return [];
    throw new Error(`required operational episode candidate decision registry is missing: ${path}`);
  }
  const input = strictObject(JSON.parse(readFileSync(path, "utf8")) as unknown, path);
  strictKeys(input, new Set(["decisions", "schema_version"]), path);
  if (input.schema_version !== 1 || !Array.isArray(input.decisions)) {
    throw new Error(`${path} must be a schema-v1 decision registry`);
  }
  const decisions = input.decisions.map((decision, index) =>
    parseOperationalEpisodeCandidateDecision(decision, `${path}.decisions[${index}]`)
  );
  const ids = decisions.map((decision) => decision.decision_id);
  if (new Set(ids).size !== ids.length || canonical(ids) !== canonical([...ids].sort())) {
    throw new Error(`${path}.decisions must be sorted and unique`);
  }
  return decisions;
}

function strictEvidence(value: unknown, path: string): OperationalEpisodeEvidenceBinding[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value.map((entry, index) => {
    const bindingPath = `${path}[${index}]`;
    const binding = strictObject(entry, bindingPath);
    strictKeys(binding, candidateDecisionEvidenceFields, bindingPath);
    return {
      record_id: strictString(binding.record_id, `${bindingPath}.record_id`),
      source_id: strictString(binding.source_id, `${bindingPath}.source_id`),
      evidence_id: strictString(binding.evidence_id, `${bindingPath}.evidence_id`),
    };
  });
}

export function parseOperationalEpisodeObservationLedgerRow(
  value: unknown,
  path = "operational episode observation ledger row",
): OperationalEpisodeObservationLedgerRow {
  const input = strictObject(value, path);
  strictKeys(input, observationRowFields, path);
  if (
    input.schema_version !== 1 ||
    input.cohort_id !== OPERATIONAL_EPISODE_COHORT_ID ||
    input.adapter_version !== 1
  ) throw new Error(`${path} has invalid contract versions`);
  const adapterId = strictString(input.adapter_id, `${path}.adapter_id`);
  if (adapterId !== "accepted_mapping_v1" && adapterId !== "relation_graph_v1") {
    throw new Error(`${path}.adapter_id is unsupported`);
  }
  const disposition = strictString(input.disposition, `${path}.disposition`);
  if (!observationDispositions.includes(disposition as OperationalEpisodeObservationDisposition)) {
    throw new Error(`${path}.disposition is unsupported`);
  }
  const row: OperationalEpisodeObservationLedgerRow = {
    schema_version: 1,
    cohort_id: OPERATIONAL_EPISODE_COHORT_ID,
    event_record_id: strictString(input.event_record_id, `${path}.event_record_id`),
    relation_record_ids: strictStrings(input.relation_record_ids, `${path}.relation_record_ids`),
    source_ids: strictStrings(input.source_ids, `${path}.source_ids`),
    evidence_bindings: strictEvidence(input.evidence_bindings, `${path}.evidence_bindings`),
    adapter_id: adapterId,
    adapter_version: 1,
    adapter_decision_id: input.adapter_decision_id === null
      ? null
      : strictString(input.adapter_decision_id, `${path}.adapter_decision_id`),
    candidate_ids: strictStrings(input.candidate_ids, `${path}.candidate_ids`),
    disposition: disposition as OperationalEpisodeObservationDisposition,
    reason_code: strictString(input.reason_code, `${path}.reason_code`),
    identity_registry_sha256: strictString(
      input.identity_registry_sha256,
      `${path}.identity_registry_sha256`,
    ),
    review_snapshot_sha256: strictString(
      input.review_snapshot_sha256,
      `${path}.review_snapshot_sha256`,
    ),
  };
  if (row.disposition === "candidate_bearing" && row.candidate_ids.length === 0) {
    throw new Error(`${path} candidate-bearing row has no candidates`);
  }
  return row;
}

export function parseOperationalEpisodeCandidateLedgerRow(
  value: unknown,
  path = "operational episode candidate ledger row",
): OperationalEpisodeCandidateLedgerRow {
  const input = strictObject(value, path);
  strictKeys(input, candidateRowFields, path);
  if (input.schema_version !== 1) throw new Error(`${path}.schema_version must be 1`);
  const disposition = strictString(input.disposition, `${path}.disposition`);
  if (!candidateDispositions.includes(disposition as OperationalEpisodeCandidateDisposition)) {
    throw new Error(`${path}.disposition is unsupported`);
  }
  const row: OperationalEpisodeCandidateLedgerRow = {
    schema_version: 1,
    candidate_id: strictString(input.candidate_id, `${path}.candidate_id`),
    candidate_key: strictString(input.candidate_key, `${path}.candidate_key`),
    observation_event_record_ids: strictStrings(
      input.observation_event_record_ids,
      `${path}.observation_event_record_ids`,
    ),
    observation_relation_record_ids: strictStrings(
      input.observation_relation_record_ids,
      `${path}.observation_relation_record_ids`,
    ),
    source_ids: strictStrings(input.source_ids, `${path}.source_ids`),
    evidence_bindings: strictEvidence(input.evidence_bindings, `${path}.evidence_bindings`),
    disposition: disposition as OperationalEpisodeCandidateDisposition,
    published_occurrence_id: input.published_occurrence_id === null
      ? null
      : strictString(input.published_occurrence_id, `${path}.published_occurrence_id`),
    unresolved_active_occurrence_ids: strictStrings(
      input.unresolved_active_occurrence_ids,
      `${path}.unresolved_active_occurrence_ids`,
    ),
    canonical_candidate_id: input.canonical_candidate_id === null
      ? null
      : strictString(input.canonical_candidate_id, `${path}.canonical_candidate_id`),
    lineage_occurrence_ids: strictStrings(
      input.lineage_occurrence_ids,
      `${path}.lineage_occurrence_ids`,
    ),
    successor_occurrence_ids: strictStrings(
      input.successor_occurrence_ids,
      `${path}.successor_occurrence_ids`,
    ),
    decision_ids: strictStrings(input.decision_ids, `${path}.decision_ids`),
    review_membership_fingerprint: input.review_membership_fingerprint === null
      ? null
      : strictString(
          input.review_membership_fingerprint,
          `${path}.review_membership_fingerprint`,
        ),
  };
  if (row.disposition === "published" && !row.published_occurrence_id) {
    throw new Error(`${path} published row lacks occurrence authority`);
  }
  if (row.disposition !== "published" && row.published_occurrence_id) {
    throw new Error(`${path} non-published row carries occurrence authority`);
  }
  return row;
}

export function loadOperationalEpisodeFrontierLedgers(outputDir: string): {
  observation_ledger: OperationalEpisodeObservationLedgerRow[];
  candidate_ledger: OperationalEpisodeCandidateLedgerRow[];
} {
  const readJsonl = <T>(
    name: string,
    parse: (value: unknown, path: string) => T,
  ): T[] => {
    const path = join(outputDir, name);
    if (!existsSync(path)) throw new Error(`required operational episode frontier artifact is missing: ${path}`);
    return readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean).map((line, index) =>
      parse(JSON.parse(line) as unknown, `${path}:${index + 1}`)
    );
  };
  const observationLedger = readJsonl(
    "observation_ledger.jsonl",
    parseOperationalEpisodeObservationLedgerRow,
  );
  const candidateLedger = readJsonl(
    "candidate_ledger.jsonl",
    parseOperationalEpisodeCandidateLedgerRow,
  );
  const observationIds = observationLedger.map((row) => row.event_record_id);
  const candidateIds = candidateLedger.map((row) => row.candidate_id);
  if (
    new Set(observationIds).size !== observationIds.length ||
    canonical(observationIds) !==
      canonical([...observationIds].sort((left, right) => left.localeCompare(right)))
  ) throw new Error("operational episode observation ledger must be sorted and unique");
  const candidateKeys = candidateLedger.map((row) => row.candidate_key);
  if (
    new Set(candidateIds).size !== candidateIds.length ||
    canonical(candidateKeys) !==
      canonical([...candidateKeys].sort((left, right) => left.localeCompare(right)))
  ) throw new Error("operational episode candidate ledger must be sorted and unique");
  return { observation_ledger: observationLedger, candidate_ledger: candidateLedger };
}

function candidateId(candidateKey: string): string {
  return `candidate:${sha256(`operational-episode-candidate-v1\0${candidateKey}`).slice(0, 24)}`;
}

function recordSourceIds(record: MtaCanonicalRecord): string[] {
  return sortedUnique([
    ...(Array.isArray(record.source_ids)
      ? record.source_ids.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      : []),
    ...(typeof record.source_id === "string" && record.source_id.trim() ? [record.source_id] : []),
    ...record.evidence_refs.flatMap((ref) =>
      typeof ref.source_id === "string" && ref.source_id.trim() ? [ref.source_id] : []
    ),
  ]);
}

function recordEvidence(record: MtaCanonicalRecord): OperationalEpisodeEvidenceBinding[] {
  return [...new Map(record.evidence_refs.flatMap((ref) => {
    if (
      typeof ref.source_id !== "string" ||
      typeof ref.evidence_id !== "string" ||
      !ref.source_id.trim() ||
      !ref.evidence_id.trim()
    ) return [];
    const binding = {
      record_id: record.record_id,
      source_id: ref.source_id,
      evidence_id: ref.evidence_id,
    };
    return [[`${binding.record_id}|${binding.source_id}|${binding.evidence_id}`, binding] as const];
  })).values()].sort((left, right) =>
    `${left.record_id}|${left.source_id}|${left.evidence_id}`.localeCompare(
      `${right.record_id}|${right.source_id}|${right.evidence_id}`,
    )
  );
}

function relationTouches(record: MtaCanonicalRecord, eventIds: ReadonlySet<string>): boolean {
  if (record.record_kind !== "relation") return false;
  return (
    (typeof record.payload.subject_id === "string" && eventIds.has(record.payload.subject_id)) ||
    (typeof record.payload.object_id === "string" && eventIds.has(record.payload.object_id))
  );
}

function countRecord<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function histogram(values: Iterable<string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of [...values].sort()) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function cohort(
  input: BuildOperationalEpisodeFrontierInput,
  adapterFingerprint: string,
  identityFingerprint: string,
  reviewFingerprint: string,
): { cohort: OperationalEpisodeCohort; events: MtaCanonicalRecord[]; relations: MtaCanonicalRecord[] } {
  const allEvents = input.canonical_records
    .filter((record) => record.record_kind === "event")
    .sort((left, right) => left.record_id.localeCompare(right.record_id));
  const ids = allEvents.map((event) => event.record_id);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate canonical event id in operational episode cohort");
  const events: MtaCanonicalRecord[] = [];
  const exclusions: OperationalEpisodeCohortExclusion[] = [];
  const exactReviewEventIds = new Set(
    input.review_decisions.flatMap((review) => review.observation_event_record_ids),
  );
  for (const event of allEvents) {
    const family = text(event.payload.event_family);
    if (!operationalFamilies.has(family) && !exactReviewEventIds.has(event.record_id)) {
      exclusions.push({ event_record_id: event.record_id, reason_code: "non_operational_family" });
      continue;
    }
    if (!event.record_id.trim()) {
      exclusions.push({ event_record_id: event.record_id, reason_code: "invalid_operational_record" });
      continue;
    }
    events.push(event);
  }
  const eventIds = new Set(events.map((event) => event.record_id));
  const relations = input.canonical_records
    .filter((record) => relationTouches(record, eventIds))
    .sort((left, right) => left.record_id.localeCompare(right.record_id));
  const result: OperationalEpisodeCohort = {
    schema_version: 1,
    cohort_id: OPERATIONAL_EPISODE_COHORT_ID,
    inclusion_rule: {
      record_kind: "event",
      event_families: ["implementation", "launch"],
      accepted_exact_review_membership: true,
      publication_window: null,
    },
    canonical_input_sha256: fingerprint(
      [...input.canonical_records].sort((left, right) => left.record_id.localeCompare(right.record_id)),
    ),
    admitted_events_sha256: fingerprint(events),
    relevant_relations_sha256: fingerprint(relations),
    adapter_registry_sha256: adapterFingerprint,
    identity_registry_sha256: identityFingerprint,
    review_snapshot_sha256: reviewFingerprint,
    examined_event_count: allEvents.length,
    included_count: events.length,
    excluded_count: exclusions.length,
    included_event_ids: events.map((event) => event.record_id),
    exclusions,
  };
  if (result.included_count + result.excluded_count !== result.examined_event_count) {
    throw new Error("operational episode cohort arithmetic is unbalanced");
  }
  return { cohort: result, events, relations };
}

function activeIdentityIds(
  registry: readonly OperationalOccurrenceIdentityRegistryV2Entry[],
): Set<string> {
  return new Set(
    registry.filter((entry) => entry.state === "active").map((entry) => entry.occurrence_id),
  );
}

function reviewByOccurrence(
  reviews: readonly OperationalOccurrenceAcceptedDecisionV2[],
): Map<string, OperationalOccurrenceAcceptedDecisionV2> {
  const result = new Map<string, OperationalOccurrenceAcceptedDecisionV2>();
  for (const review of reviews) {
    if (result.has(review.occurrence_id)) throw new Error(`duplicate exact review for ${review.occurrence_id}`);
    result.set(review.occurrence_id, review);
  }
  return result;
}

export function buildOperationalEpisodeFrontier(
  input: BuildOperationalEpisodeFrontierInput,
): OperationalEpisodeFrontier {
  const adapterFingerprint = fingerprint({
    registry_id: OPERATIONAL_EPISODE_ADAPTER_REGISTRY_ID,
    adapters: ["accepted_mapping_v1", "relation_graph_v1"],
    mappings: [...input.accepted_mappings].sort((left, right) => left.mapping_id.localeCompare(right.mapping_id)),
  });
  const identityFingerprint = fingerprint(
    [...input.identity_registry].sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id)),
  );
  const reviewFingerprint = fingerprint(
    [...input.review_decisions].sort((left, right) => left.decision_id.localeCompare(right.decision_id)),
  );
  const decisionFingerprint = fingerprint(
    [...input.candidate_decisions].sort((left, right) => left.decision_id.localeCompare(right.decision_id)),
  );
  const cohortBuild = cohort(input, adapterFingerprint, identityFingerprint, reviewFingerprint);
  const records = [...input.canonical_records].sort((left, right) => left.record_id.localeCompare(right.record_id));
  const eventsById = new Map(cohortBuild.events.map((event) => [event.record_id, event]));
  const mappingByEvent = new Map<string, OperationalEpisodeAcceptedMapping>();
  const mappingByCandidateKey = new Map<string, OperationalEpisodeAcceptedMapping[]>();
  for (const mapping of input.accepted_mappings) {
    for (const eventId of mapping.observation_event_record_ids) {
      if (!eventsById.has(eventId)) throw new Error(`accepted mapping ${mapping.mapping_id} references event outside cohort: ${eventId}`);
      if (mappingByEvent.has(eventId)) throw new Error(`accepted mapping overlap for observation ${eventId}`);
      mappingByEvent.set(eventId, mapping);
    }
    for (const key of mapping.candidate_keys) {
      const owners = mappingByCandidateKey.get(key) ?? [];
      owners.push(mapping);
      mappingByCandidateKey.set(key, owners);
    }
  }

  const observationRows: OperationalEpisodeObservationLedgerRow[] = [];
  const candidateKeys = new Set<string>();
  for (const event of cohortBuild.events) {
    const mapping = mappingByEvent.get(event.record_id);
    if (mapping) {
      const ids = mapping.candidate_keys.map(candidateId);
      mapping.candidate_keys.forEach((key) => candidateKeys.add(key));
      observationRows.push({
        schema_version: 1,
        cohort_id: OPERATIONAL_EPISODE_COHORT_ID,
        event_record_id: event.record_id,
        relation_record_ids: mapping.observation_relation_record_ids,
        source_ids: sortedUnique([
          ...recordSourceIds(event),
          ...mapping.evidence_bindings.map((binding) => binding.source_id),
        ]),
        evidence_bindings: mapping.evidence_bindings,
        adapter_id: "accepted_mapping_v1",
        adapter_version: 1,
        adapter_decision_id: mapping.decision_id,
        candidate_ids: ids,
        disposition: "candidate_bearing",
        reason_code: "accepted_episode_mapping",
        identity_registry_sha256: identityFingerprint,
        review_snapshot_sha256: reviewFingerprint,
      });
      continue;
    }
    const result = adaptOperationalObservationFromRelationGraph(event, records);
    const keys = "candidate_keys" in result ? result.candidate_keys : [];
    keys.forEach((key) => candidateKeys.add(key));
    const disposition: OperationalEpisodeObservationDisposition =
      result.state === "exact" ? "candidate_bearing"
      : result.state === "ambiguous" ? "pending_segmentation"
      : result.state === "no_match" ? "not_episode_evidence"
      : "unsupported_record";
    observationRows.push({
      schema_version: 1,
      cohort_id: OPERATIONAL_EPISODE_COHORT_ID,
      event_record_id: event.record_id,
      relation_record_ids: result.relation_record_ids,
      source_ids: recordSourceIds(event),
      evidence_bindings: recordEvidence(event),
      adapter_id: "relation_graph_v1",
      adapter_version: 1,
      adapter_decision_id: "decision_id" in result ? result.decision_id : null,
      candidate_ids: keys.map(candidateId),
      disposition,
      reason_code:
        result.state === "exact" ? "exact_route_treatment_graph"
        : result.state === "ambiguous" ? "incomplete_episode_graph"
        : result.reason_code,
      identity_registry_sha256: identityFingerprint,
      review_snapshot_sha256: reviewFingerprint,
    });
  }
  observationRows.sort((left, right) => left.event_record_id.localeCompare(right.event_record_id));
  if (observationRows.length !== cohortBuild.events.length) throw new Error("observation ledger does not cover cohort");
  if (new Set(observationRows.map((row) => row.event_record_id)).size !== observationRows.length) {
    throw new Error("duplicate observation ledger row");
  }

  const activeIds = activeIdentityIds(input.identity_registry);
  const reviewsByOccurrence = reviewByOccurrence(input.review_decisions);
  for (const occurrenceId of reviewsByOccurrence.keys()) {
    if (!activeIds.has(occurrenceId)) throw new Error(`exact review references non-active identity ${occurrenceId}`);
  }
  const decisionsByKey = new Map(input.candidate_decisions.map((decision) => [decision.candidate_key, decision]));
  if (decisionsByKey.size !== input.candidate_decisions.length) throw new Error("duplicate candidate disposition decision");
  const candidates: OperationalEpisodeCandidateLedgerRow[] = [];
  for (const key of [...candidateKeys].sort((left, right) => left.localeCompare(right))) {
    const owners = mappingByCandidateKey.get(key) ?? [];
    const observationIds = sortedUnique(
      observationRows.filter((row) => row.candidate_ids.includes(candidateId(key))).map((row) => row.event_record_id),
    );
    const relations = sortedUnique(
      observationRows.filter((row) => row.candidate_ids.includes(candidateId(key))).flatMap((row) => row.relation_record_ids),
    );
    const sources = sortedUnique(
      observationRows.filter((row) => row.candidate_ids.includes(candidateId(key))).flatMap((row) => row.source_ids),
    );
    const evidence = [...new Map(
      observationRows
        .filter((row) => row.candidate_ids.includes(candidateId(key)))
        .flatMap((row) => row.evidence_bindings)
        .map((binding) => [`${binding.record_id}|${binding.source_id}|${binding.evidence_id}`, binding]),
    ).values()].sort((left, right) =>
      `${left.record_id}|${left.source_id}|${left.evidence_id}`.localeCompare(
        `${right.record_id}|${right.source_id}|${right.evidence_id}`,
      )
    );
    const occurrenceIds = sortedUnique(owners.flatMap((owner) => owner.occurrence_id ? [owner.occurrence_id] : []));
    if (occurrenceIds.length > 1) throw new Error(`candidate ${key} maps to multiple occurrence identities`);
    const occurrenceId = occurrenceIds[0] ?? null;
    const review = occurrenceId ? reviewsByOccurrence.get(occurrenceId) : undefined;
    const identity = occurrenceId
      ? input.identity_registry.find((entry) => entry.occurrence_id === occurrenceId)
      : undefined;
    const decision = decisionsByKey.get(key);
    let disposition: OperationalEpisodeCandidateDisposition;
    let publishedOccurrenceId: string | null = null;
    let unresolvedActiveOccurrenceIds: string[] = [];
    let canonicalCandidateId: string | null = null;
    let successorOccurrenceIds: string[] = [];
    const decisionIds = sortedUnique([
      ...owners.map((owner) => owner.decision_id),
      ...(decision ? [decision.decision_id] : []),
    ]);
    if (review && identity?.state === "active") {
      if (canonical(review.observation_event_record_ids) !== canonical(observationIds)) {
        throw new Error(`candidate ${key} observation membership is stale against review ${review.decision_id}`);
      }
      disposition = "published";
      publishedOccurrenceId = occurrenceId;
    } else if (identity?.state === "active") {
      disposition = "pending_review";
      unresolvedActiveOccurrenceIds = [identity.occurrence_id];
    } else if (identity?.state === "retired") {
      disposition = "retired";
      successorOccurrenceIds = [...identity.successor_occurrence_ids].sort();
    } else if (decision) {
      disposition = decision.disposition;
      successorOccurrenceIds = decision.successor_occurrence_ids;
      canonicalCandidateId = decision.canonical_candidate_key
        ? candidateId(decision.canonical_candidate_key)
        : null;
    } else {
      disposition = "pending_review";
    }
    candidates.push({
      schema_version: 1,
      candidate_id: candidateId(key),
      candidate_key: key,
      observation_event_record_ids: observationIds,
      observation_relation_record_ids: relations,
      source_ids: sources,
      evidence_bindings: evidence,
      disposition,
      published_occurrence_id: publishedOccurrenceId,
      unresolved_active_occurrence_ids: unresolvedActiveOccurrenceIds,
      canonical_candidate_id: canonicalCandidateId,
      lineage_occurrence_ids: occurrenceId ? [occurrenceId] : [],
      successor_occurrence_ids: successorOccurrenceIds,
      decision_ids: decisionIds,
      review_membership_fingerprint: review?.membership_fingerprint ?? null,
    });
  }
  if (new Set(candidates.map((row) => row.candidate_id)).size !== candidates.length) {
    throw new Error("duplicate operational episode candidate");
  }
  const knownCandidateIds = new Set(candidates.map((row) => row.candidate_id));
  for (const observation of observationRows) {
    if (observation.disposition === "candidate_bearing" && observation.candidate_ids.length === 0) {
      throw new Error(`candidate-bearing observation ${observation.event_record_id} has no candidate`);
    }
    if (
      ["not_episode_evidence", "unsupported_record", "invalid_record"].includes(observation.disposition) &&
      observation.candidate_ids.length > 0
    ) throw new Error(`non-candidate observation ${observation.event_record_id} has candidates`);
    for (const id of observation.candidate_ids) {
      if (!knownCandidateIds.has(id)) throw new Error(`observation ${observation.event_record_id} references missing candidate ${id}`);
    }
  }

  const publishedIds = sortedUnique(candidates.flatMap((row) => row.published_occurrence_id ? [row.published_occurrence_id] : []));
  const unresolvedIds = sortedUnique(candidates.flatMap((row) => row.unresolved_active_occurrence_ids));
  const reviewedIds = sortedUnique(input.review_decisions.map((review) => review.occurrence_id));
  const activeIdList = [...activeIds].sort();
  if (canonical(publishedIds) !== canonical(reviewedIds)) {
    throw new Error("published candidate identities do not equal publishable reviewed identities");
  }
  if (publishedIds.some((id) => unresolvedIds.includes(id))) {
    throw new Error("published and unresolved identity partitions overlap");
  }
  if (canonical(sortedUnique([...publishedIds, ...unresolvedIds])) !== canonical(activeIdList)) {
    throw new Error("candidate identity partition does not cover every active identity");
  }
  const observationCounts = countRecord(observationDispositions);
  const candidateCounts = countRecord(candidateDispositions);
  for (const row of observationRows) observationCounts[row.disposition] += 1;
  for (const row of candidates) candidateCounts[row.disposition] += 1;
  const pendingCount = candidateCounts.pending_review + observationCounts.pending_segmentation;
  const invalidCount = candidateCounts.invalid + observationCounts.invalid_record;
  if (input.completeness_profile === "complete" && (pendingCount > 0 || invalidCount > 0)) {
    throw new Error("complete operational episode frontier cannot contain pending or invalid rows");
  }
  const reviewRoutes = new Map(input.review_decisions.map((review) => [
    review.occurrence_id,
    review.routes.map((route) => route.gtfs_route_id),
  ]));
  const summary: OperationalEpisodeFrontierSummary = {
    schema_version: 1,
    completeness_profile: input.completeness_profile,
    cohort_observations: cohortBuild.events.length,
    observation_ledger_rows: observationRows.length,
    candidate_bearing_observations:
      observationCounts.candidate_bearing + observationCounts.pending_segmentation,
    non_candidate_observations:
      observationCounts.not_episode_evidence +
      observationCounts.unsupported_record +
      observationCounts.invalid_record,
    adapter_candidate_count: candidates.length,
    candidate_ledger_rows: candidates.length,
    counts_by_observation_disposition: observationCounts,
    counts_by_candidate_disposition: candidateCounts,
    published_distinct_occurrence_ids: publishedIds.length,
    publishable_reviewed_occurrence_ids: reviewedIds.length,
    pending_review_distinct_unresolved_identity_ids: unresolvedIds.length,
    unresolved_active_identity_ids: activeIdList.length - reviewedIds.length,
    active_identity_ids: activeIdList.length,
    pending_count: pendingCount,
    invalid_count: invalidCount,
    counts_by_reason: histogram(observationRows.map((row) => row.reason_code)),
    source_concentration: histogram(observationRows.flatMap((row) => row.source_ids)),
    route_concentration: histogram(candidates.flatMap((row) =>
      row.published_occurrence_id ? reviewRoutes.get(row.published_occurrence_id) ?? [] : []
    )),
    corpus_fingerprint: cohortBuild.cohort.canonical_input_sha256,
    cohort_fingerprint: fingerprint(cohortBuild.cohort),
    adapter_fingerprint: adapterFingerprint,
    decision_fingerprint: decisionFingerprint,
    identity_fingerprint: identityFingerprint,
    review_fingerprint: reviewFingerprint,
    zero_unexplained_loss: true,
  };
  if (
    summary.cohort_observations !== summary.observation_ledger_rows ||
    summary.candidate_bearing_observations + summary.non_candidate_observations !== summary.observation_ledger_rows ||
    summary.adapter_candidate_count !== summary.candidate_ledger_rows ||
    Object.values(summary.counts_by_candidate_disposition).reduce((sum, count) => sum + count, 0) !== candidates.length ||
    summary.published_distinct_occurrence_ids !== summary.publishable_reviewed_occurrence_ids ||
    summary.pending_review_distinct_unresolved_identity_ids !== summary.unresolved_active_identity_ids ||
    summary.active_identity_ids !==
      summary.published_distinct_occurrence_ids + summary.pending_review_distinct_unresolved_identity_ids
  ) throw new Error("operational episode frontier summary arithmetic is unbalanced");
  return {
    cohort: cohortBuild.cohort,
    observation_ledger: observationRows,
    candidate_ledger: candidates,
    summary,
  };
}

function json(value: unknown): string {
  return `${canonical(value)}\n`;
}

function jsonl(values: readonly unknown[]): string {
  return values.map(canonical).join("\n") + (values.length ? "\n" : "");
}

export function operationalEpisodeFrontierContents(
  frontier: OperationalEpisodeFrontier,
): Record<string, string> {
  return {
    "candidate_ledger.jsonl": jsonl(frontier.candidate_ledger),
    "cohort.json": json(frontier.cohort),
    "observation_ledger.jsonl": jsonl(frontier.observation_ledger),
    "summary.json": json(frontier.summary),
  };
}

export function writeOperationalEpisodeFrontier(
  outputDir: string,
  frontier: OperationalEpisodeFrontier,
): void {
  mkdirSync(outputDir, { recursive: true });
  for (const [name, content] of Object.entries(operationalEpisodeFrontierContents(frontier))) {
    writeFileSync(join(outputDir, name), content);
  }
}

export function checkOperationalEpisodeFrontier(
  outputDir: string,
  frontier: OperationalEpisodeFrontier,
): void {
  for (const [name, content] of Object.entries(operationalEpisodeFrontierContents(frontier))) {
    const path = join(outputDir, name);
    if (!existsSync(path)) throw new Error(`operational episode frontier artifact is missing: ${path}`);
    if (readFileSync(path, "utf8") !== content) {
      throw new Error(`operational episode frontier artifact is stale: ${path}`);
    }
  }
}
