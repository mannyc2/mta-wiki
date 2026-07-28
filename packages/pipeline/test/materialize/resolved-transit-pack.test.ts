import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { assertPublicSafe } from "@mta-wiki/pipeline/consumer/public-contract";
import {
  buildResolvedTransitPublicPack,
} from "@mta-wiki/pipeline/materialize/resolved-transit-public";
import { publicPackContents } from "@mta-wiki/pipeline/materialize/resolved-transit-pack";

function jsonl(path: string): Array<Record<string, any>> {
  const text = readFileSync(path, "utf8").trim();
  return text ? text.split("\n").map(JSON.parse) : [];
}

describe("resolved transit knowledge pack", () => {
  it("reconciles exact operator episodes/components and confirmed-current placement state", () => {
    const pack = buildResolvedTransitPublicPack("2026-07-27");
    const operator = join(repoRoot, "data", "resolved-transit", "operator", "v1");
    expect(pack.episodes).toHaveLength(jsonl(join(operator, "interventions", "episodes.jsonl")).length);
    expect(pack.components).toHaveLength(jsonl(join(operator, "interventions", "applications.jsonl")).length);
    expect(pack.route_index).toHaveLength(pack.components.length);
    expect(pack.placements).toHaveLength(jsonl(join(operator, "placements", "registry.jsonl")).length);
    expect(pack.current_footprint).toHaveLength(
      jsonl(join(operator, "lifecycle", "current_intervention_footprint.jsonl")).length,
    );
    expect(pack.current_footprint.every((row) => row.state === "confirmed_active")).toBe(true);
    expect(new Set(pack.routes.map((row) => row.route_key))).toEqual(
      new Set(pack.route_index.map((row) => row.route_key)),
    );
    expect(pack.sources.every((source) =>
      source.url_status === "unavailable" ? source.url === null : typeof source.url === "string"
    )).toBe(true);
    expect(() => assertPublicSafe(pack)).not.toThrow();
  });

  it("is byte-deterministic and does not expose operator fields", () => {
    const first = publicPackContents(buildResolvedTransitPublicPack("2026-07-27"));
    const second = publicPackContents(buildResolvedTransitPublicPack("2026-07-27"));
    expect(second).toEqual(first);
    const bytes = Object.values(first).join("\n");
    expect(bytes).not.toMatch(/(?:record_id|application:|placement:|reviewer|decision_id|source_path)/u);
  });
});
