import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  PLAN040_PACKAGE_14_ACCEPTANCE_SHA256,
  PLAN040_PACKAGE_14_COMPARISON_SHA256,
  PLAN040_PACKAGE_14_EXTENT_DECISIONS_SHA256,
  PLAN040_PACKAGE_14_EXTENT_VERDICT_HISTOGRAM,
  PLAN040_PACKAGE_14_FROZEN_DRAFT_SHA256,
  PLAN040_PACKAGE_14_FROZEN_EVIDENCE_SHA256,
  PLAN040_PACKAGE_14_GATE_SHA256,
  PLAN040_PACKAGE_14_GRAIN_DECISIONS_SHA256,
  PLAN040_PACKAGE_14_GRAIN_VERDICT_HISTOGRAM,
  PLAN040_PACKAGE_14_PERSISTENCE_EVIDENCE_SHA256,
  PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS,
  PLAN040_PACKAGE_14_SOURCE_GAP_BLOCK_SHA256,
  PLAN040_PACKAGE_14_SOURCE_GAP_OVERLAY_SHA256,
} from "./plan040-accelerated-package14-closeout.js";
import {
  PLAN040_PACKAGE_12_CHECKPOINT_PATH,
  PLAN040_PACKAGE_13_CHECKPOINT_PATH,
  PLAN040_PACKAGE_13_CHECKPOINT_SHA256,
  PLAN040_PACKAGE_13_FAILURE_SIGNATURE_SHA256,
} from "./plan040-package13-checkpoint.js";

const RISK_ROOT =
  "data/quality/operational-reference/member-extent-risk";
const RECEIPT_ROOT =
  "data/quality/acquisition/receipts/member-extent-evidence";

export const PLAN040_PACKAGE_14_CHECKPOINT_PATH =
  `${RISK_ROOT}/plan-040-package-14-checkpoint-v1.json`;
export const PLAN040_PACKAGE_14_SUITE_COMMIT =
  "6309572155a9b02d134eb2dfb024664f252d6627";
export const PLAN040_PACKAGE_14_SEMANTIC_REVIEW_COMMIT =
  "f821424faff4fd58f0773a47ccd443cf4b0f0af8";

type ArtifactRef = { path: string; sha256: string };
type TestCounts = {
  pass: number;
  skip: number;
  fail: number;
  error: number;
  test_count: number;
  test_file_count: number;
  expect_call_count: number;
};
type PreviousCheckpoint = {
  full_repository_checkpoint: { counts: TestCounts };
  comparison: {
    failure_signature: {
      family_id: string;
      baseline_signature_sha256: string;
      failed_tests: string[];
      unhandled_error: { file: string; message: string };
    };
  };
};

export const PLAN040_PACKAGE_14_ARTIFACTS = {
  discovery: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-accelerated-package-14-discovery-receipt-v1.json",
    sha256:
      "36e09927e3ac775d081d84ff042f2165733cc79e5d8e48490f8f057da75c2d62",
  },
  qbnr6: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-accelerated-package-14-qbnr6-evidence-v1.json",
    sha256:
      "03512b4002d7609adb9a1e9e0e2c52fc10da10f4cca1344047d3572b4e8ea370",
  },
  q110_chains: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-accelerated-package-14-q110-full-stop-chains-v1.json",
    sha256:
      "e2d6b67a9543aae16c3f27efad570b2ecfb9975f6d3605aec5a850a1ca44b525",
  },
  express20: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-accelerated-package-14-express20-source-gaps-v1.json",
    sha256:
      "9783bcec6b4e1edc45f929fb5daca7b69cbe62683b792f38fbdcd9939a780b89",
  },
  ace7: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-accelerated-package-14-ace7-evidence-v1.json",
    sha256:
      "b562800f6dfea2ff1ef10324889a924f781a63ce235ad7aebc573ddc811f8214",
  },
  legacy_sbs3: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-accelerated-package-14-legacy-sbs3-evidence-v1.json",
    sha256:
      "6d3c0bfcc6c3d51ce88af81b652fd5f368399a11f4262fa05e8045a6b3d516c4",
  },
  source_gap_freeze: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-accelerated-package-14-source-gap-overlays-v1.json",
    sha256:
      "f8ac25362481b5d69a435555a0c429b9dfd627e832245c8a70119e6c0ce847af",
  },
  current_freeze: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-accelerated-package-14-current-freeze-state-v1.json",
    sha256:
      "fccd862125882bae3a53b2862bb38bb04c2b0abea08d550c2689202d89fe266a",
  },
  evidence: {
    path:
      `${RISK_ROOT}/plan-040-accelerated-package-14-evidence-v1.json`,
    sha256: PLAN040_PACKAGE_14_FROZEN_EVIDENCE_SHA256,
  },
  draft: {
    path:
      `${RISK_ROOT}/` +
      "plan-040-accelerated-package-14-evidence-draft-v1.json",
    sha256: PLAN040_PACKAGE_14_FROZEN_DRAFT_SHA256,
  },
  gate: {
    path:
      `${RISK_ROOT}/` +
      "plan-040-accelerated-package-14-dual-review-gate-v1.json",
    sha256: PLAN040_PACKAGE_14_GATE_SHA256,
  },
  comparison_receipt: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-accelerated-package-14-persistence-comparisons-v1.json",
    sha256: PLAN040_PACKAGE_14_COMPARISON_SHA256,
  },
  source_gap_block_receipt: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-accelerated-package-14-source-gap-blocks-v1.json",
    sha256: PLAN040_PACKAGE_14_SOURCE_GAP_BLOCK_SHA256,
  },
  persistence_evidence: {
    path:
      `${RISK_ROOT}/` +
      "plan-040-accelerated-package-14-persistence-evidence-v1.json",
    sha256: PLAN040_PACKAGE_14_PERSISTENCE_EVIDENCE_SHA256,
  },
  acceptance: {
    path:
      `${RISK_ROOT}/` +
      "plan-040-accelerated-package-14-owner-acceptance-v2.json",
    sha256: PLAN040_PACKAGE_14_ACCEPTANCE_SHA256,
  },
  extent_decisions: {
    path:
      "data/quality/operational-reference/member-extent-ledger-decisions/" +
      "plan-040-accelerated-package-14-v1.json",
    sha256: PLAN040_PACKAGE_14_EXTENT_DECISIONS_SHA256,
  },
  grain_decisions: {
    path:
      "data/quality/operational-reference/member-grain-decisions/" +
      "plan-040-accelerated-package-14-v1.json",
    sha256: PLAN040_PACKAGE_14_GRAIN_DECISIONS_SHA256,
  },
  source_gap_overlay: {
    path:
      "data/quality/operational-reference/member-source-gap-overlays/" +
      "plan-040-accelerated-package-14-v1.json",
    sha256: PLAN040_PACKAGE_14_SOURCE_GAP_OVERLAY_SHA256,
  },
} as const satisfies Record<string, ArtifactRef>;

const projectionPaths = {
  extent_ledger:
    "data/quality/operational-reference/member-extent-ledger.jsonl",
  grain_ledger:
    "data/quality/operational-reference/member-grain-ledger.jsonl",
  bridge_ledger: "data/quality/study-readiness/v1/bridge-ledger.jsonl",
  bridge_summary: "data/quality/study-readiness/v1/bridge-summary.json",
  consumer_priority_manifest:
    "data/quality/study-readiness/v1/consumer-priority-manifest.json",
  study_manifest: "data/quality/study-readiness/v1/manifest.json",
  member_extent_contract:
    "data/contracts/operational-occurrence-member-extent/v1/" +
    "operational_occurrence_member_extents.jsonl",
  member_extent_manifest:
    "data/contracts/operational-occurrence-member-extent/v1/manifest.json",
  member_extent_review_ledger:
    "data/contracts/operational-occurrence-member-extent/v1/" +
    "review-ledger.jsonl",
  member_extent_summary:
    "data/contracts/operational-occurrence-member-extent/v1/summary.json",
  operational_occurrences:
    "data/exports/releases/v1-rc26/operational_occurrences.jsonl",
  operational_occurrence_decisions:
    "data/exports/releases/v1-rc26/" +
    "operational_occurrence_review_decisions.json",
  treatment_components: "data/canonical/treatment_components.jsonl",
  reviewed_candidate_packets:
    "data/quality/study-readiness/v1/research/" +
    "reviewed-candidate-packets.jsonl",
} as const;

const projectionArtifacts = Object.fromEntries(
  Object.entries(projectionPaths).map(([name, path]) => [
    name,
    {
      path,
      sha256:
        PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS[
          name as keyof typeof PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS
        ],
    },
  ]),
) as Record<string, ArtifactRef>;

const suiteCounts: TestCounts = {
  pass: 1898,
  skip: 1,
  fail: 9,
  error: 1,
  test_count: 1908,
  test_file_count: 165,
  expect_call_count: 613416,
};

const expectedExtentCoarseHistogram = {
  absent_in_source: 165,
  blocked_upstream: 38,
  bounded_segment: 48,
  route_wide: 20,
  stop_set: 8,
  unreviewed: 29,
} as const;

const expectedGrainCoarseHistogram = {
  absent_in_source: 165,
  blocked_upstream: 47,
  not_applicable: 9,
  resolved: 58,
  unreviewed: 29,
} as const;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function artifactSha256(rootDir: string, path: string): string {
  return sha256(readFileSync(resolve(rootDir, path)));
}

function assertPinnedArtifacts(
  rootDir: string,
  artifacts: Record<string, ArtifactRef>,
): void {
  for (const [name, artifact] of Object.entries(artifacts)) {
    const actual = artifactSha256(rootDir, artifact.path);
    if (actual !== artifact.sha256) {
      throw new Error(
        `${name}: pinned SHA-256 drifted; expected ${artifact.sha256}, ` +
        `got ${actual}`,
      );
    }
  }
}

function readJsonl(
  rootDir: string,
  path: string,
): Array<Record<string, unknown>> {
  return readFileSync(resolve(rootDir, path), "utf8").trim().split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function histogram(
  rows: Array<Record<string, unknown>>,
  classify: (row: Record<string, unknown>) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = classify(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) =>
      left.localeCompare(right)
    ),
  );
}

function same(left: unknown, right: unknown): boolean {
  return stableJson(left as JsonValue) === stableJson(right as JsonValue);
}

export function buildPlan040Package14Checkpoint(
  rootDir = repoRoot,
): Record<string, unknown> {
  assertPinnedArtifacts(rootDir, PLAN040_PACKAGE_14_ARTIFACTS);
  assertPinnedArtifacts(rootDir, projectionArtifacts);

  const previousBytes = readFileSync(
    resolve(rootDir, PLAN040_PACKAGE_13_CHECKPOINT_PATH),
  );
  if (sha256(previousBytes) !== PLAN040_PACKAGE_13_CHECKPOINT_SHA256) {
    throw new Error("Package 13 checkpoint SHA-256 drifted");
  }
  const previous = JSON.parse(
    previousBytes.toString("utf8"),
  ) as PreviousCheckpoint;
  const failureSignature = {
    failed_tests: previous.comparison.failure_signature.failed_tests,
    unhandled_errors: [
      previous.comparison.failure_signature.unhandled_error,
    ],
  };
  if (
    sha256(`${stableJson(failureSignature as unknown as JsonValue)}\n`) !==
      PLAN040_PACKAGE_13_FAILURE_SIGNATURE_SHA256
  ) {
    throw new Error("known missing-corpus failure signature drifted");
  }

  const extentRows = readJsonl(rootDir, projectionPaths.extent_ledger);
  const grainRows = readJsonl(rootDir, projectionPaths.grain_ledger);
  const extentVerdictHistogram = histogram(
    extentRows,
    (row) => String(row.verdict),
  );
  const grainVerdictHistogram = histogram(
    grainRows,
    (row) => String(row.verdict),
  );
  const extentCoarseHistogram = histogram(extentRows, (row) => {
    const verdict = String(row.verdict);
    if (verdict.startsWith("blocked_upstream:")) return "blocked_upstream";
    if (verdict.startsWith("resolved:")) return verdict.slice(9);
    return verdict;
  });
  const grainCoarseHistogram = histogram(grainRows, (row) => {
    const verdict = String(row.verdict);
    return verdict.startsWith("blocked_upstream:")
      ? "blocked_upstream"
      : verdict;
  });
  if (
    !same(
      extentVerdictHistogram,
      PLAN040_PACKAGE_14_EXTENT_VERDICT_HISTOGRAM,
    ) ||
    !same(
      grainVerdictHistogram,
      PLAN040_PACKAGE_14_GRAIN_VERDICT_HISTOGRAM,
    ) ||
    !same(extentCoarseHistogram, expectedExtentCoarseHistogram) ||
    !same(grainCoarseHistogram, expectedGrainCoarseHistogram)
  ) {
    throw new Error("Package 14 global ledger histogram drifted");
  }

  const countDeltas = Object.fromEntries(
    Object.entries(suiteCounts).map(([key, value]) => [
      key,
      value - previous.full_repository_checkpoint.counts[
        key as keyof TestCounts
      ],
    ]),
  );

  return {
    schema_version: 1,
    receipt_id: "plan-040-package-14-checkpoint-v1",
    recorded_at: "2026-07-25T00:00:42Z",
    recorded_by: "codex-plan040-executor",
    checkpoint_scope: {
      checkpoint_reason:
        "accepted_36_closure_final_package_14_checkpoint",
      checkpoint_commit: PLAN040_PACKAGE_14_SUITE_COMMIT,
      newly_closed_since_package_13_checkpoint: 36,
      global_open_candidate_count: 29,
      previous_checkpoint: {
        path: PLAN040_PACKAGE_13_CHECKPOINT_PATH,
        sha256: PLAN040_PACKAGE_13_CHECKPOINT_SHA256,
      },
      package_14: {
        candidate_count: 36,
        verdict_distribution: {
          positive_extent_and_grain: 8,
          source_gap_blocked_extent_and_grain: 28,
          exact_absence: 0,
        },
        artifacts: PLAN040_PACKAGE_14_ARTIFACTS,
      },
      reviews: {
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
      },
    },
    full_repository_checkpoint: {
      commit: PLAN040_PACKAGE_14_SUITE_COMMIT,
      command: "bun run test",
      runner: "bun test v1.3.14 (0d9b296a)",
      duration_seconds: 616.68,
      exit_code: 1,
      counts: suiteCounts,
      captured_log: {
        retained: false,
        path: null,
        sha256: null,
        statement:
          "The full-suite log was not retained; no log hash is available.",
      },
      status: "matches_known_missing_corpus_baseline",
    },
    comparison: {
      count_deltas_from_package_13_checkpoint: countDeltas,
      failure_signature: {
        family_id: previous.comparison.failure_signature.family_id,
        baseline_signature_sha256:
          PLAN040_PACKAGE_13_FAILURE_SIGNATURE_SHA256,
        failed_test_count: 9,
        failed_tests: previous.comparison.failure_signature.failed_tests,
        failed_tests_match_exact: true,
        unhandled_error:
          previous.comparison.failure_signature.unhandled_error,
        unhandled_error_match_exact: true,
        signature_unchanged: true,
        unexpected_failures: 0,
        unexpected_errors: 0,
        additional_failures: 0,
      },
      plan040_package_14: {
        closure_count: 36,
        global_open_candidate_count: 29,
        semantic_review: "APPROVE/APPROVE",
        projection_repair_review: "APPROVE",
        status: "pass",
        additional_failures: 0,
      },
    },
    current_projection: {
      artifacts: projectionArtifacts,
      member_extent_verdict_histogram: extentVerdictHistogram,
      member_extent_coarse_histogram: extentCoarseHistogram,
      member_grain_verdict_histogram: grainVerdictHistogram,
      member_grain_coarse_histogram: grainCoarseHistogram,
      global_open_candidate_count: 29,
    },
    verification: {
      preflight: {
        command:
          "bun test packages/pipeline/test/quality/" +
          "plan040-accelerated-package14.test.ts",
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
      typecheck: {
        command: "bun run typecheck",
        status: "pass",
      },
      validate: {
        command: "bun run validate",
        issues: 0,
        warnings: 3,
        release_contract_issues: 0,
        status: "pass",
      },
      deterministic_replay: {
        package_13_checkpoint: {
          command:
            "bun packages/cli/src/cli.ts " +
            "plan-040-package-13-checkpoint --check",
          sha256: PLAN040_PACKAGE_13_CHECKPOINT_SHA256,
          status: "pass",
        },
        package_14: {
          command:
            "bun packages/pipeline/scripts/" +
            "generate-plan040-accelerated-package14.ts --check",
          candidate_count: 36,
          positive_count: 8,
          blocked_source_gap_count: 28,
          status: "pass",
        },
      },
    },
    authority: {
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
    },
    preservation: {
      historical_checkpoint_unchanged: true,
      evidence_and_decisions_unchanged: true,
      projections_unchanged: true,
      exact_positive_requirement_preserved: true,
      historical_full_stop_and_stop_id_equivalence_prerequisite_preserved:
        true,
      package_12_checkpoint_path: PLAN040_PACKAGE_12_CHECKPOINT_PATH,
    },
  };
}

export function writePlan040Package14Checkpoint(options: {
  rootDir?: string;
  outputPath?: string;
  check?: boolean;
} = {}): {
  path: string;
  sha256: string;
  checkpoint: Record<string, unknown>;
} {
  const rootDir = resolve(options.rootDir ?? repoRoot);
  const path = resolve(
    rootDir,
    options.outputPath ?? PLAN040_PACKAGE_14_CHECKPOINT_PATH,
  );
  const checkpoint = buildPlan040Package14Checkpoint(rootDir);
  const bytes = `${stableJson(checkpoint as JsonValue)}\n`;
  if (options.check) {
    if (!existsSync(path)) {
      throw new Error(`${path}: Package 14 checkpoint is missing`);
    }
    const actual = readFileSync(path, "utf8");
    if (actual !== bytes) {
      throw new Error(`${path}: Package 14 checkpoint is stale`);
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
  return { path, sha256: sha256(bytes), checkpoint };
}
