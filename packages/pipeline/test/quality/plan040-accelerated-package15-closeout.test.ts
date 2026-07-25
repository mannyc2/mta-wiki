import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import {
  PLAN040_PACKAGE_15_ACCEPTANCE_PATH,
  PLAN040_PACKAGE_15_COMPARISON_PATH,
  PLAN040_PACKAGE_15_EXTENT_DECISIONS_PATH,
  PLAN040_PACKAGE_15_GATE_PATH,
  PLAN040_PACKAGE_15_GRAIN_DECISIONS_PATH,
  PLAN040_PACKAGE_15_PERSISTENCE_EVIDENCE_PATH,
  PLAN040_PACKAGE_15_SOURCE_GAP_BLOCK_PATH,
  PLAN040_PACKAGE_15_SOURCE_GAP_OVERLAY_PATH,
  persistPlan040Package15AcceptedArtifacts,
  validatePlan040Package15GateAndAcceptance,
} from
  "../../src/quality/plan040-accelerated-package15-closeout.js";

const sha256 = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const readJson = (path: string): Record<string, any> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;
const readJsonl = (path: string): Array<Record<string, any>> =>
  readFileSync(path, "utf8").trim().split("\n")
    .map((line) => JSON.parse(line) as Record<string, any>);

describe("Plan 040 accelerated Package 15 closeout", () => {
  it("replays the 29-row dual-review gate and compact owner acceptance", () => {
    const result = validatePlan040Package15GateAndAcceptance();
    expect(result.candidateCount).toBe(29);
    expect(result.verdictDistribution).toEqual({
      positive_extent_and_grain_proposed: 16,
      source_gap_blocked_extent_and_grain: 13,
      exact_absence: 0,
    });
    expect(result.reviewerResult).toBe("APPROVE/APPROVE");
    expect(sha256(PLAN040_PACKAGE_15_GATE_PATH)).toBe(result.gate.sha256);
    expect(sha256(PLAN040_PACKAGE_15_ACCEPTANCE_PATH))
      .toBe(result.acceptance.sha256);
  });

  it("pins 13 canonical both-surface blocks and preserves frozen labels", () => {
    const comparison = readJson(PLAN040_PACKAGE_15_COMPARISON_PATH);
    const receipt = readJson(PLAN040_PACKAGE_15_SOURCE_GAP_BLOCK_PATH);
    const evidence = readJson(PLAN040_PACKAGE_15_PERSISTENCE_EVIDENCE_PATH);
    expect(comparison.normal_file_verified).toBeTrue();
    expect(comparison.replay_derived).toBeTrue();
    expect(receipt.candidate_count).toBe(13);
    expect(receipt.exact_absence_count).toBe(0);
    expect(receipt.candidates).toHaveLength(13);
    expect(receipt.candidates.every((candidate: Record<string, any>) =>
      candidate.blocked_surfaces.join(",") ===
        "member_extent,member_grain" &&
      candidate.literal_exact_absence === false &&
      candidate.semantic_verdict === "blocked_upstream" &&
      candidate.frozen_finding_verdict.startsWith("blocked_upstream:") &&
      candidate.prospective_ledger_handling.member_extent ===
        `blocked_upstream:${candidate.gap_codes.join("+")}` &&
      candidate.prospective_ledger_handling.member_grain ===
        `blocked_upstream:${candidate.gap_codes.join("+")}`
    )).toBeTrue();
    expect(evidence.source_gap_block_receipt.sha256)
      .toBe(sha256(PLAN040_PACKAGE_15_SOURCE_GAP_BLOCK_PATH));
    for (const artifact of [comparison, receipt, evidence]) {
      expect(artifact.authorizes_occurrence ?? false).toBeFalse();
      expect(artifact.authorizes_study ?? false).toBeFalse();
      expect(artifact.authorizes_cross_product ?? false).toBeFalse();
    }
  });

  it("authorizes only 16 exact decisions and 13 canonical overlays", () => {
    const gate = readJson(PLAN040_PACKAGE_15_GATE_PATH);
    const acceptance = readJson(PLAN040_PACKAGE_15_ACCEPTANCE_PATH);
    expect(gate.reviewer_results.map((row: Record<string, any>) => row.verdict))
      .toEqual(["APPROVE", "APPROVE"]);
    expect(gate.candidate_review_results).toHaveLength(29);
    expect(gate.candidate_review_results.every(
      (row: Record<string, any>) => row.review_result === "APPROVE/APPROVE",
    )).toBeTrue();
    expect(acceptance.authorized_exact_persistence).toMatchObject({
      decision_candidate_count: 16,
      extent_decision_count: 16,
      grain_decision_count: 16,
      source_gap_overlay_count: 13,
      extent_resolved_count: 16,
      extent_blocked_upstream_count: 13,
      grain_resolved_count: 16,
      grain_blocked_upstream_count: 13,
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

  it("replays exactly 16 extent, 16 grain, and 13 blocked overlays", () => {
    const persisted = persistPlan040Package15AcceptedArtifacts();
    const extents = readJson(PLAN040_PACKAGE_15_EXTENT_DECISIONS_PATH);
    const grains = readJson(PLAN040_PACKAGE_15_GRAIN_DECISIONS_PATH);
    const overlay = readJson(PLAN040_PACKAGE_15_SOURCE_GAP_OVERLAY_PATH);
    expect(extents.decisions).toHaveLength(16);
    expect(grains.decisions).toHaveLength(16);
    expect(overlay.entries).toHaveLength(13);
    expect(extents.decisions.filter((decision: Record<string, any>) =>
      decision.resolution === "route_wide"
    )).toHaveLength(15);
    expect(extents.decisions.filter((decision: Record<string, any>) =>
      decision.resolution === "stop_set"
    )).toHaveLength(1);
    expect(grains.decisions.filter((decision: Record<string, any>) =>
      decision.service_scope.kind === "all_service"
    )).toHaveLength(14);
    expect(grains.decisions.filter((decision: Record<string, any>) =>
      decision.service_scope.kind === "not_applicable"
    )).toHaveLength(1);
    expect(grains.decisions.filter((decision: Record<string, any>) =>
      decision.service_scope.kind === "trip_subset"
    )).toHaveLength(1);
    expect(overlay.entries.every((entry: Record<string, any>) =>
      entry.blocked_surfaces.join(",") ===
        "member_extent,member_grain" &&
      entry.verdict ===
        `blocked_upstream:${entry.missing_roles.join("+")}`
    )).toBeTrue();
    expect(sha256(PLAN040_PACKAGE_15_EXTENT_DECISIONS_PATH))
      .toBe(persisted.extent.sha256);
    expect(sha256(PLAN040_PACKAGE_15_GRAIN_DECISIONS_PATH))
      .toBe(persisted.grain.sha256);
    expect(sha256(PLAN040_PACKAGE_15_SOURCE_GAP_OVERLAY_PATH))
      .toBe(persisted.sourceGapOverlay.sha256);
  });

  it("projects the exact final 308-row closure without new authority", () => {
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
    expect(extent).toHaveLength(308);
    expect(grain).toHaveLength(308);
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
      blocked: 51,
      bounded: 48,
      routewide: 35,
      stopset: 9,
      unreviewed: 0,
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
      blocked: 60,
      not_applicable: 10,
      resolved: 73,
      unreviewed: 0,
    });
    expect([...extent, ...grain].every((row) =>
      row.authorizes_study === false &&
      row.authorizes_cross_product === false
    )).toBeTrue();
  });

  it("replays the real Package 15 generators after persistence", () => {
    const persistence = spawnSync(
      "bun",
      ["scripts/persist-plan040-accelerated-package15.ts", "--check"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(persistence.status).toBe(0);
    expect(persistence.stdout).toContain('"status": "checked"');
    const evidence = spawnSync(
      "bun",
      [
        "packages/pipeline/scripts/" +
          "generate-plan040-accelerated-package15.ts",
        "--check",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(evidence.status).toBe(0);
    expect(evidence.stdout).toContain(
      "checked Plan 040 accelerated Package 15 post-persistence replay",
    );
  });
});
