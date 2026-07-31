import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";

export const OPERATIONAL_EPISODE_ADAPTER_SCHEMA_VERSION = 1 as const;

export type OperationalEpisodeEvidenceBinding = {
  record_id: string;
  source_id: string;
  evidence_id: string;
};

export type OperationalEpisodeAcceptedMapping = {
  schema_version: 1;
  mapping_id: string;
  adapter_id: "accepted_mapping_v1";
  observation_event_record_ids: string[];
  observation_relation_record_ids: string[];
  candidate_keys: string[];
  occurrence_id: string | null;
  evidence_bindings: OperationalEpisodeEvidenceBinding[];
  decision_id: string;
  reviewer: string;
  reviewed_at: string;
  rationale: string;
};

export type EpisodeAdapterResult =
  | { state: "exact"; candidate_keys: string[]; decision_id: string; relation_record_ids: string[] }
  | { state: "no_match"; reason_code: string; decision_id: string; relation_record_ids: string[] }
  | { state: "ambiguous"; candidate_keys: string[]; decision_id: string; relation_record_ids: string[] }
  | { state: "unsupported"; reason_code: string; relation_record_ids: string[] };

const mappingFields = new Set([
  "adapter_id",
  "candidate_keys",
  "decision_id",
  "evidence_bindings",
  "mapping_id",
  "observation_event_record_ids",
  "observation_relation_record_ids",
  "occurrence_id",
  "rationale",
  "reviewed_at",
  "reviewer",
  "schema_version",
]);
const evidenceFields = new Set(["evidence_id", "record_id", "source_id"]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (extras.length > 0) throw new Error(`${path}: unknown field(s): ${extras.join(", ")}`);
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function strings(value: unknown, path: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${path} must be ${allowEmpty ? "an" : "a non-empty"} array`);
  }
  const result = value.map((entry, index) => string(entry, `${path}[${index}]`)).sort();
  if (new Set(result).size !== result.length) throw new Error(`${path} contains duplicates`);
  return result;
}

export function parseOperationalEpisodeAcceptedMapping(
  value: unknown,
  path = "operational episode accepted mapping",
): OperationalEpisodeAcceptedMapping {
  const input = object(value, path);
  keys(input, mappingFields, path);
  if (input.schema_version !== OPERATIONAL_EPISODE_ADAPTER_SCHEMA_VERSION) {
    throw new Error(`${path}.schema_version must be 1`);
  }
  if (input.adapter_id !== "accepted_mapping_v1") {
    throw new Error(`${path}.adapter_id must be accepted_mapping_v1`);
  }
  const reviewedAt = string(input.reviewed_at, `${path}.reviewed_at`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(reviewedAt)) {
    throw new Error(`${path}.reviewed_at must be an ISO-8601 UTC timestamp`);
  }
  if (!Array.isArray(input.evidence_bindings) || input.evidence_bindings.length === 0) {
    throw new Error(`${path}.evidence_bindings must be a non-empty array`);
  }
  const evidenceBindings = input.evidence_bindings.map((entry, index) => {
    const bindingPath = `${path}.evidence_bindings[${index}]`;
    const binding = object(entry, bindingPath);
    keys(binding, evidenceFields, bindingPath);
    return {
      record_id: string(binding.record_id, `${bindingPath}.record_id`),
      source_id: string(binding.source_id, `${bindingPath}.source_id`),
      evidence_id: string(binding.evidence_id, `${bindingPath}.evidence_id`),
    };
  }).sort((left, right) =>
    `${left.record_id}|${left.source_id}|${left.evidence_id}`.localeCompare(
      `${right.record_id}|${right.source_id}|${right.evidence_id}`,
    )
  );
  const evidenceKeys = evidenceBindings.map((binding) =>
    `${binding.record_id}|${binding.source_id}|${binding.evidence_id}`
  );
  if (new Set(evidenceKeys).size !== evidenceKeys.length) {
    throw new Error(`${path}.evidence_bindings contains duplicates`);
  }
  return {
    schema_version: 1,
    mapping_id: string(input.mapping_id, `${path}.mapping_id`),
    adapter_id: "accepted_mapping_v1",
    observation_event_record_ids: strings(
      input.observation_event_record_ids,
      `${path}.observation_event_record_ids`,
    ),
    observation_relation_record_ids: strings(
      input.observation_relation_record_ids,
      `${path}.observation_relation_record_ids`,
      true,
    ),
    candidate_keys: strings(input.candidate_keys, `${path}.candidate_keys`),
    occurrence_id: input.occurrence_id === null
      ? null
      : string(input.occurrence_id, `${path}.occurrence_id`),
    evidence_bindings: evidenceBindings,
    decision_id: string(input.decision_id, `${path}.decision_id`),
    reviewer: string(input.reviewer, `${path}.reviewer`),
    reviewed_at: reviewedAt,
    rationale: string(input.rationale, `${path}.rationale`),
  };
}

export function loadOperationalEpisodeAcceptedMappings(
  dir: string,
  options: { optionalFixture?: boolean } = {},
): OperationalEpisodeAcceptedMapping[] {
  if (!existsSync(dir)) {
    if (options.optionalFixture) return [];
    throw new Error(`required operational episode adapter directory is missing: ${dir}`);
  }
  const entries = readdirSync(dir, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
  const unsupported = entries.filter((entry) =>
    !(entry.isFile() && entry.name.endsWith(".json")) &&
    !(entry.isDirectory() && entry.name === "accepted-current")
  ).map((entry) => entry.name);
  if (unsupported.length > 0) {
    throw new Error(`operational episode adapter directory contains unsupported entries: ${unsupported.join(", ")}`);
  }
  const paths = entries.flatMap((entry) => {
    if (entry.isFile()) return [join(dir, entry.name)];
    const currentDir = join(dir, entry.name);
    return readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((currentEntry) => {
        if (!currentEntry.isFile() || !currentEntry.name.endsWith(".json")) {
          throw new Error(
            `operational episode accepted-current adapter directory contains unsupported entry: ${currentEntry.name}`,
          );
        }
        return join(currentDir, currentEntry.name);
      });
  });
  const mappings = paths.map((path) => {
    const mapping = parseOperationalEpisodeAcceptedMapping(
      JSON.parse(readFileSync(path, "utf8")) as unknown,
      path,
    );
    if (`${mapping.mapping_id}.json` !== basename(path)) {
      throw new Error(`${path}: mapping_id must match the file name`);
    }
    return mapping;
  });
  const mappingIds = mappings.map((mapping) => mapping.mapping_id);
  if (new Set(mappingIds).size !== mappingIds.length) throw new Error("duplicate operational episode mapping_id");
  const observationOwners = new Map<string, string>();
  for (const mapping of mappings) {
    for (const eventId of mapping.observation_event_record_ids) {
      const prior = observationOwners.get(eventId);
      if (prior) throw new Error(`observation ${eventId} is owned by mappings ${prior} and ${mapping.mapping_id}`);
      observationOwners.set(eventId, mapping.mapping_id);
    }
  }
  return mappings;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function relationEndpoints(record: MtaCanonicalRecord): [string, string] | null {
  if (record.record_kind !== "relation") return null;
  const subject = typeof record.payload.subject_id === "string" ? record.payload.subject_id : null;
  const objectId = typeof record.payload.object_id === "string" ? record.payload.object_id : null;
  return subject && objectId ? [subject, objectId] : null;
}

/**
 * Generic graph adapter. It deliberately emits only an episode candidate
 * fingerprint. Human-reviewed accepted mappings own cross-observation
 * segmentation and supersede this adapter.
 */
export function adaptOperationalObservationFromRelationGraph(
  event: MtaCanonicalRecord,
  records: readonly MtaCanonicalRecord[],
): EpisodeAdapterResult {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const relations = records
    .filter((record) => relationEndpoints(record)?.includes(event.record_id))
    .sort((left, right) => left.record_id.localeCompare(right.record_id));
  const relatedKinds = new Set<string>();
  for (const relation of relations) {
    const endpoints = relationEndpoints(relation);
    if (!endpoints) continue;
    for (const id of endpoints) {
      if (id !== event.record_id) {
        const related = recordsById.get(id);
        if (related) relatedKinds.add(related.record_kind);
      }
    }
  }
  const decisionId = `relation_graph_v1:${event.record_id}`;
  const relationIds = relations.map((relation) => relation.record_id);
  const candidateKeys = [`event:${event.record_id}`];
  const lifecycle = text(event.payload.lifecycle_phase);
  const status = text(event.payload.status);
  if (["planned", "proposed"].includes(lifecycle) || ["planned", "proposed"].includes(status)) {
    return {
      state: "no_match",
      reason_code: "prospective_observation",
      decision_id: decisionId,
      relation_record_ids: relationIds,
    };
  }
  if (relatedKinds.has("route") && relatedKinds.has("treatment_component")) {
    return { state: "exact", candidate_keys: candidateKeys, decision_id: decisionId, relation_record_ids: relationIds };
  }
  if (relatedKinds.has("route") || relatedKinds.has("treatment_component") || relations.length > 0) {
    return { state: "ambiguous", candidate_keys: candidateKeys, decision_id: decisionId, relation_record_ids: relationIds };
  }
  return { state: "unsupported", reason_code: "no_episode_graph", relation_record_ids: [] };
}
