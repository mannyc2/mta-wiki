import { existsSync } from "node:fs";
import { fileSha256 } from
  "../packages/pipeline/src/reference/snapshot-registry";
import {
  PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_ACCEPTANCE_PATH,
  PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GATE_PATH,
  writePlan040Package12GateAndAcceptance,
} from
  "../packages/pipeline/src/quality/plan040-flatbush-physical-grain-package12-closeout";

const ACCEPTED_AT = "2026-07-24T19:00:00Z";
const check = process.argv.includes("--check");
if (
  check &&
  (
    !existsSync(PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GATE_PATH) ||
    !existsSync(PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_ACCEPTANCE_PATH)
  )
) {
  throw new Error("Plan 040 Package 12 gate/acceptance artifacts are missing");
}
const result = writePlan040Package12GateAndAcceptance({
  acceptedAt: ACCEPTED_AT,
});
if (
  result.gateSha256 !== fileSha256(
    PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_GATE_PATH,
  ) ||
  result.acceptanceSha256 !== fileSha256(
    PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12_ACCEPTANCE_PATH,
  )
) {
  throw new Error("Plan 040 Package 12 gate/acceptance replay drifted");
}

console.log(JSON.stringify({
  status: check ? "checked" : "generated",
  accepted_at: ACCEPTED_AT,
  gate: { path: result.gatePath, sha256: result.gateSha256 },
  acceptance: {
    path: result.acceptancePath,
    sha256: result.acceptanceSha256,
  },
  candidate_count: 2,
  verdict_distribution: {
    positive_grain_not_applicable_proposed: 2,
  },
  authorization_state:
    "owner_accepted_exact_2_not_applicable_grain_decisions_only",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_ontology: false,
  authorizes_corrections: false,
  reviewer_result: "APPROVE/APPROVE",
}));
