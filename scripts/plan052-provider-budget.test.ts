import { describe, expect, test } from "bun:test";
import {
  assertPlan052ProviderPreflight,
  plan052BudgetState,
} from "./plan052-provider-budget";

describe("Plan 052 provider budget", () => {
  test("pins the owner ceiling and reports the empty no-cost ledger", () => {
    expect(plan052BudgetState()).toMatchObject({
      ceiling_usd: 1,
      settled_cost_usd: 0,
      outstanding_reserved_cost_usd: 0,
      committed_cost_usd: 0,
      remaining_cost_usd: 1,
      provider_request_count: 0,
    });
  });

  test("accepts the approved full-campaign estimate", () => {
    expect(assertPlan052ProviderPreflight(0.463214).remaining_cost_usd).toBe(1);
  });

  test("rejects a call that would exceed the hard aggregate ceiling", () => {
    expect(() => assertPlan052ProviderPreflight(1.000001)).toThrow(
      /preflight rejected.*hard ceiling/u,
    );
  });

  test("rejects zero, negative, and non-finite reservations", () => {
    for (const value of [0, -0.01, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() => assertPlan052ProviderPreflight(value)).toThrow();
    }
  });
});
