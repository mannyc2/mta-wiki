import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { repoRoot } from "../packages/core/src/paths";

const OUTPUT_PATH = join(repoRoot, "data/test-contracts/test-local-dependency-inventory-v1.json");
const TEST_ROOTS = ["packages/agents/test", "packages/db/test", "packages/pipeline/test"];
const GATE_ENTRYPOINTS = [
  "package.json",
  "packages/cli/src/cli.ts",
  "packages/db/test/support/reproducible-canonical-db.ts",
  "scripts/determinism-anchor.ts",
  "scripts/generate-relationship-release-bundle-v1.ts",
  "scripts/verify-authoring-replay.ts",
  "scripts/verify-local-corpus-contracts.ts",
];
const LOCAL_PATTERNS = [
  { kind: "production_corpus", expression: /raw\/sources|["'`]raw["'`]\s*,\s*["'`]sources/u },
  { kind: "canonical_db", expression: /data\/canonical\.db|["'`]data["'`]\s*,\s*["'`]canonical\.db/u },
  { kind: "resolved_db", expression: /data\/resolved-transit\.db|resolved-transit\.db/u },
  { kind: "home_or_cache", expression: /process\.env\.(?:HOME|CODEX_HOME)|homedir\(|\/\.cache\//u },
  { kind: "environment", expression: /process\.env(?:\.|\[)/u },
] as const;

type DependencyClass =
  | "fixture_local"
  | "tracked_contract_only"
  | "reproducible_generated_state"
  | "production_corpus_required"
  | "nonreproducible_semantic_input"
  | "mixed"
  | "authoring_replay";

type AccessSite = {
  path: string;
  line: number;
  kinds: string[];
  excerpt: string;
};

type InventoryRow = {
  owner_kind: "test" | "gate";
  entrypoint_path: string;
  detected_access_sites: AccessSite[];
  paths_or_patterns: string[];
  transitive_helper_chain: string[];
  class: DependencyClass;
  reconstruction_command_or_corpus_pin: string | null;
  rationale: string;
  safe_in_default_suite: boolean;
};

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const output: string[] = [];
  for (const name of readdirSync(root).sort()) {
    const path = join(root, name);
    const stats = statSync(path);
    if (stats.isDirectory()) output.push(...walkFiles(path));
    else output.push(path);
  }
  return output;
}

function slash(value: string) {
  return value.replaceAll("\\", "/");
}

function testEntrypoints(): string[] {
  return TEST_ROOTS.flatMap((root) => walkFiles(join(repoRoot, root)))
    .map((path) => slash(relative(repoRoot, path)))
    .filter((path) => /\.test\.[cm]?[jt]sx?$/u.test(path))
    .sort();
}

function accessSites(path: string): AccessSite[] {
  const contents = readFileSync(join(repoRoot, path), "utf8");
  return contents.split(/\r?\n/u).flatMap((line, index) => {
    const kinds = LOCAL_PATTERNS.filter((pattern) => pattern.expression.test(line)).map((pattern) => pattern.kind);
    if (kinds.length === 0) return [];
    return [{
      path,
      line: index + 1,
      kinds: [...new Set(kinds)].sort(),
      excerpt: line.trim().slice(0, 240),
    }];
  });
}

const IMPORT_EXPRESSION =
  /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["'`]([^"'`]+)["'`]|import\(\s*["'`]([^"'`]+)["'`]\s*\)|require\(\s*["'`]([^"'`]+)["'`]\s*\)/gu;

function resolveRepositoryImport(importer: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const unresolved = resolve(repoRoot, dirname(importer), specifier);
  const candidates = extname(unresolved)
    ? [unresolved]
    : [
        unresolved,
        `${unresolved}.ts`,
        `${unresolved}.tsx`,
        `${unresolved}.mts`,
        `${unresolved}.cts`,
        `${unresolved}.js`,
        `${unresolved}.mjs`,
        `${unresolved}.cjs`,
        join(unresolved, "index.ts"),
        join(unresolved, "index.tsx"),
        join(unresolved, "index.js"),
      ];
  const match = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!match) return null;
  const repositoryRelative = slash(relative(repoRoot, match));
  if (repositoryRelative.startsWith("../") || repositoryRelative === "..") return null;
  return repositoryRelative;
}

function directImports(path: string): string[] {
  const contents = readFileSync(join(repoRoot, path), "utf8");
  const imports = new Set<string>();
  for (const match of contents.matchAll(IMPORT_EXPRESSION)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (!specifier) continue;
    const resolved = resolveRepositoryImport(path, specifier);
    if (resolved) imports.add(resolved);
  }
  return [...imports].sort();
}

function dependencyClosure(entrypoint: string): string[] {
  if (entrypoint === "package.json") return [entrypoint];
  const visited = new Set<string>();
  const pending = [entrypoint];
  while (pending.length > 0) {
    const path = pending.shift()!;
    if (visited.has(path)) continue;
    visited.add(path);
    for (const dependency of directImports(path)) {
      if (!visited.has(dependency)) pending.push(dependency);
    }
    pending.sort();
  }
  return [...visited].sort();
}

function rawLooksTemporary(contents: string): boolean {
  return (
    /mkdtempSync|makeTempDir|tmpdir\(|temporary root|fixtureRoot|fixture_source|test_source|_fixture/u.test(contents) &&
    !/copyFileSync\(\s*join\(repoRoot,\s*["'`]raw|sha256Hex\(`raw\/sources|readFileSync\([^;\n]*raw\/sources/u.test(contents)
  );
}

function classification(path: string, helperChain: string[], sites: AccessSite[]): Omit<InventoryRow, "owner_kind" | "entrypoint_path" | "detected_access_sites" | "paths_or_patterns" | "transitive_helper_chain"> {
  const contents = helperChain.map((helper) => readFileSync(join(repoRoot, helper), "utf8")).join("\n");
  const kinds = new Set(sites.flatMap((site) => site.kinds));
  const hasRaw = kinds.has("production_corpus");
  const hasDb = kinds.has("canonical_db") || kinds.has("resolved_db");
  const explicitLocalBoundary = /local-test-profile/u.test(contents);
  const hasJournalReplay =
    /entriesToRecords\(/u.test(contents) &&
    /readSubmissionEntries\(|data["'`/,\s]+submissions|JOURNAL_PATH|readJournal\(/u.test(contents);
  const hasDirectRawRead =
    /(?:readFileSync|Bun\.file|createReadStream|copyFileSync|statSync|sha256Hex|readJsonl)[^;\n]*(?:raw\/sources|["'`]raw["'`]\s*,\s*["'`]sources)/u.test(contents) ||
    /copyFileSync\(\s*join\(repoRoot,\s*["'`]raw/u.test(contents) ||
    /const\s+\w*(?:sourceRoot|sourceDir|path)\w*\s*=[^;\n]*(?:repoRoot[^;\n]*raw|raw\/sources)[\s\S]{0,1200}(?:readFileSync|copyFileSync|statSync)\(/u.test(contents);
  const hasProductionRead =
    hasRaw &&
    hasDirectRawRead &&
    !rawLooksTemporary(contents);
  const hasTrackedAssertions = /data\/canonical|data["'`/,\s]+canonical|data\/quality|data["'`/,\s]+quality/u.test(contents);

  if (hasRaw && rawLooksTemporary(contents)) {
    return {
      class: "fixture_local",
      reconstruction_command_or_corpus_pin: "test-owned temporary fixture",
      rationale: "Uses a raw-shaped path only within a fixture it creates and removes itself.",
      safe_in_default_suite: true,
    };
  }
  if (hasJournalReplay) {
    return {
      class: hasTrackedAssertions || hasProductionRead ? "mixed" : "authoring_replay",
      reconstruction_command_or_corpus_pin: "bun run test:authoring",
      rationale: explicitLocalBoundary
        ? "Journal replay is registered only by the explicit authoring profile after corpus preflight."
        : "Replays tracked authoring journals through validation that requires the pinned local evidence corpus.",
      safe_in_default_suite: explicitLocalBoundary,
    };
  }
  if (hasProductionRead) {
    return {
      class: hasTrackedAssertions ? "mixed" : "production_corpus_required",
      reconstruction_command_or_corpus_pin: "data/test-contracts/local-corpus-manifest-v1.json",
      rationale: explicitLocalBoundary
        ? "Production-byte assertions are registered only by the explicit corpus profile after preflight."
        : hasTrackedAssertions
        ? "Combines tracked semantic assertions with direct reads of ignored production source bytes."
        : "Directly verifies ignored production source bytes.",
      safe_in_default_suite: explicitLocalBoundary,
    };
  }
  if (hasDb) {
    return {
      class: "reproducible_generated_state",
      reconstruction_command_or_corpus_pin: "packages/db/test/support/reproducible-canonical-db.ts",
      rationale: "Requires a SQLite projection that is rebuilt under an owned temporary root from tracked canonical JSONL.",
      safe_in_default_suite: true,
    };
  }
  return {
    class: "tracked_contract_only",
    reconstruction_command_or_corpus_pin: null,
    rationale: hasRaw
      ? "Raw-shaped strings are fixture payload values or asserted provenance paths; no ignored production bytes are read."
      : "No ignored or local semantic dependency was detected.",
    safe_in_default_suite: true,
  };
}

function row(path: string, ownerKind: "test" | "gate"): InventoryRow {
  const helperChain = dependencyClosure(path);
  const sites = helperChain.flatMap(accessSites);
  const result = classification(path, helperChain, sites);
  return {
    owner_kind: ownerKind,
    entrypoint_path: path,
    detected_access_sites: sites,
    paths_or_patterns: [...new Set(sites.flatMap((site) => site.kinds))].sort(),
    transitive_helper_chain: helperChain,
    ...result,
  };
}

function inventory() {
  const rows = [
    ...testEntrypoints().map((path) => row(path, "test")),
    ...GATE_ENTRYPOINTS.map((path) => row(path, "gate")),
  ].sort((left, right) =>
    left.owner_kind.localeCompare(right.owner_kind) || left.entrypoint_path.localeCompare(right.entrypoint_path),
  );
  const serializedRows = `${JSON.stringify(rows)}\n`;
  return {
    contract_id: "test-local-dependency-inventory-v1",
    schema_version: 1,
    baseline_commit: "6a713a74b40841635bbce98cc96340feeeb80bda",
    scanner_sha256: createHash("sha256").update(readFileSync(import.meta.path)).digest("hex"),
    entrypoint_count: rows.length,
    unsafe_default_entrypoints: rows.filter((entry) => !entry.safe_in_default_suite).map((entry) => entry.entrypoint_path),
    rows_sha256: createHash("sha256").update(serializedRows).digest("hex"),
    rows,
  };
}

const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check") {
  throw new Error("usage: bun scripts/audit-test-local-dependencies.ts --write|--check");
}
const content = `${JSON.stringify(inventory(), null, 2)}\n`;
if (mode === "--write") {
  writeFileSync(OUTPUT_PATH, content);
  console.log(`Wrote ${slash(relative(repoRoot, OUTPUT_PATH))}`);
} else {
  if (!existsSync(OUTPUT_PATH)) throw new Error(`missing ${slash(relative(repoRoot, OUTPUT_PATH))}`);
  const tracked = readFileSync(OUTPUT_PATH, "utf8");
  if (tracked !== content) throw new Error("test-local dependency inventory is stale; run with --write");
  const parsed = JSON.parse(content) as { unsafe_default_entrypoints: string[] };
  if (parsed.unsafe_default_entrypoints.length > 0) {
    throw new Error(
      `unsafe local dependencies remain in the default suite:\n${parsed.unsafe_default_entrypoints.join("\n")}`,
    );
  }
  console.log("Test-local dependency inventory is current and default-suite safe");
}
