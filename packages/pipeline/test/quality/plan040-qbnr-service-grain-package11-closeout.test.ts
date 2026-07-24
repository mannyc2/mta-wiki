import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import {
  PLAN040_PACKAGE_11_APPROVED_COMMIT,
  PLAN040_PACKAGE_11_DRAFT_SHA256,
  PLAN040_PACKAGE_11_EVIDENCE_SHA256,
  PLAN040_PACKAGE_11_RECEIPT_SHA256,
  buildPlan040Package11GateAndAcceptance,
  validatePlan040Package11GateAndAcceptance,
} from
  "../../src/quality/plan040-qbnr-service-grain-package11-closeout";
import type { Plan040Package11Draft } from
  "../../src/quality/plan040-qbnr-service-grain-package11";

const root =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const draftPath =
  `${root}/plan-040-qbnr-service-grain-package-11-evidence-draft-v1.json`;
const gatePath =
  `${root}/plan-040-qbnr-service-grain-package-11-dual-review-gate-v1.json`;
const acceptancePath =
  `${root}/plan-040-qbnr-service-grain-package-11-owner-acceptance-v1.json`;
const ACCEPTED_AT = "2026-07-24T18:45:00Z";
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

describe("Plan 040 Package 11 gate and owner acceptance", () => {
  it("replays the compact APPROVE/APPROVE gate and exact acceptance", () => {
    const draft = JSON.parse(
      readFileSync(draftPath, "utf8"),
    ) as Plan040Package11Draft;
    const gateBytes = readFileSync(gatePath);
    const acceptanceBytes = readFileSync(acceptancePath);
    const gate = JSON.parse(gateBytes.toString("utf8"));
    const acceptance = JSON.parse(acceptanceBytes.toString("utf8"));
    const rebuilt = buildPlan040Package11GateAndAcceptance({
      draft,
      acceptedAt: ACCEPTED_AT,
    });
    expect(sha256(gateBytes)).toBe(rebuilt.gateSha256);
    expect(sha256(acceptanceBytes)).toBe(sha256(
      `${stableJson(rebuilt.acceptance)}\n`,
    ));
    expect(gate).toEqual(rebuilt.gate);
    expect(acceptance).toEqual(rebuilt.acceptance);
    expect(validatePlan040Package11GateAndAcceptance({
      draft,
      gate,
      acceptance,
      acceptedAt: ACCEPTED_AT,
    })).toEqual({
      candidate_count: 12,
      authorized_extent_decision_count: 1,
      authorized_grain_decision_count: 12,
      terminal_blocked_upstream_grain_count: 7,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_ontology: false,
      authorizes_corrections: false,
    });
  });

  it("pins reviewed scope, approvals, and narrow authority", () => {
    const gate = JSON.parse(readFileSync(gatePath, "utf8")) as {
      reviewed_commit: string;
      artifacts: Record<string, { sha256: string }>;
      candidate_count: number;
      candidate_key_sha256: string;
      verdict_distribution: Record<string, number>;
      reviewer_results: Array<{ verdict: string }>;
      verdict: string;
      authorizes_decision_persistence: boolean;
      authorizes_occurrence: boolean;
      authorizes_study: boolean;
      authorizes_cross_product: boolean;
      authorizes_ontology: boolean;
      authorizes_corrections: boolean;
    };
    const acceptance = JSON.parse(
      readFileSync(acceptancePath, "utf8"),
    ) as {
      acceptance_basis: string;
      authorized_exact_persistence: {
        candidate_count: number;
        extent_decision_count: number;
        grain_decision_count: number;
        terminal_resolved_grain_count: number;
        terminal_blocked_upstream_grain_count: number;
      };
      preservation_invariants: Record<string, boolean>;
      authorizes_decision_persistence: boolean;
      authorizes_occurrence: boolean;
      authorizes_study: boolean;
      authorizes_cross_product: boolean;
      authorizes_ontology: boolean;
      authorizes_corrections: boolean;
    };
    expect(gate.reviewed_commit).toBe(PLAN040_PACKAGE_11_APPROVED_COMMIT);
    expect(gate.artifacts).toMatchObject({
      evidence: { sha256: PLAN040_PACKAGE_11_EVIDENCE_SHA256 },
      draft: { sha256: PLAN040_PACKAGE_11_DRAFT_SHA256 },
      positive_pattern_receipt: {
        sha256: PLAN040_PACKAGE_11_RECEIPT_SHA256,
      },
    });
    expect(gate.candidate_count).toBe(12);
    expect(gate.verdict_distribution).toEqual({
      positive_extent_and_grain_proposed: 1,
      positive_grain_only_proposed: 4,
      structured_unresolved_grain_proposed: 7,
    });
    expect(gate.reviewer_results.map((row) => row.verdict)).toEqual([
      "APPROVE",
      "APPROVE",
    ]);
    expect(gate.verdict).toBe("APPROVE");
    expect(gate.authorizes_decision_persistence).toBeFalse();
    expect(gate.authorizes_occurrence).toBeFalse();
    expect(gate.authorizes_study).toBeFalse();
    expect(gate.authorizes_cross_product).toBeFalse();
    expect(gate.authorizes_ontology).toBeFalse();
    expect(gate.authorizes_corrections).toBeFalse();

    expect(acceptance.acceptance_basis).toBe(
      "explicit_owner_accelerated_package_wide_acceptance",
    );
    expect(acceptance.authorized_exact_persistence).toMatchObject({
      candidate_count: 12,
      extent_decision_count: 1,
      grain_decision_count: 12,
      terminal_resolved_grain_count: 5,
      terminal_blocked_upstream_grain_count: 7,
    });
    expect(acceptance.preservation_invariants).toMatchObject({
      existing_grain_only_extent_decisions_byte_identical: true,
      occurrence_decisions_unchanged: true,
      treatment_ontology_unchanged: true,
      correction_state_unchanged: true,
      package_12_frozen_bytes_unchanged: true,
      absence_projection_prohibited_for_unresolved_grain: true,
    });
    expect(acceptance.authorizes_decision_persistence).toBeTrue();
    expect(acceptance.authorizes_occurrence).toBeFalse();
    expect(acceptance.authorizes_study).toBeFalse();
    expect(acceptance.authorizes_cross_product).toBeFalse();
    expect(acceptance.authorizes_ontology).toBeFalse();
    expect(acceptance.authorizes_corrections).toBeFalse();
  });

  it("fails closed on candidate or unresolved-state drift", () => {
    const draft = JSON.parse(
      readFileSync(draftPath, "utf8"),
    ) as Plan040Package11Draft;
    const authorityDrift = structuredClone(draft);
    authorityDrift.candidates[0]!.authorizes_study = true as never;
    expect(() => buildPlan040Package11GateAndAcceptance({
      draft: authorityDrift,
      acceptedAt: ACCEPTED_AT,
    })).toThrow("frozen verdict or authorization scope drifted");

    const unresolvedDrift = structuredClone(draft);
    const unresolved = unresolvedDrift.candidates.find((candidate) =>
      candidate.evidence_verdict ===
        "structured_unresolved_grain_proposed")!;
    unresolved.proposed_grain_decision.service_scope = {
      kind: "all_service",
    };
    expect(() => buildPlan040Package11GateAndAcceptance({
      draft: unresolvedDrift,
      acceptedAt: ACCEPTED_AT,
    })).toThrow("frozen verdict or authorization scope drifted");
  });
});
