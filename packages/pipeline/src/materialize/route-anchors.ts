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

export type ReviewedRouteDecisionMetadata = {
  decision_id: string;
  evidence_ids: string[];
  reviewed_at: string;
  review_state: "approved";
};

export type ReviewedRouteAnchorOverride = ReviewedRouteDecisionMetadata & {
  canonical_route_record_id?: string | undefined;
  additional_variant_record_ids: string[];
  expected_route_ids: Record<string, string | null>;
  reason: string;
};

export type RouteAnchorOverrides = Record<string, ReviewedRouteAnchorOverride>;

export type ReviewedNonGtfsRouteDispositionKind =
  | "aggregate_label"
  | "corridor_service_label"
  | "external_bus_service"
  | "historical_retired"
  | "historical_service_identity"
  | "non_bus_service"
  | "proposal"
  | "sbs_corridor_service_label"
  | "temporary_service";

export type ReviewedNonGtfsRouteDisposition = ReviewedRouteDecisionMetadata & {
  disposition: ReviewedNonGtfsRouteDispositionKind;
  reason: string;
  expected_route_id: string | null;
  study_projectable: false;
};

export type ReviewedNonGtfsRouteDispositions = Record<string, ReviewedNonGtfsRouteDisposition>;

export type RouteAnchorReview = {
  schema_version: 1;
  contract_id: "route-identity-dispositions-v1";
  gtfs_feed: {
    feed_date: string;
    route_count: number;
    routes_sha256: string;
  };
  sbs_plus_successor_rule: {
    rule_id: "unique-sbs-plus-successor-v1";
    description: string;
  };
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

const REVIEWED_NON_GTFS_DISPOSITION_KINDS = new Set<ReviewedNonGtfsRouteDispositionKind>([
  "aggregate_label",
  "corridor_service_label",
  "external_bus_service",
  "historical_retired",
  "historical_service_identity",
  "non_bus_service",
  "proposal",
  "sbs_corridor_service_label",
  "temporary_service",
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
  const override = overrides[gtfs.route_id]?.canonical_route_record_id;
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

function assertDecisionMetadata(path: string, value: ReviewedRouteDecisionMetadata): void {
  if (!value.decision_id.trim()) throw new Error(`${path} needs a non-empty decision_id`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value.reviewed_at)) throw new Error(`${path} reviewed_at must be YYYY-MM-DD`);
  if (value.review_state !== "approved") throw new Error(`${path} review_state must be approved`);
  if (value.evidence_ids.length === 0 || value.evidence_ids.some((evidenceId) => !evidenceId.trim())) {
    throw new Error(`${path} needs at least one non-empty evidence_id`);
  }
  if (new Set(value.evidence_ids).size !== value.evidence_ids.length) throw new Error(`${path} has duplicate evidence_ids`);
}

function assertEvidenceIds(record: MtaCanonicalRecord, evidenceIds: readonly string[], path: string): void {
  const recordEvidenceIds = new Set(record.evidence_refs.map((ref) => ref.evidence_id).filter((id): id is string => Boolean(id)));
  const missing = evidenceIds.filter((evidenceId) => !recordEvidenceIds.has(evidenceId));
  if (missing.length > 0) {
    throw new Error(`${path} cites evidence not bound to ${record.record_id}: ${missing.sort().join(", ")}`);
  }
}

function reviewedNonGtfsDispositions(
  records: MtaCanonicalRecord[],
  additions: ReviewedNonGtfsRouteDispositions,
): ReviewedNonGtfsRouteDispositions {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const decisionIds = new Set<string>();
  const validate = (recordId: string, disposition: ReviewedNonGtfsRouteDisposition) => {
    const record = recordsById.get(recordId);
    if (!record) throw new Error(`Reviewed non-GTFS route disposition ${recordId} is stale: canonical record not found`);
    if (record.record_kind !== "route") {
      throw new Error(`Reviewed non-GTFS route disposition ${recordId} points to ${record.record_kind}, not a route record`);
    }
    assertDecisionMetadata(`Reviewed non-GTFS route disposition ${recordId}`, disposition);
    if (decisionIds.has(disposition.decision_id)) {
      throw new Error(`Reviewed route decision_id ${disposition.decision_id} is duplicated`);
    }
    decisionIds.add(disposition.decision_id);
    if (disposition.study_projectable !== false) {
      throw new Error(`Reviewed non-GTFS route disposition ${recordId} must set study_projectable false`);
    }
    if (!REVIEWED_NON_GTFS_DISPOSITION_KINDS.has(disposition.disposition)) {
      throw new Error(`Reviewed non-GTFS route disposition ${recordId} has unsupported disposition ${disposition.disposition}`);
    }
    if (!disposition.reason.trim()) throw new Error(`Reviewed non-GTFS route disposition ${recordId} needs a reason`);
    const actualRouteId = routePayloadId(record) ?? null;
    if (actualRouteId !== disposition.expected_route_id) {
      throw new Error(
        `Reviewed non-GTFS route disposition ${recordId} is stale: expected route_id ${JSON.stringify(disposition.expected_route_id)}, found ${JSON.stringify(actualRouteId)}`,
      );
    }
    assertEvidenceIds(record, disposition.evidence_ids, `Reviewed non-GTFS route disposition ${recordId}`);
  };

  for (const [recordId, disposition] of Object.entries(additions)) {
    validate(recordId, disposition);
  }
  return { ...additions };
}

export function computeRouteAnchors(
  records: MtaCanonicalRecord[],
  gtfsRoutes: GtfsRoute[],
  overrides: RouteAnchorOverrides = {},
  reviewedDispositionAdditions: ReviewedNonGtfsRouteDispositions = {},
): RouteAnchorRow[] {
  const routeRecords = records.filter((record) => record.record_kind === "route").sort((a, b) => a.record_id.localeCompare(b.record_id));
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const nonGtfsDispositions = reviewedNonGtfsDispositions(records, reviewedDispositionAdditions);
  const sortedGtfsRoutes = [...gtfsRoutes].sort((a, b) => a.route_id.localeCompare(b.route_id));
  const gtfsRouteIds = new Set(sortedGtfsRoutes.map((route) => route.route_id));
  const decisionIds = new Set(Object.values(nonGtfsDispositions).map((decision) => decision.decision_id));
  const reviewedGtfsByRecord = new Map<string, string>();

  for (const [routeId, overrideValue] of Object.entries(overrides).sort(([left], [right]) => left.localeCompare(right))) {
    if (!gtfsRouteIds.has(routeId)) {
      throw new Error(`Route anchor override for ${routeId} is stale: GTFS route not found`);
    }
    const override = overrideValue;
    assertDecisionMetadata(`Route anchor override for ${routeId}`, override);
    if (decisionIds.has(override.decision_id)) throw new Error(`Reviewed route decision_id ${override.decision_id} is duplicated`);
    decisionIds.add(override.decision_id);
    if (!override.reason.trim()) throw new Error(`Route anchor override for ${routeId} needs a reason`);

    const reviewedRecordIds = [
      ...(override.canonical_route_record_id ? [override.canonical_route_record_id] : []),
      ...override.additional_variant_record_ids,
    ];
    if (reviewedRecordIds.length === 0) throw new Error(`Route anchor override for ${routeId} reviews no route records`);
    if (new Set(reviewedRecordIds).size !== reviewedRecordIds.length) {
      throw new Error(`Route anchor override for ${routeId} repeats a reviewed record id`);
    }
    const expectedRecordIds = Object.keys(override.expected_route_ids).sort();
    if (expectedRecordIds.join("\n") !== [...reviewedRecordIds].sort().join("\n")) {
      throw new Error(`Route anchor override for ${routeId} expected_route_ids must cover exactly its reviewed records`);
    }

    const reviewedEvidenceIds = new Set<string>();
    for (const recordId of reviewedRecordIds) {
      const record = recordsById.get(recordId);
      if (!record) throw new Error(`Route anchor override for ${routeId} is stale: canonical record ${recordId} not found`);
      if (record.record_kind !== "route") {
        throw new Error(`Route anchor override for ${routeId} points to ${record.record_kind} ${recordId}, not a route record`);
      }
      const expectedRouteId = override.expected_route_ids[recordId] ?? null;
      const actualRouteId = routePayloadId(record) ?? null;
      if (expectedRouteId !== actualRouteId) {
        throw new Error(
          `Route anchor override for ${routeId} is stale for ${recordId}: expected route_id ${JSON.stringify(expectedRouteId)}, found ${JSON.stringify(actualRouteId)}`,
        );
      }
      const recordEvidence = override.evidence_ids.filter((evidenceId) =>
        record.evidence_refs.some((ref) => ref.evidence_id === evidenceId),
      );
      if (recordEvidence.length === 0) throw new Error(`Route anchor override for ${routeId} has no evidence bound to ${recordId}`);
      for (const evidenceId of recordEvidence) reviewedEvidenceIds.add(evidenceId);
      if (Object.hasOwn(nonGtfsDispositions, recordId)) {
        throw new Error(`Route anchor override for ${routeId} also disposes ${recordId} as non-projectable`);
      }
      const previous = reviewedGtfsByRecord.get(recordId);
      if (previous && previous !== routeId) {
        throw new Error(`Reviewed route record ${recordId} is bound to multiple GTFS routes: ${previous}, ${routeId}`);
      }
      reviewedGtfsByRecord.set(recordId, routeId);
    }
    const unboundEvidenceIds = override.evidence_ids.filter((evidenceId) => !reviewedEvidenceIds.has(evidenceId));
    if (unboundEvidenceIds.length > 0) {
      throw new Error(
        `Route anchor override for ${routeId} cites evidence not bound to any reviewed record: ${unboundEvidenceIds.sort().join(", ")}`,
      );
    }
  }

  type MatchReason = "exact_gtfs_id_or_short_name" | "reviewed_override" | "unique_sbs_plus_successor";
  const gtfsByRecord = new Map<string, string>();
  const matchReasonByRecord = new Map<string, MatchReason>();
  for (const record of routeRecords) {
    if (Object.hasOwn(nonGtfsDispositions, record.record_id)) continue;
    const reviewedGtfsRouteId = reviewedGtfsByRecord.get(record.record_id);
    if (reviewedGtfsRouteId) {
      gtfsByRecord.set(record.record_id, reviewedGtfsRouteId);
      matchReasonByRecord.set(record.record_id, "reviewed_override");
      continue;
    }

    const payloadId = lower(routePayloadId(record));
    if (!payloadId) continue;
    const exactMatches = sortedGtfsRoutes.filter((gtfs) => payloadId === lower(gtfs.route_id) || payloadId === lower(gtfs.short_name));
    if (exactMatches.length > 1) {
      throw new Error(
        `Canonical route record ${record.record_id} ambiguously matches GTFS routes ${exactMatches.map((gtfs) => gtfs.route_id).join(", ")}; add a reviewed override or non-projectable disposition`,
      );
    }
    if (exactMatches[0]) {
      gtfsByRecord.set(record.record_id, exactMatches[0].route_id);
      matchReasonByRecord.set(record.record_id, "exact_gtfs_id_or_short_name");
      continue;
    }

    // v1 conservative successor rule: when no exact bus GTFS route remains, a
    // source-literal base route id may bind to the sole current terminal-`+`
    // route whose id becomes identical after removing only that suffix. This
    // deliberately does not strip Local/LTD/E, split A/B branches, punctuation,
    // or arbitrary SBS text; those cases require a reviewed override.
    const sbsSuccessorMatches = sortedGtfsRoutes.filter((gtfs) => {
      const gtfsId = lower(gtfs.route_id);
      return Boolean(gtfsId?.endsWith("+") && gtfsId.slice(0, -1) === payloadId);
    });
    if (sbsSuccessorMatches.length > 1) {
      throw new Error(
        `Canonical route record ${record.record_id} ambiguously matches SBS successor routes ${sbsSuccessorMatches.map((gtfs) => gtfs.route_id).join(", ")}; add a reviewed override or non-projectable disposition`,
      );
    }
    if (sbsSuccessorMatches[0]) {
      gtfsByRecord.set(record.record_id, sbsSuccessorMatches[0].route_id);
      matchReasonByRecord.set(record.record_id, "unique_sbs_plus_successor");
    }
  }

  const unaccounted = routeRecords
    .filter((record) => !gtfsByRecord.has(record.record_id) && !Object.hasOwn(nonGtfsDispositions, record.record_id))
    .map((record) => record.record_id);
  if (unaccounted.length > 0) {
    throw new Error(
      `Route-anchor exhaustiveness violation: ${unaccounted.length} canonical route record(s) have neither a GTFS anchor/variant nor a reviewed non-projectable disposition: ${unaccounted.join(", ")}`,
    );
  }

  const rows: RouteAnchorRow[] = [];
  for (const gtfs of sortedGtfsRoutes) {
    const candidates = routeRecords.filter((record) => gtfsByRecord.get(record.record_id) === gtfs.route_id);

    if (candidates.length === 0) {
      const override = overrides[gtfs.route_id]?.canonical_route_record_id;
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

    const { record: anchor, reason: selectionReason } = chooseAnchor(gtfs, candidates, overrides);
    const matchReasons = new Set(candidates.map((record) => matchReasonByRecord.get(record.record_id)));
    const reason =
      matchReasons.size === 1 && matchReasons.has("unique_sbs_plus_successor")
        ? `unique_sbs_plus_successor:${selectionReason}`
        : selectionReason;
    rows.push({
      gtfs_route_id: gtfs.route_id,
      canonical_route_record_id: anchor.record_id,
      variant_record_ids: candidates.filter((candidate) => candidate.record_id !== anchor.record_id).map((candidate) => candidate.record_id).sort(),
      aliases: aliasesFor(candidates),
      disposition: routeRecordScope(anchor),
      anchor_reason: reason,
    });
  }

  for (const record of routeRecords.filter((candidate) => Object.hasOwn(nonGtfsDispositions, candidate.record_id))) {
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

  const sortedRows = rows.sort((a, b) => {
    if (a.gtfs_route_id && b.gtfs_route_id) return a.gtfs_route_id.localeCompare(b.gtfs_route_id);
    if (a.gtfs_route_id) return -1;
    if (b.gtfs_route_id) return 1;
    return (a.canonical_route_record_id ?? "").localeCompare(b.canonical_route_record_id ?? "");
  });

  const accountingCounts = new Map<string, number>();
  for (const row of sortedRows) {
    for (const recordId of [row.canonical_route_record_id, ...row.variant_record_ids]) {
      if (recordId) accountingCounts.set(recordId, (accountingCounts.get(recordId) ?? 0) + 1);
    }
  }
  const invalidAccounting = routeRecords
    .map((record) => ({ record_id: record.record_id, count: accountingCounts.get(record.record_id) ?? 0 }))
    .filter((entry) => entry.count !== 1);
  if (invalidAccounting.length > 0) {
    throw new Error(
      `Route-anchor accounting violation: ${invalidAccounting.map((entry) => `${entry.record_id}=${entry.count}`).join(", ")}`,
    );
  }
  return sortedRows;
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
  return join(rootDir, "data", "relationship-integrity", "dispositions", "v1", "routes", "review.json");
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertOnlyKeys(value: JsonObject, allowed: readonly string[], path: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) throw new Error(`Invalid route anchor review at ${path}: unexpected ${unexpected.sort().join(", ")}`);
}

function reviewString(value: JsonValue | undefined, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid route anchor review at ${path}: expected non-empty string`);
  return value.trim();
}

function reviewStringArray(value: JsonValue | undefined, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Invalid route anchor review at ${path}: expected array of non-empty strings`);
  }
  const result = value.map((item) => String(item).trim());
  if (new Set(result).size !== result.length) throw new Error(`Invalid route anchor review at ${path}: duplicate values`);
  return result;
}

function reviewDecisionMetadata(value: JsonObject, path: string): ReviewedRouteDecisionMetadata {
  const decisionId = reviewString(value.decision_id, `${path}.decision_id`);
  const evidenceIds = reviewStringArray(value.evidence_ids, `${path}.evidence_ids`);
  const reviewedAt = reviewString(value.reviewed_at, `${path}.reviewed_at`);
  const reviewState = reviewString(value.review_state, `${path}.review_state`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(reviewedAt)) {
    throw new Error(`Invalid route anchor review at ${path}.reviewed_at: expected YYYY-MM-DD`);
  }
  if (reviewState !== "approved") throw new Error(`Invalid route anchor review at ${path}.review_state: expected approved`);
  return { decision_id: decisionId, evidence_ids: evidenceIds, reviewed_at: reviewedAt, review_state: "approved" };
}

export function readRouteAnchorReview(path = routeAnchorOverridesPath()): RouteAnchorReview {
  if (!existsSync(path)) throw new Error(`Reviewed route-anchor exception file is required: ${path}`);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isJsonObject(parsed)) throw new Error(`Invalid route anchor review at ${path}: expected object`);
  assertOnlyKeys(
    parsed,
    ["_doc", "schema_version", "contract_id", "gtfs_feed", "sbs_plus_successor_rule", "overrides", "non_gtfs_dispositions"],
    path,
  );
  if (parsed.schema_version !== 1) throw new Error(`Invalid route anchor review at ${path}: schema_version must be 1`);
  if (parsed.contract_id !== "route-identity-dispositions-v1") {
    throw new Error(`Invalid route anchor review at ${path}: contract_id must be route-identity-dispositions-v1`);
  }

  if (!isJsonObject(parsed.gtfs_feed)) throw new Error(`Invalid route anchor review at ${path}#gtfs_feed: expected object`);
  assertOnlyKeys(parsed.gtfs_feed, ["feed_date", "route_count", "routes_sha256"], `${path}#gtfs_feed`);
  const feedDate = reviewString(parsed.gtfs_feed.feed_date, `${path}#gtfs_feed.feed_date`);
  const routeCount = parsed.gtfs_feed.route_count;
  if (typeof routeCount !== "number" || !Number.isSafeInteger(routeCount) || routeCount < 1) {
    throw new Error(`Invalid route anchor review at ${path}#gtfs_feed.route_count: expected positive integer`);
  }
  const routesSha256 = reviewString(parsed.gtfs_feed.routes_sha256, `${path}#gtfs_feed.routes_sha256`);
  if (!/^[a-f0-9]{64}$/u.test(routesSha256)) {
    throw new Error(`Invalid route anchor review at ${path}#gtfs_feed.routes_sha256: expected SHA-256 hex`);
  }

  if (!isJsonObject(parsed.sbs_plus_successor_rule)) {
    throw new Error(`Invalid route anchor review at ${path}#sbs_plus_successor_rule: expected object`);
  }
  assertOnlyKeys(parsed.sbs_plus_successor_rule, ["rule_id", "description"], `${path}#sbs_plus_successor_rule`);
  if (parsed.sbs_plus_successor_rule.rule_id !== "unique-sbs-plus-successor-v1") {
    throw new Error(`Invalid route anchor review at ${path}#sbs_plus_successor_rule.rule_id`);
  }
  const ruleDescription = reviewString(
    parsed.sbs_plus_successor_rule.description,
    `${path}#sbs_plus_successor_rule.description`,
  );

  const overrides = parsed.overrides;
  if (!isJsonObject(overrides)) {
    throw new Error(`Invalid route anchor overrides at ${path}: expected object`);
  }
  const result: RouteAnchorOverrides = {};
  const decisionIds = new Set<string>();
  for (const [routeId, value] of Object.entries(overrides)) {
    if (!routeId.trim()) throw new Error(`Invalid route anchor override at ${path}: expected non-empty route id`);
    if (!isJsonObject(value)) throw new Error(`Invalid route anchor override for ${routeId}: expected reviewed object`);
    const decisionPath = `${path}#overrides.${routeId}`;
    assertOnlyKeys(
      value,
      [
        "decision_id",
        "evidence_ids",
        "reviewed_at",
        "review_state",
        "canonical_route_record_id",
        "additional_variant_record_ids",
        "expected_route_ids",
        "reason",
      ],
      decisionPath,
    );
    const metadata = reviewDecisionMetadata(value, decisionPath);
    if (decisionIds.has(metadata.decision_id)) throw new Error(`Invalid route anchor review: duplicate decision_id ${metadata.decision_id}`);
    decisionIds.add(metadata.decision_id);
    const canonicalRouteRecordId =
      value.canonical_route_record_id === undefined
        ? undefined
        : reviewString(value.canonical_route_record_id, `${decisionPath}.canonical_route_record_id`);
    const additionalVariantRecordIds = reviewStringArray(
      value.additional_variant_record_ids,
      `${decisionPath}.additional_variant_record_ids`,
    );
    if (!isJsonObject(value.expected_route_ids)) {
      throw new Error(`Invalid route anchor review at ${decisionPath}.expected_route_ids: expected object`);
    }
    const expectedRouteIds: Record<string, string | null> = {};
    for (const [recordId, expectedRouteId] of Object.entries(value.expected_route_ids)) {
      if (!recordId.trim() || (expectedRouteId !== null && (typeof expectedRouteId !== "string" || !expectedRouteId.trim()))) {
        throw new Error(`Invalid route anchor review at ${decisionPath}.expected_route_ids.${recordId || "<empty>"}`);
      }
      expectedRouteIds[recordId] = expectedRouteId === null ? null : expectedRouteId.trim();
    }
    result[routeId] = {
      ...metadata,
      ...(canonicalRouteRecordId ? { canonical_route_record_id: canonicalRouteRecordId } : {}),
      additional_variant_record_ids: additionalVariantRecordIds,
      expected_route_ids: expectedRouteIds,
      reason: reviewString(value.reason, `${decisionPath}.reason`),
    };
  }

  const dispositionInput = parsed.non_gtfs_dispositions;
  if (!isJsonObject(dispositionInput)) {
    throw new Error(`Invalid reviewed non-GTFS route dispositions at ${path}: expected object`);
  }
  const dispositions: ReviewedNonGtfsRouteDispositions = {};
  for (const [recordId, value] of Object.entries(dispositionInput)) {
    if (!recordId.trim() || !isJsonObject(value)) {
      throw new Error(`Invalid reviewed non-GTFS route disposition ${recordId || "<empty>"}: expected object`);
    }
    const decisionPath = `${path}#non_gtfs_dispositions.${recordId}`;
    assertOnlyKeys(
      value,
      [
        "decision_id",
        "evidence_ids",
        "reviewed_at",
        "review_state",
        "disposition",
        "reason",
        "expected_route_id",
        "study_projectable",
      ],
      decisionPath,
    );
    const metadata = reviewDecisionMetadata(value, decisionPath);
    if (decisionIds.has(metadata.decision_id)) throw new Error(`Invalid route anchor review: duplicate decision_id ${metadata.decision_id}`);
    decisionIds.add(metadata.decision_id);
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
    if (value.study_projectable !== false) {
      throw new Error(`Invalid reviewed non-GTFS route disposition ${recordId}: study_projectable must be false`);
    }
    dispositions[recordId] = {
      ...metadata,
      disposition: disposition as ReviewedNonGtfsRouteDispositionKind,
      reason: reason.trim(),
      expected_route_id: expectedRouteId === null ? null : expectedRouteId.trim(),
      study_projectable: false,
    };
  }
  return {
    schema_version: 1,
    contract_id: "route-identity-dispositions-v1",
    gtfs_feed: { feed_date: feedDate, route_count: routeCount, routes_sha256: routesSha256 },
    sbs_plus_successor_rule: { rule_id: "unique-sbs-plus-successor-v1", description: ruleDescription },
    overrides: result,
    non_gtfs_dispositions: dispositions,
  };
}

export function readRouteAnchorOverrides(path = routeAnchorOverridesPath()): RouteAnchorOverrides {
  return readRouteAnchorReview(path).overrides;
}
