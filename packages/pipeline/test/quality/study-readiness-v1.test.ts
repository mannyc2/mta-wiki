import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "../../../core/src/paths";
import {
  classifyDownstreamDisposition,
  extentDecisionKey,
  projectMemberExtent,
  validateMemberExtentDecision,
  type MemberExtentDecision,
} from "../../src/quality/study-readiness-v1";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8").split(/\r?\n/u)
    .flatMap((line) => line.trim() ? [JSON.parse(line) as T] : []);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const contractDir = join(
  repoRoot,
  "data/contracts/operational-occurrence-member-extent/v1",
);
const qualityDir = join(repoRoot, "data/quality/study-readiness/v1");
const overlayDir = join(
  repoRoot,
  "data/quality/relationship-integrity/bus-lane-acquisition/current-resolutions/v1",
);

describe("study-readiness v1 extent contract", () => {
  it("enumerates the exact rc26 occurrence × route × member denominator", () => {
    const rows = readJsonl<{
      occurrence_id: string;
      route_record_id: string;
      treatment_record_id: string;
      extent: string;
      missing_roles: string[];
      authorizes_study: boolean;
      authorizes_cross_product: boolean;
    }>(join(contractDir, "operational_occurrence_member_extents.jsonl"));
    const summary = readJson<{
      member_extent_row_count: number;
      eligible_member_extent_row_count: number;
      extent_counts: Record<string, number>;
    }>(join(contractDir, "summary.json"));

    expect(rows).toHaveLength(308);
    expect(new Set(rows.map(extentDecisionKey)).size).toBe(308);
    expect(summary.member_extent_row_count).toBe(308);
    expect(summary.eligible_member_extent_row_count).toBe(306);
    expect(summary.extent_counts).toEqual({
      route_wide: 2,
      bounded_segment: 9,
      stop_set: 0,
      mixed: 0,
      unresolved: 297,
    });
    expect(rows.every((row) => !row.authorizes_study && !row.authorizes_cross_product)).toBe(true);
    expect(rows.filter((row) => row.extent === "unresolved")
      .every((row) => row.missing_roles.length > 0)).toBe(true);
  });

  it("does not promote empty scope, route membership, or nonphysicality defaults", () => {
    const projected = projectMemberExtent({
      occurrence_id: "occurrence:test",
      occurrence_review_decision_id: "review:test",
      route_record_id: "route_test",
      gtfs_route_id: "TEST",
      treatment_record_id: "treatment_test",
      treatment_family: "service_pattern",
    });
    expect(projected.extent).toBe("unresolved");
    expect(projected.missing_roles).toEqual(["reviewed_extent_decision"]);
    expect(projected.authorizes_cross_product).toBe(false);
  });

  it("rejects malformed positive and unresolved decisions", () => {
    const base: MemberExtentDecision = {
      decision_id: "decision:test",
      occurrence_id: "occurrence:test",
      route_record_id: "route_test",
      treatment_record_id: "treatment_test",
      resolution: "route_wide",
      components: [],
      evidence_bindings: [],
      missing_roles: [],
      rationale: "test",
      reviewed_at: "2026-07-21T00:00:00.000Z",
      reviewed_by: "test",
    };
    expect(() => validateMemberExtentDecision(base)).toThrow();
    expect(() => validateMemberExtentDecision({
      ...base,
      resolution: "unresolved",
      missing_roles: [],
    })).toThrow();
    expect(() => validateMemberExtentDecision({
      ...base,
      resolution: "mixed",
      components: [{
        component_kind: "route",
        identity_namespace: "canonical_record",
        identifiers: ["route_test"],
        description: "one kind only",
      }],
      evidence_bindings: [{
        role: "extent_classification",
        record_id: "treatment_test",
        source_id: "source_test",
        evidence_id: "source_test#p001_b0001",
      }],
    })).toThrow();
  });

  it("retains exact Flatbush B41 and B67 bounded rows without fan-out", () => {
    const rows = readJsonl<{
      occurrence_id: string;
      gtfs_route_id: string;
      treatment_record_id: string;
      extent: string;
      components: Array<{ identifiers: string[] }>;
    }>(join(contractDir, "operational_occurrence_member_extents.jsonl"))
      .filter((row) => row.occurrence_id === "occurrence:8c987704152b459014217d44");
    expect(rows.map((row) => row.gtfs_route_id).sort()).toEqual(["B41", "B67"]);
    expect(rows.every((row) => row.extent === "bounded_segment")).toBe(true);
    expect(rows.every((row) => row.treatment_record_id ===
      "treatment_flatbush-phase1-center-running-bus-lanes-livingston-state")).toBe(true);
    expect(rows.every((row) => row.components[0]?.identifiers.includes(
      "corridor_flatbush-phase1-livingston-state"))).toBe(true);
  });
});

describe("study-readiness v1 Tracker bridge", () => {
  it("reconciles the full mutually exclusive rc26 funnel", () => {
    const summary = readJson<{
      row_count: number;
      disposition_counts: Record<string, number>;
      authorizes_study: boolean;
      authorizes_cross_product: boolean;
    }>(join(qualityDir, "bridge-summary.json"));
    expect(summary.row_count).toBe(484);
    expect(summary.disposition_counts).toEqual({
      approved_rc26: 7,
      quarantined_later_ace_phase: 20,
      source_fixable_bus_lane_occurrence_identity: 321,
      source_fixable_member_treatment_extent: 83,
      tracker_owned_outcome_calendar: 8,
      tracker_owned_spine_or_pattern: 45,
    });
    expect(summary.authorizes_study).toBe(false);
    expect(summary.authorizes_cross_product).toBe(false);
  });

  it("keeps revised Flatbush B41 consumer-owned and B67 approved", () => {
    expect(classifyDownstreamDisposition({
      candidate_id: "study-event-v2:6b70c52e0eec23eb63cab94f",
      treatment_family: "bus_lane",
      decision: "rejected",
      decision_rationale: "exact identity is proved but current B41 spine remains consumer-owned",
    })).toBe("tracker_owned_spine_or_pattern");
    expect(classifyDownstreamDisposition({
      candidate_id: "study-event-v2:d70a3ee36eb94ae88732065f",
      treatment_family: "bus_lane",
      decision: "approved",
      decision_rationale: "approved",
    })).toBe("approved_rc26");
  });

  it("contains only 404 source-fixable targets and quarantines 73 others", () => {
    const manifest = readJson<{
      target_count: number;
      priority_1_count: number;
      exhausted_bus_lane_sweep_count: number;
      targets: Array<{ downstream_rejection_reason: string }>;
    }>(join(qualityDir, "consumer-priority-manifest.json"));
    const quarantine = readJsonl<{ source_research_can_resolve: boolean }>(
      join(qualityDir, "consumer-owned-quarantine.jsonl"),
    );
    expect(manifest.target_count).toBe(404);
    expect(manifest.priority_1_count).toBe(11);
    expect(manifest.exhausted_bus_lane_sweep_count).toBe(321);
    expect(manifest.targets.every((row) => row.downstream_rejection_reason.startsWith(
      "source_fixable_"))).toBe(true);
    expect(quarantine).toHaveLength(73);
    expect(quarantine.every((row) => row.source_research_can_resolve === false)).toBe(true);
  });

  it("records two complete existing occurrences and nine exact negative findings", () => {
    const summary = readJson<{
      target_count: number;
      evidence_complete_existing_occurrence_count: number;
      negative_disposition_count: number;
      new_occurrence_count: number;
      exact_missing_role_counts: Record<string, number>;
    }>(join(qualityDir, "research/summary.json"));
    expect(summary).toEqual({
      schema_version: 1,
      batch_id: "queens-redesign-extent-priority-v1",
      target_count: 11,
      evidence_complete_existing_occurrence_count: 2,
      negative_disposition_count: 9,
      new_occurrence_count: 0,
      exact_missing_role_counts: {
        bounded_scope_identity: 7,
        scope_modality: 3,
        stop_identity: 4,
      },
      notice: expect.any(String),
    });
  });

  it("reproduces every generated byte in check mode", () => {
    const result = spawnSync(process.execPath, [
      join(repoRoot, "scripts/generate-study-readiness-v1.ts"),
      "--check",
    ], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"bridge_rows":484');
  });
});

describe("append-only bus-lane acquisition resolution overlay", () => {
  it("links only exact B41/B67 receipts and preserves immutable bytes", () => {
    const receiptsPath = join(
      repoRoot,
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/brooklyn-null/receipts.jsonl",
    );
    expect(sha256(readFileSync(receiptsPath, "utf8"))).toBe(
      "8806c619a6a3cbcdf4233f74fb58cab8d243651b649b69c02c8f8c4c24344a10",
    );
    const ledger = readJsonl<{
      immutable_receipt: { receipt_id: string };
      current_resolution: { gtfs_route_id: string; missing_roles: string[] };
      resolution_doctrine: {
        rewrites_historical_receipt: boolean;
        authorizes_study: boolean;
        authorizes_cross_product: boolean;
      };
    }>(join(overlayDir, "ledger.jsonl"));
    expect(ledger).toHaveLength(2);
    expect(ledger.map((row) => row.current_resolution.gtfs_route_id).sort()).toEqual(["B41", "B67"]);
    expect(ledger.every((row) => row.current_resolution.missing_roles.length === 0)).toBe(true);
    expect(ledger.every((row) =>
      !row.resolution_doctrine.rewrites_historical_receipt &&
      !row.resolution_doctrine.authorizes_study &&
      !row.resolution_doctrine.authorizes_cross_product)).toBe(true);
  });
});
