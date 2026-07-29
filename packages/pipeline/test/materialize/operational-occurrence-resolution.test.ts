import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  loadOperationalOccurrenceAcceptedDecisionsV2,
  type OperationalOccurrenceAcceptedDecisionV2,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-review";
import {
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
    return index === 0
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

    expect(() => replayOperationalOccurrenceCurrentReviews(
      [baseline],
      [{ ...first, supersedes_membership_fingerprint: "0".repeat(64) }],
    )).toThrow("stale predecessor fingerprint");

    expect(() => replayOperationalOccurrenceCurrentReviews(
      [baseline],
      [{ ...first, supersedes_decision_id: "missing:decision" }],
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

    const {
      membership_fingerprint: _firstFingerprint,
      ...firstWithoutFingerprint
    } = first;
    const cycleA = withFingerprint({
      ...firstWithoutFingerprint,
      supersedes_decision_id: `${baseline.decision_id}:cycle-b`,
      decision_id: `${baseline.decision_id}:cycle-a`,
    });
    const cycleB = withFingerprint({
      ...firstWithoutFingerprint,
      supersedes_decision_id: cycleA.decision_id,
      decision_id: `${baseline.decision_id}:cycle-b`,
    });
    expect(() => replayOperationalOccurrenceCurrentReviews(
      [baseline],
      [cycleA, cycleB],
    )).toThrow("cyclic current occurrence review lineage");
  });
});
