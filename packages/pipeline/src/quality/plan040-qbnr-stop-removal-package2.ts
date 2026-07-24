import { createHash } from "node:crypto";
import { stableHash, stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  compareFullStopPatterns,
  type HistoricalFullStopPattern,
  type HistoricalPeriodTripCount,
  type HistoricalPatternComparison,
  type HistoricalStop,
} from "../reference/historical-full-stop.js";
import {
  MEMBER_GRAIN_DECISION_CONTRACT_ID,
  MEMBER_GRAIN_SCHEMA_VERSION,
  memberGrainDecisionKey,
  parseMemberGrainDecision,
  type MemberGrainDecision,
} from "./member-grain-decisions.js";
import {
  extentDecisionKey,
  type MemberExtentDecision,
  validateMemberExtentDecision,
} from "./study-readiness-v1.js";
import type { Plan040AcquisitionCandidate } from "./plan040-qbnr-stop-removal-acquisition.js";

export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2 =
  "plan-040-qbnr-stop-removal-package-2-draft-v1" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2_REVIEWED_COMMIT =
  "7ad7e30c30237fe7f4fa4344559c1aba4ab1624e" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE_1_MANIFEST_SHA256 =
  "43a17a230eb70e9b7c322d2125b0db99910f035e688652624d4ce0e97a08a1d4" as const;

export type Plan040Package2RemovalReason =
  | "improve_speed_reliability"
  | "new_routing"
  | "nonstop_rush"
  | "other_removed";

export type Plan040Package2PdfStatement = {
  statement_id: string;
  page_number: number;
  page_text_sha256: string;
  direction_heading: string | null;
  stop_name_literal_raw: string;
  normalized_stop_name: string;
  removal_reason: Plan040Package2RemovalReason;
};

export type Plan040Package2PdfExtraction = {
  statements: Plan040Package2PdfStatement[];
  unresolved_lines: Array<{
    page_number: number;
    page_text_sha256: string;
    direction_heading: string | null;
    line: string;
    reason: "removed_statement_stop_name_not_recovered";
  }>;
};

export type Plan040Package2ScheduleSlice = {
  source_id: string;
  schedule_date: string;
  route_id: string;
  operator: "NYCT" | "MTA Bus";
  row_count: number;
  trip_type_rows: Record<string, number>;
  passenger_shape_ids: string[];
  nonrevenue_shape_ids: string[];
  ambiguous_shape_ids: string[];
  shape_trip_type_rows: Array<{
    shape_id: string;
    trip_type_rows: Record<string, number>;
  }>;
};

export type Plan040Package2PatternEvidence = {
  pattern_id: string;
  snapshot_id: string;
  service_date: string;
  route_id: string;
  direction_id: string;
  trip_count: number;
  shape_ids: string[];
  headsigns: string[];
  stops: HistoricalStop[];
  period_trip_counts: HistoricalPeriodTripCount[];
  schedule_validation: {
    status:
      | "accepted_passenger_shape"
      | "excluded_nonrevenue_shape"
      | "reviewed_unresolved_unmatched_shape"
      | "reviewed_unresolved_ambiguous_trip_type";
    passenger_shape_ids: string[];
    nonrevenue_shape_ids: string[];
    unmatched_shape_ids: string[];
    ambiguous_shape_ids: string[];
  };
};

export type Plan040Package2StatementBinding = Plan040Package2PdfStatement & {
  direction_match_status: "not_applicable" | "exact_headsign_match" | "unmatched";
  pre_direction_ids: string[];
  post_direction_ids: string[];
  pre_stop_ids: string[];
  post_same_name_stop_ids: string[];
  post_same_id_stop_ids: string[];
  verdict:
    | "exact_pre_id_absent_post"
    | "pdf_name_not_exactly_bound_to_pre_gtfs"
    | "ambiguous_pre_gtfs_name"
    | "pdf_claimed_removed_id_still_present_post"
    | "possible_changed_id_or_relocation";
};

export type Plan040Package2CandidateEvidence = {
  candidate_key: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  gtfs_route_id: string;
  pre_gtfs_route_id: string;
  post_gtfs_route_id: string;
  pre_source_id: string;
  post_source_id: string;
  pre_target_date: string;
  post_target_date: string;
  stop_list_source_id: string;
  stop_list_url: string;
  stop_list_pdf_sha256: string;
  stop_list_layout_text_sha256: string;
  stop_list_text_raw_sha256: string;
  pdf_extraction: Plan040Package2PdfExtraction;
  pre_schedule_slice: Plan040Package2ScheduleSlice;
  post_schedule_slice: Plan040Package2ScheduleSlice;
  pre_patterns: Plan040Package2PatternEvidence[];
  post_patterns: Plan040Package2PatternEvidence[];
  comparisons: HistoricalPatternComparison[];
  statement_bindings: Plan040Package2StatementBinding[];
  exact_removed_stop_ids: string[];
  unresolved_gap_codes: string[];
  nonexclusive_context_codes: string[];
  evidence_verdict: "evidence_complete_stop_set" | "receipt_terminal_unresolved";
  proposed_extent_decision: MemberExtentDecision | null;
  proposed_grain_decision: MemberGrainDecision | null;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package2Draft = {
  schema_version: 1;
  package_id: typeof PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2;
  reviewed_commit: typeof PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2_REVIEWED_COMMIT;
  package_1_manifest: { path: string; sha256: string };
  acquisition_receipt: { path: string; sha256: string };
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 24;
  candidate_key_sha256: string;
  evidence_verdict_distribution: {
    evidence_complete_stop_set: number;
    receipt_terminal_unresolved: number;
  };
  proposed_extent_distribution: {
    stop_set: number;
    unresolved: number;
  };
  proposed_decision_count: number;
  persisted_decision_count: 0;
  proposed_grain_distribution: {
    trip_subset: number;
    unresolved: number;
  };
  proposed_grain_decision_count: number;
  persisted_grain_decision_count: 0;
  candidates: Plan040Package2CandidateEvidence[];
  correction_version_semantics: {
    published_launch_diff: "authoritative_for_this_draft";
    corrected_first_week_diff: "separate_non_authorizing_not_computed";
  };
  equivalence_policy: {
    automatic_equivalence: "identical_stop_id_only";
    changed_id_name_coordinate_or_proximity_equivalence: false;
  };
  authorization_state: "draft_pending_dual_independent_risk_review_and_owner_acceptance";
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cleanRawStopLiteral(value: string): string {
  return value
    .replace(/^\s*\d+\s*/u, "")
    .replace(/\s+/gu, "")
    .trim();
}

export function normalizePlan040Package2StopName(value: string): string {
  return value
    .normalize("NFKD")
    .toUpperCase()
    .replaceAll("BOULEVARD", "BLVD")
    .replaceAll("AVENUE", "AV")
    .replaceAll("STREET", "ST")
    .replaceAll("ROAD", "RD")
    .replaceAll("PLACE", "PL")
    .replaceAll("PARKWAY", "PKWY")
    .replaceAll("EXPRESSWAY", "EXPWY")
    .replaceAll("TURNPIKE", "TPKE")
    .replaceAll("DRIVE", "DR")
    .replaceAll("LANE", "LN")
    .replace(/[^A-Z0-9]/gu, "");
}

function removalReason(line: string): Plan040Package2RemovalReason {
  const normalized = line.toLowerCase().replace(/\s+/gu, "");
  if (normalized.includes("duetonewrouting")) return "new_routing";
  if (normalized.includes("providenonstop")) return "nonstop_rush";
  if (normalized.includes("improvespeed")) return "improve_speed_reliability";
  return "other_removed";
}

function directionHeading(line: string): string | null {
  const match = line.match(
    /^(?:(?:NORTH|SOUTH|EAST|WEST)BOUND|INBOUND|OUTBOUND)\s+to\s+.+$/iu,
  );
  return match ? line.trim() : null;
}

export function extractPlan040Package2PdfStatements(
  routeId: string,
  rawText: string,
): Plan040Package2PdfExtraction {
  const statements: Plan040Package2PdfStatement[] = [];
  const unresolvedLines: Plan040Package2PdfExtraction["unresolved_lines"] = [];
  let currentDirection: string | null = null;
  for (const [pageIndex, page] of rawText.split("\f").entries()) {
    const pageNumber = pageIndex + 1;
    const pageTextSha256 = sha256(page);
    const lines = page.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    for (const [lineIndex, line] of lines.entries()) {
      const heading = directionHeading(line);
      if (heading) currentDirection = heading;
      const removedIndex = line.toLowerCase().indexOf("removed");
      if (removedIndex < 0) continue;
      if (
        /(?:some\s+stops?\s+have\s+been\s+removed|have\s+been\s+removed\s+from\s+this\s+route)/iu
          .test(line) ||
        /^removed\.?$/iu.test(line)
      ) continue;
      let literal = cleanRawStopLiteral(line.slice(0, removedIndex));
      if (!literal.includes("/")) {
        for (
          let index = lineIndex + 1;
          index < lines.length && index <= lineIndex + 3;
          index += 1
        ) {
          const following = lines[index]!;
          if (following.includes("/")) {
            literal = cleanRawStopLiteral(following);
            break;
          }
          if (/(?:Keep|Added|Removed)/iu.test(following)) break;
        }
      }
      if (!literal.includes("/")) {
        const parts: string[] = [];
        for (let index = lineIndex - 1; index >= 0 && index >= lineIndex - 3; index -= 1) {
          const prior = lines[index]!;
          if (/^(?:service|proposalnote|connections)$/iu.test(prior)) continue;
          if (/(?:Keep|Added|Removed)/iu.test(prior)) break;
          parts.unshift(cleanRawStopLiteral(prior));
          if (prior.includes("/")) break;
        }
        const recovered = parts.join("");
        literal = recovered.includes("/") ? recovered : "";
      }
      if (!literal || !literal.includes("/")) {
        unresolvedLines.push({
          page_number: pageNumber,
          page_text_sha256: pageTextSha256,
          direction_heading: currentDirection,
          line,
          reason: "removed_statement_stop_name_not_recovered",
        });
        continue;
      }
      const normalized = normalizePlan040Package2StopName(literal);
      const identity = {
        route_id: routeId,
        page_number: pageNumber,
        direction_heading: currentDirection,
        ordinal: statements.length,
        normalized_stop_name: normalized,
      };
      statements.push({
        statement_id: `plan040-package2-pdf-stop:${stableHash(
          identity as unknown as JsonValue,
        ).slice(0, 24)}`,
        page_number: pageNumber,
        page_text_sha256: pageTextSha256,
        direction_heading: currentDirection,
        stop_name_literal_raw: literal,
        normalized_stop_name: normalized,
        removal_reason: removalReason(
          `${line} ${lines[lineIndex + 1] ?? ""} ${lines[lineIndex + 2] ?? ""}`,
        ),
      });
    }
  }
  return { statements, unresolved_lines: unresolvedLines };
}

function patternEvidence(
  pattern: HistoricalFullStopPattern,
  schedule: Plan040Package2ScheduleSlice,
): Plan040Package2PatternEvidence {
  const passengerSet = new Set(schedule.passenger_shape_ids);
  const nonrevenueSet = new Set(schedule.nonrevenue_shape_ids);
  const ambiguousSet = new Set(schedule.ambiguous_shape_ids);
  const passenger = pattern.shape_ids.filter((shapeId) => passengerSet.has(shapeId)).sort();
  const nonrevenue = pattern.shape_ids.filter((shapeId) => nonrevenueSet.has(shapeId)).sort();
  const ambiguous = pattern.shape_ids.filter((shapeId) => ambiguousSet.has(shapeId)).sort();
  const unmatched = pattern.shape_ids
    .filter((shapeId) =>
      !passengerSet.has(shapeId) && !nonrevenueSet.has(shapeId) && !ambiguousSet.has(shapeId))
    .sort();
  const status = ambiguous.length > 0
    ? "reviewed_unresolved_ambiguous_trip_type" as const
    : unmatched.length > 0
      ? "reviewed_unresolved_unmatched_shape" as const
      : passenger.length > 0
      ? "accepted_passenger_shape" as const
      : nonrevenue.length > 0 && unmatched.length === 0
        ? "excluded_nonrevenue_shape" as const
        : "reviewed_unresolved_unmatched_shape" as const;
  return {
    pattern_id: pattern.pattern_id,
    snapshot_id: pattern.snapshot_id,
    service_date: pattern.service_date,
    route_id: pattern.route_id,
    direction_id: pattern.direction_id,
    trip_count: pattern.trip_count,
    shape_ids: [...pattern.shape_ids],
    headsigns: [...pattern.headsigns],
    stops: pattern.stops,
    period_trip_counts: pattern.period_trip_counts,
    schedule_validation: {
      status,
      passenger_shape_ids: passenger,
      nonrevenue_shape_ids: nonrevenue,
      unmatched_shape_ids: unmatched,
      ambiguous_shape_ids: ambiguous,
    },
  };
}

function asHistoricalPattern(
  pattern: Plan040Package2PatternEvidence,
): HistoricalFullStopPattern {
  return {
    pattern_id: pattern.pattern_id,
    snapshot_id: pattern.snapshot_id,
    service_date: pattern.service_date,
    route_id: pattern.route_id,
    direction_id: pattern.direction_id,
    trip_count: pattern.trip_count,
    trip_ids: [],
    shape_ids: pattern.shape_ids,
    headsigns: pattern.headsigns,
    stops: pattern.stops,
    period_trip_counts: pattern.period_trip_counts,
  };
}

function selectedPatterns(
  patterns: readonly Plan040Package2PatternEvidence[],
): Plan040Package2PatternEvidence[] {
  return patterns.filter((pattern) =>
    pattern.schedule_validation.status === "accepted_passenger_shape");
}

function bestComparison(
  before: Plan040Package2PatternEvidence,
  after: readonly Plan040Package2PatternEvidence[],
): HistoricalPatternComparison | undefined {
  return after
    .filter((candidate) => candidate.direction_id === before.direction_id)
    .map((candidate) => compareFullStopPatterns(
      asHistoricalPattern(before),
      asHistoricalPattern(candidate),
    ))
    .sort((left, right) =>
      Number(right.accepted) - Number(left.accepted) ||
      right.shared_stop_ids.length - left.shared_stop_ids.length ||
      left.stops_added.length + left.stops_removed.length -
        (right.stops_added.length + right.stops_removed.length) ||
      left.after_pattern_id.localeCompare(right.after_pattern_id))[0];
}

function uniqueStops(patterns: readonly Plan040Package2PatternEvidence[]): HistoricalStop[] {
  const byId = new Map<string, HistoricalStop>();
  for (const pattern of patterns) {
    for (const stop of pattern.stops) {
      const prior = byId.get(stop.stop_id);
      if (prior && prior.stop_name !== stop.stop_name) {
        throw new Error(`${stop.stop_id}: one snapshot assigns multiple stop names`);
      }
      byId.set(stop.stop_id, stop);
    }
  }
  return [...byId.values()].sort((left, right) => left.stop_id.localeCompare(right.stop_id));
}

function directionMatchedPatterns(
  patterns: readonly Plan040Package2PatternEvidence[],
  heading: string | null,
): {
  patterns: Plan040Package2PatternEvidence[];
  status: Plan040Package2StatementBinding["direction_match_status"];
} {
  if (!heading) return { patterns: [...patterns], status: "not_applicable" };
  const destination = heading.replace(/^.+?\s+to\s+/iu, "");
  const normalizedDestination = normalizePlan040Package2StopName(destination);
  const matched = patterns.filter((pattern) =>
    pattern.headsigns.some((headsign) => {
      const normalizedHeadsign = normalizePlan040Package2StopName(headsign);
      return normalizedHeadsign.includes(normalizedDestination) ||
        normalizedDestination.includes(normalizedHeadsign);
    }));
  return matched.length > 0
    ? { patterns: matched, status: "exact_headsign_match" }
    : { patterns: [...patterns], status: "unmatched" };
}

function evidenceBindings(
  candidate: Plan040AcquisitionCandidate,
  sourceId: string,
  statements: readonly Plan040Package2PdfStatement[],
  scheduleSlices: readonly Plan040Package2ScheduleSlice[],
): MemberExtentDecision["evidence_bindings"] {
  const bindings: MemberExtentDecision["evidence_bindings"] = [
    {
      role: "extent_classification",
      record_id: candidate.treatment_record_id,
      source_id: "mta_queens_bus_network_redesign_service_changes",
      evidence_id: candidate.service_change_evidence_id,
    },
    {
      role: "reference_snapshot",
      record_id: candidate.treatment_record_id,
      source_id: candidate.pre_source_id,
      evidence_id: `${candidate.pre_source_id}#receipt`,
    },
    {
      role: "reference_snapshot",
      record_id: candidate.treatment_record_id,
      source_id: candidate.post_source_id!,
      evidence_id: `${candidate.post_source_id}#receipt`,
    },
    ...[...new Set(statements.map((statement) => statement.page_number))]
      .map((pageNumber) => ({
        role: "candidate_stop_list",
        record_id: candidate.treatment_record_id,
        source_id: sourceId,
        evidence_id: `${sourceId}#page_${String(pageNumber).padStart(3, "0")}`,
      })),
    ...scheduleSlices.map((slice) => ({
      role: "schedule_trip_type_validation",
      record_id: candidate.treatment_record_id,
      source_id: slice.source_id,
      evidence_id: `${slice.source_id}#${slice.schedule_date}_${slice.route_id}`,
    })),
  ];
  return bindings.sort((left, right) =>
    `${left.role}\u0000${left.record_id}\u0000${left.source_id}\u0000${left.evidence_id}`
      .localeCompare(
        `${right.role}\u0000${right.record_id}\u0000${right.source_id}\u0000${right.evidence_id}`,
      ));
}

export function buildPlan040Package2CandidateEvidence(input: {
  candidate: Plan040AcquisitionCandidate;
  stopListSourceId: string;
  stopListPdfSha256: string;
  stopListLayoutTextSha256: string;
  stopListRawTextSha256: string;
  stopListText: string;
  prePatterns: HistoricalFullStopPattern[];
  postPatterns: HistoricalFullStopPattern[];
  preScheduleSlice: Plan040Package2ScheduleSlice;
  postScheduleSlice: Plan040Package2ScheduleSlice;
}): Plan040Package2CandidateEvidence {
  const candidate = input.candidate;
  if (candidate.inventory_status !== "accepted_reused" || !candidate.post_source_id) {
    throw new Error(`${candidate.gtfs_route_id}: Package 2 requires an accepted pre/post candidate`);
  }
  const pdfExtraction = extractPlan040Package2PdfStatements(
    candidate.gtfs_route_id,
    input.stopListText,
  );
  const prePatterns = input.prePatterns.map((pattern) =>
    patternEvidence(pattern, input.preScheduleSlice));
  const postPatterns = input.postPatterns.map((pattern) =>
    patternEvidence(pattern, input.postScheduleSlice));
  const selectedPre = selectedPatterns(prePatterns);
  const selectedPost = selectedPatterns(postPatterns);
  const comparisons = selectedPre
    .map((pattern) => bestComparison(pattern, selectedPost))
    .filter((comparison): comparison is HistoricalPatternComparison => comparison !== undefined)
    .sort((left, right) => left.comparison_id.localeCompare(right.comparison_id));
  const postStops = uniqueStops(selectedPost);
  const postById = new Map(postStops.map((stop) => [stop.stop_id, stop]));
  const statementBindings = pdfExtraction.statements.map((statement) => {
    const directionalPre = directionMatchedPatterns(
      selectedPre,
      statement.direction_heading,
    );
    const directionalPost = directionMatchedPatterns(
      selectedPost,
      statement.direction_heading,
    );
    const preByName = new Map<string, HistoricalStop[]>();
    const postByName = new Map<string, HistoricalStop[]>();
    for (const stop of uniqueStops(directionalPre.patterns)) {
      const key = normalizePlan040Package2StopName(stop.stop_name);
      preByName.set(key, [...(preByName.get(key) ?? []), stop]);
    }
    for (const stop of uniqueStops(directionalPost.patterns)) {
      const key = normalizePlan040Package2StopName(stop.stop_name);
      postByName.set(key, [...(postByName.get(key) ?? []), stop]);
    }
    const preMatches = preByName.get(statement.normalized_stop_name) ?? [];
    const preIds = [...new Set(preMatches.map((stop) => stop.stop_id))].sort();
    const postSameNameIds = [...new Set(
      (postByName.get(statement.normalized_stop_name) ?? []).map((stop) => stop.stop_id),
    )].sort();
    const postSameIdIds = preIds.filter((stopId) => postById.has(stopId));
    const verdict = preIds.length === 0
      ? "pdf_name_not_exactly_bound_to_pre_gtfs" as const
      : preIds.length > 1
        ? "ambiguous_pre_gtfs_name" as const
        : postSameIdIds.length > 0
          ? "pdf_claimed_removed_id_still_present_post" as const
          : postSameNameIds.length > 0
            ? "possible_changed_id_or_relocation" as const
            : "exact_pre_id_absent_post" as const;
    return {
      ...statement,
      direction_match_status:
        directionalPre.status === "unmatched" || directionalPost.status === "unmatched"
          ? "unmatched" as const
          : directionalPre.status === "exact_headsign_match" ||
              directionalPost.status === "exact_headsign_match"
            ? "exact_headsign_match" as const
            : "not_applicable" as const,
      pre_direction_ids: [...new Set(
        directionalPre.patterns.map((pattern) => pattern.direction_id),
      )].sort(),
      post_direction_ids: [...new Set(
        directionalPost.patterns.map((pattern) => pattern.direction_id),
      )].sort(),
      pre_stop_ids: preIds,
      post_same_name_stop_ids: postSameNameIds,
      post_same_id_stop_ids: postSameIdIds,
      verdict,
    };
  });

  const gapCodes = new Set<string>();
  const contextCodes = new Set<string>();
  const activePatternStatuses = [...prePatterns, ...postPatterns]
    .map((pattern) => pattern.schedule_validation.status);
  if (activePatternStatuses.includes("reviewed_unresolved_unmatched_shape")) {
    gapCodes.add("unmatched_active_gtfs_shape");
  }
  if (activePatternStatuses.includes("reviewed_unresolved_ambiguous_trip_type")) {
    gapCodes.add("ambiguous_schedule_trip_type_shape");
  }
  if (selectedPre.length === 0) gapCodes.add("no_schedule_validated_pre_pattern");
  if (selectedPost.length === 0) gapCodes.add("no_schedule_validated_post_pattern");
  if (pdfExtraction.statements.length === 0) gapCodes.add("no_pdf_removed_stop_statement");
  if (pdfExtraction.unresolved_lines.length > 0) gapCodes.add("pdf_removed_row_extraction_gap");
  for (const binding of statementBindings) {
    if (binding.direction_match_status === "unmatched") {
      gapCodes.add("pdf_direction_heading_not_bound_to_gtfs");
    } else if (binding.direction_match_status !== "exact_headsign_match") {
      gapCodes.add("pdf_direction_heading_missing");
    }
    if (binding.verdict !== "exact_pre_id_absent_post") gapCodes.add(binding.verdict);
  }
  if (comparisons.length !== selectedPre.length) gapCodes.add("direction_compatible_pattern_missing");
  if (comparisons.some((comparison) => !comparison.accepted)) {
    gapCodes.add("insufficient_two_boundary_pattern_identity");
  }
  const preDirections = new Map<string, number>();
  const postDirections = new Map<string, number>();
  for (const pattern of selectedPre) {
    preDirections.set(pattern.direction_id, (preDirections.get(pattern.direction_id) ?? 0) + 1);
  }
  for (const pattern of selectedPost) {
    postDirections.set(pattern.direction_id, (postDirections.get(pattern.direction_id) ?? 0) + 1);
  }
  if (
    [...preDirections.values(), ...postDirections.values()].some((count) => count !== 1) ||
    stableJson([...preDirections.keys()].sort() as unknown as JsonValue) !==
      stableJson([...postDirections.keys()].sort() as unknown as JsonValue)
  ) {
    gapCodes.add("route_pattern_variant_requires_review");
  }
  if (comparisons.some((comparison) =>
    comparison.renamed_stops.length > 0 ||
    comparison.terminal_changes.some((change) => change.classification === "replacement"))) {
    contextCodes.add("full_route_renamed_or_replacement_stop_nonexclusive");
  }
  const comparisonRemovedIds = [...new Set(
    comparisons.flatMap((comparison) => comparison.stops_removed.map((stop) => stop.stop_id)),
  )].sort();
  const exactRemovedStopIds = [...new Set(statementBindings
    .filter((binding) => binding.verdict === "exact_pre_id_absent_post")
    .flatMap((binding) => binding.pre_stop_ids))].sort();
  if (
    stableJson(comparisonRemovedIds as unknown as JsonValue) !==
    stableJson(exactRemovedStopIds as unknown as JsonValue)
  ) {
    contextCodes.add("full_route_pdf_gtfs_removed_stop_set_mismatch_nonexclusive");
  }
  const selectedPatternsForGrain = [...selectedPre, ...selectedPost];
  const grainPeriods = [...new Set(selectedPatternsForGrain.flatMap((pattern) =>
    pattern.period_trip_counts.map((period) => period.period)))].sort();
  if (grainPeriods.length === 0) gapCodes.add("grain_period_selector_missing");
  const unresolvedGapCodes = [...gapCodes].sort();
  const nonexclusiveContextCodes = [...contextCodes].sort();
  const evidenceComplete = unresolvedGapCodes.length === 0 && exactRemovedStopIds.length > 0;
  const decision: MemberExtentDecision | null = evidenceComplete ? {
    decision_id: `member-extent-review:plan040-package2-${candidate.gtfs_route_id.toLowerCase()}-stop-removal`,
    occurrence_id: candidate.occurrence_id,
    route_record_id: candidate.route_record_id,
    treatment_record_id: candidate.treatment_record_id,
    resolution: "stop_set",
    components: [{
      component_kind: "stop",
      identity_namespace: "source_literal_v1",
      identifiers: exactRemovedStopIds,
      description:
        `${candidate.gtfs_route_id} exact launch-published removed-stop set; ` +
        "every identifier is a pre-feed stop ID absent from the schedule-validated post chain.",
    }],
    evidence_bindings: evidenceBindings(
      candidate,
      input.stopListSourceId,
      pdfExtraction.statements,
      [input.preScheduleSlice, input.postScheduleSlice],
    ),
    missing_roles: [],
    rationale:
      "Frozen Package 2 draft only. The first-party route stop-list rows exactly bind the " +
      "receipt-pinned launch pre/post full-stop comparison. Cross-snapshot equivalence is " +
      "accepted only for identical stop IDs; no correction-byte result is claimed.",
    reviewed_at: "1970-01-01T00:00:00Z",
    reviewed_by: "pending-plan-040-package-2-dual-risk-review",
  } : null;
  if (decision) validateMemberExtentDecision(decision);
  const grainDecision: MemberGrainDecision | null = decision ? parseMemberGrainDecision({
    schema_version: MEMBER_GRAIN_SCHEMA_VERSION,
    contract_id: MEMBER_GRAIN_DECISION_CONTRACT_ID,
    decision_id:
      `member-grain-review:plan040-package2-${candidate.gtfs_route_id.toLowerCase()}-stop-removal`,
    occurrence_id: candidate.occurrence_id,
    route_record_id: candidate.route_record_id,
    gtfs_route_id: candidate.gtfs_route_id,
    treatment_record_id: candidate.treatment_record_id,
    member_extent_decision_id: decision.decision_id,
    service_scope: {
      kind: "trip_subset",
      periods: grainPeriods,
      directions: [...new Set(
        selectedPatternsForGrain.map((pattern) => pattern.direction_id),
      )].sort(),
      pattern_ids: [...new Set(
        selectedPatternsForGrain.map((pattern) => pattern.pattern_id),
      )].sort(),
      description:
        "Receipt-pinned launch-boundary passenger patterns in which every candidate-specific " +
        "removed-stop identifier was checked; this does not claim all-service coverage.",
    },
    lineage_segments: [],
    evidence_bindings: decision.evidence_bindings,
    rationale:
      "Frozen Package 2 grain draft. Periods, directions, and pattern IDs are derived only " +
      "from the schedule-validated launch-boundary patterns; all-service scope is not inferred.",
    reviewed_at: "1970-01-01T00:00:00Z",
    reviewed_by: "pending-plan-040-package-2-dual-risk-review",
  }) : null;
  return {
    candidate_key: extentDecisionKey(candidate),
    occurrence_id: candidate.occurrence_id,
    route_record_id: candidate.route_record_id,
    treatment_record_id: candidate.treatment_record_id,
    gtfs_route_id: candidate.gtfs_route_id,
    pre_gtfs_route_id: candidate.pre_gtfs_route_id,
    post_gtfs_route_id: candidate.post_gtfs_route_id,
    pre_source_id: candidate.pre_source_id,
    post_source_id: candidate.post_source_id,
    pre_target_date: candidate.pre_target_date,
    post_target_date: candidate.post_target_date,
    stop_list_source_id: input.stopListSourceId,
    stop_list_url: candidate.official_stop_list_url,
    stop_list_pdf_sha256: input.stopListPdfSha256,
    stop_list_layout_text_sha256: input.stopListLayoutTextSha256,
    stop_list_text_raw_sha256: input.stopListRawTextSha256,
    pdf_extraction: pdfExtraction,
    pre_schedule_slice: input.preScheduleSlice,
    post_schedule_slice: input.postScheduleSlice,
    pre_patterns: prePatterns,
    post_patterns: postPatterns,
    comparisons,
    statement_bindings: statementBindings,
    exact_removed_stop_ids: exactRemovedStopIds,
    unresolved_gap_codes: unresolvedGapCodes,
    nonexclusive_context_codes: nonexclusiveContextCodes,
    evidence_verdict: evidenceComplete
      ? "evidence_complete_stop_set"
      : "receipt_terminal_unresolved",
    proposed_extent_decision: decision,
    proposed_grain_decision: grainDecision,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}

export function buildPlan040Package2Draft(input: {
  acquisitionReceiptPath: string;
  acquisitionReceiptSha256: string;
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package2CandidateEvidence[];
}): Plan040Package2Draft {
  const candidates = [...input.candidates].sort((left, right) =>
    left.candidate_key.localeCompare(right.candidate_key));
  const keys = candidates.map((candidate) => candidate.candidate_key);
  if (candidates.length !== 24 || new Set(keys).size !== 24) {
    throw new Error(`Plan 040 Package 2 expected exact 24-key parity, received ${candidates.length}`);
  }
  for (const candidate of candidates) {
    if (
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence
    ) {
      throw new Error(`${candidate.gtfs_route_id}: Package 2 candidate gained unsupported authority`);
    }
    if (candidate.proposed_extent_decision) {
      validateMemberExtentDecision(candidate.proposed_extent_decision);
      if (extentDecisionKey(candidate.proposed_extent_decision) !== candidate.candidate_key) {
        throw new Error(`${candidate.gtfs_route_id}: proposed decision key drifted`);
      }
    }
    if (candidate.proposed_grain_decision) {
      const grain = parseMemberGrainDecision(candidate.proposed_grain_decision);
      if (memberGrainDecisionKey(grain) !== candidate.candidate_key) {
        throw new Error(`${candidate.gtfs_route_id}: proposed grain decision key drifted`);
      }
      if (grain.member_extent_decision_id !== candidate.proposed_extent_decision?.decision_id) {
        throw new Error(`${candidate.gtfs_route_id}: grain/extent proposal link drifted`);
      }
    }
    if (Boolean(candidate.proposed_extent_decision) !== Boolean(candidate.proposed_grain_decision)) {
      throw new Error(`${candidate.gtfs_route_id}: extent/grain proposal parity drifted`);
    }
  }
  const positive = candidates.filter((candidate) =>
    candidate.evidence_verdict === "evidence_complete_stop_set").length;
  return {
    schema_version: 1,
    package_id: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2,
    reviewed_commit: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_2_REVIEWED_COMMIT,
    package_1_manifest: {
      path:
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-stop-removal-acquisition-manifest-v1.json",
      sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_1_MANIFEST_SHA256,
    },
    acquisition_receipt: {
      path: input.acquisitionReceiptPath,
      sha256: input.acquisitionReceiptSha256,
    },
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 24,
    candidate_key_sha256: sha256(`${keys.join("\n")}\n`),
    evidence_verdict_distribution: {
      evidence_complete_stop_set: positive,
      receipt_terminal_unresolved: candidates.length - positive,
    },
    proposed_extent_distribution: {
      stop_set: positive,
      unresolved: candidates.length - positive,
    },
    proposed_decision_count: positive,
    persisted_decision_count: 0,
    proposed_grain_distribution: {
      trip_subset: positive,
      unresolved: candidates.length - positive,
    },
    proposed_grain_decision_count: positive,
    persisted_grain_decision_count: 0,
    candidates,
    correction_version_semantics: {
      published_launch_diff: "authoritative_for_this_draft",
      corrected_first_week_diff: "separate_non_authorizing_not_computed",
    },
    equivalence_policy: {
      automatic_equivalence: "identical_stop_id_only",
      changed_id_name_coordinate_or_proximity_equivalence: false,
    },
    authorization_state: "draft_pending_dual_independent_risk_review_and_owner_acceptance",
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}

export function plan040Package2ReplayHash(value: JsonValue): string {
  return sha256(`${stableJson(value)}\n`);
}
