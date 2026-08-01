import { afterEach, describe, expect, it } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { buildResolvedTransitPublicPack } from "@mta-wiki/pipeline/materialize/resolved-transit-public";
import {
  trackerConformanceArtifactContents,
  validateTrackerConformance,
} from "@mta-wiki/pipeline/materialize/tracker-conformance";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "plan-056-tracker-conformance-"));
  dirs.push(root);
  const source = join(repoRoot, "data", "resolved-transit", "operator", "v1", "tracker-conformance");
  const target = join(root, "data", "resolved-transit", "operator", "v1", "tracker-conformance");
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
  return root;
}

describe("Plan 056 Tracker black-box conformance", () => {
  it("classifies the exact 204-episode baseline and reconciles the accepted producer result", () => {
    const pack = buildResolvedTransitPublicPack("2026-07-27");
    expect(() => validateTrackerConformance(pack, repoRoot)).not.toThrow();
    const root = join(repoRoot, "data", "resolved-transit", "operator", "v1", "tracker-conformance");
    const baseline = readFileSync(join(root, "tracker-baseline.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    const ledger = readFileSync(join(root, "accepted-diff-ledger.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    const summary = JSON.parse(readFileSync(join(root, "summary.json"), "utf8"));
    expect(baseline).toHaveLength(204);
    expect(ledger).toHaveLength(230);
    expect(summary.tracker_counts).toMatchObject({
      episodes: 204, routes: 179, episode_route_memberships: 243,
      reviewed_occurrence: 131, reviewed_reconciliation: 8, ace_registry: 65,
      ace_registry_events: 78, ace_registry_attached_events: 13,
    });
    expect(summary.accepted_result).toMatchObject({
      producer_episodes: 157, exact_components: 343, producer_route_keys: 170,
      producer_unique_gtfs_routes: 167, mapped_producer_truth: 131,
      tracker_enrichment_only: 65, justified_exclusions: 8, producer_additions: 26,
      onset_differences: 1,
    });
    expect(summary.black_box_surface_parity).toEqual({
      status: "pass", global_episode_count: 204, route_artifact_count: 179,
      membership_count: 243, identity_or_content_mismatch_count: 0,
    });
    const routeSurface = readFileSync(join(root, "tracker-route-surface.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    expect(routeSurface).toHaveLength(179);
    expect(routeSurface.flatMap((row) => row.episode_memberships)).toHaveLength(243);
    expect(new Set(routeSurface.flatMap((row) => row.episode_memberships.map((entry: any) => entry.tracker_episode_id))).size).toBe(204);
    expect(summary.provider_usage).toEqual({ provider_requests: 0, actual_cost_usd: 0 });
    expect(Object.keys(trackerConformanceArtifactContents(repoRoot))).toEqual([
      "tracker-baseline.jsonl", "accepted-diff-ledger.jsonl", "tracker-route-surface.jsonl",
      "summary.json", "accepted-ledger-receipt.json",
    ]);
  });

  it("fails closed on a schema mutation or content-addressed ledger change", () => {
    const pack = buildResolvedTransitPublicPack("2026-07-27");
    const schemaRoot = fixtureRoot();
    const ledgerPath = join(schemaRoot, "data", "resolved-transit", "operator", "v1", "tracker-conformance", "accepted-diff-ledger.jsonl");
    const ledgerLines = readFileSync(ledgerPath, "utf8").trim().split("\n");
    const first = JSON.parse(ledgerLines[0]!);
    first.unchecked = true;
    ledgerLines[0] = JSON.stringify(first);
    writeFileSync(ledgerPath, `${ledgerLines.join("\n")}\n`);
    expect(() => validateTrackerConformance(pack, schemaRoot)).toThrow(/exact fields/u);

    const hashRoot = fixtureRoot();
    const baselinePath = join(hashRoot, "data", "resolved-transit", "operator", "v1", "tracker-conformance", "tracker-baseline.jsonl");
    writeFileSync(baselinePath, readFileSync(baselinePath, "utf8").replace("reviewed_occurrence", "reviewed_reconciliation"));
    expect(() => validateTrackerConformance(pack, hashRoot)).toThrow();

    const routeRoot = fixtureRoot();
    const routePath = join(routeRoot, "data", "resolved-transit", "operator", "v1", "tracker-conformance", "tracker-route-surface.jsonl");
    const routeLines = readFileSync(routePath, "utf8").trim().split("\n");
    const route = JSON.parse(routeLines[0]!);
    route.episode_memberships[0].episode_sha256 = "0".repeat(64);
    routeLines[0] = JSON.stringify(route);
    writeFileSync(routePath, `${routeLines.join("\n")}\n`);
    expect(() => validateTrackerConformance(pack, routeRoot)).toThrow(/content drifted/u);
  });
});
