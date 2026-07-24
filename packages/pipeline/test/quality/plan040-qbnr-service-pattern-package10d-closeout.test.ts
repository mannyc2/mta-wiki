import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import {
  PLAN040_PACKAGE_10D_APPROVED_COMMIT,
  PLAN040_PACKAGE_10D_COMPARISON_RECEIPT_SHA256,
  PLAN040_PACKAGE_10D_DRAFT_SHA256,
  PLAN040_PACKAGE_10D_EVIDENCE_SHA256,
  PLAN040_PACKAGE_10D_EXTENT_DECISIONS_SHA256,
  PLAN040_PACKAGE_10D_GRAIN_DECISIONS_SHA256,
  buildPlan040Package10dAcceptedArtifacts,
  buildPlan040Package10dGateAndAcceptance,
  validatePlan040Package10dGateAndAcceptance,
} from
  "../../src/quality/plan040-qbnr-service-pattern-package10d-closeout";
import { PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS } from
  "../../src/quality/plan040-accelerated-package14-closeout";
import type { Plan040Package10dDraft } from
  "../../src/quality/plan040-qbnr-service-pattern-package10d";

const root =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const draftPath =
  `${root}/plan-040-qbnr-service-pattern-package-10d-evidence-draft-v1.json`;
const gatePath =
  `${root}/plan-040-qbnr-service-pattern-package-10d-dual-review-gate-v1.json`;
const acceptancePath =
  `${root}/plan-040-qbnr-service-pattern-package-10d-owner-acceptance-v1.json`;
const ACCEPTED_AT = "2026-07-24T17:21:12Z";
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

describe("Plan 040 QBNR Package 10D gate and owner acceptance", () => {
  it("replays the compact APPROVE/APPROVE gate and standing acceptance", () => {
    const draft = JSON.parse(
      readFileSync(draftPath, "utf8"),
    ) as Plan040Package10dDraft;
    const gateBytes = readFileSync(gatePath);
    const acceptanceBytes = readFileSync(acceptancePath);
    const gate = JSON.parse(gateBytes.toString("utf8")) as unknown;
    const acceptance = JSON.parse(
      acceptanceBytes.toString("utf8"),
    ) as unknown;
    const rebuilt = buildPlan040Package10dGateAndAcceptance({
      draft,
      acceptedAt: ACCEPTED_AT,
    });
    expect(sha256(gateBytes)).toBe(rebuilt.gateSha256);
    expect(sha256(acceptanceBytes)).toBe(sha256(
      `${stableJson(rebuilt.acceptance)}\n`,
    ));
    expect(gate).toEqual(rebuilt.gate);
    expect(acceptance).toEqual(rebuilt.acceptance);
    expect(validatePlan040Package10dGateAndAcceptance({
      draft,
      gate,
      acceptance,
      acceptedAt: ACCEPTED_AT,
    })).toEqual({
      candidate_count: 2,
      positive_candidate_count: 2,
      authorized_extent_decision_count: 2,
      authorized_grain_decision_count: 2,
      persisted_decision_count: 0,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    });
  });

  it("pins reviewed scope, dual approval, checkpoint, and no broader authority", () => {
    const gate = JSON.parse(readFileSync(gatePath, "utf8")) as {
      reviewed_commit: string;
      artifacts: Record<string, { sha256: string }>;
      candidate_count: number;
      route_count: number;
      verdict_distribution: Record<string, number>;
      extent_distribution: Record<string, number>;
      grain_distribution: Record<string, number>;
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
        candidate_keys: string[];
        extent_decision_ids: string[];
        grain_decision_ids: string[];
      };
      preservation_invariants: Record<string, boolean>;
      authorizes_decision_persistence: boolean;
      authorizes_occurrence: boolean;
      authorizes_study: boolean;
      authorizes_cross_product: boolean;
    };
    expect(gate.reviewed_commit).toBe(PLAN040_PACKAGE_10D_APPROVED_COMMIT);
    expect(gate.artifacts).toMatchObject({
      evidence: { sha256: PLAN040_PACKAGE_10D_EVIDENCE_SHA256 },
      draft: { sha256: PLAN040_PACKAGE_10D_DRAFT_SHA256 },
      comparison_receipt: {
        sha256: PLAN040_PACKAGE_10D_COMPARISON_RECEIPT_SHA256,
      },
    });
    expect(gate.candidate_count).toBe(2);
    expect(gate.route_count).toBe(2);
    expect(gate.verdict_distribution).toEqual({
      positive_extent_and_grain_proposed: 2,
    });
    expect(gate.extent_distribution).toEqual({ route_wide: 2 });
    expect(gate.grain_distribution).toEqual({ trip_subset: 2 });
    expect(gate.reviewer_results.map((row) => row.verdict)).toEqual([
      "APPROVE",
      "APPROVE",
    ]);
    expect(gate.checkpoint_tests.full_repository).toMatchObject({
      status: "checkpoint_not_required",
      newly_closed_candidates_since_package_10a_checkpoint: 11,
      shared_validation_or_materialization_semantics_changed: false,
    });
    expect(gate.verdict).toBe("APPROVE");
    expect(gate.authorizes_decision_persistence).toBeFalse();
    expect(gate.authorizes_occurrence).toBeFalse();
    expect(gate.authorizes_study).toBeFalse();
    expect(gate.authorizes_cross_product).toBeFalse();

    expect(acceptance.acceptance_basis).toBe(
      "standing_owner_accelerated_checkpoint_protocol",
    );
    expect(acceptance.authorized_positive_persistence.candidate_count)
      .toBe(2);
    expect(acceptance.authorized_positive_persistence.candidate_keys)
      .toHaveLength(2);
    expect(acceptance.authorized_positive_persistence.extent_decision_ids)
      .toHaveLength(2);
    expect(acceptance.authorized_positive_persistence.grain_decision_ids)
      .toHaveLength(2);
    expect(acceptance.preservation_invariants).toEqual({
      accepted_occurrence_decisions_unchanged: true,
      treatment_ontology_unchanged: true,
      limited_stop_siblings_preserved: true,
      historical_q48_lineage_excluded: true,
      changed_identifier_equivalence_authorized: false,
      occurrence_inference_prohibited: true,
      correction_feed_comparison_run: false,
    });
    expect(acceptance.authorizes_decision_persistence).toBeTrue();
    expect(acceptance.authorizes_occurrence).toBeFalse();
    expect(acceptance.authorizes_study).toBeFalse();
    expect(acceptance.authorizes_cross_product).toBeFalse();
  });

  it("fails closed on unauthorized candidate or correction drift", () => {
    const draft = JSON.parse(
      readFileSync(draftPath, "utf8"),
    ) as Plan040Package10dDraft;
    const candidateDrift = structuredClone(draft);
    candidateDrift.candidates[0]!.authorizes_occurrence =
      true as never;
    expect(() => buildPlan040Package10dGateAndAcceptance({
      draft: candidateDrift,
      acceptedAt: ACCEPTED_AT,
    })).toThrow("frozen verdict or authorization scope drifted");

    const correctionDrift = structuredClone(draft);
    correctionDrift.version_separation.corrected_first_week_diff
      .comparison_run = true;
    expect(() => buildPlan040Package10dGateAndAcceptance({
      draft: correctionDrift,
      acceptedAt: ACCEPTED_AT,
    })).toThrow("frozen verdict or authorization scope drifted");
  });

  it("persists exactly two linked route-wide weekday decisions", () => {
    const draft = JSON.parse(
      readFileSync(draftPath, "utf8"),
    ) as Plan040Package10dDraft;
    const gate = JSON.parse(readFileSync(gatePath, "utf8")) as ReturnType<
      typeof buildPlan040Package10dGateAndAcceptance
    >["gate"];
    const acceptance = JSON.parse(
      readFileSync(acceptancePath, "utf8"),
    ) as ReturnType<
      typeof buildPlan040Package10dGateAndAcceptance
    >["acceptance"];
    const accepted = buildPlan040Package10dAcceptedArtifacts({
      draft,
      gate,
      acceptance,
    });
    const extentPath =
      `${repoRoot}/data/quality/operational-reference/` +
      "member-extent-ledger-decisions/" +
      "plan-040-qbnr-service-pattern-package-10d-v1.json";
    const grainPath =
      `${repoRoot}/data/quality/operational-reference/` +
      "member-grain-decisions/" +
      "plan-040-qbnr-service-pattern-package-10d-v1.json";
    expect(sha256(readFileSync(extentPath))).toBe(
      PLAN040_PACKAGE_10D_EXTENT_DECISIONS_SHA256,
    );
    expect(sha256(readFileSync(grainPath))).toBe(
      PLAN040_PACKAGE_10D_GRAIN_DECISIONS_SHA256,
    );
    expect(JSON.parse(readFileSync(extentPath, "utf8"))).toEqual({
      decisions: accepted.extentDecisions,
    });
    expect(JSON.parse(readFileSync(grainPath, "utf8"))).toEqual({
      decisions: accepted.grainDecisions,
    });
    expect(accepted.extentDecisions).toHaveLength(2);
    expect(accepted.extentDecisions.every((row) =>
      row.resolution === "route_wide"
    )).toBeTrue();
    expect(accepted.grainDecisions).toHaveLength(2);
    expect(accepted.grainDecisions.every((row) =>
      row.service_scope.kind === "trip_subset" &&
      row.service_scope.periods.length === 1 &&
      row.service_scope.periods[0] === "weekday" &&
      row.member_extent_decision_id !== null
    )).toBeTrue();

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
        PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS[
          name as keyof typeof PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS
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
      service_scope: { kind: string; periods: string[] } | null;
      authorizes_study: false;
      authorizes_cross_product: false;
    }>;
    const positiveIds = new Set(accepted.extentDecisions.map((row) =>
      row.treatment_record_id));
    expect(extentRows.filter((row) =>
      positiveIds.has(row.treatment_record_id) &&
      row.verdict === "resolved:route_wide" &&
      !row.authorizes_study &&
      !row.authorizes_cross_product
    )).toHaveLength(2);
    expect(grainRows.filter((row) =>
      positiveIds.has(row.treatment_record_id) &&
      row.verdict === "resolved" &&
      row.service_scope?.kind === "trip_subset" &&
      row.service_scope.periods.length === 1 &&
      row.service_scope.periods[0] === "weekday" &&
      !row.authorizes_study &&
      !row.authorizes_cross_product
    )).toHaveLength(2);
  });

  it("fails closed on owner acceptance outside the exact persistence scope", () => {
    const draft = JSON.parse(
      readFileSync(draftPath, "utf8"),
    ) as Plan040Package10dDraft;
    const gate = JSON.parse(readFileSync(gatePath, "utf8")) as ReturnType<
      typeof buildPlan040Package10dGateAndAcceptance
    >["gate"];
    const acceptance = JSON.parse(
      readFileSync(acceptancePath, "utf8"),
    ) as ReturnType<
      typeof buildPlan040Package10dGateAndAcceptance
    >["acceptance"];
    const drift = structuredClone(acceptance);
    drift.authorizes_occurrence = true as never;
    expect(() => buildPlan040Package10dAcceptedArtifacts({
      draft,
      gate,
      acceptance: drift,
    })).toThrow("gate or standing owner acceptance drifted");
  });
});
