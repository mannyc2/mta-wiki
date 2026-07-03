import OpenAI from "openai";
import {
  calculateCost,
  clampThinkingLevel,
  createAssistantMessageEventStream,
  parseStreamingJson,
  registerApiProvider,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type StreamOptions,
  type Usage,
} from "@earendil-works/pi-ai";
import { convertMessages } from "@earendil-works/pi-ai/openai-completions";

export const PIONEER_OPENAI_COMPLETIONS_API = "pioneer-openai-completions";

type PioneerOpenAIOptions = StreamOptions & {
  reasoningEffort?: SimpleStreamOptions["reasoning"];
  temperature?: number;
  maxTokens?: number;
  toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
};

type ConvertMessagesCompat = Parameters<typeof convertMessages>[2];

const PIONEER_COMPAT: ConvertMessagesCompat = {
  supportsStore: true,
  supportsDeveloperRole: true,
  supportsReasoningEffort: true,
  supportsUsageInStreaming: true,
  maxTokensField: "max_completion_tokens",
  requiresToolResultName: false,
  requiresAssistantAfterToolResult: false,
  requiresThinkingAsText: false,
  requiresReasoningContentOnAssistantMessages: true,
  thinkingFormat: "deepseek",
  openRouterRouting: {},
  vercelGatewayRouting: {},
  zaiToolStream: false,
  supportsStrictMode: true,
  sendSessionAffinityHeaders: false,
  supportsLongCacheRetention: true,
};

type ScratchToolCall = Extract<AssistantMessage["content"][number], { type: "toolCall" }> & {
  partialArgs?: string;
  streamIndex?: number;
};

type ScratchBlock = AssistantMessage["content"][number] & {
  partialArgs?: string;
  streamIndex?: number;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/^\$/u, "").replaceAll(",", "");
  if (normalized.length === 0) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberField(raw: Record<string, unknown>, fields: string[]): number | undefined {
  for (const field of fields) {
    const value = numberValue(raw[field]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function numberPath(raw: Record<string, unknown>, path: string[]): number | undefined {
  let current: unknown = raw;
  for (const part of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[part];
  }
  return numberValue(current);
}

function numberPathAny(raw: Record<string, unknown>, paths: string[][]): number | undefined {
  for (const path of paths) {
    const value = numberPath(raw, path);
    if (value !== undefined) return value;
  }
  return undefined;
}

function costField(raw: Record<string, unknown>, fields: string[]): number | undefined {
  const costObjects = [
    raw,
    asRecord(raw.cost),
    asRecord(raw.costs),
    asRecord(raw.cost_details),
    asRecord(raw.billing),
    asRecord(raw.pricing),
  ].filter((candidate): candidate is Record<string, unknown> => Boolean(candidate));

  for (const candidate of costObjects) {
    const value = numberField(candidate, fields);
    if (value !== undefined) return value;
  }

  return undefined;
}

function responseCostFromRawUsage(rawUsage: Record<string, unknown>): Partial<Usage["cost"]> | undefined {
  const scalarCost = numberValue(rawUsage.cost);
  const input = costField(rawUsage, ["input", "input_cost", "prompt", "prompt_cost", "prompt_tokens_cost"]);
  const output = costField(rawUsage, ["output", "output_cost", "completion", "completion_cost", "completion_tokens_cost"]);
  const cacheRead = costField(rawUsage, [
    "cacheRead",
    "cache_read",
    "cache_read_cost",
    "prompt_cache_read",
    "prompt_cache_read_cost",
  ]);
  const cacheWrite = costField(rawUsage, [
    "cacheWrite",
    "cache_write",
    "cache_write_cost",
    "prompt_cache_write",
    "prompt_cache_write_cost",
  ]);
  const total =
    scalarCost ??
    costField(rawUsage, [
      "total",
      "total_cost",
      "total_price",
      "estimated_cost",
      "estimated_price",
      "billed_cost",
      "cost_usd",
      "total_cost_usd",
    ]);

  if (input === undefined && output === undefined && cacheRead === undefined && cacheWrite === undefined && total === undefined) {
    return undefined;
  }

  const result: Partial<Usage["cost"]> = {};
  if (input !== undefined) result.input = input;
  if (output !== undefined) result.output = output;
  if (cacheRead !== undefined) result.cacheRead = cacheRead;
  if (cacheWrite !== undefined) result.cacheWrite = cacheWrite;
  if (total !== undefined) result.total = total;
  return result;
}

function sameTokenCount(left: number | undefined, right: number): boolean {
  return left !== undefined && Math.abs(left - right) < 0.001;
}

export function pioneerUsageFromRawUsage(raw: unknown, model: Model<any>): Usage {
  const rawUsage = asRecord(raw) ?? {};
  const promptTokens = numberField(rawUsage, ["prompt_tokens", "input_tokens"]) ?? 0;
  const outputTokens = numberField(rawUsage, ["completion_tokens", "output_tokens"]) ?? 0;
  const cacheReadTokens =
    numberField(rawUsage, ["cache_read_tokens", "cache_read_input_tokens", "prompt_cache_hit_tokens"]) ??
    numberPathAny(rawUsage, [
      ["prompt_tokens_details", "cached_tokens"],
      ["input_tokens_details", "cached_tokens"],
    ]) ??
    0;
  const cacheWriteTokens =
    numberField(rawUsage, ["cache_write_tokens", "cache_creation_input_tokens", "prompt_cache_write_tokens"]) ??
    numberPathAny(rawUsage, [
      ["prompt_tokens_details", "cache_write_tokens"],
      ["input_tokens_details", "cache_write_tokens"],
      ["input_tokens_details", "cache_creation_tokens"],
    ]) ??
    0;
  const rawTotalTokens = numberField(rawUsage, ["total_tokens", "totalTokens"]);

  const splitTotal = promptTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  const openAITotal = promptTokens + outputTokens;
  const inputTokens = sameTokenCount(rawTotalTokens, openAITotal)
    ? Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens)
    : promptTokens;

  const usage: Usage = {
    input: inputTokens,
    output: outputTokens,
    cacheRead: cacheReadTokens,
    cacheWrite: cacheWriteTokens,
    totalTokens: rawTotalTokens ?? splitTotal,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };

  calculateCost(model, usage);

  const responseCost = responseCostFromRawUsage(rawUsage);
  if (responseCost) {
    usage.cost.input = responseCost.input ?? usage.cost.input;
    usage.cost.output = responseCost.output ?? usage.cost.output;
    usage.cost.cacheRead = responseCost.cacheRead ?? usage.cost.cacheRead;
    usage.cost.cacheWrite = responseCost.cacheWrite ?? usage.cost.cacheWrite;
    usage.cost.total =
      responseCost.total ??
      usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
  }

  return usage;
}

function emptyAssistantMessage(model: Model<any>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function convertTools(context: Context) {
  return context.tools?.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: false,
    },
  }));
}

function mappedReasoningEffort(model: Model<any>, reasoningEffort: PioneerOpenAIOptions["reasoningEffort"]) {
  if (!reasoningEffort) return undefined;
  return model.thinkingLevelMap?.[reasoningEffort] ?? reasoningEffort;
}

function buildParams(model: Model<any>, context: Context, options?: PioneerOpenAIOptions): Record<string, unknown> {
  const params: Record<string, unknown> = {
    model: model.id,
    messages: convertMessages(model, context, PIONEER_COMPAT),
    stream: true,
    stream_options: { include_usage: true },
    store: false,
  };

  if (options?.maxTokens !== undefined) params.max_completion_tokens = options.maxTokens;
  if (options?.temperature !== undefined) params.temperature = options.temperature;

  const tools = convertTools(context);
  if (tools && tools.length > 0) params.tools = tools;
  if (options?.toolChoice) params.tool_choice = options.toolChoice;

  if (model.reasoning) {
    params.thinking = { type: options?.reasoningEffort ? "enabled" : "disabled" };
    const effort = mappedReasoningEffort(model, options?.reasoningEffort);
    if (effort) params.reasoning_effort = effort;
  }

  return params;
}

function makeOpenAIClient(model: Model<any>, apiKey: string, headers?: Record<string, string>) {
  return new OpenAI({
    apiKey,
    baseURL: model.baseUrl,
    dangerouslyAllowBrowser: true,
    defaultHeaders: { ...model.headers, ...headers },
  });
}

function mapStopReason(reason: unknown): { stopReason: AssistantMessage["stopReason"]; errorMessage?: string } {
  switch (reason) {
    case null:
    case "stop":
    case "end":
      return { stopReason: "stop" };
    case "length":
      return { stopReason: "length" };
    case "function_call":
    case "tool_calls":
      return { stopReason: "toolUse" };
    case "content_filter":
    case "network_error":
      return { stopReason: "error", errorMessage: `Provider finish_reason: ${String(reason)}` };
    default:
      return { stopReason: "error", errorMessage: `Provider finish_reason: ${String(reason)}` };
  }
}

function toolCallDelta(raw: unknown): { id?: string; index?: number; name?: string; arguments?: string } | undefined {
  const toolCall = asRecord(raw);
  if (!toolCall) return undefined;
  const fn = asRecord(toolCall.function);
  const result: { id?: string; index?: number; name?: string; arguments?: string } = {};
  const id = typeof toolCall.id === "string" ? toolCall.id : undefined;
  const index = typeof toolCall.index === "number" ? toolCall.index : undefined;
  const name = typeof fn?.name === "string" ? fn.name : undefined;
  const args = typeof fn?.arguments === "string" ? fn.arguments : undefined;
  if (id !== undefined) result.id = id;
  if (index !== undefined) result.index = index;
  if (name !== undefined) result.name = name;
  if (args !== undefined) result.arguments = args;
  return result;
}

function stripScratch(block: ScratchBlock) {
  delete block.partialArgs;
  delete block.streamIndex;
}

function streamPioneerOpenAICompletions(model: Model<any>, context: Context, options?: PioneerOpenAIOptions) {
  const stream = createAssistantMessageEventStream();

  void (async () => {
    const output = emptyAssistantMessage(model);

    try {
      const apiKey = options?.apiKey;
      if (!apiKey) throw new Error(`No API key for provider: ${model.provider}`);

      const client = makeOpenAIClient(model, apiKey, options?.headers);
      let params = buildParams(model, context, options);
      const nextParams = await options?.onPayload?.(params, model);
      if (nextParams !== undefined) params = nextParams as Record<string, unknown>;

      const requestOptions = {
        ...(options?.signal ? { signal: options.signal } : {}),
        ...(options?.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
        maxRetries: options?.maxRetries ?? 0,
      };
      const { data: openaiStream, response } = await client.chat.completions
        .create(params as never, requestOptions)
        .withResponse();

      await options?.onResponse?.({ status: response.status, headers: Object.fromEntries(response.headers.entries()) }, model);
      stream.push({ type: "start", partial: output });

      let textBlock: Extract<AssistantMessage["content"][number], { type: "text" }> | undefined;
      let thinkingBlock: Extract<AssistantMessage["content"][number], { type: "thinking" }> | undefined;
      let hasFinishReason = false;
      const toolCallBlocksByIndex = new Map<number, ScratchToolCall>();
      const toolCallBlocksById = new Map<string, ScratchToolCall>();
      const blocks = output.content;
      const getContentIndex = (block: AssistantMessage["content"][number]) => blocks.indexOf(block);

      const finishBlock = (block: ScratchBlock) => {
        const contentIndex = getContentIndex(block);
        if (contentIndex === -1) return;
        stripScratch(block);
        if (block.type === "text") {
          stream.push({ type: "text_end", contentIndex, content: block.text, partial: output });
        } else if (block.type === "thinking") {
          stream.push({ type: "thinking_end", contentIndex, content: block.thinking, partial: output });
        } else if (block.type === "toolCall") {
          stream.push({ type: "toolcall_end", contentIndex, toolCall: block, partial: output });
        }
      };

      const ensureTextBlock = () => {
        if (!textBlock) {
          textBlock = { type: "text", text: "" };
          blocks.push(textBlock);
          stream.push({ type: "text_start", contentIndex: getContentIndex(textBlock), partial: output });
        }
        return textBlock;
      };

      const ensureThinkingBlock = (thinkingSignature: string) => {
        if (!thinkingBlock) {
          thinkingBlock = { type: "thinking", thinking: "", thinkingSignature };
          blocks.push(thinkingBlock);
          stream.push({ type: "thinking_start", contentIndex: getContentIndex(thinkingBlock), partial: output });
        }
        return thinkingBlock;
      };

      const ensureToolCallBlock = (toolCall: NonNullable<ReturnType<typeof toolCallDelta>>) => {
        const streamIndex = toolCall.index;
        let block = streamIndex !== undefined ? toolCallBlocksByIndex.get(streamIndex) : undefined;
        if (!block && toolCall.id) block = toolCallBlocksById.get(toolCall.id);
        if (!block) {
          const nextBlock: ScratchToolCall = {
            type: "toolCall",
            id: toolCall.id ?? "",
            name: toolCall.name ?? "",
            arguments: {},
            partialArgs: "",
          };
          if (streamIndex !== undefined) nextBlock.streamIndex = streamIndex;
          block = nextBlock;
          if (streamIndex !== undefined) toolCallBlocksByIndex.set(streamIndex, block);
          if (toolCall.id) toolCallBlocksById.set(toolCall.id, block);
          blocks.push(block);
          stream.push({ type: "toolcall_start", contentIndex: getContentIndex(block), partial: output });
        }
        if (streamIndex !== undefined && block.streamIndex === undefined) {
          block.streamIndex = streamIndex;
          toolCallBlocksByIndex.set(streamIndex, block);
        }
        if (toolCall.id) {
          block.id = block.id || toolCall.id;
          toolCallBlocksById.set(toolCall.id, block);
        }
        if (toolCall.name) block.name = block.name || toolCall.name;
        return block;
      };

      for await (const rawChunk of openaiStream as unknown as AsyncIterable<unknown>) {
        const chunk = asRecord(rawChunk);
        if (!chunk) continue;
        if (!output.responseId && typeof chunk.id === "string") output.responseId = chunk.id;
        if (typeof chunk.model === "string" && chunk.model.length > 0 && chunk.model !== model.id) {
          output.responseModel ??= chunk.model;
        }
        if (chunk.usage) output.usage = pioneerUsageFromRawUsage(chunk.usage, model);

        const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
        const choice = asRecord(choices[0]);
        if (!choice) continue;
        if (!chunk.usage && choice.usage) output.usage = pioneerUsageFromRawUsage(choice.usage, model);

        if (choice.finish_reason) {
          const result = mapStopReason(choice.finish_reason);
          output.stopReason = result.stopReason;
          if (result.errorMessage) output.errorMessage = result.errorMessage;
          hasFinishReason = true;
        }

        const delta = asRecord(choice.delta);
        if (!delta) continue;

        const contentDelta = typeof delta.content === "string" ? delta.content : "";
        if (contentDelta.length > 0) {
          const block = ensureTextBlock();
          block.text += contentDelta;
          stream.push({ type: "text_delta", contentIndex: getContentIndex(block), delta: contentDelta, partial: output });
        }

        for (const field of ["reasoning_content", "reasoning", "reasoning_text"]) {
          const thinkingDelta = typeof delta[field] === "string" ? delta[field] : "";
          if (thinkingDelta.length === 0) continue;
          const block = ensureThinkingBlock(field);
          block.thinking += thinkingDelta;
          stream.push({ type: "thinking_delta", contentIndex: getContentIndex(block), delta: thinkingDelta, partial: output });
          break;
        }

        const rawToolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
        for (const rawToolCall of rawToolCalls) {
          const parsedToolCall = toolCallDelta(rawToolCall);
          if (!parsedToolCall) continue;
          const block = ensureToolCallBlock(parsedToolCall);
          let argsDelta = "";
          if (parsedToolCall.arguments) {
            argsDelta = parsedToolCall.arguments;
            block.partialArgs = (block.partialArgs ?? "") + parsedToolCall.arguments;
            block.arguments = parseStreamingJson(block.partialArgs) as Record<string, unknown>;
          }
          stream.push({ type: "toolcall_delta", contentIndex: getContentIndex(block), delta: argsDelta, partial: output });
        }
      }

      for (const block of blocks as ScratchBlock[]) finishBlock(block);
      if (options?.signal?.aborted) throw new Error("Request was aborted");
      if (output.stopReason === "error") throw new Error(output.errorMessage || "Provider returned an error stop reason");
      if (!hasFinishReason) throw new Error("Stream ended without finish_reason");

      const reason = output.stopReason === "length" || output.stopReason === "toolUse" ? output.stopReason : "stop";
      stream.push({ type: "done", reason, message: output });
      stream.end();
    } catch (error) {
      for (const block of output.content as ScratchBlock[]) stripScratch(block);
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
}

function streamSimplePioneerOpenAICompletions(model: Model<any>, context: Context, options?: SimpleStreamOptions) {
  const clampedReasoning = options?.reasoning ? clampThinkingLevel(model, options.reasoning) : undefined;
  const reasoningEffort = clampedReasoning === "off" ? undefined : clampedReasoning;
  return streamPioneerOpenAICompletions(model, context, { ...options, reasoningEffort });
}

export function registerPioneerOpenAIProvider() {
  registerApiProvider(
    {
      api: PIONEER_OPENAI_COMPLETIONS_API,
      stream: streamPioneerOpenAICompletions,
      streamSimple: streamSimplePioneerOpenAICompletions,
    },
    "mta-wiki-pioneer-openai",
  );
}
