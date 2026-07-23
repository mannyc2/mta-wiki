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
      const connectionSourceDir = join(rootDir, "raw", "sources", "official-project-connection-source");
      mkdirSync(connectionSourceDir, { recursive: true });
      const connectionSourceBytes = Buffer.from("<html>fixture official project connection page</html>");
      const connectionSourceHash = createHash("sha256").update(connectionSourceBytes).digest("hex");
      const servedContextText =
        "Third Avenue serves the Q1 bus routes. The project also added an offset bus lane to Third Avenue.";
      const connectionSentenceText =
        "The offset bus lane will provide connections to the Q1 services.";
      const servedScopeText =
        "The new bus lane will benefit the Q9 routes that travel along Third Avenue.";
      const servedContextHash =
        `sha256:${createHash("sha256").update(servedContextText).digest("hex")}`;
      const connectionSentenceHash =
        `sha256:${createHash("sha256").update(connectionSentenceText).digest("hex")}`;
      const servedScopeHash =
        `sha256:${createHash("sha256").update(servedScopeText).digest("hex")}`;
      writeFileSync(join(connectionSourceDir, "source.html"), connectionSourceBytes);
      writeFileSync(join(connectionSourceDir, "metadata.json"), JSON.stringify({
        sourceId: "official-project-connection-source",
        sourceUrl: "https://www.nyc.gov/project-connection-source",
        sha256: `sha256:${connectionSourceHash}`,
      }));
      writeFileSync(join(connectionSourceDir, "blocks.jsonl"), [
        JSON.stringify({
          source_id: "official-project-connection-source",
          block_id: "p001_b0001",
          page_number: 1,
          raw_text: servedContextText,
          normalized_text: servedContextText,
          raw_text_sha256: servedContextHash,
        }),
        JSON.stringify({
          source_id: "official-project-connection-source",
          block_id: "p001_b0002",
          page_number: 1,
          raw_text: connectionSentenceText,
          normalized_text: connectionSentenceText,
          raw_text_sha256: connectionSentenceHash,
        }),
        JSON.stringify({
          source_id: "official-project-connection-source",
          block_id: "p001_b0003",
          page_number: 1,
          raw_text: servedScopeText,
          normalized_text: servedScopeText,
          raw_text_sha256: servedScopeHash,
        }),
      ].join("\n") + "\n");
      const connectionCorrection = {
        prior_claim_path: "source_findings.exact_project_route_statement_found",
        prior_claim_value: false,
        supersedes_prior_finding: true,
        source_id: "official-project-connection-source",
        source_url: "https://www.nyc.gov/project-connection-source",
        source_artifact: "source.html",
        source_content_sha256: connectionSourceHash,
        evidence_refs: [
          { block_id: "p001_b0001", page_number: 1, text_sha256: servedContextHash },
          { block_id: "p001_b0002", page_number: 1, text_sha256: connectionSentenceHash },
          { block_id: "p001_b0003", page_number: 1, text_sha256: servedScopeHash },
        ],
        corrected_finding: {
          candidate_route_id: "Q1",
          finding_kind: "positive_project_connection_nonterminal",
          supported_scope: "project_connection_service_only",
          unsupported_bindings: packet.unresolved_bindings,
          finding_summary:
            "The route is named only as a connection to the project, not as a route served by the lane.",
        },
        remaining_unresolved_bindings: packet.unresolved_bindings,
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      writeFileSync(join(acquiredChecksDir, "acquired-source-checks.json"), JSON.stringify({
        sources: [
          ...acquiredSources,
          {
            url: "https://www.nyc.gov/correction-source",
            content_sha256: correctionSourceHash,
            retrieval_status: "acquired",
          },
          {
            url: "https://www.nyc.gov/project-connection-source",
            content_sha256: connectionSourceHash,
            retrieval_status: "acquired",
          },
        ],
      }));
      const connectionSupplementalSearch = {
        ...correctionSupplementalSearch,
        urls_inspected: [
          ...correctionSupplementalSearch.urls_inspected,
          "https://www.nyc.gov/project-connection-source",
        ].sort(),
        retrievals: [...correctionSupplementalSearch.retrievals, {
          category: "official_nyc_dot_lane_project",
          url: "https://www.nyc.gov/project-connection-source",
          retrieved_on: "2026-07-23",
          status: "acquired",
          sha256: connectionSourceHash,
        }],
      };
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...connectionSupplementalSearch,
          finding_corrections: [connectionCorrection],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir)).not.toThrow();
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...connectionSupplementalSearch,
          finding_corrections: [{
            ...connectionCorrection,
            evidence_refs: [
              { block_id: "p001_b0001", page_number: 1, text_sha256: servedContextHash },
              { block_id: "p001_b0003", page_number: 1, text_sha256: servedScopeHash },
            ],
          }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("does not bind the exact route to its typed project context");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...connectionSupplementalSearch,
          finding_corrections: [{
            ...connectionCorrection,
            corrected_finding: {
              ...connectionCorrection.corrected_finding,
              finding_kind: "positive_project_intersection_attribution_nonterminal",
            },
          }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("does not bind the exact route to its typed project context");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...connectionSupplementalSearch,
          finding_corrections: [{
            ...connectionCorrection,
            source_artifact: "source.pdf",
          }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("source artifact does not match its hash field");
      const corridorSourceDir = join(rootDir, "raw", "sources", "official-upper-corridor-source");
      mkdirSync(corridorSourceDir, { recursive: true });
      const corridorSourceBytes = Buffer.from("fixture official upper-corridor PDF bytes");
      const corridorSourceHash = createHash("sha256").update(corridorSourceBytes).digest("hex");
      const corridorTitleText = "3rd Ave, E 96th St to E 128th St";
      const corridorProposalText = "Complete Street Review";
      const corridorServedText = "Served by Q1 local bus routes as well as Q2,";
      const corridorServedContinuationText = "Q3 express bus routes";
      const corridorConnectionText = "Critical northbound service with connections to Q1, Q4";
      const corridorTitleHash =
        `sha256:${createHash("sha256").update(corridorTitleText).digest("hex")}`;
      const corridorProposalHash =
        `sha256:${createHash("sha256").update(corridorProposalText).digest("hex")}`;
      const corridorServedHash =
        `sha256:${createHash("sha256").update(corridorServedText).digest("hex")}`;
      const corridorServedContinuationHash =
        `sha256:${createHash("sha256").update(corridorServedContinuationText).digest("hex")}`;
      const corridorConnectionHash =
        `sha256:${createHash("sha256").update(corridorConnectionText).digest("hex")}`;
      writeFileSync(join(corridorSourceDir, "source.pdf"), corridorSourceBytes);
      writeFileSync(join(corridorSourceDir, "metadata.json"), JSON.stringify({
        sourceId: "official-upper-corridor-source",
        sourceUrl: "https://www.nyc.gov/upper-corridor-source",
        sha256: `sha256:${corridorSourceHash}`,
        title: "3rd Avenue, East 96th Street to East 128th Street Existing Conditions",
      }));
      writeFileSync(join(corridorSourceDir, "blocks.jsonl"), [
        {
          source_id: "official-upper-corridor-source",
          block_id: "p001_b0001",
          page_number: 1,
          raw_text: corridorTitleText,
          normalized_text: corridorTitleText,
          raw_text_sha256: corridorTitleHash,
        },
        {
          source_id: "official-upper-corridor-source",
          block_id: "p001_b0002",
          page_number: 1,
          raw_text: corridorProposalText,
          normalized_text: corridorProposalText,
          raw_text_sha256: corridorProposalHash,
        },
        {
          source_id: "official-upper-corridor-source",
          block_id: "p004_b0001",
          page_number: 4,
          raw_text: corridorServedText,
          normalized_text: corridorServedText,
          raw_text_sha256: corridorServedHash,
        },
        {
          source_id: "official-upper-corridor-source",
          block_id: "p004_b0002",
          page_number: 4,
          raw_text: corridorServedContinuationText,
          normalized_text: corridorServedContinuationText,
          raw_text_sha256: corridorServedContinuationHash,
        },
        {
          source_id: "official-upper-corridor-source",
          block_id: "p004_b0003",
          page_number: 4,
          raw_text: corridorConnectionText,
          normalized_text: corridorConnectionText,
          raw_text_sha256: corridorConnectionHash,
        },
      ].map((block) => JSON.stringify(block)).join("\n") + "\n");
      const corridorEvidenceRefs = [
        { block_id: "p001_b0001", page_number: 1, text_sha256: corridorTitleHash },
        { block_id: "p001_b0002", page_number: 1, text_sha256: corridorProposalHash },
        { block_id: "p004_b0001", page_number: 4, text_sha256: corridorServedHash },
        {
          block_id: "p004_b0002",
          page_number: 4,
          text_sha256: corridorServedContinuationHash,
        },
        { block_id: "p004_b0003", page_number: 4, text_sha256: corridorConnectionHash },
      ];
      const corridorServiceCorrection = {
        prior_claim_path: "source_findings.exact_project_route_statement_found",
        prior_claim_value: false,
        supersedes_prior_finding: true,
        source_id: "official-upper-corridor-source",
        source_url: "https://www.nyc.gov/upper-corridor-source",
        source_pdf_sha256: corridorSourceHash,
        evidence_refs: corridorEvidenceRefs,
        corrected_finding: {
          candidate_route_id: "Q1",
          finding_kind: "positive_project_corridor_service_nonterminal",
          supported_scope: "project_corridor_service_only",
          unsupported_bindings: packet.unresolved_bindings,
          finding_summary:
            "The route is named among services on the broader corridor, not exact candidate feature rows.",
        },
        remaining_unresolved_bindings: packet.unresolved_bindings,
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      writeFileSync(join(acquiredChecksDir, "acquired-source-checks.json"), JSON.stringify({
        sources: [
          ...acquiredSources,
          {
            url: "https://www.nyc.gov/correction-source",
            content_sha256: correctionSourceHash,
            retrieval_status: "acquired",
          },
          {
            url: "https://www.nyc.gov/project-connection-source",
            content_sha256: connectionSourceHash,
            retrieval_status: "acquired",
          },
          {
            url: "https://www.nyc.gov/upper-corridor-source",
            content_sha256: corridorSourceHash,
            retrieval_status: "acquired",
          },
        ],
      }));
      const corridorSupplementalSearch = {
        ...connectionSupplementalSearch,
        urls_inspected: [
          ...connectionSupplementalSearch.urls_inspected,
          "https://www.nyc.gov/upper-corridor-source",
        ].sort(),
        retrievals: [...connectionSupplementalSearch.retrievals, {
          category: "official_public_board_committee",
          url: "https://www.nyc.gov/upper-corridor-source",
          retrieved_on: "2026-07-23",
          status: "acquired",
          sha256: corridorSourceHash,
        }],
      };
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...corridorSupplementalSearch,
          finding_corrections: [corridorServiceCorrection],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir)).not.toThrow();
      const positivePrior = {
        ...prior,
        receipt_id: "positive-prior-receipt",
        source_findings: { exact_project_route_statement_found: true },
      };
      const positivePriorLine = stableJson(positivePrior as unknown as JsonValue);
      writeFileSync(join(rootDir, "positive-prior.jsonl"), `${positivePriorLine}\n`);
      const positiveRow = {
        ...row,
        prior_acquisition_receipt: {
          ...row.prior_acquisition_receipt,
          receipt_id: "positive-prior-receipt",
          artifact: "positive-prior.jsonl",
          row_sha256: createHash("sha256").update(positivePriorLine).digest("hex"),
        },
      };
      const positivePacket = buildBusLaneResearchPackets([positiveRow]).packets[0]!;
      const projectCorridorPositiveContext = {
        source_id: "official-upper-corridor-source",
        source_url: "https://www.nyc.gov/upper-corridor-source",
        source_pdf_sha256: corridorSourceHash,
        evidence_refs: corridorEvidenceRefs,
        context_finding: {
          candidate_route_id: "Q1",
          finding_kind: "positive_project_corridor_service_nonterminal",
          supported_scope: "project_corridor_service_only",
          unsupported_bindings: positivePacket.unresolved_bindings,
          finding_summary:
            "The route is already recorded as serving the broader project corridor, not exact feature rows.",
        },
        remaining_unresolved_bindings: positivePacket.unresolved_bindings,
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      const positiveReceipt = {
        ...receipt,
        prior_receipt: {
          receipt_id: "positive-prior-receipt",
          artifact: "positive-prior.jsonl",
          row_sha256: positiveRow.prior_acquisition_receipt.row_sha256,
        },
        supplemental_search: {
          ...corridorSupplementalSearch,
          finding_corrections: [],
          positive_context_findings: [projectCorridorPositiveContext],
        },
      };
      writeFileSync(join(receiptDir, "draft.json"), stableJson(positiveReceipt as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts(
        [positiveRow], [positivePacket], receiptDir, rootDir,
      )).not.toThrow();
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...positiveReceipt,
        supplemental_search: {
          ...positiveReceipt.supplemental_search,
          positive_context_findings: [{ ...projectCorridorPositiveContext, authorizes_study: true }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts(
        [positiveRow], [positivePacket], receiptDir, rootDir,
      )).toThrow("positive context exceeds its nonauthorizing project-corridor scope");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...corridorSupplementalSearch,
          finding_corrections: [],
          positive_context_findings: [projectCorridorPositiveContext],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("positive context exceeds its nonauthorizing project-corridor scope");
      const west178SourceDir = join(rootDir, "raw", "sources", "official-west-178-corridor-source");
      mkdirSync(west178SourceDir, { recursive: true });
      const west178SourceBytes = Buffer.from("fixture official West 178 corridor PDF bytes");
      const west178SourceHash = createHash("sha256").update(west178SourceBytes).digest("hex");
      const west178Blocks = [
        { block_id: "p002_b0001", page_number: 2, raw_text: "Project Location" },
        { block_id: "p002_b0002", page_number: 2, raw_text: "Project limits: W 178th St, from" },
        { block_id: "p002_b0003", page_number: 2, raw_text: "Ft Washington Ave to" },
        { block_id: "p002_b0004", page_number: 2, raw_text: "Wadsworth Ave; 0.2 miles" },
        { block_id: "p002_b0005", page_number: 2, raw_text: "Q1, Q2 bus routes" },
        { block_id: "p002_b0006", page_number: 2, raw_text: "Q10 bus routes" },
        { block_id: "p009_b0001", page_number: 9, raw_text: "Bus Only Lane on W 178th" },
        { block_id: "p009_b0002", page_number: 9, raw_text: "St between Ft Washington" },
        { block_id: "p009_b0003", page_number: 9, raw_text: "Ave to Wadsworth Ave" },
      ].map((block) => ({
        source_id: "official-west-178-corridor-source",
        normalized_text: block.raw_text,
        raw_text_sha256: `sha256:${createHash("sha256").update(block.raw_text).digest("hex")}`,
        ...block,
      }));
      writeFileSync(join(west178SourceDir, "source.pdf"), west178SourceBytes);
      writeFileSync(join(west178SourceDir, "metadata.json"), JSON.stringify({
        sourceId: "official-west-178-corridor-source",
        sourceUrl: "https://www.nyc.gov/west-178-corridor-source",
        sha256: `sha256:${west178SourceHash}`,
        title: "W 178 St (Ft Washington Ave to Wadsworth Ave)",
      }));
      writeFileSync(join(west178SourceDir, "blocks.jsonl"),
        west178Blocks.map((block) => JSON.stringify(block)).join("\n") + "\n");
      const west178EvidenceRefs = west178Blocks
        .filter((block) => block.block_id !== "p002_b0006")
        .map((block) => ({
          block_id: block.block_id,
          page_number: block.page_number,
          text_sha256: block.raw_text_sha256,
        }));
      const west178Correction = {
        ...corridorServiceCorrection,
        source_id: "official-west-178-corridor-source",
        source_url: "https://www.nyc.gov/west-178-corridor-source",
        source_pdf_sha256: west178SourceHash,
        evidence_refs: west178EvidenceRefs,
        corrected_finding: {
          ...corridorServiceCorrection.corrected_finding,
          finding_summary:
            "The route is named among bus routes in the exact project area, without row or direction traversal proof.",
        },
      };
      const west178SupplementalSearch = {
        ...supplementalSearch,
        urls_inspected: [
          ...supplementalSearch.urls_inspected,
          "https://www.nyc.gov/west-178-corridor-source",
        ].sort(),
        retrievals: [...supplementalSearch.retrievals, {
          category: "official_public_board_committee",
          url: "https://www.nyc.gov/west-178-corridor-source",
          retrieved_on: "2026-07-23",
          status: "acquired",
          sha256: west178SourceHash,
        }],
      };
      writeFileSync(join(acquiredChecksDir, "acquired-source-checks.json"), JSON.stringify({
        sources: [
          ...acquiredSources,
          {
            url: "https://www.nyc.gov/correction-source",
            content_sha256: correctionSourceHash,
            retrieval_status: "acquired",
          },
          {
            url: "https://www.nyc.gov/project-connection-source",
            content_sha256: connectionSourceHash,
            retrieval_status: "acquired",
          },
          {
            url: "https://www.nyc.gov/upper-corridor-source",
            content_sha256: corridorSourceHash,
            retrieval_status: "acquired",
          },
          {
            url: "https://www.nyc.gov/west-178-corridor-source",
            content_sha256: west178SourceHash,
            retrieval_status: "acquired",
          },
        ],
      }));
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...west178SupplementalSearch,
          finding_corrections: [west178Correction],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir)).not.toThrow();
      const west178PositiveContext = {
        source_id: "official-west-178-corridor-source",
        source_url: "https://www.nyc.gov/west-178-corridor-source",
        source_pdf_sha256: west178SourceHash,
        evidence_refs: west178EvidenceRefs,
        context_finding: {
          candidate_route_id: "Q1",
          finding_kind: "positive_project_corridor_service_nonterminal",
          supported_scope: "project_corridor_service_only",
          unsupported_bindings: positivePacket.unresolved_bindings,
          finding_summary:
            "The route is already recorded among bus routes in the exact project area, without row traversal proof.",
        },
        remaining_unresolved_bindings: positivePacket.unresolved_bindings,
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...positiveReceipt,
        supplemental_search: {
          ...west178SupplementalSearch,
          finding_corrections: [],
          positive_context_findings: [west178PositiveContext],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts(
        [positiveRow], [positivePacket], receiptDir, rootDir,
      )).not.toThrow();
      const west178AliasEvidenceRefs = west178Blocks
        .filter((block) => block.block_id !== "p002_b0005")
        .map((block) => ({
          block_id: block.block_id,
          page_number: block.page_number,
          text_sha256: block.raw_text_sha256,
        }));
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...west178SupplementalSearch,
          finding_corrections: [{
            ...west178Correction,
            evidence_refs: west178AliasEvidenceRefs,
          }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("does not bind the exact route to its typed project context");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...west178SupplementalSearch,
          finding_corrections: [{
            ...west178Correction,
            evidence_refs: west178EvidenceRefs.filter((ref) => ref.page_number !== 9),
          }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("does not bind the exact route to its typed project context");
      const corridorConnectionCorrection = {
        ...corridorServiceCorrection,
        corrected_finding: {
          ...corridorServiceCorrection.corrected_finding,
          finding_kind: "positive_project_connection_nonterminal",
          supported_scope: "project_connection_service_only",
          finding_summary:
            "The route is named only as a connection to the broader project corridor.",
        },
      };
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...corridorSupplementalSearch,
          finding_corrections: [corridorConnectionCorrection],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir)).not.toThrow();
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...corridorSupplementalSearch,
          finding_corrections: [{
            ...corridorServiceCorrection,
            evidence_refs: [
              { block_id: "p001_b0001", page_number: 1, text_sha256: corridorTitleHash },
              { block_id: "p001_b0002", page_number: 1, text_sha256: corridorProposalHash },
              { block_id: "p004_b0003", page_number: 4, text_sha256: corridorConnectionHash },
            ],
          }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("does not bind the exact route to its typed project context");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...corridorSupplementalSearch,
          finding_corrections: [{
            ...corridorServiceCorrection,
            corrected_finding: {
              ...corridorServiceCorrection.corrected_finding,
              supported_scope: "exact_feature_traversal",
              unsupported_bindings: packet.unresolved_bindings.filter(
                (binding) => binding !== "traversal",
              ),
            },
          }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("does not bind the exact route to its typed project context");
      const secondAvenueSourceDir = join(rootDir, "raw", "sources", "official-second-avenue-source");
      mkdirSync(secondAvenueSourceDir, { recursive: true });
      const secondAvenueSourceBytes = Buffer.from("<html>fixture official Second Avenue redesign page</html>");
      const secondAvenueSourceHash = createHash("sha256").update(secondAvenueSourceBytes).digest("hex");
      const secondAvenueTitleText =
        "NYC DOT Begins Redesign of Manhattan's Second Avenue With Wider Bike Lane and Upgraded Bus Lane";
      const secondAvenueRangeText =
        "Construction has begun to redesign 59 blocks of Second Avenue from 59 Street to Houston Street with an upgraded bus lane.";
      const secondAvenueServiceText =
        "Second Avenue serves the M15 local and SBS route. NYC DOT will move the curbside bus lane one lane over as an offset bus lane.";
      const secondAvenueTitleHash =
        `sha256:${createHash("sha256").update(secondAvenueTitleText).digest("hex")}`;
      const secondAvenueRangeHash =
        `sha256:${createHash("sha256").update(secondAvenueRangeText).digest("hex")}`;
      const secondAvenueServiceHash =
        `sha256:${createHash("sha256").update(secondAvenueServiceText).digest("hex")}`;
      writeFileSync(join(secondAvenueSourceDir, "source.html"), secondAvenueSourceBytes);
      writeFileSync(join(secondAvenueSourceDir, "metadata.json"), JSON.stringify({
        sourceId: "official-second-avenue-source",
        sourceUrl: "https://www.nyc.gov/second-avenue-source",
        sha256: `sha256:${secondAvenueSourceHash}`,
        title: secondAvenueTitleText,
      }));
      const writeSecondAvenueBlocks = (serviceText: string, serviceHash: string) => writeFileSync(
        join(secondAvenueSourceDir, "blocks.jsonl"),
        [
          {
            source_id: "official-second-avenue-source",
            block_id: "p001_b0001",
            page_number: 1,
            raw_text: secondAvenueTitleText,
            normalized_text: secondAvenueTitleText,
            raw_text_sha256: secondAvenueTitleHash,
          },
          {
            source_id: "official-second-avenue-source",
            block_id: "p001_b0013",
            page_number: 1,
            raw_text: secondAvenueRangeText,
            normalized_text: secondAvenueRangeText,
            raw_text_sha256: secondAvenueRangeHash,
          },
          {
            source_id: "official-second-avenue-source",
            block_id: "p001_b0019",
            page_number: 1,
            raw_text: serviceText,
            normalized_text: serviceText,
            raw_text_sha256: serviceHash,
          },
        ].map((block) => JSON.stringify(block)).join("\n") + "\n",
      );
      writeSecondAvenueBlocks(secondAvenueServiceText, secondAvenueServiceHash);
      writeFileSync(join(acquiredChecksDir, "acquired-source-checks.json"), JSON.stringify({
        sources: [
          ...acquiredSources,
          {
            url: "https://www.nyc.gov/correction-source",
            content_sha256: correctionSourceHash,
            retrieval_status: "acquired",
          },
          {
            url: "https://www.nyc.gov/project-connection-source",
            content_sha256: connectionSourceHash,
            retrieval_status: "acquired",
          },
          {
            url: "https://www.nyc.gov/upper-corridor-source",
            content_sha256: corridorSourceHash,
            retrieval_status: "acquired",
          },
          {
            url: "https://www.nyc.gov/second-avenue-source",
            content_sha256: secondAvenueSourceHash,
            retrieval_status: "acquired",
          },
        ],
      }));
      const secondAvenueEvidenceRefs = [
        { block_id: "p001_b0001", page_number: 1, text_sha256: secondAvenueTitleHash },
        { block_id: "p001_b0013", page_number: 1, text_sha256: secondAvenueRangeHash },
        { block_id: "p001_b0019", page_number: 1, text_sha256: secondAvenueServiceHash },
      ];
      const secondAvenueSupplementalSearch = (routeId: string) => ({
        ...corridorSupplementalSearch,
        exact_queries: corridorSupplementalSearch.exact_queries.map((query) => ({
          ...query,
          query: query.query.replace("Q1", routeId),
        })),
        urls_inspected: [
          ...corridorSupplementalSearch.urls_inspected,
          "https://www.nyc.gov/second-avenue-source",
        ].sort(),
        retrievals: [...corridorSupplementalSearch.retrievals, {
          category: "official_nyc_dot_lane_project",
          url: "https://www.nyc.gov/second-avenue-source",
          retrieved_on: "2026-07-23",
          status: "acquired",
          sha256: secondAvenueSourceHash,
        }],
      });
      const m15Row = { ...row, gtfs_route_id: "M15" };
      const m15Packet = buildBusLaneResearchPackets([m15Row]).packets[0]!;
      const m15Receipt = {
        ...receipt,
        gtfs_route_id: "M15",
        supplemental_search: {
          ...secondAvenueSupplementalSearch("M15"),
          finding_corrections: [{
            prior_claim_path: "source_findings.exact_project_route_statement_found",
            prior_claim_value: false,
            supersedes_prior_finding: true,
            source_id: "official-second-avenue-source",
            source_url: "https://www.nyc.gov/second-avenue-source",
            source_content_sha256: secondAvenueSourceHash,
            source_artifact: "source.html",
            evidence_refs: secondAvenueEvidenceRefs,
            corrected_finding: {
              candidate_route_id: "M15",
              finding_kind: "positive_project_corridor_service_nonterminal",
              supported_scope: "project_corridor_service_only",
              unsupported_bindings: m15Packet.unresolved_bindings,
              finding_summary:
                "The local route serves the broader redesign corridor, without exact feature-row binding.",
            },
            remaining_unresolved_bindings: m15Packet.unresolved_bindings,
            authorizes_study: false,
            authorizes_cross_product: false,
          }],
        },
      };
      writeFileSync(join(receiptDir, "draft.json"), stableJson(m15Receipt as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([m15Row], [m15Packet], receiptDir, rootDir)).not.toThrow();
      const m15AliasRow = { ...positiveRow, gtfs_route_id: "M15+" };
      const m15AliasPacket = buildBusLaneResearchPackets([m15AliasRow]).packets[0]!;
      const m15AliasContext = {
        source_id: "official-second-avenue-source",
        source_url: "https://www.nyc.gov/second-avenue-source",
        source_content_sha256: secondAvenueSourceHash,
        source_artifact: "source.html",
        evidence_refs: secondAvenueEvidenceRefs,
        context_finding: {
          candidate_route_id: "M15+",
          finding_kind: "positive_project_corridor_service_nonterminal",
          supported_scope: "project_corridor_service_only",
          unsupported_bindings: m15AliasPacket.unresolved_bindings,
          finding_summary:
            "The source's M15 SBS name proves this alias serves the broader corridor, not the exact rows.",
        },
        remaining_unresolved_bindings: m15AliasPacket.unresolved_bindings,
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      const m15AliasReceipt = {
        ...receipt,
        gtfs_route_id: "M15+",
        prior_receipt: {
          receipt_id: "positive-prior-receipt",
          artifact: "positive-prior.jsonl",
          row_sha256: positiveRow.prior_acquisition_receipt.row_sha256,
        },
        supplemental_search: {
          ...secondAvenueSupplementalSearch("M15+"),
          finding_corrections: [],
          positive_context_findings: [m15AliasContext],
        },
      };
      writeFileSync(join(receiptDir, "draft.json"), stableJson(m15AliasReceipt as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts(
        [m15AliasRow], [m15AliasPacket], receiptDir, rootDir,
      )).not.toThrow();
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...m15AliasReceipt,
        supplemental_search: {
          ...m15AliasReceipt.supplemental_search,
          positive_context_findings: [{
            ...m15AliasContext,
            context_finding: {
              ...m15AliasContext.context_finding,
              supported_scope: "exact_feature_traversal",
            },
          }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts(
        [m15AliasRow], [m15AliasPacket], receiptDir, rootDir,
      )).toThrow("unsupported typed scope");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...m15AliasReceipt,
        supplemental_search: {
          ...m15AliasReceipt.supplemental_search,
          positive_context_findings: [{
            ...m15AliasContext,
            remaining_unresolved_bindings: m15AliasPacket.unresolved_bindings.filter(
              (binding) => binding !== "traversal",
            ),
          }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts(
        [m15AliasRow], [m15AliasPacket], receiptDir, rootDir,
      )).toThrow("exceeds its nonauthorizing project-corridor scope");
      const noSbsServiceText =
        "Second Avenue serves the M15 local route. NYC DOT will move the curbside bus lane one lane over as an offset bus lane.";
      const noSbsServiceHash = `sha256:${createHash("sha256").update(noSbsServiceText).digest("hex")}`;
      writeSecondAvenueBlocks(noSbsServiceText, noSbsServiceHash);
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...m15AliasReceipt,
        supplemental_search: {
          ...m15AliasReceipt.supplemental_search,
          positive_context_findings: [{
            ...m15AliasContext,
            evidence_refs: secondAvenueEvidenceRefs.map((ref) => ref.block_id === "p001_b0019"
              ? { ...ref, text_sha256: noSbsServiceHash }
              : ref),
          }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts(
        [m15AliasRow], [m15AliasPacket], receiptDir, rootDir,
      )).toThrow("does not bind the exact route to bounded corridor-service context");
      writeSecondAvenueBlocks(secondAvenueServiceText, secondAvenueServiceHash);
      const m9Row = { ...row, gtfs_route_id: "M9" };
      const m9Packet = buildBusLaneResearchPackets([m9Row]).packets[0]!;
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...m15Receipt,
        gtfs_route_id: "M9",
        supplemental_search: {
          ...secondAvenueSupplementalSearch("M9"),
          finding_corrections: m15Receipt.supplemental_search.finding_corrections.map((correction) => ({
            ...correction,
            corrected_finding: { ...correction.corrected_finding, candidate_route_id: "M9" },
            remaining_unresolved_bindings: m9Packet.unresolved_bindings,
          })),
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([m9Row], [m9Packet], receiptDir, rootDir))
        .toThrow("does not bind the exact route to its typed project context");
      const west125SourceDir = join(rootDir, "raw", "sources", "official-west-125-source");
      mkdirSync(west125SourceDir, { recursive: true });
      const west125SourceBytes = Buffer.from("<html>fixture official West 125th Street SBS page</html>");
      const west125SourceHash = createHash("sha256").update(west125SourceBytes).digest("hex");
      const west125TitleText = "NYC DOT Begins Camera Enforcement Along 125th Street SBS Route";
      const west125RouteText =
        "DOT will issue bus lane camera violations along the M60 125th Street Select Bus Service SBS route.";
      const west125ExtensionText =
        "DOT installed additional bus lanes along 125th Street from Lenox Avenue to Morningside Avenue in fall 2015.";
      const west125TitleHash = `sha256:${createHash("sha256").update(west125TitleText).digest("hex")}`;
      const west125RouteHash = `sha256:${createHash("sha256").update(west125RouteText).digest("hex")}`;
      const west125ExtensionHash =
        `sha256:${createHash("sha256").update(west125ExtensionText).digest("hex")}`;
      writeFileSync(join(west125SourceDir, "source.html"), west125SourceBytes);
      writeFileSync(join(west125SourceDir, "metadata.json"), JSON.stringify({
        sourceId: "official-west-125-source",
        sourceUrl: "https://www.nyc.gov/west-125-source",
        sha256: `sha256:${west125SourceHash}`,
        title: west125TitleText,
      }));
      const writeWest125Blocks = (routeText: string, routeHash: string) => writeFileSync(
        join(west125SourceDir, "blocks.jsonl"),
        [
          {
            source_id: "official-west-125-source",
            block_id: "p001_b0001",
            page_number: 1,
            raw_text: west125TitleText,
            normalized_text: west125TitleText,
            raw_text_sha256: west125TitleHash,
          },
          {
            source_id: "official-west-125-source",
            block_id: "p001_b0015",
            page_number: 1,
            raw_text: routeText,
            normalized_text: routeText,
            raw_text_sha256: routeHash,
          },
          {
            source_id: "official-west-125-source",
            block_id: "p001_b0017",
            page_number: 1,
            raw_text: west125ExtensionText,
            normalized_text: west125ExtensionText,
            raw_text_sha256: west125ExtensionHash,
          },
        ].map((block) => JSON.stringify(block)).join("\n") + "\n",
      );
      writeWest125Blocks(west125RouteText, west125RouteHash);
      writeFileSync(join(acquiredChecksDir, "acquired-source-checks.json"), JSON.stringify({
        sources: [
          ...acquiredSources,
          {
            url: "https://www.nyc.gov/correction-source",
            content_sha256: correctionSourceHash,
            retrieval_status: "acquired",
          },
          {
            url: "https://www.nyc.gov/project-connection-source",
            content_sha256: connectionSourceHash,
            retrieval_status: "acquired",
          },
          {
            url: "https://www.nyc.gov/upper-corridor-source",
            content_sha256: corridorSourceHash,
            retrieval_status: "acquired",
          },
          {
            url: "https://www.nyc.gov/second-avenue-source",
            content_sha256: secondAvenueSourceHash,
            retrieval_status: "acquired",
          },
          {
            url: "https://www.nyc.gov/west-125-source",
            content_sha256: west125SourceHash,
            retrieval_status: "acquired",
          },
        ],
      }));
      const west125EvidenceRefs = [
        { block_id: "p001_b0001", page_number: 1, text_sha256: west125TitleHash },
        { block_id: "p001_b0015", page_number: 1, text_sha256: west125RouteHash },
        { block_id: "p001_b0017", page_number: 1, text_sha256: west125ExtensionHash },
      ];
      const m60AliasRow = { ...positiveRow, gtfs_route_id: "M60+" };
      const m60AliasPacket = buildBusLaneResearchPackets([m60AliasRow]).packets[0]!;
      const m60SupplementalSearch = {
        ...secondAvenueSupplementalSearch("M60+"),
        urls_inspected: [
          ...secondAvenueSupplementalSearch("M60+").urls_inspected,
          "https://www.nyc.gov/west-125-source",
        ].sort(),
        retrievals: [...secondAvenueSupplementalSearch("M60+").retrievals, {
          category: "official_nyc_dot_lane_project",
          url: "https://www.nyc.gov/west-125-source",
          retrieved_on: "2026-07-23",
          status: "acquired",
          sha256: west125SourceHash,
        }],
      };
      const m60Context = {
        source_id: "official-west-125-source",
        source_url: "https://www.nyc.gov/west-125-source",
        source_content_sha256: west125SourceHash,
        source_artifact: "source.html",
        evidence_refs: west125EvidenceRefs,
        context_finding: {
          candidate_route_id: "M60+",
          finding_kind: "positive_project_corridor_service_nonterminal",
          supported_scope: "project_corridor_service_only",
          unsupported_bindings: m60AliasPacket.unresolved_bindings,
          finding_summary:
            "The M60 SBS route is named with the fall-2015 corridor extension, not exact feature rows.",
        },
        remaining_unresolved_bindings: m60AliasPacket.unresolved_bindings,
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      const m60Receipt = {
        ...receipt,
        gtfs_route_id: "M60+",
        prior_receipt: {
          receipt_id: "positive-prior-receipt",
          artifact: "positive-prior.jsonl",
          row_sha256: positiveRow.prior_acquisition_receipt.row_sha256,
        },
        supplemental_search: {
          ...m60SupplementalSearch,
          finding_corrections: [],
          positive_context_findings: [m60Context],
        },
      };
      writeFileSync(join(receiptDir, "draft.json"), stableJson(m60Receipt as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts(
        [m60AliasRow], [m60AliasPacket], receiptDir, rootDir,
      )).not.toThrow();
      const noSbsM60Text =
        "DOT will issue bus lane camera violations along the M60 125th Street Select Bus Service route.";
      const noSbsM60Hash = `sha256:${createHash("sha256").update(noSbsM60Text).digest("hex")}`;
      writeWest125Blocks(noSbsM60Text, noSbsM60Hash);
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...m60Receipt,
        supplemental_search: {
          ...m60Receipt.supplemental_search,
          positive_context_findings: [{
            ...m60Context,
            evidence_refs: west125EvidenceRefs.map((ref) => ref.block_id === "p001_b0015"
              ? { ...ref, text_sha256: noSbsM60Hash }
              : ref),
          }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts(
        [m60AliasRow], [m60AliasPacket], receiptDir, rootDir,
      )).toThrow("does not bind the exact route to bounded corridor-service context");
      writeWest125Blocks(west125RouteText, west125RouteHash);
      const otherExtentContextText = "Served by Q1 express bus routes in the separate corridor.";
      const otherExtentContextHash = `sha256:${createHash("sha256").update(otherExtentContextText).digest("hex")}`;
      writeFileSync(join(stagedSourceDir, "metadata.json"), JSON.stringify({
        sourceId: "official-project-source",
        sourceUrl: "https://www.nyc.gov/correction-source",
        sha256: `sha256:${correctionSourceHash}`,
        title: "Other Avenue Complete Street Proposal",
      }));
      writeFileSync(join(stagedSourceDir, "blocks.jsonl"), `${JSON.stringify({
        source_id: "official-project-source",
        block_id: "p004_p0001",
        page_number: 4,
        raw_text: otherExtentContextText,
        normalized_text: otherExtentContextText,
        raw_text_sha256: otherExtentContextHash,
      })}\n`);
      const positiveContextFinding = {
        source_id: "official-project-source",
        source_url: "https://www.nyc.gov/correction-source",
        source_pdf_sha256: correctionSourceHash,
        evidence_refs: [
          { block_id: "p004_p0001", page_number: 4, text_sha256: otherExtentContextHash },
        ],
        context_finding: {
          candidate_route_id: "Q1",
          finding_kind: "positive_other_extent_context_nonterminal",
          supported_scope: "other_extent_corridor_service_only",
          unsupported_bindings: packet.unresolved_bindings,
          finding_summary: "The route serves a separately bounded proposal corridor, not the candidate feature extent.",
        },
        remaining_unresolved_bindings: packet.unresolved_bindings,
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...correctionSupplementalSearch,
          finding_corrections: [],
          positive_context_findings: [positiveContextFinding],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir)).not.toThrow();
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...receipt,
        supplemental_search: {
          ...correctionSupplementalSearch,
          finding_corrections: [],
          positive_context_findings: [{ ...positiveContextFinding, authorizes_study: true }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir))
        .toThrow("positive context exceeds its nonauthorizing other-extent scope");
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
        .toThrow("does not bind the exact route to its typed project context");
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
        .toThrow("staged source metadata, URL, or content hash does not resolve");
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

  it("keeps Church Avenue project and historical traversal context candidate-exact and nonterminal", () => {
    const date = "2019-10-23";
    const laneFeatures = [
      lane({ feature_id: "church-eb", lane_group_id: "BK|CHURCH AVENUE", opened: "10/23/2019", direction: "EB" }),
      lane({ feature_id: "church-wb", lane_group_id: "BK|CHURCH AVENUE", opened: "10/23/2019", direction: "WB" }),
    ];
    const makeRow = (routeId: string, suffix: string) => {
      const entry = candidate(`church-${suffix}`, routeId, date);
      return buildBusLaneIdentityLedger({
        bridgeCandidates: [entry.bridge],
        trackerCandidates: [entry.tracker],
        routeAnchors: [anchor(routeId)],
        dossierRows: [dossier({
          candidateId: entry.bridge.candidate_id,
          routeId,
          date,
          laneGroupId: null,
          pathSource: "unavailable",
          pathIdentity: null,
          reason: "historical_schedule_unavailable_pre_2023",
        })],
        dossierArtifact: "dossier.jsonl",
        laneFeatures,
        laneSnapshotId: "lanes",
        laneSourceId: "lane_source",
        gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
      })[0]!;
    };
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-church-context-"));
    const receiptDir = join(rootDir, "receipts");
    const acquiredChecksDir = join(rootDir,
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/church-fixture");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(acquiredChecksDir, { recursive: true });
    const projectUrl = "https://www.nyc.gov/church-project.pdf";
    const studyUrl = "https://www.nyc.gov/church-study.pdf";
    const stageSource = (input: {
      sourceId: string;
      sourceUrl: string;
      title: string;
      publishedDate: string;
      bytes: Buffer;
      blocks: { block_id: string; page_number: number; raw_text: string }[];
    }) => {
      const sourceDir = join(rootDir, "raw", "sources", input.sourceId);
      mkdirSync(sourceDir, { recursive: true });
      const contentHash = createHash("sha256").update(input.bytes).digest("hex");
      writeFileSync(join(sourceDir, "source.pdf"), input.bytes);
      writeFileSync(join(sourceDir, "metadata.json"), JSON.stringify({
        sourceId: input.sourceId,
        sourceUrl: input.sourceUrl,
        sha256: contentHash,
        title: input.title,
        publishedDate: input.publishedDate,
      }));
      const blocks = input.blocks.map((block) => ({
        source_id: input.sourceId,
        ...block,
        normalized_text: block.raw_text,
        raw_text_sha256: `sha256:${createHash("sha256").update(block.raw_text).digest("hex")}`,
      }));
      writeFileSync(join(sourceDir, "blocks.jsonl"), `${blocks.map((block) => JSON.stringify(block)).join("\n")}\n`);
      return { contentHash, blocks };
    };
    const project = stageSource({
      sourceId: "church-project-source",
      sourceUrl: projectUrl,
      title: "Church Ave Transit & Traffic Improvements: Project Update Implementation Plan",
      publishedDate: "2019-10-01",
      bytes: Buffer.from("fixture Church Avenue October 2019 project PDF"),
      blocks: [
        { block_id: "p007_b0001", page_number: 7, raw_text: "B35: 29,000 daily riders" },
        { block_id: "p028_b0001", page_number: 28,
          raw_text: "Curbside bus lanes, both directions from Marlborough Rd to E 7 St" },
        { block_id: "p030_b0001", page_number: 30,
          raw_text: "Bus lanes will be activated on October 23, 2019" },
      ],
    });
    const study = stageSource({
      sourceId: "church-study-source",
      sourceUrl: studyUrl,
      title: "The Citywide Congested Corridor Project: Church Avenue from McDonald Avenue to Utica Avenue Final Report",
      publishedDate: "2013-02-01",
      bytes: Buffer.from("fixture Church Avenue February 2013 corridor PDF"),
      blocks: [
        { block_id: "p017_b0001", page_number: 17, raw_text: "In additions, six bus lines traverse Church" },
        { block_id: "p017_b0002", page_number: 17, raw_text: "Avenue: B67, B68, B41, B44, B46 & B49." },
      ],
    });
    writeFileSync(join(acquiredChecksDir, "acquired-source-checks.json"), JSON.stringify({
      sources: [
        { url: projectUrl, content_sha256: project.contentHash, retrieval_status: "acquired" },
        { url: studyUrl, content_sha256: study.contentHash, retrieval_status: "acquired" },
      ],
    }));
    const bindPrior = (row: ReturnType<typeof makeRow>, routeId: string, exactProject: boolean) => {
      const prior = {
        receipt_id: `prior-${routeId}`,
        researched_on: "2026-07-15",
        source_findings: { exact_project_route_statement_found: exactProject },
        acquisition_attempts: [{
          category: "official_nyc_dot_lane_project",
          query: `site:nyc.gov Church Avenue ${routeId}`,
          query_status: "performed_2026-07-15",
          urls_checked: [projectUrl],
          retrievals: [{ id: "church-project", retrieved_on: "2026-07-15",
            sha256: project.contentHash, status: "acquired" }],
        }],
      };
      const priorLine = stableJson(prior as unknown as JsonValue);
      const artifact = `prior-${routeId}.jsonl`;
      writeFileSync(join(rootDir, artifact), `${priorLine}\n`);
      return {
        ...row,
        prior_acquisition_receipt: {
          receipt_id: prior.receipt_id,
          artifact,
          row_sha256: createHash("sha256").update(priorLine).digest("hex"),
          disposition: exactProject ? "linkage_supported_phase_unresolved" : "completed_search_route_linkage_unresolved",
          next_action: "Retain as nonterminal context only.",
        },
      };
    };
    const b35Row = bindPrior(makeRow("B35", "b35"), "B35", true);
    const b68Row = bindPrior(makeRow("B68", "b68"), "B68", false);
    const b35Packet = buildBusLaneResearchPackets([b35Row]).packets[0]!;
    const b68Packet = buildBusLaneResearchPackets([b68Row]).packets[0]!;
    expect(b35Packet.unresolved_bindings).toEqual(["attribution", "direction", "traversal"]);
    expect(b68Packet.unresolved_bindings).toEqual(["attribution", "direction", "traversal"]);
    const evidenceRefs = (source: typeof project) => source.blocks.map((block) => ({
      block_id: block.block_id,
      page_number: block.page_number,
      text_sha256: block.raw_text_sha256,
    }));
    const supplementalSearch = (routeId: string, finding: Record<string, unknown>) => ({
      domains: ["www.nyc.gov"],
      exact_queries: [
        { category: "official_nyc_dot_lane_project", query: `site:nyc.gov Church Avenue ${routeId} bus lane`,
          query_status: "performed_2026-07-23" },
        { category: "official_public_board_committee", query: `site:nyc.gov Church Avenue ${routeId} board`,
          query_status: "performed_2026-07-23" },
      ],
      finding_corrections: [],
      operator: "fixture-reviewer",
      positive_context_findings: [finding],
      retrievals: [
        { category: "official_nyc_dot_lane_project", retrieved_on: "2026-07-23",
          sha256: project.contentHash, status: "acquired", url: projectUrl },
        { category: "official_public_board_committee", retrieved_on: "2026-07-23",
          sha256: study.contentHash, status: "acquired", url: studyUrl },
      ],
      searched_at: "2026-07-23",
      urls_inspected: [projectUrl, studyUrl].sort(),
    });
    const makeReceipt = (row: typeof b35Row, packet: typeof b35Packet, routeId: string) => {
      const matches = packet.what_is_known.target_groups.flatMap((group) => group.feature_matches);
      return {
        schema_version: 1,
        receipt_id: `binding-${routeId}`,
        receipt_kind: "binding_absent_after_search",
        candidate_id: row.candidate_id,
        candidate_fingerprint: row.candidate_fingerprint,
        gtfs_route_id: routeId,
        implementation_date: date,
        gap_ids: [row.ledger_id],
        searched_at: "2026-07-15",
        operator: "fixture-reviewer",
        candidate_urls: [],
        disposition: "binding_absent_after_search",
        missing_binding: packet.missing_binding,
        unresolved_bindings: packet.unresolved_bindings,
        target: {
          lane_group_ids: ["BK|CHURCH AVENUE"],
          feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
          geometry_scopes: ["coextensive_with_lane_group"],
          matched_date: date,
          directions: ["EB", "WB"],
          open_dates_literals: ["10/23/2019"],
          named_sbs_routes: [],
        },
        prior_receipt: {
          receipt_id: row.prior_acquisition_receipt!.receipt_id,
          artifact: row.prior_acquisition_receipt!.artifact,
          row_sha256: row.prior_acquisition_receipt!.row_sha256,
        },
        search: {
          exact_queries: [{ category: "official_nyc_dot_lane_project",
            query: `site:nyc.gov Church Avenue ${routeId}`, query_status: "performed_2026-07-15" }],
          domains: ["www.nyc.gov"],
          urls_inspected: [projectUrl],
          retrievals: [{ category: "official_nyc_dot_lane_project", id: "church-project",
            retrieved_on: "2026-07-15", sha256: project.contentHash, status: "acquired" }],
          disposition: "binding_absent_after_search",
        },
        authorizes_study: false,
        authorizes_cross_product: false,
      };
    };
    const b35Finding = {
      source_id: "church-project-source",
      source_url: projectUrl,
      source_pdf_sha256: project.contentHash,
      evidence_refs: evidenceRefs(project),
      context_finding: {
        candidate_route_id: "B35",
        finding_kind: "positive_project_corridor_service_nonterminal",
        supported_scope: "project_corridor_service_only",
        unsupported_bindings: b35Packet.unresolved_bindings,
        finding_summary: "B35 is named with project date, bidirectional lanes, and limits, not exact traversal rows.",
      },
      remaining_unresolved_bindings: b35Packet.unresolved_bindings,
      authorizes_study: false,
      authorizes_cross_product: false,
    };
    const b68Finding = {
      source_id: "church-study-source",
      source_url: studyUrl,
      source_pdf_sha256: study.contentHash,
      evidence_refs: evidenceRefs(study),
      context_finding: {
        candidate_route_id: "B68",
        finding_kind: "positive_historical_same_corridor_traversal_nonterminal",
        supported_scope: "historical_same_corridor_traversal_only",
        unsupported_bindings: b68Packet.unresolved_bindings,
        finding_summary: "B68 historically traverses Church Avenue, without a 2019 project/date/feature binding.",
      },
      remaining_unresolved_bindings: b68Packet.unresolved_bindings,
      authorizes_study: false,
      authorizes_cross_product: false,
    };
    const b35Receipt = { ...makeReceipt(b35Row, b35Packet, "B35"),
      supplemental_search: supplementalSearch("B35", b35Finding) };
    const b68Receipt = { ...makeReceipt(b68Row, b68Packet, "B68"),
      supplemental_search: supplementalSearch("B68", b68Finding) };
    try {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(b35Receipt as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([b35Row], [b35Packet], receiptDir, rootDir)).not.toThrow();
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...b35Receipt,
        supplemental_search: {
          ...b35Receipt.supplemental_search,
          positive_context_findings: [{ ...b35Finding, evidence_refs: evidenceRefs(project).slice(0, 2) }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([b35Row], [b35Packet], receiptDir, rootDir))
        .toThrow("does not bind the exact route to bounded corridor-service context");
      const traversalConfirmedRow = {
        ...b35Row,
        dossier_refs: [{
          ...b35Row.dossier_refs[0]!,
          candidate_target_match: true,
          verdict_class: "traversal_confirmed" as const,
          service_date: date,
        }],
      };
      writeFileSync(join(receiptDir, "draft.json"), stableJson(b35Receipt as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts(
        [traversalConfirmedRow], [b35Packet], receiptDir, rootDir,
      )).toThrow("exceeds its nonauthorizing project-corridor scope");
      const crossDate = "2020-01-15";
      const crossDateRow = { ...b35Row, implementation_date: crossDate };
      const crossDatePacket = {
        ...b35Packet,
        implementation_date: crossDate,
        what_is_known: {
          ...b35Packet.what_is_known,
          target_groups: b35Packet.what_is_known.target_groups.map((group) => ({
            ...group,
            feature_matches: group.feature_matches.map((match) => ({
              ...match,
              matched_date: crossDate,
              matched_token_literal: "01/15/2020",
              open_dates_literal: "01/15/2020",
            })),
          })),
        },
      };
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...b35Receipt,
        implementation_date: crossDate,
        target: {
          ...b35Receipt.target,
          matched_date: crossDate,
          open_dates_literals: ["01/15/2020"],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts(
        [crossDateRow], [crossDatePacket], receiptDir, rootDir,
      )).toThrow("does not bind the exact route to bounded corridor-service context");
      const cloneTarget = <Packet extends typeof b35Packet>(packet: Packet) => ({
        ...packet,
        what_is_known: {
          ...packet.what_is_known,
          target_groups: packet.what_is_known.target_groups.map((group) => ({
            ...group,
            facility: "Flatbush Avenue",
            lane_group_id: "BK|FLATBUSH AVENUE",
            street: "FLATBUSH AVENUE",
          })),
        },
      });
      const b35FlatbushPacket = cloneTarget(b35Packet);
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...b35Receipt,
        target: { ...b35Receipt.target, lane_group_ids: ["BK|FLATBUSH AVENUE"] },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts(
        [b35Row], [b35FlatbushPacket], receiptDir, rootDir,
      )).toThrow("does not bind the exact route to bounded corridor-service context");
      writeFileSync(join(receiptDir, "draft.json"), stableJson(b68Receipt as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([b68Row], [b68Packet], receiptDir, rootDir)).not.toThrow();
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...b68Receipt,
        supplemental_search: {
          ...b68Receipt.supplemental_search,
          positive_context_findings: [{
            ...b68Finding,
            context_finding: {
              ...b68Finding.context_finding,
              finding_kind: "positive_project_corridor_service_nonterminal",
              supported_scope: "project_corridor_service_only",
            },
          }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([b68Row], [b68Packet], receiptDir, rootDir))
        .toThrow("positive context exceeds its nonauthorizing project-corridor scope");
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...b68Receipt,
        supplemental_search: {
          ...b68Receipt.supplemental_search,
          positive_context_findings: [{ ...b68Finding, evidence_refs: evidenceRefs(study).slice(1) }],
        },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts([b68Row], [b68Packet], receiptDir, rootDir))
        .toThrow("does not bind the exact route to bounded corridor-service context");
      const b68FlatbushPacket = cloneTarget(b68Packet);
      writeFileSync(join(receiptDir, "draft.json"), stableJson({
        ...b68Receipt,
        target: { ...b68Receipt.target, lane_group_ids: ["BK|FLATBUSH AVENUE"] },
      } as unknown as JsonValue));
      expect(() => validateBindingReceiptDrafts(
        [b68Row], [b68FlatbushPacket], receiptDir, rootDir,
      )).toThrow("does not bind the exact route to bounded corridor-service context");
      expect(b35Receipt.authorizes_study).toBeFalse();
      expect(b35Receipt.authorizes_cross_product).toBeFalse();
      expect(b35Receipt.unresolved_bindings).toEqual(["attribution", "direction", "traversal"]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("keeps B69 Vanderbilt/Clermont endpoint context separate from Fulton Street lane service", () => {
    const date = "2018-06-01";
    const uniqueFeatures = [
      ...Array.from({ length: 15 }, (_, index) => lane({
        feature_id: `fulton-${index}`,
        lane_group_id: "BK|FULTON STREET",
        opened: "06/01/2018",
        direction: "EB",
      })),
      ...Array.from({ length: 12 }, (_, index) => lane({
        feature_id: `fulton-${index}`,
        lane_group_id: "BK|FULTON STREET",
        opened: index === 0 ? "10/05/2004, 06/01/2018" : "06/01/2018",
        direction: "WB",
      })),
    ];
    const laneFeatures = [...uniqueFeatures, ...uniqueFeatures.slice(0, 6)];
    const entry = candidate("fulton-b69", "B69", date);
    const baseRow = buildBusLaneIdentityLedger({
      bridgeCandidates: [entry.bridge],
      trackerCandidates: [entry.tracker],
      routeAnchors: [anchor("B69")],
      dossierRows: [dossier({
        candidateId: entry.bridge.candidate_id,
        routeId: "B69",
        date,
        laneGroupId: null,
        pathSource: "unavailable",
        pathIdentity: null,
        reason: "historical_schedule_unavailable_pre_2023",
      })],
      dossierArtifact: "dossier.jsonl",
      laneFeatures,
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    })[0]!;
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-fulton-endpoint-"));
    const receiptDir = join(rootDir, "receipts");
    const acquiredChecksDir = join(rootDir,
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/fulton-fixture");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(acquiredChecksDir, { recursive: true });
    const adjacentUrl = "https://www.nyc.gov/vanderbilt-clermont-june2018.pdf";
    const fultonUrl = "https://www.nyc.gov/fulton-street-june2017.pdf";
    const adjacentBytes = Buffer.from("fixture Vanderbilt Clermont June 2018 PDF");
    const adjacentHash = createHash("sha256").update(adjacentBytes).digest("hex");
    const fultonHash = createHash("sha256").update("fixture Fulton Street B25 B26 PDF").digest("hex");
    const sourceDir = join(rootDir, "raw", "sources", "vanderbilt-clermont-source");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "source.pdf"), adjacentBytes);
    writeFileSync(join(sourceDir, "metadata.json"), JSON.stringify({
      sourceId: "vanderbilt-clermont-source",
      sourceUrl: adjacentUrl,
      sha256: adjacentHash,
      title: "Vanderbilt Avenue, Clermont Avenue Safety and Mobility Improvements",
      publishedDate: "2018-06-21",
    }));
    const sourceBlocks = (routeText = "B69 Bus route") => [
      { block_id: "p004_b0001", page_number: 4, raw_text: "VANDERBILT AVENUE" },
      { block_id: "p004_b0002", page_number: 4, raw_text: routeText },
      { block_id: "p005_b0001", page_number: 5, raw_text: "PROPOSAL OVERVIEW" },
      { block_id: "p005_b0002", page_number: 5, raw_text: "Vanderbilt Ave" },
      { block_id: "p005_b0003", page_number: 5, raw_text: "Fulton St to Flushing Ave" },
      { block_id: "p005_b0004", page_number: 5, raw_text: "Clermont Ave" },
      { block_id: "p005_b0005", page_number: 5, raw_text: "Flushing Ave to Fulton St" },
    ].map((block) => ({
      source_id: "vanderbilt-clermont-source",
      ...block,
      normalized_text: block.raw_text,
      raw_text_sha256: `sha256:${createHash("sha256").update(block.raw_text).digest("hex")}`,
    }));
    const writeBlocks = (routeText = "B69 Bus route") => {
      const blocks = sourceBlocks(routeText);
      writeFileSync(join(sourceDir, "blocks.jsonl"), `${blocks.map((block) => JSON.stringify(block)).join("\n")}\n`);
      return blocks;
    };
    let blocks = writeBlocks();
    writeFileSync(join(acquiredChecksDir, "acquired-source-checks.json"), JSON.stringify({
      sources: [
        { url: adjacentUrl, content_sha256: adjacentHash, retrieval_status: "acquired" },
        { url: fultonUrl, content_sha256: fultonHash, retrieval_status: "acquired" },
      ],
    }));
    const prior = {
      receipt_id: "prior-B69",
      researched_on: "2026-07-15",
      source_findings: { exact_project_route_statement_found: false },
      acquisition_attempts: [{
        category: "official_nyc_dot_lane_project",
        query: "site:nyc.gov Fulton Street B69 bus lane",
        query_status: "performed_2026-07-15",
        urls_checked: [fultonUrl],
        retrievals: [{ id: "fulton-project", retrieved_on: "2026-07-15", sha256: fultonHash, status: "acquired" }],
      }],
    };
    const priorLine = stableJson(prior as unknown as JsonValue);
    writeFileSync(join(rootDir, "prior-B69.jsonl"), `${priorLine}\n`);
    const row = {
      ...baseRow,
      prior_acquisition_receipt: {
        receipt_id: prior.receipt_id,
        artifact: "prior-B69.jsonl",
        row_sha256: createHash("sha256").update(priorLine).digest("hex"),
        disposition: "completed_search_route_linkage_unresolved",
        next_action: "Retain as nonterminal context only.",
      },
    };
    const packet = buildBusLaneResearchPackets([row]).packets[0]!;
    const targetFor = (candidatePacket: typeof packet) => {
      const matches = candidatePacket.what_is_known.target_groups.flatMap((group) => group.feature_matches);
      return {
        lane_group_ids: candidatePacket.what_is_known.target_groups.map((group) => group.lane_group_id),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        geometry_scopes: [...new Set(candidatePacket.what_is_known.target_groups.map((group) => group.geometry_scope))].sort(),
        matched_date: candidatePacket.implementation_date,
        directions: [...new Set(matches.map((match) => match.direction))].sort(),
        open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
        named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
        feature_row_count: matches.length,
        feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
        feature_rows: matches.map((match) => ({
          feature_key: match.feature_key,
          feature_id: match.feature_id,
          direction: match.direction,
        })),
      };
    };
    expect(targetFor(packet)).toMatchObject({
      feature_row_count: 33,
      matched_date: date,
      directions: ["EB", "WB"],
      geometry_scopes: ["mixed_date_feature_union"],
      lane_group_ids: ["BK|FULTON STREET"],
    });
    expect(targetFor(packet).feature_keys).toHaveLength(27);
    expect(targetFor(packet).feature_ids).toHaveLength(15);
    expect(packet.unresolved_bindings).toEqual(["attribution", "direction", "feature_extent", "phase", "traversal"]);
    const evidenceRefs = () => blocks.map((block) => ({
      block_id: block.block_id,
      page_number: block.page_number,
      text_sha256: block.raw_text_sha256,
    }));
    const finding = () => ({
      source_id: "vanderbilt-clermont-source",
      source_url: adjacentUrl,
      source_pdf_sha256: adjacentHash,
      evidence_refs: evidenceRefs(),
      context_finding: {
        candidate_route_id: "B69",
        finding_kind: "positive_adjacent_project_intersection_endpoint_nonterminal",
        supported_scope: "adjacent_project_intersection_endpoint_only",
        unsupported_bindings: packet.unresolved_bindings,
        finding_summary: "B69 is named on Vanderbilt Avenue and the adjacent project ends at Fulton Street; no Fulton lane service transfers.",
      },
      remaining_unresolved_bindings: packet.unresolved_bindings,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    const supplementalSearch = () => ({
      domains: ["www.nyc.gov"],
      exact_queries: [
        { category: "official_nyc_dot_lane_project", query: "site:nyc.gov Fulton Street B69 bus lane",
          query_status: "performed_2026-07-23" },
        { category: "official_public_board_committee", query: "site:nyc.gov Vanderbilt Clermont B69 Fulton Street",
          query_status: "performed_2026-07-23" },
      ],
      finding_corrections: [],
      operator: "fixture-reviewer",
      positive_context_findings: [finding()],
      retrievals: [
        { category: "official_nyc_dot_lane_project", retrieved_on: "2026-07-23", sha256: fultonHash,
          status: "acquired", url: fultonUrl },
        { category: "official_public_board_committee", retrieved_on: "2026-07-23", sha256: adjacentHash,
          status: "acquired", url: adjacentUrl },
      ],
      searched_at: "2026-07-23",
      urls_inspected: [adjacentUrl, fultonUrl].sort(),
    });
    const receipt = {
      schema_version: 1,
      receipt_id: "binding-B69",
      receipt_kind: "binding_absent_after_search",
      candidate_id: row.candidate_id,
      candidate_fingerprint: row.candidate_fingerprint,
      gtfs_route_id: "B69",
      implementation_date: date,
      gap_ids: [row.ledger_id],
      searched_at: "2026-07-15",
      operator: "fixture-reviewer",
      candidate_urls: [],
      disposition: "binding_absent_after_search",
      missing_binding: packet.missing_binding,
      unresolved_bindings: packet.unresolved_bindings,
      target: targetFor(packet),
      prior_receipt: {
        receipt_id: row.prior_acquisition_receipt.receipt_id,
        artifact: row.prior_acquisition_receipt.artifact,
        row_sha256: row.prior_acquisition_receipt.row_sha256,
      },
      search: {
        exact_queries: [{ category: "official_nyc_dot_lane_project",
          query: "site:nyc.gov Fulton Street B69 bus lane", query_status: "performed_2026-07-15" }],
        domains: ["www.nyc.gov"],
        urls_inspected: [fultonUrl],
        retrievals: [{ category: "official_nyc_dot_lane_project", id: "fulton-project",
          retrieved_on: "2026-07-15", sha256: fultonHash, status: "acquired" }],
        disposition: "binding_absent_after_search",
      },
      supplemental_search: supplementalSearch(),
      authorizes_study: false,
      authorizes_cross_product: false,
    };
    const validate = (draft: Record<string, unknown>, candidateRow = row, candidatePacket = packet) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
      return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
    };
    try {
      expect(validate(receipt)).not.toThrow();

      blocks = writeBlocks("B25/B26 Bus routes");
      expect(validate({ ...receipt, supplemental_search: supplementalSearch() }))
        .toThrow("does not bind the exact route to bounded corridor-service context");
      blocks = writeBlocks();

      const wrongTargetPacket = {
        ...packet,
        what_is_known: {
          ...packet.what_is_known,
          target_groups: packet.what_is_known.target_groups.map((group) => ({
            ...group,
            facility: "Atlantic Avenue",
            lane_group_id: "BK|ATLANTIC AVENUE",
            street: "ATLANTIC AVENUE",
          })),
        },
      };
      expect(validate({ ...receipt, target: targetFor(wrongTargetPacket) }, row, wrongTargetPacket))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      const crossDate = "2018-06-02";
      const crossDateRow = { ...row, implementation_date: crossDate };
      const crossDatePacket = {
        ...packet,
        implementation_date: crossDate,
        what_is_known: {
          ...packet.what_is_known,
          target_groups: packet.what_is_known.target_groups.map((group) => ({
            ...group,
            feature_matches: group.feature_matches.map((match) => ({ ...match, matched_date: crossDate })),
          })),
        },
      };
      expect(validate({ ...receipt, implementation_date: crossDate, target: targetFor(crossDatePacket) },
        crossDateRow, crossDatePacket))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      const mismatchedFeatureDatePacket = {
        ...packet,
        what_is_known: {
          ...packet.what_is_known,
          target_groups: packet.what_is_known.target_groups.map((group) => ({
            ...group,
            feature_matches: group.feature_matches.map((match) => ({ ...match, matched_date: crossDate })),
          })),
        },
      };
      expect(validate(receipt, row, mismatchedFeatureDatePacket))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      const dedupedPacket = {
        ...packet,
        what_is_known: {
          ...packet.what_is_known,
          target_groups: packet.what_is_known.target_groups.map((group) => ({
            ...group,
            feature_matches: [...new Map(group.feature_matches.map((match) => [match.feature_key, match])).values()],
          })),
        },
      };
      expect(targetFor(dedupedPacket).feature_row_count).toBe(27);
      expect(validate({ ...receipt, target: targetFor(dedupedPacket) }, row, dedupedPacket))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      expect(validate({
        ...receipt,
        supplemental_search: {
          ...supplementalSearch(),
          positive_context_findings: [{
            ...finding(),
            context_finding: {
              ...finding().context_finding,
              finding_kind: "positive_project_corridor_service_nonterminal",
              supported_scope: "project_corridor_service_only",
            },
          }],
        },
      })).toThrow("positive context exceeds its nonauthorizing project-corridor scope");

      expect(validate({
        ...receipt,
        supplemental_search: {
          ...supplementalSearch(),
          positive_context_findings: [{ ...finding(), evidence_refs: evidenceRefs().slice(0, 2) }],
        },
      })).toThrow("does not bind the exact route to bounded corridor-service context");

      expect(validate({
        ...receipt,
        supplemental_search: {
          ...supplementalSearch(),
          positive_context_findings: [{
            ...finding(),
            context_finding: {
              ...finding().context_finding,
              unsupported_bindings: packet.unresolved_bindings.filter((binding) => binding !== "traversal"),
            },
          }],
        },
      })).toThrow("adjacent-project endpoint context transferred to Fulton Street lane service or traversal");

      expect(validate({
        ...receipt,
        supplemental_search: {
          ...supplementalSearch(),
          positive_context_findings: [{ ...finding(), authorizes_study: true }],
        },
      })).toThrow("adjacent-project endpoint context transferred to Fulton Street lane service or traversal");

      const traversalConfirmedRow = {
        ...row,
        dossier_refs: [{
          ...row.dossier_refs[0]!,
          candidate_target_match: true,
          verdict_class: "traversal_confirmed" as const,
          service_date: date,
        }],
      };
      expect(validate(receipt, traversalConfirmedRow, packet))
        .toThrow("adjacent-project endpoint context transferred to Fulton Street lane service or traversal");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
