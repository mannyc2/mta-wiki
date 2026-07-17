import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { openCanonicalDb, rebuildCanonicalDb } from "@mta-wiki/db/canonical-db";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  prepareRelationshipCompletenessMaterializationBoundary,
  relationshipCompletenessCanonicalSnapshotPins,
  RELATIONSHIP_COMPLETENESS_SNAPSHOT_STALE_CODE,
} from "@mta-wiki/pipeline/quality/relationship-completeness-boundary";
import {
  OCCURRENCE_TREATMENT_PHYSICALITY_POLICY_V1,
} from "@mta-wiki/pipeline/quality/occurrence-treatment-physicality";
import {
  buildRelationshipCompletenessAudit,
  type LoadedRelationshipCompletenessArtifacts,
} from "@mta-wiki/pipeline/quality/relationship-completeness";

function eventRecord(eventFamily: "implementation" | "other", displayName = "Fixture event"): MtaCanonicalRecord {
  return {
    record_id: "event_fixture",
    record_kind: "event",
    source_id: "fixture_source",
    local_observation_id: "event_fixture",
    display_name: displayName,
    payload: { event_family: eventFamily, event_kind: eventFamily === "implementation" ? "implementation" : "public_event" },
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-15T00:00:00.000Z",
  };
}

function loadedFor(records: MtaCanonicalRecord[]): LoadedRelationshipCompletenessArtifacts {
  const build = buildRelationshipCompletenessAudit({
    releaseId: "fixture-release",
    occurrences: [],
    treatments: records.filter((record) => record.record_kind === "treatment_component"),
    events: records.filter((record) => record.record_kind === "event"),
    projects: records.filter((record) => record.record_kind === "project"),
    corridors: records.filter((record) => record.record_kind === "corridor"),
    routes: records.filter((record) => record.record_kind === "route"),
    routeAnchors: [],
    routeAnchorReview: {
      schema_version: 1,
      contract_id: "route-identity-dispositions-v1",
      gtfs_feed: { feed_date: "fixture", route_count: 0, routes_sha256: "a".repeat(64) },
      sbs_plus_successor_rule: {
        rule_id: "unique-sbs-plus-successor-v1",
        description: "Fixture exact-terminal-plus rule.",
      },
      overrides: {},
      non_gtfs_dispositions: {},
    },
    relations: records.filter((record) => record.record_kind === "relation"),
    coverageGaps: [],
    relationshipDispositions: [],
    inputPins: relationshipCompletenessCanonicalSnapshotPins(records),
    treatmentPhysicality: {
      policy: OCCURRENCE_TREATMENT_PHYSICALITY_POLICY_V1,
      decisions: [],
      contract_status: "reviewed_final",
      final_post_semantic_release_guard_status: "verified",
    },
  });
  return { ...build, outputDir: "fixture", relationshipDispositions: [] };
}

describe("relationship completeness materialization boundary", () => {
  it("keeps warning-first backlog nonblocking and emits an explicit stable stale-snapshot diagnostic", () => {
    const audited = [eventRecord("implementation")];
    const projected = [eventRecord("implementation", "Changed after the pinned audit")];
    const boundary = prepareRelationshipCompletenessMaterializationBoundary(
      projected,
      loadedFor(audited),
      "warning_first",
    );

    expect(boundary.mode).toBe("warning");
    expect(boundary.warning_finding_count).toBeGreaterThan(0);
    expect(boundary.exact_canonical_snapshot).toBe(false);
    expect(boundary.snapshot_mismatches.map((item) => item.file)).toEqual(["events.jsonl"]);
    expect(boundary.mirror.enforcement.hardModeReady).toBe(false);
    expect(boundary.mirror.enforcement.criteriaJson).toMatchObject({
      materialization_snapshot: {
        diagnostic_code: RELATIONSHIP_COMPLETENESS_SNAPSHOT_STALE_CODE,
        status: "stale",
        mismatch_count: 1,
      },
    });
  });

  it("accepts enforced mode only for an exact, hard-ready, zero-finding snapshot", () => {
    const records = [eventRecord("other")];
    const loaded = loadedFor(records);
    expect(loaded.summary.enforcement_migration.hard_mode_ready).toBe(true);

    const boundary = prepareRelationshipCompletenessMaterializationBoundary(records, loaded, "enforced");
    expect(boundary.mode).toBe("enforce");
    expect(boundary.exact_canonical_snapshot).toBe(true);
    expect(boundary.warning_finding_count).toBe(0);
    expect(boundary.mirror.enforcement).toMatchObject({ mode: "enforce", hardModeReady: true });
  });

  it("rejects enforced stale snapshots and backlog even if hard-ready is falsely asserted", () => {
    const cleanRecords = [eventRecord("other")];
    expect(() => prepareRelationshipCompletenessMaterializationBoundary(
      [eventRecord("other", "Stale projection")],
      loadedFor(cleanRecords),
      "enforced",
    )).toThrow("canonical snapshot is stale");

    const backlogRecords = [eventRecord("implementation")];
    const backlog = loadedFor(backlogRecords);
    expect(() => prepareRelationshipCompletenessMaterializationBoundary(
      backlogRecords,
      backlog,
      "enforced",
    )).toThrow("artifact hard_mode_ready=false");

    backlog.summary.enforcement_migration.hard_mode_ready = true;
    expect(() => prepareRelationshipCompletenessMaterializationBoundary(
      backlogRecords,
      backlog,
      "enforced",
    )).toThrow("completeness warning backlog=");

    const omittedRouteSelector = loadedFor(cleanRecords);
    omittedRouteSelector.summary.route_identities.denominator_count = 1;
    expect(() => prepareRelationshipCompletenessMaterializationBoundary(
      cleanRecords,
      omittedRouteSelector,
      "enforced",
    )).toThrow("route_identity expected=1 actual=0");
  });

  it("preserves warning completeness subjects, findings, selectors, and state across ordinary SQLite rebuilds", () => {
    const records = [eventRecord("implementation")];
    const boundary = prepareRelationshipCompletenessMaterializationBoundary(
      records,
      loadedFor(records),
      "warning_first",
    );
    const work = mkdtempSync(join(tmpdir(), "relationship-completeness-boundary-"));
    const path = join(work, "canonical.db");
    try {
      for (let rebuild = 0; rebuild < 2; rebuild += 1) {
        rebuildCanonicalDb(records, {
          path,
          relationshipCompleteness: boundary.mirror,
          evidenceRegistry: { provenance: "test_fixture", entries: [] },
        });
      }
      const db = openCanonicalDb(path, { readonly: true });
      try {
        const state = db.query(
          "SELECT mode, hard_mode_ready, criteria_json FROM relationship_enforcement_state",
        ).get() as { mode: string; hard_mode_ready: number; criteria_json: string };
        const subjectCount = (db.query("SELECT COUNT(*) AS count FROM relationship_completeness_subjects").get() as { count: number }).count;
        const findingCount = (db.query("SELECT COUNT(*) AS count FROM relationship_completeness_findings").get() as { count: number }).count;
        const selectorCount = (db.query("SELECT COUNT(*) AS count FROM relationship_selector_contracts").get() as { count: number }).count;
        expect(state.mode).toBe("warning");
        expect(state.hard_mode_ready).toBe(0);
        expect(JSON.parse(state.criteria_json)).toMatchObject({ materialization_snapshot: { status: "exact" } });
        expect(subjectCount).toBe(boundary.mirror.subjects.length);
        expect(findingCount).toBe(boundary.mirror.findings.length);
        expect(selectorCount).toBe(5);
      } finally {
        db.close();
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it("runs the no-option completeness boundary before authoritative writes in both production rebuild paths", () => {
    const materializer = readFileSync(join(repoRoot, "packages/pipeline/src/materialize/materialize.ts"), "utf8");
    const publicClone = readFileSync(join(repoRoot, "packages/cli/src/commands/materialize.ts"), "utf8");
    const materializerBoundary = materializer.indexOf("relationshipCompletenessForMaterialization(records, relationshipContract)");
    expect(materializerBoundary).toBeGreaterThan(0);
    expect(materializerBoundary).toBeLessThan(materializer.indexOf("writeEvidenceBlockIndex(records)"));
    expect(materializer).toContain("relationshipCompleteness: relationshipCompleteness.mirror");
    const publicBoundary = publicClone.indexOf("relationshipCompletenessForMaterialization(records, relationshipContract)");
    expect(publicBoundary).toBeGreaterThan(0);
    expect(publicBoundary).toBeLessThan(publicClone.indexOf("const result = rebuildCanonicalDb(records"));
    expect(publicClone).toContain("relationshipCompleteness: relationshipCompleteness.mirror");
  });
});
