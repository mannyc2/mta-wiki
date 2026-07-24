import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import type { JsonValue } from "../../../db/src/types";
import type { HistoricalFullStopPattern } from "../../src/reference/historical-full-stop";
import { loadMemberGrainDecisions } from "../../src/quality/member-grain-decisions";
import {
  loadMemberExtentAbsenceReceipts,
  loadMemberExtentDecisions,
} from "../../src/quality/member-extent-ledger";
import type {
  Plan040AcquisitionCandidate,
} from "../../src/quality/plan040-qbnr-stop-removal-acquisition";
import {
  acceptPlan040Package2DecisionPackage,
  buildPlan040Package2AcceptedArtifacts,
  buildPlan040Package2CandidateEvidence,
  buildPlan040Package2GateAndAcceptance,
  extractPlan040Package2PdfStatements,
  normalizePlan040Package2StopName,
  PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2_ABSENCE_RECEIPT_PATH,
  PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2_ACCEPTANCE_PATH,
  PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2_EXTENT_DECISIONS_PATH,
  PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2_GATE_PATH,
  PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2_GRAIN_DECISIONS_PATH,
  plan040Package2ReplayHash,
  type Plan040Package2Draft,
  type Plan040Package2ScheduleSlice,
  validatePlan040Package2GateAndAcceptance,
} from "../../src/quality/plan040-qbnr-stop-removal-package2";
import { extentDecisionKey } from "../../src/quality/study-readiness-v1";

const artifactPath =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-2-decision-draft-v1.json";
const readDraft = (): Plan040Package2Draft =>
  JSON.parse(readFileSync(artifactPath, "utf8")) as Plan040Package2Draft;
type GateAndAcceptance = ReturnType<typeof buildPlan040Package2GateAndAcceptance>;

function readJsonl(path: string): any[] {
  return readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

function distribution(rows: any[], field: string): Record<string, number> {
  return Object.fromEntries(
    [...new Set(rows.map((row) => String(row[field])))].sort().map((value) => [
      value,
      rows.filter((row) => row[field] === value).length,
    ]),
  );
}

function pattern(
  snapshotId: string,
  shapeId: string,
  stops: Array<[string, string]>,
): HistoricalFullStopPattern {
  return {
    pattern_id: `${snapshotId}-pattern`,
    snapshot_id: snapshotId,
    service_date: snapshotId === "pre" ? "2025-06-28" : "2025-06-29",
    route_id: "QX",
    direction_id: "0",
    trip_count: 1,
    trip_ids: [`${snapshotId}-trip`],
    shape_ids: [shapeId],
    headsigns: ["TERMINAL"],
    stops: stops.map(([stop_id, stop_name], index) => ({
      stop_id,
      stop_name,
      stop_lat: 40 + index / 100,
      stop_lon: -73 - index / 100,
    })),
    period_trip_counts: [{ period: "am_peak", trip_count: 1 }],
  };
}

function schedule(
  sourceId: string,
  date: string,
  shapeId: string,
): Plan040Package2ScheduleSlice {
  return {
    source_id: sourceId,
    schedule_date: date,
    route_id: "QX",
    operator: "NYCT",
    row_count: 3,
    trip_type_rows: { "1": 3 },
    passenger_shape_ids: [shapeId],
    nonrevenue_shape_ids: [],
    ambiguous_shape_ids: [],
    shape_trip_type_rows: [{
      shape_id: shapeId,
      trip_type_rows: { "1": 3 },
    }],
  };
}

const candidate = {
  occurrence_id: "occurrence:test",
  route_record_id: "route_qx",
  treatment_record_id: "treatment_qx-stop-removal",
  gtfs_route_id: "QX",
  implementation_date: "2025-06-29",
  implementation_phase: "phase_1",
  pre_feed_family: "queens",
  pre_gtfs_route_id: "QX",
  pre_source_id: "pre-source",
  pre_target_date: "2025-06-28",
  pre_trip_row_count: 1,
  pre_active_trip_count: 1,
  post_feed_family: "queens",
  post_gtfs_route_id: "QX",
  post_source_id: "post-source",
  post_inspected_source_id: "post-source",
  post_required_acquisition_role: null,
  post_target_date: "2025-06-29",
  post_trip_row_count: 1,
  post_active_trip_count: 1,
  inventory_group: "phase_1_same_family_queens",
  inventory_status: "accepted_reused",
  service_change_evidence_id: "source#block",
  service_change_block_sha256: "a".repeat(64),
  official_stop_list_url: "https://www.mta.info/document/test",
  captured_stop_statement: "Some stops have been removed.",
  exact_bindings: {
    route_table_row: "QX",
    stop_list_anchor_text: "View the full list of stops.",
    treatment_record_id: "treatment_qx-stop-removal",
  },
  requires_candidate_specific_stop_id_equivalence: true,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
} satisfies Plan040AcquisitionCandidate;

function buildSynthetic(
  postStops: Array<[string, string]>,
  preStops: Array<[string, string]> = [
    ["A", "Start St/First Av"],
    ["R", "Main St/Cross Av"],
    ["B", "Terminal St/Last Av"],
  ],
) {
  return buildPlan040Package2CandidateEvidence({
    candidate,
    stopListSourceId: "mta-qx-stop-list",
    stopListPdfSha256: "b".repeat(64),
    stopListLayoutTextSha256: "c".repeat(64),
    stopListRawTextSha256: "d".repeat(64),
    stopListText:
      "NORTHBOUND to Terminal\nOn Street/At Street Proposal Note\n" +
      "Main St/Cross Av Removed to improve speed & reliability\f",
    stopListBlocksJsonl: `${JSON.stringify({
      source_id: "mta-qx-stop-list",
      block_id: "p001_b0001",
      page_number: 1,
      reading_order: 1,
      raw_text: "Main St/Cross Av Removed to improve speed & reliability",
    })}\n`,
    prePatterns: [pattern("pre", "PRE1", preStops)],
    postPatterns: [pattern("post", "POST1", postStops)],
    preScheduleSlice: schedule("schedule", "2025-06-28", "PRE1"),
    postScheduleSlice: schedule("schedule", "2025-06-29", "POST1"),
  });
}

describe("Plan 040 QBNR Package 2 evidence-only draft", () => {
  it("extracts layout-preserved removal rows without treating prose as a row", () => {
    const extraction = extractPlan040Package2PdfStatements(
      "QX",
      "Some stops have been removed.\nNORTHBOUND to Terminal\n" +
        "Main St/Cross Av Removed to improve speed & reliability\f",
    );
    expect(extraction.unresolved_lines).toEqual([]);
    expect(extraction.statements).toHaveLength(1);
    expect(extraction.statements[0]).toMatchObject({
      page_number: 1,
      direction_heading: "NORTHBOUND to Terminal",
      normalized_stop_name: "MAINSTCROSSAV",
      removal_reason: "improve_speed_reliability",
    });
  });

  it("proposes a draft stop set only for an exact PDF/pre/post identifier match", () => {
    const result = buildSynthetic([
      ["A", "Start St/First Av"],
      ["B", "Terminal St/Last Av"],
    ]);
    expect(result.evidence_verdict).toBe("evidence_complete_stop_set");
    expect(result.exact_removed_stop_ids).toEqual(["R"]);
    expect(result.unresolved_gap_codes).toEqual([]);
    expect(result.proposed_extent_decision).toMatchObject({
      resolution: "stop_set",
      components: [{ identifiers: ["R"] }],
    });
    expect(result.proposed_grain_decision).toMatchObject({
      member_extent_decision_id: result.proposed_extent_decision?.decision_id,
      service_scope: {
        kind: "trip_subset",
        periods: ["am_peak"],
        directions: ["0"],
        pattern_ids: ["post-pattern", "pre-pattern"],
      },
    });
    expect(result.authorizes_decision_persistence).toBe(false);
  });

  it("does not let unrelated whole-route removals or replacement context block an exact stop set", () => {
    const result = buildSynthetic(
      [
        ["X", "Replacement Terminal/Zero Av"],
        ["A", "Start St/First Av"],
        ["B", "Terminal St/Last Av"],
      ],
      [
        ["U", "Old Terminal/Zero Av"],
        ["A", "Start St/First Av"],
        ["R", "Main St/Cross Av"],
        ["B", "Terminal St/Last Av"],
      ],
    );
    expect(result.evidence_verdict).toBe("evidence_complete_stop_set");
    expect(result.unresolved_gap_codes).toEqual([]);
    expect(result.nonexclusive_context_codes).toEqual([
      "full_route_pdf_gtfs_removed_stop_set_mismatch_nonexclusive",
      "full_route_renamed_or_replacement_stop_nonexclusive",
    ]);
    expect(result.exact_removed_stop_ids).toEqual(["R"]);
  });

  it("fails closed when the post feed uses a changed ID for the same stop name", () => {
    const result = buildSynthetic([
      ["A", "Start St/First Av"],
      ["R2", "Main St/Cross Av"],
      ["B", "Terminal St/Last Av"],
    ]);
    expect(result.evidence_verdict).toBe("receipt_terminal_unresolved");
    expect(result.unresolved_gap_codes).toContain("possible_changed_id_or_relocation");
    expect(result.proposed_extent_decision).toBeNull();
  });

  it("freezes exact 24-key parity, predecessor slices, and non-authorizing outcomes", () => {
    const bytes = readFileSync(artifactPath);
    const draft = JSON.parse(bytes.toString("utf8")) as Plan040Package2Draft;
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("ade4e511ab132d3b8eb4f7fa2225dcab0e84d8e8921cc5bd7e3c3126fb61ba5a");
    expect(plan040Package2ReplayHash(draft as unknown as JsonValue))
      .toBe("ade4e511ab132d3b8eb4f7fa2225dcab0e84d8e8921cc5bd7e3c3126fb61ba5a");
    expect(draft.candidate_count).toBe(24);
    expect(new Set(draft.candidates.map((row) => row.candidate_key)).size).toBe(24);
    expect(draft.candidate_key_sha256)
      .toBe("656f29be79a548259bc7deb5eda2462ad1ad4694240f6334cbecd710dd6525d5");
    expect(draft.evidence_verdict_distribution).toEqual({
      evidence_complete_stop_set: 1,
      receipt_terminal_unresolved: 23,
    });
    expect(draft.proposed_decision_count).toBe(1);
    expect(draft.persisted_decision_count).toBe(0);
    expect(draft.candidates.every((row) =>
      !row.authorizes_occurrence &&
      !row.authorizes_study &&
      !row.authorizes_cross_product &&
      !row.authorizes_decision_persistence)).toBe(true);
    const byRoute = new Map(draft.candidates.map((row) => [row.gtfs_route_id, row]));
    expect(byRoute.get("QM12")).toMatchObject({
      evidence_verdict: "evidence_complete_stop_set",
      proposed_grain_decision: {
        service_scope: {
          kind: "trip_subset",
          periods: ["am_peak", "midday", "pm_peak"],
          directions: ["0", "1"],
        },
      },
    });
    expect(draft.proposed_grain_decision_count).toBe(1);
    expect(draft.persisted_grain_decision_count).toBe(0);
    expect(byRoute.get("QM63")?.pre_schedule_slice).toMatchObject({
      source_id: "mta_bus_schedules_2025_x63_x68_predecessors_2026_07_24",
      schedule_date: "2025-06-27",
      route_id: "X63",
      row_count: 285,
    });
    expect(byRoute.get("QM68")?.pre_schedule_slice).toMatchObject({
      source_id: "mta_bus_schedules_2025_x63_x68_predecessors_2026_07_24",
      schedule_date: "2025-06-27",
      route_id: "X68",
      row_count: 195,
    });
  });

  it("resolves every proposed evidence binding and covers every exact removed row", () => {
    const qm12 = readDraft().candidates.find((row) => row.gtfs_route_id === "QM12");
    expect(qm12?.proposed_extent_decision).not.toBeNull();
    expect(qm12?.proposed_grain_decision).not.toBeNull();
    const blockIndexes = new Map<string, Map<string, { raw_text: string }>>();
    const blocksFor = (sourceId: string) => {
      const prior = blockIndexes.get(sourceId);
      if (prior) return prior;
      const blocks = readFileSync(
        `${repoRoot}/raw/sources/${sourceId}/blocks.jsonl`,
        "utf8",
      ).trim().split("\n").map((line) =>
        JSON.parse(line) as { block_id: string; raw_text: string });
      const index = new Map(blocks.map((block) => [block.block_id, block]));
      blockIndexes.set(sourceId, index);
      return index;
    };
    for (const decision of [
      qm12!.proposed_extent_decision!,
      qm12!.proposed_grain_decision!,
    ]) {
      for (const binding of decision.evidence_bindings) {
        const prefix = `${binding.source_id}#`;
        expect(binding.evidence_id.startsWith(prefix)).toBe(true);
        const blockId = binding.evidence_id.slice(prefix.length);
        expect(blocksFor(binding.source_id).has(blockId)).toBe(true);
      }
    }
    const stopEvidence = new Set(
      qm12!.proposed_extent_decision!.evidence_bindings
        .filter((binding) => binding.role === "candidate_stop_list")
        .map((binding) => binding.evidence_id),
    );
    const exactRows = qm12!.statement_bindings.filter((binding) =>
      binding.verdict === "exact_pre_id_absent_post");
    expect(exactRows).toHaveLength(12);
    expect(stopEvidence.size).toBe(12);
    for (const row of exactRows) {
      expect(row.source_block_id).not.toBeNull();
      const evidenceId = `${qm12!.stop_list_source_id}#${row.source_block_id}`;
      expect(stopEvidence.has(evidenceId)).toBe(true);
      const block = blocksFor(qm12!.stop_list_source_id).get(row.source_block_id!)!;
      const removedIndex = block.raw_text.toLowerCase().indexOf("removed");
      expect(removedIndex).toBeGreaterThan(0);
      expect(normalizePlan040Package2StopName(
        block.raw_text.slice(0, removedIndex),
      )).toBe(row.normalized_stop_name);
    }
  });

  it("validates the frozen dual-review gate and bounded owner/delegate acceptance", () => {
    const gatePath =
      `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
      "plan-040-qbnr-stop-removal-package-2-dual-review-gate-v1.json";
    const acceptancePath =
      `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
      "plan-040-qbnr-stop-removal-package-2-owner-acceptance-v1.json";
    const gateBytes = readFileSync(gatePath);
    const acceptanceBytes = readFileSync(acceptancePath);
    expect(createHash("sha256").update(gateBytes).digest("hex"))
      .toBe("b419817d9c46bca35ed9a6570ef47ef536dc5e5a01bcccc27472891369778e31");
    expect(createHash("sha256").update(acceptanceBytes).digest("hex"))
      .toBe("a438f8479c160934296cf31ab04f701dd41c7360c6237d50ff6e899f40bf106d");
    const gate = JSON.parse(gateBytes.toString("utf8")) as GateAndAcceptance["gate"];
    const acceptance = JSON.parse(
      acceptanceBytes.toString("utf8"),
    ) as GateAndAcceptance["acceptance"];
    expect(validatePlan040Package2GateAndAcceptance({
      draft: readDraft(),
      gate,
      acceptance,
      acceptedAt: acceptance.accepted_at,
    })).toEqual({
      candidate_count: 24,
      positive_candidate_count: 1,
      unresolved_candidate_count: 23,
      authorized_extent_decision_count: 1,
      authorized_grain_decision_count: 1,
      authorized_absence_candidate_count: 23,
      persisted_decision_count: 0,
      persisted_absence_receipt_count: 0,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(gate.reviewer_results.map((review) => review.verdict))
      .toEqual(["APPROVE", "APPROVE"]);
    expect(gate.rejected_history).toEqual([{
      commit: "66be04c90096a09c62c95c4f53c18482fae15639",
      verdict: "REJECT",
      superseded_by: "ede63792e604c44c007458b6df52907cf32a170c",
      reason: "non_resolving_evidence_id_placeholders",
    }]);
    expect(acceptance.authorized_positive_persistence).toMatchObject({
      candidate_count: 1,
      extent_decision_ids: [
        "member-extent-review:plan040-package2-qm12-stop-removal",
      ],
      grain_decision_ids: [
        "member-grain-review:plan040-package2-qm12-stop-removal",
      ],
    });
    const unresolvedKeys = readDraft().candidates
      .filter((candidate) =>
        candidate.evidence_verdict === "receipt_terminal_unresolved")
      .map((candidate) => candidate.candidate_key)
      .sort();
    expect(acceptance.authorized_reviewed_absence_receipt).toMatchObject({
      candidate_count: 23,
      candidate_keys: unresolvedKeys,
      surfaces: ["member_extent", "member_grain"],
    });
    expect(acceptance).toMatchObject({
      persisted_extent_decision_count: 0,
      persisted_grain_decision_count: 0,
      persisted_absence_receipt_count: 0,
      authorizes_decision_persistence: true,
      authorizes_reviewed_absence_receipt_persistence: true,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(() => validatePlan040Package2GateAndAcceptance({
      draft: readDraft(),
      gate,
      acceptance: { ...acceptance, candidate_count: 25 },
      acceptedAt: acceptance.accepted_at,
    })).toThrow("owner/delegate acceptance drifted");
  });

  it("records the complete fail-closed gap distribution", () => {
    const distribution: Record<string, number> = {};
    for (const candidate of readDraft().candidates) {
      for (const code of candidate.unresolved_gap_codes) {
        distribution[code] = (distribution[code] ?? 0) + 1;
      }
    }
    expect(distribution).toEqual({
      ambiguous_pre_gtfs_name: 10,
      direction_compatible_pattern_missing: 7,
      insufficient_two_boundary_pattern_identity: 2,
      no_schedule_validated_post_pattern: 1,
      pdf_claimed_removed_id_still_present_post: 6,
      pdf_direction_heading_not_bound_to_gtfs: 11,
      pdf_name_not_exactly_bound_to_pre_gtfs: 22,
      pdf_removed_row_source_block_unresolved: 9,
      possible_changed_id_or_relocation: 4,
      route_pattern_variant_requires_review: 14,
      unmatched_active_gtfs_shape: 7,
    });
    const contextDistribution: Record<string, number> = {};
    for (const candidate of readDraft().candidates) {
      for (const code of candidate.nonexclusive_context_codes) {
        contextDistribution[code] = (contextDistribution[code] ?? 0) + 1;
      }
    }
    expect(contextDistribution).toEqual({
      full_route_pdf_gtfs_removed_stop_set_mismatch_nonexclusive: 24,
      full_route_renamed_or_replacement_stop_nonexclusive: 18,
    });
  });

  it("round-trips the owner-accepted QM12 decisions and exact 23-key absence receipt", () => {
    const gate = JSON.parse(
      readFileSync(PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2_GATE_PATH, "utf8"),
    ) as GateAndAcceptance["gate"];
    const acceptance = JSON.parse(
      readFileSync(PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2_ACCEPTANCE_PATH, "utf8"),
    ) as GateAndAcceptance["acceptance"];
    const accepted = buildPlan040Package2AcceptedArtifacts({
      draft: readDraft(),
      gate,
      acceptance,
    });
    expect(accepted.extentDecisions).toHaveLength(1);
    expect(accepted.extentDecisions[0]).toMatchObject({
      decision_id: "member-extent-review:plan040-package2-qm12-stop-removal",
      resolution: "stop_set",
      reviewed_at: "2026-07-24T03:54:20Z",
      reviewed_by: "codex-owner-delegate",
    });
    expect(accepted.grainDecisions).toHaveLength(1);
    expect(accepted.grainDecisions[0]).toMatchObject({
      decision_id: "member-grain-review:plan040-package2-qm12-stop-removal",
      member_extent_decision_id:
        "member-extent-review:plan040-package2-qm12-stop-removal",
      service_scope: {
        kind: "trip_subset",
        directions: ["0", "1"],
        periods: ["am_peak", "midday", "pm_peak"],
      },
      reviewed_at: "2026-07-24T03:54:20Z",
      reviewed_by: "codex-owner-delegate",
    });
    expect(accepted.absenceReceipt).toMatchObject({
      contract_id: "member-extent-absence-receipt-v1",
      receipt_id: "plan-040-qbnr-stop-removal-package-2-reviewed-absence-v1",
      surfaces: ["member_extent", "member_grain"],
      reviewed_at: "2026-07-24T03:54:20Z",
      reviewed_by: "codex-owner-delegate",
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(accepted.absenceReceipt.extent_keys).toHaveLength(23);
    expect(accepted.absenceReceipt.exact_searches).toHaveLength(23);
    expect(accepted.absenceReceipt.urls_inspected).toHaveLength(23);
    expect(accepted.absenceReceipt.urls_inspected.every((url) =>
      /^https:\/\/www\.mta\.info\/document\/[0-9]+$/u.test(url))).toBe(true);
    const unresolved = readDraft().candidates.filter((candidate) =>
      candidate.evidence_verdict === "receipt_terminal_unresolved");
    for (const candidate of unresolved) {
      expect(accepted.absenceReceipt.exact_searches.some((search) =>
        search.includes(`candidate=${candidate.candidate_key}`) &&
        search.includes(`official_stop_list=${candidate.stop_list_url}`) &&
        search.includes(`pre=${candidate.pre_source_id}@${candidate.pre_target_date}`) &&
        search.includes(`post=${candidate.post_source_id}@${candidate.post_target_date}`) &&
        candidate.unresolved_gap_codes.every((gap) => search.includes(gap)))).toBe(true);
    }
    expect(createHash("sha256").update(`${stableJson({
      decisions: accepted.extentDecisions,
    } as JsonValue)}\n`).digest("hex"))
      .toBe("ccd1fbbd157c4718d6e18fd06f5166a3207fa5ff0cca26926de9b123e786cc8b");
    expect(createHash("sha256").update(`${stableJson({
      decisions: accepted.grainDecisions,
    } as JsonValue)}\n`).digest("hex"))
      .toBe("a5cdfb96cee98302379a03887bb6b2f9e4b2ce045448c794b2a415d5463578ba");
    expect(createHash("sha256").update(`${stableJson({
      receipts: [accepted.absenceReceipt],
    } as JsonValue)}\n`).digest("hex"))
      .toBe("cfa04da8ce463e50eac2798058902e019be88263b1c9a5c2dcbb4c2182bdba5c");
  });

  it("replays immutable accepted artifacts through the strict decision and receipt loaders", () => {
    const first = acceptPlan040Package2DecisionPackage();
    const second = acceptPlan040Package2DecisionPackage();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      extentDecisionSha256:
        "ccd1fbbd157c4718d6e18fd06f5166a3207fa5ff0cca26926de9b123e786cc8b",
      grainDecisionSha256:
        "a5cdfb96cee98302379a03887bb6b2f9e4b2ce045448c794b2a415d5463578ba",
      absenceReceiptSha256:
        "cfa04da8ce463e50eac2798058902e019be88263b1c9a5c2dcbb4c2182bdba5c",
      extentDecisionCount: 1,
      grainDecisionCount: 1,
      absenceCandidateCount: 23,
    });
    const extent = loadMemberExtentDecisions([
      dirname(PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2_EXTENT_DECISIONS_PATH),
    ]).filter((decision) =>
      decision.decision_id === "member-extent-review:plan040-package2-qm12-stop-removal");
    const grain = loadMemberGrainDecisions([
      dirname(PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2_GRAIN_DECISIONS_PATH),
    ]).filter((decision) =>
      decision.decision_id === "member-grain-review:plan040-package2-qm12-stop-removal");
    const receipts = loadMemberExtentAbsenceReceipts([
      dirname(PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2_ABSENCE_RECEIPT_PATH),
    ]).filter((receipt) =>
      receipt.receipt_id ===
        "plan-040-qbnr-stop-removal-package-2-reviewed-absence-v1");
    expect(extent).toHaveLength(1);
    expect(grain).toHaveLength(1);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].extent_keys).toHaveLength(23);
    expect(receipts[0].surfaces).toEqual(["member_extent", "member_grain"]);
  });

  it("preserves the exact Package 2 terminal delta after later package closures", () => {
    const companion = readJsonl(
      `${repoRoot}/data/contracts/operational-occurrence-member-extent/v1/` +
        "operational_occurrence_member_extents.jsonl",
    );
    const extentLedger = readJsonl(
      `${repoRoot}/data/quality/operational-reference/member-extent-ledger.jsonl`,
    );
    const grainLedger = readJsonl(
      `${repoRoot}/data/quality/operational-reference/member-grain-ledger.jsonl`,
    );
    expect(companion).toHaveLength(308);
    expect(extentLedger).toHaveLength(308);
    expect(grainLedger).toHaveLength(308);
    expect(distribution(companion, "extent")).toEqual({
      bounded_segment: 29,
      route_wide: 14,
      stop_set: 4,
      unresolved: 261,
    });
    expect(distribution(extentLedger, "verdict")).toEqual({
      absent_in_source: 165,
      "resolved:bounded_segment": 29,
      "resolved:route_wide": 14,
      "resolved:stop_set": 4,
      unreviewed: 96,
    });
    expect(distribution(grainLedger, "verdict")).toEqual({
      absent_in_source: 165,
      "blocked_upstream:accepted_date_resolution+feed_version_resolution": 2,
      "blocked_upstream:branch_lineage_mapping+direction_lineage_mapping": 1,
      "blocked_upstream:corrected_initial_feed_bytes+published_launch_conflict_resolution":
        2,
      "blocked_upstream:effective_date_full_stop_inventory+frequency_evidence+later_feed_lineage":
        2,
      not_applicable: 2,
      resolved: 38,
      unreviewed: 96,
    });
    const companionByKey = new Map(companion.map((row) => [extentDecisionKey(row as any), row]));
    const extentByKey = new Map(extentLedger.map((row) => [extentDecisionKey(row as any), row]));
    const grainByKey = new Map(grainLedger.map((row) => [extentDecisionKey(row as any), row]));
    const draft = readDraft();
    const positive = draft.candidates.find((candidate) =>
      candidate.evidence_verdict === "evidence_complete_stop_set")!;
    const unresolved = draft.candidates.filter((candidate) =>
      candidate.evidence_verdict === "receipt_terminal_unresolved");
    expect(companionByKey.get(positive.candidate_key)).toMatchObject({
      extent: "stop_set",
      decision_id: "member-extent-review:plan040-package2-qm12-stop-removal",
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(extentByKey.get(positive.candidate_key)).toMatchObject({
      verdict: "resolved:stop_set",
      verdict_basis: "review:member-extent-review:plan040-package2-qm12-stop-removal",
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(grainByKey.get(positive.candidate_key)).toMatchObject({
      verdict: "resolved",
      verdict_basis: "review:member-grain-review:plan040-package2-qm12-stop-removal",
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    for (const candidate of unresolved) {
      expect(companionByKey.get(candidate.candidate_key)).toMatchObject({
        extent: "unresolved",
        authorizes_study: false,
        authorizes_cross_product: false,
      });
      expect(extentByKey.get(candidate.candidate_key)).toMatchObject({
        verdict: "absent_in_source",
        receipt_ids: ["plan-040-qbnr-stop-removal-package-2-reviewed-absence-v1"],
        authorizes_study: false,
        authorizes_cross_product: false,
      });
      expect(grainByKey.get(candidate.candidate_key)).toMatchObject({
        verdict: "absent_in_source",
        receipt_ids: ["plan-040-qbnr-stop-removal-package-2-reviewed-absence-v1"],
        authorizes_study: false,
        authorizes_cross_product: false,
      });
    }
    expect(companion.filter((row) =>
      draft.candidates.some((candidate) =>
        candidate.candidate_key === extentDecisionKey(row as any)) &&
      row.extent !== "unresolved")).toHaveLength(1);
  });
});
