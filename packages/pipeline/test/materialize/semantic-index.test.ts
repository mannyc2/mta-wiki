import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { buildSemanticIndex, recordCard, searchSemanticIndex } from "@mta-wiki/pipeline/materialize/semantic-index";
import type { Embedder } from "@mta-wiki/pipeline/sources/embeddings";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";

const indexDir = join(repoRoot, "data", "index");
const indexFiles = ["record-embeddings.f32", "record-embeddings.manifest.json"].map((name) => join(indexDir, name));

// A deterministic keyword-count embedder so cosine ranking is meaningful without a server.
const VOCAB = ["m60", "laguardia", "launch", "2014", "ridership", "terminal", "jamaica"];

function vectorFor(text: string): Float32Array {
  const lower = text.toLowerCase();
  return Float32Array.from(VOCAB.map((word) => lower.split(word).length - 1));
}

const fakeEmbed: Embedder = (texts) => Promise.resolve(texts.map(vectorFor));

function countingEmbedder() {
  let embedded = 0;
  const embed: Embedder = (texts) => {
    embedded += texts.length;
    return fakeEmbed(texts);
  };
  return {
    embed,
    get count() {
      return embedded;
    },
    reset() {
      embedded = 0;
    },
  };
}

function record(partial: Partial<MtaCanonicalRecord> & Pick<MtaCanonicalRecord, "record_id" | "record_kind">): MtaCanonicalRecord {
  return {
    source_id: "test_source",
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

const eventRecord = record({
  record_id: "event_m60_launch",
  record_kind: "event",
  display_name: "M60 SBS launched May 25, 2014",
  payload: { event_kind: "service_launch", date_text: "May 25, 2014" },
  raw_text: "Service launched on Memorial Day, May 25, 2014.",
  evidence_refs: [{ source_id: "better_buses", block_id: "p001_c0001", source_quote: "launched on May 25, 2014" }],
});

const metricRecord = record({
  record_id: "metric_ridership",
  record_kind: "metric_claim",
  display_name: "Daily ridership 10000",
  payload: { metric_name: "ridership", value: 10000 },
  raw_text: "ridership of 10000 daily riders",
});

const terminalRecord = record({
  record_id: "entity_jamaica_terminal",
  record_kind: "entity",
  display_name: "168th Street Jamaica Interim Bus Terminal",
  payload: { entity_type: "bus terminal", location: "Jamaica" },
});

beforeAll(() => {
  // Back the real index out of the way exactly once so tests start from a clean slate.
  for (const file of indexFiles) {
    if (existsSync(file)) renameSync(file, `${file}.bak`);
  }
});

beforeEach(() => {
  // Each test builds its own index; clear any leftover from the previous test.
  for (const file of indexFiles) rmSync(file, { force: true });
});

afterAll(() => {
  for (const file of indexFiles) {
    rmSync(file, { force: true });
    if (existsSync(`${file}.bak`)) renameSync(`${file}.bak`, file);
  }
});

describe("recordCard", () => {
  it("includes display name, payload values, raw text, and evidence quotes", () => {
    const card = recordCard(eventRecord);
    expect(card).toContain("M60 SBS launched May 25, 2014");
    expect(card).toContain("event_kind: service_launch");
    expect(card).toContain("Service launched on Memorial Day");
    expect(card).toContain("launched on May 25, 2014");
  });
});

describe("buildSemanticIndex", () => {
  it("embeds every record on a fresh build", async () => {
    const counter = countingEmbedder();
    const result = await buildSemanticIndex({ records: [eventRecord, metricRecord], embed: counter.embed, rebuild: true });
    expect(result.total).toBe(2);
    expect(result.embedded).toBe(2);
    expect(result.reused).toBe(0);
    expect(result.dims).toBe(VOCAB.length);
    expect(counter.count).toBe(2);
  });

  it("reuses unchanged records and only re-embeds changed cards", async () => {
    const counter = countingEmbedder();
    await buildSemanticIndex({ records: [eventRecord, metricRecord], embed: counter.embed });
    expect(counter.count).toBe(2);

    // Change one record's card content; the other is byte-identical and should be reused.
    counter.reset();
    const changedMetric = record({ ...metricRecord, raw_text: "ridership of 25000 daily riders" });
    const result = await buildSemanticIndex({ records: [eventRecord, changedMetric], embed: counter.embed });
    expect(result.embedded).toBe(1);
    expect(result.reused).toBe(1);
    expect(counter.count).toBe(1);

    // An identical rebuild re-embeds nothing.
    counter.reset();
    const unchanged = await buildSemanticIndex({ records: [eventRecord, changedMetric], embed: counter.embed });
    expect(unchanged.embedded).toBe(0);
    expect(unchanged.reused).toBe(2);
    expect(counter.count).toBe(0);
  });
});

describe("searchSemanticIndex", () => {
  it("ranks the most semantically similar record first", async () => {
    await buildSemanticIndex({ records: [eventRecord, metricRecord, terminalRecord], embed: fakeEmbed, rebuild: true });

    const [queryVector] = await fakeEmbed(["When did the M60 launch in 2014?"]);
    const hits = searchSemanticIndex(queryVector, { maxResults: 3 });
    expect(hits[0]?.record_id).toBe("event_m60_launch");
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 1);
  });

  it("respects the record_kind filter", async () => {
    await buildSemanticIndex({ records: [eventRecord, metricRecord, terminalRecord], embed: fakeEmbed, rebuild: true });

    const [queryVector] = await fakeEmbed(["ridership numbers"]);
    const hits = searchSemanticIndex(queryVector, { maxResults: 5, recordKind: "metric_claim" });
    expect(hits.length).toBe(1);
    expect(hits[0]?.record_id).toBe("metric_ridership");
  });

  it("throws a helpful error when the index is missing", () => {
    rmSync(indexFiles[0]!, { force: true });
    rmSync(indexFiles[1]!, { force: true });
    expect(() => searchSemanticIndex(Float32Array.from(VOCAB.map(() => 0)))).toThrow(/build-index/u);
  });
});
