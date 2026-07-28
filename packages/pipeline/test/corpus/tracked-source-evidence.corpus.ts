import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { MtaCanonicalRecord } from "../../../db/src/types";

type SourceBlock = {
  block_id: string;
  raw_text: string;
  raw_text_sha256: string;
};

export type CorpusAuditContext = {
  rootDir: string;
};

const REVIEWED_SOURCE_FAMILIES = new Set([
  "2014_10_07_brt_flushingjamaica_pw1_presentation",
  "brt_broadway_roosevelt_ave_queens_blvd_apr2019",
  "dekalb_lafayette_cb2_dec2024",
  "flatbush_ave_bus_priority_cb6_oct2025",
  "meeting_doc_108036",
  "meeting_doc_124996",
  "meeting_doc_127471",
  "meeting_doc_127506",
  "meeting_doc_128931",
  "meeting_doc_131981",
  "meeting_doc_133231",
  "meeting_doc_135421",
  "meeting_doc_143341",
  "meeting_doc_154976",
  "meeting_doc_155001",
  "meeting_doc_160441",
  "meeting_doc_160446",
  "meeting_doc_171141",
  "meeting_doc_174076",
  "meeting_doc_177271",
  "meeting_doc_187251",
  "meeting_doc_190506",
  "meeting_doc_194096",
  "meeting_doc_194506",
  "mta_ace_routes_may2025_cut",
  "newburgh_beacon_changes_january_2026",
  "nyc_dot_gun_hill_road_completion_2023",
  "nyct_key_performance_metrics_doc194001",
  "tremont_ave_bus_priority_cb5_nov2024",
]);

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function canonicalRecords(rootDir: string): MtaCanonicalRecord[] {
  const directory = join(rootDir, "data/canonical");
  return readdirSync(directory)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .flatMap((name) => readJsonl<MtaCanonicalRecord>(join(directory, name)));
}

export function runCorpusAudit(context: CorpusAuditContext): string[] {
  const failures: string[] = [];
  const refs = canonicalRecords(context.rootDir)
    .flatMap((record) => record.evidence_refs)
    .filter((ref) => REVIEWED_SOURCE_FAMILIES.has(ref.source_id) && ref.block_id && ref.text_sha256);
  const refsBySource = new Map<string, typeof refs>();
  for (const ref of refs) refsBySource.set(ref.source_id, [...(refsBySource.get(ref.source_id) ?? []), ref]);

  for (const sourceId of [...REVIEWED_SOURCE_FAMILIES].sort()) {
    const path = join(context.rootDir, "raw/sources", sourceId, "blocks.jsonl");
    if (!existsSync(path)) {
      failures.push(`missing raw/sources/${sourceId}/blocks.jsonl`);
      continue;
    }
    let blocks: SourceBlock[];
    try {
      blocks = readJsonl<SourceBlock>(path);
    } catch (error) {
      failures.push(`invalid raw/sources/${sourceId}/blocks.jsonl: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const byId = new Map(blocks.map((block) => [block.block_id, block]));
    for (const ref of refsBySource.get(sourceId) ?? []) {
      const block = byId.get(ref.block_id!);
      if (!block) {
        failures.push(`missing ${sourceId}#${ref.block_id}`);
        continue;
      }
      if (block.raw_text_sha256 !== ref.text_sha256) {
        failures.push(`${sourceId}#${ref.block_id} hash differs from tracked canonical evidence`);
      }
      const computed = `sha256:${createHash("sha256").update(block.raw_text).digest("hex")}`;
      if (computed !== block.raw_text_sha256) failures.push(`${sourceId}#${ref.block_id} raw_text hash is invalid`);
    }
  }
  return [...new Set(failures)].sort();
}
