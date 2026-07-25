import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import {
  PLAN040_PACKAGE_10C_ABSENCE_RECEIPT_SHA256,
  PLAN040_PACKAGE_10C_APPROVED_COMMIT,
  PLAN040_PACKAGE_10C_EXTENT_DECISIONS_SHA256,
  PLAN040_PACKAGE_10C_COMPARISON_RECEIPT_SHA256,
  PLAN040_PACKAGE_10C_DRAFT_SHA256,
  PLAN040_PACKAGE_10C_EVIDENCE_SHA256,
  PLAN040_PACKAGE_10C_GRAIN_DECISIONS_SHA256,
  buildPlan040Package10cAcceptedArtifacts,
  buildPlan040Package10cGateAndAcceptance,
  validatePlan040Package10cGateAndAcceptance,
} from
  "../../src/quality/plan040-qbnr-service-pattern-package10c-closeout";
import { PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS } from
  "../../src/quality/plan040-accelerated-package15-closeout";
import type { Plan040Package10cDraft } from
  "../../src/quality/plan040-qbnr-service-pattern-package10c";

const root =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const draftPath =
  `${root}/plan-040-qbnr-service-pattern-package-10c-evidence-draft-v1.json`;
const gatePath =
  `${root}/plan-040-qbnr-service-pattern-package-10c-dual-review-gate-v1.json`;
const acceptancePath =
  `${root}/plan-040-qbnr-service-pattern-package-10c-owner-acceptance-v1.json`;
const ACCEPTED_AT = "2026-07-24T15:59:34Z";
const GATE_SHA256 =
  "b0218d9eaca9855a47a87c28657f06c33f7ecc2e099f1a93412936d25a52fc00";
const ACCEPTANCE_SHA256 =
  "410a22f6994f11ecd00ab62a94f496c60ab11dae4834e918df92953f8b019bc9";
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

describe("Plan 040 QBNR Package 10C gate and owner acceptance", () => {
  it("replays the compact APPROVE/APPROVE gate and standing acceptance", () => {
    const draft = JSON.parse(
      readFileSync(draftPath, "utf8"),
    ) as Plan040Package10cDraft;
    const gateBytes = readFileSync(gatePath);
    const acceptanceBytes = readFileSync(acceptancePath);
    const gate = JSON.parse(gateBytes.toString("utf8")) as unknown;
    const acceptance = JSON.parse(
      acceptanceBytes.toString("utf8"),
    ) as unknown;
    expect(sha256(gateBytes)).toBe(GATE_SHA256);
    expect(sha256(acceptanceBytes)).toBe(ACCEPTANCE_SHA256);

    const rebuilt = buildPlan040Package10cGateAndAcceptance({
      draft,
      acceptedAt: ACCEPTED_AT,
    });
    expect(gate).toEqual(rebuilt.gate);
    expect(acceptance).toEqual(rebuilt.acceptance);
    expect(validatePlan040Package10cGateAndAcceptance({
      draft,
      gate,
      acceptance,
      acceptedAt: ACCEPTED_AT,
    })).toEqual({
      candidate_count: 5,
      positive_candidate_count: 4,
      unresolved_candidate_count: 1,
      authorized_extent_decision_count: 4,
      authorized_grain_decision_count: 4,
      authorized_absence_candidate_count: 1,
      persisted_decision_count: 0,
      persisted_absence_receipt_count: 0,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
  });

  it("pins reviewed inputs, scope, reviewers, and no broader authority", () => {
    const gate = JSON.parse(readFileSync(gatePath, "utf8")) as {
      reviewed_commit: string;
      artifacts: Record<string, { sha256: string }>;
      candidate_count: number;
      route_count: number;
      verdict_distribution: Record<string, number>;
      reviewer_results: Array<{ verdict: string }>;
      checkpoint_tests: {
        full_repository: {
          newly_closed_candidates_since_package_10a_checkpoint: number;
          shared_validation_or_materialization_semantics_changed: boolean;
          status: string;
        };
      };
      verdict: string;
      authorizes_decision_persistence: boolean;
      authorizes_reviewed_absence_receipt_persistence: boolean;
      authorizes_occurrence: boolean;
      authorizes_study: boolean;
      authorizes_cross_product: boolean;
    };
    const acceptance = JSON.parse(
      readFileSync(acceptancePath, "utf8"),
    ) as {
      acceptance_basis: string;
      authorized_positive_persistence: {
        candidate_count: number;
        extent_decision_ids: string[];
        grain_decision_ids: string[];
      };
      authorized_reviewed_absence_receipt: {
        candidate_count: number;
        surfaces: string[];
        required_gap_code: string;
      };
      preservation_invariants: Record<string, boolean>;
      authorizes_decision_persistence: boolean;
      authorizes_reviewed_absence_receipt_persistence: boolean;
      authorizes_occurrence: boolean;
      authorizes_study: boolean;
      authorizes_cross_product: boolean;
    };
    expect(gate.reviewed_commit).toBe(PLAN040_PACKAGE_10C_APPROVED_COMMIT);
    expect(gate.artifacts.evidence?.sha256).toBe(
      PLAN040_PACKAGE_10C_EVIDENCE_SHA256,
    );
    expect(gate.artifacts.draft?.sha256).toBe(
      PLAN040_PACKAGE_10C_DRAFT_SHA256,
    );
    expect(gate.artifacts.comparison_receipt?.sha256).toBe(
      PLAN040_PACKAGE_10C_COMPARISON_RECEIPT_SHA256,
    );
    expect(gate.candidate_count).toBe(5);
    expect(gate.route_count).toBe(3);
    expect(gate.verdict_distribution).toEqual({
      positive_extent_and_grain_proposed: 4,
      receipt_terminal_unresolved_preserved: 1,
    });
    expect(gate.reviewer_results.map((row) => row.verdict)).toEqual([
      "APPROVE",
      "APPROVE",
    ]);
    expect(gate.checkpoint_tests.full_repository).toEqual({
      status: "checkpoint_not_required",
      newly_closed_candidates_since_package_10a_checkpoint: 9,
      shared_validation_or_materialization_semantics_changed: false,
      reason:
        "Nine closures since the Package 10A checkpoint; below the accelerated 25-candidate checkpoint and no shared semantics changed.",
    });
    expect(gate.verdict).toBe("APPROVE");
    expect(gate.authorizes_decision_persistence).toBeFalse();
    expect(gate.authorizes_reviewed_absence_receipt_persistence).toBeFalse();
    expect(gate.authorizes_occurrence).toBeFalse();
    expect(gate.authorizes_study).toBeFalse();
    expect(gate.authorizes_cross_product).toBeFalse();

    expect(acceptance.acceptance_basis).toBe(
      "standing_owner_accelerated_checkpoint_protocol",
    );
    expect(acceptance.authorized_positive_persistence).toMatchObject({
      candidate_count: 4,
    });
    expect(
      acceptance.authorized_positive_persistence.extent_decision_ids,
    ).toHaveLength(4);
    expect(
      acceptance.authorized_positive_persistence.grain_decision_ids,
    ).toHaveLength(4);
    expect(acceptance.authorized_reviewed_absence_receipt).toMatchObject({
      candidate_count: 1,
      surfaces: ["member_extent", "member_grain"],
      required_gap_code: "canonical_treatment_route_scope_conflict",
    });
    expect(acceptance.preservation_invariants).toEqual({
      accepted_q20_occurrence_unchanged: true,
      q20_treatment_ontology_unchanged: true,
      changed_identifier_equivalence_authorized: false,
      occurrence_inference_prohibited: true,
    });
    expect(acceptance.authorizes_decision_persistence).toBeTrue();
    expect(
      acceptance.authorizes_reviewed_absence_receipt_persistence,
    ).toBeTrue();
    expect(acceptance.authorizes_occurrence).toBeFalse();
    expect(acceptance.authorizes_study).toBeFalse();
    expect(acceptance.authorizes_cross_product).toBeFalse();
  });

  it("persists exactly four linked decisions and one Q20 scope-conflict absence", () => {
    const draft = JSON.parse(
      readFileSync(draftPath, "utf8"),
    ) as Plan040Package10cDraft;
    const gate = JSON.parse(readFileSync(gatePath, "utf8")) as ReturnType<
      typeof buildPlan040Package10cGateAndAcceptance
    >["gate"];
    const acceptance = JSON.parse(
      readFileSync(acceptancePath, "utf8"),
    ) as ReturnType<
      typeof buildPlan040Package10cGateAndAcceptance
    >["acceptance"];
    const accepted = buildPlan040Package10cAcceptedArtifacts({
      draft,
      gate,
      acceptance,
    });
    const extentPath =
      `${repoRoot}/data/quality/operational-reference/` +
      "member-extent-ledger-decisions/" +
      "plan-040-qbnr-service-pattern-package-10c-v1.json";
    const grainPath =
      `${repoRoot}/data/quality/operational-reference/` +
      "member-grain-decisions/" +
      "plan-040-qbnr-service-pattern-package-10c-v1.json";
    const absencePath =
      `${repoRoot}/data/quality/acquisition/receipts/member-extent/` +
      "plan-040-qbnr-service-pattern-package-10c-reviewed-absence-v1.json";
    expect(sha256(readFileSync(extentPath))).toBe(
      PLAN040_PACKAGE_10C_EXTENT_DECISIONS_SHA256,
    );
    expect(sha256(readFileSync(grainPath))).toBe(
      PLAN040_PACKAGE_10C_GRAIN_DECISIONS_SHA256,
    );
    expect(sha256(readFileSync(absencePath))).toBe(
      PLAN040_PACKAGE_10C_ABSENCE_RECEIPT_SHA256,
    );
    expect(JSON.parse(readFileSync(extentPath, "utf8"))).toEqual({
      decisions: accepted.extentDecisions,
    });
    expect(JSON.parse(readFileSync(grainPath, "utf8"))).toEqual({
      decisions: accepted.grainDecisions,
    });
    expect(JSON.parse(readFileSync(absencePath, "utf8"))).toEqual({
      receipts: [accepted.absenceReceipt],
    });
    expect(accepted.extentDecisions).toHaveLength(4);
    expect(accepted.extentDecisions.map((row) => row.resolution).sort())
      .toEqual([
        "bounded_segment",
        "route_wide",
        "route_wide",
        "route_wide",
      ]);
    expect(accepted.grainDecisions).toHaveLength(4);
    expect(accepted.grainDecisions.every((row) =>
      row.service_scope.kind === "trip_subset" &&
      row.service_scope.periods.length === 1 &&
      row.service_scope.periods[0] === "weekend" &&
      row.member_extent_decision_id !== null
    )).toBeTrue();
    expect(accepted.absenceReceipt).toMatchObject({
      receipt_id:
        "plan-040-qbnr-service-pattern-package-10c-reviewed-absence-v1",
      surfaces: ["member_extent", "member_grain"],
      extent_keys: [{
        occurrence_id: "occurrence:b18b9a4512c3b2860dd8aa29",
        route_record_id: "route_q20-qbnr-2025",
        treatment_record_id:
          "treatment_q20-q20b-replacement-2025",
      }],
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(accepted.absenceReceipt.exact_searches[0]).toContain(
      "canonical_treatment_route_scope_conflict",
    );

    const currentProjectionFiles = {
      extent_ledger:
        `${repoRoot}/data/quality/operational-reference/member-extent-ledger.jsonl`,
      grain_ledger:
        `${repoRoot}/data/quality/operational-reference/member-grain-ledger.jsonl`,
      bridge_ledger:
        `${repoRoot}/data/quality/study-readiness/v1/bridge-ledger.jsonl`,
      study_manifest:
        `${repoRoot}/data/quality/study-readiness/v1/manifest.json`,
      member_extent_contract:
        `${repoRoot}/data/contracts/operational-occurrence-member-extent/v1/` +
        "operational_occurrence_member_extents.jsonl",
      member_extent_manifest:
        `${repoRoot}/data/contracts/operational-occurrence-member-extent/v1/manifest.json`,
      member_extent_review_ledger:
        `${repoRoot}/data/contracts/operational-occurrence-member-extent/v1/review-ledger.jsonl`,
      member_extent_summary:
        `${repoRoot}/data/contracts/operational-occurrence-member-extent/v1/summary.json`,
      operational_occurrences:
        `${repoRoot}/data/exports/releases/v1-rc26/operational_occurrences.jsonl`,
      operational_occurrence_decisions:
        `${repoRoot}/data/exports/releases/v1-rc26/operational_occurrence_review_decisions.json`,
      treatment_components:
        `${repoRoot}/data/canonical/treatment_components.jsonl`,
      reviewed_candidate_packets:
        `${repoRoot}/data/quality/study-readiness/v1/research/reviewed-candidate-packets.jsonl`,
    };
    for (const [name, path] of Object.entries(currentProjectionFiles)) {
      expect(sha256(readFileSync(path))).toBe(
        PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS[
          name as keyof typeof PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS
        ],
      );
    }

    const extentRows = readFileSync(
      currentProjectionFiles.extent_ledger,
      "utf8",
    ).trim().split("\n").map((line) => JSON.parse(line)) as Array<{
      treatment_record_id: string;
      verdict: string;
      authorizes_study: false;
      authorizes_cross_product: false;
    }>;
    const grainRows = readFileSync(
      currentProjectionFiles.grain_ledger,
      "utf8",
    ).trim().split("\n").map((line) => JSON.parse(line)) as Array<{
      treatment_record_id: string;
      verdict: string;
      authorizes_study: false;
      authorizes_cross_product: false;
    }>;
    const positiveIds = new Set(accepted.extentDecisions.map((row) =>
      row.treatment_record_id));
    expect(extentRows.filter((row) =>
      positiveIds.has(row.treatment_record_id) &&
      row.verdict.startsWith("resolved:") &&
      !row.authorizes_study &&
      !row.authorizes_cross_product
    )).toHaveLength(4);
    expect(grainRows.filter((row) =>
      positiveIds.has(row.treatment_record_id) &&
      row.verdict === "resolved" &&
      !row.authorizes_study &&
      !row.authorizes_cross_product
    )).toHaveLength(4);
    expect(extentRows.find((row) =>
      row.treatment_record_id ===
        "treatment_q20-q20b-replacement-2025")).toMatchObject({
      verdict: "absent_in_source",
      authorizes_study: false,
      authorizes_cross_product: false,
    });
    expect(grainRows.find((row) =>
      row.treatment_record_id ===
        "treatment_q20-q20b-replacement-2025")).toMatchObject({
      verdict: "absent_in_source",
      authorizes_study: false,
      authorizes_cross_product: false,
    });
  });
});
