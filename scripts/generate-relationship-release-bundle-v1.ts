import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  extname,
  join,
  relative,
  resolve,
} from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  RELATIONSHIP_RELEASE_BUNDLE_ID,
  RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION,
  parseRelationshipReleaseBundleDescriptor,
  relationshipReleaseBundleDescriptorPath,
  type RelationshipReleaseBundleArtifact,
  type RelationshipReleaseBundleDescriptor,
} from "../packages/pipeline/src/materialize/relationship-release-bundle";

const SOURCE_ROOTS = [
  "data/contracts/occurrence-treatment-physicality/v1",
  "data/contracts/operational-occurrence-phases/v1",
  "data/contracts/relationship-references/v1",
  "data/contracts/relationships/v1",
  "data/quality/relationship-integrity",
  "data/relationship-integrity/dispositions/v1",
  "schemas/relationship-enforcement-gate-v1.schema.json",
  "schemas/relationship-contract-v1.schema.json",
  "schemas/relationship-enforcement-source-refresh-receipt-v1.schema.json",
] as const;

const BASE_ROLE_BY_PATH = new Map<string, string>([
  [
    "schemas/relationship-enforcement-gate-v1.schema.json",
    "relationship_enforcement_gate_schema",
  ],
  [
    "schemas/relationship-enforcement-source-refresh-receipt-v1.schema.json",
    "relationship_enforcement_source_refresh_receipt_schema",
  ],
  [
    "data/contracts/occurrence-treatment-physicality/v1/contract.json",
    "occurrence_treatment_physicality_contract",
  ],
  [
    "data/contracts/occurrence-treatment-physicality/v1/review-ledger.jsonl",
    "occurrence_treatment_physicality_review_ledger",
  ],
  [
    "data/contracts/operational-occurrence-phases/v1/contract.json",
    "operational_occurrence_phase_contract",
  ],
  [
    "data/contracts/operational-occurrence-phases/v1/review-ledger.jsonl",
    "operational_occurrence_phase_review_ledger",
  ],
  [
    "data/contracts/relationship-references/v1/contract.json",
    "payload_reference_contract",
  ],
  [
    "data/contracts/relationship-references/v1/review-decisions.jsonl",
    "payload_reference_review_ledger",
  ],
  [
    "data/contracts/relationships/v1/post-remediation-endpoint-matrix.json",
    "endpoint_type_matrix",
  ],
  [
    "data/contracts/relationships/v1/enforcement-proof.json",
    "enforcement_proof",
  ],
  [
    "data/contracts/relationships/v1/contract.json",
    "relationship_contract",
  ],
  [
    "data/quality/relationship-integrity/bus-lane-acquisition/summary.json",
    "bus_lane_acquisition_summary",
  ],
  [
    "data/quality/relationship-integrity/completeness/summary.json",
    "relationship_completeness_summary",
  ],
  [
    "data/quality/relationship-integrity/completeness/manifest.json",
    "relationship_completeness_manifest",
  ],
  [
    "data/quality/relationship-integrity/graph-audit/findings.jsonl",
    "graph_audit_findings",
  ],
  [
    "data/quality/relationship-integrity/graph-audit/summary.json",
    "graph_audit_summary",
  ],
  [
    "data/quality/relationship-integrity/graph-audit/manifest.json",
    "graph_audit_manifest",
  ],
  [
    "data/quality/relationship-integrity/occurrence-treatment-physicality/summary.json",
    "occurrence_treatment_physicality_summary",
  ],
  [
    "data/quality/relationship-integrity/payload-references/summary.json",
    "payload_reference_summary",
  ],
  [
    "data/quality/relationship-integrity/semantic-remediation/ledger.jsonl",
    "semantic_remediation_ledger",
  ],
  [
    "data/quality/relationship-integrity/semantic-remediation/summary.json",
    "semantic_remediation_summary",
  ],
]);

const ALLOWED_EXTENSIONS = new Set([".json", ".jsonl", ".md"]);

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedRelative(root: string, path: string): string {
  return relative(root, path).split("\\").join("/");
}

function collectFiles(
  root: string,
  outputPath: string,
  path: string,
): string[] {
  if (!existsSync(path)) {
    throw new Error(
      `Relationship release bundle source is missing: ${normalizedRelative(root, path)}`,
    );
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new Error(
      `Relationship release bundle sources may not be symlinks: ${normalizedRelative(root, path)}`,
    );
  }
  if (stat.isFile()) {
    const relativePath = normalizedRelative(root, path);
    if (relativePath === normalizedRelative(root, outputPath)) return [];
    return ALLOWED_EXTENSIONS.has(extname(path)) ? [relativePath] : [];
  }
  if (!stat.isDirectory()) {
    throw new Error(
      `Unsupported relationship release bundle source: ${normalizedRelative(root, path)}`,
    );
  }
  return readdirSync(path)
    .sort()
    .flatMap((name) =>
      collectFiles(root, outputPath, join(path, name))
    );
}

function contractPointers(root: string): {
  mode: "warn" | "enforce";
  transitionReceiptPath?: string;
  sourceRefreshReceiptPath?: string;
} {
  const path = join(
    root,
    "data/contracts/relationships/v1/contract.json",
  );
  const value = JSON.parse(readFileSync(path, "utf8")) as {
    contract_status?: unknown;
    enforcement_state?: unknown;
    enforcement_proof?: {
      transition_receipt?: { path?: unknown };
      source_refresh_receipt?: { path?: unknown };
    };
  };
  if (value.contract_status === "warning_first") return { mode: "warn" };
  if (value.contract_status !== "enforced") {
    throw new Error(
      `Relationship contract has unsupported status ${String(value.contract_status)}`,
    );
  }
  if (value.enforcement_state !== "enforced_ready") {
    throw new Error(
      `Relationship release bundle/rc22 is forbidden until enforced_ready; found ${String(value.enforcement_state)}`,
    );
  }
  const transitionReceiptPath =
    value.enforcement_proof?.transition_receipt?.path;
  if (
    typeof transitionReceiptPath !== "string" ||
    !transitionReceiptPath.trim()
  ) {
    throw new Error(
      "enforced_ready release bundle requires a transition receipt pointer",
    );
  }
  const sourceRefreshReceiptPath =
    value.enforcement_proof?.source_refresh_receipt?.path;
  return {
    mode: "enforce",
    transitionReceiptPath,
    ...(typeof sourceRefreshReceiptPath === "string" &&
      sourceRefreshReceiptPath.trim()
      ? { sourceRefreshReceiptPath }
      : {}),
  };
}

export function generateRelationshipReleaseBundleV1(
  mode: "check" | "apply",
  root = repoRoot,
): RelationshipReleaseBundleDescriptor {
  const generationRoot = resolve(root);
  const outputPath =
    relationshipReleaseBundleDescriptorPath(generationRoot);
  const pointers = contractPointers(generationRoot);
  const roleByPath = new Map(BASE_ROLE_BY_PATH);
  if (pointers.transitionReceiptPath) {
    roleByPath.set(
      pointers.transitionReceiptPath,
      "enforcement_transition_receipt",
    );
  }
  if (pointers.sourceRefreshReceiptPath) {
    roleByPath.set(
      pointers.sourceRefreshReceiptPath,
      "enforcement_source_refresh_receipt",
    );
  }
  const sourcePaths = [
    ...new Set(
      SOURCE_ROOTS.flatMap((path) =>
        collectFiles(
          generationRoot,
          outputPath,
          join(generationRoot, path),
        )
      ),
    ),
  ].sort();
  for (const requiredPath of roleByPath.keys()) {
    if (
      requiredPath ===
        "data/contracts/relationships/v1/enforcement-proof.json" &&
      pointers.mode === "warn"
    ) {
      continue;
    }
    if (!sourcePaths.includes(requiredPath)) {
      throw new Error(
        `Required relationship release bundle artifact is missing: ${requiredPath}`,
      );
    }
  }
  const artifacts: RelationshipReleaseBundleArtifact[] = sourcePaths
    .map((sourcePath) => {
      const bytes = readFileSync(join(generationRoot, sourcePath));
      const gateMatch =
        /^data\/contracts\/relationships\/v1\/enforcement-gates\/([^/]+)\.json$/u
          .exec(sourcePath);
      return {
        role:
          roleByPath.get(sourcePath) ??
          (gateMatch
            ? `enforcement_gate:${gateMatch[1]}`
            : `artifact:${sourcePath}`),
        source_path: sourcePath,
        bytes: bytes.length,
        sha256: sha256(bytes),
      };
    })
    .sort((left, right) =>
      left.role.localeCompare(right.role) ||
      left.source_path.localeCompare(right.source_path)
    );
  const descriptor: RelationshipReleaseBundleDescriptor = {
    schema_version: RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION,
    bundle_id: RELATIONSHIP_RELEASE_BUNDLE_ID,
    contract_id: "relationship-contract-v1",
    validation_mode: pointers.mode,
    artifacts,
  };
  parseRelationshipReleaseBundleDescriptor(descriptor);
  const bytes = `${stableJson(descriptor as unknown as JsonValue)}\n`;
  if (mode === "check") {
    if (!existsSync(outputPath)) {
      throw new Error(
        `Relationship release bundle descriptor is missing: ${normalizedRelative(generationRoot, outputPath)}; run with --apply`,
      );
    }
    if (readFileSync(outputPath, "utf8") !== bytes) {
      throw new Error(
        "Relationship release bundle descriptor is stale; run with --apply after all reviewed artifacts settle",
      );
    }
  } else {
    mkdirSync(dirname(outputPath), { recursive: true });
    const temporary = `${outputPath}.tmp-${process.pid}`;
    writeFileSync(temporary, bytes, "utf8");
    renameSync(temporary, outputPath);
  }
  return descriptor;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--repository-root");
  const rootValue = rootIndex >= 0 ? args[rootIndex + 1] : undefined;
  if (rootIndex >= 0 && (!rootValue || rootValue.startsWith("--"))) {
    throw new Error("--repository-root requires a value");
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--repository-root") {
      index += 1;
      continue;
    }
    if (arg !== "--apply" && arg !== "--check") {
      throw new Error(
        "Usage: bun scripts/generate-relationship-release-bundle-v1.ts [--check|--apply] [--repository-root <path>]",
      );
    }
  }
  const apply = args.includes("--apply");
  const explicitCheck = args.includes("--check");
  if (apply && explicitCheck) {
    throw new Error("Choose exactly one of --apply and --check");
  }
  const mode = apply ? "apply" : "check";
  const generationRoot = rootValue ? resolve(rootValue) : repoRoot;
  const descriptor = generateRelationshipReleaseBundleV1(
    mode,
    generationRoot,
  );
  const outputPath =
    relationshipReleaseBundleDescriptorPath(generationRoot);
  console.log(JSON.stringify({
    mode,
    validation_mode: descriptor.validation_mode,
    artifact_count: descriptor.artifacts.length,
    descriptor_path: normalizedRelative(
      generationRoot,
      outputPath,
    ),
    descriptor_sha256: sha256(readFileSync(outputPath)),
  }));
}
