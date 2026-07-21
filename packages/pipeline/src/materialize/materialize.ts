import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  canonicalIdentityForInput,
  canonicalRecordIdForInput,
  identityKeysForInput,
  identityOverrideTarget,
  isGlobalRecordKind,
  pruneUnderSpecifiedIdentityKeys,
  recordBaseIdForInput,
} from "@mta-wiki/db/identity";
import { rebuildCanonicalDb } from "@mta-wiki/db/canonical-db";
import { loadRelationshipContract, relationshipContractValidationMode } from "@mta-wiki/db/relationship-contract";
import { canonicalDir, FILE_BY_KIND } from "@mta-wiki/pipeline/materialize/canonical-read";
import { withDerivedRelations } from "@mta-wiki/pipeline/records/derived-relations";
import { withSourceDateBackfill } from "@mta-wiki/pipeline/sources/source-date-backfill";
import { withAssertionQualifiers } from "@mta-wiki/pipeline/records/assertion-qualifiers";
import { normalizeRelationPayload, type RelationEndpointKinds } from "@mta-wiki/pipeline/records/relations";
import { auditRelationshipGraph } from "@mta-wiki/pipeline/records/relationship-integrity";
import { readSemanticCorrections, readSemanticCorrectionSupersessions, semanticSupersessionIdentities, withSemanticCorrections } from "@mta-wiki/pipeline/records/semantic-corrections";
import { stableHash } from "@mta-wiki/db/stable-json";
import { retiredSubmissionIds } from "@mta-wiki/pipeline/records/submission-overrides";
import { normalizeSubmitInput, readSubmissionEntries, relationEndpointIssues, validateSubmitInput } from "@mta-wiki/pipeline/records/submissions";
import { normalizeObservationPayload, type NormalizationContext } from "@mta-wiki/pipeline/ontology/normalizers";
import { sourceDocumentMarkdown } from "@mta-wiki/pipeline/sources/source-packet";
import { sourceBlocksPath } from "@mta-wiki/pipeline/sources/source-prep";
import { relationshipCompletenessForMaterialization } from "@mta-wiki/pipeline/quality/relationship-completeness-boundary";
import {
  buildEvidenceBlockIndexEntries,
  writeEvidenceBlockIndex,
  type EvidenceBlockIndex,
} from "@mta-wiki/pipeline/sources/evidence-block-index";
import type { JsonObject, JsonValue, MaterializeResult, MtaCanonicalRecord, MtaEvidenceRef, MtaObservationKind, MtaSubmissionEntry, MtaSubmitObservationInput } from "@mta-wiki/db/types";

const CANONICAL_KINDS = [
  "source",
  "entity",
  "project",
  "corridor",
  "route",
  "treatment_component",
  "event",
  "claim",
  "metric_claim",
  "table",
  "source_gap",
  "relation",
] as const;

const PAGE_DIR_BY_KIND: Partial<Record<MtaCanonicalRecord["record_kind"], string>> = {
  source: "sources",
  entity: "entities",
  project: "projects",
  corridor: "corridors",
  route: "routes",
  source_gap: "gaps",
};

// Open-world entities recur across sources and should be one shared page, not one per source.
// The identity module owns alias handling so the materializer, ingest tools, and validator agree.

const MAX_NORMALIZATION_CONTEXT_BLOCK_REFS = 8;
const MAX_NORMALIZATION_CONTEXT_BLOCK_CHARS = 12_000;
const MAX_NORMALIZATION_CONTEXT_BLOCK_CHARS_PER_REF = 4_000;
const NORMALIZATION_CONTEXT_SOURCE_CACHE_SIZE = 1;

type NormalizationContextBlock = {
  block_id: string;
  page_number: number;
  raw_text: string;
  source_surface: string | undefined;
};

type NormalizationContextSource = {
  blocks: NormalizationContextBlock[];
  byId: Map<string, NormalizationContextBlock>;
};

const normalizationContextSourceCache = new Map<string, NormalizationContextSource>();
const normalizationContextBlockTextCache = new Map<string, string>();

export type RouteRecordScope = "true_route" | "aggregate_list_context" | "data_only_scope" | "split_candidate";
export type RouteRecordScopeReason =
  | "m14_ad_exception"
  | "routes_array_aggregate"
  | "count_only_route_scope_text"
  | "same_base_branch_route_id"
  | "slash_route_surface"
  | "merged_slash_route_surface"
  | "merged_service_variant_conflict"
  | "local_limited_bundle_compatible"
  | "local_limited_bus_classifier_artifact"
  | "local_sbs_context_spillover"
  | "neighbor_ltd_classifier_spillover"
  | "sbs_local_upgrade_compatible"
  | "local_limited_bundle_limited_context_compatible"
  | "renamed_route_predecessor_compatible"
  | "predecessor_successor_lifecycle_compatible"
  | "default_true_route";

function stringValue(value: JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizedToken(value: string) {
  return value
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function stringArrayValues(value: JsonValue | undefined): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function normalizedRouteScopeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9/]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function isM14AdRouteSurface(value: string) {
  return /\bm\s*14\s*(?:a\s*\/\s*d|a\s*d|ad)\b/iu.test(value);
}

function hasSlashRouteSurface(value: string | undefined) {
  if (!value || isM14AdRouteSurface(value)) return false;
  return /\b(?:sim|bx|[bmqsx])\s*-?\s*\d{1,3}[a-z]?\s*\/\s*(?:(?:sim|bx|[bmqsx])\s*-?\s*)?(?:\d{1,3}[a-z]?|[a-z])\b/iu.test(value);
}

function isSameBaseBranchRouteId(value: string | undefined) {
  if (!value || isM14AdRouteSurface(value)) return false;
  return /^(?:sim|bx|[bmqsx])\s*-?\s*\d{1,3}[a-z]\s*\/\s*[a-z]$/iu.test(value.trim());
}

function countOnlyRouteScopeText(value: string | undefined) {
  if (!value) return false;
  return /\b\d+\s+(?:[a-z]+\s+){0,4}routes?\b/u.test(normalizedRouteScopeText(value));
}

function mergedRouteIdentityValues(payload: JsonObject) {
  const merged = payload._merged_field_values;
  if (!isJsonObject(merged)) return [];
  return ["route_id", "route_label", "route_name", "route", "internal_route_id"].flatMap((field) => stringArrayValues(merged[field]));
}

function hasServiceVariantIdentitySurface(value: string | undefined) {
  if (!value) return false;
  return /\b(?:select bus service|sbs|ltd|limited(?: stop)?|express)\b/u.test(normalizedRouteScopeText(value));
}

function hasLimitedOrExpressIdentitySurface(value: string | undefined) {
  if (!value) return false;
  return /\b(?:ltd|limited(?: stop)?|express)\b/u.test(normalizedRouteScopeText(value));
}

function descriptionValues(payload: JsonObject) {
  const merged = payload._merged_field_values;
  return [
    ...stringArrayValues(payload.description),
    ...stringArrayValues(payload.note),
    ...(isJsonObject(merged) ? stringArrayValues(merged.description) : []),
    ...(isJsonObject(merged) ? stringArrayValues(merged.note) : []),
  ];
}

function normalizedEvidenceText(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function routeTokensFromText(value: string | undefined) {
  if (!value) return [];
  const tokens = new Set<string>();
  for (const match of normalizedEvidenceText(value).matchAll(/\b(?:SIM|BX|[BMQS])\s*\d{1,3}[A-Z]?\b/gu)) {
    tokens.add(match[0]!.replace(/\s+/gu, ""));
  }
  return [...tokens];
}

function hasSingleStructuredRouteIdentity(payload: JsonObject, structuredValues: (string | undefined)[]) {
  if (stringArrayValues(payload.routes).length > 1) return false;
  if (structuredValues.some(hasSlashRouteSurface)) return false;

  const tokens = new Set<string>();
  for (const value of structuredValues) {
    for (const token of routeTokensFromText(value)) {
      tokens.add(token);
    }
  }
  return tokens.size === 1;
}

function textHasRouteRenameLineage(value: string, predecessorToken: string, currentToken: string) {
  const text = normalizedEvidenceText(value);
  const predecessor = predecessorToken.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const current = currentToken.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return (
    new RegExp(`\\b${predecessor}\\b.{0,80}\\bRENAM(?:ED|E|ING)\\b.{0,80}\\b${current}\\b`, "u").test(text) ||
    new RegExp(`\\b${current}\\b.{0,80}\\bRENAMED\\b.{0,20}\\bFROM\\b.{0,20}\\b${predecessor}\\b`, "u").test(text) ||
    new RegExp(`\\bFORMERLY\\b.{0,20}\\b${predecessor}\\b.{0,80}\\bRENAM(?:ED|E|ING)\\b.{0,80}\\b${current}\\b`, "u").test(text)
  );
}

function textHasRouteToken(value: string, routeToken: string) {
  const text = normalizedEvidenceText(value);
  const token = routeToken.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`\\b${token}\\b`, "u").test(text);
}

function textHasRouteLimitedIdentitySurface(value: string, routeToken: string) {
  const text = normalizedEvidenceText(value);
  const token = routeToken.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`\\b${token}\\s*(?:LTD|LIMITED)\\b`, "u").test(text);
}

function textHasRouteSbsIdentitySurface(value: string, routeToken: string) {
  const text = normalizedEvidenceText(value);
  const token = routeToken.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return (
    new RegExp(`\\b${token}\\s*(?:SBS|SELECT\\s+BUS\\s+SERVICE)\\b`, "u").test(text) ||
    new RegExp(`\\b(?:SBS|SELECT\\s+BUS\\s+SERVICE)\\s+${token}\\b`, "u").test(text)
  );
}

function routeEvidenceValues(record: MtaCanonicalRecord, payload: JsonObject) {
  return [
    ...descriptionValues(payload),
    ...record.evidence_refs.map((ref) => ref.source_quote).filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  ];
}

type RouteVariantBucket = "sbs" | "local" | "local_limited" | "limited_stop" | "express";

function normalizedRouteVariant(value: string | undefined): RouteVariantBucket | undefined {
  if (!value) return undefined;
  const normalized = normalizedRouteScopeText(value);
  if (/\blocal\b/u.test(normalized) && /\b(?:limited stop|limited|ltd)\b/u.test(normalized)) return "local_limited";
  if (/\b(?:select bus service|sbs)\b/u.test(normalized)) return "sbs";
  if (/\b(?:limited stop|limited|ltd)\b/u.test(normalized)) return "limited_stop";
  if (/\blocal(?: bus)?\b/u.test(normalized)) return "local";
  if (/\bexpress(?: bus)?\b/u.test(normalized)) return "express";
  return undefined;
}

function routeVariantValues(payload: JsonObject, fields: string[]) {
  return new Set(fields.flatMap((field) => stringArrayValues(payload[field]).map(normalizedRouteVariant)).filter(Boolean));
}

function hasConflictingMergedRouteVariant(payload: JsonObject) {
  const topLevelVariants = routeVariantValues(payload, ["service_variant", "route_type_normalized", "route_type"]);
  if (topLevelVariants.size !== 1) return false;

  const merged = payload._merged_field_values;
  if (!isJsonObject(merged)) return false;
  const mergedVariants = routeVariantValues(merged, ["service_variant", "route_type_normalized", "route_type"]);
  if (mergedVariants.size === 0) return false;

  const [topLevelVariant] = topLevelVariants;
  return [...mergedVariants].some((mergedVariant) => !routeVariantsCompatible(topLevelVariant, mergedVariant));
}

function routeVariantsCompatible(topLevelVariant: RouteVariantBucket | undefined, mergedVariant: RouteVariantBucket | undefined) {
  if (topLevelVariant === mergedVariant) return true;
  return (topLevelVariant === "local" || topLevelVariant === "local_limited") && (mergedVariant === "local" || mergedVariant === "local_limited");
}

function hasCompatibleLocalLimitedMergedRouteVariant(payload: JsonObject) {
  const topLevelVariants = routeVariantValues(payload, ["service_variant", "route_type_normalized", "route_type"]);
  if (topLevelVariants.size !== 1) return false;

  const merged = payload._merged_field_values;
  if (!isJsonObject(merged)) return false;
  const mergedVariants = routeVariantValues(merged, ["service_variant", "route_type_normalized", "route_type"]);
  if (!mergedVariants.has("local_limited")) return false;

  const [topLevelVariant] = topLevelVariants;
  return [...mergedVariants].every((mergedVariant) => routeVariantsCompatible(topLevelVariant, mergedVariant));
}

function hasLocalLimitedBusClassifierArtifact(payload: JsonObject, routeIdentityValues: Array<string | undefined>) {
  const topLevelVariants = routeVariantValues(payload, ["service_variant", "route_type_normalized", "route_type"]);
  if (topLevelVariants.size !== 1 || !topLevelVariants.has("local")) return false;
  if (routeIdentityValues.some(hasServiceVariantIdentitySurface)) return false;

  const merged = payload._merged_field_values;
  if (!isJsonObject(merged)) return false;
  if (stringArrayValues(merged.service_variant).length > 0) return false;
  if (mergedRouteIdentityValues(payload).some(hasServiceVariantIdentitySurface)) return false;

  const mergedClassifierValues = ["route_type", "route_type_normalized"].flatMap((field) => stringArrayValues(merged[field]).map(normalizedRouteScopeText));
  if (!mergedClassifierValues.includes("limited bus")) return false;
  return mergedClassifierValues.every((value) => value === "bus" || value === "local" || value === "limited bus");
}

function hasNeighborLtdClassifierSpillover(record: MtaCanonicalRecord, routeIdentityValues: Array<string | undefined>) {
  const payload = record.payload;
  const topLevelVariants = routeVariantValues(payload, ["service_variant", "route_type_normalized", "route_type"]);
  if (topLevelVariants.size !== 1 || !topLevelVariants.has("local")) return false;

  const currentTokens = new Set(routeIdentityValues.flatMap(routeTokensFromText));
  if (currentTokens.size === 0) return false;
  if (routeIdentityValues.some(hasServiceVariantIdentitySurface)) return false;
  if (mergedRouteIdentityValues(payload).some(hasServiceVariantIdentitySurface)) return false;

  const merged = payload._merged_field_values;
  if (!isJsonObject(merged)) return false;
  const mergedVariants = routeVariantValues(merged, ["service_variant", "route_type_normalized", "route_type"]);
  if (!mergedVariants.has("limited_stop")) return false;
  if (![...mergedVariants].every((variant) => variant === "local" || variant === "limited_stop")) return false;

  const evidenceValues = routeEvidenceValues(record, payload);
  if (evidenceValues.some((value) => [...currentTokens].some((token) => textHasRouteLimitedIdentitySurface(value, token)))) return false;
  return evidenceValues.some((value) => {
    const tokens = routeTokensFromText(value);
    const hasCurrentRoute = [...currentTokens].some((token) => textHasRouteToken(value, token));
    const hasNeighborLtd = tokens.some((token) => !currentTokens.has(token) && textHasRouteLimitedIdentitySurface(value, token));
    return hasCurrentRoute && hasNeighborLtd;
  });
}

const LOCAL_SBS_CONTEXT_SPILLOVER_ROUTE_IDS = new Set(["route_bx35", "route_m100-ace"]);

function hasLocalSbsContextSpillover(record: MtaCanonicalRecord, routeIdentityValues: Array<string | undefined>) {
  if (!LOCAL_SBS_CONTEXT_SPILLOVER_ROUTE_IDS.has(record.record_id)) return false;

  const payload = record.payload;
  const topLevelVariants = routeVariantValues(payload, ["service_variant", "route_type_normalized", "route_type"]);
  if (topLevelVariants.size !== 1 || !topLevelVariants.has("local")) return false;
  if (routeIdentityValues.some(hasServiceVariantIdentitySurface)) return false;
  if (mergedRouteIdentityValues(payload).some(hasServiceVariantIdentitySurface)) return false;

  const merged = payload._merged_field_values;
  if (!isJsonObject(merged)) return false;
  const mergedVariants = routeVariantValues(merged, ["service_variant", "route_type_normalized", "route_type"]);
  if (!mergedVariants.has("sbs")) return false;
  if (![...mergedVariants].every((variant) => variant === "local" || variant === "sbs")) return false;

  const currentTokens = new Set(routeIdentityValues.flatMap(routeTokensFromText));
  if (currentTokens.size !== 1) return false;

  const evidenceValues = routeEvidenceValues(record, payload);
  if (evidenceValues.some((value) => [...currentTokens].some((token) => textHasRouteSbsIdentitySurface(value, token)))) return false;
  return evidenceValues.some((value) => {
    const normalized = normalizedEvidenceText(value);
    return (
      [...currentTokens].some((token) => textHasRouteToken(value, token)) &&
      /\b(?:LOCAL|BUS ROUTE|LOCAL STOPS|EVERY BLOCK)\b/u.test(normalized)
    );
  });
}

function hasSbsLocalUpgradeCompatible(payload: JsonObject, routeIdentityValues: Array<string | undefined>) {
  const topLevelVariants = routeVariantValues(payload, ["service_variant", "route_type_normalized", "route_type"]);
  if (topLevelVariants.size !== 1 || !topLevelVariants.has("sbs")) return false;
  if (routeIdentityValues.some(hasLimitedOrExpressIdentitySurface)) return false;
  if (mergedRouteIdentityValues(payload).some(hasLimitedOrExpressIdentitySurface)) return false;

  const merged = payload._merged_field_values;
  if (!isJsonObject(merged)) return false;
  const mergedVariants = routeVariantValues(merged, ["service_variant", "route_type_normalized", "route_type"]);
  if (!mergedVariants.has("local")) return false;
  if (![...mergedVariants].every((variant) => variant === "sbs" || variant === "local")) return false;

  return descriptionValues(payload).some((value) => /\bupgrad(?:e|ed|ing)\b/u.test(normalizedRouteScopeText(value)) && /\b(?:sbs|select bus service)\b/u.test(normalizedRouteScopeText(value)));
}

function textHasSbsLimitedLifecycleContext(value: string) {
  const normalized = normalizedRouteScopeText(value);
  return (
    /\b(?:sbs|select bus service)\b/u.test(normalized) &&
    /\b(?:limited stop|limited|ltd)\b/u.test(normalized) &&
    /\b(?:upgrad(?:e|ed|ing)|replac(?:e|ed|ing|es)|based on existing|converted?)\b/u.test(normalized)
  );
}

function textHasLocalSbsLifecycleContext(value: string) {
  const normalized = normalizedRouteScopeText(value);
  return (
    /\blocal\b/u.test(normalized) &&
    /\b(?:sbs|select bus service)\b/u.test(normalized) &&
    /\b(?:replac(?:e|ed|ing|es)|streamlin(?:e|ed|ing))\b/u.test(normalized)
  );
}

function hasPredecessorSuccessorLifecycleCompatible(payload: JsonObject, routeIdentityValues: Array<string | undefined>) {
  const topLevelVariants = routeVariantValues(payload, ["service_variant", "route_type_normalized", "route_type"]);
  if (topLevelVariants.size !== 1) return false;

  const merged = payload._merged_field_values;
  if (!isJsonObject(merged)) return false;
  const mergedVariants = routeVariantValues(merged, ["service_variant", "route_type_normalized", "route_type"]);
  if (![...mergedVariants].every((variant) => variant === "local" || variant === "sbs" || variant === "limited_stop")) return false;

  const [topLevelVariant] = topLevelVariants;
  if ((topLevelVariant === "sbs" && mergedVariants.has("limited_stop")) || (topLevelVariant === "limited_stop" && mergedVariants.has("sbs"))) {
    return descriptionValues(payload).some(textHasSbsLimitedLifecycleContext);
  }
  if (topLevelVariant === "local" && mergedVariants.has("sbs")) {
    if (routeIdentityValues.some(hasLimitedOrExpressIdentitySurface)) return false;
    if (mergedRouteIdentityValues(payload).some(hasLimitedOrExpressIdentitySurface)) return false;
    return descriptionValues(payload).some(textHasLocalSbsLifecycleContext);
  }
  return false;
}

function hasLocalLimitedBundleLimitedContextCompatible(payload: JsonObject, routeIdentityValues: Array<string | undefined>) {
  const topLevelVariants = routeVariantValues(payload, ["service_variant", "route_type_normalized", "route_type"]);
  if (topLevelVariants.size !== 1 || !topLevelVariants.has("local")) return false;
  if (routeIdentityValues.some(hasServiceVariantIdentitySurface)) return false;
  if (mergedRouteIdentityValues(payload).some(hasServiceVariantIdentitySurface)) return false;

  const merged = payload._merged_field_values;
  if (!isJsonObject(merged)) return false;
  const mergedVariants = routeVariantValues(merged, ["service_variant", "route_type_normalized", "route_type"]);
  if (!mergedVariants.has("local_limited")) return false;
  return [...mergedVariants].every((variant) => variant === "local" || variant === "local_limited" || variant === "limited_stop");
}

function hasRenamedRoutePredecessorCompatible(payload: JsonObject, routeIdentityValues: Array<string | undefined>, currentRouteIdentityValues: Array<string | undefined>) {
  if (routeIdentityValues.some(hasSlashRouteSurface)) return false;
  const currentTokens = new Set(currentRouteIdentityValues.flatMap(routeTokensFromText));
  if (currentTokens.size === 0) return false;

  const mergedValues = mergedRouteIdentityValues(payload);
  const slashIdentityValues = mergedValues.filter(hasSlashRouteSurface);
  if (slashIdentityValues.some((value) => !routeTokensFromText(value).some((token) => currentTokens.has(token)))) return false;

  const predecessorTokens = new Set(mergedValues.flatMap(routeTokensFromText).filter((token) => !currentTokens.has(token)));
  if (predecessorTokens.size === 0) return false;

  const descriptions = descriptionValues(payload);
  return [...predecessorTokens].some((predecessorToken) =>
    [...currentTokens].some((currentToken) => descriptions.some((value) => textHasRouteRenameLineage(value, predecessorToken, currentToken))),
  );
}

export function routeRecordScope(record: MtaCanonicalRecord): RouteRecordScope | undefined {
  return routeRecordScopeDetails(record)?.scope;
}

function routeRecordScopeDetails(record: MtaCanonicalRecord): { scope: RouteRecordScope; reason: RouteRecordScopeReason } | undefined {
  if (record.record_kind !== "route") return undefined;

  const payload = record.payload;
  const routes = stringArrayValues(payload.routes);
  const routeSeedIdentityValues = [record.record_id, record.display_name];
  const routeStructuredIdentityValues = [
    stringValue(payload.route_id),
    stringValue(payload.route_label),
    stringValue(payload.route_name),
    stringValue(payload.route),
    stringValue(payload.internal_route_id),
  ];
  const routeIdentityValues = [
    ...routeSeedIdentityValues,
    ...routeStructuredIdentityValues,
  ];

  if (routeIdentityValues.some((value) => typeof value === "string" && isM14AdRouteSurface(value))) return { scope: "true_route", reason: "m14_ad_exception" };
  if (routes.length > 1) return { scope: "aggregate_list_context", reason: "routes_array_aggregate" };
  if (routeIdentityValues.some(countOnlyRouteScopeText)) return { scope: "data_only_scope", reason: "count_only_route_scope_text" };
  if (routes.length === 0 && isSameBaseBranchRouteId(stringValue(payload.route_id))) return { scope: "true_route", reason: "same_base_branch_route_id" };
  if (routeStructuredIdentityValues.some(hasSlashRouteSurface)) return { scope: "aggregate_list_context", reason: "slash_route_surface" };
  if (routeSeedIdentityValues.some(hasSlashRouteSurface) && !hasSingleStructuredRouteIdentity(payload, routeStructuredIdentityValues)) {
    return { scope: "aggregate_list_context", reason: "slash_route_surface" };
  }
  if (hasRenamedRoutePredecessorCompatible(payload, routeIdentityValues, routeStructuredIdentityValues)) return { scope: "true_route", reason: "renamed_route_predecessor_compatible" };
  if (mergedRouteIdentityValues(payload).some(hasSlashRouteSurface)) return { scope: "split_candidate", reason: "merged_slash_route_surface" };
  if (hasSbsLocalUpgradeCompatible(payload, routeIdentityValues)) return { scope: "true_route", reason: "sbs_local_upgrade_compatible" };
  if (hasPredecessorSuccessorLifecycleCompatible(payload, routeIdentityValues)) return { scope: "true_route", reason: "predecessor_successor_lifecycle_compatible" };
  if (hasLocalLimitedBundleLimitedContextCompatible(payload, routeIdentityValues)) return { scope: "true_route", reason: "local_limited_bundle_limited_context_compatible" };
  if (hasLocalLimitedBusClassifierArtifact(payload, routeIdentityValues)) return { scope: "true_route", reason: "local_limited_bus_classifier_artifact" };
  if (hasNeighborLtdClassifierSpillover(record, routeIdentityValues)) return { scope: "true_route", reason: "neighbor_ltd_classifier_spillover" };
  if (hasLocalSbsContextSpillover(record, routeIdentityValues)) return { scope: "true_route", reason: "local_sbs_context_spillover" };
  if (hasConflictingMergedRouteVariant(payload)) return { scope: "split_candidate", reason: "merged_service_variant_conflict" };
  if (hasCompatibleLocalLimitedMergedRouteVariant(payload)) return { scope: "true_route", reason: "local_limited_bundle_compatible" };

  return { scope: "true_route", reason: "default_true_route" };
}

function withRouteRecordScopes(records: MtaCanonicalRecord[]): MtaCanonicalRecord[] {
  return records.map((record) => {
    const details = routeRecordScopeDetails(record);
    if (!details) return record;
    if (record.payload.route_record_scope === details.scope && record.payload.route_record_scope_reason === details.reason) return record;
    return {
      ...record,
      payload: {
        ...record.payload,
        route_record_scope: details.scope,
        route_record_scope_reason: details.reason,
      },
    };
  });
}

function withPrunedRecordAliases(records: MtaCanonicalRecord[]): MtaCanonicalRecord[] {
  return records.map((record) => {
    if (!isGlobalRecordKind(record.record_kind) || !record.record_aliases?.length) return record;
    const aliases = new Set([record.record_id, ...record.record_aliases]);
    pruneUnderSpecifiedIdentityKeys(record.record_kind, record.payload, aliases, [record.display_name], new Set([record.record_id]));
    aliases.delete(record.record_id);
    const prunedAliases = uniqueStrings([...aliases]);
    if (prunedAliases.join("\0") === record.record_aliases.join("\0")) return record;
    return {
      ...record,
      record_aliases: prunedAliases.length > 0 ? prunedAliases : undefined,
    };
  });
}

export interface MaterializeEntryOptions {
  retiredSubmissionIds?: Set<string>;
}

function recordIdentity(entry: MtaSubmissionEntry): JsonObject {
  return canonicalIdentityForInput(entry.tool_args);
}

function recordBaseId(entry: MtaSubmissionEntry) {
  return isGlobalRecordKind(entry.tool_args.observation_kind) ? canonicalRecordIdForInput(entry.tool_args) : recordBaseIdForInput(entry.tool_args);
}

function assignRecordIds(entries: MtaSubmissionEntry[]) {
  const byIdentity = new Map<string, MtaSubmissionEntry>();
  for (const entry of entries) {
    byIdentity.set(stableHash(recordIdentity(entry)), entry);
  }

  const byBaseId = new Map<string, string[]>();
  for (const identity of byIdentity.keys()) {
    const baseId = recordBaseId(byIdentity.get(identity)!);
    byBaseId.set(baseId, [...(byBaseId.get(baseId) ?? []), identity]);
  }

  const ids = new Map<string, string>();
  for (const [baseId, identities] of byBaseId.entries()) {
    const sorted = identities.sort();
    for (const [index, identity] of sorted.entries()) {
      ids.set(identity, index === 0 ? baseId : `${baseId}_${index + 1}`);
    }
  }

  return ids;
}

/**
 * Return the exact identity-to-record-id assignment the materializer would use
 * for a submission set. Recovery apply uses this before creating a journal so
 * a new observation cannot silently take an existing base id or acquire an
 * unreviewed collision suffix.
 */
export function materializedRecordIdAssignments(
  entries: MtaSubmissionEntry[],
  options: MaterializeEntryOptions = {},
): Map<string, string> {
  const accepted = materializableEntries(entries, options);
  return recordIdAssignmentsForMaterializableEntries(accepted);
}

/** Test/support seam for callers that already hold materializable entries. */
export function recordIdAssignmentsForMaterializableEntries(
  entries: MtaSubmissionEntry[],
): Map<string, string> {
  const byToolArgs = new Map<string, MtaSubmissionEntry>();
  for (const entry of entries) {
    byToolArgs.set(stableHash(entry.tool_args as unknown as JsonObject), entry);
  }
  return assignRecordIds([...byToolArgs.values()]);
}

function displayName(entry: MtaSubmissionEntry) {
  const args = entry.tool_args;
  return args.label ?? args.raw_text ?? args.local_observation_id;
}

function displayQuality(value: string, localObservationId: string) {
  let score = 0;
  if (value !== localObservationId) score += 5;
  if (!value.includes("_")) score += 5;
  if (/\s/u.test(value)) score += 5;
  if (/[A-Z]/u.test(value)) score += 2;
  if (value.length >= 6 && value.length <= 90) score += 2;
  return score;
}

function chooseDisplayName(existing: MtaCanonicalRecord, entry: MtaSubmissionEntry) {
  const next = displayName(entry);
  const existingScore = displayQuality(existing.display_name, existing.local_observation_id);
  const nextScore = displayQuality(next, entry.tool_args.local_observation_id);
  return nextScore > existingScore ? next : existing.display_name;
}

const ENTITY_BOROUGH_DISPLAY: Record<string, string> = {
  bronx: "Bronx",
  brooklyn: "Brooklyn",
  manhattan: "Manhattan",
  queens: "Queens",
  "staten-island": "Staten Island",
};

function payloadStringFields(payload: JsonObject | undefined, fields: string[]) {
  if (!payload) return [];
  return fields.flatMap((field) => stringArrayValues(payload[field]));
}

function mergedStringFields(payload: JsonObject | undefined, fields: string[]) {
  const merged = payload?._merged_field_values;
  if (!isJsonObject(merged)) return [];
  return fields.flatMap((field) => stringArrayValues(merged[field]));
}

function entityBoroughKey(record: MtaCanonicalRecord) {
  const surfaces = [
    record.record_id,
    record.display_name,
    ...payloadStringFields(record.payload, ["borough", "borough_normalized", "description", "organization", "entity_name", "name"]),
    ...mergedStringFields(record.payload, ["borough", "borough_normalized", "description", "entity_name", "name"]),
  ].map((value) => normalizedToken(value));

  for (const [key, display] of Object.entries(ENTITY_BOROUGH_DISPLAY)) {
    const token = normalizedToken(display);
    if (surfaces.some((surface) => surface === key || surface.includes(key) || surface === token || surface.includes(token))) return key;
  }
  return undefined;
}

function communityBoardDisplayName(record: MtaCanonicalRecord) {
  const match = /^Community Board (\d{1,2})$/iu.exec(record.display_name.trim());
  if (!match) return undefined;

  const kindHay = normalizedToken(
    [
      record.record_id,
      record.display_name,
      ...payloadStringFields(record.payload, ["entity_type", "entity_name", "name", "description"]),
      ...mergedStringFields(record.payload, ["entity_type", "entity_name", "name"]),
    ].join(" "),
  );
  if (!kindHay.includes("community_board")) return undefined;

  const borough = entityBoroughKey(record);
  const boroughDisplay = borough ? ENTITY_BOROUGH_DISPLAY[borough] : undefined;
  return boroughDisplay ? `${boroughDisplay} Community Board ${match[1]}` : undefined;
}

function communityAdvisoryCommitteeScope(value: string) {
  const match = /\bCommunity Advisory Committee(?:\s*\(CAC\))?\s+for\s+(?:the\s+)?(.+?)(?:\s+project)?\.?$/iu.exec(value.trim());
  const scope = match?.[1]?.trim().replace(/\s+project$/iu, "").replace(/\s+/gu, " ");
  if (!scope || /^community advisory committee\b/iu.test(scope)) return undefined;
  return scope;
}

function communityAdvisoryCommitteeDisplayName(record: MtaCanonicalRecord) {
  const displayKey = normalizedToken(record.display_name);
  if (displayKey !== "community_advisory_committee" && displayKey !== "community_advisory_committee_cac") return undefined;

  const scope = [
    ...payloadStringFields(record.payload, ["name", "entity_name", "description"]),
    ...mergedStringFields(record.payload, ["name", "entity_name", "description"]),
  ]
    .map(communityAdvisoryCommitteeScope)
    .find((value): value is string => Boolean(value));

  return scope ? `${scope} Community Advisory Committee (CAC)` : undefined;
}

type ReviewedEntityDisplayName = {
  display_name: string;
  original_display_name: string;
  required_payload: Record<string, string>;
};

const REVIEWED_ENTITY_DISPLAY_NAMES: Record<string, ReviewedEntityDisplayName> = {
  "entity_frank-farrell-mta-acting-evp-buses": {
    original_display_name: "Frank Farrell",
    display_name: "Frank Farrell, MTA Acting EVP of Buses/MTA Bus Company",
    required_payload: {
      entity_name: "Frank Farrell",
      entity_type: "person",
      title: "MTA Acting Executive Vice President of Department of Buses/MTA Bus Company",
    },
  },
  "entity_mta-nyct-evp-frank-farrell": {
    original_display_name: "Frank Farrell",
    display_name: "Frank Farrell, MTA NYCT EVP of Buses",
    required_payload: {
      entity_name: "Frank Farrell",
      entity_type: "government_official",
      title: "MTA New York City Transit Executive Vice President of Buses",
      agency_name: "MTA New York City Transit",
    },
  },
};

function reviewedEntityDisplayName(record: MtaCanonicalRecord) {
  const reviewed = REVIEWED_ENTITY_DISPLAY_NAMES[record.record_id];
  if (!reviewed || record.display_name !== reviewed.original_display_name) return undefined;

  for (const [field, value] of Object.entries(reviewed.required_payload)) {
    if (stringValue(record.payload[field]) !== value) return undefined;
  }
  return reviewed.display_name;
}

function disambiguatedEntityDisplayName(record: MtaCanonicalRecord) {
  if (record.record_kind !== "entity") return record.display_name;
  return reviewedEntityDisplayName(record) ?? communityBoardDisplayName(record) ?? communityAdvisoryCommitteeDisplayName(record) ?? record.display_name;
}

function withDisambiguatedEntityDisplayNames(records: MtaCanonicalRecord[]) {
  return records.map((record) => {
    const displayName = disambiguatedEntityDisplayName(record);
    return displayName === record.display_name ? record : { ...record, display_name: displayName };
  });
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))].sort();
}

function jsonEqual(left: JsonValue | undefined, right: JsonValue | undefined) {
  return stableHash({ value: left } as JsonObject) === stableHash({ value: right } as JsonObject);
}

function mergeJsonArrays(left: JsonValue[], right: JsonValue[]) {
  const byHash = new Map<string, JsonValue>();
  for (const value of [...left, ...right]) {
    byHash.set(stableHash({ value } as JsonObject), value);
  }
  return [...byHash.values()];
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rememberMergedFieldValue(payload: JsonObject, key: string, ...values: JsonValue[]) {
  const existing = isJsonObject(payload._merged_field_values) ? payload._merged_field_values : {};
  const previousValues = Array.isArray(existing[key]) ? existing[key] : [];
  const mergedValues = mergeJsonArrays(previousValues as JsonValue[], values);
  payload._merged_field_values = {
    ...existing,
    [key]: mergedValues,
  };
}

const PROMOTE_CONCRETE_OTHER_FIELDS = new Set(["document_time_status", "project_family", "treatment_family"]);

function shouldPromoteConcreteMergedValue(key: string, existingValue: JsonValue | undefined, nextValue: JsonValue | undefined) {
  return PROMOTE_CONCRETE_OTHER_FIELDS.has(key) && existingValue === "other" && typeof nextValue === "string" && nextValue.trim() !== "" && nextValue !== "other";
}

function aliasTargetsRecord(kind: MtaSubmissionEntry["tool_args"]["observation_kind"], alias: string, recordId: string, explicitTargetId: string | undefined) {
  if (alias === recordId || alias === explicitTargetId) return true;
  const overrideTarget = identityOverrideTarget(kind, alias);
  return overrideTarget === recordId || overrideTarget === explicitTargetId;
}

function recordAliasesForEntry(recordId: string, args: MtaSubmissionEntry["tool_args"]) {
  if (!isGlobalRecordKind(args.observation_kind)) return undefined;

  const aliasSet = new Set([recordBaseIdForInput(args), ...identityKeysForInput(args), ...(args.target_record_id ? [args.target_record_id] : [])].filter((alias) => alias !== recordId));
  const prunedAliasSet = new Set([...aliasSet, recordId]);
  pruneUnderSpecifiedIdentityKeys(
    args.observation_kind,
    args.payload,
    prunedAliasSet,
    [args.label].filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    new Set([recordId]),
  );
  prunedAliasSet.delete(recordId);
  const aliases = uniqueStrings([...prunedAliasSet]);
  if (!args.target_record_id) return aliases.length > 0 ? aliases : undefined;

  const explicitTargetId = canonicalRecordIdForInput(args);
  const compatibleAliases = aliases.filter((alias) => aliasTargetsRecord(args.observation_kind, alias, recordId, explicitTargetId));
  return compatibleAliases.length > 0 ? compatibleAliases : undefined;
}

function mergePayload(existing: JsonObject, next: JsonObject): JsonObject {
  const merged: JsonObject = { ...existing };
  for (const [key, nextValue] of Object.entries(next)) {
    if (nextValue === undefined) continue;
    const existingValue = merged[key];
    if (existingValue === undefined) {
      merged[key] = nextValue;
      continue;
    }
    if (jsonEqual(existingValue, nextValue)) continue;
    if (Array.isArray(existingValue) && Array.isArray(nextValue)) {
      merged[key] = mergeJsonArrays(existingValue, nextValue);
      continue;
    }
    if (isJsonObject(existingValue) && isJsonObject(nextValue)) {
      merged[key] = mergePayload(existingValue, nextValue);
      continue;
    }
    if (shouldPromoteConcreteMergedValue(key, existingValue, nextValue)) {
      merged[key] = nextValue;
      rememberMergedFieldValue(merged, key, existingValue, nextValue);
      continue;
    }
    rememberMergedFieldValue(merged, key, existingValue, nextValue);
  }
  return merged;
}

function shouldReadEvidenceBlockContext(kind: MtaObservationKind) {
  return kind === "event" || kind === "project";
}

function readNormalizationContextSource(sourceId: string): NormalizationContextSource {
  const cached = normalizationContextSourceCache.get(sourceId);
  if (cached) {
    normalizationContextSourceCache.delete(sourceId);
    normalizationContextSourceCache.set(sourceId, cached);
    return cached;
  }

  const blocks: NormalizationContextBlock[] = readFileSync(sourceBlocksPath(sourceId), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const block = JSON.parse(line) as JsonObject;
      return {
        block_id: String(block.block_id),
        page_number: Number(block.page_number),
        raw_text: typeof block.raw_text === "string" ? block.raw_text : "",
        source_surface: typeof block.source_surface === "string" ? block.source_surface : undefined,
      };
    });
  const source = { blocks, byId: new Map(blocks.map((block) => [block.block_id, block])) };
  normalizationContextSourceCache.set(sourceId, source);
  while (normalizationContextSourceCache.size > NORMALIZATION_CONTEXT_SOURCE_CACHE_SIZE) {
    const oldestSourceId = normalizationContextSourceCache.keys().next().value;
    if (oldestSourceId === undefined) break;
    normalizationContextSourceCache.delete(oldestSourceId);
  }
  return source;
}

function resolveNormalizationContextBlockId(blockId: string, source: NormalizationContextSource): string {
  if (source.byId.has(blockId)) return blockId;

  const rangeParts = blockId.split("..");
  if (rangeParts.length === 2 && rangeParts[0] && rangeParts[1]) {
    return `${resolveNormalizationContextBlockId(rangeParts[0], source)}..${resolveNormalizationContextBlockId(rangeParts[1], source)}`;
  }

  const aliasMatch = /^(p\d{3,})_b(\d{4,})$/u.exec(blockId);
  if (!aliasMatch) return blockId;

  const [, pageId, ordinal] = aliasMatch;
  const chandraBlockId = `${pageId}_c${ordinal}`;
  const chandraBlock = source.blocks.find((candidate) => candidate.block_id === chandraBlockId && candidate.source_surface === "chandra_ocr");
  return chandraBlock?.block_id ?? blockId;
}

function normalizationContextBlockCacheKey(sourceId: string, blockId: string) {
  return `${sourceId}\0${blockId}`;
}

function normalizationContextBlockTextFromSource(sourceId: string, blockId: string, source: NormalizationContextSource) {
  const resolvedBlockId = resolveNormalizationContextBlockId(blockId, source);
  const block = source.byId.get(resolvedBlockId);
  if (block) return block.raw_text;

  const [startBlockId, endBlockId, ...rest] = resolvedBlockId.split("..");
  if (!startBlockId || !endBlockId || rest.length > 0) throw new Error(`Unknown source block ${sourceId}#${blockId}`);
  const startBlock = source.byId.get(startBlockId);
  const endBlock = source.byId.get(endBlockId);
  if (!startBlock || !endBlock || startBlock.page_number !== endBlock.page_number) throw new Error(`Unknown source block range ${sourceId}#${blockId}`);

  const pageBlocks = source.blocks.filter((candidate) => candidate.page_number === startBlock.page_number);
  const startIndex = pageBlocks.findIndex((candidate) => candidate.block_id === startBlock.block_id);
  const endIndex = pageBlocks.findIndex((candidate) => candidate.block_id === endBlock.block_id);
  if (startIndex === -1 || endIndex === -1) throw new Error(`Unknown source block range ${sourceId}#${blockId}`);

  const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  return pageBlocks
    .slice(from, to + 1)
    .map((candidate) => candidate.raw_text)
    .join("\n");
}

function normalizationContextBlockText(sourceId: string, blockId: string) {
  const cached = normalizationContextBlockTextCache.get(normalizationContextBlockCacheKey(sourceId, blockId));
  if (cached !== undefined) return cached;
  return normalizationContextBlockTextFromSource(sourceId, blockId, readNormalizationContextSource(sourceId));
}

function buildNormalizationContextBlockTextCache(entries: readonly MtaSubmissionEntry[]) {
  normalizationContextBlockTextCache.clear();
  normalizationContextSourceCache.clear();

  const requestsBySource = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (!shouldReadEvidenceBlockContext(entry.tool_args.observation_kind)) continue;
    for (const ref of entry.tool_args.evidence_refs ?? []) {
      const blockId = ref.block_id ?? ref.block_range;
      if (!ref.source_id || !blockId) continue;
      const requests = requestsBySource.get(ref.source_id);
      if (requests) requests.add(blockId);
      else requestsBySource.set(ref.source_id, new Set([blockId]));
    }
  }

  for (const [sourceId, blockIds] of requestsBySource) {
    let source: NormalizationContextSource;
    try {
      source = readNormalizationContextSource(sourceId);
    } catch {
      continue;
    }
    for (const blockId of blockIds) {
      try {
        const text = normalizationContextBlockTextFromSource(sourceId, blockId, source).trim().slice(0, MAX_NORMALIZATION_CONTEXT_BLOCK_CHARS_PER_REF);
        if (text.length > 0) normalizationContextBlockTextCache.set(normalizationContextBlockCacheKey(sourceId, blockId), text);
      } catch {
        // Legacy accepted journals may cite retired or unavailable blocks. Missing block context should
        // never make materialization fail; validation remains responsible for evidence integrity.
      }
    }
  }

  normalizationContextSourceCache.clear();
}

function evidenceBlockContextTexts(kind: MtaObservationKind, evidenceRefs: readonly MtaEvidenceRef[]) {
  if (!shouldReadEvidenceBlockContext(kind)) return [];
  const texts: string[] = [];
  let totalChars = 0;
  for (const ref of evidenceRefs) {
    if (texts.length >= MAX_NORMALIZATION_CONTEXT_BLOCK_REFS || totalChars >= MAX_NORMALIZATION_CONTEXT_BLOCK_CHARS) break;
    const blockId = ref.block_id ?? ref.block_range;
    if (!ref.source_id || !blockId) continue;
    try {
      const text = normalizationContextBlockText(ref.source_id, blockId).trim().slice(0, MAX_NORMALIZATION_CONTEXT_BLOCK_CHARS_PER_REF);
      if (text.length > 0) {
        const remainingChars = MAX_NORMALIZATION_CONTEXT_BLOCK_CHARS - totalChars;
        const cappedText = text.slice(0, remainingChars);
        texts.push(cappedText);
        totalChars += cappedText.length;
      }
    } catch {
      // Legacy accepted journals may cite retired or unavailable blocks. Missing block context should
      // never make materialization fail; validation remains responsible for evidence integrity.
    }
  }
  return texts;
}

function normalizationContextFromValues(kind: MtaObservationKind, rawText: string | undefined, evidenceRefs: readonly MtaEvidenceRef[]): NormalizationContext {
  const context: NormalizationContext = {};
  if (typeof rawText === "string" && rawText.trim().length > 0) context.raw_text = rawText;
  const evidenceQuotes = uniqueStrings([
    ...evidenceRefs.map((ref) => ref.source_quote).filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ...evidenceBlockContextTexts(kind, evidenceRefs),
  ]);
  if (evidenceQuotes.length > 0) context.evidence_quotes = evidenceQuotes;
  return context;
}

function normalizationContextForEntry(entry: MtaSubmissionEntry): NormalizationContext {
  return normalizationContextFromValues(entry.tool_args.observation_kind, entry.tool_args.raw_text, entry.tool_args.evidence_refs ?? []);
}

function normalizeMergedPayload(kind: MtaObservationKind, payload: JsonObject, context?: NormalizationContext): JsonObject {
  const normalized = normalizeObservationPayload(kind, payload, context);
  for (const key of PROMOTE_CONCRETE_OTHER_FIELDS) {
    const previousValue = payload[key];
    const normalizedValue = normalized[key];
    if (
      shouldPromoteConcreteMergedValue(key, previousValue, normalizedValue) &&
      typeof previousValue === "string" &&
      typeof normalizedValue === "string"
    ) {
      rememberMergedFieldValue(normalized, key, previousValue, normalizedValue);
    }
  }
  return normalized;
}

function materializableEntries(entries: MtaSubmissionEntry[], options: MaterializeEntryOptions = {}): MtaSubmissionEntry[] {
  const retiredIds = options.retiredSubmissionIds ?? new Set<string>();
  const accepted = entries
    .filter((entry) => !retiredIds.has(entry.submission_id))
    .filter((entry) => entry.validation.state === "accepted")
    .map((entry) => {
      const toolArgs = normalizeSubmitInput(entry.tool_args);
      const payload = toolArgs.observation_kind === "table" ? canonicalTablePayload(toolArgs.payload ?? {}) : toolArgs.payload;
      const materializedToolArgs = { ...toolArgs, payload };
      const issues = validateSubmitInput(materializedToolArgs);
      return {
        ...entry,
        tool_args: materializedToolArgs,
        validation: {
          state: issues.length === 0 ? ("accepted" as const) : ("rejected" as const),
          issues,
        },
      };
    })
    .filter((entry) => entry.validation.state === "accepted");
  const localObservationIdsBySource = new Map<string, Set<string>>();
  const localObservationIdentityKeysBySource = new Map<string, Map<string, Set<string>>>();
  for (const entry of accepted) {
    const ids = localObservationIdsBySource.get(entry.tool_args.source_id);
    if (ids) ids.add(entry.tool_args.local_observation_id);
    else localObservationIdsBySource.set(entry.tool_args.source_id, new Set([entry.tool_args.local_observation_id]));

    const identities =
      localObservationIdentityKeysBySource.get(entry.tool_args.source_id) ??
      new Map<string, Set<string>>();
    const identityKeys = identities.get(entry.tool_args.local_observation_id) ?? new Set<string>();
    identityKeys.add(stableHash(recordIdentity(entry)));
    identities.set(entry.tool_args.local_observation_id, identityKeys);
    localObservationIdentityKeysBySource.set(entry.tool_args.source_id, identities);
  }
  const ambiguousLocalObservationIdsBySource = new Map<string, Set<string>>();
  for (const [sourceId, identities] of localObservationIdentityKeysBySource.entries()) {
    const ambiguous = new Set(
      [...identities.entries()].filter(([, identityKeys]) => identityKeys.size > 1).map(([localObservationId]) => localObservationId),
    );
    if (ambiguous.size > 0) ambiguousLocalObservationIdsBySource.set(sourceId, ambiguous);
  }

  return accepted.filter((entry) => {
    const knownLocalObservationIds = localObservationIdsBySource.get(entry.tool_args.source_id) ?? new Set<string>();
    const ambiguousLocalObservationIds = ambiguousLocalObservationIdsBySource.get(entry.tool_args.source_id) ?? new Set<string>();
    return relationEndpointIssues(entry.tool_args, knownLocalObservationIds).length === 0 && relationEndpointAmbiguityIssues(entry.tool_args, ambiguousLocalObservationIds).length === 0;
  });
}

function relationEndpointAmbiguityIssues(input: MtaSubmitObservationInput, ambiguousLocalObservationIds: Set<string>) {
  if (input.observation_kind !== "relation") return [];

  const issues: string[] = [];
  for (const [field, recordField] of [
    ["subject_local_observation_id", "subject_id"],
    ["object_local_observation_id", "object_id"],
  ] as const) {
    if (typeof input.payload?.[recordField] === "string") continue;
    const value = input.payload?.[field];
    if (typeof value !== "string" || !ambiguousLocalObservationIds.has(value)) continue;
    issues.push(`${field} references ambiguous local observation id "${value}". Submit a canonical ${recordField} to disambiguate the relation endpoint.`);
  }

  return issues;
}

function submissionSort(a: MtaSubmissionEntry, b: MtaSubmissionEntry) {
  return a.submitted_at.localeCompare(b.submitted_at) || a.submission_id.localeCompare(b.submission_id);
}

function materializeTiming(label: string, startedAt: number) {
  if (process.env.MTA_MATERIALIZE_TIMING !== "1") return;
  console.error(`[materialize] ${label}: ${((performance.now() - startedAt) / 1000).toFixed(2)}s`);
}

function relationPayloadWithResolvedTargets(
  entry: MtaSubmissionEntry,
  localBySource: Map<string, string>,
  uniqueLocal: Map<string, string>,
  localIdsByRecord: Map<string, { bySource: Map<string, string>; primary: string }>,
  recordKindById: Map<string, MtaObservationKind>,
): JsonObject {
  if (entry.tool_args.observation_kind !== "relation") return entry.tool_args.payload ?? {};

  const payload = { ...(entry.tool_args.payload ?? {}) };
  const fields = [
    ["subject_local_observation_id", "subject_id"],
    ["object_local_observation_id", "object_id"],
  ] as const;

  for (const [localField, recordField] of fields) {
    const localId = payload[localField];
    if (typeof localId === "string" && localId.trim() && typeof payload[recordField] !== "string") {
      const sourceScoped = localBySource.get(`${entry.tool_args.source_id}\0${localId}`);
      const unique = uniqueLocal.get(localId);
      const target = sourceScoped ?? unique;
      if (target) payload[recordField] = target;
    }
    const recordId = payload[recordField];
    if (typeof recordId === "string" && recordId.trim()) {
      const resolvedRecordId = mergeAliasTarget(recordId);
      payload[recordField] = resolvedRecordId;
      if (typeof payload[localField] !== "string" || !payload[localField].trim()) {
        const targetLocalIds = localIdsByRecord.get(resolvedRecordId);
        const targetLocalId = targetLocalIds?.bySource.get(entry.tool_args.source_id) ?? targetLocalIds?.primary;
        if (targetLocalId) payload[localField] = targetLocalId;
      }
    }
  }

  const endpointKinds: RelationEndpointKinds = {};
  if (typeof payload.subject_id === "string") endpointKinds.subject_kind = recordKindById.get(payload.subject_id);
  if (typeof payload.object_id === "string") endpointKinds.object_kind = recordKindById.get(payload.object_id);

  return normalizeRelationPayload(payload, endpointKinds, { raw_text: entry.tool_args.raw_text });
}

// Relation submissions can carry endpoint record ids resolved before later identity merges
// (canonicalize-authored relations do); follow the override alias chain so endpoints stay canonical.
function mergeAliasTarget(recordId: string) {
  const kind = recordId.split("_", 1)[0] ?? "";
  if (!isGlobalRecordKind(kind)) return recordId;
  return identityOverrideTarget(kind, recordId) ?? recordId;
}

function countArray(value: JsonValue | undefined) {
  return Array.isArray(value) ? value.length : undefined;
}

function canonicalTablePayload(payload: JsonObject): JsonObject {
  const rowCount = countArray(payload.rows) ?? countArray(payload.rows_partial_sample);
  const columnCount = countArray(payload.columns) ?? countArray(payload.headers) ?? countArray(payload.headings);
  const next: JsonObject = { ...payload };

  delete next.rows;
  delete next.columns;
  delete next.headers;
  delete next.headings;
  delete next.values;
  delete next.members;
  delete next.rows_partial_sample;

  if (next.row_count === undefined && next.rows_count === undefined && rowCount !== undefined) next.row_count = rowCount;
  if (next.column_count === undefined && columnCount !== undefined) next.column_count = columnCount;

  return next;
}

function canonicalPayloadForEntry(
  entry: MtaSubmissionEntry,
  localBySource: Map<string, string>,
  uniqueLocal: Map<string, string>,
  localIdsByRecord: Map<string, { bySource: Map<string, string>; primary: string }>,
  recordKindById: Map<string, MtaObservationKind>,
): JsonObject {
  const payload = relationPayloadWithResolvedTargets(entry, localBySource, uniqueLocal, localIdsByRecord, recordKindById);
  if (entry.tool_args.observation_kind === "table") return canonicalTablePayload(payload);
  if (entry.tool_args.observation_kind === "treatment_component") return treatmentPayloadWithObservationLabel(entry, payload);
  if (entry.tool_args.observation_kind === "source_gap") return normalizeObservationPayload("source_gap", payload);
  return payload;
}

function treatmentPayloadWithObservationLabel(entry: MtaSubmissionEntry, payload: JsonObject): JsonObject {
  const label = stringValue(entry.tool_args.label);
  if (!label || payload.label !== undefined) return payload;
  if (normalizedToken(stringValue(payload.treatment_kind) ?? "") !== "repair") return payload;
  const labelKey = normalizedToken(label);
  if (!["elevator", "elevators", "escalator", "escalators"].some((signal) => labelKey.includes(signal))) return payload;
  return normalizeObservationPayload("treatment_component", { ...payload, label });
}

export function entriesToRecords(entries: MtaSubmissionEntry[], options: MaterializeEntryOptions = {}): MtaCanonicalRecord[] {
  let timingStart = performance.now();
  const accepted = materializableEntries(entries, options);
  materializeTiming(`materializableEntries ${accepted.length}`, timingStart);
  timingStart = performance.now();
  const byToolArgs = new Map<string, MtaSubmissionEntry>();
  for (const entry of accepted) {
    byToolArgs.set(stableHash(entry.tool_args as unknown as JsonObject), entry);
  }
  materializeTiming(`dedupeByToolArgs ${byToolArgs.size}`, timingStart);

  timingStart = performance.now();
  const byRecord = new Map<string, MtaCanonicalRecord>();
  const dedupedEntries = [...byToolArgs.values()];
  const recordIds = assignRecordIds(dedupedEntries);
  materializeTiming(`assignRecordIds ${recordIds.size}`, timingStart);
  timingStart = performance.now();
  const localBuckets = new Map<string, Set<string>>();
  const localBySource = new Map<string, string>();
  const ambiguousLocalBySourceKeys = new Set<string>();
  const localIdsByRecord = new Map<string, { bySource: Map<string, string>; primary: string }>();
  const recordKindById = new Map<string, MtaObservationKind>();
  for (const entry of dedupedEntries) {
    const id = recordIds.get(stableHash(recordIdentity(entry)));
    if (!id) continue;
    recordKindById.set(id, entry.tool_args.observation_kind);
    recordKindById.set(mergeAliasTarget(id), entry.tool_args.observation_kind);
    const localBySourceKey = `${entry.tool_args.source_id}\0${entry.tool_args.local_observation_id}`;
    const existingLocalBySource = localBySource.get(localBySourceKey);
    if (ambiguousLocalBySourceKeys.has(localBySourceKey)) {
      localBySource.delete(localBySourceKey);
    } else if (existingLocalBySource === undefined) {
      localBySource.set(localBySourceKey, id);
    } else if (existingLocalBySource !== id) {
      localBySource.delete(localBySourceKey);
      ambiguousLocalBySourceKeys.add(localBySourceKey);
    }
    const localBucket = localBuckets.get(entry.tool_args.local_observation_id);
    if (localBucket) localBucket.add(id);
    else localBuckets.set(entry.tool_args.local_observation_id, new Set([id]));
    for (const recordId of uniqueStrings([id, mergeAliasTarget(id)])) {
      const existing = localIdsByRecord.get(recordId);
      if (existing) {
        existing.bySource.set(entry.tool_args.source_id, entry.tool_args.local_observation_id);
      } else {
        localIdsByRecord.set(recordId, {
          bySource: new Map([[entry.tool_args.source_id, entry.tool_args.local_observation_id]]),
          primary: entry.tool_args.local_observation_id,
        });
      }
    }
  }
  materializeTiming(`localIndexes ${localBySource.size}`, timingStart);
  timingStart = performance.now();
  const uniqueLocal = new Map(
    [...localBuckets.entries()]
      .filter(([, ids]) => ids.size === 1)
      .map(([localId, ids]) => [localId, [...ids][0]!] as const),
  );
  materializeTiming(`uniqueLocal ${uniqueLocal.size}`, timingStart);

  timingStart = performance.now();
  buildNormalizationContextBlockTextCache(dedupedEntries);
  materializeTiming(`normalizationContextBlockTextCache ${normalizationContextBlockTextCache.size}`, timingStart);
  timingStart = performance.now();
  for (const entry of dedupedEntries.sort(submissionSort)) {
    const id = recordIds.get(stableHash(recordIdentity(entry)));
    if (!id) throw new Error(`Unable to assign record id for submission ${entry.submission_id}`);
    const args = entry.tool_args;
    const previous = byRecord.get(id);
    const payload = normalizeObservationPayload(args.observation_kind, canonicalPayloadForEntry(entry, localBySource, uniqueLocal, localIdsByRecord, recordKindById), normalizationContextForEntry(entry));
    const aliases = recordAliasesForEntry(id, args);

    if (!previous) {
      byRecord.set(id, {
        record_id: id,
        record_aliases: aliases && aliases.length > 0 ? aliases : undefined,
        record_kind: args.observation_kind,
        source_id: args.source_id,
        source_ids: [args.source_id],
        local_observation_id: args.local_observation_id,
        local_observation_ids: [args.local_observation_id],
        display_name: displayName(entry),
        raw_text: args.raw_text,
        payload,
        evidence_refs: args.evidence_refs ?? [],
        submission_ids: [entry.submission_id],
        truth_status: String((args.payload?.truth_status as JsonValue | undefined) ?? "source_stated"),
        review_state: String((args.payload?.review_state as JsonValue | undefined) ?? "unreviewed"),
        generated_at: entry.submitted_at,
      });
      continue;
    }

    previous.record_aliases = uniqueStrings([...(previous.record_aliases ?? []), ...(aliases ?? [])]);
    if (previous.record_aliases.length === 0) previous.record_aliases = undefined;
    previous.source_ids = uniqueStrings([...(previous.source_ids ?? []), args.source_id]);
    previous.local_observation_ids = uniqueStrings([...(previous.local_observation_ids ?? []), args.local_observation_id]);
    previous.display_name = chooseDisplayName(previous, entry);
    const nextRawText = previous.raw_text ?? args.raw_text;
    const nextEvidenceRefs = [...previous.evidence_refs, ...(args.evidence_refs ?? [])];
    previous.raw_text = nextRawText;
    previous.payload = normalizeMergedPayload(
      args.observation_kind,
      mergePayload(previous.payload, payload),
      normalizationContextFromValues(args.observation_kind, nextRawText, nextEvidenceRefs),
    );
    previous.evidence_refs = nextEvidenceRefs;
    previous.submission_ids = [...new Set([...previous.submission_ids, entry.submission_id])].sort();
    previous.generated_at = [previous.generated_at, entry.submitted_at].sort().at(-1) ?? previous.generated_at;
  }
  materializeTiming(`mergeRecords ${byRecord.size}`, timingStart);

  // S2.2: fold staged/override publication dates into source records before deriving relations, so
  // S2.4's as_of_date default can read published_date_normalized. S2.4: qualify every relation edge
  // (authored + derived) with assertion_status + as_of_date after derivation. Materialize-time folds
  // over immutable staged inputs — never journal writes (§2 decision 4/6).
  timingStart = performance.now();
  const withDisplayNames = withDisambiguatedEntityDisplayNames([...byRecord.values()]);
  materializeTiming(`disambiguateEntityDisplayNames ${withDisplayNames.length}`, timingStart);
  timingStart = performance.now();
  const withDates = withSourceDateBackfill(withDisplayNames);
  materializeTiming(`sourceDateBackfill ${withDates.length}`, timingStart);
  timingStart = performance.now();
  const withPrunedAliases = withPrunedRecordAliases(withDates);
  materializeTiming(`pruneRecordAliases ${withPrunedAliases.length}`, timingStart);
  timingStart = performance.now();
  const withRouteScopes = withRouteRecordScopes(withPrunedAliases);
  materializeTiming(`routeRecordScopes ${withRouteScopes.length}`, timingStart);
  timingStart = performance.now();
  const withDerived = withDerivedRelations(withRouteScopes);
  materializeTiming(`derivedRelations ${withDerived.length}`, timingStart);
  timingStart = performance.now();
  const withAssertions = withAssertionQualifiers(withDerived).sort((a, b) => a.record_id.localeCompare(b.record_id));
  materializeTiming(`assertionQualifiersAndSort ${withAssertions.length}`, timingStart);
  normalizationContextBlockTextCache.clear();
  return withAssertions;
}

function writeJsonl(path: string, records: MtaCanonicalRecord[]) {
  mkdirSync(dirname(path), { recursive: true });
  const content = records.map((record) => JSON.stringify(record)).join("\n");
  writeFileSync(path, content ? `${content}\n` : "", "utf8");
}

function yamlScalar(value: string) {
  return JSON.stringify(value);
}

function yamlKey(key: string) {
  return /^[A-Za-z0-9_-]+$/u.test(key) ? key : yamlScalar(key);
}

function isYamlObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function yamlValue(value: JsonValue | undefined, indent = 0): string[] {
  const prefix = " ".repeat(indent);
  if (value === undefined) return [];
  if (value === null || typeof value !== "object") return [`${prefix}${JSON.stringify(value)}`];

  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}[]`];

    return value.flatMap((item) => {
      if (isYamlObject(item)) {
        const childLines = yamlObject(item, indent + 2);
        return [`${prefix}-`, ...childLines];
      }

      if (Array.isArray(item)) {
        const childLines = yamlValue(item, indent + 2);
        return [`${prefix}-`, ...childLines];
      }

      return [`${prefix}- ${JSON.stringify(item)}`];
    });
  }

  const lines = yamlObject(value, indent);
  return lines.length > 0 ? lines : [`${prefix}{}`];
}

function yamlObject(value: JsonObject, indent = 0): string[] {
  const prefix = " ".repeat(indent);
  const lines: string[] = [];

  for (const key of Object.keys(value).sort()) {
    const childValue = value[key];
    if (childValue === undefined) continue;

    if (childValue === null || typeof childValue !== "object") {
      lines.push(`${prefix}${yamlKey(key)}: ${JSON.stringify(childValue)}`);
      continue;
    }

    const childLines = yamlValue(childValue, indent + 2);
    lines.push(`${prefix}${yamlKey(key)}:`);
    lines.push(...childLines);
  }

  return lines;
}

function yamlField(key: string, value: JsonValue | undefined) {
  if (value === undefined) return [];
  if (value === null || typeof value !== "object") return [`${yamlKey(key)}: ${JSON.stringify(value)}`];
  return [`${yamlKey(key)}:`, ...yamlValue(value, 2)];
}

function frontmatter(record: MtaCanonicalRecord) {
  return [
    "---",
    `managed_by: ${yamlScalar("mta-wiki-materializer")}`,
    `record_id: ${yamlScalar(record.record_id)}`,
    ...yamlField("record_aliases", record.record_aliases),
    `record_kind: ${yamlScalar(record.record_kind)}`,
    `display_name: ${yamlScalar(record.display_name)}`,
    `source_id: ${yamlScalar(record.source_id)}`,
    ...yamlField("source_ids", record.source_ids),
    `local_observation_id: ${yamlScalar(record.local_observation_id)}`,
    ...yamlField("local_observation_ids", record.local_observation_ids),
    `review_state: ${yamlScalar(record.review_state)}`,
    `truth_status: ${yamlScalar(record.truth_status)}`,
    `generated_at: ${yamlScalar(record.generated_at)}`,
    ...yamlField("raw_text", record.raw_text),
    "submission_ids:",
    ...record.submission_ids.map((id) => `  - ${yamlScalar(id)}`),
    ...yamlField("payload", record.payload),
    ...yamlField("evidence_refs", record.evidence_refs as unknown as JsonValue),
    "---",
  ].join("\n");
}

function writerText(existingContent: string | undefined) {
  const match = /<!-- mta-wiki:writer:start -->([\s\S]*?)<!-- mta-wiki:writer:end -->/u.exec(existingContent ?? "");
  const existingWriterText = match?.[1]?.trim();
  if (existingWriterText && existingWriterText !== "## Context\n\n_Writer context pending._") {
    return existingWriterText;
  }

  return "";
}

function writerRegion(existingContents: Array<string | undefined>) {
  const texts = uniqueStrings(existingContents.map(writerText));
  return ["<!-- mta-wiki:writer:start -->", texts.join("\n\n"), "<!-- mta-wiki:writer:end -->"].join("\n");
}

export function pageRelativePathForRecord(recordKind: MtaCanonicalRecord["record_kind"], sourceId: string, recordId: string) {
  const dir = PAGE_DIR_BY_KIND[recordKind];
  if (!dir) return undefined;
  const filename = recordKind === "source" ? sourceId : recordId;
  return ["wiki", dir, `${filename}.md`].join("/");
}

export function pageRelativePathForCanonicalRecord(record: MtaCanonicalRecord) {
  if (record.record_kind === "route" && routeRecordScope(record) === "data_only_scope") return undefined;
  return pageRelativePathForRecord(record.record_kind, record.source_id, record.record_id);
}

function pagePathFor(recordKind: MtaCanonicalRecord["record_kind"], sourceId: string, recordId: string) {
  const relativePath = pageRelativePathForRecord(recordKind, sourceId, recordId);
  return relativePath ? join(repoRoot, relativePath) : undefined;
}

function pagePath(record: MtaCanonicalRecord) {
  const relativePath = pageRelativePathForCanonicalRecord(record);
  return relativePath ? join(repoRoot, relativePath) : undefined;
}

export function writeCanonicalRecordPage(record: MtaCanonicalRecord) {
  const path = pagePath(record);
  if (!path) return undefined;

  if (record.record_kind === "source") {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, [frontmatter(record), "", sourceDocumentMarkdown(record.source_id)].join("\n"), "utf8");
    return path;
  }

  const aliasPaths = (record.record_aliases ?? [])
    .map((alias) => pagePathFor(record.record_kind, record.source_id, alias))
    .filter((candidate): candidate is string => typeof candidate === "string");
  const existingContents = [path, ...aliasPaths].map((candidate) => (existsSync(candidate) ? readFileSync(candidate, "utf8") : undefined));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, [frontmatter(record), "", writerRegion(existingContents), ""].join("\n"), "utf8");
  return path;
}

function writeIndex(records: MtaCanonicalRecord[]) {
  const pageRows = records.flatMap((record) => {
    const recordPagePath = pagePath(record);
    if (!recordPagePath) return [];
    const path = relative(repoRoot, recordPagePath).split("/").join("/");
    return `- [[${path.replace(/\.md$/u, "")}|${record.display_name}]] (${record.record_kind})`;
  });

  const dataOnlyCounts = new Map<string, number>();
  for (const record of records) {
    if (pagePath(record)) continue;
    dataOnlyCounts.set(record.record_kind, (dataOnlyCounts.get(record.record_kind) ?? 0) + 1);
  }
  const dataOnlyRows = [...dataOnlyCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) => `- ${kind}: ${count} canonical records in \`data/canonical/${FILE_BY_KIND.get(kind) ?? `${kind}.jsonl`}\``);

  const content = [
    "# MTA LLM Wiki",
    "",
    "## Pages",
    "",
    pageRows.length > 0 ? pageRows.join("\n") : "_No pages materialized yet._",
    "",
    "## Data-Only Records",
    "",
    dataOnlyRows.length > 0 ? dataOnlyRows.join("\n") : "_No data-only records materialized yet._",
    "",
  ].join("\n");
  mkdirSync(join(repoRoot, "wiki"), { recursive: true });
  writeFileSync(join(repoRoot, "wiki", "index.md"), content, "utf8");
}

function generatedWikiRoots() {
  return ["sources", "projects", "corridors", "routes", "gaps", "entities"].map((dir) => join(repoRoot, "wiki", dir));
}

/** Delete generated pages that no longer correspond to a current record. Post-cutover this scans
 *  the generated wiki roots directly (the filesystem is the prior state) rather than the retired
 *  data/materialized/page-index.json — strictly more robust: it also reaps orphans a stale index
 *  would have missed. Safety unchanged: source pages are fully materializer-owned (deleted when
 *  stale); other roots only delete pages carrying the materializer's managed marker. */
function removeStaleGeneratedPages(currentPagePaths: string[]) {
  const current = new Set(currentPagePaths);
  const sourcesRoot = join(repoRoot, "wiki", "sources");

  for (const root of generatedWikiRoots()) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      if (!name.endsWith(".md")) continue;
      const fullPath = join(root, name);
      if (current.has(fullPath)) continue;
      if (root === sourcesRoot) {
        unlinkSync(fullPath);
        continue;
      }
      const content = readFileSync(fullPath, "utf8");
      if (
        !content.includes('managed_by: "mta-wiki-materializer"') &&
        (!content.includes("<!-- mta-wiki:generated:start -->") || !content.includes("<!-- mta-wiki:generated:end -->"))
      ) {
        continue;
      }
      unlinkSync(fullPath);
    }
  }
}

export function materializeWiki(): MaterializeResult {
  const submissions = readSubmissionEntries();
  const retiredIds = retiredSubmissionIds();
  const acceptedSubmissions = materializableEntries(submissions, { retiredSubmissionIds: retiredIds });
  const semanticCorrections = readSemanticCorrections();
  const semanticCorrectionResult = withSemanticCorrections(
    entriesToRecords(submissions, { retiredSubmissionIds: retiredIds }),
    semanticCorrections,
    readSemanticCorrectionSupersessions(),
  );
  if (semanticCorrectionResult.issues.length > 0) {
    throw new Error(
      `semantic corrections rejected authoritative materialization (${semanticCorrectionResult.issues.length} issue(s)): ` +
        semanticCorrectionResult.issues.slice(0, 8).map((issue) => `${issue.code} ${issue.recordId ?? issue.path ?? ""}: ${issue.message}`).join("; "),
    );
  }
  const records = semanticCorrectionResult.records;
  const counts: Record<string, number> = {};

  // Authoritative JSONL is the source of truth, so the relationship contract must run over the
  // final in-memory record set before *any* generated file is changed. SQLite repeats these
  // invariants as a derived-store defense, but it cannot protect JSONL that was already written.
  // Build the evidence registry from the same final record set in memory. Reading the previous
  // generated index here would falsely reject newly staged, valid evidence (or accept a stale
  // hash) before the index can be rebuilt.
  const evidenceEntries = buildEvidenceBlockIndexEntries(records);
  const evidenceIndex: EvidenceBlockIndex = {
    byRef: new Map(evidenceEntries.map((entry) => [`${entry.source_id}\0${entry.block_id}`, entry])),
    sourceIds: new Set(evidenceEntries.map((entry) => entry.source_id)),
  };
  const relationshipContract = loadRelationshipContract();
  const relationshipAudit = auditRelationshipGraph(records, {
    mode: relationshipContractValidationMode(relationshipContract),
    contract: relationshipContract,
    includeOrphans: false,
    evidenceIndex,
  });
  const relationshipErrors = relationshipAudit.findings.filter((finding) => finding.severity === "error");
  if (relationshipErrors.length > 0) {
    const sample = relationshipErrors.slice(0, 8).map((finding) => `${finding.code} ${finding.record_id ?? finding.finding_id}`).join("; ");
    throw new Error(`relationship contract rejected authoritative materialization (${relationshipErrors.length} error(s)): ${sample}`);
  }
  const relationshipCompleteness = relationshipCompletenessForMaterialization(records, relationshipContract);

  writeEvidenceBlockIndex(records);
  mkdirSync(canonicalDir(), { recursive: true });
  for (const kind of CANONICAL_KINDS) {
    const kindRecords = records.filter((record) => record.record_kind === kind);
    counts[kind] = kindRecords.length;
    writeJsonl(join(canonicalDir(), FILE_BY_KIND.get(kind)!), kindRecords);
  }

  const pagePaths = records.map(writeCanonicalRecordPage).filter((path): path is string => typeof path === "string");
  removeStaleGeneratedPages(pagePaths);
  writeIndex(records);

  // record-index.json / page-index.json retired (Track A4): the canonical store is the live DB,
  // and stale-page cleanup now scans the wiki roots directly — no derived index files.

  // Additive: rebuild the canonical SQLite materialization alongside the JSONL above. Runs last,
  // so a build failure surfaces loudly without affecting the already-written JSONL/indexes.
  rebuildCanonicalDb(records, {
    submissions,
    identitySupersessions: semanticSupersessionIdentities(semanticCorrections),
    relationshipFindings: relationshipAudit.findings,
    relationshipCompleteness: relationshipCompleteness.mirror,
  });

  return {
    submissionsRead: submissions.length,
    acceptedSubmissions: acceptedSubmissions.length,
    retiredSubmissions: submissions.filter((entry) => retiredIds.has(entry.submission_id)).length,
    semanticCorrections: semanticCorrectionResult.summary,
    recordCounts: counts,
    pageCount: pagePaths.length,
    canonicalDir: canonicalDir(),
    wikiDir: join(repoRoot, "wiki"),
  };
}
