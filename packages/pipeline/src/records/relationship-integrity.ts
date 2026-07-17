import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  loadRelationshipContract,
  relationshipFindingSeverity,
  type LoadedRelationshipContract,
  type RelationshipFindingSeverity,
  type RelationshipValidationMode,
} from "@mta-wiki/db/relationship-contract";
import { shortHash, stableJson } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaEvidenceRef, MtaObservationKind } from "@mta-wiki/db/types";
import {
  evidenceBlockIndexEntry,
  readEvidenceBlockIndex,
  type EvidenceBlockIndex,
} from "../sources/evidence-block-index.js";
import { evidenceId, sourceBlocksRelativePath } from "../sources/source-prep.js";
import {
  loadRelationshipFamilyReviewLedger,
  type LoadedRelationshipFamilyReview,
  type ReviewedRelationshipFamilyDecision,
} from "./relationship-family-review.js";
import { readSemanticCorrections, type SemanticCorrectionEntry } from "./semantic-corrections.js";

export type RelationshipFindingCode =
  | "REL_ENDPOINT_DANGLING"
  | "REL_ENDPOINT_LOCAL_ONLY"
  | "REL_ENDPOINT_LOCAL_MISMATCH"
  | "REL_ENDPOINT_SUPERSEDED"
  | "REL_ALIAS_AMBIGUOUS"
  | "REL_CONTRACT_RULE_MISSING"
  | "REL_ENDPOINT_TYPE_INVALID"
  | "REL_FAMILY_TYPE_SUSPECT"
  | "REL_FAMILY_TYPE_SUSPECT_REVIEWED"
  | "REL_DERIVATION_DANGLING"
  | "REL_EVIDENCE_MISSING"
  | "REL_EVIDENCE_UNRESOLVED"
  | "REL_EVIDENCE_OVERBROAD"
  | "REL_DUPLICATE_IDENTITY"
  | "REL_CONFLICTING_EDGE"
  | "REL_MERGED_EDGE_CONFLICT"
  | "REL_SOURCE_ID_MISSING"
  | "REL_SOURCE_ID_AMBIGUOUS"
  | "REL_ORPHAN_RECORD"
  | "REL_REQUIRED_ROUTE_MISSING"
  | "REL_REQUIRED_TREATMENT_MISSING"
  | "REL_REQUIRED_SEGMENT_MISSING"
  | "REL_REQUIRED_ONSET_MISSING"
  | "REL_REQUIRED_PHASE_MISSING"
  | "REL_REQUIRED_DISPOSITION_MISSING";

/** Ordered, versioned graph finding inventory. Required-role counts live in the separate
 * completeness contract. Graph summaries retain explicit zeroes so an enforcement migration
 * cannot make an integrity backlog disappear merely by omitting an empty key. */
export const RELATIONSHIP_FINDING_CODES = [
  "REL_ENDPOINT_DANGLING",
  "REL_ENDPOINT_LOCAL_ONLY",
  "REL_ENDPOINT_LOCAL_MISMATCH",
  "REL_ENDPOINT_SUPERSEDED",
  "REL_ALIAS_AMBIGUOUS",
  "REL_CONTRACT_RULE_MISSING",
  "REL_ENDPOINT_TYPE_INVALID",
  "REL_FAMILY_TYPE_SUSPECT",
  "REL_FAMILY_TYPE_SUSPECT_REVIEWED",
  "REL_DERIVATION_DANGLING",
  "REL_EVIDENCE_MISSING",
  "REL_EVIDENCE_UNRESOLVED",
  "REL_EVIDENCE_OVERBROAD",
  "REL_DUPLICATE_IDENTITY",
  "REL_CONFLICTING_EDGE",
  "REL_MERGED_EDGE_CONFLICT",
  "REL_SOURCE_ID_MISSING",
  "REL_SOURCE_ID_AMBIGUOUS",
  "REL_ORPHAN_RECORD",
] as const satisfies readonly RelationshipFindingCode[];

const RELATION_PRIMARY_DISPOSITIONS = [
  "clean",
  "endpoint_invalid",
  "local_endpoint_inconsistent",
  "provisional_family_type_suspect",
  "reviewed_family_type_advisory",
  "merged_edge_conflict",
  "same_date_status_conflict",
  "exact_duplicate",
  "parallel_duplicate",
  "structurally_overbroad_evidence",
] as const satisfies readonly RelationshipAuditRow["primary_disposition"][];

export type RelationshipFinding = {
  schema_version: 1;
  contract_id: "relationship-contract-v1";
  finding_id: string;
  code: RelationshipFindingCode;
  severity: RelationshipFindingSeverity;
  primary_disposition: string;
  reasons: string[];
  record_id?: string | undefined;
  related_record_ids: string[];
  relation_kind?: string | undefined;
  relation_family?: string | undefined;
  subject_id?: string | undefined;
  object_id?: string | undefined;
  endpoint_role?: "subject" | "object" | undefined;
  semantic_decision_ids?: string[] | undefined;
  review_provenance?: {
    review_id: string;
    decision_id: string;
    ledger_path: string;
    ledger_sha256: string;
    reviewed_at: string;
    reviewed_by: string;
    evidence_ids: string[];
  } | undefined;
  detail: string;
};

export type RelationshipAuditRow = {
  schema_version: 1;
  record_id: string;
  relation_kind: string;
  relation_family: string;
  subject_id: string | null;
  subject_kind: MtaObservationKind | null;
  object_id: string | null;
  object_kind: MtaObservationKind | null;
  primary_disposition:
    | "endpoint_invalid"
    | "local_endpoint_inconsistent"
    | "provisional_family_type_suspect"
    | "reviewed_family_type_advisory"
    | "merged_edge_conflict"
    | "same_date_status_conflict"
    | "exact_duplicate"
    | "parallel_duplicate"
    | "structurally_overbroad_evidence"
    | "clean";
  reasons: string[];
};

export type RelationshipGraphAudit = {
  schema_version: 1;
  contract_id: "relationship-contract-v1";
  mode: RelationshipValidationMode;
  relation_rows: RelationshipAuditRow[];
  findings: RelationshipFinding[];
  summary: {
    canonical_record_count: number;
    canonical_relation_count: number;
    distinct_relation_kind_count: number;
    contract_rule_count: number;
    contract_covered_relation_count: number;
    finding_count: number;
    findings_by_code: Record<string, number>;
    findings_by_severity: Record<string, number>;
    primary_dispositions: Record<string, number>;
    orphan_records_by_kind: Record<string, number>;
    duplicate_triple_groups: number;
    duplicate_triple_records: number;
    exact_duplicate_groups: number;
    exact_duplicate_records: number;
    ambiguous_aliases: number;
    semantic_supersessions: number;
  };
};

export type RelationshipGraphAuditOptions = {
  mode?: RelationshipValidationMode | undefined;
  contract?: LoadedRelationshipContract | undefined;
  evidenceIndex?: EvidenceBlockIndex | undefined;
  semanticCorrections?: SemanticCorrectionEntry[] | undefined;
  familyReview?: LoadedRelationshipFamilyReview | undefined;
  includeOrphans?: boolean | undefined;
};

type Registry = {
  byId: Map<string, MtaCanonicalRecord>;
  aliases: Map<string, MtaCanonicalRecord[]>;
  locals: Map<string, MtaCanonicalRecord[]>;
  superseded: Map<string, string>;
  sourceRecords: Map<string, MtaCanonicalRecord[]>;
};

function text(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function strings(value: JsonValue | undefined): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
}

function addToMap<T>(map: Map<string, T[]>, key: string, value: T): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function supersessionMap(corrections: readonly SemanticCorrectionEntry[]): Map<string, string> {
  const direct = new Map<string, string>();
  for (const correction of corrections) {
    const survivor = correction.op === "supersede_record" ? text(correction.patch.survivor_record_id) : undefined;
    if (survivor) direct.set(correction.record_id, survivor);
  }
  const resolved = new Map<string, string>();
  for (const [removed, initial] of direct) {
    const seen = new Set([removed]);
    let target = initial;
    while (direct.has(target) && !seen.has(target)) {
      seen.add(target);
      target = direct.get(target)!;
    }
    resolved.set(removed, target);
  }
  return resolved;
}

function buildRegistry(records: readonly MtaCanonicalRecord[], corrections: readonly SemanticCorrectionEntry[]): Registry {
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const aliases = new Map<string, MtaCanonicalRecord[]>();
  const locals = new Map<string, MtaCanonicalRecord[]>();
  const sourceRecords = new Map<string, MtaCanonicalRecord[]>();
  for (const record of records) {
    for (const alias of record.record_aliases ?? []) addToMap(aliases, alias, record);
    for (const local of [record.local_observation_id, ...(record.local_observation_ids ?? [])]) addToMap(locals, local, record);
    if (record.record_kind === "source") addToMap(sourceRecords, record.source_id, record);
  }
  return { byId, aliases, locals, superseded: supersessionMap(corrections), sourceRecords };
}

function findingId(input: Omit<RelationshipFinding, "finding_id" | "severity" | "schema_version" | "contract_id">): string {
  return `relationship-finding:${shortHash(input as unknown as JsonValue, 24)}`;
}

function finding(
  loaded: LoadedRelationshipContract,
  mode: RelationshipValidationMode,
  input: Omit<RelationshipFinding, "finding_id" | "severity" | "schema_version" | "contract_id">,
): RelationshipFinding {
  return {
    schema_version: 1,
    contract_id: "relationship-contract-v1",
    finding_id: findingId(input),
    code: input.code,
    severity: relationshipFindingSeverity(loaded.contract, input.code, mode),
    primary_disposition: input.primary_disposition,
    reasons: [...new Set(input.reasons)].sort(),
    record_id: input.record_id,
    related_record_ids: [...new Set(input.related_record_ids)].sort(),
    relation_kind: input.relation_kind,
    relation_family: input.relation_family,
    subject_id: input.subject_id,
    object_id: input.object_id,
    endpoint_role: input.endpoint_role,
    semantic_decision_ids: input.semantic_decision_ids
      ? [...input.semantic_decision_ids]
      : undefined,
    review_provenance: input.review_provenance
      ? {
          ...input.review_provenance,
          evidence_ids: [...input.review_provenance.evidence_ids],
        }
      : undefined,
    detail: input.detail,
  };
}

function relationContext(record: MtaCanonicalRecord) {
  return {
    relation_kind: text(record.payload.relation_kind),
    relation_family: text(record.payload.relation_family) ?? "other",
    subject_id: text(record.payload.subject_id),
    object_id: text(record.payload.object_id),
  };
}

function broadRangeWidth(blockId: string): number | undefined {
  const match = blockId.match(/^(p\d+)_([a-z]+)(\d+)\.\.\1_\2(\d+)$/u);
  if (!match) return undefined;
  const start = Number(match[3]);
  const end = Number(match[4]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return undefined;
  return end - start + 1;
}

function evidenceIdentity(ref: MtaEvidenceRef): string {
  return ref.evidence_id ?? `${ref.source_id}#${ref.block_id ?? ""}`;
}

function evidenceRefResolutionReasons(
  ref: MtaEvidenceRef,
  evidenceIndex: EvidenceBlockIndex | undefined,
): string[] {
  const block = ref.block_id
    ? evidenceBlockIndexEntry(evidenceIndex, ref.source_id, ref.block_id)
    : undefined;
  const expectedId = ref.block_id
    ? evidenceId(ref.source_id, ref.block_id)
    : undefined;
  return [
    !ref.block_id ? "missing_block_id" : undefined,
    !ref.text_sha256 ? "missing_text_sha256" : undefined,
    ref.source_path !== sourceBlocksRelativePath(ref.source_id)
      ? "invalid_source_path"
      : undefined,
    expectedId && ref.evidence_id !== expectedId
      ? "evidence_id_mismatch"
      : undefined,
    !block ? "block_not_in_public_evidence_index" : undefined,
    block && ref.text_sha256 !== block.raw_text_sha256
      ? "evidence_hash_mismatch"
      : undefined,
    block && ref.page_number !== block.page_number
      ? "evidence_page_mismatch"
      : undefined,
  ].filter((value): value is string => Boolean(value));
}

function exactRelationIdentity(record: MtaCanonicalRecord): string {
  const context = relationContext(record);
  return stableJson({
    relation_kind: context.relation_kind ?? null,
    subject_id: context.subject_id ?? null,
    object_id: context.object_id ?? null,
    assertion_status: text(record.payload.assertion_status) ?? "unknown",
    as_of_date: text(record.payload.as_of_date) ?? null,
    relationship_variant_key: text(record.payload.relationship_variant_key) ?? null,
    evidence_ids: [...new Set(record.evidence_refs.map(evidenceIdentity))].sort(),
  });
}

function tripleKey(record: MtaCanonicalRecord): string {
  const context = relationContext(record);
  return `${context.relation_kind ?? ""}\0${context.subject_id ?? ""}\0${context.object_id ?? ""}`;
}

function conflictKey(record: MtaCanonicalRecord): string {
  return `${tripleKey(record)}\0${text(record.payload.as_of_date) ?? ""}\0${text(record.payload.relationship_variant_key) ?? ""}`;
}

const DELIVERED_STATUSES = new Set(["delivered", "implemented", "launched", "installed", "operational", "realized"]);
const NON_DELIVERED_STATUSES = new Set(["planned", "proposed", "cancelled", "canceled", "deferred"]);

function hasLifecycleConflict(records: readonly MtaCanonicalRecord[]): boolean {
  const statuses = new Set(records.map((record) => text(record.payload.assertion_status) ?? "unknown"));
  return [...statuses].some((status) => DELIVERED_STATUSES.has(status)) && [...statuses].some((status) => NON_DELIVERED_STATUSES.has(status));
}

function familyTypeReason(family: string, subjectKind: MtaObservationKind, objectKind: MtaObservationKind): string | undefined {
  if (family === "route_scope" && objectKind !== "route") return "family_requires_route_object";
  if (family === "corridor_scope" && objectKind !== "corridor") return "family_requires_corridor_object";
  if (family === "metric_context" && !(objectKind === "metric_claim" || (subjectKind === "metric_claim" && objectKind === "source"))) {
    return "family_requires_metric_anchor";
  }
  if (family === "claim_context" && ![subjectKind, objectKind].some((kind) => kind === "claim" || kind === "source_gap")) {
    return "family_requires_claim_or_gap_anchor";
  }
  if (family === "treatment_context" && ![subjectKind, objectKind].includes("treatment_component")) return "family_requires_treatment_anchor";
  if (family === "timeline_context" && ![subjectKind, objectKind].includes("event")) return "family_requires_event_anchor";
  if (family === "agency_role" && ![subjectKind, objectKind].includes("entity")) return "family_requires_entity_anchor";
  if (family === "organization_hierarchy" && !(subjectKind === "entity" && objectKind === "entity")) return "family_requires_entity_to_entity";
  if (family === "ownership_role" && ![subjectKind, objectKind].includes("entity")) return "family_requires_entity_anchor";
  if (family === "program_project_scope" && ![subjectKind, objectKind].includes("project")) return "family_requires_project_anchor";
  if (family === "location_scope" && ![subjectKind, objectKind].some((kind) => kind === "entity" || kind === "corridor")) {
    return "family_requires_location_anchor";
  }
  return undefined;
}

type FamilyReviewMatch =
  | {
      status: "reviewed";
      decision: ReviewedRelationshipFamilyDecision;
      mismatch_reasons: [];
    }
  | {
      status: "unreviewed";
      decision?: ReviewedRelationshipFamilyDecision | undefined;
      mismatch_reasons: string[];
    };

function endpointOwnsLocal(
  endpoint: MtaCanonicalRecord,
  local: string | undefined,
): boolean {
  return !local || [
    endpoint.local_observation_id,
    ...(endpoint.local_observation_ids ?? []),
  ].includes(local);
}

function familyReviewMatch(
  record: MtaCanonicalRecord,
  context: ReturnType<typeof relationContext>,
  subject: MtaCanonicalRecord,
  object: MtaCanonicalRecord,
  evidenceIndex: EvidenceBlockIndex | undefined,
  review: LoadedRelationshipFamilyReview,
): FamilyReviewMatch {
  const decision = review.reviewed_by_record_id.get(record.record_id);
  if (!decision) {
    return {
      status: "unreviewed",
      mismatch_reasons: ["family_shape_has_no_exact_review_decision"],
    };
  }

  const mismatchReasons: string[] = [];
  if (context.relation_kind !== decision.relation_kind) {
    mismatchReasons.push("reviewed_family_relation_kind_mismatch");
  }
  if (context.relation_family !== decision.relation_family) {
    mismatchReasons.push("reviewed_family_relation_family_mismatch");
  }
  if (context.subject_id !== decision.subject_id) {
    mismatchReasons.push("reviewed_family_subject_id_mismatch");
  }
  if (context.object_id !== decision.object_id) {
    mismatchReasons.push("reviewed_family_object_id_mismatch");
  }
  if (subject.record_kind !== decision.subject_kind) {
    mismatchReasons.push("reviewed_family_subject_kind_mismatch");
  }
  if (object.record_kind !== decision.object_kind) {
    mismatchReasons.push("reviewed_family_object_kind_mismatch");
  }
  if (
    !endpointOwnsLocal(
      subject,
      text(record.payload.subject_local_observation_id),
    )
  ) {
    mismatchReasons.push("reviewed_family_subject_local_mismatch");
  }
  if (
    !endpointOwnsLocal(
      object,
      text(record.payload.object_local_observation_id),
    )
  ) {
    mismatchReasons.push("reviewed_family_object_local_mismatch");
  }

  const observedEvidence = record.evidence_refs
    .map((ref) => ({
      evidence_id: evidenceIdentity(ref),
      text_sha256: ref.text_sha256 ?? "",
    }))
    .sort(
      (left, right) =>
        left.evidence_id.localeCompare(right.evidence_id) ||
        left.text_sha256.localeCompare(right.text_sha256),
    );
  const expectedEvidence = [...decision.evidence].sort((left, right) =>
    left.evidence_id.localeCompare(right.evidence_id)
  );
  if (
    stableJson(
      observedEvidence.map((entry) => entry.evidence_id) as unknown as JsonValue,
    ) !==
      stableJson(
        expectedEvidence.map((entry) => entry.evidence_id) as unknown as JsonValue,
      )
  ) {
    mismatchReasons.push("reviewed_family_evidence_identity_mismatch");
  }
  if (
    stableJson(observedEvidence as unknown as JsonValue) !==
      stableJson(expectedEvidence as unknown as JsonValue)
  ) {
    mismatchReasons.push("reviewed_family_evidence_hash_mismatch");
  }
  if (
    record.evidence_refs.some(
      (ref) => evidenceRefResolutionReasons(ref, evidenceIndex).length > 0,
    )
  ) {
    mismatchReasons.push("reviewed_family_evidence_unresolved");
  }

  if (mismatchReasons.length > 0) {
    return {
      status: "unreviewed",
      decision,
      mismatch_reasons: [...new Set(mismatchReasons)].sort(),
    };
  }
  return { status: "reviewed", decision, mismatch_reasons: [] };
}

function mergedEdgeConflict(record: MtaCanonicalRecord): boolean {
  const merged = record.payload._merged_field_values;
  if (!merged || typeof merged !== "object" || Array.isArray(merged)) return false;
  const values = merged as JsonObject;
  const top = relationContext(record);
  const kinds = strings(values.relation_kind);
  const subjects = strings(values.subject_id);
  const objects = strings(values.object_id);
  return kinds.some((value) => value !== top.relation_kind) || subjects.some((value) => value !== top.subject_id) || objects.some((value) => value !== top.object_id);
}

function sourceIntegrityFindings(
  records: readonly MtaCanonicalRecord[],
  registry: Registry,
  loaded: LoadedRelationshipContract,
  mode: RelationshipValidationMode,
): RelationshipFinding[] {
  const findings: RelationshipFinding[] = [];
  for (const [sourceId, sourceRecords] of [...registry.sourceRecords.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (sourceRecords.length < 2) continue;
    findings.push(finding(loaded, mode, {
      code: "REL_SOURCE_ID_AMBIGUOUS",
      primary_disposition: "ambiguous_source_identity",
      reasons: ["multiple_canonical_source_records_share_logical_source_id"],
      related_record_ids: sourceRecords.map((record) => record.record_id),
      detail: `Logical source id ${sourceId} is represented by ${sourceRecords.length} canonical source records.`,
    }));
  }
  for (const record of records) {
    const sourceIds = new Set([record.source_id, ...(record.source_ids ?? []), ...record.evidence_refs.map((ref) => ref.source_id)]);
    for (const sourceId of [...sourceIds].sort()) {
      if (registry.sourceRecords.has(sourceId)) continue;
      findings.push(finding(loaded, mode, {
        code: "REL_SOURCE_ID_MISSING",
        primary_disposition: "missing_source_identity",
        reasons: [record.evidence_refs.some((ref) => ref.source_id === sourceId) ? "evidence_source_has_no_canonical_source_record" : "record_source_has_no_canonical_source_record"],
        record_id: record.record_id,
        related_record_ids: [],
        detail: `Record ${record.record_id} references logical source id ${sourceId}, which has no canonical source record.`,
      }));
    }
  }
  return findings;
}

export function auditRelationshipGraph(
  records: readonly MtaCanonicalRecord[],
  options: RelationshipGraphAuditOptions = {},
): RelationshipGraphAudit {
  const mode = options.mode ?? "warn";
  const loaded = options.contract ?? loadRelationshipContract();
  const evidenceIndex = options.evidenceIndex ?? readEvidenceBlockIndex();
  const familyReview = options.familyReview ??
    loadRelationshipFamilyReviewLedger();
  const corrections = options.semanticCorrections ?? readSemanticCorrections();
  const registry = buildRegistry(records, corrections);
  const findings: RelationshipFinding[] = [];
  const relations = records.filter((record) => record.record_kind === "relation");
  const tripleGroups = new Map<string, MtaCanonicalRecord[]>();
  const exactGroups = new Map<string, MtaCanonicalRecord[]>();
  const conflictGroups = new Map<string, MtaCanonicalRecord[]>();
  for (const record of relations) {
    addToMap(tripleGroups, tripleKey(record), record);
    addToMap(exactGroups, exactRelationIdentity(record), record);
    addToMap(conflictGroups, conflictKey(record), record);
  }
  const duplicateTripleIds = new Set(
    [...tripleGroups.values()].filter((group) => group.length > 1).flatMap((group) => group.map((record) => record.record_id)),
  );
  const exactDuplicateIds = new Set(
    [...exactGroups.values()].filter((group) => group.length > 1).flatMap((group) => group.map((record) => record.record_id)),
  );
  const lifecycleConflictIds = new Set(
    [...conflictGroups.values()].filter((group) => group.length > 1 && hasLifecycleConflict(group)).flatMap((group) => group.map((record) => record.record_id)),
  );
  const relationRows: RelationshipAuditRow[] = [];

  for (const record of relations.sort((left, right) => left.record_id.localeCompare(right.record_id))) {
    const context = relationContext(record);
    const reasons = new Set<string>();
    const subject = context.subject_id ? registry.byId.get(context.subject_id) : undefined;
    const object = context.object_id ? registry.byId.get(context.object_id) : undefined;
    const endpointFields = [
      { role: "subject" as const, id: context.subject_id, local: text(record.payload.subject_local_observation_id), endpoint: subject },
      { role: "object" as const, id: context.object_id, local: text(record.payload.object_local_observation_id), endpoint: object },
    ];

    for (const endpoint of endpointFields) {
      if (!endpoint.endpoint) {
        const supersededTarget = endpoint.id ? registry.superseded.get(endpoint.id) : undefined;
        const aliasTargets = endpoint.id ? registry.aliases.get(endpoint.id) ?? [] : [];
        const localTargets = endpoint.local ? registry.locals.get(endpoint.local) ?? [] : [];
        const code: RelationshipFindingCode = supersededTarget
          ? "REL_ENDPOINT_SUPERSEDED"
          : aliasTargets.length > 1
            ? "REL_ALIAS_AMBIGUOUS"
            : localTargets.length > 0
              ? "REL_ENDPOINT_LOCAL_ONLY"
              : "REL_ENDPOINT_DANGLING";
        const reason = supersededTarget
          ? "endpoint_is_semantically_superseded"
          : aliasTargets.length > 1
            ? "endpoint_alias_has_multiple_targets"
            : localTargets.length > 0
              ? "endpoint_resolves_only_as_local_observation"
              : endpoint.id
                ? "endpoint_id_does_not_resolve"
                : "endpoint_id_is_missing";
        reasons.add(reason);
        findings.push(finding(loaded, mode, {
          code,
          primary_disposition: "endpoint_invalid",
          reasons: [reason],
          record_id: record.record_id,
          related_record_ids: [supersededTarget, ...aliasTargets.map((target) => target.record_id), ...localTargets.map((target) => target.record_id)].filter((value): value is string => Boolean(value)),
          relation_kind: context.relation_kind,
          relation_family: context.relation_family,
          subject_id: context.subject_id,
          object_id: context.object_id,
          endpoint_role: endpoint.role,
          detail: `Relation ${record.record_id} ${endpoint.role} endpoint ${endpoint.id ?? "(missing)"} is not a canonical physical record.`,
        }));
        continue;
      }
      if (endpoint.local && ![endpoint.endpoint.local_observation_id, ...(endpoint.endpoint.local_observation_ids ?? [])].includes(endpoint.local)) {
        reasons.add(`${endpoint.role}_local_observation_does_not_belong_to_endpoint`);
        findings.push(finding(loaded, mode, {
          code: "REL_ENDPOINT_LOCAL_MISMATCH",
          primary_disposition: "local_endpoint_inconsistent",
          reasons: [`${endpoint.role}_local_observation_does_not_belong_to_endpoint`],
          record_id: record.record_id,
          related_record_ids: (registry.locals.get(endpoint.local) ?? []).map((target) => target.record_id),
          relation_kind: context.relation_kind,
          relation_family: context.relation_family,
          subject_id: context.subject_id,
          object_id: context.object_id,
          endpoint_role: endpoint.role,
          detail: `Relation ${record.record_id} payload.${endpoint.role}_local_observation_id ${endpoint.local} does not belong to canonical ${endpoint.role} ${endpoint.endpoint.record_id}.`,
        }));
      }
    }

    if (context.relation_kind && subject && object) {
      const rule = loaded.rulesByKind.get(context.relation_kind);
      if (!rule) {
        reasons.add("relation_kind_has_no_contract_rule");
        findings.push(finding(loaded, mode, {
          code: "REL_CONTRACT_RULE_MISSING",
          primary_disposition: "endpoint_invalid",
          reasons: ["relation_kind_has_no_contract_rule"],
          record_id: record.record_id,
          related_record_ids: [subject.record_id, object.record_id],
          ...context,
          detail: `Relation kind ${context.relation_kind} is not present in the frozen endpoint matrix.`,
        }));
      } else if (!rule.allowed_family_shapes.some((shape) =>
        shape.relation_family === context.relation_family &&
        shape.subject_kind === subject.record_kind &&
        shape.object_kind === object.record_kind)) {
        reasons.add("relation_family_endpoint_shape_tuple_not_allowed_by_contract");
        findings.push(finding(loaded, mode, {
          code: "REL_ENDPOINT_TYPE_INVALID",
          primary_disposition: "endpoint_invalid",
          reasons: ["relation_family_endpoint_shape_tuple_not_allowed_by_contract"],
          record_id: record.record_id,
          related_record_ids: [subject.record_id, object.record_id],
          ...context,
          detail: `Relation ${record.record_id} has unapproved family/shape tuple ${context.relation_family}/${subject.record_kind}->${object.record_kind} for ${context.relation_kind}.`,
        }));
      }
      const familyReason = familyTypeReason(context.relation_family, subject.record_kind, object.record_kind);
      if (familyReason) {
        reasons.add(familyReason);
        const reviewMatch = familyReviewMatch(
          record,
          context,
          subject,
          object,
          evidenceIndex,
          familyReview,
        );
        if (reviewMatch.status === "reviewed") {
          reasons.add("exact_reviewed_family_advisory");
          findings.push(finding(loaded, mode, {
            code: "REL_FAMILY_TYPE_SUSPECT_REVIEWED",
            primary_disposition: "reviewed_family_type_advisory",
            reasons: [familyReason, "exact_reviewed_family_advisory"],
            record_id: record.record_id,
            related_record_ids: [subject.record_id, object.record_id],
            ...context,
            semantic_decision_ids:
              reviewMatch.decision.semantic_decision_ids,
            review_provenance: {
              review_id: familyReview.review_id,
              decision_id: reviewMatch.decision.decision_id,
              ledger_path: familyReview.ledger_path,
              ledger_sha256: familyReview.ledger_sha256,
              reviewed_at: familyReview.reviewed_at,
              reviewed_by: familyReview.reviewed_by,
              evidence_ids: reviewMatch.decision.evidence.map(
                (entry) => entry.evidence_id,
              ),
            },
            detail: `Relation ${record.record_id} has reviewed ${context.relation_family} shape ${subject.record_kind}->${object.record_kind}; exact endpoints and evidence match ${reviewMatch.decision.decision_id}.`,
          }));
        } else {
          reviewMatch.mismatch_reasons.forEach((reason) => reasons.add(reason));
          findings.push(finding(loaded, mode, {
            code: "REL_FAMILY_TYPE_SUSPECT",
            primary_disposition: "provisional_family_type_suspect",
            reasons: [familyReason, ...reviewMatch.mismatch_reasons],
            record_id: record.record_id,
            related_record_ids: [subject.record_id, object.record_id],
            ...context,
            detail: reviewMatch.decision
              ? `Relation ${record.record_id} no longer matches reviewed decision ${reviewMatch.decision.decision_id}: ${reviewMatch.mismatch_reasons.join(", ")}.`
              : `Relation ${record.record_id} has unreviewed ${context.relation_family} shape ${subject.record_kind}->${object.record_kind}; it requires explicit ontology adjudication.`,
          }));
        }
      }
    }

    const derivedFrom = text(record.payload.derived_from_record_id);
    if (derivedFrom && !registry.byId.has(derivedFrom)) {
      reasons.add("derived_from_record_id_does_not_resolve");
      findings.push(finding(loaded, mode, {
        code: "REL_DERIVATION_DANGLING",
        primary_disposition: "endpoint_invalid",
        reasons: ["derived_from_record_id_does_not_resolve"],
        record_id: record.record_id,
        related_record_ids: [],
        ...context,
        detail: `Relation ${record.record_id} has dangling derived_from_record_id ${derivedFrom}.`,
      }));
    }

    if (record.evidence_refs.length < loaded.contract.evidence_policy.minimum_refs_per_relation) {
      reasons.add("relation_has_no_evidence_refs");
      findings.push(finding(loaded, mode, {
        code: "REL_EVIDENCE_MISSING",
        primary_disposition: "endpoint_invalid",
        reasons: ["relation_has_no_evidence_refs"],
        record_id: record.record_id,
        related_record_ids: [],
        ...context,
        detail: `Relation ${record.record_id} has no evidence refs.`,
      }));
    }
    for (const [index, ref] of record.evidence_refs.entries()) {
      const unresolvedReasons = evidenceRefResolutionReasons(
        ref,
        evidenceIndex,
      );
      if (unresolvedReasons.length > 0) {
        unresolvedReasons.forEach((reason) => reasons.add(reason));
        findings.push(finding(loaded, mode, {
          code: "REL_EVIDENCE_UNRESOLVED",
          primary_disposition: "endpoint_invalid",
          reasons: unresolvedReasons,
          record_id: record.record_id,
          related_record_ids: [],
          ...context,
          detail: `Relation ${record.record_id} evidence ref ${index} is not fully resolvable: ${unresolvedReasons.join(", ")}.`,
        }));
      }
      const width = ref.block_id ? broadRangeWidth(ref.block_id) : undefined;
      const childCount = ref.child_block_ids?.length ?? 0;
      if ((width ?? 0) >= loaded.contract.evidence_policy.broad_same_page_block_threshold || childCount >= loaded.contract.evidence_policy.broad_same_page_block_threshold) {
        reasons.add("same_page_evidence_range_spans_at_least_five_blocks");
        findings.push(finding(loaded, mode, {
          code: "REL_EVIDENCE_OVERBROAD",
          primary_disposition: "structurally_overbroad_evidence",
          reasons: ["same_page_evidence_range_spans_at_least_five_blocks"],
          record_id: record.record_id,
          related_record_ids: [],
          ...context,
          detail: `Relation ${record.record_id} evidence ref ${index} spans ${Math.max(width ?? 0, childCount)} same-page blocks.`,
        }));
      }
    }

    if (mergedEdgeConflict(record)) {
      reasons.add("merged_payload_contains_incompatible_edge_identity");
      findings.push(finding(loaded, mode, {
        code: "REL_MERGED_EDGE_CONFLICT",
        primary_disposition: "merged_edge_conflict",
        reasons: ["merged_payload_contains_incompatible_edge_identity"],
        record_id: record.record_id,
        related_record_ids: [],
        ...context,
        detail: `Relation ${record.record_id} has incompatible relation identity values in _merged_field_values.`,
      }));
    }
    if (lifecycleConflictIds.has(record.record_id)) {
      reasons.add("same_triple_and_date_have_delivered_and_non_delivered_statuses");
      findings.push(finding(loaded, mode, {
        code: "REL_CONFLICTING_EDGE",
        primary_disposition: "same_date_status_conflict",
        reasons: ["same_triple_and_date_have_delivered_and_non_delivered_statuses"],
        record_id: record.record_id,
        related_record_ids: (conflictGroups.get(conflictKey(record)) ?? []).filter((candidate) => candidate.record_id !== record.record_id).map((candidate) => candidate.record_id),
        ...context,
        detail: `Relation ${record.record_id} conflicts with a delivered/non-delivered assertion for the same edge and date.`,
      }));
    }
    if (exactDuplicateIds.has(record.record_id)) {
      reasons.add("same_triple_status_date_and_evidence_identity");
      findings.push(finding(loaded, mode, {
        code: "REL_DUPLICATE_IDENTITY",
        primary_disposition: "exact_duplicate",
        reasons: ["same_triple_status_date_and_evidence_identity"],
        record_id: record.record_id,
        related_record_ids: (exactGroups.get(exactRelationIdentity(record)) ?? []).filter((candidate) => candidate.record_id !== record.record_id).map((candidate) => candidate.record_id),
        ...context,
        detail: `Relation ${record.record_id} duplicates the same edge, assertion, date, and evidence identity.`,
      }));
    }
    if (duplicateTripleIds.has(record.record_id)) reasons.add("parallel_assertion_same_triple");

    const orderedReasons = [...reasons].sort();
    const primary: RelationshipAuditRow["primary_disposition"] = orderedReasons.some((reason) =>
      ["endpoint_id_does_not_resolve", "endpoint_id_is_missing", "endpoint_is_semantically_superseded", "endpoint_alias_has_multiple_targets", "endpoint_resolves_only_as_local_observation", "relation_kind_has_no_contract_rule", "relation_family_endpoint_shape_tuple_not_allowed_by_contract", "derived_from_record_id_does_not_resolve", "relation_has_no_evidence_refs", "missing_block_id", "missing_text_sha256", "invalid_source_path", "evidence_id_mismatch", "block_not_in_public_evidence_index", "evidence_hash_mismatch", "evidence_page_mismatch"].includes(reason),
    )
      ? "endpoint_invalid"
      : orderedReasons.some((reason) => reason.endsWith("_local_observation_does_not_belong_to_endpoint"))
        ? "local_endpoint_inconsistent"
        : orderedReasons.includes("exact_reviewed_family_advisory")
          ? "reviewed_family_type_advisory"
        : orderedReasons.some((reason) => reason.startsWith("family_requires_"))
          ? "provisional_family_type_suspect"
          : orderedReasons.includes("merged_payload_contains_incompatible_edge_identity")
            ? "merged_edge_conflict"
            : orderedReasons.includes("same_triple_and_date_have_delivered_and_non_delivered_statuses")
              ? "same_date_status_conflict"
              : orderedReasons.includes("same_triple_status_date_and_evidence_identity")
                ? "exact_duplicate"
                : orderedReasons.includes("parallel_assertion_same_triple")
                  ? "parallel_duplicate"
                  : orderedReasons.includes("same_page_evidence_range_spans_at_least_five_blocks")
                    ? "structurally_overbroad_evidence"
                    : "clean";
    relationRows.push({
      schema_version: 1,
      record_id: record.record_id,
      relation_kind: context.relation_kind ?? "",
      relation_family: context.relation_family,
      subject_id: context.subject_id ?? null,
      subject_kind: subject?.record_kind ?? null,
      object_id: context.object_id ?? null,
      object_kind: object?.record_kind ?? null,
      primary_disposition: primary,
      reasons: orderedReasons,
    });
  }

  for (const [alias, targets] of [...registry.aliases.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (targets.length < 2) continue;
    findings.push(finding(loaded, mode, {
      code: "REL_ALIAS_AMBIGUOUS",
      primary_disposition: "ambiguous_alias_registry",
      reasons: ["canonical_alias_has_multiple_targets"],
      related_record_ids: targets.map((record) => record.record_id),
      detail: `Canonical alias ${alias} has ${targets.length} targets.`,
    }));
  }
  findings.push(...sourceIntegrityFindings(records, registry, loaded, mode));

  const degree = new Map<string, number>();
  for (const row of relationRows) {
    if (row.subject_id) degree.set(row.subject_id, (degree.get(row.subject_id) ?? 0) + 1);
    if (row.object_id) degree.set(row.object_id, (degree.get(row.object_id) ?? 0) + 1);
  }
  const orphanCounts: Record<string, number> = {};
  if (options.includeOrphans ?? true) {
    for (const record of records) {
      if (record.record_kind === "source" || record.record_kind === "relation" || (degree.get(record.record_id) ?? 0) > 0) continue;
      orphanCounts[record.record_kind] = (orphanCounts[record.record_kind] ?? 0) + 1;
      findings.push(finding(loaded, mode, {
        code: "REL_ORPHAN_RECORD",
        primary_disposition: "orphan_inventory",
        reasons: ["record_has_zero_relationship_degree"],
        record_id: record.record_id,
        related_record_ids: [],
        detail: `Canonical ${record.record_kind} ${record.record_id} is not incident to a canonical relation.`,
      }));
    }
  } else {
    for (const record of records) {
      if (record.record_kind === "source" || record.record_kind === "relation" || (degree.get(record.record_id) ?? 0) > 0) continue;
      orphanCounts[record.record_kind] = (orphanCounts[record.record_kind] ?? 0) + 1;
    }
  }

  const orderedFindings = findings.sort((left, right) => left.finding_id.localeCompare(right.finding_id));
  const counts = (values: readonly string[], universe: readonly string[] = []): Record<string, number> =>
    Object.fromEntries(
      [...new Set([...universe, ...values])]
        .sort()
        .map((value) => [value, values.filter((candidate) => candidate === value).length]),
    );
  const duplicateGroups = [...tripleGroups.values()].filter((group) => group.length > 1);
  const exactDuplicateGroups = [...exactGroups.values()].filter((group) => group.length > 1);

  return {
    schema_version: 1,
    contract_id: "relationship-contract-v1",
    mode,
    relation_rows: relationRows,
    findings: orderedFindings,
    summary: {
      canonical_record_count: records.length,
      canonical_relation_count: relations.length,
      distinct_relation_kind_count: new Set(relations.map((record) => text(record.payload.relation_kind)).filter((value): value is string => Boolean(value))).size,
      contract_rule_count: loaded.matrix.relation_kind_rule_count,
      contract_covered_relation_count: relationRows.filter((row) => loaded.rulesByKind.has(row.relation_kind)).length,
      finding_count: orderedFindings.length,
      findings_by_code: counts(orderedFindings.map((entry) => entry.code), RELATIONSHIP_FINDING_CODES),
      findings_by_severity: counts(orderedFindings.map((entry) => entry.severity), ["error", "info", "warning"]),
      primary_dispositions: counts(
        relationRows.map((row) => row.primary_disposition),
        RELATION_PRIMARY_DISPOSITIONS,
      ),
      orphan_records_by_kind: Object.fromEntries(Object.entries(orphanCounts).sort(([left], [right]) => left.localeCompare(right))),
      duplicate_triple_groups: duplicateGroups.length,
      duplicate_triple_records: duplicateGroups.reduce((sum, group) => sum + group.length, 0),
      exact_duplicate_groups: exactDuplicateGroups.length,
      exact_duplicate_records: exactDuplicateGroups.reduce((sum, group) => sum + group.length, 0),
      ambiguous_aliases: [...registry.aliases.values()].filter((targets) => targets.length > 1).length,
      semantic_supersessions: registry.superseded.size,
    },
  };
}

export function relationshipContractRelativePath(): string {
  return join("data", "contracts", "relationships", "v1", "contract.json");
}

export function relationshipIntegrityArtifactRoot(): string {
  return join(repoRoot, "data", "quality", "relationship-integrity");
}
