import { existsSync } from "node:fs";
import { fileSha256 } from
  "../packages/pipeline/src/reference/snapshot-registry";
import {
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ACCEPTANCE_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GATE_PATH,
  writePlan040Package10bGateAndAcceptance,
} from
  "../packages/pipeline/src/quality/plan040-qbnr-service-pattern-package10b-closeout";

const ACCEPTED_AT = "2026-07-24T14:23:38Z";
const check = process.argv.includes("--check");
if (
  check &&
  (
    !existsSync(PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GATE_PATH) ||
    !existsSync(PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ACCEPTANCE_PATH)
  )
) {
  throw new Error(
    "Plan 040 Package 10B gate/acceptance artifacts are missing",
  );
}
const result = writePlan040Package10bGateAndAcceptance({
  acceptedAt: ACCEPTED_AT,
});
const expected = {
  gateSha256: fileSha256(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_GATE_PATH,
  ),
  acceptanceSha256: fileSha256(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_ACCEPTANCE_PATH,
  ),
};
if (
  result.gateSha256 !== expected.gateSha256 ||
  result.acceptanceSha256 !== expected.acceptanceSha256
) {
  throw new Error(
    "Plan 040 Package 10B gate/acceptance replay hash drifted",
  );
}

console.log(JSON.stringify({
  status: check ? "checked" : "generated",
  accepted_at: ACCEPTED_AT,
  gate: {
    path: result.gatePath,
    sha256: result.gateSha256,
  },
  acceptance: {
    path: result.acceptancePath,
    sha256: result.acceptanceSha256,
  },
  candidate_count: 4,
  verdict_distribution: {
    positive_extent_and_grain_proposed: 3,
    receipt_terminal_unresolved_preserved: 1,
  },
  authorization_state:
    "owner_delegate_accepted_exact_3_positive_decision_pairs_and_exact_1_key_preserved_reviewed_absence_only",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  reviewer_result: "APPROVE/APPROVE",
}));
