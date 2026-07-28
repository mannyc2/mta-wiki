import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rebuildResolvedTransitDb } from "../packages/db/src/resolved-transit-db.js";
import { buildProductionResolvedInterventions } from "../packages/pipeline/src/materialize/resolved-interventions.js";

const asOfIndex = process.argv.indexOf("--as-of");
const asOf = asOfIndex >= 0 ? process.argv[asOfIndex + 1] : undefined;
if (asOfIndex >= 0 && (!asOf || !/^\d{4}-\d{2}-\d{2}$/u.test(asOf))) {
  throw new Error("--as-of requires YYYY-MM-DD");
}

const directory = mkdtempSync(join(tmpdir(), "mta-resolved-transit-determinism-"));
try {
  const model = buildProductionResolvedInterventions();
  const first = rebuildResolvedTransitDb(model, { path: join(directory, "first.db") });
  const second = rebuildResolvedTransitDb(model, { path: join(directory, "second.db") });
  if (first.schemaSha256 !== second.schemaSha256 || first.dataSha256 !== second.dataSha256) {
    throw new Error("resolved transit rebuilds are not deterministic");
  }
  console.log(
    `Resolved transit determinism verified${asOf ? ` as of ${asOf}` : ""}: ` +
    `${first.episodeCount} episodes, ${first.applicationCount} applications, ` +
    `schema ${first.schemaSha256}, data ${first.dataSha256}.`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
