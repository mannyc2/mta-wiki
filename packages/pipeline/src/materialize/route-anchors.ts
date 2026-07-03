import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalDbPath, openCanonicalDb } from "@mta-wiki/db/canonical-db";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import { repoRoot } from "@mta-wiki/core/paths";

export type GtfsRoute = {
  route_id: string;
  short_name?: string | null | undefined;
  long_name?: string | null | undefined;
  agency_id?: string | null | undefined;
  borough?: string | null | undefined;
  gtfs_feed_date?: string | undefined;
};

export type RouteAnchorOverrides = Record<string, string>;

export type RouteAnchorRow = {
  gtfs_route_id: string | null;
  canonical_route_record_id: string | null;
  variant_record_ids: string[];
  aliases: string[];
  disposition: string;
  anchor_reason: string | null;
};

const NULL_ROUTE_DISPOSITIONS: Record<string, { disposition: string; reason: string }> = {
  "route_34th-st-sbs": {
    disposition: "sbs_corridor_service_label",
    reason: "Named SBS corridor/service label without a GTFS route id.",
  },
  "route_b3-draft-plan": {
    disposition: "proposal",
    reason: "Draft-plan proposal record tied to B3 planning context rather than an operating GTFS route id.",
  },
  "route_fordham-pelham-pkwy-sbs": {
    disposition: "sbs_corridor_service_label",
    reason: "Named SBS corridor/service label without a GTFS route id.",
  },
  "route_hudson-rail-link": {
    disposition: "non_bus_service",
    reason: "Metro-North feeder service record outside the MTA bus GTFS route set.",
  },
  "route_hylan-blvd-sbs": {
    disposition: "sbs_corridor_service_label",
    reason: "Named SBS corridor/service label without a GTFS route id.",
  },
  "route_lirr-oyster-bay-branch-2023": {
    disposition: "non_bus_service",
    reason: "LIRR branch record outside the MTA bus GTFS route set.",
  },
  "route_meeting-doc-160311-newburgh-beacon-ferry": {
    disposition: "non_bus_service",
    reason: "Ferry service record outside the MTA bus GTFS route set.",
  },
  "route_rockaway-shuttle-167241": {
    disposition: "non_bus_service",
    reason: "Subway shuttle record outside the MTA bus GTFS route set.",
  },
  "route_sim23-sim24-express-bus": {
    disposition: "aggregate_label",
    reason: "Aggregate route-list label covering SIM23 and SIM24 rather than one GTFS route id.",
  },
  "route_woodhaven-crossbay-sbs": {
    disposition: "sbs_corridor_service_label",
    reason: "Named SBS corridor/service label without a GTFS route id.",
  },
};

function stringValue(value: JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayValues(value: JsonValue | undefined): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function lower(value: string | undefined | null) {
  return value?.trim().toLowerCase();
}

function routePayloadId(record: MtaCanonicalRecord) {
  return stringValue(record.payload.route_id);
}

function routeRecordScope(record: MtaCanonicalRecord) {
  return stringValue(record.payload.route_record_scope) ?? "unknown";
}

function sourceCount(record: MtaCanonicalRecord) {
  return new Set([record.source_id, ...(record.source_ids ?? [])].filter(Boolean)).size;
}

function routeLabelMatchesGtfsShortName(record: MtaCanonicalRecord, gtfs: GtfsRoute) {
  const shortName = lower(gtfs.short_name);
  if (!shortName) return false;
  return lower(stringValue(record.payload.route_label)) === shortName || lower(stringValue(record.payload.route_name)) === shortName;
}

function aliasesFor(records: MtaCanonicalRecord[]) {
  const aliases = new Set<string>();
  for (const record of records) {
    for (const field of ["route_id", "route_label", "route_name"] as const) {
      for (const value of stringArrayValues(record.payload[field])) aliases.add(value);
    }
    for (const alias of record.record_aliases ?? []) aliases.add(alias);
  }
  return [...aliases].sort((a, b) => a.localeCompare(b));
}

function chooseAnchor(gtfs: GtfsRoute, candidates: MtaCanonicalRecord[], overrides: RouteAnchorOverrides) {
  const override = overrides[gtfs.route_id];
  if (override) {
    const record = candidates.find((candidate) => candidate.record_id === override);
    if (!record) throw new Error(`Route anchor override for ${gtfs.route_id} points to non-candidate ${override}`);
    return { record, reason: "manual_override" };
  }

  const trueRoutes = candidates.filter((candidate) => routeRecordScope(candidate) === "true_route");
  const eligible = trueRoutes.length > 0 ? trueRoutes : candidates;
  const labelMatch = eligible.filter((candidate) => routeLabelMatchesGtfsShortName(candidate, gtfs)).sort((a, b) => a.record_id.localeCompare(b.record_id))[0];
  if (labelMatch) return { record: labelMatch, reason: "label_matches_gtfs_short_name" };

  const bySourceCount = [...eligible].sort((a, b) => sourceCount(b) - sourceCount(a) || a.record_id.localeCompare(b.record_id));
  const first = bySourceCount[0];
  if (!first) throw new Error(`No route anchor candidates for ${gtfs.route_id}`);
  const second = bySourceCount[1];
  return { record: first, reason: second && sourceCount(second) === sourceCount(first) ? "lexicographic_tiebreak" : "max_source_count" };
}

export function computeRouteAnchors(records: MtaCanonicalRecord[], gtfsRoutes: GtfsRoute[], overrides: RouteAnchorOverrides = {}): RouteAnchorRow[] {
  const routeRecords = records.filter((record) => record.record_kind === "route");
  const rows: RouteAnchorRow[] = [];

  for (const gtfs of [...gtfsRoutes].sort((a, b) => a.route_id.localeCompare(b.route_id))) {
    const routeId = lower(gtfs.route_id);
    const shortName = lower(gtfs.short_name);
    const candidates = routeRecords
      .filter((record) => {
        const id = lower(routePayloadId(record));
        return Boolean(id && (id === routeId || id === shortName));
      })
      .sort((a, b) => a.record_id.localeCompare(b.record_id));

    if (candidates.length === 0) {
      rows.push({
        gtfs_route_id: gtfs.route_id,
        canonical_route_record_id: null,
        variant_record_ids: [],
        aliases: [],
        disposition: "no_wiki_coverage",
        anchor_reason: null,
      });
      continue;
    }

    const { record: anchor, reason } = chooseAnchor(gtfs, candidates, overrides);
    rows.push({
      gtfs_route_id: gtfs.route_id,
      canonical_route_record_id: anchor.record_id,
      variant_record_ids: candidates.filter((candidate) => candidate.record_id !== anchor.record_id).map((candidate) => candidate.record_id).sort(),
      aliases: aliasesFor(candidates),
      disposition: routeRecordScope(anchor),
      anchor_reason: reason,
    });
  }

  for (const record of routeRecords.filter((candidate) => !routePayloadId(candidate)).sort((a, b) => a.record_id.localeCompare(b.record_id))) {
    const disposition = NULL_ROUTE_DISPOSITIONS[record.record_id];
    if (!disposition) throw new Error(`Null-route record ${record.record_id} needs a reviewed route-anchor disposition`);
    rows.push({
      gtfs_route_id: null,
      canonical_route_record_id: record.record_id,
      variant_record_ids: [],
      aliases: aliasesFor([record]),
      disposition: disposition.disposition,
      anchor_reason: disposition.reason,
    });
  }

  return rows.sort((a, b) => {
    if (a.gtfs_route_id && b.gtfs_route_id) return a.gtfs_route_id.localeCompare(b.gtfs_route_id);
    if (a.gtfs_route_id) return -1;
    if (b.gtfs_route_id) return 1;
    return (a.canonical_route_record_id ?? "").localeCompare(b.canonical_route_record_id ?? "");
  });
}

export function routeAnchorsJsonl(rows: RouteAnchorRow[]) {
  return rows.map((row) => stableJson(row as unknown as JsonValue)).join("\n") + (rows.length > 0 ? "\n" : "");
}

export function writeRouteAnchorsJsonl(path: string, rows: RouteAnchorRow[]) {
  writeFileSync(path, routeAnchorsJsonl(rows), "utf8");
}

export function readGtfsRoutesFromDb(path = canonicalDbPath()): GtfsRoute[] {
  const db = openCanonicalDb(path, { readonly: true });
  try {
    return db
      .query("SELECT route_id, short_name, long_name, agency_id, borough, gtfs_feed_date FROM ref_gtfs_routes ORDER BY route_id")
      .all() as GtfsRoute[];
  } finally {
    db.close();
  }
}

export function routeAnchorOverridesPath(rootDir = repoRoot) {
  return join(rootDir, "data", "route-anchor-overrides.json");
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readRouteAnchorOverrides(path = routeAnchorOverridesPath()): RouteAnchorOverrides {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isJsonObject(parsed)) throw new Error(`Invalid route anchor overrides at ${path}: expected object`);
  const overrides = parsed.overrides;
  if (!isJsonObject(overrides)) return {};
  const result: RouteAnchorOverrides = {};
  for (const [routeId, recordId] of Object.entries(overrides)) {
    if (typeof recordId !== "string" || !recordId.trim()) {
      throw new Error(`Invalid route anchor override for ${routeId}: expected non-empty record id`);
    }
    result[routeId] = recordId;
  }
  return result;
}
