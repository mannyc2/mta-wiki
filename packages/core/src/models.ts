import {
  getEnvApiKey,
  getModels,
  getProviders,
  registerBuiltInApiProviders,
  type KnownProvider,
  type Model,
} from "@earendil-works/pi-ai";
import { readConfig } from "./config.js";
import { PIONEER_OPENAI_COMPLETIONS_API, registerPioneerOpenAIProvider } from "./pioneer-provider.js";
import type {
  HarnessConfig,
  HarnessRunOptions,
  ModelInfo,
  ProfileInfo,
  ProviderInfo,
  ProviderProfile,
} from "./types.js";

const PIONEER_PROVIDER = "pioneer";
const PIONEER_BASE_URL = "https://api.pioneer.ai/v1";
const DEEPSEEK_PROVIDER = "deepseek";
const DEEPSEEK_FLASH_MODEL_ID = "deepseek-v4-flash";
const DEEPSEEK_PRO_MODEL_ID = "deepseek-v4-pro";
const PIONEER_FLASH_MODEL_ID = "deepseek-ai/DeepSeek-V4-Flash";
const PIONEER_PRO_MODEL_ID = "deepseek-ai/DeepSeek-V4-Pro";
const ENABLED_PROVIDERS = new Set([DEEPSEEK_PROVIDER, PIONEER_PROVIDER]);
const ENABLED_MODEL_IDS = new Map([
  [DEEPSEEK_PROVIDER, new Set([DEEPSEEK_FLASH_MODEL_ID, DEEPSEEK_PRO_MODEL_ID])],
  [PIONEER_PROVIDER, new Set([PIONEER_FLASH_MODEL_ID, PIONEER_PRO_MODEL_ID])],
]);

const PIONEER_MODELS: Model<any>[] = [
  {
    id: PIONEER_FLASH_MODEL_ID,
    name: "Pioneer DeepSeek V4 Flash",
    api: PIONEER_OPENAI_COMPLETIONS_API,
    provider: PIONEER_PROVIDER,
    baseUrl: PIONEER_BASE_URL,
    compat: { requiresReasoningContentOnAssistantMessages: true, thinkingFormat: "deepseek" },
    reasoning: true,
    thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", xhigh: "max" },
    input: ["text"],
    cost: {
      input: 0.1,
      output: 0.2,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 163000,
    maxTokens: 65536,
  },
  {
    id: PIONEER_PRO_MODEL_ID,
    name: "Pioneer DeepSeek V4 Pro",
    api: PIONEER_OPENAI_COMPLETIONS_API,
    provider: PIONEER_PROVIDER,
    baseUrl: PIONEER_BASE_URL,
    compat: { requiresReasoningContentOnAssistantMessages: true, thinkingFormat: "deepseek" },
    reasoning: true,
    thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", xhigh: "max" },
    input: ["text"],
    cost: {
      input: 0.435,
      output: 0.87,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 163000,
    maxTokens: 65536,
  },
];

export type ModelSelection = {
  profileName: string;
  profile: ProviderProfile | undefined;
  model: Model<any>;
  apiKeyEnv: string | undefined;
};

let providersRegistered = false;

export function ensureProvidersRegistered() {
  if (providersRegistered) return;
  registerBuiltInApiProviders();
  registerPioneerOpenAIProvider();
  providersRegistered = true;
}

function knownProvider(provider: string): KnownProvider {
  ensureProvidersRegistered();

  if (!ENABLED_PROVIDERS.has(provider)) {
    throw new Error(`Disabled provider: ${provider}. Enabled providers: ${[...ENABLED_PROVIDERS].join(", ")}`);
  }

  const providers = getProviders();
  if (!providers.includes(provider as KnownProvider)) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return provider as KnownProvider;
}

function customModels(provider: string) {
  if (provider === PIONEER_PROVIDER) return PIONEER_MODELS;
  return undefined;
}

function enabledModels(provider: string) {
  const models = customModels(provider) ?? getModels(knownProvider(provider));
  const enabledIds = ENABLED_MODEL_IDS.get(provider);
  return enabledIds ? models.filter((model) => enabledIds.has(model.id)) : [];
}

export function selectModel(config: HarnessConfig, options: HarnessRunOptions): ModelSelection {
  ensureProvidersRegistered();

  const profileName = options.profileName ?? config.defaultProfile;
  const profile = config.profiles[profileName];
  if (!profile && !options.provider) {
    throw new Error(`Unknown profile: ${profileName}`);
  }

  const provider = options.provider ?? profile?.provider;
  const modelId = options.model ?? profile?.model;
  if (!provider || !modelId) {
    throw new Error("Provider and model are required");
  }

  if (!ENABLED_PROVIDERS.has(provider)) {
    throw new Error(`Disabled provider: ${provider}. Enabled providers: ${[...ENABLED_PROVIDERS].join(", ")}`);
  }

  const model = enabledModels(provider).find((candidate) => candidate.id === modelId);
  if (!model) {
    throw new Error(`Disabled or unknown model for ${provider}: ${modelId}`);
  }

  return {
    profileName,
    profile,
    model,
    apiKeyEnv: profile?.apiKeyEnv,
  };
}

export function getModelApiKey(selection: ModelSelection): string | undefined {
  return (
    (selection.apiKeyEnv ? process.env[selection.apiKeyEnv] : undefined) ??
    getEnvApiKey(selection.model.provider)
  );
}

export function listProfiles(config = readConfig()): ProfileInfo[] {
  return Object.entries(config.profiles).map(([name, profile]) => ({
    name,
    provider: profile.provider,
    model: profile.model,
    apiKeyEnv: profile.apiKeyEnv,
    isDefault: name === config.defaultProfile,
    hasKey: Boolean(profile.apiKeyEnv && process.env[profile.apiKeyEnv]),
  }));
}

export function listProviders(config = readConfig()): ProviderInfo[] {
  ensureProvidersRegistered();

  const profileProviders = new Set(Object.values(config.profiles).map((profile) => profile.provider));
  return [...ENABLED_PROVIDERS]
    .sort()
    .map((provider) => ({
      provider,
      isProfileProvider: profileProviders.has(provider),
    }));
}

export function listModels(providerArg?: string, config = readConfig()): ModelInfo[] {
  ensureProvidersRegistered();

  const provider = providerArg ?? config.profiles[config.defaultProfile]?.provider;
  if (!provider) {
    throw new Error("Provider is required for models command");
  }

  if (!ENABLED_PROVIDERS.has(provider)) {
    throw new Error(`Disabled provider: ${provider}. Enabled providers: ${[...ENABLED_PROVIDERS].join(", ")}`);
  }

  const models = enabledModels(provider);
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  }));
}
