import { describe, expect, it } from "bun:test";
import { crc32 } from "node:zlib";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  buildSourceBlocksFromText,
  canonicalizeSourceNormalizationMarkdown,
  extractMtaDrupalDataTableText,
  pdfSourceEvidenceReadiness,
  readChandraSourceBlocks,
  rebuildSourceBlocks,
} from "@mta-wiki/pipeline/sources/source-prep";
import { applySpreadsheetPreview, writeSpreadsheetPreview } from "@mta-wiki/pipeline/sources/source-prep-preview";

function dosDateTime() {
  return { date: 0x5021, time: 0 };
}

function tinyZip(files: Record<string, string>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { date, time } = dosDateTime();

  for (const [name, content] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(content);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

describe("buildSourceBlocksFromText", () => {
  it("creates citeable OCR text blocks from plain text lines", () => {
    const blocks = buildSourceBlocksFromText("test_source", "Heading\nColumn A  Column B\n10  20\n\nAfter table\n");

    expect(blocks.map((block) => block.block_id)).toEqual(["p001_b0001", "p001_b0002", "p001_b0003", "p001_b0004"]);
    expect(blocks.map((block) => block.normalized_text)).toEqual(["Heading", "Column A Column B", "10 20", "After table"]);
    expect(blocks[0]).toMatchObject({
      source_surface: "ocr_text",
      block_kind: "heading",
      raw_source_path: "raw/sources/test_source/text.txt",
    });
  });
});

describe("extractMtaDrupalDataTableText", () => {
  it("recovers client-rendered route dates and changes as one citeable row", () => {
    const settings = {
      mtaDatatable: {
        21: {
          csvData: {
            data: [
              {
                Route: { value: "B62" },
                P1: { value: "<p><strong>Changes to the B62 took effect August 31, 2025.</strong></p>" },
                P2: { value: "<p>The B62 will be extended along 21 St to Astoria Houses.</p>" },
                P3: { value: "" },
              },
            ],
          },
        },
      },
    };
    const escaped = JSON.stringify(settings).replace(/</gu, "\\u003C").replace(/>/gu, "\\u003E");
    const html = `<script type="application/json" data-drupal-selector="drupal-settings-json">${escaped}</script>`;

    expect(extractMtaDrupalDataTableText(html)).toEqual([
      "B62 | Changes to the B62 took effect August 31, 2025. | The B62 will be extended along 21 St to Astoria Houses.",
    ]);
  });
});

describe("readChandraSourceBlocks", () => {
  it("turns cached Chandra page JSON into primary raw-text citation blocks", () => {
    const sourceId = "test_chandra_source_fixture";
    const sourceDir = join(repoRoot, "raw", "sources", sourceId);
    rmSync(sourceDir, { recursive: true, force: true });
    mkdirSync(join(sourceDir, "chandra", "pages"), { recursive: true });
    try {
      writeFileSync(
        join(sourceDir, "chandra", "pages", "p002.json"),
        `${JSON.stringify(
          {
            source_id: sourceId,
            page_number: 2,
            engine: "chandra-ocr-2",
            model: "datalab-to/chandra-ocr-2",
            render_dpi: 150,
            image_size: [1650, 1275],
            blocks: [
              {
                order: 2,
                kind: "table",
                text: "Metric | Value",
                bbox: [10.1234, 20.5678, 30.1, 40.9],
              },
              {
                order: 1,
                kind: "title",
                text: "  Better Buses  ",
                bbox: [1, 2, 3, 4],
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const blocks = readChandraSourceBlocks(sourceId);

      expect(blocks.map((block) => block.block_id)).toEqual(["p002_c0001", "p002_c0002"]);
      expect(blocks[0]).toMatchObject({
        source_surface: "chandra_ocr",
        block_kind: "heading",
        raw_text: "  Better Buses  ",
        normalized_text: "Better Buses",
        raw_source_path: `raw/sources/${sourceId}/chandra/pages/p002.json`,
        image_width: 1650,
        image_height: 1275,
        image_dpi: 150,
        ocr_engine: "chandra-ocr-2",
        ocr_model: "datalab-to/chandra-ocr-2",
      });
      expect(blocks[1]).toMatchObject({
        block_kind: "table",
        raw_text: "Metric | Value",
        x_min: 10.12,
        y_min: 20.57,
        x_max: 30.1,
        y_max: 40.9,
      });
      expect(blocks[0]?.raw_text_sha256).not.toBe(blocks[0]?.normalized_text_sha256);
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});

describe("rebuildSourceBlocks", () => {
  it("fills Chandra-missing PDF pages from explicit native PDF text fallback blocks", () => {
    const sourceId = "test_pdf_text_fallback_fixture";
    const sourceDir = join(repoRoot, "raw", "sources", sourceId);
    rmSync(sourceDir, { recursive: true, force: true });
    mkdirSync(join(sourceDir, "chandra", "pages"), { recursive: true });
    mkdirSync(join(sourceDir, "pdf-text", "pages"), { recursive: true });
    try {
      writeFileSync(join(sourceDir, "source.pdf"), "dummy pdf placeholder", "utf8");
      writeFileSync(
        join(sourceDir, "chandra", "manifest.json"),
        `${JSON.stringify({ source_id: sourceId, page_count: 2, completed_pages: [1], missing_pages: [2] }, null, 2)}\n`,
        "utf8",
      );
      writeFileSync(
        join(sourceDir, "chandra", "pages", "p001.json"),
        `${JSON.stringify(
          {
            source_id: sourceId,
            page_number: 1,
            status: "ok",
            blocks: [{ order: 1, kind: "title", text: "OCR page" }],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      writeFileSync(join(sourceDir, "pdf-text", "pages", "p002.txt"), "Vendor    Amount    Status    Address\nACME      10        Open      1 Main\n", "utf8");

      const result = rebuildSourceBlocks(sourceId);
      const blocks = readFileSync(result.blocksPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      expect(blocks.map((block) => block.block_id)).toEqual(["p001_c0001", "p002_p0001", "p002_p0002"]);
      expect(blocks.map((block) => block.source_surface)).toEqual(["chandra_ocr", "pdf_text", "pdf_text"]);
      expect(blocks.map((block) => block.reading_order)).toEqual([1, 2, 3]);
      expect(blocks[1]).toMatchObject({
        block_kind: "table_row",
        raw_source_path: `raw/sources/${sourceId}/pdf-text/pages/p002.txt`,
        ocr_engine: "poppler-pdftotext",
      });

      expect(pdfSourceEvidenceReadiness(sourceId)).toMatchObject({
        ready: true,
        pageCount: 2,
        completedPages: [1, 2],
        fallbackPages: [2],
      });
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("preserves cached native PDF text blocks for pages that also have Chandra OCR", () => {
    const sourceId = "test_pdf_text_compat_fixture";
    const sourceDir = join(repoRoot, "raw", "sources", sourceId);
    rmSync(sourceDir, { recursive: true, force: true });
    mkdirSync(join(sourceDir, "chandra", "pages"), { recursive: true });
    mkdirSync(join(sourceDir, "pdf-text", "pages"), { recursive: true });
    try {
      writeFileSync(join(sourceDir, "source.pdf"), "dummy pdf placeholder", "utf8");
      writeFileSync(
        join(sourceDir, "chandra", "manifest.json"),
        `${JSON.stringify({ source_id: sourceId, page_count: 1, completed_pages: [1], missing_pages: [] }, null, 2)}\n`,
        "utf8",
      );
      writeFileSync(
        join(sourceDir, "chandra", "pages", "p001.json"),
        `${JSON.stringify(
          {
            source_id: sourceId,
            page_number: 1,
            status: "ok",
            blocks: [{ order: 1, kind: "title", text: "OCR page title" }],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      writeFileSync(join(sourceDir, "pdf-text", "pages", "p001.txt"), "Native PDF title\n", "utf8");

      const result = rebuildSourceBlocks(sourceId);
      const blocks = readFileSync(result.blocksPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      expect(blocks.map((block) => block.block_id)).toEqual(["p001_c0001", "p001_p0001"]);
      expect(blocks.map((block) => block.source_surface)).toEqual(["chandra_ocr", "pdf_text"]);
      expect(pdfSourceEvidenceReadiness(sourceId)).toMatchObject({
        ready: true,
        pageCount: 1,
        completedPages: [1],
        fallbackPages: [1],
      });
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("counts healthy blank Chandra pages as completed PDF evidence pages", () => {
    const sourceId = "test_blank_chandra_page_fixture";
    const sourceDir = join(repoRoot, "raw", "sources", sourceId);
    rmSync(sourceDir, { recursive: true, force: true });
    mkdirSync(join(sourceDir, "chandra", "pages"), { recursive: true });
    try {
      writeFileSync(join(sourceDir, "source.pdf"), "dummy pdf placeholder", "utf8");
      writeFileSync(
        join(sourceDir, "chandra", "manifest.json"),
        `${JSON.stringify({ source_id: sourceId, page_count: 2, completed_pages: [1, 2], missing_pages: [] }, null, 2)}\n`,
        "utf8",
      );
      writeFileSync(
        join(sourceDir, "chandra", "pages", "p001.json"),
        `${JSON.stringify(
          {
            source_id: sourceId,
            page_number: 1,
            status: "ok",
            blocks: [{ order: 1, kind: "title", text: "OCR page title" }],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      writeFileSync(
        join(sourceDir, "chandra", "pages", "p002.json"),
        `${JSON.stringify(
          {
            source_id: sourceId,
            page_number: 2,
            status: "ok",
            blocks: [],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const result = rebuildSourceBlocks(sourceId);
      const blocks = readFileSync(result.blocksPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      expect(blocks.map((block) => block.block_id)).toEqual(["p001_c0001"]);
      expect(pdfSourceEvidenceReadiness(sourceId)).toMatchObject({
        ready: true,
        pageCount: 2,
        completedPages: [1, 2],
        missingPages: [],
      });
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});

describe("canonicalizeSourceNormalizationMarkdown", () => {
  it("stores only normalized source content and drops prompt-like preamble", () => {
    const markdown = canonicalizeSourceNormalizationMarkdown(
      "test_source",
      `# Source normalization draft: test_source page 5

This is an editable experimental copy of the PDF text layout.

Rules:
- This should not be stored.

Example:

\`\`\`md
[pNNN_l0001] sample
\`\`\`

## Page 5

### [p005_l0001] Off-board Fare Payment

[p005_l0002 p005_l0003] With off-board fare payment, customers pay their fare before boarding.

| refs | Direction | Location |
|------|-----------|----------|
| [p005_l0004] | Eastbound | Amsterdam Avenue |
| [p005_l0005 p005_l0006] | [p005_l0005] Westbound | [p005_l0006] Broadway |
`,
      { pageNumber: 5 },
    );

    expect(markdown).toStartWith("# Source normalization: test_source page 5");
    expect(markdown).toContain("## Page 5");
    expect(markdown).toContain("### [p005_l0001] Off-board Fare Payment");
    expect(markdown).toContain("[p005_l0002 p005_l0003] With off-board fare payment, customers pay their fare before boarding.");
    expect(markdown).toContain("| [p005_l0004] | Eastbound | Amsterdam Avenue |");
    expect(markdown).toContain("| [p005_l0005 p005_l0006] | Westbound | Broadway |");
    expect(markdown).not.toContain("| [p005_l0005 p005_l0006] | [p005_l0005] Westbound | [p005_l0006] Broadway |");
    expect(markdown).not.toContain("Rules:");
    expect(markdown).not.toContain("Example:");
    expect(markdown).not.toContain("editable experimental copy");
  });
});

describe("writeSpreadsheetPreview", () => {
  it("writes a sidecar preview for workbook sheets, rows, and cells without touching blocks", () => {
    const sourceId = "test_spreadsheet_preview";
    const runId = "test-spreadsheet-preview";
    const sourceDir = join(repoRoot, "raw", "sources", sourceId);
    const outputDir = join(repoRoot, "data", "source-prep", runId, sourceId);
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(sourceDir, { recursive: true });
    try {
      writeFileSync(join(sourceDir, "metadata.json"), `${JSON.stringify({ sourceId, title: "Workbook fixture" })}\n`, "utf8");
      writeFileSync(join(sourceDir, "blocks.jsonl"), "", "utf8");
      writeFileSync(
        join(sourceDir, "source.xlsx"),
        tinyZip({
          "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Fuel Hedge" sheetId="1" r:id="rId1"/></sheets></workbook>`,
          "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
          "xl/sharedStrings.xml": `<?xml version="1.0" encoding="UTF-8"?>
<sst><si><t>Month</t></si><si><t>Gallons</t></si><si><t>July &amp; August</t></si></sst>`,
          "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?>
<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c></row></sheetData></worksheet>`,
        }),
      );

      const result = writeSpreadsheetPreview(sourceId, { runId, generatedAt: "2026-06-23T00:00:00.000Z" });

      expect(result.status).toBe("ok");
      expect(result.sheets).toHaveLength(1);
      expect(result.sheets[0]?.rows[1]?.cells.map((cell) => [cell.ref, cell.text])).toEqual([
        ["A2", "July & August"],
        ["B2", "42"],
      ]);
      expect(readFileSync(join(sourceDir, "blocks.jsonl"), "utf8")).toBe("");
      expect(readFileSync(result.markdown_path, "utf8")).toContain("A2=July & August");

      const applied = applySpreadsheetPreview(sourceId, { runId });
      expect(applied.block_count).toBeGreaterThan(0);
      expect(readFileSync(join(sourceDir, "text.txt"), "utf8")).toContain("Sheet: Fuel Hedge");
      expect(readFileSync(join(sourceDir, "blocks.jsonl"), "utf8")).toContain("[Fuel Hedge!A2] July & August");
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("writes an explicit unsupported sidecar for legacy xls workbooks", () => {
    const sourceId = "test_spreadsheet_preview_xls";
    const runId = "test-spreadsheet-preview-xls";
    const sourceDir = join(repoRoot, "raw", "sources", sourceId);
    const outputDir = join(repoRoot, "data", "source-prep", runId, sourceId);
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(sourceDir, { recursive: true });
    try {
      writeFileSync(join(sourceDir, "metadata.json"), `${JSON.stringify({ sourceId, title: "Legacy workbook fixture" })}\n`, "utf8");
      writeFileSync(join(sourceDir, "blocks.jsonl"), "", "utf8");
      writeFileSync(join(sourceDir, "source.xls"), "legacy-binary-placeholder", "utf8");

      const result = writeSpreadsheetPreview(sourceId, { runId, generatedAt: "2026-06-23T00:00:00.000Z" });

      expect(result.status).toBe("unsupported");
      expect(result.source_path).toBe(`raw/sources/${sourceId}/source.xls`);
      expect(result.reason).toContain("Legacy source.xls");
      expect(result.sheets).toEqual([]);
      expect(readFileSync(join(sourceDir, "blocks.jsonl"), "utf8")).toBe("");
      expect(readFileSync(result.markdown_path, "utf8")).toContain("Legacy source.xls");
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
