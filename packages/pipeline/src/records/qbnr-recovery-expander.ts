import { createHash } from "node:crypto";
import { canonicalRecordIdForInput, isGlobalRecordKind, recordBaseIdForInput, slug } from "@mta-wiki/db/identity";
import type { JsonObject, JsonValue, MtaCanonicalRecord, StagedSourceBlock } from "@mta-wiki/db/types";
import { normalizeObservationPayload } from "@mta-wiki/pipeline/ontology/normalizers";
import {
  OPERATIONAL_RECOVERY_PROPOSAL_SCHEMA_VERSION,
  parseOperationalRecoveryProposal,
  type OperationalRecoveryBundleRelation,
  type OperationalRecoveryEvidenceBinding,
  type OperationalRecoveryObservation,
  type OperationalRecoveryObservationBundleProposal,
} from "@mta-wiki/pipeline/records/operational-recovery-proposals";
import type { OperationalCoverageRouteAnchorPin } from "@mta-wiki/pipeline/quality/operational-coverage-artifacts";

export const QBNR_SERVICE_CHANGES_SOURCE_ID = "mta_queens_bus_network_redesign_service_changes" as const;

export type QbnrEventKind = "service_change" | "start" | "end" | "rename";
export type QbnrOccurrenceShape = "atomic" | "bundle";

export type QbnrRouteResolution =
  | { mode: "target"; target_record_id: string }
  | { mode: "create" };

export type QbnrStudyDisposition =
  | { status: "projectable"; gtfs_route_id: string }
  | { status: "excluded"; reason: string; gtfs_route_id?: string | undefined };

export type QbnrTreatmentClause = {
  clause_kind: "treatment";
  id: string;
  label: string;
  source_quote: string;
  treatment_kind: string;
  expected_treatment_family: string;
  description: string;
  location_text?: string | undefined;
  relation_label?: string | undefined;
  relation_description?: string | undefined;
};

export type QbnrContextClause = {
  clause_kind: "context";
  source_quote: string;
  review_rationale: string;
};

export type QbnrClause = QbnrTreatmentClause | QbnrContextClause;

export type QbnrRecoveryUnitSpec = {
  source_block_ids: string[];
  source_block_sha256s: string[];
  source_route_labels: string[];
  route_label: string;
  route_resolution: QbnrRouteResolution;
  study_disposition: QbnrStudyDisposition;
  event_kind: QbnrEventKind;
  occurrence_shape: QbnrOccurrenceShape;
  clauses: QbnrClause[];
};

export type QbnrRecoveryBatchSpec = {
  proposal_id: string;
  corpus_fingerprint: string;
  gap_ids: string[];
  project_record_id: string;
  project_label: string;
  drafted_by: string;
  drafted_at: string;
  rationale: string;
  units: QbnrRecoveryUnitSpec[];
};

export type QbnrRecoveryExpansionContext = {
  blocks: readonly StagedSourceBlock[];
  records: readonly MtaCanonicalRecord[];
  routeAnchorPin?: OperationalCoverageRouteAnchorPin | undefined;
};

type ParsedQbnrRow = {
  route_label: string;
  event_cell: string;
  description_cells: string[];
};

type ExactDate = {
  text: string;
  normalized: string;
  year: string;
};

const eventKindPayload: Record<QbnrEventKind, string> = {
  service_change: "route redesign service change",
  start: "route service start",
  end: "route service end",
  rename: "route rename",
};

const monthNumbers: Record<string, string> = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12",
};

function fail(message: string): never {
  throw new Error(`Invalid QBNR recovery batch: ${message}`);
}

function nonEmpty(value: string | undefined, path: string): string {
  if (typeof value !== "string" || !value.trim()) fail(`${path} must be a non-empty string`);
  return value.trim();
}

function exactSha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function parseRow(block: StagedSourceBlock): ParsedQbnrRow {
  if (block.source_id !== QBNR_SERVICE_CHANGES_SOURCE_ID) {
    fail(`block ${block.block_id} belongs to ${block.source_id}, not ${QBNR_SERVICE_CHANGES_SOURCE_ID}`);
  }
  if (block.raw_text_sha256 !== exactSha256(block.raw_text)) {
    fail(`block ${block.block_id} raw_text_sha256 does not match its current raw_text`);
  }
  const cells = block.raw_text.split(" | ");
  if (cells.length < 3 || cells.some((cell) => !cell.trim() || cell !== cell.trim())) {
    fail(`block ${block.block_id} is not an exact QBNR table row`);
  }
  const routeLabel = cells[0]!;
  const eventCell = cells[1]!;
  const descriptionCells = cells.slice(2);
  if (descriptionCells.length === 0) fail(`block ${block.block_id} has no source description cells`);
  return { route_label: routeLabel, event_cell: eventCell, description_cells: descriptionCells };
}

function routeSurface(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/gu, "");
}

function payloadStrings(value: JsonValue | undefined): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}

function routePayloadSurfaces(record: MtaCanonicalRecord): Set<string> {
  const fields = ["route_id", "route_name", "route_label", "route_short_name", "gtfs_route_id", "routes"];
  return new Set(fields.flatMap((field) => payloadStrings(record.payload[field])).map(routeSurface).filter(Boolean));
}

function mentionsRouteLabel(value: string, routeLabel: string): boolean {
  const escaped = routeLabel.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`, "u").test(value);
}

function exactDate(eventCell: string, path: string): ExactDate {
  const matches = [...eventCell.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})\b/gu)];
  if (matches.length !== 1) fail(`${path} must contain exactly one full calendar date`);
  const match = matches[0]!;
  const month = monthNumbers[match[1]!]!;
  const dayNumber = Number(match[2]);
  const year = match[3]!;
  const parsed = new Date(`${year}-${month}-${String(dayNumber).padStart(2, "0")}T00:00:00.000Z`);
  if (dayNumber < 1 || parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() + 1 !== Number(month) || parsed.getUTCDate() !== dayNumber) {
    fail(`${path} contains an invalid calendar date`);
  }
  return {
    text: match[0],
    normalized: `${year}-${month}-${String(dayNumber).padStart(2, "0")}`,
    year,
  };
}

function validateEventCell(unit: QbnrRecoveryUnitSpec, row: ParsedQbnrRow, path: string): ExactDate {
  if (!unit.source_route_labels.some((label) => mentionsRouteLabel(row.event_cell, label))) {
    fail(`${path} event cell does not mention any declared source route label`);
  }
  const matchesKind = unit.event_kind === "service_change"
    ? /^Changes to the .+ took effect .+\.$/u.test(row.event_cell)
    : unit.event_kind === "rename"
      ? /\b(?:became|renamed)\b.*\bon\b/u.test(row.event_cell)
      : unit.event_kind === "start"
        ? /\b(?:began|started|launched|introduced)\b/u.test(row.event_cell)
        : /\b(?:ended|discontinued|ceased)\b/u.test(row.event_cell);
  if (!matchesKind) fail(`${path} event cell does not match declared event_kind ${unit.event_kind}`);
  return exactDate(row.event_cell, `${path} event cell`);
}

function validatePartition(unit: QbnrRecoveryUnitSpec, row: ParsedQbnrRow, path: string): QbnrTreatmentClause[] {
  if (!Array.isArray(unit.clauses) || unit.clauses.length === 0) fail(`${path}.clauses must be non-empty`);
  let clauseIndex = 0;
  for (const [cellIndex, cell] of row.description_cells.entries()) {
    let offset = 0;
    while (offset < cell.length) {
      while (/\s/u.test(cell[offset] ?? "")) offset += 1;
      if (offset === cell.length) break;
      const clause = unit.clauses[clauseIndex];
      if (!clause) fail(`${path} leaves unaccounted source text in description cell ${cellIndex}: ${JSON.stringify(cell.slice(offset))}`);
      const quote = nonEmpty(clause.source_quote, `${path}.clauses[${clauseIndex}].source_quote`);
      if (!cell.startsWith(quote, offset)) {
        fail(`${path}.clauses[${clauseIndex}] does not exactly partition description cell ${cellIndex} at ${JSON.stringify(cell.slice(offset))}`);
      }
      offset += quote.length;
      clauseIndex += 1;
    }
  }
  if (clauseIndex !== unit.clauses.length) fail(`${path} contains ${unit.clauses.length - clauseIndex} clause(s) outside the source description cells`);

  const treatments = unit.clauses.filter((clause): clause is QbnrTreatmentClause => clause.clause_kind === "treatment");
  for (const [index, clause] of unit.clauses.entries()) {
    if (clause.clause_kind === "context") {
      nonEmpty(clause.review_rationale, `${path}.clauses[${index}].review_rationale`);
    } else if (clause.clause_kind !== "treatment") {
      fail(`${path}.clauses[${index}].clause_kind is unsupported`);
    }
  }
  if (unit.occurrence_shape === "atomic" && treatments.length !== 1) fail(`${path} atomic occurrence must have exactly one treatment clause`);
  if (unit.occurrence_shape === "bundle" && treatments.length < 2) fail(`${path} bundle occurrence must have at least two treatment clauses`);
  return treatments;
}

function evidence(block: StagedSourceBlock, role: string, sourceQuote: string): OperationalRecoveryEvidenceBinding {
  if (sourceQuote.length > 280) fail(`evidence quote in block ${block.block_id} exceeds the recovery contract's 280-character limit`);
  return {
    role,
    source_id: QBNR_SERVICE_CHANGES_SOURCE_ID,
    evidence_id: `${QBNR_SERVICE_CHANGES_SOURCE_ID}#${block.block_id}`,
    block_id: block.block_id,
    source_quote: sourceQuote,
  };
}

function expectedRecordId(observation: Omit<OperationalRecoveryObservation, "expected_record_id" | "evidence_bindings">): string {
  const input = {
    source_id: QBNR_SERVICE_CHANGES_SOURCE_ID,
    observation_kind: observation.observation_kind,
    local_observation_id: observation.local_observation_id,
    label: observation.label,
    ...(observation.raw_text === undefined ? {} : { raw_text: observation.raw_text }),
    payload: observation.payload,
  };
  return isGlobalRecordKind(observation.observation_kind)
    ? canonicalRecordIdForInput(input)
    : recordBaseIdForInput(input);
}

function relationEvidence(block: StagedSourceBlock, semanticRole: string, quote: string): OperationalRecoveryEvidenceBinding[] {
  return [evidence(block, "relationship", quote), evidence(block, semanticRole, quote)];
}

function assertUnique(value: string, seen: Set<string>, path: string): void {
  if (seen.has(value)) fail(`duplicate ${path} ${value}`);
  seen.add(value);
}

function assertProject(spec: QbnrRecoveryBatchSpec, records: readonly MtaCanonicalRecord[]): void {
  const matches = records.filter((record) => record.record_id === spec.project_record_id);
  if (matches.length !== 1 || matches[0]!.record_kind !== "project") {
    fail(`project_record_id ${spec.project_record_id} must resolve to exactly one canonical project`);
  }
}

function routeObservation(
  unit: QbnrRecoveryUnitSpec,
  block: StagedSourceBlock,
  records: readonly MtaCanonicalRecord[],
  year: string,
  path: string,
): OperationalRecoveryObservation {
  const disposition = unit.study_disposition;
  if (disposition.status === "projectable" && !nonEmpty(disposition.gtfs_route_id, `${path}.study_disposition.gtfs_route_id`)) {
    fail(`${path} projectable route requires gtfs_route_id`);
  }
  if (disposition.status === "excluded") nonEmpty(disposition.reason, `${path}.study_disposition.reason`);
  if (disposition.status !== "projectable" && disposition.status !== "excluded") fail(`${path}.study_disposition.status is unsupported`);

  const localObservationId = `route_${slug(unit.route_label)}_qbnr_${year}`.replace(/-/gu, "_");
  const payload: JsonObject = {
    route_id: unit.route_label,
    route_name: unit.route_label,
    ...(disposition.gtfs_route_id ? { gtfs_route_id: disposition.gtfs_route_id } : {}),
  };
  const base = {
    observation_kind: "route" as const,
    local_observation_id: localObservationId,
    label: unit.route_label,
    raw_text: unit.route_label,
    payload,
  };

  if (unit.route_resolution.mode === "target") {
    const targetId = nonEmpty(unit.route_resolution.target_record_id, `${path}.route_resolution.target_record_id`);
    const target = records.find((record) => record.record_id === targetId);
    if (!target) fail(`${path} target route ${targetId} does not exist`);
    if (target.record_kind !== "route") fail(`${path} target ${targetId} has kind ${target.record_kind}, expected route`);
    if (!routePayloadSurfaces(target).has(routeSurface(unit.route_label))) {
      fail(`${path} target ${targetId} payload route fields do not identify ${unit.route_label}`);
    }
    return {
      ...base,
      expected_record_id: targetId,
      target_record_id: targetId,
      evidence_bindings: [evidence(block, "route_identity", unit.route_label)],
    };
  }
  if (unit.route_resolution.mode !== "create") fail(`${path}.route_resolution.mode is unsupported`);
  const existingIdentity = records.find((record) => record.record_kind === "route" && routePayloadSurfaces(record).has(routeSurface(unit.route_label)));
  if (existingIdentity) fail(`${path} requests route creation but canonical route ${existingIdentity.record_id} already identifies ${unit.route_label}`);
  const expected = expectedRecordId(base);
  if (records.some((record) => record.record_id === expected)) fail(`${path} generated route record ${expected} already exists; use target mode`);
  return {
    ...base,
    expected_record_id: expected,
    evidence_bindings: [evidence(block, "route_identity", unit.route_label)],
  };
}

export function expandQbnrRecoveryBatch(
  spec: QbnrRecoveryBatchSpec,
  context: QbnrRecoveryExpansionContext,
): OperationalRecoveryObservationBundleProposal {
  nonEmpty(spec.proposal_id, "proposal_id");
  nonEmpty(spec.corpus_fingerprint, "corpus_fingerprint");
  nonEmpty(spec.project_record_id, "project_record_id");
  nonEmpty(spec.project_label, "project_label");
  nonEmpty(spec.drafted_by, "drafted_by");
  nonEmpty(spec.drafted_at, "drafted_at");
  nonEmpty(spec.rationale, "rationale");
  if (!Array.isArray(spec.gap_ids) || spec.gap_ids.length === 0) fail("gap_ids must be non-empty");
  if (!Array.isArray(spec.units) || spec.units.length === 0) fail("units must be non-empty");
  assertProject(spec, context.records);

  const blocksById = new Map<string, StagedSourceBlock>();
  for (const block of context.blocks) {
    if (blocksById.has(block.block_id)) fail(`duplicate staged block_id ${block.block_id}`);
    blocksById.set(block.block_id, block);
  }
  const claimedBlockIds = new Set<string>();
  const routeLabels = new Set<string>();
  const clauseIds = new Set<string>();
  const localIds = new Set<string>();
  const expectedRecordIds = new Set<string>();
  const observations: OperationalRecoveryObservation[] = [];
  const relations: OperationalRecoveryBundleRelation[] = [];

  for (const [unitIndex, unit] of spec.units.entries()) {
    const path = `units[${unitIndex}]`;
    const routeLabel = nonEmpty(unit.route_label, `${path}.route_label`);
    assertUnique(routeSurface(routeLabel), routeLabels, "route_label");
    if (!["service_change", "start", "end", "rename"].includes(unit.event_kind)) {
      fail(`${path}.event_kind is unsupported`);
    }
    if (unit.occurrence_shape !== "atomic" && unit.occurrence_shape !== "bundle") {
      fail(`${path}.occurrence_shape is unsupported`);
    }
    if (!Array.isArray(unit.source_block_ids) || ![1, 2].includes(unit.source_block_ids.length)) {
      fail(`${path}.source_block_ids must contain one row, or two rows for a rename`);
    }
    if (!Array.isArray(unit.source_route_labels) || unit.source_route_labels.length !== unit.source_block_ids.length) {
      fail(`${path}.source_route_labels must align one-to-one with source_block_ids`);
    }
    if (!Array.isArray(unit.source_block_sha256s) || unit.source_block_sha256s.length !== unit.source_block_ids.length) {
      fail(`${path}.source_block_sha256s must align one-to-one with source_block_ids`);
    }
    if (unit.event_kind === "rename" && unit.source_block_ids.length !== 2) fail(`${path} rename requires paired source blocks`);
    if (unit.event_kind !== "rename" && unit.source_block_ids.length !== 1) fail(`${path} paired source blocks are supported only for rename events`);

    const rows = unit.source_block_ids.map((blockId, blockIndex) => {
      assertUnique(blockId, claimedBlockIds, "source_block_id");
      const block = blocksById.get(blockId);
      if (!block) fail(`${path}.source_block_ids[${blockIndex}] ${blockId} is missing`);
      const pinnedHash = nonEmpty(unit.source_block_sha256s[blockIndex], `${path}.source_block_sha256s[${blockIndex}]`);
      if (pinnedHash !== block.raw_text_sha256 || pinnedHash !== exactSha256(block.raw_text)) {
        fail(`${path} block ${blockId} does not match pinned raw_text_sha256 ${pinnedHash}`);
      }
      const row = parseRow(block);
      const declaredLabel = nonEmpty(unit.source_route_labels[blockIndex], `${path}.source_route_labels[${blockIndex}]`);
      if (row.route_label !== declaredLabel) fail(`${path} block ${blockId} row label ${row.route_label} does not equal declared ${declaredLabel}`);
      return { block, row };
    });
    const currentRows = rows.filter(({ row }) => row.route_label === routeLabel);
    if (currentRows.length !== 1) fail(`${path} route_label ${routeLabel} must select exactly one source row as current evidence`);
    if (rows.length === 2) {
      const [left, right] = rows;
      if (left!.row.event_cell !== right!.row.event_cell) fail(`${path} paired rename event cells differ`);
      if (JSON.stringify(left!.row.description_cells) !== JSON.stringify(right!.row.description_cells)) {
        fail(`${path} paired rename description cells differ`);
      }
    }
    const { block, row } = currentRows[0]!;
    const date = validateEventCell(unit, row, path);
    const treatments = validatePartition(unit, row, path);
    const relationStart = relations.length;
    const route = routeObservation(unit, block, context.records, date.year, path);
    assertUnique(route.local_observation_id, localIds, "local_observation_id");
    assertUnique(route.expected_record_id, expectedRecordIds, "expected_record_id");
    observations.push(route);

    const routeKey = slug(routeLabel).replace(/-/gu, "_");
    const dateKey = date.normalized.replace(/-/gu, "_");
    const eventLocalId = `event_${routeKey}_qbnr_${unit.event_kind}_${dateKey}`;
    const eventBase = {
      observation_kind: "event" as const,
      local_observation_id: eventLocalId,
      label: `${routeLabel} ${unit.event_kind.replace(/_/gu, " ")} ${date.text}`,
      raw_text: row.event_cell,
      payload: {
        event_kind: eventKindPayload[unit.event_kind],
        date_text: date.text,
        date_normalized: date.normalized,
        date_precision: "day",
        description: row.event_cell,
      } satisfies JsonObject,
    };
    const event: OperationalRecoveryObservation = {
      ...eventBase,
      expected_record_id: expectedRecordId(eventBase),
      evidence_bindings: [evidence(block, "event_date", row.event_cell)],
    };
    assertUnique(event.local_observation_id, localIds, "local_observation_id");
    assertUnique(event.expected_record_id, expectedRecordIds, "expected_record_id");
    observations.push(event);

    const routeRelationId = `relation_qbnr_${date.year}_affects_${routeKey}`;
    assertUnique(routeRelationId, localIds, "local_observation_id");
    relations.push({
      local_observation_id: routeRelationId,
      label: `${spec.project_label} affects ${routeLabel}`,
      relation_kind: "affects_route",
      subject: { record_id: spec.project_record_id },
      object: { local_observation_id: route.local_observation_id },
      assertion_status: "delivered",
      as_of_date: date.normalized,
      description: `${spec.project_label} changed ${routeLabel} service.`,
      evidence_bindings: relationEvidence(block, "route_scope", routeLabel),
    });

    const eventRelationId = `relation_qbnr_has_${routeKey}_${unit.event_kind}_${dateKey}`;
    assertUnique(eventRelationId, localIds, "local_observation_id");
    relations.push({
      local_observation_id: eventRelationId,
      label: `${spec.project_label} has ${routeLabel} ${unit.event_kind.replace(/_/gu, " ")} event`,
      relation_kind: "has_timeline_event",
      subject: { record_id: spec.project_record_id },
      object: { local_observation_id: event.local_observation_id },
      assertion_status: "delivered",
      as_of_date: date.normalized,
      description: row.event_cell,
      evidence_bindings: relationEvidence(block, "timeline_relation", row.event_cell),
    });

    for (const [treatmentIndex, clause] of treatments.entries()) {
      const clausePath = `${path}.treatment_clauses[${treatmentIndex}]`;
      const clauseId = nonEmpty(clause.id, `${clausePath}.id`);
      if (!/^[a-z0-9][a-z0-9_]{1,79}$/u.test(clauseId)) fail(`${clausePath}.id must be lowercase snake_case`);
      assertUnique(`${routeSurface(routeLabel)}:${clauseId}`, clauseIds, "treatment clause id");
      const treatmentLocalId = `treatment_${routeKey}_${clauseId}_${date.year}`;
      const payload: JsonObject = {
        treatment_kind: nonEmpty(clause.treatment_kind, `${clausePath}.treatment_kind`),
        description: nonEmpty(clause.description, `${clausePath}.description`),
        ...(clause.location_text === undefined ? {} : { location_text: nonEmpty(clause.location_text, `${clausePath}.location_text`) }),
      };
      const normalized = normalizeObservationPayload("treatment_component", payload);
      const expectedFamily = nonEmpty(clause.expected_treatment_family, `${clausePath}.expected_treatment_family`);
      if (normalized.treatment_family !== expectedFamily) {
        fail(`${clausePath} normalizes to treatment_family ${String(normalized.treatment_family)}, expected ${expectedFamily}`);
      }
      const treatmentBase = {
        observation_kind: "treatment_component" as const,
        local_observation_id: treatmentLocalId,
        label: nonEmpty(clause.label, `${clausePath}.label`),
        raw_text: clause.source_quote,
        payload,
      };
      const treatment: OperationalRecoveryObservation = {
        ...treatmentBase,
        expected_record_id: expectedRecordId(treatmentBase),
        evidence_bindings: [evidence(block, "treatment_definition", clause.source_quote)],
      };
      assertUnique(treatment.local_observation_id, localIds, "local_observation_id");
      assertUnique(treatment.expected_record_id, expectedRecordIds, "expected_record_id");
      observations.push(treatment);

      const treatmentRelationId = `relation_qbnr_${date.year}_has_${routeKey}_${clauseId}`;
      assertUnique(treatmentRelationId, localIds, "local_observation_id");
      relations.push({
        local_observation_id: treatmentRelationId,
        label: clause.relation_label ?? `${spec.project_label} includes ${clause.label}`,
        relation_kind: "has_treatment",
        subject: { record_id: spec.project_record_id },
        object: { local_observation_id: treatment.local_observation_id },
        assertion_status: "delivered",
        as_of_date: date.normalized,
        description: clause.relation_description ?? clause.description,
        evidence_bindings: relationEvidence(block, "treatment_scope", clause.source_quote),
      });
    }

    const unitRelations = relations.slice(relationStart);
    const routeRelations = unitRelations.filter((relation) => relation.relation_kind === "affects_route").length;
    const timelineRelations = unitRelations.filter((relation) => relation.relation_kind === "has_timeline_event").length;
    const treatmentRelations = unitRelations.filter((relation) => relation.relation_kind === "has_treatment").length;
    if (routeRelations !== 1 || timelineRelations !== 1 || treatmentRelations !== treatments.length || unitRelations.length !== 2 + treatments.length) {
      fail(`${path} generated an invalid relation cardinality`);
    }
  }

  const relationTriples = new Set<string>();
  for (const relation of relations) {
    const subject = "record_id" in relation.subject
      ? `record:${relation.subject.record_id}`
      : `local:${relation.subject.local_observation_id}`;
    const object = "record_id" in relation.object
      ? `record:${relation.object.record_id}`
      : `local:${relation.object.local_observation_id}`;
    assertUnique(`${relation.relation_kind}|${subject}|${object}`, relationTriples, "relation triple");
  }

  const proposal: OperationalRecoveryObservationBundleProposal = {
    schema_version: OPERATIONAL_RECOVERY_PROPOSAL_SCHEMA_VERSION,
    proposal_id: spec.proposal_id,
    proposal_kind: "observation_bundle",
    corpus_fingerprint: spec.corpus_fingerprint,
    ...(context.routeAnchorPin ? { route_anchor_pin: context.routeAnchorPin } : {}),
    gap_ids: [...spec.gap_ids],
    source_id: QBNR_SERVICE_CHANGES_SOURCE_ID,
    review_state: "proposed",
    provenance: {
      drafted_by: spec.drafted_by,
      drafted_at: spec.drafted_at,
      method: "qbnr_batch_spec_expansion",
    },
    rationale: spec.rationale,
    observations,
    relations,
  };
  parseOperationalRecoveryProposal(proposal);
  return proposal;
}
