import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import type { JsonValue } from "../../../db/src/types";
import {
  PLAN040_PACKAGE_8_ABSENCE_RECEIPT_SHA256,
  PLAN040_PACKAGE_8_ACCEPTANCE_SHA256,
  PLAN040_PACKAGE_8_APPROVED_COMMIT,
  PLAN040_PACKAGE_8_GATE_SHA256,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ACCEPTANCE_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ABSENCE_RECEIPT_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_GATE_PATH,
  buildPlan040Package8AcceptedArtifacts,
  buildPlan040Package8GateAndAcceptance,
  validatePlan040Package8GateAndAcceptance,
} from "../../src/quality/plan040-qbnr-service-pattern-package8-closeout";
import {
  PLAN040_PACKAGE_8_CANDIDATES,
  PLAN040_PACKAGE_8_BUSCO_CORRECTION_SHA1,
  PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS,
  PLAN040_PACKAGE_8_QUEENS_CORRECTION_SHA1,
  PLAN040_PACKAGE_8_SCHEDULE_BLOCKS_SHA256,
  PLAN040_PACKAGE_8_SCHEDULE_CSV_SHA256,
  PLAN040_PACKAGE_8_SCHEDULE_RECEIPT_SHA256,
  PLAN040_PACKAGE_8_SERVICE_CHANGE_HTML_SHA256,
  PLAN040_PACKAGE_8_WAVES,
  buildPlan040Package8Draft,
  plan040Package8ReplayHash,
  type Plan040Package8CandidateEvidence,
  type Plan040Package8Draft,
  type Plan040Package8VersionSeparation,
} from "../../src/quality/plan040-qbnr-service-pattern-package8";
import { extentDecisionKey } from "../../src/quality/study-readiness-v1";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const evidencePath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-8-evidence-v1.json`;
const draftPath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-8-evidence-draft-v1.json`;
const checkpointPath =
  `${riskRoot}/plan-040-package-8-checkpoint-v1.json`;
const extentLedgerPath =
  `${repoRoot}/data/quality/operational-reference/member-extent-ledger.jsonl`;
const grainLedgerPath =
  `${repoRoot}/data/quality/operational-reference/member-grain-ledger.jsonl`;
const EVIDENCE_SHA256 =
  "3ee567af00c9eab1a50b823674cddc36f554a475b7e485f0fab3cd257858c192";
const DRAFT_SHA256 =
  "a5e53299617523fa152072a55ca2fa1f9e9515750d6595a9706c737f0c3db152";

type Package8Evidence = {
  candidate_count: number;
  route_count: number;
  candidate_key_sha256: string;
  wave_partition: typeof PLAN040_PACKAGE_8_WAVES;
  scope_reconciliation: Plan040Package8Draft["scope_reconciliation"];
  current_outcome_distribution: {
    receipt_terminal_unresolved: number;
  };
  immutable_reuse: {
    package_2: Record<"acquisition" | "evidence" | "draft", {
      path: string;
      sha256: string;
    }>;
    package_4: Record<"acquisition" | "evidence" | "draft", {
      path: string;
      sha256: string;
    }>;
    package_3_correction_context: {
      acquisition: { path: string; sha256: string };
      evidence: { path: string; sha256: string };
      correction_manifest: { path: string; sha256: string };
      correction_bytes_used: false;
      corrected_diff_used: false;
    };
    accepted_launch_feed_identities: Array<{
      family: string;
      boundary: string;
      source_id: string;
      zip_sha1: string;
      receipt_sha256: string;
      zip_sha256: string;
    }>;
    source_bytes_recomputed: false;
    external_acquisition_performed: false;
  };
  service_change_source: {
    source_html_sha256: string;
  };
  schedule_trip_type_source: {
    source_id: "mta_bus_schedules_2025_candidate_windows";
    source_csv_sha256: string;
    source_bytes: number;
    acquisition_receipt_sha256: string;
    blocks_sha256: string;
    passenger_policy: "any_trip_type_except_2_3_4";
    excluded_nonrevenue_trip_types: ["2", "3", "4"];
    source_csv_recomputed: true;
    external_acquisition_performed: false;
  };
  pristine_ledger_inputs: {
    extent: {
      sha256: string;
      candidate_count: number;
      verdict_distribution: { unreviewed: number };
    };
    grain: {
      sha256: string;
      candidate_count: number;
      verdict_distribution: { unreviewed: number };
      spatial_verdict_distribution: { unreviewed: number };
    };
  };
  staged_candidate_document_search: {
    metadata_file_count: number;
    exact_url_match_count: 0;
    external_acquisition_performed: false;
  };
  exclusion_checks: Record<string, {
    prior_candidate_count: number;
    overlap_count: number;
  }>;
  version_separation: Plan040Package8VersionSeparation;
  candidates: Plan040Package8CandidateEvidence[];
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const readJsonl = (path: string): Array<Record<string, unknown>> => {
  const text = readFileSync(path, "utf8").trim();
  return text
    ? text.split("\n").map((line) =>
      JSON.parse(line) as Record<string, unknown>)
    : [];
};
const priorKeys = (path: string): string[] => {
  const parsed = readJson<{
    candidates?: Array<{ candidate_key: string }>;
    decisions?: Array<{
      occurrence_id: string;
      route_record_id: string;
      treatment_record_id: string;
    }>;
  }>(path);
  return (
    parsed.candidates?.map((candidate) => candidate.candidate_key) ??
      parsed.decisions?.map(extentDecisionKey) ??
      []
  );
};
const buildInput = (
  evidence: Package8Evidence,
  candidates = evidence.candidates,
) => ({
  evidenceManifestPath:
    "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-8-evidence-v1.json",
  evidenceManifestSha256: EVIDENCE_SHA256,
  candidates,
  versionSeparation: evidence.version_separation,
  priorCandidateKeys: {
    package_2: priorKeys(
      `${riskRoot}/plan-040-qbnr-stop-removal-package-2-decision-draft-v1.json`,
    ),
    package_4: priorKeys(
      `${riskRoot}/plan-040-qbnr-stop-removal-package-4-evidence-draft-v1.json`,
    ),
    package_5: priorKeys(
      `${riskRoot}/plan-040-qbnr-stop-removal-package-5-evidence-draft-v1.json`,
    ),
    package_6: priorKeys(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-6-evidence-draft-v1.json`,
    ),
    package_7: priorKeys(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-7-evidence-draft-v1.json`,
    ),
    exemplar: priorKeys(
      `${repoRoot}/data/quality/operational-reference/` +
      "member-extent-ledger-decisions/plan-040-exemplar-v1.json",
    ),
  },
});

describe("Plan 040 QBNR Package 8 accelerated source-gap freeze", () => {
  it("freezes the exact 30 candidates as two exact 15-row waves", () => {
    const evidenceBytes = readFileSync(evidencePath);
    const draftBytes = readFileSync(draftPath);
    const evidence = JSON.parse(
      evidenceBytes.toString("utf8"),
    ) as Package8Evidence;
    const draft = JSON.parse(
      draftBytes.toString("utf8"),
    ) as Plan040Package8Draft;

    expect(sha256(evidenceBytes)).toBe(EVIDENCE_SHA256);
    expect(sha256(draftBytes)).toBe(DRAFT_SHA256);
    expect(plan040Package8ReplayHash(
      draft as unknown as JsonValue,
    )).toBe(DRAFT_SHA256);
    expect(evidence.candidate_count).toBe(30);
    expect(evidence.route_count).toBe(18);
    expect(draft.candidate_count).toBe(30);
    expect(draft.route_count).toBe(18);
    expect(evidence.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256,
    );
    expect(draft.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256,
    );
    expect(evidence.wave_partition).toEqual(PLAN040_PACKAGE_8_WAVES);
    expect(draft.wave_partition).toEqual(PLAN040_PACKAGE_8_WAVES);
    expect(draft.candidates.map((candidate) => [
      candidate.risk_wave_id,
      candidate.gtfs_route_id,
      candidate.treatment_record_id,
    ])).toEqual(PLAN040_PACKAGE_8_CANDIDATES);
    expect(PLAN040_PACKAGE_8_WAVES.map((wave) => {
      const rows = draft.candidates.filter((candidate) =>
        candidate.risk_wave_id === wave.wave_id);
      return [
        rows.length,
        new Set(rows.map((candidate) =>
          candidate.gtfs_route_id)).size,
      ];
    })).toEqual([[15, 8], [15, 10]]);
  });

  it("reconciles the prior 16-row B estimate to 15 without padding", () => {
    const evidence = readJson<Package8Evidence>(evidencePath);
    const draft = readJson<Plan040Package8Draft>(draftPath);
    const expected = {
      prior_wave_b_estimate: 16,
      exact_wave_b_count: 15,
      reconciliation:
        "reconciled_to_exact_ledger_rows_no_one_boundary_route_added",
      guessed_candidate_count: 0,
      forced_one_boundary_route_count: 0,
    };
    expect(evidence.scope_reconciliation).toEqual(expected);
    expect(draft.scope_reconciliation).toEqual(expected);
    expect(draft.evidence_verdict_distribution).toEqual({
      receipt_terminal_unresolved: 30,
    });
    expect(draft.proposed_extent_decision_count).toBe(0);
    expect(draft.proposed_grain_decision_count).toBe(0);
  });

  it("pins exact P2/P4 route documents and the eight post shape mismatches", () => {
    const evidence = readJson<Package8Evidence>(evidencePath);
    expect(evidence.immutable_reuse.package_2).toEqual({
      acquisition: expect.objectContaining({
        sha256:
          PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_2.acquisition,
      }),
      evidence: expect.objectContaining({
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_2.evidence,
      }),
      draft: expect.objectContaining({
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_2.draft,
      }),
    });
    expect(evidence.immutable_reuse.package_4).toEqual({
      acquisition: expect.objectContaining({
        sha256:
          PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_4.acquisition,
      }),
      evidence: expect.objectContaining({
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_4.evidence,
      }),
      draft: expect.objectContaining({
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_4.draft,
      }),
    });
    const expectedPostMismatch: Record<string, [string[], string[]]> = {
      Q17: [["Q170351", "Q170352"], ["Q170331", "Q170340"]],
      Q23: [["Q230218"], ["Q230216"]],
      Q25: [["Q250253"], ["Q250249"]],
      Q27: [["Q270286", "Q270289", "Q270290"], ["Q270267"]],
      Q76: [["Q760178"], ["Q760150"]],
      Q83: [["Q830072"], ["Q830061"]],
      Q110: [["Q1100190"], ["Q1100189"]],
      QM4: [["QM40186"], ["QM40180"]],
    };
    const rows = evidence.candidates.filter((candidate) =>
      candidate.risk_wave_id === "P8-A");
    expect(rows).toHaveLength(15);
    for (const candidate of rows) {
      const immutable = candidate.immutable_p2_p4_context!;
      const gap = candidate.schedule_to_gtfs_shape_gap!;
      expect(immutable.candidate_document.source_url).toStartWith(
        "https://www.mta.info/document/",
      );
      expect(immutable.candidate_document.receipt_sha256).toHaveLength(64);
      expect(immutable.candidate_document.pdf_sha256).toHaveLength(64);
      expect(immutable.candidate_document.document_is_full_stop_chain).toBe(
        false,
      );
      expect(gap.pre_shape_sets_match).toBe(true);
      expect(gap.pre.schedule_only_shape_ids).toEqual([]);
      expect(gap.pre.gtfs_only_shape_ids).toEqual([]);
      expect([
        gap.post.schedule_only_shape_ids,
        gap.post.gtfs_only_shape_ids,
      ]).toEqual(expectedPostMismatch[candidate.gtfs_route_id]);
      expect(gap.binding_status).toBe(
        "blocked_post_schedule_gtfs_shape_identity_mismatch",
      );
      expect(candidate.schedule_trip_type_validation).toBeNull();
      const correction = candidate.correction_sensitivity!;
      expect(correction.feed_family).toBe(
        candidate.boundary_inventory.post.feed_family,
      );
      expect(correction.published_initial_post_sha1).toBe(
        candidate.boundary_inventory.post.zip_sha1,
      );
      expect(correction.correction_version_sha1).toBe(
        correction.feed_family === "queens"
          ? PLAN040_PACKAGE_8_QUEENS_CORRECTION_SHA1
          : PLAN040_PACKAGE_8_BUSCO_CORRECTION_SHA1,
      );
      expect(correction).toEqual(expect.objectContaining({
        status:
          "nonauthorizing_initial_shape_mismatch_may_be_correction_sensitive",
        corrected_first_week_diff_status: "blocked_not_run",
        correction_bytes_used: false,
        corrected_diff_used: false,
      }));
      expect(candidate.unresolved_gap_codes).toContain(
        "initial_shape_mismatch_may_be_correction_sensitive",
      );
      expect(candidate.unresolved_gap_codes).toContain(
        "corrected_first_week_diff_blocked_not_run",
      );
      expect(candidate.candidate_document_gap).toBeNull();
    }
  });

  it("pins immutable correction identities and keeps both comparison roles separate", () => {
    const evidence = readJson<Package8Evidence>(evidencePath);
    const separation = evidence.version_separation;
    expect(evidence.immutable_reuse.package_3_correction_context).toEqual({
      acquisition: expect.objectContaining({
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_3.acquisition,
      }),
      evidence: expect.objectContaining({
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_3.evidence,
      }),
      correction_manifest: expect.objectContaining({
        sha256:
          PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_3.correction_manifest,
      }),
      correction_bytes_used: false,
      corrected_diff_used: false,
    });
    expect(separation.immutable_correction_context).toEqual({
      package_3_acquisition: expect.objectContaining({
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_3.acquisition,
      }),
      package_3_evidence: expect.objectContaining({
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_3.evidence,
      }),
      correction_manifest: expect.objectContaining({
        sha256:
          PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_3.correction_manifest,
      }),
    });
    expect(separation.published_launch_diff).toEqual({
      status: "completed_from_accepted_initial_feed_bytes",
      comparison_role: "published_launch_diff",
      initial_post_versions: {
        queens: {
          source_id: "gtfs_static_20250626_queens_post_qbnr",
          zip_sha1: "c868290ddcd79c69712d809ece96d96dbad2c613",
          zip_sha256:
            "4db0f151dc541f2669dde72f104c7803b0f99258bc5d14278b04c8016ce7471a",
        },
        busco: {
          source_id: "gtfs_static_20250626_busco_post_qbnr",
          zip_sha1: "54653b3fafb5fabc5ab1c941780b871343138440",
          zip_sha256:
            "7d0e5651d5cc5c3ac86973dc664e16a05e9245bea156f566c39e71506128670e",
        },
      },
      correction_version_sha1s_used: [],
      correction_bytes_used: false,
    });

    const corrected = separation.corrected_first_week_diff;
    expect(corrected).toEqual(expect.objectContaining({
      status: "blocked_not_run",
      comparison_role: "corrected_first_week_diff",
      comparison_run: false,
      correction_bytes_used: false,
      corrected_diff_used: false,
      published_launch_outcomes_reclassified: false,
      block_reason:
        "exact_correction_zip_bytes_unavailable_and_required_member_set_not_accepted",
    }));
    expect(corrected.corrections.queens).toEqual({
      feed_family: "queens",
      version_sha1: PLAN040_PACKAGE_8_QUEENS_CORRECTION_SHA1,
      fetched_at: "2025-06-30T15:46:28.558891Z",
      metadata_url:
        "https://www.transit.land/feeds/f-dr5x-mtanyctbusqueens/versions/" +
        PLAN040_PACKAGE_8_QUEENS_CORRECTION_SHA1,
      service_window: { start: "2025-06-28", end: "2025-08-30" },
      route_count: 269,
      stop_count: 1391,
      stop_time_count: 652139,
      trip_count: 24721,
      member_sha1s: {
        calendar_dates_txt: "2cad2b1716cc4b899bc6a208307131cf44279dd8",
        calendar_txt: "91183ad2187f37991e266ca1f549774384614726",
        stop_times_txt: "00c4676204737f35524627514a0e11f8f6ad65a7",
        stops_txt: "bd9d9f4d48ae4472d689c3dce8bbcb85421cb475",
        trips_txt: "08d77fa5c44ba2d052cb8151765f47b13c573848",
      },
      acquisition_status: "full_sha1_observed_bytes_not_accepted",
      exact_zip_bytes_status: "blocked_unavailable",
      exact_member_bytes_status:
        "queens_partial_content_matches_routes_member_mismatch",
      zip_sha256: null,
      correction_bytes_used: false,
      corrected_diff_used: false,
    });
    expect(corrected.corrections.busco).toEqual({
      feed_family: "busco",
      version_sha1: PLAN040_PACKAGE_8_BUSCO_CORRECTION_SHA1,
      fetched_at: "2025-07-03",
      metadata_url: null,
      service_window: { start: "2025-06-29", end: "2025-08-30" },
      route_count: 92,
      stop_count: 3163,
      stop_time_count: 803149,
      trip_count: 28419,
      member_sha1s: {
        calendar_dates_txt: "1630be2890679c5136fe298e811caeba5d90f1d6",
        calendar_txt: "05cea37704c833bf6ae2789bc0a92c4b293f51a6",
        stop_times_txt: "f714c895c98e82c37bbd37deb6a67abd7bcd7f71",
        stops_txt: "3d77f6acb9d2a0f580c985934acdd58f1322a187",
        trips_txt: "486c9a4acccbcaa4f73bbbc9bbd848258c1dad87",
      },
      acquisition_status: "full_sha1_observed_bytes_not_accepted",
      exact_zip_bytes_status: "blocked_unavailable",
      exact_member_bytes_status:
        "busco_no_exact_correction_members_accepted",
      zip_sha256: null,
      correction_bytes_used: false,
      corrected_diff_used: false,
    });
  });

  it("pins both active same-family inventories and exact missing-doc searches for B", () => {
    const evidence = readJson<Package8Evidence>(evidencePath);
    const rows = evidence.candidates.filter((candidate) =>
      candidate.risk_wave_id === "P8-B");
    const expectedPostMismatches: Record<string, {
      schedule: string[];
      gtfs: string[];
      matched: string[];
      scheduleOnly: string[];
      gtfsOnly: string[];
    }> = {
      Q36: {
        schedule: ["Q360169", "Q360170", "Q360186", "Q360187"],
        gtfs: ["Q360166", "Q360168", "Q360169", "Q360170"],
        matched: ["Q360169", "Q360170"],
        scheduleOnly: ["Q360186", "Q360187"],
        gtfsOnly: ["Q360166", "Q360168"],
      },
      Q85: {
        schedule: ["Q850420", "Q850437"],
        gtfs: ["Q850420", "Q850421"],
        matched: ["Q850420"],
        scheduleOnly: ["Q850437"],
        gtfsOnly: ["Q850421"],
      },
    };
    expect(rows).toHaveLength(15);
    for (const candidate of rows) {
      const inventories = candidate.boundary_inventory;
      expect(inventories.same_feed_family).toBe(true);
      expect(inventories.both_boundaries_active).toBe(true);
      expect(inventories.pre.feed_family).toBe(
        inventories.post.feed_family,
      );
      for (const inventory of [inventories.pre, inventories.post]) {
        expect(inventory.calendar_and_calendar_dates_expanded).toBe(true);
        expect(inventory.active_service_ids.length).toBeGreaterThan(0);
        expect(inventory.active_route_trip_count).toBeGreaterThan(0);
        expect(inventory.active_shape_ids.length).toBeGreaterThan(0);
        expect(inventory.ordered_full_stop_pattern_count).toBeGreaterThan(0);
        expect(inventory.receipt_sha256).toHaveLength(64);
        expect(inventory.zip_sha1).toHaveLength(40);
        expect(inventory.zip_sha256).toHaveLength(64);
        expect(inventory.inventory_role).toBe(
          "raw_active_gtfs_inventory_nonauthorizing_not_schedule_trip_type_validated",
        );
      }
      const schedule = candidate.schedule_trip_type_validation!;
      expect(schedule.source_id).toBe(
        "mta_bus_schedules_2025_candidate_windows",
      );
      expect(schedule.source_csv_sha256).toBe(
        PLAN040_PACKAGE_8_SCHEDULE_CSV_SHA256,
      );
      expect(schedule.acquisition_receipt_sha256).toBe(
        PLAN040_PACKAGE_8_SCHEDULE_RECEIPT_SHA256,
      );
      expect(schedule.blocks_sha256).toBe(
        PLAN040_PACKAGE_8_SCHEDULE_BLOCKS_SHA256,
      );
      expect(schedule.passenger_policy).toBe(
        "any_trip_type_except_2_3_4",
      );
      expect(schedule.excluded_nonrevenue_trip_types).toEqual(["2", "3", "4"]);
      expect(schedule.raw_gtfs_inventory_role).toBe(
        "nonauthorizing_not_schedule_trip_type_validated",
      );
      expect(schedule.pre.shape_sets_match).toBe(true);
      expect(schedule.pre.schedule_only_passenger_shape_ids).toEqual([]);
      expect(schedule.pre.gtfs_only_active_shape_ids).toEqual([]);
      expect(schedule.pre.ambiguous_shape_ids).toEqual([]);
      expect(schedule.post.ambiguous_shape_ids).toEqual([]);
      expect(schedule.pre.schedule_slice_sha256).toHaveLength(64);
      expect(schedule.post.schedule_slice_sha256).toHaveLength(64);
      expect(schedule.pre.route_id).toBe(candidate.gtfs_route_id);
      expect(schedule.post.route_id).toBe(candidate.gtfs_route_id);
      expect(schedule.pre.schedule_date).toStartWith(
        inventories.pre.target_date,
      );
      expect(schedule.post.schedule_date).toStartWith(
        inventories.post.target_date,
      );
      expect(schedule.pre.gtfs_active_full_stop_shape_ids).toEqual(
        inventories.pre.ordered_full_stop_pattern_shape_ids,
      );
      expect(schedule.post.gtfs_active_full_stop_shape_ids).toEqual(
        inventories.post.ordered_full_stop_pattern_shape_ids,
      );
      const mismatch = expectedPostMismatches[candidate.gtfs_route_id];
      if (mismatch) {
        expect(schedule.binding_status).toBe(
          "blocked_post_schedule_gtfs_shape_identity_mismatch",
        );
        expect(schedule.post.shape_sets_match).toBe(false);
        expect(schedule.post.schedule_passenger_shape_ids).toEqual(
          mismatch.schedule,
        );
        expect(schedule.post.gtfs_active_full_stop_shape_ids).toEqual(
          mismatch.gtfs,
        );
        expect(schedule.post.matched_passenger_shape_ids).toEqual(
          mismatch.matched,
        );
        expect(schedule.post.schedule_only_passenger_shape_ids).toEqual(
          mismatch.scheduleOnly,
        );
        expect(schedule.post.gtfs_only_active_shape_ids).toEqual(
          mismatch.gtfsOnly,
        );
        expect(candidate.correction_sensitivity).toEqual(
          expect.objectContaining({
            feed_family: "queens",
            published_initial_post_sha1:
              "c868290ddcd79c69712d809ece96d96dbad2c613",
            correction_version_sha1:
              PLAN040_PACKAGE_8_QUEENS_CORRECTION_SHA1,
            corrected_first_week_diff_status: "blocked_not_run",
            correction_bytes_used: false,
            corrected_diff_used: false,
          }),
        );
        expect(candidate.unresolved_gap_codes).toContain(
          "post_schedule_gtfs_shape_identity_mismatch",
        );
        expect(candidate.unresolved_gap_codes).toContain(
          "initial_shape_mismatch_may_be_correction_sensitive",
        );
        expect(candidate.unresolved_gap_codes).toContain(
          "corrected_first_week_diff_blocked_not_run",
        );
      } else {
        expect(schedule.binding_status).toBe(
          "validated_exact_passenger_shape_sets_match_both_boundaries",
        );
        expect(schedule.post.shape_sets_match).toBe(true);
        expect(schedule.post.schedule_only_passenger_shape_ids).toEqual([]);
        expect(schedule.post.gtfs_only_active_shape_ids).toEqual([]);
        expect(candidate.correction_sensitivity).toBeUndefined();
      }
      const gap = candidate.candidate_document_gap!;
      expect(gap.required_source_roles).toEqual([
        "candidate_specific_service_detail",
        "candidate_specific_schedule_or_timetable",
      ]);
      expect(gap.exact_url_searches.map((search) =>
        search.source_role)).toEqual(gap.required_source_roles);
      expect(gap.exact_url_searches.every((search) =>
        search.source_url.startsWith("https://www.mta.info/") &&
        search.matched_staged_source_ids.length === 0)).toBe(true);
      expect(gap.external_acquisition_performed).toBe(false);
      expect(candidate.immutable_p2_p4_context).toBeNull();
      expect(candidate.schedule_to_gtfs_shape_gap).toBeNull();
    }
    expect(
      evidence.staged_candidate_document_search.metadata_file_count,
    ).toBeGreaterThan(0);
    expect(
      evidence.staged_candidate_document_search.exact_url_match_count,
    ).toBe(0);
  });

  it("pins the service rows, feeds, searches, and pristine ledgers", () => {
    const evidence = readJson<Package8Evidence>(evidencePath);
    expect(evidence.service_change_source.source_html_sha256).toBe(
      PLAN040_PACKAGE_8_SERVICE_CHANGE_HTML_SHA256,
    );
    expect(evidence.schedule_trip_type_source).toEqual(expect.objectContaining({
      source_id: "mta_bus_schedules_2025_candidate_windows",
      source_csv_sha256: PLAN040_PACKAGE_8_SCHEDULE_CSV_SHA256,
      source_bytes: 1419827780,
      acquisition_receipt_sha256:
        PLAN040_PACKAGE_8_SCHEDULE_RECEIPT_SHA256,
      blocks_sha256: PLAN040_PACKAGE_8_SCHEDULE_BLOCKS_SHA256,
      passenger_policy: "any_trip_type_except_2_3_4",
      excluded_nonrevenue_trip_types: ["2", "3", "4"],
      source_csv_recomputed: true,
      external_acquisition_performed: false,
    }));
    expect(evidence.immutable_reuse.accepted_launch_feed_identities.map(
      (feed) => [
        feed.family,
        feed.boundary,
        feed.source_id,
        feed.zip_sha1,
      ],
    )).toEqual([
      [
        "queens",
        "pre",
        "gtfs_static_20250615_queens_pre_qbnr",
        "c96466458c55036cd6feeadc291bf5951d6c3274",
      ],
      [
        "busco",
        "pre",
        "gtfs_static_20250625_busco_pre_qbnr",
        "a52f278150cd9bc03082f76fccd57f1c8c331d3c",
      ],
      [
        "queens",
        "post",
        "gtfs_static_20250626_queens_post_qbnr",
        "c868290ddcd79c69712d809ece96d96dbad2c613",
      ],
      [
        "busco",
        "post",
        "gtfs_static_20250626_busco_post_qbnr",
        "54653b3fafb5fabc5ab1c941780b871343138440",
      ],
    ]);
    expect(evidence.pristine_ledger_inputs.extent.sha256).toBe(
      PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.extent_ledger,
    );
    expect(evidence.pristine_ledger_inputs.grain.sha256).toBe(
      PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.grain_ledger,
    );
    for (const candidate of evidence.candidates) {
      expect(candidate.ledger_snapshot).toEqual({
        extent_verdict: "unreviewed",
        grain_verdict: "unreviewed",
        grain_spatial_verdict: "unreviewed",
        current_extent_kind: "unresolved",
        extent_receipt_ids: [],
        grain_receipt_ids: [],
        extent_decision_id: null,
        grain_decision_id: null,
        extent_updated_at: null,
        grain_updated_at: null,
      });
      expect(candidate.source_statement.raw_text.length).toBeGreaterThan(0);
      expect(candidate.source_statement.evidence_id.length).toBeGreaterThan(0);
      expect(candidate.source_row.route_row).toBe(candidate.gtfs_route_id);
      expect(candidate.source_row.anchors.length).toBeGreaterThan(0);
      expect(candidate.exact_candidate_searches.length).toBeGreaterThan(2);
    }
  });

  it("has zero prior overlap and the frozen draft grants no authority", () => {
    const evidence = readJson<Package8Evidence>(evidencePath);
    const draft = readJson<Plan040Package8Draft>(draftPath);
    expect(Object.values(evidence.exclusion_checks).every((entry) =>
      entry.overlap_count === 0)).toBe(true);
    expect(draft.prior_package_overlap).toEqual({
      package_2: 0,
      package_4: 0,
      package_5: 0,
      package_6: 0,
      package_7: 0,
      exemplar: 0,
    });
    expect(evidence.external_acquisition_performed).toBe(false);
    expect(evidence.authorizes_occurrence).toBe(false);
    expect(evidence.authorizes_study).toBe(false);
    expect(evidence.authorizes_cross_product).toBe(false);
    expect(evidence.authorizes_decision_persistence).toBe(false);
    expect(draft.persisted_extent_decision_count).toBe(0);
    expect(draft.persisted_grain_decision_count).toBe(0);
    expect(draft.review_protocol).toEqual({
      dual_independent_review_required: true,
      owner_gate_allowed_before_dual_review: false,
      persistence_allowed_before_owner_gate: false,
    });
  });

  it("freezes a compact dual-review gate and exact owner-delegate absence acceptance", () => {
    expect(existsSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_GATE_PATH,
    )).toBe(true);
    expect(existsSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ACCEPTANCE_PATH,
    )).toBe(true);
    const draft = readJson<Plan040Package8Draft>(draftPath);
    const gate = readJson<Record<string, unknown>>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_GATE_PATH,
    );
    const acceptance = readJson<Record<string, unknown>>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ACCEPTANCE_PATH,
    );
    expect(sha256(readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_GATE_PATH,
    ))).toBe(PLAN040_PACKAGE_8_GATE_SHA256);
    expect(sha256(readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ACCEPTANCE_PATH,
    ))).toBe(PLAN040_PACKAGE_8_ACCEPTANCE_SHA256);
    expect(validatePlan040Package8GateAndAcceptance({
      draft,
      gate,
      acceptance,
      acceptedAt: acceptance.accepted_at as string,
    })).toEqual({
      candidate_count: 30,
      positive_candidate_count: 0,
      reviewed_terminal_unresolved_candidate_count: 30,
      authorized_extent_decision_count: 0,
      authorized_grain_decision_count: 0,
      authorized_absence_candidate_count: 30,
      persisted_decision_count: 0,
      persisted_absence_receipt_count: 0,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(gate.reviewed_commit).toBe(PLAN040_PACKAGE_8_APPROVED_COMMIT);
    expect(gate).not.toHaveProperty("candidate_keys");
    expect(gate.authorization_state).toBe(
      "dual_review_approved_pending_owner_delegate_acceptance",
    );
    expect(gate.authorizes_decision_persistence).toBe(false);
    expect(gate.authorizes_occurrence).toBe(false);
    expect(acceptance.authorization_state).toBe(
      "owner_delegate_accepted_exact_30_key_reviewed_absence_only",
    );
    expect(acceptance.authorizes_decision_persistence).toBe(false);
    expect(acceptance.authorizes_reviewed_absence_receipt_persistence)
      .toBe(true);
    expect(acceptance.authorizes_occurrence).toBe(false);
    expect(buildPlan040Package8GateAndAcceptance({
      draft,
      acceptedAt: acceptance.accepted_at as string,
    }).gate).toEqual(gate);
    expect(() =>
      buildPlan040Package8AcceptedArtifacts({
        draft,
        gate: gate as never,
        acceptance: {
          ...acceptance,
          authorizes_occurrence: true,
        } as never,
      })).toThrow(
        "owner/delegate acceptance drifted",
      );
  });

  it("persists one exact 30-key dual-surface reviewed-absence receipt and zero positives", () => {
    const draft = readJson<Plan040Package8Draft>(draftPath);
    const gate = readJson<Record<string, unknown>>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_GATE_PATH,
    );
    const acceptance = readJson<Record<string, unknown>>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ACCEPTANCE_PATH,
    );
    const absenceStore = readJson<{
      receipts: Array<{
        receipt_id: string;
        surfaces: string[];
        extent_keys: Array<{
          occurrence_id: string;
          route_record_id: string;
          treatment_record_id: string;
        }>;
        exact_searches: string[];
        urls_inspected: string[];
        authorizes_study: boolean;
        authorizes_cross_product: boolean;
      }>;
    }>(PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ABSENCE_RECEIPT_PATH);

    expect(sha256(readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_8_ABSENCE_RECEIPT_PATH,
    ))).toBe(PLAN040_PACKAGE_8_ABSENCE_RECEIPT_SHA256);
    expect(absenceStore.receipts).toHaveLength(1);
    expect(absenceStore.receipts[0]).toMatchObject({
      receipt_id:
        "plan-040-qbnr-service-pattern-package-8-reviewed-absence-v1",
      surfaces: ["member_extent", "member_grain"],
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(absenceStore.receipts[0]!.extent_keys).toHaveLength(30);
    expect(absenceStore.receipts[0]!.exact_searches).toHaveLength(30);
    expect(new Set(absenceStore.receipts[0]!.exact_searches).size).toBe(30);
    expect(absenceStore.receipts[0]!.urls_inspected).toHaveLength(28);
    const accepted = buildPlan040Package8AcceptedArtifacts({
      draft,
      gate: gate as never,
      acceptance: acceptance as never,
    });
    expect(accepted.extentDecisions).toEqual([]);
    expect(accepted.grainDecisions).toEqual([]);
    expect(accepted.absenceReceipt).toEqual(absenceStore.receipts[0]);
  });

  it("replays Package 8 rows within the exact current ledger distributions", () => {
    const draft = readJson<Plan040Package8Draft>(draftPath);
    const candidateKeys = new Set(draft.candidates.map((candidate) =>
      candidate.candidate_key));
    const allExtentRows = readJsonl(extentLedgerPath);
    const allGrainRows = readJsonl(grainLedgerPath);
    const extentRows = allExtentRows.filter((row) =>
      candidateKeys.has(extentDecisionKey(row as never)));
    const grainRows = allGrainRows.filter((row) =>
      candidateKeys.has(extentDecisionKey(row as never)));

    expect(extentRows).toHaveLength(30);
    expect(grainRows).toHaveLength(30);
    expect(extentRows.every((row) =>
      row.verdict === "absent_in_source" &&
      row.current_extent_kind === "unresolved" &&
      (row.receipt_ids as string[]).includes(
        "plan-040-qbnr-service-pattern-package-8-reviewed-absence-v1",
      ))).toBe(true);
    expect(grainRows.every((row) =>
      row.verdict === "absent_in_source" &&
      row.member_extent_decision_id === null &&
      row.service_scope === null &&
      (row.receipt_ids as string[]).includes(
        "plan-040-qbnr-service-pattern-package-8-reviewed-absence-v1",
      ))).toBe(true);
    expect(Object.fromEntries([
      "absent_in_source",
      "resolved:bounded_segment",
      "resolved:route_wide",
      "resolved:stop_set",
      "unreviewed",
    ].map((verdict) => [
      verdict,
      allExtentRows.filter((row) => row.verdict === verdict).length,
    ]))).toEqual({
      absent_in_source: 165,
      "resolved:bounded_segment": 29,
      "resolved:route_wide": 14,
      "resolved:stop_set": 4,
      unreviewed: 96,
    });
    expect(Object.fromEntries([
      "absent_in_source",
      "blocked_upstream:accepted_date_resolution+feed_version_resolution",
      "blocked_upstream:branch_lineage_mapping+direction_lineage_mapping",
      "blocked_upstream:corrected_initial_feed_bytes+published_launch_conflict_resolution",
      "blocked_upstream:effective_date_full_stop_inventory+frequency_evidence+later_feed_lineage",
      "not_applicable",
      "resolved",
      "unreviewed",
    ].map((verdict) => [
      verdict,
      allGrainRows.filter((row) => row.verdict === verdict).length,
    ]))).toEqual({
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
  });

  it("records the 50-candidate checkpoint and bounded Package 7 projection repair", () => {
    const checkpoint = readJson<{
      receipt_id: string;
      checkpoint_scope: {
        newly_closed_since_repaired_baseline: number;
      };
      full_repository_checkpoint: {
        counts: Record<string, number>;
      };
      pinned_baseline: {
        path: string;
        sha256: string;
      };
      comparison: {
        known_missing_corpus_family: {
          signature_unchanged: boolean;
          failed_tests: string[];
        };
        additional_failure: {
          classification: string;
          package_8_receipt_caused_projection_change: boolean;
          semantic_baseline_change: boolean;
        };
      };
      derived_projection_repair: {
        scope: {
          review_ledger_rows_added: number;
          operational_extent_rows_replaced: number;
          bridge_rows_replaced: number;
          package_7_positive_distribution: Record<string, number>;
          package_8_positive_projection_rows: number;
          package_8_reviewed_absence_rows: number;
        };
        review_decision_ids: string[];
        generated_files: Array<{
          path: string;
          sha256: string;
        }>;
        full_repository_suite_rerun: boolean;
      };
      authority: Record<string, boolean>;
      next_action: {
        package_9_started: boolean;
        plan_transition_started: boolean;
      };
    }>(checkpointPath);

    expect(checkpoint.receipt_id).toBe(
      "plan-040-package-8-checkpoint-v1",
    );
    expect(
      checkpoint.checkpoint_scope.newly_closed_since_repaired_baseline,
    ).toBe(50);
    expect(checkpoint.full_repository_checkpoint.counts).toEqual({
      pass: 1750,
      skip: 1,
      fail: 10,
      error: 1,
      test_count: 1761,
      test_file_count: 146,
      expect_call_count: 602716,
    });
    expect(sha256(readFileSync(
      `${repoRoot}/${checkpoint.pinned_baseline.path}`,
    ))).toBe(checkpoint.pinned_baseline.sha256);
    expect(
      checkpoint.comparison.known_missing_corpus_family.signature_unchanged,
    ).toBe(true);
    expect(
      checkpoint.comparison.known_missing_corpus_family.failed_tests,
    ).toHaveLength(9);
    expect(checkpoint.comparison.additional_failure).toMatchObject({
      classification:
        "accepted_package7_positive_projection_not_yet_regenerated",
      package_8_receipt_caused_projection_change: false,
      semantic_baseline_change: false,
    });
    expect(checkpoint.derived_projection_repair.scope).toEqual({
      review_ledger_rows_added: 10,
      operational_extent_rows_replaced: 10,
      bridge_rows_replaced: 10,
      package_7_positive_distribution: {
        bounded_segment: 8,
        route_wide: 2,
      },
      package_8_positive_projection_rows: 0,
      package_8_reviewed_absence_rows: 30,
    });
    expect(checkpoint.derived_projection_repair.review_decision_ids)
      .toHaveLength(10);
    expect(checkpoint.derived_projection_repair.generated_files).toEqual([
      {
        path:
          "data/contracts/operational-occurrence-member-extent/v1/" +
          "manifest.json",
        sha256:
          "edd9a6d81aa0ccd42fcafaa78cb97c773f5b1b6b6ae005f71526faa9c92065db",
      },
      {
        path:
          "data/contracts/operational-occurrence-member-extent/v1/" +
          "operational_occurrence_member_extents.jsonl",
        sha256:
          "f3c9a5e53803ba584d6afbea9f88228e6cf384bdee3135c04a4a791f1f0a470d",
      },
      {
        path:
          "data/contracts/operational-occurrence-member-extent/v1/" +
          "review-ledger.jsonl",
        sha256:
          "41aaf528049ab3d14c0fcf7327e0db855e5ca26ae8a14f433b00e47364e54496",
      },
      {
        path:
          "data/contracts/operational-occurrence-member-extent/v1/" +
          "summary.json",
        sha256:
          "a714e3ec0bb7971f681d5903fe9bfc535cbe0cdf2765b183d73267b1cf2c32dd",
      },
      {
        path: "data/quality/study-readiness/v1/bridge-ledger.jsonl",
        sha256:
          "1db778242e5bb2cd10c65ae4177d550746db8d3b306c91d47a34402c1fafb90a",
      },
      {
        path: "data/quality/study-readiness/v1/manifest.json",
        sha256:
          "920d1bba5fda9d5ec884533e1b9870c4e24806a976e87cc981940730bbf41fbc",
      },
    ]);
    expect(
      checkpoint.derived_projection_repair.generated_files.every(
        (file) => existsSync(`${repoRoot}/${file.path}`),
      ),
    ).toBe(true);
    expect(
      checkpoint.derived_projection_repair.full_repository_suite_rerun,
    ).toBe(false);
    expect(Object.values(checkpoint.authority).every((value) =>
      value === false || value === true)).toBe(true);
    expect(checkpoint.authority).toEqual({
      nonauthorizing_checkpoint_receipt: true,
      authorizes_decision_persistence: false,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      changes_evidence_outcomes: false,
      changes_ontology_or_grain: false,
    });
    expect(checkpoint.next_action).toEqual({
      package_9_started: false,
      plan_transition_started: false,
    });
  });

  it("rebuilds deterministically and rejects scope, gap, or authority mutations", () => {
    const evidence = readJson<Package8Evidence>(evidencePath);
    const draft = readJson<Plan040Package8Draft>(draftPath);
    expect(buildPlan040Package8Draft(buildInput(evidence))).toEqual(draft);

    const authorized = structuredClone(evidence.candidates);
    authorized[0]!.authorizes_occurrence = true as false;
    expect(() =>
      buildPlan040Package8Draft(buildInput(evidence, authorized))).toThrow(
        "evidence, ledger, or authority scope drifted",
      );

    const shapeGapRemoved = structuredClone(evidence.candidates);
    shapeGapRemoved.find((candidate) =>
      candidate.risk_wave_id === "P8-A")!
      .schedule_to_gtfs_shape_gap!.post.gtfs_only_shape_ids = [];
    expect(() =>
      buildPlan040Package8Draft(
        buildInput(evidence, shapeGapRemoved),
      )).toThrow("P8-A shape-source gap drifted");

    const stagedMatchAdded = structuredClone(evidence.candidates);
    stagedMatchAdded.find((candidate) =>
      candidate.risk_wave_id === "P8-B")!
      .candidate_document_gap!.exact_url_searches[0]!
      .matched_staged_source_ids = ["new_source"] as [];
    expect(() =>
      buildPlan040Package8Draft(
        buildInput(evidence, stagedMatchAdded),
      )).toThrow("P8-B candidate-document gap drifted");

    const passengerMismatchRemoved = structuredClone(evidence.candidates);
    passengerMismatchRemoved.find((candidate) =>
      candidate.gtfs_route_id === "Q36")!
      .schedule_trip_type_validation!.post.gtfs_only_active_shape_ids = [];
    expect(() =>
      buildPlan040Package8Draft(
        buildInput(evidence, passengerMismatchRemoved),
      )).toThrow("P8-B passenger-validation mismatch drifted");

    const scheduleIdentityChanged = structuredClone(evidence.candidates);
    scheduleIdentityChanged.find((candidate) =>
      candidate.gtfs_route_id === "Q4")!
      .schedule_trip_type_validation!.source_csv_sha256 =
        "0".repeat(64) as typeof PLAN040_PACKAGE_8_SCHEDULE_CSV_SHA256;
    expect(() =>
      buildPlan040Package8Draft(
        buildInput(evidence, scheduleIdentityChanged),
      )).toThrow("P8-B candidate-document gap drifted");

    const rawInventoryRelabeled = structuredClone(evidence.candidates);
    rawInventoryRelabeled.find((candidate) =>
      candidate.gtfs_route_id === "Q4")!
      .boundary_inventory.post.inventory_role =
        "schedule_trip_type_validated" as
          "raw_active_gtfs_inventory_nonauthorizing_not_schedule_trip_type_validated";
    expect(() =>
      buildPlan040Package8Draft(
        buildInput(evidence, rawInventoryRelabeled),
      )).toThrow("evidence, ledger, or authority scope drifted");

    const overlap = buildInput(evidence);
    overlap.priorCandidateKeys.package_7 = [
      evidence.candidates[0]!.candidate_key,
    ];
    expect(() => buildPlan040Package8Draft(overlap)).toThrow(
      "overlaps package_7",
    );

    const mixedVersion = buildInput(evidence);
    mixedVersion.versionSeparation = structuredClone(
      evidence.version_separation,
    );
    mixedVersion.versionSeparation.corrected_first_week_diff.corrections.queens
      .version_sha1 = mixedVersion.versionSeparation.published_launch_diff
        .initial_post_versions.queens.zip_sha1 as
          typeof PLAN040_PACKAGE_8_QUEENS_CORRECTION_SHA1;
    expect(() => buildPlan040Package8Draft(mixedVersion)).toThrow(
      "correction-version separation drifted or mixed",
    );

    const correctedComparisonRun = buildInput(evidence);
    correctedComparisonRun.versionSeparation = structuredClone(
      evidence.version_separation,
    );
    correctedComparisonRun.versionSeparation.corrected_first_week_diff
      .comparison_run = true as false;
    expect(() => buildPlan040Package8Draft(correctedComparisonRun)).toThrow(
      "correction-version separation drifted or mixed",
    );

    const correctionGapRemoved = structuredClone(evidence.candidates);
    const correctionSensitiveCandidate = correctionGapRemoved.find(
      (candidate) => candidate.risk_wave_id === "P8-A",
    )!;
    delete correctionSensitiveCandidate.correction_sensitivity;
    expect(() =>
      buildPlan040Package8Draft(
        buildInput(evidence, correctionGapRemoved),
      )).toThrow("P8-A shape-source gap drifted");
  });
});
