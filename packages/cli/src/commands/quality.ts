import { relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { writeOperationalCoverageArtifacts } from "@mta-wiki/pipeline/quality/operational-coverage-artifacts";
import { optionValue, type CommandHandler } from "./shared.js";

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

export const qualityCommands = {
  "operational-coverage": operationalCoverage,
  "coverage-matrix": operationalCoverage,
} satisfies Record<string, CommandHandler>;
