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
  PLAN040_PACKAGE_11_ACCEPTANCE_SHA256,
  PLAN040_PACKAGE_11_DRAFT_SHA256,
  PLAN040_PACKAGE_11_EVIDENCE_SHA256,
  PLAN040_PACKAGE_11_EXTENT_DECISIONS_SHA256,
  PLAN040_PACKAGE_11_GATE_SHA256,
  PLAN040_PACKAGE_11_GRAIN_DECISIONS_SHA256,
  PLAN040_PACKAGE_11_RECEIPT_SHA256,
} from "./plan040-qbnr-service-grain-package11-closeout.js";
import {
  PLAN040_PACKAGE_12_CHECKPOINT_PATH,
  PLAN040_PACKAGE_12_CHECKPOINT_SHA256,
  PLAN040_PACKAGE_13_CHECKPOINT_PATH,
  PLAN040_PACKAGE_13_CHECKPOINT_SHA256,
  PLAN040_PACKAGE_13_FAILURE_SIGNATURE_SHA256,
} from "./plan040-package13-checkpoint.js";
import {
  PLAN040_PACKAGE_14_CHECKPOINT_PATH,
  PLAN040_PACKAGE_14_CHECKPOINT_SHA256,
} from "./plan040-package14-checkpoint.js";
import {
  PLAN040_PACKAGE_15_ACCEPTANCE_SHA256,
  PLAN040_PACKAGE_15_COMPARISON_SHA256,
  PLAN040_PACKAGE_15_EXTENT_DECISIONS_SHA256,
  PLAN040_PACKAGE_15_EXTENT_VERDICT_HISTOGRAM,
  PLAN040_PACKAGE_15_FROZEN_DRAFT_SHA256,
  PLAN040_PACKAGE_15_FROZEN_EVIDENCE_SHA256,
  PLAN040_PACKAGE_15_GATE_SHA256,
  PLAN040_PACKAGE_15_GRAIN_DECISIONS_SHA256,
  PLAN040_PACKAGE_15_GRAIN_VERDICT_HISTOGRAM,
  PLAN040_PACKAGE_15_PERSISTENCE_EVIDENCE_SHA256,
  PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS,
  PLAN040_PACKAGE_15_SOURCE_GAP_BLOCK_SHA256,
  PLAN040_PACKAGE_15_SOURCE_GAP_OVERLAY_SHA256,
} from "./plan040-accelerated-package15-closeout.js";
import {
  PLAN040_PACKAGE_15_CANDIDATE_COUNT,
  PLAN040_PACKAGE_15_EXACT_ABSENCE_COUNT,
  PLAN040_PACKAGE_15_POSITIVE_COUNT,
  PLAN040_PACKAGE_15_SOURCE_GAP_COUNT,
} from "./plan040-accelerated-package15.js";

const RISK_ROOT =
  "data/quality/operational-reference/member-extent-risk";
const RECEIPT_ROOT =
  "data/quality/acquisition/receipts/member-extent-evidence";

export const PLAN040_FINAL_CHECKPOINT_PATH =
  `${RISK_ROOT}/plan-040-final-checkpoint-v1.json`;
export const PLAN040_FINAL_CHECKPOINT_SHA256 =
  "33ba121bed1d4e5ade57983ccadfff0d1b6099c1e87a653237673cb7871c5594";
export const PLAN040_FINAL_SUITE_COMMIT =
  "71098c3c1dd9f0875f5e75be5f941b72fd38c1ed";
export const PLAN040_PACKAGE_15_PERSISTENCE_COMMIT =
  "6a84a949fd4c01a8f8071e6cfbf74c2b04d58d47";
export const PLAN040_PARSER_HARDENING_COMMIT =
  "851d68a11cb6a34430082cfbc17a239a72f30287";
export const PLAN040_SUCCESSOR_REPAIR_COMMIT =
  PLAN040_FINAL_SUITE_COMMIT;
export const PLAN040_PACKAGE_15_ACCEPTANCE_COMMIT =
  "92a4daaa43f5b8afb913c9e0c421d43c72cc55be";
export const PLAN040_PACKAGE_15_REVIEWED_COMMIT =
  "7513c6001b7198b812c0ae44b9b5d2ad73dd1647";

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

export const PLAN040_FINAL_HISTORICAL_REPLAY_ARTIFACTS = {
  package_11_evidence: {
    path:
      `${RISK_ROOT}/` +
      "plan-040-qbnr-service-grain-package-11-evidence-v1.json",
    sha256: PLAN040_PACKAGE_11_EVIDENCE_SHA256,
  },
  package_11_draft: {
    path:
      `${RISK_ROOT}/` +
      "plan-040-qbnr-service-grain-package-11-evidence-draft-v1.json",
    sha256: PLAN040_PACKAGE_11_DRAFT_SHA256,
  },
  package_11_positive_pattern_receipt: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-qbnr-service-grain-package-11-positive-patterns-v1.json",
    sha256: PLAN040_PACKAGE_11_RECEIPT_SHA256,
  },
  package_11_gate: {
    path:
      `${RISK_ROOT}/` +
      "plan-040-qbnr-service-grain-package-11-dual-review-gate-v1.json",
    sha256: PLAN040_PACKAGE_11_GATE_SHA256,
  },
  package_11_acceptance: {
    path:
      `${RISK_ROOT}/` +
      "plan-040-qbnr-service-grain-package-11-owner-acceptance-v1.json",
    sha256: PLAN040_PACKAGE_11_ACCEPTANCE_SHA256,
  },
  package_11_extent_decisions: {
    path:
      "data/quality/operational-reference/member-extent-ledger-decisions/" +
      "plan-040-qbnr-service-grain-package-11-v1.json",
    sha256: PLAN040_PACKAGE_11_EXTENT_DECISIONS_SHA256,
  },
  package_11_grain_decisions: {
    path:
      "data/quality/operational-reference/member-grain-decisions/" +
      "plan-040-qbnr-service-grain-package-11-v1.json",
    sha256: PLAN040_PACKAGE_11_GRAIN_DECISIONS_SHA256,
  },
  package_12_checkpoint: {
    path: PLAN040_PACKAGE_12_CHECKPOINT_PATH,
    sha256: PLAN040_PACKAGE_12_CHECKPOINT_SHA256,
  },
  package_13_checkpoint: {
    path: PLAN040_PACKAGE_13_CHECKPOINT_PATH,
    sha256: PLAN040_PACKAGE_13_CHECKPOINT_SHA256,
  },
  package_14_checkpoint: {
    path: PLAN040_PACKAGE_14_CHECKPOINT_PATH,
    sha256: PLAN040_PACKAGE_14_CHECKPOINT_SHA256,
  },
} as const satisfies Record<string, ArtifactRef>;

export const PLAN040_FINAL_PACKAGE_15_ARTIFACTS = {
  discovery: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-accelerated-package-15-discovery-receipt-v1.json",
    sha256:
      "948807a1a8e92b098c4079d3e66c457416922c22078cbaf6227998d14daa6ebd",
  },
  evidence: {
    path: `${RISK_ROOT}/plan-040-accelerated-package-15-evidence-v1.json`,
    sha256: PLAN040_PACKAGE_15_FROZEN_EVIDENCE_SHA256,
  },
  draft: {
    path:
      `${RISK_ROOT}/plan-040-accelerated-package-15-evidence-draft-v1.json`,
    sha256: PLAN040_PACKAGE_15_FROZEN_DRAFT_SHA256,
  },
  gate: {
    path:
      `${RISK_ROOT}/plan-040-accelerated-package-15-dual-review-gate-v1.json`,
    sha256: PLAN040_PACKAGE_15_GATE_SHA256,
  },
  comparison_receipt: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-accelerated-package-15-persistence-comparisons-v1.json",
    sha256: PLAN040_PACKAGE_15_COMPARISON_SHA256,
  },
  source_gap_block_receipt: {
    path:
      `${RECEIPT_ROOT}/` +
      "plan-040-accelerated-package-15-source-gap-blocks-v1.json",
    sha256: PLAN040_PACKAGE_15_SOURCE_GAP_BLOCK_SHA256,
  },
  persistence_evidence: {
    path:
      `${RISK_ROOT}/` +
      "plan-040-accelerated-package-15-persistence-evidence-v1.json",
    sha256: PLAN040_PACKAGE_15_PERSISTENCE_EVIDENCE_SHA256,
  },
  acceptance: {
    path:
      `${RISK_ROOT}/plan-040-accelerated-package-15-owner-acceptance-v1.json`,
    sha256: PLAN040_PACKAGE_15_ACCEPTANCE_SHA256,
  },
  extent_decisions: {
    path:
      "data/quality/operational-reference/member-extent-ledger-decisions/" +
      "plan-040-accelerated-package-15-v1.json",
    sha256: PLAN040_PACKAGE_15_EXTENT_DECISIONS_SHA256,
  },
  grain_decisions: {
    path:
      "data/quality/operational-reference/member-grain-decisions/" +
      "plan-040-accelerated-package-15-v1.json",
    sha256: PLAN040_PACKAGE_15_GRAIN_DECISIONS_SHA256,
  },
  source_gap_overlay: {
    path:
      "data/quality/operational-reference/member-source-gap-overlays/" +
      "plan-040-accelerated-package-15-v1.json",
    sha256: PLAN040_PACKAGE_15_SOURCE_GAP_OVERLAY_SHA256,
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
        PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS[
          name as keyof typeof PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS
        ],
    },
  ]),
) as Record<string, ArtifactRef>;

const finalSuiteCounts: TestCounts = {
  pass: 1923,
  skip: 1,
  fail: 9,
  error: 1,
  test_count: 1933,
  test_file_count: 168,
  expect_call_count: 613830,
};

export const PLAN040_FINAL_EXTENT_COARSE_HISTOGRAM = {
  absent_in_source: 165,
  blocked_upstream: 51,
  bounded_segment: 48,
  route_wide: 35,
  stop_set: 9,
  unreviewed: 0,
} as const;

export const PLAN040_FINAL_GRAIN_COARSE_HISTOGRAM = {
  absent_in_source: 165,
  blocked_upstream: 60,
  not_applicable: 10,
  resolved: 73,
  unreviewed: 0,
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

function withZeroUnreviewed(
  value: Record<string, number>,
): Record<string, number> {
  return { ...value, unreviewed: value.unreviewed ?? 0 };
}

function same(left: unknown, right: unknown): boolean {
  return stableJson(left as JsonValue) === stableJson(right as JsonValue);
}

export function buildPlan040FinalCheckpoint(
  rootDir = repoRoot,
): Record<string, unknown> {
  assertPinnedArtifacts(rootDir, PLAN040_FINAL_HISTORICAL_REPLAY_ARTIFACTS);
  assertPinnedArtifacts(rootDir, PLAN040_FINAL_PACKAGE_15_ARTIFACTS);
  assertPinnedArtifacts(rootDir, projectionArtifacts);

  const previousBytes = readFileSync(
    resolve(rootDir, PLAN040_PACKAGE_14_CHECKPOINT_PATH),
  );
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
  if (extentRows.length !== 308 || grainRows.length !== 308) {
    throw new Error("Plan 040 final ledger denominator drifted");
  }
  const extentVerdictHistogram = histogram(
    extentRows,
    (row) => String(row.verdict),
  );
  const grainVerdictHistogram = histogram(
    grainRows,
    (row) => String(row.verdict),
  );
  const extentCoarseHistogram = withZeroUnreviewed(
    histogram(extentRows, (row) => {
      const verdict = String(row.verdict);
      if (verdict.startsWith("blocked_upstream:")) return "blocked_upstream";
      if (verdict.startsWith("resolved:")) return verdict.slice(9);
      return verdict;
    }),
  );
  const grainCoarseHistogram = withZeroUnreviewed(
    histogram(grainRows, (row) => {
      const verdict = String(row.verdict);
      return verdict.startsWith("blocked_upstream:")
        ? "blocked_upstream"
        : verdict;
    }),
  );
  if (
    !same(
      extentVerdictHistogram,
      PLAN040_PACKAGE_15_EXTENT_VERDICT_HISTOGRAM,
    ) ||
    !same(
      grainVerdictHistogram,
      PLAN040_PACKAGE_15_GRAIN_VERDICT_HISTOGRAM,
    ) ||
    !same(
      extentCoarseHistogram,
      PLAN040_FINAL_EXTENT_COARSE_HISTOGRAM,
    ) ||
    !same(
      grainCoarseHistogram,
      PLAN040_FINAL_GRAIN_COARSE_HISTOGRAM,
    )
  ) {
    throw new Error("Plan 040 final ledger histogram drifted");
  }

  const countDeltas = Object.fromEntries(
    Object.entries(finalSuiteCounts).map(([key, value]) => [
      key,
      value - previous.full_repository_checkpoint.counts[
        key as keyof TestCounts
      ],
    ]),
  );

  return {
    schema_version: 1,
    receipt_id: "plan-040-final-checkpoint-v1",
    recorded_at: "2026-07-25T01:59:53Z",
    recorded_by: "codex-plan040-executor",
    checkpoint_scope: {
      checkpoint_reason:
        "package_15_final_closure_and_plan_040_transition_checkpoint",
      checkpoint_commit: PLAN040_FINAL_SUITE_COMMIT,
      global_candidate_count: 308,
      global_open_candidate_count: 0,
      previous_checkpoint: {
        path: PLAN040_PACKAGE_14_CHECKPOINT_PATH,
        sha256: PLAN040_PACKAGE_14_CHECKPOINT_SHA256,
      },
      finalization_commits: [
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
      ],
      package_15: {
        reviewed_commit: PLAN040_PACKAGE_15_REVIEWED_COMMIT,
        acceptance_commit: PLAN040_PACKAGE_15_ACCEPTANCE_COMMIT,
        persistence_commit: PLAN040_PACKAGE_15_PERSISTENCE_COMMIT,
        candidate_count: PLAN040_PACKAGE_15_CANDIDATE_COUNT,
        verdict_distribution: {
          positive_extent_and_grain: PLAN040_PACKAGE_15_POSITIVE_COUNT,
          source_gap_blocked_extent_and_grain:
            PLAN040_PACKAGE_15_SOURCE_GAP_COUNT,
          exact_absence: PLAN040_PACKAGE_15_EXACT_ABSENCE_COUNT,
        },
        artifacts: PLAN040_FINAL_PACKAGE_15_ARTIFACTS,
      },
      reviews: {
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
      },
    },
    full_repository_checkpoint: {
      commit: PLAN040_FINAL_SUITE_COMMIT,
      command: "bun run test",
      runner: "bun test v1.3.14 (0d9b296a)",
      duration_seconds: 609.97,
      exit_code: 1,
      counts: finalSuiteCounts,
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
    },
    comparison: {
      count_deltas_from_package_14_checkpoint: countDeltas,
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
      plan040_final: {
        candidate_count: 308,
        newly_closed_since_package_14_checkpoint: 29,
        global_open_candidate_count: 0,
        package_15_review: "APPROVE/APPROVE",
        parser_hardening_review: "APPROVE/APPROVE",
        successor_projection_repair_review: "APPROVE",
        status: "pass",
        additional_failures: 0,
      },
    },
    current_projection: {
      artifacts: projectionArtifacts,
      member_extent_row_count: extentRows.length,
      member_extent_verdict_histogram: extentVerdictHistogram,
      member_extent_coarse_histogram: extentCoarseHistogram,
      member_grain_row_count: grainRows.length,
      member_grain_verdict_histogram: grainVerdictHistogram,
      member_grain_coarse_histogram: grainCoarseHistogram,
      global_open_candidate_count: 0,
    },
    verification: {
      deterministic_replay: {
        package_11: {
          command:
            "bun packages/pipeline/scripts/" +
            "generate-plan040-qbnr-service-grain-package11.ts --check",
          status: "pass",
        },
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
        package_15: {
          command:
            "bun packages/pipeline/scripts/" +
            "generate-plan040-accelerated-package15.ts --check",
          candidate_count: 29,
          positive_count: 16,
          blocked_source_gap_count: 13,
          unreviewed_count: 0,
          status: "pass",
        },
        final_projection: {
          command:
            "bun packages/cli/src/cli.ts " +
            "plan-040-final-checkpoint --check",
          extent_row_count: 308,
          grain_row_count: 308,
          unreviewed_count: 0,
          status: "pass",
        },
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
    },
    authority: {
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
    },
    preservation: {
      historical_package_11_through_14_artifacts_unchanged: true,
      evidence_and_decisions_unchanged: true,
      projections_unchanged: true,
      exact_positive_requirement_preserved: true,
      historical_full_stop_and_stop_id_equivalence_prerequisite_preserved:
        true,
      prior_acceptances_and_commits_preserved: true,
      broad_historical_acquisition_not_required: true,
      targeted_pinned_historical_gtfs_prerequisite_preserved: true,
    },
  };
}

export function writePlan040FinalCheckpoint(options: {
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
    options.outputPath ?? PLAN040_FINAL_CHECKPOINT_PATH,
  );
  const checkpoint = buildPlan040FinalCheckpoint(rootDir);
  const bytes = `${stableJson(checkpoint as JsonValue)}\n`;
  if (options.check) {
    if (!existsSync(path)) {
      throw new Error(`${path}: Plan 040 final checkpoint is missing`);
    }
    const actual = readFileSync(path, "utf8");
    if (actual !== bytes) {
      throw new Error(`${path}: Plan 040 final checkpoint is stale`);
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
  return { path, sha256: sha256(bytes), checkpoint };
}
