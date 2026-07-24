import { existsSync } from "node:fs";
import { fileSha256 } from
  "../packages/pipeline/src/reference/snapshot-registry";
import {
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_ABSENCE_RECEIPT_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_EXTENT_DECISIONS_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_GRAIN_DECISIONS_PATH,
  acceptPlan040Package10cDecisionPackage,
} from
  "../packages/pipeline/src/quality/plan040-qbnr-service-pattern-package10c-closeout";

const check = process.argv.includes("--check");
if (
  check &&
  (
    !existsSync(PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_EXTENT_DECISIONS_PATH) ||
    !existsSync(PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_GRAIN_DECISIONS_PATH) ||
    !existsSync(PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_ABSENCE_RECEIPT_PATH)
  )
) {
  throw new Error("Plan 040 Package 10C persistence artifacts are missing");
}
const result = acceptPlan040Package10cDecisionPackage();
if (
  result.extentDecisionSha256 !== fileSha256(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_EXTENT_DECISIONS_PATH,
  ) ||
  result.grainDecisionSha256 !== fileSha256(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_GRAIN_DECISIONS_PATH,
  ) ||
  result.absenceReceiptSha256 !== fileSha256(
    PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10C_ABSENCE_RECEIPT_PATH,
  )
) {
  throw new Error("Plan 040 Package 10C persistence replay drifted");
}

console.log(JSON.stringify({
  status: check ? "checked" : "persisted",
  extent: {
    path: result.extentDecisionPath,
    sha256: result.extentDecisionSha256,
    count: result.extentDecisionCount,
  },
  grain: {
    path: result.grainDecisionPath,
    sha256: result.grainDecisionSha256,
    count: result.grainDecisionCount,
  },
  reviewed_absence: {
    path: result.absenceReceiptPath,
    sha256: result.absenceReceiptSha256,
    candidate_count: result.absenceCandidateCount,
  },
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
}));
