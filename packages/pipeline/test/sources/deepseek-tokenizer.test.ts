import { describe, expect, it } from "bun:test";
import { countDeepSeekTokens, DEEPSEEK_TOKENIZER_ID, DEEPSEEK_TOKENIZER_SHA256 } from "@mta-wiki/pipeline/sources/deepseek-tokenizer";

describe("DeepSeek tokenizer token counting", () => {
  it("identifies the vendored tokenizer artifact", () => {
    expect(DEEPSEEK_TOKENIZER_ID).toBe("deepseek-v4");
    expect(DEEPSEEK_TOKENIZER_SHA256).toBe("8f9f37ca37fdc4f5fd36d5cf4d3b0e8392edb4e894fd10cc0d70b4957c8633cf");
  });

  it("matches reference counts for representative source-packet text", () => {
    expect(countDeepSeekTokens("Hello!")).toBe(2);
    expect(countDeepSeekTokens("[p001_b0001] First source claim.")).toBe(10);
    expect(countDeepSeekTokens("Route M86 SBS improved travel times by 11%.")).toBe(12);
    expect(countDeepSeekTokens("1234567890")).toBe(4);
    expect(countDeepSeekTokens("foo\n\nbar")).toBe(3);
  });

  it("counts DeepSeek special tokens as single tokens", () => {
    expect(countDeepSeekTokens("<｜begin▁of▁sentence｜>Hello!<｜end▁of▁sentence｜>")).toBe(4);
  });
});
