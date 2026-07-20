import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import type { JsonObject, MtaCanonicalRecord, MtaObservationKind } from "@mta-wiki/db/types";
import {
  assertTreatmentVocabularyReconciled,
  authorizeTreatmentRouteScope,
  collectTreatmentVocabulary,
  parseTreatmentSemanticContract,
  reconcileTreatmentVocabulary,
  treatmentSemanticContractBytes,
  treatmentVocabularySortedUnionBytes,
  treatmentVocabularySortedUnionSha256,
  type TreatmentSemanticContract,
} from "@mta-wiki/pipeline/materialize/treatment-semantics";

function record(
  recordId: string,
  recordKind: MtaObservationKind,
  payload: JsonObject = {},
  sourceId = "source_a",
): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: recordKind,
    source_id: sourceId,
    local_observation_id: recordId,
    display_name: recordId,
    payload,
    evidence_refs: [{
      source_id: sourceId,
      evidence_id: `${sourceId}#block_1`,
      block_id: "block_1",
      page_number: 1,
      text_sha256: "sha256:fixture",
      role: "fixture",
    }],
    submission_ids: [`submission_${recordId}`],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-20T00:00:00.000Z",
  };
}

function relation(
  recordId: string,
  subjectId: string,
  objectId: string,
  relationKind: string,
  relationFamily: string,
): MtaCanonicalRecord {
  return record(recordId, "relation", {
    subject_id: subjectId,
    object_id: objectId,
    relation_kind: relationKind,
    relation_family: relationFamily,
    assertion_status: "delivered",
  });
}

const exactContract: TreatmentSemanticContract = {
  schema_version: 1,
  dispositions: [
    {
      raw_treatment_kind: "bus lanes and queue jumps",
      record_ids: ["treatment_bundle"],
      disposition: "bundle",
      bundle_family: null,
      members: [
        { raw_treatment_kind: "bus lanes", canonical_kind: "bus_lane", family: "bus_priority_lane" },
        { raw_treatment_kind: "queue jumps", canonical_kind: "queue_jump", family: "signal_priority" },
      ],
    },
    {
      raw_treatment_kind: "busway",
      record_ids: ["treatment_busway_a", "treatment_busway_b"],
      disposition: "atomic",
      canonical_kind: "busway",
      family: "bus_priority_lane",
    },
    {
      raw_treatment_kind: "BRT toolbox",
      record_ids: ["treatment_brt"],
      disposition: "unresolved",
      review_reason: "Umbrella wording does not enumerate source-supported atomic members.",
    },
  ],
};

describe("treatment semantic contract", () => {
  test("strictly decodes atomic, lossless bundle, and unresolved dispositions", () => {
    expect(parseTreatmentSemanticContract(exactContract)).toEqual(exactContract);
    expect(() => parseTreatmentSemanticContract({
      ...exactContract,
      extra: true,
    })).toThrow("unknown field(s): extra");
    expect(() => parseTreatmentSemanticContract({
      schema_version: 1,
      dispositions: [{
        raw_treatment_kind: "bus lanes and queue jumps",
        record_ids: ["treatment_bundle"],
        disposition: "bundle",
        bundle_family: null,
        members: [{ raw_treatment_kind: "bus lanes", canonical_kind: "bus_lane", family: "bus_priority_lane" }],
      }],
    })).toThrow("at least two lossless atomic members");
    expect(() => parseTreatmentSemanticContract({
      schema_version: 1,
      dispositions: [{ raw_treatment_kind: "BRT toolbox", record_ids: ["treatment_brt"], disposition: "unresolved", review_reason: "" }],
    })).toThrow("review_reason must be a non-empty string");
    expect(() => parseTreatmentSemanticContract({
      schema_version: 1,
      dispositions: [{
        raw_treatment_kind: "bus lane",
        record_ids: ["treatment_lane"],
        disposition: "atomic",
        canonical_kind: "Bus lane prose",
        family: "bus_priority_lane",
      }],
    })).toThrow("lower_snake_case semantic identifier");
  });

  test("rejects a canonical kind assigned to conflicting families", () => {
    expect(() => parseTreatmentSemanticContract({
      schema_version: 1,
      dispositions: [
        { raw_treatment_kind: "bus lane", record_ids: ["treatment_lane"], disposition: "atomic", canonical_kind: "bus_lane", family: "bus_priority_lane" },
        { raw_treatment_kind: "red bus lane", record_ids: ["treatment_red_lane"], disposition: "atomic", canonical_kind: "bus_lane", family: "street_design" },
      ],
    })).toThrow("canonical treatment kind bus_lane has conflicting families");
  });

  test("serializes deterministic bytes independent of disposition/member order", () => {
    const reordered: TreatmentSemanticContract = {
      schema_version: 1,
      dispositions: [...exactContract.dispositions].reverse().map((entry) =>
        entry.disposition === "bundle" ? { ...entry, members: [...entry.members].reverse() } : entry),
    };
    expect(treatmentSemanticContractBytes(reordered)).toBe(treatmentSemanticContractBytes(exactContract));
  });

  test("allows one repeated literal to have disjoint context-specific dispositions", () => {
    const repeatedLiteralContract = parseTreatmentSemanticContract({
      schema_version: 1,
      dispositions: [
        {
          raw_treatment_kind: "transit and pedestrian improvements",
          record_ids: ["treatment_context_a"],
          disposition: "bundle",
          bundle_family: null,
          members: [
            { raw_treatment_kind: "transit improvement", canonical_kind: "transit_priority", family: "bus_priority" },
            { raw_treatment_kind: "pedestrian improvement", canonical_kind: "pedestrian_improvement", family: "street_design" },
          ],
        },
        {
          raw_treatment_kind: "transit and pedestrian improvements",
          record_ids: ["treatment_context_b"],
          disposition: "unresolved",
          review_reason: "This source does not enumerate which transit or pedestrian measures were included.",
        },
      ],
    });
    const inventory = collectTreatmentVocabulary([
      record("treatment_context_a", "treatment_component", { treatment_kind: "transit and pedestrian improvements" }),
      record("treatment_context_b", "treatment_component", { treatment_kind: "transit and pedestrian improvements" }, "source_b"),
    ]);
    expect(assertTreatmentVocabularyReconciled(inventory, repeatedLiteralContract)).toMatchObject({
      exact: true,
      inventory_literal_count: 1,
      disposition_count: 2,
      bundle_count: 1,
      unresolved_count: 1,
      duplicates: [],
    });
    expect(treatmentSemanticContractBytes({
      ...repeatedLiteralContract,
      dispositions: [...repeatedLiteralContract.dispositions].reverse(),
    })).toBe(treatmentSemanticContractBytes(repeatedLiteralContract));
  });
});

describe("treatment vocabulary inventory", () => {
  const treatments = [
    record("treatment_busway_a", "treatment_component", {
      treatment_kind: "busway",
      treatment_family: "busway",
    }),
    {
      ...record("treatment_busway_b", "treatment_component", {
        treatment_kind: "busway",
        treatment_family: "busway",
      }, "source_b"),
      source_ids: ["source_b", "source_c"],
    },
    record("treatment_bundle", "treatment_component", {
      treatment_kind: "bus lanes and queue jumps",
      treatment_family: "bus_priority",
    }),
    record("treatment_brt", "treatment_component", {
      treatment_kind: "BRT toolbox",
      treatment_family: "bus_priority",
    }),
  ];

  test("preserves exact literals and record/source/evidence provenance with deterministic counts", () => {
    const inventory = collectTreatmentVocabulary(treatments);
    expect(inventory).toMatchObject({
      literal_count: 3,
      record_count: 4,
      source_count: 3,
      invalid_records: [],
    });
    expect(inventory.entries.map((entry) => entry.raw_treatment_kind)).toEqual([
      "BRT toolbox",
      "bus lanes and queue jumps",
      "busway",
    ]);
    expect(inventory.entries.find((entry) => entry.raw_treatment_kind === "busway")).toMatchObject({
      record_count: 2,
      source_count: 3,
      per_source_counts: [
        { source_id: "source_a", record_count: 1, evidence_ref_count: 1 },
        { source_id: "source_b", record_count: 1, evidence_ref_count: 1 },
        { source_id: "source_c", record_count: 1, evidence_ref_count: 0 },
      ],
    });
    expect(inventory.entries[2]?.provenance[0]).toMatchObject({
      record_id: "treatment_busway_a",
      normalized_treatment_family: "busway",
      evidence_refs: [{ source_id: "source_a", evidence_id: "source_a#block_1" }],
    });
  });

  test("pins sorted-union bytes and SHA-256", () => {
    const values = ["busway", "BRT toolbox", "busway", "bus lanes and queue jumps"];
    const expectedBytes = "BRT toolbox\nbus lanes and queue jumps\nbusway\n";
    expect(treatmentVocabularySortedUnionBytes(values)).toBe(expectedBytes);
    expect(treatmentVocabularySortedUnionSha256(values)).toBe(
      "ac57827063bb9620c08eb27d6935fbadb351c7c0bba2ee17979851da885cfc4f",
    );
    expect(createHash("sha256").update(expectedBytes).digest("hex")).toBe(
      "ac57827063bb9620c08eb27d6935fbadb351c7c0bba2ee17979851da885cfc4f",
    );
    expect(collectTreatmentVocabulary(treatments).sorted_union_sha256).toBe(
      treatmentVocabularySortedUnionSha256(exactContract.dispositions.map((entry) => entry.raw_treatment_kind)),
    );
  });

  test("reports missing, stale, duplicate, and invalid records and fails closed", () => {
    const inventory = collectTreatmentVocabulary([
      ...treatments,
      record("treatment_missing_kind", "treatment_component"),
    ]);
    const contract = parseTreatmentSemanticContract({
      schema_version: 1,
      dispositions: [
        exactContract.dispositions[0],
        exactContract.dispositions[0],
        exactContract.dispositions[1],
        { raw_treatment_kind: "stale literal", record_ids: ["treatment_stale"], disposition: "unresolved", review_reason: "No longer emitted." },
      ],
    });
    const reconciliation = reconcileTreatmentVocabulary(inventory, contract);
    expect(reconciliation.exact).toBe(false);
    expect(reconciliation.missing.map((entry) => entry.raw_treatment_kind)).toEqual(["BRT toolbox"]);
    expect(reconciliation.stale.map((entry) => entry.raw_treatment_kind)).toEqual(["stale literal"]);
    expect(reconciliation.duplicates).toEqual([{
      raw_treatment_kind: "bus lanes and queue jumps",
      record_id: "treatment_bundle",
      count: 2,
    }]);
    expect(reconciliation.stale_record_ids).toEqual([{
      raw_treatment_kind: "stale literal",
      record_id: "treatment_stale",
      reason: "missing_record",
    }]);
    expect(reconciliation.invalid_records).toEqual([{
      record_id: "treatment_missing_kind",
      source_id: "source_a",
      reason: "missing_raw_treatment_kind",
    }]);
    expect(() => assertTreatmentVocabularyReconciled(inventory, contract)).toThrow(
      "Treatment semantic vocabulary mismatch",
    );
  });

  test("accepts a one-to-one reviewed disposition set including unresolved literals", () => {
    const reconciliation = assertTreatmentVocabularyReconciled(
      collectTreatmentVocabulary(treatments),
      parseTreatmentSemanticContract(exactContract),
    );
    expect(reconciliation).toMatchObject({
      exact: true,
      inventory_literal_count: 3,
      disposition_count: 3,
      atomic_count: 1,
      bundle_count: 1,
      unresolved_count: 1,
    });
  });
});

describe("exact route-treatment scope authorization", () => {
  const project = record("project_queens-bus-network-redesign", "project");
  const q27 = record("route_q27-ace", "route", { route_id: "Q27" });
  const b57 = record("route_b57-grand-ave-2024", "route", { route_id: "B57" });
  const q1 = record("route_q1", "route", { route_id: "Q1" });
  const b44 = record("route_b44", "route", { route_id: "B44" });
  const b44Plus = record("route_b44-plus", "route", { route_id: "B44+" });
  const q27Treatment = record("treatment_q27-holly-kissena-reroute-2025", "treatment_component", {
    treatment_kind: "route change",
    treatment_family: "service_pattern",
  });
  const b57Treatment = record("treatment_b57-stop-removal-2025", "treatment_component", {
    treatment_kind: "stop removal",
    treatment_family: "bus_stop_or_boarding",
  });
  const b44Treatment = record("treatment_b44_bus_lane", "treatment_component", {
    treatment_kind: "bus lane",
    treatment_family: "bus_lane",
  });
  const memberships = [
    relation("relation_qbnr-affects-q27", project.record_id, q27.record_id, "affects_route", "route_scope"),
    relation("relation_qbnr-affects-b57", project.record_id, b57.record_id, "affects_route", "route_scope"),
    relation("relation_qbnr-affects-q1", project.record_id, q1.record_id, "affects_route", "route_scope"),
    relation("relation_qbnr-has-q27-reroute", project.record_id, q27Treatment.record_id, "has_treatment", "treatment_context"),
    relation("relation_qbnr-has-b57-stop-removal", project.record_id, b57Treatment.record_id, "has_treatment", "treatment_context"),
  ];
  const records = [project, q27, b57, q1, b44, b44Plus, q27Treatment, b57Treatment, b44Treatment, ...memberships];
  const q27Occurrence = {
    occurrence_id: "occurrence:q27",
    review_state: "approved" as const,
    routes: [{
      route_record_id: q27.record_id,
      gtfs_route_id: "Q27",
      evidence_bindings: [{ role: "route_scope" as const, record_id: memberships[0]!.record_id, source_id: "source_a", evidence_id: "source_a#q27" }],
    }],
    treatment: {
      kind: "atomic" as const,
      member: {
        treatment_record_id: q27Treatment.record_id,
        treatment_family: "service_pattern",
        evidence_bindings: [{ role: "treatment_scope" as const, record_id: memberships[3]!.record_id, source_id: "source_a", evidence_id: "source_a#q27" }],
      },
    },
  };
  const b57Occurrence = {
    occurrence_id: "occurrence:b57",
    review_state: "approved" as const,
    routes: [{
      route_record_id: b57.record_id,
      gtfs_route_id: "B57",
      evidence_bindings: [{ role: "route_scope" as const, record_id: memberships[1]!.record_id, source_id: "source_a", evidence_id: "source_a#b57" }],
    }],
    treatment: {
      kind: "atomic" as const,
      member: {
        treatment_record_id: b57Treatment.record_id,
        treatment_family: "bus_stop_or_boarding",
        evidence_bindings: [{ role: "treatment_scope" as const, record_id: memberships[4]!.record_id, source_id: "source_a", evidence_id: "source_a#b57" }],
      },
    },
  };

  test("authorizes only the exact pair in an approved occurrence", () => {
    expect(authorizeTreatmentRouteScope({
      route_record_id: q27.record_id,
      treatment_record_id: q27Treatment.record_id,
      records,
      occurrences: [q27Occurrence, b57Occurrence],
    })).toMatchObject({
      resolution: "authorized",
      route_record_id: "route_q27-ace",
      treatment_record_id: "treatment_q27-holly-kissena-reroute-2025",
      channels: [{ channel: "approved_operational_occurrence", occurrence_id: "occurrence:q27" }],
    });
  });

  test("blocks Q27/B57 cross-fan-out through their shared Queens project", () => {
    const result = authorizeTreatmentRouteScope({
      route_record_id: q27.record_id,
      treatment_record_id: b57Treatment.record_id,
      records,
      occurrences: [q27Occurrence, b57Occurrence],
    });
    expect(result).toEqual({
      resolution: "review_required",
      route_record_id: "route_q27-ace",
      treatment_record_id: "treatment_b57-stop-removal-2025",
      reason: "no_direct_relation_or_approved_occurrence",
      shared_project_context: [{
        project_record_id: "project_queens-bus-network-redesign",
        route_membership_relation_ids: ["relation_qbnr-affects-q27"],
        treatment_membership_relation_ids: ["relation_qbnr-has-b57-stop-removal"],
      }],
    });
    expect(authorizeTreatmentRouteScope({
      route_record_id: q1.record_id,
      treatment_record_id: q27Treatment.record_id,
      records,
      occurrences: [q27Occurrence, b57Occurrence],
    }).resolution).toBe("review_required");
  });

  test("accepts an exact evidence-bound direct relation but rejects vague relation semantics", () => {
    const direct = relation("relation_b44-has-lane", b44.record_id, b44Treatment.record_id, "has_treatment", "treatment_context");
    const vague = relation("relation_b44-plus-related-lane", b44Plus.record_id, b44Treatment.record_id, "related_to", "dependency_or_reference");
    expect(authorizeTreatmentRouteScope({
      route_record_id: b44.record_id,
      treatment_record_id: b44Treatment.record_id,
      records: [...records, direct, vague],
    }).resolution).toBe("authorized");
    expect(authorizeTreatmentRouteScope({
      route_record_id: b44Plus.record_id,
      treatment_record_id: b44Treatment.record_id,
      records: [...records, direct, vague],
    }).resolution).toBe("review_required");
  });
});
