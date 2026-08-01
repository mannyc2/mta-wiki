import { assertPublicSafe, type PublicNetworkSummary, type PublicOnset } from "./public-contract.js";
import { verifyPublicPackDirectory } from "../materialize/resolved-transit-pack.js";

export type ReferenceAdapterOutput = {
  schema_version: 1;
  contract_id: "resolved-transit-reference-adapter-v1";
  episodes_by_route: Array<{
    route_key: string;
    route_label: string;
    episodes: Array<{ intervention_id: string; display_name: string; onset: PublicOnset }>;
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
  completeness: PublicNetworkSummary;
  sources: Array<{
    source_key: string;
    title: string;
    link: string | null;
  }>;
};

export function runResolvedPackReferenceAdapter(input: string): ReferenceAdapterOutput {
  const pack = verifyPublicPackDirectory(input);
  const { episodes, components, routes, treatment_families: families, route_index: routeIndex,
    current_footprint: footprint, sources, summary } = pack;
  const routeByKey = new Map(routes.map((row) => [row.route_key, row]));
  const familyByKey = new Map(families.map((row) => [row.treatment_family_key, row]));
  const episodeById = new Map(episodes.map((row) => [row.intervention_id, row]));
  const componentByOwner = new Map(components.map((row) => [
    `${row.intervention_id}|${row.intervention_component_key}`, row,
  ]));
  const routeKeys = [...new Set(routeIndex.map((row) => row.route_key))].sort();
  const episodesByRoute = routeKeys.map((routeKey) => {
    const route = routeByKey.get(routeKey);
    if (!route) throw new Error(`route index references missing route: ${routeKey}`);
    const routeEpisodes = [...new Set(routeIndex.filter((row) => row.route_key === routeKey)
      .map((row) => row.intervention_id))].map((id) => {
        const episode = episodeById.get(id);
        if (!episode) throw new Error(`route index references missing episode: ${id}`);
        return {
          intervention_id: id,
          display_name: episode.display_name,
          onset: episode.onset,
        };
      }).sort((a, b) => JSON.stringify(a.onset).localeCompare(JSON.stringify(b.onset)) ||
        a.intervention_id.localeCompare(b.intervention_id));
    return { route_key: routeKey, route_label: route.display_name, episodes: routeEpisodes };
  });
  const historyByRoute = routeKeys.map((routeKey) => ({
    route_key: routeKey,
    entries: routeIndex.filter((row) => row.route_key === routeKey).map((index) => {
      const component = componentByOwner.get(`${index.intervention_id}|${index.intervention_component_key}`);
      if (!component) throw new Error("route index references missing exact component");
      const family = familyByKey.get(component.treatment_family_key);
      if (!family) throw new Error("component references missing treatment family");
      return {
        intervention_id: component.intervention_id,
        intervention_component_key: component.intervention_component_key,
        treatment: family.display_name,
        action: component.action,
      };
    }).sort((a, b) => `${a.intervention_id}|${a.intervention_component_key}`.localeCompare(`${b.intervention_id}|${b.intervention_component_key}`)),
  }));
  const currentRouteKeys = [...new Set(footprint.map((row) => row.route_key))].sort();
  const confirmedCurrent = currentRouteKeys.map((routeKey) => ({
    route_key: routeKey,
    placements: footprint.filter((row) => row.route_key === routeKey).map((row) => {
      if (row.state !== "confirmed_active") throw new Error("public current footprint contains non-active row");
      const family = familyByKey.get(row.treatment_family_key);
      if (!family) throw new Error("footprint references missing treatment family");
      return {
        placement_key: row.placement_key,
        treatment: family.display_name,
        as_of_date: row.as_of_date,
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
      source_key: row.source_key,
      title: row.title,
      link: row.url_status === "source_provided" || row.url_status === "accepted_override"
        ? row.url
        : null,
    })).sort((a, b) => a.source_key.localeCompare(b.source_key)),
  };
  assertPublicSafe(output);
  return output;
}
