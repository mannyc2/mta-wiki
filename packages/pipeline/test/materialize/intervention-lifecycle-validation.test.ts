import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { ApplicationPlacementTransition } from "@mta-wiki/pipeline/materialize/application-placement-transitions";
import {
  buildTransitionLifecycleAssertions,
  parseInterventionLifecycleAssertion,
  validateAcceptedInterventionLifecycleAssertions,
  type InterventionLifecycleAssertion,
} from "@mta-wiki/pipeline/materialize/intervention-lifecycle";
import type { InterventionPlacementRegistryEntry } from "@mta-wiki/pipeline/materialize/intervention-placements";
import type { ResolvedInterventionApplication } from "@mta-wiki/pipeline/materialize/resolved-intervention-applications";
import type { ResolvedInterventionEpisode } from "@mta-wiki/pipeline/materialize/resolved-interventions";

const evidence = {
  record_id: "event_one",
  source_id: "source_fixture",
  evidence_id: "source_fixture#p001_b0001",
};

function placement(placementId = "placement:one"): InterventionPlacementRegistryEntry {
  const claim = {
    route_record_id: "route_one",
    gtfs_route_id: "R1",
    treatment_record_ids: ["treatment_one"],
    treatment_family: "bus_lane",
    scope: { kind: "unknown" as const, record_ids: [], description: null },
  };
  return {
    schema_version: 1,
    placement_id: placementId,
    registry_state: "live_identity",
    founding_key: placementId,
    founding_claim: claim,
    current_claim: claim,
    claim_history: [claim],
    aliases: [],
    predecessor_placement_ids: [],
    successor_placement_ids: [],
    identity_decision_ids: ["decision:identity"],
    operation_ids: ["operation:identity"],
    retirement_reason: null,
  };
}

function canonicalRecord(): MtaCanonicalRecord {
  return {
    record_id: evidence.record_id,
    record_kind: "event",
    source_id: evidence.source_id,
    source_ids: [evidence.source_id],
    local_observation_id: "event_one",
    local_observation_ids: ["event_one"],
    display_name: "Lifecycle event",
    raw_text: "Lifecycle event",
    payload: {},
    evidence_refs: [{
      source_id: evidence.source_id,
      evidence_id: evidence.evidence_id,
      source_path: "raw/sources/source_fixture/blocks.jsonl",
      block_id: "p001_b0001",
    }],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "reviewed",
    generated_at: "2026-07-28T00:00:00Z",
  } as MtaCanonicalRecord;
}

function assertion(input: {
  placementId?: string;
  state?: InterventionLifecycleAssertion["state"];
  reviewState?: InterventionLifecycleAssertion["review_state"];
  decisionId?: string | null;
  supersedes?: string[];
} = {}): InterventionLifecycleAssertion {
  const partial = {
    subject: {
      kind: "placement" as const,
      placement_id: input.placementId ?? "placement:one",
    },
    state: input.state ?? "active",
    valid_time: {
      coverage_kind: "point" as const,
      start_earliest: "2025-01-01",
      start_latest: "2025-01-01",
      end_earliest: null,
      end_latest: null,
      precision: "day" as const,
    },
    evidence_bindings: [evidence],
    decision_id: input.decisionId === undefined ? "decision:lifecycle" : input.decisionId,
  };
  const assertionId = `assertion:${createHash("sha256")
    .update(stableJson(partial as JsonValue)).digest("hex").slice(0, 24)}`;
  return parseInterventionLifecycleAssertion({
    schema_version: 1,
    assertion_id: assertionId,
    ...partial,
    document_time: {
      source_published_at: "2025-01-02",
      source_retrieved_at: "2025-01-03",
      assertion_as_of: null,
    },
    truth_status: "source_stated",
    review_state: input.reviewState ?? "accepted",
    supersedes_assertion_ids: input.supersedes ?? [],
  });
}

const validationInput = {
  placements: [placement(), placement("placement:two")],
  episodes: [],
  applications: [],
  canonical_records: [canonicalRecord()],
};

describe("Plan 055 lifecycle candidate and supersedence safety", () => {
  it("keeps transition-derived lifecycle semantics pending and deduplicates role-only evidence", () => {
    const application: ResolvedInterventionApplication = {
      schema_version: 1,
      application_id: "application:add",
      occurrence_id: "occurrence:add",
      route_record_id: "route_one",
      gtfs_route_id: "R1",
      treatment_record_id: "treatment_one",
      treatment_family: "bus_lane",
      phase_record_id: "event_one",
      action: "add",
      applicability: "applies",
      extent: { kind: "unknown", record_ids: [], description: null },
      evidence_bindings: [
        { role: "phase_relation", ...evidence },
        { role: "treatment_definition", ...evidence },
      ],
      review_decision_id: "review:application",
      resolution_method: "accepted_review",
    };
    const transition: ApplicationPlacementTransition = {
      schema_version: 1,
      transition_id: "transition:add",
      application_id: application.application_id,
      application_fingerprint: "not-consumed-by-candidate-builder",
      action: "add",
      target_placement_ids: [],
      result_placement_ids: ["placement:one"],
      decision_id: "decision:placement-transition-only",
      evidence_bindings: application.evidence_bindings,
      batch_id: "fixture",
      manifest_sha256: "a".repeat(64),
      primary_reviewer: "placement-primary",
      independent_reviewer: "placement-independent",
      review_outcome: "agreement",
      adjudicator: null,
      integrator_id: "placement-integrator",
      accepted_at: "2026-07-28T00:00:00Z",
      rationale: "Placement-only fixture decision.",
    };
    const episode: ResolvedInterventionEpisode = {
      schema_version: 1,
      occurrence_id: application.occurrence_id,
      occurrence_aliases: [],
      identity_state: "active",
      observation_event_record_ids: ["event_one"],
      observation_relation_record_ids: [],
      candidate_ids: ["candidate:one"],
      resolved_onset: { date: "2025-01-01", precision: "day" },
      route_record_ids: ["route_one"],
      gtfs_route_ids: ["R1"],
      treatment_record_ids: ["treatment_one"],
      treatment_families: ["bus_lane"],
      phase_record_ids: ["event_one"],
      physical_scope_record_ids: [],
      source_ids: [evidence.source_id],
      application_ids: [application.application_id],
      review_decision_id: "review:episode",
      review_membership_fingerprint: "fixture",
      resolution_method: "accepted_review",
      evidence_bindings: application.evidence_bindings,
    };
    const [candidate] = buildTransitionLifecycleAssertions({
      transitions: [transition],
      applications: [application],
      episodes: [episode],
      registry: [placement()],
      canonical_records: [canonicalRecord()],
    });
    expect(candidate).toEqual(expect.objectContaining({
      review_state: "pending",
      decision_id: null,
      state: "active",
    }));
    expect(candidate!.evidence_bindings).toEqual([evidence]);
  });

  it("requires accepted same-subject authority and an acyclic supersedence graph", () => {
    const older = assertion();
    const pendingSuperseder = assertion({
      state: "ended",
      reviewState: "pending",
      decisionId: null,
      supersedes: [older.assertion_id],
    });
    expect(() => validateAcceptedInterventionLifecycleAssertions(
      [older, pendingSuperseder], validationInput,
    )).toThrow("supersedence requires accepted decision authority");

    const otherSubject = assertion({ placementId: "placement:two", state: "ended" });
    const crossSubject = assertion({ state: "ended", supersedes: [otherSubject.assertion_id] });
    expect(() => validateAcceptedInterventionLifecycleAssertions(
      [otherSubject, crossSubject], validationInput,
    )).toThrow("different lifecycle subject");

    const self = assertion();
    self.supersedes_assertion_ids = [self.assertion_id];
    expect(() => validateAcceptedInterventionLifecycleAssertions([self], validationInput))
      .toThrow("cannot supersede itself");

    const first = assertion({ state: "active", decisionId: "decision:first" });
    const second = assertion({ state: "ended", decisionId: "decision:second" });
    first.supersedes_assertion_ids = [second.assertion_id];
    second.supersedes_assertion_ids = [first.assertion_id];
    expect(() => validateAcceptedInterventionLifecycleAssertions(
      [first, second], validationInput,
    )).toThrow("must be acyclic");
  });

  it("requires receipted decision authority for every terminal review disposition", () => {
    expect(() => validateAcceptedInterventionLifecycleAssertions([
      assertion({ reviewState: "rejected", decisionId: null }),
    ], validationInput)).toThrow("rejected assertion requires an explicit decision");
    expect(() => validateAcceptedInterventionLifecycleAssertions([
      assertion({ reviewState: "conflicted", decisionId: null }),
    ], validationInput)).toThrow("conflicted assertion requires an explicit decision");
  });

  it("rejects contradictory accepted truth unless explicit supersedence resolves it", () => {
    const active = assertion({ state: "active", decisionId: "decision:active" });
    const ended = assertion({ state: "ended", decisionId: "decision:ended" });
    expect(() => validateAcceptedInterventionLifecycleAssertions(
      [active, ended], validationInput,
    )).toThrow("contradictory accepted lifecycle states require explicit supersedence");

    const resolvedEnded = assertion({
      state: "ended",
      decisionId: "decision:resolved-ended",
      supersedes: [active.assertion_id],
    });
    expect(validateAcceptedInterventionLifecycleAssertions(
      [active, resolvedEnded], validationInput,
    )).toHaveLength(2);
  });
});
