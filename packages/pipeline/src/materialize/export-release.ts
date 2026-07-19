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
  readRouteAnchorReview,
  routeAnchorOverridesPath,
  writeRouteAnchorsJsonl,
  type GtfsRoute,
  type RouteAnchorRow,
  type RouteAnchorOverrides,
  type ReviewedNonGtfsRouteDispositions,
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
  OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_V2_VERSION,
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
  OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_V2_VERSION,
  assertOperationalOccurrenceReviewDecisions,
  loadOperationalOccurrenceAcceptedDecisions,
  operationalOccurrenceReviewDecisions,
  operationalOccurrenceReviewAcceptedDir,
  operationalOccurrenceReviewSnapshotJson,
  proveOperationalOccurrenceV2ReviewProjection,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-review";
import {
  RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION,
  relationshipReleaseBundleDescriptorPath,
  stageRelationshipReleaseBundle,
} from "@mta-wiki/pipeline/materialize/relationship-release-bundle";
import {
  assertOperationalProjectionRetirementsAgainstRouteIdentity,
  loadOperationalProjectionRetirements,
  stageOperationalReviewRetirementArtifacts,
} from "@mta-wiki/pipeline/materialize/operational-projection-retirements";
import { verifyReleaseDirectory } from "@mta-wiki/pipeline/materialize/release-verifier";
import { loadRouteIdentityReleaseProjection } from "@mta-wiki/pipeline/materialize/route-identity-release";

export type ReleaseManifestFile = {
  bytes: number;
  sha256: string;
};

export type ReleaseManifest = {
  manifest_version: 1 | 2 | 3 | 4 | 5;
  release_id: string;
  generator_commit: string;
  contract_versions: {
    operational_anchors?: typeof OPERATIONAL_ANCHOR_SCHEMA_VERSION | undefined;
    operational_anchor_review_decisions?: 1 | 2 | undefined;
    operational_occurrences?: 1 | typeof OPERATIONAL_OCCURRENCE_SCHEMA_VERSION | undefined;
    operational_occurrence_review_decisions?: 1 | 2 | undefined;
    relationship_integrity_bundle?: typeof RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION | undefined;
    route_anchors?: 1 | undefined;
    route_identity_snapshot?: 1 | undefined;
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
    relationship_integrity_bundle?: string | null | undefined;
    route_identity_snapshot?: string | null | undefined;
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
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5) {
    throw new Error("Invalid release manifest manifest_version: expected 1, 2, 3, 4, or 5");
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
        : version === 3
          ? [
            "operational_anchors",
            "operational_anchor_summary",
            "operational_anchor_review_decisions",
            "operational_occurrences",
            "operational_occurrence_summary",
            "operational_occurrence_review_decisions",
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
              "relationship_integrity_bundle",
              ...(version === 5 ? ["route_identity_snapshot"] : []),
            ],
    "pointers",
  );
  const operationalAnchors =
    version >= 3
      ? manifestAddressedPointer(pointersInput.operational_anchors, "pointers.operational_anchors", files)
      : version === 2
        ? manifestPointer(pointersInput.operational_anchors, "pointers.operational_anchors")
        : null;
  const operationalAnchorSummary =
    version >= 3
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
    version >= 3
      ? manifestAddressedPointer(pointersInput.operational_occurrences, "pointers.operational_occurrences", files)
      : null;
  const operationalOccurrenceSummary =
    version >= 3
      ? manifestAddressedPointer(
          pointersInput.operational_occurrence_summary,
          "pointers.operational_occurrence_summary",
          files,
        )
      : null;
  const operationalOccurrenceReviewDecisions =
    version >= 3
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
        : version === 3
          ? [
            "operational_anchors",
            "operational_anchor_review_decisions",
            "operational_occurrences",
            "operational_occurrence_review_decisions",
          ]
          : [
              "operational_anchors",
              "operational_anchor_review_decisions",
              "operational_occurrences",
              "operational_occurrence_review_decisions",
              "relationship_integrity_bundle",
              ...(version === 5 ? ["route_anchors", "route_identity_snapshot"] : []),
            ],
      "contract_versions",
    );
    if (input.operational_anchors !== OPERATIONAL_ANCHOR_SCHEMA_VERSION) {
      throw new Error(`Invalid release manifest contract_versions.operational_anchors: expected ${OPERATIONAL_ANCHOR_SCHEMA_VERSION}`);
    }
    contracts.operational_anchors = OPERATIONAL_ANCHOR_SCHEMA_VERSION;
    if (
      input.operational_anchor_review_decisions !== OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION &&
      (version !== 5 || input.operational_anchor_review_decisions !== OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_V2_VERSION)
    ) {
      throw new Error(
        `Invalid release manifest contract_versions.operational_anchor_review_decisions: expected 1${version === 5 ? " or 2" : ""}`,
      );
    }
    contracts.operational_anchor_review_decisions = input.operational_anchor_review_decisions;
    if (version >= 3) {
      if (input.operational_occurrences !== 1 && input.operational_occurrences !== OPERATIONAL_OCCURRENCE_SCHEMA_VERSION) {
        throw new Error(
          `Invalid release manifest contract_versions.operational_occurrences: expected 1 or ${OPERATIONAL_OCCURRENCE_SCHEMA_VERSION}`,
        );
      }
      contracts.operational_occurrences = input.operational_occurrences;
      if (
        input.operational_occurrence_review_decisions !== OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION &&
        (version !== 5 || input.operational_occurrence_review_decisions !== OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_V2_VERSION)
      ) {
        throw new Error(
          `Invalid release manifest contract_versions.operational_occurrence_review_decisions: expected 1${version === 5 ? " or 2" : ""}`,
        );
      }
      contracts.operational_occurrence_review_decisions = input.operational_occurrence_review_decisions;
      if (
        version === 5 &&
        contracts.operational_anchor_review_decisions !==
          contracts.operational_occurrence_review_decisions
      ) {
        throw new Error(
          "Invalid release manifest operational review contract versions: manifest-v5 requires both review snapshots at v1 or both at v2",
        );
      }
      if (version >= 4) {
        if (input.relationship_integrity_bundle !== RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION) {
          throw new Error(
            `Invalid release manifest contract_versions.relationship_integrity_bundle: expected ${RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION}`,
          );
        }
        contracts.relationship_integrity_bundle = RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION;
      }
      if (version === 5) {
        if (input.route_anchors !== 1 || input.route_identity_snapshot !== 1) throw new Error("Invalid release manifest route contract versions: expected route_anchors and route_identity_snapshot");
        contracts.route_anchors = 1; contracts.route_identity_snapshot = 1;
      }
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
      relationship_integrity_bundle:
        version >= 4
          ? manifestAddressedPointer(
              pointersInput.relationship_integrity_bundle,
              "pointers.relationship_integrity_bundle",
              files,
            )
          : null,
      route_identity_snapshot: version === 5 ? manifestAddressedPointer(pointersInput.route_identity_snapshot, "pointers.route_identity_snapshot", files) : null,
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
  reviewedNonGtfsRouteDispositions?: ReviewedNonGtfsRouteDispositions | undefined;
  operationalAnchorReviewDecisionDir?: string | undefined;
  operationalOccurrenceReviewDecisionDir?: string | undefined;
  operationalOccurrenceIdentityRegistry?: readonly OperationalOccurrenceIdentityEntry[] | undefined;
  gtfsSnapshotId?: string | undefined;
  outputRoot?: string | undefined;
  qualityReport?: string | null | undefined;
  relationshipIntegrityBundleDescriptor?: string | null | undefined;
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
  if (opts.force) throw new Error("Force replacement of release candidate IDs is forbidden");
  if (opts.setLatest && opts.outputRoot) throw new Error("Replay output-root export cannot update LATEST");
  const releasesDir = opts.outputRoot ?? releaseRoot(rootDir);
  const targetDir = join(releasesDir, releaseId);
  if (existsSync(targetDir)) {
    throw new Error("Release " + releaseId + " already exists; choose a new immutable ID");
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
  const routeIdentityRelease = loadRouteIdentityReleaseProjection({
    rootDir,
    records,
    ...(opts.gtfsSnapshotId ? { snapshotId: opts.gtfsSnapshotId } : {}),
  });
  let routeAnchors: RouteAnchorRow[];
  if (routeIdentityRelease) {
    routeAnchors = routeIdentityRelease.routeAnchors;
    writeFileSync(routeAnchorPath, routeIdentityRelease.routeAnchorsBytes, "utf8");
  } else {
    const gtfsRoutes = opts.gtfsRoutes ?? (opts.records ? [] : readGtfsRoutesFromDb());
    const routeAnchorReview =
      opts.routeAnchorOverrides === undefined || opts.reviewedNonGtfsRouteDispositions === undefined
        ? readRouteAnchorReview(routeAnchorOverridesPath(rootDir))
        : undefined;
    const routeAnchorOverrides = opts.routeAnchorOverrides ?? routeAnchorReview?.overrides ?? {};
    const reviewedNonGtfsRouteDispositions =
      opts.reviewedNonGtfsRouteDispositions ?? routeAnchorReview?.non_gtfs_dispositions ?? {};
    routeAnchors = computeRouteAnchors(records, gtfsRoutes, routeAnchorOverrides, reviewedNonGtfsRouteDispositions);
    writeRouteAnchorsJsonl(routeAnchorPath, routeAnchors);
  }
  fileEntries.push(["route_anchors.jsonl", fileMetadata(routeAnchorPath)]);
  let routeIdentitySnapshotPath: string | null = null;
  if (routeIdentityRelease) {
    const routeAnchorMetadata = fileMetadata(routeAnchorPath);
    if (routeIdentityRelease.snapshot.expected_route_anchors_count !== routeAnchors.length || routeIdentityRelease.snapshot.expected_route_anchors_sha256 !== routeAnchorMetadata.sha256) throw new Error("Route identity snapshot does not bind the generated route_anchors compatibility projection");
    routeIdentitySnapshotPath = join(dir, "route_identity_snapshot.json");
    writeFileSync(routeIdentitySnapshotPath, routeIdentityRelease.snapshotBytes, "utf8");
    fileEntries.push(["route_identity_snapshot.json", fileMetadata(routeIdentitySnapshotPath)]);
  }

  const operationalProjectionRetirements = loadOperationalProjectionRetirements(rootDir);
  if (operationalProjectionRetirements.length > 0 && !routeIdentityRelease) {
    throw new Error("Operational projection retirements require an exact route-identity snapshot");
  }
  for (const artifact of stageOperationalReviewRetirementArtifacts(
    rootDir,
    dir,
    operationalProjectionRetirements,
  )) {
    fileEntries.push([artifact.release_path, { bytes: artifact.bytes, sha256: artifact.sha256 }]);
  }

  const acceptedReviewDecisions = assertOperationalAnchorReviewDecisions(
    loadOperationalAnchorReviewDecisions(reviewDecisionDir, {
      rootDir,
      retirements: operationalProjectionRetirements,
    }),
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
    operationalAnchorReviewSnapshotJson(acceptedReviewDecisions, operationalProjectionRetirements),
    "utf8",
  );
  fileEntries.push([
    "operational_anchor_review_decisions.json",
    fileMetadata(operationalAnchorReviewDecisionsPath),
  ]);

  const occurrenceIdentityRegistry =
    opts.operationalOccurrenceIdentityRegistry ??
    loadOperationalOccurrenceIdentityRegistry(operationalOccurrenceIdentityRegistryPath(rootDir));
  if (routeIdentityRelease) {
    assertOperationalProjectionRetirementsAgainstRouteIdentity(
      operationalProjectionRetirements,
      routeIdentityRelease.snapshot,
    );
  }
  const acceptedOccurrenceReviewDecisions = loadOperationalOccurrenceAcceptedDecisions(
    opts.operationalOccurrenceReviewDecisionDir ?? operationalOccurrenceReviewAcceptedDir(rootDir),
    { rootDir, retirements: operationalProjectionRetirements },
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

  const occurrenceV2ReviewProjectionProof = proveOperationalOccurrenceV2ReviewProjection(operationalOccurrences, records);
  const occurrenceReviewDecisions = assertOperationalOccurrenceReviewDecisions(
    operationalOccurrenceReviewDecisions(
      operationalOccurrences,
      acceptedReviewDecisions,
      acceptedOccurrenceReviewDecisions,
      occurrenceV2ReviewProjectionProof,
    ),
    operationalOccurrences,
    occurrenceV2ReviewProjectionProof,
  );
  const operationalOccurrenceReviewDecisionsPath = join(dir, "operational_occurrence_review_decisions.json");
  writeFileSync(
    operationalOccurrenceReviewDecisionsPath,
    operationalOccurrenceReviewSnapshotJson(occurrenceReviewDecisions, operationalProjectionRetirements),
    "utf8",
  );
  fileEntries.push([
    "operational_occurrence_review_decisions.json",
    fileMetadata(operationalOccurrenceReviewDecisionsPath),
  ]);

  const taxonomyPath = join(dir, "taxonomy.json");
  writeFileSync(taxonomyPath, taxonomyJson(), "utf8");
  fileEntries.push(["taxonomy.json", fileMetadata(taxonomyPath)]);

  const configuredRelationshipBundleDescriptor =
    opts.relationshipIntegrityBundleDescriptor === undefined
      ? relationshipReleaseBundleDescriptorPath(rootDir)
      : opts.relationshipIntegrityBundleDescriptor;
  const relationshipBundle =
    configuredRelationshipBundleDescriptor !== null && existsSync(configuredRelationshipBundleDescriptor)
      ? stageRelationshipReleaseBundle(rootDir, dir, configuredRelationshipBundleDescriptor)
      : null;
  const relationshipContractPath = join(
    rootDir,
    "data",
    "contracts",
    "relationships",
    "v1",
    "contract.json",
  );
  if (existsSync(relationshipContractPath)) {
    const relationshipContract = JSON.parse(
      readFileSync(relationshipContractPath, "utf8"),
    ) as { contract_status?: unknown };
    if (
      relationshipContract.contract_status === "enforced" &&
      !relationshipBundle
    ) {
      throw new Error(
        "An enforced relationship contract requires a manifest-v4 content-addressed relationship-integrity bundle",
      );
    }
    if (
      relationshipContract.contract_status !== "warning_first" &&
      relationshipContract.contract_status !== "enforced"
    ) {
      throw new Error(
        `Relationship contract has unsupported status ${String(relationshipContract.contract_status)}`,
      );
    }
  }
  if (
    opts.relationshipIntegrityBundleDescriptor !== undefined &&
    opts.relationshipIntegrityBundleDescriptor !== null &&
    !relationshipBundle
  ) {
    throw new Error(
      `Relationship release bundle descriptor is missing: ${opts.relationshipIntegrityBundleDescriptor}`,
    );
  }
  if (relationshipBundle) {
    for (const file of relationshipBundle.files) {
      fileEntries.push([file.path, { bytes: file.bytes, sha256: file.sha256 }]);
    }
  }

  const manifestVersion = routeIdentitySnapshotPath ? 5 : relationshipBundle ? 4 : 3;
  const manifest: ReleaseManifest = {
    manifest_version: manifestVersion,
    release_id: releaseId,
    generator_commit: gitHeadCommit(),
    contract_versions: {
      operational_anchors: OPERATIONAL_ANCHOR_SCHEMA_VERSION,
      operational_anchor_review_decisions: operationalProjectionRetirements.length > 0
        ? OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_V2_VERSION
        : OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION,
      operational_occurrences: OPERATIONAL_OCCURRENCE_SCHEMA_VERSION,
      operational_occurrence_review_decisions: operationalProjectionRetirements.length > 0
        ? OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_V2_VERSION
        : OPERATIONAL_OCCURRENCE_REVIEW_SNAPSHOT_VERSION,
      ...(routeIdentitySnapshotPath ? { route_anchors: 1 as const, route_identity_snapshot: 1 as const } : {}),
      ...(relationshipBundle
        ? { relationship_integrity_bundle: RELATIONSHIP_RELEASE_BUNDLE_SCHEMA_VERSION }
        : {}),
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
      ...(routeIdentitySnapshotPath ? { route_identity_snapshot: "route_identity_snapshot.json" } : {}),
      ...(relationshipBundle
        ? { relationship_integrity_bundle: relationshipBundle.manifest_path }
        : {}),
    },
  };
  const manifestPath = join(dir, "manifest.json");
  parseReleaseManifest(manifest);
  const manifestBytes = `${stableJson(manifest as unknown as JsonValue)}\n`;
  writeFileSync(manifestPath, manifestBytes, "utf8");
  const manifestSha256 = sha256(manifestBytes);

  verifyReleaseDirectory(dir, releaseId, { sourceRootDir: rootDir });

  installReleaseDirectory(dir, targetDir, false);

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
