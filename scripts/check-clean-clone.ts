import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";

function run(command: string, args: string[]): void {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function status(): string {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("unable to inspect tracked worktree state");
  return result.stdout;
}

const before = status();
const ownedRoot = mkdtempSync(join(tmpdir(), "mta-wiki-check-"));
try {
  run("bun", ["scripts/audit-test-local-dependencies.ts", "--check"]);
  run("bun", ["scripts/audit-producer-input-closure.ts", "--check", "--profile", "public-snapshot"]);
  run("bun", ["run", "typecheck"]);
  run("bun", ["run", "test"]);
  run("bun", [
    "packages/cli/src/cli.ts",
    "rebuild-db-from-canonical",
    "--output-db",
    join(ownedRoot, "canonical.db"),
    "--owned-root",
    ownedRoot,
  ]);
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
  rmSync(ownedRoot, { recursive: true, force: true });
}

const after = status();
if (after !== before) {
  throw new Error(`clean-clone check changed tracked files:\n${after}`);
}
console.log("\nClean-clone aggregate gate passed without changing tracked authoring output.");
