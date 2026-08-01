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
  parseReleaseManifest,
  type ReleaseExportResult,
  type ReleaseManifest,
  type ReleaseManifestFile,
} from "./export-release.js";
import { FILE_BY_KIND } from "./canonical-read.js";
import { writeResolvedTransitPack } from "./resolved-transit-pack.js";
import { buildReleaseResourceDescriptors } from "./release-resource-descriptors.js";
import {
  buildReleaseReceipt,
  collectReleaseBuildInputs,
  productionReleaseInputPathspecs,
  type ResolvedPackExportProfile,
} from "./release-build-receipt.js";
import { collectProductionGateEvidence } from "./release-production-eligibility.js";
import { verifyReleaseDirectory } from "./release-verifier.js";

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const gitBlobSha1 = (bytes: Buffer) => createHash("sha1")
  .update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const metadata = (path: string): ReleaseManifestFile => {
  const bytes = readFileSync(path);
  return { bytes: bytes.length, sha256: sha256(bytes) };
};

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

function assertInputsAtCommit(root: string, commit: string, inputs: readonly { path: string }[]): void {
  const rows = git(root, ["ls-tree", "-r", "--full-tree", commit, "--", ...productionReleaseInputPathspecs]);
  const tree = new Map(rows.split("\n").filter(Boolean).map((line) => {
    const match = /^\d+ blob ([a-f0-9]{40})\t(.+)$/u.exec(line);
    if (!match) throw new Error(`unexpected generator tree row: ${line}`);
    return [match[2]!, match[1]!] as const;
  }));
  if (JSON.stringify([...tree.keys()].sort()) !== JSON.stringify(inputs.map((entry) => entry.path).sort())) {
    throw new Error("semantic input inventory does not equal the generator commit tree");
  }
  for (const input of inputs) {
    if (gitBlobSha1(readFileSync(join(root, input.path))) !== tree.get(input.path)) {
      throw new Error(`semantic input is not the generator commit blob: ${input.path}`);
    }
  }
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
  profile: ResolvedPackExportProfile;
  asOfDate: string;
  publishCheck: boolean;
};

export function exportResolvedTransitRelease(
  releaseId: string,
  options: ResolvedTransitReleaseExportOptions,
): ReleaseExportResult & {
  buildId: string;
  verificationCandidateEligible: boolean;
  productionContentEligible: boolean;
  productionEligible: boolean;
  productionIneligibilityReasons: string[];
} {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(releaseId)) throw new Error("release id must be a safe path segment");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(options.asOfDate) ||
      Number.isNaN(Date.parse(`${options.asOfDate}T00:00:00Z`))) {
    throw new Error("--as-of must be a real ISO calendar date");
  }
  assertSafeRoot(options.outputRoot);
  const target = join(resolve(options.outputRoot), releaseId);
  if (existsSync(target)) throw new Error(`release target already exists: ${target}`);
  const trackedDirty = git(options.rootDir, ["status", "--porcelain"]).length > 0;
  if (options.publishCheck && trackedDirty) throw new Error("--publish-check requires a clean worktree");
  const generatorCommit = git(options.rootDir, ["rev-parse", "HEAD"]);
  const scratch = mkdtempSync(join(tmpdir(), "mta-resolved-release-"));
  const packRoot = join(scratch, "pack");
  const independentPackRoot = join(scratch, "pack-independent-recut");
  const stage = join(scratch, "stage");
  try {
    mkdirSync(stage, { recursive: true });
    const recordCounts: Record<string, number> = {};
    for (const [kind, filename] of [...FILE_BY_KIND].sort(([a], [b]) => a.localeCompare(b))) {
      const source = join(options.rootDir, "data", "canonical", filename);
      cpSync(source, join(stage, filename));
      const text = readFileSync(source, "utf8").trim();
      recordCounts[kind] = text ? text.split(/\r?\n/u).length : 0;
    }
    writeResolvedTransitPack(packRoot, options.asOfDate, options.rootDir);
    writeResolvedTransitPack(independentPackRoot, options.asOfDate, options.rootDir);
    const firstPackFiles = filesBelow(packRoot);
    const secondPackFiles = filesBelow(independentPackRoot);
    if (JSON.stringify(firstPackFiles) !== JSON.stringify(secondPackFiles)) {
      throw new Error("independent resolved-pack recut path set differs");
    }
    for (const path of firstPackFiles) {
      if (!readFileSync(join(packRoot, path)).equals(readFileSync(join(independentPackRoot, path)))) {
        throw new Error(`independent resolved-pack recut bytes differ: ${path}`);
      }
    }
    cpSync(packRoot, join(stage, "resolved-pack"), { recursive: true });

    const files: Record<string, ReleaseManifestFile> = {};
    for (const path of filesBelow(stage)) files[path] = metadata(join(stage, path));
    const trackedInputs = git(options.rootDir, ["ls-files", ...productionReleaseInputPathspecs])
      .split("\n").filter(Boolean);
    const codeConfigPaths = trackedInputs.filter((path) =>
      path.startsWith("packages/") || path === "package.json" || path === "bun.lock" || path === "harness.config.json");
    const inputs = collectReleaseBuildInputs(options.rootDir, trackedInputs);
    assertInputsAtCommit(options.rootDir, generatorCommit, inputs);
    const productionGateEvidence = collectProductionGateEvidence(options.rootDir, options.asOfDate, {
      strictPublicContractComplete: true,
      independentRecutVerified: false,
    });
    const receipt = buildReleaseReceipt({
      generatorCommit,
      trackedDirty,
      profile: options.profile,
      asOfDate: options.asOfDate,
      publishCheck: options.publishCheck,
      semanticInputs: inputs,
      codeConfigPaths,
      outputResources: files,
      productionGateEvidence,
    });
    const receiptPath = join(stage, "build_receipt.json");
    writeFileSync(receiptPath, `${stableJson(receipt as unknown as JsonValue)}\n`);
    files["build_receipt.json"] = metadata(receiptPath);
    const descriptors = buildReleaseResourceDescriptors(files);
    const manifest: ReleaseManifest = {
      manifest_version: 7,
      release_id: releaseId,
      generator_commit: generatorCommit,
      contract_versions: {},
      record_counts: Object.fromEntries(Object.entries(recordCounts).sort(([a], [b]) => a.localeCompare(b))),
      files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
      pointers: {
        operational_anchors: null,
        operational_anchor_summary: null,
        operational_anchor_review_decisions: null,
        operational_occurrences: null,
        operational_occurrence_summary: null,
        operational_occurrence_review_decisions: null,
        route_anchors: null,
        taxonomy: null,
        quality_report: null,
        relationship_integrity_bundle: null,
        operational_occurrence_member_extents: null,
        quality_provenance: null,
        route_identity_snapshot: null,
        bus_lane_identity_verdicts: null,
        operational_occurrence_member_grain: null,
        study_readiness_v2: null,
        frontier_exceptions: null,
      },
      resource_descriptors: descriptors,
      build_receipt: "build_receipt.json",
      export_profile: options.profile,
      as_of_date: options.asOfDate,
    };
    parseReleaseManifest(manifest);
    const manifestBytes = `${stableJson(manifest as unknown as JsonValue)}\n`;
    writeFileSync(join(stage, "manifest.json"), manifestBytes);
    verifyReleaseDirectory(stage, releaseId, { sourceRootDir: options.rootDir });
    if (git(options.rootDir, ["rev-parse", "HEAD"]) !== generatorCommit ||
        git(options.rootDir, ["status", "--porcelain"]).length > 0) {
      throw new Error("generator commit or clean worktree changed during release construction");
    }
    assertInputsAtCommit(options.rootDir, generatorCommit, inputs);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(stage, target);
    return {
      dir: target,
      releaseId,
      recordCount: Object.values(recordCounts).reduce((sum, count) => sum + count, 0),
      files: Object.keys(files).length,
      manifestPath: join(target, "manifest.json"),
      manifestSha256: sha256(manifestBytes),
      buildId: receipt.build_id,
      verificationCandidateEligible: receipt.verification_candidate_eligible,
      productionContentEligible: receipt.production_content_eligible,
      productionEligible: receipt.production_eligible,
      productionIneligibilityReasons: receipt.production_ineligibility_reasons,
    };
  } finally {
    if (existsSync(scratch)) rmSync(scratch, { recursive: true, force: true });
  }
}
