// P0-a contract: token-bucket acquire order (FIFO), refill, burst, circuit-breaker open/close,
// unlimited short-circuit, and telemetry — all on a fake clock, zero model spend.

import { afterEach, describe, expect, it } from "bun:test";
import {
  bucket,
  providerRatePerMinute,
  resetBuckets,
  TokenBucket,
  type LimiterClock,
} from "../src/rate-limit.js";

/** Deterministic clock: `sleep` registers a timer; `advance` fires due timers in time order,
 *  flushing microtasks between each so the bucket's drain loop can re-register its next sleep. */
class FakeClock implements LimiterClock {
  private t = 0;
  private timers: Array<{ at: number; resolve: () => void }> = [];

  now = (): number => this.t;
  sleep = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      this.timers.push({ at: this.t + ms, resolve });
    });

  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    for (;;) {
      const next = this.timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.timers = this.timers.filter((x) => x !== next);
      this.t = next.at;
      next.resolve();
      for (let i = 0; i < 8; i++) await Promise.resolve();
    }
    this.t = target;
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }
}

const settled = async <T>(p: Promise<T>): Promise<boolean> => {
  let done = false;
  void p.then(() => {
    done = true;
  });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  return done;
};

afterEach(() => resetBuckets());

describe("TokenBucket burst + refill", () => {
  it("dispenses up to capacity immediately, then refills at the configured rate", async () => {
    const clock = new FakeClock();
    // 60/min = 1 token/sec, burst 3.
    const b = new TokenBucket({ ratePerMinute: 60, burstCapacity: 3, clock });

    expect(await settled(b.acquire())).toBe(true);
    expect(await settled(b.acquire())).toBe(true);
    expect(await settled(b.acquire())).toBe(true);

    // 4th has no token until ~1s of refill elapses.
    const fourth = b.acquire();
    expect(await settled(fourth)).toBe(false);
    await clock.advance(999);
    expect(await settled(fourth)).toBe(false);
    await clock.advance(1);
    expect(await settled(fourth)).toBe(true);
  });
});

describe("TokenBucket acquire order", () => {
  it("resolves queued acquirers in FIFO order as tokens refill", async () => {
    const clock = new FakeClock();
    const b = new TokenBucket({ ratePerMinute: 60, burstCapacity: 1, clock });
    const order: string[] = [];

    await b.acquire(); // consumes the one burst token at t=0
    for (const id of ["b", "c", "d"]) void b.acquire().then(() => order.push(id));

    await clock.advance(1000);
    await clock.advance(1000);
    await clock.advance(1000);

    expect(order).toEqual(["b", "c", "d"]);
  });
});

describe("TokenBucket circuit breaker", () => {
  it("opens after N consecutive 429s and blocks acquires until the pause elapses", async () => {
    const clock = new FakeClock();
    const b = new TokenBucket({
      ratePerMinute: 6000, // effectively always has tokens
      burstCapacity: 100,
      breakerThreshold: 3,
      breakerPauseMs: 60_000,
      clock,
    });

    b.recordResponse(429);
    b.recordResponse(429);
    expect(b.stats().breakerOpen).toBe(false);
    b.recordResponse(429);
    expect(b.stats().breakerOpen).toBe(true);
    expect(b.stats().circuitBreakerTrips).toBe(1);

    // Even with tokens available, acquire is held while the breaker is open.
    const held = b.acquire();
    expect(await settled(held)).toBe(false);
    await clock.advance(59_999);
    expect(await settled(held)).toBe(false);
    await clock.advance(1);
    expect(await settled(held)).toBe(true);
  });

  it("resets the consecutive-429 counter on a successful response", async () => {
    const clock = new FakeClock();
    const b = new TokenBucket({ ratePerMinute: 6000, burstCapacity: 100, breakerThreshold: 3, clock });
    b.recordResponse(429);
    b.recordResponse(429);
    b.recordResponse(200); // resets
    b.recordResponse(429);
    b.recordResponse(429);
    expect(b.stats().breakerOpen).toBe(false);
    b.recordResponse(429);
    expect(b.stats().breakerOpen).toBe(true);
  });
});

describe("TokenBucket telemetry", () => {
  it("counts requests/429s and captures rate-limit headers", () => {
    const clock = new FakeClock();
    const b = new TokenBucket({ ratePerMinute: 6000, clock });
    b.recordResponse(200, { "x-ratelimit-remaining": "42", "content-type": "application/json" });
    b.recordResponse(429, { "retry-after": "3" });
    const s = b.stats();
    expect(s.requests).toBe(2);
    expect(s.rateLimited).toBe(1);
    expect(s.lastRateLimitHeaders).toEqual({ "x-ratelimit-remaining": "42", "retry-after": "3" });
  });

  it("reports wait percentiles for queued acquirers", async () => {
    const clock = new FakeClock();
    const b = new TokenBucket({ ratePerMinute: 60, burstCapacity: 1, clock });
    await b.acquire();
    const queued = b.acquire();
    await clock.advance(1000);
    await queued;
    const s = b.stats();
    expect(s.waitCount).toBe(2);
    expect(s.waitMsMax).toBeGreaterThanOrEqual(1000);
  });
});

describe("unlimited provider", () => {
  it("short-circuits acquire when ratePerMinute <= 0", async () => {
    const clock = new FakeClock();
    const b = new TokenBucket({ ratePerMinute: 0, clock });
    expect(await settled(b.acquire())).toBe(true);
    expect(await settled(b.acquire())).toBe(true);
  });
});

describe("providerRatePerMinute + singleton", () => {
  it("defaults pioneer to 170/min and deepseek to unlimited", () => {
    delete process.env.MTA_PIONEER_RPM;
    delete process.env.MTA_DEEPSEEK_RPM;
    expect(providerRatePerMinute("pioneer")).toBe(170);
    expect(providerRatePerMinute("deepseek")).toBe(0);
  });

  it("honors MTA_PIONEER_RPM override", () => {
    process.env.MTA_PIONEER_RPM = "200";
    try {
      expect(providerRatePerMinute("pioneer")).toBe(200);
    } finally {
      delete process.env.MTA_PIONEER_RPM;
    }
  });

  it("returns a stable singleton per provider", () => {
    expect(bucket("pioneer")).toBe(bucket("pioneer"));
  });
});
