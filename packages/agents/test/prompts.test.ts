import { describe, expect, it } from "bun:test";
import { writerPrompt, writerSystemPrompt } from "@mta-wiki/agents/prompts";
import { writerPacketPrompt, writerPrimitiveLabelIssues, writerUncitedProseIssues } from "@mta-wiki/agents/write";

describe("writer prompt contract", () => {
  it("requires writer primitives and cite primitives in the writer surface", () => {
    const system = writerSystemPrompt();
    const prompt = writerPrompt("source_a");

    expect(system).toContain("[[route:id|label]]");
    expect(system).toContain("[[cite:source_id#block_id|label]]");
    expect(system).toContain("Every factual sentence");
    expect(prompt).toContain("[[corridor:id|label]]");
    expect(prompt).toContain("[[cite:source_id#block_id|label]]");
    expect(system).toContain("never invent shortcut ids");
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
    expect(prompt).toContain("Allowed record primitives for this packet:");
    expect(prompt).toContain("[[route:route_m1|M1]]");
    expect(prompt).toContain("mta_write_writer_context");
    expect(prompt).toContain("[[cite:source_id#block_id|label]]");
    expect(prompt).toContain("bare `source_id#block_id` citations");
    expect(prompt).toContain("Use record primitives only from the allow-list above");
    expect(prompt).toContain("Do not use bare `[[record_id|label]]` wikilinks");
    expect(prompt).toContain("every blank-line-separated prose paragraph contains the literal string `[[cite:`");
  });

  it("flags record primitives whose label names a different thing", () => {
    const records = [
      {
        record_id: "corridor_avenue-a-d-manhattan-bus-lanes",
        record_kind: "corridor",
        display_name: "Avenue A and Avenue D Manhattan bus lanes",
      },
    ] as any;
    const markdown = `<!-- mta-wiki:writer:start -->
[[corridor:corridor_avenue-a-d-manhattan-bus-lanes|Avenue A/D bus lanes]]
[[corridor:corridor_avenue-a-d-manhattan-bus-lanes|MTA New York City Transit]]
<!-- mta-wiki:writer:end -->`;

    expect(writerPrimitiveLabelIssues("wiki/corridors/corridor_avenue-a-d-manhattan-bus-lanes.md", markdown, records)).toEqual([
      {
        code: "writer_primitive_label_mismatch",
        path: "wiki/corridors/corridor_avenue-a-d-manhattan-bus-lanes.md",
        message:
          "primitive label does not appear to name corridor_avenue-a-d-manhattan-bus-lanes: [[corridor:corridor_avenue-a-d-manhattan-bus-lanes|MTA New York City Transit]]",
      },
    ]);
  });

  it("flags prose blocks without cite primitives", () => {
    const markdown = `<!-- mta-wiki:writer:start -->
Uncited factual setup.

## Heading

Cited factual setup [[cite:source_a#p001_c0001|source]].
<!-- mta-wiki:writer:end -->`;

    expect(writerUncitedProseIssues("wiki/routes/route_m1.md", markdown)).toEqual([
      {
        code: "uncited_writer_prose",
        path: "wiki/routes/route_m1.md",
        message: "writer prose block 1 has no cite primitive",
      },
    ]);
  });
});
