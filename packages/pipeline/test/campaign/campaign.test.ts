// S3.6a campaign-driver contract: wave selection, source_id-level dedupe (skip already-done),
// per-source timeout + failure quarantine (one bad source doesn't abort the wave), resumability
// (kill + re-run converges), and concurrency correctness. Step fns injected — no model spend.

import { describe, expect, it } from "bun:test";
import { ingestWave, mapWithConcurrency, selectWaveSources, withTimeout } from "@mta-wiki/pipeline/campaign/campaign";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("selectWaveSources", () => {
  it("excludes already-done and slices to wave size", () => {
    const list = ["a", "b", "c", "d", "e"];
    expect(selectWaveSources(list, new Set(["a", "c"]), 2)).toEqual(["b", "d"]);
  });
});

describe("withTimeout", () => {
  it("resolves when fast, rejects with a timeout reason when slow", async () => {
    expect(await withTimeout(() => Promise.resolve(7), 50, "fast")).toBe(7);
    await expect(withTimeout(() => delay(50).then(() => 1), 10, "slow")).rejects.toThrow(/timeout after 10ms: slow/);
  });
});

describe("mapWithConcurrency", () => {
  it("runs every item, preserves order, and never exceeds the limit", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await delay(5);
      active--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("ingestWave", () => {
  it("skips done, ingests the rest, quarantines failures and timeouts without aborting", async () => {
    const ingest = async (id: string) => {
      if (id === "boom") throw new Error("ingest exploded");
      if (id === "hang") {
        await delay(100);
        return { runId: `run-${id}` };
      }
      return { runId: `run-${id}` };
    };
    const result = await ingestWave(["done1", "ok1", "ok2", "boom", "hang"], {
      ingest,
      isDone: (id) => id === "done1",
      concurrency: 4,
      timeoutMs: 30,
    });
    expect(result.skipped_already_done).toEqual(["done1"]);
    expect(result.ingested).toEqual(["ok1", "ok2"]);
    expect(result.run_ids).toEqual(["run-ok1", "run-ok2"]);
    const reasons = Object.fromEntries(result.quarantined.map((q) => [q.source_id, q.reason]));
    expect(reasons["boom"]).toContain("ingest exploded");
    expect(reasons["hang"]).toContain("timeout");
  });

  it("defaults to the concurrency campaign's wider fan-out (24), not the old 6", async () => {
    // campaign-concurrency-plan.md §2 P1-a: the rate limiter arbitrates the provider budget, so
    // the wave fan-out default rose from 6 to 24.
    let active = 0;
    let peak = 0;
    const sources = Array.from({ length: 30 }, (_, i) => `s${i}`);
    await ingestWave(sources, {
      ingest: async (id) => {
        active++;
        peak = Math.max(peak, active);
        await delay(5);
        active--;
        return { runId: `run-${id}` };
      },
    });
    expect(peak).toBe(24);
  });

  it("is resumable: a re-run where prior successes are now done ingests nothing new", async () => {
    const accepted = new Set<string>();
    const ingest = async (id: string) => {
      accepted.add(id);
      return { runId: `run-${id}` };
    };
    const sources = ["s1", "s2", "s3"];
    const first = await ingestWave(sources, { ingest, isDone: (id) => accepted.has(id) });
    expect(first.ingested).toEqual(["s1", "s2", "s3"]);
    const second = await ingestWave(sources, { ingest, isDone: (id) => accepted.has(id) });
    expect(second.ingested).toEqual([]);
    expect(second.skipped_already_done.sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("quarantines runs that return without producing accepted submissions when required", async () => {
    const accepted = new Set<string>();
    const result = await ingestWave(["ok", "no-submit"], {
      ingest: async (id) => {
        if (id === "ok") accepted.add(id);
        return { runId: `run-${id}` };
      },
      isDone: (id) => accepted.has(id),
      requireDoneAfterIngest: true,
    });

    expect(result.ingested).toEqual(["ok"]);
    expect(result.run_ids).toEqual(["run-ok"]);
    expect(result.quarantined).toEqual([
      {
        source_id: "no-submit",
        reason: "ingest completed but no-submit has no accepted submissions",
      },
    ]);
  });
});
