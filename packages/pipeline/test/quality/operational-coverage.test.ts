import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { OperationalAnchorRow } from "@mta-wiki/pipeline/materialize/operational-anchors";
import type { OperationalOccurrenceRow } from "@mta-wiki/pipeline/materialize/operational-occurrences";
import {
  buildOperationalCoverageLedger,
  type OperationalCoverageAcceptedDecision,
  type OperationalCoverageSearchReceipt,
} from "@mta-wiki/pipeline/quality/operational-coverage";
import {
  buildOperationalCoverageArtifacts,
  loadOperationalCoverageRouteAnchorPin,
} from "@mta-wiki/pipeline/quality/operational-coverage-artifacts";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pinnedRouteAnchorFixture(releaseId = "v1-rc5") {
  const rootDir = mkdtempSync(join(tmpdir(), "operational-coverage-pin-"));
  const routeAnchorPath = `data/exports/releases/${releaseId}/route_anchors.jsonl`;
  const content = `${JSON.stringify({
    gtfs_route_id: "Q3",
    canonical_route_record_id: "route_q3",
    variant_record_ids: [],
    disposition: "true_route",
  })}\n`;
  mkdirSync(join(rootDir, `data/exports/releases/${releaseId}`), { recursive: true });
  writeFileSync(join(rootDir, routeAnchorPath), content, "utf8");
  const manifestPath = join(rootDir, "data/quality/operational-coverage/manifest.json");
  mkdirSync(join(manifestPath, ".."), { recursive: true });
  const manifest = {
    corpus_fingerprint: "a".repeat(64),
    input_fingerprint: "b".repeat(64),
    route_anchor_path: routeAnchorPath,
    route_anchor_release_id: releaseId,
    route_anchor_sha256: sha256(content),
    route_anchor_count: 1,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
  return { rootDir, manifestPath, manifest };
}

function record(
  recordId: string,
  recordKind: MtaCanonicalRecord["record_kind"],
  payload: JsonObject = {},
  sourceId = "source_recent",
): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: recordKind,
    source_id: sourceId,
    local_observation_id: recordId,
    display_name: recordId,
    payload,
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-12T00:00:00.000Z",
  };
}

function withEvidence(
  value: MtaCanonicalRecord,
  sourceId = value.source_id,
  sourceQuote?: string,
): MtaCanonicalRecord {
  return {
    ...value,
    evidence_refs: [{
      source_id: sourceId,
      evidence_id: `${sourceId}#fixture`,
      ...(sourceQuote ? { source_quote: sourceQuote } : {}),
    }],
  };
}

function anchor(
  eventRecordId: string,
  anchorId = `operational:${eventRecordId}`,
  overrides: Partial<OperationalAnchorRow> = {},
): OperationalAnchorRow {
  return {
    schema_version: 1,
    anchor_id: anchorId,
    operational_change_id: eventRecordId,
    event_record_id: eventRecordId,
    timeline_relation_record_ids: ["timeline_a", "timeline_b"],
    project_record_ids: [],
    subject_record_ids: [],
    subject_record_kinds: [],
    route_record_ids: ["route_b1"],
    unmatched_route_record_ids: [],
    gtfs_route_ids: ["B1"],
    treatment_record_ids: ["treatment_bus_lane"],
    treatment_families: ["bus_lane"],
    route_scope_direct: true,
    treatment_scope_direct: true,
    temporal_role: "realized_operational",
    raw_date: "2024-06-01",
    normalized_date: "2024-06-01",
    date_precision: "day",
    candidate_operational_date_raw: "2024-06-01",
    candidate_operational_date_normalized: "2024-06-01",
    candidate_operational_date_precision: "day",
    candidate_operational_date_source_field: "date",
    candidate_operational_date_candidates: [],
    candidate_operational_dates_normalized: ["2024-06-01"],
    status_as_of_dates: [],
    event_family: "launch",
    lifecycle_phase: "launched",
    assertion_statuses: ["delivered"],
    truth_status: "source_stated",
    truth_statuses: ["source_stated"],
    review_state: "unreviewed",
    source_id: "source_recent",
    source_ids: ["source_recent"],
    source_authority: "official_public_agency",
    source_publishers: ["MTA"],
    route_scope_resolution: "direct",
    treatment_scope_resolution: "direct",
    scope_resolution: "direct",
    conflict_states: [],
    evidence_coverage: { event: true, timeline: true, route_scope: true, treatment_scope: true },
    evidence_refs: [],
    exclusion_reasons: [],
    study_eligible: true,
    ...overrides,
  };
}

function occurrence(
  occurrenceId: string,
  input: { eligible?: boolean; routes?: string[]; treatment?: "atomic" | "bundle" } = {},
): OperationalOccurrenceRow {
  const treatment = input.treatment === "atomic"
    ? {
        kind: "atomic" as const,
        member: {
          treatment_record_id: "treatment_bus_lane",
          treatment_family: "bus_lane",
          evidence_bindings: [],
        },
      }
    : {
        kind: "bundle" as const,
        bundle_family: "select_bus_service",
        bundle_family_evidence_bindings: [],
        members: [
          { treatment_record_id: "treatment_bus_lane", treatment_family: "bus_lane", evidence_bindings: [] },
          { treatment_record_id: "treatment_tsp", treatment_family: "signal_priority", evidence_bindings: [] },
        ],
      };
  return {
    schema_version: 1,
    occurrence_id: occurrenceId,
    occurrence_aliases: [],
    occurrence_review_decision_id: `review_${occurrenceId}`,
    founding_key: occurrenceId,
    resolution_cluster_id: null,
    observations: [],
    resolved_status: "realized",
    resolved_onset: {
      date: "2024-06-01",
      precision: "day",
      resolver_ids: [],
      publication_dates: [],
      retrieval_dates: [],
      evidence_bindings: [],
    },
    routes: (input.routes ?? ["B1"]).map((gtfsRouteId) => ({
      route_record_id: `route_${gtfsRouteId.toLowerCase()}`,
      gtfs_route_id: gtfsRouteId,
      evidence_bindings: [],
    })),
    treatment,
    source_ids: ["source_recent"],
    evidence_bindings: [],
    exclusion_reasons: [],
    review_state: "approved",
    study_projection_eligible: input.eligible ?? true,
    provenance: {
      anchor_review_decision_ids: [],
      event_record_ids: [],
      relation_record_ids: [],
      route_record_ids: [],
      treatment_record_ids: [],
    },
  };
}

function baseInput() {
  const current = record("event_current", "event", {
    event_family: "launch",
    lifecycle_phase: "launched",
    date_normalized: "2024-06-01",
  });
  const historical = record("event_historical", "event", {
    event_family: "implementation",
    date_normalized: "2019",
  }, "source_historical");
  return {
    canonical_records: [
      current,
      historical,
      record("source_current", "source", {
        publisher: "Metropolitan Transportation Authority",
        published_date_normalized: "2024-01-01",
        title: "Queens Bus Network Redesign",
      }),
      record("source_historical", "source", {
        publisher: "MTA",
        published_date_normalized: "2019-01-01",
      }, "source_historical"),
    ],
    operational_anchor_rows: [
      anchor("event_current"),
      anchor("event_current", "operational-reviewed:first"),
      anchor("event_current", "operational-reviewed:second"),
    ],
    operational_occurrence_rows: [
      occurrence("occurrence_a", { routes: ["B1"], treatment: "bundle" }),
      occurrence("occurrence_a", { routes: ["B1"], treatment: "bundle" }),
      occurrence("occurrence_b", { routes: ["B1"], treatment: "atomic" }),
      occurrence("occurrence_ineligible", { eligible: false, routes: ["B2"] }),
    ],
  };
}

describe("operational coverage ledger", () => {
  it("keeps event, row, occurrence, bundle, and route-pair populations separate", () => {
    const report = buildOperationalCoverageLedger(baseInput());

    expect(report.summary.population).toMatchObject({
      canonical_operational_events: 2,
      canonical_events_in_study_window: 1,
      canonical_events_before_study_window: 1,
      broad_anchor_rows: 1,
      distinct_timeline_linked_events: 1,
      unlinked_operational_events: 1,
      reviewed_overlay_rows: 2,
      reviewed_overlay_distinct_events: 1,
      duplicate_reviewed_overlay_rows: 2,
      occurrence_rows: 4,
      distinct_occurrences: 3,
      eligible_occurrences: 2,
      bundle_occurrences: 2,
      eligible_occurrence_route_pairs: 2,
      unique_eligible_gtfs_routes: 1,
    });
    expect(report.gaps.filter((gap) => gap.event_record_id === "event_current")).toEqual([]);
    expect(report.gaps.map((gap) => [gap.event_record_id, gap.dimension])).toEqual([
      ["event_historical", "timeline_subject"],
    ]);
  });

  it("keeps explicitly historical events out while prioritizing current dates and recent official family signals", () => {
    const report = buildOperationalCoverageLedger({ ...baseInput(), operational_anchor_rows: [] });
    const historical = report.gaps.find((gap) => gap.event_record_id === "event_historical");
    const current = report.gaps.find((gap) => gap.event_record_id === "event_current");

    expect(historical?.priority).toBe(false);
    expect(historical?.priority_basis).toEqual([]);
    expect(current?.priority).toBe(true);
    expect(current?.priority_basis).toEqual(["date_window", "recent_priority_family"]);
    expect(current?.priority_families).toEqual(["route_redesign"]);
  });

  it("recognizes canonical signal-priority context without widening generic signal treatments", () => {
    const source = record("source_recent", "source", {
      publisher: "MTA",
      published_date_normalized: "2024-01-01",
      title: "Generic project update",
    });
    const currentEvent = record("event_linked_current", "event", {
      event_family: "implementation",
      date_normalized: "2025-06-01",
    });
    const historicalEvent = record("event_linked_historical", "event", {
      event_family: "implementation",
      date_normalized: "2022-06-01",
    });
    const signalProject = withEvidence(record("project_signal", "project", { project_family: "signal_priority" }));
    const busProject = withEvidence(record("project_bus", "project", { project_family: "bus_priority" }));
    const contextualItsp = withEvidence(record("treatment_contextual_itsp", "treatment_component", {
      treatment_family: "signal_priority",
      treatment_kind: "ITSP deployment",
    }), "source_recent", "ITSP deployment");
    const linkedAnchor = (eventId: string, projectId: string): OperationalAnchorRow => anchor(eventId, `operational:${eventId}`, {
      project_record_ids: [projectId],
      subject_record_ids: [projectId],
      subject_record_kinds: ["project"],
      route_record_ids: [],
      gtfs_route_ids: [],
      treatment_record_ids: [],
      treatment_families: [],
      route_scope_resolution: "missing",
      treatment_scope_resolution: "missing",
      scope_resolution: "missing",
      evidence_coverage: { event: true, timeline: true, route_scope: false, treatment_scope: false },
      evidence_refs: [{
        record_id: eventId,
        source_id: "source_recent",
        evidence_id: "source_recent#event",
        block_id: "event",
        page_number: 1,
        text_sha256: "a".repeat(64),
        role: "event",
      }, {
        record_id: "timeline_a",
        source_id: "source_recent",
        evidence_id: "source_recent#timeline",
        block_id: "timeline",
        page_number: 1,
        text_sha256: "b".repeat(64),
        role: "timeline_relation",
      }],
      normalized_date: eventId === "event_linked_historical" ? "2022-06-01" : "2025-06-01",
      candidate_operational_date_normalized: eventId === "event_linked_historical" ? "2022-06-01" : "2025-06-01",
      candidate_operational_dates_normalized: [eventId === "event_linked_historical" ? "2022-06-01" : "2025-06-01"],
    });

    const signalReport = buildOperationalCoverageLedger({
      canonical_records: [source, currentEvent, signalProject],
      operational_anchor_rows: [linkedAnchor(currentEvent.record_id, signalProject.record_id)],
      operational_occurrence_rows: [],
    });
    expect(signalReport.gaps[0]?.priority_basis).toEqual(["date_window", "recent_priority_family"]);
    expect(signalReport.gaps[0]?.priority_families).toEqual(["transit_signal_priority"]);

    const busReport = buildOperationalCoverageLedger({
      canonical_records: [source, currentEvent, busProject],
      operational_anchor_rows: [linkedAnchor(currentEvent.record_id, busProject.record_id)],
      operational_occurrence_rows: [],
    });
    expect(busReport.gaps[0]?.priority).toBe(false);

    const contextualItspReport = buildOperationalCoverageLedger({
      canonical_records: [source, currentEvent, busProject, contextualItsp],
      operational_anchor_rows: [linkedAnchor(currentEvent.record_id, busProject.record_id)],
      operational_occurrence_rows: [],
    });
    expect(contextualItspReport.gaps[0]?.priority).toBe(true);
    expect(contextualItspReport.gaps[0]?.priority_basis).toEqual(["date_window", "recent_priority_family"]);
    expect(contextualItspReport.gaps[0]?.priority_families).toEqual(["transit_signal_priority"]);
    const contextualTreatmentGap = contextualItspReport.gaps.find((gap) => gap.dimension === "treatment");
    expect(contextualTreatmentGap?.treatment_record_ids).toEqual([]);
    expect(contextualTreatmentGap?.candidate_record_ids).toContain(contextualItsp.record_id);

    const otherSourceItsp = withEvidence({
      ...record("treatment_other_source_itsp", "treatment_component", {
        treatment_family: "signal_priority",
        treatment_kind: "ITSP deployment",
      }, "source_other"),
      source_ids: ["source_other", "source_recent"],
    }, "source_other", "ITSP deployment");
    const otherSourceReport = buildOperationalCoverageLedger({
      canonical_records: [source, currentEvent, busProject, otherSourceItsp],
      operational_anchor_rows: [linkedAnchor(currentEvent.record_id, busProject.record_id)],
      operational_occurrence_rows: [],
    });
    expect(otherSourceReport.gaps[0]?.priority).toBe(false);

    const sourceOther = record("source_other", "source", {
      publisher: "MTA",
      published_date_normalized: "2024-02-01",
      title: "Other generic project update",
    }, "source_other");
    const policyProjectOther = withEvidence(record("project_policy_other", "project", {
      project_family: "policy_program",
    }, "source_other"), "source_other");
    const rowA = linkedAnchor(currentEvent.record_id, busProject.record_id);
    const rowB = {
      ...linkedAnchor(currentEvent.record_id, policyProjectOther.record_id),
      anchor_id: `operational:${currentEvent.record_id}:source-other`,
      source_id: "source_other",
      source_ids: ["source_other"],
      evidence_refs: [{
        record_id: currentEvent.record_id,
        source_id: "source_other",
        evidence_id: "source_other#event",
        block_id: "event",
        page_number: 1,
        text_sha256: "c".repeat(64),
        role: "event" as const,
      }, {
        record_id: "timeline_other",
        source_id: "source_other",
        evidence_id: "source_other#timeline",
        block_id: "timeline",
        page_number: 1,
        text_sha256: "d".repeat(64),
        role: "timeline_relation" as const,
      }],
    };
    const splitRowContextReport = buildOperationalCoverageLedger({
      canonical_records: [source, sourceOther, currentEvent, busProject, policyProjectOther, otherSourceItsp],
      operational_anchor_rows: [rowA, rowB],
      operational_occurrence_rows: [],
    });
    expect(splitRowContextReport.gaps[0]?.priority).toBe(false);

    const contaminatedEntity = withEvidence(record("entity_contaminated", "entity", {
      description: "Merged bus and TSP material from an unrelated source",
    }));
    const contaminatedEntityReport = buildOperationalCoverageLedger({
      canonical_records: [source, currentEvent, contaminatedEntity, contextualItsp],
      operational_anchor_rows: [linkedAnchor(currentEvent.record_id, contaminatedEntity.record_id)],
      operational_occurrence_rows: [],
    });
    expect(contaminatedEntityReport.gaps[0]?.priority).toBe(false);

    const policyProject = withEvidence(record("project_policy", "project", {
      project_family: "policy_program",
      description: "A report that happens to discuss bus and TSP projects",
      _merged_field_values: { project_family: ["busway", "signal_priority"] },
    }));
    const contaminatedProjectReport = buildOperationalCoverageLedger({
      canonical_records: [source, currentEvent, policyProject, contextualItsp],
      operational_anchor_rows: [linkedAnchor(currentEvent.record_id, policyProject.record_id)],
      operational_occurrence_rows: [],
    });
    expect(contaminatedProjectReport.gaps[0]?.priority).toBe(false);

    const historicalReport = buildOperationalCoverageLedger({
      canonical_records: [source, historicalEvent, signalProject],
      operational_anchor_rows: [linkedAnchor(historicalEvent.record_id, signalProject.record_id)],
      operational_occurrence_rows: [],
    });
    expect(historicalReport.gaps[0]?.priority).toBe(false);

    for (const [id, treatmentKind] of [
      ["treatment_pedestrian", "pedestrian signal"],
      ["treatment_cbtc", "CBTC signal"],
      ["treatment_timing", "traffic signal timing"],
      ["treatment_queue_jump", "bus queue jump"],
    ] as const) {
      const treatment = record(id, "treatment_component", {
        treatment_family: "signal_priority",
        treatment_kind: treatmentKind,
      });
      const report = buildOperationalCoverageLedger({
        canonical_records: [source, currentEvent, treatment],
        operational_anchor_rows: [anchor(currentEvent.record_id, `operational:${id}`, {
          assertion_statuses: ["planned"],
          lifecycle_phase: "other",
          treatment_record_ids: [id],
          treatment_families: ["signal_priority"],
        })],
        operational_occurrence_rows: [],
      });
      expect(report.gaps[0]?.priority_families).not.toContain("transit_signal_priority");
    }

    const itsp = record("treatment_itsp", "treatment_component", {
      treatment_family: "signal_priority",
      treatment_kind: "ITSP deployment",
    });
    const itspReport = buildOperationalCoverageLedger({
      canonical_records: [source, currentEvent, itsp],
      operational_anchor_rows: [anchor(currentEvent.record_id, "operational:itsp", {
        assertion_statuses: ["planned"],
        lifecycle_phase: "other",
        treatment_record_ids: [itsp.record_id],
        treatment_families: ["signal_priority"],
      })],
      operational_occurrence_rows: [],
    });
    expect(itspReport.gaps[0]?.priority_families).toContain("transit_signal_priority");
  });

  it("does not treat multi-route, multi-treatment, planned, or imprecise rows as complete", () => {
    const input = baseInput();
    input.operational_anchor_rows = [anchor("event_current", "operational:event_current", {
      gtfs_route_ids: ["B1", "B2"],
      route_record_ids: ["route_b1", "route_b2"],
      treatment_record_ids: ["treatment_bus_lane", "treatment_tsp"],
      treatment_families: ["bus_lane", "signal_priority"],
      temporal_role: "planned_operational",
      lifecycle_phase: "other",
      candidate_operational_date_normalized: "2024",
      candidate_operational_date_precision: "year",
    })];
    const report = buildOperationalCoverageLedger(input);

    expect(report.gaps.filter((gap) => gap.event_record_id === "event_current").map((gap) => gap.dimension).sort()).toEqual([
      "date_precision",
      "delivered_status",
      "route",
      "treatment",
    ]);
  });

  it("replays accepted decisions deterministically and carries their audit bindings", () => {
    const input = baseInput();
    input.operational_anchor_rows = [anchor("event_current", "operational:event_current", {
      gtfs_route_ids: [],
      route_record_ids: [],
      route_scope_resolution: "missing",
      evidence_coverage: { event: true, timeline: true, route_scope: false, treatment_scope: true },
    })];
    const first = buildOperationalCoverageLedger(input);
    const gap = first.gaps.find((candidate) => candidate.event_record_id === "event_current");
    if (!gap) throw new Error("missing route gap fixture");
    const decision: OperationalCoverageAcceptedDecision = {
      schema_version: 1,
      decision_id: "decision_route_record_missing",
      gap_id: gap.gap_id,
      prior_verdict: "unreviewed",
      verdict: "record_missing",
      reviewer: "test-reviewer",
      decided_at: "2026-07-12T01:00:00.000Z",
      rationale: "The cited source establishes the route but the canonical route observation is absent.",
      proposal_ids: ["proposal_route"],
      evidence_refs: [{
        record_id: "event_current",
        source_id: "source_recent",
        evidence_id: "source_recent#block_1",
        block_id: "block_1",
      }],
      search_receipt_ids: [],
    };
    const decided = buildOperationalCoverageLedger({ ...input, accepted_ledger_decisions: [decision] });
    const reordered = buildOperationalCoverageLedger({
      ...input,
      canonical_records: [...input.canonical_records].reverse(),
      operational_anchor_rows: [...input.operational_anchor_rows].reverse(),
      operational_occurrence_rows: [...input.operational_occurrence_rows].reverse(),
      accepted_ledger_decisions: [decision],
    });
    const decidedGap = decided.gaps.find((candidate) => candidate.gap_id === gap.gap_id);

    expect(decided).toEqual(reordered);
    expect(decidedGap).toMatchObject({
      verdict: "record_missing",
      verdict_basis: "review:decision_route_record_missing",
      decision_ids: ["decision_route_record_missing"],
      proposal_ids: ["proposal_route"],
      search_receipt_ids: [],
      updated_at: "2026-07-12T01:00:00.000Z",
    });
    expect(decidedGap?.evidence_refs).toHaveLength(1);
    expect(decided.queue.find((row) => row.gap_id === gap.gap_id)?.status).toBe("ready_for_review");
  });

  it("rejects stale decisions and absence decisions without search receipts", () => {
    const input = { ...baseInput(), operational_anchor_rows: [] };
    const first = buildOperationalCoverageLedger(input);
    const gap = first.gaps.find((candidate) => candidate.event_record_id === "event_current");
    if (!gap) throw new Error("missing unlinked gap fixture");
    const decision: OperationalCoverageAcceptedDecision = {
      schema_version: 1,
      decision_id: "decision_absent",
      gap_id: gap.gap_id,
      prior_verdict: "unreviewed",
      verdict: "absent_in_source",
      reviewer: "test-reviewer",
      decided_at: "2026-07-12T01:00:00.000Z",
      rationale: "The bounded staged-corpus search found no citable timeline subject.",
      proposal_ids: [],
      evidence_refs: [],
      search_receipt_ids: [],
    };

    expect(() => buildOperationalCoverageLedger({ ...input, accepted_ledger_decisions: [decision] })).toThrow(
      "absent_in_source requires a search receipt",
    );
    expect(() => buildOperationalCoverageLedger({
      ...input,
      accepted_ledger_decisions: [{ ...decision, verdict: "not_applicable", prior_verdict: "record_missing" }],
    })).toThrow("stale prior_verdict");
    expect(() => buildOperationalCoverageLedger({
      ...input,
      accepted_ledger_decisions: [{ ...decision, search_receipt_ids: ["receipt_unverified"] }],
    })).toThrow("unknown search receipt");
  });

  it("rejects same-source decision evidence outside the gap record context", () => {
    const input = baseInput();
    input.operational_anchor_rows = [anchor("event_current", "operational:event_current", {
      gtfs_route_ids: [],
      route_record_ids: [],
      route_scope_resolution: "missing",
      evidence_coverage: { event: true, timeline: true, route_scope: false, treatment_scope: true },
    })];
    const first = buildOperationalCoverageLedger(input);
    const gap = first.gaps.find((candidate) => candidate.event_record_id === "event_current");
    if (!gap) throw new Error("missing route gap fixture");

    expect(() => buildOperationalCoverageLedger({
      ...input,
      accepted_ledger_decisions: [{
        schema_version: 1,
        decision_id: "decision_unrelated_evidence",
        gap_id: gap.gap_id,
        prior_verdict: "unreviewed",
        verdict: "record_missing",
        reviewer: "test-reviewer",
        decided_at: "2026-07-12T01:00:00.000Z",
        rationale: "This deliberately cites a different source.",
        proposal_ids: [],
        evidence_refs: [{
          record_id: "source_current",
          source_id: "source_recent",
          evidence_id: "source_recent#block_1",
          block_id: "block_1",
        }],
        search_receipt_ids: [],
      }],
    })).toThrow("evidence source_current/source_recent is unrelated");
  });

  it("accepts only gap-bound, corpus-bound, exhaustive absence receipts", () => {
    const input = { ...baseInput(), operational_anchor_rows: [] };
    const first = buildOperationalCoverageLedger(input);
    const gap = first.gaps.find((candidate) => candidate.event_record_id === "event_current");
    if (!gap) throw new Error("missing unlinked gap fixture");
    const corpusFingerprint = "a".repeat(64);
    const receipt: OperationalCoverageSearchReceipt = {
      schema_version: 1,
      receipt_id: "receipt_current_subject",
      gap_id: gap.gap_id,
      reviewer: "test-reviewer",
      searched_at: "2026-07-12T00:30:00.000Z",
      rationale: "Searched the event source and registry for its project and route terms.",
      corpus_fingerprint: corpusFingerprint,
      source_searches: gap.required_search_source_ids.map((sourceId) => ({
        source_id: sourceId,
        queries: ["event current", "route"],
        matching_block_ids: [],
      })),
      registry_search: {
        queries: ["event current", "route"],
        title_filters: ["MTA"],
        publisher_filters: ["Metropolitan Transportation Authority"],
        matched_source_ids: [],
      },
    };
    const decision: OperationalCoverageAcceptedDecision = {
      schema_version: 1,
      decision_id: "decision_current_subject_absent",
      gap_id: gap.gap_id,
      prior_verdict: "unreviewed",
      verdict: "absent_in_source",
      reviewer: "test-reviewer",
      decided_at: "2026-07-12T01:00:00.000Z",
      rationale: "No citable subject relation was found in the bounded search.",
      proposal_ids: [],
      evidence_refs: [],
      search_receipt_ids: [receipt.receipt_id],
    };

    const decided = buildOperationalCoverageLedger({
      ...input,
      corpus_fingerprint: corpusFingerprint,
      accepted_search_receipts: [receipt],
      accepted_ledger_decisions: [decision],
    });
    expect(decided.queue.find((row) => row.gap_id === gap.gap_id)?.status).toBe("terminal");

    expect(() => buildOperationalCoverageLedger({
      ...input,
      corpus_fingerprint: corpusFingerprint,
      accepted_search_receipts: [{ ...receipt, source_searches: [] }],
      accepted_ledger_decisions: [decision],
    })).toThrow("source_searches");
    expect(() => buildOperationalCoverageLedger({
      ...input,
      corpus_fingerprint: corpusFingerprint,
      accepted_search_receipts: [{ ...receipt, gap_id: "operational-coverage:another" }],
      accepted_ledger_decisions: [decision],
    })).toThrow("bound to another gap");
    expect(() => buildOperationalCoverageLedger({
      ...input,
      corpus_fingerprint: corpusFingerprint,
      accepted_search_receipts: [{
        ...receipt,
        source_searches: receipt.source_searches.map((search, index) =>
          index === 0 ? { ...search, matching_block_ids: ["block_match"] } : search,
        ),
      }],
      accepted_ledger_decisions: [decision],
    })).toThrow("contains matching blocks");
  });

  it("fails closed on duplicate canonical operational event ids", () => {
    const input = baseInput();
    const duplicate = structuredClone(input.canonical_records[0]!);
    expect(() => buildOperationalCoverageLedger({
      ...input,
      canonical_records: [...input.canonical_records, duplicate],
    })).toThrow("Duplicate canonical operational event id");
  });

  it("renders byte-deterministic matrix and queue artifacts from reordered inputs", () => {
    const input = baseInput();
    const first = buildOperationalCoverageArtifacts({
      records: input.canonical_records,
      routeAnchors: [],
      anchorReviewDecisions: [],
      occurrenceReviewDecisions: [],
      occurrenceIdentityRegistry: [],
    });
    const reordered = buildOperationalCoverageArtifacts({
      records: [...input.canonical_records].reverse(),
      routeAnchors: [],
      anchorReviewDecisions: [],
      occurrenceReviewDecisions: [],
      occurrenceIdentityRegistry: [],
    });

    expect(first.contents).toEqual(reordered.contents);
    expect(first.manifest.input_fingerprint).toBe(reordered.manifest.input_fingerprint);
    expect(first.manifest.files["recoverability-ledger.jsonl"]?.row_count).toBe(2);
    expect(first.contents["coverage-matrix.md"]).toContain("Projection rows (diagnostic, not event counts)");
  });

  it("replays persisted search receipts through the artifact builder", () => {
    const input = baseInput();
    const buildInput = {
      records: input.canonical_records,
      routeAnchors: [],
      anchorReviewDecisions: [],
      occurrenceReviewDecisions: [],
      occurrenceIdentityRegistry: [],
    };
    const baseline = buildOperationalCoverageArtifacts(buildInput);
    const gap = baseline.ledger.gaps.find((candidate) => candidate.event_record_id === "event_current");
    if (!gap) throw new Error("missing artifact receipt gap fixture");
    const receipt: OperationalCoverageSearchReceipt = {
      schema_version: 1,
      receipt_id: "receipt_artifact_replay",
      gap_id: gap.gap_id,
      reviewer: "test-reviewer",
      searched_at: "2026-07-12T00:30:00.000Z",
      rationale: "Searched every required source and the staged registry.",
      corpus_fingerprint: baseline.matrix.corpus_fingerprint,
      source_searches: gap.required_search_source_ids.map((sourceId) => ({
        source_id: sourceId,
        queries: ["event current"],
        matching_block_ids: [],
      })),
      registry_search: {
        queries: ["event current"],
        title_filters: [],
        publisher_filters: [],
        matched_source_ids: [],
      },
    };
    const decision: OperationalCoverageAcceptedDecision = {
      schema_version: 1,
      decision_id: "decision_artifact_replay",
      gap_id: gap.gap_id,
      prior_verdict: "unreviewed",
      verdict: "absent_in_source",
      reviewer: "test-reviewer",
      decided_at: "2026-07-12T01:00:00.000Z",
      rationale: "No citable connection was found.",
      proposal_ids: [],
      evidence_refs: [],
      search_receipt_ids: [receipt.receipt_id],
    };
    const replay = buildOperationalCoverageArtifacts({
      ...buildInput,
      ledgerDecisions: [decision],
      searchReceipts: [receipt],
    });

    expect(replay.manifest.search_receipt_count).toBe(1);
    expect(replay.manifest.ledger_decision_count).toBe(1);
    expect(replay.matrix.corpus_fingerprint).toBe(baseline.matrix.corpus_fingerprint);
    expect(replay.ledger.queue.find((row) => row.gap_id === gap.gap_id)?.status).toBe("terminal");
  });

  it("persists the default route-anchor release identity and accepts an alternate manifest pin", () => {
    const input = baseInput();
    const built = buildOperationalCoverageArtifacts({
      records: input.canonical_records,
      routeAnchors: [],
      anchorReviewDecisions: [],
      occurrenceReviewDecisions: [],
      occurrenceIdentityRegistry: [],
    });
    expect(built.manifest).toMatchObject({
      route_anchor_path: "data/exports/releases/v1-rc5/route_anchors.jsonl",
      route_anchor_release_id: "v1-rc5",
    });
    expect(built.manifest.route_anchor_sha256).toMatch(/^[a-f0-9]{64}$/u);

    const fixture = pinnedRouteAnchorFixture("v2-anchor-canary");
    try {
      expect(loadOperationalCoverageRouteAnchorPin({ rootDir: fixture.rootDir }).pin).toEqual({
        path: fixture.manifest.route_anchor_path,
        release_id: "v2-anchor-canary",
        sha256: fixture.manifest.route_anchor_sha256,
      });
    } finally {
      rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  it("rejects stale route-anchor hashes and release/path disagreement", () => {
    const staleHash = pinnedRouteAnchorFixture();
    try {
      writeFileSync(staleHash.manifestPath, `${JSON.stringify({
        ...staleHash.manifest,
        route_anchor_sha256: "0".repeat(64),
      })}\n`, "utf8");
      expect(() => loadOperationalCoverageRouteAnchorPin({ rootDir: staleHash.rootDir }))
        .toThrow("route_anchor_sha256 mismatch");
    } finally {
      rmSync(staleHash.rootDir, { recursive: true, force: true });
    }

    const wrongPath = pinnedRouteAnchorFixture("alternate-release");
    try {
      writeFileSync(wrongPath.manifestPath, `${JSON.stringify({
        ...wrongPath.manifest,
        route_anchor_release_id: "v1-rc5",
      })}\n`, "utf8");
      expect(() => loadOperationalCoverageRouteAnchorPin({ rootDir: wrongPath.rootDir }))
        .toThrow("route_anchor_release_id does not match route_anchor_path");
    } finally {
      rmSync(wrongPath.rootDir, { recursive: true, force: true });
    }
  });
});
