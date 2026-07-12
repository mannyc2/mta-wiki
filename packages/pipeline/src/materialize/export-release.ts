import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import { FILE_BY_KIND, readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import {
  computeRouteAnchors,
  readGtfsRoutesFromDb,
  readRouteAnchorOverrides,
  routeAnchorOverridesPath,
  writeRouteAnchorsJsonl,
  type GtfsRoute,
  type RouteAnchorOverrides,
} from "@mta-wiki/pipeline/materialize/route-anchors";
import { taxonomyJson } from "@mta-wiki/pipeline/materialize/export-taxonomy";
import {
  OPERATIONAL_ANCHOR_SCHEMA_VERSION,
  computeOperationalAnchorProjection,
  countOperationalFamilyEvents,
  operationalAnchorSummaryJson,
  summarizeOperationalAnchors,
  writeOperationalAnchorsJsonl,
} from "@mta-wiki/pipeline/materialize/operational-anchors";
import {
  OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION,
  assertOperationalAnchorReviewDecisions,
  loadOperationalAnchorReviewDecisions,
  operationalAnchorReviewSnapshotJson,
} from "@mta-wiki/pipeline/materialize/operational-anchor-review";
import {
  OPERATIONAL_OCCURRENCE_SCHEMA_VERSION,
  computeOperationalOccurrences,
  operationalOccurrenceSummaryJson,
  summarizeOperationalOccurrences,
  writeOperationalOccurrencesJsonl,
} from "@mta-wiki/pipeline/materialize/operational-occurrences";
import {
  loadOperationalOccurrenceIdentityRegistry,
  operationalOccurrenceIdentityRegistryPath,
  type OperationalOccurrenceIdentityEntry,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-identity";
import {
  OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION,
  assertOperationalOccurrenceReviewDecisions,
  loadOperationalOccurrenceAcceptedDecisions,
  operationalOccurrenceReviewDecisions,
  operationalOccurrenceReviewAcceptedDir,
  operationalOccurrenceReviewSnapshotJson,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-review";

export type ReleaseManifestFile = {
  bytes: number;
  sha256: string;
};

export type ReleaseManifest = {
  manifest_version: 1 | 2 | 3;
  release_id: string;
  generator_commit: string;
  contract_versions: {
    operational_anchors?: typeof OPERATIONAL_ANCHOR_SCHEMA_VERSION | undefined;
    operational_anchor_review_decisions?: typeof OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION | undefined;
    operational_occurrences?: typeof OPERATIONAL_OCCURRENCE_SCHEMA_VERSION | undefined;
    operational_occurrence_review_decisions?: typeof OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION | undefined;
  };
  record_counts: Record<string, number>;
  files: Record<string, ReleaseManifestFile>;
  pointers: {
    operational_anchors: string | null;
    operational_anchor_summary: string | null;
    operational_anchor_review_decisions: string | null;
    operational_occurrences: string | null;
    operational_occurrence_summary: string | null;
    operational_occurrence_review_decisions: string | null;
    route_anchors: string | null;
    taxonomy: string | null;
    quality_report: string | null;
  };
};

function manifestObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid release manifest ${path}: expected object`);
  }
  return value as Record<string, unknown>;
}

function manifestString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid release manifest ${path}: expected non-empty string`);
  return value;
}

function manifestRelativePath(value: unknown, path: string): string {
  const pointer = manifestString(value, path);
  if (
    isAbsolute(pointer) ||
    /^[a-zA-Z]:/u.test(pointer) ||
    pointer.includes("\\") ||
    pointer.includes("\0")
  ) {
    throw new Error(`Invalid release manifest ${path}: expected safe release-relative path`);
  }
  const segments = pointer.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid release manifest ${path}: expected safe release-relative path`);
  }
  return pointer;
}

function manifestPointer(value: unknown, path: string): string | null {
  if (value === null) return null;
  return manifestRelativePath(value, path);
}

function manifestAddressedPointer(
  value: unknown,
  path: string,
  files: Readonly<Record<string, ReleaseManifestFile>>,
): string {
  const pointer = manifestRelativePath(value, path);
  if (!Object.hasOwn(files, pointer)) {
    throw new Error(`Invalid release manifest ${path}: no file metadata for ${pointer}`);
  }
  return pointer;
}

function assertManifestKeys(object: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const extras = Object.keys(object).filter((key) => !allowed.includes(key));
  if (extras.length > 0) throw new Error(`Invalid release manifest ${path}: unexpected ${extras.sort().join(", ")}`);
}

export function parseReleaseManifest(value: unknown): ReleaseManifest {
  const root = manifestObject(value, "$root");
  const version = root.manifest_version === undefined ? 1 : root.manifest_version;
  if (version !== 1 && version !== 2 && version !== 3) {
    throw new Error("Invalid release manifest manifest_version: expected 1, 2, or 3");
  }
  assertManifestKeys(
    root,
    version === 1
      ? ["manifest_version", "release_id", "generator_commit", "record_counts", "files", "pointers"]
      : ["manifest_version", "release_id", "generator_commit", "contract_versions", "record_counts", "files", "pointers"],
    "$root",
  );

  const countsInput = manifestObject(root.record_counts, "record_counts");
  const recordCounts: Record<string, number> = {};
  for (const [key, count] of Object.entries(countsInput)) {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new Error(`Invalid release manifest record_counts.${key}: expected non-negative integer`);
    }
    recordCounts[key] = count;
  }

  const filesInput = manifestObject(root.files, "files");
  const files: Record<string, ReleaseManifestFile> = {};
  for (const [name, metadataValue] of Object.entries(filesInput)) {
    manifestRelativePath(name, `files key ${JSON.stringify(name)}`);
    const metadata = manifestObject(metadataValue, `files.${name}`);
    assertManifestKeys(metadata, ["bytes", "sha256"], `files.${name}`);
    if (typeof metadata.bytes !== "number" || !Number.isInteger(metadata.bytes) || metadata.bytes < 0) {
      throw new Error(`Invalid release manifest files.${name}.bytes: expected non-negative integer`);
    }
    const digest = manifestString(metadata.sha256, `files.${name}.sha256`);
    if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error(`Invalid release manifest files.${name}.sha256: expected SHA-256 hex`);
    files[name] = { bytes: metadata.bytes, sha256: digest };
  }

  const pointersInput = manifestObject(root.pointers, "pointers");
  assertManifestKeys(
    pointersInput,
    version === 1
      ? ["route_anchors", "taxonomy", "quality_report"]
      : version === 2
        ? [
          "operational_anchors",
          "operational_anchor_summary",
          "operational_anchor_review_decisions",
          "route_anchors",
          "taxonomy",
          "quality_report",
        ]
        : [
            "operational_anchors",
            "operational_anchor_summary",
            "operational_anchor_review_decisions",
            "operational_occurrences",
            "operational_occurrence_summary",
            "operational_occurrence_review_decisions",
            "route_anchors",
            "taxonomy",
            "quality_report",
          ],
    "pointers",
  );
  const operationalAnchors =
    version === 3
      ? manifestAddressedPointer(pointersInput.operational_anchors, "pointers.operational_anchors", files)
      : version === 2
        ? manifestPointer(pointersInput.operational_anchors, "pointers.operational_anchors")
        : null;
  const operationalAnchorSummary =
    version === 3
      ? manifestAddressedPointer(pointersInput.operational_anchor_summary, "pointers.operational_anchor_summary", files)
      : version === 2
        ? manifestPointer(pointersInput.operational_anchor_summary, "pointers.operational_anchor_summary")
        : null;
  const operationalAnchorReviewDecisions =
    version >= 2
      ? manifestAddressedPointer(
          pointersInput.operational_anchor_review_decisions,
          "pointers.operational_anchor_review_decisions",
          files,
        )
      : null;
  const operationalOccurrences =
    version === 3
      ? manifestAddressedPointer(pointersInput.operational_occurrences, "pointers.operational_occurrences", files)
      : null;
  const operationalOccurrenceSummary =
    version === 3
      ? manifestAddressedPointer(
          pointersInput.operational_occurrence_summary,
          "pointers.operational_occurrence_summary",
          files,
        )
      : null;
  const operationalOccurrenceReviewDecisions =
    version === 3
      ? manifestAddressedPointer(
          pointersInput.operational_occurrence_review_decisions,
          "pointers.operational_occurrence_review_decisions",
          files,
        )
      : null;
  const contracts: ReleaseManifest["contract_versions"] = {};
  if (version >= 2) {
    const input = manifestObject(root.contract_versions, "contract_versions");
    assertManifestKeys(
      input,
      version === 2
        ? ["operational_anchors", "operational_anchor_review_decisions"]
        : [
            "operational_anchors",
            "operational_anchor_review_decisions",
            "operational_occurrences",
            "operational_occurrence_review_decisions",
          ],
      "contract_versions",
    );
    if (input.operational_anchors !== OPERATIONAL_ANCHOR_SCHEMA_VERSION) {
      throw new Error(`Invalid release manifest contract_versions.operational_anchors: expected ${OPERATIONAL_ANCHOR_SCHEMA_VERSION}`);
    }
    contracts.operational_anchors = OPERATIONAL_ANCHOR_SCHEMA_VERSION;
    if (input.operational_anchor_review_decisions !== OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION) {
      throw new Error(
        `Invalid release manifest contract_versions.operational_anchor_review_decisions: expected ${OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION}`,
      );
    }
    contracts.operational_anchor_review_decisions = OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION;
    if (version === 3) {
      if (input.operational_occurrences !== OPERATIONAL_OCCURRENCE_SCHEMA_VERSION) {
        throw new Error(
          `Invalid release manifest contract_versions.operational_occurrences: expected ${OPERATIONAL_OCCURRENCE_SCHEMA_VERSION}`,
        );
      }
      contracts.operational_occurrences = OPERATIONAL_OCCURRENCE_SCHEMA_VERSION;
      if (input.operational_occurrence_review_decisions !== OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION) {
        throw new Error(
          `Invalid release manifest contract_versions.operational_occurrence_review_decisions: expected ${OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION}`,
        );
      }
      contracts.operational_occurrence_review_decisions = OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION;
    }
  }

  return {
    manifest_version: version,
    release_id: manifestString(root.release_id, "release_id"),
    generator_commit: manifestString(root.generator_commit, "generator_commit"),
    contract_versions: contracts,
    record_counts: sortedObject(Object.entries(recordCounts)),
    files: sortedObject(Object.entries(files)),
    pointers: {
      operational_anchors: operationalAnchors,
      operational_anchor_summary: operationalAnchorSummary,
      operational_anchor_review_decisions: operationalAnchorReviewDecisions,
      operational_occurrences: operationalOccurrences,
      operational_occurrence_summary: operationalOccurrenceSummary,
      operational_occurrence_review_decisions: operationalOccurrenceReviewDecisions,
      route_anchors: manifestPointer(pointersInput.route_anchors, "pointers.route_anchors"),
      taxonomy: manifestPointer(pointersInput.taxonomy, "pointers.taxonomy"),
      quality_report: manifestPointer(pointersInput.quality_report, "pointers.quality_report"),
    },
  };
}

export type ReleaseExportResult = {
  dir: string;
  releaseId: string;
  recordCount: number;
  files: number;
  manifestPath: string;
  manifestSha256: string;
};

export type ReleaseExportOptions = {
  force?: boolean | undefined;
  setLatest?: boolean | undefined;
  records?: MtaCanonicalRecord[] | undefined;
  rootDir?: string | undefined;
  gtfsRoutes?: GtfsRoute[] | undefined;
  routeAnchorOverrides?: RouteAnchorOverrides | undefined;
  operationalAnchorReviewDecisionDir?: string | undefined;
  operationalOccurrenceReviewDecisionDir?: string | undefined;
  operationalOccurrenceIdentityRegistry?: readonly OperationalOccurrenceIdentityEntry[] | undefined;
  qualityReport?: string | null | undefined;
};

function recordJson(record: MtaCanonicalRecord): string {
  return stableJson(record as unknown as JsonValue);
}

function sha256(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitHeadCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  if (result.error) throw new Error(`Unable to read generator commit: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`Unable to read generator commit${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout.trim();
}

function releaseRoot(rootDir: string) {
  return join(rootDir, "data", "exports", "releases");
}

function fileMetadata(path: string): ReleaseManifestFile {
  const bytes = readFileSync(path);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function sortedObject<T>(entries: Array<[string, T]>): Record<string, T> {
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

function requiredOperationalAnchorReviewDecisionDir(rootDir: string, configuredDir?: string): string {
  const dir = configuredDir ?? join(rootDir, "data", "operational-anchor-review", "accepted", "decisions");
  if (!existsSync(dir)) {
    throw new Error(`Operational-anchor review decision directory is required for release export: ${dir}`);
  }
  if (!statSync(dir).isDirectory()) {
    throw new Error(`Operational-anchor review decision path must be a directory: ${dir}`);
  }
  return dir;
}

function assertSafeReleaseId(releaseId: string): void {
  if (
    releaseId !== releaseId.trim() ||
    releaseId === "." ||
    releaseId === ".." ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(releaseId)
  ) {
    throw new Error("releaseId must be a safe single path segment");
  }
}

function installReleaseDirectory(tempDir: string, targetDir: string, force: boolean): void {
  if (!existsSync(targetDir)) {
    renameSync(tempDir, targetDir);
    return;
  }
  if (!force) throw new Error("release target appeared while export was in progress");
  const backupDir = `${targetDir}.previous-${randomUUID()}`;
  renameSync(targetDir, backupDir);
  try {
    renameSync(tempDir, targetDir);
  } catch (error) {
    try {
      renameSync(backupDir, targetDir);
    } catch (restoreError) {
      throw new Error(
        `Unable to install release and restore prior cut: ${error instanceof Error ? error.message : String(error)}; ` +
          `restore failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`,
      );
    }
    throw error;
  }
  try {
    rmSync(backupDir, { recursive: true, force: true });
  } catch {
    // The new directory is fully installed. A retained backup is safer than
    // reporting a failed cut after the atomic swap has already succeeded.
  }
}

export function exportRelease(releaseId: string, opts: ReleaseExportOptions = {}): ReleaseExportResult {
  assertSafeReleaseId(releaseId);

  const rootDir = opts.rootDir ?? repoRoot;
  const reviewDecisionDir = requiredOperationalAnchorReviewDecisionDir(rootDir, opts.operationalAnchorReviewDecisionDir);
  const releasesDir = releaseRoot(rootDir);
  const targetDir = join(releasesDir, releaseId);
  if (existsSync(targetDir)) {
    if (!opts.force) throw new Error(`Release ${releaseId} already exists. Use --force to re-cut before publication.`);
  }

  const records = opts.records ?? readCanonicalRecords();
  const byKind = new Map<string, MtaCanonicalRecord[]>();
  for (const record of records) {
    const filename = FILE_BY_KIND.get(record.record_kind);
    if (!filename) throw new Error(`No canonical release filename declared for record kind ${record.record_kind}`);
    const bucket = byKind.get(record.record_kind);
    if (bucket) bucket.push(record);
    else byKind.set(record.record_kind, [record]);
  }

  mkdirSync(releasesDir, { recursive: true });
  const dir = mkdtempSync(join(releasesDir, `.${releaseId}.tmp-`));

  try {
  let recordCount = 0;
  const fileEntries: Array<[string, ReleaseManifestFile]> = [];
  const countEntries: Array<[string, number]> = [];
  for (const [kind, filename] of [...FILE_BY_KIND.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const records = byKind.get(kind) ?? [];
    const sorted = [...records].sort((a, b) => a.record_id.localeCompare(b.record_id));
    const path = join(dir, filename);
    writeFileSync(path, sorted.map(recordJson).join("\n") + (sorted.length > 0 ? "\n" : ""), "utf8");
    recordCount += sorted.length;
    countEntries.push([kind, sorted.length]);
    fileEntries.push([filename, fileMetadata(path)]);
  }

  const routeAnchorPath = join(dir, "route_anchors.jsonl");
  const gtfsRoutes = opts.gtfsRoutes ?? (opts.records ? [] : readGtfsRoutesFromDb());
  const routeAnchorOverrides = opts.routeAnchorOverrides ?? readRouteAnchorOverrides(routeAnchorOverridesPath(rootDir));
  const routeAnchors = computeRouteAnchors(records, gtfsRoutes, routeAnchorOverrides);
  writeRouteAnchorsJsonl(routeAnchorPath, routeAnchors);
  fileEntries.push(["route_anchors.jsonl", fileMetadata(routeAnchorPath)]);

  const acceptedReviewDecisions = assertOperationalAnchorReviewDecisions(
    loadOperationalAnchorReviewDecisions(reviewDecisionDir),
    records,
  );
  const operationalAnchorProjection = computeOperationalAnchorProjection(records, routeAnchors, {
    // Release cuts must validate every accepted decision. A stale/missing
    // canonical binding is a hard error, never a silently omitted anchor.
    reviewDecisions: acceptedReviewDecisions,
  });
  const operationalAnchors = operationalAnchorProjection.rows;
  const operationalAnchorPath = join(dir, "operational_anchors.jsonl");
  writeOperationalAnchorsJsonl(operationalAnchorPath, operationalAnchors);
  fileEntries.push(["operational_anchors.jsonl", fileMetadata(operationalAnchorPath)]);

  const operationalAnchorSummaryPath = join(dir, "operational_anchors_summary.json");
  writeFileSync(
    operationalAnchorSummaryPath,
    operationalAnchorSummaryJson(
      summarizeOperationalAnchors(operationalAnchors, {
        canonicalEventCount: records.filter((record) => record.record_kind === "event").length,
        operationalFamilyEventCount: countOperationalFamilyEvents(records),
        entryGate: operationalAnchorProjection.entry_gate,
      }),
    ),
    "utf8",
  );
  fileEntries.push(["operational_anchors_summary.json", fileMetadata(operationalAnchorSummaryPath)]);

  const operationalAnchorReviewDecisionsPath = join(dir, "operational_anchor_review_decisions.json");
  writeFileSync(
    operationalAnchorReviewDecisionsPath,
    operationalAnchorReviewSnapshotJson(acceptedReviewDecisions),
    "utf8",
  );
  fileEntries.push([
    "operational_anchor_review_decisions.json",
    fileMetadata(operationalAnchorReviewDecisionsPath),
  ]);

  const occurrenceIdentityRegistry =
    opts.operationalOccurrenceIdentityRegistry ??
    loadOperationalOccurrenceIdentityRegistry(operationalOccurrenceIdentityRegistryPath(rootDir));
  const acceptedOccurrenceReviewDecisions = loadOperationalOccurrenceAcceptedDecisions(
    opts.operationalOccurrenceReviewDecisionDir ?? operationalOccurrenceReviewAcceptedDir(rootDir),
  );
  const operationalOccurrences = computeOperationalOccurrences(records, routeAnchors, {
    reviewDecisions: acceptedReviewDecisions,
    occurrenceReviewDecisions: acceptedOccurrenceReviewDecisions,
    identityRegistry: occurrenceIdentityRegistry,
  });
  const operationalOccurrencesPath = join(dir, "operational_occurrences.jsonl");
  writeOperationalOccurrencesJsonl(operationalOccurrencesPath, operationalOccurrences);
  fileEntries.push(["operational_occurrences.jsonl", fileMetadata(operationalOccurrencesPath)]);

  const operationalOccurrenceSummaryPath = join(dir, "operational_occurrences_summary.json");
  writeFileSync(
    operationalOccurrenceSummaryPath,
    operationalOccurrenceSummaryJson(summarizeOperationalOccurrences(operationalOccurrences)),
    "utf8",
  );
  fileEntries.push(["operational_occurrences_summary.json", fileMetadata(operationalOccurrenceSummaryPath)]);

  const occurrenceReviewDecisions = assertOperationalOccurrenceReviewDecisions(
    operationalOccurrenceReviewDecisions(
      operationalOccurrences,
      acceptedReviewDecisions,
      acceptedOccurrenceReviewDecisions,
    ),
    operationalOccurrences,
  );
  const operationalOccurrenceReviewDecisionsPath = join(dir, "operational_occurrence_review_decisions.json");
  writeFileSync(
    operationalOccurrenceReviewDecisionsPath,
    operationalOccurrenceReviewSnapshotJson(occurrenceReviewDecisions),
    "utf8",
  );
  fileEntries.push([
    "operational_occurrence_review_decisions.json",
    fileMetadata(operationalOccurrenceReviewDecisionsPath),
  ]);

  const taxonomyPath = join(dir, "taxonomy.json");
  writeFileSync(taxonomyPath, taxonomyJson(), "utf8");
  fileEntries.push(["taxonomy.json", fileMetadata(taxonomyPath)]);

  const manifest: ReleaseManifest = {
    manifest_version: 3,
    release_id: releaseId,
    generator_commit: gitHeadCommit(),
    contract_versions: {
      operational_anchors: OPERATIONAL_ANCHOR_SCHEMA_VERSION,
      operational_anchor_review_decisions: OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION,
      operational_occurrences: OPERATIONAL_OCCURRENCE_SCHEMA_VERSION,
      operational_occurrence_review_decisions: OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION,
    },
    record_counts: sortedObject(countEntries),
    files: sortedObject(fileEntries),
    pointers: {
      operational_anchors: "operational_anchors.jsonl",
      operational_anchor_summary: "operational_anchors_summary.json",
      operational_anchor_review_decisions: "operational_anchor_review_decisions.json",
      operational_occurrences: "operational_occurrences.jsonl",
      operational_occurrence_summary: "operational_occurrences_summary.json",
      operational_occurrence_review_decisions: "operational_occurrence_review_decisions.json",
      route_anchors: "route_anchors.jsonl",
      taxonomy: "taxonomy.json",
      quality_report: opts.qualityReport ?? null,
    },
  };
  const manifestPath = join(dir, "manifest.json");
  parseReleaseManifest(manifest);
  const manifestBytes = `${stableJson(manifest as unknown as JsonValue)}\n`;
  writeFileSync(manifestPath, manifestBytes, "utf8");
  const manifestSha256 = sha256(manifestBytes);

  installReleaseDirectory(dir, targetDir, Boolean(opts.force));

  // LATEST is the public-release pointer, not a record of the most recent
  // internal cut. Promotion is explicit and happens only after every release
  // artifact and the manifest have been written successfully.
  if (opts.setLatest) {
    const latestTemp = join(releasesDir, `.LATEST.tmp-${randomUUID()}`);
    try {
      writeFileSync(latestTemp, `${releaseId}\n`, "utf8");
      renameSync(latestTemp, join(releasesDir, "LATEST"));
    } finally {
      if (existsSync(latestTemp)) rmSync(latestTemp, { force: true });
    }
  }

  return {
    dir: targetDir,
    releaseId,
    recordCount,
    files: fileEntries.length,
    manifestPath: join(targetDir, "manifest.json"),
    manifestSha256,
  };
  } catch (error) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
