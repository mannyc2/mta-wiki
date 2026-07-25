import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import {
  PLAN040_PACKAGE_15_ACCEPTANCE_PATH,
  PLAN040_PACKAGE_15_COMPARISON_PATH,
  PLAN040_PACKAGE_15_GATE_PATH,
  PLAN040_PACKAGE_15_PERSISTENCE_EVIDENCE_PATH,
  PLAN040_PACKAGE_15_SOURCE_GAP_BLOCK_PATH,
  validatePlan040Package15GateAndAcceptance,
} from
  "../../src/quality/plan040-accelerated-package15-closeout.js";

const sha256 = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const readJson = (path: string): Record<string, any> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;

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
});
