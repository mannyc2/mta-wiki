import { describe, expect, it } from "bun:test";
import { createWriterTools } from "@mta-wiki/agents/write";
import type { HarnessConfig } from "@mta-wiki/core/types";
import type { TranscriptWriter } from "@mta-wiki/core/transcript";

const transcript = { runId: "writer_tool_test", write() {} } as unknown as TranscriptWriter;
const config: HarnessConfig = {
  defaultProfile: "test",
  transcriptsDir: "data/transcripts",
  profiles: {
    test: { provider: "pioneer", model: "test-model" },
  },
};

describe("writer tool surface", () => {
  it("safe writer mode keeps curated writer tools but removes generic mutating/shell tools", () => {
    const names = createWriterTools(transcript, config, { safeWriter: true }).map((tool) => tool.name);
    expect(names).toContain("mta_write_writer_context");
    expect(names).toContain("mta_flag_record_issue");
    expect(names).toContain("mta_read_wiki_page");
    expect(names).not.toContain("bash");
    expect(names).not.toContain("write");
    expect(names).not.toContain("edit");
  });

  it("safe writer mode rejects creating a new wiki page through the writer tool", async () => {
    const writeTool = createWriterTools(transcript, config, { safeWriter: true }).find((tool) => tool.name === "mta_write_writer_context");
    expect(writeTool).toBeDefined();
    await expect(
      writeTool!.execute("call-1", {
        path: "wiki/projects/project_safe_writer_missing_page_test.md",
        markdown: "## Context\n\nNope.",
      }),
    ).rejects.toThrow("only writes existing materialized wiki pages");
  });
});
