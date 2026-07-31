import {
  runPlan052PositiveIntegration,
  type Plan052PositiveIntegrationConfig,
} from "./lib/plan052-positive-integration";

const config: Plan052PositiveIntegrationConfig = {
  integration_id: "bus04-canonical-head",
  accepted_at: "2026-07-30T20:15:00.000Z",
  issued_at_prefix: "2026-07-30T20:14:",
  positives: [],
  aliases: [{
    batch_id: "w2-bus-priority-pending-04",
    candidate_id: "candidate:ae75f12a519804c02aa1a324",
    canonical_candidate_id: "candidate:374fb39566efdd50f59642e3",
    rationale:
      "Cross-batch reconciliation proves this M79 launch slide co-refers to the already-published M79 canonical head. Its four launch features remain pinned documentary evidence, but a second producer episode would duplicate the same May 2017 route launch identity.",
  }],
};

const mode = process.argv[2];
if ((mode !== "--write" && mode !== "--check") || process.argv.length !== 3) {
  throw new Error(
    "usage: bun scripts/integrate-plan052-bus04-canonical-head.ts --write|--check",
  );
}
runPlan052PositiveIntegration(config, mode);
console.log(
  `Plan 052 Bus04 canonical head ${
    mode === "--write" ? "applied" : "verified"
  }: 1 duplicate alias.`,
);
