import { describe, expect, it } from "bun:test";
import { getModelApiKey, listModels, listProviders, selectModel } from "../src/models.js";
import type { HarnessConfig } from "../src/types.js";

const config: HarnessConfig = {
  defaultProfile: "pioneer-deepseek-flash",
  transcriptsDir: "data/transcripts",
  profiles: {
    "deepseek-flash": {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      apiKeyEnv: "DEEPSEEK_API_KEY",
    },
    "pioneer-deepseek-flash": {
      provider: "pioneer",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      apiKeyEnv: "PIONEER_API_KEY",
    },
  },
};

describe("pioneer provider", () => {
  it("lists only enabled providers and models", () => {
    expect(listProviders(config).map((provider) => provider.provider)).toEqual(["deepseek", "pioneer"]);
    expect(listModels("deepseek", config).map((model) => model.id)).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
    expect(listModels("pioneer", config).map((model) => model.id)).toEqual(["deepseek-ai/DeepSeek-V4-Flash", "deepseek-ai/DeepSeek-V4-Pro"]);
  });

  it("selects Pioneer DeepSeek via profile", () => {
    const selection = selectModel(config, { dryRun: true });

    expect(selection.model.provider).toBe("pioneer");
    expect(selection.model.api).toBe("pioneer-openai-completions");
    expect(selection.model.baseUrl).toBe("https://api.pioneer.ai/v1");
    expect(selection.apiKeyEnv).toBe("PIONEER_API_KEY");
  });

  it("uses current Pioneer DeepSeek fallback pricing", () => {
    const flash = selectModel(config, { dryRun: true, provider: "pioneer", model: "deepseek-ai/DeepSeek-V4-Flash" });
    const pro = selectModel(config, { dryRun: true, provider: "pioneer", model: "deepseek-ai/DeepSeek-V4-Pro" });

    expect(flash.model.cost).toMatchObject({ input: 0.1, output: 0.2 });
    expect(pro.model.cost).toMatchObject({ input: 0.435, output: 0.87 });
  });

  it("uses the selected profile key env without generic API key fallback", () => {
    const previousPi = process.env.PI_API_KEY;
    const previousPioneer = process.env.PIONEER_API_KEY;

    try {
      process.env.PI_API_KEY = "generic-key";
      process.env.PIONEER_API_KEY = "pioneer-key";

      const selection = selectModel(config, { dryRun: true });

      expect(getModelApiKey(selection)).toBe("pioneer-key");
    } finally {
      if (previousPi === undefined) {
        delete process.env.PI_API_KEY;
      } else {
        process.env.PI_API_KEY = previousPi;
      }

      if (previousPioneer === undefined) {
        delete process.env.PIONEER_API_KEY;
      } else {
        process.env.PIONEER_API_KEY = previousPioneer;
      }
    }
  });

  it("rejects disabled providers and models", () => {
    expect(() => selectModel(config, { dryRun: true, provider: "openai", model: "gpt-5.5" })).toThrow("Disabled provider");
    // pioneer serves Flash + Pro (both enabled); an unregistered pioneer model id is still rejected.
    expect(() => selectModel(config, { dryRun: true, provider: "pioneer", model: "deepseek-ai/DeepSeek-V4-Ultra" })).toThrow(
      "Disabled or unknown model",
    );
  });
});
