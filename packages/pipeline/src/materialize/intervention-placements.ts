import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { ResolvedInterventionExtent } from "./resolved-intervention-applications.js";

export const INTERVENTION_PLACEMENT_SCHEMA_VERSION = 1 as const;

export type InterventionPlacementFoundingClaim = {
  route_record_id: string;
  gtfs_route_id: string;
  treatment_record_ids: string[];
  treatment_family: string;
  scope: ResolvedInterventionExtent;
};

type OperationBase = {
  schema_version: 1;
  operation_id: string;
  decision_id: string;
  candidate_ids: string[];
  issued_at: string;
  batch_id: string;
  manifest_sha256: string;
  primary_reviewer: string;
  independent_reviewer: string;
  review_outcome: "agreement" | "adjudicated";
  adjudicator: string | null;
  integrator_id: string;
  rationale: string;
};

export type InterventionPlacementIdentityOperation =
  | (OperationBase & {
      operation: "establish";
      founding_key: string;
      claim: InterventionPlacementFoundingClaim;
      aliases: string[];
    })
  | (OperationBase & {
      operation: "alias";
      placement_id: string;
      alias: string;
    })
  | (OperationBase & {
      operation: "scope_correction";
      placement_id: string;
      scope: ResolvedInterventionExtent;
    })
  | (OperationBase & {
      operation: "merge";
      predecessor_placement_ids: string[];
      survivor_placement_id: string;
    })
  | (OperationBase & {
      operation: "split";
      predecessor_placement_id: string;
      successors: Array<{
        founding_key: string;
        claim: InterventionPlacementFoundingClaim;
        aliases: string[];
      }>;
    })
  | (OperationBase & {
      operation: "retire";
      placement_id: string;
      successor_placement_ids: string[];
      retirement_reason: string;
    });

export type InterventionPlacementRegistryEntry = {
  schema_version: 1;
  placement_id: string;
  registry_state: "live_identity" | "retired_identity";
  founding_key: string;
  founding_claim: InterventionPlacementFoundingClaim;
  current_claim: InterventionPlacementFoundingClaim;
  claim_history: InterventionPlacementFoundingClaim[];
  aliases: string[];
  predecessor_placement_ids: string[];
  successor_placement_ids: string[];
  identity_decision_ids: string[];
  operation_ids: string[];
  retirement_reason: string | null;
};

export type InterventionPlacementResolution =
  | { state: "live_identity"; placement_id: string; lineage: string[] }
  | { state: "redirect"; placement_id: string; requested_ref: string; lineage: string[] }
  | { state: "retired_identity"; placement_id: string; successors: string[] }
  | { state: "missing"; requested_ref: string };

export type InterventionPlacementRegistryPartition = {
  registry_count: number;
  live_count: number;
  redirect_count: number;
  retired_count: number;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function placementId(foundingKey: string): string {
  return `placement:${sha256(`intervention-placement-v1\0${foundingKey}`).slice(0, 24)}`;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const set = new Set(allowed);
  const extras = Object.keys(value).filter((field) => !set.has(field)).sort();
  const missing = allowed.filter((field) => !(field in value)).sort();
  if (extras.length || missing.length) {
    throw new Error(`${path}: exact fields required; unknown=${extras.join(",")}; missing=${missing.join(",")}`);
  }
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function strings(value: unknown, path: string, allowEmpty = true): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new Error(`${path} must be an array`);
  const result = value.map((entry, index) => string(entry, `${path}[${index}]`));
  if (new Set(result).size !== result.length ||
      result.join("\n") !== [...result].sort((a, b) => a.localeCompare(b)).join("\n")) {
    throw new Error(`${path} must be sorted and unique`);
  }
  return result;
}

function extent(value: unknown, path: string): ResolvedInterventionExtent {
  const input = object(value, path);
  fields(input, ["description", "kind", "record_ids"], path);
  const kind = string(input.kind, `${path}.kind`);
  if (!["route_wide", "bounded_segment", "stop_set", "service_pattern", "unknown"].includes(kind)) {
    throw new Error(`${path}.kind is invalid`);
  }
  const recordIds = strings(input.record_ids, `${path}.record_ids`);
  if ((kind === "unknown") !== (recordIds.length === 0)) {
    throw new Error(`${path}: unknown must be empty and known extents must have record ids`);
  }
  return {
    kind: kind as ResolvedInterventionExtent["kind"],
    record_ids: recordIds,
    description: input.description === null ? null : string(input.description, `${path}.description`),
  };
}

function claim(value: unknown, path: string): InterventionPlacementFoundingClaim {
  const input = object(value, path);
  fields(input, [
    "gtfs_route_id", "route_record_id", "scope", "treatment_family",
    "treatment_record_ids",
  ], path);
  return {
    route_record_id: string(input.route_record_id, `${path}.route_record_id`),
    gtfs_route_id: string(input.gtfs_route_id, `${path}.gtfs_route_id`),
    treatment_record_ids: strings(input.treatment_record_ids, `${path}.treatment_record_ids`, false),
    treatment_family: string(input.treatment_family, `${path}.treatment_family`),
    scope: extent(input.scope, `${path}.scope`),
  };
}

const baseFields = [
  "adjudicator", "batch_id", "candidate_ids", "decision_id", "independent_reviewer", "integrator_id",
  "issued_at", "manifest_sha256", "operation", "operation_id", "primary_reviewer",
  "rationale", "review_outcome", "schema_version",
];
const operationFields: Record<InterventionPlacementIdentityOperation["operation"], string[]> = {
  establish: [...baseFields, "aliases", "claim", "founding_key"],
  alias: [...baseFields, "alias", "placement_id"],
  scope_correction: [...baseFields, "placement_id", "scope"],
  merge: [...baseFields, "predecessor_placement_ids", "survivor_placement_id"],
  split: [...baseFields, "predecessor_placement_id", "successors"],
  retire: [...baseFields, "placement_id", "retirement_reason", "successor_placement_ids"],
};

export function parseInterventionPlacementIdentityOperation(
  value: unknown,
  path = "placement identity operation",
): InterventionPlacementIdentityOperation {
  const input = object(value, path);
  const operation = string(input.operation, `${path}.operation`) as InterventionPlacementIdentityOperation["operation"];
  if (!(operation in operationFields)) throw new Error(`${path}.operation is invalid`);
  fields(input, operationFields[operation], path);
  if (input.schema_version !== 1) throw new Error(`${path}.schema_version must be 1`);
  const base = {
    schema_version: 1 as const,
    operation_id: string(input.operation_id, `${path}.operation_id`),
    decision_id: string(input.decision_id, `${path}.decision_id`),
    candidate_ids: strings(input.candidate_ids, `${path}.candidate_ids`, false),
    issued_at: string(input.issued_at, `${path}.issued_at`),
    batch_id: string(input.batch_id, `${path}.batch_id`),
    manifest_sha256: string(input.manifest_sha256, `${path}.manifest_sha256`),
    primary_reviewer: string(input.primary_reviewer, `${path}.primary_reviewer`),
    independent_reviewer: string(input.independent_reviewer, `${path}.independent_reviewer`),
    review_outcome: string(input.review_outcome, `${path}.review_outcome`) as OperationBase["review_outcome"],
    adjudicator: input.adjudicator === null ? null : string(input.adjudicator, `${path}.adjudicator`),
    integrator_id: string(input.integrator_id, `${path}.integrator_id`),
    rationale: string(input.rationale, `${path}.rationale`),
  };
  if (!/^[a-f0-9]{64}$/u.test(base.manifest_sha256)) {
    throw new Error(`${path}.manifest_sha256 must be sha256`);
  }
  if (!["agreement", "adjudicated"].includes(base.review_outcome)) {
    throw new Error(`${path}.review_outcome is invalid`);
  }
  if (base.primary_reviewer === base.independent_reviewer) {
    throw new Error(`${path}: primary and independent reviewers must be distinct`);
  }
  if (base.review_outcome === "agreement" && base.adjudicator !== null) {
    throw new Error(`${path}: agreement must not name an adjudicator`);
  }
  if (base.review_outcome === "adjudicated" &&
      (base.adjudicator === null || base.adjudicator === base.primary_reviewer ||
       base.adjudicator === base.independent_reviewer)) {
    throw new Error(`${path}: adjudication requires a distinct adjudicator`);
  }
  if (operation === "establish") return {
    ...base, operation,
    founding_key: string(input.founding_key, `${path}.founding_key`),
    claim: claim(input.claim, `${path}.claim`),
    aliases: strings(input.aliases, `${path}.aliases`),
  };
  if (operation === "alias") return {
    ...base, operation,
    placement_id: string(input.placement_id, `${path}.placement_id`),
    alias: string(input.alias, `${path}.alias`),
  };
  if (operation === "scope_correction") return {
    ...base, operation,
    placement_id: string(input.placement_id, `${path}.placement_id`),
    scope: extent(input.scope, `${path}.scope`),
  };
  if (operation === "merge") return {
    ...base, operation,
    predecessor_placement_ids: strings(input.predecessor_placement_ids, `${path}.predecessor_placement_ids`, false),
    survivor_placement_id: string(input.survivor_placement_id, `${path}.survivor_placement_id`),
  };
  if (operation === "split") {
    if (!Array.isArray(input.successors) || input.successors.length < 2) throw new Error(`${path}.successors requires at least two rows`);
    return {
      ...base, operation,
      predecessor_placement_id: string(input.predecessor_placement_id, `${path}.predecessor_placement_id`),
      successors: input.successors.map((value, index) => {
        const successor = object(value, `${path}.successors[${index}]`);
        fields(successor, ["aliases", "claim", "founding_key"], `${path}.successors[${index}]`);
        return {
          founding_key: string(successor.founding_key, `${path}.successors[${index}].founding_key`),
          claim: claim(successor.claim, `${path}.successors[${index}].claim`),
          aliases: strings(successor.aliases, `${path}.successors[${index}].aliases`),
        };
      }).sort((a, b) => a.founding_key.localeCompare(b.founding_key)),
    };
  }
  return {
    ...base, operation: "retire",
    placement_id: string(input.placement_id, `${path}.placement_id`),
    successor_placement_ids: strings(input.successor_placement_ids, `${path}.successor_placement_ids`),
    retirement_reason: string(input.retirement_reason, `${path}.retirement_reason`),
  };
}

export function replayInterventionPlacementIdentityOperations(
  values: readonly InterventionPlacementIdentityOperation[],
): InterventionPlacementRegistryEntry[] {
  const operations = values.map((value, index) =>
    parseInterventionPlacementIdentityOperation(value, `placement operation[${index}]`)
  ).sort((a, b) => a.operation_id.localeCompare(b.operation_id));
  if (new Set(operations.map((operation) => operation.operation_id)).size !== operations.length) {
    throw new Error("duplicate placement operation id");
  }
  const registry = new Map<string, InterventionPlacementRegistryEntry>();
  const foundingOwners = new Map<string, string>();
  const aliasOwners = new Map<string, string>();
  const establish = (
    foundingKey: string,
    foundingClaim: InterventionPlacementFoundingClaim,
    aliases: string[],
    operation: OperationBase,
    predecessors: string[] = [],
  ) => {
    if (foundingOwners.has(foundingKey)) throw new Error(`placement founding key already owned: ${foundingKey}`);
    const id = placementId(foundingKey);
    if (registry.has(id)) throw new Error(`placement id collision: ${id}`);
    for (const alias of aliases) {
      if (aliasOwners.has(alias)) throw new Error(`placement alias already owned: ${alias}`);
      aliasOwners.set(alias, id);
    }
    foundingOwners.set(foundingKey, id);
    registry.set(id, {
      schema_version: 1,
      placement_id: id,
      registry_state: "live_identity",
      founding_key: foundingKey,
      founding_claim: foundingClaim,
      current_claim: foundingClaim,
      claim_history: [foundingClaim],
      aliases,
      predecessor_placement_ids: [...predecessors].sort(),
      successor_placement_ids: [],
      identity_decision_ids: [operation.decision_id],
      operation_ids: [operation.operation_id],
      retirement_reason: null,
    });
    return registry.get(id)!;
  };
  for (const operation of operations) {
    if (operation.operation === "establish") {
      establish(operation.founding_key, operation.claim, operation.aliases, operation);
      continue;
    }
    if (operation.operation === "alias") {
      const entry = registry.get(operation.placement_id);
      if (!entry || entry.registry_state !== "live_identity") throw new Error(`${operation.operation_id}: alias target is not live`);
      if (aliasOwners.has(operation.alias)) throw new Error(`${operation.operation_id}: alias already owned`);
      aliasOwners.set(operation.alias, entry.placement_id);
      entry.aliases = [...entry.aliases, operation.alias].sort();
      entry.identity_decision_ids.push(operation.decision_id);
      entry.operation_ids.push(operation.operation_id);
      continue;
    }
    if (operation.operation === "scope_correction") {
      const entry = registry.get(operation.placement_id);
      if (!entry || entry.registry_state !== "live_identity") throw new Error(`${operation.operation_id}: correction target is not live`);
      entry.current_claim = { ...entry.current_claim, scope: operation.scope };
      entry.claim_history.push(entry.current_claim);
      entry.identity_decision_ids.push(operation.decision_id);
      entry.operation_ids.push(operation.operation_id);
      continue;
    }
    if (operation.operation === "merge") {
      if (!operation.predecessor_placement_ids.includes(operation.survivor_placement_id)) {
        throw new Error(`${operation.operation_id}: merge survivor must be an existing predecessor`);
      }
      const entries = operation.predecessor_placement_ids.map((id) => registry.get(id));
      if (entries.some((entry) => !entry || entry.registry_state !== "live_identity")) {
        throw new Error(`${operation.operation_id}: merge predecessors must be live`);
      }
      const survivor = registry.get(operation.survivor_placement_id)!;
      for (const entry of entries as InterventionPlacementRegistryEntry[]) {
        entry.operation_ids.push(operation.operation_id);
        entry.identity_decision_ids.push(operation.decision_id);
        if (entry === survivor) continue;
        entry.registry_state = "retired_identity";
        entry.successor_placement_ids = [survivor.placement_id];
        entry.retirement_reason = "merged";
        survivor.predecessor_placement_ids = [...new Set([
          ...survivor.predecessor_placement_ids,
          entry.placement_id,
        ])].sort();
      }
      continue;
    }
    if (operation.operation === "split") {
      const predecessor = registry.get(operation.predecessor_placement_id);
      if (!predecessor || predecessor.registry_state !== "live_identity") {
        throw new Error(`${operation.operation_id}: split predecessor must be live`);
      }
      const successors = operation.successors.map((successor) =>
        establish(successor.founding_key, successor.claim, successor.aliases, operation, [predecessor.placement_id])
      );
      predecessor.registry_state = "retired_identity";
      predecessor.successor_placement_ids = successors.map((entry) => entry.placement_id).sort();
      predecessor.retirement_reason = "split";
      predecessor.identity_decision_ids.push(operation.decision_id);
      predecessor.operation_ids.push(operation.operation_id);
      continue;
    }
    const entry = registry.get(operation.placement_id);
    if (!entry || entry.registry_state !== "live_identity") throw new Error(`${operation.operation_id}: retire target is not live`);
    for (const successorId of operation.successor_placement_ids) {
      const successor = registry.get(successorId);
      if (!successor || successor.registry_state !== "live_identity" || successorId === entry.placement_id) {
        throw new Error(`${operation.operation_id}: missing or non-live retirement successor`);
      }
      successor.predecessor_placement_ids = [...new Set([
        ...successor.predecessor_placement_ids,
        entry.placement_id,
      ])].sort();
    }
    entry.registry_state = "retired_identity";
    entry.successor_placement_ids = operation.successor_placement_ids;
    entry.retirement_reason = operation.retirement_reason;
    entry.identity_decision_ids.push(operation.decision_id);
    entry.operation_ids.push(operation.operation_id);
  }
  const result = [...registry.values()].sort((a, b) => a.placement_id.localeCompare(b.placement_id));
  interventionPlacementRegistryPartition(result);
  return result;
}

export function interventionPlacementRegistryPartition(
  registry: readonly InterventionPlacementRegistryEntry[],
): InterventionPlacementRegistryPartition {
  const ids = new Set(registry.map((entry) => entry.placement_id));
  if (ids.size !== registry.length) throw new Error("duplicate placement registry id");
  for (const entry of registry) {
    for (const predecessorId of entry.predecessor_placement_ids) {
      const predecessor = registry.find((candidate) => candidate.placement_id === predecessorId);
      if (!predecessor || !predecessor.successor_placement_ids.includes(entry.placement_id)) {
        throw new Error(`${entry.placement_id}: asymmetric predecessor lineage`);
      }
    }
    for (const successorId of entry.successor_placement_ids) {
      const successor = registry.find((candidate) => candidate.placement_id === successorId);
      if (!successor || !successor.predecessor_placement_ids.includes(entry.placement_id)) {
        throw new Error(`${entry.placement_id}: asymmetric successor lineage`);
      }
    }
  }
  let live = 0;
  let redirect = 0;
  let retired = 0;
  for (const entry of registry) {
    if (entry.registry_state === "live_identity") {
      live += 1;
      continue;
    }
    if (resolveInterventionPlacement(entry.placement_id, registry).state === "redirect") {
      redirect += 1;
    } else {
      retired += 1;
    }
  }
  if (registry.length !== live + redirect + retired) {
    throw new Error("placement registry live/redirect/retired partition is unbalanced");
  }
  return {
    registry_count: registry.length,
    live_count: live,
    redirect_count: redirect,
    retired_count: retired,
  };
}

export function resolveInterventionPlacement(
  reference: string,
  registry: readonly InterventionPlacementRegistryEntry[],
): InterventionPlacementResolution {
  const byId = new Map(registry.map((entry) => [entry.placement_id, entry]));
  const entry = byId.get(reference) ??
    registry.find((candidate) => candidate.founding_key === reference || candidate.aliases.includes(reference));
  if (!entry) return { state: "missing", requested_ref: reference };
  const lineage = [entry.placement_id];
  let current = entry;
  const seen = new Set(lineage);
  while (current.registry_state === "retired_identity" && current.successor_placement_ids.length === 1) {
    const next = byId.get(current.successor_placement_ids[0]!);
    if (!next || seen.has(next.placement_id)) throw new Error("malformed placement redirect lineage");
    current = next;
    lineage.push(current.placement_id);
    seen.add(current.placement_id);
  }
  if (current.registry_state === "retired_identity") {
    return { state: "retired_identity", placement_id: current.placement_id, successors: current.successor_placement_ids };
  }
  if (reference === current.placement_id) return { state: "live_identity", placement_id: current.placement_id, lineage };
  return { state: "redirect", placement_id: current.placement_id, requested_ref: reference, lineage };
}

export function loadInterventionPlacementIdentityOperations(
  dir: string,
): InterventionPlacementIdentityOperation[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".json")).sort()
    .map((name) => {
      const path = join(dir, name);
      const operation = parseInterventionPlacementIdentityOperation(
        JSON.parse(readFileSync(path, "utf8")) as unknown,
        path,
      );
      if (`${operation.operation_id}.json` !== basename(path)) {
        throw new Error(`${path}: operation_id must match file name`);
      }
      return operation;
    });
}

export function validateInterventionPlacementIdentityOperationManifests(
  values: readonly InterventionPlacementIdentityOperation[],
  batchesDir: string,
): InterventionPlacementIdentityOperation[] {
  return values.map((value, index) => {
    const operation = parseInterventionPlacementIdentityOperation(
      value,
      `accepted placement identity operation[${index}]`,
    );
    const path = join(batchesDir, `${operation.batch_id}.json`);
    if (!existsSync(path)) throw new Error(`${operation.operation_id}: missing frozen batch manifest`);
    const content = readFileSync(path, "utf8");
    if (sha256(content) !== operation.manifest_sha256) {
      throw new Error(`${operation.operation_id}: frozen batch manifest hash drifted`);
    }
    const manifest = object(JSON.parse(content) as unknown, path);
    if (manifest.batch_id !== operation.batch_id) {
      throw new Error(`${operation.operation_id}: frozen batch identity is inconsistent`);
    }
    const candidates = Array.isArray(manifest.candidates)
      ? new Set(manifest.candidates.map((candidate, candidateIndex) =>
        string(
          object(candidate, `${path}.candidates[${candidateIndex}]`).candidate_id,
          `${path}.candidates[${candidateIndex}].candidate_id`,
        )
      ))
      : new Set<string>();
    if (operation.candidate_ids.some((candidateId) => !candidates.has(candidateId))) {
      throw new Error(`${operation.operation_id}: identity candidate is absent from frozen batch manifest`);
    }
    const assignments = object(manifest.reviewer_assignments, `${path}.reviewer_assignments`);
    if (assignments.primary_reviewer !== operation.primary_reviewer ||
        assignments.required_independent_reviewer !== operation.independent_reviewer ||
        assignments.single_writer_integrator !== operation.integrator_id ||
        (operation.review_outcome === "adjudicated" &&
         assignments.clean_room_adjudicator !== operation.adjudicator)) {
      throw new Error(`${operation.operation_id}: reviewer assignment drifted from frozen manifest`);
    }
    return operation;
  }).sort((a, b) => a.operation_id.localeCompare(b.operation_id));
}

export function interventionPlacementRegistryJsonl(
  registry: readonly InterventionPlacementRegistryEntry[],
): string {
  return registry.map((entry) => stableJson(entry as unknown as JsonValue)).join("\n") +
    (registry.length ? "\n" : "");
}
