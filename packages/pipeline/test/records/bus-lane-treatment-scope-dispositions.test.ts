import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "../../../core/src/paths";
import type { MtaCanonicalRecord, MtaSubmissionEntry } from "../../../db/src/types";
import { entriesToRecords } from "../../src/materialize/materialize";
import { readCanonicalRecordsFromJsonl } from "../../src/materialize/canonical-read";
import { relationEndpointShapeIssue } from "../../src/records/relations";
import { parseRelationshipDispositionDecision } from "../../src/quality/relationship-dispositions";
import {
  BUS_LANE_SCOPE_CONTRACT_ID,
  blockAssertsPhysicalBusLane,
  classifyBusLaneTreatmentKind,
  isUnboundedBusLaneTreatment,
} from "../../../../scripts/audit-bus-lane-treatment-scope-v1";

const OUTPUT_DIR = join(
  repoRoot,
  "data",
  "relationship-integrity",
  "dispositions",
  "v1",
  "bus-lane-treatments",
);
const JOURNAL_PATH = join(
  repoRoot,
  "data",
  "submissions",
  "2026-07-15T20-00-00-000Z_bus-lane-treatment-physical-scope-remediation.jsonl",
);
const EVIDENCE_REVIEW_PATH = join(OUTPUT_DIR, "evidence-review.jsonl");
const SEMANTIC_CORRECTIONS_PATH = join(repoRoot, "data", "semantic-corrections", "corrections.jsonl");

const DECISIONS = new Set([
  "physical_scope_satisfied",
  "non_physical_enforcement_or_control",
  "non_lane_supporting_feature",
  "aggregate_or_unbounded_treatment",
  "reviewed_non_projectable_physical_scope_unproven",
]);

type DecisionRow = {
  contract_id: string;
  decision_id: string;
  treatment_id: string;
  treatment_kind: string;
  canonical_status: string;
  exclusive_decision: string;
  physical_scope_requirement_satisfied: boolean;
  study_eligible: boolean | null;
  scope_bindings: Array<{
    relation_id: string;
    relation_kind: string;
    corridor_id: string;
    status: string;
    evidence_refs: Array<{ evidence_id: string; text_sha256: string | null }>;
  }>;
  evidence_refs: Array<{ evidence_id: string; text_sha256: string | null }>;
  evidence_investigation: {
    method_id: string;
    route_similarity_or_proximity_used: boolean;
  };
  review: {
    reviewed_by: string;
    review_method: string;
    method_version: number;
    reviewed_at: string;
  };
};

type RemediationRow = {
  contract_id: string;
  treatment_id: string;
  corridor_id: string;
  relation_id: string;
  source_id: string;
  route_binding_added: boolean;
  evidence_refs: Array<{ evidence_id: string; block_id: string | null; text_sha256: string | null }>;
};

type EvidenceReviewRow = {
  treatment_id: string;
  corridor_id: string | null;
  relation_id: string | null;
  verdict: "exact_current_evidence" | "repaired_adjacent_cocitation" | "reclassified_non_lane";
  facility_evidence_ids: string[];
  treatment_assertion_evidence_ids: string[];
  reviewed_additional_evidence_ids: string[];
  correction_id: string | null;
};

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(OUTPUT_DIR, name), "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("bus-lane treatment physical-scope disposition v1", () => {
  it("classifies all five fixture outcomes with explicit precedence", () => {
    expect(classifyBusLaneTreatmentKind("automated_bus_lane_enforcement")).toBe("enforcement_or_control");
    expect(classifyBusLaneTreatmentKind("bus lane hours reduction")).toBe("enforcement_or_control");
    expect(classifyBusLaneTreatmentKind("flexible bollards")).toBe("supporting_feature");
    expect(classifyBusLaneTreatmentKind("red bus lane paint")).toBe("supporting_feature");
    expect(classifyBusLaneTreatmentKind("bus_lane_improvement")).toBe("aggregate");
    expect(classifyBusLaneTreatmentKind("bus lanes, left-turn bays, turn restrictions")).toBe("aggregate");
    expect(classifyBusLaneTreatmentKind("center-running bus lanes")).toBe("physical_lane");
    expect(classifyBusLaneTreatmentKind("offset bus lane")).toBe("physical_lane");
    expect(isUnboundedBusLaneTreatment(undefined)).toBe(true);
    expect(isUnboundedBusLaneTreatment("M15 route")).toBe(true);
    expect(isUnboundedBusLaneTreatment("Webster Avenue from E 165 St to E Gun Hill Road")).toBe(false);
    expect(blockAssertsPhysicalBusLane("Offset bus lanes on Main Street")).toBe(true);
    expect(blockAssertsPhysicalBusLane("The lanes are kept clear for buses and emergency vehicles")).toBe(true);
    expect(blockAssertsPhysicalBusLane("Potential treatment: 13-foot bus stop and 10-foot travel lane")).toBe(false);
  });

  it("gives every canonical bus-lane-family treatment one immutable evidence-linked decision", () => {
    const decisions = readJsonl<DecisionRow>(join(OUTPUT_DIR, "decisions.jsonl"));
    const summary = readJson<{
      canonical_bus_lane_treatment_count: number;
      accepted_pending_bus_lane_addition_count: number;
      decision_count: number;
      projected_physical_scope_satisfied_count: number;
      non_satisfied_decision_count: number;
      study_eligible_false_count: number;
      study_eligibility_not_determined_count: number;
      evidence_linked_decision_count: number;
      reclassified_non_lane_treatment_count: number;
      exclusive_decision_counts: Record<string, number>;
    }>("summary.json");
    const canonicalTreatments = readCanonicalRecordsFromJsonl().filter(
      (record) => record.record_kind === "treatment_component" && record.payload.treatment_family === "bus_lane",
    );

    expect(decisions).toHaveLength(summary.decision_count);
    expect(summary.decision_count).toBe(summary.canonical_bus_lane_treatment_count + summary.accepted_pending_bus_lane_addition_count);
    expect(new Set(decisions.map((decision) => decision.decision_id)).size).toBe(decisions.length);
    expect(new Set(decisions.map((decision) => decision.treatment_id)).size).toBe(decisions.length);
    const decisionIds = new Set(decisions.map((decision) => decision.treatment_id));
    expect(canonicalTreatments.filter((record) => !decisionIds.has(record.record_id)).map((record) => record.record_id)).toEqual([]);
    expect(summary.reclassified_non_lane_treatment_count).toBe(1);
    expect(decisions.every((decision) => decision.contract_id === BUS_LANE_SCOPE_CONTRACT_ID)).toBe(true);
    expect(decisions.every((decision) => DECISIONS.has(decision.exclusive_decision))).toBe(true);
    expect(decisions.every((decision) => decision.evidence_refs.length > 0)).toBe(true);
    expect(decisions.every((decision) => decision.evidence_refs.every((ref) => /^sha256:[0-9a-f]{64}$/u.test(ref.text_sha256 ?? "")))).toBe(true);
    expect(decisions.every((decision) => decision.review.reviewed_by.length > 0 && decision.review.review_method.length > 0 && decision.review.method_version === 1 && decision.review.reviewed_at.length > 0)).toBe(true);
    expect(decisions.every((decision) => !decision.evidence_investigation.route_similarity_or_proximity_used)).toBe(true);

    const satisfied = decisions.filter((decision) => decision.exclusive_decision === "physical_scope_satisfied");
    const nonSatisfied = decisions.filter((decision) => decision.exclusive_decision !== "physical_scope_satisfied");
    expect(satisfied).toHaveLength(summary.projected_physical_scope_satisfied_count);
    expect(satisfied.every((decision) => decision.physical_scope_requirement_satisfied && decision.study_eligible === null && decision.scope_bindings.length > 0)).toBe(true);
    expect(nonSatisfied).toHaveLength(summary.non_satisfied_decision_count);
    expect(nonSatisfied.every((decision) => !decision.physical_scope_requirement_satisfied && decision.study_eligible === false)).toBe(true);
    expect(summary.study_eligible_false_count).toBe(nonSatisfied.length);
    expect(summary.study_eligibility_not_determined_count).toBe(satisfied.length);
    expect(summary.evidence_linked_decision_count).toBe(decisions.length);
    expect(Object.values(summary.exclusive_decision_counts).reduce((sum, count) => sum + count, 0)).toBe(decisions.length);
  });

  it("reconciles exact before, reviewed-pending, remediation, and projected scope counts", () => {
    const summary = readJson<{
      canonical_physical_scope_satisfied_count_before: number;
      accepted_pending_physical_scope_satisfied_count: number;
      campaign_remediation_relation_count: number;
      projected_physical_scope_satisfied_count: number;
      projected_physical_scope_gain: number;
      route_relationship_additions: number;
      operational_occurrence_additions: number;
    }>("summary.json");
    expect(summary.projected_physical_scope_satisfied_count).toBe(
      summary.canonical_physical_scope_satisfied_count_before
      + summary.accepted_pending_physical_scope_satisfied_count
      + summary.campaign_remediation_relation_count,
    );
    expect(summary.projected_physical_scope_gain).toBe(
      summary.accepted_pending_physical_scope_satisfied_count + summary.campaign_remediation_relation_count,
    );
    expect(summary.route_relationship_additions).toBe(0);
    expect(summary.operational_occurrence_additions).toBe(0);
  });

  it("emits every detailed decision into the common immutable completeness disposition ledger", () => {
    const detailed = readJsonl<DecisionRow>(join(OUTPUT_DIR, "decisions.jsonl"));
    const common = readJsonl<unknown>(join(OUTPUT_DIR, "review.jsonl"))
      .map((row, index) => parseRelationshipDispositionDecision(row, `review.jsonl:${index + 1}`));
    const detailedByTreatment = new Map(detailed.map((decision) => [decision.treatment_id, decision]));

    expect(common).toHaveLength(detailed.length);
    expect(new Set(common.map((decision) => decision.record_id)).size).toBe(common.length);
    for (const decision of common) {
      const source = detailedByTreatment.get(decision.record_id)!;
      expect(decision.selector).toBe("bus_lane_family_treatment");
      expect(decision.record_kind).toBe("treatment_component");
      expect(decision.primary_disposition).toBe(source.exclusive_decision);
      expect(decision.study_projectable).toBe(false);
      expect(new Set(decision.evidence_ids)).toEqual(new Set(source.evidence_refs.map((ref) => ref.evidence_id)));
      if (source.exclusive_decision === "physical_scope_satisfied") {
        expect(decision.waiver).toBe(false);
        expect(decision.required_roles_satisfied).toEqual(["physical_scope"]);
        expect(decision.required_roles_missing).toEqual([]);
      } else {
        expect(decision.waiver).toBe(true);
        expect(decision.required_roles_satisfied).toEqual(["typed_non_projectable_disposition"]);
        expect(decision.required_roles_missing).toEqual(["physical_scope"]);
      }
      expect(decision.investigation.exact_supported_claims).toEqual(decision.required_roles_satisfied);
      expect(decision.investigation.exact_unsupported_claims).toEqual(decision.required_roles_missing);
    }
  });

  it("submits only unique, evidence-backed treatment-to-corridor relations", () => {
    const remediationRows = readJsonl<RemediationRow>(join(OUTPUT_DIR, "remediation-links.jsonl"));
    const journalText = readFileSync(JOURNAL_PATH, "utf8");
    const journal = readJsonl<MtaSubmissionEntry>(JOURNAL_PATH);
    const summary = readJson<{
      campaign_remediation_relation_count: number;
      remediation_journal_sha256: string;
    }>("summary.json");
    expect(remediationRows).toHaveLength(summary.campaign_remediation_relation_count);
    expect(journal).toHaveLength(summary.campaign_remediation_relation_count);
    expect(sha256(journalText)).toBe(summary.remediation_journal_sha256);
    expect(new Set(remediationRows.map((row) => row.treatment_id)).size).toBe(remediationRows.length);
    expect(new Set(remediationRows.map((row) => row.relation_id)).size).toBe(remediationRows.length);
    expect(remediationRows.every((row) => !row.route_binding_added && row.evidence_refs.length > 0)).toBe(true);
    expect(remediationRows.every((row) => row.evidence_refs.every((ref) => Boolean(ref.block_id) && /^sha256:[0-9a-f]{64}$/u.test(ref.text_sha256 ?? "")))).toBe(true);
    expect(journal.every((entry) => entry.validation.state === "accepted" && entry.validation.issues.length === 0)).toBe(true);

    const generated = entriesToRecords(journal);
    expect(generated).toHaveLength(remediationRows.length);
    expect(generated.every((record) => record.record_kind === "relation" && record.payload.relation_kind === "located_on_corridor")).toBe(true);
    const baseline = readCanonicalRecordsFromJsonl();
    const byId = new Map(baseline.map((record) => [record.record_id, record]));
    const baselineTriples = new Map<string, string[]>();
    for (const relation of baseline.filter((record) => record.record_kind === "relation")) {
      const triple = `${String(relation.payload.relation_kind)}\0${String(relation.payload.subject_id)}\0${String(relation.payload.object_id)}`;
      baselineTriples.set(triple, [...(baselineTriples.get(triple) ?? []), relation.record_id]);
    }
    for (const relation of generated) {
      const subjectId = String(relation.payload.subject_id);
      const objectId = String(relation.payload.object_id);
      const subject = byId.get(subjectId);
      const object = byId.get(objectId);
      expect(subject?.record_kind).toBe("treatment_component");
      expect(object?.record_kind).toBe("corridor");
      expect(relationEndpointShapeIssue("located_on_corridor", subject?.record_kind, object?.record_kind)).toBeUndefined();
      expect(relation.evidence_refs.length).toBeGreaterThan(0);
      const triple = `located_on_corridor\0${subjectId}\0${objectId}`;
      expect((baselineTriples.get(triple) ?? []).filter((recordId) => recordId !== relation.record_id)).toEqual([]);
    }
    const generatedIds = new Set(generated.map((record) => record.record_id));
    expect(remediationRows.every((row) => generatedIds.has(row.relation_id))).toBe(true);
  });

  it("reconciles the exhaustive 113-edge review to 91 exact, 21 repaired, and one non-lane correction", () => {
    const evidenceReview = readJsonl<EvidenceReviewRow>(EVIDENCE_REVIEW_PATH);
    const journal = readJsonl<MtaSubmissionEntry>(JOURNAL_PATH);
    const generatedById = new Map(entriesToRecords(journal).map((record) => [record.record_id, record]));
    const summary = readJson<{
      prior_evidence_audit_relation_count: number;
      prior_exact_current_evidence_relation_count: number;
      repaired_adjacent_cocitation_relation_count: number;
      reclassified_non_lane_treatment_count: number;
      exact_evidence_relation_count_after_review: number;
      evidence_review_row_count: number;
    }>("summary.json");

    expect(summary).toMatchObject({
      prior_evidence_audit_relation_count: 113,
      prior_exact_current_evidence_relation_count: 91,
      repaired_adjacent_cocitation_relation_count: 21,
      reclassified_non_lane_treatment_count: 1,
      exact_evidence_relation_count_after_review: 112,
      evidence_review_row_count: 113,
    });
    expect(evidenceReview).toHaveLength(113);
    expect(evidenceReview.filter((row) => row.verdict === "exact_current_evidence")).toHaveLength(91);
    expect(evidenceReview.filter((row) => row.verdict === "repaired_adjacent_cocitation")).toHaveLength(21);
    const reclassified = evidenceReview.filter((row) => row.verdict === "reclassified_non_lane");
    expect(reclassified).toEqual([expect.objectContaining({
      treatment_id: "treatment_tremont-morris-grand-conc",
      corridor_id: null,
      relation_id: null,
      correction_id: "relationship-integrity-tremont-morris-grand-conc-bus-stop-reclassification-20260715",
    })]);

    const supported = evidenceReview.filter((row) => row.verdict !== "reclassified_non_lane");
    expect(supported).toHaveLength(journal.length);
    for (const row of supported) {
      expect(row.relation_id).not.toBeNull();
      expect(row.facility_evidence_ids.length).toBeGreaterThan(0);
      expect(row.treatment_assertion_evidence_ids.length).toBeGreaterThan(0);
      if (row.verdict === "repaired_adjacent_cocitation") {
        expect(row.reviewed_additional_evidence_ids.length).toBeGreaterThan(0);
      }
      const relation = generatedById.get(row.relation_id!);
      expect(relation).toBeDefined();
      const relationEvidenceIds = new Set(relation!.evidence_refs.map((ref) => ref.evidence_id));
      for (const evidenceId of [
        ...row.facility_evidence_ids,
        ...row.treatment_assertion_evidence_ids,
        ...row.reviewed_additional_evidence_ids,
      ]) expect(relationEvidenceIds.has(evidenceId)).toBe(true);
    }
    expect(journal.some((entry) =>
      entry.tool_args.payload.subject_id === "treatment_tremont-morris-grand-conc")).toBe(false);

    const correction = readJsonl<{
      correction_id: string;
      record_id: string;
      guards: { payload: Record<string, unknown> };
      patch: { set: Record<string, unknown> };
    }>(SEMANTIC_CORRECTIONS_PATH).find((entry) =>
      entry.correction_id === "relationship-integrity-tremont-morris-grand-conc-bus-stop-reclassification-20260715");
    expect(correction).toMatchObject({
      record_id: "treatment_tremont-morris-grand-conc",
      guards: { payload: { treatment_kind: "bus_lane", treatment_family: "bus_lane" } },
      patch: { set: { treatment_kind: "dedicated bus-stop area", treatment_family: "bus_stop_or_boarding" } },
    });
  });

  it("hashes every versioned artifact and the external remediation journal", () => {
    const manifest = readJson<{
      contract_id: string;
      artifacts: Array<{ path: string; sha256: string; bytes: number }>;
      remediation_journal: { path: string; sha256: string; bytes: number };
    }>("manifest.json");
    expect(manifest.contract_id).toBe(BUS_LANE_SCOPE_CONTRACT_ID);
    for (const artifact of manifest.artifacts) {
      const bytes = readFileSync(join(OUTPUT_DIR, artifact.path));
      expect(sha256(bytes)).toBe(artifact.sha256);
      expect(bytes.byteLength).toBe(artifact.bytes);
    }
    const journalBytes = readFileSync(join(repoRoot, manifest.remediation_journal.path));
    expect(sha256(journalBytes)).toBe(manifest.remediation_journal.sha256);
    expect(journalBytes.byteLength).toBe(manifest.remediation_journal.bytes);
  });
});
