import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import type { JsonValue } from "../../../db/src/types";
import {
  buildPlan040Package3Draft,
  PLAN040_PACKAGE_3_ROUTE_ORDER,
  PLAN040_PHASE_2_INITIAL_BUSCO_SHA1,
  PLAN040_PHASE_2_LATER_BUSCO_SHA1,
  PLAN040_PHASE_2_PRE_BUSCO_SHA1,
  PLAN040_Q67_CORRECTION_SHA1,
  plan040Package3ReplayHash,
  type Plan040Package3Draft,
} from "../../src/quality/plan040-qbnr-stop-removal-package3";

const acquisitionPath =
  `${repoRoot}/data/quality/acquisition/receipts/` +
  "plan-040-qbnr-stop-removal-package-3-acquisition-v1.json";
const evidencePath =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-3-evidence-v1.json";
const draftPath =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-3-evidence-draft-v1.json";

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;

type Acquisition = {
  candidate_count: number;
  source_count: number;
  route_order: string[];
  stop_list_sources: Array<{
    route_ids: string[];
    source_id: string;
    source_url: string;
    receipt_sha256: string;
    pdf_sha256: string;
    layout_text_sha256: string;
    raw_text_sha256: string;
    blocks_sha256: string;
    removed_statement_blocks: Array<{
      evidence_id: string;
      raw_text_sha256: string;
    }>;
    authorizes_decision_persistence: false;
  }>;
  accepted_pre_feeds: Array<{
    source_id: string;
    zip_sha1: string;
    zip_sha256: string;
    service_window: { start: string; end: string };
    members: Array<{
      member: string;
      sha1: string;
      sha256: string;
    }>;
  }>;
  required_exact_post_versions: {
    q67_first_week_correction: {
      version_sha1: string;
      zip_sha256: null;
      members: Array<{ member: string; sha1: string; sha256: null }>;
      exact_bytes_status: string;
      calendar_expansion_status: string;
    };
    phase_2_initial_busco: {
      version_sha1: string;
      zip_sha256: null;
      members: Array<{
        member: string;
        rows: number;
        sha1: string;
        sha256: null;
      }>;
      exact_bytes_status: string;
      calendar_expansion_status: string;
    };
  };
  explicitly_separate_non_substitute_versions: {
    phase_2_later_busco: {
      version_sha1: string;
      substitution_status: string;
    };
  };
  bounded_acquisition_searches: Array<{
    surface?: string;
    target_sha1?: string;
    outcome: string;
  }>;
  schedule_trip_type_policy: {
    passenger: string;
    nonrevenue_excluded: string[];
    mixed_passenger_and_nonrevenue: string;
    schedule_shape_absent_from_exact_gtfs: string;
  };
  authorizes_decision_persistence: false;
};

describe("Plan 040 QBNR Package 3 evidence-only acquisition draft", () => {
  it("freezes exact 13-candidate parity and 12 exact MTA stop-list sources", () => {
    const acquisitionBytes = readFileSync(acquisitionPath);
    const evidenceBytes = readFileSync(evidencePath);
    const draftBytes = readFileSync(draftPath);
    const acquisition = JSON.parse(
      acquisitionBytes.toString("utf8"),
    ) as Acquisition;
    const draft = JSON.parse(
      draftBytes.toString("utf8"),
    ) as Plan040Package3Draft;

    expect(sha256(acquisitionBytes)).toBe(
      "c82ca6c81b0075aeb550425cda7f55c38ee79347b2ccb0cb92aa9d0c605c29f5",
    );
    expect(sha256(evidenceBytes)).toBe(
      "ba6bcf3ecfd576806668b00086433d2b45f3a1eaa016ee7dd13d297f3e92fbed",
    );
    expect(sha256(draftBytes)).toBe(
      "294094a5f8fa3f54bf44bafec7e610bec4ddf26a61c7118f5c9613dae16b6939",
    );
    expect(plan040Package3ReplayHash(draft as unknown as JsonValue)).toBe(
      sha256(draftBytes),
    );
    expect(acquisition.route_order).toEqual([
      ...PLAN040_PACKAGE_3_ROUTE_ORDER,
    ]);
    expect(draft.candidates.map((candidate) => candidate.gtfs_route_id))
      .toEqual([...PLAN040_PACKAGE_3_ROUTE_ORDER]);
    expect(acquisition.candidate_count).toBe(13);
    expect(acquisition.source_count).toBe(12);
    expect(draft.candidate_count).toBe(13);
    expect(new Set(draft.candidates.map((row) => row.candidate_key)).size)
      .toBe(13);
    expect(draft.candidate_key_sha256).toBe(
      "60cc7e0f3591afa5fae9d7cac57ed55e756fec2f3e63abef90591d87db69b6c2",
    );

    for (const source of acquisition.stop_list_sources) {
      expect(source.source_url).toMatch(
        /^https:\/\/www\.mta\.info\/document\/\d+$/u,
      );
      expect(source.receipt_sha256).toHaveLength(64);
      expect(source.pdf_sha256).toHaveLength(64);
      expect(source.layout_text_sha256).toHaveLength(64);
      expect(source.raw_text_sha256).toHaveLength(64);
      expect(source.blocks_sha256).toHaveLength(64);
      expect(source.removed_statement_blocks.length).toBeGreaterThan(0);
      expect(source.removed_statement_blocks.every((block) =>
        block.evidence_id.startsWith(`${source.source_id}#`) &&
        block.raw_text_sha256.length === 64)).toBe(true);
      expect(source.authorizes_decision_persistence).toBe(false);
    }
    const shared = acquisition.stop_list_sources.find((source) =>
      source.route_ids.includes("Q33"));
    expect(shared?.route_ids).toEqual(["Q33", "Q47"]);
    expect(draft.candidates.find((row) => row.gtfs_route_id === "Q33"))
      .toMatchObject({
        stop_list: {
          source_id: "mta_qbnr_2025_q33_q47_stop_list",
          binding_status: "shared_q47_profile_q33_route_variant_ambiguous",
        },
      });
    expect(draft.candidates.find((row) => row.gtfs_route_id === "Q47"))
      .toMatchObject({
        stop_list: {
          source_id: "mta_qbnr_2025_q33_q47_stop_list",
          binding_status: "candidate_route_stop_list_exact",
        },
      });
  });

  it("pins accepted pre bytes while refusing metadata-only post versions", () => {
    const acquisition = readJson<Acquisition>(acquisitionPath);
    const draft = readJson<Plan040Package3Draft>(draftPath);
    const phase2Pre = acquisition.accepted_pre_feeds.find((feed) =>
      feed.zip_sha1 === PLAN040_PHASE_2_PRE_BUSCO_SHA1);
    expect(phase2Pre).toMatchObject({
      source_id: "gtfs_static_20250626_busco_post_qbnr",
      zip_sha1: PLAN040_PHASE_2_PRE_BUSCO_SHA1,
      zip_sha256:
        "7d0e5651d5cc5c3ac86973dc664e16a05e9245bea156f566c39e71506128670e",
      service_window: { start: "2025-06-29", end: "2025-08-30" },
    });
    for (const member of phase2Pre!.members) {
      expect(member.sha1).toHaveLength(40);
      expect(member.sha256).toHaveLength(64);
    }

    const q67 =
      acquisition.required_exact_post_versions.q67_first_week_correction;
    expect(q67).toMatchObject({
      version_sha1: PLAN040_Q67_CORRECTION_SHA1,
      zip_sha256: null,
      exact_bytes_status: "blocked_exact_bytes_unavailable",
      calendar_expansion_status: "not_computed_exact_bytes_unavailable",
    });
    expect(q67.members.every((member) =>
      member.sha1.length === 40 && member.sha256 === null)).toBe(true);
    const phase2 =
      acquisition.required_exact_post_versions.phase_2_initial_busco;
    expect(phase2).toMatchObject({
      version_sha1: PLAN040_PHASE_2_INITIAL_BUSCO_SHA1,
      zip_sha256: null,
      exact_bytes_status: "blocked_exact_bytes_unavailable",
      calendar_expansion_status: "not_computed_exact_bytes_unavailable",
    });
    expect(phase2.members.every((member) =>
      member.rows > 0 &&
      member.sha1.length === 40 &&
      member.sha256 === null)).toBe(true);
    expect(
      acquisition.explicitly_separate_non_substitute_versions
        .phase_2_later_busco,
    ).toEqual(expect.objectContaining({
      version_sha1: PLAN040_PHASE_2_LATER_BUSCO_SHA1,
      substitution_status:
        "not_accepted_as_phase_2_initial_version_or_q67_correction",
    }));
    expect(acquisition.bounded_acquisition_searches).toContainEqual({
      surface: "NYC Transit Data Archive public S3 static GTFS holdings",
      outcome: "not_applicable_holdings_end_in_2016_no_2025_coverage",
    });
    expect(draft.version_separation).toMatchObject({
      launch_initial_pre_phase_2_sha1: PLAN040_PHASE_2_PRE_BUSCO_SHA1,
      q67_correction_sha1: PLAN040_Q67_CORRECTION_SHA1,
      phase_2_initial_sha1: PLAN040_PHASE_2_INITIAL_BUSCO_SHA1,
      phase_2_later_sha1: PLAN040_PHASE_2_LATER_BUSCO_SHA1,
      later_phase_2_version_is_not_substitute: true,
    });
  });

  it("classifies schedule trip types and leaves unmatched bindings unresolved", () => {
    const acquisition = readJson<Acquisition>(acquisitionPath);
    const draft = readJson<Plan040Package3Draft>(draftPath);
    expect(acquisition.schedule_trip_type_policy).toEqual({
      passenger: "any trip_type other than 2, 3, or 4",
      nonrevenue_excluded: ["2", "3", "4"],
      mixed_passenger_and_nonrevenue:
        "reviewed_unresolved_ambiguous_trip_type",
      schedule_shape_absent_from_exact_gtfs:
        "reviewed_unresolved_unmatched_shape",
    });
    for (const candidate of draft.candidates) {
      for (const slice of [
        candidate.schedule_validation.pre,
        candidate.schedule_validation.post,
      ]) {
        const byShape = new Map(
          slice.shape_trip_type_rows.map((row) => [
            row.shape_id,
            Object.keys(row.trip_type_rows),
          ]),
        );
        for (const shapeId of slice.passenger_shape_ids) {
          expect(byShape.get(shapeId)?.some((type) =>
            !["2", "3", "4"].includes(type))).toBe(true);
        }
        for (const shapeId of slice.nonrevenue_shape_ids) {
          expect(byShape.get(shapeId)?.every((type) =>
            ["2", "3", "4"].includes(type))).toBe(true);
        }
        for (const shapeId of slice.ambiguous_shape_ids) {
          const types = byShape.get(shapeId)!;
          expect(types.some((type) => ["2", "3", "4"].includes(type)))
            .toBe(true);
          expect(types.some((type) => !["2", "3", "4"].includes(type)))
            .toBe(true);
        }
      }
      expect(candidate.schedule_validation.post_binding.status)
        .toBe("blocked_post_gtfs_bytes_unavailable");
    }
    expect(draft.candidates.find((row) => row.gtfs_route_id === "Q69"))
      .toMatchObject({
        schedule_validation: {
          pre_binding: {
            unmatched_passenger_shape_ids: expect.arrayContaining([
              expect.any(String),
            ]),
          },
        },
        unresolved_gap_codes: expect.arrayContaining([
          "pre_schedule_shape_unmatched_to_active_gtfs",
        ]),
      });
  });

  it("keeps all 13 candidates nonterminal with no gate or persistence output", () => {
    const draft = readJson<Plan040Package3Draft>(draftPath);
    expect(draft.evidence_verdict_distribution).toEqual({
      acquisition_blocked_no_terminalization: 13,
    });
    expect(draft.proposed_decision_count).toBe(0);
    expect(draft.persisted_decision_count).toBe(0);
    expect(draft.proposed_grain_decision_count).toBe(0);
    expect(draft.persisted_grain_decision_count).toBe(0);
    expect(draft.authorization_state)
      .toBe("evidence_only_no_gate_no_persistence");
    expect(draft.freeze_readiness).toBe(
      "frozen_evidence_only_blocked_package_not_ready_for_risk_review_or_owner_gate",
    );
    expect(draft.candidates.every((candidate) =>
      candidate.evidence_verdict ===
        "acquisition_blocked_no_terminalization" &&
      candidate.proposed_extent_decision === null &&
      candidate.proposed_grain_decision === null &&
      !candidate.authorizes_occurrence &&
      !candidate.authorizes_study &&
      !candidate.authorizes_cross_product &&
      !candidate.authorizes_decision_persistence)).toBe(true);
    expect(existsSync(
      `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
      "plan-040-qbnr-stop-removal-package-3-dual-review-gate-v1.json",
    )).toBe(false);
    expect(existsSync(
      `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
      "plan-040-qbnr-stop-removal-package-3-owner-acceptance-v1.json",
    )).toBe(false);
  });

  it("fails closed if a blocked candidate gains unsupported provenance", () => {
    const draft = readJson<Plan040Package3Draft>(draftPath);
    const candidates = structuredClone(draft.candidates);
    (candidates[0]!.required_post_inventory as {
      exact_bytes_status: string;
    }).exact_bytes_status = "accepted_without_bytes";
    expect(() => buildPlan040Package3Draft({
      acquisitionReceiptPath: draft.acquisition_receipt.path,
      acquisitionReceiptSha256: draft.acquisition_receipt.sha256,
      evidenceManifestPath: draft.evidence_manifest.path,
      evidenceManifestSha256: draft.evidence_manifest.sha256,
      candidates,
    })).toThrow("gained unsupported provenance");
  });
});
