import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { ReleaseManifestFile } from "./export-release.js";

export type ReleaseBuildInput = {
  path: string;
  bytes: number;
  sha256: string;
  tracked: boolean;
};

export type ReleaseBuildReceipt = {
  schema_version: 1;
  contract_id: "resolved-transit-release-build-receipt-v1";
  generator_commit: string;
  tracked_dirty: boolean;
  runtime: { bun: string; node: string };
  export_options: {
    profile: "resolved-pack-v1";
    as_of_date: string;
    publish_check: boolean;
  };
  semantic_inputs: ReleaseBuildInput[];
  semantic_input_digest: string;
  code_config_paths: string[];
  code_config_input_digest: string;
  output_resources: Record<string, ReleaseManifestFile>;
  build_id: string;
  publication_eligible: boolean;
  publication_ineligibility_reasons: string[];
};

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

export function collectReleaseBuildInputs(root: string, paths: readonly string[]): ReleaseBuildInput[] {
  return [...new Set(paths)].sort().map((path) => {
    const absolute = resolve(root, path);
    const stat = statSync(absolute);
    if (!stat.isFile()) throw new Error(`semantic input is not a regular file: ${path}`);
    const bytes = readFileSync(absolute);
    return { path: relative(root, absolute).split("\\").join("/"), bytes: bytes.length, sha256: sha256(bytes), tracked: true };
  });
}

export function buildReleaseReceipt(input: {
  generatorCommit: string;
  trackedDirty: boolean;
  asOfDate: string;
  publishCheck: boolean;
  semanticInputs: ReleaseBuildInput[];
  codeConfigPaths: string[];
  outputResources: Record<string, ReleaseManifestFile>;
}): ReleaseBuildReceipt {
  const reasons: string[] = [];
  if (input.trackedDirty) reasons.push("tracked_worktree_dirty");
  if (input.semanticInputs.some((entry) => !entry.tracked)) reasons.push("untracked_semantic_input");
  const semanticInputDigest = sha256(input.semanticInputs.map((entry) =>
    `${entry.path}\0${entry.bytes}\0${entry.sha256}\0${entry.tracked}`).join("\n"));
  const codeConfigInputDigest = sha256(input.codeConfigPaths.sort().map((path) => {
    const entry = input.semanticInputs.find((candidate) => candidate.path === path);
    if (!entry) throw new Error(`code/config input is not receipted: ${path}`);
    return `${path}\0${entry.bytes}\0${entry.sha256}`;
  }).join("\n"));
  const core = {
    schema_version: 1 as const,
    contract_id: "resolved-transit-release-build-receipt-v1" as const,
    generator_commit: input.generatorCommit,
    tracked_dirty: input.trackedDirty,
    runtime: { bun: process.versions.bun ?? "unknown", node: process.version },
    export_options: {
      profile: "resolved-pack-v1" as const,
      as_of_date: input.asOfDate,
      publish_check: input.publishCheck,
    },
    semantic_inputs: input.semanticInputs,
    semantic_input_digest: semanticInputDigest,
    code_config_paths: [...input.codeConfigPaths].sort(),
    code_config_input_digest: codeConfigInputDigest,
    output_resources: Object.fromEntries(Object.entries(input.outputResources).sort(([a], [b]) => a.localeCompare(b))),
    publication_eligible: input.publishCheck && reasons.length === 0,
    publication_ineligibility_reasons: reasons,
  };
  return { ...core, build_id: sha256(stableJson(core as unknown as JsonValue)) };
}

export function parseReleaseBuildReceipt(value: unknown): ReleaseBuildReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("build receipt: expected object");
  const receipt = value as ReleaseBuildReceipt;
  if (receipt.schema_version !== 1 || receipt.contract_id !== "resolved-transit-release-build-receipt-v1") {
    throw new Error("build receipt: unsupported contract");
  }
  if (!/^[a-f0-9]{40}$/u.test(receipt.generator_commit)) throw new Error("build receipt: invalid generator commit");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(receipt.export_options?.as_of_date ?? "")) throw new Error("build receipt: invalid as-of date");
  const semanticDigest = sha256(receipt.semantic_inputs.map((entry) =>
    `${entry.path}\0${entry.bytes}\0${entry.sha256}\0${entry.tracked}`).join("\n"));
  const codeDigest = sha256(receipt.code_config_paths.map((path) => {
    const entry = receipt.semantic_inputs.find((candidate) => candidate.path === path);
    if (!entry) throw new Error(`build receipt: code/config input is not receipted: ${path}`);
    return `${path}\0${entry.bytes}\0${entry.sha256}`;
  }).join("\n"));
  const { build_id: _, ...core } = receipt;
  if (sha256(stableJson(core as unknown as JsonValue)) !== receipt.build_id ||
      semanticDigest !== receipt.semantic_input_digest ||
      codeDigest !== receipt.code_config_input_digest) {
    throw new Error("build receipt: digest mismatch");
  }
  if (receipt.publication_eligible && (receipt.tracked_dirty || receipt.publication_ineligibility_reasons.length)) {
    throw new Error("build receipt: false publication eligibility");
  }
  return receipt;
}
