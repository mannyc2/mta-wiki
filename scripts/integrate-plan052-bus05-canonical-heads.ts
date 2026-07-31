import {
  runPlan052PositiveIntegration,
  type Plan052PositiveIntegrationConfig,
} from "./lib/plan052-positive-integration";

const config: Plan052PositiveIntegrationConfig = {
  integration_id: "bus05-canonical-heads",
  accepted_at: "2026-07-30T20:45:00.000Z",
  issued_at_prefix: "2026-07-30T20:44:",
  positives: [],
  aliases: [
    {
      batch_id: "w2-bus-priority-pending-05",
      candidate_id: "candidate:d471464e7817be4850e6a242",
      canonical_candidate_id: "candidate:6598e41cd21efb8735aa3f39",
      rationale:
        "Cross-batch reconciliation proves this November 17, 2013 B44 SBS launch flyer co-refers to the already-published B44 launch head. Its enumerated launch features remain pinned evidence for later application refinement; publishing a second episode would duplicate producer identity.",
    },
    {
      batch_id: "w2-bus-priority-pending-05",
      candidate_id: "candidate:ebeb5f6a9d27e8aa573206f8",
      canonical_candidate_id: "candidate:34d408b4c685ffec2d79dda7",
      rationale:
        "Cross-batch reconciliation proves this June 30, 2013 Bx41 SBS newsletter observation co-refers to the already-published Bx41 launch head. Its three launch features remain documentary evidence without creating a duplicate public episode.",
    },
    {
      batch_id: "w2-bus-priority-pending-05",
      candidate_id: "candidate:f1997dcaddce865247e3956a",
      canonical_candidate_id: "candidate:6f4acd2ef6c371f69722e4bc",
      rationale:
        "Cross-batch reconciliation proves this September 2012 S79 implementation observation co-refers to the already-published September 2 S79 launch head. Its bus-lane, signal-priority, and service-pattern evidence remains available for Plan 053 refinement; a second episode would duplicate the same route launch identity.",
    },
  ],
};

const mode = process.argv[2];
if ((mode !== "--write" && mode !== "--check") || process.argv.length !== 3) {
  throw new Error(
    "usage: bun scripts/integrate-plan052-bus05-canonical-heads.ts --write|--check",
  );
}
runPlan052PositiveIntegration(config, mode);
console.log(
  `Plan 052 Bus05 canonical heads ${
    mode === "--write" ? "applied" : "verified"
  }: 3 duplicate aliases.`,
);
