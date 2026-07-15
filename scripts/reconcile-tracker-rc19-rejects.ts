import { resolve } from "node:path";
import {
  buildRc19RejectReconciliation,
  writeRc19RejectReconciliation,
  type Rc19ReconciliationPaths,
} from "../packages/pipeline/src/quality/rc19-reject-reconciliation.js";

const optionNames = {
  "--candidate-set": "candidateSetPath",
  "--reconciliation": "reconciliationPath",
  "--audit": "auditPath",
  "--hard-gate": "hardGatePath",
  "--deep-review": "deepReviewPath",
  "--rc19-manifest": "rc19ManifestPath",
  "--output-dir": "outputDir",
} as const;

type Parsed = Partial<Rc19ReconciliationPaths> & { outputDir?: string | undefined };

function usage(): never {
  throw new Error([
    "Usage: bun scripts/reconcile-tracker-rc19-rejects.ts \\",
    "  --candidate-set <candidate-set.json> \\",
    "  --reconciliation <rc19-review-reconciliation.json> \\",
    "  --audit <mta-wiki-rc19-study-candidate-audit.json> \\",
    "  --hard-gate <hard-gate-triage.json> \\",
    "  --deep-review <deep-review-input.json> \\",
    "  --rc19-manifest <v1-rc19/manifest.json> \\",
    "  --output-dir <new-output-directory>",
    "",
    "Every input is required and content-address verified. The command never reads LATEST.",
  ].join("\n"));
}

function parseArgs(args: readonly string[]): Parsed {
  if (args.includes("--help") || args.includes("-h")) usage();
  const parsed: Parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name || !value || !(name in optionNames)) usage();
    const key = optionNames[name as keyof typeof optionNames];
    if (parsed[key]) throw new Error(`Duplicate option ${name}`);
    parsed[key] = resolve(value);
  }
  return parsed;
}

function required(parsed: Parsed, key: keyof Rc19ReconciliationPaths | "outputDir"): string {
  const value = parsed[key];
  if (!value) usage();
  return value;
}

const parsed = parseArgs(process.argv.slice(2));
const paths: Rc19ReconciliationPaths = {
  candidateSetPath: required(parsed, "candidateSetPath"),
  reconciliationPath: required(parsed, "reconciliationPath"),
  auditPath: required(parsed, "auditPath"),
  hardGatePath: required(parsed, "hardGatePath"),
  deepReviewPath: required(parsed, "deepReviewPath"),
  rc19ManifestPath: required(parsed, "rc19ManifestPath"),
};
const result = buildRc19RejectReconciliation(paths);
const outputDir = required(parsed, "outputDir");
const outputs = writeRc19RejectReconciliation(outputDir, result);
process.stdout.write(`${JSON.stringify({
  output_dir: outputDir,
  rejected_candidate_count: result.ledger.length,
  source_scope_repaired_count: result.ledger.filter((row) => row.source_fix !== null).length,
  fully_source_fixed_count: 0,
  later_ace_phase_count: result.acePhaseIdentities.length,
  outputs,
}, null, 2)}\n`);
