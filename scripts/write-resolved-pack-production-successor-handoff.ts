import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import type { JsonValue } from "../packages/db/src/types.js";
import { verificationSummary, verifyReleaseDirectory } from "../packages/pipeline/src/materialize/release-verifier.js";
import { parseReleaseBuildReceipt } from "../packages/pipeline/src/materialize/release-build-receipt.js";

const RELEASE_ID = "resolved-pack-v1-production";
const AS_OF_DATE = "2026-07-27";
const ROOT_A = "/tmp/resolved-pack-production-final-a";
const ROOT_B = "/tmp/resolved-pack-production-final-b";
const LEGACY_ROOT = "/tmp/resolved-pack-release-a";
const OUTPUT = join(repoRoot, "data/quality/releases/resolved-pack-v1-production-final-handoff.json");
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

type PartitionRow = { path: string; bytes: number; sha256: string };
function partition(root: string, prefix = ""): PartitionRow[] {
  return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return partition(root, path);
    if (!entry.isFile()) throw new Error(`release tree contains a non-file: ${path}`);
    const bytes = readFileSync(join(root, path));
    return [{ path, bytes: bytes.length, sha256: sha256(bytes) }];
  }).sort((a, b) => a.path.localeCompare(b.path));
}

for (const root of [ROOT_A, ROOT_B, LEGACY_ROOT]) {
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`required candidate root is missing: ${root}`);
}
const dirA = join(ROOT_A, RELEASE_ID);
const dirB = join(ROOT_B, RELEASE_ID);
const verifiedA = verifyReleaseDirectory(dirA, RELEASE_ID, { sourceRootDir: repoRoot });
const verifiedB = verifyReleaseDirectory(dirB, RELEASE_ID, { sourceRootDir: repoRoot });
const legacy = verifyReleaseDirectory(
  join(LEGACY_ROOT, "resolved-pack-v1-verification-candidate"),
  "resolved-pack-v1-verification-candidate",
  { sourceRootDir: repoRoot },
);
const rc28 = verifyReleaseDirectory(join(repoRoot, "data/exports/releases/v1-rc28"), "v1-rc28", {
  sourceRootDir: repoRoot,
});
const treeA = partition(dirA);
const treeB = partition(dirB);
if (stableJson(treeA as unknown as JsonValue) !== stableJson(treeB as unknown as JsonValue)) {
  throw new Error("production recut trees differ");
}
const receipt = parseReleaseBuildReceipt(JSON.parse(readFileSync(join(dirA, "build_receipt.json"), "utf8")) as unknown);
if (receipt.schema_version !== 2 || !receipt.production_content_eligible || receipt.production_eligible ||
    JSON.stringify(receipt.production_ineligibility_reasons) !== JSON.stringify(["independent_recut_not_verified"]) ||
    receipt.export_options.profile !== "resolved-pack-v1-production" ||
    receipt.export_options.as_of_date !== AS_OF_DATE) {
  throw new Error("production build receipt is not exact content-eligible pre-handoff state");
}
if (verifiedA.manifest_sha256 !== verifiedB.manifest_sha256 || verifiedA.build_id !== verifiedB.build_id ||
    verifiedA.as_of_date !== AS_OF_DATE || verifiedB.as_of_date !== AS_OF_DATE) {
  throw new Error("production recut verification identities differ");
}
const exactLegacyReasons = [
  "production_profile_required",
  "episode_frontier_incomplete",
  "application_semantics_incomplete",
  "placement_frontier_incomplete",
  "lifecycle_coverage_incomplete",
  "strict_public_contract_incomplete",
  "public_display_incomplete",
  "tracker_conformance_incomplete",
  "semantic_input_receipts_incomplete",
];
if (legacy.verification_candidate_eligible !== true || legacy.production_eligible !== false ||
    JSON.stringify(legacy.production_ineligibility_reasons) !== JSON.stringify(exactLegacyReasons)) {
  throw new Error("legacy partial candidate did not retain exact verification-only classification");
}
const latest = readFileSync(join(repoRoot, "data/exports/releases/LATEST"), "utf8").trim();
if (latest !== "resolved-pack-v1-production-candidate" ||
    !existsSync(join(repoRoot, "data/exports/releases", latest)) ||
    existsSync(join(repoRoot, "data/exports/releases", RELEASE_ID))) {
  throw new Error("repository release state changed before the publication gate");
}

const core = {
  schema_version: 1,
  contract_id: "resolved-pack-v1-production-successor-handoff-v1",
  release_id: RELEASE_ID,
  supersedes_release_id: latest,
  supersession_reason_code: "latest_pointer_regression_test_repaired",
  as_of_date: AS_OF_DATE,
  generator_commit: receipt.generator_commit,
  build_id: receipt.build_id,
  manifest_sha256: verifiedA.manifest_sha256,
  verification: verificationSummary(verifiedA),
  production_content_eligible: true,
  production_eligible: true,
  production_ineligibility_reasons: [],
  full_tree_partition: treeA,
  full_tree_partition_sha256: sha256(stableJson(treeA as unknown as JsonValue)),
  independent_recut: {
    root_count: 2,
    exact_file_count: treeA.length,
    exact_byte_equality: true,
    manifest_bytes_equal: true,
    build_id_equal: true,
  },
  legacy_partial_candidate: verificationSummary(legacy),
  legacy_v1_rc28: verificationSummary(rc28),
  completion_receipts: {
    plan_052: "data/contracts/relationships/v1/enforcement-source-refresh-receipts/2eab6a56d169953542988a7a4e7efc3d56608aa27324d8808693a8f7afe13a90.json",
    plan_053: "plan-053-completion:ad0a80ce5eb239140639d62a1f391831674a404c021e6605208f438363974a03",
    plan_054: "plan-054-completion:5ceaccde359a9980eded2c5eca86cecd660af2137f855ebe35725d8b909323ec",
    plan_055: "plan-055-completion:347736366cc08cb774290c4b96df5c2c8ae63a38ff176a7873177d6c4a051de1",
    plan_056: "plan-056-tracker-diff-acceptance:23fb25861fa011cf5637f53064e5ea13af248eb2f0a1004313b7d1826529b554",
  },
  owner_decisions: [
    "production_as_of_and_release_id",
    "semantic_acceptance",
    "external_publication_tag_release",
    "latest_promotion",
    "tracker_pin_and_accepted_diff_ledger",
    "deployment",
  ].map((gate) => ({ gate, decision: "approved", approved_by: "project-owner", approved_at: "2026-08-01", authority: "owner all-approvals instruction" })),
  repository_state_before_publication: {
    latest_value: latest,
    release_directory_present: false,
    prior_external_publication_performed: true,
    prior_tag_created: true,
    tracker_pin_performed: false,
    deployment_performed: false,
  },
  provider_usage: { provider_requests: 0, actual_cost_usd: 0 },
};
const output = {
  ...core,
  handoff_id: `resolved-pack-v1-production-successor-handoff:${sha256(stableJson(core as unknown as JsonValue))}`,
};
writeFileSync(OUTPUT, `${stableJson(output as unknown as JsonValue)}\n`);
console.log(`Wrote ${relative(repoRoot, OUTPUT)} (${treeA.length} files; ${verifiedA.manifest_sha256})`);
