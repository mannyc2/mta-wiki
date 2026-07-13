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

export type ReviewedNonGtfsRouteDispositionKind =
  | "aggregate_label"
  | "historical_retired"
  | "non_bus_service"
  | "proposal"
  | "sbs_corridor_service_label";

export type ReviewedNonGtfsRouteDisposition = {
  disposition: ReviewedNonGtfsRouteDispositionKind;
  reason: string;
  expected_route_id: string | null;
};

export type ReviewedNonGtfsRouteDispositions = Record<string, ReviewedNonGtfsRouteDisposition>;

export type RouteAnchorReview = {
  overrides: RouteAnchorOverrides;
  non_gtfs_dispositions: ReviewedNonGtfsRouteDispositions;
};

export type RouteAnchorRow = {
  gtfs_route_id: string | null;
  canonical_route_record_id: string | null;
  variant_record_ids: string[];
  aliases: string[];
  disposition: string;
  anchor_reason: string | null;
};

const REVIEWED_NON_GTFS_DISPOSITIONS: ReviewedNonGtfsRouteDispositions = {
  "route_34th-st-sbs": {
    disposition: "sbs_corridor_service_label",
    reason: "Named SBS corridor/service label without a GTFS route id.",
    expected_route_id: null,
  },
  "route_b3-draft-plan": {
    disposition: "proposal",
    reason: "Draft-plan proposal record tied to B3 planning context rather than an operating GTFS route id.",
    expected_route_id: null,
  },
  "route_fordham-pelham-pkwy-sbs": {
    disposition: "sbs_corridor_service_label",
    reason: "Named SBS corridor/service label without a GTFS route id.",
    expected_route_id: null,
  },
  "route_hudson-rail-link": {
    disposition: "non_bus_service",
    reason: "Metro-North feeder service record outside the MTA bus GTFS route set.",
    expected_route_id: null,
  },
  "route_hylan-blvd-sbs": {
    disposition: "sbs_corridor_service_label",
    reason: "Named SBS corridor/service label without a GTFS route id.",
    expected_route_id: null,
  },
  "route_lirr-oyster-bay-branch-2023": {
    disposition: "non_bus_service",
    reason: "LIRR branch record outside the MTA bus GTFS route set.",
    expected_route_id: null,
  },
  "route_meeting-doc-160311-newburgh-beacon-ferry": {
    disposition: "non_bus_service",
    reason: "Ferry service record outside the MTA bus GTFS route set.",
    expected_route_id: null,
  },
  "route_rockaway-shuttle-167241": {
    disposition: "non_bus_service",
    reason: "Subway shuttle record outside the MTA bus GTFS route set.",
    expected_route_id: null,
  },
  "route_sim23-sim24-express-bus": {
    disposition: "aggregate_label",
    reason: "Aggregate route-list label covering SIM23 and SIM24 rather than one GTFS route id.",
    expected_route_id: null,
  },
  "route_woodhaven-crossbay-sbs": {
    disposition: "sbs_corridor_service_label",
    reason: "Named SBS corridor/service label without a GTFS route id.",
    expected_route_id: null,
  },
};

const REVIEWED_NON_GTFS_DISPOSITION_KINDS = new Set<ReviewedNonGtfsRouteDispositionKind>([
  "aggregate_label",
  "historical_retired",
  "non_bus_service",
  "proposal",
  "sbs_corridor_service_label",
]);

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

function reviewedNonGtfsDispositions(
  records: MtaCanonicalRecord[],
  additions: ReviewedNonGtfsRouteDispositions,
): ReviewedNonGtfsRouteDispositions {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const validate = (recordId: string, disposition: ReviewedNonGtfsRouteDisposition, required: boolean) => {
    const record = recordsById.get(recordId);
    if (!record) {
      if (required) throw new Error(`Reviewed non-GTFS route disposition ${recordId} is stale: canonical record not found`);
      return;
    }
    if (record.record_kind !== "route") {
      throw new Error(`Reviewed non-GTFS route disposition ${recordId} points to ${record.record_kind}, not a route record`);
    }
    const actualRouteId = routePayloadId(record) ?? null;
    if (actualRouteId !== disposition.expected_route_id) {
      throw new Error(
        `Reviewed non-GTFS route disposition ${recordId} is stale: expected route_id ${JSON.stringify(disposition.expected_route_id)}, found ${JSON.stringify(actualRouteId)}`,
      );
    }
    if (actualRouteId !== null && disposition.disposition !== "historical_retired") {
      throw new Error(
        `Reviewed non-GTFS route disposition ${recordId} has literal route_id ${actualRouteId}; disposition must be historical_retired`,
      );
    }
  };

  for (const [recordId, disposition] of Object.entries(REVIEWED_NON_GTFS_DISPOSITIONS)) {
    validate(recordId, disposition, false);
  }
  for (const [recordId, disposition] of Object.entries(additions)) {
    if (Object.hasOwn(REVIEWED_NON_GTFS_DISPOSITIONS, recordId)) {
      throw new Error(`Reviewed non-GTFS route disposition ${recordId} duplicates a built-in reviewed disposition`);
    }
    validate(recordId, disposition, true);
  }
  return { ...REVIEWED_NON_GTFS_DISPOSITIONS, ...additions };
}

export function computeRouteAnchors(
  records: MtaCanonicalRecord[],
  gtfsRoutes: GtfsRoute[],
  overrides: RouteAnchorOverrides = {},
  reviewedDispositionAdditions: ReviewedNonGtfsRouteDispositions = {},
): RouteAnchorRow[] {
  const routeRecords = records.filter((record) => record.record_kind === "route");
  const nonGtfsDispositions = reviewedNonGtfsDispositions(records, reviewedDispositionAdditions);
  const gtfsRouteIds = new Set(gtfsRoutes.map((route) => route.route_id));
  for (const routeId of Object.keys(overrides)) {
    if (!gtfsRouteIds.has(routeId)) {
      throw new Error(`Route anchor override for ${routeId} is stale: GTFS route not found`);
    }
  }
  const rows: RouteAnchorRow[] = [];

  for (const gtfs of [...gtfsRoutes].sort((a, b) => a.route_id.localeCompare(b.route_id))) {
    const routeId = lower(gtfs.route_id);
    const shortName = lower(gtfs.short_name);
    const candidates = routeRecords
      .filter((record) => {
        if (Object.hasOwn(nonGtfsDispositions, record.record_id)) return false;
        const id = lower(routePayloadId(record));
        return Boolean(id && (id === routeId || id === shortName));
      })
      .sort((a, b) => a.record_id.localeCompare(b.record_id));

    if (candidates.length === 0) {
      const override = overrides[gtfs.route_id];
      if (override) throw new Error(`Route anchor override for ${gtfs.route_id} points to non-candidate ${override}`);
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

  for (const record of routeRecords
    .filter((candidate) => !routePayloadId(candidate) || Object.hasOwn(nonGtfsDispositions, candidate.record_id))
    .sort((a, b) => a.record_id.localeCompare(b.record_id))) {
    const disposition = nonGtfsDispositions[record.record_id];
    if (!disposition) throw new Error(`Non-GTFS route record ${record.record_id} needs a reviewed route-anchor disposition`);
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

function assertOnlyKeys(value: JsonObject, allowed: readonly string[], path: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) throw new Error(`Invalid route anchor review at ${path}: unexpected ${unexpected.sort().join(", ")}`);
}

export function readRouteAnchorReview(path = routeAnchorOverridesPath()): RouteAnchorReview {
  if (!existsSync(path)) throw new Error(`Reviewed route-anchor exception file is required: ${path}`);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isJsonObject(parsed)) throw new Error(`Invalid route anchor review at ${path}: expected object`);
  assertOnlyKeys(parsed, ["_doc", "overrides", "non_gtfs_dispositions"], path);
  const overrides = parsed.overrides;
  if (overrides !== undefined && !isJsonObject(overrides)) {
    throw new Error(`Invalid route anchor overrides at ${path}: expected object`);
  }
  const result: RouteAnchorOverrides = {};
  for (const [routeId, recordId] of Object.entries(overrides ?? {})) {
    if (!routeId.trim()) throw new Error(`Invalid route anchor override at ${path}: expected non-empty route id`);
    if (typeof recordId !== "string" || !recordId.trim()) {
      throw new Error(`Invalid route anchor override for ${routeId}: expected non-empty record id`);
    }
    result[routeId] = recordId;
  }

  const dispositionInput = parsed.non_gtfs_dispositions;
  if (dispositionInput !== undefined && !isJsonObject(dispositionInput)) {
    throw new Error(`Invalid reviewed non-GTFS route dispositions at ${path}: expected object`);
  }
  const dispositions: ReviewedNonGtfsRouteDispositions = {};
  for (const [recordId, value] of Object.entries(dispositionInput ?? {})) {
    if (!recordId.trim() || !isJsonObject(value)) {
      throw new Error(`Invalid reviewed non-GTFS route disposition ${recordId || "<empty>"}: expected object`);
    }
    assertOnlyKeys(value, ["disposition", "reason", "expected_route_id"], `${path}#non_gtfs_dispositions.${recordId}`);
    const disposition = value.disposition;
    const reason = value.reason;
    const expectedRouteId = value.expected_route_id;
    if (
      typeof disposition !== "string" ||
      !REVIEWED_NON_GTFS_DISPOSITION_KINDS.has(disposition as ReviewedNonGtfsRouteDispositionKind)
    ) {
      throw new Error(
        `Invalid reviewed non-GTFS route disposition ${recordId}: disposition must be one of ${[...REVIEWED_NON_GTFS_DISPOSITION_KINDS].sort().join(", ")}`,
      );
    }
    if (typeof reason !== "string" || !reason.trim()) {
      throw new Error(`Invalid reviewed non-GTFS route disposition ${recordId}: expected non-empty reason`);
    }
    if (expectedRouteId !== null && (typeof expectedRouteId !== "string" || !expectedRouteId.trim())) {
      throw new Error(`Invalid reviewed non-GTFS route disposition ${recordId}: expected_route_id must be non-empty string or null`);
    }
    dispositions[recordId] = {
      disposition: disposition as ReviewedNonGtfsRouteDispositionKind,
      reason: reason.trim(),
      expected_route_id: expectedRouteId,
    };
  }
  return { overrides: result, non_gtfs_dispositions: dispositions };
}

export function readRouteAnchorOverrides(path = routeAnchorOverridesPath()): RouteAnchorOverrides {
  return readRouteAnchorReview(path).overrides;
}
