import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  operationalOccurrenceApplicationSemanticReviewReceipt,
  parseOperationalOccurrenceApplicationSemanticReview,
  type ApplicationActionReviewReasonCode,
  type ApplicationExtentReviewReasonCode,
  type OperationalOccurrenceApplicationSemanticReview,
} from "./operational-occurrence-resolution.js";
import type {
  OperationalOccurrenceApplicationAction,
} from "./operational-occurrence-review.js";
import type { OperationalOccurrenceEvidenceBinding } from "./operational-occurrences.js";
import type { ResolvedInterventionExtent } from "./resolved-intervention-applications.js";

export const PLAN_053_PROPOSAL_CONTRACT_ID =
  "plan-053-application-semantic-proposal-v1" as const;

export type Plan053ApplicationSemanticClaim = {
  application_id: string;
  action: OperationalOccurrenceApplicationAction;
  action_reason_code: ApplicationActionReviewReasonCode;
  action_evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  extent: ResolvedInterventionExtent;
  extent_reason_code: ApplicationExtentReviewReasonCode;
  extent_evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  rationale: string;
};

export type Plan053ApplicationSemanticProposal = {
  schema_version: 1;
  contract_id: typeof PLAN_053_PROPOSAL_CONTRACT_ID;
  batch_id: string;
  batch_manifest_path: string;
  batch_manifest_sha256: string;
  reviewer_id: string;
  reviewer_role: "primary" | "independent" | "adjudicator";
  reviewed_at: string;
  claims: Plan053ApplicationSemanticClaim[];
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
};

export type Plan053BatchApplication = {
  application_id: string;
  incidence: {
    route_record_id: string;
    gtfs_route_id: string;
    treatment_record_id: string;
    treatment_family: string;
    phase_record_id: string | null;
  };
  predecessor: {
    decision_id: string;
    membership_fingerprint: string;
  };
  starting_claim: {
    action: OperationalOccurrenceApplicationAction;
    extent: ResolvedInterventionExtent;
  };
  evidence_pins: Array<OperationalOccurrenceEvidenceBinding & {
    canonical_record_sha256: string;
    block_text_sha256: string;
  }>;
};

export type Plan053BatchManifest = {
  schema_version: 1;
  contract_id: "plan-053-application-batch-manifest-v1";
  batch_id: string;
  application_ids: string[];
  applications: Plan053BatchApplication[];
  evidence_records: Array<Record<string, unknown>>;
  reviewers: {
    primary_reviewer: string;
    required_independent_reviewer: string;
    disagreement_adjudicator: string;
  };
};

const proposalFields = new Set([
  "batch_id",
  "batch_manifest_path",
  "batch_manifest_sha256",
  "claims",
  "contract_id",
  "provider_usage",
  "receipt_id",
  "reviewed_at",
  "reviewer_id",
  "reviewer_role",
  "schema_version",
]);
const claimFields = new Set([
  "action",
  "action_evidence_bindings",
  "action_reason_code",
  "application_id",
  "extent",
  "extent_evidence_bindings",
  "extent_reason_code",
  "rationale",
]);
const extentFields = new Set(["description", "kind", "record_ids"]);
const evidenceFields = new Set(["evidence_id", "record_id", "role", "source_id"]);
const usageFields = new Set([
  "actual_cost_usd",
  "committed_cost_usd",
  "input_tokens",
  "model",
  "output_tokens",
  "profile",
  "provider",
  "provider_requests",
]);
const actionValues = new Set<OperationalOccurrenceApplicationAction>([
  "add", "modify", "remove", "suspend", "resume", "retain", "unknown",
]);
const extentValues = new Set<ResolvedInterventionExtent["kind"]>([
  "route_wide", "bounded_segment", "stop_set", "service_pattern", "unknown",
]);

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exact(
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
  path: string,
): void {
  const extras = Object.keys(value).filter((field) => !fields.has(field)).sort();
  const missing = [...fields].filter((field) => !(field in value)).sort();
  if (extras.length > 0 || missing.length > 0) {
    throw new Error(
      `${path}: exact fields required; unknown=${extras.join(",")}; ` +
      `missing=${missing.join(",")}`,
    );
  }
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function hash(value: unknown, path: string): string {
  const result = string(value, path);
  if (!/^[a-f0-9]{64}$/u.test(result)) {
    throw new Error(`${path} must be a SHA-256 hex string`);
  }
  return result;
}

function evidenceKey(binding: OperationalOccurrenceEvidenceBinding): string {
  return [binding.role, binding.record_id, binding.source_id, binding.evidence_id]
    .join("|");
}

function evidence(
  value: unknown,
  path: string,
): OperationalOccurrenceEvidenceBinding[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty array`);
  }
  const rows = value.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const input = object(entry, entryPath);
    exact(input, evidenceFields, entryPath);
    return {
      evidence_id: string(input.evidence_id, `${entryPath}.evidence_id`),
      record_id: string(input.record_id, `${entryPath}.record_id`),
      role: string(input.role, `${entryPath}.role`) as OperationalOccurrenceEvidenceBinding["role"],
      source_id: string(input.source_id, `${entryPath}.source_id`),
    };
  });
  const keys = rows.map(evidenceKey);
  if (
    new Set(keys).size !== keys.length ||
    keys.join("\n") !== [...keys].sort().join("\n")
  ) {
    throw new Error(`${path} must be sorted and unique`);
  }
  return rows;
}

function extent(value: unknown, path: string): ResolvedInterventionExtent {
  const input = object(value, path);
  exact(input, extentFields, path);
  const kind = string(input.kind, `${path}.kind`);
  if (!extentValues.has(kind as ResolvedInterventionExtent["kind"])) {
    throw new Error(`${path}.kind is unsupported: ${kind}`);
  }
  if (!Array.isArray(input.record_ids)) throw new Error(`${path}.record_ids must be an array`);
  const recordIds = input.record_ids.map((entry, index) =>
    string(entry, `${path}.record_ids[${index}]`)
  );
  if (
    new Set(recordIds).size !== recordIds.length ||
    recordIds.join("\n") !== [...recordIds].sort().join("\n")
  ) {
    throw new Error(`${path}.record_ids must be sorted and unique`);
  }
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

function zeroUsage(value: unknown, path: string): Plan053ApplicationSemanticProposal["provider_usage"] {
  const input = object(value, path);
  exact(input, usageFields, path);
  for (const field of [
    "provider_requests", "input_tokens", "output_tokens",
    "committed_cost_usd", "actual_cost_usd",
  ] as const) {
    if (input[field] !== 0) throw new Error(`${path}.${field} must be zero`);
  }
  for (const field of ["provider", "model", "profile"] as const) {
    if (input[field] !== null) throw new Error(`${path}.${field} must be null`);
  }
  return {
    provider_requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    committed_cost_usd: 0,
    actual_cost_usd: 0,
    provider: null,
    model: null,
    profile: null,
  };
}

function proposalProjection(
  proposal: Omit<Plan053ApplicationSemanticProposal, "receipt_id">,
): JsonValue {
  return proposal as unknown as JsonValue;
}

export function plan053ApplicationSemanticProposalReceipt(
  proposal: Omit<Plan053ApplicationSemanticProposal, "receipt_id">,
): Plan053ApplicationSemanticProposal {
  return {
    ...proposal,
    receipt_id:
      `application-semantic-proposal:${sha256(stableJson(proposalProjection(proposal)))}`,
  };
}

export function parsePlan053ApplicationSemanticProposal(
  value: unknown,
  path = "Plan 053 application semantic proposal",
): Plan053ApplicationSemanticProposal {
  const input = object(value, path);
  exact(input, proposalFields, path);
  if (input.schema_version !== 1 || input.contract_id !== PLAN_053_PROPOSAL_CONTRACT_ID) {
    throw new Error(`${path}: unsupported schema or contract`);
  }
  const role = string(input.reviewer_role, `${path}.reviewer_role`);
  if (role !== "primary" && role !== "independent" && role !== "adjudicator") {
    throw new Error(`${path}.reviewer_role is unsupported: ${role}`);
  }
  if (!Array.isArray(input.claims) || input.claims.length === 0) {
    throw new Error(`${path}.claims must be a non-empty array`);
  }
  const claims = input.claims.map((entry, index): Plan053ApplicationSemanticClaim => {
    const claimPath = `${path}.claims[${index}]`;
    const claim = object(entry, claimPath);
    exact(claim, claimFields, claimPath);
    const action = string(claim.action, `${claimPath}.action`);
    if (!actionValues.has(action as OperationalOccurrenceApplicationAction)) {
      throw new Error(`${claimPath}.action is unsupported: ${action}`);
    }
    return {
      application_id: string(claim.application_id, `${claimPath}.application_id`),
      action: action as OperationalOccurrenceApplicationAction,
      action_reason_code: string(
        claim.action_reason_code,
        `${claimPath}.action_reason_code`,
      ) as ApplicationActionReviewReasonCode,
      action_evidence_bindings: evidence(
        claim.action_evidence_bindings,
        `${claimPath}.action_evidence_bindings`,
      ),
      extent: extent(claim.extent, `${claimPath}.extent`),
      extent_reason_code: string(
        claim.extent_reason_code,
        `${claimPath}.extent_reason_code`,
      ) as ApplicationExtentReviewReasonCode,
      extent_evidence_bindings: evidence(
        claim.extent_evidence_bindings,
        `${claimPath}.extent_evidence_bindings`,
      ),
      rationale: string(claim.rationale, `${claimPath}.rationale`),
    };
  }).sort((left, right) => left.application_id.localeCompare(right.application_id));
  if (new Set(claims.map((claim) => claim.application_id)).size !== claims.length) {
    throw new Error(`${path}.claims contain duplicate application owners`);
  }
  const withoutReceipt = {
    schema_version: 1 as const,
    contract_id: PLAN_053_PROPOSAL_CONTRACT_ID,
    batch_id: string(input.batch_id, `${path}.batch_id`),
    batch_manifest_path: string(
      input.batch_manifest_path,
      `${path}.batch_manifest_path`,
    ),
    batch_manifest_sha256: hash(
      input.batch_manifest_sha256,
      `${path}.batch_manifest_sha256`,
    ),
    reviewer_id: string(input.reviewer_id, `${path}.reviewer_id`),
    reviewer_role: role as Plan053ApplicationSemanticProposal["reviewer_role"],
    reviewed_at: string(input.reviewed_at, `${path}.reviewed_at`),
    claims,
    provider_usage: zeroUsage(input.provider_usage, `${path}.provider_usage`),
  };
  const expected = plan053ApplicationSemanticProposalReceipt(withoutReceipt);
  if (string(input.receipt_id, `${path}.receipt_id`) !== expected.receipt_id) {
    throw new Error(`${path}.receipt_id is stale`);
  }
  return expected;
}

function claimProjection(claim: Plan053ApplicationSemanticClaim): JsonValue {
  const { rationale: _rationale, ...semantic } = claim;
  return semantic as unknown as JsonValue;
}

function assertClaimForManifest(
  manifest: Plan053BatchManifest,
  claim: Plan053ApplicationSemanticClaim,
): void {
  const application = manifest.applications.find((row) =>
    row.application_id === claim.application_id
  );
  if (!application) throw new Error(`claim is outside manifest: ${claim.application_id}`);
  const evidenceKeys = new Set(application.evidence_pins.map(evidenceKey));
  if ([
    ...claim.action_evidence_bindings,
    ...claim.extent_evidence_bindings,
  ].some((binding) => !evidenceKeys.has(evidenceKey(binding)))) {
    throw new Error(`${claim.application_id}: claim evidence is outside frozen evidence pins`);
  }
  if (
    claim.extent.kind === "route_wide" &&
    stableJson(claim.extent.record_ids as JsonValue) !==
      stableJson([application.incidence.route_record_id] as JsonValue)
  ) {
    throw new Error(`${claim.application_id}: route-wide extent must bind the exact route`);
  }
  if (
    claim.extent.kind === "service_pattern" &&
    stableJson(claim.extent.record_ids as JsonValue) !==
      stableJson([application.incidence.treatment_record_id] as JsonValue)
  ) {
    throw new Error(
      `${claim.application_id}: service-pattern extent must bind the exact treatment identity`,
    );
  }
  if (claim.extent.kind === "bounded_segment") {
    const recordKind = new Map(manifest.evidence_records.map((record) => [
      String(record.record_id),
      String(record.record_kind),
    ]));
    if (claim.extent.record_ids.some((recordId) =>
      recordKind.get(recordId) !== "corridor" &&
      !application.starting_claim.extent.record_ids.includes(recordId)
    )) {
      throw new Error(
        `${claim.application_id}: bounded segment lacks an exact corridor identity`,
      );
    }
  }
  if (claim.extent.kind === "stop_set") {
    const records = new Map(manifest.evidence_records.map((record) => [
      String(record.record_id),
      record,
    ]));
    if (claim.extent.record_ids.some((recordId) => {
      const record = records.get(recordId);
      if (!record) return true;
      const payload = object(record.payload ?? {}, `canonical ${recordId}.payload`);
      return !("stop_id" in payload || "stop_ids" in payload);
    })) {
      throw new Error(`${claim.application_id}: stop-set extent lacks exact stop identities`);
    }
  }

  const review = operationalOccurrenceApplicationSemanticReviewReceipt({
    schema_version: 1,
    contract_id: "plan-053-application-semantic-review-v1",
    application_id: claim.application_id,
    batch_id: manifest.batch_id,
    batch_manifest: { path: "fixture", sha256: "0".repeat(64) },
    predecessor_decision_id: application.predecessor.decision_id,
    predecessor_membership_fingerprint:
      application.predecessor.membership_fingerprint,
    action_disposition: claim.action === "unknown" ? "accepted_unknown" : "resolved",
    action_reason_code: claim.action_reason_code,
    action_evidence_bindings: claim.action_evidence_bindings,
    extent_disposition: claim.extent.kind === "unknown" ? "accepted_unknown" : "resolved",
    extent_reason_code: claim.extent_reason_code,
    extent_evidence_bindings: claim.extent_evidence_bindings,
    reviewers: { primary: "primary", independent: "independent", adjudicator: null },
    proposal_receipts: {
      primary: { path: "primary", sha256: "1".repeat(64) },
      independent: { path: "independent", sha256: "2".repeat(64) },
      adjudicator: null,
    },
    accepted_at: "2026-07-31T00:00:00Z",
    rationale: claim.rationale,
    provider_usage: {
      provider_requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      committed_cost_usd: 0,
      actual_cost_usd: 0,
      provider: null,
      model: null,
      profile: null,
    },
  });
  parseOperationalOccurrenceApplicationSemanticReview(
    review,
    `${claim.application_id}.semantic_review`,
    { application_id: claim.application_id, action: claim.action, extent: claim.extent },
  );
}

export function assertPlan053ProposalAgainstManifest(
  manifest: Plan053BatchManifest,
  proposal: Plan053ApplicationSemanticProposal,
  input: { manifestPath: string; manifestSha256: string },
): void {
  proposal = parsePlan053ApplicationSemanticProposal(
    proposal,
    `${proposal.reviewer_role ?? "unknown"} proposal`,
  );
  if (
    proposal.batch_id !== manifest.batch_id ||
    proposal.batch_manifest_path !== input.manifestPath ||
    proposal.batch_manifest_sha256 !== input.manifestSha256
  ) {
    throw new Error(`${proposal.receipt_id}: proposal manifest binding is stale`);
  }
  const expectedReviewer = proposal.reviewer_role === "primary"
    ? manifest.reviewers.primary_reviewer
    : proposal.reviewer_role === "independent"
      ? manifest.reviewers.required_independent_reviewer
      : manifest.reviewers.disagreement_adjudicator;
  if (proposal.reviewer_id !== expectedReviewer) {
    throw new Error(`${proposal.receipt_id}: reviewer assignment does not match manifest`);
  }
  const ids = proposal.claims.map((claim) => claim.application_id).sort();
  if (
    stableJson(ids as JsonValue) !==
      stableJson([...manifest.application_ids].sort() as JsonValue)
  ) {
    throw new Error(`${proposal.receipt_id}: proposal does not cover its manifest exactly`);
  }
  for (const claim of proposal.claims) assertClaimForManifest(manifest, claim);
}

export function reconcilePlan053Proposals(input: {
  manifest: Plan053BatchManifest;
  manifestPath: string;
  manifestSha256: string;
  primary: Plan053ApplicationSemanticProposal;
  independent: Plan053ApplicationSemanticProposal;
  adjudicator?: Plan053ApplicationSemanticProposal | undefined;
}): { claims: Plan053ApplicationSemanticClaim[]; disagreement_count: number } {
  assertPlan053ProposalAgainstManifest(input.manifest, input.primary, {
    manifestPath: input.manifestPath,
    manifestSha256: input.manifestSha256,
  });
  assertPlan053ProposalAgainstManifest(input.manifest, input.independent, {
    manifestPath: input.manifestPath,
    manifestSha256: input.manifestSha256,
  });
  if (
    input.primary.reviewer_role !== "primary" ||
    input.independent.reviewer_role !== "independent" ||
    input.primary.reviewer_id === input.independent.reviewer_id
  ) {
    throw new Error("Plan 053 primary and independent reviews are not independent");
  }
  const primary = new Map(input.primary.claims.map((claim) => [
    claim.application_id,
    claim,
  ]));
  const independent = new Map(input.independent.claims.map((claim) => [
    claim.application_id,
    claim,
  ]));
  const disagreements = input.manifest.application_ids.filter((applicationId) =>
    stableJson(claimProjection(primary.get(applicationId)!)) !==
      stableJson(claimProjection(independent.get(applicationId)!))
  );
  if (disagreements.length === 0) {
    if (input.adjudicator) {
      throw new Error("Plan 053 adjudication is not allowed without a disagreement");
    }
    return {
      claims: [...primary.values()].sort((left, right) =>
        left.application_id.localeCompare(right.application_id)
      ),
      disagreement_count: 0,
    };
  }
  if (!input.adjudicator) {
    throw new Error(
      `Plan 053 proposal disagreement requires clean-room adjudication: ` +
      disagreements.join(", "),
    );
  }
  assertPlan053ProposalAgainstManifest(input.manifest, input.adjudicator, {
    manifestPath: input.manifestPath,
    manifestSha256: input.manifestSha256,
  });
  if (input.adjudicator.reviewer_role !== "adjudicator") {
    throw new Error("Plan 053 disagreement proposal is not an adjudication");
  }
  const adjudicated = new Map(input.adjudicator.claims.map((claim) => [
    claim.application_id,
    claim,
  ]));
  const disagreementOwners = new Set(disagreements);
  return {
    claims: input.manifest.application_ids.map((applicationId) =>
      disagreementOwners.has(applicationId)
        ? adjudicated.get(applicationId)!
        : primary.get(applicationId)!
    ).sort((left, right) =>
      left.application_id.localeCompare(right.application_id)
    ),
    disagreement_count: disagreements.length,
  };
}

export function loadPlan053BatchManifest(
  path: string,
  rootDir = repoRoot,
): { manifest: Plan053BatchManifest; sha256: string } {
  const absolute = join(rootDir, path);
  if (!existsSync(absolute)) throw new Error(`missing Plan 053 manifest: ${path}`);
  const bytes = readFileSync(absolute);
  const manifest = JSON.parse(bytes.toString("utf8")) as Plan053BatchManifest;
  if (
    manifest.schema_version !== 1 ||
    manifest.contract_id !== "plan-053-application-batch-manifest-v1"
  ) {
    throw new Error(`unsupported Plan 053 manifest: ${path}`);
  }
  return { manifest, sha256: sha256(bytes) };
}
