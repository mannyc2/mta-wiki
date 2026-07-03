import { repoRoot } from "@mta-wiki/core/paths";
import { countDeepSeekTokens, DEEPSEEK_TOKENIZER_ID, DEEPSEEK_TOKENIZER_SHA256 } from "@mta-wiki/pipeline/sources/deepseek-tokenizer";
import { evidenceId, readStagedSourceBlocks, readStagedSourceMetadata, sourceBlockById } from "@mta-wiki/pipeline/sources/source-prep";
import type { MtaEvidenceRef, StagedSourceBlock, StagedSourceMetadata } from "@mta-wiki/db/types";

export const DEFAULT_SOURCE_WINDOW_BLOCKS = 120;
export const INLINE_SOURCE_PACKET_MAX_TOKENS = 120_000;

export type SourceWindowOptions = {
  pageNumber?: number | undefined;
  startBlock?: number | undefined;
  maxBlocks?: number | undefined;
};

function blockText(block: StagedSourceBlock) {
  return block.raw_text.replace(/\s*\n\s*/gu, " ").trim();
}

function pagePrefix(pageNumber: number) {
  return `p${String(pageNumber).padStart(3, "0")}`;
}

function sourceBlockOrdinal(blockId: string) {
  const match = /^p\d{3,}_[a-z]+(\d{4,})$/u.exec(blockId);
  return match?.[1];
}

export function citationBlockId(block: StagedSourceBlock): string {
  if (block.block_kind === "range" && block.child_block_ids?.length) {
    const [first, ...rest] = block.child_block_ids;
    const last = rest.at(-1) ?? first;
    if (first && last) {
      return `${citationBlockId(sourceBlockById(block.source_id, first))}..${citationBlockId(sourceBlockById(block.source_id, last))}`;
    }
  }

  // Cite Chandra OCR blocks by their native ids (e.g. p001_c0001). Do NOT rewrite the
  // surface letter: the legacy `ocr_text` surface uses p###_b#### ids, so rewriting
  // chandra c#### -> b#### collides with real ocr_text blocks and resolveAgentCitationBlockId
  // exact-matches the wrong (legacy) block, causing silent misresolution and "must cite the
  // primary source evidence blocks" rejections.
  return block.block_id;
}

export function minimalEvidenceRef(sourceId: string, blockId: string): MtaEvidenceRef {
  const block = sourceBlockById(sourceId, blockId);
  const visibleBlockId = citationBlockId(block);
  return {
    source_id: sourceId,
    evidence_id: evidenceId(sourceId, visibleBlockId),
    page_number: block.page_number,
    block_id: visibleBlockId,
    block_range: visibleBlockId.includes("..") ? visibleBlockId : undefined,
    child_block_ids: block.child_block_ids?.map((childBlockId) => citationBlockId(sourceBlockById(sourceId, childBlockId))),
  };
}

export function agentVisibleMetadata(metadata: StagedSourceMetadata) {
  return {
    sourceId: metadata.sourceId,
    upstreamSourceId: metadata.upstreamSourceId,
    title: metadata.title,
    publisher: metadata.publisher,
    sourceGroup: metadata.sourceGroup,
    sourceUrl: metadata.sourceUrl,
    documentDate: metadata.documentDate,
    retrievedAt: metadata.retrievedAt,
    contentType: metadata.contentType,
    detectedContentType: metadata.detectedContentType,
    sha256: metadata.sha256,
  };
}

export function agentVisibleBlock(sourceId: string, block: StagedSourceBlock) {
  return {
    evidence_id: evidenceId(sourceId, citationBlockId(block)),
    block_id: citationBlockId(block),
    page_number: block.page_number,
    reading_order: block.reading_order,
    block_kind: block.block_kind,
    child_block_ids: block.child_block_ids?.map((childBlockId) => citationBlockId(sourceBlockById(sourceId, childBlockId))),
    source_line_ids: block.source_line_ids,
    x_min: block.x_min,
    y_min: block.y_min,
    x_max: block.x_max,
    y_max: block.y_max,
    font_id: block.font_id,
    font_size: block.font_size,
    image_width: block.image_width,
    image_height: block.image_height,
    image_dpi: block.image_dpi,
    raw_text: block.raw_text,
    normalized_text: block.normalized_text,
  };
}

export function ingestVisibleBlocks(sourceId: string) {
  const blocks = readStagedSourceBlocks(sourceId);
  const primaryPdfBlocks = blocks.filter((block) => block.source_surface === "chandra_ocr" || block.source_surface === "pdf_text");
  const visibleBlocks = primaryPdfBlocks.length > 0 ? primaryPdfBlocks : blocks;
  if (visibleBlocks.length === 0) {
    throw new Error(`Source evidence blocks are required for ingest: ${sourceId}`);
  }
  return visibleBlocks;
}

function blockMarkdown(block: StagedSourceBlock) {
  const ref = `[${citationBlockId(block)}]`;
  const text = blockText(block);
  switch (block.block_kind) {
    case "heading":
      return `### ${ref} ${text}`;
    case "list_item":
      return `- ${ref} ${text}`;
    case "caption":
    case "footnote":
      return `${ref} _${text}_`;
    case "figure":
      return `> ${ref} ${text}`;
    case "table":
    case "table_row":
      return `${ref}\n\n\`\`\`text\n${block.raw_text.trim()}\n\`\`\``;
    default:
      return `${ref} ${text}`;
  }
}

export function renderSourceWindowMarkdown(
  sourceId: string,
  metadata: StagedSourceMetadata,
  blocks: StagedSourceBlock[],
  options: {
    title?: string | undefined;
    filteredBlockCount?: number | undefined;
    startBlock?: number | undefined;
    returnedBlockCount?: number | undefined;
    nextStartBlock?: number | undefined;
    fullDocument?: boolean | undefined;
  } = {},
) {
  const startBlock = options.startBlock ?? 1;
  const returnedBlockCount = options.returnedBlockCount ?? blocks.length;
  const totalBlockCount = options.filteredBlockCount ?? blocks.length;
  const lines = [
    `# ${options.title ?? metadata.title ?? sourceId}`,
    "",
    `source_id: ${sourceId}`,
    "citation: cite block ids exactly as shown in square brackets",
    options.fullDocument ? `document: ${totalBlockCount} block(s)` : `window: returned ${returnedBlockCount} block(s) starting at ${startBlock} of ${totalBlockCount}`,
  ];
  if (options.nextStartBlock !== undefined) {
    lines.push(`next_window: call mta_read_source with start_block ${options.nextStartBlock}`);
  }

  let currentPage: number | undefined;
  for (const block of blocks) {
    if (block.page_number !== currentPage) {
      currentPage = block.page_number;
      lines.push("", `## Page ${currentPage}`, "");
    }
    lines.push(blockMarkdown(block));
  }

  if (options.nextStartBlock !== undefined) {
    lines.push("", `<!-- source window truncated; next_start_block=${options.nextStartBlock} -->`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function sourcePageManifestMarkdown(sourceId: string, blocks = ingestVisibleBlocks(sourceId)) {
  const byPage = new Map<number, StagedSourceBlock[]>();
  for (const block of blocks) byPage.set(block.page_number, [...(byPage.get(block.page_number) ?? []), block]);

  const lines = ["## Page Manifest", "", "| page | blocks | first_id | last_id | chars |", "| --- | ---: | --- | --- | ---: |"];
  for (const [pageNumber, pageBlocks] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    const chars = pageBlocks.reduce((sum, block) => sum + block.raw_text.length, 0);
    const first = pageBlocks[0];
    const last = pageBlocks.at(-1);
    lines.push(
      `| ${pageNumber} | ${pageBlocks.length} | ${first ? citationBlockId(first) : ""} | ${last ? citationBlockId(last) : ""} | ${chars} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function sourceWindow(sourceId: string, options: SourceWindowOptions = {}) {
  const metadata = readStagedSourceMetadata(sourceId);
  const allBlocks = ingestVisibleBlocks(sourceId);
  const filteredBlocks = options.pageNumber === undefined ? allBlocks : allBlocks.filter((block) => block.page_number === options.pageNumber);
  const maxBlocks = Math.max(1, options.maxBlocks ?? DEFAULT_SOURCE_WINDOW_BLOCKS);
  const startBlock = Math.max(1, options.startBlock ?? 1);
  const startIndex = startBlock - 1;
  const selectedBlocks = filteredBlocks.slice(startIndex, startIndex + maxBlocks);
  const nextStartBlock = startIndex + selectedBlocks.length < filteredBlocks.length ? startBlock + selectedBlocks.length : undefined;
  return {
    metadata,
    allBlocks,
    filteredBlocks,
    selectedBlocks,
    startBlock,
    maxBlocks,
    nextStartBlock,
    markdown: renderSourceWindowMarkdown(sourceId, metadata, selectedBlocks, {
      filteredBlockCount: filteredBlocks.length,
      startBlock,
      returnedBlockCount: selectedBlocks.length,
      nextStartBlock,
    }),
  };
}

function firstPageWindow(sourceId: string, blocks: StagedSourceBlock[]) {
  const firstPage = blocks[0]?.page_number;
  return sourceWindow(sourceId, {
    pageNumber: firstPage,
    maxBlocks: DEFAULT_SOURCE_WINDOW_BLOCKS,
  });
}

export function ingestPromptSourcePacket(sourceId: string, maxInlineTokens = INLINE_SOURCE_PACKET_MAX_TOKENS) {
  const metadata = readStagedSourceMetadata(sourceId);
  const blocks = ingestVisibleBlocks(sourceId);
  const fullMarkdown = renderSourceWindowMarkdown(sourceId, metadata, blocks, {
    title: `Source Packet: ${metadata.title ?? sourceId}`,
    filteredBlockCount: blocks.length,
    startBlock: 1,
    returnedBlockCount: blocks.length,
  });
  const fullTokenCount = countDeepSeekTokens(fullMarkdown);

  if (fullTokenCount <= maxInlineTokens) {
    return {
      mode: "full" as const,
      text: fullMarkdown,
      blockCount: blocks.length,
      packetTokenCount: fullTokenCount,
      fullTokenCount,
      maxInlineTokens,
      tokenizerId: DEEPSEEK_TOKENIZER_ID,
      tokenizerSha256: DEEPSEEK_TOKENIZER_SHA256,
    };
  }

  const preview = firstPageWindow(sourceId, blocks);
  const text = [
    `# Source Packet: ${metadata.title ?? sourceId}`,
    "",
    `source_id: ${sourceId}`,
    "citation: cite block ids exactly as shown in square brackets",
    `document_blocks: ${blocks.length}`,
    `inline_status: manifest plus first page window; source is too large to inline completely (${fullTokenCount} tokens > ${maxInlineTokens} token limit)`,
    "",
    sourcePageManifestMarkdown(sourceId, blocks).trimEnd(),
    "",
    "## Initial Page Window",
    "",
    preview.markdown.trimEnd(),
    "",
    `Use mta_read_source with page_number and start_block to read additional page windows.`,
    `source_root: ${repoRoot}/raw/sources/${sourceId}`,
  ].join("\n");

  const manifestText = `${text.trimEnd()}\n`;
  return {
    mode: "manifest" as const,
    text: manifestText,
    blockCount: blocks.length,
    packetTokenCount: countDeepSeekTokens(manifestText),
    fullTokenCount,
    maxInlineTokens,
    tokenizerId: DEEPSEEK_TOKENIZER_ID,
    tokenizerSha256: DEEPSEEK_TOKENIZER_SHA256,
  };
}

export function sourceDocumentMarkdown(sourceId: string) {
  const metadata = readStagedSourceMetadata(sourceId);
  const blocks = ingestVisibleBlocks(sourceId);
  return renderSourceWindowMarkdown(sourceId, metadata, blocks, {
    title: metadata.title ?? sourceId,
    filteredBlockCount: blocks.length,
    startBlock: 1,
    returnedBlockCount: blocks.length,
    fullDocument: true,
  });
}
