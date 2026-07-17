import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  loadOperationalAnchorReviewDecisions,
  operationalAnchorReviewSnapshotJson,
  validateOperationalAnchorReviewDecisions,
} from "@mta-wiki/pipeline/materialize/operational-anchor-review";
import { readCanonicalRecordsFromJsonl } from "@mta-wiki/pipeline/materialize/canonical-read";
import { computeOperationalAnchors } from "@mta-wiki/pipeline/materialize/operational-anchors";
import type { RouteAnchorRow } from "@mta-wiki/pipeline/materialize/route-anchors";

function frozenRouteAnchors(): RouteAnchorRow[] {
  const content = readFileSync(`${repoRoot}/data/exports/releases/v1-rc5/route_anchors.jsonl`, "utf8");
  return content
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as RouteAnchorRow);
}

describe("accepted operational-anchor review corpus", () => {
  it("rejects malformed decision artifacts before canonical application", () => {
    const dir = mkdtempSync(join(tmpdir(), "mta-operational-anchor-review-"));
    try {
      writeFileSync(join(dir, "malformed.json"), '{"schema_version":1,"unexpected":true}\n', "utf8");
      expect(() => loadOperationalAnchorReviewDecisions(dir)).toThrow("unknown field(s): unexpected");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validates every exact binding and produces only complete, official, eligible reviewed rows", () => {
    const records = readCanonicalRecordsFromJsonl();
    const decisions = loadOperationalAnchorReviewDecisions();
    const validation = validateOperationalAnchorReviewDecisions(decisions, records);
    const rows = computeOperationalAnchors(records, frozenRouteAnchors(), { reviewDecisions: decisions });
    const reviewedRows = rows.filter((row) => row.anchor_id.startsWith("operational-reviewed:"));

    expect(validation.quarantined).toEqual([]);
    expect(validation.accepted.map((decision) => decision.decision_id)).toEqual([
      "ace-2024-06-20-bx36",
      "ace-2025-09-15-bx20",
      "ace-2025-09-15-bx3",
      "ace-2025-09-15-bx7",
      "ace-2025-09-15-q6",
      "b12-route-improvement-initiative-2024-01",
      "m15-2010-10-10-off-board-fare",
      "m86-2015-07-13-off-board-fare",
      "m86-2015-07-13-real-time-information",
    ]);
    expect(reviewedRows).toHaveLength(validation.accepted.length);
    expect(reviewedRows.every((row) => row.study_eligible)).toBe(true);
    expect(reviewedRows.every((row) => row.source_authority === "official_public_agency")).toBe(true);
    expect(reviewedRows.every((row) => Object.values(row.evidence_coverage).every(Boolean))).toBe(true);
    expect(reviewedRows.map((row) => [row.gtfs_route_ids, row.treatment_families, row.candidate_operational_date_normalized])).toEqual([
      [["BX36"], ["automated_bus_lane_enforcement"], "2024-06-20"],
      [["BX20"], ["automated_bus_lane_enforcement"], "2025-09-15"],
      [["BX3"], ["automated_bus_lane_enforcement"], "2025-09-15"],
      [["BX7"], ["automated_bus_lane_enforcement"], "2025-09-15"],
      [["Q06"], ["automated_bus_lane_enforcement"], "2025-09-15"],
      [["B12"], ["service_pattern"], "2024-01"],
      [["M15+"], ["fare_collection"], "2010-10-10"],
      [["M86+"], ["fare_collection"], "2015-07-13"],
      [["M86+"], ["signage_and_markings"], "2015-07-13"],
    ]);

    const snapshotJson = operationalAnchorReviewSnapshotJson(validation.accepted);
    expect(snapshotJson).toBe(operationalAnchorReviewSnapshotJson([...validation.accepted].reverse()));
    const snapshot = JSON.parse(snapshotJson) as {
      snapshot_version: number;
      decision_schema_version: number;
      decision_count: number;
      decisions: Array<{ decision_id: string; artifact_path?: string }>;
    };
    expect(snapshot.snapshot_version).toBe(1);
    expect(snapshot.decision_schema_version).toBe(1);
    expect(snapshot.decision_count).toBe(validation.accepted.length);
    expect(snapshot.decisions.map((decision) => decision.decision_id)).toEqual(
      validation.accepted.map((decision) => decision.decision_id),
    );
    expect(snapshot.decisions.every((decision) => decision.artifact_path === undefined)).toBe(true);
  });

  it("rejects a bundle container from the atomic review path", () => {
    const records = readCanonicalRecordsFromJsonl();
    const decision = loadOperationalAnchorReviewDecisions()[0]!;
    const patchedRecords = records.map((record) =>
      record.record_id === decision.treatment_record_id
        ? {
            ...record,
            payload: { ...record.payload, treatment_scope_kind: "bundle_container" },
          }
        : record,
    );

    const validation = validateOperationalAnchorReviewDecisions([decision], patchedRecords);

    expect(validation.accepted).toEqual([]);
    expect(validation.quarantined).toHaveLength(1);
    expect(validation.quarantined[0]?.reasons).toContain(
      `treatment ${decision.treatment_record_id} is a bundle container and cannot be accepted as an atomic anchor`,
    );
  });
});
