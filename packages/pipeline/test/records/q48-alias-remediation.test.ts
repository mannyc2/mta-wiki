import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "../../../core/src/paths";
import { identityOverrideTarget } from "../../../db/src/identity";
import { q48AliasMergeContent } from "../../../../scripts/remediate-q48-alias-ambiguity";
import { readSemanticCorrections, withSemanticCorrections } from "../../src/records/semantic-corrections";
import type { MtaCanonicalRecord } from "../../../db/src/types";

describe("Q48 lifecycle alias remediation", () => {
  it("resolves the bare current-number alias while preserving the historical lifecycle split", () => {
    const mergesPath = join(repoRoot, "data", "identity-overrides", "merges.json");
    expect(readFileSync(mergesPath, "utf8")).toBe(q48AliasMergeContent());
    expect(identityOverrideTarget("route", "route_q48")).toBe("route_q48-glen-oaks-2025");

    const doNotMerge = JSON.parse(
      readFileSync(join(repoRoot, "data", "identity-overrides", "do-not-merge.json"), "utf8"),
    ) as { pairs: { route: Array<{ record_ids: string[] }> } };
    expect(doNotMerge.pairs.route.some((decision) =>
      decision.record_ids.includes("route_q48-glen-oaks-2025") &&
      decision.record_ids.includes("route_q48-serves-lga-2011"))).toBe(true);

    const review = JSON.parse(readFileSync(join(
      repoRoot,
      "data",
      "relationship-integrity",
      "dispositions",
      "v1",
      "routes",
      "review.json",
    ), "utf8")) as {
      non_gtfs_dispositions: Record<string, { study_projectable: boolean; disposition: string }>;
    };
    expect(review.non_gtfs_dispositions["route_q48-serves-lga-2011"]).toMatchObject({
      disposition: "historical_retired",
      study_projectable: false,
    });

    const historical: MtaCanonicalRecord = {
      record_id: "route_q48-serves-lga-2011",
      record_aliases: ["route_q48"],
      record_kind: "route",
      source_id: "fixture",
      source_ids: ["fixture"],
      local_observation_id: "route_q48_serves_lga_2011",
      local_observation_ids: ["route_q48_serves_lga_2011"],
      display_name: "Historical Q48",
      payload: { route_id: "Q48" },
      evidence_refs: [],
      submission_ids: ["sub_fixture"],
      truth_status: "source_stated",
      review_state: "unreviewed",
      generated_at: "2026-07-15T00:00:00Z",
    };
    const correction = readSemanticCorrections().filter((entry) =>
      entry.correction_id === "relationship-integrity-q48-historical-alias-owner-20260715");
    expect(correction).toHaveLength(1);
    const corrected = withSemanticCorrections([historical], correction);
    expect(corrected.issues).toEqual([]);
    expect(corrected.records[0]?.record_aliases).toBeUndefined();

    historical.record_aliases = ["route_q48", "route_q48-glen-oaks-2025"];
    const rebuilt = withSemanticCorrections([historical], correction);
    expect(rebuilt.issues).toEqual([]);
    expect(rebuilt.records[0]?.record_aliases).toBeUndefined();
  });
});
