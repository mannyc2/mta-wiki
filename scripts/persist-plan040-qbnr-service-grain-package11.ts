import { existsSync } from "node:fs";
import { fileSha256 } from
  "../packages/pipeline/src/reference/snapshot-registry";
import {
  PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_EXTENT_DECISIONS_PATH,
  PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GRAIN_DECISIONS_PATH,
  acceptPlan040Package11DecisionPackage,
} from
  "../packages/pipeline/src/quality/plan040-qbnr-service-grain-package11-closeout";

const check = process.argv.includes("--check");
if (
  check &&
  (
    !existsSync(PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_EXTENT_DECISIONS_PATH) ||
    !existsSync(PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GRAIN_DECISIONS_PATH)
  )
) {
  throw new Error("Plan 040 Package 11 persistence artifacts are missing");
}
const result = acceptPlan040Package11DecisionPackage();
if (
  result.extentDecisionSha256 !== fileSha256(
    PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_EXTENT_DECISIONS_PATH,
  ) ||
  result.grainDecisionSha256 !== fileSha256(
    PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GRAIN_DECISIONS_PATH,
  )
) {
  throw new Error("Plan 040 Package 11 persistence replay drifted");
}

console.log(JSON.stringify({
  status: check ? "checked" : "persisted",
  extent: {
    path: result.extentDecisionPath,
    sha256: result.extentDecisionSha256,
    count: result.extentDecisionCount,
    distribution: { bounded_segment: 1 },
  },
  grain: {
    path: result.grainDecisionPath,
    sha256: result.grainDecisionSha256,
    count: result.grainDecisionCount,
    distribution: {
      periods: 1,
      trip_subset: 3,
      all_service: 1,
      unresolved: 7,
    },
  },
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_ontology: false,
  authorizes_corrections: false,
}));
