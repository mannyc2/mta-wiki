import { describe, expect, it } from "bun:test";
import type { Model } from "@earendil-works/pi-ai";
import { pioneerUsageFromRawUsage } from "../src/pioneer-provider.js";

const model = {
  id: "deepseek-ai/DeepSeek-V4-Flash",
  name: "Pioneer DeepSeek V4 Flash",
  api: "pioneer-openai-completions",
  provider: "pioneer",
  baseUrl: "https://api.pioneer.ai/v1",
  input: ["text"],
  cost: {
    input: 0.1,
    output: 0.2,
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: 163000,
  maxTokens: 65536,
} satisfies Model<any>;

describe("pioneer usage parsing", () => {
  it("prefers response-provided cost over local model estimates", () => {
    const usage = pioneerUsageFromRawUsage(
      {
        prompt_tokens: 1000,
        completion_tokens: 200,
        cache_read_tokens: 300,
        cache_write_tokens: 50,
        total_tokens: 1550,
        cost: {
          input: 0.001,
          output: 0.002,
          cache_read: 0.00003,
          cache_write: 0.00005,
          total: 0.00308,
        },
      },
      model,
    );

    expect(usage).toMatchObject({
      input: 1000,
      output: 200,
      cacheRead: 300,
      cacheWrite: 50,
      totalTokens: 1550,
      cost: {
        input: 0.001,
        output: 0.002,
        cacheRead: 0.00003,
        cacheWrite: 0.00005,
        total: 0.00308,
      },
    });
  });

  it("keeps the provider total when only a scalar billed cost is present", () => {
    const usage = pioneerUsageFromRawUsage(
      {
        prompt_tokens: 1000,
        completion_tokens: 200,
        total_tokens: 1200,
        total_cost: "$0.123456",
      },
      model,
    );

    expect(usage.cost.input).toBe(0.0001);
    expect(usage.cost.output).toBe(0.00004);
    expect(usage.cost.total).toBe(0.123456);
  });

  it("uses split cache buckets when Pioneer reports prompt_tokens as uncached input", () => {
    const usage = pioneerUsageFromRawUsage(
      {
        prompt_tokens: 1000,
        completion_tokens: 200,
        prompt_tokens_details: { cached_tokens: 300, cache_write_tokens: 50 },
        total_tokens: 1550,
      },
      model,
    );

    expect(usage.input).toBe(1000);
    expect(usage.output).toBe(200);
    expect(usage.cacheRead).toBe(300);
    expect(usage.cacheWrite).toBe(50);
    expect(usage.totalTokens).toBe(1550);
  });

  it("subtracts cache buckets when usage follows OpenAI total-token semantics", () => {
    const usage = pioneerUsageFromRawUsage(
      {
        prompt_tokens: 1350,
        completion_tokens: 200,
        prompt_tokens_details: { cached_tokens: 300, cache_write_tokens: 50 },
        total_tokens: 1550,
      },
      model,
    );

    expect(usage.input).toBe(1000);
    expect(usage.output).toBe(200);
    expect(usage.cacheRead).toBe(300);
    expect(usage.cacheWrite).toBe(50);
    expect(usage.totalTokens).toBe(1550);
  });
});
