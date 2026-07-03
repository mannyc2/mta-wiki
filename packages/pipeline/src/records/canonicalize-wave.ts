// Canonicalize-wave orchestrator (docs/canonicalize-concurrency-plan.md P2).
//
// Drives the per-run canonicalize loop over a wave's ingested run-ids, reusing the proven
// campaign.ts primitives (mapWithConcurrency, withTimeout) the same way ingestWave does. The plan's
// shape, verbatim:
//
//   - Propose + review run in PARALLEL across runs (R runs in flight, each at its own packet
//     concurrency P). Effective provider concurrency ≈ R×P; the global token bucket arbitrates the
//     real request rate, R just bounds in-flight work.
//   - Apply is SERIALIZED. applyCanonicalizeDecisions mutates the canonical DB (the serialization
//     point — propose/review only write per-run dirs), so applies run one at a time in deterministic
//     sorted run-id order, AFTER propose/review. Apply is local + sub-second, so two-phase
//     (all propose/review, then serial apply) costs nothing over interleaving and is fully
//     deterministic + trivially testable. Apply conflicts quarantine that run; they never abort
//     the wave.
//   - Resumable by construction (same doctrine as ingestWave): "applied" = apply-report with
//     wrote=true present → the run is skipped entirely (no re-spend on propose/review). Within a
//     still-todo run, propose/review each skip if their manifest is already present. A killed wave
//     re-run converges.
//
// Known trade-off (plan P2): every propose reads the canonical registry snapshot from before this
// wave's applies, so cross-run co-referents are over-decided `new`. That duplicate class is exactly
// what the downstream identity-review / cross-source-candidates pass (campaign dedup) exists to
// catch, so we accept it here rather than serializing propose.
//
// The step functions (propose, review, apply) and the resume predicates are injected, so the
// orchestration — selection, parallel propose/review, serialized sorted apply, timeout, quarantine,
// report shape, resumability — is unit-tested without model spend.

import { mapWithConcurrency, withTimeout } from "@mta-wiki/pipeline/campaign/campaign";

/** A propose or review stage outcome, reduced to what the orchestrator gates on. */
export type CanonicalizeStageResult = { failed: number; decision_count?: number };

/** What apply reports back, reduced to what the orchestrator classifies on. */
export type CanonicalizeApplyOutcome = {
  wrote: boolean;
  conflicts: number;
  skipped_already_applied: boolean;
  alias_additions: number;
  do_not_merge_additions: number;
  relation_submissions: number;
  decision_count: number;
};

export type CanonicalizeWaveRunStatus = {
  run_id: string;
  status: "applied" | "quarantined" | "skipped_already_applied" | "no_decisions";
  propose_failed?: number;
  review_failed?: number;
  apply_conflicts?: number;
  alias_additions?: number;
  do_not_merge_additions?: number;
  relation_submissions?: number;
  reason?: string;
  wall_clock_ms: number;
};

export type CanonicalizeWaveResult = {
  applied: string[];
  quarantined: Array<{ run_id: string; reason: string }>;
  skipped_already_applied: string[];
  runs: CanonicalizeWaveRunStatus[];
};

export type CanonicalizeStageStep = (runId: string) => Promise<CanonicalizeStageResult>;
export type CanonicalizeApplyStep = (runId: string) => CanonicalizeApplyOutcome | Promise<CanonicalizeApplyOutcome>;
export type RunPredicate = (runId: string) => boolean;

export type CanonicalizeWaveOptions = {
  /** R: runs in flight during propose/review (plan P3 starting posture: 4). */
  concurrency?: number;
  /** Per-run propose+review wall-clock timeout (default 30 min, matching ingest). */
  timeoutMs?: number;
  propose: CanonicalizeStageStep; // injected; production wraps runCanonicalize
  review: CanonicalizeStageStep; // injected; production wraps runCanonicalizeReview
  apply: CanonicalizeApplyStep; // injected; production wraps applyCanonicalizeDecisions
  /** Resume: run already applied (apply-report wrote=true) → skip propose/review/apply entirely. */
  isApplied?: RunPredicate;
  /** Resume: propose-manifest with failed:0 already present → skip propose, save spend. */
  isProposed?: RunPredicate;
  /** Resume: review-manifest already present → skip review, save spend. */
  isReviewed?: RunPredicate;
  onProgress?: ((message: string) => void) | undefined;
};

const DEFAULT_RUN_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Canonicalize a wave's runs: skip already-applied (resume), propose+review the rest in parallel
 * (R in flight, per-run timeout + quarantine), then apply serially in sorted run-id order. One bad
 * run quarantines with its reason instead of aborting the wave.
 */
export async function canonicalizeWave(runIds: string[], options: CanonicalizeWaveOptions): Promise<CanonicalizeWaveResult> {
  const concurrency = options.concurrency ?? DEFAULT_RUN_CONCURRENCY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const isApplied = options.isApplied ?? (() => false);
  const isProposed = options.isProposed ?? (() => false);
  const isReviewed = options.isReviewed ?? (() => false);
  const progress = options.onProgress ?? (() => {});

  const statuses = new Map<string, CanonicalizeWaveRunStatus>();
  const result: CanonicalizeWaveResult = { applied: [], quarantined: [], skipped_already_applied: [], runs: [] };

  // Resume: fully-applied runs cost nothing — don't re-spend propose/review.
  const todo: string[] = [];
  for (const runId of runIds) {
    if (isApplied(runId)) {
      statuses.set(runId, { run_id: runId, status: "skipped_already_applied", wall_clock_ms: 0 });
      result.skipped_already_applied.push(runId);
    } else {
      todo.push(runId);
    }
  }

  // Phase 1 — propose + review in parallel across runs. Within a run the two are sequential
  // (review consumes propose's decisions); across runs they fan out at concurrency R. A run that
  // throws (or times out, or fails a propose packet) is quarantined and excluded from apply.
  const eligibleForApply = new Set<string>();
  await mapWithConcurrency(todo, concurrency, async (runId) => {
    const started = Date.now();
    try {
      await withTimeout(
        async () => {
          if (!isProposed(runId)) {
            const proposed = await options.propose(runId);
            if (proposed.failed > 0) {
              const err = new Error(`propose failed: ${proposed.failed} packet(s)`) as Error & { proposeFailed?: number };
              err.proposeFailed = proposed.failed;
              throw err;
            }
          }
          if (!isReviewed(runId)) {
            const reviewed = await options.review(runId);
            if (reviewed.failed > 0) {
              const err = new Error(`review failed: ${reviewed.failed} packet(s)`) as Error & { reviewFailed?: number };
              err.reviewFailed = reviewed.failed;
              throw err;
            }
          }
        },
        timeoutMs,
        `canonicalize ${runId}`,
      );
      statuses.set(runId, {
        run_id: runId,
        status: "applied", // provisional; set definitively in phase 2
        wall_clock_ms: Date.now() - started,
      });
      eligibleForApply.add(runId);
      progress(`proposed+reviewed ${runId}`);
    } catch (error) {
      const e = error as Error & { proposeFailed?: number; reviewFailed?: number };
      statuses.set(runId, {
        run_id: runId,
        status: "quarantined",
        ...(e.proposeFailed === undefined ? {} : { propose_failed: e.proposeFailed }),
        ...(e.reviewFailed === undefined ? {} : { review_failed: e.reviewFailed }),
        reason: e.message,
        wall_clock_ms: Date.now() - started,
      });
      progress(`quarantined ${runId}: ${e.message}`);
    }
  });

  // Phase 2 — serialized apply in deterministic sorted run-id order (code-unit, matching the
  // dossier determinism fix: localeCompare's `_`-vs-`-` ordering diverges from byte order).
  for (const runId of [...eligibleForApply].sort()) {
    const prior = statuses.get(runId)!;
    const started = Date.now();
    let outcome: CanonicalizeApplyOutcome;
    try {
      outcome = await options.apply(runId);
    } catch (error) {
      statuses.set(runId, { ...prior, status: "quarantined", reason: (error as Error).message, wall_clock_ms: prior.wall_clock_ms + (Date.now() - started) });
      progress(`quarantined ${runId}: apply threw — ${(error as Error).message}`);
      continue;
    }
    const wall = prior.wall_clock_ms + (Date.now() - started);
    if (outcome.skipped_already_applied) {
      statuses.set(runId, { ...prior, status: "skipped_already_applied", wall_clock_ms: wall });
    } else if (outcome.conflicts > 0) {
      statuses.set(runId, { ...prior, status: "quarantined", apply_conflicts: outcome.conflicts, reason: `${outcome.conflicts} apply conflict(s)`, wall_clock_ms: wall });
      progress(`quarantined ${runId}: ${outcome.conflicts} apply conflict(s)`);
    } else {
      statuses.set(runId, {
        ...prior,
        status: outcome.decision_count === 0 ? "no_decisions" : "applied",
        alias_additions: outcome.alias_additions,
        do_not_merge_additions: outcome.do_not_merge_additions,
        relation_submissions: outcome.relation_submissions,
        wall_clock_ms: wall,
      });
    }
  }

  // Deterministic, classification-driven result regardless of completion race.
  for (const runId of runIds) {
    const status = statuses.get(runId)!;
    result.runs.push(status);
    if (status.status === "applied" || status.status === "no_decisions") result.applied.push(runId);
    else if (status.status === "quarantined") result.quarantined.push({ run_id: runId, reason: status.reason ?? "unknown" });
    else if (status.status === "skipped_already_applied" && !result.skipped_already_applied.includes(runId)) {
      result.skipped_already_applied.push(runId);
    }
  }
  result.applied.sort();
  result.quarantined.sort((a, b) => (a.run_id < b.run_id ? -1 : a.run_id > b.run_id ? 1 : 0));
  result.skipped_already_applied.sort();
  result.runs.sort((a, b) => (a.run_id < b.run_id ? -1 : a.run_id > b.run_id ? 1 : 0));
  return result;
}
