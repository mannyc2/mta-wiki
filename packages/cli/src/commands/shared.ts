// Shared CLI plumbing: command/arg types, option parsing, and small formatters.
import type { HarnessRunCommand } from "@mta-wiki/agents";

export type Command =
  | HarnessRunCommand
  | "build-index"
  | "prepare-source"
  | "source-prep-preview"
  | "source-prep-apply-preview"
  | "import-sources"
  | "chandra-queue"
  | "chandra-run"
  | "seed-pilot"
  | "materialize"
  | "rebuild-db-from-canonical"
  | "rebuild-evidence-index"
  | "export-jsonl"
  | "export-release"
  | "export-site"
  | "quality-report"
  | "quality-seeded-defects"
  | "quality-judge-calibration"
  | "operational-coverage"
  | "coverage-matrix"
  | "semantic-sweep"
  | "fact-dedup"
  | "replay-eval"
  | "extract"
  | "identity-review"
  | "identity-review-run"
  | "identity-review-apply"
  | "identity-review-autoaccept"
  | "canonicalize"
  | "canonicalize-review"
  | "canonicalize-apply"
  | "canonicalize-wave"
  | "cross-source-candidates"
  | "import-gtfs"
  | "dossier"
  | "gap-report"
  | "campaign"
  | "migrate-batch1"
  | "migrate-batch2"
  | "ontology-review"
  | "ontology-normalize-run"
  | "schema-audit"
  | "schema-propose"
  | "pipeline-report"
  | "post-ingest-audit"
  | "source-id-drift-audit"
  | "post-ingest-goal-audit"
  | "post-ingest-plan"
  | "writer-backlog-queue"
  | "writer-backlog-packets"
  | "writer-packet-set-manifest"
  | "writer-packet-dispatch-plan"
  | "writer-packet-dispatch-status"
  | "writer-packet-dispatch-next-shard"
  | "writer-packet-dispatch-handoff-batch"
  | "writer-packet-dispatch-handoff-prompts"
  | "writer-packet-dispatch-handoff-prompt-coverage"
  | "writer-packet-dispatch-claim"
  | "writer-packet-dispatch-readiness"
  | "write-writer-packet"
  | "verify-writer-edits"
  | "verify-writer-citations"
  | "verify-writer-packets"
  | "verify-writer-packet-set"
  | "verify-writer-packet-set-manifest"
  | "verify-writer-packet-dispatch-plan"
  | "verify-writer-packet-dispatch-claim"
  | "verify-writer-packet-dispatch-claims"
  | "verify-writer-packet-dispatch-handoff-batch"
  | "verify-writer-packet-dispatch-handoff-prompts"
  | "verify-writer-packet-dispatch-handoff-prompt-coverage"
  | "verify-writer-packet-edits"
  | "audit"
  | "validate"
  | "profiles"
  | "providers"
  | "models"
  | "transcripts"
  | "transcript"
  | "usage"
  | "resume"
  | "help";

export type ParsedArgs = {
  command: Command;
  subject: string | undefined;
  dryRun: boolean;
  profileName: string | undefined;
  provider: string | undefined;
  model: string | undefined;
  full: boolean;
  sourceIdOverride: string | undefined;
  runId: string | undefined;
  importLimit: number | undefined;
  include: string | undefined;
  exclude: string | undefined;
  force: boolean;
  maxPages: number | undefined;
  batchSize: number | undefined;
  concurrency: number | undefined;
  timeoutMin: number | undefined;
  message: string | undefined;
  kindFilter: string | undefined;
  safeWriter: boolean;
};

export type CommandHandler = (args: ParsedArgs) => void | Promise<void>;

export function optionValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;

  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }

  return value;
}

export function messageValue(argv: string[]): string | undefined {
  const direct = optionValue(argv, "--message");
  if (direct !== undefined) return direct;

  const separator = argv.indexOf("--");
  if (separator === -1 || separator === argv.length - 1) return undefined;
  return argv.slice(separator + 1).join(" ");
}

export function requireSubject(command: Command, subject: string | undefined, label = "subject"): string {
  if (!subject) {
    throw new Error(`Missing ${label} for ${command}`);
  }
  return subject;
}

export function requireSourceId(command: Command, sourceId: string | undefined): string {
  const value = requireSubject(command, sourceId, "source id");
  if (!/^[a-z0-9_:-]+$/u.test(value)) {
    throw new Error(`Source id must use lowercase letters, numbers, underscores, colons, or hyphens: ${value}`);
  }
  return value;
}

export function requireMessage(command: Command, message: string | undefined): string {
  const value = message?.trim();
  if (!value) {
    throw new Error(`Missing message for ${command}. Use --message "..." or put the message after --`);
  }
  return value;
}

export function formatRatio(value: number | undefined) {
  return value === undefined ? "(n/a)" : value.toFixed(3);
}

export function formatCountMap(counts: Record<string, number>) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries.length === 0 ? "(none)" : entries.map(([key, count]) => `${key}=${count}`).join(", ");
}

export function formatElapsed(ms: number | undefined) {
  if (ms === undefined) return "";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m${String(remainder).padStart(2, "0")}s`;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}
