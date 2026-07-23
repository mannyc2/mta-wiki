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

function isExactKingsHighwayPacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const group = packet.what_is_known.target_groups[0];
  if (!group) return false;
  const matches = group.feature_matches;
  const expectedBindings = row.gtfs_route_id === "B82"
    ? ["direction", "traversal"]
    : ["attribution", "direction", "traversal"];
  return packet.what_is_known.target_groups.length === 1 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    group.lane_group_id === "BK|KINGS HIGHWAY" &&
    group.geometry_scope === "coextensive_with_lane_group" &&
    row.implementation_date === "2018-10-05" &&
    matches.length === 67 &&
    new Set(matches.map((match) => match.feature_key)).size === 67 &&
    new Set(matches.map((match) => match.feature_id)).size === 36 &&
    matches.every((match) =>
      match.matched_date === "2018-10-05" &&
      match.matched_token_literal === "10/05/2018" &&
      match.open_dates_literal === "10/05/2018" &&
      stableJson(match.sbs_routes) === stableJson(["B82"])) &&
    stableJson([...new Set(matches.map((match) => match.direction))].sort()) ===
      stableJson(["EB", "WB"]) &&
    stableJson(packet.unresolved_bindings) === stableJson(expectedBindings);
}

function isExactUticaAvenuePacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const group = packet.what_is_known.target_groups[0];
  if (!group) return false;
  const matches = group.feature_matches;
  const targetContract = row.implementation_date === "2014-08-25" &&
      (row.gtfs_route_id === "B12" || row.gtfs_route_id === "B14")
    ? { featureRowCount: 26, featureIdCount: 16, dateLiteral: "8/25/2014",
      directions: ["NB", "SB"],
      unresolvedBindings: ["attribution", "direction", "feature_extent", "phase", "traversal"] }
    : row.implementation_date === "2015-10-16" && row.gtfs_route_id === "B8"
      ? { featureRowCount: 48, featureIdCount: 26, dateLiteral: "10/16/2015",
        directions: ["NB", "SB"],
        unresolvedBindings: ["attribution", "direction", "feature_extent", "phase", "traversal"] }
      : row.implementation_date === "2016-06-03" && row.gtfs_route_id === "B15"
        ? { featureRowCount: 3, featureIdCount: 3, dateLiteral: "6/3/2016",
          directions: ["NB"], unresolvedBindings: ["attribution", "feature_extent", "phase", "traversal"] }
        : null;
  if (!targetContract) return false;
  return packet.what_is_known.target_groups.length === 1 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    group.lane_group_id === "BK|UTICA AVENUE" &&
    group.geometry_scope === "mixed_date_feature_union" &&
    matches.length === targetContract.featureRowCount &&
    new Set(matches.map((match) => match.feature_key)).size === targetContract.featureRowCount &&
    new Set(matches.map((match) => match.feature_id)).size === targetContract.featureIdCount &&
    matches.every((match) =>
      match.matched_date === row.implementation_date &&
      match.matched_token_literal === targetContract.dateLiteral &&
      match.open_dates_literal === targetContract.dateLiteral &&
      stableJson(match.sbs_routes) === stableJson(["B46"])) &&
    stableJson([...new Set(matches.map((match) => match.direction))].sort()) ===
      stableJson(targetContract.directions) &&
    stableJson(packet.unresolved_bindings) === stableJson(targetContract.unresolvedBindings);
}

function isExactVanSinderenPacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const group = packet.what_is_known.target_groups[0];
  if (!group) return false;
  const matches = group.feature_matches;
  return row.gtfs_route_id === "B111" && row.implementation_date === "2016-01-01" &&
    packet.what_is_known.target_groups.length === 1 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    group.lane_group_id === "BK|VAN SINDEREN AVENUE" &&
    group.geometry_scope === "coextensive_with_lane_group" &&
    matches.length === 4 &&
    new Set(matches.map((match) => match.feature_key)).size === 4 &&
    new Set(matches.map((match) => match.feature_id)).size === 4 &&
    matches.every((match) =>
      match.direction === "SB" &&
      match.matched_date === "2016-01-01" &&
      match.matched_token_literal === "1/1/2016" &&
      match.open_dates_literal === "1/1/2016" &&
      match.sbs_routes.length === 0) &&
    stableJson(packet.unresolved_bindings) === stableJson(["attribution", "traversal"]);
}

const PENNSYLVANIA_AVENUE_B83_EXPECTED_OCCURRENCES = [
  ["dot-lane-feature:088dbfd098bee30421a58be0", "0046968", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:0aebefbb9df01b1b03063864", "0046980", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:0f7adea56913d963e5d197f8", "9009290", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:0fb22348e0a249fd809fddd2", "0046977", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:1224729d1c38c972236e39cd", "9009291", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:2f5a4d690b95c0e5d3232a55", "9009265", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:3b46470b480dcb432c1d1556", "0046972", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:5e336f3a7965551e4f6af2d7", "0168096", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:627cc2225ffc7c283709b86c", "0046977", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:65907c81b1999c7f52f5a5e3", "9009290", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:65d474260b33f82c64a54779", "0046974", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:71f6229c72ecc4726ab3b819", "9009291", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:77b18291feda731598b9137d", "0046980", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:7e7db264e5def1b81d508728", "0046916", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:877106b961c9d6ee1668966e", "0046922", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:97cb3338e05c4bbae531b3bf", "0046968", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:9a0c4fc09a9b7fd29e28269f", "0292895", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:9fe1e0985ddec6330ecc4f70", "0046912", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:af4ca2d6e644e169906fd052", "0046912", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:afcf5232cdbb3bc32291db7a", "9009248", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:b309f717fd810a40eaad2c8c", "0292895", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:b4d58471b6880ade47f12653", "0046914", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:b88a244257690b3ef89d69b0", "9009249", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:c6eee6d0d01d6b523ebc60e4", "9009266", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:c861f2636b602ada25369cab", "0046974", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:ca62fd89a0aa98f4572c2752", "0046922", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:d2ff505f424de2b3b5e91fa0", "0046969", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:da73e1c82a74c36f9ce90655", "9009265", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:dd675f67fcc798acef9e379c", "0292894", "SB", "06/30/2018", []],
  ["dot-lane-feature:e7b607bf9ad4081fc6e32b03", "0292894", "NB", "06/30/2018", []],
  ["dot-lane-feature:e9c402317f0073174dc1484a", "0168096", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:ede2d4043541fe11903b95f6", "0046916", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:f4962935967fa5191a6f6aca", "0046914", "SB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:f4b48f5d91b983d04e9edb68", "9009266", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:f801175c9a278dd6cf9df67c", "0046969", "NB", "6/30/2018", ["B82"]],
  ["dot-lane-feature:fd5ec6f189ef25e3fe57be60", "0046972", "SB", "6/30/2018", ["B82"]],
] as const;

function isExactPennsylvaniaAvenuePacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const group = packet.what_is_known.target_groups[0];
  if (!group) return false;
  const matches = group.feature_matches;
  const actualOccurrences = matches.map((match) => [
    match.feature_key,
    match.feature_id,
    match.direction,
    match.open_dates_literal,
    match.sbs_routes,
  ]);
  return row.gtfs_route_id === "B83" && row.implementation_date === "2018-06-30" &&
    packet.missing_binding === "traversal" &&
    packet.what_is_known.target_groups.length === 1 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    group.lane_group_id === "BK|PENNSYLVANIA AVENUE" &&
    group.geometry_scope === "coextensive_with_lane_group" &&
    stableJson(actualOccurrences) ===
      stableJson(PENNSYLVANIA_AVENUE_B83_EXPECTED_OCCURRENCES as unknown as JsonValue) &&
    matches.every((match) => match.matched_date === "2018-06-30" &&
      match.matched_token_literal === match.open_dates_literal) &&
    stableJson([...new Set(matches.map((match) => match.feature_id))].sort()) === stableJson([
      "0046912", "0046914", "0046916", "0046922", "0046968", "0046969", "0046972", "0046974",
      "0046977", "0046980", "0168096", "0292894", "0292895", "9009248", "9009249", "9009265",
      "9009266", "9009290", "9009291",
    ]) &&
    stableJson([...new Set(matches.map((match) => match.direction))].sort()) === stableJson(["NB", "SB"]) &&
    stableJson(packet.unresolved_bindings) === stableJson(["attribution", "direction", "traversal"]);
}

function isExactMalcolmXPacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const group = packet.what_is_known.target_groups[0];
  if (!group) return false;
  const matches = group.feature_matches;
  return row.gtfs_route_id === "B46+" && row.implementation_date === "2020-07-23" &&
    packet.missing_binding === "traversal" &&
    packet.what_is_known.target_groups.length === 1 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    group.lane_group_id === "BK|MALCOLM X BOULEVARD" &&
    group.geometry_scope === "coextensive_with_lane_group" &&
    stableJson(matches.map((match) => [
      match.feature_key,
      match.feature_id,
      match.direction,
      match.matched_date,
      match.matched_token_literal,
      match.open_dates_literal,
      match.sbs_routes,
    ])) === stableJson([
      ["dot-lane-feature:3d68daf8efafa9f17294e4af", "0167508", "SB", "2020-07-23", "7/23/2020", "7/23/2020", []],
      ["dot-lane-feature:ddb0d1878314da8126519bf8", "0167509", "SB", "2020-07-23", "7/23/2020", "7/23/2020", []],
      ["dot-lane-feature:f0730cb4a0e5a70a3d333f36", "0043423", "SB", "2020-07-23", "7/23/2020", "7/23/2020", []],
    ]) &&
    stableJson(packet.unresolved_bindings) === stableJson(["attribution", "traversal"]);
}

function isExactNassauAvenuePacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const group = packet.what_is_known.target_groups[0];
  if (!group) return false;
  const matches = group.feature_matches;
  return (row.gtfs_route_id === "B43" || row.gtfs_route_id === "B48") &&
    row.implementation_date === "2018-08-24" &&
    packet.missing_binding === "traversal" &&
    packet.what_is_known.target_groups.length === 1 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    group.lane_group_id === "BK|NASSAU AVENUE" &&
    group.geometry_scope === "coextensive_with_lane_group" &&
    stableJson(matches.map((match) => [
      match.feature_key,
      match.feature_id,
      match.direction,
      match.matched_date,
      match.matched_token_literal,
      match.open_dates_literal,
      match.sbs_routes,
    ])) === stableJson([
      ["dot-lane-feature:39ed47bda006298451c0d8f5", "0035256", "WB", "2018-08-24", "8/24/2018", "8/24/2018", []],
    ]) &&
    stableJson(packet.unresolved_bindings) === stableJson(["attribution", "traversal"]);
}

const QUEENS_PLAZA_DIRECTION_GAP_ROUTES = new Set(["Q100", "Q60", "Q69"]);
const QUEENS_PLAZA_ROUTES = new Set([
  "Q100", "Q101", "Q102", "Q32", "Q39", "Q60", "Q63", "Q66", "Q69",
]);
const QUEENS_PLAZA_CONTEXT_SOURCES = new Map([
  ["Q39", {
    sourceId: "mta_queens_bus_network_redesign_service_changes",
    url: "https://www.mta.info/project/queens-bus-network-redesign/service-changes",
  }],
  ["Q69", {
    sourceId: "meeting_doc_167241",
    url: "https://www.mta.info/document/167241",
  }],
  ["Q101", {
    sourceId: "queens_service_change_board_item_2025",
    url: "https://www.mta.info/document/163136",
  }],
  ["Q102", {
    sourceId: "queens_service_change_board_item_2025",
    url: "https://www.mta.info/document/163136",
  }],
]);
const UNATTRIBUTED_SIM_ROUTES = new Set(["SIM23", "SIM24"]);
const UNATTRIBUTED_SIM_PRIOR_RECEIPTS = new Map([
  ["SIM23", "staten-island-acquisition:4f8c82427f9fa4ff9cb39112"],
  ["SIM24", "staten-island-acquisition:a5a0f4514158f16261378001"],
]);
const HILLSIDE_PRIOR_RECEIPTS = new Map([
  ["Q1", "queens-acquisition:ada385860a650d3218a38705"],
  ["Q110", "queens-acquisition:5e146d100dff2cc2f758c879"],
  ["Q111", "queens-acquisition:345ffb76baf84e47b6d86ae6"],
  ["Q112", "queens-acquisition:9c7e954011a220e48a521f88"],
  ["Q113", "queens-acquisition:13c19be0a4c83a7edd8f1a3f"],
  ["Q114", "queens-acquisition:70dfff7a22d1dddb116656a6"],
  ["Q115", "queens-acquisition:8c732e0dbf518cb06f6337ed"],
  ["Q17", "queens-acquisition:f76f0f7549a18aa4f1ea7385"],
  ["Q2", "queens-acquisition:186c22b126041c4ceebf827a"],
  ["Q24", "queens-acquisition:4b26047a7ca7458882edf69a"],
  ["Q25", "queens-acquisition:0df523d96dae8c9df0779c24"],
  ["Q27", "queens-acquisition:d5a721785af7855eb75ff96e"],
  ["Q3", "queens-acquisition:dc3c0c23858129601fb8bad5"],
  ["Q30", "queens-acquisition:a3faf21a7c2426fd9aa2b7f7"],
  ["Q31", "queens-acquisition:855d926a966078e3d5c403ae"],
  ["Q36", "queens-acquisition:0fdbcb2037985386379b1f86"],
  ["Q40", "queens-acquisition:c53045ffcd858ac21a3d9e4c"],
  ["Q43", "queens-acquisition:d3d4f56ee5cf21ec612cddc0"],
  ["Q44+", "queens-acquisition:f06f6aee8e250a15de1f5971"],
  ["Q65", "queens-acquisition:0df7ccd7216567ad5fb02c94"],
  ["Q75", "queens-acquisition:16839b81b9fb0c07a4e55ea3"],
  ["Q76", "queens-acquisition:d48a5a764e865cf9acf7aff4"],
  ["Q77", "queens-acquisition:277b080e045e0030682bd23d"],
  ["Q82", "queens-acquisition:9002ee0419a1d7122ac977be"],
  ["Q83", "queens-acquisition:f7903e60daf8ef888ca3e2e8"],
  ["Q88", "queens-acquisition:0282f53d35044f644a2cd8a2"],
  ["QM68", "queens-acquisition:de82ca72aa3dba4c99411b4e"],
]);
const HILLSIDE_DIRECTION_GAP_ROUTES = new Set([
  "Q110", "Q111", "Q113", "Q114", "Q115", "Q25", "Q40", "Q65",
]);
const HILLSIDE_ATTRIBUTION_GAP_ROUTES = new Set([
  "Q110", "Q111", "Q112", "Q113", "Q114", "Q115", "Q24", "Q25", "Q27", "Q44+", "Q65", "Q83",
]);
const BATTERY_PLACE_PRIOR_RECEIPTS = new Map([
  ["BXM18", { receiptId: "bronx-acquisition:296182e8fc59c5ab3abd197f", shard: "bronx", supported: false }],
  ["M20", { receiptId: "manhattan-acquisition:1fd68dccc2283be0d3603643", shard: "manhattan", supported: false }],
  ["M55", { receiptId: "manhattan-acquisition:2b67ec8cefc7c93a6b7fdec5", shard: "manhattan", supported: false }],
  ["QM11", { receiptId: "queens-acquisition:72654f73ef94db84291bc5ab", shard: "queens", supported: false }],
  ["QM25", { receiptId: "queens-acquisition:5b9ae239e1edd902423e684f", shard: "queens", supported: false }],
  ["QM7", { receiptId: "queens-acquisition:26bc7bef1a16dea6b4dc596a", shard: "queens", supported: false }],
  ["QM8", { receiptId: "queens-acquisition:20df9841c85bc5f3a0119e31", shard: "queens", supported: false }],
  ["SIM1", { receiptId: "staten-island-acquisition:b16431603d8b738210f3ba79", shard: "staten-island", supported: true }],
  ["SIM15", { receiptId: "staten-island-acquisition:7050839b4004dd39b7ce6257", shard: "staten-island", supported: true }],
  ["SIM1C", { receiptId: "staten-island-acquisition:e9c84dc2e91b556c8fb7c5df", shard: "staten-island", supported: true }],
  ["SIM2", { receiptId: "staten-island-acquisition:0178ad78a70796eb91fedacc", shard: "staten-island", supported: true }],
  ["SIM32", { receiptId: "staten-island-acquisition:85f899926dd90d47d157ef0b", shard: "staten-island", supported: true }],
  ["SIM33C", { receiptId: "staten-island-acquisition:2271a8547d2270d09821b24f", shard: "staten-island", supported: true }],
  ["SIM34", { receiptId: "staten-island-acquisition:ffa3ec03eda763cdc213fd29", shard: "staten-island", supported: true }],
  ["SIM35", { receiptId: "staten-island-acquisition:4ddbd32b5dc40a19af66f63d", shard: "staten-island", supported: true }],
  ["SIM3C", { receiptId: "staten-island-acquisition:50f4a3144f1cc880d3f21057", shard: "staten-island", supported: true }],
  ["SIM4", { receiptId: "staten-island-acquisition:f21bbb4522e79ec28127f3cf", shard: "staten-island", supported: true }],
  ["SIM4C", { receiptId: "staten-island-acquisition:9e607770c86b43d4f2138d95", shard: "staten-island", supported: true }],
  ["SIM5", { receiptId: "staten-island-acquisition:fb2adc19f945d6d367defdb8", shard: "staten-island", supported: true }],
  ["X27", { receiptId: "brooklyn-null-acquisition:894f74a1372188c7d3658ba9", shard: "brooklyn-null", supported: true }],
  ["X28", { receiptId: "brooklyn-null-acquisition:7eb9a7e1261ded7a9c24cc65", shard: "brooklyn-null", supported: true }],
]);
const BATTERY_PLACE_CROSS_SHARD_CONTEXT_ROUTES = new Set(["QM7", "QM8", "QM11", "QM25"]);
const BATTERY_PLACE_PROJECT_ROUTE_INVENTORY = [
  "BM1", "BM2", "BM3", "BM4", "QM7", "QM8", "QM11", "QM25", "SIM1", "SIM1C", "SIM2", "SIM3C",
  "SIM4", "SIM4C", "SIM4X", "SIM5", "SIM15", "SIM32", "SIM33C", "SIM34", "SIM35", "X27", "X28",
];
const BATTERY_PLACE_CROSS_SHARD_CONTEXT_RECEIPT = {
  receiptId: "staten-island-acquisition:b16431603d8b738210f3ba79",
  artifact: "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/receipts.jsonl",
  sourceId: "better_buses_action_plan_2019",
  sourceSha256: "68ac9e1aaf17a033577688e241e586ac101581ef0e2ba0cc3854196f9323f1c1",
};
const ARCHER_JAMAICA_PRIOR_RECEIPTS = new Map([
  ["Q20", {
    receiptId: "queens-acquisition:b5f3291ab3709664296762e9",
    rowSha256: "2b0cafee143fae6e9b9d11221bafd3e5bab73f57c0a5f59b62303f8850e83c94",
    routePageSha256: "9940e19d66151a84e228be63f2363c138fccbb5eceb3784ad804461ecb1fd9cc",
  }],
  ["Q4", {
    receiptId: "queens-acquisition:9fa5470c7a3a9b8a29adf771",
    rowSha256: "839ae849200c822081b7a289ef6f898d3821a3e1cdcad75955eaf0930a416a11",
    routePageSha256: "7fc78e28e22268305a2eb180d4b93c04d61571b91419bea97eb503e02c78fab8",
  }],
  ["Q41", {
    receiptId: "queens-acquisition:a6038f83ce0dc03bb9f41d63",
    rowSha256: "91ec4643200ab64d42f0e22062c0ff2c84369ea64b15427d963743681a7cc653",
    routePageSha256: "ecd48270a32883fb21d9a665929ad6f72cf30735e78fc8fa29be0a60c3c3e104",
  }],
  ["Q42", {
    receiptId: "queens-acquisition:4564672720a0709a0dee5b76",
    rowSha256: "e15e29d831834c94af3c562f0d4e189cc0d99491787881341fe8990ebd2721d4",
    routePageSha256: "f2ce90db208fc87a71a962a140816703767e811d169997689982c57bf9bf5e14",
  }],
  ["Q5", {
    receiptId: "queens-acquisition:0bfda271c4529309d8b20aea",
    rowSha256: "18c71c663579585b24b59a2a78e2a9c0eb5b4e7ae04183d5f356b5905e7ac3b5",
    routePageSha256: "33e21ac5b74473a3bde5e801a9508c146935facaa40220fdaba15e96120ae251",
  }],
  ["Q54", {
    receiptId: "queens-acquisition:09ca6ca6a01d3522f6f191f8",
    rowSha256: "c3ed5ace75b30b9d1ce14a78149df38de154869b66713b7eaa3fe0b46c2f6c21",
    routePageSha256: "92ac33c29081dbdf26c2810a339e7be6527f9e98b3e3e7d684acc0f69f76bfc7",
  }],
  ["Q56", {
    receiptId: "queens-acquisition:465dbfea1c5927a69c25c9f7",
    rowSha256: "3f6d4672d85f98307cb80a047e3c889a38078369beb29f5982b062984474ee36",
    routePageSha256: "1f7ce7b0384d170da775f3cee3e059c3d32fe3606892668ea87d55f21b92f00f",
  }],
  ["Q84", {
    receiptId: "queens-acquisition:bfd0f30a688161d8eaaf3a18",
    rowSha256: "71f5849092904c0e7b3fa00feeeeb9e4282c63e051be0cb015c8a43d95eee7f5",
    routePageSha256: "d3a28890a23fc02cdd1d7008840bf13cd961f6ce679d3b9ce1848325202e35b6",
  }],
  ["Q85", {
    receiptId: "queens-acquisition:c3f7d2500dabf5538c1d8b0a",
    rowSha256: "f014284931b49ab41740c41260d99d45bacc1479c1128c78344197f5b6f5329c",
    routePageSha256: "12e655ef82ca4c60c76f2d2cc7096e781f5ceb90f5ad347c96aed25c3772badb",
  }],
  ["Q86", {
    receiptId: "queens-acquisition:aa191b2e97cfc50662d1d46a",
    rowSha256: "f9e592d6c330c45e3db497052812ea3ff46a2c880352dcf31f0cba0231e39d75",
    routePageSha256: "9d4ac395559bf66f2a6377cabcb62eb8acdee114174ad94e1f9f51707bf2df0a",
  }],
  ["Q87", {
    receiptId: "queens-acquisition:5ce358199cdfdc43eeeb294c",
    rowSha256: "850a8613b1c16c9ea63a5ff8fdeec7b79a96889741ff654cb98a2f4d292e5472",
    routePageSha256: "3fe8578ea5f99905ac84327b3fffdf36ffc2f74f0e68661e4c1eaebbebaace37",
  }],
  ["Q89", {
    receiptId: "queens-acquisition:1356ea30f4b41b642f4dfced",
    rowSha256: "4cec78549b0cfec424885aad7afdcd8bd1dbe0e67d745fccc2dee0ff54f3bfe3",
    routePageSha256: "dc3662f7adc2c795a02c3902972a66e5327e36b1ceff094c04084175ff79cd90",
  }],
]);
const ARCHER_JAMAICA_FEATURE_ROWS = [
  ["QNS|ARCHER AVENUE", "mixed_date_feature_union", "dot-lane-feature:195359f8c38040a67e8f23aa", "0057431", "EB", ["Q25", "Q44"]],
  ["QNS|ARCHER AVENUE", "mixed_date_feature_union", "dot-lane-feature:6ef97942139e0d64bd4729ae", "0057428", "EB", ["Q25", "Q44"]],
  ["QNS|ARCHER AVENUE", "mixed_date_feature_union", "dot-lane-feature:8d4500bf50b85609e7477057", "0057438", "EB", ["Q44"]],
  ["QNS|ARCHER AVENUE", "mixed_date_feature_union", "dot-lane-feature:c39e9fb002e6b0eda9899d21", "0288673", "EB", ["Q25", "Q44"]],
  ["QNS|ARCHER AVENUE", "mixed_date_feature_union", "dot-lane-feature:dbb00bdba23a3909a0fcc676", "0057434", "EB", ["Q44"]],
  ["QNS|ARCHER AVENUE", "mixed_date_feature_union", "dot-lane-feature:f7158ac41603ccb2f6f30ec4", "0288410", "EB", ["Q25", "Q44"]],
  ["QNS|ARCHER AVENUE", "mixed_date_feature_union", "dot-lane-feature:fcebf08ca24a4840e2a11226", "0288674", "EB", ["Q25", "Q44"]],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:069ca4d161e2090eaaf575a6", "0057433", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:0c2f7697f5f14c4d33efa026", "0112927", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:143e74909b737258f47318a3", "0060077", "EB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:1c844bc864c69a505bb5634e", "0060226", "EB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:1feb16cfbfd9eb7b0791100a", "0057065", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:32f9dd39680ee25d04be3511", "0112925", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:34b8afa56c1cb7d04c07e36f", "0060232", "WB", ["Q44"]],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:3aafd9c701bd9ab1c25054b4", "0060097", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:41c5a8bb7200dfe790fd72f7", "0057259", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:4733c488a7ac15dfa96941cb", "0060082", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:5374fda104a1087162fe04ae", "0060096", "EB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:6a98cdb1df814a37578f7cb6", "0057433", "EB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:70ccd21d7281f795e1080c58", "0060080", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:71d71ff5e3926e2c8f2279ec", "0060080", "EB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:76bdb7ad3275837b142b44f9", "0057440", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:7b0fea0802c368c85b7253f6", "0057059", "EB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:8d830acbb7d75bd15532a952", "0060097", "EB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:8de7eba6a34ce784d7aad909", "0060232", "EB", ["Q44"]],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:a4f612d62e4fd946db57c01f", "0060082", "EB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:a58037dcd3187f9f460eba3e", "0057075", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:b58961803e5915ee3c14f2d1", "0060077", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:bb99e00eb408c66e650fe184", "0057440", "EB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:bc413df3e366e86d95c9f307", "0057254", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:c8b89ad188a4cff3c213fe97", "0057257", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:ce73f2d7750577b375a9a31c", "0060096", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:d37af8951a907a6d28d02456", "0060095", "EB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:d6fffe38bc635315cb68a932", "0057071", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:efa943802bb8fba6334b3e47", "0060226", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:efe93b604f0ebec556c8a601", "0060095", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:f0edc39b1370e05cec749e2a", "0057077", "WB", []],
  ["QNS|JAMAICA AVENUE", "coextensive_with_lane_group", "dot-lane-feature:f9c58feb2eb2c32b37433260", "0112926", "WB", []],
];
const ARCHER_JAMAICA_PROJECT_CONTEXT = {
  sourceId: "jamaica_archer_start_press",
  url: "https://www.nyc.gov/html/dot/html/pr2021/pr21-035.shtml",
  sha256: "02cedeec3dda3e9dd29a068af770b8d7bdd032423dceff8a0977971e24a44781",
  note: "NYC DOT identifies the Jamaica and Archer busway extents and installation timing but not an exhaustive route list.",
};
const ARCHER_JAMAICA_CURRENT_SOURCE = {
  sourceId: "nyc_dot_bus_lanes_local_streets_2026_07_22",
  artifact: "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22/source.geojson",
  sha256: "e09e001191c53799936884f4e8311873a03bf9ff4f38e1f0b86af4ba465b6ef5",
};
const UNIVERSITY_AVENUE_ATTRIBUTION_GAP_ROUTES = new Set([
  "BX12", "BX12+", "BX22", "BX36", "BX40", "BX42", "BX9",
]);
const UNIVERSITY_AVENUE_PRIOR_RECEIPTS = new Map([
  ["BX22", {
    receiptId: "bronx-acquisition:bf8da6161cc4a6f559831abe",
    rowSha256: "8f2a033ec6154be709c8cd1887147edd6c4e1ee5fdbbeec9a1416d85b9a6a903",
    dossierSha256: "af11a1a1a16223c1580a1c51087d44770b91aa671f5fbc0795bb6b1af0f24ab5",
    routePageSha256: "8750bb6674a385ad6da15307181e6ffda5d6a1dd175f804c4c63041fe3f59182",
    corridor: "Pelham Parkway / University Avenue", currentCorridorTokenFound: false,
    contextSourceId: null, routeVariantPrecisionMismatch: false,
  }],
  ["BX36", {
    receiptId: "bronx-acquisition:134d63d4e543aededc3b0e01",
    rowSha256: "90cfe23861ad3170eabe8c3c4163a914753c3c20ada7d33bd18c279f97c34e3c",
    dossierSha256: "1e1568be85f84257d8f955b92ee0df97236858430d57c4df19a133f3110b8cef",
    routePageSha256: "c88baeef342e8dd069029628f01091b8f15a3b76fee912eb4efe3bce23fb616b",
    corridor: "University Avenue / Washington Bridge", currentCorridorTokenFound: true,
    contextSourceId: "bronx_cb5_priority_2019", routeVariantPrecisionMismatch: false,
  }],
  ["BX32", {
    receiptId: "bronx-acquisition:f61ffa7732dec944500e09f0",
    rowSha256: "95143679698438bbfa0229d1253e8251cdccc8f5238af93d4a602578b589746c",
    dossierSha256: "44787cb5f301ee60b3cfd694f593a95d5b7345d65296545abf8009ca219ea873",
    routePageSha256: "c67a1556b74c0978637ecf00af855ddcc28e9e86a3bfe65a65ed5a609405ba80",
    corridor: "University Avenue", currentCorridorTokenFound: false,
    contextSourceId: null, routeVariantPrecisionMismatch: false,
  }],
  ["BX18A", {
    receiptId: "bronx-acquisition:37c5e2ba569d679ab6fa0c95",
    rowSha256: "98147328570fc3f9c26ec21e42909a95c11eccb3c1153eda9ba732b245b6b591",
    dossierSha256: "c69cef69ec2f9fa1c6e8393275d1fb620a3fee4fdd2142e38abb719c2a6045a4",
    routePageSha256: "8f42934137c31ef2abde071426cff563c36202fb34ae4ee46e1d605e411fc1b8",
    corridor: "University Avenue / Washington Bridge", currentCorridorTokenFound: false,
    contextSourceId: null, routeVariantPrecisionMismatch: false,
  }],
  ["BX18B", {
    receiptId: "bronx-acquisition:bebb9c4bcf98d2210bb4eebe",
    rowSha256: "58400d1f07df9ed2beb3dff823fda82ab2a9fa5682aba5f5d89716e2c1b7e645",
    dossierSha256: "5313c3487b746d132ecf4d291530fc2a263fdc1d9d160e2f395438386fcdbea4",
    routePageSha256: "ac7bfbce4bf07c66a03784167f7aaaf24ced78f67d5a9147077f0c9cdeb3d225",
    corridor: "University Avenue / Washington Bridge", currentCorridorTokenFound: false,
    contextSourceId: null, routeVariantPrecisionMismatch: false,
  }],
  ["BX42", {
    receiptId: "bronx-acquisition:50f31d5855d01b7fb6b482dc",
    rowSha256: "30b579570de665d81f7954576ea3b1afe8a7edc6856a12403f8f2f59ed590c6f",
    dossierSha256: "a23fb73ff764f533d8b9b4a9446cb35362984030bccbd534b470c1529d24d28f",
    routePageSha256: "de5aeb272266cca1009fe7a7fd093871dd3195b7c8c6005225ab454a2af51d5e",
    corridor: "University Avenue", currentCorridorTokenFound: false,
    contextSourceId: null, routeVariantPrecisionMismatch: false,
  }],
  ["BX9", {
    receiptId: "bronx-acquisition:945a5cee672fa78c7f10015c",
    rowSha256: "9c46ad20d788f99efcc4af03e997f7ca38fed13e884afe375a352fdc45a06ea5",
    dossierSha256: "b454f9c94faaf4efc440e040d5902cd6e6c084a0143face3a580da76994a65d9",
    routePageSha256: "34fa88ecdd9f8f5f1f683d6da38220ff2758e743cfa7210993d3ba108f7db3a9",
    corridor: "University Avenue", currentCorridorTokenFound: false,
    contextSourceId: null, routeVariantPrecisionMismatch: false,
  }],
  ["BX12+", {
    receiptId: "bronx-acquisition:ec7bc5d055efe63898ee7e00",
    rowSha256: "999636a9261bac650b2a55793130e81d7ee41119bca0cc12dc171c88c7f6bc46",
    dossierSha256: "f997320138fd89a69f1368ae3f506d6d3e480605ea544b64f7ca500f553ad612",
    routePageSha256: "a070fef3986f5ecb360f1eb5f50710056d30da4ff83f211f36102f3212ce88e6",
    corridor: "Pelham Parkway / University Avenue", currentCorridorTokenFound: false,
    contextSourceId: "pelham_parkway_completion", routeVariantPrecisionMismatch: false,
  }],
  ["BX12", {
    receiptId: "bronx-acquisition:37a36c4cc11bf3a13f42cec4",
    rowSha256: "22ced13f845eb34b6ef89ec58b1970f9768772bf600287e9fc1625db210c6bbc",
    dossierSha256: "f670ef02e1c964204fba8cb847a2803511e6f4f73f76a4cd0eb50577dae91861",
    routePageSha256: "ba55861de25546859586c7e478b1da1fa0e6727beb1dd6170112f4164377c449",
    corridor: "Pelham Parkway / University Avenue", currentCorridorTokenFound: false,
    contextSourceId: null, routeVariantPrecisionMismatch: true,
  }],
  ["BX40", {
    receiptId: "bronx-acquisition:a616a33628d760f809f88d2d",
    rowSha256: "f9ca0dbaab1eca62ca1f076b90c1cbf4012a1ff7038ee34d4a495a912e40b391",
    dossierSha256: "cd21b16419f4e6d7b24c5f234743a8a6512de70c40ce6262bd78b8c317b3b008",
    routePageSha256: "9869796c570a534a74771237f4c1935999057444b5a3232b80465d5c059452a6",
    corridor: "University Avenue", currentCorridorTokenFound: false,
    contextSourceId: null, routeVariantPrecisionMismatch: false,
  }],
  ["BX3", {
    receiptId: "bronx-acquisition:49de5d2b8d9170c3cee71a3a",
    rowSha256: "50b5261b6ffcad6dd871271cb301074ba34dc31e87dfd6ae6dbcce8941b92952",
    dossierSha256: "602a1d18c6bc68a99e0dad91073bf5c5e31460e790fe8a12fc47872ceb7a1a6f",
    routePageSha256: "ba8c812fa004264f8aab38c89d3c534ace64e7c98dbb112bf904426535c0642b",
    corridor: "University Avenue / Washington Bridge", currentCorridorTokenFound: true,
    contextSourceId: "bronx_cb5_priority_2019", routeVariantPrecisionMismatch: false,
  }],
]);
const UNIVERSITY_AVENUE_FEATURE_ROWS = [
  ["dot-lane-feature:043d4734f489db847de2fd5c", "0174517", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:08fd915eabe0e86dd4395b5a", "0111555", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:0b7c97128c2f7f7a6dcdbb0d", "0079627", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:0fb930b5895b263c0adcdd0e", "0266053", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:1382919906b0ef92d03a72ac", "0111555", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:13b6cef932379f32af3a40ad", "0174518", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:1b9b4f49af86c6adeace9dad", "0188605", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:26d299ffa2499b0ee91e8f87", "0174516", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:36a7a53f36e78d08cfaa7176", "0073096", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:370999c0f05392a6231f9512", "0174519", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:38cb314550d18b2881026fb1", "0113543", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:3944da6f8bf187a0260f93ad", "0193554", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:398b45c02c59c3aeb18d12bb", "0079795", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:42f6b49230c474bea9e1621e", "0174516", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:4428e7b9d0a88b0c8606f472", "0174517", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:4c1a5434e041ad507c9a7370", "0072965", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:50d60967dee4a5fa47bee319", "0072965", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:5fb7b461c557b18e57e53a5f", "0113543", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:6d5ff6960cb91f0cb777a670", "0266053", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:72cb687a6189e886cb2464ef", "0193553", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:8203f66094189533b5595051", "0174518", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:83121fb2c7c3ba4b48c330b0", "0174519", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:8779346d610e2d4cfa7ba04e", "0188605", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:8931974cad68dafbc619364f", "0174349", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:8b1b5489d70a1090cb0be920", "0111554", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:920f109e06bb925feed06879", "0079627", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:b2b1148508d6cede749f157a", "0113544", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:bf046c269f20bee9b12c9c8a", "0111554", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:cba3bb8092b04c8289c78370", "0073073", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:d582c0e1148d624df7f61b89", "0113544", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:dda3181170b08774cbe8feb7", "0174348", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:e61776b3216c890555bb172b", "0193553", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:ec8eae265190c335cc3ff3e5", "0073073", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:f4285e2dd4d7aa277165055e", "0193554", "SB", "2023-12-01", "12/1/2023", "12/1/2023", []],
  ["dot-lane-feature:f8a7b5de7d4b67816743fc26", "0073096", "NB", "2023-12-01", "12/1/2023", "12/1/2023", []],
];
const UNIVERSITY_AVENUE_CONTEXT_SOURCES = new Map([
  ["bronx_cb5_priority_2019", {
    url: "https://www.nyc.gov/html/brt/downloads/pdf/bx-cb5-projects-dec032019.pdf",
    sha256: "0e43255dc5a37106de9c7805e7eb1db80289141bb3937870a3d31264fcb552bc",
    note: "Official Bronx CB5 presentation names Bx3/Bx36 on University Avenue and Bx3/Bx11/Bx13/Bx35/Bx36 on the proposed Washington Bridge bus lanes.",
  }],
  ["pelham_parkway_completion", {
    url: "https://www.nyc.gov/site/ddc/about/press-releases/2023/pr-122723-Pelham.page",
    sha256: "9a0811b58f4755a8638e8cb3e1bf5531e488f5fc05ef157ef16d7fee1246943e",
    note: "NYC DDC/DOT/DEP release documents final Pelham Parkway reconstruction completion and 1.7 miles of bus lanes.",
  }],
]);
const UNIVERSITY_AVENUE_CURRENT_SOURCE = {
  sourceId: "nyc_dot_bus_lanes_local_streets_2026_07_22",
  artifact: "raw/sources/nyc_dot_bus_lanes_local_streets_2026_07_22/source.geojson",
  sha256: "e09e001191c53799936884f4e8311873a03bf9ff4f38e1f0b86af4ba465b6ef5",
};
const HYLAN_BOULEVARD_PROJECT_ROUTES = [
  "S57", "S78", "S79", "SIM1", "SIM5", "SIM6", "SIM7", "SIM9", "SIM10", "SIM11",
];
const HYLAN_BOULEVARD_PRIOR_RECEIPTS = new Map([
  ["S76", {
    receiptId: "staten-island-acquisition:791cd1a5390b2690a606434e",
    rowSha256: "eb7b342b515beb081cbf1e075ada2dfdfe6a9ef38528fcf49f40da63e71793c6",
    dossierSha256: "7282dfd32f592605b2089cca9221c58e3de07a8975338bfc56f818b0557f2856",
    routePageSha256: "027f8002a5ff95e1d8f7acdeb9cb114e9be1c972b8b7b388a4d1762f2fed100d",
    corridor: "Hylan Boulevard", normalizedRouteId: "S76", supported: false,
    priorRowCount: 93, priorIdCount: 91, requiresCorrection: true,
  }],
  ["S54", {
    receiptId: "staten-island-acquisition:839f2982191afb3f77096421",
    rowSha256: "a65a3d2d4e03d569eee85e82a8fa734600ab0dc9e33d084c0857cc705672d06b",
    dossierSha256: "2a25b1140bfffc180fabd0208ec3099739b6f58dd6f8452faf5ef812a53966f1",
    routePageSha256: "75e6be16124274861ba9f91997ea9df2e815415032f3b6579d531e3483c2c95c",
    corridor: "Hylan Boulevard", normalizedRouteId: "S54", supported: false,
    priorRowCount: 93, priorIdCount: 91, requiresCorrection: true,
  }],
  ["S51", {
    receiptId: "staten-island-acquisition:b861e5881bd1c982c55d676d",
    rowSha256: "ee314409a59a2f51d7b6f9eb238def02e5db98b74a34ca74a59eba1fd2cfc377",
    dossierSha256: "2e641568f3e96dcea6d70bdc07258824793b444b49b8f4e410956691253b6027",
    routePageSha256: "4b138199ec01617df223db5c86c437cb43d8ee6c969fb25a5ea26c899fb5ff9f",
    corridor: "Hylan Bl / Hylan Boulevard", normalizedRouteId: "S51", supported: false,
    priorRowCount: 95, priorIdCount: 93, requiresCorrection: false,
  }],
  ["S57", {
    receiptId: "staten-island-acquisition:c564b98820920821657e6d80",
    rowSha256: "1cd548fa867e069d109bd708f5f985dae259506bf628028735633743c83aada2",
    dossierSha256: "c4792f26a2803ee317d0aa363dbd2e44301eb8077cd077b01351c99643ddb135",
    routePageSha256: "cb0f15cf87b5433362627405a167b2e9e752a1f0bbf9df32a1db50b375ef8c39",
    corridor: "Hylan Boulevard", normalizedRouteId: "S57", supported: true,
    priorRowCount: 93, priorIdCount: 91, requiresCorrection: true,
  }],
  ["S86", {
    receiptId: "staten-island-acquisition:d1a0a747537f3f030e39aef9",
    rowSha256: "1fa2d90de619d314b61763b16389f45da7c878f10e5378e028686dfbb9aaa004",
    dossierSha256: "ea3c0ce4d4931deb596557881c5ffa7c85f2d84b7cabec1cf8e4924a4aaddab5",
    routePageSha256: "dd97d5c3e74762d052338e458e462fbaaceef965833e907b22c886bbe9add82c",
    corridor: "Hylan Boulevard", normalizedRouteId: "S86", supported: false,
    priorRowCount: 93, priorIdCount: 91, requiresCorrection: true,
  }],
  ["S79+", {
    receiptId: "staten-island-acquisition:bc6b9f7f68086e41c193a4f9",
    rowSha256: "d8b9e6c96fe11f31e88d8224e7b42838aa23dcbda418213bc8c6c075f7f8a6d5",
    dossierSha256: "ed31821400dc637e024823b33fff02aa36ed02d57759e62a1e3f2f5d8a1892d4",
    routePageSha256: "6923c820fed035569b002371168f288b3406e3e397c0e2fb78e2c550580f02ee",
    corridor: "Hylan Bl / Hylan Boulevard", normalizedRouteId: "S79", supported: true,
    priorRowCount: 95, priorIdCount: 93, requiresCorrection: false,
  }],
  ["S81", {
    receiptId: "staten-island-acquisition:65535c503df5068ef84717b8",
    rowSha256: "35dd2f21027e9252d4c945150c3bf9b924246c165449747c40af0dce202c55f3",
    dossierSha256: "dc0c6db13d3b8f0efdc67fc311b3b59750a50c78eadfc961e1a36405493cd76e",
    routePageSha256: "3edc01ba78d894cbe1d8f58956c5433e5f22fbbef2af5cfb801211d8bdb0b85f",
    corridor: "Hylan Bl / Hylan Boulevard", normalizedRouteId: "S81", supported: false,
    priorRowCount: 95, priorIdCount: 93, requiresCorrection: false,
  }],
  ["S78", {
    receiptId: "staten-island-acquisition:d0de3d5be89d77a091788fb4",
    rowSha256: "0e00c186f4ce862d0ad34d7a99001bfa34d979daeb26ab196dd1e7f5c9e5a14d",
    dossierSha256: "fb680fc3a2e08a1bc6cbf182fb32b63d189b9e669ae939ecb8dbcc4eb8575ccb",
    routePageSha256: "ad6a08d1982e91821d3f77ee48b6546b476d6e01e3cca81ea87cf2bfd751747b",
    corridor: "Hylan Bl / Hylan Boulevard", normalizedRouteId: "S78", supported: true,
    priorRowCount: 95, priorIdCount: 93, requiresCorrection: false,
  }],
  ["SIM9", {
    receiptId: "staten-island-acquisition:949dd12809ad59ff8d747c7f",
    rowSha256: "62be7fe175bfdd73a851db6352ad96f19727eb6e9cb28217db1fd8203fa5f7ee",
    dossierSha256: "1f3157c0a90fb51d98c0391eedbbaccfeb44376cde6109296de00009e705e4c5",
    routePageSha256: "a8558dcf53970d2a1371a9c1f71db490b1d0d803c18c13d3cf362b5874b2f9b2",
    corridor: "Hylan Bl / Hylan Boulevard", normalizedRouteId: "SIM9", supported: true,
    priorRowCount: 95, priorIdCount: 93, requiresCorrection: false,
  }],
  ["SIM7", {
    receiptId: "staten-island-acquisition:2e5e06c451778eb002a219dd",
    rowSha256: "0bf94d5ab336dab4dd8c02088289be49eb60e6b8e05d747c40a3a6f75210f12a",
    dossierSha256: "aec190b7c9da0b2457d5f501493fa256947850d5d4b7ec2e98f226cae30b7d8b",
    routePageSha256: "d80659e0f4c5fae76319fe2a8d420e5ce7045350c98d23eb5377c6f5175e8e7e",
    corridor: "Hylan Bl / Hylan Boulevard", normalizedRouteId: "SIM7", supported: true,
    priorRowCount: 95, priorIdCount: 93, requiresCorrection: false,
  }],
]);
const HYLAN_BOULEVARD_FEATURE_ROWS_SHA256 =
  "8b01c2acf7e5328510bb3f69e8753c492d4d796cbd8c6e53afce31397c78d2c0";
const HYLAN_BOULEVARD_CONTEXT_SOURCES = {
  cab: {
    sourceId: "hylan_cb_july_2020",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/hylan-blvd-lincoln-ave-nelson-ave-cab-jul2020.pdf",
    sha256: "dd1e1bb0dce3d7b956dcfc01d0c96c67ffe0b7e3cb19e017659fa78faa0e4296",
    note: "Official Hylan Boulevard CAB presentation defines the 2020 lane extension and inventories the routes in its project analysis.",
  },
  completion: {
    sourceId: "hylan_completion",
    url: "https://www.nyc.gov/html/dot/html/pr2021/better-buses-mid-island-hylan-blvd-complete.shtml",
    sha256: "885e45aaf202ab5e566516926af9f80b826aeeb0cd55d33f8d5c2aaa544df1c9",
    note: "NYC DOT completion release documents the Hylan Boulevard extension and eleven-route corridor context.",
  },
};
const HYLAN_BOULEVARD_CURRENT_SOURCE = UNIVERSITY_AVENUE_CURRENT_SOURCE;

const EAST_GUN_HILL_CONTEXT_ROUTES = ["BX28", "BX38", "BX41", "BX41+"];
const EAST_GUN_HILL_PRIOR_RECEIPTS = new Map<string, {
  receiptId: string;
  rowSha256: string;
  dossierSha256: string;
  routePageSha256: string;
} | null>([
  ["BX26", {
    receiptId: "bronx-acquisition:60c9a397f7d352fdb0a6e7a9",
    rowSha256: "ea2ceccb40bb64809bbc90ad6c6c43a7a312ef36a90233a2194eade2ef6464ed",
    dossierSha256: "152901893330525303e274e58ac4a9482627e850e880d1d6010591b828ed31cb",
    routePageSha256: "e50ccf371d4b181c5bf3bd93bdddde323513094211d5e112f4dc2fe2f3f02880",
  }],
  ["BX16", {
    receiptId: "bronx-acquisition:226180025d158f8411196599",
    rowSha256: "75325f2580dc842553660c08c214ebe97f15920a6377112e310e57e1f9751634",
    dossierSha256: "d0f2e596d285dc67f094a0d2a2b93976db4b678d7cad9e65b523899345c21c18",
    routePageSha256: "30b1b9f9ac780a8bec072175564ab9c0b2849658a04543ba3a6974a423b7fc5e",
  }],
  ["BX34", {
    receiptId: "bronx-acquisition:901e4ae28a5d4bda5a2859de",
    rowSha256: "b5425a200ba2455eb904047aecb2cc680c93c1acae292779991f3a4a2f48209e",
    dossierSha256: "717e62cd5da051b71757c20fc20b6907a7086b0615ad96fe4dd632838fde9511",
    routePageSha256: "cd2c8f5473bc7ad1bd678a9810b3c9569dd860eff949d0dea146250cad9dddb6",
  }],
  ["BX41+", {
    receiptId: "bronx-acquisition:43a582a43c9fade900fa11f3",
    rowSha256: "e0e259282021628ee73f5be66936abd235f5cf8003eac8be4b8804f8bd173bf4",
    dossierSha256: "05766cfe453d53c66bf157c202fe1e7748c379b88be659687815d343c378ab41",
    routePageSha256: "0fb8d6663bdbbfdc2c15cc09d47679acfc0ede1219f635698cf2ea7ea15aed40",
  }],
  ["BX25", {
    receiptId: "bronx-acquisition:57e785a6bc58898cc20e97fa",
    rowSha256: "7728b5f94239f93b00aa3d57ab809e0503f2ebd82d0593576568e5c8722fd4f2",
    dossierSha256: "cc71dabead0a8d9178ea09d4ba6ff762f3082c290de08f85cf591fff6b7633f6",
    routePageSha256: "cbb9e05c7b372c8ee470dc4139f17a2af78e2771c60c42317ed765e7c4136650",
  }],
  ["BX38", null],
  ["BX41", {
    receiptId: "bronx-acquisition:30614a340438c5b5f10eb94e",
    rowSha256: "573de725bd99db64656e6c6cc8e4ccbbcad7ba0a563e95438a6cfe846174626f",
    dossierSha256: "7988a35f2aa825c612ab8c7c05a275c093ca4c36bf162c3e0c49639c99caf026",
    routePageSha256: "5842a8138eadeffba8ba9e1ebe3f674fc9fa057514c768c39efda85d99212de2",
  }],
  ["BX28", null],
  ["BX10", {
    receiptId: "bronx-acquisition:4e3d6fd8e2d0fae207154c37",
    rowSha256: "71ccc5f3848449d03f8f6bb3dbfb4c619139a5eb08859bda1acbd619990740b1",
    dossierSha256: "a65c7508c1063e3852fb10bf820c174425d22e681ae2dddd794da74c81f4468b",
    routePageSha256: "a3c6e3cd187e70e0271e49ad51d6a71d0ee2b226635a9f6b3138fa69eb9b889b",
  }],
]);
const EAST_GUN_HILL_DOSSIER_CONTRACTS = new Map([
  ["BX26", { rowCount: 10, targetRowCount: 2 }],
  ["BX16", { rowCount: 12, targetRowCount: 0 }],
  ["BX34", { rowCount: 6, targetRowCount: 0 }],
  ["BX41+", { rowCount: 8, targetRowCount: 0 }],
  ["BX25", { rowCount: 4, targetRowCount: 1 }],
  ["BX38", { rowCount: 4, targetRowCount: 2 }],
  ["BX41", { rowCount: 16, targetRowCount: 3 }],
  ["BX28", { rowCount: 18, targetRowCount: 10 }],
  ["BX10", { rowCount: 18, targetRowCount: 0 }],
]);
const EAST_GUN_HILL_DOSSIER_SHA256 = new Map([
  ["BX26", "152901893330525303e274e58ac4a9482627e850e880d1d6010591b828ed31cb"],
  ["BX16", "d0f2e596d285dc67f094a0d2a2b93976db4b678d7cad9e65b523899345c21c18"],
  ["BX34", "717e62cd5da051b71757c20fc20b6907a7086b0615ad96fe4dd632838fde9511"],
  ["BX41+", "05766cfe453d53c66bf157c202fe1e7748c379b88be659687815d343c378ab41"],
  ["BX25", "cc71dabead0a8d9178ea09d4ba6ff762f3082c290de08f85cf591fff6b7633f6"],
  ["BX38", "3503ddb20a849ec50694c1356e038f5c5b46df3d24195b16acd099f8d353f61b"],
  ["BX41", "7988a35f2aa825c612ab8c7c05a275c093ca4c36bf162c3e0c49639c99caf026"],
  ["BX28", "9164af234204188a6e02af9ec44e753beb4f86c075985c2143503fe95be8a952"],
  ["BX10", "a65c7508c1063e3852fb10bf820c174425d22e681ae2dddd794da74c81f4468b"],
]);
const EAST_GUN_HILL_RECEIPT_SUFFIXES = new Map([
  ["BX26", "f39dd4700a23d99ee30b05e0"],
  ["BX16", "37c172cb9b1098e3d26b6c47"],
  ["BX34", "fee03e2178baab40fc664004"],
  ["BX41+", "75c6b26e78e297fa79f812db"],
  ["BX25", "d789a0442dc5be580aa9d5ea"],
  ["BX38", "68d75b1ac3817de97b5462ba"],
  ["BX41", "625e8321d6f13dfe29873767"],
  ["BX28", "dedb831e99c0aecc552a3931"],
  ["BX10", "9bfc18d8c0c31c6721559a31"],
]);
const EAST_GUN_HILL_FEATURE_ROWS_SHA256 =
  "25540cd9134aa59596c76d11616f3a784585c056b7c7ec32b35aa20839a3425a";
const EAST_GUN_HILL_PRIOR_ARTIFACT =
  "data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/receipts.jsonl";
const EAST_GUN_HILL_ACQUIRED_CHECKS = {
  artifact: "data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquired-source-checks.json",
  sha256: "bd74c2999020a5ca957f8e7c02c581725bfcddc5080bbd3b72f467ff73b86405",
  unavailableSources: [
    {
      id: "gun_hill_completion",
      url: "https://www.nyc.gov/html/dot/html/pr2023/east-gun-hill-road-redesign.shtml",
      sha256: "a14b1c862e7f8043ad80768d62ad12add041e96cfd4ab1d94496d4cda0a8e607",
      byteLength: 30117,
    },
    {
      id: "gun_hill_cb7",
      url: "https://www.nyc.gov/html/dot/downloads/pdf/gun-hill-rd-cb7-mar2023.pdf",
      sha256: "2929ef44e252c737afb169fd5bf6d1dab23731983f15cd82810f2554011ca167",
      byteLength: 4366821,
    },
  ],
};
const EAST_GUN_HILL_CONTEXT_SOURCE = {
  sourceId: "meeting_doc_127471",
  sourceUrl: "https://www.mta.info/document/127471",
  artifact: "raw/sources/meeting_doc_127471/source.pdf",
  sourceSha256: "5d3a82851efed1316ff8b65540eaa7e33c7fe9d21221192740476002f50d51ce",
  metadataSha256: "3abae4c00097503d301593a61dd79537542cb80fb66fbf4fb64cb28c0c1c1df2",
  blocksArtifact: "raw/sources/meeting_doc_127471/blocks.jsonl",
  blocksSha256: "e3ee6c7214ec37ea01ecfa906cc26e8ba62b7ea5da30f56fcb312f42ef2e959a",
  blockId: "p005_c0007",
  blockTextSha256: "sha256:6e5848bc8ae69431f30848ba261b693d97209eda123ef09685cd61672648946b",
  namedRouteLiterals: ["BX28", "BX38", "BX41", "BX41-SBS"],
};
const EAST_GUN_HILL_MISSING_SOURCE = {
  sourceId: "nyc_dot_gun_hill_road_completion_2023",
  expectedPath: "raw/sources/nyc_dot_gun_hill_road_completion_2023",
};

const FR_CAPODANNO_PRIOR = {
  artifact: "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/receipts.jsonl",
  artifactSha256: "c511783ce9f86b65fa5ffc087fe1d1753beb92caa37064976da67748ca182593",
  receiptId: "staten-island-acquisition:07078ada9c8ef7de3afe7e2a",
  rowSha256: "1d3dcb80f8b3d8364660c78944d5bf59dda4dd0531d6dc7478b6e092a07043cd",
  routePageSha256: "833146db10bcb1764c968dda29c0ed3b0c183ce43fd65493e095ef0d4e4cb147",
};
const FR_CAPODANNO_FEATURE_ROWS_SHA256 =
  "d8a734d9e26aa0d825a7653a1c8de5acce7fcd4df1efa6b2b4434e86cfbe583c";
const FR_CAPODANNO_DOSSIER_SHA256 =
  "f84bf8c354f92182ec473c8d63a70b1c68cbed348e2decee5597f82a72ac95cd";
const FR_CAPODANNO_RECEIPT_SUFFIX = "a270c81744d619db7f6f7beb";
const FR_CAPODANNO_CONTEXT_SOURCES = [
  {
    sourceId: "2012_03_15_brt_hylan_meeting_slides",
    sourceUrl: "https://www.nyc.gov/html/brt/downloads/pdf/2012-03-15_brt_hylan_meeting-slides.pdf",
    artifact: "raw/sources/2012_03_15_brt_hylan_meeting_slides/source.pdf",
    sourceSha256: "0ef8aef7cfa68eccf0513303ef1aed52556f6b6a442a94f802a8cf9613b69332",
    metadataSha256: "a6ccca40e6174318ec13a9e7fef3f2e877f097f6a1a5a318bd2dd953ee3f4d12",
    blocksArtifact: "raw/sources/2012_03_15_brt_hylan_meeting_slides/blocks.jsonl",
    blocksSha256: "dd0c02f014c9d3a0f651ff9a6cc1d5e4ed6eef4c485981a70d2ba3af53c587c4",
    blockId: "p012_c0005",
    blockTextSha256: "sha256:4854b012eff1904866d138b35ee69716effef8539ceb7b02d6bde1895bdbe761",
    classification: "later_hylan_project_parallel_corridor_context",
  },
  {
    sourceId: "2014_hylan_blvd_final_report",
    sourceUrl: "https://www.nyc.gov/html/brt/downloads/pdf/2014-hylan-blvd-final-report.pdf",
    artifact: "raw/sources/2014_hylan_blvd_final_report/source.pdf",
    sourceSha256: "3e106b77495dcace4815c8e5294957baad516020de6ff735acdc3f0aff92400e",
    metadataSha256: "a9ebe681d66d9dc08667b4c67259663368cf6dc0b0634a5fb6d8ddc4192786d7",
    blocksArtifact: "raw/sources/2014_hylan_blvd_final_report/blocks.jsonl",
    blocksSha256: "c661395358b2235783b6c43c7c5dfd2bf3cfc22f5512053e7e85c16ff2255286",
    blockId: "p018_c0005",
    blockTextSha256: "sha256:41fabb65bb2a624482ea19e51c9aa95f865ab753c9d64ca7f766d8fd928cb08b",
    classification: "later_hylan_project_unchanged_comparison_corridor_context",
  },
];
const FR_CAPODANNO_ACQUIRED_CHECKS = {
  artifact: "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/acquired-source-checks.json",
  sha256: "9d7a61be83f54c8d431f588976af06d86c0dedff5300511d1bd4ac4ed5e6c32a",
  nonretainedSources: [
    {
      id: "dot_bus_lanes_snapshot", byteLength: 2_979_323,
      sha256: "1b3a990a75abc472d5f68d683aeb7d1deafa2eca4a239e4914b12db6a9927a5a",
      classification: "superseded_registry_snapshot_context",
    },
    {
      id: "select_bus_service_report", byteLength: 1_871_180,
      sha256: "3ee8f645b91b0c96f4c05725edb2c8d52bcdccdc742da59bf2f653781ecafdc8",
      classification: "other_route_hylan_richmond_s79_context",
    },
    {
      id: "mta_staten_express_map", byteLength: 454_842,
      sha256: "fc4935e5cd27fabb4d085002dd536f9aef43c0217b4db256e721d494ececcd28",
      classification: "current_express_network_context_not_s52_binding",
    },
    {
      id: "father_capodanno_safety_2023", byteLength: 3_321_624,
      sha256: "e1dbf2355ee9a9c75f99a38736bfecff6d038f98da7736de006fcf0b1bc84145",
      classification: "later_corridor_safety_context_not_2010_s52_binding",
    },
    {
      id: "dot_current_projects", byteLength: 231_988,
      sha256: "497d1f9358c5b4864a0bf1d30b1157d431a3d1a6645aad55dbad0b3090ae0f8f",
      classification: "project_index_search_context",
    },
    {
      id: "dot_bus_lanes_metadata", byteLength: 37_887,
      sha256: "37d620df045dfefee4b0a52b7489a7059c4af77aac40a3f0ca6caa99ac45f75f",
      classification: "dataset_metadata_context",
    },
    {
      id: "dot_datafeeds", byteLength: 50_137,
      sha256: "978825efcdee1f4819c3f8e114343502950390acdda7b0d9515af1b31ccc9bc6",
      classification: "dataset_catalog_context",
    },
  ],
  priorOnlyRetrieval: {
    id: "mta_bustime_S52",
    sha256: "833146db10bcb1764c968dda29c0ed3b0c183ce43fd65493e095ef0d4e4cb147",
  },
};

const TWENTY_FIRST_STREET_PRIOR_ARTIFACT =
  "data/quality/relationship-integrity/bus-lane-acquisition/shards/queens/receipts.jsonl";
const TWENTY_FIRST_STREET_PRIOR_ARTIFACT_SHA256 =
  "950c9c7844027edf6607fba3f957bb4a6252e9dbc0f2dcddf5aac2162b9c9e41";
const TWENTY_FIRST_STREET_PRIORS = new Map([
  ["Q103", {
    receiptId: "queens-acquisition:af4b7b3e814f442db262a1fc",
    rowSha256: "f7be172947d698703d954f0c024f6be1aaf382163d191f5931d4955155d1939d",
    routePageSha256: "6c330282481861eb8fd407a082f2eee7dbc744dffaa84182c4a63a464900884a",
    routeSupported: true,
    historicalPieceCount: 7,
    historicalPiecePhrase: "7 matched segment(s)",
    disposition: "linkage_supported_phase_unresolved",
  }],
  ["Q104", {
    receiptId: "queens-acquisition:7b1a77736c8fc78b02f399c5",
    rowSha256: "e4cf4a64dcc7a0d076a8b5278168a782327d58da2c880cd5646aececefb35cc1",
    routePageSha256: "a6f26a9d33e126cfe61b8d07d1bb04b5a893b3ffbb738ea37297f76f21834a6a",
    routeSupported: false,
    historicalPieceCount: 6,
    historicalPiecePhrase: "6 candidate-date lane piece(s)",
    disposition: "completed_search_route_linkage_unresolved",
  }],
]);
const TWENTY_FIRST_STREET_RECEIPT_SUFFIXES = new Map([
  ["Q103", "f0caf947f0e1a0ff295e6db1"],
  ["Q104", "011903e10d750237cdf1b24b"],
]);
const TWENTY_FIRST_STREET_DOSSIER_SHA256 = new Map([
  ["Q103", "28685a54370a17e94f506d60f7326d9c74ee0f0d5763e43a25729f1d03c0994a"],
  ["Q104", "aaae04326b1a6af8d718ddba8ebe757bb296d7598d061d748edc36d394f3514d"],
]);
const TWENTY_FIRST_STREET_FEATURE_ROWS_SHA256 =
  "b483d61d970e8fc4959239475ef7ac6375ea4a812772cc14d7735f91e1a1eb6a";
const TWENTY_FIRST_STREET_COMPLETION_CONTEXT = {
  sourceId: "nyc_dot_21st_street_bus_priority_completion_2022",
  acquiredId: "twenty_first_completion_press",
  url: "https://www.nyc.gov/html/dot/html/pr2022/buses-for-queens.shtml",
  acquiredSha256: "d30b4bde2bb965c16542b28f0ce4a190202d55af99e5d43f9f89f215edf925f1",
  sourcePage: "wiki/sources/nyc_dot_21st_street_bus_priority_completion_2022.md",
  sourcePageSha256: "a57e68426e55a6aff5bf09984e5b93d00f15063891db383bbb6c22e790b70ec3",
  expectedRawPath: "raw/sources/nyc_dot_21st_street_bus_priority_completion_2022",
  journal: "data/submissions/2026-07-15T18-00-00-000Z_queens-acquisition-linkage-remediation.jsonl",
  journalSha256: "29fe25ec1f5cc87af99686ca825eb226fbacb391c947a3fe0fed610b8fdb5196",
  routeInventory: ["Q66", "Q69", "Q100", "Q102", "Q103"],
};
const TWENTY_FIRST_STREET_STAGED_CONTEXT = {
  sourceId: "meeting_doc_85816",
  sourceUrl: "https://www.mta.info/document/85816",
  artifact: "raw/sources/meeting_doc_85816/source.pdf",
  sourceSha256: "a83e62444fd24e3d157f94be44eebb12be290ff84025b2d1afcb0b3b328babaf",
  metadataSha256: "e230f8fc5c15fc970c68de737aaf278c7b6e6bcca0fa5731c8b4ea557de8f816",
  blocksArtifact: "raw/sources/meeting_doc_85816/blocks.jsonl",
  blocksSha256: "6c2f3f809d0f34a5d88533efe0713d23f17f737ca1a8e003e791a424fb0c069d",
  blocks: [
    {
      blockId: "p229_c0005",
      textSha256: "sha256:e573ffdf9d11c298536d3171de4f2af632ac8e4673f7c46e0924ca226d7e33cd",
    },
    {
      blockId: "p229_c0007",
      textSha256: "sha256:8f5c42262a13c37eff0033f4833a3dbc0a271d50c1bc7be2d594185944a99b0e",
    },
  ],
};
const TWENTY_FIRST_STREET_ACQUIRED_CHECKS = {
  artifact: "data/quality/relationship-integrity/bus-lane-acquisition/shards/queens/acquired-source-checks.json",
  sha256: "9a7689a3b180dd6a9f372956ca96e21178fb8a778a2e06f938986ddacf958fbe",
  nonretainedSources: [
    {
      id: "dot_bus_lanes_snapshot", byteLength: 2_979_323,
      sha256: "1b3a990a75abc472d5f68d683aeb7d1deafa2eca4a239e4914b12db6a9927a5a",
      url: "https://data.cityofnewyork.us/resource/ycrg-ses3.json?$limit=5000",
      classification: "superseded_registry_snapshot_context",
    },
    {
      id: "twenty_first_completion_press", byteLength: 32_036,
      sha256: "d30b4bde2bb965c16542b28f0ce4a190202d55af99e5d43f9f89f215edf925f1",
      url: "https://www.nyc.gov/html/dot/html/pr2022/buses-for-queens.shtml",
      classification: "later_completion_route_inventory_context",
    },
    {
      id: "mta_qbnr_addendum", byteLength: 2_338_173,
      sha256: "f2390c4c05592b155cb368c086aaea8f45b44532db3223a981c34147ebe87ead",
      url: "https://www.mta.info/document/160976",
      classification: "later_network_redesign_context",
    },
    {
      id: "mta_board_staff_summary", byteLength: 105_216,
      sha256: "171fe9f2aae98f6638c3785a18040438172f0ebc9244735aacad30efcb13f764",
      url: "https://www.mta.info/document/174076",
      classification: "later_network_implementation_context",
    },
    {
      id: "dot_bus_lanes_metadata", byteLength: 37_887,
      sha256: "fa943cd885628155d489ffb991e464ce8d914736b9c29ab97dd2094ecd877340",
      url: "https://data.cityofnewyork.us/api/views/ycrg-ses3",
      classification: "dataset_metadata_context",
    },
    {
      id: "dot_datafeeds", byteLength: 50_140,
      sha256: "58ac642581b74c95fda7b9949b08e3d28f7fec1e36f486c430170d2aba791487",
      url: "https://www.nyc.gov/html/dot/html/about/datafeeds.shtml",
      classification: "dataset_catalog_context",
    },
  ],
};

function isExactQueensPlazaPacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const group = packet.what_is_known.target_groups[0];
  if (!group) return false;
  const expectedMissingBinding = QUEENS_PLAZA_DIRECTION_GAP_ROUTES.has(row.gtfs_route_id)
    ? "direction"
    : "traversal";
  const expectedUnresolvedBindings = expectedMissingBinding === "direction"
    ? ["attribution", "direction", "traversal"]
    : ["attribution", "traversal"];
  return QUEENS_PLAZA_ROUTES.has(row.gtfs_route_id) &&
    row.implementation_date === "2025-12-13" &&
    packet.missing_binding === expectedMissingBinding &&
    packet.what_is_known.target_groups.length === 1 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    group.lane_group_id === "QNS|QUEENS PLAZA" &&
    group.geometry_scope === "coextensive_with_lane_group" &&
    stableJson(group.feature_matches.map((match) => [
      match.feature_key,
      match.feature_id,
      match.direction,
      match.matched_date,
      match.matched_token_literal,
      match.open_dates_literal,
      match.sbs_routes,
    ])) === stableJson([
      ["dot-lane-feature:0a841b3197297a23c0825dd6", "0138068", "WB", "2025-12-13", "12/13/2025", "12/13/2025", []],
      ["dot-lane-feature:23b276021ce449a1c880901a", "9024008", "WB", "2025-12-13", "12/13/2025", "12/13/2025", []],
      ["dot-lane-feature:41933a8350a61a1d9d146731", "9009907", "WB", "2025-12-13", "12/13/2025", "12/13/2025", []],
      ["dot-lane-feature:958069d9209c6e495439a1dd", "9024007", "WB", "2025-12-13", "12/13/2025", "12/13/2025", []],
    ]) &&
    stableJson(packet.unresolved_bindings) === stableJson(expectedUnresolvedBindings);
}

function isExactUnattributedSimPacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  return UNATTRIBUTED_SIM_ROUTES.has(row.gtfs_route_id) &&
    row.implementation_date === "2015-05-27" &&
    row.detector_verdict === "unreviewed" &&
    packet.missing_binding === "attribution" &&
    packet.what_is_known.target_groups.length === 0 &&
    row.onset_evidence.target_groups.length === 0 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    row.onset_evidence.dataset_fields_present === false &&
    stableJson(packet.what_is_known.detector_reason_codes) ===
      stableJson(["no_dot_feature_open_date_token_matches_candidate_date"]) &&
    stableJson(packet.unresolved_bindings) ===
      stableJson(["attribution", "onset", "phase", "traversal"]);
}

function isExactHillsidePacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const group = packet.what_is_known.target_groups[0];
  if (!group) return false;
  const matches = group.feature_matches;
  const dossierRefs = packet.what_is_known.dossier_refs;
  const dossierSummary = packet.what_is_known.dossier_summary;
  const dossierVerdicts: LaneTraversalVerdict[] = [
    "traversal_confirmed", "traversal_marginal", "no_traversal", "geometry_ambiguous",
  ];
  const dossierSources: LaneTraversalRow["path_source"][] = [
    "gtfs_shape", "historical_schedule_timepoint_pattern", "unavailable",
  ];
  const expectedDossierSummary = {
    row_count: dossierRefs.length,
    target_row_count: dossierRefs.filter((ref) => ref.candidate_target_match).length,
    counts_by_verdict: countBy(dossierRefs.map((ref) => ref.verdict_class), dossierVerdicts),
    counts_by_reason: recordCounts(dossierRefs.map((ref) => ref.reason)),
    counts_by_path_source: countBy(dossierRefs.map((ref) => ref.path_source), dossierSources),
  };
  const expectedMissingBinding = HILLSIDE_DIRECTION_GAP_ROUTES.has(row.gtfs_route_id)
    ? "direction"
    : "feature_extent";
  const expectedUnresolvedBindings = HILLSIDE_ATTRIBUTION_GAP_ROUTES.has(row.gtfs_route_id)
    ? ["attribution", "direction", "feature_extent", "phase", "traversal"]
    : ["direction", "feature_extent", "phase", "traversal"];
  return HILLSIDE_PRIOR_RECEIPTS.has(row.gtfs_route_id) &&
    row.implementation_date === "2025-09-15" &&
    packet.missing_binding === expectedMissingBinding &&
    packet.what_is_known.target_groups.length === 1 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    stableJson(dossierRefs) === stableJson(row.dossier_refs) &&
    dossierRefs.length > 0 &&
    dossierRefs.every((ref) =>
      ref.service_date === row.implementation_date &&
      ref.temporal_lag_days === 0 &&
      ref.path_source === "historical_schedule_timepoint_pattern" &&
      (ref.verdict_class === "geometry_ambiguous" || ref.verdict_class === "traversal_marginal")) &&
    stableJson(dossierSummary) === stableJson(expectedDossierSummary) &&
    group.lane_group_id === "QNS|HILLSIDE AVENUE" &&
    group.geometry_scope === "mixed_date_feature_union" &&
    matches.length === 195 &&
    new Set(matches.map((match) => match.feature_key)).size === 190 &&
    new Set(matches.map((match) => match.feature_id)).size === 97 &&
    matches.every((match) =>
      match.matched_date === "2025-09-15" &&
      match.matched_token_literal === "9/15/2025" &&
      match.open_dates_literal === "9/15/2025" &&
      match.sbs_routes.length === 0) &&
    stableJson([...new Set(matches.map((match) => match.direction))].sort()) === stableJson(["EB", "WB"]) &&
    stableJson(packet.unresolved_bindings) === stableJson(expectedUnresolvedBindings);
}

function isExactBatteryPlacePacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const group = packet.what_is_known.target_groups[0];
  const dossierRef = packet.what_is_known.dossier_refs[0];
  if (!group || !dossierRef) return false;
  const matches = group.feature_matches;
  return BATTERY_PLACE_PRIOR_RECEIPTS.has(row.gtfs_route_id) &&
    row.implementation_date === "2021-06-10" &&
    packet.missing_binding === "traversal" &&
    packet.what_is_known.target_groups.length === 1 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    stableJson(packet.what_is_known.dossier_refs) === stableJson(row.dossier_refs) &&
    packet.what_is_known.dossier_refs.length === 1 &&
    dossierRef.candidate_target_match === false &&
    dossierRef.direction === null && dossierRef.lane_group_id === null && dossierRef.path_identity === null &&
    dossierRef.path_source === "unavailable" && dossierRef.reason === "historical_schedule_unavailable_pre_2023" &&
    dossierRef.service_date === null && dossierRef.temporal_lag_days === null &&
    dossierRef.verdict_class === "geometry_ambiguous" && dossierRef.stop_coordinate_coverage === 0 &&
    dossierRef.overlap_miles === 0 && dossierRef.overlap_share === 0 && dossierRef.span_stop_ids.length === 0 &&
    stableJson(packet.what_is_known.dossier_summary) === stableJson({
      counts_by_path_source: { gtfs_shape: 0, historical_schedule_timepoint_pattern: 0, unavailable: 1 },
      counts_by_reason: { historical_schedule_unavailable_pre_2023: 1 },
      counts_by_verdict: { geometry_ambiguous: 1, no_traversal: 0, traversal_confirmed: 0, traversal_marginal: 0 },
      row_count: 1,
      target_row_count: 0,
    }) &&
    group.lane_group_id === "MAN|BATTERY PLACE" && group.geometry_scope === "coextensive_with_lane_group" &&
    matches.length === 16 && new Set(matches.map((match) => match.feature_key)).size === 11 &&
    new Set(matches.map((match) => match.feature_id)).size === 11 &&
    matches.every((match) => match.direction === "WB" && match.matched_date === "2021-06-10" &&
      match.matched_token_literal === "06/10/2021" && match.open_dates_literal === "06/10/2021" &&
      match.sbs_routes.length === 0) &&
    stableJson(packet.unresolved_bindings) === stableJson(["attribution", "traversal"]);
}

function archerJamaicaGroupAccounting(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): Record<string, JsonValue>[] {
  return packet.what_is_known.target_groups.map((group) => ({
    lane_group_id: group.lane_group_id,
    geometry_scope: group.geometry_scope,
    feature_row_count: group.feature_matches.length,
    feature_key_count: new Set(group.feature_matches.map((match) => match.feature_key)).size,
    feature_id_count: new Set(group.feature_matches.map((match) => match.feature_id)).size,
    directions: [...new Set(group.feature_matches.map((match) => match.direction))].sort(),
    matched_dates: [...new Set(group.feature_matches.map((match) => match.matched_date))].sort(),
    matched_token_literals: [...new Set(group.feature_matches.map((match) => match.matched_token_literal))].sort(),
    open_dates_literals: [...new Set(group.feature_matches.map((match) => match.open_dates_literal))].sort(),
    named_sbs_routes: [...new Set(group.feature_matches.flatMap((match) => match.sbs_routes))].sort(),
    candidate_route_named_feature_rows: group.feature_matches.flatMap((match) =>
      match.sbs_routes.includes(row.gtfs_route_id)
        ? [{
          feature_key: match.feature_key,
          feature_id: match.feature_id,
          direction: match.direction,
        }]
        : []),
    feature_rows: group.feature_matches.map((match) => ({
      feature_key: match.feature_key,
      feature_id: match.feature_id,
      direction: match.direction,
      matched_date: match.matched_date,
      matched_token_literal: match.matched_token_literal,
      open_dates_literal: match.open_dates_literal,
      sbs_routes: match.sbs_routes,
    })),
  }));
}

function isExactArcherJamaicaPacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const archerGroup = packet.what_is_known.target_groups[0];
  const jamaicaGroup = packet.what_is_known.target_groups[1];
  const dossierRef = packet.what_is_known.dossier_refs[0];
  const featureRows = packet.what_is_known.target_groups.flatMap((group) =>
    group.feature_matches.map((match) => [
      group.lane_group_id,
      group.geometry_scope,
      match.feature_key,
      match.feature_id,
      match.direction,
      match.sbs_routes,
    ]));
  if (!archerGroup || !jamaicaGroup || !dossierRef) return false;
  return ARCHER_JAMAICA_PRIOR_RECEIPTS.has(row.gtfs_route_id) &&
    row.implementation_date === "2021-10-24" &&
    packet.missing_binding === "feature_extent" &&
    packet.what_is_known.target_groups.length === 2 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    archerGroup.lane_group_id === "QNS|ARCHER AVENUE" &&
    archerGroup.borough === "QNS" && archerGroup.facility === "Archer Avenue" &&
    archerGroup.street === "ARCHER AVENUE" && archerGroup.geometry_scope === "mixed_date_feature_union" &&
    jamaicaGroup.lane_group_id === "QNS|JAMAICA AVENUE" &&
    jamaicaGroup.borough === "QNS" && jamaicaGroup.facility === "Jamaica Avenue" &&
    jamaicaGroup.street === "JAMAICA AVENUE" && jamaicaGroup.geometry_scope === "coextensive_with_lane_group" &&
    packet.what_is_known.target_groups.flatMap((group) => group.feature_matches).every((match) =>
      match.matched_date === "2021-10-24" && match.matched_token_literal === "10/24/2021" &&
      match.open_dates_literal === "10/24/2021" && !match.sbs_routes.includes(row.gtfs_route_id)) &&
    stableJson(featureRows as JsonValue) === stableJson(ARCHER_JAMAICA_FEATURE_ROWS as JsonValue) &&
    stableJson(packet.what_is_known.dossier_refs) === stableJson(row.dossier_refs) &&
    packet.what_is_known.dossier_refs.length === 1 &&
    dossierRef.candidate_target_match === false &&
    dossierRef.direction === null && dossierRef.lane_group_id === null && dossierRef.path_identity === null &&
    dossierRef.path_source === "unavailable" && dossierRef.reason === "historical_schedule_unavailable_pre_2023" &&
    dossierRef.service_date === null && dossierRef.temporal_lag_days === null &&
    dossierRef.verdict_class === "geometry_ambiguous" && dossierRef.stop_coordinate_coverage === 0 &&
    dossierRef.overlap_miles === 0 && dossierRef.overlap_share === 0 && dossierRef.span_stop_ids.length === 0 &&
    stableJson(packet.what_is_known.dossier_summary) === stableJson({
      counts_by_path_source: { gtfs_shape: 0, historical_schedule_timepoint_pattern: 0, unavailable: 1 },
      counts_by_reason: { historical_schedule_unavailable_pre_2023: 1 },
      counts_by_verdict: { geometry_ambiguous: 1, no_traversal: 0, traversal_confirmed: 0, traversal_marginal: 0 },
      row_count: 1,
      target_row_count: 0,
    }) &&
    stableJson(packet.unresolved_bindings) ===
      stableJson(["attribution", "direction", "feature_extent", "phase", "traversal"]);
}

function isExactUniversityAvenuePacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const priorContract = UNIVERSITY_AVENUE_PRIOR_RECEIPTS.get(row.gtfs_route_id);
  const group = packet.what_is_known.target_groups[0];
  if (!priorContract || !group) return false;
  const dossierRefs = packet.what_is_known.dossier_refs;
  const dossierVerdicts: LaneTraversalVerdict[] = [
    "traversal_confirmed", "traversal_marginal", "no_traversal", "geometry_ambiguous",
  ];
  const dossierSources: LaneTraversalRow["path_source"][] = [
    "gtfs_shape", "historical_schedule_timepoint_pattern", "unavailable",
  ];
  const expectedDossierSummary = {
    row_count: dossierRefs.length,
    target_row_count: dossierRefs.filter((ref) => ref.candidate_target_match).length,
    counts_by_verdict: countBy(dossierRefs.map((ref) => ref.verdict_class), dossierVerdicts),
    counts_by_reason: recordCounts(dossierRefs.map((ref) => ref.reason)),
    counts_by_path_source: countBy(dossierRefs.map((ref) => ref.path_source), dossierSources),
  };
  const expectedUnresolvedBindings = UNIVERSITY_AVENUE_ATTRIBUTION_GAP_ROUTES.has(row.gtfs_route_id)
    ? ["attribution", "direction", "feature_extent", "phase", "traversal"]
    : ["direction", "feature_extent", "phase", "traversal"];
  return row.implementation_date === "2023-12-01" &&
    packet.missing_binding === "feature_extent" &&
    packet.what_is_known.target_groups.length === 1 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    group.lane_group_id === "BX|UNIVERSITY AVENUE" && group.borough === "BX" &&
    group.facility === "University Avenue" && group.street === "UNIVERSITY AVENUE" &&
    group.geometry_scope === "mixed_date_feature_union" &&
    stableJson(group.feature_matches.map((match) => [
      match.feature_key,
      match.feature_id,
      match.direction,
      match.matched_date,
      match.matched_token_literal,
      match.open_dates_literal,
      match.sbs_routes,
    ]) as JsonValue) === stableJson(UNIVERSITY_AVENUE_FEATURE_ROWS as JsonValue) &&
    stableJson(dossierRefs) === stableJson(row.dossier_refs) &&
    hash(stableJson(dossierRefs)) === priorContract.dossierSha256 &&
    dossierRefs.length > 0 &&
    dossierRefs.every((ref) =>
      ref.service_date === "2023-12-01" && ref.temporal_lag_days === 0 &&
      ref.path_source === "historical_schedule_timepoint_pattern" &&
      ref.verdict_class === "geometry_ambiguous") &&
    stableJson(packet.what_is_known.dossier_summary) === stableJson(expectedDossierSummary) &&
    stableJson(packet.unresolved_bindings) === stableJson(expectedUnresolvedBindings);
}

function isExactHylanBoulevardPacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const priorContract = HYLAN_BOULEVARD_PRIOR_RECEIPTS.get(row.gtfs_route_id);
  const group = packet.what_is_known.target_groups[0];
  const dossierRef = packet.what_is_known.dossier_refs[0];
  if (!priorContract || !group || !dossierRef) return false;
  const featureRows = group.feature_matches.map((match) => [
    match.feature_key,
    match.feature_id,
    match.direction,
    match.matched_date,
    match.matched_token_literal,
    match.open_dates_literal,
    match.sbs_routes,
  ]);
  const featureKeys = [...new Set(group.feature_matches.map((match) => match.feature_key))];
  const featureIds = [...new Set(group.feature_matches.map((match) => match.feature_id))];
  const duplicateRows = group.feature_matches.filter((match) =>
    match.feature_key === "dot-lane-feature:ca472df22407614bd0b3418f");
  const shortLiteralRows = group.feature_matches.filter((match) =>
    match.matched_token_literal === "9/12/20" && match.open_dates_literal === "9/12/20");
  return row.implementation_date === "2020-09-12" &&
    packet.missing_binding === "feature_extent" &&
    packet.what_is_known.target_groups.length === 1 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    group.lane_group_id === "SI|HYLAN BOULEVARD" && group.borough === "SI" &&
    group.facility === "Hylan Boulevard" && group.street === "HYLAN BOULEVARD" &&
    group.geometry_scope === "mixed_date_feature_union" &&
    group.feature_matches.length === 95 && featureKeys.length === 93 && featureIds.length === 93 &&
    hash(stableJson(featureRows as JsonValue)) === HYLAN_BOULEVARD_FEATURE_ROWS_SHA256 &&
    stableJson([...new Set(group.feature_matches.map((match) => match.direction))].sort()) ===
      stableJson(["NB", "SB"]) &&
    group.feature_matches.filter((match) => match.direction === "NB").length === 65 &&
    group.feature_matches.filter((match) => match.direction === "SB").length === 30 &&
    shortLiteralRows.length === 2 &&
    stableJson(shortLiteralRows.map((match) => match.feature_id).sort()) ===
      stableJson(["0152288", "0155475"]) &&
    group.feature_matches.filter((match) => match.matched_token_literal === "9/12/2020" &&
      match.open_dates_literal === "9/12/2020").length === 93 &&
    group.feature_matches.filter((match) => stableJson(match.sbs_routes) === stableJson(["S79"])).length === 94 &&
    group.feature_matches.filter((match) => match.sbs_routes.length === 0).length === 1 &&
    group.feature_matches.some((match) => match.feature_key === "dot-lane-feature:4e7c18c39d8ce3861c9bd160" &&
      match.feature_id === "0155447" && match.direction === "SB" && match.sbs_routes.length === 0) &&
    duplicateRows.length === 3 && duplicateRows.every((match) => match.feature_id === "0155364" &&
      match.direction === "NB" && stableJson(match.sbs_routes) === stableJson(["S79"])) &&
    stableJson(packet.what_is_known.dossier_refs) === stableJson(row.dossier_refs) &&
    hash(stableJson(packet.what_is_known.dossier_refs)) === priorContract.dossierSha256 &&
    packet.what_is_known.dossier_refs.length === 1 && dossierRef.candidate_target_match === false &&
    dossierRef.path_source === "unavailable" && dossierRef.reason === "historical_schedule_unavailable_pre_2023" &&
    dossierRef.verdict_class === "geometry_ambiguous" && dossierRef.service_date === null &&
    dossierRef.temporal_lag_days === null && dossierRef.direction === null && dossierRef.path_identity === null &&
    dossierRef.lane_group_id === null && dossierRef.stop_coordinate_coverage === 0 &&
    dossierRef.overlap_miles === 0 && dossierRef.overlap_share === 0 && dossierRef.span_stop_ids.length === 0 &&
    stableJson(packet.what_is_known.dossier_summary) === stableJson({
      counts_by_path_source: { gtfs_shape: 0, historical_schedule_timepoint_pattern: 0, unavailable: 1 },
      counts_by_reason: { historical_schedule_unavailable_pre_2023: 1 },
      counts_by_verdict: { geometry_ambiguous: 1, no_traversal: 0, traversal_confirmed: 0, traversal_marginal: 0 },
      row_count: 1,
      target_row_count: 0,
    }) &&
    stableJson(packet.unresolved_bindings) ===
      stableJson(["attribution", "direction", "feature_extent", "phase", "traversal"]);
}

function isExactEastGunHillRoadPacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const group = packet.what_is_known.target_groups[0];
  const dossierContract = EAST_GUN_HILL_DOSSIER_CONTRACTS.get(row.gtfs_route_id);
  const dossierSha256 = EAST_GUN_HILL_DOSSIER_SHA256.get(row.gtfs_route_id);
  if (!group || !dossierContract || !dossierSha256) return false;
  const dossierRefs = packet.what_is_known.dossier_refs;
  const featureRows = group.feature_matches.map((match) => [
    match.feature_key,
    match.feature_id,
    match.direction,
    match.matched_date,
    match.matched_token_literal,
    match.open_dates_literal,
    match.sbs_routes,
  ]);
  const expectedDossierSummary = {
    row_count: dossierRefs.length,
    target_row_count: dossierRefs.filter((ref) => ref.candidate_target_match).length,
    counts_by_verdict: countBy(dossierRefs.map((ref) => ref.verdict_class), [
      "traversal_confirmed", "traversal_marginal", "no_traversal", "geometry_ambiguous",
    ] satisfies LaneTraversalVerdict[]),
    counts_by_reason: recordCounts(dossierRefs.map((ref) => ref.reason)),
    counts_by_path_source: countBy(dossierRefs.map((ref) => ref.path_source), [
      "gtfs_shape", "historical_schedule_timepoint_pattern", "unavailable",
    ] satisfies LaneTraversalRow["path_source"][]),
  };
  return row.implementation_date === "2023-10-31" &&
    packet.missing_binding === "feature_extent" &&
    stableJson(packet.unresolved_bindings) ===
      stableJson(["attribution", "direction", "feature_extent", "phase", "traversal"]) &&
    packet.what_is_known.target_groups.length === 1 &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    group.lane_group_id === "BX|EAST GUN HILL ROAD" && group.borough === "BX" &&
    group.facility === "Gun Hill Road" && group.street === "EAST GUN HILL ROAD" &&
    group.geometry_scope === "coextensive_with_lane_group" &&
    group.feature_matches.length === 109 &&
    new Set(group.feature_matches.map((match) => match.feature_key)).size === 109 &&
    new Set(group.feature_matches.map((match) => match.feature_id)).size === 61 &&
    group.feature_matches.filter((match) => match.direction === "EB").length === 48 &&
    group.feature_matches.filter((match) => match.direction === "WB").length === 61 &&
    group.feature_matches.every((match) => match.matched_date === "2023-10-31" &&
      match.matched_token_literal === "10/31/2023" && match.open_dates_literal === "10/31/2023" &&
      match.sbs_routes.length === 0) &&
    hash(stableJson(featureRows as JsonValue)) === EAST_GUN_HILL_FEATURE_ROWS_SHA256 &&
    stableJson(dossierRefs) === stableJson(row.dossier_refs) && hash(stableJson(dossierRefs)) === dossierSha256 &&
    dossierRefs.length === dossierContract.rowCount &&
    dossierRefs.filter((ref) => ref.candidate_target_match).length === dossierContract.targetRowCount &&
    dossierRefs.every((ref) => ref.service_date === "2023-10-31" && ref.temporal_lag_days === 0 &&
      ref.path_source === "historical_schedule_timepoint_pattern" &&
      ref.verdict_class === "geometry_ambiguous") &&
    stableJson(packet.what_is_known.dossier_summary) === stableJson(expectedDossierSummary);
}

function isFrCapodannoLedgerTarget(row: BusLaneIdentityRow): boolean {
  return row.gtfs_route_id === "S52" && row.implementation_date === "2010-11-10" &&
    row.onset_evidence.target_groups.length === 1 &&
    row.onset_evidence.target_groups[0]?.lane_group_id === "SI|FR CAPODANNO BOULEVARD";
}

function isExactFrCapodannoPacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const group = packet.what_is_known.target_groups[0];
  const dossierRef = packet.what_is_known.dossier_refs[0];
  const prior = packet.what_is_known.prior_acquisition_receipt;
  if (!group || !dossierRef || !prior || !isFrCapodannoLedgerTarget(row)) return false;
  const featureRows = group.feature_matches.map((match) => [
    match.feature_key,
    match.feature_id,
    match.direction,
    match.matched_date,
    match.matched_token_literal,
    match.open_dates_literal,
    match.sbs_routes,
  ]);
  return packet.missing_binding === "feature_extent" &&
    stableJson(packet.unresolved_bindings) ===
      stableJson(["attribution", "direction", "feature_extent", "phase", "traversal"]) &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    stableJson(packet.what_is_known.dossier_refs) === stableJson(row.dossier_refs) &&
    group.borough === "SI" && group.facility === "Father Capodanno Bl" &&
    group.street === "FR CAPODANNO BOULEVARD" && group.geometry_scope === "coextensive_with_lane_group" &&
    group.feature_matches.length === 42 &&
    new Set(group.feature_matches.map((match) => match.feature_key)).size === 42 &&
    new Set(group.feature_matches.map((match) => match.feature_id)).size === 42 &&
    group.feature_matches.every((match) => match.direction === "NB" &&
      match.matched_date === "2010-11-10" && match.matched_token_literal === "11/10/10" &&
      match.open_dates_literal === "11/10/10" && match.sbs_routes.length === 0) &&
    hash(stableJson(featureRows as JsonValue)) === FR_CAPODANNO_FEATURE_ROWS_SHA256 &&
    packet.what_is_known.dossier_refs.length === 1 &&
    hash(stableJson(packet.what_is_known.dossier_refs)) === FR_CAPODANNO_DOSSIER_SHA256 &&
    dossierRef.candidate_target_match === false && dossierRef.direction === null &&
    dossierRef.lane_group_id === null && dossierRef.path_identity === null &&
    dossierRef.path_source === "unavailable" &&
    dossierRef.reason === "historical_schedule_unavailable_pre_2023" &&
    dossierRef.service_date === null && dossierRef.temporal_lag_days === null &&
    dossierRef.verdict_class === "geometry_ambiguous" && dossierRef.overlap_miles === 0 &&
    dossierRef.overlap_share === 0 && dossierRef.stop_coordinate_coverage === 0 &&
    dossierRef.span_stop_ids.length === 0 &&
      stableJson(packet.what_is_known.dossier_summary) === stableJson({
      counts_by_path_source: { gtfs_shape: 0, historical_schedule_timepoint_pattern: 0, unavailable: 1 },
      counts_by_reason: { historical_schedule_unavailable_pre_2023: 1 },
      counts_by_verdict: {
        geometry_ambiguous: 1, no_traversal: 0, traversal_confirmed: 0, traversal_marginal: 0,
      },
      row_count: 1,
      target_row_count: 0,
    }) &&
    prior.artifact === FR_CAPODANNO_PRIOR.artifact && prior.receipt_id === FR_CAPODANNO_PRIOR.receiptId &&
    prior.row_sha256 === FR_CAPODANNO_PRIOR.rowSha256 &&
    prior.disposition === "completed_search_route_linkage_unresolved";
}

function isTwentyFirstStreetLedgerTarget(row: BusLaneIdentityRow): boolean {
  return TWENTY_FIRST_STREET_PRIORS.has(row.gtfs_route_id) &&
    row.implementation_date === "2022-08-15" &&
    row.onset_evidence.target_groups.length === 1 &&
    row.onset_evidence.target_groups[0]?.lane_group_id === "QNS|21 STREET";
}

function isExactTwentyFirstStreetPacketTarget(
  packet: BusLaneResearchPacket,
  row: BusLaneIdentityRow,
): boolean {
  const group = packet.what_is_known.target_groups[0];
  const dossierRef = packet.what_is_known.dossier_refs[0];
  const prior = packet.what_is_known.prior_acquisition_receipt;
  const priorContract = TWENTY_FIRST_STREET_PRIORS.get(row.gtfs_route_id);
  const dossierSha256 = TWENTY_FIRST_STREET_DOSSIER_SHA256.get(row.gtfs_route_id);
  if (!group || !dossierRef || !prior || !priorContract || !dossierSha256 ||
      !isTwentyFirstStreetLedgerTarget(row)) return false;
  const featureRows = group.feature_matches.map((match) => [
    match.feature_key,
    match.feature_id,
    match.direction,
    match.matched_date,
    match.matched_token_literal,
    match.open_dates_literal,
    match.sbs_routes,
  ]);
  return packet.missing_binding === "feature_extent" &&
    stableJson(packet.unresolved_bindings) ===
      stableJson(["attribution", "direction", "feature_extent", "phase", "traversal"]) &&
    stableJson(packet.what_is_known.target_groups) === stableJson(row.onset_evidence.target_groups) &&
    stableJson(packet.what_is_known.dossier_refs) === stableJson(row.dossier_refs) &&
    group.borough === "QNS" && group.facility === "21st" && group.street === "21 STREET" &&
    group.geometry_scope === "coextensive_with_lane_group" &&
    group.feature_matches.length === 100 &&
    new Set(group.feature_matches.map((match) => match.feature_key)).size === 100 &&
    new Set(group.feature_matches.map((match) => match.feature_id)).size === 51 &&
    group.feature_matches.filter((match) => match.direction === "NB").length === 51 &&
    group.feature_matches.filter((match) => match.direction === "SB").length === 49 &&
    group.feature_matches.every((match) =>
      (match.direction === "NB" || match.direction === "SB") &&
      match.matched_date === "2022-08-15" && match.matched_token_literal === "8/15/2022" &&
      match.open_dates_literal === "8/15/2022" && match.sbs_routes.length === 0) &&
    hash(stableJson(featureRows as JsonValue)) === TWENTY_FIRST_STREET_FEATURE_ROWS_SHA256 &&
    packet.what_is_known.dossier_refs.length === 1 &&
    hash(stableJson(packet.what_is_known.dossier_refs)) === dossierSha256 &&
    dossierRef.candidate_target_match === false && dossierRef.direction === null &&
    dossierRef.lane_group_id === null && dossierRef.path_identity === null &&
    dossierRef.path_source === "unavailable" &&
    dossierRef.reason === "historical_schedule_unavailable_pre_2023" &&
    dossierRef.service_date === null && dossierRef.temporal_lag_days === null &&
    dossierRef.verdict_class === "geometry_ambiguous" && dossierRef.overlap_miles === 0 &&
    dossierRef.overlap_share === 0 && dossierRef.stop_coordinate_coverage === 0 &&
    dossierRef.span_stop_ids.length === 0 &&
    stableJson(packet.what_is_known.dossier_summary) === stableJson({
      counts_by_path_source: { gtfs_shape: 0, historical_schedule_timepoint_pattern: 0, unavailable: 1 },
      counts_by_reason: { historical_schedule_unavailable_pre_2023: 1 },
      counts_by_verdict: {
        geometry_ambiguous: 1, no_traversal: 0, traversal_confirmed: 0, traversal_marginal: 0,
      },
      row_count: 1,
      target_row_count: 0,
    }) &&
    prior.artifact === TWENTY_FIRST_STREET_PRIOR_ARTIFACT &&
    prior.receipt_id === priorContract.receiptId && prior.row_sha256 === priorContract.rowSha256 &&
    prior.disposition === priorContract.disposition;
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
  if (isFrCapodannoLedgerTarget(row)) return "feature_extent";
  if (isTwentyFirstStreetLedgerTarget(row)) return "feature_extent";
  if (row.implementation_date === "2023-10-31" && EAST_GUN_HILL_PRIOR_RECEIPTS.has(row.gtfs_route_id) &&
      row.onset_evidence.target_groups.length === 1 &&
      row.onset_evidence.target_groups[0]?.lane_group_id === "BX|EAST GUN HILL ROAD") {
    return "feature_extent";
  }
  if (row.onset_evidence.target_groups.some((target) => target.geometry_scope === "mixed_date_feature_union")) {
    return "feature_extent";
  }
  return "traversal";
}

function packetUnresolvedBindings(row: BusLaneIdentityRow): BusLaneMissingBinding[] {
  if (row.unresolved_bindings.length > 0) return row.unresolved_bindings;
  const bindings = new Set<BusLaneMissingBinding>([packetMissingBinding(row)]);
  const targets = row.onset_evidence.target_groups;
  if (isFrCapodannoLedgerTarget(row)) {
    bindings.add("attribution");
    bindings.add("direction");
    bindings.add("feature_extent");
    bindings.add("phase");
    bindings.add("traversal");
  }
  if (isTwentyFirstStreetLedgerTarget(row)) {
    bindings.add("attribution");
    bindings.add("direction");
    bindings.add("feature_extent");
    bindings.add("phase");
    bindings.add("traversal");
  }
  if (row.implementation_date === "2023-10-31" && EAST_GUN_HILL_PRIOR_RECEIPTS.has(row.gtfs_route_id) &&
      targets.length === 1 && targets[0]?.lane_group_id === "BX|EAST GUN HILL ROAD") {
    bindings.add("attribution");
    bindings.add("direction");
    bindings.add("feature_extent");
    bindings.add("phase");
    bindings.add("traversal");
  }
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

function eastGunHillSearch(routeId: string): Record<string, unknown> {
  const queryStatus = "executed_against_pinned_repository_evidence_2026-07-23";
  return {
    disposition: "binding_absent_after_search",
    domains: ["data.cityofnewyork.us", "www.mta.info", "www.nyc.gov"],
    exact_queries: [
      {
        category: "official_nyc_dot_lane_project",
        query: `repository evidence search \"${routeId}\" \"East Gun Hill Road\" bus lanes 2023-10-31`,
        query_status: queryStatus,
      },
      {
        category: "official_mta_route_project",
        query: `repository evidence search \"${routeId}\" \"East Gun Hill Road\" bus route project 2023-10-31`,
        query_status: queryStatus,
      },
      {
        category: "official_public_board_committee",
        query: `repository evidence search \"${routeId}\" \"East Gun Hill Road\" community board 2023-10-31`,
        query_status: queryStatus,
      },
      {
        category: "other_repository_approved_primary",
        query: `NYC DOT Open Data ycrg-ses3 route=${routeId} facility=Gun Hill Road open_dates contains 2023-10-31`,
        query_status: queryStatus,
      },
    ],
    retrievals: [
      {
        category: "official_nyc_dot_lane_project",
        id: "gun_hill_completion",
        sha256: EAST_GUN_HILL_ACQUIRED_CHECKS.unavailableSources[0]!.sha256,
        status: "pinned_metadata_only_raw_content_unavailable",
        url: EAST_GUN_HILL_ACQUIRED_CHECKS.unavailableSources[0]!.url,
      },
      {
        category: "official_mta_route_project",
        id: EAST_GUN_HILL_CONTEXT_SOURCE.sourceId,
        sha256: EAST_GUN_HILL_CONTEXT_SOURCE.sourceSha256,
        status: "acquired_staged_and_hash_verified",
        url: EAST_GUN_HILL_CONTEXT_SOURCE.sourceUrl,
      },
      {
        category: "official_public_board_committee",
        id: "gun_hill_cb7",
        sha256: EAST_GUN_HILL_ACQUIRED_CHECKS.unavailableSources[1]!.sha256,
        status: "pinned_metadata_only_raw_content_unavailable",
        url: EAST_GUN_HILL_ACQUIRED_CHECKS.unavailableSources[1]!.url,
      },
      {
        category: "other_repository_approved_primary",
        id: UNIVERSITY_AVENUE_CURRENT_SOURCE.sourceId,
        sha256: UNIVERSITY_AVENUE_CURRENT_SOURCE.sha256,
        status: "acquired_staged_and_hash_verified",
        url: "https://data.cityofnewyork.us/resource/ycrg-ses3.json?$limit=5000",
      },
    ],
    urls_inspected: [
      "https://data.cityofnewyork.us/resource/ycrg-ses3.json?$limit=5000",
      EAST_GUN_HILL_CONTEXT_SOURCE.sourceUrl,
      ...EAST_GUN_HILL_ACQUIRED_CHECKS.unavailableSources.map((source) => source.url),
    ].sort(),
  };
}

function eastGunHillRationale(row: BusLaneIdentityRow, packet: BusLaneResearchPacket): string {
  const dossierContract = EAST_GUN_HILL_DOSSIER_CONTRACTS.get(row.gtfs_route_id)!;
  const priorAvailable = EAST_GUN_HILL_PRIOR_RECEIPTS.get(row.gtfs_route_id) !== null;
  const named = EAST_GUN_HILL_CONTEXT_ROUTES.includes(row.gtfs_route_id);
  const priorSentence = priorAvailable
    ? "The immutable Bronx acquisition receipt remains byte-preserved and found no exact candidate feature or occurrence identity."
    : "The current ledger and packet contain no candidate-specific prior acquisition receipt; this closure records that absence and does not fabricate a prior row.";
  const contextSentence = named
    ? `The staged MTA performance report names ${row.gtfs_route_id === "BX41+" ? "Bx41-SBS" : row.gtfs_route_id} among four routes expected to benefit from the completed 3.1-mile Gun Hill Road lanes, but it does not identify the candidate's ordered 109-row feature target, direction-specific extent, or historical traversal.`
    : "The staged MTA performance report names four other routes for the completed 3.1-mile Gun Hill Road lanes; that nonexclusive route inventory is context only and is not a wrong-route refutation.";
  return `The exact current target is the ordered 109-row, 109-key, 61-ID East Gun Hill Road lane group dated 2023-10-31, with 48 eastbound and 61 westbound rows and no registry route names. ${priorSentence} ${contextSentence} The candidate-dated historical schedule dossier contains ${dossierContract.rowCount} geometry-ambiguous rows, including ${dossierContract.targetRowCount} target-tagged rows, and proves neither full traversal nor exclusion. The group-level lane target and date do not prove the route-specific feature extent or whether this candidate represents onset versus a later phase. The stronger NYC DOT completion source is not present in the staged corpus; its acquired-source check retained only metadata and explicitly did not retain raw content, so derived export references to that missing source are not used as evidence. Attribution, direction, feature extent, phase, and traversal remain unresolved. This is not a no-traversal or wrong-route refutation and authorizes no occurrence, study, or cross-product projection.`;
}

export function buildEastGunHillBindingReceiptDraft(
  row: BusLaneIdentityRow,
  packet: BusLaneResearchPacket,
): Record<string, unknown> {
  if (!isExactEastGunHillRoadPacketTarget(packet, row)) {
    throw new Error("East Gun Hill Road packet does not match the exact candidate");
  }
  const priorContract = EAST_GUN_HILL_PRIOR_RECEIPTS.get(row.gtfs_route_id);
  const receiptSuffix = EAST_GUN_HILL_RECEIPT_SUFFIXES.get(row.gtfs_route_id)!;
  const matches = packet.what_is_known.target_groups.flatMap((group) => group.feature_matches);
  const contextRouteMatch = EAST_GUN_HILL_CONTEXT_ROUTES.includes(row.gtfs_route_id);
  return {
    authorizes_cross_product: false,
    authorizes_study: false,
    candidate_fingerprint: row.candidate_fingerprint,
    candidate_id: row.candidate_id,
    candidate_urls: [],
    disposition: "binding_absent_after_search",
    gap_ids: [row.ledger_id],
    gtfs_route_id: row.gtfs_route_id,
    implementation_date: row.implementation_date,
    missing_binding: "feature_extent",
    operator: "plan039-corridor-adjudicator",
    prior_receipt: priorContract === null ? null : packet.what_is_known.prior_acquisition_receipt,
    prior_search_status: priorContract === null
      ? {
        prior_candidate_receipt_available: false,
        prior_receipt_preserved: false,
        reason: "No candidate-specific prior acquisition receipt is attached to the current ledger or packet; none is synthesized by this closure.",
      }
      : {
        prior_candidate_receipt_available: true,
        prior_receipt_preserved: true,
        reason: "The current packet resolves an immutable Bronx acquisition receipt whose exact row hash is preserved by this closure.",
      },
    project_context: {
      authorizes_cross_product: false,
      authorizes_study: false,
      candidate_completion_date_bound: false,
      candidate_exact_target_bound: false,
      candidate_route_id: row.gtfs_route_id,
      candidate_route_inventory_match: contextRouteMatch,
      completion_day_literal: "October 31",
      completion_year_bound_from_block: false,
      context_only: true,
      direction_bound: false,
      evidence_block_id: EAST_GUN_HILL_CONTEXT_SOURCE.blockId,
      evidence_text_sha256: EAST_GUN_HILL_CONTEXT_SOURCE.blockTextSha256,
      finding_kind: "east_gun_hill_completion_route_context_nonterminal",
      named_route_literals: EAST_GUN_HILL_CONTEXT_SOURCE.namedRouteLiterals,
      normalized_context_route_ids: EAST_GUN_HILL_CONTEXT_ROUTES,
      not_named_is_not_refutation: true,
      source_artifact: EAST_GUN_HILL_CONTEXT_SOURCE.artifact,
      source_blocks_artifact: EAST_GUN_HILL_CONTEXT_SOURCE.blocksArtifact,
      source_blocks_sha256: EAST_GUN_HILL_CONTEXT_SOURCE.blocksSha256,
      source_id: EAST_GUN_HILL_CONTEXT_SOURCE.sourceId,
      source_sha256: EAST_GUN_HILL_CONTEXT_SOURCE.sourceSha256,
      source_url: EAST_GUN_HILL_CONTEXT_SOURCE.sourceUrl,
      traversal_bound: false,
    },
    rationale: eastGunHillRationale(row, packet),
    receipt_id: `bus-lane-binding-search:${receiptSuffix}`,
    receipt_kind: "binding_absent_after_search",
    schema_version: 1,
    search: eastGunHillSearch(row.gtfs_route_id),
    searched_at: "2026-07-23",
    source_gap: {
      authorizes_cross_product: false,
      authorizes_study: false,
      derived_release_records_used_as_source_evidence: false,
      expected_path: EAST_GUN_HILL_MISSING_SOURCE.expectedPath,
      missing_source_id: EAST_GUN_HILL_MISSING_SOURCE.sourceId,
      raw_evidence_available: false,
      resolution_rule: "Reopen this closure if the missing source is staged with independently verifiable bytes and citeable blocks; do not infer its content from derived exports.",
      staged_source_available: false,
      unavailable_acquisition_records: EAST_GUN_HILL_ACQUIRED_CHECKS.unavailableSources.map((source) => ({
        byte_length: source.byteLength,
        content_sha256: source.sha256,
        id: source.id,
        raw_content_retained: false,
        retrieval_status: "acquired",
        url: source.url,
      })),
    },
    target: {
      directions: [...new Set(matches.map((match) => match.direction))].sort(),
      feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
      feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
      feature_row_count: matches.length,
      feature_rows: matches.map((match) => ({
        direction: match.direction,
        feature_id: match.feature_id,
        feature_key: match.feature_key,
      })),
      geometry_scopes: [...new Set(packet.what_is_known.target_groups.map((group) => group.geometry_scope))].sort(),
      lane_group_ids: packet.what_is_known.target_groups.map((group) => group.lane_group_id),
      matched_date: row.implementation_date,
      named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
      open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
    },
    unresolved_bindings: ["attribution", "direction", "feature_extent", "phase", "traversal"],
  };
}

function validateEastGunHillBindingReceipt(
  receipt: Record<string, unknown>,
  receiptPath: string,
  row: BusLaneIdentityRow,
  packet: BusLaneResearchPacket,
  rootDir: string,
  acquiredSourceRecords: readonly Record<string, unknown>[],
): void {
  const fail = (): never => {
    throw new Error(`${receiptPath}: East Gun Hill Road absence contract does not match the exact candidate`);
  };
  let expected: Record<string, unknown>;
  try {
    expected = buildEastGunHillBindingReceiptDraft(row, packet);
  } catch {
    return fail();
  }
  if (stableJson(receipt as JsonValue) !== stableJson(expected as JsonValue)) fail();

  const currentSourcePath = resolve(rootDir, UNIVERSITY_AVENUE_CURRENT_SOURCE.artifact);
  const currentMetadataPath = resolve(rootDir, "raw/sources",
    UNIVERSITY_AVENUE_CURRENT_SOURCE.sourceId, "metadata.json");
  const contextArtifactPath = resolve(rootDir, EAST_GUN_HILL_CONTEXT_SOURCE.artifact);
  const contextBlocksPath = resolve(rootDir, EAST_GUN_HILL_CONTEXT_SOURCE.blocksArtifact);
  const contextMetadataPath = resolve(rootDir, "raw/sources",
    EAST_GUN_HILL_CONTEXT_SOURCE.sourceId, "metadata.json");
  const acquiredChecksPath = resolve(rootDir, EAST_GUN_HILL_ACQUIRED_CHECKS.artifact);
  if (![currentSourcePath, currentMetadataPath, contextArtifactPath, contextBlocksPath,
    contextMetadataPath, acquiredChecksPath].every(existsSync) ||
      existsSync(resolve(rootDir, EAST_GUN_HILL_MISSING_SOURCE.expectedPath)) ||
      hash(readFileSync(currentSourcePath)) !== UNIVERSITY_AVENUE_CURRENT_SOURCE.sha256 ||
      hash(readFileSync(contextArtifactPath)) !== EAST_GUN_HILL_CONTEXT_SOURCE.sourceSha256 ||
      hash(readFileSync(contextBlocksPath)) !== EAST_GUN_HILL_CONTEXT_SOURCE.blocksSha256 ||
      hash(readFileSync(contextMetadataPath)) !== EAST_GUN_HILL_CONTEXT_SOURCE.metadataSha256 ||
      hash(readFileSync(acquiredChecksPath)) !== EAST_GUN_HILL_ACQUIRED_CHECKS.sha256) fail();

  const currentMetadata = object(JSON.parse(readFileSync(currentMetadataPath, "utf8")), currentMetadataPath);
  const contextMetadata = object(JSON.parse(readFileSync(contextMetadataPath, "utf8")), contextMetadataPath);
  const contextBlock = readFileSync(contextBlocksPath, "utf8").split(/\r?\n/u).filter(Boolean)
    .map((line) => object(JSON.parse(line), contextBlocksPath))
    .find((block) => block.block_id === EAST_GUN_HILL_CONTEXT_SOURCE.blockId);
  if (currentMetadata.sourceId !== UNIVERSITY_AVENUE_CURRENT_SOURCE.sourceId ||
      String(currentMetadata.sha256).replace(/^sha256:/u, "") !== UNIVERSITY_AVENUE_CURRENT_SOURCE.sha256 ||
      contextMetadata.sourceId !== EAST_GUN_HILL_CONTEXT_SOURCE.sourceId ||
      contextMetadata.sourceUrl !== EAST_GUN_HILL_CONTEXT_SOURCE.sourceUrl ||
      String(contextMetadata.sha256).replace(/^sha256:/u, "") !== EAST_GUN_HILL_CONTEXT_SOURCE.sourceSha256 ||
      !contextBlock || contextBlock.raw_text_sha256 !== EAST_GUN_HILL_CONTEXT_SOURCE.blockTextSha256 ||
      !EAST_GUN_HILL_CONTEXT_SOURCE.namedRouteLiterals.every((literal) =>
        String(contextBlock.raw_text).toUpperCase().includes(literal))) fail();

  for (const expectedSource of EAST_GUN_HILL_ACQUIRED_CHECKS.unavailableSources) {
    const source = acquiredSourceRecords.find((record) => record.id === expectedSource.id);
    if (!source || source.url !== expectedSource.url || source.content_sha256 !== expectedSource.sha256 ||
        source.byte_length !== expectedSource.byteLength || source.retrieval_status !== "acquired" ||
        source.raw_content_retained !== false) fail();
  }

  const priorContract = EAST_GUN_HILL_PRIOR_RECEIPTS.get(row.gtfs_route_id);
  if (priorContract === null) {
    if (packet.what_is_known.prior_acquisition_receipt !== null || receipt.prior_receipt !== null) fail();
    return;
  }
  if (!priorContract) return fail();
  const priorPointer = packet.what_is_known.prior_acquisition_receipt;
  if (!priorPointer || priorPointer.artifact !== EAST_GUN_HILL_PRIOR_ARTIFACT ||
      priorPointer.receipt_id !== priorContract.receiptId || priorPointer.row_sha256 !== priorContract.rowSha256) fail();
  const priorPath = resolve(rootDir, EAST_GUN_HILL_PRIOR_ARTIFACT);
  if (!existsSync(priorPath)) fail();
  const priorLine = readFileSync(priorPath, "utf8").split(/\r?\n/u).find((line) => {
    if (!line) return false;
    return object(JSON.parse(line), priorPath).receipt_id === priorContract.receiptId;
  });
  const resolvedPriorLine = priorLine ?? fail();
  if (hash(resolvedPriorLine) !== priorContract.rowSha256) fail();
  const prior = object(JSON.parse(resolvedPriorLine), `${priorPath}:${priorContract.receiptId}`);
  const candidate = object(prior.candidate, `${priorPath}.candidate`);
  const findings = object(prior.source_findings, `${priorPath}.source_findings`);
  const routePage = object(findings.mta_route_page, `${priorPath}.source_findings.mta_route_page`);
  const claims = object(prior.claim_results, `${priorPath}.claim_results`);
  const outcome = object(prior.outcome, `${priorPath}.outcome`);
  const actions = object(prior.canonical_actions, `${priorPath}.canonical_actions`);
  const expectedNormalizedRoute = row.gtfs_route_id === "BX41+" ? "BX41" : row.gtfs_route_id;
  if (candidate.candidate_id !== row.candidate_id || candidate.route_id !== row.gtfs_route_id ||
      candidate.normalized_route_id !== expectedNormalizedRoute ||
      candidate.identity !== `${row.gtfs_route_id}|bus_lane|2023-10-31|day` ||
      candidate.implementation_date !== "2023-10-31" || candidate.corridor !== "Gun Hill Road" ||
      findings.candidate_named_lane_record_count !== 0 ||
      findings.exact_project_route_statement_found !== false || findings.exact_project_route_source_id !== null ||
      findings.official_lane_matching_record_count !== 109 ||
      !Array.isArray(findings.official_lane_matching_segment_ids) ||
      new Set(findings.official_lane_matching_segment_ids).size !== 61 ||
      stableJson(findings.official_lane_named_routes as JsonValue) !== stableJson([]) ||
      stableJson(findings.official_route_named_segment_ids as JsonValue) !== stableJson([]) ||
      routePage.content_sha256 !== priorContract.routePageSha256 ||
      routePage.exact_route_title_found !== true || routePage.current_corridor_token_found !== false ||
      routePage.retrieval_status !== "acquired" || claims.candidate_segment_ids_pinned !== false ||
      claims.date_and_phase_proved !== false || claims.exact_route_treatment_binding_proved !== false ||
      claims.exact_segment_binding_proved !== false || claims.explicit_phase_identity_proved !== false ||
      claims.operational_occurrence_identity_proved !== false ||
      !Array.isArray(claims.exact_route_binding_evidence) || claims.exact_route_binding_evidence.length !== 0 ||
      outcome.exclusive_primary_disposition !== "completed_search_route_linkage_unresolved" ||
      outcome.registry_projection_excluded !== true || outcome.still_unresolved !== true ||
      outcome.study_projection_eligible !== false || actions.operational_occurrence_added_or_updated !== false ||
      !Array.isArray(actions.canonical_links_added) || actions.canonical_links_added.length !== 0) fail();
}

function frCapodannoRationale(): string {
  return "The exact current registry target is the ordered 42-row, 42-key, 42-ID northbound Father Capodanno Boulevard lane group dated 2010-11-10, with literal 11/10/10 and no named routes. The immutable Staten Island acquisition receipt found no authoritative S52 route-treatment binding, retained no historical candidate segment identifiers, and proved neither exact feature extent nor onset-versus-later-phase identity. Its live S52 route-page lookup is explicitly current-only. The target rows are northbound, but without a candidate-specific route/segment binding that group direction is not bound to the historical S52 candidate. The pre-2023 dossier is unavailable and supplies no candidate-target direction or traversal. Staged 2012 and 2014 Hylan-project sources use Father Capodanno only as a parallel or unchanged comparison corridor; they neither prove nor refute the distinct 2010 S52 candidate. Other candidate-search retrievals are nonretained metadata, and the prior-only Bustime retrieval is not independently present in acquired-source checks, so none is promoted as source evidence. Attribution, direction, feature extent, phase, and traversal remain unresolved. This authorizes no occurrence, study, or cross-product projection.";
}

export function buildFrCapodannoBindingReceiptDraft(
  row: BusLaneIdentityRow,
  packet: BusLaneResearchPacket,
): Record<string, unknown> {
  if (!isExactFrCapodannoPacketTarget(packet, row)) {
    throw new Error("Father Capodanno Boulevard packet does not match the exact candidate");
  }
  const matches = packet.what_is_known.target_groups.flatMap((group) => group.feature_matches);
  return {
    authorizes_cross_product: false,
    authorizes_study: false,
    candidate_fingerprint: row.candidate_fingerprint,
    candidate_id: row.candidate_id,
    candidate_urls: [],
    context_evidence: FR_CAPODANNO_CONTEXT_SOURCES.map((source) => ({
      authorizes_cross_product: false,
      authorizes_study: false,
      candidate_date_bound: false,
      candidate_direction_bound: false,
      candidate_route_bound: false,
      candidate_target_bound: false,
      classification: source.classification,
      context_only: true,
      evidence_block_id: source.blockId,
      evidence_text_sha256: source.blockTextSha256,
      not_candidate_refutation: true,
      source_artifact: source.artifact,
      source_blocks_artifact: source.blocksArtifact,
      source_blocks_sha256: source.blocksSha256,
      source_id: source.sourceId,
      source_sha256: source.sourceSha256,
      source_url: source.sourceUrl,
    })),
    disposition: "binding_absent_after_search",
    gap_ids: [row.ledger_id],
    gtfs_route_id: row.gtfs_route_id,
    implementation_date: row.implementation_date,
    missing_binding: "feature_extent",
    operator: "plan039-corridor-adjudicator",
    prior_receipt: packet.what_is_known.prior_acquisition_receipt,
    rationale: frCapodannoRationale(),
    receipt_id: `bus-lane-binding-search:${FR_CAPODANNO_RECEIPT_SUFFIX}`,
    receipt_kind: "binding_absent_after_search",
    schema_version: 1,
    search: {
      disposition: "binding_absent_after_search",
      immutable_prior_receipt_id: FR_CAPODANNO_PRIOR.receiptId,
      repository_context_source_ids: FR_CAPODANNO_CONTEXT_SOURCES.map((source) => source.sourceId),
      staged_current_registry_source_id: UNIVERSITY_AVENUE_CURRENT_SOURCE.sourceId,
      retrieval_classifications: FR_CAPODANNO_ACQUIRED_CHECKS.nonretainedSources.map((source) => ({
        classification: source.classification,
        id: source.id,
        raw_content_retained: false,
      })),
      urls_inspected: [
        "https://bustime-classic.mta.info/m/?q=S52",
        "https://data.cityofnewyork.us/api/views/ycrg-ses3",
        "https://data.cityofnewyork.us/resource/ycrg-ses3.json?$limit=5000",
        "https://files.mta.info/s3fs-public/pdf/bussi-express_0.pdf",
        "https://www.nyc.gov/html/brt/downloads/pdf/2012-03-15_brt_hylan_meeting-slides.pdf",
        "https://www.nyc.gov/html/brt/downloads/pdf/2014-hylan-blvd-final-report.pdf",
        "https://www.nyc.gov/html/dot/downloads/pdf/lincoln-ave-father-capodanno-blvd-railroad-ave-april-2023.pdf",
        "https://www.nyc.gov/html/dot/downloads/pdf/nyc-dot-select-bus-service-report.pdf",
        "https://www.nyc.gov/html/dot/html/about/current-projects.shtml",
        "https://www.nyc.gov/html/dot/html/about/datafeeds.shtml",
      ],
    },
    searched_at: "2026-07-15",
    source_gap: {
      authorizes_cross_product: false,
      authorizes_study: false,
      candidate_specific_authoritative_raw_source_available: false,
      derived_release_records_used_as_source_evidence: false,
      nonretained_acquisition_records: FR_CAPODANNO_ACQUIRED_CHECKS.nonretainedSources.map((source) => ({
        byte_length: source.byteLength,
        classification: source.classification,
        content_sha256: source.sha256,
        id: source.id,
        raw_content_retained: false,
      })),
      prior_only_retrieval: {
        acquired_check_record_available: false,
        content_sha256: FR_CAPODANNO_ACQUIRED_CHECKS.priorOnlyRetrieval.sha256,
        id: FR_CAPODANNO_ACQUIRED_CHECKS.priorOnlyRetrieval.id,
        raw_content_retention_independently_verified: false,
        used_as_source_evidence: false,
      },
      resolution_rule: "Reopen only with independently retained, verifiable, citeable source bytes that bind S52 to the 2010 candidate's route-specific direction, extent, phase, and traversal.",
      staged_candidate_binding_source_available: false,
    },
    target: {
      directions: [...new Set(matches.map((match) => match.direction))].sort(),
      feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
      feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
      feature_row_count: matches.length,
      feature_rows: matches.map((match) => ({
        direction: match.direction,
        feature_id: match.feature_id,
        feature_key: match.feature_key,
      })),
      geometry_scopes: [...new Set(packet.what_is_known.target_groups.map((group) => group.geometry_scope))].sort(),
      lane_group_ids: packet.what_is_known.target_groups.map((group) => group.lane_group_id),
      matched_date: row.implementation_date,
      named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
      open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
    },
    unresolved_bindings: ["attribution", "direction", "feature_extent", "phase", "traversal"],
  };
}

function validateFrCapodannoBindingReceipt(
  receipt: Record<string, unknown>,
  receiptPath: string,
  row: BusLaneIdentityRow,
  packet: BusLaneResearchPacket,
  rootDir: string,
): void {
  const fail = (): never => {
    throw new Error(`${receiptPath}: Father Capodanno Boulevard absence contract does not match the exact candidate`);
  };
  let expected: Record<string, unknown>;
  try {
    expected = buildFrCapodannoBindingReceiptDraft(row, packet);
  } catch {
    return fail();
  }
  if (stableJson(receipt as JsonValue) !== stableJson(expected as JsonValue)) fail();

  const currentSourcePath = resolve(rootDir, UNIVERSITY_AVENUE_CURRENT_SOURCE.artifact);
  const currentMetadataPath = resolve(rootDir, "raw/sources",
    UNIVERSITY_AVENUE_CURRENT_SOURCE.sourceId, "metadata.json");
  const priorPath = resolve(rootDir, FR_CAPODANNO_PRIOR.artifact);
  const acquiredChecksPath = resolve(rootDir, FR_CAPODANNO_ACQUIRED_CHECKS.artifact);
  if (![currentSourcePath, currentMetadataPath, priorPath, acquiredChecksPath].every(existsSync) ||
      hash(readFileSync(currentSourcePath)) !== UNIVERSITY_AVENUE_CURRENT_SOURCE.sha256 ||
      hash(readFileSync(priorPath)) !== FR_CAPODANNO_PRIOR.artifactSha256 ||
      hash(readFileSync(acquiredChecksPath)) !== FR_CAPODANNO_ACQUIRED_CHECKS.sha256) fail();
  const currentMetadata = object(JSON.parse(readFileSync(currentMetadataPath, "utf8")), currentMetadataPath);
  if (currentMetadata.sourceId !== UNIVERSITY_AVENUE_CURRENT_SOURCE.sourceId ||
      String(currentMetadata.sha256).replace(/^sha256:/u, "") !== UNIVERSITY_AVENUE_CURRENT_SOURCE.sha256) fail();

  for (const context of FR_CAPODANNO_CONTEXT_SOURCES) {
    const artifactPath = resolve(rootDir, context.artifact);
    const blocksPath = resolve(rootDir, context.blocksArtifact);
    const metadataPath = resolve(rootDir, "raw/sources", context.sourceId, "metadata.json");
    if (![artifactPath, blocksPath, metadataPath].every(existsSync) ||
        hash(readFileSync(artifactPath)) !== context.sourceSha256 ||
        hash(readFileSync(blocksPath)) !== context.blocksSha256 ||
        hash(readFileSync(metadataPath)) !== context.metadataSha256) fail();
    const metadata = object(JSON.parse(readFileSync(metadataPath, "utf8")), metadataPath);
    const block = readFileSync(blocksPath, "utf8").split(/\r?\n/u).filter(Boolean)
      .map((line) => object(JSON.parse(line), blocksPath))
      .find((value) => value.block_id === context.blockId);
    if (metadata.sourceId !== context.sourceId || metadata.sourceUrl !== context.sourceUrl ||
        String(metadata.sha256).replace(/^sha256:/u, "") !== context.sourceSha256 ||
        !block || block.raw_text_sha256 !== context.blockTextSha256) fail();
  }

  const acquiredChecks = object(JSON.parse(readFileSync(acquiredChecksPath, "utf8")), acquiredChecksPath);
  const acquiredSourceValues = acquiredChecks.sources;
  if (!Array.isArray(acquiredSourceValues)) return fail();
  const acquiredSources = acquiredSourceValues.map((source, index) =>
    object(source, `${acquiredChecksPath}.sources[${index}]`));
  for (const expectedSource of FR_CAPODANNO_ACQUIRED_CHECKS.nonretainedSources) {
    const source = acquiredSources.find((value) => value.id === expectedSource.id);
    if (!source || source.content_sha256 !== expectedSource.sha256 ||
        source.byte_length !== expectedSource.byteLength || source.retrieval_status !== "acquired" ||
        source.raw_content_retained !== false) fail();
  }
  if (acquiredSources.some((source) => source.id === FR_CAPODANNO_ACQUIRED_CHECKS.priorOnlyRetrieval.id)) fail();

  const priorLine = readFileSync(priorPath, "utf8").split(/\r?\n/u).filter(Boolean).find((line) =>
    object(JSON.parse(line), priorPath).receipt_id === FR_CAPODANNO_PRIOR.receiptId);
  const resolvedPriorLine = priorLine ?? fail();
  if (hash(resolvedPriorLine) !== FR_CAPODANNO_PRIOR.rowSha256) fail();
  const prior = object(JSON.parse(resolvedPriorLine), `${priorPath}:${FR_CAPODANNO_PRIOR.receiptId}`);
  const candidate = object(prior.candidate, `${priorPath}.candidate`);
  const findings = object(prior.source_findings, `${priorPath}.source_findings`);
  const routePage = object(findings.mta_route_page, `${priorPath}.source_findings.mta_route_page`);
  const claims = object(prior.claim_results, `${priorPath}.claim_results`);
  const outcome = object(prior.outcome, `${priorPath}.outcome`);
  const actions = object(prior.canonical_actions, `${priorPath}.canonical_actions`);
  const attempts = Array.isArray(prior.acquisition_attempts) ? prior.acquisition_attempts.map((attempt, index) =>
    object(attempt, `${priorPath}.acquisition_attempts[${index}]`)) : [];
  const retrievals = attempts.flatMap((attempt, index) => Array.isArray(attempt.retrievals)
    ? attempt.retrievals.map((retrieval, retrievalIndex) =>
      object(retrieval, `${priorPath}.acquisition_attempts[${index}].retrievals[${retrievalIndex}]`))
    : []);
  const priorOnlyRetrieval = retrievals.find((retrieval) =>
    retrieval.id === FR_CAPODANNO_ACQUIRED_CHECKS.priorOnlyRetrieval.id);
  if (candidate.candidate_id !== row.candidate_id || candidate.route_id !== "S52" ||
      candidate.normalized_route_id !== "S52" || candidate.identity !== "S52|bus_lane|2010-11-10|day" ||
      candidate.implementation_date !== "2010-11-10" || candidate.corridor !== "Father Capodanno Bl" ||
      findings.candidate_named_lane_record_count !== 0 ||
      findings.exact_project_route_statement_found !== false || findings.exact_project_route_source_id !== null ||
      findings.official_lane_matching_record_count !== 42 ||
      !Array.isArray(findings.official_lane_matching_segment_ids) ||
      new Set(findings.official_lane_matching_segment_ids).size !== 42 ||
      stableJson(findings.official_lane_named_routes as JsonValue) !== stableJson([]) ||
      stableJson(findings.official_route_named_segment_ids as JsonValue) !== stableJson([]) ||
      typeof findings.historical_review_rationale !== "string" ||
      !findings.historical_review_rationale.includes("18 candidate-date lane piece(s)") ||
      !findings.historical_review_rationale.includes("2 parsed opening phases") ||
      routePage.content_sha256 !== FR_CAPODANNO_PRIOR.routePageSha256 ||
      routePage.exact_route_title_found !== true || routePage.current_corridor_token_found !== true ||
      routePage.retrieval_status !== "acquired" || typeof routePage.temporal_limitation !== "string" ||
      !routePage.temporal_limitation.includes("captured in 2026") ||
      claims.candidate_segment_ids_pinned !== false || claims.date_and_phase_proved !== false ||
      claims.exact_route_treatment_binding_proved !== false || claims.exact_segment_binding_proved !== false ||
      claims.explicit_phase_identity_proved !== false || claims.operational_occurrence_identity_proved !== false ||
      !Array.isArray(claims.exact_route_binding_evidence) || claims.exact_route_binding_evidence.length !== 0 ||
      !Array.isArray(claims.exact_segment_ids) || claims.exact_segment_ids.length !== 0 ||
      outcome.exclusive_primary_disposition !== "completed_search_route_linkage_unresolved" ||
      outcome.registry_projection_excluded !== true || outcome.still_unresolved !== true ||
      outcome.study_projection_eligible !== false || actions.operational_occurrence_added_or_updated !== false ||
      !Array.isArray(actions.canonical_links_added) || actions.canonical_links_added.length !== 0 ||
      !priorOnlyRetrieval || priorOnlyRetrieval.sha256 !== FR_CAPODANNO_ACQUIRED_CHECKS.priorOnlyRetrieval.sha256 ||
      priorOnlyRetrieval.status !== "acquired") fail();
}

function twentyFirstStreetRationale(row: BusLaneIdentityRow): string {
  const routeContext = row.gtfs_route_id === "Q103"
    ? "The later NYC DOT completion release says Q103 uses one block of the 3.4-mile 21 Street corridor, and the accepted journal preserves generic project, treatment, route, and corridor links. That statement does not identify the candidate's historical seven-piece selection, any exact current feature row, its direction, the 2022-08-15 day, or a stable onset phase; no operational occurrence was materialized."
    : "The later NYC DOT completion release names Q66, Q69, and Q100 as the primary corridor routes and Q102 and Q103 as one-block users, but does not name Q104. This nonexclusive inventory is context only: Q104's omission is not evidence that it did not share a lane, and it supplies no route binding to the historical six-piece candidate.";
  return `The exact current registry target is the ordered 100-row, 100-key, 51-ID 21 Street lane group dated 2022-08-15, with 51 northbound and 49 southbound rows, literal 8/15/2022, and no named routes. The immutable Queens acquisition receipt recorded a ${TWENTY_FIRST_STREET_PRIORS.get(row.gtfs_route_id)!.historicalPieceCount}-piece historical candidate, while the current group contains 100 rows and therefore cannot be substituted as its exact extent. ${routeContext} The completion release was published on 2022-09-29, after the candidate day, and its raw staged source folder is absent; the generated source page and accepted journal are retained only as materialized context and are not promoted to fresh source evidence. A staged MTA planning document discusses 21st Street bus priority for Q102 and says Q102 would use Q103 stops on 40th Avenue, but does not bind ${row.gtfs_route_id} to this candidate's exact date, direction, feature extent, phase, or traversal. The candidate-dated pre-2023 dossier is unavailable and supplies no route path or target match. Attribution, direction, feature extent, phase, and traversal remain unresolved. This authorizes no occurrence, study, or cross-product projection.`;
}

export function buildTwentyFirstStreetBindingReceiptDraft(
  row: BusLaneIdentityRow,
  packet: BusLaneResearchPacket,
): Record<string, unknown> {
  if (!isExactTwentyFirstStreetPacketTarget(packet, row)) {
    throw new Error("21 Street packet does not match the exact candidate");
  }
  const priorContract = TWENTY_FIRST_STREET_PRIORS.get(row.gtfs_route_id)!;
  const receiptSuffix = TWENTY_FIRST_STREET_RECEIPT_SUFFIXES.get(row.gtfs_route_id)!;
  const matches = packet.what_is_known.target_groups.flatMap((group) => group.feature_matches);
  const q103 = row.gtfs_route_id === "Q103";
  const urlsInspected = [
    ...TWENTY_FIRST_STREET_ACQUIRED_CHECKS.nonretainedSources.map((source) => source.url),
    `https://bustime-classic.mta.info/m/?q=${row.gtfs_route_id}`,
    TWENTY_FIRST_STREET_STAGED_CONTEXT.sourceUrl,
  ].sort();
  return {
    authorizes_cross_product: false,
    authorizes_study: false,
    candidate_fingerprint: row.candidate_fingerprint,
    candidate_id: row.candidate_id,
    candidate_urls: [],
    context_evidence: [
      {
        accepted_journal: TWENTY_FIRST_STREET_COMPLETION_CONTEXT.journal,
        accepted_journal_sha256: TWENTY_FIRST_STREET_COMPLETION_CONTEXT.journalSha256,
        authorizes_cross_product: false,
        authorizes_study: false,
        candidate_date_bound: false,
        candidate_direction_bound: false,
        candidate_exact_target_bound: false,
        candidate_phase_bound: false,
        candidate_route_named: q103,
        candidate_traversal_bound: false,
        classification: "later_completion_project_route_inventory_context",
        context_only: true,
        derived_materialization_used_as_source_evidence: false,
        evidence_blocks: [
          {
            block_id: "p001_b0015",
            text_sha256: "sha256:dfce3ecbded1f6f6e2d867a249ab7e2b4934d11af78573c0dfd336107726915a",
          },
          {
            block_id: "p001_b0023",
            text_sha256: "sha256:5fcb4d234fb2c2800d79288005a7073dd5fbe3b4182ee29ec036bbff9bea08e1",
          },
        ],
        generic_project_route_context: q103,
        not_candidate_refutation: true,
        published_on: "2022-09-29",
        raw_source_available: false,
        route_inventory: TWENTY_FIRST_STREET_COMPLETION_CONTEXT.routeInventory,
        route_scope: q103 ? "one_block_unspecified" : null,
        source_id: TWENTY_FIRST_STREET_COMPLETION_CONTEXT.sourceId,
        source_page: TWENTY_FIRST_STREET_COMPLETION_CONTEXT.sourcePage,
        source_page_sha256: TWENTY_FIRST_STREET_COMPLETION_CONTEXT.sourcePageSha256,
        source_url: TWENTY_FIRST_STREET_COMPLETION_CONTEXT.url,
      },
      {
        authorizes_cross_product: false,
        authorizes_study: false,
        candidate_date_bound: false,
        candidate_direction_bound: false,
        candidate_exact_target_bound: false,
        candidate_phase_bound: false,
        candidate_route_mentioned: q103,
        candidate_traversal_bound: false,
        classification: "preimplementation_q102_planning_and_q103_stop_context",
        context_only: true,
        evidence_blocks: TWENTY_FIRST_STREET_STAGED_CONTEXT.blocks.map((block) => ({
          block_id: block.blockId,
          text_sha256: block.textSha256,
        })),
        not_candidate_refutation: true,
        source_artifact: TWENTY_FIRST_STREET_STAGED_CONTEXT.artifact,
        source_blocks_artifact: TWENTY_FIRST_STREET_STAGED_CONTEXT.blocksArtifact,
        source_blocks_sha256: TWENTY_FIRST_STREET_STAGED_CONTEXT.blocksSha256,
        source_id: TWENTY_FIRST_STREET_STAGED_CONTEXT.sourceId,
        source_sha256: TWENTY_FIRST_STREET_STAGED_CONTEXT.sourceSha256,
        source_url: TWENTY_FIRST_STREET_STAGED_CONTEXT.sourceUrl,
      },
    ],
    disposition: "binding_absent_after_search",
    gap_ids: [row.ledger_id],
    gtfs_route_id: row.gtfs_route_id,
    implementation_date: row.implementation_date,
    missing_binding: "feature_extent",
    operator: "plan039-corridor-adjudicator",
    prior_receipt: packet.what_is_known.prior_acquisition_receipt,
    rationale: twentyFirstStreetRationale(row),
    receipt_id: `bus-lane-binding-search:${receiptSuffix}`,
    receipt_kind: "binding_absent_after_search",
    schema_version: 1,
    search: {
      disposition: "binding_absent_after_search",
      immutable_prior_receipt_id: priorContract.receiptId,
      repository_context_source_ids: [
        TWENTY_FIRST_STREET_COMPLETION_CONTEXT.sourceId,
        TWENTY_FIRST_STREET_STAGED_CONTEXT.sourceId,
      ],
      retrieval_classifications: TWENTY_FIRST_STREET_ACQUIRED_CHECKS.nonretainedSources.map((source) => ({
        classification: source.classification,
        id: source.id,
        raw_content_retained: false,
      })),
      urls_inspected: urlsInspected,
    },
    searched_at: "2026-07-15",
    source_gap: {
      accepted_journal_available: true,
      authorizes_cross_product: false,
      authorizes_study: false,
      candidate_specific_authoritative_raw_source_available: false,
      derived_release_records_used_as_source_evidence: false,
      expected_completion_raw_path: TWENTY_FIRST_STREET_COMPLETION_CONTEXT.expectedRawPath,
      generated_source_page_available: true,
      missing_completion_raw_source_id: TWENTY_FIRST_STREET_COMPLETION_CONTEXT.sourceId,
      nonretained_acquisition_records: TWENTY_FIRST_STREET_ACQUIRED_CHECKS.nonretainedSources.map((source) => ({
        byte_length: source.byteLength,
        classification: source.classification,
        content_sha256: source.sha256,
        id: source.id,
        raw_content_retained: false,
        url: source.url,
      })),
      prior_only_route_page_retrieval: {
        acquired_check_record_available: false,
        content_sha256: priorContract.routePageSha256,
        id: `mta_bustime_${row.gtfs_route_id}`,
        raw_content_retention_independently_verified: false,
        used_as_source_evidence: false,
      },
      prior_staged_source_claim_resolves: false,
      resolution_rule: `Reopen only with independently retained, verifiable, citeable source bytes that bind ${row.gtfs_route_id} to the 2022-08-15 candidate's route-specific direction, exact feature extent, phase, and traversal.`,
      staged_context_source_available: true,
      staged_context_source_proves_candidate_binding: false,
    },
    target: {
      directions: [...new Set(matches.map((match) => match.direction))].sort(),
      feature_ids: [...new Set(matches.map((match) => match.feature_id))].sort(),
      feature_keys: [...new Set(matches.map((match) => match.feature_key))].sort(),
      feature_row_count: matches.length,
      feature_rows: matches.map((match) => ({
        direction: match.direction,
        feature_id: match.feature_id,
        feature_key: match.feature_key,
      })),
      geometry_scopes: [...new Set(packet.what_is_known.target_groups.map((group) => group.geometry_scope))].sort(),
      lane_group_ids: packet.what_is_known.target_groups.map((group) => group.lane_group_id),
      matched_date: row.implementation_date,
      named_sbs_routes: [...new Set(matches.flatMap((match) => match.sbs_routes))].sort(),
      open_dates_literals: [...new Set(matches.map((match) => match.open_dates_literal))].sort(),
    },
    unresolved_bindings: ["attribution", "direction", "feature_extent", "phase", "traversal"],
  };
}

function validateTwentyFirstStreetBindingReceipt(
  receipt: Record<string, unknown>,
  receiptPath: string,
  row: BusLaneIdentityRow,
  packet: BusLaneResearchPacket,
  rootDir: string,
): void {
  const fail = (): never => {
    throw new Error(`${receiptPath}: 21 Street absence contract does not match the exact candidate`);
  };
  let expected: Record<string, unknown>;
  try {
    expected = buildTwentyFirstStreetBindingReceiptDraft(row, packet);
  } catch {
    return fail();
  }
  if (stableJson(receipt as JsonValue) !== stableJson(expected as JsonValue)) fail();
  const priorContract = TWENTY_FIRST_STREET_PRIORS.get(row.gtfs_route_id);
  if (!priorContract) return fail();

  const currentSourcePath = resolve(rootDir, UNIVERSITY_AVENUE_CURRENT_SOURCE.artifact);
  const currentMetadataPath = resolve(rootDir, "raw/sources",
    UNIVERSITY_AVENUE_CURRENT_SOURCE.sourceId, "metadata.json");
  const priorPath = resolve(rootDir, TWENTY_FIRST_STREET_PRIOR_ARTIFACT);
  const acquiredChecksPath = resolve(rootDir, TWENTY_FIRST_STREET_ACQUIRED_CHECKS.artifact);
  const completionSourcePagePath = resolve(rootDir, TWENTY_FIRST_STREET_COMPLETION_CONTEXT.sourcePage);
  const completionJournalPath = resolve(rootDir, TWENTY_FIRST_STREET_COMPLETION_CONTEXT.journal);
  const stagedArtifactPath = resolve(rootDir, TWENTY_FIRST_STREET_STAGED_CONTEXT.artifact);
  const stagedBlocksPath = resolve(rootDir, TWENTY_FIRST_STREET_STAGED_CONTEXT.blocksArtifact);
  const stagedMetadataPath = resolve(rootDir, "raw/sources",
    TWENTY_FIRST_STREET_STAGED_CONTEXT.sourceId, "metadata.json");
  if (![currentSourcePath, currentMetadataPath, priorPath, acquiredChecksPath, completionSourcePagePath,
    completionJournalPath, stagedArtifactPath, stagedBlocksPath, stagedMetadataPath].every(existsSync) ||
      existsSync(resolve(rootDir, TWENTY_FIRST_STREET_COMPLETION_CONTEXT.expectedRawPath)) ||
      hash(readFileSync(currentSourcePath)) !== UNIVERSITY_AVENUE_CURRENT_SOURCE.sha256 ||
      hash(readFileSync(priorPath)) !== TWENTY_FIRST_STREET_PRIOR_ARTIFACT_SHA256 ||
      hash(readFileSync(acquiredChecksPath)) !== TWENTY_FIRST_STREET_ACQUIRED_CHECKS.sha256 ||
      hash(readFileSync(completionSourcePagePath)) !== TWENTY_FIRST_STREET_COMPLETION_CONTEXT.sourcePageSha256 ||
      hash(readFileSync(completionJournalPath)) !== TWENTY_FIRST_STREET_COMPLETION_CONTEXT.journalSha256 ||
      hash(readFileSync(stagedArtifactPath)) !== TWENTY_FIRST_STREET_STAGED_CONTEXT.sourceSha256 ||
      hash(readFileSync(stagedBlocksPath)) !== TWENTY_FIRST_STREET_STAGED_CONTEXT.blocksSha256 ||
      hash(readFileSync(stagedMetadataPath)) !== TWENTY_FIRST_STREET_STAGED_CONTEXT.metadataSha256) fail();

  const currentMetadata = object(JSON.parse(readFileSync(currentMetadataPath, "utf8")), currentMetadataPath);
  const stagedMetadata = object(JSON.parse(readFileSync(stagedMetadataPath, "utf8")), stagedMetadataPath);
  if (currentMetadata.sourceId !== UNIVERSITY_AVENUE_CURRENT_SOURCE.sourceId ||
      String(currentMetadata.sha256).replace(/^sha256:/u, "") !== UNIVERSITY_AVENUE_CURRENT_SOURCE.sha256 ||
      stagedMetadata.sourceId !== TWENTY_FIRST_STREET_STAGED_CONTEXT.sourceId ||
      stagedMetadata.sourceUrl !== TWENTY_FIRST_STREET_STAGED_CONTEXT.sourceUrl ||
      String(stagedMetadata.sha256).replace(/^sha256:/u, "") !== TWENTY_FIRST_STREET_STAGED_CONTEXT.sourceSha256) {
    fail();
  }
  const stagedBlocks = readFileSync(stagedBlocksPath, "utf8").split(/\r?\n/u).filter(Boolean)
    .map((line) => object(JSON.parse(line), stagedBlocksPath));
  for (const expectedBlock of TWENTY_FIRST_STREET_STAGED_CONTEXT.blocks) {
    const block = stagedBlocks.find((value) => value.block_id === expectedBlock.blockId);
    if (!block || block.raw_text_sha256 !== expectedBlock.textSha256) fail();
  }

  const acquiredChecks = object(JSON.parse(readFileSync(acquiredChecksPath, "utf8")), acquiredChecksPath);
  const acquiredSourceValues = acquiredChecks.sources;
  const acquiredSources = (Array.isArray(acquiredSourceValues) ? acquiredSourceValues : fail())
    .map((source, index) =>
    object(source, `${acquiredChecksPath}.sources[${index}]`));
  for (const expectedSource of TWENTY_FIRST_STREET_ACQUIRED_CHECKS.nonretainedSources) {
    const source = acquiredSources.find((value) => value.id === expectedSource.id);
    if (!source || source.url !== expectedSource.url || source.content_sha256 !== expectedSource.sha256 ||
        source.byte_length !== expectedSource.byteLength || source.retrieval_status !== "acquired" ||
        source.raw_content_retained !== false) fail();
  }
  if (acquiredSources.some((source) => source.id === `mta_bustime_${row.gtfs_route_id}`)) fail();

  const priorPointer = packet.what_is_known.prior_acquisition_receipt;
  if (!priorPointer || priorPointer.artifact !== TWENTY_FIRST_STREET_PRIOR_ARTIFACT ||
      priorPointer.receipt_id !== priorContract.receiptId || priorPointer.row_sha256 !== priorContract.rowSha256 ||
      priorPointer.disposition !== priorContract.disposition) fail();
  const priorLine = readFileSync(priorPath, "utf8").split(/\r?\n/u).filter(Boolean).find((line) =>
    object(JSON.parse(line), priorPath).receipt_id === priorContract.receiptId);
  const resolvedPriorLine = priorLine ?? fail();
  if (hash(resolvedPriorLine) !== priorContract.rowSha256) fail();
  const prior = object(JSON.parse(resolvedPriorLine), `${priorPath}:${priorContract.receiptId}`);
  const candidate = object(prior.candidate, `${priorPath}.candidate`);
  const findings = object(prior.source_findings, `${priorPath}.source_findings`);
  const routePage = object(findings.mta_route_page, `${priorPath}.source_findings.mta_route_page`);
  const claims = object(prior.claim_results, `${priorPath}.claim_results`);
  const outcome = object(prior.outcome, `${priorPath}.outcome`);
  const actions = object(prior.canonical_actions, `${priorPath}.canonical_actions`);
  const attempts = Array.isArray(prior.acquisition_attempts) ? prior.acquisition_attempts.map((attempt, index) =>
    object(attempt, `${priorPath}.acquisition_attempts[${index}]`)) : [];
  const retrievals = attempts.flatMap((attempt, index) => Array.isArray(attempt.retrievals)
    ? attempt.retrievals.map((retrieval, retrievalIndex) =>
      object(retrieval, `${priorPath}.acquisition_attempts[${index}].retrievals[${retrievalIndex}]`))
    : []);
  const priorRouteRetrieval = retrievals.find((retrieval) =>
    retrieval.id === `mta_bustime_${row.gtfs_route_id}`);
  const exactRouteEvidence = Array.isArray(claims.exact_route_binding_evidence)
    ? claims.exact_route_binding_evidence.map((value, index) =>
      object(value, `${priorPath}.claim_results.exact_route_binding_evidence[${index}]`))
    : [];
  const expectedLinks = row.gtfs_route_id === "Q103"
    ? [
      "relation_21st-bus-lane-treatment-located-on-corridor-2022",
      "relation_21st-project-has-bus-lane-treatment-completion-2022",
      "relation_21st-project-serves-q103-2022",
      "relation_q103-operates-on-21st-street-corridor-2022",
    ]
    : [];
  if (candidate.candidate_id !== row.candidate_id || candidate.route_id !== row.gtfs_route_id ||
      candidate.normalized_route_id !== row.gtfs_route_id ||
      candidate.identity !== `${row.gtfs_route_id}|bus_lane|2022-08-15|day` ||
      candidate.implementation_date !== "2022-08-15" || candidate.corridor !== "21st" ||
      findings.candidate_named_lane_record_count !== 0 ||
      findings.exact_project_route_statement_found !== priorContract.routeSupported ||
      findings.exact_project_route_source_id !==
        (priorContract.routeSupported ? TWENTY_FIRST_STREET_COMPLETION_CONTEXT.acquiredId : null) ||
      findings.official_lane_matching_record_count !== 100 ||
      !Array.isArray(findings.official_lane_matching_segment_ids) ||
      new Set(findings.official_lane_matching_segment_ids).size !== 51 ||
      stableJson(findings.official_lane_named_routes as JsonValue) !== stableJson([]) ||
      stableJson(findings.official_route_named_segment_ids as JsonValue) !== stableJson([]) ||
      typeof findings.historical_review_rationale !== "string" ||
      !findings.historical_review_rationale.includes(priorContract.historicalPiecePhrase) ||
      routePage.content_sha256 !== priorContract.routePageSha256 ||
      routePage.exact_route_title_found !== true || routePage.current_corridor_token_found !== false ||
      routePage.retrieval_status !== "acquired" || typeof routePage.temporal_limitation !== "string" ||
      !routePage.temporal_limitation.includes("captured in 2026") ||
      claims.candidate_segment_ids_pinned !== false || claims.date_and_phase_proved !== false ||
      claims.exact_route_treatment_binding_proved !== priorContract.routeSupported ||
      claims.exact_segment_binding_proved !== false || claims.explicit_phase_identity_proved !== false ||
      claims.operational_occurrence_identity_proved !== false ||
      !Array.isArray(claims.exact_segment_ids) || claims.exact_segment_ids.length !== 0 ||
      exactRouteEvidence.length !== (priorContract.routeSupported ? 1 : 0) ||
      (priorContract.routeSupported && (
        exactRouteEvidence[0]?.evidence_kind !== "official_project_route_statement" ||
        exactRouteEvidence[0]?.source_id !== TWENTY_FIRST_STREET_COMPLETION_CONTEXT.acquiredId ||
        exactRouteEvidence[0]?.source_sha256 !== TWENTY_FIRST_STREET_COMPLETION_CONTEXT.acquiredSha256 ||
        stableJson(exactRouteEvidence[0]?.official_routes as JsonValue) !==
          stableJson(TWENTY_FIRST_STREET_COMPLETION_CONTEXT.routeInventory))) ||
      outcome.exclusive_primary_disposition !== priorContract.disposition ||
      outcome.registry_projection_excluded !== true || outcome.still_unresolved !== true ||
      outcome.study_projection_eligible !== false ||
      actions.operational_occurrence_added_or_updated !== false ||
      stableJson(actions.canonical_links_added as JsonValue) !== stableJson(expectedLinks) ||
      actions.journal_path !==
        (priorContract.routeSupported ? TWENTY_FIRST_STREET_COMPLETION_CONTEXT.journal : null) ||
      !priorRouteRetrieval || priorRouteRetrieval.sha256 !== priorContract.routePageSha256 ||
      priorRouteRetrieval.status !== "acquired") fail();
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
    const kingsHighwayLedgerTarget = row.implementation_date === "2018-10-05" &&
      row.onset_evidence.target_groups.length === 1 &&
      row.onset_evidence.target_groups[0]?.lane_group_id === "BK|KINGS HIGHWAY";
    if (kingsHighwayLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: Kings Highway packet target does not preserve exact ledger occurrence parity`);
    }
    const uticaAvenueLedgerTarget = row.onset_evidence.target_groups.length === 1 &&
      row.onset_evidence.target_groups[0]?.lane_group_id === "BK|UTICA AVENUE" &&
      ((row.implementation_date === "2014-08-25" &&
        (row.gtfs_route_id === "B12" || row.gtfs_route_id === "B14")) ||
        (row.implementation_date === "2015-10-16" && row.gtfs_route_id === "B8") ||
        (row.implementation_date === "2016-06-03" && row.gtfs_route_id === "B15"));
    if (uticaAvenueLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: Utica Avenue packet target does not preserve exact ledger occurrence parity`);
    }
    const vanSinderenLedgerTarget = row.gtfs_route_id === "B111" && row.implementation_date === "2016-01-01" &&
      row.onset_evidence.target_groups.length === 1 &&
      row.onset_evidence.target_groups[0]?.lane_group_id === "BK|VAN SINDEREN AVENUE";
    if (vanSinderenLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: Van Sinderen packet target does not preserve exact ledger occurrence parity`);
    }
    const pennsylvaniaAvenueLedgerTarget = row.implementation_date === "2018-06-30" &&
      row.onset_evidence.target_groups.length === 1 &&
      row.onset_evidence.target_groups[0]?.lane_group_id === "BK|PENNSYLVANIA AVENUE";
    if (pennsylvaniaAvenueLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: Pennsylvania Avenue packet target does not preserve exact ledger occurrence parity`);
    }
    const malcolmXLedgerTarget = row.implementation_date === "2020-07-23" &&
      row.onset_evidence.target_groups.length === 1 &&
      row.onset_evidence.target_groups[0]?.lane_group_id === "BK|MALCOLM X BOULEVARD";
    if (malcolmXLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: Malcolm X packet target does not preserve exact ledger occurrence parity`);
    }
    const nassauAvenueLedgerTarget = row.implementation_date === "2018-08-24" &&
      row.onset_evidence.target_groups.length === 1 &&
      row.onset_evidence.target_groups[0]?.lane_group_id === "BK|NASSAU AVENUE";
    if (nassauAvenueLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: Nassau Avenue packet target does not preserve exact ledger occurrence parity`);
    }
    const queensPlazaLedgerTarget = row.implementation_date === "2025-12-13" &&
      row.onset_evidence.target_groups.length === 1 &&
      row.onset_evidence.target_groups[0]?.lane_group_id === "QNS|QUEENS PLAZA" &&
      QUEENS_PLAZA_ROUTES.has(row.gtfs_route_id);
    if (queensPlazaLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: Queens Plaza packet target does not preserve exact ledger occurrence parity`);
    }
    const unattributedSimLedgerTarget = row.implementation_date === "2015-05-27" &&
      row.onset_evidence.target_groups.length === 0 &&
      UNATTRIBUTED_SIM_ROUTES.has(row.gtfs_route_id);
    if (unattributedSimLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: unattributed SIM packet target does not preserve exact zero-target parity`);
    }
    const hillsideLedgerTarget = row.implementation_date === "2025-09-15" &&
      row.onset_evidence.target_groups.length === 1 &&
      row.onset_evidence.target_groups[0]?.lane_group_id === "QNS|HILLSIDE AVENUE" &&
      HILLSIDE_PRIOR_RECEIPTS.has(row.gtfs_route_id);
    if (hillsideLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: Hillside Avenue packet target does not preserve exact ledger occurrence parity`);
    }
    if (hillsideLedgerTarget &&
        stableJson(packet.what_is_known.dossier_refs) !== stableJson(row.dossier_refs)) {
      throw new Error(`${receiptPath}: Hillside Avenue packet dossier does not preserve exact ledger evidence parity`);
    }
    const batteryPlaceLedgerTarget = row.implementation_date === "2021-06-10" &&
      row.onset_evidence.target_groups.length === 1 &&
      row.onset_evidence.target_groups[0]?.lane_group_id === "MAN|BATTERY PLACE" &&
      BATTERY_PLACE_PRIOR_RECEIPTS.has(row.gtfs_route_id);
    if (batteryPlaceLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: Battery Place packet target does not preserve exact ledger occurrence parity`);
    }
    if (batteryPlaceLedgerTarget &&
        stableJson(packet.what_is_known.dossier_refs) !== stableJson(row.dossier_refs)) {
      throw new Error(`${receiptPath}: Battery Place packet dossier does not preserve exact ledger evidence parity`);
    }
    const archerJamaicaLedgerTarget = row.implementation_date === "2021-10-24" &&
      ARCHER_JAMAICA_PRIOR_RECEIPTS.has(row.gtfs_route_id);
    if (archerJamaicaLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: Archer/Jamaica packet target does not preserve exact ledger occurrence parity`);
    }
    if (archerJamaicaLedgerTarget &&
        stableJson(packet.what_is_known.dossier_refs) !== stableJson(row.dossier_refs)) {
      throw new Error(`${receiptPath}: Archer/Jamaica packet dossier does not preserve exact ledger evidence parity`);
    }
    const universityAvenueLedgerTarget = row.implementation_date === "2023-12-01" &&
      UNIVERSITY_AVENUE_PRIOR_RECEIPTS.has(row.gtfs_route_id);
    if (universityAvenueLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: University Avenue packet target does not preserve exact ledger occurrence parity`);
    }
    if (universityAvenueLedgerTarget &&
        stableJson(packet.what_is_known.dossier_refs) !== stableJson(row.dossier_refs)) {
      throw new Error(`${receiptPath}: University Avenue packet dossier does not preserve exact ledger evidence parity`);
    }
    const hylanBoulevardLedgerTarget = row.implementation_date === "2020-09-12" &&
      HYLAN_BOULEVARD_PRIOR_RECEIPTS.has(row.gtfs_route_id);
    if (hylanBoulevardLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: Hylan Boulevard packet target does not preserve exact ledger occurrence parity`);
    }
    if (hylanBoulevardLedgerTarget &&
        stableJson(packet.what_is_known.dossier_refs) !== stableJson(row.dossier_refs)) {
      throw new Error(`${receiptPath}: Hylan Boulevard packet dossier does not preserve exact ledger evidence parity`);
    }
    const eastGunHillLedgerTarget = row.implementation_date === "2023-10-31" &&
      EAST_GUN_HILL_PRIOR_RECEIPTS.has(row.gtfs_route_id) &&
      row.onset_evidence.target_groups.length === 1 &&
      row.onset_evidence.target_groups[0]?.lane_group_id === "BX|EAST GUN HILL ROAD";
    if (eastGunHillLedgerTarget &&
        (stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups) ||
        stableJson(packet.what_is_known.dossier_refs) !== stableJson(row.dossier_refs))) {
      throw new Error(`${receiptPath}: East Gun Hill Road packet does not preserve exact ledger evidence parity`);
    }
    const frCapodannoLedgerTarget = isFrCapodannoLedgerTarget(row);
    if (frCapodannoLedgerTarget &&
        (stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups) ||
        stableJson(packet.what_is_known.dossier_refs) !== stableJson(row.dossier_refs))) {
      throw new Error(`${receiptPath}: Father Capodanno Boulevard packet does not preserve exact ledger evidence parity`);
    }
    const twentyFirstStreetLedgerTarget = isTwentyFirstStreetLedgerTarget(row);
    if (twentyFirstStreetLedgerTarget &&
        (stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups) ||
        stableJson(packet.what_is_known.dossier_refs) !== stableJson(row.dossier_refs))) {
      throw new Error(`${receiptPath}: 21 Street packet does not preserve exact ledger evidence parity`);
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
    if (eastGunHillLedgerTarget) {
      validateEastGunHillBindingReceipt(receipt, receiptPath, row, packet, rootDir, acquiredSourceRecords);
      continue;
    }
    if (frCapodannoLedgerTarget) {
      validateFrCapodannoBindingReceipt(receipt, receiptPath, row, packet, rootDir);
      continue;
    }
    if (twentyFirstStreetLedgerTarget) {
      validateTwentyFirstStreetBindingReceipt(receipt, receiptPath, row, packet, rootDir);
      continue;
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
    if (pennsylvaniaAvenueLedgerTarget && receipt.supplemental_search === undefined) {
      throw new Error(`${receiptPath}: Pennsylvania Avenue review requires candidate-exact supplemental search`);
    }
    if (malcolmXLedgerTarget && receipt.supplemental_search === undefined) {
      throw new Error(`${receiptPath}: Malcolm X review requires candidate-exact supplemental search`);
    }
    if (nassauAvenueLedgerTarget && receipt.supplemental_search === undefined) {
      throw new Error(`${receiptPath}: Nassau Avenue review requires candidate-exact supplemental search`);
    }
    if (queensPlazaLedgerTarget && receipt.supplemental_search === undefined) {
      throw new Error(`${receiptPath}: Queens Plaza review requires candidate-exact supplemental search`);
    }
    if (unattributedSimLedgerTarget) {
      const priorCandidate = object(prior.candidate, `${receiptPath}.prior.candidate`);
      const sourceFindings = object(prior.source_findings, `${receiptPath}.prior.source_findings`);
      const priorOutcome = object(prior.outcome, `${receiptPath}.prior.outcome`);
      const priorClaims = object(prior.claim_results, `${receiptPath}.prior.claim_results`);
      const canonicalActions = object(prior.canonical_actions, `${receiptPath}.prior.canonical_actions`);
      const routePage = object(sourceFindings.mta_route_page,
        `${receiptPath}.prior.source_findings.mta_route_page`);
      const exactCandidateQuery = exactQueries.some((query) => {
        if (query.category !== "official_mta_route_project") return false;
        const tokens = query.query.toUpperCase().split(/[^A-Z0-9+]+/u).filter(Boolean);
        return [row.gtfs_route_id, "34TH", "STREET"].every((token) => tokens.includes(token));
      });
      const expectedRationale = `Completed candidate-exact Staten Island acquisition searches found official 34th Street lane material, but it names M34/M34A rather than ${row.gtfs_route_id} and does not preserve exact historical candidate segment identifiers or bind the route to an onset, stable phase, or candidate-date traversal. No exact target group can be constructed. Attribution, onset, phase, and traversal remain unresolved. This is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`;
      if (!isExactUnattributedSimPacketTarget(packet, row) ||
          priorPointer.receipt_id !== UNATTRIBUTED_SIM_PRIOR_RECEIPTS.get(row.gtfs_route_id) ||
          priorPointer.artifact !==
            "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/receipts.jsonl" ||
          priorCandidate.candidate_id !== row.candidate_id ||
          priorCandidate.normalized_route_id !== row.gtfs_route_id ||
          priorCandidate.route_id !== row.gtfs_route_id ||
          priorCandidate.implementation_date !== row.implementation_date ||
          priorCandidate.identity !== `${row.gtfs_route_id}|bus_lane|2015-05-27|day` ||
          receipt.missing_binding !== "attribution" ||
          stableJson(receiptUnresolved) !==
            stableJson(["attribution", "onset", "phase", "traversal"]) ||
          target.feature_row_count !== 0 ||
          stableJson(target.feature_keys as JsonValue) !== stableJson([]) ||
          stableJson(target.feature_rows as JsonValue) !== stableJson([]) ||
          receipt.rationale !== expectedRationale ||
          receipt.supplemental_search !== undefined || receipt.occurrence_context !== undefined ||
          sourceFindings.exact_project_route_statement_found !== false ||
          sourceFindings.candidate_named_lane_record_count !== 0 ||
          sourceFindings.broader_corridor_route_inventory_match !== false ||
          stableJson(sourceFindings.official_lane_named_routes as JsonValue) !== stableJson(["M34", "M34A"]) ||
          stableJson(sourceFindings.official_route_named_segment_ids as JsonValue) !== stableJson([]) ||
          routePage.exact_route_title_found !== true || routePage.current_corridor_token_found !== true ||
          routePage.retrieval_status !== "acquired" ||
          typeof routePage.temporal_limitation !== "string" || !routePage.temporal_limitation ||
          priorOutcome.exclusive_primary_disposition !== "completed_search_route_linkage_unresolved" ||
          priorOutcome.registry_projection_excluded !== true || priorOutcome.still_unresolved !== true ||
          priorOutcome.study_projection_eligible !== false ||
          priorClaims.candidate_segment_ids_pinned !== false ||
          priorClaims.date_and_phase_proved !== false ||
          priorClaims.exact_route_treatment_binding_proved !== false ||
          priorClaims.exact_segment_binding_proved !== false ||
          priorClaims.explicit_phase_identity_proved !== false ||
          priorClaims.operational_occurrence_identity_proved !== false ||
          !Array.isArray(priorClaims.exact_route_binding_evidence) ||
          priorClaims.exact_route_binding_evidence.length !== 0 ||
          !Array.isArray(priorClaims.exact_segment_ids) || priorClaims.exact_segment_ids.length !== 0 ||
          canonicalActions.operational_occurrence_added_or_updated !== false ||
          !Array.isArray(canonicalActions.canonical_links_added) ||
          canonicalActions.canonical_links_added.length !== 0 ||
          !exactCandidateQuery || receipt.authorizes_study !== false ||
          receipt.authorizes_cross_product !== false) {
        throw new Error(`${receiptPath}: SIM23/SIM24 zero-target absence contract does not match the exact candidate`);
      }
    }
    if (hillsideLedgerTarget) {
      const priorCandidate = object(prior.candidate, `${receiptPath}.prior.candidate`);
      const sourceFindings = object(prior.source_findings, `${receiptPath}.prior.source_findings`);
      const priorOutcome = object(prior.outcome, `${receiptPath}.prior.outcome`);
      const priorClaims = object(prior.claim_results, `${receiptPath}.prior.claim_results`);
      const canonicalActions = object(prior.canonical_actions, `${receiptPath}.prior.canonical_actions`);
      const routePage = object(sourceFindings.mta_route_page,
        `${receiptPath}.prior.source_findings.mta_route_page`);
      const isQ1 = row.gtfs_route_id === "Q1";
      const isQ44Sbs = row.gtfs_route_id === "Q44+";
      const expectedRationale = isQ1
        ? "Completed candidate-exact Queens acquisition searches preserve an evidence-backed Q1 route, treatment, and corridor context for the Hillside Avenue project, but do not bind Q1 to all 195 candidate-date feature-row occurrences, their full eastbound and westbound direction scope, a stable onset-versus-extension phase, or candidate-date traversal. The candidate and reconciliation artifacts retain no exact historical matched-segment identifiers, and the registry rows name no SBS route. Direction, feature extent, phase, and traversal remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection."
        : isQ44Sbs
          ? "Completed candidate-exact Queens acquisition searches retained all 195 Hillside Avenue candidate-date feature-row occurrences, 190 unique feature keys, 97 feature IDs, both eastbound and westbound directions, and the exact 2025-09-15 registry day. The prior acquisition normalizes the route to Q44 while preserving this ledger row's Q44+ SBS identity, the registry rows name no SBS route, candidate-dated historical schedule patterns cannot prove full direction-specific traversal or exclusion, and the pinned candidate provenance does not identify the exact matched subset or stable onset-versus-extension phase. Attribution, direction, feature extent, phase, and traversal remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection."
          : `Completed candidate-exact Queens acquisition searches retained all 195 Hillside Avenue candidate-date feature-row occurrences, 190 unique feature keys, 97 feature IDs, both eastbound and westbound directions, and the exact 2025-09-15 registry day. The registry rows name no SBS route, candidate-dated historical schedule patterns cannot prove full direction-specific traversal or exclusion, and the pinned candidate provenance does not identify the exact matched subset or stable onset-versus-extension phase. ${HILLSIDE_ATTRIBUTION_GAP_ROUTES.has(row.gtfs_route_id) ? "Attribution, direction, feature extent, phase, and traversal" : "Direction, feature extent, phase, and traversal"} remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`;
      const exactCandidateQuery = exactQueries.some((query) => {
        if (query.category !== "official_mta_route_project") return false;
        const tokens = query.query.toUpperCase().split(/[^A-Z0-9+]+/u).filter(Boolean);
        return [row.gtfs_route_id, "HILLSIDE", "AVENUE"].every((token) => tokens.includes(token));
      });
      const canonicalLinks = Array.isArray(canonicalActions.canonical_links_added)
        ? canonicalActions.canonical_links_added
        : null;
      const canonicalRecordsAdded = Array.isArray(canonicalActions.canonical_records_added)
        ? canonicalActions.canonical_records_added
        : null;
      const canonicalRecordsUpdated = Array.isArray(canonicalActions.canonical_records_updated)
        ? canonicalActions.canonical_records_updated
        : null;
      const exactRouteEvidence = Array.isArray(priorClaims.exact_route_binding_evidence)
        ? priorClaims.exact_route_binding_evidence
        : null;
      if (!isExactHillsidePacketTarget(packet, row) ||
          priorPointer.receipt_id !== HILLSIDE_PRIOR_RECEIPTS.get(row.gtfs_route_id) ||
          priorPointer.artifact !==
            "data/quality/relationship-integrity/bus-lane-acquisition/shards/queens/receipts.jsonl" ||
          priorCandidate.candidate_id !== row.candidate_id ||
          priorCandidate.normalized_route_id !== (isQ44Sbs ? "Q44" : row.gtfs_route_id) ||
          priorCandidate.route_id !== row.gtfs_route_id ||
          priorCandidate.implementation_date !== row.implementation_date ||
          priorCandidate.identity !== `${row.gtfs_route_id}|bus_lane|2025-09-15|day` ||
          target.feature_row_count !== 195 ||
          !Array.isArray(target.feature_keys) || target.feature_keys.length !== 190 ||
          !Array.isArray(target.feature_rows) || target.feature_rows.length !== 195 ||
          receipt.rationale !== expectedRationale ||
          receipt.supplemental_search !== undefined || receipt.occurrence_context !== undefined ||
          sourceFindings.candidate_named_lane_record_count !== 0 ||
          sourceFindings.official_lane_matching_record_count !== 195 ||
          !Array.isArray(sourceFindings.official_lane_matching_segment_ids) ||
          new Set(sourceFindings.official_lane_matching_segment_ids).size !== 97 ||
          stableJson(sourceFindings.official_lane_named_routes as JsonValue) !== stableJson([]) ||
          stableJson(sourceFindings.official_route_named_segment_ids as JsonValue) !== stableJson([]) ||
          sourceFindings.exact_project_route_statement_found !== isQ1 ||
          sourceFindings.exact_project_route_source_id !== (isQ1 ? "mta_q1_hillside_profile" : null) ||
          routePage.exact_route_title_found !== true || routePage.current_corridor_token_found !== false ||
          routePage.retrieval_status !== "acquired" ||
          typeof routePage.temporal_limitation !== "string" || !routePage.temporal_limitation ||
          priorOutcome.exclusive_primary_disposition !==
            (isQ1 ? "linkage_supported_phase_unresolved" : "completed_search_route_linkage_unresolved") ||
          priorOutcome.registry_projection_excluded !== true || priorOutcome.still_unresolved !== true ||
          priorOutcome.study_projection_eligible !== false ||
          priorClaims.candidate_date_supported_at_day_precision !== isQ1 ||
          priorClaims.physical_bus_lane_record_acquired !== true ||
          priorClaims.candidate_segment_ids_pinned !== false || priorClaims.date_and_phase_proved !== false ||
          priorClaims.exact_route_treatment_binding_proved !== isQ1 ||
          priorClaims.exact_segment_binding_proved !== false ||
          priorClaims.explicit_phase_identity_proved !== false ||
          priorClaims.operational_occurrence_identity_proved !== false ||
          !exactRouteEvidence || exactRouteEvidence.length !== (isQ1 ? 1 : 0) ||
          stableJson(priorClaims.exact_segment_ids as JsonValue) !== stableJson([]) ||
          canonicalActions.operational_occurrence_added_or_updated !== false ||
          !canonicalLinks || canonicalLinks.length !== (isQ1 ? 3 : 0) ||
          !canonicalRecordsAdded || canonicalRecordsAdded.length !== (isQ1 ? 2 : 0) ||
          !canonicalRecordsUpdated || canonicalRecordsUpdated.length !== (isQ1 ? 1 : 0) ||
          !exactCandidateQuery || receipt.authorizes_study !== false ||
          receipt.authorizes_cross_product !== false) {
        throw new Error(`${receiptPath}: Hillside Avenue absence contract does not match the exact candidate`);
      }
    }
    if (batteryPlaceLedgerTarget) {
      const priorContract = BATTERY_PLACE_PRIOR_RECEIPTS.get(row.gtfs_route_id)!;
      const priorCandidate = object(prior.candidate, `${receiptPath}.prior.candidate`);
      const sourceFindings = object(prior.source_findings, `${receiptPath}.prior.source_findings`);
      const priorOutcome = object(prior.outcome, `${receiptPath}.prior.outcome`);
      const priorClaims = object(prior.claim_results, `${receiptPath}.prior.claim_results`);
      const canonicalActions = object(prior.canonical_actions, `${receiptPath}.prior.canonical_actions`);
      const routePage = object(sourceFindings.mta_route_page,
        `${receiptPath}.prior.source_findings.mta_route_page`);
      const supported = priorContract.supported;
      const crossShardContext = BATTERY_PLACE_CROSS_SHARD_CONTEXT_ROUTES.has(row.gtfs_route_id);
      const retainsContext = supported || crossShardContext;
      const expectedRationale = crossShardContext
        ? `Pinned cross-shard official project evidence preserves an evidence-backed ${row.gtfs_route_id} route, treatment, and Battery Place corridor context, but candidate-exact acquisition does not bind ${row.gtfs_route_id} to all 16 candidate-date feature-row occurrences, the exact 2021-06-10 onset, or candidate-date traversal. The registry rows name no SBS route, the retained historical schedule dossier is unavailable, and the pinned candidate provenance does not identify the exact matched subset. Attribution and traversal remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`
        : retainsContext
        ? `Completed candidate-exact acquisition searches preserve an evidence-backed ${row.gtfs_route_id} route, treatment, and Battery Place corridor context, but do not bind ${row.gtfs_route_id} to all 16 candidate-date feature-row occurrences, the exact 2021-06-10 onset, or candidate-date traversal. The registry rows name no SBS route, the retained historical schedule dossier is unavailable, and the pinned candidate provenance does not identify the exact matched subset. Attribution and traversal remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`
        : `Completed candidate-exact acquisition searches retained all 16 Battery Place candidate-date feature-row occurrences, 11 unique feature keys and feature IDs, the westbound direction, and the exact 2021-06-10 registry day, but found no authoritative statement binding ${row.gtfs_route_id} to the candidate-date feature subset. The registry rows name no SBS route, the retained historical schedule dossier is unavailable, and the pinned candidate provenance does not identify candidate-date traversal. Attribution and traversal remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`;
      let crossShardContextValid = !crossShardContext;
      if (crossShardContext) {
        const contextPointer = object(receipt.context_receipt, `${receiptPath}.context_receipt`);
        const contextArtifact = BATTERY_PLACE_CROSS_SHARD_CONTEXT_RECEIPT.artifact;
        const contextJournalPath = resolve(rootDir, contextArtifact);
        const contextLine = readFileSync(contextJournalPath, "utf8").split(/\r?\n/u).filter(Boolean).find((line) => {
          const parsed = object(JSON.parse(line), contextJournalPath);
          return parsed.receipt_id === BATTERY_PLACE_CROSS_SHARD_CONTEXT_RECEIPT.receiptId;
        });
        if (contextLine && contextPointer.receipt_id === BATTERY_PLACE_CROSS_SHARD_CONTEXT_RECEIPT.receiptId &&
            contextPointer.artifact === contextArtifact && contextPointer.row_sha256 === hash(contextLine)) {
          const contextPrior = object(JSON.parse(contextLine), `${contextJournalPath}:cross-shard-context`);
          const contextCandidate = object(contextPrior.candidate, `${contextJournalPath}.candidate`);
          const contextSource = object(contextPrior.source_findings, `${contextJournalPath}.source_findings`);
          const contextClaims = object(contextPrior.claim_results, `${contextJournalPath}.claim_results`);
          const contextOutcome = object(contextPrior.outcome, `${contextJournalPath}.outcome`);
          const contextActions = object(contextPrior.canonical_actions, `${contextJournalPath}.canonical_actions`);
          const contextEvidence = Array.isArray(contextClaims.exact_route_binding_evidence)
            ? contextClaims.exact_route_binding_evidence
            : [];
          const evidence = contextEvidence.length === 1
            ? object(contextEvidence[0], `${contextJournalPath}.claim_results.exact_route_binding_evidence[0]`)
            : null;
          crossShardContextValid = contextCandidate.route_id === "SIM1" &&
            contextCandidate.implementation_date === "2021-06-10" &&
            contextSource.exact_project_route_statement_found === true &&
            contextSource.exact_project_route_source_id === BATTERY_PLACE_CROSS_SHARD_CONTEXT_RECEIPT.sourceId &&
            stableJson(contextSource.official_project_route_inventory as JsonValue) ===
              stableJson(BATTERY_PLACE_PROJECT_ROUTE_INVENTORY) &&
            contextClaims.exact_route_treatment_binding_proved === true && evidence !== null &&
            contextClaims.candidate_segment_ids_pinned === false &&
            contextClaims.date_and_phase_proved === false &&
            contextClaims.exact_segment_binding_proved === false &&
            stableJson(contextClaims.exact_segment_ids as JsonValue) === stableJson([]) &&
            contextClaims.explicit_phase_identity_proved === false &&
            contextClaims.operational_occurrence_identity_proved === false &&
            contextClaims.physical_bus_lane_record_acquired === true &&
            evidence.evidence_kind === "official_project_route_statement" &&
            evidence.source_id === BATTERY_PLACE_CROSS_SHARD_CONTEXT_RECEIPT.sourceId &&
            evidence.source_sha256 === BATTERY_PLACE_CROSS_SHARD_CONTEXT_RECEIPT.sourceSha256 &&
            stableJson(evidence.official_routes as JsonValue) === stableJson(BATTERY_PLACE_PROJECT_ROUTE_INVENTORY) &&
            contextOutcome.exclusive_primary_disposition === "linkage_supported_phase_unresolved" &&
            contextOutcome.registry_projection_excluded === true &&
            contextOutcome.still_unresolved === true &&
            contextOutcome.study_projection_eligible === false &&
            stableJson(contextActions.canonical_links_added as JsonValue) === stableJson([]) &&
            contextActions.operational_occurrence_added_or_updated === false &&
            BATTERY_PLACE_PROJECT_ROUTE_INVENTORY.includes(row.gtfs_route_id);
        }
      }
      const exactCandidateQuery = exactQueries.some((query) => {
        if (query.category !== "official_mta_route_project") return false;
        const tokens = query.query.toUpperCase().split(/[^A-Z0-9+]+/u).filter(Boolean);
        return tokens.includes(row.gtfs_route_id) && tokens.includes("BATTERY") &&
          (tokens.includes("PL") || tokens.includes("PLACE"));
      });
      const canonicalLinks = Array.isArray(canonicalActions.canonical_links_added)
        ? canonicalActions.canonical_links_added
        : null;
      const canonicalRecordsAdded = Array.isArray(canonicalActions.canonical_records_added)
        ? canonicalActions.canonical_records_added
        : null;
      const canonicalRecordsUpdated = Array.isArray(canonicalActions.canonical_records_updated)
        ? canonicalActions.canonical_records_updated
        : null;
      const exactRouteEvidence = Array.isArray(priorClaims.exact_route_binding_evidence)
        ? priorClaims.exact_route_binding_evidence
        : null;
      const compactLaneField = priorContract.shard === "manhattan" ||
        priorContract.shard === "brooklyn-null";
      const hasNamedRoutes = Object.prototype.hasOwnProperty.call(
        sourceFindings, compactLaneField ? "official_lane_named_sbs_routes" : "official_lane_named_routes",
      );
      const namedRoutes = compactLaneField
        ? sourceFindings.official_lane_named_sbs_routes
        : sourceFindings.official_lane_named_routes;
      const hasUnexpectedNamedRoutes = Object.prototype.hasOwnProperty.call(
        sourceFindings, compactLaneField ? "official_lane_named_routes" : "official_lane_named_sbs_routes",
      );
      const expectsRouteNamedSegmentIds = !compactLaneField;
      const hasRouteNamedSegmentIds = Object.prototype.hasOwnProperty.call(
        sourceFindings, "official_route_named_segment_ids",
      );
      const expectsCandidateDateClaim = ["manhattan", "queens", "brooklyn-null"].includes(priorContract.shard);
      const hasCandidateDateClaim = Object.prototype.hasOwnProperty.call(
        priorClaims, "candidate_date_supported_at_day_precision",
      );
      const expectsCandidateSegmentClaim = priorContract.shard !== "brooklyn-null";
      const hasCandidateSegmentClaim = Object.prototype.hasOwnProperty.call(
        priorClaims, "candidate_segment_ids_pinned",
      );
      const expectsCanonicalRecordArrays = priorContract.shard === "queens";
      const hasCanonicalRecordsAdded = Object.prototype.hasOwnProperty.call(
        canonicalActions, "canonical_records_added",
      );
      const hasCanonicalRecordsUpdated = Object.prototype.hasOwnProperty.call(
        canonicalActions, "canonical_records_updated",
      );
      if (!isExactBatteryPlacePacketTarget(packet, row) ||
          priorPointer.receipt_id !== priorContract.receiptId ||
          priorPointer.artifact !==
            `data/quality/relationship-integrity/bus-lane-acquisition/shards/${priorContract.shard}/receipts.jsonl` ||
          priorCandidate.candidate_id !== row.candidate_id ||
          priorCandidate.normalized_route_id !== row.gtfs_route_id ||
          priorCandidate.route_id !== row.gtfs_route_id ||
          priorCandidate.implementation_date !== row.implementation_date ||
          priorCandidate.identity !== `${row.gtfs_route_id}|bus_lane|2021-06-10|day` ||
          target.feature_row_count !== 16 ||
          !Array.isArray(target.feature_keys) || target.feature_keys.length !== 11 ||
          !Array.isArray(target.feature_rows) || target.feature_rows.length !== 16 ||
          receipt.rationale !== expectedRationale ||
          crossShardContextValid !== true ||
          (!crossShardContext && receipt.context_receipt !== undefined) ||
          receipt.supplemental_search !== undefined || receipt.occurrence_context !== undefined ||
          sourceFindings.candidate_named_lane_record_count !== 0 ||
          sourceFindings.official_lane_matching_record_count !== 16 ||
          !Array.isArray(sourceFindings.official_lane_matching_segment_ids) ||
          new Set(sourceFindings.official_lane_matching_segment_ids).size !== 11 ||
          !hasNamedRoutes || hasUnexpectedNamedRoutes ||
          stableJson(namedRoutes as JsonValue) !== stableJson([]) ||
          hasRouteNamedSegmentIds !== expectsRouteNamedSegmentIds ||
          (expectsRouteNamedSegmentIds &&
            stableJson(sourceFindings.official_route_named_segment_ids as JsonValue) !== stableJson([])) ||
          sourceFindings.exact_project_route_statement_found !== supported ||
          (supported
            ? sourceFindings.exact_project_route_source_id !== "better_buses_action_plan_2019"
            : sourceFindings.exact_project_route_source_id != null) ||
          routePage.exact_route_title_found !== true || routePage.retrieval_status !== "acquired" ||
          typeof routePage.temporal_limitation !== "string" || !routePage.temporal_limitation ||
          priorOutcome.exclusive_primary_disposition !==
            (supported ? "linkage_supported_phase_unresolved" : "completed_search_route_linkage_unresolved") ||
          priorOutcome.registry_projection_excluded !== true || priorOutcome.still_unresolved !== true ||
          priorOutcome.study_projection_eligible !== false ||
          hasCandidateDateClaim !== expectsCandidateDateClaim ||
          (expectsCandidateDateClaim && priorClaims.candidate_date_supported_at_day_precision !== false) ||
          priorClaims.physical_bus_lane_record_acquired !== true ||
          hasCandidateSegmentClaim !== expectsCandidateSegmentClaim ||
          (expectsCandidateSegmentClaim && priorClaims.candidate_segment_ids_pinned !== false) ||
          priorClaims.date_and_phase_proved !== false ||
          priorClaims.exact_route_treatment_binding_proved !== supported ||
          priorClaims.exact_segment_binding_proved !== false ||
          priorClaims.explicit_phase_identity_proved !== false ||
          priorClaims.operational_occurrence_identity_proved !== false ||
          !exactRouteEvidence || exactRouteEvidence.length !== (supported ? 1 : 0) ||
          stableJson(priorClaims.exact_segment_ids as JsonValue) !== stableJson([]) ||
          canonicalActions.operational_occurrence_added_or_updated !== false ||
          !canonicalLinks || canonicalLinks.length !== 0 ||
          hasCanonicalRecordsAdded !== expectsCanonicalRecordArrays ||
          hasCanonicalRecordsUpdated !== expectsCanonicalRecordArrays ||
          (expectsCanonicalRecordArrays && (!canonicalRecordsAdded || canonicalRecordsAdded.length !== 0)) ||
          (expectsCanonicalRecordArrays && (!canonicalRecordsUpdated || canonicalRecordsUpdated.length !== 0)) ||
          !exactCandidateQuery || receipt.authorizes_study !== false ||
          receipt.authorizes_cross_product !== false) {
        throw new Error(`${receiptPath}: Battery Place absence contract does not match the exact candidate`);
      }
    }
    if (archerJamaicaLedgerTarget) {
      const priorContract = ARCHER_JAMAICA_PRIOR_RECEIPTS.get(row.gtfs_route_id)!;
      const priorCandidate = object(prior.candidate, `${receiptPath}.prior.candidate`);
      const sourceFindings = object(prior.source_findings, `${receiptPath}.prior.source_findings`);
      const priorOutcome = object(prior.outcome, `${receiptPath}.prior.outcome`);
      const priorClaims = object(prior.claim_results, `${receiptPath}.prior.claim_results`);
      const canonicalActions = object(prior.canonical_actions, `${receiptPath}.prior.canonical_actions`);
      const routePage = object(sourceFindings.mta_route_page,
        `${receiptPath}.prior.source_findings.mta_route_page`);
      const expectedGroupAccounting = archerJamaicaGroupAccounting(packet, row);
      const currentTargetGroupsSha256 = hash(stableJson(row.onset_evidence.target_groups));
      const expectedCorrection = {
        correction_kind: "prior_jamaica_only_accounting_superseded_by_current_two_group_target",
        prior_claim_path: "source_findings.official_lane_matching_record_count",
        prior_claim_value: 31,
        supersedes_prior_finding: true,
        corrected_finding: {
          finding_summary: "The prior 31-row finding accounts only for Jamaica Avenue and is not exhaustive of the current target, which adds the separate seven-row Archer Avenue exact-date group.",
          prior_accounted_lane_group_ids: ["QNS|JAMAICA AVENUE"],
          prior_feature_row_count: 31,
          current_lane_group_ids: ["QNS|ARCHER AVENUE", "QNS|JAMAICA AVENUE"],
          current_feature_row_count: 38,
          added_lane_group_id: "QNS|ARCHER AVENUE",
          added_feature_row_count: 7,
          current_target_groups_sha256: currentTargetGroupsSha256,
        },
        evidence: {
          candidate_fingerprint: row.candidate_fingerprint,
          ledger_id: row.ledger_id,
          packet_id: packet.packet_id,
          lane_snapshot_id: row.onset_evidence.lane_snapshot_id,
          source_id: ARCHER_JAMAICA_CURRENT_SOURCE.sourceId,
          source_artifact: ARCHER_JAMAICA_CURRENT_SOURCE.artifact,
          source_sha256: ARCHER_JAMAICA_CURRENT_SOURCE.sha256,
        },
        remaining_unresolved_bindings: ["attribution", "direction", "feature_extent", "phase", "traversal"],
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      const expectedProjectContext = {
        finding_kind: "paired_corridor_extent_and_launch_context_nonterminal",
        source_id: ARCHER_JAMAICA_PROJECT_CONTEXT.sourceId,
        source_url: ARCHER_JAMAICA_PROJECT_CONTEXT.url,
        source_content_sha256: ARCHER_JAMAICA_PROJECT_CONTEXT.sha256,
        supported_lane_group_ids: ["QNS|ARCHER AVENUE", "QNS|JAMAICA AVENUE"],
        supported_launch_date: "2021-10-24",
        route_inventory_exhaustive: false,
        candidate_route_bound: false,
        registry_named_sbs_routes: ["Q25", "Q44"],
        candidate_route_named_sbs_intersection: [],
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      const expectedRationale = `The immutable Queens acquisition search preserved a 31-row Jamaica Avenue-only accounting and found no authoritative exact ${row.gtfs_route_id} route-treatment binding. Current deterministic target reconstruction corrects that accounting to the exact paired 38-row target: seven ordered eastbound Archer Avenue rows (seven keys and IDs, mixed-date feature union) and 31 ordered Jamaica Avenue rows (31 keys, 21 IDs, eastbound and westbound, coextensive lane group), all on 2021-10-24. The acquired NYC DOT launch source supports the paired corridor extents and launch timing but explicitly does not provide an exhaustive route list. Registry SBS fields name Q25/Q44 on Archer Avenue and Q44 on Jamaica Avenue; none names ${row.gtfs_route_id}. The historical schedule dossier is unavailable. Attribution, direction, feature extent, phase, and traversal remain unresolved; this is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`;
      const exactCandidateQuery = exactQueries.some((query) => {
        if (query.category !== "official_mta_route_project") return false;
        const tokens = query.query.toUpperCase().split(/[^A-Z0-9+]+/u).filter(Boolean);
        return [row.gtfs_route_id, "JAMAICA", "AVENUE"].every((token) => tokens.includes(token));
      });
      const pressRetrieval = retrievals.some((retrieval) => {
        const record = retrieval as Record<string, unknown>;
        return retrieval.category === "official_nyc_dot_lane_project" &&
          record.id === ARCHER_JAMAICA_PROJECT_CONTEXT.sourceId &&
          record.sha256 === ARCHER_JAMAICA_PROJECT_CONTEXT.sha256 &&
          record.status === "acquired";
      });
      const projectSource = acquiredSourceRecords.find((source) =>
        source.id === ARCHER_JAMAICA_PROJECT_CONTEXT.sourceId);
      const currentSourcePath = resolve(rootDir, ARCHER_JAMAICA_CURRENT_SOURCE.artifact);
      const currentSourceMetadataPath = resolve(rootDir, "raw", "sources",
        ARCHER_JAMAICA_CURRENT_SOURCE.sourceId, "metadata.json");
      const currentSourceMetadata = existsSync(currentSourceMetadataPath)
        ? object(JSON.parse(readFileSync(currentSourceMetadataPath, "utf8")), currentSourceMetadataPath)
        : {};
      const currentSourceMetadataSha = typeof currentSourceMetadata.sha256 === "string"
        ? currentSourceMetadata.sha256.replace(/^sha256:/u, "")
        : null;
      const exactJamaicaIds = [
        "0057059", "0057065", "0057071", "0057075", "0057077", "0057254", "0057257", "0057259",
        "0057433", "0057440", "0060077", "0060080", "0060082", "0060095", "0060096", "0060097",
        "0060226", "0060232", "0112925", "0112926", "0112927",
      ];
      if (!isExactArcherJamaicaPacketTarget(packet, row) ||
          priorPointer.receipt_id !== priorContract.receiptId ||
          priorPointer.row_sha256 !== priorContract.rowSha256 ||
          priorPointer.artifact !==
            "data/quality/relationship-integrity/bus-lane-acquisition/shards/queens/receipts.jsonl" ||
          priorCandidate.candidate_id !== row.candidate_id ||
          priorCandidate.normalized_route_id !== row.gtfs_route_id ||
          priorCandidate.route_id !== row.gtfs_route_id ||
          priorCandidate.corridor !== "Jamaica Avenue" ||
          priorCandidate.implementation_date !== row.implementation_date ||
          priorCandidate.identity !== `${row.gtfs_route_id}|bus_lane|2021-10-24|day` ||
          target.feature_row_count !== 38 ||
          !Array.isArray(target.feature_keys) || target.feature_keys.length !== 38 ||
          !Array.isArray(target.feature_ids) || target.feature_ids.length !== 28 ||
          !Array.isArray(target.feature_rows) || target.feature_rows.length !== 38 ||
          stableJson(target.lane_groups as JsonValue) !== stableJson(expectedGroupAccounting as JsonValue) ||
          stableJson(receipt.finding_corrections as JsonValue) !== stableJson([expectedCorrection] as JsonValue) ||
          stableJson(receipt.project_context as JsonValue) !== stableJson(expectedProjectContext as JsonValue) ||
          receipt.rationale !== expectedRationale ||
          receipt.supplemental_search !== undefined || receipt.occurrence_context !== undefined ||
          receipt.context_receipt !== undefined ||
          sourceFindings.acquired_for_candidate !== true ||
          sourceFindings.candidate_named_lane_record_count !== 0 ||
          sourceFindings.official_lane_matching_record_count !== 31 ||
          stableJson(sourceFindings.official_lane_matching_segment_ids as JsonValue) !== stableJson(exactJamaicaIds) ||
          stableJson(sourceFindings.official_lane_named_routes as JsonValue) !== stableJson(["Q44"]) ||
          stableJson(sourceFindings.official_route_named_segment_ids as JsonValue) !== stableJson([]) ||
          sourceFindings.exact_project_route_statement_found !== false ||
          sourceFindings.exact_project_route_source_id !== null ||
          routePage.content_sha256 !== priorContract.routePageSha256 ||
          routePage.exact_route_title_found !== true || routePage.current_corridor_token_found !== false ||
          routePage.retrieval_status !== "acquired" ||
          typeof routePage.temporal_limitation !== "string" || !routePage.temporal_limitation ||
          priorOutcome.exclusive_primary_disposition !== "completed_search_route_linkage_unresolved" ||
          priorOutcome.registry_projection_excluded !== true || priorOutcome.still_unresolved !== true ||
          priorOutcome.study_projection_eligible !== false ||
          priorClaims.candidate_date_supported_at_day_precision !== false ||
          priorClaims.candidate_segment_ids_pinned !== false ||
          priorClaims.date_and_phase_proved !== false ||
          priorClaims.exact_route_treatment_binding_proved !== false ||
          priorClaims.exact_segment_binding_proved !== false ||
          priorClaims.explicit_phase_identity_proved !== false ||
          priorClaims.operational_occurrence_identity_proved !== false ||
          priorClaims.physical_bus_lane_record_acquired !== true ||
          stableJson(priorClaims.exact_route_binding_evidence as JsonValue) !== stableJson([]) ||
          stableJson(priorClaims.exact_segment_ids as JsonValue) !== stableJson([]) ||
          stableJson(canonicalActions.canonical_links_added as JsonValue) !== stableJson([]) ||
          stableJson(canonicalActions.canonical_records_added as JsonValue) !== stableJson([]) ||
          stableJson(canonicalActions.canonical_records_updated as JsonValue) !== stableJson([]) ||
          canonicalActions.operational_occurrence_added_or_updated !== false ||
          !exactCandidateQuery || !pressRetrieval ||
          !projectSource || projectSource.url !== ARCHER_JAMAICA_PROJECT_CONTEXT.url ||
          projectSource.content_sha256 !== ARCHER_JAMAICA_PROJECT_CONTEXT.sha256 ||
          projectSource.retrieval_status !== "acquired" ||
          projectSource.note !== ARCHER_JAMAICA_PROJECT_CONTEXT.note ||
          row.onset_evidence.lane_snapshot_id !== "nyc-dot-bus-lanes-local-streets-2026-07-22" ||
          row.onset_evidence.lane_source_id !== ARCHER_JAMAICA_CURRENT_SOURCE.sourceId ||
          currentSourceMetadata.sourceId !== ARCHER_JAMAICA_CURRENT_SOURCE.sourceId ||
          currentSourceMetadataSha !== ARCHER_JAMAICA_CURRENT_SOURCE.sha256 ||
          !existsSync(currentSourcePath) || hash(readFileSync(currentSourcePath)) !== ARCHER_JAMAICA_CURRENT_SOURCE.sha256 ||
          receipt.authorizes_study !== false || receipt.authorizes_cross_product !== false) {
        throw new Error(`${receiptPath}: Archer/Jamaica absence contract does not match the exact candidate`);
      }
    }
    if (universityAvenueLedgerTarget) {
      const priorContract = UNIVERSITY_AVENUE_PRIOR_RECEIPTS.get(row.gtfs_route_id)!;
      const priorCandidate = object(prior.candidate, `${receiptPath}.prior.candidate`);
      const sourceFindings = object(prior.source_findings, `${receiptPath}.prior.source_findings`);
      const priorOutcome = object(prior.outcome, `${receiptPath}.prior.outcome`);
      const priorClaims = object(prior.claim_results, `${receiptPath}.prior.claim_results`);
      const canonicalActions = object(prior.canonical_actions, `${receiptPath}.prior.canonical_actions`);
      const routePage = object(sourceFindings.mta_route_page,
        `${receiptPath}.prior.source_findings.mta_route_page`);
      const supported = priorContract.contextSourceId !== null;
      const variantMismatch = priorContract.routeVariantPrecisionMismatch;
      const contextSourceId = priorContract.contextSourceId ??
        (variantMismatch ? "pelham_parkway_completion" : null);
      const contextSource = contextSourceId
        ? UNIVERSITY_AVENUE_CONTEXT_SOURCES.get(contextSourceId)
        : null;
      const expectedRouteEvidence = priorContract.contextSourceId === "bronx_cb5_priority_2019"
        ? [{
          evidence_kind: "official_project_route_statement",
          official_routes: ["BX3", "BX36"],
          open_dates: null,
          segment_id: null,
          source_id: "bronx_cb5_priority_2019",
          source_row_sha256: null,
          source_sha256: "0e43255dc5a37106de9c7805e7eb1db80289141bb3937870a3d31264fcb552bc",
          support_note: "The official CB5 presentation explicitly identifies Bx3/Bx36 on University Avenue; no generic Bx18 statement is promoted to Bx18A or Bx18B.",
        }]
        : priorContract.contextSourceId === "pelham_parkway_completion"
          ? [{
            evidence_kind: "official_project_route_statement",
            official_routes: ["BX12+"],
            open_dates: null,
            segment_id: null,
            source_id: "pelham_parkway_completion",
            source_row_sha256: null,
            source_sha256: "9a0811b58f4755a8638e8cb3e1bf5531e488f5fc05ef157ef16d7fee1246943e",
            support_note: "The official DDC/DOT/DEP completion release says the new Pelham Parkway lanes primarily serve BX12 Select Bus Service (BX12+), without supporting BX12 local or candidate-day phase identity.",
          }]
          : [];
      const routeVariantLimitation = variantMismatch
        ? "The official Pelham Parkway source names BX12 Select Bus Service (BX12+); it does not prove that the distinct BX12 local route used the treatment."
        : null;
      const expectedProjectContext = contextSourceId && contextSource
        ? {
          finding_kind: variantMismatch
            ? "distinct_route_variant_context_nonterminal"
            : "official_route_treatment_context_nonterminal",
          source_id: contextSourceId,
          source_url: contextSource.url,
          source_content_sha256: contextSource.sha256,
          supported_route_ids: contextSourceId === "bronx_cb5_priority_2019"
            ? ["BX3", "BX36"]
            : ["BX12+"],
          supported_corridor: contextSourceId === "bronx_cb5_priority_2019"
            ? "University Avenue"
            : "Pelham Parkway",
          candidate_route_id: row.gtfs_route_id,
          candidate_route_treatment_context: supported,
          exact_current_target_bound: false,
          candidate_date_or_phase_bound: false,
          traversal_bound: false,
          route_variant_limitation: routeVariantLimitation,
          authorizes_study: false,
          authorizes_cross_product: false,
        }
        : undefined;
      const dossierRowCount = packet.what_is_known.dossier_refs.length;
      const dossierTargetCount = packet.what_is_known.dossier_refs
        .filter((ref) => ref.candidate_target_match).length;
      const rationalePrefix = priorContract.contextSourceId === "bronx_cb5_priority_2019"
        ? `The immutable Bronx acquisition search acquired official route-treatment context naming BX3/BX36 on University Avenue, but it does not bind ${row.gtfs_route_id} to the exact current target.`
        : priorContract.contextSourceId === "pelham_parkway_completion"
          ? "The immutable Bronx acquisition search acquired official Pelham Parkway route-treatment context naming BX12+, but it does not bind BX12+ to the exact current University Avenue target."
          : variantMismatch
            ? "The immutable Bronx acquisition correctly preserves that the official Pelham Parkway source names BX12 Select Bus Service (BX12+), not the distinct BX12 local route; route-family normalization cannot transfer that context to BX12."
            : `The immutable Bronx acquisition search found no authoritative exact ${row.gtfs_route_id} route-treatment binding to the current University Avenue target.`;
      const unresolvedSentence = UNIVERSITY_AVENUE_ATTRIBUTION_GAP_ROUTES.has(row.gtfs_route_id)
        ? "Attribution, direction, feature extent, phase, and traversal remain unresolved."
        : "Direction, feature extent, phase, and traversal remain unresolved.";
      const expectedRationale = `${rationalePrefix} The target is the ordered 35-row, 35-key, 19-ID mixed-date feature union on University Avenue in both northbound and southbound directions, with exact registry date 2023-12-01 and no named SBS route. The historical schedule timepoint dossier remains geometry-ambiguous (${dossierRowCount} rows, ${dossierTargetCount} target-tagged) and cannot prove traversal. ${unresolvedSentence} This is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`;
      const exactCandidateQuery = exactQueries.some((query) => {
        if (query.category !== "official_mta_route_project") return false;
        const tokens = query.query.toUpperCase().split(/[^A-Z0-9+]+/u).filter(Boolean);
        return [row.gtfs_route_id, "UNIVERSITY"].every((token) => tokens.includes(token));
      });
      const contextRetrieval = contextSourceId && contextSource
        ? retrievals.some((retrieval) => {
          const record = retrieval as Record<string, unknown>;
          return record.id === contextSourceId && record.sha256 === contextSource.sha256 &&
            record.status === "acquired";
        })
        : true;
      const acquiredContextSource = contextSourceId
        ? acquiredSourceRecords.find((source) => source.id === contextSourceId)
        : null;
      const currentSourcePath = resolve(rootDir, UNIVERSITY_AVENUE_CURRENT_SOURCE.artifact);
      const currentSourceMetadataPath = resolve(rootDir, "raw", "sources",
        UNIVERSITY_AVENUE_CURRENT_SOURCE.sourceId, "metadata.json");
      const currentSourceMetadata = existsSync(currentSourceMetadataPath)
        ? object(JSON.parse(readFileSync(currentSourceMetadataPath, "utf8")), currentSourceMetadataPath)
        : {};
      const currentSourceMetadataSha = typeof currentSourceMetadata.sha256 === "string"
        ? currentSourceMetadata.sha256.replace(/^sha256:/u, "")
        : null;
      const exactSegmentIds = [
        "0072965", "0073073", "0073096", "0079627", "0079795", "0111554", "0111555",
        "0113543", "0113544", "0174348", "0174349", "0174516", "0174517", "0174518",
        "0174519", "0188605", "0193553", "0193554", "0266053",
      ];
      if (!isExactUniversityAvenuePacketTarget(packet, row) ||
          priorPointer.receipt_id !== priorContract.receiptId ||
          priorPointer.row_sha256 !== priorContract.rowSha256 ||
          priorPointer.artifact !==
            "data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/receipts.jsonl" ||
          priorCandidate.candidate_id !== row.candidate_id ||
          priorCandidate.normalized_route_id !== (row.gtfs_route_id === "BX12+" ? "BX12" : row.gtfs_route_id) ||
          priorCandidate.route_id !== row.gtfs_route_id ||
          priorCandidate.corridor !== priorContract.corridor ||
          priorCandidate.implementation_date !== row.implementation_date ||
          priorCandidate.identity !== `${row.gtfs_route_id}|bus_lane|2023-12-01|day` ||
          receipt.missing_binding !== "feature_extent" ||
          target.feature_row_count !== 35 ||
          !Array.isArray(target.feature_keys) || target.feature_keys.length !== 35 ||
          !Array.isArray(target.feature_ids) || target.feature_ids.length !== 19 ||
          !Array.isArray(target.feature_rows) || target.feature_rows.length !== 35 ||
          receipt.rationale !== expectedRationale ||
          receipt.finding_corrections !== undefined ||
          (expectedProjectContext === undefined
            ? receipt.project_context !== undefined
            : stableJson(receipt.project_context as JsonValue) !==
              stableJson(expectedProjectContext as unknown as JsonValue)) ||
          receipt.supplemental_search !== undefined || receipt.occurrence_context !== undefined ||
          receipt.context_receipt !== undefined ||
          sourceFindings.acquired_for_candidate !== true ||
          sourceFindings.candidate_named_lane_record_count !== 0 ||
          sourceFindings.official_lane_matching_record_count !== 35 ||
          stableJson(sourceFindings.official_lane_matching_segment_ids as JsonValue) !==
            stableJson(exactSegmentIds) ||
          stableJson(sourceFindings.official_lane_named_routes as JsonValue) !== stableJson([]) ||
          stableJson(sourceFindings.official_route_named_segment_ids as JsonValue) !== stableJson([]) ||
          sourceFindings.exact_project_route_statement_found !== supported ||
          sourceFindings.exact_project_route_source_id !== priorContract.contextSourceId ||
          sourceFindings.route_variant_precision_mismatch !== variantMismatch ||
          sourceFindings.route_variant_precision_limitation !== routeVariantLimitation ||
          routePage.content_sha256 !== priorContract.routePageSha256 ||
          routePage.exact_route_title_found !== true ||
          routePage.current_corridor_token_found !== priorContract.currentCorridorTokenFound ||
          routePage.retrieval_status !== "acquired" ||
          typeof routePage.temporal_limitation !== "string" || !routePage.temporal_limitation ||
          priorOutcome.exclusive_primary_disposition !==
            (supported ? "linkage_supported_phase_unresolved" : "completed_search_route_linkage_unresolved") ||
          priorOutcome.registry_projection_excluded !== true || priorOutcome.still_unresolved !== true ||
          priorOutcome.study_projection_eligible !== false ||
          priorClaims.physical_bus_lane_record_acquired !== true ||
          priorClaims.candidate_segment_ids_pinned !== false ||
          priorClaims.date_and_phase_proved !== false ||
          priorClaims.exact_route_treatment_binding_proved !== supported ||
          priorClaims.exact_segment_binding_proved !== false ||
          priorClaims.explicit_phase_identity_proved !== false ||
          priorClaims.operational_occurrence_identity_proved !== false ||
          stableJson(priorClaims.exact_route_binding_evidence as JsonValue) !==
            stableJson(expectedRouteEvidence as JsonValue) ||
          stableJson(priorClaims.exact_segment_ids as JsonValue) !== stableJson([]) ||
          stableJson(canonicalActions.canonical_links_added as JsonValue) !== stableJson([]) ||
          canonicalActions.operational_occurrence_added_or_updated !== false ||
          !exactCandidateQuery || !contextRetrieval ||
          (contextSource && (!acquiredContextSource ||
            acquiredContextSource.url !== contextSource.url ||
            acquiredContextSource.content_sha256 !== contextSource.sha256 ||
            acquiredContextSource.retrieval_status !== "acquired" ||
            acquiredContextSource.note !== contextSource.note)) ||
          row.onset_evidence.lane_snapshot_id !== "nyc-dot-bus-lanes-local-streets-2026-07-22" ||
          row.onset_evidence.lane_source_id !== UNIVERSITY_AVENUE_CURRENT_SOURCE.sourceId ||
          currentSourceMetadata.sourceId !== UNIVERSITY_AVENUE_CURRENT_SOURCE.sourceId ||
          currentSourceMetadataSha !== UNIVERSITY_AVENUE_CURRENT_SOURCE.sha256 ||
          !existsSync(currentSourcePath) ||
          hash(readFileSync(currentSourcePath)) !== UNIVERSITY_AVENUE_CURRENT_SOURCE.sha256 ||
          receipt.authorizes_study !== false || receipt.authorizes_cross_product !== false) {
        throw new Error(`${receiptPath}: University Avenue absence contract does not match the exact candidate`);
      }
    }
    if (hylanBoulevardLedgerTarget) {
      const priorContract = HYLAN_BOULEVARD_PRIOR_RECEIPTS.get(row.gtfs_route_id)!;
      const priorCandidate = object(prior.candidate, `${receiptPath}.prior.candidate`);
      const sourceFindings = object(prior.source_findings, `${receiptPath}.prior.source_findings`);
      const priorOutcome = object(prior.outcome, `${receiptPath}.prior.outcome`);
      const priorClaims = object(prior.claim_results, `${receiptPath}.prior.claim_results`);
      const canonicalActions = object(prior.canonical_actions, `${receiptPath}.prior.canonical_actions`);
      const routePage = object(sourceFindings.mta_route_page,
        `${receiptPath}.prior.source_findings.mta_route_page`);
      const exactRouteEvidence = Array.isArray(priorClaims.exact_route_binding_evidence)
        ? priorClaims.exact_route_binding_evidence.map((value, index) =>
          object(value, `${receiptPath}.prior.claim_results.exact_route_binding_evidence[${index}]`))
        : null;
      const priorSegmentIds = Array.isArray(sourceFindings.official_lane_matching_segment_ids)
        ? sourceFindings.official_lane_matching_segment_ids
        : null;
      const routeNamedSegmentIds = Array.isArray(sourceFindings.official_route_named_segment_ids)
        ? sourceFindings.official_route_named_segment_ids
        : null;
      const supported = priorContract.supported;
      const normalizedSbsVariant = row.gtfs_route_id === "S79+";
      const currentTargetGroupsSha256 = hash(stableJson(row.onset_evidence.target_groups));
      const expectedCorrection = {
        correction_kind: "prior_hylan_short_year_literals_omitted_from_accounting",
        prior_claim_paths: [
          "source_findings.official_lane_matching_record_count",
          "source_findings.official_lane_matching_segment_ids",
        ],
        prior_claim_value: {
          feature_row_count: priorContract.priorRowCount,
          distinct_feature_id_count: priorContract.priorIdCount,
        },
        supersedes_prior_finding: true,
        corrected_finding: {
          finding_summary: "The immutable prior accounting omitted the two current target rows whose exact source literal uses a two-digit year; the prior row remains immutable while this receipt records the corrected complete target.",
          current_feature_row_count: 95,
          current_feature_key_count: 93,
          current_feature_id_count: 93,
          restored_features: [
            {
              feature_key: "dot-lane-feature:2cae9c880cf555e51af7f9cb",
              feature_id: "0152288",
              direction: "NB",
              open_dates_literal: "9/12/20",
              named_sbs_routes: ["S79"],
            },
            {
              feature_key: "dot-lane-feature:d320e2075200f9257ad08392",
              feature_id: "0155475",
              direction: "NB",
              open_dates_literal: "9/12/20",
              named_sbs_routes: ["S79"],
            },
          ],
          current_feature_rows_sha256: HYLAN_BOULEVARD_FEATURE_ROWS_SHA256,
          current_target_groups_sha256: currentTargetGroupsSha256,
        },
        evidence: {
          candidate_fingerprint: row.candidate_fingerprint,
          ledger_id: row.ledger_id,
          packet_id: packet.packet_id,
          lane_snapshot_id: row.onset_evidence.lane_snapshot_id,
          source_id: HYLAN_BOULEVARD_CURRENT_SOURCE.sourceId,
          source_artifact: HYLAN_BOULEVARD_CURRENT_SOURCE.artifact,
          source_sha256: HYLAN_BOULEVARD_CURRENT_SOURCE.sha256,
        },
        remaining_unresolved_bindings: [
          "attribution", "direction", "feature_extent", "phase", "traversal",
        ],
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      const expectedProjectContext = {
        finding_kind: "hylan_extension_and_route_context_nonterminal",
        cab_source_id: HYLAN_BOULEVARD_CONTEXT_SOURCES.cab.sourceId,
        cab_source_url: HYLAN_BOULEVARD_CONTEXT_SOURCES.cab.url,
        cab_source_content_sha256: HYLAN_BOULEVARD_CONTEXT_SOURCES.cab.sha256,
        cab_project_route_ids: HYLAN_BOULEVARD_PROJECT_ROUTES,
        candidate_route_id: row.gtfs_route_id,
        normalized_candidate_route_id: priorContract.normalizedRouteId,
        candidate_route_inventory_match: supported,
        better_buses_source_id: HYLAN_BOULEVARD_CONTEXT_SOURCES.completion.sourceId,
        better_buses_source_url: HYLAN_BOULEVARD_CONTEXT_SOURCES.completion.url,
        better_buses_source_content_sha256: HYLAN_BOULEVARD_CONTEXT_SOURCES.completion.sha256,
        better_buses_context_only: true,
        better_buses_candidate_route_binding_promoted: false,
        registry_named_sbs_routes: ["S79"],
        candidate_route_named_sbs_intersection: normalizedSbsVariant ? ["S79"] : [],
        exact_current_target_bound: false,
        candidate_date_or_phase_bound: false,
        traversal_bound: false,
        authorizes_study: false,
        authorizes_cross_product: false,
      };
      const correctionSentence = priorContract.requiresCorrection
        ? " The prior 93-row/91-ID accounting omitted the two current rows with exact 9/12/20 literals; this receipt corrects the complete current target to 95 ordered rows, 93 keys, and 93 IDs without mutating the prior row."
        : "";
      const rationalePrefix = normalizedSbsVariant
        ? "The immutable Staten Island acquisition preserves the distinct S79+ ledger identity while normalizing the route to S79, and it records 94 registry rows whose SBS field names S79 plus official CAB route-treatment context; neither source binds every row of the exact current target to a stable candidate phase."
        : supported
          ? `The immutable Staten Island acquisition acquired official CAB route-treatment context naming ${row.gtfs_route_id}, but it does not bind ${row.gtfs_route_id} to every row of the exact current target or to a stable candidate phase.`
          : `The immutable Staten Island acquisition found no authoritative exact ${row.gtfs_route_id} route-treatment binding to the current Hylan Boulevard target.`;
      const expectedRationale = `${rationalePrefix}${correctionSentence} The exact target is the ordered 95-row, 93-key, 93-ID mixed-date feature union on Hylan Boulevard: 65 northbound and 30 southbound rows, with 93 exact 9/12/2020 literals and two exact 9/12/20 literals. Registry SBS fields name S79 on 94 rows, leave one row unnamed, and preserve one identical feature row three times. The acquired Better Buses completion release is corridor-extension context only and does not prove this candidate's exact target, date-versus-phase identity, or traversal. The historical schedule dossier is unavailable before 2023 (one geometry-ambiguous row, zero target-tagged). Attribution, direction, feature extent, phase, and traversal remain unresolved. This is not a no-traversal refutation and authorizes no occurrence, study, or cross-product projection.`;
      const exactCandidateQuery = exactQueries.some((query) => {
        if (query.category !== "official_mta_route_project") return false;
        const tokens = query.query.toUpperCase().split(/[^A-Z0-9+]+/u).filter(Boolean);
        return [row.gtfs_route_id, "HYLAN", "BOULEVARD"].every((token) => tokens.includes(token));
      });
      const cabRetrieval = retrievals.some((retrieval) => {
        const record = retrieval as Record<string, unknown>;
        return retrieval.category === "official_public_board_committee" &&
          record.id === HYLAN_BOULEVARD_CONTEXT_SOURCES.cab.sourceId &&
          record.sha256 === HYLAN_BOULEVARD_CONTEXT_SOURCES.cab.sha256 && record.status === "acquired";
      });
      const completionRetrieval = retrievals.some((retrieval) => {
        const record = retrieval as Record<string, unknown>;
        return retrieval.category === "official_nyc_dot_lane_project" &&
          record.id === HYLAN_BOULEVARD_CONTEXT_SOURCES.completion.sourceId &&
          record.sha256 === HYLAN_BOULEVARD_CONTEXT_SOURCES.completion.sha256 && record.status === "acquired";
      });
      const acquiredCabSource = acquiredSourceRecords.find((source) =>
        source.id === HYLAN_BOULEVARD_CONTEXT_SOURCES.cab.sourceId);
      const acquiredCompletionSource = acquiredSourceRecords.find((source) =>
        source.id === HYLAN_BOULEVARD_CONTEXT_SOURCES.completion.sourceId);
      const currentSourcePath = resolve(rootDir, HYLAN_BOULEVARD_CURRENT_SOURCE.artifact);
      const currentSourceMetadataPath = resolve(rootDir, "raw", "sources",
        HYLAN_BOULEVARD_CURRENT_SOURCE.sourceId, "metadata.json");
      const currentSourceMetadata = existsSync(currentSourceMetadataPath)
        ? object(JSON.parse(readFileSync(currentSourceMetadataPath, "utf8")), currentSourceMetadataPath)
        : {};
      const currentSourceMetadataSha = typeof currentSourceMetadata.sha256 === "string"
        ? currentSourceMetadata.sha256.replace(/^sha256:/u, "")
        : null;
      const projectRouteEvidence = exactRouteEvidence?.filter((evidence) =>
        evidence.evidence_kind === "official_project_route_statement");
      const registryRouteEvidence = exactRouteEvidence?.filter((evidence) =>
        evidence.evidence_kind === "official_dot_lane_registry_row");
      if (!isExactHylanBoulevardPacketTarget(packet, row) ||
          priorPointer.receipt_id !== priorContract.receiptId ||
          priorPointer.row_sha256 !== priorContract.rowSha256 ||
          priorPointer.artifact !==
            "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/receipts.jsonl" ||
          priorPointer.disposition !== priorOutcome.exclusive_primary_disposition ||
          priorPointer.next_action !== priorOutcome.next_action ||
          priorCandidate.candidate_id !== row.candidate_id ||
          priorCandidate.normalized_route_id !== priorContract.normalizedRouteId ||
          priorCandidate.route_id !== row.gtfs_route_id || priorCandidate.corridor !== priorContract.corridor ||
          priorCandidate.implementation_date !== row.implementation_date ||
          priorCandidate.identity !== `${row.gtfs_route_id}|bus_lane|2020-09-12|day` ||
          receipt.missing_binding !== "feature_extent" || target.feature_row_count !== 95 ||
          !Array.isArray(target.feature_keys) || target.feature_keys.length !== 93 ||
          !Array.isArray(target.feature_ids) || target.feature_ids.length !== 93 ||
          !Array.isArray(target.feature_rows) || target.feature_rows.length !== 95 ||
          receipt.rationale !== expectedRationale ||
          (priorContract.requiresCorrection
            ? stableJson(receipt.finding_corrections as JsonValue) !==
              stableJson([expectedCorrection] as unknown as JsonValue)
            : receipt.finding_corrections !== undefined) ||
          stableJson(receipt.project_context as JsonValue) !==
            stableJson(expectedProjectContext as unknown as JsonValue) ||
          receipt.supplemental_search !== undefined || receipt.occurrence_context !== undefined ||
          receipt.context_receipt !== undefined || sourceFindings.acquired_for_candidate !== true ||
          sourceFindings.candidate_named_lane_record_count !== (normalizedSbsVariant ? 94 : 0) ||
          sourceFindings.official_lane_matching_record_count !== priorContract.priorRowCount ||
          !priorSegmentIds || priorSegmentIds.length !== priorContract.priorIdCount ||
          new Set(priorSegmentIds).size !== priorContract.priorIdCount ||
          stableJson(sourceFindings.official_lane_named_routes as JsonValue) !== stableJson(["S79"]) ||
          stableJson(sourceFindings.official_project_route_inventory as JsonValue) !==
            stableJson(HYLAN_BOULEVARD_PROJECT_ROUTES) ||
          !routeNamedSegmentIds || routeNamedSegmentIds.length !== (normalizedSbsVariant ? 92 : 0) ||
          sourceFindings.exact_project_route_statement_found !== supported ||
          sourceFindings.exact_project_route_source_id !== (supported ? "hylan_cb_july_2020" : null) ||
          sourceFindings.broader_corridor_route_inventory_match !== supported ||
          routePage.content_sha256 !== priorContract.routePageSha256 ||
          routePage.exact_route_title_found !== true || routePage.current_corridor_token_found !== true ||
          routePage.retrieval_status !== "acquired" ||
          typeof routePage.temporal_limitation !== "string" || !routePage.temporal_limitation ||
          priorOutcome.exclusive_primary_disposition !==
            (supported ? "linkage_supported_phase_unresolved" : "completed_search_route_linkage_unresolved") ||
          priorOutcome.registry_projection_excluded !== true || priorOutcome.still_unresolved !== true ||
          priorOutcome.study_projection_eligible !== false || priorClaims.physical_bus_lane_record_acquired !== true ||
          priorClaims.candidate_segment_ids_pinned !== false || priorClaims.date_and_phase_proved !== false ||
          priorClaims.exact_route_treatment_binding_proved !== supported ||
          priorClaims.exact_segment_binding_proved !== false || priorClaims.explicit_phase_identity_proved !== false ||
          priorClaims.operational_occurrence_identity_proved !== false || !exactRouteEvidence ||
          projectRouteEvidence?.length !== (supported ? 1 : 0) ||
          registryRouteEvidence?.length !== (normalizedSbsVariant ? 94 : 0) ||
          stableJson(priorClaims.exact_segment_ids as JsonValue) !== stableJson([]) ||
          stableJson(canonicalActions.canonical_links_added as JsonValue) !== stableJson([]) ||
          canonicalActions.operational_occurrence_added_or_updated !== false ||
          !exactCandidateQuery || !cabRetrieval || !completionRetrieval ||
          !acquiredCabSource || acquiredCabSource.url !== HYLAN_BOULEVARD_CONTEXT_SOURCES.cab.url ||
          acquiredCabSource.content_sha256 !== HYLAN_BOULEVARD_CONTEXT_SOURCES.cab.sha256 ||
          acquiredCabSource.retrieval_status !== "acquired" ||
          acquiredCabSource.note !== HYLAN_BOULEVARD_CONTEXT_SOURCES.cab.note ||
          !acquiredCompletionSource || acquiredCompletionSource.url !== HYLAN_BOULEVARD_CONTEXT_SOURCES.completion.url ||
          acquiredCompletionSource.content_sha256 !== HYLAN_BOULEVARD_CONTEXT_SOURCES.completion.sha256 ||
          acquiredCompletionSource.retrieval_status !== "acquired" ||
          acquiredCompletionSource.note !== HYLAN_BOULEVARD_CONTEXT_SOURCES.completion.note ||
          row.onset_evidence.lane_snapshot_id !== "nyc-dot-bus-lanes-local-streets-2026-07-22" ||
          row.onset_evidence.lane_source_id !== HYLAN_BOULEVARD_CURRENT_SOURCE.sourceId ||
          currentSourceMetadata.sourceId !== HYLAN_BOULEVARD_CURRENT_SOURCE.sourceId ||
          currentSourceMetadataSha !== HYLAN_BOULEVARD_CURRENT_SOURCE.sha256 ||
          !existsSync(currentSourcePath) || hash(readFileSync(currentSourcePath)) !== HYLAN_BOULEVARD_CURRENT_SOURCE.sha256 ||
          receipt.authorizes_study !== false || receipt.authorizes_cross_product !== false) {
        throw new Error(`${receiptPath}: Hylan Boulevard absence contract does not match the exact candidate (${row.gtfs_route_id})`);
      }
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
          derivedDomains.some((domain) =>
            domain !== "nyc.gov" && !domain.endsWith(".nyc.gov") &&
            domain !== "mta.info" && !domain.endsWith(".mta.info"))) {
        throw new Error(`${receiptPath}: supplemental search URLs must resolve to recorded official NYC or MTA domains`);
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
        const southernBrooklynB82March2018Source =
          sourceId === "brt_south_brooklyn_b82_mar2018" &&
          metadata.documentDate === "2018-03" &&
          metadata.sourceGroup === "bus_priority_document";
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
        const exactKingsHighwayLocalServiceWindow = southernBrooklynB82March2018Source &&
          isExactKingsHighwayPacketTarget(packet, row) &&
          (row.gtfs_route_id === "B82" || row.gtfs_route_id === "B7") &&
          [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
            block.route &&
            block.tokens.has("KINGS") &&
            block.tokens.has("HIGHWAY") &&
            block.tokens.has("LOCAL") &&
            (row.gtfs_route_id === "B82"
              ? block.tokens.has("B82") && block.tokens.has("LIMITED")
              : block.tokens.has("B7")))) &&
          [...citedPageWindows.values()].some((window) =>
            window.tokens.has("KINGS") &&
            (window.tokens.has("HIGHWAY") || window.tokens.has("HWY")) &&
            window.tokens.has("2018") &&
            window.tokens.has("TRANSIT") &&
            window.tokens.has("IMPROVEMENTS") &&
            window.tokens.has("BUS") &&
            window.tokens.has("LANES") &&
            window.tokens.has("LOCAL") &&
            window.tokens.has("SBS") &&
            Math.max(...window.positions) - Math.min(...window.positions) <= 3);
        const correctionCandidateDateTraversalConfirmed = row.dossier_refs.some((ref) =>
          ref.candidate_target_match === true &&
          ref.verdict_class === "traversal_confirmed" &&
          ref.service_date === row.implementation_date);
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
              !boundedWest178CorridorServiceWindow &&
              !exactKingsHighwayLocalServiceWindow) ||
            (!isIntersectionAttribution && !isProjectConnection && !isProjectCorridorService)) {
          throw new Error(`${correctionPath}: staged source-block evidence does not bind the exact route to its typed project context`);
        }
        if (exactKingsHighwayLocalServiceWindow &&
            (!receiptUnresolved.includes("traversal") || correctionCandidateDateTraversalConfirmed)) {
          throw new Error(`${correctionPath}: Kings Highway project context transferred to candidate-date traversal`);
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
          const churchAvenueTransitProjectTitle =
            titleTokens.includes("CHURCH") &&
            (titleTokens.includes("AVE") || titleTokens.includes("AVENUE")) &&
            titleTokens.includes("TRANSIT") &&
            titleTokens.includes("TRAFFIC") &&
            titleTokens.includes("IMPROVEMENTS") &&
            titleTokens.includes("PROJECT") &&
            titleTokens.includes("UPDATE") &&
            titleTokens.includes("IMPLEMENTATION");
          const churchAvenueCorridorStudyTitle =
            titleTokens.includes("CITYWIDE") &&
            titleTokens.includes("CONGESTED") &&
            titleTokens.includes("CORRIDOR") &&
            titleTokens.includes("CHURCH") &&
            titleTokens.includes("AVENUE") &&
            titleTokens.includes("MCDONALD") &&
            titleTokens.includes("UTICA") &&
            titleTokens.includes("FINAL") &&
            titleTokens.includes("REPORT");
          const vanderbiltClermontSafetyMobilityTitle =
            titleTokens.includes("VANDERBILT") &&
            titleTokens.includes("AVENUE") &&
            titleTokens.includes("CLERMONT") &&
            titleTokens.includes("SAFETY") &&
            titleTokens.includes("MOBILITY") &&
            titleTokens.includes("IMPROVEMENTS");
          const coneyIslandGravesendTransportationStudyTitle =
            titleTokens.includes("CONEY") &&
            titleTokens.includes("ISLAND") &&
            titleTokens.includes("GRAVESEND") &&
            titleTokens.includes("SUSTAINABLE") &&
            titleTokens.includes("DEVELOPMENT") &&
            titleTokens.includes("TRANSPORTATION") &&
            titleTokens.includes("STUDY") &&
            titleTokens.includes("FINAL") &&
            titleTokens.includes("REPORT");
          const southernBrooklynB82March2018Source =
            sourceId === "brt_south_brooklyn_b82_mar2018" &&
            metadata.documentDate === "2018-03" &&
            metadata.sourceGroup === "bus_priority_document";
          const uticaAvenueSeptember2013StudySource =
            sourceId === "2013_09_24_sbs_utica_cb9" &&
            metadata.documentDate === "2013" &&
            metadata.sourceGroup === "select_bus_service";
          const malcolmXMarch2020Source =
            sourceId === "malcolm_x_blvd_utica_ave_mar2020" &&
            metadata.documentDate === "2020-03" &&
            metadata.sourceGroup === "bus_priority_document";
          const queensRedesignServiceChangesSource =
            sourceId === "mta_queens_bus_network_redesign_service_changes" &&
            metadata.documentDate === "2025-06-29" &&
            metadata.sourceGroup === "route_redesign";
          const queensServiceChangeBoardItemSource =
            sourceId === "queens_service_change_board_item_2025" &&
            metadata.documentDate === "2025-01" &&
            metadata.sourceGroup === "board_books";
          const q69AcePerformanceSource =
            sourceId === "meeting_doc_167241" &&
            metadata.sourceGroup === "mta_board_meeting";
          if (metadata.sourceId !== sourceId || (metadata.sourceUrl !== sourceUrl && metadata.finalUrl !== sourceUrl) ||
              metadataSha !== sourceContentSha256 || hash(readFileSync(sourceArtifactPath)) !== sourceContentSha256 ||
              (!proposalSourceTitle && !upperCorridorExistingConditionsTitle && !secondAvenueRedesignTitle &&
                !west125SbsEnforcementTitle && !west178CorridorTitle && !churchAvenueTransitProjectTitle &&
                !churchAvenueCorridorStudyTitle && !vanderbiltClermontSafetyMobilityTitle &&
                !coneyIslandGravesendTransportationStudyTitle && !southernBrooklynB82March2018Source &&
                !uticaAvenueSeptember2013StudySource && !malcolmXMarch2020Source &&
                !queensRedesignServiceChangesSource && !queensServiceChangeBoardItemSource &&
                !q69AcePerformanceSource) ||
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
          const exactChurchAvenuePacketTarget =
            packet.what_is_known.target_groups.length === 1 &&
            packet.what_is_known.target_groups[0]?.lane_group_id === "BK|CHURCH AVENUE";
          const exactChurchAvenueProjectWindow = churchAvenueTransitProjectTitle &&
            exactChurchAvenuePacketTarget &&
            row.implementation_date === "2019-10-23" &&
            [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
              block.route &&
              block.tokens.has("B35") &&
              block.tokens.has("DAILY") &&
              block.tokens.has("RIDERS"))) &&
            [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
              block.tokens.has("CURBSIDE") &&
              block.tokens.has("BUS") &&
              block.tokens.has("LANES") &&
              block.tokens.has("BOTH") &&
              block.tokens.has("DIRECTIONS") &&
              block.tokens.has("MARLBOROUGH") &&
              block.tokens.has("7") &&
              block.tokens.has("ST"))) &&
            [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
              block.tokens.has("BUS") &&
              block.tokens.has("LANES") &&
              block.tokens.has("ACTIVATED") &&
              block.tokens.has("OCTOBER") &&
              block.tokens.has("23") &&
              block.tokens.has("2019")));
          const exactChurchAvenueHistoricalTraversalWindow = churchAvenueCorridorStudyTitle &&
            exactChurchAvenuePacketTarget &&
            metadata.publishedDate === "2013-02-01" &&
            [...citedPageWindows.values()].some((window) => window.blocks.some((routeBlock) =>
              routeBlock.route &&
              routeBlock.tokens.has("AVENUE") &&
              window.blocks.some((traverseBlock) =>
                traverseBlock.tokens.has("SIX") &&
                traverseBlock.tokens.has("BUS") &&
                traverseBlock.tokens.has("LINES") &&
                traverseBlock.tokens.has("TRAVERSE") &&
                traverseBlock.tokens.has("CHURCH") &&
                Math.abs(routeBlock.position - traverseBlock.position) <= 1)));
          const fultonFeatureMatches = packet.what_is_known.target_groups
            .flatMap((group) => group.feature_matches);
          const exactFultonStreetPacketTarget =
            packet.what_is_known.target_groups.length === 1 &&
            packet.what_is_known.target_groups[0]?.lane_group_id === "BK|FULTON STREET" &&
            packet.what_is_known.target_groups[0]?.geometry_scope === "mixed_date_feature_union" &&
            fultonFeatureMatches.length === 33 &&
            new Set(fultonFeatureMatches.map((match) => match.feature_key)).size === 27 &&
            new Set(fultonFeatureMatches.map((match) => match.feature_id)).size === 15 &&
            fultonFeatureMatches.every((match) => match.matched_date === row.implementation_date) &&
            stableJson([...new Set(fultonFeatureMatches.map((match) => match.direction))].sort()) ===
              stableJson(["EB", "WB"]);
          const exactFultonAdjacentProjectEndpointWindow = vanderbiltClermontSafetyMobilityTitle &&
            exactFultonStreetPacketTarget &&
            row.implementation_date === "2018-06-01" &&
            [...citedPageWindows.values()].some((window) =>
              window.route &&
              window.tokens.has("VANDERBILT") &&
              window.tokens.has("AVENUE") &&
              window.tokens.has("B69") &&
              window.tokens.has("BUS") &&
              window.tokens.has("ROUTE") &&
              Math.max(...window.positions) - Math.min(...window.positions) <= 14) &&
            [...citedPageWindows.values()].some((window) =>
              window.tokens.has("PROPOSAL") &&
              window.tokens.has("OVERVIEW") &&
              window.tokens.has("VANDERBILT") &&
              window.tokens.has("CLERMONT") &&
              window.tokens.has("FULTON") &&
              window.tokens.has("FLUSHING") &&
              Math.max(...window.positions) - Math.min(...window.positions) <= 14);
          const glenwoodFeatureMatches = packet.what_is_known.target_groups
            .flatMap((group) => group.feature_matches);
          const exactGlenwoodRoadPacketTarget =
            packet.what_is_known.target_groups.length === 1 &&
            packet.what_is_known.target_groups[0]?.lane_group_id === "BK|GLENWOOD ROAD" &&
            packet.what_is_known.target_groups[0]?.geometry_scope === "coextensive_with_lane_group" &&
            glenwoodFeatureMatches.length === 5 &&
            new Set(glenwoodFeatureMatches.map((match) => match.feature_key)).size === 5 &&
            new Set(glenwoodFeatureMatches.map((match) => match.feature_id)).size === 5 &&
            glenwoodFeatureMatches.every((match) =>
              match.matched_date === row.implementation_date &&
              match.matched_token_literal === "09/30/2018" &&
              match.open_dates_literal === "09/30/2018" &&
              match.direction === "WB") &&
            stableJson(packet.unresolved_bindings) === stableJson(["attribution", "traversal"]);
          const exactGlenwoodHistoricalIntersectionWindow = coneyIslandGravesendTransportationStudyTitle &&
            exactGlenwoodRoadPacketTarget &&
            row.implementation_date === "2018-09-30" &&
            metadata.publishedDate === "2010-06-01" &&
            [...citedPageWindows.values()].some((window) =>
              window.route &&
              window.tokens.has("B6") &&
              window.tokens.has("WB") &&
              window.tokens.has("GLENWOOD") &&
              window.tokens.has("ROAD") &&
              window.tokens.has("NOSTRAND") &&
              Math.max(...window.positions) - Math.min(...window.positions) <= 3);
          const exactKingsHighwayB82SbsProjectWindow = southernBrooklynB82March2018Source &&
            row.gtfs_route_id === "B82+" &&
            isExactKingsHighwayPacketTarget(packet, row) &&
            [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
              block.route &&
              block.tokens.has("B82") &&
              block.tokens.has("SBS") &&
              block.tokens.has("2018") &&
              block.tokens.has("STREET") &&
              block.tokens.has("CHANGES"))) &&
            [...citedPageWindows.values()].some((window) =>
              window.tokens.has("KINGS") &&
              (window.tokens.has("HIGHWAY") || window.tokens.has("HWY")) &&
              window.tokens.has("2018") &&
              window.tokens.has("TRANSIT") &&
              window.tokens.has("IMPROVEMENTS") &&
              window.tokens.has("BUS") &&
              window.tokens.has("LANES") &&
              window.tokens.has("LOCAL") &&
              window.tokens.has("SBS") &&
              Math.max(...window.positions) - Math.min(...window.positions) <= 3);
          const exactMalcolmXProjectWindow = malcolmXMarch2020Source &&
            isExactMalcolmXPacketTarget(packet, row) &&
            [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
              block.route &&
              block.tokens.has("B46") &&
              block.tokens.has("LOCAL") &&
              block.tokens.has("SBS") &&
              block.tokens.has("SELECT") &&
              block.tokens.has("BUS") &&
              block.tokens.has("SERVICE"))) &&
            [...citedPageWindows.values()].some((window) =>
              window.tokens.has("CURBSIDE") &&
              window.tokens.has("BUS") &&
              window.tokens.has("LANE") &&
              window.tokens.has("CHAUNCEY") &&
              window.tokens.has("FULTON") &&
              window.tokens.has("SOUTHBOUND") &&
              Math.max(...window.positions) - Math.min(...window.positions) <= 2) &&
            [...citedPageWindows.values()].some((window) =>
              window.tokens.has("MALCOLM") &&
              window.tokens.has("X") &&
              window.tokens.has("B46") &&
              window.tokens.has("SPRING") &&
              window.tokens.has("2020") &&
              window.tokens.has("IMPLEMENT") &&
              window.tokens.has("CHAUNCEY") &&
              window.tokens.has("FULTON") &&
              Math.max(...window.positions) - Math.min(...window.positions) <= 2);
          const exactUticaHistoricalProjectIntersectionWindow = uticaAvenueSeptember2013StudySource &&
            (row.gtfs_route_id === "B12" || row.gtfs_route_id === "B14") &&
            isExactUticaAvenuePacketTarget(packet, row) &&
            [...citedPageWindows.values()].some((window) =>
              window.tokens.has("PROJECT") &&
              window.tokens.has("UTICA") &&
              window.tokens.has("AVENUE") &&
              window.tokens.has("ST") &&
              window.tokens.has("JOHNS") &&
              window.tokens.has("CHURCH") &&
              window.tokens.has("INTERSECTIONS") &&
              window.tokens.has("EASTERN") &&
              window.tokens.has("EMPIRE") &&
              window.tokens.has("LEFFERTS") &&
              Math.max(...window.positions) - Math.min(...window.positions) <= 3) &&
            [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
              block.route &&
              block.tokens.has("B46") &&
              block.tokens.has("UTICA") &&
              (row.gtfs_route_id === "B12"
                ? block.tokens.has("B12") && block.tokens.has("EMPIRE") && block.tokens.has("LEFFERTS")
                : block.tokens.has("B14") && block.tokens.has("EASTERN") && block.tokens.has("PKWY"))));
          const exactUticaHistoricalOutsideProjectIntersectionWindow = uticaAvenueSeptember2013StudySource &&
            (row.gtfs_route_id === "B8" || row.gtfs_route_id === "B15") &&
            isExactUticaAvenuePacketTarget(packet, row) &&
            [...citedPageWindows.values()].some((window) =>
              window.tokens.has("PROJECT") &&
              window.tokens.has("UTICA") &&
              window.tokens.has("AVENUE") &&
              window.tokens.has("ST") &&
              window.tokens.has("JOHNS") &&
              window.tokens.has("CHURCH") &&
              Math.max(...window.positions) - Math.min(...window.positions) <= 3) &&
            [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
              block.route &&
              block.tokens.has("B46") &&
              block.tokens.has("UTICA") &&
              (row.gtfs_route_id === "B8"
                ? block.tokens.has("CHURCH") && block.tokens.has("B8") &&
                  block.tokens.has("AVENUE") && block.tokens.has("D")
                : block.tokens.has("ST") && block.tokens.has("JOHNS") &&
                  block.tokens.has("B15") && block.tokens.has("DEAN") && block.tokens.has("BERGEN"))));
          const exactQueensPlazaRouteCorridorWindow =
            isExactQueensPlazaPacketTarget(packet, row) &&
            (queensRedesignServiceChangesSource || queensServiceChangeBoardItemSource ||
              q69AcePerformanceSource) &&
            [...citedPageWindows.values()].some((window) => window.blocks.some((block) =>
              block.route && block.tokens.has("QUEENS") && block.tokens.has("PLAZA")));
          if (!boundedServiceContext && !boundedExplicitSbsRouteContext &&
              !exactWest178CorridorServiceWindow && !exactChurchAvenueProjectWindow &&
              !exactChurchAvenueHistoricalTraversalWindow &&
              !exactFultonAdjacentProjectEndpointWindow &&
              !exactGlenwoodHistoricalIntersectionWindow &&
              !exactKingsHighwayB82SbsProjectWindow &&
              !exactMalcolmXProjectWindow &&
              !exactUticaHistoricalProjectIntersectionWindow &&
              !exactUticaHistoricalOutsideProjectIntersectionWindow &&
              !exactQueensPlazaRouteCorridorWindow) {
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
          const candidateDateTraversalConfirmed = row.dossier_refs.some((ref) =>
            ref.candidate_target_match === true &&
            ref.verdict_class === "traversal_confirmed" &&
            ref.service_date === row.implementation_date);
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
          const isHistoricalSameCorridorTraversalContext =
            finding.finding_kind === "positive_historical_same_corridor_traversal_nonterminal" &&
            finding.supported_scope === "historical_same_corridor_traversal_only";
          const isAdjacentProjectIntersectionEndpointContext =
            finding.finding_kind === "positive_adjacent_project_intersection_endpoint_nonterminal" &&
            finding.supported_scope === "adjacent_project_intersection_endpoint_only";
          const isHistoricalSameCorridorIntersectionContext =
            finding.finding_kind === "positive_historical_same_corridor_intersection_nonterminal" &&
            finding.supported_scope === "historical_same_corridor_intersection_only";
          const isHistoricalProjectIntersectionConnectionContext =
            finding.finding_kind === "positive_historical_project_intersection_connection_nonterminal" &&
            finding.supported_scope === "historical_project_intersection_connection_only";
          const isHistoricalOutsideProjectExtentIntersectionConnectionContext =
            finding.finding_kind ===
              "positive_historical_outside_project_extent_intersection_connection_nonterminal" &&
            finding.supported_scope ===
              "historical_outside_project_extent_intersection_connection_only";
          const isRouteCorridorContext =
            finding.finding_kind === "positive_route_corridor_context_nonterminal" &&
            finding.supported_scope === "route_corridor_context_only";
          if (isOtherExtentContext && (!commonContextScopeValid || !proposalSourceTitle)) {
            throw new Error(`${contextPath}: positive context exceeds its nonauthorizing other-extent scope`);
          }
          if (isProjectCorridorServiceContext &&
              (!commonContextScopeValid ||
                (!exactUpperCorridorReviewWindow &&
                  !exactSecondAvenueProjectWindow &&
                  !exactWest125ExtensionWindow &&
                  !exactWest178CorridorServiceWindow &&
                  !exactChurchAvenueProjectWindow &&
                  !exactKingsHighwayB82SbsProjectWindow &&
                  !exactMalcolmXProjectWindow) ||
                (exactChurchAvenueProjectWindow &&
                  (!receiptUnresolved.includes("traversal") || candidateDateTraversalConfirmed)) ||
                (exactKingsHighwayB82SbsProjectWindow &&
                  (!receiptUnresolved.includes("attribution") ||
                    !receiptUnresolved.includes("direction") ||
                    !receiptUnresolved.includes("traversal") ||
                    candidateDateTraversalConfirmed)) ||
                (exactMalcolmXProjectWindow &&
                  (stableJson(receiptUnresolved) !== stableJson(["attribution", "traversal"]) ||
                    candidateDateTraversalConfirmed)) ||
                object(prior.source_findings, `${contextPath}.prior.source_findings`)
                  .exact_project_route_statement_found !== true)) {
            throw new Error(`${contextPath}: positive context exceeds its nonauthorizing project-corridor scope`);
          }
          if (isHistoricalSameCorridorTraversalContext &&
              (!commonContextScopeValid || !exactChurchAvenueHistoricalTraversalWindow ||
                object(prior.source_findings, `${contextPath}.prior.source_findings`)
                  .exact_project_route_statement_found !== false ||
                !receiptUnresolved.includes("traversal") || candidateDateTraversalConfirmed)) {
            throw new Error(`${contextPath}: historical same-corridor context transferred to the candidate-date project`);
          }
          if (isAdjacentProjectIntersectionEndpointContext &&
              (!commonContextScopeValid || !exactFultonAdjacentProjectEndpointWindow ||
                object(prior.source_findings, `${contextPath}.prior.source_findings`)
                  .exact_project_route_statement_found !== false ||
                !receiptUnresolved.includes("attribution") ||
                !receiptUnresolved.includes("direction") ||
                !receiptUnresolved.includes("feature_extent") ||
                !receiptUnresolved.includes("phase") ||
                !receiptUnresolved.includes("traversal") ||
                candidateDateTraversalConfirmed)) {
            throw new Error(`${contextPath}: adjacent-project endpoint context transferred to Fulton Street lane service or traversal`);
          }
          if (isHistoricalSameCorridorIntersectionContext &&
              (!commonContextScopeValid || !exactGlenwoodHistoricalIntersectionWindow ||
                object(prior.source_findings, `${contextPath}.prior.source_findings`)
                  .exact_project_route_statement_found !== false ||
                !receiptUnresolved.includes("attribution") ||
                !receiptUnresolved.includes("traversal") ||
                candidateDateTraversalConfirmed)) {
            throw new Error(`${contextPath}: historical intersection context transferred to 2018 Glenwood Road lane service or traversal`);
          }
          if (isHistoricalProjectIntersectionConnectionContext &&
              (!commonContextScopeValid || !exactUticaHistoricalProjectIntersectionWindow ||
                object(prior.source_findings, `${contextPath}.prior.source_findings`)
                  .exact_project_route_statement_found !== false ||
                !receiptUnresolved.includes("attribution") ||
                !receiptUnresolved.includes("direction") ||
                !receiptUnresolved.includes("feature_extent") ||
                !receiptUnresolved.includes("phase") ||
                !receiptUnresolved.includes("traversal") ||
                candidateDateTraversalConfirmed)) {
            throw new Error(`${contextPath}: historical project-intersection context transferred to Utica Avenue project service or traversal`);
          }
          if (isHistoricalOutsideProjectExtentIntersectionConnectionContext &&
              (!commonContextScopeValid || !exactUticaHistoricalOutsideProjectIntersectionWindow ||
                object(prior.source_findings, `${contextPath}.prior.source_findings`)
                  .exact_project_route_statement_found !== false ||
                stableJson(receiptUnresolved) !== stableJson(row.gtfs_route_id === "B15"
                  ? ["attribution", "feature_extent", "phase", "traversal"]
                  : ["attribution", "direction", "feature_extent", "phase", "traversal"]) ||
                candidateDateTraversalConfirmed)) {
            throw new Error(`${contextPath}: outside-project-extent intersection context transferred to Utica Avenue lane service or traversal`);
          }
          if (isRouteCorridorContext &&
              (!commonContextScopeValid || !exactQueensPlazaRouteCorridorWindow ||
                object(prior.source_findings, `${contextPath}.prior.source_findings`)
                  .exact_project_route_statement_found !== false ||
                !receiptUnresolved.includes("attribution") ||
                !receiptUnresolved.includes("traversal") || candidateDateTraversalConfirmed)) {
            throw new Error(`${contextPath}: route/corridor context transferred to exact Queens Plaza lane rows or traversal`);
          }
          if (!isOtherExtentContext && !isProjectCorridorServiceContext &&
              !isHistoricalSameCorridorTraversalContext &&
              !isAdjacentProjectIntersectionEndpointContext &&
              !isHistoricalSameCorridorIntersectionContext &&
              !isHistoricalProjectIntersectionConnectionContext &&
              !isHistoricalOutsideProjectExtentIntersectionConnectionContext &&
              !isRouteCorridorContext) {
            throw new Error(`${contextPath}: positive context has an unsupported typed scope`);
          }
          nonempty(finding.finding_summary, `${contextPath}.context_finding.finding_summary`);
        }
      }
      if (isExactKingsHighwayPacketTarget(packet, row)) {
        const correctionCount = supplemental.finding_corrections.length;
        const contextCount = Array.isArray(supplemental.positive_context_findings)
          ? supplemental.positive_context_findings.length
          : 0;
        const expectedCorrectionCount = row.gtfs_route_id === "B82" || row.gtfs_route_id === "B7" ? 1 : 0;
        const expectedContextCount = row.gtfs_route_id === "B82+" ? 1 : 0;
        if (correctionCount !== expectedCorrectionCount || contextCount !== expectedContextCount) {
          throw new Error(`${receiptPath}: Kings Highway correction/context cardinality does not match the exact candidate route`);
        }
      }
      if (isExactUticaAvenuePacketTarget(packet, row)) {
        const correctionCount = supplemental.finding_corrections.length;
        const contextCount = Array.isArray(supplemental.positive_context_findings)
          ? supplemental.positive_context_findings.length
          : 0;
        if (correctionCount !== 0 || contextCount !== 1) {
          throw new Error(`${receiptPath}: Utica Avenue correction/context cardinality does not match the exact candidate route`);
        }
      }
      if (isExactVanSinderenPacketTarget(packet, row)) {
        const correctionCount = supplemental.finding_corrections.length;
        const contextCount = Array.isArray(supplemental.positive_context_findings)
          ? supplemental.positive_context_findings.length
          : 0;
        const supplementalQueries = supplemental.exact_queries.map((value, index) =>
          object(value, `${receiptPath}.supplemental_search.exact_queries[${index}]`));
        const hasExactQuery = (category: string) => supplementalQueries.some((query) => {
          if (query.category !== category) return false;
          const literal = String(query.query).toUpperCase();
          const tokens = literal.split(/[^A-Z0-9+]+/u).filter(Boolean);
          return ["B111", "VAN", "SINDEREN", "AVENUE"].every((token) => tokens.includes(token)) &&
            literal.includes("2016-01-01");
        });
        if (correctionCount !== 0 || contextCount !== 0 ||
            object(prior.source_findings, `${receiptPath}.prior.source_findings`)
              .exact_project_route_statement_found !== false ||
            !hasExactQuery("official_nyc_dot_lane_project") ||
            !hasExactQuery("official_public_board_committee")) {
          throw new Error(`${receiptPath}: Van Sinderen pure-absence review contract does not match the exact candidate`);
        }
      }
      if (pennsylvaniaAvenueLedgerTarget) {
        const correctionCount = supplemental.finding_corrections.length;
        const contextCount = Array.isArray(supplemental.positive_context_findings)
          ? supplemental.positive_context_findings.length
          : 0;
        const supplementalQueries = supplemental.exact_queries.map((value, index) =>
          object(value, `${receiptPath}.supplemental_search.exact_queries[${index}]`));
        const hasExactQuery = (category: string) => supplementalQueries.some((query) => {
          if (query.category !== category) return false;
          const literal = String(query.query).toUpperCase();
          const tokens = literal.split(/[^A-Z0-9+]+/u).filter(Boolean);
          return ["B83", "PENNSYLVANIA", "AVENUE"].every((token) => tokens.includes(token)) &&
            !tokens.includes("B82") && literal.includes("2018-06-30");
        });
        const sourceFindings = object(prior.source_findings,
          `${receiptPath}.prior.source_findings`);
        const priorOutcome = object(prior.outcome, `${receiptPath}.prior.outcome`);
        const priorClaims = object(prior.claim_results, `${receiptPath}.prior.claim_results`);
        if (!isExactPennsylvaniaAvenuePacketTarget(packet, row) ||
            receipt.missing_binding !== "traversal" ||
            stableJson(receiptUnresolved) !== stableJson(["attribution", "direction", "traversal"]) ||
            correctionCount !== 0 || contextCount !== 0 ||
            sourceFindings.exact_project_route_statement_found !== false ||
            priorOutcome.still_unresolved !== true ||
            priorClaims.exact_route_treatment_binding_proved !== false ||
            !Array.isArray(priorClaims.exact_route_binding_evidence) ||
            priorClaims.exact_route_binding_evidence.length !== 0 ||
            !hasExactQuery("official_nyc_dot_lane_project") ||
            !hasExactQuery("official_public_board_committee") ||
            receipt.authorizes_study !== false || receipt.authorizes_cross_product !== false) {
          throw new Error(`${receiptPath}: Pennsylvania Avenue B83 pure-absence review contract does not match the exact candidate`);
        }
      }
      if (malcolmXLedgerTarget) {
        const correctionCount = supplemental.finding_corrections.length;
        const contextCount = Array.isArray(supplemental.positive_context_findings)
          ? supplemental.positive_context_findings.length
          : 0;
        const supplementalQueries = supplemental.exact_queries.map((value, index) =>
          object(value, `${receiptPath}.supplemental_search.exact_queries[${index}]`));
        const hasExactQuery = (category: string) => supplementalQueries.some((query) => {
          if (query.category !== category) return false;
          const literal = String(query.query).toUpperCase();
          const tokens = literal.split(/[^A-Z0-9+]+/u).filter(Boolean);
          return ["B46+", "MALCOLM", "X", "BOULEVARD"].every((token) => tokens.includes(token)) &&
            literal.includes("2020-07-23");
        });
        const sourceFindings = object(prior.source_findings,
          `${receiptPath}.prior.source_findings`);
        const priorOutcome = object(prior.outcome, `${receiptPath}.prior.outcome`);
        const priorClaims = object(prior.claim_results, `${receiptPath}.prior.claim_results`);
        const canonicalActions = object(prior.canonical_actions,
          `${receiptPath}.prior.canonical_actions`);
        const bindingEvidence = Array.isArray(priorClaims.exact_route_binding_evidence)
          ? priorClaims.exact_route_binding_evidence.map((value, index) =>
            object(value, `${receiptPath}.prior.claim_results.exact_route_binding_evidence[${index}]`))
          : [];
        const exactAliasEvidence = bindingEvidence.length === 1 && bindingEvidence.every((evidence) => {
          const officialRoutes = stringArray(evidence.official_routes,
            `${receiptPath}.prior.claim_results.exact_route_binding_evidence.official_routes`, false);
          const supportedClaim = String(evidence.supported_claim).toUpperCase();
          return stableJson(officialRoutes) === stableJson(["B46+"]) &&
            ["B46", "LOCAL", "SELECT", "BUS", "SERVICE"].every((token) => supportedClaim.includes(token));
        });
        if (!isExactMalcolmXPacketTarget(packet, row) ||
            receipt.missing_binding !== "traversal" ||
            stableJson(receiptUnresolved) !== stableJson(["attribution", "traversal"]) ||
            correctionCount !== 0 || contextCount !== 1 ||
            sourceFindings.exact_project_route_statement_found !== true ||
            priorClaims.exact_route_treatment_binding_proved !== true ||
            priorClaims.date_and_phase_proved !== false ||
            priorClaims.exact_segment_binding_proved !== false ||
            priorClaims.operational_occurrence_identity_proved !== false ||
            priorOutcome.still_unresolved !== true ||
            canonicalActions.operational_occurrence_added_or_updated !== false ||
            stableJson(canonicalActions.existing_canonical_links_verified as JsonValue) !==
              stableJson(["relation_b46-sbs-operates-on-malcolm-x"]) ||
            !exactAliasEvidence || receipt.occurrence_context !== undefined ||
            !hasExactQuery("official_nyc_dot_lane_project") ||
            !hasExactQuery("official_public_board_committee") ||
            receipt.authorizes_study !== false || receipt.authorizes_cross_product !== false) {
          throw new Error(`${receiptPath}: Malcolm X B46+ nonterminal project-context contract does not match the exact candidate`);
        }
      }
      if (nassauAvenueLedgerTarget) {
        const correctionCount = supplemental.finding_corrections.length;
        const contextCount = Array.isArray(supplemental.positive_context_findings)
          ? supplemental.positive_context_findings.length
          : 0;
        const supplementalQueries = supplemental.exact_queries.map((value, index) =>
          object(value, `${receiptPath}.supplemental_search.exact_queries[${index}]`));
        const hasExactQuery = (category: string) => supplementalQueries.some((query) => {
          if (query.category !== category) return false;
          const literal = String(query.query).toUpperCase();
          const tokens = literal.split(/[^A-Z0-9+]+/u).filter(Boolean);
          return [row.gtfs_route_id, "NASSAU", "AVENUE"].every((token) => tokens.includes(token)) &&
            literal.includes("2018-08-24");
        });
        const sourceFindings = object(prior.source_findings,
          `${receiptPath}.prior.source_findings`);
        const priorOutcome = object(prior.outcome, `${receiptPath}.prior.outcome`);
        const priorClaims = object(prior.claim_results, `${receiptPath}.prior.claim_results`);
        const canonicalActions = object(prior.canonical_actions,
          `${receiptPath}.prior.canonical_actions`);
        const stagedSourceContract = [
          {
            sourceId: "bedford_nassau_aves_june2018",
            sourceUrl: "https://www.nyc.gov/html/dot/downloads/pdf/bedford-nassau-aves-june2018-2.pdf",
            documentDate: "2018-06-18",
            requiredWindows: [
              ["B62", "BUS", "STOPS", "CLOSE", "PROXIMITY"],
              ["CONSOLIDATE", "B62", "STOPS", "NASSAU", "BUS-ONLY", "MANHATTAN"],
              ["PAINT", "EXISTING", "BUS", "ONLY", "LANE", "NASSAU", "LEONARD", "MANHATTAN", "RED"],
            ],
          },
          {
            sourceId: "bedford_nassau_nov2018",
            sourceUrl: "https://www.nyc.gov/html/dot/downloads/pdf/bedford-nassau-nov2018.pdf",
            documentDate: "2018-11-19",
            requiredWindows: [
              ["BUS", "REROUTE", "JULY", "1ST"],
              ["MAJORITY", "MARKINGS", "FINISHED", "AUGUST", "24TH"],
            ],
          },
        ];
        const stagedSourcesValid = stagedSourceContract.every((expected) => {
          const acquiredSource = acquiredSourceRecords.find((source) =>
            source.source_id === expected.sourceId && source.url === expected.sourceUrl &&
            source.retrieval_status === "acquired");
          const sourceSha256 = String(acquiredSource?.content_sha256 ?? "");
          const sourceDir = resolve(rootDir, "raw", "sources", expected.sourceId);
          const metadataPath = join(sourceDir, "metadata.json");
          const artifactPath = join(sourceDir, "source.pdf");
          const blocksPath = join(sourceDir, "blocks.jsonl");
          if (![metadataPath, artifactPath, blocksPath].every(existsSync)) return false;
          const metadata = object(JSON.parse(readFileSync(metadataPath, "utf8")), metadataPath);
          const metadataSha = String(metadata.sha256 ?? "").replace(/^sha256:/u, "");
          const blocks = readFileSync(blocksPath, "utf8").split(/\r?\n/u).filter(Boolean)
            .map((line) => object(JSON.parse(line), blocksPath));
          const blockTokenSets = blocks.map((block) => new Set(String(block.raw_text ?? "").toUpperCase()
            .split(/[^A-Z0-9+-]+/u).filter(Boolean)));
          const sourceMentionsCandidate = blockTokenSets.some((tokens) => tokens.has(row.gtfs_route_id));
          const hasRequiredWindows = expected.requiredWindows.every((requiredTokens) => {
            const union = new Set<string>();
            for (const tokens of blockTokenSets) for (const token of tokens) union.add(token);
            return requiredTokens.every((token) => union.has(token));
          });
          return metadata.sourceId === expected.sourceId &&
            (metadata.sourceUrl === expected.sourceUrl || metadata.finalUrl === expected.sourceUrl) &&
            metadata.documentDate === expected.documentDate &&
            metadata.sourceGroup === "bus_priority_document" &&
            /^[a-f0-9]{64}$/u.test(sourceSha256) &&
            metadataSha === sourceSha256 && hash(readFileSync(artifactPath)) === sourceSha256 &&
            supplementalUrls.includes(expected.sourceUrl) &&
            acquiredRetrievals.some((retrieval) => retrieval.url === expected.sourceUrl &&
              retrieval.sha256 === sourceSha256) &&
            !sourceMentionsCandidate && hasRequiredWindows;
        });
        if (!isExactNassauAvenuePacketTarget(packet, row) ||
            receipt.missing_binding !== "traversal" ||
            stableJson(receiptUnresolved) !== stableJson(["attribution", "traversal"]) ||
            correctionCount !== 0 || contextCount !== 0 ||
            sourceFindings.exact_project_route_statement_found !== false ||
            priorOutcome.still_unresolved !== true ||
            priorClaims.exact_route_treatment_binding_proved !== false ||
            priorClaims.exact_segment_binding_proved !== false ||
            priorClaims.date_and_phase_proved !== false ||
            priorClaims.operational_occurrence_identity_proved !== false ||
            !Array.isArray(priorClaims.exact_route_binding_evidence) ||
            priorClaims.exact_route_binding_evidence.length !== 0 ||
            canonicalActions.operational_occurrence_added_or_updated !== false ||
            !Array.isArray(canonicalActions.canonical_links_added) ||
            canonicalActions.canonical_links_added.length !== 0 ||
            !hasExactQuery("official_nyc_dot_lane_project") ||
            !hasExactQuery("official_public_board_committee") ||
            !stagedSourcesValid || receipt.occurrence_context !== undefined ||
            receipt.authorizes_study !== false || receipt.authorizes_cross_product !== false) {
          throw new Error(`${receiptPath}: Nassau Avenue B43/B48 pure-absence review contract does not match the exact candidate`);
        }
      }
      if (queensPlazaLedgerTarget) {
        const correctionCount = supplemental.finding_corrections.length;
        const contextCount = Array.isArray(supplemental.positive_context_findings)
          ? supplemental.positive_context_findings.length
          : 0;
        const supplementalQueries = supplemental.exact_queries.map((value, index) =>
          object(value, `${receiptPath}.supplemental_search.exact_queries[${index}]`));
        const hasExactQuery = (category: string) => supplementalQueries.some((query) => {
          if (query.category !== category) return false;
          const literal = String(query.query).toUpperCase();
          const tokens = literal.split(/[^A-Z0-9+]+/u).filter(Boolean);
          return [row.gtfs_route_id, "QUEENS", "PLAZA"].every((token) => tokens.includes(token)) &&
            literal.includes("2025-12-13");
        });
        const hasRouteCorridorQuery = supplementalQueries.some((query) => {
          if (query.category !== "official_mta_route_project") return false;
          const tokens = String(query.query).toUpperCase().split(/[^A-Z0-9+]+/u).filter(Boolean);
          return [row.gtfs_route_id, "QUEENS", "PLAZA", "2025"].every((token) => tokens.includes(token));
        });
        const sourceFindings = object(prior.source_findings,
          `${receiptPath}.prior.source_findings`);
        const priorOutcome = object(prior.outcome, `${receiptPath}.prior.outcome`);
        const priorClaims = object(prior.claim_results, `${receiptPath}.prior.claim_results`);
        const canonicalActions = object(prior.canonical_actions,
          `${receiptPath}.prior.canonical_actions`);
        const expectedMissingBinding = QUEENS_PLAZA_DIRECTION_GAP_ROUTES.has(row.gtfs_route_id)
          ? "direction"
          : "traversal";
        const expectedUnresolvedBindings = expectedMissingBinding === "direction"
          ? ["attribution", "direction", "traversal"]
          : ["attribution", "traversal"];
        const exactNycSources = [
          {
            category: "official_nyc_dot_lane_project",
            url: "https://www.nyc.gov/html/dot/html/about/current-projects.shtml",
            sha256: "497d1f9358c5b4864a0bf1d30b1157d431a3d1a6645aad55dbad0b3090ae0f8f",
          },
          {
            category: "official_public_board_committee",
            url: "https://www.nyc.gov/html/dot/html/about/projects-2025.shtml",
            sha256: "17d7f3288adc17c84af872c7452aa99420bc1252dd714b7c55972e3b1164f7ce",
          },
        ];
        const expectedContextSource = QUEENS_PLAZA_CONTEXT_SOURCES.get(row.gtfs_route_id);
        const expectedSupplementalUrls = [
          ...exactNycSources.map((source) => source.url),
          ...(expectedContextSource ? [expectedContextSource.url] : []),
        ].sort();
        const supplementalRetrievals = Array.isArray(supplemental.retrievals)
          ? supplemental.retrievals
          : [];
        const nycSourcesExact = exactNycSources.every((expected) =>
          acquiredRetrievals.some((retrieval) => retrieval.url === expected.url &&
            retrieval.sha256 === expected.sha256) &&
          supplementalRetrievals.some((value, index) => {
            const retrieval = object(value,
              `${receiptPath}.supplemental_search.retrievals[${index}]`);
            return retrieval.category === expected.category && retrieval.url === expected.url &&
              retrieval.sha256 === expected.sha256 && retrieval.status === "acquired";
          }));
        const expectedContext = expectedContextSource && Array.isArray(supplemental.positive_context_findings)
          ? supplemental.positive_context_findings.find((value) => {
            const context = object(value, `${receiptPath}.supplemental_search.positive_context_findings`);
            return context.source_id === expectedContextSource.sourceId &&
              context.source_url === expectedContextSource.url;
          })
          : undefined;
        const mtaSourceExact = expectedContextSource
          ? acquiredRetrievals.some((retrieval) => retrieval.url === expectedContextSource.url) &&
            supplementalRetrievals.some((value, index) => {
              const retrieval = object(value,
                `${receiptPath}.supplemental_search.retrievals[${index}]`);
              return retrieval.category === "official_mta_route_project" &&
                retrieval.url === expectedContextSource.url && retrieval.status === "acquired";
            }) && expectedContext !== undefined && hasRouteCorridorQuery
          : !hasRouteCorridorQuery;
        const supplementalSourcesExact = nycSourcesExact && mtaSourceExact &&
          stableJson(supplementalUrls) === stableJson(expectedSupplementalUrls) &&
          supplementalRetrievals.length === expectedSupplementalUrls.length &&
          supplementalQueries.length === expectedSupplementalUrls.length;
        if (!isExactQueensPlazaPacketTarget(packet, row) ||
            receipt.missing_binding !== expectedMissingBinding ||
            stableJson(receiptUnresolved) !== stableJson(expectedUnresolvedBindings) ||
            correctionCount !== 0 || contextCount !== (expectedContextSource ? 1 : 0) ||
            sourceFindings.exact_project_route_statement_found !== false ||
            priorOutcome.still_unresolved !== true ||
            priorClaims.exact_route_treatment_binding_proved !== false ||
            priorClaims.exact_segment_binding_proved !== false ||
            priorClaims.date_and_phase_proved !== false ||
            priorClaims.operational_occurrence_identity_proved !== false ||
            !Array.isArray(priorClaims.exact_route_binding_evidence) ||
            priorClaims.exact_route_binding_evidence.length !== 0 ||
            canonicalActions.operational_occurrence_added_or_updated !== false ||
            !Array.isArray(canonicalActions.canonical_links_added) ||
            canonicalActions.canonical_links_added.length !== 0 ||
            !hasExactQuery("official_nyc_dot_lane_project") ||
            !hasExactQuery("official_public_board_committee") ||
            !supplementalSourcesExact || receipt.occurrence_context !== undefined ||
            receipt.authorizes_study !== false || receipt.authorizes_cross_product !== false) {
          throw new Error(`${receiptPath}: Queens Plaza nine-route nonterminal-context review contract does not match the exact candidate`);
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
