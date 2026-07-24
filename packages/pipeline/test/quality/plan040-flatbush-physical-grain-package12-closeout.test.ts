import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import {
  PLAN040_PACKAGE_12_APPROVED_COMMIT,
  PLAN040_PACKAGE_12_DRAFT_SHA256,
  PLAN040_PACKAGE_12_EVIDENCE_SHA256,
  buildPlan040Package12GateAndAcceptance,
  validatePlan040Package12GateAndAcceptance,
} from
  "../../src/quality/plan040-flatbush-physical-grain-package12-closeout";
import type { Plan040Package12Draft } from
  "../../src/quality/plan040-flatbush-physical-grain-package12";

const root =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const draftPath =
  `${root}/plan-040-flatbush-physical-grain-package-12-evidence-draft-v1.json`;
const gatePath =
  `${root}/plan-040-flatbush-physical-grain-package-12-dual-review-gate-v1.json`;
const acceptancePath =
  `${root}/plan-040-flatbush-physical-grain-package-12-owner-acceptance-v1.json`;
const ACCEPTED_AT = "2026-07-24T19:00:00Z";
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

describe("Plan 040 Package 12 gate and owner acceptance", () => {
  it("replays the compact APPROVE/APPROVE gate and exact acceptance", () => {
    const draft = JSON.parse(
      readFileSync(draftPath, "utf8"),
    ) as Plan040Package12Draft;
    const gateBytes = readFileSync(gatePath);
    const acceptanceBytes = readFileSync(acceptancePath);
    const gate = JSON.parse(gateBytes.toString("utf8"));
    const acceptance = JSON.parse(acceptanceBytes.toString("utf8"));
    const rebuilt = buildPlan040Package12GateAndAcceptance({
      draft,
      acceptedAt: ACCEPTED_AT,
    });
    expect(sha256(gateBytes)).toBe(rebuilt.gateSha256);
    expect(sha256(acceptanceBytes)).toBe(sha256(
      `${stableJson(rebuilt.acceptance)}\n`,
    ));
    expect(gate).toEqual(rebuilt.gate);
    expect(acceptance).toEqual(rebuilt.acceptance);
    expect(validatePlan040Package12GateAndAcceptance({
      draft,
      gate,
      acceptance,
      acceptedAt: ACCEPTED_AT,
    })).toEqual({
      candidate_count: 2,
      authorized_extent_decision_count: 0,
      authorized_grain_decision_count: 2,
      not_applicable_grain_count: 2,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_ontology: false,
      authorizes_corrections: false,
    });
  });

  it("pins reviewed scope, source gap, and narrow authority", () => {
    const gate = JSON.parse(readFileSync(gatePath, "utf8")) as {
      reviewed_commit: string;
      artifacts: Record<string, { sha256: string }>;
      candidate_count: number;
      verdict_distribution: Record<string, number>;
      grain_distribution: Record<string, number>;
      reviewer_results: Array<{ verdict: string }>;
      source_gap_state: Record<string, boolean>;
      authorizes_decision_persistence: boolean;
    };
    const acceptance = JSON.parse(
      readFileSync(acceptancePath, "utf8"),
    ) as {
      authorized_exact_persistence: {
        candidate_count: number;
        extent_decision_count: number;
        grain_decision_count: number;
        not_applicable_grain_count: number;
      };
      preservation_invariants: Record<string, boolean>;
      authorizes_decision_persistence: boolean;
      authorizes_occurrence: boolean;
      authorizes_study: boolean;
      authorizes_cross_product: boolean;
      authorizes_ontology: boolean;
      authorizes_corrections: boolean;
    };
    expect(gate.reviewed_commit).toBe(PLAN040_PACKAGE_12_APPROVED_COMMIT);
    expect(gate.artifacts).toEqual({
      evidence: {
        path:
          "data/quality/operational-reference/member-extent-risk/" +
          "plan-040-flatbush-physical-grain-package-12-evidence-v1.json",
        sha256: PLAN040_PACKAGE_12_EVIDENCE_SHA256,
      },
      draft: {
        path:
          "data/quality/operational-reference/member-extent-risk/" +
          "plan-040-flatbush-physical-grain-package-12-evidence-draft-v1.json",
        sha256: PLAN040_PACKAGE_12_DRAFT_SHA256,
      },
    });
    expect(gate.candidate_count).toBe(2);
    expect(gate.verdict_distribution).toEqual({
      positive_grain_not_applicable_proposed: 2,
    });
    expect(gate.grain_distribution).toEqual({ not_applicable: 2 });
    expect(gate.reviewer_results.map((row) => row.verdict)).toEqual([
      "APPROVE",
      "APPROVE",
    ]);
    expect(gate.source_gap_state).toEqual({
      raw_source_packet_present: false,
      accepted_submission_journal_frozen: true,
      canonical_evidence_ref_frozen: true,
      authorizes_external_fact_inference: false,
    });
    expect(gate.authorizes_decision_persistence).toBeFalse();

    expect(acceptance.authorized_exact_persistence).toMatchObject({
      candidate_count: 2,
      extent_decision_count: 0,
      grain_decision_count: 2,
      not_applicable_grain_count: 2,
    });
    expect(acceptance.preservation_invariants).toEqual({
      existing_extent_decisions_byte_identical: true,
      occurrence_decisions_unchanged: true,
      study_outputs_unchanged: true,
      cross_product_authorization_unchanged: true,
      treatment_ontology_unchanged: true,
      missing_raw_source_preserved: true,
      source_gap_nonauthorizing: true,
      external_acquisition_prohibited: true,
    });
    expect(acceptance.authorizes_decision_persistence).toBeTrue();
    expect(acceptance.authorizes_occurrence).toBeFalse();
    expect(acceptance.authorizes_study).toBeFalse();
    expect(acceptance.authorizes_cross_product).toBeFalse();
    expect(acceptance.authorizes_ontology).toBeFalse();
    expect(acceptance.authorizes_corrections).toBeFalse();
  });

  it("fails closed on service grain or source-gap drift", () => {
    const draft = JSON.parse(
      readFileSync(draftPath, "utf8"),
    ) as Plan040Package12Draft;
    const grainDrift = structuredClone(draft);
    grainDrift.candidates[0]!.proposed_grain_decision.service_scope = {
      kind: "all_service",
    };
    expect(() => buildPlan040Package12GateAndAcceptance({
      draft: grainDrift,
      acceptedAt: ACCEPTED_AT,
    })).toThrow("frozen verdict or authorization scope drifted");

    const sourceDrift = structuredClone(draft);
    sourceDrift.source_packet_state.raw_source_packet_present = true as never;
    expect(() => buildPlan040Package12GateAndAcceptance({
      draft: sourceDrift,
      acceptedAt: ACCEPTED_AT,
    })).toThrow("frozen verdict or authorization scope drifted");
  });
});
