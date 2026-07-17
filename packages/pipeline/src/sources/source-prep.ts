import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import type { PreparedSourceResult, StagedSourceBlock, StagedSourceMetadata } from "@mta-wiki/db/types";

export type PrepareSourceOptions = {
  sourceId?: string | undefined;
};

const EMBEDDED_MTA_DATATABLE_MARKER = "# Embedded MTA data table";

function readMetadata(sourceDir: string): StagedSourceMetadata {
  const metadataPath = join(sourceDir, "metadata.json");
  if (!existsSync(metadataPath)) {
    throw new Error(`Missing source metadata: ${metadataPath}`);
  }

  const parsed = JSON.parse(readFileSync(metadataPath, "utf8")) as StagedSourceMetadata;
  if (!parsed.sourceId || typeof parsed.sourceId !== "string") {
    throw new Error(`metadata.json must contain a string sourceId: ${metadataPath}`);
  }

  return parsed;
}

function copyTopLevelFiles(fromDir: string, toDir: string) {
  const copied: string[] = [];
  mkdirSync(toDir, { recursive: true });

  for (const entry of readdirSync(fromDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const from = join(fromDir, entry.name);
    const to = join(toDir, entry.name);
    copyFileSync(from, to);
    copied.push(entry.name);
  }

  return copied.sort();
}

function extractTextSurface(sourceDir: string) {
  const textPath = join(sourceDir, "text.txt");
  const existingText = existsSync(textPath) && statSync(textPath).size > 0 ? readFileSync(textPath, "utf8") : "";

  const htmlPath = join(sourceDir, "source.html");
  if (existsSync(htmlPath) && statSync(htmlPath).size > 0) {
    const html = readFileSync(htmlPath, "utf8");
    const embeddedTableLines = extractMtaDrupalDataTableText(html);
    if (embeddedTableLines.length > 0) {
      const baseText = (existingText || htmlToText(html)).split(`\n${EMBEDDED_MTA_DATATABLE_MARKER}\n`, 1)[0]?.trimEnd() ?? "";
      writeFileSync(
        textPath,
        `${baseText}\n${EMBEDDED_MTA_DATATABLE_MARKER}\n${embeddedTableLines.join("\n")}\n`,
        "utf8",
      );
      return textPath;
    }
  }

  if (existingText) return textPath;

  const jsonPath = join(sourceDir, "source.json");
  if (existsSync(jsonPath) && statSync(jsonPath).size > 0) {
    const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as unknown;
    writeFileSync(textPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  } else {
    if (existsSync(htmlPath) && statSync(htmlPath).size > 0) {
      writeFileSync(textPath, `${htmlToText(readFileSync(htmlPath, "utf8"))}\n`, "utf8");
    }
  }

  return existsSync(textPath) && statSync(textPath).size > 0 ? textPath : undefined;
}

function htmlToText(html: string) {
  return decodeXmlText(
    html
      .replace(/&nbsp;/giu, " ")
      .replace(/<script\b[\s\S]*?<\/script>/giu, " ")
      .replace(/<style\b[\s\S]*?<\/style>/giu, " ")
      .replace(/<br\s*\/?>/giu, "\n")
      .replace(/<\/(?:p|div|section|article|li|tr|h[1-6])>/giu, "\n")
      .replace(/<[^>]+>/gu, " "),
  )
    .split(/\r?\n/u)
    .map((line) => normalizeOcrText(line))
    .filter(Boolean)
    .join("\n");
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function dataTableCellText(value: unknown): string | null {
  const cell = recordValue(value);
  const raw = cell?.value;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const normalized = htmlToText(raw).replace(/\s+/gu, " ").trim();
  return normalized || null;
}

/**
 * Extract Drupal's client-rendered MTA data tables from the official page payload.
 * Normal HTML-to-text extraction drops these rows because they live inside a JSON
 * script tag. Each returned line is one complete source row so it becomes one
 * citeable block instead of an inferred route/date cross-product.
 */
export function extractMtaDrupalDataTableText(html: string): string[] {
  const lines: string[] = [];
  const scripts = html.matchAll(
    /<script\b[^>]*data-drupal-selector=["']drupal-settings-json["'][^>]*>([\s\S]*?)<\/script>/giu,
  );
  for (const match of scripts) {
    let settings: Record<string, unknown> | null = null;
    try {
      settings = recordValue(JSON.parse(decodeXmlText(match[1] ?? "")) as unknown);
    } catch {
      continue;
    }
    const tables = recordValue(settings?.mtaDatatable);
    if (!tables) continue;
    for (const [, tableValue] of Object.entries(tables).sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))) {
      const table = recordValue(tableValue);
      const csvData = recordValue(table?.csvData);
      if (!Array.isArray(csvData?.data)) continue;
      for (const rowValue of csvData.data) {
        const row = recordValue(rowValue);
        if (!row) continue;
        const orderedCells = Object.entries(row).sort(([left], [right]) => {
          if (left === "Route") return -1;
          if (right === "Route") return 1;
          return left.localeCompare(right, undefined, { numeric: true });
        });
        const cells = orderedCells
          .map(([, cell]) => dataTableCellText(cell))
          .filter((cell): cell is string => cell !== null);
        if (cells.length > 0) lines.push(cells.join(" | "));
      }
    }
  }
  return [...new Set(lines)];
}

function sha256(content: string) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function normalizeOcrText(text: string) {
  return text
    .replace(/\u00a0/gu, " ")
    .replace(/[ \t]+/gu, " ")
    .replace(/\s*\n\s*/gu, " ")
    .trim();
}

function stripInlineLineRefs(text: string) {
  return text.replace(/\s*\[p\d{3,}_l\d{4,}(?:\s+p\d{3,}_l\d{4,})*\]\s*/gu, " ").replace(/\s+/gu, " ").trim();
}

function canonicalizeMarkdownTableRow(line: string) {
  if (!line.includes("|")) return line;
  const cells = line.split("|");
  if (cells.length < 3) return line;

  return cells
    .map((cell, index) => {
      if (index === 0 || index === cells.length - 1) return cell.trim();
      if (index === 1) return cell.trim();
      return stripInlineLineRefs(cell);
    })
    .join(" | ")
    .replace(/^/u, "")
    .replace(/\s+$/u, "");
}

export function canonicalizeSourceNormalizationMarkdown(
  sourceId: string,
  markdown: string,
  options: { pageNumber?: number | undefined } = {},
) {
  const lines = markdown.replace(/\r\n/gu, "\n").split("\n");
  const firstPageHeading = lines.findIndex((line) => /^## Page \d+/u.test(line.trim()));
  const bodyLines = (firstPageHeading === -1 ? lines : lines.slice(firstPageHeading))
    .map((line) => canonicalizeMarkdownTableRow(line.trimEnd()))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  const pageLabel = options.pageNumber === undefined ? "" : ` page ${options.pageNumber}`;
  return [`# Source normalization: ${sourceId}${pageLabel}`, "", bodyLines].join("\n").trimEnd() + "\n";
}

function blockKind(normalizedText: string) {
  if (/^[•*-]\s+/u.test(normalizedText)) return "list_item" as const;
  if (normalizedText.length <= 80 && !/[.!?]$/u.test(normalizedText) && /[A-Za-z]/u.test(normalizedText)) return "heading" as const;
  return "text" as const;
}

function pagePrefix(pageNumber: number) {
  return `p${String(pageNumber).padStart(3, "0")}`;
}

function roundedCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

function decodeXmlText(text: string) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/gu, (_match, entity: string) => {
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return '"';
    if (entity === "apos") return "'";
    if (entity.startsWith("#x")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    }
    return "";
  });
}

export function buildSourceBlocksFromText(sourceId: string, text: string): StagedSourceBlock[] {
  const blocks: StagedSourceBlock[] = [];
  const pages = text.split("\f");
  let pageStart = 0;
  let readingOrder = 0;

  for (const [pageIndex, pageText] of pages.entries()) {
    const pageNumber = pageIndex + 1;
    const prefix = pagePrefix(pageNumber);
    let lineStart = 0;
    let pageBlock = 0;

    for (const line of pageText.split("\n")) {
      const absoluteLineStart = pageStart + lineStart;
      const rawText = line;
      const normalizedText = normalizeOcrText(rawText);
      if (normalizedText) {
        pageBlock += 1;
        readingOrder += 1;
        blocks.push({
          source_id: sourceId,
          block_id: `${prefix}_b${String(pageBlock).padStart(4, "0")}`,
          page_number: pageNumber,
          reading_order: readingOrder,
          source_surface: "ocr_text",
          block_kind: blockKind(normalizedText),
          raw_source_path: sourceRelativePath(sourceId, "text.txt"),
          raw_start_char: absoluteLineStart,
          raw_end_char: absoluteLineStart + line.length,
          raw_text: rawText,
          normalized_text: normalizedText,
          raw_text_sha256: sha256(rawText),
          normalized_text_sha256: sha256(normalizedText),
        });
      }

      lineStart += line.length + 1;
    }

    pageStart += pageText.length + 1;
  }

  return blocks;
}

type ChandraCachedBlock = {
  order?: number | undefined;
  kind?: string | undefined;
  label?: string | undefined;
  text?: string | undefined;
  bbox?: number[] | undefined;
};

type ChandraCachedPage = {
  engine?: string | undefined;
  model?: string | undefined;
  status?: string | undefined;
  error?: unknown;
  page_number?: number | undefined;
  image_size?: number[] | undefined;
  render_dpi?: number | undefined;
  blocks?: ChandraCachedBlock[] | undefined;
};

type ChandraManifest = {
  page_count?: number | undefined;
};

const PDF_EVIDENCE_SURFACES = new Set<StagedSourceBlock["source_surface"]>(["chandra_ocr", "pdf_text"]);

function chandraSourceDir(sourceId: string) {
  return join(sourceDirForId(sourceId), "chandra");
}

function chandraPagesDir(sourceId: string) {
  return join(chandraSourceDir(sourceId), "pages");
}

function chandraPageNumber(fileName: string) {
  const match = /^p(\d{3,})\.json$/u.exec(fileName);
  return match ? Number(match[1]) : undefined;
}

function sourcePdfPath(sourceId: string) {
  return join(sourceDirForId(sourceId), "source.pdf");
}

function sourceHasPdf(sourceId: string) {
  return existsSync(sourcePdfPath(sourceId));
}

function pdfTextPagesDir(sourceId: string) {
  return join(sourceDirForId(sourceId), "pdf-text", "pages");
}

function pdfTextPageFileName(pageNumber: number) {
  return `${pagePrefix(pageNumber)}.txt`;
}

function pdfTextPagePath(sourceId: string, pageNumber: number) {
  return join(pdfTextPagesDir(sourceId), pdfTextPageFileName(pageNumber));
}

function pdfTextPageRelativePath(sourceId: string, pageNumber: number) {
  return `raw/sources/${sourceId}/pdf-text/pages/${pdfTextPageFileName(pageNumber)}`;
}

function pdfInfoPageCount(sourceId: string) {
  if (!sourceHasPdf(sourceId)) return undefined;
  const result = spawnSync("pdfinfo", [sourcePdfPath(sourceId)], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.status !== 0) return undefined;
  const match = /^Pages:\s+(\d+)$/mu.exec(result.stdout);
  if (!match) return undefined;
  const pageCount = Number(match[1]);
  return Number.isInteger(pageCount) && pageCount > 0 ? pageCount : undefined;
}

function chandraManifestPageCount(sourceId: string) {
  const manifestPath = join(chandraSourceDir(sourceId), "manifest.json");
  if (!existsSync(manifestPath)) return undefined;
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as ChandraManifest;
  return parsed.page_count;
}

function pdfSourcePageCount(sourceId: string) {
  return chandraManifestPageCount(sourceId) ?? pdfInfoPageCount(sourceId);
}

function isHealthyChandraPage(parsed: ChandraCachedPage, expectedPageNumber: number | undefined) {
  if (parsed.status === "error" || parsed.error === true) return false;
  if (expectedPageNumber !== undefined && parsed.page_number !== undefined && parsed.page_number !== expectedPageNumber) return false;
  if (parsed.status === "ok") return true;
  return Array.isArray(parsed.blocks);
}

function healthyChandraPageNumbers(sourceId: string) {
  const pagesDir = chandraPagesDir(sourceId);
  if (!existsSync(pagesDir)) return [];

  return readdirSync(pagesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^p\d{3,}\.json$/u.test(entry.name))
    .map((entry) => {
      const pageNumber = chandraPageNumber(entry.name);
      if (!pageNumber) return undefined;
      try {
        const parsed = JSON.parse(readFileSync(join(pagesDir, entry.name), "utf8")) as ChandraCachedPage;
        return isHealthyChandraPage(parsed, pageNumber) ? pageNumber : undefined;
      } catch {
        return undefined;
      }
    })
    .filter((pageNumber): pageNumber is number => pageNumber !== undefined)
    .sort((a, b) => a - b);
}

function chandraBlockKind(kind: string | undefined): NonNullable<StagedSourceBlock["block_kind"]> {
  const normalizedKind = kind?.toLowerCase().replace(/_/gu, "-");
  if (normalizedKind === "heading" || normalizedKind === "title" || normalizedKind === "section-header" || normalizedKind === "page-header") return "heading";
  if (normalizedKind === "list-item" || normalizedKind === "list-group" || normalizedKind === "list_item") return "list_item";
  if (normalizedKind === "caption") return "caption";
  if (normalizedKind === "table" || normalizedKind === "form") return "table";
  if (normalizedKind === "figure" || normalizedKind === "image" || normalizedKind === "picture" || normalizedKind === "diagram") return "figure";
  if (normalizedKind === "footnote" || normalizedKind === "page-footer" || normalizedKind === "page-number") return "footnote";
  return "text";
}

export function hasChandraOcr(sourceId: string) {
  return healthyChandraPageNumbers(sourceId).length > 0;
}

export function readChandraSourceBlocks(sourceId: string): StagedSourceBlock[] {
  const pagesDir = chandraPagesDir(sourceId);
  if (!existsSync(pagesDir)) return [];

  const pageFiles = readdirSync(pagesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^p\d{3,}\.json$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => (chandraPageNumber(a) ?? 0) - (chandraPageNumber(b) ?? 0) || a.localeCompare(b));

  const blocks: StagedSourceBlock[] = [];
  for (const fileName of pageFiles) {
    const pagePath = join(pagesDir, fileName);
    const parsed = JSON.parse(readFileSync(pagePath, "utf8")) as ChandraCachedPage;
    const pageNumber = parsed.page_number ?? chandraPageNumber(fileName);
    if (!pageNumber) continue;
    if (!isHealthyChandraPage(parsed, pageNumber)) continue;

    const pageBlocks = (parsed.blocks ?? [])
      .filter((block) => normalizeOcrText(block.text ?? ""))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    let pageOffset = 0;
    let pageBlockCount = 0;
    for (const block of pageBlocks) {
      const rawText = block.text ?? "";
      const normalizedText = normalizeOcrText(rawText);
      if (!normalizedText) continue;

      pageBlockCount += 1;
      const blockId = `${pagePrefix(pageNumber)}_c${String(pageBlockCount).padStart(4, "0")}`;
      const rawStart = pageOffset;
      const rawEnd = rawStart + rawText.length;
      pageOffset = rawEnd + 1;
      const bbox = block.bbox && block.bbox.length >= 4 ? block.bbox : undefined;
      const stagedBlock: StagedSourceBlock = {
        source_id: sourceId,
        block_id: blockId,
        page_number: pageNumber,
        reading_order: blocks.length + 1,
        source_surface: "chandra_ocr",
        block_kind: chandraBlockKind(block.kind ?? block.label),
        raw_source_path: `raw/sources/${sourceId}/chandra/pages/${fileName}`,
        raw_start_char: rawStart,
        raw_end_char: rawEnd,
        raw_text: rawText,
        normalized_text: normalizedText,
        raw_text_sha256: sha256(rawText),
        normalized_text_sha256: sha256(normalizedText),
        ocr_engine: parsed.engine ?? "chandra-ocr-2",
        ocr_model: parsed.model ?? "datalab-to/chandra-ocr-2",
      };
      if (bbox) {
        stagedBlock.x_min = roundedCoordinate(bbox[0]!);
        stagedBlock.y_min = roundedCoordinate(bbox[1]!);
        stagedBlock.x_max = roundedCoordinate(bbox[2]!);
        stagedBlock.y_max = roundedCoordinate(bbox[3]!);
      }
      if (parsed.image_size?.length === 2) {
        stagedBlock.image_width = parsed.image_size[0];
        stagedBlock.image_height = parsed.image_size[1];
      }
      if (parsed.render_dpi !== undefined) stagedBlock.image_dpi = parsed.render_dpi;
      blocks.push(stagedBlock);
    }
  }

  return blocks;
}

function readOrExtractPdfTextPage(sourceId: string, pageNumber: number) {
  const cachedPath = pdfTextPagePath(sourceId, pageNumber);
  if (existsSync(cachedPath)) return readFileSync(cachedPath, "utf8");

  const result = spawnSync("pdftotext", ["-f", String(pageNumber), "-l", String(pageNumber), "-layout", sourcePdfPath(sourceId), "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout.trim()) return "";

  const text = result.stdout.replace(/\f+\s*$/u, "").trimEnd();
  if (!text.trim()) return "";
  mkdirSync(pdfTextPagesDir(sourceId), { recursive: true });
  writeFileSync(cachedPath, `${text}\n`, "utf8");
  return `${text}\n`;
}

function pdfTextBlockKind(rawText: string, normalizedText: string): NonNullable<StagedSourceBlock["block_kind"]> {
  const columnLikeSegments = rawText.split(/\s{2,}/u).filter((segment) => segment.trim()).length;
  if (columnLikeSegments >= 4) return "table_row";
  return blockKind(normalizedText);
}

function readPdfTextSourceBlocks(sourceId: string, pageNumbers: number[]): StagedSourceBlock[] {
  const blocks: StagedSourceBlock[] = [];

  for (const pageNumber of pageNumbers) {
    const pageText = readOrExtractPdfTextPage(sourceId, pageNumber);
    if (!pageText.trim()) continue;

    let lineStart = 0;
    let pageBlock = 0;
    for (const line of pageText.split("\n")) {
      const rawText = line;
      const normalizedText = normalizeOcrText(rawText);
      if (normalizedText) {
        pageBlock += 1;
        blocks.push({
          source_id: sourceId,
          block_id: `${pagePrefix(pageNumber)}_p${String(pageBlock).padStart(4, "0")}`,
          page_number: pageNumber,
          reading_order: blocks.length + 1,
          source_surface: "pdf_text",
          block_kind: pdfTextBlockKind(rawText, normalizedText),
          raw_source_path: pdfTextPageRelativePath(sourceId, pageNumber),
          raw_start_char: lineStart,
          raw_end_char: lineStart + line.length,
          raw_text: rawText,
          normalized_text: normalizedText,
          raw_text_sha256: sha256(rawText),
          normalized_text_sha256: sha256(normalizedText),
          ocr_engine: "poppler-pdftotext",
          ocr_model: "pdftotext-layout",
        });
      }

      lineStart += line.length + 1;
    }
  }

  return blocks;
}

function cachedPdfTextPageNumbers(sourceId: string) {
  const pagesDir = pdfTextPagesDir(sourceId);
  if (!existsSync(pagesDir)) return [];

  return readdirSync(pagesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^p\d{3,}\.txt$/u.test(entry.name))
    .map((entry) => Number.parseInt(entry.name.slice(1, -4), 10))
    .filter((pageNumber) => Number.isFinite(pageNumber))
    .sort((a, b) => a - b);
}

function isPdfEvidenceBlock(block: StagedSourceBlock) {
  return PDF_EVIDENCE_SURFACES.has(block.source_surface);
}

function orderSourceBlocks(blocks: StagedSourceBlock[]) {
  return blocks
    .sort((a, b) => a.page_number - b.page_number || a.block_id.localeCompare(b.block_id))
    .map((block, index) => ({ ...block, reading_order: index + 1 }));
}

export function chandraOcrReadiness(sourceId: string) {
  const pdfPath = sourcePdfPath(sourceId);
  const hasPdf = existsSync(pdfPath);
  const pageCount = hasPdf ? chandraManifestPageCount(sourceId) : undefined;
  const completedPages = healthyChandraPageNumbers(sourceId);
  const completedPageSet = new Set(completedPages);
  const missingPages =
    pageCount === undefined ? [] : Array.from({ length: pageCount }, (_unused, index) => index + 1).filter((pageNumber) => !completedPageSet.has(pageNumber));
  const blockCount = readChandraSourceBlocks(sourceId).length;
  const ready = hasPdf && pageCount !== undefined && missingPages.length === 0 && blockCount > 0;

  return {
    sourceId,
    hasPdf,
    pageCount,
    completedPages,
    missingPages,
    blockCount,
    ready,
  };
}

export function pdfSourceEvidenceReadiness(sourceId: string) {
  const hasPdf = sourceHasPdf(sourceId);
  const pageCount = hasPdf ? pdfSourcePageCount(sourceId) : undefined;
  const blocks = existsSync(sourceBlocksPath(sourceId)) ? readStagedSourceBlocks(sourceId).filter(isPdfEvidenceBlock) : [];
  const completedPages = [...new Set([...healthyChandraPageNumbers(sourceId), ...blocks.map((block) => block.page_number)])].sort((a, b) => a - b);
  const completedPageSet = new Set(completedPages);
  const missingPages =
    pageCount === undefined ? [] : Array.from({ length: pageCount }, (_unused, index) => index + 1).filter((pageNumber) => !completedPageSet.has(pageNumber));
  const fallbackPages = [...new Set(blocks.filter((block) => block.source_surface === "pdf_text").map((block) => block.page_number))].sort((a, b) => a - b);
  const ready = hasPdf && pageCount !== undefined && missingPages.length === 0 && blocks.length > 0;

  return {
    sourceId,
    hasPdf,
    pageCount,
    completedPages,
    missingPages,
    fallbackPages,
    blockCount: blocks.length,
    ready,
  };
}

export function assertChandraOcrReadyForIngest(sourceId: string) {
  const status = chandraOcrReadiness(sourceId);
  if (status.ready) return status;

  const missingSummary = status.missingPages.length > 0 ? ` missing pages: ${status.missingPages.slice(0, 20).join(", ")}` : "";
  const pageCount = status.pageCount === undefined ? "unknown" : String(status.pageCount);
  throw new Error(
    `Chandra OCR is required before ingest for ${sourceId}. source.pdf=${status.hasPdf ? "present" : "missing"} pages=${pageCount} completed=${status.completedPages.length} chandra_blocks=${status.blockCount}.${missingSummary}`,
  );
}

export function assertSourceReadyForIngest(sourceId: string) {
  if (sourceHasPdf(sourceId)) {
    const status = pdfSourceEvidenceReadiness(sourceId);
    if (status.ready) {
      return {
        sourceId,
        hasPdf: true,
        blockCount: status.blockCount,
        completedPages: status.completedPages,
        missingPages: status.missingPages,
      };
    }

    const missingSummary = status.missingPages.length > 0 ? ` missing pages: ${status.missingPages.slice(0, 20).join(", ")}` : "";
    const pageCount = status.pageCount === undefined ? "unknown" : String(status.pageCount);
    throw new Error(
      `PDF source evidence blocks are required before ingest for ${sourceId}. source.pdf=present pages=${pageCount} completed=${status.completedPages.length} source_blocks=${status.blockCount}.${missingSummary}`,
    );
  }

  const blockCount = readStagedSourceBlocks(sourceId).length;
  if (blockCount > 0) {
    return {
      sourceId,
      hasPdf: false,
      blockCount,
      completedPages: [],
      missingPages: [],
    };
  }

  throw new Error(`Source evidence blocks are required before ingest for ${sourceId}. Run source preparation first.`);
}

function writeSourceBlocks(sourceId: string, sourceDir: string, textPath: string | undefined) {
  const chandraBlocks = readChandraSourceBlocks(sourceId);
  if (sourceHasPdf(sourceId)) {
    const pageCount = pdfSourcePageCount(sourceId);
    const chandraPages = new Set(chandraBlocks.map((block) => block.page_number));
    const missingChandraPages =
      pageCount === undefined ? [] : Array.from({ length: pageCount }, (_unused, index) => index + 1).filter((pageNumber) => !chandraPages.has(pageNumber));
    const pdfTextPages = [...new Set([...missingChandraPages, ...cachedPdfTextPageNumbers(sourceId)])].sort((a, b) => a - b);
    const pdfTextBlocks = readPdfTextSourceBlocks(sourceId, pdfTextPages);
    const blocks = orderSourceBlocks([...chandraBlocks, ...pdfTextBlocks]);
    const blocksPath = join(sourceDir, "blocks.jsonl");
    writeFileSync(blocksPath, blocks.length > 0 ? `${blocks.map((block) => JSON.stringify(block)).join("\n")}\n` : "", "utf8");
    clearStagedSourceBlockCaches(sourceId);
    return { blocksPath, blockCount: blocks.length };
  }

  if (!textPath) {
    throw new Error(`Source preparation requires Chandra OCR for PDFs or a readable text surface for non-PDF sources: ${sourceDir}`);
  }

  const text = readFileSync(textPath, "utf8");
  const blocks = buildSourceBlocksFromText(sourceId, text);
  const blocksPath = join(sourceDir, "blocks.jsonl");
  writeFileSync(blocksPath, blocks.map((block) => JSON.stringify(block)).join("\n") + "\n", "utf8");
  clearStagedSourceBlockCaches(sourceId);
  return { blocksPath, blockCount: blocks.length };
}

export function rebuildSourceBlocks(sourceId: string) {
  const sourceDir = sourceDirForId(sourceId);
  if (sourceHasPdf(sourceId)) {
    return writeSourceBlocks(sourceId, sourceDir, undefined);
  }

  const textPath = extractTextSurface(sourceDir);
  if (!textPath) {
    throw new Error(`Source preparation requires a readable text surface to generate blocks.jsonl: ${sourceDir}`);
  }

  return writeSourceBlocks(sourceId, sourceDir, textPath);
}

export function prepareSource(sourceDirInput: string, options: PrepareSourceOptions = {}): PreparedSourceResult {
  const inputDir = resolve(sourceDirInput);
  if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) {
    throw new Error(`Source directory not found: ${sourceDirInput}`);
  }

  const metadata = readMetadata(inputDir);
  const sourceId = options.sourceId ?? metadata.sourceId;
  const outputDir = join(repoRoot, "raw", "sources", sourceId);
  const copiedFiles = copyTopLevelFiles(inputDir, outputDir);
  const isPdf = existsSync(join(outputDir, "source.pdf"));
  const textPath = isPdf ? undefined : extractTextSurface(outputDir);
  if (!isPdf && !textPath) {
    throw new Error(`Source preparation requires a readable text surface to generate blocks.jsonl: ${outputDir}`);
  }

  const stageMetadata = {
    ...metadata,
    sourceId,
    upstreamSourceId: sourceId === metadata.sourceId ? metadata.upstreamSourceId : metadata.sourceId,
    stagedAt: new Date().toISOString(),
    stagedFrom: inputDir,
  };

  writeFileSync(join(outputDir, "metadata.json"), `${JSON.stringify(stageMetadata, null, 2)}\n`, "utf8");
  const { blocksPath, blockCount } = writeSourceBlocks(sourceId, outputDir, textPath);

  return {
    sourceId,
    upstreamSourceId: stageMetadata.upstreamSourceId,
    sourceDir: outputDir,
    copiedFiles,
    textPath,
    textBytes: textPath ? statSync(textPath).size : undefined,
    blocksPath,
    blockCount,
  };
}

export function sourceDirForId(sourceId: string) {
  return join(repoRoot, "raw", "sources", sourceId);
}

export function readStagedSourceMetadata(sourceId: string): StagedSourceMetadata {
  const metadataPath = join(sourceDirForId(sourceId), "metadata.json");
  if (!existsSync(metadataPath)) {
    throw new Error(`Missing staged source metadata: ${metadataPath}`);
  }

  return JSON.parse(readFileSync(metadataPath, "utf8")) as StagedSourceMetadata;
}

export function sourceBlocksPath(sourceId: string) {
  return join(sourceDirForId(sourceId), "blocks.jsonl");
}

export function sourceBlocksRelativePath(sourceId: string) {
  return sourceRelativePath(sourceId, "blocks.jsonl");
}

const stagedSourceBlocksCache = new Map<string, { mtimeMs: number; size: number; blocks: StagedSourceBlock[] }>();
const stagedSourceBlockByIdCache = new Map<string, Map<string, StagedSourceBlock>>();

function clearStagedSourceBlockCaches(sourceId: string) {
  stagedSourceBlocksCache.delete(sourceId);
  stagedSourceBlockByIdCache.delete(sourceId);
}

export function readStagedSourceBlocks(sourceId: string) {
  const blocksPath = sourceBlocksPath(sourceId);
  if (!existsSync(blocksPath)) {
    throw new Error(`Missing staged source blocks for ${sourceId}; run prepare-source first.`);
  }

  const blocksStat = statSync(blocksPath);
  const cached = stagedSourceBlocksCache.get(sourceId);
  if (cached && cached.mtimeMs === blocksStat.mtimeMs && cached.size === blocksStat.size) {
    return cached.blocks;
  }

  const blocks = readFileSync(blocksPath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as StagedSourceBlock);
  stagedSourceBlocksCache.set(sourceId, { mtimeMs: blocksStat.mtimeMs, size: blocksStat.size, blocks });
  stagedSourceBlockByIdCache.set(sourceId, new Map(blocks.map((block) => [block.block_id, block])));
  return blocks;
}

export function evidenceId(sourceId: string, blockId: string) {
  return `${sourceId}#${blockId}`;
}

function resolveAgentCitationBlockId(blockId: string, blocks: StagedSourceBlock[]): string {
  const exact = blocks.find((candidate) => candidate.block_id === blockId);
  if (exact) return blockId;

  const rangeParts = blockId.split("..");
  if (rangeParts.length === 2 && rangeParts[0] && rangeParts[1]) {
    return `${resolveAgentCitationBlockId(rangeParts[0], blocks)}..${resolveAgentCitationBlockId(rangeParts[1], blocks)}`;
  }

  const aliasMatch = /^(p\d{3,})_b(\d{4,})$/u.exec(blockId);
  if (!aliasMatch) return blockId;

  const [, pageId, ordinal] = aliasMatch;
  const chandraBlockId = `${pageId}_c${ordinal}`;
  const chandraBlock = blocks.find((candidate) => candidate.block_id === chandraBlockId && candidate.source_surface === "chandra_ocr");
  return chandraBlock?.block_id ?? blockId;
}

function sourceBlockRangeById(sourceId: string, blockRange: string, blocks: StagedSourceBlock[]): StagedSourceBlock {
  const [startBlockId, endBlockId, ...rest] = blockRange.split("..");
  if (!startBlockId || !endBlockId || rest.length > 0) {
    throw new Error(`Invalid source block range ${sourceId}#${blockRange}`);
  }

  const startBlock = blocks.find((candidate) => candidate.block_id === startBlockId);
  const endBlock = blocks.find((candidate) => candidate.block_id === endBlockId);
  if (!startBlock || !endBlock) throw new Error(`Unknown source block range ${sourceId}#${blockRange}`);
  if (startBlock.page_number !== endBlock.page_number) {
    throw new Error(`Source block range must stay within one page: ${sourceId}#${blockRange}`);
  }

  const pageBlocks = blocks.filter((candidate) => candidate.page_number === startBlock.page_number);
  const startIndex = pageBlocks.findIndex((candidate) => candidate.block_id === startBlock.block_id);
  const endIndex = pageBlocks.findIndex((candidate) => candidate.block_id === endBlock.block_id);
  if (startIndex === -1 || endIndex === -1) throw new Error(`Unknown source block range ${sourceId}#${blockRange}`);

  const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  const children = pageBlocks.slice(from, to + 1);
  const rawText = children.map((block) => block.raw_text).join("\n");
  const normalizedText = normalizeOcrText(children.map((block) => block.normalized_text).join("\n"));

  return {
    source_id: sourceId,
    block_id: `${startBlock.block_id}..${endBlock.block_id}`,
    page_number: startBlock.page_number,
    reading_order: Math.min(...children.map((child) => child.reading_order)),
    source_surface: startBlock.source_surface,
    block_kind: "range",
    child_block_ids: children.map((child) => child.block_id),
    source_line_ids: [...new Set(children.flatMap((child) => child.source_line_ids ?? []))].sort(),
    raw_source_path: sourceBlocksRelativePath(sourceId),
    raw_start_char: Math.min(...children.map((child) => child.raw_start_char)),
    raw_end_char: Math.max(...children.map((child) => child.raw_end_char)),
    raw_text: rawText,
    normalized_text: normalizedText,
    raw_text_sha256: sha256(rawText),
    normalized_text_sha256: sha256(normalizedText),
  } satisfies StagedSourceBlock;
}

export function sourceBlockById(sourceId: string, blockId: string) {
  const blocks = readStagedSourceBlocks(sourceId);
  const resolvedBlockId = resolveAgentCitationBlockId(blockId, blocks);
  const block = stagedSourceBlockByIdCache.get(sourceId)?.get(resolvedBlockId);
  if (!block && resolvedBlockId.includes("..")) return sourceBlockRangeById(sourceId, resolvedBlockId, blocks);
  if (!block) throw new Error(`Unknown source block ${sourceId}#${blockId}`);
  return block;
}

export function sourceRelativePath(sourceId: string, fileName: string) {
  return `raw/sources/${sourceId}/${basename(fileName)}`;
}
