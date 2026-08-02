import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { rebuildResolvedTransitDb } from "../packages/db/src/resolved-transit-db.js";
import { buildProductionInterventionPlacements } from "../packages/pipeline/src/materialize/intervention-placement-build.js";
import { buildProductionResolvedInterventions } from "../packages/pipeline/src/materialize/resolved-interventions.js";

function run(command: string, args: string[]): void {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status ?? 1}`);
  }
}

function status(): string {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("unable to inspect tracked worktree state");
  return result.stdout;
}

function exposeOwnedProjection(target: string, repositoryPath: string): boolean {
  if (existsSync(repositoryPath)) return false;
  symlinkSync(target, repositoryPath);
  return true;
}

const before = status();
const ownedRoot = mkdtempSync(join(tmpdir(), "mta-wiki-check-"));
const ownedCanonicalDb = join(ownedRoot, "canonical.db");
const ownedResolvedTransitDb = join(ownedRoot, "resolved-transit.db");
const repositoryCanonicalDb = join(repoRoot, "data", "canonical.db");
const repositoryResolvedTransitDb = join(repoRoot, "data", "resolved-transit.db");
const exposedProjections: string[] = [];
try {
  run("bun", ["scripts/audit-test-local-dependencies.ts", "--check"]);
  run("bun", ["scripts/audit-producer-input-closure.ts", "--check", "--profile", "public-snapshot"]);
  run("bun", ["run", "typecheck"]);
  run("bun", ["run", "test"]);
  run("bun", [
    "packages/cli/src/cli.ts",
    "rebuild-db-from-canonical",
    "--output-db",
    ownedCanonicalDb,
    "--owned-root",
    ownedRoot,
  ]);
  if (exposeOwnedProjection(ownedCanonicalDb, repositoryCanonicalDb)) {
    exposedProjections.push(repositoryCanonicalDb);
  }
  const resolved = buildProductionResolvedInterventions();
  const placement = buildProductionInterventionPlacements("2026-07-27");
  const rebuiltResolved = rebuildResolvedTransitDb({
    ...resolved,
    placements: placement.registry,
    placement_transitions: placement.transitions,
    placement_frontier: placement.frontier.candidate_ledger,
    placement_reconciliation: placement.frontier.transition_reconciliation,
    documentary_lifecycle_observations: placement.documentary_lifecycle_observations,
    lifecycle_assertions: placement.lifecycle.assertions,
    placement_states_as_of: placement.lifecycle.states,
    current_footprint: placement.lifecycle.footprint,
  }, { path: ownedResolvedTransitDb });
  console.log(
    `Rebuilt owned resolved transit DB: ${rebuiltResolved.episodeCount} episodes, ` +
      `${rebuiltResolved.applicationCount} applications.`,
  );
  if (exposeOwnedProjection(ownedResolvedTransitDb, repositoryResolvedTransitDb)) {
    exposedProjections.push(repositoryResolvedTransitDb);
  }
  run("bun", ["run", "validate"]);
  run("bun", ["scripts/determinism-anchor.ts"]);
  run("bun", ["packages/cli/src/cli.ts", "verify-release", "v1-rc28"]);
  run("bun", [
    "packages/cli/src/cli.ts",
    "resolved-pack-reference-adapter",
    "--input",
    join(repoRoot, "data/contract-fixtures/resolved-transit-pack-v1-hand-reviewed/public"),
    "--json",
    join(ownedRoot, "reference-adapter.json"),
  ]);
} finally {
  for (const path of exposedProjections.reverse()) rmSync(path, { force: true });
  rmSync(ownedRoot, { recursive: true, force: true });
}

const after = status();
if (after !== before) {
  throw new Error(`clean-clone check changed tracked files:\n${after}`);
}
console.log("\nClean-clone aggregate gate passed without changing tracked authoring output.");
