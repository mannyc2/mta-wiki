import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { repoRoot } from "@mta-wiki/core/paths";
import { rebuildSourceBlocks, sourceDirForId } from "@mta-wiki/pipeline/sources/source-prep";

const DEFAULT_CHANDRA_BATCH_SIZE = 48;

export type ChandraQueueOptions = {
  sourceId?: string | undefined;
  include?: string | undefined;
  exclude?: string | undefined;
  limit?: number | undefined;
  force?: boolean | undefined;
  dryRun?: boolean | undefined;
  maxPages?: number | undefined;
  batchSize?: number | undefined;
};

export type ChandraQueueEntryStatus = "queued" | "partial" | "complete" | "skipped";

export type ChandraQueueEntry = {
  source_id: string;
  source_dir: string;
  pdf_path: string;
  chandra_dir: string;
  status: ChandraQueueEntryStatus;
  page_count: number | undefined;
  completed_pages: number[];
  failed_pages: number[];
  missing_pages: number[];
  reason?: string | undefined;
};

export type ChandraQueueManifest = {
  run_id: string;
  generated_at: string;
  dry_run: boolean;
  force: boolean;
  include?: string | undefined;
  exclude?: string | undefined;
  limit?: number | undefined;
  summary: {
    discovered_pdf_sources: number;
    considered: number;
    queued: number;
    partial: number;
    complete: number;
    skipped: number;
  };
  entries: ChandraQueueEntry[];
  manifest_path: string;
};

export type ChandraRunResult = ChandraQueueManifest & {
  processed_sources: number;
  failed_sources: number;
};

type ChandraPageManifest = {
  page_count?: number | undefined;
  completed_pages?: number[] | undefined;
  failed_pages?: number[] | undefined;
  missing_pages?: number[] | undefined;
};

function rawSourcesDir() {
  return join(repoRoot, "raw", "sources");
}

function chandraDataDir() {
  return join(repoRoot, "data", "chandra-ocr");
}

function timestampId() {
  return new Date().toISOString().replace(/[:.]/gu, "-");
}

function sourceIdsWithPdfs() {
  if (!existsSync(rawSourcesDir())) return [];
  return readdirSync(rawSourcesDir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((sourceId) => existsSync(join(sourceDirForId(sourceId), "source.pdf")))
    .sort((a, b) => a.localeCompare(b));
}

function sourceMatches(sourceId: string, options: ChandraQueueOptions) {
  if (options.sourceId && sourceId !== options.sourceId) return false;
  if (options.include && !new RegExp(options.include, "u").test(sourceId)) return false;
  if (options.exclude && new RegExp(options.exclude, "u").test(sourceId)) return false;
  return true;
}

function readChandraManifest(sourceId: string): ChandraPageManifest | undefined {
  const manifestPath = join(sourceDirForId(sourceId), "chandra", "manifest.json");
  if (!existsSync(manifestPath)) return undefined;
  return JSON.parse(readFileSync(manifestPath, "utf8")) as ChandraPageManifest;
}

function isHealthyChandraPage(path: string, pageNumber: number) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      status?: string;
      error?: unknown;
      page_number?: number;
      blocks?: unknown;
    };
    if (parsed.status === "error" || parsed.error === true) return false;
    if (parsed.page_number !== undefined && parsed.page_number !== pageNumber) return false;
    if (parsed.status === "ok") return true;
    return Array.isArray(parsed.blocks);
  } catch {
    return false;
  }
}

function cachedChandraPageNumbers(chandraDir: string) {
  const pagesDir = join(chandraDir, "pages");
  if (!existsSync(pagesDir)) return [];
  return readdirSync(pagesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({ name: entry.name, page: entry.name.match(/^p(\d+)\.json$/u)?.[1] }))
    .filter((entry): entry is { name: string; page: string } => entry.page !== undefined)
    .map((entry) => ({ name: entry.name, page: Number(entry.page) }))
    .filter((entry) => Number.isInteger(entry.page) && entry.page > 0 && isHealthyChandraPage(join(pagesDir, entry.name), entry.page))
    .map((entry) => entry.page)
    .sort((a, b) => a - b);
}

function queueEntry(sourceId: string, options: ChandraQueueOptions): ChandraQueueEntry {
  const sourceDir = sourceDirForId(sourceId);
  const pdfPath = join(sourceDir, "source.pdf");
  const chandraDir = join(sourceDir, "chandra");
  const manifest = readChandraManifest(sourceId);
  // Poppler-free: page count comes from the cached Chandra manifest only (no pdfinfo fallback).
  const pageCount = manifest?.page_count;
  const completedPages = cachedChandraPageNumbers(chandraDir);
  const failedPages = [...new Set(manifest?.failed_pages ?? [])].sort((a, b) => a - b);
  const completedPageSet = new Set(completedPages);
  const missingPages =
    pageCount === undefined ? [] : Array.from({ length: pageCount }, (_unused, index) => index + 1).filter((page) => !completedPageSet.has(page));

  if (!existsSync(pdfPath)) {
    return {
      source_id: sourceId,
      source_dir: sourceDir,
      pdf_path: pdfPath,
      chandra_dir: chandraDir,
      status: "skipped",
      page_count: pageCount,
      completed_pages: completedPages,
      failed_pages: failedPages,
      missing_pages: missingPages,
      reason: "missing source.pdf",
    };
  }

  if (!options.force && pageCount !== undefined && completedPages.length >= pageCount) {
    return {
      source_id: sourceId,
      source_dir: sourceDir,
      pdf_path: pdfPath,
      chandra_dir: chandraDir,
      status: "complete",
      page_count: pageCount,
      completed_pages: completedPages,
      failed_pages: failedPages,
      missing_pages: [],
    };
  }

  return {
    source_id: sourceId,
    source_dir: sourceDir,
    pdf_path: pdfPath,
    chandra_dir: chandraDir,
    status: completedPages.length > 0 ? "partial" : "queued",
    page_count: pageCount,
    completed_pages: completedPages,
    failed_pages: failedPages,
    missing_pages: options.force && pageCount !== undefined ? Array.from({ length: pageCount }, (_unused, index) => index + 1) : missingPages,
  };
}

function writeQueueManifest(entries: ChandraQueueEntry[], options: ChandraQueueOptions): ChandraQueueManifest {
  mkdirSync(chandraDataDir(), { recursive: true });
  const runId = `${timestampId()}_chandra-ocr-queue`;
  const manifestPath = join(chandraDataDir(), `${runId}.json`);
  const manifest: ChandraQueueManifest = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    dry_run: Boolean(options.dryRun),
    force: Boolean(options.force),
    include: options.include,
    exclude: options.exclude,
    limit: options.limit,
    summary: {
      discovered_pdf_sources: sourceIdsWithPdfs().length,
      considered: entries.length,
      queued: entries.filter((entry) => entry.status === "queued").length,
      partial: entries.filter((entry) => entry.status === "partial").length,
      complete: entries.filter((entry) => entry.status === "complete").length,
      skipped: entries.filter((entry) => entry.status === "skipped").length,
    },
    entries,
    manifest_path: manifestPath,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(join(chandraDataDir(), "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export function queueChandraOcr(options: ChandraQueueOptions = {}): ChandraQueueManifest {
  const sourceIds = sourceIdsWithPdfs().filter((sourceId) => sourceMatches(sourceId, options));
  const limitedSourceIds = options.limit === undefined ? sourceIds : sourceIds.slice(0, options.limit);
  const entries = limitedSourceIds.map((sourceId) => queueEntry(sourceId, options));
  return writeQueueManifest(entries, options);
}

function runChandraWorker(queue: ChandraQueueManifest, options: ChandraQueueOptions) {
  const queuedEntries = queue.entries.filter((entry) => entry.status === "queued" || entry.status === "partial");
  if (queuedEntries.length === 0) return 0;

  const args = ["scripts/chandra/ocr_worker.py", "--manifest", queue.manifest_path];
  if (options.force) args.push("--force");
  if (options.maxPages !== undefined) args.push("--max-pages", String(options.maxPages));
  if (options.batchSize !== undefined) args.push("--max-workers", String(options.batchSize));

  const benchmarkPython = "/mnt/models/dev/ocr-benchmark/.venv/bin/python";
  const python = process.env.CHANDRA_PYTHON ?? (existsSync(benchmarkPython) ? benchmarkPython : "python3");
  const result = spawnSync(python, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
  return result.status ?? 1;
}

export function runChandraOcr(options: ChandraQueueOptions = {}): ChandraRunResult {
  const queue = queueChandraOcr(options);
  if (options.dryRun) return { ...queue, processed_sources: 0, failed_sources: 0 };

  const workerStatus = runChandraWorker(queue, options);
  let processedSources = 0;
  let failedSources = 0;
  const refreshedAfterOcr = queueChandraOcr(options);
  for (const entry of refreshedAfterOcr.entries.filter((entry) => entry.completed_pages.length > 0)) {
    try {
      rebuildSourceBlocks(entry.source_id);
      processedSources += 1;
    } catch (error) {
      failedSources += 1;
      console.error(`[chandra] failed ${entry.source_id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const refreshed = queueChandraOcr(options);
  return {
    ...refreshed,
    processed_sources: processedSources,
    failed_sources: failedSources + (workerStatus === 0 ? 0 : 1),
  };
}

export function chandraOcrCacheStats(sourceId: string) {
  const manifest = readChandraManifest(sourceId);
  const sourceDir = sourceDirForId(sourceId);
  const chandraDir = join(sourceDir, "chandra");
  const pagesDir = join(chandraDir, "pages");
  const completedPages = cachedChandraPageNumbers(chandraDir);
  const pageCount = manifest?.page_count;
  const failedPages = [...new Set(manifest?.failed_pages ?? [])].sort((a, b) => a - b);
  const bytes = existsSync(pagesDir)
    ? readdirSync(pagesDir, { withFileTypes: true }).reduce((sum, entry) => {
        if (!entry.isFile()) return sum;
        try {
          return sum + statSync(join(pagesDir, entry.name)).size;
        } catch {
          return sum;
        }
      }, 0)
    : 0;
  return {
    source_id: sourceId,
    page_count: pageCount,
    completed_pages: completedPages,
    failed_pages: failedPages,
    missing_pages:
      pageCount === undefined ? (manifest?.missing_pages ?? []) : Array.from({ length: pageCount }, (_unused, index) => index + 1).filter((page) => !completedPages.includes(page)),
    chandra_dir: chandraDir,
    bytes,
  };
}
