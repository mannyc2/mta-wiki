import { existsSync } from "node:fs";
import { fileSha256 } from
  "../packages/pipeline/src/reference/snapshot-registry";
import {
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_GATE_PATH,
  writePlan040Package10bPathReviewAndAcceptance,
} from
  "../packages/pipeline/src/quality/plan040-qbnr-service-pattern-package10b-closeout";

const ACCEPTED_AT = "2026-07-24T14:52:52Z";
const check = process.argv.includes("--check");
if (
  check &&
  (
    !existsSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_GATE_PATH,
    ) ||
    !existsSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH,
    )
  )
) {
  throw new Error(
    "Plan 040 Package 10B path-review artifacts are missing",
  );
}
const result = writePlan040Package10bPathReviewAndAcceptance({
  acceptedAt: ACCEPTED_AT,
});
const expected = {
  gateSha256: fileSha256(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_GATE_PATH,
  ),
  acceptanceSha256: fileSha256(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10B_PATH_REVIEW_ACCEPTANCE_PATH,
  ),
};
if (
  result.gateSha256 !== expected.gateSha256 ||
  result.acceptanceSha256 !== expected.acceptanceSha256
) {
  throw new Error(
    "Plan 040 Package 10B path-review replay hash drifted",
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
  reviewed_commit:
    "bf8a2e9692c8654a5d16ce5ce4bc093e549feffd",
  reviewer_result: "APPROVE/APPROVE",
  authorization_state:
    "owner_supplementally_accepted_path_only_amendment_for_combined_validation_with_prior_acceptance",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
}));
