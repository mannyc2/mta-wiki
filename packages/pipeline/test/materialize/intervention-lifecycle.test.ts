import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  parseInterventionLifecycleAssertion,
  type InterventionLifecycleAssertion,
} from "@mta-wiki/pipeline/materialize/intervention-lifecycle";
import {
  interventionStateAsOf,
} from "@mta-wiki/pipeline/materialize/intervention-state-as-of";
import {
  buildInterventionLifecycleProjection,
} from "@mta-wiki/pipeline/materialize/current-intervention-footprint";
import type { InterventionPlacementRegistryEntry } from "@mta-wiki/pipeline/materialize/intervention-placements";

function assertion(input: {
  state: InterventionLifecycleAssertion["state"];
  coverage?: InterventionLifecycleAssertion["valid_time"]["coverage_kind"];
  startEarliest: string;
  startLatest?: string;
  endEarliest?: string | null;
  endLatest?: string | null;
  precision?: InterventionLifecycleAssertion["valid_time"]["precision"];
  review?: InterventionLifecycleAssertion["review_state"];
  decision?: string | null;
  supersedes?: string[];
}): InterventionLifecycleAssertion {
  const partial = {
    subject: { kind: "placement" as const, placement_id: "placement:one" },
    state: input.state,
    valid_time: {
      coverage_kind: input.coverage ?? "point",
      start_earliest: input.startEarliest,
      start_latest: input.startLatest ?? input.startEarliest,
      end_earliest: input.endEarliest ?? null,
      end_latest: input.endLatest ?? null,
      precision: input.precision ?? "day",
    },
    evidence_bindings: [{
      record_id: "event_one",
      source_id: "source_fixture",
      evidence_id: "source_fixture#p001_b0001",
    }],
    decision_id: input.decision === undefined ? "decision:fixture" : input.decision,
  };
  const id = `assertion:${createHash("sha256").update(stableJson(partial as JsonValue)).digest("hex").slice(0, 24)}`;
  return parseInterventionLifecycleAssertion({
    schema_version: 1,
    assertion_id: id,
    ...partial,
    document_time: {
      source_published_at: "2026-01-01",
      source_retrieved_at: "2026-01-02",
      assertion_as_of: null,
    },
    truth_status: "source_stated",
    review_state: input.review ?? "accepted",
    supersedes_assertion_ids: input.supersedes ?? [],
  });
}

function placement(): InterventionPlacementRegistryEntry {
  const claim = {
    route_record_id: "route_one",
    gtfs_route_id: "R1",
    treatment_record_ids: ["treatment_one"],
    treatment_family: "bus_lane",
    scope: { kind: "unknown" as const, record_ids: [], description: null },
  };
  return {
    schema_version: 1,
    placement_id: "placement:one",
    registry_state: "live_identity",
    founding_key: "fixture",
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

describe("bitemporal intervention lifecycle", () => {
  it("strictly parses valid-time/document-time separately and rejects malformed intervals", () => {
    const row = assertion({
      state: "active",
      coverage: "bounded_interval",
      startEarliest: "2025-01-01",
      startLatest: "2025-01-01",
      endEarliest: "2025-12-31",
      endLatest: "2025-12-31",
      precision: "range",
    });
    expect(parseInterventionLifecycleAssertion(row)).toEqual(row);
    expect(() => parseInterventionLifecycleAssertion({
      ...row,
      valid_time: { ...row.valid_time, start_earliest: "2026-01-01" },
    })).toThrow("start bounds reversed");
    expect(() => parseInterventionLifecycleAssertion({ ...row, latest_wins: true }))
      .toThrow("exact fields");
    expect(() => parseInterventionLifecycleAssertion({
      ...row,
      valid_time: { ...row.valid_time, end_latest: "2025-02-31" },
    })).toThrow("real ISO");
    expect(() => interventionStateAsOf("placement:one", [], "2026-02-31"))
      .toThrow("ISO day");
  });

  it("resolves every state-as-of result without latest-row semantics", () => {
    expect(interventionStateAsOf("placement:one", [
      assertion({ state: "active", startEarliest: "2026-07-27" }),
    ], "2026-07-27").state).toBe("confirmed_active");
    expect(interventionStateAsOf("placement:one", [
      assertion({ state: "active", startEarliest: "2025-01-01" }),
    ], "2026-07-27").state).toBe("last_confirmed_active");
    expect(interventionStateAsOf("placement:one", [
      assertion({
        state: "active",
        coverage: "explicit_open_interval",
        startEarliest: "2025-01-01",
        startLatest: "2025-01-01",
      }),
    ], "2026-07-27").state).toBe("confirmed_active");
    expect(interventionStateAsOf("placement:one", [
      assertion({
        state: "ended",
        coverage: "explicit_open_interval",
        startEarliest: "2026-01-01",
        startLatest: "2026-01-01",
      }),
    ], "2026-07-27").state).toBe("confirmed_inactive");
    expect(interventionStateAsOf("placement:one", [
      assertion({
        state: "suspended",
        coverage: "bounded_interval",
        startEarliest: "2026-07-01",
        startLatest: "2026-07-01",
        endEarliest: "2026-08-01",
        endLatest: "2026-08-01",
      }),
    ], "2026-07-27").state).toBe("suspended");
    expect(interventionStateAsOf("placement:one", [
      assertion({ state: "planned", startEarliest: "2027-01-01" }),
    ], "2026-07-27").state).toBe("planned");
    expect(interventionStateAsOf("placement:one", [], "2026-07-27").state).toBe("unknown");
  });

  it("keeps nonresolving accepted evidence and terminal negative decisions auditable", () => {
    const pastPlan = assertion({ state: "planned", startEarliest: "2025-01-01" });
    expect(interventionStateAsOf("placement:one", [pastPlan], "2026-07-27")).toEqual(
      expect.objectContaining({
        state: "unknown",
        explanation_code: "accepted_evidence_does_not_resolve_date",
        supporting_assertion_ids: [pastPlan.assertion_id],
        conflicting_assertion_ids: [],
        terminal_decision_ids: [],
      }),
    );

    const rejected = assertion({
      state: "active",
      startEarliest: "2025-01-01",
      review: "rejected",
      decision: "decision:negative-lifecycle-review",
    });
    const reviewedNegative = interventionStateAsOf(
      "placement:one",
      [rejected],
      "2026-07-27",
    );
    expect(reviewedNegative).toEqual(expect.objectContaining({
      state: "unknown",
      explanation_code: "terminal_rejection_does_not_establish_state",
      supporting_assertion_ids: [],
      conflicting_assertion_ids: [],
      terminal_decision_ids: ["decision:negative-lifecycle-review"],
    }));

    const noAssertions = interventionStateAsOf("placement:one", [], "2026-07-27");
    expect(noAssertions).toEqual(
      expect.objectContaining({
        state: "unknown",
        explanation_code: "no_accepted_assertion",
        supporting_assertion_ids: [],
        conflicting_assertion_ids: [],
        terminal_decision_ids: [],
      }),
    );
    expect(reviewedNegative.input_fingerprint).not.toBe(noAssertions.input_fingerprint);
  });

  it("keeps uncertain bounds and contradictory accepted assertions conflicted", () => {
    expect(interventionStateAsOf("placement:one", [
      assertion({
        state: "active",
        startEarliest: "2026-07-01",
        startLatest: "2026-07-31",
        precision: "month",
      }),
    ], "2026-07-27").state).toBe("conflicted");
    expect(interventionStateAsOf("placement:one", [
      assertion({
        state: "active",
        coverage: "explicit_open_interval",
        startEarliest: "2025-01-01",
      }),
      assertion({
        state: "ended",
        coverage: "explicit_open_interval",
        startEarliest: "2026-01-01",
      }),
    ], "2026-07-27").state).toBe("conflicted");
  });

  it("publishes only confirmed-active placements and reconciles every other placement", () => {
    const historical = assertion({ state: "active", startEarliest: "2025-01-01" });
    const projection = buildInterventionLifecycleProjection({
      placements: [placement()],
      transitions: [],
      assertions: [historical],
      as_of_date: "2026-07-27",
    });
    expect(projection.footprint).toEqual([]);
    expect(projection.footprint_reconciliation).toEqual([
      expect.objectContaining({
        placement_id: "placement:one",
        state: "last_confirmed_active",
      }),
    ]);
    expect(projection.summary.zero_unexplained_loss).toBe(true);

    const active = buildInterventionLifecycleProjection({
      placements: [placement()],
      transitions: [],
      assertions: [assertion({
        state: "active",
        coverage: "explicit_open_interval",
        startEarliest: "2025-01-01",
      })],
      as_of_date: "2026-07-27",
    });
    expect(active.footprint).toEqual([
      expect.objectContaining({ state: "confirmed_active", placement_id: "placement:one" }),
    ]);
    expect(active.footprint_reconciliation).toEqual([]);
  });

  it("carries terminal negative decisions into footprint reconciliation without inferring inactivity", () => {
    const rejected = assertion({
      state: "active",
      startEarliest: "2025-01-01",
      review: "rejected",
      decision: "decision:negative-lifecycle-review",
    });
    const projection = buildInterventionLifecycleProjection({
      placements: [placement()],
      transitions: [],
      assertions: [rejected],
      as_of_date: "2026-07-27",
    });

    expect(projection.footprint).toEqual([]);
    expect(projection.footprint_reconciliation).toEqual([
      expect.objectContaining({
        placement_id: "placement:one",
        state: "unknown",
        explanation_code: "terminal_rejection_does_not_establish_state",
        terminal_decision_ids: ["decision:negative-lifecycle-review"],
      }),
    ]);
    expect(projection.summary.counts_by_state).toEqual(expect.objectContaining({
      confirmed_inactive: 0,
      unknown: 1,
    }));
    expect(projection.summary.confirmed_active_count).toBe(0);
    expect(projection.summary.reconciliation_count).toBe(1);
    expect(projection.summary.zero_unexplained_loss).toBe(true);
  });
});
