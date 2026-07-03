import { countDeepSeekTokens } from "@mta-wiki/pipeline/sources/deepseek-tokenizer";
import {
  canonicalRecordIdForInput,
  identityDoNotMergeSuppressed,
  isGlobalRecordKind,
  readIdentityDoNotMergeOverrides,
  resolveIdentityCandidates,
  type GlobalMtaRecordKind,
} from "@mta-wiki/db/identity";
import { kindSpec } from "@mta-wiki/db/kind-registry";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/materialize";
import { readSubmissionEntries } from "@mta-wiki/pipeline/records/submissions";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaEvidenceRef, MtaObservationKind, MtaSubmissionEntry } from "@mta-wiki/db/types";

// Deterministic packet builder for the post-run canonicalizer. Each packet is
// the full context one agent call needs: the run's observations of a kind,
// compact registry cards for the kind (or shortlists when the registry is too
// large), and the do-not-merge pairs that constrain link decisions.

export const IDENTITY_PACKET_KINDS: GlobalMtaRecordKind[] = ["route", "entity", "project", "corridor"];
export const RELATION_LINKER_OBJECT_KINDS: MtaObservationKind[] = ["metric_claim", "claim", "event"];

/** Above this many DeepSeek tokens of registry cards, a packet switches to shortlist mode. */
const REGISTRY_CARD_TOKEN_BUDGET = 120_000;
const SHORTLIST_CANDIDATES_PER_OBSERVATION = 8;

export type CanonicalizePacketKind = "identity" | "treatment" | "relation_linker";

export type CanonicalizeObservation = {
  submission_id: string;
  local_observation_id: string;
  observation_kind: MtaObservationKind;
  source_id: string;
  /** Bare base record id the observation folds into (post identity-override folding). */
  base_record_id: string;
  /** Canonical record id the observation actually materialized into, when found. */
  record_id?: string | undefined;
  label?: string | undefined;
  raw_text?: string | undefined;
  payload: JsonObject;
  evidence_quotes: string[];
  evidence_refs: Array<{ source_id: string; block_id?: string | undefined; page_number?: number | undefined }>;
};

export type CanonicalizeRegistryCard = {
  record_id: string;
  record_kind: MtaObservationKind;
  display_name: string;
  record_aliases?: string[] | undefined;
  source_ids: string[];
  payload: JsonObject;
};

export type CanonicalizePacket = {
  packet_id: string;
  packet_kind: CanonicalizePacketKind;
  run_id: string;
  kind: MtaObservationKind | "relation_linker";
  observation_count: number;
  observations: CanonicalizeObservation[];
  registry_mode: "full" | "shortlist";
  registry_cards: CanonicalizeRegistryCard[];
  /** Shortlist mode only: full id+name index so the model knows what exists. */
  registry_index?: Array<{ record_id: string; display_name: string }> | undefined;
  /** Shortlist mode only: per-observation candidate record ids (cards included in registry_cards). */
  shortlists?: Record<string, string[]> | undefined;
  do_not_merge_pairs: Array<{ record_ids: string[]; reason?: string | undefined }>;
  existing_relation_keys: string[];
};

function stringValue(value: JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function compactCardPayload(record: MtaCanonicalRecord): JsonObject {
  const spec = kindSpec(record.record_kind);
  const fields = spec ? [...new Set([...spec.preferred_fields, ...spec.anchors])] : Object.keys(record.payload).slice(0, 12);
  const payload: JsonObject = {};
  for (const field of fields) {
    const value = record.payload[field];
    if (value !== undefined) payload[field] = value;
  }
  return payload;
}

export function canonicalizeRegistryCard(record: MtaCanonicalRecord): CanonicalizeRegistryCard {
  return {
    record_id: record.record_id,
    record_kind: record.record_kind,
    display_name: record.display_name,
    record_aliases: record.record_aliases,
    source_ids: [...new Set([record.source_id, ...(record.source_ids ?? [])])].sort(),
    payload: compactCardPayload(record),
  };
}

function recordBySubmissionId(records: MtaCanonicalRecord[]) {
  const map = new Map<string, MtaCanonicalRecord>();
  for (const record of records) {
    for (const submissionId of record.submission_ids) map.set(submissionId, record);
  }
  return map;
}

function observationFromEntry(entry: MtaSubmissionEntry, bySubmission: Map<string, MtaCanonicalRecord>): CanonicalizeObservation {
  const refs = entry.tool_args.evidence_refs ?? [];
  return {
    submission_id: entry.submission_id,
    local_observation_id: entry.tool_args.local_observation_id,
    observation_kind: entry.tool_args.observation_kind,
    source_id: entry.tool_args.source_id,
    base_record_id: canonicalRecordIdForInput(entry.tool_args),
    record_id: bySubmission.get(entry.submission_id)?.record_id,
    label: entry.tool_args.label,
    raw_text: entry.tool_args.raw_text,
    payload: entry.tool_args.payload ?? {},
    evidence_quotes: refs.map((ref) => ref.source_quote).filter((quote): quote is string => Boolean(quote)),
    evidence_refs: refs.map((ref) => ({ source_id: ref.source_id, block_id: ref.block_id, page_number: ref.page_number })),
  };
}

function doNotMergePairsForKind(kind: MtaObservationKind) {
  if (!isGlobalRecordKind(kind)) return [];
  return (readIdentityDoNotMergeOverrides().pairs?.[kind] ?? [])
    .filter((entry) => Array.isArray(entry.record_ids) && entry.record_ids.length === 2)
    .map((entry) => ({ record_ids: entry.record_ids as string[], reason: entry.reason }));
}

function existingRelationKeys(records: MtaCanonicalRecord[]) {
  const keys = new Set<string>();
  for (const record of records) {
    if (record.record_kind !== "relation") continue;
    const relationKind = stringValue(record.payload.relation_kind);
    const subjectId = stringValue(record.payload.subject_id);
    const objectId = stringValue(record.payload.object_id);
    if (relationKind && subjectId && objectId) keys.add(`${relationKind} ${subjectId} -> ${objectId}`);
  }
  return [...keys].sort();
}

function shortlistQuery(observation: CanonicalizeObservation) {
  return observation.label ?? observation.raw_text ?? observation.local_observation_id;
}

function withRegistryGuard(
  packet: Omit<CanonicalizePacket, "registry_mode" | "registry_cards" | "registry_index" | "shortlists">,
  kindRecords: MtaCanonicalRecord[],
): CanonicalizePacket {
  const fullCards = kindRecords.map(canonicalizeRegistryCard);
  const tokens = countDeepSeekTokens(JSON.stringify(fullCards));
  if (tokens <= REGISTRY_CARD_TOKEN_BUDGET) {
    return { ...packet, registry_mode: "full", registry_cards: fullCards };
  }

  const shortlists: Record<string, string[]> = {};
  const cardIds = new Set<string>();
  for (const observation of packet.observations) {
    const candidates = isGlobalRecordKind(observation.observation_kind)
      ? resolveIdentityCandidates(observation.observation_kind, shortlistQuery(observation), kindRecords, SHORTLIST_CANDIDATES_PER_OBSERVATION)
      : [];
    shortlists[observation.local_observation_id] = candidates.map((candidate) => candidate.record_id);
    for (const candidate of candidates) cardIds.add(candidate.record_id);
  }
  const cards = kindRecords.filter((record) => cardIds.has(record.record_id)).map(canonicalizeRegistryCard);
  return {
    ...packet,
    registry_mode: "shortlist",
    registry_cards: cards,
    registry_index: kindRecords.map((record) => ({ record_id: record.record_id, display_name: record.display_name })),
    shortlists,
  };
}

export type BuildCanonicalizePacketsOptions = {
  kind?: string | undefined;
  records?: MtaCanonicalRecord[] | undefined;
  entries?: MtaSubmissionEntry[] | undefined;
};

export function buildCanonicalizePackets(runId: string, options: BuildCanonicalizePacketsOptions = {}): CanonicalizePacket[] {
  const records = options.records ?? readCanonicalRecords();
  const entries = options.entries ?? readSubmissionEntries();
  const runEntries = entries.filter((entry) => entry.run_id === runId && entry.validation.state === "accepted");
  if (runEntries.length === 0) throw new Error(`No accepted submissions found for run ${runId}.`);

  const bySubmission = recordBySubmissionId(records);
  const observationsByKind = new Map<MtaObservationKind, CanonicalizeObservation[]>();
  for (const entry of runEntries) {
    const kind = entry.tool_args.observation_kind;
    observationsByKind.set(kind, [...(observationsByKind.get(kind) ?? []), observationFromEntry(entry, bySubmission)]);
  }

  const packets: CanonicalizePacket[] = [];

  for (const kind of IDENTITY_PACKET_KINDS) {
    const observations = observationsByKind.get(kind) ?? [];
    if (observations.length === 0) continue;
    packets.push(
      withRegistryGuard(
        {
          packet_id: `${kind}-identity`,
          packet_kind: "identity",
          run_id: runId,
          kind,
          observation_count: observations.length,
          observations,
          do_not_merge_pairs: doNotMergePairsForKind(kind),
          existing_relation_keys: [],
        },
        records.filter((record) => record.record_kind === kind),
      ),
    );
  }

  const treatmentObservations = observationsByKind.get("treatment_component") ?? [];
  if (treatmentObservations.length > 0) {
    packets.push(
      withRegistryGuard(
        {
          packet_id: "treatment-relations",
          packet_kind: "treatment",
          run_id: runId,
          kind: "treatment_component",
          observation_count: treatmentObservations.length,
          observations: treatmentObservations,
          do_not_merge_pairs: [],
          existing_relation_keys: existingRelationKeys(records).filter((key) => key.startsWith("has_treatment ")),
        },
        records.filter((record) => record.record_kind === "project" || record.record_kind === "corridor"),
      ),
    );
  }

  const linkerObservations = RELATION_LINKER_OBJECT_KINDS.flatMap((kind) => observationsByKind.get(kind) ?? []);
  if (linkerObservations.length > 0) {
    packets.push(
      withRegistryGuard(
        {
          packet_id: "relation-linker",
          packet_kind: "relation_linker",
          run_id: runId,
          kind: "relation_linker",
          observation_count: linkerObservations.length,
          observations: linkerObservations,
          do_not_merge_pairs: [],
          existing_relation_keys: existingRelationKeys(records).filter(
            (key) => key.startsWith("has_metric ") || key.startsWith("has_claim ") || key.startsWith("has_timeline_event "),
          ),
        },
        records.filter((record) => isGlobalRecordKind(record.record_kind)),
      ),
    );
  }

  const filtered = options.kind ? packets.filter((packet) => packet.kind === options.kind || packet.packet_id === options.kind) : packets;
  if (filtered.length === 0) throw new Error(`No canonicalize packets matched${options.kind ? ` kind ${options.kind}` : ""} for run ${runId}.`);
  return filtered;
}

/** True when a proposed link pair is blocked by an existing do-not-merge override. */
export function linkPairSuppressed(kind: MtaObservationKind, baseRecordId: string, targetRecordId: string) {
  return identityDoNotMergeSuppressed(kind, baseRecordId, targetRecordId);
}

export type CanonicalizeEvidenceRefInput = {
  source_id: string;
  block_id: string;
  source_quote?: string | undefined;
};

export type CanonicalizeProposedRelation = {
  relation_kind: string;
  subject_id: string;
  object_id: string;
  description?: string | undefined;
  evidence_refs: CanonicalizeEvidenceRefInput[];
};

export type CanonicalizeDecision = {
  decision_id: string;
  run_id: string;
  packet_id: string;
  packet_kind: CanonicalizePacketKind;
  kind: string;
  submission_id: string;
  local_observation_id: string;
  source_id: string;
  base_record_id: string;
  decision: "link" | "new" | "relate" | "skip" | "uncertain";
  target_record_id?: string | undefined;
  proposed_relations: CanonicalizeProposedRelation[];
  rationale: string;
  evidence_refs: CanonicalizeEvidenceRefInput[];
};

export type { MtaEvidenceRef };
