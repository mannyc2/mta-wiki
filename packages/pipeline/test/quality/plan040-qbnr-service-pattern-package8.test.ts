import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import type { JsonValue } from "../../../db/src/types";
import {
  PLAN040_PACKAGE_8_CANDIDATES,
  PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS,
  PLAN040_PACKAGE_8_SERVICE_CHANGE_HTML_SHA256,
  PLAN040_PACKAGE_8_WAVES,
  buildPlan040Package8Draft,
  plan040Package8ReplayHash,
  type Plan040Package8CandidateEvidence,
  type Plan040Package8Draft,
} from "../../src/quality/plan040-qbnr-service-pattern-package8";
import { extentDecisionKey } from "../../src/quality/study-readiness-v1";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const evidencePath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-8-evidence-v1.json`;
const draftPath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-8-evidence-draft-v1.json`;
const extentLedgerPath =
  `${repoRoot}/data/quality/operational-reference/member-extent-ledger.jsonl`;
const grainLedgerPath =
  `${repoRoot}/data/quality/operational-reference/member-grain-ledger.jsonl`;
const EVIDENCE_SHA256 =
  "6d987aa752beb800046989f8b27891dffeedb80aa976ac4089ae6d89377cf85c";
const DRAFT_SHA256 =
  "56704f0f15abf3327f361e75eeee9d560b06364e79bdfa8edff5df7279f32f6b";

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
      expect(candidate.candidate_document_gap).toBeNull();
    }
  });

  it("pins both active same-family inventories and exact missing-doc searches for B", () => {
    const evidence = readJson<Package8Evidence>(evidencePath);
    const rows = evidence.candidates.filter((candidate) =>
      candidate.risk_wave_id === "P8-B");
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
      sha256(readFileSync(extentLedgerPath)),
    );
    expect(evidence.pristine_ledger_inputs.grain.sha256).toBe(
      sha256(readFileSync(grainLedgerPath)),
    );
    const candidateKeys = new Set(evidence.candidates.map((candidate) =>
      candidate.candidate_key));
    const extentRows = readJsonl(extentLedgerPath).filter((row) =>
      candidateKeys.has(extentDecisionKey(row as {
        occurrence_id: string;
        route_record_id: string;
        treatment_record_id: string;
      })));
    const grainRows = readJsonl(grainLedgerPath).filter((row) =>
      candidateKeys.has(extentDecisionKey(row as {
        occurrence_id: string;
        route_record_id: string;
        treatment_record_id: string;
      })));
    expect(extentRows).toHaveLength(30);
    expect(grainRows).toHaveLength(30);
    expect(extentRows.every((row) =>
      row.verdict === "unreviewed" &&
      (row.receipt_ids as unknown[]).length === 0 &&
      row.updated_at === null)).toBe(true);
    expect(grainRows.every((row) =>
      row.verdict === "unreviewed" &&
      row.spatial_verdict === "unreviewed" &&
      (row.receipt_ids as unknown[]).length === 0 &&
      row.updated_at === null)).toBe(true);
    for (const candidate of evidence.candidates) {
      expect(candidate.source_statement.raw_text.length).toBeGreaterThan(0);
      expect(candidate.source_statement.evidence_id.length).toBeGreaterThan(0);
      expect(candidate.source_row.route_row).toBe(candidate.gtfs_route_id);
      expect(candidate.source_row.anchors.length).toBeGreaterThan(0);
      expect(candidate.exact_candidate_searches.length).toBeGreaterThan(2);
    }
  });

  it("has zero prior overlap and creates no gate, acceptance, or authority", () => {
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
    expect(existsSync(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-8-dual-review-gate-v1.json`,
    )).toBe(false);
    expect(existsSync(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-8-owner-acceptance-v1.json`,
    )).toBe(false);
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

    const overlap = buildInput(evidence);
    overlap.priorCandidateKeys.package_7 = [
      evidence.candidates[0]!.candidate_key,
    ];
    expect(() => buildPlan040Package8Draft(overlap)).toThrow(
      "overlaps package_7",
    );
  });
});
