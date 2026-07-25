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
import { PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS } from
  "./plan040-accelerated-package14-closeout.js";
import { PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS } from
  "./plan040-accelerated-package15-closeout.js";
import {
  PLAN040_PACKAGE_13_ACCEPTANCE_SHA256,
  PLAN040_PACKAGE_13_APPROVED_COMMIT,
  PLAN040_PACKAGE_13_DRAFT_SHA256,
  PLAN040_PACKAGE_13_EVIDENCE_SHA256,
  PLAN040_PACKAGE_13_EXTENT_DECISIONS_SHA256,
  PLAN040_PACKAGE_13_GATE_SHA256,
  PLAN040_PACKAGE_13_GRAIN_DECISIONS_SHA256,
  PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS,
  PLAN040_PACKAGE_13_SOURCE_GAP_OVERLAY_SHA256,
} from "./plan040-qbnr-bus-stop-package13-closeout.js";
import {
  PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256,
  PLAN040_PACKAGE_13_SOURCE_GAP_RECEIPT_SHA256,
} from "./plan040-qbnr-bus-stop-package13.js";
import { PLAN041_POST_CLOSURE_PROJECTION_PINS } from
  "./plan041-projection-successor.js";

const RISK_ROOT =
  "data/quality/operational-reference/member-extent-risk";
export const PLAN040_PACKAGE_13_CHECKPOINT_PATH =
  `${RISK_ROOT}/plan-040-package-13-checkpoint-v1.json`;
export const PLAN040_PACKAGE_13_CHECKPOINT_SHA256 =
  "6fd187bbf0b80893f97cbd8decdf9eb79c4965c9649456c8c2895896cbf3c7b7";
export const PLAN040_PACKAGE_12_CHECKPOINT_PATH =
  `${RISK_ROOT}/plan-040-package-12-checkpoint-v1.json`;
export const PLAN040_PACKAGE_12_CHECKPOINT_SHA256 =
  "0c3f35c3b978910d0f0bf344b21390cb7884670f7bff30a3ee16a57700874b1d";
export const PLAN040_PACKAGE_13_CHECKPOINT_COMMIT =
  "8886b17a903a85d3cda0acd2dfc1558fb3dbe455";
export const PLAN040_PACKAGE_13_ACCEPTANCE_COMMIT =
  "2dd00a82dc8fda3083e93e0a07eeff802d3c3a2f";
export const PLAN040_PACKAGE_13_PERSISTENCE_COMMIT =
  "748c3692577e64e82ed4044e31fb44af64a3477a";
export const PLAN040_PACKAGE_13_PROJECTION_REPAIR_COMMIT =
  "a59e117c99101c4bbec8cd76b3eaffe25b25effe";
export const PLAN040_PACKAGE_13_FAILURE_SIGNATURE_SHA256 =
  "d111d493e9a52cb9f14704fc73e3b7679bd7abdbfea5cd20ba604f310b26ea0b";

const sharedTrustRepairChain = [
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
] as const;

const packageArtifacts = {
  evidence: {
    path: `${RISK_ROOT}/plan-040-qbnr-bus-stop-package-13-evidence-v1.json`,
    sha256: PLAN040_PACKAGE_13_EVIDENCE_SHA256,
  },
  draft: {
    path:
      `${RISK_ROOT}/plan-040-qbnr-bus-stop-package-13-evidence-draft-v1.json`,
    sha256: PLAN040_PACKAGE_13_DRAFT_SHA256,
  },
  comparison_receipt: {
    path:
      "data/quality/acquisition/receipts/member-extent-evidence/" +
      "plan-040-qbnr-bus-stop-package-13-full-stop-comparisons-v1.json",
    sha256: PLAN040_PACKAGE_13_COMPARISON_RECEIPT_SHA256,
  },
  source_gap_receipt: {
    path:
      "data/quality/acquisition/receipts/member-extent-evidence/" +
      "plan-040-qbnr-bus-stop-package-13-source-gap-blocks-v1.json",
    sha256: PLAN040_PACKAGE_13_SOURCE_GAP_RECEIPT_SHA256,
  },
  gate: {
    path:
      `${RISK_ROOT}/plan-040-qbnr-bus-stop-package-13-dual-review-gate-v1.json`,
    sha256: PLAN040_PACKAGE_13_GATE_SHA256,
  },
  acceptance: {
    path:
      `${RISK_ROOT}/plan-040-qbnr-bus-stop-package-13-owner-acceptance-v1.json`,
    sha256: PLAN040_PACKAGE_13_ACCEPTANCE_SHA256,
  },
  extent_decisions: {
    path:
      "data/quality/operational-reference/member-extent-ledger-decisions/" +
      "plan-040-qbnr-bus-stop-package-13-v1.json",
    sha256: PLAN040_PACKAGE_13_EXTENT_DECISIONS_SHA256,
  },
  grain_decisions: {
    path:
      "data/quality/operational-reference/member-grain-decisions/" +
      "plan-040-qbnr-bus-stop-package-13-v1.json",
    sha256: PLAN040_PACKAGE_13_GRAIN_DECISIONS_SHA256,
  },
  source_gap_overlay: {
    path:
      "data/quality/operational-reference/member-source-gap-overlays/" +
      "plan-040-qbnr-bus-stop-package-13-v1.json",
    sha256: PLAN040_PACKAGE_13_SOURCE_GAP_OVERLAY_SHA256,
  },
} as const;

const projectionArtifacts = {
  extent_ledger: {
    path: "data/quality/operational-reference/member-extent-ledger.jsonl",
    sha256: PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.extent_ledger,
  },
  grain_ledger: {
    path: "data/quality/operational-reference/member-grain-ledger.jsonl",
    sha256: PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.grain_ledger,
  },
  bridge_ledger: {
    path: "data/quality/study-readiness/v1/bridge-ledger.jsonl",
    sha256: PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.bridge_ledger,
  },
  bridge_summary: {
    path: "data/quality/study-readiness/v1/bridge-summary.json",
    sha256: PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.bridge_summary,
  },
  consumer_priority_manifest: {
    path: "data/quality/study-readiness/v1/consumer-priority-manifest.json",
    sha256:
      PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.consumer_priority_manifest,
  },
  study_manifest: {
    path: "data/quality/study-readiness/v1/manifest.json",
    sha256: PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.study_manifest,
  },
  member_extent_contract: {
    path:
      "data/contracts/operational-occurrence-member-extent/v1/" +
      "operational_occurrence_member_extents.jsonl",
    sha256: PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.member_extent_contract,
  },
  member_extent_manifest: {
    path:
      "data/contracts/operational-occurrence-member-extent/v1/manifest.json",
    sha256: PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.member_extent_manifest,
  },
  member_extent_review_ledger: {
    path:
      "data/contracts/operational-occurrence-member-extent/v1/" +
      "review-ledger.jsonl",
    sha256:
      PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.member_extent_review_ledger,
  },
  member_extent_summary: {
    path:
      "data/contracts/operational-occurrence-member-extent/v1/summary.json",
    sha256: PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.member_extent_summary,
  },
  operational_occurrences: {
    path: "data/exports/releases/v1-rc26/operational_occurrences.jsonl",
    sha256: PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.operational_occurrences,
  },
  operational_occurrence_decisions: {
    path:
      "data/exports/releases/v1-rc26/" +
      "operational_occurrence_review_decisions.json",
    sha256:
      PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS
        .operational_occurrence_decisions,
  },
  treatment_components: {
    path: "data/canonical/treatment_components.jsonl",
    sha256: PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.treatment_components,
  },
  reviewed_candidate_packets: {
    path:
      "data/quality/study-readiness/v1/research/" +
      "reviewed-candidate-packets.jsonl",
    sha256:
      PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.reviewed_candidate_packets,
  },
} as const;

const package14ProjectionArtifacts = Object.fromEntries(
  Object.entries(projectionArtifacts).map(([name, artifact]) => [
    name,
    {
      path: artifact.path,
      sha256:
        PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS[
          name as keyof typeof PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS
        ],
    },
  ]),
) as Record<string, { path: string; sha256: string }>;

const package15ProjectionArtifacts = Object.fromEntries(
  Object.entries(projectionArtifacts).map(([name, artifact]) => [
    name,
    {
      path: artifact.path,
      sha256:
        PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS[
          name as keyof typeof PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS
        ],
    },
  ]),
) as Record<string, { path: string; sha256: string }>;
const plan041ProjectionArtifacts = Object.fromEntries(
  Object.entries(projectionArtifacts).map(([name, artifact]) => [
    name,
    {
      path: artifact.path,
      sha256:
        PLAN041_POST_CLOSURE_PROJECTION_PINS[
          name as keyof typeof PLAN041_POST_CLOSURE_PROJECTION_PINS
        ],
    },
  ]),
) as Record<string, { path: string; sha256: string }>;

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

const currentCounts: TestCounts = {
  pass: 1875,
  skip: 1,
  fail: 9,
  error: 1,
  test_count: 1885,
  test_file_count: 162,
  expect_call_count: 612902,
};

const expectedExtentHistogram = {
  absent_in_source: 165,
  blocked_upstream: 10,
  bounded_segment: 47,
  route_wide: 14,
  stop_set: 7,
  unreviewed: 65,
} as const;

const expectedGrainHistogram = {
  absent_in_source: 165,
  blocked_upstream: 19,
  not_applicable: 2,
  resolved: 57,
  unreviewed: 65,
} as const;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function artifactSha256(rootDir: string, path: string): string {
  return sha256(readFileSync(resolve(rootDir, path)));
}

function assertPinnedArtifacts(
  rootDir: string,
  artifacts: Record<string, { path: string; sha256: string }>,
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

function pinnedArtifactsMatch(
  rootDir: string,
  artifacts: Record<string, { path: string; sha256: string }>,
): boolean {
  return Object.values(artifacts).every((artifact) =>
    artifactSha256(rootDir, artifact.path) === artifact.sha256
  );
}

function readImmutableCheckpointForSuccessorReplay(
  rootDir: string,
): Record<string, unknown> {
  const path = resolve(rootDir, PLAN040_PACKAGE_13_CHECKPOINT_PATH);
  const bytes = readFileSync(path);
  if (sha256(bytes) !== PLAN040_PACKAGE_13_CHECKPOINT_SHA256) {
    throw new Error(
      "Package 13 historical checkpoint drifted during successor replay",
    );
  }
  return JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
}

function readJsonl(rootDir: string, path: string): Array<Record<string, unknown>> {
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
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) =>
    left.localeCompare(right)));
}

function same(left: unknown, right: unknown): boolean {
  return stableJson(left as JsonValue) === stableJson(right as JsonValue);
}

export function buildPlan040Package13Checkpoint(
  rootDir = repoRoot,
): Record<string, unknown> {
  assertPinnedArtifacts(rootDir, packageArtifacts);
  if (
    pinnedArtifactsMatch(rootDir, package14ProjectionArtifacts) ||
    pinnedArtifactsMatch(rootDir, package15ProjectionArtifacts) ||
    pinnedArtifactsMatch(rootDir, plan041ProjectionArtifacts)
  ) {
    return readImmutableCheckpointForSuccessorReplay(rootDir);
  }
  assertPinnedArtifacts(rootDir, projectionArtifacts);
  const previousPath = resolve(rootDir, PLAN040_PACKAGE_12_CHECKPOINT_PATH);
  const previousBytes = readFileSync(previousPath);
  if (sha256(previousBytes) !== PLAN040_PACKAGE_12_CHECKPOINT_SHA256) {
    throw new Error("Package 12 checkpoint SHA-256 drifted");
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

  const extentHistogram = histogram(
    readJsonl(rootDir, projectionArtifacts.extent_ledger.path),
    (row) => {
      const verdict = String(row.verdict);
      if (verdict.startsWith("blocked_upstream:")) return "blocked_upstream";
      if (verdict.startsWith("resolved:")) return verdict.slice(9);
      return verdict;
    },
  );
  const grainHistogram = histogram(
    readJsonl(rootDir, projectionArtifacts.grain_ledger.path),
    (row) => {
      const verdict = String(row.verdict);
      return verdict.startsWith("blocked_upstream:")
        ? "blocked_upstream"
        : verdict;
    },
  );
  if (
    !same(extentHistogram, expectedExtentHistogram) ||
    !same(grainHistogram, expectedGrainHistogram)
  ) {
    throw new Error("Package 13 ledger histogram drifted");
  }

  const countDeltas = Object.fromEntries(
    Object.entries(currentCounts).map(([key, value]) => [
      key,
      value - previous.full_repository_checkpoint.counts[
        key as keyof TestCounts
      ],
    ]),
  );
  return {
    schema_version: 1,
    receipt_id: "plan-040-package-13-checkpoint-v1",
    recorded_at: "2026-07-24T22:19:36Z",
    recorded_by: "codex-plan040-executor",
    checkpoint_scope: {
      checkpoint_reason: "accepted_31_closure_and_shared_semantics_checkpoint",
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
        reviewed_commit: PLAN040_PACKAGE_13_APPROVED_COMMIT,
        acceptance_commit: PLAN040_PACKAGE_13_ACCEPTANCE_COMMIT,
        persistence_commit: PLAN040_PACKAGE_13_PERSISTENCE_COMMIT,
        artifacts: packageArtifacts,
      },
      shared_semantics_repair: {
        trust_repair_chain: sharedTrustRepairChain,
        projection_repair_commit:
          PLAN040_PACKAGE_13_PROJECTION_REPAIR_COMMIT,
        final_dual_review: {
          reviewed_commit: PLAN040_PACKAGE_13_CHECKPOINT_COMMIT,
          reviewer_results: ["APPROVE", "APPROVE"],
          verdict: "APPROVE/APPROVE",
        },
      },
    },
    full_repository_checkpoint: {
      commit: PLAN040_PACKAGE_13_CHECKPOINT_COMMIT,
      command: "bun run test",
      runner: "bun test v1.3.14 (0d9b296a)",
      duration_seconds: 621.75,
      exit_code: 1,
      counts: currentCounts,
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
      count_deltas_from_package_12_checkpoint: countDeltas,
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
      plan040_package_13: {
        closure_count: 31,
        global_open_candidate_count: 65,
        shared_semantics_repaired: true,
        final_dual_review: "APPROVE/APPROVE",
        status: "pass",
        additional_failures: 0,
      },
    },
    current_projection: {
      artifacts: projectionArtifacts,
      member_extent_histogram: extentHistogram,
      member_grain_histogram: grainHistogram,
    },
    authority: {
      nonauthorizing_checkpoint_receipt: true,
      authorizes_decision_persistence: false,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      changes_evidence_outcomes: false,
      changes_ontology_or_grain: false,
      changes_shared_validation_or_materialization_semantics: false,
    },
  };
}

export function writePlan040Package13Checkpoint(options: {
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
    options.outputPath ?? PLAN040_PACKAGE_13_CHECKPOINT_PATH,
  );
  const checkpoint = buildPlan040Package13Checkpoint(rootDir);
  const bytes = `${stableJson(checkpoint as JsonValue)}\n`;
  if (options.check) {
    if (!existsSync(path)) {
      throw new Error(`${path}: Package 13 checkpoint is missing`);
    }
    const actual = readFileSync(path, "utf8");
    if (actual !== bytes) {
      throw new Error(`${path}: Package 13 checkpoint is stale`);
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
  return { path, sha256: sha256(bytes), checkpoint };
}
