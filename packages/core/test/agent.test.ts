// Regression guard for the rate-limiter channel bug (campaign W2): in pi-agent-core, the throttle
// (before_provider_request) is a HOOK delivered to agent.on(...) handlers, while telemetry
// (after_provider_response, settled) is BROADCAST only to agent.subscribe(...) listeners. Wiring
// the telemetry on agent.on(...) silently disables the circuit breaker and zeroes the counters.
// This test pins each handler to the correct channel and proves recordResponse → breaker fires.

import { afterEach, describe, expect, it } from "bun:test";
import { subscribeRateLimit } from "../src/agent.js";
import { bucket, resetBuckets } from "../src/rate-limit.js";

type OnHandler = (event: { type: string; status?: number; headers?: Record<string, string> }) => unknown;
type SubHandler = (event: { type: string; status?: number; headers?: Record<string, string> }) => unknown;

function fakeAgent() {
  const onHandlers = new Map<string, OnHandler[]>();
  const subHandlers: SubHandler[] = [];
  const agent = {
    on(type: string, handler: OnHandler) {
      const list = onHandlers.get(type) ?? [];
      list.push(handler);
      onHandlers.set(type, list);
      return () => {};
    },
    subscribe(handler: SubHandler) {
      subHandlers.push(handler);
      return () => {};
    },
  };
  const fireOn = async (type: string, event: Record<string, unknown> = {}) => {
    for (const h of onHandlers.get(type) ?? []) await h({ type, ...event } as never);
  };
  const fireBroadcast = async (type: string, event: Record<string, unknown> = {}) => {
    for (const h of subHandlers) await h({ type, ...event } as never);
  };
  return { agent, onHandlers, subHandlers, fireOn, fireBroadcast };
}

function fakeTranscript() {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  return {
    transcript: { write: (type: string, data: Record<string, unknown> = {}) => events.push({ type, data }) },
    events,
  };
}

afterEach(() => resetBuckets());

describe("subscribeRateLimit channel discipline", () => {
  it("registers the throttle on `on` and telemetry on `subscribe` (never the reverse)", () => {
    const f = fakeAgent();
    const { transcript } = fakeTranscript();
    subscribeRateLimit(f.agent as never, transcript as never, "pioneer");

    // Throttle is the only thing on the hook channel.
    expect([...f.onHandlers.keys()]).toEqual(["before_provider_request"]);
    // Telemetry rides the broadcast channel — the W2 bug was registering these on `on`.
    expect(f.onHandlers.has("after_provider_response")).toBe(false);
    expect(f.onHandlers.has("settled")).toBe(false);
    expect(f.subHandlers.length).toBe(1);
  });

  it("drives the circuit breaker from broadcast after_provider_response events", async () => {
    const f = fakeAgent();
    const { transcript, events } = fakeTranscript();
    subscribeRateLimit(f.agent as never, transcript as never, "pioneer");

    await f.fireOn("before_provider_request");
    await f.fireBroadcast("after_provider_response", { status: 429, headers: { "retry-after": "2" } });
    await f.fireBroadcast("after_provider_response", { status: 429, headers: {} });
    expect(bucket("pioneer").stats().breakerOpen).toBe(false);
    await f.fireBroadcast("after_provider_response", { status: 429, headers: {} });

    const stats = bucket("pioneer").stats();
    expect(stats.requests).toBe(3);
    expect(stats.rateLimited).toBe(3);
    expect(stats.breakerOpen).toBe(true);

    await f.fireBroadcast("settled");
    const snapshot = events.find((e) => e.type === "mta_rate_limit_stats");
    expect(snapshot?.data).toMatchObject({ provider: "pioneer", requests: 3, rateLimited: 3 });
  });
});
