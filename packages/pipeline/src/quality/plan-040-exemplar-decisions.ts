import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableHash, stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  type HistoricalCandidateFactRef,
  type HistoricalCandidateSupportRow,
  type HistoricalFullStopDossier,
} from "../reference/historical-full-stop.js";
import { fileSha256 } from "../reference/snapshot-registry.js";
import {
  MEMBER_GRAIN_DECISION_CONTRACT_ID,
  parseMemberGrainDecision,
  type MemberGrainDecision,
  type MemberGrainLineageSegment,
  type MemberGrainServiceScope,
} from "./member-grain-decisions.js";
import {
  validateMemberExtentDecision,
  type ExactEvidenceBinding,
  type MemberExtentComponent,
  type MemberExtentDecision,
  type MemberExtentRow,
} from "./study-readiness-v1.js";

export const PLAN_040_EXEMPLAR_DRAFT_PATH = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk/plan-040-exemplar-decision-draft-v1.json",
);
export const PLAN_040_EXEMPLAR_REVIEW_GATE_PATH = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk/plan-040-exemplar-dual-review-gate-v1.json",
);
export const PLAN_040_EXEMPLAR_OWNER_ACCEPTANCE_PATH = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk/plan-040-exemplar-owner-acceptance-v1.json",
);
export const PLAN_040_EXEMPLAR_EXTENT_DECISIONS_PATH = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-ledger-decisions/plan-040-exemplar-v1.json",
);
export const PLAN_040_EXEMPLAR_GRAIN_DECISIONS_PATH = join(
  repoRoot,
  "data/quality/operational-reference/member-grain-decisions/plan-040-exemplar-v1.json",
);
const ACCEPTANCE_PATH = join(
  repoRoot,
  "data/quality/operational-reference/historical-full-stop/acceptance-manifest-v2.json",
);
const EVIDENCE_GATE_PATH = join(
  repoRoot,
  "data/quality/operational-reference/historical-full-stop/dual-review-gate-v2.json",
);
const EVIDENCE_OWNER_ACCEPTANCE_PATH = join(
  repoRoot,
  "data/quality/operational-reference/historical-full-stop/owner-acceptance-v2.json",
);
const COMPANION_PATH = join(
  repoRoot,
  "data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl",
);
const DOSSIER_ROOT = join(
  repoRoot,
  "data/quality/operational-reference/historical-full-stop",
);

const DRAFT_REVIEWED_AT = "1970-01-01T00:00:00Z";
const DRAFT_REVIEWED_BY = "pending-plan-040-risk-review";

type CandidateAcceptance = {
  candidate_support_rows: HistoricalCandidateSupportRow[];
  covered_candidate_count: number;
  decision_authority: false;
  occurrence_authority: false;
  package_input_pins: Array<{ path: string; sha256: string }>;
};

export type Plan040ExemplarDecisionDraft = {
  schema_version: 1;
  package_id: "plan-040-exemplar-decision-draft-v1";
  authorization_state: "draft_pending_dual_independent_risk_review";
  evidence_acceptance: { path: string; sha256: string };
  evidence_gate: { path: string; sha256: string };
  evidence_owner_acceptance: { path: string; sha256: string };
  companion: { path: string; sha256: string };
  candidate_count: number;
  extent_decision_count: number;
  grain_decision_count: number;
  spatial_resolution_distribution: Record<string, number>;
  extent_decisions: MemberExtentDecision[];
  grain_decisions: MemberGrainDecision[];
  replay_hash: string;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

type Plan040ExemplarOwnerAcceptance = {
  schema_version: 1;
  accepted_at: string;
  accepted_by: string;
  gate: { path: string; sha256: string };
  draft: { path: string; sha256: string; replay_hash: string };
  candidate_count: 11;
  authorization_state: "owner_accepted_decision_persistence_only";
  authorizes_decision_persistence: true;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

function key(value: {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
}): string {
  return `${value.occurrence_id}\0${value.route_record_id}\0${value.treatment_record_id}`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function stableSort<T>(values: readonly T[]): T[] {
  return [...values].sort((left, right) =>
    stableJson(left as unknown as JsonValue).localeCompare(stableJson(right as unknown as JsonValue)));
}

function readCompanion(): MemberExtentRow[] {
  return readFileSync(COMPANION_PATH, "utf8").split(/\r?\n/u).flatMap((line) =>
    line.trim() ? [JSON.parse(line) as MemberExtentRow] : []);
}

function readDossier(file: string): HistoricalFullStopDossier {
  return JSON.parse(readFileSync(join(DOSSIER_ROOT, file), "utf8")) as HistoricalFullStopDossier;
}

function referenceSources(row: HistoricalCandidateSupportRow): string[] {
  switch (row.gtfs_route_id) {
    case "Q61":
      if (row.treatment_record_id.includes("-q15-")) {
        return [
          "gtfs_static_20250615_queens_pre_qbnr",
          "gtfs_static_20250626_queens_post_qbnr",
        ];
      }
      if (row.treatment_record_id.includes("-q34-")) {
        return [
          "gtfs_static_20250625_busco_pre_qbnr",
          "gtfs_static_20250626_queens_post_qbnr",
        ];
      }
      return [
        "gtfs_static_20250615_queens_pre_qbnr",
        "gtfs_static_20250625_busco_pre_qbnr",
        "gtfs_static_20250626_queens_post_qbnr",
      ];
    case "QM44":
      return [
        "gtfs_static_20250625_busco_pre_qbnr",
        "gtfs_static_20250626_busco_post_qbnr",
      ];
    case "QM64":
      return [
        "gtfs_static_20250615_queens_pre_qbnr",
        "gtfs_static_20250626_queens_post_qbnr",
      ];
  }
}

function evidenceBindings(
  current: MemberExtentRow,
  support: HistoricalCandidateSupportRow,
): ExactEvidenceBinding[] {
  return [
    ...current.evidence_bindings,
    ...referenceSources(support).map((sourceId) => ({
      role: "reference_snapshot",
      record_id: support.treatment_record_id,
      source_id: sourceId,
      evidence_id: `${sourceId}#p001_b0001`,
    })),
  ].sort((left, right) =>
    [left.role, left.record_id, left.source_id, left.evidence_id].join("\0")
      .localeCompare([right.role, right.record_id, right.source_id, right.evidence_id].join("\0")));
}

function segmentComponents(
  support: HistoricalCandidateSupportRow,
  description: (ref: HistoricalCandidateFactRef) => string,
): MemberExtentComponent[] {
  const seen = new Set<string>();
  return support.fact_refs.flatMap((ref) => {
    const identity = `${ref.direction}\0${ref.identifiers.join("\0")}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [{
      component_kind: "segment" as const,
      identity_namespace: "source_literal_v1" as const,
      identifiers: uniqueSorted(ref.identifiers),
      description: description(ref),
    }];
  });
}

function spatialDecisionId(treatmentRecordId: string): string {
  return `member-extent-review:plan040-${treatmentRecordId.replace(/^treatment_/u, "").replace(/-2025$/u, "")}`;
}

function grainDecisionId(treatmentRecordId: string): string {
  return `member-grain-review:plan040-${treatmentRecordId.replace(/^treatment_/u, "").replace(/-2025$/u, "")}`;
}

function buildExtentDecision(
  current: MemberExtentRow,
  support: HistoricalCandidateSupportRow,
): MemberExtentDecision | null {
  if (support.historical_evidence_verdict === "route_rename_supported") {
    if (current.extent !== "route_wide" || !current.decision_id) {
      throw new Error(`${support.treatment_record_id}: route rename lost its existing positive decision`);
    }
    return null;
  }
  let resolution: MemberExtentDecision["resolution"];
  let components: MemberExtentComponent[];
  switch (support.historical_evidence_verdict) {
    case "bounded_segment_supported":
      resolution = "bounded_segment";
      components = segmentComponents(
        support,
        (ref) => `${support.gtfs_route_id} direction ${ref.direction} exact ordered segment from ${ref.fact_id}.`,
      );
      break;
    case "lineage_supported":
      resolution = "bounded_segment";
      components = segmentComponents(
        support,
        (ref) => `${support.gtfs_route_id} direction ${ref.direction} predecessor correspondence from ${ref.fact_id}.`,
      );
      break;
    case "service_scope_supported":
      resolution = "route_wide";
      components = [{
        component_kind: "route",
        identity_namespace: "canonical_record",
        identifiers: [support.route_record_id],
        description: `${support.gtfs_route_id} physical route extent; structured period and direction scope is in the paired grain decision.`,
      }];
      break;
    case "stop_set_supported":
      resolution = "stop_set";
      components = [{
        component_kind: "stop",
        identity_namespace: "source_literal_v1",
        identifiers: uniqueSorted(support.fact_refs.flatMap((ref) => ref.identifiers)),
        description: `${support.gtfs_route_id} exact candidate-specific stop set from ${support.fact_refs.map((ref) => ref.fact_id).join(", ")}.`,
      }];
      break;
    default:
      throw new Error(`${support.treatment_record_id}: unsupported spatial verdict`);
  }
  const decision: MemberExtentDecision = {
    decision_id: spatialDecisionId(support.treatment_record_id),
    occurrence_id: support.occurrence_id,
    route_record_id: support.route_record_id,
    treatment_record_id: support.treatment_record_id,
    resolution,
    components,
    evidence_bindings: evidenceBindings(current, support),
    missing_roles: [],
    rationale:
      `Owner-accepted historical evidence gate dual-review-gate-v2 binds this candidate to ` +
      `${support.fact_refs.map((ref) => ref.fact_id).join(", ")} without occurrence or study authority.`,
    reviewed_at: DRAFT_REVIEWED_AT,
    reviewed_by: DRAFT_REVIEWED_BY,
  };
  validateMemberExtentDecision(decision);
  return decision;
}

function comparisonLineage(
  dossier: HistoricalFullStopDossier,
  predecessor: string,
  successor: string,
): MemberGrainLineageSegment[] {
  const seen = new Set<string>();
  return stableSort(dossier.comparisons.flatMap((comparison) => {
    if (comparison.before_route_id !== predecessor || comparison.after_route_id !== successor) return [];
    const segment: MemberGrainLineageSegment = {
      predecessor_gtfs_route_id: predecessor,
      successor_gtfs_route_id: successor,
      direction: comparison.direction_id,
      boundary_stop_ids: uniqueSorted(comparison.boundary_stop_ids) as [string, string],
      shared_stop_ids: uniqueSorted(comparison.shared_stop_ids),
    };
    const identity = stableJson(segment as unknown as JsonValue);
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [segment];
  }));
}

function grainScope(
  support: HistoricalCandidateSupportRow,
  q61: HistoricalFullStopDossier,
  qm44: HistoricalFullStopDossier,
  qm64: HistoricalFullStopDossier,
): MemberGrainServiceScope {
  const patternIds = (dossier: HistoricalFullStopDossier, routeIds: readonly string[], direction?: string) =>
    uniqueSorted(dossier.patterns.filter((pattern) =>
      routeIds.includes(pattern.route_id) && (direction === undefined || pattern.direction_id === direction))
      .map((pattern) => pattern.pattern_id));
  switch (support.treatment_record_id) {
    case "treatment_qm44-frequency-decrease-2025":
      return {
        kind: "periods",
        periods: ["am_peak"],
        directions: ["1"],
        pattern_ids: patternIds(qm44, ["QM44"], "1"),
      };
    case "treatment_qm44-stop-removal-2025":
      return {
        kind: "trip_subset",
        periods: ["am_peak", "pm_peak"],
        directions: ["0", "1"],
        pattern_ids: patternIds(qm44, ["QM44"]),
        description: "All exact active QM44 revenue patterns in the before/after target slices.",
      };
    case "treatment_qm64-avenue-service-discontinuation-2025":
    case "treatment_qm64-midtown-stop-additions-2025":
      return {
        kind: "trip_subset",
        periods: ["am_peak", "off_period"],
        directions: ["1"],
        pattern_ids: patternIds(qm64, ["QM64", "X64"], "1"),
        description: "Exact Midtown-bound X64/QM64 revenue patterns in the before/after target slices.",
      };
    case "treatment_qm64-frequency-decrease-2025":
      return {
        kind: "periods",
        periods: ["am_peak"],
        directions: ["1"],
        pattern_ids: patternIds(qm64, ["QM64", "X64"], "1"),
      };
    case "treatment_qm64-elmont-extension-2025":
    case "treatment_qm64-route-rename-2025":
    case "treatment_qm64-stop-removal-2025":
      return {
        kind: "trip_subset",
        periods: ["am_peak", "off_period", "pm_peak"],
        directions: ["0", "1"],
        pattern_ids: patternIds(qm64, ["QM64", "X64"]),
        description: "All exact active X64/QM64 revenue patterns in the before/after target slices.",
      };
    default:
      if (support.gtfs_route_id === "Q61") {
        return {
          kind: "trip_subset",
          periods: ["weekend"],
          directions: ["0", "1"],
          pattern_ids: patternIds(q61, ["Q61"]),
          description: "Exact active Q61 revenue patterns on the implementation-date weekend slice.",
        };
      }
      throw new Error(`${support.treatment_record_id}: no structured service scope`);
  }
}

function grainLineage(
  support: HistoricalCandidateSupportRow,
  q61: HistoricalFullStopDossier,
  qm64: HistoricalFullStopDossier,
): MemberGrainLineageSegment[] {
  if (support.gtfs_route_id === "QM64") return comparisonLineage(qm64, "X64", "QM64");
  if (support.treatment_record_id === "treatment_q61-q15-beechhurst-replacement-2025") {
    return comparisonLineage(q61, "Q15", "Q61");
  }
  if (support.treatment_record_id === "treatment_q61-q34-linden-hill-replacement-2025") {
    return comparisonLineage(q61, "Q34", "Q61");
  }
  if (support.treatment_record_id === "treatment_q61-beechhurst-flushing-connection-2025") {
    return stableSort([
      ...comparisonLineage(q61, "Q15", "Q61"),
      ...comparisonLineage(q61, "Q34", "Q61"),
    ]);
  }
  return [];
}

function buildGrainDecision(
  current: MemberExtentRow,
  support: HistoricalCandidateSupportRow,
  extentDecisionId: string,
  q61: HistoricalFullStopDossier,
  qm44: HistoricalFullStopDossier,
  qm64: HistoricalFullStopDossier,
): MemberGrainDecision {
  return parseMemberGrainDecision({
    schema_version: 1,
    contract_id: MEMBER_GRAIN_DECISION_CONTRACT_ID,
    decision_id: grainDecisionId(support.treatment_record_id),
    occurrence_id: support.occurrence_id,
    route_record_id: support.route_record_id,
    gtfs_route_id: support.gtfs_route_id,
    treatment_record_id: support.treatment_record_id,
    member_extent_decision_id: extentDecisionId,
    service_scope: grainScope(support, q61, qm44, qm64),
    lineage_segments: grainLineage(support, q61, qm64),
    evidence_bindings: evidenceBindings(current, support),
    rationale:
      `Structured service selectors and lineage are bound to the owner-accepted historical full-stop ` +
      `candidate facts for ${support.treatment_record_id}.`,
    reviewed_at: DRAFT_REVIEWED_AT,
    reviewed_by: DRAFT_REVIEWED_BY,
  });
}

export function buildPlan040ExemplarDecisionDraft(): Plan040ExemplarDecisionDraft {
  if (existsSync(PLAN_040_EXEMPLAR_OWNER_ACCEPTANCE_PATH) &&
      existsSync(PLAN_040_EXEMPLAR_DRAFT_PATH)) {
    return JSON.parse(readFileSync(PLAN_040_EXEMPLAR_DRAFT_PATH, "utf8")) as
      Plan040ExemplarDecisionDraft;
  }
  const acceptance = JSON.parse(readFileSync(ACCEPTANCE_PATH, "utf8")) as CandidateAcceptance;
  if (acceptance.covered_candidate_count !== 11 ||
      acceptance.occurrence_authority !== false ||
      acceptance.decision_authority !== false) {
    throw new Error("Plan 040 candidate evidence acceptance is not fail-closed at the exact denominator");
  }
  const companionPin = acceptance.package_input_pins.find((pin) =>
    pin.path === relative(repoRoot, COMPANION_PATH));
  if (!companionPin || companionPin.sha256 !== fileSha256(COMPANION_PATH)) {
    throw new Error("Plan 040 candidate evidence acceptance has stale companion bytes");
  }
  const ownerAcceptance = JSON.parse(readFileSync(EVIDENCE_OWNER_ACCEPTANCE_PATH, "utf8")) as {
    gate?: { path?: string; sha256?: string };
    occurrence_authority?: boolean;
    decision_authority?: boolean;
  };
  if (ownerAcceptance.gate?.sha256 !== fileSha256(EVIDENCE_GATE_PATH) ||
      ownerAcceptance.occurrence_authority !== false ||
      ownerAcceptance.decision_authority !== false) {
    throw new Error("Plan 040 historical evidence lacks matching owner acceptance");
  }

  const companion = new Map(readCompanion().map((row) => [key(row), row]));
  const q61 = readDossier("q61_lineage.json");
  const qm44 = readDossier("qm44_stop_and_modality.json");
  const qm64 = readDossier("qm64_x64_lineage.json");
  const extentDecisions: MemberExtentDecision[] = [];
  const grainDecisions: MemberGrainDecision[] = [];
  for (const support of acceptance.candidate_support_rows) {
    const current = companion.get(key(support));
    if (!current || current.extent_id !== support.extent_id) {
      throw new Error(`${support.treatment_record_id}: stale or missing companion candidate`);
    }
    const extent = buildExtentDecision(current, support);
    if (extent) extentDecisions.push(extent);
    const effectiveExtentDecisionId = extent?.decision_id ?? current.decision_id;
    if (!effectiveExtentDecisionId) {
      throw new Error(`${support.treatment_record_id}: no positive spatial decision for grain pairing`);
    }
    grainDecisions.push(buildGrainDecision(
      current,
      support,
      effectiveExtentDecisionId,
      q61,
      qm44,
      qm64,
    ));
  }
  extentDecisions.sort((left, right) => key(left).localeCompare(key(right)));
  grainDecisions.sort((left, right) => key(left).localeCompare(key(right)));
  const spatialResolutionDistribution = Object.fromEntries(
    uniqueSorted([
      ...extentDecisions.map((decision) => decision.resolution),
      "route_wide",
    ]).map((resolution) => [
      resolution,
      extentDecisions.filter((decision) => decision.resolution === resolution).length +
        (resolution === "route_wide" ? 1 : 0),
    ]),
  );
  const replayPayload = {
    evidence_acceptance_sha256: fileSha256(ACCEPTANCE_PATH),
    evidence_gate_sha256: fileSha256(EVIDENCE_GATE_PATH),
    evidence_owner_acceptance_sha256: fileSha256(EVIDENCE_OWNER_ACCEPTANCE_PATH),
    companion_sha256: fileSha256(COMPANION_PATH),
    extent_decisions: extentDecisions,
    grain_decisions: grainDecisions,
    spatial_resolution_distribution: spatialResolutionDistribution,
  };
  return {
    schema_version: 1,
    package_id: "plan-040-exemplar-decision-draft-v1",
    authorization_state: "draft_pending_dual_independent_risk_review",
    evidence_acceptance: {
      path: relative(repoRoot, ACCEPTANCE_PATH),
      sha256: fileSha256(ACCEPTANCE_PATH),
    },
    evidence_gate: {
      path: relative(repoRoot, EVIDENCE_GATE_PATH),
      sha256: fileSha256(EVIDENCE_GATE_PATH),
    },
    evidence_owner_acceptance: {
      path: relative(repoRoot, EVIDENCE_OWNER_ACCEPTANCE_PATH),
      sha256: fileSha256(EVIDENCE_OWNER_ACCEPTANCE_PATH),
    },
    companion: {
      path: relative(repoRoot, COMPANION_PATH),
      sha256: fileSha256(COMPANION_PATH),
    },
    candidate_count: acceptance.candidate_support_rows.length,
    extent_decision_count: extentDecisions.length,
    grain_decision_count: grainDecisions.length,
    spatial_resolution_distribution: spatialResolutionDistribution,
    extent_decisions: extentDecisions,
    grain_decisions: grainDecisions,
    replay_hash: stableHash(replayPayload as unknown as JsonValue),
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

export function writePlan040ExemplarDecisionDraft(
  path = PLAN_040_EXEMPLAR_DRAFT_PATH,
): { path: string; sha256: string; draft: Plan040ExemplarDecisionDraft } {
  const draft = buildPlan040ExemplarDecisionDraft();
  const contents = `${stableJson(draft as unknown as JsonValue)}\n`;
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== contents) {
      throw new Error(`Refusing to overwrite immutable Plan 040 decision draft ${relative(repoRoot, path)}`);
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, "utf8");
  }
  return { path, sha256: fileSha256(path), draft };
}

function writeImmutableJson(path: string, value: unknown): void {
  const contents = `${stableJson(value as JsonValue)}\n`;
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== contents) {
      throw new Error(`Refusing to overwrite immutable Plan 040 acceptance artifact ${relative(repoRoot, path)}`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function acceptPlan040ExemplarDecisionPackage(): {
  extentDecisionPath: string;
  extentDecisionSha256: string;
  grainDecisionPath: string;
  grainDecisionSha256: string;
  extentDecisionCount: number;
  grainDecisionCount: number;
} {
  const acceptance = JSON.parse(
    readFileSync(PLAN_040_EXEMPLAR_OWNER_ACCEPTANCE_PATH, "utf8"),
  ) as Plan040ExemplarOwnerAcceptance;
  if (acceptance.schema_version !== 1 ||
      acceptance.authorization_state !== "owner_accepted_decision_persistence_only" ||
      acceptance.authorizes_decision_persistence !== true ||
      acceptance.authorizes_occurrence !== false ||
      acceptance.authorizes_study !== false ||
      acceptance.authorizes_cross_product !== false ||
      acceptance.candidate_count !== 11) {
    throw new Error("Plan 040 exemplar owner acceptance does not authorize the bounded decision package");
  }
  if (acceptance.gate.path !== relative(repoRoot, PLAN_040_EXEMPLAR_REVIEW_GATE_PATH) ||
      acceptance.gate.sha256 !== fileSha256(PLAN_040_EXEMPLAR_REVIEW_GATE_PATH)) {
    throw new Error("Plan 040 exemplar owner acceptance has a stale review gate");
  }
  if (acceptance.draft.path !== relative(repoRoot, PLAN_040_EXEMPLAR_DRAFT_PATH) ||
      acceptance.draft.sha256 !== fileSha256(PLAN_040_EXEMPLAR_DRAFT_PATH)) {
    throw new Error("Plan 040 exemplar owner acceptance has a stale draft");
  }
  const draft = JSON.parse(readFileSync(PLAN_040_EXEMPLAR_DRAFT_PATH, "utf8")) as
    Plan040ExemplarDecisionDraft;
  if (draft.replay_hash !== acceptance.draft.replay_hash ||
      draft.candidate_count !== 11 ||
      draft.extent_decision_count !== 10 ||
      draft.grain_decision_count !== 11 ||
      draft.authorizes_occurrence !== false ||
      draft.authorizes_study !== false ||
      draft.authorizes_cross_product !== false) {
    throw new Error("Plan 040 exemplar frozen draft no longer matches owner acceptance");
  }
  const extentDecisions = draft.extent_decisions.map((decision) => {
    const accepted = {
      ...decision,
      reviewed_at: acceptance.accepted_at,
      reviewed_by: acceptance.accepted_by,
    };
    validateMemberExtentDecision(accepted);
    return accepted;
  });
  const grainDecisions = draft.grain_decisions.map((decision) =>
    parseMemberGrainDecision({
      ...decision,
      reviewed_at: acceptance.accepted_at,
      reviewed_by: acceptance.accepted_by,
    }));
  writeImmutableJson(PLAN_040_EXEMPLAR_EXTENT_DECISIONS_PATH, { decisions: extentDecisions });
  writeImmutableJson(PLAN_040_EXEMPLAR_GRAIN_DECISIONS_PATH, { decisions: grainDecisions });
  return {
    extentDecisionPath: PLAN_040_EXEMPLAR_EXTENT_DECISIONS_PATH,
    extentDecisionSha256: fileSha256(PLAN_040_EXEMPLAR_EXTENT_DECISIONS_PATH),
    grainDecisionPath: PLAN_040_EXEMPLAR_GRAIN_DECISIONS_PATH,
    grainDecisionSha256: fileSha256(PLAN_040_EXEMPLAR_GRAIN_DECISIONS_PATH),
    extentDecisionCount: extentDecisions.length,
    grainDecisionCount: grainDecisions.length,
  };
}
