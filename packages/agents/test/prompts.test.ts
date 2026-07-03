import { describe, expect, it } from "bun:test";
import { writerPrompt, writerSystemPrompt } from "@mta-wiki/agents/prompts";
import { writerPacketPrompt } from "@mta-wiki/agents/write";

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

  it("renders one-page packet prompts for the safe writer runner", () => {
    const prompt = writerPacketPrompt("data/post-ingest/packet.json", {
      page_path: "wiki/routes/route_m1.md",
      record_id: "route_m1",
      record_kind: "route",
      display_name: "M1",
      source_ids: ["source_a"],
      current_writer_region_empty: true,
      target_record: {
        record_id: "route_m1",
        record_kind: "route",
        display_name: "M1",
        source_id: "source_a",
        source_ids: ["source_a"],
        page_path: "wiki/routes/route_m1.md",
        payload_keys: ["route_id"],
        evidence_count: 1,
        evidence_refs: [{ source_id: "source_a", block_id: "p001_c0001" }],
        evidence_snippets: [{ source_id: "source_a", block_id: "p001_c0001", text: "M1 bus" }],
      },
      supporting_records: [],
      instructions: [],
    });

    expect(prompt).toContain("Target page: `wiki/routes/route_m1.md`");
    expect(prompt).toContain("mta_write_writer_context");
    expect(prompt).toContain("[[cite:source_id#block_id|label]]");
    expect(prompt).toContain("Do not use bare `source_id#block_id`");
  });
});
