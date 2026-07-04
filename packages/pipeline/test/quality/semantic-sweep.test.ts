import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "bun:test";
import type { JsonObject } from "@mta-wiki/db/types";
import {
  judgeInputFromFixture,
  parseSemanticSweepResults,
  promptForSemanticSweepBatch,
  runSemanticSweep,
  semanticSweepLedgerPath,
  type SemanticSweepJudge,
  type SemanticSweepJudgeInput,
} from "@mta-wiki/pipeline/quality/semantic-sweep";

const work = join(tmpdir(), `mta-semantic-sweep-test-${process.pid}`);
afterAll(() => rmSync(work, { recursive: true, force: true }));

function fixture(recordId: string, payload: JsonObject = { metric_name: "bus_speed", value: 10 }): SemanticSweepJudgeInput {
  return judgeInputFromFixture({
    record_id: recordId,
    record_kind: "metric_claim",
    display_name: recordId,
    payload,
    evidence: [
      {
        source_id: "source_a",
        block_id: "p001_c0001",
        source_quote: "Bus speed was 10 mph.",
        block_text: "Bus speed was 10 mph.",
      },
    ],
  });
}

function readLedger(rootDir: string) {
  const path = semanticSweepLedgerPath(rootDir);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as { record_id: string; verdict: string; content_key: string });
}

describe("semantic sweep", () => {
  it("appends ledger rows, retries omitted batch ids, and skips unchanged content keys", async () => {
    const rootDir = join(work, "ledger");
    mkdirSync(rootDir, { recursive: true });
    const inputs = [fixture("record_a"), fixture("record_b")];
    let calls = 0;
    const judge: SemanticSweepJudge = async (batch) => {
      calls += 1;
      const returned = calls === 1 ? batch.slice(0, 1) : batch;
      return {
        results: returned.map((input) => ({
          record_id: input.record_id,
          verdict: "supported",
          relied_on_span: "Bus speed was 10 mph.",
          rationale: "The value appears in the cited block.",
        })),
        usage: {
          requests: 1,
          input_tokens: batch.length * 100,
          output_tokens: batch.length * 40,
          estimated_cost_usd: batch.length * 0.001,
        },
      };
    };

    const first = await runSemanticSweep({
      rootDir,
      runId: "test-run",
      inputs,
      batchSize: 2,
      judge,
      now: () => new Date("2026-07-04T00:00:00.000Z"),
    });
    expect(first.judged_records).toBe(2);
    expect(first.usage.requests).toBe(2);
    expect(first.usage.input_tokens).toBe(300);
    expect(first.usage.output_tokens).toBe(120);
    expect(first.usage.estimated_cost_usd).toBe(0.003);
    expect(calls).toBe(2);
    expect(readLedger(rootDir).map((row) => row.record_id).sort()).toEqual(["record_a", "record_b"]);

    const second = await runSemanticSweep({
      rootDir,
      runId: "test-run-2",
      inputs,
      batchSize: 2,
      judge: async () => {
        throw new Error("should not judge unchanged content");
      },
    });
    expect(second.judged_records).toBe(0);
    expect(second.skipped_existing).toBe(2);
    expect(readLedger(rootDir)).toHaveLength(2);
  });

  it("uses content keys that change when payload evidence changes", () => {
    const a = fixture("record_a", { metric_name: "bus_speed", value: 10 });
    const b = fixture("record_a", { metric_name: "bus_speed", value: 11 });
    expect(a.content_key).not.toBe(b.content_key);
    expect(fixture("record_a", { metric_name: "bus_speed", value: 10 }).content_key).toBe(a.content_key);
  });

  it("parses fenced judge output and builds a batch prompt", () => {
    const input = fixture("record_a");
    const prompt = promptForSemanticSweepBatch([input]);
    expect(prompt).toContain("Judge each MTA wiki canonical record");
    expect(prompt).toContain("record_a");
    const parsed = parseSemanticSweepResults('```json\n{"results":[{"record_id":"record_a","verdict":"unsupported","relied_on_span":"x","rationale":"y"}]}\n```');
    expect(parsed).toEqual([{ record_id: "record_a", verdict: "unsupported", relied_on_span: "x", rationale: "y" }]);
  });
});
