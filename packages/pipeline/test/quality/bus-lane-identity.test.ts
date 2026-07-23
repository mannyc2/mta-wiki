import { describe, expect, it } from "bun:test";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  buildBusLaneIdentityLedger,
  buildBusLaneResearchPackets,
  candidateLaneTargets,
  normalizeOpenDateToken,
  parseBusLaneIdentityDecision,
  validateOccurrenceCreatedRows,
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
    const occurrence = { occurrence_id: "occurrence-ok", review_state: "approved", occurrence_review_decision_id: "review-ok" };
    const occurrenceDecision = { occurrence_id: "occurrence-ok", review_state: "approved", decision_id: "review-ok" };
    expect(() => validateOccurrenceCreatedRows(created, [occurrence], [occurrenceDecision])).not.toThrow();
    expect(() => validateOccurrenceCreatedRows(created, [], [occurrenceDecision])).toThrow("missing occurrence");
    expect(() => validateOccurrenceCreatedRows(created, [occurrence], [])).toThrow("no accepted occurrence-review decision");
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
    expect(new Set(packets.batches.flatMap((batch) => batch.packet_ids)).size).toBe(27);
  });

  it("rejects absent-after-search decisions without a receipt", () => {
    expect(() => parseBusLaneIdentityDecision({
      schema_version: 1, contract_id: "bus-lane-identity-v1", decision_id: "bad", ledger_id: "row",
      candidate_id: "candidate", candidate_fingerprint: "f".repeat(64), verdict: "onset_absent_after_search",
      occurrence_id: null, receipt_ids: [], reviewed_at: "2026-07-23", reviewed_by: "reviewer",
      rationale: "No source found.", authorizes_study: false, authorizes_cross_product: false,
    })).toThrow("requires at least one receipt");
  });
});
