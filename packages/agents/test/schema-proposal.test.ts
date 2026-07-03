import { describe, expect, it } from "bun:test";
import { validateProposal } from "@mta-wiki/agents/schema-proposal";
import type { JsonValue } from "@mta-wiki/db/types";

// Minimal packet matching the ProposalPacket shape validateProposal consumes.
function packet(overrides: Record<string, unknown> = {}) {
  return {
    observation_kind: "route",
    submission_count: 212,
    accepted_count: 212,
    rejected_count: 0,
    declared_anchor_fields: ["route_id", "route_label"],
    enum_candidates: [
      {
        field: "route_type",
        occurrences: 18,
        accepted_occurrences: 18,
        rejected_occurrences: 0,
        canonical_occurrences: 18,
        coverage: 0.08,
        distinct_values: 4,
        accepted_distinct_values: 4,
        canonical_distinct_values: 4,
        value_kind: "scalar_string",
        accepted_value_kind: "scalar_string",
        canonical_value_kind: "scalar_string",
        closure_readiness: "open" as const,
        corpus_values: ["Local", "local_bus", "select_bus_service", "express_bus"],
        accepted_values: ["Local", "local_bus", "select_bus_service", "express_bus"],
        canonical_values_observed: ["Local", "local_bus", "select_bus_service", "express_bus"],
        value_counts: [{ value: "express_bus", count: 6 }],
        accepted_value_counts: [{ value: "express_bus", count: 6 }],
        canonical_value_counts: [{ value: "express_bus", count: 6 }],
      },
    ],
    additional_keys: [{ field: "program", occurrences: 21, coverage: 0.1, value_kind: "scalar_string", classification: "enum_candidate", sample_values: ["ABLE"] }],
    ...overrides,
  } as Parameters<typeof validateProposal>[0];
}

function validProposal(overrides: Record<string, unknown> = {}): JsonValue {
  return {
    observation_kind: "route",
    field_proposals: [
      {
        field: "route_type",
        decision: "enum",
        canonical_values: ["local", "select_bus_service", "express"],
        value_mapping: [
          { from: "Local", to: "local" },
          { from: "local_bus", to: "local" },
          { from: "express_bus", to: "express" },
        ],
        escape_hatch: { other_value: "other", other_text_field: "route_type_other" },
        rationale: "Normalize casing and merge synonyms; corpus is incomplete so keep open.",
      },
    ],
    key_dispositions: [{ key: "program", disposition: "relation_context", rationale: "Program name is affiliation, not identity." }],
    ...overrides,
  } as JsonValue;
}

describe("validateProposal", () => {
  it("accepts a well-formed open-enum proposal", () => {
    const { issues, warnings } = validateProposal(packet(), validProposal());
    expect(issues).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("does not ask the model for confidence or closure", () => {
    // A proposal with no confidence/is_closed fields is fully valid: those are
    // not the model's job anymore.
    const proposal = validProposal();
    expect(JSON.stringify(proposal)).not.toContain("confidence");
    expect(JSON.stringify(proposal)).not.toContain("is_closed");
    expect(validateProposal(packet(), proposal).issues).toEqual([]);
  });

  it("rejects normalizing a value that is not in the corpus (anti-hallucination)", () => {
    const proposal = validProposal({
      field_proposals: [
        {
          field: "route_type",
          decision: "enum",
          canonical_values: ["local"],
          value_mapping: [{ from: "shuttle", to: "local" }],
          escape_hatch: { other_value: "other", other_text_field: "route_type_other" },
          rationale: "x",
        },
      ],
    });
    const { issues } = validateProposal(packet(), proposal);
    expect(issues.some((issue) => issue.includes('"shuttle" is not an observed corpus value'))).toBe(true);
  });

  it("derives the canonical set from mappings (no separate canonical_values to keep in sync)", () => {
    // `to` value absent from canonical_values is fine: canonical is the set of
    // distinct `to` values. Only `from` is guarded (must be a real corpus value).
    const proposal = validProposal({
      field_proposals: [
        {
          field: "route_type",
          decision: "enum",
          canonical_values: [],
          value_mapping: [
            { from: "Local", to: "local" },
            { from: "local_bus", to: "local" },
          ],
          escape_hatch: { other_value: "other", other_text_field: "route_type_other" },
          rationale: "x",
        },
      ],
    });
    const { issues } = validateProposal(packet(), proposal);
    expect(issues).toEqual([]);
  });

  it("warns when an enum has no escape hatch (closure is deferred, so all enums need one)", () => {
    const proposal = validProposal({
      field_proposals: [
        {
          field: "route_type",
          decision: "enum",
          canonical_values: ["local"],
          value_mapping: [{ from: "Local", to: "local" }],
          escape_hatch: null,
          rationale: "x",
        },
      ],
    });
    const { issues, warnings } = validateProposal(packet(), proposal);
    expect(issues).toEqual([]);
    expect(warnings.some((warning) => warning.includes("should declare an escape_hatch"))).toBe(true);
  });

  it("allows enum-candidate fields to be classified as relation context", () => {
    const proposal = validProposal({
      field_proposals: [
        {
          field: "route_type",
          decision: "relation_context",
          canonical_values: [],
          value_mapping: [],
          rationale: "This repeated value points to a related program or route context rather than an intrinsic route enum.",
        },
      ],
    });
    const { issues, warnings } = validateProposal(packet(), proposal);
    expect(issues).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("warns when an enum proposal has no accepted observations", () => {
    const noAcceptedPacket = packet({
      enum_candidates: [
        {
          field: "route_type",
          occurrences: 2,
          accepted_occurrences: 0,
          rejected_occurrences: 2,
          canonical_occurrences: 0,
          coverage: 0.08,
          distinct_values: 2,
          accepted_distinct_values: 0,
          canonical_distinct_values: 0,
          value_kind: "scalar_string",
          accepted_value_kind: "empty",
          canonical_value_kind: "empty",
          closure_readiness: "open" as const,
          corpus_values: ["Local", "local_bus", "express_bus"],
          accepted_values: [],
          canonical_values_observed: [],
          value_counts: [{ value: "Local", count: 1 }],
          accepted_value_counts: [],
          canonical_value_counts: [],
        },
      ],
    });
    const { issues, warnings } = validateProposal(noAcceptedPacket, validProposal());
    expect(issues).toEqual([]);
    expect(warnings.some((warning) => warning.includes("zero accepted observations"))).toBe(true);
  });

  it("warns when a mixed-type field is proposed as an enum", () => {
    const mixedPacket = packet({
      enum_candidates: [
        {
          field: "route_type",
          occurrences: 4,
          accepted_occurrences: 4,
          rejected_occurrences: 0,
          canonical_occurrences: 4,
          coverage: 0.08,
          distinct_values: 2,
          accepted_distinct_values: 2,
          canonical_distinct_values: 2,
          value_kind: "mixed",
          accepted_value_kind: "mixed",
          canonical_value_kind: "mixed",
          closure_readiness: "open" as const,
          corpus_values: ["Local", "local_bus", "express_bus"],
          accepted_values: ["Local", "express_bus"],
          canonical_values_observed: ["Local", "express_bus"],
          value_counts: [{ value: "Local", count: 2 }],
          accepted_value_counts: [{ value: "Local", count: 2 }],
          canonical_value_counts: [{ value: "Local", count: 2 }],
        },
      ],
    });
    const { issues, warnings } = validateProposal(mixedPacket, validProposal());
    expect(issues).toEqual([]);
    expect(warnings.some((warning) => warning.includes("mixed-type field"))).toBe(true);
  });

  it("rejects proposals for fields and keys that were not presented", () => {
    const proposal = validProposal({
      field_proposals: [{ field: "made_up", decision: "enum", canonical_values: [], value_mapping: [], rationale: "x" }],
      key_dispositions: [{ key: "not_a_key", disposition: "drop", rationale: "x" }],
    });
    const { issues } = validateProposal(packet(), proposal);
    expect(issues.some((issue) => issue.includes('field "made_up" is not a presented enum candidate'))).toBe(true);
    expect(issues.some((issue) => issue.includes('key "not_a_key" is not a presented field'))).toBe(true);
  });

  it("warns (not rejects) when a known enum-candidate field is misfiled into key_dispositions", () => {
    const proposal = validProposal({
      key_dispositions: [{ key: "route_type", disposition: "drop", rationale: "x" }],
    });
    const { issues, warnings } = validateProposal(packet(), proposal);
    expect(issues).toEqual([]);
    expect(warnings.some((warning) => warning.includes("is an enum-candidate field; put its disposition in field_proposals"))).toBe(true);
  });

  it("rejects non-object and structurally broken payloads", () => {
    expect(validateProposal(packet(), "nope" as JsonValue).issues).toContain("proposal is not a JSON object");
    expect(validateProposal(packet(), { observation_kind: "route" } as JsonValue).issues).toContain("field_proposals must be an array");
  });
});
