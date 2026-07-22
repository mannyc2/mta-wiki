import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

import { repoRoot } from "../packages/core/src/paths";
import { stableHash, stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  classifyDownstreamDisposition,
  explicitBridgeMissingRoles,
  extentDecisionKey,
  MEMBER_EXTENT_CONTRACT_ID,
  projectMemberExtent,
  STUDY_READINESS_SCHEMA_VERSION,
  validateMemberExtentDecision,
  type ExactEvidenceBinding,
  type MemberExtentComponent,
  type MemberExtentDecision,
  type MemberExtentKind,
  type MemberExtentMissingRole,
  type MemberExtentRow,
} from "../packages/pipeline/src/quality/study-readiness-v1";

const INPUT_PATH = join(
  repoRoot,
  "data/quality/study-readiness/v1/tracker-rc26-input.json",
);
const OUTPUT_DIR = join(repoRoot, "data/quality/study-readiness/v1");
const EXTENT_DIR = join(repoRoot, "data/contracts/operational-occurrence-member-extent/v1");
const OVERLAY_DIR = join(
  repoRoot,
  "data/quality/relationship-integrity/bus-lane-acquisition/current-resolutions/v1",
);
const RELEASE_DIR = join(repoRoot, "data/exports/releases/v1-rc26");
const OCCURRENCES_PATH = join(RELEASE_DIR, "operational_occurrences.jsonl");
const TREATMENTS_PATH = join(repoRoot, "data/canonical/treatment_components.jsonl");
const SOURCE_PAGE_PATH = join(
  repoRoot,
  "wiki/sources/mta_queens_bus_network_redesign_service_changes.md",
);
const BROOKLYN_RECEIPTS_PATH = join(
  repoRoot,
  "data/quality/relationship-integrity/bus-lane-acquisition/shards/brooklyn-null/receipts.jsonl",
);

const REVIEWED_AT = "2026-07-21T00:00:00.000Z";
const REVIEWED_BY = "codex-study-readiness-member-extent-v1";

type JsonObject = Record<string, any>;
type ResearchResolution = {
  resolution: MemberExtentKind;
  components: MemberExtentComponent[];
  missing_roles: MemberExtentMissingRole[];
  rationale: string;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8").split(/\r?\n/u)
    .flatMap((line) => line.trim() ? [JSON.parse(line) as T] : []);
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonl<T>(rows: readonly T[]): string {
  return rows.length === 0
    ? ""
    : `${rows.map((row) => stableJson(row as unknown as JsonValue)).join("\n")}\n`;
}

function relativePath(path: string): string {
  return relative(repoRoot, path).split("\\").join("/");
}

function filePin(path: string, content = readFileSync(path, "utf8")) {
  return {
    path: relativePath(path),
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
    ...(path.endsWith(".jsonl")
      ? { row_count: content.trim() ? content.trimEnd().split(/\r?\n/u).length : 0 }
      : {}),
  };
}

function evidenceBindingKey(binding: ExactEvidenceBinding): string {
  return `${binding.role}\u0000${binding.record_id}\u0000${binding.source_id}\u0000${binding.evidence_id}`;
}

function sortedEvidence(bindings: readonly ExactEvidenceBinding[]): ExactEvidenceBinding[] {
  return [...new Map(bindings.map((binding) => [evidenceBindingKey(binding), binding])).values()]
    .sort((left, right) => evidenceBindingKey(left).localeCompare(evidenceBindingKey(right)));
}

function sourceEvidence(record: JsonObject): ExactEvidenceBinding[] {
  return (record.evidence_refs ?? []).map((ref: JsonObject) => ({
    role: "extent_classification",
    record_id: record.record_id,
    source_id: ref.source_id,
    evidence_id: ref.evidence_id,
  }));
}

function routeEvidence(occurrence: JsonObject, routeRecordId: string): ExactEvidenceBinding[] {
  const route = occurrence.routes.find((value: JsonObject) =>
    value.route_record_id === routeRecordId) as JsonObject | undefined;
  if (!route) throw new Error(`${occurrence.occurrence_id}: missing route ${routeRecordId}`);
  return route.evidence_bindings.map((binding: JsonObject) => ({
    role: binding.role === "route_scope" ? "route_member_binding" : binding.role,
    record_id: binding.record_id,
    source_id: binding.source_id,
    evidence_id: binding.evidence_id,
  }));
}

function unresolved(
  missingRoles: MemberExtentMissingRole[],
  rationale: string,
): ResearchResolution {
  return {
    resolution: "unresolved",
    components: [],
    missing_roles: [...missingRoles].sort(),
    rationale,
  };
}

function bounded(
  identifiers: string[],
  description: string,
  rationale: string,
): ResearchResolution {
  return {
    resolution: "bounded_segment",
    components: [{
      component_kind: "segment",
      identity_namespace: "source_literal_v1",
      identifiers: [...identifiers].sort(),
      description,
    }],
    missing_roles: [],
    rationale,
  };
}

function routeWide(rationale: string): ResearchResolution {
  return {
    resolution: "route_wide",
    components: [],
    missing_roles: [],
    rationale,
  };
}

const SOURCE = "mta_queens_bus_network_redesign_service_changes";

const RESEARCH_RESOLUTIONS: Record<string, ResearchResolution> = {
  "treatment_q45-all-day-frequent-service-2025": unresolved(
    ["bounded_scope_identity"],
    "Union Turnpike is named, but the official sentence gives no endpoints or affirmative whole-route extent for the frequency change.",
  ),
  "treatment_q45-direct-connection-2025": bounded(
    [`source-literal-v1:${SOURCE}#p001_b0050:188-st--kew-gardens`],
    "Q45 direct connection between 188 Street and Kew Gardens.",
    "The official source states both endpoints for this service connection.",
  ),
  "treatment_q61-beechhurst-flushing-connection-2025": unresolved(
    ["bounded_scope_identity"],
    "Beechhurst, Flushing, and Willets Point Boulevard are named without exact service-segment endpoints.",
  ),
  "treatment_q61-q15-beechhurst-replacement-2025": unresolved(
    ["bounded_scope_identity"],
    "The named former Q15 Beechhurst service is not an evidence-bound segment identity in this corpus.",
  ),
  "treatment_q61-q34-linden-hill-replacement-2025": unresolved(
    ["bounded_scope_identity"],
    "The named former Q34 Linden Hill service is not an evidence-bound segment identity in this corpus.",
  ),
  "treatment_q63-limited-stops-2025": bounded(
    [
      `source-literal-v1:${SOURCE}#p001_b0066:northern-blvd-main-st--114-st`,
      `source-literal-v1:${SOURCE}#p001_b0066:northern-blvd-jackson-av-49-st--court-square`,
    ],
    "Q63 limited-stop service on two source-stated, endpoint-bounded segments.",
    "The official source states both bounded limited-stop segments with their endpoints.",
  ),
  "treatment_q63-northern-boulevard-connection-2025": bounded(
    [`source-literal-v1:${SOURCE}#p001_b0066:northern-blvd-flushing--long-island-city`],
    "Q63 service along Northern Boulevard between Flushing and Long Island City.",
    "The official source states the named corridor and both endpoints.",
  ),
  "treatment_q80-frequency-overnight-service-2025": bounded(
    [`source-literal-v1:${SOURCE}#p001_b0078:entire-lefferts-blvd`],
    "Q80 frequency and overnight service along the entire length of Lefferts Boulevard.",
    "The official source affirmatively states the entire named corridor.",
  ),
  "treatment_q80-q10-limited-branch-replacement-2025": bounded(
    [`source-literal-v1:${SOURCE}#p001_b0078:entire-lefferts-blvd`],
    "Q80 replacement of the Q10 limited branch on the entire Lefferts Boulevard corridor described in the same official change unit.",
    "The official change-unit sentence directly joins replacement of the Q10 limited branch to service along the entire length of Lefferts Boulevard.",
  ),
  "treatment_q86-limited-stops-2025": bounded(
    [`source-literal-v1:${SOURCE}#p001_b0083:merrick-blvd-archer-av--springfield-blvd`],
    "Q86 limited stops on Merrick Boulevard between Archer Avenue and Springfield Boulevard.",
    "The official source states the named corridor and both endpoints.",
  ),
  "treatment_q86-q5-q85-branch-combination-2025": unresolved(
    ["bounded_scope_identity"],
    "The official source names prior branches and neighborhoods but does not bind the combined service to exact segment endpoints.",
  ),
  "treatment_q87-limited-stops-2025": bounded(
    [`source-literal-v1:${SOURCE}#p001_b0084:merrick-blvd-archer-av--springfield-blvd`],
    "Q87 limited stops on Merrick Boulevard between Archer Avenue and Springfield Boulevard.",
    "The official source states the named corridor and both endpoints.",
  ),
  "treatment_q87-q5-green-acres-replacement-2025": unresolved(
    ["bounded_scope_identity"],
    "The named prior Q5 Green Acres branch lacks pinned geometry or evidence-bound endpoints in this source packet.",
  ),
  "treatment_q89-limited-stops-2025": unresolved(
    ["bounded_scope_identity"],
    "Merrick Boulevard is named without endpoints or an affirmative entire-corridor statement.",
  ),
  "treatment_q89-q85-green-acres-replacement-2025": unresolved(
    ["bounded_scope_identity"],
    "The named prior Q85 Green Acres branch lacks pinned geometry or evidence-bound endpoints in this source packet.",
  ),
  "treatment_qm34-frequency-decrease-2025": unresolved(
    ["scope_modality"],
    "The source states a peak-frequency decrease but does not affirm whether it applies to every route trip or a bounded service subset.",
  ),
  "treatment_qm34-stop-removal-2025": unresolved(
    ["stop_identity"],
    "The exact directional stop name is source-stated, but the producer has no pinned versioned stop identity for a positive stop_set decision.",
  ),
  "treatment_qm44-frequency-decrease-2025": unresolved(
    ["scope_modality"],
    "The AM peak-frequency decrease lacks affirmative whole-route or bounded-subset modality.",
  ),
  "treatment_qm44-stop-removal-2025": unresolved(
    ["stop_identity"],
    "The source says only that some stops were removed and supplies no exact stop set.",
  ),
  "treatment_qm64-avenue-service-discontinuation-2025": unresolved(
    ["bounded_scope_identity"],
    "The discontinued avenues are named without endpoint-bounded service segments.",
  ),
  "treatment_qm64-elmont-extension-2025": unresolved(
    ["bounded_scope_identity"],
    "The new Elmont endpoint is exact, but the start of the added segment is not bound in the official sentence.",
  ),
  "treatment_qm64-frequency-decrease-2025": unresolved(
    ["scope_modality"],
    "The AM peak-frequency decrease lacks affirmative whole-route or bounded-subset modality.",
  ),
  "treatment_qm64-midtown-stop-additions-2025": unresolved(
    ["stop_identity"],
    "Street names are listed, but no pinned versioned stop identities authorize a positive stop_set.",
  ),
  "treatment_qm64-route-rename-2025": routeWide(
    "The official source explicitly renames the complete X64 service identity to QM64.",
  ),
  "treatment_qm64-stop-removal-2025": unresolved(
    ["stop_identity"],
    "The source says only that some stops were removed and supplies no exact stop set.",
  ),
  "treatment_qm68-avenue-service-discontinuation-2025": unresolved(
    ["bounded_scope_identity"],
    "The discontinued streets and avenues are named without endpoint-bounded service segments.",
  ),
  "treatment_qm68-midtown-stop-additions-2025": unresolved(
    ["stop_identity"],
    "Street names are listed, but no pinned versioned stop identities authorize a positive stop_set.",
  ),
  "treatment_qm68-route-rename-2025": routeWide(
    "The official source explicitly renames the complete X68 service identity to QM68.",
  ),
  "treatment_qm68-stop-removal-2025": unresolved(
    ["stop_identity"],
    "The source says only that some stops were removed and supplies no exact stop set.",
  ),
};

function occurrenceMembers(occurrence: JsonObject): JsonObject[] {
  if (occurrence.treatment.kind === "atomic") return [occurrence.treatment.member];
  return occurrence.treatment.members;
}

function buildDecision(input: {
  occurrence: JsonObject;
  route: JsonObject;
  treatmentRecord: JsonObject;
  resolution: ResearchResolution;
}): MemberExtentDecision {
  const components = input.resolution.resolution === "route_wide"
    ? [{
      component_kind: "route" as const,
      identity_namespace: "canonical_record" as const,
      identifiers: [input.route.route_record_id],
      description: `Affirmative whole-service extent relative to ${input.route.gtfs_route_id}.`,
    }]
    : input.resolution.components;
  const evidence = sortedEvidence([
    ...routeEvidence(input.occurrence, input.route.route_record_id),
    ...sourceEvidence(input.treatmentRecord),
  ]);
  const identity = {
    occurrence_id: input.occurrence.occurrence_id,
    route_record_id: input.route.route_record_id,
    treatment_record_id: input.treatmentRecord.record_id,
    resolution: input.resolution.resolution,
  };
  const decision: MemberExtentDecision = {
    decision_id: `member-extent-review:${stableHash(identity as unknown as JsonValue).slice(0, 24)}`,
    occurrence_id: input.occurrence.occurrence_id,
    route_record_id: input.route.route_record_id,
    treatment_record_id: input.treatmentRecord.record_id,
    resolution: input.resolution.resolution,
    components,
    evidence_bindings: evidence,
    missing_roles: input.resolution.missing_roles,
    rationale: input.resolution.rationale,
    reviewed_at: REVIEWED_AT,
    reviewed_by: REVIEWED_BY,
  };
  validateMemberExtentDecision(decision);
  return decision;
}

function flatbushDecision(occurrence: JsonObject, route: JsonObject, member: JsonObject) {
  const decision: MemberExtentDecision = {
    decision_id: `member-extent-review:${stableHash({
      occurrence_id: occurrence.occurrence_id,
      route_record_id: route.route_record_id,
      treatment_record_id: member.treatment_record_id,
      resolution: "bounded_segment",
    } as JsonValue).slice(0, 24)}`,
    occurrence_id: occurrence.occurrence_id,
    route_record_id: route.route_record_id,
    treatment_record_id: member.treatment_record_id,
    resolution: "bounded_segment",
    components: [{
      component_kind: "corridor",
      identity_namespace: "canonical_record",
      identifiers: [...occurrence.physical_scope_record_ids].sort(),
      description: "Flatbush Avenue Phase 1 bounded corridor from Livingston Street to State Street.",
    }],
    evidence_bindings: sortedEvidence([
      ...routeEvidence(occurrence, route.route_record_id),
      ...occurrence.physical_scope_evidence_bindings.map((binding: JsonObject) => ({
        role: "extent_scope",
        record_id: binding.record_id,
        source_id: binding.source_id,
        evidence_id: binding.evidence_id,
      })),
      ...member.evidence_bindings.map((binding: JsonObject) => ({
        role: "extent_classification",
        record_id: binding.record_id,
        source_id: binding.source_id,
        evidence_id: binding.evidence_id,
      })),
    ]),
    missing_roles: [],
    rationale: "The v1-rc26 occurrence binds the exact B41/B67 member to a canonical Livingston-to-State corridor, a direct physical-scope relation, and exact evidence.",
    reviewed_at: REVIEWED_AT,
    reviewed_by: REVIEWED_BY,
  };
  validateMemberExtentDecision(decision);
  return decision;
}

function buildExtentArtifacts(occurrences: JsonObject[], treatmentRecords: JsonObject[]) {
  const treatments = new Map(treatmentRecords.map((record) => [record.record_id, record]));
  const decisions: MemberExtentDecision[] = [];
  const researchRoutes = new Set([
    "Q45", "Q61", "Q63", "Q80", "Q86", "Q87", "Q89", "QM34", "QM44", "QM64", "QM68",
  ]);
  for (const occurrence of occurrences) {
    for (const route of occurrence.routes) {
      for (const member of occurrenceMembers(occurrence)) {
        if (occurrence.occurrence_id === "occurrence:8c987704152b459014217d44") {
          decisions.push(flatbushDecision(occurrence, route, member));
          continue;
        }
        if (!researchRoutes.has(route.gtfs_route_id)) continue;
        const resolution = RESEARCH_RESOLUTIONS[member.treatment_record_id];
        if (!resolution) {
          throw new Error(`${route.gtfs_route_id}/${member.treatment_record_id}: missing research resolution`);
        }
        const treatmentRecord = treatments.get(member.treatment_record_id);
        if (!treatmentRecord) throw new Error(`${member.treatment_record_id}: canonical record missing`);
        decisions.push(buildDecision({ occurrence, route, treatmentRecord, resolution }));
      }
    }
  }
  decisions.sort((left, right) => extentDecisionKey(left).localeCompare(extentDecisionKey(right)));
  const decisionMap = new Map(decisions.map((decision) => [extentDecisionKey(decision), decision]));
  if (decisionMap.size !== decisions.length) throw new Error("Duplicate member extent decision key");
  if (decisions.length !== 31) throw new Error(`Expected 31 reviewed extent decisions, received ${decisions.length}`);

  const rows = occurrences.flatMap((occurrence) => occurrence.routes.flatMap((route: JsonObject) =>
    occurrenceMembers(occurrence).map((member) => projectMemberExtent({
      occurrence_id: occurrence.occurrence_id,
      occurrence_review_decision_id: occurrence.occurrence_review_decision_id,
      route_record_id: route.route_record_id,
      gtfs_route_id: route.gtfs_route_id,
      treatment_record_id: member.treatment_record_id,
      treatment_family: member.treatment_family,
      decision: decisionMap.get(extentDecisionKey({
        occurrence_id: occurrence.occurrence_id,
        route_record_id: route.route_record_id,
        treatment_record_id: member.treatment_record_id,
      })),
    })))).sort((left, right) => extentDecisionKey(left).localeCompare(extentDecisionKey(right)));
  if (rows.length !== 308 || new Set(rows.map(extentDecisionKey)).size !== rows.length) {
    throw new Error(`Member extent denominator mismatch: ${rows.length} rows`);
  }
  const eligibleIds = new Set(occurrences.filter((row) => row.study_projection_eligible)
    .map((row) => row.occurrence_id));
  const counts = Object.fromEntries(
    ["route_wide", "bounded_segment", "stop_set", "mixed", "unresolved"].map((kind) =>
      [kind, rows.filter((row) => row.extent === kind).length]),
  );
  return {
    decisions,
    rows,
    summary: {
      schema_version: STUDY_READINESS_SCHEMA_VERSION,
      contract_id: MEMBER_EXTENT_CONTRACT_ID,
      release_id: "v1-rc26",
      occurrence_count: occurrences.length,
      member_extent_row_count: rows.length,
      eligible_member_extent_row_count: rows.filter((row) => eligibleIds.has(row.occurrence_id)).length,
      reviewed_decision_count: decisions.length,
      extent_counts: counts,
      evidence_complete_row_count: rows.length - counts.unresolved,
      unresolved_row_count: counts.unresolved,
      doctrine: {
        empty_scope_is_unresolved: true,
        route_membership_is_not_route_wide_evidence: true,
        physicality_not_applicable_is_not_route_wide_evidence: true,
        authorizes_study: false,
        authorizes_cross_product: false,
      },
    },
  };
}

function firstOnsetStatus(row: JsonObject, allRows: JsonObject[]): string {
  const earlier = allRows.some((other) =>
    other.candidate_id !== row.candidate_id &&
    other.route_id === row.route_id &&
    other.treatment_family === row.treatment_family &&
    other.implementation_date < row.implementation_date);
  return earlier
    ? "earlier_same_family_candidate_exists_in_pinned_set"
    : "no_earlier_same_family_candidate_in_pinned_set";
}

function buildStudyArtifacts(input: JsonObject, occurrences: JsonObject[], extents: MemberExtentRow[]) {
  const occurrenceById = new Map(occurrences.map((row) => [row.occurrence_id, row]));
  const extentByOccurrenceRoute = new Map<string, MemberExtentRow[]>();
  for (const row of extents) {
    const key = `${row.occurrence_id}\u0000${row.gtfs_route_id}`;
    const bucket = extentByOccurrenceRoute.get(key) ?? [];
    bucket.push(row);
    extentByOccurrenceRoute.set(key, bucket);
  }
  const rows: JsonObject[] = input.rows;
  const bridge = rows.map((candidate) => {
    const occurrence = candidate.occurrence_id
      ? occurrenceById.get(candidate.occurrence_id) ?? null
      : null;
    const route = occurrence?.routes.find((value: JsonObject) =>
      value.gtfs_route_id === candidate.route_id) ?? null;
    const memberExtents = occurrence && route
      ? extentByOccurrenceRoute.get(`${occurrence.occurrence_id}\u0000${route.gtfs_route_id}`) ?? []
      : [];
    const onset = occurrence?.resolved_onset ?? null;
    const phase = occurrence
      ? {
        phase_record_ids: occurrence.phase_record_ids,
        phase_relation_record_ids: occurrence.phase_relation_record_ids,
        phase_relation_disposition: occurrence.phase_relation_disposition,
        evidence_bindings: occurrence.phase_relation_evidence_bindings,
      }
      : null;
    const missingRoles = explicitBridgeMissingRoles({
      hasOccurrence: Boolean(occurrence),
      hasRouteScope: Boolean(route?.evidence_bindings?.length),
      hasOnset: Boolean(onset?.date && onset?.evidence_bindings?.length),
      hasPhase: Boolean(phase?.phase_relation_disposition && occurrence?.phase_record_ids?.length),
      memberExtents,
    });
    return {
      schema_version: 1,
      ledger_id: "study-readiness-bridge-v1",
      candidate_id: candidate.candidate_id,
      identity: candidate.identity,
      candidate_route_id: candidate.route_id,
      treatment_family: candidate.treatment_family,
      occurrence_id: occurrence?.occurrence_id ?? null,
      route_scope: route
        ? {
          status: "exact_evidence_bound",
          route_record_id: route.route_record_id,
          gtfs_route_id: route.gtfs_route_id,
          evidence_bindings: route.evidence_bindings,
        }
        : {
          status: "candidate_only_not_producer_authority",
          route_record_id: null,
          gtfs_route_id: null,
          evidence_bindings: [],
        },
      treatment_extent: {
        status: memberExtents.length > 0 && memberExtents.every((row) => row.extent !== "unresolved")
          ? "all_members_evidence_complete"
          : "unresolved_or_incomplete",
        members: memberExtents,
      },
      delivered_onset: onset
        ? { status: "exact_evidence_bound", ...onset }
        : { status: "unresolved", date: null, precision: null, evidence_bindings: [] },
      phase: phase ?? {
        phase_record_ids: [],
        phase_relation_record_ids: [],
        phase_relation_disposition: null,
        evidence_bindings: [],
      },
      exact_evidence_bindings: sortedEvidence([
        ...(route?.evidence_bindings ?? []),
        ...(onset?.evidence_bindings ?? []),
        ...(phase?.evidence_bindings ?? []),
        ...memberExtents.flatMap((row) => row.evidence_bindings),
      ]),
      downstream_disposition: classifyDownstreamDisposition(candidate as {
        treatment_family: string;
        decision: string;
        decision_rationale: string;
      }),
      missing_roles: missingRoles,
      authorizes_study: false,
      authorizes_cross_product: false,
    };
  }).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));

  const dispositionCounts = Object.fromEntries(
    [...new Set(bridge.map((row) => row.downstream_disposition))].sort().map((disposition) =>
      [disposition, bridge.filter((row) => row.downstream_disposition === disposition).length]),
  );
  const expectedCounts = {
    approved_rc26: 7,
    quarantined_later_ace_phase: 20,
    source_fixable_bus_lane_occurrence_identity: 321,
    source_fixable_member_treatment_extent: 83,
    tracker_owned_outcome_calendar: 8,
    tracker_owned_spine_or_pattern: 45,
  };
  if (stableJson(dispositionCounts as JsonValue) !== stableJson(expectedCounts as JsonValue)) {
    throw new Error(`Unexpected downstream split: ${stableJson(dispositionCounts as JsonValue)}`);
  }

  const sourceFixable = new Set([
    "source_fixable_bus_lane_occurrence_identity",
    "source_fixable_member_treatment_extent",
  ]);
  const targets = rows.flatMap((candidate) => {
    const disposition = classifyDownstreamDisposition(candidate as {
      treatment_family: string;
      decision: string;
      decision_rationale: string;
    });
    if (!sourceFixable.has(disposition)) return [];
    const spine = candidate.current_admission?.spine;
    const outcome = candidate.current_admission?.outcome_window;
    const calendarSufficient = outcome?.calendar_minimum_four_per_side === true;
    const firstOnset = firstOnsetStatus(candidate, rows);
    const top = disposition === "source_fixable_member_treatment_extent" &&
      spine?.readiness === "series_ready" && calendarSufficient &&
      firstOnset === "no_earlier_same_family_candidate_in_pinned_set";
    return [{
      candidate_id: candidate.candidate_id,
      identity: candidate.identity,
      route_id: candidate.route_id,
      treatment_family: candidate.treatment_family,
      implementation_date: candidate.implementation_date,
      occurrence_id: candidate.occurrence_id,
      source_fixable_role: disposition === "source_fixable_bus_lane_occurrence_identity"
        ? "exact_occurrence_grade_route_scope_onset_and_phase"
        : "member_treatment_extent",
      spine_readiness: spine?.readiness ?? "unavailable",
      spine_reasons: spine?.reasons ?? [],
      spine_artifact_sha256: spine?.artifact_sha256 ?? null,
      calendar_sufficiency: calendarSufficient ? "sufficient" : "insufficient",
      pre_month_count: outcome?.pre_month_count ?? null,
      post_month_count: outcome?.post_month_count ?? null,
      first_onset_status: firstOnset,
      downstream_rejection_reason: disposition,
      priority_tier: top
        ? "priority_1_extent_only_consumer_ready"
        : disposition === "source_fixable_bus_lane_occurrence_identity"
        ? "deferred_completed_broad_sweep_requires_exact_identity_source"
        : "priority_2_extent_with_independent_consumer_gate",
      input_hashes: {
        tracker_candidate_set_sha256: input.tracker_baseline.pins.find((pin: JsonObject) =>
          pin.role === "candidate_set").sha256,
        tracker_approval_receipt_sha256: input.tracker_baseline.pins.find((pin: JsonObject) =>
          pin.role === "approval_receipt").sha256,
        producer_occurrences_sha256: input.producer_baseline.pins.find((pin: JsonObject) =>
          pin.role === "operational_occurrences").sha256,
        spine_artifact_sha256: spine?.artifact_sha256 ?? null,
      },
    }];
  }).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  if (targets.length !== 404) throw new Error(`Expected 404 source-fixable targets, received ${targets.length}`);
  const topTargets = targets.filter((row) => row.priority_tier === "priority_1_extent_only_consumer_ready");
  if (topTargets.length !== 11) throw new Error(`Expected 11 top targets, received ${topTargets.length}`);

  const quarantine = rows.flatMap((candidate) => {
    const disposition = classifyDownstreamDisposition(candidate as {
      treatment_family: string;
      decision: string;
      decision_rationale: string;
    });
    if (sourceFixable.has(disposition) || disposition === "approved_rc26") return [];
    return [{
      candidate_id: candidate.candidate_id,
      identity: candidate.identity,
      route_id: candidate.route_id,
      occurrence_id: candidate.occurrence_id,
      quarantine_reason: disposition,
      owner: disposition === "quarantined_later_ace_phase"
        ? "methodology_later_phase_quarantine"
        : "tracker_consumer",
      source_research_can_resolve: false,
      preserves_later_phase_role: disposition === "quarantined_later_ace_phase",
      authorizes_study: false,
    }];
  }).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  if (quarantine.length !== 73) throw new Error(`Expected 73 quarantine rows, received ${quarantine.length}`);

  const targetByRoute = new Map(topTargets.map((target) => [target.route_id, target]));
  const researchPackets = [...targetByRoute.values()].map((target) => {
    const occurrence = occurrenceById.get(target.occurrence_id);
    if (!occurrence) throw new Error(`${target.candidate_id}: occurrence missing`);
    const route = occurrence.routes.find((value: JsonObject) => value.gtfs_route_id === target.route_id);
    const members = extentByOccurrenceRoute.get(`${occurrence.occurrence_id}\u0000${target.route_id}`) ?? [];
    const missing = [...new Set(members.flatMap((member) => member.missing_roles))].sort();
    const complete = members.length > 0 && members.every((member) => member.extent !== "unresolved");
    return {
      schema_version: 1,
      packet_id: `study-readiness-review:${stableHash({ candidate_id: target.candidate_id } as JsonValue).slice(0, 24)}`,
      candidate_id: target.candidate_id,
      identity: target.identity,
      route_id: target.route_id,
      occurrence_id: occurrence.occurrence_id,
      review_disposition: complete
        ? "reviewed_candidate_packet_evidence_complete"
        : "receipt_backed_negative_missing_member_extent",
      operational_onset: occurrence.resolved_onset,
      phase_role: {
        disposition: occurrence.phase_relation_disposition,
        phase_record_ids: occurrence.phase_record_ids,
        relation_record_ids: occurrence.phase_relation_record_ids,
        evidence_bindings: occurrence.phase_relation_evidence_bindings,
      },
      route_scope: route,
      treatment_family: target.treatment_family,
      member_extents: members,
      exact_missing_roles: missing,
      first_onset_status: target.first_onset_status,
      downstream_replay_required: true,
      creates_new_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      receipt_pins: [
        filePin(INPUT_PATH),
        filePin(OCCURRENCES_PATH),
        filePin(TREATMENTS_PATH),
        filePin(SOURCE_PAGE_PATH),
      ],
    };
  }).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  const completeCount = researchPackets.filter((row) =>
    row.review_disposition === "reviewed_candidate_packet_evidence_complete").length;
  if (researchPackets.length !== 11 || completeCount !== 2) {
    throw new Error(`Expected 11 research packets / 2 complete, received ${researchPackets.length}/${completeCount}`);
  }
  return {
    bridge,
    bridgeSummary: {
      schema_version: 1,
      ledger_id: "study-readiness-bridge-v1",
      row_count: bridge.length,
      disposition_counts: dispositionCounts,
      rows_with_no_missing_roles: bridge.filter((row) => row.missing_roles.length === 0).length,
      authorizes_study: false,
      authorizes_cross_product: false,
    },
    targetManifest: {
      schema_version: 1,
      manifest_id: "tracker-rc26-source-fixable-targets-v1",
      candidate_set_id: input.tracker_baseline.candidate_set_id,
      target_count: targets.length,
      priority_1_count: topTargets.length,
      exhausted_bus_lane_sweep_count: targets.filter((row) =>
        row.priority_tier === "deferred_completed_broad_sweep_requires_exact_identity_source").length,
      global_input_pins: [
        ...input.producer_baseline.pins,
        ...input.tracker_baseline.pins,
      ],
      exclusion_doctrine: {
        tracker_owned_failures_are_not_targets: true,
        later_ace_phases_are_not_first_onsets: true,
        approved_rc26_candidates_are_not_targets: true,
      },
      targets,
    },
    quarantine,
    researchPackets,
    researchSummary: {
      schema_version: 1,
      batch_id: "queens-redesign-extent-priority-v1",
      target_count: researchPackets.length,
      evidence_complete_existing_occurrence_count: completeCount,
      negative_disposition_count: researchPackets.length - completeCount,
      new_occurrence_count: 0,
      exact_missing_role_counts: Object.fromEntries(
        [...new Set(researchPackets.flatMap((row) => row.exact_missing_roles))].sort().map((role) => [
          role,
          researchPackets.filter((row) => row.exact_missing_roles.includes(role)).length,
        ]),
      ),
      notice: "Evidence-complete means every member in the existing occurrence has reviewed extent. It does not authorize Tracker admission; the consumer must migrate the companion contract and issue a new candidate set and approval receipt.",
    },
  };
}

function seedOverlayRows(occurrences: JsonObject[], trackerInput: JsonObject) {
  const occurrence = occurrences.find((row) =>
    row.occurrence_id === "occurrence:8c987704152b459014217d44");
  if (!occurrence) throw new Error("Flatbush occurrence missing");
  const receiptLines = readFileSync(BROOKLYN_RECEIPTS_PATH, "utf8").split(/\r?\n/u).filter(Boolean);
  const receipts = receiptLines.map((line) => JSON.parse(line) as JsonObject);
  const configurations = [
    {
      route_id: "B41",
      receipt_id: "brooklyn-null-acquisition:0743054b23699a5688bb82f6",
      prior_candidate_id: "study-event-v2:e1d437f15fa4caee51760675",
      current_candidate_id: "study-event-v2:6b70c52e0eec23eb63cab94f",
      expected_receipt_row_sha256: "bdf422c6c092973f6232047d265f8508762a2f8f36b910cfecc006d3fb56ce7a",
    },
    {
      route_id: "B67",
      receipt_id: "brooklyn-null-acquisition:2863ed369a2900493843c447",
      prior_candidate_id: "study-event-v2:bc870a23ee602a9ea28d9160",
      current_candidate_id: "study-event-v2:d70a3ee36eb94ae88732065f",
      expected_receipt_row_sha256: "e2ae428c25bdb54ab56891a30f1fe4c7d2234ea17a311170403a9260d96fdd75",
    },
  ];
  return configurations.map((config) => {
    const index = receipts.findIndex((row) => row.receipt_id === config.receipt_id);
    if (index < 0) throw new Error(`${config.receipt_id}: receipt missing`);
    const receiptRowSha256 = sha256(receiptLines[index]!);
    if (receiptRowSha256 !== config.expected_receipt_row_sha256) {
      throw new Error(`${config.receipt_id}: immutable receipt row hash mismatch`);
    }
    const route = occurrence.routes.find((value: JsonObject) =>
      value.gtfs_route_id === config.route_id);
    const candidate = trackerInput.rows.find((value: JsonObject) =>
      value.candidate_id === config.current_candidate_id);
    if (!route || !candidate || candidate.identity !== `${config.route_id}|bus_lane|2025-10-02|day`) {
      throw new Error(`${config.route_id}: exact current identity not proved`);
    }
    const identity = {
      receipt_id: config.receipt_id,
      occurrence_id: occurrence.occurrence_id,
      route_id: config.route_id,
      resolved_at: REVIEWED_AT,
    };
    return {
      schema_version: 1,
      overlay_id: "bus-lane-acquisition-current-resolutions-v1",
      resolution_id: `acquisition-resolution:${stableHash(identity as JsonValue).slice(0, 24)}`,
      resolved_at: REVIEWED_AT,
      resolution_status: "resolved_later_by_exact_candidate_identity",
      immutable_receipt: {
        receipt_id: config.receipt_id,
        candidate_id: config.prior_candidate_id,
        path: relativePath(BROOKLYN_RECEIPTS_PATH),
        file_sha256: "8806c619a6a3cbcdf4233f74fb58cab8d243651b649b69c02c8f8c4c24344a10",
        row_sha256: receiptRowSha256,
      },
      current_resolution: {
        candidate_id: config.current_candidate_id,
        identity: candidate.identity,
        occurrence_id: occurrence.occurrence_id,
        route_record_id: route.route_record_id,
        gtfs_route_id: route.gtfs_route_id,
        resolved_onset: occurrence.resolved_onset,
        phase_record_ids: occurrence.phase_record_ids,
        phase_relation_record_ids: occurrence.phase_relation_record_ids,
        physical_scope_record_ids: occurrence.physical_scope_record_ids,
        physical_scope_relation_record_ids: occurrence.physical_scope_relation_record_ids,
        exact_evidence_bindings: sortedEvidence([
          ...route.evidence_bindings,
          ...occurrence.resolved_onset.evidence_bindings,
          ...occurrence.phase_relation_evidence_bindings,
          ...occurrence.physical_scope_evidence_bindings,
        ]),
        missing_roles: [],
      },
      resolution_doctrine: {
        rewrites_historical_receipt: false,
        changes_historical_exclusion: false,
        authorizes_study: false,
        authorizes_cross_product: false,
        tracker_reapproval_required: true,
      },
    };
  }).sort((left, right) => left.resolution_id.localeCompare(right.resolution_id));
}

function writeOrCheck(path: string, content: string, check: boolean): void {
  if (check) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      throw new Error(`${relativePath(path)}: generated content is stale`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function updateOverlayLedger(seedRows: JsonObject[], check: boolean): JsonObject[] {
  const ledgerPath = join(OVERLAY_DIR, "ledger.jsonl");
  const existingLines = existsSync(ledgerPath)
    ? readFileSync(ledgerPath, "utf8").split(/\r?\n/u).filter(Boolean)
    : [];
  const existing = existingLines.map((line) => JSON.parse(line) as JsonObject);
  const byId = new Map(existing.map((row) => [row.resolution_id, row]));
  const additions: JsonObject[] = [];
  for (const seed of seedRows) {
    const prior = byId.get(seed.resolution_id);
    if (prior && stableJson(prior as JsonValue) !== stableJson(seed as JsonValue)) {
      throw new Error(`${seed.resolution_id}: append-only overlay row changed`);
    }
    if (!prior) additions.push(seed);
  }
  if (check && additions.length > 0) {
    throw new Error(`Append-only overlay is missing ${additions.length} seed resolution(s)`);
  }
  if (!check && additions.length > 0) {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    if (existsSync(ledgerPath) && readFileSync(ledgerPath, "utf8").length > 0 &&
        !readFileSync(ledgerPath, "utf8").endsWith("\n")) {
      throw new Error("Append-only overlay ledger must end with LF before adding rows");
    }
    appendFileSync(ledgerPath, jsonl(additions), "utf8");
  }
  return [...existing, ...additions];
}

function main(): void {
  const check = process.argv.includes("--check");
  const input = readJson<JsonObject>(INPUT_PATH);
  const occurrences = readJsonl<JsonObject>(OCCURRENCES_PATH);
  const treatmentRecords = readJsonl<JsonObject>(TREATMENTS_PATH);
  const extent = buildExtentArtifacts(occurrences, treatmentRecords);
  const study = buildStudyArtifacts(input, occurrences, extent.rows);

  const extentFiles = new Map<string, string>([
    [join(EXTENT_DIR, "review-ledger.jsonl"), jsonl(extent.decisions)],
    [join(EXTENT_DIR, "operational_occurrence_member_extents.jsonl"), jsonl(extent.rows)],
    [join(EXTENT_DIR, "summary.json"), json(extent.summary)],
    [join(EXTENT_DIR, "contract.json"), json({
      schema_version: 1,
      contract_id: MEMBER_EXTENT_CONTRACT_ID,
      grain: ["occurrence_id", "route_record_id", "treatment_record_id"],
      extent_enum: ["route_wide", "bounded_segment", "stop_set", "mixed", "unresolved"],
      strict_rules: {
        route_wide: "Requires reviewed affirmative whole-route or whole-service evidence relative to the exact route member.",
        bounded_segment: "Requires a nonempty canonical or versioned source-literal segment/corridor identity and exact evidence.",
        stop_set: "Requires a nonempty exact versioned stop identity set and exact evidence; vague stop counts or street names fail closed.",
        mixed: "Requires at least two distinct positive component kinds; it is never coerced to route_wide.",
        unresolved: "Required for empty scope or any missing affirmative role; carries an explicit nonempty missing-role list.",
      },
      prohibitions: [
        "Route membership alone does not prove treatment extent.",
        "A physicality classification of nonphysical or not_applicable does not prove route-wide extent.",
        "No row authorizes a route/treatment cross-product or a study.",
      ],
      baseline_pins: [filePin(OCCURRENCES_PATH), filePin(TREATMENTS_PATH)],
    })],
  ]);
  for (const [path, content] of extentFiles) writeOrCheck(path, content, check);
  const extentManifest = json({
    schema_version: 1,
    contract_id: MEMBER_EXTENT_CONTRACT_ID,
    input_pins: [filePin(OCCURRENCES_PATH), filePin(TREATMENTS_PATH), filePin(SOURCE_PAGE_PATH)],
    files: [...extentFiles.entries()].map(([path, content]) => filePin(path, content))
      .sort((left, right) => left.path.localeCompare(right.path)),
  });
  writeOrCheck(join(EXTENT_DIR, "manifest.json"), extentManifest, check);

  const studyFiles = new Map<string, string>([
    [join(OUTPUT_DIR, "bridge-ledger.jsonl"), jsonl(study.bridge)],
    [join(OUTPUT_DIR, "bridge-summary.json"), json(study.bridgeSummary)],
    [join(OUTPUT_DIR, "consumer-priority-manifest.json"), json(study.targetManifest)],
    [join(OUTPUT_DIR, "consumer-owned-quarantine.jsonl"), jsonl(study.quarantine)],
    [join(OUTPUT_DIR, "research/reviewed-candidate-packets.jsonl"), jsonl(study.researchPackets)],
    [join(OUTPUT_DIR, "research/summary.json"), json(study.researchSummary)],
  ]);
  for (const [path, content] of studyFiles) writeOrCheck(path, content, check);
  const studyManifest = json({
    schema_version: 1,
    manifest_id: "study-readiness-v1",
    input_pins: [
      filePin(INPUT_PATH),
      filePin(OCCURRENCES_PATH),
      filePin(TREATMENTS_PATH),
      filePin(SOURCE_PAGE_PATH),
      filePin(join(EXTENT_DIR, "manifest.json"), extentManifest),
    ],
    files: [...studyFiles.entries()].map(([path, content]) => filePin(path, content))
      .sort((left, right) => left.path.localeCompare(right.path)),
    doctrine: {
      authorizes_study: false,
      authorizes_cross_product: false,
      requires_new_tracker_candidate_set_and_receipt: true,
    },
  });
  writeOrCheck(join(OUTPUT_DIR, "manifest.json"), studyManifest, check);

  const overlayRows = updateOverlayLedger(seedOverlayRows(occurrences, input), check);
  const currentByReceipt = new Map<string, JsonObject>();
  for (const row of [...overlayRows].sort((left, right) =>
    `${left.resolved_at}\u0000${left.resolution_id}`.localeCompare(`${right.resolved_at}\u0000${right.resolution_id}`))) {
    currentByReceipt.set(row.immutable_receipt.receipt_id, row);
  }
  const current = [...currentByReceipt.values()].sort((left, right) =>
    left.immutable_receipt.receipt_id.localeCompare(right.immutable_receipt.receipt_id));
  const overlayFiles = new Map<string, string>([
    [join(OVERLAY_DIR, "current.jsonl"), jsonl(current)],
    [join(OVERLAY_DIR, "summary.json"), json({
      schema_version: 1,
      overlay_id: "bus-lane-acquisition-current-resolutions-v1",
      append_only_resolution_count: overlayRows.length,
      current_receipt_count: current.length,
      exact_identity_resolution_count: current.filter((row) =>
        row.resolution_status === "resolved_later_by_exact_candidate_identity").length,
      historical_receipts_rewritten: 0,
      authorizes_study: false,
      authorizes_cross_product: false,
    })],
  ]);
  for (const [path, content] of overlayFiles) writeOrCheck(path, content, check);
  const overlayManifest = json({
    schema_version: 1,
    overlay_id: "bus-lane-acquisition-current-resolutions-v1",
    append_only_ledger: relativePath(join(OVERLAY_DIR, "ledger.jsonl")),
    immutable_input_pins: [
      filePin(BROOKLYN_RECEIPTS_PATH),
      filePin(OCCURRENCES_PATH),
      filePin(INPUT_PATH),
    ],
    files: [
      filePin(join(OVERLAY_DIR, "ledger.jsonl")),
      ...[...overlayFiles.entries()].map(([path, content]) => filePin(path, content)),
    ].sort((left, right) => left.path.localeCompare(right.path)),
  });
  writeOrCheck(join(OVERLAY_DIR, "manifest.json"), overlayManifest, check);

  console.log(stableJson({
    check,
    bridge_rows: study.bridge.length,
    source_fixable_targets: study.targetManifest.target_count,
    quarantine_rows: study.quarantine.length,
    research_packets: study.researchPackets.length,
    research_complete: study.researchSummary.evidence_complete_existing_occurrence_count,
    research_negative: study.researchSummary.negative_disposition_count,
    member_extent_rows: extent.rows.length,
    reviewed_extent_decisions: extent.decisions.length,
    overlay_resolutions: overlayRows.length,
  } as JsonValue));
}

main();
