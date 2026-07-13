import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import { loadOperationalAnchorReviewDecisions } from "../packages/pipeline/src/materialize/operational-anchor-review";
import {
  assertOperationalOccurrenceIdentityRegistry,
  deterministicOperationalOccurrenceId,
  loadOperationalOccurrenceIdentityRegistry,
  newOperationalOccurrenceIdentityEntry,
  type OperationalOccurrenceIdentityEntry,
} from "../packages/pipeline/src/materialize/operational-occurrence-identity";
import {
  loadOperationalOccurrenceAcceptedDecisions,
  parseOperationalOccurrenceAcceptedDecision,
  type OperationalOccurrenceAcceptedDecision,
  type OperationalOccurrenceAcceptedTreatment,
} from "../packages/pipeline/src/materialize/operational-occurrence-review";
import {
  computeOperationalOccurrences,
  type OperationalOccurrenceEvidenceBinding,
} from "../packages/pipeline/src/materialize/operational-occurrences";
import type { RouteAnchorRow } from "../packages/pipeline/src/materialize/route-anchors";
import {
  parseOperationalCoverageAcceptedDecision,
  type OperationalCoverageAcceptedDecision,
} from "../packages/pipeline/src/quality/operational-coverage";

const SOURCE_ID = "mta_queens_bus_network_redesign_service_changes";
const PROJECT_ID = "project_queens-bus-network-redesign";
const PROJECT_CONTEXT_EVIDENCE_ID = `${SOURCE_ID}#p001_b0001`;
const REVIEWER = "codex-corpus-completion-2026-07-13";
const ACCEPTED_AT = "2026-07-13T05:00:00.000Z";
const DECIDED_AT = "2026-07-13T05:00:30.000Z";
const ROUTE_ANCHOR_PATH = "data/exports/releases/v1-rc8/route_anchors.jsonl";
const ROUTE_ANCHOR_SHA256 = "874d2233713d624e127f6f690a42088ee9473873fb8ebff3d8f21cfb88916dc4";
const BASELINE_OCCURRENCE_COUNT = 72;
const PROMOTED_OCCURRENCE_COUNT = 52;
const EXPECTED_LEDGER_DECISION_COUNT = 98;
const EXPECTED_TOTAL_OCCURRENCE_COUNT = BASELINE_OCCURRENCE_COUNT + PROMOTED_OCCURRENCE_COUNT;

const proposalSpecs = [
  {
    path: "data/operational-anchor-review/proposed/applied/observations/orp_qbnr_15_create_route_atomic_2025.json",
    proposal_id: "orp_qbnr_15_create_route_atomic_2025",
    sha256: "c0d815cb79b9905ff3c1f08ce558adc9010fb1aa25473dd8ef2c053287404615",
    unit_count: 15,
  },
  {
    path: "data/operational-anchor-review/proposed/applied/observations/orp_qbnr_6_create_route_service_start_bundles_2025.json",
    proposal_id: "orp_qbnr_6_create_route_service_start_bundles_2025",
    sha256: "e0ab71b930ef9d62cffadd07928a96c7140c8cc67e98f9b44dadf02e766c3d75",
    unit_count: 6,
  },
  {
    path: "data/operational-anchor-review/proposed/applied/observations/orp_qbnr_27_create_route_service_change_bundles_2025.json",
    proposal_id: "orp_qbnr_27_create_route_service_change_bundles_2025",
    sha256: "315fbcf2c7328e54a301ebf2286c2ee258cb0bdeba586ff207497bed74354ad5",
    unit_count: 27,
  },
  {
    path: "data/operational-anchor-review/proposed/applied/observations/orp_qbnr_3_create_route_rename_bundles_2025.json",
    proposal_id: "orp_qbnr_3_create_route_rename_bundles_2025",
    sha256: "a7ccd4455ba7e7305cc5080521ea1bfd9d25c6aa22c99a5adf063bc2384f7c2b",
    unit_count: 3,
  },
  {
    path: "data/operational-anchor-review/proposed/applied/observations/orp_qbnr_q52_service_change_2025.json",
    proposal_id: "orp_qbnr_q52_service_change_2025",
    sha256: "69072df89b6d83016c008069066b6524d0b836dc38552d4c098006a783c25357",
    unit_count: 1,
  },
] as const;

const renameEventsWithoutDiagnosticGaps = new Set([
  "event_qm63-qbnr-rename-2025-06-30",
  "event_qm64-qbnr-rename-2025-06-30",
  "event_qm68-qbnr-rename-2025-06-30",
]);

type ProposalEvidenceBinding = {
  role: string;
  source_id: string;
  evidence_id: string;
};

type ProposalObservation = {
  observation_kind: string;
  local_observation_id: string;
  label: string;
  expected_record_id: string;
  target_record_id?: string | undefined;
  payload: Record<string, JsonValue>;
  evidence_bindings: ProposalEvidenceBinding[];
};

type ProposalRelation = {
  local_observation_id: string;
  relation_kind: string;
  evidence_bindings: ProposalEvidenceBinding[];
};

type AppliedProposal = {
  proposal_id: string;
  proposal_kind: string;
  source_id: string;
  review_state: string;
  observations: ProposalObservation[];
  relations: ProposalRelation[];
};

type CoverageGap = {
  gap_id: string;
  event_record_id: string;
  dimension: string;
  verdict: string;
};

type PromotionUnit = {
  proposalId: string;
  evidenceId: string;
  routeLabel: string;
  routeRecord: MtaCanonicalRecord;
  eventRecord: MtaCanonicalRecord;
  treatmentRecords: MtaCanonicalRecord[];
  relationRecords: MtaCanonicalRecord[];
  gtfsRouteId: string;
  onsetDate: string;
  decision: OperationalOccurrenceAcceptedDecision;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function payloadString(record: MtaCanonicalRecord, field: string): string {
  return requiredString(record.payload[field], `${record.record_id}.payload.${field}`);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
}

function recordHasLocalId(record: MtaCanonicalRecord, localId: string): boolean {
  return record.local_observation_id === localId || (record.local_observation_ids ?? []).includes(localId);
}

function exactEvidence(record: MtaCanonicalRecord, binding: ProposalEvidenceBinding, expectedRole?: string): void {
  const match = record.evidence_refs.some(
    (ref) =>
      ref.source_id === binding.source_id &&
      ref.evidence_id === binding.evidence_id &&
      (expectedRole === undefined || ref.role === expectedRole),
  );
  if (!match) {
    throw new Error(
      `${record.record_id} lacks exact ${expectedRole ?? "source"} evidence ${binding.source_id}#${binding.evidence_id}`,
    );
  }
  if (record.truth_status !== "source_stated" || record.review_state === "quarantined") {
    throw new Error(`${record.record_id} is not source_stated and non-quarantined`);
  }
}

function oneBinding(
  bindings: readonly ProposalEvidenceBinding[],
  role: string,
  path: string,
): ProposalEvidenceBinding {
  const matches = bindings.filter((binding) => binding.role === role);
  if (matches.length !== 1) throw new Error(`${path} must have exactly one ${role} binding; found ${matches.length}`);
  const binding = matches[0]!;
  if (binding.source_id !== SOURCE_ID) throw new Error(`${path} has unexpected source ${binding.source_id}`);
  return binding;
}

function unitEvidenceId(bindings: readonly ProposalEvidenceBinding[], path: string): string {
  const evidenceIds = unique(bindings.map((binding) => binding.evidence_id));
  if (evidenceIds.length !== 1) throw new Error(`${path} must bind exactly one source block; found ${evidenceIds.length}`);
  return evidenceIds[0]!;
}

function acceptedBinding(
  role: OperationalOccurrenceEvidenceBinding["role"],
  record: MtaCanonicalRecord,
  sourceBinding: ProposalEvidenceBinding,
): OperationalOccurrenceEvidenceBinding {
  exactEvidence(record, sourceBinding, sourceBinding.role);
  return {
    role,
    record_id: record.record_id,
    source_id: sourceBinding.source_id,
    evidence_id: sourceBinding.evidence_id,
  };
}

function readProposals(): AppliedProposal[] {
  return proposalSpecs.map((spec) => {
    const path = join(repoRoot, spec.path);
    const bytes = readFileSync(path);
    if (sha256(bytes) !== spec.sha256) throw new Error(`${spec.path} no longer matches its reviewed SHA-256`);
    const proposal = JSON.parse(bytes.toString("utf8")) as AppliedProposal;
    if (
      proposal.proposal_id !== spec.proposal_id ||
      proposal.proposal_kind !== "observation_bundle" ||
      proposal.source_id !== SOURCE_ID ||
      proposal.review_state !== "accepted"
    ) {
      throw new Error(`${spec.path} is not the expected accepted QBNR observation proposal`);
    }
    const unitIds = unique(
      proposal.observations.map((observation) => unitEvidenceId(observation.evidence_bindings, observation.local_observation_id)),
    );
    if (unitIds.length !== spec.unit_count) {
      throw new Error(`${spec.proposal_id} has ${unitIds.length} evidence units; expected ${spec.unit_count}`);
    }
    return proposal;
  });
}

function canonicalLocalIndex(records: readonly MtaCanonicalRecord[]): Map<string, MtaCanonicalRecord> {
  const index = new Map<string, MtaCanonicalRecord>();
  for (const record of records) {
    for (const localId of unique([record.local_observation_id, ...(record.local_observation_ids ?? [])].filter(Boolean))) {
      const key = `${SOURCE_ID}\0${localId}`;
      if (!record.source_ids.includes(SOURCE_ID) && record.source_id !== SOURCE_ID) continue;
      const existing = index.get(key);
      if (existing && existing.record_id !== record.record_id) {
        throw new Error(`QBNR local id ${localId} resolves to both ${existing.record_id} and ${record.record_id}`);
      }
      index.set(key, record);
    }
  }
  return index;
}

function canonicalRecord(
  index: ReadonlyMap<string, MtaCanonicalRecord>,
  localId: string,
  expectedKind: string,
  expectedRecordId?: string,
): MtaCanonicalRecord {
  const record = index.get(`${SOURCE_ID}\0${localId}`);
  if (!record) throw new Error(`No canonical QBNR record resolves ${localId}`);
  if (!recordHasLocalId(record, localId) || record.record_kind !== expectedKind) {
    throw new Error(`${localId} resolved to unexpected canonical record ${record.record_id}/${record.record_kind}`);
  }
  if (expectedRecordId && record.record_id !== expectedRecordId) {
    throw new Error(`${localId} resolved to ${record.record_id}; expected ${expectedRecordId}`);
  }
  return record;
}

function proposalBinding(observation: ProposalObservation, role: string): ProposalEvidenceBinding {
  return oneBinding(observation.evidence_bindings, role, observation.local_observation_id);
}

function relationBinding(relation: ProposalRelation, role: string): ProposalEvidenceBinding {
  return oneBinding(relation.evidence_bindings, role, relation.local_observation_id);
}

function relationObjectId(record: MtaCanonicalRecord): string {
  return payloadString(record, "object_id");
}

function findRelation(
  relations: readonly { proposal: ProposalRelation; record: MtaCanonicalRecord }[],
  kind: string,
  objectId: string,
  path: string,
): { proposal: ProposalRelation; record: MtaCanonicalRecord } {
  const matches = relations.filter(
    ({ proposal, record }) => proposal.relation_kind === kind && relationObjectId(record) === objectId,
  );
  if (matches.length !== 1) throw new Error(`${path} must have one ${kind} relation to ${objectId}; found ${matches.length}`);
  return matches[0]!;
}

function routeAnchors(): RouteAnchorRow[] {
  const bytes = readFileSync(join(repoRoot, ROUTE_ANCHOR_PATH));
  if (sha256(bytes) !== ROUTE_ANCHOR_SHA256) throw new Error(`${ROUTE_ANCHOR_PATH} does not match the immutable rc8 pin`);
  return bytes
    .toString("utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as RouteAnchorRow);
}

function promotionUnits(
  proposals: readonly AppliedProposal[],
  records: readonly MtaCanonicalRecord[],
  anchors: readonly RouteAnchorRow[],
): PromotionUnit[] {
  const index = canonicalLocalIndex(records);
  const units: PromotionUnit[] = [];
  for (const proposal of proposals) {
    const observationsByEvidence = new Map<string, ProposalObservation[]>();
    const relationsByEvidence = new Map<string, ProposalRelation[]>();
    for (const observation of proposal.observations) {
      const evidenceId = unitEvidenceId(observation.evidence_bindings, observation.local_observation_id);
      observationsByEvidence.set(evidenceId, [...(observationsByEvidence.get(evidenceId) ?? []), observation]);
    }
    for (const relation of proposal.relations) {
      const evidenceId = unitEvidenceId(relation.evidence_bindings, relation.local_observation_id);
      relationsByEvidence.set(evidenceId, [...(relationsByEvidence.get(evidenceId) ?? []), relation]);
    }
    if (observationsByEvidence.size !== relationsByEvidence.size) {
      throw new Error(`${proposal.proposal_id} observation/relation evidence-unit counts differ`);
    }
    for (const [evidenceId, observations] of observationsByEvidence) {
      const routeObservations = observations.filter((row) => row.observation_kind === "route");
      const eventObservations = observations.filter((row) => row.observation_kind === "event");
      const treatmentObservations = observations.filter((row) => row.observation_kind === "treatment_component");
      if (routeObservations.length !== 1 || eventObservations.length !== 1 || treatmentObservations.length < 1) {
        throw new Error(
          `${proposal.proposal_id}/${evidenceId} needs one route, one event, and treatments; found ` +
            `${routeObservations.length}/${eventObservations.length}/${treatmentObservations.length}`,
        );
      }
      const routeObservation = routeObservations[0]!;
      const eventObservation = eventObservations[0]!;
      const routeRecord = canonicalRecord(
        index,
        routeObservation.local_observation_id,
        "route",
        routeObservation.target_record_id ?? routeObservation.expected_record_id,
      );
      const eventRecord = canonicalRecord(
        index,
        eventObservation.local_observation_id,
        "event",
        eventObservation.expected_record_id,
      );
      const treatmentRecords = treatmentObservations.map((observation) =>
        canonicalRecord(index, observation.local_observation_id, "treatment_component", observation.expected_record_id),
      );
      const proposedRelations = relationsByEvidence.get(evidenceId);
      if (!proposedRelations) throw new Error(`${proposal.proposal_id}/${evidenceId} has no relations`);
      const relations = proposedRelations.map((row) => ({
        proposal: row,
        record: canonicalRecord(index, row.local_observation_id, "relation"),
      }));
      const routeRelation = findRelation(relations, "affects_route", routeRecord.record_id, evidenceId);
      const timelineRelation = findRelation(relations, "has_timeline_event", eventRecord.record_id, evidenceId);
      const treatmentRelations = treatmentRecords.map((record) =>
        findRelation(relations, "has_treatment", record.record_id, evidenceId),
      );
      if (relations.length !== 2 + treatmentRecords.length) {
        throw new Error(`${proposal.proposal_id}/${evidenceId} has unrelated relation records`);
      }
      const gtfsRouteId = requiredString(routeObservation.payload.gtfs_route_id, `${routeObservation.local_observation_id}.gtfs_route_id`);
      const matchingAnchors = anchors.filter(
        (anchor) =>
          anchor.gtfs_route_id === gtfsRouteId &&
          (anchor.canonical_route_record_id === routeRecord.record_id || anchor.variant_record_ids.includes(routeRecord.record_id)),
      );
      if (matchingAnchors.length !== 1 || matchingAnchors[0]!.disposition !== "true_route") {
        throw new Error(`${routeRecord.record_id} is not the unique rc8 true-route anchor for ${gtfsRouteId}`);
      }
      const onsetDate = payloadString(eventRecord, "date_normalized");
      if (payloadString(eventRecord, "date_precision") !== "day") {
        throw new Error(`${eventRecord.record_id} is not day-precise`);
      }
      const routeLabel = requiredString(routeObservation.label, `${routeObservation.local_observation_id}.label`);
      const decisionId = `${slug(routeLabel)}-route-redesign-${onsetDate}`;
      const foundingKey = `event:${eventRecord.record_id}`;
      const occurrenceId = deterministicOperationalOccurrenceId(foundingKey);
      const members = treatmentRecords
        .map((record) => {
          const observation = treatmentObservations.find((candidate) => candidate.expected_record_id === record.record_id);
          if (!observation) throw new Error(`${record.record_id} lost its proposal observation`);
          const scopeRelation = treatmentRelations.find((candidate) => relationObjectId(candidate.record) === record.record_id);
          if (!scopeRelation) throw new Error(`${record.record_id} lost its scope relation`);
          return {
            treatment_record_id: record.record_id,
            treatment_family: payloadString(record, "treatment_family"),
            evidence_bindings: [
              acceptedBinding("treatment_definition", record, proposalBinding(observation, "treatment_definition")),
              acceptedBinding("treatment_scope", scopeRelation.record, relationBinding(scopeRelation.proposal, "treatment_scope")),
            ],
          };
        })
        .sort((left, right) => left.treatment_record_id.localeCompare(right.treatment_record_id));
      let treatment: OperationalOccurrenceAcceptedTreatment;
      if (members.length === 1) {
        treatment = { kind: "atomic", member: members[0]! };
      } else {
        const projectRecord = records.find((record) => record.record_id === PROJECT_ID);
        if (!projectRecord) throw new Error(`Missing ${PROJECT_ID}`);
        const contextRef = projectRecord.evidence_refs.find(
          (ref) => ref.source_id === SOURCE_ID && ref.evidence_id === PROJECT_CONTEXT_EVIDENCE_ID,
        );
        if (!contextRef) throw new Error(`${PROJECT_ID} lacks exact QBNR project-context evidence`);
        treatment = {
          kind: "bundle",
          analysis_family: "route_redesign",
          analysis_family_evidence_bindings: [
            {
              role: "bundle_analysis_family",
              record_id: PROJECT_ID,
              source_id: SOURCE_ID,
              evidence_id: PROJECT_CONTEXT_EVIDENCE_ID,
            },
          ],
          members,
        };
      }
      const rationale =
        members.length === 1
          ? `The official MTA ${routeLabel} row binds a realized ${onsetDate} onset, the ${gtfsRouteId} route, and one canonical ${members[0]!.treatment_family} treatment in the same exact source block. This occurrence preserves the literal treatment family and does not inherit project-wide route or treatment scope.`
          : `The official MTA ${routeLabel} row binds a realized ${onsetDate} onset, the ${gtfsRouteId} route, and ${members.length} canonical treatment members in the same exact source block. The reviewed route_redesign analysis family groups only those source-stated members and does not inherit project-wide route or treatment scope.`;
      const decision = parseOperationalOccurrenceAcceptedDecision(
        {
          schema_version: 1,
          decision_id: decisionId,
          review_state: "approved",
          accepted_at: ACCEPTED_AT,
          reviewer: REVIEWER,
          rationale,
          occurrence_id: occurrenceId,
          founding_key: foundingKey,
          observation_event_record_ids: [eventRecord.record_id],
          observation_relation_record_ids: relations.map(({ record }) => record.record_id).sort(),
          resolved_status: "realized",
          resolved_onset: {
            date: onsetDate,
            precision: "day",
            evidence_bindings: [
              acceptedBinding("event_date", eventRecord, proposalBinding(eventObservation, "event_date")),
              acceptedBinding(
                "timeline_relation",
                timelineRelation.record,
                relationBinding(timelineRelation.proposal, "timeline_relation"),
              ),
            ],
          },
          routes: [
            {
              route_record_id: routeRecord.record_id,
              gtfs_route_id: gtfsRouteId,
              evidence_bindings: [
                acceptedBinding("route_identity", routeRecord, proposalBinding(routeObservation, "route_identity")),
                acceptedBinding("route_scope", routeRelation.record, relationBinding(routeRelation.proposal, "route_scope")),
              ],
            },
          ],
          treatment_scope_kind: treatment.kind,
          treatment,
        },
        decisionId,
      );
      units.push({
        proposalId: proposal.proposal_id,
        evidenceId,
        routeLabel,
        routeRecord,
        eventRecord,
        treatmentRecords,
        relationRecords: relations.map(({ record }) => record),
        gtfsRouteId,
        onsetDate,
        decision,
      });
    }
  }
  units.sort((left, right) => left.decision.decision_id.localeCompare(right.decision.decision_id));
  if (units.length !== PROMOTED_OCCURRENCE_COUNT) {
    throw new Error(`Generated ${units.length} promotion units; expected ${PROMOTED_OCCURRENCE_COUNT}`);
  }
  for (const field of [
    ["decision_id", units.map((unit) => unit.decision.decision_id)],
    ["occurrence_id", units.map((unit) => unit.decision.occurrence_id)],
    ["event_record_id", units.map((unit) => unit.eventRecord.record_id)],
    ["route_label", units.map((unit) => unit.routeLabel)],
  ] as const) {
    if (unique(field[1]).length !== units.length) throw new Error(`Promotion units repeat ${field[0]}`);
  }
  return units;
}

function identityRegistry(units: readonly PromotionUnit[]): OperationalOccurrenceIdentityEntry[] {
  const existing = loadOperationalOccurrenceIdentityRegistry();
  const generated = units.map((unit) =>
    newOperationalOccurrenceIdentityEntry({
      foundingKey: unit.decision.founding_key,
      foundingEventRecordIds: [unit.eventRecord.record_id],
      decisionId: unit.decision.decision_id,
      issuedAt: ACCEPTED_AT,
    }),
  );
  const merged = [...existing];
  for (const entry of generated) {
    const matches = existing.filter(
      (candidate) =>
        candidate.occurrence_id === entry.occurrence_id || candidate.founding_key === entry.founding_key,
    );
    if (matches.length > 1) {
      throw new Error(`Existing identity registry has conflicting owners for ${entry.founding_key}`);
    }
    if (matches.length === 1) {
      if (stableJson(matches[0]! as unknown as JsonValue) !== stableJson(entry as unknown as JsonValue)) {
        throw new Error(`Refusing to replace non-equivalent existing identity ${matches[0]!.occurrence_id}`);
      }
      continue;
    }
    merged.push(entry);
  }
  return assertOperationalOccurrenceIdentityRegistry(merged);
}

function assertPromotionInventory(units: readonly PromotionUnit[]): void {
  const countBy = (values: readonly string[]): Record<string, number> =>
    Object.fromEntries(
      [...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]),
    );
  const expectedFamilies = { bus_stop_or_boarding: 55, fare_collection: 1, service_pattern: 60 };
  const expectedDates = { "2025-06-29": 26, "2025-06-30": 16, "2025-08-31": 10 };
  const families = units.flatMap((unit) =>
    unit.treatmentRecords.map((record) => payloadString(record, "treatment_family")),
  );
  const relationIds = units.flatMap((unit) => unit.relationRecords.map((record) => record.record_id));
  const atomic = units.filter((unit) => unit.decision.treatment.kind === "atomic").length;
  if (atomic !== 15 || units.length - atomic !== 37) throw new Error("QBNR atomic/bundle inventory drifted");
  if (families.length !== 116 || JSON.stringify(countBy(families)) !== JSON.stringify(expectedFamilies)) {
    throw new Error(`QBNR treatment-family inventory drifted: ${JSON.stringify(countBy(families))}`);
  }
  if (relationIds.length !== 220 || unique(relationIds).length !== relationIds.length) {
    throw new Error("QBNR relation inventory is not exactly 220 unique canonical records");
  }
  if (JSON.stringify(countBy(units.map((unit) => unit.onsetDate))) !== JSON.stringify(expectedDates)) {
    throw new Error(`QBNR onset-date inventory drifted: ${JSON.stringify(countBy(units.map((unit) => unit.onsetDate)))}`);
  }
}

function coverageGaps(): CoverageGap[] {
  const manifest = JSON.parse(
    readFileSync(join(repoRoot, "data", "quality", "operational-coverage", "manifest.json"), "utf8"),
  ) as Record<string, unknown>;
  if (
    manifest.route_anchor_path !== ROUTE_ANCHOR_PATH ||
    manifest.route_anchor_release_id !== "v1-rc8" ||
    manifest.route_anchor_sha256 !== ROUTE_ANCHOR_SHA256
  ) {
    throw new Error("Operational coverage gaps are not pinned to the immutable rc8 route anchors");
  }
  const files = manifest.files;
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error("Operational coverage manifest has no addressed files");
  }
  const metadata = (files as Record<string, unknown>)["recoverability-ledger.jsonl"];
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Operational coverage manifest does not address recoverability-ledger.jsonl");
  }
  const ledgerPath = "data/quality/operational-coverage/recoverability-ledger.jsonl";
  const ledgerBytes = readFileSync(join(repoRoot, ledgerPath));
  const addressed = metadata as Record<string, unknown>;
  if (addressed.bytes !== ledgerBytes.length || addressed.sha256 !== sha256(ledgerBytes)) {
    throw new Error("Operational coverage ledger bytes do not match the rc8-pinned manifest");
  }
  const values = ledgerBytes
    .toString("utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(`${ledgerPath}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  if (addressed.row_count !== values.length) {
    throw new Error("Operational coverage ledger row count does not match the rc8-pinned manifest");
  }
  return values.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`coverage gap ${index} is not an object`);
    }
    const row = value as Record<string, unknown>;
    return {
      gap_id: requiredString(row.gap_id, `coverage gap ${index}.gap_id`),
      event_record_id: requiredString(row.event_record_id, `coverage gap ${index}.event_record_id`),
      dimension: requiredString(row.dimension, `coverage gap ${index}.dimension`),
      verdict: requiredString(row.verdict, `coverage gap ${index}.verdict`),
    };
  });
}

function ledgerDecisions(units: readonly PromotionUnit[]): OperationalCoverageAcceptedDecision[] {
  const gaps = coverageGaps();
  const decisions: OperationalCoverageAcceptedDecision[] = [];
  for (const unit of units) {
    const matching = gaps.filter((gap) => gap.event_record_id === unit.eventRecord.record_id);
    const expectedCount = renameEventsWithoutDiagnosticGaps.has(unit.eventRecord.record_id) ? 0 : 2;
    if (matching.length !== expectedCount) {
      throw new Error(`${unit.eventRecord.record_id} has ${matching.length} diagnostic gaps; expected ${expectedCount}`);
    }
    if (expectedCount === 0) continue;
    for (const dimension of ["route", "treatment"] as const) {
      const dimensionGaps = matching.filter((gap) => gap.dimension === dimension);
      if (dimensionGaps.length !== 1 || !new Set(["unreviewed", "not_applicable"]).has(dimensionGaps[0]!.verdict)) {
        throw new Error(`${unit.eventRecord.record_id} has an invalid ${dimension} diagnostic gap`);
      }
      const gap = dimensionGaps[0]!;
      const rationale =
        dimension === "route"
          ? `The broad inherited Queens redesign graph is intentionally multi-route and is not a safe route-level study projection. Approved occurrence ${unit.decision.occurrence_id} binds this event only to ${unit.routeLabel} using official same-block route identity and scope evidence, so further recovery of the broad diagnostic route gap is not applicable.`
          : `The broad inherited Queens redesign graph contains treatment candidates from several routes and is not a safe treatment-level study projection. Approved occurrence ${unit.decision.occurrence_id} binds this event only to ${unit.treatmentRecords.length} canonical ${unit.routeLabel} treatment member${unit.treatmentRecords.length === 1 ? "" : "s"} using official same-block evidence, so further recovery of the broad diagnostic treatment gap is not applicable.`;
      const decision = parseOperationalCoverageAcceptedDecision(
          {
            schema_version: 1,
            decision_id: `${slug(unit.routeLabel)}-${dimension}-gap-superseded-by-approved-occurrence`,
            gap_id: gap.gap_id,
            prior_verdict: "unreviewed",
            verdict: "not_applicable",
            reviewer: REVIEWER,
            decided_at: DECIDED_AT,
            rationale,
            proposal_ids: [unit.proposalId],
            evidence_refs: [],
            search_receipt_ids: [],
          },
          `${unit.routeLabel}/${dimension}`,
        );
      if (gap.verdict === "not_applicable") {
        const existingPath = join(
          repoRoot,
          "data",
          "operational-anchor-review",
          "ledger-decisions",
          "decisions",
          `${decision.decision_id}.json`,
        );
        const expectedBytes = `${JSON.stringify(decision, null, 2)}\n`;
        if (!existsSync(existingPath) || readFileSync(existingPath, "utf8") !== expectedBytes) {
          throw new Error(`${gap.gap_id} is already not_applicable without the exact generated decision`);
        }
      }
      decisions.push(decision);
    }
  }
  decisions.sort((left, right) => left.decision_id.localeCompare(right.decision_id));
  if (decisions.length !== EXPECTED_LEDGER_DECISION_COUNT) {
    throw new Error(`Generated ${decisions.length} ledger decisions; expected ${EXPECTED_LEDGER_DECISION_COUNT}`);
  }
  return decisions;
}

function validateOccurrenceProjection(
  units: readonly PromotionUnit[],
  records: readonly MtaCanonicalRecord[],
  anchors: readonly RouteAnchorRow[],
  identities: readonly OperationalOccurrenceIdentityEntry[],
): void {
  const targetDecisionIds = new Set(units.map((unit) => unit.decision.decision_id));
  const existingReviews = loadOperationalOccurrenceAcceptedDecisions().filter(
    (decision) => !targetDecisionIds.has(decision.decision_id),
  );
  const anchorReviews = loadOperationalAnchorReviewDecisions();
  const targetIdentityIds = new Set(units.map((unit) => unit.decision.occurrence_id));
  const baselineIdentities = identities.filter((entry) => !targetIdentityIds.has(entry.occurrence_id));
  const baseline = computeOperationalOccurrences(records, anchors, {
    reviewDecisions: anchorReviews,
    occurrenceReviewDecisions: existingReviews,
    identityRegistry: baselineIdentities,
  });
  if (baseline.length !== BASELINE_OCCURRENCE_COUNT) {
    throw new Error(`Promotion baseline has ${baseline.length} occurrences; expected ${BASELINE_OCCURRENCE_COUNT}`);
  }
  const rows = computeOperationalOccurrences(records, anchors, {
    reviewDecisions: anchorReviews,
    occurrenceReviewDecisions: [...existingReviews, ...units.map((unit) => unit.decision)],
    identityRegistry: identities,
  });
  if (rows.length !== EXPECTED_TOTAL_OCCURRENCE_COUNT) {
    throw new Error(`Promotion produced ${rows.length} occurrences; expected ${EXPECTED_TOTAL_OCCURRENCE_COUNT}`);
  }
  const rowsById = new Map(rows.map((row) => [row.occurrence_id, row]));
  for (const unit of units) {
    const row = rowsById.get(unit.decision.occurrence_id);
    if (!row || !row.study_projection_eligible || row.routes.length !== 1) {
      throw new Error(`${unit.decision.occurrence_id} did not produce one eligible route projection`);
    }
    if (
      row.routes[0]!.route_record_id !== unit.routeRecord.record_id ||
      row.routes[0]!.gtfs_route_id !== unit.gtfsRouteId
    ) {
      throw new Error(`${unit.decision.occurrence_id} projected the wrong route`);
    }
  }
}

function writeArtifacts(
  units: readonly PromotionUnit[],
  identities: readonly OperationalOccurrenceIdentityEntry[],
  gapDecisions: readonly OperationalCoverageAcceptedDecision[],
): void {
  const occurrenceDir = join(repoRoot, "data", "operational-occurrence-review", "accepted", "decisions");
  const ledgerDir = join(repoRoot, "data", "operational-anchor-review", "ledger-decisions", "decisions");
  const artifacts = new Map<string, string>();
  const addArtifact = (path: string, bytes: string): void => {
    if (artifacts.has(path)) throw new Error(`Promotion generated duplicate destination ${path}`);
    artifacts.set(path, bytes);
  };
  for (const unit of units) {
    addArtifact(
      join(occurrenceDir, `${unit.decision.decision_id}.json`),
      `${JSON.stringify(unit.decision, null, 2)}\n`,
    );
  }
  for (const decision of gapDecisions) {
    addArtifact(join(ledgerDir, `${decision.decision_id}.json`), `${JSON.stringify(decision, null, 2)}\n`);
  }
  for (const [path, bytes] of artifacts) {
    if (existsSync(path)) {
      const existing = readFileSync(path, "utf8");
      if (existing !== bytes) throw new Error(`Refusing to overwrite non-equivalent reviewed artifact ${path}`);
    }
  }
  mkdirSync(occurrenceDir, { recursive: true });
  mkdirSync(ledgerDir, { recursive: true });
  for (const [path, bytes] of artifacts) {
    if (existsSync(path)) continue;
    writeFileSync(path, bytes, "utf8");
  }
  const registryBytes = identities.map((entry) => stableJson(entry as unknown as JsonValue)).join("\n") + "\n";
  writeFileSync(
    join(repoRoot, "data", "operational-occurrence-identities", "registry.jsonl"),
    registryBytes,
    "utf8",
  );
}

const apply = process.argv.includes("--apply");
const records = readCanonicalRecordsFromJsonl();
const anchors = routeAnchors();
const proposals = readProposals();
const units = promotionUnits(proposals, records, anchors);
assertPromotionInventory(units);
const identities = identityRegistry(units);
const gapDecisions = ledgerDecisions(units);
validateOccurrenceProjection(units, records, anchors, identities);

if (apply) writeArtifacts(units, identities, gapDecisions);

const atomicCount = units.filter((unit) => unit.decision.treatment.kind === "atomic").length;
const summary = {
  mode: apply ? "applied" : "dry-run",
  proposal_files: proposalSpecs.map((spec) => basename(spec.path)),
  occurrence_decisions: units.length,
  atomic_occurrences: atomicCount,
  bundle_occurrences: units.length - atomicCount,
  identity_registry_rows: identities.length,
  ledger_decisions: gapDecisions.length,
  rename_occurrences_without_diagnostic_gaps: units
    .filter((unit) => renameEventsWithoutDiagnosticGaps.has(unit.eventRecord.record_id))
    .map((unit) => unit.routeLabel),
  projected_occurrence_count: EXPECTED_TOTAL_OCCURRENCE_COUNT,
  rc8_route_anchor_sha256: ROUTE_ANCHOR_SHA256,
};
console.log(JSON.stringify(summary, null, 2));
