import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  loadOperationalEpisodeFrontierLedgers,
  type OperationalEpisodeCandidateLedgerRow,
} from "./operational-episode-frontier.js";
import {
  loadOperationalOccurrenceIdentityRegistryV2,
  type OperationalOccurrenceIdentityRegistryV2Entry,
} from "./operational-occurrence-identity-operations.js";
import {
  loadOperationalOccurrenceAcceptedDecisionsV2,
  type OperationalOccurrenceAcceptedDecisionV2,
  type OperationalOccurrenceReviewTreatment,
} from "./operational-occurrence-review.js";
import type { OperationalOccurrenceEvidenceBinding } from "./operational-occurrences.js";
import { readCanonicalRecords } from "./canonical-read.js";
import {
  parseResolvedInterventionApplication,
  resolvedInterventionApplicationIdentity,
  resolvedInterventionApplicationIncidenceKey,
  sortEvidenceBindings,
  type ResolvedInterventionApplication,
  type ResolvedInterventionExtent,
} from "./resolved-intervention-applications.js";

export const RESOLVED_INTERVENTION_OPERATOR_CONTRACT_ID =
  "resolved-intervention-model-v1" as const;

export type ResolvedInterventionEpisode = {
  schema_version: 1;
  occurrence_id: string;
  occurrence_aliases: string[];
  identity_state: "active";
  observation_event_record_ids: string[];
  observation_relation_record_ids: string[];
  candidate_ids: string[];
  resolved_onset: {
    date: string;
    precision: "day" | "month";
  };
  route_record_ids: string[];
  gtfs_route_ids: string[];
  treatment_record_ids: string[];
  treatment_families: string[];
  phase_record_ids: string[];
  physical_scope_record_ids: string[];
  source_ids: string[];
  application_ids: string[];
  review_decision_id: string;
  review_membership_fingerprint: string;
  resolution_method: "accepted_review" | "lossless_v1_migration";
  evidence_bindings: OperationalOccurrenceEvidenceBinding[];
};

export type ResolvedInterventionContextLink = {
  schema_version: 1;
  context_link_id: string;
  occurrence_id: string;
  relation_record_id: string;
  context_record_id: string;
  context_record_kind: "project" | "corridor" | "entity";
  evidence_bindings: OperationalOccurrenceEvidenceBinding[];
};

export type ResolvedInterventionApplicationReconciliation = {
  schema_version: 1;
  reconciliation_id: string;
  candidate_id: string;
  occurrence_id: string | null;
  disposition: "does_not_apply" | "unknown" | "ambiguous" | "pending_review";
  reason_code: string;
  review_decision_id: string | null;
  evidence_bindings: Array<{ record_id: string; source_id: string; evidence_id: string }>;
};

export type ResolvedInterventionIdentityReconciliation = {
  schema_version: 1;
  reconciliation_id: string;
  occurrence_id: string;
  candidate_ids: string[];
  disposition: "pending_review";
  reason_code: "active_identity_without_exact_application_review";
  lineage_occurrence_ids: string[];
  decision_ids: string[];
  evidence_bindings: Array<{ record_id: string; source_id: string; evidence_id: string }>;
};

export type ResolvedInterventionSummary = {
  schema_version: 1;
  contract_id: typeof RESOLVED_INTERVENTION_OPERATOR_CONTRACT_ID;
  episode_count: number;
  application_count: number;
  context_link_count: number;
  application_reconciliation_count: number;
  identity_reconciliation_count: number;
  published_candidate_count: number;
  pending_identity_candidate_count: number;
  active_identity_count: number;
  counts_by_action: Record<string, number>;
  counts_by_extent_kind: Record<string, number>;
  source_canonical_record_count: number;
  canonical_input_fingerprint: string;
  review_input_fingerprint: string;
  frontier_input_fingerprint: string;
  zero_unexplained_identity_loss: true;
};

export type ResolvedInterventionModel = {
  episodes: ResolvedInterventionEpisode[];
  applications: ResolvedInterventionApplication[];
  context_links: ResolvedInterventionContextLink[];
  application_reconciliation: ResolvedInterventionApplicationReconciliation[];
  identity_reconciliation: ResolvedInterventionIdentityReconciliation[];
  summary: ResolvedInterventionSummary;
};

export type BuildResolvedInterventionsInput = {
  canonical_records: readonly MtaCanonicalRecord[];
  candidate_ledger: readonly OperationalEpisodeCandidateLedgerRow[];
  identity_registry: readonly OperationalOccurrenceIdentityRegistryV2Entry[];
  review_decisions: readonly OperationalOccurrenceAcceptedDecisionV2[];
  legacy_member_extent_rows?: ReadonlyArray<{
    extent_id: string;
    occurrence_id: string;
    route_record_id: string;
    treatment_record_id: string;
    decision_id: string | null;
    evidence_bindings: ReadonlyArray<{
      record_id: string;
      source_id: string;
      evidence_id: string;
    }>;
  }>;
};

const episodeFields = new Set([
  "application_ids", "candidate_ids", "evidence_bindings", "gtfs_route_ids",
  "identity_state", "observation_event_record_ids", "observation_relation_record_ids",
  "occurrence_aliases", "occurrence_id", "phase_record_ids", "physical_scope_record_ids",
  "resolution_method", "resolved_onset", "review_decision_id",
  "review_membership_fingerprint", "route_record_ids", "schema_version", "source_ids",
  "treatment_families", "treatment_record_ids",
]);
const contextFields = new Set([
  "context_link_id", "context_record_id", "context_record_kind", "evidence_bindings",
  "occurrence_id", "relation_record_id", "schema_version",
]);
const applicationReconciliationFields = new Set([
  "candidate_id", "disposition", "evidence_bindings", "occurrence_id", "reason_code",
  "reconciliation_id", "review_decision_id", "schema_version",
]);
const identityReconciliationFields = new Set([
  "candidate_ids", "decision_ids", "disposition", "evidence_bindings",
  "lineage_occurrence_ids", "occurrence_id", "reason_code", "reconciliation_id",
  "schema_version",
]);
const summaryFields = new Set([
  "active_identity_count", "application_count", "application_reconciliation_count",
  "canonical_input_fingerprint", "context_link_count", "contract_id", "counts_by_action",
  "counts_by_extent_kind", "episode_count", "frontier_input_fingerprint",
  "identity_reconciliation_count", "pending_identity_candidate_count",
  "published_candidate_count", "review_input_fingerprint", "schema_version",
  "source_canonical_record_count", "zero_unexplained_identity_loss",
]);
const onsetFields = new Set(["date", "precision"]);
const evidenceFields = new Set(["evidence_id", "record_id", "role", "source_id"]);
const plainEvidenceFields = new Set(["evidence_id", "record_id", "source_id"]);

function strictObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function strictFields(value: Record<string, unknown>, fields: ReadonlySet<string>, path: string): void {
  const extras = Object.keys(value).filter((field) => !fields.has(field)).sort();
  const missing = [...fields].filter((field) => !(field in value)).sort();
  if (extras.length || missing.length) {
    throw new Error(`${path}: exact fields required; unknown=${extras.join(",")}; missing=${missing.join(",")}`);
  }
}

function strictString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function strictNullableString(value: unknown, path: string): string | null {
  return value === null ? null : strictString(value, path);
}

function strictSortedStrings(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const values = value.map((entry, index) => strictString(entry, `${path}[${index}]`));
  if (new Set(values).size !== values.length ||
      values.join("\n") !== [...values].sort((a, b) => a.localeCompare(b)).join("\n")) {
    throw new Error(`${path} must be sorted and unique`);
  }
  return values;
}

function strictEvidence(
  value: unknown,
  path: string,
  options: { plain?: boolean; allowEmpty?: boolean } = {},
): Array<{ record_id: string; source_id: string; evidence_id: string; role?: string }> {
  if (!Array.isArray(value) || (!options.allowEmpty && value.length === 0)) {
    throw new Error(`${path} must be ${options.allowEmpty ? "an" : "a non-empty"} array`);
  }
  const fields = options.plain ? plainEvidenceFields : evidenceFields;
  const rows = value.map((entry, index) => {
    const rowPath = `${path}[${index}]`;
    const input = strictObject(entry, rowPath);
    strictFields(input, fields, rowPath);
    return {
      record_id: strictString(input.record_id, `${rowPath}.record_id`),
      source_id: strictString(input.source_id, `${rowPath}.source_id`),
      evidence_id: strictString(input.evidence_id, `${rowPath}.evidence_id`),
      ...(options.plain ? {} : { role: strictString(input.role, `${rowPath}.role`) }),
    };
  });
  const keys = rows.map((row) => [row.role ?? "", row.record_id, row.source_id, row.evidence_id].join("|"));
  if (new Set(keys).size !== keys.length || keys.join("\n") !== [...keys].sort().join("\n")) {
    throw new Error(`${path} must be sorted and unique`);
  }
  return rows;
}

export function parseResolvedInterventionEpisode(
  value: unknown,
  path = "resolved intervention episode",
): ResolvedInterventionEpisode {
  const input = strictObject(value, path);
  strictFields(input, episodeFields, path);
  if (input.schema_version !== 1 || input.identity_state !== "active") {
    throw new Error(`${path} contract version or identity state is invalid`);
  }
  const onset = strictObject(input.resolved_onset, `${path}.resolved_onset`);
  strictFields(onset, onsetFields, `${path}.resolved_onset`);
  const precision = strictString(onset.precision, `${path}.resolved_onset.precision`);
  if (precision !== "day" && precision !== "month") throw new Error(`${path}.resolved_onset.precision is invalid`);
  const resolutionMethod = strictString(input.resolution_method, `${path}.resolution_method`);
  if (resolutionMethod !== "accepted_review" && resolutionMethod !== "lossless_v1_migration") {
    throw new Error(`${path}.resolution_method is invalid`);
  }
  return {
    schema_version: 1,
    occurrence_id: strictString(input.occurrence_id, `${path}.occurrence_id`),
    occurrence_aliases: strictSortedStrings(input.occurrence_aliases, `${path}.occurrence_aliases`),
    identity_state: "active",
    observation_event_record_ids: strictSortedStrings(input.observation_event_record_ids, `${path}.observation_event_record_ids`),
    observation_relation_record_ids: strictSortedStrings(input.observation_relation_record_ids, `${path}.observation_relation_record_ids`),
    candidate_ids: strictSortedStrings(input.candidate_ids, `${path}.candidate_ids`),
    resolved_onset: {
      date: strictString(onset.date, `${path}.resolved_onset.date`),
      precision,
    },
    route_record_ids: strictSortedStrings(input.route_record_ids, `${path}.route_record_ids`),
    gtfs_route_ids: strictSortedStrings(input.gtfs_route_ids, `${path}.gtfs_route_ids`),
    treatment_record_ids: strictSortedStrings(input.treatment_record_ids, `${path}.treatment_record_ids`),
    treatment_families: strictSortedStrings(input.treatment_families, `${path}.treatment_families`),
    phase_record_ids: strictSortedStrings(input.phase_record_ids, `${path}.phase_record_ids`),
    physical_scope_record_ids: strictSortedStrings(input.physical_scope_record_ids, `${path}.physical_scope_record_ids`),
    source_ids: strictSortedStrings(input.source_ids, `${path}.source_ids`),
    application_ids: strictSortedStrings(input.application_ids, `${path}.application_ids`),
    review_decision_id: strictString(input.review_decision_id, `${path}.review_decision_id`),
    review_membership_fingerprint: strictString(input.review_membership_fingerprint, `${path}.review_membership_fingerprint`),
    resolution_method: resolutionMethod,
    evidence_bindings: strictEvidence(input.evidence_bindings, `${path}.evidence_bindings`) as OperationalOccurrenceEvidenceBinding[],
  };
}

export function parseResolvedInterventionContextLink(
  value: unknown,
  path = "resolved intervention context link",
): ResolvedInterventionContextLink {
  const input = strictObject(value, path);
  strictFields(input, contextFields, path);
  if (input.schema_version !== 1) throw new Error(`${path}.schema_version must be 1`);
  const kind = strictString(input.context_record_kind, `${path}.context_record_kind`);
  if (!["project", "corridor", "entity"].includes(kind)) throw new Error(`${path}.context_record_kind is invalid`);
  return {
    schema_version: 1,
    context_link_id: strictString(input.context_link_id, `${path}.context_link_id`),
    occurrence_id: strictString(input.occurrence_id, `${path}.occurrence_id`),
    relation_record_id: strictString(input.relation_record_id, `${path}.relation_record_id`),
    context_record_id: strictString(input.context_record_id, `${path}.context_record_id`),
    context_record_kind: kind as ResolvedInterventionContextLink["context_record_kind"],
    evidence_bindings: strictEvidence(input.evidence_bindings, `${path}.evidence_bindings`) as OperationalOccurrenceEvidenceBinding[],
  };
}

export function parseResolvedInterventionApplicationReconciliation(
  value: unknown,
  path = "resolved intervention application reconciliation",
): ResolvedInterventionApplicationReconciliation {
  const input = strictObject(value, path);
  strictFields(input, applicationReconciliationFields, path);
  if (input.schema_version !== 1) throw new Error(`${path}.schema_version must be 1`);
  const disposition = strictString(input.disposition, `${path}.disposition`);
  if (!["does_not_apply", "unknown", "ambiguous", "pending_review"].includes(disposition)) {
    throw new Error(`${path}.disposition is invalid`);
  }
  return {
    schema_version: 1,
    reconciliation_id: strictString(input.reconciliation_id, `${path}.reconciliation_id`),
    candidate_id: strictString(input.candidate_id, `${path}.candidate_id`),
    occurrence_id: strictNullableString(input.occurrence_id, `${path}.occurrence_id`),
    disposition: disposition as ResolvedInterventionApplicationReconciliation["disposition"],
    reason_code: strictString(input.reason_code, `${path}.reason_code`),
    review_decision_id: strictNullableString(input.review_decision_id, `${path}.review_decision_id`),
    evidence_bindings: strictEvidence(
      input.evidence_bindings,
      `${path}.evidence_bindings`,
      { plain: true, allowEmpty: true },
    ) as Array<{ record_id: string; source_id: string; evidence_id: string }>,
  };
}

export function parseResolvedInterventionIdentityReconciliation(
  value: unknown,
  path = "resolved intervention identity reconciliation",
): ResolvedInterventionIdentityReconciliation {
  const input = strictObject(value, path);
  strictFields(input, identityReconciliationFields, path);
  if (input.schema_version !== 1 || input.disposition !== "pending_review" ||
      input.reason_code !== "active_identity_without_exact_application_review") {
    throw new Error(`${path} contract fields are invalid`);
  }
  return {
    schema_version: 1,
    reconciliation_id: strictString(input.reconciliation_id, `${path}.reconciliation_id`),
    occurrence_id: strictString(input.occurrence_id, `${path}.occurrence_id`),
    candidate_ids: strictSortedStrings(input.candidate_ids, `${path}.candidate_ids`),
    disposition: "pending_review",
    reason_code: "active_identity_without_exact_application_review",
    lineage_occurrence_ids: strictSortedStrings(input.lineage_occurrence_ids, `${path}.lineage_occurrence_ids`),
    decision_ids: strictSortedStrings(input.decision_ids, `${path}.decision_ids`),
    evidence_bindings: strictEvidence(
      input.evidence_bindings,
      `${path}.evidence_bindings`,
      { plain: true, allowEmpty: true },
    ) as Array<{ record_id: string; source_id: string; evidence_id: string }>,
  };
}

function parseResolvedInterventionSummary(value: unknown): ResolvedInterventionSummary {
  const input = strictObject(value, "resolved intervention summary");
  strictFields(input, summaryFields, "resolved intervention summary");
  if (input.schema_version !== 1 ||
      input.contract_id !== RESOLVED_INTERVENTION_OPERATOR_CONTRACT_ID ||
      input.zero_unexplained_identity_loss !== true) {
    throw new Error("resolved intervention summary contract fields are invalid");
  }
  for (const field of [
    "episode_count", "application_count", "context_link_count",
    "application_reconciliation_count", "identity_reconciliation_count",
    "published_candidate_count", "pending_identity_candidate_count",
    "active_identity_count", "source_canonical_record_count",
  ] as const) {
    if (!Number.isInteger(input[field]) || Number(input[field]) < 0) {
      throw new Error(`resolved intervention summary.${field} must be a non-negative integer`);
    }
  }
  return input as unknown as ResolvedInterventionSummary;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function canonical(value: unknown): string {
  return stableJson(value as JsonValue);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function histogram(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function treatmentFamilyByRecord(
  treatment: OperationalOccurrenceReviewTreatment,
): Map<string, string> {
  return new Map(
    treatment.kind === "atomic"
      ? [[treatment.member.treatment_record_id, treatment.member.treatment_family]]
      : treatment.members.map((member) => [member.treatment_record_id, member.treatment_family]),
  );
}

function evidenceMatchesCanonical(
  binding: { record_id: string; source_id: string; evidence_id: string },
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  path: string,
): void {
  const record = recordsById.get(binding.record_id);
  if (!record) throw new Error(`${path} references missing canonical record ${binding.record_id}`);
  if (record.review_state === "quarantined") throw new Error(`${path} references quarantined record ${binding.record_id}`);
  if (record.truth_status !== "source_stated") throw new Error(`${path} must bind a source_stated record`);
  if (!record.evidence_refs.some((ref) =>
    ref.source_id === binding.source_id && ref.evidence_id === binding.evidence_id
  )) throw new Error(`${path} evidence is outside canonical record membership`);
}

function extentFor(
  physicalScopeRecordIds: readonly string[],
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): ResolvedInterventionExtent {
  if (physicalScopeRecordIds.length === 0) {
    return { kind: "unknown", record_ids: [], description: null };
  }
  const records = physicalScopeRecordIds.map((id) => {
    const record = recordsById.get(id);
    if (!record) throw new Error(`application extent references missing canonical record ${id}`);
    return record;
  });
  const kinds = new Set(records.map((record) => record.record_kind));
  const kind: ResolvedInterventionExtent["kind"] =
    kinds.size === 1 && kinds.has("corridor") ? "bounded_segment"
      : kinds.size === 1 && kinds.has("route") ? "route_wide"
        : "unknown";
  if (kind === "unknown") {
    throw new Error(
      `reviewed physical scope requires an explicit generic extent decision: ${physicalScopeRecordIds.join(", ")}`,
    );
  }
  return { kind, record_ids: sortedUnique(physicalScopeRecordIds), description: null };
}

function contextLinks(
  occurrenceId: string,
  relationIds: readonly string[],
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): ResolvedInterventionContextLink[] {
  const links: ResolvedInterventionContextLink[] = [];
  for (const relationId of relationIds) {
    const relation = recordsById.get(relationId);
    if (!relation || relation.record_kind !== "relation") continue;
    const endpoints = [relation.payload.subject_id, relation.payload.object_id]
      .filter((value): value is string => typeof value === "string");
    for (const endpoint of endpoints) {
      const target = recordsById.get(endpoint);
      if (!target || !["project", "corridor", "entity"].includes(target.record_kind)) continue;
      const bindings = relation.evidence_refs
        .filter((ref): ref is typeof ref & { evidence_id: string } =>
          typeof ref.evidence_id === "string" && ref.evidence_id.length > 0
        )
        .map((ref) => ({
          role: "timeline_relation" as const,
          record_id: relationId,
          source_id: ref.source_id,
          evidence_id: ref.evidence_id,
        }));
      if (bindings.length === 0) continue;
      links.push({
        schema_version: 1,
        context_link_id: `context:${fingerprint([occurrenceId, relationId, endpoint]).slice(0, 24)}`,
        occurrence_id: occurrenceId,
        relation_record_id: relationId,
        context_record_id: endpoint,
        context_record_kind: target.record_kind as "project" | "corridor" | "entity",
        evidence_bindings: sortEvidenceBindings(bindings),
      });
    }
  }
  return [...new Map(links.map((link) => [link.context_link_id, link])).values()]
    .sort((left, right) => left.context_link_id.localeCompare(right.context_link_id));
}

export function buildResolvedInterventions(
  input: BuildResolvedInterventionsInput,
): ResolvedInterventionModel {
  const recordsById = new Map(input.canonical_records.map((record) => [record.record_id, record]));
  if (recordsById.size !== input.canonical_records.length) throw new Error("canonical record ids must be unique");
  const reviewsByOccurrence = new Map(input.review_decisions.map((review) => [review.occurrence_id, review]));
  if (reviewsByOccurrence.size !== input.review_decisions.length) throw new Error("review occurrence ids must be unique");
  const activeIdentities = input.identity_registry.filter((identity) => identity.state === "active");
  const activeById = new Map(activeIdentities.map((identity) => [identity.occurrence_id, identity]));
  const published = input.candidate_ledger.filter((candidate) => candidate.disposition === "published");
  const publishedByOccurrence = new Map<string, OperationalEpisodeCandidateLedgerRow[]>();
  for (const candidate of published) {
    if (!candidate.published_occurrence_id) throw new Error(`published candidate ${candidate.candidate_id} lacks occurrence`);
    const rows = publishedByOccurrence.get(candidate.published_occurrence_id) ?? [];
    rows.push(candidate);
    publishedByOccurrence.set(candidate.published_occurrence_id, rows);
  }
  const publishedIds = sortedUnique([...publishedByOccurrence.keys()]);
  const reviewIds = sortedUnique([...reviewsByOccurrence.keys()]);
  if (canonical(publishedIds) !== canonical(reviewIds)) {
    throw new Error("episode ids must equal published exact-review ids");
  }

  const applications: ResolvedInterventionApplication[] = [];
  const episodes: ResolvedInterventionEpisode[] = [];
  const allContextLinks: ResolvedInterventionContextLink[] = [];
  for (const occurrenceId of publishedIds) {
    const review = reviewsByOccurrence.get(occurrenceId)!;
    const identity = activeById.get(occurrenceId);
    if (!identity) throw new Error(`published episode ${occurrenceId} does not resolve to an active identity`);
    const candidates = publishedByOccurrence.get(occurrenceId)!;
    if (candidates.some((candidate) =>
      candidate.review_membership_fingerprint !== review.membership_fingerprint
    )) throw new Error(`published episode ${occurrenceId} has stale frontier review membership`);
    const familyByTreatment = treatmentFamilyByRecord(review.treatment);
    const reviewedMembershipIds = new Set([
      ...review.observation_event_record_ids,
      ...review.observation_relation_record_ids,
      ...review.phase_record_ids,
      ...review.phase_relation_record_ids,
      ...review.physical_scope_record_ids,
      ...review.physical_scope_relation_record_ids,
      ...review.routes.map((route) => route.route_record_id),
      ...familyByTreatment.keys(),
    ]);
    const episodeApplications = review.applications.map((reviewed, index) => {
      if (!reviewedMembershipIds.has(reviewed.route_record_id) ||
          !reviewedMembershipIds.has(reviewed.treatment_record_id) ||
          (reviewed.phase_record_id !== null && !reviewedMembershipIds.has(reviewed.phase_record_id)) ||
          reviewed.physical_scope_record_ids.some((id) => !reviewedMembershipIds.has(id))) {
        throw new Error(`review ${review.decision_id} application[${index}] is outside exact review membership`);
      }
      const route = recordsById.get(reviewed.route_record_id);
      const treatment = recordsById.get(reviewed.treatment_record_id);
      if (route?.record_kind !== "route") throw new Error(`review application route ${reviewed.route_record_id} is not canonical route`);
      if (treatment?.record_kind !== "treatment_component") {
        throw new Error(`review application treatment ${reviewed.treatment_record_id} is not canonical treatment_component`);
      }
      if (reviewed.phase_record_id && recordsById.get(reviewed.phase_record_id)?.record_kind !== "event") {
        throw new Error(`review application phase ${reviewed.phase_record_id} is not canonical event`);
      }
      for (const [bindingIndex, binding] of reviewed.evidence_bindings.entries()) {
        if (!reviewedMembershipIds.has(binding.record_id)) {
          throw new Error(`review ${review.decision_id} application evidence is outside review membership`);
        }
        evidenceMatchesCanonical(binding, recordsById, `review ${review.decision_id} application[${index}].evidence[${bindingIndex}]`);
      }
      const extent = extentFor(reviewed.physical_scope_record_ids, recordsById);
      const withoutId = {
        schema_version: 1 as const,
        occurrence_id: occurrenceId,
        route_record_id: reviewed.route_record_id,
        gtfs_route_id: reviewed.gtfs_route_id,
        treatment_record_id: reviewed.treatment_record_id,
        treatment_family: familyByTreatment.get(reviewed.treatment_record_id) ??
          (() => { throw new Error(`review ${review.decision_id} application treatment is outside treatment membership`); })(),
        phase_record_id: reviewed.phase_record_id,
        action: reviewed.action,
        applicability: "applies" as const,
        extent,
        evidence_bindings: sortEvidenceBindings(reviewed.evidence_bindings),
        review_decision_id: review.decision_id,
        resolution_method: review.review_scope === "lossless_v1_migration"
          ? "lossless_v1_migration" as const
          : "accepted_review" as const,
      };
      return parseResolvedInterventionApplication({
        ...withoutId,
        application_id: resolvedInterventionApplicationIdentity(withoutId),
      }, `review ${review.decision_id} application[${index}]`);
    });
    if (episodeApplications.length === 0) throw new Error(`episode ${occurrenceId} has no applications`);
    applications.push(...episodeApplications);
    const candidateEventIds = sortedUnique(candidates.flatMap((candidate) => candidate.observation_event_record_ids));
    if (canonical(candidateEventIds) !== canonical(review.observation_event_record_ids)) {
      throw new Error(`episode ${occurrenceId} frontier observations are stale`);
    }
    const applicationIds = episodeApplications.map((application) => application.application_id).sort();
    const sourceIds = sortedUnique([
      ...candidates.flatMap((candidate) => candidate.source_ids),
      ...episodeApplications.flatMap((application) => application.evidence_bindings.map((binding) => binding.source_id)),
    ]);
    const episode: ResolvedInterventionEpisode = {
      schema_version: 1,
      occurrence_id: occurrenceId,
      occurrence_aliases: [...identity.aliases].sort(),
      identity_state: "active",
      observation_event_record_ids: [...review.observation_event_record_ids].sort(),
      observation_relation_record_ids: [...review.observation_relation_record_ids].sort(),
      candidate_ids: candidates.map((candidate) => candidate.candidate_id).sort(),
      resolved_onset: {
        date: review.resolved_onset.date,
        precision: review.resolved_onset.precision,
      },
      route_record_ids: sortedUnique(episodeApplications.map((application) => application.route_record_id)),
      gtfs_route_ids: sortedUnique(episodeApplications.map((application) => application.gtfs_route_id)),
      treatment_record_ids: sortedUnique(episodeApplications.map((application) => application.treatment_record_id)),
      treatment_families: sortedUnique(episodeApplications.map((application) => application.treatment_family)),
      phase_record_ids: sortedUnique(episodeApplications.flatMap((application) =>
        application.phase_record_id ? [application.phase_record_id] : []
      )),
      physical_scope_record_ids: sortedUnique(episodeApplications.flatMap((application) => application.extent.record_ids)),
      source_ids: sourceIds,
      application_ids: applicationIds,
      review_decision_id: review.decision_id,
      review_membership_fingerprint: review.membership_fingerprint,
      resolution_method: review.review_scope === "lossless_v1_migration"
        ? "lossless_v1_migration"
        : "accepted_review",
      evidence_bindings: sortEvidenceBindings(review.evidence_bindings),
    };
    episodes.push(episode);
    allContextLinks.push(...contextLinks(occurrenceId, review.observation_relation_record_ids, recordsById));
  }

  const duplicateApplicationIds = applications.map((application) => application.application_id);
  if (new Set(duplicateApplicationIds).size !== duplicateApplicationIds.length) {
    throw new Error("duplicate resolved intervention application id");
  }
  const incidenceKeys = applications.map(resolvedInterventionApplicationIncidenceKey);
  if (new Set(incidenceKeys).size !== incidenceKeys.length) {
    throw new Error("duplicate resolved intervention application incidence");
  }
  applications.sort((left, right) => left.application_id.localeCompare(right.application_id));
  episodes.sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));

  const unresolvedCandidateRows = input.candidate_ledger.filter((candidate) =>
    candidate.disposition === "pending_review" && candidate.unresolved_active_occurrence_ids.length > 0
  );
  const unresolvedByIdentity = new Map<string, OperationalEpisodeCandidateLedgerRow[]>();
  for (const candidate of unresolvedCandidateRows) {
    for (const occurrenceId of candidate.unresolved_active_occurrence_ids) {
      const rows = unresolvedByIdentity.get(occurrenceId) ?? [];
      rows.push(candidate);
      unresolvedByIdentity.set(occurrenceId, rows);
    }
  }
  const unresolvedIds = sortedUnique([...unresolvedByIdentity.keys()]);
  const expectedUnresolvedIds = sortedUnique(activeIdentities
    .filter((identity) => !reviewsByOccurrence.has(identity.occurrence_id))
    .map((identity) => identity.occurrence_id));
  if (canonical(unresolvedIds) !== canonical(expectedUnresolvedIds)) {
    throw new Error("identity reconciliation ids must equal unresolved active identity ids");
  }
  const identityReconciliation: ResolvedInterventionIdentityReconciliation[] = unresolvedIds.map((occurrenceId) => {
    const rows = unresolvedByIdentity.get(occurrenceId)!;
    const identity = activeById.get(occurrenceId)!;
    return {
      schema_version: 1,
      reconciliation_id: `identity-reconciliation:${occurrenceId}`,
      occurrence_id: occurrenceId,
      candidate_ids: rows.map((row) => row.candidate_id).sort(),
      disposition: "pending_review",
      reason_code: "active_identity_without_exact_application_review",
      lineage_occurrence_ids: sortedUnique(rows.flatMap((row) => row.lineage_occurrence_ids)),
      decision_ids: sortedUnique([...identity.lineage_operation_ids, ...rows.flatMap((row) => row.decision_ids)]),
      evidence_bindings: [...new Map(rows.flatMap((row) => row.evidence_bindings)
        .map((binding) => [
          `${binding.record_id}|${binding.source_id}|${binding.evidence_id}`,
          binding,
        ])).values()].sort((left, right) =>
          `${left.record_id}|${left.source_id}|${left.evidence_id}`.localeCompare(
            `${right.record_id}|${right.source_id}|${right.evidence_id}`,
          )
        ),
    };
  });
  if (publishedIds.some((id) => unresolvedIds.includes(id)) ||
      canonical(sortedUnique([...publishedIds, ...unresolvedIds])) !==
        canonical(sortedUnique(activeIdentities.map((identity) => identity.occurrence_id)))) {
    throw new Error("resolved episode and identity reconciliation partitions are not exact");
  }

  const positiveLegacyKeys = new Set(applications.map((application) =>
    [application.occurrence_id, application.route_record_id, application.treatment_record_id].join("|")
  ));
  const applicationReconciliation: ResolvedInterventionApplicationReconciliation[] =
    (input.legacy_member_extent_rows ?? [])
      .filter((row) => !positiveLegacyKeys.has(
        [row.occurrence_id, row.route_record_id, row.treatment_record_id].join("|"),
      ))
      .map((row) => ({
        schema_version: 1 as const,
        reconciliation_id: `application-reconciliation:${row.extent_id}`,
        candidate_id: row.extent_id,
        occurrence_id: row.occurrence_id,
        disposition: "pending_review" as const,
        reason_code: "legacy_study_row_is_nonauthorizing",
        review_decision_id: row.decision_id,
        evidence_bindings: [...new Map(row.evidence_bindings.map((binding) => [
          `${binding.record_id}|${binding.source_id}|${binding.evidence_id}`,
          {
            record_id: binding.record_id,
            source_id: binding.source_id,
            evidence_id: binding.evidence_id,
          },
        ])).values()].sort((left, right) =>
          `${left.record_id}|${left.source_id}|${left.evidence_id}`.localeCompare(
            `${right.record_id}|${right.source_id}|${right.evidence_id}`,
          )
        ),
      }))
      .sort((left, right) => left.reconciliation_id.localeCompare(right.reconciliation_id));

  const model: ResolvedInterventionModel = {
    episodes,
    applications,
    context_links: [...new Map(allContextLinks.map((link) => [link.context_link_id, link])).values()]
      .sort((left, right) => left.context_link_id.localeCompare(right.context_link_id)),
    application_reconciliation: applicationReconciliation,
    identity_reconciliation: identityReconciliation,
    summary: {
      schema_version: 1,
      contract_id: RESOLVED_INTERVENTION_OPERATOR_CONTRACT_ID,
      episode_count: episodes.length,
      application_count: applications.length,
      context_link_count: new Set(allContextLinks.map((link) => link.context_link_id)).size,
      application_reconciliation_count: applicationReconciliation.length,
      identity_reconciliation_count: identityReconciliation.length,
      published_candidate_count: published.length,
      pending_identity_candidate_count: unresolvedCandidateRows.length,
      active_identity_count: activeIdentities.length,
      counts_by_action: histogram(applications.map((application) => application.action)),
      counts_by_extent_kind: histogram(applications.map((application) => application.extent.kind)),
      source_canonical_record_count: input.canonical_records.length,
      canonical_input_fingerprint: fingerprint(input.canonical_records),
      review_input_fingerprint: fingerprint(input.review_decisions),
      frontier_input_fingerprint: fingerprint(input.candidate_ledger),
      zero_unexplained_identity_loss: true,
    },
  };
  assertResolvedInterventionModel(model);
  return model;
}

function assertDerivedSets(episode: ResolvedInterventionEpisode, applications: readonly ResolvedInterventionApplication[]): void {
  const expected = {
    application_ids: applications.map((application) => application.application_id).sort(),
    gtfs_route_ids: sortedUnique(applications.map((application) => application.gtfs_route_id)),
    phase_record_ids: sortedUnique(applications.flatMap((application) => application.phase_record_id ? [application.phase_record_id] : [])),
    physical_scope_record_ids: sortedUnique(applications.flatMap((application) => application.extent.record_ids)),
    route_record_ids: sortedUnique(applications.map((application) => application.route_record_id)),
    treatment_families: sortedUnique(applications.map((application) => application.treatment_family)),
    treatment_record_ids: sortedUnique(applications.map((application) => application.treatment_record_id)),
  };
  for (const [field, values] of Object.entries(expected)) {
    if (canonical(episode[field as keyof typeof expected]) !== canonical(values)) {
      throw new Error(`episode ${episode.occurrence_id} ${field} disagrees with application-derived set`);
    }
  }
}

export function assertResolvedInterventionModel(model: ResolvedInterventionModel): void {
  model.episodes.forEach((episode, index) =>
    parseResolvedInterventionEpisode(episode, `episode[${index}]`)
  );
  model.context_links.forEach((link, index) =>
    parseResolvedInterventionContextLink(link, `context_link[${index}]`)
  );
  model.application_reconciliation.forEach((row, index) =>
    parseResolvedInterventionApplicationReconciliation(row, `application_reconciliation[${index}]`)
  );
  model.identity_reconciliation.forEach((row, index) =>
    parseResolvedInterventionIdentityReconciliation(row, `identity_reconciliation[${index}]`)
  );
  parseResolvedInterventionSummary(model.summary);
  const episodeIds = model.episodes.map((episode) => episode.occurrence_id);
  if (new Set(episodeIds).size !== episodeIds.length) throw new Error("duplicate resolved episode id");
  const applicationIds = model.applications.map((application) => application.application_id);
  if (new Set(applicationIds).size !== applicationIds.length) throw new Error("duplicate resolved application id");
  const episodesById = new Map(model.episodes.map((episode) => [episode.occurrence_id, episode]));
  for (const application of model.applications) {
    parseResolvedInterventionApplication(application, `application ${application.application_id}`);
    if (!episodesById.has(application.occurrence_id)) {
      throw new Error(`application ${application.application_id} references missing episode`);
    }
  }
  for (const episode of model.episodes) {
    const owned = model.applications.filter((application) => application.occurrence_id === episode.occurrence_id);
    if (owned.length === 0) throw new Error(`episode ${episode.occurrence_id} has no applications`);
    assertDerivedSets(episode, owned);
  }
  if (model.summary.episode_count !== model.episodes.length ||
      model.summary.application_count !== model.applications.length ||
      model.summary.context_link_count !== model.context_links.length ||
      model.summary.application_reconciliation_count !== model.application_reconciliation.length ||
      model.summary.identity_reconciliation_count !== model.identity_reconciliation.length ||
      model.summary.active_identity_count !== model.episodes.length + model.identity_reconciliation.length) {
    throw new Error("resolved intervention summary arithmetic is stale");
  }
}

function json(value: unknown): string {
  return `${canonical(value)}\n`;
}

function jsonl(values: readonly unknown[]): string {
  return values.map(canonical).join("\n") + (values.length ? "\n" : "");
}

export function resolvedInterventionContents(model: ResolvedInterventionModel): Record<string, string> {
  return {
    "application_reconciliation.jsonl": jsonl(model.application_reconciliation),
    "applications.jsonl": jsonl(model.applications),
    "context_links.jsonl": jsonl(model.context_links),
    "episodes.jsonl": jsonl(model.episodes),
    "identity_reconciliation.jsonl": jsonl(model.identity_reconciliation),
    "summary.json": json(model.summary),
  };
}

export function writeResolvedInterventions(outputDir: string, model: ResolvedInterventionModel): void {
  assertResolvedInterventionModel(model);
  mkdirSync(outputDir, { recursive: true });
  for (const [name, content] of Object.entries(resolvedInterventionContents(model))) {
    writeFileSync(join(outputDir, name), content);
  }
}

export function checkResolvedInterventions(outputDir: string, model: ResolvedInterventionModel): void {
  for (const [name, content] of Object.entries(resolvedInterventionContents(model))) {
    const path = join(outputDir, name);
    if (!existsSync(path)) throw new Error(`resolved intervention artifact is missing: ${path}`);
    if (readFileSync(path, "utf8") !== content) throw new Error(`resolved intervention artifact is stale: ${path}`);
  }
}

function readJsonl<T>(path: string, parse: (value: unknown, path: string) => T): T[] {
  if (!existsSync(path)) throw new Error(`required resolved intervention artifact is missing: ${path}`);
  return readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean)
    .map((line, index) => parse(JSON.parse(line) as unknown, `${path}:${index + 1}`));
}

export function loadResolvedInterventions(outputDir: string): ResolvedInterventionModel {
  const model: ResolvedInterventionModel = {
    episodes: readJsonl(join(outputDir, "episodes.jsonl"), parseResolvedInterventionEpisode),
    applications: readJsonl(join(outputDir, "applications.jsonl"), parseResolvedInterventionApplication),
    context_links: readJsonl(join(outputDir, "context_links.jsonl"), parseResolvedInterventionContextLink),
    application_reconciliation: readJsonl(
      join(outputDir, "application_reconciliation.jsonl"),
      parseResolvedInterventionApplicationReconciliation,
    ),
    identity_reconciliation: readJsonl(
      join(outputDir, "identity_reconciliation.jsonl"),
      parseResolvedInterventionIdentityReconciliation,
    ),
    summary: parseResolvedInterventionSummary(
      JSON.parse(readFileSync(join(outputDir, "summary.json"), "utf8")) as unknown,
    ),
  };
  assertResolvedInterventionModel(model);
  return model;
}

export function buildProductionResolvedInterventions(rootDir = repoRoot): ResolvedInterventionModel {
  const frontierDir = join(rootDir, "data", "quality", "operational-episode-frontier", "v1");
  const { candidate_ledger } = loadOperationalEpisodeFrontierLedgers(frontierDir);
  const legacyExtentPath = join(
    rootDir,
    "data",
    "contracts",
    "operational-occurrence-member-extent",
    "v1",
    "operational_occurrence_member_extents.jsonl",
  );
  const legacyRows = existsSync(legacyExtentPath)
    ? readFileSync(legacyExtentPath, "utf8").split(/\r?\n/u).filter(Boolean)
      .map((line) => JSON.parse(line) as NonNullable<BuildResolvedInterventionsInput["legacy_member_extent_rows"]>[number])
    : [];
  return buildResolvedInterventions({
    canonical_records: readCanonicalRecords(),
    candidate_ledger,
    identity_registry: loadOperationalOccurrenceIdentityRegistryV2(rootDir),
    review_decisions: loadOperationalOccurrenceAcceptedDecisionsV2(
      join(rootDir, "data", "operational-occurrence-review", "accepted-v2", "decisions"),
    ),
    legacy_member_extent_rows: legacyRows,
  });
}

export function productionResolvedInterventionDir(rootDir = repoRoot): string {
  return join(rootDir, "data", "resolved-transit", "operator", "v1", "interventions");
}
