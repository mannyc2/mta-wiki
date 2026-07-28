import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openResolvedTransitDb,
  readResolvedInterventionApplications,
  readResolvedInterventionEpisodes,
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
});
