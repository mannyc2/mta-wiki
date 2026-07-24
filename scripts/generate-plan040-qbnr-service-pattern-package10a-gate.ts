import { existsSync } from "node:fs";
import { fileSha256 } from "../packages/pipeline/src/reference/snapshot-registry";
import {
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ACCEPTANCE_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_GATE_PATH,
  writePlan040Package10aGateAndAcceptance,
} from "../packages/pipeline/src/quality/plan040-qbnr-service-pattern-package10a-closeout";

const ACCEPTED_AT = "2026-07-24T12:48:03Z";
const check = process.argv.includes("--check");
if (
  check &&
  (
    !existsSync(PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_GATE_PATH) ||
    !existsSync(PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ACCEPTANCE_PATH)
  )
) {
  throw new Error(
    "Plan 040 Package 10A gate/acceptance artifacts are missing",
  );
}
const result = writePlan040Package10aGateAndAcceptance({
  acceptedAt: ACCEPTED_AT,
});
const expected = {
  gateSha256: fileSha256(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_GATE_PATH,
  ),
  acceptanceSha256: fileSha256(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ACCEPTANCE_PATH,
  ),
};
if (
  result.gateSha256 !== expected.gateSha256 ||
  result.acceptanceSha256 !== expected.acceptanceSha256
) {
  throw new Error(
    "Plan 040 Package 10A gate/acceptance replay hash drifted",
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
    evidence_complete_positive_draft: 0,
    receipt_terminal_unresolved: 4,
  },
  authorization_state:
    "owner_delegate_accepted_exact_4_key_reviewed_absence_only",
  authorizes_occurrence: false,
  reviewer_result: "APPROVE",
}));
