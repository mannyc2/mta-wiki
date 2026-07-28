import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rebuildResolvedTransitDb } from "../packages/db/src/resolved-transit-db.js";
import { buildProductionInterventionPlacements } from "../packages/pipeline/src/materialize/intervention-placement-build.js";
import { buildProductionResolvedInterventions } from "../packages/pipeline/src/materialize/resolved-interventions.js";

const asOfIndex = process.argv.indexOf("--as-of");
const asOf = asOfIndex >= 0 ? process.argv[asOfIndex + 1] : undefined;
if (!asOf || !/^\d{4}-\d{2}-\d{2}$/u.test(asOf)) {
  throw new Error("--as-of requires YYYY-MM-DD");
}

const directory = mkdtempSync(join(tmpdir(), "mta-resolved-transit-determinism-"));
try {
  const model = buildProductionResolvedInterventions();
  const placement = buildProductionInterventionPlacements(asOf);
  const snapshot = {
    ...model,
    placements: placement.registry,
    placement_transitions: placement.transitions,
    placement_frontier: placement.frontier.candidate_ledger,
    placement_reconciliation: placement.frontier.transition_reconciliation,
    documentary_lifecycle_observations: placement.documentary_lifecycle_observations,
    lifecycle_assertions: placement.lifecycle.assertions,
    placement_states_as_of: placement.lifecycle.states,
    current_footprint: placement.lifecycle.footprint,
  };
  const first = rebuildResolvedTransitDb(snapshot, { path: join(directory, "first.db") });
  const second = rebuildResolvedTransitDb(snapshot, { path: join(directory, "second.db") });
  if (first.schemaSha256 !== second.schemaSha256 || first.dataSha256 !== second.dataSha256) {
    throw new Error("resolved transit rebuilds are not deterministic");
  }
  console.log(
    `Resolved transit determinism verified as of ${asOf}: ` +
    `${first.episodeCount} episodes, ${first.applicationCount} applications, ` +
    `schema ${first.schemaSha256}, data ${first.dataSha256}.`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
