import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  assertRelationshipEnforcementProof,
  assertRelationshipEnforcementTransitionReceipt,
  assertRelationshipContractPolicyV1,
  RELATIONSHIP_ENFORCEMENT_GATE_IDS,
  RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS,
  type RelationshipContract,
  type RelationshipEndpointMatrixPointer,
  type RelationshipEnforcementProof,
  type RelationshipEnforcementTransitionReceipt,
  type RelationshipFinalEndpointMatrix,
} from "@mta-wiki/db/relationship-contract";

export const RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION = 1 as const;
export const RELATIONSHIP_RELEASE_BUNDLE_ID = "relationship-integrity-v1" as const;

export type RelationshipReleaseBundleArtifact = {
  role: string;
  source_path: string;
  bytes: number;
  sha256: string;
};

export type RelationshipReleaseBundleDescriptor = {
  schema_version: typeof RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION;
  bundle_id: typeof RELATIONSHIP_RELEASE_BUNDLE_ID;
  contract_id: "relationship-contract-v1";
  validation_mode: "warn" | "enforce";
  artifacts: RelationshipReleaseBundleArtifact[];
};

export type RelationshipReleaseBundleManifest = {
  schema_version: typeof RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION;
  bundle_id: typeof RELATIONSHIP_RELEASE_BUNDLE_ID;
  contract_id: "relationship-contract-v1";
  validation_mode: "warn" | "enforce";
  descriptor: {
    source_path: string;
    bytes: number;
    sha256: string;
  };
  artifact_count: number;
  artifacts: Array<RelationshipReleaseBundleArtifact & {
    release_path: string;
  }>;
};

export type StagedRelationshipReleaseBundle = {
  manifest: RelationshipReleaseBundleManifest;
  manifest_path: string;
  files: Array<{
    path: string;
    bytes: number;
    sha256: string;
  }>;
};

const REQUIRED_ROLES = [
  "relationship_contract",
  "relationship_enforcement_gate_schema",
  "endpoint_type_matrix",
  "semantic_remediation_summary",
  "semantic_remediation_ledger",
  "payload_reference_contract",
  "payload_reference_review_ledger",
  "payload_reference_summary",
  "occurrence_treatment_physicality_contract",
  "occurrence_treatment_physicality_review_ledger",
  "occurrence_treatment_physicality_summary",
  "operational_occurrence_phase_contract",
  "operational_occurrence_phase_review_ledger",
  "relationship_completeness_summary",
  "relationship_completeness_manifest",
  "graph_audit_findings",
  "graph_audit_summary",
  "graph_audit_manifest",
  "bus_lane_acquisition_summary",
] as const;

const GRAPH_AUDIT_RELEASE_ROLES = [
  "graph_audit_findings",
  "graph_audit_manifest",
  "graph_audit_summary",
] as const;

const GRAPH_AUDIT_SOURCE_PATH_BY_ROLE = new Map(
  RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS
    .referential_type_evidence_integrity
    .filter((source) =>
      (GRAPH_AUDIT_RELEASE_ROLES as readonly string[]).includes(
        source.role,
      )
    )
    .map((source) => [source.role, source.path]),
);

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function resolvedRegularRepoFile(
  rootDir: string,
  path: string,
  label: string,
): string {
  if (!existsSync(path)) {
    throw new Error(`Relationship release bundle ${label} is missing: ${path}`);
  }
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(
      `Relationship release bundle ${label} must be a regular non-symlink file: ${path}`,
    );
  }
  const realRoot = realpathSync(rootDir);
  const rootPrefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
  const realPath = realpathSync(path);
  if (!realPath.startsWith(rootPrefix)) {
    throw new Error(
      `Relationship release bundle ${label} resolves outside the repository root: ${path}`,
    );
  }
  return realPath;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid relationship release bundle ${path}: expected object`);
  }
  return value as Record<string, unknown>;
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) {
    throw new Error(`Invalid relationship release bundle ${path}: unexpected ${extras.sort().join(", ")}`);
  }
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(`Invalid relationship release bundle ${path}: expected trimmed non-empty string`);
  }
  return value;
}

function safeRepoRelativePath(value: unknown, path: string): string {
  const candidate = nonEmptyString(value, path);
  if (
    isAbsolute(candidate) ||
    /^[a-zA-Z]:/u.test(candidate) ||
    candidate.includes("\\") ||
    candidate.includes("\0")
  ) {
    throw new Error(`Invalid relationship release bundle ${path}: expected safe repository-relative path`);
  }
  const segments = candidate.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid relationship release bundle ${path}: expected safe repository-relative path`);
  }
  if (
    !candidate.startsWith("data/contracts/") &&
    !candidate.startsWith("data/quality/relationship-integrity/") &&
    !candidate.startsWith("data/relationship-integrity/") &&
    !candidate.startsWith("schemas/")
  ) {
    throw new Error(
      `Invalid relationship release bundle ${path}: path is outside the relationship-integrity artifact roots`,
    );
  }
  return candidate;
}

function digest(value: unknown, path: string): string {
  const candidate = nonEmptyString(value, path);
  if (!/^[a-f0-9]{64}$/u.test(candidate)) {
    throw new Error(`Invalid relationship release bundle ${path}: expected SHA-256 hex`);
  }
  return candidate;
}

function byteCount(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid relationship release bundle ${path}: expected non-negative integer`);
  }
  return value;
}

export function parseRelationshipReleaseBundleDescriptor(value: unknown): RelationshipReleaseBundleDescriptor {
  const root = object(value, "$root");
  assertKeys(root, ["schema_version", "bundle_id", "contract_id", "validation_mode", "artifacts"], "$root");
  if (root.schema_version !== RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION) {
    throw new Error(
      `Invalid relationship release bundle schema_version: expected ${RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION}`,
    );
  }
  if (root.bundle_id !== RELATIONSHIP_RELEASE_BUNDLE_ID) {
    throw new Error(`Invalid relationship release bundle bundle_id: expected ${RELATIONSHIP_RELEASE_BUNDLE_ID}`);
  }
  if (root.contract_id !== "relationship-contract-v1") {
    throw new Error("Invalid relationship release bundle contract_id: expected relationship-contract-v1");
  }
  if (root.validation_mode !== "warn" && root.validation_mode !== "enforce") {
    throw new Error("Invalid relationship release bundle validation_mode: expected warn or enforce");
  }
  if (!Array.isArray(root.artifacts)) {
    throw new Error("Invalid relationship release bundle artifacts: expected array");
  }

  const artifacts = root.artifacts.map((entryValue, index): RelationshipReleaseBundleArtifact => {
    const entry = object(entryValue, `artifacts[${index}]`);
    assertKeys(entry, ["role", "source_path", "bytes", "sha256"], `artifacts[${index}]`);
    return {
      role: nonEmptyString(entry.role, `artifacts[${index}].role`),
      source_path: safeRepoRelativePath(entry.source_path, `artifacts[${index}].source_path`),
      bytes: byteCount(entry.bytes, `artifacts[${index}].bytes`),
      sha256: digest(entry.sha256, `artifacts[${index}].sha256`),
    };
  });

  const sorted = [...artifacts].sort(
    (left, right) => left.role.localeCompare(right.role) || left.source_path.localeCompare(right.source_path),
  );
  if (JSON.stringify(artifacts) !== JSON.stringify(sorted)) {
    throw new Error("Invalid relationship release bundle artifacts: entries must be sorted by role and source_path");
  }
  if (new Set(artifacts.map((entry) => entry.role)).size !== artifacts.length) {
    throw new Error("Invalid relationship release bundle artifacts: duplicate role");
  }
  if (new Set(artifacts.map((entry) => entry.source_path)).size !== artifacts.length) {
    throw new Error("Invalid relationship release bundle artifacts: duplicate source_path");
  }
  const roles = new Set(artifacts.map((entry) => entry.role));
  const missing = REQUIRED_ROLES.filter((role) => !roles.has(role));
  if (missing.length > 0) {
    throw new Error(`Invalid relationship release bundle artifacts: missing required roles ${missing.join(", ")}`);
  }
  if (root.validation_mode === "enforce" && !roles.has("enforcement_proof")) {
    throw new Error("Invalid relationship release bundle artifacts: enforce mode requires enforcement_proof");
  }
  if (
    root.validation_mode === "enforce" &&
    !roles.has("enforcement_transition_receipt")
  ) {
    throw new Error(
      "Invalid relationship release bundle artifacts: enforce mode requires enforcement_transition_receipt",
    );
  }
  for (const role of GRAPH_AUDIT_RELEASE_ROLES) {
    const entry = artifacts.find((artifact) => artifact.role === role);
    const expectedPath = GRAPH_AUDIT_SOURCE_PATH_BY_ROLE.get(role);
    if (!entry || !expectedPath || entry.source_path !== expectedPath) {
      throw new Error(
        `Invalid relationship release bundle artifacts: ${role} must use canonical source path ${String(expectedPath)}`,
      );
    }
  }

  return {
    schema_version: RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION,
    bundle_id: RELATIONSHIP_RELEASE_BUNDLE_ID,
    contract_id: "relationship-contract-v1",
    validation_mode: root.validation_mode,
    artifacts,
  };
}

export function relationshipReleaseBundleDescriptorPath(rootDir: string): string {
  return join(rootDir, "data", "contracts", "relationships", "v1", "release-bundle-sources.json");
}

function assertContractMode(rootDir: string, descriptor: RelationshipReleaseBundleDescriptor): void {
  const contractEntry = descriptor.artifacts.find((entry) => entry.role === "relationship_contract");
  if (!contractEntry) return;
  const contract = object(
    JSON.parse(readFileSync(join(rootDir, contractEntry.source_path), "utf8")) as unknown,
    "relationship_contract",
  );
  assertRelationshipContractPolicyV1(
    contract as unknown as RelationshipContract,
  );
  const expected = descriptor.validation_mode === "enforce" ? "enforced" : "warning_first";
  if (contract.contract_status !== expected) {
    throw new Error(
      `Relationship release bundle validation_mode ${descriptor.validation_mode} does not match contract_status ${String(contract.contract_status)}`,
    );
  }
  if (contract.contract_id !== "relationship-contract-v1") {
    throw new Error("Relationship release bundle contract_id does not match the relationship contract artifact");
  }
  const endpointEntry = descriptor.artifacts.find((entry) => entry.role === "endpoint_type_matrix");
  const endpointPointer = object(contract.endpoint_matrix, "relationship_contract.endpoint_matrix");
  const endpointMatrix = endpointEntry
    ? JSON.parse(readFileSync(join(rootDir, endpointEntry.source_path), "utf8")) as RelationshipFinalEndpointMatrix
    : null;
  if (
    !endpointEntry ||
    endpointPointer.path !== endpointEntry.source_path ||
    endpointPointer.sha256 !== sha256(stableJson(endpointMatrix as unknown as JsonValue))
  ) {
    throw new Error("Relationship release bundle endpoint_type_matrix does not match the contract pointer");
  }
  if (descriptor.validation_mode === "enforce") {
    if (contract.enforcement_state !== "enforced_ready") {
      throw new Error(
        `Relationship release bundle enforce mode requires enforced_ready, found ${String(contract.enforcement_state)}`,
      );
    }
    const proofEntry = descriptor.artifacts.find((entry) => entry.role === "enforcement_proof");
    const proofPointer = object(contract.enforcement_proof, "relationship_contract.enforcement_proof");
    const proof = proofEntry
      ? JSON.parse(readFileSync(join(rootDir, proofEntry.source_path), "utf8")) as RelationshipEnforcementProof
      : null;
    if (
      !proofEntry ||
      proofPointer.path !== proofEntry.source_path ||
      proofPointer.sha256 !== sha256(stableJson(proof as unknown as JsonValue))
    ) {
      throw new Error("Relationship release bundle enforcement_proof does not match the contract pointer");
    }
    if (
      proof?.proof_stage !== "post_promotion_enforced" ||
      proof.validation_mode !== "enforce"
    ) {
      throw new Error(
        "Relationship release bundle enforce mode requires a post_promotion_enforced proof",
      );
    }
    const receiptPointer = object(
      proofPointer.transition_receipt,
      "relationship_contract.enforcement_proof.transition_receipt",
    );
    const receiptEntry = descriptor.artifacts.find(
      (entry) => entry.role === "enforcement_transition_receipt",
    );
    const receipt = receiptEntry
      ? JSON.parse(
          readFileSync(
            join(rootDir, receiptEntry.source_path),
            "utf8",
          ),
        ) as RelationshipEnforcementTransitionReceipt
      : null;
    if (
      !receiptEntry ||
      receiptPointer.path !== receiptEntry.source_path ||
      receiptPointer.sha256 !==
        sha256(stableJson(receipt as unknown as JsonValue)) ||
      proof.transition_receipt?.path !== receiptEntry.source_path ||
      proof.transition_receipt?.sha256 !== receiptPointer.sha256
    ) {
      throw new Error(
        "Relationship release bundle transition receipt does not match the contract and post-promotion proof chain",
      );
    }
    for (const gate of proof!.gates) {
      const gateEntry = descriptor.artifacts.find(
        (entry) => entry.source_path === gate.artifact_path,
      );
      if (
        !gateEntry ||
        gateEntry.role !== `enforcement_gate:${gate.gate_id}` ||
        gateEntry.sha256 !== gate.artifact_sha256
      ) {
        throw new Error(
          `Relationship release bundle must include the content-addressed ${gate.gate_id} enforcement gate artifact`,
        );
      }
    }
    const proofValidation = assertRelationshipEnforcementProof(
      proof!,
      endpointMatrix!,
      endpointPointer as unknown as RelationshipEndpointMatrixPointer,
      RELATIONSHIP_ENFORCEMENT_GATE_IDS,
      (artifactPath) => {
        const safePath = safeRepoRelativePath(artifactPath, `enforcement gate ${artifactPath}`);
        return readFileSync(
          resolvedRegularRepoFile(
            rootDir,
            join(rootDir, safePath),
            `enforcement gate ${artifactPath}`,
          ),
          "utf8",
        );
      },
    );
    assertRelationshipEnforcementTransitionReceipt(
      receipt!,
      endpointMatrix!,
      endpointPointer as unknown as RelationshipEndpointMatrixPointer,
      (artifactPath) => {
        const safePath = safeRepoRelativePath(
          artifactPath,
          `enforcement transition ${artifactPath}`,
        );
        return readFileSync(
          resolvedRegularRepoFile(
            rootDir,
            join(rootDir, safePath),
            `enforcement transition ${artifactPath}`,
          ),
          "utf8",
        );
      },
    );
    const transitionDependencyPaths = [
      receipt!.previous_proof.path,
      ...receipt!.previous_gates.map((gate) => gate.path),
      ...receipt!.pre_promotion_sources.map(
        (source) => source.archive_path,
      ),
    ];
    for (const artifactPath of transitionDependencyPaths) {
      if (
        !artifactPath ||
        !descriptor.artifacts.some(
          (entry) => entry.source_path === artifactPath,
        )
      ) {
        throw new Error(
          `Relationship release bundle omits transition receipt dependency ${String(artifactPath)}`,
        );
      }
    }
    for (const artifactPath of proofValidation.artifact_paths) {
      const entry = descriptor.artifacts.find(
        (candidate) => candidate.source_path === artifactPath,
      );
      if (!entry) {
        throw new Error(
          `Relationship release bundle omits enforcement proof dependency ${artifactPath}`,
        );
      }
    }
  }

}

function assertReleaseRelationSnapshot(
  rootDir: string,
  releaseDir: string,
  descriptor: RelationshipReleaseBundleDescriptor,
): void {
  const endpointEntry = descriptor.artifacts.find(
    (entry) => entry.role === "endpoint_type_matrix",
  );
  if (!endpointEntry) return;
  const matrix = JSON.parse(
    readFileSync(
      resolvedRegularRepoFile(
        rootDir,
        join(rootDir, endpointEntry.source_path),
        "endpoint_type_matrix",
      ),
      "utf8",
    ),
  ) as RelationshipFinalEndpointMatrix;
  const relationsPath = join(releaseDir, "relations.jsonl");
  if (!existsSync(relationsPath)) {
    throw new Error(
      "Relationship release bundle cannot bind an export without relations.jsonl",
    );
  }
  const relationIds = readFileSync(relationsPath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => {
      const value = object(
        JSON.parse(line) as unknown,
        "release relations.jsonl row",
      );
      return nonEmptyString(
        value.record_id,
        "release relations.jsonl row.record_id",
      );
    })
    .sort((left, right) => left.localeCompare(right));
  const relationIdsSha256 = sha256(
    stableJson(relationIds as unknown as JsonValue),
  );
  const releaseRelationsSha256 = sha256(
    readFileSync(relationsPath),
  );
  if (
    relationIds.length !== matrix.covered_relation_count ||
    relationIdsSha256 !== matrix.relation_ids_sha256
  ) {
    throw new Error(
      "Relationship release bundle final matrix does not match the exported relation snapshot",
    );
  }
  const projectedRelationsEntry = descriptor.artifacts.find(
    (entry) =>
      entry.source_path ===
      matrix.generated_from.projected_relations_path,
  );
  if (
    !projectedRelationsEntry ||
    projectedRelationsEntry.sha256 !==
      matrix.generated_from.projected_relations_sha256
  ) {
    throw new Error(
      "Relationship release bundle omits the final matrix projected-relation source",
    );
  }
  const graphManifestEntry = descriptor.artifacts.find(
    (entry) => entry.role === "graph_audit_manifest",
  );
  if (!graphManifestEntry) {
    throw new Error(
      "Relationship release bundle omits the graph audit manifest",
    );
  }
  const graphSummaryEntry = descriptor.artifacts.find(
    (entry) => entry.role === "graph_audit_summary",
  );
  const graphFindingsEntry = descriptor.artifacts.find(
    (entry) => entry.role === "graph_audit_findings",
  );
  if (!graphSummaryEntry || !graphFindingsEntry) {
    throw new Error(
      "Relationship release bundle omits the graph audit summary or findings ledger",
    );
  }
  const graphManifestBytes = readFileSync(
    resolvedRegularRepoFile(
      rootDir,
      join(rootDir, graphManifestEntry.source_path),
      "graph_audit_manifest",
    ),
  );
  const graphSummaryBytes = readFileSync(
    resolvedRegularRepoFile(
      rootDir,
      join(rootDir, graphSummaryEntry.source_path),
      "graph_audit_summary",
    ),
  );
  const graphFindingsBytes = readFileSync(
    resolvedRegularRepoFile(
      rootDir,
      join(rootDir, graphFindingsEntry.source_path),
      "graph_audit_findings",
    ),
  );
  const graphManifest = object(
    JSON.parse(
      graphManifestBytes.toString("utf8"),
    ) as unknown,
    "graph_audit_manifest",
  );
  const graphArtifacts = Array.isArray(graphManifest.artifacts)
    ? graphManifest.artifacts.map((entry, index) =>
        object(entry, `graph_audit_manifest.artifacts[${index}]`)
      )
    : [];
  const graphArtifactPaths = graphArtifacts.map((entry) => entry.path);
  const graphSummaryPin = graphArtifacts.find(
    (entry) => entry.path === "summary.json",
  );
  const graphFindingsPin = graphArtifacts.find(
    (entry) => entry.path === "findings.jsonl",
  );
  const graphFindingsText = graphFindingsBytes.toString("utf8");
  const graphFindingRows = graphFindingsText
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0).length;
  if (
    graphManifest.contract_id !== "relationship-contract-v1" ||
    graphManifest.endpoint_matrix_sha256 !==
      sha256(stableJson(matrix as unknown as JsonValue)) ||
    graphManifest.canonical_relations_sha256 !==
      releaseRelationsSha256 ||
    new Set(graphArtifactPaths).size !== graphArtifactPaths.length ||
    graphSummaryPin?.sha256 !== sha256(graphSummaryBytes) ||
    graphFindingsPin?.sha256 !== sha256(graphFindingsBytes) ||
    graphFindingsPin.rows !== graphFindingRows
  ) {
    throw new Error(
      "Relationship release bundle graph audit manifest does not pin the exact matrix, exported relations.jsonl, summary, and findings ledger",
    );
  }
}

const COMPLETENESS_RELEASE_INPUT_FILES = [
  "corridors.jsonl",
  "events.jsonl",
  "operational_occurrences.jsonl",
  "relations.jsonl",
  "routes.jsonl",
  "treatment_components.jsonl",
] as const;

function assertCompletenessReleaseSnapshot(
  rootDir: string,
  releaseDir: string,
  descriptor: RelationshipReleaseBundleDescriptor,
): void {
  const manifestEntry = descriptor.artifacts.find(
    (entry) => entry.role === "relationship_completeness_manifest",
  );
  if (!manifestEntry) {
    throw new Error(
      "Relationship release bundle omits the completeness manifest",
    );
  }
  const manifest = object(
    JSON.parse(
      readFileSync(
        resolvedRegularRepoFile(
          rootDir,
          join(rootDir, manifestEntry.source_path),
          "relationship_completeness_manifest",
        ),
        "utf8",
      ),
    ) as unknown,
    "relationship_completeness_manifest",
  );
  if (
    manifest.schema_version !== 1 ||
    !Array.isArray(manifest.input_pins)
  ) {
    throw new Error(
      "Relationship release bundle completeness manifest is invalid",
    );
  }
  const releasePins = new Map<
    string,
    { bytes: number; sha256: string }
  >();
  for (const [index, inputValue] of manifest.input_pins.entries()) {
    const input = object(
      inputValue,
      `relationship_completeness_manifest.input_pins[${index}]`,
    );
    const sourcePath = nonEmptyString(
      input.path,
      `relationship_completeness_manifest.input_pins[${index}].path`,
    );
    const match =
      /^data\/exports\/releases\/[^/]+\/([^/]+)$/u.exec(
        sourcePath,
      );
    if (!match || match[1] === "manifest.json") continue;
    const name = match[1]!;
    if (releasePins.has(name)) {
      throw new Error(
        `Relationship completeness manifest has duplicate release input ${name}`,
      );
    }
    releasePins.set(name, {
      bytes: byteCount(
        input.bytes,
        `relationship_completeness_manifest.input_pins[${index}].bytes`,
      ),
      sha256: digest(
        input.sha256,
        `relationship_completeness_manifest.input_pins[${index}].sha256`,
      ),
    });
  }
  for (const name of COMPLETENESS_RELEASE_INPUT_FILES) {
    const pin = releasePins.get(name);
    if (!pin) {
      throw new Error(
        `Relationship completeness manifest does not pin ${name}`,
      );
    }
    const path = join(releaseDir, name);
    if (!existsSync(path)) {
      throw new Error(
        `Relationship completeness snapshot file is missing from the export: ${name}`,
      );
    }
    const bytes = readFileSync(path);
    if (
      bytes.length !== pin.bytes ||
      sha256(bytes) !== pin.sha256
    ) {
      throw new Error(
        `Relationship completeness input ${name} does not match the exported release snapshot`,
      );
    }
  }
}

export function stageRelationshipReleaseBundle(
  rootDir: string,
  releaseDir: string,
  descriptorPath: string,
): StagedRelationshipReleaseBundle {
  if (!existsSync(descriptorPath)) {
    throw new Error(`Relationship release bundle descriptor is missing: ${descriptorPath}`);
  }
  const rootPrefix = resolve(rootDir).endsWith(sep) ? resolve(rootDir) : `${resolve(rootDir)}${sep}`;
  const resolvedDescriptorPath = resolve(descriptorPath);
  if (!resolvedDescriptorPath.startsWith(rootPrefix)) {
    throw new Error("Relationship release bundle descriptor must be inside the repository root");
  }
  const descriptorBytes = readFileSync(
    resolvedRegularRepoFile(
      rootDir,
      descriptorPath,
      "descriptor",
    ),
  );
  const descriptor = parseRelationshipReleaseBundleDescriptor(JSON.parse(descriptorBytes.toString("utf8")) as unknown);
  assertContractMode(rootDir, descriptor);
  assertReleaseRelationSnapshot(rootDir, releaseDir, descriptor);
  assertCompletenessReleaseSnapshot(
    rootDir,
    releaseDir,
    descriptor,
  );

  const stagedArtifacts: RelationshipReleaseBundleManifest["artifacts"] = [];
  const stagedFiles: StagedRelationshipReleaseBundle["files"] = [];
  for (const artifact of descriptor.artifacts) {
    const sourcePath = join(rootDir, artifact.source_path);
    const bytes = readFileSync(
      resolvedRegularRepoFile(
        rootDir,
        sourcePath,
        `artifact ${artifact.source_path}`,
      ),
    );
    const actual = { bytes: bytes.length, sha256: sha256(bytes) };
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) {
      throw new Error(
        `Relationship release bundle artifact changed: ${artifact.source_path}; regenerate the reviewed descriptor`,
      );
    }
    const releasePath = `relationship-integrity/${artifact.source_path}`;
    const outputPath = join(releaseDir, releasePath);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, bytes);
    stagedArtifacts.push({ ...artifact, release_path: releasePath });
    stagedFiles.push({ path: releasePath, ...actual });
  }

  const manifest: RelationshipReleaseBundleManifest = {
    schema_version: RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION,
    bundle_id: RELATIONSHIP_RELEASE_BUNDLE_ID,
    contract_id: descriptor.contract_id,
    validation_mode: descriptor.validation_mode,
    descriptor: {
      source_path: relative(rootDir, descriptorPath).split("\\").join("/"),
      bytes: descriptorBytes.length,
      sha256: sha256(descriptorBytes),
    },
    artifact_count: stagedArtifacts.length,
    artifacts: stagedArtifacts,
  };
  const manifestPath = "relationship_integrity_bundle.json";
  const manifestBytes = `${stableJson(manifest as unknown as JsonValue)}\n`;
  writeFileSync(join(releaseDir, manifestPath), manifestBytes, "utf8");
  stagedFiles.push({
    path: manifestPath,
    bytes: Buffer.byteLength(manifestBytes),
    sha256: sha256(manifestBytes),
  });

  return { manifest, manifest_path: manifestPath, files: stagedFiles };
}
