import type { AgentTool } from "@earendil-works/pi-agent-core";
import { readConfig } from "@mta-wiki/core/config";
import { selectModel } from "@mta-wiki/core/models";
import { createWikiReactorSandboxTools, sandboxSystemPrompt } from "@mta-wiki/core/sandbox";
import { createTranscript, type TranscriptWriter } from "@mta-wiki/core/transcript";
import type { HarnessConfig, HarnessRunOptions, HarnessRunResult } from "@mta-wiki/core/types";
import { createMtaQueryTools } from "@mta-wiki/agents/tools/query-tools";
import { askPrompt, askSystemPrompt } from "@mta-wiki/agents/prompts";
import { runScopedSourceAgent } from "@mta-wiki/agents/shared";

export function askSystemPromptFull(config: HarnessConfig): string {
  return [askSystemPrompt(), sandboxSystemPrompt("ask", config)].join("\n\n");
}

export function createAskTools(transcript: TranscriptWriter, config: HarnessConfig): AgentTool[] {
  return [...createMtaQueryTools(transcript, transcript.runId), ...createWikiReactorSandboxTools(config, "ask")];
}

export async function runAsk(question: string, options: HarnessRunOptions): Promise<HarnessRunResult> {
  const config = readConfig();
  const selection = selectModel(config, options);
  const transcript = createTranscript(config, "ask", question, options.dryRun);

  return runScopedSourceAgent({
    command: "ask",
    subject: question,
    options,
    config,
    selection,
    transcript,
    tools: createAskTools(transcript, config),
    systemPrompt: askSystemPromptFull(config),
    prompt: askPrompt(question),
  });
}
