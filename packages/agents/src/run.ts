import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { buildHarnessAgent } from "@mta-wiki/core/agent";
import { readConfig } from "@mta-wiki/core/config";
import { selectModel, type ModelSelection } from "@mta-wiki/core/models";
import { repoRoot } from "@mta-wiki/core/paths";
import { openHarnessSession } from "@mta-wiki/core/session";
import { createTranscript, type TranscriptWriter } from "@mta-wiki/core/transcript";
import type { HarnessConfig, HarnessResumeOptions, HarnessResumeResult, HarnessRunCommand, HarnessRunOptions, HarnessRunResult } from "@mta-wiki/core/types";
import { assistantText } from "@mta-wiki/core/usage";
import { createAskTools, askSystemPromptFull, runAsk } from "@mta-wiki/agents/ask";
import { createIngestTools, ingestSystemPrompt, runIngest } from "@mta-wiki/agents/ingest";
import { modelSummary } from "@mta-wiki/agents/shared";
import { createWriterTools, writerSystemPromptFull, runWrite } from "@mta-wiki/agents/write";

/** Tools for a command, used by the resume path to rebuild the original agent. */
function scopedToolsFor(command: HarnessRunCommand, transcript: TranscriptWriter, config: HarnessConfig): AgentTool[] {
  switch (command) {
    case "ingest":
      return createIngestTools(transcript, config);
    case "ask":
      return createAskTools(transcript, config);
    case "write":
      return createWriterTools(transcript, config);
  }
}

/** System prompt for a command, used by the resume path to rebuild the original agent. */
function scopedSystemPromptFor(command: HarnessRunCommand, config: HarnessConfig): string {
  switch (command) {
    case "ingest":
      return ingestSystemPrompt(config);
    case "ask":
      return askSystemPromptFull(config);
    case "write":
      return writerSystemPromptFull(config);
  }
}

export async function runHarnessCommand(
  command: HarnessRunCommand,
  subject: string,
  options: HarnessRunOptions,
): Promise<HarnessRunResult> {
  switch (command) {
    case "ingest":
      return runIngest(subject, options);
    case "write":
      return runWrite(subject, options);
    case "ask":
      return runAsk(subject, options);
  }
}

type ResolvedResumeTarget = {
  resumedCommand: HarnessRunCommand;
  sourceId: string;
  sessionPath: string;
  runName?: string;
};

function absoluteUserPath(value: string) {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

function parseHarnessCommand(value: string | undefined): HarnessRunCommand | undefined {
  if (value === "ingest" || value === "write" || value === "ask") return value;
  return undefined;
}

function inferCommandFromSessionPath(sessionPath: string) {
  const match = basename(sessionPath).match(/_(ingest|write|ask)_/u);
  return parseHarnessCommand(match?.[1]);
}

function resolveResumeTarget(config: HarnessConfig, target: string): ResolvedResumeTarget {
  const targetPath = absoluteUserPath(target);
  const runDir = existsSync(join(targetPath, "summary.md")) ? targetPath : join(repoRoot, config.transcriptsDir, "runs", target);
  const summaryPath = join(runDir, "summary.md");

  if (existsSync(summaryPath)) {
    const summary = readFileSync(summaryPath, "utf8");
    const heading = summary.match(/^# (ingest|write|ask) (.+)$/mu);
    const session = summary.match(/^- Session: `([^`]+)`$/mu);
    const resumedCommand = parseHarnessCommand(heading?.[1]);
    const sourceId = heading?.[2]?.trim();
    if (!resumedCommand || !sourceId) {
      throw new Error(`Could not parse resumed command/source from ${relative(repoRoot, summaryPath)}`);
    }
    if (!session?.[1]) {
      throw new Error(`Could not parse session path from ${relative(repoRoot, summaryPath)}`);
    }
    return {
      resumedCommand,
      sourceId,
      sessionPath: absoluteUserPath(session[1]),
      runName: basename(runDir),
    };
  }

  const sessionPath = targetPath.endsWith(".jsonl") ? targetPath : join(repoRoot, config.transcriptsDir, "sessions", target);
  if (!existsSync(sessionPath)) {
    throw new Error(`Resume target not found as a run summary or session file: ${target}`);
  }
  const resumedCommand = inferCommandFromSessionPath(sessionPath);
  if (!resumedCommand) {
    throw new Error(`Could not infer original command from session path. Resume from a run name or run directory instead: ${target}`);
  }
  return {
    resumedCommand,
    sourceId: basename(sessionPath, ".jsonl"),
    sessionPath,
  };
}

function resumeSummary(target: string, resolved: ResolvedResumeTarget, selection: ModelSelection, dryRun: boolean, sessionPath: string) {
  return `# resume ${resolved.sourceId}

- Target: \`${target}\`
${resolved.runName ? `- Original run: \`${resolved.runName}\`\n` : ""}- Resumed command: \`${resolved.resumedCommand}\`
- Source: \`${resolved.sourceId}\`
${modelSummary(selection)}
- Dry run: \`${dryRun}\`
- Session: \`${relative(repoRoot, sessionPath)}\`
`;
}

export async function resumeHarnessRun(target: string, options: HarnessResumeOptions): Promise<HarnessResumeResult> {
  const config = readConfig();
  const selection = selectModel(config, options);
  const resolved = resolveResumeTarget(config, target);
  const transcript = createTranscript(config, "resume", resolved.sourceId, options.dryRun);
  const bundle = await openHarnessSession(config, resolved.sessionPath);
  const { agent, sessionPath } = buildHarnessAgent({
    selection,
    transcript,
    bundle,
    tools: scopedToolsFor(resolved.resumedCommand, transcript, config),
    systemPrompt: scopedSystemPromptFor(resolved.resumedCommand, config),
  });

  transcript.writeSummary(resumeSummary(target, resolved, selection, options.dryRun, sessionPath));

  const baseResult = {
    command: "resume" as const,
    resumedCommand: resolved.resumedCommand,
    target,
    sourceId: resolved.sourceId,
    dryRun: options.dryRun,
    profileName: selection.profileName,
    provider: selection.model.provider,
    model: selection.model.id,
    transcriptDir: transcript.runDir,
    sessionPath,
  };

  if (options.dryRun) {
    transcript.writeResponse(`Dry run prepared for resume target ${target}.

Message:

${options.message}
`);
    return { ...baseResult, responseText: `Prepared resume dry run for ${target}.` };
  }

  const responseText = assistantText(await agent.prompt(options.message));
  transcript.writeResponse(responseText);
  transcript.writeSummary(resumeSummary(target, resolved, selection, options.dryRun, sessionPath));

  return { ...baseResult, responseText };
}
