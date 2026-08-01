import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  assertPublicSafe,
  parseResolvedTransitPublicPack,
  type ResolvedTransitPublicPack,
} from "@mta-wiki/pipeline/consumer/public-contract";
import {
  buildResolvedTransitPublicPack,
} from "@mta-wiki/pipeline/materialize/resolved-transit-public";
import {
  publicPackContents,
  verifyPublicPackDirectory,
  verifyResolvedTransitPackDirectory,
  writeResolvedTransitPack,
} from "@mta-wiki/pipeline/materialize/resolved-transit-pack";

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
    expect(pack.episodes.every((row) => !row.display_name.includes(row.onset.date))).toBe(true);
    expect(pack.components.every((row) => row.treatment_family_label.trim() && row.action_label.trim() &&
      row.extent.label.trim() && row.details.trim() && row.source_refs.length > 0)).toBe(true);
    expect(pack.components.filter((row) => row.action === "unknown" || row.extent.kind === "unknown"))
      .toHaveLength(139);
    expect(pack.components.filter((row) => row.action === "unknown" || row.extent.kind === "unknown")
      .every((row) => row.caveats.length > 0)).toBe(true);
  });

  it("rejects arbitrary dates rather than relabeling the frozen lifecycle snapshot", () => {
    expect(() => buildResolvedTransitPublicPack("not-a-date")).toThrow(/as-of/u);
    expect(() => buildResolvedTransitPublicPack("2099-12-31")).toThrow(/as-of/u);
  });

  it("exact-decodes every public resource and rejects schema/join mutations", () => {
    const fixtureRoot = join(repoRoot, "data", "contract-fixtures", "resolved-transit-pack-v1-hand-reviewed", "public");
    const fixture = verifyPublicPackDirectory(fixtureRoot);
    type MutablePack = ResolvedTransitPublicPack & Record<string, any>;
    const mutate = (change: (copy: MutablePack) => void): unknown => {
      const copy = structuredClone(fixture) as MutablePack;
      change(copy);
      return copy;
    };
    const excessMutations: Array<(copy: MutablePack) => void> = [
      (copy) => { (copy.manifest as any).extra = true; },
      (copy) => { (copy.episodes[0] as any).extra = true; },
      (copy) => { (copy.components[0] as any).extra = true; },
      (copy) => { (copy.placements[0] as any).extra = true; },
      (copy) => { (copy.routes[0] as any).extra = true; },
      (copy) => { (copy.treatment_families[0] as any).extra = true; },
      (copy) => { (copy.route_index[0] as any).extra = true; },
      (copy) => { (copy.history[0] as any).extra = true; },
      (copy) => { (copy.current_footprint[0] as any).extra = true; },
      (copy) => { (copy.summary as any).extra = true; },
      (copy) => { (copy.sources[0] as any).extra = true; },
    ];
    for (const change of excessMutations) {
      expect(() => parseResolvedTransitPublicPack(mutate(change))).toThrow(/exact fields/u);
    }
    expect(() => parseResolvedTransitPublicPack(mutate((copy) => { delete (copy.components[0] as any).details; })))
      .toThrow(/exact fields/u);
    expect(() => parseResolvedTransitPublicPack(mutate((copy) => { copy.manifest.as_of_date = "2026-02-30"; })))
      .toThrow(/calendar/u);
    expect(() => parseResolvedTransitPublicPack(mutate((copy) => { copy.episodes[0]!.onset.date = "2025-02-30"; })))
      .toThrow(/calendar/u);
    expect(() => parseResolvedTransitPublicPack(mutate((copy) => { copy.sources[0]!.date = "2025-13"; })))
      .toThrow(/date/u);
    expect(() => parseResolvedTransitPublicPack(mutate((copy) => { copy.routes[0]!.route_key = "route-unknown"; })))
      .toThrow(/unknown/u);
    expect(() => parseResolvedTransitPublicPack(mutate((copy) => { copy.episodes.push(structuredClone(copy.episodes[0]!)); })))
      .toThrow(/duplicate/u);
    expect(() => parseResolvedTransitPublicPack(mutate((copy) => { copy.components[0]!.route_key = "missing-route"; })))
      .toThrow(/broken/u);
    expect(() => parseResolvedTransitPublicPack(mutate((copy) => { copy.components[0]!.gtfs_route_id = "WRONG"; })))
      .toThrow(/GTFS route identity/u);
    expect(() => parseResolvedTransitPublicPack(mutate((copy) => { copy.route_index.pop(); })))
      .toThrow(/mismatch/u);
    expect(() => parseResolvedTransitPublicPack(mutate((copy) => { copy.current_footprint.pop(); copy.summary.confirmed_current_placement_count = 0; copy.summary.confirmed_current_route_count = 0; })))
      .toThrow(/footprint/u);

    const production = buildResolvedTransitPublicPack("2026-07-27");
    const productionMutation = (change: (copy: MutablePack) => void): unknown => {
      const copy = structuredClone(production) as MutablePack;
      change(copy);
      return copy;
    };
    expect(() => parseResolvedTransitPublicPack(productionMutation((copy) => {
      copy.history = copy.history.filter((row) => row.history_kind !== "placement_transition");
      copy.summary.frontier_profile = "bypass";
    }))).toThrow(/transition coverage/u);
    expect(() => parseResolvedTransitPublicPack(productionMutation((copy) => {
      const transition = copy.history.find((row) => row.history_kind === "placement_transition")!;
      transition.intervention_id = copy.episodes.find((row) => row.intervention_id !== transition.intervention_id)!.intervention_id;
    }))).toThrow(/ownership\/action/u);
    expect(() => parseResolvedTransitPublicPack(productionMutation((copy) => {
      copy.history.find((row) => row.history_kind === "placement_transition")!.action = "retain";
    }))).toThrow(/ownership\/action/u);
    expect(() => parseResolvedTransitPublicPack(productionMutation((copy) => {
      const transitions = copy.history.filter((row) => row.history_kind === "placement_transition");
      transitions[1]!.result_placement_keys = [...transitions[0]!.result_placement_keys];
      copy.summary.frontier_profile = "bypass";
    }))).toThrow(/transition result/u);
    expect(() => parseResolvedTransitPublicPack(productionMutation((copy) => {
      const transition = copy.history.find((row) => row.history_kind === "placement_transition")!;
      transition.target_placement_keys = [copy.placements[0]!.placement_key];
    }))).toThrow(/transition shape/u);
    expect(() => parseResolvedTransitPublicPack(productionMutation((copy) => {
      const transition = copy.history.find((row) => row.history_kind === "placement_transition")!;
      const placementKey = transition.result_placement_keys[0]!;
      transition.result_placement_keys = [];
      copy.placements.find((row) => row.placement_key === placementKey)!.founding_intervention_component_key = null;
    }))).toThrow(/transition shape/u);
  });

  it("is byte-deterministic and does not expose operator fields", () => {
    const first = publicPackContents(buildResolvedTransitPublicPack("2026-07-27"));
    const second = publicPackContents(buildResolvedTransitPublicPack("2026-07-27"));
    expect(second).toEqual(first);
    const bytes = Object.values(first).join("\n");
    expect(bytes).not.toMatch(/(?:record_id|application:|placement:|reviewer|decision_id|source_path)/u);
  });

  it("recomputes and rejects a mutated outer public-resource fingerprint", () => {
    const temp = mkdtempSync(join(tmpdir(), "resolved-pack-envelope-"));
    const output = join(temp, "pack");
    try {
      writeResolvedTransitPack(output, "2026-07-27");
      expect(() => verifyResolvedTransitPackDirectory(output)).not.toThrow();
      const manifestPath = join(output, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
      manifest.public_fingerprint = "0".repeat(64);
      writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
      expect(() => verifyResolvedTransitPackDirectory(output)).toThrow(/fingerprint/u);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
