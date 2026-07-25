import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS } from
  "../../src/quality/plan040-qbnr-bus-stop-package13-closeout";
import { PLAN041_POST_CLOSURE_PROJECTION_PINS } from
  "../../src/quality/plan041-projection-successor";
import {
  PLAN040_PACKAGE_12_CHECKPOINT_PATH,
  PLAN040_PACKAGE_12_CHECKPOINT_SHA256,
  PLAN040_PACKAGE_13_ACCEPTANCE_COMMIT,
  PLAN040_PACKAGE_13_CHECKPOINT_COMMIT,
  PLAN040_PACKAGE_13_CHECKPOINT_PATH,
  PLAN040_PACKAGE_13_FAILURE_SIGNATURE_SHA256,
  PLAN040_PACKAGE_13_PERSISTENCE_COMMIT,
  PLAN040_PACKAGE_13_PROJECTION_REPAIR_COMMIT,
  buildPlan040Package13Checkpoint,
  writePlan040Package13Checkpoint,
} from "../../src/quality/plan040-package13-checkpoint";

const CHECKPOINT_SHA256 =
  "6fd187bbf0b80893f97cbd8decdf9eb79c4965c9649456c8c2895896cbf3c7b7";
const checkpointPath = `${repoRoot}/${PLAN040_PACKAGE_13_CHECKPOINT_PATH}`;
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const artifactSha = (path: string): string =>
  sha256(readFileSync(`${repoRoot}/${path}`));

type ArtifactRef = { path: string; sha256: string };
type Checkpoint = {
  schema_version: 1;
  receipt_id: string;
  recorded_at: string;
  checkpoint_scope: {
    checkpoint_reason: string;
    checkpoint_commit: string;
    newly_closed_since_package_12_checkpoint: number;
    global_open_candidate_count: number;
    previous_checkpoint: ArtifactRef;
    package_13: {
      candidate_count: number;
      newly_closed_candidates: number;
      reviewed_commit: string;
      acceptance_commit: string;
      persistence_commit: string;
      artifacts: Record<string, ArtifactRef>;
    };
    shared_semantics_repair: {
      trust_repair_chain: Array<{ commit: string; role: string }>;
      projection_repair_commit: string;
      final_dual_review: {
        reviewed_commit: string;
        reviewer_results: string[];
        verdict: string;
      };
    };
  };
  full_repository_checkpoint: {
    commit: string;
    command: string;
    runner: string;
    duration_seconds: number;
    exit_code: number;
    counts: Record<string, number>;
    captured_log: {
      retained: false;
      path: null;
      sha256: null;
      statement: string;
    };
    status: string;
  };
  comparison: {
    count_deltas_from_package_12_checkpoint: Record<string, number>;
    failure_signature: {
      family_id: string;
      baseline_signature_sha256: string;
      failed_test_count: number;
      failed_tests: string[];
      failed_tests_match_exact: true;
      unhandled_error: { file: string; message: string };
      unhandled_error_match_exact: true;
      signature_unchanged: true;
      unexpected_failures: 0;
      unexpected_errors: 0;
      additional_failures: 0;
    };
    plan040_package_13: Record<string, unknown>;
  };
  current_projection: {
    artifacts: Record<string, ArtifactRef>;
    member_extent_histogram: Record<string, number>;
    member_grain_histogram: Record<string, number>;
  };
  authority: Record<string, boolean>;
};

const readCheckpoint = (): Checkpoint =>
  JSON.parse(readFileSync(checkpointPath, "utf8")) as Checkpoint;

describe("Plan 040 Package 13 accepted 31-closure shared-semantics checkpoint", () => {
  it("replays exact compact bytes through the generator and check mode", () => {
    const bytes = readFileSync(checkpointPath);
    const checkpoint = JSON.parse(bytes.toString("utf8")) as Checkpoint;
    expect(sha256(bytes)).toBe(CHECKPOINT_SHA256);
    expect(`${stableJson(checkpoint as unknown as JsonValue)}\n`).toBe(
      bytes.toString("utf8"),
    );
    expect(buildPlan040Package13Checkpoint()).toEqual(checkpoint);
    expect(writePlan040Package13Checkpoint({ check: true })).toMatchObject({
      path: checkpointPath,
      sha256: CHECKPOINT_SHA256,
    });
  });

  it("pins Package 13 acceptance, persistence, and exact artifact bytes", () => {
    const checkpoint = readCheckpoint();
    expect(checkpoint.schema_version).toBe(1);
    expect(checkpoint.receipt_id).toBe(
      "plan-040-package-13-checkpoint-v1",
    );
    expect(checkpoint.recorded_at).toBe("2026-07-24T22:19:36Z");
    expect(checkpoint.checkpoint_scope).toMatchObject({
      checkpoint_reason:
        "accepted_31_closure_and_shared_semantics_checkpoint",
      checkpoint_commit: PLAN040_PACKAGE_13_CHECKPOINT_COMMIT,
      newly_closed_since_package_12_checkpoint: 31,
      global_open_candidate_count: 65,
      previous_checkpoint: {
        path: PLAN040_PACKAGE_12_CHECKPOINT_PATH,
        sha256: PLAN040_PACKAGE_12_CHECKPOINT_SHA256,
      },
      package_13: {
        candidate_count: 31,
        newly_closed_candidates: 31,
        reviewed_commit: "3603ce6913f4c222e8fee7cb6b6af894d213d7f9",
        acceptance_commit: PLAN040_PACKAGE_13_ACCEPTANCE_COMMIT,
        persistence_commit: PLAN040_PACKAGE_13_PERSISTENCE_COMMIT,
      },
    });
    for (
      const artifact of Object.values(
        checkpoint.checkpoint_scope.package_13.artifacts,
      )
    ) {
      expect(artifactSha(artifact.path)).toBe(artifact.sha256);
    }
  });

  it("pins the trust chain, projection repair, and final dual approval", () => {
    const repair =
      readCheckpoint().checkpoint_scope.shared_semantics_repair;
    expect(repair.trust_repair_chain).toEqual([
      {
        commit: "4733adb3767e48877602564106237977d39d2770",
        role: "source_gap_provenance_replay",
      },
      {
        commit: "3f2efc181a055e62acf397fea3a827604cf12076",
        role: "verified_source_gap_overlay_boundary",
      },
      {
        commit: "95335ce06dfc71e538d49576e1cb03fef9123484",
        role: "receipt_identity_and_custom_root_provenance",
      },
      {
        commit: PLAN040_PACKAGE_13_CHECKPOINT_COMMIT,
        role: "complete_pinned_receipt_identity",
      },
    ]);
    expect(repair.projection_repair_commit).toBe(
      PLAN040_PACKAGE_13_PROJECTION_REPAIR_COMMIT,
    );
    expect(repair.final_dual_review).toEqual({
      reviewed_commit: PLAN040_PACKAGE_13_CHECKPOINT_COMMIT,
      reviewer_results: ["APPROVE", "APPROVE"],
      verdict: "APPROVE/APPROVE",
    });
  });

  it("records the exact final suite and unchanged missing-corpus family", () => {
    const checkpoint = readCheckpoint();
    expect(checkpoint.full_repository_checkpoint).toEqual({
      captured_log: {
        path: null,
        retained: false,
        sha256: null,
        statement:
          "The full-suite log was not retained; no log hash is available.",
      },
      command: "bun run test",
      commit: PLAN040_PACKAGE_13_CHECKPOINT_COMMIT,
      counts: {
        error: 1,
        expect_call_count: 612902,
        fail: 9,
        pass: 1875,
        skip: 1,
        test_count: 1885,
        test_file_count: 162,
      },
      duration_seconds: 621.75,
      exit_code: 1,
      runner: "bun test v1.3.14 (0d9b296a)",
      status: "matches_known_missing_corpus_baseline",
    });
    expect(
      checkpoint.comparison.count_deltas_from_package_12_checkpoint,
    ).toEqual({
      error: 0,
      expect_call_count: 3683,
      fail: 0,
      pass: 31,
      skip: 0,
      test_count: 31,
      test_file_count: 3,
    });
    expect(checkpoint.comparison.failure_signature).toEqual({
      additional_failures: 0,
      baseline_signature_sha256:
        PLAN040_PACKAGE_13_FAILURE_SIGNATURE_SHA256,
      failed_test_count: 9,
      failed_tests: [
        "relationship dispositions v1 > keeps all 1,362 operational and 669 bus-treatment decisions valid in the replayed graph",
        "Bronx acquisition linkage remediation > materializes 16 physical records and 37 evidence-backed, endpoint-valid, type-valid relations",
        "Bronx acquisition linkage remediation > retains frozen and current official-source hashes and reuses the exact staged CB5 source",
        "Gun Hill Road bus-lane completion on October 31, 2023 > pins the official DOT snapshot and exact evidence blocks",
        "May 2025 ACE official route cut and two bounded canonical cohorts > pins every official artifact, evidence block, stable row id, route, and implementation date",
        "Flatbush Phase 1 September 2025 source and canonical lifecycle > pins both official source captures and the bounded start, completion, route, and treatment blocks",
        "Queens acquisition linkage remediation > materializes 21 evidence-backed, endpoint-valid, type-valid relations and no shadow treatment",
        "Queens acquisition linkage remediation > reconciles the five receipts to exactly the 21 journaled links while retaining exclusion",
        "Staten Island acquisition linkage remediation > materializes 12 compact route endpoints and 14 evidence-backed, endpoint-valid, type-valid relations",
      ],
      failed_tests_match_exact: true,
      family_id: "known_missing_corpus_environment_family",
      signature_unchanged: true,
      unexpected_errors: 0,
      unexpected_failures: 0,
      unhandled_error: {
        file:
          "packages/pipeline/test/quality/" +
          "relationship-reference-remediation.test.ts",
        message:
          "Missing staged source blocks for " +
          "nyc_dot_gun_hill_road_completion_2023; run prepare-source first.",
      },
      unhandled_error_match_exact: true,
    });
  });

  it("pins its historical histograms and the current Package 15 bytes", () => {
    const checkpoint = readCheckpoint();
    expect(checkpoint.current_projection.member_extent_histogram).toEqual({
      absent_in_source: 165,
      blocked_upstream: 10,
      bounded_segment: 47,
      route_wide: 14,
      stop_set: 7,
      unreviewed: 65,
    });
    expect(checkpoint.current_projection.member_grain_histogram).toEqual({
      absent_in_source: 165,
      blocked_upstream: 19,
      not_applicable: 2,
      resolved: 57,
      unreviewed: 65,
    });
    for (
      const [name, artifact] of Object.entries(
        checkpoint.current_projection.artifacts,
      )
    ) {
      expect(artifact.sha256).toBe(
        PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS[
          name as keyof typeof PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS
        ],
      );
      expect(artifactSha(artifact.path)).toBe(
        PLAN041_POST_CLOSURE_PROJECTION_PINS[
          name as keyof typeof PLAN041_POST_CLOSURE_PROJECTION_PINS
        ],
      );
    }
    expect(checkpoint.comparison.plan040_package_13).toEqual({
      additional_failures: 0,
      closure_count: 31,
      final_dual_review: "APPROVE/APPROVE",
      global_open_candidate_count: 65,
      shared_semantics_repaired: true,
      status: "pass",
    });
    expect(checkpoint.authority).toEqual({
      authorizes_cross_product: false,
      authorizes_decision_persistence: false,
      authorizes_occurrence: false,
      authorizes_study: false,
      changes_evidence_outcomes: false,
      changes_ontology_or_grain: false,
      changes_shared_validation_or_materialization_semantics: false,
      nonauthorizing_checkpoint_receipt: true,
    });
  });
});
