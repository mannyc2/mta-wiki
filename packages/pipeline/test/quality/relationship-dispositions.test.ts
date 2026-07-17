import { describe, expect, it } from "bun:test";
import {
  parseRelationshipDispositionDecision,
  readRelationshipDispositionLedger,
  validateRelationshipDispositionLedger,
  type RelationshipDispositionDecision,
} from "@mta-wiki/pipeline/quality/relationship-dispositions";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import { entriesToRecords } from "@mta-wiki/pipeline/materialize/materialize";
import { retiredSubmissionIds } from "@mta-wiki/pipeline/records/submission-overrides";
import {
  readSemanticCorrections,
  readSemanticCorrectionSupersessions,
  withSemanticCorrections,
} from "@mta-wiki/pipeline/records/semantic-corrections";
import { readSubmissionEntries } from "@mta-wiki/pipeline/records/submissions";

const operationalCoreRoles = [
  "canonical_event_identity",
  "operational_onset",
  "phase_identity",
  "realized_status",
  "route_scope",
  "timeline_subject",
  "treatment_scope",
];

function decision(overrides: Partial<RelationshipDispositionDecision> = {}): RelationshipDispositionDecision {
  return {
    schema_version: 1,
    contract_id: "relationship-dispositions-v1",
    decision_id: "relationship-disposition-v1:event_test",
    selector: "operational_event",
    record_id: "event_test",
    record_kind: "event",
    primary_disposition: "reviewed_non_projectable_required_roles_unproven",
    study_projectable: false,
    waiver: true,
    reviewed_at: "2026-07-15",
    reviewed_by: "codex-relationship-integrity-campaign",
    reason: "Required route and treatment roles remain unproved after source and graph review.",
    reason_codes: ["route_scope_unproven", "treatment_scope_unproven"],
    evidence_ids: ["source_test#p001_c0001"],
    related_record_ids: [],
    occurrence_ids: [],
    required_roles_satisfied: [
      "canonical_event_identity",
      "operational_onset",
      "phase_identity",
      "realized_status",
      "timeline_subject",
    ],
    required_roles_missing: ["route_scope", "treatment_scope"],
    investigation: {
      method: "canonical_graph_and_bound_source_review",
      source_ids_checked: ["source_test"],
      graph_record_ids_checked: ["event_test"],
      gap_ids_checked: [],
      acquisition_receipt_ids: [],
      exact_supported_claims: [
        "canonical_event_identity",
        "evidence_binding",
        "operational_onset",
        "phase_identity",
        "realized_status",
        "timeline_subject",
      ],
      exact_unsupported_claims: ["route_scope", "treatment_scope"],
    },
    ...overrides,
  };
}

function eventRecord(): MtaCanonicalRecord {
  return {
    record_id: "event_test",
    record_kind: "event",
    source_id: "source_test",
    source_ids: ["source_test"],
    local_observation_id: "event_test",
    local_observation_ids: ["event_test"],
    display_name: "Test event",
    payload: { event_family: "launch" },
    evidence_refs: [{ source_id: "source_test", evidence_id: "source_test#p001_c0001", block_id: "p001_c0001" }],
    submission_ids: ["sub_test"],
    truth_status: "source_stated",
    review_state: "reviewed",
    generated_at: "2026-07-15T00:00:00.000Z",
  };
}

describe("relationship dispositions v1", () => {
  it("strictly accepts an evidence-linked non-projectable waiver", () => {
    expect(parseRelationshipDispositionDecision(decision(), "fixture")).toEqual(decision());
  });

  it("never lets a waiver confer study eligibility", () => {
    expect(() => parseRelationshipDispositionDecision(decision({ study_projectable: true }), "fixture"))
      .toThrow("waiver must never make a record study-projectable");
  });

  it("requires projectable operational events to identify an occurrence", () => {
    expect(() => parseRelationshipDispositionDecision(decision({
      primary_disposition: "eligible_occurrence_present",
      study_projectable: true,
      waiver: false,
      required_roles_missing: [],
    }), "fixture")).toThrow("must identify an eligible occurrence");
  });

  it("accepts an exact eligible event-to-occurrence binding", () => {
    const parsed = parseRelationshipDispositionDecision(decision({
      primary_disposition: "eligible_occurrence_present",
      study_projectable: true,
      waiver: false,
      occurrence_ids: ["occurrence_eligible"],
      required_roles_satisfied: operationalCoreRoles,
      required_roles_missing: [],
      investigation: {
        ...decision().investigation,
        exact_supported_claims: operationalCoreRoles,
        exact_unsupported_claims: [],
      },
    }), "fixture");
    expect(parsed.occurrence_ids).toEqual(["occurrence_eligible"]);
  });

  it("allows occurrence ids only for exact eligible or explicitly excluded occurrence decisions", () => {
    expect(() => parseRelationshipDispositionDecision(decision({ occurrence_ids: ["bogus"] }), "fixture"))
      .toThrow("only reviewed_non_projectable_occurrence_excluded may bind ineligible occurrence ids");
    expect(parseRelationshipDispositionDecision(decision({
      primary_disposition: "reviewed_non_projectable_occurrence_excluded",
      occurrence_ids: ["occurrence_excluded"],
      reason_codes: ["unsupported_bundle_analysis_family"],
      required_roles_satisfied: operationalCoreRoles,
      required_roles_missing: [],
      investigation: {
        ...decision().investigation,
        exact_supported_claims: operationalCoreRoles,
        exact_unsupported_claims: [],
      },
    }), "fixture").occurrence_ids).toEqual(["occurrence_excluded"]);
  });

  it("rejects unversioned, incomplete, contradictory, or unsupported waiver roles", () => {
    expect(() => parseRelationshipDispositionDecision(decision({
      required_roles_missing: [
        "invented_role_that_no_contract_defines",
        "route_scope",
        "treatment_scope",
      ],
      investigation: {
        ...decision().investigation,
        exact_unsupported_claims: [
          "invented_role_that_no_contract_defines",
          "route_scope",
          "treatment_scope",
        ],
      },
    }), "fixture")).toThrow("exactly partition the versioned");

    expect(() => parseRelationshipDispositionDecision(decision({
      required_roles_satisfied: [
        "canonical_event_identity",
        "operational_onset",
        "phase_identity",
        "realized_status",
      ],
    }), "fixture")).toThrow("exactly partition the versioned");

    expect(() => parseRelationshipDispositionDecision(decision({
      investigation: {
        ...decision().investigation,
        exact_unsupported_claims: ["route_scope"],
      },
    }), "fixture")).toThrow("must exactly match required_roles_missing");

    expect(() => parseRelationshipDispositionDecision(decision({
      investigation: {
        ...decision().investigation,
        exact_supported_claims: [
          "canonical_event_identity",
          "evidence_binding",
          "operational_onset",
          "phase_identity",
          "realized_status",
        ],
      },
    }), "fixture")).toThrow("must include every satisfied role");

    expect(() => parseRelationshipDispositionDecision(decision({
      investigation: {
        ...decision().investigation,
        exact_supported_claims: [
          ...decision().investigation.exact_supported_claims,
          "self_attested_ready",
        ].sort(),
      },
    }), "fixture")).toThrow("contains unversioned claims");
  });

  it("requires waiver evidence sources and reviewed exclusion reasons to be exact", () => {
    expect(() => parseRelationshipDispositionDecision(decision({
      investigation: {
        ...decision().investigation,
        source_ids_checked: ["unrelated_source"],
      },
    }), "fixture")).toThrow("does not include evidence source source_test");

    expect(() => parseRelationshipDispositionDecision(decision({
      primary_disposition: "reviewed_non_projectable_occurrence_excluded",
      occurrence_ids: ["occurrence_excluded"],
      reason_codes: ["not_a_versioned_exclusion"],
      required_roles_satisfied: operationalCoreRoles,
      required_roles_missing: [],
      investigation: {
        ...decision().investigation,
        exact_supported_claims: operationalCoreRoles,
        exact_unsupported_claims: [],
      },
    }), "fixture")).toThrow("lacks a versioned exclusion reason code");

    expect(() => parseRelationshipDispositionDecision(decision({
      reason_codes: [],
    }), "fixture")).toThrow("must identify why the reviewed waiver is non-projectable");
  });

  it("accepts only the exact physical-scope role contracts", () => {
    expect(parseRelationshipDispositionDecision(decision({
      selector: "bus_lane_family_treatment",
      record_kind: "treatment_component",
      primary_disposition: "physical_scope_satisfied",
      study_projectable: false,
      waiver: false,
      occurrence_ids: [],
      required_roles_satisfied: ["physical_scope"],
      required_roles_missing: [],
      investigation: {
        ...decision().investigation,
        exact_supported_claims: [
          "evidence_backed_canonical_physical_scope",
          "physical_scope",
        ],
        exact_unsupported_claims: [],
      },
    }), "fixture").required_roles_satisfied).toEqual(["physical_scope"]);

    expect(parseRelationshipDispositionDecision(decision({
      selector: "bus_lane_family_treatment",
      record_kind: "treatment_component",
      primary_disposition: "reviewed_non_projectable_physical_scope_unproven",
      study_projectable: false,
      waiver: true,
      occurrence_ids: [],
      required_roles_satisfied: ["typed_non_projectable_disposition"],
      required_roles_missing: ["physical_scope"],
      investigation: {
        ...decision().investigation,
        exact_supported_claims: [
          "typed_disposition:reviewed_non_projectable_physical_scope_unproven",
          "typed_non_projectable_disposition",
        ],
        exact_unsupported_claims: ["physical_scope"],
      },
    }), "fixture").required_roles_missing).toEqual(["physical_scope"]);
  });

  it("rejects selector-incompatible primaries and truth-improving treatment dispositions", () => {
    expect(() => parseRelationshipDispositionDecision(decision({
      primary_disposition: "physical_scope_satisfied",
    }), "fixture")).toThrow("not valid for operational_event");
    expect(() => parseRelationshipDispositionDecision(decision({
      selector: "bus_lane_family_treatment",
      record_kind: "treatment_component",
      primary_disposition: "reviewed_non_projectable_physical_scope_unproven",
      study_projectable: true,
      waiver: false,
      required_roles_satisfied: ["typed_non_projectable_disposition"],
      required_roles_missing: ["physical_scope"],
    }), "fixture")).toThrow("physical-scope review alone must never make a treatment study-projectable");
  });

  it("rejects evidence and graph references that do not resolve to canonical records", () => {
    const invalid = decision({
      evidence_ids: ["source_test#p999_c9999"],
      related_record_ids: ["route_missing"],
      investigation: {
        ...decision().investigation,
        graph_record_ids_checked: ["event_test", "project_missing"],
      },
    });
    const issues = validateRelationshipDispositionLedger([eventRecord()], {
      decisions: [invalid],
      byRecordId: new Map([[invalid.record_id, invalid]]),
    });
    expect(issues.join("\n")).toContain("cites evidence not bound");
    expect(issues.join("\n")).toContain("references missing related records");
    expect(issues.join("\n")).toContain("investigation references missing graph records");
  });

  it("revalidates typed generator objects and exact evidence-source bindings", () => {
    const typedBypass = decision({
      required_roles_missing: [
        "invented_role_that_no_contract_defines",
        "route_scope",
        "treatment_scope",
      ],
      investigation: {
        ...decision().investigation,
        exact_unsupported_claims: [
          "invented_role_that_no_contract_defines",
          "route_scope",
          "treatment_scope",
        ],
      },
    });
    const bypassIssues = validateRelationshipDispositionLedger(
      [eventRecord()],
      {
        decisions: [typedBypass],
        byRecordId: new Map([[typedBypass.record_id, typedBypass]]),
      },
    );
    expect(bypassIssues.join("\n")).toContain(
      "violates the versioned disposition contract",
    );

    const mismatchedEvidenceRecord = eventRecord();
    mismatchedEvidenceRecord.evidence_refs[0]!.source_id =
      "unrelated_source";
    const exactDecision = decision();
    const evidenceIssues = validateRelationshipDispositionLedger(
      [mismatchedEvidenceRecord],
      {
        decisions: [exactDecision],
        byRecordId: new Map([[exactDecision.record_id, exactDecision]]),
      },
    );
    expect(evidenceIssues.join("\n")).toContain(
      "is bound under mismatched source unrelated_source",
    );
    expect(evidenceIssues.join("\n")).toContain(
      "is absent from source_ids_checked",
    );
  });

  it("keeps all 1,362 operational and 669 bus-treatment decisions valid in the replayed graph", () => {
    const corrected = withSemanticCorrections(
      entriesToRecords(readSubmissionEntries(), { retiredSubmissionIds: retiredSubmissionIds() }),
      readSemanticCorrections(),
      readSemanticCorrectionSupersessions(),
    );
    expect(corrected.issues).toEqual([]);
    const ledger = readRelationshipDispositionLedger();
    const decisions = ledger.decisions;
    expect(decisions.filter((entry) => entry.selector === "operational_event")).toHaveLength(1_362);
    expect(decisions.filter((entry) => entry.selector === "bus_lane_family_treatment")).toHaveLength(669);
    expect(validateRelationshipDispositionLedger(corrected.records, ledger)).toEqual([]);

    const recordsById = new Map(corrected.records.map((record) => [record.record_id, record]));
    const staleReferences = new Set([
      "relation_nyct-employee-vaccination-site",
      "relation_rel-project-m86-sbs-launch-event",
      "relation_policy-replaces-prior-policy",
    ]);
    const referencedRecordIds = new Set(decisions.flatMap((entry) => [
      entry.record_id,
      ...entry.related_record_ids,
      ...entry.investigation.graph_record_ids_checked,
    ]));
    expect([...referencedRecordIds].filter((recordId) => !recordsById.has(recordId)).sort()).toEqual([]);
    expect([...referencedRecordIds].filter((recordId) => staleReferences.has(recordId)).sort()).toEqual([]);
    expect(decisions.flatMap((entry) => {
      const supported = entry.investigation.exact_supported_claims.filter((claim) =>
        entry.required_roles_satisfied.includes(claim));
      return supported.join("\0") === entry.required_roles_satisfied.join("\0") ? [] : [entry.record_id];
    })).toEqual([]);
    expect(decisions.flatMap((entry) =>
      entry.investigation.exact_unsupported_claims.join("\0") === entry.required_roles_missing.join("\0")
        ? []
        : [entry.record_id]
    )).toEqual([]);
    for (const entry of decisions) {
      // Keep the exact flattened surface visible to TypeScript when the decision schema changes.
      const checked = [
        ...entry.related_record_ids,
        ...entry.investigation.graph_record_ids_checked,
      ];
      expect(checked.length).toBeGreaterThan(0);
    }
  }, 180_000);
});
