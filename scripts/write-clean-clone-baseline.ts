import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import { inspectLocalCorpusContract } from "../packages/pipeline/test/support/corpus-contract";

const OUTPUT_PATH =
  "data/quality/baselines/clean-clone-v1-rc28.json";

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pin(path: string): {
  path: string;
  sha256: string;
  bytes: number;
} {
  const bytes = readFileSync(join(repoRoot, path));
  return { path, sha256: sha256(bytes), bytes: bytes.length };
}

function optionValue(args: readonly string[], name: string): string {
  const indexes = args.flatMap((arg, index) => arg === name ? [index] : []);
  if (indexes.length !== 1) throw new Error(`${name} must appear exactly once`);
  const value = args[indexes[0]! + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function run(
  command: string,
  args: readonly string[],
): { status: number; output: string } {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { status: result.status ?? 1, output };
}

function git(args: readonly string[]): string {
  const result = run("git", args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.output}`);
  }
  return result.output.trim();
}

function count(output: string, label: string): number {
  const matches = [...output.matchAll(
    new RegExp(`(?:^|\\n)\\s*(\\d+)\\s+${label}\\b`, "gu"),
  )];
  return matches.length > 0
    ? Number(matches[matches.length - 1]![1])
    : 0;
}

function buildReceipt(implementationCommit: string): JsonValue {
  if (!/^[a-f0-9]{40}$/u.test(implementationCommit)) {
    throw new Error("--implementation-commit must be a full 40-character commit");
  }
  if (git(["cat-file", "-t", implementationCommit]) !== "commit") {
    throw new Error("Implementation commit does not exist");
  }
  const implementationTreeDigest = sha256(
    git([
      "ls-tree",
      "-r",
      "--full-tree",
      implementationCommit,
    ]),
  );
  const receiptAtImplementation = run("git", [
    "cat-file",
    "-e",
    `${implementationCommit}:${OUTPUT_PATH}`,
  ]);
  if (receiptAtImplementation.status === 0) {
    throw new Error(
      "Implementation commit already contains the baseline receipt; refusing self-reference",
    );
  }
  const tests = run("bun", ["run", "test"]);
  if (tests.status !== 0) {
    throw new Error(
      `Cannot record a red clean-clone baseline:\n${tests.output}`,
    );
  }
  const determinism = run("bun", [
    "scripts/determinism-anchor.ts",
  ]);
  if (determinism.status !== 0) {
    throw new Error(
      `Cannot record a failed determinism gate:\n${determinism.output}`,
    );
  }
  const release = run("bun", [
    "packages/cli/src/cli.ts",
    "verify-release",
    "v1-rc28",
  ]);
  if (release.status !== 0) {
    throw new Error(
      `Cannot record a failed v1-rc28 verification:\n${release.output}`,
    );
  }
  const corpus = inspectLocalCorpusContract(repoRoot);
  if (corpus.mismatched.length > 0) {
    throw new Error(
      "Present local corpus has mismatched bytes; baseline cannot call it absent",
    );
  }
  const corpusStatus = corpus.missing.length > 0
    ? "not_run_missing_local_corpus"
    : "verified";
  const contract = JSON.parse(
    readFileSync(
      join(
        repoRoot,
        "data/contracts/relationships/v1/contract.json",
      ),
      "utf8",
    ),
  ) as {
    enforcement_proof: {
      source_refresh_receipt: { path: string; sha256: string };
    };
  };
  const bunVersion = run("bun", ["--version"]);
  if (bunVersion.status !== 0) throw new Error("Unable to read Bun version");
  const determinismJson = (() => {
    const start = determinism.output.indexOf("{");
    const end = determinism.output.lastIndexOf("}");
    if (start < 0 || end < start) return { output_sha256: sha256(determinism.output) };
    try {
      return JSON.parse(
        determinism.output.slice(start, end + 1),
      ) as JsonValue;
    } catch {
      return { output_sha256: sha256(determinism.output) };
    }
  })();
  return {
    schema_version: 1,
    baseline_id: "clean-clone-v1-rc28",
    release_id: "v1-rc28",
    implementation_commit: implementationCommit,
    implementation_tree_digest: implementationTreeDigest,
    bun_version: bunVersion.output.trim(),
    default_suite: {
      command: "bun run test",
      status: "passed",
      counts: {
        pass: count(tests.output, "pass"),
        skip: count(tests.output, "skip"),
        fail: count(tests.output, "fail"),
        error: count(tests.output, "error"),
      },
    },
    local_profiles: {
      corpus_audit_status: corpusStatus,
      authoring_replay_status: corpusStatus,
      missing_artifact_count: corpus.missing.length,
    },
    contracts: {
      local_dependency_inventory: pin(
        "data/test-contracts/test-local-dependency-inventory-v1.json",
      ),
      producer_input_closure: pin(
        "data/test-contracts/producer-input-closure-v1.json",
      ),
    },
    relationship_completeness: {
      manifest: pin(
        "data/quality/relationship-integrity/completeness/manifest.json",
      ),
      summary: pin(
        "data/quality/relationship-integrity/completeness/summary.json",
      ),
      report: pin(
        "data/quality/relationship-integrity/completeness/report.md",
      ),
      source_refresh_receipt:
        contract.enforcement_proof.source_refresh_receipt,
    },
    relationship_enforcement: {
      proof: pin(
        "data/contracts/relationships/v1/enforcement-proof.json",
      ),
      release_bundle: pin(
        "data/contracts/relationships/v1/release-bundle-sources.json",
      ),
    },
    canonical_determinism: determinismJson,
    verified_release: {
      manifest: pin(
        "data/exports/releases/v1-rc28/manifest.json",
      ),
      addressed_file_count: 383,
      canonical_record_count: 85396,
      verification_output_sha256: sha256(release.output),
    },
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const implementationCommit = optionValue(
    args,
    "--implementation-commit",
  );
  const write = args.includes("--write");
  const check = args.includes("--check");
  if (Number(write) + Number(check) !== 1) {
    throw new Error("Choose exactly one of --write and --check");
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--implementation-commit") {
      index += 1;
      continue;
    }
    if (arg !== "--write" && arg !== "--check") {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  const content = `${stableJson(
    buildReceipt(implementationCommit),
  )}\n`;
  const output = join(repoRoot, OUTPUT_PATH);
  if (write) {
    if (existsSync(output)) {
      throw new Error(`Baseline receipt already exists: ${OUTPUT_PATH}`);
    }
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, content, "utf8");
  } else {
    if (!existsSync(output) || readFileSync(output, "utf8") !== content) {
      throw new Error("Clean-clone baseline receipt is stale");
    }
  }
  console.log(
    `${write ? "Wrote" : "Verified"} ${OUTPUT_PATH} for ${implementationCommit}`,
  );
}
