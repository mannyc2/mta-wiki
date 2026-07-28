import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { corpusIt } from "../support/local-test-profile";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  PLAN040_FINAL_CHECKPOINT_PATH,
  PLAN040_FINAL_CHECKPOINT_SHA256,
  PLAN040_FINAL_EXTENT_COARSE_HISTOGRAM,
  PLAN040_FINAL_GRAIN_COARSE_HISTOGRAM,
  PLAN040_FINAL_HISTORICAL_REPLAY_ARTIFACTS,
  PLAN040_FINAL_PACKAGE_15_ARTIFACTS,
  PLAN040_FINAL_SUITE_COMMIT,
  PLAN040_PACKAGE_15_ACCEPTANCE_COMMIT,
  PLAN040_PACKAGE_15_PERSISTENCE_COMMIT,
  PLAN040_PACKAGE_15_REVIEWED_COMMIT,
  PLAN040_PARSER_HARDENING_COMMIT,
  PLAN040_SUCCESSOR_REPAIR_COMMIT,
  buildPlan040FinalCheckpoint,
  writePlan040FinalCheckpoint,
} from "../../src/quality/plan040-final-checkpoint";
import {
  PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS,
} from "../../src/quality/plan040-accelerated-package15-closeout";
import { PLAN041_POST_CLOSURE_PROJECTION_PINS } from
  "../../src/quality/plan041-projection-successor";

const checkpointPath = `${repoRoot}/${PLAN040_FINAL_CHECKPOINT_PATH}`;
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
    global_candidate_count: number;
    global_open_candidate_count: number;
    finalization_commits: Array<{ commit: string; role: string }>;
    package_15: {
      reviewed_commit: string;
      acceptance_commit: string;
      persistence_commit: string;
      candidate_count: number;
      verdict_distribution: Record<string, number>;
      artifacts: Record<string, ArtifactRef>;
    };
    reviews: Record<string, Record<string, unknown>>;
  };
  full_repository_checkpoint: {
    commit: string;
    duration_seconds: number;
    exit_code: number;
    counts: Record<string, number>;
    captured_log: Record<string, unknown>;
    status: string;
  };
  comparison: {
    count_deltas_from_package_14_checkpoint: Record<string, number>;
    failure_signature: Record<string, unknown>;
    plan040_final: Record<string, unknown>;
  };
  current_projection: {
    artifacts: Record<string, ArtifactRef>;
    member_extent_row_count: number;
    member_extent_verdict_histogram: Record<string, number>;
    member_extent_coarse_histogram: Record<string, number>;
    member_grain_row_count: number;
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

describe("Plan 040 final transition checkpoint", () => {
  it("replays exact compact bytes through the generator and CLI check", () => {
    const bytes = readFileSync(checkpointPath);
    const checkpoint = JSON.parse(bytes.toString("utf8")) as Checkpoint;
    expect(sha256(bytes)).toBe(PLAN040_FINAL_CHECKPOINT_SHA256);
    expect(`${stableJson(checkpoint as unknown as JsonValue)}\n`).toBe(
      bytes.toString("utf8"),
    );
    expect(buildPlan040FinalCheckpoint()).toEqual(checkpoint);
    expect(writePlan040FinalCheckpoint({ check: true })).toMatchObject({
      path: checkpointPath,
      sha256: PLAN040_FINAL_CHECKPOINT_SHA256,
    });
    const cli = spawnSync(
      "bun",
      [
        "packages/cli/src/cli.ts",
        "plan-040-final-checkpoint",
        "--check",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain(
      `SHA-256: ${PLAN040_FINAL_CHECKPOINT_SHA256}`,
    );
  });

  it("pins Package 15 artifacts, closure distribution, and review chain", () => {
    const scope = readCheckpoint().checkpoint_scope;
    expect(scope.checkpoint_commit).toBe(PLAN040_FINAL_SUITE_COMMIT);
    expect(scope.global_candidate_count).toBe(308);
    expect(scope.global_open_candidate_count).toBe(0);
    expect(scope.finalization_commits).toEqual([
      {
        commit: PLAN040_PACKAGE_15_PERSISTENCE_COMMIT,
        role: "package_15_exact_decision_and_source_gap_persistence",
      },
      {
        commit: PLAN040_PARSER_HARDENING_COMMIT,
        role: "compact_acceptance_parser_hardening",
      },
      {
        commit: PLAN040_SUCCESSOR_REPAIR_COMMIT,
        role: "final_successor_projection_reconciliation",
      },
    ]);
    expect(scope.package_15).toMatchObject({
      reviewed_commit: PLAN040_PACKAGE_15_REVIEWED_COMMIT,
      acceptance_commit: PLAN040_PACKAGE_15_ACCEPTANCE_COMMIT,
      persistence_commit: PLAN040_PACKAGE_15_PERSISTENCE_COMMIT,
      candidate_count: 29,
      verdict_distribution: {
        positive_extent_and_grain: 16,
        source_gap_blocked_extent_and_grain: 13,
        exact_absence: 0,
      },
      artifacts: PLAN040_FINAL_PACKAGE_15_ARTIFACTS,
    });
    expect(scope.reviews).toEqual({
      package_15: {
        reviewed_commit: PLAN040_PACKAGE_15_REVIEWED_COMMIT,
        reviewer_results: ["APPROVE", "APPROVE"],
        verdict: "APPROVE/APPROVE",
      },
      parser_hardening: {
        reviewed_commit: PLAN040_PARSER_HARDENING_COMMIT,
        reviewer_results: ["APPROVE", "APPROVE"],
        verdict: "APPROVE/APPROVE",
      },
      successor_projection_repair: {
        reviewed_commit: PLAN040_SUCCESSOR_REPAIR_COMMIT,
        reviewer_results: ["APPROVE"],
        verdict: "APPROVE",
      },
    });
    for (const artifact of Object.values(scope.package_15.artifacts)) {
      expect(artifactSha(artifact.path)).toBe(artifact.sha256);
    }
  });

  it("pins the exact final 308 by 308 zero-open projections", () => {
    const projection = readCheckpoint().current_projection;
    expect(projection.member_extent_row_count).toBe(308);
    expect(projection.member_grain_row_count).toBe(308);
    expect(projection.global_open_candidate_count).toBe(0);
    expect(projection.member_extent_coarse_histogram).toEqual(
      PLAN040_FINAL_EXTENT_COARSE_HISTOGRAM,
    );
    expect(projection.member_grain_coarse_histogram).toEqual(
      PLAN040_FINAL_GRAIN_COARSE_HISTOGRAM,
    );
    expect(projection.member_extent_verdict_histogram.unreviewed).toBeUndefined();
    expect(projection.member_grain_verdict_histogram.unreviewed).toBeUndefined();
    for (const [name, artifact] of Object.entries(projection.artifacts)) {
      expect(artifact.sha256).toBe(
        PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS[
          name as keyof typeof PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS
        ],
      );
      expect(artifactSha(artifact.path)).toBe(
        PLAN041_POST_CLOSURE_PROJECTION_PINS[
          name as keyof typeof PLAN041_POST_CLOSURE_PROJECTION_PINS
        ],
      );
    }
  });

  it("records the recovered final suite and exact unchanged baseline", () => {
    const checkpoint = readCheckpoint();
    expect(checkpoint.full_repository_checkpoint).toEqual({
      commit: PLAN040_FINAL_SUITE_COMMIT,
      command: "bun run test",
      runner: "bun test v1.3.14 (0d9b296a)",
      duration_seconds: 609.97,
      exit_code: 1,
      counts: {
        pass: 1923,
        skip: 1,
        fail: 9,
        error: 1,
        test_count: 1933,
        test_file_count: 168,
        expect_call_count: 613830,
      },
      captured_log: {
        retained: true,
        path: "/tmp/plan040-final-full-suite-71098c3c.log",
        sha256:
          "1399bde4fa0d843f927e2708df5e5dd38eda4f705670d5ea6ee0f94b2c809ad9",
        byte_count: 261923,
        line_count: 2446,
        durability: "ephemeral_checkpoint_capture",
      },
      status: "matches_known_missing_corpus_baseline",
    });
    expect(
      checkpoint.comparison.count_deltas_from_package_14_checkpoint,
    ).toEqual({
      pass: 25,
      skip: 0,
      fail: 0,
      error: 0,
      test_count: 25,
      test_file_count: 3,
      expect_call_count: 414,
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
    expect(checkpoint.comparison.failure_signature.failed_tests).toHaveLength(9);
    expect(checkpoint.comparison.failure_signature.unhandled_error).toEqual({
      file:
        "packages/pipeline/test/quality/" +
        "relationship-reference-remediation.test.ts",
      message:
        "Missing staged source blocks for " +
        "nyc_dot_gun_hill_road_completion_2023; run prepare-source first.",
    });
  });

  corpusIt(
    "replays P11, P13, P14, and P15 without changing prior artifacts",
    () => {
      const commands = [
        [
          "packages/pipeline/scripts/" +
            "generate-plan040-qbnr-service-grain-package11.ts",
          "--check",
        ],
        [
          "packages/cli/src/cli.ts",
          "plan-040-package-13-checkpoint",
          "--check",
        ],
        [
          "packages/pipeline/scripts/" +
            "generate-plan040-accelerated-package14.ts",
          "--check",
        ],
        [
          "packages/pipeline/scripts/" +
            "generate-plan040-accelerated-package15.ts",
          "--check",
        ],
      ];
      for (const args of commands) {
        const result = spawnSync("bun", args, {
          cwd: repoRoot,
          encoding: "utf8",
        });
        expect(result.status, result.stderr).toBe(0);
      }
      for (
        const artifact of Object.values(
          PLAN040_FINAL_HISTORICAL_REPLAY_ARTIFACTS,
        )
      ) {
        expect(artifactSha(artifact.path)).toBe(artifact.sha256);
      }
    },
    20_000,
  );

  it("adds no authority and preserves exact-positive prerequisites", () => {
    const checkpoint = readCheckpoint();
    expect(checkpoint.authority).toEqual({
      checkpoint_creates_new_authority: false,
      checkpoint_adds_decision_persistence_authority: false,
      authorization_source: PLAN040_FINAL_PACKAGE_15_ARTIFACTS.acceptance,
      authorizes_decision_persistence: true,
      exact_accepted_decision_persistence_only: {
        extent_decision_count: 16,
        grain_decision_count: 16,
        source_gap_overlay_count: 13,
        exact_absence_count: 0,
      },
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_ontology: false,
      authorizes_corrections: false,
      prohibits_occurrence_inference: true,
    });
    expect(checkpoint.preservation).toEqual({
      historical_package_11_through_14_artifacts_unchanged: true,
      evidence_and_decisions_unchanged: true,
      projections_unchanged: true,
      exact_positive_requirement_preserved: true,
      historical_full_stop_and_stop_id_equivalence_prerequisite_preserved:
        true,
      prior_acceptances_and_commits_preserved: true,
      broad_historical_acquisition_not_required: true,
      targeted_pinned_historical_gtfs_prerequisite_preserved: true,
    });
  });
});
