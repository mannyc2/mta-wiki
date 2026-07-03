import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./paths.js";
import type { HarnessConfig } from "./types.js";

const configPath = join(repoRoot, "harness.config.json");

const fallbackConfig: HarnessConfig = {
  defaultProfile: "pioneer-deepseek-flash",
  transcriptsDir: "data/transcripts",
  sandbox: {
    bash: {
      backend: "docker",
      dockerImage: "bp-sandbox:latest",
      network: "none",
      readOnlyRoot: true,
      tmpfsSize: "512m",
      shell: "bash",
    },
  },
  profiles: {
    "pioneer-deepseek-flash": {
      provider: "pioneer",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      apiKeyEnv: "PIONEER_API_KEY",
    },
    "deepseek-flash": {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      apiKeyEnv: "DEEPSEEK_API_KEY",
    },
  },
};

export function readConfig(): HarnessConfig {
  if (!existsSync(configPath)) return fallbackConfig;

  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Partial<HarnessConfig>;
  if (!parsed.defaultProfile || !parsed.transcriptsDir || !parsed.profiles) {
    throw new Error("harness.config.json must define defaultProfile, transcriptsDir, and profiles");
  }

  const sandbox = parsed.sandbox ?? fallbackConfig.sandbox;
  const config: HarnessConfig = {
    defaultProfile: parsed.defaultProfile,
    transcriptsDir: parsed.transcriptsDir,
    profiles: parsed.profiles,
  };

  if (sandbox) config.sandbox = sandbox;
  if (parsed.payloadSchemaMode) config.payloadSchemaMode = parsed.payloadSchemaMode;
  if (parsed.canonicalizeReviewerProfile) config.canonicalizeReviewerProfile = parsed.canonicalizeReviewerProfile;
  return config;
}
