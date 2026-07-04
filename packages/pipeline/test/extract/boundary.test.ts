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
    expect(result.records[0]?.payload.relation_family).toBe("route_scope");
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

  it("adds deterministic runner-owned companion fields before replay projection", () => {
    const result = validateExtractEnvelope(
      {
        source_id: "source_a",
        records: [
          {
            record_kind: "route",
            display_name: "M15",
            payload: { route_id: "M15", route_type: "local" },
            evidence_refs: [{ source_id: "source_a", block_id: "p001_c0001", source_quote: "M15 local bus" }],
          },
          {
            record_kind: "metric_claim",
            display_name: "Daily bus passengers",
            payload: { metric_name: "daily_bus_passengers", raw_value_text: "65,000 passengers", value: 65000, unit: "passengers" },
            evidence_refs: [{ source_id: "source_a", block_id: "p001_c0001", source_quote: "65,000 passengers" }],
          },
        ],
      },
      { sourceBlocks: [block("p001_c0001", "M15 local bus serves 65,000 passengers.")] },
    );
    expect(result.accepted_record_count).toBe(2);
    const route = result.records.find((record) => record.record_kind === "route");
    const metric = result.records.find((record) => record.record_kind === "metric_claim");
    expect(route?.payload.route_type_normalized).toBe("local");
    expect(route?.payload.service_variant).toBe("local");
    expect(metric?.payload.unit_normalized).toEqual({
      raw_text: "passengers",
      normalized_unit: "riders",
      unit_family: "ridership",
    });
  });

  it("derives display names from payload anchors when the model omits display_name", () => {
    const result = validateExtractEnvelope(
      {
        source_id: "source_a",
        records: [
          {
            record_kind: "route",
            payload: { route_id: "M15", route_name: "M15 Local" },
            evidence_refs: [{ source_id: "source_a", block_id: "p001_c0001", source_quote: "M15 service" }],
          },
        ],
      },
      { sourceBlocks: [block()] },
    );
    expect(result.accepted_record_count).toBe(1);
    expect(result.records[0]?.display_name).toBe("M15");
    expect(result.review.map((entry) => entry.code)).not.toContain("missing_display_name");
  });

  it("accepts OCR-equivalent evidence quotes with normalized whitespace and ordinals", () => {
    const result = validateExtractEnvelope(
      {
        source_id: "source_a",
        records: [
          {
            record_kind: "corridor",
            display_name: "116th Street",
            payload: { corridor_name: "116th Street" },
            evidence_refs: [{ source_id: "source_a", block_id: "p001_c0001", source_quote: "116th Street - Morningside and Pleasant" }],
          },
        ],
      },
      { sourceBlocks: [block("p001_c0001", "116 th Street – Morningside & Pleasant")] },
    );
    expect(result.accepted_record_count).toBe(1);
    expect(result.review.map((entry) => entry.code)).not.toContain("evidence_quote_not_in_block");
  });

  it("normalizes relation local endpoint aliases into final endpoint fields", () => {
    const result = validateExtractEnvelope(
      {
        source_id: "source_a",
        records: [
          {
            record_kind: "relation",
            display_name: "project route scope",
            local_observation_id: "rel_local",
            payload: {
              relation_kind: "serves_route",
              relation_family: "route_scope",
              subject_local_observation_id: "project_local",
              object_local_observation_id: "route_local",
            },
            evidence_refs: [{ source_id: "source_a", block_id: "p001_c0001", source_quote: "M15 service" }],
          },
        ],
      },
      { sourceBlocks: [block()] },
    );
    expect(result.accepted_record_count).toBe(1);
    expect(result.records[0]?.payload.subject_id).toBe("project_local");
    expect(result.records[0]?.payload.object_id).toBe("route_local");
    expect(result.records[0]?.relation?.subject_id).toBe("project_local");
    expect(result.records[0]?.relation?.object_id).toBe("route_local");
  });
});
