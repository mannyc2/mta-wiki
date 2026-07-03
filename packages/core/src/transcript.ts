import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { AgentHarnessEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { readConfig } from "./config.js";
import { repoRoot } from "./paths.js";
import type { HarnessConfig, HarnessTranscriptCommand, TranscriptInfo, TranscriptUsageSummary, UsageRecord } from "./types.js";
import { summarizeUsageRecords, usageRecordFromMessage, writeUsageArtifacts } from "./usage.js";

export type TranscriptWriter = {
  runId: string;
  runDir: string;
  eventsPath: string;
  summaryPath: string;
  responsePath: string;
  usagePath: string;
  usageMarkdownPath: string;
  write: (type: string, data?: Record<string, unknown>) => void;
  writeSummary: (content: string) => void;
  writeResponse: (content: string) => void;
  recordAssistantUsage: (message: AssistantMessage) => void;
};

function timestampForPath(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function runIdFor(command: HarnessTranscriptCommand, subject: string) {
  return `${timestampForPath()}_${process.pid}-${randomUUID().slice(0, 8)}_${safeSlug(command)}_${safeSlug(subject)}`;
}

function summarizeMessageForEvent(message: AgentMessage) {
  if (!("role" in message)) {
    return { type: "custom" };
  }

  if (message.role === "user") {
    return {
      role: message.role,
      contentBytes:
        typeof message.content === "string"
          ? Buffer.byteLength(message.content)
          : Buffer.byteLength(JSON.stringify(message.content)),
    };
  }

  if (message.role === "toolResult") {
    return {
      role: message.role,
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      isError: message.isError,
      contentBytes: Buffer.byteLength(JSON.stringify(message.content)),
    };
  }

  if (message.role !== "assistant") {
    return { role: message.role, type: "custom" };
  }

  return {
    role: message.role,
    stopReason: message.stopReason,
    content: message.content.map((part) => {
      if (part.type === "text") {
        return { type: part.type, bytes: Buffer.byteLength(part.text) };
      }
      if (part.type === "thinking") {
        return { type: part.type, bytes: Buffer.byteLength(part.thinking) };
      }
      if (part.type === "toolCall") {
        const partialArgs =
          "partialArgs" in part && typeof part.partialArgs === "string" ? part.partialArgs : undefined;
        return {
          type: part.type,
          id: part.id,
          name: part.name,
          argumentBytes: Buffer.byteLength(JSON.stringify(part.arguments ?? {})),
          partialArgumentBytes: partialArgs ? Buffer.byteLength(partialArgs) : 0,
        };
      }
      return { type: "unknown" };
    }),
    usage: message.usage,
  };
}

export function createTranscript(config: HarnessConfig, command: HarnessTranscriptCommand, subject: string, dryRun: boolean): TranscriptWriter {
  const runId = runIdFor(command, subject);
  const runDir = join(repoRoot, config.transcriptsDir, "runs", runId);
  const eventsPath = join(runDir, "events.jsonl");
  const summaryPath = join(runDir, "summary.md");
  const responsePath = join(runDir, "response.md");
  const usagePath = join(runDir, "usage.json");
  const usageMarkdownPath = join(runDir, "usage.md");
  const usageRecords: UsageRecord[] = [];

  mkdirSync(runDir, { recursive: true });

  const writer: TranscriptWriter = {
    runId,
    runDir,
    eventsPath,
    summaryPath,
    responsePath,
    usagePath,
    usageMarkdownPath,
    write(type, data = {}) {
      appendFileSync(eventsPath, `${JSON.stringify({ ts: new Date().toISOString(), type, ...data })}\n`);
    },
    writeSummary(content) {
      writeFileSync(summaryPath, content);
    },
    writeResponse(content) {
      writeFileSync(responsePath, content);
    },
    recordAssistantUsage(message) {
      usageRecords.push(usageRecordFromMessage(message));
      const summary = summarizeUsageRecords(runId, runDir, usageRecords);
      writeUsageArtifacts(runDir, summary);
      this.write("usage_recorded", {
        requestCount: summary.requestCount,
        totalTokens: summary.totals.totalTokens,
        cacheRead: summary.totals.cacheRead,
        cacheWrite: summary.totals.cacheWrite,
        cost: summary.totals.cost.total,
        usagePath: relative(repoRoot, usagePath),
        usageMarkdownPath: relative(repoRoot, usageMarkdownPath),
      });
    },
  };

  writer.write("run_created", {
    runId,
    command,
    subject,
    dryRun,
    cwd: repoRoot,
  });

  return writer;
}

export function summarizeEvent(event: AgentHarnessEvent): Record<string, unknown> {
  switch (event.type) {
    case "before_agent_start":
      return {
        prompt: event.prompt,
        systemPrompt: event.systemPrompt,
        skills: event.resources.skills?.map((skill) => skill.name) ?? [],
        promptTemplates: event.resources.promptTemplates?.map((template) => template.name) ?? [],
      };
    case "context":
      return {
        messageCount: event.messages.length,
        roles: event.messages.map((message) => "role" in message ? message.role : "custom"),
      };
    case "before_provider_payload":
      return {
        provider: event.model.provider,
        model: event.model.id,
        payload: event.payload,
      };
    case "before_provider_request":
      return {
        provider: event.model.provider,
        model: event.model.id,
        sessionId: event.sessionId,
        streamOptions: event.streamOptions,
      };
    case "after_provider_response":
      return {
        status: event.status,
        headers: event.headers,
      };
    case "message_end":
      return { message: event.message };
    case "message_start":
      return { message: event.message };
    case "message_update":
      return {
        message: summarizeMessageForEvent(event.message),
        assistantMessageEventType: event.assistantMessageEvent.type,
      };
    case "turn_end":
      return {
        message: event.message,
        toolResults: event.toolResults,
      };
    case "agent_end":
      return { messages: event.messages };
    case "tool_call":
      return {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.input,
      };
    case "tool_result":
      return {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.input,
        content: event.content,
        details: event.details,
        isError: event.isError,
      };
    case "tool_execution_start":
    case "tool_execution_update":
    case "tool_execution_end":
      return { ...event };
    case "queue_update":
      return {
        steerCount: event.steer.length,
        followUpCount: event.followUp.length,
        nextTurnCount: event.nextTurn.length,
      };
    case "save_point":
      return { hadPendingMutations: event.hadPendingMutations };
    case "settled":
      return { nextTurnCount: event.nextTurnCount };
    case "abort":
      return {
        clearedSteerCount: event.clearedSteer.length,
        clearedFollowUpCount: event.clearedFollowUp.length,
      };
    case "session_before_compact":
    case "session_compact":
    case "session_before_tree":
    case "session_tree":
    case "model_update":
    case "thinking_level_update":
    case "resources_update":
    case "tools_update":
      return { ...event };
    default:
      return {};
  }
}

export function listTranscripts(config = readConfig()): TranscriptInfo[] {
  const runsRoot = join(repoRoot, config.transcriptsDir, "runs");
  if (!existsSync(runsRoot)) return [];

  return readdirSync(runsRoot)
    .map((name) => {
      const path = join(runsRoot, name);
      return { name, path, mtime: statSync(path).mtimeMs };
    })
    .filter((entry) => statSync(entry.path).isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, 20)
    .map(({ name, path }) => ({ name, path }));
}

function resolveTranscriptRun(runName: string | undefined, config = readConfig()) {
  const transcripts = listTranscripts(config);
  const runsRoot = join(repoRoot, config.transcriptsDir, "runs");

  if (!runName) {
    const latest = transcripts[0];
    if (!latest) {
      throw new Error("No transcript runs found.");
    }
    return latest.path;
  }

  const exact = transcripts.find((transcript) => transcript.name === runName);
  if (exact) return exact.path;

  const path = join(runsRoot, runName);
  if (existsSync(path) && statSync(path).isDirectory()) {
    return path;
  }

  throw new Error(`Transcript run not found: ${runName}`);
}

function usageRecordsFromEvents(eventsPath: string) {
  const records: UsageRecord[] = [];
  const lines = readFileSync(eventsPath, "utf8").split(/\r?\n/u).filter((line) => line.length > 0);

  for (const line of lines) {
    const event = JSON.parse(line) as {
      type?: string;
      eventType?: string;
      message?: AssistantMessage;
    };

    if (event.type !== "agent_event" || event.eventType !== "message_end") continue;
    if (event.message?.role !== "assistant") continue;

    records.push(usageRecordFromMessage(event.message));
  }

  return records;
}

export function summarizeTranscriptUsage(runName?: string): TranscriptUsageSummary {
  const runPath = resolveTranscriptRun(runName);
  const eventsPath = join(runPath, "events.jsonl");

  if (!existsSync(eventsPath)) {
    throw new Error(`Missing transcript events file: ${relative(repoRoot, eventsPath)}`);
  }

  return summarizeUsageRecords(basename(runPath), runPath, usageRecordsFromEvents(eventsPath));
}

export function writeTranscriptUsageArtifacts(runName?: string): TranscriptUsageSummary {
  const summary = summarizeTranscriptUsage(runName);
  writeUsageArtifacts(summary.runPath, summary);
  return summary;
}

type TranscriptEvent = {
  ts?: string;
  type?: string;
  [key: string]: unknown;
};

type MessagePart = {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
};

type TranscriptMessage = {
  role?: string;
  content?: string | MessagePart[];
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
  usage?: unknown;
  stopReason?: string;
};

export type RenderTranscriptOptions = {
  full?: boolean | undefined;
  maxResultChars?: number | undefined;
  maxArgChars?: number | undefined;
};

type ResolvedRenderTranscriptOptions = {
  full: boolean;
  maxResultChars: number;
  maxArgChars: number;
};

function readTranscriptEvents(runName?: string) {
  const runPath = resolveTranscriptRun(runName);
  const eventsPath = join(runPath, "events.jsonl");

  if (!existsSync(eventsPath)) {
    throw new Error(`Missing transcript events file: ${relative(repoRoot, eventsPath)}`);
  }

  const events = readFileSync(eventsPath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TranscriptEvent);

  return { runPath, eventsPath, events };
}

function eventTime(event: TranscriptEvent) {
  return event.ts ? `[${event.ts}] ` : "";
}

function fenced(value: string, language = "") {
  return ["```" + language, value.trimEnd(), "```"].join("\n");
}

function stringify(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function stringifyCompact(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function valueLiteral(value: unknown) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  return stringifyCompact(value);
}

function maybeTruncate(value: string, full: boolean, maxChars: number) {
  if (full || value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}\n... [truncated ${value.length - maxChars} chars; use --full]`;
}

function lineCount(value: string) {
  return value.length === 0 ? 0 : value.split(/\r?\n/u).length;
}

function markdownPreview(value: string) {
  const lines = value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const headings = lines.filter((line) => line.startsWith("#")).slice(0, 4);
  return headings.length > 0 ? headings.join(" | ") : lines.slice(0, 2).join(" / ");
}

function frontmatterPreview(markdown: string) {
  const match = /^---\n([\s\S]*?)\n---/u.exec(markdown);
  const frontmatter = match?.[1] ?? markdown;
  const keys = ["record_id", "record_kind", "display_name", "source_id", "local_observation_id", "review_state", "truth_status"];
  const preview: Record<string, string> = {};

  const cleanValue = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      try {
        return String(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  };

  for (const key of keys) {
    const line = frontmatter.split(/\r?\n/u).find((candidate) => candidate.startsWith(`${key}:`));
    if (line) preview[key] = cleanValue(line.slice(key.length + 1));
  }

  const payloadKeys = Array.from(frontmatter.matchAll(/^  ([A-Za-z0-9_-]+):/gmu)).map((match) => match[1]).filter(Boolean);
  if (payloadKeys.length > 0) preview.payload_keys = payloadKeys.slice(0, 12).join(", ");

  const evidenceCount = (frontmatter.match(/^  -$/gmu) ?? []).length;
  if (evidenceCount > 0) preview.evidence_refs = String(evidenceCount);

  return preview;
}

function listPagesPreview(text: string) {
  try {
    const parsed = JSON.parse(text) as { pages?: Array<{ path?: string; record_kind?: string; display_name?: string }> };
    return (parsed.pages ?? [])
      .map((page) => `- ${page.path ?? "(unknown)"}${page.record_kind ? ` (${page.record_kind})` : ""}${page.display_name ? `: ${page.display_name}` : ""}`)
      .join("\n");
  } catch {
    return undefined;
  }
}

function toolFunctionCall(toolName: unknown, args: unknown, options: ResolvedRenderTranscriptOptions) {
  const name = String(toolName ?? "");
  const value = (args ?? {}) as Record<string, unknown>;

  if (name === "mta_write_writer_context" && typeof value.markdown === "string") {
    return `${name}(path=${valueLiteral(value.path)}, markdown_chars=${value.markdown.length}, markdown_lines=${lineCount(value.markdown)}, markdown_preview=${valueLiteral(markdownPreview(value.markdown))})`;
  }

  if (name === "mta_read_wiki_page" || name === "mta_list_wiki_pages") {
    const argsText = Object.keys(value)
      .sort()
      .map((key) => `${key}=${valueLiteral(value[key])}`)
      .join(", ");
    return `${name}(${argsText})`;
  }

  const argsText = Object.keys(value)
    .sort()
    .map((key) => `${key}=${valueLiteral(value[key])}`)
    .join(", ");
  return `${name}(${maybeTruncate(argsText, false, options.maxArgChars)})`;
}

function summarizeToolArgs(toolName: unknown, args: unknown, options: ResolvedRenderTranscriptOptions) {
  if (options.full) return fenced(stringify(args ?? {}), "json");
  return toolFunctionCall(toolName, args, options);
}

function messageText(content: TranscriptMessage["content"], options: ResolvedRenderTranscriptOptions) {
  if (typeof content === "string") return maybeTruncate(content, options.full, options.maxResultChars);
  if (!Array.isArray(content)) return "";

  const rendered: string[] = [];
  for (const part of content) {
    if (part.type === "text" && part.text) {
      rendered.push(maybeTruncate(part.text, options.full, options.maxResultChars));
      continue;
    }

    if (part.type === "thinking") {
      const bytes = Buffer.byteLength(part.thinking ?? "");
      rendered.push(`[thinking omitted: ${bytes} bytes]`);
      continue;
    }

    if (part.type === "toolCall") {
      if (options.full) {
        rendered.push(`\n${toolFunctionCall(part.name, part.arguments ?? {}, options)}`);
        rendered.push(summarizeToolArgs(part.name, part.arguments ?? {}, options));
      } else {
        rendered.push(summarizeToolArgs(part.name, part.arguments ?? {}, options));
      }
    }
  }

  return rendered.join("\n").trim();
}

function summarizeToolResult(toolName: unknown, result: unknown, options: ResolvedRenderTranscriptOptions) {
  const value = result as {
    content?: Array<{ type?: string; text?: string }>;
    details?: unknown;
  };
  const name = String(toolName ?? "");

  if (!options.full) {
    const details = (value.details ?? {}) as Record<string, unknown>;
    const text = value.content?.find((content) => content.type === "text")?.text ?? "";

    if (name === "mta_read_wiki_page") {
      return [
        `Read page: \`${String(details.path ?? "(unknown)")}\` (${String(details.bytes ?? "?")} bytes)`,
        `frontmatter: ${stringifyCompact(frontmatterPreview(text))}`,
      ].join("\n");
    }

    if (name === "mta_write_writer_context") {
      return `Wrote writer context: \`${String(details.path ?? "(unknown)")}\` (${String(details.bytes ?? "?")} bytes)`;
    }

    if (name === "mta_list_wiki_pages") {
      const preview = listPagesPreview(text);
      return [
        preview || (text ? maybeTruncate(text.replace(/\s+/gu, " "), false, options.maxResultChars) : ""),
        `Details: ${JSON.stringify(details)}`,
      ].filter(Boolean).join("\n");
    }
  }

  const parts: string[] = [];

  for (const content of value.content ?? []) {
    if (content.type === "text" && content.text) {
      parts.push(maybeTruncate(content.text, options.full, options.maxResultChars));
    }
  }

  if (value.details !== undefined) {
    parts.push("Details:");
    parts.push(fenced(stringify(value.details), "json"));
  }

  return parts.join("\n");
}

function artifactSection(runPath: string) {
  const paths: Array<[string, string]> = [
    ["Summary", join(runPath, "summary.md")],
    ["Response", join(runPath, "response.md")],
    ["Usage", join(runPath, "usage.md")],
    ["Events", join(runPath, "events.jsonl")],
  ];

  return paths
    .filter(([, path]) => existsSync(path))
    .map(([label, path]) => `- ${label}: \`${relative(repoRoot, path)}\``)
    .join("\n");
}

export function renderTranscript(runName?: string, renderOptions: RenderTranscriptOptions = {}) {
  const options: ResolvedRenderTranscriptOptions = {
    full: renderOptions.full ?? false,
    maxResultChars: renderOptions.maxResultChars ?? 350,
    maxArgChars: renderOptions.maxArgChars ?? 260,
  };
  const { runPath, events } = readTranscriptEvents(runName);
  const run = basename(runPath);
  const output: string[] = [`# Transcript ${run}`, "", "## Artifacts", "", artifactSection(runPath), "", "## Replay"];

  const seenMessageEnds = new Set<string>();

  for (const [index, event] of events.entries()) {
    if (event.type === "run_created") {
      output.push("");
      output.push(`### ${eventTime(event)}Run Created`);
      output.push(fenced(stringify({
        command: event.command,
        subject: event.subject,
        dryRun: event.dryRun,
        cwd: event.cwd,
      }), "json"));
      continue;
    }

    if (event.type === "before_agent_start") {
      output.push("");
      output.push(`### ${eventTime(event)}Prompt`);
      if (typeof event.systemPrompt === "string") {
        output.push("System prompt:");
        output.push(fenced(event.systemPrompt));
      }
      if (typeof event.prompt === "string") {
        output.push("User prompt:");
        output.push(fenced(event.prompt));
      }
      continue;
    }

    if (event.type === "message_end") {
      const message = event.message as TranscriptMessage | undefined;
      if (!message?.role) continue;

      const messageKey = `${index}:${message.role}:${message.toolCallId ?? ""}`;
      if (seenMessageEnds.has(messageKey)) continue;
      seenMessageEnds.add(messageKey);

      if (message.role === "user") {
        output.push("");
        output.push(`### ${eventTime(event)}User`);
        output.push(fenced(messageText(message.content, options)));
      } else if (message.role === "assistant") {
        output.push("");
        output.push(`### ${eventTime(event)}Assistant${message.stopReason ? ` (${message.stopReason})` : ""}`);
        output.push(messageText(message.content, options) || "_No visible assistant text._");
      } else if (message.role === "toolResult" && options.full) {
        output.push("");
        output.push(`### ${eventTime(event)}Tool Result: ${message.toolName ?? "unknown"}`);
        output.push(messageText(message.content, options));
      }
      continue;
    }

    if (event.type === "tool_execution_start") {
      if (!options.full) continue;
      output.push("");
      output.push(`### ${eventTime(event)}Tool Start: ${String(event.toolName ?? "unknown")}`);
      output.push(summarizeToolArgs(event.toolName, event.args ?? {}, options));
      continue;
    }

    if (event.type === "tool_execution_end") {
      output.push("");
      output.push(`### ${eventTime(event)}Tool End: ${String(event.toolName ?? "unknown")}${event.isError ? " (error)" : ""}`);
      output.push(summarizeToolResult(event.toolName, event.result, options) || "_No result content._");
      continue;
    }

    if (event.type === "usage_recorded") {
      output.push("");
      output.push(`### ${eventTime(event)}Usage`);
      output.push(`Requests: \`${event.requestCount}\`; total tokens: \`${event.totalTokens}\`; estimated cost: \`${event.cost}\``);
      continue;
    }
  }

  return `${output.join("\n")}\n`;
}
