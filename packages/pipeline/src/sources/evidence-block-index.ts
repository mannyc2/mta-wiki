import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import { sourceBlockById, sourceBlocksRelativePath } from "@mta-wiki/pipeline/sources/source-prep";

export type EvidenceBlockIndexEntry = {
  source_id: string;
  block_id: string;
  resolved_block_id: string;
  page_number: number;
  source_path: string;
  raw_text_sha256: string;
  source_surface?: string | undefined;
  block_kind?: string | undefined;
  child_block_ids?: string[] | undefined;
};

export type EvidenceBlockIndex = {
  byRef: Map<string, EvidenceBlockIndexEntry>;
  sourceIds: Set<string>;
};

export type EvidenceBlockIndexWriteResult = {
  path: string;
  entryCount: number;
  sourceCount: number;
};

export function evidenceBlockIndexPath() {
  return join(repoRoot, "data", "evidence-block-index.jsonl");
}

function evidenceRefKey(sourceId: string, blockId: string) {
  return `${sourceId}\0${blockId}`;
}

export function buildEvidenceBlockIndexEntries(records: readonly MtaCanonicalRecord[]): EvidenceBlockIndexEntry[] {
  const requestedRefs = new Set<string>();
  for (const record of records) {
    for (const ref of record.evidence_refs) {
      if (!ref.source_id || !ref.block_id) continue;
      requestedRefs.add(evidenceRefKey(ref.source_id, ref.block_id));
    }
  }

  const entries: EvidenceBlockIndexEntry[] = [];
  for (const key of [...requestedRefs].sort()) {
    const [sourceId, blockId] = key.split("\0");
    if (!sourceId || !blockId) continue;
    const block = sourceBlockById(sourceId, blockId);
    entries.push({
      source_id: sourceId,
      block_id: blockId,
      resolved_block_id: block.block_id,
      page_number: block.page_number,
      source_path: sourceBlocksRelativePath(sourceId),
      raw_text_sha256: block.raw_text_sha256,
      source_surface: block.source_surface,
      block_kind: block.block_kind,
      child_block_ids: block.child_block_ids,
    });
  }
  return entries;
}

export function writeEvidenceBlockIndex(records: readonly MtaCanonicalRecord[], path = evidenceBlockIndexPath()): EvidenceBlockIndexWriteResult {
  const entries = buildEvidenceBlockIndexEntries(records);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  return { path, entryCount: entries.length, sourceCount: new Set(entries.map((entry) => entry.source_id)).size };
}

export function readEvidenceBlockIndex(path = evidenceBlockIndexPath()): EvidenceBlockIndex | undefined {
  if (!existsSync(path)) return undefined;
  const byRef = new Map<string, EvidenceBlockIndexEntry>();
  const sourceIds = new Set<string>();
  const lines = readFileSync(path, "utf8").split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    let entry: EvidenceBlockIndexEntry;
    try {
      entry = JSON.parse(line) as EvidenceBlockIndexEntry;
    } catch (error) {
      throw new Error(`Invalid JSONL in data/evidence-block-index.jsonl:${index + 1}: ${String(error)}`);
    }
    byRef.set(evidenceRefKey(entry.source_id, entry.block_id), entry);
    sourceIds.add(entry.source_id);
  }
  return { byRef, sourceIds };
}

export function evidenceBlockIndexEntry(index: EvidenceBlockIndex | undefined, sourceId: string, blockId: string) {
  return index?.byRef.get(evidenceRefKey(sourceId, blockId));
}
