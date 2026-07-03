// P0-b contract: single-flight (one materialize at a time), coalescing (N concurrent requests
// during a run collapse to exactly one follow-up), every-K cadence, and force-at-wave-end —
// injected materialize fn, zero DB work.

import { describe, expect, it } from "bun:test";
import { MaterializeQueue } from "@mta-wiki/pipeline/materialize/materialize-queue";
import type { MaterializeResult } from "@mta-wiki/db/types";

function fakeMaterialize() {
  let calls = 0;
  const fn = (): MaterializeResult => {
    calls += 1;
    return {
      submissionsRead: calls,
      acceptedSubmissions: calls,
      retiredSubmissions: 0,
      recordCounts: {},
      pageCount: calls,
      canonicalDir: "/tmp/canonical",
      wikiDir: "/tmp/wiki",
    };
  };
  return { fn, calls: () => calls };
}

describe("MaterializeQueue single-flight + coalescing", () => {
  it("collapses a burst of concurrent requests into one follow-up after the in-flight run", async () => {
    const mat = fakeMaterialize();
    const q = new MaterializeQueue(mat.fn, 10);

    // Three requests issued before any microtask drains: first runs, the other two coalesce
    // onto a single scheduled follow-up.
    const a = q.request();
    const b = q.request();
    const c = q.request();
    await Promise.all([a, b, c]);

    expect(mat.calls()).toBe(2);
    // The coalesced callers share the follow-up result.
    expect(await b).toBe(await c);
  });

  it("runs sequentially: a fresh request after settle starts a new run", async () => {
    const mat = fakeMaterialize();
    const q = new MaterializeQueue(mat.fn, 10);
    await q.request();
    expect(mat.calls()).toBe(1);
    await q.request();
    expect(mat.calls()).toBe(2);
  });
});

describe("MaterializeQueue every-K cadence", () => {
  it("materializes only on every K-th completion and reports the cadence counter", async () => {
    const mat = fakeMaterialize();
    const q = new MaterializeQueue(mat.fn, 3);

    const o1 = await q.afterCompletion();
    const o2 = await q.afterCompletion();
    const o3 = await q.afterCompletion();

    expect(o1).toMatchObject({ ran: false, counter: 1, every: 3, result: null });
    expect(o2).toMatchObject({ ran: false, counter: 2, result: null });
    expect(o3.ran).toBe(true);
    expect(o3.counter).toBe(3);
    expect(o3.result).not.toBeNull();
    expect(mat.calls()).toBe(1);

    // Next two skip, sixth fires again.
    await q.afterCompletion();
    await q.afterCompletion();
    const o6 = await q.afterCompletion();
    expect(o6.ran).toBe(true);
    expect(mat.calls()).toBe(2);
  });
});

describe("MaterializeQueue force", () => {
  it("always materializes regardless of cadence", async () => {
    const mat = fakeMaterialize();
    const q = new MaterializeQueue(mat.fn, 1000);
    await q.afterCompletion(); // skipped (1 % 1000 !== 0)
    expect(mat.calls()).toBe(0);
    await q.force();
    expect(mat.calls()).toBe(1);
  });
});
