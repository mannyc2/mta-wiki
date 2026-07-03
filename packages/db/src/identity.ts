import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { repoRoot } from "@mta-wiki/core/paths";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaObservationKind, MtaSubmitObservationInput } from "./types.js";

export type GlobalMtaRecordKind = Extract<MtaObservationKind, "entity" | "project" | "corridor" | "route">;

export type IdentityCandidate = {
  record_id: string;
  record_kind: MtaObservationKind;
  display_name: string;
  source_ids: string[];
  local_observation_ids: string[];
  aliases: string[];
  score: number;
  reasons: string[];
};

export type IdentityOverrides = {
  version?: number | undefined;
  aliases?: Partial<Record<GlobalMtaRecordKind, Record<string, string>>> | undefined;
};

type IdentityDoNotMergeOverrides = {
  version?: number | undefined;
  pairs?: Partial<
    Record<
      GlobalMtaRecordKind,
      Array<{
        record_ids?: string[] | undefined;
        reason?: string | undefined;
        source_decision?: string | undefined;
        reviewed_at?: string | undefined;
      }>
    >
  > | undefined;
};

const GLOBAL_RECORD_KINDS = new Set<MtaObservationKind>(["entity", "project", "corridor", "route"]);

const PREFIX_BY_KIND: Partial<Record<MtaObservationKind, string>> = {
  treatment_component: "treatment",
  metric_claim: "metric",
  source_gap: "gap",
};

const READABLE_ALIASES_BY_KIND: Partial<Record<MtaObservationKind, string[]>> = {
  treatment_component: ["treatment-component", "treatment", "component"],
  metric_claim: ["metric-claim", "metric", "claim"],
  source_gap: ["source-gap", "gap"],
};

export function isGlobalRecordKind(kind: string | undefined): kind is GlobalMtaRecordKind {
  return Boolean(kind) && GLOBAL_RECORD_KINDS.has(kind as MtaObservationKind);
}

export function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 96);
}

export function recordKindPrefix(kind: MtaObservationKind | string) {
  return PREFIX_BY_KIND[kind as MtaObservationKind] ?? kind.replace(/_/gu, "-");
}

function readableAliases(kind: MtaObservationKind | string) {
  return READABLE_ALIASES_BY_KIND[kind as MtaObservationKind] ?? [kind.replace(/_/gu, "-")];
}

export function stripRedundantPrefix(kind: MtaObservationKind | string, readable: string) {
  for (const alias of readableAliases(kind)) {
    if (readable === alias) return "";
    if (readable.startsWith(`${alias}-`)) return readable.slice(alias.length + 1);
  }

  return readable;
}

export function recordBaseIdForInput(input: Pick<MtaSubmitObservationInput, "observation_kind" | "source_id" | "local_observation_id" | "label" | "raw_text">) {
  if (input.observation_kind === "source") return `source_${slug(input.source_id)}`;

  const prefix = recordKindPrefix(input.observation_kind);
  const readable = stripRedundantPrefix(input.observation_kind, slug(input.local_observation_id || input.label || input.raw_text || input.source_id));
  return `${prefix}_${readable || "record"}`;
}

function overridesPath() {
  return join(repoRoot, "data", "identity-overrides", "merges.json");
}

function doNotMergePath() {
  return join(repoRoot, "data", "identity-overrides", "do-not-merge.json");
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidIdentityOverrides(path: string, message: string): never {
  throw new Error(`Invalid identity override merges at ${path}: ${message}`);
}

export function parseIdentityOverrides(value: unknown, path = overridesPath()): IdentityOverrides {
  if (!isJsonObject(value)) return {};

  if (value.version !== undefined && value.version !== 1) {
    invalidIdentityOverrides(path, "field version must be 1 when present.");
  }

  const aliasesValue = value.aliases;
  if (aliasesValue === undefined) return { version: 1 };
  if (!isJsonObject(aliasesValue)) {
    invalidIdentityOverrides(path, "field aliases must be an object when present.");
  }

  const aliases: Partial<Record<GlobalMtaRecordKind, Record<string, string>>> = {};
  for (const [kind, kindAliasesValue] of Object.entries(aliasesValue)) {
    if (!isGlobalRecordKind(kind)) {
      invalidIdentityOverrides(path, `aliases contains unknown global record kind ${kind}.`);
    }
    if (!isJsonObject(kindAliasesValue)) {
      invalidIdentityOverrides(path, `aliases.${kind} must be an object.`);
    }

    const kindAliases: Record<string, string> = {};
    for (const [alias, target] of Object.entries(kindAliasesValue)) {
      if (typeof target !== "string" || !target.trim()) {
        invalidIdentityOverrides(path, `aliases.${kind}.${alias} must point to a non-empty string target.`);
      }
      kindAliases[alias] = target;
    }
    aliases[kind] = kindAliases;
  }

  return { version: 1, aliases };
}

export function readIdentityOverrides(): IdentityOverrides {
  const path = overridesPath();
  if (!existsSync(path)) return {};

  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseIdentityOverrides(parsed, path);
}

export function readIdentityDoNotMergeOverrides(): IdentityDoNotMergeOverrides {
  const path = doNotMergePath();
  if (!existsSync(path)) return {};

  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isJsonObject(parsed)) return {};

  return parsed as IdentityDoNotMergeOverrides;
}

export function identityPairKey(leftRecordId: string, rightRecordId: string) {
  return [leftRecordId, rightRecordId].sort().join("<>");
}

export function identityDoNotMergeSuppressed(kind: MtaObservationKind, leftRecordId: string, rightRecordId: string) {
  if (!isGlobalRecordKind(kind)) return false;

  const target = identityPairKey(leftRecordId, rightRecordId);
  return Boolean(
    readIdentityDoNotMergeOverrides()
      .pairs?.[kind]?.some((entry) => {
        const ids = entry.record_ids;
        return Array.isArray(ids) && ids.length === 2 && identityPairKey(ids[0]!, ids[1]!) === target;
      }),
  );
}

export function identityOverrideTarget(kind: MtaObservationKind, recordId: string) {
  if (!isGlobalRecordKind(kind)) return undefined;

  const aliases = readIdentityOverrides().aliases?.[kind];
  let next = aliases?.[recordId];
  const seen = new Set([recordId]);
  while (next && !seen.has(next)) {
    seen.add(next);
    const candidate = aliases?.[next];
    if (!candidate) return next;
    next = candidate;
  }

  return next;
}

export function canonicalRecordIdForInput(input: MtaSubmitObservationInput) {
  if (isGlobalRecordKind(input.observation_kind) && input.target_record_id) {
    return identityOverrideTarget(input.observation_kind, input.target_record_id) ?? input.target_record_id;
  }

  const baseId = recordBaseIdForInput(input);
  return identityOverrideTarget(input.observation_kind, baseId) ?? baseId;
}

function stringValue(value: JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayValues(value: JsonValue | undefined): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function payloadStrings(payload: JsonObject | undefined, fields: string[]) {
  const values: string[] = [];
  for (const field of fields) {
    const value = payload?.[field];
    const single = stringValue(value);
    if (single) values.push(single);
    values.push(...stringArrayValues(value));
  }
  return values;
}

function entityTypeText(payload: JsonObject | undefined) {
  return payloadStrings(payload, ["entity_type", "entity_category", "role"]).join(" ").toLowerCase();
}

function entityIdentitySurfaceKey(value: string) {
  const key = entityCanonicalId(value);
  return key ? identityOverrideTarget("entity", key) ?? key : undefined;
}

function agencyNameMatchesOwnIdentitySurface(agencyValues: string[], ownNameValues: string[]) {
  const ownKeys = new Set(ownNameValues.map(entityIdentitySurfaceKey).filter((value): value is string => Boolean(value)));
  if (ownKeys.size === 0) return false;
  return agencyValues.some((value) => {
    const key = entityIdentitySurfaceKey(value);
    return Boolean(key && ownKeys.has(key));
  });
}

function agencyLikeIdentitySurface(values: string[]) {
  const text = normalizedText(values.join(" "));
  const compact = compactText(text);
  return Boolean(
    compact === "mta" ||
      compact === "nycdot" ||
      compact === "nyct" ||
      text.includes("department") ||
      text.includes("authority") ||
      text.includes("agency") ||
      text.includes("administration") ||
      text.includes("bureau") ||
      text.includes("new york city transit") ||
      text.includes("department of transportation"),
  );
}

function entityAgencyNameIsIdentitySurface(payload: JsonObject | undefined, ownNameValues: string[]) {
  const agencyValues = payloadStrings(payload, ["agency_name"]);
  if (agencyValues.length === 0) return false;
  if (ownNameValues.length === 0) return true;
  if (agencyNameMatchesOwnIdentitySurface(agencyValues, ownNameValues)) return true;

  const typeText = entityTypeText(payload);
  if (/\b(person|official|commissioner|mayor|speaker|council|member|author|writer|team|office|staff|contact|consultant)\b/u.test(typeText)) {
    return false;
  }
  if (/\b(department|division|bureau|board|committee|office|unit|team|staff|role|position)\b/u.test(typeText)) {
    return false;
  }
  if (/\b(agency|authority|operator|organization|company)\b/u.test(typeText)) {
    return true;
  }
  return agencyLikeIdentitySurface(ownNameValues);
}

export function normalizedText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/\bnyc\s*dot\b/gu, "nycdot")
    .replace(/\bselect\s+bus\s+service\b/gu, "sbs")
    .replace(/\bavenue\b/gu, "ave")
    .replace(/\bstreet\b/gu, "st")
    .replace(/\broad\b/gu, "rd")
    .replace(/\bboulevard\b/gu, "blvd")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function compactText(value: string) {
  return normalizedText(value).replace(/\s+/gu, "");
}

function entityCanonicalId(value: string) {
  const compact = compactText(value);
  const normalized = normalizedText(value);

  if (
    compact === "nycdot" ||
    compact === "dot" ||
    compact === "nycdepartmentoftransportation" ||
    compact === "newyorkcitydot" ||
    compact === "newyorkcitydepartmentoftransportation"
  ) {
    return "entity_nyc-dot";
  }

  if (compact === "mta" || compact === "metropolitantransportationauthority") return "entity_mta";
  if (
    compact === "nyct" ||
    compact === "mtanyct" ||
    compact === "newyorkcitytransit" ||
    compact === "mtanewyorkcitytransit" ||
    compact === "metropolitantransportationauthoritynewyorkcitytransit"
  ) {
    return "entity_mta-nyct";
  }

  if (compact === "publicworkspartners") return "entity_public-works-partners";
  if (compact === "samschwartz" || compact === "samschwartzengineering") return "entity_sam-schwartz";
  if (compact === "trafficdatabank") return "entity_traffic-databank";

  return normalized ? `entity_${slug(normalized)}` : undefined;
}

const BOROUGH_KEY_BY_TEXT = new Map([
  ["bronx", "bronx"],
  ["the bronx", "bronx"],
  ["brooklyn", "brooklyn"],
  ["manhattan", "manhattan"],
  ["queens", "queens"],
  ["staten island", "staten-island"],
]);

function boroughKeyFromText(value: string | undefined) {
  if (!value) return undefined;
  const normalized = normalizedText(value);
  for (const [needle, borough] of BOROUGH_KEY_BY_TEXT) {
    if (normalized === needle || normalized.includes(needle)) return borough;
  }
  return undefined;
}

function payloadObjectStrings(payload: JsonObject | undefined, objectField: string, fields: string[]) {
  const value = payload?.[objectField];
  if (!isJsonObject(value)) return [];
  return payloadStrings(value, fields);
}

function communityBoardNumber(value: string) {
  const normalized = normalizedText(value);
  return /\bcommunity board (\d{1,2})\b/u.exec(normalized)?.[1] ?? /\bcb\s*(\d{1,2})\b/u.exec(normalized)?.[1];
}

function communityBoardBorough(payload: JsonObject | undefined, values: string[]) {
  for (const value of [
    ...values,
    ...payloadStrings(payload, ["borough", "boroughs", "borough_normalized", "boroughs_normalized", "description", "organization"]),
    ...payloadObjectStrings(payload, "extra_fields", ["borough", "boroughs"]),
  ]) {
    const borough = boroughKeyFromText(value);
    if (borough) return borough;
  }
  return undefined;
}

function isCommunityBoardCommittee(payload: JsonObject | undefined, values: string[]) {
  const text = normalizedText([...values, entityTypeText(payload)].join(" "));
  return /\bcommittee\b/u.test(text);
}

function communityBoardIdentityKeys(payload: JsonObject | undefined, seedStrings: string[]) {
  const values = [...seedStrings, ...payloadStrings(payload, ["entity_name", "name"])];
  if (isCommunityBoardCommittee(payload, values)) return [];

  const borough = communityBoardBorough(payload, values);
  if (!borough) return [];

  const keys = new Set<string>();
  for (const value of values) {
    const boardNumber = communityBoardNumber(value);
    if (boardNumber) keys.add(`entity_${borough}-community-board-${boardNumber}`);
  }
  return [...keys].sort();
}

function hasScopedCorridorGeography(payload: JsonObject | undefined) {
  return (
    payloadStrings(payload, ["limits", "from", "to", "borough", "boroughs", "borough_normalized", "boroughs_normalized"]).length > 0 ||
    payloadObjectStrings(payload, "location_normalized", ["limits", "from", "to", "borough", "boroughs"]).length > 0
  );
}

function isScopedCorridorSurface(value: string) {
  const lower = value.toLowerCase();
  const normalized = normalizedText(value);
  return (
    /[(),:]/u.test(value) ||
    /\b(?:between|from|to|at|north of|south of|east of|west of)\b/u.test(normalized) ||
    /\b(?:sbs|brt|busway|transitway|study area|phase|candidate)\b/u.test(normalized)
  );
}

function bareCorridorKeysForSurface(value: string) {
  if (isScopedCorridorSurface(value)) return [];
  const surfaces = [value];
  if (/\band\b/iu.test(value)) {
    surfaces.push(...value.split(/\s+and\s+/iu).map((part) => part.trim()));
  }
  return surfaces.flatMap((surface) => {
    const key = corridorCanonicalId(surface);
    return key ? [key] : [];
  });
}

function pruneScopedCorridorKeys(payload: JsonObject | undefined, keys: Set<string>, seedStrings: string[], protectedKeys: Set<string>) {
  if (!hasScopedCorridorGeography(payload)) return;

  const bareKeys = new Set<string>();
  for (const value of [...seedStrings, ...payloadStrings(payload, ["corridor_name", "name", "street", "streets"])]) {
    for (const key of bareCorridorKeysForSurface(value)) {
      bareKeys.add(key);
    }
  }

  for (const key of bareKeys) {
    if (!protectedKeys.has(key)) keys.delete(key);
  }
}

function pruneGenericCommunityAdvisoryCommitteeKeys(keys: Set<string>, protectedKeys: Set<string>) {
  const genericKeys = ["entity_community-advisory-committee", "entity_community-advisory-committee-cac"];
  const hasSpecificCacKey = [...keys].some((key) => {
    if (genericKeys.includes(key)) return false;
    return key.startsWith("entity_community-advisory-committee-") || key.endsWith("-cac");
  });
  if (!hasSpecificCacKey) return;

  for (const key of genericKeys) {
    if (!protectedKeys.has(key)) keys.delete(key);
  }
}

const GENERIC_SCOPED_ENTITY_ROLE_KEYS = new Set(["entity_president", "entity_chief-safety-officer"]);

function pruneGenericScopedEntityRoleKeys(keys: Set<string>, protectedKeys: Set<string>) {
  for (const key of GENERIC_SCOPED_ENTITY_ROLE_KEYS) {
    if (!keys.has(key) || protectedKeys.has(key)) continue;

    const tail = key.slice("entity_".length);
    const hasScopedRoleKey = [...keys].some((other) => other !== key && (other.startsWith(`${key}-`) || other.endsWith(`-${tail}`)));
    if (hasScopedRoleKey) keys.delete(key);
  }
}

function pruneGrandCentralMadisonOperatingCompanyAliases(payload: JsonObject | undefined, keys: Set<string>, protectedKeys: Set<string>) {
  const hay = normalizedText(payloadStrings(payload, ["entity_name", "name", "acronym", "description", "entity_type"]).join(" "));
  const isGcmOperatingCompany =
    hay.includes("grand central madison concourse operating company") ||
    hay.includes("grand central madison operating company") ||
    /\bgcmc?oc\b/u.test(hay);
  const isGrandCentralMadisonStation =
    !isGcmOperatingCompany &&
    (hay.includes("grand central madison") || /\bgcm\b/u.test(hay)) &&
    (hay.includes("station") || hay.includes("terminal"));

  if (isGrandCentralMadisonStation) {
    for (const key of [...keys]) {
      if (!protectedKeys.has(key) && (key.includes("gcmoc") || key.includes("gcmcoc") || key.includes("gcmco"))) keys.delete(key);
    }
  }
  if (isGcmOperatingCompany && !protectedKeys.has("entity_grand-central-madison")) {
    keys.delete("entity_grand-central-madison");
  }
}

const REVIEWED_BROAD_PROJECT_KEY_PRUNES: Record<string, readonly string[]> = {
  "project_2017-sip-woodhaven-blvd-cb5-sept2024": ["project_2017-st-improvement-project"],
  "project_2017-street-improvement-79th": ["project_2017-st-improvement-project"],
  "project_jamaica-capacity-improvement-phase2": ["project_jamaica-capacity-improvement-project"],
  "project_lirr-security-initiatives": ["project_security-initiatives"],
  "project_security-initiatives-nyct": ["project_security-initiatives"],
  "project_fordham-rd-bus-priority-cb5-may2026": ["project_fordham-rd-bus-priority"],
};

const REVIEWED_BROAD_ENTITY_KEY_PRUNES: Record<string, readonly string[]> = {
  "entity_meeting-doc-111791-michael-baker": ["entity_independent-engineering-consultant"],
  "entity_meeting-doc-64066-mta": ["entity_mta"],
  "entity_meeting-doc-155136-bloomberg": ["entity_bloomberg"],
  "entity_mta-metropolitan-transportation-authority": ["entity_mta", "entity_metropolitan-transportation-authority-mta"],
  "entity_mta-nyct-evp-frank-farrell": ["entity_frank-farrell"],
  "entity_mta-real-estate": ["entity_mta-real-estate-department"],
  "entity_mta-tod-meeting-doc-160301": [
    "entity_mta-real-estate-tod",
    "entity_mta-transit-oriented-development",
    "entity_mta-transit-oriented-development-tod",
  ],
  "entity_ny-state-dot": ["entity_new-york-state-department-of-transportation"],
  "entity_nyct-dos-dob-mtabc-201766": ["entity_nyc-transit-department-of-subways"],
};

const REVIEWED_EXACT_ENTITY_KEY_REPLACEMENTS: Record<string, { add: readonly string[]; remove: readonly string[] }> = {
  "entity_community-board-1-bronx-2012-02": {
    add: ["entity_bronx-community-board-1"],
    remove: ["entity_community-board-1"],
  },
};

function pruneReviewedBroadProjectKeys(keys: Set<string>, protectedKeys: Set<string>) {
  for (const recordId of protectedKeys) {
    for (const key of REVIEWED_BROAD_PROJECT_KEY_PRUNES[recordId] ?? []) {
      if (!protectedKeys.has(key)) keys.delete(key);
    }
  }
}

function applyReviewedExactEntityKeyReplacements(keys: Set<string>, protectedKeys: Set<string>) {
  for (const recordId of protectedKeys) {
    const replacement = REVIEWED_EXACT_ENTITY_KEY_REPLACEMENTS[recordId];
    if (!replacement) continue;
    for (const key of replacement.add) {
      keys.add(key);
    }
    for (const key of replacement.remove) {
      if (!protectedKeys.has(key)) keys.delete(key);
    }
  }
}

function pruneReviewedBroadEntityKeys(keys: Set<string>, protectedKeys: Set<string>) {
  for (const recordId of protectedKeys) {
    for (const key of REVIEWED_BROAD_ENTITY_KEY_PRUNES[recordId] ?? []) {
      if (!protectedKeys.has(key)) keys.delete(key);
    }
  }
}

export function pruneUnderSpecifiedIdentityKeys(
  kind: MtaObservationKind | string,
  payload: JsonObject | undefined,
  keys: Set<string>,
  seedStrings: string[] = [],
  protectedKeys: Set<string> = new Set(),
) {
  if (kind === "entity") {
    const communityBoardKeys = communityBoardIdentityKeys(payload, seedStrings);
    for (const key of communityBoardKeys) {
      const boardNumber = /community-board-(\d{1,2})$/u.exec(key)?.[1];
      if (boardNumber) keys.delete(`entity_community-board-${boardNumber}`);
    }
    pruneGenericCommunityAdvisoryCommitteeKeys(keys, protectedKeys);
    pruneGenericScopedEntityRoleKeys(keys, protectedKeys);
    pruneGrandCentralMadisonOperatingCompanyAliases(payload, keys, protectedKeys);
    applyReviewedExactEntityKeyReplacements(keys, protectedKeys);
    pruneReviewedBroadEntityKeys(keys, protectedKeys);
  } else if (kind === "project") {
    pruneReviewedBroadProjectKeys(keys, protectedKeys);
  } else if (kind === "corridor") {
    pruneScopedCorridorKeys(payload, keys, seedStrings, protectedKeys);
  } else if (kind === "route") {
    pruneGenericRouteKeys(keys);
  }
}

function compactRouteToken(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/gu, "");
}

const ROUTE_STRUCTURED_IDENTITY_FIELDS = ["route_id", "route_label", "route_name", "route", "internal_route_id", "branding_label"];

function routeBundleCanonicalId(value: string) {
  const upper = value.toUpperCase();
  if (!upper.includes("/")) return undefined;
  if ((upper.match(/\//gu) ?? []).length !== 1) return undefined;
  if (/\bM\s*14\s*(?:A\s*\/\s*D|A\s*D|AD)\b/u.test(upper)) return undefined;

  const match = /\b((?:SIM|BX|[BMQSX])\s*-?\s*\d{1,3}[A-Z]?)\s*\/\s*((?:SIM|BX|[BMQSX])?\s*-?\s*\d{1,3}[A-Z]?|[A-Z])\b/u.exec(upper);
  if (!match?.[1] || !match[2]) return undefined;

  const left = compactRouteToken(match[1]);
  let right = compactRouteToken(match[2]);
  const leftParts = /^(SIM|BX|[BMQSX])(\d{1,3})([A-Z]?)$/u.exec(left);
  if (!leftParts) return undefined;

  if (/^\d{1,3}[A-Z]?$/u.test(right)) right = `${leftParts[1]}${right}`;
  else if (/^[A-Z]$/u.test(right) && leftParts[3]) right = `${leftParts[1]}${leftParts[2]}${right}`;

  if (left === right || !/^(SIM|BX|[BMQSX])\d{1,3}[A-Z]?$/u.test(right)) return undefined;
  return `route_${left.toLowerCase()}-${right.toLowerCase()}`;
}

function routeTokensFromIdentitySurface(value: string) {
  const tokens = new Set<string>();
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]+/gu, " ").replace(/\s+/gu, " ").trim();
  for (const match of normalized.matchAll(/\b(?:SIM|BX|[BMQSX])\s*\d{1,3}[A-Z]?\b/gu)) {
    tokens.add(match[0]!.replace(/\s+/gu, ""));
  }
  return [...tokens];
}

function hasSingleStructuredRouteIdentity(payload: JsonObject | undefined, structuredValues = payloadStrings(payload, ROUTE_STRUCTURED_IDENTITY_FIELDS)) {
  if (stringArrayValues(payload?.routes).length > 1) return false;
  if (structuredValues.some((value) => routeBundleCanonicalId(value))) return false;

  const tokens = new Set<string>();
  for (const value of structuredValues) {
    for (const token of routeTokensFromIdentitySurface(value)) {
      tokens.add(token);
    }
  }
  return tokens.size === 1;
}

function routeShuttleCanonicalId(value: string) {
  const normalized = normalizedText(value);
  if (!/\bshuttle\b/u.test(normalized)) return undefined;

  if (/\b42\s*st\b/u.test(normalized) || normalized.includes("times square") || normalized.includes("grand central")) {
    return "route_s-42-st-shuttle";
  }
  if (normalized.includes("rockaway park") || normalized.includes("broad channel") || normalized.includes("beach 116")) {
    return "route_s-rockaway-park-shuttle";
  }
  if (normalized.includes("franklin ave")) {
    return "route_s-franklin-ave-shuttle";
  }

  return undefined;
}

const SUBWAY_ROUTE_TOKENS = new Set(["A", "C", "E", "F", "G", "J", "L", "N", "Q", "R", "W", "Z", "1", "2", "3", "4", "5", "6", "7"]);

function subwayRouteToken(value: string) {
  const upper = value.toUpperCase();
  const compact = upper.replace(/[^A-Z0-9]+/gu, "");
  if (SUBWAY_ROUTE_TOKENS.has(compact)) return compact;

  const match = /\b(A|C|E|F|G|J|L|N|Q|R|W|Z|[1-7])\s*(?:TRAIN|SUBWAY|LINE)\b/u.exec(upper);
  return match?.[1];
}

function hasSubwayRouteContext(payload: JsonObject | undefined, seedStrings: string[]) {
  const values = [
    ...seedStrings,
    ...payloadStrings(payload, ["mode", "route_type", "route_type_normalized", "route_name", "route_label", "description"]),
  ];
  const text = normalizedText(values.join(" "));
  return /\bsubway\b/u.test(text) || /\btrain\b/u.test(text);
}

function routeCanonicalId(value: string, options: { plusIsSbsAlias?: boolean } = {}) {
  const bundleKey = routeBundleCanonicalId(value);
  if (bundleKey) return bundleKey;

  const shuttleKey = routeShuttleCanonicalId(value);
  if (shuttleKey) return shuttleKey;

  const upper = value.toUpperCase().replace(/SELECT\s*BUS\s*SERVICE/gu, "SBS");
  const m14ad = /\bM\s*14\s*(?:A\s*\/\s*D|A\s*D|AD)\b/u.test(upper);
  const routeMatch = m14ad ? undefined : /\b(BX|[BMQS])\s*-?\s*(\d{1,3}[A-Z]?)(\+)?(?=\W|$|SBS)/u.exec(upper);
  const route = m14ad ? "M14-AD" : routeMatch ? `${routeMatch[1]}${routeMatch[2]}` : undefined;
  if (!route) return undefined;

  const normalizedValue = normalizedText(value);
  const isSbs = (options.plusIsSbsAlias && routeMatch?.[3] === "+") || /\bSBS\b/u.test(upper) || normalizedValue.includes("sbs");
  const isLocalLimited = !isSbs && /\blocal\b/u.test(normalizedValue) && /\blimited\b/u.test(normalizedValue);
  const isLocal = !isSbs && !isLocalLimited && /\blocal\b/u.test(normalizedValue);
  const isLimited = !isSbs && !isLocalLimited && !isLocal && /\blimited\b/u.test(normalizedValue);
  const suffix = isSbs ? "-sbs" : isLocalLimited ? "-local-limited" : isLocal ? "-local" : isLimited ? "-limited" : "";
  return `route_${route.toLowerCase()}${suffix}`;
}

function routeSubwayKeysForPayload(payload: JsonObject | undefined, seedStrings: string[]) {
  if (!hasSubwayRouteContext(payload, seedStrings)) return [];

  const keys = new Set<string>();
  for (const value of [...payloadStrings(payload, ["route_id", "route_label", "route_name", "route"]), ...seedStrings]) {
    const token = subwayRouteToken(value);
    if (token) keys.add(`route_${token.toLowerCase()}-subway`);
  }
  return [...keys].sort();
}

function projectCanonicalId(value: string) {
  const normalized = normalizedText(value).replace(/\bttp\b/gu, "transit truck priority");
  const compact = normalized.replace(/\s+/gu, "");
  if (compact.includes("14thsttransittruckprioritypilot")) return "project_14th-street-transit-truck-priority-pilot";
  return normalized ? `project_${slug(normalized)}` : undefined;
}

function corridorCanonicalId(value: string) {
  const normalized = normalizedText(value).replace(/\bttp\b/gu, "transit truck priority");
  const compact = normalized.replace(/\s+/gu, "");
  if (compact.includes("14thsttransittruckpriority") || compact.includes("14thstbusway") || compact.includes("14thstttp")) {
    return "corridor_14th-street-ttp";
  }
  return normalized ? `corridor_${slug(normalized)}` : undefined;
}

function pruneGenericRouteKeys(keys: Set<string>) {
  for (const key of [...keys]) {
    const specific = /^route_(.+?)-(?:local-limited|sbs|local|limited|ltd|express)(?:-|$)/u.exec(key);
    if (specific?.[1]) {
      const letterSuffixedBusBase = /^((?:sim|bx|[bmqsx])\d{1,3})[a-z]$/u.exec(specific[1]);
      keys.delete(`route_${letterSuffixedBusBase?.[1] ?? specific[1]}`);
    }
    const letterSuffixedBus = /^route_((?:sim|bx|[bmqsx])\d{1,3})[a-z]$/u.exec(key);
    if (letterSuffixedBus?.[1]) keys.delete(`route_${letterSuffixedBus[1]}`);
  }
}

function routeBundleKeyForPayload(payload: JsonObject | undefined, seedStrings: string[]) {
  const structuredValues = payloadStrings(payload, ROUTE_STRUCTURED_IDENTITY_FIELDS);
  for (const value of structuredValues) {
    const key = routeBundleCanonicalId(value);
    if (key) return key;
  }

  const routes = stringArrayValues(payload?.routes);
  if (routes.length === 2) {
    const tokens = routes.map(compactRouteToken).filter((route) => /^(SIM|BX|[BMQSX])\d{1,3}[A-Z]?$/u.test(route));
    if (tokens.length >= 2) return `route_${tokens.slice(0, 2).map((token) => token.toLowerCase()).join("-")}`;
  }

  if (hasSingleStructuredRouteIdentity(payload, structuredValues)) return undefined;

  for (const value of seedStrings) {
    const key = routeBundleCanonicalId(value);
    if (key) return key;
  }
  return undefined;
}

export function identityKeysForInput(input: MtaSubmitObservationInput): string[] {
  const keys = new Set<string>([recordBaseIdForInput(input)]);
  const payload = input.payload;
  const seedStrings = [input.label].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (input.observation_kind === "entity") {
    const ownNameValues = [...seedStrings, ...payloadStrings(payload, ["entity_name", "name"])];
    const agencyNameValues = entityAgencyNameIsIdentitySurface(payload, ownNameValues) ? payloadStrings(payload, ["agency_name"]) : [];
    for (const value of [...ownNameValues, ...agencyNameValues]) {
      const key = entityCanonicalId(value);
      if (key) keys.add(key);
    }
    for (const key of communityBoardIdentityKeys(payload, seedStrings)) {
      keys.add(key);
    }
    pruneUnderSpecifiedIdentityKeys(input.observation_kind, payload, keys, seedStrings);
  } else if (input.observation_kind === "route") {
    const bundleKey = routeBundleKeyForPayload(payload, seedStrings);
    if (bundleKey) {
      keys.add(bundleKey);
      for (const key of [...keys]) {
        keys.add(identityOverrideTarget(input.observation_kind, key) ?? key);
      }
      return [...keys].sort();
    }

    for (const key of routeSubwayKeysForPayload(payload, seedStrings)) {
      keys.add(key);
    }

    const routeIdAuthority = stringValue(payload?.route_id_authority);
    const sourceRouteSurface = stringValue(payload?.source_route_surface);
    const hasMtaRouteIdAuthority = Boolean(
      routeIdAuthority?.toLowerCase().includes("mta") ||
        ["gtfs", "bustime", "bus_time", "ace", "mta_route_id", "mta_internal"].includes(sourceRouteSurface?.toLowerCase() ?? ""),
    );
    for (const value of seedStrings) {
      if (hasSingleStructuredRouteIdentity(payload) && routeBundleCanonicalId(value)) continue;
      const key = routeCanonicalId(value, { plusIsSbsAlias: hasMtaRouteIdAuthority });
      if (key) keys.add(key);
    }
    for (const value of payloadStrings(payload, ["route_id", "internal_route_id"])) {
      const key = routeCanonicalId(value, { plusIsSbsAlias: true });
      if (key) keys.add(key);
    }
    for (const value of payloadStrings(payload, ["route_name", "route", "route_label", "branding_label"])) {
      const key = routeCanonicalId(value, { plusIsSbsAlias: hasMtaRouteIdAuthority });
      if (key) keys.add(key);
    }
    pruneGenericRouteKeys(keys);
  } else if (input.observation_kind === "project") {
    for (const value of [...seedStrings, ...payloadStrings(payload, ["project_name", "name"])]) {
      const key = projectCanonicalId(value);
      if (key) keys.add(key);
    }
    pruneUnderSpecifiedIdentityKeys(input.observation_kind, payload, keys, seedStrings, new Set([recordBaseIdForInput(input)]));
  } else if (input.observation_kind === "corridor") {
    for (const value of [...seedStrings, ...payloadStrings(payload, ["corridor_name", "name"])]) {
      const key = corridorCanonicalId(value);
      if (key) keys.add(key);
    }
    pruneUnderSpecifiedIdentityKeys(input.observation_kind, payload, keys, seedStrings, new Set([recordBaseIdForInput(input)]));
  }

  for (const key of [...keys]) {
    keys.add(identityOverrideTarget(input.observation_kind, key) ?? key);
  }

  return [...keys].sort();
}

export function canonicalIdentityForInput(input: MtaSubmitObservationInput) {
  if (!isGlobalRecordKind(input.observation_kind)) {
    return {
      kind: input.observation_kind,
      source_id: input.source_id,
      local_observation_id: input.local_observation_id,
    };
  }

  const target = canonicalRecordIdForInput(input);
  return {
    kind: input.observation_kind,
    target_record_id: target,
  };
}

function recordSourceIds(record: MtaCanonicalRecord) {
  return [...new Set([...(record.source_ids ?? []), record.source_id])].sort();
}

function recordLocalObservationIds(record: MtaCanonicalRecord) {
  return [...new Set([...(record.local_observation_ids ?? []), record.local_observation_id])].sort();
}

function recordAliases(record: MtaCanonicalRecord) {
  return [...new Set([...(record.record_aliases ?? []), record.record_id])].sort();
}

// identityKeysForRecord is a deterministic pure function of a record, but the identity-candidate
// scan calls it O(n) times per query (O(n²) across a dup sweep). Memoize on record-object identity
// so it is computed once per record; records from readCanonicalRecords are fresh per read and never
// mutated by callers (all consumers treat the result as read-only), so the cache is always correct.
const identityKeysCache = new WeakMap<MtaCanonicalRecord, string[]>();

export function identityKeysForRecord(record: MtaCanonicalRecord): string[] {
  const cached = identityKeysCache.get(record);
  if (cached) return cached;
  const input: MtaSubmitObservationInput = {
    source_id: record.source_id,
    observation_kind: record.record_kind,
    local_observation_id: record.local_observation_id,
    label: record.display_name,
    raw_text: record.raw_text,
    payload: record.payload,
    evidence_refs: [],
  };
  const keySet = new Set([...recordAliases(record), ...identityKeysForInput(input)]);
  pruneUnderSpecifiedIdentityKeys(record.record_kind, record.payload, keySet, [record.display_name], new Set([record.record_id]));
  if (record.record_kind === "route") pruneGenericRouteKeys(keySet);
  const keys = [...keySet].sort();
  identityKeysCache.set(record, keys);
  return keys;
}

export function queryKeys(kind: GlobalMtaRecordKind, query: string) {
  return identityKeysForInput({
    source_id: "",
    observation_kind: kind,
    local_observation_id: query,
    label: query,
    payload: {},
    evidence_refs: [],
  });
}

function stringSimilarityScore(query: string, values: string[]) {
  const q = normalizedText(query);
  if (!q) return 0;

  let score = 0;
  for (const value of values) {
    const candidate = normalizedText(value);
    if (!candidate) continue;
    if (candidate === q) score = Math.max(score, 90);
    else if (candidate.includes(q) || q.includes(candidate)) score = Math.max(score, 70);
    else if (compactText(candidate) === compactText(q)) score = Math.max(score, 85);
  }
  return score;
}

/** The string values the identity scorer compares a query against — the single surface shared by
 *  the scorer, the FTS index (recordNamesText), and the FTS short-name fallback. */
export function recordScorableValues(record: MtaCanonicalRecord): string[] {
  return [
    record.record_id,
    record.display_name,
    record.local_observation_id,
    ...(record.record_aliases ?? []),
    ...payloadStrings(record.payload, [
      "entity_name",
      "name",
      "agency_name",
      "short_name",
      "acronym",
      "project_name",
      "corridor_name",
      "street",
      "route_id",
      "route_name",
      "route_label",
    ]),
  ];
}

export function resolveIdentityCandidates(kind: GlobalMtaRecordKind, query: string, records: MtaCanonicalRecord[], limit = 8): IdentityCandidate[] {
  const keys = new Set(queryKeys(kind, query));
  const normalizedQuery = normalizedText(query);
  const results: IdentityCandidate[] = [];

  for (const record of records) {
    if (record.record_kind !== kind) continue;

    const aliases = identityKeysForRecord(record);
    const shared = aliases.filter((alias) => keys.has(alias));
    const values = recordScorableValues(record);
    const textScore = stringSimilarityScore(normalizedQuery, values);
    const score = Math.max(shared.length > 0 ? 100 : 0, textScore);
    if (score <= 0) continue;

    results.push({
      record_id: record.record_id,
      record_kind: record.record_kind,
      display_name: record.display_name,
      source_ids: recordSourceIds(record),
      local_observation_ids: recordLocalObservationIds(record),
      aliases,
      score,
      reasons: shared.length > 0 ? shared.map((alias) => `identity key ${alias}`) : [`text similarity ${textScore}`],
    });
  }

  return results.sort((a, b) => b.score - a.score || a.record_id.localeCompare(b.record_id)).slice(0, Math.max(1, limit));
}

// ---- A5 FTS5 superset-then-verify prefilter (docs/step-2-implementation-plan.md §S2.3) ----------
// records_fts (trigram, populated from recordNamesText) shortlists candidate record_ids; the scorer
// above stays the decider. The shortlist must be a SUPERSET of every record the scorer scores > 0.
// The scorer matches on normalizedText/compactText of the record's values via substring-EITHER-way,
// compact equality, or a shared identity key. Trigram FTS finds `candidate.includes(q)` cheaply but
// not `q.includes(candidate)` (a record name that is a substring of the query) — so the shortlist
// query ORs every ≥3-char substring of the normalized query (each is a possible candidate name),
// plus the compact query (compact-equality) and the derived identity keys (shared-key). Names < 3
// chars cannot be trigram-indexed at all (single-letter subway routes "B"/"E"/"R"), so the caller
// always unions records whose value surface has a < 3-char member. Together = a true superset; the
// frozen-corpus equivalence test is the proof.

const MAX_QUERY_LEN = 80; // bound substring generation; record names are short
const MAX_FTS_MATCH_TERMS = 128; // beyond this, full-scan is safer than a huge trigram OR.

function substringsMinTrigram(text: string): string[] {
  const clipped = text.slice(0, MAX_QUERY_LEN);
  const out = new Set<string>();
  for (let i = 0; i < clipped.length; i += 1) {
    for (let j = i + 3; j <= clipped.length; j += 1) out.add(clipped.slice(i, j));
  }
  return [...out];
}

/** record_ids whose name surface trigram-matches the query — a superset of the scorer's > 0 set for
 *  candidates with a ≥3-char name (the < 3-char ones are added by the caller). Undefined when the
 *  query yields no usable term, so the caller full-scans. */
export function ftsIdentityShortlist(db: Database, kind: GlobalMtaRecordKind, query: string): Set<string> | undefined {
  // A query below the trigram floor (e.g. the route "M2") cannot be trigram-searched against records
  // that CONTAIN it as a substring ("QM2", "QM24"): there is no ≥3-char substring of a <3-char query
  // to MATCH on, so no shortlist can be a true superset for the scorer's `record.includes(query)`
  // matches. An incidental ≥3-char identity-key term would otherwise make the shortlist
  // defined-but-incomplete and silently drop those candidates. Full-scan instead — this is the
  // query-side analog of recordBelowTrigramFloor, and short-route queries are rare. (W3's Queens
  // QM* routes surfaced this; the frozen-corpus equivalence test is the proof.)
  if (queryBelowTrigramFloor(query)) return undefined;
  const terms = new Set<string>([...substringsMinTrigram(normalizedText(query)), compactText(query), ...queryKeys(kind, query)]);
  const usable = [...terms].filter((term) => term.length >= 3);
  if (usable.length === 0) return undefined;
  // Long display-name queries can expand into hundreds of substring terms. Those broad OR MATCH
  // expressions are slower than the verifier and have triggered readonly FTS rollback writes in
  // Bun/SQLite after repeated live-corpus scans. Falling back keeps the resolver exact.
  if (usable.length > MAX_FTS_MATCH_TERMS) return undefined;
  const match = usable.map((term) => `"${term.replace(/"/gu, '""')}"`).join(" OR ");
  const rows = db.query("SELECT record_id FROM records_fts WHERE records_fts MATCH ?").all(match) as Array<{ record_id: string }>;
  return new Set(rows.map((row) => row.record_id));
}

/** A record the FTS index cannot represent: some scorable value normalizes/compacts to < 3 chars,
 *  below the trigram floor. These must always be in the shortlist (the scorer can match them via
 *  `query.includes(shortName)`). */
export function recordBelowTrigramFloor(record: MtaCanonicalRecord): boolean {
  return recordScorableValues(record).some((value) => {
    const normalized = normalizedText(value);
    return normalized.length > 0 && (normalized.length < 3 || compactText(value).length < 3);
  });
}

/** A query the FTS index cannot represent as a containment search: its normalized/compact form is
 *  < 3 chars, so no trigram shortlist can be a superset for records that contain it. The caller
 *  full-scans instead. (Query-side analog of recordBelowTrigramFloor.) */
export function queryBelowTrigramFloor(query: string): boolean {
  return normalizedText(query).length < 3 || compactText(query).length < 3;
}

/** Superset-then-verify: FTS shortlists, the in-memory scorer decides. Equal to
 *  resolveIdentityCandidates over all records when the shortlist is a true superset (the equivalence
 *  test's invariant). Not yet wired into the production resolve path — it stays full-scan and correct
 *  until the corpus is large enough for the prefilter to matter. */
export function resolveIdentityCandidatesViaFts(
  db: Database,
  kind: GlobalMtaRecordKind,
  query: string,
  records: MtaCanonicalRecord[],
  limit = 8,
): IdentityCandidate[] {
  const shortlist = ftsIdentityShortlist(db, kind, query);
  const scoped = shortlist ? records.filter((record) => shortlist.has(record.record_id) || recordBelowTrigramFloor(record)) : records;
  return resolveIdentityCandidates(kind, query, scoped, limit);
}
