import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  parseResolvedTransitPublicPack,
  PUBLIC_RESOURCE_ROLES,
} from "../consumer/public-contract.js";
import {
  buildResolvedTransitPublicPack,
  type ResolvedTransitPublicPack,
} from "./resolved-transit-public.js";

function json(value: unknown): string { return `${stableJson(value as JsonValue)}\n`; }
function jsonl(values: readonly unknown[]): string {
  return values.map((row) => stableJson(row as JsonValue)).join("\n") + (values.length ? "\n" : "");
}
export function publicPackContents(pack: ResolvedTransitPublicPack): Record<string, string> {
  return {
    "manifest.json": json(pack.manifest),
    "public_intervention_episodes.jsonl": jsonl(pack.episodes),
    "public_intervention_components.jsonl": jsonl(pack.components),
    "public_intervention_placements.jsonl": jsonl(pack.placements),
    "public_routes.jsonl": jsonl(pack.routes),
    "public_treatment_families.jsonl": jsonl(pack.treatment_families),
    "public_route_intervention_index.jsonl": jsonl(pack.route_index),
    "public_intervention_history.jsonl": jsonl(pack.history),
    "public_current_footprint.jsonl": jsonl(pack.current_footprint),
    "public_network_summary.json": json(pack.summary),
    "public_sources.jsonl": jsonl(pack.sources),
  };
}
export function writeResolvedTransitPack(
  output: string,
  asOfDate: string,
  root = repoRoot,
): { publicPack: ResolvedTransitPublicPack; fingerprint: string } {
  if (existsSync(output)) throw new Error(`resolved pack output already exists: ${output}`);
  const pack = buildResolvedTransitPublicPack(asOfDate, root);
  const publicDir = join(output, "public");
  const operatorDir = join(output, "operator");
  mkdirSync(publicDir, { recursive: true });
  mkdirSync(operatorDir, { recursive: true });
  const contents = publicPackContents(pack);
  for (const [name, content] of Object.entries(contents)) writeFileSync(join(publicDir, name), content);
  const source = join(root, "data", "resolved-transit", "operator", "v1");
  for (const name of ["interventions", "placements", "lifecycle", "public-display", "tracker-conformance"]) {
    cpSync(join(source, name), join(operatorDir, name), { recursive: true });
  }
  const fingerprint = createHash("sha256").update(
    Object.entries(contents).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, content]) => `${name}\0${content}`).join("\n"),
  ).digest("hex");
  writeFileSync(join(output, "manifest.json"), json({
    schema_version: 1,
    contract_id: "resolved-transit-knowledge-pack-v1",
    as_of_date: asOfDate,
    public_fingerprint: fingerprint,
    public_resource_count: Object.keys(contents).length,
    operator_role: "complete_resolved_audit_contract",
    public_role: "consumer_safe_product_contract",
  }));
  return { publicPack: pack, fingerprint };
}

export function verifyPublicPackDirectory(input: string): ResolvedTransitPublicPack {
  const expectedFiles = ["manifest.json", ...PUBLIC_RESOURCE_ROLES.map(([name]) => name)].sort();
  const actualFiles = readdirSync(input, { withFileTypes: true }).map((entry) => {
    if (!entry.isFile()) throw new Error(`public pack contains a non-file entry: ${entry.name}`);
    return entry.name;
  }).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error("public pack directory resource set mismatch");
  }
  const read = (name: string) => readFileSync(join(input, name), "utf8");
  const lines = (name: string) => {
    const text = read(name).trim();
    return text ? text.split("\n").map((line) => JSON.parse(line) as unknown) : [];
  };
  return parseResolvedTransitPublicPack({
    manifest: JSON.parse(read("manifest.json")) as unknown,
    episodes: lines("public_intervention_episodes.jsonl"),
    components: lines("public_intervention_components.jsonl"),
    placements: lines("public_intervention_placements.jsonl"),
    routes: lines("public_routes.jsonl"),
    treatment_families: lines("public_treatment_families.jsonl"),
    route_index: lines("public_route_intervention_index.jsonl"),
    history: lines("public_intervention_history.jsonl"),
    current_footprint: lines("public_current_footprint.jsonl"),
    summary: JSON.parse(read("public_network_summary.json")) as unknown,
    sources: lines("public_sources.jsonl"),
  });
}
