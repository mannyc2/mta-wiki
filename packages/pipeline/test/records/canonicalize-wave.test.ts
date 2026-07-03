// canonicalize-wave contract (docs/canonicalize-concurrency-plan.md P2): parallel propose/review
// across runs, SERIALIZED apply in sorted run-id order, per-run timeout + quarantine (one bad run
// doesn't abort the wave), and resumability (already-applied runs skip propose/review entirely).
// Step fns + resume predicates injected — no model spend.

import { describe, expect, it } from "bun:test";
import { canonicalizeWave, type CanonicalizeApplyOutcome } from "@mta-wiki/pipeline/records/canonicalize-wave";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ok = (over: Partial<CanonicalizeApplyOutcome> = {}): CanonicalizeApplyOutcome => ({
  wrote: true,
  conflicts: 0,
  skipped_already_applied: false,
  alias_additions: 0,
  do_not_merge_additions: 0,
  relation_submissions: 0,
  decision_count: 1,
  ...over,
});

describe("canonicalizeWave", () => {
  it("proposes+reviews then applies, classifying applied / no_decisions", async () => {
    const result = await canonicalizeWave(["r2", "r1"], {
      propose: async () => ({ failed: 0 }),
      review: async () => ({ failed: 0 }),
      apply: (runId) => ok({ decision_count: runId === "r1" ? 0 : 3, alias_additions: runId === "r2" ? 2 : 0 }),
    });
    expect(result.applied).toEqual(["r1", "r2"]); // r1 no_decisions still counts as applied (clean)
    expect(result.quarantined).toEqual([]);
    expect(result.runs.find((r) => r.run_id === "r1")!.status).toBe("no_decisions");
    expect(result.runs.find((r) => r.run_id === "r2")!.status).toBe("applied");
    expect(result.runs.find((r) => r.run_id === "r2")!.alias_additions).toBe(2);
  });

  it("applies strictly serially in sorted run-id order", async () => {
    let active = 0;
    let peak = 0;
    const applyOrder: string[] = [];
    await canonicalizeWave(["r3", "r1", "r2"], {
      concurrency: 3,
      propose: async () => ({ failed: 0 }),
      review: async () => ({ failed: 0 }),
      apply: async (runId) => {
        active++;
        peak = Math.max(peak, active);
        applyOrder.push(runId);
        await delay(5);
        active--;
        return ok();
      },
    });
    expect(peak).toBe(1); // never two applies at once — apply is the serialization point
    expect(applyOrder).toEqual(["r1", "r2", "r3"]); // deterministic sorted order
  });

  it("runs propose/review in parallel up to R, while apply stays serial", async () => {
    let active = 0;
    let peak = 0;
    const runs = Array.from({ length: 10 }, (_, i) => `r${i}`);
    await canonicalizeWave(runs, {
      concurrency: 4,
      propose: async () => {
        active++;
        peak = Math.max(peak, active);
        await delay(5);
        active--;
        return { failed: 0 };
      },
      review: async () => ({ failed: 0 }),
      apply: () => ok(),
    });
    expect(peak).toBe(4);
  });

  it("quarantines a propose-packet failure, a thrown step, and a timeout without aborting", async () => {
    const result = await canonicalizeWave(["good", "propfail", "boom", "hang"], {
      concurrency: 4,
      timeoutMs: 30,
      propose: async (runId) => {
        if (runId === "propfail") return { failed: 2 };
        if (runId === "boom") throw new Error("propose exploded");
        if (runId === "hang") await delay(100);
        return { failed: 0 };
      },
      review: async () => ({ failed: 0 }),
      apply: () => ok(),
    });
    expect(result.applied).toEqual(["good"]);
    const reasons = Object.fromEntries(result.quarantined.map((q) => [q.run_id, q.reason]));
    expect(reasons["propfail"]).toContain("propose failed: 2");
    expect(reasons["boom"]).toContain("propose exploded");
    expect(reasons["hang"]).toContain("timeout");
    expect(result.runs.find((r) => r.run_id === "propfail")!.propose_failed).toBe(2);
  });

  it("quarantines a review failure and an apply conflict, never reaching/keeping the DB write", async () => {
    let applied: string[] = [];
    const result = await canonicalizeWave(["revfail", "conflict", "clean"], {
      propose: async () => ({ failed: 0 }),
      review: async (runId) => (runId === "revfail" ? { failed: 1 } : { failed: 0 }),
      apply: (runId) => {
        if (runId === "conflict") return ok({ wrote: false, conflicts: 1 });
        applied.push(runId);
        return ok();
      },
    });
    expect(applied).toEqual(["clean"]); // revfail never reaches apply; conflict applies-but-reports-conflict
    expect(result.applied).toEqual(["clean"]);
    const reasons = Object.fromEntries(result.quarantined.map((q) => [q.run_id, q.reason]));
    expect(reasons["revfail"]).toContain("review failed: 1");
    expect(reasons["conflict"]).toContain("1 apply conflict(s)");
    expect(result.runs.find((r) => r.run_id === "conflict")!.apply_conflicts).toBe(1);
  });

  it("is resumable: already-applied runs skip propose/review/apply entirely", async () => {
    const proposed: string[] = [];
    const applyCalls: string[] = [];
    const result = await canonicalizeWave(["done1", "done2", "fresh"], {
      isApplied: (runId) => runId.startsWith("done"),
      propose: async (runId) => {
        proposed.push(runId);
        return { failed: 0 };
      },
      review: async () => ({ failed: 0 }),
      apply: (runId) => {
        applyCalls.push(runId);
        return ok();
      },
    });
    expect(proposed).toEqual(["fresh"]); // done1/done2 never proposed → no model spend
    expect(applyCalls).toEqual(["fresh"]);
    expect(result.skipped_already_applied.sort()).toEqual(["done1", "done2"]);
    expect(result.applied).toEqual(["fresh"]);
  });

  it("respects isProposed/isReviewed to skip stages on resume but still applies", async () => {
    const proposed: string[] = [];
    const reviewed: string[] = [];
    const result = await canonicalizeWave(["r1"], {
      isProposed: () => true,
      isReviewed: () => true,
      propose: async (runId) => {
        proposed.push(runId);
        return { failed: 0 };
      },
      review: async (runId) => {
        reviewed.push(runId);
        return { failed: 0 };
      },
      apply: () => ok(),
    });
    expect(proposed).toEqual([]); // propose skipped
    expect(reviewed).toEqual([]); // review skipped
    expect(result.applied).toEqual(["r1"]); // but apply still runs
  });

  it("classifies an apply that self-reports already-applied as skipped, not applied", async () => {
    const result = await canonicalizeWave(["r1"], {
      propose: async () => ({ failed: 0 }),
      review: async () => ({ failed: 0 }),
      apply: () => ok({ wrote: false, skipped_already_applied: true }),
    });
    expect(result.applied).toEqual([]);
    expect(result.skipped_already_applied).toEqual(["r1"]);
  });
});
