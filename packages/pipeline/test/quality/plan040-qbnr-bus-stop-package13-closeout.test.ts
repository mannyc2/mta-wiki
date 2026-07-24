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
  PLAN040_PACKAGE_13_EXTENT_DECISIONS_SHA256,
  PLAN040_PACKAGE_13_GATE_SHA256,
  PLAN040_PACKAGE_13_GRAIN_DECISIONS_SHA256,
  PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS,
  PLAN040_PACKAGE_13_SOURCE_GAP_OVERLAY_SHA256,
  PLAN040_QBNR_BUS_STOP_PACKAGE_13_EXTENT_DECISIONS_PATH,
  PLAN040_QBNR_BUS_STOP_PACKAGE_13_GRAIN_DECISIONS_PATH,
  PLAN040_QBNR_BUS_STOP_PACKAGE_13_SOURCE_GAP_OVERLAY_PATH,
  buildPlan040Package13AcceptedArtifacts,
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
const sourceGapReceiptPath =
  `${repoRoot}/data/quality/acquisition/receipts/member-extent-evidence/` +
  "plan-040-qbnr-bus-stop-package-13-source-gap-blocks-v1.json";
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const readJsonl = <T>(path: string): T[] =>
  readFileSync(path, "utf8").trim().split("\n").filter(Boolean)
    .map((line) => JSON.parse(line) as T);
const rowSha256 = (value: unknown): string =>
  sha256(`${stableJson(value as never)}\n`);
type BuildInput = Parameters<
  typeof buildPlan040Package13GateAndAcceptance
>[0];
type AcceptedInput = Parameters<
  typeof buildPlan040Package13AcceptedArtifacts
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

  it("replays exact accepted decisions and strict source-gap overlay", () => {
    const evidence = readJson<AcceptedInput["evidence"]>(evidencePath);
    const draft = readJson<AcceptedInput["draft"]>(draftPath);
    const gate = readJson<AcceptedInput["gate"]>(gatePath);
    const acceptance = readJson<AcceptedInput["acceptance"]>(acceptancePath);
    const sourceGapReceipt =
      readJson<AcceptedInput["sourceGapReceipt"]>(sourceGapReceiptPath);
    const rebuilt = buildPlan040Package13AcceptedArtifacts({
      evidence,
      draft,
      gate,
      acceptance,
      sourceGapReceipt,
    });
    const extentArtifact = readJson<{ decisions: unknown[] }>(
      PLAN040_QBNR_BUS_STOP_PACKAGE_13_EXTENT_DECISIONS_PATH,
    );
    const grainArtifact = readJson<{ decisions: Array<{
      treatment_record_id: string;
      service_scope: { kind: string; missing_roles?: string[] };
    }> }>(PLAN040_QBNR_BUS_STOP_PACKAGE_13_GRAIN_DECISIONS_PATH);
    const overlayArtifact = readJson<{
      entries: Array<{
        candidate_key: string;
        blocked_surfaces: string[];
        verdict: string;
      }>;
      authorizes_decision_persistence: boolean;
      authorizes_occurrence: boolean;
      authorizes_study: boolean;
      authorizes_cross_product: boolean;
    }>(PLAN040_QBNR_BUS_STOP_PACKAGE_13_SOURCE_GAP_OVERLAY_PATH);

    expect(sha256(readFileSync(
      PLAN040_QBNR_BUS_STOP_PACKAGE_13_EXTENT_DECISIONS_PATH,
    ))).toBe(PLAN040_PACKAGE_13_EXTENT_DECISIONS_SHA256);
    expect(sha256(readFileSync(
      PLAN040_QBNR_BUS_STOP_PACKAGE_13_GRAIN_DECISIONS_PATH,
    ))).toBe(PLAN040_PACKAGE_13_GRAIN_DECISIONS_SHA256);
    expect(sha256(readFileSync(
      PLAN040_QBNR_BUS_STOP_PACKAGE_13_SOURCE_GAP_OVERLAY_PATH,
    ))).toBe(PLAN040_PACKAGE_13_SOURCE_GAP_OVERLAY_SHA256);
    expect(extentArtifact).toEqual({ decisions: rebuilt.extentDecisions });
    expect(grainArtifact).toEqual({ decisions: rebuilt.grainDecisions });
    expect(overlayArtifact).toEqual(rebuilt.sourceGapOverlay);
    expect(extentArtifact.decisions).toHaveLength(21);
    expect(grainArtifact.decisions).toHaveLength(21);
    expect(grainArtifact.decisions.filter((decision) =>
      decision.service_scope.kind === "trip_subset"
    )).toHaveLength(19);
    const unresolved = grainArtifact.decisions.filter((decision) =>
      decision.service_scope.kind === "unresolved"
    );
    expect(unresolved.map((decision) => decision.treatment_record_id).sort())
      .toEqual([
        "treatment_q28-limited-stops-2025",
        "treatment_q84-limited-stops-2025",
      ]);
    expect(unresolved.every((decision) =>
      (decision.service_scope.missing_roles?.length ?? 0) > 0
    )).toBeTrue();
    expect(overlayArtifact.entries).toHaveLength(12);
    expect(overlayArtifact.entries.filter((entry) =>
      entry.blocked_surfaces.includes("member_extent")
    )).toHaveLength(10);
    expect(overlayArtifact.entries.filter((entry) =>
      entry.blocked_surfaces.includes("member_grain")
    )).toHaveLength(12);
    expect(overlayArtifact.entries.every((entry) =>
      entry.verdict.startsWith("blocked_upstream:")
    )).toBeTrue();
    expect({
      decision: overlayArtifact.authorizes_decision_persistence,
      occurrence: overlayArtifact.authorizes_occurrence,
      study: overlayArtifact.authorizes_study,
      cross_product: overlayArtifact.authorizes_cross_product,
    }).toEqual({
      decision: false,
      occurrence: false,
      study: false,
      cross_product: false,
    });
  });

  it("projects the exact closure while preserving siblings and authority", () => {
    type LedgerRow = {
      occurrence_id: string;
      route_record_id: string;
      treatment_record_id: string;
      verdict: string;
      authorizes_study: boolean;
      authorizes_cross_product: boolean;
    };
    const evidence = readJson<AcceptedInput["evidence"] & {
      preserved_siblings: Array<{
        candidate_key: string;
        extent_row_sha256: string;
        grain_row_sha256: string;
      }>;
    }>(evidencePath);
    const candidateKeys = new Set(
      evidence.candidates.map((candidate) => candidate.candidate_key),
    );
    const key = (row: LedgerRow): string =>
      `${row.occurrence_id}\0${row.route_record_id}\0` +
      row.treatment_record_id;
    const extentRows = readJsonl<LedgerRow>(
      `${repoRoot}/data/quality/operational-reference/member-extent-ledger.jsonl`,
    );
    const grainRows = readJsonl<LedgerRow>(
      `${repoRoot}/data/quality/operational-reference/member-grain-ledger.jsonl`,
    );
    const packageExtent = extentRows.filter((row) =>
      candidateKeys.has(key(row))
    );
    const packageGrain = grainRows.filter((row) =>
      candidateKeys.has(key(row))
    );
    expect(packageExtent.filter((row) =>
      row.verdict.startsWith("resolved:")
    )).toHaveLength(21);
    expect(packageExtent.filter((row) =>
      row.verdict.startsWith("blocked_upstream:")
    )).toHaveLength(10);
    expect(packageGrain.filter((row) => row.verdict === "resolved"))
      .toHaveLength(19);
    expect(packageGrain.filter((row) =>
      row.verdict.startsWith("blocked_upstream:")
    )).toHaveLength(12);
    expect(packageExtent.some((row) =>
      row.verdict === "unreviewed" || row.verdict === "absent_in_source"
    )).toBeFalse();
    expect(packageGrain.some((row) =>
      row.verdict === "unreviewed" || row.verdict === "absent_in_source"
    )).toBeFalse();
    expect(packageExtent.every((row) =>
      !row.authorizes_study && !row.authorizes_cross_product
    )).toBeTrue();
    expect(packageGrain.every((row) =>
      !row.authorizes_study && !row.authorizes_cross_product
    )).toBeTrue();
    expect(extentRows.filter((row) => row.verdict === "unreviewed"))
      .toHaveLength(65);
    expect(grainRows.filter((row) => row.verdict === "unreviewed"))
      .toHaveLength(65);

    const extentByKey = new Map(extentRows.map((row) => [key(row), row]));
    const grainByKey = new Map(grainRows.map((row) => [key(row), row]));
    for (const sibling of evidence.preserved_siblings) {
      expect(rowSha256(extentByKey.get(sibling.candidate_key)))
        .toBe(sibling.extent_row_sha256);
      expect(rowSha256(grainByKey.get(sibling.candidate_key)))
        .toBe(sibling.grain_row_sha256);
    }

    for (const [relativePath, expected] of Object.entries({
      "data/quality/operational-reference/member-extent-ledger.jsonl":
        PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.extent_ledger,
      "data/quality/operational-reference/member-grain-ledger.jsonl":
        PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.grain_ledger,
      "data/quality/study-readiness/v1/bridge-ledger.jsonl":
        PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.bridge_ledger,
      "data/quality/study-readiness/v1/bridge-summary.json":
        PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.bridge_summary,
      "data/quality/study-readiness/v1/consumer-priority-manifest.json":
        PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.consumer_priority_manifest,
      "data/quality/study-readiness/v1/manifest.json":
        PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.study_manifest,
      "data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl":
          PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.member_extent_contract,
      "data/contracts/operational-occurrence-member-extent/v1/manifest.json":
        PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.member_extent_manifest,
      "data/contracts/operational-occurrence-member-extent/v1/review-ledger.jsonl":
        PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.member_extent_review_ledger,
      "data/contracts/operational-occurrence-member-extent/v1/summary.json":
        PLAN040_PACKAGE_13_POST_PERSISTENCE_PINS.member_extent_summary,
    })) {
      expect(sha256(readFileSync(`${repoRoot}/${relativePath}`)))
        .toBe(expected);
    }
  });
});
