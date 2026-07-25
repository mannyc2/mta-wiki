import { createHash } from "node:crypto";
import {
  mkdirSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  parseReleaseManifest,
  type ReleaseManifest,
} from "@mta-wiki/pipeline/materialize/export-release";
import { verifyReleaseDirectory } from "@mta-wiki/pipeline/materialize/release-verifier";
import {
  parseStudyReadinessV2Rows,
  type StudyReadinessV2Row,
} from "./study-readiness-v2.js";

export const STUDY_FRONTIER_HANDOFF_SCHEMA_VERSION = 1 as const;
export const STUDY_FRONTIER_HANDOFF_CONTRACT_ID =
  "plan-041-producer-handoff-v1" as const;

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const RELEASE_ID = /^v1-rc[1-9][0-9]*$/u;
const CONTRACT_VERSION_KEYS = [
  "bus_lane_identity_verdicts",
  "operational_anchor_review_decisions",
  "operational_anchors",
  "operational_occurrence_member_extents",
  "operational_occurrence_member_grain",
  "operational_occurrence_review_decisions",
  "operational_occurrences",
  "relationship_integrity_bundle",
  "route_anchors",
  "route_identity_snapshot",
] as const;

type ContractVersionKey = typeof CONTRACT_VERSION_KEYS[number];

export type FilePin = {
  path: string;
  sha256: string;
  bytes: number;
};

export type RowFilePin = FilePin & {
  row_count: number;
};

export type CandidateFilePin = FilePin & {
  candidate_count: number;
};

export type StudyFrontierProducerHandoff = {
  schema_version: 1;
  contract_id: typeof STUDY_FRONTIER_HANDOFF_CONTRACT_ID;
  release_id: string;
  manifest_sha256: string;
  generator_commit: string;
  contract_versions: Record<ContractVersionKey, number>;
  transport: {
    mode: "repository_local";
    manifest: FilePin;
  };
  artifacts: {
    occurrence: RowFilePin;
    member_extent: RowFilePin;
    member_grain: RowFilePin;
    identity_verdict: RowFilePin;
  };
  fixtures: {
    member_grain: RowFilePin;
    identity_verdict: RowFilePin;
  };
  bridge_v2: CandidateFilePin;
  closure_reconciliation: CandidateFilePin;
  frontier_exception_count: 0;
  post_cut_determinism_anchor: string;
  evidence_policy: {
    exact_positive_required: true;
    authoritative_historical_full_stop_inventory_required: true;
    stop_id_equivalence_acquisition_required: true;
    occurrence_inference_prohibited: true;
  };
  authority: {
    authorizes_study: false;
    authorizes_cross_product: false;
    authorizes_occurrence: false;
    authorizes_publication: false;
  };
};

export type StudyFrontierHandoffVerification = {
  schema_version: 1;
  status: "verified";
  transport_mode: "repository_local";
  release_id: string;
  manifest_sha256: string;
  manifest_version: number;
  verified_release_file_count: number;
  verified_artifact_count: number;
  verified_candidate_count: number;
};

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    stableJson(actual as JsonValue) !== stableJson(wanted as JsonValue)
  ) {
    throw new Error(
      `${path}: exact fields required; expected ${wanted.join(", ")}, found ${actual.join(", ")}`,
    );
  }
}

function string(
  value: unknown,
  path: string,
  pattern?: RegExp,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    (pattern !== undefined && !pattern.test(value))
  ) {
    throw new Error(`${path}: invalid string`);
  }
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${path}: expected positive integer`);
  }
  return value;
}

function repositoryRelativePath(value: unknown, path: string): string {
  const parsed = string(value, path);
  if (
    isAbsolute(parsed) ||
    /^[a-zA-Z]:/u.test(parsed) ||
    parsed.includes("\\") ||
    parsed.includes("\0") ||
    parsed.split("/").some((segment) =>
      segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    throw new Error(`${path}: expected safe repository-relative path`);
  }
  return parsed;
}

function parseFilePin(value: unknown, path: string): FilePin {
  const pin = object(value, path);
  exactKeys(pin, ["bytes", "path", "sha256"], path);
  return {
    path: repositoryRelativePath(pin.path, `${path}.path`),
    sha256: string(pin.sha256, `${path}.sha256`, SHA256),
    bytes: positiveInteger(pin.bytes, `${path}.bytes`),
  };
}

function parseRowFilePin(value: unknown, path: string): RowFilePin {
  const pin = object(value, path);
  exactKeys(pin, ["bytes", "path", "row_count", "sha256"], path);
  return {
    path: repositoryRelativePath(pin.path, `${path}.path`),
    sha256: string(pin.sha256, `${path}.sha256`, SHA256),
    bytes: positiveInteger(pin.bytes, `${path}.bytes`),
    row_count: positiveInteger(pin.row_count, `${path}.row_count`),
  };
}

function parseCandidateFilePin(
  value: unknown,
  path: string,
): CandidateFilePin {
  const pin = object(value, path);
  exactKeys(pin, ["bytes", "candidate_count", "path", "sha256"], path);
  return {
    path: repositoryRelativePath(pin.path, `${path}.path`),
    sha256: string(pin.sha256, `${path}.sha256`, SHA256),
    bytes: positiveInteger(pin.bytes, `${path}.bytes`),
    candidate_count: positiveInteger(
      pin.candidate_count,
      `${path}.candidate_count`,
    ),
  };
}

export function parseStudyFrontierProducerHandoff(
  value: unknown,
): StudyFrontierProducerHandoff {
  const root = object(value, "$root");
  exactKeys(
    root,
    [
      "artifacts",
      "authority",
      "bridge_v2",
      "closure_reconciliation",
      "contract_id",
      "contract_versions",
      "evidence_policy",
      "fixtures",
      "frontier_exception_count",
      "generator_commit",
      "manifest_sha256",
      "post_cut_determinism_anchor",
      "release_id",
      "schema_version",
      "transport",
    ],
    "$root",
  );
  if (
    root.schema_version !== STUDY_FRONTIER_HANDOFF_SCHEMA_VERSION ||
    root.contract_id !== STUDY_FRONTIER_HANDOFF_CONTRACT_ID
  ) {
    throw new Error("$root: invalid Plan 041 producer handoff identity");
  }

  const versions = object(root.contract_versions, "contract_versions");
  exactKeys(versions, CONTRACT_VERSION_KEYS, "contract_versions");
  const contractVersions = Object.fromEntries(
    CONTRACT_VERSION_KEYS.map((key) => [
      key,
      positiveInteger(versions[key], `contract_versions.${key}`),
    ]),
  ) as Record<ContractVersionKey, number>;

  const transport = object(root.transport, "transport");
  exactKeys(transport, ["manifest", "mode"], "transport");
  if (transport.mode !== "repository_local") {
    throw new Error("transport.mode: repository_local required");
  }

  const artifacts = object(root.artifacts, "artifacts");
  exactKeys(
    artifacts,
    ["identity_verdict", "member_extent", "member_grain", "occurrence"],
    "artifacts",
  );
  const fixtures = object(root.fixtures, "fixtures");
  exactKeys(fixtures, ["identity_verdict", "member_grain"], "fixtures");

  const policy = object(root.evidence_policy, "evidence_policy");
  exactKeys(
    policy,
    [
      "authoritative_historical_full_stop_inventory_required",
      "exact_positive_required",
      "occurrence_inference_prohibited",
      "stop_id_equivalence_acquisition_required",
    ],
    "evidence_policy",
  );
  if (
    policy.exact_positive_required !== true ||
    policy.authoritative_historical_full_stop_inventory_required !== true ||
    policy.stop_id_equivalence_acquisition_required !== true ||
    policy.occurrence_inference_prohibited !== true
  ) {
    throw new Error("evidence_policy: all fail-closed requirements must be true");
  }

  const authority = object(root.authority, "authority");
  exactKeys(
    authority,
    [
      "authorizes_cross_product",
      "authorizes_occurrence",
      "authorizes_publication",
      "authorizes_study",
    ],
    "authority",
  );
  if (
    authority.authorizes_study !== false ||
    authority.authorizes_cross_product !== false ||
    authority.authorizes_occurrence !== false ||
    authority.authorizes_publication !== false
  ) {
    throw new Error("authority: every authority flag must be false");
  }
  if (root.frontier_exception_count !== 0) {
    throw new Error("frontier_exception_count: closure handoff requires zero");
  }

  return {
    schema_version: 1,
    contract_id: STUDY_FRONTIER_HANDOFF_CONTRACT_ID,
    release_id: string(root.release_id, "release_id", RELEASE_ID),
    manifest_sha256: string(
      root.manifest_sha256,
      "manifest_sha256",
      SHA256,
    ),
    generator_commit: string(
      root.generator_commit,
      "generator_commit",
      COMMIT,
    ),
    contract_versions: contractVersions,
    transport: {
      mode: "repository_local",
      manifest: parseFilePin(transport.manifest, "transport.manifest"),
    },
    artifacts: {
      occurrence: parseRowFilePin(
        artifacts.occurrence,
        "artifacts.occurrence",
      ),
      member_extent: parseRowFilePin(
        artifacts.member_extent,
        "artifacts.member_extent",
      ),
      member_grain: parseRowFilePin(
        artifacts.member_grain,
        "artifacts.member_grain",
      ),
      identity_verdict: parseRowFilePin(
        artifacts.identity_verdict,
        "artifacts.identity_verdict",
      ),
    },
    fixtures: {
      member_grain: parseRowFilePin(
        fixtures.member_grain,
        "fixtures.member_grain",
      ),
      identity_verdict: parseRowFilePin(
        fixtures.identity_verdict,
        "fixtures.identity_verdict",
      ),
    },
    bridge_v2: parseCandidateFilePin(root.bridge_v2, "bridge_v2"),
    closure_reconciliation: parseCandidateFilePin(
      root.closure_reconciliation,
      "closure_reconciliation",
    ),
    frontier_exception_count: 0,
    post_cut_determinism_anchor: string(
      root.post_cut_determinism_anchor,
      "post_cut_determinism_anchor",
      SHA256,
    ),
    evidence_policy: {
      exact_positive_required: true,
      authoritative_historical_full_stop_inventory_required: true,
      stop_id_equivalence_acquisition_required: true,
      occurrence_inference_prohibited: true,
    },
    authority: {
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_occurrence: false,
      authorizes_publication: false,
    },
  };
}

function resolveRepositoryFile(rootDir: string, path: string): string {
  const root = realpathSync(resolve(rootDir));
  const resolved = resolve(root, path);
  if (resolved === root || !resolved.startsWith(`${root}${sep}`)) {
    throw new Error(`${path}: addressed path escapes repository root`);
  }
  const status = lstatSync(resolved);
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error(`${path}: addressed path must be a regular non-symlink file`);
  }
  const real = realpathSync(resolved);
  if (!real.startsWith(`${root}${sep}`)) {
    throw new Error(`${path}: addressed path resolves outside repository root`);
  }
  return real;
}

function resolveRepositoryDirectory(rootDir: string, path: string): string {
  const root = realpathSync(resolve(rootDir));
  const resolved = resolve(root, path);
  if (resolved === root || !resolved.startsWith(`${root}${sep}`)) {
    throw new Error(`${path}: addressed path escapes repository root`);
  }
  const status = lstatSync(resolved);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(
      `${path}: addressed path must be a regular non-symlink directory`,
    );
  }
  const real = realpathSync(resolved);
  if (!real.startsWith(`${root}${sep}`)) {
    throw new Error(`${path}: addressed path resolves outside repository root`);
  }
  return real;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function lineCount(bytes: Buffer): number {
  return bytes.toString("utf8").split(/\r?\n/u).filter(Boolean).length;
}

function verifyFilePin(rootDir: string, pin: FilePin): Buffer {
  const path = resolveRepositoryFile(rootDir, pin.path);
  const bytes = readFileSync(path);
  if (bytes.length !== pin.bytes) {
    throw new Error(`${pin.path}: byte count mismatch`);
  }
  if (sha256(bytes) !== pin.sha256) {
    throw new Error(`${pin.path}: SHA-256 mismatch`);
  }
  return bytes;
}

function verifyRowPin(rootDir: string, pin: RowFilePin): Buffer {
  const bytes = verifyFilePin(rootDir, pin);
  if (lineCount(bytes) !== pin.row_count) {
    throw new Error(`${pin.path}: row count mismatch`);
  }
  return bytes;
}

function reconciliationCandidateIds(bytes: Buffer): string[] {
  const ids = bytes.toString("utf8").split(/\r?\n/u).flatMap((line) => {
    const match = /^\| (study-event-v2:[^ |]+) \|/u.exec(line);
    return match?.[1] ? [match[1]] : [];
  });
  if (new Set(ids).size !== ids.length) {
    throw new Error("closure reconciliation contains duplicate candidate rows");
  }
  return ids;
}

function releaseRelativePath(
  releaseDir: string,
  rootDir: string,
  path: string,
): string {
  const absolute = resolveRepositoryFile(rootDir, path);
  const relativePath = relative(releaseDir, absolute).replaceAll("\\", "/");
  if (
    relativePath.startsWith("../") ||
    relativePath === ".." ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`${path}: transport artifact is outside the release`);
  }
  return relativePath;
}

function verifyAddressedReleasePin(
  manifest: ReleaseManifest,
  releaseDir: string,
  rootDir: string,
  pin: FilePin,
): void {
  const path = releaseRelativePath(releaseDir, rootDir, pin.path);
  const addressed = manifest.files[path];
  if (
    addressed === undefined ||
    addressed.bytes !== pin.bytes ||
    addressed.sha256 !== pin.sha256
  ) {
    throw new Error(`${pin.path}: not identically addressed by release manifest`);
  }
}

function expectedReleaseArtifactPaths(
  receipt: StudyFrontierProducerHandoff,
  manifest: ReleaseManifest,
): Record<
  keyof StudyFrontierProducerHandoff["artifacts"] | "bridge_v2",
  string
> {
  const releasePrefix = `data/exports/releases/${receipt.release_id}`;
  const pointer = (name: keyof ReleaseManifest["pointers"]): string => {
    const value = manifest.pointers[name];
    if (typeof value !== "string") {
      throw new Error(`release manifest pointer ${name}: addressed path required`);
    }
    return value;
  };
  return {
    occurrence:
      `${releasePrefix}/${pointer("operational_occurrences")}`,
    member_extent:
      `${releasePrefix}/${dirname(pointer("operational_occurrence_member_extents"))}` +
      "/operational_occurrence_member_extents.jsonl",
    member_grain:
      `${releasePrefix}/${dirname(pointer("operational_occurrence_member_grain"))}` +
      "/operational_occurrence_member_grain.jsonl",
    identity_verdict:
      `${releasePrefix}/${dirname(pointer("bus_lane_identity_verdicts"))}` +
      "/bus_lane_identity_verdicts.jsonl",
    bridge_v2:
      `${releasePrefix}/${dirname(pointer("study_readiness_v2"))}` +
      "/bridge-ledger.jsonl",
  };
}

export function verifyStudyFrontierProducerHandoff(
  receiptPath = "data/quality/study-frontier-closure/plan-041-producer-handoff.json",
  options: { rootDir?: string } = {},
): StudyFrontierHandoffVerification {
  const rootDir = resolve(options.rootDir ?? repoRoot);
  const receiptBytes = readFileSync(resolveRepositoryFile(rootDir, receiptPath));
  const receipt = parseStudyFrontierProducerHandoff(
    JSON.parse(receiptBytes.toString("utf8")) as unknown,
  );

  const manifestBytes = verifyFilePin(rootDir, receipt.transport.manifest);
  if (receipt.transport.manifest.sha256 !== receipt.manifest_sha256) {
    throw new Error("transport manifest and handoff manifest SHA-256 disagree");
  }
  const expectedManifestPath =
    `data/exports/releases/${receipt.release_id}/manifest.json`;
  if (receipt.transport.manifest.path !== expectedManifestPath) {
    throw new Error(
      `transport manifest path must be ${expectedManifestPath}`,
    );
  }
  const manifest = parseReleaseManifest(
    JSON.parse(manifestBytes.toString("utf8")) as unknown,
  );
  if (
    manifest.release_id !== receipt.release_id ||
    manifest.generator_commit !== receipt.generator_commit ||
    stableJson(manifest.contract_versions as unknown as JsonValue) !==
      stableJson(receipt.contract_versions as unknown as JsonValue)
  ) {
    throw new Error("handoff identity does not match release manifest");
  }

  const releaseDir = dirname(
    resolveRepositoryFile(rootDir, receipt.transport.manifest.path),
  );
  const releaseVerification = verifyReleaseDirectory(
    releaseDir,
    receipt.release_id,
    { sourceRootDir: rootDir },
  );
  if (releaseVerification.manifest_sha256 !== receipt.manifest_sha256) {
    throw new Error("release verifier manifest identity mismatch");
  }

  const expectedPaths = expectedReleaseArtifactPaths(receipt, manifest);
  const rowPins = {
    occurrence: receipt.artifacts.occurrence,
    member_extent: receipt.artifacts.member_extent,
    member_grain: receipt.artifacts.member_grain,
    identity_verdict: receipt.artifacts.identity_verdict,
  };
  for (const [role, pin] of Object.entries(rowPins)) {
    if (
      pin.path !== expectedPaths[role as keyof typeof rowPins]
    ) {
      throw new Error(`${role}: handoff path does not match release pointer`);
    }
    verifyRowPin(rootDir, pin);
    verifyAddressedReleasePin(manifest, releaseDir, rootDir, pin);
  }

  for (const pin of Object.values(receipt.fixtures)) {
    verifyRowPin(rootDir, pin);
    verifyAddressedReleasePin(manifest, releaseDir, rootDir, pin);
  }

  if (receipt.bridge_v2.path !== expectedPaths.bridge_v2) {
    throw new Error("bridge_v2: handoff path does not match release pointer");
  }
  const bridgeBytes = verifyFilePin(rootDir, receipt.bridge_v2);
  const bridgeRows = parseStudyReadinessV2Rows(
    bridgeBytes.toString("utf8"),
    receipt.bridge_v2.path,
  );
  if (bridgeRows.length !== receipt.bridge_v2.candidate_count) {
    throw new Error("bridge_v2: candidate count mismatch");
  }
  verifyAddressedReleasePin(
    manifest,
    releaseDir,
    rootDir,
    receipt.bridge_v2,
  );

  const reconciliationBytes = verifyFilePin(
    rootDir,
    receipt.closure_reconciliation,
  );
  const reconciliationIds = reconciliationCandidateIds(reconciliationBytes);
  if (
    reconciliationIds.length !==
      receipt.closure_reconciliation.candidate_count ||
    stableJson(reconciliationIds as JsonValue) !==
      stableJson(bridgeRows.map((row) => row.candidate_id) as JsonValue)
  ) {
    throw new Error(
      "closure reconciliation: candidate denominator does not match bridge v2",
    );
  }

  const exceptionPointer = manifest.pointers.frontier_exceptions;
  if (typeof exceptionPointer !== "string") {
    throw new Error("release manifest requires an addressed frontier exception stamp");
  }
  const exceptionBytes = readFileSync(resolve(releaseDir, exceptionPointer));
  const exceptionStamp = object(
    JSON.parse(exceptionBytes.toString("utf8")) as unknown,
    "frontier_exceptions",
  );
  exactKeys(exceptionStamp, ["exceptions", "schema_version"], "frontier_exceptions");
  if (
    exceptionStamp.schema_version !== 1 ||
    !Array.isArray(exceptionStamp.exceptions) ||
    exceptionStamp.exceptions.length !== receipt.frontier_exception_count
  ) {
    throw new Error("frontier exception stamp is not the required empty v1 stamp");
  }

  return {
    schema_version: 1,
    status: "verified",
    transport_mode: "repository_local",
    release_id: receipt.release_id,
    manifest_sha256: receipt.manifest_sha256,
    manifest_version: manifest.manifest_version,
    verified_release_file_count: releaseVerification.verified_file_count,
    verified_artifact_count: 9,
    verified_candidate_count: bridgeRows.length,
  };
}

function filePin(rootDir: string, path: string): FilePin {
  const absolute = resolveRepositoryFile(rootDir, path);
  const bytes = readFileSync(absolute);
  return {
    path,
    sha256: sha256(bytes),
    bytes: statSync(absolute).size,
  };
}

function rowFilePin(rootDir: string, path: string): RowFilePin {
  const pin = filePin(rootDir, path);
  return {
    ...pin,
    row_count: lineCount(readFileSync(resolveRepositoryFile(rootDir, path))),
  };
}

function histogram(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function markdown(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|")
    .replaceAll(/\r?\n/gu, " ");
}

function closingArtifact(row: StudyReadinessV2Row): string {
  const closing = row.closing_artifacts;
  const parts: string[] = [];
  if (closing.identity_verdict) {
    parts.push(
      `identity verdict ${closing.identity_verdict.verdict}`,
      `decision ${closing.identity_verdict.decision_id ?? "none"}`,
      `receipts ${closing.identity_verdict.receipt_ids.join(", ")}`,
    );
    if (closing.identity_verdict.occurrence_id) {
      parts.push(`occurrence ${closing.identity_verdict.occurrence_id}`);
    }
  }
  for (const extent of closing.member_extents) {
    parts.push(
      `extent ${extent.extent_id} (${extent.verdict}; decision ${
        extent.decision_id ?? "none"
      }; receipts ${extent.receipt_ids.join(", ") || "none"})`,
    );
  }
  if (closing.prior_decision_or_release_id) {
    parts.push(`prior approval ${closing.prior_decision_or_release_id}`);
  }
  const occurrenceId = row.occurrence_id;
  if (parts.length === 0 && typeof occurrenceId === "string" && occurrenceId) {
    parts.push(`occurrence ${occurrenceId}`);
  }
  if (parts.length === 0) {
    parts.push("tracker-owned terminal residue; no producer-created closing artifact");
  }
  return parts.join("; ");
}

function closureReport(
  releaseId: string,
  manifestSha256: string,
  rows: readonly StudyReadinessV2Row[],
): string {
  const dispositions = histogram(
    rows.map((row) => row.downstream_disposition),
  );
  const sourceFixable = rows.filter((row) =>
    row.downstream_disposition.startsWith("source_fixable_")
  );
  if (sourceFixable.length > 0) {
    throw new Error(
      `closure report refuses ${sourceFixable.length} source-fixable row(s)`,
    );
  }
  const residue = [
    "tracker_owned_spine_or_pattern",
    "tracker_owned_outcome_calendar",
    "quarantined_later_ace_phase",
  ].map((disposition) =>
    `- \`${disposition}\`: ${dispositions[disposition] ?? 0}`
  );
  const distribution = Object.entries(dispositions).map(([key, count]) =>
    `- \`${key}\`: ${count}`
  );
  const table = rows.map((row) =>
    `| ${markdown(row.candidate_id)} | ${
      markdown(row.prior_disposition)
    } | ${markdown(row.downstream_disposition)} | ${
      markdown(closingArtifact(row))
    } |`
  );
  return [
    `# Study frontier closure reconciliation: ${releaseId}`,
    "",
    `Release \`${releaseId}\` is pinned by manifest SHA-256 \`${manifestSha256}\`.`,
    `This report reconciles all ${rows.length} candidates in the frozen downstream universe.`,
    "The closure release has zero frontier exceptions and zero source-fixable dispositions.",
    "",
    "This artifact grants no study, occurrence, cross-product, or publication authority.",
    "Any later positive admission still requires exact-positive evidence, an authoritative",
    "historical full-stop inventory, and reviewed stop-ID-equivalence acquisition.",
    "Immutable prior receipts, unresolved bindings, source gaps, and nonexclusive context remain",
    "preserved; absence and context never imply an occurrence.",
    "",
    "## Final disposition distribution",
    "",
    ...distribution,
    "",
    "## Legitimate tracker-owned residue",
    "",
    ...residue,
    "",
    "These rows are terminal at the producer boundary and remain owned by the",
    "tracker's spine/pattern, outcome-calendar, or later-ACE-phase review layers.",
    "",
    "## Candidate reconciliation",
    "",
    "| Candidate id | Prior disposition | Final disposition | Closing artifact |",
    "| --- | --- | --- | --- |",
    ...table,
    "",
  ].join("\n");
}

export function writeStudyFrontierProducerHandoff(options: {
  releaseId: string;
  postCutDeterminismAnchor: string;
  rootDir?: string;
  receiptPath?: string;
  reconciliationPath?: string;
}): {
  receiptPath: string;
  receiptSha256: string;
  reconciliationPath: string;
  reconciliationSha256: string;
  candidateCount: number;
} {
  const rootDir = resolve(options.rootDir ?? repoRoot);
  if (!RELEASE_ID.test(options.releaseId)) {
    throw new Error(`releaseId: invalid repository-local RC id ${options.releaseId}`);
  }
  if (!SHA256.test(options.postCutDeterminismAnchor)) {
    throw new Error("postCutDeterminismAnchor: expected SHA-256 hex");
  }
  const releasePrefix = `data/exports/releases/${options.releaseId}`;
  const manifestPath = `${releasePrefix}/manifest.json`;
  const manifestPin = filePin(rootDir, manifestPath);
  const manifest = parseReleaseManifest(
    JSON.parse(
      readFileSync(resolveRepositoryFile(rootDir, manifestPath), "utf8"),
    ) as unknown,
  );
  if (manifest.release_id !== options.releaseId) {
    throw new Error("release manifest id mismatch");
  }
  verifyReleaseDirectory(
    resolveRepositoryDirectory(rootDir, releasePrefix),
    options.releaseId,
    { sourceRootDir: rootDir },
  );

  const temporaryReceipt = {
    release_id: options.releaseId,
  } as StudyFrontierProducerHandoff;
  const paths = expectedReleaseArtifactPaths(temporaryReceipt, manifest);
  const bridgeRows = parseStudyReadinessV2Rows(
    readFileSync(
      resolveRepositoryFile(rootDir, paths.bridge_v2),
      "utf8",
    ),
    paths.bridge_v2,
  );
  const reconciliationPath = options.reconciliationPath ??
    `docs/research/study-frontier-closure-${options.releaseId}.md`;
  const reconciliationBytes = closureReport(
    options.releaseId,
    manifestPin.sha256,
    bridgeRows,
  );
  const reconciliationAbsolute = resolve(rootDir, reconciliationPath);
  mkdirSync(dirname(reconciliationAbsolute), { recursive: true });
  writeFileSync(reconciliationAbsolute, reconciliationBytes);

  const fixtureBase =
    `${releasePrefix}/study-frontier-closure/data/contracts`;
  const receipt: StudyFrontierProducerHandoff = {
    schema_version: 1,
    contract_id: STUDY_FRONTIER_HANDOFF_CONTRACT_ID,
    release_id: options.releaseId,
    manifest_sha256: manifestPin.sha256,
    generator_commit: manifest.generator_commit,
    contract_versions: Object.fromEntries(
      CONTRACT_VERSION_KEYS.map((key) => {
        const version = manifest.contract_versions[key];
        if (version === undefined) {
          throw new Error(`release manifest lacks contract version ${key}`);
        }
        return [key, version];
      }),
    ) as Record<ContractVersionKey, number>,
    transport: {
      mode: "repository_local",
      manifest: manifestPin,
    },
    artifacts: {
      occurrence: rowFilePin(rootDir, paths.occurrence),
      member_extent: rowFilePin(rootDir, paths.member_extent),
      member_grain: rowFilePin(rootDir, paths.member_grain),
      identity_verdict: rowFilePin(rootDir, paths.identity_verdict),
    },
    fixtures: {
      member_grain: rowFilePin(
        rootDir,
        `${fixtureBase}/operational-occurrence-member-grain/v1/fixture.jsonl`,
      ),
      identity_verdict: rowFilePin(
        rootDir,
        `${fixtureBase}/bus-lane-identity-verdicts-v1/fixture.jsonl`,
      ),
    },
    bridge_v2: {
      ...filePin(rootDir, paths.bridge_v2),
      candidate_count: bridgeRows.length,
    },
    closure_reconciliation: {
      ...filePin(rootDir, reconciliationPath),
      candidate_count: bridgeRows.length,
    },
    frontier_exception_count: 0,
    post_cut_determinism_anchor: options.postCutDeterminismAnchor,
    evidence_policy: {
      exact_positive_required: true,
      authoritative_historical_full_stop_inventory_required: true,
      stop_id_equivalence_acquisition_required: true,
      occurrence_inference_prohibited: true,
    },
    authority: {
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_occurrence: false,
      authorizes_publication: false,
    },
  };
  parseStudyFrontierProducerHandoff(receipt);
  const receiptPath = options.receiptPath ??
    "data/quality/study-frontier-closure/plan-041-producer-handoff.json";
  const receiptAbsolute = resolve(rootDir, receiptPath);
  mkdirSync(dirname(receiptAbsolute), { recursive: true });
  const receiptBytes = `${
    stableJson(receipt as unknown as JsonValue)
  }\n`;
  writeFileSync(receiptAbsolute, receiptBytes);
  verifyStudyFrontierProducerHandoff(receiptPath, { rootDir });
  return {
    receiptPath,
    receiptSha256: sha256(receiptBytes),
    reconciliationPath,
    reconciliationSha256: sha256(reconciliationBytes),
    candidateCount: bridgeRows.length,
  };
}

export function writeStudyFrontierHandoffVerification(
  outputPath: string,
  verification: StudyFrontierHandoffVerification,
): void {
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(
    resolve(outputPath),
    `${stableJson(verification as unknown as JsonValue)}\n`,
  );
}
