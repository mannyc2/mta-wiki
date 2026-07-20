import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord, MtaEvidenceRef } from "@mta-wiki/db/types";
import type { OperationalOccurrenceRow } from "@mta-wiki/pipeline/materialize/operational-occurrences";

export const TREATMENT_SEMANTIC_CONTRACT_SCHEMA_VERSION = 1 as const;

export type TreatmentAtomicSemantic = {
  canonical_kind: string;
  family: string;
};

export type TreatmentBundleAtomicMember = TreatmentAtomicSemantic & {
  /** Exact reviewed wording for this member. This is never derived by splitting the bundle label. */
  raw_treatment_kind: string;
};

export type TreatmentSemanticDisposition =
  | ({
      raw_treatment_kind: string;
      /** Exact canonical records reviewed under this disposition. Context-specific rows stay separate. */
      record_ids: string[];
      disposition: "atomic";
    } & TreatmentAtomicSemantic)
  | {
      raw_treatment_kind: string;
      record_ids: string[];
      disposition: "bundle";
      bundle_family: string | null;
      members: TreatmentBundleAtomicMember[];
    }
  | {
      raw_treatment_kind: string;
      record_ids: string[];
      disposition: "unresolved";
      review_reason: string;
    };

export type TreatmentSemanticContract = {
  schema_version: typeof TREATMENT_SEMANTIC_CONTRACT_SCHEMA_VERSION;
  dispositions: TreatmentSemanticDisposition[];
};

export type TreatmentEvidenceLocator = {
  source_id: string;
  evidence_id: string | null;
  source_path: string | null;
  page_number: number | null;
  block_id: string | null;
  block_range: string | null;
  text_sha256: string | null;
  role: string | null;
};

export type TreatmentVocabularyProvenance = {
  record_id: string;
  display_name: string;
  canonical_source_id: string;
  source_ids: string[];
  normalized_treatment_family: string | null;
  evidence_refs: TreatmentEvidenceLocator[];
};

export type TreatmentVocabularySourceCount = {
  source_id: string;
  record_count: number;
  evidence_ref_count: number;
};

export type TreatmentVocabularyEntry = {
  raw_treatment_kind: string;
  record_count: number;
  source_count: number;
  per_source_counts: TreatmentVocabularySourceCount[];
  provenance: TreatmentVocabularyProvenance[];
};

export type InvalidTreatmentVocabularyRecord = {
  record_id: string;
  source_id: string;
  reason: "duplicate_treatment_record_id" | "missing_raw_treatment_kind" | "non_string_raw_treatment_kind";
};

export type TreatmentVocabularyInventory = {
  schema_version: typeof TREATMENT_SEMANTIC_CONTRACT_SCHEMA_VERSION;
  literal_count: number;
  record_count: number;
  source_count: number;
  sorted_union_sha256: string;
  entries: TreatmentVocabularyEntry[];
  invalid_records: InvalidTreatmentVocabularyRecord[];
};

export type TreatmentVocabularyReconciliation = {
  schema_version: typeof TREATMENT_SEMANTIC_CONTRACT_SCHEMA_VERSION;
  exact: boolean;
  inventory_literal_count: number;
  disposition_count: number;
  atomic_count: number;
  bundle_count: number;
  unresolved_count: number;
  missing: TreatmentVocabularyEntry[];
  stale: TreatmentSemanticDisposition[];
  missing_record_ids: Array<{ raw_treatment_kind: string; record_id: string }>;
  stale_record_ids: Array<{ raw_treatment_kind: string; record_id: string; reason: "missing_record" | "literal_mismatch" }>;
  duplicates: Array<{ raw_treatment_kind: string; record_id: string; count: number }>;
  invalid_records: InvalidTreatmentVocabularyRecord[];
};

const contractFields = new Set(["dispositions", "schema_version"]);
const atomicDispositionFields = new Set(["canonical_kind", "disposition", "family", "raw_treatment_kind", "record_ids"]);
const bundleDispositionFields = new Set(["bundle_family", "disposition", "members", "raw_treatment_kind", "record_ids"]);
const unresolvedDispositionFields = new Set(["disposition", "raw_treatment_kind", "record_ids", "review_reason"]);
const bundleMemberFields = new Set(["canonical_kind", "family", "raw_treatment_kind"]);
const semanticIdentifierPattern = /^[a-z][a-z0-9_]*$/u;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function contractObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function contractKeys(value: Record<string, unknown>, fields: ReadonlySet<string>, path: string): void {
  const missing = [...fields].filter((field) => !(field in value)).sort(compareText);
  const extra = Object.keys(value).filter((field) => !fields.has(field)).sort(compareText);
  if (missing.length > 0) throw new Error(`${path} is missing field(s): ${missing.join(", ")}`);
  if (extra.length > 0) throw new Error(`${path} has unknown field(s): ${extra.join(", ")}`);
}

function exactLiteral(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${path} must be a non-empty string`);
  return value;
}

function nonemptyString(value: unknown, path: string): string {
  const string = exactLiteral(value, path);
  if (string !== string.trim()) throw new Error(`${path} must not contain surrounding whitespace`);
  return string;
}

function semanticIdentifier(value: unknown, path: string): string {
  const string = nonemptyString(value, path);
  if (!semanticIdentifierPattern.test(string)) {
    throw new Error(`${path} must be a lower_snake_case semantic identifier`);
  }
  return string;
}

function recordIds(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path} must be a non-empty array`);
  const values = value.map((entry, index) => nonemptyString(entry, `${path}[${index}]`));
  if (new Set(values).size !== values.length) throw new Error(`${path} must not contain duplicates`);
  return values;
}

function parseBundleMember(value: unknown, path: string): TreatmentBundleAtomicMember {
  const object = contractObject(value, path);
  contractKeys(object, bundleMemberFields, path);
  return {
    raw_treatment_kind: exactLiteral(object.raw_treatment_kind, `${path}.raw_treatment_kind`),
    canonical_kind: semanticIdentifier(object.canonical_kind, `${path}.canonical_kind`),
    family: semanticIdentifier(object.family, `${path}.family`),
  };
}

export function parseTreatmentSemanticDisposition(value: unknown, path = "treatment disposition"): TreatmentSemanticDisposition {
  const object = contractObject(value, path);
  if (object.disposition === "atomic") {
    contractKeys(object, atomicDispositionFields, path);
    return {
      raw_treatment_kind: exactLiteral(object.raw_treatment_kind, `${path}.raw_treatment_kind`),
      record_ids: recordIds(object.record_ids, `${path}.record_ids`),
      disposition: "atomic",
      canonical_kind: semanticIdentifier(object.canonical_kind, `${path}.canonical_kind`),
      family: semanticIdentifier(object.family, `${path}.family`),
    };
  }
  if (object.disposition === "bundle") {
    contractKeys(object, bundleDispositionFields, path);
    if (!Array.isArray(object.members) || object.members.length < 2) {
      throw new Error(`${path}.members must contain at least two lossless atomic members`);
    }
    const members = object.members.map((member, index) => parseBundleMember(member, `${path}.members[${index}]`));
    const memberLiterals = members.map((member) => member.raw_treatment_kind);
    if (new Set(memberLiterals).size !== memberLiterals.length) {
      throw new Error(`${path}.members must not duplicate raw_treatment_kind values`);
    }
    return {
      raw_treatment_kind: exactLiteral(object.raw_treatment_kind, `${path}.raw_treatment_kind`),
      record_ids: recordIds(object.record_ids, `${path}.record_ids`),
      disposition: "bundle",
      bundle_family: object.bundle_family === null
        ? null
        : semanticIdentifier(object.bundle_family, `${path}.bundle_family`),
      members,
    };
  }
  if (object.disposition === "unresolved") {
    contractKeys(object, unresolvedDispositionFields, path);
    return {
      raw_treatment_kind: exactLiteral(object.raw_treatment_kind, `${path}.raw_treatment_kind`),
      record_ids: recordIds(object.record_ids, `${path}.record_ids`),
      disposition: "unresolved",
      review_reason: nonemptyString(object.review_reason, `${path}.review_reason`),
    };
  }
  throw new Error(`${path}.disposition must be atomic, bundle, or unresolved`);
}

function assertCanonicalFamilyConsistency(dispositions: readonly TreatmentSemanticDisposition[]): void {
  const familyByKind = new Map<string, string>();
  const atomicSemantics = dispositions.flatMap((disposition) =>
    disposition.disposition === "atomic"
      ? [{ canonical_kind: disposition.canonical_kind, family: disposition.family }]
      : disposition.disposition === "bundle"
        ? disposition.members
        : [],
  );
  for (const semantic of atomicSemantics) {
    const prior = familyByKind.get(semantic.canonical_kind);
    if (prior !== undefined && prior !== semantic.family) {
      throw new Error(
        `canonical treatment kind ${semantic.canonical_kind} has conflicting families: ${prior}, ${semantic.family}`,
      );
    }
    familyByKind.set(semantic.canonical_kind, semantic.family);
  }
}

export function parseTreatmentSemanticContract(value: unknown, path = "treatment semantic contract"): TreatmentSemanticContract {
  const object = contractObject(value, path);
  contractKeys(object, contractFields, path);
  if (object.schema_version !== TREATMENT_SEMANTIC_CONTRACT_SCHEMA_VERSION) {
    throw new Error(`${path}.schema_version must be ${TREATMENT_SEMANTIC_CONTRACT_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(object.dispositions)) throw new Error(`${path}.dispositions must be an array`);
  const dispositions = object.dispositions.map((entry, index) =>
    parseTreatmentSemanticDisposition(entry, `${path}.dispositions[${index}]`));
  assertCanonicalFamilyConsistency(dispositions);
  return { schema_version: TREATMENT_SEMANTIC_CONTRACT_SCHEMA_VERSION, dispositions };
}

function evidenceLocator(ref: MtaEvidenceRef): TreatmentEvidenceLocator {
  return {
    source_id: ref.source_id,
    evidence_id: ref.evidence_id ?? null,
    source_path: ref.source_path ?? null,
    page_number: ref.page_number ?? null,
    block_id: ref.block_id ?? null,
    block_range: ref.block_range ?? null,
    text_sha256: ref.text_sha256 ?? null,
    role: ref.role ?? null,
  };
}

function evidenceLocatorKey(ref: TreatmentEvidenceLocator): string {
  return stableJson(ref as unknown as JsonValue);
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareText);
}

function vocabularyProvenance(record: MtaCanonicalRecord): TreatmentVocabularyProvenance {
  const evidenceRefs = [...new Map(record.evidence_refs.map((ref) => {
    const locator = evidenceLocator(ref);
    return [evidenceLocatorKey(locator), locator] as const;
  })).values()].sort((left, right) => compareText(evidenceLocatorKey(left), evidenceLocatorKey(right)));
  const normalizedFamily = record.payload.treatment_family;
  return {
    record_id: record.record_id,
    display_name: record.display_name,
    canonical_source_id: record.source_id,
    source_ids: uniqueSorted([
      record.source_id,
      ...(record.source_ids ?? []),
      ...record.evidence_refs.map((ref) => ref.source_id),
    ]),
    normalized_treatment_family: typeof normalizedFamily === "string" && normalizedFamily.length > 0
      ? normalizedFamily
      : null,
    evidence_refs: evidenceRefs,
  };
}

/** UTF-8 bytes for the exact sorted union. The final newline is part of the v1 hash contract. */
export function treatmentVocabularySortedUnionBytes(values: Iterable<string>): string {
  const sorted = uniqueSorted(values);
  return sorted.length === 0 ? "" : `${sorted.join("\n")}\n`;
}

export function treatmentVocabularySortedUnionSha256(values: Iterable<string>): string {
  return createHash("sha256").update(treatmentVocabularySortedUnionBytes(values)).digest("hex");
}

/**
 * Build a lossless, deterministic inventory of canonical treatment literals. No trimming,
 * tokenization, substring matching, or semantic inference is performed.
 */
export function collectTreatmentVocabulary(records: readonly MtaCanonicalRecord[]): TreatmentVocabularyInventory {
  const byLiteral = new Map<string, TreatmentVocabularyProvenance[]>();
  const invalidRecords: InvalidTreatmentVocabularyRecord[] = [];
  const seenRecordIds = new Set<string>();
  for (const record of records) {
    if (record.record_kind !== "treatment_component") continue;
    if (seenRecordIds.has(record.record_id)) {
      invalidRecords.push({ record_id: record.record_id, source_id: record.source_id, reason: "duplicate_treatment_record_id" });
      continue;
    }
    seenRecordIds.add(record.record_id);
    const rawKind = record.payload.treatment_kind;
    if (rawKind === undefined || rawKind === null || rawKind === "") {
      invalidRecords.push({ record_id: record.record_id, source_id: record.source_id, reason: "missing_raw_treatment_kind" });
      continue;
    }
    if (typeof rawKind !== "string") {
      invalidRecords.push({ record_id: record.record_id, source_id: record.source_id, reason: "non_string_raw_treatment_kind" });
      continue;
    }
    const provenance = byLiteral.get(rawKind) ?? [];
    provenance.push(vocabularyProvenance(record));
    byLiteral.set(rawKind, provenance);
  }

  const entries = [...byLiteral.entries()].sort(([left], [right]) => compareText(left, right)).map(
    ([rawTreatmentKind, unsortedProvenance]): TreatmentVocabularyEntry => {
      const provenance = [...unsortedProvenance].sort((left, right) => compareText(left.record_id, right.record_id));
      const sourceIds = uniqueSorted(provenance.flatMap((entry) => entry.source_ids));
      const perSourceCounts = sourceIds.map((sourceId): TreatmentVocabularySourceCount => ({
        source_id: sourceId,
        record_count: provenance.filter((entry) => entry.source_ids.includes(sourceId)).length,
        evidence_ref_count: provenance.reduce(
          (count, entry) => count + entry.evidence_refs.filter((ref) => ref.source_id === sourceId).length,
          0,
        ),
      }));
      return {
        raw_treatment_kind: rawTreatmentKind,
        record_count: provenance.length,
        source_count: sourceIds.length,
        per_source_counts: perSourceCounts,
        provenance,
      };
    },
  );
  const sources = uniqueSorted(entries.flatMap((entry) => entry.per_source_counts.map((count) => count.source_id)));
  return {
    schema_version: TREATMENT_SEMANTIC_CONTRACT_SCHEMA_VERSION,
    literal_count: entries.length,
    record_count: entries.reduce((count, entry) => count + entry.record_count, 0),
    source_count: sources.length,
    sorted_union_sha256: treatmentVocabularySortedUnionSha256(entries.map((entry) => entry.raw_treatment_kind)),
    entries,
    invalid_records: invalidRecords.sort((left, right) =>
      compareText([left.record_id, left.reason].join("\0"), [right.record_id, right.reason].join("\0"))),
  };
}

export function reconcileTreatmentVocabulary(
  inventory: TreatmentVocabularyInventory,
  contract: TreatmentSemanticContract,
): TreatmentVocabularyReconciliation {
  const inventoryByLiteral = new Map(inventory.entries.map((entry) => [entry.raw_treatment_kind, entry]));
  const dispositionsByLiteral = new Map<string, TreatmentSemanticDisposition[]>();
  for (const disposition of contract.dispositions) {
    const entries = dispositionsByLiteral.get(disposition.raw_treatment_kind) ?? [];
    entries.push(disposition);
    dispositionsByLiteral.set(disposition.raw_treatment_kind, entries);
  }
  const missing = inventory.entries.filter((entry) => !dispositionsByLiteral.has(entry.raw_treatment_kind));
  const stale = contract.dispositions
    .filter((disposition) => !inventoryByLiteral.has(disposition.raw_treatment_kind))
    .sort((left, right) => compareText(left.raw_treatment_kind, right.raw_treatment_kind));
  const inventoryLiteralByRecordId = new Map(
    inventory.entries.flatMap((entry) => entry.provenance.map((provenance) =>
      [provenance.record_id, entry.raw_treatment_kind] as const)),
  );
  const dispositionScopes = contract.dispositions.flatMap((disposition) =>
    disposition.record_ids.map((recordId) => ({ raw_treatment_kind: disposition.raw_treatment_kind, record_id: recordId })));
  const scopeCounts = new Map<string, number>();
  for (const scope of dispositionScopes) {
    const key = [scope.raw_treatment_kind, scope.record_id].join("\0");
    scopeCounts.set(key, (scopeCounts.get(key) ?? 0) + 1);
  }
  const duplicates = [...scopeCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => {
      const [rawTreatmentKind, recordId] = key.split("\0") as [string, string];
      return { raw_treatment_kind: rawTreatmentKind, record_id: recordId, count };
    })
    .sort((left, right) => compareText(
      [left.raw_treatment_kind, left.record_id].join("\0"),
      [right.raw_treatment_kind, right.record_id].join("\0"),
    ));
  const coveredScopeKeys = new Set(dispositionScopes.map((scope) => [scope.raw_treatment_kind, scope.record_id].join("\0")));
  const missingRecordIds = inventory.entries.flatMap((entry) => entry.provenance
    .filter((provenance) => !coveredScopeKeys.has([entry.raw_treatment_kind, provenance.record_id].join("\0")))
    .map((provenance) => ({ raw_treatment_kind: entry.raw_treatment_kind, record_id: provenance.record_id })));
  const staleRecordIds: TreatmentVocabularyReconciliation["stale_record_ids"] = [];
  for (const scope of dispositionScopes) {
    const actualLiteral = inventoryLiteralByRecordId.get(scope.record_id);
    if (actualLiteral === undefined) {
      staleRecordIds.push({ ...scope, reason: "missing_record" });
      continue;
    }
    if (actualLiteral !== scope.raw_treatment_kind) {
      staleRecordIds.push({ ...scope, reason: "literal_mismatch" });
    }
  }
  staleRecordIds.sort((left, right) => compareText(
    [left.raw_treatment_kind, left.record_id].join("\0"),
    [right.raw_treatment_kind, right.record_id].join("\0"),
  ));
  const atomicCount = contract.dispositions.filter((entry) => entry.disposition === "atomic").length;
  const bundleCount = contract.dispositions.filter((entry) => entry.disposition === "bundle").length;
  const unresolvedCount = contract.dispositions.filter((entry) => entry.disposition === "unresolved").length;
  return {
    schema_version: TREATMENT_SEMANTIC_CONTRACT_SCHEMA_VERSION,
    exact:
      missing.length === 0 &&
      stale.length === 0 &&
      missingRecordIds.length === 0 &&
      staleRecordIds.length === 0 &&
      duplicates.length === 0 &&
      inventory.invalid_records.length === 0,
    inventory_literal_count: inventory.literal_count,
    disposition_count: contract.dispositions.length,
    atomic_count: atomicCount,
    bundle_count: bundleCount,
    unresolved_count: unresolvedCount,
    missing,
    stale,
    missing_record_ids: missingRecordIds,
    stale_record_ids: staleRecordIds,
    duplicates,
    invalid_records: [...inventory.invalid_records],
  };
}

export function assertTreatmentVocabularyReconciled(
  inventory: TreatmentVocabularyInventory,
  contract: TreatmentSemanticContract,
): TreatmentVocabularyReconciliation {
  const reconciliation = reconcileTreatmentVocabulary(inventory, contract);
  if (!reconciliation.exact) {
    throw new Error(
      `Treatment semantic vocabulary mismatch: missing=${stableJson(reconciliation.missing.map((entry) => entry.raw_treatment_kind) as JsonValue)}, ` +
        `stale=${stableJson(reconciliation.stale.map((entry) => entry.raw_treatment_kind) as JsonValue)}, ` +
        `missing_record_ids=${stableJson(reconciliation.missing_record_ids as unknown as JsonValue)}, ` +
        `stale_record_ids=${stableJson(reconciliation.stale_record_ids as unknown as JsonValue)}, ` +
        `duplicates=${stableJson(reconciliation.duplicates as unknown as JsonValue)}, ` +
        `invalid_records=${stableJson(reconciliation.invalid_records as unknown as JsonValue)}`,
    );
  }
  return reconciliation;
}

function normalizedContract(contract: TreatmentSemanticContract): TreatmentSemanticContract {
  const dispositions = contract.dispositions.map((disposition): TreatmentSemanticDisposition =>
    disposition.disposition === "bundle"
      ? {
          ...disposition,
          record_ids: [...disposition.record_ids].sort(compareText),
          members: [...disposition.members].sort((left, right) =>
            compareText(
              [left.raw_treatment_kind, left.canonical_kind, left.family].join("\0"),
              [right.raw_treatment_kind, right.canonical_kind, right.family].join("\0"),
            )),
        }
      : { ...disposition, record_ids: [...disposition.record_ids].sort(compareText) });
  return {
    schema_version: TREATMENT_SEMANTIC_CONTRACT_SCHEMA_VERSION,
    dispositions: dispositions.sort((left, right) => compareText(
      [left.raw_treatment_kind, left.record_ids.join("\0"), left.disposition].join("\0"),
      [right.raw_treatment_kind, right.record_ids.join("\0"), right.disposition].join("\0"),
    )),
  };
}

export function treatmentSemanticContractBytes(contract: TreatmentSemanticContract): string {
  const parsed = parseTreatmentSemanticContract(contract);
  return `${stableJson(normalizedContract(parsed) as unknown as JsonValue)}\n`;
}

export function treatmentSemanticContractSha256(contract: TreatmentSemanticContract): string {
  return createHash("sha256").update(treatmentSemanticContractBytes(contract)).digest("hex");
}

export function treatmentVocabularyInventoryJson(inventory: TreatmentVocabularyInventory): string {
  return `${stableJson(inventory as unknown as JsonValue)}\n`;
}

export function treatmentVocabularyReconciliationJson(
  reconciliation: TreatmentVocabularyReconciliation,
): string {
  return `${stableJson(reconciliation as unknown as JsonValue)}\n`;
}

export function treatmentSemanticReviewQueueJsonl(contract: TreatmentSemanticContract): string {
  const unresolved = contract.dispositions
    .filter((disposition) => disposition.disposition === "unresolved")
    .sort((left, right) => compareText(
      [left.raw_treatment_kind, ...left.record_ids].join("\0"),
      [right.raw_treatment_kind, ...right.record_ids].join("\0"),
    ));
  return unresolved.length === 0
    ? ""
    : `${unresolved.map((row) => stableJson(row as unknown as JsonValue)).join("\n")}\n`;
}

export const TREATMENT_ROUTE_DIRECT_RELATION_ALLOWLIST = [
  { relation_kind: "applies_to_route", relation_family: "route_scope", subject_kind: "treatment_component", object_kind: "route" },
  { relation_kind: "enforces_on_route", relation_family: "route_scope", subject_kind: "treatment_component", object_kind: "route" },
  { relation_kind: "operates_on_route", relation_family: "route_scope", subject_kind: "treatment_component", object_kind: "route" },
  { relation_kind: "has_treatment", relation_family: "treatment_context", subject_kind: "route", object_kind: "treatment_component" },
  { relation_kind: "has_tsp", relation_family: "treatment_context", subject_kind: "route", object_kind: "treatment_component" },
  { relation_kind: "serves_stop", relation_family: "treatment_context", subject_kind: "route", object_kind: "treatment_component" },
] as const;

export type TreatmentRouteAuthorizationChannel =
  | {
      channel: "direct_relation";
      relation_record_id: string;
      evidence_ids: string[];
    }
  | {
      channel: "approved_operational_occurrence";
      occurrence_id: string;
      evidence_ids: string[];
    };

export type TreatmentRouteScopeAuthorization =
  | {
      resolution: "authorized";
      route_record_id: string;
      treatment_record_id: string;
      channels: TreatmentRouteAuthorizationChannel[];
    }
  | {
      resolution: "review_required";
      route_record_id: string;
      treatment_record_id: string;
      reason: "no_direct_relation_or_approved_occurrence";
      shared_project_context: Array<{
        project_record_id: string;
        route_membership_relation_ids: string[];
        treatment_membership_relation_ids: string[];
      }>;
    };

type TreatmentRouteOccurrence = Pick<OperationalOccurrenceRow, "occurrence_id" | "review_state" | "routes" | "treatment">;

function text(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function relationEndpoints(record: MtaCanonicalRecord): { subjectId: string; objectId: string } | null {
  const subjectId = text(record.payload.subject_id);
  const objectId = text(record.payload.object_id);
  return subjectId && objectId ? { subjectId, objectId } : null;
}

function directRelationAuthorization(input: {
  relation: MtaCanonicalRecord;
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>;
  routeRecordId: string;
  treatmentRecordId: string;
}): TreatmentRouteAuthorizationChannel | null {
  const endpoints = relationEndpoints(input.relation);
  if (!endpoints || input.relation.record_kind !== "relation") return null;
  if (input.relation.truth_status !== "source_stated" || input.relation.review_state === "quarantined") return null;
  const evidenceIds = uniqueSorted(input.relation.evidence_refs.flatMap((ref) => ref.evidence_id ? [ref.evidence_id] : []));
  if (evidenceIds.length === 0) return null;
  const subjectKind = input.recordsById.get(endpoints.subjectId)?.record_kind;
  const objectKind = input.recordsById.get(endpoints.objectId)?.record_kind;
  const allowed = TREATMENT_ROUTE_DIRECT_RELATION_ALLOWLIST.some((entry) =>
    entry.relation_kind === text(input.relation.payload.relation_kind) &&
    entry.relation_family === text(input.relation.payload.relation_family) &&
    entry.subject_kind === subjectKind &&
    entry.object_kind === objectKind);
  if (!allowed) return null;
  const exactPair =
    (endpoints.subjectId === input.routeRecordId && endpoints.objectId === input.treatmentRecordId) ||
    (endpoints.subjectId === input.treatmentRecordId && endpoints.objectId === input.routeRecordId);
  return exactPair
    ? { channel: "direct_relation", relation_record_id: input.relation.record_id, evidence_ids: evidenceIds }
    : null;
}

function occurrenceMembers(occurrence: TreatmentRouteOccurrence) {
  return occurrence.treatment.kind === "atomic" ? [occurrence.treatment.member] : occurrence.treatment.members;
}

function occurrenceAuthorization(
  occurrence: TreatmentRouteOccurrence,
  routeRecordId: string,
  treatmentRecordId: string,
): TreatmentRouteAuthorizationChannel | null {
  if (occurrence.review_state !== "approved") return null;
  const route = occurrence.routes.find((entry) => entry.route_record_id === routeRecordId);
  const member = occurrenceMembers(occurrence).find((entry) => entry.treatment_record_id === treatmentRecordId);
  if (!route || !member || route.evidence_bindings.length === 0 || member.evidence_bindings.length === 0) return null;
  const evidenceIds = uniqueSorted([...route.evidence_bindings, ...member.evidence_bindings]
    .flatMap((binding) => binding.evidence_id ? [binding.evidence_id] : []));
  if (evidenceIds.length === 0) return null;
  return { channel: "approved_operational_occurrence", occurrence_id: occurrence.occurrence_id, evidence_ids: evidenceIds };
}

function projectMembershipContext(input: {
  records: readonly MtaCanonicalRecord[];
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>;
  routeRecordId: string;
  treatmentRecordId: string;
}) {
  const projectRouteRelations = new Map<string, string[]>();
  const projectTreatmentRelations = new Map<string, string[]>();
  for (const relation of input.records) {
    if (relation.record_kind !== "relation") continue;
    const endpoints = relationEndpoints(relation);
    if (!endpoints) continue;
    const subjectKind = input.recordsById.get(endpoints.subjectId)?.record_kind;
    const objectKind = input.recordsById.get(endpoints.objectId)?.record_kind;
    const routeProjectId = endpoints.subjectId === input.routeRecordId && objectKind === "project"
      ? endpoints.objectId
      : endpoints.objectId === input.routeRecordId && subjectKind === "project"
        ? endpoints.subjectId
        : null;
    if (routeProjectId) {
      const relations = projectRouteRelations.get(routeProjectId) ?? [];
      relations.push(relation.record_id);
      projectRouteRelations.set(routeProjectId, relations);
    }
    const treatmentProjectId = endpoints.subjectId === input.treatmentRecordId && objectKind === "project"
      ? endpoints.objectId
      : endpoints.objectId === input.treatmentRecordId && subjectKind === "project"
        ? endpoints.subjectId
        : null;
    if (treatmentProjectId) {
      const relations = projectTreatmentRelations.get(treatmentProjectId) ?? [];
      relations.push(relation.record_id);
      projectTreatmentRelations.set(treatmentProjectId, relations);
    }
  }
  return [...projectRouteRelations.keys()]
    .filter((projectId) => projectTreatmentRelations.has(projectId))
    .sort(compareText)
    .map((projectId) => ({
      project_record_id: projectId,
      route_membership_relation_ids: uniqueSorted(projectRouteRelations.get(projectId) ?? []),
      treatment_membership_relation_ids: uniqueSorted(projectTreatmentRelations.get(projectId) ?? []),
    }));
}

/**
 * Authorize an exact route/treatment pair without traversing a shared project. Project membership
 * is returned only as review context so downstream adapters cannot turn it into a Cartesian join.
 */
export function authorizeTreatmentRouteScope(input: {
  route_record_id: string;
  treatment_record_id: string;
  records: readonly MtaCanonicalRecord[];
  occurrences?: readonly TreatmentRouteOccurrence[] | undefined;
}): TreatmentRouteScopeAuthorization {
  const recordsById = new Map(input.records.map((record) => [record.record_id, record]));
  if (recordsById.get(input.route_record_id)?.record_kind !== "route") {
    throw new Error(`route_record_id ${input.route_record_id} does not resolve to a canonical route`);
  }
  if (recordsById.get(input.treatment_record_id)?.record_kind !== "treatment_component") {
    throw new Error(`treatment_record_id ${input.treatment_record_id} does not resolve to a canonical treatment_component`);
  }
  const directChannels = input.records.flatMap((relation) => {
    const channel = directRelationAuthorization({
      relation,
      recordsById,
      routeRecordId: input.route_record_id,
      treatmentRecordId: input.treatment_record_id,
    });
    return channel ? [channel] : [];
  });
  const occurrenceChannels = (input.occurrences ?? []).flatMap((occurrence) => {
    const channel = occurrenceAuthorization(occurrence, input.route_record_id, input.treatment_record_id);
    return channel ? [channel] : [];
  });
  const channels = [...directChannels, ...occurrenceChannels].sort((left, right) =>
    compareText(
      left.channel === "direct_relation" ? `0:${left.relation_record_id}` : `1:${left.occurrence_id}`,
      right.channel === "direct_relation" ? `0:${right.relation_record_id}` : `1:${right.occurrence_id}`,
    ));
  if (channels.length > 0) {
    return {
      resolution: "authorized",
      route_record_id: input.route_record_id,
      treatment_record_id: input.treatment_record_id,
      channels,
    };
  }
  return {
    resolution: "review_required",
    route_record_id: input.route_record_id,
    treatment_record_id: input.treatment_record_id,
    reason: "no_direct_relation_or_approved_occurrence",
    shared_project_context: projectMembershipContext({
      records: input.records,
      recordsById,
      routeRecordId: input.route_record_id,
      treatmentRecordId: input.treatment_record_id,
    }),
  };
}
