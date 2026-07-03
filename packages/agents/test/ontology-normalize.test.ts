import { describe, expect, it } from "bun:test";
import {
  parseJsonResponse,
  validateOntologyDecision,
  validateOntologyDecisionEnvelope,
  type OntologyDecisionValidationContext,
  type OntologyNormalizePacket,
} from "@mta-wiki/agents/ontology-normalize";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";

function record(record_id: string, record_kind: MtaCanonicalRecord["record_kind"], payload: JsonObject = {}): MtaCanonicalRecord {
  return {
    record_id,
    record_kind,
    source_id: "source_a",
    local_observation_id: record_id,
    display_name: record_id,
    payload,
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-06-09T00:00:00.000Z",
  };
}

function context(): OntologyDecisionValidationContext {
  const relation = record("relation_a", "relation", { relation_kind: "has corridor" });
  const gap = record("gap_a", "source_gap", { gap_kind: "data_unavailable" });
  const route = record("route_m86-sbs", "route");
  return {
    candidatesById: new Map([
      [
        "relation-ontology:relation-kind-inventory",
        {
          candidate_id: "relation-ontology:relation-kind-inventory",
          agent_id: "relation-ontology",
          category: "relation_kind_inventory",
          priority: 1,
          title: "Relation kind inventory",
          reasons: [],
          decision_options: [],
          record_kind: "relation",
          field: "relation_kind",
        },
      ],
      [
        "source-gap-resolution:gap:gap_a",
        {
          candidate_id: "source-gap-resolution:gap:gap_a",
          agent_id: "source-gap-resolution",
          category: "source_gap_possible_resolution",
          priority: 1,
          title: "Gap A",
          reasons: [],
          decision_options: [],
          record_kind: "source_gap",
          record_id: "gap_a",
        },
      ],
    ]),
    recordsById: new Map([relation, gap, route].map((item) => [item.record_id, item])),
    sourceIds: new Set(["source_a", "source_b"]),
    valuesByKindField: new Map([["relation.relation_kind", new Set(["has corridor"])]]),
  };
}

function packet(): OntologyNormalizePacket {
  return {
    agent_id: "relation-ontology",
    name: "Relation Ontology Agent",
    packet_path: "data/ontology-review/packets/relation-ontology.md",
    candidate_count: 1,
    candidates: [...context().candidatesById.values()].filter((candidate) => candidate.agent_id === "relation-ontology"),
  };
}

describe("ontology normalize decision validation", () => {
  it("parses the final fenced JSON object from a narrated model response", () => {
    const parsed = parseJsonResponse(`Let me think about this.

\`\`\`json
{"not_the_answer": true}
\`\`\`

Final JSON:

\`\`\`json
{
  "agent_id": "relation-ontology",
  "decisions": [
    {
      "decision_id": "relation_kind_has_corridor",
      "candidate_id": "relation-ontology:relation-kind-inventory",
      "decision_type": "relation_kind_mapping",
      "summary": "Map has corridor.",
      "rationale": "Observed in corpus.",
      "field": "relation_kind",
      "from": "has corridor",
      "to": "uses_corridor",
      "mapping_relation": "exact_alias"
    }
  ]
}
\`\`\`

Some trailing commentary.`);

    expect((parsed as JsonObject).agent_id).toBe("relation-ontology");
    expect(((parsed as JsonObject).decisions as unknown[])).toHaveLength(1);
  });

  it("accepts data-backed relation kind mappings", () => {
    const result = validateOntologyDecision(
      {
        decision_id: "relation_kind_has_corridor",
        candidate_id: "relation-ontology:relation-kind-inventory",
        decision_type: "relation_kind_mapping",
        summary: "Map has corridor to uses_corridor.",
        rationale: "The corpus uses has corridor as a route/project-to-corridor relation.",
        field: "relation_kind",
        from: "has corridor",
        to: "uses_corridor",
        mapping_relation: "exact_alias",
      },
      context(),
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("accepts data-backed relation family mappings for the bounded family taxonomy", () => {
    const result = validateOntologyDecision(
      {
        decision_id: "relation_family_has_corridor",
        candidate_id: "relation-ontology:relation-kind-inventory",
        decision_type: "relation_family_mapping",
        summary: "Classify has corridor as corridor scope.",
        rationale: "The representative relation links a record to corridor context.",
        field: "relation_kind",
        from: "has corridor",
        to: "corridor_scope",
      },
      context(),
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects relation family mappings outside the bounded taxonomy", () => {
    const result = validateOntologyDecision(
      {
        decision_id: "relation_family_bad_bucket",
        candidate_id: "relation-ontology:relation-kind-inventory",
        decision_type: "relation_family_mapping",
        summary: "Classify into invented bucket.",
        rationale: "This should fail.",
        field: "relation_kind",
        from: "has corridor",
        to: "invented_family",
      },
      context(),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toContain('relation_family_mapping target "invented_family"');
  });

  it("quarantines mappings from values not present in the corpus", () => {
    const result = validateOntologyDecision(
      {
        decision_id: "relation_kind_invented",
        candidate_id: "relation-ontology:relation-kind-inventory",
        decision_type: "relation_kind_mapping",
        summary: "Map invented value.",
        rationale: "This should fail.",
        field: "relation_kind",
        from: "invented relation",
        to: "uses_corridor",
        mapping_relation: "exact_alias",
      },
      context(),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toContain('from value "invented relation" was not observed');
  });

  it("rejects canonical_id decisions for relation kind inventory candidates", () => {
    const result = validateOntologyDecision(
      {
        decision_id: "relation_kind_has_corridor_bad_shape",
        candidate_id: "relation-ontology:relation-kind-inventory",
        decision_type: "canonical_id",
        summary: "Try to collapse relation kinds as record ids.",
        rationale: "Relation kind inventory decisions should be mappings, not record identity decisions.",
        record_kind: "relation",
        canonical_id: "uses_corridor",
        aliases: ["has_corridor"],
      },
      context(),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toContain('decision_type "canonical_id" is not allowed');
  });

  it("rejects mapping decisions that are not exact aliases", () => {
    const result = validateOntologyDecision(
      {
        decision_id: "relation_kind_inverse_direction",
        candidate_id: "relation-ontology:relation-kind-inventory",
        decision_type: "relation_kind_mapping",
        summary: "Do not map inverse direction as an alias.",
        rationale: "The endpoints would need to be reversed.",
        field: "relation_kind",
        from: "has corridor",
        to: "uses_corridor",
        mapping_relation: "inverse_direction",
      },
      context(),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toContain('mapping_relation "inverse_direction" cannot be emitted');
  });

  it("rejects relation_kind_mapping rows that use relation_kind instead of from", () => {
    const result = validateOntologyDecision(
      {
        decision_id: "relation_kind_wrong_source_field",
        candidate_id: "relation-ontology:relation-kind-inventory",
        decision_type: "relation_kind_mapping",
        summary: "Wrong shape.",
        rationale: "The observed value is in relation_kind instead of from.",
        field: "relation_kind",
        relation_kind: "has corridor",
        to: "uses_corridor",
        mapping_relation: "exact_alias",
      },
      context(),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("mapping decisions require from");
    expect(result.issues).toContain("relation_kind_mapping must put the observed value in from, not relation_kind");
  });

  it("requires source-gap resolutions to cite resolving sources and evidence", () => {
    const result = validateOntologyDecision(
      {
        decision_id: "gap_a_resolved",
        candidate_id: "source-gap-resolution:gap:gap_a",
        decision_type: "source_gap_resolution",
        summary: "Resolve gap A.",
        rationale: "Another source contains the missing data.",
        source_gap_record_id: "gap_a",
        resolving_source_ids: ["source_b"],
      },
      context(),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("source_gap_resolution requires evidence_refs");
  });

  it("splits machine-valid decisions from quarantined envelope rows", () => {
    const result = validateOntologyDecisionEnvelope(
      packet(),
      {
        agent_id: "relation-ontology",
        decisions: [
          {
            decision_id: "relation_kind_has_corridor",
            candidate_id: "relation-ontology:relation-kind-inventory",
            decision_type: "relation_kind_mapping",
            summary: "Map has corridor to uses_corridor.",
            rationale: "Observed in the packet.",
            field: "relation_kind",
            from: "has corridor",
            to: "uses_corridor",
            mapping_relation: "exact_alias",
          },
          {
            decision_id: "bad",
            candidate_id: "missing-candidate",
            decision_type: "no_change",
            summary: "Bad candidate.",
            rationale: "Should quarantine.",
          },
        ],
      },
      context(),
    );

    expect(result.validated).toHaveLength(1);
    expect(result.quarantined).toHaveLength(1);
  });
});
