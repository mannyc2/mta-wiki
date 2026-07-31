import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import {
  loadOperationalOccurrenceIdentityOperations,
  operationalOccurrenceIdentityRegistryV2Jsonl,
  replayOperationalOccurrenceIdentityOperations,
} from "../packages/pipeline/src/materialize/operational-occurrence-identity-operations";

const migrationOperationsDir = join(
  repoRoot,
  "data",
  "operational-occurrence-identities",
  "operations",
);
const acceptedOperationsDir = join(
  repoRoot,
  "data",
  "operational-occurrence-identities",
  "accepted-current",
  "operations",
);
const outputPath = join(
  repoRoot,
  "data",
  "operational-occurrence-identities",
  "registry-current.jsonl",
);
const migrationRegistryPath = join(
  repoRoot,
  "data",
  "operational-occurrence-identities",
  "registry-v2.jsonl",
);

const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check") {
  throw new Error(
    "usage: bun scripts/replay-operational-occurrence-identity-current.ts --write|--check",
  );
}
const unknown = process.argv.slice(3);
if (unknown.length > 0) throw new Error(`unknown argument(s): ${unknown.join(", ")}`);
const hasAcceptedCurrent = existsSync(acceptedOperationsDir);
if (!hasAcceptedCurrent && existsSync(outputPath)) {
  throw new Error(
    "operational occurrence identity registry-current exists without accepted-current operations",
  );
}
const acceptedOperations = hasAcceptedCurrent
  ? loadOperationalOccurrenceIdentityOperations(acceptedOperationsDir)
  : [];
if (hasAcceptedCurrent && acceptedOperations.length === 0) {
  throw new Error(
    "accepted-current occurrence identity operation directory must not be empty",
  );
}
const operations = [
  ...loadOperationalOccurrenceIdentityOperations(migrationOperationsDir),
  ...acceptedOperations,
];
const content = operationalOccurrenceIdentityRegistryV2Jsonl(
  replayOperationalOccurrenceIdentityOperations(operations),
);
if (mode === "--write" && hasAcceptedCurrent) {
  writeFileSync(outputPath, content, "utf8");
} else {
  const targetPath = hasAcceptedCurrent ? outputPath : migrationRegistryPath;
  if (!existsSync(targetPath) || readFileSync(targetPath, "utf8") !== content) {
    throw new Error(
      hasAcceptedCurrent
        ? "operational occurrence identity registry-current is stale against accepted-current replay"
        : "historical operational occurrence identity registry-v2 is stale against migration replay",
    );
  }
}
if (mode === "--write" && !hasAcceptedCurrent) {
  // A no-op by design: there is no current layer to write, and the historical
  // migration registry remains an immutable input.
} else if (mode !== "--write" && hasAcceptedCurrent && !existsSync(outputPath)) {
  throw new Error(
    "operational occurrence identity registry-current is missing",
  );
}
console.log(
  `Operational occurrence identity ${hasAcceptedCurrent ? "current" : "historical"} registry ` +
    `${mode === "--write" && hasAcceptedCurrent ? "written" : "verified"}: ` +
    `${operations.length} operations (${acceptedOperations.length} accepted-current).`,
);
