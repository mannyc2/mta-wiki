import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import {
  parseOperationalEpisodeAcceptedMapping,
  type OperationalEpisodeAcceptedMapping,
  type OperationalEpisodeEvidenceBinding,
} from "../packages/pipeline/src/materialize/operational-episode-adapters";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import { loadOperationalOccurrenceIdentityRegistryV2 } from "../packages/pipeline/src/materialize/operational-occurrence-identity-operations";

const outputDir = join(repoRoot, "data", "operational-episode-resolution", "adapters");
const legacyDecisionDir = join(
  repoRoot,
  "data",
  "operational-occurrence-review",
  "accepted",
  "decisions",
);
const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check") {
  throw new Error("usage: bun scripts/generate-operational-episode-mappings-v1.ts --write|--check");
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function collectEvidence(value: unknown, found: Map<string, OperationalEpisodeEvidenceBinding>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectEvidence(entry, found));
    return;
  }
  const input = object(value);
  if (!input) return;
  if (
    typeof input.record_id === "string" &&
    typeof input.source_id === "string" &&
    typeof input.evidence_id === "string"
  ) {
    const binding = {
      record_id: input.record_id,
      source_id: input.source_id,
      evidence_id: input.evidence_id,
    };
    found.set(`${binding.record_id}|${binding.source_id}|${binding.evidence_id}`, binding);
  }
  Object.values(input).forEach((entry) => collectEvidence(entry, found));
}

function eventEvidence(event: MtaCanonicalRecord): OperationalEpisodeEvidenceBinding[] {
  return event.evidence_refs.flatMap((ref) =>
    typeof ref.source_id === "string" && typeof ref.evidence_id === "string"
      ? [{ record_id: event.record_id, source_id: ref.source_id, evidence_id: ref.evidence_id }]
      : []
  );
}

function relationTouches(record: MtaCanonicalRecord, ids: ReadonlySet<string>): boolean {
  return record.record_kind === "relation" && (
    (typeof record.payload.subject_id === "string" && ids.has(record.payload.subject_id)) ||
    (typeof record.payload.object_id === "string" && ids.has(record.payload.object_id))
  );
}

const records = readCanonicalRecordsFromJsonl();
const recordsById = new Map(records.map((record) => [record.record_id, record]));
const registry = loadOperationalOccurrenceIdentityRegistryV2(repoRoot);
const legacyDecisions = readdirSync(legacyDecisionDir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(legacyDecisionDir, name), "utf8")) as Record<string, unknown>);
const decisionsByOccurrence = new Map(
  legacyDecisions.flatMap((decision) =>
    typeof decision.occurrence_id === "string" ? [[decision.occurrence_id, decision] as const] : []
  ),
);

const contents = new Map<string, string>();
for (const identity of registry) {
  const decision = decisionsByOccurrence.get(identity.occurrence_id);
  const fallbackEventId = identity.current_founding_key.startsWith("event:")
    ? identity.current_founding_key.slice("event:".length)
    : "";
  const observationIds = Array.isArray(decision?.observation_event_record_ids)
    ? (decision!.observation_event_record_ids as unknown[]).map(String).sort()
    : [fallbackEventId];
  if (observationIds.some((id) => !id || !recordsById.has(id))) {
    throw new Error(`identity ${identity.occurrence_id} cannot resolve its cohort observation`);
  }
  const observationIdSet = new Set(observationIds);
  const relationIds = Array.isArray(decision?.observation_relation_record_ids)
    ? (decision!.observation_relation_record_ids as unknown[]).map(String).sort()
    : records.filter((record) => relationTouches(record, observationIdSet)).map((record) => record.record_id).sort();
  const evidence = new Map<string, OperationalEpisodeEvidenceBinding>();
  if (decision) collectEvidence(decision, evidence);
  if (evidence.size === 0) {
    for (const eventId of observationIds) {
      for (const binding of eventEvidence(recordsById.get(eventId)!)) {
        evidence.set(`${binding.record_id}|${binding.source_id}|${binding.evidence_id}`, binding);
      }
    }
  }
  if (evidence.size === 0) throw new Error(`identity ${identity.occurrence_id} has no mapping evidence`);
  const mappingId = `mapping:${identity.occurrence_id}`;
  const mapping: OperationalEpisodeAcceptedMapping = {
    schema_version: 1,
    mapping_id: mappingId,
    adapter_id: "accepted_mapping_v1",
    observation_event_record_ids: observationIds,
    observation_relation_record_ids: relationIds,
    candidate_keys: [identity.current_founding_key],
    occurrence_id: identity.occurrence_id,
    evidence_bindings: [...evidence.values()].sort((left, right) =>
      `${left.record_id}|${left.source_id}|${left.evidence_id}`.localeCompare(
        `${right.record_id}|${right.source_id}|${right.evidence_id}`,
      )
    ),
    decision_id: typeof decision?.decision_id === "string"
      ? decision.decision_id
      : `identity-establishment:${identity.occurrence_id}`,
    reviewer: typeof decision?.reviewer === "string"
      ? decision.reviewer
      : "operational-occurrence-v1-to-v2-migration",
    reviewed_at: typeof decision?.accepted_at === "string"
      ? decision.accepted_at
      : "2026-07-28T00:00:00Z",
    rationale: typeof decision?.rationale === "string"
      ? decision.rationale
      : "The accepted identity establishment operation preserves this source observation as an unresolved active episode candidate without granting publication authority.",
  };
  const parsed = parseOperationalEpisodeAcceptedMapping(mapping);
  contents.set(`${mappingId}.json`, `${stableJson(parsed as unknown as JsonValue)}\n`);
}

if (contents.size !== 135) throw new Error(`expected 135 identity mappings, found ${contents.size}`);
if (mode === "--write") {
  mkdirSync(outputDir, { recursive: true });
  for (const [name, content] of contents) writeFileSync(join(outputDir, name), content);
} else {
  if (!existsSync(outputDir)) throw new Error(`mapping output directory is missing: ${outputDir}`);
  const names = readdirSync(outputDir).sort();
  if (stableJson(names as unknown as JsonValue) !== stableJson([...contents.keys()].sort() as unknown as JsonValue)) {
    throw new Error("operational episode mapping file set is stale");
  }
  for (const [name, content] of contents) {
    if (readFileSync(join(outputDir, name), "utf8") !== content) {
      throw new Error(`operational episode mapping is stale: ${name}`);
    }
  }
}
console.log(`Operational episode accepted mappings verified: ${contents.size} identity-bound mappings.`);
