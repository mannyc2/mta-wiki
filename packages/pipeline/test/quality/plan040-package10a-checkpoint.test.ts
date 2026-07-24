import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import type { JsonValue } from "../../../db/src/types";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const checkpointPath = `${riskRoot}/plan-040-package-10a-checkpoint-v1.json`;
const baselinePath =
  `${riskRoot}/plan-040-package-6-checkpoint-repaired-baseline-v1.json`;
const p8CheckpointPath =
  `${riskRoot}/plan-040-package-8-checkpoint-v1.json`;
const CHECKPOINT_SHA256 =
  "f0b7cbd8097c6199e2a2080cb0a9d9410787ab998d9ad3b382bddf3d27c13802";
const BASELINE_SHA256 =
  "13d3bb05df64c19c7215593fa645c5b112f14607479b75de5b681046ce260142";
const P8_CHECKPOINT_SHA256 =
  "41da0a245aa36bb9b6bfe7925c9b4a8080b77d2fe8c2c4d4d00165013dd4da73";
const FAILURE_SIGNATURE_SHA256 =
  "d111d493e9a52cb9f14704fc73e3b7679bd7abdbfea5cd20ba604f310b26ea0b";

type Counts = {
  pass: number;
  skip: number;
  fail: number;
  error: number;
  test_count: number;
  test_file_count: number;
  expect_call_count: number;
};
type Checkpoint = {
  schema_version: 1;
  receipt_id: string;
  checkpoint_scope: {
    newly_closed_since_p8_checkpoint: number;
    checkpoint_reason: string;
    p8_checkpoint: { path: string; sha256: string };
    package_9: {
      persistence_commit: string;
      candidate_count: number;
      candidate_key_sha256: string;
      newly_closed_candidates: number;
      evidence_sha256: string;
      draft_sha256: string;
      acceptance_sha256: string;
      reviewed_absence_receipt_sha256: string;
    };
    package_10a: {
      persistence_commit: string;
      candidate_count: number;
      candidate_key_sha256: string;
      newly_closed_candidates: number;
      evidence_sha256: string;
      draft_sha256: string;
      acceptance_sha256: string;
      reviewed_absence_receipt_sha256: string;
    };
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
  pinned_repaired_baseline: {
    path: string;
    sha256: string;
    failure_family_id: string;
    counts: Counts;
    test_file_count_source: string;
  };
  comparison: {
    count_deltas: Counts;
    failure_signature: {
      family_id: string;
      baseline_signature_sha256: string;
      failed_test_count: number;
      failed_tests_match_exact: true;
      unhandled_error: { file: string; message: string };
      unhandled_error_match_exact: true;
      signature_unchanged: true;
      reisolated: false;
      reisolation_reason: string;
      unexpected_failures: 0;
      unexpected_errors: 0;
      additional_failures: 0;
    };
    plan040_packages: {
      status: "pass";
      additional_failures: 0;
    };
  };
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
type Baseline = {
  baseline_failure_family: {
    family_id: string;
    failed_tests: string[];
    unhandled_errors: Array<{ file: string; message: string }>;
  };
};
type P8Checkpoint = {
  pinned_baseline: {
    path: string;
    sha256: string;
    counts: Counts;
  };
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const artifactSha = (path: string): string =>
  sha256(readFileSync(`${repoRoot}/${path}`));

describe("Plan 040 Package 9 plus 10A 26-closure checkpoint", () => {
  it("replays the exact compact checkpoint bytes", () => {
    const bytes = readFileSync(checkpointPath);
    const checkpoint = JSON.parse(bytes.toString("utf8")) as Checkpoint;
    expect(sha256(bytes)).toBe(CHECKPOINT_SHA256);
    expect(`${stableJson(checkpoint as unknown as JsonValue)}\n`).toBe(
      bytes.toString("utf8"),
    );
    expect(checkpoint.schema_version).toBe(1);
    expect(checkpoint.receipt_id).toBe(
      "plan-040-package-10a-checkpoint-v1",
    );
    expect(checkpoint.checkpoint_scope).toEqual(expect.objectContaining({
      newly_closed_since_p8_checkpoint: 26,
      checkpoint_reason:
        "accelerated_protocol_25_to_50_candidate_threshold",
    }));
    expect(checkpoint.checkpoint_scope.package_9).toEqual({
      acceptance_sha256:
        "13e5d18a32d6d658d08d34d1e3f30de2432abd7e47af23ea25e018e5badf5ae1",
      candidate_count: 22,
      candidate_key_sha256:
        "ea37749a45575b8752a3a984ea57218f272fa251072bed23ef02f91e4b69a0b7",
      draft_sha256:
        "a35e7baa10736e65ee432394313dde58a790c2184015920df613d573e8628481",
      evidence_sha256:
        "376a3e9f184a24530d344eea0f53842fabce2e83ab2eb12b21bc59fd7ee10a7c",
      newly_closed_candidates: 22,
      persistence_commit:
        "5003f91d2fc4d71d351262e344d1a3ca2161b09e",
      reviewed_absence_receipt_sha256:
        "3301f2d0e3c33199c59f6a7a3e5e93daa29ff16ff55e060cc43d2ba4a9ada3d8",
    });
    expect(checkpoint.checkpoint_scope.package_10a).toEqual({
      acceptance_sha256:
        "4762b8231d581a4b9a89028029458a796076706c5f51e40726978ff5bcbe96f1",
      candidate_count: 4,
      candidate_key_sha256:
        "868c628146a741f67e0438437d72154b03e0428a503bf704b22e7101f81a636a",
      draft_sha256:
        "e7b2c7b030d1a4a992f55b94a80e0f9c236fa284c9482a5ee50935c0d0c2814e",
      evidence_sha256:
        "2d0bb750a8ecec2dcd2f686085669007696f96476aa3fe6af1d1c4156923acc6",
      newly_closed_candidates: 4,
      persistence_commit:
        "d59b8c38a3f24c9bdaaba8e22a91e40c79c65c6b",
      reviewed_absence_receipt_sha256:
        "87d60e8710a1bfcc2ddfc8f5ec5b8c68db77556336a94f0dcd84ef9e6d80650a",
    });
  });

  it("pins the completed suite counts and exact repaired-baseline delta", () => {
    const checkpoint = readJson<Checkpoint>(checkpointPath);
    expect(checkpoint.full_repository_checkpoint).toEqual({
      captured_log: {
        path: null,
        retained: false,
        sha256: null,
        statement:
          "The full-suite log was not retained; no log hash is available.",
      },
      command: "bun run test",
      commit: "d59b8c38a3f24c9bdaaba8e22a91e40c79c65c6b",
      counts: {
        error: 1,
        expect_call_count: 608101,
        fail: 9,
        pass: 1776,
        skip: 1,
        test_count: 1786,
        test_file_count: 148,
      },
      duration_seconds: 581.49,
      exit_code: 1,
      runner: "bun test v1.3.14 (0d9b296a)",
      status: "matches_repaired_known_missing_corpus_baseline",
    });
    expect(checkpoint.pinned_repaired_baseline.counts).toEqual({
      error: 1,
      expect_call_count: 600438,
      fail: 9,
      pass: 1727,
      skip: 1,
      test_count: 1737,
      test_file_count: 144,
    });
    const current = checkpoint.full_repository_checkpoint.counts;
    const baseline = checkpoint.pinned_repaired_baseline.counts;
    const deltas = Object.fromEntries(
      Object.keys(current).map((key) => [
        key,
        current[key as keyof Counts] - baseline[key as keyof Counts],
      ]),
    );
    expect(deltas).toEqual({
      error: 0,
      expect_call_count: 7663,
      fail: 0,
      pass: 49,
      skip: 0,
      test_count: 49,
      test_file_count: 4,
    });
    expect(checkpoint.comparison.count_deltas).toEqual(deltas);
    expect(checkpoint.full_repository_checkpoint.captured_log.retained)
      .toBe(false);
    expect(checkpoint.full_repository_checkpoint.captured_log.path)
      .toBeNull();
    expect(checkpoint.full_repository_checkpoint.captured_log.sha256)
      .toBeNull();
  });

  it("proves the known failure signature is unchanged without re-isolation", () => {
    const checkpoint = readJson<Checkpoint>(checkpointPath);
    const baseline = readJson<Baseline>(baselinePath);
    const p8 = readJson<P8Checkpoint>(p8CheckpointPath);
    expect(sha256(readFileSync(baselinePath))).toBe(BASELINE_SHA256);
    expect(sha256(readFileSync(p8CheckpointPath))).toBe(
      P8_CHECKPOINT_SHA256,
    );
    expect(checkpoint.checkpoint_scope.p8_checkpoint).toEqual({
      path:
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-package-8-checkpoint-v1.json",
      sha256: P8_CHECKPOINT_SHA256,
    });
    expect(checkpoint.pinned_repaired_baseline.path).toBe(
      p8.pinned_baseline.path,
    );
    expect(checkpoint.pinned_repaired_baseline.sha256).toBe(
      p8.pinned_baseline.sha256,
    );
    expect(checkpoint.pinned_repaired_baseline.counts).toEqual(
      p8.pinned_baseline.counts,
    );
    const signature = {
      failed_tests: baseline.baseline_failure_family.failed_tests,
      unhandled_errors: baseline.baseline_failure_family.unhandled_errors,
    };
    expect(sha256(
      `${stableJson(signature as unknown as JsonValue)}\n`,
    )).toBe(FAILURE_SIGNATURE_SHA256);
    expect(checkpoint.comparison.failure_signature).toEqual(
      expect.objectContaining({
        additional_failures: 0,
        baseline_signature_sha256: FAILURE_SIGNATURE_SHA256,
        failed_test_count: 9,
        failed_tests_match_exact: true,
        family_id: baseline.baseline_failure_family.family_id,
        reisolated: false,
        signature_unchanged: true,
        unexpected_errors: 0,
        unexpected_failures: 0,
        unhandled_error: baseline.baseline_failure_family
          .unhandled_errors[0],
        unhandled_error_match_exact: true,
      }),
    );
    expect(checkpoint.comparison.plan040_packages).toEqual({
      additional_failures: 0,
      status: "pass",
    });
  });

  it("pins closure artifacts and grants no authority", () => {
    const checkpoint = readJson<Checkpoint>(checkpointPath);
    for (
      const [path, expected] of [
        [
          "data/quality/operational-reference/member-extent-risk/" +
            "plan-040-qbnr-service-pattern-package-9-evidence-v1.json",
          checkpoint.checkpoint_scope.package_9.evidence_sha256,
        ],
        [
          "data/quality/operational-reference/member-extent-risk/" +
            "plan-040-qbnr-service-pattern-package-9-evidence-draft-v1.json",
          checkpoint.checkpoint_scope.package_9.draft_sha256,
        ],
        [
          "data/quality/operational-reference/member-extent-risk/" +
            "plan-040-qbnr-service-pattern-package-9-owner-acceptance-v1.json",
          checkpoint.checkpoint_scope.package_9.acceptance_sha256,
        ],
        [
          "data/quality/acquisition/receipts/member-extent/" +
            "plan-040-qbnr-service-pattern-package-9-reviewed-absence-v1.json",
          checkpoint.checkpoint_scope.package_9
            .reviewed_absence_receipt_sha256,
        ],
        [
          "data/quality/operational-reference/member-extent-risk/" +
            "plan-040-qbnr-service-pattern-package-10a-evidence-v1.json",
          checkpoint.checkpoint_scope.package_10a.evidence_sha256,
        ],
        [
          "data/quality/operational-reference/member-extent-risk/" +
            "plan-040-qbnr-service-pattern-package-10a-evidence-draft-v1.json",
          checkpoint.checkpoint_scope.package_10a.draft_sha256,
        ],
        [
          "data/quality/operational-reference/member-extent-risk/" +
            "plan-040-qbnr-service-pattern-package-10a-owner-acceptance-v1.json",
          checkpoint.checkpoint_scope.package_10a.acceptance_sha256,
        ],
        [
          "data/quality/acquisition/receipts/member-extent/" +
            "plan-040-qbnr-service-pattern-package-10a-reviewed-absence-v1.json",
          checkpoint.checkpoint_scope.package_10a
            .reviewed_absence_receipt_sha256,
        ],
      ] as const
    ) {
      expect(artifactSha(path)).toBe(expected);
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
