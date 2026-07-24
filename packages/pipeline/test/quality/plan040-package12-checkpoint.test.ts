import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import type { JsonValue } from "../../../db/src/types";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const checkpointPath = `${riskRoot}/plan-040-package-12-checkpoint-v1.json`;
const previousCheckpointPath =
  `${riskRoot}/plan-040-package-10a-checkpoint-v1.json`;
const CHECKPOINT_SHA256 =
  "0c3f35c3b978910d0f0bf344b21390cb7884670f7bff30a3ee16a57700874b1d";
const PREVIOUS_CHECKPOINT_SHA256 =
  "f0b7cbd8097c6199e2a2080cb0a9d9410787ab998d9ad3b382bddf3d27c13802";
const FAILURE_SIGNATURE_SHA256 =
  "d111d493e9a52cb9f14704fc73e3b7679bd7abdbfea5cd20ba604f310b26ea0b";
const REPAIR_COMMIT =
  "0950efcaa40003059d0d47609b2d8573db90955a";

type Counts = {
  pass: number;
  skip: number;
  fail: number;
  error: number;
  test_count: number;
  test_file_count: number;
  expect_call_count: number;
};
type PackagePin = {
  candidate_count: number;
  newly_closed_candidates: number;
  reviewed_commit: string;
  acceptance_commit: string;
  persistence_commit: string;
  [key: string]: string | number;
};
type Checkpoint = {
  schema_version: 1;
  receipt_id: string;
  checkpoint_scope: {
    checkpoint_reason: string;
    newly_closed_since_package_10a_checkpoint: number;
    previous_checkpoint: { path: string; sha256: string };
    projection_repair_commit: string;
    packages: Record<string, PackagePin>;
  };
  full_repository_checkpoint: {
    commit: string;
    command: string;
    runner: string;
    duration_seconds: number;
    exit_code: number;
    counts: Counts;
    captured_log: {
      retained: false;
      path: null;
      sha256: null;
      statement: string;
    };
    status: string;
  };
  comparison: {
    count_deltas_from_package_10a_checkpoint: Counts;
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
    plan040_packages: {
      closure_count: 25;
      status: "pass";
      additional_failures: 0;
    };
  };
  current_projection: Record<string, string>;
  authority: {
    nonauthorizing_checkpoint_receipt: true;
    authorizes_decision_persistence: false;
    authorizes_occurrence: false;
    authorizes_study: false;
    authorizes_cross_product: false;
    changes_evidence_outcomes: false;
    changes_ontology_or_grain: false;
  };
};
type PreviousCheckpoint = {
  full_repository_checkpoint: { counts: Counts };
  pinned_repaired_baseline: { path: string };
};
type Baseline = {
  baseline_failure_family: {
    family_id: string;
    failed_tests: string[];
    unhandled_errors: Array<{ file: string; message: string }>;
  };
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const artifactSha = (path: string): string =>
  sha256(readFileSync(`${repoRoot}/${path}`));

describe("Plan 040 Package 10B through 12 accepted 25-closure checkpoint", () => {
  it("replays exact compact bytes, closure counts, and commits", () => {
    const bytes = readFileSync(checkpointPath);
    const checkpoint = JSON.parse(bytes.toString("utf8")) as Checkpoint;
    expect(sha256(bytes)).toBe(CHECKPOINT_SHA256);
    expect(`${stableJson(checkpoint as unknown as JsonValue)}\n`).toBe(
      bytes.toString("utf8"),
    );
    expect(checkpoint.schema_version).toBe(1);
    expect(checkpoint.receipt_id).toBe(
      "plan-040-package-12-checkpoint-v1",
    );
    expect(checkpoint.checkpoint_scope).toEqual(expect.objectContaining({
      checkpoint_reason: "accepted_25_closure_checkpoint",
      newly_closed_since_package_10a_checkpoint: 25,
      projection_repair_commit: REPAIR_COMMIT,
      previous_checkpoint: {
        path:
          "data/quality/operational-reference/member-extent-risk/" +
          "plan-040-package-10a-checkpoint-v1.json",
        sha256: PREVIOUS_CHECKPOINT_SHA256,
      },
    }));
    const packages = checkpoint.checkpoint_scope.packages;
    expect(Object.fromEntries(Object.entries(packages).map(([id, pkg]) => [
      id,
      pkg.newly_closed_candidates,
    ]))).toEqual({
      package_10b: 4,
      package_10c: 5,
      package_10d: 2,
      package_11: 12,
      package_12: 2,
    });
    expect(Object.values(packages).reduce(
      (total, pkg) => total + pkg.newly_closed_candidates,
      0,
    )).toBe(25);
    expect(packages.package_10b).toEqual(expect.objectContaining({
      reviewed_commit: "4ff696145873c8de8138217a4ec83a7f9f3a2099",
      acceptance_commit: "157e3fb0bd0c95c124efed117431644bf4449abe",
      path_amendment_commit:
        "9492bef64bd7242ede4afaa9a7e649db0a18e332",
      path_review_commit: "6d96be8b89c831f9674f1bbb90269a06c30a810f",
      path_reviewed_commit:
        "bf8a2e9692c8654a5d16ce5ce4bc093e549feffd",
      persistence_commit:
        "01f75b2b2e13f6c319e3e184ba12f2559833bb64",
    }));
    expect(packages.package_10c).toEqual(expect.objectContaining({
      reviewed_commit: "9ef8d743ce6e9d6bd26ec4cd4011c993366e2dc9",
      acceptance_commit: "d2b3ef82511dcfa2294c3764a22501d8ad73a933",
      persistence_commit:
        "85175f74cf650ffec09ba572213303904a8d35f1",
    }));
    expect(packages.package_10d).toEqual(expect.objectContaining({
      reviewed_commit: "d7b599559fbab2831ced0a298d02d1d537a20304",
      acceptance_commit: "918e0610ba2114565e0f0051fb73c91e46df6950",
      persistence_commit:
        "0cca14eb029ac65f549beea6f2f32410cad548e1",
    }));
    expect(packages.package_11).toEqual(expect.objectContaining({
      reviewed_commit: "249f722078031b96732ad42fb8402fefad08805c",
      acceptance_commit: "285a658de2a9a021e7284afa4226fc7517aa0391",
      persistence_commit:
        "77936af0b81c75fe293fd2440253725717f38669",
    }));
    expect(packages.package_12).toEqual(expect.objectContaining({
      reviewed_commit: "b578b8f8d8e3ac460fd6e4e07f109afe6c5112c5",
      acceptance_commit: "58a9d6d2b2ffb86da8b75ea5c15c048b3984df37",
      persistence_commit:
        "4a7a8cf19dcfaf17295ca9a7cabb082a4e165db2",
    }));
  });

  it("pins every accepted gate, decision artifact, and absence receipt", () => {
    const checkpoint = readJson<Checkpoint>(checkpointPath);
    const packages = checkpoint.checkpoint_scope.packages;
    const artifacts = [
      ["package_10b", "gate_sha256",
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-service-pattern-package-10b-dual-review-gate-v1.json"],
      ["package_10b", "acceptance_sha256",
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-service-pattern-package-10b-owner-acceptance-v1.json"],
      ["package_10b", "path_review_gate_sha256",
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-service-pattern-package-10b-path-review-gate-v1.json"],
      ["package_10b", "path_review_acceptance_sha256",
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-service-pattern-package-10b-" +
        "path-review-supplemental-acceptance-v1.json"],
      ["package_10b", "extent_decisions_sha256",
        "data/quality/operational-reference/member-extent-ledger-decisions/" +
        "plan-040-qbnr-service-pattern-package-10b-v1.json"],
      ["package_10b", "grain_decisions_sha256",
        "data/quality/operational-reference/member-grain-decisions/" +
        "plan-040-qbnr-service-pattern-package-10b-v1.json"],
      ["package_10b", "reviewed_absence_receipt_sha256",
        "data/quality/acquisition/receipts/member-extent/" +
        "plan-040-qbnr-service-pattern-package-10b-reviewed-absence-v1.json"],
      ["package_10c", "gate_sha256",
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-service-pattern-package-10c-dual-review-gate-v1.json"],
      ["package_10c", "acceptance_sha256",
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-service-pattern-package-10c-owner-acceptance-v1.json"],
      ["package_10c", "extent_decisions_sha256",
        "data/quality/operational-reference/member-extent-ledger-decisions/" +
        "plan-040-qbnr-service-pattern-package-10c-v1.json"],
      ["package_10c", "grain_decisions_sha256",
        "data/quality/operational-reference/member-grain-decisions/" +
        "plan-040-qbnr-service-pattern-package-10c-v1.json"],
      ["package_10c", "reviewed_absence_receipt_sha256",
        "data/quality/acquisition/receipts/member-extent/" +
        "plan-040-qbnr-service-pattern-package-10c-reviewed-absence-v1.json"],
      ["package_10d", "gate_sha256",
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-service-pattern-package-10d-dual-review-gate-v1.json"],
      ["package_10d", "acceptance_sha256",
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-service-pattern-package-10d-owner-acceptance-v1.json"],
      ["package_10d", "extent_decisions_sha256",
        "data/quality/operational-reference/member-extent-ledger-decisions/" +
        "plan-040-qbnr-service-pattern-package-10d-v1.json"],
      ["package_10d", "grain_decisions_sha256",
        "data/quality/operational-reference/member-grain-decisions/" +
        "plan-040-qbnr-service-pattern-package-10d-v1.json"],
      ["package_11", "gate_sha256",
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-service-grain-package-11-dual-review-gate-v1.json"],
      ["package_11", "acceptance_sha256",
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-service-grain-package-11-owner-acceptance-v1.json"],
      ["package_11", "extent_decisions_sha256",
        "data/quality/operational-reference/member-extent-ledger-decisions/" +
        "plan-040-qbnr-service-grain-package-11-v1.json"],
      ["package_11", "grain_decisions_sha256",
        "data/quality/operational-reference/member-grain-decisions/" +
        "plan-040-qbnr-service-grain-package-11-v1.json"],
      ["package_12", "gate_sha256",
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-flatbush-physical-grain-package-12-dual-review-gate-v1.json"],
      ["package_12", "acceptance_sha256",
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-flatbush-physical-grain-package-12-owner-acceptance-v1.json"],
      ["package_12", "grain_decisions_sha256",
        "data/quality/operational-reference/member-grain-decisions/" +
        "plan-040-flatbush-physical-grain-package-12-v1.json"],
    ] as const;
    for (const [packageId, hashKey, path] of artifacts) {
      expect(artifactSha(path)).toBe(packages[packageId]![hashKey]);
    }
    expect(packages.package_12!.extent_decision_count).toBe(0);
  });

  it("pins the full-suite delta and unchanged missing-corpus signature", () => {
    const checkpoint = readJson<Checkpoint>(checkpointPath);
    const previousBytes = readFileSync(previousCheckpointPath);
    const previous = JSON.parse(
      previousBytes.toString("utf8"),
    ) as PreviousCheckpoint;
    expect(sha256(previousBytes)).toBe(PREVIOUS_CHECKPOINT_SHA256);
    expect(checkpoint.full_repository_checkpoint).toEqual({
      captured_log: {
        path: null,
        retained: false,
        sha256: null,
        statement:
          "The full-suite log was not retained; no log hash is available.",
      },
      command: "bun run test",
      commit: REPAIR_COMMIT,
      counts: {
        error: 1,
        expect_call_count: 609219,
        fail: 9,
        pass: 1844,
        skip: 1,
        test_count: 1854,
        test_file_count: 159,
      },
      duration_seconds: 603.12,
      exit_code: 1,
      runner: "bun test v1.3.14 (0d9b296a)",
      status: "matches_known_missing_corpus_baseline",
    });
    const current = checkpoint.full_repository_checkpoint.counts;
    const prior = previous.full_repository_checkpoint.counts;
    const deltas = Object.fromEntries(Object.keys(current).map((key) => [
      key,
      current[key as keyof Counts] - prior[key as keyof Counts],
    ]));
    expect(deltas).toEqual({
      error: 0,
      expect_call_count: 1118,
      fail: 0,
      pass: 68,
      skip: 0,
      test_count: 68,
      test_file_count: 11,
    });
    expect(
      checkpoint.comparison.count_deltas_from_package_10a_checkpoint,
    ).toEqual(deltas);

    const baselinePath =
      `${repoRoot}/${previous.pinned_repaired_baseline.path}`;
    const baseline = readJson<Baseline>(baselinePath);
    const signature = {
      failed_tests: baseline.baseline_failure_family.failed_tests,
      unhandled_errors: baseline.baseline_failure_family.unhandled_errors,
    };
    expect(sha256(
      `${stableJson(signature as unknown as JsonValue)}\n`,
    )).toBe(FAILURE_SIGNATURE_SHA256);
    expect(checkpoint.comparison.failure_signature).toEqual({
      additional_failures: 0,
      baseline_signature_sha256: FAILURE_SIGNATURE_SHA256,
      failed_test_count: 9,
      failed_tests: baseline.baseline_failure_family.failed_tests,
      failed_tests_match_exact: true,
      family_id: baseline.baseline_failure_family.family_id,
      signature_unchanged: true,
      unexpected_errors: 0,
      unexpected_failures: 0,
      unhandled_error:
        baseline.baseline_failure_family.unhandled_errors[0],
      unhandled_error_match_exact: true,
    });
    expect(checkpoint.comparison.plan040_packages).toEqual({
      additional_failures: 0,
      closure_count: 25,
      status: "pass",
    });
  });

  it("pins current projections and grants no authority", () => {
    const checkpoint = readJson<Checkpoint>(checkpointPath);
    const projectionPaths = {
      member_extent_ledger_sha256:
        "data/quality/operational-reference/member-extent-ledger.jsonl",
      member_grain_ledger_sha256:
        "data/quality/operational-reference/member-grain-ledger.jsonl",
      bridge_ledger_sha256:
        "data/quality/study-readiness/v1/bridge-ledger.jsonl",
      study_manifest_sha256:
        "data/quality/study-readiness/v1/manifest.json",
      member_extent_contract_sha256:
        "data/contracts/operational-occurrence-member-extent/v1/" +
        "operational_occurrence_member_extents.jsonl",
      member_extent_manifest_sha256:
        "data/contracts/operational-occurrence-member-extent/v1/manifest.json",
      member_extent_review_ledger_sha256:
        "data/contracts/operational-occurrence-member-extent/v1/" +
        "review-ledger.jsonl",
      member_extent_summary_sha256:
        "data/contracts/operational-occurrence-member-extent/v1/summary.json",
    } as const;
    for (const [hashKey, path] of Object.entries(projectionPaths)) {
      expect(artifactSha(path)).toBe(
        checkpoint.current_projection[hashKey],
      );
    }
    expect(checkpoint.authority).toEqual({
      authorizes_cross_product: false,
      authorizes_decision_persistence: false,
      authorizes_occurrence: false,
      authorizes_study: false,
      changes_evidence_outcomes: false,
      changes_ontology_or_grain: false,
      nonauthorizing_checkpoint_receipt: true,
    });
  });
});
