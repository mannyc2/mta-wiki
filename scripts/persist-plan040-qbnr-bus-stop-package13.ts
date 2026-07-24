import { existsSync } from "node:fs";
import { fileSha256 } from
  "../packages/pipeline/src/reference/snapshot-registry";
import {
  PLAN040_QBNR_BUS_STOP_PACKAGE_13_EXTENT_DECISIONS_PATH,
  PLAN040_QBNR_BUS_STOP_PACKAGE_13_GRAIN_DECISIONS_PATH,
  PLAN040_QBNR_BUS_STOP_PACKAGE_13_SOURCE_GAP_OVERLAY_PATH,
  acceptPlan040Package13DecisionPackage,
} from
  "../packages/pipeline/src/quality/plan040-qbnr-bus-stop-package13-closeout";

const check = process.argv.includes("--check");
if (
  check &&
  (
    !existsSync(PLAN040_QBNR_BUS_STOP_PACKAGE_13_EXTENT_DECISIONS_PATH) ||
    !existsSync(PLAN040_QBNR_BUS_STOP_PACKAGE_13_GRAIN_DECISIONS_PATH) ||
    !existsSync(PLAN040_QBNR_BUS_STOP_PACKAGE_13_SOURCE_GAP_OVERLAY_PATH)
  )
) {
  throw new Error("Plan 040 Package 13 persistence artifacts are missing");
}
const result = acceptPlan040Package13DecisionPackage();
if (
  result.extentDecisionSha256 !== fileSha256(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_EXTENT_DECISIONS_PATH,
  ) ||
  result.grainDecisionSha256 !== fileSha256(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_GRAIN_DECISIONS_PATH,
  ) ||
  result.sourceGapOverlaySha256 !== fileSha256(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_SOURCE_GAP_OVERLAY_PATH,
  )
) {
  throw new Error("Plan 040 Package 13 persistence replay drifted");
}

console.log(JSON.stringify({
  status: check ? "checked" : "persisted",
  extent: {
    path: result.extentDecisionPath,
    sha256: result.extentDecisionSha256,
    count: result.extentDecisionCount,
    distribution: { bounded_segment: 18, stop_set: 3 },
  },
  grain: {
    path: result.grainDecisionPath,
    sha256: result.grainDecisionSha256,
    count: result.grainDecisionCount,
    distribution: { trip_subset: 19, unresolved: 2 },
  },
  source_gap_overlay: {
    path: result.sourceGapOverlayPath,
    sha256: result.sourceGapOverlaySha256,
    count: result.sourceGapOverlayCount,
    extent_blocked_upstream: 10,
    grain_blocked_upstream: 12,
  },
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_ontology: false,
  authorizes_corrections: false,
}));
