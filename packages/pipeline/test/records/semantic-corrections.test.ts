import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  readSemanticCorrectionsWithIssues,
  validateSemanticCorrections,
  withSemanticCorrections,
  type SemanticCorrectionEntry,
} from "@mta-wiki/pipeline/records/semantic-corrections";
import { validateSemanticInvariantsForRecords } from "@mta-wiki/pipeline/validate";

function rec(id: string, kind: MtaCanonicalRecord["record_kind"], payload: JsonObject, extra: Partial<MtaCanonicalRecord> = {}): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: extra.source_id ?? "src",
    source_ids: extra.source_ids ?? [extra.source_id ?? "src"],
    local_observation_id: id,
    local_observation_ids: [id],
    display_name: id,
    payload,
    evidence_refs: extra.evidence_refs ?? [],
    submission_ids: ["sub"],
    truth_status: extra.truth_status ?? "source_stated",
    review_state: extra.review_state ?? "unreviewed",
    generated_at: "2026-07-04T00:00:00.000Z",
    ...extra,
  };
}

function correction(entry: Partial<SemanticCorrectionEntry> & Pick<SemanticCorrectionEntry, "correction_id" | "op" | "record_id">): SemanticCorrectionEntry {
  return {
    guards: { payload: {} },
    patch: {},
    cascade: [],
    reason: "fixture",
    source_decision: "test",
    reviewed_at: "2026-07-04T00:00:00Z",
    provenance: "deterministic_rule",
    ...entry,
  };
}

describe("semantic corrections", () => {
  it("patches payload fields when guards match", () => {
    const result = withSemanticCorrections(
      [rec("metric_speed", "metric_claim", { value: 10, unit: "mph" })],
      [correction({ correction_id: "semqa-000001", op: "patch_payload", record_id: "metric_speed", guards: { payload: { value: 10 } }, patch: { set: { value: 13 } } })],
    );
    expect(result.summary.applied).toBe(1);
    expect(result.records[0]!.payload.value).toBe(13);
  });

  it("replaces relation endpoints only when the target exists", () => {
    const records = [
      rec("entity_a", "entity", {}),
      rec("entity_b", "entity", {}),
      rec("relation_ab", "relation", { relation_kind: "related_to", subject_id: "entity_a", object_id: "entity_b" }),
    ];
    const result = withSemanticCorrections(records, [
      correction({
        correction_id: "semqa-000001",
        op: "replace_endpoint",
        record_id: "relation_ab",
        guards: { payload: { subject_id: "entity_a" } },
        patch: { field: "subject_id", to: "entity_b" },
      }),
    ]);
    expect(result.records.find((record) => record.record_id === "relation_ab")!.payload.subject_id).toBe("entity_b");

    const skipped = withSemanticCorrections(records, [
      correction({
        correction_id: "semqa-000002",
        op: "replace_endpoint",
        record_id: "relation_ab",
        guards: { payload: { subject_id: "entity_a" } },
        patch: { field: "subject_id", to: "entity_missing" },
      }),
    ]);
    expect(skipped.summary.skipped).toBe(1);
    expect(skipped.issues[0]!.code).toBe("semantic_correction_skipped");
  });

  it("replaces evidence refs", () => {
    const result = withSemanticCorrections([rec("claim_a", "claim", { claim: "A" })], [
      correction({
        correction_id: "semqa-000001",
        op: "recite_evidence",
        record_id: "claim_a",
        patch: { evidence_refs: [{ source_id: "src", block_id: "p001_c0001" }] },
      }),
    ]);
    expect(result.records[0]!.evidence_refs).toEqual([{ source_id: "src", block_id: "p001_c0001" }]);
  });

  it("sets review_state and optional truth_status", () => {
    const result = withSemanticCorrections([rec("event_a", "event", { lifecycle_phase: "completed" })], [
      correction({
        correction_id: "semqa-000001",
        op: "set_review_state",
        record_id: "event_a",
        guards: { payload: { lifecycle_phase: "completed" } },
        patch: { review_state: "quarantined", truth_status: "needs_review" },
      }),
    ]);
    expect(result.records[0]!.review_state).toBe("quarantined");
    expect(result.records[0]!.truth_status).toBe("needs_review");
  });

  it("retracts records and requires explicit cascade coverage", () => {
    const records = [
      rec("entity_a", "entity", {}),
      rec("entity_b", "entity", {}),
      rec("relation_ab", "relation", { relation_kind: "related_to", subject_id: "entity_a", object_id: "entity_b" }),
    ];
    expect(() =>
      withSemanticCorrections(records, [correction({ correction_id: "semqa-000001", op: "retract_record", record_id: "entity_a" })]),
    ).toThrow("relation_ab");

    const result = withSemanticCorrections(records, [
      correction({ correction_id: "semqa-000002", op: "retract_record", record_id: "entity_a", cascade: ["relation_ab"] }),
    ]);
    expect(result.records.map((record) => record.record_id).sort()).toEqual(["entity_b"]);
  });

  it("supersedes a record and rewrites relation endpoints", () => {
    const records = [
      rec("entity_old", "entity", {}),
      rec("entity_new", "entity", {}),
      rec("relation_old", "relation", {
        relation_kind: "related_to",
        subject_id: "entity_old",
        subject_local_observation_id: "entity_old",
        object_id: "entity_new",
        object_local_observation_id: "entity_new",
      }),
    ];
    const result = withSemanticCorrections(records, [
      correction({ correction_id: "semqa-000001", op: "supersede_record", record_id: "entity_old", patch: { survivor_record_id: "entity_new" } }),
    ]);
    expect(result.records.some((record) => record.record_id === "entity_old")).toBe(false);
    const relation = result.records.find((record) => record.record_id === "relation_old")!;
    expect(relation.payload.subject_id).toBe("entity_new");
    expect(relation.payload.subject_local_observation_id).toBe("entity_new");
    expect(relation.payload.object_local_observation_id).toBe("entity_new");
  });

  it("folds cross-source treatment provenance into the survivor without replacing its semantics", () => {
    const sharedEvidence = { source_id: "source_shared", block_id: "p001_c0001", source_quote: "Shared evidence" };
    const survivor = rec(
      "treatment_survivor",
      "treatment_component",
      { treatment_kind: "service_pattern", description: "Survivor description" },
      {
        source_id: "source_retrospective",
        source_ids: ["source_retrospective"],
        local_observation_id: "treatment_retrospective",
        local_observation_ids: ["treatment_retrospective"],
        display_name: "Weekday express-bus trip additions",
        evidence_refs: [
          { source_id: "source_retrospective", block_id: "p002_c0001", source_quote: "Trips were added" },
          sharedEvidence,
        ],
        submission_ids: ["submission_retrospective"],
        generated_at: "2026-07-12T09:00:00.000Z",
      },
    );
    const duplicate = rec(
      "treatment_duplicate",
      "treatment_component",
      { treatment_kind: "service_pattern", description: "Duplicate description" },
      {
        source_id: "source_planning",
        source_ids: ["source_planning"],
        local_observation_id: "treatment_planning",
        local_observation_ids: ["treatment_planning"],
        display_name: "Planned weekday express-bus trip additions",
        evidence_refs: [
          { source_id: "source_planning", block_id: "p003_c0004", source_quote: "Trips will be added" },
          sharedEvidence,
        ],
        submission_ids: ["submission_planning"],
        generated_at: "2026-07-13T10:30:00.000Z",
      },
    );
    const relation = rec("relation_project_treatment", "relation", {
      relation_kind: "has_treatment",
      subject_id: "project_express_bus",
      subject_local_observation_id: "project_express_bus",
      object_id: "treatment_duplicate",
      object_local_observation_id: "treatment_planning",
    });
    const project = rec("project_express_bus", "project", {});

    const result = withSemanticCorrections([survivor, duplicate, project, relation], [
      correction({
        correction_id: "semqa-000001",
        op: "supersede_record",
        record_id: "treatment_duplicate",
        patch: { survivor_record_id: "treatment_survivor" },
      }),
    ]);

    expect(result.records.some((record) => record.record_id === "treatment_duplicate")).toBe(false);
    const folded = result.records.find((record) => record.record_id === "treatment_survivor")!;
    expect(folded.source_id).toBe("source_retrospective");
    expect(folded.local_observation_id).toBe("treatment_retrospective");
    expect(folded.display_name).toBe("Weekday express-bus trip additions");
    expect(folded.payload).toEqual({ treatment_kind: "service_pattern", description: "Survivor description" });
    expect(folded.source_ids).toEqual(["source_planning", "source_retrospective"]);
    expect(folded.local_observation_ids).toEqual(["treatment_planning", "treatment_retrospective"]);
    expect(folded.submission_ids).toEqual(["submission_planning", "submission_retrospective"]);
    expect(folded.evidence_refs).toEqual([
      { source_id: "source_retrospective", block_id: "p002_c0001", source_quote: "Trips were added" },
      sharedEvidence,
      { source_id: "source_planning", block_id: "p003_c0004", source_quote: "Trips will be added" },
    ]);
    expect(folded.generated_at).toBe("2026-07-13T10:30:00.000Z");

    const rewritten = result.records.find((record) => record.record_id === "relation_project_treatment")!;
    expect(rewritten.payload.object_id).toBe("treatment_survivor");
    expect(rewritten.payload.object_local_observation_id).toBe("treatment_retrospective");
  });

  it("skips stale guards and is idempotent for guarded corrections", () => {
    const records = [
      rec("metric_a", "metric_claim", { value: 10 }),
      rec("entity_a", "entity", {}),
      rec("entity_b", "entity", {}),
      rec("relation_ab", "relation", { relation_kind: "related_to", subject_id: "entity_a", object_id: "entity_b" }),
    ];
    const corrections = [
      correction({ correction_id: "semqa-000001", op: "patch_payload", record_id: "metric_a", guards: { payload: { value: 10 } }, patch: { set: { value: 11 } } }),
      correction({
        correction_id: "semqa-000002",
        op: "replace_endpoint",
        record_id: "relation_ab",
        guards: { payload: { subject_id: "entity_a" } },
        patch: { field: "subject_id", to: "entity_b" },
      }),
    ];
    const once = withSemanticCorrections(records, corrections);
    const twice = withSemanticCorrections(once.records, corrections);
    expect(twice.summary.applied).toBe(0);
    expect(twice.summary.skipped).toBe(2);
    expect(twice.records).toEqual(once.records);
  });

  it("validates malformed lines, duplicate ids, unknown ops, and missing records", () => {
    const dir = mkdtempSync(join(tmpdir(), "mta-semantic-corrections-"));
    const path = join(dir, "corrections.jsonl");
    writeFileSync(
      path,
      [
        JSON.stringify(correction({ correction_id: "semqa-000001", op: "patch_payload", record_id: "metric_a", patch: { set: { value: 2 } } })),
        JSON.stringify(correction({ correction_id: "semqa-000001", op: "patch_payload", record_id: "metric_missing", patch: { set: { value: 3 } } })),
        JSON.stringify({ ...correction({ correction_id: "semqa-000002", op: "patch_payload", record_id: "metric_a" }), op: "bogus" }),
        "{not json}",
      ].join("\n"),
    );

    expect(readSemanticCorrectionsWithIssues(path).issues.some((issue) => issue.message.includes("valid JSON"))).toBe(true);
    const issues = validateSemanticCorrections({ path, records: [rec("metric_a", "metric_claim", { value: 1 })] });
    expect(issues.map((issue) => issue.code)).toContain("invalid_semantic_correction");
    expect(issues.some((issue) => issue.message.includes("duplicate correction_id"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("does not exist before semantic corrections"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("unknown semantic correction op"))).toBe(true);
  });

  it("flags unquarantined semantic invariant defects", () => {
    const issues = validateSemanticInvariantsForRecords([
      rec("relation_loop", "relation", { relation_kind: "same_as", subject_id: "entity_a", object_id: "entity_a" }),
      rec("relation_quarantined", "relation", { relation_kind: "same_as", subject_id: "entity_b", object_id: "entity_b" }, { review_state: "quarantined" }),
      rec("event_bad", "event", { event_kind: "completion_target", lifecycle_phase: "completed" }),
      rec("event_quarantined", "event", { event_kind: "completion_target", lifecycle_phase: "completed" }, { review_state: "quarantined" }),
    ]);
    expect(issues.map((issue) => issue.code).sort()).toEqual(["event_completion_target_completed", "relation_self_loop"]);
  });
});
