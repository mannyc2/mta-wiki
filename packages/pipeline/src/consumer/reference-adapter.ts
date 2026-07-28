import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertPublicSafe, PUBLIC_PACK_CONTRACT_ID } from "./public-contract.js";

export type ReferenceAdapterOutput = {
  schema_version: 1;
  contract_id: "resolved-transit-reference-adapter-v1";
  episodes_by_route: Array<{
    route_key: string;
    route_label: string;
    episodes: Array<{ intervention_id: string; display_name: string; onset: unknown }>;
  }>;
  history_by_route: Array<{
    route_key: string;
    entries: Array<{
      intervention_id: string;
      intervention_component_key: string;
      treatment: string;
      action: string;
    }>;
  }>;
  confirmed_current_by_route: Array<{
    route_key: string;
    placements: Array<{ placement_key: string; treatment: string; as_of_date: string }>;
  }>;
  completeness: Record<string, unknown>;
  sources: Array<{
    source_key: string;
    title: string;
    link: string | null;
  }>;
};

function rows(input: string, name: string): Array<Record<string, any>> {
  const text = readFileSync(join(input, name), "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as Record<string, any>) : [];
}

export function runResolvedPackReferenceAdapter(input: string): ReferenceAdapterOutput {
  const manifest = JSON.parse(readFileSync(join(input, "manifest.json"), "utf8")) as {
    contract_id: string;
  };
  if (manifest.contract_id !== PUBLIC_PACK_CONTRACT_ID) throw new Error("unsupported public pack contract");
  const episodes = rows(input, "public_intervention_episodes.jsonl");
  const components = rows(input, "public_intervention_components.jsonl");
  const routes = rows(input, "public_routes.jsonl");
  const families = rows(input, "public_treatment_families.jsonl");
  const routeIndex = rows(input, "public_route_intervention_index.jsonl");
  const footprint = rows(input, "public_current_footprint.jsonl");
  const sources = rows(input, "public_sources.jsonl");
  const summary = JSON.parse(readFileSync(join(input, "public_network_summary.json"), "utf8")) as Record<string, unknown>;
  const routeByKey = new Map(routes.map((row) => [row.route_key, row]));
  const familyByKey = new Map(families.map((row) => [row.treatment_family_key, row]));
  const episodeById = new Map(episodes.map((row) => [row.intervention_id, row]));
  const componentByOwner = new Map(components.map((row) => [
    `${row.intervention_id}|${row.intervention_component_key}`, row,
  ]));
  const routeKeys = [...new Set(routeIndex.map((row) => String(row.route_key)))].sort();
  const episodesByRoute = routeKeys.map((routeKey) => {
    const route = routeByKey.get(routeKey);
    if (!route) throw new Error(`route index references missing route: ${routeKey}`);
    const routeEpisodes = [...new Set(routeIndex.filter((row) => row.route_key === routeKey)
      .map((row) => String(row.intervention_id)))].map((id) => {
        const episode = episodeById.get(id);
        if (!episode) throw new Error(`route index references missing episode: ${id}`);
        return {
          intervention_id: id,
          display_name: String(episode.display_name),
          onset: episode.onset,
        };
      }).sort((a, b) => JSON.stringify(a.onset).localeCompare(JSON.stringify(b.onset)) ||
        a.intervention_id.localeCompare(b.intervention_id));
    return { route_key: routeKey, route_label: String(route.display_name), episodes: routeEpisodes };
  });
  const historyByRoute = routeKeys.map((routeKey) => ({
    route_key: routeKey,
    entries: routeIndex.filter((row) => row.route_key === routeKey).map((index) => {
      const component = componentByOwner.get(`${index.intervention_id}|${index.intervention_component_key}`);
      if (!component) throw new Error("route index references missing exact component");
      const family = familyByKey.get(component.treatment_family_key);
      if (!family) throw new Error("component references missing treatment family");
      return {
        intervention_id: String(component.intervention_id),
        intervention_component_key: String(component.intervention_component_key),
        treatment: String(family.display_name),
        action: String(component.action),
      };
    }).sort((a, b) => `${a.intervention_id}|${a.intervention_component_key}`.localeCompare(`${b.intervention_id}|${b.intervention_component_key}`)),
  }));
  const currentRouteKeys = [...new Set(footprint.map((row) => String(row.route_key)))].sort();
  const confirmedCurrent = currentRouteKeys.map((routeKey) => ({
    route_key: routeKey,
    placements: footprint.filter((row) => row.route_key === routeKey).map((row) => {
      if (row.state !== "confirmed_active") throw new Error("public current footprint contains non-active row");
      const family = familyByKey.get(row.treatment_family_key);
      if (!family) throw new Error("footprint references missing treatment family");
      return {
        placement_key: String(row.placement_key),
        treatment: String(family.display_name),
        as_of_date: String(row.as_of_date),
      };
    }).sort((a, b) => a.placement_key.localeCompare(b.placement_key)),
  }));
  const output: ReferenceAdapterOutput = {
    schema_version: 1,
    contract_id: "resolved-transit-reference-adapter-v1",
    episodes_by_route: episodesByRoute,
    history_by_route: historyByRoute,
    confirmed_current_by_route: confirmedCurrent,
    completeness: summary,
    sources: sources.map((row) => ({
      source_key: String(row.source_key),
      title: String(row.title),
      link: row.url_status === "source_provided" || row.url_status === "accepted_override"
        ? String(row.url)
        : null,
    })).sort((a, b) => a.source_key.localeCompare(b.source_key)),
  };
  assertPublicSafe(output);
  return output;
}
