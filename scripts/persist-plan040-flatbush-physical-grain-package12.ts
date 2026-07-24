import { existsSync } from "node:fs";
import { fileSha256 } from
  "../packages/pipeline/src/reference/snapshot-registry";
import {
  PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GRAIN_DECISIONS_PATH,
  acceptPlan040Package12DecisionPackage,
} from
  "../packages/pipeline/src/quality/plan040-flatbush-physical-grain-package12-closeout";

const check = process.argv.includes("--check");
if (
  check &&
  !existsSync(PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GRAIN_DECISIONS_PATH)
) {
  throw new Error("Plan 040 Package 12 persistence artifact is missing");
}
const result = acceptPlan040Package12DecisionPackage();
if (
  result.grainDecisionSha256 !== fileSha256(
    PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GRAIN_DECISIONS_PATH,
  )
) {
  throw new Error("Plan 040 Package 12 persistence replay drifted");
}

console.log(JSON.stringify({
  status: check ? "checked" : "persisted",
  extent: { count: 0, distribution: {} },
  grain: {
    path: result.grainDecisionPath,
    sha256: result.grainDecisionSha256,
    count: result.grainDecisionCount,
    distribution: { not_applicable: 2 },
  },
  raw_source_packet_present: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_ontology: false,
  authorizes_corrections: false,
}));
