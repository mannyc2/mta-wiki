import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { ReleaseManifestFile } from "./export-release.js";
import {
  productionIneligibilityReasons,
  type ProductionGateEvidence,
  type ProductionIneligibilityReason,
} from "./release-production-eligibility.js";

export type ResolvedPackExportProfile =
  | "resolved-pack-v1-verification"
  | "resolved-pack-v1-production";

export const productionReleaseInputPathspecs = [
  "data/canonical",
  "data/resolved-transit",
  "data/resolved-transit-public",
  "data/reference/gtfs",
  "data/quality/operational-episode-frontier/v1",
  "data/operational-occurrence-identities",
  "data/operational-episode-resolution",
  "data/operational-application-semantics",
  "data/intervention-placements",
  "data/intervention-lifecycle",
  "data/contracts",
  "data/exports/releases/v1-rc28/manifest.json",
  "packages",
  "package.json",
  "bun.lock",
  "harness.config.json",
] as const;

export type ReleaseBuildInput = {
  path: string;
  bytes: number;
  sha256: string;
  tracked: boolean;
};

export type LegacyReleaseBuildReceipt = {
  schema_version: 1;
  contract_id: "resolved-transit-release-build-receipt-v1";
  generator_commit: string;
  tracked_dirty: boolean;
  runtime: { bun: string; node: string };
  export_options: { profile: "resolved-pack-v1"; as_of_date: string; publish_check: boolean };
  semantic_inputs: ReleaseBuildInput[];
  semantic_input_digest: string;
  code_config_paths: string[];
  code_config_input_digest: string;
  output_resources: Record<string, ReleaseManifestFile>;
  build_id: string;
  publication_eligible: boolean;
  publication_ineligibility_reasons: string[];
};

export type ProductionReleaseBuildReceipt = {
  schema_version: 2;
  contract_id: "resolved-transit-release-build-receipt-v2";
  generator_commit: string;
  tracked_dirty: boolean;
  runtime: { bun: string; node: string };
  export_options: { profile: ResolvedPackExportProfile; as_of_date: string; publish_check: boolean };
  semantic_inputs: ReleaseBuildInput[];
  semantic_input_digest: string;
  code_config_paths: string[];
  code_config_input_digest: string;
  output_resources: Record<string, ReleaseManifestFile>;
  production_gate_evidence: ProductionGateEvidence;
  verification_candidate_eligible: boolean;
  verification_candidate_ineligibility_reasons: string[];
  production_content_eligible: boolean;
  production_eligible: boolean;
  production_ineligibility_reasons: ProductionIneligibilityReason[];
  publication_eligible: boolean;
  publication_ineligibility_reasons: ProductionIneligibilityReason[];
  build_id: string;
};

export type ReleaseBuildReceipt = LegacyReleaseBuildReceipt | ProductionReleaseBuildReceipt;

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const requiredProductionReceiptPaths = [
  "data/operational-episode-resolution/campaigns/plan-052/frozen-frontier/summary.json",
  "data/operational-episode-resolution/campaigns/plan-052/portfolio.json",
  "data/operational-episode-resolution/campaigns/plan-052/integration-receipts/final-public-key-migration-v1.json",
  "data/quality/operational-episode-frontier/v1/summary.json",
  "data/contracts/relationships/v1/enforcement-source-refresh-receipts/2eab6a56d169953542988a7a4e7efc3d56608aa27324d8808693a8f7afe13a90.json",
  "data/operational-application-semantics/campaigns/plan-053/accepted/completion-receipt.json",
  "data/operational-application-semantics/campaigns/plan-053/accepted/integration-receipt.json",
  "data/intervention-placements/campaigns/plan-054/accepted/completion-receipt.json",
  "data/intervention-lifecycle/campaigns/plan-055/accepted/completion-receipt.json",
  "data/resolved-transit/operator/v1/tracker-conformance/accepted-ledger-receipt.json",
] as const;

export function semanticInputsCoverProductionReceipts(inputs: readonly ReleaseBuildInput[]): boolean {
  const tracked = new Set(inputs.filter((entry) => entry.tracked).map((entry) => entry.path));
  return requiredProductionReceiptPaths.every((path) => tracked.has(path));
}

const compareReceiptPath = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

export function collectReleaseBuildInputs(root: string, paths: readonly string[]): ReleaseBuildInput[] {
  return [...new Set(paths)].sort(compareReceiptPath).map((path) => {
    const absolute = resolve(root, path);
    const stat = statSync(absolute);
    if (!stat.isFile()) throw new Error(`semantic input is not a regular file: ${path}`);
    const bytes = readFileSync(absolute);
    return { path: relative(root, absolute).split("\\").join("/"), bytes: bytes.length, sha256: sha256(bytes), tracked: true };
  });
}

function digests(inputs: ReleaseBuildInput[], codeConfigPaths: string[]): {
  semanticInputDigest: string;
  codeConfigInputDigest: string;
} {
  const semanticInputDigest = sha256(inputs.map((entry) =>
    `${entry.path}\0${entry.bytes}\0${entry.sha256}\0${entry.tracked}`).join("\n"));
  const codeConfigInputDigest = sha256([...codeConfigPaths].sort(compareReceiptPath).map((path) => {
    const entry = inputs.find((candidate) => candidate.path === path);
    if (!entry) throw new Error(`code/config input is not receipted: ${path}`);
    return `${path}\0${entry.bytes}\0${entry.sha256}`;
  }).join("\n"));
  return { semanticInputDigest, codeConfigInputDigest };
}

export function buildReleaseReceipt(input: {
  generatorCommit: string;
  trackedDirty: boolean;
  profile: ResolvedPackExportProfile;
  asOfDate: string;
  publishCheck: boolean;
  semanticInputs: ReleaseBuildInput[];
  codeConfigPaths: string[];
  outputResources: Record<string, ReleaseManifestFile>;
  productionGateEvidence: ProductionGateEvidence;
}): ProductionReleaseBuildReceipt {
  const semanticInputs = [...input.semanticInputs].sort((a, b) => compareReceiptPath(a.path, b.path));
  const verificationReasons: string[] = [];
  if (input.trackedDirty) verificationReasons.push("tracked_worktree_dirty");
  if (semanticInputs.some((entry) => !entry.tracked)) verificationReasons.push("untracked_semantic_input");
  const productionReasons = productionIneligibilityReasons({
    profile: input.profile,
    publishCheck: input.publishCheck,
    trackedDirty: input.trackedDirty,
    semanticInputsReceipted: semanticInputsCoverProductionReceipts(semanticInputs),
    evidence: input.productionGateEvidence,
  });
  const { semanticInputDigest, codeConfigInputDigest } = digests(semanticInputs, input.codeConfigPaths);
  const productionEligible = productionReasons.length === 0;
  const productionContentEligible = productionReasons
    .filter((reason) => reason !== "independent_recut_not_verified").length === 0;
  const core = {
    schema_version: 2 as const,
    contract_id: "resolved-transit-release-build-receipt-v2" as const,
    generator_commit: input.generatorCommit,
    tracked_dirty: input.trackedDirty,
    runtime: { bun: process.versions.bun ?? "unknown", node: process.version },
    export_options: { profile: input.profile, as_of_date: input.asOfDate, publish_check: input.publishCheck },
    semantic_inputs: semanticInputs,
    semantic_input_digest: semanticInputDigest,
    code_config_paths: [...input.codeConfigPaths].sort(compareReceiptPath),
    code_config_input_digest: codeConfigInputDigest,
    output_resources: Object.fromEntries(Object.entries(input.outputResources).sort(([a], [b]) => a.localeCompare(b))),
    production_gate_evidence: input.productionGateEvidence,
    verification_candidate_eligible: verificationReasons.length === 0,
    verification_candidate_ineligibility_reasons: verificationReasons,
    production_content_eligible: productionContentEligible,
    production_eligible: productionEligible,
    production_ineligibility_reasons: productionReasons,
    publication_eligible: productionEligible,
    publication_ineligibility_reasons: productionReasons,
  };
  return { ...core, build_id: sha256(stableJson(core as unknown as JsonValue)) };
}

function assertReceiptDigests(receipt: ReleaseBuildReceipt): void {
  const { semanticInputDigest, codeConfigInputDigest } = digests(receipt.semantic_inputs, receipt.code_config_paths);
  const { build_id: _, ...core } = receipt;
  if (sha256(stableJson(core as unknown as JsonValue)) !== receipt.build_id ||
      semanticInputDigest !== receipt.semantic_input_digest ||
      codeConfigInputDigest !== receipt.code_config_input_digest) {
    throw new Error("build receipt: digest mismatch");
  }
}

export function parseReleaseBuildReceipt(value: unknown): ReleaseBuildReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("build receipt: expected object");
  const receipt = value as ReleaseBuildReceipt;
  if (!/^[a-f0-9]{40}$/u.test(receipt.generator_commit)) throw new Error("build receipt: invalid generator commit");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(receipt.export_options?.as_of_date ?? "")) throw new Error("build receipt: invalid as-of date");
  if (receipt.schema_version === 1 && receipt.contract_id === "resolved-transit-release-build-receipt-v1") {
    assertReceiptDigests(receipt);
    if (receipt.publication_eligible && (receipt.tracked_dirty || receipt.publication_ineligibility_reasons.length)) {
      throw new Error("build receipt: false publication eligibility");
    }
    return receipt;
  }
  if (receipt.schema_version !== 2 || receipt.contract_id !== "resolved-transit-release-build-receipt-v2") {
    throw new Error("build receipt: unsupported contract");
  }
  const topKeys = [
    "build_id", "code_config_input_digest", "code_config_paths", "contract_id", "export_options",
    "generator_commit", "output_resources", "production_content_eligible", "production_eligible",
    "production_gate_evidence", "production_ineligibility_reasons", "publication_eligible",
    "publication_ineligibility_reasons", "runtime", "schema_version", "semantic_input_digest",
    "semantic_inputs", "tracked_dirty", "verification_candidate_eligible",
    "verification_candidate_ineligibility_reasons",
  ].sort();
  if (JSON.stringify(Object.keys(receipt).sort()) !== JSON.stringify(topKeys)) {
    throw new Error("build receipt: unexpected or missing top-level field");
  }
  if (JSON.stringify(Object.keys(receipt.export_options).sort()) !==
      JSON.stringify(["as_of_date", "profile", "publish_check"]) ||
      typeof receipt.export_options.publish_check !== "boolean" ||
      JSON.stringify(Object.keys(receipt.runtime).sort()) !== JSON.stringify(["bun", "node"]) ||
      typeof receipt.runtime.bun !== "string" || typeof receipt.runtime.node !== "string" ||
      typeof receipt.tracked_dirty !== "boolean" ||
      typeof receipt.verification_candidate_eligible !== "boolean" ||
      typeof receipt.production_content_eligible !== "boolean" ||
      typeof receipt.production_eligible !== "boolean" || typeof receipt.publication_eligible !== "boolean" ||
      !/^[a-f0-9]{64}$/u.test(receipt.build_id) ||
      !/^[a-f0-9]{64}$/u.test(receipt.semantic_input_digest) ||
      !/^[a-f0-9]{64}$/u.test(receipt.code_config_input_digest)) {
    throw new Error("build receipt: invalid exact scalar field");
  }
  if (!["resolved-pack-v1-verification", "resolved-pack-v1-production"].includes(receipt.export_options.profile)) {
    throw new Error("build receipt: invalid export profile");
  }
  if (Number.isNaN(Date.parse(`${receipt.export_options.as_of_date}T00:00:00Z`)) ||
      new Date(`${receipt.export_options.as_of_date}T00:00:00Z`).toISOString().slice(0, 10) !== receipt.export_options.as_of_date) {
    throw new Error("build receipt: invalid calendar as-of date");
  }
  if (!Array.isArray(receipt.semantic_inputs) || !Array.isArray(receipt.code_config_paths) ||
      !Array.isArray(receipt.verification_candidate_ineligibility_reasons) ||
      !Array.isArray(receipt.production_ineligibility_reasons) ||
      !Array.isArray(receipt.publication_ineligibility_reasons)) {
    throw new Error("build receipt: invalid array field");
  }
  for (const [index, input] of receipt.semantic_inputs.entries()) {
    if (!input || typeof input !== "object" ||
        JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(["bytes", "path", "sha256", "tracked"]) ||
        typeof input.path !== "string" || !input.path || input.path.startsWith("/") || input.path.includes("..") ||
        !Number.isInteger(input.bytes) || input.bytes < 0 || !/^[a-f0-9]{64}$/u.test(input.sha256) ||
        typeof input.tracked !== "boolean") {
      throw new Error(`build receipt: invalid semantic input ${index}`);
    }
  }
  const semanticPaths = receipt.semantic_inputs.map((entry) => entry.path);
  if (new Set(semanticPaths).size !== receipt.semantic_inputs.length ||
      JSON.stringify([...semanticPaths].sort(compareReceiptPath)) !== JSON.stringify(semanticPaths) ||
      receipt.code_config_paths.some((path) => typeof path !== "string") ||
      new Set(receipt.code_config_paths).size !== receipt.code_config_paths.length ||
      JSON.stringify([...receipt.code_config_paths].sort(compareReceiptPath)) !== JSON.stringify(receipt.code_config_paths)) {
    throw new Error("build receipt: duplicate or unsorted input path");
  }
  if (!receipt.output_resources || typeof receipt.output_resources !== "object" || Array.isArray(receipt.output_resources)) {
    throw new Error("build receipt: invalid output resources");
  }
  for (const [path, metadata] of Object.entries(receipt.output_resources)) {
    if (!path || path.startsWith("/") || path.includes("..") || !metadata ||
        JSON.stringify(Object.keys(metadata).sort()) !== JSON.stringify(["bytes", "sha256"]) ||
        !Number.isInteger(metadata.bytes) || metadata.bytes < 0 || !/^[a-f0-9]{64}$/u.test(metadata.sha256)) {
      throw new Error(`build receipt: invalid output resource ${path}`);
    }
  }
  const evidenceKeys = [
    "episode_frontier_complete",
    "application_semantics_complete",
    "placement_frontier_complete",
    "lifecycle_coverage_complete",
    "strict_public_contract_complete",
    "public_display_complete",
    "tracker_conformance_complete",
    "independent_recut_verified",
  ].sort();
  if (!receipt.production_gate_evidence ||
      JSON.stringify(Object.keys(receipt.production_gate_evidence).sort()) !== JSON.stringify(evidenceKeys) ||
      Object.values(receipt.production_gate_evidence).some((entry) => typeof entry !== "boolean")) {
    throw new Error("build receipt: production gate evidence must be exact booleans");
  }
  assertReceiptDigests(receipt);
  const verificationReasons: string[] = [];
  if (receipt.tracked_dirty) verificationReasons.push("tracked_worktree_dirty");
  if (receipt.semantic_inputs.some((entry) => !entry.tracked)) verificationReasons.push("untracked_semantic_input");
  const productionReasons = productionIneligibilityReasons({
    profile: receipt.export_options.profile,
    publishCheck: receipt.export_options.publish_check,
    trackedDirty: receipt.tracked_dirty,
    semanticInputsReceipted: semanticInputsCoverProductionReceipts(receipt.semantic_inputs),
    evidence: receipt.production_gate_evidence,
  });
  const productionContentEligible = productionReasons
    .filter((reason) => reason !== "independent_recut_not_verified").length === 0;
  if (receipt.verification_candidate_eligible !== (verificationReasons.length === 0) ||
      JSON.stringify(receipt.verification_candidate_ineligibility_reasons) !== JSON.stringify(verificationReasons) ||
      receipt.production_content_eligible !== productionContentEligible ||
      receipt.production_eligible !== (productionReasons.length === 0) ||
      receipt.publication_eligible !== receipt.production_eligible ||
      JSON.stringify(receipt.production_ineligibility_reasons) !== JSON.stringify(productionReasons) ||
      JSON.stringify(receipt.publication_ineligibility_reasons) !== JSON.stringify(productionReasons)) {
    throw new Error("build receipt: false eligibility claim");
  }
  return receipt;
}
