import { existsSync } from "node:fs";
import { fileSha256 } from
  "../packages/pipeline/src/reference/snapshot-registry";
import {
  PLAN040_QBNR_BUS_STOP_PACKAGE_13_ACCEPTANCE_PATH,
  PLAN040_QBNR_BUS_STOP_PACKAGE_13_GATE_PATH,
  writePlan040Package13GateAndAcceptance,
} from
  "../packages/pipeline/src/quality/plan040-qbnr-bus-stop-package13-closeout";

const ACCEPTED_AT = "2026-07-24T20:45:00Z";
const check = process.argv.includes("--check");
if (
  check &&
  (
    !existsSync(PLAN040_QBNR_BUS_STOP_PACKAGE_13_GATE_PATH) ||
    !existsSync(PLAN040_QBNR_BUS_STOP_PACKAGE_13_ACCEPTANCE_PATH)
  )
) {
  throw new Error("Plan 040 Package 13 gate/acceptance artifacts are missing");
}
const result = writePlan040Package13GateAndAcceptance({
  acceptedAt: ACCEPTED_AT,
});
if (
  result.gateSha256 !== fileSha256(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_GATE_PATH,
  ) ||
  result.acceptanceSha256 !== fileSha256(
    PLAN040_QBNR_BUS_STOP_PACKAGE_13_ACCEPTANCE_PATH,
  )
) {
  throw new Error("Plan 040 Package 13 gate/acceptance replay drifted");
}

console.log(JSON.stringify({
  status: check ? "checked" : "generated",
  accepted_at: ACCEPTED_AT,
  gate: { path: result.gatePath, sha256: result.gateSha256 },
  acceptance: {
    path: result.acceptancePath,
    sha256: result.acceptanceSha256,
  },
  candidate_count: 31,
  verdict_distribution: {
    positive_extent_and_grain_proposed: 19,
    positive_extent_proposed_grain_blocked: 2,
    source_gap_blocked_extent_and_grain: 10,
    source_gap_block_receipt: 12,
    exact_absence: 0,
  },
  authorization_state:
    "owner_accepted_exact_21_extent_21_grain_and_12_source_gap_overlays_only",
  reviewer_result: "APPROVE/APPROVE",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_ontology: false,
  authorizes_corrections: false,
}));
