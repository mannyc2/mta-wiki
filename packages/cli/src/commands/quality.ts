import { relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { writeForecastRealizationArtifacts } from "@mta-wiki/pipeline/quality/forecast-realization-artifacts";
import { writeOperationalCoverageArtifacts } from "@mta-wiki/pipeline/quality/operational-coverage-artifacts";
import { applyOperationalRecoveryProposal } from "@mta-wiki/pipeline/records/operational-recovery-apply";
import { validateOperationalRecoveryProposalTree } from "@mta-wiki/pipeline/records/operational-recovery-proposals";
import { draftQbnrRecoveryProposalFromFile } from "@mta-wiki/pipeline/records/qbnr-recovery-draft";
import { optionValue, requireSubject, type CommandHandler } from "./shared.js";

const operationalCoverage: CommandHandler = () => {
  const start = optionValue(process.argv, "--start");
  const end = optionValue(process.argv, "--end");
  if ((start && !end) || (!start && end)) {
    throw new Error("operational-coverage requires both --start and --end when overriding the study window");
  }
  const result = writeOperationalCoverageArtifacts({
    outputDir: optionValue(process.argv, "--output") ?? optionValue(process.argv, "-o"),
    routeAnchorPath: optionValue(process.argv, "--route-anchors"),
    decisionDir: optionValue(process.argv, "--decisions"),
    searchReceiptDir: optionValue(process.argv, "--search-receipts"),
    ...(start && end ? { studyWindow: { start, end } } : {}),
  });
  const population = result.ledger.summary.population;
  const completion = result.ledger.summary.completion;
  console.log(`Operational coverage artifacts: ${relative(repoRoot, result.outputDir)}`);
  console.log(`Input fingerprint: ${result.manifest.input_fingerprint}`);
  console.log(
    `Operational events: ${population.canonical_operational_events} ` +
      `(linked ${population.distinct_timeline_linked_events}, unlinked ${population.unlinked_operational_events})`,
  );
  console.log(
    `Projection rows: broad ${population.broad_anchor_rows}, reviewed overlays ${population.reviewed_overlay_rows}; ` +
      `occurrences ${population.distinct_occurrences} (${population.eligible_occurrences} eligible)`,
  );
  console.log(
    `Completion gaps: ${completion.gap_rows}; priority denominator ${completion.priority_gap_rows}; ` +
      `open ${completion.priority_open_rows}, adjudicated/recoverable ${completion.priority_adjudicated_recoverable_rows}, ` +
      `terminal ${completion.priority_terminal_rows}`,
  );
};

const forecastFrontier: CommandHandler = () => {
  const asOf = optionValue(process.argv, "--as-of");
  if (!asOf) throw new Error("forecast-frontier requires an explicit --as-of YYYY-MM-DD");
  const rawGraceDays = optionValue(process.argv, "--grace-days");
  if (rawGraceDays === undefined) {
    throw new Error("forecast-frontier requires an explicit --grace-days <non-negative integer>");
  }
  const graceDays = Number(rawGraceDays);
  if (!Number.isInteger(graceDays) || graceDays < 0) {
    throw new Error(`--grace-days must be a non-negative integer: ${rawGraceDays}`);
  }
  const result = writeForecastRealizationArtifacts({
    asOf,
    graceDays,
    outputDir: optionValue(process.argv, "--output") ?? optionValue(process.argv, "-o"),
    operationalCoverageDir: optionValue(process.argv, "--coverage"),
  });
  const summary = result.targetList.summary;
  console.log(`Forecast-realization frontier: ${relative(repoRoot, result.outputDir)}`);
  console.log(`As of ${result.targetList.as_of}; grace period ${result.targetList.grace_days} day(s)`);
  console.log(
    `Acquisition targets: ${summary.acquisition_target_count} ` +
      `(due ${summary.targets_due_for_acquisition_count}, not due ${summary.targets_not_due_count}, ` +
      `date unresolved ${summary.targets_with_unresolved_date_count})`,
  );
  console.log(
    `Realized candidates requiring review: ${summary.targets_with_realized_candidates_count}; ` +
      `terminal operational diagnostics remain separate: ${summary.operational_terminal_diagnostic_row_count}/` +
      `${summary.operational_diagnostic_row_count}`,
  );
};

const recoveryProposals: CommandHandler = () => {
  const report = validateOperationalRecoveryProposalTree();
  if (report.issues.length > 0) {
    throw new Error(`Invalid operational recovery proposal tree: ${report.issues.map((issue) => issue.message).join("; ")}`);
  }
  const states = new Map<string, number>();
  for (const artifact of report.proposals) {
    const key = `${artifact.stage}/${artifact.proposal.review_state}`;
    states.set(key, (states.get(key) ?? 0) + 1);
  }
  console.log(`Operational recovery proposals: ${report.proposals.length}`);
  console.log(
    [...states.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => `${key}=${count}`).join(", ") ||
      "Queue is empty.",
  );
};

const recoveryApply: CommandHandler = (args) => {
  const proposalId = requireSubject(args.command, args.subject, "proposal id");
  const report = applyOperationalRecoveryProposal(proposalId, { force: args.force });
  console.log(`Operational recovery proposal: ${report.proposal_id}`);
  console.log(`Journal: ${report.journal_path} (${report.submission_count} submission(s))`);
  console.log(
    report.skipped_already_applied
      ? "Already applied; journal content verified."
      : report.dry_run
        ? "Dry run only. Pass --force to write, materialize, verify, and move the proposal."
        : `Applied and moved to ${report.applied_proposal_path}.`,
  );
};

const qbnrRecoveryDraft: CommandHandler = (args) => {
  const specPath = requireSubject(args.command, args.subject, "reviewed QBNR batch spec path");
  const result = draftQbnrRecoveryProposalFromFile(specPath);
  console.log(`Operational recovery proposal: ${result.proposal.proposal_id}`);
  console.log(`Proposed artifact: ${relative(repoRoot, result.output_path)}`);
};

export const qualityCommands = {
  "operational-coverage": operationalCoverage,
  "coverage-matrix": operationalCoverage,
  "forecast-frontier": forecastFrontier,
  "operational-recovery-proposals": recoveryProposals,
  "operational-recovery-apply": recoveryApply,
  "qbnr-recovery-draft": qbnrRecoveryDraft,
} satisfies Record<string, CommandHandler>;
