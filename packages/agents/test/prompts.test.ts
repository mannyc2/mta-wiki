import { describe, expect, it } from "bun:test";
import { writerPrompt, writerSystemPrompt } from "@mta-wiki/agents/prompts";

describe("writer prompt contract", () => {
  it("requires writer primitives and cite primitives in the writer surface", () => {
    const system = writerSystemPrompt();
    const prompt = writerPrompt("source_a");

    expect(system).toContain("[[route:id|label]]");
    expect(system).toContain("[[cite:source_id#block_id|label]]");
    expect(system).toContain("Every factual sentence");
    expect(prompt).toContain("[[corridor:id|label]]");
    expect(prompt).toContain("[[cite:source_id#block_id|label]]");
  });
});
