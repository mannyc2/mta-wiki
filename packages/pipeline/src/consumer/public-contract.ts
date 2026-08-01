export const PUBLIC_PACK_CONTRACT_ID = "resolved-transit-public-pack-v1" as const;

export const PUBLIC_RESOURCE_ROLES = [
  ["public_intervention_episodes.jsonl", "historical_episodes"],
  ["public_intervention_components.jsonl", "exact_components"],
  ["public_intervention_placements.jsonl", "stable_placements"],
  ["public_routes.jsonl", "route_dictionary"],
  ["public_treatment_families.jsonl", "treatment_dictionary"],
  ["public_route_intervention_index.jsonl", "route_component_index"],
  ["public_intervention_history.jsonl", "history"],
  ["public_current_footprint.jsonl", "confirmed_current"],
  ["public_network_summary.json", "completeness_summary"],
  ["public_sources.jsonl", "source_dictionary"],
] as const;

export type PublicOnsetPrecision = "day" | "month" | "season" | "year" | "upper_bound_day";
export type PublicOnset = { date: string; precision: PublicOnsetPrecision };
export type PublicSourceRef = { source_key: string };
export type PublicAction = "add" | "modify" | "remove" | "suspend" | "resume" | "retain" | "unknown";
export type PublicExtentKind = "route_wide" | "bounded_segment" | "stop_set" | "service_pattern" | "unknown";
export type PublicPlacementState =
  | "confirmed_active" | "last_confirmed_active" | "confirmed_inactive" | "planned"
  | "suspended" | "conflicted" | "unknown";

export type PublicPackManifest = {
  schema_version: 1;
  contract_id: typeof PUBLIC_PACK_CONTRACT_ID;
  as_of_date: string;
  resources: Array<{ name: typeof PUBLIC_RESOURCE_ROLES[number][0]; role: typeof PUBLIC_RESOURCE_ROLES[number][1] }>;
};
export type PublicEpisode = {
  schema_version: 1;
  intervention_id: string;
  display_name: string;
  aliases: string[];
  onset: PublicOnset;
  route_keys: string[];
  intervention_component_keys: string[];
  treatment_family_keys: string[];
  source_refs: PublicSourceRef[];
  classification: "historical_episode";
};
export type PublicComponent = {
  schema_version: 1;
  intervention_id: string;
  intervention_component_key: string;
  route_key: string;
  gtfs_route_id: string;
  treatment_family_key: string;
  treatment_family_label: string;
  applicability: "applies";
  action: PublicAction;
  action_label: string;
  extent: { kind: PublicExtentKind; label: string; description: string | null };
  details: string;
  caveats: string[];
  source_refs: PublicSourceRef[];
};
export type PublicPlacement = {
  schema_version: 1;
  placement_key: string;
  founding_intervention_component_key: string | null;
  route_key: string;
  treatment_family_key: string;
  scope: { kind: PublicExtentKind };
  state_as_of: PublicPlacementState;
  as_of_date: string;
};
export type PublicRoute = {
  schema_version: 1;
  route_key: string;
  gtfs_route_id: string;
  display_name: string;
  aliases: string[];
};
export type PublicTreatmentFamily = {
  schema_version: 1;
  treatment_family_key: string;
  display_name: string;
};
export type PublicRouteIndexRow = {
  schema_version: 1;
  route_key: string;
  intervention_id: string;
  intervention_component_key: string;
  treatment_family_key: string;
  action: PublicAction;
};
export type PublicComponentHistory = PublicRouteIndexRow & {
  history_kind: "component_application";
  onset: PublicOnset;
};
export type PublicPlacementTransitionHistory = {
  schema_version: 1;
  history_kind: "placement_transition";
  intervention_id: string;
  intervention_component_key: string;
  action: PublicAction;
  target_placement_keys: string[];
  result_placement_keys: string[];
};
export type PublicHistory = PublicComponentHistory | PublicPlacementTransitionHistory;
export type PublicCurrentFootprint = {
  schema_version: 1;
  placement_key: string;
  route_key: string;
  treatment_family_key: string;
  scope: { kind: PublicExtentKind };
  state: "confirmed_active";
  as_of_date: string;
};
export type PublicSource = {
  schema_version: 1;
  source_key: string;
  title: string;
  publisher: string | null;
  date: string | null;
  url: string | null;
  url_status: "source_provided" | "accepted_override" | "unavailable";
};
export type PublicNetworkSummary = {
  schema_version: 1;
  as_of_date: string;
  reviewed_historical_episode_count: number;
  exact_component_count: number;
  exact_route_component_incidence_count: number;
  resolved_placement_count: number;
  confirmed_current_placement_count: number;
  confirmed_current_route_count: number;
  placement_counts_by_state: Record<PublicPlacementState, number>;
  placement_frontier_candidate_count: number;
  placement_frontier_pending_count: number;
  frontier_profile: string;
};
export type ResolvedTransitPublicPack = {
  manifest: PublicPackManifest;
  episodes: PublicEpisode[];
  components: PublicComponent[];
  placements: PublicPlacement[];
  routes: PublicRoute[];
  treatment_families: PublicTreatmentFamily[];
  route_index: PublicRouteIndexRow[];
  history: PublicHistory[];
  current_footprint: PublicCurrentFootprint[];
  summary: PublicNetworkSummary;
  sources: PublicSource[];
};

const forbiddenKey = /(?:^|_)(?:record_id|reviewer|review|decision|fingerprint|hash|sha256|gap_id|queue|validation_code|source_path|file_path)(?:$|_)/iu;
const internalId = /^(?:application|placement|candidate|transition|assertion|review|decision):/u;
const repositoryPath = /(?:^|\/)(?:data|raw|wiki|packages|docs)\//u;
const hashValue = /^(?:sha256:)?[a-f0-9]{32,64}$/iu;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const occurrencePattern = /^occurrence:[a-f0-9]{24}$/u;
const partialDatePattern = /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?|-(?:spring|summer|fall|winter))?$/u;
const actions: readonly PublicAction[] = ["add", "modify", "remove", "suspend", "resume", "retain", "unknown"];
const extentKinds: readonly PublicExtentKind[] = ["route_wide", "bounded_segment", "stop_set", "service_pattern", "unknown"];
const placementStates: readonly PublicPlacementState[] = [
  "confirmed_active", "last_confirmed_active", "confirmed_inactive", "planned",
  "suspended", "conflicted", "unknown",
];

export function assertPublicSafe(value: unknown, path = "public pack"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPublicSafe(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" &&
        (internalId.test(value) || repositoryPath.test(value) ||
         (hashValue.test(value) && !path.endsWith(".intervention_id")))) {
      throw new Error(`${path}: internal value is forbidden`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKey.test(key) || key.endsWith("_record_id")) {
      throw new Error(`${path}.${key}: operator-only field is forbidden`);
    }
    assertPublicSafe(entry, `${path}.${key}`);
  }
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value as Record<string, unknown>;
}
function exact(row: Record<string, unknown>, fields: readonly string[], path: string): void {
  const actual = Object.keys(row).sort();
  const expected = [...fields].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${path}: requires exact fields`);
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path}: expected nonempty string`);
  return value;
}
function nullableText(value: unknown, path: string): string | null {
  return value === null ? null : text(value, path);
}
function integer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path}: expected nonnegative safe integer`);
  }
  return value;
}
function literal<T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${path}: invalid value`);
  return value as T;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  return value;
}
function strings(value: unknown, path: string, options: { nonempty?: boolean; sorted?: boolean } = {}): string[] {
  const result = array(value, path).map((entry, index) => text(entry, `${path}[${index}]`));
  if (options.nonempty && result.length === 0) throw new Error(`${path}: expected nonempty array`);
  if (new Set(result).size !== result.length) throw new Error(`${path}: duplicate value`);
  if (options.sorted && JSON.stringify([...result].sort()) !== JSON.stringify(result)) throw new Error(`${path}: expected sorted values`);
  return result;
}
function refs(value: unknown, path: string): PublicSourceRef[] {
  const result = array(value, path).map((entry, index) => {
    const row = object(entry, `${path}[${index}]`);
    exact(row, ["source_key"], `${path}[${index}]`);
    return { source_key: publicKey(row.source_key, `${path}[${index}].source_key`) };
  });
  if (result.length === 0) throw new Error(`${path}: expected at least one source reference`);
  const keys = result.map((row) => row.source_key);
  if (new Set(keys).size !== keys.length || JSON.stringify([...keys].sort()) !== JSON.stringify(keys)) {
    throw new Error(`${path}: source references must be unique and sorted`);
  }
  return result;
}
function isoDay(value: unknown, path: string): string {
  const result = text(value, path);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(result);
  if (!match) throw new Error(`${path}: expected ISO day`);
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error(`${path}: invalid calendar day`);
  }
  return result;
}
function publicKey(value: unknown, path: string): string {
  const result = text(value, path);
  assertSlug(result, path);
  if (/(?:^|-)unknown(?:-|$)/u.test(result)) throw new Error(`${path}: live public key may not contain unknown`);
  return result;
}
function occurrenceId(value: unknown, path: string): string {
  const result = text(value, path);
  if (!occurrencePattern.test(result)) throw new Error(`${path}: invalid intervention id`);
  return result;
}
function onset(value: unknown, path: string): PublicOnset {
  const row = object(value, path);
  exact(row, ["date", "precision"], path);
  const precision = literal(row.precision, ["day", "month", "season", "year", "upper_bound_day"] as const, `${path}.precision`);
  const date = text(row.date, `${path}.date`);
  const patterns: Record<PublicOnsetPrecision, RegExp> = {
    day: /^\d{4}-\d{2}-\d{2}$/u,
    upper_bound_day: /^\d{4}-\d{2}-\d{2}$/u,
    month: /^\d{4}-(?:0[1-9]|1[0-2])$/u,
    season: /^\d{4}-(?:spring|summer|fall|winter)$/u,
    year: /^\d{4}$/u,
  };
  if (!patterns[precision].test(date)) throw new Error(`${path}.date: malformed ${precision} date`);
  if (precision === "day" || precision === "upper_bound_day") isoDay(date, `${path}.date`);
  return { date, precision };
}
function scope(value: unknown, path: string): { kind: PublicExtentKind } {
  const row = object(value, path);
  exact(row, ["kind"], path);
  return { kind: literal(row.kind, extentKinds, `${path}.kind`) };
}
function sourceDate(value: unknown, path: string): string | null {
  if (value === null) return null;
  const result = text(value, path);
  if (!partialDatePattern.test(result)) throw new Error(`${path}: malformed public source date`);
  if (/^\d{4}-\d{2}-\d{2}$/u.test(result)) isoDay(result, path);
  return result;
}

export function assertSlug(value: string, path: string): void {
  if (!slugPattern.test(value)) {
    throw new Error(`${path} must be a lowercase hyphenated public key`);
  }
}

export function parsePublicManifest(value: unknown): PublicPackManifest {
  const row = object(value, "public manifest");
  exact(row, ["as_of_date", "contract_id", "resources", "schema_version"], "public manifest");
  if (row.schema_version !== 1 || row.contract_id !== PUBLIC_PACK_CONTRACT_ID) throw new Error("public manifest contract is unsupported");
  const resources = array(row.resources, "public manifest.resources").map((entry, index) => {
    const resource = object(entry, `public manifest.resources[${index}]`);
    exact(resource, ["name", "role"], `public manifest.resources[${index}]`);
    return { name: text(resource.name, `public manifest.resources[${index}].name`), role: text(resource.role, `public manifest.resources[${index}].role`) };
  });
  if (JSON.stringify(resources) !== JSON.stringify(PUBLIC_RESOURCE_ROLES.map(([name, role]) => ({ name, role })))) {
    throw new Error("public manifest resource set/order/roles mismatch");
  }
  return { schema_version: 1, contract_id: PUBLIC_PACK_CONTRACT_ID, as_of_date: isoDay(row.as_of_date, "public manifest.as_of_date"), resources: resources as PublicPackManifest["resources"] };
}

export function parsePublicEpisode(value: unknown, path = "public episode"): PublicEpisode {
  const row = object(value, path);
  exact(row, ["aliases", "classification", "display_name", "intervention_component_keys", "intervention_id", "onset", "route_keys", "schema_version", "source_refs", "treatment_family_keys"], path);
  if (row.schema_version !== 1 || row.classification !== "historical_episode") throw new Error(`${path}: invalid schema/classification`);
  return {
    schema_version: 1,
    intervention_id: occurrenceId(row.intervention_id, `${path}.intervention_id`),
    display_name: text(row.display_name, `${path}.display_name`),
    aliases: strings(row.aliases, `${path}.aliases`, { sorted: true }),
    onset: onset(row.onset, `${path}.onset`),
    route_keys: strings(row.route_keys, `${path}.route_keys`, { nonempty: true, sorted: true }).map((key, index) => publicKey(key, `${path}.route_keys[${index}]`)),
    intervention_component_keys: strings(row.intervention_component_keys, `${path}.intervention_component_keys`, { nonempty: true, sorted: true }).map((key, index) => publicKey(key, `${path}.intervention_component_keys[${index}]`)),
    treatment_family_keys: strings(row.treatment_family_keys, `${path}.treatment_family_keys`, { nonempty: true, sorted: true }).map((key, index) => publicKey(key, `${path}.treatment_family_keys[${index}]`)),
    source_refs: refs(row.source_refs, `${path}.source_refs`),
    classification: "historical_episode",
  };
}

export function parsePublicComponent(value: unknown, path = "public component"): PublicComponent {
  const row = object(value, path);
  exact(row, ["action", "action_label", "applicability", "caveats", "details", "extent", "gtfs_route_id", "intervention_component_key", "intervention_id", "route_key", "schema_version", "source_refs", "treatment_family_key", "treatment_family_label"], path);
  if (row.schema_version !== 1 || row.applicability !== "applies") throw new Error(`${path}: invalid schema/applicability`);
  const extent = object(row.extent, `${path}.extent`);
  exact(extent, ["description", "kind", "label"], `${path}.extent`);
  const result: PublicComponent = {
    schema_version: 1,
    intervention_id: occurrenceId(row.intervention_id, `${path}.intervention_id`),
    intervention_component_key: publicKey(row.intervention_component_key, `${path}.intervention_component_key`),
    route_key: publicKey(row.route_key, `${path}.route_key`),
    gtfs_route_id: text(row.gtfs_route_id, `${path}.gtfs_route_id`),
    treatment_family_key: publicKey(row.treatment_family_key, `${path}.treatment_family_key`),
    treatment_family_label: text(row.treatment_family_label, `${path}.treatment_family_label`),
    applicability: "applies",
    action: literal(row.action, actions, `${path}.action`),
    action_label: text(row.action_label, `${path}.action_label`),
    extent: {
      kind: literal(extent.kind, extentKinds, `${path}.extent.kind`),
      label: text(extent.label, `${path}.extent.label`),
      description: nullableText(extent.description, `${path}.extent.description`),
    },
    details: text(row.details, `${path}.details`),
    caveats: strings(row.caveats, `${path}.caveats`, { sorted: true }),
    source_refs: refs(row.source_refs, `${path}.source_refs`),
  };
  if ((result.action === "unknown" || result.extent.kind === "unknown") && result.caveats.length === 0) {
    throw new Error(`${path}: reviewed unknown semantics require a caveat`);
  }
  return result;
}

export function parsePublicPlacement(value: unknown, path = "public placement"): PublicPlacement {
  const row = object(value, path);
  exact(row, ["as_of_date", "founding_intervention_component_key", "placement_key", "route_key", "schema_version", "scope", "state_as_of", "treatment_family_key"], path);
  if (row.schema_version !== 1) throw new Error(`${path}: invalid schema version`);
  return { schema_version: 1, placement_key: publicKey(row.placement_key, `${path}.placement_key`), founding_intervention_component_key: row.founding_intervention_component_key === null ? null : publicKey(row.founding_intervention_component_key, `${path}.founding_intervention_component_key`), route_key: publicKey(row.route_key, `${path}.route_key`), treatment_family_key: publicKey(row.treatment_family_key, `${path}.treatment_family_key`), scope: scope(row.scope, `${path}.scope`), state_as_of: literal(row.state_as_of, placementStates, `${path}.state_as_of`), as_of_date: isoDay(row.as_of_date, `${path}.as_of_date`) };
}

export function parsePublicRoute(value: unknown, path = "public route"): PublicRoute {
  const row = object(value, path);
  exact(row, ["aliases", "display_name", "gtfs_route_id", "route_key", "schema_version"], path);
  if (row.schema_version !== 1) throw new Error(`${path}: invalid schema version`);
  return { schema_version: 1, route_key: publicKey(row.route_key, `${path}.route_key`), gtfs_route_id: text(row.gtfs_route_id, `${path}.gtfs_route_id`), display_name: text(row.display_name, `${path}.display_name`), aliases: strings(row.aliases, `${path}.aliases`, { sorted: true }) };
}

export function parsePublicTreatmentFamily(value: unknown, path = "public treatment family"): PublicTreatmentFamily {
  const row = object(value, path);
  exact(row, ["display_name", "schema_version", "treatment_family_key"], path);
  if (row.schema_version !== 1) throw new Error(`${path}: invalid schema version`);
  return { schema_version: 1, treatment_family_key: publicKey(row.treatment_family_key, `${path}.treatment_family_key`), display_name: text(row.display_name, `${path}.display_name`) };
}

export function parsePublicRouteIndex(value: unknown, path = "public route index"): PublicRouteIndexRow {
  const row = object(value, path);
  exact(row, ["action", "intervention_component_key", "intervention_id", "route_key", "schema_version", "treatment_family_key"], path);
  if (row.schema_version !== 1) throw new Error(`${path}: invalid schema version`);
  return { schema_version: 1, route_key: publicKey(row.route_key, `${path}.route_key`), intervention_id: occurrenceId(row.intervention_id, `${path}.intervention_id`), intervention_component_key: publicKey(row.intervention_component_key, `${path}.intervention_component_key`), treatment_family_key: publicKey(row.treatment_family_key, `${path}.treatment_family_key`), action: literal(row.action, actions, `${path}.action`) };
}

export function parsePublicHistory(value: unknown, path = "public history"): PublicHistory {
  const row = object(value, path);
  if (row.history_kind === "component_application") {
    exact(row, ["action", "history_kind", "intervention_component_key", "intervention_id", "onset", "route_key", "schema_version", "treatment_family_key"], path);
    const base = parsePublicRouteIndex({ schema_version: row.schema_version, route_key: row.route_key, intervention_id: row.intervention_id, intervention_component_key: row.intervention_component_key, treatment_family_key: row.treatment_family_key, action: row.action }, path);
    return { ...base, history_kind: "component_application", onset: onset(row.onset, `${path}.onset`) };
  }
  exact(row, ["action", "history_kind", "intervention_component_key", "intervention_id", "result_placement_keys", "schema_version", "target_placement_keys"], path);
  if (row.schema_version !== 1 || row.history_kind !== "placement_transition") throw new Error(`${path}: invalid history kind/schema`);
  return { schema_version: 1, history_kind: "placement_transition", intervention_id: occurrenceId(row.intervention_id, `${path}.intervention_id`), intervention_component_key: publicKey(row.intervention_component_key, `${path}.intervention_component_key`), action: literal(row.action, actions, `${path}.action`), target_placement_keys: strings(row.target_placement_keys, `${path}.target_placement_keys`, { sorted: true }).map((key, index) => publicKey(key, `${path}.target_placement_keys[${index}]`)), result_placement_keys: strings(row.result_placement_keys, `${path}.result_placement_keys`, { sorted: true }).map((key, index) => publicKey(key, `${path}.result_placement_keys[${index}]`)) };
}

export function parsePublicCurrentFootprint(value: unknown, path = "public current footprint"): PublicCurrentFootprint {
  const row = object(value, path);
  exact(row, ["as_of_date", "placement_key", "route_key", "schema_version", "scope", "state", "treatment_family_key"], path);
  if (row.schema_version !== 1 || row.state !== "confirmed_active") throw new Error(`${path}: invalid schema/state`);
  return { schema_version: 1, placement_key: publicKey(row.placement_key, `${path}.placement_key`), route_key: publicKey(row.route_key, `${path}.route_key`), treatment_family_key: publicKey(row.treatment_family_key, `${path}.treatment_family_key`), scope: scope(row.scope, `${path}.scope`), state: "confirmed_active", as_of_date: isoDay(row.as_of_date, `${path}.as_of_date`) };
}

export function parsePublicSource(value: unknown, path = "public source"): PublicSource {
  const row = object(value, path);
  exact(row, ["date", "publisher", "schema_version", "source_key", "title", "url", "url_status"], path);
  if (row.schema_version !== 1) throw new Error(`${path}: invalid schema version`);
  const status = literal(row.url_status, ["source_provided", "accepted_override", "unavailable"] as const, `${path}.url_status`);
  const url = row.url === null ? null : text(row.url, `${path}.url`);
  if ((status === "unavailable") !== (url === null) || (url !== null && !/^https:\/\/[^/\s]+(?:\/.*)?$/u.test(url))) throw new Error(`${path}: URL/status is inconsistent`);
  const result: PublicSource = { schema_version: 1, source_key: publicKey(row.source_key, `${path}.source_key`), title: text(row.title, `${path}.title`), publisher: nullableText(row.publisher, `${path}.publisher`), date: sourceDate(row.date, `${path}.date`), url, url_status: status };
  assertPublicSafe(result, path);
  return result;
}

export function parsePublicNetworkSummary(value: unknown): PublicNetworkSummary {
  const path = "public network summary";
  const row = object(value, path);
  exact(row, ["as_of_date", "confirmed_current_placement_count", "confirmed_current_route_count", "exact_component_count", "exact_route_component_incidence_count", "frontier_profile", "placement_counts_by_state", "placement_frontier_candidate_count", "placement_frontier_pending_count", "resolved_placement_count", "reviewed_historical_episode_count", "schema_version"], path);
  if (row.schema_version !== 1) throw new Error(`${path}: invalid schema version`);
  const counts = object(row.placement_counts_by_state, `${path}.placement_counts_by_state`);
  exact(counts, placementStates, `${path}.placement_counts_by_state`);
  return {
    schema_version: 1,
    as_of_date: isoDay(row.as_of_date, `${path}.as_of_date`),
    reviewed_historical_episode_count: integer(row.reviewed_historical_episode_count, `${path}.reviewed_historical_episode_count`),
    exact_component_count: integer(row.exact_component_count, `${path}.exact_component_count`),
    exact_route_component_incidence_count: integer(row.exact_route_component_incidence_count, `${path}.exact_route_component_incidence_count`),
    resolved_placement_count: integer(row.resolved_placement_count, `${path}.resolved_placement_count`),
    confirmed_current_placement_count: integer(row.confirmed_current_placement_count, `${path}.confirmed_current_placement_count`),
    confirmed_current_route_count: integer(row.confirmed_current_route_count, `${path}.confirmed_current_route_count`),
    placement_counts_by_state: Object.fromEntries(placementStates.map((state) => [state, integer(counts[state], `${path}.placement_counts_by_state.${state}`)])) as Record<PublicPlacementState, number>,
    placement_frontier_candidate_count: integer(row.placement_frontier_candidate_count, `${path}.placement_frontier_candidate_count`),
    placement_frontier_pending_count: integer(row.placement_frontier_pending_count, `${path}.placement_frontier_pending_count`),
    frontier_profile: text(row.frontier_profile, `${path}.frontier_profile`),
  };
}

function unique<T>(rows: readonly T[], key: (row: T) => string, path: string): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (seen.has(value)) throw new Error(`${path}: duplicate ${value}`);
    seen.add(value);
  }
}
function setEqual(actual: Iterable<string>, expected: Iterable<string>, path: string): void {
  const left = [...actual].sort(); const right = [...expected].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`${path}: exact set/multiset mismatch`);
}
function stableRow(row: PublicRouteIndexRow): string {
  return [row.route_key, row.intervention_id, row.intervention_component_key, row.treatment_family_key, row.action].join("|");
}

export function validateResolvedTransitPublicPack(pack: ResolvedTransitPublicPack): ResolvedTransitPublicPack {
  assertPublicSafe(pack);
  unique(pack.episodes, (row) => row.intervention_id, "episodes");
  unique(pack.components, (row) => row.intervention_component_key, "components");
  unique(pack.placements, (row) => row.placement_key, "placements");
  unique(pack.routes, (row) => row.route_key, "routes");
  unique(pack.treatment_families, (row) => row.treatment_family_key, "treatment families");
  unique(pack.sources, (row) => row.source_key, "sources");
  unique(pack.route_index, stableRow, "route index");
  const episodeById = new Map(pack.episodes.map((row) => [row.intervention_id, row]));
  const componentByKey = new Map(pack.components.map((row) => [row.intervention_component_key, row]));
  const placementByKey = new Map(pack.placements.map((row) => [row.placement_key, row]));
  const routeByKey = new Map(pack.routes.map((row) => [row.route_key, row]));
  const routes = new Set(routeByKey.keys());
  const families = new Map(pack.treatment_families.map((row) => [row.treatment_family_key, row]));
  const sources = new Set(pack.sources.map((row) => row.source_key));
  for (const component of pack.components) {
    const family = families.get(component.treatment_family_key);
    const route = routeByKey.get(component.route_key);
    if (!episodeById.has(component.intervention_id) || !route || !family) throw new Error("component has a broken episode/route/family join");
    if (component.gtfs_route_id !== route.gtfs_route_id) throw new Error("component GTFS route identity drift");
    if (component.treatment_family_label !== family.display_name) throw new Error("component treatment family label drift");
    component.source_refs.forEach((ref) => { if (!sources.has(ref.source_key)) throw new Error("component has a broken source join"); });
  }
  setEqual(routes, new Set([...pack.components.map((row) => row.route_key), ...pack.placements.map((row) => row.route_key)]), "route dictionary");
  setEqual(families.keys(), new Set([...pack.components.map((row) => row.treatment_family_key), ...pack.placements.map((row) => row.treatment_family_key)]), "treatment family dictionary");
  for (const episode of pack.episodes) {
    const owned = pack.components.filter((row) => row.intervention_id === episode.intervention_id);
    setEqual(episode.intervention_component_keys, owned.map((row) => row.intervention_component_key), `${episode.intervention_id} component join`);
    setEqual(episode.route_keys, new Set(owned.map((row) => row.route_key)), `${episode.intervention_id} route join`);
    setEqual(episode.treatment_family_keys, new Set(owned.map((row) => row.treatment_family_key)), `${episode.intervention_id} family join`);
    episode.source_refs.forEach((ref) => { if (!sources.has(ref.source_key)) throw new Error("episode has a broken source join"); });
  }
  pack.placements.forEach((row) => {
    if (!routes.has(row.route_key) || !families.has(row.treatment_family_key) || row.as_of_date !== pack.manifest.as_of_date) throw new Error("placement has a broken join/as-of");
    if (row.founding_intervention_component_key !== null && !componentByKey.has(row.founding_intervention_component_key)) throw new Error("placement has a broken founding-component join");
  });
  setEqual(pack.route_index.map(stableRow), pack.components.map((row) => stableRow({ schema_version: 1, route_key: row.route_key, intervention_id: row.intervention_id, intervention_component_key: row.intervention_component_key, treatment_family_key: row.treatment_family_key, action: row.action })), "route index");
  const componentHistory = pack.history.filter((row): row is PublicComponentHistory => row.history_kind === "component_application");
  setEqual(componentHistory.map((row) => `${stableRow(row)}|${row.onset.date}|${row.onset.precision}`), pack.components.map((row) => {
    const episode = episodeById.get(row.intervention_id)!;
    return `${stableRow({ schema_version: 1, route_key: row.route_key, intervention_id: row.intervention_id, intervention_component_key: row.intervention_component_key, treatment_family_key: row.treatment_family_key, action: row.action })}|${episode.onset.date}|${episode.onset.precision}`;
  }), "component history");
  const transitionHistory = pack.history.filter((row): row is PublicPlacementTransitionHistory => row.history_kind === "placement_transition");
  unique(transitionHistory, (row) => row.intervention_component_key, "placement transition components");
  for (const row of pack.history) {
    if (!episodeById.has(row.intervention_id) || !componentByKey.has(row.intervention_component_key)) throw new Error("history has a broken episode/component join");
    if (row.history_kind === "placement_transition") {
      const component = componentByKey.get(row.intervention_component_key)!;
      if (row.intervention_id !== component.intervention_id || row.action !== component.action) throw new Error("transition history has broken component ownership/action");
      if (row.action !== "add" || row.target_placement_keys.length !== 0 || row.result_placement_keys.length !== 1) throw new Error("placement establishment transition shape drifted");
      [...row.target_placement_keys, ...row.result_placement_keys].forEach((key) => { if (!placementByKey.has(key)) throw new Error("transition history has a broken placement join"); });
    }
  }
  for (const row of transitionHistory) {
    const component = componentByKey.get(row.intervention_component_key)!;
    const expectedResults = pack.placements.filter((placement) =>
      placement.founding_intervention_component_key === row.intervention_component_key
    );
    setEqual(row.result_placement_keys, expectedResults.map((placement) => placement.placement_key), `${row.intervention_component_key} transition result ownership`);
    for (const placement of expectedResults) {
      if (placement.route_key !== component.route_key || placement.treatment_family_key !== component.treatment_family_key || placement.scope.kind !== component.extent.kind) throw new Error("transition result has a broken placement claim join");
    }
  }
  setEqual(transitionHistory.map((row) => row.intervention_component_key), pack.components.filter((row) => row.action === "add").map((row) => row.intervention_component_key), "add-component transition coverage");
  setEqual(transitionHistory.flatMap((row) => row.result_placement_keys), pack.placements.filter((row) => row.founding_intervention_component_key !== null).map((row) => row.placement_key), "transition result placement coverage");
  for (const row of pack.current_footprint) {
    const placement = placementByKey.get(row.placement_key);
    if (!placement || placement.route_key !== row.route_key || placement.treatment_family_key !== row.treatment_family_key || JSON.stringify(placement.scope) !== JSON.stringify(row.scope) || placement.state_as_of !== "confirmed_active" || row.as_of_date !== pack.manifest.as_of_date || placement.as_of_date !== row.as_of_date) throw new Error("current footprint has a broken placement/as-of join");
  }
  setEqual(pack.current_footprint.map((row) => row.placement_key), pack.placements.filter((row) => row.state_as_of === "confirmed_active").map((row) => row.placement_key), "confirmed-current footprint");
  const cited = new Set([...pack.episodes, ...pack.components].flatMap((row) => row.source_refs.map((ref) => ref.source_key)));
  setEqual(sources, cited, "source dictionary");
  const stateCounts = Object.fromEntries(placementStates.map((state) => [state, pack.placements.filter((row) => row.state_as_of === state).length]));
  const summary = pack.summary;
  if (summary.as_of_date !== pack.manifest.as_of_date || summary.reviewed_historical_episode_count !== pack.episodes.length || summary.exact_component_count !== pack.components.length || summary.exact_route_component_incidence_count !== pack.route_index.length || summary.resolved_placement_count !== pack.placements.length || summary.confirmed_current_placement_count !== pack.current_footprint.length || summary.confirmed_current_route_count !== new Set(pack.current_footprint.map((row) => row.route_key)).size || JSON.stringify(summary.placement_counts_by_state) !== JSON.stringify(stateCounts)) throw new Error("public network summary reconciliation mismatch");
  return pack;
}

export function parseResolvedTransitPublicPack(value: unknown): ResolvedTransitPublicPack {
  const row = object(value, "public pack");
  exact(row, ["components", "current_footprint", "episodes", "history", "manifest", "placements", "route_index", "routes", "sources", "summary", "treatment_families"], "public pack");
  const pack: ResolvedTransitPublicPack = {
    manifest: parsePublicManifest(row.manifest),
    episodes: array(row.episodes, "episodes").map((entry, index) => parsePublicEpisode(entry, `episodes[${index}]`)),
    components: array(row.components, "components").map((entry, index) => parsePublicComponent(entry, `components[${index}]`)),
    placements: array(row.placements, "placements").map((entry, index) => parsePublicPlacement(entry, `placements[${index}]`)),
    routes: array(row.routes, "routes").map((entry, index) => parsePublicRoute(entry, `routes[${index}]`)),
    treatment_families: array(row.treatment_families, "treatment families").map((entry, index) => parsePublicTreatmentFamily(entry, `treatment_families[${index}]`)),
    route_index: array(row.route_index, "route index").map((entry, index) => parsePublicRouteIndex(entry, `route_index[${index}]`)),
    history: array(row.history, "history").map((entry, index) => parsePublicHistory(entry, `history[${index}]`)),
    current_footprint: array(row.current_footprint, "current footprint").map((entry, index) => parsePublicCurrentFootprint(entry, `current_footprint[${index}]`)),
    summary: parsePublicNetworkSummary(row.summary),
    sources: array(row.sources, "sources").map((entry, index) => parsePublicSource(entry, `sources[${index}]`)),
  };
  return validateResolvedTransitPublicPack(pack);
}
