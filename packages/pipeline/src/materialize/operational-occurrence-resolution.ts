import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  OPERATIONAL_OCCURRENCE_APPLICATION_ACTIONS,
  loadOperationalOccurrenceAcceptedDecisionsV2,
  operationalOccurrenceReviewMembershipFingerprint,
  parseOperationalOccurrenceAcceptedDecisionV2,
  type OperationalOccurrenceAcceptedDecisionV2,
  type OperationalOccurrenceApplicationAction,
  type OperationalOccurrenceReviewApplication,
} from "./operational-occurrence-review.js";
import type {
  OperationalOccurrenceEvidenceBinding,
} from "./operational-occurrences.js";
import {
  resolvedInterventionDurableApplicationIdentity,
  resolvedInterventionApplicationIdentity,
  type ResolvedInterventionExtent,
} from "./resolved-intervention-applications.js";

export const OPERATIONAL_OCCURRENCE_CURRENT_REVIEW_SCHEMA_VERSION = 3 as const;
export const OPERATIONAL_OCCURRENCE_CURRENT_REVIEW_SNAPSHOT_VERSION = 4 as const;

export const APPLICATION_ACTION_REVIEW_REASON_CODES = [
  "source_explicit_addition",
  "source_explicit_modification",
  "source_explicit_removal",
  "source_explicit_suspension",
  "source_explicit_resumption",
  "source_explicit_retention",
  "action_not_distinguishable_from_source",
  "conflicting_action_evidence",
] as const;
export type ApplicationActionReviewReasonCode =
  (typeof APPLICATION_ACTION_REVIEW_REASON_CODES)[number];

export const APPLICATION_EXTENT_REVIEW_REASON_CODES = [
  "source_explicit_route_wide_scope",
  "source_explicit_bounded_segment",
  "source_explicit_stop_set",
  "source_explicit_service_pattern",
  "exact_stop_set_not_enumerated",
  "bounded_endpoints_not_stated",
  "source_explicit_scope_without_canonical_extent_identity",
  "extent_not_distinguishable_from_source",
  "conflicting_extent_evidence",
  "nonphysical_scope_not_exactly_bound",
] as const;
export type ApplicationExtentReviewReasonCode =
  (typeof APPLICATION_EXTENT_REVIEW_REASON_CODES)[number];

export type ApplicationSemanticReviewArtifactPin = {
  path: string;
  sha256: string;
};

export type OperationalOccurrenceApplicationSemanticReview = {
  schema_version: 1;
  contract_id: "plan-053-application-semantic-review-v1";
  application_id: string;
  batch_id: string;
  batch_manifest: ApplicationSemanticReviewArtifactPin;
  predecessor_decision_id: string;
  predecessor_membership_fingerprint: string;
  action_disposition: "resolved" | "accepted_unknown";
  action_reason_code: ApplicationActionReviewReasonCode;
  action_evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  extent_disposition: "resolved" | "accepted_unknown";
  extent_reason_code: ApplicationExtentReviewReasonCode;
  extent_evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  reviewers: {
    primary: string;
    independent: string;
    adjudicator: string | null;
  };
  proposal_receipts: {
    primary: ApplicationSemanticReviewArtifactPin;
    independent: ApplicationSemanticReviewArtifactPin;
    adjudicator: ApplicationSemanticReviewArtifactPin | null;
  };
  accepted_at: string;
  rationale: string;
  provider_usage: {
    provider_requests: 0;
    input_tokens: 0;
    output_tokens: 0;
    committed_cost_usd: 0;
    actual_cost_usd: 0;
    provider: null;
    model: null;
    profile: null;
  };
  receipt_id: string;
  receipt_path: string;
};

export type OperationalOccurrenceCurrentReviewApplication =
  OperationalOccurrenceReviewApplication & {
    application_id: string;
    extent: ResolvedInterventionExtent;
    semantic_review?: OperationalOccurrenceApplicationSemanticReview;
  };

type OperationalOccurrenceAcceptedDecisionV3Base = Omit<
  OperationalOccurrenceAcceptedDecisionV2,
  "applications" | "membership_fingerprint" | "review_scope" | "schema_version"
> & {
  schema_version: 3;
  applications: OperationalOccurrenceCurrentReviewApplication[];
  membership_fingerprint: string;
};

export type OperationalOccurrenceAcceptedDecisionV3 =
  OperationalOccurrenceAcceptedDecisionV3Base & (
    | {
        operation: "establish_current_resolution";
        supersedes_decision_id: null;
        supersedes_membership_fingerprint: null;
        review_scope: "full_episode_application";
      }
    | {
        operation: "supersede_current_resolution";
        supersedes_decision_id: string;
        supersedes_membership_fingerprint: string;
        review_scope: "application_resolution_refinement";
      }
  );

type OperationalOccurrenceSupersedingDecisionV3 = Extract<
  OperationalOccurrenceAcceptedDecisionV3,
  { operation: "supersede_current_resolution" }
>;

export type OperationalOccurrenceCurrentReviewDecision =
  | OperationalOccurrenceAcceptedDecisionV2
  | OperationalOccurrenceAcceptedDecisionV3;

export type OperationalOccurrenceCurrentReviewSnapshot = {
  snapshot_version: 4;
  decision_schema_versions: [2, 3];
  decision_count: number;
  decisions: OperationalOccurrenceCurrentReviewDecision[];
};

const decisionFields = new Set([
  "accepted_at",
  "anchor_review_decision_ids",
  "applications",
  "decision_id",
  "evidence_bindings",
  "founding_key",
  "membership_fingerprint",
  "observation_event_record_ids",
  "observation_relation_record_ids",
  "occurrence_id",
  "operation",
  "phase_record_ids",
  "phase_relation_record_ids",
  "physical_scope_record_ids",
  "physical_scope_relation_record_ids",
  "rationale",
  "resolution_cluster_id",
  "resolved_onset",
  "review_scope",
  "review_state",
  "reviewers",
  "routes",
  "schema_version",
  "supersedes_decision_id",
  "supersedes_membership_fingerprint",
  "treatment",
]);
const applicationFields = new Set([
  "action",
  "application_id",
  "evidence_bindings",
  "extent",
  "gtfs_route_id",
  "phase_record_id",
  "physical_scope_record_ids",
  "route_record_id",
  "treatment_record_id",
]);
const reviewedApplicationFields = new Set([
  ...applicationFields,
  "semantic_review",
]);
const extentFields = new Set(["description", "kind", "record_ids"]);
const evidenceFields = new Set(["evidence_id", "record_id", "role", "source_id"]);
const semanticReviewFields = new Set([
  "accepted_at",
  "action_disposition",
  "action_evidence_bindings",
  "action_reason_code",
  "application_id",
  "batch_id",
  "batch_manifest",
  "contract_id",
  "extent_disposition",
  "extent_evidence_bindings",
  "extent_reason_code",
  "predecessor_decision_id",
  "predecessor_membership_fingerprint",
  "proposal_receipts",
  "provider_usage",
  "rationale",
  "receipt_id",
  "receipt_path",
  "reviewers",
  "schema_version",
]);
const artifactPinFields = new Set(["path", "sha256"]);
const semanticReviewerFields = new Set(["adjudicator", "independent", "primary"]);
const semanticProposalReceiptFields = new Set([
  "adjudicator",
  "independent",
  "primary",
]);
const zeroProviderUsageFields = new Set([
  "actual_cost_usd",
  "committed_cost_usd",
  "input_tokens",
  "model",
  "output_tokens",
  "profile",
  "provider",
  "provider_requests",
]);
const extentKinds = new Set<ResolvedInterventionExtent["kind"]>([
  "route_wide",
  "bounded_segment",
  "stop_set",
  "service_pattern",
  "unknown",
]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exact(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
  path: string,
): void {
  const extras = Object.keys(value).filter((field) => !expected.has(field)).sort();
  const missing = [...expected].filter((field) => !(field in value)).sort();
  if (extras.length > 0 || missing.length > 0) {
    throw new Error(
      `${path}: exact fields required; unknown=${extras.join(",")}; missing=${missing.join(",")}`,
    );
  }
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function sortedStrings(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const result = value.map((entry, index) => string(entry, `${path}[${index}]`));
  const sorted = [...result].sort((left, right) => left.localeCompare(right));
  if (
    new Set(result).size !== result.length ||
    stableJson(result as JsonValue) !== stableJson(sorted as JsonValue)
  ) {
    throw new Error(`${path} must be sorted and unique`);
  }
  return result;
}

function parseExtent(value: unknown, path: string): ResolvedInterventionExtent {
  const input = object(value, path);
  exact(input, extentFields, path);
  const kind = string(input.kind, `${path}.kind`);
  if (!extentKinds.has(kind as ResolvedInterventionExtent["kind"])) {
    throw new Error(`${path}.kind is unsupported: ${kind}`);
  }
  const recordIds = sortedStrings(input.record_ids, `${path}.record_ids`);
  const description = input.description === null
    ? null
    : string(input.description, `${path}.description`);
  if (kind === "unknown" && recordIds.length > 0) {
    throw new Error(`${path}: unknown extent cannot carry record ids`);
  }
  if (kind !== "unknown" && recordIds.length === 0) {
    throw new Error(`${path}: ${kind} extent requires record ids`);
  }
  return {
    kind: kind as ResolvedInterventionExtent["kind"],
    record_ids: recordIds,
    description,
  };
}

function evidenceKey(binding: OperationalOccurrenceEvidenceBinding): string {
  return [
    binding.role,
    binding.record_id,
    binding.source_id,
    binding.evidence_id,
  ].join("|");
}

function parseEvidence(
  value: unknown,
  path: string,
): OperationalOccurrenceEvidenceBinding[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty array`);
  }
  const result = value.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const input = object(entry, entryPath);
    exact(input, evidenceFields, entryPath);
    return {
      role: string(input.role, `${entryPath}.role`) as OperationalOccurrenceEvidenceBinding["role"],
      record_id: string(input.record_id, `${entryPath}.record_id`),
      source_id: string(input.source_id, `${entryPath}.source_id`),
      evidence_id: string(input.evidence_id, `${entryPath}.evidence_id`),
    };
  });
  const keys = result.map(evidenceKey);
  if (
    new Set(keys).size !== keys.length ||
    keys.join("\n") !== [...keys].sort().join("\n")
  ) {
    throw new Error(`${path} must be sorted and unique`);
  }
  return result;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256String(value: unknown, path: string): string {
  const result = string(value, path);
  if (!/^[a-f0-9]{64}$/u.test(result)) {
    throw new Error(`${path} must be a SHA-256 hex string`);
  }
  return result;
}

function parseArtifactPin(
  value: unknown,
  path: string,
): ApplicationSemanticReviewArtifactPin {
  const input = object(value, path);
  exact(input, artifactPinFields, path);
  return {
    path: string(input.path, `${path}.path`),
    sha256: sha256String(input.sha256, `${path}.sha256`),
  };
}

function semanticReviewReceiptProjection(
  review: Omit<
    OperationalOccurrenceApplicationSemanticReview,
    "receipt_id" | "receipt_path"
  >,
): JsonValue {
  return review as unknown as JsonValue;
}

export function operationalOccurrenceApplicationSemanticReviewReceipt(
  review: Omit<
    OperationalOccurrenceApplicationSemanticReview,
    "receipt_id" | "receipt_path"
  >,
): OperationalOccurrenceApplicationSemanticReview {
  const hash = sha256(stableJson(semanticReviewReceiptProjection(review)));
  return {
    ...review,
    receipt_id: `application-semantic-review:${hash}`,
    receipt_path:
      `data/operational-application-semantics/campaigns/plan-053/accepted/receipts/${hash}.json`,
  };
}

export function parseOperationalOccurrenceApplicationSemanticReview(
  value: unknown,
  path: string,
  application: {
    application_id: string;
    action: OperationalOccurrenceApplicationAction;
    extent: ResolvedInterventionExtent;
  },
): OperationalOccurrenceApplicationSemanticReview {
  const input = object(value, path);
  exact(input, semanticReviewFields, path);
  if (input.schema_version !== 1) throw new Error(`${path}.schema_version must be 1`);
  if (input.contract_id !== "plan-053-application-semantic-review-v1") {
    throw new Error(`${path}.contract_id is unsupported`);
  }
  const applicationId = string(input.application_id, `${path}.application_id`);
  if (applicationId !== application.application_id) {
    throw new Error(`${path}.application_id does not bind the application owner`);
  }
  const actionDisposition = string(
    input.action_disposition,
    `${path}.action_disposition`,
  );
  if (actionDisposition !== "resolved" && actionDisposition !== "accepted_unknown") {
    throw new Error(`${path}.action_disposition is unsupported`);
  }
  const actionReason = string(input.action_reason_code, `${path}.action_reason_code`);
  if (!APPLICATION_ACTION_REVIEW_REASON_CODES.includes(
    actionReason as ApplicationActionReviewReasonCode,
  )) {
    throw new Error(`${path}.action_reason_code is unsupported: ${actionReason}`);
  }
  const expectedActionReasons: Record<
    OperationalOccurrenceApplicationAction,
    readonly ApplicationActionReviewReasonCode[]
  > = {
    add: ["source_explicit_addition"],
    modify: ["source_explicit_modification"],
    remove: ["source_explicit_removal"],
    suspend: ["source_explicit_suspension"],
    resume: ["source_explicit_resumption"],
    retain: ["source_explicit_retention"],
    unknown: [
      "action_not_distinguishable_from_source",
      "conflicting_action_evidence",
    ],
  };
  if (
    (application.action === "unknown") !==
      (actionDisposition === "accepted_unknown") ||
    !expectedActionReasons[application.action].includes(
      actionReason as ApplicationActionReviewReasonCode,
    )
  ) {
    throw new Error(`${path}: action claim/disposition/reason disagree`);
  }

  const extentDisposition = string(
    input.extent_disposition,
    `${path}.extent_disposition`,
  );
  if (extentDisposition !== "resolved" && extentDisposition !== "accepted_unknown") {
    throw new Error(`${path}.extent_disposition is unsupported`);
  }
  const extentReason = string(input.extent_reason_code, `${path}.extent_reason_code`);
  if (!APPLICATION_EXTENT_REVIEW_REASON_CODES.includes(
    extentReason as ApplicationExtentReviewReasonCode,
  )) {
    throw new Error(`${path}.extent_reason_code is unsupported: ${extentReason}`);
  }
  const expectedExtentReasons: Record<
    ResolvedInterventionExtent["kind"],
    readonly ApplicationExtentReviewReasonCode[]
  > = {
    route_wide: ["source_explicit_route_wide_scope"],
    bounded_segment: ["source_explicit_bounded_segment"],
    stop_set: ["source_explicit_stop_set"],
    service_pattern: ["source_explicit_service_pattern"],
    unknown: [
      "exact_stop_set_not_enumerated",
      "bounded_endpoints_not_stated",
      "source_explicit_scope_without_canonical_extent_identity",
      "extent_not_distinguishable_from_source",
      "conflicting_extent_evidence",
      "nonphysical_scope_not_exactly_bound",
    ],
  };
  if (
    (application.extent.kind === "unknown") !==
      (extentDisposition === "accepted_unknown") ||
    !expectedExtentReasons[application.extent.kind].includes(
      extentReason as ApplicationExtentReviewReasonCode,
    )
  ) {
    throw new Error(`${path}: extent claim/disposition/reason disagree`);
  }

  const reviewersInput = object(input.reviewers, `${path}.reviewers`);
  exact(reviewersInput, semanticReviewerFields, `${path}.reviewers`);
  const primary = string(reviewersInput.primary, `${path}.reviewers.primary`);
  const independent = string(
    reviewersInput.independent,
    `${path}.reviewers.independent`,
  );
  const adjudicator = reviewersInput.adjudicator === null
    ? null
    : string(reviewersInput.adjudicator, `${path}.reviewers.adjudicator`);
  if (
    primary === independent || adjudicator === primary ||
    adjudicator === independent
  ) {
    throw new Error(`${path}.reviewers must be independent`);
  }

  const proposalInput = object(
    input.proposal_receipts,
    `${path}.proposal_receipts`,
  );
  exact(
    proposalInput,
    semanticProposalReceiptFields,
    `${path}.proposal_receipts`,
  );
  const primaryProposal = parseArtifactPin(
    proposalInput.primary,
    `${path}.proposal_receipts.primary`,
  );
  const independentProposal = parseArtifactPin(
    proposalInput.independent,
    `${path}.proposal_receipts.independent`,
  );
  const adjudicatorProposal = proposalInput.adjudicator === null
    ? null
    : parseArtifactPin(
        proposalInput.adjudicator,
        `${path}.proposal_receipts.adjudicator`,
      );
  if ((adjudicator === null) !== (adjudicatorProposal === null)) {
    throw new Error(`${path}: adjudicator and adjudication receipt disagree`);
  }

  const usageInput = object(input.provider_usage, `${path}.provider_usage`);
  exact(usageInput, zeroProviderUsageFields, `${path}.provider_usage`);
  for (const field of [
    "provider_requests",
    "input_tokens",
    "output_tokens",
    "committed_cost_usd",
    "actual_cost_usd",
  ] as const) {
    if (usageInput[field] !== 0) {
      throw new Error(`${path}.provider_usage.${field} must be zero`);
    }
  }
  for (const field of ["provider", "model", "profile"] as const) {
    if (usageInput[field] !== null) {
      throw new Error(`${path}.provider_usage.${field} must be null`);
    }
  }

  const withoutReceipt = {
    schema_version: 1 as const,
    contract_id: "plan-053-application-semantic-review-v1" as const,
    application_id: applicationId,
    batch_id: string(input.batch_id, `${path}.batch_id`),
    batch_manifest: parseArtifactPin(input.batch_manifest, `${path}.batch_manifest`),
    predecessor_decision_id: string(
      input.predecessor_decision_id,
      `${path}.predecessor_decision_id`,
    ),
    predecessor_membership_fingerprint: sha256String(
      input.predecessor_membership_fingerprint,
      `${path}.predecessor_membership_fingerprint`,
    ),
    action_disposition: actionDisposition as "resolved" | "accepted_unknown",
    action_reason_code: actionReason as ApplicationActionReviewReasonCode,
    action_evidence_bindings: parseEvidence(
      input.action_evidence_bindings,
      `${path}.action_evidence_bindings`,
    ),
    extent_disposition: extentDisposition as "resolved" | "accepted_unknown",
    extent_reason_code: extentReason as ApplicationExtentReviewReasonCode,
    extent_evidence_bindings: parseEvidence(
      input.extent_evidence_bindings,
      `${path}.extent_evidence_bindings`,
    ),
    reviewers: { primary, independent, adjudicator },
    proposal_receipts: {
      primary: primaryProposal,
      independent: independentProposal,
      adjudicator: adjudicatorProposal,
    },
    accepted_at: string(input.accepted_at, `${path}.accepted_at`),
    rationale: string(input.rationale, `${path}.rationale`),
    provider_usage: {
      provider_requests: 0 as const,
      input_tokens: 0 as const,
      output_tokens: 0 as const,
      committed_cost_usd: 0 as const,
      actual_cost_usd: 0 as const,
      provider: null,
      model: null,
      profile: null,
    },
  };
  const expected = operationalOccurrenceApplicationSemanticReviewReceipt(
    withoutReceipt,
  );
  const receiptId = string(input.receipt_id, `${path}.receipt_id`);
  const receiptPath = string(input.receipt_path, `${path}.receipt_path`);
  if (receiptId !== expected.receipt_id || receiptPath !== expected.receipt_path) {
    throw new Error(`${path}: application semantic review receipt is stale`);
  }
  return expected;
}

function applicationIncidence(
  application: Pick<
    OperationalOccurrenceReviewApplication,
    "gtfs_route_id" | "phase_record_id" | "route_record_id" | "treatment_record_id"
  >,
): string {
  return [
    application.route_record_id,
    application.gtfs_route_id,
    application.treatment_record_id,
    application.phase_record_id ?? "",
  ].join("|");
}

function currentMembershipProjection(
  decision: Omit<OperationalOccurrenceAcceptedDecisionV3, "membership_fingerprint">,
): JsonValue {
  return {
    applications: decision.applications,
    evidence_bindings: decision.evidence_bindings,
    founding_key: decision.founding_key,
    observation_event_record_ids: decision.observation_event_record_ids,
    observation_relation_record_ids: decision.observation_relation_record_ids,
    occurrence_id: decision.occurrence_id,
    phase_record_ids: decision.phase_record_ids,
    phase_relation_record_ids: decision.phase_relation_record_ids,
    physical_scope_record_ids: decision.physical_scope_record_ids,
    physical_scope_relation_record_ids: decision.physical_scope_relation_record_ids,
    resolution_cluster_id: decision.resolution_cluster_id,
    resolved_onset: decision.resolved_onset,
    routes: decision.routes,
    treatment: decision.treatment,
  } as unknown as JsonValue;
}

export function operationalOccurrenceCurrentReviewMembershipFingerprint(
  decision: Omit<OperationalOccurrenceAcceptedDecisionV3, "membership_fingerprint">,
): string {
  return createHash("sha256")
    .update(stableJson(currentMembershipProjection(decision)))
    .digest("hex");
}

function parseApplications(
  value: unknown,
  path: string,
  options: { requireSemanticReview: boolean },
): OperationalOccurrenceCurrentReviewApplication[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty array`);
  }
  const applications = value.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const input = object(entry, entryPath);
    const hasSemanticReview = "semantic_review" in input;
    if (options.requireSemanticReview && !hasSemanticReview) {
      throw new Error(`${entryPath}.semantic_review is required for a refinement`);
    }
    exact(
      input,
      hasSemanticReview ? reviewedApplicationFields : applicationFields,
      entryPath,
    );
    const action = string(input.action, `${entryPath}.action`);
    if (
      !OPERATIONAL_OCCURRENCE_APPLICATION_ACTIONS.includes(
        action as OperationalOccurrenceApplicationAction,
      )
    ) {
      throw new Error(`${entryPath}.action is unsupported: ${action}`);
    }
    const phaseRecordId = input.phase_record_id === null
      ? null
      : string(input.phase_record_id, `${entryPath}.phase_record_id`);
    const extent = parseExtent(input.extent, `${entryPath}.extent`);
    const physicalScopeRecordIds = sortedStrings(
      input.physical_scope_record_ids,
      `${entryPath}.physical_scope_record_ids`,
    );
    if (
      stableJson(physicalScopeRecordIds as JsonValue) !==
      stableJson(extent.record_ids as JsonValue)
    ) {
      throw new Error(
        `${entryPath}.physical_scope_record_ids must equal extent.record_ids`,
      );
    }
    const application = {
      application_id: string(input.application_id, `${entryPath}.application_id`),
      route_record_id: string(input.route_record_id, `${entryPath}.route_record_id`),
      gtfs_route_id: string(input.gtfs_route_id, `${entryPath}.gtfs_route_id`),
      treatment_record_id: string(
        input.treatment_record_id,
        `${entryPath}.treatment_record_id`,
      ),
      phase_record_id: phaseRecordId,
      action: action as OperationalOccurrenceApplicationAction,
      physical_scope_record_ids: physicalScopeRecordIds,
      extent,
      evidence_bindings: parseEvidence(
        input.evidence_bindings,
        `${entryPath}.evidence_bindings`,
      ),
    };
    return hasSemanticReview
      ? {
          ...application,
          semantic_review: parseOperationalOccurrenceApplicationSemanticReview(
            input.semantic_review,
            `${entryPath}.semantic_review`,
            application,
          ),
        }
      : application;
  }).sort((left, right) =>
    applicationIncidence(left).localeCompare(applicationIncidence(right))
  );
  const ids = applications.map((application) => application.application_id);
  const incidence = applications.map(applicationIncidence);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${path}: duplicate application owner`);
  }
  if (new Set(incidence).size !== incidence.length) {
    throw new Error(`${path}: duplicate application incidence`);
  }
  return applications;
}

export function parseOperationalOccurrenceAcceptedDecisionV3(
  value: unknown,
  path = "operational occurrence accepted decision v3",
): OperationalOccurrenceAcceptedDecisionV3 {
  const input = object(value, path);
  exact(input, decisionFields, path);
  if (input.schema_version !== OPERATIONAL_OCCURRENCE_CURRENT_REVIEW_SCHEMA_VERSION) {
    throw new Error(`${path}.schema_version must be 3`);
  }
  const operation = string(input.operation, `${path}.operation`);
  if (
    operation !== "establish_current_resolution" &&
    operation !== "supersede_current_resolution"
  ) {
    throw new Error(`${path}.operation is unsupported: ${operation}`);
  }
  const reviewScope = string(input.review_scope, `${path}.review_scope`);
  if (
    (operation === "establish_current_resolution" &&
      reviewScope !== "full_episode_application") ||
    (operation === "supersede_current_resolution" &&
      reviewScope !== "application_resolution_refinement")
  ) {
    throw new Error(`${path}.review_scope does not match operation ${operation}`);
  }
  const applications = parseApplications(
    input.applications,
    `${path}.applications`,
    { requireSemanticReview: operation === "supersede_current_resolution" },
  );

  // Reuse the v2 strict decoders for every unchanged nested review field. The
  // v3-only identity and extent fields are stripped from this compatibility
  // projection; the v3 fingerprint below binds them separately.
  const projectedApplications = applications.map((application) => ({
    route_record_id: application.route_record_id,
    gtfs_route_id: application.gtfs_route_id,
    treatment_record_id: application.treatment_record_id,
    phase_record_id: application.phase_record_id,
    action: application.action,
    physical_scope_record_ids: application.physical_scope_record_ids,
    evidence_bindings: application.evidence_bindings,
  }));
  const compatibilityWithoutFingerprint =
    {
      schema_version: 2 as const,
      decision_id: input.decision_id,
      review_state: input.review_state,
      occurrence_id: input.occurrence_id,
      founding_key: input.founding_key,
      anchor_review_decision_ids: input.anchor_review_decision_ids,
      observation_event_record_ids: input.observation_event_record_ids,
      observation_relation_record_ids: input.observation_relation_record_ids,
      resolution_cluster_id: input.resolution_cluster_id,
      phase_record_ids: input.phase_record_ids,
      phase_relation_record_ids: input.phase_relation_record_ids,
      physical_scope_record_ids: input.physical_scope_record_ids,
      physical_scope_relation_record_ids: input.physical_scope_relation_record_ids,
      resolved_onset: input.resolved_onset,
      routes: input.routes,
      treatment: input.treatment,
      applications: projectedApplications,
      evidence_bindings: input.evidence_bindings,
      reviewers: input.reviewers,
      accepted_at: input.accepted_at,
      rationale: input.rationale,
      review_scope: "full_episode_application" as const,
    } as Omit<OperationalOccurrenceAcceptedDecisionV2, "membership_fingerprint">;
  const projected = parseOperationalOccurrenceAcceptedDecisionV2(
    {
      ...compatibilityWithoutFingerprint,
      membership_fingerprint:
        operationalOccurrenceReviewMembershipFingerprint(
          compatibilityWithoutFingerprint,
        ),
    },
    `${path}.v2_compatibility`,
  );
  const {
    membership_fingerprint: _compatibilityFingerprint,
    ...projectedWithoutFingerprint
  } = projected;
  const common = {
    ...projectedWithoutFingerprint,
    schema_version: 3 as const,
    applications,
  };
  const withoutFingerprint = operation === "establish_current_resolution"
    ? {
        ...common,
        operation: "establish_current_resolution" as const,
        supersedes_decision_id: null,
        supersedes_membership_fingerprint: null,
        review_scope: "full_episode_application" as const,
      }
    : {
        ...common,
        operation: "supersede_current_resolution" as const,
        supersedes_decision_id: string(
          input.supersedes_decision_id,
          `${path}.supersedes_decision_id`,
        ),
        supersedes_membership_fingerprint: string(
          input.supersedes_membership_fingerprint,
          `${path}.supersedes_membership_fingerprint`,
        ),
        review_scope: "application_resolution_refinement" as const,
      };
  if (
    operation === "establish_current_resolution" &&
    (input.supersedes_decision_id !== null ||
      input.supersedes_membership_fingerprint !== null)
  ) {
    throw new Error(`${path}: establishment cannot name a predecessor`);
  }
  const expectedFingerprint =
    operationalOccurrenceCurrentReviewMembershipFingerprint(withoutFingerprint);
  const fingerprint = string(
    input.membership_fingerprint,
    `${path}.membership_fingerprint`,
  );
  if (!/^[a-f0-9]{64}$/u.test(fingerprint) || fingerprint !== expectedFingerprint) {
    throw new Error(`${path}.membership_fingerprint is stale`);
  }
  return { ...withoutFingerprint, membership_fingerprint: fingerprint };
}

function legacyExtent(
  application: OperationalOccurrenceReviewApplication,
): ResolvedInterventionExtent {
  return application.physical_scope_record_ids.length > 0
    ? {
        kind: "bounded_segment",
        record_ids: [...application.physical_scope_record_ids].sort(),
        description: null,
      }
    : { kind: "unknown", record_ids: [], description: null };
}

function baselineApplications(
  decision: OperationalOccurrenceAcceptedDecisionV2,
): OperationalOccurrenceCurrentReviewApplication[] {
  return decision.applications.map((application) => {
    const extent = legacyExtent(application);
    return {
      ...application,
      application_id: resolvedInterventionApplicationIdentity({
        occurrence_id: decision.occurrence_id,
        route_record_id: application.route_record_id,
        treatment_record_id: application.treatment_record_id,
        phase_record_id: application.phase_record_id,
        action: application.action,
        extent,
      }),
      extent,
    };
  });
}

function immutableEpisodeProjection(
  decision: OperationalOccurrenceAcceptedDecisionV2 | OperationalOccurrenceAcceptedDecisionV3,
): JsonValue {
  return {
    anchor_review_decision_ids: decision.anchor_review_decision_ids,
    founding_key: decision.founding_key,
    observation_event_record_ids: decision.observation_event_record_ids,
    observation_relation_record_ids: decision.observation_relation_record_ids,
    occurrence_id: decision.occurrence_id,
    phase_record_ids: decision.phase_record_ids,
    phase_relation_record_ids: decision.phase_relation_record_ids,
    resolution_cluster_id: decision.resolution_cluster_id,
    resolved_onset: decision.resolved_onset,
    routes: decision.routes,
    treatment: decision.treatment,
  } as unknown as JsonValue;
}

function assertApplicationMembership(
  decision: OperationalOccurrenceAcceptedDecisionV3,
): void {
  const routeIds = new Set(
    decision.routes.map((route) =>
      [route.route_record_id, route.gtfs_route_id].join("|")
    ),
  );
  const treatmentIds = new Set(
    decision.treatment.kind === "atomic"
      ? [decision.treatment.member.treatment_record_id]
      : decision.treatment.members.map((member) => member.treatment_record_id),
  );
  const phaseIds = new Set(decision.phase_record_ids);
  const membershipIds = new Set([
    ...decision.observation_event_record_ids,
    ...decision.observation_relation_record_ids,
    ...decision.phase_record_ids,
    ...decision.phase_relation_record_ids,
    ...decision.physical_scope_record_ids,
    ...decision.physical_scope_relation_record_ids,
    ...decision.routes.map((route) => route.route_record_id),
    ...treatmentIds,
  ]);
  for (const application of decision.applications) {
    if (
      !routeIds.has(
        [application.route_record_id, application.gtfs_route_id].join("|"),
      ) ||
      !treatmentIds.has(application.treatment_record_id) ||
      (application.phase_record_id !== null &&
        !phaseIds.has(application.phase_record_id))
    ) {
      throw new Error(
        `${decision.decision_id}: application is outside exact route/treatment/phase membership`,
      );
    }
    if (
      application.extent.record_ids.some((recordId) => !membershipIds.has(recordId)) ||
      application.evidence_bindings.some((binding) => !membershipIds.has(binding.record_id))
    ) {
      throw new Error(
        `${decision.decision_id}: application resolution is outside exact review membership`,
      );
    }
    const semanticReview = application.semantic_review;
    if (decision.operation === "supersede_current_resolution") {
      if (!semanticReview) {
        throw new Error(
          `${decision.decision_id}: application semantic review is required`,
        );
      }
      if (
        semanticReview.predecessor_decision_id !==
          decision.supersedes_decision_id ||
        semanticReview.predecessor_membership_fingerprint !==
          decision.supersedes_membership_fingerprint
      ) {
        throw new Error(
          `${decision.decision_id}: application semantic review predecessor is stale`,
        );
      }
      const applicationEvidence = new Set(
        application.evidence_bindings.map(evidenceKey),
      );
      const semanticEvidence = [
        ...semanticReview.action_evidence_bindings,
        ...semanticReview.extent_evidence_bindings,
      ];
      if (semanticEvidence.some((binding) => !applicationEvidence.has(evidenceKey(binding)))) {
        throw new Error(
          `${decision.decision_id}: semantic review evidence is outside exact application evidence`,
        );
      }
    }
  }
}

function assertPlan053ArtifactPath(
  rootDir: string,
  relativePath: string,
  expectedRoot: string,
): string {
  const campaignRoot = resolve(rootDir, expectedRoot);
  const target = resolve(rootDir, relativePath);
  if (!target.startsWith(`${campaignRoot}/`)) {
    throw new Error(`Plan 053 artifact path escapes its owned root: ${relativePath}`);
  }
  if (!existsSync(target)) throw new Error(`missing Plan 053 artifact: ${relativePath}`);
  return target;
}

export function assertOperationalOccurrenceApplicationSemanticReviewArtifacts(
  review: OperationalOccurrenceApplicationSemanticReview,
  rootDir = repoRoot,
): void {
  const manifestPath = assertPlan053ArtifactPath(
    rootDir,
    review.batch_manifest.path,
    "data/operational-application-semantics/campaigns/plan-053/batches",
  );
  if (sha256(readFileSync(manifestPath)) !== review.batch_manifest.sha256) {
    throw new Error(`Plan 053 batch manifest hash drift: ${review.batch_manifest.path}`);
  }
  for (const pin of [
    review.proposal_receipts.primary,
    review.proposal_receipts.independent,
    review.proposal_receipts.adjudicator,
  ]) {
    if (!pin) continue;
    const proposalPath = assertPlan053ArtifactPath(
      rootDir,
      pin.path,
      "data/operational-application-semantics/campaigns/plan-053/reviews",
    );
    if (sha256(readFileSync(proposalPath)) !== pin.sha256) {
      throw new Error(`Plan 053 proposal receipt hash drift: ${pin.path}`);
    }
  }
  const receiptPath = assertPlan053ArtifactPath(
    rootDir,
    review.receipt_path,
    "data/operational-application-semantics/campaigns/plan-053/accepted/receipts",
  );
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as unknown;
  const parsed = parseOperationalOccurrenceApplicationSemanticReview(
    receipt,
    review.receipt_path,
    {
      application_id: review.application_id,
      action: review.action_disposition === "accepted_unknown"
        ? "unknown"
        : ({
            source_explicit_addition: "add",
            source_explicit_modification: "modify",
            source_explicit_removal: "remove",
            source_explicit_suspension: "suspend",
            source_explicit_resumption: "resume",
            source_explicit_retention: "retain",
          } as Partial<Record<
            ApplicationActionReviewReasonCode,
            OperationalOccurrenceApplicationAction
          >>)[review.action_reason_code]!,
      extent: {
        kind: review.extent_disposition === "accepted_unknown"
          ? "unknown"
          : ({
              source_explicit_route_wide_scope: "route_wide",
              source_explicit_bounded_segment: "bounded_segment",
              source_explicit_stop_set: "stop_set",
              source_explicit_service_pattern: "service_pattern",
            } as Partial<Record<
              ApplicationExtentReviewReasonCode,
              ResolvedInterventionExtent["kind"]
            >>)[review.extent_reason_code]!,
        record_ids: review.extent_disposition === "accepted_unknown" ? [] : ["receipt-validation"],
        description: null,
      },
    },
  );
  if (
    stableJson(parsed as unknown as JsonValue) !==
      stableJson(review as unknown as JsonValue)
  ) {
    throw new Error(`Plan 053 semantic review receipt content drift: ${review.receipt_path}`);
  }
}

function assertAcyclicAndCompletePredecessors(
  baselines: readonly OperationalOccurrenceAcceptedDecisionV2[],
  decisions: readonly OperationalOccurrenceAcceptedDecisionV3[],
): void {
  const roots = decisions.filter((decision) =>
    decision.operation === "establish_current_resolution"
  );
  const refinements = decisions.filter((decision) =>
    decision.operation === "supersede_current_resolution"
  );
  const rootIds = new Set([
    ...baselines.map((decision) => decision.decision_id),
    ...roots.map((decision) => decision.decision_id),
  ]);
  const refinementsById = new Map(
    refinements.map((decision) => [decision.decision_id, decision]),
  );
  for (const decision of refinements) {
    if (
      !rootIds.has(decision.supersedes_decision_id) &&
      !refinementsById.has(decision.supersedes_decision_id)
    ) {
      throw new Error(
        `${decision.decision_id}: missing predecessor ${decision.supersedes_decision_id}`,
      );
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (decisionId: string): void => {
    if (rootIds.has(decisionId) || visited.has(decisionId)) return;
    if (visiting.has(decisionId)) {
      throw new Error(`cyclic current occurrence review lineage at ${decisionId}`);
    }
    const decision = refinementsById.get(decisionId);
    if (!decision) return;
    visiting.add(decisionId);
    visit(decision.supersedes_decision_id);
    visiting.delete(decisionId);
    visited.add(decisionId);
  };
  for (const decision of refinements) visit(decision.decision_id);

  const successorOwners = new Map<string, string>();
  for (const decision of refinements) {
    const prior = successorOwners.get(decision.supersedes_decision_id);
    if (prior) {
      throw new Error(
        `conflicting current head: ${prior} and ${decision.decision_id} supersede ` +
        decision.supersedes_decision_id,
      );
    }
    successorOwners.set(decision.supersedes_decision_id, decision.decision_id);
  }
}

export function replayOperationalOccurrenceCurrentReviews(
  baselines: readonly OperationalOccurrenceAcceptedDecisionV2[],
  currentDecisions: readonly OperationalOccurrenceAcceptedDecisionV3[],
): OperationalOccurrenceCurrentReviewDecision[] {
  const parsedBaselines = baselines.map((decision, index) =>
    parseOperationalOccurrenceAcceptedDecisionV2(decision, `baseline review[${index}]`)
  );
  const parsedCurrent = currentDecisions.map((decision, index) =>
    parseOperationalOccurrenceAcceptedDecisionV3(
      decision,
      `current review refinement[${index}]`,
    )
  );
  const baselineDecisionIds = new Set(parsedBaselines.map((decision) => decision.decision_id));
  if (baselineDecisionIds.size !== parsedBaselines.length) {
    throw new Error("duplicate baseline occurrence review decision_id");
  }
  if (
    new Set(parsedBaselines.map((decision) => decision.occurrence_id)).size !==
    parsedBaselines.length
  ) {
    throw new Error("duplicate baseline occurrence review owner");
  }
  const currentDecisionIds = new Set(parsedCurrent.map((decision) => decision.decision_id));
  if (currentDecisionIds.size !== parsedCurrent.length) {
    throw new Error("duplicate current occurrence review decision_id");
  }
  if (parsedCurrent.some((decision) => baselineDecisionIds.has(decision.decision_id))) {
    throw new Error("current occurrence review decision_id reuses a migration decision");
  }
  for (const decision of parsedCurrent) assertApplicationMembership(decision);
  assertAcyclicAndCompletePredecessors(parsedBaselines, parsedCurrent);

  type ReplayHead = {
    output: OperationalOccurrenceCurrentReviewDecision;
    applications: OperationalOccurrenceCurrentReviewApplication[];
  };
  const decisionsById = new Map<string, ReplayHead>();
  const headsByOccurrence = new Map<string, ReplayHead>();
  for (const baseline of parsedBaselines) {
    const head = { output: baseline, applications: baselineApplications(baseline) };
    decisionsById.set(baseline.decision_id, head);
    headsByOccurrence.set(baseline.occurrence_id, head);
  }

  const establishments = parsedCurrent
    .filter((decision) => decision.operation === "establish_current_resolution")
    .sort((left, right) => left.decision_id.localeCompare(right.decision_id));
  const applicationOwners = new Map<string, string>();
  for (const [occurrenceId, head] of headsByOccurrence) {
    for (const application of head.applications) {
      const priorOwner = applicationOwners.get(application.application_id);
      if (priorOwner) {
        throw new Error(
          `duplicate historical application owner: ${priorOwner} and ${occurrenceId}`,
        );
      }
      applicationOwners.set(application.application_id, occurrenceId);
    }
  }
  for (const establishment of establishments) {
    if (headsByOccurrence.has(establishment.occurrence_id)) {
      throw new Error(
        `${establishment.decision_id}: duplicate current occurrence owner`,
      );
    }
    for (const application of establishment.applications) {
      const expectedId = resolvedInterventionDurableApplicationIdentity({
        occurrence_id: establishment.occurrence_id,
        route_record_id: application.route_record_id,
        treatment_record_id: application.treatment_record_id,
        phase_record_id: application.phase_record_id,
      });
      if (application.application_id !== expectedId) {
        throw new Error(
          `${establishment.decision_id}: new application_id is not durable incidence identity`,
        );
      }
      const priorOwner = applicationOwners.get(application.application_id);
      if (priorOwner) {
        throw new Error(
          `${establishment.decision_id}: duplicate application owner ${priorOwner}`,
        );
      }
      applicationOwners.set(application.application_id, establishment.occurrence_id);
    }
    const head = {
      output: establishment,
      applications: establishment.applications,
    };
    decisionsById.set(establishment.decision_id, head);
    headsByOccurrence.set(establishment.occurrence_id, head);
  }

  const pending = new Map(
    parsedCurrent
      .filter(
        (decision): decision is OperationalOccurrenceSupersedingDecisionV3 =>
          decision.operation === "supersede_current_resolution",
      )
      .map((decision) => [decision.decision_id, decision]),
  );
  const ordered: OperationalOccurrenceSupersedingDecisionV3[] = [];
  const knownDecisionIds = new Set(decisionsById.keys());
  while (pending.size > 0) {
    const ready = [...pending.values()]
      .filter((decision) => knownDecisionIds.has(decision.supersedes_decision_id))
      .sort((left, right) => left.decision_id.localeCompare(right.decision_id));
    if (ready.length === 0) {
      throw new Error("current occurrence review lineage cannot be replayed");
    }
    for (const decision of ready) {
      ordered.push(decision);
      pending.delete(decision.decision_id);
      knownDecisionIds.add(decision.decision_id);
    }
  }
  for (const refinement of ordered) {
    const predecessor = decisionsById.get(refinement.supersedes_decision_id);
    if (!predecessor) {
      throw new Error(
        `${refinement.decision_id}: predecessor is not earlier in replay order`,
      );
    }
    if (
      headsByOccurrence.get(refinement.occurrence_id)?.output.decision_id !==
      refinement.supersedes_decision_id
    ) {
      throw new Error(
        `${refinement.decision_id}: stale predecessor is not the current head`,
      );
    }
    if (
      predecessor.output.occurrence_id !== refinement.occurrence_id ||
      stableJson(immutableEpisodeProjection(predecessor.output)) !==
        stableJson(immutableEpisodeProjection(refinement))
    ) {
      throw new Error(
        `${refinement.decision_id}: refinement changes immutable episode incidence`,
      );
    }
    if (
      predecessor.output.membership_fingerprint !==
      refinement.supersedes_membership_fingerprint
    ) {
      throw new Error(`${refinement.decision_id}: stale predecessor fingerprint`);
    }

    const predecessorByApplication = new Map(
      predecessor.applications.map((application) => [
        application.application_id,
        application,
      ]),
    );
    if (
      predecessorByApplication.size !== refinement.applications.length ||
      refinement.applications.some((application) =>
        !predecessorByApplication.has(application.application_id)
      )
    ) {
      throw new Error(
        `${refinement.decision_id}: application owner set must equal predecessor`,
      );
    }
    for (const application of refinement.applications) {
      const predecessorApplication =
        predecessorByApplication.get(application.application_id)!;
      if (
        applicationIncidence(predecessorApplication) !==
        applicationIncidence(application)
      ) {
        throw new Error(
          `${refinement.decision_id}: durable application incidence changed for ` +
          application.application_id,
        );
      }
    }
    const head = {
      output: refinement,
      applications: refinement.applications,
    };
    decisionsById.set(refinement.decision_id, head);
    headsByOccurrence.set(refinement.occurrence_id, head);
  }
  return [...headsByOccurrence.values()]
    .map((head) => head.output)
    .sort((left, right) => left.decision_id.localeCompare(right.decision_id));
}

export function operationalOccurrenceCurrentReviewDir(
  rootDir = repoRoot,
): string {
  return join(
    rootDir,
    "data",
    "operational-occurrence-review",
    "accepted-current",
    "decisions",
  );
}

export function loadOperationalOccurrenceAcceptedDecisionsV3(
  dir = operationalOccurrenceCurrentReviewDir(),
): OperationalOccurrenceAcceptedDecisionV3[] {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir).sort();
  const unsupported = names.filter((name) => !name.endsWith(".json"));
  if (unsupported.length > 0) {
    throw new Error(
      `current occurrence review directory contains unsupported entries: ` +
      unsupported.join(", "),
    );
  }
  const decisions = names.map((name) => {
    const path = join(dir, name);
    const decision = parseOperationalOccurrenceAcceptedDecisionV3(
      JSON.parse(readFileSync(path, "utf8")) as unknown,
      path,
    );
    if (`${decision.decision_id}.json` !== basename(path)) {
      throw new Error(`${path}: decision_id must match the file name`);
    }
    return decision;
  });
  if (new Set(decisions.map((decision) => decision.decision_id)).size !== decisions.length) {
    throw new Error("current occurrence review decision ids must be unique");
  }
  return decisions;
}

export function loadOperationalOccurrenceCurrentReviewDecisions(
  rootDir = repoRoot,
): OperationalOccurrenceCurrentReviewDecision[] {
  const current = loadOperationalOccurrenceAcceptedDecisionsV3(
    operationalOccurrenceCurrentReviewDir(rootDir),
  );
  for (const decision of current) {
    if (decision.operation !== "supersede_current_resolution") continue;
    for (const application of decision.applications) {
      if (!application.semantic_review) {
        throw new Error(
          `${decision.decision_id}: missing Plan 053 application semantic review`,
        );
      }
      assertOperationalOccurrenceApplicationSemanticReviewArtifacts(
        application.semantic_review,
        rootDir,
      );
    }
  }
  return replayOperationalOccurrenceCurrentReviews(
    loadOperationalOccurrenceAcceptedDecisionsV2(
      join(
        rootDir,
        "data",
        "operational-occurrence-review",
        "accepted-v2",
        "decisions",
      ),
    ),
    current,
  );
}

export function operationalOccurrenceCurrentReviewSnapshot(
  decisions: readonly OperationalOccurrenceCurrentReviewDecision[],
): OperationalOccurrenceCurrentReviewSnapshot {
  const sorted = [...decisions].sort((left, right) =>
    left.occurrence_id.localeCompare(right.occurrence_id)
  );
  return {
    snapshot_version: 4,
    decision_schema_versions: [2, 3],
    decision_count: sorted.length,
    decisions: sorted,
  };
}
