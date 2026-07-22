import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";

const TRACKER_REPO = "/mnt/models/dev/bus-reliability-tracker";
const TRACKER_COMMIT = "ce166a23f7db1b0b94659e1fbc88cb9c306213a9";
const OUTPUT_PATH = join(
  repoRoot,
  "data/quality/study-readiness/v1/tracker-rc26-input.json",
);

const TRACKER_INPUTS = {
  candidate_set: {
    path: "docs/research/artifacts/candidate-set-v3-80050ed598f3b2ab0d0a1e99.study-events.json",
    sha256: "fe4d3ce9fa9f73f660256034afa497a8a8935f3471c083358a171f5f719e5363",
  },
  approval_receipt: {
    path: "data/study-event-approvals/receipts/candidate-set-v3-80050ed598f3b2ab0d0a1e99.approval.json",
    sha256: "00f2fb5e97969a986c9b07a30c9e9b3920066c80356404cfddbdcefba14d89de",
  },
  scope_bindings: {
    path: "data/study-event-approvals/scope-bindings/candidate-set-v3-80050ed598f3b2ab0d0a1e99.scope-bindings.json",
    sha256: "b9cfcf9e048e32b8080138debaa6c876bd5e21a0340b4894ec13454f169faf25",
  },
  review_worksheet: {
    path: "data/study-event-approvals/reviews/candidate-set-v3-80050ed598f3b2ab0d0a1e99.review-worksheet.json",
    sha256: "b0577fc4d9eb44e62edfdd378eea2205884c5c5232e6edb3c649c5507f66aec5",
  },
  rc26_reconciliation: {
    path: "docs/research/reviews/rc26/rc26-review-reconciliation.json",
    sha256: "171696a8f6ccb5e9be1c8f936067e5b6706fd8c2d14d647e48f6cbf01e1bef7e",
  },
  tracker_import: {
    path: "docs/research/artifacts/mta-wiki-v1-rc26.operational-occurrences-import.json",
    sha256: "b9c41aafb499b3cf3c8b5e74192be64b1615393d50c5d2cf4edc66260857d6cd",
  },
  rc25_input_manifest: {
    path: "docs/research/reviews/rc25/inputs/manifest.json",
    sha256: "d88e6e35d2e59863ea90482ec6a862861b93c6455326d8c74e5f503ea56b6510",
  },
  rc25_spine_snapshot: {
    path: "docs/research/reviews/rc25/inputs/spine-snapshot.json",
    sha256: "51ae50845d0cd58eca432d76f729247efaeb335aee4049752583be5211ff91b8",
  },
  rc25_non_bus_lane: {
    path: "docs/research/reviews/rc25/inputs/10-non-bus-lane-161.input.json",
    sha256: "0254f69d8865d5e7cd55e9c714e3a2acb316fb59676f10400f3e9edbd82c140a",
  },
  rc25_bus_lane_000_161: {
    path: "docs/research/reviews/rc25/inputs/20-bus-lane-000-161.input.json",
    sha256: "53b45f3eeb15ba5ed9eac957fb65c4b30974a75dfc6a03acaf38c0d818d382cf",
  },
  rc25_bus_lane_162_324: {
    path: "docs/research/reviews/rc25/inputs/30-bus-lane-162-324.input.json",
    sha256: "1e95c11151a4bfed8d1c44951a47b319fd6b77878b68ad5e599c2dd1104bee75",
  },
} as const;

const PRODUCER_INPUTS = {
  release_manifest: {
    path: "data/exports/releases/v1-rc26/manifest.json",
    sha256: "c1792d1cbfdf498ea0481fa2374202b634dc2deea532f87a600390c6da382dc0",
  },
  operational_occurrences: {
    path: "data/exports/releases/v1-rc26/operational_occurrences.jsonl",
    sha256: "6cb8654efee370d7444405ce3a0cdb8ce6fa394e6ada2347982cbec49df701ef",
  },
} as const;

type JsonObject = Record<string, unknown>;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function trackerBytes(path: string, expectedSha256: string): string {
  const value = execFileSync(
    "git",
    ["-C", TRACKER_REPO, "show", `${TRACKER_COMMIT}:${path}`],
    { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  );
  const actual = sha256(value);
  if (actual !== expectedSha256) {
    throw new Error(`${path}: expected ${expectedSha256}, received ${actual}`);
  }
  return value;
}

function producerPin(path: string, expectedSha256: string) {
  const absolute = join(repoRoot, path);
  const value = readFileSync(absolute);
  const actual = sha256(value);
  if (actual !== expectedSha256) {
    throw new Error(`${path}: expected ${expectedSha256}, received ${actual}`);
  }
  return { path, bytes: value.byteLength, sha256: actual };
}

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}: expected object`);
  }
  return value as JsonObject;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label}: expected array`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label}: expected string`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  return value === null ? null : string(value, label);
}

function selectedProvenance(candidate: JsonObject): JsonObject | null {
  const entries = array(candidate.provenance, "candidate.provenance").map((entry, index) =>
    object(entry, `candidate.provenance[${index}]`));
  return entries.find((entry) => entry.sourceKind === "mta_wiki") ?? null;
}

function normalizeProvenance(candidate: JsonObject): JsonObject | null {
  const provenance = selectedProvenance(candidate);
  if (!provenance) return null;
  return {
    source_id: provenance.sourceId,
    occurrence_id: provenance.occurrenceId,
    occurrence_review_decision_id: provenance.occurrenceReviewDecisionId,
    route_record_id: provenance.wikiRouteRecordId,
    gtfs_route_id: provenance.gtfsRouteId,
    route_evidence_bindings: provenance.routeEvidenceBindings,
    treatment_evidence_bindings: provenance.treatmentEvidenceBindings,
    phase_record_ids: provenance.phaseRecordIds,
    phase_relation_record_ids: provenance.phaseRelationRecordIds,
    phase_relation_disposition: provenance.phaseRelationDisposition,
    phase_relation_evidence_bindings: provenance.phaseRelationEvidenceBindings,
    physical_scope_record_ids: provenance.physicalScopeRecordIds,
    physical_scope_relation_record_ids: provenance.physicalScopeRelationRecordIds,
    physical_scope_evidence_bindings: provenance.physicalScopeEvidenceBindings,
    manifest_sha256: provenance.manifestSha256,
    occurrence_artifact_sha256: provenance.artifactSha256,
    relationship_bundle_sha256: provenance.relationshipBundleSha256,
  };
}

function normalizedAdmission(value: JsonObject | undefined): JsonObject | null {
  if (!value) return null;
  const spine = value.spine ? object(value.spine, "currentAdmission.spine") : null;
  const outcome = value.outcomeWindow
    ? object(value.outcomeWindow, "currentAdmission.outcomeWindow")
    : null;
  return {
    scope: value.scope ?? null,
    spine: spine
      ? {
        artifact_path: spine.artifactPath,
        artifact_sha256: spine.artifactSha256,
        readiness: spine.readiness,
        reasons: spine.reasons,
        month_count: spine.monthCount,
      }
      : null,
    outcome_window: outcome
      ? {
        analysis_month: outcome.analysisMonth,
        pre_months: outcome.preMonths,
        post_months: outcome.postMonths,
        pre_month_count: outcome.preMonthCount,
        post_month_count: outcome.postMonthCount,
        calendar_minimum_four_per_side: outcome.calendarMinimumFourPerSide,
      }
      : null,
    nearby_same_route_candidates: value.nearbySameRouteCandidates ?? [],
  };
}

function main(): void {
  const check = process.argv.includes("--check");
  const trackerDocuments = new Map<string, JsonObject>();
  const trackerPins = Object.entries(TRACKER_INPUTS).map(([role, pin]) => {
    const bytes = trackerBytes(pin.path, pin.sha256);
    trackerDocuments.set(role, object(JSON.parse(bytes), role));
    return {
      role,
      repository: TRACKER_REPO,
      commit: TRACKER_COMMIT,
      path: pin.path,
      bytes: Buffer.byteLength(bytes),
      sha256: pin.sha256,
    };
  });

  const candidatesDocument = trackerDocuments.get("candidate_set")!;
  const receiptDocument = trackerDocuments.get("approval_receipt")!;
  const scopeDocument = trackerDocuments.get("scope_bindings")!;
  const reconciliation = trackerDocuments.get("rc26_reconciliation")!;
  const candidates = array(candidatesDocument.candidates, "candidate_set.candidates")
    .map((value, index) => object(value, `candidate[${index}]`));
  const decisions = new Map(
    array(receiptDocument.decisions, "approval_receipt.decisions").map((value, index) => {
      const decision = object(value, `decision[${index}]`);
      return [string(decision.candidateId, "decision.candidateId"), decision];
    }),
  );
  const scopes = new Map(
    array(scopeDocument.bindings, "scope_bindings.bindings").map((value, index) => {
      const binding = object(value, `scope binding[${index}]`);
      return [string(binding.candidateId, "scope binding.candidateId"), binding];
    }),
  );

  const rc25Rows = [
    "rc25_non_bus_lane",
    "rc25_bus_lane_000_161",
    "rc25_bus_lane_162_324",
  ].flatMap((role) => array(trackerDocuments.get(role)!.candidates, `${role}.candidates`))
    .map((value, index) => object(value, `rc25 candidate[${index}]`));
  const rc25ByCandidate = new Map(
    rc25Rows.map((row) => [string(row.candidateId, "rc25 candidateId"), row]),
  );
  const revisedPriorIds: Record<string, string> = {
    "study-event-v2:6b70c52e0eec23eb63cab94f": "study-event-v2:e1d437f15fa4caee51760675",
    "study-event-v2:d70a3ee36eb94ae88732065f": "study-event-v2:bc870a23ee602a9ea28d9160",
  };

  const rows = candidates.map((candidate) => {
    const candidateId = string(candidate.candidateId, "candidate.candidateId");
    const decision = decisions.get(candidateId);
    if (!decision) throw new Error(`${candidateId}: missing rc26 decision`);
    const directContext = rc25ByCandidate.get(candidateId);
    const priorContext = revisedPriorIds[candidateId]
      ? rc25ByCandidate.get(revisedPriorIds[candidateId]!)
      : undefined;
    const context = directContext ?? priorContext;
    const admission = context?.currentAdmission
      ? normalizedAdmission(object(context.currentAdmission, `${candidateId}.currentAdmission`))
      : null;
    if (priorContext && admission) {
      const outcome = object(admission.outcome_window, `${candidateId}.outcome_window`);
      outcome.pre_months = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09"];
      outcome.post_months = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];
      outcome.pre_month_count = 6;
      outcome.post_month_count = 5;
      outcome.calendar_minimum_four_per_side = true;
      const scope = object(admission.scope, `${candidateId}.scope`);
      scope.status = "admitted";
      scope.scope = "bounded_segment";
      scope.evidence = "mta_wiki_rc26_exact_scope_binding";
    }
    return {
      candidate_id: candidateId,
      identity: `${string(candidate.routeId, "candidate.routeId")}|${string(candidate.treatmentFamily, "candidate.treatmentFamily")}|${string(candidate.implementationDate, "candidate.implementationDate")}|${string(candidate.datePrecision, "candidate.datePrecision")}`,
      route_id: candidate.routeId,
      treatment_family: candidate.treatmentFamily,
      implementation_date: candidate.implementationDate,
      implementation_month: candidate.implementationMonth,
      date_precision: candidate.datePrecision,
      occurrence_id: nullableString(candidate.occurrenceId, "candidate.occurrenceId"),
      conflict_state: candidate.conflictState,
      confounder_group_id: candidate.confounderGroupId,
      treatment_scope_kind: candidate.treatmentScopeKind,
      component_treatment_families: candidate.componentTreatmentFamilies,
      decision: decision.decision,
      decision_rationale: decision.rationale,
      current_provenance: normalizeProvenance(candidate),
      current_scope_binding: scopes.get(candidateId) ?? null,
      current_admission: admission,
      structured_context_source: directContext
        ? "rc25_preserved_by_rc26_reconciliation"
        : priorContext
        ? "rc26_revised_with_rc25_spine_context"
        : "rc26_only",
      prior_candidate_id: revisedPriorIds[candidateId] ?? null,
    };
  }).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));

  if (rows.length !== 484 || decisions.size !== 484) {
    throw new Error(`Expected 484 candidates and decisions, received ${rows.length}/${decisions.size}`);
  }
  const approved = rows.filter((row) => row.decision === "approved").length;
  if (approved !== 7) throw new Error(`Expected 7 approvals, received ${approved}`);
  if (reconciliation.summary && object(reconciliation.summary, "reconciliation.summary").preservedDecisionCount !== 482) {
    throw new Error("rc26 reconciliation does not preserve 482 decisions");
  }

  const output = `${JSON.stringify({
    schema_version: 1,
    artifact_kind: "mta_wiki.study_readiness_tracker_input.v1",
    doctrine: {
      authorizes_study: false,
      authorizes_cross_product: false,
      statement: "Read-only normalized evidence from pinned Tracker rc26 review inputs. Candidate fields and review decisions are not producer authority and never authorize inferred route/treatment cross-products.",
    },
    producer_baseline: {
      release_id: "v1-rc26",
      producer_commit: "832242cf4083d107dc19ef64213ed69b07247b6b",
      pins: Object.entries(PRODUCER_INPUTS).map(([role, pin]) => ({
        role,
        ...producerPin(pin.path, pin.sha256),
      })),
    },
    tracker_baseline: {
      repository: TRACKER_REPO,
      commit: TRACKER_COMMIT,
      candidate_set_id: candidatesDocument.candidateSetId,
      pins: trackerPins,
    },
    summary: {
      candidate_count: rows.length,
      approved_count: approved,
      rejected_count: rows.length - approved,
      structured_rc25_preserved_count: rows.filter((row) =>
        row.structured_context_source === "rc25_preserved_by_rc26_reconciliation").length,
      rc26_revised_count: rows.filter((row) =>
        row.structured_context_source === "rc26_revised_with_rc25_spine_context").length,
    },
    rows,
  }, null, 2)}\n`;

  if (check) {
    if (!existsSync(OUTPUT_PATH) || readFileSync(OUTPUT_PATH, "utf8") !== output) {
      throw new Error(`${OUTPUT_PATH}: generated content is stale`);
    }
    console.log(`tracker_rc26_input=ok rows=${rows.length} sha256=${sha256(output)}`);
    return;
  }
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, output, "utf8");
  console.log(stableJson({ output_path: OUTPUT_PATH, row_count: rows.length, sha256: sha256(output) } as JsonValue));
}

main();
