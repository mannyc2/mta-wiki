import { relative } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { buildHarnessAgent } from "@mta-wiki/core/agent";
import type { ModelSelection } from "@mta-wiki/core/models";
import { repoRoot } from "@mta-wiki/core/paths";
import { createHarnessSession } from "@mta-wiki/core/session";
import type { TranscriptWriter } from "@mta-wiki/core/transcript";
import type { HarnessConfig, HarnessRunCommand, HarnessRunOptions, HarnessRunResult } from "@mta-wiki/core/types";
import { assistantText } from "@mta-wiki/core/usage";

export type MaterializedSummary = {
  submissionsRead: number;
  acceptedSubmissions: number;
  pageCount: number;
};

export function modelSummary(selection: ModelSelection): string {
  return [`- Profile: \`${selection.profileName}\``, `- Model: \`${selection.model.provider}/${selection.model.id}\``].join("\n");
}

export function runSummary(
  command: HarnessRunCommand,
  sourceId: string,
  selection: ModelSelection,
  dryRun: boolean,
  sessionPath: string,
  materialized?: MaterializedSummary,
): string {
  const materializedSuffix =
    materialized && `- Materialized: \`${materialized.acceptedSubmissions}/${materialized.submissionsRead}\` submissions, \`${materialized.pageCount}\` pages\n`;
  return `# ${command} ${sourceId}

- Source: \`${sourceId}\`
${modelSummary(selection)}
- Dry run: \`${dryRun}\`
- Session: \`${relative(repoRoot, sessionPath)}\`
${materializedSuffix || ""}`;
}

/** Create a fresh session and build a scoped agent for it. */
export async function buildScopedAgent(
  config: HarnessConfig,
  selection: ModelSelection,
  transcript: TranscriptWriter,
  tools: AgentTool[],
  systemPrompt: string,
  sessionId = transcript.runId,
) {
  const bundle = await createHarnessSession(config, sessionId);
  return buildHarnessAgent({ selection, transcript, bundle, tools, systemPrompt });
}

export type ScopedSourceRun = {
  command: HarnessRunCommand;
  /** Source id for ingest/write, or the question for ask. */
  subject: string;
  options: HarnessRunOptions;
  config: HarnessConfig;
  selection: ModelSelection;
  transcript: TranscriptWriter;
  tools: AgentTool[];
  systemPrompt: string;
  prompt: string;
  /** Optional post-run step (e.g. materialize after ingest); returns a summary for the run report. */
  finalize?: () => MaterializedSummary | undefined | Promise<MaterializedSummary | undefined>;
};

/**
 * Shared run envelope for the source-backed agents (ingest/write/ask): build the agent,
 * write the run summary, short-circuit on dry runs, prompt the model, then finalize.
 */
export async function runScopedSourceAgent(run: ScopedSourceRun): Promise<HarnessRunResult> {
  const { command, subject, options, config, selection, transcript, tools, systemPrompt, prompt, finalize } = run;
  const { agent, sessionPath } = await buildScopedAgent(config, selection, transcript, tools, systemPrompt);

  transcript.writeSummary(runSummary(command, subject, selection, options.dryRun, sessionPath));

  const baseResult = {
    command,
    sourceId: subject,
    dryRun: options.dryRun,
    profileName: selection.profileName,
    provider: selection.model.provider,
    model: selection.model.id,
    transcriptDir: transcript.runDir,
    sessionPath,
  };

  if (options.dryRun) {
    transcript.writeResponse(`Dry run prepared for ${command} ${subject}.

Prompt:

${prompt}
`);
    return { ...baseResult, responseText: `Prepared ${command} dry run for ${subject}.` };
  }

  const responseText = assistantText(await agent.prompt(prompt));
  transcript.writeResponse(responseText);

  const materialized = await finalize?.();
  transcript.writeSummary(runSummary(command, subject, selection, options.dryRun, sessionPath, materialized));

  return { ...baseResult, responseText };
}
