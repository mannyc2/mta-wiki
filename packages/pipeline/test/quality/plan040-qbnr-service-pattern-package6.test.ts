import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import type { JsonValue } from "../../../db/src/types";
import {
  buildPlan040Package6Draft,
  PLAN040_PACKAGE_6_AUDITED_CURRENT_OUTCOMES,
  PLAN040_PACKAGE_6_CANDIDATES,
  PLAN040_PACKAGE_6_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_6_NON_SUBSTITUTE_POST_BUSCO_SHA1,
  PLAN040_PACKAGE_6_PRE_BUSCO_SHA1,
  PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1,
  PLAN040_PACKAGE_6_WAVES,
  plan040Package6ReplayHash,
  type Plan040Package6CandidateEvidence,
  type Plan040Package6Draft,
} from "../../src/quality/plan040-qbnr-service-pattern-package6";
import { extentDecisionKey } from "../../src/quality/study-readiness-v1";

const acquisitionPath =
  `${repoRoot}/data/quality/acquisition/receipts/` +
  "plan-040-qbnr-service-pattern-package-6-acquisition-v1.json";
const evidencePath =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-service-pattern-package-6-evidence-v1.json";
const draftPath =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-service-pattern-package-6-evidence-draft-v1.json";
const package2Path =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-2-decision-draft-v1.json";
const package4Path =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-4-evidence-draft-v1.json";
const package5Path =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-5-evidence-draft-v1.json";
const extentLedgerPath =
  `${repoRoot}/data/quality/operational-reference/member-extent-ledger.jsonl`;
const grainLedgerPath =
  `${repoRoot}/data/quality/operational-reference/member-grain-ledger.jsonl`;

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

type PriorDraft = {
  candidates: Array<{ candidate_key: string }>;
};

type Package6Acquisition = {
  candidate_count: number;
  route_count: number;
  candidate_key_sha256: string;
  immutable_prior_evidence: {
    package_3: Record<"acquisition" | "evidence" | "draft", {
      path: string;
      sha256: string;
    }>;
    package_5: Record<"acquisition" | "evidence" | "draft", {
      path: string;
      sha256: string;
    }> & {
      reviewed_absence_receipt: { path: string; sha256: string };
    };
    reused_route_binding_count: number;
    reused_unique_document_count: number;
    reacquisition_performed: false;
    source_bytes_recomputed: false;
    reused_route_evidence: Array<{
      route_id: string;
      source_id: string;
      receipt_sha256: string;
      pdf_sha256: string;
      reacquisition_performed: false;
      source_bytes_recomputed: false;
    }>;
  };
  exact_new_candidate_documents: {
    acquired_route_count: number;
    acquired_unique_document_count: number;
    documents: Array<{
      source_id: string;
      source_url: string;
      route_ids: string[];
      shared_document: boolean;
      nonexclusive_context: boolean;
      document_is_full_stop_chain: boolean;
      receipt_sha256: string;
      pdf_sha256: string;
      layout_text_sha256: string;
      raw_text_sha256: string;
      blocks_sha256: string;
      source_row_anchor_derivations: Array<{
        route_id: string;
        phase_2_route_row: string;
        service_change_source_html_sha256: string;
        timetable_href: string;
      }>;
      transport_receipt: {
        requested_url: string;
        redirect_status: number;
        final_status: number;
        final_url: string;
        response_content_type: string;
        response_content_length: number;
      };
      authorizes_occurrence: false;
      authorizes_study: false;
      authorizes_cross_product: false;
      authorizes_decision_persistence: false;
    }>;
  };
  accepted_pre_feed: {
    zip_sha1: string;
    zip_sha256: string;
    service_window: { start: string; end: string };
    calendar_expansion: {
      local_date: string;
      express_date: string;
      route_inventory_audit: Array<{
        route_id: string;
        active_trip_count: number;
        route_row_count: number;
        route_row_presence_is_not_trip_inventory: true;
      }>;
    };
  };
  required_exact_post_feed: {
    version_sha1: string;
    zip_sha256: null;
    bounded_acquisition_search_repeated: false;
    exact_member_metadata: Array<{
      member: string;
      rows: number;
      sha1: string;
    }>;
    member_bytes_status: string;
    target_calendar_expansion_status: string;
    ordered_full_stop_chain_status: string;
  };
  non_substitute_later_post_feed: {
    version_sha1: string;
    substitution_status: string;
  };
  schedule_input: {
    requested_slice_count: number;
    present_slice_count: number;
    absent_slice_count: number;
    absent_slices: Array<{ route_id: string; schedule_date: string }>;
    passenger_policy: string;
    nonrevenue_excluded: string[];
  };
  pristine_ledger_inputs: {
    extent: { candidate_count: number; verdict_distribution: object };
    grain: { candidate_count: number; verdict_distribution: object };
  };
  excluded_related_occurrence: {
    occurrence_id: string;
    treatment_record_id: string;
    reason: string;
    excluded_from_candidate_scope: true;
  };
  authority_state: string;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

type Package6Evidence = {
  audited_current_outcomes:
    typeof PLAN040_PACKAGE_6_AUDITED_CURRENT_OUTCOMES;
  review_protocol: {
    package_owner_gate_allowed: false;
    independent_risk_waves_required: 5;
    current_positive_extent_or_service_scope_possible: false;
    reviewed_terminal_absence_allowed: true;
    review_alone_can_authorize_positive: false;
    future_positive_requires_new_exact_post_full_stop_member_bytes: true;
    future_positive_requires_reviewed_stop_id_equivalence: true;
    future_positive_requires_independent_review_after_new_evidence: true;
  };
  future_positive_prerequisites: {
    exact_post_feed_version_sha1: string;
    new_exact_post_full_stop_member_bytes_required: true;
    reviewed_stop_id_equivalence_required: true;
    independent_review_required_after_new_evidence: true;
    review_alone_sufficient: false;
  };
  candidates: Plan040Package6CandidateEvidence[];
};

const priorKeys = (path: string): string[] =>
  readJson<PriorDraft>(path).candidates.map((candidate) =>
    candidate.candidate_key);

const buildInput = (
  draft: Plan040Package6Draft,
  candidates = draft.candidates,
) => ({
  acquisitionReceiptPath: draft.acquisition_receipt.path,
  acquisitionReceiptSha256: draft.acquisition_receipt.sha256,
  evidenceManifestPath: draft.evidence_manifest.path,
  evidenceManifestSha256: draft.evidence_manifest.sha256,
  candidates,
  package2CandidateKeys: priorKeys(package2Path),
  package4CandidateKeys: priorKeys(package4Path),
  package5CandidateKeys: priorKeys(package5Path),
});

describe("Plan 040 QBNR Package 6 accelerated evidence-only freeze", () => {
  it("freezes the exact 29 candidates into the approved 11+7+3+3+5 waves", () => {
    const acquisitionBytes = readFileSync(acquisitionPath);
    const evidenceBytes = readFileSync(evidencePath);
    const draftBytes = readFileSync(draftPath);
    const acquisition = JSON.parse(
      acquisitionBytes.toString("utf8"),
    ) as Package6Acquisition;
    const evidence = JSON.parse(
      evidenceBytes.toString("utf8"),
    ) as Package6Evidence;
    const draft = JSON.parse(
      draftBytes.toString("utf8"),
    ) as Plan040Package6Draft;

    expect(sha256(acquisitionBytes)).toBe(
      "fe597387e7a9d1a4072316be8f706bca6b3ce785983b5aabc104bdc23c4ec84a",
    );
    expect(sha256(evidenceBytes)).toBe(
      "4315d767821963f43bbef7416b893c74995601a79be6d5b5070e9db6e521f2a9",
    );
    expect(sha256(draftBytes)).toBe(
      "4ddd5302bef65687106d7ac16cfb2199ed05341526ce1d3707e9afd66a00b85c",
    );
    expect(plan040Package6ReplayHash(draft as unknown as JsonValue)).toBe(
      sha256(draftBytes),
    );

    expect(acquisition.candidate_count).toBe(29);
    expect(acquisition.route_count).toBe(20);
    expect(acquisition.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_6_CANDIDATE_KEY_SHA256,
    );
    expect(draft.candidate_count).toBe(29);
    expect(draft.route_count).toBe(20);
    expect(draft.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_6_CANDIDATE_KEY_SHA256,
    );
    expect(draft.wave_partition).toEqual(PLAN040_PACKAGE_6_WAVES);
    expect(draft.audited_current_outcomes).toEqual(
      PLAN040_PACKAGE_6_AUDITED_CURRENT_OUTCOMES,
    );
    expect(evidence.audited_current_outcomes).toEqual(
      PLAN040_PACKAGE_6_AUDITED_CURRENT_OUTCOMES,
    );
    expect(draft.candidates.map((candidate) => [
      candidate.risk_wave_id,
      candidate.gtfs_route_id,
      candidate.treatment_record_id,
    ])).toEqual(PLAN040_PACKAGE_6_CANDIDATES);
    expect(new Set(draft.candidates.map((candidate) =>
      candidate.candidate_key)).size).toBe(29);
    expect(
      PLAN040_PACKAGE_6_WAVES.map((wave) =>
        draft.candidates.filter((candidate) =>
          candidate.risk_wave_id === wave.wave_id).length),
    ).toEqual([11, 7, 3, 3, 5]);
    expect(PLAN040_PACKAGE_6_AUDITED_CURRENT_OUTCOMES.map((outcome) => [
      outcome.positive_count,
      outcome.terminal_absence_count,
    ])).toEqual([[0, 11], [0, 7], [0, 3], [0, 3], [0, 5]]);
  });

  it("reuses immutable Package 3/5 evidence and pins only two new documents", () => {
    const acquisition = readJson<Package6Acquisition>(acquisitionPath);
    const immutable = acquisition.immutable_prior_evidence;

    expect(immutable.package_3).toEqual({
      acquisition: expect.objectContaining({
        sha256:
          "7417deb4c56f12d98a9ec61f486cad9b0caeb7121819b1824e874643454f697e",
      }),
      evidence: expect.objectContaining({
        sha256:
          "149809f528571fc3e49808a61ee83670121db536e691ffae88b70579e8e9ccf8",
      }),
      draft: expect.objectContaining({
        sha256:
          "1a3f446553955e75c373831ea282b1b4c0a2ceda2bfaec5f00a737d270b5fdbd",
      }),
    });
    expect(immutable.package_5).toMatchObject({
      acquisition: {
        sha256:
          "bb7c89669ed6b106cf37fe099b626116c4e5022f8ff909915cf68430853cb44c",
      },
      evidence: {
        sha256:
          "a8a54fc2e5554d9517b9b65d5726141d4cccd1e8c16072ae2260f76bb64eb6ba",
      },
      draft: {
        sha256:
          "6506f12da89d3925b66a5f4a6003bd6b79929295c222ad18509459447e037179",
      },
      reviewed_absence_receipt: {
        sha256:
          "5001fb8be406ce9f5abc90490635d22e2f6fad28944400b8eecb4342bfa1c0d2",
      },
    });
    expect(immutable.reused_route_binding_count).toBe(17);
    expect(immutable.reused_unique_document_count).toBe(16);
    expect(immutable.reacquisition_performed).toBe(false);
    expect(immutable.source_bytes_recomputed).toBe(false);
    expect(immutable.reused_route_evidence).toHaveLength(17);
    expect(immutable.reused_route_evidence.every((binding) =>
      !binding.reacquisition_performed && !binding.source_bytes_recomputed))
      .toBe(true);

    const newDocuments = acquisition.exact_new_candidate_documents;
    expect(newDocuments.acquired_route_count).toBe(3);
    expect(newDocuments.acquired_unique_document_count).toBe(2);
    expect(newDocuments.documents.map((document) => ({
      source_id: document.source_id,
      route_ids: document.route_ids,
      pdf_sha256: document.pdf_sha256,
      receipt_sha256: document.receipt_sha256,
    }))).toEqual([
      {
        source_id: "mta_qbnr_2025_q102_profile_timetable",
        route_ids: ["Q102"],
        pdf_sha256:
          "1ff3fe6b6229c2ec9576176a96200edee7bcc18072536561c1d47648197a358c",
        receipt_sha256:
          "7138c44cc9d79c5286b7f42e620c3c5b4e716084172e2b8dd74a643076b5ff15",
      },
      {
        source_id: "mta_qbnr_2025_qm16_qm17_profile_timetable",
        route_ids: ["QM16", "QM17"],
        pdf_sha256:
          "577cb1a2f0f6b612882ebe074b56e6c328b59a69cdbf4d6fc5c31ab99d4fdb94",
        receipt_sha256:
          "21bd8c76755935fa36faff0b2726d6f66293a76bd0855feb6955fe264a81417e",
      },
    ]);
    for (const document of newDocuments.documents) {
      expect(document.source_row_anchor_derivations.map((row) =>
        row.route_id)).toEqual(document.route_ids);
      expect(document.source_row_anchor_derivations.every((row) =>
        row.phase_2_route_row === row.route_id &&
        row.service_change_source_html_sha256 ===
          "4b5dc9ca398980a3803e076378acefd7ac3ec04343e0ac32db95a17c1d51226d" &&
        row.timetable_href === document.source_url)).toBe(true);
      expect(document.transport_receipt).toMatchObject({
        requested_url: document.source_url.replace(
          "https://www.mta.info",
          "https://new.mta.info",
        ),
        redirect_status: 301,
        final_status: 200,
        final_url: document.source_url,
        response_content_type: "application/pdf",
      });
      expect(document.transport_receipt.response_content_length).toBeGreaterThan(
        0,
      );
      expect(document.document_is_full_stop_chain).toBe(false);
      expect(document.authorizes_occurrence).toBe(false);
      expect(document.authorizes_study).toBe(false);
      expect(document.authorizes_cross_product).toBe(false);
      expect(document.authorizes_decision_persistence).toBe(false);
    }
  });

  it("pins version separation, calendar expansion, and schedule-source gaps", () => {
    const acquisition = readJson<Package6Acquisition>(acquisitionPath);
    const draft = readJson<Plan040Package6Draft>(draftPath);
    const expectedTrips = new Map<string, number>([
      ["Q101", 102],
      ["Q103", 50],
      ["Q18", 110],
      ["Q32", 179],
      ["Q35", 242],
      ["Q37", 108],
      ["Q41", 118],
      ["Q60", 200],
      ["Q10", 325],
      ["Q11", 84],
      ["Q33", 180],
      ["Q47", 91],
      ["Q22", 196],
      ["QM15", 62],
      ["QM24", 21],
      ["QM25", 18],
      ["Q102", 79],
      ["Q69", 172],
      ["QM16", 20],
      ["QM17", 19],
    ]);

    expect(acquisition.accepted_pre_feed.zip_sha1).toBe(
      PLAN040_PACKAGE_6_PRE_BUSCO_SHA1,
    );
    expect(acquisition.accepted_pre_feed.service_window).toEqual({
      start: "2025-06-29",
      end: "2025-08-30",
    });
    expect(acquisition.accepted_pre_feed.calendar_expansion).toMatchObject({
      local_date: "2025-08-30",
      express_date: "2025-08-29",
    });
    for (
      const inventory of
        acquisition.accepted_pre_feed.calendar_expansion.route_inventory_audit
    ) {
      expect(inventory.route_row_count).toBe(1);
      expect(inventory.route_row_presence_is_not_trip_inventory).toBe(true);
      expect(inventory.active_trip_count).toBe(
        expectedTrips.get(inventory.route_id),
      );
    }
    expect(acquisition.required_exact_post_feed).toMatchObject({
      version_sha1: PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1,
      zip_sha256: null,
      bounded_acquisition_search_repeated: false,
      member_bytes_status: "blocked_no_verified_required_member_matches",
      target_calendar_expansion_status:
        "not_computed_required_member_bytes_unavailable",
      ordered_full_stop_chain_status:
        "not_computed_required_member_bytes_unavailable",
    });
    expect(acquisition.required_exact_post_feed.exact_member_metadata)
      .toHaveLength(6);
    expect(acquisition.non_substitute_later_post_feed).toEqual({
      version_sha1: PLAN040_PACKAGE_6_NON_SUBSTITUTE_POST_BUSCO_SHA1,
      substitution_status:
        "prohibited_not_the_required_initial_phase_2_identity",
    });
    expect(draft.version_separation).toMatchObject({
      later_version_is_not_substitute: true,
      bounded_post_feed_search_repeated: false,
    });

    expect(acquisition.schedule_input).toMatchObject({
      requested_slice_count: 40,
      present_slice_count: 36,
      absent_slice_count: 4,
      passenger_policy: "any_trip_type_except_2_3_4",
      nonrevenue_excluded: ["2", "3", "4"],
    });
    expect(acquisition.schedule_input.absent_slices).toEqual([
      { route_id: "QM16", schedule_date: "2025-08-29" },
      { route_id: "QM17", schedule_date: "2025-08-29" },
      { route_id: "QM16", schedule_date: "2025-09-02" },
      { route_id: "QM17", schedule_date: "2025-09-02" },
    ]);
  });

  it("keeps discrepancy, shared, branch, lineage, and temporal cases risk-reviewed", () => {
    const draft = readJson<Plan040Package6Draft>(draftPath);
    const byTreatment = new Map(draft.candidates.map((candidate) => [
      candidate.treatment_record_id,
      candidate,
    ]));
    const q69 = byTreatment.get(
      "treatment_q69-queens-plaza-termination-change-2025",
    )!;
    const q69Pre = q69.schedule_validation.pre as {
      passenger_shape_ids: string[];
    };
    const q69Binding = q69.schedule_validation.pre_binding as {
      status: string;
      matched_passenger_shape_ids: string[];
      unmatched_passenger_shape_ids: string[];
      active_gtfs_shapes_absent_from_schedule: string[];
    };
    expect(q69.risk_wave_id).toBe("P6-E");
    expect(q69Pre.passenger_shape_ids).toEqual(["Q690172", "Q690174"]);
    expect(q69.pre_inventory.active_shape_ids).toEqual([
      "Q690172",
      "Q690173",
    ]);
    expect(q69Binding).toMatchObject({
      status: "reviewed_unresolved_unmatched_or_ambiguous",
      matched_passenger_shape_ids: ["Q690172"],
      unmatched_passenger_shape_ids: ["Q690174"],
      active_gtfs_shapes_absent_from_schedule: ["Q690173"],
    });

    for (const routeId of ["QM16", "QM17"]) {
      const candidate = draft.candidates.find((row) =>
        row.gtfs_route_id === routeId)!;
      expect(candidate.risk_wave_id).toBe("P6-E");
      expect(candidate.candidate_document).toMatchObject({
        source_id: "mta_qbnr_2025_qm16_qm17_profile_timetable",
        route_ids: ["QM16", "QM17"],
        shared_document: true,
        nonexclusive_context: true,
        binding_status: "shared_qm16_qm17_timetable_nonexclusive",
      });
      expect((candidate.schedule_validation.pre as { row_count: number })
        .row_count).toBe(0);
      expect((candidate.schedule_validation.post as { row_count: number })
        .row_count).toBe(0);
    }

    const q10 = byTreatment.get(
      "treatment_q10-limited-discontinuation-2025",
    )!;
    expect(q10.risk_flags).toContain("q10_q80_combined_timetable_context");
    expect(q10.candidate_document.binding_status).toBe(
      "candidate_route_document_nonexclusive_q10_q80",
    );
    expect(byTreatment.get("treatment_q11-q21-combination-2025")!.risk_flags)
      .toContain("q21_combination_lineage");
    expect(draft.candidates.filter((candidate) =>
      candidate.gtfs_route_id === "Q22").every((candidate) =>
      candidate.risk_wave_id === "P6-C" &&
      candidate.risk_flags.includes(
        "heterogeneous_branch_segment_and_trip_subset_grain",
      ))).toBe(true);
    expect(draft.candidates.filter((candidate) =>
      candidate.risk_wave_id === "P6-D").every((candidate) =>
      candidate.risk_flags.includes(
        "whole_route_spatial_extent_with_temporal_service_scope",
      ))).toBe(true);
    expect(draft.excluded_related_occurrence).toEqual({
      occurrence_id: "occurrence:833f69866045c25967353373",
      treatment_record_id:
        "treatment_weekday-express-bus-trip-additions-spring-2025",
      reason: "different_occurrence_source_and_time_context",
      excluded_from_candidate_scope: true,
    });
  });

  it("keeps all 29 ledger rows pristine and every authority surface false", () => {
    const acquisition = readJson<Package6Acquisition>(acquisitionPath);
    const draft = readJson<Plan040Package6Draft>(draftPath);
    const candidateTreatments = new Set(draft.candidates.map((candidate) =>
      candidate.treatment_record_id));
    const ledgerRows = [extentLedgerPath, grainLedgerPath].map((path) =>
      readJsonl(path).filter((row) =>
        candidateTreatments.has(String(row.treatment_record_id))));

    expect(acquisition.pristine_ledger_inputs.extent).toMatchObject({
      candidate_count: 29,
      verdict_distribution: { unreviewed: 29 },
    });
    expect(acquisition.pristine_ledger_inputs.grain).toMatchObject({
      candidate_count: 29,
      verdict_distribution: { unreviewed: 29 },
    });
    for (const rows of ledgerRows) {
      expect(rows).toHaveLength(29);
      expect(new Set(rows.map(extentDecisionKey))).toEqual(
        new Set(draft.candidates.map((candidate) => candidate.candidate_key)),
      );
      expect(rows.every((row) =>
        row.verdict === "unreviewed" &&
        row.current_extent_kind === "unresolved" &&
        Array.isArray(row.receipt_ids) &&
        row.receipt_ids.length === 0 &&
        row.authorizes_study === false &&
        row.authorizes_cross_product === false)).toBe(true);
    }
    expect(draft.candidates.every((candidate) =>
      candidate.evidence_verdict === "receipt_terminal_unresolved" &&
      candidate.current_evidence_positive_eligible === false &&
      candidate
        .positive_eligibility_requires_new_exact_post_full_stop_and_id_equivalence_evidence_plus_review &&
      candidate.independent_audit_completed &&
      candidate.review_outcome_state ===
        "audited_current_evidence_terminal_absence" &&
      candidate.proposed_extent_decision === null &&
      candidate.proposed_grain_decision === null &&
      candidate.persisted_extent_decision === null &&
      candidate.persisted_grain_decision === null &&
      !candidate.authorizes_occurrence &&
      !candidate.authorizes_study &&
      !candidate.authorizes_cross_product &&
      !candidate.authorizes_decision_persistence)).toBe(true);
    expect(acquisition.authority_state).toBe(
      "evidence_only_no_gate_no_acceptance_no_persistence",
    );
    expect(acquisition.authorizes_occurrence).toBe(false);
    expect(acquisition.authorizes_study).toBe(false);
    expect(acquisition.authorizes_cross_product).toBe(false);
    expect(acquisition.authorizes_decision_persistence).toBe(false);

    for (
      const suffix of [
        "dual-review-gate-v1.json",
        "owner-acceptance-v1.json",
        "accepted-decisions-v1.json",
      ]
    ) {
      expect(existsSync(
        `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
          `plan-040-qbnr-service-pattern-package-6-${suffix}`,
      )).toBe(false);
    }
  });

  it("records that review alone cannot authorize a positive outcome", () => {
    const evidence = readJson<Package6Evidence>(evidencePath);
    const draft = readJson<Plan040Package6Draft>(draftPath);

    expect(evidence.review_protocol).toEqual({
      package_owner_gate_allowed: false,
      independent_risk_waves_required: 5,
      current_positive_extent_or_service_scope_possible: false,
      reviewed_terminal_absence_allowed: true,
      review_alone_can_authorize_positive: false,
      future_positive_requires_new_exact_post_full_stop_member_bytes: true,
      future_positive_requires_reviewed_stop_id_equivalence: true,
      future_positive_requires_independent_review_after_new_evidence: true,
    });
    expect(evidence.future_positive_prerequisites).toEqual({
      exact_post_feed_version_sha1:
        PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1,
      new_exact_post_full_stop_member_bytes_required: true,
      reviewed_stop_id_equivalence_required: true,
      independent_review_required_after_new_evidence: true,
      review_alone_sufficient: false,
    });
    expect(draft.future_positive_prerequisites).toEqual(
      evidence.future_positive_prerequisites,
    );
    expect(evidence.candidates.every((candidate) =>
      candidate.independent_audit_completed &&
      !candidate.current_evidence_positive_eligible &&
      candidate.risk_flags.includes(
        "current_evidence_not_positive_eligible",
      ) &&
      candidate.unresolved_gap_codes.includes(
        "positive_eligibility_requires_new_exact_post_full_stop_and_id_equivalence_evidence_plus_review",
      ))).toBe(true);
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(
      "official_evidence_may_support_positive_extent_or_service_scope_after_review",
    );
    expect(serialized).not.toContain(
      "candidate_may_support_positive_after_review",
    );
  });

  it("replays deterministically and fails closed on scope or authority drift", () => {
    const draft = readJson<Plan040Package6Draft>(draftPath);
    expect(buildPlan040Package6Draft(buildInput(draft))).toEqual(draft);

    const withAuthority = structuredClone(draft.candidates);
    withAuthority[0]!.authorizes_occurrence = true;
    expect(() =>
      buildPlan040Package6Draft(buildInput(draft, withAuthority))).toThrow(
        "gained unsupported authority",
      );

    const reviewAlonePositive = structuredClone(draft.candidates);
    reviewAlonePositive[0]!.current_evidence_positive_eligible = true;
    expect(() =>
      buildPlan040Package6Draft(
        buildInput(draft, reviewAlonePositive),
      )).toThrow("gained unsupported authority");

    const missingNewEvidencePrerequisite = structuredClone(draft.candidates);
    missingNewEvidencePrerequisite[0]!
      .positive_eligibility_requires_new_exact_post_full_stop_and_id_equivalence_evidence_plus_review =
        false;
    expect(() =>
      buildPlan040Package6Draft(
        buildInput(draft, missingNewEvidencePrerequisite),
      )).toThrow("gained unsupported authority");

    const wrongWave = structuredClone(draft.candidates);
    wrongWave[0]!.risk_wave_id = "P6-E";
    expect(() =>
      buildPlan040Package6Draft(buildInput(draft, wrongWave))).toThrow(
        "drifted risk scope",
      );

    const substitutedPost = structuredClone(draft.candidates);
    substitutedPost[0]!.required_post_inventory.version_sha1 =
      PLAN040_PACKAGE_6_NON_SUBSTITUTE_POST_BUSCO_SHA1 as
        typeof PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1;
    expect(() =>
      buildPlan040Package6Draft(buildInput(draft, substitutedPost))).toThrow(
        "gained unsupported authority",
      );

    expect(() =>
      buildPlan040Package6Draft({
        ...buildInput(draft),
        package5CandidateKeys: [draft.candidates[0]!.candidate_key],
      })).toThrow("overlaps an accepted or persisted prior package key");

    const missing = draft.candidates.slice(1) as
      Plan040Package6CandidateEvidence[];
    expect(() =>
      buildPlan040Package6Draft(buildInput(draft, missing))).toThrow(
        "requires exact 29-treatment parity",
      );
  });
});
