import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "../../../core/src/paths";
import {
  classifyDownstreamDisposition,
  extentDecisionKey,
  projectMemberExtent,
  validateMemberExtentDecision,
  type MemberExtentDecision,
} from "../../src/quality/study-readiness-v1";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8").split(/\r?\n/u)
    .flatMap((line) => line.trim() ? [JSON.parse(line) as T] : []);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const contractDir = join(
  repoRoot,
  "data/contracts/operational-occurrence-member-extent/v1",
);
const qualityDir = join(repoRoot, "data/quality/study-readiness/v1");
const overlayDir = join(
  repoRoot,
  "data/quality/relationship-integrity/bus-lane-acquisition/current-resolutions/v1",
);

describe("study-readiness v1 extent contract", () => {
  it("enumerates the exact rc26 occurrence × route × member denominator", () => {
    const rows = readJsonl<{
      occurrence_id: string;
      route_record_id: string;
      treatment_record_id: string;
      extent: string;
      missing_roles: string[];
      authorizes_study: boolean;
      authorizes_cross_product: boolean;
    }>(join(contractDir, "operational_occurrence_member_extents.jsonl"));
    const summary = readJson<{
      member_extent_row_count: number;
      eligible_member_extent_row_count: number;
      extent_counts: Record<string, number>;
    }>(join(contractDir, "summary.json"));

    expect(rows).toHaveLength(308);
    expect(new Set(rows.map(extentDecisionKey)).size).toBe(308);
    expect(summary.member_extent_row_count).toBe(308);
    expect(summary.eligible_member_extent_row_count).toBe(306);
    expect(summary.extent_counts).toEqual({
      route_wide: 2,
      bounded_segment: 12,
      stop_set: 0,
      mixed: 0,
      unresolved: 294,
    });
    expect(rows.every((row) => !row.authorizes_study && !row.authorizes_cross_product)).toBe(true);
    expect(rows.filter((row) => row.extent === "unresolved")
      .every((row) => row.missing_roles.length > 0)).toBe(true);
  });

  it("does not promote empty scope, route membership, or nonphysicality defaults", () => {
    const projected = projectMemberExtent({
      occurrence_id: "occurrence:test",
      occurrence_review_decision_id: "review:test",
      route_record_id: "route_test",
      gtfs_route_id: "TEST",
      treatment_record_id: "treatment_test",
      treatment_family: "service_pattern",
    });
    expect(projected.extent).toBe("unresolved");
    expect(projected.missing_roles).toEqual(["reviewed_extent_decision"]);
    expect(projected.authorizes_cross_product).toBe(false);
  });

  it("rejects malformed positive and unresolved decisions", () => {
    const base: MemberExtentDecision = {
      decision_id: "decision:test",
      occurrence_id: "occurrence:test",
      route_record_id: "route_test",
      treatment_record_id: "treatment_test",
      resolution: "route_wide",
      components: [],
      evidence_bindings: [],
      missing_roles: [],
      rationale: "test",
      reviewed_at: "2026-07-21T00:00:00.000Z",
      reviewed_by: "test",
    };
    expect(() => validateMemberExtentDecision(base)).toThrow();
    expect(() => validateMemberExtentDecision({
      ...base,
      resolution: "unresolved",
      missing_roles: [],
    })).toThrow();
    expect(() => validateMemberExtentDecision({
      ...base,
      resolution: "mixed",
      components: [{
        component_kind: "route",
        identity_namespace: "canonical_record",
        identifiers: ["route_test"],
        description: "one kind only",
      }],
      evidence_bindings: [{
        role: "extent_classification",
        record_id: "treatment_test",
        source_id: "source_test",
        evidence_id: "source_test#p001_b0001",
      }],
    })).toThrow();
  });

  it("retains exact Flatbush B41 and B67 bounded rows without fan-out", () => {
    const rows = readJsonl<{
      occurrence_id: string;
      gtfs_route_id: string;
      treatment_record_id: string;
      extent: string;
      components: Array<{ identifiers: string[] }>;
    }>(join(contractDir, "operational_occurrence_member_extents.jsonl"))
      .filter((row) => row.occurrence_id === "occurrence:8c987704152b459014217d44");
    expect(rows.map((row) => row.gtfs_route_id).sort()).toEqual(["B41", "B67"]);
    expect(rows.every((row) => row.extent === "bounded_segment")).toBe(true);
    expect(rows.every((row) => row.treatment_record_id ===
      "treatment_flatbush-phase1-center-running-bus-lanes-livingston-state")).toBe(true);
    expect(rows.every((row) => row.components[0]?.identifiers.includes(
      "corridor_flatbush-phase1-livingston-state"))).toBe(true);
  });
});

describe("study-readiness v1 Tracker bridge", () => {
  it("reconciles the full mutually exclusive rc26 funnel", () => {
    const summary = readJson<{
      row_count: number;
      disposition_counts: Record<string, number>;
      authorizes_study: boolean;
      authorizes_cross_product: boolean;
    }>(join(qualityDir, "bridge-summary.json"));
    expect(summary.row_count).toBe(484);
    expect(summary.disposition_counts).toEqual({
      approved_rc26: 7,
      quarantined_later_ace_phase: 20,
      source_fixable_bus_lane_occurrence_identity: 321,
      source_fixable_member_treatment_extent: 83,
      tracker_owned_outcome_calendar: 8,
      tracker_owned_spine_or_pattern: 45,
    });
    expect(summary.authorizes_study).toBe(false);
    expect(summary.authorizes_cross_product).toBe(false);
  });

  it("keeps revised Flatbush B41 consumer-owned and B67 approved", () => {
    expect(classifyDownstreamDisposition({
      candidate_id: "study-event-v2:6b70c52e0eec23eb63cab94f",
      treatment_family: "bus_lane",
      decision: "rejected",
      decision_rationale: "exact identity is proved but current B41 spine remains consumer-owned",
    })).toBe("tracker_owned_spine_or_pattern");
    expect(classifyDownstreamDisposition({
      candidate_id: "study-event-v2:d70a3ee36eb94ae88732065f",
      treatment_family: "bus_lane",
      decision: "approved",
      decision_rationale: "approved",
    })).toBe("approved_rc26");
  });

  it("contains only 404 source-fixable targets and quarantines 73 others", () => {
    const manifest = readJson<{
      target_count: number;
      priority_1_count: number;
      historical_source_fixable_target_count: number;
      current_open_target_count: number;
      resolved_requires_downstream_replay_count: number;
      omitted_current_producer_status: string;
      reviewed_priority_batch_count: number;
      exhausted_bus_lane_sweep_count: number;
      targets: Array<{
        route_id: string;
        downstream_rejection_reason: string;
        current_producer_status?: string;
        current_producer_missing_roles?: string[];
        downstream_replay_required?: boolean;
      }>;
    }>(join(qualityDir, "consumer-priority-manifest.json"));
    const quarantine = readJsonl<{ source_research_can_resolve: boolean }>(
      join(qualityDir, "consumer-owned-quarantine.jsonl"),
    );
    expect(manifest.target_count).toBe(404);
    expect(manifest.historical_source_fixable_target_count).toBe(404);
    expect(manifest.current_open_target_count).toBe(399);
    expect(manifest.resolved_requires_downstream_replay_count).toBe(5);
    expect(manifest.omitted_current_producer_status).toBe("open_source_fixable_target");
    expect(manifest.reviewed_priority_batch_count).toBe(11);
    expect(manifest.priority_1_count).toBe(6);
    expect(manifest.exhausted_bus_lane_sweep_count).toBe(321);
    expect(manifest.targets.every((row) => row.downstream_rejection_reason.startsWith(
      "source_fixable_"))).toBe(true);
    expect(quarantine).toHaveLength(73);
    expect(quarantine.every((row) => row.source_research_can_resolve === false)).toBe(true);
    expect(manifest.targets.filter((row) =>
      row.current_producer_status === "resolved_requires_downstream_replay").map((row) =>
        row.route_id).sort()).toEqual(["Q45", "Q63", "Q80", "Q86", "Q87"]);
    expect(manifest.targets.filter((row) =>
      row.current_producer_status === "resolved_requires_downstream_replay").every((row) =>
        row.current_producer_missing_roles?.length === 0 && row.downstream_replay_required)).toBe(true);
  });

  it("records five complete existing occurrences and six exact negative findings", () => {
    const summary = readJson<{
      target_count: number;
      evidence_complete_existing_occurrence_count: number;
      negative_disposition_count: number;
      new_occurrence_count: number;
      exact_missing_role_counts: Record<string, number>;
    }>(join(qualityDir, "research/summary.json"));
    expect(summary).toEqual({
      schema_version: 1,
      batch_id: "queens-redesign-extent-priority-v1",
      target_count: 11,
      evidence_complete_existing_occurrence_count: 5,
      negative_disposition_count: 6,
      new_occurrence_count: 0,
      exact_missing_role_counts: {
        bounded_scope_identity: 4,
        scope_modality: 3,
        stop_identity: 4,
      },
      notice: expect.any(String),
    });
  });

  it("binds Q45/Q86/Q87 to exact reviewed endpoints without route-wide inference", () => {
    const receipt = readJson<{
      sources: Array<{
        source_id: string;
        source_url: string;
        artifact: {
          path: string;
          byte_length: number;
          sha256: string;
          capture_url: string;
          archive_timestamp: string;
          archive_digest: string;
        };
        reviewed_capture_sha256: string;
        evidence_blocks: Array<{
          evidence_id: string;
          staged_block_id: string;
          staged_text_surface: string;
          raw_text: string;
          raw_text_sha256: string;
        }>;
      }>;
      decisions: Array<{
        route_id: string;
        occurrence_id: string;
        treatment_record_id: string;
        resolution: string;
        component: { identifiers: string[] };
      }>;
      doctrine: {
        preserves_occurrence_identity: boolean;
        infers_route_wide_scope: boolean;
        authorizes_study: boolean;
        authorizes_cross_product: boolean;
      };
    }>(join(
      repoRoot,
      "data/quality/acquisition/receipts/q45-q86-q87-member-extents-2025.json",
    ));
    expect(receipt.sources).toHaveLength(7);
    expect(receipt.sources.map((source) => source.source_url).sort()).toEqual([
      "https://www.mta.info/document/176896",
      "https://www.mta.info/document/177056",
      "https://www.mta.info/project/queens-bus-network-redesign/routes/q45-local",
      "https://www.mta.info/project/queens-bus-network-redesign/routes/q5-local",
      "https://www.mta.info/project/queens-bus-network-redesign/routes/q85-rush",
      "https://www.mta.info/project/queens-bus-network-redesign/routes/q86-rush",
      "https://www.mta.info/project/queens-bus-network-redesign/routes/q87-rush",
    ]);
    expect(receipt.sources.map((source) => [
      source.source_id,
      source.artifact.path,
      source.artifact.byte_length,
      source.artifact.sha256,
    ])).toEqual([
      ["mta_qbnr_q45_route_detail_2025", "raw/sources/mta_qbnr_q45_route_detail_2025/source.html", 62666, "366f65f08e0a2d45eeec73a1f3bbe7ec6fb97c310f4ed3d2c3587b21d2d5e883"],
      ["mta_q45_timetable_2025_06_29", "raw/sources/mta_q45_timetable_2025_06_29/source.pdf", 305922, "a6de73fb74e98441bbfd5f2030de9e8c079eba9eeb9adc8a5ff4f611a22339d6"],
      ["mta_qbnr_q5_route_detail_2025", "raw/sources/mta_qbnr_q5_route_detail_2025/source.html", 68060, "2016eba052f848b7ad2c0859705d69b0f910091933cc067398fe71ff584785d1"],
      ["mta_qbnr_q85_route_detail_2025", "raw/sources/mta_qbnr_q85_route_detail_2025/source.html", 66680, "60ad197c0bc15334ca35640b2b769412dcbbc108b7cb4653e4daa11ee902fc3d"],
      ["mta_qbnr_q86_route_detail_2025", "raw/sources/mta_qbnr_q86_route_detail_2025/source.html", 64552, "0aed4c0431cbfada403ea688f50c014aad3c266399eff4b232ed9659c221e048"],
      ["mta_qbnr_q87_route_detail_2025", "raw/sources/mta_qbnr_q87_route_detail_2025/source.html", 68445, "19557a67d075d201e973bb626ec706eb7dfa31da3b0cbdda1e03cb1ca8a16581"],
      ["mta_q86_q87_timetable_2025_06_29", "raw/sources/mta_q86_q87_timetable_2025_06_29/source.pdf", 862072, "c228aad87a505cafc0104cab5995b2e1d33e9357e68ef66a1d536d7d55902e5f"],
    ]);
    expect(receipt.sources.every((source) =>
      source.artifact.capture_url.startsWith("https://web.archive.org/web/") &&
      /^\d{14}$/u.test(source.artifact.archive_timestamp) &&
      /^[A-Z2-7]{32}$/u.test(source.artifact.archive_digest))).toBe(true);
    for (const source of receipt.sources) {
      const capture = `${source.evidence_blocks.map((block) => block.raw_text).join("\n")}\n`;
      expect(sha256(capture)).toBe(source.reviewed_capture_sha256);
      for (const block of source.evidence_blocks) {
        expect(`sha256:${sha256(block.raw_text)}`).toBe(block.raw_text_sha256);
        expect(block.staged_text_surface).toBe("normalized_text");
        expect(block.staged_block_id).toMatch(/^p\d{3,}_[bp]\d{4,}$/u);
      }
      expect(new Set(source.evidence_blocks.map((block) => block.staged_block_id)).size).toBe(
        source.evidence_blocks.length,
      );
    }
    expect(receipt.decisions.map((decision) => [
      decision.route_id,
      decision.occurrence_id,
      decision.treatment_record_id,
      decision.resolution,
      decision.component.identifiers[0],
    ])).toEqual([
      [
        "Q45",
        "occurrence:9256051973f8f7ff0847b5c1",
        "treatment_q45-all-day-frequent-service-2025",
        "bounded_segment",
        "source-literal-v1:mta_qbnr_q45_route_detail_2025:union-tpke-queens-blvd--188-st",
      ],
      [
        "Q86",
        "occurrence:d30e60bf0a04874c1ae7d40b",
        "treatment_q86-q5-q85-branch-combination-2025",
        "bounded_segment",
        "source-literal-v1:mta_qbnr_q86_route_detail_2025:jamaica-center-bay-a--253-st-149-av",
      ],
      [
        "Q87",
        "occurrence:a04ec993d0faee78af481311",
        "treatment_q87-q5-green-acres-replacement-2025",
        "bounded_segment",
        "source-literal-v1:mta_qbnr_q87_route_detail_2025:jamaica-center-bay-a--green-acres-mall",
      ],
    ]);
    expect(receipt.doctrine).toMatchObject({
      preserves_occurrence_identity: true,
      infers_route_wide_scope: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    });

    const packets = readJsonl<{
      route_id: string;
      occurrence_id: string;
      review_disposition: string;
      exact_missing_roles: string[];
      member_extents: Array<{
        treatment_record_id: string;
        extent: string;
        evidence_bindings: Array<{ source_id: string; evidence_id: string }>;
        authorizes_study: boolean;
        authorizes_cross_product: boolean;
      }>;
    }>(join(qualityDir, "research/reviewed-candidate-packets.jsonl"));
    for (const routeId of ["Q45", "Q86", "Q87"]) {
      const packet = packets.find((row) => row.route_id === routeId);
      expect(packet?.review_disposition).toBe("reviewed_candidate_packet_evidence_complete");
      expect(packet?.exact_missing_roles).toEqual([]);
      expect(packet?.member_extents.every((row) =>
        row.extent !== "unresolved" &&
        !row.authorizes_study &&
        !row.authorizes_cross_product)).toBe(true);
    }
    const q86 = packets.find((row) => row.route_id === "Q86")?.member_extents.find((row) =>
      row.treatment_record_id === "treatment_q86-q5-q85-branch-combination-2025");
    const q86Sources = new Set(q86?.evidence_bindings.map((binding) => binding.source_id));
    expect(q86Sources.has("mta_qbnr_q5_route_detail_2025")).toBe(true);
    expect(q86Sources.has("mta_qbnr_q85_route_detail_2025")).toBe(true);
    const q87 = packets.find((row) => row.route_id === "Q87")?.member_extents.find((row) =>
      row.treatment_record_id === "treatment_q87-q5-green-acres-replacement-2025");
    const q87Sources = new Set(q87?.evidence_bindings.map((binding) => binding.source_id));
    expect(q87Sources.has("mta_qbnr_q5_route_detail_2025")).toBe(true);
    expect(packets.filter((row) => ["Q45", "Q86", "Q87"].includes(row.route_id)).flatMap((row) =>
      row.member_extents.flatMap((member) => member.evidence_bindings)).filter((binding) =>
      receipt.sources.some((source) => source.source_id === binding.source_id)).every((binding) =>
      /^mta_.+#p\d{3,}_[bp]\d{4,}$/u.test(binding.evidence_id))).toBe(true);
  });

  it("reproduces every generated byte in check mode", () => {
    const result = spawnSync(process.execPath, [
      join(repoRoot, "scripts/generate-study-readiness-v1.ts"),
      "--check",
    ], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"bridge_rows":484');
  });
});

describe("append-only bus-lane acquisition resolution overlay", () => {
  it("links only exact B41/B67 receipts and preserves immutable bytes", () => {
    const receiptsPath = join(
      repoRoot,
      "data/quality/relationship-integrity/bus-lane-acquisition/shards/brooklyn-null/receipts.jsonl",
    );
    expect(sha256(readFileSync(receiptsPath, "utf8"))).toBe(
      "8806c619a6a3cbcdf4233f74fb58cab8d243651b649b69c02c8f8c4c24344a10",
    );
    const ledger = readJsonl<{
      immutable_receipt: { receipt_id: string };
      current_resolution: { gtfs_route_id: string; missing_roles: string[] };
      resolution_doctrine: {
        rewrites_historical_receipt: boolean;
        authorizes_study: boolean;
        authorizes_cross_product: boolean;
      };
    }>(join(overlayDir, "ledger.jsonl"));
    expect(ledger).toHaveLength(2);
    expect(ledger.map((row) => row.current_resolution.gtfs_route_id).sort()).toEqual(["B41", "B67"]);
    expect(ledger.every((row) => row.current_resolution.missing_roles.length === 0)).toBe(true);
    expect(ledger.every((row) =>
      !row.resolution_doctrine.rewrites_historical_receipt &&
      !row.resolution_doctrine.authorizes_study &&
      !row.resolution_doctrine.authorizes_cross_product)).toBe(true);
  });
});
