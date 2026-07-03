import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import { FILE_BY_KIND, readCanonicalRecords } from "@mta-wiki/pipeline/materialize/materialize";
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

export type ReleaseManifestFile = {
  bytes: number;
  sha256: string;
};

export type ReleaseManifest = {
  release_id: string;
  generator_commit: string;
  record_counts: Record<string, number>;
  files: Record<string, ReleaseManifestFile>;
  pointers: {
    route_anchors: string | null;
    taxonomy: string | null;
    quality_report: string | null;
  };
};

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
  records?: MtaCanonicalRecord[] | undefined;
  rootDir?: string | undefined;
  gtfsRoutes?: GtfsRoute[] | undefined;
  routeAnchorOverrides?: RouteAnchorOverrides | undefined;
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

export function exportRelease(releaseId: string, opts: ReleaseExportOptions = {}): ReleaseExportResult {
  if (!releaseId.trim()) throw new Error("releaseId must be non-empty");

  const rootDir = opts.rootDir ?? repoRoot;
  const releasesDir = releaseRoot(rootDir);
  const dir = join(releasesDir, releaseId);
  if (existsSync(dir)) {
    if (!opts.force) throw new Error(`Release ${releaseId} already exists. Use --force to re-cut before publication.`);
    rmSync(dir, { recursive: true, force: true });
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

  mkdirSync(dir, { recursive: true });

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
  writeRouteAnchorsJsonl(routeAnchorPath, computeRouteAnchors(records, gtfsRoutes, routeAnchorOverrides));
  fileEntries.push(["route_anchors.jsonl", fileMetadata(routeAnchorPath)]);

  const taxonomyPath = join(dir, "taxonomy.json");
  writeFileSync(taxonomyPath, taxonomyJson(), "utf8");
  fileEntries.push(["taxonomy.json", fileMetadata(taxonomyPath)]);

  const manifest: ReleaseManifest = {
    release_id: releaseId,
    generator_commit: gitHeadCommit(),
    record_counts: sortedObject(countEntries),
    files: sortedObject(fileEntries),
    pointers: { route_anchors: "route_anchors.jsonl", taxonomy: "taxonomy.json", quality_report: opts.qualityReport ?? null },
  };
  const manifestPath = join(dir, "manifest.json");
  const manifestBytes = `${stableJson(manifest as unknown as JsonValue)}\n`;
  writeFileSync(manifestPath, manifestBytes, "utf8");
  const manifestSha256 = sha256(manifestBytes);

  mkdirSync(releasesDir, { recursive: true });
  writeFileSync(join(releasesDir, "LATEST"), `${releaseId}\n`, "utf8");

  return { dir, releaseId, recordCount, files: fileEntries.length, manifestPath, manifestSha256 };
}
