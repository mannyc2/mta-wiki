import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import type {
  JsonObject,
  JsonValue,
  MtaCanonicalRecord,
  MtaObservationKind,
  MtaSubmissionEntry,
  MtaSubmitObservationInput,
  MtaValidationIssue,
  StagedSourceBlock,
} from "@mta-wiki/db/types";
import { canonicalRecordIdForInput, isGlobalRecordKind, recordBaseIdForInput } from "@mta-wiki/db/identity";
import { stableHash, stableJson } from "@mta-wiki/db/stable-json";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import { relationEndpointShapeIssue } from "@mta-wiki/pipeline/records/relations";
import {
  createSubmissionEntry,
  quoteIsInBlock,
  relationEndpointIssues,
} from "@mta-wiki/pipeline/records/submissions";
import { evidenceId } from "@mta-wiki/pipeline/sources/source-prep";
import { loadOperationalCoverageArtifacts } from "@mta-wiki/pipeline/quality/operational-coverage-artifacts";
import {
  evidenceBlockIndexEntry,
  readEvidenceBlockIndex,
  type EvidenceBlockIndex,
} from "@mta-wiki/pipeline/sources/evidence-block-index";

/**
 * Owner-reviewed recovery proposal contract.
 *
 * Pending proposals live in `proposed/relations/` or `proposed/observations/`.
 * Review changes only the explicit review fields. Apply converts the accepted
 * semantic content without edits, writes a new append-only submission journal,
 * materializes, and then moves the unchanged proposal under `proposed/applied/`.
 * Rejections move under `proposed/rejected/` with a reason. No proposal may be
 * applied against a different corpus fingerprint.
 */
export const OPERATIONAL_RECOVERY_PROPOSAL_SCHEMA_VERSION = 1 as const;

export type OperationalRecoveryProposalKind = "relation" | "observation_bundle";
export type OperationalRecoveryProposalReviewState = "proposed" | "accepted" | "rejected";
export type OperationalRecoveryProposalStage = "pending" | "resuming" | "applied" | "rejected";

export type OperationalRecoveryVerifier = {
  reviewed_by: string;
  reviewed_at: string;
  verdict: "passed" | "refuted";
  rationale: string;
};

export type OperationalRecoveryProposalProvenance = {
  drafted_by: string;
  drafted_at: string;
  method: string;
  verifier?: OperationalRecoveryVerifier | undefined;
};

export type OperationalRecoveryEvidenceBinding = {
  role: string;
  source_id: string;
  evidence_id: string;
  block_id: string;
  source_quote: string;
};

export type OperationalRecoveryCanonicalEvidenceBinding = OperationalRecoveryEvidenceBinding & {
  record_id: string;
};

export type OperationalRecoveryRelation = {
  relation_kind: "has_timeline_event" | "has_treatment" | "affects_route" | "serves_route";
  subject_record_id: string;
  object_record_id: string;
  assertion_status: "delivered" | "planned" | "proposed" | "in_progress" | "deferred" | "cancelled" | "unknown";
  as_of_date: string;
  description?: string | undefined;
};

export type OperationalRecoveryObservation = {
  expected_record_id: string;
  target_record_id?: string | undefined;
  observation_kind: Exclude<MtaObservationKind, "source" | "table" | "relation">;
  local_observation_id: string;
  label: string;
  raw_text?: string | undefined;
  payload: JsonObject;
  evidence_bindings: OperationalRecoveryEvidenceBinding[];
};

export type OperationalRecoveryEndpoint =
  | { record_id: string }
  | { local_observation_id: string };

export type OperationalRecoveryBundleRelation = {
  local_observation_id: string;
  label: string;
  relation_kind: OperationalRecoveryRelation["relation_kind"];
  subject: OperationalRecoveryEndpoint;
  object: OperationalRecoveryEndpoint;
  assertion_status: OperationalRecoveryRelation["assertion_status"];
  as_of_date: string;
  description?: string | undefined;
  evidence_bindings: OperationalRecoveryEvidenceBinding[];
};

type OperationalRecoveryProposalBase = {
  artifact_path?: string | undefined;
  schema_version: typeof OPERATIONAL_RECOVERY_PROPOSAL_SCHEMA_VERSION;
  proposal_id: string;
  proposal_kind: OperationalRecoveryProposalKind;
  corpus_fingerprint: string;
  gap_ids: string[];
  source_id: string;
  review_state: OperationalRecoveryProposalReviewState;
  accepted_by?: string | undefined;
  accepted_at?: string | undefined;
  rejected_by?: string | undefined;
  rejected_at?: string | undefined;
  rejection_reason?: string | undefined;
  provenance: OperationalRecoveryProposalProvenance;
  rationale: string;
};

export type OperationalRecoveryRelationProposal = OperationalRecoveryProposalBase & {
  proposal_kind: "relation";
  proposed_relation: OperationalRecoveryRelation;
  evidence_bindings: OperationalRecoveryCanonicalEvidenceBinding[];
};

export type OperationalRecoveryObservationBundleProposal = OperationalRecoveryProposalBase & {
  proposal_kind: "observation_bundle";
  observations: OperationalRecoveryObservation[];
  relations: OperationalRecoveryBundleRelation[];
};

export type OperationalRecoveryProposal =
  | OperationalRecoveryRelationProposal
  | OperationalRecoveryObservationBundleProposal;

export type OperationalRecoveryResolvedBlock = {
  source_id: string;
  block_id: string;
  raw_text?: string | undefined;
  raw_text_sha256?: string | undefined;
};

export type OperationalRecoveryProposalValidationContext = {
  records: readonly MtaCanonicalRecord[];
  stage: OperationalRecoveryProposalStage;
  current_corpus_fingerprint?: string | undefined;
  known_gap_ids?: ReadonlySet<string> | undefined;
  resolve_block: (sourceId: string, blockId: string) => OperationalRecoveryResolvedBlock | undefined;
};

export type OperationalRecoveryProposalArtifact = {
  path: string;
  stage: OperationalRecoveryProposalStage;
  proposal: OperationalRecoveryProposal;
};

export type OperationalRecoveryEntryFactory = (
  runId: string,
  input: MtaSubmitObservationInput,
  submittedAt: string,
  additionalIssues: string[],
) => MtaSubmissionEntry;

export type OperationalRecoverySubmissionBatch = {
  run_id: string;
  proposal_sha256: string;
  journal_content: string;
  entries: MtaSubmissionEntry[];
};

export type OperationalRecoveryProposalValidationReport = {
  proposals: OperationalRecoveryProposalArtifact[];
  issues: MtaValidationIssue[];
};

const proposalKinds = new Set<OperationalRecoveryProposalKind>(["relation", "observation_bundle"]);
const reviewStates = new Set<OperationalRecoveryProposalReviewState>(["proposed", "accepted", "rejected"]);
const relationKinds = new Set<OperationalRecoveryRelation["relation_kind"]>([
  "has_timeline_event",
  "has_treatment",
  "affects_route",
  "serves_route",
]);
const assertionStatuses = new Set<OperationalRecoveryRelation["assertion_status"]>([
  "delivered",
  "planned",
  "proposed",
  "in_progress",
  "deferred",
  "cancelled",
  "unknown",
]);
const observationKinds = new Set<OperationalRecoveryObservation["observation_kind"]>([
  "entity",
  "project",
  "corridor",
  "route",
  "treatment_component",
  "event",
  "claim",
  "metric_claim",
  "source_gap",
]);

const commonFields = new Set([
  "schema_version",
  "proposal_id",
  "proposal_kind",
  "corpus_fingerprint",
  "gap_ids",
  "source_id",
  "review_state",
  "accepted_by",
  "accepted_at",
  "rejected_by",
  "rejected_at",
  "rejection_reason",
  "provenance",
  "rationale",
]);
const relationProposalFields = new Set([...commonFields, "proposed_relation", "evidence_bindings"]);
const observationProposalFields = new Set([...commonFields, "observations", "relations"]);
const provenanceFields = new Set(["drafted_by", "drafted_at", "method", "verifier"]);
const verifierFields = new Set(["reviewed_by", "reviewed_at", "verdict", "rationale"]);
const evidenceFields = new Set(["role", "source_id", "evidence_id", "block_id", "source_quote"]);
const canonicalEvidenceFields = new Set([...evidenceFields, "record_id"]);
const proposedRelationFields = new Set([
  "relation_kind",
  "subject_record_id",
  "object_record_id",
  "assertion_status",
  "as_of_date",
  "description",
]);
const observationFields = new Set([
  "expected_record_id",
  "target_record_id",
  "observation_kind",
  "local_observation_id",
  "label",
  "raw_text",
  "payload",
  "evidence_bindings",
]);
const bundleRelationFields = new Set([
  "local_observation_id",
  "label",
  "relation_kind",
  "subject",
  "object",
  "assertion_status",
  "as_of_date",
  "description",
  "evidence_bindings",
]);
const endpointFields = new Set(["record_id", "local_observation_id"]);

function safeRunPart(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "");
  if (!normalized) throw new Error(`Cannot derive recovery run id from ${value}`);
  return normalized.slice(0, 100);
}

export function operationalRecoveryProposalHash(proposal: OperationalRecoveryProposal): string {
  const value = structuredClone(proposal) as OperationalRecoveryProposal & { artifact_path?: string | undefined };
  delete value.artifact_path;
  return `sha256:${stableHash(value as unknown as JsonValue)}`;
}

export function operationalRecoveryRunId(proposal: OperationalRecoveryProposal): string {
  if (proposal.review_state !== "accepted" || !proposal.accepted_at) {
    throw new Error(`Proposal ${proposal.proposal_id} is not accepted`);
  }
  const timestamp = proposal.accepted_at.replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  return `${timestamp}_recovery_${safeRunPart(proposal.source_id)}_${safeRunPart(proposal.proposal_id)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(object: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): void {
  const unknown = Object.keys(object).filter((field) => !allowed.has(field)).sort();
  if (unknown.length > 0) throw new Error(`${path}: unknown field(s): ${unknown.join(", ")}`);
}

function requiredObject(value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${path} must be an object`);
  return value;
}

function requiredString(object: Record<string, unknown>, field: string, path: string): string {
  const value = object[field];
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`${path}: ${field} must be a non-empty string`);
}

function optionalString(object: Record<string, unknown>, field: string, path: string): string | undefined {
  const value = object[field];
  if (value === undefined) return undefined;
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`${path}: ${field} must be a non-empty string when present`);
}

function isoTimestamp(value: string, path: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${path} must be an ISO-8601 UTC timestamp`);
  }
  return value;
}

function asOfDate(value: string, path: string): string {
  if (!/^\d{4}-\d{2}(?:-\d{2})?$/u.test(value)) {
    throw new Error(`${path} must be YYYY-MM or YYYY-MM-DD`);
  }
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (month < 1 || month > 12) throw new Error(`${path} is not a valid date`);
  if (dayText !== undefined) {
    const day = Number(dayText);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      throw new Error(`${path} is not a valid date`);
    }
  }
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${path} must be a non-empty array of non-empty strings`);
  }
  const normalized = value.map((item) => (item as string).trim());
  if (new Set(normalized).size !== normalized.length) throw new Error(`${path} contains duplicate values`);
  return normalized;
}

function parseVerifier(value: unknown, path: string): OperationalRecoveryVerifier | undefined {
  if (value === undefined) return undefined;
  const object = requiredObject(value, path);
  rejectUnknownFields(object, verifierFields, path);
  const verdict = requiredString(object, "verdict", path);
  if (verdict !== "passed" && verdict !== "refuted") throw new Error(`${path}: verdict must be passed or refuted`);
  return {
    reviewed_by: requiredString(object, "reviewed_by", path),
    reviewed_at: isoTimestamp(requiredString(object, "reviewed_at", path), `${path}.reviewed_at`),
    verdict,
    rationale: requiredString(object, "rationale", path),
  };
}

function parseProvenance(value: unknown, path: string): OperationalRecoveryProposalProvenance {
  const object = requiredObject(value, path);
  rejectUnknownFields(object, provenanceFields, path);
  return {
    drafted_by: requiredString(object, "drafted_by", path),
    drafted_at: isoTimestamp(requiredString(object, "drafted_at", path), `${path}.drafted_at`),
    method: requiredString(object, "method", path),
    ...(object.verifier === undefined ? {} : { verifier: parseVerifier(object.verifier, `${path}.verifier`) }),
  };
}

function parseEvidenceBinding(value: unknown, sourceId: string, path: string): OperationalRecoveryEvidenceBinding {
  const object = requiredObject(value, path);
  rejectUnknownFields(object, evidenceFields, path);
  const bindingSourceId = requiredString(object, "source_id", path);
  if (bindingSourceId !== sourceId) throw new Error(`${path}: source_id must equal proposal source_id ${sourceId}`);
  const sourceQuote = requiredString(object, "source_quote", path).replace(/\s+/gu, " ").trim();
  if (sourceQuote.length > 280) throw new Error(`${path}: source_quote must be 280 characters or fewer`);
  return {
    role: requiredString(object, "role", path),
    source_id: bindingSourceId,
    evidence_id: requiredString(object, "evidence_id", path),
    block_id: requiredString(object, "block_id", path),
    source_quote: sourceQuote,
  };
}

function parseEvidenceBindings(value: unknown, sourceId: string, path: string): OperationalRecoveryEvidenceBinding[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path} must be a non-empty array`);
  const bindings = value.map((binding, index) => parseEvidenceBinding(binding, sourceId, `${path}[${index}]`));
  const keys = bindings.map((binding) => `${binding.role}|${binding.source_id}|${binding.block_id}|${binding.source_quote}`);
  if (new Set(keys).size !== keys.length) throw new Error(`${path} contains a duplicate evidence binding`);
  return bindings;
}

function parseCanonicalEvidenceBindings(
  value: unknown,
  sourceId: string,
  path: string,
): OperationalRecoveryCanonicalEvidenceBinding[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path} must be a non-empty array`);
  const bindings = value.map((binding, index) => {
    const bindingPath = `${path}[${index}]`;
    const object = requiredObject(binding, bindingPath);
    rejectUnknownFields(object, canonicalEvidenceFields, bindingPath);
    return {
      ...parseEvidenceBinding(
        Object.fromEntries(Object.entries(object).filter(([field]) => field !== "record_id")),
        sourceId,
        bindingPath,
      ),
      record_id: requiredString(object, "record_id", bindingPath),
    };
  });
  const keys = bindings.map(
    (binding) => `${binding.role}|${binding.record_id}|${binding.source_id}|${binding.block_id}|${binding.source_quote}`,
  );
  if (new Set(keys).size !== keys.length) throw new Error(`${path} contains a duplicate evidence binding`);
  return bindings;
}

function parseRelationFields(value: unknown, path: string): Omit<OperationalRecoveryRelation, "subject_record_id" | "object_record_id"> {
  const object = requiredObject(value, path);
  const relationKind = requiredString(object, "relation_kind", path);
  if (!relationKinds.has(relationKind as OperationalRecoveryRelation["relation_kind"])) {
    throw new Error(`${path}: unsupported relation_kind ${relationKind}`);
  }
  const assertionStatus = requiredString(object, "assertion_status", path);
  if (!assertionStatuses.has(assertionStatus as OperationalRecoveryRelation["assertion_status"])) {
    throw new Error(`${path}: unsupported assertion_status ${assertionStatus}`);
  }
  return {
    relation_kind: relationKind as OperationalRecoveryRelation["relation_kind"],
    assertion_status: assertionStatus as OperationalRecoveryRelation["assertion_status"],
    as_of_date: asOfDate(requiredString(object, "as_of_date", path), `${path}.as_of_date`),
    ...(object.description === undefined ? {} : { description: optionalString(object, "description", path) }),
  };
}

function parseProposedRelation(value: unknown, path: string): OperationalRecoveryRelation {
  const object = requiredObject(value, path);
  rejectUnknownFields(object, proposedRelationFields, path);
  return {
    ...parseRelationFields(object, path),
    subject_record_id: requiredString(object, "subject_record_id", path),
    object_record_id: requiredString(object, "object_record_id", path),
  };
}

function parseEndpoint(value: unknown, path: string): OperationalRecoveryEndpoint {
  const object = requiredObject(value, path);
  rejectUnknownFields(object, endpointFields, path);
  const recordId = optionalString(object, "record_id", path);
  const localObservationId = optionalString(object, "local_observation_id", path);
  if ((recordId ? 1 : 0) + (localObservationId ? 1 : 0) !== 1) {
    throw new Error(`${path} must contain exactly one of record_id or local_observation_id`);
  }
  return recordId ? { record_id: recordId } : { local_observation_id: localObservationId! };
}

function parseObservation(value: unknown, sourceId: string, path: string): OperationalRecoveryObservation {
  const object = requiredObject(value, path);
  rejectUnknownFields(object, observationFields, path);
  const observationKind = requiredString(object, "observation_kind", path);
  if (!observationKinds.has(observationKind as OperationalRecoveryObservation["observation_kind"])) {
    throw new Error(`${path}: unsupported observation_kind ${observationKind}`);
  }
  const payload = requiredObject(object.payload, `${path}.payload`) as JsonObject;
  return {
    expected_record_id: requiredString(object, "expected_record_id", path),
    ...(object.target_record_id === undefined ? {} : { target_record_id: optionalString(object, "target_record_id", path) }),
    observation_kind: observationKind as OperationalRecoveryObservation["observation_kind"],
    local_observation_id: requiredString(object, "local_observation_id", path),
    label: requiredString(object, "label", path),
    ...(object.raw_text === undefined ? {} : { raw_text: optionalString(object, "raw_text", path) }),
    payload,
    evidence_bindings: parseEvidenceBindings(object.evidence_bindings, sourceId, `${path}.evidence_bindings`),
  };
}

function parseBundleRelation(value: unknown, sourceId: string, path: string): OperationalRecoveryBundleRelation {
  const object = requiredObject(value, path);
  rejectUnknownFields(object, bundleRelationFields, path);
  return {
    ...parseRelationFields(object, path),
    local_observation_id: requiredString(object, "local_observation_id", path),
    label: requiredString(object, "label", path),
    subject: parseEndpoint(object.subject, `${path}.subject`),
    object: parseEndpoint(object.object, `${path}.object`),
    evidence_bindings: parseEvidenceBindings(object.evidence_bindings, sourceId, `${path}.evidence_bindings`),
  };
}

function parseReviewFields(object: Record<string, unknown>, path: string): {
  review_state: OperationalRecoveryProposalReviewState;
  accepted_by?: string | undefined;
  accepted_at?: string | undefined;
  rejected_by?: string | undefined;
  rejected_at?: string | undefined;
  rejection_reason?: string | undefined;
} {
  const reviewState = requiredString(object, "review_state", path);
  if (!reviewStates.has(reviewState as OperationalRecoveryProposalReviewState)) {
    throw new Error(`${path}: unsupported review_state ${reviewState}`);
  }
  const acceptedBy = optionalString(object, "accepted_by", path);
  const acceptedAt = optionalString(object, "accepted_at", path);
  const rejectedBy = optionalString(object, "rejected_by", path);
  const rejectedAt = optionalString(object, "rejected_at", path);
  const rejectionReason = optionalString(object, "rejection_reason", path);
  if (reviewState === "proposed" && (acceptedBy || acceptedAt || rejectedBy || rejectedAt || rejectionReason)) {
    throw new Error(`${path}: proposed review_state cannot carry acceptance or rejection fields`);
  }
  if (reviewState === "accepted") {
    if (!acceptedBy || !acceptedAt) throw new Error(`${path}: accepted review_state requires accepted_by and accepted_at`);
    if (rejectedBy || rejectedAt || rejectionReason) throw new Error(`${path}: accepted review_state cannot carry rejection fields`);
    return {
      review_state: "accepted",
      accepted_by: acceptedBy,
      accepted_at: isoTimestamp(acceptedAt, `${path}.accepted_at`),
    };
  }
  if (reviewState === "rejected") {
    if (!rejectedBy || !rejectedAt || !rejectionReason) {
      throw new Error(`${path}: rejected review_state requires rejected_by, rejected_at, and rejection_reason`);
    }
    if (acceptedBy || acceptedAt) throw new Error(`${path}: rejected review_state cannot carry acceptance fields`);
    return {
      review_state: "rejected",
      rejected_by: rejectedBy,
      rejected_at: isoTimestamp(rejectedAt, `${path}.rejected_at`),
      rejection_reason: rejectionReason,
    };
  }
  return { review_state: "proposed" };
}

export function parseOperationalRecoveryProposal(
  value: unknown,
  path = "operational recovery proposal",
): OperationalRecoveryProposal {
  const object = requiredObject(value, path);
  if (object.schema_version !== OPERATIONAL_RECOVERY_PROPOSAL_SCHEMA_VERSION) {
    throw new Error(`${path}: schema_version must be ${OPERATIONAL_RECOVERY_PROPOSAL_SCHEMA_VERSION}`);
  }
  const proposalKind = requiredString(object, "proposal_kind", path);
  if (!proposalKinds.has(proposalKind as OperationalRecoveryProposalKind)) {
    throw new Error(`${path}: unsupported proposal_kind ${proposalKind}`);
  }
  rejectUnknownFields(
    object,
    proposalKind === "relation" ? relationProposalFields : observationProposalFields,
    path,
  );
  const proposalId = requiredString(object, "proposal_id", path);
  if (!/^[a-z0-9][a-z0-9_-]{2,119}$/u.test(proposalId)) {
    throw new Error(`${path}: proposal_id must use 3-120 lowercase letters, digits, underscores, or hyphens`);
  }
  const corpusFingerprint = requiredString(object, "corpus_fingerprint", path);
  if (!/^[a-f0-9]{64}$/u.test(corpusFingerprint)) throw new Error(`${path}: invalid corpus_fingerprint`);
  const sourceId = requiredString(object, "source_id", path);
  const review = parseReviewFields(object, path);
  const provenance = parseProvenance(object.provenance, `${path}.provenance`);
  if (provenance.verifier && Date.parse(provenance.verifier.reviewed_at) < Date.parse(provenance.drafted_at)) {
    throw new Error(`${path}: verifier reviewed_at cannot predate drafted_at`);
  }
  if (review.review_state === "accepted" && provenance.verifier?.verdict !== "passed") {
    throw new Error(`${path}: accepted proposal requires a passed adversarial verifier`);
  }
  if (
    review.review_state === "accepted" &&
    review.accepted_at &&
    Date.parse(review.accepted_at) < Date.parse(provenance.verifier?.reviewed_at ?? provenance.drafted_at)
  ) throw new Error(`${path}: accepted_at cannot predate drafting or verification`);
  if (
    review.review_state === "rejected" &&
    review.rejected_at &&
    Date.parse(review.rejected_at) < Date.parse(provenance.drafted_at)
  ) throw new Error(`${path}: rejected_at cannot predate drafted_at`);
  const gapIds = stringArray(object.gap_ids, `${path}.gap_ids`);
  if (gapIds.some((gapId) => !gapId.startsWith("operational-coverage:"))) {
    throw new Error(`${path}.gap_ids must contain operational-coverage gap ids`);
  }
  const common = {
    schema_version: OPERATIONAL_RECOVERY_PROPOSAL_SCHEMA_VERSION,
    proposal_id: proposalId,
    corpus_fingerprint: corpusFingerprint,
    gap_ids: gapIds,
    source_id: sourceId,
    ...review,
    provenance,
    rationale: requiredString(object, "rationale", path),
  };
  if (proposalKind === "relation") {
    return {
      ...common,
      proposal_kind: "relation",
      proposed_relation: parseProposedRelation(object.proposed_relation, `${path}.proposed_relation`),
      evidence_bindings: parseCanonicalEvidenceBindings(
        object.evidence_bindings,
        sourceId,
        `${path}.evidence_bindings`,
      ),
    };
  }
  if (!Array.isArray(object.observations) || object.observations.length === 0) {
    throw new Error(`${path}.observations must be a non-empty array`);
  }
  if (!Array.isArray(object.relations) || object.relations.length === 0) {
    throw new Error(`${path}.relations must be a non-empty array`);
  }
  const observations = object.observations.map((observation, index) =>
    parseObservation(observation, sourceId, `${path}.observations[${index}]`),
  );
  const relations = object.relations.map((relation, index) =>
    parseBundleRelation(relation, sourceId, `${path}.relations[${index}]`),
  );
  const localIds = [...observations.map((observation) => observation.local_observation_id), ...relations.map((relation) => relation.local_observation_id)];
  if (new Set(localIds).size !== localIds.length) throw new Error(`${path}: local_observation_id values must be unique`);
  const expectedIds = observations.map((observation) => observation.expected_record_id);
  if (new Set(expectedIds).size !== expectedIds.length) throw new Error(`${path}: expected_record_id values must be unique`);
  return {
    ...common,
    proposal_kind: "observation_bundle",
    observations,
    relations,
  };
}

function evidenceBindingReasons(
  binding: OperationalRecoveryEvidenceBinding,
  proposal: OperationalRecoveryProposal,
  context: OperationalRecoveryProposalValidationContext,
  label: string,
): string[] {
  const reasons: string[] = [];
  if (binding.source_id !== proposal.source_id) reasons.push(`${label}: evidence source differs from proposal source`);
  if (binding.evidence_id !== evidenceId(binding.source_id, binding.block_id)) {
    reasons.push(`${label}: evidence_id must equal ${evidenceId(binding.source_id, binding.block_id)}`);
  }
  const block = context.resolve_block(binding.source_id, binding.block_id);
  if (!block) reasons.push(`${label}: missing staged/public source block ${binding.source_id}#${binding.block_id}`);
  else if (block.raw_text === undefined) {
    reasons.push(`${label}: source_quote cannot be verified without staged blocks or source-page text`);
  } else if (!quoteIsInBlock(binding.source_quote, block.raw_text)) {
    reasons.push(`${label}: source_quote is not present in ${binding.source_id}#${binding.block_id}`);
  }
  return reasons;
}

function normalizedEvidenceQuote(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function relationTriple(record: MtaCanonicalRecord): string | null {
  if (record.record_kind !== "relation") return null;
  const kind = record.payload.relation_kind;
  const subject = record.payload.subject_id;
  const object = record.payload.object_id;
  return typeof kind === "string" && typeof subject === "string" && typeof object === "string"
    ? `${kind}\0${subject}\0${object}`
    : null;
}

function endpointRecordId(
  endpoint: OperationalRecoveryEndpoint,
  proposal: OperationalRecoveryObservationBundleProposal,
): string | undefined {
  if ("record_id" in endpoint) return endpoint.record_id;
  return proposal.observations.find(
    (observation) => observation.local_observation_id === endpoint.local_observation_id,
  )?.expected_record_id;
}

export function validateOperationalRecoveryProposal(
  proposal: OperationalRecoveryProposal,
  context: OperationalRecoveryProposalValidationContext,
): string[] {
  const reasons: string[] = [];
  const recordsById = new Map(context.records.map((record) => [record.record_id, record]));
  const relationTriples = new Set(context.records.flatMap((record) => {
    const triple = relationTriple(record);
    return triple ? [triple] : [];
  }));
  const canonicalSourceIds = new Set(context.records.flatMap((record) => [record.source_id, ...(record.source_ids ?? [])]));
  if (!canonicalSourceIds.has(proposal.source_id)) reasons.push(`unknown canonical source_id ${proposal.source_id}`);
  if (context.stage === "pending") {
    if (context.current_corpus_fingerprint === undefined) reasons.push("current operational coverage corpus_fingerprint is unavailable");
    else if (proposal.corpus_fingerprint !== context.current_corpus_fingerprint) {
      reasons.push(`stale corpus_fingerprint ${proposal.corpus_fingerprint}`);
    }
    if (context.known_gap_ids === undefined) reasons.push("current operational coverage gap ledger is unavailable");
  }
  for (const gapId of proposal.gap_ids) {
    if (context.known_gap_ids && !context.known_gap_ids.has(gapId)) reasons.push(`unknown operational coverage gap ${gapId}`);
  }

  const validateRelationShape = (
    relationKind: OperationalRecoveryRelation["relation_kind"],
    subjectId: string,
    objectId: string,
    label: string,
  ): void => {
    const subject = recordsById.get(subjectId);
    const object = recordsById.get(objectId);
    if (!subject) reasons.push(`${label}: missing subject record ${subjectId}`);
    if (!object) reasons.push(`${label}: missing object record ${objectId}`);
    if (!subject || !object) return;
    const shapeIssue = relationEndpointShapeIssue(relationKind, subject.record_kind, object.record_kind);
    if (shapeIssue) reasons.push(`${label}: ${shapeIssue.message}`);
    const triple = `${relationKind}\0${subjectId}\0${objectId}`;
    if (context.stage === "pending" && relationTriples.has(triple)) reasons.push(`${label}: relation already exists`);
    if (context.stage === "applied" && !relationTriples.has(triple)) reasons.push(`${label}: applied relation is missing`);
  };

  if (proposal.proposal_kind === "relation") {
    const relation = proposal.proposed_relation;
    validateRelationShape(
      relation.relation_kind,
      relation.subject_record_id,
      relation.object_record_id,
      "proposed_relation",
    );
    if (!proposal.evidence_bindings.some((binding) => binding.role === "relationship")) {
      reasons.push("relation proposal requires a relationship evidence binding");
    }
    for (const [index, binding] of proposal.evidence_bindings.entries()) {
      const label = `evidence_bindings[${index}]`;
      reasons.push(...evidenceBindingReasons(binding, proposal, context, label));
      if (binding.record_id !== relation.subject_record_id && binding.record_id !== relation.object_record_id) {
        reasons.push(`${label}: record_id must be a proposed relation endpoint`);
        continue;
      }
      const record = recordsById.get(binding.record_id);
      if (!record) {
        reasons.push(`${label}: missing bound record ${binding.record_id}`);
        continue;
      }
      const exact = record.evidence_refs.find(
        (ref) =>
          ref.source_id === binding.source_id &&
          ref.evidence_id === binding.evidence_id &&
          ref.block_id === binding.block_id,
      );
      if (!exact) reasons.push(`${label}: evidence is not an exact canonical ref on ${binding.record_id}`);
      const resolvedBlock = context.resolve_block(binding.source_id, binding.block_id);
      if (exact && resolvedBlock?.raw_text_sha256 && exact.text_sha256 !== resolvedBlock.raw_text_sha256) {
        reasons.push(`${label}: canonical evidence hash does not match the resolved source block`);
      }
    }
    return [...new Set(reasons)].sort();
  }

  const observationByLocalId = new Map(
    proposal.observations.map((observation) => [observation.local_observation_id, observation]),
  );
  for (const [index, observation] of proposal.observations.entries()) {
    const identityInput = {
      source_id: proposal.source_id,
      observation_kind: observation.observation_kind,
      local_observation_id: observation.local_observation_id,
      label: observation.label,
      ...(observation.raw_text ? { raw_text: observation.raw_text } : {}),
      payload: observation.payload,
    } satisfies MtaSubmitObservationInput;
    const existing = recordsById.get(observation.expected_record_id);
    if (observation.target_record_id) {
      if (!isGlobalRecordKind(observation.observation_kind)) {
        reasons.push(
          `observations[${index}]: target_record_id is supported only for global record kinds`,
        );
      }
      const target = recordsById.get(observation.target_record_id);
      if (!target) {
        reasons.push(`observations[${index}]: target record ${observation.target_record_id} does not exist`);
      } else if (target.record_kind !== observation.observation_kind) {
        reasons.push(
          `observations[${index}]: target record ${observation.target_record_id} has kind ${target.record_kind}, expected ${observation.observation_kind}`,
        );
      }
      if (observation.expected_record_id !== observation.target_record_id) {
        reasons.push(
          `observations[${index}]: expected_record_id ${observation.expected_record_id} must equal target_record_id ${observation.target_record_id}`,
        );
      }
      if (context.stage === "applied" && target?.record_kind === observation.observation_kind) {
        for (const [evidenceIndex, binding] of observation.evidence_bindings.entries()) {
          const exact = target.evidence_refs.find(
            (ref) =>
              ref.source_id === binding.source_id &&
              ref.evidence_id === binding.evidence_id &&
              ref.block_id === binding.block_id &&
              ref.role === binding.role &&
              ref.source_quote === normalizedEvidenceQuote(binding.source_quote),
          );
          if (!exact) {
            reasons.push(
              `observations[${index}].evidence_bindings[${evidenceIndex}]: exact evidence is not materialized on target ${observation.target_record_id}`,
            );
          } else {
            const resolvedBlock = context.resolve_block(binding.source_id, binding.block_id);
            if (resolvedBlock?.raw_text_sha256 && exact.text_sha256 !== resolvedBlock.raw_text_sha256) {
              reasons.push(
                `observations[${index}].evidence_bindings[${evidenceIndex}]: canonical evidence hash does not match the resolved source block`,
              );
            }
          }
        }
      }
    } else {
      const derivedRecordId = isGlobalRecordKind(observation.observation_kind)
        ? canonicalRecordIdForInput(identityInput)
        : recordBaseIdForInput(identityInput);
      if (observation.expected_record_id !== derivedRecordId) {
        reasons.push(
          `observations[${index}]: expected_record_id ${observation.expected_record_id} does not match deterministic id ${derivedRecordId}`,
        );
      }
      if (context.stage === "pending" && existing) {
        reasons.push(`observations[${index}]: expected record ${observation.expected_record_id} already exists`);
      }
      if (context.stage === "resuming" && existing && existing.record_kind !== observation.observation_kind) {
        reasons.push(`observations[${index}]: resumable expected record ${observation.expected_record_id} has the wrong kind`);
      }
      if (context.stage === "applied" && (!existing || existing.record_kind !== observation.observation_kind)) {
        reasons.push(`observations[${index}]: applied expected record ${observation.expected_record_id} is missing or has the wrong kind`);
      }
    }
    for (const [evidenceIndex, binding] of observation.evidence_bindings.entries()) {
      reasons.push(...evidenceBindingReasons(binding, proposal, context, `observations[${index}].evidence_bindings[${evidenceIndex}]`));
    }
  }
  for (const [index, relation] of proposal.relations.entries()) {
    const relationBlockIds = new Set(relation.evidence_bindings.map((binding) => binding.block_id));
    if (!relation.evidence_bindings.some((binding) => binding.role === "relationship")) {
      reasons.push(`relations[${index}]: requires a relationship evidence binding`);
    }
    for (const [evidenceIndex, binding] of relation.evidence_bindings.entries()) {
      reasons.push(...evidenceBindingReasons(binding, proposal, context, `relations[${index}].evidence_bindings[${evidenceIndex}]`));
    }
    for (const [endpointName, endpoint] of [["subject", relation.subject], ["object", relation.object]] as const) {
      if ("local_observation_id" in endpoint) {
        const observation = observationByLocalId.get(endpoint.local_observation_id);
        if (!observation) {
          reasons.push(`relations[${index}].${endpointName}: unknown bundle local_observation_id ${endpoint.local_observation_id}`);
        } else if (!observation.evidence_bindings.some((binding) => relationBlockIds.has(binding.block_id))) {
          reasons.push(
            `relations[${index}].${endpointName}: relation and local observation must share an exact source block context`,
          );
        }
      }
    }
    const subjectId = endpointRecordId(relation.subject, proposal);
    const objectId = endpointRecordId(relation.object, proposal);
    if (subjectId && objectId) {
      const localSubject = "local_observation_id" in relation.subject
        ? observationByLocalId.get(relation.subject.local_observation_id)
        : undefined;
      const localObject = "local_observation_id" in relation.object
        ? observationByLocalId.get(relation.object.local_observation_id)
        : undefined;
      const subjectKind = localSubject?.observation_kind ?? recordsById.get(subjectId)?.record_kind;
      const objectKind = localObject?.observation_kind ?? recordsById.get(objectId)?.record_kind;
      if (!subjectKind) reasons.push(`relations[${index}]: missing subject record ${subjectId}`);
      if (!objectKind) reasons.push(`relations[${index}]: missing object record ${objectId}`);
      if (subjectKind && objectKind) {
        const shapeIssue = relationEndpointShapeIssue(relation.relation_kind, subjectKind, objectKind);
        if (shapeIssue) reasons.push(`relations[${index}]: ${shapeIssue.message}`);
      }
      const triple = `${relation.relation_kind}\0${subjectId}\0${objectId}`;
      if (context.stage === "pending" && relationTriples.has(triple)) reasons.push(`relations[${index}]: relation already exists`);
      if (context.stage === "applied" && !relationTriples.has(triple)) reasons.push(`relations[${index}]: applied relation is missing`);
    }
  }
  return [...new Set(reasons)].sort();
}

function evidenceRefs(bindings: readonly OperationalRecoveryEvidenceBinding[]) {
  const unique = new Map<string, OperationalRecoveryEvidenceBinding>();
  for (const binding of bindings) {
    unique.set(`${binding.source_id}|${binding.block_id}|${binding.source_quote}|${binding.role}`, binding);
  }
  return [...unique.values()].map((binding) => ({
    source_id: binding.source_id,
    evidence_id: binding.evidence_id,
    block_id: binding.block_id,
    role: binding.role,
    source_quote: binding.source_quote,
  }));
}

function endpointPayload(
  endpoint: OperationalRecoveryEndpoint,
  prefix: "subject" | "object",
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): JsonObject {
  if ("local_observation_id" in endpoint) return { [`${prefix}_local_observation_id`]: endpoint.local_observation_id };
  const record = recordsById.get(endpoint.record_id);
  if (!record) throw new Error(`Missing recovery proposal endpoint ${endpoint.record_id}`);
  return { [`${prefix}_id`]: endpoint.record_id };
}

export function operationalRecoveryProposalSubmissionInputs(
  proposal: OperationalRecoveryProposal,
  records: readonly MtaCanonicalRecord[],
): MtaSubmitObservationInput[] {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  if (proposal.proposal_kind === "relation") {
    const relation = proposal.proposed_relation;
    const subject = recordsById.get(relation.subject_record_id);
    const object = recordsById.get(relation.object_record_id);
    if (!subject || !object) throw new Error(`Proposal ${proposal.proposal_id} has missing relation endpoints`);
    return [{
      source_id: proposal.source_id,
      observation_kind: "relation",
      local_observation_id: `recovery_${proposal.proposal_id}`,
      label: relation.description ?? `${subject.record_id} ${relation.relation_kind} ${object.record_id}`,
      payload: {
        relation_kind: relation.relation_kind,
        subject_id: subject.record_id,
        object_id: object.record_id,
        assertion_status: relation.assertion_status,
        as_of_date: relation.as_of_date,
        ...(relation.description ? { description: relation.description } : {}),
      },
      evidence_refs: evidenceRefs(proposal.evidence_bindings),
    }];
  }
  const observations: MtaSubmitObservationInput[] = proposal.observations.map((observation) => {
    if (observation.target_record_id && !isGlobalRecordKind(observation.observation_kind)) {
      throw new Error(
        `Proposal ${proposal.proposal_id} observation ${observation.local_observation_id} cannot target a non-global ${observation.observation_kind} record`,
      );
    }
    return {
      source_id: proposal.source_id,
      observation_kind: observation.observation_kind,
      local_observation_id: observation.local_observation_id,
      ...(observation.target_record_id ? { target_record_id: observation.target_record_id } : { create_new: true }),
      label: observation.label,
      ...(observation.raw_text ? { raw_text: observation.raw_text } : {}),
      payload: structuredClone(observation.payload),
      evidence_refs: evidenceRefs(observation.evidence_bindings),
    };
  });
  const relations: MtaSubmitObservationInput[] = proposal.relations.map((relation) => ({
    source_id: proposal.source_id,
    observation_kind: "relation",
    local_observation_id: relation.local_observation_id,
    label: relation.label,
    payload: {
      relation_kind: relation.relation_kind,
      ...endpointPayload(relation.subject, "subject", recordsById),
      ...endpointPayload(relation.object, "object", recordsById),
      assertion_status: relation.assertion_status,
      as_of_date: relation.as_of_date,
      ...(relation.description ? { description: relation.description } : {}),
    },
    evidence_refs: evidenceRefs(relation.evidence_bindings),
  }));
  return [...observations, ...relations];
}

export function buildOperationalRecoverySubmissionBatch(
  proposal: OperationalRecoveryProposal,
  records: readonly MtaCanonicalRecord[],
  createEntry: OperationalRecoveryEntryFactory = createSubmissionEntry,
): OperationalRecoverySubmissionBatch {
  if (proposal.review_state !== "accepted" || !proposal.accepted_by || !proposal.accepted_at) {
    throw new Error(`Proposal ${proposal.proposal_id} must be accepted before journal conversion`);
  }
  const runId = operationalRecoveryRunId(proposal);
  const hash = operationalRecoveryProposalHash(proposal);
  const inputs = operationalRecoveryProposalSubmissionInputs(proposal, records);
  const knownLocalObservationIds = new Set([
    ...records.flatMap((record) => [record.local_observation_id, ...(record.local_observation_ids ?? [])]),
    ...inputs.filter((input) => input.observation_kind !== "relation").map((input) => input.local_observation_id),
  ]);
  const entries = inputs.map((input): MtaSubmissionEntry => {
    const entry = createEntry(
      runId,
      input,
      proposal.accepted_at!,
      relationEndpointIssues(input, knownLocalObservationIds),
    );
    return {
      ...entry,
      recovery_provenance: {
        proposal_id: proposal.proposal_id,
        proposal_kind: proposal.proposal_kind,
        proposal_sha256: hash,
        accepted_by: proposal.accepted_by!,
        accepted_at: proposal.accepted_at!,
      },
    };
  });
  const rejected = entries.filter((entry) => entry.validation.state !== "accepted");
  if (rejected.length > 0) {
    throw new Error(
      `Proposal ${proposal.proposal_id} generated rejected submission entries: ${rejected
        .map((entry) => `${entry.tool_args.local_observation_id}: ${entry.validation.issues.join("; ")}`)
        .join(" | ")}`,
    );
  }
  return {
    run_id: runId,
    proposal_sha256: hash,
    journal_content: entries.map((entry) => stableJson(entry as unknown as JsonValue)).join("\n") + "\n",
    entries,
  };
}

/**
 * Parse and validate an immutable recovery journal against the accepted
 * proposal that authorized it. The comparison is exact for every persisted
 * submission field, including the complete tool_args object, so omitted
 * proposal fields and unreviewed additions cannot survive a retry or repo
 * validation pass.
 */
export function validateOperationalRecoveryJournal(
  content: string,
  path: string,
  proposal: OperationalRecoveryProposal,
  records: readonly MtaCanonicalRecord[],
  createEntry: OperationalRecoveryEntryFactory = createSubmissionEntry,
): OperationalRecoverySubmissionBatch {
  const entries = content.split(/\r?\n/u).filter((line) => line.trim()).map((line, index) => {
    try {
      const entry = JSON.parse(line) as unknown;
      if (!isObject(entry) || !isObject(entry.tool_args)) {
        throw new Error("entry must be an object with object-valued tool_args");
      }
      return entry as MtaSubmissionEntry;
    } catch (error) {
      throw new Error(`${path}:${index + 1}: invalid recovery journal JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const expected = buildOperationalRecoverySubmissionBatch(proposal, records, createEntry);
  if (entries.length !== expected.entries.length) {
    throw new Error(`${path}: recovery journal has ${entries.length} entries; proposal requires ${expected.entries.length}`);
  }
  for (const [index, entry] of entries.entries()) {
    const expectedEntry = expected.entries[index]!;
    const entryPath = `${path}:${index + 1}`;
    if (stableJson(entry as unknown as JsonValue) !== stableJson(expectedEntry as unknown as JsonValue)) {
      throw new Error(
        `${entryPath}: persisted recovery entry differs from the exact proposal-derived submission for ${expectedEntry.tool_args.local_observation_id}`,
      );
    }
    const toolArgsHash = stableHash(entry.tool_args as unknown as JsonObject);
    if (entry.tool_args_sha256 !== `sha256:${toolArgsHash}` || entry.submission_id !== `sub_${toolArgsHash.slice(0, 16)}`) {
      throw new Error(`${entryPath}: submission identity does not match the exact persisted tool_args`);
    }
  }
  return {
    ...expected,
    journal_content: content,
    entries,
  };
}

function readJsonl(path: string): unknown[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(`${path}:${index + 1}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
}

function walkJson(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkJson(path);
    return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
  }).sort((left, right) => left.localeCompare(right));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function wikiBlockText(rootDir: string, sourceId: string, blockId: string): string | undefined {
  const path = join(rootDir, "wiki", "sources", `${sourceId}.md`);
  if (!existsSync(path)) return undefined;
  const match = new RegExp(`^\\[${escapeRegExp(blockId)}\\]\\s*(.*)$`, "mu").exec(readFileSync(path, "utf8"));
  return match?.[1]?.trim() || undefined;
}

function rawBlock(rootDir: string, sourceId: string, blockId: string): StagedSourceBlock | undefined {
  const path = join(rootDir, "raw", "sources", sourceId, "blocks.jsonl");
  return readJsonl(path).find((value) => isObject(value) && value.block_id === blockId) as StagedSourceBlock | undefined;
}

export function operationalRecoveryBlockResolver(
  rootDir = repoRoot,
): (sourceId: string, blockId: string) => OperationalRecoveryResolvedBlock | undefined {
  let index: EvidenceBlockIndex | undefined;
  let indexLoaded = false;
  return (sourceId, blockId) => {
    const staged = rawBlock(rootDir, sourceId, blockId);
    if (staged) {
      return {
        source_id: sourceId,
        block_id: blockId,
        raw_text: staged.raw_text,
        raw_text_sha256: staged.raw_text_sha256,
      };
    }
    if (!indexLoaded) {
      index = readEvidenceBlockIndex(join(rootDir, "data", "evidence-block-index.jsonl"));
      indexLoaded = true;
    }
    const indexed = evidenceBlockIndexEntry(index, sourceId, blockId);
    const sourceText = wikiBlockText(rootDir, sourceId, blockId);
    if (!indexed && !sourceText) return undefined;
    return {
      source_id: sourceId,
      block_id: blockId,
      ...(sourceText ? { raw_text: sourceText } : {}),
      ...(indexed ? { raw_text_sha256: indexed.raw_text_sha256 } : {}),
    };
  };
}

function proposalLocation(
  proposalRoot: string,
  path: string,
): { stage: OperationalRecoveryProposalStage; expectedKind: OperationalRecoveryProposalKind } | undefined {
  const parts = relative(proposalRoot, path).split(/[\\/]/u);
  const file = parts.at(-1);
  if (!file) return undefined;
  if (parts.length === 2 && parts[0] === "relations") return { stage: "pending", expectedKind: "relation" };
  if (parts.length === 2 && parts[0] === "observations") return { stage: "pending", expectedKind: "observation_bundle" };
  if (parts.length === 3 && (parts[0] === "applied" || parts[0] === "rejected")) {
    const expectedKind = parts[1] === "relations" ? "relation" : parts[1] === "observations" ? "observation_bundle" : undefined;
    if (!expectedKind) return undefined;
    return { stage: parts[0] as "applied" | "rejected", expectedKind };
  }
  return undefined;
}

function coverageContext(rootDir: string): { fingerprint: string; gapIds: Set<string> } {
  const loaded = loadOperationalCoverageArtifacts({ rootDir });
  return {
    fingerprint: loaded.build.matrix.corpus_fingerprint,
    gapIds: new Set(loaded.build.ledger.gaps.map((gap) => gap.gap_id)),
  };
}

export function operationalRecoveryProposalRoot(rootDir = repoRoot): string {
  return join(rootDir, "data", "operational-anchor-review", "proposed");
}

export function readOperationalRecoveryProposalArtifact(
  proposalId: string,
  rootDir = repoRoot,
): OperationalRecoveryProposalArtifact {
  const proposalRoot = operationalRecoveryProposalRoot(rootDir);
  const matches = walkJson(proposalRoot).filter((path) => basename(path) === `${proposalId}.json`);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one operational recovery proposal file ${proposalId}.json, found ${matches.length}`);
  }
  const path = matches[0]!;
  const relativePath = relative(rootDir, path).split("/").join("/");
  const location = proposalLocation(proposalRoot, path);
  if (!location) throw new Error(`${relativePath}: unsupported proposal directory layout`);
  const proposal = parseOperationalRecoveryProposal(JSON.parse(readFileSync(path, "utf8")) as unknown, relativePath);
  if (proposal.proposal_id !== proposalId) throw new Error(`${relativePath}: proposal_id must match file name`);
  if (proposal.proposal_kind !== location.expectedKind) throw new Error(`${relativePath}: proposal_kind does not match directory`);
  if (location.stage === "applied" && proposal.review_state !== "accepted") {
    throw new Error(`${relativePath}: applied proposal must have accepted review_state`);
  }
  if (location.stage === "rejected" && proposal.review_state !== "rejected") {
    throw new Error(`${relativePath}: rejected proposal must have rejected review_state`);
  }
  if (location.stage === "pending" && proposal.review_state === "rejected") {
    throw new Error(`${relativePath}: rejected proposal must be moved under proposed/rejected`);
  }
  proposal.artifact_path = relativePath;
  return { path, stage: location.stage, proposal };
}

export function validateOperationalRecoveryProposalTree(options: {
  rootDir?: string | undefined;
  records?: readonly MtaCanonicalRecord[] | undefined;
  currentCorpusFingerprint?: string | undefined;
  knownGapIds?: ReadonlySet<string> | undefined;
  resolveBlock?: ((sourceId: string, blockId: string) => OperationalRecoveryResolvedBlock | undefined) | undefined;
  createEntry?: OperationalRecoveryEntryFactory | undefined;
} = {}): OperationalRecoveryProposalValidationReport {
  const rootDir = options.rootDir ?? repoRoot;
  const proposalRoot = operationalRecoveryProposalRoot(rootDir);
  const paths = walkJson(proposalRoot);
  const records = options.records ?? readCanonicalRecords();
  const coverage = options.currentCorpusFingerprint !== undefined && options.knownGapIds !== undefined
    ? undefined
    : coverageContext(rootDir);
  const currentCorpusFingerprint = options.currentCorpusFingerprint ?? coverage?.fingerprint;
  const knownGapIds = options.knownGapIds ?? coverage?.gapIds;
  const resolveBlock = options.resolveBlock ?? operationalRecoveryBlockResolver(rootDir);
  const proposals: OperationalRecoveryProposalArtifact[] = [];
  const issues: MtaValidationIssue[] = [];
  const seenIds = new Map<string, string>();

  for (const path of paths) {
    const relativePath = relative(rootDir, path).split("/").join("/");
    const location = proposalLocation(proposalRoot, path);
    if (!location) {
      issues.push({ code: "invalid_relation_proposal", path: relativePath, message: "unsupported proposal directory layout" });
      continue;
    }
    try {
      const proposal = parseOperationalRecoveryProposal(JSON.parse(readFileSync(path, "utf8")) as unknown, relativePath);
      if (`${proposal.proposal_id}.json` !== basename(path)) throw new Error(`${relativePath}: proposal_id must match file name`);
      if (proposal.proposal_kind !== location.expectedKind) throw new Error(`${relativePath}: proposal_kind does not match directory`);
      if (location.stage === "applied" && proposal.review_state !== "accepted") {
        throw new Error(`${relativePath}: applied proposal must have accepted review_state`);
      }
      if (location.stage === "rejected" && proposal.review_state !== "rejected") {
        throw new Error(`${relativePath}: rejected proposal must have rejected review_state`);
      }
      if (location.stage === "pending" && proposal.review_state === "rejected") {
        throw new Error(`${relativePath}: rejected proposal must be moved under proposed/rejected`);
      }
      const previous = seenIds.get(proposal.proposal_id);
      if (previous) throw new Error(`${relativePath}: duplicate proposal_id also present at ${previous}`);
      seenIds.set(proposal.proposal_id, relativePath);
      const recoveryJournalPath = proposal.review_state === "accepted"
        ? join(rootDir, "data", "submissions", `${operationalRecoveryRunId(proposal)}.jsonl`)
        : undefined;
      const validationStage = location.stage === "pending" && recoveryJournalPath && existsSync(recoveryJournalPath)
        ? "resuming"
        : location.stage;
      const reasons = validateOperationalRecoveryProposal(proposal, {
        records,
        stage: validationStage,
        ...(currentCorpusFingerprint ? { current_corpus_fingerprint: currentCorpusFingerprint } : {}),
        ...(knownGapIds ? { known_gap_ids: knownGapIds } : {}),
        resolve_block: resolveBlock,
      });
      if (reasons.length > 0) throw new Error(`${relativePath}: ${reasons.join("; ")}`);
      proposal.artifact_path = relativePath;
      proposals.push({ path, stage: location.stage, proposal });
    } catch (error) {
      issues.push({
        code: "invalid_relation_proposal",
        path: relativePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const pendingClaims = new Map<string, string>();
  for (const artifact of proposals.filter((candidate) => candidate.stage === "pending")) {
    const proposal = artifact.proposal;
    const claims = proposal.proposal_kind === "relation"
      ? [`relation:${proposal.proposed_relation.relation_kind}:${proposal.proposed_relation.subject_record_id}:${proposal.proposed_relation.object_record_id}`]
      : [
          ...proposal.observations.map((observation) => `record:${observation.expected_record_id}`),
          ...proposal.relations.flatMap((relation) => {
            const subjectId = endpointRecordId(relation.subject, proposal);
            const objectId = endpointRecordId(relation.object, proposal);
            return subjectId && objectId ? [`relation:${relation.relation_kind}:${subjectId}:${objectId}`] : [];
          }),
        ];
    for (const claim of claims) {
      const previous = pendingClaims.get(claim);
      if (previous && previous !== proposal.proposal_id) {
        issues.push({
          code: "invalid_relation_proposal",
          path: proposal.artifact_path,
          message: `duplicate pending recovery claim ${claim} also proposed by ${previous}`,
        });
      } else {
        pendingClaims.set(claim, proposal.proposal_id);
      }
    }
  }

  const proposalsById = new Map(proposals.map((artifact) => [artifact.proposal.proposal_id, artifact]));
  const submissionsDir = join(rootDir, "data", "submissions");
  if (existsSync(submissionsDir)) {
    for (const fileName of readdirSync(submissionsDir).filter((name) => name.endsWith(".jsonl")).sort()) {
      const journalPath = join(submissionsDir, fileName);
      const relativeJournalPath = relative(rootDir, journalPath).split("/").join("/");
      const journalContent = readFileSync(journalPath, "utf8");
      if (!fileName.includes("_recovery_") && !journalContent.includes('"recovery_provenance"')) continue;
      let entries: unknown[];
      try {
        entries = readJsonl(journalPath);
      } catch (error) {
        issues.push({
          code: "invalid_relation_proposal",
          path: relativeJournalPath,
          message: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      const proposalIds = new Set<string>();
      let provenanceFields = 0;
      for (const [index, entry] of entries.entries()) {
        if (!isObject(entry) || !("recovery_provenance" in entry)) continue;
        provenanceFields += 1;
        if (!isObject(entry.recovery_provenance) || typeof entry.recovery_provenance.proposal_id !== "string") {
          issues.push({
            code: "invalid_relation_proposal",
            path: `${relativeJournalPath}:${index + 1}`,
            message: "recovery_provenance must be an object with a proposal_id",
          });
          continue;
        }
        proposalIds.add(entry.recovery_provenance.proposal_id);
      }
      if (fileName.includes("_recovery_") && provenanceFields === 0) {
        issues.push({
          code: "invalid_relation_proposal",
          path: relativeJournalPath,
          message: "recovery-named journal has no recovery_provenance",
        });
      }
      for (const proposalId of proposalIds) {
        const artifact = proposalsById.get(proposalId);
        if (!artifact) {
          issues.push({
            code: "invalid_relation_proposal",
            path: relativeJournalPath,
            message: `orphaned recovery journal references missing proposal ${proposalId}`,
          });
          continue;
        }
        if (artifact.proposal.review_state !== "accepted") {
          issues.push({
            code: "invalid_relation_proposal",
            path: relativeJournalPath,
            message: `recovery journal references non-accepted proposal ${proposalId}`,
          });
          continue;
        }
        const expectedPath = join(rootDir, "data", "submissions", `${operationalRecoveryRunId(artifact.proposal)}.jsonl`);
        if (journalPath !== expectedPath) {
          issues.push({
            code: "invalid_relation_proposal",
            path: relativeJournalPath,
            message: `recovery proposal ${proposalId} is bound to the wrong journal path; expected ${relative(rootDir, expectedPath).split("/").join("/")}`,
          });
        }
      }
    }
  }
  for (const artifact of proposals.filter(
    (candidate) => candidate.proposal.review_state === "accepted" && candidate.stage !== "rejected",
  )) {
    const proposal = artifact.proposal;
    const journalPath = join(rootDir, "data", "submissions", `${operationalRecoveryRunId(proposal)}.jsonl`);
    if (!existsSync(journalPath)) {
      if (artifact.stage === "applied") {
        issues.push({
          code: "invalid_relation_proposal",
          path: proposal.artifact_path,
          message: `applied recovery proposal is missing journal ${relative(rootDir, journalPath)}`,
        });
      }
      continue;
    }
    try {
      validateOperationalRecoveryJournal(
        readFileSync(journalPath, "utf8"),
        relative(rootDir, journalPath).split("/").join("/"),
        proposal,
        records,
        options.createEntry,
      );
    } catch (error) {
      issues.push({
        code: "invalid_relation_proposal",
        path: relative(rootDir, journalPath),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    proposals: proposals.sort((left, right) => left.proposal.proposal_id.localeCompare(right.proposal.proposal_id)),
    issues,
  };
}

export function loadOperationalRecoveryProposal(
  proposalId: string,
  options: Parameters<typeof validateOperationalRecoveryProposalTree>[0] = {},
): OperationalRecoveryProposalArtifact {
  const report = validateOperationalRecoveryProposalTree(options);
  if (report.issues.length > 0) {
    throw new Error(`Operational recovery proposal tree is invalid: ${report.issues.map((issue) => issue.message).join("; ")}`);
  }
  const matches = report.proposals.filter((artifact) => artifact.proposal.proposal_id === proposalId);
  if (matches.length !== 1) throw new Error(`Expected exactly one operational recovery proposal ${proposalId}, found ${matches.length}`);
  return matches[0]!;
}
