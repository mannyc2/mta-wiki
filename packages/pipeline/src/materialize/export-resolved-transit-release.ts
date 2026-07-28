import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  exportRelease,
  parseReleaseManifest,
  type ReleaseExportResult,
  type ReleaseManifest,
  type ReleaseManifestFile,
} from "./export-release.js";
import { writeResolvedTransitPack } from "./resolved-transit-pack.js";
import { buildReleaseResourceDescriptors } from "./release-resource-descriptors.js";
import { buildReleaseReceipt, collectReleaseBuildInputs } from "./release-build-receipt.js";
import { verifyReleaseDirectory } from "./release-verifier.js";

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const metadata = (path: string): ReleaseManifestFile => {
  const bytes = readFileSync(path);
  return { bytes: bytes.length, sha256: sha256(bytes) };
};

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

function filesBelow(root: string, prefix = ""): string[] {
  const dir = join(root, prefix);
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? filesBelow(root, path) : entry.isFile() ? [path] : [];
  }).sort();
}

function assertSafeRoot(root: string): void {
  const resolved = resolve(root);
  if (resolved === "/" || resolved === resolve(process.cwd()) || resolved.split(sep).length < 3) {
    throw new Error(`unsafe release output root: ${root}`);
  }
}

export type ResolvedTransitReleaseExportOptions = {
  rootDir: string;
  outputRoot: string;
  asOfDate: string;
  publishCheck: boolean;
};

export function exportResolvedTransitRelease(
  releaseId: string,
  options: ResolvedTransitReleaseExportOptions,
): ReleaseExportResult & { buildId: string; publicationEligible: boolean } {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(releaseId)) throw new Error("release id must be a safe path segment");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(options.asOfDate) ||
      Number.isNaN(Date.parse(`${options.asOfDate}T00:00:00Z`))) {
    throw new Error("--as-of must be a real ISO calendar date");
  }
  assertSafeRoot(options.outputRoot);
  const target = join(resolve(options.outputRoot), releaseId);
  if (existsSync(target)) throw new Error(`release target already exists: ${target}`);
  const trackedDirty = git(options.rootDir, ["status", "--porcelain", "--untracked-files=no"]).length > 0;
  if (options.publishCheck && trackedDirty) throw new Error("--publish-check requires a clean tracked worktree");
  const generatorCommit = git(options.rootDir, ["rev-parse", "HEAD"]);
  const scratch = mkdtempSync(join(tmpdir(), "mta-resolved-release-"));
  const legacyRoot = join(scratch, "legacy");
  const packRoot = join(scratch, "pack");
  const stage = join(scratch, "stage");
  try {
    const legacy = exportRelease(releaseId, {
      rootDir: options.rootDir,
      outputRoot: legacyRoot,
    });
    cpSync(legacy.dir, stage, { recursive: true });
    rmSync(join(stage, "manifest.json"));
    writeResolvedTransitPack(packRoot, options.asOfDate, options.rootDir);
    cpSync(packRoot, join(stage, "resolved-pack"), { recursive: true });

    const files: Record<string, ReleaseManifestFile> = {};
    for (const path of filesBelow(stage)) files[path] = metadata(join(stage, path));
    const legacyManifest = parseReleaseManifest(JSON.parse(readFileSync(legacy.manifestPath, "utf8")));
    const trackedInputs = git(options.rootDir, [
      "ls-files",
      "data/canonical",
      "data/resolved-transit",
      "data/resolved-transit-public",
      "data/contracts",
      "packages/pipeline/src/materialize",
      "packages/pipeline/src/consumer",
      "package.json",
      "bun.lock",
      "harness.config.json",
    ]).split("\n").filter(Boolean);
    const codeConfigPaths = trackedInputs.filter((path) =>
      path.startsWith("packages/") || path === "package.json" || path === "bun.lock" || path === "harness.config.json");
    const inputs = collectReleaseBuildInputs(options.rootDir, trackedInputs);
    const receipt = buildReleaseReceipt({
      generatorCommit,
      trackedDirty,
      asOfDate: options.asOfDate,
      publishCheck: options.publishCheck,
      semanticInputs: inputs,
      codeConfigPaths,
      outputResources: files,
    });
    const receiptPath = join(stage, "build_receipt.json");
    writeFileSync(receiptPath, `${stableJson(receipt as unknown as JsonValue)}\n`);
    files["build_receipt.json"] = metadata(receiptPath);
    const descriptors = buildReleaseResourceDescriptors(files);
    const manifest: ReleaseManifest = {
      ...legacyManifest,
      manifest_version: 7,
      generator_commit: generatorCommit,
      files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
      resource_descriptors: descriptors,
      build_receipt: "build_receipt.json",
      export_profile: "resolved-pack-v1",
      as_of_date: options.asOfDate,
    };
    parseReleaseManifest(manifest);
    const manifestBytes = `${stableJson(manifest as unknown as JsonValue)}\n`;
    writeFileSync(join(stage, "manifest.json"), manifestBytes);
    verifyReleaseDirectory(stage, releaseId, { sourceRootDir: options.rootDir });
    mkdirSync(dirname(target), { recursive: true });
    renameSync(stage, target);
    return {
      dir: target,
      releaseId,
      recordCount: Object.values(legacyManifest.record_counts).reduce((sum, count) => sum + count, 0),
      files: Object.keys(files).length,
      manifestPath: join(target, "manifest.json"),
      manifestSha256: sha256(manifestBytes),
      buildId: receipt.build_id,
      publicationEligible: receipt.publication_eligible,
    };
  } finally {
    if (existsSync(scratch)) rmSync(scratch, { recursive: true, force: true });
  }
}
