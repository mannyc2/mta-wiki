import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import {
  PLAN040_PACKAGE_13_ACCEPTANCE_SHA256,
  PLAN040_PACKAGE_13_APPROVED_COMMIT,
  PLAN040_PACKAGE_13_DRAFT_SHA256,
  PLAN040_PACKAGE_13_EVIDENCE_SHA256,
  PLAN040_PACKAGE_13_GATE_SHA256,
  buildPlan040Package13GateAndAcceptance,
  validatePlan040Package13GateAndAcceptance,
} from
  "../../src/quality/plan040-qbnr-bus-stop-package13-closeout.js";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const evidencePath =
  `${riskRoot}/plan-040-qbnr-bus-stop-package-13-evidence-v1.json`;
const draftPath =
  `${riskRoot}/plan-040-qbnr-bus-stop-package-13-evidence-draft-v1.json`;
const gatePath =
  `${riskRoot}/plan-040-qbnr-bus-stop-package-13-dual-review-gate-v1.json`;
const acceptancePath =
  `${riskRoot}/plan-040-qbnr-bus-stop-package-13-owner-acceptance-v1.json`;
const ACCEPTED_AT = "2026-07-24T20:45:00Z";
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
type BuildInput = Parameters<
  typeof buildPlan040Package13GateAndAcceptance
>[0];

describe("Plan 040 Package 13 gate and owner acceptance", () => {
  it("replays the detailed APPROVE/APPROVE gate and compact acceptance", () => {
    const evidence = readJson<BuildInput["evidence"]>(evidencePath);
    const draft = readJson<BuildInput["draft"]>(draftPath);
    const gateBytes = readFileSync(gatePath);
    const acceptanceBytes = readFileSync(acceptancePath);
    const gate = JSON.parse(gateBytes.toString("utf8"));
    const acceptance = JSON.parse(acceptanceBytes.toString("utf8"));
    const rebuilt = buildPlan040Package13GateAndAcceptance({
      evidence,
      draft,
      acceptedAt: ACCEPTED_AT,
    });
    expect(sha256(readFileSync(evidencePath))).toBe(
      PLAN040_PACKAGE_13_EVIDENCE_SHA256,
    );
    expect(sha256(readFileSync(draftPath))).toBe(
      PLAN040_PACKAGE_13_DRAFT_SHA256,
    );
    expect(sha256(gateBytes)).toBe(PLAN040_PACKAGE_13_GATE_SHA256);
    expect(sha256(acceptanceBytes)).toBe(
      PLAN040_PACKAGE_13_ACCEPTANCE_SHA256,
    );
    expect(gateBytes.toString("utf8")).toBe(`${stableJson(rebuilt.gate)}\n`);
    expect(acceptanceBytes.toString("utf8"))
      .toBe(`${stableJson(rebuilt.acceptance)}\n`);
    expect(validatePlan040Package13GateAndAcceptance({
      evidence,
      draft,
      gate,
      acceptance,
      acceptedAt: ACCEPTED_AT,
    })).toEqual({
      candidate_count: 31,
      authorized_extent_decision_count: 21,
      authorized_grain_decision_count: 21,
      extent_blocked_upstream_count: 10,
      grain_blocked_upstream_count: 12,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_ontology: false,
      authorizes_corrections: false,
    });
  });

  it("pins reviewed scope, detailed candidate approvals, and narrow authority", () => {
    const gate = readJson<ReturnType<
      typeof buildPlan040Package13GateAndAcceptance
    >["gate"]>(gatePath);
    const acceptance = readJson<ReturnType<
      typeof buildPlan040Package13GateAndAcceptance
    >["acceptance"]>(acceptancePath);
    expect(gate.reviewed_commit).toBe(PLAN040_PACKAGE_13_APPROVED_COMMIT);
    expect(gate.candidate_count).toBe(31);
    expect(gate.route_count).toBe(30);
    expect(gate.verdict_distribution).toEqual({
      positive_extent_and_grain_proposed: 19,
      positive_extent_proposed_grain_blocked: 2,
      source_gap_blocked_extent_and_grain: 10,
      source_gap_block_receipt: 12,
      exact_absence: 0,
    });
    expect(gate.extent_distribution).toEqual({
      bounded_segment: 18,
      stop_set: 3,
      blocked_upstream: 10,
    });
    expect(gate.grain_distribution).toEqual({
      trip_subset: 19,
      unresolved_decision: 2,
      blocked_upstream: 12,
    });
    expect(gate.reviewer_results.map((row) => row.verdict))
      .toEqual(["APPROVE", "APPROVE"]);
    expect(gate.reviewer_result).toBe("APPROVE/APPROVE");
    expect(gate.candidate_review_results).toHaveLength(31);
    expect(gate.candidate_review_results.every((row) =>
      row.review_result === "APPROVE/APPROVE" &&
      row.reviewer_verdicts[0] === "APPROVE" &&
      row.reviewer_verdicts[1] === "APPROVE"
    )).toBeTrue();
    expect(gate.authorizes_decision_persistence).toBeFalse();
    expect(gate.authorizes_occurrence).toBeFalse();
    expect(gate.authorizes_study).toBeFalse();
    expect(gate.authorizes_cross_product).toBeFalse();
    expect(gate.authorizes_ontology).toBeFalse();
    expect(gate.authorizes_corrections).toBeFalse();

    expect(acceptance.authorized_exact_persistence).toMatchObject({
      decision_candidate_count: 21,
      extent_decision_count: 21,
      grain_decision_count: 21,
      source_gap_overlay_count: 12,
      extent_resolved_count: 21,
      extent_blocked_upstream_count: 10,
      grain_resolved_count: 19,
      grain_blocked_upstream_count: 12,
    });
    expect(acceptance.reviewer_result).toBe("APPROVE/APPROVE");
    expect(acceptance.authorizes_decision_persistence).toBeTrue();
    expect(acceptance.authorizes_occurrence).toBeFalse();
    expect(acceptance.authorizes_study).toBeFalse();
    expect(acceptance.authorizes_cross_product).toBeFalse();
    expect(acceptance.authorizes_ontology).toBeFalse();
    expect(acceptance.authorizes_corrections).toBeFalse();
  });

  it("fails closed on candidate, distribution, or authority drift", () => {
    const evidence = readJson<BuildInput["evidence"]>(evidencePath);
    const draft = readJson<BuildInput["draft"]>(draftPath);
    const authorityDrift = structuredClone(evidence);
    authorityDrift.candidates[0]!.authorizes_study = true as never;
    expect(() => buildPlan040Package13GateAndAcceptance({
      evidence: authorityDrift,
      draft,
      acceptedAt: ACCEPTED_AT,
    })).toThrow("evidence freeze gained authority");

    const distributionDrift = structuredClone(draft);
    distributionDrift.proposed_extent_decisions.pop();
    expect(() => buildPlan040Package13GateAndAcceptance({
      evidence,
      draft: distributionDrift,
      acceptedAt: ACCEPTED_AT,
    })).toThrow("frozen verdict or authorization scope drifted");
  });
});
