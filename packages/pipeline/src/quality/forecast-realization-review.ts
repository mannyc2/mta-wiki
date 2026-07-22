import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import type {
  ForecastRealizationTarget,
  ForecastRealizationTargetList,
} from "@mta-wiki/pipeline/quality/forecast-realization-frontier";

export const FORECAST_REALIZATION_REVIEW_SCHEMA_VERSION = 1 as const;
export const FORECAST_REALIZATION_REVIEW_OVERLAY_ID = "forecast-realization-reviewed-overlay-v1" as const;

export const FORECAST_REALIZATION_REVIEW_DISPOSITIONS = [
  "exact_realization",
  "later_plan_replacement",
  "reviewed_nonmatch",
  "still_open",
] as const;
export type ForecastRealizationReviewDisposition =
  (typeof FORECAST_REALIZATION_REVIEW_DISPOSITIONS)[number];

export type ForecastRealizationCandidateReviewDisposition = Exclude<
  ForecastRealizationReviewDisposition,
  "still_open"
>;

export type ForecastRealizationReviewEvidenceBinding = {
  record_id: string;
  source_id: string;
  evidence_id: string;
  text_sha256: string;
  role: "realized_event" | "replacement_evidence";
};

export type ForecastRealizationCandidateReview = {
  candidate_event_record_ids: string[];
  disposition: ForecastRealizationCandidateReviewDisposition;
  rationale: string;
};

export type ForecastRealizationReviewDecision = {
  schema_version: typeof FORECAST_REALIZATION_REVIEW_SCHEMA_VERSION;
  overlay_id: typeof FORECAST_REALIZATION_REVIEW_OVERLAY_ID;
  batch_id: string;
  decision_id: string;
  reviewed_at: string;
  reviewer: string;
  frontier_artifact_fingerprint: string;
  target_id: string;
  forecast_event_record_id: string;
  target_basis_fingerprint: string;
  candidate_set_fingerprint: string;
  disposition: ForecastRealizationReviewDisposition;
  candidate_reviews: ForecastRealizationCandidateReview[];
  bound_realized_event_id: string | null;
  evidence_bindings: ForecastRealizationReviewEvidenceBinding[];
  rationale: string;
  authorizes_study: false;
  authorizes_cross_product: false;
};

export type ForecastRealizationReviewSummary = {
  candidate_bearing_target_denominator: number;
  reviewed_target_count: number;
  reviewed_candidate_pair_count: number;
  missing_target_ids: string[];
  open_follow_up_target_ids: string[];
  counts_by_disposition: Record<ForecastRealizationReviewDisposition, number>;
};

export type ForecastRealizationReviewedOverlay = {
  schema_version: typeof FORECAST_REALIZATION_REVIEW_SCHEMA_VERSION;
  overlay_id: typeof FORECAST_REALIZATION_REVIEW_OVERLAY_ID;
  batch_ids: string[];
  frontier_artifact_fingerprint: string;
  frontier_as_of: string;
  frontier_grace_days: number;
  authorizes_study: false;
  authorizes_cross_product: false;
  policy: "reviewed_overlay_only_never_mutates_forecasts_occurrences_or_study_authority";
  summary: ForecastRealizationReviewSummary;
  decisions: ForecastRealizationReviewDecision[];
};

const decisionFields = new Set([
  "authorizes_cross_product",
  "authorizes_study",
  "batch_id",
  "bound_realized_event_id",
  "candidate_reviews",
  "candidate_set_fingerprint",
  "decision_id",
  "disposition",
  "evidence_bindings",
  "forecast_event_record_id",
  "frontier_artifact_fingerprint",
  "overlay_id",
  "rationale",
  "reviewed_at",
  "reviewer",
  "schema_version",
  "target_basis_fingerprint",
  "target_id",
]);
const candidateReviewFields = new Set(["candidate_event_record_ids", "disposition", "rationale"]);
const evidenceBindingFields = new Set(["evidence_id", "record_id", "role", "source_id", "text_sha256"]);
const reviewDispositions = new Set<string>(FORECAST_REALIZATION_REVIEW_DISPOSITIONS);
const candidateReviewDispositions = new Set<string>([
  "exact_realization",
  "later_plan_replacement",
  "reviewed_nonmatch",
]);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value: unknown): string {
  return sha256(stableJson(value as JsonValue));
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, fields: ReadonlySet<string>, path: string): void {
  const extra = Object.keys(value).filter((field) => !fields.has(field)).sort();
  if (extra.length > 0) throw new Error(`${path}: unknown field(s): ${extra.join(", ")}`);
  const missing = [...fields].filter((field) => !(field in value)).sort();
  if (missing.length > 0) throw new Error(`${path}: missing field(s): ${missing.join(", ")}`);
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function sha(value: unknown, path: string): string {
  const parsed = string(value, path);
  if (!/^[a-f0-9]{64}$/u.test(parsed)) throw new Error(`${path} must be a lowercase SHA-256 hex digest`);
  return parsed;
}

function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path} must be a non-empty array`);
  const parsed = value.map((entry, index) => string(entry, `${path}[${index}]`));
  if (new Set(parsed).size !== parsed.length) throw new Error(`${path} must not contain duplicates`);
  return parsed;
}

function disposition(value: unknown, path: string): ForecastRealizationReviewDisposition {
  const parsed = string(value, path);
  if (!reviewDispositions.has(parsed)) throw new Error(`${path} is unsupported: ${parsed}`);
  return parsed as ForecastRealizationReviewDisposition;
}

function candidateDisposition(value: unknown, path: string): ForecastRealizationCandidateReviewDisposition {
  const parsed = string(value, path);
  if (!candidateReviewDispositions.has(parsed)) throw new Error(`${path} is unsupported: ${parsed}`);
  return parsed as ForecastRealizationCandidateReviewDisposition;
}

function candidateReviews(value: unknown, path: string): ForecastRealizationCandidateReview[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path} must be a non-empty array`);
  return value.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const parsed = object(entry, entryPath);
    exactKeys(parsed, candidateReviewFields, entryPath);
    return {
      candidate_event_record_ids: strings(parsed.candidate_event_record_ids, `${entryPath}.candidate_event_record_ids`),
      disposition: candidateDisposition(parsed.disposition, `${entryPath}.disposition`),
      rationale: string(parsed.rationale, `${entryPath}.rationale`),
    };
  });
}

function evidenceBindings(value: unknown, path: string): ForecastRealizationReviewEvidenceBinding[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const parsed = object(entry, entryPath);
    exactKeys(parsed, evidenceBindingFields, entryPath);
    const role = string(parsed.role, `${entryPath}.role`);
    if (role !== "realized_event" && role !== "replacement_evidence") {
      throw new Error(`${entryPath}.role is unsupported: ${role}`);
    }
    return {
      record_id: string(parsed.record_id, `${entryPath}.record_id`),
      source_id: string(parsed.source_id, `${entryPath}.source_id`),
      evidence_id: string(parsed.evidence_id, `${entryPath}.evidence_id`),
      text_sha256: string(parsed.text_sha256, `${entryPath}.text_sha256`),
      role,
    };
  });
}

export function parseForecastRealizationReviewDecision(
  value: unknown,
  path = "forecast realization review decision",
): ForecastRealizationReviewDecision {
  const parsed = object(value, path);
  exactKeys(parsed, decisionFields, path);
  if (parsed.schema_version !== FORECAST_REALIZATION_REVIEW_SCHEMA_VERSION) {
    throw new Error(`${path}.schema_version must be ${FORECAST_REALIZATION_REVIEW_SCHEMA_VERSION}`);
  }
  if (parsed.overlay_id !== FORECAST_REALIZATION_REVIEW_OVERLAY_ID) {
    throw new Error(`${path}.overlay_id must be ${FORECAST_REALIZATION_REVIEW_OVERLAY_ID}`);
  }
  if (parsed.authorizes_study !== false || parsed.authorizes_cross_product !== false) {
    throw new Error(`${path} must set authorizes_study=false and authorizes_cross_product=false`);
  }
  const reviewedAt = string(parsed.reviewed_at, `${path}.reviewed_at`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(reviewedAt) || Number.isNaN(Date.parse(`${reviewedAt}T00:00:00Z`))) {
    throw new Error(`${path}.reviewed_at must be an ISO day`);
  }
  const bound = parsed.bound_realized_event_id === null
    ? null
    : string(parsed.bound_realized_event_id, `${path}.bound_realized_event_id`);
  return {
    schema_version: FORECAST_REALIZATION_REVIEW_SCHEMA_VERSION,
    overlay_id: FORECAST_REALIZATION_REVIEW_OVERLAY_ID,
    batch_id: string(parsed.batch_id, `${path}.batch_id`),
    decision_id: string(parsed.decision_id, `${path}.decision_id`),
    reviewed_at: reviewedAt,
    reviewer: string(parsed.reviewer, `${path}.reviewer`),
    frontier_artifact_fingerprint: sha(
      parsed.frontier_artifact_fingerprint,
      `${path}.frontier_artifact_fingerprint`,
    ),
    target_id: string(parsed.target_id, `${path}.target_id`),
    forecast_event_record_id: string(parsed.forecast_event_record_id, `${path}.forecast_event_record_id`),
    target_basis_fingerprint: sha(parsed.target_basis_fingerprint, `${path}.target_basis_fingerprint`),
    candidate_set_fingerprint: sha(parsed.candidate_set_fingerprint, `${path}.candidate_set_fingerprint`),
    disposition: disposition(parsed.disposition, `${path}.disposition`),
    candidate_reviews: candidateReviews(parsed.candidate_reviews, `${path}.candidate_reviews`),
    bound_realized_event_id: bound,
    evidence_bindings: evidenceBindings(parsed.evidence_bindings, `${path}.evidence_bindings`),
    rationale: string(parsed.rationale, `${path}.rationale`),
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

export function forecastCandidateSetFingerprint(target: ForecastRealizationTarget): string {
  return fingerprint(target.realized_candidates.map((candidate) => ({
    event_record_id: candidate.event_record_id,
    evidence_fingerprint: candidate.evidence_fingerprint,
  })));
}

function emptyDispositionCounts(): Record<ForecastRealizationReviewDisposition, number> {
  return {
    exact_realization: 0,
    later_plan_replacement: 0,
    reviewed_nonmatch: 0,
    still_open: 0,
  };
}

function assertBinding(
  binding: ForecastRealizationReviewEvidenceBinding,
  boundEventId: string,
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  path: string,
): void {
  if (binding.record_id !== boundEventId) {
    throw new Error(`${path}.record_id must equal bound_realized_event_id ${boundEventId}`);
  }
  const record = recordsById.get(binding.record_id);
  if (!record || record.record_kind !== "event") throw new Error(`${path}.record_id is not a canonical event`);
  const found = record.evidence_refs.some((ref) =>
    ref.source_id === binding.source_id &&
    ref.evidence_id === binding.evidence_id &&
    ref.text_sha256 === binding.text_sha256
  );
  if (!found) throw new Error(`${path} does not match exact canonical evidence`);
}

function assertDecision(
  decision: ForecastRealizationReviewDecision,
  target: ForecastRealizationTarget,
  targetList: ForecastRealizationTargetList,
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  path: string,
): void {
  if (decision.frontier_artifact_fingerprint !== targetList.artifact_fingerprint) {
    throw new Error(`${path}.frontier_artifact_fingerprint is stale`);
  }
  if (decision.forecast_event_record_id !== target.forecast_event_record_id) {
    throw new Error(`${path}.forecast_event_record_id does not match ${target.target_id}`);
  }
  if (decision.target_basis_fingerprint !== target.basis_fingerprint) {
    throw new Error(`${path}.target_basis_fingerprint is stale`);
  }
  if (decision.candidate_set_fingerprint !== forecastCandidateSetFingerprint(target)) {
    throw new Error(`${path}.candidate_set_fingerprint is stale`);
  }
  const reviewedCandidateIds = decision.candidate_reviews.flatMap((review) => review.candidate_event_record_ids);
  if (new Set(reviewedCandidateIds).size !== reviewedCandidateIds.length) {
    throw new Error(`${path}.candidate_reviews repeat a candidate event`);
  }
  const expectedCandidateIds = target.realized_candidates.map((candidate) => candidate.event_record_id).sort();
  if (stableJson([...reviewedCandidateIds].sort() as unknown as JsonValue) !== stableJson(expectedCandidateIds as unknown as JsonValue)) {
    throw new Error(`${path}.candidate_reviews must cover the exact candidate denominator`);
  }
  const affirmative = decision.candidate_reviews.filter((review) => review.disposition !== "reviewed_nonmatch");
  if (decision.disposition === "exact_realization" || decision.disposition === "later_plan_replacement") {
    if (affirmative.length !== 1 || affirmative[0]!.disposition !== decision.disposition) {
      throw new Error(`${path} must contain one candidate review matching disposition ${decision.disposition}`);
    }
    if (affirmative[0]!.candidate_event_record_ids.length !== 1) {
      throw new Error(`${path} affirmative candidate review must identify exactly one candidate event`);
    }
    if (!decision.bound_realized_event_id || !affirmative[0]!.candidate_event_record_ids.includes(decision.bound_realized_event_id)) {
      throw new Error(`${path}.bound_realized_event_id must be in the affirmative candidate review`);
    }
    if (decision.evidence_bindings.length === 0) throw new Error(`${path}.evidence_bindings must not be empty`);
    const expectedRole = decision.disposition === "exact_realization" ? "realized_event" : "replacement_evidence";
    decision.evidence_bindings.forEach((binding, index) => {
      if (binding.role !== expectedRole) throw new Error(`${path}.evidence_bindings[${index}].role must be ${expectedRole}`);
      assertBinding(binding, decision.bound_realized_event_id!, recordsById, `${path}.evidence_bindings[${index}]`);
    });
  } else {
    if (affirmative.length > 0) throw new Error(`${path} negative/open disposition cannot contain an affirmative review`);
    if (decision.bound_realized_event_id !== null || decision.evidence_bindings.length > 0) {
      throw new Error(`${path} negative/open disposition cannot bind a realized event`);
    }
  }
}

export function buildForecastRealizationReviewedOverlay(input: {
  targetList: ForecastRealizationTargetList;
  decisions: readonly ForecastRealizationReviewDecision[];
  records: readonly MtaCanonicalRecord[];
}): ForecastRealizationReviewedOverlay {
  const targets = input.targetList.targets.filter((target) => target.realized_candidates.length > 0);
  const targetById = new Map(targets.map((target) => [target.target_id, target]));
  const recordsById = new Map(input.records.map((record) => [record.record_id, record]));
  const decisions = [...input.decisions].sort((left, right) => left.target_id.localeCompare(right.target_id));
  const decisionIds = new Set<string>();
  const reviewedTargets = new Set<string>();
  const counts = emptyDispositionCounts();
  let reviewedCandidatePairCount = 0;
  for (const [index, decision] of decisions.entries()) {
    const path = `review decision[${index}]`;
    if (decisionIds.has(decision.decision_id)) throw new Error(`${path}.decision_id is duplicated`);
    decisionIds.add(decision.decision_id);
    if (reviewedTargets.has(decision.target_id)) throw new Error(`${path}.target_id has multiple active decisions`);
    reviewedTargets.add(decision.target_id);
    const target = targetById.get(decision.target_id);
    if (!target) throw new Error(`${path}.target_id is not a candidate-bearing frontier target`);
    assertDecision(decision, target, input.targetList, recordsById, path);
    counts[decision.disposition] += 1;
    reviewedCandidatePairCount += decision.candidate_reviews.reduce(
      (sum, review) => sum + review.candidate_event_record_ids.length,
      0,
    );
  }
  const missingTargetIds = targets
    .map((target) => target.target_id)
    .filter((targetId) => !reviewedTargets.has(targetId))
    .sort();
  const openFollowUpTargetIds = decisions
    .filter((decision) => decision.disposition === "reviewed_nonmatch" || decision.disposition === "still_open")
    .map((decision) => decision.target_id)
    .sort();
  return {
    schema_version: FORECAST_REALIZATION_REVIEW_SCHEMA_VERSION,
    overlay_id: FORECAST_REALIZATION_REVIEW_OVERLAY_ID,
    batch_ids: [...new Set(decisions.map((decision) => decision.batch_id))].sort(),
    frontier_artifact_fingerprint: input.targetList.artifact_fingerprint,
    frontier_as_of: input.targetList.as_of,
    frontier_grace_days: input.targetList.grace_days,
    authorizes_study: false,
    authorizes_cross_product: false,
    policy: "reviewed_overlay_only_never_mutates_forecasts_occurrences_or_study_authority",
    summary: {
      candidate_bearing_target_denominator: targets.length,
      reviewed_target_count: decisions.length,
      reviewed_candidate_pair_count: reviewedCandidatePairCount,
      missing_target_ids: missingTargetIds,
      open_follow_up_target_ids: openFollowUpTargetIds,
      counts_by_disposition: counts,
    },
    decisions,
  };
}
