import { describe, expect, it } from "bun:test";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";
import { buildForecastRealizationArtifacts } from "@mta-wiki/pipeline/quality/forecast-realization-artifacts";
import {
  buildForecastRealizationFrontier,
  type BuildForecastRealizationFrontierInput,
} from "@mta-wiki/pipeline/quality/forecast-realization-frontier";
import type {
  OperationalCoverageQueueRow,
  OperationalCoverageVerdict,
} from "@mta-wiki/pipeline/quality/operational-coverage";

function record(
  recordId: string,
  recordKind: MtaCanonicalRecord["record_kind"],
  payload: JsonObject = {},
): MtaCanonicalRecord {
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
      source_quote: recordId,
    }],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-13T00:00:00.000Z",
  };
}

function event(
  recordId: string,
  lifecyclePhase: string,
  dateNormalized: string | null,
  datePrecision: string,
  eventFamily: "implementation" | "launch" = "implementation",
): MtaCanonicalRecord {
  return record(recordId, "event", {
    event_family: eventFamily,
    lifecycle_phase: lifecyclePhase,
    date_text: dateNormalized ?? "date unresolved",
    ...(dateNormalized === null ? {} : { date_normalized: dateNormalized }),
    date_precision: datePrecision,
  });
}

function timelineRelation(recordId: string, subjectId: string, eventId: string): MtaCanonicalRecord {
  return record(recordId, "relation", {
    relation_kind: "has_timeline_event",
    subject_id: subjectId,
    object_id: eventId,
    assertion_status: eventId.includes("forecast") ? "planned" : "delivered",
  });
}

function queueRow(
  eventRecordId: string,
  gapId: string,
  status: OperationalCoverageQueueRow["status"] = "terminal",
  verdict: OperationalCoverageVerdict = "not_applicable",
  priority = true,
): OperationalCoverageQueueRow {
  return {
    schema_version: 1,
    gap_id: gapId,
    anchor_ids: [],
    event_record_id: eventRecordId,
    event_display_name: eventRecordId,
    event_family: "implementation",
    resolved_occurrence_ids: [],
    dimension: "delivered_status",
    source_ids: [`source_${eventRecordId}`],
    required_search_source_ids: [`source_${eventRecordId}`],
    context_record_ids: [eventRecordId],
    candidate_record_ids: [],
    candidate_date_intervals: [],
    route_record_ids: [],
    gtfs_route_ids: [],
    treatment_record_ids: [],
    treatment_families: [],
    priority,
    priority_basis: priority ? ["date_window"] : [],
    priority_families: priority ? ["busway"] : [],
    verdict,
    verdict_basis: status === "open" ? null : "review:test",
    decision_ids: status === "open" ? [] : ["test-decision"],
    proposal_ids: [],
    evidence_refs: [],
    search_receipt_ids: [],
    updated_at: status === "open" ? null : "2026-07-13T00:00:00.000Z",
    status,
  };
}

function fixture(): BuildForecastRealizationFrontierInput {
  const forecast = event("event_forecast", "planned", "2025-06", "month");
  const realized = event("event_realized", "installed", "2025-06-15", "day");
  const otherRealized = event("event_other_realized", "launched", "2025-06-20", "day", "launch");
  const excluded = event("event_excluded_forecast", "planned", "2025-07", "month");
  return {
    records: [
      forecast,
      realized,
      otherRealized,
      excluded,
      timelineRelation("relation_forecast", "project_shared", forecast.record_id),
      timelineRelation("relation_realized", "project_shared", realized.record_id),
      timelineRelation("relation_other_realized", "project_other", otherRealized.record_id),
    ],
    priorityQueue: [queueRow(forecast.record_id, "operational-coverage:forecast")],
    asOf: "2025-10-01",
    graceDays: 30,
    corpusFingerprint: "a".repeat(64),
    operationalCoverageInputFingerprint: "b".repeat(64),
  };
}

describe("forecast-realization acquisition frontier", () => {
  it("keeps terminal operational diagnostics separate and treats same-subject realization as review-only", () => {
    const terminal = buildForecastRealizationFrontier(fixture());
    expect(terminal.summary).toMatchObject({
      planned_operational_event_count: 2,
      acquisition_target_count: 1,
      excluded_nonpriority_planned_event_count: 1,
      operational_diagnostic_row_count: 1,
      operational_terminal_diagnostic_row_count: 1,
      targets_with_realized_candidates_count: 1,
    });
    const target = terminal.targets[0]!;
    expect(target).toMatchObject({
      forecast_event_record_id: "event_forecast",
      due_for_acquisition: true,
      action: "review_realized_candidate",
      frontier_state: "open",
      operational_diagnostic_state: "all_terminal",
      subject_record_ids: ["project_shared"],
    });
    expect(target.realized_candidates.map((candidate) => candidate.event_record_id)).toEqual(["event_realized"]);
    expect(target.realized_candidates[0]?.shared_subject_record_ids).toEqual(["project_shared"]);
    expect(terminal.targets.some((row) => row.forecast_event_record_id === "event_excluded_forecast")).toBe(false);

    const openInput = fixture();
    openInput.priorityQueue = [
      queueRow("event_forecast", "operational-coverage:forecast", "open", "unreviewed"),
    ];
    const open = buildForecastRealizationFrontier(openInput);
    expect(open.targets[0]?.action).toBe(target.action);
    expect(open.targets[0]?.frontier_state).toBe("open");
    expect(open.targets[0]?.basis_fingerprint).toBe(target.basis_fingerprint);
    expect(open.targets[0]?.operational_diagnostic_state).toBe("all_open");
  });

  it("derives deadlines only from the explicit as-of date, forecast precision, and grace period", () => {
    const forecast = event("event_forecast_boundary", "planned", "2025-06-01", "day");
    const base = {
      records: [forecast],
      priorityQueue: [queueRow(forecast.record_id, "operational-coverage:boundary")],
      graceDays: 30,
    };
    const onDeadline = buildForecastRealizationFrontier({ ...base, asOf: "2025-07-01" });
    expect(onDeadline.targets[0]?.forecast_date).toMatchObject({
      interval: { start: "2025-06-01", end: "2025-06-01" },
      grace_deadline: "2025-07-01",
    });
    expect(onDeadline.targets[0]?.due_for_acquisition).toBe(false);
    expect(onDeadline.targets[0]?.action).toBe("monitor");

    const afterDeadline = buildForecastRealizationFrontier({ ...base, asOf: "2025-07-02" });
    expect(afterDeadline.targets[0]?.due_for_acquisition).toBe(true);
    expect(afterDeadline.targets[0]?.action).toBe("acquire_realization_evidence");
    expect(buildForecastRealizationFrontier({ ...base, asOf: "2025-07-02" })).toEqual(afterDeadline);
  });

  it("surfaces unresolved forecast dates without inventing a deadline", () => {
    const forecast = event("event_forecast_unknown", "planned", null, "unknown", "launch");
    const result = buildForecastRealizationFrontier({
      records: [forecast],
      priorityQueue: [queueRow(forecast.record_id, "operational-coverage:unknown")],
      asOf: "2026-07-13",
      graceDays: 60,
    });
    expect(result.targets[0]).toMatchObject({
      due_for_acquisition: null,
      action: "resolve_target_date",
      frontier_state: "open",
      forecast_date: { interval: null, grace_deadline: null },
    });
  });

  it("builds byte-stable JSON and Markdown from shuffled inputs", () => {
    const input = fixture();
    const forward = buildForecastRealizationArtifacts(buildForecastRealizationFrontier(input));
    const reverse = buildForecastRealizationArtifacts(buildForecastRealizationFrontier({
      ...input,
      records: [...input.records].reverse(),
      priorityQueue: [...input.priorityQueue].reverse(),
    }));
    expect(reverse.contents).toEqual(forward.contents);
    expect(reverse.hashes).toEqual(forward.hashes);
    expect(forward.contents["target-list.md"]).toContain("never closes a target");
    expect(forward.contents["target-list.md"]).toContain("separate diagnostic layer");
  });

  it("rejects implicit or invalid clock inputs", () => {
    expect(() => buildForecastRealizationFrontier({ ...fixture(), asOf: "2025-7-1" })).toThrow("ISO day");
    expect(() => buildForecastRealizationFrontier({ ...fixture(), graceDays: -1 })).toThrow("non-negative integer");
    expect(() => buildForecastRealizationFrontier({ ...fixture(), graceDays: 1.5 })).toThrow("non-negative integer");
  });
});
