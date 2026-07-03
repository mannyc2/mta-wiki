// Campaign wave driver (docs/step-3-implementation-plan.md §3 S3.6a; campaign plan §2 item 6, §5).
//
// Drives one wave: select the wave's sources from the pinned readiness list, SKIP any already
// ingested (dedupe by source_id — 65 journal files ≠ 61 sources), ingest at bounded concurrency
// with a per-source timeout and failure quarantine, then write wave-<n>/report.json. Resumable by
// construction: "done" = source_id present in accepted submissions, so a kill + re-run converges
// (journals are append-only; nothing is re-ingested). The per-run loop (canonicalize → review →
// apply) and the once-per-wave loop (materialize → verify → validate → reports) are campaign plan
// §5 verbatim and run live; this module owns the deterministic orchestration + ledger.
//
// The step functions (ingest, isDone) are injected so the orchestration — selection, dedupe,
// concurrency, timeout, quarantine, report shape, resumability — is unit-tested without model spend.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { campaignDir, ingestedSourceIds } from "@mta-wiki/pipeline/campaign/campaign-readiness";

export type WaveIngestResult = {
  ingested: string[];
  skipped_already_done: string[];
  quarantined: Array<{ source_id: string; reason: string }>;
  run_ids: string[];
};

/** Per-wave telemetry the §3 concurrency ramp gates on (campaign-concurrency-plan.md §3). */
export type WaveTelemetry = {
  concurrency: number;
  timeout_min: number;
  wall_clock_s: number;
  rate_limit: Array<{
    provider: string;
    rate_per_minute: number;
    requests: number;
    requests_per_minute_observed: number;
    rate_limited_429: number;
    circuit_breaker_trips: number;
    wait_ms_p50: number;
    wait_ms_p95: number;
    wait_ms_max: number;
    last_rate_limit_headers: Record<string, string>;
  }>;
  materialize: {
    completed_ingests: number;
    runs: number;
    total_seconds: number;
    every_k: number;
  };
};

export type WaveReport = WaveIngestResult & {
  campaign_id: string;
  wave: number;
  generated_at: string;
  sources_selected: string[];
  telemetry?: WaveTelemetry;
};

/** The next `size` wave sources from the pinned readiness wave-list, excluding any already done. */
export function selectWaveSources(waveList: string[], done: Set<string>, size: number): string[] {
  return waveList.filter((id) => !done.has(id)).slice(0, size);
}

/** Run `fn` with a wall-clock timeout; rejects with a timeout error the quarantine path can record. */
export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms: ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Run tasks with bounded concurrency, preserving input order in the results. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!, i);
    }
  });
  await Promise.all(runners);
  return results;
}

export type IngestStep = (sourceId: string) => Promise<{ runId: string }>;
export type IsDone = (sourceId: string) => boolean;

export type IngestWaveOptions = {
  concurrency?: number;
  timeoutMs?: number;
  ingest: IngestStep; // injected; production passes a runIngest wrapper
  isDone?: IsDone; // injected; production checks accepted submissions
  requireDoneAfterIngest?: boolean;
};

/** Ingest a wave's sources: skip done (resumable), ingest the rest with concurrency + timeout, and
 *  quarantine failures with their reason instead of aborting the wave. */
export async function ingestWave(sources: string[], options: IngestWaveOptions): Promise<WaveIngestResult> {
  // Defaults raised for the concurrency campaign (campaign-concurrency-plan.md §2 P1-a): the
  // global rate limiter arbitrates the Pioneer budget, so the wave can run far wider; and the
  // 30 min timeout accounts for limiter queue waits + materialize stalls inside withTimeout
  // (the old 10 min was already below an observed 14.9 min run even unthrottled).
  const concurrency = options.concurrency ?? 24;
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  const isDone = options.isDone ?? (() => false);

  const result: WaveIngestResult = { ingested: [], skipped_already_done: [], quarantined: [], run_ids: [] };
  const todo = sources.filter((id) => {
    if (isDone(id)) {
      result.skipped_already_done.push(id);
      return false;
    }
    return true;
  });

  await mapWithConcurrency(todo, concurrency, async (sourceId) => {
    try {
      const { runId } = await withTimeout(() => options.ingest(sourceId), timeoutMs, `ingest ${sourceId}`);
      if (options.requireDoneAfterIngest && !isDone(sourceId)) {
        throw new Error(`ingest completed but ${sourceId} has no accepted submissions`);
      }
      result.ingested.push(sourceId);
      result.run_ids.push(runId);
    } catch (error) {
      result.quarantined.push({ source_id: sourceId, reason: (error as Error).message });
    }
  });

  // Deterministic order regardless of completion race.
  result.ingested.sort();
  result.run_ids.sort();
  result.quarantined.sort((a, b) => a.source_id.localeCompare(b.source_id));
  return result;
}

/** Write wave-<n>/report.json under the campaign dir and return the report. */
export function writeWaveReport(report: WaveReport): { report: WaveReport; path: string } {
  const dir = join(campaignDir(report.campaign_id), `wave-${report.wave}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "report.json");
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { report, path };
}

/** Production "already ingested" check: source_id has an accepted submission. Recomputed per call
 *  so a resumed run sees journals appended by the prior run. */
export function makeAcceptedIsDone(): IsDone {
  return (sourceId: string) => ingestedSourceIds().has(sourceId);
}
