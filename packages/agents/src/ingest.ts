import type { AgentTool } from "@earendil-works/pi-agent-core";
import { readConfig } from "@mta-wiki/core/config";
import { selectModel } from "@mta-wiki/core/models";
import { createWikiReactorSandboxTools, sandboxSystemPrompt } from "@mta-wiki/core/sandbox";
import { createTranscript, type TranscriptWriter } from "@mta-wiki/core/transcript";
import type { HarnessConfig, HarnessRunOptions, HarnessRunResult } from "@mta-wiki/core/types";
import { materializeWiki } from "@mta-wiki/pipeline/materialize/materialize";
import { campaignMaterializeQueue } from "@mta-wiki/pipeline/materialize/materialize-queue";
import { ingestPromptSourcePacket } from "@mta-wiki/pipeline/sources/source-packet";
import { assertSourceReadyForIngest, readStagedSourceMetadata } from "@mta-wiki/pipeline/sources/source-prep";
import { createMtaTools } from "@mta-wiki/agents/tools/ingest-tools";
import { baseSystemPrompt, ingestPrompt } from "@mta-wiki/agents/prompts";
import { runScopedSourceAgent, type MaterializedSummary } from "@mta-wiki/agents/shared";

export function ingestSystemPrompt(config: HarnessConfig): string {
  return [baseSystemPrompt(), sandboxSystemPrompt("ingest", config)].join("\n\n");
}

export function createIngestTools(transcript: TranscriptWriter, config: HarnessConfig): AgentTool[] {
  return [...createMtaTools(transcript, transcript.runId), ...createWikiReactorSandboxTools(config, "ingest")];
}

export async function runIngest(sourceId: string, options: HarnessRunOptions): Promise<HarnessRunResult> {
  readStagedSourceMetadata(sourceId);

  const config = readConfig();
  const selection = selectModel(config, options);
  const transcript = createTranscript(config, "ingest", sourceId, options.dryRun);

  let sourcePacket = "";
  try {
    const readiness = assertSourceReadyForIngest(sourceId);
    const packet = ingestPromptSourcePacket(sourceId);
    sourcePacket = packet.text;
    transcript.write("mta_source_evidence_ready", {
      sourceId,
      hasPdf: readiness.hasPdf,
      blockCount: readiness.blockCount,
      completedPages: readiness.completedPages.length,
      packetMode: packet.mode,
      packetBlocks: packet.blockCount,
      packetTokens: packet.packetTokenCount,
      fullPacketTokens: packet.fullTokenCount,
      maxInlinePacketTokens: packet.maxInlineTokens,
      packetTokenizer: packet.tokenizerId,
      packetTokenizerSha256: packet.tokenizerSha256,
    });
    transcript.write("mta_source_packet_ready", {
      reason: "chandra_json_blocks",
      sourceBlockCount: readiness.blockCount,
      sourcePages: readiness.completedPages.length,
    });
  } catch (error) {
    if (!options.dryRun) throw error;
    sourcePacket = `Source packet unavailable during dry run: ${error instanceof Error ? error.message : String(error)}`;
    transcript.write("mta_source_evidence_not_ready", {
      sourceId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return runScopedSourceAgent({
    command: "ingest",
    subject: sourceId,
    options,
    config,
    selection,
    transcript,
    tools: createIngestTools(transcript, config),
    systemPrompt: ingestSystemPrompt(config),
    prompt: ingestPrompt(sourceId, sourcePacket),
    finalize: async () => {
      // Campaign waves materialize on an every-K cadence through a shared single-flight queue
      // (campaign-concurrency-plan.md §2 P0-b); standalone ingest materializes every run.
      if (options.campaignMaterialize) {
        const queue = campaignMaterializeQueue();
        const outcome = await queue.afterCompletion();
        if (!outcome.ran || !outcome.result) {
          transcript.write("mta_materialize_skipped", { cadenceCounter: outcome.counter, every: outcome.every });
          return undefined;
        }
        const materialized: MaterializedSummary = {
          submissionsRead: outcome.result.submissionsRead,
          acceptedSubmissions: outcome.result.acceptedSubmissions,
          pageCount: outcome.result.pageCount,
        };
        transcript.write("mta_materialize_after_ingest", { ...materialized, cadenceCounter: outcome.counter });
        return materialized;
      }

      const result = materializeWiki();
      const materialized: MaterializedSummary = {
        submissionsRead: result.submissionsRead,
        acceptedSubmissions: result.acceptedSubmissions,
        pageCount: result.pageCount,
      };
      transcript.write("mta_materialize_after_ingest", materialized);
      return materialized;
    },
  });
}
