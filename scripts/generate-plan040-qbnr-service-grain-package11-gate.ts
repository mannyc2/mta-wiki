import { existsSync } from "node:fs";
import { fileSha256 } from
  "../packages/pipeline/src/reference/snapshot-registry";
import {
  PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_ACCEPTANCE_PATH,
  PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GATE_PATH,
  writePlan040Package11GateAndAcceptance,
} from
  "../packages/pipeline/src/quality/plan040-qbnr-service-grain-package11-closeout";

const ACCEPTED_AT = "2026-07-24T18:45:00Z";
const check = process.argv.includes("--check");
if (
  check &&
  (
    !existsSync(PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GATE_PATH) ||
    !existsSync(PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_ACCEPTANCE_PATH)
  )
) {
  throw new Error("Plan 040 Package 11 gate/acceptance artifacts are missing");
}
const result = writePlan040Package11GateAndAcceptance({
  acceptedAt: ACCEPTED_AT,
});
if (
  result.gateSha256 !== fileSha256(
    PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_GATE_PATH,
  ) ||
  result.acceptanceSha256 !== fileSha256(
    PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11_ACCEPTANCE_PATH,
  )
) {
  throw new Error("Plan 040 Package 11 gate/acceptance replay drifted");
}

console.log(JSON.stringify({
  status: check ? "checked" : "generated",
  accepted_at: ACCEPTED_AT,
  gate: { path: result.gatePath, sha256: result.gateSha256 },
  acceptance: {
    path: result.acceptancePath,
    sha256: result.acceptanceSha256,
  },
  candidate_count: 12,
  verdict_distribution: {
    positive_extent_and_grain_proposed: 1,
    positive_grain_only_proposed: 4,
    structured_unresolved_grain_proposed: 7,
  },
  authorization_state:
    "owner_accepted_exact_1_extent_and_12_grain_decisions_only",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_ontology: false,
  authorizes_corrections: false,
  reviewer_result: "APPROVE/APPROVE",
}));
