import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import type { TranscriptUsageSummary, UsageRecord } from "./types.js";

export function assistantText(message: AssistantMessage): string {
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    const errorMessage = "errorMessage" in message && typeof message.errorMessage === "string" ? message.errorMessage : undefined;
    throw new Error(errorMessage || `Assistant response stopped with ${message.stopReason}`);
  }

  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function addUsage(total: Usage, usage: Usage) {
  total.input += usage.input;
  total.output += usage.output;
  total.cacheRead += usage.cacheRead;
  total.cacheWrite += usage.cacheWrite;
  total.totalTokens += usage.totalTokens;
  total.cost.input += usage.cost.input;
  total.cost.output += usage.cost.output;
  total.cost.cacheRead += usage.cost.cacheRead;
  total.cost.cacheWrite += usage.cost.cacheWrite;
  total.cost.total += usage.cost.total;
}

export function usageRecordFromMessage(message: AssistantMessage): UsageRecord {
  return {
    timestamp: message.timestamp,
    api: String(message.api),
    provider: String(message.provider),
    model: message.model,
    responseId: message.responseId,
    stopReason: message.stopReason,
    usage: message.usage,
  };
}

export function summarizeUsageRecords(runName: string, runPath: string, records: UsageRecord[]): TranscriptUsageSummary {
  const totals = emptyUsage();
  for (const record of records) {
    addUsage(totals, record.usage);
  }

  return {
    runName,
    runPath,
    requestCount: records.length,
    totals,
    records,
  };
}

function formatCost(value: number) {
  return `$${value.toFixed(6)}`;
}

function usageMarkdown(summary: TranscriptUsageSummary) {
  const rows = summary.records.map((record, index) => {
    const usage = record.usage;
    return [
      index + 1,
      record.provider,
      record.model,
      record.stopReason,
      usage.input,
      usage.output,
      usage.cacheRead,
      usage.cacheWrite,
      usage.totalTokens,
      formatCost(usage.cost.total),
    ].join(" | ");
  });

  return `# Usage

- Run: \`${summary.runName}\`
- Requests: \`${summary.requestCount}\`
- Input tokens: \`${summary.totals.input}\`
- Output tokens: \`${summary.totals.output}\`
- Cache read tokens: \`${summary.totals.cacheRead}\`
- Cache write tokens: \`${summary.totals.cacheWrite}\`
- Total tokens: \`${summary.totals.totalTokens}\`
- Estimated cost: \`${formatCost(summary.totals.cost.total)}\`

| # | Provider | Model | Stop | Input | Output | Cache Read | Cache Write | Total | Cost |
|---|----------|-------|------|-------|--------|------------|-------------|-------|------|
${rows.length > 0 ? rows.join("\n") : "| - | - | - | - | 0 | 0 | 0 | 0 | 0 | $0.000000 |"}
`;
}

export function writeUsageArtifacts(runDir: string, summary: TranscriptUsageSummary) {
  writeFileSync(join(runDir, "usage.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(join(runDir, "usage.md"), usageMarkdown(summary), "utf8");
}
