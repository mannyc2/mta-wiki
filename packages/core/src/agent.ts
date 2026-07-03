import { AgentHarness, type JsonlSessionMetadata, type Session, type AgentTool } from "@earendil-works/pi-agent-core";
import type { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import { getModelApiKey, type ModelSelection } from "./models.js";
import { bucket } from "./rate-limit.js";
import { summarizeEvent, type TranscriptWriter } from "./transcript.js";

const DEFAULT_PROVIDER_TIMEOUT_MS = 120_000;
const DEFAULT_PROVIDER_MAX_RETRIES = 2;
const DEFAULT_PROVIDER_MAX_RETRY_DELAY_MS = 15_000;

type HarnessAgentOptions = ConstructorParameters<typeof AgentHarness>[0];
type ThinkingLevel = HarnessAgentOptions["thinkingLevel"];

/** A created or opened harness session, as returned by createHarnessSession/openHarnessSession. */
export type HarnessSessionBundle = {
  env: NodeExecutionEnv;
  session: Session<JsonlSessionMetadata>;
  sessionPath: string;
};

/**
 * Parse a positive-integer environment override. Returns undefined when unset/blank,
 * and throws when present but not a positive integer.
 */
export function positiveIntegerEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  }
  return value;
}

export type StreamOptionsOverrides = {
  timeoutMs?: number;
  maxRetries?: number;
  maxRetryDelayMs?: number;
};

/**
 * Provider stream options with consistent precedence across every harness agent:
 * MTA_PROVIDER_* env override, then a per-agent default override, then the lib default.
 */
export function providerStreamOptions(overrides: StreamOptionsOverrides = {}) {
  return {
    timeoutMs: positiveIntegerEnv("MTA_PROVIDER_TIMEOUT_MS") ?? overrides.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    maxRetries: positiveIntegerEnv("MTA_PROVIDER_MAX_RETRIES") ?? overrides.maxRetries ?? DEFAULT_PROVIDER_MAX_RETRIES,
    maxRetryDelayMs:
      positiveIntegerEnv("MTA_PROVIDER_MAX_RETRY_DELAY_MS") ?? overrides.maxRetryDelayMs ?? DEFAULT_PROVIDER_MAX_RETRY_DELAY_MS,
  };
}

/** Build the getApiKeyAndHeaders callback for a model selection, including the pioneer header. */
export function modelApiKeyAndHeaders(selection: ModelSelection) {
  return async () => {
    const apiKey = getModelApiKey(selection);
    if (!apiKey) return undefined;
    return selection.model.provider === "pioneer" ? { apiKey, headers: { "X-API-Key": apiKey } } : { apiKey };
  };
}

/** Stream every agent event into the run transcript and record assistant usage. */
export function subscribeTranscript(agent: AgentHarness, transcript: TranscriptWriter) {
  agent.subscribe((event) => {
    transcript.write(event.type, summarizeEvent(event));
    if (event.type === "message_end" && "role" in event.message && event.message.role === "assistant") {
      transcript.recordAssistantUsage(event.message);
    }
  });
}

/**
 * Wire the global per-provider rate limiter into an agent (campaign-concurrency-plan.md §2 P0-a).
 *
 * Channel discipline matters here and is verified against pi-agent-core@0.78.1:
 *  - `before_provider_request` is a HOOK dispatched via `emitBeforeProviderRequest` →
 *    `getHandlers(type)`, which consults the `agent.on(type)` registry and is awaited immediately
 *    before the HTTP request fires. So the bucket `acquire()` MUST be an `on(...)` handler — that
 *    is what actually throttles.
 *  - `after_provider_response` and `settled` are broadcast via `emitOwn`, which only reaches
 *    `agent.subscribe(...)` listeners — an `on("after_provider_response")` handler is NEVER called.
 *    So the 429 / header telemetry that drives the circuit breaker and the §3 ramp gates, plus the
 *    per-run `mta_rate_limit_stats` snapshot, MUST go through `subscribe(...)`.
 *
 * Getting this wrong silently disables the breaker and zeroes the request counters while leaving
 * the throttle working (W2 symptom: `requests:0` yet ingests clearly ran).
 */
export function subscribeRateLimit(agent: AgentHarness, transcript: TranscriptWriter, provider: string) {
  const local = { requests: 0, rateLimited: 0, waitMsTotal: 0, waitMsMax: 0 };

  // Throttle: hook channel (on), awaited before the request fires.
  agent.on("before_provider_request", async () => {
    const waited = await bucket(provider).acquire();
    local.waitMsTotal += waited;
    if (waited > local.waitMsMax) local.waitMsMax = waited;
    return {};
  });

  // Telemetry + circuit breaker: broadcast channel (subscribe).
  agent.subscribe((event) => {
    if (event.type === "after_provider_response") {
      local.requests += 1;
      if (event.status === 429) local.rateLimited += 1;
      bucket(provider).recordResponse(event.status, event.headers);
      return;
    }
    if (event.type === "settled") {
      transcript.write("mta_rate_limit_stats", {
        provider,
        requests: local.requests,
        rateLimited: local.rateLimited,
        waitMsTotal: Math.round(local.waitMsTotal),
        waitMsMax: Math.round(local.waitMsMax),
      });
    }
  });
}

export type BuildHarnessAgentOptions = {
  /** Resolved model/profile/api-key selection. */
  selection: ModelSelection;
  /** Run transcript the agent subscribes to. */
  transcript: TranscriptWriter;
  /** A created or opened session (env + session + sessionPath). */
  bundle: HarnessSessionBundle;
  /** Scoped tools for this agent — the per-agent difference. */
  tools: AgentTool[];
  /** Scoped system prompt for this agent — the per-agent difference. */
  systemPrompt: string;
  /** Defaults to "high". */
  thinkingLevel?: ThinkingLevel;
  /** Per-agent stream-option default overrides (env still takes precedence). */
  streamOptions?: StreamOptionsOverrides;
};

/**
 * Construct an AgentHarness with the shared harness-lib plumbing (model, stream options,
 * api-key headers, transcript subscription) and the caller's scoped tools + system prompt.
 */
export function buildHarnessAgent(options: BuildHarnessAgentOptions): { agent: AgentHarness; sessionPath: string } {
  const { selection, transcript, bundle, tools, systemPrompt } = options;
  const agent = new AgentHarness({
    env: bundle.env,
    session: bundle.session,
    tools,
    model: selection.model,
    thinkingLevel: options.thinkingLevel ?? selection.profile?.thinkingLevel ?? "high",
    streamOptions: providerStreamOptions(options.streamOptions),
    getApiKeyAndHeaders: modelApiKeyAndHeaders(selection),
    systemPrompt,
  });

  subscribeTranscript(agent, transcript);
  subscribeRateLimit(agent, transcript, selection.model.provider);
  return { agent, sessionPath: bundle.sessionPath };
}
