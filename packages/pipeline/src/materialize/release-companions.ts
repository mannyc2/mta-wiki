import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { FILE_BY_KIND } from "./canonical-read.js";
import type { ReleaseManifestFile } from "./export-release.js";

export const OPERATIONAL_OCCURRENCE_MEMBER_EXTENT_SCHEMA_VERSION = 1 as const;
export const RELEASE_QUALITY_PROVENANCE_SCHEMA_VERSION = 1 as const;
export const BUS_LANE_IDENTITY_VERDICT_SCHEMA_VERSION = 1 as const;
export const OPERATIONAL_OCCURRENCE_MEMBER_GRAIN_SCHEMA_VERSION = 1 as const;

export const MEMBER_EXTENT_ROOT = "data/contracts/operational-occurrence-member-extent/v1";
export const MEMBER_EXTENT_MANIFEST = `${MEMBER_EXTENT_ROOT}/manifest.json`;
export const MEMBER_EXTENT_SOURCE_PATHS = [
  `${MEMBER_EXTENT_ROOT}/contract.json`,
  MEMBER_EXTENT_MANIFEST,
  `${MEMBER_EXTENT_ROOT}/operational_occurrence_member_extents.jsonl`,
  `${MEMBER_EXTENT_ROOT}/review-ledger.jsonl`,
  `${MEMBER_EXTENT_ROOT}/summary.json`,
  "data/quality/acquisition/receipts/q45-q86-q87-member-extents-2025.json",
  "data/quality/acquisition/manifests/q45-q86-q87-member-extents-2025.json",
  "data/canonical/treatment_components.jsonl",
  "wiki/sources/mta_queens_bus_network_redesign_service_changes.md",
] as const;
export const FORECAST_SOURCE_PATHS = [
  "data/quality/acquisition/target-list.json",
  "data/quality/acquisition/target-list.md",
  "data/quality/acquisition/reviews/v1/manifest.json",
  "data/quality/acquisition/reviews/v1/reviewed-overlay.jsonl",
  "data/quality/acquisition/reviews/v1/follow-up.md",
] as const;
export const IDENTITY_VERDICT_ROOT =
  "data/contracts/bus-lane-identity-verdicts-v1";
export const IDENTITY_VERDICT_MANIFEST = `${IDENTITY_VERDICT_ROOT}/manifest.json`;
export const IDENTITY_VERDICT_SOURCE_PATHS = [
  `${IDENTITY_VERDICT_ROOT}/contract.json`,
  `${IDENTITY_VERDICT_ROOT}/fixture.jsonl`,
  `${IDENTITY_VERDICT_ROOT}/bus_lane_identity_verdicts.jsonl`,
  IDENTITY_VERDICT_MANIFEST,
] as const;
export const MEMBER_GRAIN_ROOT =
  "data/contracts/operational-occurrence-member-grain/v1";
export const MEMBER_GRAIN_MANIFEST = `${MEMBER_GRAIN_ROOT}/manifest.json`;
export const MEMBER_GRAIN_SOURCE_PATHS = [
  `${MEMBER_GRAIN_ROOT}/contract.json`,
  `${MEMBER_GRAIN_ROOT}/fixture.jsonl`,
  `${MEMBER_GRAIN_ROOT}/operational_occurrence_member_grain.jsonl`,
  MEMBER_GRAIN_MANIFEST,
] as const;
export const STUDY_READINESS_V2_SOURCE_PATHS = [
  "data/quality/study-readiness/v2/bridge-ledger.jsonl",
  "data/quality/study-readiness/v2/bridge-summary.json",
  "data/quality/study-readiness/v2/manifest.json",
] as const;
export const FRONTIER_EXCEPTIONS_SOURCE_PATH =
  "data/quality/operational-reference/frontier-exceptions.json";

export const memberExtentReleasePath = (sourcePath: string): string => `member-extent/${sourcePath}`;
export const qualityProvenanceReleasePath = (sourcePath: string): string => `quality-provenance/${sourcePath}`;
export const closureReleasePath = (sourcePath: string): string =>
  `study-frontier-closure/${sourcePath}`;

export type StagedReleaseCompanions = {
  files: Array<{ path: string; bytes: number; sha256: string }>;
  member_extent_manifest_path: string | null;
  quality_provenance_path: string | null;
  identity_verdict_manifest_path: string | null;
  member_grain_manifest_path: string | null;
  study_readiness_v2_manifest_path: string | null;
  frontier_exceptions_path: string | null;
};

const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const rowCount = (bytes: Buffer): number => bytes.toString("utf8").split(/\r?\n/u).filter(Boolean).length;

function jsonObject(path: string): Record<string, unknown> {
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected JSON object`);
  }
  return value as Record<string, unknown>;
}

function copyAddressed(
  rootDir: string,
  releaseDir: string,
  sourcePath: string,
  releasePath: string,
): { path: string; bytes: number; sha256: string; source_path: string; row_count?: number } {
  const source = join(rootDir, sourcePath);
  if (!existsSync(source)) throw new Error(`Release companion source is missing: ${sourcePath}`);
  const bytes = readFileSync(source);
  const destination = join(releaseDir, releasePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
  return {
    path: releasePath,
    source_path: sourcePath,
    bytes: bytes.length,
    sha256: sha256(bytes),
    ...(sourcePath.endsWith(".jsonl") ? { row_count: rowCount(bytes) } : {}),
  };
}

function requireNonAuthorizing(value: Record<string, unknown>, path: string): void {
  if (value.authorizes_study !== false || value.authorizes_cross_product !== false) {
    throw new Error(`${path}: release companion must explicitly deny study and cross-product authority`);
  }
}

function readLatestBaseline(rootDir: string): {
  release_id: string;
  pointer: { bytes: number; sha256: string };
  manifest: { bytes: number; sha256: string };
  manifest_files: Record<string, ReleaseManifestFile>;
} {
  const latestBytes = readFileSync(join(rootDir, "data/exports/releases/LATEST"));
  const releaseId = latestBytes.toString("utf8").trim();
  const manifestBytes = readFileSync(join(rootDir, "data/exports/releases", releaseId, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { files?: unknown };
  if (typeof manifest.files !== "object" || manifest.files === null || Array.isArray(manifest.files)) {
    throw new Error(`${releaseId} manifest files: expected object`);
  }
  return {
    release_id: releaseId,
    pointer: { bytes: latestBytes.length, sha256: sha256(latestBytes) },
    manifest: { bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
    manifest_files: manifest.files as Record<string, ReleaseManifestFile>,
  };
}

export function stageReleaseCompanions(
  rootDir: string,
  releaseDir: string,
  releaseId: string,
  generatorCommit: string,
  frontierGate?: { status: "closed" | "bypassed"; reason?: string },
): StagedReleaseCompanions {
  const hasMemberExtents = existsSync(join(rootDir, MEMBER_EXTENT_MANIFEST));
  const hasForecastOverlay = existsSync(join(rootDir, "data/quality/acquisition/reviews/v1/manifest.json"));
  const hasIdentityVerdicts = existsSync(join(rootDir, IDENTITY_VERDICT_MANIFEST));
  const hasMemberGrain = existsSync(join(rootDir, MEMBER_GRAIN_MANIFEST));
  const hasStudyReadinessV2 = existsSync(
    join(rootDir, "data/quality/study-readiness/v2/manifest.json"),
  );
  if (
    !hasMemberExtents && !hasForecastOverlay && !hasIdentityVerdicts &&
    !hasMemberGrain && !hasStudyReadinessV2 && frontierGate === undefined
  ) {
    return {
      files: [],
      member_extent_manifest_path: null,
      quality_provenance_path: null,
      identity_verdict_manifest_path: null,
      member_grain_manifest_path: null,
      study_readiness_v2_manifest_path: null,
      frontier_exceptions_path: null,
    };
  }

  const staged: Array<{
    path: string;
    source_path: string;
    bytes: number;
    sha256: string;
    row_count?: number;
  }> = [];
  if (hasMemberExtents) {
    for (const sourcePath of MEMBER_EXTENT_SOURCE_PATHS) {
      staged.push(copyAddressed(rootDir, releaseDir, sourcePath, memberExtentReleasePath(sourcePath)));
    }
    const memberSummary = jsonObject(join(rootDir, `${MEMBER_EXTENT_ROOT}/summary.json`));
    const doctrine = memberSummary.doctrine;
    if (typeof doctrine !== "object" || doctrine === null || Array.isArray(doctrine)) {
      throw new Error(`${MEMBER_EXTENT_ROOT}/summary.json: doctrine must be an object`);
    }
    requireNonAuthorizing(doctrine as Record<string, unknown>, `${MEMBER_EXTENT_ROOT}/summary.json.doctrine`);
  }
  if (hasForecastOverlay) {
    for (const sourcePath of FORECAST_SOURCE_PATHS) {
      staged.push(copyAddressed(rootDir, releaseDir, sourcePath, qualityProvenanceReleasePath(sourcePath)));
    }
    requireNonAuthorizing(
      jsonObject(join(rootDir, "data/quality/acquisition/reviews/v1/manifest.json")),
      "data/quality/acquisition/reviews/v1/manifest.json",
    );
  }
  if (hasIdentityVerdicts) {
    for (const sourcePath of IDENTITY_VERDICT_SOURCE_PATHS) {
      staged.push(copyAddressed(
        rootDir,
        releaseDir,
        sourcePath,
        closureReleasePath(sourcePath),
      ));
    }
  }
  if (hasMemberGrain) {
    for (const sourcePath of MEMBER_GRAIN_SOURCE_PATHS) {
      staged.push(copyAddressed(
        rootDir,
        releaseDir,
        sourcePath,
        closureReleasePath(sourcePath),
      ));
    }
  }
  if (hasStudyReadinessV2) {
    for (const sourcePath of STUDY_READINESS_V2_SOURCE_PATHS) {
      staged.push(copyAddressed(
        rootDir,
        releaseDir,
        sourcePath,
        closureReleasePath(sourcePath),
      ));
    }
  }
  let frontierExceptionsPath: string | null = null;
  if (frontierGate) {
    frontierExceptionsPath = "quality-provenance/frontier-exceptions.json";
    const source = join(rootDir, FRONTIER_EXCEPTIONS_SOURCE_PATH);
    if (frontierGate.status === "closed" && existsSync(source)) {
      staged.push(copyAddressed(
        rootDir,
        releaseDir,
        FRONTIER_EXCEPTIONS_SOURCE_PATH,
        frontierExceptionsPath,
      ));
    } else {
      const bytes = `${stableJson({
        schema_version: 1,
        exceptions: frontierGate.status === "closed" ? [] : [{
          ledger_id: "export-preflight",
          reason: frontierGate.reason ?? "explicit_allow_open_frontier",
          owner_sign_off: "--allow-open-frontier",
          date: "1970-01-01",
        }],
      } as JsonValue)}\n`;
      const destination = join(releaseDir, frontierExceptionsPath);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, bytes);
      staged.push({
        path: frontierExceptionsPath,
        source_path: "generated:frontier-exceptions-v1",
        bytes: Buffer.byteLength(bytes),
        sha256: sha256(bytes),
      });
    }
  }
  if (
    !hasMemberExtents && !hasForecastOverlay && !hasIdentityVerdicts &&
    !hasMemberGrain && !hasStudyReadinessV2
  ) {
    const provenancePath = "quality-provenance/manifest.json";
    const provenanceBytes = `${stableJson({
      schema_version: RELEASE_QUALITY_PROVENANCE_SCHEMA_VERSION,
      provenance_id: `${releaseId}-quality-provenance-v1`,
      release_id: releaseId,
      generator_commit: generatorCommit,
      layer: "quality_provenance",
      frontier_gate: frontierGate ?? null,
      artifacts: staged.map(({ path, source_path, bytes, sha256: digest }) => ({
        source_path,
        release_path: path,
        bytes,
        sha256: digest,
      })),
      authorizes_study: false,
      authorizes_cross_product: false,
    } as JsonValue)}\n`;
    const destination = join(releaseDir, provenancePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, provenanceBytes);
    staged.push({
      path: provenancePath,
      source_path: "generated:release-quality-provenance-v1",
      bytes: Buffer.byteLength(provenanceBytes),
      sha256: sha256(provenanceBytes),
    });
    return {
      files: staged.map(({ path, bytes, sha256: digest }) => ({
        path,
        bytes,
        sha256: digest,
      })),
      member_extent_manifest_path: null,
      quality_provenance_path: null,
      identity_verdict_manifest_path: null,
      member_grain_manifest_path: null,
      study_readiness_v2_manifest_path: null,
      frontier_exceptions_path: frontierExceptionsPath,
    };
  }

  const baseline = readLatestBaseline(rootDir);
  const canonicalComparisons = [...FILE_BY_KIND.values()].sort().map((path) => {
    const bytes = readFileSync(join(releaseDir, path));
    const current = { bytes: bytes.length, sha256: sha256(bytes) };
    const prior = baseline.manifest_files[path];
    return {
      path,
      byte_identical: prior?.bytes === current.bytes && prior.sha256 === current.sha256,
      prior: prior ?? null,
      current,
    };
  });
  const currentOccurrenceBytes = readFileSync(join(releaseDir, "operational_occurrences.jsonl"));
  const priorOccurrence = baseline.manifest_files["operational_occurrences.jsonl"] ?? null;
  const currentOccurrence = {
    bytes: currentOccurrenceBytes.length,
    sha256: sha256(currentOccurrenceBytes),
    row_count: rowCount(currentOccurrenceBytes),
  };

  const memberSummary = hasMemberExtents
    ? jsonObject(join(rootDir, `${MEMBER_EXTENT_ROOT}/summary.json`))
    : null;
  const overlayManifest = hasForecastOverlay
    ? jsonObject(join(rootDir, "data/quality/acquisition/reviews/v1/manifest.json"))
    : null;
  const provenancePath = "quality-provenance/manifest.json";
  const provenance = {
    schema_version: RELEASE_QUALITY_PROVENANCE_SCHEMA_VERSION,
    provenance_id: `${releaseId}-quality-provenance-v1`,
    release_id: releaseId,
    generator_commit: generatorCommit,
    layer: "quality_provenance",
    policy: "advisory_companions_do_not_mutate_canonical_forecasts_or_operational_occurrences",
    authorizes_study: false,
    authorizes_cross_product: false,
    baseline: {
      release_id: baseline.release_id,
      latest_pointer: baseline.pointer,
      manifest: baseline.manifest,
    },
    semantic_delta: {
      canonical_record_count: canonicalComparisons.reduce((sum, entry) =>
        sum + rowCount(readFileSync(join(releaseDir, entry.path))), 0),
      canonical_payloads_byte_identical: canonicalComparisons.every((entry) => entry.byte_identical),
      changed_canonical_payloads: canonicalComparisons.filter((entry) => !entry.byte_identical).map((entry) => entry.path),
      operational_occurrences: {
        prior: priorOccurrence,
        current: currentOccurrence,
        byte_identical: priorOccurrence?.bytes === currentOccurrence.bytes &&
          priorOccurrence.sha256 === currentOccurrence.sha256,
      },
      member_extent_companion: memberSummary,
      forecast_review_overlay: overlayManifest,
      frontier_gate: frontierGate ?? null,
      study_readiness_v2: hasStudyReadinessV2
        ? jsonObject(join(rootDir, "data/quality/study-readiness/v2/manifest.json"))
        : null,
      identity_verdict_companion: hasIdentityVerdicts
        ? jsonObject(join(rootDir, IDENTITY_VERDICT_MANIFEST))
        : null,
      member_grain_companion: hasMemberGrain
        ? jsonObject(join(rootDir, MEMBER_GRAIN_MANIFEST))
        : null,
    },
    artifacts: staged.map(({ path, source_path, bytes, sha256: digest, ...optional }) => ({
      source_path,
      release_path: path,
      bytes,
      sha256: digest,
      ...optional,
    })),
  };
  const provenanceBytes = `${stableJson(provenance as unknown as JsonValue)}\n`;
  const provenanceDestination = join(releaseDir, provenancePath);
  mkdirSync(dirname(provenanceDestination), { recursive: true });
  writeFileSync(provenanceDestination, provenanceBytes, "utf8");
  staged.push({
    path: provenancePath,
    source_path: "generated:release-quality-provenance-v1",
    bytes: Buffer.byteLength(provenanceBytes),
    sha256: sha256(provenanceBytes),
  });

  return {
    files: staged.map(({ path, bytes, sha256: digest }) => ({ path, bytes, sha256: digest })),
    member_extent_manifest_path: hasMemberExtents ? memberExtentReleasePath(MEMBER_EXTENT_MANIFEST) : null,
    quality_provenance_path: provenancePath,
    identity_verdict_manifest_path: hasIdentityVerdicts
      ? closureReleasePath(IDENTITY_VERDICT_MANIFEST)
      : null,
    member_grain_manifest_path: hasMemberGrain
      ? closureReleasePath(MEMBER_GRAIN_MANIFEST)
      : null,
    study_readiness_v2_manifest_path: hasStudyReadinessV2
      ? closureReleasePath("data/quality/study-readiness/v2/manifest.json")
      : null,
    frontier_exceptions_path: frontierExceptionsPath,
  };
}
