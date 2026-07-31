import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  loadOperationalOccurrenceAcceptedDecisionsV2,
  type OperationalOccurrenceAcceptedDecisionV2,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-review";
import {
  operationalOccurrenceApplicationSemanticReviewReceipt,
  operationalOccurrenceCurrentReviewMembershipFingerprint,
  parseOperationalOccurrenceAcceptedDecisionV3,
  replayOperationalOccurrenceCurrentReviews,
  type OperationalOccurrenceAcceptedDecisionV3,
  type OperationalOccurrenceCurrentReviewApplication,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-resolution";
import {
  resolvedInterventionDurableApplicationIdentity,
  resolvedInterventionApplicationIdentity,
} from "@mta-wiki/pipeline/materialize/resolved-intervention-applications";

const historicalDir = join(
  repoRoot,
  "data",
  "operational-occurrence-review",
  "accepted-v2",
  "decisions",
);

function evidenceKey(value: {
  role: string;
  record_id: string;
  source_id: string;
  evidence_id: string;
}): string {
  return [value.role, value.record_id, value.source_id, value.evidence_id].join("|");
}

function baselineApplication(
  baseline: OperationalOccurrenceAcceptedDecisionV2,
  index: number,
): OperationalOccurrenceCurrentReviewApplication {
  const application = baseline.applications[index]!;
  const extent = application.physical_scope_record_ids.length > 0
    ? {
        kind: "bounded_segment" as const,
        record_ids: [...application.physical_scope_record_ids].sort(),
        description: null,
      }
    : { kind: "unknown" as const, record_ids: [], description: null };
  return {
    ...application,
    application_id: resolvedInterventionApplicationIdentity({
      occurrence_id: baseline.occurrence_id,
      route_record_id: application.route_record_id,
      treatment_record_id: application.treatment_record_id,
      phase_record_id: application.phase_record_id,
      action: application.action,
      extent,
    }),
    extent,
  };
}

function refinement(
  baseline: OperationalOccurrenceAcceptedDecisionV2,
  decisionId: string,
): OperationalOccurrenceAcceptedDecisionV3 {
  const sourceBinding = baseline.applications[0]!.evidence_bindings[0]!;
  const scopeBinding = {
    role: "physical_scope" as const,
    record_id: "corridor_reviewed_segment",
    source_id: sourceBinding.source_id,
    evidence_id: sourceBinding.evidence_id,
  };
  const applications = baseline.applications.map((_application, index) => {
    const current = baselineApplication(baseline, index);
    const refined = index === 0
      ? {
          ...current,
          action: "add" as const,
          physical_scope_record_ids: ["corridor_reviewed_segment"],
          extent: {
            kind: "bounded_segment" as const,
            record_ids: ["corridor_reviewed_segment"],
            description: "Reviewed bounded segment.",
          },
          evidence_bindings: [...current.evidence_bindings, scopeBinding]
            .sort((left, right) => evidenceKey(left).localeCompare(evidenceKey(right))),
        }
      : current;
    const actionEvidence = refined.evidence_bindings.filter((binding) =>
      binding.role === "treatment_definition"
    );
    const extentEvidence = refined.evidence_bindings.filter((binding) =>
      binding.role === "physical_scope"
    );
    return {
      ...refined,
      semantic_review: operationalOccurrenceApplicationSemanticReviewReceipt({
        schema_version: 1,
        contract_id: "plan-053-application-semantic-review-v1",
        application_id: refined.application_id,
        batch_id: "fixture-batch",
        batch_manifest: {
          path: "data/operational-application-semantics/campaigns/plan-053/batches/fixture-batch.json",
          sha256: "1".repeat(64),
        },
        predecessor_decision_id: baseline.decision_id,
        predecessor_membership_fingerprint: baseline.membership_fingerprint,
        action_disposition: refined.action === "unknown"
          ? "accepted_unknown"
          : "resolved",
        action_reason_code: refined.action === "unknown"
          ? "action_not_distinguishable_from_source"
          : "source_explicit_addition",
        action_evidence_bindings: actionEvidence.length > 0
          ? actionEvidence
          : [refined.evidence_bindings[0]!],
        extent_disposition: refined.extent.kind === "unknown"
          ? "accepted_unknown"
          : "resolved",
        extent_reason_code: refined.extent.kind === "unknown"
          ? "extent_not_distinguishable_from_source"
          : "source_explicit_bounded_segment",
        extent_evidence_bindings: extentEvidence.length > 0
          ? extentEvidence
          : [refined.evidence_bindings[0]!],
        reviewers: {
          primary: "fixture-primary",
          independent: "fixture-independent",
          adjudicator: null,
        },
        proposal_receipts: {
          primary: {
            path: "data/operational-application-semantics/campaigns/plan-053/reviews/fixture-primary.json",
            sha256: "2".repeat(64),
          },
          independent: {
            path: "data/operational-application-semantics/campaigns/plan-053/reviews/fixture-independent.json",
            sha256: "3".repeat(64),
          },
          adjudicator: null,
        },
        accepted_at: "2026-07-31T00:00:00Z",
        rationale: "Fixture semantic review is bound to exact evidence.",
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
      }),
    };
  });
  const withoutFingerprint = {
    ...baseline,
    schema_version: 3 as const,
    decision_id: decisionId,
    operation: "supersede_current_resolution" as const,
    supersedes_decision_id: baseline.decision_id,
    supersedes_membership_fingerprint: baseline.membership_fingerprint,
    physical_scope_record_ids: ["corridor_reviewed_segment"],
    applications,
    evidence_bindings: [...baseline.evidence_bindings, scopeBinding]
      .sort((left, right) => evidenceKey(left).localeCompare(evidenceKey(right))),
    reviewers: ["fixture-reviewer"],
    accepted_at: "2026-07-29T00:00:00Z",
    rationale: "Evidence-bound action and bounded-segment refinement.",
    review_scope: "application_resolution_refinement" as const,
  };
  const { membership_fingerprint: _old, ...currentWithoutFingerprint } =
    withoutFingerprint;
  return parseOperationalOccurrenceAcceptedDecisionV3({
    ...currentWithoutFingerprint,
    membership_fingerprint:
      operationalOccurrenceCurrentReviewMembershipFingerprint(
        currentWithoutFingerprint,
      ),
  });
}

function establishment(
  baseline: OperationalOccurrenceAcceptedDecisionV2,
  decisionId: string,
  occurrenceId: string,
): OperationalOccurrenceAcceptedDecisionV3 {
  const applications = baseline.applications.map((_application, index) => {
    const current = baselineApplication(baseline, index);
    return {
      ...current,
      application_id: resolvedInterventionDurableApplicationIdentity({
        occurrence_id: occurrenceId,
        route_record_id: current.route_record_id,
        treatment_record_id: current.treatment_record_id,
        phase_record_id: current.phase_record_id,
      }),
    };
  });
  const {
    membership_fingerprint: _baselineFingerprint,
    ...baselineWithoutFingerprint
  } = baseline;
  const withoutFingerprint = {
    ...baselineWithoutFingerprint,
    schema_version: 3 as const,
    decision_id: decisionId,
    operation: "establish_current_resolution" as const,
    occurrence_id: occurrenceId,
    founding_key: `${baseline.founding_key}:new`,
    supersedes_decision_id: null,
    supersedes_membership_fingerprint: null,
    applications,
    reviewers: ["fixture-reviewer"],
    accepted_at: "2026-07-29T00:00:00Z",
    rationale: "New evidence-bound current resolution.",
    review_scope: "full_episode_application" as const,
  };
  return parseOperationalOccurrenceAcceptedDecisionV3({
    ...withoutFingerprint,
    membership_fingerprint:
      operationalOccurrenceCurrentReviewMembershipFingerprint(
        withoutFingerprint,
      ),
  });
}

function withFingerprint(
  value: Omit<OperationalOccurrenceAcceptedDecisionV3, "membership_fingerprint">,
): OperationalOccurrenceAcceptedDecisionV3 {
  return parseOperationalOccurrenceAcceptedDecisionV3({
    ...value,
    membership_fingerprint:
      operationalOccurrenceCurrentReviewMembershipFingerprint(value),
  });
}

function rebaseRefinement(
  decision: OperationalOccurrenceAcceptedDecisionV3,
  input: {
    decision_id?: string;
    predecessor_decision_id: string;
    predecessor_membership_fingerprint: string;
  },
): OperationalOccurrenceAcceptedDecisionV3 {
  if (decision.operation !== "supersede_current_resolution") {
    throw new Error("fixture rebase requires a superseding decision");
  }
  const applications = decision.applications.map((application) => {
    const review = application.semantic_review!;
    const {
      receipt_id: _receiptId,
      receipt_path: _receiptPath,
      ...withoutReceipt
    } = review;
    return {
      ...application,
      semantic_review: operationalOccurrenceApplicationSemanticReviewReceipt({
        ...withoutReceipt,
        predecessor_decision_id: input.predecessor_decision_id,
        predecessor_membership_fingerprint:
          input.predecessor_membership_fingerprint,
      }),
    };
  });
  const { membership_fingerprint: _fingerprint, ...withoutFingerprint } = decision;
  return withFingerprint({
    ...withoutFingerprint,
    decision_id: input.decision_id ?? decision.decision_id,
    supersedes_decision_id: input.predecessor_decision_id,
    supersedes_membership_fingerprint:
      input.predecessor_membership_fingerprint,
    applications,
  });
}

describe("append-only operational occurrence resolution heads", () => {
  it("accepts a new current resolution without modifying the migration corpus", () => {
    const baseline = loadOperationalOccurrenceAcceptedDecisionsV2(historicalDir)[0]!;
    const added = establishment(
      baseline,
      `${baseline.decision_id}:current-new`,
      `${baseline.occurrence_id}:current-new`,
    );
    const heads = replayOperationalOccurrenceCurrentReviews([baseline], [added]);
    expect(heads).toHaveLength(2);
    const current = heads.find((decision) =>
      decision.occurrence_id === added.occurrence_id
    );
    expect(current).toEqual(added);
    if (current?.schema_version !== 3) {
      throw new Error("expected established v3 head");
    }
    expect(current.applications[0]?.application_id).toBe(
      resolvedInterventionDurableApplicationIdentity({
        occurrence_id: current.occurrence_id,
        route_record_id: current.applications[0]!.route_record_id,
        treatment_record_id: current.applications[0]!.treatment_record_id,
        phase_record_id: current.applications[0]!.phase_record_id,
      }),
    );
  });

  it("refines unknown/unknown without changing historical migration bytes or durable application identity", () => {
    const names = readdirSync(historicalDir).filter((name) => name.endsWith(".json")).sort();
    const before = new Map(names.map((name) => [
      name,
      readFileSync(join(historicalDir, name), "utf8"),
    ]));
    const baselines = loadOperationalOccurrenceAcceptedDecisionsV2(historicalDir);
    const baseline = baselines.find((decision) =>
      decision.applications.length > 0 &&
      decision.applications[0]!.action === "unknown" &&
      decision.applications[0]!.physical_scope_record_ids.length === 0
    )!;
    const reviewed = refinement(baseline, `${baseline.decision_id}:resolution-1`);
    const heads = replayOperationalOccurrenceCurrentReviews(
      baselines,
      [reviewed],
    );
    const head = heads.find((decision) =>
      decision.occurrence_id === baseline.occurrence_id
    );
    expect(head?.schema_version).toBe(3);
    if (head?.schema_version !== 3) throw new Error("expected refined v3 head");
    const priorId = baselineApplication(baseline, 0).application_id;
    expect(head.applications[0]).toEqual(expect.objectContaining({
      application_id: priorId,
      action: "add",
      extent: expect.objectContaining({
        kind: "bounded_segment",
        record_ids: ["corridor_reviewed_segment"],
      }),
    }));
    expect(head.applications.map((application) => [
      application.route_record_id,
      application.treatment_record_id,
      application.phase_record_id,
    ])).toEqual(
      baseline.applications.map((application) => [
        application.route_record_id,
        application.treatment_record_id,
        application.phase_record_id,
      ]),
    );
    for (const [name, bytes] of before) {
      expect(readFileSync(join(historicalDir, name), "utf8")).toBe(bytes);
    }
  });

  it("rejects stale, cyclic, duplicate-owner, missing-predecessor, and conflicting-current-head mutations", () => {
    const baseline = loadOperationalOccurrenceAcceptedDecisionsV2(historicalDir)
      .find((decision) => decision.applications.length > 0)!;
    const first = refinement(baseline, `${baseline.decision_id}:resolution-a`);

    const stale = rebaseRefinement(first, {
      predecessor_decision_id: baseline.decision_id,
      predecessor_membership_fingerprint: "0".repeat(64),
    });
    expect(() => replayOperationalOccurrenceCurrentReviews(
      [baseline],
      [stale],
    )).toThrow("stale predecessor fingerprint");

    const missing = rebaseRefinement(first, {
      predecessor_decision_id: "missing:decision",
      predecessor_membership_fingerprint: baseline.membership_fingerprint,
    });
    expect(() => replayOperationalOccurrenceCurrentReviews(
      [baseline],
      [missing],
    )).toThrow("missing predecessor");

    const conflicting = refinement(
      baseline,
      `${baseline.decision_id}:resolution-b`,
    );
    expect(() => replayOperationalOccurrenceCurrentReviews(
      [baseline],
      [first, conflicting],
    )).toThrow("conflicting current head");

    const duplicateWithoutFingerprint = {
      ...first,
      applications: [first.applications[0]!, first.applications[0]!],
    };
    const {
      membership_fingerprint: _duplicateFingerprint,
      ...duplicateCurrent
    } = duplicateWithoutFingerprint;
    expect(() => withFingerprint(duplicateCurrent)).toThrow(
      "duplicate application owner",
    );

    const cycleA = rebaseRefinement(first, {
      decision_id: `${baseline.decision_id}:cycle-a`,
      predecessor_decision_id: `${baseline.decision_id}:cycle-b`,
      predecessor_membership_fingerprint: baseline.membership_fingerprint,
    });
    const cycleB = rebaseRefinement(first, {
      decision_id: `${baseline.decision_id}:cycle-b`,
      predecessor_decision_id: cycleA.decision_id,
      predecessor_membership_fingerprint: baseline.membership_fingerprint,
    });
    expect(() => replayOperationalOccurrenceCurrentReviews(
      [baseline],
      [cycleA, cycleB],
    )).toThrow("cyclic current occurrence review lineage");
  });

  it("rejects evidence-free unknowns and durable incidence drift", () => {
    const baseline = loadOperationalOccurrenceAcceptedDecisionsV2(historicalDir)
      .find((decision) => decision.applications.length > 1)!;
    const reviewed = refinement(
      baseline,
      `${baseline.decision_id}:semantic-mutations`,
    );
    const first = reviewed.applications[0]!;
    const withoutReview = {
      ...reviewed,
      applications: reviewed.applications.map((application, index) => {
        if (index !== 0) return application;
        const { semantic_review: _review, ...unreviewed } = application;
        return unreviewed;
      }),
    };
    expect(() => parseOperationalOccurrenceAcceptedDecisionV3(
      withoutReview,
    )).toThrow("semantic_review is required");

    const semantic = first.semantic_review!;
    const noEvidenceWithoutReceipt = {
      ...semantic,
      action_evidence_bindings: [],
    };
    const noEvidence = {
      ...reviewed,
      applications: reviewed.applications.map((application, index) =>
        index === 0
          ? { ...application, semantic_review: noEvidenceWithoutReceipt }
          : application
      ),
    };
    expect(() => parseOperationalOccurrenceAcceptedDecisionV3(
      noEvidence,
    )).toThrow("action_evidence_bindings must be a non-empty array");

    const second = reviewed.applications[1]!;
    const firstIncidence = {
      route_record_id: first.route_record_id,
      gtfs_route_id: first.gtfs_route_id,
      treatment_record_id: first.treatment_record_id,
      phase_record_id: first.phase_record_id,
    };
    const secondIncidence = {
      route_record_id: second.route_record_id,
      gtfs_route_id: second.gtfs_route_id,
      treatment_record_id: second.treatment_record_id,
      phase_record_id: second.phase_record_id,
    };
    const driftedApplications = reviewed.applications
      .map((application, index) =>
        index === 0
          ? { ...application, ...secondIncidence }
          : index === 1
            ? { ...application, ...firstIncidence }
            : application
      )
      .sort((left, right) => [
        left.route_record_id,
        left.gtfs_route_id,
        left.treatment_record_id,
        left.phase_record_id ?? "",
      ].join("|").localeCompare([
        right.route_record_id,
        right.gtfs_route_id,
        right.treatment_record_id,
        right.phase_record_id ?? "",
      ].join("|")));
    const {
      membership_fingerprint: _driftFingerprint,
      ...driftWithoutFingerprint
    } = { ...reviewed, applications: driftedApplications };
    const drift = withFingerprint(driftWithoutFingerprint);
    expect(() => replayOperationalOccurrenceCurrentReviews(
      [baseline],
      [drift],
    )).toThrow("durable application incidence changed");
  });
});
