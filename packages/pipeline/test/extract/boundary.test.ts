import { describe, expect, it } from "bun:test";
import { validateExtractEnvelope, type ExtractAgentEnvelope } from "@mta-wiki/pipeline/extract/boundary";
import type { StagedSourceBlock } from "@mta-wiki/db/types";

function block(block_id = "p001_c0001", raw_text = "M15 service runs here."): StagedSourceBlock {
  return {
    source_id: "source_a",
    block_id,
    page_number: 1,
    reading_order: 1,
    source_surface: "chandra_ocr",
    block_kind: "text",
    raw_source_path: "raw/sources/source_a/blocks.jsonl",
    raw_start_char: 0,
    raw_end_char: raw_text.length,
    raw_text,
    normalized_text: raw_text,
    raw_text_sha256: "sha256:raw",
    normalized_text_sha256: "sha256:norm",
  };
}

describe("v2 extract boundary", () => {
  it("accepts final-schema records, moves unknown fields, and coerces enum misses to other", () => {
    const envelope: ExtractAgentEnvelope = {
      source_id: "source_a",
      records: [
        {
          record_kind: "relation",
          display_name: "M15 relation",
          local_observation_id: "rel_local",
          payload: {
            relation_kind: "serves_route",
            relation_family: "not_a_family",
            subject_id: "project_local",
            object_id: "route_local",
            novel_field: "kept for review",
          },
          evidence_refs: [{ source_id: "source_a", block_id: "p001_c0001", source_quote: "M15 service" }],
        },
      ],
    };

    const result = validateExtractEnvelope(envelope, {
      sourceBlocks: [block()],
      enumVocabulary: { relation_family: ["route_scope", "other"] },
    });
    expect(result.accepted_record_count).toBe(1);
    expect(result.enum_miss_count).toBe(1);
    expect(result.records[0]?.payload.relation_family).toBe("other");
    expect((result.records[0]?.payload.extra_fields as Record<string, unknown>).relation_family_other_text).toBe("not_a_family");
    expect((result.records[0]?.payload.extra_fields as Record<string, unknown>).novel_field).toBe("kept for review");
    expect(result.review.map((entry) => entry.code)).toContain("enum_miss_coerced_to_other");
    expect(result.review.map((entry) => entry.code)).toContain("unknown_field_moved_to_extra_fields");
  });

  it("quarantines malformed records without throwing", () => {
    const result = validateExtractEnvelope(
      {
        source_id: "source_a",
        records: [{ record_kind: "route", display_name: "M15", payload: { route_id: "M15" }, evidence_refs: [] }],
      },
      { sourceBlocks: [block()] },
    );
    expect(result.accepted_record_count).toBe(0);
    expect(result.review.map((entry) => entry.code)).toContain("missing_evidence_refs");
  });
});
