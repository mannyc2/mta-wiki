import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  MEMBER_EXTENT_ABSENCE_CONTRACT_ID,
  MEMBER_SOURCE_GAP_OVERLAY_CONTRACT_ID,
  buildMemberExtentLedgers,
  loadMemberExtentAbsenceReceipts,
  loadMemberExtentDecisions,
  loadMemberSourceGapOverlays,
  writeMemberExtentLedgerArtifacts,
  type MemberExtentAbsenceReceipt,
  type MemberSourceGapOverlay,
} from "../../src/quality/member-extent-ledger";
import {
  MEMBER_GRAIN_DECISION_CONTRACT_ID,
  loadMemberGrainDecisions,
  parseMemberGrainDecision,
} from "../../src/quality/member-grain-decisions";
import type {
  MemberExtentDecision,
  MemberExtentRow,
} from "../../src/quality/study-readiness-v1";
import type { ScheduleDiffDossier } from "../../src/reference/schedule-diff";

function row(id: string, route = "Q1", extent: MemberExtentRow["extent"] = "unresolved"): MemberExtentRow {
  const positive = extent !== "unresolved";
  return {
    schema_version: 1,
    contract_id: "operational-occurrence-member-extent-v1",
    extent_id: `extent-${id}`,
    occurrence_id: `occurrence-${id}`,
    occurrence_review_decision_id: `occurrence-review-${id}`,
    route_record_id: `route-${route.toLowerCase()}`,
    gtfs_route_id: route,
    treatment_record_id: `treatment-${id}`,
    treatment_family: "service_pattern",
    extent,
    components: positive ? [{
      component_kind: "route",
      identity_namespace: "canonical_record",
      identifiers: [`route-${route.toLowerCase()}`],
      description: "Reviewed whole-route extent.",
    }] : [],
    evidence_bindings: positive ? [{
      role: "extent_classification",
      record_id: `treatment-${id}`,
      source_id: "source",
      evidence_id: "source#block",
    }] : [],
    missing_roles: positive ? [] : ["reviewed_extent_decision"],
    decision_id: positive ? `existing-${id}` : null,
    rationale: positive ? "Existing reviewed extent." : "Awaiting reviewed extent.",
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

function positiveDecision(target: MemberExtentRow): MemberExtentDecision {
  return {
    decision_id: `decision-${target.extent_id}`,
    occurrence_id: target.occurrence_id,
    route_record_id: target.route_record_id,
    treatment_record_id: target.treatment_record_id,
    resolution: "bounded_segment",
    components: [{
      component_kind: "segment",
      identity_namespace: "source_literal_v1",
      identifiers: ["stop-a", "stop-b"],
      description: "Reviewed schedule segment.",
    }],
    evidence_bindings: [{
      role: "reference_snapshot",
      record_id: target.treatment_record_id,
      source_id: "snapshot-source",
      evidence_id: "snapshot-source#manifest",
    }],
    missing_roles: [],
    rationale: "Exact segment is bound to the staged schedule snapshot.",
    reviewed_at: "2026-07-23",
    reviewed_by: "fixture-reviewer",
  };
}

function absence(target: MemberExtentRow): MemberExtentAbsenceReceipt {
  return {
    schema_version: 1,
    contract_id: MEMBER_EXTENT_ABSENCE_CONTRACT_ID,
    receipt_id: `receipt-${target.extent_id}`,
    surfaces: ["member_extent", "member_grain"],
    extent_keys: [{
      occurrence_id: target.occurrence_id,
      route_record_id: target.route_record_id,
      treatment_record_id: target.treatment_record_id,
    }],
    exact_searches: [`${target.gtfs_route_id} exact member extent`],
    urls_inspected: ["https://example.test/official"],
    rationale: "Exact official targets were inspected without the required binding.",
    reviewed_at: "2026-07-23",
    reviewed_by: "fixture-reviewer",
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

type SourceGapFixtureInput = Array<{
  target: MemberExtentRow;
  surfaces: Array<"member_extent" | "member_grain">;
  missingRoles: string[];
}>;

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...new Set(values)].sort().join("\n")}\n`);
const stableBytes = (value: unknown): string =>
  `${stableJson(value as JsonValue)}\n`;
const writeStableJson = (path: string, value: unknown): void =>
  writeFileSync(path, stableBytes(value));
const fileSha256 = (path: string): string => sha256(readFileSync(path));

function sourceGapFixture(input: SourceGapFixtureInput) {
  const root = mkdtempSync(join(tmpdir(), "member-source-gap-provenance-"));
  const paths = {
    comparison: "receipts/comparison.json",
    receipt: "receipts/source-gaps.json",
    draft: "review/draft.json",
    evidence: "review/evidence.json",
    gate: "review/gate.json",
    acceptance: "review/acceptance.json",
    overlay: "overlays/overlay.json",
  };
  for (const path of Object.values(paths)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
  }
  writeStableJson(join(root, paths.comparison), {
    receipt_id: "fixture-comparison-receipt",
  });
  writeStableJson(join(root, paths.draft), {
    draft_id: "fixture-source-gap-draft",
  });
  const normalized = input.map(({ target, surfaces, missingRoles }) => {
    const candidateKey =
      `${target.occurrence_id}\0${target.route_record_id}\0` +
      target.treatment_record_id;
    return {
      target,
      candidateKey,
      surfaces: [...surfaces].sort() as Array<
        "member_extent" | "member_grain"
      >,
      missingRoles: [...missingRoles].sort(),
    };
  }).sort((left, right) =>
    left.candidateKey < right.candidateKey
      ? -1
      : left.candidateKey > right.candidateKey ? 1 : 0
  );
  const candidateKeys = normalized.map((entry) => entry.candidateKey);
  const candidateKeySha256 = sortedHash(candidateKeys);
  const comparisonRef = {
    path: paths.comparison,
    sha256: fileSha256(join(root, paths.comparison)),
    receipt_id: "fixture-comparison-receipt",
    source_id: "fixture_comparison_receipt",
    normal_file_verified: true,
    replay_derived: true,
    authorizes_decision_persistence: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  const receipt = {
    schema_version: 1,
    receipt_id: "fixture-source-gap-receipt",
    source_id: "fixture_source_gap_receipt",
    package_id: "fixture-source-gap-package",
    candidate_count: normalized.length,
    candidate_key_sha256: candidateKeySha256,
    exact_absence_count: 0,
    contract_semantics:
      "candidate-specific source gap blocks authority without claiming source absence",
    prospective_ledger_prefix: "blocked_upstream:",
    prospective_ledger_reason_policy: "sorted_unique_gap_codes",
    absence_projection_prohibited_for_unresolved_grain: true,
    normal_file_verified: true,
    replay_derived: true,
    external_acquisition_performed: false,
    comparison_receipt: comparisonRef,
    candidates: normalized.map((entry) => {
      const verdict =
        `blocked_upstream:${entry.missingRoles.join("+")}`;
      const resolvedSurfaces = (
        ["member_extent", "member_grain"] as const
      ).filter((surface) => !entry.surfaces.includes(surface));
      return {
        contract: "member-evidence-source-gap-block-receipt-v1",
        candidate_key: entry.candidateKey,
        occurrence_id: entry.target.occurrence_id,
        route_record_id: entry.target.route_record_id,
        treatment_record_id: entry.target.treatment_record_id,
        blocked_surfaces: entry.surfaces,
        resolved_surfaces: resolvedSurfaces,
        gap_codes: entry.missingRoles,
        prospective_ledger_handling: Object.fromEntries(
          entry.surfaces.map((surface) => [surface, verdict]),
        ),
        semantic_verdict: "blocked_upstream",
        literal_exact_absence: false,
        source_statement_present: true,
        source_statement_evidence_id: "source#block",
        comparison_receipt_anchor:
          `fixture_comparison_receipt#candidate=${entry.candidateKey}`,
        absence_projection_prohibited_for_unresolved_grain: true,
        authorizes_decision_persistence: false,
        authorizes_occurrence: false,
        authorizes_study: false,
        authorizes_cross_product: false,
      };
    }),
    authorizes_decision_persistence: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  writeStableJson(join(root, paths.receipt), receipt);
  const sourceReceiptRef = {
    path: paths.receipt,
    sha256: fileSha256(join(root, paths.receipt)),
  };
  const sourceEvidenceReceiptRef = {
    ...sourceReceiptRef,
    receipt_id: receipt.receipt_id,
    source_id: receipt.source_id,
    normal_file_verified: true,
    replay_derived: true,
    authorizes_decision_persistence: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  const evidence = {
    schema_version: 1,
    manifest_id: "fixture-source-gap-evidence",
    candidate_count: normalized.length,
    candidate_key_sha256: candidateKeySha256,
    source_gap_block_receipt: sourceEvidenceReceiptRef,
  };
  writeStableJson(join(root, paths.evidence), evidence);
  const extentBlocked = normalized.filter((entry) =>
    entry.surfaces.includes("member_extent")
  ).length;
  const grainBlocked = normalized.filter((entry) =>
    entry.surfaces.includes("member_grain")
  ).length;
  const extentPositive = normalized.length - extentBlocked;
  const verdictDistribution = {
    exact_absence: 0,
    positive_extent_and_grain_proposed: 0,
    positive_extent_proposed_grain_blocked: extentPositive,
    source_gap_block_receipt: normalized.length,
    source_gap_blocked_extent_and_grain: extentBlocked,
  };
  const gate = {
    schema_version: 1,
    gate_id: "fixture-source-gap-gate",
    reviewed_commit: "0123456789abcdef0123456789abcdef01234567",
    candidate_count: normalized.length,
    candidate_key_sha256: candidateKeySha256,
    reviewer_result: "APPROVE/APPROVE",
    verdict_distribution: verdictDistribution,
    authorizes_decision_persistence: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_ontology: false,
    authorizes_corrections: false,
  };
  writeStableJson(join(root, paths.gate), gate);
  const acceptance = {
    schema_version: 1,
    acceptance_id: "fixture-source-gap-acceptance",
    acceptance_basis: "dual_review_fixture_acceptance",
    accepted_at: "2026-07-24T20:45:00Z",
    accepted_by: "fixture-owner",
    authorization_state: "exact_source_gap_overlay_only",
    reviewer_result: "APPROVE/APPROVE",
    candidate_count: normalized.length,
    candidate_key_sha256: candidateKeySha256,
    artifacts: {
      comparison_receipt: {
        path: paths.comparison,
        sha256: fileSha256(join(root, paths.comparison)),
      },
      draft: {
        path: paths.draft,
        sha256: fileSha256(join(root, paths.draft)),
      },
      evidence: {
        path: paths.evidence,
        sha256: fileSha256(join(root, paths.evidence)),
      },
      source_gap_block_receipt: sourceReceiptRef,
    },
    gate: {
      path: paths.gate,
      sha256: fileSha256(join(root, paths.gate)),
    },
    authorized_exact_persistence: {
      decision_candidate_count: extentPositive,
      decision_candidate_key_sha256: candidateKeySha256,
      extent_blocked_upstream_count: extentBlocked,
      extent_decision_count: extentPositive,
      extent_decision_id_sha256: candidateKeySha256,
      extent_resolved_count: extentPositive,
      grain_blocked_upstream_count: grainBlocked,
      grain_decision_count: extentPositive,
      grain_decision_id_sha256: candidateKeySha256,
      grain_resolved_count: 0,
      source_gap_candidate_key_sha256: candidateKeySha256,
      source_gap_overlay_count: normalized.length,
    },
    verdict_distribution: verdictDistribution,
    preservation_invariants: {
      absence_projection_prohibited_for_unresolved_grain: true,
      accepted_prior_decisions_byte_identical: true,
      correction_state_unchanged: true,
      cross_product_authorization_unchanged: true,
      occurrence_decisions_unchanged: true,
      preserved_siblings_byte_identical: true,
      source_gap_receipt_strict_and_nonauthorizing: true,
      study_authorization_unchanged: true,
      treatment_ontology_unchanged: true,
    },
    authorizes_decision_persistence: true,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_ontology: false,
    authorizes_corrections: false,
  };
  writeStableJson(join(root, paths.acceptance), acceptance);
  const overlay: MemberSourceGapOverlay = {
    schema_version: 1,
    contract_id: MEMBER_SOURCE_GAP_OVERLAY_CONTRACT_ID,
    overlay_id: "fixture-source-gap-overlay",
    source_receipt: {
      ...sourceReceiptRef,
      receipt_id: receipt.receipt_id,
    },
    owner_acceptance: {
      path: paths.acceptance,
      sha256: fileSha256(join(root, paths.acceptance)),
    },
    accepted_at: acceptance.accepted_at,
    accepted_by: acceptance.accepted_by,
    entries: normalized.map(({ target, candidateKey, surfaces, missingRoles }) => ({
      candidate_key: candidateKey,
      occurrence_id: target.occurrence_id,
      route_record_id: target.route_record_id,
      treatment_record_id: target.treatment_record_id,
      blocked_surfaces: surfaces,
      missing_roles: missingRoles,
      verdict: `blocked_upstream:${missingRoles.join("+")}`,
      source_statement_evidence_id: "source#block",
    })),
    authorizes_decision_persistence: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  writeStableJson(join(root, paths.overlay), overlay);
  return {
    root,
    overlayDir: join(root, "overlays"),
    paths,
    receipt,
    evidence,
    acceptance,
    overlay,
  };
}

function grainDecision(target: MemberExtentRow, extentDecisionId: string | null = null) {
  return {
    schema_version: 1,
    contract_id: MEMBER_GRAIN_DECISION_CONTRACT_ID,
    decision_id: `grain-${target.extent_id}`,
    occurrence_id: target.occurrence_id,
    route_record_id: target.route_record_id,
    gtfs_route_id: target.gtfs_route_id,
    treatment_record_id: target.treatment_record_id,
    member_extent_decision_id: extentDecisionId,
    service_scope: { kind: "periods", periods: ["am_peak"], directions: ["N"], pattern_ids: [] },
    lineage_segments: [],
    evidence_bindings: [{
      role: "reference_snapshot",
      record_id: target.treatment_record_id,
      source_id: "snapshot-source",
      evidence_id: "snapshot-source#manifest",
    }],
    rationale: "The structured selector captures the reviewed morning scope.",
    reviewed_at: "2026-07-23",
    reviewed_by: "fixture-reviewer",
  };
}

function occurrence(target: MemberExtentRow) {
  return {
    occurrence_id: target.occurrence_id,
    routes: [{ route_record_id: target.route_record_id }],
    treatment: {
      kind: "atomic",
      member: { treatment_record_id: target.treatment_record_id },
    },
  };
}

describe("member extent and grain ledgers", () => {
  it("preserves the exact companion denominator and overlays only reviewed terminal evidence", () => {
    const unresolved = row("atomic");
    const bundleOne = row("bundle-a", "Q2");
    const bundleTwo = row("bundle-b", "Q2");
    const multiRoute = row("multi-route", "Q3");
    const existing = row("existing", "Q4", "route_wide");
    const decision = positiveDecision(unresolved);
    const result = buildMemberExtentLedgers({
      companionRows: [bundleTwo, existing, multiRoute, unresolved, bundleOne],
      extentDecisions: [decision],
      grainDecisions: [parseMemberGrainDecision(grainDecision(unresolved, decision.decision_id))],
      absenceReceipts: [absence(bundleOne)],
    });
    expect(result.extentRows).toHaveLength(5);
    expect(result.grainRows).toHaveLength(5);
    expect(result.extentRows.find((entry) => entry.treatment_record_id === unresolved.treatment_record_id))
      .toMatchObject({ current_extent_kind: "bounded_segment", verdict: "resolved:bounded_segment" });
    expect(result.extentRows.find((entry) => entry.treatment_record_id === existing.treatment_record_id))
      .toMatchObject({ verdict: "resolved:route_wide", verdict_basis: "review:existing-existing" });
    expect(result.extentRows.find((entry) => entry.treatment_record_id === bundleOne.treatment_record_id))
      .toMatchObject({ verdict: "absent_in_source", receipt_ids: ["receipt-extent-bundle-a"] });
    expect(result.grainRows.find((entry) => entry.treatment_record_id === unresolved.treatment_record_id)?.verdict)
      .toBe("resolved");
  });

  it("accepts an exact materialized copy of an external decision and rejects drift", () => {
    const target = row("materialized");
    const decision = positiveDecision(target);
    const materialized: MemberExtentRow = {
      ...target,
      extent: decision.resolution,
      components: decision.components,
      evidence_bindings: decision.evidence_bindings,
      missing_roles: decision.missing_roles,
      decision_id: decision.decision_id,
      rationale: decision.rationale,
    };
    const result = buildMemberExtentLedgers({
      companionRows: [materialized],
      extentDecisions: [decision],
    });
    expect(result.extentRows[0]).toMatchObject({
      current_extent_kind: "bounded_segment",
      verdict: "resolved:bounded_segment",
      verdict_basis: `review:${decision.decision_id}`,
    });
    expect(() => buildMemberExtentLedgers({
      companionRows: [{ ...materialized, rationale: "Drifted materialization." }],
      extentDecisions: [decision],
    })).toThrow("conflicts with materialized positive row");
  });

  it("fails closed for conflicting, orphan, and authority-bearing absence receipts", () => {
    const target = row("target");
    expect(() => buildMemberExtentLedgers({
      companionRows: [target],
      extentDecisions: [positiveDecision(target)],
      absenceReceipts: [absence(target)],
    })).toThrow("conflicts");
    const orphan = row("orphan");
    expect(() => buildMemberExtentLedgers({
      companionRows: [target],
      absenceReceipts: [absence(orphan)],
    })).toThrow("orphan extent key");

    const dir = mkdtempSync(join(tmpdir(), "member-receipts-"));
    const invalid = { ...absence(target), authorizes_study: true };
    writeFileSync(join(dir, "invalid.json"), JSON.stringify(invalid));
    expect(() => loadMemberExtentAbsenceReceipts([dir])).toThrow("cannot authorize");
    writeFileSync(join(dir, "invalid.json"), JSON.stringify({
      ...absence(target),
      exact_searches: [],
    }));
    expect(() => loadMemberExtentAbsenceReceipts([dir])).toThrow("non-empty array");
  });

  it("projects strict source-gap receipts without converting them to absence", () => {
    const unresolved = row("source-gap");
    const spatialOnly = row("source-gap-grain", "Q2");
    const extentDecision = positiveDecision(spatialOnly);
    const unresolvedGrain = parseMemberGrainDecision({
      ...grainDecision(spatialOnly, extentDecision.decision_id),
      service_scope: {
        kind: "unresolved",
        missing_roles: ["pattern_identity"],
      },
    });
    const fixture = sourceGapFixture([
      {
        target: unresolved,
        surfaces: ["member_extent", "member_grain"],
        missingRoles: ["reference_snapshot", "stop_identity"],
      },
      {
        target: spatialOnly,
        surfaces: ["member_grain"],
        missingRoles: ["pattern_identity"],
      },
    ]);
    const [overlay] = loadMemberSourceGapOverlays(
      [fixture.overlayDir],
      fixture.root,
    );
    const result = buildMemberExtentLedgers({
      companionRows: [unresolved, spatialOnly],
      extentDecisions: [extentDecision],
      grainDecisions: [unresolvedGrain],
      sourceGapOverlays: [overlay!],
    });
    expect(result.extentRows.find((entry) =>
      entry.treatment_record_id === unresolved.treatment_record_id
    )).toMatchObject({
      verdict: "blocked_upstream:reference_snapshot+stop_identity",
      verdict_basis: "receipt:fixture-source-gap-receipt",
      receipt_ids: ["fixture-source-gap-receipt"],
    });
    expect(result.grainRows.find((entry) =>
      entry.treatment_record_id === unresolved.treatment_record_id
    )?.verdict).toBe("blocked_upstream:reference_snapshot+stop_identity");
    expect(result.extentRows.find((entry) =>
      entry.treatment_record_id === spatialOnly.treatment_record_id
    )?.verdict).toBe("resolved:bounded_segment");
    expect(result.grainRows.find((entry) =>
      entry.treatment_record_id === spatialOnly.treatment_record_id
    )?.verdict).toBe("blocked_upstream:pattern_identity");
    expect(result.extentRows.some((entry) =>
      entry.verdict === "absent_in_source"
    )).toBeFalse();
    expect(result.grainRows.some((entry) =>
      entry.verdict === "absent_in_source"
    )).toBeFalse();
  });

  it("loads only canonical, nonauthorizing source-gap overlays", () => {
    const target = row("source-gap-loader");
    const fixture = sourceGapFixture([{
      target,
      surfaces: ["member_extent", "member_grain"],
      missingRoles: ["reference_snapshot"],
    }]);
    expect(loadMemberSourceGapOverlays(
      [fixture.overlayDir],
      fixture.root,
    )).toEqual([fixture.overlay]);
    writeStableJson(join(fixture.root, fixture.paths.overlay), {
      ...fixture.overlay,
      authorizes_study: true,
    });
    expect(() => loadMemberSourceGapOverlays(
      [fixture.overlayDir],
      fixture.root,
    )).toThrow(
      "cannot carry authority",
    );
    writeStableJson(join(fixture.root, fixture.paths.overlay), {
      ...fixture.overlay,
      entries: fixture.overlay.entries.map((entry) => ({
        ...entry,
        verdict: "blocked_upstream:wrong_reason",
      })),
    });
    expect(() => loadMemberSourceGapOverlays(
      [fixture.overlayDir],
      fixture.root,
    )).toThrow(
      "noncanonical blocked reason",
    );
  });

  it("rejects mismatched, missing, orphan, and duplicate overlay coverage", () => {
    const inputs: SourceGapFixtureInput = [
      {
        target: row("source-gap-a"),
        surfaces: ["member_extent", "member_grain"],
        missingRoles: ["reference_snapshot"],
      },
      {
        target: row("source-gap-b", "Q2"),
        surfaces: ["member_grain"],
        missingRoles: ["pattern_identity"],
      },
    ];
    const mismatch = sourceGapFixture(inputs);
    writeStableJson(join(mismatch.root, mismatch.paths.overlay), {
      ...mismatch.overlay,
      entries: mismatch.overlay.entries.map((entry, index) =>
        index === 0
          ? {
            ...entry,
            missing_roles: ["forged_gap"],
            verdict: "blocked_upstream:forged_gap",
          }
          : entry
      ),
    });
    expect(() => loadMemberSourceGapOverlays(
      [mismatch.overlayDir],
      mismatch.root,
    )).toThrow("does not exactly match receipt candidate");

    const missing = sourceGapFixture(inputs);
    writeStableJson(join(missing.root, missing.paths.overlay), {
      ...missing.overlay,
      entries: missing.overlay.entries.slice(1),
    });
    expect(() => loadMemberSourceGapOverlays(
      [missing.overlayDir],
      missing.root,
    )).toThrow("acceptance does not pin the exact overlay scope");

    const duplicate = sourceGapFixture(inputs);
    writeStableJson(join(duplicate.root, duplicate.paths.overlay), {
      ...duplicate.overlay,
      entries: [
        duplicate.overlay.entries[0],
        duplicate.overlay.entries[0],
      ],
    });
    expect(() => loadMemberSourceGapOverlays(
      [duplicate.overlayDir],
      duplicate.root,
    )).toThrow("keys must be unique and sorted");

    const orphan = sourceGapFixture(inputs);
    const forgedTarget = row("forged-orphan", "Q9");
    const forgedKey =
      `${forgedTarget.occurrence_id}\0${forgedTarget.route_record_id}\0` +
      forgedTarget.treatment_record_id;
    writeStableJson(join(orphan.root, orphan.paths.overlay), {
      ...orphan.overlay,
      entries: orphan.overlay.entries.map((entry, index) =>
        index === 0
          ? {
            ...entry,
            candidate_key: forgedKey,
            occurrence_id: forgedTarget.occurrence_id,
            route_record_id: forgedTarget.route_record_id,
            treatment_record_id: forgedTarget.treatment_record_id,
          }
          : entry
      ).sort((left, right) =>
        left.candidate_key.localeCompare(right.candidate_key)
      ),
    });
    expect(() => loadMemberSourceGapOverlays(
      [orphan.overlayDir],
      orphan.root,
    )).toThrow("acceptance does not pin the exact overlay scope");
  });

  it("strict-decodes receipt and acceptance provenance", () => {
    const input: SourceGapFixtureInput = [{
      target: row("source-gap-strict"),
      surfaces: ["member_extent", "member_grain"],
      missingRoles: ["reference_snapshot"],
    }];
    const unknownReceipt = sourceGapFixture(input);
    const receipt = {
      ...unknownReceipt.receipt,
      forged_unknown_field: true,
    };
    writeStableJson(
      join(unknownReceipt.root, unknownReceipt.paths.receipt),
      receipt,
    );
    const receiptSha = fileSha256(
      join(unknownReceipt.root, unknownReceipt.paths.receipt),
    );
    const evidence = {
      ...unknownReceipt.evidence,
      source_gap_block_receipt: {
        ...unknownReceipt.evidence.source_gap_block_receipt,
        sha256: receiptSha,
      },
    };
    writeStableJson(
      join(unknownReceipt.root, unknownReceipt.paths.evidence),
      evidence,
    );
    const acceptance = {
      ...unknownReceipt.acceptance,
      artifacts: {
        ...unknownReceipt.acceptance.artifacts,
        evidence: {
          ...unknownReceipt.acceptance.artifacts.evidence,
          sha256: fileSha256(
            join(unknownReceipt.root, unknownReceipt.paths.evidence),
          ),
        },
        source_gap_block_receipt: {
          ...unknownReceipt.acceptance.artifacts.source_gap_block_receipt,
          sha256: receiptSha,
        },
      },
    };
    writeStableJson(
      join(unknownReceipt.root, unknownReceipt.paths.acceptance),
      acceptance,
    );
    writeStableJson(
      join(unknownReceipt.root, unknownReceipt.paths.overlay),
      {
        ...unknownReceipt.overlay,
        source_receipt: {
          ...unknownReceipt.overlay.source_receipt,
          sha256: receiptSha,
        },
        owner_acceptance: {
          ...unknownReceipt.overlay.owner_acceptance,
          sha256: fileSha256(
            join(unknownReceipt.root, unknownReceipt.paths.acceptance),
          ),
        },
      },
    );
    expect(() => loadMemberSourceGapOverlays(
      [unknownReceipt.overlayDir],
      unknownReceipt.root,
    )).toThrow("unknown field(s): forged_unknown_field");

    const authority = sourceGapFixture(input);
    writeStableJson(join(authority.root, authority.paths.acceptance), {
      ...authority.acceptance,
      authorizes_occurrence: true,
    });
    writeStableJson(join(authority.root, authority.paths.overlay), {
      ...authority.overlay,
      owner_acceptance: {
        ...authority.overlay.owner_acceptance,
        sha256: fileSha256(
          join(authority.root, authority.paths.acceptance),
        ),
      },
    });
    expect(() => loadMemberSourceGapOverlays(
      [authority.overlayDir],
      authority.root,
    )).toThrow("must authorize only decision persistence");

    const unknownAcceptance = sourceGapFixture(input);
    writeStableJson(
      join(unknownAcceptance.root, unknownAcceptance.paths.acceptance),
      {
        ...unknownAcceptance.acceptance,
        forged_unknown_field: true,
      },
    );
    writeStableJson(
      join(unknownAcceptance.root, unknownAcceptance.paths.overlay),
      {
        ...unknownAcceptance.overlay,
        owner_acceptance: {
          ...unknownAcceptance.overlay.owner_acceptance,
          sha256: fileSha256(join(
            unknownAcceptance.root,
            unknownAcceptance.paths.acceptance,
          )),
        },
      },
    );
    expect(() => loadMemberSourceGapOverlays(
      [unknownAcceptance.overlayDir],
      unknownAcceptance.root,
    )).toThrow("unknown field(s): forged_unknown_field");
  });

  it("rejects forged provenance paths, hashes, and symlinks", () => {
    const input: SourceGapFixtureInput = [{
      target: row("source-gap-files"),
      surfaces: ["member_extent", "member_grain"],
      missingRoles: ["reference_snapshot"],
    }];
    const forgedHash = sourceGapFixture(input);
    writeStableJson(join(forgedHash.root, forgedHash.paths.overlay), {
      ...forgedHash.overlay,
      source_receipt: {
        ...forgedHash.overlay.source_receipt,
        sha256: "0".repeat(64),
      },
    });
    expect(() => loadMemberSourceGapOverlays(
      [forgedHash.overlayDir],
      forgedHash.root,
    )).toThrow("pinned SHA-256 mismatch");

    const forgedPath = sourceGapFixture(input);
    writeStableJson(join(forgedPath.root, forgedPath.paths.overlay), {
      ...forgedPath.overlay,
      source_receipt: {
        ...forgedPath.overlay.source_receipt,
        path: "../outside-source-gap.json",
      },
    });
    expect(() => loadMemberSourceGapOverlays(
      [forgedPath.overlayDir],
      forgedPath.root,
    )).toThrow("expected canonical path under repository root");

    const symlink = sourceGapFixture(input);
    const acceptancePath = join(symlink.root, symlink.paths.acceptance);
    const targetPath = join(symlink.root, "review/acceptance-target.json");
    writeFileSync(targetPath, readFileSync(acceptancePath));
    unlinkSync(acceptancePath);
    symlinkSync("acceptance-target.json", acceptancePath);
    expect(() => loadMemberSourceGapOverlays(
      [symlink.overlayDir],
      symlink.root,
    )).toThrow("must be a normal non-symlink file");
  });

  it("loads single, array, and decisions-wrapper packages and rejects duplicate keys", () => {
    const targetA = row("a");
    const targetB = row("b");
    const targetC = row("c");
    const dir = mkdtempSync(join(tmpdir(), "member-decisions-"));
    writeFileSync(join(dir, "single.json"), JSON.stringify(positiveDecision(targetA)));
    writeFileSync(join(dir, "array.json"), JSON.stringify([positiveDecision(targetB)]));
    writeFileSync(join(dir, "batch.json"), JSON.stringify({ decisions: [positiveDecision(targetC)] }));
    expect(loadMemberExtentDecisions([dir])).toHaveLength(3);
    writeFileSync(join(dir, "duplicate.json"), JSON.stringify(positiveDecision(targetA)));
    expect(() => loadMemberExtentDecisions([dir])).toThrow("duplicate extent decision");
  });

  it("requires structured service modality and lineage instead of prose fallbacks", () => {
    const target = row("grain");
    expect(() => parseMemberGrainDecision({
      ...grainDecision(target),
      service_scope: { kind: "not_applicable" },
      rationale: "AM peak frequency only.",
    })).toThrow("only in prose");
    expect(() => parseMemberGrainDecision({
      ...grainDecision(target),
      service_scope: { kind: "not_applicable" },
      rationale: "The predecessor Q15 route is replaced.",
    })).toThrow("only in prose");
    expect(() => parseMemberGrainDecision({
      ...grainDecision(target),
      authorizes_study: true,
    })).toThrow("unknown field");
    expect(() => parseMemberGrainDecision({
      ...grainDecision(target),
      evidence_bindings: [],
    })).toThrow("require exact evidence");
  });

  it("requires terminal grain decisions to name a matching positive spatial decision", () => {
    const unresolved = row("grain-unresolved");
    expect(() => buildMemberExtentLedgers({
      companionRows: [unresolved],
      grainDecisions: [parseMemberGrainDecision(grainDecision(unresolved))],
    })).toThrow("requires a positive spatial decision");

    const existing = row("grain-existing", "Q4", "route_wide");
    expect(() => buildMemberExtentLedgers({
      companionRows: [existing],
      grainDecisions: [parseMemberGrainDecision(grainDecision(existing))],
    })).toThrow("must name its positive spatial decision");
    expect(() => buildMemberExtentLedgers({
      companionRows: [existing],
      grainDecisions: [parseMemberGrainDecision({
        ...grainDecision(existing),
        service_scope: { kind: "not_applicable" },
        rationale: "This member has no separate service-grain selector.",
      })],
    })).toThrow("must name its positive spatial decision");
    expect(buildMemberExtentLedgers({
      companionRows: [existing],
      grainDecisions: [
        parseMemberGrainDecision(grainDecision(existing, existing.decision_id)),
      ],
    }).grainRows[0]?.verdict).toBe("resolved");

    const blocked = parseMemberGrainDecision({
      ...grainDecision(unresolved),
      service_scope: { kind: "unresolved", missing_roles: ["pattern_identity"] },
      rationale: "The exact structured grain is not yet evidence-bound.",
    });
    expect(buildMemberExtentLedgers({
      companionRows: [unresolved],
      grainDecisions: [blocked],
    }).grainRows[0]?.verdict).toBe("blocked_upstream:pattern_identity");
  });

  it("rejects a stale companion that omits a current occurrence member", () => {
    const existing = row("denominator-existing");
    const generated = row("denominator-generated", "Q99");
    expect(() => buildMemberExtentLedgers({
      companionRows: [existing],
      expectedMemberKeys: [existing, generated],
    })).toThrow("does not match current occurrence denominator");
    expect(buildMemberExtentLedgers({
      companionRows: [existing, generated],
      expectedMemberKeys: [generated, existing],
    }).extentRows).toHaveLength(2);
  });

  it("attaches Q61, QM44, and QM64 dossier facts only as nonexclusive route context", () => {
    const q61 = { ...row("q61", "Q61"), missing_roles: ["bounded_scope_identity"] } as MemberExtentRow;
    const qm44 = { ...row("qm44", "QM44"), missing_roles: ["stop_identity"] } as MemberExtentRow;
    const qm64 = { ...row("qm64", "QM64"), missing_roles: ["scope_modality"] } as MemberExtentRow;
    const dossier = (routeId: string): ScheduleDiffDossier => ({
      route_id: routeId,
      query_receipts: [{ snapshot_id: "snapshot", path: "receipt.json", sha256: "a".repeat(64) }],
      direction_diffs: [{
        direction: "N",
        timepoint_stops_added: [{ stop_id: "B", stop_name: "B" }],
        timepoint_stops_removed: [{ stop_id: "A", stop_name: "A" }],
        trips_per_period_before: [{ period: "am_peak", trip_count: 1, mean_headway_minutes: null }],
        trips_per_period_after: [{ period: "am_peak", trip_count: 2, mean_headway_minutes: null }],
      }],
      correspondence_segments: [{
        old_route_id: "Q15",
        direction: "N",
        predecessor_shape_id: "old",
        successor_shape_id: "new",
        predecessor_service_date: "2025-06-28",
        boundary_stops: [{ stop_id: "A", stop_name: "A" }, { stop_id: "B", stop_name: "B" }],
        shared_timepoint_stop_ids: ["A", "B"],
        miles: 1,
      }],
      new_route_remainder: [],
    } as unknown as ScheduleDiffDossier);
    const result = buildMemberExtentLedgers({
      companionRows: [q61, qm44, qm64],
      dossierArtifacts: ["Q61", "QM44", "QM64"].map((routeId) => ({
        artifact: `${routeId}.json`,
        dossier: dossier(routeId),
      })),
    });
    expect(result.extentRows.find((entry) => entry.gtfs_route_id === "Q61")?.dossier_refs[0])
      .toMatchObject({
        fact_kind: "bounded_scope_identity",
        evidence_scope: "route_context_only_nonexclusive",
        satisfies_missing_role: false,
        limitations: [
          "nonexclusive_route_context",
          "not_treatment_aligned",
          "timepoint_only_nonexhaustive",
        ],
      });
    expect(result.extentRows.find((entry) => entry.gtfs_route_id === "QM44")?.dossier_refs
      .every((ref) =>
        ref.fact_kind === "stop_identity" &&
        ref.satisfies_missing_role === false &&
        ref.limitations.includes("timepoint_only_nonexhaustive"))).toBe(true);
    expect(result.extentRows.find((entry) => entry.gtfs_route_id === "QM64")?.dossier_refs[0])
      .toMatchObject({
        fact_kind: "scope_modality",
        satisfies_missing_role: false,
        limitations: [
          "may_include_non_revenue_trips",
          "nonexclusive_route_context",
          "not_treatment_aligned",
        ],
      });
  });

  it("writes byte-stable outputs on replay", () => {
    const root = mkdtempSync(join(tmpdir(), "member-ledger-"));
    const companion = join(root, "companion.jsonl");
    const occurrences = join(root, "occurrences.jsonl");
    const dossierDir = join(root, "dossiers");
    mkdirSync(dossierDir);
    writeFileSync(companion, `${stableJson(row("stable") as unknown as JsonValue)}\n`);
    writeFileSync(
      occurrences,
      `${stableJson(occurrence(row("stable")) as unknown as JsonValue)}\n`,
    );
    const options = {
      rootDir: root,
      companionPath: companion,
      occurrencesPath: occurrences,
      extentDecisionDirs: [join(root, "extent-decisions")],
      grainDecisionDirs: [join(root, "grain-decisions")],
      absenceReceiptDirs: [join(root, "receipts")],
      dossierDir,
      packetPath: join(root, "packets.jsonl"),
      extentOutputPath: join(root, "extent.jsonl"),
      grainOutputPath: join(root, "grain.jsonl"),
    };
    writeMemberExtentLedgerArtifacts(options);
    const first = [readFileSync(options.extentOutputPath), readFileSync(options.grainOutputPath)];
    writeMemberExtentLedgerArtifacts(options);
    expect(readFileSync(options.extentOutputPath)).toEqual(first[0]);
    expect(readFileSync(options.grainOutputPath)).toEqual(first[1]);
  });

  it("loads grain packages from every accelerated artifact shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "grain-decisions-"));
    const a = grainDecision(row("grain-a"));
    const b = grainDecision(row("grain-b"));
    const c = grainDecision(row("grain-c"));
    writeFileSync(join(dir, "single.json"), JSON.stringify(a));
    writeFileSync(join(dir, "array.json"), JSON.stringify([b]));
    writeFileSync(join(dir, "batch.json"), JSON.stringify({ decisions: [c] }));
    expect(loadMemberGrainDecisions([dir])).toHaveLength(3);
  });
});
