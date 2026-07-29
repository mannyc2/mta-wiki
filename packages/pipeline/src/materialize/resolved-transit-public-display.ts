import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { parsePublicSource } from "../consumer/public-contract.js";
import {
  readPublicKeyOperations,
  replayPublicKeyOperations,
} from "./resolved-transit-public-keys.js";
import {
  summarizePublicDisplayReconciliation,
  type PublicDisplayReconciliationRow,
} from "./resolved-transit-public-display-reconciliation.js";

export type OperatorPublicDisplayDictionary = {
  manifest: {
    schema_version: 1;
    contract_id: "resolved-transit-operator-public-display-v1";
    as_of_date: string;
    inputs: Array<{ path: string; sha256: string }>;
    public_key_registry_head: string;
  };
  episodes: Array<Record<string, unknown>>;
  routes: Array<Record<string, unknown>>;
  treatment_families: Array<Record<string, unknown>>;
  contexts: Array<Record<string, unknown>>;
  scopes: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
  public_keys: Array<Record<string, unknown>>;
  reconciliation: PublicDisplayReconciliationRow[];
  summary: Record<string, unknown>;
};

const inputPaths = [
  "data/resolved-transit/operator/v1/interventions/episodes.jsonl",
  "data/resolved-transit/operator/v1/interventions/applications.jsonl",
  "data/resolved-transit/operator/v1/interventions/context_links.jsonl",
  "data/resolved-transit/operator/v1/placements/registry.jsonl",
  "data/resolved-transit/operator/v1/placements/transitions.jsonl",
  "data/resolved-transit/operator/v1/lifecycle/assertions.jsonl",
  "data/resolved-transit/operator/v1/lifecycle/intervention_placement_state_as_of.jsonl",
  "data/reference/gtfs/SELECTED",
  "data/reference/gtfs/routes.txt",
  "data/canonical/routes.jsonl",
  "data/canonical/projects.jsonl",
  "data/canonical/corridors.jsonl",
  "data/canonical/treatment_components.jsonl",
  "data/canonical/sources.jsonl",
  "data/resolved-transit-public/treatment-family-display-v1.json",
  "data/resolved-transit-public/public-key-operations/v1/operations.jsonl",
];

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function jsonl(path: string): Array<Record<string, any>> {
  const text = readFileSync(path, "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as Record<string, any>) : [];
}
function normalizedUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
function sortName(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}
function treatmentName(row: Record<string, any>): string {
  const display = String(row.display_name ?? "");
  if (/^treatment[_-]/iu.test(display) && typeof row.payload?.treatment_kind === "string") {
    return row.payload.treatment_kind;
  }
  return display;
}
function keyMap(root: string, kind: string): Map<string, string> {
  return new Map(replayPublicKeyOperations(readPublicKeyOperations(root))
    .filter((row) => row.key_kind === kind && row.registry_state === "live")
    .map((row) => [row.subject_id, row.public_key]));
}

export function buildOperatorPublicDisplayDictionary(
  asOfDate: string,
  root = repoRoot,
): OperatorPublicDisplayDictionary {
  const inputs = inputPaths.map((path) => {
    const absolute = join(root, path);
    if (!existsSync(absolute)) throw new Error(`missing addressed display input: ${path}`);
    return { path, sha256: sha(readFileSync(absolute, "utf8")) };
  });
  const episodes = jsonl(join(root, inputPaths[0]!));
  const applications = jsonl(join(root, inputPaths[1]!));
  const links = jsonl(join(root, inputPaths[2]!));
  const placements = jsonl(join(root, inputPaths[3]!));
  const routes = jsonl(join(root, "data/canonical/routes.jsonl"));
  const projects = jsonl(join(root, "data/canonical/projects.jsonl"));
  const corridors = jsonl(join(root, "data/canonical/corridors.jsonl"));
  const treatments = jsonl(join(root, "data/canonical/treatment_components.jsonl"));
  const sources = jsonl(join(root, "data/canonical/sources.jsonl"));
  const familyContract = JSON.parse(readFileSync(
    join(root, "data/resolved-transit-public/treatment-family-display-v1.json"), "utf8",
  )) as { families: Array<{ family: string; key: string; label: string }> };
  const routeKey = keyMap(root, "route");
  const familyKey = keyMap(root, "treatment_family");
  const sourceKey = keyMap(root, "source");
  const componentKey = keyMap(root, "intervention_component");
  const placementKey = keyMap(root, "placement");
  const routeById = new Map(routes.map((row) => [row.record_id, row]));
  const treatmentById = new Map(treatments.map((row) => [row.record_id, row]));
  const sourceById = new Map(sources.map((row) => [row.source_id, row]));
  const contextById = new Map([...projects, ...corridors].map((row) => [row.record_id, row]));
  const applicationsByEpisode = new Map<string, Array<Record<string, any>>>();
  for (const row of applications) {
    const values = applicationsByEpisode.get(row.occurrence_id) ?? [];
    values.push(row);
    applicationsByEpisode.set(row.occurrence_id, values);
  }
  const contextsByEpisode = new Map<string, Array<Record<string, any>>>();
  for (const row of links) {
    const values = contextsByEpisode.get(row.occurrence_id) ?? [];
    values.push(row);
    contextsByEpisode.set(row.occurrence_id, values);
  }
  const reconciliation: PublicDisplayReconciliationRow[] = [];
  const routeRows = [...new Set(applications.map((row) => String(row.route_record_id)))].sort().map((id) => {
    const canonical = routeById.get(id);
    const key = routeKey.get(id);
    if (!canonical || !key) throw new Error(`unresolved route display: ${id}`);
    reconciliation.push({ schema_version: 1, subject_kind: "route", subject_id: id, disposition: "resolved", reason_code: "addressed_route_display" });
    const application = applications.find((row) => row.route_record_id === id)!;
    return {
      schema_version: 1, route_record_id: id, route_key: key,
      gtfs_route_id: application.gtfs_route_id,
      display_name: canonical.display_name,
      aliases: [...new Set([...(canonical.record_aliases ?? []), application.gtfs_route_id])].sort(),
      label_method: "addressed_canonical_route",
    };
  });
  const familyRows = familyContract.families.filter((family) =>
    applications.some((row) => row.treatment_family === family.family)
  ).map((family) => {
    if (familyKey.get(family.family) !== family.key) throw new Error(`family key drift: ${family.family}`);
    reconciliation.push({ schema_version: 1, subject_kind: "treatment_family", subject_id: family.family, disposition: "resolved", reason_code: "closed_family_display_contract" });
    return { schema_version: 1, treatment_family: family.family, treatment_family_key: family.key, display_name: family.label };
  });
  const sourceRows = [...new Set(episodes.flatMap((row) => row.source_ids as string[]))].sort().map((id) => {
    const canonical = sourceById.get(id);
    const key = sourceKey.get(id);
    if (!canonical || !key) throw new Error(`unresolved source display: ${id}`);
    const payload = canonical.payload ?? {};
    const url = normalizedUrl(payload.source_url);
    const publicRow = parsePublicSource({
      schema_version: 1,
      source_key: key,
      title: canonical.display_name,
      publisher: typeof payload.publisher === "string" ? payload.publisher : null,
      date: typeof payload.published_date_normalized === "string" ? payload.published_date_normalized : null,
      url,
      url_status: url ? "source_provided" : "unavailable",
    });
    reconciliation.push({ schema_version: 1, subject_kind: "source", subject_id: id, disposition: "resolved", reason_code: url ? "lossless_https_source_url" : "public_source_without_approved_url" });
    return { ...publicRow, source_id: id };
  });
  const componentRows = applications.sort((a, b) => String(a.application_id).localeCompare(String(b.application_id))).map((row) => {
    const treatment = treatmentById.get(row.treatment_record_id);
    const key = componentKey.get(row.application_id);
    if (!treatment || !key || !routeKey.get(row.route_record_id) || !familyKey.get(row.treatment_family)) {
      throw new Error(`unresolved component display: ${row.application_id}`);
    }
    reconciliation.push({ schema_version: 1, subject_kind: "component", subject_id: row.application_id, disposition: "resolved", reason_code: "exact_application_display" });
    return {
      schema_version: 1, application_id: row.application_id,
      occurrence_id: row.occurrence_id, intervention_component_key: key,
      route_key: routeKey.get(row.route_record_id), gtfs_route_id: row.gtfs_route_id,
      treatment_family_key: familyKey.get(row.treatment_family),
      treatment_display_name: treatmentName(treatment),
      action: row.action,
      extent: { kind: row.extent.kind, description: row.extent.description },
      source_keys: [...new Set(row.evidence_bindings.map((binding: any) => sourceKey.get(binding.source_id)))].filter(Boolean).sort(),
    };
  });
  const contextRows = links.map((row) => {
    const context = contextById.get(row.context_record_id);
    if (!context) throw new Error(`unresolved context display: ${row.context_record_id}`);
    return {
      schema_version: 1, occurrence_id: row.occurrence_id,
      context_record_id: row.context_record_id, context_kind: row.context_record_kind,
      display_name: context.display_name,
    };
  }).sort((a, b) => `${a.occurrence_id}|${a.context_record_id}`.localeCompare(`${b.occurrence_id}|${b.context_record_id}`));
  const episodeRows = episodes.map((episode) => {
    const apps = applicationsByEpisode.get(episode.occurrence_id) ?? [];
    const contexts = contextsByEpisode.get(episode.occurrence_id) ?? [];
    const routeNames = [...new Set(apps.map((app) => routeById.get(app.route_record_id)?.display_name).filter(Boolean))].sort();
    const treatmentNames = [...new Set(apps.map((app) => {
      const row = treatmentById.get(app.treatment_record_id);
      return row ? treatmentName(row) : null;
    }).filter(Boolean))].sort();
    const contextNames = [...new Set(contexts.map((link) => contextById.get(link.context_record_id)?.display_name).filter(Boolean))].sort();
    const scopeName = contextNames[0] ?? (routeNames.join(", ") || "Network scope");
    const action = [...new Set(apps.map((app) => app.action))].join("/");
    const treatment = treatmentNames[0] ?? "Intervention";
    const display = `${scopeName} — ${treatment}${action && action !== "unknown" ? ` (${action})` : ""} — ${episode.resolved_onset.date}`;
    reconciliation.push({ schema_version: 1, subject_kind: "episode", subject_id: episode.occurrence_id, disposition: "resolved", reason_code: contextNames.length ? "addressed_context_composition" : "route_treatment_onset_composition" });
    return {
      schema_version: 1, occurrence_id: episode.occurrence_id,
      display_name: display, normalized_sort_name: sortName(display), aliases: [],
      label_method: "deterministic_resolved_composition",
      source_keys: episode.source_ids.map((id: string) => sourceKey.get(id)).filter(Boolean).sort(),
    };
  }).sort((a, b) => String(a.occurrence_id).localeCompare(String(b.occurrence_id)));
  const placementRows = placements.map((row) => {
    const key = placementKey.get(row.placement_id);
    if (!key) throw new Error(`unresolved placement display: ${row.placement_id}`);
    reconciliation.push({ schema_version: 1, subject_kind: "placement", subject_id: row.placement_id, disposition: "resolved", reason_code: "reviewed_placement_display" });
    return {
      schema_version: 1, placement_id: row.placement_id, placement_key: key,
      route_key: routeKey.get(row.current_claim.route_record_id),
      treatment_family_key: familyKey.get(row.current_claim.treatment_family),
      scope: { kind: row.current_claim.scope.kind },
    };
  });
  const operations = readPublicKeyOperations(root);
  const manifest = {
    schema_version: 1 as const,
    contract_id: "resolved-transit-operator-public-display-v1" as const,
    as_of_date: asOfDate,
    inputs,
    public_key_registry_head: sha(operations.map((row) => stableJson(row as unknown as JsonValue)).join("\n")),
  };
  return {
    manifest,
    episodes: episodeRows,
    routes: routeRows,
    treatment_families: familyRows,
    contexts: contextRows,
    scopes: [...componentRows.map((row) => ({
      schema_version: 1, application_id: row.application_id,
      intervention_component_key: row.intervention_component_key, extent: row.extent,
      source_keys: row.source_keys,
    })), ...placementRows],
    sources: sourceRows,
    public_keys: operations,
    reconciliation: reconciliation.sort((a, b) => `${a.subject_kind}|${a.subject_id}`.localeCompare(`${b.subject_kind}|${b.subject_id}`)),
    summary: {
      schema_version: 1, episode_count: episodeRows.length,
      route_count: routeRows.length, treatment_family_count: familyRows.length,
      source_count: sourceRows.length, component_count: componentRows.length,
      placement_count: placementRows.length,
      reconciliation: summarizePublicDisplayReconciliation(reconciliation),
    },
  };
}

function line(value: unknown): string { return `${stableJson(value as JsonValue)}\n`; }
function lines(values: readonly unknown[]): string {
  return values.map((value) => stableJson(value as JsonValue)).join("\n") + (values.length ? "\n" : "");
}
export function operatorPublicDisplayContents(
  model: OperatorPublicDisplayDictionary,
): Record<string, string> {
  return {
    "manifest.json": line(model.manifest),
    "episodes.jsonl": lines(model.episodes),
    "routes.jsonl": lines(model.routes),
    "treatment_families.jsonl": lines(model.treatment_families),
    "contexts.jsonl": lines(model.contexts),
    "scopes.jsonl": lines(model.scopes),
    "sources.jsonl": lines(model.sources),
    "public_keys.jsonl": lines(model.public_keys),
    "reconciliation.jsonl": lines(model.reconciliation),
    "summary.json": line(model.summary),
  };
}
export function writeOperatorPublicDisplay(
  output: string,
  model: OperatorPublicDisplayDictionary,
): void {
  mkdirSync(output, { recursive: true });
  for (const [name, content] of Object.entries(operatorPublicDisplayContents(model))) {
    writeFileSync(join(output, name), content);
  }
}
export function checkOperatorPublicDisplay(
  output: string,
  model: OperatorPublicDisplayDictionary,
): void {
  for (const [name, content] of Object.entries(operatorPublicDisplayContents(model))) {
    const path = join(output, name);
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      throw new Error(`operator public display is missing or stale: ${path}`);
    }
  }
}
