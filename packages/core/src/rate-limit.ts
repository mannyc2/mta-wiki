// Global per-provider rate limiter (campaign-concurrency-plan.md §2 P0-a).
//
// One module-level token bucket per provider arbitrates every agent loop the campaign spawns
// (ingest, canonicalize, schema-proposal, …) because the wave driver runs ingests in-process:
// a singleton bucket sees them all. The bucket is acquired in `buildHarnessAgent`'s
// `before_provider_request` hook — awaited immediately before the HTTP request fires — so the
// 170 req/min Pioneer budget (85% of the 200/min endpoint cap) is enforced across the fleet.
//
// Telemetry (request count, 429s, limiter-wait distribution, last rate-limit headers) feeds the
// per-run transcript and the wave report; the §3 concurrency ramp gates on these MEASURED signals
// only — never on perceived smoothness. A circuit breaker (≥3 consecutive 429s → pause 60 s)
// makes the §8 "pause intake" posture automatic.
//
// Pure logic with an injected clock so the bucket, breaker, and wait telemetry are unit-tested
// with a fake clock and zero model spend.

import { positiveIntegerEnv } from "./agent.js";

/** Default Pioneer budget: 85% of the stated 200 req/min endpoint cap. The ~30/min headroom is the
 *  budget for SDK-internal retries inside `streamSimple`, which do not re-acquire the bucket. */
export const DEFAULT_PIONEER_RPM = 170;
const DEFAULT_BREAKER_THRESHOLD = 3;
const DEFAULT_BREAKER_PAUSE_MS = 60_000;

/** Injectable clock so the limiter is deterministic under test. */
export type LimiterClock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

const realClock: LimiterClock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type TokenBucketOptions = {
  /** Sustained rate. ≤ 0 means unlimited (acquire resolves immediately). */
  ratePerMinute: number;
  /** Max burst, in tokens. Defaults to one minute of rate. */
  burstCapacity?: number;
  /** Consecutive-429 count that trips the breaker. Default 3. */
  breakerThreshold?: number;
  /** How long the breaker pauses all acquires once tripped. Default 60 s. */
  breakerPauseMs?: number;
  clock?: LimiterClock;
  /** Human label used in the loud circuit-breaker log. */
  label?: string;
};

export type RateLimitStats = {
  label: string;
  ratePerMinute: number;
  /** Total provider responses observed via recordResponse. */
  requests: number;
  /** 429 responses observed. */
  rateLimited: number;
  /** Times the breaker tripped. */
  circuitBreakerTrips: number;
  /** Whether the breaker is currently open. */
  breakerOpen: boolean;
  /** Acquire-wait percentiles in ms (limiter queue time, not request latency). */
  waitCount: number;
  waitMsP50: number;
  waitMsP95: number;
  waitMsMax: number;
  /** Last rate-limit response headers Pioneer sent, if any. */
  lastRateLimitHeaders: Record<string, string>;
};

const RATE_LIMIT_HEADER_RE = /^(x-)?ratelimit-|^retry-after$/i;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? 0;
}

/**
 * A single provider's token bucket. FIFO acquire order (one drainer), fractional-token refill,
 * a consecutive-429 circuit breaker, and limiter-wait/429/header telemetry.
 */
export class TokenBucket {
  readonly ratePerMinute: number;
  private readonly capacity: number;
  private readonly breakerThreshold: number;
  private readonly breakerPauseMs: number;
  private readonly clock: LimiterClock;
  private readonly label: string;

  private tokens: number;
  private lastRefill: number;
  private breakerOpenUntil = 0;
  private consecutive429 = 0;

  private readonly waiters: Array<() => void> = [];
  private draining = false;

  private requests = 0;
  private rateLimited = 0;
  private circuitBreakerTrips = 0;
  private readonly waitSamples: number[] = [];
  private lastRateLimitHeaders: Record<string, string> = {};

  constructor(options: TokenBucketOptions) {
    this.ratePerMinute = options.ratePerMinute;
    this.capacity = options.burstCapacity ?? Math.max(1, options.ratePerMinute);
    this.breakerThreshold = options.breakerThreshold ?? DEFAULT_BREAKER_THRESHOLD;
    this.breakerPauseMs = options.breakerPauseMs ?? DEFAULT_BREAKER_PAUSE_MS;
    this.clock = options.clock ?? realClock;
    this.label = options.label ?? "provider";
    this.tokens = this.capacity;
    this.lastRefill = this.clock.now();
  }

  /** Acquire one token, awaiting the bucket (and any open breaker). Returns the wait in ms. */
  acquire(): Promise<number> {
    if (this.ratePerMinute <= 0) {
      this.waitSamples.push(0);
      return Promise.resolve(0);
    }
    const start = this.clock.now();
    return new Promise<number>((resolve) => {
      this.waiters.push(() => {
        const waited = this.clock.now() - start;
        this.waitSamples.push(waited);
        resolve(waited);
      });
      void this.drain();
    });
  }

  /** Record a provider response: drives the 429 telemetry and the circuit breaker. */
  recordResponse(status: number, headers: Record<string, string> = {}): void {
    this.requests += 1;
    this.captureHeaders(headers);
    if (status === 429) {
      this.rateLimited += 1;
      this.consecutive429 += 1;
      if (this.consecutive429 >= this.breakerThreshold && this.breakerOpenUntil <= this.clock.now()) {
        this.breakerOpenUntil = this.clock.now() + this.breakerPauseMs;
        this.circuitBreakerTrips += 1;
        // Loud by design — this is the automated "pause intake" posture.
        console.error(
          `[rate-limit] CIRCUIT BREAKER OPEN for ${this.label}: ${this.consecutive429} consecutive 429s — ` +
            `pausing all acquires for ${this.breakerPauseMs}ms.`,
        );
      }
    } else if (status < 400) {
      this.consecutive429 = 0;
    }
  }

  stats(): RateLimitStats {
    const sorted = [...this.waitSamples].sort((a, b) => a - b);
    return {
      label: this.label,
      ratePerMinute: this.ratePerMinute,
      requests: this.requests,
      rateLimited: this.rateLimited,
      circuitBreakerTrips: this.circuitBreakerTrips,
      breakerOpen: this.breakerOpenUntil > this.clock.now(),
      waitCount: sorted.length,
      waitMsP50: percentile(sorted, 50),
      waitMsP95: percentile(sorted, 95),
      waitMsMax: sorted.length ? sorted[sorted.length - 1]! : 0,
      lastRateLimitHeaders: { ...this.lastRateLimitHeaders },
    };
  }

  private captureHeaders(headers: Record<string, string>): void {
    for (const [key, value] of Object.entries(headers)) {
      if (RATE_LIMIT_HEADER_RE.test(key)) this.lastRateLimitHeaders[key.toLowerCase()] = value;
    }
  }

  private refill(): void {
    const now = this.clock.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed * this.ratePerMinute) / 60_000);
    this.lastRefill = now;
  }

  private timeUntilNextToken(): number {
    const deficit = 1 - this.tokens;
    const perMs = this.ratePerMinute / 60_000;
    return Math.max(1, Math.ceil(deficit / perMs));
  }

  /** Single drainer guarantees FIFO dispatch order across concurrent acquirers. */
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.waiters.length > 0) {
        const breakerWait = this.breakerOpenUntil - this.clock.now();
        if (breakerWait > 0) {
          await this.clock.sleep(breakerWait);
          continue;
        }
        this.refill();
        if (this.tokens >= 1) {
          this.tokens -= 1;
          const next = this.waiters.shift()!;
          next();
          continue;
        }
        await this.clock.sleep(this.timeUntilNextToken());
      }
    } finally {
      this.draining = false;
    }
  }
}

/** Resolve a provider's configured rate from env, falling back to the per-provider default. */
export function providerRatePerMinute(provider: string): number {
  if (provider === "pioneer") return positiveIntegerEnv("MTA_PIONEER_RPM") ?? DEFAULT_PIONEER_RPM;
  if (provider === "deepseek") return positiveIntegerEnv("MTA_DEEPSEEK_RPM") ?? 0;
  // Unknown providers are unlimited unless an override is later added.
  return 0;
}

const buckets = new Map<string, TokenBucket>();

/** Module-level singleton bucket for a provider, created on first use from env-derived rate. */
export function bucket(provider: string): TokenBucket {
  let existing = buckets.get(provider);
  if (!existing) {
    existing = new TokenBucket({ ratePerMinute: providerRatePerMinute(provider), label: provider });
    buckets.set(provider, existing);
  }
  return existing;
}

/** Snapshot every live bucket's telemetry (for the wave report). */
export function allBucketStats(): RateLimitStats[] {
  return [...buckets.values()].map((b) => b.stats());
}

/** Test-only: drop all singleton buckets so a fresh suite starts clean. */
export function resetBuckets(): void {
  buckets.clear();
}
