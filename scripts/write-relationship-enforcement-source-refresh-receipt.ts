import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import {
  assertRelationshipEnforcementSourceRefreshReceipt,
  RELATIONSHIP_CONTRACT_ID,
  RELATIONSHIP_ENFORCEMENT_SOURCE_REFRESH_RECEIPT_ID,
  RELATIONSHIP_ENFORCEMENT_SOURCE_REFRESH_RECEIPT_SCHEMA_VERSION,
  type RelationshipEnforcementSourceRefreshReceipt,
} from "../packages/db/src/relationship-contract";
import {
  stableHash,
  stableJson,
} from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  REVIEWED_PUBLIC_SNAPSHOT_COVERAGE_MANIFEST_BYTES,
  REVIEWED_PUBLIC_SNAPSHOT_COVERAGE_MANIFEST_SHA256,
} from "../packages/pipeline/src/quality/relationship-completeness";

const TRACKED_COMPLETENESS_DIR =
  "data/quality/relationship-integrity/completeness";
const COVERAGE_MANIFEST_PATH =
  "data/quality/operational-coverage/manifest.json";
const EXPECTED_PREVIOUS_COVERAGE_SHA256 =
  "287a638949df774544c5c9eaa67245af2be92f78455892bb79bf6b3bc4c09e79";
const EXPECTED_PREVIOUS_COMMAND =
  "bun -e 'import { writeRelationshipCompletenessArtifacts as write } from \"./packages/pipeline/src/quality/relationship-completeness.ts\"; write()'";
const EXPECTED_CURRENT_COMMAND =
  "bun packages/cli/src/cli.ts relationship-completeness --check-current-public-snapshot --no-sync-db";
const ROW_ARTIFACTS = [
  "bus-lane-treatment-completeness.jsonl",
  "occurrence-completeness.jsonl",
  "occurrence-treatment-physicality.jsonl",
  "operational-event-completeness.jsonl",
  "route-identity-completeness.jsonl",
] as const;

type Change = {
  artifact_path: string;
  json_pointer: string;
  previous_value: JsonValue;
  current_value: JsonValue;
};

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function optionValue(args: readonly string[], name: string): string {
  const indexes = args.flatMap((arg, index) => arg === name ? [index] : []);
  if (indexes.length !== 1) throw new Error(`${name} must appear exactly once`);
  const value = args[indexes[0]! + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function readJson(path: string): JsonValue {
  return JSON.parse(readFileSync(path, "utf8")) as JsonValue;
}

function escapePointer(value: string): string {
  return value.replace(/~/gu, "~0").replace(/\//gu, "~1");
}

function jsonChanges(
  artifactPath: string,
  previous: JsonValue,
  current: JsonValue,
  pointer = "",
): Change[] {
  if (stableJson(previous) === stableJson(current)) return [];
  if (
    previous === null ||
    current === null ||
    typeof previous !== "object" ||
    typeof current !== "object" ||
    Array.isArray(previous) !== Array.isArray(current)
  ) {
    return [{
      artifact_path: artifactPath,
      json_pointer: pointer || "/",
      previous_value: previous,
      current_value: current,
    }];
  }
  if (Array.isArray(previous) && Array.isArray(current)) {
    const changes: Change[] = [];
    const length = Math.max(previous.length, current.length);
    for (let index = 0; index < length; index += 1) {
      const next = `${pointer}/${index}`;
      if (index >= previous.length || index >= current.length) {
        throw new Error(`Source refresh may not add or remove array rows: ${artifactPath}${next}`);
      }
      changes.push(...jsonChanges(artifactPath, previous[index]!, current[index]!, next));
    }
    return changes;
  }
  const left = previous as Record<string, JsonValue>;
  const right = current as Record<string, JsonValue>;
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.flatMap((key) => {
    if (!(key in left) || !(key in right)) {
      throw new Error(`Source refresh may not add or remove JSON keys: ${artifactPath}${pointer}/${escapePointer(key)}`);
    }
    return jsonChanges(
      artifactPath,
      left[key]!,
      right[key]!,
      `${pointer}/${escapePointer(key)}`,
    );
  });
}

function assertAllowedChanges(changes: readonly Change[]): void {
  const allowed = [
    /^\/audit_fingerprint$/u,
    /^\/input_fingerprint$/u,
    /^\/input_pins\/\d+\/sha256$/u,
    /^\/files\/report\.md\/bytes$/u,
    /^\/files\/report\.md\/sha256$/u,
    /^\/files\/summary\.json\/sha256$/u,
  ];
  const invalid = changes.filter((change) =>
    !(
      (change.artifact_path.endsWith("/summary.json") &&
        [
          /^\/input_fingerprint$/u,
          /^\/input_pins\/\d+\/sha256$/u,
        ].some((pattern) => pattern.test(change.json_pointer))) ||
      (change.artifact_path.endsWith("/manifest.json") &&
        allowed.some((pattern) => pattern.test(change.json_pointer)))
    )
  );
  if (invalid.length > 0) {
    throw new Error(
      `Unreviewed relationship-completeness semantic drift:\n${invalid.map((change) =>
        `${change.artifact_path}${change.json_pointer}`
      ).join("\n")}`,
    );
  }
  const coverageChanges = changes.filter((change) =>
    /\/input_pins\/\d+\/sha256$/u.test(change.json_pointer)
  );
  if (
    coverageChanges.length !== 2 ||
    coverageChanges.some((change) =>
      change.previous_value !== EXPECTED_PREVIOUS_COVERAGE_SHA256 ||
      change.current_value !==
        REVIEWED_PUBLIC_SNAPSHOT_COVERAGE_MANIFEST_SHA256
    )
  ) {
    throw new Error(
      "Source refresh must change exactly the stale coverage-manifest SHA pin in summary and manifest",
    );
  }
}

function reportCommand(text: string): string {
  const match = /Reproduce from the repository root:\n\n```bash\n([^\n]+)\n```/u.exec(text);
  if (!match) throw new Error("Completeness report has no single reproduction command");
  return match[1]!;
}

function assertOwnedOutput(
  outputPath: string,
  ownedRootPath: string,
  check: boolean,
): void {
  if (!isAbsolute(outputPath) || !isAbsolute(ownedRootPath)) {
    throw new Error("--output and --owned-output-root must be absolute");
  }
  if (!existsSync(ownedRootPath) || !lstatSync(ownedRootPath).isDirectory()) {
    throw new Error(`Owned output root must be an existing directory: ${ownedRootPath}`);
  }
  if (lstatSync(ownedRootPath).isSymbolicLink()) {
    throw new Error(`Owned output root may not be a symlink: ${ownedRootPath}`);
  }
  const root = realpathSync(ownedRootPath);
  const output = resolve(outputPath);
  if (output === root || !output.startsWith(`${root}${sep}`)) {
    throw new Error(`Receipt output must be below the owned root: ${output}`);
  }
  const parent = dirname(output);
  if (!existsSync(parent) || realpathSync(parent) !== parent) {
    throw new Error(`Receipt output parent must be an existing real directory: ${parent}`);
  }
  if (check !== existsSync(output)) {
    throw new Error(
      check
        ? `Receipt check target is missing: ${output}`
        : `Receipt output already exists: ${output}`,
    );
  }
}

export function buildRelationshipEnforcementSourceRefreshReceipt(input: {
  candidateDir: string;
  publicSnapshotClosurePath: string;
}): RelationshipEnforcementSourceRefreshReceipt {
  const candidateDir = resolve(input.candidateDir);
  if (!existsSync(candidateDir) || !lstatSync(candidateDir).isDirectory()) {
    throw new Error(`Candidate completeness directory is missing: ${candidateDir}`);
  }
  const trackedDir = resolve(repoRoot, TRACKED_COMPLETENESS_DIR);
  const manifestName = "manifest.json";
  const summaryName = "summary.json";
  const reportName = "report.md";
  const trackedManifestText = readFileSync(resolve(trackedDir, manifestName), "utf8");
  const candidateManifestText = readFileSync(resolve(candidateDir, manifestName), "utf8");
  const trackedSummaryText = readFileSync(resolve(trackedDir, summaryName), "utf8");
  const candidateSummaryText = readFileSync(resolve(candidateDir, summaryName), "utf8");
  const trackedReportText = readFileSync(resolve(trackedDir, reportName), "utf8");
  const candidateReportText = readFileSync(resolve(candidateDir, reportName), "utf8");

  const unchangedRows = ROW_ARTIFACTS.map((name) => {
    const oldBytes = readFileSync(resolve(trackedDir, name));
    const newBytes = readFileSync(resolve(candidateDir, name));
    if (!oldBytes.equals(newBytes)) {
      throw new Error(`Completeness row artifact changed during pin refresh: ${name}`);
    }
    const rowCount = oldBytes.length === 0
      ? 0
      : oldBytes.toString("utf8").trimEnd().split(/\r?\n/gu).length;
    return {
      path: `${TRACKED_COMPLETENESS_DIR}/${name}`,
      sha256: sha256(oldBytes),
      bytes: oldBytes.length,
      row_count: rowCount,
    };
  });

  const changes = [
    ...jsonChanges(
      `${TRACKED_COMPLETENESS_DIR}/${manifestName}`,
      readJson(resolve(trackedDir, manifestName)),
      readJson(resolve(candidateDir, manifestName)),
    ),
    ...jsonChanges(
      `${TRACKED_COMPLETENESS_DIR}/${summaryName}`,
      readJson(resolve(trackedDir, summaryName)),
      readJson(resolve(candidateDir, summaryName)),
    ),
  ].sort((left, right) =>
    left.artifact_path.localeCompare(right.artifact_path) ||
    left.json_pointer.localeCompare(right.json_pointer)
  );
  assertAllowedChanges(changes);

  const previousCommand = reportCommand(trackedReportText);
  const currentCommand = reportCommand(candidateReportText);
  if (
    previousCommand !== EXPECTED_PREVIOUS_COMMAND ||
    currentCommand !== EXPECTED_CURRENT_COMMAND ||
    trackedReportText.replace(previousCommand, currentCommand) !==
      candidateReportText
  ) {
    throw new Error(
      "Completeness report changed beyond the exact reviewed reproduction-command line",
    );
  }

  const contract = JSON.parse(
    readFileSync(resolve(repoRoot, "data/contracts/relationships/v1/contract.json"), "utf8"),
  ) as {
    enforcement_proof?: {
      path?: string;
      sha256?: string;
      source_refresh_receipt?: { path: string; sha256: string };
    };
  };
  const proofPath = contract.enforcement_proof?.path;
  const proofSha256 = contract.enforcement_proof?.sha256;
  if (!proofPath || !proofSha256) {
    throw new Error("Active relationship enforcement proof pointer is missing");
  }
  const proof = JSON.parse(readFileSync(resolve(repoRoot, proofPath), "utf8")) as {
    proof_stage?: string;
  };
  if (
    proof.proof_stage !== "post_promotion_enforced" ||
    stableHash(proof as unknown as JsonValue) !== proofSha256
  ) {
    throw new Error("Active relationship enforcement proof pointer is stale");
  }

  const closurePath = resolve(repoRoot, input.publicSnapshotClosurePath);
  const relativeClosurePath = relative(repoRoot, closurePath).split(sep).join("/");
  if (
    relativeClosurePath.startsWith("../") ||
    relativeClosurePath !== input.publicSnapshotClosurePath
  ) {
    throw new Error("Public-snapshot closure path must be normalized and repository-relative");
  }
  const closureBytes = readFileSync(closurePath);
  const trackedCoveragePin = (
    JSON.parse(trackedSummaryText) as {
      input_pins: Array<{ path: string; sha256: string; bytes: number }>;
    }
  ).input_pins.find((pin) => pin.path === COVERAGE_MANIFEST_PATH);
  const candidateCoveragePin = (
    JSON.parse(candidateSummaryText) as {
      input_pins: Array<{ path: string; sha256: string; bytes: number }>;
    }
  ).input_pins.find((pin) => pin.path === COVERAGE_MANIFEST_PATH);
  if (
    trackedCoveragePin?.sha256 !== EXPECTED_PREVIOUS_COVERAGE_SHA256 ||
    trackedCoveragePin.bytes !== REVIEWED_PUBLIC_SNAPSHOT_COVERAGE_MANIFEST_BYTES ||
    candidateCoveragePin?.sha256 !==
      REVIEWED_PUBLIC_SNAPSHOT_COVERAGE_MANIFEST_SHA256 ||
    candidateCoveragePin.bytes !==
      REVIEWED_PUBLIC_SNAPSHOT_COVERAGE_MANIFEST_BYTES
  ) {
    throw new Error("Completeness coverage-manifest pins do not match the reviewed refresh boundary");
  }

  const receipt: RelationshipEnforcementSourceRefreshReceipt = {
    schema_version:
      RELATIONSHIP_ENFORCEMENT_SOURCE_REFRESH_RECEIPT_SCHEMA_VERSION,
    receipt_id: RELATIONSHIP_ENFORCEMENT_SOURCE_REFRESH_RECEIPT_ID,
    contract_id: RELATIONSHIP_CONTRACT_ID,
    reason_code: "public_snapshot_pin_closure",
    review_method: "lossless_public_snapshot_pin_refresh",
    previous_active_proof: {
      path:
        `data/contracts/relationships/v1/enforcement-proofs/${proofSha256}/proof.json`,
      sha256: proofSha256,
      proof_stage: "post_promotion_enforced",
    },
    ...(contract.enforcement_proof.source_refresh_receipt
      ? {
          previous_source_refresh_receipt:
            contract.enforcement_proof.source_refresh_receipt,
        }
      : {}),
    coverage_manifest: {
      path: COVERAGE_MANIFEST_PATH,
      previous: {
        sha256: trackedCoveragePin.sha256,
        bytes: trackedCoveragePin.bytes,
      },
      current: {
        sha256: candidateCoveragePin.sha256,
        bytes: candidateCoveragePin.bytes,
      },
    },
    completeness_manifest: {
      path: `${TRACKED_COMPLETENESS_DIR}/${manifestName}`,
      previous_sha256: sha256(trackedManifestText),
      current_sha256: sha256(candidateManifestText),
    },
    completeness_summary: {
      path: `${TRACKED_COMPLETENESS_DIR}/${summaryName}`,
      previous_sha256: sha256(trackedSummaryText),
      current_sha256: sha256(candidateSummaryText),
    },
    report: {
      path: `${TRACKED_COMPLETENESS_DIR}/${reportName}`,
      previous_sha256: sha256(trackedReportText),
      current_sha256: sha256(candidateReportText),
      previous_command: previousCommand,
      current_command: currentCommand,
      exact_removed_line: `-${previousCommand}`,
      exact_added_line: `+${currentCommand}`,
    },
    unchanged_row_artifacts: unchangedRows,
    allowed_json_pointer_changes: changes,
    public_snapshot_input_closure: {
      path: relativeClosurePath,
      sha256: sha256(closureBytes),
      bytes: closureBytes.length,
    },
  };
  assertRelationshipEnforcementSourceRefreshReceipt(receipt);
  return receipt;
}

export function checkRelationshipEnforcementSourceRefreshReceipt(input: {
  candidateDir: string;
  publicSnapshotClosurePath: string;
  receiptPath: string;
}): RelationshipEnforcementSourceRefreshReceipt {
  const receiptText = readFileSync(resolve(input.receiptPath), "utf8");
  const receipt = JSON.parse(
    receiptText,
  ) as RelationshipEnforcementSourceRefreshReceipt;
  assertRelationshipEnforcementSourceRefreshReceipt(receipt);
  if (
    receiptText !==
      `${stableJson(receipt as unknown as JsonValue)}\n`
  ) {
    throw new Error("Source-refresh receipt bytes are not canonical");
  }

  const candidateDir = resolve(input.candidateDir);
  if (!existsSync(candidateDir) || !lstatSync(candidateDir).isDirectory()) {
    throw new Error(`Candidate completeness directory is missing: ${candidateDir}`);
  }
  const candidateFiles = [
    receipt.completeness_manifest,
    receipt.completeness_summary,
    receipt.report,
  ] as const;
  for (const pin of candidateFiles) {
    const candidatePath = resolve(candidateDir, pin.path.split("/").at(-1)!);
    if (sha256(readFileSync(candidatePath)) !== pin.current_sha256) {
      throw new Error(`Source-refresh candidate is stale: ${pin.path}`);
    }
  }
  if (
    reportCommand(readFileSync(resolve(candidateDir, "report.md"), "utf8")) !==
      receipt.report.current_command
  ) {
    throw new Error("Source-refresh candidate report command is stale");
  }

  for (const pin of receipt.unchanged_row_artifacts) {
    const name = pin.path.split("/").at(-1)!;
    const bytes = readFileSync(resolve(candidateDir, name));
    const rowCount = bytes.length === 0
      ? 0
      : bytes.toString("utf8").trimEnd().split(/\r?\n/gu).length;
    if (
      sha256(bytes) !== pin.sha256 ||
      bytes.length !== pin.bytes ||
      rowCount !== pin.row_count
    ) {
      throw new Error(`Source-refresh row artifact is stale: ${pin.path}`);
    }
  }

  const coveragePath = resolve(repoRoot, receipt.coverage_manifest.path);
  const coverageBytes = readFileSync(coveragePath);
  if (
    sha256(coverageBytes) !== receipt.coverage_manifest.current.sha256 ||
    coverageBytes.length !== receipt.coverage_manifest.current.bytes
  ) {
    throw new Error("Source-refresh coverage-manifest current pin is stale");
  }

  const closurePath = resolve(repoRoot, input.publicSnapshotClosurePath);
  const relativeClosurePath = relative(repoRoot, closurePath).split(sep).join("/");
  const closureBytes = readFileSync(closurePath);
  if (
    relativeClosurePath !== input.publicSnapshotClosurePath ||
    receipt.public_snapshot_input_closure.path !== relativeClosurePath ||
    receipt.public_snapshot_input_closure.sha256 !== sha256(closureBytes) ||
    receipt.public_snapshot_input_closure.bytes !== closureBytes.length
  ) {
    throw new Error("Source-refresh public-snapshot closure pin is stale");
  }
  return receipt;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const known = new Set([
    "--candidate",
    "--public-snapshot-closure",
    "--reason-code",
    "--output",
    "--owned-output-root",
    "--check",
  ]);
  for (const arg of args.filter((value) => value.startsWith("--"))) {
    if (!known.has(arg)) throw new Error(`Unknown argument: ${arg}`);
  }
  if (optionValue(args, "--reason-code") !== "public_snapshot_pin_closure") {
    throw new Error("Only --reason-code public_snapshot_pin_closure is supported");
  }
  const output = resolve(optionValue(args, "--output"));
  const check = args.includes("--check");
  assertOwnedOutput(
    output,
    resolve(optionValue(args, "--owned-output-root")),
    check,
  );
  const receipt = check
    ? checkRelationshipEnforcementSourceRefreshReceipt({
        candidateDir: optionValue(args, "--candidate"),
        publicSnapshotClosurePath: optionValue(
          args,
          "--public-snapshot-closure",
        ),
        receiptPath: output,
      })
    : buildRelationshipEnforcementSourceRefreshReceipt({
        candidateDir: optionValue(args, "--candidate"),
        publicSnapshotClosurePath: optionValue(
          args,
          "--public-snapshot-closure",
        ),
      });
  if (!check) {
    const text = `${stableJson(receipt as unknown as JsonValue)}\n`;
    writeFileSync(output, text, "utf8");
  }
  console.log(JSON.stringify({
    mode: check ? "check" : "write",
    output,
    receipt_sha256: stableHash(receipt as unknown as JsonValue),
    unchanged_row_artifact_count: receipt.unchanged_row_artifacts.length,
    allowed_json_pointer_change_count:
      receipt.allowed_json_pointer_changes.length,
  }, null, 2));
}
