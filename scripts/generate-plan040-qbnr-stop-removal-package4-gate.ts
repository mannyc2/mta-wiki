import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  buildPlan040Package4GateAndAcceptance,
  PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ACQUISITION_SHA256,
  PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_DRAFT_SHA256,
  PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_EVIDENCE_SHA256,
  type Plan040Package4Draft,
  validatePlan040Package4GateAndAcceptance,
} from "../packages/pipeline/src/quality/plan040-qbnr-stop-removal-package4";

const ACCEPTED_AT = "2026-07-24T05:22:18Z";
const ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-stop-removal-package-4-acquisition-v1.json";
const EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-4-evidence-v1.json";
const DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-4-evidence-draft-v1.json";
const GATE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-4-dual-review-gate-v1.json";
const ACCEPTANCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-4-owner-acceptance-v1.json";

const absolute = (path: string): string => resolve(repoRoot, path);
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const bytes = (value: unknown): string =>
  `${stableJson(value as JsonValue)}\n`;

for (const [path, expected] of [
  [
    ACQUISITION_PATH,
    PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ACQUISITION_SHA256,
  ],
  [EVIDENCE_PATH, PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_EVIDENCE_SHA256],
  [DRAFT_PATH, PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_DRAFT_SHA256],
] as const) {
  const actual = sha256(readFileSync(absolute(path)));
  if (actual !== expected) {
    throw new Error(`${path}: frozen Package 4 artifact hash drifted`);
  }
}

const draft = JSON.parse(
  readFileSync(absolute(DRAFT_PATH), "utf8"),
) as Plan040Package4Draft;
const built = buildPlan040Package4GateAndAcceptance({
  draft,
  acceptedAt: ACCEPTED_AT,
});
validatePlan040Package4GateAndAcceptance({
  draft,
  gate: built.gate,
  acceptance: built.acceptance,
  acceptedAt: ACCEPTED_AT,
});
const gateBytes = bytes(built.gate);
const acceptanceBytes = bytes(built.acceptance);
if (sha256(gateBytes) !== built.gateSha256) {
  throw new Error("Plan 040 Package 4 gate hash calculation drifted");
}
const check = process.argv.includes("--check");
for (const [path, contents] of [
  [GATE_PATH, gateBytes],
  [ACCEPTANCE_PATH, acceptanceBytes],
] as const) {
  if (check) {
    if (
      !existsSync(absolute(path)) ||
      readFileSync(absolute(path), "utf8") !== contents
    ) {
      throw new Error(`${path}: Package 4 gate/acceptance artifact is stale`);
    }
  } else {
    writeFileSync(absolute(path), contents);
  }
}

console.log(JSON.stringify({
  status: check ? "checked" : "generated",
  gate: { path: GATE_PATH, sha256: sha256(gateBytes) },
  acceptance: {
    path: ACCEPTANCE_PATH,
    sha256: sha256(acceptanceBytes),
  },
  candidate_count: built.gate.candidate_count,
  candidate_key_sha256: built.gate.candidate_key_sha256,
  evidence_verdict_distribution: built.gate.evidence_verdict_distribution,
  reviewer_results: built.gate.reviewer_results.map((review) => ({
    reviewer_id: review.reviewer_id,
    verdict: review.verdict,
  })),
  authorized_positive_candidate_count:
    built.acceptance.authorized_positive_persistence.candidate_count,
  authorized_absence_candidate_count:
    built.acceptance.authorized_reviewed_absence_receipt.candidate_count,
  persisted_extent_decision_count:
    built.acceptance.persisted_extent_decision_count,
  persisted_grain_decision_count:
    built.acceptance.persisted_grain_decision_count,
  persisted_absence_receipt_count:
    built.acceptance.persisted_absence_receipt_count,
  authorizes_decision_persistence:
    built.acceptance.authorizes_decision_persistence,
  authorizes_reviewed_absence_receipt_persistence:
    built.acceptance.authorizes_reviewed_absence_receipt_persistence,
  authorizes_occurrence: built.acceptance.authorizes_occurrence,
  authorizes_study: built.acceptance.authorizes_study,
  authorizes_cross_product: built.acceptance.authorizes_cross_product,
}));
