import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { sha256, stableJson } from "../packages/db/src/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaObservationKind } from "../packages/db/src/types";
import type {
  RelationshipBaselineTupleReviewInventory,
  RelationshipContract,
  RelationshipEndpointFamilyShape,
  RelationshipEndpointMatrix,
  RelationshipEndpointRule,
  RelationshipReviewedTupleExpansionLedger,
} from "../packages/db/src/relationship-contract";
import {
  assertRelationshipTupleProvenance,
  RELATIONSHIP_CONTRACT_ID,
} from "../packages/db/src/relationship-contract";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import { RELATION_ENDPOINT_SHAPES } from "../packages/pipeline/src/records/relations";

const OUTPUT_DIR = join(repoRoot, "data", "contracts", "relationships", "v1");
const MATRIX_PATH = join(OUTPUT_DIR, "allowed-endpoint-types.json");
const CONTRACT_PATH = join(OUTPUT_DIR, "contract.json");
const DECISIONS_PATH = join(OUTPUT_DIR, "reviewed-tuple-expansion-decisions.json");
const EXPANSION_LEDGER_PATH = join(OUTPUT_DIR, "reviewed-tuple-expansions.json");
const BASELINE_INVENTORY_PATH = join(OUTPUT_DIR, "baseline-tuple-review-inventory.json");
const RELATIONS_PATH = join(repoRoot, "data", "canonical", "relations.jsonl");
const CORRECTIONS_PATH = join(repoRoot, "data", "semantic-corrections", "corrections.jsonl");
const LEGACY_LEDGER_PATH = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "legacy-remediation",
  "ledger.jsonl",
);
const LEGACY_SUMMARY_PATH = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "legacy-remediation",
  "summary.json",
);
const LEGACY_SOURCE_DECISION = "data/quality/relationship-integrity/legacy-remediation/ledger.jsonl";

type ExpansionDecision = {
  decision_id: string;
  relation_kind: string;
  relation_family: string;
  subject_kind: MtaObservationKind;
  object_kind: MtaObservationKind;
  expected_affected_relation_count: number;
};

type ExpansionDecisionSet = {
  schema_version: 1;
  decision_set_id: string;
  contract_id: typeof RELATIONSHIP_CONTRACT_ID;
  review_status: "approved";
  reviewed_at: string;
  reviewed_by: string;
  approval_scope: string;
  pinned_baseline: {
    canonical_relations_path: string;
    canonical_relations_sha256: string;
    endpoint_matrix_stable_sha256: string;
    relation_count: number;
    tuple_count: number;
  };
  pinned_review_sources: {
    semantic_corrections_path: string;
    legacy_remediation_ledger_path: string;
    legacy_remediation_ledger_sha256: string;
    legacy_remediation_summary_path: string;
    legacy_remediation_summary_sha256: string;
  };
  expected_expansion_tuple_count: number;
  expected_affected_relation_count: number;
  decisions: ExpansionDecision[];
};

type LegacyCorrection = {
  correction_id: string;
  op: string;
  record_id: string;
  patch: JsonObject;
  reason: string;
  source_decision: string;
  reviewed_at: string;
  provenance: string;
};

type LegacyLedgerItem = {
  item_id: string;
  record_ids: string[];
  correction_ids: string[];
  evidence_ids: string[];
  investigation: string;
  reasons: string[];
};

type MatrixCore = Omit<RelationshipEndpointMatrix, "tuple_provenance">;

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function text(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function shapeKey(subjectKind: MtaObservationKind, objectKind: MtaObservationKind): string {
  return `${subjectKind}\0${objectKind}`;
}

function familyShapeKey(family: string, subjectKind: MtaObservationKind, objectKind: MtaObservationKind): string {
  return `${family}\0${subjectKind}\0${objectKind}`;
}

function tupleKey(
  relationKind: string,
  relationFamily: string,
  subjectKind: MtaObservationKind,
  objectKind: MtaObservationKind,
): string {
  return `${relationKind}\0${familyShapeKey(relationFamily, subjectKind, objectKind)}`;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function writeJson(path: string, value: JsonValue): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildObservedMatrix(records: MtaCanonicalRecord[]): MatrixCore {
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const byKind = new Map<string, {
    families: Set<string>;
    shapes: Map<string, { subject_kind: MtaObservationKind; object_kind: MtaObservationKind }>;
    familyShapes: Map<string, RelationshipEndpointFamilyShape>;
    count: number;
  }>();
  let relationCount = 0;

  for (const record of records) {
    if (record.record_kind !== "relation") continue;
    relationCount += 1;
    const relationKind = text(record.payload.relation_kind);
    const subjectId = text(record.payload.subject_id);
    const objectId = text(record.payload.object_id);
    if (!relationKind || !subjectId || !objectId) {
      throw new Error(`Cannot inventory relationship matrix: relation ${record.record_id} lacks kind or endpoint`);
    }
    const subject = byId.get(subjectId);
    const object = byId.get(objectId);
    if (!subject || !object) {
      throw new Error(`Cannot inventory relationship matrix: relation ${record.record_id} has a dangling endpoint`);
    }
    const family = text(record.payload.relation_family) ?? "other";
    const group = byKind.get(relationKind) ?? {
      families: new Set<string>(),
      shapes: new Map(),
      familyShapes: new Map(),
      count: 0,
    };
    group.families.add(family);
    group.shapes.set(shapeKey(subject.record_kind, object.record_kind), {
      subject_kind: subject.record_kind,
      object_kind: object.record_kind,
    });
    group.familyShapes.set(familyShapeKey(family, subject.record_kind, object.record_kind), {
      relation_family: family,
      subject_kind: subject.record_kind,
      object_kind: object.record_kind,
      provenance: "frozen_observed_baseline",
      review_decision_ids: [],
    });
    group.count += 1;
    byKind.set(relationKind, group);
  }

  const rules: RelationshipEndpointRule[] = [...byKind.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relationKind, group]) => ({
      relation_kind: relationKind,
      relation_families: [...group.families].sort(),
      allowed_shapes: [...group.shapes.values()].sort(
        (left, right) => left.subject_kind.localeCompare(right.subject_kind) || left.object_kind.localeCompare(right.object_kind),
      ),
      allowed_family_shapes: [...group.familyShapes.values()].sort((left, right) =>
        left.relation_family.localeCompare(right.relation_family) ||
        left.subject_kind.localeCompare(right.subject_kind) ||
        left.object_kind.localeCompare(right.object_kind)),
      review_basis: RELATION_ENDPOINT_SHAPES[relationKind] ? "existing_exact_rule" : "frozen_observed_shape",
    }));
  const tupleCount = rules.reduce((sum, rule) => sum + rule.allowed_family_shapes.length, 0);

  return {
    schema_version: 1,
    contract_id: RELATIONSHIP_CONTRACT_ID,
    generated_from: {
      canonical_relations_path: relative(repoRoot, RELATIONS_PATH),
      canonical_relations_sha256: fileSha256(RELATIONS_PATH),
      canonical_record_count: records.length,
      canonical_relation_count: relationCount,
    },
    relation_kind_rule_count: rules.length,
    covered_relation_count: relationCount,
    allowed_family_shape_count: tupleCount,
    rules,
  };
}

function assertDecisionSet(decisions: ExpansionDecisionSet): void {
  if (decisions.schema_version !== 1 || decisions.contract_id !== RELATIONSHIP_CONTRACT_ID ||
      decisions.review_status !== "approved") {
    throw new Error("Reviewed relationship tuple expansion decisions are invalid or unapproved");
  }
  if (decisions.expected_expansion_tuple_count !== decisions.decisions.length) {
    throw new Error("Reviewed relationship tuple expansion decision count is inconsistent");
  }
  const ids = new Set<string>();
  const tuples = new Set<string>();
  let affected = 0;
  for (const decision of decisions.decisions) {
    const key = tupleKey(
      decision.relation_kind,
      decision.relation_family,
      decision.subject_kind,
      decision.object_kind,
    );
    if (!decision.decision_id.trim() || ids.has(decision.decision_id)) {
      throw new Error(`Duplicate or blank relationship expansion decision id: ${decision.decision_id}`);
    }
    if (tuples.has(key)) throw new Error(`Duplicate reviewed relationship expansion tuple: ${key}`);
    if (decision.expected_affected_relation_count < 1) {
      throw new Error(`Reviewed relationship expansion has no affected relations: ${decision.decision_id}`);
    }
    ids.add(decision.decision_id);
    tuples.add(key);
    affected += decision.expected_affected_relation_count;
  }
  if (affected !== decisions.expected_affected_relation_count) {
    throw new Error(
      `Reviewed relationship expansion affected count ${affected} does not match ${decisions.expected_affected_relation_count}`,
    );
  }
}

function buildBaselineInventory(
  records: MtaCanonicalRecord[],
  matrix: MatrixCore,
  decisions: ExpansionDecisionSet,
): RelationshipBaselineTupleReviewInventory {
  if (fileSha256(RELATIONS_PATH) !== decisions.pinned_baseline.canonical_relations_sha256 ||
      matrix.generated_from.canonical_relation_count !== decisions.pinned_baseline.relation_count ||
      matrix.allowed_family_shape_count !== decisions.pinned_baseline.tuple_count) {
    throw new Error("Cannot create baseline inventory from a corpus other than the pinned frozen baseline");
  }
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const relationIdsByTuple = new Map<string, string[]>();
  for (const relation of records) {
    if (relation.record_kind !== "relation") continue;
    const relationKind = text(relation.payload.relation_kind)!;
    const family = text(relation.payload.relation_family) ?? "other";
    const subject = byId.get(text(relation.payload.subject_id)!);
    const object = byId.get(text(relation.payload.object_id)!);
    if (!subject || !object) throw new Error(`Cannot inventory dangling baseline relation ${relation.record_id}`);
    const key = tupleKey(relationKind, family, subject.record_kind, object.record_kind);
    const ids = relationIdsByTuple.get(key) ?? [];
    ids.push(relation.record_id);
    relationIdsByTuple.set(key, ids);
  }
  const tuples = matrix.rules.flatMap((rule) => rule.allowed_family_shapes.map((tuple) => {
    const key = tupleKey(rule.relation_kind, tuple.relation_family, tuple.subject_kind, tuple.object_kind);
    const recordIds = uniqueSorted(relationIdsByTuple.get(key) ?? []);
    if (recordIds.length === 0) throw new Error(`Frozen baseline tuple has no observed relation: ${key}`);
    return {
      relation_kind: rule.relation_kind,
      relation_family: tuple.relation_family,
      subject_kind: tuple.subject_kind,
      object_kind: tuple.object_kind,
      rule_review_basis: rule.review_basis,
      observed_relation_count: recordIds.length,
      observed_relation_record_ids_sha256: sha256(stableJson(recordIds as unknown as JsonValue)),
      review_status: "frozen_observed_not_semantically_reviewed" as const,
    };
  })).sort((left, right) =>
    left.relation_kind.localeCompare(right.relation_kind) ||
    left.relation_family.localeCompare(right.relation_family) ||
    left.subject_kind.localeCompare(right.subject_kind) ||
    left.object_kind.localeCompare(right.object_kind));
  return {
    schema_version: 1,
    inventory_id: "relationship-contract-v1-frozen-baseline-tuple-inventory",
    contract_id: RELATIONSHIP_CONTRACT_ID,
    review_status: "frozen_observed_not_semantically_reviewed",
    statement: "These tuples are an exhaustive inventory of types observed in the pinned baseline. Inclusion prevents accidental breakage but is not a claim that each tuple received semantic approval. Each requires an explicit later review decision before type enforcement can be represented as semantically complete.",
    created_at: decisions.reviewed_at,
    generated_from: {
      canonical_relations_path: decisions.pinned_baseline.canonical_relations_path,
      canonical_relations_sha256: decisions.pinned_baseline.canonical_relations_sha256,
      endpoint_matrix_stable_sha256: decisions.pinned_baseline.endpoint_matrix_stable_sha256,
    },
    tuple_count: tuples.length,
    relation_assignment_count: tuples.reduce((sum, tuple) => sum + tuple.observed_relation_count, 0),
    semantically_reviewed_tuple_count: 0,
    rule_basis_counts: {
      existing_exact_rule_tuples: tuples.filter((tuple) => tuple.rule_review_basis === "existing_exact_rule").length,
      frozen_observed_shape_tuples: tuples.filter((tuple) => tuple.rule_review_basis === "frozen_observed_shape").length,
    },
    tuples,
  };
}

function applyProjectedCorrection(payload: JsonObject, correction: LegacyCorrection): void {
  if (correction.op === "patch_payload") {
    const set = correction.patch.set;
    if (set && typeof set === "object" && !Array.isArray(set)) {
      Object.assign(payload, set);
    }
    const unset = correction.patch.unset;
    if (Array.isArray(unset)) {
      for (const field of unset) if (typeof field === "string") delete payload[field];
    }
    return;
  }
  if (correction.op === "replace_endpoint") {
    const field = correction.patch.field;
    const to = correction.patch.to;
    if ((field !== "subject_id" && field !== "object_id") || typeof to !== "string") {
      throw new Error(`Invalid reviewed endpoint replacement ${correction.correction_id}`);
    }
    payload[field] = to;
    return;
  }
  throw new Error(`Unsupported correction operation in reviewed tuple expansion: ${correction.correction_id}/${correction.op}`);
}

function buildExpansionLedger(
  records: MtaCanonicalRecord[],
  decisions: ExpansionDecisionSet,
): RelationshipReviewedTupleExpansionLedger {
  if (fileSha256(RELATIONS_PATH) !== decisions.pinned_baseline.canonical_relations_sha256) {
    throw new Error("The reviewed expansion ledger may only be derived from the pinned baseline corpus");
  }
  if (fileSha256(LEGACY_LEDGER_PATH) !== decisions.pinned_review_sources.legacy_remediation_ledger_sha256 ||
      fileSha256(LEGACY_SUMMARY_PATH) !== decisions.pinned_review_sources.legacy_remediation_summary_sha256) {
    throw new Error("Pinned legacy relationship remediation review sources changed");
  }
  const allCorrections = readJsonl<LegacyCorrection>(CORRECTIONS_PATH);
  const reviewedCorrections = allCorrections.filter((correction) => correction.source_decision === LEGACY_SOURCE_DECISION);
  const correctionsByRecord = new Map<string, LegacyCorrection[]>();
  for (const correction of reviewedCorrections) {
    const group = correctionsByRecord.get(correction.record_id) ?? [];
    group.push(correction);
    correctionsByRecord.set(correction.record_id, group);
  }
  const legacyItems = readJsonl<LegacyLedgerItem>(LEGACY_LEDGER_PATH);
  const itemsByRecord = new Map<string, LegacyLedgerItem[]>();
  for (const item of legacyItems) {
    for (const recordId of item.record_ids ?? []) {
      const group = itemsByRecord.get(recordId) ?? [];
      group.push(item);
      itemsByRecord.set(recordId, group);
    }
  }
  const decisionByTuple = new Map(decisions.decisions.map((decision) => [
    tupleKey(decision.relation_kind, decision.relation_family, decision.subject_kind, decision.object_kind),
    decision,
  ]));
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const affectedByDecision = new Map<string, RelationshipReviewedTupleExpansionLedger["expansions"][number]["affected_relations"]>();
  const selectedCorrections = new Map<string, LegacyCorrection>();
  const selectedItems = new Map<string, LegacyLedgerItem>();

  for (const relation of records) {
    if (relation.record_kind !== "relation") continue;
    const corrections = correctionsByRecord.get(relation.record_id) ?? [];
    if (corrections.length === 0 || corrections.some((correction) =>
      correction.op === "retract_record" || correction.op === "supersede_record")) continue;
    const projectedPayload = { ...relation.payload };
    const tupleCorrections = corrections.filter((correction) =>
      correction.op === "patch_payload" || correction.op === "replace_endpoint");
    for (const correction of tupleCorrections) applyProjectedCorrection(projectedPayload, correction);
    const relationKind = text(projectedPayload.relation_kind);
    const family = text(projectedPayload.relation_family) ?? "other";
    const subject = byId.get(text(projectedPayload.subject_id) ?? "");
    const object = byId.get(text(projectedPayload.object_id) ?? "");
    if (!relationKind || !subject || !object) continue;
    const decision = decisionByTuple.get(tupleKey(relationKind, family, subject.record_kind, object.record_kind));
    if (!decision) continue;
    if (tupleCorrections.length === 0 || tupleCorrections.some((correction) =>
      correction.provenance !== "human" || correction.reviewed_at !== decisions.reviewed_at)) {
      throw new Error(`Reviewed tuple expansion lacks exact human correction provenance: ${relation.record_id}`);
    }
    const itemMatches = (itemsByRecord.get(relation.record_id) ?? []).filter((item) => {
      const itemCorrectionIds = new Set(item.correction_ids ?? []);
      return tupleCorrections.every((correction) => itemCorrectionIds.has(correction.correction_id));
    });
    if (itemMatches.length !== 1) {
      throw new Error(`Reviewed tuple expansion must map to exactly one legacy ledger item: ${relation.record_id}`);
    }
    const item = itemMatches[0]!;
    if (!item.evidence_ids?.length || !item.investigation?.trim() || !item.reasons?.length) {
      throw new Error(`Reviewed tuple expansion legacy item lacks evidence or rationale: ${item.item_id}`);
    }
    for (const correction of tupleCorrections) selectedCorrections.set(correction.correction_id, correction);
    selectedItems.set(item.item_id, item);
    const affected = affectedByDecision.get(decision.decision_id) ?? [];
    affected.push({
      record_id: relation.record_id,
      correction_ids: uniqueSorted(tupleCorrections.map((correction) => correction.correction_id)),
      legacy_ledger_item_ids: [item.item_id],
      evidence_ids: uniqueSorted(item.evidence_ids),
      correction_reasons: uniqueSorted(tupleCorrections.map((correction) => correction.reason)),
      legacy_investigations: [item.investigation],
      legacy_reasons: uniqueSorted(item.reasons),
    });
    affectedByDecision.set(decision.decision_id, affected);
  }

  const expansions = decisions.decisions.map((decision) => {
    const affectedRelations = (affectedByDecision.get(decision.decision_id) ?? [])
      .sort((left, right) => left.record_id.localeCompare(right.record_id));
    if (affectedRelations.length !== decision.expected_affected_relation_count) {
      throw new Error(
        `Reviewed expansion ${decision.decision_id} expected ${decision.expected_affected_relation_count} relation(s), found ${affectedRelations.length}`,
      );
    }
    return {
      decision_id: decision.decision_id,
      relation_kind: decision.relation_kind,
      relation_family: decision.relation_family,
      subject_kind: decision.subject_kind,
      object_kind: decision.object_kind,
      affected_relation_count: affectedRelations.length,
      rationales: uniqueSorted(affectedRelations.flatMap((affected) => [
        ...affected.correction_reasons,
        ...affected.legacy_investigations,
        ...affected.legacy_reasons,
      ])),
      affected_relations: affectedRelations,
    };
  });
  const selectedCorrectionRecords = [...selectedCorrections.values()]
    .sort((left, right) => left.correction_id.localeCompare(right.correction_id));
  const selectedLegacyItems = [...selectedItems.values()]
    .sort((left, right) => left.item_id.localeCompare(right.item_id));

  return {
    schema_version: 1,
    ledger_id: "relationship-contract-v1-reviewed-legacy-tuple-expansions",
    contract_id: RELATIONSHIP_CONTRACT_ID,
    review_status: "approved",
    reviewed_at: decisions.reviewed_at,
    reviewed_by: decisions.reviewed_by,
    approval_scope: decisions.approval_scope,
    pinned_sources: {
      decision_set_path: relative(repoRoot, DECISIONS_PATH),
      decision_set_sha256: sha256(stableJson(decisions as unknown as JsonValue)),
      baseline_canonical_relations_path: decisions.pinned_baseline.canonical_relations_path,
      baseline_canonical_relations_sha256: decisions.pinned_baseline.canonical_relations_sha256,
      semantic_corrections_path: decisions.pinned_review_sources.semantic_corrections_path,
      selected_semantic_correction_count: selectedCorrectionRecords.length,
      selected_semantic_corrections_sha256: sha256(stableJson(selectedCorrectionRecords as unknown as JsonValue)),
      legacy_remediation_ledger_path: decisions.pinned_review_sources.legacy_remediation_ledger_path,
      legacy_remediation_ledger_sha256: decisions.pinned_review_sources.legacy_remediation_ledger_sha256,
      selected_legacy_ledger_item_count: selectedLegacyItems.length,
      selected_legacy_ledger_items_sha256: sha256(stableJson(selectedLegacyItems as unknown as JsonValue)),
      legacy_remediation_summary_path: decisions.pinned_review_sources.legacy_remediation_summary_path,
      legacy_remediation_summary_sha256: decisions.pinned_review_sources.legacy_remediation_summary_sha256,
    },
    expansion_tuple_count: expansions.length,
    affected_relation_count: expansions.reduce((sum, expansion) => sum + expansion.affected_relation_count, 0),
    selected_correction_count: selectedCorrectionRecords.length,
    expansions,
  };
}

function assertStoredExpansionSources(
  ledger: RelationshipReviewedTupleExpansionLedger,
  decisions: ExpansionDecisionSet,
): void {
  if (fileSha256(LEGACY_LEDGER_PATH) !== decisions.pinned_review_sources.legacy_remediation_ledger_sha256 ||
      fileSha256(LEGACY_SUMMARY_PATH) !== decisions.pinned_review_sources.legacy_remediation_summary_sha256) {
    throw new Error("Pinned legacy relationship remediation review sources changed");
  }
  const expectedDecisionsSha = sha256(stableJson(decisions as unknown as JsonValue));
  if (ledger.pinned_sources.decision_set_sha256 !== expectedDecisionsSha) {
    throw new Error("Reviewed tuple expansion ledger does not match the approved decision set");
  }
  const decisionById = new Map(decisions.decisions.map((decision) => [decision.decision_id, decision]));
  const correctionIds = uniqueSorted(ledger.expansions.flatMap((expansion) =>
    expansion.affected_relations.flatMap((affected) => affected.correction_ids)));
  const correctionsById = new Map(readJsonl<LegacyCorrection>(CORRECTIONS_PATH)
    .map((correction) => [correction.correction_id, correction]));
  const selectedCorrections = correctionIds.map((correctionId) => {
    const correction = correctionsById.get(correctionId);
    if (!correction || correction.source_decision !== LEGACY_SOURCE_DECISION || correction.provenance !== "human" ||
        correction.reviewed_at !== decisions.reviewed_at) {
      throw new Error(`Reviewed tuple expansion correction is missing or changed: ${correctionId}`);
    }
    return correction;
  }).sort((left, right) => left.correction_id.localeCompare(right.correction_id));
  if (ledger.pinned_sources.selected_semantic_corrections_sha256 !==
      sha256(stableJson(selectedCorrections as unknown as JsonValue))) {
    throw new Error("Reviewed tuple expansion selected correction hash changed");
  }
  const itemsById = new Map(readJsonl<LegacyLedgerItem>(LEGACY_LEDGER_PATH).map((item) => [item.item_id, item]));
  const selectedItemIds = uniqueSorted(ledger.expansions.flatMap((expansion) =>
    expansion.affected_relations.flatMap((affected) => affected.legacy_ledger_item_ids)));
  const selectedItems = selectedItemIds.map((itemId) => {
    const item = itemsById.get(itemId);
    if (!item) throw new Error(`Reviewed tuple expansion legacy ledger item is missing: ${itemId}`);
    return item;
  }).sort((left, right) => left.item_id.localeCompare(right.item_id));
  if (ledger.pinned_sources.selected_legacy_ledger_items_sha256 !==
      sha256(stableJson(selectedItems as unknown as JsonValue))) {
    throw new Error("Reviewed tuple expansion selected legacy review hash changed");
  }
  for (const expansion of ledger.expansions) {
    const decision = decisionById.get(expansion.decision_id);
    if (!decision || decision.relation_kind !== expansion.relation_kind ||
        decision.relation_family !== expansion.relation_family || decision.subject_kind !== expansion.subject_kind ||
        decision.object_kind !== expansion.object_kind ||
        decision.expected_affected_relation_count !== expansion.affected_relation_count) {
      throw new Error(`Reviewed tuple expansion no longer matches its decision: ${expansion.decision_id}`);
    }
    for (const affected of expansion.affected_relations) {
      const item = itemsById.get(affected.legacy_ledger_item_ids[0]!);
      if (!item || !item.record_ids.includes(affected.record_id) ||
          stableJson(uniqueSorted(item.evidence_ids)) !== stableJson(affected.evidence_ids) ||
          stableJson(uniqueSorted(item.correction_ids)) !== stableJson(affected.correction_ids)) {
        throw new Error(`Reviewed tuple expansion evidence mapping changed: ${affected.record_id}`);
      }
    }
  }
}

function normalizeFrozenBaseline(previous: RelationshipEndpointMatrix | MatrixCore): MatrixCore {
  const rules = previous.rules.map((rule) => ({
    ...rule,
    relation_families: [...rule.relation_families],
    allowed_shapes: rule.allowed_shapes.map((shape) => ({ ...shape })),
    allowed_family_shapes: rule.allowed_family_shapes.map((tuple) => ({
      relation_family: tuple.relation_family,
      subject_kind: tuple.subject_kind,
      object_kind: tuple.object_kind,
      provenance: tuple.provenance ?? "frozen_observed_baseline",
      review_decision_ids: tuple.review_decision_ids ?? [],
    })),
  }));
  return {
    schema_version: previous.schema_version,
    contract_id: previous.contract_id,
    generated_from: { ...previous.generated_from },
    relation_kind_rule_count: previous.relation_kind_rule_count,
    covered_relation_count: previous.covered_relation_count,
    allowed_family_shape_count: previous.allowed_family_shape_count ??
      rules.reduce((sum, rule) => sum + rule.allowed_family_shapes.length, 0),
    rules,
  };
}

function mergeApprovedExpansions(
  previous: RelationshipEndpointMatrix | MatrixCore,
  baseline: RelationshipBaselineTupleReviewInventory,
  ledger: RelationshipReviewedTupleExpansionLedger,
): RelationshipEndpointMatrix {
  const core = normalizeFrozenBaseline(previous);
  const rulesByKind = new Map(core.rules.map((rule) => [rule.relation_kind, rule]));
  for (const expansion of ledger.expansions) {
    const rule = rulesByKind.get(expansion.relation_kind);
    if (!rule) {
      throw new Error(`Reviewed expansion may not introduce an unversioned relation kind: ${expansion.relation_kind}`);
    }
    const key = familyShapeKey(expansion.relation_family, expansion.subject_kind, expansion.object_kind);
    const existing = rule.allowed_family_shapes.find((tuple) =>
      familyShapeKey(tuple.relation_family, tuple.subject_kind, tuple.object_kind) === key);
    if (existing) {
      if (existing.provenance !== "reviewed_expansion" || existing.review_decision_ids[0] !== expansion.decision_id) {
        throw new Error(`Reviewed expansion collides with a frozen or different tuple: ${expansion.decision_id}`);
      }
      continue;
    }
    rule.allowed_family_shapes.push({
      relation_family: expansion.relation_family,
      subject_kind: expansion.subject_kind,
      object_kind: expansion.object_kind,
      provenance: "reviewed_expansion",
      review_decision_ids: [expansion.decision_id],
    });
    if (!rule.relation_families.includes(expansion.relation_family)) rule.relation_families.push(expansion.relation_family);
    if (!rule.allowed_shapes.some((shape) =>
      shape.subject_kind === expansion.subject_kind && shape.object_kind === expansion.object_kind)) {
      rule.allowed_shapes.push({ subject_kind: expansion.subject_kind, object_kind: expansion.object_kind });
    }
  }
  for (const rule of core.rules) {
    rule.relation_families.sort();
    rule.allowed_shapes.sort((left, right) =>
      left.subject_kind.localeCompare(right.subject_kind) || left.object_kind.localeCompare(right.object_kind));
    rule.allowed_family_shapes.sort((left, right) =>
      left.relation_family.localeCompare(right.relation_family) ||
      left.subject_kind.localeCompare(right.subject_kind) ||
      left.object_kind.localeCompare(right.object_kind));
  }
  const baselineSha = sha256(stableJson(baseline as unknown as JsonValue));
  const expansionSha = sha256(stableJson(ledger as unknown as JsonValue));
  return {
    ...core,
    allowed_family_shape_count: core.rules.reduce((sum, rule) => sum + rule.allowed_family_shapes.length, 0),
    tuple_provenance: {
      baseline_inventory: {
        path: relative(repoRoot, BASELINE_INVENTORY_PATH),
        sha256: baselineSha,
        tuple_count: baseline.tuple_count,
        relation_assignment_count: baseline.relation_assignment_count,
        semantic_review_status: baseline.review_status,
      },
      reviewed_expansion_ledger: {
        path: relative(repoRoot, EXPANSION_LEDGER_PATH),
        sha256: expansionSha,
        tuple_count: ledger.expansion_tuple_count,
        affected_relation_count: ledger.affected_relation_count,
        review_status: ledger.review_status,
      },
    },
  };
}

function tupleKeys(rule: RelationshipEndpointRule): Set<string> {
  if (Array.isArray(rule.allowed_family_shapes)) {
    return new Set(rule.allowed_family_shapes.map((tuple) =>
      familyShapeKey(tuple.relation_family, tuple.subject_kind, tuple.object_kind)));
  }
  return new Set(rule.relation_families.flatMap((family) => rule.allowed_shapes.map((shape) =>
    familyShapeKey(family, shape.subject_kind, shape.object_kind))));
}

function assertCurrentCorpusCovered(records: MtaCanonicalRecord[], matrix: RelationshipEndpointMatrix): void {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const rulesByKind = new Map(matrix.rules.map((rule) => [rule.relation_kind, rule]));
  const uncovered: string[] = [];
  for (const record of records) {
    if (record.record_kind !== "relation") continue;
    const relationKind = text(record.payload.relation_kind);
    const family = text(record.payload.relation_family) ?? "other";
    const subject = recordsById.get(text(record.payload.subject_id) ?? "");
    const object = recordsById.get(text(record.payload.object_id) ?? "");
    if (!relationKind || !subject || !object) {
      uncovered.push(`${record.record_id}:unresolved_identity`);
      continue;
    }
    const rule = rulesByKind.get(relationKind);
    const key = familyShapeKey(family, subject.record_kind, object.record_kind);
    if (!rule || !tupleKeys(rule).has(key)) uncovered.push(`${record.record_id}:${relationKind}/${key.replaceAll("\0", "/")}`);
  }
  if (uncovered.length > 0) {
    throw new Error(
      `Relationship contract does not cover ${uncovered.length} current edge(s); automatic expansion is forbidden: ${uncovered.slice(0, 20).join(", ")}`,
    );
  }
}

function buildContract(matrixSha256: string, previous?: RelationshipContract): RelationshipContract {
  const completenessRoles = { ...(previous?.completeness_roles ?? {}) };
  delete completenessRoles.non_projectable_record;
  completenessRoles.non_projectable_route_identity_selector = {
    required_roles: ["typed_route_identity_disposition", "evidence_binding"],
    disposition_allowed: true,
  };
  completenessRoles.non_projectable_operational_event_selector = {
    required_roles: ["typed_operational_event_disposition", "evidence_binding"],
    disposition_allowed: true,
  };
  completenessRoles.non_projectable_bus_lane_treatment_selector = {
    required_roles: ["typed_bus_lane_treatment_disposition", "evidence_binding"],
    disposition_allowed: true,
  };
  const contract: RelationshipContract = {
    schema_version: 1,
    contract_id: RELATIONSHIP_CONTRACT_ID,
    contract_status: previous?.contract_status ?? "warning_first",
    reviewed_at: previous?.reviewed_at ?? "2026-07-15T00:00:00Z",
    reviewed_by: previous?.reviewed_by ?? "codex-relationship-integrity-campaign",
    endpoint_matrix: {
      path: relative(repoRoot, MATRIX_PATH),
      sha256: matrixSha256,
      unlisted_relation_policy: "error",
      new_shape_policy: "error",
    },
    identity_policy: {
      canonical_endpoint_required: true,
      ambiguous_alias_resolution: "reject",
      superseded_endpoint_resolution: "rewrite_to_survivor",
      local_id_scope: "source",
    },
    evidence_policy: {
      minimum_refs_per_relation: 1,
      block_identity_required: true,
      hash_required: true,
      broad_same_page_block_threshold: 5,
    },
    finding_codes: previous?.finding_codes ?? {},
    completeness_roles: completenessRoles,
    migration_criteria: previous?.migration_criteria ?? {},
  };
  const criteria = contract.migration_criteria.referential_and_evidence ?? [];
  const semanticReviewCriterion =
    "every frozen-observed baseline endpoint tuple has an explicit semantic review decision before endpoint-type enforcement is declared complete";
  if (!criteria.includes(semanticReviewCriterion)) criteria.push(semanticReviewCriterion);
  contract.migration_criteria.referential_and_evidence = criteria;
  return contract;
}

const records = readCanonicalRecordsFromJsonl();
if (records.length === 0) throw new Error("Cannot freeze an empty relationship contract");
const observedMatrix = buildObservedMatrix(records);
const decisions = readJson<ExpansionDecisionSet>(DECISIONS_PATH);
assertDecisionSet(decisions);
const previousMatrix = existsSync(MATRIX_PATH)
  ? readJson<RelationshipEndpointMatrix | MatrixCore>(MATRIX_PATH)
  : undefined;
const previousContract = existsSync(CONTRACT_PATH) ? readJson<RelationshipContract>(CONTRACT_PATH) : undefined;
if (!previousMatrix || !previousContract) throw new Error("Frozen relationship contract is missing");
const previousStableSha = sha256(stableJson(previousMatrix as unknown as JsonValue));
if (previousStableSha !== previousContract.endpoint_matrix.sha256) {
  throw new Error(
    `Frozen relationship matrix hash mismatch: expected ${previousContract.endpoint_matrix.sha256}, found ${previousStableSha}`,
  );
}

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--reviewed-update")) {
  throw new Error("Contract updates require both --apply and --reviewed-update");
}

let baseline: RelationshipBaselineTupleReviewInventory;
if (existsSync(BASELINE_INVENTORY_PATH)) {
  baseline = readJson<RelationshipBaselineTupleReviewInventory>(BASELINE_INVENTORY_PATH);
} else {
  if (!apply) throw new Error("Frozen baseline tuple review inventory is missing; use a reviewed update");
  const previousHasProvenance = "tuple_provenance" in previousMatrix;
  if (!previousHasProvenance && previousStableSha !== decisions.pinned_baseline.endpoint_matrix_stable_sha256) {
    throw new Error("Initial tuple provenance migration does not match the pinned frozen endpoint matrix");
  }
  if (previousHasProvenance &&
      previousMatrix.generated_from.canonical_relations_sha256 !== decisions.pinned_baseline.canonical_relations_sha256) {
    throw new Error("Cannot reconstruct baseline inventory after the pinned baseline corpus changed");
  }
  baseline = buildBaselineInventory(records, observedMatrix, decisions);
}

let expansionLedger: RelationshipReviewedTupleExpansionLedger;
if (existsSync(EXPANSION_LEDGER_PATH)) {
  expansionLedger = readJson<RelationshipReviewedTupleExpansionLedger>(EXPANSION_LEDGER_PATH);
  assertStoredExpansionSources(expansionLedger, decisions);
} else {
  if (!apply) throw new Error("Reviewed tuple expansion ledger is missing; use a reviewed update");
  expansionLedger = buildExpansionLedger(records, decisions);
}

const matrix = mergeApprovedExpansions(previousMatrix, baseline, expansionLedger);
assertRelationshipTupleProvenance(matrix, baseline, expansionLedger);
assertCurrentCorpusCovered(records, matrix);
const matrixSha256 = sha256(stableJson(matrix as unknown as JsonValue));
const contract = buildContract(matrixSha256, previousContract);

if (apply) {
  writeJson(BASELINE_INVENTORY_PATH, baseline as unknown as JsonValue);
  writeJson(EXPANSION_LEDGER_PATH, expansionLedger as unknown as JsonValue);
  writeJson(MATRIX_PATH, matrix as unknown as JsonValue);
  writeJson(CONTRACT_PATH, contract as unknown as JsonValue);
} else if (matrixSha256 !== previousContract.endpoint_matrix.sha256) {
  throw new Error(
    `Reviewed relationship contract is stale: expected ${previousContract.endpoint_matrix.sha256}, reconstructed ${matrixSha256}`,
  );
}

console.log(JSON.stringify({
  contract_id: contract.contract_id,
  mode: apply ? "reviewed_update" : "check",
  matrix_sha256: contract.endpoint_matrix.sha256,
  relation_kind_rules: matrix.relation_kind_rule_count,
  allowed_family_shape_tuples: matrix.allowed_family_shape_count,
  frozen_observed_baseline_tuples: baseline.tuple_count,
  semantically_reviewed_baseline_tuples: baseline.semantically_reviewed_tuple_count,
  reviewed_expansion_tuples: expansionLedger.expansion_tuple_count,
  reviewed_expansion_relations: expansionLedger.affected_relation_count,
  reviewed_expansion_corrections: expansionLedger.selected_correction_count,
  covered_relations: records.filter((record) => record.record_kind === "relation").length,
  contract_path: relative(repoRoot, CONTRACT_PATH),
  matrix_path: relative(repoRoot, MATRIX_PATH),
  baseline_inventory_path: relative(repoRoot, BASELINE_INVENTORY_PATH),
  reviewed_expansion_ledger_path: relative(repoRoot, EXPANSION_LEDGER_PATH),
}));
