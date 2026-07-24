import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { buildMemberExtentLedgers } from "../../src/quality/member-extent-ledger";
import { buildPlan040ExemplarDecisionDraft } from "../../src/quality/plan-040-exemplar-decisions";
import type { MemberExtentRow } from "../../src/quality/study-readiness-v1";

function currentExemplars(): MemberExtentRow[] {
  const path = join(
    repoRoot,
    "data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl",
  );
  return readFileSync(path, "utf8").trim().split("\n")
    .map((line) => JSON.parse(line) as MemberExtentRow)
    .filter((row) => row.gtfs_route_id === "Q61" || row.gtfs_route_id === "QM44" || row.gtfs_route_id === "QM64");
}

describe("Plan 040 exact-positive exemplar decision draft", () => {
  it("covers all 11 exact candidates with validator-clean spatial and grain decisions", () => {
    const draft = buildPlan040ExemplarDecisionDraft();
    expect(draft.candidate_count).toBe(11);
    expect(draft.extent_decision_count).toBe(10);
    expect(draft.grain_decision_count).toBe(11);
    expect(draft.spatial_resolution_distribution).toEqual({
      bounded_segment: 5,
      route_wide: 3,
      stop_set: 3,
    });
    expect(draft.authorizes_occurrence).toBe(false);
    expect(draft.authorizes_study).toBe(false);
    expect(draft.authorizes_cross_product).toBe(false);

    const result = buildMemberExtentLedgers({
      companionRows: currentExemplars(),
      extentDecisions: draft.extent_decisions,
      grainDecisions: draft.grain_decisions,
    });
    expect(result.extentRows.every((row) => row.verdict.startsWith("resolved:"))).toBe(true);
    expect(result.grainRows.every((row) => row.verdict === "resolved")).toBe(true);
  });

  it("encodes Q61 connection and Q15/Q34 lineage as exact structured segments", () => {
    const draft = buildPlan040ExemplarDecisionDraft();
    const q61 = draft.grain_decisions.filter((decision) => decision.gtfs_route_id === "Q61");
    expect(q61).toHaveLength(3);
    const predecessors = new Set(q61.flatMap((decision) =>
      decision.lineage_segments.map((segment) => segment.predecessor_gtfs_route_id)));
    expect([...predecessors].sort()).toEqual(["Q15", "Q34"]);
    expect(q61.every((decision) =>
      decision.lineage_segments.every((segment) =>
        segment.boundary_stop_ids.length === 2 && segment.shared_stop_ids.length >= 3))).toBe(true);
    const connection = draft.extent_decisions.find((decision) =>
      decision.treatment_record_id === "treatment_q61-beechhurst-flushing-connection-2025");
    expect(connection?.resolution).toBe("bounded_segment");
    expect(connection?.components.map((component) => component.identifiers)).toEqual([
      ["501098", "501175", "502719", "552928", "553320", "700984"],
      ["501134", "501172", "501196", "502736", "551146", "552927", "700983"],
    ]);
  });

  it("keeps QM44 frequency in the AM direction subset and closes the complete removed-stop set", () => {
    const draft = buildPlan040ExemplarDecisionDraft();
    const frequency = draft.grain_decisions.find((decision) =>
      decision.treatment_record_id === "treatment_qm44-frequency-decrease-2025");
    expect(frequency?.service_scope).toMatchObject({
      kind: "periods",
      periods: ["am_peak"],
      directions: ["1"],
    });
    const removal = draft.extent_decisions.find((decision) =>
      decision.treatment_record_id === "treatment_qm44-stop-removal-2025");
    expect(removal?.components[0]?.identifiers).toEqual([
      "450004", "551733", "551812", "551816", "551820", "551821", "551848",
    ]);
  });

  it("encodes QM64 Elmont, Midtown, removal, frequency, and X64 lineage without inferred identity", () => {
    const draft = buildPlan040ExemplarDecisionDraft();
    const elmont = draft.extent_decisions.find((decision) =>
      decision.treatment_record_id === "treatment_qm64-elmont-extension-2025");
    expect(elmont?.components.map((component) => component.identifiers)).toEqual([
      ["700904", "904026"],
      ["500403", "700752", "700905"],
    ]);
    const additions = draft.extent_decisions.find((decision) =>
      decision.treatment_record_id === "treatment_qm64-midtown-stop-additions-2025");
    expect(additions?.components[0]?.identifiers).toEqual([
      "402144", "402146", "404295", "404297", "404298", "404300", "404877", "450041", "904045",
    ]);
    const frequency = draft.grain_decisions.find((decision) =>
      decision.treatment_record_id === "treatment_qm64-frequency-decrease-2025");
    expect(frequency?.service_scope).toMatchObject({
      kind: "periods",
      periods: ["am_peak"],
      directions: ["1"],
    });
    const qm64Grains = draft.grain_decisions.filter((decision) => decision.gtfs_route_id === "QM64");
    expect(qm64Grains).toHaveLength(6);
    expect(qm64Grains.every((decision) =>
      decision.lineage_segments.length === 2 &&
      decision.lineage_segments.every((segment) =>
        segment.predecessor_gtfs_route_id === "X64" &&
        segment.successor_gtfs_route_id === "QM64"))).toBe(true);
    expect(JSON.stringify(draft)).not.toContain("proximity");
  });

  it("replays byte-identically from frozen evidence", () => {
    expect(buildPlan040ExemplarDecisionDraft()).toEqual(buildPlan040ExemplarDecisionDraft());
  });
});
