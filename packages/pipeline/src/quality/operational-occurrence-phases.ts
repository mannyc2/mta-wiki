import { stableHash, stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord, MtaEvidenceRef } from "@mta-wiki/db/types";
import {
  OPERATIONAL_OCCURRENCE_PHASE_RELATION_ALLOWLIST,
  type OperationalOccurrenceRow,
} from "@mta-wiki/pipeline/materialize/operational-occurrences";

export const OPERATIONAL_OCCURRENCE_PHASE_REVIEW_SCHEMA_VERSION = 1 as const;
export const OPERATIONAL_OCCURRENCE_PHASE_REVIEW_CONTRACT_ID =
  "operational-occurrence-phase-review-v1" as const;
export const OPERATIONAL_OCCURRENCE_PHASE_REVIEW_LEDGER_ID =
  "operational-occurrence-phase-review-ledger-v1" as const;

export const OPERATIONAL_OCCURRENCE_PHASE_REVIEWED_AT = "2026-07-16T06:00:00.000Z" as const;
export const OPERATIONAL_OCCURRENCE_PHASE_REVIEWED_BY =
  "codex-operational-occurrence-phase-integrity-review" as const;

export type OperationalOccurrencePhasePrimaryDisposition =
  | "single_observed_phase_no_related_phase_asserted"
  | "evidence_bound_related_phases"
  | "review_required";

export type OperationalOccurrencePhaseCandidateDisposition =
  | "projected_reviewed_phase_relation"
  | "not_projected_external_event_not_selected"
  | "not_projected_non_phase_semantics"
  | "review_required_unprojected_same_occurrence_temporal_relation";

export type OperationalOccurrencePhaseFindingCode =
  | "OOPHASE_OCCURRENCE_ID_MISSING"
  | "OOPHASE_PHASE_IDENTITY_MISSING"
  | "OOPHASE_PHASE_IDENTITY_DUPLICATE"
  | "OOPHASE_PHASE_EVENT_MISSING"
  | "OOPHASE_PHASE_EVENT_TYPE_INVALID"
  | "OOPHASE_PHASE_EVENT_REVIEW_INVALID"
  | "OOPHASE_PHASE_EVENT_EVIDENCE_MISSING"
  | "OOPHASE_PHASE_DISPOSITION_INVALID"
  | "OOPHASE_PHASE_RELATION_UNEXPECTED_FOR_SINGLE_PHASE"
  | "OOPHASE_PHASE_RELATION_MISSING_FOR_RELATED_PHASES"
  | "OOPHASE_PHASE_RELATION_DUPLICATE"
  | "OOPHASE_PHASE_RELATION_MISSING"
  | "OOPHASE_PHASE_RELATION_TYPE_INVALID"
  | "OOPHASE_PHASE_RELATION_ENDPOINT_INVALID"
  | "OOPHASE_PHASE_RELATION_SEMANTICS_INVALID"
  | "OOPHASE_PHASE_RELATION_REVIEW_INVALID"
  | "OOPHASE_PHASE_RELATION_EVIDENCE_MISSING"
  | "OOPHASE_PHASE_RELATION_EVIDENCE_BINDING_MISMATCH"
  | "OOPHASE_UNPROJECTED_SAME_OCCURRENCE_TEMPORAL_RELATION";

export type OperationalOccurrencePhaseFinding = {
  schema_version: typeof OPERATIONAL_OCCURRENCE_PHASE_REVIEW_SCHEMA_VERSION;
  code: OperationalOccurrencePhaseFindingCode;
  primary_disposition: "review_required";
  occurrence_id: string | null;
  record_id: string | null;
  reason: string;
  related_record_ids: string[];
};

export type OperationalOccurrencePhaseCandidate = {
  schema_version: typeof OPERATIONAL_OCCURRENCE_PHASE_REVIEW_SCHEMA_VERSION;
  contract_id: typeof OPERATIONAL_OCCURRENCE_PHASE_REVIEW_CONTRACT_ID;
  candidate_id: string;
  occurrence_id: string;
  relation_record_id: string;
  subject_event_record_id: string;
  object_event_record_id: string;
  relation_kind: string | null;
  relation_family: string | null;
  assertion_status: string | null;
  endpoint_membership: "both_in_occurrence" | "one_in_occurrence";
  allowlisted_temporal_semantics: boolean;
  projected_by_occurrence_review: boolean;
  primary_disposition: OperationalOccurrencePhaseCandidateDisposition;
  reason_codes: string[];
  evidence_refs: MtaEvidenceRef[];
  relation_evidence_sha256: string;
};

export type OperationalOccurrencePhaseReviewDecision = {
  schema_version: typeof OPERATIONAL_OCCURRENCE_PHASE_REVIEW_SCHEMA_VERSION;
  contract_id: typeof OPERATIONAL_OCCURRENCE_PHASE_REVIEW_CONTRACT_ID;
  ledger_id: typeof OPERATIONAL_OCCURRENCE_PHASE_REVIEW_LEDGER_ID;
  decision_id: string;
  occurrence_id: string;
  occurrence_review_decision_id: string;
  study_projection_eligible: boolean;
  review_state: "reviewed" | "review_required";
  primary_disposition: OperationalOccurrencePhasePrimaryDisposition;
  disposition_statement: string;
  phase_record_ids: string[];
  phase_relation_record_ids: string[];
  phase_event_evidence_refs: MtaEvidenceRef[];
  phase_relation_evidence_refs: MtaEvidenceRef[];
  phase_event_evidence_sha256: string;
  phase_relation_evidence_sha256: string;
  checked_event_event_candidate_ids: string[];
  checked_event_event_candidates_sha256: string;
  review_basis_ids: string[];
  reviewed_at: typeof OPERATIONAL_OCCURRENCE_PHASE_REVIEWED_AT;
  reviewed_by: typeof OPERATIONAL_OCCURRENCE_PHASE_REVIEWED_BY;
  no_external_phase_inference: true;
  warning_codes: OperationalOccurrencePhaseFindingCode[];
};

export type OperationalOccurrencePhaseReviewSummary = {
  schema_version: typeof OPERATIONAL_OCCURRENCE_PHASE_REVIEW_SCHEMA_VERSION;
  contract_id: typeof OPERATIONAL_OCCURRENCE_PHASE_REVIEW_CONTRACT_ID;
  occurrence_count: number;
  eligible_occurrence_count: number;
  ineligible_occurrence_count: number;
  phase_identity_membership_count: number;
  unique_phase_event_count: number;
  projected_phase_relation_count: number;
  checked_event_event_candidate_count: number;
  counts_by_primary_disposition: Record<OperationalOccurrencePhasePrimaryDisposition, number>;
  counts_by_candidate_disposition: Record<OperationalOccurrencePhaseCandidateDisposition, number>;
  finding_counts: Partial<Record<OperationalOccurrencePhaseFindingCode, number>>;
  phase_identity_complete: boolean;
  phase_relation_or_disposition_complete: boolean;
  exact_evidence_complete: boolean;
  hard_mode_ready: boolean;
};

export type OperationalOccurrencePhaseReviewBuild = {
  decisions: OperationalOccurrencePhaseReviewDecision[];
  candidates: OperationalOccurrencePhaseCandidate[];
  findings: OperationalOccurrencePhaseFinding[];
  summary: OperationalOccurrencePhaseReviewSummary;
};

type PhaseOccurrenceInput = Pick<
  OperationalOccurrenceRow,
  | "occurrence_id"
  | "occurrence_review_decision_id"
  | "study_projection_eligible"
  | "phase_record_ids"
  | "phase_relation_record_ids"
  | "phase_relation_evidence_bindings"
  | "phase_relation_disposition"
  | "provenance"
>;

const allowedPhaseRelationSemantics = new Set(
  OPERATIONAL_OCCURRENCE_PHASE_RELATION_ALLOWLIST.map((entry) =>
    [entry.relation_kind, entry.relation_family, entry.assertion_status].join("|")),
);

function text(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function evidenceKey(ref: MtaEvidenceRef): string {
  return [
    ref.source_id,
    ref.evidence_id ?? "",
    ref.source_path ?? "",
    ref.page_number ?? "",
    ref.block_id ?? "",
    ref.block_range ?? "",
    ref.text_sha256 ?? "",
  ].join("|");
}

function sortedEvidence(refs: Iterable<MtaEvidenceRef>): MtaEvidenceRef[] {
  return [...new Map([...refs].map((ref) => [evidenceKey(ref), { ...ref }])).values()]
    .sort((left, right) => evidenceKey(left).localeCompare(evidenceKey(right)));
}

function exactEvidence(refs: readonly MtaEvidenceRef[]): MtaEvidenceRef[] {
  return sortedEvidence(refs.filter((ref) => Boolean(ref.source_id && ref.evidence_id)));
}

function hasMissingExactEvidence(refs: readonly MtaEvidenceRef[]): boolean {
  return refs.length === 0 || refs.some((ref) => !ref.source_id || !ref.evidence_id);
}

function relationSemanticKey(record: MtaCanonicalRecord): string {
  return [
    text(record.payload.relation_kind) ?? "",
    text(record.payload.relation_family) ?? "",
    text(record.payload.assertion_status) ?? "",
  ].join("|");
}

function finding(input: {
  code: OperationalOccurrencePhaseFindingCode;
  occurrenceId: string | null;
  recordId?: string | null | undefined;
  reason: string;
  relatedRecordIds?: Iterable<string> | undefined;
}): OperationalOccurrencePhaseFinding {
  return {
    schema_version: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_SCHEMA_VERSION,
    code: input.code,
    primary_disposition: "review_required",
    occurrence_id: input.occurrenceId,
    record_id: input.recordId ?? null,
    reason: input.reason,
    related_record_ids: uniqueSorted(input.relatedRecordIds ?? []),
  };
}

function candidateDisposition(input: {
  projected: boolean;
  bothInOccurrence: boolean;
  allowlisted: boolean;
}): {
  disposition: OperationalOccurrencePhaseCandidateDisposition;
  reasonCodes: string[];
} {
  if (input.projected) {
    return {
      disposition: "projected_reviewed_phase_relation",
      reasonCodes: ["accepted_occurrence_review_selected_relation", "exact_relation_evidence_required"],
    };
  }
  if (input.bothInOccurrence && input.allowlisted) {
    return {
      disposition: "review_required_unprojected_same_occurrence_temporal_relation",
      reasonCodes: ["allowlisted_temporal_relation_not_selected_by_occurrence_review"],
    };
  }
  if (!input.allowlisted) {
    return {
      disposition: "not_projected_non_phase_semantics",
      reasonCodes: ["relation_semantics_not_in_phase_allowlist", "no_temporal_inference"],
    };
  }
  return {
    disposition: "not_projected_external_event_not_selected",
    reasonCodes: ["other_event_not_selected_as_occurrence_phase", "no_cross_occurrence_phase_inference"],
  };
}

function candidateFor(input: {
  occurrenceId: string;
  relation: MtaCanonicalRecord;
  phaseIds: ReadonlySet<string>;
  projectedRelationIds: ReadonlySet<string>;
}): OperationalOccurrencePhaseCandidate | null {
  const subjectId = text(input.relation.payload.subject_id);
  const objectId = text(input.relation.payload.object_id);
  if (!subjectId || !objectId) return null;
  const subjectInOccurrence = input.phaseIds.has(subjectId);
  const objectInOccurrence = input.phaseIds.has(objectId);
  if (!subjectInOccurrence && !objectInOccurrence) return null;
  const bothInOccurrence = subjectInOccurrence && objectInOccurrence;
  const allowlisted = allowedPhaseRelationSemantics.has(relationSemanticKey(input.relation));
  const projected = input.projectedRelationIds.has(input.relation.record_id);
  const disposition = candidateDisposition({ projected, bothInOccurrence, allowlisted });
  const evidenceRefs = exactEvidence(input.relation.evidence_refs);
  return {
    schema_version: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_SCHEMA_VERSION,
    contract_id: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_CONTRACT_ID,
    candidate_id: `phase-candidate-v1:${stableHash([
      input.occurrenceId,
      input.relation.record_id,
    ] as unknown as JsonValue).slice(0, 24)}`,
    occurrence_id: input.occurrenceId,
    relation_record_id: input.relation.record_id,
    subject_event_record_id: subjectId,
    object_event_record_id: objectId,
    relation_kind: text(input.relation.payload.relation_kind),
    relation_family: text(input.relation.payload.relation_family),
    assertion_status: text(input.relation.payload.assertion_status),
    endpoint_membership: bothInOccurrence ? "both_in_occurrence" : "one_in_occurrence",
    allowlisted_temporal_semantics: allowlisted,
    projected_by_occurrence_review: projected,
    primary_disposition: disposition.disposition,
    reason_codes: disposition.reasonCodes.sort(),
    evidence_refs: evidenceRefs,
    relation_evidence_sha256: stableHash(evidenceRefs as unknown as JsonValue),
  };
}

function recordIdsAreUnique(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

function sameEvidenceBindings(
  relationIds: readonly string[],
  relationsById: ReadonlyMap<string, MtaCanonicalRecord>,
  bindings: PhaseOccurrenceInput["phase_relation_evidence_bindings"],
): boolean {
  const expected = relationIds.flatMap((recordId) => {
    const relation = relationsById.get(recordId);
    if (!relation) return [];
    return exactEvidence(relation.evidence_refs).map((ref) => ({
      role: "phase_relation",
      record_id: recordId,
      source_id: ref.source_id,
      evidence_id: ref.evidence_id!,
    }));
  }).sort((left, right) => stableJson(left as unknown as JsonValue).localeCompare(stableJson(right as unknown as JsonValue)));
  const actual = [...bindings].map((binding) => ({
    role: binding.role,
    record_id: binding.record_id,
    source_id: binding.source_id,
    evidence_id: binding.evidence_id,
  })).sort((left, right) => stableJson(left as unknown as JsonValue).localeCompare(stableJson(right as unknown as JsonValue)));
  return stableJson(expected as unknown as JsonValue) === stableJson(actual as unknown as JsonValue);
}

function countValues<T extends string>(values: readonly T[], keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length])) as Record<T, number>;
}

export function buildOperationalOccurrencePhaseReview(input: {
  occurrences: readonly PhaseOccurrenceInput[];
  records: readonly MtaCanonicalRecord[];
}): OperationalOccurrencePhaseReviewBuild {
  const recordsById = new Map<string, MtaCanonicalRecord>();
  const duplicateRecordIds = new Set<string>();
  for (const record of input.records) {
    if (recordsById.has(record.record_id)) duplicateRecordIds.add(record.record_id);
    recordsById.set(record.record_id, record);
  }
  const eventEventRelations = input.records.filter((record) => {
    if (record.record_kind !== "relation") return false;
    const subject = recordsById.get(text(record.payload.subject_id) ?? "");
    const object = recordsById.get(text(record.payload.object_id) ?? "");
    return subject?.record_kind === "event" && object?.record_kind === "event";
  }).sort((left, right) => left.record_id.localeCompare(right.record_id));

  const decisions: OperationalOccurrencePhaseReviewDecision[] = [];
  const candidates: OperationalOccurrencePhaseCandidate[] = [];
  const findings: OperationalOccurrencePhaseFinding[] = [];

  for (const occurrence of [...input.occurrences].sort((left, right) =>
    left.occurrence_id.localeCompare(right.occurrence_id))) {
    const occurrenceId = occurrence.occurrence_id.trim();
    const rowFindingStart = findings.length;
    if (!occurrenceId) {
      findings.push(finding({
        code: "OOPHASE_OCCURRENCE_ID_MISSING",
        occurrenceId: null,
        reason: "Operational occurrence must carry a stable occurrence_id before phase review.",
      }));
    }
    const phaseIds = uniqueSorted(occurrence.phase_record_ids.filter(Boolean));
    const phaseRelationIds = uniqueSorted(occurrence.phase_relation_record_ids.filter(Boolean));
    const phaseIdSet = new Set(phaseIds);
    const phaseRelationIdSet = new Set(phaseRelationIds);
    if (phaseIds.length === 0) {
      findings.push(finding({
        code: "OOPHASE_PHASE_IDENTITY_MISSING",
        occurrenceId,
        reason: "Operational occurrence has no canonical event phase identity.",
      }));
    }
    if (!recordIdsAreUnique(occurrence.phase_record_ids)) {
      findings.push(finding({
        code: "OOPHASE_PHASE_IDENTITY_DUPLICATE",
        occurrenceId,
        reason: "Operational occurrence repeats a canonical event phase identity.",
        relatedRecordIds: occurrence.phase_record_ids,
      }));
    }
    if (!recordIdsAreUnique(occurrence.phase_relation_record_ids)) {
      findings.push(finding({
        code: "OOPHASE_PHASE_RELATION_DUPLICATE",
        occurrenceId,
        reason: "Operational occurrence repeats a phase relation identity.",
        relatedRecordIds: occurrence.phase_relation_record_ids,
      }));
    }

    const phaseEventEvidence: MtaEvidenceRef[] = [];
    for (const phaseId of phaseIds) {
      const phase = recordsById.get(phaseId);
      if (!phase) {
        findings.push(finding({
          code: "OOPHASE_PHASE_EVENT_MISSING",
          occurrenceId,
          recordId: phaseId,
          reason: `Phase identity ${phaseId} does not resolve to a canonical record.`,
        }));
        continue;
      }
      if (phase.record_kind !== "event") {
        findings.push(finding({
          code: "OOPHASE_PHASE_EVENT_TYPE_INVALID",
          occurrenceId,
          recordId: phaseId,
          reason: `Phase identity ${phaseId} resolves to ${phase.record_kind}, not event.`,
        }));
        continue;
      }
      if (duplicateRecordIds.has(phaseId) || phase.truth_status !== "source_stated" || phase.review_state === "quarantined") {
        findings.push(finding({
          code: "OOPHASE_PHASE_EVENT_REVIEW_INVALID",
          occurrenceId,
          recordId: phaseId,
          reason: `Phase event ${phaseId} must be unique, source_stated, and non-quarantined.`,
        }));
      }
      const exact = exactEvidence(phase.evidence_refs);
      if (hasMissingExactEvidence(phase.evidence_refs)) {
        findings.push(finding({
          code: "OOPHASE_PHASE_EVENT_EVIDENCE_MISSING",
          occurrenceId,
          recordId: phaseId,
          reason: `Phase event ${phaseId} must retain an evidence_id on every canonical evidence ref.`,
        }));
      }
      phaseEventEvidence.push(...exact);
    }

    if (phaseIds.length === 1) {
      if (phaseRelationIds.length > 0) {
        findings.push(finding({
          code: "OOPHASE_PHASE_RELATION_UNEXPECTED_FOR_SINGLE_PHASE",
          occurrenceId,
          reason: "A one-phase occurrence cannot project an earlier/later relation.",
          relatedRecordIds: phaseRelationIds,
        }));
      }
      if (occurrence.phase_relation_disposition !== "single_phase") {
        findings.push(finding({
          code: "OOPHASE_PHASE_DISPOSITION_INVALID",
          occurrenceId,
          reason: "A one-phase occurrence must use the scoped single_phase disposition.",
        }));
      }
    } else if (phaseIds.length > 1) {
      if (phaseRelationIds.length === 0) {
        findings.push(finding({
          code: "OOPHASE_PHASE_RELATION_MISSING_FOR_RELATED_PHASES",
          occurrenceId,
          reason: "Multiple occurrence phases require at least one reviewed earlier/later relation.",
          relatedRecordIds: phaseIds,
        }));
      }
      if (occurrence.phase_relation_disposition !== "related_phases") {
        findings.push(finding({
          code: "OOPHASE_PHASE_DISPOSITION_INVALID",
          occurrenceId,
          reason: "A multi-phase occurrence must use related_phases after evidence-backed connectivity review.",
        }));
      }
    }

    const phaseRelationEvidence: MtaEvidenceRef[] = [];
    for (const relationId of phaseRelationIds) {
      const relation = recordsById.get(relationId);
      if (!relation) {
        findings.push(finding({
          code: "OOPHASE_PHASE_RELATION_MISSING",
          occurrenceId,
          recordId: relationId,
          reason: `Phase relation ${relationId} does not resolve to a canonical record.`,
        }));
        continue;
      }
      if (relation.record_kind !== "relation") {
        findings.push(finding({
          code: "OOPHASE_PHASE_RELATION_TYPE_INVALID",
          occurrenceId,
          recordId: relationId,
          reason: `Phase relation ${relationId} resolves to ${relation.record_kind}, not relation.`,
        }));
        continue;
      }
      const subjectId = text(relation.payload.subject_id);
      const objectId = text(relation.payload.object_id);
      if (!subjectId || !objectId || subjectId === objectId || !phaseIdSet.has(subjectId) || !phaseIdSet.has(objectId)) {
        findings.push(finding({
          code: "OOPHASE_PHASE_RELATION_ENDPOINT_INVALID",
          occurrenceId,
          recordId: relationId,
          reason: `Phase relation ${relationId} must connect two distinct event identities in the occurrence phase set.`,
          relatedRecordIds: [subjectId, objectId].filter((value): value is string => Boolean(value)),
        }));
      }
      if (!allowedPhaseRelationSemantics.has(relationSemanticKey(relation))) {
        findings.push(finding({
          code: "OOPHASE_PHASE_RELATION_SEMANTICS_INVALID",
          occurrenceId,
          recordId: relationId,
          reason: `Phase relation ${relationId} is not in the versioned temporal relation allowlist.`,
        }));
      }
      if (duplicateRecordIds.has(relationId) || relation.truth_status !== "source_stated" || relation.review_state === "quarantined") {
        findings.push(finding({
          code: "OOPHASE_PHASE_RELATION_REVIEW_INVALID",
          occurrenceId,
          recordId: relationId,
          reason: `Phase relation ${relationId} must be unique, source_stated, and non-quarantined.`,
        }));
      }
      const exact = exactEvidence(relation.evidence_refs);
      if (hasMissingExactEvidence(relation.evidence_refs)) {
        findings.push(finding({
          code: "OOPHASE_PHASE_RELATION_EVIDENCE_MISSING",
          occurrenceId,
          recordId: relationId,
          reason: `Phase relation ${relationId} must retain an evidence_id on every canonical evidence ref.`,
        }));
      }
      phaseRelationEvidence.push(...exact);
    }
    if (!sameEvidenceBindings(phaseRelationIds, recordsById, occurrence.phase_relation_evidence_bindings)) {
      findings.push(finding({
        code: "OOPHASE_PHASE_RELATION_EVIDENCE_BINDING_MISMATCH",
        occurrenceId,
        reason: "Projected phase relation evidence bindings do not exactly match canonical relation evidence IDs.",
        relatedRecordIds: phaseRelationIds,
      }));
    }

    const occurrenceCandidates = eventEventRelations.flatMap((relation) => {
      const candidate = candidateFor({
        occurrenceId,
        relation,
        phaseIds: phaseIdSet,
        projectedRelationIds: phaseRelationIdSet,
      });
      return candidate ? [candidate] : [];
    }).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
    candidates.push(...occurrenceCandidates);
    for (const candidate of occurrenceCandidates) {
      if (candidate.primary_disposition === "review_required_unprojected_same_occurrence_temporal_relation") {
        findings.push(finding({
          code: "OOPHASE_UNPROJECTED_SAME_OCCURRENCE_TEMPORAL_RELATION",
          occurrenceId,
          recordId: candidate.relation_record_id,
          reason: "An allowlisted event-to-event temporal relation connects reviewed phases but is absent from the occurrence review.",
          relatedRecordIds: [candidate.subject_event_record_id, candidate.object_event_record_id],
        }));
      }
    }

    const rowFindings = findings.slice(rowFindingStart);
    const primaryDisposition: OperationalOccurrencePhasePrimaryDisposition = rowFindings.length > 0
      ? "review_required"
      : phaseIds.length === 1
        ? "single_observed_phase_no_related_phase_asserted"
        : "evidence_bound_related_phases";
    const dispositionStatement = primaryDisposition === "single_observed_phase_no_related_phase_asserted"
      ? "This occurrence review selects one source-stated canonical event phase and asserts no earlier/later phase relation; it does not claim that the parent project has no other phases."
      : primaryDisposition === "evidence_bound_related_phases"
        ? "This occurrence review selects multiple canonical event phases connected by exact, source-stated earlier/later relations."
        : "The occurrence phase identity or relation evidence requires explicit review before enforcement.";
    const exactPhaseEventEvidence = sortedEvidence(phaseEventEvidence);
    const exactPhaseRelationEvidence = sortedEvidence(phaseRelationEvidence);
    const candidateIds = occurrenceCandidates.map((candidate) => candidate.candidate_id).sort();
    const reviewBasisIds = uniqueSorted([
      occurrence.occurrence_review_decision_id,
      ...occurrence.provenance.anchor_review_decision_ids,
    ].filter(Boolean));
    decisions.push({
      schema_version: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_SCHEMA_VERSION,
      contract_id: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_CONTRACT_ID,
      ledger_id: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_LEDGER_ID,
      decision_id: `phase-review-v1:${occurrenceId}`,
      occurrence_id: occurrenceId,
      occurrence_review_decision_id: occurrence.occurrence_review_decision_id,
      study_projection_eligible: occurrence.study_projection_eligible,
      review_state: rowFindings.length === 0 ? "reviewed" : "review_required",
      primary_disposition: primaryDisposition,
      disposition_statement: dispositionStatement,
      phase_record_ids: phaseIds,
      phase_relation_record_ids: phaseRelationIds,
      phase_event_evidence_refs: exactPhaseEventEvidence,
      phase_relation_evidence_refs: exactPhaseRelationEvidence,
      phase_event_evidence_sha256: stableHash(exactPhaseEventEvidence as unknown as JsonValue),
      phase_relation_evidence_sha256: stableHash(exactPhaseRelationEvidence as unknown as JsonValue),
      checked_event_event_candidate_ids: candidateIds,
      checked_event_event_candidates_sha256: stableHash(candidateIds as unknown as JsonValue),
      review_basis_ids: reviewBasisIds,
      reviewed_at: OPERATIONAL_OCCURRENCE_PHASE_REVIEWED_AT,
      reviewed_by: OPERATIONAL_OCCURRENCE_PHASE_REVIEWED_BY,
      no_external_phase_inference: true,
      warning_codes: uniqueSorted(rowFindings.map((entry) => entry.code)) as OperationalOccurrencePhaseFindingCode[],
    });
  }

  decisions.sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));
  candidates.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  findings.sort((left, right) =>
    [left.occurrence_id ?? "", left.code, left.record_id ?? ""].join("|")
      .localeCompare([right.occurrence_id ?? "", right.code, right.record_id ?? ""].join("|")));

  const primaryDispositionKeys: OperationalOccurrencePhasePrimaryDisposition[] = [
    "single_observed_phase_no_related_phase_asserted",
    "evidence_bound_related_phases",
    "review_required",
  ];
  const candidateDispositionKeys: OperationalOccurrencePhaseCandidateDisposition[] = [
    "projected_reviewed_phase_relation",
    "not_projected_external_event_not_selected",
    "not_projected_non_phase_semantics",
    "review_required_unprojected_same_occurrence_temporal_relation",
  ];
  const findingCounts = Object.fromEntries(uniqueSorted(findings.map((entry) => entry.code)).map((code) => [
    code,
    findings.filter((entry) => entry.code === code).length,
  ])) as Partial<Record<OperationalOccurrencePhaseFindingCode, number>>;
  const phaseIdentityComplete = findings.every((entry) => ![
    "OOPHASE_PHASE_IDENTITY_MISSING",
    "OOPHASE_PHASE_IDENTITY_DUPLICATE",
    "OOPHASE_PHASE_EVENT_MISSING",
    "OOPHASE_PHASE_EVENT_TYPE_INVALID",
    "OOPHASE_PHASE_EVENT_REVIEW_INVALID",
  ].includes(entry.code));
  const phaseRelationOrDispositionComplete = findings.every((entry) => ![
    "OOPHASE_PHASE_DISPOSITION_INVALID",
    "OOPHASE_PHASE_RELATION_UNEXPECTED_FOR_SINGLE_PHASE",
    "OOPHASE_PHASE_RELATION_MISSING_FOR_RELATED_PHASES",
    "OOPHASE_PHASE_RELATION_DUPLICATE",
    "OOPHASE_PHASE_RELATION_MISSING",
    "OOPHASE_PHASE_RELATION_TYPE_INVALID",
    "OOPHASE_PHASE_RELATION_ENDPOINT_INVALID",
    "OOPHASE_PHASE_RELATION_SEMANTICS_INVALID",
    "OOPHASE_PHASE_RELATION_REVIEW_INVALID",
    "OOPHASE_UNPROJECTED_SAME_OCCURRENCE_TEMPORAL_RELATION",
  ].includes(entry.code));
  const exactEvidenceComplete = findings.every((entry) => ![
    "OOPHASE_PHASE_EVENT_EVIDENCE_MISSING",
    "OOPHASE_PHASE_RELATION_EVIDENCE_MISSING",
    "OOPHASE_PHASE_RELATION_EVIDENCE_BINDING_MISMATCH",
  ].includes(entry.code));
  const summary: OperationalOccurrencePhaseReviewSummary = {
    schema_version: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_SCHEMA_VERSION,
    contract_id: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_CONTRACT_ID,
    occurrence_count: decisions.length,
    eligible_occurrence_count: decisions.filter((entry) => entry.study_projection_eligible).length,
    ineligible_occurrence_count: decisions.filter((entry) => !entry.study_projection_eligible).length,
    phase_identity_membership_count: decisions.reduce((count, entry) => count + entry.phase_record_ids.length, 0),
    unique_phase_event_count: new Set(decisions.flatMap((entry) => entry.phase_record_ids)).size,
    projected_phase_relation_count: new Set(decisions.flatMap((entry) => entry.phase_relation_record_ids)).size,
    checked_event_event_candidate_count: candidates.length,
    counts_by_primary_disposition: countValues(
      decisions.map((entry) => entry.primary_disposition),
      primaryDispositionKeys,
    ),
    counts_by_candidate_disposition: countValues(
      candidates.map((entry) => entry.primary_disposition),
      candidateDispositionKeys,
    ),
    finding_counts: findingCounts,
    phase_identity_complete: phaseIdentityComplete,
    phase_relation_or_disposition_complete: phaseRelationOrDispositionComplete,
    exact_evidence_complete: exactEvidenceComplete,
    hard_mode_ready:
      findings.length === 0 && phaseIdentityComplete && phaseRelationOrDispositionComplete && exactEvidenceComplete,
  };

  return { decisions, candidates, findings, summary };
}
