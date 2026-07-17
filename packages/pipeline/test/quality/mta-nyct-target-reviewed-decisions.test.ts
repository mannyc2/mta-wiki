import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildMtaNyctTargetReviewedDecisions,
  MTA_NYCT_REVIEWED_DECISIONS_PATH,
  validateMtaNyctTargetReviewedDecisions,
} from "../../../../scripts/review-mta-nyct-target-identity";

describe("MTA/NYCT target reviewed decisions", () => {
  const artifact = buildMtaNyctTargetReviewedDecisions();

  test("exhausts the inventory with exclusive evidence-backed decisions", () => {
    expect(validateMtaNyctTargetReviewedDecisions(artifact)).toEqual([]);
    expect(artifact.summary.reviewed_row_count).toBe(61);
    expect(artifact.summary.unreviewed_row_count).toBe(0);
    expect(artifact.summary.explicit_umbrella_non_ace_retarget_count).toBe(49);
    expect(artifact.summary.mta_only_reviewed_count).toBe(11);
    expect(artifact.summary.row_decision_counts).toEqual({
      retain_nyct_with_exact_evidence: 1,
      retarget_umbrella_mta: 42,
      retire_evidence_unsupported_observation: 2,
      needs_relation_specific_remediation: 16,
    });
    expect(artifact.summary.identity_resolution_counts).toEqual({
      retain_nyct_with_exact_evidence: 2,
      retarget_umbrella_mta: 57,
      retire_evidence_unsupported_observation: 2,
    });
  });

  test("uses exact NYCT evidence and rejects the unsupported ACE identity", () => {
    const bySubmission = new Map(artifact.decisions.map((decision) => [decision.submission_id, decision]));
    expect(bySubmission.get("sub_0c2727e40e4e0fdc")?.identity_resolution).toBe("retain_nyct_with_exact_evidence");
    expect(bySubmission.get("sub_0c2727e40e4e0fdc")?.reviewed_identity_evidence_refs.map((ref) => ref.evidence_id)).toEqual([
      "116_st_morningside_ave_pleasant_ave_cb9_jun2025#p006_c0005",
    ]);
    expect(bySubmission.get("sub_93432f9e83cec801")?.identity_resolution).toBe("retain_nyct_with_exact_evidence");
    expect(bySubmission.get("sub_686ee217f7023e7b")?.decision).toBe("retire_evidence_unsupported_observation");
    expect(bySubmission.get("sub_686ee217f7023e7b")?.complete_staged_source_review.relevant_identity_block_count).toBe(0);
  });

  test("adjudicates every downstream relation without propagating malformed roles", () => {
    const relations = artifact.decisions.flatMap((decision) => decision.downstream_relation_decisions);
    expect(relations).toHaveLength(44);
    expect(new Set(relations.map((relation) => relation.relation_submission_id)).size).toBe(44);
    expect(artifact.summary.relation_specific_remediation_count).toBe(21);
    expect(relations.find((relation) => relation.relation_submission_id === "sub_46237cb61b5879d5")?.action)
      .toBe("retire_and_rebuild_with_distinct_board_books_or_dataset_endpoint");
    expect(relations.find((relation) => relation.relation_submission_id === "sub_0c8356fcc3dc307b")?.disposition)
      .toBe("evidence_does_not_prove_route_operator");
    expect(relations.every((relation) => relation.evidence_refs.length > 0)).toBe(true);
  });

  test("matches the checked-in deterministic artifact byte for byte", () => {
    expect(readFileSync(MTA_NYCT_REVIEWED_DECISIONS_PATH, "utf8"))
      .toBe(`${JSON.stringify(artifact, null, 2)}\n`);
  });
});
