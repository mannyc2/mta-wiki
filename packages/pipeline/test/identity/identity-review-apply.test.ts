import { describe, expect, it } from "bun:test";
import { applyIdentityReviewDecisions, validateIdentityReviewAcceptedArtifacts } from "@mta-wiki/pipeline/identity/identity-review-apply";

describe("identity review accepted artifact handling", () => {
  it("validates the current accepted and quarantine staging format", () => {
    const report = validateIdentityReviewAcceptedArtifacts();

    expect(report.issues).toEqual([]);
    expect(report.counts).toEqual({
      accepted: 108,
      corrected: 5,
      quarantined: 41,
      total: 154,
    });
  });

  it("accounts for accepted merges and suppressions without applying quarantined route-plus clusters", () => {
    const report = applyIdentityReviewDecisions({ dryRun: true });
    const aliases = [...report.alias_additions, ...report.aliases_already_present];
    const suppressions = [...report.do_not_merge_additions, ...report.do_not_merge_already_present];

    expect(report.wrote).toBe(false);
    expect(report.validation_issues).toEqual([]);
    expect(report.conflicts).toEqual([]);
    expect(report.selected_decision_count).toBe(113);
    expect(report.quarantined_decision_count).toBe(41);
    expect(aliases).toHaveLength(37);
    expect(suppressions).toHaveLength(236);
    expect(aliases).toContainEqual(
      expect.objectContaining({
        kind: "route",
        alias: "route_bx6-sbs-addendum-update",
        target: "route_bx6-sbs",
        cluster_id: "route_cluster_003",
      }),
    );
    expect(aliases).toContainEqual(
      expect.objectContaining({
        kind: "route",
        alias: "route_bx34-addendum-update",
        target: "route_bx34",
        cluster_id: "route_cluster_007",
      }),
    );
    expect(suppressions).toContainEqual(
      expect.objectContaining({
        kind: "entity",
        record_ids: ["entity_nyc-dot", "entity_nycdot-commissioner-mike-flynn"],
        cluster_id: "entity_cluster_005",
      }),
    );
    expect(suppressions).toContainEqual(
      expect.objectContaining({
        kind: "route",
        record_ids: ["route_able-m15-sbs", "route_m15-reference"],
        cluster_id: "route_cluster_001",
      }),
    );
    expect(aliases.some((entry) => entry.cluster_id === "route_cluster_001")).toBe(false);
    expect(suppressions).toContainEqual(
      expect.objectContaining({
        kind: "entity",
        record_ids: ["entity_mta-2012", "entity_mta-nyct"],
        cluster_id: "entity_cluster_001-w2-2026-06-10",
      }),
    );
    expect(suppressions).toContainEqual(
      expect.objectContaining({
        kind: "route",
        record_ids: ["route_m15-local-2010-09-14", "route_m15-sbs"],
        cluster_id: "route_cluster_001-w2-2026-06-10",
      }),
    );
    expect(aliases).toContainEqual(
      expect.objectContaining({
        kind: "project",
        alias: "project_first-second-ave-sbs-cac3",
        target: "project_first-second-ave-sbs",
        cluster_id: "project_cluster_001-w2-2026-06-10",
      }),
    );
  });
});
