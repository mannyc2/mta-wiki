import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";

type SourceBlock = {
  block_id: string;
  raw_text_sha256: string;
  normalized_text_sha256: string;
};

type SourceMetadata = {
  sourceId: string;
  sourceUrl: string;
  retrievedAt: string;
  stagedAt: string;
  title: string;
  publisher: string;
  documentDate: string | null;
};

type OfficialSourceCapture = {
  source_id: string;
  publisher: string;
  title: string;
  url: string;
  publication_date: string | null;
  retrieved_at: string;
  source_html_sha256: string;
  source_html_bytes: number;
  text_sha256: string;
  blocks_sha256: string;
  evidence: Array<{
    evidence_id: string;
    evidence_sha256: string;
  }>;
};

type BroadwayReceipt = {
  receipt_id: string;
  status: string;
  scope: {
    project_record_id: string;
    preserved_planning_event_id: string;
    realized_status_event_id: string;
    route_record_id: string;
    treatment_record_id: string;
  };
  official_source_captures: OfficialSourceCapture[];
  temporal_adjudication: {
    earlier_planning_evidence_id: string;
    earlier_planning_evidence_sha256: string;
    exact_operational_onset: null;
  };
  curation_decisions: {
    project_status_scalar: string;
    direct_scope_relation_local_ids: string[];
  };
  route_anchor_adjudication: {
    gtfs_route_id: string;
    canonical_route_record_id: string;
    canonical_route_id_after_correction: string;
  };
  reproducibility: {
    observation_count: number;
    accepted_observation_count: number;
    semantic_correction_ids: string[];
  };
};

type RouteAnchor = {
  gtfs_route_id: string;
  canonical_route_record_id: string;
  disposition: string;
  aliases: string[];
};

type OperationalAnchor = {
  anchor_id: string;
  event_record_id: string;
  lifecycle_phase: string;
  temporal_role: string;
  assertion_statuses: string[];
  status_as_of_dates: string[];
  candidate_operational_date_candidates: unknown[];
  candidate_operational_date_normalized: string | null;
  candidate_operational_date_precision: string;
  candidate_operational_date_raw: string | null;
  candidate_operational_date_source_field: string | null;
  candidate_operational_dates_normalized: string[];
  route_record_ids: string[];
  treatment_record_ids: string[];
  route_scope_direct: boolean;
  treatment_scope_direct: boolean;
  route_scope_resolution: string;
  treatment_scope_resolution: string;
  scope_resolution: string;
  exclusion_reasons: string[];
  study_eligible: boolean;
};

type GapRow = {
  event_record_id: string;
  dimension: string;
  gap_id: string;
  status?: string;
  verdict: string;
  decision_ids: string[];
  search_receipt_ids: string[];
  required_search_source_ids: string[];
  resolved_occurrence_ids: string[];
};

type GapDecision = {
  decision_id: string;
  gap_id: string;
  prior_verdict: string;
  verdict: string;
  search_receipt_ids: string[];
};

type GapSearchReceipt = {
  receipt_id: string;
  gap_id: string;
  corpus_fingerprint: string;
  source_searches: Array<{
    source_id: string;
    queries: string[];
    matching_block_ids: string[];
  }>;
};

type CoverageManifest = {
  corpus_fingerprint: string;
};

const receiptPath = "data/quality/acquisition/receipts/broadway-q70-delivery-status-2026.json";
const releaseRoot = "data/exports/releases/v1-rc11";
const realizedEventId = "event_broadway-center-running-bus-lane-installation-confirmed";
const planningEventId = "event_bus-lanes-operational-mid-june-2026";
const fordhamPlanningEventId = "event_bus-lanes-operational-latesummer2026";
const routeId = "route_q70-sbs";
const treatmentId = "treatment_broadway-center-running-bus-lane";
const projectId = "project_broadway-bus-priority-2026";

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as T;
}

function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(join(repoRoot, relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function sha256Hex(relativePath: string): string {
  return createHash("sha256").update(readFileSync(join(repoRoot, relativePath))).digest("hex");
}

function expectEvidenceHash(evidenceId: string, expectedHash: string): void {
  const [sourceId, blockId] = evidenceId.split("#");
  if (!sourceId || !blockId) throw new Error(`invalid evidence id ${evidenceId}`);
  const block = readJsonl<SourceBlock>(`raw/sources/${sourceId}/blocks.jsonl`)
    .find((candidate) => candidate.block_id === blockId);
  if (!block) throw new Error(`missing source block ${evidenceId}`);
  expect(block.raw_text_sha256).toBe(expectedHash);
  expect(block.normalized_text_sha256).toBe(expectedHash);
}

function byRecordId(records: readonly MtaCanonicalRecord[], recordId: string): MtaCanonicalRecord {
  const record = records.find((candidate) => candidate.record_id === recordId);
  if (!record) throw new Error(`missing canonical record ${recordId}`);
  return record;
}

describe("Broadway Q70 delivered-status recovery", () => {
  const receipt = readJson<BroadwayReceipt>(receiptPath);
  const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
  const projects = readJsonl<MtaCanonicalRecord>("data/canonical/projects.jsonl");
  const routes = readJsonl<MtaCanonicalRecord>("data/canonical/routes.jsonl");
  const treatments = readJsonl<MtaCanonicalRecord>("data/canonical/treatment_components.jsonl");
  const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");

  it("pins both official captures and every receipt-cited evidence block", () => {
    expect(receipt.receipt_id).toBe("broadway-q70-delivery-status-2026");
    expect(receipt.status).toBe("delivered_status_recovered_exact_onset_unresolved");
    expect(receipt.official_source_captures).toHaveLength(2);
    expect(receipt.reproducibility).toMatchObject({
      observation_count: 14,
      accepted_observation_count: 14,
    });

    for (const capture of receipt.official_source_captures) {
      const sourceRoot = `raw/sources/${capture.source_id}`;
      const metadata = readJson<SourceMetadata>(`${sourceRoot}/metadata.json`);
      expect(metadata).toMatchObject({
        sourceId: capture.source_id,
        sourceUrl: capture.url,
        retrievedAt: capture.retrieved_at,
        title: capture.title,
        publisher: capture.publisher,
        documentDate: capture.publication_date,
      });
      expect(Date.parse(metadata.retrievedAt)).toBeLessThanOrEqual(Date.parse(metadata.stagedAt));
      expect(sha256Hex(`${sourceRoot}/source.html`)).toBe(capture.source_html_sha256);
      expect(readFileSync(join(repoRoot, `${sourceRoot}/source.html`)).byteLength)
        .toBe(capture.source_html_bytes);
      expect(sha256Hex(`${sourceRoot}/text.txt`)).toBe(capture.text_sha256);
      expect(sha256Hex(`${sourceRoot}/blocks.jsonl`)).toBe(capture.blocks_sha256);

      for (const evidence of capture.evidence) {
        expectEvidenceHash(evidence.evidence_id, evidence.evidence_sha256);
      }
    }

    expectEvidenceHash(
      receipt.temporal_adjudication.earlier_planning_evidence_id,
      receipt.temporal_adjudication.earlier_planning_evidence_sha256,
    );
  });

  it("keeps the forecast separate from the undated realized status event", () => {
    const planningEvent = byRecordId(events, receipt.scope.preserved_planning_event_id);
    expect(planningEvent.record_id).toBe(planningEventId);
    expect(planningEvent.payload.lifecycle_phase).toBe("planned");
    expect(planningEvent.payload.date_text).toBe("Mid June");

    const realizedEvent = byRecordId(events, receipt.scope.realized_status_event_id);
    expect(realizedEvent.record_id).toBe(realizedEventId);
    expect(realizedEvent.payload.lifecycle_phase).toBe("installed");
    expect(realizedEvent.payload.date_precision).toBe("unknown");
    expect(receipt.temporal_adjudication.exact_operational_onset).toBeNull();
    for (const field of [
      "date",
      "date_normalized",
      "date_text",
      "date_text_normalized",
      "year",
      "start_date",
      "end_date",
    ]) {
      expect(field in realizedEvent.payload).toBe(false);
    }

    const project = byRecordId(projects, receipt.scope.project_record_id);
    expect(project.record_id).toBe(projectId);
    expect(project.payload.status).toBe(receipt.curation_decisions.project_status_scalar);
    expect(project.payload.status).toBe("proposed");
  });

  it("retains one treatment identity and a direct route-to-treatment-to-event chain", () => {
    const broadwayCenterRunningTreatments = treatments.filter((record) => {
      const searchable = JSON.stringify([
        record.record_id,
        record.display_name,
        record.payload.treatment_kind,
        record.payload.description,
        record.payload.location_text,
      ]).toLowerCase();
      return searchable.includes("broadway") && searchable.includes("center-running");
    });
    expect(broadwayCenterRunningTreatments.map((record) => record.record_id)).toEqual([treatmentId]);

    const temporaryTreatmentIds = [
      "treatment_broadway-center-running-lane-delivered-dot-2026",
      "treatment_broadway-center-running-lane-delivered-mayor-2026",
    ];
    expect(treatments.some((record) => temporaryTreatmentIds.includes(record.record_id))).toBe(false);

    const routeToTreatment = relations.filter((record) =>
      record.payload.subject_id === routeId && record.payload.object_id === treatmentId);
    expect(routeToTreatment.map((record) => record.record_id)).toEqual([
      "relation_q70-uses-broadway-center-running-lane-as-of-2026-07-13",
    ]);
    expect(routeToTreatment[0]?.payload).toMatchObject({
      relation_kind: "has_treatment",
      assertion_status: "delivered",
      as_of_date: "2026-07-13",
    });

    const treatmentToEvent = relations.filter((record) =>
      record.payload.subject_id === treatmentId && record.payload.object_id === realizedEventId);
    expect(treatmentToEvent.map((record) => record.record_id)).toEqual([
      "relation_broadway-center-running-lane-installation-confirmed-by-2026-06-10",
    ]);
    expect(treatmentToEvent[0]?.payload).toMatchObject({
      relation_kind: "has_timeline_event",
      assertion_status: "delivered",
      as_of_date: "2026-06-10",
    });

    const route = byRecordId(routes, receipt.scope.route_record_id);
    expect(route.record_id).toBe(routeId);
    expect(route.payload.route_id).toBe(receipt.route_anchor_adjudication.canonical_route_id_after_correction);
    expect(route.payload.route_id).toBe("Q70-SBS");
  });

  it("exports Q70+ and the delivered status as a direct but onset-ineligible anchor", () => {
    const routeAnchors = readJsonl<RouteAnchor>(`${releaseRoot}/route_anchors.jsonl`)
      .filter((row) => row.gtfs_route_id === receipt.route_anchor_adjudication.gtfs_route_id);
    expect(routeAnchors).toHaveLength(1);
    expect(routeAnchors[0]).toMatchObject({
      gtfs_route_id: "Q70+",
      canonical_route_record_id: receipt.route_anchor_adjudication.canonical_route_record_id,
      disposition: "true_route",
    });
    expect(routeAnchors[0]?.aliases).toContain("Q70-SBS");

    const anchors = readJsonl<OperationalAnchor>(`${releaseRoot}/operational_anchors.jsonl`)
      .filter((row) => row.event_record_id === realizedEventId);
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toMatchObject({
      lifecycle_phase: "installed",
      temporal_role: "status_as_of",
      assertion_statuses: ["delivered"],
      status_as_of_dates: ["2026-06-10"],
      route_record_ids: [routeId],
      treatment_record_ids: [treatmentId],
      route_scope_direct: true,
      treatment_scope_direct: true,
      route_scope_resolution: "direct",
      treatment_scope_resolution: "direct",
      scope_resolution: "direct",
      candidate_operational_date_candidates: [],
      candidate_operational_date_normalized: null,
      candidate_operational_date_precision: "unknown",
      candidate_operational_date_raw: null,
      candidate_operational_date_source_field: null,
      candidate_operational_dates_normalized: [],
      study_eligible: false,
    });
    expect([...anchors[0]!.exclusion_reasons].sort()).toEqual([
      "missing_operational_date",
      "status_as_of_only",
    ]);
  });

  it("terminalizes all eight prospective Fordham and Broadway gaps as not applicable", () => {
    const forecastEventIds = new Set([fordhamPlanningEventId, planningEventId]);
    const rows = readJsonl<GapRow>("data/quality/operational-coverage/priority-queue.jsonl")
      .filter((row) => forecastEventIds.has(row.event_record_id));
    expect(rows).toHaveLength(8);

    for (const eventId of forecastEventIds) {
      const eventRows = rows.filter((row) => row.event_record_id === eventId);
      expect(eventRows.map((row) => row.dimension).sort()).toEqual([
        "date_precision",
        "delivered_status",
        "route",
        "treatment",
      ]);
    }

    for (const row of rows) {
      expect(row.status).toBe("terminal");
      expect(row.verdict).toBe("not_applicable");
      expect(row.decision_ids).toHaveLength(1);
      expect(row.search_receipt_ids).toEqual([]);
      expect(row.resolved_occurrence_ids).toEqual([]);
      const decision = readJson<GapDecision>(
        `data/operational-anchor-review/ledger-decisions/decisions/${row.decision_ids[0]}.json`,
      );
      expect(decision).toMatchObject({
        decision_id: row.decision_ids[0],
        gap_id: row.gap_id,
        prior_verdict: "unreviewed",
        verdict: "not_applicable",
        search_receipt_ids: [],
      });
    }
  });

  it("terminalizes the realized event's exact-onset gap as absent with a complete search receipt", () => {
    const rows = readJsonl<GapRow>("data/quality/operational-coverage/recoverability-ledger.jsonl")
      .filter((row) => row.event_record_id === realizedEventId && row.dimension === "date_precision");
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.verdict).toBe("absent_in_source");
    expect(row.decision_ids).toEqual(["broadway-center-running-lane-exact-onset-absent"]);
    expect(row.search_receipt_ids).toEqual(["broadway-center-running-lane-exact-onset-search"]);
    expect(row.resolved_occurrence_ids).toEqual([]);

    const decision = readJson<GapDecision>(
      `data/operational-anchor-review/ledger-decisions/decisions/${row.decision_ids[0]}.json`,
    );
    expect(decision).toMatchObject({
      decision_id: row.decision_ids[0],
      gap_id: row.gap_id,
      prior_verdict: "unreviewed",
      verdict: "absent_in_source",
      search_receipt_ids: row.search_receipt_ids,
    });

    const searchReceipt = readJson<GapSearchReceipt>(
      `data/operational-anchor-review/ledger-decisions/search-receipts/${row.search_receipt_ids[0]}.json`,
    );
    const coverageManifest = readJson<CoverageManifest>("data/quality/operational-coverage/manifest.json");
    expect(searchReceipt).toMatchObject({
      receipt_id: row.search_receipt_ids[0],
      gap_id: row.gap_id,
      corpus_fingerprint: coverageManifest.corpus_fingerprint,
    });
    expect(searchReceipt.source_searches.map((search) => search.source_id).sort())
      .toEqual([...row.required_search_source_ids].sort());
    expect(searchReceipt.source_searches.every((search) =>
      search.queries.length > 0 && search.matching_block_ids.length === 0)).toBe(true);
  });
});
