import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  buildPlan040QbnrStopRemovalAcquisitionManifest,
  plan040QbnrAcquisitionReplayHash,
} from "../packages/pipeline/src/quality/plan040-qbnr-stop-removal-acquisition";

const outputPath = resolve(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-stop-removal-acquisition-manifest-v1.json",
);
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const manifest = buildPlan040QbnrStopRemovalAcquisitionManifest({
  ledgerJsonl: read("data/quality/operational-reference/member-extent-ledger.jsonl"),
  treatmentJsonl: read("data/canonical/treatment_components.jsonl"),
  routeTreatmentScopesJsonl: read("data/exports/releases/v1-rc26/route_treatment_scopes.jsonl"),
  sourceBlocksJsonl: read(
    "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
  ),
  sourceHtml: read("raw/sources/mta_queens_bus_network_redesign_service_changes/source.html"),
  sourceMetadata: JSON.parse(read(
    "raw/sources/mta_queens_bus_network_redesign_service_changes/metadata.json",
  )) as unknown,
});
const bytes = `${stableJson(manifest as unknown as JsonValue)}\n`;
if (process.argv.includes("--check")) {
  if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== bytes) {
    throw new Error("Plan 040 QBNR stop-removal acquisition manifest is stale");
  }
} else {
  writeFileSync(outputPath, bytes);
}
console.log(JSON.stringify({
  output_path: outputPath,
  replay_sha256: plan040QbnrAcquisitionReplayHash(manifest),
  candidate_count: manifest.candidate_count,
  key_count: manifest.key_count,
  candidate_key_sha256: manifest.candidate_key_sha256,
  phase_feed_distribution: manifest.phase_feed_distribution,
  decision_count: manifest.decision_count,
}));
