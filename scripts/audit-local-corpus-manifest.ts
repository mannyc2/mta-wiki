import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { parseLocalCorpusContract, type LocalCorpusContractEntry } from "../packages/pipeline/test/support/corpus-contract";

const RAW_MANIFEST_PATH = "data/raw-sources-manifest.jsonl";
const REVIEWED_PINS_PATH = "data/test-contracts/local-corpus-reviewed-pins-v1.json";
const OUTPUT_PATH = "data/test-contracts/local-corpus-manifest-v1.json";
const TEST_ROOT = join(repoRoot, "packages");

type RawManifestRow = { path: string; sha256: string; bytes: number };

function slash(value: string): string {
  return value.replaceAll("\\", "/");
}

function walk(path: string): string[] {
  const output: string[] = [];
  for (const name of readdirSync(path).sort()) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const child = join(path, name);
    if (statSync(child).isDirectory()) output.push(...walk(child));
    else output.push(child);
  }
  return output;
}

function strings(value: unknown, output = new Set<string>()): Set<string> {
  if (typeof value === "string") output.add(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, output);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) strings(item, output);
  }
  return output;
}

function sourceId(path: string): string | null {
  const match = /^raw\/sources\/([^/]+)\//u.exec(path);
  return match?.[1] ?? null;
}

function artifactRows(value: unknown, output: RawManifestRow[] = []): RawManifestRow[] {
  if (Array.isArray(value)) {
    for (const item of value) artifactRows(item, output);
  } else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (
      typeof object.path === "string" &&
      object.path.startsWith("raw/sources/") &&
      typeof object.sha256 === "string" &&
      /^[a-f0-9]{64}$/u.test(object.sha256) &&
      Number.isSafeInteger(object.bytes) &&
      Number(object.bytes) >= 0
    ) {
      output.push({
        path: object.path,
        sha256: object.sha256,
        bytes: Number(object.bytes),
      });
    }
    for (const item of Object.values(object)) artifactRows(item, output);
  }
  return output;
}

function trackedJsonStrings(contents: string): Set<string> {
  const output = new Set<string>();
  const literal = /["'`]((?:data|raw)\/[^"'`]+\.json)["'`]/gu;
  for (const match of contents.matchAll(literal)) {
    const path = match[1]!;
    if (!path.startsWith("data/")) continue;
    const absolute = join(repoRoot, path);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
    try {
      strings(JSON.parse(readFileSync(absolute, "utf8")) as unknown, output);
    } catch {
      // A string ending in .json can be a fixture value rather than a tracked JSON document.
    }
  }
  return output;
}

function callSlices(contents: string, names: readonly string[]): string {
  const slices: string[] = [];
  for (const name of names) {
    const expression = new RegExp(`\\b${name}\\s*\\(`, "gu");
    for (const match of contents.matchAll(expression)) {
      const start = match.index!;
      const open = contents.indexOf("(", start);
      let depth = 0;
      let quote: "'" | '"' | "`" | null = null;
      let escaped = false;
      for (let index = open; index < contents.length; index += 1) {
        const character = contents[index]!;
        if (quote) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === quote) quote = null;
          continue;
        }
        if (character === "'" || character === '"' || character === "`") {
          quote = character;
          continue;
        }
        if (character === "(") depth += 1;
        else if (character === ")") {
          depth -= 1;
          if (depth === 0) {
            slices.push(contents.slice(start, index + 1));
            break;
          }
        }
      }
    }
  }
  return slices.join("\n");
}

function namedFunctionDeclarations(contents: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const match of contents.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/gu)) {
    const name = match[1]!;
    const open = contents.indexOf("{", match.index!);
    if (open === -1) continue;
    let depth = 0;
    let quote: "'" | '"' | "`" | null = null;
    let escaped = false;
    for (let index = open; index < contents.length; index += 1) {
      const character = contents[index]!;
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === "'" || character === '"' || character === "`") {
        quote = character;
        continue;
      }
      if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          declarations.set(name, contents.slice(match.index!, index + 1));
          break;
        }
      }
    }
  }
  return declarations;
}

function corpusScopedContents(contents: string): string {
  const names = ["corpusIt"];
  if (/\bconst\s+describeCorpus\s*=\s*corpusDescribe\s*;/u.test(contents)) {
    names.push("describeCorpus");
  }
  let scoped = callSlices(contents, names);
  const declarations = new Map<string, string>();
  for (const match of contents.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]*?);\s*(?:\r?\n|$)/gu)) {
    declarations.set(match[1]!, match[0]);
  }
  for (const [name, declaration] of namedFunctionDeclarations(contents)) {
    declarations.set(name, declaration);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, declaration] of declarations) {
      if (
        new RegExp(`\\b${name}\\b`, "u").test(scoped) &&
        !scoped.includes(declaration)
      ) {
        scoped = `${declaration}\n${scoped}`;
        changed = true;
      }
    }
  }
  return scoped;
}

function deriveEntries(): LocalCorpusContractEntry[] {
  const rawRows = readFileSync(join(repoRoot, RAW_MANIFEST_PATH), "utf8")
    .split(/\r?\n/gu)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RawManifestRow)
    .filter((row) => sourceId(row.path) !== null);
  const operationalSnapshots = JSON.parse(
    readFileSync(join(repoRoot, "data/reference/operational/snapshots.json"), "utf8"),
  ) as { snapshots: Array<{ artifacts: RawManifestRow[] }> };
  for (const row of operationalSnapshots.snapshots.flatMap((snapshot) => snapshot.artifacts)) {
    if (sourceId(row.path) === null) continue;
    const existing = rawRows.find((candidate) => candidate.path === row.path);
    if (existing && (existing.sha256 !== row.sha256 || existing.bytes !== row.bytes)) {
      throw new Error(`Conflicting tracked raw artifact pin: ${row.path}`);
    }
    if (!existing) rawRows.push(row);
  }
  const reviewedPins = JSON.parse(
    readFileSync(join(repoRoot, REVIEWED_PINS_PATH), "utf8"),
  ) as { contract_id: unknown; schema_version: unknown; artifacts: unknown };
  if (
    reviewedPins.contract_id !== "mta-wiki-local-corpus-reviewed-pins-v1" ||
    reviewedPins.schema_version !== 1 ||
    !Array.isArray(reviewedPins.artifacts)
  ) {
    throw new Error(`Invalid ${REVIEWED_PINS_PATH}`);
  }
  const reviewedRows = artifactRows(reviewedPins);
  if (reviewedRows.length !== reviewedPins.artifacts.length) {
    throw new Error(`${REVIEWED_PINS_PATH} contains an invalid artifact pin`);
  }
  for (const row of reviewedRows) {
    const existing = rawRows.find((candidate) => candidate.path === row.path);
    if (existing && (existing.sha256 !== row.sha256 || existing.bytes !== row.bytes)) {
      throw new Error(`Conflicting reviewed raw artifact pin: ${row.path}`);
    }
    if (!existing) rawRows.push(row);
  }
  const receiptRoot = join(repoRoot, "data/quality/acquisition/receipts");
  for (const path of walk(receiptRoot).filter((candidate) => candidate.endsWith(".json"))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch {
      continue;
    }
    for (const row of artifactRows(parsed)) {
      const existing = rawRows.find((candidate) => candidate.path === row.path);
      if (existing && (existing.sha256 !== row.sha256 || existing.bytes !== row.bytes)) {
        throw new Error(`Conflicting tracked raw artifact pin: ${row.path}`);
      }
      if (!existing) rawRows.push(row);
    }
    const receipt = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
    if (
      receipt &&
      typeof receipt.source_id === "string" &&
      receipt.output_artifacts &&
      typeof receipt.output_artifacts === "object"
    ) {
      const bytes = readFileSync(path);
      const row = {
        path: `raw/sources/${receipt.source_id}/receipt.json`,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
      };
      const existing = rawRows.find((candidate) => candidate.path === row.path);
      if (existing && (existing.sha256 !== row.sha256 || existing.bytes !== row.bytes)) {
        throw new Error(`Conflicting tracked raw receipt pin: ${row.path}`);
      }
      if (!existing) rawRows.push(row);
    }
  }
  const rowsBySource = new Map<string, RawManifestRow[]>();
  for (const row of rawRows) {
    const id = sourceId(row.path)!;
    rowsBySource.set(id, [...(rowsBySource.get(id) ?? []), row]);
  }
  const knownSources = new Set(rowsBySource.keys());
  const familiesByPath = new Map<string, Set<string>>();
  const unpinnedByFamily = new Map<string, string[]>();
  const add = (row: RawManifestRow, family: string) => {
    const families = familiesByPath.get(row.path) ?? new Set<string>();
    families.add(family);
    familiesByPath.set(row.path, families);
  };

  const seed = parseLocalCorpusContract(
    JSON.parse(readFileSync(join(repoRoot, OUTPUT_PATH), "utf8")) as unknown,
  );
  const rowByPath = new Map(rawRows.map((row) => [row.path, row]));
  for (const entry of seed.entries.filter((candidate) =>
    candidate.test_families.includes("qbnr-study-readiness")
  )) {
    const existing = rowByPath.get(entry.path);
    if (existing && (existing.sha256 !== entry.sha256 || existing.bytes !== entry.bytes)) {
      throw new Error(`Seed local-corpus pin conflicts with ${RAW_MANIFEST_PATH}: ${entry.path}`);
    }
    const row = existing ?? {
      path: entry.path,
      sha256: entry.sha256,
      bytes: entry.bytes,
    };
    rowByPath.set(entry.path, row);
    const id = sourceId(entry.path)!;
    if (!rowsBySource.has(id)) rowsBySource.set(id, []);
    if (!(rowsBySource.get(id) ?? []).some((candidate) => candidate.path === row.path)) {
      rowsBySource.get(id)!.push(row);
    }
    knownSources.add(id);
    for (const family of entry.test_families) add(row, family);
  }

  const profileFiles = walk(TEST_ROOT)
    .filter((path) => path.endsWith(".test.ts"))
    .filter((path) => /\b(?:corpusIt|corpusDescribe)\b/u.test(readFileSync(path, "utf8")))
    .sort();
  for (const absolute of profileFiles) {
    const path = slash(relative(repoRoot, absolute));
    const family = `corpus-profile:${basename(path, ".test.ts")}`;
    const contents = readFileSync(absolute, "utf8");
    const scopedContents = corpusScopedContents(contents);
    const literals = new Set(
      [...scopedContents.matchAll(/["'`]([^"'`\r\n]+)["'`]/gu)].map((match) => match[1]!),
    );
    for (const value of trackedJsonStrings(scopedContents)) literals.add(value);
    const sources = new Set<string>();
    const exactPaths = new Set<string>();
    const basenames = new Set<string>();
    let needsExtracted = false;
    for (const value of literals) {
      if (knownSources.has(value)) sources.add(value);
      const directId = sourceId(value);
      if (directId) {
        const identifier = /^\$\{([A-Za-z_$][\w$]*)\}$/u.exec(directId)?.[1];
        if (identifier) {
          const resolved = new RegExp(
            `\\bconst\\s+${identifier}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`,
            "u",
          ).exec(scopedContents)?.[1];
          if (resolved) sources.add(resolved);
        } else if (!directId.includes("${")) {
          sources.add(directId);
        }
        if (rowByPath.has(value)) exactPaths.add(value);
      }
      if (/^(?:source\.[a-z0-9]+|metadata\.json|blocks\.jsonl|text\.txt|receipt\.json)$/u.test(value)) {
        basenames.add(value);
      }
      if (value.includes("/extracted") || value === "extracted") needsExtracted = true;
    }
    for (const exact of exactPaths) add(rowByPath.get(exact)!, family);
    const unpinnedSources = [...sources].filter((id) =>
      (rowsBySource.get(id) ?? []).length === 0
    ).sort();
    if (unpinnedSources.length > 0) {
      unpinnedByFamily.set(path, unpinnedSources);
      continue;
    }
    for (const id of [...sources].sort()) {
      for (const row of rowsBySource.get(id) ?? []) {
        const name = basename(row.path);
        if (
          basenames.has(name) ||
          (needsExtracted && row.path.startsWith(`raw/sources/${id}/extracted/`))
        ) {
          add(row, family);
        }
      }
    }
  }
  if (unpinnedByFamily.size > 0) {
    throw new Error(
      "Corpus profiles require ignored source artifacts with no tracked path/hash/byte inventory:\n" +
        [...unpinnedByFamily.entries()]
          .flatMap(([path, sources]) => [path, ...sources.map((source) => `  ${source}`)])
          .join("\n"),
    );
  }
  return [...familiesByPath.entries()]
    .map(([path, families]) => {
      const row = rowByPath.get(path)!;
      return {
        source_id: sourceId(path)!,
        path,
        sha256: row.sha256,
        bytes: row.bytes,
        test_families: [...families].sort(),
      };
    })
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function content(): string {
  const contract = {
    contract_id: "mta-wiki-local-corpus-v1",
    schema_version: 1,
    entries: deriveEntries(),
  };
  parseLocalCorpusContract(contract);
  return `${JSON.stringify(contract, null, 2)}\n`;
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode !== "--write" && mode !== "--check") {
    throw new Error("usage: bun scripts/audit-local-corpus-manifest.ts --write|--check");
  }
  const expected = content();
  if (mode === "--write") {
    writeFileSync(join(repoRoot, OUTPUT_PATH), expected);
    console.log(`Wrote ${OUTPUT_PATH}`);
  } else {
    if (readFileSync(join(repoRoot, OUTPUT_PATH), "utf8") !== expected) {
      throw new Error(`Local corpus manifest is stale; run ${import.meta.path} --write`);
    }
    console.log(`Local corpus manifest verified (${JSON.parse(expected).entries.length} artifacts)`);
  }
}
