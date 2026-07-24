import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import {
  PLAN040_PACKAGE_14_ACCEPTANCE_PATH,
  PLAN040_PACKAGE_14_COMPARISON_PATH,
  PLAN040_PACKAGE_14_GATE_PATH,
  PLAN040_PACKAGE_14_PERSISTENCE_EVIDENCE_PATH,
  PLAN040_PACKAGE_14_SOURCE_GAP_BLOCK_PATH,
  PLAN040_PACKAGE_14_EXTENT_DECISIONS_PATH,
  PLAN040_PACKAGE_14_GRAIN_DECISIONS_PATH,
  PLAN040_PACKAGE_14_SOURCE_GAP_OVERLAY_PATH,
  persistPlan040Package14AcceptedArtifacts,
  validatePlan040Package14GateAndAcceptance,
} from
  "../../src/quality/plan040-accelerated-package14-closeout.js";

const sha256 = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const readJson = (path: string): Record<string, any> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;
const readJsonl = (path: string): Array<Record<string, any>> =>
  readFileSync(path, "utf8").trim().split("\n")
    .map((line) => JSON.parse(line) as Record<string, any>);

describe("Plan 040 accelerated Package 14 closeout", () => {
  it("replays the detailed dual-review gate and compact owner acceptance", () => {
    const result = validatePlan040Package14GateAndAcceptance();
    expect(result.candidateCount).toBe(36);
    expect(result.verdictDistribution).toEqual({
      positive_extent_and_grain_proposed: 8,
      positive_extent_proposed_grain_blocked: 0,
      source_gap_blocked_extent_and_grain: 28,
      source_gap_block_receipt: 28,
      exact_absence: 0,
    });
    expect(result.reviewerResult).toBe("APPROVE/APPROVE");
    expect(sha256(PLAN040_PACKAGE_14_GATE_PATH)).toBe(result.gate.sha256);
    expect(sha256(PLAN040_PACKAGE_14_ACCEPTANCE_PATH))
      .toBe(result.acceptance.sha256);
  });

  it("pins a strict nonauthorizing 28-candidate source-gap chain", () => {
    const comparison = readJson(PLAN040_PACKAGE_14_COMPARISON_PATH);
    const receipt = readJson(PLAN040_PACKAGE_14_SOURCE_GAP_BLOCK_PATH);
    const evidence = readJson(PLAN040_PACKAGE_14_PERSISTENCE_EVIDENCE_PATH);
    expect(comparison.normal_file_verified).toBeTrue();
    expect(comparison.replay_derived).toBeTrue();
    expect(receipt.candidate_count).toBe(28);
    expect(receipt.exact_absence_count).toBe(0);
    expect(receipt.candidates).toHaveLength(28);
    expect(receipt.candidates.every((candidate: Record<string, any>) =>
      candidate.blocked_surfaces.join(",") ===
        "member_extent,member_grain" &&
      candidate.literal_exact_absence === false &&
      candidate.semantic_verdict === "blocked_upstream"
    )).toBeTrue();
    expect(evidence.source_gap_block_receipt.sha256)
      .toBe(sha256(PLAN040_PACKAGE_14_SOURCE_GAP_BLOCK_PATH));
    for (const artifact of [comparison, receipt, evidence]) {
      expect(artifact.authorizes_occurrence ?? false).toBeFalse();
      expect(artifact.authorizes_study ?? false).toBeFalse();
      expect(artifact.authorizes_cross_product ?? false).toBeFalse();
    }
  });

  it("authorizes only the exact accepted persistence surface", () => {
    const acceptance = readJson(PLAN040_PACKAGE_14_ACCEPTANCE_PATH);
    expect(acceptance.authorized_exact_persistence).toMatchObject({
      decision_candidate_count: 8,
      extent_decision_count: 8,
      grain_decision_count: 8,
      source_gap_overlay_count: 28,
      extent_resolved_count: 8,
      extent_blocked_upstream_count: 28,
      grain_resolved_count: 8,
      grain_blocked_upstream_count: 28,
    });
    expect(acceptance.authorizes_decision_persistence).toBeTrue();
    expect(acceptance.authorizes_occurrence).toBeFalse();
    expect(acceptance.authorizes_study).toBeFalse();
    expect(acceptance.authorizes_cross_product).toBeFalse();
    expect(acceptance.authorizes_ontology).toBeFalse();
    expect(acceptance.authorizes_corrections).toBeFalse();
    expect(Object.values(acceptance.preservation_invariants)
      .every((value) => value === true)).toBeTrue();
  });

  it("replays exactly 8 extent, 8 grain, and 28 blocked overlays", () => {
    const persisted = persistPlan040Package14AcceptedArtifacts();
    const extents = readJson(PLAN040_PACKAGE_14_EXTENT_DECISIONS_PATH);
    const grains = readJson(PLAN040_PACKAGE_14_GRAIN_DECISIONS_PATH);
    const overlay = readJson(PLAN040_PACKAGE_14_SOURCE_GAP_OVERLAY_PATH);
    expect(extents.decisions).toHaveLength(8);
    expect(grains.decisions).toHaveLength(8);
    expect(overlay.entries).toHaveLength(28);
    expect(extents.decisions.filter((decision: Record<string, any>) =>
      decision.resolution === "bounded_segment"
    )).toHaveLength(1);
    expect(extents.decisions.filter((decision: Record<string, any>) =>
      decision.resolution === "route_wide"
    )).toHaveLength(6);
    expect(extents.decisions.filter((decision: Record<string, any>) =>
      decision.resolution === "stop_set"
    )).toHaveLength(1);
    expect(grains.decisions.filter((decision: Record<string, any>) =>
      decision.service_scope.kind === "all_service"
    )).toHaveLength(1);
    expect(grains.decisions.filter((decision: Record<string, any>) =>
      decision.service_scope.kind === "not_applicable"
    )).toHaveLength(7);
    expect(overlay.entries.every((entry: Record<string, any>) =>
      entry.blocked_surfaces.join(",") ===
        "member_extent,member_grain" &&
      entry.verdict.startsWith("blocked_upstream:")
    )).toBeTrue();
    expect(sha256(PLAN040_PACKAGE_14_EXTENT_DECISIONS_PATH))
      .toBe(persisted.extent.sha256);
    expect(sha256(PLAN040_PACKAGE_14_GRAIN_DECISIONS_PATH))
      .toBe(persisted.grain.sha256);
    expect(sha256(PLAN040_PACKAGE_14_SOURCE_GAP_OVERLAY_PATH))
      .toBe(persisted.sourceGapOverlay.sha256);
  });

  it("projects the exact global 29-open closure without new authority", () => {
    const extent = readJsonl(
      `${process.cwd()}/data/quality/operational-reference/` +
        "member-extent-ledger.jsonl",
    );
    const grain = readJsonl(
      `${process.cwd()}/data/quality/operational-reference/` +
        "member-grain-ledger.jsonl",
    );
    const count = (
      rows: Array<Record<string, any>>,
      predicate: (row: Record<string, any>) => boolean,
    ): number => rows.filter(predicate).length;
    expect({
      absent: count(extent, (row) => row.verdict === "absent_in_source"),
      blocked: count(extent, (row) =>
        row.verdict.startsWith("blocked_upstream:")
      ),
      bounded: count(extent, (row) =>
        row.verdict === "resolved:bounded_segment"
      ),
      routewide: count(extent, (row) =>
        row.verdict === "resolved:route_wide"
      ),
      stopset: count(extent, (row) =>
        row.verdict === "resolved:stop_set"
      ),
      unreviewed: count(extent, (row) => row.verdict === "unreviewed"),
    }).toEqual({
      absent: 165,
      blocked: 38,
      bounded: 48,
      routewide: 20,
      stopset: 8,
      unreviewed: 29,
    });
    expect({
      absent: count(grain, (row) => row.verdict === "absent_in_source"),
      blocked: count(grain, (row) =>
        row.verdict.startsWith("blocked_upstream:")
      ),
      not_applicable: count(grain, (row) =>
        row.verdict === "not_applicable"
      ),
      resolved: count(grain, (row) => row.verdict === "resolved"),
      unreviewed: count(grain, (row) => row.verdict === "unreviewed"),
    }).toEqual({
      absent: 165,
      blocked: 47,
      not_applicable: 9,
      resolved: 58,
      unreviewed: 29,
    });
    expect([...extent, ...grain].every((row) =>
      row.authorizes_study === false &&
      row.authorizes_cross_product === false
    )).toBeTrue();
  });

  it("replays the real Package 14 generator after persistence", () => {
    const result = spawnSync(
      "bun",
      [
        "packages/pipeline/scripts/" +
          "generate-plan040-accelerated-package14.ts",
        "--check",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(
      "checked Plan 040 accelerated Package 14 post-persistence replay",
    );
  });
});
