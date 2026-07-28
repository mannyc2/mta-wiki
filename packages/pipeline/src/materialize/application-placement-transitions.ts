import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { OperationalOccurrenceEvidenceBinding } from "./operational-occurrences.js";
import type { ResolvedInterventionApplication } from "./resolved-intervention-applications.js";
import type { InterventionPlacementRegistryEntry } from "./intervention-placements.js";

export type ApplicationPlacementTransition = {
  schema_version: 1;
  transition_id: string;
  application_id: string;
  application_fingerprint: string;
  action: ResolvedInterventionApplication["action"];
  target_placement_ids: string[];
  result_placement_ids: string[];
  decision_id: string;
  evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  reviewer: string;
  reviewed_at: string;
  rationale: string;
};

const fields = new Set([
  "action", "application_fingerprint", "application_id", "decision_id",
  "evidence_bindings", "rationale", "result_placement_ids", "reviewed_at",
  "reviewer", "schema_version", "target_placement_ids", "transition_id",
]);
const evidenceFields = new Set(["evidence_id", "record_id", "role", "source_id"]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, expected: ReadonlySet<string>, path: string): void {
  const extras = Object.keys(value).filter((field) => !expected.has(field)).sort();
  const missing = [...expected].filter((field) => !(field in value)).sort();
  if (extras.length || missing.length) throw new Error(`${path}: exact fields required; unknown=${extras}; missing=${missing}`);
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}
function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const result = value.map((entry, index) => string(entry, `${path}[${index}]`));
  if (new Set(result).size !== result.length || result.join("\n") !== [...result].sort().join("\n")) {
    throw new Error(`${path} must be sorted and unique`);
  }
  return result;
}
function evidence(value: unknown, path: string): OperationalOccurrenceEvidenceBinding[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path} must be a non-empty array`);
  const result = value.map((entry, index) => {
    const row = object(entry, `${path}[${index}]`);
    exact(row, evidenceFields, `${path}[${index}]`);
    return {
      role: string(row.role, `${path}[${index}].role`) as OperationalOccurrenceEvidenceBinding["role"],
      record_id: string(row.record_id, `${path}[${index}].record_id`),
      source_id: string(row.source_id, `${path}[${index}].source_id`),
      evidence_id: string(row.evidence_id, `${path}[${index}].evidence_id`),
    };
  });
  const keys = result.map((row) => [row.role, row.record_id, row.source_id, row.evidence_id].join("|"));
  if (new Set(keys).size !== keys.length || keys.join("\n") !== [...keys].sort().join("\n")) {
    throw new Error(`${path} must be sorted and unique`);
  }
  return result;
}

export function interventionApplicationFingerprint(application: ResolvedInterventionApplication): string {
  return createHash("sha256").update(stableJson(application as unknown as JsonValue)).digest("hex");
}

export function parseApplicationPlacementTransition(
  value: unknown,
  path = "application placement transition",
): ApplicationPlacementTransition {
  const input = object(value, path);
  exact(input, fields, path);
  if (input.schema_version !== 1) throw new Error(`${path}.schema_version must be 1`);
  const action = string(input.action, `${path}.action`);
  if (!["add", "modify", "remove", "suspend", "resume", "retain", "unknown"].includes(action)) {
    throw new Error(`${path}.action is invalid`);
  }
  const row: ApplicationPlacementTransition = {
    schema_version: 1,
    transition_id: string(input.transition_id, `${path}.transition_id`),
    application_id: string(input.application_id, `${path}.application_id`),
    application_fingerprint: string(input.application_fingerprint, `${path}.application_fingerprint`),
    action: action as ApplicationPlacementTransition["action"],
    target_placement_ids: strings(input.target_placement_ids, `${path}.target_placement_ids`),
    result_placement_ids: strings(input.result_placement_ids, `${path}.result_placement_ids`),
    decision_id: string(input.decision_id, `${path}.decision_id`),
    evidence_bindings: evidence(input.evidence_bindings, `${path}.evidence_bindings`),
    reviewer: string(input.reviewer, `${path}.reviewer`),
    reviewed_at: string(input.reviewed_at, `${path}.reviewed_at`),
    rationale: string(input.rationale, `${path}.rationale`),
  };
  const expectedId = `transition:${createHash("sha256")
    .update(stableJson({
      application_id: row.application_id,
      decision_id: row.decision_id,
      result_placement_ids: row.result_placement_ids,
      target_placement_ids: row.target_placement_ids,
    } as JsonValue))
    .digest("hex").slice(0, 24)}`;
  if (row.transition_id !== expectedId) throw new Error(`${path}.transition_id is stale`);
  return row;
}

export function validateApplicationPlacementTransitions(
  values: readonly ApplicationPlacementTransition[],
  applications: readonly ResolvedInterventionApplication[],
  registry: readonly InterventionPlacementRegistryEntry[],
  occurrenceOnsets: ReadonlyMap<string, string> = new Map(),
): ApplicationPlacementTransition[] {
  const transitions = values.map((value, index) =>
    parseApplicationPlacementTransition(value, `transition[${index}]`)
  ).sort((a, b) => a.transition_id.localeCompare(b.transition_id));
  if (new Set(transitions.map((row) => row.transition_id)).size !== transitions.length ||
      new Set(transitions.map((row) => row.application_id)).size !== transitions.length) {
    throw new Error("application placement transitions must be unique per transition and application");
  }
  const applicationsById = new Map(applications.map((application) => [application.application_id, application]));
  const placementsById = new Map(registry.map((placement) => [placement.placement_id, placement]));
  const established = new Set<string>();
  const actionOrder: Record<ApplicationPlacementTransition["action"], number> = {
    add: 0,
    retain: 1,
    resume: 2,
    modify: 3,
    suspend: 4,
    remove: 5,
    unknown: 6,
  };
  const ordered = [...transitions].sort((left, right) => {
    const leftApp = applicationsById.get(left.application_id);
    const rightApp = applicationsById.get(right.application_id);
    return (occurrenceOnsets.get(leftApp?.occurrence_id ?? "") ?? "")
      .localeCompare(occurrenceOnsets.get(rightApp?.occurrence_id ?? "") ?? "") ||
      (leftApp?.occurrence_id ?? "").localeCompare(rightApp?.occurrence_id ?? "") ||
      actionOrder[left.action] - actionOrder[right.action] ||
      left.transition_id.localeCompare(right.transition_id);
  });
  for (const transition of ordered) {
    const application = applicationsById.get(transition.application_id);
    if (!application) throw new Error(`${transition.transition_id}: missing application`);
    if (transition.application_fingerprint !== interventionApplicationFingerprint(application) ||
        transition.action !== application.action) {
      throw new Error(`${transition.transition_id}: stale application binding`);
    }
    const appEvidence = new Set(application.evidence_bindings.map((row) =>
      [row.role, row.record_id, row.source_id, row.evidence_id].join("|")
    ));
    const transitionEvidence = new Set(transition.evidence_bindings.map((row) =>
      [row.role, row.record_id, row.source_id, row.evidence_id].join("|")
    ));
    if (transitionEvidence.size !== appEvidence.size ||
        [...transitionEvidence].some((binding) => !appEvidence.has(binding))) {
      throw new Error(`${transition.transition_id}: evidence must consume exact application membership`);
    }
    for (const id of [...transition.target_placement_ids, ...transition.result_placement_ids]) {
      if (!placementsById.has(id)) throw new Error(`${transition.transition_id}: unknown placement ${id}`);
    }
    if (transition.action === "unknown") {
      if (transition.target_placement_ids.length || transition.result_placement_ids.length) {
        throw new Error(`${transition.transition_id}: unknown action is nonauthorizing`);
      }
      continue;
    }
    if (transition.action === "add") {
      if (transition.target_placement_ids.length || transition.result_placement_ids.length === 0) {
        throw new Error(`${transition.transition_id}: add establishes result placements only`);
      }
      transition.result_placement_ids.forEach((id) => established.add(id));
      continue;
    }
    if (transition.target_placement_ids.length === 0 ||
        transition.target_placement_ids.some((id) => !established.has(id))) {
      throw new Error(`${transition.transition_id}: ${transition.action} requires a pre-existing target`);
    }
    if (transition.action === "remove" || transition.action === "suspend") {
      if (transition.result_placement_ids.length) {
        throw new Error(`${transition.transition_id}: ${transition.action} cannot establish a result`);
      }
      continue;
    }
    if (transition.action === "retain" || transition.action === "resume") {
      if (stableJson(transition.target_placement_ids as JsonValue) !==
          stableJson(transition.result_placement_ids as JsonValue)) {
        throw new Error(`${transition.transition_id}: ${transition.action} must continue exact identities`);
      }
      continue;
    }
    if (transition.result_placement_ids.length === 0) throw new Error(`${transition.transition_id}: modify requires a result`);
    for (const resultId of transition.result_placement_ids) {
      if (transition.target_placement_ids.includes(resultId)) continue;
      const result = placementsById.get(resultId)!;
      if (!result.predecessor_placement_ids.some((id) => transition.target_placement_ids.includes(id))) {
        throw new Error(`${transition.transition_id}: modify lacks same-placement continuity or lineage`);
      }
    }
    transition.result_placement_ids.forEach((id) => established.add(id));
  }
  return transitions;
}

export function loadApplicationPlacementTransitions(dir: string): ApplicationPlacementTransition[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".json")).sort().map((name) => {
    const path = join(dir, name);
    const transition = parseApplicationPlacementTransition(JSON.parse(readFileSync(path, "utf8")) as unknown, path);
    if (`${transition.decision_id}.json` !== basename(path)) {
      throw new Error(`${path}: decision_id must match file name`);
    }
    return transition;
  });
}
