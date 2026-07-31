/// <reference path="../packages/db/src/bun-sqlite.d.ts" />
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { spawnSync } from "node:child_process";
import { repoRoot } from "../packages/core/src/paths";
import {
  CANONICAL_DB_SOURCE_REFRESH_AUTHORIZATION_ENV,
  CANONICAL_DB_SOURCE_REFRESH_MARKER,
  CANONICAL_DB_SOURCE_REFRESH_SIDECAR,
  canonicalDbSourceRefreshFileSha256,
  canonicalDbSourceRefreshMarkerPath,
  parseCanonicalDbSourceRefreshMarker,
  readCanonicalDbSourceRefreshMarker,
  writeCanonicalDbSourceRefreshMarker,
  type CanonicalDbSourceRefreshMarker,
} from "../packages/db/src/canonical-db-source-refresh";
import {
  openCanonicalDb,
  rebuildCanonicalDb,
} from "../packages/db/src/canonical-db";
import {
  assertRelationshipEnforcementSourceRefreshReceipt,
  loadRelationshipContract,
  relationshipContractValidationMode,
  RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS,
  type RelationshipEnforcementProof,
  type RelationshipEnforcementSourceRefreshReceipt,
} from "../packages/db/src/relationship-contract";
import {
  stableHash,
  stableJson,
} from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import { relationshipReleaseBundleDescriptorPath } from "../packages/pipeline/src/materialize/relationship-release-bundle";
import {
  loadRelationshipCompletenessArtifacts,
  relationshipCompletenessDbMirror,
  REVIEWED_PUBLIC_SNAPSHOT_RELEASE_DIR,
  REVIEWED_PUBLIC_SNAPSHOT_RELEASE_MANIFEST_SHA256,
} from "../packages/pipeline/src/quality/relationship-completeness";
import { auditRelationshipGraph } from "../packages/pipeline/src/records/relationship-integrity";
import {
  readSemanticCorrections,
  semanticSupersessionIdentities,
} from "../packages/pipeline/src/records/semantic-corrections";
import { generateRelationshipEnforcementProofV1 } from "./generate-relationship-enforcement-proof-v1";
import { generateRelationshipReleaseBundleV1 } from "./generate-relationship-release-bundle-v1";

const RECEIPT_ROOT =
  "data/contracts/relationships/v1/enforcement-source-refresh-receipts";
const ACTIVE_PROOF_PATH =
  "data/contracts/relationships/v1/enforcement-proof.json";
const CONTRACT_PATH =
  "data/contracts/relationships/v1/contract.json";
const COMPLETENESS_ROOT =
  "data/quality/relationship-integrity/completeness";
const ALLOWED_FIXED_DESTINATIONS = new Set([
  `${COMPLETENESS_ROOT}/manifest.json`,
  `${COMPLETENESS_ROOT}/summary.json`,
  `${COMPLETENESS_ROOT}/report.md`,
  "data/contracts/relationships/v1/enforcement-gates/relationship_completeness.json",
  ACTIVE_PROOF_PATH,
  CONTRACT_PATH,
  "data/contracts/relationships/v1/release-bundle-sources.json",
]);
const REQUIRED_FIXED_DESTINATIONS = [
  ACTIVE_PROOF_PATH,
  CONTRACT_PATH,
  "data/contracts/relationships/v1/release-bundle-sources.json",
] as const;

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: JsonValue): string {
  return `${stableJson(value)}\n`;
}

function optionValue(args: readonly string[], name: string): string {
  const indexes = args.flatMap((arg, index) => arg === name ? [index] : []);
  if (indexes.length !== 1) throw new Error(`${name} must appear exactly once`);
  const value = args[indexes[0]! + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function runGit(args: readonly string[]): string {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return result.stdout.trim();
}

function relativePath(path: string): string {
  const value = relative(repoRoot, path).split(sep).join("/");
  if (!value || value.startsWith("../") || isAbsolute(value)) {
    throw new Error(`Path is outside the repository: ${path}`);
  }
  return value;
}

function atomicInstall(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.source-refresh-${process.pid}`;
  copyFileSync(source, temporary);
  renameSync(temporary, destination);
}

function linkTree(source: string, destination: string): void {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) {
    throw new Error(`Overlay inputs may not be symlinks: ${source}`);
  }
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const name of readdirSync(source).sort()) {
      if (
        source === join(repoRoot, "data") &&
        (
          name === ".canonical-db-source-refresh" ||
          name === "canonical.db"
        )
      ) {
        continue;
      }
      linkTree(join(source, name), join(destination, name));
    }
    return;
  }
  mkdirSync(dirname(destination), { recursive: true });
  linkSync(source, destination);
}

function replaceOverlayFile(
  overlayRoot: string,
  path: string,
  source: string,
): void {
  const destination = join(overlayRoot, path);
  if (existsSync(destination)) unlinkSync(destination);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

function archiveActiveProof(
  overlayRoot: string,
  receipt: RelationshipEnforcementSourceRefreshReceipt,
): string[] {
  const proofText = readFileSync(join(repoRoot, ACTIVE_PROOF_PATH), "utf8");
  const proof = JSON.parse(proofText) as RelationshipEnforcementProof;
  if (
    stableHash(proof as unknown as JsonValue) !==
      receipt.previous_active_proof.sha256
  ) {
    throw new Error("Active proof does not match source-refresh receipt");
  }
  const archiveRoot = dirname(receipt.previous_active_proof.path);
  if (
    archiveRoot !==
      `data/contracts/relationships/v1/enforcement-proofs/${receipt.previous_active_proof.sha256}`
  ) {
    throw new Error("Source-refresh previous-proof archive path is not content-addressed");
  }
  const artifacts = new Map<string, string>([
    [receipt.previous_active_proof.path, proofText],
  ]);
  for (const gate of [...proof.gates].sort((left, right) =>
    left.gate_id.localeCompare(right.gate_id)
  )) {
    const gateText = readFileSync(join(repoRoot, gate.artifact_path), "utf8");
    if (sha256(gateText) !== gate.artifact_sha256) {
      throw new Error(`Cannot archive stale active gate: ${gate.gate_id}`);
    }
    artifacts.set(
      `${archiveRoot}/gates/${gate.gate_id}.json`,
      gateText,
    );
    const gateArtifact = JSON.parse(gateText) as {
      source_artifacts: Array<{
        role: string;
        path: string;
        sha256: string;
      }>;
    };
    for (const source of gateArtifact.source_artifacts) {
      const expected = (
        RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS as Record<
          string,
          readonly { role: string; path: string }[]
        >
      )[gate.gate_id]?.find((entry) =>
        entry.role === source.role && entry.path === source.path
      );
      if (!expected) {
        throw new Error(
          `Cannot archive unversioned active source: ${gate.gate_id}/${source.role}`,
        );
      }
      const sourceText = readFileSync(join(repoRoot, source.path), "utf8");
      if (sha256(sourceText) !== source.sha256) {
        throw new Error(`Cannot archive stale active source: ${source.role}`);
      }
      const extension = source.path.endsWith(".jsonl") ? ".jsonl" : ".json";
      const archivePath = `${archiveRoot}/sources/${source.role}${extension}`;
      const existing = artifacts.get(archivePath);
      if (existing !== undefined && existing !== sourceText) {
        throw new Error(`Active proof source role collision: ${source.role}`);
      }
      artifacts.set(archivePath, sourceText);
    }
  }
  for (const [path, text] of [...artifacts].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const destination = join(overlayRoot, path);
    if (existsSync(destination)) {
      if (readFileSync(destination, "utf8") !== text) {
        throw new Error(`Immutable proof archive collision: ${path}`);
      }
      continue;
    }
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, text, "utf8");
  }
  return [...artifacts.keys()].sort();
}

function receiptPathAndValue(receiptArgument: string): {
  path: string;
  text: string;
  receipt: RelationshipEnforcementSourceRefreshReceipt;
  hash: string;
} {
  const path = resolve(receiptArgument);
  const text = readFileSync(path, "utf8");
  const receipt = JSON.parse(text) as RelationshipEnforcementSourceRefreshReceipt;
  assertRelationshipEnforcementSourceRefreshReceipt(receipt);
  const hash = stableHash(receipt as unknown as JsonValue);
  const canonicalPath = `${RECEIPT_ROOT}/${hash}.json`;
  if (
    path.startsWith(`${resolve(repoRoot, RECEIPT_ROOT)}${sep}`) &&
    relativePath(path) !== canonicalPath
  ) {
    throw new Error("Source-refresh receipt filename/hash mismatch");
  }
  return { path, text, receipt, hash };
}

function verifyCandidateCompleteness(
  receiptPath: string,
  receipt: RelationshipEnforcementSourceRefreshReceipt,
  temporaryRoot: string,
) {
  const candidateDir = join(dirname(receiptPath), "completeness");
  if (!existsSync(candidateDir)) {
    throw new Error(
      `Candidate completeness directory must be adjacent to the owned-temp receipt: ${candidateDir}`,
    );
  }
  const generatedOutput = join(temporaryRoot, "regenerated-completeness");
  const loaded = loadRelationshipCompletenessArtifacts({
    releaseDir: REVIEWED_PUBLIC_SNAPSHOT_RELEASE_DIR,
    releaseSourceDir: REVIEWED_PUBLIC_SNAPSHOT_RELEASE_DIR,
    coverageDir: "data/quality/operational-coverage",
    outputDir: generatedOutput,
    ownedOutputRoot: temporaryRoot,
    expectedReleaseManifestSha256:
      REVIEWED_PUBLIC_SNAPSHOT_RELEASE_MANIFEST_SHA256,
    prepareReviewedPublicSnapshotRefresh: true,
  });
  for (const [name, content] of Object.entries(loaded.contents)) {
    const candidate = readFileSync(join(candidateDir, name), "utf8");
    if (candidate !== content) {
      throw new Error(`Candidate completeness is not reproducible: ${name}`);
    }
  }
  for (const pin of [
    receipt.completeness_manifest,
    receipt.completeness_summary,
    receipt.report,
  ]) {
    const candidate = join(candidateDir, basename(pin.path));
    if (sha256(readFileSync(candidate)) !== pin.current_sha256) {
      throw new Error(`Candidate completeness hash mismatch: ${pin.path}`);
    }
  }
  return { candidateDir, loaded };
}

function buildCandidateDatabase(
  path: string,
  loaded: ReturnType<typeof loadRelationshipCompletenessArtifacts>,
): {
  sha256: string;
  recordCount: number;
  relationCount: number;
  completenessInputFingerprint: string;
} {
  const records = readCanonicalRecordsFromJsonl();
  if (records.length === 0) {
    throw new Error("Tracked canonical JSONL snapshot is empty");
  }
  const contract = loadRelationshipContract();
  const audit = auditRelationshipGraph(records, {
    mode: relationshipContractValidationMode(contract),
    contract,
    includeOrphans: false,
  });
  const errors = audit.findings.filter((finding) => finding.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `Candidate canonical DB graph audit has ${errors.length} error(s)`,
    );
  }
  const result = rebuildCanonicalDb(records, {
    path,
    identitySupersessions:
      semanticSupersessionIdentities(readSemanticCorrections()),
    relationshipFindings: audit.findings,
    relationshipCompleteness:
      relationshipCompletenessDbMirror(loaded, "enforce"),
  });
  const db = openCanonicalDb(path, { readonly: true });
  try {
    const state = db.query(
      `SELECT mode, hard_mode_ready, input_fingerprint
       FROM relationship_enforcement_state
       WHERE contract_id = 'relationship-completeness-v1'`,
    ).get() as {
      mode: string;
      hard_mode_ready: number;
      input_fingerprint: string;
    } | null;
    if (
      !state ||
      state.mode !== "enforce" ||
      state.hard_mode_ready !== 1 ||
      state.input_fingerprint !== loaded.summary.input_fingerprint
    ) {
      throw new Error("Candidate canonical DB completeness logical anchor is invalid");
    }
  } finally {
    db.close();
  }
  return {
    sha256: canonicalDbSourceRefreshFileSha256(path),
    recordCount: result.recordCount,
    relationCount: result.relationCount,
    completenessInputFingerprint: loaded.summary.input_fingerprint,
  };
}

function changedCandidate(
  candidates: ReadonlyMap<string, string>,
): Map<string, string> {
  const changed = new Map<string, string>();
  for (const [path, source] of candidates) {
    const current = join(repoRoot, path);
    if (
      !existsSync(current) ||
      !readFileSync(current).equals(readFileSync(source))
    ) {
      changed.set(path, source);
    }
  }
  return changed;
}

function assertAllowedDestinationSet(
  destinations: readonly string[],
  receiptHash: string,
  previousProofHash: string,
): void {
  const receiptPath = `${RECEIPT_ROOT}/${receiptHash}.json`;
  const archivePrefix =
    `data/contracts/relationships/v1/enforcement-proofs/${previousProofHash}/`;
  const invalid = destinations.filter((path) =>
    !ALLOWED_FIXED_DESTINATIONS.has(path) &&
    path !== receiptPath &&
    !path.startsWith(archivePrefix)
  );
  if (invalid.length > 0) {
    throw new Error(
      `Unified source refresh attempted an undeclared tracked change:\n${invalid.join("\n")}`,
    );
  }
  for (const required of [
    ...REQUIRED_FIXED_DESTINATIONS,
    receiptPath,
  ]) {
    if (!destinations.includes(required)) {
      throw new Error(`Unified source refresh is missing required destination: ${required}`);
    }
  }
}

function worktreePaths(): string[] {
  const output = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  return output
    ? output.split(/\r?\n/gu).map((line) => line.slice(3)).sort()
    : [];
}

function verifyDatabase(
  path: string,
  marker: CanonicalDbSourceRefreshMarker,
): void {
  if (
    !existsSync(path) ||
    canonicalDbSourceRefreshFileSha256(path) !==
      marker.candidate_db.sha256
  ) {
    throw new Error("Primary canonical DB does not match the staged source-refresh DB");
  }
  const db = openCanonicalDb(path, { readonly: true });
  try {
    const counts = db.query(
      `SELECT
         (SELECT COUNT(*) FROM records) AS record_count,
         (SELECT COUNT(*) FROM relations) AS relation_count`,
    ).get() as { record_count: number; relation_count: number };
    const state = db.query(
      `SELECT input_fingerprint
       FROM relationship_enforcement_state
       WHERE contract_id = 'relationship-completeness-v1'`,
    ).get() as { input_fingerprint: string } | null;
    if (
      counts.record_count !== marker.candidate_db.record_count ||
      counts.relation_count !== marker.candidate_db.relation_count ||
      state?.input_fingerprint !==
        marker.candidate_db.completeness_input_fingerprint
    ) {
      throw new Error("Primary canonical DB logical anchors do not match the transaction marker");
    }
  } finally {
    db.close();
  }
}

function verifyInstalled(
  marker: CanonicalDbSourceRefreshMarker,
): void {
  for (const destination of marker.tracked_destinations) {
    const path = join(repoRoot, destination.path);
    if (
      !existsSync(path) ||
      canonicalDbSourceRefreshFileSha256(path) !==
        destination.current_sha256
    ) {
      throw new Error(`Installed source-refresh destination is stale: ${destination.path}`);
    }
  }
  verifyDatabase(join(repoRoot, "data/canonical.db"), marker);
}

function asCompletedMarker(
  marker: CanonicalDbSourceRefreshMarker,
): CanonicalDbSourceRefreshMarker {
  return parseCanonicalDbSourceRefreshMarker({
    ...marker,
    completed_operations: [
      "database:data/canonical.db",
      ...marker.tracked_destinations.map(
        (destination) => `tracked:${destination.path}`,
      ),
    ].sort(),
  });
}

function resumeTransaction(
  marker: CanonicalDbSourceRefreshMarker,
  receiptHash: string,
): CanonicalDbSourceRefreshMarker {
  if (marker.receipt_sha256 !== receiptHash) {
    throw new Error(
      `A different source-refresh transaction is active: ${marker.receipt_sha256}`,
    );
  }
  const completed = new Set(marker.completed_operations);
  const allowedChanged = marker.tracked_destinations
    .filter((destination) =>
      completed.has(`tracked:${destination.path}`)
    )
    .map((destination) => destination.path)
    .sort();
  const actualChanged = worktreePaths().filter((path) =>
    path !== CANONICAL_DB_SOURCE_REFRESH_MARKER &&
    !path.startsWith(`${CANONICAL_DB_SOURCE_REFRESH_SIDECAR}/`)
  );
  if (
    stableJson(actualChanged as unknown as JsonValue) !==
      stableJson(allowedChanged as unknown as JsonValue)
  ) {
    throw new Error(
      `Interrupted source-refresh worktree diff is not the marker-declared subset; expected ${allowedChanged.join(", ") || "none"}, found ${actualChanged.join(", ") || "none"}`,
    );
  }
  for (const destination of marker.tracked_destinations) {
    if (!completed.has(`tracked:${destination.path}`)) continue;
    const installed = join(repoRoot, destination.path);
    if (
      !existsSync(installed) ||
      canonicalDbSourceRefreshFileSha256(installed) !==
        destination.current_sha256
    ) {
      throw new Error(`Completed marker destination conflicts: ${destination.path}`);
    }
  }
  const sidecar = join(repoRoot, marker.staged_root);
  const stagedDb = join(sidecar, marker.candidate_db.path);
  process.env[CANONICAL_DB_SOURCE_REFRESH_AUTHORIZATION_ENV] =
    marker.receipt_sha256;
  if (!completed.has("database:data/canonical.db")) {
    if (
      !existsSync(stagedDb) ||
      canonicalDbSourceRefreshFileSha256(stagedDb) !==
        marker.candidate_db.sha256
    ) {
      throw new Error("Durable staged candidate DB is missing or stale");
    }
    atomicInstall(stagedDb, join(repoRoot, "data/canonical.db"));
    completed.add("database:data/canonical.db");
    writeCanonicalDbSourceRefreshMarker({
      ...marker,
      completed_operations: [...completed].sort(),
    });
  } else {
    verifyDatabase(join(repoRoot, "data/canonical.db"), marker);
  }
  for (const destination of marker.tracked_destinations) {
    const operation = `tracked:${destination.path}`;
    if (completed.has(operation)) continue;
    const staged = join(sidecar, "tracked", destination.path);
    if (
      !existsSync(staged) ||
      canonicalDbSourceRefreshFileSha256(staged) !==
        destination.current_sha256
    ) {
      throw new Error(`Durable staged tracked destination is missing or stale: ${destination.path}`);
    }
    atomicInstall(staged, join(repoRoot, destination.path));
    completed.add(operation);
    writeCanonicalDbSourceRefreshMarker({
      ...marker,
      completed_operations: [...completed].sort(),
    });
  }
  const finalMarker = readCanonicalDbSourceRefreshMarker();
  if (!finalMarker) throw new Error("Source-refresh marker disappeared during transaction");
  verifyInstalled(finalMarker);
  const completedMarker = asCompletedMarker(finalMarker);
  unlinkSync(canonicalDbSourceRefreshMarkerPath());
  delete process.env[CANONICAL_DB_SOURCE_REFRESH_AUTHORIZATION_ENV];
  return completedMarker;
}

function initialApply(input: ReturnType<typeof receiptPathAndValue>): void {
  if (runGit(["rev-parse", "v1-rc28^{}"]) !==
    "6a713a74b40841635bbce98cc96340feeeb80bda") {
    throw new Error("v1-rc28 no longer resolves to the authoritative commit");
  }
  const dirty = worktreePaths();
  if (dirty.length > 0) {
    throw new Error(
      `Initial source-refresh apply requires the exact clean commit-1 tree; found:\n${dirty.join("\n")}`,
    );
  }
  const temporaryRoot = mkdtempSync(
    join(tmpdir(), "mta-relationship-source-refresh-"),
  );
  try {
    const { candidateDir, loaded } = verifyCandidateCompleteness(
      input.path,
      input.receipt,
      temporaryRoot,
    );
    const candidateDb = join(temporaryRoot, "candidate.db");
    const database = buildCandidateDatabase(candidateDb, loaded);
    const overlayRoot = join(temporaryRoot, "overlay");
    mkdirSync(overlayRoot, { recursive: true });
    linkTree(join(repoRoot, "data"), join(overlayRoot, "data"));
    linkTree(join(repoRoot, "schemas"), join(overlayRoot, "schemas"));
    for (const name of [
      "manifest.json",
      "summary.json",
      "report.md",
    ]) {
      replaceOverlayFile(
        overlayRoot,
        `${COMPLETENESS_ROOT}/${name}`,
        join(candidateDir, name),
      );
    }
    replaceOverlayFile(
      overlayRoot,
      "data/canonical.db",
      candidateDb,
    );
    const canonicalReceiptPath = `${RECEIPT_ROOT}/${input.hash}.json`;
    const overlayReceiptPath = join(overlayRoot, canonicalReceiptPath);
    mkdirSync(dirname(overlayReceiptPath), { recursive: true });
    writeFileSync(overlayReceiptPath, input.text, "utf8");
    const archivePaths = archiveActiveProof(
      overlayRoot,
      input.receipt,
    );
    const built = generateRelationshipEnforcementProofV1(
      "apply",
      overlayRoot,
      {
        sourceRefreshReceiptPath: canonicalReceiptPath,
        canonicalDbPath: join(overlayRoot, "data/canonical.db"),
      },
    );
    generateRelationshipReleaseBundleV1("apply", overlayRoot);

    const candidates = new Map<string, string>();
    for (const name of ["manifest.json", "summary.json", "report.md"]) {
      candidates.set(
        `${COMPLETENESS_ROOT}/${name}`,
        join(overlayRoot, COMPLETENESS_ROOT, name),
      );
    }
    candidates.set(canonicalReceiptPath, overlayReceiptPath);
    for (const path of archivePaths) {
      candidates.set(path, join(overlayRoot, path));
    }
    for (const path of built.contents.keys()) {
      candidates.set(path, join(overlayRoot, path));
    }
    candidates.set(
      "data/contracts/relationships/v1/release-bundle-sources.json",
      relationshipReleaseBundleDescriptorPath(overlayRoot),
    );
    const changed = changedCandidate(candidates);
    const changedPaths = [...changed.keys()].sort();
    assertAllowedDestinationSet(
      changedPaths,
      input.hash,
      input.receipt.previous_active_proof.sha256,
    );

    const baseCommit = runGit(["rev-parse", "HEAD"]);
    const treeListing = runGit(["ls-tree", "-r", "--full-tree", "HEAD"]);
    const baseTree = sha256(treeListing);
    const sidecarRelative =
      `${CANONICAL_DB_SOURCE_REFRESH_SIDECAR}/${input.hash}`;
    const sidecar = join(repoRoot, sidecarRelative);
    if (existsSync(sidecar)) {
      throw new Error(
        `Source-refresh durable sidecar already exists without an active marker: ${sidecarRelative}`,
      );
    }
    mkdirSync(join(sidecar, "tracked"), { recursive: true });
    const destinations = changedPaths.map((path) => {
      const source = changed.get(path)!;
      const staged = join(sidecar, "tracked", path);
      mkdirSync(dirname(staged), { recursive: true });
      copyFileSync(source, staged);
      const current = join(repoRoot, path);
      return {
        path,
        previous_sha256: existsSync(current)
          ? canonicalDbSourceRefreshFileSha256(current)
          : null,
        current_sha256: canonicalDbSourceRefreshFileSha256(staged),
      };
    });
    const stagedDbRelative = "candidate.db";
    copyFileSync(candidateDb, join(sidecar, stagedDbRelative));
    if (
      canonicalDbSourceRefreshFileSha256(join(sidecar, stagedDbRelative)) !==
        database.sha256
    ) {
      throw new Error("Durable candidate DB copy verification failed");
    }
    const marker: CanonicalDbSourceRefreshMarker = {
      schema_version: 1,
      receipt_sha256: input.hash,
      base_commit: baseCommit,
      base_tree: baseTree,
      staged_root: sidecarRelative,
      tracked_destinations: destinations,
      candidate_db: {
        path: stagedDbRelative,
        sha256: database.sha256,
        record_count: database.recordCount,
        relation_count: database.relationCount,
        completeness_input_fingerprint:
          database.completenessInputFingerprint,
      },
      completed_operations: [],
    };
    writeFileSync(
      join(sidecar, "transaction-marker.json"),
      json(marker as unknown as JsonValue),
      "utf8",
    );
    writeCanonicalDbSourceRefreshMarker(marker);
    const completedMarker = resumeTransaction(marker, input.hash);
    writeFileSync(
      join(sidecar, "completed-marker.json"),
      json(completedMarker as unknown as JsonValue),
      "utf8",
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--receipt") {
      throw new Error(
        "Usage: bun scripts/apply-relationship-enforcement-source-refresh.ts --receipt <path>",
      );
    }
    index += 1;
  }
  const input = receiptPathAndValue(optionValue(args, "--receipt"));
  const activeMarker = readCanonicalDbSourceRefreshMarker();
  if (activeMarker) {
    const completedMarker = resumeTransaction(activeMarker, input.hash);
    const installedSidecar = join(
      repoRoot,
      CANONICAL_DB_SOURCE_REFRESH_SIDECAR,
      input.hash,
    );
    writeFileSync(
      join(installedSidecar, "completed-marker.json"),
      json(completedMarker as unknown as JsonValue),
      "utf8",
    );
  } else {
    const durableSidecar = join(
      repoRoot,
      CANONICAL_DB_SOURCE_REFRESH_SIDECAR,
      input.hash,
    );
    if (existsSync(durableSidecar)) {
      const completedPath = join(
        durableSidecar,
        "completed-marker.json",
      );
      const transactionPath = join(
        durableSidecar,
        "transaction-marker.json",
      );
      const markerPath = existsSync(completedPath)
        ? completedPath
        : transactionPath;
      if (existsSync(markerPath)) {
        const marker = parseCanonicalDbSourceRefreshMarker(JSON.parse(
          readFileSync(markerPath, "utf8"),
        ) as unknown);
        if (
          marker.receipt_sha256 !== input.hash ||
          marker.staged_root !==
            `${CANONICAL_DB_SOURCE_REFRESH_SIDECAR}/${input.hash}`
        ) {
          throw new Error(
            "Durable source-refresh marker does not match the requested receipt",
          );
        }
        process.env[CANONICAL_DB_SOURCE_REFRESH_AUTHORIZATION_ENV] =
          input.hash;
        verifyInstalled(marker);
        delete process.env[CANONICAL_DB_SOURCE_REFRESH_AUTHORIZATION_ENV];
        const completedMarker = asCompletedMarker(marker);
        if (!existsSync(completedPath)) {
          writeFileSync(
            completedPath,
            json(completedMarker as unknown as JsonValue),
            "utf8",
          );
        } else if (
          readFileSync(completedPath, "utf8") !==
            json(completedMarker as unknown as JsonValue)
        ) {
          throw new Error(
            "Durable completed marker has an incomplete or conflicting operation set",
          );
        }
        console.log(`Source-refresh ${input.hash} is already fully installed.`);
        process.exit(0);
      }
    }
    initialApply(input);
  }
  console.log(`Applied relationship enforcement source refresh ${input.hash}.`);
}
