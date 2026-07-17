import { describe, expect, it } from "bun:test";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  auditOccurrenceTreatmentPhysicality,
  buildOccurrenceTreatmentPhysicalityReview,
  type OccurrenceTreatmentPhysicalityInput,
} from "@mta-wiki/pipeline/quality/occurrence-treatment-physicality";

function record(
  recordId: string,
  recordKind: MtaCanonicalRecord["record_kind"],
  payload: JsonObject,
  withEvidence = true,
): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: recordKind,
    source_id: "fixture_source",
    local_observation_id: recordId,
    display_name: recordId,
    payload,
    evidence_refs: withEvidence
      ? [{
        source_id: "fixture_source",
        evidence_id: `fixture_source#${recordId}`,
        block_id: recordId,
        source_path: "raw/sources/fixture_source/blocks.jsonl",
        text_sha256: `sha256:${"a".repeat(64)}`,
        text_source: "raw_text",
      }]
      : [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-16T04:00:00.000Z",
  };
}

function treatment(
  recordId: string,
  family: string,
  kind: string,
  withEvidence = true,
): MtaCanonicalRecord {
  return record(recordId, "treatment_component", {
    treatment_family: family,
    treatment_kind: kind,
  }, withEvidence);
}

function occurrence(input: {
  occurrenceId: string;
  treatmentId: string;
  treatmentFamily: string;
  physicalScope?: boolean | undefined;
}): OccurrenceTreatmentPhysicalityInput {
  const relationId = `relation_scope_${input.occurrenceId}`;
  return {
    occurrence_id: input.occurrenceId,
    study_projection_eligible: true,
    treatment: {
      kind: "atomic",
      member: {
        treatment_record_id: input.treatmentId,
        treatment_family: input.treatmentFamily,
        evidence_bindings: [],
      },
    },
    physical_scope_record_ids: input.physicalScope ? ["corridor_fixture"] : [],
    physical_scope_relation_record_ids: input.physicalScope ? [relationId] : [],
    physical_scope_evidence_bindings: input.physicalScope
      ? [{
        role: "physical_scope",
        record_id: relationId,
        source_id: "fixture_source",
        evidence_id: `fixture_source#${relationId}`,
      }]
      : [],
  };
}

function physicalRelation(
  occurrenceId: string,
  treatmentId: string,
): MtaCanonicalRecord {
  return record(`relation_scope_${occurrenceId}`, "relation", {
    subject_id: treatmentId,
    object_id: "corridor_fixture",
    relation_kind: "located_on_corridor",
    relation_family: "corridor_scope",
    assertion_status: "delivered",
  });
}

function auditFixture(input: {
  occurrences: OccurrenceTreatmentPhysicalityInput[];
  treatments: MtaCanonicalRecord[];
  relations?: MtaCanonicalRecord[] | undefined;
}) {
  const review = buildOccurrenceTreatmentPhysicalityReview({
    occurrences: input.occurrences,
    treatments: input.treatments,
  });
  return {
    review,
    audit: auditOccurrenceTreatmentPhysicality({
      occurrences: input.occurrences,
      treatments: input.treatments,
      relations: input.relations ?? [],
      corridors: [record("corridor_fixture", "corridor", {})],
      decisions: review.decisions,
    }),
  };
}

describe("occurrence treatment physicality v1", () => {
  it("accepts a physical corridor treatment only with exact direct scope and evidence", () => {
    const treatmentId = "treatment_physical";
    const occurrenceId = "occurrence:physical";
    const occurrences = [occurrence({
      occurrenceId,
      treatmentId,
      treatmentFamily: "bus_lane",
      physicalScope: true,
    })];
    const result = auditFixture({
      occurrences,
      treatments: [treatment(treatmentId, "bus_lane", "center-running bus lanes")],
      relations: [physicalRelation(occurrenceId, treatmentId)],
    });

    expect(result.review.findings).toEqual([]);
    expect(result.audit.findings).toEqual([]);
    expect(result.audit.treatmentRows[0]?.classification)
      .toBe("physical_corridor_or_segment_intervention");
    expect(result.audit.occurrenceRows[0]?.primary_disposition)
      .toBe("physical_scope_satisfied");
    expect(result.audit.summary.hard_mode_ready).toBe(true);
  });

  it("marks reviewed service stop-pattern changes nonphysical without granting eligibility", () => {
    const treatmentId = "treatment_stop_removal";
    const result = auditFixture({
      occurrences: [occurrence({
        occurrenceId: "occurrence:nonphysical",
        treatmentId,
        treatmentFamily: "bus_stop_or_boarding",
      })],
      treatments: [treatment(treatmentId, "bus_stop_or_boarding", "stop removal")],
    });

    expect(result.audit.findings).toEqual([]);
    expect(result.audit.treatmentRows[0]?.classification)
      .toBe("nonphysical_service_operations_policy_control");
    expect(result.audit.treatmentRows[0]?.scope_requirement).toBe("not_applicable");
    expect(result.audit.occurrenceRows[0]?.primary_disposition)
      .toBe("physical_scope_not_applicable");
  });

  it("fails closed when a physical corridor treatment lacks occurrence scope", () => {
    const treatmentId = "treatment_physical";
    const result = auditFixture({
      occurrences: [occurrence({
        occurrenceId: "occurrence:missing-scope",
        treatmentId,
        treatmentFamily: "bus_lane",
      })],
      treatments: [treatment(treatmentId, "bus_lane", "center-running bus lanes")],
    });

    expect(result.audit.findings.map((finding) => finding.code))
      .toContain("OTPHY_PHYSICAL_SCOPE_MISSING");
    expect(result.audit.occurrenceRows[0]?.primary_disposition)
      .toBe("physical_scope_missing");
    expect(result.audit.summary.physical_scope_complete).toBe(false);
  });

  it("requires review for an unseen treatment kind", () => {
    const treatmentId = "treatment_unseen";
    const result = auditFixture({
      occurrences: [occurrence({
        occurrenceId: "occurrence:unseen",
        treatmentId,
        treatmentFamily: "service_pattern",
      })],
      treatments: [treatment(treatmentId, "service_pattern", "hovercraft conversion")],
    });

    expect(result.review.decisions[0]?.classification).toBe("review_required");
    expect(result.audit.findings.map((finding) => finding.code))
      .toContain("OTPHY_TREATMENT_KIND_UNREVIEWED");
    expect(result.audit.summary.review_ledger_complete).toBe(false);
  });

  it("requires review when exact canonical treatment evidence is missing", () => {
    const treatmentId = "treatment_no_evidence";
    const result = auditFixture({
      occurrences: [occurrence({
        occurrenceId: "occurrence:no-evidence",
        treatmentId,
        treatmentFamily: "service_pattern",
      })],
      treatments: [treatment(treatmentId, "service_pattern", "route change", false)],
    });

    expect(result.review.decisions[0]?.classification).toBe("review_required");
    expect(result.audit.findings.map((finding) => finding.code))
      .toContain("OTPHY_TREATMENT_EVIDENCE_MISSING");
  });

  it("fails closed on conflicting occurrence family memberships", () => {
    const treatmentId = "treatment_conflict";
    const result = auditFixture({
      occurrences: [
        occurrence({
          occurrenceId: "occurrence:conflict-a",
          treatmentId,
          treatmentFamily: "service_pattern",
        }),
        occurrence({
          occurrenceId: "occurrence:conflict-b",
          treatmentId,
          treatmentFamily: "bus_stop_or_boarding",
        }),
      ],
      treatments: [treatment(treatmentId, "service_pattern", "route change")],
    });

    expect(result.review.decisions[0]?.classification).toBe("review_required");
    expect(result.audit.findings.map((finding) => finding.code))
      .toContain("OTPHY_TREATMENT_MEMBERSHIP_CONFLICT");
    expect(result.audit.findings.map((finding) => finding.code))
      .toContain("OTPHY_TREATMENT_FAMILY_MISMATCH");
  });

  it("rejects post-review eligible occurrence membership drift", () => {
    const treatmentId = "treatment_membership_drift";
    const treatments = [treatment(treatmentId, "service_pattern", "route change")];
    const reviewedOccurrences = [occurrence({
      occurrenceId: "occurrence:reviewed",
      treatmentId,
      treatmentFamily: "service_pattern",
    })];
    const review = buildOccurrenceTreatmentPhysicalityReview({
      occurrences: reviewedOccurrences,
      treatments,
    });
    const audit = auditOccurrenceTreatmentPhysicality({
      occurrences: [occurrence({
        occurrenceId: "occurrence:changed",
        treatmentId,
        treatmentFamily: "service_pattern",
      })],
      treatments,
      relations: [],
      corridors: [record("corridor_fixture", "corridor", {})],
      decisions: review.decisions,
    });

    expect(audit.findings.map((finding) => finding.code))
      .toContain("OTPHY_OCCURRENCE_MEMBERSHIP_DRIFT");
    expect(audit.summary.hard_mode_ready).toBe(false);
  });
});
