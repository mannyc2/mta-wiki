import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { loadBusLaneSnapshot, type BusLaneFeature } from "../reference/bus-lanes.js";
import {
  LANE_TRAVERSAL_PARAMS,
  type LaneTraversalRow,
  type LaneTraversalVerdict,
} from "../reference/lane-traversal.js";
import {
  loadOperationalSnapshotRegistry,
  selectOperationalSnapshots,
} from "../reference/snapshot-registry.js";

export const BUS_LANE_IDENTITY_SCHEMA_VERSION = 1 as const;
export const BUS_LANE_IDENTITY_LEDGER_ID = "bus-lane-identity-v1" as const;
export const DEFAULT_BUS_LANE_IDENTITY_LEDGER_PATH =
  "data/quality/operational-reference/bus-lane-identity-ledger.jsonl";
export const DEFAULT_BUS_LANE_IDENTITY_DECISION_DIR =
  "data/quality/operational-reference/bus-lane-identity-decisions";
export const DEFAULT_BUS_LANE_PACKET_DIR =
  "data/quality/acquisition/packets/bus-lane";

export const BUS_LANE_IDENTITY_BASE_VERDICTS = [
  "unreviewed",
  "occurrence_ready",
  "refuted_no_traversal",
  "refuted_wrong_route_attribution",
  "confirmed_out_of_window",
  "onset_unresolved",
  "traversal_marginal_or_ambiguous",
  "onset_absent_after_search",
  "binding_absent_after_search",
  "superseded_duplicate",
] as const;

export type BusLaneIdentityBaseVerdict = typeof BUS_LANE_IDENTITY_BASE_VERDICTS[number];
export type BusLaneIdentityVerdict = BusLaneIdentityBaseVerdict | `occurrence_created:${string}`;
export type BusLaneMissingBinding =
  "onset" | "traversal" | "direction" | "attribution" | "feature_extent" | "phase";

type BridgeCandidate = {
  candidate_id: string;
  candidate_route_id: string;
  downstream_disposition: string;
  identity: string;
};

type TrackerCandidate = {
  candidate_id: string;
  route_id: string;
  implementation_date: string | null;
  date_precision: string | null;
};

type RouteAnchor = {
  aliases: string[];
  canonical_route_record_id: string | null;
  disposition: string;
  gtfs_route_id: string | null;
};

type PriorAcquisitionRow = {
  candidate: { candidate_id: string };
  acquisition: { receipt_id: string };
  provenance: { receipt_path: string; receipt_row_sha256: string };
  outcome: { exclusive_primary_disposition: string; next_action: string };
};

export type BusLaneFeatureMatch = {
  feature_key: string;
  feature_id: string;
  open_dates_literal: string;
  matched_token_literal: string;
  matched_date: string;
  direction: string;
  sbs_routes: string[];
};

export type BusLaneTargetGroup = {
  lane_group_id: string;
  borough: string;
  street: string;
  facility: string;
  geometry_scope: "coextensive_with_lane_group" | "mixed_date_feature_union";
  feature_matches: BusLaneFeatureMatch[];
};

export type BusLaneDossierRef = {
  artifact: string;
  row_key: string;
  verdict_class: LaneTraversalVerdict;
  reason: string;
  path_source: LaneTraversalRow["path_source"];
  service_date: string | null;
  temporal_lag_days: number | null;
  direction: string | null;
  path_identity: string | null;
  lane_group_id: string | null;
  candidate_target_match: boolean;
  stop_coordinate_coverage: number;
  overlap_miles: number;
  overlap_share: number;
  span_stop_ids: string[];
};

export type BusLaneIdentityRow = {
  schema_version: typeof BUS_LANE_IDENTITY_SCHEMA_VERSION;
  contract_id: typeof BUS_LANE_IDENTITY_LEDGER_ID;
  ledger_id: string;
  candidate_id: string;
  candidate_fingerprint: string;
  gtfs_route_id: string;
  route_record_id: string | null;
  implementation_date: string;
  date_precision: string;
  dossier_refs: BusLaneDossierRef[];
  onset_evidence: {
    dataset_fields_present: boolean;
    lane_snapshot_id: string;
    lane_source_id: string;
    target_groups: BusLaneTargetGroup[];
    staged_doc_source_ids: string[];
  };
  detector_reason_codes: string[];
  detector_verdict: BusLaneIdentityBaseVerdict;
  verdict: BusLaneIdentityVerdict;
  verdict_basis: string | null;
  decision_id: string | null;
  receipt_ids: string[];
  unresolved_bindings: BusLaneMissingBinding[];
  prior_acquisition_receipt: {
    receipt_id: string;
    artifact: string;
    row_sha256: string;
    disposition: string;
    next_action: string;
  } | null;
  updated_at: string | null;
  authorizes_study: false;
  authorizes_cross_product: false;
};

export type BusLaneIdentityDecision = {
  schema_version: typeof BUS_LANE_IDENTITY_SCHEMA_VERSION;
  contract_id: typeof BUS_LANE_IDENTITY_LEDGER_ID;
  decision_id: string;
  ledger_id: string;
  candidate_id: string;
  candidate_fingerprint: string;
  verdict: "occurrence_created" | Exclude<BusLaneIdentityBaseVerdict,
    "unreviewed" | "occurrence_ready" | "onset_unresolved" | "traversal_marginal_or_ambiguous">;
  occurrence_id: string | null;
  receipt_ids: string[];
  unresolved_bindings: BusLaneMissingBinding[];
  reviewed_at: string;
  reviewed_by: string;
  rationale: string;
  authorizes_study: false;
  authorizes_cross_product: false;
};

export type BusLaneResearchPacket = {
  schema_version: typeof BUS_LANE_IDENTITY_SCHEMA_VERSION;
  packet_id: string;
  ledger_id: string;
  candidate_id: string;
  gtfs_route_id: string;
  implementation_date: string;
  what_is_known: {
    detector_reason_codes: string[];
    target_groups: BusLaneTargetGroup[];
    dossier_summary: {
      row_count: number;
      target_row_count: number;
      counts_by_verdict: Record<LaneTraversalVerdict, number>;
      counts_by_reason: Record<string, number>;
      counts_by_path_source: Record<LaneTraversalRow["path_source"], number>;
    };
    dossier_refs: BusLaneDossierRef[];
    prior_acquisition_receipt: BusLaneIdentityRow["prior_acquisition_receipt"];
  };
  missing_binding: BusLaneMissingBinding;
  unresolved_bindings: BusLaneMissingBinding[];
  search_targets: string[];
  batch_ids: string[];
  disposition: "open" | "onset_absent_after_search" | "binding_absent_after_search" | `closed:${string}`;
  authorizes_study: false;
  authorizes_cross_product: false;
};

export type BusLanePacketBatch = {
  schema_version: typeof BUS_LANE_IDENTITY_SCHEMA_VERSION;
  batch_id: string;
  batch_kind: "corridor" | "attribution" | "multi_corridor";
  corridor_key: string;
  part: number;
  packet_ids: string[];
  packet_paths: string[];
  authorizes_study: false;
  authorizes_cross_product: false;
};

const identityRowFields = new Set([
  "authorizes_cross_product", "authorizes_study", "candidate_fingerprint", "candidate_id", "contract_id",
  "date_precision", "decision_id", "detector_reason_codes", "detector_verdict", "dossier_refs", "gtfs_route_id",
  "implementation_date", "ledger_id", "onset_evidence", "prior_acquisition_receipt", "receipt_ids",
  "route_record_id", "schema_version", "unresolved_bindings", "updated_at", "verdict", "verdict_basis",
]);
const decisionFields = new Set([
  "authorizes_cross_product", "authorizes_study", "candidate_fingerprint", "candidate_id", "contract_id",
  "decision_id", "ledger_id", "occurrence_id", "rationale", "receipt_ids", "reviewed_at", "reviewed_by",
  "schema_version", "unresolved_bindings", "verdict",
]);

function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value: unknown): string {
  return hash(stableJson(value as JsonValue));
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, fields: ReadonlySet<string>, path: string): void {
  const extras = Object.keys(value).filter((field) => !fields.has(field)).sort();
  const missing = [...fields].filter((field) => !(field in value)).sort();
  if (extras.length > 0) throw new Error(`${path}: unknown field(s): ${extras.join(", ")}`);
  if (missing.length > 0) throw new Error(`${path}: missing field(s): ${missing.join(", ")}`);
}

function nonempty(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${path}: expected non-empty string`);
  return value.trim();
}

function stringArray(value: unknown, path: string, allowEmpty = true): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new Error(`${path}: expected array`);
  const output = value.map((item, index) => nonempty(item, `${path}[${index}]`));
  if (new Set(output).size !== output.length) throw new Error(`${path}: duplicates are forbidden`);
  return output;
}

function routeTokensMatchCandidate(blockTokens: readonly string[], routeId: string): boolean {
  const candidateRouteToken = routeId.toUpperCase();
  if (blockTokens.includes(candidateRouteToken)) return true;
  if (!candidateRouteToken.endsWith("+")) return false;
  const baseRouteToken = candidateRouteToken.slice(0, -1);
  return blockTokens.some((token, tokenIndex) => {
    if (token !== baseRouteToken) return false;
    if (blockTokens[tokenIndex + 1] === "SBS") return true;
    const localAndSbsRoute = blockTokens[tokenIndex + 1] === "LOCAL" &&
      blockTokens[tokenIndex + 2] === "AND" &&
      blockTokens[tokenIndex + 3] === "SBS" &&
      (blockTokens[tokenIndex + 4] === "ROUTE" || blockTokens[tokenIndex + 4] === "ROUTES");
    const selectBusServiceSbsRoute = blockTokens.slice(tokenIndex + 1, tokenIndex + 8)
      .some((suffixToken, suffixIndex, suffixTokens) =>
        suffixToken === "SELECT" &&
        suffixTokens[suffixIndex + 1] === "BUS" &&
        suffixTokens[suffixIndex + 2] === "SERVICE" &&
        suffixTokens[suffixIndex + 3] === "SBS" &&
        (suffixTokens[suffixIndex + 4] === "ROUTE" || suffixTokens[suffixIndex + 4] === "ROUTES"));
    return localAndSbsRoute || selectBusServiceSbsRoute;
  });
}

function isoReviewTime(value: unknown, path: string): string {
  const timestamp = nonempty(value, path);
  const day = /^\d{4}-\d{2}-\d{2}$/u.test(timestamp);
  const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(timestamp);
  if ((!day && !instant) || Number.isNaN(Date.parse(day ? `${timestamp}T00:00:00Z` : timestamp))) {
    throw new Error(`${path}: expected ISO day or UTC instant`);
  }
  return timestamp;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8").split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    let value: unknown;
    try { value = JSON.parse(line) as unknown; } catch (error) {
      throw new Error(`${path}:${index + 1}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (stableJson(value as JsonValue) !== line) throw new Error(`${path}:${index + 1}: expected canonical stable JSON`);
    return [value as T];
  });
}

/** Preserve each comma-separated source token; normalization never replaces the literal. */
export function normalizeOpenDateToken(token: string): string | null {
  const match = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s*$/u.exec(token);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = match[3]!.length === 2 ? (rawYear <= 29 ? 2000 + rawYear : 1900 + rawYear) : rawYear;
  const normalized = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day
    ? normalized
    : null;
}

function openDateTokens(literal: string): Array<{ literal: string; normalized: string | null }> {
  return literal.split(",").map((token) => ({ literal: token.trim(), normalized: normalizeOpenDateToken(token) }));
}

function featureString(feature: BusLaneFeature, key: string): string {
  const value = feature.attributes[key];
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function candidateLaneTargets(features: readonly BusLaneFeature[], implementationDate: string): BusLaneTargetGroup[] {
  const matches = features.flatMap((feature) => openDateTokens(feature.opened).flatMap((token) => {
    if (token.normalized !== implementationDate) return [];
    const sbsRoutes = ["sbs_route1", "sbs_route2", "sbs_route3"].map((key) => featureString(feature, key))
      .filter(Boolean).sort();
    const featureMatch: BusLaneFeatureMatch = {
      feature_key: `dot-lane-feature:${fingerprint({
        lane_group_id: feature.lane_group_id,
        feature_id: feature.feature_id,
        direction: feature.direction,
        open_dates_literal: feature.opened,
        matched_token_literal: token.literal,
        sbs_routes: sbsRoutes,
      }).slice(0, 24)}`,
      feature_id: feature.feature_id,
      open_dates_literal: feature.opened,
      matched_token_literal: token.literal,
      matched_date: implementationDate,
      direction: feature.direction,
      sbs_routes: sbsRoutes,
    };
    return [{ feature, featureMatch }];
  }));
  const grouped = new Map<string, typeof matches>();
  for (const match of matches) {
    const group = grouped.get(match.feature.lane_group_id) ?? [];
    group.push(match);
    grouped.set(match.feature.lane_group_id, group);
  }
  return [...grouped.entries()].map(([laneGroupId, group]) => {
    const allGroupFeatures = features.filter((feature) => feature.lane_group_id === laneGroupId);
    const matchingFeatureKeys = new Set(group.map(({ feature }) => fingerprint({
      feature_id: feature.feature_id, direction: feature.direction, opened: feature.opened, attributes: feature.attributes,
    })));
    const allFeatureKeys = new Set(allGroupFeatures.map((feature) => fingerprint({
      feature_id: feature.feature_id, direction: feature.direction, opened: feature.opened, attributes: feature.attributes,
    })));
    const everyFeatureHasOnlyThisOnset = allGroupFeatures.every((feature) => {
      const tokens = openDateTokens(feature.opened);
      return tokens.length === 1 && tokens[0]!.normalized === implementationDate;
    });
    const coextensive = everyFeatureHasOnlyThisOnset && allFeatureKeys.size === matchingFeatureKeys.size &&
      [...allFeatureKeys].every((key) => matchingFeatureKeys.has(key));
    return {
      lane_group_id: laneGroupId,
      borough: group[0]!.feature.borough,
      street: group[0]!.feature.street,
      facility: group[0]!.feature.facility,
      geometry_scope: (coextensive ? "coextensive_with_lane_group" : "mixed_date_feature_union") as
        BusLaneTargetGroup["geometry_scope"],
      feature_matches: group.map(({ featureMatch }) => featureMatch)
        .sort((left, right) => left.feature_key.localeCompare(right.feature_key)),
    };
  }).sort((left, right) => left.lane_group_id.localeCompare(right.lane_group_id));
}

function routeAnchorFor(candidateRouteId: string, anchors: readonly RouteAnchor[]): RouteAnchor {
  const normalized = /^Q0[1-9]$/u.test(candidateRouteId) ? `Q${Number(candidateRouteId.slice(1))}` : candidateRouteId;
  const exact = anchors.filter((anchor) => anchor.gtfs_route_id === normalized);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) throw new Error(`${candidateRouteId}: duplicate exact GTFS route anchors`);
  const matches = anchors.filter((anchor) => anchor.gtfs_route_id !== null && anchor.aliases.includes(candidateRouteId));
  if (matches.length !== 1) throw new Error(`${candidateRouteId}: expected one route anchor, found ${matches.length}`);
  return matches[0]!;
}

function dossierRowKey(row: LaneTraversalRow): string {
  return `lane-traversal-row:${fingerprint(row).slice(0, 24)}`;
}

function dossierReference(row: LaneTraversalRow, artifact: string, targets: ReadonlySet<string>): BusLaneDossierRef {
  return {
    artifact,
    row_key: dossierRowKey(row),
    verdict_class: row.verdict_class,
    reason: row.reason,
    path_source: row.path_source,
    service_date: row.service_date,
    temporal_lag_days: row.temporal_lag_days,
    direction: row.direction,
    path_identity: row.path_identity,
    lane_group_id: row.lane_group_id,
    candidate_target_match: row.lane_group_id !== null && targets.has(row.lane_group_id),
    stop_coordinate_coverage: row.stop_coordinate_coverage,
    overlap_miles: row.overlap_miles,
    overlap_share: row.overlap_share,
    span_stop_ids: row.span.stop_ids,
  };
}

function pathKey(ref: BusLaneDossierRef): string {
  return [ref.direction ?? "", ref.path_source, ref.path_identity ?? ""].join("\0");
}

function candidateDatedCurrentPath(
  ref: BusLaneDossierRef,
  date: string,
  gtfsServiceWindows: readonly { start: string; end: string }[],
): boolean {
  return ref.path_source === "gtfs_shape" && ref.service_date === date && ref.temporal_lag_days === 0 &&
    ref.stop_coordinate_coverage >= LANE_TRAVERSAL_PARAMS.stop_coordinate_coverage_floor &&
    gtfsServiceWindows.some((window) => window.start <= date && date <= window.end);
}

function candidateDatedPositivePath(
  ref: BusLaneDossierRef,
  date: string,
  gtfsServiceWindows: readonly { start: string; end: string }[],
): boolean {
  if (ref.service_date !== date || ref.temporal_lag_days !== 0 ||
      ref.stop_coordinate_coverage < LANE_TRAVERSAL_PARAMS.stop_coordinate_coverage_floor) return false;
  if (ref.path_source === "historical_schedule_timepoint_pattern") return true;
  return candidateDatedCurrentPath(ref, date, gtfsServiceWindows);
}

function targetHasFullNegativeContract(
  target: BusLaneTargetGroup,
  refs: readonly BusLaneDossierRef[],
  date: string,
  gtfsServiceWindows: readonly { start: string; end: string }[],
): boolean {
  const paths = new Map<string, BusLaneDossierRef[]>();
  for (const ref of refs) {
    if (ref.path_identity === null || ref.path_source === "unavailable") return false;
    const rows = paths.get(pathKey(ref)) ?? [];
    rows.push(ref);
    paths.set(pathKey(ref), rows);
  }
  if (paths.size === 0) return false;
  for (const rows of paths.values()) {
    const targetRows = rows.filter((row) => row.lane_group_id === target.lane_group_id);
    if (targetRows.length > 0) {
      if (target.geometry_scope !== "coextensive_with_lane_group" ||
          targetRows.some((row) => row.verdict_class !== "no_traversal" ||
            !candidateDatedCurrentPath(row, date, gtfsServiceWindows))) return false;
      continue;
    }
    const representative = rows[0]!;
    if (!candidateDatedCurrentPath(representative, date, gtfsServiceWindows)) return false;
  }
  return true;
}

function detector(input: {
  date: string;
  targets: readonly BusLaneTargetGroup[];
  refs: readonly BusLaneDossierRef[];
  gtfsServiceWindows: readonly { start: string; end: string }[];
}): { verdict: BusLaneIdentityBaseVerdict; basis: string | null; reasons: string[] } {
  if (input.targets.length === 0) return {
    verdict: "unreviewed",
    basis: null,
    reasons: ["no_dot_feature_open_date_token_matches_candidate_date"],
  };
  const targetIds = new Set(input.targets.map((target) => target.lane_group_id));
  const targetRefs = input.refs.filter((ref) => ref.lane_group_id !== null && targetIds.has(ref.lane_group_id));
  const targetById = new Map(input.targets.map((target) => [target.lane_group_id, target]));
  const confirmed = targetRefs.some((ref) => ref.verdict_class === "traversal_confirmed" &&
    targetById.get(ref.lane_group_id!)?.geometry_scope === "coextensive_with_lane_group" &&
    candidateDatedPositivePath(ref, input.date, input.gtfsServiceWindows));
  if (confirmed) {
    if (input.date < "2023-04-01") return {
      verdict: "confirmed_out_of_window",
      basis: "detector:confirmed_target_traversal_with_official_pre_window_onset",
      reasons: ["target_traversal_confirmed", "candidate_onset_precedes_study_window"],
    };
    return {
      verdict: "occurrence_ready",
      basis: "detector:confirmed_target_traversal_with_official_dataset_onset",
      reasons: ["target_traversal_confirmed", "exact_open_dates_token_present"],
    };
  }
  if (input.targets.every((target) => targetHasFullNegativeContract(
    target, input.refs, input.date, input.gtfsServiceWindows,
  ))) {
    return {
      verdict: "refuted_no_traversal",
      basis: "detector:all_exact_date_targets_satisfy_full_negative_contract",
      reasons: ["all_exact_date_targets_satisfy_full_negative_contract"],
    };
  }
  const reasons = new Set<string>();
  if (input.targets.length > 1) reasons.add("multiple_exact_date_lane_groups_retained");
  if (input.targets.some((target) => target.geometry_scope === "mixed_date_feature_union")) {
    reasons.add("target_feature_extent_not_coextensive_with_dossier_lane_group_union");
  }
  if (targetRefs.length === 0) reasons.add("no_target_specific_dossier_overlap_row");
  for (const ref of input.refs) {
    if (ref.candidate_target_match || ref.lane_group_id === null) reasons.add(`dossier:${ref.reason}`);
  }
  for (const target of input.targets) {
    if (!targetRefs.some((ref) => ref.lane_group_id === target.lane_group_id)) {
      reasons.add(input.refs.some((ref) => ref.path_source !== "gtfs_shape")
        ? "target_absence_not_negative_for_historical_timepoint_path"
        : "target_absence_lacks_full_negative_contract");
    }
  }
  return {
    verdict: "traversal_marginal_or_ambiguous",
    basis: "detector:exact_date_target_traversal_not_deterministically_resolved",
    reasons: [...reasons].sort(),
  };
}

function decisionVerdict(decision: BusLaneIdentityDecision): BusLaneIdentityVerdict {
  if (decision.verdict !== "occurrence_created") return decision.verdict;
  if (!decision.occurrence_id) throw new Error(`${decision.decision_id}: occurrence_created requires occurrence_id`);
  return `occurrence_created:${decision.occurrence_id}`;
}

export function parseBusLaneIdentityDecision(value: unknown, path = "bus-lane identity decision"): BusLaneIdentityDecision {
  const parsed = object(value, path);
  exactKeys(parsed, decisionFields, path);
  if (parsed.schema_version !== BUS_LANE_IDENTITY_SCHEMA_VERSION || parsed.contract_id !== BUS_LANE_IDENTITY_LEDGER_ID) {
    throw new Error(`${path}: invalid contract header`);
  }
  if (parsed.authorizes_study !== false || parsed.authorizes_cross_product !== false) {
    throw new Error(`${path}: decisions never authorize study or cross-product projection`);
  }
  const supported = new Set(["occurrence_created", "refuted_no_traversal", "refuted_wrong_route_attribution",
    "confirmed_out_of_window", "onset_absent_after_search", "binding_absent_after_search", "superseded_duplicate"]);
  const verdict = nonempty(parsed.verdict, `${path}.verdict`);
  if (!supported.has(verdict)) throw new Error(`${path}.verdict: unsupported terminal review verdict ${verdict}`);
  const occurrenceId = parsed.occurrence_id === null ? null : nonempty(parsed.occurrence_id, `${path}.occurrence_id`);
  if ((verdict === "occurrence_created") !== (occurrenceId !== null)) {
    throw new Error(`${path}: occurrence_id is required only for occurrence_created`);
  }
  const receiptIds = stringArray(parsed.receipt_ids, `${path}.receipt_ids`);
  if (["refuted_no_traversal", "refuted_wrong_route_attribution", "onset_absent_after_search",
    "binding_absent_after_search"].includes(verdict) && receiptIds.length === 0) {
    throw new Error(`${path}: ${verdict} requires at least one receipt`);
  }
  const allowedBindings = new Set<BusLaneMissingBinding>([
    "onset", "traversal", "direction", "attribution", "feature_extent", "phase",
  ]);
  const unresolvedBindings = [...new Set(stringArray(parsed.unresolved_bindings, `${path}.unresolved_bindings`))]
    .sort() as BusLaneMissingBinding[];
  if (unresolvedBindings.some((binding) => !allowedBindings.has(binding))) {
    throw new Error(`${path}.unresolved_bindings: unsupported missing binding`);
  }
  if (verdict === "binding_absent_after_search") {
    if (!unresolvedBindings.some((binding) => binding !== "onset")) {
      throw new Error(`${path}: binding_absent_after_search requires at least one non-onset unresolved binding`);
    }
  } else if (verdict === "onset_absent_after_search") {
    if (stableJson(unresolvedBindings) !== stableJson(["onset"])) {
      throw new Error(`${path}: onset_absent_after_search requires exactly unresolved_bindings=[\"onset\"]`);
    }
  } else if (unresolvedBindings.length > 0) {
    throw new Error(`${path}: unresolved_bindings are allowed only for absent-after-search decisions`);
  }
  return {
    schema_version: BUS_LANE_IDENTITY_SCHEMA_VERSION,
    contract_id: BUS_LANE_IDENTITY_LEDGER_ID,
    decision_id: nonempty(parsed.decision_id, `${path}.decision_id`),
    ledger_id: nonempty(parsed.ledger_id, `${path}.ledger_id`),
    candidate_id: nonempty(parsed.candidate_id, `${path}.candidate_id`),
    candidate_fingerprint: nonempty(parsed.candidate_fingerprint, `${path}.candidate_fingerprint`),
    verdict: verdict as BusLaneIdentityDecision["verdict"],
    occurrence_id: occurrenceId,
    receipt_ids: receiptIds.sort(),
    unresolved_bindings: unresolvedBindings,
    reviewed_at: isoReviewTime(parsed.reviewed_at, `${path}.reviewed_at`),
    reviewed_by: nonempty(parsed.reviewed_by, `${path}.reviewed_by`),
    rationale: nonempty(parsed.rationale, `${path}.rationale`),
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

function applyDecision(row: BusLaneIdentityRow, decision: BusLaneIdentityDecision): BusLaneIdentityRow {
  if (decision.ledger_id !== row.ledger_id || decision.candidate_id !== row.candidate_id ||
      decision.candidate_fingerprint !== row.candidate_fingerprint) {
    throw new Error(`${decision.decision_id}: stale or mismatched decision target`);
  }
  return {
    ...row,
    verdict: decisionVerdict(decision),
    verdict_basis: `review:${decision.decision_id}`,
    decision_id: decision.decision_id,
    receipt_ids: decision.receipt_ids,
    unresolved_bindings: decision.unresolved_bindings,
    updated_at: decision.reviewed_at,
  };
}

export function buildBusLaneIdentityLedger(input: {
  bridgeCandidates: readonly BridgeCandidate[];
  trackerCandidates: readonly TrackerCandidate[];
  routeAnchors: readonly RouteAnchor[];
  dossierRows: readonly LaneTraversalRow[];
  dossierArtifact: string;
  laneFeatures: readonly BusLaneFeature[];
  laneSnapshotId: string;
  laneSourceId: string;
  gtfsServiceWindows: readonly { start: string; end: string }[];
  decisions?: readonly BusLaneIdentityDecision[] | undefined;
  priorAcquisitionRows?: readonly PriorAcquisitionRow[] | undefined;
}): BusLaneIdentityRow[] {
  const candidates = input.bridgeCandidates.filter((row) =>
    row.downstream_disposition === "source_fixable_bus_lane_occurrence_identity");
  if (new Set(candidates.map((row) => row.candidate_id)).size !== candidates.length) {
    throw new Error("bridge bus-lane candidate ids must be unique");
  }
  const trackers = new Map(input.trackerCandidates.map((row) => [row.candidate_id, row]));
  const dossierByCandidate = new Map<string, LaneTraversalRow[]>();
  for (const row of input.dossierRows) {
    const group = dossierByCandidate.get(row.candidate_id) ?? [];
    group.push(row);
    dossierByCandidate.set(row.candidate_id, group);
  }
  const prior = new Map((input.priorAcquisitionRows ?? []).map((row) => [row.candidate.candidate_id, row]));
  const decisions = new Map<string, BusLaneIdentityDecision>();
  const decisionIds = new Set<string>();
  for (const decision of input.decisions ?? []) {
    if (decisionIds.has(decision.decision_id)) throw new Error(`duplicate decision id ${decision.decision_id}`);
    if (decisions.has(decision.ledger_id)) throw new Error(`${decision.ledger_id}: multiple decisions are ambiguous`);
    decisionIds.add(decision.decision_id);
    decisions.set(decision.ledger_id, decision);
  }
  const rows = candidates.map((candidate): BusLaneIdentityRow => {
    const tracker = trackers.get(candidate.candidate_id);
    if (!tracker?.implementation_date || tracker.date_precision !== "day") {
      throw new Error(`${candidate.candidate_id}: expected exact tracker implementation day`);
    }
    const expectedIdentity = `${candidate.candidate_route_id}|bus_lane|${tracker.implementation_date}|day`;
    if (candidate.identity !== expectedIdentity || tracker.route_id !== candidate.candidate_route_id) {
      throw new Error(`${candidate.candidate_id}: bridge/tracker identity mismatch`);
    }
    const anchor = routeAnchorFor(candidate.candidate_route_id, input.routeAnchors);
    if (!anchor.gtfs_route_id) throw new Error(`${candidate.candidate_route_id}: route anchor has no GTFS identity`);
    const dossierRows = dossierByCandidate.get(candidate.candidate_id) ?? [];
    if (dossierRows.length === 0) throw new Error(`${candidate.candidate_id}: missing dossier rows`);
    if (dossierRows.some((row) => row.route_id !== tracker.route_id || row.candidate_date !== tracker.implementation_date)) {
      throw new Error(`${candidate.candidate_id}: dossier route/date mismatch`);
    }
    const targets = candidateLaneTargets(input.laneFeatures, tracker.implementation_date);
    const targetIds = new Set(targets.map((target) => target.lane_group_id));
    const refs = dossierRows.map((row) => dossierReference(row, input.dossierArtifact, targetIds))
      .sort((left, right) => left.row_key.localeCompare(right.row_key));
    const detected = detector({
      date: tracker.implementation_date,
      targets,
      refs,
      gtfsServiceWindows: input.gtfsServiceWindows,
    });
    const priorRow = prior.get(candidate.candidate_id);
    const ledgerId = `bus-lane-identity:${fingerprint({ candidate_id: candidate.candidate_id }).slice(0, 24)}`;
    const candidateFingerprint = fingerprint({
      candidate_id: candidate.candidate_id,
      gtfs_route_id: anchor.gtfs_route_id,
      implementation_date: tracker.implementation_date,
      targets,
      dossier_refs: refs,
    });
    const detectorReceiptIds = detected.verdict === "refuted_no_traversal"
      ? [`bus-lane-detector-receipt:${candidateFingerprint.slice(0, 24)}`]
      : [];
    const row: BusLaneIdentityRow = {
      schema_version: BUS_LANE_IDENTITY_SCHEMA_VERSION,
      contract_id: BUS_LANE_IDENTITY_LEDGER_ID,
      ledger_id: ledgerId,
      candidate_id: candidate.candidate_id,
      candidate_fingerprint: candidateFingerprint,
      gtfs_route_id: anchor.gtfs_route_id,
      route_record_id: anchor.canonical_route_record_id,
      implementation_date: tracker.implementation_date,
      date_precision: tracker.date_precision,
      dossier_refs: refs,
      onset_evidence: {
        dataset_fields_present: targets.length > 0,
        lane_snapshot_id: input.laneSnapshotId,
        lane_source_id: input.laneSourceId,
        target_groups: targets,
        staged_doc_source_ids: [],
      },
      detector_reason_codes: detected.reasons,
      detector_verdict: detected.verdict,
      verdict: detected.verdict,
      verdict_basis: detected.basis,
      decision_id: null,
      receipt_ids: detectorReceiptIds,
      unresolved_bindings: [],
      prior_acquisition_receipt: priorRow ? {
        receipt_id: priorRow.acquisition.receipt_id,
        artifact: priorRow.provenance.receipt_path,
        row_sha256: priorRow.provenance.receipt_row_sha256,
        disposition: priorRow.outcome.exclusive_primary_disposition,
        next_action: priorRow.outcome.next_action,
      } : null,
      updated_at: null,
      authorizes_study: false,
      authorizes_cross_product: false,
    };
    return row;
  }).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  if (rows.length !== candidates.length) throw new Error(`ledger denominator mismatch ${rows.length}/${candidates.length}`);
  const duplicateGroups = new Map<string, BusLaneIdentityRow[]>();
  for (const row of rows) {
    if (row.onset_evidence.target_groups.length === 0) continue;
    const key = stableJson({
      gtfs_route_id: row.gtfs_route_id,
      implementation_date: row.implementation_date,
      lane_group_ids: row.onset_evidence.target_groups.map((target) => target.lane_group_id),
    });
    const group = duplicateGroups.get(key) ?? [];
    group.push(row);
    duplicateGroups.set(key, group);
  }
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    const canonical = group[0]!;
    for (const duplicate of group.slice(1)) {
      duplicate.verdict = "superseded_duplicate";
      duplicate.detector_verdict = "superseded_duplicate";
      duplicate.verdict_basis = `detector:superseded_duplicate:${canonical.ledger_id}`;
      duplicate.detector_reason_codes = [`superseded_by:${canonical.ledger_id}`];
    }
  }
  const overlaid = rows.map((row) => {
    const decision = decisions.get(row.ledger_id);
    return decision ? applyDecision(row, decision) : row;
  });
  const extraDecisions = [...decisions.keys()].filter((id) => !rows.some((row) => row.ledger_id === id));
  if (extraDecisions.length > 0) throw new Error(`orphan decisions: ${extraDecisions.join(", ")}`);
  return overlaid;
}

function countBy<T extends string>(values: readonly T[], universe: readonly T[]): Record<T, number> {
  return Object.fromEntries(universe.map((value) => [value, values.filter((item) => item === value).length])) as Record<T, number>;
}

function recordCounts(values: readonly string[]): Record<string, number> {
  const output: Record<string, number> = {};
  for (const value of values) output[value] = (output[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(output).sort(([left], [right]) => left.localeCompare(right)));
}

function isOpenVerdict(verdict: BusLaneIdentityVerdict): boolean {
  return verdict === "unreviewed" || verdict === "occurrence_ready" || verdict === "onset_unresolved" ||
    verdict === "traversal_marginal_or_ambiguous";
}

function packetMissingBinding(row: BusLaneIdentityRow): BusLaneResearchPacket["missing_binding"] {
  if (row.onset_evidence.target_groups.length === 0) return "attribution";
  if (row.detector_verdict === "onset_unresolved") return "onset";
  if (row.detector_reason_codes.some((reason) => reason.includes("direction_unknown"))) return "direction";
  if (row.onset_evidence.target_groups.some((target) => target.geometry_scope === "mixed_date_feature_union")) {
    return "feature_extent";
  }
  return "traversal";
}

function packetUnresolvedBindings(row: BusLaneIdentityRow): BusLaneMissingBinding[] {
  if (row.unresolved_bindings.length > 0) return row.unresolved_bindings;
  const bindings = new Set<BusLaneMissingBinding>([packetMissingBinding(row)]);
  const targets = row.onset_evidence.target_groups;
  if (targets.length === 0) {
    bindings.add("onset");
    bindings.add("phase");
  }
  if (row.dossier_refs.every((ref) => !ref.candidate_target_match || ref.verdict_class !== "traversal_confirmed")) {
    bindings.add("traversal");
  }
  if (targets.some((target) => target.geometry_scope === "mixed_date_feature_union")) {
    bindings.add("feature_extent");
    bindings.add("phase");
  }
  const targetDirections = new Set(targets.flatMap((target) => target.feature_matches.map((feature) => feature.direction)));
  const targetRefs = row.dossier_refs.filter((ref) => ref.candidate_target_match);
  if (targetDirections.size > 1 && targetRefs.length === 0) {
    bindings.add("direction");
  }
  if (row.dossier_refs.some((ref) => ref.candidate_target_match && ref.direction && !targetDirections.has(ref.direction))) {
    bindings.add("direction");
  }
  const attributedRoutes = new Set(targets.flatMap((target) =>
    target.feature_matches.flatMap((feature) => feature.sbs_routes)));
  if (!attributedRoutes.has(row.gtfs_route_id) && (targetRefs.length === 0 || attributedRoutes.size > 0)) {
    bindings.add("attribution");
  }
  return [...bindings].sort();
}

function corridorKey(target: BusLaneTargetGroup, date: string): string {
  return `${target.borough}|${target.street}|${date}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 100);
}

export function buildBusLaneResearchPackets(rows: readonly BusLaneIdentityRow[]): {
  packets: BusLaneResearchPacket[];
  batches: BusLanePacketBatch[];
  corridorKeyCount: number;
} {
  const packetRows = rows.filter((row) => row.detector_verdict === "unreviewed" ||
    row.detector_verdict === "onset_unresolved" || row.detector_verdict === "traversal_marginal_or_ambiguous");
  const basePackets = packetRows.map((row) => {
    const verdicts: LaneTraversalVerdict[] = ["traversal_confirmed", "traversal_marginal", "no_traversal", "geometry_ambiguous"];
    const sources: LaneTraversalRow["path_source"][] = ["gtfs_shape", "historical_schedule_timepoint_pattern", "unavailable"];
    const packetId = `bus-lane-packet:${fingerprint({ ledger_id: row.ledger_id }).slice(0, 24)}`;
    const targets = row.onset_evidence.target_groups;
    const searchTargets = targets.length === 0
      ? [`NYC DOT bus-lane attribution for ${row.gtfs_route_id} on ${row.implementation_date}`]
      : targets.map((target) => `NYC DOT ${target.facility || target.street} ${target.borough} ${row.implementation_date}`);
    return {
      schema_version: BUS_LANE_IDENTITY_SCHEMA_VERSION,
      packet_id: packetId,
      ledger_id: row.ledger_id,
      candidate_id: row.candidate_id,
      gtfs_route_id: row.gtfs_route_id,
      implementation_date: row.implementation_date,
      what_is_known: {
        detector_reason_codes: row.detector_reason_codes,
        target_groups: targets,
        dossier_summary: {
          row_count: row.dossier_refs.length,
          target_row_count: row.dossier_refs.filter((ref) => ref.candidate_target_match).length,
          counts_by_verdict: countBy(row.dossier_refs.map((ref) => ref.verdict_class), verdicts),
          counts_by_reason: recordCounts(row.dossier_refs.map((ref) => ref.reason)),
          counts_by_path_source: countBy(row.dossier_refs.map((ref) => ref.path_source), sources),
        },
        dossier_refs: row.dossier_refs,
        prior_acquisition_receipt: row.prior_acquisition_receipt,
      },
      missing_binding: packetMissingBinding(row),
      unresolved_bindings: packetUnresolvedBindings(row),
      search_targets: [...new Set(searchTargets)].sort(),
      batch_ids: [] as string[],
      disposition: (isOpenVerdict(row.verdict)
        ? "open"
        : row.verdict === "onset_absent_after_search"
          ? "onset_absent_after_search"
          : row.verdict === "binding_absent_after_search"
            ? "binding_absent_after_search"
          : `closed:${row.verdict}`) as BusLaneResearchPacket["disposition"],
      authorizes_study: false as const,
      authorizes_cross_product: false as const,
    } satisfies BusLaneResearchPacket;
  });
  const packetById = new Map(basePackets.map((packet) => [packet.packet_id, packet]));
  const assignments = new Map<string, string[]>();
  for (const packet of basePackets) {
    const targets = packet.what_is_known.target_groups;
    const key = targets.length === 0
      ? `UNATTRIBUTED|${packet.implementation_date}`
      : targets.length === 1
        ? corridorKey(targets[0]!, packet.implementation_date)
        : `MULTI-CORRIDOR|${packet.implementation_date}`;
    const packetIds = assignments.get(key) ?? [];
    packetIds.push(packet.packet_id);
    assignments.set(key, packetIds);
  }
  const batches: BusLanePacketBatch[] = [];
  for (const [key, rawPacketIds] of [...assignments.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const packetIds = [...new Set(rawPacketIds)].sort();
    for (let offset = 0; offset < packetIds.length; offset += 25) {
      const part = Math.floor(offset / 25) + 1;
      const chunk = packetIds.slice(offset, offset + 25);
      const batchId = `bus-lane-${slug(key)}-part-${String(part).padStart(2, "0")}`;
      batches.push({
        schema_version: BUS_LANE_IDENTITY_SCHEMA_VERSION,
        batch_id: batchId,
        batch_kind: key.startsWith("UNATTRIBUTED|") ? "attribution" :
          key.startsWith("MULTI-CORRIDOR|") ? "multi_corridor" : "corridor",
        corridor_key: key,
        part,
        packet_ids: chunk,
        packet_paths: chunk.map((packetId) => `packets/${packetId.split(":")[1]}.json`),
        authorizes_study: false,
        authorizes_cross_product: false,
      });
      for (const packetId of chunk) packetById.get(packetId)!.batch_ids.push(batchId);
    }
  }
  const packets = [...packetById.values()].map((packet) => ({ ...packet, batch_ids: packet.batch_ids.sort() }))
    .sort((left, right) => left.packet_id.localeCompare(right.packet_id));
  if (packets.some((packet) => packet.batch_ids.length !== 1)) {
    throw new Error("Every issued packet must have exactly one owning batch");
  }
  const corridorKeys = new Set(rows.flatMap((row) => row.onset_evidence.target_groups.map((target) =>
    corridorKey(target, row.implementation_date))));
  return {
    packets,
    batches: batches.sort((left, right) => left.batch_id.localeCompare(right.batch_id)),
    corridorKeyCount: corridorKeys.size,
  };
}

export function parseBusLaneIdentityLedger(bytes: string, path = "bus-lane-identity-ledger.jsonl"): BusLaneIdentityRow[] {
  return bytes.split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    const raw = JSON.parse(line) as unknown;
    if (stableJson(raw as JsonValue) !== line) throw new Error(`${path}:${index + 1}: expected canonical stable JSON`);
    const parsed = object(raw, `${path}:${index + 1}`);
    exactKeys(parsed, identityRowFields, `${path}:${index + 1}`);
    if (parsed.schema_version !== BUS_LANE_IDENTITY_SCHEMA_VERSION || parsed.contract_id !== BUS_LANE_IDENTITY_LEDGER_ID ||
        parsed.authorizes_study !== false || parsed.authorizes_cross_product !== false) {
      throw new Error(`${path}:${index + 1}: invalid contract header`);
    }
    if (!Array.isArray(parsed.dossier_refs) || !Array.isArray(parsed.detector_reason_codes) ||
        !Array.isArray(parsed.receipt_ids) || !Array.isArray(parsed.unresolved_bindings)) {
      throw new Error(`${path}:${index + 1}: malformed arrays`);
    }
    return [raw as BusLaneIdentityRow];
  });
}

function readDecisionTree(path: string): BusLaneIdentityDecision[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isFile() && extname(entry.name) === ".json")
    .sort((left, right) => left.name.localeCompare(right.name)).map((entry) => {
      const decisionPath = join(path, entry.name);
      return parseBusLaneIdentityDecision(JSON.parse(readFileSync(decisionPath, "utf8")), decisionPath);
    });
}

function receiptFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? receiptFiles(child) : entry.isFile() && extname(entry.name) === ".json" ? [child] : [];
  }).sort();
}

function reviewedReceiptIndex(path: string): Map<string, Record<string, unknown>> {
  const output = new Map<string, Record<string, unknown>>();
  for (const receiptPath of receiptFiles(path)) {
    const parsed = object(JSON.parse(readFileSync(receiptPath, "utf8")), receiptPath);
    if (typeof parsed.receipt_id !== "string" || !parsed.receipt_id.trim()) continue;
    if (output.has(parsed.receipt_id)) throw new Error(`duplicate acquisition receipt id ${parsed.receipt_id}`);
    output.set(parsed.receipt_id, parsed);
  }
  return output;
}

export function validateReviewedReceiptRefs(rows: readonly BusLaneIdentityRow[], receiptDir: string): void {
  const receipts = reviewedReceiptIndex(receiptDir);
  for (const row of rows.filter((entry) => entry.verdict_basis?.startsWith("review:"))) {
    if (!["refuted_no_traversal", "refuted_wrong_route_attribution", "onset_absent_after_search",
      "binding_absent_after_search"].includes(row.verdict)) continue;
    for (const receiptId of row.receipt_ids) {
      const receipt = receipts.get(receiptId);
      if (!receipt) throw new Error(`${row.ledger_id}: unresolved receipt ${receiptId}`);
      if (row.verdict === "onset_absent_after_search" || row.verdict === "binding_absent_after_search") {
        const search = typeof receipt.search === "object" && receipt.search !== null && !Array.isArray(receipt.search)
          ? receipt.search as Record<string, unknown>
          : receipt;
        if (!Array.isArray(search.urls_inspected) || search.urls_inspected.length === 0) {
          throw new Error(`${receiptId}: absent-after-search receipt requires non-empty urls_inspected`);
        }
        const receiptBindings = [...new Set(stringArray(receipt.unresolved_bindings,
          `${receiptId}.unresolved_bindings`))].sort();
        if (stableJson(receiptBindings) !== stableJson(row.unresolved_bindings)) {
          throw new Error(`${receiptId}: receipt unresolved_bindings do not match the decision`);
        }
        if (receipt.candidate_id !== row.candidate_id || receipt.candidate_fingerprint !== row.candidate_fingerprint ||
            receipt.implementation_date !== row.implementation_date) {
          throw new Error(`${receiptId}: absent-after-search receipt does not match the ledger candidate`);
        }
        if (row.verdict === "binding_absent_after_search") {
          const primary = packetMissingBinding(row);
          if (!row.unresolved_bindings.includes(primary) || receipt.missing_binding !== primary) {
            throw new Error(`${receiptId}: packet primary missing_binding is not preserved in unresolved_bindings`);
          }
        }
      }
      if (row.verdict === "refuted_wrong_route_attribution") {
        if (typeof receipt.exclusive_route_exclusion !== "object" || receipt.exclusive_route_exclusion === null ||
            Array.isArray(receipt.exclusive_route_exclusion)) {
          throw new Error(`${receiptId}: wrong-route refutation lacks exclusive exact-date route evidence`);
        }
        const exclusion = object(receipt.exclusive_route_exclusion, `${receiptId}.exclusive_route_exclusion`);
        if (exclusion.excludes_shared_lane_use !== true || exclusion.candidate_id !== row.candidate_id ||
            exclusion.implementation_date !== row.implementation_date ||
            !Array.isArray(exclusion.evidence_refs) || exclusion.evidence_refs.length === 0) {
          throw new Error(`${receiptId}: wrong-route refutation lacks exclusive exact-date route evidence`);
        }
      }
    }
  }
}

export function validateBindingReceiptDrafts(
  rows: readonly BusLaneIdentityRow[],
  packets: readonly BusLaneResearchPacket[],
  receiptDir: string,
  rootDir: string,
  occurrences: readonly Record<string, unknown>[] = [],
  acceptedOccurrenceReviewDecisions: readonly Record<string, unknown>[] = [],
): void {
  const rowByCandidate = new Map(rows.map((row) => [row.candidate_id, row]));
  const packetByCandidate = new Map(packets.map((packet) => [packet.candidate_id, packet]));
  const acquiredSourceRecords = receiptFiles(join(rootDir,
    "data/quality/relationship-integrity/bus-lane-acquisition"))
    .filter((path) => path.endsWith("/acquired-source-checks.json"))
    .flatMap((path) => {
      const record = object(JSON.parse(readFileSync(path, "utf8")), path);
      return Array.isArray(record.sources)
        ? record.sources.map((source, index) => object(source, `${path}.sources[${index}]`))
        : [];
    });
  for (const receiptPath of receiptFiles(receiptDir)) {
    const receipt = object(JSON.parse(readFileSync(receiptPath, "utf8")), receiptPath);
    if (receipt.receipt_kind !== "binding_absent_after_search") continue;
    const candidateId = nonempty(receipt.candidate_id, `${receiptPath}.candidate_id`);
    const row = rowByCandidate.get(candidateId);
    const packet = packetByCandidate.get(candidateId);
    if (!row || !packet) throw new Error(`${receiptPath}: binding receipt has no current candidate packet`);
    if (receipt.candidate_fingerprint !== row.candidate_fingerprint || receipt.gtfs_route_id !== row.gtfs_route_id ||
        receipt.implementation_date !== row.implementation_date || receipt.missing_binding !== packet.missing_binding ||
        stableJson(receipt.unresolved_bindings as JsonValue) !== stableJson(packet.unresolved_bindings)) {
      throw new Error(`${receiptPath}: binding receipt candidate or unresolved-binding parity failed`);
    }
    const receiptUnresolved = stringArray(receipt.unresolved_bindings,
      `${receiptPath}.unresolved_bindings`, false);
    if (stableJson(receipt.gap_ids as JsonValue) !== stableJson([row.ledger_id]) ||
        receipt.disposition !== "binding_absent_after_search" ||
        !Array.isArray(receipt.candidate_urls) || receipt.candidate_urls.length !== 0 ||
        typeof receipt.operator !== "string" || !receipt.operator.trim()) {
      throw new Error(`${receiptPath}: binding receipt audit envelope failed`);
    }
    const target = object(receipt.target, `${receiptPath}.target`);
    const featureMatches = packet.what_is_known.target_groups.flatMap((group) => group.feature_matches);
    const expectedTarget = {
      lane_group_ids: packet.what_is_known.target_groups.map((group) => group.lane_group_id),
      feature_ids: [...new Set(featureMatches.map((feature) => feature.feature_id))].sort(),
      geometry_scopes: [...new Set(packet.what_is_known.target_groups.map((group) => group.geometry_scope))].sort(),
      matched_date: row.implementation_date,
      directions: [...new Set(featureMatches.map((feature) => feature.direction))].sort(),
      open_dates_literals: [...new Set(featureMatches.map((feature) => feature.open_dates_literal))].sort(),
      named_sbs_routes: [...new Set(featureMatches.flatMap((feature) => feature.sbs_routes))].sort(),
    };
    const targetCore = Object.fromEntries(Object.keys(expectedTarget).map((key) => [key, target[key]]));
    if (stableJson(targetCore as JsonValue) !== stableJson(expectedTarget)) {
      throw new Error(`${receiptPath}: binding receipt exact target parity failed`);
    }
    if (["feature_row_count", "feature_keys", "feature_rows"].some((key) => key in target)) {
      const expectedAccounting = {
        feature_row_count: featureMatches.length,
        feature_keys: [...new Set(featureMatches.map((feature) => feature.feature_key))].sort(),
        feature_rows: featureMatches.map((feature) => ({
          feature_key: feature.feature_key,
          feature_id: feature.feature_id,
          direction: feature.direction,
        })),
      };
      const actualAccounting = Object.fromEntries(Object.keys(expectedAccounting).map((key) => [key, target[key]]));
      if (stableJson(actualAccounting as JsonValue) !== stableJson(expectedAccounting)) {
        throw new Error(`${receiptPath}: binding receipt feature-row accounting parity failed`);
      }
    }
    const priorPointer = object(receipt.prior_receipt, `${receiptPath}.prior_receipt`);
    const expectedPrior = packet.what_is_known.prior_acquisition_receipt;
    if (!expectedPrior || priorPointer.receipt_id !== expectedPrior.receipt_id ||
        priorPointer.artifact !== expectedPrior.artifact || priorPointer.row_sha256 !== expectedPrior.row_sha256) {
      throw new Error(`${receiptPath}: binding receipt prior-receipt pointer parity failed`);
    }
    const journalPath = resolve(rootDir, expectedPrior.artifact);
    const priorLines = readFileSync(journalPath, "utf8").split(/\r?\n/u).filter(Boolean);
    const priorLine = priorLines.find((line) => {
      const parsed = object(JSON.parse(line), journalPath);
      return parsed.receipt_id === expectedPrior.receipt_id;
    });
    if (!priorLine || hash(priorLine) !== expectedPrior.row_sha256) {
      throw new Error(`${receiptPath}: binding receipt prior row hash does not resolve`);
    }
    const prior = object(JSON.parse(priorLine), `${journalPath}:${expectedPrior.receipt_id}`);
    if (receipt.searched_at !== prior.researched_on) {
      throw new Error(`${receiptPath}: normalized receipt changed the source campaign search date`);
    }
    if (receipt.occurrence_context !== undefined) {
      const context = object(receipt.occurrence_context, `${receiptPath}.occurrence_context`);
      const occurrenceId = nonempty(context.occurrence_id, `${receiptPath}.occurrence_context.occurrence_id`);
      const acceptedDecisionId = nonempty(context.accepted_decision_id,
        `${receiptPath}.occurrence_context.accepted_decision_id`);
      const occurrence = occurrences.find((value) => value.occurrence_id === occurrenceId);
      const acceptedDecision = acceptedOccurrenceReviewDecisions.find((value) =>
        value.occurrence_id === occurrenceId && value.decision_id === acceptedDecisionId);
      if (!occurrence || occurrence.review_state !== "approved" || !acceptedDecision ||
          acceptedDecision.review_state !== "approved" ||
          occurrence.occurrence_review_decision_id !== acceptedDecisionId) {
        throw new Error(`${receiptPath}: occurrence context is not bound to an accepted occurrence decision`);
      }
      const occurrenceRoutes = Array.isArray(occurrence.routes)
        ? occurrence.routes.map((value, index) => object(value, `${occurrenceId}.routes[${index}]`))
        : [];
      const evidenceBoundRoutes = occurrenceRoutes.map((route) => nonempty(route.gtfs_route_id,
        `${occurrenceId}.routes.gtfs_route_id`)).sort();
      const onset = object(occurrence.resolved_onset, `${occurrenceId}.resolved_onset`);
      const onsetDate = nonempty(onset.date, `${occurrenceId}.resolved_onset.date`);
      const treatment = object(occurrence.treatment, `${occurrenceId}.treatment`);
      const members = treatment.kind === "atomic" ? [object(treatment.member, `${occurrenceId}.treatment.member`)] :
        treatment.kind === "bundle" && Array.isArray(treatment.members)
          ? treatment.members.map((value, index) => object(value, `${occurrenceId}.treatment.members[${index}]`))
          : [];
      const expectedContext = {
        occurrence_id: occurrenceId,
        accepted_decision_id: acceptedDecisionId,
        shared_onset_date: onsetDate,
        shared_treatment_family: members.some((member) => member.treatment_family === "bus_lane") ? "bus_lane" : null,
        shared_corridor_record_ids: occurrence.physical_scope_record_ids === undefined ? [] :
          stringArray(occurrence.physical_scope_record_ids, `${occurrenceId}.physical_scope_record_ids`).sort(),
        evidence_bound_routes: evidenceBoundRoutes,
        candidate_route_bound: evidenceBoundRoutes.includes(row.gtfs_route_id),
        structural_feature_parity: false,
        context_only: true,
      };
      if (onsetDate !== row.implementation_date || expectedContext.shared_treatment_family !== "bus_lane" ||
          expectedContext.candidate_route_bound !== false ||
          stableJson(context as JsonValue) !== stableJson(expectedContext)) {
        throw new Error(`${receiptPath}: occurrence context exceeds its non-authorizing shared-corridor bounds`);
      }
    }
    if (!Array.isArray(prior.acquisition_attempts)) {
      throw new Error(`${receiptPath}: prior receipt lacks acquisition attempts`);
    }
    const attempts = prior.acquisition_attempts.map((value, index) =>
      object(value, `${journalPath}.acquisition_attempts[${index}]`));
    const exactQueries = attempts.map((attempt, index) => ({
      category: nonempty(attempt.category, `${journalPath}.acquisition_attempts[${index}].category`),
      query: nonempty(attempt.query, `${journalPath}.acquisition_attempts[${index}].query`),
      query_status: nonempty(attempt.query_status, `${journalPath}.acquisition_attempts[${index}].query_status`),
    }));
    const urls = [...new Set(attempts.flatMap((attempt, index) =>
      stringArray(attempt.urls_checked, `${journalPath}.acquisition_attempts[${index}].urls_checked`)))].sort();
    const retrievals = attempts.flatMap((attempt, attemptIndex) => {
      if (!Array.isArray(attempt.retrievals)) {
        throw new Error(`${journalPath}.acquisition_attempts[${attemptIndex}].retrievals: expected array`);
      }
      const category = nonempty(attempt.category, `${journalPath}.acquisition_attempts[${attemptIndex}].category`);
      return attempt.retrievals.map((value, retrievalIndex) => ({
        category,
        ...object(value, `${journalPath}.acquisition_attempts[${attemptIndex}].retrievals[${retrievalIndex}]`),
      }));
    });
    const expectedSearch = {
      exact_queries: exactQueries,
      domains: [...new Set(urls.map((url) => new URL(url).hostname))].sort(),
      urls_inspected: urls,
      retrievals,
      disposition: "binding_absent_after_search",
    };
    const search = object(receipt.search, `${receiptPath}.search`);
    if (stableJson(search as JsonValue) !== stableJson(expectedSearch) ||
        receipt.authorizes_study !== false || receipt.authorizes_cross_product !== false) {
      throw new Error(`${receiptPath}: binding receipt search preservation or authorization guard failed`);
    }
    if (receipt.supplemental_search !== undefined) {
      const supplemental = object(receipt.supplemental_search, `${receiptPath}.supplemental_search`);
      const supplementalCore = Object.fromEntries(Object.entries(supplemental)
        .filter(([field]) => field !== "positive_context_findings"));
      exactKeys(supplementalCore, new Set([
        "domains", "exact_queries", "finding_corrections", "operator", "retrievals", "searched_at", "urls_inspected",
      ]), `${receiptPath}.supplemental_search`);
      nonempty(supplemental.operator, `${receiptPath}.supplemental_search.operator`);
      const supplementalSearchedAt = isoReviewTime(supplemental.searched_at,
        `${receiptPath}.supplemental_search.searched_at`);
      const supplementalSearchDay = supplementalSearchedAt.slice(0, 10);
      if (!Array.isArray(supplemental.exact_queries) || supplemental.exact_queries.length === 0) {
        throw new Error(`${receiptPath}: supplemental search requires exact queries`);
      }
      const queryCategories = new Set<string>();
      for (const [index, value] of supplemental.exact_queries.entries()) {
        const query = object(value, `${receiptPath}.supplemental_search.exact_queries[${index}]`);
        exactKeys(query, new Set(["category", "query", "query_status"]),
          `${receiptPath}.supplemental_search.exact_queries[${index}]`);
        const category = nonempty(query.category, `${receiptPath}.supplemental_search.exact_queries[${index}].category`);
        const literal = nonempty(query.query, `${receiptPath}.supplemental_search.exact_queries[${index}].query`);
        const queryStatus = nonempty(query.query_status,
          `${receiptPath}.supplemental_search.exact_queries[${index}].query_status`);
        if (queryStatus !== `performed_${supplementalSearchDay}` &&
            !queryStatus.startsWith(`performed_${supplementalSearchDay}_`)) {
          throw new Error(`${receiptPath}: supplemental query status does not prove execution on the recorded search day`);
        }
        const tokens = literal.toUpperCase().split(/[^A-Z0-9+]+/u).filter(Boolean);
        if (!tokens.includes(row.gtfs_route_id.toUpperCase())) {
          throw new Error(`${receiptPath}: supplemental query does not name the exact candidate route`);
        }
        queryCategories.add(category);
      }
      for (const category of ["official_nyc_dot_lane_project", "official_public_board_committee"]) {
        if (!queryCategories.has(category)) {
          throw new Error(`${receiptPath}: supplemental search is missing ${category}`);
        }
      }
      const supplementalUrls = stringArray(supplemental.urls_inspected,
        `${receiptPath}.supplemental_search.urls_inspected`, false).sort();
      const supplementalDomains = stringArray(supplemental.domains,
        `${receiptPath}.supplemental_search.domains`, false).sort();
      const derivedDomains = [...new Set(supplementalUrls.map((url) => new URL(url).hostname))].sort();
      if (stableJson(supplementalDomains) !== stableJson(derivedDomains) ||
          derivedDomains.some((domain) => domain !== "nyc.gov" && !domain.endsWith(".nyc.gov"))) {
        throw new Error(`${receiptPath}: supplemental search URLs must resolve to the recorded official NYC domains`);
      }
      if (!Array.isArray(supplemental.retrievals) || supplemental.retrievals.length === 0) {
        throw new Error(`${receiptPath}: supplemental search requires retrieval records`);
      }
      const retrievalCategories = new Set<string>();
      const acquiredRetrievals: { url: string; sha256: string }[] = [];
      const allowedStatuses = new Set(["acquired", "not_retrieved", "not_found", "blocked"]);
      for (const [index, value] of supplemental.retrievals.entries()) {
        const retrieval = object(value, `${receiptPath}.supplemental_search.retrievals[${index}]`);
        exactKeys(retrieval, new Set(["category", "retrieved_on", "sha256", "status", "url"]),
          `${receiptPath}.supplemental_search.retrievals[${index}]`);
        const category = nonempty(retrieval.category,
          `${receiptPath}.supplemental_search.retrievals[${index}].category`);
        const url = nonempty(retrieval.url, `${receiptPath}.supplemental_search.retrievals[${index}].url`);
        const status = nonempty(retrieval.status, `${receiptPath}.supplemental_search.retrievals[${index}].status`);
        isoReviewTime(retrieval.retrieved_on, `${receiptPath}.supplemental_search.retrievals[${index}].retrieved_on`);
        if (!allowedStatuses.has(status) || !queryCategories.has(category) || !supplementalUrls.includes(url) ||
            (status === "acquired"
              ? typeof retrieval.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(retrieval.sha256)
              : retrieval.sha256 !== null)) {
          throw new Error(`${receiptPath}: supplemental retrieval does not bind query, URL, status, and hash`);
        }
        if (status === "acquired") {
          const retrievalSha256 = String(retrieval.sha256);
          if (!acquiredSourceRecords.some((source) => source.url === url &&
              source.content_sha256 === retrievalSha256 && source.retrieval_status === "acquired")) {
            throw new Error(`${receiptPath}: supplemental acquired retrieval does not resolve in immutable acquisition metadata: ${url} sha256=${retrievalSha256}`);
          }
          acquiredRetrievals.push({ url, sha256: retrievalSha256 });
        }
        retrievalCategories.add(category);
      }
      for (const category of ["official_nyc_dot_lane_project", "official_public_board_committee"]) {
        if (!retrievalCategories.has(category)) {
          throw new Error(`${receiptPath}: supplemental retrievals are missing ${category}`);
        }
      }
      if (!Array.isArray(supplemental.finding_corrections)) {
        throw new Error(`${receiptPath}: supplemental finding_corrections must be an array`);
      }
      for (const [index, value] of supplemental.finding_corrections.entries()) {
        const correctionPath = `${receiptPath}.supplemental_search.finding_corrections[${index}]`;
        const correction = object(value, correctionPath);
        const hasLegacyPdfHash = correction.source_pdf_sha256 !== undefined;
        const hasContentHash = correction.source_content_sha256 !== undefined;
        if (hasLegacyPdfHash === hasContentHash) {
          throw new Error(`${correctionPath}: correction requires exactly one source content hash`);
        }
        exactKeys(correction, new Set([
          "authorizes_cross_product", "authorizes_study", "corrected_finding", "evidence_refs",
          "prior_claim_path", "prior_claim_value", "remaining_unresolved_bindings", "source_id",
          ...(hasLegacyPdfHash
            ? ["source_pdf_sha256"]
            : ["source_artifact", "source_content_sha256"]),
          "source_url",
          "supersedes_prior_finding",
        ]), correctionPath);
        const priorClaimPath = nonempty(correction.prior_claim_path, `${correctionPath}.prior_claim_path`);
        const priorClaim = priorClaimPath.split(".").reduce<unknown>((current, segment) => {
          if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
          return (current as Record<string, unknown>)[segment];
        }, prior);
        if (priorClaimPath !== "source_findings.exact_project_route_statement_found" ||
            priorClaim !== correction.prior_claim_value || correction.prior_claim_value !== false ||
            correction.supersedes_prior_finding !== true) {
          throw new Error(`${correctionPath}: correction does not resolve and supersede the recorded false prior claim`);
        }
        const sourceId = nonempty(correction.source_id, `${correctionPath}.source_id`);
        if (!/^[a-z0-9][a-z0-9_-]*$/u.test(sourceId)) {
          throw new Error(`${correctionPath}: correction source id is not a compact staged-source id`);
        }
        const sourceUrl = nonempty(correction.source_url, `${correctionPath}.source_url`);
        const sourceContentSha256 = nonempty(
          hasLegacyPdfHash ? correction.source_pdf_sha256 : correction.source_content_sha256,
          hasLegacyPdfHash
            ? `${correctionPath}.source_pdf_sha256`
            : `${correctionPath}.source_content_sha256`,
        );
        if (!/^[a-f0-9]{64}$/u.test(sourceContentSha256)) {
          throw new Error(`${correctionPath}: correction source content hash is invalid`);
        }
        const sourceArtifact = hasLegacyPdfHash
          ? "source.pdf"
          : nonempty(correction.source_artifact, `${correctionPath}.source_artifact`);
        if ((hasLegacyPdfHash && correction.source_artifact !== undefined) ||
            (!hasLegacyPdfHash && sourceArtifact !== "source.html")) {
          throw new Error(`${correctionPath}: correction source artifact does not match its hash field`);
        }
        const stagedSourceDir = resolve(rootDir, "raw", "sources", sourceId);
        const metadataPath = join(stagedSourceDir, "metadata.json");
        const sourceArtifactPath = join(stagedSourceDir, sourceArtifact);
        const sourceBlocksPath = join(stagedSourceDir, "blocks.jsonl");
        if (![metadataPath, sourceArtifactPath, sourceBlocksPath].every(existsSync)) {
          throw new Error(`${correctionPath}: correction source is not fully staged`);
        }
        const metadata = object(JSON.parse(readFileSync(metadataPath, "utf8")), metadataPath);
        const metadataSha = typeof metadata.sha256 === "string" ? metadata.sha256.replace(/^sha256:/u, "") : null;
        const correctionTitleTokens = String(metadata.title ?? "").toUpperCase()
          .split(/[^A-Z0-9+]+/u).filter(Boolean);
        const west178CorridorTitle =
          correctionTitleTokens.includes("178") &&
          correctionTitleTokens.includes("FT") &&
          correctionTitleTokens.includes("WASHINGTON") &&
          correctionTitleTokens.includes("WADSWORTH");
        if (metadata.sourceId !== sourceId || (metadata.sourceUrl !== sourceUrl && metadata.finalUrl !== sourceUrl) ||
            metadataSha !== sourceContentSha256 || hash(readFileSync(sourceArtifactPath)) !== sourceContentSha256 ||
            !supplementalUrls.includes(sourceUrl) ||
            !acquiredRetrievals.some((retrieval) => retrieval.url === sourceUrl &&
              retrieval.sha256 === sourceContentSha256)) {
          throw new Error(`${correctionPath}: staged source metadata, URL, or content hash does not resolve`);
        }
        const stagedBlocks = readFileSync(sourceBlocksPath, "utf8").split(/\r?\n/u).filter(Boolean)
          .map((line, blockIndex) => object(JSON.parse(line), `${sourceBlocksPath}:${blockIndex + 1}`));
        const blockById = new Map(stagedBlocks.map((block) => [String(block.block_id), block]));
        const blockIndexById = new Map(stagedBlocks.map((block, blockIndex) => [String(block.block_id), blockIndex]));
        if (blockById.size !== stagedBlocks.length || stagedBlocks.length === 0) {
          throw new Error(`${correctionPath}: staged source blocks are empty or duplicate`);
        }
        if (!Array.isArray(correction.evidence_refs) || correction.evidence_refs.length === 0) {
          throw new Error(`${correctionPath}: correction requires staged source-block evidence`);
        }
        const citedBlockIds = new Set<string>();
        const citedPageWindows = new Map<number, {
          blocks: { position: number; route: boolean; tokens: Set<string> }[];
          positions: number[];
          route: boolean;
          tokens: Set<string>;
        }>();
        for (const [refIndex, refValue] of correction.evidence_refs.entries()) {
          const refPath = `${correctionPath}.evidence_refs[${refIndex}]`;
          const ref = object(refValue, refPath);
          exactKeys(ref, new Set(["block_id", "page_number", "text_sha256"]), refPath);
          const blockId = nonempty(ref.block_id, `${refPath}.block_id`);
          const textSha256 = nonempty(ref.text_sha256, `${refPath}.text_sha256`);
          const block = blockById.get(blockId);
          if (!block || citedBlockIds.has(blockId) || block.source_id !== sourceId ||
              block.page_number !== ref.page_number || block.raw_text_sha256 !== textSha256 ||
              block.raw_text_sha256 !== `sha256:${hash(String(block.raw_text ?? ""))}`) {
            throw new Error(`${refPath}: source-block id, page, or text hash does not resolve`);
          }
          citedBlockIds.add(blockId);
          const blockTokens = String(block.raw_text ?? "").toUpperCase()
            .split(/[^A-Z0-9+]+/u).filter(Boolean);
          const pageNumber = Number(block.page_number);
          const position = blockIndexById.get(blockId)!;
          const route = routeTokensMatchCandidate(blockTokens, row.gtfs_route_id);
          const pageWindow = citedPageWindows.get(pageNumber) ?? {
            blocks: [], positions: [], route: false, tokens: new Set<string>(),
          };
          pageWindow.blocks.push({ position, route, tokens: new Set(blockTokens) });
          pageWindow.positions.push(position);
          for (const token of blockTokens) pageWindow.tokens.add(token);
          if (route) pageWindow.route = true;
          citedPageWindows.set(pageNumber, pageWindow);
        }
        const boundedProjectIntersectionWindow = [...citedPageWindows.values()].some((window) =>
          window.route && window.tokens.has("PROJECT") && window.tokens.has("INTERSECTION") &&
          Math.max(...window.positions) - Math.min(...window.positions) <= 8);
        const exactUpperCorridorProposalWindow = [...citedPageWindows.values()].some((window) =>
          window.tokens.has("3RD") &&
          window.tokens.has("AVE") &&
          window.tokens.has("96TH") &&
          window.tokens.has("128TH") &&
          (window.tokens.has("PROPOSAL") || window.tokens.has("REVIEW")) &&
          Math.max(...window.positions) - Math.min(...window.positions) <= 4);
        const boundedLegacyProjectConnectionWindow = [...citedPageWindows.values()].some((window) => {
          const literalConnectionSentence = window.blocks.some((block) =>
            block.route &&
            block.tokens.has("OFFSET") &&
            block.tokens.has("BUS") &&
            block.tokens.has("LANE") &&
            block.tokens.has("PROVIDE") &&
            block.tokens.has("CONNECTIONS") &&
            block.tokens.has("SERVICES"));
          return literalConnectionSentence &&
            window.tokens.has("PROJECT") &&
            window.tokens.has("SERVES") &&
            window.tokens.has("ROUTES") &&
            Math.max(...window.positions) - Math.min(...window.positions) <= 8;
        });
        const boundedUpperCorridorConnectionWindow = exactUpperCorridorProposalWindow &&
          [...citedPageWindows.values()].some((window) => {
            const literalConnectionSentence = window.blocks.some((block) =>
              block.route &&
              block.tokens.has("CONNECTIONS") &&
              (block.tokens.has("SERVICE") || block.tokens.has("SERVICES")));
            return literalConnectionSentence &&
              window.tokens.has("SERVED") &&
              window.tokens.has("ROUTES") &&
              Math.max(...window.positions) - Math.min(...window.positions) <= 8;
          });
        const boundedProjectConnectionWindow =
          boundedLegacyProjectConnectionWindow || boundedUpperCorridorConnectionWindow;
        const boundedUpperCorridorServiceWindow = exactUpperCorridorProposalWindow &&
          [...citedPageWindows.values()].some((window) => window.blocks.some((routeBlock) =>
            routeBlock.route && window.blocks.some((servedBlock) =>
              servedBlock.tokens.has("SERVED") &&
              servedBlock.tokens.has("ROUTES") &&
              Math.abs(routeBlock.position - servedBlock.position) <= 1 &&
              !routeBlock.tokens.has("CONNECTIONS") &&
              !servedBlock.tokens.has("CONNECTIONS"))));
        const boundedWest178CorridorServiceWindow = west178CorridorTitle &&
          [...citedPageWindows.values()].some((window) =>
            window.route &&
            window.tokens.has("PROJECT") &&
            window.tokens.has("LIMITS") &&
            window.tokens.has("178TH") &&
            window.tokens.has("FT") &&
            window.tokens.has("WASHINGTON") &&
            window.tokens.has("WADSWORTH") &&
            window.tokens.has("BUS") &&
            window.tokens.has("ROUTES") &&
            Math.max(...window.positions) - Math.min(...window.positions) <= 12) &&
          [...citedPageWindows.values()].some((window) =>
            window.tokens.has("BUS") &&
            window.tokens.has("ONLY") &&
            window.tokens.has("LANE") &&
            window.tokens.has("178TH") &&
            window.tokens.has("FT") &&
            window.tokens.has("WASHINGTON") &&
            window.tokens.has("WADSWORTH") &&
            Math.max(...window.positions) - Math.min(...window.positions) <= 6);
        const boundedSecondAvenueServiceWindow =
          [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
            block.tokens.has("SECOND") &&
            block.tokens.has("AVENUE") &&
            block.tokens.has("REDESIGN") &&
            block.tokens.has("BUS") &&
            block.tokens.has("LANE"))) &&
          [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
            block.tokens.has("59") &&
            block.tokens.has("HOUSTON") &&
            block.tokens.has("SECOND") &&
            block.tokens.has("AVENUE") &&
            block.tokens.has("BUS") &&
            block.tokens.has("LANE"))) &&
          [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
            block.route &&
            block.tokens.has("SECOND") &&
            block.tokens.has("AVENUE") &&
            block.tokens.has("SERVES") &&
            block.tokens.has("M15") &&
            block.tokens.has("LOCAL") &&
            block.tokens.has("SBS") &&
            block.tokens.has("ROUTE") &&
            block.tokens.has("OFFSET") &&
            block.tokens.has("BUS") &&
            block.tokens.has("LANE")));
        const correctedFinding = object(correction.corrected_finding, `${correctionPath}.corrected_finding`);
        exactKeys(correctedFinding, new Set([
          "candidate_route_id", "finding_kind", "finding_summary", "supported_scope", "unsupported_bindings",
        ]), `${correctionPath}.corrected_finding`);
        const correctedRoute = nonempty(correctedFinding.candidate_route_id,
          `${correctionPath}.corrected_finding.candidate_route_id`);
        const correctedUnsupported = stringArray(correctedFinding.unsupported_bindings,
          `${correctionPath}.corrected_finding.unsupported_bindings`, false).sort();
        const remainingUnresolved = stringArray(correction.remaining_unresolved_bindings,
          `${correctionPath}.remaining_unresolved_bindings`, false).sort();
        nonempty(correctedFinding.finding_summary, `${correctionPath}.corrected_finding.finding_summary`);
        const isIntersectionAttribution =
          correctedFinding.finding_kind === "positive_project_intersection_attribution_nonterminal" &&
          correctedFinding.supported_scope === "project_intersection_attribution_only";
        const isProjectConnection =
          correctedFinding.finding_kind === "positive_project_connection_nonterminal" &&
          correctedFinding.supported_scope === "project_connection_service_only";
        const isProjectCorridorService =
          correctedFinding.finding_kind === "positive_project_corridor_service_nonterminal" &&
          correctedFinding.supported_scope === "project_corridor_service_only";
        if ((isIntersectionAttribution && !boundedProjectIntersectionWindow) ||
            (isProjectConnection && !boundedProjectConnectionWindow) ||
            (isProjectCorridorService &&
              !boundedUpperCorridorServiceWindow &&
              !boundedSecondAvenueServiceWindow &&
              !boundedWest178CorridorServiceWindow) ||
            (!isIntersectionAttribution && !isProjectConnection && !isProjectCorridorService)) {
          throw new Error(`${correctionPath}: staged source-block evidence does not bind the exact route to its typed project context`);
        }
        if (correctedRoute !== row.gtfs_route_id ||
            stableJson(correctedUnsupported) !== stableJson([...receiptUnresolved].sort()) ||
            stableJson(remainingUnresolved) !== stableJson([...receiptUnresolved].sort()) ||
            correction.authorizes_study !== false || correction.authorizes_cross_product !== false ||
            receipt.authorizes_study !== false || receipt.authorizes_cross_product !== false) {
          throw new Error(`${correctionPath}: correction exceeds its nonauthorizing unresolved-binding scope`);
        }
      }
      if (supplemental.positive_context_findings !== undefined) {
        if (!Array.isArray(supplemental.positive_context_findings)) {
          throw new Error(`${receiptPath}: supplemental positive_context_findings must be an array`);
        }
        for (const [index, value] of supplemental.positive_context_findings.entries()) {
          const contextPath = `${receiptPath}.supplemental_search.positive_context_findings[${index}]`;
          const context = object(value, contextPath);
          const hasLegacyPdfHash = context.source_pdf_sha256 !== undefined;
          const hasContentHash = context.source_content_sha256 !== undefined;
          if (hasLegacyPdfHash === hasContentHash) {
            throw new Error(`${contextPath}: positive context requires exactly one source content hash`);
          }
          exactKeys(context, new Set([
            "authorizes_cross_product", "authorizes_study", "context_finding", "evidence_refs",
            "remaining_unresolved_bindings", "source_id",
            ...(hasLegacyPdfHash
              ? ["source_pdf_sha256"]
              : ["source_artifact", "source_content_sha256"]),
            "source_url",
          ]), contextPath);
          const sourceId = nonempty(context.source_id, `${contextPath}.source_id`);
          const sourceUrl = nonempty(context.source_url, `${contextPath}.source_url`);
          const sourceContentSha256 = nonempty(
            hasLegacyPdfHash ? context.source_pdf_sha256 : context.source_content_sha256,
            hasLegacyPdfHash
              ? `${contextPath}.source_pdf_sha256`
              : `${contextPath}.source_content_sha256`,
          );
          if (!/^[a-z0-9][a-z0-9_-]*$/u.test(sourceId) || !/^[a-f0-9]{64}$/u.test(sourceContentSha256)) {
            throw new Error(`${contextPath}: positive-context source identity is invalid`);
          }
          const sourceArtifact = hasLegacyPdfHash
            ? "source.pdf"
            : nonempty(context.source_artifact, `${contextPath}.source_artifact`);
          if ((hasLegacyPdfHash && context.source_artifact !== undefined) ||
              (!hasLegacyPdfHash && sourceArtifact !== "source.html")) {
            throw new Error(`${contextPath}: positive-context source artifact does not match its hash field`);
          }
          const stagedSourceDir = resolve(rootDir, "raw", "sources", sourceId);
          const metadataPath = join(stagedSourceDir, "metadata.json");
          const sourceArtifactPath = join(stagedSourceDir, sourceArtifact);
          const sourceBlocksPath = join(stagedSourceDir, "blocks.jsonl");
          if (![metadataPath, sourceArtifactPath, sourceBlocksPath].every(existsSync)) {
            throw new Error(`${contextPath}: positive-context source is not fully staged`);
          }
          const metadata = object(JSON.parse(readFileSync(metadataPath, "utf8")), metadataPath);
          const metadataSha = typeof metadata.sha256 === "string" ? metadata.sha256.replace(/^sha256:/u, "") : null;
          const titleTokens = String(metadata.title ?? "").toUpperCase().split(/[^A-Z0-9+]+/u).filter(Boolean);
          const proposalSourceTitle = titleTokens.includes("PROPOSAL");
          const upperCorridorExistingConditionsTitle =
            titleTokens.includes("3RD") &&
            (titleTokens.includes("AVE") || titleTokens.includes("AVENUE")) &&
            titleTokens.includes("96TH") &&
            titleTokens.includes("128TH") &&
            titleTokens.includes("EXISTING") &&
            titleTokens.includes("CONDITIONS");
          const secondAvenueRedesignTitle =
            titleTokens.includes("REDESIGN") &&
            titleTokens.includes("SECOND") &&
            titleTokens.includes("AVENUE") &&
            titleTokens.includes("BUS") &&
            titleTokens.includes("LANE");
          const west125SbsEnforcementTitle =
            titleTokens.includes("125TH") &&
            titleTokens.includes("STREET") &&
            titleTokens.includes("SBS") &&
            titleTokens.includes("ROUTE") &&
            titleTokens.includes("ENFORCEMENT");
          const west178CorridorTitle =
            titleTokens.includes("178") &&
            titleTokens.includes("FT") &&
            titleTokens.includes("WASHINGTON") &&
            titleTokens.includes("WADSWORTH");
          if (metadata.sourceId !== sourceId || (metadata.sourceUrl !== sourceUrl && metadata.finalUrl !== sourceUrl) ||
              metadataSha !== sourceContentSha256 || hash(readFileSync(sourceArtifactPath)) !== sourceContentSha256 ||
              (!proposalSourceTitle && !upperCorridorExistingConditionsTitle && !secondAvenueRedesignTitle &&
                !west125SbsEnforcementTitle && !west178CorridorTitle) ||
              !supplementalUrls.includes(sourceUrl) ||
              !acquiredRetrievals.some((retrieval) => retrieval.url === sourceUrl &&
                retrieval.sha256 === sourceContentSha256)) {
            throw new Error(`${contextPath}: positive-context staged source metadata, URL, or content hash does not resolve`);
          }
          const stagedBlocks = readFileSync(sourceBlocksPath, "utf8").split(/\r?\n/u).filter(Boolean)
            .map((line, blockIndex) => object(JSON.parse(line), `${sourceBlocksPath}:${blockIndex + 1}`));
          const blockById = new Map(stagedBlocks.map((block) => [String(block.block_id), block]));
          const blockIndexById = new Map(stagedBlocks.map((block, blockIndex) => [String(block.block_id), blockIndex]));
          if (!Array.isArray(context.evidence_refs) || context.evidence_refs.length === 0) {
            throw new Error(`${contextPath}: positive context requires staged source-block evidence`);
          }
          const citedBlockIds = new Set<string>();
          const citedPageWindows = new Map<number, {
            blocks: { position: number; route: boolean; tokens: Set<string> }[];
            positions: number[];
            route: boolean;
            tokens: Set<string>;
          }>();
          for (const [refIndex, refValue] of context.evidence_refs.entries()) {
            const refPath = `${contextPath}.evidence_refs[${refIndex}]`;
            const ref = object(refValue, refPath);
            exactKeys(ref, new Set(["block_id", "page_number", "text_sha256"]), refPath);
            const blockId = nonempty(ref.block_id, `${refPath}.block_id`);
            const textSha256 = nonempty(ref.text_sha256, `${refPath}.text_sha256`);
            const block = blockById.get(blockId);
            if (!block || citedBlockIds.has(blockId) || block.source_id !== sourceId ||
                block.page_number !== ref.page_number || block.raw_text_sha256 !== textSha256 ||
                block.raw_text_sha256 !== `sha256:${hash(String(block.raw_text ?? ""))}`) {
              throw new Error(`${refPath}: positive-context source-block id, page, or text hash does not resolve`);
            }
            citedBlockIds.add(blockId);
            const blockTokens = String(block.raw_text ?? "").toUpperCase()
              .split(/[^A-Z0-9+]+/u).filter(Boolean);
            const pageNumber = Number(block.page_number);
            const position = blockIndexById.get(blockId)!;
            const route = routeTokensMatchCandidate(blockTokens, row.gtfs_route_id);
            const pageWindow = citedPageWindows.get(pageNumber) ?? {
              blocks: [], positions: [], route: false, tokens: new Set<string>(),
            };
            pageWindow.blocks.push({ position, route, tokens: new Set(blockTokens) });
            pageWindow.positions.push(position);
            for (const token of blockTokens) pageWindow.tokens.add(token);
            if (route) pageWindow.route = true;
            citedPageWindows.set(pageNumber, pageWindow);
          }
          const boundedServiceContext = [...citedPageWindows.values()].some((window) =>
            window.blocks.some((routeBlock) => routeBlock.route && window.blocks.some((servedBlock) =>
              (servedBlock.tokens.has("SERVED") || servedBlock.tokens.has("SERVES")) &&
              (servedBlock.tokens.has("ROUTE") || servedBlock.tokens.has("ROUTES")) &&
              Math.abs(routeBlock.position - servedBlock.position) <= 2 &&
              !routeBlock.tokens.has("CONNECTIONS") &&
              !servedBlock.tokens.has("CONNECTIONS"))));
          const boundedExplicitSbsRouteContext = [...citedPageWindows.values()].some((window) =>
            window.blocks.some((block) => block.route &&
              block.tokens.has("SELECT") &&
              block.tokens.has("BUS") &&
              block.tokens.has("SERVICE") &&
              block.tokens.has("SBS") &&
              block.tokens.has("ROUTE")));
          const exactWest178CorridorServiceWindow = west178CorridorTitle &&
            [...citedPageWindows.values()].some((window) =>
              window.route &&
              window.tokens.has("PROJECT") &&
              window.tokens.has("LIMITS") &&
              window.tokens.has("178TH") &&
              window.tokens.has("FT") &&
              window.tokens.has("WASHINGTON") &&
              window.tokens.has("WADSWORTH") &&
              window.tokens.has("BUS") &&
              window.tokens.has("ROUTES") &&
              Math.max(...window.positions) - Math.min(...window.positions) <= 12) &&
            [...citedPageWindows.values()].some((window) =>
              window.tokens.has("BUS") &&
              window.tokens.has("ONLY") &&
              window.tokens.has("LANE") &&
              window.tokens.has("178TH") &&
              window.tokens.has("FT") &&
              window.tokens.has("WASHINGTON") &&
              window.tokens.has("WADSWORTH") &&
              Math.max(...window.positions) - Math.min(...window.positions) <= 6);
          if (!boundedServiceContext && !boundedExplicitSbsRouteContext &&
              !exactWest178CorridorServiceWindow) {
            throw new Error(`${contextPath}: staged source-block evidence does not bind the exact route to bounded corridor-service context`);
          }
          const exactUpperCorridorReviewWindow = upperCorridorExistingConditionsTitle &&
            [...citedPageWindows.values()].some((window) =>
              window.tokens.has("3RD") &&
              window.tokens.has("AVE") &&
              window.tokens.has("96TH") &&
              window.tokens.has("128TH") &&
              window.tokens.has("REVIEW") &&
              Math.max(...window.positions) - Math.min(...window.positions) <= 4);
          const exactSecondAvenueProjectWindow = secondAvenueRedesignTitle &&
            [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
              block.tokens.has("59") &&
              block.tokens.has("HOUSTON") &&
              block.tokens.has("SECOND") &&
              block.tokens.has("AVENUE") &&
              block.tokens.has("BUS") &&
              block.tokens.has("LANE"))) &&
            [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
              block.route &&
              block.tokens.has("SECOND") &&
              block.tokens.has("AVENUE") &&
              block.tokens.has("SERVES") &&
              block.tokens.has("M15") &&
              block.tokens.has("LOCAL") &&
              block.tokens.has("SBS") &&
              block.tokens.has("ROUTE") &&
              block.tokens.has("OFFSET") &&
              block.tokens.has("BUS") &&
              block.tokens.has("LANE")));
          const exactWest125ExtensionWindow = west125SbsEnforcementTitle &&
            [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
              block.route &&
              block.tokens.has("M60") &&
              block.tokens.has("125TH") &&
              block.tokens.has("STREET") &&
              block.tokens.has("SELECT") &&
              block.tokens.has("BUS") &&
              block.tokens.has("SERVICE") &&
              block.tokens.has("SBS") &&
              block.tokens.has("ROUTE"))) &&
            [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
              block.tokens.has("INSTALLED") &&
              block.tokens.has("ADDITIONAL") &&
              block.tokens.has("BUS") &&
              block.tokens.has("LANES") &&
              block.tokens.has("125TH") &&
              block.tokens.has("STREET") &&
              block.tokens.has("LENOX") &&
              block.tokens.has("MORNINGSIDE") &&
              block.tokens.has("FALL") &&
              block.tokens.has("2015")));
          const finding = object(context.context_finding, `${contextPath}.context_finding`);
          exactKeys(finding, new Set([
            "candidate_route_id", "finding_kind", "finding_summary", "supported_scope", "unsupported_bindings",
          ]), `${contextPath}.context_finding`);
          const unsupported = stringArray(finding.unsupported_bindings,
            `${contextPath}.context_finding.unsupported_bindings`, false).sort();
          const remaining = stringArray(context.remaining_unresolved_bindings,
            `${contextPath}.remaining_unresolved_bindings`, false).sort();
          const commonContextScopeValid = finding.candidate_route_id === row.gtfs_route_id &&
              stableJson(unsupported) === stableJson([...receiptUnresolved].sort()) &&
              stableJson(remaining) === stableJson([...receiptUnresolved].sort()) &&
              context.authorizes_study === false && context.authorizes_cross_product === false &&
              receipt.authorizes_study === false && receipt.authorizes_cross_product === false;
          const isOtherExtentContext =
            finding.finding_kind === "positive_other_extent_context_nonterminal" &&
            finding.supported_scope === "other_extent_corridor_service_only";
          const isProjectCorridorServiceContext =
            finding.finding_kind === "positive_project_corridor_service_nonterminal" &&
            finding.supported_scope === "project_corridor_service_only";
          if (isOtherExtentContext && (!commonContextScopeValid || !proposalSourceTitle)) {
            throw new Error(`${contextPath}: positive context exceeds its nonauthorizing other-extent scope`);
          }
          if (isProjectCorridorServiceContext &&
              (!commonContextScopeValid ||
                (!exactUpperCorridorReviewWindow &&
                  !exactSecondAvenueProjectWindow &&
                  !exactWest125ExtensionWindow &&
                  !exactWest178CorridorServiceWindow) ||
                object(prior.source_findings, `${contextPath}.prior.source_findings`)
                  .exact_project_route_statement_found !== true)) {
            throw new Error(`${contextPath}: positive context exceeds its nonauthorizing project-corridor scope`);
          }
          if (!isOtherExtentContext && !isProjectCorridorServiceContext) {
            throw new Error(`${contextPath}: positive context has an unsupported typed scope`);
          }
          nonempty(finding.finding_summary, `${contextPath}.context_finding.finding_summary`);
        }
      }
    }
  }
}

export function validateOccurrenceCreatedRows(
  rows: readonly BusLaneIdentityRow[],
  occurrences: readonly Record<string, unknown>[],
  acceptedDecisions: readonly Record<string, unknown>[],
): void {
  const occurrenceById = new Map(occurrences.map((occurrence) => [String(occurrence.occurrence_id), occurrence]));
  const decisionByOccurrence = new Map(acceptedDecisions.map((decision) => [String(decision.occurrence_id), decision]));
  for (const row of rows) {
    if (!row.verdict.startsWith("occurrence_created:")) continue;
    const occurrenceId = row.verdict.slice("occurrence_created:".length);
    const occurrence = occurrenceById.get(occurrenceId);
    if (!occurrence) throw new Error(`${row.ledger_id}: occurrence_created references missing occurrence ${occurrenceId}`);
    const decision = decisionByOccurrence.get(occurrenceId);
    if (!decision || decision.review_state !== "approved") {
      throw new Error(`${row.ledger_id}: ${occurrenceId} has no accepted occurrence-review decision`);
    }
    if (occurrence.review_state !== "approved" ||
        occurrence.occurrence_review_decision_id !== decision.decision_id) {
      throw new Error(`${row.ledger_id}: ${occurrenceId} is not bound to its accepted occurrence-review decision`);
    }
    const routes = Array.isArray(occurrence.routes) ? occurrence.routes : [];
    const route = routes.map((value, index) => object(value, `${occurrenceId}.routes[${index}]`)).find((value) =>
      value.gtfs_route_id === row.gtfs_route_id && value.route_record_id === row.route_record_id);
    if (!row.route_record_id || !route || !Array.isArray(route.evidence_bindings) || route.evidence_bindings.length === 0) {
      throw new Error(`${row.ledger_id}: ${occurrenceId} lacks this evidence-bound route identity`);
    }
    const onset = object(occurrence.resolved_onset, `${occurrenceId}.resolved_onset`);
    if (onset.date !== row.implementation_date || onset.precision !== "day" ||
        !Array.isArray(onset.evidence_bindings) || onset.evidence_bindings.length === 0) {
      throw new Error(`${row.ledger_id}: ${occurrenceId} lacks the exact evidence-bound candidate onset`);
    }
    const treatment = object(occurrence.treatment, `${occurrenceId}.treatment`);
    const members = treatment.kind === "atomic" ? [object(treatment.member, `${occurrenceId}.treatment.member`)] :
      treatment.kind === "bundle" && Array.isArray(treatment.members)
        ? treatment.members.map((value, index) => object(value, `${occurrenceId}.treatment.members[${index}]`))
        : [];
    if (!members.some((member) => member.treatment_family === "bus_lane" &&
      Array.isArray(member.evidence_bindings) && member.evidence_bindings.length > 0)) {
      throw new Error(`${row.ledger_id}: ${occurrenceId} lacks an evidence-bound bus_lane treatment member`);
    }
  }
}

function acceptedOccurrenceDecisions(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  return readdirSync(path).filter((name) => extname(name) === ".json").sort().map((name) => {
    const decision = object(JSON.parse(readFileSync(join(path, name), "utf8")), join(path, name));
    if (decision.review_state !== "approved" || typeof decision.occurrence_id !== "string" ||
        typeof decision.decision_id !== "string") throw new Error(`${join(path, name)}: malformed accepted occurrence review`);
    return decision;
  });
}

function selectedDossierPath(rootDir: string, requested?: string): string {
  if (requested) return resolve(rootDir, requested);
  const directory = join(rootDir, "data/quality/operational-reference/lane-traversal");
  const paths = readdirSync(directory).filter((name) => extname(name) === ".jsonl").sort();
  if (paths.length !== 1) throw new Error(`Expected one lane-traversal dossier; pass --dossier explicitly (found ${paths.length})`);
  return join(directory, paths[0]!);
}

function trackerRows(path: string): TrackerCandidate[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { rows?: TrackerCandidate[] };
  if (!Array.isArray(parsed.rows)) throw new Error(`${path}: expected rows array`);
  return parsed.rows;
}

function priorAcquisitionRows(path: string): PriorAcquisitionRow[] {
  return existsSync(path) ? readJsonl<unknown>(path).map((row, index) => {
    const parsed = row as PriorAcquisitionRow;
    if (!parsed.candidate?.candidate_id || !parsed.acquisition?.receipt_id || !parsed.provenance?.receipt_path) {
      throw new Error(`${path}:${index + 1}: malformed prior acquisition row`);
    }
    return parsed;
  }) : [];
}

export function writeBusLaneIdentityArtifacts(options: {
  rootDir?: string;
  bridgePath?: string;
  trackerPath?: string;
  routeAnchorsPath?: string;
  dossierPath?: string;
  decisionDir?: string;
  outputPath?: string;
  packetDir?: string;
  occurrencePath?: string;
  acceptedOccurrenceDecisionDir?: string;
} = {}): {
  rows: BusLaneIdentityRow[];
  packets: BusLaneResearchPacket[];
  batches: BusLanePacketBatch[];
  summary: Record<string, JsonValue>;
  outputPath: string;
  packetDir: string;
} {
  const rootDir = resolve(options.rootDir ?? repoRoot);
  const bridgePath = resolve(rootDir, options.bridgePath ?? "data/quality/study-readiness/v1/bridge-ledger.jsonl");
  const trackerPath = resolve(rootDir, options.trackerPath ?? "data/quality/study-readiness/v1/tracker-rc26-input.json");
  const routeAnchorsPath = resolve(rootDir, options.routeAnchorsPath ?? "data/exports/releases/v1-rc26/route_anchors.jsonl");
  const dossierPath = selectedDossierPath(rootDir, options.dossierPath);
  const decisionDir = resolve(rootDir, options.decisionDir ?? DEFAULT_BUS_LANE_IDENTITY_DECISION_DIR);
  const outputPath = resolve(rootDir, options.outputPath ?? DEFAULT_BUS_LANE_IDENTITY_LEDGER_PATH);
  const packetDir = resolve(rootDir, options.packetDir ?? DEFAULT_BUS_LANE_PACKET_DIR);
  const occurrencePath = resolve(rootDir, options.occurrencePath ?? "data/exports/releases/v1-rc27/operational_occurrences.jsonl");
  const acceptedOccurrenceDecisionDir = resolve(rootDir,
    options.acceptedOccurrenceDecisionDir ?? "data/operational-occurrence-review/accepted/decisions");
  const dossierRows = readJsonl<LaneTraversalRow>(dossierPath);
  if (dossierRows.length === 0) throw new Error(`${dossierPath}: empty dossier`);
  const laneSnapshotIds = new Set(dossierRows.map((row) => row.inputs.lane_snapshot_id));
  if (laneSnapshotIds.size !== 1) throw new Error(`${dossierPath}: mixed lane snapshot ids`);
  const laneSnapshotId = [...laneSnapshotIds][0]!;
    const registry = loadOperationalSnapshotRegistry(join(rootDir, "data/reference/operational/snapshots.json"));
  const laneSnapshot = selectOperationalSnapshots(registry, [laneSnapshotId], "dot_bus_lanes")[0]!;
  const decisions = readDecisionTree(decisionDir);
  const rows = buildBusLaneIdentityLedger({
    bridgeCandidates: readJsonl<BridgeCandidate>(bridgePath),
    trackerCandidates: trackerRows(trackerPath),
    routeAnchors: readJsonl<RouteAnchor>(routeAnchorsPath),
    dossierRows,
    dossierArtifact: relative(rootDir, dossierPath),
    laneFeatures: loadBusLaneSnapshot(laneSnapshot, rootDir),
    laneSnapshotId,
    laneSourceId: laneSnapshot.source_id,
    gtfsServiceWindows: registry.snapshots.filter((snapshot) => snapshot.kind === "gtfs_static")
      .flatMap((snapshot) => snapshot.service_window ? [snapshot.service_window] : []),
    decisions,
    priorAcquisitionRows: priorAcquisitionRows(join(rootDir, "data/quality/relationship-integrity/bus-lane-acquisition/campaign.jsonl")),
  });
  validateReviewedReceiptRefs(rows, join(rootDir, "data/quality/acquisition/receipts"));
  const occurrences = readJsonl<Record<string, unknown>>(occurrencePath);
  const occurrenceReviewDecisions = acceptedOccurrenceDecisions(acceptedOccurrenceDecisionDir);
  validateOccurrenceCreatedRows(
    rows,
    occurrences,
    occurrenceReviewDecisions,
  );
  const ledgerBytes = rows.map((row) => stableJson(row as unknown as JsonValue)).join("\n") + (rows.length ? "\n" : "");
  parseBusLaneIdentityLedger(ledgerBytes, outputPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, ledgerBytes);
  const detectorReceiptDir = join(rootDir, "data/quality/acquisition/receipts/bus-lane-detector");
  mkdirSync(detectorReceiptDir, { recursive: true });
  for (const row of rows.filter((entry) => entry.detector_verdict === "refuted_no_traversal")) {
    const receiptId = row.receipt_ids[0];
    if (!receiptId) throw new Error(`${row.ledger_id}: detector refutation has no receipt`);
    const receipt = {
      schema_version: BUS_LANE_IDENTITY_SCHEMA_VERSION,
      receipt_id: receiptId,
      receipt_kind: "deterministic_lane_traversal_refutation",
      candidate_id: row.candidate_id,
      candidate_fingerprint: row.candidate_fingerprint,
      implementation_date: row.implementation_date,
      lane_snapshot_id: row.onset_evidence.lane_snapshot_id,
      target_groups: row.onset_evidence.target_groups,
      dossier_refs: row.dossier_refs,
      rationale: "Every retained exact-date target satisfies the Plan 038 full negative contract on candidate-dated current GTFS paths.",
      authorizes_study: false,
      authorizes_cross_product: false,
    };
    writeFileSync(join(detectorReceiptDir, `${receiptId.split(":")[1]}.json`), `${stableJson(receipt as JsonValue)}\n`);
  }
  const packetBuild = buildBusLaneResearchPackets(rows);
  const bindingReceiptDraftDir = join(rootDir, "data/quality/acquisition/receipts/bus-lane-review");
  validateBindingReceiptDrafts(
    rows,
    packetBuild.packets,
    bindingReceiptDraftDir,
    rootDir,
    occurrences,
    occurrenceReviewDecisions,
  );
  mkdirSync(join(packetDir, "packets"), { recursive: true });
  mkdirSync(join(packetDir, "batches"), { recursive: true });
  const expectedPacketFiles = new Set<string>();
  for (const packet of packetBuild.packets) {
    const name = `${packet.packet_id.split(":")[1]}.json`;
    expectedPacketFiles.add(name);
    writeFileSync(join(packetDir, "packets", name), `${stableJson(packet as unknown as JsonValue)}\n`);
  }
  for (const existing of readdirSync(join(packetDir, "packets"))) {
    if (extname(existing) === ".json" && !expectedPacketFiles.has(existing)) {
      throw new Error(`${join(packetDir, "packets", existing)}: stale packet; remove only after review`);
    }
  }
  const expectedBatchFiles = new Set<string>();
  for (const batch of packetBuild.batches) {
    const name = `${batch.batch_id}.json`;
    expectedBatchFiles.add(name);
    writeFileSync(join(packetDir, "batches", name), `${stableJson(batch as unknown as JsonValue)}\n`);
  }
  for (const existing of readdirSync(join(packetDir, "batches"))) {
    if (extname(existing) === ".json" && !expectedBatchFiles.has(existing)) {
      throw new Error(`${join(packetDir, "batches", existing)}: stale batch; remove only after review`);
    }
  }
  const verdicts = rows.map((row) => row.verdict);
  const targetCounts = rows.map((row) => row.onset_evidence.target_groups.length);
  const inputs = {
    bridge: { path: relative(rootDir, bridgePath), sha256: hash(readFileSync(bridgePath)) },
    tracker: { path: relative(rootDir, trackerPath), sha256: hash(readFileSync(trackerPath)) },
    route_anchors: { path: relative(rootDir, routeAnchorsPath), sha256: hash(readFileSync(routeAnchorsPath)) },
    dossier: { path: relative(rootDir, dossierPath), sha256: hash(readFileSync(dossierPath)) },
    registry: { path: "data/reference/operational/snapshots.json", sha256: hash(readFileSync(join(rootDir, "data/reference/operational/snapshots.json"))) },
    occurrences: { path: relative(rootDir, occurrencePath), sha256: hash(readFileSync(occurrencePath)) },
    accepted_occurrence_decisions: {
      path: relative(rootDir, acceptedOccurrenceDecisionDir),
      sha256: fingerprint(receiptFiles(acceptedOccurrenceDecisionDir).map((path) => ({
        path: relative(acceptedOccurrenceDecisionDir, path), sha256: hash(readFileSync(path)),
      }))),
    },
    binding_receipt_drafts: {
      path: relative(rootDir, bindingReceiptDraftDir),
      sha256: fingerprint(receiptFiles(bindingReceiptDraftDir).map((path) => ({
        path: relative(bindingReceiptDraftDir, path), sha256: hash(readFileSync(path)),
      }))),
    },
  };
  const summary = {
    schema_version: BUS_LANE_IDENTITY_SCHEMA_VERSION,
    contract_id: BUS_LANE_IDENTITY_LEDGER_ID,
    denominator: rows.length,
    counts_by_verdict: recordCounts(verdicts),
    counts_by_target_group_count: recordCounts(targetCounts.map(String)),
    candidate_with_exact_date_target_count: rows.filter((row) => row.onset_evidence.target_groups.length > 0).length,
    candidate_without_exact_date_target_count: rows.filter((row) => row.onset_evidence.target_groups.length === 0).length,
    packet_count: packetBuild.packets.length,
    open_packet_count: packetBuild.packets.filter((packet) => packet.disposition === "open").length,
    target_corridor_key_count: packetBuild.corridorKeyCount,
    batch_ownership_key_count: new Set(packetBuild.batches.map((batch) => batch.corridor_key)).size,
    // Compatibility alias retained for consumers of the first Plan039 artifact cut.
    owning_batch_key_count: new Set(packetBuild.batches.map((batch) => batch.corridor_key)).size,
    counts_by_batch_kind: recordCounts(packetBuild.batches.map((batch) => batch.batch_kind)),
    batch_count: packetBuild.batches.length,
    maximum_batch_size: Math.max(0, ...packetBuild.batches.map((batch) => batch.packet_ids.length)),
    decision_count: decisions.length,
    ledger_sha256: hash(ledgerBytes),
    inputs,
    authorizes_study: false,
    authorizes_cross_product: false,
  } satisfies Record<string, JsonValue>;
  writeFileSync(join(packetDir, "summary.json"), `${stableJson(summary)}\n`);
  return { rows, packets: packetBuild.packets, batches: packetBuild.batches, summary, outputPath, packetDir };
}
