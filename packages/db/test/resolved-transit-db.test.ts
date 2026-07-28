import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openResolvedTransitDb,
  readResolvedCurrentInterventionFootprint,
  readResolvedInterventionApplications,
  readResolvedInterventionEpisodes,
  readResolvedInterventionPlacements,
  readResolvedInterventionPlacementStates,
  rebuildResolvedTransitDb,
} from "../src/resolved-transit-db.js";

const directories: string[] = [];

function fixture() {
  const episode = {
    occurrence_id: "occurrence:one",
    resolved_onset: { date: "2025-01-01", precision: "day" as const },
    review_decision_id: "review:one",
    review_membership_fingerprint: "a".repeat(64),
    resolution_method: "accepted_review" as const,
  };
  const application = {
    application_id: "application:one",
    occurrence_id: "occurrence:one",
    route_record_id: "route_one",
    gtfs_route_id: "R1",
    treatment_record_id: "treatment_one",
    treatment_family: "bus_lane",
    phase_record_id: "event_one",
    action: "add",
    extent: { kind: "unknown" },
  };
  return {
    episodes: [episode],
    applications: [application],
    context_links: [],
    application_reconciliation: [],
    identity_reconciliation: [],
    summary: { contract_id: "resolved-intervention-model-v1" },
  };
}

function lifecycleFixture(asOfDate = "2026-07-27") {
  return {
    ...fixture(),
    placements: [{
      placement_id: "placement:one",
      registry_state: "live_identity",
      current_claim: {
        route_record_id: "route_one",
        gtfs_route_id: "R1",
        treatment_family: "bus_lane",
        scope: { kind: "route_wide", record_ids: ["route_one"] },
      },
    }],
    placement_transitions: [{
      transition_id: "transition:one",
      application_id: "application:one",
      action: "add",
    }],
    placement_frontier: [{
      candidate_id: "candidate:one",
      disposition: "resolved_placement",
      origin: "application",
    }],
    placement_reconciliation: [],
    documentary_lifecycle_observations: [{
      observation_id: "documentary:event_one",
      subject_record_id: "placement:one",
      lifecycle_phase: "launched",
      document_status: "complete",
      assertion_as_of: "2025-01-01",
      source_id: "source_one",
    }],
    lifecycle_assertions: [{
      assertion_id: "assertion:one",
      subject: { kind: "placement", placement_id: "placement:one" },
      state: "active",
      review_state: "accepted",
      valid_time: {
        start_earliest: "2025-01-01",
        start_latest: "2025-01-01",
        end_earliest: null,
        end_latest: null,
      },
      document_time: { assertion_as_of: "2025-01-01" },
    }],
    placement_states_as_of: [{
      placement_id: "placement:one",
      as_of_date: asOfDate,
      state: "confirmed_active",
    }],
    current_footprint: [{
      placement_id: "placement:one",
      as_of_date: asOfDate,
      gtfs_route_id: "R1",
      treatment_family: "bus_lane",
      scope: { kind: "route_wide" },
    }],
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("resolved transit DB", () => {
  it("atomically rebuilds deterministic strict tables and indexed read paths", () => {
    const directory = mkdtempSync(join(tmpdir(), "resolved-transit-db-"));
    directories.push(directory);
    const path = join(directory, "resolved.db");
    const first = rebuildResolvedTransitDb(fixture(), { path });
    const second = rebuildResolvedTransitDb(fixture(), { path });
    expect(second.schemaSha256).toBe(first.schemaSha256);
    expect(second.dataSha256).toBe(first.dataSha256);
    expect(readResolvedInterventionEpisodes({ occurrenceId: "occurrence:one", path })).toHaveLength(1);
    expect(readResolvedInterventionApplications({ gtfsRouteId: "R1", treatmentFamily: "bus_lane", path }))
      .toHaveLength(1);
    const db = openResolvedTransitDb(path);
    try {
      expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(db.query("SELECT COUNT(*) AS count FROM resolved_intervention_applications").get())
        .toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it("fails closed when an application references a missing episode", () => {
    const directory = mkdtempSync(join(tmpdir(), "resolved-transit-db-"));
    directories.push(directory);
    const model = fixture();
    model.applications[0]!.occurrence_id = "occurrence:missing";
    expect(() => rebuildResolvedTransitDb(model, { path: join(directory, "resolved.db") }))
      .toThrow();
  });

  it("materializes deterministic bitemporal placement snapshots and indexed reads", () => {
    const directory = mkdtempSync(join(tmpdir(), "resolved-transit-db-"));
    directories.push(directory);
    const path = join(directory, "resolved.db");
    const first = rebuildResolvedTransitDb(lifecycleFixture(), { path });
    const second = rebuildResolvedTransitDb(lifecycleFixture(), { path });
    expect(second.schemaSha256).toBe(first.schemaSha256);
    expect(second.dataSha256).toBe(first.dataSha256);
    expect(readResolvedInterventionPlacements({
      gtfsRouteId: "R1", treatmentFamily: "bus_lane", path,
    })).toHaveLength(1);
    expect(readResolvedInterventionPlacementStates({
      asOfDate: "2026-07-27", state: "confirmed_active", path,
    })).toHaveLength(1);
    expect(readResolvedCurrentInterventionFootprint({
      asOfDate: "2026-07-27", gtfsRouteId: "R1", path,
    })).toHaveLength(1);
    const db = openResolvedTransitDb(path);
    try {
      expect(db.query("SELECT COUNT(*) AS count FROM latest_lifecycle_observation").get())
        .toEqual({ count: 1 });
      expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 2 });
    } finally {
      db.close();
    }
  });

  it("changes a dated snapshot without changing stable placement tables", () => {
    const directory = mkdtempSync(join(tmpdir(), "resolved-transit-db-"));
    directories.push(directory);
    const firstPath = join(directory, "first.db");
    const secondPath = join(directory, "second.db");
    const first = rebuildResolvedTransitDb(lifecycleFixture("2026-07-27"), { path: firstPath });
    const second = rebuildResolvedTransitDb(lifecycleFixture("2027-07-27"), { path: secondPath });
    expect(second.schemaSha256).toBe(first.schemaSha256);
    expect(second.dataSha256).not.toBe(first.dataSha256);
    const stableRows = (path: string) => {
      const db = openResolvedTransitDb(path);
      try {
        return db.query(
          "SELECT placement_id, registry_state, row_json FROM resolved_intervention_placements ORDER BY placement_id",
        ).all();
      } finally {
        db.close();
      }
    };
    expect(stableRows(secondPath)).toEqual(stableRows(firstPath));
  });
});
