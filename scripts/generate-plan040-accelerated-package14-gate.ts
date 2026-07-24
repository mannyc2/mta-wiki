import { existsSync } from "node:fs";
import {
  PLAN040_PACKAGE_14_ACCEPTANCE_PATH,
  PLAN040_PACKAGE_14_COMPARISON_PATH,
  PLAN040_PACKAGE_14_GATE_PATH,
  PLAN040_PACKAGE_14_PERSISTENCE_EVIDENCE_PATH,
  PLAN040_PACKAGE_14_SOURCE_GAP_BLOCK_PATH,
  validatePlan040Package14GateAndAcceptance,
} from
  "../packages/pipeline/src/quality/plan040-accelerated-package14-closeout";

const check = process.argv.includes("--check");
const paths = [
  PLAN040_PACKAGE_14_GATE_PATH,
  PLAN040_PACKAGE_14_COMPARISON_PATH,
  PLAN040_PACKAGE_14_SOURCE_GAP_BLOCK_PATH,
  PLAN040_PACKAGE_14_PERSISTENCE_EVIDENCE_PATH,
  PLAN040_PACKAGE_14_ACCEPTANCE_PATH,
];
if (check && paths.some((path) => !existsSync(path))) {
  throw new Error("Plan 040 Package 14 gate/acceptance artifacts are missing");
}
const result = validatePlan040Package14GateAndAcceptance();
console.log(JSON.stringify({
  status: check ? "checked" : "generated",
  gate: result.gate,
  acceptance: result.acceptance,
  source_gap_receipt: result.sourceGapReceipt,
  candidate_count: result.candidateCount,
  verdict_distribution: result.verdictDistribution,
  authorization_state: result.authorizationState,
  reviewer_result: result.reviewerResult,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_ontology: false,
  authorizes_corrections: false,
}));
