import { describe, expect, it } from "bun:test";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { OperationalEpisodeCandidateLedgerRow } from "@mta-wiki/pipeline/materialize/operational-episode-frontier";
import type { OperationalOccurrenceIdentityRegistryV2Entry } from "@mta-wiki/pipeline/materialize/operational-occurrence-identity-operations";
import type { OperationalOccurrenceAcceptedDecisionV2 } from "@mta-wiki/pipeline/materialize/operational-occurrence-review";
import {
  parseResolvedInterventionApplication,
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
    action?: "add" | "modify";
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

function candidate(disposition: "published" | "pending_review" = "published"): OperationalEpisodeCandidateLedgerRow {
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
    review_membership_fingerprint: disposition === "published" ? "a".repeat(64) : null,
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

  it("includes action and reviewed scope identity in the deterministic id", () => {
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
  });
});
