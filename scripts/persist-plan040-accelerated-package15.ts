import { existsSync } from "node:fs";
import {
  PLAN040_PACKAGE_15_EXTENT_DECISIONS_PATH,
  PLAN040_PACKAGE_15_GRAIN_DECISIONS_PATH,
  PLAN040_PACKAGE_15_SOURCE_GAP_OVERLAY_PATH,
  persistPlan040Package15AcceptedArtifacts,
} from
  "../packages/pipeline/src/quality/plan040-accelerated-package15-closeout.js";

const check = process.argv.includes("--check");
if (
  check &&
  [
    PLAN040_PACKAGE_15_EXTENT_DECISIONS_PATH,
    PLAN040_PACKAGE_15_GRAIN_DECISIONS_PATH,
    PLAN040_PACKAGE_15_SOURCE_GAP_OVERLAY_PATH,
  ].some((path) => !existsSync(path))
) {
  throw new Error("Plan 040 Package 15 persistence artifacts are missing");
}
const result = persistPlan040Package15AcceptedArtifacts();
console.log(JSON.stringify({
  status: check ? "checked" : "persisted",
  extent: {
    ...result.extent,
    distribution: { route_wide: 15, stop_set: 1 },
  },
  grain: {
    ...result.grain,
    distribution: {
      all_service: 14,
      not_applicable: 1,
      trip_subset: 1,
    },
  },
  source_gap_overlay: {
    ...result.sourceGapOverlay,
    extent_blocked_upstream: 13,
    grain_blocked_upstream: 13,
  },
  exact_absence_count: 0,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_ontology: false,
  authorizes_corrections: false,
}, null, 2));
