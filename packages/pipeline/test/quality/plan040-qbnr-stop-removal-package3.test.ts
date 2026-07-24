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
      exact_local_member_match_count: number;
      members: Array<{
        member: string;
        metadata_rows: number;
        metadata_sha1: string;
        local_rows: number | null;
        local_bytes: number | null;
        local_sha1: string | null;
        local_sha256: string | null;
        member_match_status: string;
      }>;
      zip_bytes_status: string;
      routes_member_status: string;
      calendar_expansion_status: string;
      ordered_stop_comparison_status: string;
      whole_zip_identity: string;
      correction_sensitivity: {
        q67_route_trip_row_count: number;
        q67_shape_row_count: number;
        q67_shape_ids: string[];
        stop_time_rows_scanned: number;
        q67_stop_time_row_count: number;
        stop_rows_scanned: number;
        q67_referenced_stop_count: number;
        ordered_chain_count: number;
        service_dates: Array<{
          service_date: string;
          active_service_ids: string[];
          q67_trip_count: number;
          q67_shape_ids: string[];
        }>;
      };
    };
    phase_2_initial_busco: {
      version_sha1: string;
      zip_sha256: null;
      exact_local_member_match_count: number;
      members: Array<{
        member: string;
        metadata_rows: number;
        metadata_sha1: string;
        local_sha1: string | null;
        member_match_status: string;
      }>;
      zip_bytes_status: string;
      member_bytes_status: string;
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
      "7417deb4c56f12d98a9ec61f486cad9b0caeb7121819b1824e874643454f697e",
    );
    expect(sha256(evidenceBytes)).toBe(
      "149809f528571fc3e49808a61ee83670121db536e691ffae88b70579e8e9ccf8",
    );
    expect(sha256(draftBytes)).toBe(
      "1a3f446553955e75c373831ea282b1b4c0a2ceda2bfaec5f00a737d270b5fdbd",
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
      exact_local_member_match_count: 7,
      zip_bytes_status: "blocked_whole_zip_bytes_unavailable",
      routes_member_status:
        "blocked_correction_routes_sha1_differs_from_staged_initial_routes",
      calendar_expansion_status:
        "computed_from_verified_content_addressed_members",
      ordered_stop_comparison_status:
        "unavailable_zero_q67_trips_in_verified_trips_member",
      whole_zip_identity:
        "not_established_correction_container_differs_and_exact_correction_zip_bytes_are_unavailable",
    });
    expect(q67.members).toHaveLength(8);
    expect(q67.members.filter((member) =>
      member.member_match_status === "exact_sha1_content_match"))
      .toHaveLength(7);
    expect(q67.members.find((member) => member.member === "routes.txt"))
      .toMatchObject({
        metadata_rows: 269,
        metadata_sha1: "6cbdad5c2d3bb7b667ff54ef6f7fcc3b78d3a7a9",
        local_rows: 323,
        local_sha1: "e65023c197262bf504c450dd5bde21041a92dc6d",
        member_match_status: "sha1_mismatch_not_target_member",
      });
    expect(q67.members.find((member) => member.member === "shapes.txt"))
      .toMatchObject({
        metadata_rows: 32512,
        metadata_sha1: "1ee10b10185e9222b58808451b82af72d8e86aff",
        local_sha1: "1ee10b10185e9222b58808451b82af72d8e86aff",
        member_match_status: "exact_sha1_content_match",
      });
    expect(q67.members.filter((member) =>
      member.member_match_status === "exact_sha1_content_match")
      .every((member) =>
        member.local_sha1 === member.metadata_sha1 &&
        member.local_sha256?.length === 64 &&
        (member.local_bytes ?? 0) > 0)).toBe(true);
    const activeServiceCounts =
      q67.correction_sensitivity.service_dates.map((date) =>
        date.active_service_ids.length);
    expect(q67.correction_sensitivity).toMatchObject({
      q67_route_trip_row_count: 0,
      q67_shape_row_count: 0,
      q67_shape_ids: [],
      stop_time_rows_scanned: 652139,
      q67_stop_time_row_count: 0,
      stop_rows_scanned: 1391,
      q67_referenced_stop_count: 0,
      ordered_chain_count: 0,
      service_dates: [
        {
          service_date: "2025-06-29",
          active_service_ids: expect.arrayContaining([
            "JA_C5-Sunday",
          ]),
          q67_trip_count: 0,
          q67_shape_ids: [],
        },
        {
          service_date: "2025-06-30",
          active_service_ids: expect.arrayContaining([
            "JA_C5-Weekday",
          ]),
          q67_trip_count: 0,
          q67_shape_ids: [],
        },
      ],
    });
    expect(activeServiceCounts).toEqual([5, 5]);
    const phase2 =
      acquisition.required_exact_post_versions.phase_2_initial_busco;
    expect(phase2).toMatchObject({
      version_sha1: PLAN040_PHASE_2_INITIAL_BUSCO_SHA1,
      zip_sha256: null,
      exact_local_member_match_count: 0,
      zip_bytes_status: "blocked_whole_zip_bytes_unavailable",
      member_bytes_status:
        "blocked_no_verified_required_member_matches",
      calendar_expansion_status:
        "not_computed_required_member_bytes_unavailable",
    });
    expect(phase2.members.every((member) =>
      member.metadata_rows > 0 &&
      member.metadata_sha1.length === 40 &&
      member.local_sha1?.length === 40 &&
      member.member_match_status ===
        "sha1_mismatch_not_target_member")).toBe(true);
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
      expect(candidate.schedule_validation.post_binding.status).toBe(
        candidate.gtfs_route_id === "Q67"
          ? "reviewed_unresolved_zero_gtfs_trips_and_unmatched_schedule_shapes"
          : "blocked_post_gtfs_required_members_unavailable",
      );
    }
    expect(draft.candidates.find((row) => row.gtfs_route_id === "Q67"))
      .toMatchObject({
        required_post_inventory: {
          zip_bytes_status: "blocked_whole_zip_bytes_unavailable",
          member_bytes_status:
            "verified_content_addressed_operational_members_6_of_6",
          calendar_expansion_status:
            "computed_from_verified_content_addressed_members",
          q67_correction_sensitivity: {
            q67_route_trip_row_count: 0,
            q67_shape_row_count: 0,
          },
        },
        schedule_validation: {
          post_binding: {
            status:
              "reviewed_unresolved_zero_gtfs_trips_and_unmatched_schedule_shapes",
            unmatched_passenger_shape_ids: ["Q670022", "Q670023"],
          },
        },
        unresolved_gap_codes: [
          "ordered_full_stop_diff_unavailable_zero_q67_trips",
          "q67_correction_routes_member_unavailable",
          "q67_correction_zip_container_unavailable",
          "q67_exact_operational_members_contain_zero_route_trips",
          "q67_schedule_shapes_absent_from_exact_correction_shapes",
        ],
      });
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
      zip_bytes_status: string;
    }).zip_bytes_status = "accepted_without_bytes";
    expect(() => buildPlan040Package3Draft({
      acquisitionReceiptPath: draft.acquisition_receipt.path,
      acquisitionReceiptSha256: draft.acquisition_receipt.sha256,
      evidenceManifestPath: draft.evidence_manifest.path,
      evidenceManifestSha256: draft.evidence_manifest.sha256,
      candidates,
    })).toThrow("unavailable exact post ZIP gained unsupported provenance");
  });
});
