import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  buildForecastRealizationFrontier,
  type ForecastRealizationTargetList,
} from "@mta-wiki/pipeline/quality/forecast-realization-frontier";
import {
  buildForecastRealizationReviewedOverlay,
  forecastCandidateSetFingerprint,
  parseForecastRealizationReviewDecision,
  type ForecastRealizationReviewDecision,
} from "@mta-wiki/pipeline/quality/forecast-realization-review";
import type { OperationalCoverageQueueRow } from "@mta-wiki/pipeline/quality/operational-coverage";
import { describe, expect, it } from "bun:test";

function record(recordId: string, recordKind: MtaCanonicalRecord["record_kind"], payload: JsonObject): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: recordKind,
    source_id: `source_${recordId}`,
    local_observation_id: recordId,
    display_name: recordId,
    payload,
    evidence_refs: [{
      source_id: `source_${recordId}`,
      evidence_id: `source_${recordId}#p001_c0001`,
      block_id: "p001_c0001",
      text_sha256: `sha256:${recordId.padEnd(64, "0").slice(0, 64)}`,
    }],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-22T00:00:00.000Z",
  };
}

function fixture(): { targetList: ForecastRealizationTargetList; records: MtaCanonicalRecord[] } {
  const forecast = record("event_forecast", "event", {
    event_family: "implementation",
    lifecycle_phase: "planned",
    date_normalized: "2025-06",
    date_precision: "month",
  });
  const realized = record("event_realized", "event", {
    event_family: "implementation",
    lifecycle_phase: "installed",
    date_normalized: "2025-06-15",
    date_precision: "day",
  });
  const forecastRelation = record("relation_forecast", "relation", {
    relation_kind: "has_timeline_event",
    subject_id: "project_shared",
    object_id: forecast.record_id,
  });
  const realizedRelation = record("relation_realized", "relation", {
    relation_kind: "has_timeline_event",
    subject_id: "project_shared",
    object_id: realized.record_id,
  });
  const records = [forecast, realized, forecastRelation, realizedRelation];
  const queue: OperationalCoverageQueueRow = {
    schema_version: 1,
    gap_id: "operational-coverage:test",
    anchor_ids: [],
    event_record_id: forecast.record_id,
    event_display_name: forecast.display_name,
    event_family: "implementation",
    resolved_occurrence_ids: [],
    dimension: "delivered_status",
    source_ids: [forecast.source_id],
    required_search_source_ids: [forecast.source_id],
    context_record_ids: [forecast.record_id],
    candidate_record_ids: [],
    candidate_date_intervals: [],
    route_record_ids: [],
    gtfs_route_ids: [],
    treatment_record_ids: [],
    treatment_families: [],
    priority: true,
    priority_basis: ["date_window"],
    priority_families: ["busway"],
    verdict: "not_applicable",
    verdict_basis: "review:test",
    decision_ids: ["test-decision"],
    proposal_ids: [],
    evidence_refs: [],
    search_receipt_ids: [],
    updated_at: "2026-07-22T00:00:00.000Z",
    status: "terminal",
  };
  return {
    records,
    targetList: buildForecastRealizationFrontier({
      records,
      priorityQueue: [queue],
      asOf: "2026-07-22",
      graceDays: 90,
    }),
  };
}

function exactDecision(targetList: ForecastRealizationTargetList): ForecastRealizationReviewDecision {
  const target = targetList.targets[0]!;
  return parseForecastRealizationReviewDecision({
    schema_version: 1,
    overlay_id: "forecast-realization-reviewed-overlay-v1",
    batch_id: "test-batch",
    decision_id: "forecast-review:test",
    reviewed_at: "2026-07-22",
    reviewer: "test-reviewer",
    frontier_artifact_fingerprint: targetList.artifact_fingerprint,
    target_id: target.target_id,
    forecast_event_record_id: target.forecast_event_record_id,
    target_basis_fingerprint: target.basis_fingerprint,
    candidate_set_fingerprint: forecastCandidateSetFingerprint(target),
    disposition: "exact_realization",
    candidate_reviews: [{
      candidate_event_record_ids: ["event_realized"],
      disposition: "exact_realization",
      rationale: "Exact subject, treatment, and delivery evidence.",
    }],
    bound_realized_event_id: "event_realized",
    evidence_bindings: [{
      record_id: "event_realized",
      source_id: "source_event_realized",
      evidence_id: "source_event_realized#p001_c0001",
      text_sha256: "sha256:event_realized00000000000000000000000000000000000000000000000000",
      role: "realized_event",
    }],
    rationale: "The exact candidate realizes the forecast.",
    authorizes_study: false,
    authorizes_cross_product: false,
  });
}

describe("forecast realization reviewed overlay", () => {
  it("binds an exact candidate without granting study or cross-product authority", () => {
    const { targetList, records } = fixture();
    const overlay = buildForecastRealizationReviewedOverlay({
      targetList,
      records,
      decisions: [exactDecision(targetList)],
    });
    expect(overlay.authorizes_study).toBeFalse();
    expect(overlay.authorizes_cross_product).toBeFalse();
    expect(overlay.summary).toMatchObject({
      candidate_bearing_target_denominator: 1,
      reviewed_target_count: 1,
      reviewed_candidate_pair_count: 1,
      missing_target_ids: [],
      counts_by_disposition: { exact_realization: 1 },
    });
  });

  it("fails closed on stale target/candidate pins and grouped affirmative candidates", () => {
    const { targetList, records } = fixture();
    const stale = { ...exactDecision(targetList), candidate_set_fingerprint: "a".repeat(64) };
    expect(() => buildForecastRealizationReviewedOverlay({ targetList, records, decisions: [stale] }))
      .toThrow("candidate_set_fingerprint is stale");

    const grouped = exactDecision(targetList);
    grouped.candidate_reviews[0]!.candidate_event_record_ids.push("event_extra");
    expect(() => buildForecastRealizationReviewedOverlay({ targetList, records, decisions: [grouped] }))
      .toThrow("candidate_reviews must cover the exact candidate denominator");
  });

  it("rejects any authority grant in reviewed input", () => {
    const { targetList } = fixture();
    const decision = exactDecision(targetList) as unknown as Record<string, unknown>;
    decision.authorizes_study = true;
    expect(() => parseForecastRealizationReviewDecision(decision)).toThrow("authorizes_study=false");
  });
});
