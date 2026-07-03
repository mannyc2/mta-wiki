import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, normalize } from "node:path";
import { inflateRawSync } from "node:zlib";
import { repoRoot } from "@mta-wiki/core/paths";
import { buildSourceBlocksFromText, readStagedSourceMetadata, sourceDirForId } from "./source-prep.js";

export type SpreadsheetCellPreview = {
  ref: string;
  column: string;
  row: number;
  type?: string | undefined;
  style?: string | undefined;
  raw_value?: string | undefined;
  formula?: string | undefined;
  text: string;
};

export type SpreadsheetRowPreview = {
  row_number: number;
  cells: SpreadsheetCellPreview[];
};

export type SpreadsheetSheetPreview = {
  name: string;
  sheet_id?: string | undefined;
  path: string;
  row_count: number;
  cell_count: number;
  rows: SpreadsheetRowPreview[];
};

export type SpreadsheetPreviewManifest = {
  kind: "spreadsheet_preview";
  status: "ok" | "unsupported";
  source_id: string;
  run_id: string;
  generated_at: string;
  source_path: string;
  source_sha256?: string | undefined;
  reason?: string | undefined;
  sheets: SpreadsheetSheetPreview[];
};

export type WriteSpreadsheetPreviewOptions = {
  runId?: string | undefined;
  generatedAt?: string | undefined;
};

export type ApplySpreadsheetPreviewOptions = {
  runId: string;
};

type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

function sha256File(path: string) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function defaultRunId(now = new Date()) {
  return `spreadsheet-preview-${now.toISOString().replace(/[:.]/gu, "-")}`;
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

function attrs(xml: string) {
  const values: Record<string, string> = {};
  for (const match of xml.matchAll(/([A-Za-z_][\w:.-]*)="([^"]*)"/gu)) {
    values[match[1]!] = decodeXmlText(match[2]!);
  }
  return values;
}

function tagText(xml: string, tagName: string) {
  const match = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "u").exec(xml);
  return match ? decodeXmlText(match[1]!) : undefined;
}

function textRuns(xml: string) {
  const values: string[] = [];
  for (const match of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gu)) values.push(decodeXmlText(match[1]!));
  return values.join("");
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Invalid xlsx zip: missing end of central directory");
}

function readZipEntries(buffer: Buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, ZipEntry>();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid xlsx zip: bad central directory entry");
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    entries.set(name, { name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipFile(buffer: Buffer, entries: Map<string, ZipEntry>, name: string) {
  const entry = entries.get(name);
  if (!entry) return undefined;
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) throw new Error(`Invalid xlsx zip: bad local file header for ${name}`);
  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compressionMethod === 0) return compressed.toString("utf8");
  if (entry.compressionMethod === 8) return inflateRawSync(compressed).toString("utf8");
  throw new Error(`Unsupported xlsx zip compression method ${entry.compressionMethod} for ${name}`);
}

function resolveWorkbookTarget(target: string) {
  const normalized = normalize(target.startsWith("/") ? target.slice(1) : join("xl", target)).replace(/\\/gu, "/");
  return normalized.startsWith("xl/") ? normalized : `xl/${normalized}`;
}

function parseWorkbookSheets(workbookXml: string, relationshipsXml: string | undefined) {
  const relationships = new Map<string, string>();
  for (const relMatch of (relationshipsXml ?? "").matchAll(/<Relationship\b[^>]*\/?>/gu)) {
    const relAttrs = attrs(relMatch[0]!);
    if (relAttrs.Id && relAttrs.Target) relationships.set(relAttrs.Id, resolveWorkbookTarget(relAttrs.Target));
  }

  const sheets: { name: string; sheetId?: string | undefined; path: string }[] = [];
  for (const sheetMatch of workbookXml.matchAll(/<sheet\b[^>]*\/?>/gu)) {
    const sheetAttrs = attrs(sheetMatch[0]!);
    const relationshipId = sheetAttrs["r:id"];
    const path = relationshipId ? relationships.get(relationshipId) : undefined;
    if (!sheetAttrs.name || !path) continue;
    sheets.push({ name: sheetAttrs.name, sheetId: sheetAttrs.sheetId, path });
  }
  return sheets;
}

function parseSharedStrings(xml: string | undefined) {
  if (!xml) return [];
  const strings: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu)) strings.push(textRuns(match[1]!));
  return strings;
}

function columnFromCellRef(ref: string) {
  return /^[A-Z]+/u.exec(ref)?.[0] ?? "";
}

function rowFromCellRef(ref: string) {
  const parsed = Number.parseInt(/\d+$/u.exec(ref)?.[0] ?? "", 10);
  return Number.isInteger(parsed) ? parsed : 0;
}

function cellText(cellXml: string, cellAttrs: Record<string, string>, sharedStrings: string[]) {
  if (cellAttrs.t === "inlineStr") return textRuns(cellXml);
  const rawValue = tagText(cellXml, "v");
  if (cellAttrs.t === "s") {
    const index = rawValue === undefined ? Number.NaN : Number.parseInt(rawValue, 10);
    return Number.isInteger(index) ? (sharedStrings[index] ?? "") : "";
  }
  if (cellAttrs.t === "b") return rawValue === "1" ? "TRUE" : rawValue === "0" ? "FALSE" : (rawValue ?? "");
  return rawValue ?? "";
}

function parseSheet(xml: string, sheet: { name: string; sheetId?: string | undefined; path: string }, sharedStrings: string[]) {
  const rows: SpreadsheetRowPreview[] = [];
  let cellCount = 0;

  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/gu)) {
    const rowAttrs = attrs(rowMatch[1]!);
    const rowNumber = Number.parseInt(rowAttrs.r ?? "", 10);
    const cells: SpreadsheetCellPreview[] = [];
    for (const cellMatch of rowMatch[2]!.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/gu)) {
      const cellAttrs = attrs(cellMatch[1]!);
      const ref = cellAttrs.r;
      if (!ref) continue;
      const body = cellMatch[2] ?? "";
      const text = cellText(body, cellAttrs, sharedStrings);
      const rawValue = tagText(body, "v");
      const formula = tagText(body, "f");
      cells.push({
        ref,
        column: columnFromCellRef(ref),
        row: rowFromCellRef(ref),
        type: cellAttrs.t,
        style: cellAttrs.s,
        raw_value: rawValue,
        formula,
        text,
      });
    }
    if (cells.length > 0) {
      cellCount += cells.length;
      rows.push({ row_number: Number.isInteger(rowNumber) ? rowNumber : cells[0]!.row, cells });
    }
  }

  return {
    name: sheet.name,
    sheet_id: sheet.sheetId,
    path: sheet.path,
    row_count: rows.length,
    cell_count: cellCount,
    rows,
  } satisfies SpreadsheetSheetPreview;
}

export function buildSpreadsheetPreview(sourceId: string, options: WriteSpreadsheetPreviewOptions = {}): SpreadsheetPreviewManifest {
  const sourceDir = sourceDirForId(sourceId);
  const xlsxPath = join(sourceDir, "source.xlsx");
  const xlsPath = join(sourceDir, "source.xls");
  const runId = options.runId ?? defaultRunId();
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  if (existsSync(xlsPath) && statSync(xlsPath).size > 0 && !existsSync(xlsxPath)) {
    return {
      kind: "spreadsheet_preview",
      status: "unsupported",
      source_id: sourceId,
      run_id: runId,
      generated_at: generatedAt,
      source_path: `raw/sources/${sourceId}/source.xls`,
      source_sha256: sha256File(xlsPath),
      reason: "Legacy source.xls workbooks are not supported by the deterministic XLSX sidecar preview yet",
      sheets: [],
    };
  }

  if (!existsSync(xlsxPath) || statSync(xlsxPath).size === 0) {
    return {
      kind: "spreadsheet_preview",
      status: "unsupported",
      source_id: sourceId,
      run_id: runId,
      generated_at: generatedAt,
      source_path: `raw/sources/${sourceId}/source.xlsx`,
      reason: "Missing readable source.xlsx",
      sheets: [],
    };
  }

  try {
    const buffer = readFileSync(xlsxPath);
    const entries = readZipEntries(buffer);
    const workbookXml = readZipFile(buffer, entries, "xl/workbook.xml");
    if (!workbookXml) {
      return {
        kind: "spreadsheet_preview",
        status: "unsupported",
        source_id: sourceId,
        run_id: runId,
        generated_at: generatedAt,
        source_path: `raw/sources/${sourceId}/source.xlsx`,
        source_sha256: sha256File(xlsxPath),
        reason: "source.xlsx does not contain xl/workbook.xml",
        sheets: [],
      };
    }

    const sharedStrings = parseSharedStrings(readZipFile(buffer, entries, "xl/sharedStrings.xml"));
    const workbookRelationships = readZipFile(buffer, entries, "xl/_rels/workbook.xml.rels");
    const sheets = parseWorkbookSheets(workbookXml, workbookRelationships).map((sheet) => {
      const sheetXml = readZipFile(buffer, entries, sheet.path);
      return sheetXml ? parseSheet(sheetXml, sheet, sharedStrings) : { ...sheet, row_count: 0, cell_count: 0, rows: [] };
    });

    return {
      kind: "spreadsheet_preview",
      status: "ok",
      source_id: sourceId,
      run_id: runId,
      generated_at: generatedAt,
      source_path: `raw/sources/${sourceId}/source.xlsx`,
      source_sha256: sha256File(xlsxPath),
      sheets,
    };
  } catch (error) {
    return {
      kind: "spreadsheet_preview",
      status: "unsupported",
      source_id: sourceId,
      run_id: runId,
      generated_at: generatedAt,
      source_path: `raw/sources/${sourceId}/source.xlsx`,
      source_sha256: sha256File(xlsxPath),
      reason: error instanceof Error ? error.message : String(error),
      sheets: [],
    };
  }
}

function markdownCell(text: string) {
  return text.replace(/\r?\n/gu, " ").replace(/\|/gu, "\\|").trim();
}

export function spreadsheetPreviewMarkdown(preview: SpreadsheetPreviewManifest) {
  const metadata = existsSync(join(sourceDirForId(preview.source_id), "metadata.json")) ? readStagedSourceMetadata(preview.source_id) : undefined;
  const lines = [
    `# Spreadsheet source-prep preview: ${preview.source_id}`,
    "",
    `- Status: ${preview.status}`,
    `- Run: ${preview.run_id}`,
    `- Source: ${preview.source_path}`,
  ];
  if (metadata?.title) lines.push(`- Title: ${metadata.title}`);
  if (preview.reason) lines.push(`- Reason: ${preview.reason}`);
  lines.push("");

  for (const sheet of preview.sheets) {
    lines.push(`## ${sheet.name}`, "");
    lines.push(`- Sheet path: ${sheet.path}`);
    lines.push(`- Rows: ${sheet.row_count}`);
    lines.push(`- Cells: ${sheet.cell_count}`);
    lines.push("");
    lines.push("| Row | Cells |");
    lines.push("| --- | --- |");
    for (const row of sheet.rows.slice(0, 50)) {
      const cells = row.cells.map((cell) => `${cell.ref}=${markdownCell(cell.text)}`).join("<br>");
      lines.push(`| ${row.row_number} | ${cells || "(empty)"} |`);
    }
    if (sheet.rows.length > 50) lines.push(`| ... | ${sheet.rows.length - 50} more rows omitted from Markdown preview; see preview.json. |`);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function writeSpreadsheetPreview(sourceId: string, options: WriteSpreadsheetPreviewOptions = {}) {
  const preview = buildSpreadsheetPreview(sourceId, options);
  const outputDir = join(repoRoot, "data", "source-prep", preview.run_id, sourceId);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, "preview.json");
  const markdownPath = join(outputDir, "preview.md");
  writeFileSync(jsonPath, `${JSON.stringify(preview, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, spreadsheetPreviewMarkdown(preview), "utf8");
  return {
    ...preview,
    output_dir: outputDir,
    json_path: jsonPath,
    markdown_path: markdownPath,
    output_label: join("data", "source-prep", preview.run_id, sourceId, basename(jsonPath)),
    markdown_label: join("data", "source-prep", preview.run_id, sourceId, basename(markdownPath)),
  };
}

function spreadsheetPreviewPath(sourceId: string, runId: string) {
  return join(repoRoot, "data", "source-prep", runId, sourceId, "preview.json");
}

function previewRowText(sheetName: string, row: SpreadsheetRowPreview) {
  const cells = row.cells
    .filter((cell) => cell.text.trim())
    .map((cell) => `[${sheetName}!${cell.ref}] ${cell.text.trim()}`);
  return cells.join(" | ");
}

export function spreadsheetPreviewTextSurface(preview: SpreadsheetPreviewManifest) {
  const lines: string[] = [`Spreadsheet source: ${preview.source_id}`, `Preview run: ${preview.run_id}`, `Source file: ${preview.source_path}`];
  for (const sheet of preview.sheets) {
    lines.push("", `Sheet: ${sheet.name}`, `Sheet path: ${sheet.path}`, `Rows: ${sheet.row_count}`, `Cells: ${sheet.cell_count}`, "");
    for (const row of sheet.rows) {
      const rowText = previewRowText(sheet.name, row);
      if (rowText) lines.push(`Row ${row.row_number}: ${rowText}`);
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function applySpreadsheetPreview(sourceId: string, options: ApplySpreadsheetPreviewOptions) {
  if (!options.runId) throw new Error("source-prep apply requires --run-id so the reviewed preview is explicit");
  const previewPath = spreadsheetPreviewPath(sourceId, options.runId);
  if (!existsSync(previewPath)) throw new Error(`Missing spreadsheet preview sidecar: ${previewPath}`);
  const preview = JSON.parse(readFileSync(previewPath, "utf8")) as SpreadsheetPreviewManifest;
  if (preview.source_id !== sourceId) throw new Error(`Preview source id mismatch: expected ${sourceId}, found ${preview.source_id}`);
  if (preview.status !== "ok") throw new Error(`Cannot apply spreadsheet preview for ${sourceId}: status=${preview.status}${preview.reason ? ` reason=${preview.reason}` : ""}`);

  const sourceDir = sourceDirForId(sourceId);
  const text = spreadsheetPreviewTextSurface(preview);
  const textPath = join(sourceDir, "text.txt");
  const blocksPath = join(sourceDir, "blocks.jsonl");
  const blocks = buildSourceBlocksFromText(sourceId, text);
  writeFileSync(textPath, text, "utf8");
  writeFileSync(blocksPath, `${blocks.map((block) => JSON.stringify(block)).join("\n")}\n`, "utf8");
  return {
    source_id: sourceId,
    run_id: options.runId,
    preview_path: previewPath,
    text_path: textPath,
    blocks_path: blocksPath,
    block_count: blocks.length,
    sheet_count: preview.sheets.length,
    row_count: preview.sheets.reduce((count, sheet) => count + sheet.row_count, 0),
    cell_count: preview.sheets.reduce((count, sheet) => count + sheet.cell_count, 0),
  };
}
