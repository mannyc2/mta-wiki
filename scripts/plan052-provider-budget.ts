import { createHash } from "node:crypto";
import {
  appendFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";

const authorizationRelative =
  "data/operational-episode-resolution/campaigns/plan-052/provider-budget-authorization.json";
const expectedLedgerRelative =
  "data/operational-episode-resolution/campaigns/plan-052/provider-usage-ledger.jsonl";

type Authorization = {
  schema_version: 1;
  contract_id: "plan-052-provider-budget-authorization-v1";
  plan_id: "plan-052";
  currency: "USD";
  hard_incremental_ceiling_usd: number;
  approved_campaign_estimate_usd: number;
  allowed_provider: string;
  allowed_profile: string;
  allowed_model: string;
  ledger_path: string;
};

type CampaignOpened = {
  schema_version: 1;
  entry_id: string;
  entry_kind: "campaign_opened";
  plan_id: "plan-052";
  occurred_at: string;
  estimated_cost_usd: 0;
  actual_cost_usd: 0;
  provider_request_count: 0;
};

type Reservation = {
  schema_version: 1;
  entry_id: string;
  entry_kind: "reservation";
  plan_id: "plan-052";
  occurred_at: string;
  reservation_id: string;
  batch_id: string;
  provider: string;
  profile: string;
  model: string;
  estimated_cost_usd: number;
  provider_request_count: number;
};

type Settlement = {
  schema_version: 1;
  entry_id: string;
  entry_kind: "settlement";
  plan_id: "plan-052";
  occurred_at: string;
  reservation_id: string;
  actual_cost_usd: number;
  provider_request_count: number;
  input_tokens: number;
  output_tokens: number;
};

type LedgerEntry = CampaignOpened | Reservation | Settlement;

export type Plan052BudgetState = {
  ceiling_usd: number;
  settled_cost_usd: number;
  outstanding_reserved_cost_usd: number;
  committed_cost_usd: number;
  remaining_cost_usd: number;
  provider_request_count: number;
  ledger_sha256: string;
};

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exact(
  input: Record<string, unknown>,
  fields: readonly string[],
  path: string,
): void {
  const expected = new Set(fields);
  const extras = Object.keys(input).filter((field) => !expected.has(field));
  const missing = fields.filter((field) => !(field in input));
  if (extras.length > 0 || missing.length > 0) {
    throw new Error(
      `${path} has non-exact fields; unknown=${extras.sort().join(",")}; ` +
        `missing=${missing.sort().join(",")}`,
    );
  }
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function nonnegative(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a nonnegative finite number`);
  }
  return value;
}

function positive(value: unknown, path: string): number {
  const parsed = nonnegative(value, path);
  if (parsed <= 0) throw new Error(`${path} must be positive`);
  return parsed;
}

function integer(value: unknown, path: string): number {
  const parsed = nonnegative(value, path);
  if (!Number.isInteger(parsed)) throw new Error(`${path} must be an integer`);
  return parsed;
}

function readAuthorization(): Authorization {
  const path = absolute(authorizationRelative);
  const input = object(JSON.parse(readFileSync(path, "utf8")) as unknown, path);
  exact(input, [
    "allowed_model",
    "allowed_profile",
    "allowed_provider",
    "approved_campaign_estimate_usd",
    "authorized_at",
    "authorized_by",
    "contract_id",
    "currency",
    "guard_command",
    "hard_incremental_ceiling_usd",
    "ledger_path",
    "new_provider_forbidden",
    "new_subscription_forbidden",
    "paid_external_data_forbidden",
    "plan_id",
    "schema_version",
  ], path);
  if (
    input.schema_version !== 1 ||
    input.contract_id !== "plan-052-provider-budget-authorization-v1" ||
    input.plan_id !== "plan-052" ||
    input.currency !== "USD" ||
    input.hard_incremental_ceiling_usd !== 1 ||
    input.approved_campaign_estimate_usd !== 0.463214 ||
    input.allowed_provider !== "pioneer" ||
    input.allowed_profile !== "pioneer-deepseek-flash" ||
    input.allowed_model !== "deepseek-ai/DeepSeek-V4-Flash" ||
    input.ledger_path !== expectedLedgerRelative ||
    input.new_provider_forbidden !== true ||
    input.new_subscription_forbidden !== true ||
    input.paid_external_data_forbidden !== true ||
    input.guard_command !== "bun scripts/plan052-provider-budget.ts"
  ) {
    throw new Error("Plan 052 provider authorization is missing, stale, or broader than approved");
  }
  return input as unknown as Authorization;
}

function parseEntry(value: unknown, path: string): LedgerEntry {
  const input = object(value, path);
  const common = ["schema_version", "entry_id", "entry_kind", "plan_id", "occurred_at"];
  if (
    input.schema_version !== 1 ||
    input.plan_id !== "plan-052"
  ) {
    throw new Error(`${path} is not a Plan 052 ledger entry`);
  }
  string(input.entry_id, `${path}.entry_id`);
  const occurredAt = string(input.occurred_at, `${path}.occurred_at`);
  if (!Number.isFinite(Date.parse(occurredAt))) {
    throw new Error(`${path}.occurred_at must be ISO date-time`);
  }
  if (input.entry_kind === "campaign_opened") {
    exact(input, [
      ...common,
      "actual_cost_usd",
      "estimated_cost_usd",
      "provider_request_count",
    ], path);
    if (
      input.actual_cost_usd !== 0 ||
      input.estimated_cost_usd !== 0 ||
      input.provider_request_count !== 0
    ) {
      throw new Error(`${path} campaign-open row must be zero-cost`);
    }
    return input as unknown as CampaignOpened;
  }
  if (input.entry_kind === "reservation") {
    exact(input, [
      ...common,
      "batch_id",
      "estimated_cost_usd",
      "model",
      "profile",
      "provider",
      "provider_request_count",
      "reservation_id",
    ], path);
    positive(input.estimated_cost_usd, `${path}.estimated_cost_usd`);
    const requests = integer(
      input.provider_request_count,
      `${path}.provider_request_count`,
    );
    if (requests < 1) throw new Error(`${path}.provider_request_count must be positive`);
    for (const field of [
      "batch_id",
      "model",
      "profile",
      "provider",
      "reservation_id",
    ]) {
      string(input[field], `${path}.${field}`);
    }
    return input as unknown as Reservation;
  }
  if (input.entry_kind === "settlement") {
    exact(input, [
      ...common,
      "actual_cost_usd",
      "input_tokens",
      "output_tokens",
      "provider_request_count",
      "reservation_id",
    ], path);
    nonnegative(input.actual_cost_usd, `${path}.actual_cost_usd`);
    integer(input.provider_request_count, `${path}.provider_request_count`);
    integer(input.input_tokens, `${path}.input_tokens`);
    integer(input.output_tokens, `${path}.output_tokens`);
    string(input.reservation_id, `${path}.reservation_id`);
    return input as unknown as Settlement;
  }
  throw new Error(`${path}.entry_kind is unsupported`);
}

function readLedger(relativePath: string): {
  bytes: string;
  entries: LedgerEntry[];
} {
  const bytes = readFileSync(absolute(relativePath), "utf8");
  if (!bytes.endsWith("\n")) throw new Error("Plan 052 provider ledger must end with newline");
  const lines = bytes.split(/\r?\n/u).filter(Boolean);
  const entries = lines.map((line, index) =>
    parseEntry(JSON.parse(line) as unknown, `${relativePath}:${index + 1}`)
  );
  if (
    entries.length === 0 ||
    entries[0]?.entry_kind !== "campaign_opened" ||
    entries.filter((entry) => entry.entry_kind === "campaign_opened").length !== 1
  ) {
    throw new Error("Plan 052 provider ledger must start with exactly one campaign-open row");
  }
  return { bytes, entries };
}

function budgetStateFromEntries(
  authorization: Authorization,
  bytes: string,
  entries: LedgerEntry[],
): Plan052BudgetState {
  const entryIds = new Set<string>();
  const reservations = new Map<string, Reservation>();
  const settlements = new Map<string, Settlement>();
  let priorTimestamp = Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    const timestamp = Date.parse(entry.occurred_at);
    if (timestamp < priorTimestamp) {
      throw new Error(`Plan 052 provider ledger is not chronological at ${entry.entry_id}`);
    }
    priorTimestamp = timestamp;
    if (entryIds.has(entry.entry_id)) {
      throw new Error(`duplicate Plan 052 provider ledger entry id: ${entry.entry_id}`);
    }
    entryIds.add(entry.entry_id);
    if (entry.entry_kind === "reservation") {
      if (reservations.has(entry.reservation_id)) {
        throw new Error(`duplicate Plan 052 reservation: ${entry.reservation_id}`);
      }
      if (
        entry.provider !== authorization.allowed_provider ||
        entry.profile !== authorization.allowed_profile ||
        entry.model !== authorization.allowed_model
      ) {
        throw new Error(`reservation ${entry.reservation_id} uses an unauthorized provider surface`);
      }
      reservations.set(entry.reservation_id, entry);
    }
    if (entry.entry_kind === "settlement") {
      const reservation = reservations.get(entry.reservation_id);
      if (!reservation) {
        throw new Error(`settlement ${entry.entry_id} has no earlier reservation`);
      }
      if (settlements.has(entry.reservation_id)) {
        throw new Error(`reservation ${entry.reservation_id} has duplicate settlements`);
      }
      if (
        entry.actual_cost_usd > reservation.estimated_cost_usd ||
        entry.provider_request_count !== reservation.provider_request_count ||
        Date.parse(entry.occurred_at) < Date.parse(reservation.occurred_at)
      ) {
        throw new Error(
          `settlement ${entry.entry_id} exceeds its preflight reservation`,
        );
      }
      settlements.set(entry.reservation_id, entry);
    }
  }
  const settledCost = [...settlements.values()].reduce(
    (sum, entry) => sum + entry.actual_cost_usd,
    0,
  );
  const outstandingCost = [...reservations.values()].reduce(
    (sum, entry) =>
      sum + (settlements.has(entry.reservation_id) ? 0 : entry.estimated_cost_usd),
    0,
  );
  const committedCost = settledCost + outstandingCost;
  if (committedCost > authorization.hard_incremental_ceiling_usd + 1e-12) {
    throw new Error(
      `Plan 052 committed provider cost ${committedCost.toFixed(6)} exceeds ` +
        `${authorization.hard_incremental_ceiling_usd.toFixed(2)} ceiling`,
    );
  }
  return {
    ceiling_usd: authorization.hard_incremental_ceiling_usd,
    settled_cost_usd: settledCost,
    outstanding_reserved_cost_usd: outstandingCost,
    committed_cost_usd: committedCost,
    remaining_cost_usd:
      authorization.hard_incremental_ceiling_usd - committedCost,
    provider_request_count: [...settlements.values()].reduce(
      (sum, entry) => sum + entry.provider_request_count,
      0,
    ),
    ledger_sha256: sha256(bytes),
  };
}

export function plan052BudgetState(): Plan052BudgetState {
  const authorization = readAuthorization();
  const { bytes, entries } = readLedger(authorization.ledger_path);
  return budgetStateFromEntries(authorization, bytes, entries);
}

export function assertPlan052ProviderPreflight(
  estimatedCostUsd: number,
): Plan052BudgetState {
  positive(estimatedCostUsd, "estimatedCostUsd");
  const state = plan052BudgetState();
  if (state.committed_cost_usd + estimatedCostUsd > state.ceiling_usd + 1e-12) {
    throw new Error(
      `Plan 052 provider preflight rejected: committed ` +
        `$${state.committed_cost_usd.toFixed(6)} + requested ` +
        `$${estimatedCostUsd.toFixed(6)} exceeds hard ceiling ` +
        `$${state.ceiling_usd.toFixed(2)}`,
    );
  }
  return state;
}

function appendEntry(entry: LedgerEntry): void {
  const authorization = readAuthorization();
  const ledger = readLedger(authorization.ledger_path);
  const encoded = `${stableJson(entry as unknown as JsonValue)}\n`;
  parseEntry(
    JSON.parse(encoded) as unknown,
    `${expectedLedgerRelative}:prospective`,
  );
  budgetStateFromEntries(
    authorization,
    `${ledger.bytes}${encoded}`,
    [...ledger.entries, entry],
  );
  appendFileSync(
    absolute(expectedLedgerRelative),
    encoded,
    "utf8",
  );
}

function requiredFlag(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing ${name}`);
  }
  return process.argv[index + 1]!;
}

function numericFlag(name: string): number {
  const raw = requiredFlag(name);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be numeric`);
  return value;
}

function main(): void {
  const command = process.argv[2];
  if (command === "--check") {
    if (process.argv.length !== 3) throw new Error("unknown --check arguments");
    console.log(JSON.stringify(plan052BudgetState(), null, 2));
    return;
  }
  if (command === "preflight") {
    const estimated = numericFlag("--estimated-cost-usd");
    const state = assertPlan052ProviderPreflight(estimated);
    console.log(JSON.stringify({
      approved: true,
      requested_estimated_cost_usd: estimated,
      ...state,
    }, null, 2));
    return;
  }
  if (command === "reserve") {
    const estimated = numericFlag("--estimated-cost-usd");
    assertPlan052ProviderPreflight(estimated);
    const reservationId = requiredFlag("--reservation-id");
    appendEntry({
      schema_version: 1,
      entry_id: `reservation:${reservationId}`,
      entry_kind: "reservation",
      plan_id: "plan-052",
      occurred_at: requiredFlag("--occurred-at"),
      reservation_id: reservationId,
      batch_id: requiredFlag("--batch-id"),
      provider: "pioneer",
      profile: "pioneer-deepseek-flash",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      estimated_cost_usd: estimated,
      provider_request_count: numericFlag("--request-count"),
    });
    console.log(JSON.stringify(plan052BudgetState(), null, 2));
    return;
  }
  if (command === "settle") {
    appendEntry({
      schema_version: 1,
      entry_id: `settlement:${requiredFlag("--reservation-id")}`,
      entry_kind: "settlement",
      plan_id: "plan-052",
      occurred_at: requiredFlag("--occurred-at"),
      reservation_id: requiredFlag("--reservation-id"),
      actual_cost_usd: numericFlag("--actual-cost-usd"),
      provider_request_count: numericFlag("--request-count"),
      input_tokens: numericFlag("--input-tokens"),
      output_tokens: numericFlag("--output-tokens"),
    });
    console.log(JSON.stringify(plan052BudgetState(), null, 2));
    return;
  }
  throw new Error(
    "usage: bun scripts/plan052-provider-budget.ts " +
      "--check|preflight|reserve|settle [flags]",
  );
}

if (import.meta.main) main();
