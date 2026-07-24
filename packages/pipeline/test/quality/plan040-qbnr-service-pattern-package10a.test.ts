import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import type { JsonValue } from "../../../db/src/types";
import type {
  MemberExtentAbsenceReceipt,
  MemberExtentLedgerRow,
  MemberGrainLedgerRow,
} from "../../src/quality/member-extent-ledger";
import {
  PLAN040_PACKAGE_10A_ABSENCE_RECEIPT_SHA256,
  PLAN040_PACKAGE_10A_REVIEWED_COMMIT,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ABSENCE_RECEIPT_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ACCEPTANCE_PATH,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_GATE_PATH,
  buildPlan040Package10aAcceptedReceipt,
  buildPlan040Package10aGateAndAcceptance,
  validatePlan040Package10aGateAndAcceptance,
} from "../../src/quality/plan040-qbnr-service-pattern-package10a-closeout";
import {
  PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS,
  PLAN040_PACKAGE_10A_CANDIDATES,
  PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_10A_EXCLUSION_SCOPES,
  PLAN040_PACKAGE_10A_EXACT_STATEMENTS,
  PLAN040_PACKAGE_10A_POST_P9_PINS,
  buildPlan040Package10aDraft,
  plan040Package10aReplayHash,
  type Plan040Package10aCandidateEvidence,
  type Plan040Package10aDraft,
  type Plan040Package10aExclusion,
} from "../../src/quality/plan040-qbnr-service-pattern-package10a";
import type { Plan040Package8VersionSeparation } from "../../src/quality/plan040-qbnr-service-pattern-package8";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const evidencePath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-10a-evidence-v1.json`;
const draftPath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-10a-evidence-draft-v1.json`;
const EVIDENCE_SHA256 =
  "2d0bb750a8ecec2dcd2f686085669007696f96476aa3fe6af1d1c4156923acc6";
const DRAFT_SHA256 =
  "e7b2c7b030d1a4a992f55b94a80e0f9c236fa284c9482a5ee50935c0d0c2814e";
const GATE_SHA256 =
  "d839d7c21e14af139f26414967291f6a8cfe1aa1d3546a0aa789e678b0f17a4b";
const ACCEPTANCE_SHA256 =
  "4762b8231d581a4b9a89028029458a796076706c5f51e40726978ff5bcbe96f1";
const ACCEPTED_AT = "2026-07-24T12:48:03Z";

type Package10aEvidence = {
  candidate_count: 4;
  route_count: 4;
  candidate_key_sha256: string;
  candidates: Plan040Package10aCandidateEvidence[];
  exclusions: Plan040Package10aExclusion[];
  prior_package_overlap_count: 0;
  immutable_inputs: {
    post_p9_pins: typeof PLAN040_PACKAGE_10A_POST_P9_PINS;
    package_8_feed_identity_artifact: {
      path: string;
      sha256: string;
    };
    accepted_busco_feed_identities:
      typeof PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS;
    extracted_member_sha256: {
      pre: Record<string, string>;
      post: Record<string, string>;
    };
  };
  exact_positive_policy: Record<string, boolean>;
  source_gap_policy: Record<string, boolean>;
  version_separation: Plan040Package8VersionSeparation;
  evidence_verdict_distribution: { receipt_terminal_unresolved: 4 };
  proposed_extent_distribution: { unresolved: 4 };
  proposed_grain_distribution: { unresolved: 4 };
  review_protocol: Plan040Package10aDraft["review_protocol"];
  authorization_state: string;
  proposed_extent_decision_count: 0;
  proposed_grain_decision_count: 0;
  persisted_extent_decision_count: 0;
  persisted_grain_decision_count: 0;
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const orderedHash = (values: readonly string[]): string =>
  sha256(`${values.join("\n")}\n`);
const rowHash = (values: readonly unknown[]): string =>
  sha256(`${values.map((value) =>
    stableJson(value as JsonValue)).join("\n")}\n`);
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const readJsonl = <T>(path: string): T[] =>
  readFileSync(path, "utf8").trim().split("\n")
    .filter(Boolean).map((line) => JSON.parse(line) as T);
const clone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
const inputFor = (
  evidence: Package10aEvidence,
  candidates = evidence.candidates,
  exclusions = evidence.exclusions,
) => ({
  evidenceManifestPath:
    "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-10a-evidence-v1.json",
  evidenceManifestSha256: EVIDENCE_SHA256,
  candidates,
  exclusions,
  priorCandidateKeys: [] as string[],
  versionSeparation: evidence.version_separation,
});

describe("Plan 040 QBNR Package 10A accelerated absence freeze", () => {
  it("freezes exactly four candidates and only the evidence artifacts", () => {
    const evidenceBytes = readFileSync(evidencePath);
    const draftBytes = readFileSync(draftPath);
    const evidence = JSON.parse(
      evidenceBytes.toString("utf8"),
    ) as Package10aEvidence;
    const draft = JSON.parse(
      draftBytes.toString("utf8"),
    ) as Plan040Package10aDraft;

    expect(sha256(evidenceBytes)).toBe(EVIDENCE_SHA256);
    expect(sha256(draftBytes)).toBe(DRAFT_SHA256);
    expect(plan040Package10aReplayHash(
      draft as unknown as JsonValue,
    )).toBe(DRAFT_SHA256);
    expect(evidence.candidate_count).toBe(4);
    expect(evidence.route_count).toBe(4);
    expect(evidence.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256,
    );
    expect(sortedHash(evidence.candidates.map((row) =>
      row.candidate_key))).toBe(PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256);
    expect(evidence.candidates.map((candidate) => [
      candidate.gtfs_route_id,
      candidate.treatment_record_id,
    ])).toEqual(PLAN040_PACKAGE_10A_CANDIDATES);
    expect(
      readdirSync(riskRoot).filter((name) =>
        name.includes("service-pattern-package-10a")
      ).sort(),
    ).toEqual([
      "plan-040-qbnr-service-pattern-package-10a-evidence-draft-v1.json",
      "plan-040-qbnr-service-pattern-package-10a-evidence-v1.json",
      "plan-040-qbnr-service-pattern-package-10a-independent-review-gate-v1.json",
      "plan-040-qbnr-service-pattern-package-10a-owner-acceptance-v1.json",
    ]);
  });

  it("pins each canonical statement to its exact evidence block and text", () => {
    const evidence = readJson<Package10aEvidence>(evidencePath);
    for (const candidate of evidence.candidates) {
      const expected =
        PLAN040_PACKAGE_10A_EXACT_STATEMENTS[
          candidate.treatment_record_id
        ];
      expect(candidate.source_statement).toEqual({
        source_id: "mta_queens_bus_network_redesign_service_changes",
        ...expected,
        names_predecessor_route: false,
      });
      expect(candidate.source_row.route_row).toBe(candidate.gtfs_route_id);
      expect(candidate.source_row.source_html_sha256).toBe(
        PLAN040_PACKAGE_10A_POST_P9_PINS.service_change_html,
      );
    }
  });

  it("pins accepted BusCo identities and expands both GTFS calendar tables", () => {
    const evidence = readJson<Package10aEvidence>(evidencePath);
    expect(evidence.immutable_inputs.accepted_busco_feed_identities).toEqual(
      PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS,
    );
    expect(evidence.immutable_inputs.package_8_feed_identity_artifact)
      .toEqual({
        path:
          "data/quality/operational-reference/member-extent-risk/" +
          "plan-040-qbnr-service-pattern-package-8-evidence-v1.json",
        sha256:
          PLAN040_PACKAGE_10A_POST_P9_PINS.package_8_feed_identity_artifact,
      });
    const expectedPost = {
      Q51: [302, 88],
      Q74: [303, 79],
      Q115: [483, 154],
      QM65: [26, 13],
    } as const;
    for (const candidate of evidence.candidates) {
      const { pre, post } = candidate.accepted_launch_inventory;
      expect(pre).toEqual(expect.objectContaining({
        boundary: PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.pre.boundary,
        source_id: PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.pre.source_id,
        receipt_path:
          PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.pre.receipt_path,
        receipt_sha256:
          PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.pre.receipt_sha256,
        zip_sha1: PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.pre.zip_sha1,
        source_zip_sha256:
          PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.pre.zip_sha256,
        route_row_count: 1,
        all_route_trip_count: 0,
        active_route_trip_count: 0,
        active_shape_count: 0,
      }));
      expect(post).toEqual(expect.objectContaining({
        boundary: PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.post.boundary,
        source_id: PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.post.source_id,
        receipt_path:
          PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.post.receipt_path,
        receipt_sha256:
          PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.post.receipt_sha256,
        zip_sha1: PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.post.zip_sha1,
        source_zip_sha256:
          PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.post.zip_sha256,
        route_row_count: 1,
        all_route_trip_count: expectedPost[candidate.gtfs_route_id][0],
        active_route_trip_count: expectedPost[candidate.gtfs_route_id][1],
      }));
      for (const slice of [pre, post]) {
        expect(slice.calendar_expansion.policy).toBe(
          "calendar_plus_calendar_dates",
        );
        expect(slice.calendar_expansion.active_service_id_sha256).toBe(
          sortedHash(slice.calendar_expansion.active_service_ids),
        );
        expect(Object.values(slice.active_direction_counts)
          .reduce((sum, count) => sum + count, 0)).toBe(
            slice.active_route_trip_count,
          );
      }
    }
  });

  it("stores complete ordered post full-stop chain identities", () => {
    const evidence = readJson<Package10aEvidence>(evidencePath);
    for (const candidate of evidence.candidates) {
      const chain = candidate.post_full_stop_chains;
      expect(chain.complete_active_trip_coverage).toBe(true);
      expect(chain.active_trip_count).toBe(
        candidate.accepted_launch_inventory.post.active_route_trip_count,
      );
      expect(chain.covered_trip_count).toBe(chain.active_trip_count);
      expect(chain.patterns).toHaveLength(2);
      expect(chain.patterns.reduce(
        (sum, pattern) => sum + pattern.trip_count,
        0,
      )).toBe(chain.active_trip_count);
      for (const pattern of chain.patterns) {
        expect(pattern.stop_ids).toHaveLength(pattern.stop_count);
        expect(pattern.stop_chain_sha256).toBe(
          orderedHash(pattern.stop_ids),
        );
        expect(pattern.pattern_id.endsWith(
          pattern.stop_chain_sha256.slice(0, 16),
        )).toBe(true);
        expect(pattern.shape_ids.length).toBeGreaterThan(0);
      }
      expect(chain.candidate_treatment_binding_authorized).toBe(false);
      expect(chain.post_chain_presence_authorizes_extent).toBe(false);
    }
  });

  it("freezes each complete post-P9 ledger row structurally", () => {
    const evidence = readJson<Package10aEvidence>(evidencePath);
    for (const candidate of evidence.candidates) {
      expect(candidate.prior_ledger_state.extent_row).toEqual(
        expect.objectContaining({
          packet_id: null,
          current_extent_kind: "unresolved",
          verdict: "unreviewed",
          receipt_ids: [],
          updated_at: null,
          authorizes_study: false,
          authorizes_cross_product: false,
        }),
      );
      expect(candidate.prior_ledger_state.grain_row).toEqual(
        expect.objectContaining({
          packet_id: null,
          current_extent_kind: "unresolved",
          verdict: "unreviewed",
          spatial_verdict: "unreviewed",
          receipt_ids: [],
          updated_at: null,
          authorizes_study: false,
          authorizes_cross_product: false,
        }),
      );
    }
  });

  it("records exact candidate searches and both terminal source gaps", () => {
    const evidence = readJson<Package10aEvidence>(evidencePath);
    const expectedScheduleRows = {
      Q51: 0,
      Q74: 0,
      Q115: 14841,
      QM65: 0,
    } as const;
    for (const candidate of evidence.candidates) {
      expect(candidate.exact_candidate_searches.length)
        .toBeGreaterThanOrEqual(11);
      expect(candidate.exact_candidate_searches.some((search) =>
        search.includes(candidate.candidate_key))).toBe(true);
      expect(candidate.exact_candidate_searches.some((search) =>
        search.includes(candidate.source_statement.evidence_id))).toBe(
          true,
        );
      expect(candidate.candidate_detail_source_gap.staged_metadata_matches)
        .toBe(0);
      expect(candidate.schedule_detail_gap).toEqual(
        expect.objectContaining({
          source_sha256:
            PLAN040_PACKAGE_10A_POST_P9_PINS.main_schedule_source,
          route_row_count: expectedScheduleRows[candidate.gtfs_route_id],
          launch_date_row_count: 0,
          later_nonlaunch_rows_are_nonauthorizing: true,
        }),
      );
      expect(candidate.unresolved_gap_codes).toEqual([
        "zero_active_pre_inventory_no_predecessor_lineage",
        "post_only_inventory_is_nonauthorizing",
        "candidate_detail_source_missing",
        "exact_launch_date_schedule_binding_missing",
        "candidate_scope_not_bound_to_exact_versioned_member_extent",
      ]);
    }
  });

  it("excludes only the exact risk12, Q67, and Q48-Q75 scopes", () => {
    const evidence = readJson<Package10aEvidence>(evidencePath);
    expect(evidence.exclusions.map((row) => row.scope_id).sort()).toEqual(
      ["q48_q75", "q67", "risk_12"],
    );
    for (const exclusion of evidence.exclusions) {
      const expected =
        PLAN040_PACKAGE_10A_EXCLUSION_SCOPES[exclusion.scope_id];
      expect(exclusion.candidate_count).toBe(expected.candidate_count);
      expect(exclusion.candidate_key_sha256).toBe(
        expected.candidate_key_sha256,
      );
      expect(sortedHash(exclusion.candidate_keys)).toBe(
        expected.candidate_key_sha256,
      );
      expect(exclusion.candidate_keys.map((key) => key.split("\0")[2])
        .sort()).toEqual([...expected.treatment_ids].sort());
      expect(exclusion.overlap_count).toBe(0);
    }
  });

  it("fails closed on statement, feed, inventory, chain, and exclusion drift", () => {
    const evidence = readJson<Package10aEvidence>(evidencePath);
    const rebuilt = buildPlan040Package10aDraft(inputFor(evidence));
    expect(plan040Package10aReplayHash(
      rebuilt as unknown as JsonValue,
    )).toBe(DRAFT_SHA256);

    const statement = clone(evidence.candidates);
    statement[0]!.source_statement.raw_text += " drift";
    expect(() =>
      buildPlan040Package10aDraft(inputFor(evidence, statement))
    ).toThrow(/fail-closed evidence|statement/u);

    const feed = clone(evidence.candidates);
    feed[0]!.accepted_launch_inventory.pre.receipt_sha256 = "0".repeat(64);
    expect(() =>
      buildPlan040Package10aDraft(inputFor(evidence, feed))
    ).toThrow(/inventory|authority/u);

    const inventory = clone(evidence.candidates);
    inventory[0]!.accepted_launch_inventory.pre.all_route_trip_count = 1;
    expect(() =>
      buildPlan040Package10aDraft(inputFor(evidence, inventory))
    ).toThrow(/inventory|authority/u);

    const chain = clone(evidence.candidates);
    chain[0]!.post_full_stop_chains.patterns[0]!.stop_ids.reverse();
    expect(() =>
      buildPlan040Package10aDraft(inputFor(evidence, chain))
    ).toThrow(/chain/u);

    const exclusions = clone(evidence.exclusions);
    exclusions[0]!.candidate_keys.pop();
    exclusions[0]!.candidate_count -= 1;
    exclusions[0]!.candidate_key_sha256 = sortedHash(
      exclusions[0]!.candidate_keys,
    );
    expect(() =>
      buildPlan040Package10aDraft(
        inputFor(evidence, evidence.candidates, exclusions),
      )
    ).toThrow(/exclusion/u);
  });

  it("keeps all decisions and authority absent pending one review", () => {
    const evidence = readJson<Package10aEvidence>(evidencePath);
    const draft = readJson<Plan040Package10aDraft>(draftPath);
    expect(evidence.evidence_verdict_distribution).toEqual({
      receipt_terminal_unresolved: 4,
    });
    expect(evidence.proposed_extent_decision_count).toBe(0);
    expect(evidence.proposed_grain_decision_count).toBe(0);
    expect(evidence.persisted_extent_decision_count).toBe(0);
    expect(evidence.persisted_grain_decision_count).toBe(0);
    expect(draft.review_protocol).toEqual({
      review_mode:
        "one_independent_review_plus_automated_fail_closed_tests",
      independent_review_required: true,
      dual_independent_review_required: false,
      owner_gate_created: false,
      owner_acceptance_created: false,
      persistence_performed: false,
    });
    expect(draft.authorization_state).toBe(
      "evidence_draft_pending_one_independent_review_no_gate_no_acceptance_no_persistence",
    );
    for (const candidate of draft.candidates) {
      expect(candidate.evidence_verdict).toBe(
        "receipt_terminal_unresolved",
      );
      expect(candidate.proposed_extent_decision).toBeNull();
      expect(candidate.proposed_grain_decision).toBeNull();
      expect(candidate.persisted_extent_decision).toBeNull();
      expect(candidate.persisted_grain_decision).toBeNull();
      expect(candidate.authorizes_occurrence).toBe(false);
      expect(candidate.authorizes_study).toBe(false);
      expect(candidate.authorizes_cross_product).toBe(false);
      expect(candidate.authorizes_decision_persistence).toBe(false);
    }
  });

  it("freezes one approved independent review and exact owner acceptance", () => {
    const draft = readJson<Plan040Package10aDraft>(draftPath);
    const gate = readJson<unknown>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_GATE_PATH,
    );
    const acceptance = readJson<unknown>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ACCEPTANCE_PATH,
    );
    expect(sha256(readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_GATE_PATH,
    ))).toBe(GATE_SHA256);
    expect(sha256(readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ACCEPTANCE_PATH,
    ))).toBe(ACCEPTANCE_SHA256);
    expect(validatePlan040Package10aGateAndAcceptance({
      draft,
      gate,
      acceptance,
      acceptedAt: ACCEPTED_AT,
    })).toEqual({
      candidate_count: 4,
      positive_candidate_count: 0,
      unresolved_candidate_count: 4,
      authorized_extent_decision_count: 0,
      authorized_grain_decision_count: 0,
      authorized_absence_candidate_count: 4,
      persisted_decision_count: 0,
      persisted_absence_receipt_count: 0,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    const built = buildPlan040Package10aGateAndAcceptance({
      draft,
      acceptedAt: ACCEPTED_AT,
    });
    expect(built.gate).toEqual(gate);
    expect(built.acceptance).toEqual(acceptance);
    expect(built.gate.reviewer_result).toEqual({
      reviewer_id: "main_advisor",
      role: "independent_fail_closed_evidence_review",
      reviewed_commit: PLAN040_PACKAGE_10A_REVIEWED_COMMIT,
      verdict: "APPROVE",
    });
    expect(built.gate.authorizes_reviewed_absence_receipt_persistence)
      .toBe(false);
    expect(built.acceptance.authorized_positive_persistence).toEqual({
      candidate_count: 0,
      candidate_keys: [],
      extent_decision_ids: [],
      grain_decision_ids: [],
    });
    expect(
      built.acceptance.authorized_reviewed_absence_receipt,
    ).toEqual(expect.objectContaining({
      candidate_count: 4,
      candidate_key_sha256:
        PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256,
      surfaces: ["member_extent", "member_grain"],
    }));
    expect(
      built.acceptance.authorizes_reviewed_absence_receipt_persistence,
    ).toBe(true);
    expect(built.acceptance.authorizes_decision_persistence).toBe(false);
    expect(built.acceptance.authorizes_occurrence).toBe(false);
    expect(built.acceptance.authorizes_study).toBe(false);
    expect(built.acceptance.authorizes_cross_product).toBe(false);

    const mutatedGate = clone(built.gate);
    mutatedGate.reviewer_result.verdict = "REFUTE" as "APPROVE";
    expect(() =>
      validatePlan040Package10aGateAndAcceptance({
        draft,
        gate: mutatedGate,
        acceptance,
        acceptedAt: ACCEPTED_AT,
      })
    ).toThrow(/gate drifted/u);
  });

  it("persists one immutable four-key dual-surface absence receipt only", () => {
    const draft = readJson<Plan040Package10aDraft>(draftPath);
    const built = buildPlan040Package10aGateAndAcceptance({
      draft,
      acceptedAt: ACCEPTED_AT,
    });
    const receipt = buildPlan040Package10aAcceptedReceipt({
      draft,
      gate: built.gate,
      acceptance: built.acceptance,
    });
    const artifact = readJson<{ receipts: MemberExtentAbsenceReceipt[] }>(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ABSENCE_RECEIPT_PATH,
    );
    expect(sha256(readFileSync(
      PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A_ABSENCE_RECEIPT_PATH,
    ))).toBe(PLAN040_PACKAGE_10A_ABSENCE_RECEIPT_SHA256);
    expect(artifact.receipts).toEqual([receipt]);
    expect(receipt.receipt_id).toBe(
      "plan-040-qbnr-service-pattern-package-10a-reviewed-absence-v1",
    );
    expect(receipt.surfaces).toEqual(["member_extent", "member_grain"]);
    expect(receipt.extent_keys).toHaveLength(4);
    expect(receipt.exact_searches).toHaveLength(4);
    expect(new Set(receipt.exact_searches).size).toBe(4);
    expect(receipt.authorizes_study).toBe(false);
    expect(receipt.authorizes_cross_product).toBe(false);
    for (const candidate of draft.candidates) {
      expect(receipt.exact_searches.some((search) =>
        search.includes(candidate.candidate_key) &&
        search.includes(candidate.source_statement.evidence_id) &&
        search.includes(
          candidate.accepted_launch_inventory.pre.receipt_sha256,
        ) &&
        search.includes(
          candidate.accepted_launch_inventory.post.receipt_sha256,
        ) &&
        search.includes("predecessor_route_named=false") &&
        search.includes("post_only_presence_authorizes_occurrence=false")
      )).toBe(true);
    }
    for (
      const directory of [
        `${repoRoot}/data/quality/operational-reference/` +
          "member-extent-ledger-decisions",
        `${repoRoot}/data/quality/operational-reference/` +
          "member-grain-decisions",
      ]
    ) {
      expect(readdirSync(directory).filter((name) =>
        name.includes("package-10a")
      )).toEqual([]);
    }

    const mutation = clone(built.acceptance);
    mutation.authorized_positive_persistence.candidate_count = 1 as 0;
    expect(() =>
      buildPlan040Package10aAcceptedReceipt({
        draft,
        gate: built.gate,
        acceptance: mutation,
      })
    ).toThrow(/acceptance|scope/u);
  });

  it("overlays exactly four rows while preserving every prior reviewed row", () => {
    const evidence = readJson<Package10aEvidence>(evidencePath);
    const targetIds = new Set(evidence.candidates.map((candidate) =>
      candidate.treatment_record_id
    ));
    const extentRows = readJsonl<MemberExtentLedgerRow>(
      `${repoRoot}/data/quality/operational-reference/` +
        "member-extent-ledger.jsonl",
    );
    const grainRows = readJsonl<MemberGrainLedgerRow>(
      `${repoRoot}/data/quality/operational-reference/` +
        "member-grain-ledger.jsonl",
    );
    expect(rowHash(extentRows.filter((row) =>
      !targetIds.has(row.treatment_record_id as
        Plan040Package10aCandidateEvidence["treatment_record_id"])
    ))).toBe(
      "e9460307913dafe91298462f2bf7d629101804273abec5ec1e5a43357ad81a5d",
    );
    expect(rowHash(grainRows.filter((row) =>
      !targetIds.has(row.treatment_record_id as
        Plan040Package10aCandidateEvidence["treatment_record_id"])
    ))).toBe(
      "f2338d2fc1f7ac750b854bc8990786308f2766e84a9231aa2d1ab51cdf17c634",
    );
    for (const candidate of evidence.candidates) {
      const extent = extentRows.find((row) =>
        row.treatment_record_id === candidate.treatment_record_id
      )!;
      const grain = grainRows.find((row) =>
        row.treatment_record_id === candidate.treatment_record_id
      )!;
      expect(extent).toEqual({
        ...candidate.prior_ledger_state.extent_row,
        verdict: "absent_in_source",
        verdict_basis:
          "receipt:plan-040-qbnr-service-pattern-package-10a-reviewed-absence-v1",
        receipt_ids: [
          "plan-040-qbnr-service-pattern-package-10a-reviewed-absence-v1",
        ],
        updated_at: ACCEPTED_AT,
      });
      expect(grain).toEqual({
        ...candidate.prior_ledger_state.grain_row,
        verdict: "absent_in_source",
        spatial_verdict: "absent_in_source",
        verdict_basis:
          "receipt:plan-040-qbnr-service-pattern-package-10a-reviewed-absence-v1",
        receipt_ids: [
          "plan-040-qbnr-service-pattern-package-10a-reviewed-absence-v1",
        ],
        updated_at: ACCEPTED_AT,
      });
    }
    expect(extentRows.filter((row) =>
      row.verdict === "absent_in_source"
    )).toHaveLength(163);
    expect(grainRows.filter((row) =>
      row.verdict === "absent_in_source"
    )).toHaveLength(163);
    expect(sha256(readFileSync(
      `${repoRoot}/data/quality/study-readiness/v1/bridge-ledger.jsonl`,
    ))).toBe(PLAN040_PACKAGE_10A_POST_P9_PINS.bridge);
    expect(sha256(readFileSync(
      `${repoRoot}/data/quality/study-readiness/v1/manifest.json`,
    ))).toBe(PLAN040_PACKAGE_10A_POST_P9_PINS.study_manifest);
  });
});
