import { relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { DEFAULT_REPLAY_RELEASE_ID, DEFAULT_REPLAY_RUN_ID, writeReplayEval } from "@mta-wiki/pipeline/replay/replay";
import { optionValue, type CommandHandler } from "./shared.js";

export const replayCommands = {
  "replay-eval": () => {
    const releaseId = optionValue(process.argv, "--release-id") ?? DEFAULT_REPLAY_RELEASE_ID;
    const runId = optionValue(process.argv, "--run-id") ?? DEFAULT_REPLAY_RUN_ID;
    const actualDir = optionValue(process.argv, "--actual-dir");
    const result = writeReplayEval({ releaseId, runId, actualDir });
    console.log(
      `Replay eval ${runId}: ${result.report.totals.match}/${result.report.totals.expected} ` +
        `matches (${result.report.self_diff ? "self-diff" : "actual diff"}).`,
    );
    console.log(`Manifest: ${relative(repoRoot, result.manifestPath)}`);
    console.log(`Baseline: ${relative(repoRoot, result.baselineDir)}`);
    console.log(`Report: ${relative(repoRoot, result.reportPath)}`);
    console.log(`Summary: ${relative(repoRoot, result.markdownPath)}`);
  },
} satisfies Record<string, CommandHandler>;
