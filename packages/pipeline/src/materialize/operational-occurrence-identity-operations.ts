import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  deterministicOperationalOccurrenceId,
  type OperationalOccurrenceIdentityEntry,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-identity";

export const OPERATIONAL_OCCURRENCE_IDENTITY_OPERATION_SCHEMA_VERSION = 1 as const;
export const OPERATIONAL_OCCURRENCE_IDENTITY_REGISTRY_V2_SCHEMA_VERSION = 2 as const;

type OperationBase = {
  schema_version: 1;
  operation_id: string;
  issued_at: string;
  reviewer: string;
  decision_id: string;
  rationale: string;
  affected_founding_event_record_ids: string[];
};

export type OperationalOccurrenceIdentityOperation =
  | (OperationBase & {
      kind: "establish";
      occurrence_id: string;
      founding_key: string;
      founding_event_record_ids: string[];
      resolution_cluster_id: string | null;
    })
  | (OperationBase & {
      kind: "add_alias";
      occurrence_id: string;
      alias: string;
    })
  | (OperationBase & {
      kind: "merge";
      predecessor_occurrence_ids: string[];
      survivor_occurrence_id: string;
      supersedes_non_coreference_decision_ids: string[];
    })
  | (OperationBase & {
      kind: "split";
      predecessor_occurrence_id: string;
      successor_occurrence_ids: string[];
    })
  | (OperationBase & {
      kind: "correct_founding_membership";
      occurrence_id: string;
      current_founding_key: string;
      current_founding_event_record_ids: string[];
    })
  | (OperationBase & {
      kind: "retire";
      occurrence_id: string;
      reason: string;
    })
  | (OperationBase & {
      kind: "record_non_coreference";
      occurrence_ids: [string, string];
    });

export type OperationalOccurrenceIdentityRegistryV2Entry = {
  schema_version: 2;
  occurrence_id: string;
  state: "active" | "retired";
  current_founding_key: string;
  founding_key_history: string[];
  current_founding_event_record_ids: string[];
  founding_event_record_id_history: string[][];
  resolution_cluster_id: string | null;
  aliases: string[];
  redirect_occurrence_ids: string[];
  predecessor_occurrence_ids: string[];
  successor_occurrence_ids: string[];
  lineage_operation_ids: string[];
  non_coreference_occurrence_ids: string[];
  decision_id: string;
  issued_at: string;
  retirement_reason: string | null;
};

export type OperationalOccurrenceIdentityResolution =
  | {
      state: "active";
      occurrence_id: string;
      lineage: string[];
    }
  | {
      state: "redirect";
      requested_ref: {
        kind: "occurrence_id" | "alias" | "founding_key";
        value: string;
      };
      occurrence_id: string;
      lineage: string[];
    }
  | {
      state: "retired";
      occurrence_id: string;
      successors: string[];
      reason: string;
    }
  | { state: "missing"; requested_key: string };

const commonFields = new Set([
  "affected_founding_event_record_ids",
  "decision_id",
  "issued_at",
  "kind",
  "operation_id",
  "rationale",
  "reviewer",
  "schema_version",
]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): void {
  const extras = Object.keys(value).filter((field) => !allowed.has(field)).sort();
  if (extras.length > 0) throw new Error(`${path} has unknown field(s): ${extras.join(", ")}`);
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function strings(value: unknown, path: string, minimum = 0): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const result = value.map((entry, index) => string(entry, `${path}[${index}]`));
  if (result.length < minimum) throw new Error(`${path} must contain at least ${minimum} item(s)`);
  if (new Set(result).size !== result.length) throw new Error(`${path} must not contain duplicates`);
  return [...result].sort();
}

function timestamp(value: unknown, path: string): string {
  const result = string(value, path);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(result) ||
    Number.isNaN(Date.parse(result))
  ) {
    throw new Error(`${path} must be an ISO-8601 UTC timestamp`);
  }
  return new Date(result).toISOString();
}

function occurrenceId(value: unknown, path: string): string {
  const result = string(value, path);
  if (!/^occurrence:[a-f0-9]{24}$/u.test(result)) {
    throw new Error(`${path} must be an occurrence:<24-hex> id`);
  }
  return result;
}

function foundingKey(value: unknown, path: string): string {
  const result = string(value, path);
  if (!/^(?:event|cluster):[^\s]+$/u.test(result)) {
    throw new Error(`${path} must be an event:<record-id> or cluster:<decision-id> key`);
  }
  return result;
}

function operationFields(...fields: string[]): Set<string> {
  return new Set([...commonFields, ...fields]);
}

export function parseOperationalOccurrenceIdentityOperation(
  value: unknown,
  path = "operational occurrence identity operation",
): OperationalOccurrenceIdentityOperation {
  const input = object(value, path);
  if (input.schema_version !== OPERATIONAL_OCCURRENCE_IDENTITY_OPERATION_SCHEMA_VERSION) {
    throw new Error(`${path}.schema_version must be 1`);
  }
  const kind = string(input.kind, `${path}.kind`);
  const base: OperationBase = {
    schema_version: 1,
    operation_id: string(input.operation_id, `${path}.operation_id`),
    issued_at: timestamp(input.issued_at, `${path}.issued_at`),
    reviewer: string(input.reviewer, `${path}.reviewer`),
    decision_id: string(input.decision_id, `${path}.decision_id`),
    rationale: string(input.rationale, `${path}.rationale`),
    affected_founding_event_record_ids: strings(
      input.affected_founding_event_record_ids,
      `${path}.affected_founding_event_record_ids`,
    ),
  };
  switch (kind) {
    case "establish": {
      keys(input, operationFields(
        "founding_event_record_ids",
        "founding_key",
        "occurrence_id",
        "resolution_cluster_id",
      ), path);
      const key = foundingKey(input.founding_key, `${path}.founding_key`);
      const id = occurrenceId(input.occurrence_id, `${path}.occurrence_id`);
      if (deterministicOperationalOccurrenceId(key) !== id) {
        throw new Error(`${path}.occurrence_id does not match the immutable founding key`);
      }
      const members = strings(input.founding_event_record_ids, `${path}.founding_event_record_ids`, 1);
      if (stableJson(members as unknown as JsonValue) !== stableJson(base.affected_founding_event_record_ids as unknown as JsonValue)) {
        throw new Error(`${path}.affected_founding_event_record_ids must equal founding_event_record_ids`);
      }
      return {
        ...base,
        kind,
        occurrence_id: id,
        founding_key: key,
        founding_event_record_ids: members,
        resolution_cluster_id:
          input.resolution_cluster_id === null
            ? null
            : string(input.resolution_cluster_id, `${path}.resolution_cluster_id`),
      };
    }
    case "add_alias":
      keys(input, operationFields("alias", "occurrence_id"), path);
      return {
        ...base,
        kind,
        occurrence_id: occurrenceId(input.occurrence_id, `${path}.occurrence_id`),
        alias: string(input.alias, `${path}.alias`),
      };
    case "merge": {
      keys(input, operationFields(
        "predecessor_occurrence_ids",
        "supersedes_non_coreference_decision_ids",
        "survivor_occurrence_id",
      ), path);
      const predecessors = strings(input.predecessor_occurrence_ids, `${path}.predecessor_occurrence_ids`, 2)
        .map((id, index) => occurrenceId(id, `${path}.predecessor_occurrence_ids[${index}]`));
      const survivor = occurrenceId(input.survivor_occurrence_id, `${path}.survivor_occurrence_id`);
      if (!predecessors.includes(survivor)) {
        throw new Error(`${path}.survivor_occurrence_id must be one of the predecessors`);
      }
      return {
        ...base,
        kind,
        predecessor_occurrence_ids: predecessors,
        survivor_occurrence_id: survivor,
        supersedes_non_coreference_decision_ids: strings(
          input.supersedes_non_coreference_decision_ids,
          `${path}.supersedes_non_coreference_decision_ids`,
        ),
      };
    }
    case "split":
      keys(input, operationFields("predecessor_occurrence_id", "successor_occurrence_ids"), path);
      return {
        ...base,
        kind,
        predecessor_occurrence_id: occurrenceId(
          input.predecessor_occurrence_id,
          `${path}.predecessor_occurrence_id`,
        ),
        successor_occurrence_ids: strings(
          input.successor_occurrence_ids,
          `${path}.successor_occurrence_ids`,
          2,
        ).map((id, index) => occurrenceId(id, `${path}.successor_occurrence_ids[${index}]`)),
      };
    case "correct_founding_membership":
      keys(input, operationFields(
        "current_founding_event_record_ids",
        "current_founding_key",
        "occurrence_id",
      ), path);
      return {
        ...base,
        kind,
        occurrence_id: occurrenceId(input.occurrence_id, `${path}.occurrence_id`),
        current_founding_key: foundingKey(input.current_founding_key, `${path}.current_founding_key`),
        current_founding_event_record_ids: strings(
          input.current_founding_event_record_ids,
          `${path}.current_founding_event_record_ids`,
          1,
        ),
      };
    case "retire":
      keys(input, operationFields("occurrence_id", "reason"), path);
      return {
        ...base,
        kind,
        occurrence_id: occurrenceId(input.occurrence_id, `${path}.occurrence_id`),
        reason: string(input.reason, `${path}.reason`),
      };
    case "record_non_coreference": {
      keys(input, operationFields("occurrence_ids"), path);
      const ids = strings(input.occurrence_ids, `${path}.occurrence_ids`, 2)
        .map((id, index) => occurrenceId(id, `${path}.occurrence_ids[${index}]`));
      if (ids.length !== 2) throw new Error(`${path}.occurrence_ids must contain exactly two ids`);
      return { ...base, kind, occurrence_ids: ids as [string, string] };
    }
    default:
      throw new Error(`${path}.kind is unsupported: ${kind}`);
  }
}

function mutableEntry(
  operation: Extract<OperationalOccurrenceIdentityOperation, { kind: "establish" }>,
): OperationalOccurrenceIdentityRegistryV2Entry {
  return {
    schema_version: 2 as const,
    occurrence_id: operation.occurrence_id,
    state: "active" as const,
    current_founding_key: operation.founding_key,
    founding_key_history: [operation.founding_key],
    current_founding_event_record_ids: operation.founding_event_record_ids,
    founding_event_record_id_history: [operation.founding_event_record_ids],
    resolution_cluster_id: operation.resolution_cluster_id,
    aliases: [] as string[],
    redirect_occurrence_ids: [] as string[],
    predecessor_occurrence_ids: [] as string[],
    successor_occurrence_ids: [] as string[],
    lineage_operation_ids: [operation.operation_id],
    non_coreference_occurrence_ids: [] as string[],
    decision_id: operation.decision_id,
    issued_at: operation.issued_at,
    retirement_reason: null as string | null,
  };
}

export function replayOperationalOccurrenceIdentityOperations(
  operations: readonly OperationalOccurrenceIdentityOperation[],
): OperationalOccurrenceIdentityRegistryV2Entry[] {
  const ordered = operations
    .map((operation, index) =>
      parseOperationalOccurrenceIdentityOperation(operation, `identity operation[${index}]`)
    )
    .sort((left, right) =>
      left.issued_at.localeCompare(right.issued_at) ||
      left.operation_id.localeCompare(right.operation_id)
    );
  if (new Set(ordered.map((operation) => operation.operation_id)).size !== ordered.length) {
    throw new Error("duplicate operational occurrence identity operation_id");
  }
  const entries = new Map<string, ReturnType<typeof mutableEntry>>();
  const foundingOwners = new Map<string, string>();
  const memberOwners = new Map<string, string>();
  const aliasOwners = new Map<string, string>();
  const nonCoreferenceDecision = new Map<string, string>();
  const pairKey = (left: string, right: string) => [left, right].sort().join("|");
  const requireEntry = (id: string, operation: OperationalOccurrenceIdentityOperation) => {
    const entry = entries.get(id);
    if (!entry) throw new Error(`${operation.operation_id} references missing occurrence identity ${id}`);
    return entry;
  };

  for (const operation of ordered) {
    if (operation.kind === "establish") {
      if (entries.has(operation.occurrence_id)) throw new Error(`reuse of occurrence identity ${operation.occurrence_id}`);
      if (aliasOwners.has(operation.occurrence_id)) throw new Error(`occurrence identity ${operation.occurrence_id} conflicts with an alias`);
      const owner = foundingOwners.get(operation.founding_key);
      if (owner) throw new Error(`founding key ${operation.founding_key} is already owned by ${owner}`);
      for (const member of operation.founding_event_record_ids) {
        const memberOwner = memberOwners.get(member);
        if (memberOwner) throw new Error(`founding event ${member} is already actively owned by ${memberOwner}`);
      }
      entries.set(operation.occurrence_id, mutableEntry(operation));
      foundingOwners.set(operation.founding_key, operation.occurrence_id);
      for (const member of operation.founding_event_record_ids) memberOwners.set(member, operation.occurrence_id);
      continue;
    }
    if (operation.kind === "add_alias") {
      const entry = requireEntry(operation.occurrence_id, operation);
      if (entries.has(operation.alias) || foundingOwners.has(operation.alias)) {
        throw new Error(`occurrence alias ${operation.alias} conflicts with an identity or founding key`);
      }
      const owner = aliasOwners.get(operation.alias);
      if (owner && owner !== entry.occurrence_id) throw new Error(`occurrence alias ${operation.alias} has two owners`);
      if (operation.alias === entry.occurrence_id) throw new Error(`occurrence identity ${entry.occurrence_id} aliases itself`);
      aliasOwners.set(operation.alias, entry.occurrence_id);
      entry.aliases = [...new Set([...entry.aliases, operation.alias])].sort();
      entry.lineage_operation_ids.push(operation.operation_id);
      continue;
    }
    if (operation.kind === "record_non_coreference") {
      const [left, right] = operation.occurrence_ids;
      const leftEntry = requireEntry(left, operation);
      const rightEntry = requireEntry(right, operation);
      const key = pairKey(left, right);
      nonCoreferenceDecision.set(key, operation.decision_id);
      leftEntry.non_coreference_occurrence_ids = [...new Set([
        ...leftEntry.non_coreference_occurrence_ids,
        right,
      ])].sort();
      rightEntry.non_coreference_occurrence_ids = [...new Set([
        ...rightEntry.non_coreference_occurrence_ids,
        left,
      ])].sort();
      leftEntry.lineage_operation_ids.push(operation.operation_id);
      rightEntry.lineage_operation_ids.push(operation.operation_id);
      continue;
    }
    if (operation.kind === "merge") {
      const predecessors = operation.predecessor_occurrence_ids.map((id) => requireEntry(id, operation));
      const survivor = requireEntry(operation.survivor_occurrence_id, operation);
      if (predecessors.some((entry) => entry.state !== "active")) {
        throw new Error(`${operation.operation_id} merge predecessor must be active`);
      }
      for (let left = 0; left < predecessors.length; left += 1) {
        for (let right = left + 1; right < predecessors.length; right += 1) {
          const decision = nonCoreferenceDecision.get(
            pairKey(predecessors[left]!.occurrence_id, predecessors[right]!.occurrence_id),
          );
          if (decision && !operation.supersedes_non_coreference_decision_ids.includes(decision)) {
            throw new Error(`${operation.operation_id} conflicts with non-coreference decision ${decision}`);
          }
        }
      }
      for (const entry of predecessors) {
        entry.lineage_operation_ids.push(operation.operation_id);
        if (entry.occurrence_id === survivor.occurrence_id) continue;
        entry.state = "retired";
        entry.successor_occurrence_ids = [survivor.occurrence_id];
        entry.retirement_reason = `merged by ${operation.operation_id}`;
        survivor.predecessor_occurrence_ids.push(entry.occurrence_id);
        survivor.redirect_occurrence_ids.push(entry.occurrence_id);
        foundingOwners.set(entry.current_founding_key, survivor.occurrence_id);
        for (const member of entry.current_founding_event_record_ids) memberOwners.set(member, survivor.occurrence_id);
      }
      survivor.predecessor_occurrence_ids = [...new Set(survivor.predecessor_occurrence_ids)].sort();
      survivor.redirect_occurrence_ids = [...new Set(survivor.redirect_occurrence_ids)].sort();
      continue;
    }
    if (operation.kind === "split") {
      const predecessor = requireEntry(operation.predecessor_occurrence_id, operation);
      if (predecessor.state !== "active") throw new Error(`${operation.operation_id} split predecessor must be active`);
      const successors = operation.successor_occurrence_ids.map((id) => requireEntry(id, operation));
      if (successors.some((entry) => entry.state !== "active")) {
        throw new Error(`${operation.operation_id} split successors must be active`);
      }
      predecessor.state = "retired";
      predecessor.successor_occurrence_ids = successors.map((entry) => entry.occurrence_id).sort();
      predecessor.retirement_reason = `split by ${operation.operation_id}`;
      predecessor.lineage_operation_ids.push(operation.operation_id);
      for (const successor of successors) {
        successor.predecessor_occurrence_ids = [...new Set([
          ...successor.predecessor_occurrence_ids,
          predecessor.occurrence_id,
        ])].sort();
        successor.lineage_operation_ids.push(operation.operation_id);
      }
      continue;
    }
    if (operation.kind === "correct_founding_membership") {
      const entry = requireEntry(operation.occurrence_id, operation);
      if (entry.state !== "active") throw new Error(`${operation.operation_id} cannot correct a retired identity`);
      const keyOwner = foundingOwners.get(operation.current_founding_key);
      if (keyOwner && keyOwner !== entry.occurrence_id) {
        throw new Error(`${operation.operation_id} corrected founding key is owned by ${keyOwner}`);
      }
      for (const member of operation.current_founding_event_record_ids) {
        const owner = memberOwners.get(member);
        if (owner && owner !== entry.occurrence_id) {
          throw new Error(`${operation.operation_id} corrected founding event is owned by ${owner}`);
        }
      }
      foundingOwners.set(entry.current_founding_key, entry.occurrence_id);
      foundingOwners.set(operation.current_founding_key, entry.occurrence_id);
      entry.current_founding_key = operation.current_founding_key;
      entry.founding_key_history = [...new Set([
        ...entry.founding_key_history,
        operation.current_founding_key,
      ])];
      entry.current_founding_event_record_ids = operation.current_founding_event_record_ids;
      entry.founding_event_record_id_history.push(operation.current_founding_event_record_ids);
      entry.decision_id = operation.decision_id;
      entry.lineage_operation_ids.push(operation.operation_id);
      for (const member of operation.current_founding_event_record_ids) memberOwners.set(member, entry.occurrence_id);
      continue;
    }
    const entry = requireEntry(operation.occurrence_id, operation);
    if (entry.state !== "active") throw new Error(`${operation.operation_id} cannot retire an inactive identity`);
    entry.state = "retired";
    entry.retirement_reason = operation.reason;
    entry.lineage_operation_ids.push(operation.operation_id);
  }

  const result = [...entries.values()].map((entry): OperationalOccurrenceIdentityRegistryV2Entry => ({
    ...entry,
    aliases: [...entry.aliases].sort(),
    redirect_occurrence_ids: [...entry.redirect_occurrence_ids].sort(),
    predecessor_occurrence_ids: [...entry.predecessor_occurrence_ids].sort(),
    successor_occurrence_ids: [...entry.successor_occurrence_ids].sort(),
    lineage_operation_ids: [...entry.lineage_operation_ids],
    non_coreference_occurrence_ids: [...entry.non_coreference_occurrence_ids].sort(),
  })).sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));
  return result;
}

export function migrateOperationalOccurrenceIdentityV1Operations(
  entries: readonly OperationalOccurrenceIdentityEntry[],
): OperationalOccurrenceIdentityOperation[] {
  return [...entries]
    .sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id))
    .map((entry) => ({
      schema_version: 1,
      operation_id: `establish:${entry.occurrence_id}`,
      kind: "establish",
      issued_at: new Date(entry.issued_at).toISOString(),
      reviewer: "v1-registry-migration",
      decision_id: entry.decision_id ?? `v1-registry:${entry.occurrence_id}`,
      rationale: "Lossless migration of the reviewed operational occurrence identity registry v1.",
      affected_founding_event_record_ids: [...entry.founding_event_record_ids].sort(),
      occurrence_id: entry.occurrence_id,
      founding_key: entry.founding_key,
      founding_event_record_ids: [...entry.founding_event_record_ids].sort(),
      resolution_cluster_id: entry.resolution_cluster_id,
    }));
}

export function operationalOccurrenceIdentityOperationsJsonl(
  operations: readonly OperationalOccurrenceIdentityOperation[],
): string {
  return operations
    .map((operation) => stableJson(operation as unknown as JsonValue))
    .sort((left, right) => left.localeCompare(right))
    .join("\n") + (operations.length > 0 ? "\n" : "");
}

export function operationalOccurrenceIdentityRegistryV2Jsonl(
  entries: readonly OperationalOccurrenceIdentityRegistryV2Entry[],
): string {
  return [...entries]
    .sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id))
    .map((entry) => stableJson(entry as unknown as JsonValue))
    .join("\n") + (entries.length > 0 ? "\n" : "");
}

export function loadOperationalOccurrenceIdentityOperations(
  dir: string,
): OperationalOccurrenceIdentityOperation[] {
  if (!existsSync(dir)) throw new Error(`required operational occurrence identity operation directory is missing: ${dir}`);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const path = join(dir, name);
      const operation = parseOperationalOccurrenceIdentityOperation(
        JSON.parse(readFileSync(path, "utf8")) as unknown,
        path,
      );
      if (`${operation.operation_id}.json` !== basename(path)) {
        throw new Error(`${path}: operation_id must match file name`);
      }
      return operation;
    });
}

export function resolveOperationalOccurrenceIdentityV2(
  requestedKey: string,
  entries: readonly OperationalOccurrenceIdentityRegistryV2Entry[],
): OperationalOccurrenceIdentityResolution {
  const byId = new Map(entries.map((entry) => [entry.occurrence_id, entry]));
  const direct = byId.get(requestedKey);
  const alias = entries.find((entry) => entry.aliases.includes(requestedKey));
  const founding = entries.find((entry) => entry.founding_key_history.includes(requestedKey));
  const entry = direct ?? alias ?? founding;
  if (!entry) return { state: "missing", requested_key: requestedKey };
  if (entry.state === "retired" && entry.successor_occurrence_ids.length !== 1) {
    return {
      state: "retired",
      occurrence_id: entry.occurrence_id,
      successors: entry.successor_occurrence_ids,
      reason: entry.retirement_reason ?? "retired",
    };
  }
  let terminal = entry;
  const lineage = [entry.occurrence_id];
  const seen = new Set(lineage);
  while (terminal.state === "retired" && terminal.successor_occurrence_ids.length === 1) {
    const next = byId.get(terminal.successor_occurrence_ids[0]!);
    if (!next) throw new Error(`malformed registry: missing redirect successor ${terminal.successor_occurrence_ids[0]}`);
    if (seen.has(next.occurrence_id)) throw new Error(`malformed registry: redirect cycle at ${next.occurrence_id}`);
    terminal = next;
    lineage.push(next.occurrence_id);
    seen.add(next.occurrence_id);
  }
  if (terminal.state === "retired") {
    return {
      state: "retired",
      occurrence_id: terminal.occurrence_id,
      successors: terminal.successor_occurrence_ids,
      reason: terminal.retirement_reason ?? "retired",
    };
  }
  if (direct && direct.occurrence_id === terminal.occurrence_id) {
    return { state: "active", occurrence_id: terminal.occurrence_id, lineage };
  }
  return {
    state: "redirect",
    requested_ref: {
      kind: direct ? "occurrence_id" : alias ? "alias" : "founding_key",
      value: requestedKey,
    },
    occurrence_id: terminal.occurrence_id,
    lineage,
  };
}
