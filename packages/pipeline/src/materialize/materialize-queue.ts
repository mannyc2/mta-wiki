// Materialize cadence: single-flight + every-K, not per-run (campaign-concurrency-plan.md §2 P0-b).
//
// `materializeWiki()` is synchronous and blocks the whole event loop for ~31 s — at campaign
// concurrency every concurrent stream stalls. Running it after EVERY ingest is the first scaling
// wall (~9.5 h of serial blocked time across the remainder). This queue replaces that with:
//
//   - single-flight + coalescing: never two materializes running, never N queued — late callers
//     piggyback on the one already scheduled.
//   - every-K cadence: actually materialize on every K-th completed ingest (MTA_MATERIALIZE_EVERY,
//     default 10) and always once at wave end (driver calls force()). Skipped runs record
//     `mta_materialize_skipped` so transcripts stay honest.
//
// Safe because the only in-run consumer of materialized state is identity resolution, and at
// campaign concurrency in-flight sources already don't see each other's output — freshness is
// already ~concurrency sources stale. K bounds staleness at the same order; canonicalize → review
// → apply is the designed identity-correction layer for any duplicates this creates. Resumability
// is untouched: "done" = accepted submission in the journal, not DB freshness.
//
// The campaign singleton (campaignMaterializeQueue) is the one in-process queue every cadence call
// and the wave-end force() share, so single-flight actually holds across the wave.

import { positiveIntegerEnv } from "@mta-wiki/core/agent";
import { materializeWiki } from "@mta-wiki/pipeline/materialize/materialize";
import type { MaterializeResult } from "@mta-wiki/db/types";

export const DEFAULT_MATERIALIZE_EVERY = 10;

export type CadenceOutcome = {
  /** Whether this completion actually triggered a materialize (vs. skipped by cadence). */
  ran: boolean;
  /** The running count of completed ingests fed through afterCompletion(). */
  counter: number;
  /** Configured cadence K, for honest skip transcripts. */
  every: number;
  /** The materialize result when ran is true; null when skipped. */
  result: MaterializeResult | null;
};

/**
 * Single-flight + coalescing materialize with an every-K completion cadence. `materialize` is
 * injected so the queue's concurrency contract is unit-tested without touching the DB.
 */
export type MaterializeQueueStats = {
  /** Completed ingests fed through afterCompletion(). */
  completed: number;
  /** Times materialize actually ran (cadence hits + force()). */
  runs: number;
  /** Cumulative wall-clock spent materializing, in ms. */
  totalMs: number;
};

export class MaterializeQueue {
  private current: Promise<MaterializeResult> | null = null;
  private queued: Promise<MaterializeResult> | null = null;
  private completed = 0;
  private runs = 0;
  private totalMs = 0;

  constructor(
    private readonly materialize: () => MaterializeResult = materializeWiki,
    readonly every: number = DEFAULT_MATERIALIZE_EVERY,
  ) {}

  stats(): MaterializeQueueStats {
    return { completed: this.completed, runs: this.runs, totalMs: this.totalMs };
  }

  /**
   * Single-flight: if nothing is running, run now. If one is running and none queued, schedule
   * exactly one follow-up after it. If one is already queued, coalesce onto it. Never two running,
   * never two queued.
   */
  request(): Promise<MaterializeResult> {
    if (this.current === null) {
      this.current = this.execute();
      return this.current;
    }
    if (this.queued === null) {
      // Run after the current one settles regardless of its outcome.
      this.queued = this.current.then(
        () => this.execute(),
        () => this.execute(),
      );
    }
    return this.queued;
  }

  /** Record one completed ingest; materialize only on every K-th (single-flight). */
  async afterCompletion(): Promise<CadenceOutcome> {
    const counter = ++this.completed;
    if (counter % this.every !== 0) {
      return { ran: false, counter, every: this.every, result: null };
    }
    const result = await this.request();
    return { ran: true, counter, every: this.every, result };
  }

  /** Always materialize (wave end), through the same single-flight queue. */
  force(): Promise<MaterializeResult> {
    return this.request();
  }

  private async execute(): Promise<MaterializeResult> {
    const started = Date.now();
    try {
      const result = this.materialize();
      this.runs += 1;
      this.totalMs += Date.now() - started;
      return result;
    } finally {
      // Promote any queued follow-up to current; it has already been chained off this one.
      this.current = this.queued;
      this.queued = null;
    }
  }
}

let singleton: MaterializeQueue | null = null;

/** The one in-process queue the campaign's cadence calls and wave-end force() share. */
export function campaignMaterializeQueue(): MaterializeQueue {
  if (!singleton) {
    singleton = new MaterializeQueue(materializeWiki, positiveIntegerEnv("MTA_MATERIALIZE_EVERY") ?? DEFAULT_MATERIALIZE_EVERY);
  }
  return singleton;
}

/** Test-only / cross-wave reset of the campaign singleton. */
export function resetCampaignMaterializeQueue(): void {
  singleton = null;
}
