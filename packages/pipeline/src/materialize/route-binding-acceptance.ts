import { createHash } from "node:crypto";

import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";

import type {
  IdentityScope,
  RecordTemporalScope,
  RouteBindingDecisionKind,
  RouteBindingIneligibilityReason,
  RouteBindingReviewedAxis,
  RouteInventoryRow,
  RouteRecordBinding,
  ServiceClass,
} from "./route-identity-contract.js";
export {
  ROUTE_BINDING_DECISION_KINDS,
  ROUTE_BINDING_INELIGIBILITY_REASONS,
  ROUTE_BINDING_REVIEWED_AXES,
} from "./route-identity-contract.js";
export type {
  RouteBindingDecisionKind,
  RouteBindingIneligibilityReason,
  RouteBindingReviewedAxis,
} from "./route-identity-contract.js";
import {
  buildRouteIdentityAudit,
  routeIdentityAuditBytes,
  type RouteBindingProposal,
  type RouteIdentityAudit,
} from "./route-identities.js";

export const ROUTE_BINDING_ACCEPTANCE_SCHEMA_VERSION = 1 as const;
export const ROUTE_BINDING_ACCEPTANCE_CONTRACT_ID = "route-binding-acceptance-v1" as const;
export const ROUTE_BINDING_DECISION_CONTRACT_ID = "route-binding-decision-v1" as const;
export const ROUTE_BINDING_PROJECTION_INPUT_CONTRACT_ID = "route-binding-projection-input-v1" as const;

export type LegacyRouteCompletenessRow = {
  route_record_id: string;
  gtfs_route_id: string | null;
  primary_disposition:
    | "canonical_gtfs_anchor"
    | "canonical_gtfs_variant"
    | "reviewed_non_projectable_disposition";
  reviewed_non_projectable_disposition: string | null;
  disposition_decision_id: string | null;
  disposition_evidence_ids: string[];
  disposition_reason: string | null;
};

export type LegacyNonGtfsDisposition = {
  decision_id: string;
  evidence_ids: string[];
  reviewed_at: string;
  review_state: "approved";
  disposition: string;
  reason: string;
  expected_route_id: string | null;
  study_projectable: false;
};

export type LegacyRouteReview = {
  schema_version: 1;
  contract_id: "route-identity-dispositions-v1";
  non_gtfs_dispositions: Record<string, LegacyNonGtfsDisposition>;
};

export type AcceptedArtifactMetadata = {
  path: string;
  sha256: string;
  bytes: number;
  rows: number;
};

export type AcceptedRouteBindingDecisionV1 = RouteRecordBinding & {
  schema_version: 1;
  contract_id: typeof ROUTE_BINDING_DECISION_CONTRACT_ID;
  decision_id: string;
  snapshot_id: string;
  proposal_sha256: string;
  identity_basis: "deterministic_exact" | "reviewed_exact_mapping" | "reviewed_nonidentity_disposition";
  expected_gtfs_identity_fingerprint: string | null;
  decision_kind: RouteBindingDecisionKind;
  legacy_disposition: string | null;
  supersedes_decision_id: string | null;
  reviewed_axes: RouteBindingReviewedAxis[];
  presentation_primary: boolean;
  ineligibility_reasons: RouteBindingIneligibilityReason[];
  accepted_by: string;
  accepted_at: string;
  rationale: string;
};

export type AcceptedRouteBindingProjectionRowV1 = RouteRecordBinding & {
  schema_version: 1;
  contract_id: typeof ROUTE_BINDING_PROJECTION_INPUT_CONTRACT_ID;
  decision_id: string | null;
  identity_basis: AcceptedRouteBindingDecisionV1["identity_basis"];
  expected_gtfs_identity_fingerprint: string | null;
  decision_kind: RouteBindingDecisionKind;
  ineligibility_reasons: RouteBindingIneligibilityReason[];
};

export type RouteBindingAcceptanceV1 = {
  schema_version: 1;
  contract_id: typeof ROUTE_BINDING_ACCEPTANCE_CONTRACT_ID;
  snapshot_id: string;
  snapshot_manifest_sha256: string;
  proposal: AcceptedArtifactMetadata;
  legacy_route_completeness: AcceptedArtifactMetadata;
  legacy_route_review: AcceptedArtifactMetadata;
  decisions: AcceptedArtifactMetadata;
  projection_input: AcceptedArtifactMetadata;
  decision_set_sha256: string;
  accepted_by: string;
  accepted_at: string;
  rationale: string;
  acceptance_scope: "owner_approved_complete_route_adjudication_v1";
  route_record_count: number;
  exact_binding_count: number;
  projectable_count: number;
  historical_description_count: number;
  family_or_aggregate_count: number;
  current_ineligible_count: number;
  status: "accepted";
};

export type BuiltRouteBindingAcceptance = {
  acceptance: RouteBindingAcceptanceV1;
  acceptanceBytes: string;
  decisions: AcceptedRouteBindingDecisionV1[];
  decisionsBytes: string;
  projectionInput: AcceptedRouteBindingProjectionRowV1[];
  projectionInputBytes: string;
};

type RouteAdjudicationOverride = {
  targetGtfsRouteId?: string | null;
  decisionKind: RouteBindingDecisionKind;
  serviceClass?: ServiceClass;
  identityScope?: IdentityScope;
  legacyDisposition?: string;
  rationale: string;
};

const SHA256 = /^[0-9a-f]{64}$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

// These are narrow reviewed exceptions where rc23 collapsed base/plus identity,
// selected a predecessor as primary, or projected an aggregate as a variant.
const ROUTE_ADJUDICATION_OVERRIDES_V1: Readonly<Record<string, RouteAdjudicationOverride>> = {
  "route_b44-brt-phase2": { decisionKind: "historical_description", rationale: "The phase-2 B44 planning record remains an exact B44 historical description; route_b44-local is the reviewed current base presentation." },
  "route_b44-limited": { decisionKind: "historical_description", rationale: "Official evidence describes predecessor B44 Limited service; it cannot project as current B44 local or B44+ SBS." },
  "route_b44-local": { decisionKind: "current_primary", targetGtfsRouteId: "B44", rationale: "Official local-service evidence and the pinned snapshot support exact B44 as the current base-service presentation." },
  "route_b44-sbs": { decisionKind: "current_primary", targetGtfsRouteId: "B44+", rationale: "The authoritative internal route id and pinned snapshot support exact B44+; B44 is a distinct local identity." },
  "route_b46-local-2012": { decisionKind: "current_primary", targetGtfsRouteId: "B46", rationale: "The B46 local record is the reviewed current base-service presentation for exact B46." },
  "route_b46-local-limited-20110915": { decisionKind: "historical_description", targetGtfsRouteId: "B46", rationale: "The dated pre-SBS B46 description is historical and cannot compete with current B46 or B46+." },
  "route_b82-limited-brt-south-brooklyn-2017": { decisionKind: "historical_description", targetGtfsRouteId: "B82", rationale: "The record describes predecessor B82 Limited service converted to SBS." },
  "route_b82-local": { decisionKind: "current_primary", targetGtfsRouteId: "B82", rationale: "Official local-service evidence supports exact B82 as the current base presentation." },
  "route_b82-sbs": { decisionKind: "current_primary", targetGtfsRouteId: "B82+", rationale: "The authoritative internal route id supports exact B82+; B82 remains a distinct local identity." },
  "route_bx15-ltd-webster-2012": { decisionKind: "future_description", targetGtfsRouteId: "BX15", serviceClass: "proposal", rationale: "The source describes proposed limited-stop Bx15 service; existence of current BX15 does not make that proposal current." },
  "route_bx41-limited-2012": { decisionKind: "historical_description", targetGtfsRouteId: "BX41", rationale: "The predecessor Bx41 Limited record is historical after separate BX41+ SBS became current." },
  "route_bx41-local-2012-02-brt-webster-cac1": { decisionKind: "current_primary", targetGtfsRouteId: "BX41", rationale: "The reviewed local record is the current presentation for exact BX41." },
  "route_bx6-local": { decisionKind: "current_primary", targetGtfsRouteId: "BX6", rationale: "Official evidence distinguishes Bx6 Local from Bx6 SBS; the local record maps to exact BX6." },
  "route_bx6-sbs": { decisionKind: "current_primary", targetGtfsRouteId: "BX6+", rationale: "Official evidence distinguishes Bx6 SBS from Bx6 Local; the SBS record maps to exact BX6+." },
  "route_m15-limited-2010-06-09": { decisionKind: "historical_description", targetGtfsRouteId: "M15", rationale: "The source states M15 Limited was replaced by M15 SBS, so the dated record remains historical." },
  "route_m15-local-2010-09-14": { decisionKind: "historical_description", targetGtfsRouteId: "M15", rationale: "The dated M15 Local source remains historical; route_m15-local-limited is the reviewed current base presentation." },
  "route_m15-local-limited": { decisionKind: "current_primary", targetGtfsRouteId: "M15", rationale: "The existing reviewed primary remains the minimal current presentation for exact M15." },
  "route_m23-local-cb4-apr2016": { decisionKind: "historical_description", targetGtfsRouteId: "M23+", rationale: "The pre-SBS M23 local description is historical and cannot project as current M23+." },
  "route_m34-local-2011": { decisionKind: "historical_description", targetGtfsRouteId: "M34+", rationale: "The 2011 M34 local description predates current SBS service and remains historical." },
  "route_m34-sbs": { decisionKind: "current_primary", targetGtfsRouteId: "M34+", rationale: "The SBS record is the reviewed current presentation for exact M34+." },
  "route_m79-local-cb8-oct2016": { decisionKind: "historical_description", targetGtfsRouteId: "M79+", rationale: "The pre-launch M79 local description remains historical after SBS launch." },
  "route_m79-sbs": { decisionKind: "current_primary", targetGtfsRouteId: "M79+", rationale: "The launched SBS record is the reviewed current presentation for exact M79+." },
  "route_m86-local": { decisionKind: "historical_description", targetGtfsRouteId: "M86+", rationale: "The predecessor M86 local record remains historical after SBS launch." },
  "route_m86-sbs": { decisionKind: "current_primary", targetGtfsRouteId: "M86+", rationale: "The SBS record is the reviewed current presentation for exact M86+." },
  "route_q44-cb12-2011": { decisionKind: "historical_description", targetGtfsRouteId: "Q44+", rationale: "The dated pre-SBS Q44 local description is historical and cannot project as current Q44+." },
  "route_q52-ltd-woodhaven-2014": { decisionKind: "historical_description", targetGtfsRouteId: "Q52+", rationale: "The Q52 Limited predecessor remains historical after Q52 SBS launch." },
  "route_q52-sbs-queens": { decisionKind: "current_primary", targetGtfsRouteId: "Q52+", rationale: "The explicit canonical gtfs_route_id and launch evidence support exact Q52+ as current." },
  "route_q53-ltd-woodhaven-2014": { decisionKind: "historical_description", targetGtfsRouteId: "Q53+", rationale: "The Q53 Limited predecessor remains historical after Q53 SBS launch." },
  "route_q53-sbs-ace": { decisionKind: "current_primary", targetGtfsRouteId: "Q53+", rationale: "Official SBS evidence and the reviewed exact plus migration support Q53+ as current." },
  "route_s46-s96": { decisionKind: "aggregate_context", targetGtfsRouteId: null, identityScope: "aggregate_context", serviceClass: "not_applicable", legacyDisposition: "aggregate_label", rationale: "The combined S46/S96 record is aggregate context and cannot be a variant of exact S46." },
  "route_s79-hylan-2010": { decisionKind: "historical_description", targetGtfsRouteId: "S79+", rationale: "The predecessor S79 local description remains historical after SBS launch." },
};

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertSha(value: string, path: string): void {
  if (!SHA256.test(value)) throw new Error(path + ": expected lowercase SHA-256");
}

function assertNonempty(value: string, path: string): void {
  if (!value.trim()) throw new Error(path + ": expected non-empty text");
}

function assertIsoInstant(value: string, path: string): void {
  if (!ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(path + ": expected UTC ISO-8601 instant");
  }
}

function assertSortedUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length || values.join("\n") !== [...values].sort().join("\n")) {
    throw new Error(path + ": must be sorted and unique");
  }
}

function jsonlRows<T>(bytes: string, path: string): T[] {
  return bytes.split(/\r?\n/u).flatMap((line, index) => {
    if (!line) return [];
    try {
      return [JSON.parse(line) as T];
    } catch (error) {
      throw new Error(path + ":" + String(index + 1) + ": " + (error instanceof Error ? error.message : String(error)));
    }
  });
}

function jsonlBytes(rows: readonly unknown[]): string {
  return rows.map((row) => stableJson(row as JsonValue)).join("\n") + (rows.length ? "\n" : "");
}

function metadata(path: string, bytes: string, rows: number): AcceptedArtifactMetadata {
  return { path, sha256: sha256(bytes), bytes: Buffer.byteLength(bytes), rows };
}

function evidenceIds(record: MtaCanonicalRecord): string[] {
  return [...new Set(record.evidence_refs.flatMap((ref) => ref.evidence_id ? [ref.evidence_id] : []))].sort();
}

function bindingFromProposal(proposal: RouteBindingProposal): RouteRecordBinding {
  return {
    route_record_id: proposal.route_record_id,
    route_family_id: proposal.route_family_id,
    dataset_id: proposal.dataset_id,
    component_feed_ids: [...proposal.component_feed_ids],
    source_route_id: proposal.source_route_id,
    gtfs_route_id: proposal.gtfs_route_id,
    service_variant: proposal.service_variant,
    identity_scope: proposal.identity_scope,
    service_class: proposal.service_class,
    record_temporal_scope: proposal.record_temporal_scope,
    projectable: proposal.projectable,
    presentation_primary: false,
    derivation: proposal.derivation,
    evidence_ids: [...proposal.evidence_ids],
    canonical_record_fingerprint: proposal.canonical_record_fingerprint,
  };
}

export function routeInventoryFingerprint(row: RouteInventoryRow): string {
  return sha256(stableJson(row as unknown as JsonValue));
}

function parseLegacyCompleteness(bytes: string): LegacyRouteCompletenessRow[] {
  const rows = jsonlRows<LegacyRouteCompletenessRow>(bytes, "legacy route completeness");
  assertSortedUnique(rows.map((row) => row.route_record_id), "legacy route completeness route_record_id");
  return rows;
}

function dispositionClassification(disposition: string): {
  identityScope: IdentityScope;
  serviceClass: ServiceClass;
  temporalScope: RecordTemporalScope;
  decisionKind: RouteBindingDecisionKind;
} {
  switch (disposition) {
    case "aggregate_label": return { identityScope: "aggregate_context", serviceClass: "not_applicable", temporalScope: "not_applicable", decisionKind: "aggregate_context" };
    case "corridor_service_label":
    case "sbs_corridor_service_label": return { identityScope: "route_family_context", serviceClass: "not_applicable", temporalScope: "not_applicable", decisionKind: "route_family_context" };
    case "external_bus_service": return { identityScope: "unresolved", serviceClass: "external", temporalScope: "current_description", decisionKind: "external_service" };
    case "historical_retired":
    case "historical_service_identity": return { identityScope: "unresolved", serviceClass: "regular_mta_bus", temporalScope: "historical_description", decisionKind: "historical_description" };
    case "non_bus_service": return { identityScope: "unresolved", serviceClass: "non_bus", temporalScope: "not_applicable", decisionKind: "non_bus_service" };
    case "proposal": return { identityScope: "unresolved", serviceClass: "proposal", temporalScope: "future_description", decisionKind: "future_description" };
    case "temporary_service": return { identityScope: "unresolved", serviceClass: "temporary", temporalScope: "historical_description", decisionKind: "temporary_service" };
    default: throw new Error("unsupported legacy route disposition " + JSON.stringify(disposition));
  }
}

function temporalScope(kind: RouteBindingDecisionKind): RecordTemporalScope {
  switch (kind) {
    case "current_primary":
    case "current_ineligible":
    case "external_service":
    case "temporary_service": return "current_description";
    case "historical_description": return "historical_description";
    case "future_description": return "future_description";
    case "aggregate_context":
    case "route_family_context":
    case "non_bus_service": return "not_applicable";
  }
}

function eligibilityReasons(binding: RouteRecordBinding, identity: RouteInventoryRow | null): RouteBindingIneligibilityReason[] {
  const reasons: RouteBindingIneligibilityReason[] = [];
  if (binding.identity_scope !== "exact_service" || !identity) reasons.push("identity_not_exact");
  if (binding.service_class !== "regular_mta_bus") reasons.push("service_class_not_regular_mta_bus");
  if (binding.record_temporal_scope !== "current_description") reasons.push("record_not_current");
  if (identity) {
    if (identity.raw_route_type !== "3") reasons.push("raw_route_type_not_3");
    if (identity.catalog_in_effect !== "yes") reasons.push("catalog_not_in_effect");
    if (identity.reliability_status !== "reliable") reasons.push("reliability_not_proven");
    if (identity.scheduled_in_window !== "yes") reasons.push("not_scheduled_in_window");
  }
  return [...new Set(reasons)].sort();
}

function reviewedTarget(
  record: MtaCanonicalRecord,
  proposal: RouteBindingProposal,
  legacy: LegacyRouteCompletenessRow,
  override: RouteAdjudicationOverride | undefined,
  inventoryById: ReadonlyMap<string, RouteInventoryRow>,
): { target: RouteInventoryRow | null; derivation: string; identityBasis: AcceptedRouteBindingDecisionV1["identity_basis"] } {
  const overrideId = override?.targetGtfsRouteId;
  if (overrideId === null) {
    return { target: null, derivation: "reviewed_nonidentity_disposition_v1", identityBasis: "reviewed_nonidentity_disposition" };
  }
  if (typeof overrideId === "string") {
    const target = inventoryById.get(overrideId);
    if (!target) throw new Error(record.record_id + ": reviewed override target absent: " + overrideId);
    const deterministic = proposal.gtfs_route_id === overrideId;
    return { target, derivation: deterministic ? proposal.derivation : "reviewed_exact_route_mapping_v1", identityBasis: deterministic ? "deterministic_exact" : "reviewed_exact_mapping" };
  }
  if (legacy.primary_disposition === "reviewed_non_projectable_disposition") {
    if (proposal.identity_scope === "exact_service" && proposal.gtfs_route_id) {
      const target = inventoryById.get(proposal.gtfs_route_id);
      if (!target) throw new Error(record.record_id + ": proposed historical exact target is absent");
      return { target, derivation: proposal.derivation, identityBasis: "deterministic_exact" };
    }
    return { target: null, derivation: "reviewed_nonidentity_disposition_v1", identityBasis: "reviewed_nonidentity_disposition" };
  }
  if (proposal.identity_scope === "exact_service" && proposal.gtfs_route_id) {
    const target = inventoryById.get(proposal.gtfs_route_id);
    if (!target) throw new Error(record.record_id + ": deterministic exact target is absent");
    return { target, derivation: proposal.derivation, identityBasis: "deterministic_exact" };
  }
  const explicitGtfs = typeof record.payload.gtfs_route_id === "string" ? record.payload.gtfs_route_id : null;
  const targetId = explicitGtfs && inventoryById.has(explicitGtfs) ? explicitGtfs : legacy.gtfs_route_id;
  if (!targetId) throw new Error(record.record_id + ": reviewed legacy binding has no exact target");
  const target = inventoryById.get(targetId);
  if (!target) throw new Error(record.record_id + ": reviewed target absent: " + targetId);
  return {
    target,
    derivation: explicitGtfs === targetId ? "reviewed_explicit_canonical_gtfs_route_id_v1" : "reviewed_exact_route_mapping_v1",
    identityBasis: "reviewed_exact_mapping",
  };
}

function assertKnownFixtures(byRecordId: ReadonlyMap<string, AcceptedRouteBindingDecisionV1>): void {
  const expected: Readonly<Record<string, readonly [string | null, RouteBindingDecisionKind]>> = {
    "route_b44-local": ["B44", "current_primary"],
    "route_b44-sbs": ["B44+", "current_primary"],
    "route_b44-limited": ["B44", "historical_description"],
    "route_b82-local": ["B82", "current_primary"],
    "route_b82-sbs": ["B82+", "current_primary"],
    "route_bx6-local": ["BX6", "current_primary"],
    "route_bx6-sbs": ["BX6+", "current_primary"],
    "route_b46-local-2012": ["B46", "current_primary"],
    "route_utica-ave-sbs": ["B46+", "current_primary"],
    "route_bx12-local-2015-webster-map": ["BX12", "current_primary"],
    "route_bx12-plus": ["BX12+", "current_primary"],
    "route_bx41-local-2012-02-brt-webster-cac1": ["BX41", "current_primary"],
    "route_webster-ave-sbs": ["BX41+", "current_primary"],
    "route_m15-local-limited": ["M15", "current_primary"],
    "route_m15-sbs": ["M15+", "current_primary"],
    "route_m14-ad-sbs": [null, "aggregate_context"],
    "route_q48-glen-oaks-2025": ["Q48", "current_primary"],
    "route_q48-serves-lga-2011": ["Q48", "historical_description"],
    "route_q6-ace": ["Q06", "current_ineligible"],
    "route_q9-qbnr-2025": ["Q09", "current_ineligible"],
    "route_q52-sbs-queens": ["Q52+", "current_primary"],
  };
  for (const [recordId, [target, kind]] of Object.entries(expected)) {
    const row = byRecordId.get(recordId);
    if (!row || row.gtfs_route_id !== target || row.decision_kind !== kind) {
      throw new Error(recordId + ": required fixture must be " + String(target) + "/" + kind);
    }
  }
}

export function buildRouteBindingAcceptance(input: {
  proposalBytes: string;
  expectedProposalSha256: string;
  snapshotManifestBytes: string;
  snapshotManifestSha256: string;
  records: MtaCanonicalRecord[];
  inventory: RouteInventoryRow[];
  legacyCompletenessBytes: string;
  legacyCompletenessPath: string;
  legacyReviewBytes: string;
  legacyReviewPath: string;
  acceptedBy: string;
  acceptedAt: string;
  rationale: string;
  proposalPath: string;
  decisionsPath?: string;
  projectionInputPath?: string;
}): BuiltRouteBindingAcceptance {
  assertNonempty(input.acceptedBy, "accepted_by");
  assertIsoInstant(input.acceptedAt, "accepted_at");
  assertNonempty(input.rationale, "rationale");
  assertSha(input.expectedProposalSha256, "expected proposal SHA-256");
  assertSha(input.snapshotManifestSha256, "snapshot manifest SHA-256");
  if (sha256(input.proposalBytes) !== input.expectedProposalSha256) throw new Error("owner-accepted proposal SHA-256 does not match exact bytes");
  if (sha256(input.snapshotManifestBytes) !== input.snapshotManifestSha256) throw new Error("snapshot manifest SHA-256 does not match exact bytes");

  const proposal = JSON.parse(input.proposalBytes) as RouteIdentityAudit;
  if (proposal.schema_version !== 1 || proposal.contract_id !== "route-identity-audit-proposal-v1") throw new Error("route binding proposal: unsupported version");
  const regenerated = routeIdentityAuditBytes(buildRouteIdentityAudit(proposal.snapshot_id, input.records, input.inventory));
  if (regenerated !== input.proposalBytes) throw new Error("route binding proposal is stale against current canonical records or GTFS inventory");

  const legacyRows = parseLegacyCompleteness(input.legacyCompletenessBytes);
  const legacyReview = JSON.parse(input.legacyReviewBytes) as LegacyRouteReview;
  if (legacyReview.schema_version !== 1 || legacyReview.contract_id !== "route-identity-dispositions-v1") throw new Error("legacy route review: unsupported version");

  const records = input.records.filter((record) => record.record_kind === "route").sort((a, b) => a.record_id.localeCompare(b.record_id));
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const proposalById = new Map(proposal.proposals.map((row) => [row.route_record_id, row]));
  const legacyById = new Map(legacyRows.map((row) => [row.route_record_id, row]));
  if (recordsById.size !== records.length || proposalById.size !== records.length || legacyById.size !== records.length) {
    throw new Error("canonical, proposal, and legacy completeness route denominators must be identical and unique");
  }
  for (const id of recordsById.keys()) {
    if (!proposalById.has(id) || !legacyById.has(id)) throw new Error(id + ": missing proposal or legacy completeness row");
  }

  const inventoryById = new Map(input.inventory.map((row) => [row.gtfs_route_id, row]));
  if (inventoryById.size !== input.inventory.length) throw new Error("GTFS inventory contains duplicate exported route ids");
  for (const identity of input.inventory) {
    if (identity.source_route_id !== identity.gtfs_route_id) throw new Error(identity.gtfs_route_id + ": source/exported identity inequality");
  }

  const allDecisions: AcceptedRouteBindingDecisionV1[] = [];
  for (const record of records) {
    const proposalRow = proposalById.get(record.record_id)!;
    const legacy = legacyById.get(record.record_id)!;
    const override = ROUTE_ADJUDICATION_OVERRIDES_V1[record.record_id];
    const mapping = reviewedTarget(record, proposalRow, legacy, override, inventoryById);
    const legacyDisposition = override?.legacyDisposition ?? legacy.reviewed_non_projectable_disposition;

    let identityScope: IdentityScope;
    let serviceClass: ServiceClass;
    let recordTemporalScope: RecordTemporalScope;
    let decisionKind: RouteBindingDecisionKind;
    let rationale: string;

    if (legacy.primary_disposition === "reviewed_non_projectable_disposition" && !override) {
      if (!legacyDisposition) throw new Error(record.record_id + ": reviewed nonprojectable row lacks a typed disposition");
      const prior = legacyReview.non_gtfs_dispositions[record.record_id];
      if (!prior || prior.review_state !== "approved" || prior.disposition !== legacyDisposition || prior.decision_id !== legacy.disposition_decision_id) {
        throw new Error(record.record_id + ": legacy reviewed disposition is missing or drifted");
      }
      const classification = dispositionClassification(legacyDisposition);
      identityScope = mapping.target ? "exact_service" : classification.identityScope;
      serviceClass = classification.serviceClass;
      recordTemporalScope = classification.temporalScope;
      decisionKind = classification.decisionKind;
      rationale = legacy.disposition_reason ?? prior.reason;
    } else {
      decisionKind = override?.decisionKind ?? (legacy.primary_disposition === "canonical_gtfs_anchor" ? "current_primary" : "historical_description");
      identityScope = override?.identityScope ?? (mapping.target ? "exact_service" : "unresolved");
      serviceClass = override?.serviceClass ?? (mapping.target?.raw_route_type === "711" ? "temporary" : "regular_mta_bus");
      recordTemporalScope = temporalScope(decisionKind);
      rationale = override?.rationale ?? (decisionKind === "current_primary"
        ? "The existing reviewed route completeness anchor and pinned exact identity support this record as the minimal current presentation."
        : "The existing reviewed variant remains historical and does not compete with the selected current presentation.");
    }

    const base = bindingFromProposal(proposalRow);
    const binding: RouteRecordBinding = {
      ...base,
      route_family_id: mapping.target?.route_family_id ?? base.route_family_id,
      dataset_id: mapping.target?.dataset_id ?? null,
      component_feed_ids: mapping.target ? [...mapping.target.component_feed_ids] : [],
      source_route_id: mapping.target?.source_route_id ?? null,
      gtfs_route_id: mapping.target?.gtfs_route_id ?? null,
      identity_scope: identityScope,
      service_class: serviceClass,
      record_temporal_scope: recordTemporalScope,
      projectable: false,
      presentation_primary: false,
      derivation: mapping.derivation,
      evidence_ids: [...new Set([...base.evidence_ids, ...legacy.disposition_evidence_ids, ...evidenceIds(record)])].sort(),
    };
    const reasons = eligibilityReasons(binding, mapping.target);
    const projectable = reasons.length === 0;
    const finalKind: RouteBindingDecisionKind = decisionKind === "current_primary" && !projectable
      ? (serviceClass === "temporary" ? "temporary_service" : "current_ineligible")
      : decisionKind;
    const decision: AcceptedRouteBindingDecisionV1 = {
      schema_version: ROUTE_BINDING_ACCEPTANCE_SCHEMA_VERSION,
      contract_id: ROUTE_BINDING_DECISION_CONTRACT_ID,
      decision_id: "route-binding-v1:" + record.record_id,
      snapshot_id: proposal.snapshot_id,
      proposal_sha256: input.expectedProposalSha256,
      ...binding,
      projectable,
      identity_basis: mapping.identityBasis,
      expected_gtfs_identity_fingerprint: mapping.target ? routeInventoryFingerprint(mapping.target) : null,
      decision_kind: finalKind,
      legacy_disposition: legacyDisposition ?? null,
      supersedes_decision_id: legacy.disposition_decision_id,
      reviewed_axes: [],
      presentation_primary: projectable && finalKind === "current_primary",
      ineligibility_reasons: eligibilityReasons({ ...binding, projectable, presentation_primary: false }, mapping.target),
      accepted_by: input.acceptedBy,
      accepted_at: input.acceptedAt,
      rationale: rationale + " This acceptance does not infer record time from current GTFS presence alone.",
    };
    allDecisions.push(decision);
  }

  const byRecordId = new Map(allDecisions.map((decision) => [decision.route_record_id, decision]));
  assertKnownFixtures(byRecordId);
  const projectableByIdentity = new Map<string, AcceptedRouteBindingDecisionV1[]>();
  for (const decision of allDecisions) {
    if (!decision.projectable) continue;
    const key = String(decision.dataset_id) + "\0" + String(decision.gtfs_route_id);
    const group = projectableByIdentity.get(key);
    if (group) group.push(decision);
    else projectableByIdentity.set(key, [decision]);
  }
  for (const [key, group] of projectableByIdentity) {
    const primaries = group.filter((decision) => decision.presentation_primary);
    if (primaries.length !== 1) {
      throw new Error(key + ": projectable exact identity requires exactly one presentation primary");
    }
  }

  for (const decision of allDecisions) {
    assertSortedUnique(decision.component_feed_ids, decision.route_record_id + ".component_feed_ids");
    assertSortedUnique(decision.evidence_ids, decision.route_record_id + ".evidence_ids");
    assertSortedUnique(decision.ineligibility_reasons, decision.route_record_id + ".ineligibility_reasons");
    const identity = decision.gtfs_route_id ? inventoryById.get(decision.gtfs_route_id) ?? null : null;
    const expectedReasons = eligibilityReasons(decision, identity);
    if (
      expectedReasons.join("\n") !== decision.ineligibility_reasons.join("\n") ||
      decision.projectable !== (expectedReasons.length === 0) ||
      (!decision.projectable && decision.presentation_primary)
    ) {
      throw new Error(decision.route_record_id + ": projectability is not the exact operational-eligibility predicate");
    }
    const reviewedAxes: RouteBindingReviewedAxis[] = [];
    if (decision.identity_basis === "reviewed_exact_mapping") reviewedAxes.push("identity_mapping");
    if (decision.identity_basis === "reviewed_nonidentity_disposition") reviewedAxes.push("identity_scope");
    if (decision.service_class !== "regular_mta_bus") reviewedAxes.push("service_class");
    if (decision.record_temporal_scope !== "current_description") reviewedAxes.push("record_temporal_scope");
    const exactKey = String(decision.dataset_id) + "\0" + String(decision.gtfs_route_id);
    if (decision.presentation_primary && (projectableByIdentity.get(exactKey)?.length ?? 0) > 1) reviewedAxes.push("presentation_primary");
    decision.reviewed_axes = [...new Set(reviewedAxes)].sort();
  }

  const decisions = allDecisions.filter((decision) => decision.reviewed_axes.length > 0);
  const decisionByRecordId = new Map(decisions.map((decision) => [decision.route_record_id, decision.decision_id]));
  const projectionInput: AcceptedRouteBindingProjectionRowV1[] = allDecisions.map((decision) => ({
    schema_version: ROUTE_BINDING_ACCEPTANCE_SCHEMA_VERSION,
    contract_id: ROUTE_BINDING_PROJECTION_INPUT_CONTRACT_ID,
    decision_id: decisionByRecordId.get(decision.route_record_id) ?? null,
    identity_basis: decision.identity_basis,
    route_record_id: decision.route_record_id,
    route_family_id: decision.route_family_id,
    dataset_id: decision.dataset_id,
    component_feed_ids: [...decision.component_feed_ids],
    source_route_id: decision.source_route_id,
    gtfs_route_id: decision.gtfs_route_id,
    service_variant: decision.service_variant,
    identity_scope: decision.identity_scope,
    service_class: decision.service_class,
    record_temporal_scope: decision.record_temporal_scope,
    projectable: decision.projectable,
    presentation_primary: decision.presentation_primary,
    derivation: decision.derivation,
    evidence_ids: [...decision.evidence_ids],
    canonical_record_fingerprint: decision.canonical_record_fingerprint,
    expected_gtfs_identity_fingerprint: decision.expected_gtfs_identity_fingerprint,
    decision_kind: decision.decision_kind,
    ineligibility_reasons: [...decision.ineligibility_reasons],
  }));

  const decisionsPath = input.decisionsPath ?? "data/route-identity/accepted/v1/decisions.jsonl";
  const projectionInputPath = input.projectionInputPath ?? "data/route-identity/accepted/v1/record-bindings.jsonl";
  const decisionsBytes = jsonlBytes(decisions);
  const projectionInputBytes = jsonlBytes(projectionInput);
  const decisionMetadata = metadata(decisionsPath, decisionsBytes, decisions.length);
  const projectionMetadata = metadata(projectionInputPath, projectionInputBytes, projectionInput.length);
  const acceptance: RouteBindingAcceptanceV1 = {
    schema_version: ROUTE_BINDING_ACCEPTANCE_SCHEMA_VERSION,
    contract_id: ROUTE_BINDING_ACCEPTANCE_CONTRACT_ID,
    snapshot_id: proposal.snapshot_id,
    snapshot_manifest_sha256: input.snapshotManifestSha256,
    proposal: metadata(input.proposalPath, input.proposalBytes, 1),
    legacy_route_completeness: metadata(input.legacyCompletenessPath, input.legacyCompletenessBytes, legacyRows.length),
    legacy_route_review: metadata(input.legacyReviewPath, input.legacyReviewBytes, 1),
    decisions: decisionMetadata,
    projection_input: projectionMetadata,
    decision_set_sha256: decisionMetadata.sha256,
    accepted_by: input.acceptedBy,
    accepted_at: input.acceptedAt,
    rationale: input.rationale,
    acceptance_scope: "owner_approved_complete_route_adjudication_v1",
    route_record_count: projectionInput.length,
    exact_binding_count: projectionInput.filter((row) => row.identity_scope === "exact_service").length,
    projectable_count: projectionInput.filter((row) => row.projectable).length,
    historical_description_count: projectionInput.filter((row) => row.record_temporal_scope === "historical_description").length,
    family_or_aggregate_count: projectionInput.filter((row) => row.identity_scope === "route_family_context" || row.identity_scope === "aggregate_context").length,
    current_ineligible_count: projectionInput.filter((row) => row.record_temporal_scope === "current_description" && !row.projectable && row.identity_scope === "exact_service").length,
    status: "accepted",
  };
  const acceptanceBytes = stableJson(acceptance as unknown as JsonValue) + "\n";
  return { acceptance, acceptanceBytes, decisions, decisionsBytes, projectionInput, projectionInputBytes };
}

export function verifyRouteBindingAcceptance(input: Parameters<typeof buildRouteBindingAcceptance>[0] & {
  built: BuiltRouteBindingAcceptance;
}): void {
  const rebuilt = buildRouteBindingAcceptance(input);
  if (
    rebuilt.acceptanceBytes !== input.built.acceptanceBytes ||
    rebuilt.decisionsBytes !== input.built.decisionsBytes ||
    rebuilt.projectionInputBytes !== input.built.projectionInputBytes
  ) {
    throw new Error("accepted route-binding artifacts are not the canonical projection of the owner-approved adjudication");
  }
}
