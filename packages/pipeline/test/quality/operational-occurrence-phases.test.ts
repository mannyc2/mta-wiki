import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";
import { buildOperationalOccurrencePhaseReview } from "@mta-wiki/pipeline/quality/operational-occurrence-phases";

type OccurrenceInput = Parameters<typeof buildOperationalOccurrencePhaseReview>[0]["occurrences"][number];

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
        source_path: "raw/sources/fixture_source/blocks.jsonl",
        block_id: recordId,
        text_sha256: "a".repeat(64),
        text_source: "raw_text",
      }]
      : [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-16T06:00:00.000Z",
  };
}

function event(recordId: string, withEvidence = true): MtaCanonicalRecord {
  return record(recordId, "event", {
    date_normalized: "2025-01-01",
    date_precision: "day",
    lifecycle_phase: "delivered",
  }, withEvidence);
}

function temporalRelation(recordId: string, subjectId: string, objectId: string): MtaCanonicalRecord {
  return record(recordId, "relation", {
    subject_id: subjectId,
    object_id: objectId,
    relation_kind: "precedes_event",
    relation_family: "timeline_context",
    assertion_status: "delivered",
  });
}

function occurrence(input: {
  occurrenceId: string;
  phaseIds: string[];
  relationIds?: string[] | undefined;
}): OccurrenceInput {
  const relationIds = input.relationIds ?? [];
  return {
    occurrence_id: input.occurrenceId,
    occurrence_review_decision_id: `occurrence-review:${input.occurrenceId}`,
    study_projection_eligible: true,
    phase_record_ids: input.phaseIds,
    phase_relation_record_ids: relationIds,
    phase_relation_evidence_bindings: relationIds.map((relationId) => ({
      role: "phase_relation",
      record_id: relationId,
      source_id: "fixture_source",
      evidence_id: `fixture_source#${relationId}`,
    })),
    phase_relation_disposition: input.phaseIds.length === 1 ? "single_phase" : "related_phases",
    provenance: {
      anchor_review_decision_ids: [],
      event_record_ids: [...input.phaseIds],
      relation_record_ids: [...relationIds],
      route_record_ids: [],
      treatment_record_ids: [],
    },
  };
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8").split(/\r?\n/u).flatMap((line) =>
    line.trim() ? [JSON.parse(line) as T] : []);
}

describe("operational occurrence phase review v1", () => {
  it("reviews one exact event phase without implying that the parent project has no other phases", () => {
    const phase = event("event_phase");
    const external = event("event_external");
    const candidate = temporalRelation("relation_external_phase", phase.record_id, external.record_id);
    const build = buildOperationalOccurrencePhaseReview({
      occurrences: [occurrence({ occurrenceId: "occurrence:single", phaseIds: [phase.record_id] })],
      records: [phase, external, candidate],
    });

    expect(build.findings).toEqual([]);
    expect(build.decisions[0]).toMatchObject({
      review_state: "reviewed",
      primary_disposition: "single_observed_phase_no_related_phase_asserted",
      phase_record_ids: ["event_phase"],
      phase_relation_record_ids: [],
      no_external_phase_inference: true,
    });
    expect(build.decisions[0]?.disposition_statement).toContain("does not claim that the parent project has no other phases");
    expect(build.candidates).toHaveLength(1);
    expect(build.candidates[0]).toMatchObject({
      relation_record_id: "relation_external_phase",
      endpoint_membership: "one_in_occurrence",
      allowlisted_temporal_semantics: true,
      projected_by_occurrence_review: false,
      primary_disposition: "not_projected_external_event_not_selected",
    });
    expect(build.summary.hard_mode_ready).toBe(true);
  });

  it("accepts multiple phases only with an explicitly selected, allowlisted, exact-evidence relation", () => {
    const earlier = event("event_earlier");
    const later = event("event_later");
    const relation = temporalRelation("relation_phase_sequence", earlier.record_id, later.record_id);
    const build = buildOperationalOccurrencePhaseReview({
      occurrences: [occurrence({
        occurrenceId: "occurrence:related",
        phaseIds: [earlier.record_id, later.record_id],
        relationIds: [relation.record_id],
      })],
      records: [earlier, later, relation],
    });

    expect(build.findings).toEqual([]);
    expect(build.decisions[0]).toMatchObject({
      review_state: "reviewed",
      primary_disposition: "evidence_bound_related_phases",
      phase_relation_record_ids: ["relation_phase_sequence"],
    });
    expect(build.candidates[0]?.primary_disposition).toBe("projected_reviewed_phase_relation");
    expect(build.summary.projected_phase_relation_count).toBe(1);
    expect(build.summary.hard_mode_ready).toBe(true);
  });

  it("fails closed on an allowlisted same-occurrence temporal relation omitted by review", () => {
    const earlier = event("event_earlier");
    const later = event("event_later");
    const relation = temporalRelation("relation_unselected", earlier.record_id, later.record_id);
    const input = occurrence({
      occurrenceId: "occurrence:unselected",
      phaseIds: [earlier.record_id, later.record_id],
    });
    const build = buildOperationalOccurrencePhaseReview({
      occurrences: [input],
      records: [earlier, later, relation],
    });

    expect(build.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "OOPHASE_PHASE_RELATION_MISSING_FOR_RELATED_PHASES",
      "OOPHASE_UNPROJECTED_SAME_OCCURRENCE_TEMPORAL_RELATION",
    ]));
    expect(build.decisions[0]?.primary_disposition).toBe("review_required");
    expect(build.summary.hard_mode_ready).toBe(false);
  });

  it("fails closed when the canonical phase event lacks exact evidence", () => {
    const phase = event("event_no_evidence", false);
    const build = buildOperationalOccurrencePhaseReview({
      occurrences: [occurrence({ occurrenceId: "occurrence:no-evidence", phaseIds: [phase.record_id] })],
      records: [phase],
    });

    expect(build.findings.map((finding) => finding.code)).toContain("OOPHASE_PHASE_EVENT_EVIDENCE_MISSING");
    expect(build.decisions[0]?.review_state).toBe("review_required");
    expect(build.summary.exact_evidence_complete).toBe(false);
  });

  it("does not mistake two evidence roles on the same exact block for missing evidence", () => {
    const phase = event("event_two_roles");
    const first = phase.evidence_refs[0]!;
    phase.evidence_refs.push({ ...first, role: "lifecycle_status" });
    phase.evidence_refs[0] = { ...first, role: "event_date" };
    const build = buildOperationalOccurrencePhaseReview({
      occurrences: [occurrence({ occurrenceId: "occurrence:two-roles", phaseIds: [phase.record_id] })],
      records: [phase],
    });

    expect(build.findings).toEqual([]);
    expect(build.decisions[0]?.review_state).toBe("reviewed");
    expect(build.decisions[0]?.phase_event_evidence_refs).toHaveLength(1);
    expect(build.summary.exact_evidence_complete).toBe(true);
  });

  it("pins the complete active 131-occurrence corpus review and every generated byte", () => {
    const contractDir = join(repoRoot, "data", "contracts", "operational-occurrence-phases", "v1");
    const qualityDir = join(repoRoot, "data", "quality", "relationship-integrity", "operational-occurrence-phases");
    const summary = JSON.parse(readFileSync(join(qualityDir, "summary.json"), "utf8")) as Record<string, unknown>;
    const manifest = JSON.parse(readFileSync(join(qualityDir, "manifest.json"), "utf8")) as {
      reproduction_command: string;
      route_anchor_release: {
        release_id: string;
        route_anchors: { path: string };
        operational_occurrences: { path: string };
      };
      outputs: Record<string, { path: string; bytes: number; sha256: string; row_count?: number }>;
    };
    const ledger = readJsonl<{
      occurrence_id: string;
      review_state: string;
      primary_disposition: string;
      phase_record_ids: string[];
      phase_event_evidence_refs: Array<{ source_id: string; evidence_id?: string }>;
      no_external_phase_inference: boolean;
    }>(join(contractDir, "review-ledger.jsonl"));
    const candidates = readJsonl<unknown>(join(qualityDir, "event-event-candidates.jsonl"));
    const findings = readJsonl<unknown>(join(qualityDir, "findings.jsonl"));

    expect(summary).toMatchObject({
      schema_version: 1,
      contract_id: "operational-occurrence-phase-review-v1",
      ledger_id: "operational-occurrence-phase-review-ledger-v1",
      release_id: "v1-rc26",
      occurrence_count: 131,
      eligible_occurrence_count: 130,
      ineligible_occurrence_count: 1,
      phase_identity_membership_count: 132,
      unique_phase_event_count: 132,
      reviewed_occurrence_count: 131,
      single_observed_phase_count: 130,
      related_phase_count: 1,
      projected_phase_relation_count: 1,
      unresolved_phase_count: 0,
      missing_evidence_count: 0,
      ambiguous_phase_count: 0,
      review_complete: true,
      violation_count: 0,
      hard_mode_ready: true,
    });
    expect(ledger).toHaveLength(131);
    expect(new Set(ledger.map((row) => row.occurrence_id)).size).toBe(131);
    expect(ledger.every((row) =>
      row.review_state === "reviewed" &&
      row.phase_event_evidence_refs.length > 0 &&
      row.phase_event_evidence_refs.every((ref) => Boolean(ref.source_id && ref.evidence_id)) &&
      row.no_external_phase_inference)).toBe(true);
    expect(ledger.filter((row) =>
      row.primary_disposition === "single_observed_phase_no_related_phase_asserted" &&
      row.phase_record_ids.length === 1)).toHaveLength(130);
    expect(ledger.filter((row) =>
      row.primary_disposition === "evidence_bound_related_phases" &&
      row.phase_record_ids.length === 2)).toHaveLength(1);
    expect(findings).toEqual([]);
    expect(candidates).toHaveLength(summary.checked_event_event_candidate_count as number);
    expect(manifest).toMatchObject({
      reproduction_command:
        "bun scripts/generate-operational-occurrence-phase-review-v1.ts --check --route-anchor-release-dir data/exports/releases/v1-rc26",
      route_anchor_release: {
        release_id: "v1-rc26",
        route_anchors: { path: "data/exports/releases/v1-rc26/route_anchors.jsonl" },
        operational_occurrences: {
          path: "data/exports/releases/v1-rc26/operational_occurrences.jsonl",
        },
      },
    });

    for (const [relativePath, pin] of Object.entries(manifest.outputs)) {
      const path = join(repoRoot, relativePath);
      const bytes = readFileSync(path);
      expect(bytes.length).toBe(pin.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(pin.sha256);
      if (pin.row_count !== undefined) {
        expect(readJsonl<unknown>(path)).toHaveLength(pin.row_count);
      }
    }
  });
});
