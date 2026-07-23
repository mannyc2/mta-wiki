import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  buildBusLaneIdentityLedger,
  buildBusLaneResearchPackets,
  buildEastGunHillBindingReceiptDraft,
  buildFrCapodannoBindingReceiptDraft,
  buildMadisonAvenueBindingReceiptDraft,
  buildMultiCorridorAbsenceBindingReceiptDraft,
  buildPositiveContextBindingReceiptDraft,
  buildPureTargetAbsenceBindingReceiptDraft,
  buildTwentyFirstStreetBindingReceiptDraft,
  candidateLaneTargets,
  normalizeOpenDateToken,
  parseBusLaneIdentityDecision,
  validateBindingReceiptDrafts,
  validateOccurrenceCreatedRows,
  validateReviewedReceiptRefs,
  type BusLaneIdentityDecision,
  type BusLaneIdentityRow,
  type BusLaneResearchPacket,
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

  it("keeps historical B6 Glenwood intersection context route-exact and separate from 2018 lane service", () => {
    const date = "2018-09-30";
    const routeIds = ["B6", "B17", "B42", "B60"];
    const entries = routeIds.map((routeId) => candidate(`glenwood-${routeId}`, routeId, date));
    const laneFeatures = Array.from({ length: 5 }, (_, index) => lane({
      feature_id: `glenwood-${index}`,
      lane_group_id: "BK|GLENWOOD ROAD",
      opened: "09/30/2018",
      direction: "WB",
    }));
    const baseRows = buildBusLaneIdentityLedger({
      bridgeCandidates: entries.map((entry) => entry.bridge),
      trackerCandidates: entries.map((entry) => entry.tracker),
      routeAnchors: routeIds.map(anchor),
      dossierRows: entries.map((entry) => dossier({
        candidateId: entry.bridge.candidate_id,
        routeId: entry.tracker.route_id,
        date,
        laneGroupId: null,
        pathSource: "unavailable",
        pathIdentity: null,
        reason: "historical_schedule_unavailable_pre_2023",
      })),
      dossierArtifact: "dossier.jsonl",
      laneFeatures,
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    });
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-glenwood-intersection-"));
    const receiptDir = join(rootDir, "receipts");
    const acquiredChecksDir = join(rootDir,
      "data/quality/relationship-integrity/bus-lane-acquisition/supplemental/glenwood-fixture");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(acquiredChecksDir, { recursive: true });
    const studyUrl = "https://www.nyc.gov/existing-and-future-2015.pdf";
    const cameraUrl = "https://www.nyc.gov/bus-lane-camera-report.pdf";
    const studyBytes = Buffer.from("fixture Coney Island Gravesend transportation study PDF");
    const cameraBytes = Buffer.from("fixture 2024 bus lane camera report PDF");
    const studyHash = createHash("sha256").update(studyBytes).digest("hex");
    const cameraHash = createHash("sha256").update(cameraBytes).digest("hex");
    const sourceDir = join(rootDir, "raw", "sources", "coney-gravesend-study");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "source.pdf"), studyBytes);
    writeFileSync(join(sourceDir, "metadata.json"), JSON.stringify({
      sourceId: "coney-gravesend-study",
      sourceUrl: studyUrl,
      sha256: studyHash,
      title: "Coney Island/Gravesend Sustainable Development Transportation Study — Final Report",
      publishedDate: "2010-06-01",
    }));
    const sourceBlocks = [
      { block_id: "p179_p0019", page_number: 179, raw_text: "Glenwood Road & Nostrand" },
      { block_id: "p179_p0020", page_number: 179, raw_text: "B6 WB Ave. 10 352 700 35 348" },
    ].map((block) => ({
      source_id: "coney-gravesend-study",
      ...block,
      normalized_text: block.raw_text,
      raw_text_sha256: `sha256:${createHash("sha256").update(block.raw_text).digest("hex")}`,
    }));
    writeFileSync(join(sourceDir, "blocks.jsonl"),
      `${sourceBlocks.map((block) => JSON.stringify(block)).join("\n")}\n`);
    writeFileSync(join(acquiredChecksDir, "acquired-source-checks.json"), JSON.stringify({
      sources: [
        { url: cameraUrl, content_sha256: cameraHash, retrieval_status: "acquired" },
        { url: studyUrl, content_sha256: studyHash, retrieval_status: "acquired" },
      ],
    }));
    const priorRecords = routeIds.map((routeId) => ({
      receipt_id: `prior-${routeId}`,
      researched_on: "2026-07-15",
      source_findings: { exact_project_route_statement_found: false },
      acquisition_attempts: [
        {
          category: "official_nyc_dot_lane_project",
          query: `site:nyc.gov Glenwood Road ${routeId} bus lane`,
          query_status: "performed_2026-07-15",
          urls_checked: [cameraUrl],
          retrievals: [{ id: "camera-report", retrieved_on: "2026-07-15", sha256: cameraHash,
            status: "acquired" }],
        },
        {
          category: "official_public_board_committee",
          query: `site:nyc.gov Glenwood Road ${routeId} transportation study`,
          query_status: "performed_2026-07-15",
          urls_checked: [studyUrl],
          retrievals: [{ id: "coney-study", retrieved_on: "2026-07-15", sha256: studyHash,
            status: "acquired" }],
        },
      ],
    }));
    const priorLines = priorRecords.map((prior) => stableJson(prior as unknown as JsonValue));
    writeFileSync(join(rootDir, "prior.jsonl"), `${priorLines.join("\n")}\n`);
    const rows = baseRows.map((row) => {
      const priorIndex = routeIds.indexOf(row.gtfs_route_id);
      return {
        ...row,
        prior_acquisition_receipt: {
          receipt_id: priorRecords[priorIndex]!.receipt_id,
          artifact: "prior.jsonl",
          row_sha256: createHash("sha256").update(priorLines[priorIndex]!).digest("hex"),
          disposition: "completed_search_route_linkage_unresolved",
          next_action: "Retain only candidate-exact nonterminal context.",
        },
      };
    });
    const packets = buildBusLaneResearchPackets(rows).packets;
    const rowFor = (routeId: string) => rows.find((row) => row.gtfs_route_id === routeId)!;
    const packetFor = (routeId: string) => packets.find((packet) => packet.gtfs_route_id === routeId)!;
    const targetFor = (candidatePacket: typeof packets[number]) => {
      const matches = candidatePacket.what_is_known.target_groups.flatMap((group) => group.feature_matches);
      return {
        lane_group_ids: candidatePacket.what_is_known.target_groups.map((group) => group.lane_group_id),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        geometry_scopes: [...new Set(candidatePacket.what_is_known.target_groups
          .map((group) => group.geometry_scope))].sort(),
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
    for (const packet of packets) {
      expect(packet.unresolved_bindings).toEqual(["attribution", "traversal"]);
      expect(targetFor(packet)).toMatchObject({
        lane_group_ids: ["BK|GLENWOOD ROAD"],
        geometry_scopes: ["coextensive_with_lane_group"],
        feature_row_count: 5,
        directions: ["WB"],
        open_dates_literals: ["09/30/2018"],
      });
    }
    const evidenceRefs = () => sourceBlocks.map((block) => ({
      block_id: block.block_id,
      page_number: block.page_number,
      text_sha256: block.raw_text_sha256,
    }));
    const supplementalSearch = (routeId: string, includePositive: boolean) => ({
      domains: ["www.nyc.gov"],
      exact_queries: [
        { category: "official_nyc_dot_lane_project", query: `site:nyc.gov Glenwood Road ${routeId} bus lane`,
          query_status: "performed_2026-07-23_reviewed_results" },
        { category: "official_public_board_committee",
          query: `site:nyc.gov Glenwood Road ${routeId} transportation study`,
          query_status: "performed_2026-07-23_reviewed_results" },
      ],
      finding_corrections: [],
      operator: "fixture-reviewer",
      ...(includePositive ? {
        positive_context_findings: [{
          source_id: "coney-gravesend-study",
          source_url: studyUrl,
          source_pdf_sha256: studyHash,
          evidence_refs: evidenceRefs(),
          context_finding: {
            candidate_route_id: routeId,
            finding_kind: "positive_historical_same_corridor_intersection_nonterminal",
            supported_scope: "historical_same_corridor_intersection_only",
            unsupported_bindings: packetFor(routeId).unresolved_bindings,
            finding_summary: "The 2010 table gives B6 WB at Glenwood Road and Nostrand only as historical intersection context.",
          },
          remaining_unresolved_bindings: packetFor(routeId).unresolved_bindings,
          authorizes_study: false,
          authorizes_cross_product: false,
        }],
      } : {}),
      retrievals: [
        { category: "official_nyc_dot_lane_project", retrieved_on: "2026-07-23", sha256: cameraHash,
          status: "acquired", url: cameraUrl },
        { category: "official_public_board_committee", retrieved_on: "2026-07-23", sha256: studyHash,
          status: "acquired", url: studyUrl },
      ],
      searched_at: "2026-07-23T08:00:00Z",
      urls_inspected: [cameraUrl, studyUrl].sort(),
    });
    const receiptFor = (routeId: string, includePositive: boolean) => {
      const row = rowFor(routeId);
      const packet = packetFor(routeId);
      const priorIndex = routeIds.indexOf(routeId);
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
        target: targetFor(packet),
        prior_receipt: {
          receipt_id: priorRecords[priorIndex]!.receipt_id,
          artifact: "prior.jsonl",
          row_sha256: createHash("sha256").update(priorLines[priorIndex]!).digest("hex"),
        },
        search: {
          exact_queries: priorRecords[priorIndex]!.acquisition_attempts.map((attempt) => ({
            category: attempt.category,
            query: attempt.query,
            query_status: attempt.query_status,
          })),
          domains: ["www.nyc.gov"],
          urls_inspected: [cameraUrl, studyUrl].sort(),
          retrievals: priorRecords[priorIndex]!.acquisition_attempts.flatMap((attempt) =>
            attempt.retrievals.map((retrieval) => ({ category: attempt.category, ...retrieval }))),
          disposition: "binding_absent_after_search",
        },
        supplemental_search: supplementalSearch(routeId, includePositive),
        authorizes_study: false,
        authorizes_cross_product: false,
      };
    };
    const validate = (draft: Record<string, unknown>, candidateRow = rowFor("B6"),
      candidatePacket = packetFor("B6")) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
      return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
    };
    try {
      const b6Receipt = receiptFor("B6", true);
      expect(validate(b6Receipt)).not.toThrow();

      for (const routeId of ["B17", "B42", "B60"]) {
        const absenceReceipt = receiptFor(routeId, false);
        expect(validate(absenceReceipt, rowFor(routeId), packetFor(routeId))).not.toThrow();
        expect(validate({
          ...absenceReceipt,
          supplemental_search: supplementalSearch(routeId, true),
        }, rowFor(routeId), packetFor(routeId)))
          .toThrow("does not bind the exact route to bounded corridor-service context");
      }

      const wrongTargetPacket = {
        ...packetFor("B6"),
        what_is_known: {
          ...packetFor("B6").what_is_known,
          target_groups: packetFor("B6").what_is_known.target_groups.map((group) => ({
            ...group,
            facility: "Flatlands Avenue",
            lane_group_id: "BK|FLATLANDS AVENUE",
            street: "FLATLANDS AVENUE",
          })),
        },
      };
      expect(validate({ ...b6Receipt, target: targetFor(wrongTargetPacket) }, rowFor("B6"), wrongTargetPacket))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      const crossDate = "2018-10-01";
      const crossDateRow = { ...rowFor("B6"), implementation_date: crossDate };
      const crossDatePacket = {
        ...packetFor("B6"),
        implementation_date: crossDate,
        what_is_known: {
          ...packetFor("B6").what_is_known,
          target_groups: packetFor("B6").what_is_known.target_groups.map((group) => ({
            ...group,
            feature_matches: group.feature_matches.map((match) => ({
              ...match,
              matched_date: crossDate,
              matched_token_literal: "10/01/2018",
              open_dates_literal: "10/01/2018",
            })),
          })),
        },
      };
      expect(validate({ ...b6Receipt, implementation_date: crossDate, target: targetFor(crossDatePacket) },
        crossDateRow, crossDatePacket))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      const mismatchedFeatureDatePacket = {
        ...packetFor("B6"),
        what_is_known: {
          ...packetFor("B6").what_is_known,
          target_groups: packetFor("B6").what_is_known.target_groups.map((group) => ({
            ...group,
            feature_matches: group.feature_matches.map((match) => ({ ...match, matched_date: crossDate })),
          })),
        },
      };
      expect(validate(b6Receipt, rowFor("B6"), mismatchedFeatureDatePacket))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      const fourRowPacket = {
        ...packetFor("B6"),
        what_is_known: {
          ...packetFor("B6").what_is_known,
          target_groups: packetFor("B6").what_is_known.target_groups.map((group) => ({
            ...group,
            feature_matches: group.feature_matches.slice(1),
          })),
        },
      };
      expect(validate({ ...b6Receipt, target: targetFor(fourRowPacket) }, rowFor("B6"), fourRowPacket))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      expect(validate({
        ...b6Receipt,
        supplemental_search: {
          ...supplementalSearch("B6", true),
          positive_context_findings: [{
            ...supplementalSearch("B6", true).positive_context_findings![0]!,
            context_finding: {
              ...supplementalSearch("B6", true).positive_context_findings![0]!.context_finding,
              finding_kind: "positive_project_corridor_service_nonterminal",
              supported_scope: "project_corridor_service_only",
            },
          }],
        },
      })).toThrow("positive context exceeds its nonauthorizing project-corridor scope");

      expect(validate({
        ...b6Receipt,
        supplemental_search: {
          ...supplementalSearch("B6", true),
          positive_context_findings: [{
            ...supplementalSearch("B6", true).positive_context_findings![0]!,
            evidence_refs: evidenceRefs().slice(1),
          }],
        },
      })).toThrow("does not bind the exact route to bounded corridor-service context");

      for (const missingBinding of ["attribution", "traversal"]) {
        const reduced = packetFor("B6").unresolved_bindings.filter((binding) => binding !== missingBinding);
        const reducedPacket = { ...packetFor("B6"), unresolved_bindings: reduced };
        const positive = supplementalSearch("B6", true).positive_context_findings![0]!;
        expect(validate({
          ...b6Receipt,
          unresolved_bindings: reduced,
          supplemental_search: {
            ...supplementalSearch("B6", true),
            positive_context_findings: [{
              ...positive,
              context_finding: { ...positive.context_finding, unsupported_bindings: reduced },
              remaining_unresolved_bindings: reduced,
            }],
          },
        }, rowFor("B6"), reducedPacket))
          .toThrow("does not bind the exact route to bounded corridor-service context");
      }

      expect(validate({
        ...b6Receipt,
        supplemental_search: {
          ...supplementalSearch("B6", true),
          positive_context_findings: [{
            ...supplementalSearch("B6", true).positive_context_findings![0]!,
            authorizes_study: true,
          }],
        },
      })).toThrow("historical intersection context transferred to 2018 Glenwood Road lane service or traversal");

      const traversalConfirmedRow = {
        ...rowFor("B6"),
        dossier_refs: [{
          ...rowFor("B6").dossier_refs[0]!,
          candidate_target_match: true,
          verdict_class: "traversal_confirmed" as const,
          service_date: date,
        }],
      };
      expect(validate(b6Receipt, traversalConfirmedRow, packetFor("B6")))
        .toThrow("historical intersection context transferred to 2018 Glenwood Road lane service or traversal");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("keeps Kings Highway project context exact to 67 candidate-date rows and explicit route aliases", () => {
    const date = "2018-10-05";
    const routeIds = ["B82", "B90", "B100", "B44+", "B44", "B82+", "B31", "B7"];
    const entries = routeIds.map((routeId) => candidate(`kings-${routeId}`, routeId, date));
    const laneFeatures = Array.from({ length: 67 }, (_, index) => lane({
      feature_id: `kings-${index % 36}`,
      lane_group_id: "BK|KINGS HIGHWAY",
      opened: "10/05/2018",
      direction: index < 36 ? "EB" : "WB",
      attributes: {
        open_dates: "10/05/2018",
        sbs_route1: "B82",
        segmentid: `kings-${index}`,
      },
    }));
    const baseRows = buildBusLaneIdentityLedger({
      bridgeCandidates: entries.map((entry) => entry.bridge),
      trackerCandidates: entries.map((entry) => entry.tracker),
      routeAnchors: routeIds.map(anchor),
      dossierRows: entries.map((entry) => dossier({
        candidateId: entry.bridge.candidate_id,
        routeId: entry.tracker.route_id,
        date,
        laneGroupId: null,
        pathSource: "unavailable",
        pathIdentity: null,
        reason: "historical_schedule_unavailable_pre_2023",
      })),
      dossierArtifact: "dossier.jsonl",
      laneFeatures,
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    });
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-kings-highway-"));
    const receiptDir = join(rootDir, "receipts");
    const acquiredChecksDir = join(rootDir,
      "data/quality/relationship-integrity/bus-lane-acquisition/supplemental/kings-fixture");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(acquiredChecksDir, { recursive: true });
    const projectUrl = "https://www.nyc.gov/html/brt/downloads/pdf/brt-south-brooklyn-b82-mar2018.pdf";
    const cameraUrl = "https://www.nyc.gov/bus-lane-camera-report.pdf";
    const projectBytes = Buffer.from("fixture Southern Brooklyn B82 March 2018 PDF");
    const cameraBytes = Buffer.from("fixture bus lane camera report");
    const projectHash = createHash("sha256").update(projectBytes).digest("hex");
    const cameraHash = createHash("sha256").update(cameraBytes).digest("hex");
    const sourceDir = join(rootDir, "raw", "sources", "brt_south_brooklyn_b82_mar2018");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "source.pdf"), projectBytes);
    writeFileSync(join(sourceDir, "metadata.json"), JSON.stringify({
      sourceId: "brt_south_brooklyn_b82_mar2018",
      sourceUrl: projectUrl,
      sha256: `sha256:${projectHash}`,
      title: "Download the presentation (pdf)",
      documentDate: "2018-03",
      sourceGroup: "bus_priority_document",
    }));
    const sourceBlocks = [
      { block_id: "p020_c0001", page_number: 20, raw_text: "B82 SBS 2018 Street Changes" },
      { block_id: "p021_c0001", page_number: 21,
        raw_text: "Existing: Kings Highway (E 23 St to Ave K)" },
      { block_id: "p021_c0002", page_number: 21,
        raw_text: "Major east-west transit corridor on Kings Highway used by B82 Local, B82 Limited, B7 Local, and other buses along Kings Hwy" },
      { block_id: "p029_c0001", page_number: 29, raw_text: "Kings Hwy: 2018 Transit Improvements" },
      { block_id: "p029_c0002", page_number: 29,
        raw_text: "Proposed bus lanes on Kings Hwy with a LOCAL BUS stop and an SBS BUS stop" },
    ].map((block) => ({
      source_id: "brt_south_brooklyn_b82_mar2018",
      ...block,
      normalized_text: block.raw_text,
      raw_text_sha256: `sha256:${createHash("sha256").update(block.raw_text).digest("hex")}`,
    }));
    writeFileSync(join(sourceDir, "blocks.jsonl"),
      `${sourceBlocks.map((block) => JSON.stringify(block)).join("\n")}\n`);
    writeFileSync(join(acquiredChecksDir, "acquired-source-checks.json"), JSON.stringify({
      sources: [
        { url: cameraUrl, content_sha256: cameraHash, retrieval_status: "acquired" },
        { url: projectUrl, content_sha256: projectHash, retrieval_status: "acquired" },
      ],
    }));
    const priorRecords = routeIds.map((routeId) => ({
      receipt_id: `prior-kings-${routeId}`,
      researched_on: "2026-07-15",
      source_findings: { exact_project_route_statement_found: routeId === "B82+" },
      acquisition_attempts: [
        {
          category: "official_nyc_dot_lane_project",
          query: `site:nyc.gov Kings Highway ${routeId} bus lane`,
          query_status: "performed_2026-07-15",
          urls_checked: [cameraUrl],
          retrievals: [{ id: "camera", retrieved_on: "2026-07-15", sha256: cameraHash,
            status: "acquired" }],
        },
        {
          category: "official_public_board_committee",
          query: `site:nyc.gov Kings Highway ${routeId} board`,
          query_status: "performed_2026-07-15",
          urls_checked: [projectUrl],
          retrievals: [{ id: "b82-project", retrieved_on: "2026-07-15", sha256: projectHash,
            status: "acquired" }],
        },
      ],
    }));
    const priorLines = priorRecords.map((prior) => stableJson(prior as unknown as JsonValue));
    writeFileSync(join(rootDir, "prior.jsonl"), `${priorLines.join("\n")}\n`);
    const rows = baseRows.map((row) => {
      const priorIndex = routeIds.indexOf(row.gtfs_route_id);
      return {
        ...row,
        prior_acquisition_receipt: {
          receipt_id: priorRecords[priorIndex]!.receipt_id,
          artifact: "prior.jsonl",
          row_sha256: createHash("sha256").update(priorLines[priorIndex]!).digest("hex"),
          disposition: "completed_search_route_linkage_unresolved",
          next_action: "Retain only exact nonterminal route context.",
        },
      };
    });
    const packets = buildBusLaneResearchPackets(rows).packets;
    const rowFor = (routeId: string) => rows.find((row) => row.gtfs_route_id === routeId)!;
    const packetFor = (routeId: string) => packets.find((packet) => packet.gtfs_route_id === routeId)!;
    const targetFor = (candidatePacket: typeof packets[number]) => {
      const matches = candidatePacket.what_is_known.target_groups.flatMap((group) => group.feature_matches);
      return {
        lane_group_ids: candidatePacket.what_is_known.target_groups.map((group) => group.lane_group_id),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        geometry_scopes: [...new Set(candidatePacket.what_is_known.target_groups
          .map((group) => group.geometry_scope))].sort(),
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
    for (const routeId of routeIds) {
      expect(packetFor(routeId).unresolved_bindings).toEqual(routeId === "B82"
        ? ["direction", "traversal"]
        : ["attribution", "direction", "traversal"]);
      expect(targetFor(packetFor(routeId))).toMatchObject({
        lane_group_ids: ["BK|KINGS HIGHWAY"],
        geometry_scopes: ["coextensive_with_lane_group"],
        feature_row_count: 67,
        directions: ["EB", "WB"],
        open_dates_literals: ["10/05/2018"],
        named_sbs_routes: ["B82"],
      });
      expect(targetFor(packetFor(routeId)).feature_keys).toHaveLength(67);
      expect(targetFor(packetFor(routeId)).feature_ids).toHaveLength(36);
    }
    const evidenceRefs = (ids = sourceBlocks.map((block) => block.block_id)) => sourceBlocks
      .filter((block) => ids.includes(block.block_id))
      .map((block) => ({
        block_id: block.block_id,
        page_number: block.page_number,
        text_sha256: block.raw_text_sha256,
      }));
    const findingCorrection = (routeId: "B82" | "B7") => ({
      prior_claim_path: "source_findings.exact_project_route_statement_found",
      prior_claim_value: false,
      supersedes_prior_finding: true,
      source_id: "brt_south_brooklyn_b82_mar2018",
      source_url: projectUrl,
      source_pdf_sha256: projectHash,
      evidence_refs: evidenceRefs(),
      corrected_finding: {
        candidate_route_id: routeId,
        finding_kind: "positive_project_corridor_service_nonterminal",
        supported_scope: "project_corridor_service_only",
        unsupported_bindings: packetFor(routeId).unresolved_bindings,
        finding_summary: `${routeId} is named as local service on Kings Highway, without direction or candidate-date traversal proof.`,
      },
      remaining_unresolved_bindings: packetFor(routeId).unresolved_bindings,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    const b82SbsPositiveContext = () => ({
      source_id: "brt_south_brooklyn_b82_mar2018",
      source_url: projectUrl,
      source_pdf_sha256: projectHash,
      evidence_refs: evidenceRefs(),
      context_finding: {
        candidate_route_id: "B82+",
        finding_kind: "positive_project_corridor_service_nonterminal",
        supported_scope: "project_corridor_service_only",
        unsupported_bindings: packetFor("B82+").unresolved_bindings,
        finding_summary: "The source explicitly names B82 SBS project changes and Kings Highway improvements, without exact row traversal proof.",
      },
      remaining_unresolved_bindings: packetFor("B82+").unresolved_bindings,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    const supplementalSearch = (routeId: string) => ({
      domains: ["www.nyc.gov"],
      exact_queries: [
        { category: "official_nyc_dot_lane_project", query: `site:nyc.gov Kings Highway ${routeId} bus lane`,
          query_status: "performed_2026-07-23_reviewed_results" },
        { category: "official_public_board_committee", query: `site:nyc.gov Kings Highway ${routeId} board`,
          query_status: "performed_2026-07-23_reviewed_results" },
      ],
      finding_corrections: routeId === "B82" || routeId === "B7"
        ? [findingCorrection(routeId)]
        : [],
      ...(routeId === "B82+" ? { positive_context_findings: [b82SbsPositiveContext()] } : {}),
      operator: "fixture-reviewer",
      retrievals: [
        { category: "official_nyc_dot_lane_project", retrieved_on: "2026-07-23", sha256: cameraHash,
          status: "acquired", url: cameraUrl },
        { category: "official_public_board_committee", retrieved_on: "2026-07-23", sha256: projectHash,
          status: "acquired", url: projectUrl },
      ],
      searched_at: "2026-07-23T08:00:00Z",
      urls_inspected: [cameraUrl, projectUrl].sort(),
    });
    const receiptFor = (routeId: string) => {
      const row = rowFor(routeId);
      const packet = packetFor(routeId);
      const priorIndex = routeIds.indexOf(routeId);
      return {
        schema_version: 1,
        receipt_id: `binding-kings-${routeId}`,
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
        target: targetFor(packet),
        prior_receipt: {
          receipt_id: priorRecords[priorIndex]!.receipt_id,
          artifact: "prior.jsonl",
          row_sha256: createHash("sha256").update(priorLines[priorIndex]!).digest("hex"),
        },
        search: {
          exact_queries: priorRecords[priorIndex]!.acquisition_attempts.map((attempt) => ({
            category: attempt.category,
            query: attempt.query,
            query_status: attempt.query_status,
          })),
          domains: ["www.nyc.gov"],
          urls_inspected: [cameraUrl, projectUrl].sort(),
          retrievals: priorRecords[priorIndex]!.acquisition_attempts.flatMap((attempt) =>
            attempt.retrievals.map((retrieval) => ({ category: attempt.category, ...retrieval }))),
          disposition: "binding_absent_after_search",
        },
        supplemental_search: supplementalSearch(routeId),
        authorizes_study: false,
        authorizes_cross_product: false,
      };
    };
    const validate = (draft: Record<string, unknown>, candidateRow: typeof rows[number],
      candidatePacket: typeof packets[number]) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
      return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
    };
    try {
      for (const routeId of routeIds) {
        expect(validate(receiptFor(routeId), rowFor(routeId), packetFor(routeId))).not.toThrow();
      }

      const b82SbsReceipt = receiptFor("B82+");
      expect(validate({
        ...b82SbsReceipt,
        supplemental_search: {
          ...supplementalSearch("B82+"),
          positive_context_findings: [{
            ...b82SbsPositiveContext(),
            evidence_refs: evidenceRefs().filter((ref) => ref.block_id !== "p020_c0001"),
          }],
        },
      }, rowFor("B82+"), packetFor("B82+")))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      const b31Receipt = receiptFor("B31");
      expect(validate({
        ...b31Receipt,
        supplemental_search: {
          ...supplementalSearch("B31"),
          positive_context_findings: [{
            ...b82SbsPositiveContext(),
            context_finding: {
              ...b82SbsPositiveContext().context_finding,
              candidate_route_id: "B31",
              unsupported_bindings: packetFor("B31").unresolved_bindings,
            },
            remaining_unresolved_bindings: packetFor("B31").unresolved_bindings,
          }],
        },
      }, rowFor("B31"), packetFor("B31")))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      const b82Receipt = receiptFor("B82");
      const mutatePacketFor = (routeId: string,
        mutate: (matches: typeof packets[number]["what_is_known"]["target_groups"][number]["feature_matches"]) =>
        typeof packets[number]["what_is_known"]["target_groups"][number]["feature_matches"]) => ({
        ...packetFor(routeId),
        what_is_known: {
          ...packetFor(routeId).what_is_known,
          target_groups: packetFor(routeId).what_is_known.target_groups.map((group) => ({
            ...group,
            feature_matches: mutate(group.feature_matches),
          })),
        },
      });
      const mutatePacket = (mutate: Parameters<typeof mutatePacketFor>[1]) => mutatePacketFor("B82", mutate);
      const multiplicityMutations = [
        mutatePacket((matches) => matches.slice(1)),
        mutatePacket((matches) => matches.map((match, index) =>
          index === 0 ? { ...match, feature_id: "kings-extra-id" } : match)),
        mutatePacket((matches) => matches.map((match, index) =>
          index === 0 ? { ...match, feature_key: "dot-lane-feature:ffffffffffffffffffffffff" } : match)),
        mutatePacket((matches) => matches.map((match, index) =>
          index === 0 ? { ...match, feature_id: matches[1]!.feature_id } : match)),
        mutatePacket((matches) => matches.map((match, index) =>
          index === 0 ? { ...match, matched_date: "2018-10-06" } : match)),
        mutatePacket((matches) => matches.map((match, index) =>
          index === 0 ? { ...match, direction: match.direction === "EB" ? "WB" : "EB" } : match)),
        mutatePacket((matches) => matches.map((match) => ({ ...match, direction: "EB" }))),
        mutatePacket((matches) => matches.map((match, index) =>
          index === 0 ? { ...match, sbs_routes: ["B31"] } : match)),
      ];
      for (const mutatedPacket of multiplicityMutations) {
        expect(validate({ ...b82Receipt, target: targetFor(mutatedPacket) }, rowFor("B82"), mutatedPacket))
          .toThrow("Kings Highway packet target does not preserve exact ledger occurrence parity");
      }

      for (const absenceRouteId of ["B31", "B100"]) {
        const absenceReceipt = receiptFor(absenceRouteId);
        const absencePacketMutations = [
          mutatePacketFor(absenceRouteId, (matches) => matches.map((match, index) =>
            index === 0 ? { ...match, feature_key: "dot-lane-feature:eeeeeeeeeeeeeeeeeeeeeeee" } : match)),
          mutatePacketFor(absenceRouteId, (matches) => matches.map((match, index) =>
            index === 0 ? { ...match, feature_id: matches[1]!.feature_id } : match)),
          mutatePacketFor(absenceRouteId, (matches) => matches.map((match, index) =>
            index === 0 ? { ...match, direction: match.direction === "EB" ? "WB" : "EB" } : match)),
        ];
        for (const mutatedPacket of absencePacketMutations) {
          expect(validate({ ...absenceReceipt, target: targetFor(mutatedPacket) },
            rowFor(absenceRouteId), mutatedPacket))
            .toThrow("Kings Highway packet target does not preserve exact ledger occurrence parity");
        }
      }

      const droppedTraversal = packetFor("B82").unresolved_bindings.filter((binding) => binding !== "traversal");
      const droppedTraversalPacket = { ...packetFor("B82"), unresolved_bindings: droppedTraversal };
      const correction = findingCorrection("B82");
      expect(validate({
        ...b82Receipt,
        unresolved_bindings: droppedTraversal,
        supplemental_search: {
          ...supplementalSearch("B82"),
          finding_corrections: [{
            ...correction,
            corrected_finding: { ...correction.corrected_finding, unsupported_bindings: droppedTraversal },
            remaining_unresolved_bindings: droppedTraversal,
          }],
        },
      }, rowFor("B82"), droppedTraversalPacket))
        .toThrow("does not bind the exact route to its typed project context");

      expect(validate({
        ...b82Receipt,
        supplemental_search: {
          ...supplementalSearch("B82"),
          finding_corrections: [{ ...findingCorrection("B82"), authorizes_study: true }],
        },
      }, rowFor("B82"), packetFor("B82")))
        .toThrow("correction exceeds its nonauthorizing unresolved-binding scope");

      const duplicateB82Correction = findingCorrection("B82");
      expect(validate({
        ...b82Receipt,
        supplemental_search: {
          ...supplementalSearch("B82"),
          finding_corrections: [duplicateB82Correction, duplicateB82Correction],
        },
      }, rowFor("B82"), packetFor("B82")))
        .toThrow("Kings Highway correction/context cardinality does not match the exact candidate route");

      const duplicateB82SbsContext = b82SbsPositiveContext();
      expect(validate({
        ...b82SbsReceipt,
        supplemental_search: {
          ...supplementalSearch("B82+"),
          positive_context_findings: [duplicateB82SbsContext, duplicateB82SbsContext],
        },
      }, rowFor("B82+"), packetFor("B82+")))
        .toThrow("Kings Highway correction/context cardinality does not match the exact candidate route");

      const traversalConfirmedRow = {
        ...rowFor("B82"),
        dossier_refs: [{
          ...rowFor("B82").dossier_refs[0]!,
          candidate_target_match: true,
          lane_group_id: "BK|KINGS HIGHWAY",
          verdict_class: "traversal_confirmed" as const,
          service_date: date,
        }],
      };
      expect(validate(b82Receipt, traversalConfirmedRow, packetFor("B82")))
        .toThrow("Kings Highway project context transferred to candidate-date traversal");

      const falsePrior = { ...priorRecords[routeIds.indexOf("B82+")]!,
        source_findings: { exact_project_route_statement_found: false } };
      const falsePriorLine = stableJson(falsePrior as unknown as JsonValue);
      writeFileSync(join(rootDir, "false-prior.jsonl"), `${falsePriorLine}\n`);
      const falsePriorRow = {
        ...rowFor("B82+"),
        prior_acquisition_receipt: {
          ...rowFor("B82+").prior_acquisition_receipt!,
          artifact: "false-prior.jsonl",
          row_sha256: createHash("sha256").update(falsePriorLine).digest("hex"),
        },
      };
      const falsePriorPacket = buildBusLaneResearchPackets([falsePriorRow]).packets[0]!;
      expect(validate({
        ...b82SbsReceipt,
        prior_receipt: {
          receipt_id: falsePrior.receipt_id,
          artifact: "false-prior.jsonl",
          row_sha256: falsePriorRow.prior_acquisition_receipt.row_sha256,
        },
      }, falsePriorRow, falsePriorPacket))
        .toThrow("positive context exceeds its nonauthorizing project-corridor scope");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("keeps historical Utica intersections separate from exact 2014 through 2016 lane rows", () => {
    const date = "2014-08-25";
    const b8Date = "2015-10-16";
    const b15Date = "2016-06-03";
    const routeIds = ["B12", "B14", "B8", "B15"];
    const entries = routeIds.map((routeId) =>
      candidate(`utica-${routeId}`, routeId,
        routeId === "B8" ? b8Date : routeId === "B15" ? b15Date : date));
    const laneFeatures = [
      ...Array.from({ length: 26 }, (_, index) => lane({
        feature_id: `utica-${index % 16}`,
        lane_group_id: "BK|UTICA AVENUE",
        opened: "8/25/2014",
        direction: index < 16 ? "NB" : "SB",
        attributes: { open_dates: "8/25/2014", sbs_route1: "B46", segmentid: `utica-${index}` },
      })),
      ...Array.from({ length: 48 }, (_, index) => lane({
        feature_id: `utica-2015-${index % 26}`,
        lane_group_id: "BK|UTICA AVENUE",
        opened: "10/16/2015",
        direction: index < 26 ? "NB" : "SB",
        attributes: {
          open_dates: "10/16/2015", sbs_route1: "B46", segmentid: `utica-2015-${index}`,
        },
      })),
      ...Array.from({ length: 3 }, (_, index) => lane({
        feature_id: `utica-2016-${index}`,
        lane_group_id: "BK|UTICA AVENUE",
        opened: "6/3/2016",
        direction: "NB",
        attributes: { open_dates: "6/3/2016", sbs_route1: "B46", segmentid: `utica-2016-${index}` },
      })),
      lane({
        feature_id: "utica-older",
        lane_group_id: "BK|UTICA AVENUE",
        opened: "11/17/2013",
        direction: "SB",
        attributes: { open_dates: "11/17/2013", sbs_route1: "B46", segmentid: "utica-older" },
      }),
    ];
    const baseRows = buildBusLaneIdentityLedger({
      bridgeCandidates: entries.map((entry) => entry.bridge),
      trackerCandidates: entries.map((entry) => entry.tracker),
      routeAnchors: routeIds.map(anchor),
      dossierRows: entries.map((entry) => dossier({
        candidateId: entry.bridge.candidate_id,
        routeId: entry.tracker.route_id,
        date: entry.tracker.implementation_date,
        laneGroupId: null,
        pathSource: "unavailable",
        pathIdentity: null,
        reason: "historical_schedule_unavailable_pre_2023",
      })),
      dossierArtifact: "dossier.jsonl",
      laneFeatures,
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    });
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-utica-intersections-"));
    const receiptDir = join(rootDir, "receipts");
    const acquiredChecksDir = join(rootDir,
      "data/quality/relationship-integrity/bus-lane-acquisition/supplemental/utica-fixture");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(acquiredChecksDir, { recursive: true });
    const studyUrl = "https://www.nyc.gov/html/brt/downloads/pdf/2013-09-24-sbs-utica-cb9.pdf";
    const cameraUrl = "https://www.nyc.gov/bus-lane-camera-report.pdf";
    const studyBytes = Buffer.from("fixture official 2013 Utica Avenue study PDF");
    const cameraBytes = Buffer.from("fixture official bus-lane report PDF");
    const studyHash = createHash("sha256").update(studyBytes).digest("hex");
    const cameraHash = createHash("sha256").update(cameraBytes).digest("hex");
    const sourceDir = join(rootDir, "raw", "sources", "2013_09_24_sbs_utica_cb9");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "source.pdf"), studyBytes);
    writeFileSync(join(sourceDir, "metadata.json"), JSON.stringify({
      sourceId: "2013_09_24_sbs_utica_cb9",
      sourceUrl: studyUrl,
      sha256: `sha256:${studyHash}`,
      title: "Download the slideshow (pdf)",
      documentDate: "2013",
      sourceGroup: "select_bus_service",
    }));
    const sourceBlocks = [
      { block_id: "p002_c0002", page_number: 2, raw_text: "Project Overview" },
      { block_id: "p002_c0003", page_number: 2,
        raw_text: "The Utica Avenue project runs from St Johns Place to Church Avenue." },
      { block_id: "p002_c0004", page_number: 2,
        raw_text: "Key intersections at Eastern Parkway, Empire and Lefferts, and Church Avenue." },
      { block_id: "p003_c0001", page_number: 3, raw_text: "Transit Needs: B46 Bus Service" },
      { block_id: "p003_c0003", page_number: 3,
        raw_text: "The B46 route follows Utica Avenue; Dean St (B15), Bergen St (B15), St Johns Pl, " +
          "Eastern Pkwy (B14), Empire Blvd (B12), Lefferts Av (B12), Church Av, Avenue D (B8)." },
    ].map((block) => ({
      source_id: "2013_09_24_sbs_utica_cb9",
      ...block,
      normalized_text: block.raw_text,
      raw_text_sha256: `sha256:${createHash("sha256").update(block.raw_text).digest("hex")}`,
    }));
    writeFileSync(join(sourceDir, "blocks.jsonl"),
      `${sourceBlocks.map((block) => JSON.stringify(block)).join("\n")}\n`);
    writeFileSync(join(acquiredChecksDir, "acquired-source-checks.json"), JSON.stringify({
      sources: [
        { url: cameraUrl, content_sha256: cameraHash, retrieval_status: "acquired" },
        { url: studyUrl, content_sha256: studyHash, retrieval_status: "acquired" },
      ],
    }));
    const priorRecords = routeIds.map((routeId) => ({
      receipt_id: `prior-utica-${routeId}`,
      researched_on: "2026-07-15",
      source_findings: { exact_project_route_statement_found: false },
      acquisition_attempts: [
        {
          category: "official_nyc_dot_lane_project",
          query: `site:nyc.gov Utica Avenue ${routeId} bus lane`,
          query_status: "performed_2026-07-15",
          urls_checked: [cameraUrl],
          retrievals: [{ id: "camera", retrieved_on: "2026-07-15", sha256: cameraHash,
            status: "acquired" }],
        },
        {
          category: "official_public_board_committee",
          query: `site:nyc.gov Utica Avenue ${routeId} project map`,
          query_status: "performed_2026-07-15",
          urls_checked: [studyUrl],
          retrievals: [{ id: "utica-study", retrieved_on: "2026-07-15", sha256: studyHash,
            status: "acquired" }],
        },
      ],
    }));
    const priorLines = priorRecords.map((prior) => stableJson(prior as unknown as JsonValue));
    writeFileSync(join(rootDir, "prior.jsonl"), `${priorLines.join("\n")}\n`);
    const rows = baseRows.map((row) => {
      const index = routeIds.indexOf(row.gtfs_route_id);
      return {
        ...row,
        prior_acquisition_receipt: {
          receipt_id: priorRecords[index]!.receipt_id,
          artifact: "prior.jsonl",
          row_sha256: createHash("sha256").update(priorLines[index]!).digest("hex"),
          disposition: "completed_search_route_linkage_unresolved",
          next_action: "Retain only historical project-intersection context.",
        },
      };
    });
    const packets = buildBusLaneResearchPackets(rows).packets;
    const rowFor = (routeId: string) => rows.find((row) => row.gtfs_route_id === routeId)!;
    const packetFor = (routeId: string) => packets.find((packet) => packet.gtfs_route_id === routeId)!;
    const targetFor = (candidatePacket: typeof packets[number]) => {
      const matches = candidatePacket.what_is_known.target_groups.flatMap((group) => group.feature_matches);
      return {
        lane_group_ids: candidatePacket.what_is_known.target_groups.map((group) => group.lane_group_id),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        geometry_scopes: [...new Set(candidatePacket.what_is_known.target_groups
          .map((group) => group.geometry_scope))].sort(),
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
    for (const routeId of routeIds) {
      expect(packetFor(routeId).unresolved_bindings).toEqual(routeId === "B15"
        ? ["attribution", "feature_extent", "phase", "traversal"]
        : ["attribution", "direction", "feature_extent", "phase", "traversal"]);
      expect(targetFor(packetFor(routeId))).toMatchObject({
        lane_group_ids: ["BK|UTICA AVENUE"],
        geometry_scopes: ["mixed_date_feature_union"],
        feature_row_count: routeId === "B8" ? 48 : routeId === "B15" ? 3 : 26,
        directions: routeId === "B15" ? ["NB"] : ["NB", "SB"],
        open_dates_literals: [routeId === "B8" ? "10/16/2015" :
          routeId === "B15" ? "6/3/2016" : "8/25/2014"],
        named_sbs_routes: ["B46"],
      });
      expect(targetFor(packetFor(routeId)).feature_keys)
        .toHaveLength(routeId === "B8" ? 48 : routeId === "B15" ? 3 : 26);
      expect(targetFor(packetFor(routeId)).feature_ids)
        .toHaveLength(routeId === "B8" ? 26 : routeId === "B15" ? 3 : 16);
    }
    const evidenceRefs = () => sourceBlocks.map((block) => ({
      block_id: block.block_id,
      page_number: block.page_number,
      text_sha256: block.raw_text_sha256,
    }));
    const positiveContext = (routeId: string) => ({
      source_id: "2013_09_24_sbs_utica_cb9",
      source_url: studyUrl,
      source_pdf_sha256: studyHash,
      evidence_refs: evidenceRefs(),
      context_finding: {
        candidate_route_id: routeId,
        finding_kind: routeId === "B8" || routeId === "B15"
          ? "positive_historical_outside_project_extent_intersection_connection_nonterminal"
          : "positive_historical_project_intersection_connection_nonterminal",
        supported_scope: routeId === "B8" || routeId === "B15"
          ? "historical_outside_project_extent_intersection_connection_only"
          : "historical_project_intersection_connection_only",
        unsupported_bindings: packetFor(routeId).unresolved_bindings,
        finding_summary: routeId === "B8"
          ? "B8 appears only at Avenue D, beyond the historical project's Church Avenue endpoint."
          : routeId === "B15"
            ? "B15 appears only at Dean and Bergen, north of the historical project's St Johns endpoint."
            : `${routeId} appears only as a connecting route at a named Utica project intersection.`,
      },
      remaining_unresolved_bindings: packetFor(routeId).unresolved_bindings,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    const supplementalSearch = (routeId: string) => ({
      domains: ["www.nyc.gov"],
      exact_queries: [
        { category: "official_nyc_dot_lane_project", query: `site:nyc.gov Utica Avenue ${routeId} bus lane`,
          query_status: "performed_2026-07-23_reviewed_results" },
        { category: "official_public_board_committee", query: `site:nyc.gov Utica Avenue ${routeId} project map`,
          query_status: "performed_2026-07-23_reviewed_results" },
      ],
      finding_corrections: [],
      positive_context_findings: [positiveContext(routeId)],
      operator: "fixture-reviewer",
      retrievals: [
        { category: "official_nyc_dot_lane_project", retrieved_on: "2026-07-23", sha256: cameraHash,
          status: "acquired", url: cameraUrl },
        { category: "official_public_board_committee", retrieved_on: "2026-07-23", sha256: studyHash,
          status: "acquired", url: studyUrl },
      ],
      searched_at: "2026-07-23T10:00:00Z",
      urls_inspected: [cameraUrl, studyUrl].sort(),
    });
    const receiptFor = (routeId: string) => {
      const row = rowFor(routeId);
      const packet = packetFor(routeId);
      const index = routeIds.indexOf(routeId);
      return {
        schema_version: 1,
        receipt_id: `binding-utica-${routeId}`,
        receipt_kind: "binding_absent_after_search",
        candidate_id: row.candidate_id,
        candidate_fingerprint: row.candidate_fingerprint,
        gtfs_route_id: routeId,
        implementation_date: row.implementation_date,
        gap_ids: [row.ledger_id],
        searched_at: "2026-07-15",
        operator: "fixture-reviewer",
        candidate_urls: [],
        disposition: "binding_absent_after_search",
        missing_binding: packet.missing_binding,
        unresolved_bindings: packet.unresolved_bindings,
        target: targetFor(packet),
        prior_receipt: {
          receipt_id: priorRecords[index]!.receipt_id,
          artifact: "prior.jsonl",
          row_sha256: createHash("sha256").update(priorLines[index]!).digest("hex"),
        },
        search: {
          exact_queries: priorRecords[index]!.acquisition_attempts.map((attempt) => ({
            category: attempt.category, query: attempt.query, query_status: attempt.query_status,
          })),
          domains: ["www.nyc.gov"],
          urls_inspected: [cameraUrl, studyUrl].sort(),
          retrievals: priorRecords[index]!.acquisition_attempts.flatMap((attempt) =>
            attempt.retrievals.map((retrieval) => ({ category: attempt.category, ...retrieval }))),
          disposition: "binding_absent_after_search",
        },
        supplemental_search: supplementalSearch(routeId),
        authorizes_study: false,
        authorizes_cross_product: false,
      };
    };
    const validate = (draft: Record<string, unknown>, candidateRow: typeof rows[number],
      candidatePacket: typeof packets[number]) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
      return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
    };
    const mutatePacketFor = (routeId: string,
      mutate: (matches: typeof packets[number]["what_is_known"]["target_groups"][number]["feature_matches"]) =>
      typeof packets[number]["what_is_known"]["target_groups"][number]["feature_matches"]) => ({
      ...packetFor(routeId),
      what_is_known: {
        ...packetFor(routeId).what_is_known,
        target_groups: packetFor(routeId).what_is_known.target_groups.map((group) => ({
          ...group,
          feature_matches: mutate(group.feature_matches),
        })),
      },
    });
    try {
      for (const routeId of routeIds) {
        expect(validate(receiptFor(routeId), rowFor(routeId), packetFor(routeId))).not.toThrow();
      }

      for (const routeId of routeIds) {
        const receipt = receiptFor(routeId);
        const mutations = [
          mutatePacketFor(routeId, (matches) => matches.map((match, index) =>
            index === 0 ? { ...match, feature_key: "dot-lane-feature:dddddddddddddddddddddddd" } : match)),
          mutatePacketFor(routeId, (matches) => matches.map((match, index) =>
            index === 0 ? { ...match, feature_id: matches[1]!.feature_id } : match)),
          mutatePacketFor(routeId, (matches) => matches.map((match, index) =>
            index === 0 ? { ...match, direction: match.direction === "NB" ? "SB" : "NB" } : match)),
          mutatePacketFor(routeId, (matches) => matches.map((match, index) =>
            index === 0 ? { ...match, matched_date: "2099-01-01" } : match)),
          mutatePacketFor(routeId, (matches) => matches.map((match, index) =>
            index === 0 ? { ...match, sbs_routes: ["B12"] } : match)),
        ];
        for (const packet of mutations) {
          expect(validate({ ...receipt, target: targetFor(packet) }, rowFor(routeId), packet))
            .toThrow("Utica Avenue packet target does not preserve exact ledger occurrence parity");
        }
      }

      const b12Receipt = receiptFor("B12");
      const b14Context = positiveContext("B14");
      expect(validate({
        ...b12Receipt,
        supplemental_search: {
          ...supplementalSearch("B12"),
          positive_context_findings: [b14Context],
        },
      }, rowFor("B12"), packetFor("B12")))
        .toThrow("historical project-intersection context transferred to Utica Avenue project service or traversal");

      const b15Receipt = receiptFor("B15");
      const b15Context = positiveContext("B15");
      expect(validate({
        ...b15Receipt,
        supplemental_search: {
          ...supplementalSearch("B15"),
          positive_context_findings: [positiveContext("B8")],
        },
      }, rowFor("B15"), packetFor("B15")))
        .toThrow("outside-project-extent intersection context transferred to Utica Avenue lane service or traversal");
      expect(validate({
        ...b15Receipt,
        supplemental_search: {
          ...supplementalSearch("B15"),
          positive_context_findings: [{
            ...b15Context,
            evidence_refs: b15Context.evidence_refs.filter((ref) => ref.page_number === 3),
          }],
        },
      }, rowFor("B15"), packetFor("B15")))
        .toThrow("does not bind the exact route to bounded corridor-service context");
      expect(validate({
        ...b15Receipt,
        supplemental_search: {
          ...supplementalSearch("B15"),
          positive_context_findings: [b15Context, b15Context],
        },
      }, rowFor("B15"), packetFor("B15")))
        .toThrow("Utica Avenue correction/context cardinality does not match the exact candidate route");

      const reducedB15 = packetFor("B15").unresolved_bindings.filter((binding) => binding !== "phase");
      expect(validate({
        ...b15Receipt,
        unresolved_bindings: reducedB15,
        supplemental_search: {
          ...supplementalSearch("B15"),
          positive_context_findings: [{
            ...b15Context,
            context_finding: { ...b15Context.context_finding, unsupported_bindings: reducedB15 },
            remaining_unresolved_bindings: reducedB15,
          }],
        },
      }, rowFor("B15"), { ...packetFor("B15"), unresolved_bindings: reducedB15 }))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      const b12Context = positiveContext("B12");
      expect(validate({
        ...b12Receipt,
        supplemental_search: {
          ...supplementalSearch("B12"),
          positive_context_findings: [b12Context, b12Context],
        },
      }, rowFor("B12"), packetFor("B12")))
        .toThrow("Utica Avenue correction/context cardinality does not match the exact candidate route");
      expect(validate({
        ...b12Receipt,
        supplemental_search: {
          ...supplementalSearch("B12"),
          positive_context_findings: [],
        },
      }, rowFor("B12"), packetFor("B12")))
        .toThrow("Utica Avenue correction/context cardinality does not match the exact candidate route");

      const b8Receipt = receiptFor("B8");
      const b8Context = positiveContext("B8");
      expect(validate({
        ...b8Receipt,
        supplemental_search: {
          ...supplementalSearch("B8"),
          positive_context_findings: [{
            ...b8Context,
            evidence_refs: b8Context.evidence_refs.filter((ref) => ref.page_number === 3),
          }],
        },
      }, rowFor("B8"), packetFor("B8")))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      expect(validate({
        ...b8Receipt,
        supplemental_search: {
          ...supplementalSearch("B8"),
          positive_context_findings: [{
            ...b8Context,
            context_finding: {
              ...b8Context.context_finding,
              supported_scope: "historical_project_intersection_connection_only",
            },
          }],
        },
      }, rowFor("B8"), packetFor("B8")))
        .toThrow("positive context has an unsupported typed scope");

      expect(validate({
        ...b8Receipt,
        supplemental_search: {
          ...supplementalSearch("B8"),
          positive_context_findings: [b8Context, b8Context],
        },
      }, rowFor("B8"), packetFor("B8")))
        .toThrow("Utica Avenue correction/context cardinality does not match the exact candidate route");

      const b46Row = { ...rowFor("B8"), gtfs_route_id: "B46" };
      const b46Packet = { ...packetFor("B8"), gtfs_route_id: "B46" };
      expect(validate({
        ...b8Receipt,
        gtfs_route_id: "B46",
        supplemental_search: {
          ...supplementalSearch("B8"),
          exact_queries: supplementalSearch("B8").exact_queries.map((query) => ({
            ...query, query: query.query.replace("B8", "B46"),
          })),
          positive_context_findings: [{
            ...b8Context,
            context_finding: { ...b8Context.context_finding, candidate_route_id: "B46" },
          }],
        },
      }, b46Row, b46Packet)).toThrow("does not bind the exact route to bounded corridor-service context");

      const reducedB8 = packetFor("B8").unresolved_bindings.filter((binding) => binding !== "phase");
      const reducedB8Packet = { ...packetFor("B8"), unresolved_bindings: reducedB8 };
      expect(validate({
        ...b8Receipt,
        unresolved_bindings: reducedB8,
        supplemental_search: {
          ...supplementalSearch("B8"),
          positive_context_findings: [{
            ...b8Context,
            context_finding: { ...b8Context.context_finding, unsupported_bindings: reducedB8 },
            remaining_unresolved_bindings: reducedB8,
          }],
        },
      }, rowFor("B8"), reducedB8Packet))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      expect(validate({
        ...b8Receipt,
        supplemental_search: {
          ...supplementalSearch("B8"),
          positive_context_findings: [{ ...b8Context, authorizes_study: true }],
        },
      }, rowFor("B8"), packetFor("B8")))
        .toThrow("outside-project-extent intersection context transferred to Utica Avenue lane service or traversal");

      expect(validate({
        ...b8Receipt,
        occurrence_context: { occurrence_id: "occurrence_fake", accepted_decision_id: "decision_fake" },
      }, rowFor("B8"), packetFor("B8")))
        .toThrow("occurrence context is not bound to an accepted occurrence decision");

      const reduced = packetFor("B12").unresolved_bindings.filter((binding) => binding !== "phase");
      const reducedPacket = { ...packetFor("B12"), unresolved_bindings: reduced };
      expect(validate({
        ...b12Receipt,
        unresolved_bindings: reduced,
        supplemental_search: {
          ...supplementalSearch("B12"),
          positive_context_findings: [{
            ...b12Context,
            context_finding: { ...b12Context.context_finding, unsupported_bindings: reduced },
            remaining_unresolved_bindings: reduced,
          }],
        },
      }, rowFor("B12"), reducedPacket))
        .toThrow("does not bind the exact route to bounded corridor-service context");

      expect(validate({
        ...b12Receipt,
        supplemental_search: {
          ...supplementalSearch("B12"),
          positive_context_findings: [{ ...b12Context, authorizes_study: true }],
        },
      }, rowFor("B12"), packetFor("B12")))
        .toThrow("historical project-intersection context transferred to Utica Avenue project service or traversal");

      const traversalConfirmedRow = {
        ...rowFor("B12"),
        dossier_refs: [{
          ...rowFor("B12").dossier_refs[0]!,
          candidate_target_match: true,
          lane_group_id: "BK|UTICA AVENUE",
          verdict_class: "traversal_confirmed" as const,
          service_date: date,
        }],
      };
      expect(validate(b12Receipt, traversalConfirmedRow, packetFor("B12")))
        .toThrow("historical project-intersection context transferred to Utica Avenue project service or traversal");

      const b8TraversalConfirmedRow = {
        ...rowFor("B8"),
        dossier_refs: [{
          ...rowFor("B8").dossier_refs[0]!,
          candidate_target_match: true,
          lane_group_id: "BK|UTICA AVENUE",
          verdict_class: "traversal_confirmed" as const,
          service_date: b8Date,
        }],
      };
      expect(validate(b8Receipt, b8TraversalConfirmedRow, packetFor("B8")))
        .toThrow("outside-project-extent intersection context transferred to Utica Avenue lane service or traversal");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("keeps the B111 Van Sinderen review exact and purely absent", () => {
    const date = "2016-01-01";
    const entry = candidate("van-sinderen-b111", "B111", date);
    const [baseRow] = buildBusLaneIdentityLedger({
      bridgeCandidates: [entry.bridge],
      trackerCandidates: [entry.tracker],
      routeAnchors: [anchor("B111")],
      dossierRows: [dossier({
        candidateId: entry.bridge.candidate_id,
        routeId: "B111",
        date,
        laneGroupId: null,
        pathSource: "unavailable",
        pathIdentity: null,
        reason: "historical_schedule_unavailable_pre_2023",
      })],
      dossierArtifact: "dossier.jsonl",
      laneFeatures: Array.from({ length: 4 }, (_, index) => lane({
        feature_id: `van-sinderen-${index}`,
        lane_group_id: "BK|VAN SINDEREN AVENUE",
        opened: "1/1/2016",
        direction: "SB",
        attributes: { open_dates: "1/1/2016", segmentid: `van-sinderen-${index}` },
      })),
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    });
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-van-sinderen-"));
    const receiptDir = join(rootDir, "receipts");
    const acquiredDir = join(rootDir,
      "data/quality/relationship-integrity/bus-lane-acquisition/supplemental/van-sinderen-fixture");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(acquiredDir, { recursive: true });
    const laneUrl = "https://www.nyc.gov/bus-lane-camera-report.pdf";
    const boardUrl = "https://www.nyc.gov/projects-2019.shtml";
    const laneHash = createHash("sha256").update("lane report").digest("hex");
    const boardHash = createHash("sha256").update("board page").digest("hex");
    writeFileSync(join(acquiredDir, "acquired-source-checks.json"), JSON.stringify({ sources: [
      { url: laneUrl, content_sha256: laneHash, retrieval_status: "acquired" },
      { url: boardUrl, content_sha256: boardHash, retrieval_status: "acquired" },
    ] }));
    const attempts = [
      { category: "official_nyc_dot_lane_project",
        query: "site:nyc.gov B111 Van Sinderen Avenue 2016-01-01 lane project",
        query_status: "performed_2026-07-15", urls_checked: [laneUrl],
        retrievals: [{ id: "lane", retrieved_on: "2026-07-15", sha256: laneHash, status: "acquired" }] },
      { category: "official_public_board_committee",
        query: "site:nyc.gov B111 Van Sinderen Avenue 2016-01-01 public board",
        query_status: "performed_2026-07-15", urls_checked: [boardUrl],
        retrievals: [{ id: "board", retrieved_on: "2026-07-15", sha256: boardHash, status: "acquired" }] },
    ];
    const prior = { receipt_id: "prior-van-sinderen", researched_on: "2026-07-15",
      source_findings: { exact_project_route_statement_found: false }, acquisition_attempts: attempts };
    const priorLine = stableJson(prior as unknown as JsonValue);
    writeFileSync(join(rootDir, "prior.jsonl"), `${priorLine}\n`);
    const row = { ...baseRow!, prior_acquisition_receipt: {
      receipt_id: prior.receipt_id,
      artifact: "prior.jsonl",
      row_sha256: createHash("sha256").update(priorLine).digest("hex"),
      disposition: "completed_search_route_linkage_unresolved",
      next_action: "Retain pure absence.",
    } };
    const packet = buildBusLaneResearchPackets([row]).packets[0]!;
    const matches = packet.what_is_known.target_groups[0]!.feature_matches;
    const target = {
      directions: ["SB"],
      feature_ids: matches.map((match) => match.feature_id).sort(),
      feature_keys: matches.map((match) => match.feature_key).sort(),
      feature_row_count: 4,
      feature_rows: matches.map((match) => ({
        feature_key: match.feature_key, feature_id: match.feature_id, direction: match.direction,
      })),
      geometry_scopes: ["coextensive_with_lane_group"],
      lane_group_ids: ["BK|VAN SINDEREN AVENUE"],
      matched_date: date,
      named_sbs_routes: [],
      open_dates_literals: ["1/1/2016"],
    };
    const supplemental = {
      domains: ["www.nyc.gov"],
      exact_queries: [
        { category: "official_nyc_dot_lane_project",
          query: "site:nyc.gov B111 Van Sinderen Avenue 2016-01-01 lane project",
          query_status: "performed_2026-07-23_reviewed_results" },
        { category: "official_public_board_committee",
          query: "site:nyc.gov B111 Van Sinderen Avenue 2016-01-01 public board",
          query_status: "performed_2026-07-23_reviewed_results" },
      ],
      finding_corrections: [],
      operator: "fixture-reviewer",
      retrievals: [
        { category: "official_nyc_dot_lane_project", retrieved_on: "2026-07-23",
          sha256: laneHash, status: "acquired", url: laneUrl },
        { category: "official_public_board_committee", retrieved_on: "2026-07-23",
          sha256: boardHash, status: "acquired", url: boardUrl },
      ],
      searched_at: "2026-07-23T11:00:00Z",
      urls_inspected: [laneUrl, boardUrl].sort(),
    };
    const receipt = {
      schema_version: 1, receipt_id: "binding-van-sinderen", receipt_kind: "binding_absent_after_search",
      candidate_id: row.candidate_id, candidate_fingerprint: row.candidate_fingerprint,
      gtfs_route_id: "B111", implementation_date: date, gap_ids: [row.ledger_id], searched_at: "2026-07-15",
      operator: "fixture-reviewer", candidate_urls: [], disposition: "binding_absent_after_search",
      missing_binding: packet.missing_binding, unresolved_bindings: packet.unresolved_bindings, target,
      prior_receipt: { receipt_id: prior.receipt_id, artifact: "prior.jsonl",
        row_sha256: row.prior_acquisition_receipt.row_sha256 },
      search: {
        exact_queries: attempts.map(({ category, query, query_status }) => ({ category, query, query_status })),
        domains: ["www.nyc.gov"],
        urls_inspected: [laneUrl, boardUrl].sort(),
        retrievals: attempts.flatMap((attempt) => attempt.retrievals.map((retrieval) =>
          ({ category: attempt.category, ...retrieval }))),
        disposition: "binding_absent_after_search",
      },
      supplemental_search: supplemental,
      authorizes_study: false, authorizes_cross_product: false,
    };
    const validate = (draft: Record<string, unknown>, candidateRow = row, candidatePacket = packet) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
      return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
    };
    try {
      expect(packet.unresolved_bindings).toEqual(["attribution", "traversal"]);
      expect(target).toMatchObject({ feature_row_count: 4, directions: ["SB"], named_sbs_routes: [] });
      expect(validate(receipt)).not.toThrow();
      expect(validate({ ...receipt, missing_binding: "feature_extent" }))
        .toThrow("binding receipt candidate or unresolved-binding parity failed");
      const driftPacket = { ...packet, what_is_known: { ...packet.what_is_known,
        target_groups: packet.what_is_known.target_groups.map((group) => ({ ...group,
          feature_matches: group.feature_matches.map((match, index) =>
            index === 0 ? { ...match, matched_date: "2016-01-02" } : match),
        })) } };
      expect(validate({ ...receipt, target: { ...target, matched_date: "2016-01-02" } }, row, driftPacket))
        .toThrow("Van Sinderen packet target does not preserve exact ledger occurrence parity");
      expect(validate({ ...receipt, supplemental_search: { ...supplemental,
        exact_queries: supplemental.exact_queries.map((query) => ({ ...query,
          query: query.query.replace("2016-01-01", "2016-01-02") })) } }))
        .toThrow("Van Sinderen pure-absence review contract does not match the exact candidate");
      expect(validate({ ...receipt, supplemental_search: { ...supplemental,
        positive_context_findings: [{}] } })).toThrow();
      expect(validate({ ...receipt, supplemental_search: { ...supplemental,
        finding_corrections: [{}] } })).toThrow();
      expect(validate({ ...receipt,
        occurrence_context: { occurrence_id: "occurrence_fake", accepted_decision_id: "decision_fake" } }))
        .toThrow("occurrence context is not bound to an accepted occurrence decision");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("keeps the B83 Pennsylvania Avenue review exact despite B82 lane-row attribution", () => {
    const date = "2018-06-30";
    const entry = candidate("pennsylvania-b83", "B83", date);
    const featureRows = [
      ["0046968", "SB", "6/30/2018", "B82"], ["0046980", "NB", "6/30/2018", "B82"],
      ["9009290", "SB", "6/30/2018", "B82"], ["0046977", "NB", "6/30/2018", "B82"],
      ["9009291", "SB", "6/30/2018", "B82"], ["9009265", "NB", "6/30/2018", "B82"],
      ["0046972", "NB", "6/30/2018", "B82"], ["0168096", "NB", "6/30/2018", "B82"],
      ["0046977", "SB", "6/30/2018", "B82"], ["9009290", "NB", "6/30/2018", "B82"],
      ["0046974", "SB", "6/30/2018", "B82"], ["9009291", "NB", "6/30/2018", "B82"],
      ["0046980", "SB", "6/30/2018", "B82"], ["0046916", "SB", "6/30/2018", "B82"],
      ["0046922", "SB", "6/30/2018", "B82"], ["0046968", "NB", "6/30/2018", "B82"],
      ["0292895", "NB", "6/30/2018", "B82"], ["0046912", "SB", "6/30/2018", "B82"],
      ["0046912", "NB", "6/30/2018", "B82"], ["9009248", "NB", "6/30/2018", "B82"],
      ["0292895", "SB", "6/30/2018", "B82"], ["0046914", "NB", "6/30/2018", "B82"],
      ["9009249", "NB", "6/30/2018", "B82"], ["9009266", "SB", "6/30/2018", "B82"],
      ["0046974", "NB", "6/30/2018", "B82"], ["0046922", "NB", "6/30/2018", "B82"],
      ["0046969", "SB", "6/30/2018", "B82"], ["9009265", "SB", "6/30/2018", "B82"],
      ["0292894", "SB", "06/30/2018", null], ["0292894", "NB", "06/30/2018", null],
      ["0168096", "SB", "6/30/2018", "B82"], ["0046916", "NB", "6/30/2018", "B82"],
      ["0046914", "SB", "6/30/2018", "B82"], ["9009266", "NB", "6/30/2018", "B82"],
      ["0046969", "NB", "6/30/2018", "B82"], ["0046972", "SB", "6/30/2018", "B82"],
    ] as const;
    const [baseRow] = buildBusLaneIdentityLedger({
      bridgeCandidates: [entry.bridge],
      trackerCandidates: [entry.tracker],
      routeAnchors: [anchor("B83")],
      dossierRows: [dossier({
        candidateId: entry.bridge.candidate_id,
        routeId: "B83",
        date,
        laneGroupId: null,
        pathSource: "unavailable",
        pathIdentity: null,
        reason: "historical_schedule_unavailable_pre_2023",
      })],
      dossierArtifact: "dossier.jsonl",
      laneFeatures: featureRows.map(([featureId, direction, literal, sbsRoute]) => lane({
        feature_id: featureId,
        lane_group_id: "BK|PENNSYLVANIA AVENUE",
        opened: literal,
        direction,
        attributes: {
          open_dates: literal,
          segmentid: featureId,
          ...(sbsRoute ? { sbs_route1: sbsRoute } : {}),
        },
      })),
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    });
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-pennsylvania-"));
    const receiptDir = join(rootDir, "receipts");
    const acquiredDir = join(rootDir,
      "data/quality/relationship-integrity/bus-lane-acquisition/supplemental/pennsylvania-fixture");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(acquiredDir, { recursive: true });
    const laneUrl = "https://www.nyc.gov/bus-lane-camera-report.pdf";
    const boardUrl = "https://www.nyc.gov/b82-project-board.pdf";
    const laneHash = createHash("sha256").update("lane report").digest("hex");
    const boardHash = createHash("sha256").update("board report").digest("hex");
    writeFileSync(join(acquiredDir, "acquired-source-checks.json"), JSON.stringify({ sources: [
      { url: laneUrl, content_sha256: laneHash, retrieval_status: "acquired" },
      { url: boardUrl, content_sha256: boardHash, retrieval_status: "acquired" },
    ] }));
    const attempts = [
      { category: "official_nyc_dot_lane_project",
        query: "site:nyc.gov B83 Pennsylvania Avenue 2018-06-30 lane project",
        query_status: "performed_2026-07-15", urls_checked: [laneUrl],
        retrievals: [{ id: "lane", retrieved_on: "2026-07-15", sha256: laneHash, status: "acquired" }] },
      { category: "official_public_board_committee",
        query: "site:nyc.gov B83 Pennsylvania Avenue 2018-06-30 public board",
        query_status: "performed_2026-07-15", urls_checked: [boardUrl],
        retrievals: [{ id: "board", retrieved_on: "2026-07-15", sha256: boardHash, status: "acquired" }] },
    ];
    const prior = {
      receipt_id: "prior-pennsylvania",
      researched_on: "2026-07-15",
      source_findings: { exact_project_route_statement_found: false },
      outcome: { still_unresolved: true },
      claim_results: { exact_route_treatment_binding_proved: false, exact_route_binding_evidence: [] },
      acquisition_attempts: attempts,
    };
    const priorLine = stableJson(prior as unknown as JsonValue);
    writeFileSync(join(rootDir, "prior.jsonl"), `${priorLine}\n`);
    const row = { ...baseRow!, prior_acquisition_receipt: {
      receipt_id: prior.receipt_id,
      artifact: "prior.jsonl",
      row_sha256: createHash("sha256").update(priorLine).digest("hex"),
      disposition: "completed_search_route_linkage_unresolved",
      next_action: "Retain pure absence.",
    } };
    const packet = buildBusLaneResearchPackets([row]).packets[0]!;
    const targetFor = (candidatePacket = packet) => {
      const groups = candidatePacket.what_is_known.target_groups;
      const matches = groups.flatMap((group) => group.feature_matches);
      return {
        directions: [...new Set(matches.map((match) => match.direction))].sort(),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
        feature_row_count: matches.length,
        feature_rows: matches.map((match) => ({
          feature_key: match.feature_key, feature_id: match.feature_id, direction: match.direction,
        })),
        geometry_scopes: [...new Set(groups.map((group) => group.geometry_scope))].sort(),
        lane_group_ids: groups.map((group) => group.lane_group_id),
        matched_date: date,
        named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
        open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
      };
    };
    const supplemental = {
      domains: ["www.nyc.gov"],
      exact_queries: [
        { category: "official_nyc_dot_lane_project",
          query: "site:nyc.gov B83 Pennsylvania Avenue 2018-06-30 lane project",
          query_status: "performed_2026-07-23_reviewed_results" },
        { category: "official_public_board_committee",
          query: "site:nyc.gov B83 Pennsylvania Avenue 2018-06-30 public board",
          query_status: "performed_2026-07-23_reviewed_results" },
      ],
      finding_corrections: [],
      operator: "fixture-reviewer",
      retrievals: [
        { category: "official_nyc_dot_lane_project", retrieved_on: "2026-07-23",
          sha256: laneHash, status: "acquired", url: laneUrl },
        { category: "official_public_board_committee", retrieved_on: "2026-07-23",
          sha256: boardHash, status: "acquired", url: boardUrl },
      ],
      searched_at: "2026-07-23T12:00:00Z",
      urls_inspected: [laneUrl, boardUrl].sort(),
    };
    const receipt = {
      schema_version: 1, receipt_id: "binding-pennsylvania", receipt_kind: "binding_absent_after_search",
      candidate_id: row.candidate_id, candidate_fingerprint: row.candidate_fingerprint,
      gtfs_route_id: "B83", implementation_date: date, gap_ids: [row.ledger_id], searched_at: "2026-07-15",
      operator: "fixture-reviewer", candidate_urls: [], disposition: "binding_absent_after_search",
      missing_binding: "traversal", unresolved_bindings: ["attribution", "direction", "traversal"],
      target: targetFor(),
      prior_receipt: { receipt_id: prior.receipt_id, artifact: "prior.jsonl",
        row_sha256: row.prior_acquisition_receipt.row_sha256 },
      search: {
        exact_queries: attempts.map(({ category, query, query_status }) => ({ category, query, query_status })),
        domains: ["www.nyc.gov"],
        urls_inspected: [laneUrl, boardUrl].sort(),
        retrievals: attempts.flatMap((attempt) => attempt.retrievals.map((retrieval) =>
          ({ category: attempt.category, ...retrieval }))),
        disposition: "binding_absent_after_search",
      },
      supplemental_search: supplemental,
      authorizes_study: false, authorizes_cross_product: false,
    };
    const validate = (draft: Record<string, unknown>, candidateRow = row, candidatePacket = packet) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
      return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
    };
    const drift = (transform: (match: typeof packet.what_is_known.target_groups[0]["feature_matches"][number],
      index: number) => typeof packet.what_is_known.target_groups[0]["feature_matches"][number]) => {
      const targetGroups = packet.what_is_known.target_groups.map((group) => ({
        ...group, feature_matches: group.feature_matches.map(transform),
      }));
      const candidatePacket = { ...packet, what_is_known: { ...packet.what_is_known, target_groups: targetGroups } };
      const candidateRow = { ...row, onset_evidence: { ...row.onset_evidence, target_groups: targetGroups } };
      return { candidatePacket, candidateRow, draft: { ...receipt, target: targetFor(candidatePacket) } };
    };
    try {
      expect(packet.missing_binding).toBe("traversal");
      expect(packet.unresolved_bindings).toEqual(["attribution", "direction", "traversal"]);
      expect(targetFor()).toMatchObject({
        feature_row_count: 36, directions: ["NB", "SB"], named_sbs_routes: ["B82"],
        open_dates_literals: ["06/30/2018", "6/30/2018"],
      });
      expect(targetFor().feature_ids).toHaveLength(19);
      expect(packet.what_is_known.target_groups[0]!.feature_matches.filter((match) =>
        stableJson(match.sbs_routes) === stableJson(["B82"]))).toHaveLength(34);
      expect(packet.what_is_known.target_groups[0]!.feature_matches.filter((match) =>
        match.sbs_routes.length === 0)).toHaveLength(2);
      expect(validate(receipt)).not.toThrow();

      const routeTransferRow = { ...row, gtfs_route_id: "B82" };
      const routeTransferPacket = { ...packet, gtfs_route_id: "B82" };
      expect(validate({ ...receipt, gtfs_route_id: "B82", supplemental_search: { ...supplemental,
        exact_queries: supplemental.exact_queries.map((query) => ({
          ...query, query: query.query.replace("B83", "B82"),
        })),
      } }, routeTransferRow, routeTransferPacket))
        .toThrow("Pennsylvania Avenue B83 pure-absence review contract does not match the exact candidate");
      const homogenized = drift((match) => ({ ...match, sbs_routes: ["B82"] }));
      expect(validate(homogenized.draft, homogenized.candidateRow, homogenized.candidatePacket))
        .toThrow("Pennsylvania Avenue B83 pure-absence review contract does not match the exact candidate");
      for (const altered of [
        drift((match, index) => index === 0 ? { ...match, feature_key: `${match.feature_key}-drift` } : match),
        drift((match, index) => index === 0 ? { ...match, feature_id: "9999999" } : match),
        drift((match, index) => index === 0 ? { ...match, direction: "NB" } : match),
        drift((match, index) => index === 0 ? { ...match, matched_date: "2018-07-01" } : match),
        drift((match, index) => index === 28 ? { ...match, open_dates_literal: "6/30/2018",
          matched_token_literal: "6/30/2018" } : match),
      ]) {
        expect(validate(altered.draft, altered.candidateRow, altered.candidatePacket))
          .toThrow("Pennsylvania Avenue B83 pure-absence review contract does not match the exact candidate");
      }
      const reversedGroups = packet.what_is_known.target_groups.map((group) => ({
        ...group, feature_matches: [...group.feature_matches].reverse(),
      }));
      const reversedPacket = { ...packet, what_is_known: { ...packet.what_is_known, target_groups: reversedGroups } };
      const reversedRow = { ...row, onset_evidence: { ...row.onset_evidence, target_groups: reversedGroups } };
      expect(validate({ ...receipt, target: targetFor(reversedPacket) }, reversedRow, reversedPacket))
        .toThrow("Pennsylvania Avenue B83 pure-absence review contract does not match the exact candidate");
      expect(validate({ ...receipt, supplemental_search: { ...supplemental,
        exact_queries: supplemental.exact_queries.map((query) => ({ ...query,
          query: `${query.query} B82` })) } }))
        .toThrow("Pennsylvania Avenue B83 pure-absence review contract does not match the exact candidate");
      expect(validate({ ...receipt, supplemental_search: { ...supplemental,
        positive_context_findings: [{}] } })).toThrow();
      expect(validate({ ...receipt, supplemental_search: { ...supplemental,
        finding_corrections: [{}] } })).toThrow();
      expect(validate({ ...receipt,
        occurrence_context: { occurrence_id: "occurrence_fake", accepted_decision_id: "decision_fake" } }))
        .toThrow("occurrence context is not bound to an accepted occurrence decision");
      expect(validate({ ...receipt, authorizes_study: true }))
        .toThrow("binding receipt search preservation or authorization guard failed");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("keeps B46+ Malcolm X project context nonterminal and separate from the exact lane rows", () => {
    const date = "2020-07-23";
    const entry = candidate("malcolm-b46-sbs", "B46+", date);
    const [baseRow] = buildBusLaneIdentityLedger({
      bridgeCandidates: [entry.bridge],
      trackerCandidates: [entry.tracker],
      routeAnchors: [anchor("B46+")],
      dossierRows: [dossier({
        candidateId: entry.bridge.candidate_id,
        routeId: "B46+",
        date,
        laneGroupId: null,
        pathSource: "unavailable",
        pathIdentity: null,
        reason: "historical_schedule_unavailable_pre_2023",
      })],
      dossierArtifact: "dossier.jsonl",
      laneFeatures: ["0167508", "0167509", "0043423"].map((featureId) => lane({
        feature_id: featureId,
        lane_group_id: "BK|MALCOLM X BOULEVARD",
        opened: "7/23/2020",
        direction: "SB",
        attributes: { open_dates: "7/23/2020", segmentid: featureId },
      })),
      laneSnapshotId: "lanes",
      laneSourceId: "lane_source",
      gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
    });
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-malcolm-x-"));
    const receiptDir = join(rootDir, "receipts");
    const acquiredDir = join(rootDir,
      "data/quality/relationship-integrity/bus-lane-acquisition/supplemental/malcolm-fixture");
    const sourceId = "malcolm_x_blvd_utica_ave_mar2020";
    const sourceDir = join(rootDir, "raw", "sources", sourceId);
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(acquiredDir, { recursive: true });
    mkdirSync(sourceDir, { recursive: true });
    const projectUrl = "https://www.nyc.gov/html/brt/downloads/pdf/malcolm-x-blvd-utica-ave-mar2020.pdf";
    const indexUrl = "https://www.nyc.gov/html/dot/html/about/projects-2020.shtml";
    const projectBytes = Buffer.from("fixture Malcolm X March 2020 project PDF");
    const projectHash = createHash("sha256").update(projectBytes).digest("hex");
    const indexHash = createHash("sha256").update("fixture project index").digest("hex");
    writeFileSync(join(sourceDir, "source.pdf"), projectBytes);
    writeFileSync(join(sourceDir, "metadata.json"), JSON.stringify({
      sourceId,
      sourceUrl: projectUrl,
      sha256: `sha256:${projectHash}`,
      title: "Malcolm X Blvd / Utica Ave Transit Improvements – presented to Brooklyn Community Board 3 in March 2020 (pdf)",
      documentDate: "2020-03",
      sourceGroup: "bus_priority_document",
    }));
    const sourceBlocks = [
      { block_id: "p004_c0001", page_number: 4,
        raw_text: "BACKGROUND: B46 SELECT BUS SERVICE (SBS) ROUTE. Proposed B46 Local and B46 SBS." },
      { block_id: "p014_c0002", page_number: 14,
        raw_text: "Curbside bus lane, Chauncey St to Fulton St, southbound only." },
      { block_id: "p016_c0002", page_number: 16,
        raw_text: "Malcolm X Blvd B46 project timeline: Spring 2020 implement Chauncey St to Fulton St." },
    ].map((block) => ({
      source_id: sourceId,
      ...block,
      normalized_text: block.raw_text,
      raw_text_sha256: `sha256:${createHash("sha256").update(block.raw_text).digest("hex")}`,
    }));
    writeFileSync(join(sourceDir, "blocks.jsonl"),
      `${sourceBlocks.map((block) => JSON.stringify(block)).join("\n")}\n`);
    writeFileSync(join(acquiredDir, "acquired-source-checks.json"), JSON.stringify({ sources: [
      { url: projectUrl, content_sha256: projectHash, retrieval_status: "acquired" },
      { url: indexUrl, content_sha256: indexHash, retrieval_status: "acquired" },
    ] }));
    const attempts = [
      { category: "official_nyc_dot_lane_project",
        query: "site:nyc.gov B46+ Malcolm X Boulevard 2020-07-23 lane project",
        query_status: "performed_2026-07-15", urls_checked: [indexUrl],
        retrievals: [{ id: "index", retrieved_on: "2026-07-15", sha256: indexHash, status: "acquired" }] },
      { category: "official_public_board_committee",
        query: "site:nyc.gov B46+ Malcolm X Boulevard 2020-07-23 public board",
        query_status: "performed_2026-07-15", urls_checked: [projectUrl],
        retrievals: [{ id: "project", retrieved_on: "2026-07-15", sha256: projectHash, status: "acquired" }] },
    ];
    const prior = {
      receipt_id: "prior-malcolm",
      researched_on: "2026-07-15",
      source_findings: { exact_project_route_statement_found: true },
      outcome: { still_unresolved: true },
      canonical_actions: {
        existing_canonical_links_verified: ["relation_b46-sbs-operates-on-malcolm-x"],
        operational_occurrence_added_or_updated: false,
      },
      claim_results: {
        date_and_phase_proved: false,
        exact_route_treatment_binding_proved: true,
        exact_segment_binding_proved: false,
        operational_occurrence_identity_proved: false,
        exact_route_binding_evidence: [{
          official_routes: ["B46+"],
          supported_claim: "The project identifies B46 Local and Select Bus Service as beneficiaries of the bus lane.",
        }],
      },
      acquisition_attempts: attempts,
    };
    const priorLine = stableJson(prior as unknown as JsonValue);
    writeFileSync(join(rootDir, "prior.jsonl"), `${priorLine}\n`);
    const row = { ...baseRow!, prior_acquisition_receipt: {
      receipt_id: prior.receipt_id,
      artifact: "prior.jsonl",
      row_sha256: createHash("sha256").update(priorLine).digest("hex"),
      disposition: "linkage_supported_phase_unresolved",
      next_action: "Retain only nonterminal project-corridor context.",
    } };
    const packet = buildBusLaneResearchPackets([row]).packets[0]!;
    const targetFor = (candidatePacket = packet) => {
      const groups = candidatePacket.what_is_known.target_groups;
      const matches = groups.flatMap((group) => group.feature_matches);
      return {
        directions: [...new Set(matches.map((match) => match.direction))].sort(),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
        feature_row_count: matches.length,
        feature_rows: matches.map((match) => ({
          feature_key: match.feature_key, feature_id: match.feature_id, direction: match.direction,
        })),
        geometry_scopes: [...new Set(groups.map((group) => group.geometry_scope))].sort(),
        lane_group_ids: groups.map((group) => group.lane_group_id),
        matched_date: date,
        named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
        open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
      };
    };
    const evidenceRefs = sourceBlocks.map((block) => ({
      block_id: block.block_id, page_number: block.page_number, text_sha256: block.raw_text_sha256,
    }));
    const positiveContext = {
      source_id: sourceId,
      source_url: projectUrl,
      source_pdf_sha256: projectHash,
      evidence_refs: evidenceRefs,
      context_finding: {
        candidate_route_id: "B46+",
        finding_kind: "positive_project_corridor_service_nonterminal",
        supported_scope: "project_corridor_service_only",
        unsupported_bindings: packet.unresolved_bindings,
        finding_summary: "The source binds B46 Local and SBS to the Malcolm X project corridor, not the exact candidate rows, day, phase, or traversal.",
      },
      remaining_unresolved_bindings: packet.unresolved_bindings,
      authorizes_study: false,
      authorizes_cross_product: false,
    };
    const supplemental = {
      domains: ["www.nyc.gov"],
      exact_queries: [
        { category: "official_nyc_dot_lane_project",
          query: "site:nyc.gov B46+ Malcolm X Boulevard 2020-07-23 lane project",
          query_status: "performed_2026-07-23_reviewed_results" },
        { category: "official_public_board_committee",
          query: "site:nyc.gov B46+ Malcolm X Boulevard 2020-07-23 public board",
          query_status: "performed_2026-07-23_reviewed_results" },
      ],
      finding_corrections: [],
      positive_context_findings: [positiveContext],
      operator: "fixture-reviewer",
      retrievals: [
        { category: "official_nyc_dot_lane_project", retrieved_on: "2026-07-23",
          sha256: indexHash, status: "acquired", url: indexUrl },
        { category: "official_public_board_committee", retrieved_on: "2026-07-23",
          sha256: projectHash, status: "acquired", url: projectUrl },
      ],
      searched_at: "2026-07-23T13:00:00Z",
      urls_inspected: [indexUrl, projectUrl].sort(),
    };
    const receipt = {
      schema_version: 1, receipt_id: "binding-malcolm", receipt_kind: "binding_absent_after_search",
      candidate_id: row.candidate_id, candidate_fingerprint: row.candidate_fingerprint,
      gtfs_route_id: "B46+", implementation_date: date, gap_ids: [row.ledger_id], searched_at: "2026-07-15",
      operator: "fixture-reviewer", candidate_urls: [], disposition: "binding_absent_after_search",
      missing_binding: "traversal", unresolved_bindings: ["attribution", "traversal"], target: targetFor(),
      prior_receipt: { receipt_id: prior.receipt_id, artifact: "prior.jsonl",
        row_sha256: row.prior_acquisition_receipt.row_sha256 },
      search: {
        exact_queries: attempts.map(({ category, query, query_status }) => ({ category, query, query_status })),
        domains: ["www.nyc.gov"],
        urls_inspected: [indexUrl, projectUrl].sort(),
        retrievals: attempts.flatMap((attempt) => attempt.retrievals.map((retrieval) =>
          ({ category: attempt.category, ...retrieval }))),
        disposition: "binding_absent_after_search",
      },
      supplemental_search: supplemental,
      authorizes_study: false, authorizes_cross_product: false,
    };
    const validate = (draft: Record<string, unknown>, candidateRow = row, candidatePacket = packet) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
      return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
    };
    const drift = (transform: (match: typeof packet.what_is_known.target_groups[0]["feature_matches"][number],
      index: number) => typeof packet.what_is_known.target_groups[0]["feature_matches"][number]) => {
      const targetGroups = packet.what_is_known.target_groups.map((group) => ({
        ...group, feature_matches: group.feature_matches.map(transform),
      }));
      const candidatePacket = { ...packet, what_is_known: { ...packet.what_is_known, target_groups: targetGroups } };
      const candidateRow = { ...row, onset_evidence: { ...row.onset_evidence, target_groups: targetGroups } };
      return { candidatePacket, candidateRow, draft: { ...receipt, target: targetFor(candidatePacket) } };
    };
    try {
      expect(packet.missing_binding).toBe("traversal");
      expect(packet.unresolved_bindings).toEqual(["attribution", "traversal"]);
      expect(targetFor()).toMatchObject({
        feature_row_count: 3, feature_ids: ["0043423", "0167508", "0167509"], directions: ["SB"],
        named_sbs_routes: [], open_dates_literals: ["7/23/2020"],
      });
      expect(validate(receipt)).not.toThrow();
      for (const altered of [
        drift((match, index) => index === 0 ? { ...match, feature_key: `${match.feature_key}-drift` } : match),
        drift((match, index) => index === 0 ? { ...match, feature_id: "9999999" } : match),
        drift((match, index) => index === 0 ? { ...match, direction: "NB" } : match),
        drift((match, index) => index === 0 ? { ...match, matched_date: "2020-07-24" } : match),
        drift((match, index) => index === 0 ? { ...match, sbs_routes: ["B46"] } : match),
      ]) {
        expect(validate(altered.draft, altered.candidateRow, altered.candidatePacket)).toThrow();
      }
      const reversedGroups = packet.what_is_known.target_groups.map((group) => ({
        ...group, feature_matches: [...group.feature_matches].reverse(),
      }));
      const reversedPacket = { ...packet, what_is_known: { ...packet.what_is_known, target_groups: reversedGroups } };
      const reversedRow = { ...row, onset_evidence: { ...row.onset_evidence, target_groups: reversedGroups } };
      expect(validate({ ...receipt, target: targetFor(reversedPacket) }, reversedRow, reversedPacket)).toThrow();
      expect(validate({ ...receipt, supplemental_search: { ...supplemental,
        positive_context_findings: [] } }))
        .toThrow("Malcolm X B46+ nonterminal project-context contract does not match the exact candidate");
      expect(validate({ ...receipt, supplemental_search: { ...supplemental,
        positive_context_findings: [positiveContext, positiveContext] } }))
        .toThrow("Malcolm X B46+ nonterminal project-context contract does not match the exact candidate");
      expect(validate({ ...receipt, supplemental_search: { ...supplemental,
        positive_context_findings: [{ ...positiveContext, context_finding: {
          ...positiveContext.context_finding, supported_scope: "other_extent_corridor_service_only",
        } }] } })).toThrow();
      expect(validate({ ...receipt, supplemental_search: { ...supplemental,
        positive_context_findings: [{ ...positiveContext, remaining_unresolved_bindings: ["traversal"] }] } }))
        .toThrow("positive context exceeds its nonauthorizing project-corridor scope");
      expect(validate({ ...receipt, supplemental_search: { ...supplemental,
        positive_context_findings: [{ ...positiveContext, authorizes_study: true }] } })).toThrow();
      expect(validate({ ...receipt,
        occurrence_context: { occurrence_id: "occurrence_fake", accepted_decision_id: "decision_fake" } }))
        .toThrow("occurrence context is not bound to an accepted occurrence decision");
      const traversalRow = { ...row, dossier_refs: [{ ...row.dossier_refs[0]!,
        candidate_target_match: true, lane_group_id: "BK|MALCOLM X BOULEVARD",
        verdict_class: "traversal_confirmed" as const, service_date: date,
      }] };
      expect(validate(receipt, traversalRow, packet))
        .toThrow("positive context exceeds its nonauthorizing project-corridor scope");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("keeps B43 and B48 separate from the exact B62 Nassau Avenue lane project", () => {
    const date = "2018-08-24";
    for (const routeId of ["B43", "B48"]) {
      const entry = candidate(`nassau-${routeId.toLowerCase()}`, routeId, date);
      const [baseRow] = buildBusLaneIdentityLedger({
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
        laneFeatures: [lane({
          feature_id: "0035256",
          lane_group_id: "BK|NASSAU AVENUE",
          opened: "8/24/2018",
          direction: "WB",
          attributes: { open_dates: "8/24/2018", segmentid: "0035256" },
        })],
        laneSnapshotId: "lanes",
        laneSourceId: "lane_source",
        gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
      });
      const rootDir = mkdtempSync(join(tmpdir(), `bus-lane-nassau-${routeId.toLowerCase()}-`));
      const receiptDir = join(rootDir, "receipts");
      const acquiredDir = join(rootDir,
        "data/quality/relationship-integrity/bus-lane-acquisition/supplemental/nassau-fixture");
      const juneSourceId = "bedford_nassau_aves_june2018";
      const juneUrl = "https://www.nyc.gov/html/dot/downloads/pdf/bedford-nassau-aves-june2018-2.pdf";
      const novemberSourceId = "bedford_nassau_nov2018";
      const novemberUrl = "https://www.nyc.gov/html/dot/downloads/pdf/bedford-nassau-nov2018.pdf";
      const juneBytes = Buffer.from("fixture Bedford Nassau June 2018 PDF");
      const novemberBytes = Buffer.from("fixture Bedford Nassau November 2018 PDF");
      const juneHash = createHash("sha256").update(juneBytes).digest("hex");
      const novemberHash = createHash("sha256").update(novemberBytes).digest("hex");
      const juneBlocks = [
        "2 B62 bus stops in close proximity",
        "Consolidate B62 stops at Lorimer St and Manhattan Ave to single stop on Nassau Ave, with bus-only left turn",
        "Paint existing bus only lane of Nassau Ave between Leonard St and Manhattan Ave red",
      ].map((rawText, index) => ({
        source_id: juneSourceId,
        block_id: `p014_p000${index + 1}`,
        page_number: 14 + index,
        raw_text: rawText,
      }));
      const novemberBlocks = [
        "Bus reroute occurred on July 1st",
        "Majority of markings were finished on August 24th",
      ].map((rawText, index) => ({
        source_id: novemberSourceId,
        block_id: `p007_p000${index + 1}`,
        page_number: 7,
        raw_text: rawText,
      }));
      const stageSource = (sourceId: string, sourceUrl: string, documentDate: string,
        bytes: Buffer, contentHash: string, blocks: typeof juneBlocks) => {
        const sourceDir = join(rootDir, "raw", "sources", sourceId);
        mkdirSync(sourceDir, { recursive: true });
        writeFileSync(join(sourceDir, "source.pdf"), bytes);
        writeFileSync(join(sourceDir, "metadata.json"), JSON.stringify({
          sourceId, sourceUrl, finalUrl: sourceUrl, documentDate,
          sourceGroup: "bus_priority_document", sha256: `sha256:${contentHash}`,
        }));
        writeFileSync(join(sourceDir, "blocks.jsonl"),
          `${blocks.map((block) => JSON.stringify(block)).join("\n")}\n`);
      };
      mkdirSync(receiptDir, { recursive: true });
      mkdirSync(acquiredDir, { recursive: true });
      stageSource(juneSourceId, juneUrl, "2018-06-18", juneBytes, juneHash, juneBlocks);
      stageSource(novemberSourceId, novemberUrl, "2018-11-19", novemberBytes, novemberHash, novemberBlocks);
      writeFileSync(join(acquiredDir, "acquired-source-checks.json"), JSON.stringify({ sources: [
        { source_id: juneSourceId, url: juneUrl, content_sha256: juneHash, retrieval_status: "acquired" },
        { source_id: novemberSourceId, url: novemberUrl,
          content_sha256: novemberHash, retrieval_status: "acquired" },
      ] }));
      const attempts = [
        { category: "official_nyc_dot_lane_project",
          query: `site:nyc.gov ${routeId} Nassau Avenue 2018-08-24 lane project`,
          query_status: "performed_2026-07-15", urls_checked: [juneUrl],
          retrievals: [{ id: "june", retrieved_on: "2026-07-15", sha256: juneHash, status: "acquired" }] },
        { category: "official_public_board_committee",
          query: `site:nyc.gov ${routeId} Nassau Avenue 2018-08-24 public board`,
          query_status: "performed_2026-07-15", urls_checked: [novemberUrl],
          retrievals: [{ id: "november", retrieved_on: "2026-07-15",
            sha256: novemberHash, status: "acquired" }] },
      ];
      const prior = {
        receipt_id: `prior-nassau-${routeId.toLowerCase()}`,
        researched_on: "2026-07-15",
        source_findings: { exact_project_route_statement_found: false },
        outcome: { still_unresolved: true },
        canonical_actions: { canonical_links_added: [], operational_occurrence_added_or_updated: false },
        claim_results: {
          date_and_phase_proved: false,
          exact_route_treatment_binding_proved: false,
          exact_segment_binding_proved: false,
          operational_occurrence_identity_proved: false,
          exact_route_binding_evidence: [],
        },
        acquisition_attempts: attempts,
      };
      const priorLine = stableJson(prior as unknown as JsonValue);
      writeFileSync(join(rootDir, "prior.jsonl"), `${priorLine}\n`);
      const row = { ...baseRow!, prior_acquisition_receipt: {
        receipt_id: prior.receipt_id,
        artifact: "prior.jsonl",
        row_sha256: createHash("sha256").update(priorLine).digest("hex"),
        disposition: "completed_search_route_linkage_unresolved",
        next_action: "Retain pure absence.",
      } };
      const packet = buildBusLaneResearchPackets([row]).packets[0]!;
      const targetFor = (candidatePacket = packet) => {
        const groups = candidatePacket.what_is_known.target_groups;
        const matches = groups.flatMap((group) => group.feature_matches);
        return {
          directions: [...new Set(matches.map((match) => match.direction))].sort(),
          feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
          feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
          feature_row_count: matches.length,
          feature_rows: matches.map((match) => ({
            feature_key: match.feature_key, feature_id: match.feature_id, direction: match.direction,
          })),
          geometry_scopes: [...new Set(groups.map((group) => group.geometry_scope))].sort(),
          lane_group_ids: groups.map((group) => group.lane_group_id),
          matched_date: date,
          named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
          open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
        };
      };
      const supplemental = {
        domains: ["www.nyc.gov"],
        exact_queries: [
          { category: "official_nyc_dot_lane_project",
            query: `site:nyc.gov ${routeId} Nassau Avenue 2018-08-24 lane project`,
            query_status: "performed_2026-07-23_reviewed_results" },
          { category: "official_public_board_committee",
            query: `site:nyc.gov ${routeId} Nassau Avenue 2018-08-24 public board`,
            query_status: "performed_2026-07-23_reviewed_results" },
        ],
        finding_corrections: [],
        positive_context_findings: [],
        operator: "fixture-reviewer",
        retrievals: [
          { category: "official_nyc_dot_lane_project", retrieved_on: "2026-07-23",
            sha256: juneHash, status: "acquired", url: juneUrl },
          { category: "official_public_board_committee", retrieved_on: "2026-07-23",
            sha256: novemberHash, status: "acquired", url: novemberUrl },
        ],
        searched_at: "2026-07-23T10:55:00Z",
        urls_inspected: [juneUrl, novemberUrl].sort(),
      };
      const receipt = {
        schema_version: 1, receipt_id: `binding-nassau-${routeId.toLowerCase()}`,
        receipt_kind: "binding_absent_after_search",
        candidate_id: row.candidate_id, candidate_fingerprint: row.candidate_fingerprint,
        gtfs_route_id: routeId, implementation_date: date, gap_ids: [row.ledger_id], searched_at: "2026-07-15",
        operator: "fixture-reviewer", candidate_urls: [], disposition: "binding_absent_after_search",
        missing_binding: "traversal", unresolved_bindings: ["attribution", "traversal"], target: targetFor(),
        prior_receipt: { receipt_id: prior.receipt_id, artifact: "prior.jsonl",
          row_sha256: row.prior_acquisition_receipt.row_sha256 },
        search: {
          exact_queries: attempts.map(({ category, query, query_status }) => ({ category, query, query_status })),
          domains: ["www.nyc.gov"],
          urls_inspected: [juneUrl, novemberUrl].sort(),
          retrievals: attempts.flatMap((attempt) => attempt.retrievals.map((retrieval) =>
            ({ category: attempt.category, ...retrieval }))),
          disposition: "binding_absent_after_search",
        },
        supplemental_search: supplemental,
        authorizes_study: false, authorizes_cross_product: false,
      };
      const validate = (draft: Record<string, unknown>, candidateRow = row, candidatePacket = packet) => {
        writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
        return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
      };
      const drift = (changes: Record<string, unknown>) => {
        const targetGroups = packet.what_is_known.target_groups.map((group) => ({
          ...group, feature_matches: group.feature_matches.map((match) => ({ ...match, ...changes })),
        }));
        const candidatePacket = { ...packet, what_is_known: { ...packet.what_is_known, target_groups: targetGroups } };
        const candidateRow = { ...row, onset_evidence: { ...row.onset_evidence, target_groups: targetGroups } };
        return { candidatePacket, candidateRow, draft: { ...receipt, target: targetFor(candidatePacket) } };
      };
      try {
        expect(packet.missing_binding).toBe("traversal");
        expect(packet.unresolved_bindings).toEqual(["attribution", "traversal"]);
        expect(targetFor()).toMatchObject({
          feature_row_count: 1, feature_ids: ["0035256"], directions: ["WB"],
          named_sbs_routes: [], open_dates_literals: ["8/24/2018"],
        });
        expect(validate(receipt)).not.toThrow();
        for (const altered of [
          drift({ feature_key: "dot-lane-feature:drift" }),
          drift({ feature_id: "9999999" }),
          drift({ direction: "EB" }),
          drift({ matched_date: "2018-08-25" }),
          drift({ matched_token_literal: "08/24/2018", open_dates_literal: "08/24/2018" }),
          drift({ sbs_routes: ["B62"] }),
        ]) {
          expect(validate(altered.draft, altered.candidateRow, altered.candidatePacket))
            .toThrow("Nassau Avenue B43/B48 pure-absence review contract does not match the exact candidate");
        }
        expect(validate({ ...receipt, supplemental_search: { ...supplemental,
          exact_queries: supplemental.exact_queries.map((query) => ({ ...query,
            query: query.query.replace("2018-08-24", "2018-08-25"),
          })) } })).toThrow("Nassau Avenue B43/B48 pure-absence review contract does not match the exact candidate");
        expect(validate({ ...receipt, supplemental_search: { ...supplemental,
          positive_context_findings: [{}] } })).toThrow();
        expect(validate({ ...receipt, supplemental_search: { ...supplemental,
          finding_corrections: [{}] } })).toThrow();
        expect(validate({ ...receipt,
          occurrence_context: { occurrence_id: "occurrence_fake", accepted_decision_id: "decision_fake" } }))
          .toThrow("occurrence context is not bound to an accepted occurrence decision");
        expect(validate({ ...receipt, authorizes_study: true }))
          .toThrow("binding receipt search preservation or authorization guard failed");
        const juneBlocksPath = join(rootDir, "raw", "sources", juneSourceId, "blocks.jsonl");
        writeFileSync(juneBlocksPath,
          `${juneBlocks.map((block, index) => JSON.stringify(index === 0
            ? { ...block, raw_text: `${routeId} bus stops in close proximity` }
            : block)).join("\n")}\n`);
        expect(validate(receipt))
          .toThrow("Nassau Avenue B43/B48 pure-absence review contract does not match the exact candidate");
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    }
  });

  it("keeps all nine Queens Plaza candidates separate from the four exact westbound rows", () => {
    const date = "2025-12-13";
    const routes = ["Q100", "Q101", "Q102", "Q32", "Q39", "Q60", "Q63", "Q66", "Q69"];
    const directionGapRoutes = new Set(["Q100", "Q60", "Q69"]);
    const currentProjectsUrl = "https://www.nyc.gov/html/dot/html/about/current-projects.shtml";
    const currentProjectsHash = "497d1f9358c5b4864a0bf1d30b1157d431a3d1a6645aad55dbad0b3090ae0f8f";
    const projects2025Url = "https://www.nyc.gov/html/dot/html/about/projects-2025.shtml";
    const projects2025Hash = "17d7f3288adc17c84af872c7452aa99420bc1252dd714b7c55972e3b1164f7ce";
    const contextSources = new Map([
      ["Q39", {
        sourceId: "mta_queens_bus_network_redesign_service_changes",
        sourceUrl: "https://www.mta.info/project/queens-bus-network-redesign/service-changes",
        sourceArtifact: "source.html",
        documentDate: "2025-06-29",
        sourceGroup: "route_redesign",
        blockId: "p001_b0044",
        pageNumber: 1,
        rawText: "Q39: The northern turnaround will be revised so the route terminates at Queens Plaza.",
      }],
      ["Q69", {
        sourceId: "meeting_doc_167241",
        sourceUrl: "https://www.mta.info/document/167241",
        sourceArtifact: "source.pdf",
        documentDate: "2025-01",
        sourceGroup: "mta_board_meeting",
        blockId: "p028_c0009",
        pageNumber: 28,
        rawText: "Q69 saw a 22% speed gain along Queens Plaza.",
      }],
      ["Q101", {
        sourceId: "queens_service_change_board_item_2025",
        sourceUrl: "https://www.mta.info/document/163136",
        sourceArtifact: "source.pdf",
        documentDate: "2025-01",
        sourceGroup: "board_books",
        blockId: "p030_c0003",
        pageNumber: 30,
        rawText: "Q101 improves transfers at Queens Plaza and Court Square.",
      }],
      ["Q102", {
        sourceId: "queens_service_change_board_item_2025",
        sourceUrl: "https://www.mta.info/document/163136",
        sourceArtifact: "source.pdf",
        documentDate: "2025-01",
        sourceGroup: "board_books",
        blockId: "p030_c0008",
        pageNumber: 30,
        rawText: "Q102 provides more direct service between Roosevelt Island and Queens Plaza.",
      }],
    ]);
    const features = [
      ["0138068", "WB"], ["9024008", "WB"], ["9009907", "WB"], ["9024007", "WB"],
    ].map(([featureId, direction]) => lane({
      feature_id: featureId!, lane_group_id: "QNS|QUEENS PLAZA", opened: "12/13/2025",
      direction: direction!, attributes: { open_dates: "12/13/2025", segmentid: featureId! },
    }));
    for (const routeId of routes) {
      const entry = candidate(`queens-plaza-${routeId.toLowerCase()}`, routeId, date);
      const reason = directionGapRoutes.has(routeId) ? "direction_unknown" : "insufficient_path_points";
      const [baseRow] = buildBusLaneIdentityLedger({
        bridgeCandidates: [entry.bridge], trackerCandidates: [entry.tracker], routeAnchors: [anchor(routeId)],
        dossierRows: [dossier({ candidateId: entry.bridge.candidate_id, routeId, date, laneGroupId: null,
          pathSource: "historical_schedule_timepoint_pattern", pathIdentity: `${routeId}-pattern`, reason })],
        dossierArtifact: "dossier.jsonl", laneFeatures: features, laneSnapshotId: "lanes",
        laneSourceId: "lane_source", gtfsServiceWindows: [{ start: "2025-01-01", end: "2026-12-31" }],
      });
      const rootDir = mkdtempSync(join(tmpdir(), `bus-lane-queens-plaza-${routeId.toLowerCase()}-`));
      const receiptDir = join(rootDir, "receipts");
      const acquiredDir = join(rootDir,
        "data/quality/relationship-integrity/bus-lane-acquisition/supplemental/queens-plaza-fixture");
      mkdirSync(receiptDir, { recursive: true });
      mkdirSync(acquiredDir, { recursive: true });
      const contextSource = contextSources.get(routeId);
      const contextSourceBytes = contextSource
        ? Buffer.from(`fixture official ${contextSource.sourceId} source`)
        : undefined;
      const contextSourceHash = contextSourceBytes
        ? createHash("sha256").update(contextSourceBytes).digest("hex")
        : undefined;
      const contextTextHash = contextSource
        ? `sha256:${createHash("sha256").update(contextSource.rawText).digest("hex")}`
        : undefined;
      if (contextSource && contextSourceBytes && contextSourceHash && contextTextHash) {
        const sourceDir = join(rootDir, "raw", "sources", contextSource.sourceId);
        mkdirSync(sourceDir, { recursive: true });
        writeFileSync(join(sourceDir, contextSource.sourceArtifact), contextSourceBytes);
        writeFileSync(join(sourceDir, "metadata.json"), JSON.stringify({
          sourceId: contextSource.sourceId,
          sourceUrl: contextSource.sourceUrl,
          sha256: `sha256:${contextSourceHash}`,
          title: `Official MTA ${routeId} Queens Plaza context`,
          documentDate: contextSource.documentDate,
          sourceGroup: contextSource.sourceGroup,
        }));
        writeFileSync(join(sourceDir, "blocks.jsonl"), `${JSON.stringify({
          source_id: contextSource.sourceId,
          block_id: contextSource.blockId,
          page_number: contextSource.pageNumber,
          raw_text: contextSource.rawText,
          normalized_text: contextSource.rawText,
          raw_text_sha256: contextTextHash,
        })}\n`);
      }
      writeFileSync(join(acquiredDir, "acquired-source-checks.json"), JSON.stringify({ sources: [
        { url: currentProjectsUrl, content_sha256: currentProjectsHash, retrieval_status: "acquired" },
        { url: projects2025Url, content_sha256: projects2025Hash, retrieval_status: "acquired" },
        ...(contextSource && contextSourceHash
          ? [{ url: contextSource.sourceUrl, content_sha256: contextSourceHash, retrieval_status: "acquired" }]
          : []),
      ] }));
      const attempts = [
        { category: "official_nyc_dot_lane_project",
          query: `site:nyc.gov ${routeId} Queens Plaza 2025-12-13 lane project`,
          query_status: "performed_2026-07-15", urls_checked: [currentProjectsUrl],
          retrievals: [{ id: "current-projects", retrieved_on: "2026-07-15",
            sha256: currentProjectsHash, status: "acquired" }] },
        { category: "official_public_board_committee",
          query: `site:nyc.gov ${routeId} Queens Plaza 2025-12-13 public board`,
          query_status: "performed_2026-07-15", urls_checked: [projects2025Url],
          retrievals: [{ id: "projects-2025", retrieved_on: "2026-07-15",
            sha256: projects2025Hash, status: "acquired" }] },
      ];
      const prior = {
        receipt_id: `prior-queens-plaza-${routeId.toLowerCase()}`, researched_on: "2026-07-15",
        source_findings: { exact_project_route_statement_found: false },
        outcome: { still_unresolved: true },
        canonical_actions: { canonical_links_added: [], operational_occurrence_added_or_updated: false },
        claim_results: {
          date_and_phase_proved: false, exact_route_treatment_binding_proved: false,
          exact_segment_binding_proved: false, operational_occurrence_identity_proved: false,
          exact_route_binding_evidence: [],
        },
        acquisition_attempts: attempts,
      };
      const priorLine = stableJson(prior as unknown as JsonValue);
      writeFileSync(join(rootDir, "prior.jsonl"), `${priorLine}\n`);
      const row = { ...baseRow!, prior_acquisition_receipt: {
        receipt_id: prior.receipt_id, artifact: "prior.jsonl",
        row_sha256: createHash("sha256").update(priorLine).digest("hex"),
        disposition: "completed_search_route_linkage_unresolved", next_action: "Retain pure absence.",
      } };
      const packet = buildBusLaneResearchPackets([row]).packets[0]!;
      const targetFor = (candidatePacket = packet) => {
        const groups = candidatePacket.what_is_known.target_groups;
        const matches = groups.flatMap((group) => group.feature_matches);
        return {
          directions: [...new Set(matches.map((match) => match.direction))].sort(),
          feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
          feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
          feature_row_count: matches.length,
          feature_rows: matches.map((match) => ({
            feature_key: match.feature_key, feature_id: match.feature_id, direction: match.direction,
          })),
          geometry_scopes: [...new Set(groups.map((group) => group.geometry_scope))].sort(),
          lane_group_ids: groups.map((group) => group.lane_group_id), matched_date: date,
          named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
          open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
        };
      };
      const positiveContext = contextSource && contextSourceHash && contextTextHash
        ? {
          source_id: contextSource.sourceId,
          source_url: contextSource.sourceUrl,
          ...(contextSource.sourceArtifact === "source.pdf"
            ? { source_pdf_sha256: contextSourceHash }
            : { source_artifact: "source.html", source_content_sha256: contextSourceHash }),
          evidence_refs: [{
            block_id: contextSource.blockId,
            page_number: contextSource.pageNumber,
            text_sha256: contextTextHash,
          }],
          context_finding: {
            candidate_route_id: routeId,
            finding_kind: "positive_route_corridor_context_nonterminal",
            supported_scope: "route_corridor_context_only",
            unsupported_bindings: packet.unresolved_bindings,
            finding_summary:
              `The official MTA source places ${routeId} at or along Queens Plaza, without binding the exact lane rows, registry day, phase, direction, or traversal.`,
          },
          remaining_unresolved_bindings: packet.unresolved_bindings,
          authorizes_study: false,
          authorizes_cross_product: false,
        }
        : undefined;
      const supplemental = {
        domains: [...new Set(["www.nyc.gov", ...(contextSource ? ["www.mta.info"] : [])])].sort(),
        exact_queries: [
          { category: "official_nyc_dot_lane_project",
            query: `site:nyc.gov ${routeId} Queens Plaza 2025-12-13 lane project`,
            query_status: "performed_2026-07-23_reviewed_results" },
          { category: "official_public_board_committee",
            query: `site:nyc.gov ${routeId} Queens Plaza 2025-12-13 public board`,
            query_status: "performed_2026-07-23_reviewed_results" },
          ...(contextSource ? [{
            category: "official_mta_route_project",
            query: `site:mta.info ${routeId} Queens Plaza route service 2025`,
            query_status: "performed_2026-07-23_reviewed_results",
          }] : []),
        ],
        finding_corrections: [], positive_context_findings: positiveContext ? [positiveContext] : [],
        operator: "fixture-reviewer",
        retrievals: [
          { category: "official_nyc_dot_lane_project", retrieved_on: "2026-07-23",
            sha256: currentProjectsHash, status: "acquired", url: currentProjectsUrl },
          { category: "official_public_board_committee", retrieved_on: "2026-07-23",
            sha256: projects2025Hash, status: "acquired", url: projects2025Url },
          ...(contextSource && contextSourceHash ? [{
            category: "official_mta_route_project", retrieved_on: "2026-07-23",
            sha256: contextSourceHash, status: "acquired", url: contextSource.sourceUrl,
          }] : []),
        ],
        searched_at: "2026-07-23T12:00:00Z",
        urls_inspected: [currentProjectsUrl, projects2025Url,
          ...(contextSource ? [contextSource.sourceUrl] : [])].sort(),
      };
      const expectedMissingBinding = directionGapRoutes.has(routeId) ? "direction" : "traversal";
      const expectedUnresolved = directionGapRoutes.has(routeId)
        ? ["attribution", "direction", "traversal"]
        : ["attribution", "traversal"];
      const receipt = {
        schema_version: 1, receipt_id: `binding-queens-plaza-${routeId.toLowerCase()}`,
        receipt_kind: "binding_absent_after_search", candidate_id: row.candidate_id,
        candidate_fingerprint: row.candidate_fingerprint, gtfs_route_id: routeId, implementation_date: date,
        gap_ids: [row.ledger_id], searched_at: "2026-07-15", operator: "fixture-reviewer",
        candidate_urls: [], disposition: "binding_absent_after_search", missing_binding: expectedMissingBinding,
        unresolved_bindings: expectedUnresolved, target: targetFor(), prior_receipt: {
          receipt_id: prior.receipt_id, artifact: "prior.jsonl", row_sha256: row.prior_acquisition_receipt.row_sha256,
        },
        search: {
          exact_queries: attempts.map(({ category, query, query_status }) => ({ category, query, query_status })),
          domains: ["www.nyc.gov"], urls_inspected: [currentProjectsUrl, projects2025Url].sort(),
          retrievals: attempts.flatMap((attempt) => attempt.retrievals.map((retrieval) =>
            ({ category: attempt.category, ...retrieval }))), disposition: "binding_absent_after_search",
        },
        supplemental_search: supplemental, authorizes_study: false, authorizes_cross_product: false,
      };
      const validate = (draft: Record<string, unknown>, candidateRow = row, candidatePacket = packet) => {
        writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
        return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
      };
      const drift = (changes: Record<string, unknown>) => {
        const targetGroups = packet.what_is_known.target_groups.map((group) => ({ ...group,
          feature_matches: group.feature_matches.map((match, index) => index === 0 ? { ...match, ...changes } : match),
        }));
        const candidatePacket = { ...packet, what_is_known: { ...packet.what_is_known, target_groups: targetGroups } };
        const candidateRow = { ...row, onset_evidence: { ...row.onset_evidence, target_groups: targetGroups } };
        return { candidatePacket, candidateRow, draft: { ...receipt, target: targetFor(candidatePacket) } };
      };
      try {
        expect(packet.missing_binding).toBe(expectedMissingBinding);
        expect(packet.unresolved_bindings).toEqual(expectedUnresolved);
        expect(targetFor()).toMatchObject({
          feature_row_count: 4, feature_ids: ["0138068", "9009907", "9024007", "9024008"],
          directions: ["WB"], named_sbs_routes: [], open_dates_literals: ["12/13/2025"],
        });
        expect(supplemental.positive_context_findings).toHaveLength(contextSource ? 1 : 0);
        expect(validate(receipt)).not.toThrow();
        if (routeId === "Q100") {
          for (const altered of [
            drift({ feature_key: "dot-lane-feature:drift" }), drift({ feature_id: "9999999" }),
            drift({ direction: "EB" }), drift({ matched_date: "2025-12-14" }),
            drift({ matched_token_literal: "12/13/25", open_dates_literal: "12/13/25" }),
            drift({ sbs_routes: ["Q100"] }),
          ]) {
            expect(validate(altered.draft, altered.candidateRow, altered.candidatePacket))
              .toThrow("Queens Plaza nine-route nonterminal-context review contract does not match the exact candidate");
          }
          expect(validate({ ...receipt, supplemental_search: { ...supplemental,
            exact_queries: supplemental.exact_queries.map((query) => ({ ...query,
              query: query.query.replace("2025-12-13", "2025-12-14"),
            })) } })).toThrow("Queens Plaza nine-route nonterminal-context review contract does not match the exact candidate");
          expect(validate({ ...receipt, supplemental_search: { ...supplemental,
            positive_context_findings: [{}] } })).toThrow();
          expect(validate({ ...receipt, supplemental_search: { ...supplemental,
            finding_corrections: [{}] } })).toThrow();
          expect(validate({ ...receipt,
            occurrence_context: { occurrence_id: "occurrence_fake", accepted_decision_id: "decision_fake" } }))
            .toThrow("occurrence context is not bound to an accepted occurrence decision");
          expect(validate({ ...receipt, authorizes_study: true }))
            .toThrow("binding receipt search preservation or authorization guard failed");
        }
        if (positiveContext) {
          expect(validate({ ...receipt, supplemental_search: {
            ...supplemental,
            positive_context_findings: [{ ...positiveContext, evidence_refs: [{
              ...positiveContext.evidence_refs[0], text_sha256: `sha256:${"f".repeat(64)}`,
            }] }],
          } })).toThrow("positive-context source-block id, page, or text hash does not resolve");
          expect(validate({ ...receipt, supplemental_search: {
            ...supplemental,
            positive_context_findings: [{
              ...positiveContext,
              remaining_unresolved_bindings: packet.unresolved_bindings.filter(
                (binding) => binding !== "traversal",
              ),
            }],
          } })).toThrow("route/corridor context transferred to exact Queens Plaza lane rows or traversal");
          expect(validate({ ...receipt, supplemental_search: {
            ...supplemental,
            positive_context_findings: [{ ...positiveContext, authorizes_study: true }],
          } })).toThrow("route/corridor context transferred to exact Queens Plaza lane rows or traversal");
        }
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    }
  });

  it("closes Hillside Avenue batches only with exact 195-row nonrefutational targets", () => {
    const date = "2025-09-15";
    const priorReceiptIds = new Map([
      ["Q1", "queens-acquisition:ada385860a650d3218a38705"],
      ["Q110", "queens-acquisition:5e146d100dff2cc2f758c879"],
      ["Q24", "queens-acquisition:4b26047a7ca7458882edf69a"],
      ["Q44+", "queens-acquisition:f06f6aee8e250a15de1f5971"],
      ["Q76", "queens-acquisition:d48a5a764e865cf9acf7aff4"],
    ]);
    const uniqueFeatures = Array.from({ length: 190 }, (_, index) => {
      const featureId = String(1_000_000 + (index % 97));
      const direction = index < 97 ? "EB" : "WB";
      return lane({
        feature_id: featureId,
        lane_group_id: "QNS|HILLSIDE AVENUE",
        opened: "9/15/2025",
        direction,
        attributes: { open_dates: "9/15/2025", segmentid: featureId, direction },
      });
    });
    const features = [
      ...uniqueFeatures,
      ...uniqueFeatures.slice(0, 5),
      lane({
        feature_id: "other-phase",
        lane_group_id: "QNS|HILLSIDE AVENUE",
        opened: "1/1/2024",
        direction: "EB",
      }),
    ];
    for (const routeId of ["Q1", "Q110", "Q24", "Q44+", "Q76"]) {
      const entry = candidate(`hillside-${routeId.toLowerCase()}`, routeId, date);
      const directionGap = routeId === "Q110";
      const attributionGap = ["Q110", "Q24", "Q44+"].includes(routeId);
      const hasTargetDossierContext = routeId === "Q1" || routeId === "Q76";
      const [baseRow] = buildBusLaneIdentityLedger({
        bridgeCandidates: [entry.bridge],
        trackerCandidates: [entry.tracker],
        routeAnchors: [anchor(routeId)],
        dossierRows: [dossier({
          candidateId: entry.bridge.candidate_id,
          routeId,
          date,
          laneGroupId: hasTargetDossierContext ? "QNS|HILLSIDE AVENUE" : null,
          pathSource: "historical_schedule_timepoint_pattern",
          pathIdentity: `${routeId}-pattern`,
          reason: directionGap ? "direction_unknown" : "insufficient_path_points",
        })],
        dossierArtifact: "dossier.jsonl",
        laneFeatures: features,
        laneSnapshotId: "lanes",
        laneSourceId: "lane_source",
        gtfsServiceWindows: [{ start: "2025-01-01", end: "2026-12-31" }],
      });
      const rootDir = mkdtempSync(join(tmpdir(), `bus-lane-hillside-${routeId.toLowerCase()}-`));
      const receiptDir = join(rootDir, "receipts");
      const priorArtifact =
        "data/quality/relationship-integrity/bus-lane-acquisition/shards/queens/receipts.jsonl";
      mkdirSync(receiptDir, { recursive: true });
      mkdirSync(join(rootDir,
        "data/quality/relationship-integrity/bus-lane-acquisition/shards/queens"), { recursive: true });
      const attempts = [
        {
          category: "official_nyc_dot_lane_project",
          query: "site:nyc.gov/html/dot Hillside Avenue bus lanes 2025 routes community board PDF",
          query_status: "performed_2026-07-15",
          urls_checked: ["https://www.nyc.gov/hillside-project"],
          retrievals: [{ id: "hillside-project", retrieved_on: "2026-07-15",
            sha256: "1".repeat(64), status: "acquired" }],
        },
        {
          category: "official_mta_route_project",
          query: `site:mta.info "${routeId}" "Hillside Avenue" bus route project`,
          query_status: "performed_2026-07-15",
          urls_checked: [`https://bustime-classic.mta.info/m/?q=${routeId}`],
          retrievals: [{ id: `mta-${routeId}`, retrieved_on: "2026-07-15",
            sha256: "2".repeat(64), status: "acquired" }],
        },
        {
          category: "official_public_board_committee",
          query: "site:nyc.gov Hillside Avenue bus lanes 2025 community board",
          query_status: "performed_2026-07-15",
          urls_checked: ["https://www.nyc.gov/hillside-board"],
          retrievals: [{ id: "hillside-board", retrieved_on: "2026-07-15",
            sha256: "3".repeat(64), status: "acquired" }],
        },
        {
          category: "other_repository_approved_primary",
          query: "NYC DOT Open Data ycrg-ses3 facility=Hillside Avenue open_dates contains 2025-09-15",
          query_status: "executed_2026-07-15",
          urls_checked: ["https://data.cityofnewyork.us/hillside"],
          retrievals: [{ id: "open-data", retrieved_on: "2026-07-15",
            sha256: "4".repeat(64), status: "acquired" }],
        },
      ];
      const isQ1 = routeId === "Q1";
      const prior = {
        receipt_id: priorReceiptIds.get(routeId),
        researched_on: "2026-07-15",
        candidate: {
          candidate_id: entry.bridge.candidate_id,
          normalized_route_id: routeId === "Q44+" ? "Q44" : routeId,
          route_id: routeId,
          implementation_date: date,
          identity: `${routeId}|bus_lane|2025-09-15|day`,
        },
        source_findings: {
          candidate_named_lane_record_count: 0,
          official_lane_matching_record_count: 195,
          official_lane_matching_segment_ids: Array.from({ length: 97 }, (_, index) => String(index)),
          official_lane_named_routes: [],
          official_route_named_segment_ids: [],
          exact_project_route_statement_found: isQ1,
          exact_project_route_source_id: isQ1 ? "mta_q1_hillside_profile" : null,
          mta_route_page: {
            exact_route_title_found: true,
            current_corridor_token_found: false,
            retrieval_status: "acquired",
            temporal_limitation: "The live route page is not candidate-date traversal proof.",
          },
        },
        outcome: {
          exclusive_primary_disposition: isQ1
            ? "linkage_supported_phase_unresolved"
            : "completed_search_route_linkage_unresolved",
          registry_projection_excluded: true,
          still_unresolved: true,
          study_projection_eligible: false,
        },
        claim_results: {
          candidate_date_supported_at_day_precision: isQ1,
          physical_bus_lane_record_acquired: true,
          candidate_segment_ids_pinned: false,
          date_and_phase_proved: false,
          exact_route_treatment_binding_proved: isQ1,
          exact_segment_binding_proved: false,
          explicit_phase_identity_proved: false,
          operational_occurrence_identity_proved: false,
          exact_route_binding_evidence: isQ1 ? [{ source_id: "mta_q1_hillside_profile" }] : [],
          exact_segment_ids: [],
        },
        canonical_actions: {
          canonical_links_added: isQ1 ? ["link-1", "link-2", "link-3"] : [],
          canonical_records_added: isQ1 ? ["record-1", "record-2"] : [],
          canonical_records_updated: isQ1 ? ["route-q1"] : [],
          operational_occurrence_added_or_updated: false,
        },
        acquisition_attempts: attempts,
      };
      const priorLine = stableJson(prior as unknown as JsonValue);
      writeFileSync(join(rootDir, priorArtifact), `${priorLine}\n`);
      const row = { ...baseRow!, prior_acquisition_receipt: {
        receipt_id: prior.receipt_id!,
        artifact: priorArtifact,
        row_sha256: createHash("sha256").update(priorLine).digest("hex"),
        disposition: prior.outcome.exclusive_primary_disposition,
        next_action: "Retain exact nonrefutational absence.",
      } };
      const packet = buildBusLaneResearchPackets([row]).packets[0]!;
      const groups = packet.what_is_known.target_groups;
      const matches = groups.flatMap((group) => group.feature_matches);
      const urls = [...new Set(attempts.flatMap((attempt) => attempt.urls_checked))].sort();
      const target = {
        directions: [...new Set(matches.map((match) => match.direction))].sort(),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
        feature_row_count: matches.length,
        feature_rows: matches.map((match) => ({
          feature_key: match.feature_key, feature_id: match.feature_id, direction: match.direction,
        })),
        geometry_scopes: [...new Set(groups.map((group) => group.geometry_scope))].sort(),
        lane_group_ids: groups.map((group) => group.lane_group_id),
        matched_date: date,
        named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
        open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
      };
      const unresolvedLead = packet.unresolved_bindings.includes("attribution")
        ? "Attribution, direction, feature extent, phase, and traversal"
        : "Direction, feature extent, phase, and traversal";
      const rationale = isQ1
        ? "Completed candidate-exact Queens acquisition searches preserve an evidence-backed Q1 route, treatment, and corridor context for the Hillside Avenue project, but do not bind Q1 to all 195 candidate-date feature-row occurrences, their full eastbound and westbound direction scope, a stable onset-versus-extension phase, or candidate-date traversal. The candidate and reconciliation artifacts retain no exact historical matched-segment identifiers, and the registry rows name no SBS route. Direction, feature extent, phase, and traversal remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection."
        : routeId === "Q44+"
          ? "Completed candidate-exact Queens acquisition searches retained all 195 Hillside Avenue candidate-date feature-row occurrences, 190 unique feature keys, 97 feature IDs, both eastbound and westbound directions, and the exact 2025-09-15 registry day. The prior acquisition normalizes the route to Q44 while preserving this ledger row's Q44+ SBS identity, the registry rows name no SBS route, candidate-dated historical schedule patterns cannot prove full direction-specific traversal or exclusion, and the pinned candidate provenance does not identify the exact matched subset or stable onset-versus-extension phase. Attribution, direction, feature extent, phase, and traversal remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection."
          : `Completed candidate-exact Queens acquisition searches retained all 195 Hillside Avenue candidate-date feature-row occurrences, 190 unique feature keys, 97 feature IDs, both eastbound and westbound directions, and the exact 2025-09-15 registry day. The registry rows name no SBS route, candidate-dated historical schedule patterns cannot prove full direction-specific traversal or exclusion, and the pinned candidate provenance does not identify the exact matched subset or stable onset-versus-extension phase. ${unresolvedLead} remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`;
      const receipt = {
        schema_version: 1,
        receipt_id: `binding-hillside-${routeId.toLowerCase()}`,
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
        target,
        prior_receipt: {
          receipt_id: prior.receipt_id,
          artifact: priorArtifact,
          row_sha256: row.prior_acquisition_receipt.row_sha256,
        },
        rationale,
        search: {
          exact_queries: attempts.map(({ category, query, query_status }) => ({ category, query, query_status })),
          domains: [...new Set(urls.map((url) => new URL(url).hostname))].sort(),
          urls_inspected: urls,
          retrievals: attempts.flatMap((attempt) => attempt.retrievals.map((retrieval) =>
            ({ category: attempt.category, ...retrieval }))),
          disposition: "binding_absent_after_search",
        },
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      const validate = (draft: Record<string, unknown>, candidateRow = row, candidatePacket = packet) => {
        writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
        return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
      };
      const packetWithDossier = (dossierRefs: typeof packet.what_is_known.dossier_refs) => {
        const verdictCount = (verdict: typeof dossierRefs[number]["verdict_class"]) =>
          dossierRefs.filter((ref) => ref.verdict_class === verdict).length;
        const sourceCount = (source: typeof dossierRefs[number]["path_source"]) =>
          dossierRefs.filter((ref) => ref.path_source === source).length;
        const reasons = Object.fromEntries([...new Set(dossierRefs.map((ref) => ref.reason))].sort()
          .map((reason) => [reason, dossierRefs.filter((ref) => ref.reason === reason).length]));
        return {
          ...packet,
          what_is_known: {
            ...packet.what_is_known,
            dossier_refs: dossierRefs,
            dossier_summary: {
              row_count: dossierRefs.length,
              target_row_count: dossierRefs.filter((ref) => ref.candidate_target_match).length,
              counts_by_verdict: {
                traversal_confirmed: verdictCount("traversal_confirmed"),
                traversal_marginal: verdictCount("traversal_marginal"),
                no_traversal: verdictCount("no_traversal"),
                geometry_ambiguous: verdictCount("geometry_ambiguous"),
              },
              counts_by_reason: reasons,
              counts_by_path_source: {
                gtfs_shape: sourceCount("gtfs_shape"),
                historical_schedule_timepoint_pattern: sourceCount("historical_schedule_timepoint_pattern"),
                unavailable: sourceCount("unavailable"),
              },
            },
          },
        };
      };
      try {
        expect(packet.missing_binding).toBe(directionGap ? "direction" : "feature_extent");
        expect(packet.unresolved_bindings).toEqual(attributionGap
          ? ["attribution", "direction", "feature_extent", "phase", "traversal"]
          : ["direction", "feature_extent", "phase", "traversal"]);
        expect(target).toMatchObject({
          feature_row_count: 195,
          directions: ["EB", "WB"],
          named_sbs_routes: [],
          open_dates_literals: ["9/15/2025"],
        });
        expect(target.feature_keys).toHaveLength(190);
        expect(target.feature_ids).toHaveLength(97);
        expect(validate(receipt)).not.toThrow();
        expect(validate({ ...receipt, rationale: `${rationale} Traversal refuted.` }))
          .toThrow("Hillside Avenue absence contract does not match the exact candidate");
        expect(validate({ ...receipt, target: { ...target, feature_row_count: 194 } }))
          .toThrow("binding receipt feature-row accounting parity failed");
        expect(validate({ ...receipt, supplemental_search: {} }))
          .toThrow("Hillside Avenue absence contract does not match the exact candidate");
        expect(validate({ ...receipt, authorizes_study: true }))
          .toThrow("binding receipt search preservation or authorization guard failed");
        const currentGtfsNoTraversalRefs = packet.what_is_known.dossier_refs.map((ref) => ({
          ...ref,
          path_source: "gtfs_shape" as const,
          verdict_class: "no_traversal" as const,
        }));
        const currentGtfsNoTraversalPacket = packetWithDossier(currentGtfsNoTraversalRefs);
        expect(validate(receipt, row, currentGtfsNoTraversalPacket))
          .toThrow("Hillside Avenue packet dossier does not preserve exact ledger evidence parity");
        expect(validate(receipt, { ...row, dossier_refs: currentGtfsNoTraversalRefs },
          currentGtfsNoTraversalPacket))
          .toThrow("Hillside Avenue absence contract does not match the exact candidate");
        const traversalConfirmedRefs = packet.what_is_known.dossier_refs.map((ref) => ({
          ...ref,
          verdict_class: "traversal_confirmed" as const,
        }));
        expect(validate(receipt, { ...row, dossier_refs: traversalConfirmedRefs },
          packetWithDossier(traversalConfirmedRefs)))
          .toThrow("Hillside Avenue absence contract does not match the exact candidate");
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    }
  });

  it("closes Battery Place only with exact 16-row nonrefutational targets", () => {
    const date = "2021-06-10";
    const routeContracts = [
      {
        routeId: "M20", receiptId: "manhattan-acquisition:1fd68dccc2283be0d3603643",
        shard: "manhattan", supported: false,
      },
      {
        routeId: "QM7", receiptId: "queens-acquisition:26bc7bef1a16dea6b4dc596a",
        shard: "queens", supported: false, crossShardContext: true,
      },
      {
        routeId: "SIM1", receiptId: "staten-island-acquisition:b16431603d8b738210f3ba79",
        shard: "staten-island", supported: true,
      },
      {
        routeId: "X27", receiptId: "brooklyn-null-acquisition:894f74a1372188c7d3658ba9",
        shard: "brooklyn-null", supported: true,
      },
    ];
    const uniqueFeatures = Array.from({ length: 11 }, (_, index) => {
      const featureId = String(2_000_000 + index);
      return lane({
        feature_id: featureId,
        lane_group_id: "MAN|BATTERY PLACE",
        opened: "06/10/2021",
        direction: "WB",
        attributes: { open_dates: "06/10/2021", segmentid: featureId, direction: "WB" },
      });
    });
    const features = [...uniqueFeatures, ...uniqueFeatures.slice(0, 5)];
    for (const contract of routeContracts) {
      const { routeId, receiptId, shard, supported } = contract;
      const compactLaneField = shard === "manhattan" || shard === "brooklyn-null";
      const crossShardContext = "crossShardContext" in contract && contract.crossShardContext === true;
      const entry = candidate(`battery-place-${routeId.toLowerCase()}`, routeId, date);
      const unavailableDossier = {
        ...dossier({
          candidateId: entry.bridge.candidate_id,
          routeId,
          date,
          laneGroupId: null,
          pathSource: "unavailable",
          pathIdentity: null,
          reason: "historical_schedule_unavailable_pre_2023",
          coverage: 0,
        }),
        service_date: null,
        direction: null,
        temporal_lag_days: null,
        route_miles: 0,
        span: { first_stop_id: null, last_stop_id: null, stop_ids: [] },
      } satisfies LaneTraversalRow;
      const [baseRow] = buildBusLaneIdentityLedger({
        bridgeCandidates: [entry.bridge],
        trackerCandidates: [entry.tracker],
        routeAnchors: [anchor(routeId)],
        dossierRows: [unavailableDossier],
        dossierArtifact: "dossier.jsonl",
        laneFeatures: features,
        laneSnapshotId: "lanes",
        laneSourceId: "lane_source",
        gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
      });
      const rootDir = mkdtempSync(join(tmpdir(), `bus-lane-battery-${routeId.toLowerCase()}-`));
      const receiptDir = join(rootDir, "receipts");
      const priorArtifact =
        `data/quality/relationship-integrity/bus-lane-acquisition/shards/${shard}/receipts.jsonl`;
      mkdirSync(receiptDir, { recursive: true });
      mkdirSync(join(rootDir,
        `data/quality/relationship-integrity/bus-lane-acquisition/shards/${shard}`), { recursive: true });
      const attempts = [
        {
          category: "official_nyc_dot_lane_project",
          query: `site:nyc.gov Battery Place bus lane 2021 ${routeId}`,
          query_status: "performed_2026-07-15",
          urls_checked: ["https://www.nyc.gov/battery-place"],
          retrievals: [{ id: "battery-project", retrieved_on: "2026-07-15",
            sha256: "1".repeat(64), status: "acquired" }],
        },
        {
          category: "official_mta_route_project",
          query: `site:mta.info "${routeId}" "Battery Pl" bus route project`,
          query_status: "performed_2026-07-15",
          urls_checked: [`https://bustime-classic.mta.info/m/?q=${routeId}`],
          retrievals: [{ id: `mta-${routeId}`, retrieved_on: "2026-07-15",
            sha256: "2".repeat(64), status: "acquired" }],
        },
        {
          category: "official_public_board_committee",
          query: `site:nyc.gov Battery Place bus lane 2021 ${routeId} community board`,
          query_status: "performed_2026-07-15",
          urls_checked: ["https://www.nyc.gov/battery-place-board"],
          retrievals: [{ id: "battery-board", retrieved_on: "2026-07-15",
            sha256: "3".repeat(64), status: "acquired" }],
        },
        {
          category: "other_repository_approved_primary",
          query: "NYC DOT Open Data Battery Place open_dates contains 2021-06-10",
          query_status: "executed_2026-07-15",
          urls_checked: ["https://data.cityofnewyork.us/battery-place"],
          retrievals: [{ id: "open-data", retrieved_on: "2026-07-15",
            sha256: "4".repeat(64), status: "acquired" }],
        },
      ];
      const prior = {
        receipt_id: receiptId,
        researched_on: "2026-07-15",
        candidate: {
          candidate_id: entry.bridge.candidate_id,
          normalized_route_id: routeId,
          route_id: routeId,
          implementation_date: date,
          identity: `${routeId}|bus_lane|2021-06-10|day`,
        },
        source_findings: {
          candidate_named_lane_record_count: 0,
          official_lane_matching_record_count: 16,
          official_lane_matching_segment_ids: Array.from({ length: 11 }, (_, index) => String(index)),
          ...(compactLaneField
            ? { official_lane_named_sbs_routes: [] }
            : { official_lane_named_routes: [], official_route_named_segment_ids: [] }),
          exact_project_route_statement_found: supported,
          exact_project_route_source_id: supported ? "better_buses_action_plan_2019" : null,
          mta_route_page: {
            exact_route_title_found: true,
            current_corridor_token_found: supported,
            retrieval_status: "acquired",
            temporal_limitation: "The live route page is not candidate-date traversal proof.",
          },
        },
        outcome: {
          exclusive_primary_disposition: supported
            ? "linkage_supported_phase_unresolved"
            : "completed_search_route_linkage_unresolved",
          registry_projection_excluded: true,
          still_unresolved: true,
          study_projection_eligible: false,
        },
        claim_results: {
          ...(["manhattan", "queens", "brooklyn-null"].includes(shard)
            ? { candidate_date_supported_at_day_precision: false }
            : {}),
          physical_bus_lane_record_acquired: true,
          ...(shard === "brooklyn-null" ? {} : { candidate_segment_ids_pinned: false }),
          date_and_phase_proved: false,
          exact_route_treatment_binding_proved: supported,
          exact_segment_binding_proved: false,
          explicit_phase_identity_proved: false,
          operational_occurrence_identity_proved: false,
          exact_route_binding_evidence: supported ? [{ source_id: "better_buses_action_plan_2019" }] : [],
          exact_segment_ids: [],
        },
        canonical_actions: {
          canonical_links_added: [],
          ...(shard === "queens" ? { canonical_records_added: [], canonical_records_updated: [] } : {}),
          operational_occurrence_added_or_updated: false,
        },
        acquisition_attempts: attempts,
      };
      const priorLine = stableJson(prior as unknown as JsonValue);
      writeFileSync(join(rootDir, priorArtifact), `${priorLine}\n`);
      const contextArtifact =
        "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/receipts.jsonl";
      const contextPrior = {
        receipt_id: "staten-island-acquisition:b16431603d8b738210f3ba79",
        candidate: { route_id: "SIM1", implementation_date: date },
        source_findings: {
          exact_project_route_statement_found: true,
          exact_project_route_source_id: "better_buses_action_plan_2019",
          official_project_route_inventory: [
            "BM1", "BM2", "BM3", "BM4", "QM7", "QM8", "QM11", "QM25", "SIM1", "SIM1C", "SIM2", "SIM3C",
            "SIM4", "SIM4C", "SIM4X", "SIM5", "SIM15", "SIM32", "SIM33C", "SIM34", "SIM35", "X27", "X28",
          ],
        },
        claim_results: {
          candidate_segment_ids_pinned: false,
          date_and_phase_proved: false,
          exact_route_treatment_binding_proved: true,
          exact_segment_binding_proved: false,
          exact_segment_ids: [],
          explicit_phase_identity_proved: false,
          operational_occurrence_identity_proved: false,
          physical_bus_lane_record_acquired: true,
          exact_route_binding_evidence: [{
            evidence_kind: "official_project_route_statement",
            source_id: "better_buses_action_plan_2019",
            source_sha256: "68ac9e1aaf17a033577688e241e586ac101581ef0e2ba0cc3854196f9323f1c1",
            official_routes: [
              "BM1", "BM2", "BM3", "BM4", "QM7", "QM8", "QM11", "QM25", "SIM1", "SIM1C", "SIM2", "SIM3C",
              "SIM4", "SIM4C", "SIM4X", "SIM5", "SIM15", "SIM32", "SIM33C", "SIM34", "SIM35", "X27", "X28",
            ],
          }],
        },
        outcome: {
          exclusive_primary_disposition: "linkage_supported_phase_unresolved",
          registry_projection_excluded: true,
          still_unresolved: true,
          study_projection_eligible: false,
        },
        canonical_actions: { canonical_links_added: [], operational_occurrence_added_or_updated: false },
      };
      const contextLine = stableJson(contextPrior as unknown as JsonValue);
      if (crossShardContext) {
        mkdirSync(join(rootDir,
          "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island"), { recursive: true });
        writeFileSync(join(rootDir, contextArtifact), `${contextLine}\n`);
      }
      const row = { ...baseRow!, prior_acquisition_receipt: {
        receipt_id: receiptId,
        artifact: priorArtifact,
        row_sha256: createHash("sha256").update(priorLine).digest("hex"),
        disposition: prior.outcome.exclusive_primary_disposition,
        next_action: "Retain exact nonrefutational Battery Place absence.",
      } };
      const packet = buildBusLaneResearchPackets([row]).packets[0]!;
      const groups = packet.what_is_known.target_groups;
      const matches = groups.flatMap((group) => group.feature_matches);
      const urls = [...new Set(attempts.flatMap((attempt) => attempt.urls_checked))].sort();
      const target = {
        directions: [...new Set(matches.map((match) => match.direction))].sort(),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
        feature_row_count: matches.length,
        feature_rows: matches.map((match) => ({
          feature_key: match.feature_key, feature_id: match.feature_id, direction: match.direction,
        })),
        geometry_scopes: [...new Set(groups.map((group) => group.geometry_scope))].sort(),
        lane_group_ids: groups.map((group) => group.lane_group_id),
        matched_date: date,
        named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
        open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
      };
      const rationale = crossShardContext
        ? `Pinned cross-shard official project evidence preserves an evidence-backed ${routeId} route, treatment, and Battery Place corridor context, but candidate-exact acquisition does not bind ${routeId} to all 16 candidate-date feature-row occurrences, the exact 2021-06-10 onset, or candidate-date traversal. The registry rows name no SBS route, the retained historical schedule dossier is unavailable, and the pinned candidate provenance does not identify the exact matched subset. Attribution and traversal remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`
        : supported
        ? `Completed candidate-exact acquisition searches preserve an evidence-backed ${routeId} route, treatment, and Battery Place corridor context, but do not bind ${routeId} to all 16 candidate-date feature-row occurrences, the exact 2021-06-10 onset, or candidate-date traversal. The registry rows name no SBS route, the retained historical schedule dossier is unavailable, and the pinned candidate provenance does not identify the exact matched subset. Attribution and traversal remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`
        : `Completed candidate-exact acquisition searches retained all 16 Battery Place candidate-date feature-row occurrences, 11 unique feature keys and feature IDs, the westbound direction, and the exact 2021-06-10 registry day, but found no authoritative statement binding ${routeId} to the candidate-date feature subset. The registry rows name no SBS route, the retained historical schedule dossier is unavailable, and the pinned candidate provenance does not identify candidate-date traversal. Attribution and traversal remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`;
      const receipt = {
        schema_version: 1,
        receipt_id: `binding-battery-${routeId.toLowerCase()}`,
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
        target,
        prior_receipt: {
          receipt_id: receiptId,
          artifact: priorArtifact,
          row_sha256: row.prior_acquisition_receipt.row_sha256,
        },
        ...(crossShardContext ? { context_receipt: {
          receipt_id: contextPrior.receipt_id,
          artifact: contextArtifact,
          row_sha256: createHash("sha256").update(contextLine).digest("hex"),
        } } : {}),
        rationale,
        search: {
          exact_queries: attempts.map(({ category, query, query_status }) => ({ category, query, query_status })),
          domains: [...new Set(urls.map((url) => new URL(url).hostname))].sort(),
          urls_inspected: urls,
          retrievals: attempts.flatMap((attempt) => attempt.retrievals.map((retrieval) =>
            ({ category: attempt.category, ...retrieval }))),
          disposition: "binding_absent_after_search",
        },
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      const validate = (draft: Record<string, unknown>, candidateRow = row, candidatePacket = packet) => {
        writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
        return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
      };
      const packetWithDossier = (dossierRefs: typeof packet.what_is_known.dossier_refs) => ({
        ...packet,
        what_is_known: {
          ...packet.what_is_known,
          dossier_refs: dossierRefs,
          dossier_summary: {
            row_count: dossierRefs.length,
            target_row_count: dossierRefs.filter((ref) => ref.candidate_target_match).length,
            counts_by_verdict: {
              traversal_confirmed: dossierRefs.filter((ref) => ref.verdict_class === "traversal_confirmed").length,
              traversal_marginal: dossierRefs.filter((ref) => ref.verdict_class === "traversal_marginal").length,
              no_traversal: dossierRefs.filter((ref) => ref.verdict_class === "no_traversal").length,
              geometry_ambiguous: dossierRefs.filter((ref) => ref.verdict_class === "geometry_ambiguous").length,
            },
            counts_by_reason: Object.fromEntries([...new Set(dossierRefs.map((ref) => ref.reason))].sort()
              .map((reason) => [reason, dossierRefs.filter((ref) => ref.reason === reason).length])),
            counts_by_path_source: {
              gtfs_shape: dossierRefs.filter((ref) => ref.path_source === "gtfs_shape").length,
              historical_schedule_timepoint_pattern:
                dossierRefs.filter((ref) => ref.path_source === "historical_schedule_timepoint_pattern").length,
              unavailable: dossierRefs.filter((ref) => ref.path_source === "unavailable").length,
            },
          },
        },
      });
      try {
        expect(packet.missing_binding).toBe("traversal");
        expect(packet.unresolved_bindings).toEqual(["attribution", "traversal"]);
        expect(target).toMatchObject({
          feature_row_count: 16,
          directions: ["WB"],
          named_sbs_routes: [],
          open_dates_literals: ["06/10/2021"],
        });
        expect(target.feature_keys).toHaveLength(11);
        expect(target.feature_ids).toHaveLength(11);
        expect(validate(receipt)).not.toThrow();
        expect(validate({ ...receipt, rationale: `${rationale} Traversal refuted.` }))
          .toThrow("Battery Place absence contract does not match the exact candidate");
        expect(validate({ ...receipt, target: { ...target, feature_row_count: 15 } }))
          .toThrow("binding receipt feature-row accounting parity failed");
        expect(validate({ ...receipt, supplemental_search: {} }))
          .toThrow("Battery Place absence contract does not match the exact candidate");
        expect(validate({ ...receipt,
          occurrence_context: { occurrence_id: "occurrence_fake", accepted_decision_id: "decision_fake" } }))
          .toThrow("occurrence context is not bound to an accepted occurrence decision");
        if (crossShardContext) {
          expect(validate({ ...receipt, context_receipt: {
            ...receipt.context_receipt,
            row_sha256: "0".repeat(64),
          } })).toThrow();
          const coordinatedTamper = {
            ...contextPrior,
            claim_results: {
              ...contextPrior.claim_results,
              operational_occurrence_identity_proved: true,
            },
            outcome: { ...contextPrior.outcome, study_projection_eligible: true },
          };
          const coordinatedTamperLine = stableJson(coordinatedTamper as unknown as JsonValue);
          writeFileSync(join(rootDir, contextArtifact), `${coordinatedTamperLine}\n`);
          expect(validate({ ...receipt, context_receipt: {
            ...receipt.context_receipt,
            row_sha256: createHash("sha256").update(coordinatedTamperLine).digest("hex"),
          } })).toThrow("Battery Place absence contract does not match the exact candidate");
          writeFileSync(join(rootDir, contextArtifact), `${contextLine}\n`);
        }
        expect(validate({ ...receipt, authorizes_study: true }))
          .toThrow("binding receipt search preservation or authorization guard failed");
        const gtfsNoTraversalRefs = packet.what_is_known.dossier_refs.map((ref) => ({
          ...ref,
          path_source: "gtfs_shape" as const,
          verdict_class: "no_traversal" as const,
        }));
        const gtfsNoTraversalPacket = packetWithDossier(gtfsNoTraversalRefs);
        expect(validate(receipt, row, gtfsNoTraversalPacket))
          .toThrow("Battery Place packet dossier does not preserve exact ledger evidence parity");
        expect(validate(receipt, { ...row, dossier_refs: gtfsNoTraversalRefs }, gtfsNoTraversalPacket))
          .toThrow("Battery Place absence contract does not match the exact candidate");
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    }
  });

  it("closes Archer/Jamaica only with corrected ordered two-group nonauthorizing targets", () => {
    const repoRoot = join(import.meta.dir, "../../../..");
    const packetPath = join(repoRoot,
      "data/quality/acquisition/packets/bus-lane/packets/150b4ac6b440ebc511b5c83f.json");
    const ledgerPath = join(repoRoot, "data/quality/operational-reference/bus-lane-identity-ledger.jsonl");
    const priorArtifact =
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/queens/receipts.jsonl";
    const priorReceiptId = "queens-acquisition:aa191b2e97cfc50662d1d46a";
    const priorJournalPath = join(repoRoot, priorArtifact);
    const row = readFileSync(ledgerPath, "utf8").split(/\r?\n/u).filter(Boolean)
      .map((line) => JSON.parse(line) as BusLaneIdentityRow)
      .find((candidateRow) => candidateRow.candidate_id === "study-event-v2:42a27ad7049ad2db9beea833")!;
    const packet = JSON.parse(readFileSync(packetPath, "utf8")) as BusLaneResearchPacket;
    const priorLine = readFileSync(priorJournalPath, "utf8").split(/\r?\n/u).filter(Boolean)
      .find((line) => (JSON.parse(line) as { receipt_id?: string }).receipt_id === priorReceiptId)!;
    type PriorAttempt = {
      category: string;
      query: string;
      query_status: string;
      urls_checked: string[];
      retrievals: { id: string; retrieved_on: string; sha256: string; status: string }[];
    };
    const prior = JSON.parse(priorLine) as {
      researched_on: string;
      acquisition_attempts: PriorAttempt[];
      claim_results: Record<string, unknown>;
    };
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-archer-jamaica-"));
    const receiptDir = join(rootDir, "receipts");
    const tempPriorPath = join(rootDir, priorArtifact);
    const sourceRoot = join(rootDir, "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22");
    const acquiredChecksPath = join(rootDir,
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/queens/acquired-source-checks.json");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(join(rootDir, priorArtifact, ".."), { recursive: true });
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(join(acquiredChecksPath, ".."), { recursive: true });
    writeFileSync(tempPriorPath, `${priorLine}\n`);
    copyFileSync(join(repoRoot,
      "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22/metadata.json"),
    join(sourceRoot, "metadata.json"));
    copyFileSync(join(repoRoot,
      "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22/source.geojson"),
    join(sourceRoot, "source.geojson"));
    writeFileSync(acquiredChecksPath, JSON.stringify({ sources: [{
      id: "jamaica_archer_start_press",
      url: "https://www.nyc.gov/html/dot/html/pr2021/pr21-035.shtml",
      content_sha256: "02cedeec3dda3e9dd29a068af770b8d7bdd032423dceff8a0977971e24a44781",
      retrieval_status: "acquired",
      note: "NYC DOT identifies the Jamaica and Archer busway extents and installation timing but not an exhaustive route list.",
    }] }));
    const groupAccounting = (candidatePacket: BusLaneResearchPacket, candidateRow: BusLaneIdentityRow) =>
      candidatePacket.what_is_known.target_groups.map((group) => ({
        lane_group_id: group.lane_group_id,
        geometry_scope: group.geometry_scope,
        feature_row_count: group.feature_matches.length,
        feature_key_count: new Set(group.feature_matches.map((match) => match.feature_key)).size,
        feature_id_count: new Set(group.feature_matches.map((match) => match.feature_id)).size,
        directions: [...new Set(group.feature_matches.map((match) => match.direction))].sort(),
        matched_dates: [...new Set(group.feature_matches.map((match) => match.matched_date))].sort(),
        matched_token_literals:
          [...new Set(group.feature_matches.map((match) => match.matched_token_literal))].sort(),
        open_dates_literals: [...new Set(group.feature_matches.map((match) => match.open_dates_literal))].sort(),
        named_sbs_routes: [...new Set(group.feature_matches.flatMap((match) => match.sbs_routes))].sort(),
        candidate_route_named_feature_rows: group.feature_matches.flatMap((match) =>
          match.sbs_routes.includes(candidateRow.gtfs_route_id)
            ? [{ feature_key: match.feature_key, feature_id: match.feature_id, direction: match.direction }]
            : []),
        feature_rows: group.feature_matches.map((match) => ({
          feature_key: match.feature_key,
          feature_id: match.feature_id,
          direction: match.direction,
          matched_date: match.matched_date,
          matched_token_literal: match.matched_token_literal,
          open_dates_literal: match.open_dates_literal,
          sbs_routes: match.sbs_routes,
        })),
      }));
    const targetFor = (candidatePacket: BusLaneResearchPacket, candidateRow: BusLaneIdentityRow) => {
      const groups = candidatePacket.what_is_known.target_groups;
      const matches = groups.flatMap((group) => group.feature_matches);
      return {
        directions: [...new Set(matches.map((match) => match.direction))].sort(),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
        feature_row_count: matches.length,
        feature_rows: matches.map((match) => ({
          feature_key: match.feature_key, feature_id: match.feature_id, direction: match.direction,
        })),
        geometry_scopes: [...new Set(groups.map((group) => group.geometry_scope))].sort(),
        lane_group_ids: groups.map((group) => group.lane_group_id),
        matched_date: candidateRow.implementation_date,
        named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
        open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
        lane_groups: groupAccounting(candidatePacket, candidateRow),
      };
    };
    const correctionFor = (candidatePacket: BusLaneResearchPacket, candidateRow: BusLaneIdentityRow) => ({
      correction_kind: "prior_jamaica_only_accounting_superseded_by_current_two_group_target",
      prior_claim_path: "source_findings.official_lane_matching_record_count",
      prior_claim_value: 31,
      supersedes_prior_finding: true,
      corrected_finding: {
        finding_summary: "The prior 31-row finding accounts only for Jamaica Avenue and is not exhaustive of the current target, which adds the separate seven-row Archer Avenue exact-date group.",
        prior_accounted_lane_group_ids: ["QNS|JAMAICA AVENUE"],
        prior_feature_row_count: 31,
        current_lane_group_ids: ["QNS|ARCHER AVENUE", "QNS|JAMAICA AVENUE"],
        current_feature_row_count: 38,
        added_lane_group_id: "QNS|ARCHER AVENUE",
        added_feature_row_count: 7,
        current_target_groups_sha256: createHash("sha256")
          .update(stableJson(candidateRow.onset_evidence.target_groups)).digest("hex"),
      },
      evidence: {
        candidate_fingerprint: candidateRow.candidate_fingerprint,
        ledger_id: candidateRow.ledger_id,
        packet_id: candidatePacket.packet_id,
        lane_snapshot_id: candidateRow.onset_evidence.lane_snapshot_id,
        source_id: "nyc_dot_bus_lanes_local_streets_2026_07_22",
        source_artifact: "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22/source.geojson",
        source_sha256: "e09e001191c53799936884f4e8311873a03bf9ff4f38e1f0b86af4ba465b6ef5",
      },
      remaining_unresolved_bindings: ["attribution", "direction", "feature_extent", "phase", "traversal"],
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    const projectContext = {
      finding_kind: "paired_corridor_extent_and_launch_context_nonterminal",
      source_id: "jamaica_archer_start_press",
      source_url: "https://www.nyc.gov/html/dot/html/pr2021/pr21-035.shtml",
      source_content_sha256: "02cedeec3dda3e9dd29a068af770b8d7bdd032423dceff8a0977971e24a44781",
      supported_lane_group_ids: ["QNS|ARCHER AVENUE", "QNS|JAMAICA AVENUE"],
      supported_launch_date: "2021-10-24",
      route_inventory_exhaustive: false,
      candidate_route_bound: false,
      registry_named_sbs_routes: ["Q25", "Q44"],
      candidate_route_named_sbs_intersection: [],
      authorizes_study: false,
      authorizes_cross_product: false,
    };
    const rationale = "The immutable Queens acquisition search preserved a 31-row Jamaica Avenue-only accounting and found no authoritative exact Q86 route-treatment binding. Current deterministic target reconstruction corrects that accounting to the exact paired 38-row target: seven ordered eastbound Archer Avenue rows (seven keys and IDs, mixed-date feature union) and 31 ordered Jamaica Avenue rows (31 keys, 21 IDs, eastbound and westbound, coextensive lane group), all on 2021-10-24. The acquired NYC DOT launch source supports the paired corridor extents and launch timing but explicitly does not provide an exhaustive route list. Registry SBS fields name Q25/Q44 on Archer Avenue and Q44 on Jamaica Avenue; none names Q86. The historical schedule dossier is unavailable. Attribution, direction, feature extent, phase, and traversal remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.";
    const urls = [...new Set(prior.acquisition_attempts.flatMap((attempt) => attempt.urls_checked))].sort();
    const receiptFor = (candidateRow: BusLaneIdentityRow, candidatePacket: BusLaneResearchPacket) => ({
      schema_version: 1,
      receipt_id: "binding-archer-jamaica-q86",
      receipt_kind: "binding_absent_after_search",
      candidate_id: candidateRow.candidate_id,
      candidate_fingerprint: candidateRow.candidate_fingerprint,
      gtfs_route_id: candidateRow.gtfs_route_id,
      implementation_date: candidateRow.implementation_date,
      gap_ids: [candidateRow.ledger_id],
      searched_at: prior.researched_on,
      operator: "fixture-reviewer",
      candidate_urls: [],
      disposition: "binding_absent_after_search",
      missing_binding: candidatePacket.missing_binding,
      unresolved_bindings: candidatePacket.unresolved_bindings,
      target: targetFor(candidatePacket, candidateRow),
      prior_receipt: candidatePacket.what_is_known.prior_acquisition_receipt,
      finding_corrections: [correctionFor(candidatePacket, candidateRow)],
      project_context: projectContext,
      rationale,
      search: {
        exact_queries: prior.acquisition_attempts.map(({ category, query, query_status }) =>
          ({ category, query, query_status })),
        domains: [...new Set(urls.map((url) => new URL(url).hostname))].sort(),
        urls_inspected: urls,
        retrievals: prior.acquisition_attempts.flatMap((attempt) => attempt.retrievals.map((retrieval) =>
          ({ category: attempt.category, ...retrieval }))),
        disposition: "binding_absent_after_search",
      },
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    const validate = (
      draft: Record<string, unknown>,
      candidateRow: BusLaneIdentityRow = row,
      candidatePacket: BusLaneResearchPacket = packet,
    ) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
      return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
    };
    const withGroups = (groups: BusLaneResearchPacket["what_is_known"]["target_groups"]) => {
      const candidateRow = { ...row, onset_evidence: { ...row.onset_evidence, target_groups: groups } };
      const candidatePacket = {
        ...packet,
        what_is_known: { ...packet.what_is_known, target_groups: groups },
      };
      return { candidateRow, candidatePacket, receipt: receiptFor(candidateRow, candidatePacket) };
    };
    try {
      const receipt = receiptFor(row, packet);
      expect(receipt.target).toMatchObject({
        lane_group_ids: ["QNS|ARCHER AVENUE", "QNS|JAMAICA AVENUE"],
        feature_row_count: 38,
        directions: ["EB", "WB"],
        named_sbs_routes: ["Q25", "Q44"],
      });
      expect(receipt.target.feature_keys).toHaveLength(38);
      expect(receipt.target.feature_ids).toHaveLength(28);
      expect(receipt.target.lane_groups.map((group) => [
        group.lane_group_id, group.feature_row_count, group.feature_key_count, group.feature_id_count,
        group.candidate_route_named_feature_rows.length,
      ])).toEqual([
        ["QNS|ARCHER AVENUE", 7, 7, 7, 0],
        ["QNS|JAMAICA AVENUE", 31, 31, 21, 0],
      ]);
      expect(validate(receipt)).not.toThrow();
      expect(validate({ ...receipt, finding_corrections: [] }))
        .toThrow("Archer/Jamaica absence contract does not match the exact candidate");
      expect(validate({ ...receipt, project_context: { ...projectContext, candidate_route_bound: true } }))
        .toThrow("Archer/Jamaica absence contract does not match the exact candidate");
      expect(validate({ ...receipt, target: { ...receipt.target,
        lane_groups: [...receipt.target.lane_groups].reverse() } }))
        .toThrow("Archer/Jamaica absence contract does not match the exact candidate");

      const swapped = withGroups([
        packet.what_is_known.target_groups[1]!, packet.what_is_known.target_groups[0]!,
      ]);
      expect(validate(swapped.receipt, swapped.candidateRow, swapped.candidatePacket))
        .toThrow("Archer/Jamaica absence contract does not match the exact candidate");
      const removed = withGroups([packet.what_is_known.target_groups[1]!]);
      expect(validate(removed.receipt, removed.candidateRow, removed.candidatePacket))
        .toThrow("Archer/Jamaica absence contract does not match the exact candidate");
      const reorderedArcher = {
        ...packet.what_is_known.target_groups[0]!,
        feature_matches: [
          packet.what_is_known.target_groups[0]!.feature_matches[1]!,
          packet.what_is_known.target_groups[0]!.feature_matches[0]!,
          ...packet.what_is_known.target_groups[0]!.feature_matches.slice(2),
        ],
      };
      const reordered = withGroups([reorderedArcher, packet.what_is_known.target_groups[1]!]);
      expect(validate(reordered.receipt, reordered.candidateRow, reordered.candidatePacket))
        .toThrow("Archer/Jamaica absence contract does not match the exact candidate");
      const retokenedArcher = {
        ...packet.what_is_known.target_groups[0]!,
        feature_matches: packet.what_is_known.target_groups[0]!.feature_matches.map((match, index) =>
          index === 0 ? { ...match, matched_token_literal: "10/25/2021" } : match),
      };
      const retokened = withGroups([retokenedArcher, packet.what_is_known.target_groups[1]!]);
      expect(validate(retokened.receipt, retokened.candidateRow, retokened.candidatePacket))
        .toThrow("Archer/Jamaica absence contract does not match the exact candidate");
      const injectedArcher = {
        ...packet.what_is_known.target_groups[0]!,
        feature_matches: packet.what_is_known.target_groups[0]!.feature_matches.map((match, index) =>
          index === 0 ? { ...match, sbs_routes: [...match.sbs_routes, "Q86"] } : match),
      };
      const injected = withGroups([injectedArcher, packet.what_is_known.target_groups[1]!]);
      expect(validate(injected.receipt, injected.candidateRow, injected.candidatePacket))
        .toThrow("Archer/Jamaica absence contract does not match the exact candidate");

      const noTraversalRefs = packet.what_is_known.dossier_refs.map((ref) => ({
        ...ref, path_source: "gtfs_shape" as const, verdict_class: "no_traversal" as const,
      }));
      const dossierRow = { ...row, dossier_refs: noTraversalRefs };
      const dossierPacket = {
        ...packet,
        what_is_known: {
          ...packet.what_is_known,
          dossier_refs: noTraversalRefs,
          dossier_summary: {
            counts_by_path_source: { gtfs_shape: 1, historical_schedule_timepoint_pattern: 0, unavailable: 0 },
            counts_by_reason: { historical_schedule_unavailable_pre_2023: 1 },
            counts_by_verdict: {
              geometry_ambiguous: 0, no_traversal: 1, traversal_confirmed: 0, traversal_marginal: 0,
            },
            row_count: 1,
            target_row_count: 0,
          },
        },
      };
      expect(validate(receiptFor(dossierRow, dossierPacket), dossierRow, dossierPacket))
        .toThrow("Archer/Jamaica absence contract does not match the exact candidate");

      const tamperedPrior = {
        ...prior,
        claim_results: { ...prior.claim_results, operational_occurrence_identity_proved: true },
      };
      const tamperedPriorLine = stableJson(tamperedPrior as unknown as JsonValue);
      const tamperedPriorSha = createHash("sha256").update(tamperedPriorLine).digest("hex");
      writeFileSync(tempPriorPath, `${tamperedPriorLine}\n`);
      const tamperedPointer = { ...row.prior_acquisition_receipt, row_sha256: tamperedPriorSha };
      const tamperedRow = { ...row, prior_acquisition_receipt: tamperedPointer };
      const tamperedPacket = { ...packet, what_is_known: {
        ...packet.what_is_known, prior_acquisition_receipt: tamperedPointer,
      } };
      expect(validate(receiptFor(tamperedRow, tamperedPacket), tamperedRow, tamperedPacket))
        .toThrow("Archer/Jamaica absence contract does not match the exact candidate");
      writeFileSync(tempPriorPath, `${priorLine}\n`);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("closes University Avenue only with exact route, target, dossier, variant, and context guards", () => {
    const repoRoot = join(import.meta.dir, "../../../..");
    const batch = JSON.parse(readFileSync(join(repoRoot,
      "data/quality/acquisition/packets/bus-lane/batches/bus-lane-bx-university-avenue-2023-12-01-part-01.json"),
    "utf8")) as { packet_paths: string[] };
    const packets = batch.packet_paths.map((path) => JSON.parse(readFileSync(join(repoRoot,
      "data/quality/acquisition/packets/bus-lane", path), "utf8")) as BusLaneResearchPacket);
    const candidateIds = new Set(packets.map((packet) => packet.candidate_id));
    const rows = readFileSync(join(repoRoot,
      "data/quality/operational-reference/bus-lane-identity-ledger.jsonl"), "utf8")
      .split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as BusLaneIdentityRow)
      .filter((row) => candidateIds.has(row.candidate_id));
    const rowByRoute = new Map(rows.map((row) => [row.gtfs_route_id, row]));
    const packetByRoute = new Map(packets.map((packet) => [packet.gtfs_route_id, packet]));
    const priorArtifact =
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/receipts.jsonl";
    const priorLines = readFileSync(join(repoRoot, priorArtifact), "utf8").split(/\r?\n/u).filter(Boolean);
    const priorLineById = new Map(priorLines.map((line) => {
      const parsed = JSON.parse(line) as { receipt_id: string };
      return [parsed.receipt_id, line];
    }));
    const selectedPriorLines = rows.map((row) => priorLineById.get(
      row.prior_acquisition_receipt!.receipt_id)!).filter(Boolean);
    const priorByRoute = new Map(rows.map((row) => [row.gtfs_route_id,
      JSON.parse(priorLineById.get(row.prior_acquisition_receipt!.receipt_id)!) as {
        researched_on: string;
        acquisition_attempts: {
          category: string;
          query: string;
          query_status: string;
          urls_checked: string[];
          retrievals: { id: string; retrieved_on: string; sha256: string; status: string }[];
        }[];
      }]));
    const contextSources = {
      bronx_cb5_priority_2019: {
        url: "https://www.nyc.gov/html/brt/downloads/pdf/bx-cb5-projects-dec032019.pdf",
        content_sha256: "0e43255dc5a37106de9c7805e7eb1db80289141bb3937870a3d31264fcb552bc",
        retrieval_status: "acquired",
        note: "Official Bronx CB5 presentation names Bx3/Bx36 on University Avenue and Bx3/Bx11/Bx13/Bx35/Bx36 on the proposed Washington Bridge bus lanes.",
      },
      pelham_parkway_completion: {
        url: "https://www.nyc.gov/site/ddc/about/press-releases/2023/pr-122723-Pelham.page",
        content_sha256: "9a0811b58f4755a8638e8cb3e1bf5531e488f5fc05ef157ef16d7fee1246943e",
        retrieval_status: "acquired",
        note: "NYC DDC/DOT/DEP release documents final Pelham Parkway reconstruction completion and 1.7 miles of bus lanes.",
      },
    };
    const supportedSourceByRoute = new Map([
      ["BX3", "bronx_cb5_priority_2019"],
      ["BX36", "bronx_cb5_priority_2019"],
      ["BX12+", "pelham_parkway_completion"],
    ]);
    const attributionGapRoutes = new Set(["BX12", "BX12+", "BX22", "BX36", "BX40", "BX42", "BX9"]);
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-university-avenue-"));
    const receiptDir = join(rootDir, "receipts");
    const tempPriorPath = join(rootDir, priorArtifact);
    const sourceRoot = join(rootDir, "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22");
    const acquiredChecksPath = join(rootDir,
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquired-source-checks.json");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(join(tempPriorPath, ".."), { recursive: true });
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(join(acquiredChecksPath, ".."), { recursive: true });
    writeFileSync(tempPriorPath, `${selectedPriorLines.join("\n")}\n`);
    copyFileSync(join(repoRoot,
      "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22/metadata.json"),
    join(sourceRoot, "metadata.json"));
    copyFileSync(join(repoRoot,
      "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22/source.geojson"),
    join(sourceRoot, "source.geojson"));
    const writeAcquiredChecks = (sources: Record<string, unknown>[] = Object.entries(contextSources)
      .map(([id, source]) => ({ id, ...source }))) => {
      writeFileSync(acquiredChecksPath, JSON.stringify({ sources }));
    };
    writeAcquiredChecks();
    const targetFor = (packet: BusLaneResearchPacket, row: BusLaneIdentityRow) => {
      const groups = packet.what_is_known.target_groups;
      const matches = groups.flatMap((group) => group.feature_matches);
      return {
        directions: [...new Set(matches.map((match) => match.direction))].sort(),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
        feature_row_count: matches.length,
        feature_rows: matches.map((match) => ({
          feature_key: match.feature_key, feature_id: match.feature_id, direction: match.direction,
        })),
        geometry_scopes: [...new Set(groups.map((group) => group.geometry_scope))].sort(),
        lane_group_ids: groups.map((group) => group.lane_group_id),
        matched_date: row.implementation_date,
        named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
        open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
      };
    };
    const projectContextFor = (routeId: string) => {
      const variantMismatch = routeId === "BX12";
      const sourceId = supportedSourceByRoute.get(routeId) ??
        (variantMismatch ? "pelham_parkway_completion" : null);
      if (!sourceId) return undefined;
      const source = contextSources[sourceId as keyof typeof contextSources];
      return {
        finding_kind: variantMismatch
          ? "distinct_route_variant_context_nonterminal"
          : "official_route_treatment_context_nonterminal",
        source_id: sourceId,
        source_url: source.url,
        source_content_sha256: source.content_sha256,
        supported_route_ids: sourceId === "bronx_cb5_priority_2019" ? ["BX3", "BX36"] : ["BX12+"],
        supported_corridor: sourceId === "bronx_cb5_priority_2019" ? "University Avenue" : "Pelham Parkway",
        candidate_route_id: routeId,
        candidate_route_treatment_context: !variantMismatch,
        exact_current_target_bound: false,
        candidate_date_or_phase_bound: false,
        traversal_bound: false,
        route_variant_limitation: variantMismatch
          ? "The official Pelham Parkway source names BX12 Select Bus Service (BX12+); it does not prove that the distinct BX12 local route used the treatment."
          : null,
        authorizes_study: false,
        authorizes_cross_product: false,
      };
    };
    const rationaleFor = (row: BusLaneIdentityRow, packet: BusLaneResearchPacket) => {
      const routeId = row.gtfs_route_id;
      const prefix = supportedSourceByRoute.get(routeId) === "bronx_cb5_priority_2019"
        ? `The immutable Bronx acquisition search acquired official route-treatment context naming BX3/BX36 on University Avenue, but it does not bind ${routeId} to the exact current target.`
        : supportedSourceByRoute.get(routeId) === "pelham_parkway_completion"
          ? "The immutable Bronx acquisition search acquired official Pelham Parkway route-treatment context naming BX12+, but it does not bind BX12+ to the exact current University Avenue target."
          : routeId === "BX12"
            ? "The immutable Bronx acquisition correctly preserves that the official Pelham Parkway source names BX12 Select Bus Service (BX12+), not the distinct BX12 local route; route-family normalization cannot transfer that context to BX12."
            : `The immutable Bronx acquisition search found no authoritative exact ${routeId} route-treatment binding to the current University Avenue target.`;
      const targetCount = packet.what_is_known.dossier_refs.filter((ref) => ref.candidate_target_match).length;
      const unresolvedSentence = attributionGapRoutes.has(routeId)
        ? "Attribution, direction, feature extent, phase, and traversal remain unresolved."
        : "Direction, feature extent, phase, and traversal remain unresolved.";
      return `${prefix} The target is the ordered 35-row, 35-key, 19-ID mixed-date feature union on University Avenue in both northbound and southbound directions, with exact registry date 2023-12-01 and no named SBS route. The historical schedule timepoint dossier remains geometry-ambiguous (${packet.what_is_known.dossier_refs.length} rows, ${targetCount} target-tagged) and cannot prove traversal. ${unresolvedSentence} This is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`;
    };
    const receiptFor = (row: BusLaneIdentityRow, packet: BusLaneResearchPacket) => {
      const prior = priorByRoute.get(row.gtfs_route_id)!;
      const urls = [...new Set(prior.acquisition_attempts.flatMap((attempt) => attempt.urls_checked))].sort();
      const projectContext = projectContextFor(row.gtfs_route_id);
      return {
        schema_version: 1,
        receipt_id: `binding-university-${row.gtfs_route_id.toLowerCase()}`,
        receipt_kind: "binding_absent_after_search",
        candidate_id: row.candidate_id,
        candidate_fingerprint: row.candidate_fingerprint,
        gtfs_route_id: row.gtfs_route_id,
        implementation_date: row.implementation_date,
        gap_ids: [row.ledger_id],
        searched_at: prior.researched_on,
        operator: "fixture-reviewer",
        candidate_urls: [],
        disposition: "binding_absent_after_search",
        missing_binding: packet.missing_binding,
        unresolved_bindings: packet.unresolved_bindings,
        target: targetFor(packet, row),
        prior_receipt: packet.what_is_known.prior_acquisition_receipt,
        ...(projectContext ? { project_context: projectContext } : {}),
        rationale: rationaleFor(row, packet),
        search: {
          exact_queries: prior.acquisition_attempts.map(({ category, query, query_status }) =>
            ({ category, query, query_status })),
          domains: [...new Set(urls.map((url) => new URL(url).hostname))].sort(),
          urls_inspected: urls,
          retrievals: prior.acquisition_attempts.flatMap((attempt) => attempt.retrievals.map((retrieval) =>
            ({ category: attempt.category, ...retrieval }))),
          disposition: "binding_absent_after_search",
        },
        authorizes_study: false,
        authorizes_cross_product: false,
      };
    };
    const validate = (
      draft: Record<string, unknown>,
      row: BusLaneIdentityRow,
      packet: BusLaneResearchPacket,
    ) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
      return () => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir);
    };
    const withGroup = (
      baseRow: BusLaneIdentityRow,
      basePacket: BusLaneResearchPacket,
      group: BusLaneResearchPacket["what_is_known"]["target_groups"][number],
    ) => {
      const candidateRow = { ...baseRow, onset_evidence: { ...baseRow.onset_evidence, target_groups: [group] } };
      const candidatePacket = { ...basePacket, what_is_known: {
        ...basePacket.what_is_known, target_groups: [group],
      } };
      return { candidateRow, candidatePacket, receipt: receiptFor(candidateRow, candidatePacket) };
    };
    try {
      expect(rows).toHaveLength(11);
      for (const packet of packets) {
        const row = rowByRoute.get(packet.gtfs_route_id)!;
        const receipt = receiptFor(row, packet);
        expect(receipt.target).toMatchObject({
          lane_group_ids: ["BX|UNIVERSITY AVENUE"],
          feature_row_count: 35,
          directions: ["NB", "SB"],
          named_sbs_routes: [],
        });
        expect(receipt.target.feature_keys).toHaveLength(35);
        expect(receipt.target.feature_ids).toHaveLength(19);
        expect(validate(receipt, row, packet)).not.toThrow();
      }

      const bx3Row = rowByRoute.get("BX3")!;
      const bx3Packet = packetByRoute.get("BX3")!;
      const bx3Receipt = receiptFor(bx3Row, bx3Packet);
      expect(validate({ ...bx3Receipt, project_context: {
        ...bx3Receipt.project_context, exact_current_target_bound: true,
      } }, bx3Row, bx3Packet)).toThrow("University Avenue absence contract does not match the exact candidate");
      const originalGroup = bx3Packet.what_is_known.target_groups[0]!;
      const reordered = withGroup(bx3Row, bx3Packet, { ...originalGroup, feature_matches: [
        originalGroup.feature_matches[1]!, originalGroup.feature_matches[0]!,
        ...originalGroup.feature_matches.slice(2),
      ] });
      expect(validate(reordered.receipt, reordered.candidateRow, reordered.candidatePacket))
        .toThrow("University Avenue absence contract does not match the exact candidate");
      const removed = withGroup(bx3Row, bx3Packet, {
        ...originalGroup, feature_matches: originalGroup.feature_matches.slice(1),
      });
      expect(validate(removed.receipt, removed.candidateRow, removed.candidatePacket))
        .toThrow("University Avenue absence contract does not match the exact candidate");
      const retokened = withGroup(bx3Row, bx3Packet, { ...originalGroup,
        feature_matches: originalGroup.feature_matches.map((match, index) =>
          index === 0 ? { ...match, matched_token_literal: "12/2/2023" } : match),
      });
      expect(validate(retokened.receipt, retokened.candidateRow, retokened.candidatePacket))
        .toThrow("University Avenue absence contract does not match the exact candidate");
      const injectedSbs = withGroup(bx3Row, bx3Packet, { ...originalGroup,
        feature_matches: originalGroup.feature_matches.map((match, index) =>
          index === 0 ? { ...match, sbs_routes: ["BX3"] } : match),
      });
      expect(validate(injectedSbs.receipt, injectedSbs.candidateRow, injectedSbs.candidatePacket))
        .toThrow("University Avenue absence contract does not match the exact candidate");

      const dossierRefs = bx3Packet.what_is_known.dossier_refs.map((ref, index) =>
        index === 0 ? { ...ref, candidate_target_match: !ref.candidate_target_match } : ref);
      const dossierRow = { ...bx3Row, dossier_refs: dossierRefs };
      const dossierPacket = { ...bx3Packet, what_is_known: {
        ...bx3Packet.what_is_known,
        dossier_refs: dossierRefs,
        dossier_summary: { ...bx3Packet.what_is_known.dossier_summary,
          target_row_count: dossierRefs.filter((ref) => ref.candidate_target_match).length,
        },
      } };
      expect(validate(receiptFor(dossierRow, dossierPacket), dossierRow, dossierPacket))
        .toThrow("University Avenue absence contract does not match the exact candidate");

      const bx3Prior = priorByRoute.get("BX3")!;
      const bx3PriorLine = priorLineById.get(bx3Row.prior_acquisition_receipt!.receipt_id)!;
      const tamperedPrior = { ...bx3Prior, claim_results: {
        ...(bx3Prior as unknown as { claim_results: Record<string, unknown> }).claim_results,
        operational_occurrence_identity_proved: true,
      } };
      const tamperedPriorLine = stableJson(tamperedPrior as unknown as JsonValue);
      const tamperedPriorSha = createHash("sha256").update(tamperedPriorLine).digest("hex");
      const tamperedJournal = selectedPriorLines.map((line) => line === bx3PriorLine ? tamperedPriorLine : line);
      writeFileSync(tempPriorPath, `${tamperedJournal.join("\n")}\n`);
      const tamperedPointer = { ...bx3Row.prior_acquisition_receipt!, row_sha256: tamperedPriorSha };
      const tamperedRow = { ...bx3Row, prior_acquisition_receipt: tamperedPointer };
      const tamperedPacket = { ...bx3Packet, what_is_known: {
        ...bx3Packet.what_is_known, prior_acquisition_receipt: tamperedPointer,
      } };
      expect(validate(receiptFor(tamperedRow, tamperedPacket), tamperedRow, tamperedPacket))
        .toThrow("University Avenue absence contract does not match the exact candidate");
      writeFileSync(tempPriorPath, `${selectedPriorLines.join("\n")}\n`);

      const bx12Row = rowByRoute.get("BX12")!;
      const bx12Packet = packetByRoute.get("BX12")!;
      const bx12Receipt = receiptFor(bx12Row, bx12Packet);
      expect(validate({ ...bx12Receipt, project_context: {
        ...bx12Receipt.project_context, candidate_route_treatment_context: true,
      } }, bx12Row, bx12Packet)).toThrow("University Avenue absence contract does not match the exact candidate");
      expect(validate({ ...bx12Receipt, finding_corrections: [] }, bx12Row, bx12Packet))
        .toThrow("University Avenue absence contract does not match the exact candidate");

      writeFileSync(join(sourceRoot, "source.geojson"), "{}\n");
      expect(validate(bx3Receipt, bx3Row, bx3Packet))
        .toThrow("University Avenue absence contract does not match the exact candidate");
      copyFileSync(join(repoRoot,
        "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22/source.geojson"),
      join(sourceRoot, "source.geojson"));
      writeAcquiredChecks(Object.entries(contextSources).map(([id, source]) => ({
        id, ...source, note: `${source.note} Tampered.`,
      })));
      expect(validate(bx3Receipt, bx3Row, bx3Packet))
        .toThrow("University Avenue absence contract does not match the exact candidate");
      writeAcquiredChecks();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("closes Hylan Boulevard only with exact row multiset, route variants, corrections, and context guards", () => {
    const repoRoot = join(import.meta.dir, "../../../..");
    const batch = JSON.parse(readFileSync(join(repoRoot,
      "data/quality/acquisition/packets/bus-lane/batches/bus-lane-si-hylan-boulevard-2020-09-12-part-01.json"),
    "utf8")) as { packet_paths: string[] };
    const packets = batch.packet_paths.map((path) => JSON.parse(readFileSync(join(repoRoot,
      "data/quality/acquisition/packets/bus-lane", path), "utf8")) as BusLaneResearchPacket);
    const candidateIds = new Set(packets.map((packet) => packet.candidate_id));
    const rows = readFileSync(join(repoRoot,
      "data/quality/operational-reference/bus-lane-identity-ledger.jsonl"), "utf8")
      .split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as BusLaneIdentityRow)
      .filter((row) => candidateIds.has(row.candidate_id));
    const rowByRoute = new Map(rows.map((row) => [row.gtfs_route_id, row]));
    const packetByRoute = new Map(packets.map((packet) => [packet.gtfs_route_id, packet]));
    const receiptSuffixByRoute = new Map([
      ["S76", "16e0e60f8e880dc597230f7a"], ["S54", "c8862d0897cd8139b5dba145"],
      ["S51", "1bfb6a0873a9a5ef6820dbd3"], ["S57", "74271321ca59023588d6b781"],
      ["S86", "e9c2ea7af1339e9e4bb13a3b"], ["S79+", "a752f6f8238320181e5620eb"],
      ["S81", "bca279e86a4d58eb5c677788"], ["S78", "4cf493edf20b1d1aeb3a4873"],
      ["SIM9", "c09954b9260f7c2f6415aa18"], ["SIM7", "425c315d65b09fb2167aa15f"],
    ]);
    const receiptByRoute = new Map([...receiptSuffixByRoute].map(([routeId, suffix]) => [routeId,
      JSON.parse(readFileSync(join(repoRoot,
        `data/quality/acquisition/receipts/bus-lane-review/${suffix}.json`), "utf8")) as Record<string, any>,
    ]));
    const correctionRoutes = new Set(["S54", "S57", "S76", "S86"]);
    const supportedRoutes = new Set(["S57", "S78", "S79+", "SIM7", "SIM9"]);
    const priorArtifact =
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/receipts.jsonl";
    const priorLines = readFileSync(join(repoRoot, priorArtifact), "utf8").split(/\r?\n/u).filter(Boolean);
    const priorLineById = new Map(priorLines.map((line) => {
      const parsed = JSON.parse(line) as { receipt_id: string };
      return [parsed.receipt_id, line];
    }));
    const selectedPriorLines = rows.map((row) => priorLineById.get(
      row.prior_acquisition_receipt!.receipt_id)!).filter(Boolean);
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-hylan-boulevard-"));
    const receiptDir = join(rootDir, "receipts");
    const tempPriorPath = join(rootDir, priorArtifact);
    const sourceRoot = join(rootDir, "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22");
    const acquiredChecksPath = join(rootDir,
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/acquired-source-checks.json");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(join(tempPriorPath, ".."), { recursive: true });
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(join(acquiredChecksPath, ".."), { recursive: true });
    writeFileSync(tempPriorPath, `${selectedPriorLines.join("\n")}\n`);
    copyFileSync(join(repoRoot,
      "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22/metadata.json"),
    join(sourceRoot, "metadata.json"));
    copyFileSync(join(repoRoot,
      "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22/source.geojson"),
    join(sourceRoot, "source.geojson"));
    copyFileSync(join(repoRoot,
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/acquired-source-checks.json"),
    acquiredChecksPath);
    const targetFor = (packet: BusLaneResearchPacket, row: BusLaneIdentityRow) => {
      const groups = packet.what_is_known.target_groups;
      const matches = groups.flatMap((group) => group.feature_matches);
      return {
        directions: [...new Set(matches.map((match) => match.direction))].sort(),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
        feature_row_count: matches.length,
        feature_rows: matches.map((match) => ({
          feature_key: match.feature_key, feature_id: match.feature_id, direction: match.direction,
        })),
        geometry_scopes: [...new Set(groups.map((group) => group.geometry_scope))].sort(),
        lane_group_ids: groups.map((group) => group.lane_group_id),
        matched_date: row.implementation_date,
        named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
        open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
      };
    };
    const validate = (
      draft: Record<string, unknown>,
      row: BusLaneIdentityRow,
      packet: BusLaneResearchPacket,
    ) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
      return () => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir);
    };
    const withGroup = (
      routeId: string,
      group: BusLaneResearchPacket["what_is_known"]["target_groups"][number],
    ) => {
      const baseRow = rowByRoute.get(routeId)!;
      const basePacket = packetByRoute.get(routeId)!;
      const candidateRow = { ...baseRow, onset_evidence: { ...baseRow.onset_evidence, target_groups: [group] } };
      const candidatePacket = { ...basePacket, what_is_known: {
        ...basePacket.what_is_known, target_groups: [group],
      } };
      const receipt = { ...receiptByRoute.get(routeId)!, target: targetFor(candidatePacket, candidateRow) };
      return { candidateRow, candidatePacket, receipt };
    };
    try {
      expect(rows).toHaveLength(10);
      expect(receiptByRoute.size).toBe(10);
      expect([...receiptByRoute.values()].filter((receipt) => receipt.finding_corrections)).toHaveLength(4);
      expect([...receiptByRoute.values()].filter((receipt) =>
        receipt.project_context.candidate_route_inventory_match)).toHaveLength(5);
      for (const packet of packets) {
        const row = rowByRoute.get(packet.gtfs_route_id)!;
        const receipt = receiptByRoute.get(packet.gtfs_route_id)!;
        expect(receipt.target).toMatchObject({
          lane_group_ids: ["SI|HYLAN BOULEVARD"], feature_row_count: 95,
          directions: ["NB", "SB"], named_sbs_routes: ["S79"],
          open_dates_literals: ["9/12/20", "9/12/2020"],
        });
        expect(receipt.target.feature_keys).toHaveLength(93);
        expect(receipt.target.feature_ids).toHaveLength(93);
        expect(receipt.target.feature_rows).toHaveLength(95);
        expect(Boolean(receipt.finding_corrections)).toBe(correctionRoutes.has(row.gtfs_route_id));
        expect(receipt.project_context.candidate_route_inventory_match)
          .toBe(supportedRoutes.has(row.gtfs_route_id));
        expect(receipt.project_context.better_buses_context_only).toBe(true);
        expect(receipt.project_context.better_buses_candidate_route_binding_promoted).toBe(false);
        expect(validate(receipt, row, packet)).not.toThrow();
      }

      const routeId = "S76";
      const row = rowByRoute.get(routeId)!;
      const packet = packetByRoute.get(routeId)!;
      const receipt = receiptByRoute.get(routeId)!;
      const group = packet.what_is_known.target_groups[0]!;
      const reordered = withGroup(routeId, { ...group, feature_matches: [
        group.feature_matches[1]!, group.feature_matches[0]!, ...group.feature_matches.slice(2),
      ] });
      expect(validate(reordered.receipt, reordered.candidateRow, reordered.candidatePacket))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      const removed = withGroup(routeId, { ...group, feature_matches: group.feature_matches.slice(1) });
      expect(validate(removed.receipt, removed.candidateRow, removed.candidatePacket))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      const deduplicated = withGroup(routeId, { ...group, feature_matches: group.feature_matches.filter(
        (match, index) => match.feature_key !== "dot-lane-feature:ca472df22407614bd0b3418f" ||
          group.feature_matches.findIndex((candidate) => candidate.feature_key === match.feature_key) === index),
      });
      expect(validate(deduplicated.receipt, deduplicated.candidateRow, deduplicated.candidatePacket))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      const retokened = withGroup(routeId, { ...group, feature_matches: group.feature_matches.map((match) =>
        match.open_dates_literal === "9/12/20"
          ? { ...match, matched_token_literal: "9/12/2020", open_dates_literal: "9/12/2020" }
          : match),
      });
      expect(validate(retokened.receipt, retokened.candidateRow, retokened.candidatePacket))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      const namedUnnamedRow = withGroup(routeId, { ...group, feature_matches: group.feature_matches.map((match) =>
        match.feature_id === "0155447" ? { ...match, sbs_routes: ["S79"] } : match),
      });
      expect(validate(namedUnnamedRow.receipt, namedUnnamedRow.candidateRow, namedUnnamedRow.candidatePacket))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      const removedSbs = withGroup(routeId, { ...group, feature_matches: group.feature_matches.map((match, index) =>
        index === 0 ? { ...match, sbs_routes: [] } : match),
      });
      expect(validate(removedSbs.receipt, removedSbs.candidateRow, removedSbs.candidatePacket))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      const redirected = withGroup(routeId, { ...group, feature_matches: group.feature_matches.map((match, index) =>
        index === 0 ? { ...match, direction: "NB" } : match),
      });
      expect(validate(redirected.receipt, redirected.candidateRow, redirected.candidatePacket))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      const renamedGroup = withGroup(routeId, { ...group, facility: "Hylan Blvd" });
      expect(validate(renamedGroup.receipt, renamedGroup.candidateRow, renamedGroup.candidatePacket))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");

      const dossierRefs = packet.what_is_known.dossier_refs.map((ref) => ({
        ...ref, candidate_target_match: true,
      }));
      const dossierRow = { ...row, dossier_refs: dossierRefs };
      const dossierPacket = { ...packet, what_is_known: {
        ...packet.what_is_known, dossier_refs: dossierRefs,
        dossier_summary: { ...packet.what_is_known.dossier_summary, target_row_count: 1 },
      } };
      expect(validate(receipt, dossierRow, dossierPacket))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");

      expect(validate({ ...receipt, finding_corrections: undefined }, row, packet))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      const correction = receipt.finding_corrections[0];
      expect(validate({ ...receipt, finding_corrections: [{ ...correction, corrected_finding: {
        ...correction.corrected_finding, current_feature_row_count: 93,
      } }] }, row, packet)).toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      const s51Row = rowByRoute.get("S51")!;
      const s51Packet = packetByRoute.get("S51")!;
      const s51Receipt = receiptByRoute.get("S51")!;
      expect(validate({ ...s51Receipt, finding_corrections: [] }, s51Row, s51Packet))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      expect(validate({ ...receipt, project_context: {
        ...receipt.project_context, better_buses_context_only: false,
      } }, row, packet)).toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      expect(validate({ ...receipt, project_context: {
        ...receipt.project_context, better_buses_candidate_route_binding_promoted: true,
      } }, row, packet)).toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      expect(validate({ ...receipt, project_context: {
        ...receipt.project_context, exact_current_target_bound: true,
      } }, row, packet)).toThrow("Hylan Boulevard absence contract does not match the exact candidate");

      const s79Row = rowByRoute.get("S79+")!;
      const s79Packet = packetByRoute.get("S79+")!;
      const s79Receipt = receiptByRoute.get("S79+")!;
      expect(s79Receipt.project_context).toMatchObject({
        normalized_candidate_route_id: "S79",
        candidate_route_named_sbs_intersection: ["S79"],
      });
      expect(validate({ ...s79Receipt, project_context: {
        ...s79Receipt.project_context, normalized_candidate_route_id: "S79+",
      } }, s79Row, s79Packet)).toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      expect(validate({ ...s79Receipt, project_context: {
        ...s79Receipt.project_context, candidate_route_named_sbs_intersection: [],
      } }, s79Row, s79Packet)).toThrow("Hylan Boulevard absence contract does not match the exact candidate");

      const priorLine = priorLineById.get(row.prior_acquisition_receipt!.receipt_id)!;
      const prior = JSON.parse(priorLine) as Record<string, any>;
      const tamperedPriorLine = stableJson({ ...prior, source_findings: {
        ...prior.source_findings, official_lane_matching_record_count: 95,
      } } as JsonValue);
      const tamperedPriorSha = createHash("sha256").update(tamperedPriorLine).digest("hex");
      writeFileSync(tempPriorPath, `${selectedPriorLines.map((line) =>
        line === priorLine ? tamperedPriorLine : line).join("\n")}\n`);
      const tamperedPointer = { ...row.prior_acquisition_receipt!, row_sha256: tamperedPriorSha };
      const tamperedRow = { ...row, prior_acquisition_receipt: tamperedPointer };
      const tamperedPacket = { ...packet, what_is_known: {
        ...packet.what_is_known, prior_acquisition_receipt: tamperedPointer,
      } };
      expect(validate({ ...receipt, prior_receipt: tamperedPointer }, tamperedRow, tamperedPacket))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      writeFileSync(tempPriorPath, `${selectedPriorLines.join("\n")}\n`);

      writeFileSync(join(sourceRoot, "source.geojson"), "{}\n");
      expect(validate(receipt, row, packet))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");
      copyFileSync(join(repoRoot,
        "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22/source.geojson"),
      join(sourceRoot, "source.geojson"));
      const acquiredChecks = JSON.parse(readFileSync(acquiredChecksPath, "utf8")) as {
        sources: Record<string, unknown>[];
      };
      writeFileSync(acquiredChecksPath, JSON.stringify({ sources: acquiredChecks.sources.map((source) =>
        source.id === "hylan_completion" ? { ...source, note: `${String(source.note)} Tampered.` } : source),
      }));
      expect(validate(receipt, row, packet))
        .toThrow("Hylan Boulevard absence contract does not match the exact candidate");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("closes SIM23 and SIM24 only as zero-target nonrefutational absences", () => {
    const date = "2015-05-27";
    const priorReceiptIds = new Map([
      ["SIM23", "staten-island-acquisition:4f8c82427f9fa4ff9cb39112"],
      ["SIM24", "staten-island-acquisition:a5a0f4514158f16261378001"],
    ]);
    for (const routeId of ["SIM23", "SIM24"]) {
      const entry = candidate(`unattributed-${routeId.toLowerCase()}`, routeId, date);
      const [baseRow] = buildBusLaneIdentityLedger({
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
        laneFeatures: [],
        laneSnapshotId: "lanes",
        laneSourceId: "lane_source",
        gtfsServiceWindows: [{ start: "2026-04-01", end: "2026-06-30" }],
      });
      const rootDir = mkdtempSync(join(tmpdir(), `bus-lane-unattributed-${routeId.toLowerCase()}-`));
      const receiptDir = join(rootDir, "receipts");
      const priorArtifact =
        "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/receipts.jsonl";
      mkdirSync(receiptDir, { recursive: true });
      mkdirSync(join(rootDir,
        "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island"), { recursive: true });
      const attempts = [
        {
          category: "official_nyc_dot_lane_project",
          query: "site:nyc.gov 34th Street bus lane 2015 M34 M34A SIM23 SIM24",
          query_status: "performed_2026-07-15",
          urls_checked: ["https://www.nyc.gov/34th-street"],
          retrievals: [{ id: "dot-project", retrieved_on: "2026-07-15",
            sha256: "1".repeat(64), status: "acquired" }],
        },
        {
          category: "official_mta_route_project",
          query: `site:mta.info "${routeId}" "34th Street" bus route project`,
          query_status: "performed_2026-07-15",
          urls_checked: [`https://bustime-classic.mta.info/m/?q=${routeId}`],
          retrievals: [{ id: `mta-${routeId}`, retrieved_on: "2026-07-15",
            sha256: "2".repeat(64), status: "acquired" }],
        },
        {
          category: "official_public_board_committee",
          query: "site:nyc.gov 34th Street bus lane 2015 M34 M34A SIM23 SIM24 community board",
          query_status: "performed_2026-07-15",
          urls_checked: ["https://www.nyc.gov/34th-street-board"],
          retrievals: [{ id: "board", retrieved_on: "2026-07-15",
            sha256: "3".repeat(64), status: "acquired" }],
        },
        {
          category: "other_repository_approved_primary",
          query: "NYC DOT Open Data 34th Street open_dates contains 2015-05-27",
          query_status: "performed_2026-07-15",
          urls_checked: ["https://data.cityofnewyork.us/34th-street"],
          retrievals: [{ id: "open-data", retrieved_on: "2026-07-15",
            sha256: "4".repeat(64), status: "acquired" }],
        },
      ];
      const prior = {
        receipt_id: priorReceiptIds.get(routeId),
        researched_on: "2026-07-15",
        candidate: {
          candidate_id: entry.bridge.candidate_id,
          normalized_route_id: routeId,
          route_id: routeId,
          implementation_date: date,
          identity: `${routeId}|bus_lane|2015-05-27|day`,
        },
        source_findings: {
          exact_project_route_statement_found: false,
          candidate_named_lane_record_count: 0,
          broader_corridor_route_inventory_match: false,
          official_lane_named_routes: ["M34", "M34A"],
          official_route_named_segment_ids: [],
          mta_route_page: {
            exact_route_title_found: true,
            current_corridor_token_found: true,
            retrieval_status: "acquired",
            temporal_limitation: "The live route page is not historical candidate-date proof.",
          },
        },
        outcome: {
          exclusive_primary_disposition: "completed_search_route_linkage_unresolved",
          registry_projection_excluded: true,
          still_unresolved: true,
          study_projection_eligible: false,
        },
        claim_results: {
          candidate_segment_ids_pinned: false,
          date_and_phase_proved: false,
          exact_route_treatment_binding_proved: false,
          exact_segment_binding_proved: false,
          explicit_phase_identity_proved: false,
          operational_occurrence_identity_proved: false,
          exact_route_binding_evidence: [],
          exact_segment_ids: [],
        },
        canonical_actions: { canonical_links_added: [], operational_occurrence_added_or_updated: false },
        acquisition_attempts: attempts,
      };
      const priorLine = stableJson(prior as unknown as JsonValue);
      writeFileSync(join(rootDir, priorArtifact), `${priorLine}\n`);
      const row = { ...baseRow!, prior_acquisition_receipt: {
        receipt_id: prior.receipt_id!,
        artifact: priorArtifact,
        row_sha256: createHash("sha256").update(priorLine).digest("hex"),
        disposition: "completed_search_route_linkage_unresolved",
        next_action: "Retain exact zero-target absence.",
      } };
      const packet = buildBusLaneResearchPackets([row]).packets[0]!;
      const urls = [...new Set(attempts.flatMap((attempt) => attempt.urls_checked))].sort();
      const rationale = `Completed candidate-exact Staten Island acquisition searches found official 34th Street lane material, but it names M34/M34A rather than ${routeId} and does not preserve exact historical candidate segment identifiers or bind the route to an onset, stable phase, or candidate-date traversal. No exact target group can be constructed. Attribution, onset, phase, and traversal remain unresolved. This is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`;
      const receipt = {
        schema_version: 1,
        receipt_id: `binding-unattributed-${routeId.toLowerCase()}`,
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
        missing_binding: "attribution",
        unresolved_bindings: ["attribution", "onset", "phase", "traversal"],
        target: {
          directions: [], feature_ids: [], feature_keys: [], feature_row_count: 0, feature_rows: [],
          geometry_scopes: [], lane_group_ids: [], matched_date: date, named_sbs_routes: [],
          open_dates_literals: [],
        },
        prior_receipt: {
          receipt_id: prior.receipt_id,
          artifact: priorArtifact,
          row_sha256: row.prior_acquisition_receipt.row_sha256,
        },
        rationale,
        search: {
          exact_queries: attempts.map(({ category, query, query_status }) => ({ category, query, query_status })),
          domains: [...new Set(urls.map((url) => new URL(url).hostname))].sort(),
          urls_inspected: urls,
          retrievals: attempts.flatMap((attempt) => attempt.retrievals.map((retrieval) =>
            ({ category: attempt.category, ...retrieval }))),
          disposition: "binding_absent_after_search",
        },
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      const validate = (draft: Record<string, unknown>, candidateRow = row, candidatePacket = packet) => {
        writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
        return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
      };
      try {
        expect(packet.missing_binding).toBe("attribution");
        expect(packet.unresolved_bindings).toEqual(["attribution", "onset", "phase", "traversal"]);
        expect(packet.what_is_known.target_groups).toEqual([]);
        expect(validate(receipt)).not.toThrow();
        expect(validate({ ...receipt, rationale: `${rationale} Traversal refuted.` }))
          .toThrow("SIM23/SIM24 zero-target absence contract does not match the exact candidate");
        expect(validate({ ...receipt, target: { ...receipt.target, feature_row_count: 1 } }))
          .toThrow("binding receipt feature-row accounting parity failed");
        expect(validate({ ...receipt, supplemental_search: {} }))
          .toThrow("SIM23/SIM24 zero-target absence contract does not match the exact candidate");
        expect(validate({ ...receipt,
          occurrence_context: { occurrence_id: "occurrence_fake", accepted_decision_id: "decision_fake" } }))
          .toThrow("occurrence context is not bound to an accepted occurrence decision");
        expect(validate({ ...receipt, authorizes_study: true }))
          .toThrow("binding receipt search preservation or authorization guard failed");
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    }
  });

  it("closes East Gun Hill Road only with exact targets, dossiers, context, and an explicit missing-source gap", () => {
    const repoRoot = join(import.meta.dir, "../../../..");
    const packetRoot = join(repoRoot, "data/quality/acquisition/packets/bus-lane");
    const batch = JSON.parse(readFileSync(join(packetRoot,
      "batches/bus-lane-bx-east-gun-hill-road-2023-10-31-part-01.json"), "utf8")) as {
      packet_paths: string[];
    };
    const packets = batch.packet_paths.map((path) => JSON.parse(
      readFileSync(join(packetRoot, path), "utf8"),
    ) as BusLaneResearchPacket);
    const candidateIds = new Set(packets.map((packet) => packet.candidate_id));
    const rows = readFileSync(join(repoRoot,
      "data/quality/operational-reference/bus-lane-identity-ledger.jsonl"), "utf8")
      .split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as BusLaneIdentityRow)
      .filter((row) => candidateIds.has(row.candidate_id));
    const rowByRoute = new Map(rows.map((row) => [row.gtfs_route_id, row]));
    const packetByRoute = new Map(packets.map((packet) => [packet.gtfs_route_id, packet]));
    const receiptByRoute = new Map(rows.map((row) => {
      const packet = packetByRoute.get(row.gtfs_route_id)!;
      const expected = buildEastGunHillBindingReceiptDraft(row, packet);
      const suffix = String(expected.receipt_id).split(":")[1];
      return [row.gtfs_route_id, JSON.parse(readFileSync(join(repoRoot,
        `data/quality/acquisition/receipts/bus-lane-review/${suffix}.json`), "utf8")) as Record<string, any>];
    }));
    const priorArtifact =
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/receipts.jsonl";
    const priorLines = readFileSync(join(repoRoot, priorArtifact), "utf8").split(/\r?\n/u).filter(Boolean);
    const priorLineById = new Map(priorLines.map((line) => {
      const parsed = JSON.parse(line) as { receipt_id: string };
      return [parsed.receipt_id, line];
    }));
    const selectedPriorLines = rows.flatMap((row) => row.prior_acquisition_receipt
      ? [priorLineById.get(row.prior_acquisition_receipt.receipt_id)!]
      : []);
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-east-gun-hill-"));
    const receiptDir = join(rootDir, "receipts");
    const tempPriorPath = join(rootDir, priorArtifact);
    const currentSourceRoot = join(rootDir, "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22");
    const contextSourceRoot = join(rootDir, "raw/sources/meeting_doc_127471");
    const acquiredChecksPath = join(rootDir,
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquired-source-checks.json");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(join(tempPriorPath, ".."), { recursive: true });
    mkdirSync(currentSourceRoot, { recursive: true });
    mkdirSync(contextSourceRoot, { recursive: true });
    mkdirSync(join(acquiredChecksPath, ".."), { recursive: true });
    writeFileSync(tempPriorPath, `${selectedPriorLines.join("\n")}\n`);
    for (const file of ["metadata.json", "source.geojson"]) {
      copyFileSync(join(repoRoot, "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22", file),
        join(currentSourceRoot, file));
    }
    for (const file of ["metadata.json", "source.pdf", "blocks.jsonl"]) {
      copyFileSync(join(repoRoot, "raw/sources/meeting_doc_127471", file), join(contextSourceRoot, file));
    }
    copyFileSync(join(repoRoot,
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquired-source-checks.json"),
    acquiredChecksPath);
    const targetFor = (packet: BusLaneResearchPacket, row: BusLaneIdentityRow) => {
      const groups = packet.what_is_known.target_groups;
      const matches = groups.flatMap((group) => group.feature_matches);
      return {
        directions: [...new Set(matches.map((match) => match.direction))].sort(),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
        feature_row_count: matches.length,
        feature_rows: matches.map((match) => ({
          direction: match.direction, feature_id: match.feature_id, feature_key: match.feature_key,
        })),
        geometry_scopes: [...new Set(groups.map((group) => group.geometry_scope))].sort(),
        lane_group_ids: groups.map((group) => group.lane_group_id),
        matched_date: row.implementation_date,
        named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
        open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
      };
    };
    const validate = (
      draft: Record<string, unknown>,
      row: BusLaneIdentityRow,
      packet: BusLaneResearchPacket,
    ) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
      return () => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir);
    };
    const exactError = "East Gun Hill Road absence contract does not match the exact candidate";
    try {
      expect(rows).toHaveLength(9);
      expect(receiptByRoute.size).toBe(9);
      expect([...receiptByRoute.values()].filter((receipt) => receipt.prior_receipt === null)).toHaveLength(2);
      expect([...receiptByRoute.values()].filter((receipt) =>
        receipt.project_context.candidate_route_inventory_match)).toHaveLength(4);
      for (const packet of packets) {
        const row = rowByRoute.get(packet.gtfs_route_id)!;
        const receipt = receiptByRoute.get(packet.gtfs_route_id)!;
        expect(packet.missing_binding).toBe("feature_extent");
        expect(packet.unresolved_bindings).toEqual([
          "attribution", "direction", "feature_extent", "phase", "traversal",
        ]);
        expect(receipt.target).toMatchObject({
          lane_group_ids: ["BX|EAST GUN HILL ROAD"], feature_row_count: 109,
          directions: ["EB", "WB"], named_sbs_routes: [], open_dates_literals: ["10/31/2023"],
        });
        expect(receipt.target.feature_keys).toHaveLength(109);
        expect(receipt.target.feature_ids).toHaveLength(61);
        expect(receipt.source_gap).toMatchObject({
          missing_source_id: "nyc_dot_gun_hill_road_completion_2023",
          staged_source_available: false,
          raw_evidence_available: false,
          derived_release_records_used_as_source_evidence: false,
        });
        expect(validate(receipt, row, packet)).not.toThrow();
      }

      const routeId = "BX26";
      const row = rowByRoute.get(routeId)!;
      const packet = packetByRoute.get(routeId)!;
      const receipt = receiptByRoute.get(routeId)!;
      const group = packet.what_is_known.target_groups[0]!;
      expect(validate(receipt, row, { ...packet, missing_binding: "traversal",
        unresolved_bindings: ["attribution", "direction", "traversal"] })).toThrow();
      for (const binding of ["attribution", "feature_extent", "phase"] as const) {
        expect(validate(receipt, row, { ...packet,
          unresolved_bindings: packet.unresolved_bindings.filter((value) => value !== binding),
        })).toThrow();
        expect(validate({ ...receipt,
          unresolved_bindings: receipt.unresolved_bindings.filter((value) => value !== binding),
        }, row, packet)).toThrow();
      }
      const withGroup = (candidateGroup: typeof group) => {
        const candidateRow = { ...row, onset_evidence: { ...row.onset_evidence,
          target_groups: [candidateGroup] } };
        const candidatePacket = { ...packet, what_is_known: { ...packet.what_is_known,
          target_groups: [candidateGroup] } };
        return { candidateRow, candidatePacket,
          draft: { ...receipt, target: targetFor(candidatePacket, candidateRow) } };
      };
      const reordered = withGroup({ ...group, feature_matches: [
        group.feature_matches[1]!, group.feature_matches[0]!, ...group.feature_matches.slice(2),
      ] });
      expect(validate(reordered.draft, reordered.candidateRow, reordered.candidatePacket)).toThrow(exactError);
      const removed = withGroup({ ...group, feature_matches: group.feature_matches.slice(1) });
      expect(validate(removed.draft, removed.candidateRow, removed.candidatePacket)).toThrow(exactError);
      const rerouted = withGroup({ ...group, feature_matches: group.feature_matches.map((match, index) =>
        index === 0 ? { ...match, sbs_routes: [routeId] } : match) });
      expect(validate(rerouted.draft, rerouted.candidateRow, rerouted.candidatePacket)).toThrow(exactError);
      const retokened = withGroup({ ...group, feature_matches: group.feature_matches.map((match, index) =>
        index === 0 ? { ...match, matched_token_literal: "10/30/2023" } : match) });
      expect(validate(retokened.draft, retokened.candidateRow, retokened.candidatePacket)).toThrow(exactError);

      const dossierRefs = packet.what_is_known.dossier_refs.map((ref, index) =>
        index === 0 ? { ...ref, candidate_target_match: !ref.candidate_target_match } : ref);
      const dossierRow = { ...row, dossier_refs: dossierRefs };
      const dossierPacket = { ...packet, what_is_known: { ...packet.what_is_known,
        dossier_refs: dossierRefs,
        dossier_summary: { ...packet.what_is_known.dossier_summary,
          target_row_count: dossierRefs.filter((ref) => ref.candidate_target_match).length,
        },
      } };
      expect(validate(receipt, dossierRow, dossierPacket)).toThrow(exactError);

      expect(validate({ ...receipt, source_gap: { ...receipt.source_gap,
        staged_source_available: true } }, row, packet)).toThrow(exactError);
      expect(validate({ ...receipt, source_gap: { ...receipt.source_gap,
        derived_release_records_used_as_source_evidence: true } }, row, packet)).toThrow(exactError);
      expect(validate({ ...receipt, project_context: { ...receipt.project_context,
        context_only: false } }, row, packet)).toThrow(exactError);
      expect(validate({ ...receipt, project_context: { ...receipt.project_context,
        not_named_is_not_refutation: false } }, row, packet)).toThrow(exactError);
      expect(validate({ ...receipt, search: { ...receipt.search,
        exact_queries: receipt.search.exact_queries.slice(1) } }, row, packet)).toThrow(exactError);
      expect(validate({ ...receipt, authorizes_study: true }, row, packet)).toThrow(exactError);
      expect(validate({ ...receipt, prior_receipt: null }, row, packet)).toThrow(exactError);

      const bx28Row = rowByRoute.get("BX28")!;
      const bx28Packet = packetByRoute.get("BX28")!;
      const bx28Receipt = receiptByRoute.get("BX28")!;
      expect(bx28Receipt.prior_receipt).toBeNull();
      expect(validate({ ...bx28Receipt, prior_receipt: row.prior_acquisition_receipt }, bx28Row, bx28Packet))
        .toThrow(exactError);

      mkdirSync(join(rootDir, "raw/sources/nyc_dot_gun_hill_road_completion_2023"), { recursive: true });
      expect(validate(receipt, row, packet)).toThrow(exactError);
      rmSync(join(rootDir, "raw/sources/nyc_dot_gun_hill_road_completion_2023"),
        { recursive: true, force: true });

      writeFileSync(join(contextSourceRoot, "source.pdf"), "fabricated\n");
      expect(validate(receipt, row, packet)).toThrow(exactError);
      copyFileSync(join(repoRoot, "raw/sources/meeting_doc_127471/source.pdf"),
        join(contextSourceRoot, "source.pdf"));

      const acquiredChecks = JSON.parse(readFileSync(acquiredChecksPath, "utf8")) as {
        sources: Record<string, unknown>[];
      };
      writeFileSync(acquiredChecksPath, JSON.stringify({ sources: acquiredChecks.sources.map((source) =>
        source.id === "gun_hill_completion" ? { ...source, raw_content_retained: true } : source) }));
      expect(validate(receipt, row, packet)).toThrow(exactError);
      copyFileSync(join(repoRoot,
        "data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquired-source-checks.json"),
      acquiredChecksPath);

      const priorLine = priorLineById.get(row.prior_acquisition_receipt!.receipt_id)!;
      const tamperedPrior = { ...JSON.parse(priorLine), claim_results: {
        ...JSON.parse(priorLine).claim_results, operational_occurrence_identity_proved: true,
      } };
      writeFileSync(tempPriorPath, `${selectedPriorLines.map((line) => line === priorLine
        ? stableJson(tamperedPrior as JsonValue) : line).join("\n")}\n`);
      expect(validate(receipt, row, packet)).toThrow(exactError);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("closes S52 Father Capodanno only with candidate-exact uncertainty and nonterminal context", () => {
    const repoRoot = join(import.meta.dir, "../../../..");
    const packetPath = join(repoRoot,
      "data/quality/acquisition/packets/bus-lane/packets/b40f1b64f8c80552a5dd73e9.json");
    const packet = JSON.parse(readFileSync(packetPath, "utf8")) as BusLaneResearchPacket;
    const row = readFileSync(join(repoRoot,
      "data/quality/operational-reference/bus-lane-identity-ledger.jsonl"), "utf8")
      .split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as BusLaneIdentityRow)
      .find((candidate) => candidate.candidate_id === packet.candidate_id)!;
    const expected = buildFrCapodannoBindingReceiptDraft(row, packet);
    const suffix = String(expected.receipt_id).split(":")[1];
    const receipt = JSON.parse(readFileSync(join(repoRoot,
      `data/quality/acquisition/receipts/bus-lane-review/${suffix}.json`), "utf8")) as Record<string, any>;
    const priorArtifact =
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/receipts.jsonl";
    const acquiredArtifact =
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/acquired-source-checks.json";
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-fr-capodanno-"));
    const receiptDir = join(rootDir, "receipts");
    const currentSourceRoot = join(rootDir, "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(currentSourceRoot, { recursive: true });
    for (const file of ["metadata.json", "source.geojson"]) {
      copyFileSync(join(repoRoot, "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22", file),
        join(currentSourceRoot, file));
    }
    for (const sourceId of ["2012_03_15_brt_hylan_meeting_slides", "2014_hylan_blvd_final_report"]) {
      const sourceRoot = join(rootDir, "raw/sources", sourceId);
      mkdirSync(sourceRoot, { recursive: true });
      for (const file of ["metadata.json", "source.pdf", "blocks.jsonl"]) {
        copyFileSync(join(repoRoot, "raw/sources", sourceId, file), join(sourceRoot, file));
      }
    }
    for (const artifact of [priorArtifact, acquiredArtifact]) {
      const destination = join(rootDir, artifact);
      mkdirSync(join(destination, ".."), { recursive: true });
      copyFileSync(join(repoRoot, artifact), destination);
    }
    const validate = (
      draft: Record<string, unknown>,
      candidateRow: BusLaneIdentityRow = row,
      candidatePacket: BusLaneResearchPacket = packet,
    ) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
      return () => validateBindingReceiptDrafts([candidateRow], [candidatePacket], receiptDir, rootDir);
    };
    const targetFor = (candidatePacket: BusLaneResearchPacket, candidateRow: BusLaneIdentityRow) => {
      const groups = candidatePacket.what_is_known.target_groups;
      const matches = groups.flatMap((group) => group.feature_matches);
      return {
        directions: [...new Set(matches.map((match) => match.direction))].sort(),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
        feature_row_count: matches.length,
        feature_rows: matches.map((match) => ({
          direction: match.direction, feature_id: match.feature_id, feature_key: match.feature_key,
        })),
        geometry_scopes: [...new Set(groups.map((group) => group.geometry_scope))].sort(),
        lane_group_ids: groups.map((group) => group.lane_group_id),
        matched_date: candidateRow.implementation_date,
        named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
        open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
      };
    };
    try {
      expect(packet.gtfs_route_id).toBe("S52");
      expect(packet.missing_binding).toBe("feature_extent");
      expect(packet.unresolved_bindings).toEqual([
        "attribution", "direction", "feature_extent", "phase", "traversal",
      ]);
      expect(receipt.target).toMatchObject({
        lane_group_ids: ["SI|FR CAPODANNO BOULEVARD"], feature_row_count: 42,
        directions: ["NB"], named_sbs_routes: [], open_dates_literals: ["11/10/10"],
      });
      expect(receipt.target.feature_keys).toHaveLength(42);
      expect(receipt.target.feature_ids).toHaveLength(42);
      expect(receipt.context_evidence.map((context: Record<string, unknown>) => context.classification)).toEqual([
        "later_hylan_project_parallel_corridor_context",
        "later_hylan_project_unchanged_comparison_corridor_context",
      ]);
      expect(receipt.context_evidence.every((context: Record<string, unknown>) =>
        context.context_only === true && context.candidate_direction_bound === false &&
        context.not_candidate_refutation === true)).toBe(true);
      expect(receipt.source_gap).toMatchObject({
        candidate_specific_authoritative_raw_source_available: false,
        derived_release_records_used_as_source_evidence: false,
        staged_candidate_binding_source_available: false,
        prior_only_retrieval: {
          id: "mta_bustime_S52", acquired_check_record_available: false,
          raw_content_retention_independently_verified: false, used_as_source_evidence: false,
        },
      });
      expect(receipt.source_gap.nonretained_acquisition_records).toHaveLength(7);
      expect(validate(receipt)).not.toThrow();
      expect(receipt.search.urls_inspected).toEqual([
        "https://bustime-classic.mta.info/m/?q=S52",
        "https://data.cityofnewyork.us/api/views/ycrg-ses3",
        "https://data.cityofnewyork.us/resource/ycrg-ses3.json?$limit=5000",
        "https://files.mta.info/s3fs-public/pdf/bussi-express_0.pdf",
        "https://www.nyc.gov/html/brt/downloads/pdf/2012-03-15_brt_hylan_meeting-slides.pdf",
        "https://www.nyc.gov/html/brt/downloads/pdf/2014-hylan-blvd-final-report.pdf",
        "https://www.nyc.gov/html/dot/downloads/pdf/lincoln-ave-father-capodanno-blvd-railroad-ave-april-2023.pdf",
        "https://www.nyc.gov/html/dot/downloads/pdf/nyc-dot-select-bus-service-report.pdf",
        "https://www.nyc.gov/html/dot/html/about/current-projects.shtml",
        "https://www.nyc.gov/html/dot/html/about/datafeeds.shtml",
      ]);
      const reviewedRow = {
        ...row,
        decision_id: `bus-lane-identity-decision:${suffix}`,
        receipt_ids: [String(receipt.receipt_id)],
        unresolved_bindings: [...packet.unresolved_bindings],
        updated_at: "2026-07-23T18:40:32Z",
        verdict: "binding_absent_after_search",
        verdict_basis: `review:bus-lane-identity-decision:${suffix}`,
      } as BusLaneIdentityRow;
      expect(() => validateReviewedReceiptRefs([reviewedRow], receiptDir)).not.toThrow();
      expect(validate({ ...receipt, search: { ...receipt.search, urls_inspected: [] } })).toThrow();

      expect(validate(receipt, row, { ...packet, missing_binding: "traversal",
        unresolved_bindings: ["attribution", "traversal"] })).toThrow();
      for (const binding of ["attribution", "direction", "feature_extent", "phase"] as const) {
        expect(validate(receipt, row, { ...packet,
          unresolved_bindings: packet.unresolved_bindings.filter((value) => value !== binding),
        })).toThrow();
        expect(validate({ ...receipt,
          unresolved_bindings: receipt.unresolved_bindings.filter((value: string) => value !== binding),
        })).toThrow();
      }

      const group = packet.what_is_known.target_groups[0]!;
      const withGroup = (candidateGroup: typeof group) => {
        const candidateRow = { ...row, onset_evidence: { ...row.onset_evidence,
          target_groups: [candidateGroup] } };
        const candidatePacket = { ...packet, what_is_known: { ...packet.what_is_known,
          target_groups: [candidateGroup] } };
        return { candidateRow, candidatePacket,
          draft: { ...receipt, target: targetFor(candidatePacket, candidateRow) } };
      };
      const reordered = withGroup({ ...group, feature_matches: [
        group.feature_matches[1]!, group.feature_matches[0]!, ...group.feature_matches.slice(2),
      ] });
      expect(validate(reordered.draft, reordered.candidateRow, reordered.candidatePacket)).toThrow();
      const removed = withGroup({ ...group, feature_matches: group.feature_matches.slice(1) });
      expect(validate(removed.draft, removed.candidateRow, removed.candidatePacket)).toThrow();
      const southbound = withGroup({ ...group, feature_matches: group.feature_matches.map((match, index) =>
        index === 0 ? { ...match, direction: "SB" } : match) });
      expect(validate(southbound.draft, southbound.candidateRow, southbound.candidatePacket)).toThrow();
      const retokened = withGroup({ ...group, feature_matches: group.feature_matches.map((match, index) =>
        index === 0 ? { ...match, matched_token_literal: "11/10/2010" } : match) });
      expect(validate(retokened.draft, retokened.candidateRow, retokened.candidatePacket)).toThrow();
      const attributed = withGroup({ ...group, feature_matches: group.feature_matches.map((match, index) =>
        index === 0 ? { ...match, sbs_routes: ["S52"] } : match) });
      expect(validate(attributed.draft, attributed.candidateRow, attributed.candidatePacket)).toThrow();

      const dossierRefs = packet.what_is_known.dossier_refs.map((ref) => ({
        ...ref, candidate_target_match: true, direction: "NB", lane_group_id: "SI|FR CAPODANNO BOULEVARD",
      }));
      const dossierRow = { ...row, dossier_refs: dossierRefs };
      const dossierPacket = { ...packet, what_is_known: { ...packet.what_is_known,
        dossier_refs: dossierRefs,
        dossier_summary: { ...packet.what_is_known.dossier_summary, target_row_count: 1 },
      } };
      expect(validate(receipt, dossierRow, dossierPacket)).toThrow();
      expect(validate({ ...receipt, context_evidence: receipt.context_evidence.map(
        (context: Record<string, unknown>, index: number) => index === 0
          ? { ...context, candidate_direction_bound: true } : context) })).toThrow();
      expect(validate({ ...receipt, source_gap: { ...receipt.source_gap,
        candidate_specific_authoritative_raw_source_available: true } })).toThrow();
      expect(validate({ ...receipt, source_gap: { ...receipt.source_gap,
        prior_only_retrieval: { ...receipt.source_gap.prior_only_retrieval,
          used_as_source_evidence: true } } })).toThrow();
      expect(validate({ ...receipt, authorizes_study: true })).toThrow();

      const slidePath = join(rootDir, "raw/sources/2012_03_15_brt_hylan_meeting_slides/source.pdf");
      writeFileSync(slidePath, "fabricated\n");
      expect(validate(receipt)).toThrow();
      copyFileSync(join(repoRoot, "raw/sources/2012_03_15_brt_hylan_meeting_slides/source.pdf"), slidePath);

      const acquiredChecksPath = join(rootDir, acquiredArtifact);
      const acquiredChecks = JSON.parse(readFileSync(acquiredChecksPath, "utf8")) as {
        sources: Record<string, unknown>[];
      };
      writeFileSync(acquiredChecksPath, JSON.stringify({ sources: acquiredChecks.sources.map((source) =>
        source.id === "father_capodanno_safety_2023" ? { ...source, raw_content_retained: true } : source) }));
      expect(validate(receipt)).toThrow();
      copyFileSync(join(repoRoot, acquiredArtifact), acquiredChecksPath);

      const priorPath = join(rootDir, priorArtifact);
      const priorLines = readFileSync(priorPath, "utf8").split(/\r?\n/u).filter(Boolean);
      writeFileSync(priorPath, `${priorLines.map((line) => {
        const prior = JSON.parse(line);
        return prior.receipt_id === "staten-island-acquisition:07078ada9c8ef7de3afe7e2a"
          ? stableJson({ ...prior, claim_results: { ...prior.claim_results,
            candidate_segment_ids_pinned: true } } as JsonValue)
          : line;
      }).join("\n")}\n`);
      expect(validate(receipt)).toThrow();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("closes Q103 and Q104 on 21 Street only with the exact mixed-direction target and explicit source gap", () => {
    const repoRoot = join(import.meta.dir, "../../../..");
    const packetPaths = [
      join(repoRoot, "data/quality/acquisition/packets/bus-lane/packets/734bee5255654fbd9e1f06b4.json"),
      join(repoRoot, "data/quality/acquisition/packets/bus-lane/packets/43d8d4908a15ceff1c34fee9.json"),
    ];
    const packets = packetPaths.map((path) =>
      JSON.parse(readFileSync(path, "utf8")) as BusLaneResearchPacket);
    const ledgerRows = readFileSync(join(repoRoot,
      "data/quality/operational-reference/bus-lane-identity-ledger.jsonl"), "utf8")
      .split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as BusLaneIdentityRow);
    const rowByRoute = new Map(packets.map((packet) => [
      packet.gtfs_route_id,
      ledgerRows.find((row) => row.candidate_id === packet.candidate_id)!,
    ]));
    const packetByRoute = new Map(packets.map((packet) => [packet.gtfs_route_id, packet]));
    const expectedByRoute = new Map(packets.map((packet) => {
      const row = rowByRoute.get(packet.gtfs_route_id)!;
      return [packet.gtfs_route_id, buildTwentyFirstStreetBindingReceiptDraft(row, packet)];
    }));
    const receiptByRoute = new Map([...expectedByRoute].map(([routeId, expected]) => {
      const suffix = String(expected.receipt_id).split(":")[1];
      const receipt = JSON.parse(readFileSync(join(repoRoot,
        `data/quality/acquisition/receipts/bus-lane-review/${suffix}.json`), "utf8")) as Record<string, any>;
      return [routeId, receipt];
    }));
    const priorArtifact =
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/queens/receipts.jsonl";
    const acquiredArtifact =
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/queens/acquired-source-checks.json";
    const sourcePageArtifact = "wiki/sources/nyc_dot_21st_street_bus_priority_completion_2022.md";
    const journalArtifact =
      "data/submissions/2026-07-15T18-00-00-000Z_queens-acquisition-linkage-remediation.jsonl";
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-21-street-"));
    const receiptDir = join(rootDir, "receipts");
    const currentSourceRoot = join(rootDir, "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22");
    const stagedSourceRoot = join(rootDir, "raw/sources/meeting_doc_85816");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(currentSourceRoot, { recursive: true });
    mkdirSync(stagedSourceRoot, { recursive: true });
    for (const file of ["metadata.json", "source.geojson"]) {
      copyFileSync(join(repoRoot, "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22", file),
        join(currentSourceRoot, file));
    }
    for (const file of ["metadata.json", "source.pdf", "blocks.jsonl"]) {
      copyFileSync(join(repoRoot, "raw/sources/meeting_doc_85816", file), join(stagedSourceRoot, file));
    }
    for (const artifact of [priorArtifact, acquiredArtifact, sourcePageArtifact, journalArtifact]) {
      const destination = join(rootDir, artifact);
      mkdirSync(join(destination, ".."), { recursive: true });
      copyFileSync(join(repoRoot, artifact), destination);
    }
    const validate = (
      draft: Record<string, unknown>,
      row: BusLaneIdentityRow,
      packet: BusLaneResearchPacket,
    ) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as unknown as JsonValue));
      return () => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir);
    };
    const targetFor = (packet: BusLaneResearchPacket, row: BusLaneIdentityRow) => {
      const groups = packet.what_is_known.target_groups;
      const matches = groups.flatMap((group) => group.feature_matches);
      return {
        directions: [...new Set(matches.map((match) => match.direction))].sort(),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
        feature_row_count: matches.length,
        feature_rows: matches.map((match) => ({
          direction: match.direction, feature_id: match.feature_id, feature_key: match.feature_key,
        })),
        geometry_scopes: [...new Set(groups.map((group) => group.geometry_scope))].sort(),
        lane_group_ids: groups.map((group) => group.lane_group_id),
        matched_date: row.implementation_date,
        named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
        open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
      };
    };
    const exactError = "21 Street absence contract does not match the exact candidate";
    try {
      for (const routeId of ["Q103", "Q104"]) {
        const row = rowByRoute.get(routeId)!;
        const packet = packetByRoute.get(routeId)!;
        const receipt = receiptByRoute.get(routeId)!;
        expect(receipt).toEqual(expectedByRoute.get(routeId)!);
        expect(packet.missing_binding).toBe("feature_extent");
        expect(packet.unresolved_bindings).toEqual([
          "attribution", "direction", "feature_extent", "phase", "traversal",
        ]);
        expect(receipt.target).toMatchObject({
          lane_group_ids: ["QNS|21 STREET"],
          feature_row_count: 100,
          directions: ["NB", "SB"],
          named_sbs_routes: [],
          open_dates_literals: ["8/15/2022"],
        });
        expect(receipt.target.feature_keys).toHaveLength(100);
        expect(receipt.target.feature_ids).toHaveLength(51);
        expect(receipt.context_evidence[0]).toMatchObject({
          candidate_date_bound: false,
          candidate_direction_bound: false,
          candidate_exact_target_bound: false,
          candidate_phase_bound: false,
          candidate_route_named: routeId === "Q103",
          candidate_traversal_bound: false,
          context_only: true,
          derived_materialization_used_as_source_evidence: false,
          generic_project_route_context: routeId === "Q103",
          not_candidate_refutation: true,
          raw_source_available: false,
          route_scope: routeId === "Q103" ? "one_block_unspecified" : null,
        });
        expect(receipt.source_gap).toMatchObject({
          accepted_journal_available: true,
          candidate_specific_authoritative_raw_source_available: false,
          derived_release_records_used_as_source_evidence: false,
          generated_source_page_available: true,
          prior_only_route_page_retrieval: {
            id: `mta_bustime_${routeId}`,
            acquired_check_record_available: false,
            raw_content_retention_independently_verified: false,
            used_as_source_evidence: false,
          },
          prior_staged_source_claim_resolves: false,
          staged_context_source_available: true,
          staged_context_source_proves_candidate_binding: false,
        });
        expect(receipt.source_gap.nonretained_acquisition_records).toHaveLength(6);
        expect(receipt.search.urls_inspected).toHaveLength(8);
        expect(validate(receipt, row, packet)).not.toThrow();

        const suffix = String(receipt.receipt_id).split(":")[1];
        const reviewedRow = {
          ...row,
          decision_id: `bus-lane-identity-decision:${suffix}`,
          receipt_ids: [String(receipt.receipt_id)],
          unresolved_bindings: [...packet.unresolved_bindings],
          updated_at: "2026-07-23T20:00:00Z",
          verdict: "binding_absent_after_search",
          verdict_basis: `review:bus-lane-identity-decision:${suffix}`,
        } as BusLaneIdentityRow;
        writeFileSync(join(receiptDir, "draft.json"), stableJson(receipt as JsonValue));
        expect(() => validateReviewedReceiptRefs([reviewedRow], receiptDir)).not.toThrow();
        writeFileSync(join(receiptDir, "draft.json"), stableJson({
          ...receipt, search: { ...receipt.search, urls_inspected: [] },
        } as JsonValue));
        expect(() => validateReviewedReceiptRefs([reviewedRow], receiptDir))
          .toThrow("absent-after-search receipt requires non-empty urls_inspected");

        expect(validate(receipt, row, {
          ...packet, missing_binding: "phase", unresolved_bindings: ["phase"],
        })).toThrow();
        for (const binding of ["attribution", "direction", "feature_extent", "phase", "traversal"] as const) {
          expect(validate(receipt, row, {
            ...packet,
            unresolved_bindings: packet.unresolved_bindings.filter((value) => value !== binding),
          })).toThrow();
          expect(validate({
            ...receipt,
            unresolved_bindings: receipt.unresolved_bindings.filter((value: string) => value !== binding),
          }, row, packet)).toThrow();
        }

        const group = packet.what_is_known.target_groups[0]!;
        const withGroup = (candidateGroup: typeof group) => {
          const candidateRow = { ...row, onset_evidence: {
            ...row.onset_evidence, target_groups: [candidateGroup],
          } };
          const candidatePacket = { ...packet, what_is_known: {
            ...packet.what_is_known, target_groups: [candidateGroup],
          } };
          return {
            candidateRow,
            candidatePacket,
            draft: { ...receipt, target: targetFor(candidatePacket, candidateRow) },
          };
        };
        const reordered = withGroup({ ...group, feature_matches: [
          group.feature_matches[1]!, group.feature_matches[0]!, ...group.feature_matches.slice(2),
        ] });
        expect(validate(reordered.draft, reordered.candidateRow, reordered.candidatePacket)).toThrow(exactError);
        const removed = withGroup({ ...group, feature_matches: group.feature_matches.slice(1) });
        expect(validate(removed.draft, removed.candidateRow, removed.candidatePacket)).toThrow(exactError);
        const redirected = withGroup({ ...group, feature_matches: group.feature_matches.map((match, index) =>
          index === 0 ? { ...match, direction: match.direction === "NB" ? "SB" : "NB" } : match) });
        expect(validate(redirected.draft, redirected.candidateRow, redirected.candidatePacket)).toThrow(exactError);
        const retokened = withGroup({ ...group, feature_matches: group.feature_matches.map((match, index) =>
          index === 0 ? { ...match, matched_token_literal: "08/15/2022" } : match) });
        expect(validate(retokened.draft, retokened.candidateRow, retokened.candidatePacket)).toThrow(exactError);
        const attributed = withGroup({ ...group, feature_matches: group.feature_matches.map((match, index) =>
          index === 0 ? { ...match, sbs_routes: [routeId] } : match) });
        expect(validate(attributed.draft, attributed.candidateRow, attributed.candidatePacket)).toThrow(exactError);

        const dossierRefs = packet.what_is_known.dossier_refs.map((ref) => ({
          ...ref, candidate_target_match: true, direction: "NB", lane_group_id: "QNS|21 STREET",
        }));
        const dossierRow = { ...row, dossier_refs: dossierRefs };
        const dossierPacket = { ...packet, what_is_known: {
          ...packet.what_is_known,
          dossier_refs: dossierRefs,
          dossier_summary: { ...packet.what_is_known.dossier_summary, target_row_count: 1 },
        } };
        expect(validate(receipt, dossierRow, dossierPacket)).toThrow();
        expect(validate({
          ...receipt,
          context_evidence: receipt.context_evidence.map(
            (context: Record<string, unknown>, index: number) => index === 0
              ? { ...context, candidate_direction_bound: true } : context),
        }, row, packet)).toThrow(exactError);
        expect(validate({
          ...receipt,
          source_gap: { ...receipt.source_gap, derived_release_records_used_as_source_evidence: true },
        }, row, packet)).toThrow(exactError);
        expect(validate({ ...receipt, authorizes_study: true }, row, packet)).toThrow(exactError);
      }

      const q103Row = rowByRoute.get("Q103")!;
      const q103Packet = packetByRoute.get("Q103")!;
      const q103Receipt = receiptByRoute.get("Q103")!;
      const q104Receipt = receiptByRoute.get("Q104")!;
      expect(validate(q104Receipt, q103Row, q103Packet)).toThrow();

      const missingRawRoot = join(rootDir,
        "raw/sources/nyc_dot_21st_street_bus_priority_completion_2022");
      mkdirSync(missingRawRoot, { recursive: true });
      expect(validate(q103Receipt, q103Row, q103Packet)).toThrow(exactError);
      rmSync(missingRawRoot, { recursive: true, force: true });

      const stagedSourcePath = join(stagedSourceRoot, "source.pdf");
      writeFileSync(stagedSourcePath, "fabricated\n");
      expect(validate(q103Receipt, q103Row, q103Packet)).toThrow(exactError);
      copyFileSync(join(repoRoot, "raw/sources/meeting_doc_85816/source.pdf"), stagedSourcePath);

      const acquiredChecksPath = join(rootDir, acquiredArtifact);
      const acquiredChecks = JSON.parse(readFileSync(acquiredChecksPath, "utf8")) as {
        sources: Record<string, unknown>[];
      };
      writeFileSync(acquiredChecksPath, JSON.stringify({ sources: acquiredChecks.sources.map((source) =>
        source.id === "twenty_first_completion_press"
          ? { ...source, raw_content_retained: true } : source) }));
      expect(validate(q103Receipt, q103Row, q103Packet)).toThrow(exactError);
      copyFileSync(join(repoRoot, acquiredArtifact), acquiredChecksPath);

      const priorPath = join(rootDir, priorArtifact);
      const priorLines = readFileSync(priorPath, "utf8").split(/\r?\n/u).filter(Boolean);
      writeFileSync(priorPath, `${priorLines.map((line) => {
        const prior = JSON.parse(line);
        return prior.receipt_id === "queens-acquisition:af4b7b3e814f442db262a1fc"
          ? stableJson({ ...prior, canonical_actions: {
            ...prior.canonical_actions, operational_occurrence_added_or_updated: true,
          } } as JsonValue)
          : line;
      }).join("\n")}\n`);
      expect(validate(q103Receipt, q103Row, q103Packet)).toThrow(exactError);
      copyFileSync(join(repoRoot, priorArtifact), priorPath);

      const sourcePagePath = join(rootDir, sourcePageArtifact);
      writeFileSync(sourcePagePath, `${readFileSync(sourcePagePath, "utf8")}\n`);
      expect(validate(q103Receipt, q103Row, q103Packet)).toThrow(exactError);
      copyFileSync(join(repoRoot, sourcePageArtifact), sourcePagePath);

      const journalPath = join(rootDir, journalArtifact);
      writeFileSync(journalPath, `${readFileSync(journalPath, "utf8")}\n`);
      expect(validate(q103Receipt, q103Row, q103Packet)).toThrow(exactError);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("closes the five 2012 Madison Avenue candidates without promoting current direction or later upgrade context", () => {
    const repoRoot = join(import.meta.dir, "../../../..");
    const packetNames = [
      "ed46109842e4a9ad3a9beee7", "779bcd9de5c539c681b75e56", "88da2540117d36715c8e05b4",
      "0ee4be2f7888e069a27405bb", "bfc4ec7115ddae73856a3de1",
    ];
    const packets = packetNames.map((name) => JSON.parse(readFileSync(join(repoRoot,
      `data/quality/acquisition/packets/bus-lane/packets/${name}.json`), "utf8")) as BusLaneResearchPacket);
    const ledgerRows = readFileSync(join(repoRoot,
      "data/quality/operational-reference/bus-lane-identity-ledger.jsonl"), "utf8")
      .split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as BusLaneIdentityRow);
    const rowByRoute = new Map(packets.map((packet) => [
      packet.gtfs_route_id, ledgerRows.find((row) => row.candidate_id === packet.candidate_id)!,
    ]));
    const packetByRoute = new Map(packets.map((packet) => [packet.gtfs_route_id, packet]));
    const receiptByRoute = new Map(packets.map((packet) => {
      const row = rowByRoute.get(packet.gtfs_route_id)!;
      const expected = buildMadisonAvenueBindingReceiptDraft(row, packet);
      const suffix = String(expected.receipt_id).split(":")[1];
      const receipt = JSON.parse(readFileSync(join(repoRoot,
        `data/quality/acquisition/receipts/bus-lane-review/${suffix}.json`), "utf8")) as Record<string, any>;
      expect(receipt).toEqual(expected);
      return [packet.gtfs_route_id, receipt];
    }));
    const priorArtifact =
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/receipts.jsonl";
    const acquiredArtifact =
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/acquired-source-checks.json";
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-madison-"));
    const receiptDir = join(rootDir, "receipts");
    const currentSourceRoot = join(rootDir, "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22");
    const stagedSourceRoot = join(rootDir, "raw/sources/better_buses_action_plan_2019");
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(currentSourceRoot, { recursive: true });
    mkdirSync(stagedSourceRoot, { recursive: true });
    for (const file of ["metadata.json", "source.geojson"]) {
      copyFileSync(join(repoRoot, "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22", file),
        join(currentSourceRoot, file));
    }
    for (const file of ["metadata.json", "source.pdf", "blocks.jsonl"]) {
      copyFileSync(join(repoRoot, "raw/sources/better_buses_action_plan_2019", file),
        join(stagedSourceRoot, file));
    }
    for (const artifact of [priorArtifact, acquiredArtifact]) {
      const destination = join(rootDir, artifact);
      mkdirSync(join(destination, ".."), { recursive: true });
      copyFileSync(join(repoRoot, artifact), destination);
    }
    const validate = (
      draft: Record<string, unknown>,
      row: BusLaneIdentityRow,
      packet: BusLaneResearchPacket,
    ) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as JsonValue));
      return () => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir);
    };
    const targetFor = (packet: BusLaneResearchPacket, row: BusLaneIdentityRow) => {
      const groups = packet.what_is_known.target_groups;
      const matches = groups.flatMap((group) => group.feature_matches);
      return {
        directions: [...new Set(matches.map((match) => match.direction))].sort(),
        feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
        feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
        feature_row_count: matches.length,
        feature_rows: matches.map((match) => ({
          direction: match.direction, feature_id: match.feature_id, feature_key: match.feature_key,
        })),
        geometry_scopes: [...new Set(groups.map((group) => group.geometry_scope))].sort(),
        lane_group_ids: groups.map((group) => group.lane_group_id),
        matched_date: row.implementation_date,
        named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
        open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
      };
    };
    const exactError = "Madison Avenue absence contract does not match the exact candidate";
    try {
      for (const routeId of ["SIM8", "SIM22", "SIM25", "SIM26", "SIM30"]) {
        const row = rowByRoute.get(routeId)!;
        const packet = packetByRoute.get(routeId)!;
        const receipt = receiptByRoute.get(routeId)!;
        expect(packet.missing_binding).toBe("feature_extent");
        expect(packet.unresolved_bindings).toEqual([
          "attribution", "direction", "feature_extent", "phase", "traversal",
        ]);
        expect(receipt.target).toMatchObject({
          directions: ["NB"],
          feature_row_count: 19,
          lane_group_ids: ["MAN|MADISON AVENUE"],
          named_sbs_routes: [],
          open_dates_literals: ["5/26/81,1/82, 12/11/12"],
        });
        expect(receipt.target.feature_keys).toHaveLength(19);
        expect(receipt.target.feature_ids).toHaveLength(19);
        expect(receipt.context_evidence).toHaveLength(1);
        expect(receipt.context_evidence[0]).toMatchObject({
          candidate_date_bound: false,
          candidate_direction_bound: false,
          candidate_exact_target_bound: false,
          candidate_feature_extent_bound: false,
          candidate_onset_bound: false,
          candidate_occurrence_bound: false,
          candidate_phase_bound: false,
          candidate_route_inventory_match: true,
          candidate_traversal_bound: false,
          context_only: true,
          generic_route_treatment_context: true,
          not_occurrence_evidence: true,
        });
        expect(receipt.context_evidence[0].evidence_blocks).toHaveLength(3);
        expect(receipt.source_gap).toMatchObject({
          candidate_specific_historical_raw_source_available: false,
          candidate_specific_historical_schedule_available: false,
          later_context_source_available: true,
          later_context_source_proves_candidate_binding: false,
          staged_later_context_used_as_candidate_onset_evidence: false,
          staged_later_context_used_as_occurrence_evidence: false,
          prior_only_route_page_retrieval: {
            acquired_check_record_available: false,
            id: `mta_bustime_${routeId}`,
            raw_content_retention_independently_verified: false,
            used_as_source_evidence: false,
          },
        });
        expect(receipt.source_gap.nonretained_acquisition_records).toHaveLength(8);
        expect(receipt.search.urls_inspected).toHaveLength(9);
        expect(validate(receipt, row, packet)).not.toThrow();

        const suffix = String(receipt.receipt_id).split(":")[1];
        const reviewedRow = {
          ...row,
          decision_id: `bus-lane-identity-decision:${suffix}`,
          receipt_ids: [String(receipt.receipt_id)],
          unresolved_bindings: [...packet.unresolved_bindings],
          updated_at: "2026-07-23T22:00:00Z",
          verdict: "binding_absent_after_search",
          verdict_basis: `review:bus-lane-identity-decision:${suffix}`,
        } as BusLaneIdentityRow;
        writeFileSync(join(receiptDir, "draft.json"), stableJson(receipt as JsonValue));
        expect(() => validateReviewedReceiptRefs([reviewedRow], receiptDir)).not.toThrow();
        writeFileSync(join(receiptDir, "draft.json"), stableJson({
          ...receipt, search: { ...receipt.search, urls_inspected: [] },
        } as JsonValue));
        expect(() => validateReviewedReceiptRefs([reviewedRow], receiptDir))
          .toThrow("absent-after-search receipt requires non-empty urls_inspected");

        expect(validate(receipt, row, {
          ...packet,
          unresolved_bindings: ["attribution", "feature_extent", "phase", "traversal"],
        })).toThrow();
        for (const binding of ["attribution", "direction", "feature_extent", "phase", "traversal"] as const) {
          expect(validate(receipt, row, {
            ...packet,
            unresolved_bindings: packet.unresolved_bindings.filter((value) => value !== binding),
          })).toThrow();
          expect(validate({
            ...receipt,
            unresolved_bindings: receipt.unresolved_bindings.filter((value: string) => value !== binding),
          }, row, packet)).toThrow();
        }

        const group = packet.what_is_known.target_groups[0]!;
        const withGroup = (candidateGroup: typeof group) => {
          const candidateRow = { ...row, onset_evidence: {
            ...row.onset_evidence, target_groups: [candidateGroup],
          } };
          const candidatePacket = { ...packet, what_is_known: {
            ...packet.what_is_known, target_groups: [candidateGroup],
          } };
          return {
            candidateRow,
            candidatePacket,
            draft: { ...receipt, target: targetFor(candidatePacket, candidateRow) },
          };
        };
        const reordered = withGroup({ ...group, feature_matches: [
          group.feature_matches[1]!, group.feature_matches[0]!, ...group.feature_matches.slice(2),
        ] });
        expect(validate(reordered.draft, reordered.candidateRow, reordered.candidatePacket)).toThrow(exactError);
        const removed = withGroup({ ...group, feature_matches: group.feature_matches.slice(1) });
        expect(validate(removed.draft, removed.candidateRow, removed.candidatePacket)).toThrow(exactError);
        const redirected = withGroup({ ...group, feature_matches: group.feature_matches.map((match, index) =>
          index === 0 ? { ...match, direction: "SB" } : match) });
        expect(validate(redirected.draft, redirected.candidateRow, redirected.candidatePacket)).toThrow(exactError);
        const retokened = withGroup({ ...group, feature_matches: group.feature_matches.map((match, index) =>
          index === 0 ? { ...match, matched_token_literal: "12/11/2012" } : match) });
        expect(validate(retokened.draft, retokened.candidateRow, retokened.candidatePacket)).toThrow(exactError);
        const reliteral = withGroup({ ...group, feature_matches: group.feature_matches.map((match, index) =>
          index === 0 ? { ...match, open_dates_literal: "12/11/12" } : match) });
        expect(validate(reliteral.draft, reliteral.candidateRow, reliteral.candidatePacket)).toThrow(exactError);
        const attributed = withGroup({ ...group, feature_matches: group.feature_matches.map((match, index) =>
          index === 0 ? { ...match, sbs_routes: [routeId] } : match) });
        expect(validate(attributed.draft, attributed.candidateRow, attributed.candidatePacket)).toThrow(exactError);

        const dossierRefs = packet.what_is_known.dossier_refs.map((ref) => ({
          ...ref, candidate_target_match: true, direction: "NB", lane_group_id: "MAN|MADISON AVENUE",
        }));
        const dossierRow = { ...row, dossier_refs: dossierRefs };
        const dossierPacket = { ...packet, what_is_known: {
          ...packet.what_is_known,
          dossier_refs: dossierRefs,
          dossier_summary: { ...packet.what_is_known.dossier_summary, target_row_count: 1 },
        } };
        expect(validate(receipt, dossierRow, dossierPacket)).toThrow();
        expect(validate({
          ...receipt,
          context_evidence: [{ ...receipt.context_evidence[0], candidate_direction_bound: true }],
        }, row, packet)).toThrow(exactError);
        expect(validate({
          ...receipt,
          source_gap: { ...receipt.source_gap, staged_later_context_used_as_candidate_onset_evidence: true },
        }, row, packet)).toThrow(exactError);
        expect(validate({ ...receipt, authorizes_study: true }, row, packet)).toThrow(exactError);
      }

      const sim8Row = rowByRoute.get("SIM8")!;
      const sim8Packet = packetByRoute.get("SIM8")!;
      expect(validate(receiptByRoute.get("SIM22")!, sim8Row, sim8Packet)).toThrow();

      const stagedSourcePath = join(stagedSourceRoot, "source.pdf");
      writeFileSync(stagedSourcePath, "fabricated\n");
      expect(validate(receiptByRoute.get("SIM8")!, sim8Row, sim8Packet)).toThrow(exactError);
      copyFileSync(join(repoRoot, "raw/sources/better_buses_action_plan_2019/source.pdf"), stagedSourcePath);

      const stagedBlocksPath = join(stagedSourceRoot, "blocks.jsonl");
      writeFileSync(stagedBlocksPath, `${readFileSync(stagedBlocksPath, "utf8")}\n`);
      expect(validate(receiptByRoute.get("SIM8")!, sim8Row, sim8Packet)).toThrow(exactError);
      copyFileSync(join(repoRoot, "raw/sources/better_buses_action_plan_2019/blocks.jsonl"), stagedBlocksPath);

      const acquiredChecksPath = join(rootDir, acquiredArtifact);
      const acquiredChecks = JSON.parse(readFileSync(acquiredChecksPath, "utf8")) as {
        sources: Record<string, unknown>[];
      };
      writeFileSync(acquiredChecksPath, JSON.stringify({ sources: acquiredChecks.sources.map((source) =>
        source.id === "better_buses_action_plan_2019"
          ? { ...source, raw_content_retained: true } : source) }));
      expect(validate(receiptByRoute.get("SIM8")!, sim8Row, sim8Packet)).toThrow(exactError);
      copyFileSync(join(repoRoot, acquiredArtifact), acquiredChecksPath);

      const priorPath = join(rootDir, priorArtifact);
      const priorLines = readFileSync(priorPath, "utf8").split(/\r?\n/u).filter(Boolean);
      writeFileSync(priorPath, `${priorLines.map((line) => {
        const prior = JSON.parse(line);
        return prior.receipt_id === "staten-island-acquisition:26a648388ad9f5f733555770"
          ? stableJson({ ...prior, claim_results: {
            ...prior.claim_results, operational_occurrence_identity_proved: true,
          } } as JsonValue)
          : line;
      }).join("\n")}\n`);
      expect(validate(receiptByRoute.get("SIM8")!, sim8Row, sim8Packet)).toThrow(exactError);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("freezes the 14-candidate positive-context package without promoting source gaps or target-free dossiers", () => {
    const repoRoot = join(import.meta.dir, "../../../..");
    const manifestArtifact =
      "data/quality/operational-reference/bus-lane-identity-packages/positive-context-nonauthorizing-v1.json";
    const manifest = JSON.parse(readFileSync(join(repoRoot, manifestArtifact), "utf8")) as {
      package_id: string;
      package_sha256: string;
      count: number;
      contracts: Array<{
        candidate_id: string;
        prior_artifact: string;
        evidence_sources: Array<{ acquired_records: Array<{ artifact: string }> }>;
      }>;
    };
    expect(manifest).toMatchObject({
      package_id: "bus-lane-positive-context-nonauthorizing-v1",
      package_sha256: "fc8ccc93d352b2b1d2c77691073c77bd3d0c40aa6db8804fe698a57bb406e4cc",
      count: 14,
    });
    const ledgerRows = readFileSync(join(repoRoot,
      "data/quality/operational-reference/bus-lane-identity-ledger.jsonl"), "utf8")
      .split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as BusLaneIdentityRow);
    const packetFiles = new Map(
      (manifest.contracts.map((contract) => contract.candidate_id)).map((candidateId) => {
        const row = ledgerRows.find((value) => value.candidate_id === candidateId)!;
        const packetId = createHash("sha256").update(stableJson({ ledger_id: row.ledger_id } as JsonValue))
          .digest("hex").slice(0, 24);
        return [candidateId, JSON.parse(readFileSync(join(repoRoot,
          `data/quality/acquisition/packets/bus-lane/packets/${packetId}.json`), "utf8")) as BusLaneResearchPacket];
      }),
    );
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-positive-context-"));
    const receiptDir = join(rootDir, "receipts");
    mkdirSync(receiptDir, { recursive: true });
    const artifacts = new Set([
      manifestArtifact,
      ...manifest.contracts.map((contract) => contract.prior_artifact),
      ...manifest.contracts.flatMap((contract) =>
        contract.evidence_sources.flatMap((source) =>
          source.acquired_records.map((record) => record.artifact))),
    ]);
    for (const artifact of artifacts) {
      const destination = join(rootDir, artifact);
      mkdirSync(join(destination, ".."), { recursive: true });
      copyFileSync(join(repoRoot, artifact), destination);
    }
    const validate = (
      draft: Record<string, unknown>,
      row: BusLaneIdentityRow,
      packet: BusLaneResearchPacket,
    ) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as JsonValue));
      return () => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir);
    };
    const exactError = "positive-context package contract does not match the exact candidate";
    const receipts: Record<string, unknown>[] = [];
    try {
      for (const contract of manifest.contracts) {
        const row = ledgerRows.find((value) => value.candidate_id === contract.candidate_id)!;
        const packet = packetFiles.get(contract.candidate_id)!;
        const expected = buildPositiveContextBindingReceiptDraft(row, packet, rootDir);
        const suffix = String(expected.receipt_id).split(":")[1];
        const receipt = JSON.parse(readFileSync(join(repoRoot,
          `data/quality/acquisition/receipts/bus-lane-review/${suffix}.json`), "utf8")) as Record<string, any>;
        receipts.push(receipt);
        expect(receipt).toEqual(expected);
        expect(packet.missing_binding).toBe("feature_extent");
        expect(packet.unresolved_bindings).toEqual([
          "attribution", "direction", "feature_extent", "phase", "traversal",
        ]);
        expect(packet.what_is_known.dossier_summary.target_row_count).toBe(0);
        expect(receipt).toMatchObject({
          authorizes_study: false,
          authorizes_cross_product: false,
          disposition: "binding_absent_after_search",
          positive_context: {
            candidate_exact_target_bound: false,
            candidate_direction_bound: false,
            candidate_feature_extent_bound: false,
            candidate_phase_bound: false,
            candidate_traversal_bound: false,
            candidate_occurrence_bound: false,
            context_only: true,
          },
          source_gap: {
            candidate_exact_target_dossier_row_count: 0,
            source_gap_authorizes_occurrence: false,
          },
          target: { named_sbs_routes: [] },
        });
        expect(validate(receipt, row, packet)).not.toThrow();
        expect(validate({ ...receipt, authorizes_study: true }, row, packet)).toThrow(exactError);
        expect(validate({
          ...receipt,
          positive_context: {
            ...receipt.positive_context,
            candidate_occurrence_bound: true,
          },
        }, row, packet)).toThrow(exactError);
        expect(validate({
          ...receipt,
          source_gap: {
            ...receipt.source_gap,
            source_gap_authorizes_occurrence: true,
          },
        }, row, packet)).toThrow(exactError);

        const targetGroups = packet.what_is_known.target_groups;
        const firstGroup = targetGroups[0]!;
        const firstFeature = firstGroup.feature_matches[0]!;
        const attributedGroups = [{
          ...firstGroup,
          feature_matches: [{ ...firstFeature, sbs_routes: [row.gtfs_route_id] },
            ...firstGroup.feature_matches.slice(1)],
        }, ...targetGroups.slice(1)];
        const attributedRow = { ...row, onset_evidence: {
          ...row.onset_evidence, target_groups: attributedGroups,
        } };
        const attributedPacket = { ...packet, what_is_known: {
          ...packet.what_is_known, target_groups: attributedGroups,
        } };
        expect(validate(receipt, attributedRow, attributedPacket)).toThrow();

        const targetDossier = row.dossier_refs.map((ref, index) =>
          index === 0 ? { ...ref, candidate_target_match: true } : ref);
        const dossierRow = { ...row, dossier_refs: targetDossier };
        const dossierPacket = { ...packet, what_is_known: {
          ...packet.what_is_known,
          dossier_refs: targetDossier,
          dossier_summary: { ...packet.what_is_known.dossier_summary, target_row_count: 1 },
        } };
        expect(validate(receipt, dossierRow, dossierPacket)).toThrow();
      }

      expect(receipts.filter((receipt: any) =>
        receipt.positive_context.prior_route_treatment_supported)).toHaveLength(10);
      expect(receipts.reduce((sum, receipt: any) =>
        sum + receipt.source_gap.unstaged_official_context_source_count, 0)).toBe(10);
      expect(manifest.contracts.some((contract) =>
        ["study-event-v2:8483f8b099d292e9d6883859",
          "study-event-v2:a1e55641545033df387b70b1",
          "study-event-v2:df8bb7f9438c48166f1ff8b9"].includes(contract.candidate_id))).toBe(false);

      const firstContract = manifest.contracts[0]!;
      const firstRow = ledgerRows.find((value) => value.candidate_id === firstContract.candidate_id)!;
      const firstPacket = packetFiles.get(firstContract.candidate_id)!;
      const firstReceipt = receipts[0]!;
      const reviewedRow = {
        ...firstRow,
        decision_id: `bus-lane-identity-decision:${String(firstReceipt.receipt_id).split(":")[1]}`,
        receipt_ids: [String(firstReceipt.receipt_id)],
        unresolved_bindings: ["attribution", "direction", "feature_extent", "phase", "traversal"],
        updated_at: "2026-07-23T23:00:00Z",
        verdict: "binding_absent_after_search",
        verdict_basis: `review:bus-lane-identity-decision:${String(firstReceipt.receipt_id).split(":")[1]}`,
      } as BusLaneIdentityRow;
      writeFileSync(join(receiptDir, "draft.json"), stableJson(firstReceipt as JsonValue));
      expect(() => validateReviewedReceiptRefs([reviewedRow], receiptDir)).not.toThrow();
      expect(validate(receipts[1]!, firstRow, firstPacket)).toThrow();

      const manifestPath = join(rootDir, manifestArtifact);
      writeFileSync(manifestPath, stableJson({
        ...manifest, count: 15,
      } as unknown as JsonValue));
      expect(validate(firstReceipt, firstRow, firstPacket)).toThrow(exactError);
      copyFileSync(join(repoRoot, manifestArtifact), manifestPath);

      const acquiredArtifact = firstContract.evidence_sources[0]!.acquired_records[0]!.artifact;
      const acquiredPath = join(rootDir, acquiredArtifact);
      const acquiredChecks = JSON.parse(readFileSync(acquiredPath, "utf8")) as {
        sources: Record<string, unknown>[];
      };
      writeFileSync(acquiredPath, stableJson({
        ...acquiredChecks,
        sources: acquiredChecks.sources.map((source) =>
          source.id === "e149_cb1" ? { ...source, retrieval_status: "not_retrieved" } : source),
      } as JsonValue));
      expect(validate(firstReceipt, firstRow, firstPacket)).toThrow(exactError);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("freezes the 25-candidate pure target-absence package as nonauthorizing absence", () => {
    const repoRoot = join(import.meta.dir, "../../../..");
    const manifestArtifact =
      "data/quality/operational-reference/bus-lane-identity-packages/pure-target-absence-v1.json";
    const manifest = JSON.parse(readFileSync(join(repoRoot, manifestArtifact), "utf8")) as {
      package_id: string;
      package_sha256: string;
      count: number;
      contracts: Array<{
        candidate_id: string;
        prior_artifact: string;
      }>;
    };
    expect(manifest).toMatchObject({
      package_id: "bus-lane-pure-target-absence-v1",
      package_sha256: "6cdacc6a94e78b408213e7d744826b859b181452c4acf867d26233d67a7fb161",
      count: 25,
    });
    const ledgerRows = readFileSync(join(repoRoot,
      "data/quality/operational-reference/bus-lane-identity-ledger.jsonl"), "utf8")
      .split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as BusLaneIdentityRow);
    const packetFiles = new Map(
      manifest.contracts.map((contract) => {
        const row = ledgerRows.find((value) => value.candidate_id === contract.candidate_id)!;
        const packetId = createHash("sha256").update(stableJson({ ledger_id: row.ledger_id } as JsonValue))
          .digest("hex").slice(0, 24);
        return [contract.candidate_id, JSON.parse(readFileSync(join(repoRoot,
          `data/quality/acquisition/packets/bus-lane/packets/${packetId}.json`), "utf8")) as BusLaneResearchPacket];
      }),
    );
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-pure-target-absence-"));
    const receiptDir = join(rootDir, "receipts");
    mkdirSync(receiptDir, { recursive: true });
    for (const artifact of new Set([
      manifestArtifact,
      ...manifest.contracts.map((contract) => contract.prior_artifact),
    ])) {
      const destination = join(rootDir, artifact);
      mkdirSync(join(destination, ".."), { recursive: true });
      copyFileSync(join(repoRoot, artifact), destination);
    }
    const validate = (
      draft: Record<string, unknown>,
      row: BusLaneIdentityRow,
      packet: BusLaneResearchPacket,
    ) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as JsonValue));
      return () => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir);
    };
    const exactError = "pure-target-absence package contract does not match the exact candidate";
    const receipts: Record<string, any>[] = [];
    try {
      for (const contract of manifest.contracts) {
        const row = ledgerRows.find((value) => value.candidate_id === contract.candidate_id)!;
        const packet = packetFiles.get(contract.candidate_id)!;
        const expected = buildPureTargetAbsenceBindingReceiptDraft(row, packet, rootDir);
        const suffix = String(expected.receipt_id).split(":")[1];
        const receipt = JSON.parse(readFileSync(join(repoRoot,
          `data/quality/acquisition/receipts/bus-lane-review/${suffix}.json`), "utf8")) as Record<string, any>;
        receipts.push(receipt);
        expect(receipt).toEqual(expected);
        expect(packet.missing_binding).toBe("feature_extent");
        expect(packet.unresolved_bindings).toEqual([
          "attribution", "direction", "feature_extent", "phase", "traversal",
        ]);
        expect(packet.what_is_known.dossier_summary.target_row_count).toBe(0);
        expect(receipt).toMatchObject({
          authorizes_study: false,
          authorizes_cross_product: false,
          disposition: "binding_absent_after_search",
          absence_contract: {
            candidate_exact_target_bound: false,
            candidate_direction_bound: false,
            candidate_feature_extent_bound: false,
            candidate_phase_bound: false,
            candidate_traversal_bound: false,
            candidate_occurrence_bound: false,
            candidate_named_target: false,
            prior_route_treatment_supported: false,
            nonexclusive_search_result: true,
            not_a_refutation: true,
          },
          source_gap: {
            candidate_exact_target_dossier_row_count: 0,
            raw_source_content_used_to_authorize: false,
            source_gap_authorizes_occurrence: false,
          },
          target: { named_sbs_routes: [] },
        });
        expect(validate(receipt, row, packet)).not.toThrow();
        expect(validate({ ...receipt, authorizes_study: true }, row, packet)).toThrow(exactError);
        expect(validate({
          ...receipt,
          absence_contract: {
            ...receipt.absence_contract,
            candidate_occurrence_bound: true,
          },
        }, row, packet)).toThrow(exactError);
        expect(validate({
          ...receipt,
          source_gap: {
            ...receipt.source_gap,
            source_gap_authorizes_occurrence: true,
          },
        }, row, packet)).toThrow(exactError);
      }

      expect(receipts).toHaveLength(25);
      expect(receipts.filter((receipt) =>
        receipt.absence_contract.prior_route_treatment_supported)).toHaveLength(0);

      const firstContract = manifest.contracts[0]!;
      const firstRow = ledgerRows.find((value) => value.candidate_id === firstContract.candidate_id)!;
      const firstPacket = packetFiles.get(firstContract.candidate_id)!;
      const firstReceipt = receipts[0]!;
      const reviewedRow = {
        ...firstRow,
        decision_id: `bus-lane-identity-decision:${String(firstReceipt.receipt_id).split(":")[1]}`,
        receipt_ids: [String(firstReceipt.receipt_id)],
        unresolved_bindings: ["attribution", "direction", "feature_extent", "phase", "traversal"],
        updated_at: "2026-07-23T23:00:00Z",
        verdict: "binding_absent_after_search",
        verdict_basis: `review:bus-lane-identity-decision:${String(firstReceipt.receipt_id).split(":")[1]}`,
      } as BusLaneIdentityRow;
      writeFileSync(join(receiptDir, "draft.json"), stableJson(firstReceipt as JsonValue));
      expect(() => validateReviewedReceiptRefs([reviewedRow], receiptDir)).not.toThrow();
      expect(validate(receipts[1]!, firstRow, firstPacket)).toThrow();

      const targetGroups = firstPacket.what_is_known.target_groups;
      const firstGroup = targetGroups[0]!;
      const firstFeature = firstGroup.feature_matches[0]!;
      const attributedGroups = [{
        ...firstGroup,
        feature_matches: [{ ...firstFeature, sbs_routes: [firstRow.gtfs_route_id] },
          ...firstGroup.feature_matches.slice(1)],
      }, ...targetGroups.slice(1)];
      const attributedRow = { ...firstRow, onset_evidence: {
        ...firstRow.onset_evidence, target_groups: attributedGroups,
      } };
      const attributedPacket = { ...firstPacket, what_is_known: {
        ...firstPacket.what_is_known, target_groups: attributedGroups,
      } };
      expect(validate(firstReceipt, attributedRow, attributedPacket)).toThrow();

      const targetDossier = firstRow.dossier_refs.map((ref, index) =>
        index === 0 ? { ...ref, candidate_target_match: true } : ref);
      const dossierRow = { ...firstRow, dossier_refs: targetDossier };
      const dossierPacket = { ...firstPacket, what_is_known: {
        ...firstPacket.what_is_known,
        dossier_refs: targetDossier,
        dossier_summary: { ...firstPacket.what_is_known.dossier_summary, target_row_count: 1 },
      } };
      expect(validate(firstReceipt, dossierRow, dossierPacket)).toThrow();

      const manifestPath = join(rootDir, manifestArtifact);
      writeFileSync(manifestPath, stableJson({
        ...manifest, count: 26,
      } as unknown as JsonValue));
      expect(validate(firstReceipt, firstRow, firstPacket)).toThrow(exactError);
      copyFileSync(join(repoRoot, manifestArtifact), manifestPath);

      const priorPath = join(rootDir, firstContract.prior_artifact);
      const priorLines = readFileSync(priorPath, "utf8").split(/\r?\n/u).filter(Boolean);
      writeFileSync(priorPath, `${priorLines.map((line) => {
        const prior = JSON.parse(line);
        return prior.receipt_id === firstReceipt.prior_receipt.receipt_id
          ? stableJson({ ...prior, claim_results: {
            ...prior.claim_results, exact_route_treatment_binding_proved: true,
          } } as JsonValue)
          : line;
      }).join("\n")}\n`);
      expect(validate(firstReceipt, firstRow, firstPacket)).toThrow(exactError);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("freezes 40 cross-corridor candidates without absorbing the occurrence-potential batch", () => {
    const repoRoot = join(import.meta.dir, "../../../..");
    const manifestArtifact =
      "data/quality/operational-reference/bus-lane-identity-packages/multi-corridor-absence-v1.json";
    const manifest = JSON.parse(readFileSync(join(repoRoot, manifestArtifact), "utf8")) as {
      package_id: string;
      package_sha256: string;
      count: number;
      excluded_occurrence_potential_batch_id: string;
      contracts: Array<{
        batch_id: string;
        candidate_id: string;
        prior_artifact: string;
      }>;
    };
    expect(manifest).toMatchObject({
      package_id: "bus-lane-multi-corridor-absence-v1",
      package_sha256: "85ed09e9e578ecf4596e4737a92250804596d281cd0b29e51f354f231fdef6f6",
      excluded_occurrence_potential_batch_id:
        "bus-lane-multi-corridor-2019-09-16-part-01",
      count: 40,
    });
    expect(manifest.contracts.some((contract) =>
      contract.batch_id === manifest.excluded_occurrence_potential_batch_id)).toBe(false);
    const excludedCandidateIds = new Set([
      "study-event-v2:80a03a343ddc8022ecb8a9c1",
      "study-event-v2:8483f8b099d292e9d6883859",
      "study-event-v2:a1e55641545033df387b70b1",
      "study-event-v2:3d294e2558b6464db48e92e8",
      "study-event-v2:df8bb7f9438c48166f1ff8b9",
      "study-event-v2:a77578d2722643ec0f1ece2d",
    ]);
    expect(manifest.contracts.some((contract) =>
      excludedCandidateIds.has(contract.candidate_id))).toBe(false);
    const ledgerRows = readFileSync(join(repoRoot,
      "data/quality/operational-reference/bus-lane-identity-ledger.jsonl"), "utf8")
      .split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as BusLaneIdentityRow);
    const packetFiles = new Map(
      manifest.contracts.map((contract) => {
        const row = ledgerRows.find((value) => value.candidate_id === contract.candidate_id)!;
        const packetId = createHash("sha256").update(stableJson({ ledger_id: row.ledger_id } as JsonValue))
          .digest("hex").slice(0, 24);
        return [contract.candidate_id, JSON.parse(readFileSync(join(repoRoot,
          `data/quality/acquisition/packets/bus-lane/packets/${packetId}.json`), "utf8")) as BusLaneResearchPacket];
      }),
    );
    const rootDir = mkdtempSync(join(tmpdir(), "bus-lane-multi-corridor-absence-"));
    const receiptDir = join(rootDir, "receipts");
    mkdirSync(receiptDir, { recursive: true });
    for (const artifact of new Set([
      manifestArtifact,
      ...manifest.contracts.map((contract) => contract.prior_artifact),
    ])) {
      const destination = join(rootDir, artifact);
      mkdirSync(join(destination, ".."), { recursive: true });
      copyFileSync(join(repoRoot, artifact), destination);
    }
    const validate = (
      draft: Record<string, unknown>,
      row: BusLaneIdentityRow,
      packet: BusLaneResearchPacket,
    ) => {
      writeFileSync(join(receiptDir, "draft.json"), stableJson(draft as JsonValue));
      return () => validateBindingReceiptDrafts([row], [packet], receiptDir, rootDir);
    };
    const exactError = "multi-corridor-absence package contract does not match the exact candidate";
    const receipts: Record<string, any>[] = [];
    try {
      for (const contract of manifest.contracts) {
        const row = ledgerRows.find((value) => value.candidate_id === contract.candidate_id)!;
        const packet = packetFiles.get(contract.candidate_id)!;
        const expected = buildMultiCorridorAbsenceBindingReceiptDraft(row, packet, rootDir);
        const suffix = String(expected.receipt_id).split(":")[1];
        const receipt = JSON.parse(readFileSync(join(repoRoot,
          `data/quality/acquisition/receipts/bus-lane-review/${suffix}.json`), "utf8")) as Record<string, any>;
        receipts.push(receipt);
        expect(receipt).toEqual(expected);
        expect(packet.missing_binding).toBe("feature_extent");
        expect(packet.unresolved_bindings).toEqual([
          "attribution", "direction", "feature_extent", "phase", "traversal",
        ]);
        expect(packet.what_is_known.dossier_summary.target_row_count).toBe(0);
        expect(receipt).toMatchObject({
          authorizes_study: false,
          authorizes_cross_product: false,
          disposition: "binding_absent_after_search",
          absence_contract: {
            candidate_exact_target_bound: false,
            candidate_direction_bound: false,
            candidate_feature_extent_bound: false,
            candidate_phase_bound: false,
            candidate_traversal_bound: false,
            candidate_occurrence_bound: false,
            candidate_named_target: false,
            prior_route_treatment_supported: false,
            nonexclusive_search_result: true,
            not_a_refutation: true,
          },
          source_gap: {
            candidate_exact_target_dossier_row_count: 0,
            raw_source_content_used_to_authorize: false,
            source_gap_authorizes_occurrence: false,
          },
        });
        const normalizedCandidate = row.gtfs_route_id.endsWith("+")
          ? row.gtfs_route_id.slice(0, -1)
          : row.gtfs_route_id;
        expect(receipt.target.named_sbs_routes).not.toContain(row.gtfs_route_id);
        expect(receipt.target.named_sbs_routes).not.toContain(normalizedCandidate);
        expect(validate(receipt, row, packet)).not.toThrow();
      }

      expect(receipts).toHaveLength(40);
      expect(receipts.filter((receipt) =>
        receipt.absence_contract.prior_route_treatment_supported)).toHaveLength(0);
      const firstContract = manifest.contracts[0]!;
      const firstRow = ledgerRows.find((value) => value.candidate_id === firstContract.candidate_id)!;
      const firstPacket = packetFiles.get(firstContract.candidate_id)!;
      const firstReceipt = receipts[0]!;
      expect(validate({ ...firstReceipt, authorizes_study: true },
        firstRow, firstPacket)).toThrow(exactError);
      expect(validate({
        ...firstReceipt,
        absence_contract: {
          ...firstReceipt.absence_contract,
          candidate_occurrence_bound: true,
        },
      }, firstRow, firstPacket)).toThrow(exactError);
      expect(validate({
        ...firstReceipt,
        source_gap: {
          ...firstReceipt.source_gap,
          source_gap_authorizes_occurrence: true,
        },
      }, firstRow, firstPacket)).toThrow(exactError);
      expect(validate(receipts[1]!, firstRow, firstPacket)).toThrow();

      const targetGroups = firstPacket.what_is_known.target_groups;
      const firstGroup = targetGroups[0]!;
      const firstFeature = firstGroup.feature_matches[0]!;
      const attributedGroups = [{
        ...firstGroup,
        feature_matches: [{ ...firstFeature, sbs_routes: [firstRow.gtfs_route_id] },
          ...firstGroup.feature_matches.slice(1)],
      }, ...targetGroups.slice(1)];
      const attributedRow = { ...firstRow, onset_evidence: {
        ...firstRow.onset_evidence, target_groups: attributedGroups,
      } };
      const attributedPacket = { ...firstPacket, what_is_known: {
        ...firstPacket.what_is_known, target_groups: attributedGroups,
      } };
      expect(validate(firstReceipt, attributedRow, attributedPacket)).toThrow();

      const manifestPath = join(rootDir, manifestArtifact);
      writeFileSync(manifestPath, stableJson({
        ...manifest, count: 41,
      } as unknown as JsonValue));
      expect(validate(firstReceipt, firstRow, firstPacket)).toThrow(exactError);
      copyFileSync(join(repoRoot, manifestArtifact), manifestPath);

      const priorPath = join(rootDir, firstContract.prior_artifact);
      const priorLines = readFileSync(priorPath, "utf8").split(/\r?\n/u).filter(Boolean);
      writeFileSync(priorPath, `${priorLines.map((line) => {
        const prior = JSON.parse(line);
        return prior.receipt_id === firstReceipt.prior_receipt.receipt_id
          ? stableJson({ ...prior, claim_results: {
            ...prior.claim_results, exact_route_treatment_binding_proved: true,
          } } as JsonValue)
          : line;
      }).join("\n")}\n`);
      expect(validate(firstReceipt, firstRow, firstPacket)).toThrow(exactError);

      const reviewedRow = {
        ...firstRow,
        decision_id: `bus-lane-identity-decision:${String(firstReceipt.receipt_id).split(":")[1]}`,
        receipt_ids: [String(firstReceipt.receipt_id)],
        unresolved_bindings: ["attribution", "direction", "feature_extent", "phase", "traversal"],
        updated_at: "2026-07-23T23:00:00Z",
        verdict: "binding_absent_after_search",
        verdict_basis: `review:bus-lane-identity-decision:${String(firstReceipt.receipt_id).split(":")[1]}`,
      } as BusLaneIdentityRow;
      writeFileSync(join(receiptDir, "draft.json"), stableJson(firstReceipt as JsonValue));
      expect(() => validateReviewedReceiptRefs([reviewedRow], receiptDir)).not.toThrow();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
