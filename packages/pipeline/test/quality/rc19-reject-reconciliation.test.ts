import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildRc19RejectReconciliation,
  writeRc19RejectReconciliation,
  type Rc19ReconciliationExpectations,
  type Rc19ReconciliationPaths,
} from "@mta-wiki/pipeline/quality/rc19-reject-reconciliation";

const work = join(tmpdir(), `rc19-reconciliation-test-${process.pid}`);
afterAll(() => rmSync(work, { recursive: true, force: true }));

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(path: string, value: unknown): string {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, bytes, "utf8");
  return sha256(bytes);
}

function candidate(candidateId: string, routeId: string, treatmentFamily: string, implementationDate: string, datePrecision = "day") {
  return {
    candidateId,
    routeId,
    treatmentFamily,
    implementationDate,
    implementationMonth: implementationDate.slice(0, 7),
    datePrecision,
    occurrenceId: null,
    confounderGroupId: null,
    treatmentScopeKind: "atomic",
    componentTreatmentFamilies: [],
    provenance: [{
      sourceKind: "registry",
      sourceId: treatmentFamily === "bus_lane" ? "nyc_dot_bus_lanes" : "fixture_registry",
      sourceEventId: `event:${candidateId}`,
      releaseId: null,
      manifestSha256: null,
      artifactSha256: null,
      occurrenceId: null,
      occurrenceReviewDecisionId: null,
      gtfsRouteId: null,
      analysisRouteId: routeId,
      routeEvidenceBindings: [],
      treatmentEvidenceBindings: [],
    }],
    conflictState: "none",
  };
}

function identity(row: ReturnType<typeof candidate>): string {
  return `${row.routeId}|${row.treatmentFamily}|${row.implementationDate}|${row.datePrecision}`;
}

function recommendation(
  row: ReturnType<typeof candidate>,
  decision: "recommend_reject" | "recommend_approve",
  gates: Partial<Record<"evidenceScope" | "date" | "spine" | "outcome" | "conflict" | "confounder", string>> = {},
) {
  return {
    sourceBatchId: "fixture",
    authorization: "non_authorizing_recommendation_only",
    candidateId: row.candidateId,
    identity: identity(row),
    routeId: row.routeId,
    treatmentFamily: row.treatmentFamily,
    implementationDate: row.implementationDate,
    recommendation: decision,
    rationale: "fixture",
    gates: {
      evidenceScope: "pass_fixture",
      date: "pass_fixture",
      spine: "pass_series_ready",
      outcome: "pass_6_pre_6_post_calendar_months",
      conflict: "pass_none",
      confounder: "not_identified",
      ...gates,
    },
  };
}

function hardDecision(
  row: ReturnType<typeof candidate>,
  decision: "recommend_reject" | "deep_review_required",
  spineReadiness: "series_ready" | "needs_pattern_review",
  calendarMinimumFourPerSide: boolean,
) {
  return {
    candidateId: row.candidateId,
    identity: identity(row),
    recommendation: decision,
    rationale: "fixture",
    hardGateFacts: {
      spineReadiness,
      spineReasons: spineReadiness === "needs_pattern_review" ? ["partial_months_require_pattern_grouping"] : ["full_spine_coverage_all_months"],
      preMonthCount: calendarMinimumFourPerSide ? 6 : 0,
      postMonthCount: 6,
      calendarMinimumFourPerSide,
    },
  };
}

function fixture(): { paths: Rc19ReconciliationPaths; expected: Rc19ReconciliationExpectations } {
  const dir = join(work, "fixture");
  mkdirSync(dir, { recursive: true });
  const candidateSetId = "candidate-set-v2:fixture";
  const spine = candidate("study-event-v2:fixture-spine", "B1", "route_redesign", "2024-01-01");
  const calendar = candidate("study-event-v2:fixture-calendar", "B2", "route_redesign", "2026-02-01");
  const gunHill = candidate("study-event-v2:06559cef3f03e1672b7dd685", "BX28", "bus_lane", "2023-10-31");
  const laterAce = candidate("study-event-v2:fixture-later-ace", "M23+", "automated_bus_lane_enforcement", "2024-06-20");
  const approved = candidate("study-event-v2:fixture-approved", "M1", "off_board_fare_collection", "2024-01-01");
  const candidates = [spine, calendar, gunHill, laterAce, approved];
  const candidateSetPath = join(dir, "candidate-set.json");
  const candidateSetSha256 = writeJson(candidateSetPath, { candidateSetId, candidates });

  const recommendations = [
    recommendation(spine, "recommend_reject", { spine: "fail_needs_pattern_review" }),
    recommendation(calendar, "recommend_reject", { outcome: "fail_0_pre_6_post_calendar_months" }),
    recommendation(gunHill, "recommend_reject", {
      evidenceScope: "fail_proximity_only_missing_exact_route_treatment_and_lane_overlap_binding",
      spine: "fail_exact_lane_overlap_spine_missing_route_spine_series_ready",
    }),
    recommendation(laterAce, "recommend_reject", {
      evidenceScope: "fail_later_ace_phase_after_prior_able_onset_2020_08_10",
      conflict: "fail_later_phase_after_prior_able_2020_08_10",
    }),
    recommendation(approved, "recommend_approve"),
  ];
  const reconciliationPath = join(dir, "reconciliation.json");
  const reconciliationSha256 = writeJson(reconciliationPath, { candidateSetId, recommendations });

  const hardGatePath = join(dir, "hard-gate.json");
  const hardGateSha256 = writeJson(hardGatePath, {
    candidateSetId,
    candidateSetSha256,
    decisions: [
      hardDecision(spine, "recommend_reject", "needs_pattern_review", true),
      hardDecision(calendar, "recommend_reject", "series_ready", false),
      hardDecision(gunHill, "deep_review_required", "series_ready", true),
      hardDecision(laterAce, "deep_review_required", "series_ready", true),
      hardDecision(approved, "deep_review_required", "series_ready", true),
    ],
  });
  const deepReviewPath = join(dir, "deep-review.json");
  const deepReviewSha256 = writeJson(deepReviewPath, {
    candidateSetId,
    candidateSetSha256,
    candidates: [gunHill, laterAce, approved].map((row) => ({ candidateId: row.candidateId, identity: identity(row) })),
  });
  const rc19ManifestPath = join(dir, "manifest.json");
  const generatorCommit = "fixture-generator-commit";
  const occurrenceArtifactSha256 = "fixture-occurrence-artifact-sha256";
  const manifestSha256 = writeJson(rc19ManifestPath, {
    release_id: "v1-rc19",
    generator_commit: generatorCommit,
    files: { "operational_occurrences.jsonl": { sha256: occurrenceArtifactSha256 } },
  });
  const auditPath = join(dir, "audit.json");
  const auditSha256 = writeJson(auditPath, {
    inputHashes: {
      candidateSet: candidateSetSha256,
      reviewReconciliation: reconciliationSha256,
      wikiManifest: manifestSha256,
      occurrenceSource: occurrenceArtifactSha256,
    },
    release: {
      generatorCommit,
      selectedViaLatest: false,
      promotedAtAuditTime: false,
    },
  });
  return {
    paths: { candidateSetPath, reconciliationPath, auditPath, hardGatePath, deepReviewPath, rc19ManifestPath },
    expected: {
      candidateSetId,
      candidateSetSha256,
      reconciliationSha256,
      auditSha256,
      hardGateSha256,
      deepReviewSha256,
      manifestSha256,
      generatorCommit,
      occurrenceArtifactSha256,
      candidateCount: 5,
      rejectedCount: 4,
      approvedRecommendationCount: 1,
      hardRejectCount: 2,
      deepReviewInputCount: 3,
      deepRejectCount: 2,
      mechanicalSpineOnlyCount: 1,
      mechanicalSpineCalendarCount: 0,
      mechanicalCalendarOnlyCount: 1,
      assertRc19DeepComposition: false,
      sourceFixCandidateIds: [gunHill.candidateId],
    },
  };
}

describe("rc19 reject reconciliation", () => {
  it("joins every reject once, preserves the mechanical partition, and keeps Gun Hill completion-phase repair out of the onset projection", () => {
    const { paths, expected } = fixture();
    const first = buildRc19RejectReconciliation(paths, expected);
    const second = buildRc19RejectReconciliation(paths, expected);
    expect(first).toEqual(second);
    expect(first.ledger).toHaveLength(4);
    expect(first.ledger.map((row) => row.candidate_id)).toEqual([...first.ledger.map((row) => row.candidate_id)].sort());
    expect(first.summary.mechanical_partition).toEqual({ spine_only: 1, spine_plus_calendar: 0, calendar_only: 1, deep_review: 2 });

    const repaired = first.ledger.find((row) => row.candidate_id === "study-event-v2:06559cef3f03e1672b7dd685");
    expect(repaired?.source_fix?.status).toBe("source_scope_and_completion_phase_repaired_not_projectable");
    expect(repaired?.source_fix?.occurrence_id).toBeNull();
    expect(repaired?.source_fix?.resolved_completion_phase_date).toBe("2023-10-31");
    expect(repaired?.source_fix?.first_operational_onset).toBeNull();
    expect(repaired?.exclusive_primary_disposition).toBe("tracker_exact_lane_overlap_spine_gap");
    expect(repaired?.nonexclusive_reasons_after_mta_actions).not.toContain("mta_route_or_treatment_scope_binding_gap");
    expect(repaired?.nonexclusive_reasons_after_mta_actions).toContain("producer_contract_or_projection_gap");
    expect(repaired?.nonexclusive_reasons_after_mta_actions).toContain("tracker_exact_lane_overlap_spine_gap");
    expect(first.ledger.every((row) => row.source_evidence_hashes.includes(expected.candidateSetSha256))).toBeTrue();

    const later = first.ledger.find((row) => row.candidate_id === "study-event-v2:fixture-later-ace");
    expect(later?.exclusive_primary_disposition).toBe("intentionally_invalid_or_duplicate_phase");
    expect(first.acePhaseIdentities[0]?.prior_able_onset).toBe("2020-08-10");
    expect(first.summary.fully_source_fixed_count).toBe(0);

    const files = writeRc19RejectReconciliation(join(work, "output-a"), first);
    const secondFiles = writeRc19RejectReconciliation(join(work, "output-b"), second);
    expect(readFileSync(files.ledger!, "utf8").trim().split("\n")).toHaveLength(4);
    for (const key of Object.keys(files)) {
      expect(readFileSync(files[key]!, "utf8")).toBe(readFileSync(secondFiles[key]!, "utf8"));
    }
    const manifest = JSON.parse(readFileSync(files.manifest!, "utf8")) as { rejected_candidate_count: number; files: Record<string, { sha256: string }> };
    expect(manifest.rejected_candidate_count).toBe(4);
    expect(Object.keys(manifest.files)).toHaveLength(6);
    const report = readFileSync(files.report!, "utf8");
    expect(report).toContain("Rejected candidate identities reconciled: **4**");
    expect(report).toContain("authoritative route/treatment/segment scope and completion-phase date repaired: **1**");
    expect(report).toContain("fully unblocked or made authorizing by MTA Wiki changes: **0**");
    expect(report).toContain("Candidate identities that remain non-authorizing: **4**");
    expect(report).toContain("This is an inference until a pinned Tracker replay verifies it.");
    expect(report).toContain("This reconciliation does not mutate `LATEST`");
    expect(report).toContain("| tracker_exact_lane_overlap_spine_gap | 1 |");
    expect(report).toContain("| tracker_exact_lane_overlap_spine_gap | 1 | 1 |");
  });

  it("fails closed when a pinned input changes", () => {
    const { paths, expected } = fixture();
    writeFileSync(paths.candidateSetPath, `${readFileSync(paths.candidateSetPath, "utf8")} `, "utf8");
    expect(() => buildRc19RejectReconciliation(paths, expected)).toThrow("candidate set SHA-256 mismatch");
  });
});
