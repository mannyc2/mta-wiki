import type { Usage } from "@earendil-works/pi-ai";

export type HarnessRunCommand = "ingest" | "write" | "ask";
export type HarnessTranscriptCommand =
  | HarnessRunCommand
  | "resume"
  | "extract"
  | "identity-review-run"
  | "schema-proposal-run"
  | "ontology-normalize-run"
  | "canonicalize"
  | "canonicalize-review";

export type ProviderProfile = {
  provider: string;
  model: string;
  apiKeyEnv?: string;
  /** Base URL for OpenAI-compatible endpoints, e.g. the local embeddings vLLM server. */
  baseUrl?: string;
  /** Reasoning effort for thinking-capable models, mapped via the model's thinkingLevelMap
   *  (e.g. deepseek-v4-pro: "high" → reasoning_effort "high", "xhigh" → "max"). Defaults to "high". */
  thinkingLevel?: "minimal" | "low" | "medium" | "high" | "xhigh";
};

export type SandboxBashBackend = "docker" | "local";

export type SandboxConfig = {
  bash?: {
    backend?: SandboxBashBackend;
    dockerImage?: string;
    network?: "none" | "host";
    readOnlyRoot?: boolean;
    tmpfsSize?: string;
    shell?: string;
  };
};

export type HarnessConfig = {
  defaultProfile: string;
  transcriptsDir: string;
  profiles: Record<string, ProviderProfile>;
  sandbox?: SandboxConfig;
  /** Payload schema gate at the submit-tool boundary: warn journals findings, enforce rejects before journaling. Defaults to warn. */
  payloadSchemaMode?: "warn" | "enforce";
  /** Profile used by the canonicalize reviewer stage; keep distinct from the canonicalizer profile for independence. */
  canonicalizeReviewerProfile?: string;
};

export type HarnessRunOptions = {
  dryRun: boolean;
  profileName?: string | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  normalizationPage?: number | undefined;
  /** Writer only: expose curated MTA writer tools plus generic read, but no generic bash/write/edit. */
  safeWriter?: boolean | undefined;
  /**
   * Campaign wave driver only: route the post-ingest materialize through the every-K cadence queue
   * (campaign-concurrency-plan.md §2 P0-b) instead of materializing per-run. Standalone `ingest`
   * leaves this unset and materializes every run as before.
   */
  campaignMaterialize?: boolean | undefined;
};

export type HarnessResumeOptions = HarnessRunOptions & {
  message: string;
};

export type UsageRecord = {
  timestamp: number;
  api: string;
  provider: string;
  model: string;
  responseId: string | undefined;
  stopReason: string;
  usage: Usage;
};

export type TranscriptUsageSummary = {
  runName: string;
  runPath: string;
  requestCount: number;
  totals: Usage;
  records: UsageRecord[];
};

export type HarnessRunResult = {
  command: HarnessRunCommand;
  sourceId: string;
  dryRun: boolean;
  profileName: string;
  provider: string;
  model: string;
  transcriptDir: string;
  sessionPath: string;
  normalizationDraftPath?: string | undefined;
  normalizationOutputPath?: string | undefined;
  normalizedBlockCount?: number | undefined;
  responseText?: string;
};

export type HarnessResumeResult = {
  command: "resume";
  resumedCommand: HarnessRunCommand;
  target: string;
  sourceId: string;
  dryRun: boolean;
  profileName: string;
  provider: string;
  model: string;
  transcriptDir: string;
  sessionPath: string;
  responseText?: string;
};

export type IdentityReviewRunOptions = HarnessRunOptions & {
  subject?: string | undefined;
  limit?: number | undefined;
  include?: string | undefined;
  exclude?: string | undefined;
  concurrency?: number | undefined;
  force?: boolean | undefined;
  maxAttempts?: number | undefined;
};

export type IdentityReviewPacketRunResult = {
  cluster_id: string;
  packet_path: string;
  suggestion_path?: string | undefined;
  transcript_dir?: string | undefined;
  session_path?: string | undefined;
  status: "planned" | "completed" | "skipped" | "failed";
  error?: string | undefined;
  attempts?: number | undefined;
};

export type IdentityReviewRunManifest = {
  run_id: string;
  generated_at: string;
  dry_run: boolean;
  profile_name: string;
  provider: string;
  model: string;
  concurrency: number;
  packet_count: number;
  completed: number;
  skipped: number;
  failed: number;
  paths: {
    suggestions_dir: string;
    review_runs_dir: string;
    manifest: string;
    latest: string;
  };
  results: IdentityReviewPacketRunResult[];
};

export type ProfileInfo = {
  name: string;
  provider: string;
  model: string;
  apiKeyEnv: string | undefined;
  isDefault: boolean;
  hasKey: boolean;
};

export type ProviderInfo = {
  provider: string;
  isProfileProvider: boolean;
};

export type ModelInfo = {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
};

export type TranscriptInfo = {
  name: string;
  path: string;
};
