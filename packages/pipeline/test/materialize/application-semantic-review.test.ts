import { describe, expect, it } from "bun:test";
import {
  assertPlan053ProposalAgainstManifest,
  plan053ApplicationSemanticProposalReceipt,
  reconcilePlan053Proposals,
  type Plan053ApplicationSemanticClaim,
  type Plan053ApplicationSemanticProposal,
  type Plan053BatchManifest,
} from "@mta-wiki/pipeline/materialize/application-semantic-review";

const evidence = {
  role: "treatment_definition",
  record_id: "treatment_one",
  source_id: "source_one",
  evidence_id: "source_one#p001_b0001",
};

const manifest: Plan053BatchManifest = {
  schema_version: 1,
  contract_id: "plan-053-application-batch-manifest-v1",
  batch_id: "fixture-batch",
  application_ids: ["application:one"],
  applications: [{
    application_id: "application:one",
    incidence: {
      route_record_id: "route_one",
      gtfs_route_id: "ONE",
      treatment_record_id: "treatment_one",
      treatment_family: "service_pattern",
      phase_record_id: "event_one",
    },
    predecessor: {
      decision_id: "decision:one",
      membership_fingerprint: "a".repeat(64),
    },
    starting_claim: {
      action: "unknown",
      extent: { kind: "unknown", record_ids: [], description: null },
    },
    evidence_pins: [{
      ...evidence,
      canonical_record_sha256: "b".repeat(64),
      block_text_sha256: "c".repeat(64),
    }],
  }],
  evidence_records: [{
    record_id: "treatment_one",
    record_kind: "treatment_component",
    payload: { treatment_family: "service_pattern" },
  }],
  reviewers: {
    primary_reviewer: "reviewer-primary",
    required_independent_reviewer: "reviewer-independent",
    disagreement_adjudicator: "reviewer-adjudicator",
  },
};

function reviewedClaim(
  overrides: Partial<Plan053ApplicationSemanticClaim> = {},
): Plan053ApplicationSemanticClaim {
  return {
    application_id: "application:one",
    action: "add",
    action_reason_code: "source_explicit_addition",
    action_evidence_bindings: [evidence],
    extent: {
      kind: "service_pattern",
      record_ids: ["treatment_one"],
      description: "reviewed service pattern",
    },
    extent_reason_code: "source_explicit_service_pattern",
    extent_evidence_bindings: [evidence],
    rationale: "The source explicitly adds this exact service pattern.",
    ...overrides,
  };
}

function proposal(
  role: Plan053ApplicationSemanticProposal["reviewer_role"],
  claim = reviewedClaim(),
): Plan053ApplicationSemanticProposal {
  const reviewer = role === "primary"
    ? "reviewer-primary"
    : role === "independent"
      ? "reviewer-independent"
      : "reviewer-adjudicator";
  return plan053ApplicationSemanticProposalReceipt({
    schema_version: 1,
    contract_id: "plan-053-application-semantic-proposal-v1",
    batch_id: "fixture-batch",
    batch_manifest_path: "data/operational-application-semantics/campaigns/plan-053/batches/fixture-batch.json",
    batch_manifest_sha256: "d".repeat(64),
    reviewer_id: reviewer,
    reviewer_role: role,
    reviewed_at: "2026-07-31T00:00:00Z",
    claims: [claim],
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
}

const pin = {
  manifestPath: "data/operational-application-semantics/campaigns/plan-053/batches/fixture-batch.json",
  manifestSha256: "d".repeat(64),
};

describe("Plan 053 application semantic review portfolio", () => {
  it("accepts independent agreement on an evidence-bound exact application claim", () => {
    const primary = proposal("primary");
    const independent = proposal("independent");
    assertPlan053ProposalAgainstManifest(manifest, primary, pin);
    expect(reconcilePlan053Proposals({
      manifest,
      ...pin,
      primary,
      independent,
    })).toEqual({ claims: primary.claims, disagreement_count: 0 });
  });

  it("requires a clean-room adjudication when claim projections disagree", () => {
    const primary = proposal("primary");
    const independent = proposal("independent", reviewedClaim({
      action: "unknown",
      action_reason_code: "action_not_distinguishable_from_source",
    }));
    expect(() => reconcilePlan053Proposals({
      manifest,
      ...pin,
      primary,
      independent,
    })).toThrow("requires clean-room adjudication");
    const adjudicator = proposal("adjudicator");
    expect(reconcilePlan053Proposals({
      manifest,
      ...pin,
      primary,
      independent,
      adjudicator,
    }).disagreement_count).toBe(1);
  });

  it("rejects evidence-free unknowns, stale manifests, and incidence-drifting extents", () => {
    expect(() => assertPlan053ProposalAgainstManifest(
      manifest,
      proposal("primary", reviewedClaim({
        action: "unknown",
        action_reason_code: "action_not_distinguishable_from_source",
        action_evidence_bindings: [],
      })),
      pin,
    )).toThrow("non-empty array");

    expect(() => assertPlan053ProposalAgainstManifest(
      manifest,
      proposal("primary"),
      { ...pin, manifestSha256: "e".repeat(64) },
    )).toThrow("manifest binding is stale");

    expect(() => assertPlan053ProposalAgainstManifest(
      manifest,
      proposal("primary", reviewedClaim({
        extent: {
          kind: "service_pattern",
          record_ids: ["treatment_other"],
          description: "drifted",
        },
      })),
      pin,
    )).toThrow("must bind the exact treatment identity");
  });

  it("rejects duplicate/missing owners and nonzero provider usage", () => {
    const duplicate = proposal("primary");
    duplicate.claims.push(duplicate.claims[0]!);
    expect(() => assertPlan053ProposalAgainstManifest(manifest, duplicate, pin))
      .toThrow();

    const missing = proposal("primary");
    missing.claims = [];
    expect(() => assertPlan053ProposalAgainstManifest(manifest, missing, pin))
      .toThrow();

    const paid = proposal("primary") as unknown as Record<string, unknown>;
    paid.provider_usage = {
      provider_requests: 1,
      input_tokens: 1,
      output_tokens: 1,
      committed_cost_usd: 1,
      actual_cost_usd: 1,
      provider: "forbidden",
      model: "forbidden",
      profile: "forbidden",
    };
    expect(() => assertPlan053ProposalAgainstManifest(
      manifest,
      paid as unknown as Plan053ApplicationSemanticProposal,
      pin,
    )).toThrow("provider_usage");
  });
});
