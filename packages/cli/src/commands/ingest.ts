import { relative } from "node:path";
import {
  auditIngestRun,
  repoRoot,
  resumeHarnessRun,
  runHarnessCommand,
  seedPilotSubmissions,
  writeIngestAuditReport,
  type MtaIngestAuditReport,
} from "@mta-wiki/agents";
import { formatCountMap, formatRatio, requireMessage, requireSourceId, requireSubject, type CommandHandler, type ParsedArgs } from "./shared.js";

function printIngestAuditReport(report: MtaIngestAuditReport) {
  console.log(`Ingest audit: ${report.run_id}`);
  console.log(`Sources: ${report.source_ids.join(", ") || "(none)"}`);
  console.log(`Submissions: ${report.rows} (${formatCountMap(report.state_counts)})`);
  console.log(`Observation kinds: ${formatCountMap(report.observation_kind_counts)}`);
  console.log(`Evidence refs: ${report.evidence_ref_count} refs, ${report.unique_evidence_block_count} unique blocks`);
  console.log(`Evidence text sources: ${formatCountMap(report.evidence_text_source_counts)}`);
  console.log(`Evidence surfaces: ${formatCountMap(report.evidence_source_surface_counts)}`);
  console.log(`Evidence block kinds: ${formatCountMap(report.evidence_block_kind_counts)}`);
  console.log(`Max refs per observation: ${report.max_evidence_refs_per_observation}`);
  console.log(
    `Transcript: ${
      report.transcript.found
        ? `read_source=${report.transcript.read_source_calls}, search=${report.transcript.search_source_calls}, read_evidence=${report.transcript.read_evidence_calls}, submit=${report.transcript.submit_observation_calls}, source_packet=${report.transcript.normalization_skipped}`
        : "(not found)"
    }`,
  );
  if (report.usage) {
    console.log(
      `Usage: requests=${report.usage.request_count}, tokens=${report.usage.total_tokens}, cost=$${report.usage.estimated_cost.toFixed(6)}, accepted/1k_tokens=${formatRatio(report.usage.accepted_per_1k_tokens)}, cost/accepted=$${formatRatio(report.usage.cost_per_accepted_submission)}`,
    );
  }
  console.log(`Submission file: ${report.submission_path}`);
  if (report.transcript_path) console.log(`Transcript events: ${report.transcript_path}`);

  if (report.warnings.length === 0) {
    console.log("Warnings: 0");
    return;
  }

  console.log(`Warnings: ${report.warnings.length}`);
  for (const warning of report.warnings.slice(0, 30)) {
    const location = [warning.source_id, warning.local_observation_id, warning.block_id].filter(Boolean).join(" ");
    console.log(`- ${warning.code}${location ? ` ${location}` : ""}: ${warning.message}`);
  }
}

export const ingestCommands = {
  "seed-pilot": () => {
    const result = seedPilotSubmissions();
    console.log(`Seeded pilot submissions for ${result.runId}`);
    console.log(`Submitted: ${result.submitted}`);
    console.log(`Appended: ${result.appended}`);
    console.log(`Journal: ${relative(repoRoot, result.path)}`);
  },

  audit: (args) => {
    const report = auditIngestRun(args.subject);
    const auditPath = writeIngestAuditReport(report);
    printIngestAuditReport(report);
    console.log(`Audit JSON: ${relative(repoRoot, auditPath)}`);
  },

  resume: async (args) => {
    const result = await resumeHarnessRun(requireSubject(args.command, args.subject, "run name or session path"), {
      dryRun: args.dryRun,
      profileName: args.profileName,
      provider: args.provider,
      model: args.model,
      message: requireMessage(args.command, args.message),
    });

    console.log(result.responseText ?? `Prepared resume for ${result.target}.`);
    console.log(`Resumed command: ${result.resumedCommand}`);
    console.log(`Profile: ${result.profileName}`);
    console.log(`Model: ${result.provider}/${result.model}`);
    console.log(`Transcript: ${relative(repoRoot, result.transcriptDir)}`);
    console.log(`Session: ${relative(repoRoot, result.sessionPath)}`);
  },

  ingest: runSourceCommand,

  write: runSourceCommand,
} satisfies Record<string, CommandHandler>;

async function runSourceCommand(args: ParsedArgs) {
  const command = args.command;
  if (command !== "ingest" && command !== "write") {
    throw new Error(`Command is not a source run command: ${command}`);
  }

  const result = await runHarnessCommand(command, requireSourceId(command, args.subject), {
    dryRun: args.dryRun,
    profileName: args.profileName,
    provider: args.provider,
    model: args.model,
    safeWriter: args.safeWriter,
  });

  console.log(result.responseText ?? `Prepared ${result.command} for ${result.sourceId}.`);
  console.log(`Profile: ${result.profileName}`);
  console.log(`Model: ${result.provider}/${result.model}`);
  console.log(`Transcript: ${relative(repoRoot, result.transcriptDir)}`);
  console.log(`Session: ${relative(repoRoot, result.sessionPath)}`);
}
