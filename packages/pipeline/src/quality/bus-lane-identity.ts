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
const HILLSIDE_PART_ONE_PRIOR_RECEIPTS = new Map([
  ["Q1", "queens-acquisition:ada385860a650d3218a38705"],
  ["Q110", "queens-acquisition:5e146d100dff2cc2f758c879"],
  ["Q111", "queens-acquisition:345ffb76baf84e47b6d86ae6"],
  ["Q112", "queens-acquisition:9c7e954011a220e48a521f88"],
  ["Q113", "queens-acquisition:13c19be0a4c83a7edd8f1a3f"],
  ["Q114", "queens-acquisition:70dfff7a22d1dddb116656a6"],
  ["Q115", "queens-acquisition:8c732e0dbf518cb06f6337ed"],
  ["Q17", "queens-acquisition:f76f0f7549a18aa4f1ea7385"],
  ["Q2", "queens-acquisition:186c22b126041c4ceebf827a"],
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
  "Q110", "Q111", "Q112", "Q113", "Q114", "Q115", "Q25", "Q27", "Q44+", "Q65", "Q83",
]);

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

function isExactHillsidePartOnePacketTarget(
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
  return HILLSIDE_PART_ONE_PRIOR_RECEIPTS.has(row.gtfs_route_id) &&
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
    const hillsidePartOneLedgerTarget = row.implementation_date === "2025-09-15" &&
      row.onset_evidence.target_groups.length === 1 &&
      row.onset_evidence.target_groups[0]?.lane_group_id === "QNS|HILLSIDE AVENUE" &&
      HILLSIDE_PART_ONE_PRIOR_RECEIPTS.has(row.gtfs_route_id);
    if (hillsidePartOneLedgerTarget &&
        stableJson(packet.what_is_known.target_groups) !== stableJson(row.onset_evidence.target_groups)) {
      throw new Error(`${receiptPath}: Hillside Avenue packet target does not preserve exact ledger occurrence parity`);
    }
    if (hillsidePartOneLedgerTarget &&
        stableJson(packet.what_is_known.dossier_refs) !== stableJson(row.dossier_refs)) {
      throw new Error(`${receiptPath}: Hillside Avenue packet dossier does not preserve exact ledger evidence parity`);
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
    if (hillsidePartOneLedgerTarget) {
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
      if (!isExactHillsidePartOnePacketTarget(packet, row) ||
          priorPointer.receipt_id !== HILLSIDE_PART_ONE_PRIOR_RECEIPTS.get(row.gtfs_route_id) ||
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
        throw new Error(`${receiptPath}: Hillside Avenue part-one absence contract does not match the exact candidate`);
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
