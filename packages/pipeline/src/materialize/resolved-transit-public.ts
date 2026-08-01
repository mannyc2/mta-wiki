import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  parseResolvedTransitPublicPack,
  PUBLIC_PACK_CONTRACT_ID,
  PUBLIC_RESOURCE_ROLES,
  type ResolvedTransitPublicPack,
} from "../consumer/public-contract.js";
import {
  parsePublicKeyOperation,
  replayPublicKeyOperations,
} from "./resolved-transit-public-keys.js";
import { validateTrackerConformance } from "./tracker-conformance.js";

export type { ResolvedTransitPublicPack } from "../consumer/public-contract.js";

function jsonl(path: string): Array<Record<string, any>> {
  const text = readFileSync(path, "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as Record<string, any>) : [];
}
function required<K, V>(map: ReadonlyMap<K, V>, key: K, path: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${path}: missing exact public join`);
  return value;
}

export function buildResolvedTransitPublicPack(
  asOfDate: string,
  root = repoRoot,
): ResolvedTransitPublicPack {
  const operator = join(root, "data", "resolved-transit", "operator", "v1");
  const display = join(operator, "public-display");
  const episodesOperator = jsonl(join(operator, "interventions", "episodes.jsonl"));
  const applications = jsonl(join(operator, "interventions", "applications.jsonl"));
  const placementsOperator = jsonl(join(operator, "placements", "registry.jsonl"));
  const transitions = jsonl(join(operator, "placements", "transitions.jsonl"));
  const states = jsonl(join(operator, "lifecycle", "intervention_placement_state_as_of.jsonl"));
  const footprintOperator = jsonl(join(operator, "lifecycle", "current_intervention_footprint.jsonl"));
  const lifecycleSummary = JSON.parse(readFileSync(join(operator, "lifecycle", "summary.json"), "utf8")) as Record<string, any>;
  const frontierSummary = JSON.parse(readFileSync(join(operator, "placements", "summary.json"), "utf8")) as Record<string, any>;
  const displayManifest = JSON.parse(readFileSync(join(display, "manifest.json"), "utf8")) as Record<string, any>;
  if (states.some((row) => row.as_of_date !== asOfDate) ||
      footprintOperator.some((row) => row.as_of_date !== asOfDate) ||
      lifecycleSummary.as_of_date !== asOfDate || displayManifest.as_of_date !== asOfDate) {
    throw new Error(`requested public-pack as-of does not match frozen lifecycle/display state: ${asOfDate}`);
  }
  const episodeDisplay = new Map(jsonl(join(display, "episodes.jsonl")).map((row) => [row.occurrence_id, row]));
  const routeDisplay = jsonl(join(display, "routes.jsonl"));
  const familyDisplay = jsonl(join(display, "treatment_families.jsonl"));
  const sourceDisplay = jsonl(join(display, "sources.jsonl"));
  const publicKeyRows = jsonl(join(display, "public_keys.jsonl"));
  const liveKeyRows = replayPublicKeyOperations(
    publicKeyRows.map((row, index) =>
      parsePublicKeyOperation(row, `public display key operation[${index}]`)
    ),
  ).filter((row) => row.registry_state === "live");
  const componentKeys = new Map(liveKeyRows.filter((row) => row.key_kind === "intervention_component")
    .map((row) => [row.subject_id, row.public_key]));
  const placementKeys = new Map(liveKeyRows.filter((row) => row.key_kind === "placement")
    .map((row) => [row.subject_id, row.public_key]));
  const routeKeys = new Map(liveKeyRows.filter((row) => row.key_kind === "route")
    .map((row) => [row.subject_id, row.public_key]));
  const familyKeys = new Map(liveKeyRows.filter((row) => row.key_kind === "treatment_family")
    .map((row) => [row.subject_id, row.public_key]));
  const sourceKeys = new Map(liveKeyRows.filter((row) => row.key_kind === "source")
    .map((row) => [row.subject_id, row.public_key]));
  const appsByEpisode = new Map<string, Array<Record<string, any>>>();
  for (const row of applications) {
    const values = appsByEpisode.get(row.occurrence_id) ?? [];
    values.push(row);
    appsByEpisode.set(row.occurrence_id, values);
  }
  const episodes = episodesOperator.map((row) => {
    const presentation = episodeDisplay.get(row.occurrence_id);
    if (!presentation) throw new Error(`missing episode display: ${row.occurrence_id}`);
    const apps = appsByEpisode.get(row.occurrence_id) ?? [];
    return {
      schema_version: 1,
      intervention_id: row.occurrence_id,
      display_name: presentation.display_name,
      aliases: presentation.aliases,
      onset: row.resolved_onset,
      route_keys: [...new Set(apps.map((app) => required(routeKeys, app.route_record_id, `${app.application_id} route key`)))].sort(),
      intervention_component_keys: apps.map((app) => required(componentKeys, app.application_id, `${app.application_id} component key`)).sort(),
      treatment_family_keys: [...new Set(apps.map((app) => required(familyKeys, app.treatment_family, `${app.application_id} family key`)))].sort(),
      source_refs: row.source_ids.map((id: string) => ({ source_key: required(sourceKeys, id, `${row.occurrence_id} source key`) })).sort((a: any, b: any) => a.source_key.localeCompare(b.source_key)),
      classification: "historical_episode",
    };
  }).sort((a, b) => a.intervention_id.localeCompare(b.intervention_id));
  const componentDisplay = new Map(jsonl(join(display, "scopes.jsonl"))
    .filter((row) => row.application_id)
    .map((row) => [row.application_id, row]));
  const components = applications.map((row) => {
    const presentation = required(componentDisplay, row.application_id, `${row.application_id} component display`);
    const sourceKeyList = presentation.source_keys as string[];
    if (!Array.isArray(sourceKeyList) || sourceKeyList.length === 0) throw new Error(`${row.application_id}: missing public sources`);
    return {
      schema_version: 1,
      intervention_id: row.occurrence_id,
      intervention_component_key: required(componentKeys, row.application_id, `${row.application_id} component key`),
      route_key: required(routeKeys, row.route_record_id, `${row.application_id} route key`),
      gtfs_route_id: row.gtfs_route_id,
      treatment_family_key: required(familyKeys, row.treatment_family, `${row.application_id} family key`),
      treatment_family_label: presentation.treatment_family_label,
      applicability: row.applicability,
      action: row.action,
      action_label: presentation.action_label,
      extent: presentation.extent,
      details: presentation.treatment_display_name,
      caveats: presentation.caveats,
      source_refs: sourceKeyList.map((source_key: string) => ({ source_key })).sort((a, b) => a.source_key.localeCompare(b.source_key)),
    };
  }).sort((a, b) => `${a.intervention_id}|${a.intervention_component_key}`.localeCompare(`${b.intervention_id}|${b.intervention_component_key}`));
  const stateByPlacement = new Map(states.map((row) => [row.placement_id, row]));
  const foundingComponentByPlacement = new Map<string, string>();
  for (const transition of transitions) {
    const componentKey = required(componentKeys, transition.application_id, `${transition.transition_id} founding component key`);
    for (const placementId of transition.result_placement_ids as string[]) {
      if (foundingComponentByPlacement.has(placementId)) throw new Error(`${placementId}: duplicate founding transition result`);
      foundingComponentByPlacement.set(placementId, componentKey);
    }
  }
  const placements = placementsOperator.map((row) => {
    const state = required(stateByPlacement, row.placement_id, `${row.placement_id} state`);
    return {
      schema_version: 1,
      placement_key: required(placementKeys, row.placement_id, `${row.placement_id} public key`),
      founding_intervention_component_key: foundingComponentByPlacement.get(row.placement_id) ?? null,
      route_key: required(routeKeys, row.current_claim.route_record_id, `${row.placement_id} route key`),
      treatment_family_key: required(familyKeys, row.current_claim.treatment_family, `${row.placement_id} family key`),
      scope: { kind: row.current_claim.scope.kind },
      state_as_of: state.state,
      as_of_date: state.as_of_date,
    };
  });
  const routes = routeDisplay.map((row) => ({
    schema_version: 1,
    route_key: row.route_key,
    gtfs_route_id: row.gtfs_route_id,
    display_name: row.display_name,
    aliases: [...new Set((row.aliases as string[]).filter((alias) =>
      !alias.startsWith("route_") && !alias.startsWith("route:")
    ))].sort(),
  })).filter((row) =>
    components.some((component) => component.route_key === row.route_key) ||
    placements.some((placement) => placement.route_key === row.route_key)
  ).sort((a, b) => String(a.route_key).localeCompare(String(b.route_key)));
  const treatmentFamilies = familyDisplay.map((row) => ({
    schema_version: 1,
    treatment_family_key: row.treatment_family_key,
    display_name: row.display_name,
  })).filter((row) =>
    components.some((component) => component.treatment_family_key === row.treatment_family_key) ||
    placements.some((placement) => placement.treatment_family_key === row.treatment_family_key)
  ).sort((a, b) => String(a.treatment_family_key).localeCompare(String(b.treatment_family_key)));
  const routeIndex = components.map((row) => ({
    schema_version: 1,
    route_key: row.route_key,
    intervention_id: row.intervention_id,
    intervention_component_key: row.intervention_component_key,
    treatment_family_key: row.treatment_family_key,
    action: row.action,
  })).sort((a, b) => `${a.route_key}|${a.intervention_id}|${a.intervention_component_key}`.localeCompare(`${b.route_key}|${b.intervention_id}|${b.intervention_component_key}`));
  const onsetByEpisode = new Map(episodes.map((row) => [row.intervention_id, row.onset]));
  const history = [
    ...components.map((row) => ({
      schema_version: 1,
      history_kind: "component_application",
      intervention_id: row.intervention_id,
      intervention_component_key: row.intervention_component_key,
      route_key: row.route_key,
      treatment_family_key: row.treatment_family_key,
      action: row.action,
      onset: onsetByEpisode.get(row.intervention_id),
    })),
    ...transitions.map((row) => ({
      schema_version: 1,
      history_kind: "placement_transition",
      intervention_id: required(new Map(applications.map((app) => [app.application_id, app.occurrence_id])), row.application_id, `${row.transition_id} application`),
      intervention_component_key: required(componentKeys, row.application_id, `${row.transition_id} component key`),
      action: row.action,
      target_placement_keys: row.target_placement_ids.map((id: string) => required(placementKeys, id, `${row.transition_id} target placement`)).sort(),
      result_placement_keys: row.result_placement_ids.map((id: string) => required(placementKeys, id, `${row.transition_id} result placement`)).sort(),
    })),
  ];
  const currentFootprint = footprintOperator.map((row) => {
    if (row.state !== "confirmed_active") throw new Error("operator current footprint contains non-active row");
    return {
      schema_version: 1,
      placement_key: required(placementKeys, row.placement_id, `${row.placement_id} footprint placement key`),
      route_key: required(routeKeys, row.route_record_id, `${row.placement_id} footprint route key`),
      treatment_family_key: required(familyKeys, row.treatment_family, `${row.placement_id} footprint family key`),
      scope: { kind: row.scope.kind },
      state: "confirmed_active",
      as_of_date: row.as_of_date,
    };
  });
  const citedSourceKeys = new Set([
    ...episodes.flatMap((row) => (row.source_refs as Array<{ source_key: string }>).map((ref) => ref.source_key)),
    ...components.flatMap((row) => (row.source_refs as Array<{ source_key: string }>).map((ref) => ref.source_key)),
  ]);
  const sources = sourceDisplay.filter((row) => citedSourceKeys.has(row.source_key)).map((row) => ({
    schema_version: 1,
    source_key: row.source_key,
    title: row.title,
    publisher: row.publisher,
    date: row.date,
    url: row.url,
    url_status: row.url_status,
  })).sort((a, b) => String(a.source_key).localeCompare(String(b.source_key)));
  const countsByState: Record<string, number> = {
    confirmed_active: 0, last_confirmed_active: 0, confirmed_inactive: 0,
    planned: 0, suspended: 0, conflicted: 0, unknown: 0,
  };
  for (const row of states) countsByState[row.state] = (countsByState[row.state] ?? 0) + 1;
  const summary = {
    schema_version: 1,
    as_of_date: asOfDate,
    reviewed_historical_episode_count: episodes.length,
    exact_component_count: components.length,
    exact_route_component_incidence_count: routeIndex.length,
    resolved_placement_count: placements.length,
    confirmed_current_placement_count: currentFootprint.length,
    confirmed_current_route_count: new Set(currentFootprint.map((row) => row.route_key)).size,
    placement_counts_by_state: countsByState,
    placement_frontier_candidate_count: frontierSummary.candidate_ledger_rows,
    placement_frontier_pending_count: frontierSummary.counts_by_candidate_disposition.pending_review,
    frontier_profile: "closed_nonauthorizing_v1",
  };
  const manifest = {
    schema_version: 1 as const,
    contract_id: PUBLIC_PACK_CONTRACT_ID,
    as_of_date: asOfDate,
    resources: PUBLIC_RESOURCE_ROLES.map(([name, role]) => ({ name, role })),
  };
  const result = {
    manifest, episodes, components, placements, routes,
    treatment_families: treatmentFamilies, route_index: routeIndex, history,
    current_footprint: currentFootprint, sources, summary,
  };
  if (episodes.length !== episodesOperator.length || components.length !== applications.length ||
      placements.length !== placementsOperator.length || currentFootprint.length !== footprintOperator.length) {
    throw new Error("public pack operator denominator mismatch");
  }
  const decoded = parseResolvedTransitPublicPack(result);
  validateTrackerConformance(decoded, root);
  return decoded;
}
