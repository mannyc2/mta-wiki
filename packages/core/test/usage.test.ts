import { describe, expect, it } from "bun:test";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { assistantText, emptyUsage } from "../src/usage.js";

function message(overrides: Partial<AssistantMessage>): AssistantMessage {
  return {
    api: "test",
    provider: "test",
    model: "test-model",
    content: [],
    stopReason: "stop",
    timestamp: 0,
    usage: emptyUsage(),
    ...overrides,
  } as AssistantMessage;
}

describe("assistantText", () => {
  it("returns concatenated assistant text blocks", () => {
    expect(
      assistantText(
        message({
          content: [
            { type: "text", text: "hello " },
            { type: "text", text: "world" },
          ],
        }),
      ),
    ).toBe("hello world");
  });

  it("throws provider error stop reasons instead of returning empty text", () => {
    expect(() => assistantText(message({ stopReason: "error", errorMessage: "402 status code (no body)" } as Partial<AssistantMessage>))).toThrow(
      "402 status code",
    );
  });
});
