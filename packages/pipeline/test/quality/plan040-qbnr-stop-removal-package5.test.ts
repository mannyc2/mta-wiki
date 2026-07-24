import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { repoRoot } from "../../../core/src/paths";
import type { JsonValue } from "../../../db/src/types";
import {
  loadMemberExtentAbsenceReceipts,
} from "../../src/quality/member-extent-ledger";
import {
  acceptPlan040Package5ReceiptPackage,
  buildPlan040Package5AcceptedArtifacts,
  buildPlan040Package5GateAndAcceptance,
  buildPlan040Package5Draft,
  PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ABSENCE_RECEIPT_PATH,
  PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_5_NEW_SOURCE_ROUTES,
  PLAN040_PACKAGE_5_NON_SUBSTITUTE_POST_BUSCO_SHA1,
  PLAN040_PACKAGE_5_PACKAGE_3_CARRY_FORWARD_ROUTES,
  PLAN040_PACKAGE_5_PACKAGE_3_PINS,
  PLAN040_PACKAGE_5_PRE_BUSCO_SHA1,
  PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1,
  PLAN040_PACKAGE_5_ROUTE_ORDER,
  plan040Package5ReplayHash,
  type Plan040Package5Draft,
  validatePlan040Package5GateAndAcceptance,
} from "../../src/quality/plan040-qbnr-stop-removal-package5";
import { extentDecisionKey } from "../../src/quality/study-readiness-v1";

const acquisitionPath =
  `${repoRoot}/data/quality/acquisition/receipts/` +
  "plan-040-qbnr-stop-removal-package-5-acquisition-v1.json";
const evidencePath =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-5-evidence-v1.json";
const draftPath =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-5-evidence-draft-v1.json";
const package2Path =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-2-decision-draft-v1.json";
const package4Path =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-4-evidence-draft-v1.json";
const gatePath =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-5-dual-review-gate-v1.json";
const acceptancePath =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-5-owner-acceptance-v1.json";

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const readJsonl = (path: string): Array<Record<string, unknown>> => {
  const text = readFileSync(path, "utf8").trim();
  return text ? text.split("\n").map((line) =>
    JSON.parse(line) as Record<string, unknown>) : [];
};
const distribution = (
  rows: Array<Record<string, unknown>>,
  field: string,
): Record<string, number> =>
  Object.fromEntries([...new Set(rows.map((row) => String(row[field])))]
    .sort()
    .map((value) => [
      value,
      rows.filter((row) => String(row[field]) === value).length,
    ]));

type Acquisition = {
  candidate_count: number;
  new_candidate_document_count: number;
  immutable_package_3_carry_forward_candidate_count: number;
  route_order: string[];
  candidate_key_sha256: string;
  immutable_package_3_pins: {
    acquisition: { sha256: string };
    evidence: { sha256: string };
    draft: { sha256: string };
    carried_routes: string[];
    reacquisition_performed: false;
    accepted_source_evidence_recomputed: false;
  };
  exact_new_candidate_documents: Array<{
    route_id: string;
    anchor_relation: string;
    anchor_derivation: string;
    source_id: string;
    source_url: string;
    transport_url: string;
    receipt_path: string;
    receipt_sha256: string;
    pdf_path: string;
    pdf_sha256: string;
    layout_text_sha256: string;
    raw_text_sha256: string;
    blocks_sha256: string;
    statement_blocks: Array<{
      evidence_id: string;
      raw_text_sha256: string;
    }>;
    authorizes_decision_persistence: false;
  }>;
  service_change_input: {
    anchor_derivation_status: string;
    known_anchor_anomalies: Array<{
      route_id: string;
      anomaly: string;
    }>;
  };
  accepted_pre_feed: {
    source_id: string;
    zip_sha1: string;
    zip_sha256: string;
    service_window: { start: string; end: string };
    route_inventory_audit: Array<{
      route_id: string;
      route_row_count: number;
      route_trip_row_count: number;
      active_trip_count: number;
      inventory_status: string;
    }>;
    route_row_presence_policy: string;
  };
  required_exact_post_feed: {
    version_sha1: string;
    zip_sha256: null;
    exact_member_metadata: Array<{
      member: string;
      rows: number;
      sha1: string;
    }>;
    target_calendar_expansion_status: string;
    ordered_full_stop_chain_status: string;
  };
  non_substitute_later_post_feed: {
    version_sha1: string;
    substitution_status: string;
  };
  schedule_trip_type_policy: {
    passenger: string;
    nonrevenue_excluded: string[];
    mixed_passenger_and_nonrevenue: string;
    schedule_shape_absent_from_exact_gtfs: string;
  };
  prior_package_overlap: {
    package_2: { overlap_count: number };
    package_4: { overlap_count: number };
    package_3: {
      intentional_nonterminal_carry_forward_count: number;
    };
  };
  authority_state: string;
  authorizes_decision_persistence: false;
};

describe("Plan 040 QBNR Package 5 accelerated evidence-only freeze", () => {
  it("freezes exact 24-key parity, 12 immutable carries, and 12 new MTA documents", () => {
    const acquisitionBytes = readFileSync(acquisitionPath);
    const evidenceBytes = readFileSync(evidencePath);
    const draftBytes = readFileSync(draftPath);
    const acquisition = JSON.parse(
      acquisitionBytes.toString("utf8"),
    ) as Acquisition;
    const draft = JSON.parse(
      draftBytes.toString("utf8"),
    ) as Plan040Package5Draft;

    expect(sha256(acquisitionBytes)).toBe(
      "bb7c89669ed6b106cf37fe099b626116c4e5022f8ff909915cf68430853cb44c",
    );
    expect(sha256(evidenceBytes)).toBe(
      "a8a54fc2e5554d9517b9b65d5726141d4cccd1e8c16072ae2260f76bb64eb6ba",
    );
    expect(sha256(draftBytes)).toBe(
      "6506f12da89d3925b66a5f4a6003bd6b79929295c222ad18509459447e037179",
    );
    expect(plan040Package5ReplayHash(draft as unknown as JsonValue)).toBe(
      sha256(draftBytes),
    );
    expect(acquisition.route_order).toEqual([
      ...PLAN040_PACKAGE_5_ROUTE_ORDER,
    ]);
    expect(draft.candidates.map((candidate) => candidate.gtfs_route_id))
      .toEqual([...PLAN040_PACKAGE_5_ROUTE_ORDER]);
    expect(acquisition.candidate_count).toBe(24);
    expect(draft.candidate_count).toBe(24);
    expect(acquisition.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256,
    );
    expect(draft.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256,
    );
    expect(new Set(draft.candidates.map((candidate) =>
      candidate.candidate_key)).size).toBe(24);

    expect(acquisition.immutable_package_3_pins).toMatchObject({
      acquisition: {
        sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.acquisition,
      },
      evidence: { sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.evidence },
      draft: { sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.draft },
      carried_routes:
        PLAN040_PACKAGE_5_PACKAGE_3_CARRY_FORWARD_ROUTES,
      reacquisition_performed: false,
      accepted_source_evidence_recomputed: false,
    });
    const carries = draft.candidates.filter((candidate) =>
      candidate.evidence_origin ===
        "immutable_package_3_carry_forward");
    expect(carries.map((candidate) => candidate.gtfs_route_id)).toEqual(
      PLAN040_PACKAGE_5_ROUTE_ORDER.filter((routeId) =>
        PLAN040_PACKAGE_5_PACKAGE_3_CARRY_FORWARD_ROUTES.includes(
          routeId as never,
        )),
    );
    expect(carries).toHaveLength(12);
    expect(carries.every((candidate) =>
      candidate.immutable_package_3_ref?.evidence_manifest_sha256 ===
        PLAN040_PACKAGE_5_PACKAGE_3_PINS.evidence)).toBe(true);

    expect(acquisition.exact_new_candidate_documents).toHaveLength(12);
    expect(
      new Set(acquisition.exact_new_candidate_documents.map((source) =>
        source.route_id)),
    ).toEqual(new Set(PLAN040_PACKAGE_5_NEW_SOURCE_ROUTES));
    for (const source of acquisition.exact_new_candidate_documents) {
      expect(source.anchor_derivation).toBe(
        "exact candidate row in Phase 2 service-change HTML",
      );
      expect(source.source_url).toMatch(
        /^https:\/\/www\.mta\.info\/document\/\d+$/u,
      );
      expect(source.transport_url).toMatch(
        /^https:\/\/new\.mta\.info\/document\/\d+$/u,
      );
      expect(existsSync(`${repoRoot}/${source.pdf_path}`)).toBe(true);
      expect(source.receipt_sha256).toHaveLength(64);
      expect(source.pdf_sha256).toHaveLength(64);
      expect(source.layout_text_sha256).toHaveLength(64);
      expect(source.raw_text_sha256).toHaveLength(64);
      expect(source.blocks_sha256).toHaveLength(64);
      expect(source.statement_blocks.length).toBeGreaterThan(0);
      expect(source.statement_blocks.every((block) =>
        block.evidence_id.startsWith(`${source.source_id}#`) &&
        block.raw_text_sha256.length === 64)).toBe(true);
      expect(source.authorizes_decision_persistence).toBe(false);
    }
    expect(acquisition.service_change_input).toMatchObject({
      anchor_derivation_status:
        "all_12_exact_candidate_document_anchors_verified",
    });
    expect(acquisition.service_change_input.known_anchor_anomalies.map(
      (anomaly) => anomaly.route_id,
    )).toEqual(["Q49", "Q104"]);
  });

  it("pins pre/post identity and reviews schedule revenue rows without inferring inventory", () => {
    const acquisition = readJson<Acquisition>(acquisitionPath);
    const draft = readJson<Plan040Package5Draft>(draftPath);

    expect(acquisition.accepted_pre_feed).toMatchObject({
      source_id: "gtfs_static_20250626_busco_post_qbnr",
      zip_sha1: PLAN040_PACKAGE_5_PRE_BUSCO_SHA1,
      zip_sha256:
        "7d0e5651d5cc5c3ac86973dc664e16a05e9245bea156f566c39e71506128670e",
      service_window: { start: "2025-06-29", end: "2025-08-30" },
      route_row_presence_policy:
        "route-row presence is never promoted to trip inventory",
    });
    expect(acquisition.accepted_pre_feed.route_inventory_audit)
      .toHaveLength(12);
    expect(acquisition.accepted_pre_feed.route_inventory_audit.every(
      (row) =>
        row.route_row_count > 0 &&
        row.route_trip_row_count > 0 &&
        row.active_trip_count > 0 &&
        row.inventory_status ===
          "validated_from_active_trips_not_route_row_presence",
    )).toBe(true);

    expect(acquisition.required_exact_post_feed).toMatchObject({
      version_sha1: PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1,
      zip_sha256: null,
      target_calendar_expansion_status:
        "not_computed_required_member_bytes_unavailable",
      ordered_full_stop_chain_status:
        "not_computed_required_member_bytes_unavailable",
    });
    expect(acquisition.required_exact_post_feed.exact_member_metadata)
      .toEqual([
        {
          member: "calendar.txt",
          rows: 32,
          sha1: "8ef559e10f82b267b39e86a22f8bcaaf14304c5d",
        },
        {
          member: "calendar_dates.txt",
          rows: 274,
          sha1: "9939b0e8589bd5e1e7e43c82246587aca6b4aed7",
        },
        {
          member: "routes.txt",
          rows: 92,
          sha1: "1cb2b8d4e64e1d1221f0d978e66c8156dc1997d1",
        },
        {
          member: "stop_times.txt",
          rows: 1074297,
          sha1: "9f1a325655e2c52ec2740afabecc4ff48596ad5d",
        },
        {
          member: "stops.txt",
          rows: 2760,
          sha1: "2ff7b942a055ff5b3b05ddcc8800a04aed18e6f1",
        },
        {
          member: "trips.txt",
          rows: 45401,
          sha1: "47ade1af05e1267eb5a3a1b618fcf5aba22af94b",
        },
      ]);
    expect(acquisition.non_substitute_later_post_feed).toEqual({
      version_sha1: PLAN040_PACKAGE_5_NON_SUBSTITUTE_POST_BUSCO_SHA1,
      substitution_status:
        "prohibited_not_the_required_initial_phase_2_identity",
    });
    expect(acquisition.schedule_trip_type_policy).toEqual({
      passenger: "any trip_type other than 2, 3, or 4",
      nonrevenue_excluded: ["2", "3", "4"],
      mixed_passenger_and_nonrevenue:
        "reviewed_unresolved_ambiguous_trip_type",
      schedule_shape_absent_from_exact_gtfs:
        "reviewed_unresolved_unmatched_shape",
    });

    for (const candidate of draft.candidates) {
      expect(candidate.pre_inventory.active_trip_count).toBeGreaterThan(0);
      expect(candidate.pre_inventory.route_trip_row_count)
        .toBeGreaterThan(0);
      expect(
        candidate.pre_inventory.route_row_presence_is_not_trip_inventory,
      ).toBe(true);
      expect(candidate.required_post_inventory).toMatchObject({
        version_sha1: PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1,
        zip_sha256: null,
        calendar_expansion_status:
          "not_computed_required_member_bytes_unavailable",
        ordered_stop_comparison_status:
          "not_computed_required_member_bytes_unavailable",
      });
      expect(candidate.schedule_validation.revenue_policy).toEqual({
        passenger: "any_trip_type_except_2_3_4",
        excluded_nonrevenue_trip_types: ["2", "3", "4"],
        mixed_shape_policy: "reviewed_unresolved",
        unmatched_shape_policy: "reviewed_unresolved",
      });
      expect(candidate.schedule_validation.post_binding.status).toBe(
        "reviewed_unresolved_exact_post_gtfs_members_unavailable",
      );
      expect(candidate.unresolved_gap_codes).toEqual(
        [...candidate.unresolved_gap_codes].sort(),
      );
      expect(candidate.unresolved_gap_codes).toEqual(
        expect.arrayContaining([
          "exact_post_gtfs_zip_bytes_unavailable",
          "exact_post_member_bytes_unavailable",
          "post_calendar_expansion_not_computed",
          "ordered_full_stop_diff_not_computed",
          "schedule_to_post_gtfs_binding_unresolved",
        ]),
      );
    }
  });

  it("fails closed with no Package 2/4 overlap or positive persistence", () => {
    const acquisition = readJson<Acquisition>(acquisitionPath);
    const draft = readJson<Plan040Package5Draft>(draftPath);
    const package2 = readJson<{
      candidates: Array<{ candidate_key: string }>;
    }>(package2Path);
    const package4 = readJson<{
      candidates: Array<{ candidate_key: string }>;
    }>(package4Path);
    const package5Keys = new Set(
      draft.candidates.map((candidate) => candidate.candidate_key),
    );

    expect(acquisition.prior_package_overlap).toMatchObject({
      package_2: { overlap_count: 0 },
      package_4: { overlap_count: 0 },
      package_3: {
        intentional_nonterminal_carry_forward_count: 12,
      },
    });
    expect(package2.candidates.some((candidate) =>
      package5Keys.has(candidate.candidate_key))).toBe(false);
    expect(package4.candidates.some((candidate) =>
      package5Keys.has(candidate.candidate_key))).toBe(false);
    expect(draft.evidence_verdict_distribution).toEqual({
      receipt_terminal_unresolved: 24,
    });
    expect(draft.proposed_decision_count).toBe(0);
    expect(draft.persisted_decision_count).toBe(0);
    expect(draft.proposed_grain_decision_count).toBe(0);
    expect(draft.persisted_grain_decision_count).toBe(0);
    expect(draft.authorization_state).toBe(
      "evidence_only_no_gate_no_acceptance_no_persistence",
    );
    expect(draft.candidates.every((candidate) =>
      candidate.evidence_verdict === "receipt_terminal_unresolved" &&
      candidate.proposed_extent_decision === null &&
      candidate.proposed_grain_decision === null &&
      candidate.persisted_extent_decision === null &&
      candidate.persisted_grain_decision === null &&
      !candidate.authorizes_occurrence &&
      !candidate.authorizes_study &&
      !candidate.authorizes_cross_product &&
      !candidate.authorizes_decision_persistence)).toBe(true);
  });

  it("validates dual approval and exact-package receipt-only acceptance", () => {
    type GateAndAcceptance =
      ReturnType<typeof buildPlan040Package5GateAndAcceptance>;
    const draft = readJson<Plan040Package5Draft>(draftPath);
    const gateBytes = readFileSync(gatePath);
    const acceptanceBytes = readFileSync(acceptancePath);
    expect(sha256(gateBytes)).toBe(
      "8449a0333f7f6f5ec30fc6463af0e6983b0b27f2da48e72468f15ee5135eba15",
    );
    expect(sha256(acceptanceBytes)).toBe(
      "c3b5758a434ae8d647d4feb3e60ba3119350d6b222c98f554801de3434b144e7",
    );
    const gate = JSON.parse(
      gateBytes.toString("utf8"),
    ) as GateAndAcceptance["gate"];
    const acceptance = JSON.parse(
      acceptanceBytes.toString("utf8"),
    ) as GateAndAcceptance["acceptance"];
    expect(validatePlan040Package5GateAndAcceptance({
      draft,
      gate,
      acceptance,
      acceptedAt: acceptance.accepted_at,
    })).toEqual({
      candidate_count: 24,
      positive_candidate_count: 0,
      unresolved_candidate_count: 24,
      authorized_extent_decision_count: 0,
      authorized_grain_decision_count: 0,
      authorized_absence_candidate_count: 24,
      persisted_decision_count: 0,
      persisted_absence_receipt_count: 0,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(gate.reviewed_commit).toBe(
      "21571bba030ad54bd38e55274dc3172bad64b044",
    );
    expect(gate.reviewer_results).toEqual([
      {
        role:
          "independent_main_advisor_source_provenance_and_gap_review",
        reviewer_id: "main_advisor",
        verdict: "APPROVE",
      },
      {
        role: "independent_provenance_and_fail_closed_audit",
        reviewer_id: "plan040_package5_independent_audit",
        verdict: "APPROVE",
      },
    ]);
    expect(gate.artifacts).toEqual({
      acquisition: {
        path:
          "data/quality/acquisition/receipts/" +
          "plan-040-qbnr-stop-removal-package-5-acquisition-v1.json",
        sha256:
          "bb7c89669ed6b106cf37fe099b626116c4e5022f8ff909915cf68430853cb44c",
      },
      evidence: {
        path:
          "data/quality/operational-reference/member-extent-risk/" +
          "plan-040-qbnr-stop-removal-package-5-evidence-v1.json",
        sha256:
          "a8a54fc2e5554d9517b9b65d5726141d4cccd1e8c16072ae2260f76bb64eb6ba",
      },
      draft: {
        path:
          "data/quality/operational-reference/member-extent-risk/" +
          "plan-040-qbnr-stop-removal-package-5-evidence-draft-v1.json",
        sha256:
          "6506f12da89d3925b66a5f4a6003bd6b79929295c222ad18509459447e037179",
        replay_sha256:
          "6506f12da89d3925b66a5f4a6003bd6b79929295c222ad18509459447e037179",
      },
    });
    expect(gate.immutable_package_3_carry_forward).toMatchObject({
      candidate_count: 12,
      acquisition_sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.acquisition,
      evidence_sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.evidence,
      draft_sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.draft,
    });
    expect(acceptance.authorized_positive_persistence).toEqual({
      candidate_count: 0,
      candidate_keys: [],
      extent_decision_ids: [],
      grain_decision_ids: [],
    });
    expect(acceptance.authorized_reviewed_absence_receipt).toMatchObject({
      receipt_id:
        "plan-040-qbnr-stop-removal-package-5-reviewed-absence-v1",
      candidate_count: 24,
      candidate_key_sha256: PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256,
      surfaces: ["member_extent", "member_grain"],
      verdict_by_surface: {
        member_extent: "reviewed_terminal_unresolved",
        member_grain: "reviewed_terminal_unresolved",
      },
    });
    expect(acceptance).toMatchObject({
      persisted_extent_decision_count: 0,
      persisted_grain_decision_count: 0,
      persisted_absence_receipt_count: 0,
      authorizes_decision_persistence: false,
      authorizes_reviewed_absence_receipt_persistence: true,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(acceptance.authorized_reviewed_absence_receipt.candidate_keys)
      .toEqual(draft.candidates.map((candidate) =>
        candidate.candidate_key).sort());
    expect(() => validatePlan040Package5GateAndAcceptance({
      draft,
      gate,
      acceptance: {
        ...acceptance,
        authorizes_decision_persistence: true,
      },
      acceptedAt: acceptance.accepted_at,
    })).toThrow("owner/delegate acceptance drifted");
  });

  it("builds one exact 24-key reviewed-absence receipt and no decisions", () => {
    type GateAndAcceptance =
      ReturnType<typeof buildPlan040Package5GateAndAcceptance>;
    const draft = readJson<Plan040Package5Draft>(draftPath);
    const gate = readJson<GateAndAcceptance["gate"]>(gatePath);
    const acceptance =
      readJson<GateAndAcceptance["acceptance"]>(acceptancePath);
    const accepted = buildPlan040Package5AcceptedArtifacts({
      draft,
      gate,
      acceptance,
    });
    expect(accepted.extentDecisions).toEqual([]);
    expect(accepted.grainDecisions).toEqual([]);
    expect(accepted.absenceReceipt).toMatchObject({
      contract_id: "member-extent-absence-receipt-v1",
      receipt_id:
        "plan-040-qbnr-stop-removal-package-5-reviewed-absence-v1",
      surfaces: ["member_extent", "member_grain"],
      reviewed_at: "2026-07-24T06:49:44Z",
      reviewed_by: "codex-owner-delegate",
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(accepted.absenceReceipt.extent_keys).toHaveLength(24);
    expect(accepted.absenceReceipt.exact_searches).toHaveLength(24);
    expect(accepted.absenceReceipt.urls_inspected).toHaveLength(23);
    expect(accepted.absenceReceipt.urls_inspected.every((url) =>
      /^https:\/\/www\.mta\.info\/document\/[0-9]+$/u.test(url))).toBe(true);
    for (const candidate of draft.candidates) {
      expect(accepted.absenceReceipt.exact_searches.some((search) =>
        search.includes(`candidate=${candidate.candidate_key}`) &&
        search.includes(
          `official_candidate_document=` +
          `${candidate.candidate_document.source_url}`,
        ) &&
        search.includes(
          `required_post_sha1=${PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1}`,
        ) &&
        search.includes("route_row_presence_is_not_trip_inventory=true") &&
        search.includes("later_post_version_is_not_substitute=true") &&
        candidate.unresolved_gap_codes.every((gap) =>
          search.includes(gap)))).toBe(true);
      if (
        candidate.evidence_origin ===
          "immutable_package_3_carry_forward"
      ) {
        expect(accepted.absenceReceipt.exact_searches.some((search) =>
          search.includes(`candidate=${candidate.candidate_key}`) &&
          search.includes(
            `immutable_package_3@` +
            `${PLAN040_PACKAGE_5_PACKAGE_3_PINS.evidence}@` +
            `${candidate.immutable_package_3_ref!.candidate_sha256}`,
          ))).toBe(true);
      }
    }
  });

  it("replays immutable receipt-only acceptance through the strict loader", () => {
    const first = acceptPlan040Package5ReceiptPackage();
    const second = acceptPlan040Package5ReceiptPackage();
    expect(second).toEqual(first);
    expect(first).toEqual({
      absenceReceiptPath:
        PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ABSENCE_RECEIPT_PATH,
      absenceReceiptSha256:
        "5001fb8be406ce9f5abc90490635d22e2f6fad28944400b8eecb4342bfa1c0d2",
      extentDecisionCount: 0,
      grainDecisionCount: 0,
      absenceCandidateCount: 24,
    });
    const receipts = loadMemberExtentAbsenceReceipts([
      dirname(PLAN040_QBNR_STOP_REMOVAL_PACKAGE_5_ABSENCE_RECEIPT_PATH),
    ]).filter((receipt) =>
      receipt.receipt_id ===
        "plan-040-qbnr-stop-removal-package-5-reviewed-absence-v1");
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.extent_keys).toHaveLength(24);
    expect(receipts[0]!.surfaces).toEqual([
      "member_extent",
      "member_grain",
    ]);
  });

  it("materializes exactly 24 absence rows while companion decisions remain unresolved", () => {
    const companion = readJsonl(
      `${repoRoot}/data/contracts/operational-occurrence-member-extent/v1/` +
        "operational_occurrence_member_extents.jsonl",
    );
    const extentLedger = readJsonl(
      `${repoRoot}/data/quality/operational-reference/` +
        "member-extent-ledger.jsonl",
    );
    const grainLedger = readJsonl(
      `${repoRoot}/data/quality/operational-reference/` +
        "member-grain-ledger.jsonl",
    );
    expect(companion).toHaveLength(308);
    expect(extentLedger).toHaveLength(308);
    expect(grainLedger).toHaveLength(308);
    expect(distribution(companion, "extent")).toEqual({
      bounded_segment: 17,
      route_wide: 4,
      stop_set: 4,
      unresolved: 283,
    });
    expect(distribution(extentLedger, "verdict")).toEqual({
      absent_in_source: 99,
      "resolved:bounded_segment": 17,
      "resolved:route_wide": 4,
      "resolved:stop_set": 4,
      unreviewed: 184,
    });
    expect(distribution(grainLedger, "verdict")).toEqual({
      absent_in_source: 99,
      resolved: 12,
      unreviewed: 197,
    });
    const companionByKey = new Map(companion.map((row) => [
      extentDecisionKey(row as never),
      row,
    ]));
    const extentByKey = new Map(extentLedger.map((row) => [
      extentDecisionKey(row as never),
      row,
    ]));
    const grainByKey = new Map(grainLedger.map((row) => [
      extentDecisionKey(row as never),
      row,
    ]));
    const draft = readJson<Plan040Package5Draft>(draftPath);
    for (const candidate of draft.candidates) {
      expect(companionByKey.get(candidate.candidate_key)).toMatchObject({
        extent: "unresolved",
        decision_id: null,
        components: [],
        evidence_bindings: [],
        authorizes_study: false,
        authorizes_cross_product: false,
      });
      expect(extentByKey.get(candidate.candidate_key)).toMatchObject({
        verdict: "absent_in_source",
        receipt_ids: [
          "plan-040-qbnr-stop-removal-package-5-reviewed-absence-v1",
        ],
        authorizes_study: false,
        authorizes_cross_product: false,
      });
      expect(grainByKey.get(candidate.candidate_key)).toMatchObject({
        verdict: "absent_in_source",
        receipt_ids: [
          "plan-040-qbnr-stop-removal-package-5-reviewed-absence-v1",
        ],
        authorizes_study: false,
        authorizes_cross_product: false,
      });
    }
    expect(companion.filter((row) =>
      draft.candidates.some((candidate) =>
        candidate.candidate_key === extentDecisionKey(row as never)) &&
      (
        row.extent !== "unresolved" ||
        row.decision_id !== null ||
        (row.components as unknown[]).length > 0 ||
        (row.evidence_bindings as unknown[]).length > 0
      ))).toHaveLength(0);
  });

  it("rejects authorization, post-version substitution, and prior-package overlap", () => {
    const draft = readJson<Plan040Package5Draft>(draftPath);
    const package2 = readJson<{
      candidates: Array<{ candidate_key: string }>;
    }>(package2Path);
    const package4 = readJson<{
      candidates: Array<{ candidate_key: string }>;
    }>(package4Path);
    const base = {
      acquisitionReceiptPath:
        "data/quality/acquisition/receipts/" +
        "plan-040-qbnr-stop-removal-package-5-acquisition-v1.json",
      acquisitionReceiptSha256: sha256(readFileSync(acquisitionPath)),
      evidenceManifestPath:
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-stop-removal-package-5-evidence-v1.json",
      evidenceManifestSha256: sha256(readFileSync(evidencePath)),
      candidates: draft.candidates,
      package2CandidateKeys: package2.candidates.map((candidate) =>
        candidate.candidate_key),
      package4CandidateKeys: package4.candidates.map((candidate) =>
        candidate.candidate_key),
    };
    expect(buildPlan040Package5Draft(base)).toEqual(draft);

    const authorized = structuredClone(draft.candidates);
    authorized[0]!.authorizes_occurrence = true as false;
    expect(() => buildPlan040Package5Draft({
      ...base,
      candidates: authorized,
    })).toThrow(/fail closed/u);

    const substituted = structuredClone(draft.candidates);
    substituted[0]!.required_post_inventory.version_sha1 =
      PLAN040_PACKAGE_5_NON_SUBSTITUTE_POST_BUSCO_SHA1 as
        typeof PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1;
    expect(() => buildPlan040Package5Draft({
      ...base,
      candidates: substituted,
    })).toThrow(/post identity drifted/u);

    expect(() => buildPlan040Package5Draft({
      ...base,
      package2CandidateKeys: [
        ...base.package2CandidateKeys,
        draft.candidates[0]!.candidate_key,
      ],
    })).toThrow(/overlaps/u);
  });
});
