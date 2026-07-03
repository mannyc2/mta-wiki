import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { prepareSource, sourceDirForId } from "@mta-wiki/pipeline/sources/source-prep";
import type { PreparedSourceResult, StagedSourceMetadata } from "@mta-wiki/db/types";

export type SourceImportOptions = {
  dryRun?: boolean | undefined;
  force?: boolean | undefined;
  limit?: number | undefined;
  include?: string | undefined;
  exclude?: string | undefined;
};

export type SourceImportStatus = "staged" | "would_stage" | "skipped" | "failed";

export type SourceImportEntry = {
  status: SourceImportStatus;
  source_id: string | undefined;
  upstream_source_id: string | undefined;
  title: string | undefined;
  source_group: string | undefined;
  detected_content_type: string | undefined;
  source_dir: string;
  staged_dir?: string | undefined;
  artifact_files: string[];
  artifact_bytes: number;
  reason?: string | undefined;
  text_bytes?: number | undefined;
  block_count?: number | undefined;
  error?: string | undefined;
};

export type SourceImportManifest = {
  run_id: string;
  generated_at: string;
  root: string;
  dry_run: boolean;
  force: boolean;
  include?: string | undefined;
  exclude?: string | undefined;
  limit?: number | undefined;
  summary: {
    discovered: number;
    unique_sources: number;
    duplicate_captures: number;
    considered: number;
    staged: number;
    would_stage: number;
    skipped: number;
    failed: number;
    stageable_artifact_bytes: number;
    staged_artifact_bytes: number;
    would_stage_artifact_bytes: number;
  };
  entries: SourceImportEntry[];
  manifest_path: string;
};

type SourceCandidate = {
  dir: string;
  metadata: StagedSourceMetadata;
  artifactFiles: string[];
};

type StagedSourceIndex = {
  ids: Set<string>;
  upstreamToLocal: Map<string, string>;
};

function readSourceMetadata(sourceDir: string): StagedSourceMetadata {
  const metadataPath = join(sourceDir, "metadata.json");
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as StagedSourceMetadata;
  if (!metadata.sourceId || typeof metadata.sourceId !== "string") {
    throw new Error(`metadata.json must contain a string sourceId: ${metadataPath}`);
  }
  return metadata;
}

function hasMetadata(sourceDir: string) {
  return existsSync(join(sourceDir, "metadata.json"));
}

function sourceSearchDir(root: string) {
  const sourcesDir = join(root, "sources");
  return existsSync(sourcesDir) && statSync(sourcesDir).isDirectory() ? sourcesDir : root;
}

function artifactFiles(sourceDir: string) {
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function artifactBytes(sourceDir: string, files: string[]) {
  return files.reduce((sum, file) => {
    try {
      return sum + statSync(join(sourceDir, file)).size;
    } catch {
      return sum;
    }
  }, 0);
}

function sourceCandidate(sourceDir: string): SourceCandidate {
  return {
    dir: sourceDir,
    metadata: readSourceMetadata(sourceDir),
    artifactFiles: artifactFiles(sourceDir),
  };
}

function walkSourceMetadataDirs(root: string, output: string[] = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const child = join(root, entry.name);
    if (hasMetadata(child) && basename(dirname(child)) === "sources") {
      output.push(child);
      continue;
    }

    walkSourceMetadataDirs(child, output);
  }

  return output;
}

function sourceRunPriority(sourceDir: string) {
  if (sourceDir.includes("/gap-roadmap-docs-")) return 700;
  if (sourceDir.includes("/mta-backlog-curl-capture-")) return 650;
  if (sourceDir.includes("/mta-backlog-browser-capture-")) return 640;
  if (sourceDir.includes("/mta-backlog-capture-")) return 630;
  if (sourceDir.includes("/tier2-full-corpus-") && sourceDir.includes("pass2")) return 600;
  if (sourceDir.includes("/tier2-missing-pdfs-")) return 550;
  if (sourceDir.includes("/tier2-failed-pdf-direct-recapture-")) return 540;
  if (sourceDir.includes("/tier2-failed-pdf-wayback-recapture-")) return 530;
  if (sourceDir.includes("/tier2-seed-expansion-")) return 500;
  if (sourceDir.includes("/tier2-full-corpus-") && sourceDir.includes("pass1")) return 450;
  return 0;
}

function artifactScore(candidate: SourceCandidate) {
  const files = new Set(candidate.artifactFiles);
  let score = sourceRunPriority(candidate.dir);
  if (hasStageableSurface(candidate)) score += 100_000;
  if (files.has("text.txt")) score += 20_000;
  if (files.has("source.pdf")) score += 15_000;
  if (files.has("source.html")) score += 10_000;
  if (files.has("source.json")) score += 8_000;

  for (const file of candidate.artifactFiles) {
    try {
      score += Math.min(5_000, Math.floor(statSync(join(candidate.dir, file)).size / 1_000_000));
    } catch {
      continue;
    }
  }

  return score;
}

function dedupeSourceCandidates(candidates: SourceCandidate[]) {
  const bySourceId = new Map<string, SourceCandidate>();
  for (const candidate of candidates) {
    const existing = bySourceId.get(candidate.metadata.sourceId);
    if (!existing || artifactScore(candidate) > artifactScore(existing)) {
      bySourceId.set(candidate.metadata.sourceId, candidate);
    }
  }

  return [...bySourceId.values()].sort((a, b) => a.metadata.sourceId.localeCompare(b.metadata.sourceId));
}

function discoverSourceCandidates(rootInput: string) {
  const root = resolve(rootInput);
  if (!existsSync(root)) throw new Error(`Source import root not found: ${rootInput}`);
  if (!statSync(root).isDirectory()) throw new Error(`Source import root must be a directory: ${rootInput}`);

  if (hasMetadata(root)) {
    const candidates = [sourceCandidate(root)];
    return {
      discovered: candidates.length,
      candidates,
    };
  }

  const searchDir = sourceSearchDir(root);
  const immediateSourceDirs = readdirSync(searchDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(searchDir, entry.name))
    .filter(hasMetadata);
  const sourceDirs = immediateSourceDirs.length > 0 ? immediateSourceDirs : walkSourceMetadataDirs(root);
  const candidates = sourceDirs.map(sourceCandidate);

  return {
    discovered: candidates.length,
    candidates: dedupeSourceCandidates(candidates),
  };
}

function stagedSourceIndex(): StagedSourceIndex {
  const rawSourcesDir = join(repoRoot, "raw", "sources");
  const ids = new Set<string>();
  const upstreamToLocal = new Map<string, string>();
  if (!existsSync(rawSourcesDir)) return { ids, upstreamToLocal };

  for (const entry of readdirSync(rawSourcesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sourceId = entry.name;
    ids.add(sourceId);

    const metadataPath = join(rawSourcesDir, entry.name, "metadata.json");
    if (!existsSync(metadataPath)) continue;

    try {
      const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as StagedSourceMetadata;
      if (metadata.sourceId) upstreamToLocal.set(metadata.sourceId, sourceId);
      if (metadata.upstreamSourceId) upstreamToLocal.set(metadata.upstreamSourceId, sourceId);
    } catch {
      continue;
    }
  }

  return { ids, upstreamToLocal };
}

function slugifyId(value: string) {
  return value
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .replace(/_{2,}/gu, "_");
}

export function compactSourceId(upstreamSourceId: string, title?: string | undefined) {
  let value = slugifyId(upstreamSourceId)
    .replace(/^(?:nyc_dot|nyc_ibo|nyc_comptroller|nyc_mayor|sam_schwartz|mta)_/u, "")
    .replace(/^linked_/u, "")
    .replace(/^select_bus_service_(?:pdf|page)_/u, "")
    .replace(/^bus_priority_document_(?:pdf|page)_/u, "")
    .replace(/^bus_priority_(?:pdf|page)_/u, "")
    .replace(/^capital_projects_pdf_/u, "capital_")
    .replace(/^busway_pdf_/u, "")
    .replace(/^busway_page_/u, "busway_")
    .replace(/^pdf_/u, "")
    .replace(/^page_/u, "")
    .replace(/_pdf$/u, "")
    .replace(/_page$/u, "")
    .replace(/_document_pdf_/gu, "_")
    .replace(/_document_page_/gu, "_")
    .replace(/select_bus_service/gu, "sbs")
    .replace(/_{2,}/gu, "_")
    .replace(/^_+|_+$/gu, "");

  if (!value || value.length < 4) {
    value = slugifyId(title ?? upstreamSourceId);
  }

  return value || "source";
}

function uniqueSourceId(baseSourceId: string, ids: Set<string>) {
  if (!ids.has(baseSourceId)) {
    ids.add(baseSourceId);
    return baseSourceId;
  }

  let suffix = 2;
  while (ids.has(`${baseSourceId}_${suffix}`)) suffix += 1;
  const sourceId = `${baseSourceId}_${suffix}`;
  ids.add(sourceId);
  return sourceId;
}

function hasStageableSurface(candidate: SourceCandidate) {
  const files = new Set(candidate.artifactFiles);
  return files.has("text.txt") || files.has("source.pdf") || files.has("source.html") || files.has("source.json");
}

function regexFilter(pattern: string | undefined) {
  return pattern ? new RegExp(pattern, "iu") : undefined;
}

function matchesCandidate(candidate: SourceCandidate, pattern: RegExp | undefined) {
  if (!pattern) return true;
  return pattern.test(candidate.metadata.sourceId) || pattern.test(candidate.metadata.title ?? "") || pattern.test(candidate.metadata.sourceGroup ?? "");
}

function skippedEntry(candidate: SourceCandidate, reason: string, sourceId?: string | undefined): SourceImportEntry {
  return {
    status: "skipped",
    source_id: sourceId,
    upstream_source_id: candidate.metadata.sourceId,
    title: candidate.metadata.title,
    source_group: candidate.metadata.sourceGroup,
    detected_content_type: candidate.metadata.detectedContentType,
    source_dir: candidate.dir,
    staged_dir: sourceId ? sourceDirForId(sourceId) : undefined,
    artifact_files: candidate.artifactFiles,
    artifact_bytes: artifactBytes(candidate.dir, candidate.artifactFiles),
    reason,
  };
}

function entryFromPrepared(candidate: SourceCandidate, prepared: PreparedSourceResult): SourceImportEntry {
  return {
    status: "staged",
    source_id: prepared.sourceId,
    upstream_source_id: prepared.upstreamSourceId ?? candidate.metadata.sourceId,
    title: candidate.metadata.title,
    source_group: candidate.metadata.sourceGroup,
    detected_content_type: candidate.metadata.detectedContentType,
    source_dir: candidate.dir,
    staged_dir: prepared.sourceDir,
    artifact_files: candidate.artifactFiles,
    artifact_bytes: artifactBytes(candidate.dir, candidate.artifactFiles),
    text_bytes: prepared.textBytes,
    block_count: prepared.blockCount,
  };
}

function sourceImportRunId(rootInput: string, dryRun: boolean) {
  const root = resolve(rootInput);
  const rootLabel = basename(root) === "sources" ? basename(dirname(root)) : basename(root);
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
  return `${timestamp}_${dryRun ? "dry-run_" : ""}source-import_${slugifyId(rootLabel) || "root"}`;
}

function writeImportManifest(manifest: Omit<SourceImportManifest, "manifest_path">) {
  const outputDir = join(repoRoot, "data", "source-imports");
  mkdirSync(outputDir, { recursive: true });
  const manifestPath = join(outputDir, `${manifest.run_id}.json`);
  const completeManifest: SourceImportManifest = {
    ...manifest,
    manifest_path: relative(repoRoot, manifestPath),
  };
  const serialized = `${JSON.stringify(completeManifest, null, 2)}\n`;
  writeFileSync(manifestPath, serialized, "utf8");
  writeFileSync(join(outputDir, "latest.json"), serialized, "utf8");
  return completeManifest;
}

export function importSources(rootInput: string, options: SourceImportOptions = {}): SourceImportManifest {
  const root = resolve(rootInput);
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const include = regexFilter(options.include);
  const exclude = regexFilter(options.exclude);
  const discovery = discoverSourceCandidates(root);
  const discovered = discovery.candidates;
  const index = stagedSourceIndex();
  const entries: SourceImportEntry[] = [];

  for (const candidate of discovered) {
    if (!matchesCandidate(candidate, include)) continue;
    if (exclude && matchesCandidate(candidate, exclude)) continue;
    if (options.limit !== undefined && entries.length >= options.limit) break;

    const existingSourceId = index.upstreamToLocal.get(candidate.metadata.sourceId);
    if (existingSourceId && !force) {
      entries.push(skippedEntry(candidate, "already_staged", existingSourceId));
      continue;
    }

    if (!hasStageableSurface(candidate)) {
      entries.push(skippedEntry(candidate, "missing_stageable_surface"));
      continue;
    }

    const sourceId = existingSourceId ?? uniqueSourceId(compactSourceId(candidate.metadata.sourceId, candidate.metadata.title), index.ids);
    if (dryRun) {
      entries.push({
        status: "would_stage",
        source_id: sourceId,
        upstream_source_id: candidate.metadata.sourceId,
        title: candidate.metadata.title,
        source_group: candidate.metadata.sourceGroup,
        detected_content_type: candidate.metadata.detectedContentType,
        source_dir: candidate.dir,
        staged_dir: sourceDirForId(sourceId),
        artifact_files: candidate.artifactFiles,
        artifact_bytes: artifactBytes(candidate.dir, candidate.artifactFiles),
        reason: "dry_run",
      });
      continue;
    }

    try {
      entries.push(
        entryFromPrepared(
          candidate,
          prepareSource(candidate.dir, {
            sourceId,
          }),
        ),
      );
    } catch (error) {
      entries.push({
        status: "failed",
        source_id: sourceId,
        upstream_source_id: candidate.metadata.sourceId,
        title: candidate.metadata.title,
        source_group: candidate.metadata.sourceGroup,
        detected_content_type: candidate.metadata.detectedContentType,
        source_dir: candidate.dir,
        staged_dir: sourceDirForId(sourceId),
        artifact_files: candidate.artifactFiles,
        artifact_bytes: artifactBytes(candidate.dir, candidate.artifactFiles),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = {
    discovered: discovery.discovered,
    unique_sources: discovered.length,
    duplicate_captures: discovery.discovered - discovered.length,
    considered: entries.length,
    staged: entries.filter((entry) => entry.status === "staged").length,
    would_stage: entries.filter((entry) => entry.status === "would_stage").length,
    skipped: entries.filter((entry) => entry.status === "skipped").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    stageable_artifact_bytes: entries
      .filter((entry) => entry.status === "staged" || entry.status === "would_stage")
      .reduce((sum, entry) => sum + entry.artifact_bytes, 0),
    staged_artifact_bytes: entries.filter((entry) => entry.status === "staged").reduce((sum, entry) => sum + entry.artifact_bytes, 0),
    would_stage_artifact_bytes: entries.filter((entry) => entry.status === "would_stage").reduce((sum, entry) => sum + entry.artifact_bytes, 0),
  };

  return writeImportManifest({
    run_id: sourceImportRunId(root, dryRun),
    generated_at: new Date().toISOString(),
    root,
    dry_run: dryRun,
    force,
    include: options.include,
    exclude: options.exclude,
    limit: options.limit,
    summary,
    entries,
  });
}
