import { join, relative } from "node:path";
import { readFileSync } from "node:fs";
import { repoRoot } from "@mta-wiki/core/paths";
import { runExtractSource, extractRunActualDir, DEFAULT_EXTRACT_RELEASE_ID, DEFAULT_EXTRACT_RUN_ID } from "@mta-wiki/agents";
import { DEFAULT_REPLAY_RELEASE_ID, DEFAULT_REPLAY_RUN_ID, writeReplayEval } from "@mta-wiki/pipeline/replay/replay";
import { optionValue, requireSourceId, type CommandHandler } from "./shared.js";

type ReplayManifest = {
  sources: Array<{ source_id: string }>;
};

function manifestSourceIds(limit: number | undefined) {
  const manifest = JSON.parse(readFileSync(join(repoRoot, "data", "replay", "sample-manifest.json"), "utf8")) as ReplayManifest;
  const ids = manifest.sources.map((source) => source.source_id);
  return limit === undefined ? ids : ids.slice(0, limit);
}

export const replayCommands = {
  extract: async (args) => {
    const releaseId = optionValue(process.argv, "--release-id") ?? DEFAULT_EXTRACT_RELEASE_ID;
    const runId = args.runId ?? DEFAULT_EXTRACT_RUN_ID;
    const mockResponsePath = optionValue(process.argv, "--mock-response");
    const explicitSource = optionValue(process.argv, "--source") ?? args.subject;
    const sourceIds = explicitSource ? [requireSourceId(args.command, explicitSource)] : manifestSourceIds(args.importLimit ?? 1);
    if (mockResponsePath && sourceIds.length !== 1) throw new Error("--mock-response can only be used with one --source.");

    let accepted = 0;
    let reviewed = 0;
    let enumMisses = 0;
    for (const sourceId of sourceIds) {
      const result = await runExtractSource({
        sourceId,
        releaseId,
        runId,
        mockResponsePath,
        dryRun: args.dryRun,
        profileName: args.profileName,
        provider: args.provider,
        model: args.model,
      });
      accepted += result.accepted;
      reviewed += result.reviewed;
      enumMisses += result.enumMisses;
      console.log(`${sourceId}: accepted=${result.accepted}, review=${result.reviewed}, enum_misses=${result.enumMisses}`);
      if (result.outputPath) console.log(`  Output: ${relative(repoRoot, result.outputPath)}`);
      if (result.reviewPath) console.log(`  Review: ${relative(repoRoot, result.reviewPath)}`);
      if (result.promptPath) console.log(`  Prompt: ${relative(repoRoot, result.promptPath)}`);
      if (result.transcriptDir) console.log(`  Transcript: ${relative(repoRoot, result.transcriptDir)}`);
    }

    console.log(`Extract run ${runId}: sources=${sourceIds.length}, accepted=${accepted}, review=${reviewed}, enum_misses=${enumMisses}`);
    console.log(`Actual dir: ${relative(repoRoot, extractRunActualDir(runId))}`);
  },

  "replay-eval": () => {
    const releaseId = optionValue(process.argv, "--release-id") ?? DEFAULT_REPLAY_RELEASE_ID;
    const runId = optionValue(process.argv, "--run-id") ?? DEFAULT_REPLAY_RUN_ID;
    const actualDir = optionValue(process.argv, "--actual-dir");
    const actualOnly = process.argv.includes("--actual-only");
    const result = writeReplayEval({ releaseId, runId, actualDir, actualOnly });
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
