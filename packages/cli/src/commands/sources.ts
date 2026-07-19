import { join, relative } from "node:path";
import {
  applySpreadsheetPreview,
  importGtfs,
  installGtfsSnapshot,
  importSources,
  prepareSource,
  queueChandraOcr,
  repoRoot,
  runChandraOcr,
  writeSpreadsheetPreview,
  type ChandraQueueManifest,
  type ChandraRunResult,
  type SourceImportManifest,
} from "@mta-wiki/agents";
import { formatBytes, requireSourceId, requireSubject, type CommandHandler } from "./shared.js";

function printSourceImportManifest(manifest: SourceImportManifest) {
  console.log(`Source import: ${manifest.run_id}`);
  console.log(`Root: ${manifest.root}`);
  console.log(`Discovered: ${manifest.summary.discovered}`);
  console.log(`Unique sources: ${manifest.summary.unique_sources}`);
  console.log(`Duplicate captures: ${manifest.summary.duplicate_captures}`);
  console.log(`Considered: ${manifest.summary.considered}`);
  console.log(`Staged: ${manifest.summary.staged}`);
  console.log(`Would stage: ${manifest.summary.would_stage}`);
  console.log(`Skipped: ${manifest.summary.skipped}`);
  console.log(`Failed: ${manifest.summary.failed}`);
  console.log(`Stageable artifact bytes: ${formatBytes(manifest.summary.stageable_artifact_bytes)}`);
  console.log(`Would-stage artifact bytes: ${formatBytes(manifest.summary.would_stage_artifact_bytes)}`);
  console.log(`Staged artifact bytes: ${formatBytes(manifest.summary.staged_artifact_bytes)}`);
  console.log(`Manifest: ${manifest.manifest_path}`);

  const interesting = manifest.entries.filter((entry) => entry.status === "failed" || entry.status === "would_stage" || entry.status === "staged").slice(0, 20);
  for (const entry of interesting) {
    const label = entry.title ?? entry.upstream_source_id ?? entry.source_dir;
    const details = [entry.source_id, entry.reason ?? entry.error].filter(Boolean).join(" ");
    console.log(`- ${entry.status} ${details ? `${details}: ` : ""}${label}`);
  }
}

function printChandraManifest(manifest: ChandraQueueManifest | ChandraRunResult) {
  console.log(`Chandra OCR queue: ${manifest.run_id}`);
  console.log(`Discovered PDF sources: ${manifest.summary.discovered_pdf_sources}`);
  console.log(`Considered: ${manifest.summary.considered}`);
  console.log(`Queued: ${manifest.summary.queued}`);
  console.log(`Partial: ${manifest.summary.partial}`);
  console.log(`Complete: ${manifest.summary.complete}`);
  console.log(`Skipped: ${manifest.summary.skipped}`);
  if ("processed_sources" in manifest) {
    console.log(`Processed sources: ${manifest.processed_sources}`);
    console.log(`Failed sources: ${manifest.failed_sources}`);
  }
  console.log(`Manifest: ${relative(repoRoot, manifest.manifest_path)}`);

  const interesting = manifest.entries.filter((entry) => entry.status !== "complete").slice(0, 20);
  for (const entry of interesting) {
    const pageSummary =
      entry.page_count === undefined
        ? ""
        : ` pages=${entry.completed_pages.length}/${entry.page_count}${entry.failed_pages.length ? ` failed=${entry.failed_pages.slice(0, 8).join(",")}` : ""}${entry.missing_pages.length ? ` missing=${entry.missing_pages.slice(0, 8).join(",")}` : ""}`;
    console.log(`- ${entry.status} ${entry.source_id}${pageSummary}${entry.reason ? ` (${entry.reason})` : ""}`);
  }
}

export const sourcesCommands = {
  "prepare-source": (args) => {
    const sourceIdOverride = args.sourceIdOverride ? requireSourceId(args.command, args.sourceIdOverride) : undefined;
    const result = prepareSource(requireSubject(args.command, args.subject, "source directory"), {
      sourceId: sourceIdOverride,
    });
    console.log(`Prepared source ${result.sourceId}`);
    if (result.upstreamSourceId) console.log(`Upstream source id: ${result.upstreamSourceId}`);
    console.log(`Source dir: ${relative(repoRoot, result.sourceDir)}`);
    console.log(`Copied files: ${result.copiedFiles.join(", ") || "(none)"}`);
    console.log(`Text: ${result.textPath ? `${relative(repoRoot, result.textPath)} (${result.textBytes} bytes)` : "(not available)"}`);
    console.log(`Blocks: ${relative(repoRoot, result.blocksPath)} (${result.blockCount})`);
  },

  "source-prep-preview": (args) => {
    const sourceId = requireSourceId(args.command, args.subject);
    const result = writeSpreadsheetPreview(sourceId, { runId: args.runId });
    console.log(`Source-prep spreadsheet preview ${result.source_id}`);
    console.log(`Status: ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
    console.log(`Run: ${result.run_id}`);
    console.log(`Sheets: ${result.sheets.length}`);
    for (const sheet of result.sheets) {
      console.log(`- ${sheet.name}: rows=${sheet.row_count} cells=${sheet.cell_count}`);
    }
    console.log(`JSON: ${relative(repoRoot, result.json_path)}`);
    console.log(`Markdown: ${relative(repoRoot, result.markdown_path)}`);
  },

  "source-prep-apply-preview": (args) => {
    const sourceId = requireSourceId(args.command, args.subject);
    if (!args.runId) throw new Error("source-prep-apply-preview requires --run-id for an explicit reviewed sidecar run");
    const result = applySpreadsheetPreview(sourceId, { runId: args.runId });
    console.log(`Applied spreadsheet preview ${result.source_id}`);
    console.log(`Run: ${result.run_id}`);
    console.log(`Sheets: ${result.sheet_count}`);
    console.log(`Rows: ${result.row_count}`);
    console.log(`Cells: ${result.cell_count}`);
    console.log(`Text: ${relative(repoRoot, result.text_path)}`);
    console.log(`Blocks: ${relative(repoRoot, result.blocks_path)} (${result.block_count})`);
  },

  "import-sources": (args) => {
    const manifest = importSources(requireSubject(args.command, args.subject, "root or sources directory"), {
      dryRun: args.dryRun,
      force: args.force,
      limit: args.importLimit,
      include: args.include,
      exclude: args.exclude,
    });
    printSourceImportManifest(manifest);
  },

  "chandra-queue": (args) => {
    const manifest = queueChandraOcr({
      sourceId: args.subject,
      dryRun: args.dryRun,
      force: args.force,
      limit: args.importLimit,
      include: args.include,
      exclude: args.exclude,
      maxPages: args.maxPages,
      batchSize: args.batchSize,
    });
    printChandraManifest(manifest);
  },

  "chandra-run": (args) => {
    const result = runChandraOcr({
      sourceId: args.subject,
      dryRun: args.dryRun,
      force: args.force,
      limit: args.importLimit,
      include: args.include,
      exclude: args.exclude,
      maxPages: args.maxPages,
      batchSize: args.batchSize,
    });
    printChandraManifest(result);
    if (result.failed_sources > 0) process.exitCode = 1;
  },

  "import-gtfs": (args) => {
    if (args.receipt) {
      if (args.subject) throw new Error("strict import-gtfs does not accept a legacy feed-directory subject");
      if (!args.currentBusRoutes) throw new Error("strict import-gtfs requires --current-bus-routes <artifact.json>");
      if (args.feedInputs.length === 0) throw new Error("strict import-gtfs requires repeated --feed <component-id>=<path> inputs");
      const feeds: Record<string, string> = {};
      for (const input of args.feedInputs) {
        const separator = input.indexOf("=");
        if (separator < 1 || separator === input.length - 1) throw new Error(`invalid --feed value ${input}; expected <component-id>=<path>`);
        const componentId = input.slice(0, separator);
        const path = input.slice(separator + 1);
        if (Object.hasOwn(feeds, componentId)) throw new Error(`duplicate --feed component ${componentId}`);
        feeds[componentId] = path;
      }
      const result = installGtfsSnapshot({
        receiptPath: args.receipt,
        feeds,
        currentBusRoutesPath: args.currentBusRoutes,
        snapshotsRoot: join(repoRoot, "data", "reference", "gtfs", "snapshots"),
      });
      console.log(`Installed immutable GTFS snapshot ${result.snapshot_id}`);
      console.log(`Manifest SHA-256: ${result.manifest_sha256}`);
      console.log(`Routes: ${result.route_identity_count}; catalog: ${result.catalog_identity_count}; catalog-only: ${result.catalog_only_count}; GTFS-only: ${result.gtfs_only_count}`);
      console.log("Deterministic double-build path/SHA tree:");
      for (const row of result.deterministic_tree) console.log(`  ${row.path}  ${row.sha256}  ${row.bytes}`);
      return;
    }
    if (args.feedInputs.length || args.currentBusRoutes) throw new Error("--feed/--current-bus-routes require --receipt strict mode");
    const manifest = importGtfs(requireSubject(args.command, args.subject, "GTFS feed directory (routes.txt + agency.txt)"));
    console.log(`Staged GTFS feed (feed_date ${manifest.feed_date}) from ${manifest.imported_from}`);
    for (const [name, info] of Object.entries(manifest.files)) console.log(`  ${name}: ${info.rows} rows  ${info.sha256.slice(0, 16)}…`);
    console.log("Run `materialize` to load ref_gtfs_routes + ref_agencies.");
  },
} satisfies Record<string, CommandHandler>;
