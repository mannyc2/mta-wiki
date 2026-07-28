import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import type { JsonValue } from "../packages/db/src/types.js";
import { parseReleaseBuildReceipt } from "../packages/pipeline/src/materialize/release-build-receipt.js";
import { verifyReleaseDirectory } from "../packages/pipeline/src/materialize/release-verifier.js";

const OUTPUT = join(repoRoot, "data/quality/releases/resolved-pack-v1-verification-handoff.json");
const RELEASE_ID = "resolved-pack-v1-verification-candidate";
const LEGACY_MANIFEST_SHA = "b47a105dc78501210f2d32e6f597f878203b8cfc35654cebc4de445d575a453c";

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing ${name}`);
  return value;
}
function git(args: string[]): string {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout.trim();
}
function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function releaseDir(root: string): string { return join(root, RELEASE_ID); }

const generatorCommit = option("--generator-commit");
const documentationCommit = option("--documentation-commit");
const rootA = option("--release-root-a");
const rootB = option("--release-root-b");
const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : null;
if (!mode || process.argv.filter((arg) => arg === "--write" || arg === "--check").length !== 1) {
  throw new Error("choose exactly one of --write or --check");
}
if (!/^[a-f0-9]{40}$/u.test(generatorCommit) || !/^[a-f0-9]{40}$/u.test(documentationCommit)) {
  throw new Error("commits must be full SHA-1 ids");
}
if (git(["rev-parse", `${documentationCommit}^`]) !== generatorCommit) {
  throw new Error("documentation commit must be the immediate descendant of generator commit");
}
const changed = git(["diff", "--name-only", generatorCommit, documentationCommit]).split("\n").filter(Boolean);
const invalid = changed.filter((path) => !(path.startsWith("docs/") || path === "AGENTS.md" || path === "LOG.md"));
if (invalid.length) throw new Error(`documentation diff contains semantic paths: ${invalid.join(", ")}`);

const verifiedA = verifyReleaseDirectory(releaseDir(rootA), RELEASE_ID, { sourceRootDir: repoRoot });
const verifiedB = verifyReleaseDirectory(releaseDir(rootB), RELEASE_ID, { sourceRootDir: repoRoot });
if (verifiedA.manifest_sha256 !== verifiedB.manifest_sha256) throw new Error("candidate manifests differ");
const receiptA = parseReleaseBuildReceipt(JSON.parse(verifiedA.readAddressed("build_receipt.json").toString("utf8")));
const receiptB = parseReleaseBuildReceipt(JSON.parse(verifiedB.readAddressed("build_receipt.json").toString("utf8")));
if (receiptA.build_id !== receiptB.build_id || receiptA.generator_commit !== generatorCommit ||
    receiptB.generator_commit !== generatorCommit) {
  throw new Error("candidate build receipts do not bind the named generator commit");
}
const legacy = verifyReleaseDirectory(join(repoRoot, "data/exports/releases/v1-rc28"), "v1-rc28", { sourceRootDir: repoRoot });
if (legacy.manifest_sha256 !== LEGACY_MANIFEST_SHA) throw new Error("v1-rc28 changed");
const summary = JSON.parse(
  verifiedA.readAddressed("resolved-pack/public/public_network_summary.json").toString("utf8"),
) as Record<string, unknown>;
const candidateBytesA = readFileSync(join(releaseDir(rootA), "manifest.json"));
const candidateBytesB = readFileSync(join(releaseDir(rootB), "manifest.json"));
if (!candidateBytesA.equals(candidateBytesB)) throw new Error("candidate manifest bytes differ");

const handoff = {
  schema_version: 1,
  contract_id: "resolved-pack-v1-verification-handoff-v1",
  generator_commit: generatorCommit,
  documentation_commit: documentationCommit,
  documentation_diff: { paths: changed.sort(), semantic_input_change: false },
  candidate: {
    release_id: RELEASE_ID,
    manifest_version: verifiedA.manifest_version,
    manifest_sha256: verifiedA.manifest_sha256,
    build_id: receiptA.build_id,
    semantic_input_digest: receiptA.semantic_input_digest,
    as_of_date: receiptA.export_options.as_of_date,
    addressed_file_count: verifiedA.verified_file_count,
    canonical_record_count: verifiedA.verified_record_count,
    public_summary: summary,
    verification: "verified",
    publication_eligible: receiptA.publication_eligible,
  },
  reproducibility: {
    independent_root_manifest_bytes_equal: true,
    independent_root_build_id_equal: true,
    verification_summary_equal: sha256(stableJson({
      a: verifiedA.manifest_sha256,
      b: verifiedB.manifest_sha256,
    } as unknown as JsonValue)),
  },
  legacy_release: {
    release_id: "v1-rc28",
    manifest_sha256: legacy.manifest_sha256,
    verification: "verified",
  },
  repository_state: {
    release_directories_changed: false,
    latest_changed: false,
    latest_value: readFileSync(join(repoRoot, "data/exports/releases/LATEST"), "utf8").trim(),
    external_publication: "not_performed",
    downstream_pin: "not_performed",
  },
  authority: {
    profile: "producer_contract_verification_only",
    authorizes_transport_or_promotion: false,
    canonical_layer: "documentary",
    resolved_public_completeness: "partial",
  },
};
const bytes = `${stableJson(handoff as unknown as JsonValue)}\n`;
if (mode === "write") {
  writeFileSync(OUTPUT, bytes);
  console.log(`Wrote ${OUTPUT}`);
} else {
  if (!existsSync(OUTPUT) || readFileSync(OUTPUT, "utf8") !== bytes) throw new Error("handoff receipt is stale");
  console.log(`Verified ${OUTPUT}`);
}
