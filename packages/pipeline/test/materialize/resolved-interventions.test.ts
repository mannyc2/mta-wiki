import { describe, expect, it } from "bun:test";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { OperationalEpisodeCandidateLedgerRow } from "@mta-wiki/pipeline/materialize/operational-episode-frontier";
import type { OperationalOccurrenceIdentityRegistryV2Entry } from "@mta-wiki/pipeline/materialize/operational-occurrence-identity-operations";
import {
  operationalOccurrenceReviewMembershipFingerprint,
  type OperationalOccurrenceAcceptedDecisionV2,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-review";
import {
  operationalOccurrenceCurrentReviewMembershipFingerprint,
  parseOperationalOccurrenceAcceptedDecisionV3,
  replayOperationalOccurrenceCurrentReviews,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-resolution";
import {
  parseResolvedInterventionApplication,
  resolvedInterventionDurableApplicationIdentity,
  resolvedInterventionApplicationIdentity,
} from "@mta-wiki/pipeline/materialize/resolved-intervention-applications";
import {
  assertResolvedInterventionModel,
  buildResolvedInterventions,
} from "@mta-wiki/pipeline/materialize/resolved-interventions";

const sourceId = "source_fixture";
const evidenceId = `${sourceId}#p001_b0001`;

function record(id: string, kind: MtaCanonicalRecord["record_kind"]): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: sourceId,
    source_ids: [sourceId],
    local_observation_id: id,
    local_observation_ids: [id],
    display_name: id,
    raw_text: id,
    payload: kind === "relation"
      ? { relation_kind: "has_context", subject_id: "event_one", object_id: "project_one" }
      : {},
    evidence_refs: [{
      source_id: sourceId,
      evidence_id: evidenceId,
      source_path: `raw/sources/${sourceId}/blocks.jsonl`,
      page_number: 1,
      block_id: "p001_b0001",
      text_sha256: "sha256:fixture",
      text_source: "raw_text",
      role: "event_date",
    }],
    submission_ids: [`submission:${id}`],
    truth_status: "source_stated",
    review_state: "reviewed",
    generated_at: "2026-07-28T00:00:00Z",
  } as unknown as MtaCanonicalRecord;
}

function binding(recordId: string) {
  return {
    role: recordId.startsWith("route_") ? "route_identity" as const
      : recordId.startsWith("treatment_") ? "treatment_definition" as const
        : "event_date" as const,
    record_id: recordId,
    source_id: sourceId,
    evidence_id: evidenceId,
  };
}

function review(
  applications: Array<{
    route_record_id: string;
    treatment_record_id: string;
    phase_record_id?: string | null;
    action?: "add" | "modify" | "unknown";
    physical_scope_record_ids?: string[];
  }>,
): OperationalOccurrenceAcceptedDecisionV2 {
  const routeIds = [...new Set(applications.map((application) => application.route_record_id))].sort();
  const treatmentIds = [...new Set(applications.map((application) => application.treatment_record_id))].sort();
  const phaseIds = [...new Set(applications.flatMap((application) =>
    application.phase_record_id === null ? [] : [application.phase_record_id ?? "event_one"]
  ))].sort();
  const scopeIds = [...new Set(applications.flatMap((application) => application.physical_scope_record_ids ?? []))].sort();
  const evidence = [binding("event_one"), ...routeIds.map(binding), ...treatmentIds.map(binding)];
  return {
    schema_version: 2,
    decision_id: "review:one",
    review_state: "approved",
    occurrence_id: "occurrence:one",
    founding_key: "event:event_one",
    anchor_review_decision_ids: [],
    observation_event_record_ids: ["event_one"],
    observation_relation_record_ids: [],
    resolution_cluster_id: null,
    phase_record_ids: phaseIds,
    phase_relation_record_ids: [],
    physical_scope_record_ids: scopeIds,
    physical_scope_relation_record_ids: [],
    resolved_onset: {
      date: "2025-01-01",
      precision: "day",
      evidence_bindings: [binding("event_one")],
    },
    routes: routeIds.map((routeId) => ({
      route_record_id: routeId,
      gtfs_route_id: routeId.replace("route_", "").toUpperCase(),
      evidence_bindings: [binding(routeId)],
    })),
    treatment: {
      kind: "bundle",
      bundle_family: "fixture",
      bundle_family_evidence_bindings: [binding(treatmentIds[0]!)],
      members: treatmentIds.map((treatmentId) => ({
        treatment_record_id: treatmentId,
        treatment_family: treatmentId.endsWith("x") ? "bus_lane" : "signal_priority",
        evidence_bindings: [binding(treatmentId)],
      })),
    },
    applications: applications.map((application) => {
      const phaseId = application.phase_record_id === undefined ? "event_one" : application.phase_record_id;
      return {
        route_record_id: application.route_record_id,
        gtfs_route_id: application.route_record_id.replace("route_", "").toUpperCase(),
        treatment_record_id: application.treatment_record_id,
        phase_record_id: phaseId,
        action: application.action ?? "add",
        physical_scope_record_ids: application.physical_scope_record_ids ?? [],
        evidence_bindings: [
          binding(application.route_record_id),
          binding(application.treatment_record_id),
          ...(phaseId ? [binding(phaseId)] : []),
        ].sort((left, right) =>
          [left.role, left.record_id].join("|").localeCompare([right.role, right.record_id].join("|"))
        ),
      };
    }),
    evidence_bindings: evidence.sort((left, right) =>
      [left.role, left.record_id].join("|").localeCompare([right.role, right.record_id].join("|"))
    ),
    reviewers: ["fixture"],
    accepted_at: "2026-07-28T00:00:00Z",
    rationale: "Explicit fixture incidence.",
    review_scope: "full_episode_application",
    membership_fingerprint: "a".repeat(64),
  };
}

function candidate(
  disposition: "published" | "pending_review" | "retired" = "published",
  reviewFingerprint = "a".repeat(64),
): OperationalEpisodeCandidateLedgerRow {
  return {
    schema_version: 1,
    candidate_id: "candidate:one",
    candidate_key: "event:event_one",
    observation_event_record_ids: ["event_one"],
    observation_relation_record_ids: [],
    source_ids: [sourceId],
    evidence_bindings: [{ record_id: "event_one", source_id: sourceId, evidence_id: evidenceId }],
    disposition,
    published_occurrence_id: disposition === "published" ? "occurrence:one" : null,
    unresolved_active_occurrence_ids: disposition === "pending_review" ? ["occurrence:one"] : [],
    canonical_candidate_id: null,
    lineage_occurrence_ids: ["occurrence:one"],
    successor_occurrence_ids: [],
    decision_ids: ["mapping:one"],
    review_membership_fingerprint: disposition === "published" ? reviewFingerprint : null,
  };
}

function identity(): OperationalOccurrenceIdentityRegistryV2Entry {
  return {
    schema_version: 2,
    occurrence_id: "occurrence:one",
    state: "active",
    current_founding_key: "event:event_one",
    founding_key_history: ["event:event_one"],
    current_founding_event_record_ids: ["event_one"],
    founding_event_record_id_history: [["event_one"]],
    resolution_cluster_id: null,
    aliases: [],
    redirect_occurrence_ids: [],
    predecessor_occurrence_ids: [],
    successor_occurrence_ids: [],
    lineage_operation_ids: ["establish:one"],
    non_coreference_occurrence_ids: [],
    decision_id: "identity:one",
    issued_at: "2026-07-28T00:00:00Z",
    retirement_reason: null,
  };
}

function corpus() {
  return [
    record("event_one", "event"),
    record("event_two", "event"),
    record("route_a", "route"),
    record("route_b", "route"),
    record("treatment_x", "treatment_component"),
    record("treatment_y", "treatment_component"),
    record("corridor_one", "corridor"),
  ];
}

describe("resolved intervention model v1", () => {
  it("materializes the reviewed partial 2x2 incidence without a cross-product", () => {
    const model = buildResolvedInterventions({
      canonical_records: corpus(),
      candidate_ledger: [candidate()],
      identity_registry: [identity()],
      review_decisions: [review([
        { route_record_id: "route_a", treatment_record_id: "treatment_x" },
        { route_record_id: "route_b", treatment_record_id: "treatment_y" },
      ])],
    });
    expect(model.episodes).toHaveLength(1);
    expect(model.applications.map((application) =>
      `${application.route_record_id}×${application.treatment_record_id}`
    ).sort()).toEqual(["route_a×treatment_x", "route_b×treatment_y"]);
    expect(model.summary.zero_unexplained_identity_loss).toBe(true);
  });

  it("materializes an append-only unknown/unknown refinement with the same durable application ids", () => {
    const baselineWithPlaceholder = review([
      {
        route_record_id: "route_a",
        treatment_record_id: "treatment_x",
        action: "unknown",
      },
      {
        route_record_id: "route_b",
        treatment_record_id: "treatment_y",
        action: "unknown",
      },
    ]);
    const {
      membership_fingerprint: _placeholder,
      ...baselineWithoutFingerprint
    } = baselineWithPlaceholder;
    const baselineWithoutMigrationFingerprint = {
      ...baselineWithoutFingerprint,
      review_scope: "lossless_v1_migration" as const,
    };
    const baseline: OperationalOccurrenceAcceptedDecisionV2 = {
      ...baselineWithoutMigrationFingerprint,
      membership_fingerprint:
        operationalOccurrenceReviewMembershipFingerprint(
          baselineWithoutMigrationFingerprint,
        ),
    };
    const baselineApplicationIds = baseline.applications.map((application) =>
      resolvedInterventionApplicationIdentity({
        occurrence_id: baseline.occurrence_id,
        route_record_id: application.route_record_id,
        treatment_record_id: application.treatment_record_id,
        phase_record_id: application.phase_record_id,
        action: application.action,
        extent: { kind: "unknown", record_ids: [], description: null },
      })
    );
    const refinedApplications = baseline.applications.map((application, index) => ({
      ...application,
      application_id: baselineApplicationIds[index]!,
      action: index === 0 ? "add" as const : application.action,
      physical_scope_record_ids: index === 0 ? ["corridor_one"] : [],
      extent: index === 0
        ? {
            kind: "bounded_segment" as const,
            record_ids: ["corridor_one"],
            description: "Reviewed bounded segment.",
          }
        : { kind: "unknown" as const, record_ids: [], description: null },
      evidence_bindings: index === 0
        ? [...application.evidence_bindings, binding("corridor_one")]
          .sort((left, right) =>
            [left.role, left.record_id].join("|").localeCompare(
              [right.role, right.record_id].join("|"),
            )
          )
        : application.evidence_bindings,
    }));
    const currentWithBaselineFingerprint = {
      ...baseline,
      schema_version: 3 as const,
      decision_id: "review:one:resolution-1",
      operation: "supersede_current_resolution" as const,
      supersedes_decision_id: baseline.decision_id,
      supersedes_membership_fingerprint: baseline.membership_fingerprint,
      physical_scope_record_ids: ["corridor_one"],
      applications: refinedApplications,
      evidence_bindings: [...baseline.evidence_bindings, binding("corridor_one")]
        .sort((left, right) =>
          [left.role, left.record_id].join("|").localeCompare(
            [right.role, right.record_id].join("|"),
          )
        ),
      reviewers: ["fixture-reviewer"],
      accepted_at: "2026-07-29T00:00:00Z",
      rationale: "Refine one durable application without widening incidence.",
      review_scope: "application_resolution_refinement" as const,
    };
    const {
      membership_fingerprint: _baselineFingerprint,
      ...currentWithoutFingerprint
    } = currentWithBaselineFingerprint;
    const current = parseOperationalOccurrenceAcceptedDecisionV3({
      ...currentWithoutFingerprint,
      membership_fingerprint:
        operationalOccurrenceCurrentReviewMembershipFingerprint(
          currentWithoutFingerprint,
        ),
    });
    const [head] = replayOperationalOccurrenceCurrentReviews(
      [baseline],
      [current],
    );
    const model = buildResolvedInterventions({
      canonical_records: corpus(),
      candidate_ledger: [candidate("published", current.membership_fingerprint)],
      identity_registry: [identity()],
      review_decisions: [head!],
    });
    expect(model.applications.map((application) => application.application_id).sort())
      .toEqual([...baselineApplicationIds].sort());
    expect(model.applications.map((application) =>
      `${application.route_record_id}×${application.treatment_record_id}`
    ).sort()).toEqual(["route_a×treatment_x", "route_b×treatment_y"]);
    expect(model.applications.find((application) =>
      application.route_record_id === "route_a"
    )).toEqual(expect.objectContaining({
      action: "add",
      extent: expect.objectContaining({
        kind: "bounded_segment",
        record_ids: ["corridor_one"],
      }),
    }));
  });

  it("materializes a reviewed full 2x2 and preserves phase/action/extent identity", () => {
    const model = buildResolvedInterventions({
      canonical_records: corpus(),
      candidate_ledger: [candidate()],
      identity_registry: [identity()],
      review_decisions: [review([
        { route_record_id: "route_a", treatment_record_id: "treatment_x", action: "add" },
        { route_record_id: "route_a", treatment_record_id: "treatment_y", action: "modify" },
        { route_record_id: "route_b", treatment_record_id: "treatment_x", physical_scope_record_ids: ["corridor_one"] },
        { route_record_id: "route_b", treatment_record_id: "treatment_y", phase_record_id: "event_two" },
      ])],
    });
    expect(model.applications).toHaveLength(4);
    expect(new Set(model.applications.map((application) => application.application_id)).size).toBe(4);
    expect(model.applications.find((application) => application.extent.kind === "bounded_segment")
      ?.extent.record_ids).toEqual(["corridor_one"]);
  });

  it("preserves source-honest season, year, and installed-by onset precision", () => {
    const baseline = review([
      { route_record_id: "route_a", treatment_record_id: "treatment_x" },
    ]);
    const {
      membership_fingerprint: _migrationFingerprint,
      applications: baselineApplications,
      schema_version: _schemaVersion,
      review_scope: _reviewScope,
      ...baselineFields
    } = baseline;
    for (
      const resolvedOnset of [
        { date: "2015-fall", precision: "season" as const },
        { date: "2011", precision: "year" as const },
        { date: "2026-06-10", precision: "upper_bound_day" as const },
      ]
    ) {
      const application = baselineApplications[0]!;
      const withoutFingerprint = {
        ...baselineFields,
        schema_version: 3 as const,
        decision_id: `review:onset:${resolvedOnset.precision}`,
        treatment: {
          kind: "atomic" as const,
          member: baselineFields.treatment.kind === "bundle"
            ? baselineFields.treatment.members[0]!
            : baselineFields.treatment.member,
        },
        resolved_onset: {
          ...resolvedOnset,
          evidence_bindings: [binding("event_one")],
        },
        applications: [{
          ...application,
          application_id: resolvedInterventionDurableApplicationIdentity({
            occurrence_id: baseline.occurrence_id,
            route_record_id: application.route_record_id,
            treatment_record_id: application.treatment_record_id,
            phase_record_id: application.phase_record_id,
          }),
          extent: {
            kind: "unknown" as const,
            record_ids: [],
            description: null,
          },
        }],
        operation: "establish_current_resolution" as const,
        supersedes_decision_id: null,
        supersedes_membership_fingerprint: null,
        review_scope: "full_episode_application" as const,
      };
      const parsed = parseOperationalOccurrenceAcceptedDecisionV3({
        ...withoutFingerprint,
        membership_fingerprint:
          operationalOccurrenceCurrentReviewMembershipFingerprint(
            withoutFingerprint,
          ),
      });
      const model = buildResolvedInterventions({
        canonical_records: corpus(),
        candidate_ledger: [
          candidate("published", parsed.membership_fingerprint),
        ],
        identity_registry: [identity()],
        review_decisions: [parsed],
      });
      expect(model.episodes[0]?.resolved_onset).toEqual(resolvedOnset);
    }
  });

  it("withholds an unresolved active identity into operator reconciliation", () => {
    const model = buildResolvedInterventions({
      canonical_records: corpus(),
      candidate_ledger: [candidate("pending_review")],
      identity_registry: [identity()],
      review_decisions: [],
    });
    expect(model.episodes).toHaveLength(0);
    expect(model.applications).toHaveLength(0);
    expect(model.identity_reconciliation).toEqual([
      expect.objectContaining({
        occurrence_id: "occurrence:one",
        disposition: "pending_review",
      }),
    ]);
  });

  it("reconciles a route-snapshot projection retirement without retiring identity", () => {
    const model = buildResolvedInterventions({
      canonical_records: corpus(),
      candidate_ledger: [candidate("retired")],
      identity_registry: [identity()],
      review_decisions: [],
    });
    expect(model.episodes).toHaveLength(0);
    expect(model.applications).toHaveLength(0);
    expect(model.identity_reconciliation).toEqual([
      expect.objectContaining({
        occurrence_id: "occurrence:one",
        disposition: "projection_retired",
        reason_code: "accepted_route_snapshot_projection_retirement",
      }),
    ]);
    expect(model.summary).toMatchObject({
      active_identity_count: 1,
      identity_reconciliation_count: 1,
      pending_identity_candidate_count: 0,
      projection_retired_identity_count: 1,
    });
  });

  it("strictly rejects unknown fields and stale application ids", () => {
    const model = buildResolvedInterventions({
      canonical_records: corpus(),
      candidate_ledger: [candidate()],
      identity_registry: [identity()],
      review_decisions: [review([
        { route_record_id: "route_a", treatment_record_id: "treatment_x" },
      ])],
    });
    const application = model.applications[0]!;
    expect(parseResolvedInterventionApplication(application)).toEqual(application);
    expect(() => parseResolvedInterventionApplication({ ...application, inferred_pair: true }))
      .toThrow("unknown field");
    expect(() => parseResolvedInterventionApplication({ ...application, application_id: "application:stale" }))
      .toThrow("application_id is stale");
  });

  it("fails closed when convenience sets or exact evidence are mutated", () => {
    const model = buildResolvedInterventions({
      canonical_records: corpus(),
      candidate_ledger: [candidate()],
      identity_registry: [identity()],
      review_decisions: [review([
        { route_record_id: "route_a", treatment_record_id: "treatment_x" },
      ])],
    });
    const stale = structuredClone(model);
    stale.episodes[0]!.route_record_ids = ["route_b"];
    expect(() => assertResolvedInterventionModel(stale)).toThrow("application-derived set");

    const badReview = review([{ route_record_id: "route_a", treatment_record_id: "treatment_x" }]);
    badReview.applications[0]!.evidence_bindings[0]!.evidence_id = `${sourceId}#other`;
    expect(() => buildResolvedInterventions({
      canonical_records: corpus(),
      candidate_ledger: [candidate()],
      identity_registry: [identity()],
      review_decisions: [badReview],
    })).toThrow("evidence is outside canonical record membership");
  });

  it("keeps the legacy claim-derived id while new durable ids use incidence only", () => {
    const base = {
      occurrence_id: "occurrence:one",
      route_record_id: "route_a",
      treatment_record_id: "treatment_x",
      phase_record_id: "event_one",
      action: "add" as const,
      extent: { kind: "unknown" as const, record_ids: [], description: null },
    };
    expect(resolvedInterventionApplicationIdentity(base)).not.toBe(
      resolvedInterventionApplicationIdentity({ ...base, action: "modify" }),
    );
    expect(resolvedInterventionApplicationIdentity(base)).not.toBe(
      resolvedInterventionApplicationIdentity({
        ...base,
        extent: { kind: "bounded_segment", record_ids: ["corridor_one"], description: "ignored identity text" },
      }),
    );
    const durable = resolvedInterventionDurableApplicationIdentity(base);
    expect(durable).toBe(
      resolvedInterventionDurableApplicationIdentity({
        ...base,
        action: "modify",
        extent: {
          kind: "bounded_segment",
          record_ids: ["corridor_one"],
          description: "mutable claim",
        },
      }),
    );
  });
});
