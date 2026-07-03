import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { buildSemanticIndex } from "@mta-wiki/pipeline/materialize/semantic-index";
import { createMtaQueryTools, lexicalSearchRecords } from "@mta-wiki/agents/tools/query-tools";
import type { Embedder } from "@mta-wiki/pipeline/sources/embeddings";
import type { TranscriptWriter } from "@mta-wiki/core/transcript";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";

const indexDir = join(repoRoot, "data", "index");
const indexFiles = ["record-embeddings.f32", "record-embeddings.manifest.json"].map((name) => join(indexDir, name));

const VOCAB = ["m60", "laguardia", "launch", "2014", "ridership", "terminal"];
const fakeEmbed: Embedder = (texts) =>
  Promise.resolve(texts.map((text) => Float32Array.from(VOCAB.map((word) => text.toLowerCase().split(word).length - 1))));

// The tools only call transcript.write(); a no-op stub is sufficient.
const transcript = { write() {} } as unknown as TranscriptWriter;

function record(partial: Partial<MtaCanonicalRecord> & Pick<MtaCanonicalRecord, "record_id" | "record_kind">): MtaCanonicalRecord {
  return {
    source_id: "better_buses",
    local_observation_id: partial.record_id,
    display_name: partial.record_id,
    payload: {},
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-06-09T00:00:00.000Z",
    ...partial,
  };
}

const records: MtaCanonicalRecord[] = [
  record({
    record_id: "qtest_event_m60_launch",
    record_kind: "event",
    display_name: "M60 SBS launched May 25, 2014",
    payload: { event_kind: "service_launch", date_text: "May 25, 2014" },
    raw_text: "Service launched on Memorial Day, May 25, 2014.",
    evidence_refs: [{ source_id: "better_buses", block_id: "p001_c0001", source_quote: "launched on May 25, 2014" }],
  }),
  record({
    record_id: "qtest_metric_ridership",
    record_kind: "metric_claim",
    display_name: "Daily ridership 10000",
    payload: { metric_name: "ridership", value: 10000 },
    raw_text: "ridership of 10000 daily riders",
    evidence_refs: [{ source_id: "better_buses", block_id: "p002_c0003" }],
  }),
];

beforeAll(async () => {
  for (const file of indexFiles) {
    if (existsSync(file)) renameSync(file, `${file}.bak`);
  }
  await buildSemanticIndex({ records, embed: fakeEmbed, rebuild: true });
});

afterAll(() => {
  for (const file of indexFiles) {
    rmSync(file, { force: true });
    if (existsSync(`${file}.bak`)) renameSync(`${file}.bak`, file);
  }
});

function semanticSearchTool() {
  const tool = createMtaQueryTools(transcript, "test_run", { embed: fakeEmbed, records }).find((candidate) => candidate.name === "mta_semantic_search");
  if (!tool) throw new Error("mta_semantic_search tool missing");
  return tool;
}

async function runSearch(params: { query: string; max_results?: number; record_kind?: string }) {
  const result = await semanticSearchTool().execute("call_1", params);
  const text = result.content.find((part) => part.type === "text")?.text ?? "{}";
  return JSON.parse(text) as {
    retrieval_mode: "semantic" | "lexical";
    results: Array<{ record_id: string; record_kind: string; evidence_refs: Array<{ block_id?: string }> }>;
  };
}

describe("createMtaQueryTools", () => {
  it("is read-only: exposes no submit/write/flag tools", () => {
    const names = createMtaQueryTools(transcript, "test_run", { embed: fakeEmbed }).map((tool) => tool.name);
    expect(names).toContain("mta_semantic_search");
    expect(names).toContain("mta_read_record");
    expect(names).toContain("mta_read_evidence");
    expect(names).not.toContain("mta_submit_observation");
    expect(names).not.toContain("mta_write_writer_context");
    expect(names).not.toContain("mta_flag_record_issue");
  });

  it("ranks relevant records and returns their evidence refs", async () => {
    const { results } = await runSearch({ query: "When did the M60 launch in 2014?", max_results: 5 });
    expect(results[0]?.record_id).toBe("qtest_event_m60_launch");
    expect(results[0]?.evidence_refs[0]?.block_id).toBe("p001_c0001");
  });

  it("respects the record_kind filter", async () => {
    const { retrieval_mode, results } = await runSearch({ query: "ridership", max_results: 5, record_kind: "metric_claim" });
    expect(retrieval_mode).toBe("semantic");
    expect(results.length).toBe(1);
    expect(results[0]?.record_id).toBe("qtest_metric_ridership");
  });

  it("falls back to lexical keyword search when the semantic index is unavailable", async () => {
    // Remove the index so the tool cannot use vector search; it must degrade, not throw.
    for (const file of indexFiles) rmSync(file, { force: true });

    const { retrieval_mode, results } = await runSearch({ query: "M60 launch 2014", max_results: 5 });
    expect(retrieval_mode).toBe("lexical");
    expect(results.some((entry) => entry.record_id === "qtest_event_m60_launch")).toBe(true);
  });
});

describe("lexicalSearchRecords", () => {
  it("scores keyword overlap and honors the record_kind filter", () => {
    const hits = lexicalSearchRecords("ridership daily riders", records, { maxResults: 5, recordKind: "metric_claim" });
    expect(hits.length).toBe(1);
    expect(hits[0]?.record_id).toBe("qtest_metric_ridership");
  });

  it("returns nothing for a query of only stopwords", () => {
    expect(lexicalSearchRecords("what is the of and", records)).toEqual([]);
  });
});
