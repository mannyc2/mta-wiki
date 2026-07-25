import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import {
  PLAN040_PACKAGE_11_APPROVED_COMMIT,
  PLAN040_PACKAGE_11_DRAFT_SHA256,
  PLAN040_PACKAGE_11_EVIDENCE_SHA256,
  PLAN040_PACKAGE_11_EXTENT_DECISIONS_SHA256,
  PLAN040_PACKAGE_11_GATE_SHA256,
  PLAN040_PACKAGE_11_GRAIN_DECISIONS_SHA256,
  PLAN040_PACKAGE_11_GRAIN_ONLY_EXTENT_ROW_PINS,
  PLAN040_PACKAGE_11_RECEIPT_SHA256,
  buildPlan040Package11AcceptedArtifacts,
  buildPlan040Package11GateAndAcceptance,
  validatePlan040Package11GateAndAcceptance,
} from
  "../../src/quality/plan040-qbnr-service-grain-package11-closeout";
import type { Plan040Package11Draft } from
  "../../src/quality/plan040-qbnr-service-grain-package11";
import { PLAN041_POST_CLOSURE_PROJECTION_PINS } from
  "../../src/quality/plan041-projection-successor";

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

  it("persists exactly one extent and twelve terminal grain decisions", () => {
    const draft = JSON.parse(
      readFileSync(draftPath, "utf8"),
    ) as Plan040Package11Draft;
    const gate = JSON.parse(readFileSync(gatePath, "utf8")) as ReturnType<
      typeof buildPlan040Package11GateAndAcceptance
    >["gate"];
    const acceptance = JSON.parse(
      readFileSync(acceptancePath, "utf8"),
    ) as ReturnType<
      typeof buildPlan040Package11GateAndAcceptance
    >["acceptance"];
    const accepted = buildPlan040Package11AcceptedArtifacts({
      draft,
      gate,
      acceptance,
    });
    const extentPath =
      `${repoRoot}/data/quality/operational-reference/` +
      "member-extent-ledger-decisions/" +
      "plan-040-qbnr-service-grain-package-11-v1.json";
    const grainPath =
      `${repoRoot}/data/quality/operational-reference/` +
      "member-grain-decisions/" +
      "plan-040-qbnr-service-grain-package-11-v1.json";
    expect(sha256(readFileSync(gatePath))).toBe(
      PLAN040_PACKAGE_11_GATE_SHA256,
    );
    expect(sha256(readFileSync(extentPath))).toBe(
      PLAN040_PACKAGE_11_EXTENT_DECISIONS_SHA256,
    );
    expect(sha256(readFileSync(grainPath))).toBe(
      PLAN040_PACKAGE_11_GRAIN_DECISIONS_SHA256,
    );
    expect(JSON.parse(readFileSync(extentPath, "utf8"))).toEqual({
      decisions: accepted.extentDecisions,
    });
    expect(JSON.parse(readFileSync(grainPath, "utf8"))).toEqual({
      decisions: accepted.grainDecisions,
    });
    expect(accepted.extentDecisions).toHaveLength(1);
    expect(accepted.extentDecisions[0]?.resolution).toBe("bounded_segment");
    expect(accepted.grainDecisions).toHaveLength(12);
    expect(accepted.grainDecisions.filter((decision) =>
      decision.service_scope.kind === "unresolved")).toHaveLength(7);

    const grainRows = readFileSync(
      `${repoRoot}/data/quality/operational-reference/member-grain-ledger.jsonl`,
      "utf8",
    ).trim().split("\n").map((line) => JSON.parse(line)) as Array<{
      treatment_record_id: string;
      verdict: string;
      service_scope:
        | { kind: string; missing_roles?: string[] }
        | null;
      authorizes_study: false;
      authorizes_cross_product: false;
    }>;
    const byTreatment = new Map(draft.candidates.map((candidate) => [
      candidate.treatment_record_id,
      candidate,
    ]));
    const persistedRows = grainRows.filter((row) =>
      byTreatment.has(row.treatment_record_id));
    expect(persistedRows).toHaveLength(12);
    expect(persistedRows.filter((row) => row.verdict === "resolved"))
      .toHaveLength(5);
    expect(persistedRows.filter((row) =>
      row.verdict.startsWith("blocked_upstream:"))).toHaveLength(7);
    expect(persistedRows.every((row) => {
      const candidate = byTreatment.get(row.treatment_record_id)!;
      return candidate.evidence_verdict ===
          "structured_unresolved_grain_proposed"
        ? row.verdict ===
          `blocked_upstream:${candidate.unresolved_gap_codes.join("+")}` &&
          row.service_scope?.kind === "unresolved"
        : row.verdict === "resolved";
    })).toBeTrue();
    expect(persistedRows.every((row) =>
      row.verdict !== "unreviewed" &&
      row.verdict !== "absent_in_source" &&
      !row.authorizes_study &&
      !row.authorizes_cross_product
    )).toBeTrue();
  });

  it("preserves all prior grain-only extent rows and post-persistence pins", () => {
    const reviewLines = readFileSync(
      `${repoRoot}/data/contracts/operational-occurrence-member-extent/v1/` +
        "review-ledger.jsonl",
      "utf8",
    ).trim().split("\n");
    const pinnedIds = new Set(Object.keys(
      PLAN040_PACKAGE_11_GRAIN_ONLY_EXTENT_ROW_PINS,
    ));
    const observed = new Map<string, string>();
    for (const line of reviewLines) {
      const row = JSON.parse(line) as { decision_id: string };
      if (pinnedIds.has(row.decision_id)) {
        observed.set(row.decision_id, sha256(`${line}\n`));
      }
    }
    expect(Object.fromEntries(observed)).toEqual(
      PLAN040_PACKAGE_11_GRAIN_ONLY_EXTENT_ROW_PINS,
    );

    const pinnedFiles = {
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
    for (const [name, path] of Object.entries(pinnedFiles)) {
      expect(sha256(readFileSync(path))).toBe(
        PLAN041_POST_CLOSURE_PROJECTION_PINS[
          name as keyof typeof PLAN041_POST_CLOSURE_PROJECTION_PINS
        ],
      );
    }
    expect(sha256(readFileSync(
      `${root}/plan-040-flatbush-physical-grain-package-12-evidence-v1.json`,
    ))).toBe(
      "4134a3afc2ce8c2f6fcecd9b12f941c1967511f1401132620b3750d916bc7736",
    );
    expect(sha256(readFileSync(
      `${root}/plan-040-flatbush-physical-grain-package-12-evidence-draft-v1.json`,
    ))).toBe(
      "60095cd79d13f3174961a93aec1cfae5f5e481f6373914a2075502a7a8a7c23b",
    );
  });
});
