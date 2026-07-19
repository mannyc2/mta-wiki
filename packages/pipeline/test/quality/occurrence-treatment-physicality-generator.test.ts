import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { repoRoot } from "@mta-wiki/core/paths";
import { stableHash } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

type FilePin = {
  path: string;
  bytes: number;
  sha256: string;
  row_count?: number | undefined;
};

type ReleaseManifest = {
  release_id: string;
  files: Record<string, { bytes: number; sha256: string }>;
};

type ReviewDecision = {
  treatment_record_id: string;
};

type RetirementSource = {
  anchor_review_decisions: Array<{ original_artifact: { artifact_path: string } }>;
  occurrence_review_decisions: Array<{ original_artifact: { artifact_path: string } }>;
};

const RELEASE_ID = "v1-rc24";
const GENERATOR_PATH = join(
  repoRoot,
  "scripts",
  "generate-occurrence-treatment-physicality-v1.ts",
);
const CONTRACT_RELATIVE_DIR = "data/contracts/occurrence-treatment-physicality/v1";
const QUALITY_RELATIVE_DIR =
  "data/quality/relationship-integrity/occurrence-treatment-physicality";
const COMPLETENESS_RELATIVE_DIR = "data/quality/relationship-integrity/completeness";
const RELEASE_INPUTS = [
  "corridors.jsonl",
  "operational_occurrences.jsonl",
  "relations.jsonl",
  "treatment_components.jsonl",
] as const;

let sandboxRoot = "";
let sandboxGeneratorPath = "";
let candidateReleaseDir = "";
let logicalReleaseDir = "";
let completenessDir = "";
let priorReviewHistory = "";

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function copyRepoFile(relativePath: string, destinationRelativePath = relativePath): void {
  const destination = join(sandboxRoot, destinationRelativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(repoRoot, relativePath), destination);
}

function selectedPlan035ReleaseDir(): string {
  const named = join(repoRoot, "data", "exports", "releases", RELEASE_ID);
  if (existsSync(named)) return named;
  const releaseRoot = join(repoRoot, "data", "exports", "releases");
  const candidates = readdirSync(releaseRoot)
    .filter((name) => name.startsWith(`.${RELEASE_ID}-completeness-input.`))
    .sort();
  if (candidates.length !== 1) {
    throw new Error(
      `Expected one named or hidden ${RELEASE_ID} Plan 035 release fixture, found ${candidates.length}`,
    );
  }
  return join(releaseRoot, candidates[0]!);
}

function parsedJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function parsedJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8").split(/\r?\n/u).flatMap((line) =>
    line.trim() ? [JSON.parse(line) as T] : []);
}

function reconstructedReviewHistory(activePath: string, retiredPath: string): string {
  const rows = [activePath, retiredPath].flatMap((path) =>
    readFileSync(path, "utf8").split(/\r?\n/u).filter((line) => line.trim()));
  rows.sort((left, right) => {
    const leftId = (JSON.parse(left) as ReviewDecision).treatment_record_id;
    const rightId = (JSON.parse(right) as ReviewDecision).treatment_record_id;
    return leftId.localeCompare(rightId);
  });
  return rows.length > 0 ? `${rows.join("\n")}\n` : "";
}

function runGenerator(options: {
  check?: boolean | undefined;
  logicalDir?: string | undefined;
} = {}) {
  return spawnSync(process.execPath, [
    sandboxGeneratorPath,
    ...(options.check ? ["--check"] : []),
    "--stage",
    "final_post_semantic_release",
    "--release-dir",
    candidateReleaseDir,
    "--logical-release-dir",
    options.logicalDir ?? logicalReleaseDir,
    "--completeness-dir",
    completenessDir,
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

beforeAll(() => {
  sandboxRoot = mkdtempSync(join(tmpdir(), "mta-physicality-generator-"));
  sandboxGeneratorPath = join(
    sandboxRoot,
    "scripts",
    "generate-occurrence-treatment-physicality-v1.ts",
  );
  candidateReleaseDir = join(
    sandboxRoot,
    "data",
    "exports",
    "releases",
    `.${RELEASE_ID}-test-candidate`,
  );
  logicalReleaseDir = join(sandboxRoot, "data", "exports", "releases", RELEASE_ID);
  completenessDir = join(sandboxRoot, COMPLETENESS_RELATIVE_DIR);

  const sourceReleaseDir = selectedPlan035ReleaseDir();
  const sourceManifest = parsedJson<ReleaseManifest>(join(sourceReleaseDir, "manifest.json"));
  if (sourceManifest.release_id !== RELEASE_ID) {
    throw new Error(`Unexpected fixture release ${sourceManifest.release_id}`);
  }
  mkdirSync(candidateReleaseDir, { recursive: true });
  copyFileSync(join(sourceReleaseDir, "manifest.json"), join(candidateReleaseDir, "manifest.json"));
  for (const fileName of RELEASE_INPUTS) {
    copyFileSync(join(sourceReleaseDir, fileName), join(candidateReleaseDir, fileName));
  }
  for (const fileName of Object.keys(sourceManifest.files)
    .filter((name) => name.startsWith("review-retirements/source/"))
    .sort()) {
    const destination = join(candidateReleaseDir, fileName);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(sourceReleaseDir, fileName), destination);
  }

  copyRepoFile(`${COMPLETENESS_RELATIVE_DIR}/manifest.json`);
  copyRepoFile(`${COMPLETENESS_RELATIVE_DIR}/occurrence-completeness.jsonl`);
  copyRepoFile(`${CONTRACT_RELATIVE_DIR}/review-ledger.jsonl`);
  copyRepoFile(`${CONTRACT_RELATIVE_DIR}/retired-review-ledger.jsonl`);
  copyRepoFile("data/route-identity/accepted/v1/decisions.jsonl");

  const retirementDir = "data/route-identity/operational-projection-retirements/v1";
  for (const name of readdirSync(join(repoRoot, retirementDir)).sort()) {
    if (!name.endsWith(".json")) continue;
    const relativePath = `${retirementDir}/${name}`;
    copyRepoFile(relativePath);
    const retirement = parsedJson<RetirementSource>(join(repoRoot, relativePath));
    for (const target of [
      ...retirement.anchor_review_decisions,
      ...retirement.occurrence_review_decisions,
    ]) {
      copyRepoFile(target.original_artifact.artifact_path);
    }
  }

  const activePath = join(sandboxRoot, CONTRACT_RELATIVE_DIR, "review-ledger.jsonl");
  const retiredPath = join(
    sandboxRoot,
    CONTRACT_RELATIVE_DIR,
    "retired-review-ledger.jsonl",
  );
  priorReviewHistory = reconstructedReviewHistory(activePath, retiredPath);

  const source = readFileSync(GENERATOR_PATH, "utf8")
    .replace(
      'import { repoRoot } from "../packages/core/src/paths";',
      `const repoRoot = ${JSON.stringify(sandboxRoot)};`,
    )
    .replaceAll('from "../packages/', `from "${repoRoot}/packages/`);
  mkdirSync(dirname(sandboxGeneratorPath), { recursive: true });
  writeFileSync(sandboxGeneratorPath, source, "utf8");

  const result = runGenerator();
  if (result.status !== 0) {
    throw new Error(`Sandboxed generator failed:\n${result.stdout}\n${result.stderr}`);
  }
});

afterAll(() => {
  if (sandboxRoot) rmSync(sandboxRoot, { recursive: true, force: true });
});

describe("occurrence treatment physicality generator retirement boundary", () => {
  it("reads candidate bytes while retaining only named logical release pins", () => {
    const result = runGenerator({ check: true });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("final_guard=true");

    const contract = parsedJson<{
      review_snapshot: { release_dir: string; input_pins: FilePin[] };
    }>(join(sandboxRoot, CONTRACT_RELATIVE_DIR, "contract.json"));
    expect(contract.review_snapshot.release_dir).toBe(`data/exports/releases/${RELEASE_ID}`);
    expect(contract.review_snapshot.input_pins.map((entry) => entry.path).sort()).toEqual(
      RELEASE_INPUTS.map((name) => `data/exports/releases/${RELEASE_ID}/${name}`).sort(),
    );

    const qualityManifest = parsedJson<{ input_pins: FilePin[] }>(
      join(sandboxRoot, QUALITY_RELATIVE_DIR, "manifest.json"),
    );
    const releasePins = qualityManifest.input_pins
      .map((entry) => entry.path)
      .filter((path) => path.startsWith(`data/exports/releases/${RELEASE_ID}/`));
    expect(releasePins.some((path) => path.includes("test-candidate"))).toBe(false);
    expect(releasePins).not.toContain(`data/exports/releases/${RELEASE_ID}/manifest.json`);
  });

  it("reconstructs the exact prior review history from active plus retired rows", () => {
    const activePath = join(sandboxRoot, CONTRACT_RELATIVE_DIR, "review-ledger.jsonl");
    const retiredPath = join(
      sandboxRoot,
      CONTRACT_RELATIVE_DIR,
      "retired-review-ledger.jsonl",
    );
    const reconstructed = reconstructedReviewHistory(activePath, retiredPath);
    expect(reconstructed).toBe(priorReviewHistory);

    const receipt = parsedJson<{
      classification_change_count: number;
      review_history: {
        reconstruction: string;
        bytes: number;
        sha256: string;
        row_count: number;
        logical_sha256: string;
      };
    }>(join(sandboxRoot, CONTRACT_RELATIVE_DIR, "review-retirement-receipt.json"));
    const rows = parsedJsonl<JsonValue>(activePath).concat(parsedJsonl<JsonValue>(retiredPath))
      .sort((left, right) => {
        const leftId = (left as { treatment_record_id: string }).treatment_record_id;
        const rightId = (right as { treatment_record_id: string }).treatment_record_id;
        return leftId.localeCompare(rightId);
      });
    expect(receipt.classification_change_count).toBe(0);
    expect(receipt.review_history).toEqual({
      reconstruction: "active_plus_retired_sorted_by_treatment_record_id",
      bytes: Buffer.byteLength(reconstructed),
      sha256: sha256(reconstructed),
      row_count: rows.length,
      logical_sha256: stableHash(rows),
    });
  });

  it("rejects a tampered generated retirement receipt in check mode", () => {
    const path = join(
      sandboxRoot,
      CONTRACT_RELATIVE_DIR,
      "review-retirement-receipt.json",
    );
    const original = readFileSync(path, "utf8");
    try {
      writeFileSync(path, `${original} `, "utf8");
      const result = runGenerator({ check: true });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`Generated artifact is stale: ${path}`);
    } finally {
      writeFileSync(path, original, "utf8");
    }
  });

  it("rejects a tampered retired-review archive in check mode", () => {
    const path = join(
      sandboxRoot,
      CONTRACT_RELATIVE_DIR,
      "retired-review-ledger.jsonl",
    );
    const original = readFileSync(path, "utf8");
    try {
      writeFileSync(path, `${original} `, "utf8");
      const result = runGenerator({ check: true });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`Generated artifact is stale: ${path}`);
    } finally {
      writeFileSync(path, original, "utf8");
    }
  });

  it("rejects a tampered accepted retirement even when the candidate manifest is repinned", () => {
    const relativePath = "review-retirements/source/q6-q06-current-ineligible-2026-07-18.json";
    const sourcePath = join(candidateReleaseDir, relativePath);
    const manifestPath = join(candidateReleaseDir, "manifest.json");
    const originalSource = readFileSync(sourcePath, "utf8");
    const originalManifest = readFileSync(manifestPath, "utf8");
    try {
      const tamperedSource = `${originalSource} `;
      writeFileSync(sourcePath, tamperedSource, "utf8");
      const manifest = JSON.parse(originalManifest) as ReleaseManifest;
      manifest.files[relativePath] = {
        bytes: Buffer.byteLength(tamperedSource),
        sha256: sha256(tamperedSource),
      };
      writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");

      const result = runGenerator({ check: true });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        `${relativePath}: candidate retirement source does not match the authenticated accepted retirement`,
      );
    } finally {
      writeFileSync(sourcePath, originalSource, "utf8");
      writeFileSync(manifestPath, originalManifest, "utf8");
    }
  });

  it("constrains the logical path to the manifest-declared named release", () => {
    const invalidLogicalDir = join(
      sandboxRoot,
      "data",
      "exports",
      "releases",
      `${RELEASE_ID}-shadow`,
    );
    const result = runGenerator({ check: true, logicalDir: invalidLogicalDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `Logical release directory must be data/exports/releases/${RELEASE_ID}, ` +
        `found data/exports/releases/${RELEASE_ID}-shadow`,
    );
  });
});
