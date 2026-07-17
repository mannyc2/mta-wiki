import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { repoRoot } from "@mta-wiki/core/paths";
import { join } from "node:path";
import { buildRelationshipSemanticReviewAggregate } from "../../../../scripts/aggregate-relationship-semantic-review-v1";

describe("relationship semantic review v1", () => {
  const build = buildRelationshipSemanticReviewAggregate();

  test("exhausts the frozen tuple inventory and exact suspect relation population", () => {
    expect(build.summary.tuple_count).toBe(1136);
    expect(build.summary.baseline_relation_assignment_count).toBe(21247);
    expect(build.summary.tuple_decision_counts).toEqual({
      approved: 913,
      needs_remediation: 180,
      rejected: 43,
    });
    expect(build.summary.semantic_remediation_relation_count).toBe(399);
    expect(build.summary.zero_unreviewed_tuples).toBe(true);
    expect(build.summary.zero_unplanned_suspect_relations).toBe(true);
  });

  test("assigns one exclusive terminal action to every suspect relation", () => {
    expect(build.summary.terminal_action_counts).toEqual({
      patch_relation: 106,
      replace_endpoint: 83,
      replace_with_submissions: 58,
      resolved_by_generator_fix: 33,
      resolved_by_identity_campaign: 16,
      retract_unsupported: 103,
    });
    expect(Object.values(build.summary.terminal_action_counts as Record<string, number>)
      .reduce((sum, count) => sum + count, 0)).toBe(399);
    expect(build.summary.enforcement_eligible).toBe(false);
  });

  test("matches every generated contract and quality artifact byte for byte", () => {
    for (const output of build.outputs) {
      expect(readFileSync(output.path, "utf8")).toBe(output.content);
    }
    expect(readFileSync(
      join(repoRoot, "data/contracts/relationships/v1/baseline-tuple-semantic-review.json"),
      "utf8",
    )).toContain("\"review_status\": \"complete\"");
  });
});
