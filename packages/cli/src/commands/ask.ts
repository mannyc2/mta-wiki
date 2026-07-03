import { relative } from "node:path";
import { buildSemanticIndex, repoRoot, runHarnessCommand, type BuildSemanticIndexResult } from "@mta-wiki/agents";
import { requireSubject, type CommandHandler } from "./shared.js";

function printBuildIndexResult(result: BuildSemanticIndexResult) {
  console.log("Semantic index built");
  console.log(`Model: ${result.model}`);
  console.log(`Records: ${result.total} (embedded ${result.embedded} / reused ${result.reused})`);
  console.log(`Dimensions: ${result.dims}`);
  console.log(`Vectors: ${result.vectorsPath}`);
  console.log(`Manifest: ${result.manifestPath}`);
}

export const askCommands = {
  ask: async (args) => {
    const question = requireSubject(args.command, args.subject ?? args.message, "question");
    const result = await runHarnessCommand("ask", question, {
      dryRun: args.dryRun,
      profileName: args.profileName,
      provider: args.provider,
      model: args.model,
    });

    console.log(result.responseText ?? `Prepared ask for ${result.sourceId}.`);
    console.log(`Model: ${result.provider}/${result.model}`);
    console.log(`Transcript: ${relative(repoRoot, result.transcriptDir)}`);
    console.log(`Session: ${relative(repoRoot, result.sessionPath)}`);
  },

  "build-index": async (args) => {
    const result = await buildSemanticIndex({ rebuild: args.force });
    printBuildIndexResult(result);
  },
} satisfies Record<string, CommandHandler>;
