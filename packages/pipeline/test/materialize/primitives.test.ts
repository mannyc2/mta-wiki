import { describe, expect, it } from "bun:test";
import { parseBlockPrimitives, parseInlinePrimitives } from "@mta-wiki/pipeline/materialize/primitives";
import { validateWriterPrimitivesInPage, type WriterPrimitiveValidationContext } from "@mta-wiki/pipeline/validate";

const page = (writerText: string) => `---
record_id: project_test
---

<!-- mta-wiki:writer:start -->
${writerText}
<!-- mta-wiki:writer:end -->
`;

const context: WriterPrimitiveValidationContext = {
  recordKindsById: new Map([
    ["route_m1", "route"],
    ["corridor_14th-street", "corridor"],
    ["project_busway", "project"],
    ["entity_nycdot", "entity"],
    ["metric_bus-speed", "metric_claim"],
  ]),
  sourceIds: new Set(["source_a"]),
  blockExists: (sourceId, blockId) => sourceId === "source_a" && (blockId === "p001_c0001" || blockId === "p001_c0001..p001_c0003"),
};

describe("writer primitive parsing", () => {
  it("parses inline primitives for every kind", () => {
    const text = [
      "[[route:route_m1|M1]]",
      "[[corridor:corridor_14th-street|14th Street]]",
      "[[project:project_busway|Busway]]",
      "[[entity:entity_nycdot|NYC DOT]]",
      "[[metric:metric_bus-speed|bus speed]]",
      "[[cite:source_a#p001_c0001|source block]]",
      "[[cite:source_a|source]]",
    ].join(" ");
    expect(parseInlinePrimitives(text).map((primitive) => [primitive.kind, primitive.id, primitive.blockId, primitive.label])).toEqual([
      ["route", "route_m1", undefined, "M1"],
      ["corridor", "corridor_14th-street", undefined, "14th Street"],
      ["project", "project_busway", undefined, "Busway"],
      ["entity", "entity_nycdot", undefined, "NYC DOT"],
      ["metric", "metric_bus-speed", undefined, "bus speed"],
      ["cite", "source_a", "p001_c0001", "source block"],
      ["cite", "source_a", undefined, "source"],
    ]);
  });

  it("allows pipes and single brackets in labels while ignoring legacy wikilinks", () => {
    const text = "[[wiki/routes/route_m1|legacy]] [[route:route_m1|M1 | [local] service]]";
    const primitives = parseInlinePrimitives(text);
    expect(primitives).toHaveLength(1);
    expect(primitives[0]?.label).toBe("M1 | [local] service");
  });

  it("parses valid block primitives and returns errors without throwing", () => {
    const text = [
      "```mta:metric",
      "{\"id\":\"metric_bus-speed\"}",
      "```",
      "```mta:metric",
      "{bad json",
      "```",
      "```mta:project",
      "{\"label\":\"missing id\"}",
      "```",
      "```mta:banana",
      "{\"id\":\"banana\"}",
      "```",
    ].join("\n");
    expect(parseBlockPrimitives(text).map((primitive) => [primitive.kind, primitive.id, primitive.error])).toEqual([
      ["metric", "metric_bus-speed", undefined],
      ["metric", undefined, "invalid_json"],
      ["project", undefined, "missing_id"],
      ["banana", undefined, "unknown_kind"],
    ]);
  });
});

describe("writer primitive validation", () => {
  it("accepts resolvable inline and block primitives", () => {
    const markdown = page(`[[route:route_m1|M1]] uses [[cite:source_a#p001_c0001|the source]].

\`\`\`mta:metric
{"id":"metric_bus-speed"}
\`\`\``);
    expect(validateWriterPrimitivesInPage("wiki/projects/project_busway.md", markdown, context)).toEqual([]);
  });

  it("reports unknown records and unknown cite blocks", () => {
    const issues = validateWriterPrimitivesInPage(
      "wiki/projects/project_busway.md",
      page("[[project:project_missing|missing]] cites [[cite:source_a#p999_c9999|bad block]]."),
      context,
    );
    expect(issues.map((issue) => issue.message.split(":")[0])).toEqual(["unknown_record", "unknown_block"]);
    expect(issues.every((issue) => issue.code === "dangling_writer_primitive")).toBe(true);
  });

  it("treats an empty writer region as a no-op", () => {
    expect(validateWriterPrimitivesInPage("wiki/projects/project_busway.md", page(""), context)).toEqual([]);
  });

  it("keeps the strict cite paragraph check off by default", () => {
    const markdown = page("A factual paragraph without a cite primitive.");
    expect(validateWriterPrimitivesInPage("wiki/projects/project_busway.md", markdown, context)).toEqual([]);
    expect(validateWriterPrimitivesInPage("wiki/projects/project_busway.md", markdown, { ...context, strictWriterCitations: true })[0]?.code).toBe(
      "uncited_writer_paragraph",
    );
  });
});
