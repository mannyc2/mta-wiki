import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { ingestPromptSourcePacket, sourceDocumentMarkdown, sourceWindow } from "@mta-wiki/pipeline/sources/source-packet";
import type { StagedSourceBlock } from "@mta-wiki/db/types";

const sourceId = "test_source_packet_source";

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function fixtureBlock(
  block_id: string,
  raw_text: string,
  reading_order: number,
  page_number = 1,
  block_kind: StagedSourceBlock["block_kind"] = "text",
): StagedSourceBlock {
  return {
    source_id: sourceId,
    block_id,
    page_number,
    reading_order,
    source_surface: "chandra_ocr",
    block_kind,
    raw_source_path: `raw/sources/${sourceId}/chandra/pages/p${String(page_number).padStart(3, "0")}.json`,
    raw_start_char: 0,
    raw_end_char: raw_text.length,
    raw_text,
    normalized_text: raw_text,
    raw_text_sha256: sha256(raw_text),
    normalized_text_sha256: sha256(raw_text),
  };
}

function writeFixture(blocks: StagedSourceBlock[]) {
  const sourceDir = join(repoRoot, "raw", "sources", sourceId);
  rmSync(sourceDir, { recursive: true, force: true });
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    join(sourceDir, "metadata.json"),
    `${JSON.stringify({ sourceId, title: "Source Packet Fixture", contentType: "application/pdf" }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(join(sourceDir, "blocks.jsonl"), `${blocks.map((block) => JSON.stringify(block)).join("\n")}\n`, "utf8");
}

function cleanupFixture() {
  rmSync(join(repoRoot, "raw", "sources", sourceId), { recursive: true, force: true });
}

describe("source packet rendering", () => {
  it("renders neutral visible block ids in inline source packets", () => {
    writeFixture([
      fixtureBlock("p001_c0001", "Source Heading", 1, 1, "heading"),
      fixtureBlock("p001_c0002", "First source claim.", 2),
      fixtureBlock("p001_c0003", "A list item.", 3, 1, "list_item"),
    ]);
    try {
      const packet = ingestPromptSourcePacket(sourceId);

      expect(packet.mode).toBe("full");
      expect(packet.fullTokenCount).toBe(packet.packetTokenCount);
      expect(packet.maxInlineTokens).toBeGreaterThan(packet.fullTokenCount);
      expect(packet.tokenizerId).toBe("deepseek-v4");
      expect(packet.text).toContain("### [p001_c0001] Source Heading");
      expect(packet.text).toContain("[p001_c0002] First source claim.");
      expect(packet.text).toContain("- [p001_c0003] A list item.");
      expect(packet.text).not.toContain("bbox=");
      expect(packet.text).not.toContain("| text");
      expect(packet.text).not.toContain("chandra");
    } finally {
      cleanupFixture();
    }
  });

  it("exposes visible pagination metadata for truncated source windows", () => {
    writeFixture([
      fixtureBlock("p001_c0001", "First source claim.", 1),
      fixtureBlock("p001_c0002", "Second source claim.", 2),
      fixtureBlock("p001_c0003", "Third source claim.", 3),
    ]);
    try {
      const window = sourceWindow(sourceId, { maxBlocks: 2 });

      expect(window.nextStartBlock).toBe(3);
      expect(window.markdown).toContain("window: returned 2 block(s) starting at 1 of 3");
      expect(window.markdown).toContain("next_window: call mta_read_source with start_block 3");
    } finally {
      cleanupFixture();
    }
  });

  it("falls back to a manifest plus initial page window when the full packet is too large", () => {
    writeFixture([
      fixtureBlock("p001_c0001", "First source claim.", 1),
      fixtureBlock("p002_c0001", "Second-page source claim.", 2, 2),
    ]);
    try {
      const packet = ingestPromptSourcePacket(sourceId, 1);

      expect(packet.mode).toBe("manifest");
      expect(packet.text).toContain("inline_status: manifest plus first page window");
      expect(packet.text).toContain("tokens > 1 token limit");
      expect(packet.fullTokenCount).toBeGreaterThan(1);
      expect(packet.packetTokenCount).toBeGreaterThan(1);
      expect(packet.maxInlineTokens).toBe(1);
      expect(packet.tokenizerId).toBe("deepseek-v4");
      expect(packet.text).toContain("## Page Manifest");
      expect(packet.text).toContain("## Initial Page Window");
      expect(packet.text).toContain("[p001_c0001] First source claim.");
      expect(packet.text).toContain("| 2 | 1 | p002_c0001 | p002_c0001 |");
    } finally {
      cleanupFixture();
    }
  });

  it("renders wiki source documents as complete Markdown documents", () => {
    writeFixture([fixtureBlock("p001_c0001", "First source claim.", 1), fixtureBlock("p001_c0002", "Second source claim.", 2)]);
    try {
      const markdown = sourceDocumentMarkdown(sourceId);

      expect(markdown).toStartWith("# Source Packet Fixture");
      expect(markdown).toContain("document: 2 block(s)");
      expect(markdown).not.toContain("window:");
      expect(markdown).not.toStartWith("---");
    } finally {
      cleanupFixture();
    }
  });
});
