import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import type { JsonValue } from "../../../db/src/types";
import {
  loadMemberExtentAbsenceReceipts,
} from "../../src/quality/member-extent-ledger";
import {
  PLAN040_PACKAGE_15_CONTRACT_EXTENT_HISTOGRAM,
  PLAN040_PACKAGE_15_EXTENT_VERDICT_HISTOGRAM,
  PLAN040_PACKAGE_15_GRAIN_VERDICT_HISTOGRAM,
} from "../../src/quality/plan040-accelerated-package15-closeout";
import {
  acceptPlan040Package4ReceiptPackage,
  buildPlan040Package4AcceptedArtifacts,
  buildPlan040Package4Draft,
  buildPlan040Package4GateAndAcceptance,
  PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ABSENCE_RECEIPT_PATH,
  PLAN040_PACKAGE_4_ROUTE_ORDER,
  plan040Package4ReplayHash,
  type Plan040Package4Draft,
  validatePlan040Package4GateAndAcceptance,
} from "../../src/quality/plan040-qbnr-stop-removal-package4";
import { extentDecisionKey } from "../../src/quality/study-readiness-v1";

const acquisitionPath =
  `${repoRoot}/data/quality/acquisition/receipts/` +
  "plan-040-qbnr-stop-removal-package-4-acquisition-v1.json";
const evidencePath =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-4-evidence-v1.json";
const draftPath =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-4-evidence-draft-v1.json";
const gatePath =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-4-dual-review-gate-v1.json";
const acceptancePath =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk/` +
  "plan-040-qbnr-stop-removal-package-4-owner-acceptance-v1.json";

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
  candidate_key_sha256: string;
  candidate_route_order: string[];
  candidate_parity: Array<{
    gtfs_route_id: string;
    pre_source_id: string;
    pre_route_trip_row_count: number;
    pre_active_trip_count: number;
    post_source_id: string;
    post_route_trip_row_count: number;
    post_active_trip_count: number;
    boundary_class: string;
    complete_active_trip_boundary: boolean;
    route_row_presence_is_not_trip_inventory: true;
  }>;
  prior_packages: Array<{
    package_id: string;
    candidate_count: number;
    overlap_count: number;
  }>;
  accepted_launch_feeds: Array<{
    source_id: string;
    zip_sha1: string;
    zip_sha256: string;
  }>;
  stop_list_source_count: number;
  stop_list_sources: Array<{
    route_id: string;
    source_id: string;
    source_url: string;
    source_url_derivation: {
      route_row: string;
      anchor_text: string;
    };
    receipt_sha256: string;
    pdf_sha256: string;
    layout_text_sha256: string;
    raw_text_sha256: string;
    blocks_sha256: string;
    authorizes_decision_persistence: false;
  }>;
  schedule_trip_type_policy: {
    passenger: string;
    nonrevenue_excluded: string[];
  };
  authorizes_decision_persistence: false;
};

describe("Plan 040 QBNR Package 4 evidence-only risk draft", () => {
  it("freezes exact 23-key parity with zero overlap and immutable source hashes", () => {
    const acquisitionBytes = readFileSync(acquisitionPath);
    const evidenceBytes = readFileSync(evidencePath);
    const draftBytes = readFileSync(draftPath);
    const acquisition = JSON.parse(
      acquisitionBytes.toString("utf8"),
    ) as Acquisition;
    const draft = JSON.parse(
      draftBytes.toString("utf8"),
    ) as Plan040Package4Draft;

    expect(sha256(acquisitionBytes)).toBe(
      "3f804faabcbb769d037033eeeececda59fd93a3052a2d739f16680b1befe9431",
    );
    expect(sha256(evidenceBytes)).toBe(
      "f105bd93bfeb2b0504e9819885f55d67c77e14840836dbc58ab06ced5b6c2072",
    );
    expect(sha256(draftBytes)).toBe(
      "04fc4c0168eda1081ed5338b77794ba61be4c1346854ed1f9a628945607113ed",
    );
    expect(plan040Package4ReplayHash(draft as unknown as JsonValue)).toBe(
      sha256(draftBytes),
    );
    expect(acquisition.candidate_count).toBe(23);
    expect(acquisition.candidate_route_order).toEqual([
      ...PLAN040_PACKAGE_4_ROUTE_ORDER,
    ]);
    expect(draft.candidates.map((candidate) => candidate.gtfs_route_id))
      .toEqual([...PLAN040_PACKAGE_4_ROUTE_ORDER]);
    expect(acquisition.candidate_key_sha256).toBe(
      "68e73dc82486efb1744a1b826694af767b7e609dfeadbe9ab4b038a681d40eca",
    );
    expect(draft.candidate_key_sha256).toBe(
      acquisition.candidate_key_sha256,
    );
    expect(acquisition.prior_packages).toEqual([
      {
        package_id: "plan040-package2",
        path:
          "data/quality/operational-reference/member-extent-risk/" +
          "plan-040-qbnr-stop-removal-package-2-decision-draft-v1.json",
        sha256:
          "ade4e511ab132d3b8eb4f7fa2225dcab0e84d8e8921cc5bd7e3c3126fb61ba5a",
        candidate_count: 24,
        overlap_count: 0,
      },
      {
        package_id: "plan040-package3",
        path:
          "data/quality/operational-reference/member-extent-risk/" +
          "plan-040-qbnr-stop-removal-package-3-evidence-draft-v1.json",
        sha256:
          "1a3f446553955e75c373831ea282b1b4c0a2ceda2bfaec5f00a737d270b5fdbd",
        candidate_count: 13,
        overlap_count: 0,
      },
    ]);
  });

  it("keeps six incomplete boundaries explicit and never treats route rows as trips", () => {
    const acquisition = readJson<Acquisition>(acquisitionPath);
    const draft = readJson<Plan040Package4Draft>(draftPath);
    expect(draft.boundary_distribution).toEqual({
      complete_weekend_launch_boundary: 13,
      complete_weekday_launch_boundary: 4,
      cross_family_transfer_incomplete: 2,
      pre_inventory_absent: 1,
      both_boundary_inventories_absent: 3,
    });
    const complete = acquisition.candidate_parity.filter((candidate) =>
      candidate.complete_active_trip_boundary);
    expect(complete).toHaveLength(17);
    expect(complete.every((candidate) =>
      candidate.pre_active_trip_count > 0 &&
      candidate.post_active_trip_count > 0)).toBe(true);

    const incompleteRoutes = ["Q29", "Q39", "Q54", "Q55", "Q58", "Q59"];
    const incomplete = acquisition.candidate_parity.filter((candidate) =>
      incompleteRoutes.includes(candidate.gtfs_route_id));
    expect(incomplete).toHaveLength(6);
    expect(incomplete.every((candidate) =>
      candidate.route_row_presence_is_not_trip_inventory &&
      !candidate.complete_active_trip_boundary)).toBe(true);
    expect(incomplete.find((candidate) => candidate.gtfs_route_id === "Q29"))
      .toMatchObject({
        pre_source_id: "gtfs_static_20250625_busco_pre_qbnr",
        post_source_id: "gtfs_static_20250626_queens_post_qbnr",
        post_route_trip_row_count: 0,
        post_active_trip_count: 0,
        boundary_class: "cross_family_transfer_incomplete",
      });
    expect(incomplete.find((candidate) => candidate.gtfs_route_id === "Q39"))
      .toMatchObject({
        pre_source_id: "gtfs_static_20250625_busco_pre_qbnr",
        post_source_id: "gtfs_static_20250626_queens_post_qbnr",
        post_route_trip_row_count: 0,
        post_active_trip_count: 0,
        boundary_class: "cross_family_transfer_incomplete",
      });
    for (const routeId of incompleteRoutes) {
      expect(draft.candidates.find((candidate) =>
        candidate.gtfs_route_id === routeId)).toMatchObject({
          evidence_verdict: "receipt_terminal_unresolved",
          proposed_extent_decision: null,
          proposed_grain_decision: null,
          authorizes_decision_persistence: false,
        });
    }
  });

  it("pins only the four accepted launch feeds and candidate-specific stop lists", () => {
    const acquisition = readJson<Acquisition>(acquisitionPath);
    expect(acquisition.accepted_launch_feeds.map((feed) => [
      feed.source_id,
      feed.zip_sha1,
    ])).toEqual([
      [
        "gtfs_static_20250615_queens_pre_qbnr",
        "c96466458c55036cd6feeadc291bf5951d6c3274",
      ],
      [
        "gtfs_static_20250625_busco_pre_qbnr",
        "a52f278150cd9bc03082f76fccd57f1c8c331d3c",
      ],
      [
        "gtfs_static_20250626_queens_post_qbnr",
        "c868290ddcd79c69712d809ece96d96dbad2c613",
      ],
      [
        "gtfs_static_20250626_busco_post_qbnr",
        "54653b3fafb5fabc5ab1c941780b871343138440",
      ],
    ]);
    expect(acquisition.stop_list_source_count).toBe(23);
    for (const source of acquisition.stop_list_sources) {
      expect(source.source_url).toMatch(
        /^https:\/\/www\.mta\.info\/document\/\d+$/u,
      );
      expect(source.source_url_derivation).toMatchObject({
        route_row: source.route_id,
        anchor_text: "View the full list of stops.",
      });
      expect(source.source_id).toBe(
        `mta_qbnr_2025_${source.route_id.toLowerCase()}_stop_list`,
      );
      expect(source.receipt_sha256).toHaveLength(64);
      expect(source.pdf_sha256).toHaveLength(64);
      expect(source.layout_text_sha256).toHaveLength(64);
      expect(source.raw_text_sha256).toHaveLength(64);
      expect(source.blocks_sha256).toHaveLength(64);
      expect(source.authorizes_decision_persistence).toBe(false);
    }
    expect(acquisition.schedule_trip_type_policy.nonrevenue_excluded)
      .toEqual(["2", "3", "4"]);
  });

  it("fails closed with zero persistence and deterministic reconstruction", () => {
    const draft = readJson<Plan040Package4Draft>(draftPath);
    expect(draft.evidence_verdict_distribution).toEqual({
      evidence_complete_stop_set: 0,
      receipt_terminal_unresolved: 23,
    });
    expect(draft.proposed_extent_distribution).toEqual({
      stop_set: 0,
      unresolved: 23,
    });
    expect(draft.proposed_decision_count).toBe(0);
    expect(draft.persisted_decision_count).toBe(0);
    expect(draft.proposed_grain_decision_count).toBe(0);
    expect(draft.persisted_grain_decision_count).toBe(0);
    expect(draft.authorization_state).toBe(
      "evidence_only_no_gate_no_persistence",
    );
    expect(draft.candidates.every((candidate) =>
      candidate.evidence_verdict === "receipt_terminal_unresolved" &&
      candidate.proposed_extent_decision === null &&
      candidate.proposed_grain_decision === null &&
      !candidate.authorizes_occurrence &&
      !candidate.authorizes_study &&
      !candidate.authorizes_cross_product &&
      !candidate.authorizes_decision_persistence)).toBe(true);
    expect(buildPlan040Package4Draft({
      extentLedger: draft.extent_ledger,
      grainLedger: draft.grain_ledger,
      priorPackages: draft.prior_packages,
      acquisitionReceiptPath: draft.acquisition_receipt.path,
      acquisitionReceiptSha256: draft.acquisition_receipt.sha256,
      evidenceManifestPath: draft.evidence_manifest.path,
      evidenceManifestSha256: draft.evidence_manifest.sha256,
      candidates: [...draft.candidates].reverse(),
    })).toEqual(draft);
  });

  it("validates dual approval and exact-package absence-only acceptance", () => {
    type GateAndAcceptance =
      ReturnType<typeof buildPlan040Package4GateAndAcceptance>;
    const draft = readJson<Plan040Package4Draft>(draftPath);
    const gateBytes = readFileSync(gatePath);
    const acceptanceBytes = readFileSync(acceptancePath);
    expect(sha256(gateBytes)).toBe(
      "8194f8d0769e5d552cabab9669385487e52592e9bbd2121a898214dc2af57be7",
    );
    expect(sha256(acceptanceBytes)).toBe(
      "08381028607d4ac2cffea33891eb87b5dade22e44ff40133f8d7171b090169fb",
    );
    const gate = JSON.parse(
      gateBytes.toString("utf8"),
    ) as GateAndAcceptance["gate"];
    const acceptance = JSON.parse(
      acceptanceBytes.toString("utf8"),
    ) as GateAndAcceptance["acceptance"];
    expect(validatePlan040Package4GateAndAcceptance({
      draft,
      gate,
      acceptance,
      acceptedAt: acceptance.accepted_at,
    })).toEqual({
      candidate_count: 23,
      positive_candidate_count: 0,
      unresolved_candidate_count: 23,
      authorized_extent_decision_count: 0,
      authorized_grain_decision_count: 0,
      authorized_absence_candidate_count: 23,
      persisted_decision_count: 0,
      persisted_absence_receipt_count: 0,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(gate.reviewed_commit).toBe(
      "ead95f107779bfdbbf4e1343f9db835e4c95119d",
    );
    expect(gate.reviewer_results).toEqual([
      {
        role: "independent_main_advisor_evidence_review",
        reviewer_id: "main_advisor",
        verdict: "APPROVE",
      },
      {
        role: "independent_provenance_and_fail_closed_audit",
        reviewer_id: "plan040_package4_independent_audit",
        verdict: "APPROVE",
      },
    ]);
    expect(acceptance.authorized_positive_persistence).toEqual({
      candidate_count: 0,
      candidate_keys: [],
      extent_decision_ids: [],
      grain_decision_ids: [],
    });
    expect(acceptance.authorized_reviewed_absence_receipt).toMatchObject({
      receipt_id:
        "plan-040-qbnr-stop-removal-package-4-reviewed-absence-v1",
      candidate_count: 23,
      candidate_key_sha256:
        "68e73dc82486efb1744a1b826694af767b7e609dfeadbe9ab4b038a681d40eca",
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
    expect(() => validatePlan040Package4GateAndAcceptance({
      draft,
      gate,
      acceptance: {
        ...acceptance,
        authorizes_decision_persistence: true,
      },
      acceptedAt: acceptance.accepted_at,
    })).toThrow("owner/delegate acceptance drifted");
  });

  it("builds one exact 23-key reviewed-absence receipt and no decisions", () => {
    type GateAndAcceptance =
      ReturnType<typeof buildPlan040Package4GateAndAcceptance>;
    const draft = readJson<Plan040Package4Draft>(draftPath);
    const gate = readJson<GateAndAcceptance["gate"]>(gatePath);
    const acceptance =
      readJson<GateAndAcceptance["acceptance"]>(acceptancePath);
    const accepted = buildPlan040Package4AcceptedArtifacts({
      draft,
      gate,
      acceptance,
    });
    expect(accepted.extentDecisions).toEqual([]);
    expect(accepted.grainDecisions).toEqual([]);
    expect(accepted.absenceReceipt).toMatchObject({
      contract_id: "member-extent-absence-receipt-v1",
      receipt_id:
        "plan-040-qbnr-stop-removal-package-4-reviewed-absence-v1",
      surfaces: ["member_extent", "member_grain"],
      reviewed_at: "2026-07-24T05:22:18Z",
      reviewed_by: "codex-owner-delegate",
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(accepted.absenceReceipt.extent_keys).toHaveLength(23);
    expect(accepted.absenceReceipt.exact_searches).toHaveLength(23);
    expect(accepted.absenceReceipt.urls_inspected).toHaveLength(23);
    expect(accepted.absenceReceipt.urls_inspected.every((url) =>
      /^https:\/\/www\.mta\.info\/document\/[0-9]+$/u.test(url))).toBe(true);
    for (const candidate of draft.candidates) {
      expect(accepted.absenceReceipt.exact_searches.some((search) =>
        search.includes(`candidate=${candidate.candidate_key}`) &&
        search.includes(`official_stop_list=${candidate.stop_list_url}`) &&
        search.includes(
          `boundary=${candidate.boundary_evidence.boundary_class}`,
        ) &&
        search.includes(
          "route_row_presence_is_not_trip_inventory=true",
        ) &&
        candidate.unresolved_gap_codes.every((gap) =>
          search.includes(gap)))).toBe(true);
    }
    expect(sha256(`${stableJson({
      receipts: [accepted.absenceReceipt],
    } as JsonValue)}\n`)).toBe(
      "59ead8f03b2ebc87def775fb3d4e5d333f3fc7ed7a8ef0197b12e405f0d0361b",
    );
  });

  it("replays the immutable absence-only acceptance through its strict loader", () => {
    const first = acceptPlan040Package4ReceiptPackage();
    const second = acceptPlan040Package4ReceiptPackage();
    expect(second).toEqual(first);
    expect(first).toEqual({
      absenceReceiptPath:
        PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ABSENCE_RECEIPT_PATH,
      absenceReceiptSha256:
        "59ead8f03b2ebc87def775fb3d4e5d333f3fc7ed7a8ef0197b12e405f0d0361b",
      extentDecisionCount: 0,
      grainDecisionCount: 0,
      absenceCandidateCount: 23,
    });
    const receipts = loadMemberExtentAbsenceReceipts([
      dirname(PLAN040_QBNR_STOP_REMOVAL_PACKAGE_4_ABSENCE_RECEIPT_PATH),
    ]).filter((receipt) =>
      receipt.receipt_id ===
        "plan-040-qbnr-stop-removal-package-4-reviewed-absence-v1");
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.extent_keys).toHaveLength(23);
    expect(receipts[0]!.surfaces).toEqual([
      "member_extent",
      "member_grain",
    ]);
  });

  it("materializes exactly 23 absence rows on both ledgers with no positive extent", () => {
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
    expect(distribution(companion, "extent")).toEqual(
      PLAN040_PACKAGE_15_CONTRACT_EXTENT_HISTOGRAM,
    );
    expect(distribution(extentLedger, "verdict")).toEqual(
      PLAN040_PACKAGE_15_EXTENT_VERDICT_HISTOGRAM,
    );
    expect(distribution(grainLedger, "verdict")).toEqual(
      PLAN040_PACKAGE_15_GRAIN_VERDICT_HISTOGRAM,
    );
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
    const draft = readJson<Plan040Package4Draft>(draftPath);
    for (const candidate of draft.candidates) {
      expect(companionByKey.get(candidate.candidate_key)).toMatchObject({
        extent: "unresolved",
        authorizes_study: false,
        authorizes_cross_product: false,
      });
      expect(extentByKey.get(candidate.candidate_key)).toMatchObject({
        verdict: "absent_in_source",
        receipt_ids: [
          "plan-040-qbnr-stop-removal-package-4-reviewed-absence-v1",
        ],
        authorizes_study: false,
        authorizes_cross_product: false,
      });
      expect(grainByKey.get(candidate.candidate_key)).toMatchObject({
        verdict: "absent_in_source",
        receipt_ids: [
          "plan-040-qbnr-stop-removal-package-4-reviewed-absence-v1",
        ],
        authorizes_study: false,
        authorizes_cross_product: false,
      });
    }
    expect(companion.filter((row) =>
      draft.candidates.some((candidate) =>
        candidate.candidate_key === extentDecisionKey(row as never)) &&
      row.extent !== "unresolved")).toHaveLength(0);
  });
});
