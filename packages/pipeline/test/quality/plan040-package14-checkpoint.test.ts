import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  PLAN040_PACKAGE_14_ARTIFACTS,
  PLAN040_PACKAGE_14_CHECKPOINT_PATH,
  PLAN040_PACKAGE_14_SEMANTIC_REVIEW_COMMIT,
  PLAN040_PACKAGE_14_SUITE_COMMIT,
  buildPlan040Package14Checkpoint,
  writePlan040Package14Checkpoint,
} from "../../src/quality/plan040-package14-checkpoint";

const CHECKPOINT_SHA256 =
  "06e8603c3f59cc61b1502e66be2a04867dda6c4dc977d3b432e79da80e1dd11e";
const checkpointPath = `${repoRoot}/${PLAN040_PACKAGE_14_CHECKPOINT_PATH}`;
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const artifactSha = (path: string): string =>
  sha256(readFileSync(`${repoRoot}/${path}`));

type ArtifactRef = { path: string; sha256: string };
type Checkpoint = {
  receipt_id: string;
  recorded_at: string;
  checkpoint_scope: {
    checkpoint_commit: string;
    global_open_candidate_count: number;
    newly_closed_since_package_13_checkpoint: number;
    package_14: {
      candidate_count: number;
      verdict_distribution: Record<string, number>;
      artifacts: Record<string, ArtifactRef>;
    };
    reviews: {
      semantic: Record<string, unknown>;
      projection_repair: Record<string, unknown>;
    };
  };
  full_repository_checkpoint: Record<string, unknown>;
  comparison: {
    count_deltas_from_package_13_checkpoint: Record<string, number>;
    failure_signature: Record<string, unknown>;
    plan040_package_14: Record<string, unknown>;
  };
  current_projection: {
    artifacts: Record<string, ArtifactRef>;
    member_extent_verdict_histogram: Record<string, number>;
    member_extent_coarse_histogram: Record<string, number>;
    member_grain_verdict_histogram: Record<string, number>;
    member_grain_coarse_histogram: Record<string, number>;
    global_open_candidate_count: number;
  };
  verification: Record<string, unknown>;
  authority: Record<string, unknown>;
  preservation: Record<string, unknown>;
};

const readCheckpoint = (): Checkpoint =>
  JSON.parse(readFileSync(checkpointPath, "utf8")) as Checkpoint;

describe("Plan 040 final Package 14 checkpoint", () => {
  it("replays exact compact bytes through the generator and CLI check", () => {
    const bytes = readFileSync(checkpointPath);
    const checkpoint = JSON.parse(bytes.toString("utf8")) as Checkpoint;
    expect(sha256(bytes)).toBe(CHECKPOINT_SHA256);
    expect(`${stableJson(checkpoint as unknown as JsonValue)}\n`).toBe(
      bytes.toString("utf8"),
    );
    expect(buildPlan040Package14Checkpoint()).toEqual(checkpoint);
    expect(writePlan040Package14Checkpoint({ check: true })).toMatchObject({
      path: checkpointPath,
      sha256: CHECKPOINT_SHA256,
    });
    const cli = spawnSync(
      "bun",
      [
        "packages/cli/src/cli.ts",
        "plan-040-package-14-checkpoint",
        "--check",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain(`SHA-256: ${CHECKPOINT_SHA256}`);
  });

  it("pins every Package 14 artifact and exact closure distribution", () => {
    const scope = readCheckpoint().checkpoint_scope;
    expect(scope.checkpoint_commit).toBe(PLAN040_PACKAGE_14_SUITE_COMMIT);
    expect(scope.newly_closed_since_package_13_checkpoint).toBe(36);
    expect(scope.global_open_candidate_count).toBe(29);
    expect(scope.package_14).toMatchObject({
      candidate_count: 36,
      verdict_distribution: {
        positive_extent_and_grain: 8,
        source_gap_blocked_extent_and_grain: 28,
        exact_absence: 0,
      },
    });
    expect(scope.package_14.artifacts).toEqual(
      PLAN040_PACKAGE_14_ARTIFACTS,
    );
    for (const artifact of Object.values(scope.package_14.artifacts)) {
      expect(artifactSha(artifact.path)).toBe(artifact.sha256);
    }
  });

  it("records the authoritative suite and unchanged baseline family", () => {
    const checkpoint = readCheckpoint();
    expect(checkpoint.full_repository_checkpoint).toMatchObject({
      commit: PLAN040_PACKAGE_14_SUITE_COMMIT,
      command: "bun run test",
      duration_seconds: 616.68,
      exit_code: 1,
      counts: {
        pass: 1898,
        skip: 1,
        fail: 9,
        error: 1,
        test_count: 1908,
        test_file_count: 165,
        expect_call_count: 613416,
      },
      status: "matches_known_missing_corpus_baseline",
    });
    expect(
      checkpoint.comparison.count_deltas_from_package_13_checkpoint,
    ).toEqual({
      pass: 23,
      skip: 0,
      fail: 0,
      error: 0,
      test_count: 23,
      test_file_count: 3,
      expect_call_count: 514,
    });
    expect(checkpoint.comparison.failure_signature).toMatchObject({
      family_id: "known_missing_corpus_environment_family",
      baseline_signature_sha256:
        "d111d493e9a52cb9f14704fc73e3b7679bd7abdbfea5cd20ba604f310b26ea0b",
      failed_test_count: 9,
      failed_tests_match_exact: true,
      unhandled_error_match_exact: true,
      signature_unchanged: true,
      unexpected_failures: 0,
      unexpected_errors: 0,
      additional_failures: 0,
    });
    expect(
      checkpoint.comparison.failure_signature.failed_tests,
    ).toHaveLength(9);
    expect(checkpoint.comparison.failure_signature.unhandled_error).toEqual({
      file:
        "packages/pipeline/test/quality/" +
        "relationship-reference-remediation.test.ts",
      message:
        "Missing staged source blocks for " +
        "nyc_dot_gun_hill_road_completion_2023; run prepare-source first.",
    });
  });

  it("pins both reviews, verification, and exact persistence-only authority", () => {
    const checkpoint = readCheckpoint();
    expect(checkpoint.checkpoint_scope.reviews).toEqual({
      semantic: {
        reviewed_commit: PLAN040_PACKAGE_14_SEMANTIC_REVIEW_COMMIT,
        reviewer_results: ["APPROVE", "APPROVE"],
        verdict: "APPROVE/APPROVE",
      },
      projection_repair: {
        reviewed_commit: PLAN040_PACKAGE_14_SUITE_COMMIT,
        reviewer_results: ["APPROVE"],
        verdict: "APPROVE",
      },
    });
    expect(checkpoint.verification).toMatchObject({
      preflight: {
        pass: 12,
        fail: 0,
        expect_call_count: 398,
        status: "pass",
      },
      focused_post_persistence: {
        pass: 39,
        fail: 0,
        expect_call_count: 534,
        status: "pass",
      },
      focused_projection_repair: {
        pass: 129,
        fail: 0,
        test_file_count: 14,
        expect_call_count: 5161,
        status: "pass",
      },
      typecheck: { status: "pass" },
      validate: {
        issues: 0,
        warnings: 3,
        release_contract_issues: 0,
        status: "pass",
      },
      deterministic_replay: {
        package_13_checkpoint: { status: "pass" },
        package_14: {
          candidate_count: 36,
          positive_count: 8,
          blocked_source_gap_count: 28,
          status: "pass",
        },
      },
    });
    expect(checkpoint.authority).toEqual({
      checkpoint_creates_new_authority: false,
      authorization_source: PLAN040_PACKAGE_14_ARTIFACTS.acceptance,
      authorizes_decision_persistence: true,
      exact_decision_persistence_only: {
        extent_decision_count: 8,
        grain_decision_count: 8,
        source_gap_overlay_count: 28,
        exact_absence_count: 0,
      },
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_ontology: false,
      authorizes_corrections: false,
      prohibits_occurrence_inference: true,
    });
  });

  it("pins exact current projection bytes and global histograms", () => {
    const projection = readCheckpoint().current_projection;
    for (const artifact of Object.values(projection.artifacts)) {
      expect(artifactSha(artifact.path)).toBe(artifact.sha256);
    }
    expect(projection.global_open_candidate_count).toBe(29);
    expect(projection.member_extent_coarse_histogram).toEqual({
      absent_in_source: 165,
      blocked_upstream: 38,
      bounded_segment: 48,
      route_wide: 20,
      stop_set: 8,
      unreviewed: 29,
    });
    expect(projection.member_grain_coarse_histogram).toEqual({
      absent_in_source: 165,
      blocked_upstream: 47,
      not_applicable: 9,
      resolved: 58,
      unreviewed: 29,
    });
    expect(checkpointPreservesRequirements(readCheckpoint())).toBe(true);
  });
});

function checkpointPreservesRequirements(checkpoint: Checkpoint): boolean {
  return checkpoint.preservation.exact_positive_requirement_preserved ===
      true &&
    checkpoint.preservation
        .historical_full_stop_and_stop_id_equivalence_prerequisite_preserved ===
      true &&
    checkpoint.preservation.evidence_and_decisions_unchanged === true &&
    checkpoint.preservation.projections_unchanged === true;
}
