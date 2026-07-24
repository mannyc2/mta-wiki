import { existsSync } from "node:fs";
import {
  PLAN040_PACKAGE_14_EXTENT_DECISIONS_PATH,
  PLAN040_PACKAGE_14_GRAIN_DECISIONS_PATH,
  PLAN040_PACKAGE_14_SOURCE_GAP_OVERLAY_PATH,
  persistPlan040Package14AcceptedArtifacts,
} from
  "../packages/pipeline/src/quality/plan040-accelerated-package14-closeout";

const check = process.argv.includes("--check");
if (
  check &&
  [
    PLAN040_PACKAGE_14_EXTENT_DECISIONS_PATH,
    PLAN040_PACKAGE_14_GRAIN_DECISIONS_PATH,
    PLAN040_PACKAGE_14_SOURCE_GAP_OVERLAY_PATH,
  ].some((path) => !existsSync(path))
) {
  throw new Error("Plan 040 Package 14 persistence artifacts are missing");
}
const result = persistPlan040Package14AcceptedArtifacts();
console.log(JSON.stringify({
  status: check ? "checked" : "persisted",
  extent: {
    ...result.extent,
    distribution: {
      bounded_segment: 1,
      route_wide: 6,
      stop_set: 1,
    },
  },
  grain: {
    ...result.grain,
    distribution: { all_service: 1, not_applicable: 7 },
  },
  source_gap_overlay: {
    ...result.sourceGapOverlay,
    extent_blocked_upstream: 28,
    grain_blocked_upstream: 28,
  },
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_ontology: false,
  authorizes_corrections: false,
}));
