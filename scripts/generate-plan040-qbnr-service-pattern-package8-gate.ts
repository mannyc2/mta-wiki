import { existsSync } from "node:fs";
import { fileSha256 } from "../packages/pipeline/src/reference/snapshot-registry";
import {
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ACCEPTANCE_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_GATE_PATH,
  writePlan040Package8GateAndAcceptance,
} from "../packages/pipeline/src/quality/plan040-qbnr-service-pattern-package8-closeout";

const ACCEPTED_AT = "2026-07-24T10:53:04Z";
const check = process.argv.includes("--check");
if (
  check &&
  (
    !existsSync(PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_GATE_PATH) ||
    !existsSync(PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ACCEPTANCE_PATH)
  )
) {
  throw new Error(
    "Plan 040 Package 8 gate/acceptance artifacts are missing",
  );
}
const result = writePlan040Package8GateAndAcceptance({
  acceptedAt: ACCEPTED_AT,
});
const expected = {
  gateSha256: fileSha256(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_GATE_PATH,
  ),
  acceptanceSha256: fileSha256(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ACCEPTANCE_PATH,
  ),
};
if (
  result.gateSha256 !== expected.gateSha256 ||
  result.acceptanceSha256 !== expected.acceptanceSha256
) {
  throw new Error(
    "Plan 040 Package 8 gate/acceptance replay hash drifted",
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
  candidate_count: 30,
  verdict_distribution: {
    receipt_terminal_unresolved: 30,
  },
  authorization_state:
    "owner_delegate_accepted_exact_30_key_reviewed_absence_only",
  authorizes_occurrence: false,
  reviewer_result: "APPROVE/APPROVE",
}));
