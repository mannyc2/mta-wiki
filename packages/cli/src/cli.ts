// Thin dispatcher: parses argv into ParsedArgs and routes to the command modules.
import { askCommands } from "./commands/ask.js";
import { campaignCommands } from "./commands/campaign.js";
import { identityCommands } from "./commands/identity.js";
import { ingestCommands } from "./commands/ingest.js";
import { materializeCommands } from "./commands/materialize.js";
import { messageValue, optionValue, type Command, type CommandHandler, type ParsedArgs } from "./commands/shared.js";
import { ontologyCommands } from "./commands/ontology.js";
import { qualityCommands } from "./commands/quality.js";
import { replayCommands } from "./commands/replay.js";
import { sourcesCommands } from "./commands/sources.js";
import { utilityCommands } from "./commands/utility.js";
import { validateCommands } from "./commands/validate.js";

function parseCommand(argv: string[]): ParsedArgs {
  const rawCommand = argv[2];
  const subject = argv[3]?.startsWith("--") ? undefined : argv[3];
  const dryRun = argv.includes("--dry-run");
  const profileName = optionValue(argv, "--profile") ?? process.env.PI_PROFILE;
  const provider = optionValue(argv, "--provider") ?? process.env.PI_PROVIDER;
  const model = optionValue(argv, "--model") ?? process.env.PI_MODEL;
  const full = argv.includes("--full");
  const sourceIdOverride = optionValue(argv, "--source-id");
  const runId = optionValue(argv, "--run-id");
  const message = messageValue(argv);
  const include = optionValue(argv, "--include");
  const exclude = optionValue(argv, "--exclude");
  const force = argv.includes("--force");
  const kindFilter = optionValue(argv, "--kind");
  const safeWriter = argv.includes("--safe-writer");
  const rawMaxPages = optionValue(argv, "--max-pages");
  let maxPages: number | undefined;
  if (rawMaxPages !== undefined) {
    const parsedMaxPages = Number(rawMaxPages);
    if (!Number.isInteger(parsedMaxPages) || parsedMaxPages < 1) {
      throw new Error(`--max-pages must be a positive integer: ${rawMaxPages}`);
    }
    maxPages = parsedMaxPages;
  }
  const rawBatchSize = optionValue(argv, "--batch-size");
  let batchSize: number | undefined;
  if (rawBatchSize !== undefined) {
    const parsedBatchSize = Number(rawBatchSize);
    if (!Number.isInteger(parsedBatchSize) || parsedBatchSize < 1) {
      throw new Error(`--batch-size must be a positive integer: ${rawBatchSize}`);
    }
    batchSize = parsedBatchSize;
  }
  const rawConcurrency = optionValue(argv, "--concurrency");
  let concurrency: number | undefined;
  if (rawConcurrency !== undefined) {
    const parsedConcurrency = Number(rawConcurrency);
    if (!Number.isInteger(parsedConcurrency) || parsedConcurrency < 1) {
      throw new Error(`--concurrency must be a positive integer: ${rawConcurrency}`);
    }
    concurrency = parsedConcurrency;
  }
  const rawTimeoutMin = optionValue(argv, "--timeout-min");
  let timeoutMin: number | undefined;
  if (rawTimeoutMin !== undefined) {
    const parsedTimeoutMin = Number(rawTimeoutMin);
    if (!Number.isFinite(parsedTimeoutMin) || parsedTimeoutMin <= 0) {
      throw new Error(`--timeout-min must be a positive number: ${rawTimeoutMin}`);
    }
    timeoutMin = parsedTimeoutMin;
  }
  const rawLimit = optionValue(argv, "--limit");
  let importLimit: number | undefined;
  if (rawLimit !== undefined) {
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      throw new Error(`--limit must be a positive integer: ${rawLimit}`);
    }
    importLimit = parsedLimit;
  }
  if (!rawCommand || rawCommand === "help" || rawCommand === "--help" || rawCommand === "-h") {
    return {
      command: "help",
      subject: undefined,
      dryRun,
      profileName,
      provider,
      model,
      full,
      sourceIdOverride,
      runId,
      importLimit,
      include,
      exclude,
      force,
      maxPages,
      batchSize,
      concurrency,
      timeoutMin,
      message,
      kindFilter,
      safeWriter,
    };
  }

  const command = rawCommand as Command;
  const commands = new Set<Command>([
	    "ingest",
	    "write",
	    "ask",
	    "build-index",
    "prepare-source",
    "source-prep-preview",
    "source-prep-apply-preview",
    "import-sources",
    "chandra-queue",
    "chandra-run",
    "seed-pilot",
    "materialize",
    "rebuild-db-from-canonical",
    "rebuild-evidence-index",
    "export-jsonl",
    "export-release",
    "export-site",
    "quality-report",
    "quality-seeded-defects",
    "quality-judge-calibration",
    "operational-coverage",
    "coverage-matrix",
    "forecast-frontier",
    "operational-recovery-proposals",
    "operational-recovery-apply",
    "qbnr-recovery-draft",
    "relationship-integrity",
    "relationship-completeness",
    "semantic-sweep",
    "fact-dedup",
    "replay-eval",
    "extract",
    "identity-review",
    "identity-review-run",
    "identity-review-apply",
    "identity-review-autoaccept",
    "canonicalize",
    "canonicalize-review",
    "canonicalize-apply",
    "canonicalize-wave",
    "cross-source-candidates",
    "import-gtfs",
    "dossier",
    "gap-report",
    "campaign",
    "migrate-batch1",
    "migrate-batch2",
    "ontology-review",
    "ontology-normalize-run",
    "schema-audit",
    "schema-propose",
    "pipeline-report",
    "post-ingest-audit",
    "source-id-drift-audit",
    "post-ingest-goal-audit",
    "post-ingest-plan",
    "writer-backlog-queue",
    "writer-backlog-packets",
    "writer-packet-set-manifest",
    "writer-packet-dispatch-plan",
    "writer-packet-dispatch-status",
    "writer-packet-dispatch-next-shard",
    "writer-packet-dispatch-handoff-batch",
    "writer-packet-dispatch-handoff-prompts",
    "writer-packet-dispatch-handoff-prompt-coverage",
    "writer-packet-dispatch-claim",
    "writer-packet-dispatch-readiness",
    "write-writer-packet",
    "verify-writer-edits",
    "verify-writer-citations",
    "verify-writer-packets",
    "verify-writer-packet-set",
    "verify-writer-packet-set-manifest",
    "verify-writer-packet-dispatch-plan",
    "verify-writer-packet-dispatch-claim",
    "verify-writer-packet-dispatch-claims",
    "verify-writer-packet-dispatch-handoff-batch",
    "verify-writer-packet-dispatch-handoff-prompts",
    "verify-writer-packet-dispatch-handoff-prompt-coverage",
    "verify-writer-packet-edits",
    "audit",
    "validate",
    "profiles",
    "providers",
    "models",
    "transcripts",
    "transcript",
    "usage",
    "resume",
  ]);

  if (!commands.has(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  return {
    command,
    subject,
    dryRun,
    profileName,
    provider,
    model,
    full,
    sourceIdOverride,
    runId,
    importLimit,
    include,
    exclude,
    force,
    maxPages,
    batchSize,
    concurrency,
    timeoutMin,
    message,
    kindFilter,
    safeWriter,
  };
}

const commandHandlers: Record<Command, CommandHandler> = {
  ...sourcesCommands,
  ...ingestCommands,
  ...askCommands,
  ...materializeCommands,
  ...qualityCommands,
  ...identityCommands,
  ...ontologyCommands,
  ...campaignCommands,
  ...validateCommands,
  ...replayCommands,
  ...utilityCommands,
};

async function main() {
  const args = parseCommand(process.argv);
  await commandHandlers[args.command](args);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
