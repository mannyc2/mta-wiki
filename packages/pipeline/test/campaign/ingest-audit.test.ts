import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { auditIngestRun } from "@mta-wiki/pipeline/campaign/ingest-audit";
import { createSubmissionEntry } from "@mta-wiki/pipeline/records/submissions";
import type { StagedSourceBlock } from "@mta-wiki/db/types";

const sourceId = "test_ingest_audit_source";
const runId = "test_ingest_audit_run";
const blockId = "p001_c0001";

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function writeFixtureBlock(rawText = "MTA buses exempted from left turn restrictions at signed locations") {
  const sourceDir = join(repoRoot, "raw", "sources", sourceId);
  mkdirSync(sourceDir, { recursive: true });
  const block: StagedSourceBlock = {
    source_id: sourceId,
    block_id: blockId,
    page_number: 1,
    reading_order: 1,
    source_surface: "chandra_ocr",
    block_kind: "text",
    raw_source_path: `raw/sources/${sourceId}/chandra/pages/p001.json`,
    raw_start_char: 0,
    raw_end_char: rawText.length,
    raw_text: rawText,
    normalized_text: rawText,
    raw_text_sha256: sha256(rawText),
    normalized_text_sha256: sha256(rawText),
  };
  writeFileSync(join(sourceDir, "blocks.jsonl"), `${JSON.stringify(block)}\n`, "utf8");
}

function writeFixtureSubmission() {
  mkdirSync(join(repoRoot, "data", "submissions"), { recursive: true });
  const entry = createSubmissionEntry(runId, {
    source_id: sourceId,
    observation_kind: "route",
    local_observation_id: "route_m14_ad_sbs",
    label: "M14 A/D Select Bus Service",
    payload: {
      operator: "MTA New York City Transit",
      route_id: "M14 A/D",
      route_designation: "M14 A/D",
    },
    evidence_refs: [
      {
        source_id: sourceId,
        block_id: blockId,
      },
    ],
  });
  const path = join(repoRoot, "data", "submissions", `${runId}.jsonl`);
  writeFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
  return path;
}

function writeFixtureTranscript() {
  const transcriptDir = join(repoRoot, "data", "transcripts", "runs", runId);
  mkdirSync(transcriptDir, { recursive: true });
  const events = [
    { type: "mta_source_normalization_skipped", reason: "chandra_raw_block_cutover" },
    { type: "tool_execution_start", toolName: "mta_read_source", args: { source_id: sourceId } },
    { type: "mta_tool_read_source", sourceId, blockCount: 1, returnedBlocks: 1 },
    { type: "tool_execution_start", toolName: "mta_read_evidence", args: { source_id: sourceId, block_id: blockId } },
    { type: "tool_execution_start", toolName: "mta_submit_observation", args: { source_id: sourceId } },
    { type: "usage_recorded", requestCount: 2, totalTokens: 2000, cost: 0.02 },
  ];
  writeFileSync(join(transcriptDir, "events.jsonl"), `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
}

function cleanupFixture() {
  rmSync(join(repoRoot, "raw", "sources", sourceId), { recursive: true, force: true });
  rmSync(join(repoRoot, "data", "submissions", `${runId}.jsonl`), { force: true });
  rmSync(join(repoRoot, "data", "transcripts", "runs", runId), { recursive: true, force: true });
}

describe("auditIngestRun", () => {
  it("summarizes accepted submissions and Chandra/raw evidence use", () => {
    cleanupFixture();
    try {
      writeFixtureBlock();
      const submissionPath = writeFixtureSubmission();

      const report = auditIngestRun(submissionPath);

      expect(report.rows).toBe(1);
      expect(report.state_counts).toEqual({ accepted: 1 });
      expect(report.observation_kind_counts).toEqual({ route: 1 });
      expect(report.evidence_text_source_counts).toEqual({ raw_text: 1 });
      expect(report.evidence_source_surface_counts).toEqual({ chandra_ocr: 1 });
      expect(report.unique_evidence_block_count).toBe(1);
      expect(report.warnings.map((warning) => warning.code)).toContain("payload_field_not_in_evidence");
    } finally {
      cleanupFixture();
    }
  });

  it("summarizes transcript tool use and run efficiency when events exist", () => {
    cleanupFixture();
    try {
      writeFixtureBlock();
      const submissionPath = writeFixtureSubmission();
      writeFixtureTranscript();

      const report = auditIngestRun(submissionPath);

      expect(report.transcript).toMatchObject({
        found: true,
        normalization_skipped: true,
        read_source_calls: 1,
        read_evidence_calls: 1,
        submit_observation_calls: 1,
        read_source_returned_blocks: [1],
        read_evidence_block_ids: [blockId],
      });
      expect(report.usage).toMatchObject({
        request_count: 2,
        total_tokens: 2000,
        estimated_cost: 0.02,
        accepted_per_1k_tokens: 0.5,
        cost_per_accepted_submission: 0.02,
      });
    } finally {
      cleanupFixture();
    }
  });
});
