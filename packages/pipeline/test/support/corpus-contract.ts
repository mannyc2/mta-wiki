import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { repoRoot } from "../../../core/src/paths";

export const LOCAL_CORPUS_CONTRACT_PATH = "data/test-contracts/local-corpus-manifest-v1.json";

export type LocalCorpusContractEntry = {
  source_id: string;
  path: string;
  sha256: string;
  bytes: number;
  test_families: string[];
};

export type LocalCorpusContract = {
  contract_id: "mta-wiki-local-corpus-v1";
  schema_version: 1;
  entries: LocalCorpusContractEntry[];
};

export type LocalCorpusInspection = {
  contract: LocalCorpusContract;
  present: LocalCorpusContractEntry[];
  missing: LocalCorpusContractEntry[];
  mismatched: Array<{
    entry: LocalCorpusContractEntry;
    actual_sha256: string;
    actual_bytes: number;
  }>;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.join("\0") !== wanted.join("\0")) {
    throw new Error(`${label} keys must be exactly ${wanted.join(", ")}`);
  }
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a nonempty string`);
  return value;
}

function parseEntry(value: unknown, index: number): LocalCorpusContractEntry {
  const label = `entries[${index}]`;
  const parsed = object(value, label);
  exactKeys(parsed, ["source_id", "path", "sha256", "bytes", "test_families"], label);
  const sourceId = nonemptyString(parsed.source_id, `${label}.source_id`);
  const path = nonemptyString(parsed.path, `${label}.path`);
  const normalized = normalize(path).replaceAll("\\", "/");
  if (
    normalized !== path ||
    isAbsolute(path) ||
    !path.startsWith(`raw/sources/${sourceId}/`) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`${label}.path must be normalized below raw/sources/${sourceId}/`);
  }
  const sha256 = nonemptyString(parsed.sha256, `${label}.sha256`);
  if (!/^[0-9a-f]{64}$/u.test(sha256)) throw new Error(`${label}.sha256 must be lowercase SHA-256`);
  if (!Number.isSafeInteger(parsed.bytes) || Number(parsed.bytes) < 0) {
    throw new Error(`${label}.bytes must be a nonnegative safe integer`);
  }
  if (
    !Array.isArray(parsed.test_families) ||
    parsed.test_families.length === 0 ||
    parsed.test_families.some((family) => typeof family !== "string" || !family.trim())
  ) {
    throw new Error(`${label}.test_families must be a nonempty string array`);
  }
  const testFamilies = [...new Set(parsed.test_families as string[])].sort();
  if (testFamilies.join("\0") !== (parsed.test_families as string[]).join("\0")) {
    throw new Error(`${label}.test_families must be sorted and unique`);
  }
  return { source_id: sourceId, path, sha256, bytes: Number(parsed.bytes), test_families: testFamilies };
}

export function parseLocalCorpusContract(value: unknown): LocalCorpusContract {
  const parsed = object(value, "local corpus contract");
  exactKeys(parsed, ["contract_id", "schema_version", "entries"], "local corpus contract");
  if (parsed.contract_id !== "mta-wiki-local-corpus-v1") throw new Error("unsupported local corpus contract_id");
  if (parsed.schema_version !== 1) throw new Error("unsupported local corpus schema_version");
  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error("local corpus contract entries must be a nonempty array");
  }
  const entries = parsed.entries.map(parseEntry);
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) throw new Error("local corpus contract paths must be unique");
  if (paths.join("\0") !== [...paths].sort().join("\0")) {
    throw new Error("local corpus contract entries must be sorted by path");
  }
  return { contract_id: "mta-wiki-local-corpus-v1", schema_version: 1, entries };
}

export function loadLocalCorpusContract(rootDir = repoRoot): LocalCorpusContract {
  const path = join(rootDir, LOCAL_CORPUS_CONTRACT_PATH);
  return parseLocalCorpusContract(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export function inspectLocalCorpusContract(rootDir = repoRoot): LocalCorpusInspection {
  const contract = loadLocalCorpusContract(rootDir);
  const present: LocalCorpusContractEntry[] = [];
  const missing: LocalCorpusContractEntry[] = [];
  const mismatched: LocalCorpusInspection["mismatched"] = [];
  const resolvedRoot = resolve(rootDir);
  for (const entry of contract.entries) {
    const path = resolve(rootDir, entry.path);
    const fromRoot = relative(resolvedRoot, path);
    if (!fromRoot || fromRoot === ".." || fromRoot.startsWith("../") || isAbsolute(fromRoot)) {
      throw new Error(`local corpus path escapes root: ${entry.path}`);
    }
    if (!existsSync(path)) {
      missing.push(entry);
      continue;
    }
    const actualBytes = statSync(path).size;
    const actualSha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (actualBytes !== entry.bytes || actualSha256 !== entry.sha256) {
      mismatched.push({ entry, actual_sha256: actualSha256, actual_bytes: actualBytes });
    } else {
      present.push(entry);
    }
  }
  return { contract, present, missing, mismatched };
}

export function requireLocalCorpusContract(rootDir = repoRoot): LocalCorpusInspection {
  const inspection = inspectLocalCorpusContract(rootDir);
  if (inspection.missing.length === 0 && inspection.mismatched.length === 0) return inspection;
  const lines = ["Local corpus contract preflight failed:"];
  for (const entry of inspection.missing) lines.push(`missing ${entry.path} (${entry.bytes} bytes, ${entry.sha256})`);
  for (const mismatch of inspection.mismatched) {
    lines.push(
      `mismatched ${mismatch.entry.path} (expected ${mismatch.entry.bytes}/${mismatch.entry.sha256}, ` +
        `found ${mismatch.actual_bytes}/${mismatch.actual_sha256})`,
    );
  }
  throw new Error(lines.join("\n"));
}
