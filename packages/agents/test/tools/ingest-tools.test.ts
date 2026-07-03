import { describe, expect, it } from "bun:test";
import { createMtaTools } from "@mta-wiki/agents/tools/ingest-tools";
import type { TranscriptWriter } from "@mta-wiki/core/transcript";

const fakeTranscript = { write: () => {} } as unknown as TranscriptWriter;

describe("ingest tool surface", () => {
  const tools = createMtaTools(fakeTranscript, "test-run");
  const names = tools.map((tool) => tool.name);

  it("exposes one typed submit tool per non-deprecated kind plus the escape hatch", () => {
    for (const kind of [
      "source",
      "entity",
      "project",
      "corridor",
      "route",
      "treatment_component",
      "event",
      "claim",
      "metric_claim",
      "source_gap",
      "relation",
    ]) {
      expect(names).toContain(`mta_submit_${kind}`);
    }
    expect(names).not.toContain("mta_submit_table");
    expect(names).toContain("mta_submit_observation");
  });

  it("keeps the read/resolve tools", () => {
    for (const name of [
      "mta_read_source",
      "mta_search_source",
      "mta_read_evidence",
      "mta_resolve_record",
      "mta_find_relation_candidates",
      "mta_read_ontology_guide",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("escape hatch rejects typed kinds and requires justification", async () => {
    const escape = tools.find((tool) => tool.name === "mta_submit_observation")!;
    await expect(
      escape.execute("call-1", {
        source_id: "s",
        observation_kind: "route",
        local_observation_id: "route_x",
        justification: "testing",
      }),
    ).rejects.toThrow("use mta_submit_route");
    await expect(
      escape.execute("call-2", {
        source_id: "s",
        observation_kind: "novel_kind",
        local_observation_id: "novel_x",
        justification: "   ",
      }),
    ).rejects.toThrow("justification is required");
  });

  it("typed route tool payload schema is strict with extra_fields", () => {
    const routeTool = tools.find((tool) => tool.name === "mta_submit_route")!;
    const parameters = routeTool.parameters as {
      properties?: { payload?: { anyOf?: unknown[]; additionalProperties?: boolean; properties?: Record<string, unknown> } };
    };
    const payloadSchema = parameters.properties?.payload;
    expect(payloadSchema).toBeDefined();
    const objectSchema = (payloadSchema?.anyOf?.[0] ?? payloadSchema) as { additionalProperties?: boolean; properties?: Record<string, unknown> };
    expect(objectSchema.additionalProperties).toBe(false);
    expect(objectSchema.properties?.extra_fields).toBeDefined();
    expect(objectSchema.properties?.route_id).toBeDefined();
  });
});
