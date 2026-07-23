import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  buildBusLaneIdentityLedger,
  buildBusLaneResearchPackets,
  candidateLaneTargets,
  normalizeOpenDateToken,
  parseBusLaneIdentityDecision,
  validateBindingReceiptDrafts,
  validateOccurrenceCreatedRows,
  validateReviewedReceiptRefs,
  type BusLaneIdentityDecision,
} from "../../src/quality/bus-lane-identity";
import type { BusLaneFeature } from "../../src/reference/bus-lanes";
import {
  LANE_TRAVERSAL_PARAMS,
  type LaneTraversalRow,
} from "../../src/reference/lane-traversal";

function lane(overrides: Partial<BusLaneFeature> & Pick<BusLaneFeature, "feature_id" | "lane_group_id" | "opened">): BusLaneFeature {
  const [borough = "QNS", street = "TEST STREET"] = overrides.lane_group_id.split("|");
  return {
    feature_id: overrides.feature_id,
    lane_group_id: overrides.lane_group_id,
    facility: overrides.facility ?? street,
    street: overrides.street ?? street,
    borough: overrides.borough ?? borough,
    direction: overrides.direction ?? "NB",
    opened: overrides.opened,
    attributes: overrides.attributes ?? { open_dates: overrides.opened, segmentid: overrides.feature_id },
    lines: overrides.lines ?? [[{ lat: 40, lon: -73 }, { lat: 40.01, lon: -73 }]],
  };
}

function dossier(input: {
  candidateId: string;
  routeId: string;
  date: string;
  verdict?: LaneTraversalRow["verdict_class"];
  laneGroupId?: string | null;
  pathSource?: LaneTraversalRow["path_source"];
  reason?: string;
  pathIdentity?: string | null;
  coverage?: number;
}): LaneTraversalRow {
  const laneGroupId = input.laneGroupId === undefined ? "QNS|TEST STREET" : input.laneGroupId;
  return {
    schema_version: 1,
    candidate_id: input.candidateId,
    candidate_date: input.date,
    route_id: input.routeId,
    service_date: input.date,
    direction: "N",
    path_identity: input.pathIdentity === undefined ? "shape-a" : input.pathIdentity,
    lane_group_id: laneGroupId,
    street: laneGroupId ? laneGroupId.split("|")[1]! : null,
    borough: laneGroupId ? laneGroupId.split("|")[0]! : null,
    path_source: input.pathSource ?? "historical_schedule_timepoint_pattern",
    temporal_lag_days: 0,
    stop_coordinate_coverage: input.coverage ?? 1,
    route_miles: 5,
    overlap_miles: input.verdict === "traversal_confirmed" ? 1 : 0,
    overlap_share: input.verdict === "traversal_confirmed" ? 0.2 : 0,
    span: { first_stop_id: "A", last_stop_id: "B", stop_ids: ["A", "B"] },
    lane_attributes: [],
    verdict_class: input.verdict ?? "geometry_ambiguous",
    reason: input.reason ?? "fixture_reason",
    snapshot_ids: ["lanes"],
    generated_from: { registry_sha256: "a".repeat(64) },
    params: LANE_TRAVERSAL_PARAMS,
    inputs: {
      gtfs_snapshot_ids: ["gtfs"],
      lane_snapshot_id: "lanes",
      schedule_snapshot_ids: ["schedule"],
      candidate_ledger: { path: "bridge.jsonl", sha256: "b".repeat(64) },
      tracker_input: { path: "tracker.json", sha256: "c".repeat(64) },
    },
  };
}

function candidate(candidateId: string, routeId: string, date: string) {
  return {
    bridge: {
      candidate_id: candidateId,
      candidate_route_id: routeId,
      downstream_disposition: "source_fixable_bus_lane_occurrence_identity",
      identity: `${routeId}|bus_lane|${date}|day`,
    },
    tracker: { candidate_id: candidateId, route_id: routeId, implementation_date: date, date_precision: "day" },
  };
}

const anchor = (routeId: string) => ({
  aliases: [routeId], canonical_route_record_id: `route_${routeId.toLowerCase()}`,
  disposition: "exact_service", gtfs_route_id: routeId,
});

describe("bus-lane identity exact-date targeting", () => {
  it("splits comma chronologies, preserves literals, and retains every exact-date lane group", () => {
    expect(normalizeOpenDateToken(" 12/05/24 ")).toBe("2024-12-05");
    expect(normalizeOpenDateToken("02/29/23")).toBeNull();
    const targets = candidateLaneTargets([
      lane({ feature_id: "one", lane_group_id: "MAN|2 AVENUE", opened: "7/28/82,10/10/10, 12/05/24",
        attributes: { open_dates: "7/28/82,10/10/10, 12/05/24", sbs_route1: "M15" } }),
      lane({ feature_id: "two", lane_group_id: "MAN|1 AVENUE", opened: "12/05/2024" }),
      lane({ feature_id: "three", lane_group_id: "MAN|OTHER", opened: "12/06/24" }),
    ], "2024-12-05");
    expect(targets.map((target) => target.lane_group_id)).toEqual(["MAN|1 AVENUE", "MAN|2 AVENUE"]);
    expect(targets[1]!.feature_matches[0]).toMatchObject({
      open_dates_literal: "7/28/82,10/10/10, 12/05/24",
      matched_token_literal: "12/05/24",
      matched_date: "2024-12-05",
      sbs_routes: ["M15"],
    });
    expect(targets[1]!.geometry_scope).toBe("mixed_date_feature_union");
  });

  it("classifies only exact-date target evidence and replays a pinned review decision", () => {
    const ready = candidate("candidate-ready", "Q1", "2025-05-01");
    const negative = candidate("candidate-negative", "Q2", "2026-05-01");
    const ambiguous = candidate("candidate-ambiguous", "Q3", "2025-05-01");
    const missing = candidate("candidate-missing", "Q4", "2015-05-27");
    const duplicate = candidate("candidate-ready-duplicate", "Q1", "2025-05-01");
    const features = [
      lane({ feature_id: "target", lane_group_id: "QNS|TEST STREET", opened: "5/1/25" }),
      lane({ feature_id: "target-current", lane_group_id: "QNS|CURRENT STREET", opened: "5/1/26" }),
    ];
    const common = {
      bridgeCandidates: [ready.bridge, negative.bridge, ambiguous.bridge, missing.bridge, duplicate.bridge],
      trackerCandidates: [ready.tracker, negative.tracker, ambiguous.tracker, missing.tracker, duplicate.tracker],
      routeAnchors: [anchor("Q1"), anchor("Q2"), anchor("Q3"), anchor("Q4")],
      dossierRows: [
        dossier({ candidateId: ready.bridge.candidate_id, routeId: "Q1", date: "2025-05-01", verdict: "traversal_confirmed" }),
        dossier({ candidateId: duplicate.bridge.candidate_id, routeId: "Q1", date: "2025-05-01", verdict: "traversal_confirmed" }),
        dossier({ candidateId: negative.bridge.candidate_id, routeId: "Q2", date: "2026-05-01", laneGroupId: "QNS|OTHER", pathSource: "gtfs_shape" }),
        dossier({ candidateId: ambiguous.bridge.candidate_id, routeId: "Q3", date: "2025-05-01", reason: "same_direction_shape_variants_disagree_on_lane_identity" }),
        dossier({ candidateId: missing.bridge.candidate_id, routeId: "Q4", date: "2015-05-27", laneGroupId: null,
          pathSource: "unavailable", pathIdentity: null, reason: "historical_schedule_unavailable_pre_2023" }),
      ],
      dossierArtifact: "dossier.jsonl",
      laneFeatures: features,
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    };
    const first = buildBusLaneIdentityLedger(common);
    expect(first.find((row) => row.candidate_id === "candidate-ready")?.verdict).toBe("occurrence_ready");
    expect(first.find((row) => row.candidate_id === "candidate-ready-duplicate")?.verdict).toBe("superseded_duplicate");
    expect(first.find((row) => row.candidate_id === "candidate-negative")?.verdict).toBe("refuted_no_traversal");
    expect(first.find((row) => row.candidate_id === "candidate-ambiguous")?.verdict).toBe("traversal_marginal_or_ambiguous");
    expect(first.find((row) => row.candidate_id === "candidate-missing")?.verdict).toBe("unreviewed");

    const row = first.find((entry) => entry.candidate_id === "candidate-ambiguous")!;
    const decision = parseBusLaneIdentityDecision({
      schema_version: 1,
      contract_id: "bus-lane-identity-v1",
      decision_id: "decision-q3",
      ledger_id: row.ledger_id,
      candidate_id: row.candidate_id,
      candidate_fingerprint: row.candidate_fingerprint,
      verdict: "refuted_wrong_route_attribution",
      occurrence_id: null,
      receipt_ids: ["receipt-q3"],
      unresolved_bindings: [],
      reviewed_at: "2026-07-23",
      reviewed_by: "fixture-reviewer",
      rationale: "Exact official evidence binds a different service identity.",
      authorizes_study: false,
      authorizes_cross_product: false,
    } satisfies BusLaneIdentityDecision as unknown as JsonValue);
    const replayed = buildBusLaneIdentityLedger({ ...common, decisions: [decision] });
    expect(replayed.find((entry) => entry.candidate_id === row.candidate_id)).toMatchObject({
      verdict: "refuted_wrong_route_attribution",
      verdict_basis: "review:decision-q3",
      receipt_ids: ["receipt-q3"],
      updated_at: "2026-07-23",
    });
    const issued = buildBusLaneResearchPackets(first);
    const closed = buildBusLaneResearchPackets(replayed);
    expect(issued.packets.map((packet) => packet.candidate_id).sort()).toEqual(["candidate-ambiguous", "candidate-missing"]);
    expect(closed.packets.find((packet) => packet.candidate_id === row.candidate_id)?.disposition)
      .toBe("closed:refuted_wrong_route_attribution");
    expect(stableJson(buildBusLaneResearchPackets(replayed) as unknown as JsonValue))
      .toBe(stableJson(closed as unknown as JsonValue));
    const created = [{ ...row, verdict: "occurrence_created:occurrence-ok" as const }];
    const occurrence = {
      occurrence_id: "occurrence-ok",
      review_state: "approved",
      occurrence_review_decision_id: "review-ok",
      routes: [{
        gtfs_route_id: row.gtfs_route_id,
        route_record_id: row.route_record_id,
        evidence_bindings: [{ source_id: "route-source", block_id: "route-block" }],
      }],
      resolved_onset: {
        date: row.implementation_date,
        precision: "day",
        evidence_bindings: [{ source_id: "date-source", block_id: "date-block" }],
      },
      treatment: {
        kind: "atomic",
        member: {
          treatment_family: "bus_lane",
          evidence_bindings: [{ source_id: "treatment-source", block_id: "treatment-block" }],
        },
      },
    };
    const occurrenceDecision = { occurrence_id: "occurrence-ok", review_state: "approved", decision_id: "review-ok" };
    expect(() => validateOccurrenceCreatedRows(created, [occurrence], [occurrenceDecision])).not.toThrow();
    expect(() => validateOccurrenceCreatedRows(created, [], [occurrenceDecision])).toThrow("missing occurrence");
    expect(() => validateOccurrenceCreatedRows(created, [occurrence], [])).toThrow("no accepted occurrence-review decision");
    expect(() => validateOccurrenceCreatedRows(created, [{ ...occurrence, routes: [] }], [occurrenceDecision]))
      .toThrow("lacks this evidence-bound route identity");
    expect(() => validateOccurrenceCreatedRows(created, [{ ...occurrence, resolved_onset: {
      ...occurrence.resolved_onset,
      precision: "month",
    } }], [occurrenceDecision])).toThrow("lacks the exact evidence-bound candidate onset");
    expect(() => validateOccurrenceCreatedRows(created, [{ ...occurrence, treatment: {
      kind: "atomic",
      member: { treatment_family: "bus_lane", evidence_bindings: [] },
    } }], [occurrenceDecision])).toThrow("lacks an evidence-bound bus_lane treatment member");
  });

  it("projects mixed chronologies as feature-extent and phase binding gaps", () => {
    const entry = candidate("mixed-chronology", "Q1", "2024-12-05");
    const rows = buildBusLaneIdentityLedger({
      bridgeCandidates: [entry.bridge],
      trackerCandidates: [entry.tracker],
      routeAnchors: [anchor("Q1")],
      dossierRows: [dossier({
        candidateId: entry.bridge.candidate_id,
        routeId: "Q1",
        date: "2024-12-05",
        laneGroupId: "MAN|2 AVENUE",
      })],
      dossierArtifact: "dossier.jsonl",
      laneFeatures: [lane({
        feature_id: "mixed-target",
        lane_group_id: "MAN|2 AVENUE",
        opened: "7/28/82,10/10/10, 12/05/24",
        direction: "N",
        attributes: { open_dates: "7/28/82,10/10/10, 12/05/24", sbs_route1: "M15" },
      })],
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    });
    const packet = buildBusLaneResearchPackets(rows).packets[0]!;
    expect(packet.missing_binding).toBe("feature_extent");
    expect(packet.unresolved_bindings).toEqual(["attribution", "feature_extent", "phase", "traversal"]);
  });

  it("fails closed on direction and attribution when a bidirectional target has no target-specific path row", () => {
    const entry = candidate("bidirectional-gap", "B1", "2025-10-02");
    const rows = buildBusLaneIdentityLedger({
      bridgeCandidates: [entry.bridge],
      trackerCandidates: [entry.tracker],
      routeAnchors: [anchor("B1")],
      dossierRows: [dossier({
        candidateId: entry.bridge.candidate_id,
        routeId: "B1",
        date: "2025-10-02",
        laneGroupId: null,
        pathSource: "unavailable",
      })],
      dossierArtifact: "dossier.jsonl",
      laneFeatures: [
        lane({ feature_id: "north", lane_group_id: "BK|FLATBUSH AVENUE", opened: "10/2/2025", direction: "NB" }),
        lane({ feature_id: "south", lane_group_id: "BK|FLATBUSH AVENUE", opened: "10/2/2025", direction: "SB" }),
        lane({ feature_id: "older", lane_group_id: "BK|FLATBUSH AVENUE", opened: "1/1/2020", direction: "SB" }),
      ],
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    });
    const packet = buildBusLaneResearchPackets(rows).packets[0]!;
    expect(packet.missing_binding).toBe("feature_extent");
    expect(packet.unresolved_bindings).toEqual([
      "attribution", "direction", "feature_extent", "phase", "traversal",
    ]);
  });

  it("resolves attribution only when exact target features positively name the candidate route", () => {
    const packetFor = (candidateId: string, namedRoute?: string) => {
      const entry = candidate(candidateId, "Q1", "2025-05-01");
      const attributes: Record<string, string | null> = { open_dates: "5/1/25" };
      if (namedRoute) attributes.sbs_route1 = namedRoute;
      const rows = buildBusLaneIdentityLedger({
        bridgeCandidates: [entry.bridge],
        trackerCandidates: [entry.tracker],
        routeAnchors: [anchor("Q1")],
        dossierRows: [dossier({
          candidateId: entry.bridge.candidate_id,
          routeId: "Q1",
          date: "2025-05-01",
          laneGroupId: null,
          pathSource: "unavailable",
        })],
        dossierArtifact: "dossier.jsonl",
        laneFeatures: [lane({
          feature_id: "target",
          lane_group_id: "QNS|TEST STREET",
          opened: "5/1/25",
          direction: "NB",
          attributes,
        })],
        laneSnapshotId: "lanes",
        laneSourceId: "lane_source",
        gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
      });
      return buildBusLaneResearchPackets(rows).packets[0]!;
    };
    expect(packetFor("unnamed-target").unresolved_bindings).toEqual(["attribution", "traversal"]);
    expect(packetFor("candidate-named", "Q1").unresolved_bindings).toEqual(["traversal"]);
    expect(packetFor("different-route-named", "Q2").unresolved_bindings).toEqual(["attribution", "traversal"]);
  });

  it("never uses a current shape for a historical positive or negative and rejects low-coverage negatives", () => {
    const positive = candidate("historical-positive", "Q1", "2020-05-01");
    const negative = candidate("historical-negative", "Q2", "2020-05-01");
    const lowCoverage = candidate("low-coverage-negative", "Q3", "2026-05-01");
    const rows = buildBusLaneIdentityLedger({
      bridgeCandidates: [positive.bridge, negative.bridge, lowCoverage.bridge],
      trackerCandidates: [positive.tracker, negative.tracker, lowCoverage.tracker],
      routeAnchors: [anchor("Q1"), anchor("Q2"), anchor("Q3")],
      dossierRows: [
        dossier({ candidateId: positive.bridge.candidate_id, routeId: "Q1", date: "2020-05-01",
          verdict: "traversal_confirmed", pathSource: "gtfs_shape" }),
        dossier({ candidateId: negative.bridge.candidate_id, routeId: "Q2", date: "2020-05-01",
          laneGroupId: "QNS|OTHER", pathSource: "gtfs_shape" }),
        dossier({ candidateId: lowCoverage.bridge.candidate_id, routeId: "Q3", date: "2026-05-01",
          verdict: "no_traversal", pathSource: "gtfs_shape", coverage: 0.5, laneGroupId: "QNS|CURRENT STREET" }),
      ],
      dossierArtifact: "dossier.jsonl",
      laneFeatures: [
        lane({ feature_id: "historical", lane_group_id: "QNS|TEST STREET", opened: "5/1/20" }),
        lane({ feature_id: "current", lane_group_id: "QNS|CURRENT STREET", opened: "5/1/26" }),
      ],
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    });
    expect(rows.map((row) => row.verdict)).toEqual([
      "traversal_marginal_or_ambiguous",
      "traversal_marginal_or_ambiguous",
      "traversal_marginal_or_ambiguous",
    ]);
  });

  it("generates one open packet per row and splits corridor assignments at 25", () => {
    const features = [
      lane({ feature_id: "target", lane_group_id: "QNS|TEST STREET", opened: "5/1/25" }),
      lane({ feature_id: "target-2", lane_group_id: "QNS|SECOND STREET", opened: "5/1/25" }),
    ];
    const candidates = Array.from({ length: 27 }, (_, index) => candidate(`candidate-${index}`, `Q${index + 1}`, "2025-05-01"));
    const rows = buildBusLaneIdentityLedger({
      bridgeCandidates: candidates.map((entry) => entry.bridge),
      trackerCandidates: candidates.map((entry) => entry.tracker),
      routeAnchors: candidates.map((entry) => anchor(entry.bridge.candidate_route_id)),
      dossierRows: candidates.map((entry) => dossier({
        candidateId: entry.bridge.candidate_id,
        routeId: entry.bridge.candidate_route_id,
        date: "2025-05-01",
      })),
      dossierArtifact: "dossier.jsonl",
      laneFeatures: features,
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    });
    const packets = buildBusLaneResearchPackets(rows);
    expect(packets.packets).toHaveLength(27);
    expect(packets.batches.map((batch) => batch.packet_ids.length)).toEqual([25, 2]);
    expect(packets.corridorKeyCount).toBe(2);
    expect(packets.batches.every((batch) => batch.batch_kind === "multi_corridor")).toBe(true);
    expect(packets.packets.every((packet) => packet.batch_ids.length === 1)).toBe(true);
    expect(packets.packets.every((packet) => packet.missing_binding === "traversal")).toBe(true);
    expect(packets.packets.every((packet) => packet.unresolved_bindings.includes("traversal"))).toBe(true);
    expect(new Set(packets.batches.flatMap((batch) => batch.packet_ids)).size).toBe(27);
  });

  it("rejects absent-after-search decisions without a receipt", () => {
    expect(() => parseBusLaneIdentityDecision({
      schema_version: 1, contract_id: "bus-lane-identity-v1", decision_id: "bad", ledger_id: "row",
      candidate_id: "candidate", candidate_fingerprint: "f".repeat(64), verdict: "onset_absent_after_search",
      occurrence_id: null, receipt_ids: [], unresolved_bindings: ["onset"],
      reviewed_at: "2026-07-23", reviewed_by: "reviewer",
      rationale: "No source found.", authorizes_study: false, authorizes_cross_product: false,
    })).toThrow("requires at least one receipt");
  });

  it("requires receipt-bound unresolved bindings and preserves the packet primary binding", () => {
    const entry = candidate("binding-absent", "Q1", "2025-05-01");
    const input = {
      bridgeCandidates: [entry.bridge],
      trackerCandidates: [entry.tracker],
      routeAnchors: [anchor("Q1")],
      dossierRows: [dossier({ candidateId: entry.bridge.candidate_id, routeId: "Q1", date: "2025-05-01" })],
      dossierArtifact: "dossier.jsonl",
      laneFeatures: [lane({ feature_id: "target", lane_group_id: "QNS|TEST STREET", opened: "5/1/25" })],
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    };
    const base = buildBusLaneIdentityLedger(input)[0]!;
    const decision = parseBusLaneIdentityDecision({
      schema_version: 1,
      contract_id: "bus-lane-identity-v1",
      decision_id: "binding-review",
      ledger_id: base.ledger_id,
      candidate_id: base.candidate_id,
      candidate_fingerprint: base.candidate_fingerprint,
      verdict: "binding_absent_after_search",
      occurrence_id: null,
      receipt_ids: ["binding-receipt"],
      unresolved_bindings: ["phase", "traversal"],
      reviewed_at: "2026-07-23",
      reviewed_by: "reviewer",
      rationale: "Exhaustive official-source search left the path and phase unresolved.",
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    const reviewed = buildBusLaneIdentityLedger({ ...input, decisions: [decision] })[0]!;
    const receiptDir = mkdtempSync(join(tmpdir(), "bus-lane-binding-receipt-"));
    try {
      writeFileSync(join(receiptDir, "receipt.json"), JSON.stringify({
        receipt_id: "binding-receipt",
        candidate_id: reviewed.candidate_id,
        candidate_fingerprint: reviewed.candidate_fingerprint,
        implementation_date: reviewed.implementation_date,
        missing_binding: "traversal",
        unresolved_bindings: ["phase", "traversal"],
        search: { urls_inspected: ["https://www.nyc.gov/example"] },
      }));
      expect(() => validateReviewedReceiptRefs([reviewed], receiptDir)).not.toThrow();
      expect(() => validateReviewedReceiptRefs([{ ...reviewed,
        verdict: "refuted_wrong_route_attribution", unresolved_bindings: [],
      }], receiptDir)).toThrow("lacks exclusive exact-date route evidence");
      const missingPrimary = { ...reviewed, unresolved_bindings: ["phase"] as const };
      writeFileSync(join(receiptDir, "receipt.json"), JSON.stringify({
        receipt_id: "binding-receipt",
        candidate_id: reviewed.candidate_id,
        candidate_fingerprint: reviewed.candidate_fingerprint,
        implementation_date: reviewed.implementation_date,
        missing_binding: "phase",
        unresolved_bindings: ["phase"],
        search: { urls_inspected: ["https://www.nyc.gov/example"] },
      }));
      expect(() => validateReviewedReceiptRefs([missingPrimary], receiptDir))
        .toThrow("packet primary missing_binding is not preserved");
    } finally {
      rmSync(receiptDir, { recursive: true, force: true });
    }
    expect(() => parseBusLaneIdentityDecision({ ...decision, decision_id: "bad-binding", unresolved_bindings: ["onset"] }))
      .toThrow("at least one non-onset unresolved binding");
    expect(() => parseBusLaneIdentityDecision({ ...decision, decision_id: "bad-onset",
      verdict: "onset_absent_after_search", unresolved_bindings: ["onset", "traversal"] }))
      .toThrow("requires exactly unresolved_bindings");
  });

  it("rejects a normalized binding receipt whose self-contained target was tampered", () => {
    const entry = candidate("receipt-target", "Q1", "2025-05-01");
    const base = buildBusLaneIdentityLedger({
      bridgeCandidates: [entry.bridge],
      trackerCandidates: [entry.tracker],
      routeAnchors: [anchor("Q1")],
      dossierRows: [dossier({ candidateId: entry.bridge.candidate_id, routeId: "Q1", date: "2025-05-01" })],
      dossierArtifact: "dossier.jsonl",
      laneFeatures: [lane({ feature_id: "target", lane_group_id: "QNS|TEST STREET", opened: "5/1/25" })],
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    })[0]!;
    const prior = {
      receipt_id: "prior-receipt",
      researched_on: "2026-07-15",
      source_findings: { exact_project_route_statement_found: false },
      acquisition_attempts: [{
        category: "official_nyc_dot_lane_project",
        query: "exact test query",
        query_status: "performed_2026-07-15",
        urls_checked: ["https://www.nyc.gov/example"],
        retrievals: [{ id: "example", retrieved_on: "2026-07-15", sha256: "a".repeat(64), status: "acquired" }],
      }],
    };
    const priorLine = stableJson(prior as unknown as JsonValue);
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-binding-draft-"));
    const receiptDir = join(rootDir, "receipts");
    mkdirSync(receiptDir);
    writeFileSync(join(rootDir, "prior.jsonl"), `${priorLine}\n`);
    const row = {
      ...base,
      prior_acquisition_receipt: {
        receipt_id: "prior-receipt",
        artifact: "prior.jsonl",
        row_sha256: createHash("sha256").update(priorLine).digest("hex"),
        disposition: "completed_search_route_linkage_unresolved",
        next_action: "Reconsider only if authoritative evidence is found.",
      },
    };
    const packet = buildBusLaneResearchPackets([row]).packets[0]!;
    const receipt = {
      schema_version: 1,
      receipt_id: "binding-draft",
      receipt_kind: "binding_absent_after_search",
      candidate_id: row.candidate_id,
      candidate_fingerprint: row.candidate_fingerprint,
      gtfs_route_id: row.gtfs_route_id,
      implementation_date: row.implementation_date,
      gap_ids: [row.ledger_id],
      searched_at: "2026-07-15",
      operator: "fixture-reviewer",
      candidate_urls: [],
      disposition: "binding_absent_after_search",
      missing_binding: packet.missing_binding,
      unresolved_bindings: packet.unresolved_bindings,
      target: {
        lane_group_ids: ["QNS|TEST STREET"],
        feature_ids: ["target"],
        geometry_scopes: ["coextensive_with_lane_group"],
        matched_date: "2025-05-01",
        directions: ["NB"],
        open_dates_literals: ["5/1/25"],
        named_sbs_routes: [],
      },
      prior_receipt: { receipt_id: "prior-receipt", artifact: "prior.jsonl", row_sha256: row.prior_acquisition_receipt.row_sha256 },
      search: {
        exact_queries: [{ category: "official_nyc_dot_lane_project", query: "exact test query", query_status: "performed_2026-07-15" }],
        domains: ["www.nyc.gov"],
        urls_inspected: ["https://www.nyc.gov/example"],
        retrievals: [{ category: "official_nyc_dot_lane_project", id: "example", retrieved_on: "2026-07-15",
          sha256: "a".repeat(64), status: "acquired" }],
        disposition: "binding_absent_after_search",
      },
      authorizes_study: false,
      authorizes_cross_product: false,
    };
    try {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(receipt as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir)).not.toThrow();
      const supplementalSearch = {
        operator: "fixture-reviewer",
        searched_at: "2026-07-23",
        finding_corrections: [],
        exact_queries: [
          { category: "official_nyc_dot_lane_project", query: "site:nyc.gov Q1 exact lane project",
            query_status: "performed_2026-07-23" },
          { category: "official_public_board_committee", query: "site:nyc.gov Q1 exact board committee",
            query_status: "performed_2026-07-23" },
        ],
        domains: ["www.nyc.gov"],
        urls_inspected: ["https://www.nyc.gov/board-example", "https://www.nyc.gov/example"],
        retrievals: [
          { category: "official_nyc_dot_lane_project", url: "https://www.nyc.gov/example",
            retrieved_on: "2026-07-23", status: "acquired", sha256: "b".repeat(64) },
          { category: "official_public_board_committee", url: "https://www.nyc.gov/board-example",
            retrieved_on: "2026-07-23", status: "acquired", sha256: "c".repeat(64) },
        ],
      };
      const acquiredChecksDir = join(rootDir,
        "data/quality/relationship-integrity/bus-lane-acquisition/shards/fixture");
      mkdirSync(acquiredChecksDir, { recursive: true });
      const acquiredSources = [
        { url: "https://www.nyc.gov/example", content_sha256: "b".repeat(64), retrieval_status: "acquired" },
        { url: "https://www.nyc.gov/board-example", content_sha256: "c".repeat(64), retrieval_status: "acquired" },
      ];
      writeFileSync(join(acquiredChecksDir, "acquired-source-checks.json"), JSON.stringify({ sources: acquiredSources }));
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt, supplemental_search: supplementalSearch,
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir)).not.toThrow();
      const stagedSourceDir = join(rootDir, "raw", "sources", "official-project-source");
      mkdirSync(stagedSourceDir, { recursive: true });
      const sourcePdfBytes = Buffer.from("fixture official PDF bytes");
      const correctionSourceHash = createHash("sha256").update(sourcePdfBytes).digest("hex");
      const routeBlockText = "The Q1 route travels through the project intersection.";
      const routeBlockHash = `sha256:${createHash("sha256").update(routeBlockText).digest("hex")}`;
      writeFileSync(join(stagedSourceDir, "source.pdf"), sourcePdfBytes);
      writeFileSync(join(stagedSourceDir, "metadata.json"), JSON.stringify({
        sourceId: "official-project-source",
        sourceUrl: "https://www.nyc.gov/correction-source",
        sha256: `sha256:${correctionSourceHash}`,
      }));
      writeFileSync(join(stagedSourceDir, "blocks.jsonl"), `${JSON.stringify({
        source_id: "official-project-source",
        block_id: "p010_p0001",
        page_number: 10,
        raw_text: routeBlockText,
        normalized_text: routeBlockText,
        raw_text_sha256: routeBlockHash,
      })}\n`);
      const findingCorrection = {
        prior_claim_path: "source_findings.exact_project_route_statement_found",
        prior_claim_value: false,
        supersedes_prior_finding: true,
        source_id: "official-project-source",
        source_url: "https://www.nyc.gov/correction-source",
        source_pdf_sha256: correctionSourceHash,
        evidence_refs: [
          { block_id: "p010_p0001", page_number: 10, text_sha256: routeBlockHash },
        ],
        corrected_finding: {
          candidate_route_id: "Q1",
          finding_kind: "positive_project_intersection_attribution_nonterminal",
          supported_scope: "project_intersection_attribution_only",
          unsupported_bindings: packet.unresolved_bindings,
          finding_summary: "The route is named at the project intersection, without exact feature binding.",
        },
        remaining_unresolved_bindings: packet.unresolved_bindings,
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      writeFileSync(join(acquiredChecksDir, "acquired-source-checks.json"), JSON.stringify({
        sources: [...acquiredSources, {
          url: "https://www.nyc.gov/correction-source",
          content_sha256: correctionSourceHash,
          retrieval_status: "acquired",
        }],
      }));
      const correctionSupplementalSearch = {
        ...supplementalSearch,
        urls_inspected: [...supplementalSearch.urls_inspected, "https://www.nyc.gov/correction-source"].sort(),
        retrievals: [...supplementalSearch.retrievals, {
          category: "official_public_board_committee",
          url: "https://www.nyc.gov/correction-source",
          retrieved_on: "2026-07-23",
          status: "acquired",
          sha256: correctionSourceHash,
        }],
      };
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: { ...correctionSupplementalSearch, finding_corrections: [findingCorrection] },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir)).not.toThrow();
      writeFileSync(join(stagedSourceDir, "blocks.jsonl"), `${JSON.stringify({
        source_id: "official-project-source",
        block_id: "p010_p0001",
        page_number: 10,
        raw_text: "tampered source text",
        normalized_text: routeBlockText,
        raw_text_sha256: routeBlockHash,
      })}\n`);
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("source-block id, page, or text hash does not resolve");
      writeFileSync(join(stagedSourceDir, "blocks.jsonl"), `${JSON.stringify({
        source_id: "official-project-source",
        block_id: "p010_p0001",
        page_number: 10,
        raw_text: routeBlockText,
        normalized_text: routeBlockText,
        raw_text_sha256: routeBlockHash,
      })}\n`);
      const routeOnlyText = "Q1";
      const routeOnlyHash = `sha256:${createHash("sha256").update(routeOnlyText).digest("hex")}`;
      const contextOnlyText = "project intersection";
      const contextOnlyHash = `sha256:${createHash("sha256").update(contextOnlyText).digest("hex")}`;
      writeFileSync(join(stagedSourceDir, "blocks.jsonl"), [
        JSON.stringify({
          source_id: "official-project-source", block_id: "p010_p0001", page_number: 10,
          raw_text: routeOnlyText, normalized_text: routeOnlyText, raw_text_sha256: routeOnlyHash,
        }),
        JSON.stringify({
          source_id: "official-project-source", block_id: "p011_p0001", page_number: 11,
          raw_text: contextOnlyText, normalized_text: contextOnlyText, raw_text_sha256: contextOnlyHash,
        }),
      ].join("\n") + "\n");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...correctionSupplementalSearch,
          finding_corrections: [{
            ...findingCorrection,
            evidence_refs: [
              { block_id: "p010_p0001", page_number: 10, text_sha256: routeOnlyHash },
              { block_id: "p011_p0001", page_number: 11, text_sha256: contextOnlyHash },
            ],
          }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("does not bind the exact route to project-intersection context");
      writeFileSync(join(stagedSourceDir, "blocks.jsonl"), `${JSON.stringify({
        source_id: "official-project-source",
        block_id: "p010_p0001",
        page_number: 10,
        raw_text: routeBlockText,
        normalized_text: routeBlockText,
        raw_text_sha256: routeBlockHash,
      })}\n`);
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...correctionSupplementalSearch,
          finding_corrections: [{ ...findingCorrection, authorizes_study: true }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("correction exceeds its nonauthorizing unresolved-binding scope");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...correctionSupplementalSearch,
          finding_corrections: [{ ...findingCorrection, source_pdf_sha256: "e".repeat(64) }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("staged source metadata, URL, or PDF hash does not resolve");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...supplementalSearch,
          exact_queries: supplementalSearch.exact_queries.map((query, index) =>
            index === 0 ? { ...query, query_status: "not_performed" } : query),
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("supplemental query status does not prove execution on the recorded search day");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...supplementalSearch,
          retrievals: supplementalSearch.retrievals.map((retrieval, index) =>
            index === 0 ? { ...retrieval, sha256: "f".repeat(64) } : retrieval),
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("supplemental acquired retrieval does not resolve in immutable acquisition metadata");
      const notFoundSearch = {
        ...supplementalSearch,
        retrievals: supplementalSearch.retrievals.map((retrieval) => retrieval.category === "official_public_board_committee"
          ? { ...retrieval, status: "not_found", sha256: null }
          : retrieval),
      };
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt, supplemental_search: notFoundSearch,
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir)).not.toThrow();
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: { ...notFoundSearch, retrievals: notFoundSearch.retrievals
          .filter((retrieval) => retrieval.category !== "official_public_board_committee") },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("supplemental retrievals are missing official_public_board_committee");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: { ...notFoundSearch, retrievals: notFoundSearch.retrievals.map((retrieval) =>
          retrieval.category === "official_public_board_committee" ? { ...retrieval, sha256: "c".repeat(64) } : retrieval) },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("does not bind query, URL, status, and hash");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...supplementalSearch,
          exact_queries: supplementalSearch.exact_queries.map((query) => ({ ...query, query: query.query.replace("Q1", "B46") })),
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("does not name the exact candidate route");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt, target: { ...receipt.target, directions: ["SB"] },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("exact target parity failed");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
