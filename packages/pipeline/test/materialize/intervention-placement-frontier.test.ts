import { describe, expect, it } from "bun:test";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  buildInterventionPlacementFrontier,
} from "@mta-wiki/pipeline/materialize/intervention-placement-frontier";
import type { ResolvedInterventionApplication } from "@mta-wiki/pipeline/materialize/resolved-intervention-applications";

function record(
  id: string,
  kind: MtaCanonicalRecord["record_kind"],
  payload: Record<string, unknown> = {},
  options: { evidence?: boolean; truth?: MtaCanonicalRecord["truth_status"] } = {},
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
    evidence_refs: options.evidence === false ? [] : [{
      source_id: "source_fixture",
      evidence_id: "source_fixture#p001_b0001",
      source_path: "raw/sources/source_fixture/blocks.jsonl",
      block_id: "p001_b0001",
    }],
    submission_ids: [],
    truth_status: options.truth ?? "source_stated",
    review_state: "reviewed",
    generated_at: "2026-07-28T00:00:00Z",
  } as MtaCanonicalRecord;
}

function application(): ResolvedInterventionApplication {
  return {
    schema_version: 1,
    application_id: "application:one",
    occurrence_id: "occurrence:one",
    route_record_id: "route_one",
    gtfs_route_id: "R1",
    treatment_record_id: "treatment_one",
    treatment_family: "bus_lane",
    phase_record_id: "event_application",
    action: "unknown",
    applicability: "applies",
    extent: { kind: "unknown", record_ids: [], description: null },
    evidence_bindings: [{
      role: "event_date",
      record_id: "event_application",
      source_id: "source_fixture",
      evidence_id: "source_fixture#p001_b0001",
    }],
    review_decision_id: "review:one",
    resolution_method: "lossless_v1_migration",
  };
}

describe("closed intervention placement frontier", () => {
  it("accounts every examined record and withholds unknown applications", () => {
    const records = [
      record("event_application", "event", { lifecycle_phase: "installed" }),
      record("event_later", "event", { lifecycle_phase: "removed" }),
      record("route_one", "route"),
      record("treatment_one", "treatment_component"),
      record("project_one", "project"),
      record("claim_unrelated", "claim"),
      record("entity_derived", "entity", {}, { truth: "derived" }),
      record("corridor_invalid", "corridor", {}, { evidence: false }),
      record("relation_bad", "relation", { relation_family: "route_scope" }),
      record("relation_ignored", "relation", { relation_family: "metric_context" }),
    ];
    const frontier = buildInterventionPlacementFrontier({
      canonical_records: records,
      applications: [application()],
      registry: [],
      transitions: [],
    });
    expect(frontier.cohort.examined_record_count).toBe(9);
    expect(frontier.source_observation_ledger).toHaveLength(9);
    expect(frontier.summary.included_observations + frontier.summary.excluded_observations)
      .toBe(9);
    expect(frontier.candidate_ledger.find((row) => row.application_id === "application:one"))
      .toMatchObject({ disposition: "pending_review", reason_code: "application_action_unknown" });
    expect(frontier.transition_reconciliation).toEqual([
      expect.objectContaining({ disposition: "nonauthorizing_unknown_action" }),
    ]);
    expect(frontier.summary.counts_by_observation_disposition).toMatchObject({
      candidate_bearing: 1,
      included_context: 4,
      non_authoritative: 1,
      invalid: 1,
      unsupported_shape: 1,
      unrelated_domain_content: 1,
    });
  });

  it("changes the cohort fingerprint when a newly eligible canonical observation is added", () => {
    const base = [
      record("event_application", "event", { lifecycle_phase: "installed" }),
      record("route_one", "route"),
      record("treatment_one", "treatment_component"),
    ];
    const first = buildInterventionPlacementFrontier({
      canonical_records: base,
      applications: [application()],
      registry: [],
      transitions: [],
    });
    const second = buildInterventionPlacementFrontier({
      canonical_records: [...base, record("event_new", "event", { lifecycle_phase: "suspended" })],
      applications: [application()],
      registry: [],
      transitions: [],
    });
    expect(second.cohort.canonical_input_fingerprint).not.toBe(first.cohort.canonical_input_fingerprint);
    expect(second.summary.candidate_ledger_rows).toBe(first.summary.candidate_ledger_rows + 1);
  });
});
