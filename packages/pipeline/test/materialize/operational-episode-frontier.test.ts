import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  adaptOperationalObservationFromRelationGraph,
  loadOperationalEpisodeAcceptedMappings,
  parseOperationalEpisodeAcceptedMapping,
  type OperationalEpisodeAcceptedMapping,
} from "@mta-wiki/pipeline/materialize/operational-episode-adapters";
import { readCanonicalRecordsFromJsonl } from "@mta-wiki/pipeline/materialize/canonical-read";
import {
  buildOperationalEpisodeFrontier,
  loadOperationalEpisodeCandidateDecisions,
  parseOperationalEpisodeObservationLedgerRow,
  type OperationalEpisodeCandidateDecision,
} from "@mta-wiki/pipeline/materialize/operational-episode-frontier";
import {
  loadOperationalOccurrenceIdentityRegistryV2,
  type OperationalOccurrenceIdentityRegistryV2Entry,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-identity-operations";
import {
  type OperationalOccurrenceAcceptedDecisionV2,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-review";
import {
  loadOperationalOccurrenceCurrentReviewDecisions,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-resolution";
import type {
  LoadedOperationalProjectionRetirementV1,
} from "@mta-wiki/pipeline/materialize/operational-projection-retirements";
import {
  loadOperationalProjectionRetirements,
} from "@mta-wiki/pipeline/materialize/operational-projection-retirements";

function record(
  id: string,
  kind: MtaCanonicalRecord["record_kind"],
  payload: Record<string, unknown>,
): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: "source_fixture",
    source_ids: ["source_fixture"],
    local_observation_id: id,
    local_observation_ids: [id],
    display_name: id,
    raw_text: id,
    payload,
    evidence_refs: [{
      source_id: "source_fixture",
      evidence_id: "source_fixture#p001_b0001",
      source_path: "raw/sources/source_fixture/blocks.jsonl",
      page_number: 1,
      block_id: "p001_b0001",
      text_sha256: "sha256:fixture",
      text_source: "raw_text",
      role: "event_date",
    }],
    submission_ids: ["sub_fixture"],
    truth_status: "source_stated",
    review_state: "reviewed",
    generated_at: "2026-07-28T00:00:00.000Z",
  } as unknown as MtaCanonicalRecord;
}

function mapping(eventIds: string[], occurrenceId: string): OperationalEpisodeAcceptedMapping {
  return {
    schema_version: 1,
    mapping_id: `mapping:${occurrenceId}`,
    adapter_id: "accepted_mapping_v1",
    observation_event_record_ids: [...eventIds].sort(),
    observation_relation_record_ids: [],
    candidate_keys: [`event:${eventIds[0]}`],
    occurrence_id: occurrenceId,
    evidence_bindings: [{
      record_id: eventIds[0]!,
      source_id: "source_fixture",
      evidence_id: "source_fixture#p001_b0001",
    }],
    decision_id: `decision:${occurrenceId}`,
    reviewer: "fixture-reviewer",
    reviewed_at: "2026-07-28T00:00:00Z",
    rationale: "Fixture accepted mapping with exact observation membership.",
  };
}

function identity(occurrenceId: string, eventId: string): OperationalOccurrenceIdentityRegistryV2Entry {
  return {
    schema_version: 2,
    occurrence_id: occurrenceId,
    state: "active",
    current_founding_key: `event:${eventId}`,
    founding_key_history: [`event:${eventId}`],
    current_founding_event_record_ids: [eventId],
    founding_event_record_id_history: [[eventId]],
    resolution_cluster_id: null,
    aliases: [],
    redirect_occurrence_ids: [],
    predecessor_occurrence_ids: [],
    successor_occurrence_ids: [],
    lineage_operation_ids: [`establish:${occurrenceId}`],
    non_coreference_occurrence_ids: [],
    decision_id: `decision:${occurrenceId}`,
    issued_at: "2026-07-28T00:00:00Z",
    retirement_reason: null,
  };
}

function review(
  occurrenceId: string,
  eventIds: string[],
): OperationalOccurrenceAcceptedDecisionV2 {
  return {
    occurrence_id: occurrenceId,
    observation_event_record_ids: [...eventIds].sort(),
    decision_id: `review:${occurrenceId}`,
    membership_fingerprint: "a".repeat(64),
    routes: [{ gtfs_route_id: "R1" }],
  } as unknown as OperationalOccurrenceAcceptedDecisionV2;
}

describe("operational episode adapters and closed frontier", () => {
  it("freezes every disposition and a multi-observation candidate in the contract fixture", () => {
    const fixture = JSON.parse(readFileSync(
      join(
        repoRoot,
        "data",
        "contract-fixtures",
        "operational-episode-frontier-v1",
        "all-dispositions.json",
      ),
      "utf8",
    )) as {
      observation_dispositions: string[];
      candidate_dispositions: string[];
      multi_observation_candidate: { observation_event_record_ids: string[] };
    };
    expect(fixture.observation_dispositions).toEqual([
      "candidate_bearing",
      "not_episode_evidence",
      "unsupported_record",
      "invalid_record",
      "pending_segmentation",
    ]);
    expect(fixture.candidate_dispositions).toHaveLength(8);
    expect(fixture.multi_observation_candidate.observation_event_record_ids).toHaveLength(2);
  });

  it("strictly parses accepted mappings and rejects unknown authority fields", () => {
    const accepted = mapping(["event_one"], "occurrence:one");
    expect(parseOperationalEpisodeAcceptedMapping(accepted)).toEqual(accepted);
    expect(() => parseOperationalEpisodeAcceptedMapping({ ...accepted, inferred_route: "R1" }))
      .toThrow("unknown field");
  });

  it("classifies relation graph 1→0, exact 1→1, and ambiguous candidates without domain ids", () => {
    const event = record("event_one", "event", { event_family: "implementation", lifecycle_phase: "installed" });
    const route = record("route_one", "route", {});
    const treatment = record("treatment_one", "treatment_component", {});
    const routeRelation = record("relation_route", "relation", {
      relation_kind: "affects_route",
      subject_id: "event_one",
      object_id: "route_one",
    });
    const treatmentRelation = record("relation_treatment", "relation", {
      relation_kind: "implements",
      subject_id: "event_one",
      object_id: "treatment_one",
    });
    expect(adaptOperationalObservationFromRelationGraph(event, [event])).toMatchObject({
      state: "unsupported",
      reason_code: "no_episode_graph",
    });
    expect(adaptOperationalObservationFromRelationGraph(event, [event, route, routeRelation])).toMatchObject({
      state: "ambiguous",
      candidate_keys: ["event:event_one"],
    });
    expect(
      adaptOperationalObservationFromRelationGraph(
        event,
        [event, route, treatment, routeRelation, treatmentRelation],
      ),
    ).toMatchObject({ state: "exact", candidate_keys: ["event:event_one"] });
    const planned = record("event_planned", "event", {
      event_family: "launch",
      lifecycle_phase: "planned",
    });
    expect(adaptOperationalObservationFromRelationGraph(planned, [planned])).toMatchObject({
      state: "no_match",
      reason_code: "prospective_observation",
    });
  });

  it("supports N→1 reviewed mappings, explicit pending segmentation, and strict profiles", () => {
    const first = record("event_first", "event", {
      event_family: "implementation",
      lifecycle_phase: "installed",
    });
    const second = record("event_second", "event", {
      event_family: "other",
      lifecycle_phase: "other",
    });
    const pending = record("event_pending", "event", {
      event_family: "launch",
      lifecycle_phase: "installed",
    });
    const route = record("route_one", "route", {});
    const relation = record("relation_pending_route", "relation", {
      relation_kind: "affects_route",
      subject_id: "event_pending",
      object_id: "route_one",
    });
    const occurrenceId = "occurrence:reviewed";
    const input = {
      canonical_records: [first, second, pending, route, relation],
      accepted_mappings: [mapping(["event_first", "event_second"], occurrenceId)],
      candidate_decisions: [],
      identity_registry: [identity(occurrenceId, "event_first")],
      review_decisions: [review(occurrenceId, ["event_first", "event_second"])],
      completeness_profile: "partial" as const,
    };
    const frontier = buildOperationalEpisodeFrontier(input);
    expect(frontier.observation_ledger).toHaveLength(3);
    expect(frontier.candidate_ledger.find((row) => row.disposition === "published")?.observation_event_record_ids)
      .toEqual(["event_first", "event_second"]);
    expect(frontier.observation_ledger.find((row) => row.event_record_id === "event_pending")?.disposition)
      .toBe("pending_segmentation");
    expect(frontier.summary.zero_unexplained_loss).toBe(true);
    expect(() => parseOperationalEpisodeObservationLedgerRow({
      ...frontier.observation_ledger[0],
      invented_authority: true,
    })).toThrow("unknown field");
    expect(() => buildOperationalEpisodeFrontier({ ...input, completeness_profile: "complete" }))
      .toThrow("cannot contain pending");
  });

  it("fails when an active identity or reviewed observation disappears", () => {
    const event = record("event_one", "event", {
      event_family: "implementation",
      lifecycle_phase: "installed",
    });
    const occurrenceId = "occurrence:one";
    const base = {
      canonical_records: [event],
      accepted_mappings: [mapping(["event_one"], occurrenceId)],
      candidate_decisions: [],
      identity_registry: [identity(occurrenceId, "event_one")],
      review_decisions: [review(occurrenceId, ["event_one"])],
      completeness_profile: "partial" as const,
    };
    expect(() => buildOperationalEpisodeFrontier({ ...base, accepted_mappings: [] }))
      .toThrow("published candidate identities do not equal");
    expect(() => buildOperationalEpisodeFrontier({
      ...base,
      review_decisions: [review(occurrenceId, ["event_missing"])],
    })).toThrow("observation membership is stale");
  });

  it("closes an active projection without retiring its stable identity", () => {
    const event = record("event_one", "event", {
      event_family: "implementation",
      lifecycle_phase: "installed",
    });
    const occurrenceId = "occurrence:one";
    const acceptedMapping = {
      ...mapping(["event_one"], occurrenceId),
      decision_id: "review:one",
      evidence_bindings: [
        {
          record_id: "event_one",
          source_id: "source_fixture",
          evidence_id: "source_fixture#p001_b0001",
        },
        {
          record_id: "route_one",
          source_id: "source_fixture",
          evidence_id: "source_fixture#p001_b0001",
        },
      ],
    };
    const retirementSha = "b".repeat(64);
    const retirement = {
      retirement_id: "retirement:one",
      source_sha256: retirementSha,
      binding: {
        route_record_id: "route_one",
        gtfs_route_id: "R1",
      },
      occurrence_review_decisions: [{
        decision_id: "review:one",
        occurrence_id: occurrenceId,
        founding_key: "event:event_one",
        pinned_gtfs_route_ids: ["R1"],
        projection_state: "retired",
        reason_code: "route_binding_nonprojectable",
      }],
    } as unknown as LoadedOperationalProjectionRetirementV1;
    const decision: OperationalEpisodeCandidateDecision = {
      schema_version: 1,
      decision_id: "terminal:one",
      candidate_key: "event:event_one",
      disposition: "retired",
      canonical_candidate_key: null,
      successor_occurrence_ids: [],
      reviewer: "fixture-dual-review",
      decided_at: "2026-07-30T00:00:00.000Z",
      rationale: "Accepted route-snapshot projection retirement preserves identity.",
      evidence_bindings: [{
        record_id: "event_one",
        source_id: "source_fixture",
        evidence_id: "source_fixture#p001_b0001",
      }],
      projection_retirement_id: retirement.retirement_id,
      projection_retirement_sha256: retirementSha,
    };
    const input = {
      canonical_records: [event],
      accepted_mappings: [acceptedMapping],
      candidate_decisions: [decision],
      identity_registry: [identity(occurrenceId, "event_one")],
      review_decisions: [],
      projection_retirements: [retirement],
      completeness_profile: "complete" as const,
    };
    const frontier = buildOperationalEpisodeFrontier(input);
    expect(frontier.candidate_ledger[0]).toMatchObject({
      disposition: "retired",
      lineage_occurrence_ids: [occurrenceId],
      unresolved_active_occurrence_ids: [],
    });
    expect(frontier.summary).toMatchObject({
      active_identity_ids: 1,
      projection_retired_active_identity_ids: 1,
      unresolved_active_identity_ids: 0,
      pending_count: 0,
    });
    expect(() => buildOperationalEpisodeFrontier({
      ...input,
      projection_retirements: [],
    })).toThrow("missing or duplicate projection-retirement authority");
    expect(() => buildOperationalEpisodeFrontier({
      ...input,
      candidate_decisions: [{
        ...decision,
        projection_retirement_sha256: "c".repeat(64),
      }],
    })).toThrow("stale projection-retirement authority");
    expect(() => buildOperationalEpisodeFrontier({
      ...input,
      projection_retirements: [{
        ...retirement,
        occurrence_review_decisions: [{
          ...retirement.occurrence_review_decisions[0]!,
          founding_key: "event:event_other",
        }],
      }],
    })).toThrow("does not match candidate, identity, review, and route binding");
  });

  it("reconciles the production family denominator and all exact identity authority", () => {
    const records = readCanonicalRecordsFromJsonl();
    const identityRegistry =
      loadOperationalOccurrenceIdentityRegistryV2(repoRoot);
    const frontier = buildOperationalEpisodeFrontier({
      canonical_records: records,
      accepted_mappings: loadOperationalEpisodeAcceptedMappings(
        join(repoRoot, "data", "operational-episode-resolution", "adapters"),
      ),
      candidate_decisions: loadOperationalEpisodeCandidateDecisions(
        join(repoRoot, "data", "operational-episode-resolution", "decisions", "index.json"),
      ),
      identity_registry: identityRegistry,
      review_decisions: loadOperationalOccurrenceCurrentReviewDecisions(),
      projection_retirements: loadOperationalProjectionRetirements(repoRoot),
      completeness_profile: "partial",
    });
    const familyCount = records.filter((record) =>
      record.record_kind === "event" &&
      ["implementation", "launch"].includes(String(record.payload.event_family).toLowerCase())
    ).length;
    expect(familyCount).toBe(1363);
    expect(frontier.summary.cohort_observations).toBe(1366);
    expect(frontier.summary.active_identity_ids).toBe(identityRegistry.length);
    expect(frontier.summary.published_distinct_occurrence_ids).toBeGreaterThanOrEqual(130);
    expect(
      frontier.summary.published_distinct_occurrence_ids +
        frontier.summary.projection_retired_active_identity_ids +
        frontier.summary.pending_review_distinct_unresolved_identity_ids,
    ).toBe(identityRegistry.length);
    expect(frontier.summary.invalid_count).toBe(0);
  }, 60_000);
});
