import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../../../../../packages/core/src/paths";
import { stableJson } from "../../../../../packages/db/src/stable-json";
import type { JsonObject, MtaCanonicalRecord, MtaSubmissionEntry, StagedSourceBlock } from "../../../../../packages/db/src/types";
import { readCanonicalRecordsFromJsonl } from "../../../../../packages/pipeline/src/materialize/canonical-read";
import { entriesToRecords } from "../../../../../packages/pipeline/src/materialize/materialize";
import { relationEndpointShapeIssue } from "../../../../../packages/pipeline/src/records/relations";
import { readSubmissionRetirements } from "../../../../../packages/pipeline/src/records/submission-overrides";

export const LINKAGE_RECONCILIATION_CAMPAIGN_ID = "bus-lane-supported-linkage-reconciliation-v1" as const;
export const LINKAGE_RECONCILIATION_EXPECTED_COUNT = 54 as const;
export const LINKAGE_RECONCILIATION_EXPECTED_STATUS_COUNTS = {
  verified_existing: 25,
  implemented_pending: 29,
} as const;

const CANDIDATE_SET_ID = "candidate-set-v2:24080902f508b55a0033df32";
const CANDIDATE_SET_SHA256 = "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba";
const SHARDS = ["bronx", "brooklyn-null", "manhattan", "queens", "staten-island"] as const;
type Shard = (typeof SHARDS)[number];
type ReconciliationStatus = "verified_existing" | "implemented_pending";

const OUTPUT_DIR = import.meta.dir;
const ACQUISITION_DIR = dirname(OUTPUT_DIR);
const SHARDS_DIR = join(ACQUISITION_DIR, "shards");
const CAMPAIGN_PATH = join(ACQUISITION_DIR, "campaign.jsonl");
const CAMPAIGN_SUMMARY_PATH = join(ACQUISITION_DIR, "summary.json");
const OUTPUT_JSONL_PATH = join(OUTPUT_DIR, "reconciliation.jsonl");
const SUMMARY_PATH = join(OUTPUT_DIR, "summary.json");
const REPORT_PATH = join(OUTPUT_DIR, "report.md");
const MANIFEST_PATH = join(OUTPUT_DIR, "manifest.json");

const ACTION_PATHS: Record<Shard, string> = {
  bronx: join(SHARDS_DIR, "bronx", "linkage-remediation", "candidate-actions.json"),
  "brooklyn-null": join(SHARDS_DIR, "brooklyn-null", "linkage-remediation", "decisions.jsonl"),
  manhattan: join(SHARDS_DIR, "manhattan", "linkage-remediation", "candidate-actions.json"),
  queens: join(SHARDS_DIR, "queens", "linkage-remediation", "candidate-actions.json"),
  "staten-island": join(SHARDS_DIR, "staten-island", "linkage-remediation", "candidate-actions.json"),
};

const PENDING_JOURNAL_PATHS = [
  "data/submissions/2026-07-15T18-00-00-000Z_queens-acquisition-linkage-remediation.jsonl",
  "data/submissions/2026-07-15T20-30-00-000Z_brooklyn-null-acquisition-linkage-remediation.jsonl",
  "data/submissions/2026-07-15T21-00-00-000Z_manhattan-third-avenue-linkage-remediation.jsonl",
  "data/submissions/2026-07-15T21-00-00-000Z_staten-island-acquisition-linkage-remediation.jsonl",
  "data/submissions/2026-07-15T22-00-00-000Z_bronx-acquisition-linkage-remediation.jsonl",
  "data/submissions/2026-07-16T01-30-00-000Z_staten-island-evidence-reblocking-remediation.jsonl",
] as const;

const STATEN_ORIGINAL_JOURNAL_PATH =
  "data/submissions/2026-07-15T21-00-00-000Z_staten-island-acquisition-linkage-remediation.jsonl";
const STATEN_ORIGINAL_JOURNAL_SHA256 = "9e0ade44c8f28f6684bbe6b57d496730d0ce360a4a84e6d9fc541ef8b0458a4b";
const STATEN_REPLACEMENT_JOURNAL_PATH =
  "data/submissions/2026-07-16T01-30-00-000Z_staten-island-evidence-reblocking-remediation.jsonl";
const STATEN_REPLACEMENT_JOURNAL_SHA256 = "7c91ba7c95ec523cf200179239c1f25aea5a4b317439be4a3b9d7fa81f5c36f2";
const STATEN_REBLOCKING_REMEDIATION_PATH =
  "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/linkage-remediation/evidence-reblocking/remediation.json";
const STATEN_REBLOCKING_REMEDIATION_SHA256 = "30d1c4642eee937bab95b10fd2f00f84449a61f719f9dff125b0ba3e713e19a6";
const STATEN_REBLOCKING_MANIFEST_PATH =
  "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/linkage-remediation/evidence-reblocking/manifest.json";
const RETIREMENT_LEDGER_PATH = "data/submission-overrides/retired.json";

const MANHATTAN_EXISTING: Record<string, { relationId: string; routeRecordId: string }> = {
  "study-event-v2:36551be6cc4f3abae2c9ef45": {
    relationId: "relation_route-m60-sbs-on-corridor-125th",
    routeRecordId: "route_125th-laguardia-sbs",
  },
  "study-event-v2:7387d0a52f633437de6fd4d7": {
    relationId: "relation_route-sbs-operates-on-second-ave",
    routeRecordId: "route_m15-sbs",
  },
};

// Acquisition receipts retain their retrieval ids, while staged sources use compact
// local ids. Keep the crosswalk narrow and prove it by exact artifact hash before
// using staged blocks as route-variant evidence.
const ACQUISITION_SOURCE_STAGE_ALIASES: Record<string, string> = {
  rockaway_beach_cb14: "rockaway_beach_blvd_jun2019",
};

type CampaignRow = {
  schema_version: number;
  campaign_id: string;
  candidate_set_id: string;
  candidate_set_sha256: string;
  shard: Shard;
  candidate: {
    candidate_id: string;
    identity: string;
    route_id: string;
    normalized_route_id: string;
    corridor: string;
    implementation_date: string;
    date_precision: string;
  };
  acquisition: {
    receipt_id: string;
    researched: boolean;
    researched_on: string;
    physical_bus_lane_source_acquired: boolean;
  };
  relationship_proof: {
    authoritative_route_treatment_binding_proved: boolean;
    exact_candidate_segment_binding_proved: boolean;
    explicit_phase_identity_proved: boolean;
    candidate_date_and_phase_proved: boolean;
    canonical_operational_occurrence_identity_proved: boolean;
    operational_occurrence_added_or_updated: boolean;
  };
  outcome: {
    exclusive_primary_disposition: string;
    nonexclusive_reason_codes: string[];
    registry_projection_excluded: boolean;
    still_unresolved: boolean;
    study_projection_eligible: boolean;
  };
  provenance: {
    receipt_path: string;
    receipt_row_sha256: string;
  };
};

type ReceiptEvidence = {
  evidence_kind: string;
  source_id: string;
  source_sha256: string;
  official_routes?: string[];
  official_sbs_routes?: string[];
  supported_claim?: string;
  support_note?: string;
  locator?: string;
  source_row_sha256?: string | null;
  segment_id?: string | null;
  limitation?: string;
};

type Receipt = {
  schema_version: number;
  shard: Shard;
  receipt_id: string;
  researched_on: string;
  candidate: { candidate_id: string; route_id: string; normalized_route_id: string };
  claim_results: {
    exact_route_treatment_binding_proved: boolean;
    exact_segment_binding_proved: boolean;
    explicit_phase_identity_proved: boolean;
    date_and_phase_proved: boolean;
    operational_occurrence_identity_proved: boolean;
    exact_route_binding_evidence: ReceiptEvidence[];
  };
  canonical_actions: { operational_occurrence_added_or_updated: boolean };
  outcome: {
    registry_projection_excluded: boolean;
    still_unresolved: boolean;
    study_projection_eligible: boolean;
  };
};

type AcquiredSourceChecks = {
  schema_version: number;
  shard: Shard;
  candidate_set_id: string;
  candidate_set_sha256: string;
  sources: Array<{
    id: string;
    url: string;
    category: string;
    retrieval_status: string;
    retrieved_on: string;
    content_sha256: string | null;
  }>;
};

type ActionSpec = {
  candidateId: string;
  shard: Shard;
  status: ReconciliationStatus;
  routeRecordId?: string | undefined;
  relationIds: string[];
  actionFormat: string;
  actionRowSha256: string;
};

type RelationEvidenceProof = {
  source_id: string;
  evidence_id: string;
  block_id: string;
  text_sha256: string;
  page_number: number | null;
  verification_surface: "staged_blocks" | "cached_pdf_text_page";
};

type StatenEvidenceReblockingRemediation = {
  schema_version: 1;
  remediation_id: string;
  status: "applied";
  pinned_inputs: {
    original_journal_path: string;
    original_journal_sha256: string;
    current_primary_blocks_path: string;
    current_primary_blocks_sha256: string;
  };
  block_mapping: Array<{
    legacy_block_id: string;
    current_block_id: string;
    current_text_sha256: string;
  }>;
  summary: {
    affected_submission_count: number;
    replacement_submission_count: number;
    retired_original_submission_count: number;
    projected_record_count: number;
    unresolved_reblocked_submission_count: number;
  };
  decisions: Array<{
    original_submission_id: string;
    replacement_submission_id: string;
    observation_kind: string;
    local_observation_id: string;
    old_evidence_ids: string[];
    new_evidence_ids: string[];
    source_decision: string;
  }>;
  outputs: {
    replacement_journal_path: string;
    retirement_override_path: string;
  };
};

type RelationSupersessionProof = {
  remediation_id: string;
  remediation_path: string;
  remediation_sha256: string;
  original_journal_path: string;
  original_journal_sha256: string;
  retired_submission_id: string;
  replacement_journal_path: string;
  replacement_journal_sha256: string;
  replacement_submission_id: string;
  current_primary_blocks_path: string;
  current_primary_blocks_sha256: string;
};

export type LinkageReconciliationRow = {
  schema_version: 2;
  campaign_id: typeof LINKAGE_RECONCILIATION_CAMPAIGN_ID;
  candidate_id: string;
  shard: Shard;
  identity: string;
  route_id: string;
  normalized_route_id: string;
  route_variant: "sbs_plus" | "non_sbs";
  corridor_literal: string;
  exclusive_primary_status: ReconciliationStatus;
  action_format: string;
  action_row_sha256: string;
  campaign_row_sha256: string;
  receipt_id: string;
  receipt_row_sha256: string;
  authoritative_linkage_evidence: {
    evidence_kind: string;
    source_id: string;
    source_sha256: string;
    source_url: string;
    source_category: string;
    retrieved_on: string;
    route_field: "official_routes" | "official_sbs_routes";
    official_routes: string[];
    route_variant_confirmation: "receipt_route_literal" | "receipt_sbs_field" | "staged_source_sbs_block";
    route_variant_block: { staged_source_id: string; block_id: string; text_sha256: string } | null;
    supported_statement: string;
    locator: string | null;
    source_row_sha256: string | null;
  };
  relation_proof: {
    relation_id: string;
    record_status: "canonical_existing" | "accepted_pending_submission";
    current_canonical_materialization: true;
    record_sha256: string;
    pending_journal_path: string | null;
    pending_submission_ids: string[];
    supersession: RelationSupersessionProof | null;
    relation_kind: string;
    relation_family: string;
    subject_id: string;
    subject_kind: string;
    subject_status: "canonical" | "accepted_pending";
    object_id: string;
    object_kind: string;
    object_status: "canonical" | "accepted_pending";
    route_endpoint_id: string;
    route_variant_exact: true;
    endpoints_resolve: true;
    endpoint_type_valid: true;
    local_observation_only_endpoint: false;
    relation_evidence_hash_valid: true;
    relation_evidence_refs: RelationEvidenceProof[];
  };
  nonexclusive_reason_codes: string[];
  exact_candidate_segment_binding_proved: boolean;
  explicit_phase_identity_proved: false;
  candidate_date_and_phase_proved: false;
  canonical_operational_occurrence_identity_proved: false;
  operational_occurrence_added_or_updated: false;
  registry_projection_excluded: true;
  still_unresolved: true;
  study_projection_eligible: false;
};

export type LinkageReconciliationCampaign = {
  rows: LinkageReconciliationRow[];
  summary: Record<string, unknown>;
  report: string;
  manifest: Record<string, unknown>;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path: string): string {
  return sha256(readFileSync(path));
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJsonl(rows: unknown[]): string {
  return `${rows.map((row) => stableJson(row as never)).join("\n")}\n`;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonlWithRaw<T>(path: string): Array<{ value: T; raw: string; sha256: string }> {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((raw) => ({ value: JSON.parse(raw) as T, raw, sha256: sha256(raw) }));
}

function readJsonl<T>(path: string): T[] {
  return readJsonlWithRaw<T>(path).map((row) => row.value);
}

function rawCanonicalRelationHashes(): Map<string, string> {
  return new Map(readJsonlWithRaw<{ record_id: string }>(join(repoRoot, "data", "canonical", "relations.jsonl"))
    .map((row) => [row.value.record_id, row.sha256]));
}

function routeDescriptor(value: string, forcedSbs = false): { base: string; sbs: boolean } {
  const upper = value.toUpperCase().trim();
  const sbs = forcedSbs || upper.endsWith("+") || /(?:SELECT\s+BUS\s+SERVICE|(?:^|[^A-Z])SBS(?:[^A-Z]|$))/u.test(upper);
  const base = upper
    .replace(/SELECT\s+BUS\s+SERVICE/gu, "")
    .replace(/SBS/gu, "")
    .replace(/\+/gu, "")
    .replace(/[^A-Z0-9]/gu, "");
  return { base, sbs };
}

function routeRecordTokens(record: MtaCanonicalRecord): string[] {
  const values: string[] = [];
  for (const key of ["route_id", "route_label"] as const) {
    const value = record.payload[key];
    if (typeof value === "string" && value.trim()) values.push(value);
  }
  const merged = record.payload._merged_field_values;
  if (merged && typeof merged === "object" && !Array.isArray(merged)) {
    for (const key of ["route_id", "route_label"] as const) {
      const value = (merged as JsonObject)[key];
      if (typeof value === "string") values.push(value);
      if (Array.isArray(value)) values.push(...value.filter((item): item is string => typeof item === "string"));
    }
  }
  if (values.length === 0) {
    const routeName = record.payload.route_name;
    if (typeof routeName === "string") values.push(routeName);
  }
  return [...new Set(values)];
}

function routeRecordIsSbs(record: MtaCanonicalRecord): boolean {
  const serviceVariant = record.payload.service_variant;
  const routeType = record.payload.route_type_normalized;
  if (serviceVariant === "sbs" || routeType === "select_bus_service") return true;
  if (serviceVariant === "local") return false;
  if (routeRecordTokens(record).some((value) => routeDescriptor(value).sbs)) return true;
  return /(?:sbs|plus)/u.test(record.record_id.toLowerCase());
}

function routeRecordMatches(record: MtaCanonicalRecord, routeId: string): boolean {
  if (record.record_kind !== "route") return false;
  const expected = routeDescriptor(routeId);
  const baseMatches = routeRecordTokens(record).some((value) => routeDescriptor(value).base === expected.base);
  return baseMatches && routeRecordIsSbs(record) === expected.sbs;
}

function exactSbsSourceBlock(item: ReceiptEvidence, routeBase: string): { stagedSourceId: string; block: StagedSourceBlock } | undefined {
  const stagedSourceId = ACQUISITION_SOURCE_STAGE_ALIASES[item.source_id] ?? item.source_id;
  if (!existsSync(join(repoRoot, "raw", "sources", stagedSourceId, "blocks.jsonl"))) return undefined;
  if (stagedSourceId !== item.source_id) {
    const stagedArtifactPath = join(repoRoot, "raw", "sources", stagedSourceId, "source.pdf");
    invariant(existsSync(stagedArtifactPath), `${item.source_id} staged alias ${stagedSourceId} has no source.pdf`);
    invariant(fileSha256(stagedArtifactPath) === item.source_sha256, `${item.source_id} staged alias ${stagedSourceId} artifact hash mismatch`);
  }
  const token = routeBase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`(?:\\b${token}\\s*(?:SBS|SELECT\\s+BUS\\s+SERVICE)\\b|\\b(?:SBS|SELECT\\s+BUS\\s+SERVICE)\\s*${token}\\b)`, "iu");
  const block = [...sourceBlocks(stagedSourceId).values()]
    .filter((block) => pattern.test(block.raw_text))
    .sort((left, right) => left.page_number - right.page_number || compareStrings(left.block_id, right.block_id))[0];
  return block ? { stagedSourceId, block } : undefined;
}

function receiptEvidenceMatch(item: ReceiptEvidence, routeId: string): {
  field: "official_routes" | "official_sbs_routes";
  routes: string[];
  variantConfirmation: "receipt_route_literal" | "receipt_sbs_field" | "staged_source_sbs_block";
  variantBlock: StagedSourceBlock | null;
} | null {
  const expected = routeDescriptor(routeId);
  const ordinary = item.official_routes ?? [];
  if (ordinary.some((route) => {
    const descriptor = routeDescriptor(route);
    return descriptor.base === expected.base && descriptor.sbs === expected.sbs;
  })) return { field: "official_routes", routes: ordinary, variantConfirmation: "receipt_route_literal", variantBlock: null };
  const sbs = item.official_sbs_routes ?? [];
  if (expected.sbs && sbs.some((route) => routeDescriptor(route, true).base === expected.base)) {
    return { field: "official_sbs_routes", routes: sbs, variantConfirmation: "receipt_sbs_field", variantBlock: null };
  }
  if (expected.sbs && ordinary.some((route) => routeDescriptor(route).base === expected.base)) {
    const exact = exactSbsSourceBlock(item, expected.base);
    if (exact) return { field: "official_routes", routes: ordinary, variantConfirmation: "staged_source_sbs_block", variantBlock: exact.block };
  }
  return null;
}

function actionCandidateHash(value: unknown): string {
  return sha256(stableJson(value as never));
}

function normalizeActionSpecs(): { specs: ActionSpec[]; formatCounts: Record<string, number> } {
  const specs: ActionSpec[] = [];
  const formatCounts: Record<string, number> = {};
  const add = (spec: ActionSpec): void => {
    invariant(spec.relationIds.length > 0, `${spec.candidateId} action has no relation ids`);
    specs.push({ ...spec, relationIds: [...new Set(spec.relationIds)].sort(compareStrings) });
    formatCounts[spec.actionFormat] = (formatCounts[spec.actionFormat] ?? 0) + 1;
  };

  const bronx = readJson<{ schema_version: number; candidates: Array<Record<string, unknown>> }>(ACTION_PATHS.bronx);
  invariant(bronx.schema_version === 1 && bronx.candidates.length === 13, "Bronx action format/count mismatch");
  for (const value of bronx.candidates) {
    const candidateId = String(value.candidate_id);
    const action = String(value.route_corridor_action);
    invariant(action === "verified_existing" || action === "added", `${candidateId} Bronx action invalid`);
    add({
      candidateId,
      shard: "bronx",
      status: action === "verified_existing" ? "verified_existing" : "implemented_pending",
      routeRecordId: String(value.canonical_route_record_id),
      relationIds: (action === "verified_existing" ? value.canonical_links_verified_existing : value.canonical_links_added) as string[],
      actionFormat: "bronx_candidate_actions_v1",
      actionRowSha256: actionCandidateHash(value),
    });
  }

  const brooklynRows = readJsonlWithRaw<Record<string, unknown>>(ACTION_PATHS["brooklyn-null"]);
  invariant(brooklynRows.length === 8, "Brooklyn/null decision count mismatch");
  for (const { value, sha256: rawSha } of brooklynRows) {
    const action = String(value.exclusive_action);
    invariant(action === "verified_existing_canonical" || action === "implemented_by_accepted_submission", `${String(value.candidate_id)} Brooklyn action invalid`);
    const proofs = value.relation_proofs as Array<{ relation_id: string; record_status: string }>;
    const expectedRecordStatus = action === "verified_existing_canonical" ? "canonical_existing" : "accepted_pending_submission";
    add({
      candidateId: String(value.candidate_id),
      shard: "brooklyn-null",
      status: action === "verified_existing_canonical" ? "verified_existing" : "implemented_pending",
      routeRecordId: ((value.canonical_route_endpoint_ids as string[]) ?? [])[0],
      relationIds: proofs.filter((proof) => proof.record_status === expectedRecordStatus).map((proof) => proof.relation_id),
      actionFormat: "brooklyn_decisions_jsonl_v1",
      actionRowSha256: rawSha,
    });
  }

  const manhattan = readJson<{ schema_version: number; candidates: Array<Record<string, unknown>> }>(ACTION_PATHS.manhattan);
  invariant(manhattan.schema_version === 1 && manhattan.candidates.length === 4, "Manhattan gap-action format/count mismatch");
  for (const value of manhattan.candidates) {
    add({
      candidateId: String(value.candidate_id),
      shard: "manhattan",
      status: "implemented_pending",
      relationIds: value.canonical_links_added as string[],
      actionFormat: "manhattan_gap_candidate_actions_v1",
      actionRowSha256: actionCandidateHash(value),
    });
  }
  for (const [candidateId, proof] of Object.entries(MANHATTAN_EXISTING)) {
    add({
      candidateId,
      shard: "manhattan",
      status: "verified_existing",
      routeRecordId: proof.routeRecordId,
      relationIds: [proof.relationId],
      actionFormat: "manhattan_existing_plus_routes_v1",
      actionRowSha256: sha256(stableJson({ candidate_id: candidateId, ...proof } as never)),
    });
  }

  const queens = readJson<{ schema_version: number; candidates: Array<Record<string, unknown>> }>(ACTION_PATHS.queens);
  invariant(queens.schema_version === 1 && queens.candidates.length === 5, "Queens action format/count mismatch");
  for (const value of queens.candidates) {
    add({
      candidateId: String(value.candidate_id),
      shard: "queens",
      status: "implemented_pending",
      relationIds: value.canonical_links_added as string[],
      actionFormat: "queens_candidate_actions_v1",
      actionRowSha256: actionCandidateHash(value),
    });
  }

  const staten = readJson<{ schema_version: number; candidates: Array<Record<string, unknown>> }>(ACTION_PATHS["staten-island"]);
  invariant(staten.schema_version === 1 && staten.candidates.length === 22, "Staten Island action format/count mismatch");
  for (const value of staten.candidates) {
    const action = String(value.route_binding_action);
    invariant(action === "verified_existing" || action === "added", `${String(value.candidate_id)} Staten Island action invalid`);
    add({
      candidateId: String(value.candidate_id),
      shard: "staten-island",
      status: action === "verified_existing" ? "verified_existing" : "implemented_pending",
      routeRecordId: String(value.route_record_id),
      relationIds: (action === "verified_existing" ? value.canonical_links_verified_existing : value.canonical_links_added) as string[],
      actionFormat: "staten_island_candidate_actions_v1",
      actionRowSha256: actionCandidateHash(value),
    });
  }

  invariant(specs.length === LINKAGE_RECONCILIATION_EXPECTED_COUNT, `action spec gate changed: ${specs.length}`);
  invariant(new Set(specs.map((spec) => spec.candidateId)).size === specs.length, "candidate action ownership collision");
  return { specs, formatCounts };
}

type PendingJournalInput = {
  path: string;
  sha256: string;
  accepted_submission_count: number;
  active_submission_count: number;
  retired_submission_count: number;
  materialized_submission_count: number;
  projected_record_count: number;
};

type PendingMaterialization = {
  recordsById: Map<string, MtaCanonicalRecord>;
  journalByRecordId: Map<string, string>;
  entriesBySubmissionId: Map<string, { entry: MtaSubmissionEntry; journalPath: string }>;
  journalInputs: PendingJournalInput[];
  retiredSubmissionIds: Set<string>;
  reblockingDecisionByReplacementSubmissionId: Map<string, StatenEvidenceReblockingRemediation["decisions"][number]>;
  obsoleteEvidenceIds: Set<string>;
  reblockingLineage: Record<string, unknown>;
  reblockingRemediationId: string;
  currentPrimaryBlocksPath: string;
  currentPrimaryBlocksSha256: string;
  activeSubmissionCount: number;
  retiredSubmissionCount: number;
  projectedRecordCount: number;
};

function loadPendingRecords(): PendingMaterialization {
  const allEntries: Array<{ entry: MtaSubmissionEntry; journalPath: string }> = [];
  const journalByRecordId = new Map<string, string>();
  const journalInputs: PendingJournalInput[] = [];
  for (const relativePath of PENDING_JOURNAL_PATHS) {
    const path = join(repoRoot, relativePath);
    const entries = readJsonl<MtaSubmissionEntry>(path);
    invariant(entries.length > 0, `${relativePath} is empty`);
    invariant(entries.every((entry) => entry.validation.state === "accepted"), `${relativePath} contains non-accepted entries`);
    invariant(entries.every((entry) => entry.validation.issues.length === 0), `${relativePath} contains accepted entries with validation issues`);
    allEntries.push(...entries.map((entry) => ({ entry, journalPath: relativePath })));
  }

  const entriesBySubmissionId = new Map(allEntries.map((value) => [value.entry.submission_id, value]));
  invariant(entriesBySubmissionId.size === allEntries.length, "pending journals contain duplicate submission ids");
  const retirementOverrides = readSubmissionRetirements();
  const retiredSubmissionIds = new Set(retirementOverrides.retired.map((entry) => entry.submission_id));
  const activeEntries = allEntries.filter((value) => !retiredSubmissionIds.has(value.entry.submission_id));
  const retiredEntries = allEntries.filter((value) => retiredSubmissionIds.has(value.entry.submission_id));
  const projectedRecords = entriesToRecords(
    allEntries.map((value) => value.entry),
    { retiredSubmissionIds },
  );
  const recordsById = new Map(projectedRecords.map((record) => [record.record_id, record]));
  invariant(recordsById.size === projectedRecords.length, "pending materialization produced duplicate record ids");

  const materializedSubmissionCounts = new Map<string, number>();
  for (const record of projectedRecords) {
    invariant(record.submission_ids.length > 0, `${record.record_id} materialized without submission provenance`);
    const recordJournals = new Set<string>();
    for (const submissionId of record.submission_ids) {
      invariant(!retiredSubmissionIds.has(submissionId), `${record.record_id} retained retired submission ${submissionId}`);
      const source = entriesBySubmissionId.get(submissionId);
      invariant(source, `${record.record_id} cites unknown pending submission ${submissionId}`);
      recordJournals.add(source.journalPath);
      materializedSubmissionCounts.set(submissionId, (materializedSubmissionCounts.get(submissionId) ?? 0) + 1);
    }
    invariant(recordJournals.size === 1, `${record.record_id} is projected by multiple pending journals`);
    journalByRecordId.set(record.record_id, [...recordJournals][0]!);
  }
  for (const value of activeEntries) {
    invariant(
      materializedSubmissionCounts.get(value.entry.submission_id) === 1,
      `${value.entry.submission_id} does not materialize exactly once under current retirements and validation`,
    );
  }
  invariant(
    retiredEntries.every((value) => !materializedSubmissionCounts.has(value.entry.submission_id)),
    "retired pending submissions leaked into materialized records",
  );

  const remediationPath = join(repoRoot, STATEN_REBLOCKING_REMEDIATION_PATH);
  const replacementJournalPath = join(repoRoot, STATEN_REPLACEMENT_JOURNAL_PATH);
  const originalJournalPath = join(repoRoot, STATEN_ORIGINAL_JOURNAL_PATH);
  invariant(fileSha256(originalJournalPath) === STATEN_ORIGINAL_JOURNAL_SHA256, "immutable Staten Island original journal hash changed");
  invariant(fileSha256(replacementJournalPath) === STATEN_REPLACEMENT_JOURNAL_SHA256, "Staten Island replacement journal hash changed");
  invariant(fileSha256(remediationPath) === STATEN_REBLOCKING_REMEDIATION_SHA256, "Staten Island evidence-reblocking remediation hash changed");
  const remediation = readJson<StatenEvidenceReblockingRemediation>(remediationPath);
  invariant(remediation.schema_version === 1 && remediation.status === "applied", "Staten Island evidence-reblocking remediation identity invalid");
  invariant(remediation.pinned_inputs.original_journal_path === STATEN_ORIGINAL_JOURNAL_PATH, "Staten Island remediation original journal path mismatch");
  invariant(remediation.pinned_inputs.original_journal_sha256 === STATEN_ORIGINAL_JOURNAL_SHA256, "Staten Island remediation original journal hash mismatch");
  invariant(remediation.outputs.replacement_journal_path === STATEN_REPLACEMENT_JOURNAL_PATH, "Staten Island remediation replacement journal path mismatch");
  invariant(remediation.outputs.retirement_override_path === RETIREMENT_LEDGER_PATH, "Staten Island remediation retirement path mismatch");
  invariant(remediation.decisions.length === 20, `Staten Island evidence-reblocking decision count changed: ${remediation.decisions.length}`);
  invariant(remediation.summary.affected_submission_count === 20, "Staten Island affected-submission count changed");
  invariant(remediation.summary.replacement_submission_count === 20, "Staten Island replacement-submission count changed");
  invariant(remediation.summary.retired_original_submission_count === 20, "Staten Island retired-original count changed");
  invariant(remediation.summary.projected_record_count === 27, "Staten Island effective projected-record count changed");
  invariant(remediation.summary.unresolved_reblocked_submission_count === 0, "Staten Island reblocking has unresolved submissions");

  const originalSubmissionIds = new Set(
    allEntries
      .filter((value) => value.journalPath === STATEN_ORIGINAL_JOURNAL_PATH)
      .map((value) => value.entry.submission_id),
  );
  const replacementSubmissionIds = new Set(
    allEntries
      .filter((value) => value.journalPath === STATEN_REPLACEMENT_JOURNAL_PATH)
      .map((value) => value.entry.submission_id),
  );
  const remediationOriginalIds = new Set(remediation.decisions.map((decision) => decision.original_submission_id));
  const remediationReplacementIds = new Set(remediation.decisions.map((decision) => decision.replacement_submission_id));
  invariant(remediationOriginalIds.size === 20 && remediationReplacementIds.size === 20, "Staten Island remediation submission ids collide");
  invariant([...remediationOriginalIds].every((submissionId) => originalSubmissionIds.has(submissionId)), "Staten Island remediation references an unknown original submission");
  invariant([...remediationReplacementIds].every((submissionId) => replacementSubmissionIds.has(submissionId)), "Staten Island remediation references an unknown replacement submission");
  invariant([...remediationOriginalIds].every((submissionId) => retiredSubmissionIds.has(submissionId)), "Staten Island original submission is not retired");
  invariant([...remediationReplacementIds].every((submissionId) => !retiredSubmissionIds.has(submissionId)), "Staten Island replacement submission is retired");
  const campaignRetirements = retirementOverrides.retired.filter((entry) => remediationOriginalIds.has(entry.submission_id));
  invariant(campaignRetirements.length === 20, "live retirement ledger does not contain the 20 Staten Island reblocking retirements");
  invariant(
    campaignRetirements.every((entry) => entry.source_decision.startsWith(`${STATEN_REBLOCKING_REMEDIATION_PATH}#`)),
    "Staten Island reblocking retirement lineage mismatch",
  );

  const reblockingDecisionByReplacementSubmissionId = new Map(
    remediation.decisions.map((decision) => [decision.replacement_submission_id, decision]),
  );
  const obsoleteEvidenceIds = new Set(remediation.decisions.flatMap((decision) => decision.old_evidence_ids));
  for (const record of projectedRecords) {
    invariant(
      record.evidence_refs.every((ref) => !ref.evidence_id || !obsoleteEvidenceIds.has(ref.evidence_id)),
      `${record.record_id} retains superseded Staten Island evidence`,
    );
  }

  const projectedCounts = new Map<string, number>();
  for (const [recordId, journalPath] of journalByRecordId) {
    invariant(recordsById.has(recordId), `${recordId} journal mapping has no projected record`);
    projectedCounts.set(journalPath, (projectedCounts.get(journalPath) ?? 0) + 1);
  }
  for (const relativePath of PENDING_JOURNAL_PATHS) {
    const path = join(repoRoot, relativePath);
    const journalEntries = allEntries.filter((value) => value.journalPath === relativePath);
    const activeJournalEntries = journalEntries.filter((value) => !retiredSubmissionIds.has(value.entry.submission_id));
    journalInputs.push({
      path: relativePath,
      sha256: fileSha256(path),
      accepted_submission_count: journalEntries.length,
      active_submission_count: activeJournalEntries.length,
      retired_submission_count: journalEntries.length - activeJournalEntries.length,
      materialized_submission_count: activeJournalEntries.filter((value) => materializedSubmissionCounts.get(value.entry.submission_id) === 1).length,
      projected_record_count: projectedCounts.get(relativePath) ?? 0,
    });
  }

  return {
    recordsById,
    journalByRecordId,
    entriesBySubmissionId,
    journalInputs,
    retiredSubmissionIds,
    reblockingDecisionByReplacementSubmissionId,
    obsoleteEvidenceIds,
    reblockingLineage: {
      remediation_id: remediation.remediation_id,
      original_journal: {
        path: STATEN_ORIGINAL_JOURNAL_PATH,
        sha256: STATEN_ORIGINAL_JOURNAL_SHA256,
        accepted_submission_count: originalSubmissionIds.size,
        retired_submission_count: remediationOriginalIds.size,
        active_submission_count: originalSubmissionIds.size - remediationOriginalIds.size,
      },
      superseding_journal: {
        path: STATEN_REPLACEMENT_JOURNAL_PATH,
        sha256: STATEN_REPLACEMENT_JOURNAL_SHA256,
        accepted_submission_count: replacementSubmissionIds.size,
        active_submission_count: remediationReplacementIds.size,
      },
      remediation: {
        path: STATEN_REBLOCKING_REMEDIATION_PATH,
        sha256: STATEN_REBLOCKING_REMEDIATION_SHA256,
        manifest_path: STATEN_REBLOCKING_MANIFEST_PATH,
        manifest_sha256: fileSha256(join(repoRoot, STATEN_REBLOCKING_MANIFEST_PATH)),
      },
      current_primary_blocks: {
        path: remediation.pinned_inputs.current_primary_blocks_path,
        sha256: remediation.pinned_inputs.current_primary_blocks_sha256,
      },
      retirement_ledger: {
        path: RETIREMENT_LEDGER_PATH,
        sha256: fileSha256(join(repoRoot, RETIREMENT_LEDGER_PATH)),
        campaign_retirement_count: campaignRetirements.length,
      },
      obsolete_evidence_id_count: obsoleteEvidenceIds.size,
      obsolete_evidence_ids_sha256: sha256(stableJson([...obsoleteEvidenceIds].sort(compareStrings) as never)),
      replacement_submission_ids_sha256: sha256(stableJson([...remediationReplacementIds].sort(compareStrings) as never)),
    },
    reblockingRemediationId: remediation.remediation_id,
    currentPrimaryBlocksPath: remediation.pinned_inputs.current_primary_blocks_path,
    currentPrimaryBlocksSha256: remediation.pinned_inputs.current_primary_blocks_sha256,
    activeSubmissionCount: activeEntries.length,
    retiredSubmissionCount: retiredEntries.length,
    projectedRecordCount: projectedRecords.length,
  };
}

const blocksCache = new Map<string, Map<string, StagedSourceBlock>>();

function sourceBlocks(sourceId: string): Map<string, StagedSourceBlock> {
  const prior = blocksCache.get(sourceId);
  if (prior) return prior;
  const path = join(repoRoot, "raw", "sources", sourceId, "blocks.jsonl");
  invariant(existsSync(path), `missing staged evidence blocks: raw/sources/${sourceId}/blocks.jsonl`);
  const blocks = new Map(readJsonl<StagedSourceBlock>(path).map((block) => [block.block_id, block]));
  blocksCache.set(sourceId, blocks);
  return blocks;
}

function cachedPdfTextBlock(sourceId: string, blockId: string): StagedSourceBlock | undefined {
  const match = /^p(\d{3,})_p(\d{4,})$/u.exec(blockId);
  if (!match) return undefined;
  const pageNumber = Number.parseInt(match[1]!, 10);
  const targetBlockNumber = Number.parseInt(match[2]!, 10);
  const pagePath = join(repoRoot, "raw", "sources", sourceId, "pdf-text", "pages", `p${String(pageNumber).padStart(3, "0")}.txt`);
  if (!existsSync(pagePath)) return undefined;
  let pageBlock = 0;
  let lineStart = 0;
  for (const line of readFileSync(pagePath, "utf8").split("\n")) {
    const normalizedText = line.replace(/\u00a0/gu, " ").replace(/[ \t]+/gu, " ").trim();
    if (normalizedText) {
      pageBlock += 1;
      if (pageBlock === targetBlockNumber) {
        return {
          source_id: sourceId,
          block_id: blockId,
          page_number: pageNumber,
          reading_order: pageBlock,
          source_surface: "pdf_text",
          block_kind: "text",
          raw_source_path: `raw/sources/${sourceId}/pdf-text/pages/p${String(pageNumber).padStart(3, "0")}.txt`,
          raw_start_char: lineStart,
          raw_end_char: lineStart + line.length,
          raw_text: line,
          normalized_text: normalizedText,
          raw_text_sha256: `sha256:${sha256(line)}`,
          normalized_text_sha256: `sha256:${sha256(normalizedText)}`,
          ocr_engine: "poppler-pdftotext",
          ocr_model: "pdftotext-layout",
        };
      }
    }
    lineStart += line.length + 1;
  }
  return undefined;
}

function verifyRelationEvidence(record: MtaCanonicalRecord): RelationEvidenceProof[] {
  invariant(record.evidence_refs.length > 0, `${record.record_id} has no evidence refs`);
  return record.evidence_refs.map((ref) => {
    invariant(ref.evidence_id && ref.block_id && ref.text_sha256, `${record.record_id}/${ref.evidence_id} lacks exact evidence id/block/hash`);
    const stagedBlock = sourceBlocks(ref.source_id).get(ref.block_id);
    const block = stagedBlock ?? cachedPdfTextBlock(ref.source_id, ref.block_id);
    invariant(block, `${record.record_id}/${ref.evidence_id} block does not resolve`);
    invariant(block.raw_text_sha256 === ref.text_sha256, `${record.record_id}/${ref.evidence_id} evidence hash mismatch`);
    if (ref.source_quote) {
      const text = block.raw_text.replace(/\s+/gu, " ").trim();
      const quote = ref.source_quote.replace(/\s+/gu, " ").trim();
      invariant(text.includes(quote), `${record.record_id}/${ref.evidence_id} quote mismatch`);
    }
    return {
      source_id: ref.source_id,
      evidence_id: ref.evidence_id,
      block_id: ref.block_id,
      text_sha256: ref.text_sha256,
      page_number: ref.page_number ?? null,
      verification_surface: stagedBlock ? "staged_blocks" : "cached_pdf_text_page",
    };
  });
}

function relationRank(record: MtaCanonicalRecord): number {
  const kind = record.payload.relation_kind;
  if (kind === "operates_on_corridor") return 0;
  if (kind === "serves_route") return 1;
  if (kind === "affects_route") return 2;
  return 3;
}

function buildReport(summary: Record<string, unknown>): string {
  const statuses = summary.exclusive_primary_status_counts as Record<string, number>;
  const shards = summary.shard_counts as Record<string, Record<string, number>>;
  const reasons = summary.nonexclusive_reason_counts as Record<string, number>;
  const pendingMaterialization = summary.pending_materialization as Record<string, number>;
  const statenMigration = summary.staten_island_selected_proof_migration as {
    before: Record<string, number>;
    after: Record<string, number>;
    relation_identity_change_count: number;
    candidate_conclusion_change_count: number;
  };
  return `# Bus-lane supported-linkage reconciliation v2\n\n` +
    `All **${summary.supported_candidate_count} / ${LINKAGE_RECONCILIATION_EXPECTED_COUNT}** generic linkage-supported acquisition candidates resolve to one exact route-specific canonical or accepted-pending relation.\n\n` +
    `- Verified existing: **${statuses.verified_existing}**\n` +
    `- Implemented pending materialization: **${statuses.implemented_pending}**\n` +
    `- Endpoint/type/evidence-invalid proofs: **0**\n` +
    `- Study-projectable candidates: **0**\n\n` +
    `## Shards\n\n` +
    SHARDS.map((shard) => `- ${shard}: ${shards[shard]!.candidate_count} candidates (${shards[shard]!.verified_existing} existing, ${shards[shard]!.implemented_pending} pending)`).join("\n") +
    `\n\n## Variant precision\n\n` +
    `The eight \`+\`/SBS candidates are matched only to SBS canonical route records and authoritative SBS evidence. The BX12 local candidate is not in the supported set; only BX12+ is reconciled. Manhattan M60+/125th Street and M15+/Second Avenue are explicit existing-canonical proofs even though the Manhattan gap-action artifact covers only four Third Avenue rows.\n\n` +
    `## Staten Island evidence supersession\n\n` +
    `The immutable original Staten Island journal remains pinned. Its 20 evidence-reblocked submissions are retired by the live override ledger and replaced append-only by the pinned superseding journal. Of the selected candidate proofs, **${summary.selected_staten_island_superseded_proof_count}** now resolve through replacement relation submissions with current Chandra primary-block ids and hashes; **${summary.selected_staten_island_original_journal_proof_count}** unaffected Hylan proofs remain on the original journal.\n\n` +
    `Before migration, all 12 pending Staten Island proofs pointed at the original journal and the nine affected proofs carried ${statenMigration.before.obsolete_evidence_reference_count} obsolete evidence references. After migration, 3 proofs remain on the original journal, 9 point at the superseding journal, obsolete references are ${statenMigration.after.obsolete_evidence_reference_count}, and the affected proofs carry ${statenMigration.after.current_primary_evidence_reference_count} current primary-block references. Relation identity changes: ${statenMigration.relation_identity_change_count}; candidate conclusion changes: ${statenMigration.candidate_conclusion_change_count}.\n\n` +
    `Across all pending linkage journals, ${pendingMaterialization.active_submission_count} active submissions materialize to ${pendingMaterialization.projected_record_count} records under current validation; ${pendingMaterialization.retired_submission_count} retired submissions materialize to none. Selected proofs citing obsolete evidence: **${summary.obsolete_relation_evidence_reference_count}**.\n\n` +
    `## Remaining non-exclusive reasons\n\n` +
    Object.entries(reasons).sort(([left], [right]) => compareStrings(left, right)).map(([reason, count]) => `- ${reason}: ${count}`).join("\n") +
    `\n\nOne B82+ row has exact segment evidence, so segment absence applies to 53 rather than 54 rows. No row has the joint exact phase/date/occurrence proof required for projection. All 54 remain excluded, unresolved, and nonprojectable.\n\n` +
    `## Reproduce\n\n\`\`\`bash\n` +
    `bun data/quality/relationship-integrity/bus-lane-acquisition/linkage-reconciliation/reconcile.ts --check\n` +
    `bun test data/quality/relationship-integrity/bus-lane-acquisition/linkage-reconciliation/reconcile.test.ts\n` +
    `\`\`\`\n`;
}

export function buildLinkageReconciliationCampaign(): LinkageReconciliationCampaign {
  blocksCache.clear();
  const campaignLines = readJsonlWithRaw<CampaignRow>(CAMPAIGN_PATH);
  const supportedLines = campaignLines
    .filter((line) => line.value.relationship_proof.authoritative_route_treatment_binding_proved)
    .sort((left, right) => compareStrings(left.value.candidate.candidate_id, right.value.candidate.candidate_id));
  invariant(supportedLines.length === LINKAGE_RECONCILIATION_EXPECTED_COUNT, `support gate changed: ${supportedLines.length}`);
  invariant(new Set(supportedLines.map((line) => line.value.candidate.candidate_id)).size === supportedLines.length, "supported candidate collision");
  for (const { value: row } of supportedLines) {
    invariant(row.schema_version === 1 && row.campaign_id === "registry-only-bus-lane-acquisition-v1", `${row.candidate.candidate_id} campaign identity mismatch`);
    invariant(row.candidate_set_id === CANDIDATE_SET_ID && row.candidate_set_sha256 === CANDIDATE_SET_SHA256, `${row.candidate.candidate_id} candidate-set mismatch`);
    invariant(row.outcome.exclusive_primary_disposition === "linkage_supported_phase_unresolved", `${row.candidate.candidate_id} acquisition disposition mismatch`);
    invariant(row.outcome.registry_projection_excluded && row.outcome.still_unresolved && !row.outcome.study_projection_eligible, `${row.candidate.candidate_id} projection state mismatch`);
  }
  const campaignById = new Map(supportedLines.map((line) => [line.value.candidate.candidate_id, line]));

  const { specs, formatCounts } = normalizeActionSpecs();
  const specById = new Map(specs.map((spec) => [spec.candidateId, spec]));
  invariant(
    stableJson([...campaignById.keys()].sort(compareStrings) as never) === stableJson([...specById.keys()].sort(compareStrings) as never),
    "supported campaign/action candidate inventories do not reconcile",
  );

  const canonicalRecords = readCanonicalRecordsFromJsonl();
  const canonicalById = new Map(canonicalRecords.map((record) => [record.record_id, record]));
  const canonicalRelationHashes = rawCanonicalRelationHashes();
  const pending = loadPendingRecords();
  const combinedById = new Map(canonicalById);
  for (const [recordId, record] of pending.recordsById) combinedById.set(recordId, record);

  const receiptIndexByShard = new Map<Shard, Map<string, { value: Receipt; sha256: string }>>();
  const sourceIndexByShard = new Map<Shard, Map<string, AcquiredSourceChecks["sources"][number]>>();
  const shardInputHashes: Array<Record<string, unknown>> = [];
  for (const shard of SHARDS) {
    const receiptPath = join(SHARDS_DIR, shard, "receipts.jsonl");
    const receiptRows = readJsonlWithRaw<Receipt>(receiptPath);
    receiptIndexByShard.set(shard, new Map(receiptRows.map((row) => [row.value.candidate.candidate_id, { value: row.value, sha256: row.sha256 }])));
    const sourceChecksPath = join(SHARDS_DIR, shard, "acquired-source-checks.json");
    const sourceChecks = readJson<AcquiredSourceChecks>(sourceChecksPath);
    invariant(sourceChecks.schema_version === 1 && sourceChecks.shard === shard, `${shard} source inventory identity mismatch`);
    invariant(sourceChecks.candidate_set_id === CANDIDATE_SET_ID && sourceChecks.candidate_set_sha256 === CANDIDATE_SET_SHA256, `${shard} source inventory candidate-set mismatch`);
    sourceIndexByShard.set(shard, new Map(sourceChecks.sources.map((source) => [source.id, source])));
    shardInputHashes.push({
      shard,
      action_path: relative(repoRoot, ACTION_PATHS[shard]),
      action_sha256: fileSha256(ACTION_PATHS[shard]),
      receipts_path: relative(repoRoot, receiptPath),
      receipts_sha256: fileSha256(receiptPath),
      source_checks_path: relative(repoRoot, sourceChecksPath),
      source_checks_sha256: fileSha256(sourceChecksPath),
    });
  }

  const rows: LinkageReconciliationRow[] = [];
  for (const supported of supportedLines) {
    const campaignRow = supported.value;
    const candidate = campaignRow.candidate;
    const spec = specById.get(candidate.candidate_id)!;
    invariant(spec.shard === campaignRow.shard, `${candidate.candidate_id} shard action mismatch`);
    const receiptEntry = receiptIndexByShard.get(campaignRow.shard)!.get(candidate.candidate_id);
    invariant(receiptEntry, `${candidate.candidate_id} receipt missing`);
    const receipt = receiptEntry.value;
    invariant(receipt.receipt_id === campaignRow.acquisition.receipt_id, `${candidate.candidate_id} receipt id mismatch`);
    invariant(receiptEntry.sha256 === campaignRow.provenance.receipt_row_sha256, `${candidate.candidate_id} receipt provenance hash mismatch`);
    invariant(receipt.claim_results.exact_route_treatment_binding_proved, `${candidate.candidate_id} receipt support missing`);
    invariant(receipt.claim_results.exact_segment_binding_proved === campaignRow.relationship_proof.exact_candidate_segment_binding_proved, `${candidate.candidate_id} segment result mismatch`);
    invariant(!receipt.claim_results.explicit_phase_identity_proved && !receipt.claim_results.date_and_phase_proved, `${candidate.candidate_id} unexpectedly proves phase/date`);
    invariant(!receipt.claim_results.operational_occurrence_identity_proved && !receipt.canonical_actions.operational_occurrence_added_or_updated, `${candidate.candidate_id} unexpectedly proves/updates occurrence`);
    invariant(receipt.outcome.registry_projection_excluded && receipt.outcome.still_unresolved && !receipt.outcome.study_projection_eligible, `${candidate.candidate_id} receipt projection state mismatch`);

    const sourceIndex = sourceIndexByShard.get(campaignRow.shard)!;
    const exactEvidence = receipt.claim_results.exact_route_binding_evidence
      .map((item) => ({ item, match: receiptEvidenceMatch(item, candidate.route_id), source: sourceIndex.get(item.source_id) }))
      .filter((value): value is typeof value & { match: NonNullable<typeof value.match>; source: NonNullable<typeof value.source> } => Boolean(value.match && value.source))
      .filter(({ item, source }) => source.retrieval_status === "acquired" && source.content_sha256 === item.source_sha256)
      .sort((left, right) => {
        const leftRank = left.item.evidence_kind === "official_project_route_statement" ? 0 : 1;
        const rightRank = right.item.evidence_kind === "official_project_route_statement" ? 0 : 1;
        return leftRank - rightRank || compareStrings(left.item.source_id, right.item.source_id) || compareStrings(left.item.source_row_sha256 ?? "", right.item.source_row_sha256 ?? "");
      });
    invariant(exactEvidence.length > 0, `${candidate.candidate_id} has no exact authoritative route-variant evidence`);
    const chosenEvidence = exactEvidence[0]!;
    invariant(/^[0-9a-f]{64}$/u.test(chosenEvidence.item.source_sha256), `${candidate.candidate_id} source hash malformed`);

    const relationCandidates = spec.relationIds.map((relationId) => {
      const record = spec.status === "verified_existing" ? canonicalById.get(relationId) : pending.recordsById.get(relationId);
      invariant(record, `${candidate.candidate_id} missing ${spec.status} relation ${relationId}`);
      invariant(record.record_kind === "relation", `${relationId} is not a relation`);
      return record;
    });
    const matchingRelations = relationCandidates.filter((relation) => {
      const subjectId = relation.payload.subject_id;
      const objectId = relation.payload.object_id;
      if (typeof subjectId !== "string" || typeof objectId !== "string") return false;
      const subject = combinedById.get(subjectId);
      const object = combinedById.get(objectId);
      return Boolean((subject && routeRecordMatches(subject, candidate.route_id)) || (object && routeRecordMatches(object, candidate.route_id)));
    }).sort((left, right) => relationRank(left) - relationRank(right) || compareStrings(left.record_id, right.record_id));
    invariant(matchingRelations.length > 0, `${candidate.candidate_id} action has no exact route-variant relation`);
    const selectedRelation = matchingRelations[0]!;
    const pendingRelation =
      spec.status === "implemented_pending"
        ? selectedRelation
        : null;
    const relation =
      spec.status === "implemented_pending"
        ? canonicalById.get(selectedRelation.record_id)
        : selectedRelation;
    invariant(
      relation,
      `${selectedRelation.record_id} accepted submission has not materialized into current canonical data`,
    );
    if (pendingRelation) {
      for (const key of [
        "relation_kind",
        "relation_family",
        "subject_id",
        "object_id",
      ] as const) {
        invariant(
          relation.payload[key] === pendingRelation.payload[key],
          `${relation.record_id} canonical materialization changed ${key}`,
        );
      }
      const pendingEvidence = verifyRelationEvidence(pendingRelation)
        .sort((left, right) =>
          compareStrings(left.evidence_id, right.evidence_id)
        );
      const canonicalEvidence = verifyRelationEvidence(relation)
        .sort((left, right) =>
          compareStrings(left.evidence_id, right.evidence_id)
        );
      invariant(
        stableJson(pendingEvidence as never) ===
          stableJson(canonicalEvidence as never),
        `${relation.record_id} canonical materialization changed exact evidence`,
      );
      invariant(
        pendingRelation.submission_ids.every((submissionId) =>
          relation.submission_ids.includes(submissionId)
        ),
        `${relation.record_id} canonical materialization lost accepted-submission lineage`,
      );
    }
    const relationKind = relation.payload.relation_kind;
    const relationFamily = relation.payload.relation_family;
    const subjectId = relation.payload.subject_id;
    const objectId = relation.payload.object_id;
    invariant(typeof relationKind === "string" && typeof relationFamily === "string", `${relation.record_id} lacks relation kind/family`);
    invariant(typeof subjectId === "string" && typeof objectId === "string", `${relation.record_id} lacks canonical endpoints`);
    const endpointMap = canonicalById;
    const subject = endpointMap.get(subjectId);
    const object = endpointMap.get(objectId);
    invariant(subject && object, `${relation.record_id} endpoint does not resolve`);
    const shapeIssue = relationEndpointShapeIssue(relationKind, subject.record_kind, object.record_kind);
    invariant(!shapeIssue, `${relation.record_id} endpoint type invalid: ${shapeIssue?.message ?? "unknown"}`);
    const routeEndpoints = [subject, object].filter((record) => routeRecordMatches(record, candidate.route_id));
    invariant(routeEndpoints.length === 1, `${relation.record_id} must have one exact ${candidate.route_id} route endpoint`);
    const routeEndpoint = routeEndpoints[0]!;
    if (spec.routeRecordId) invariant(routeEndpoint.record_id === spec.routeRecordId, `${candidate.candidate_id} declared route endpoint mismatch`);
    const contextEndpoint = subject.record_id === routeEndpoint.record_id ? object : subject;
    invariant(["project", "corridor", "treatment", "treatment_component", "segment"].includes(contextEndpoint.record_kind), `${relation.record_id} context endpoint is not physical/project scope: ${contextEndpoint.record_kind}`);
    const evidenceRefs = verifyRelationEvidence(relation);
    const recordHash = canonicalRelationHashes.get(
      relation.record_id,
    );
    invariant(recordHash, `${relation.record_id} record hash missing`);
    const pendingJournalPath = spec.status === "implemented_pending" ? pending.journalByRecordId.get(relation.record_id) : undefined;
    if (spec.status === "implemented_pending") invariant(pendingJournalPath, `${relation.record_id} pending journal provenance missing`);
    const pendingSubmissionIds = spec.status === "implemented_pending"
      ? [...pendingRelation!.submission_ids].sort(compareStrings)
      : [];
    if (spec.status === "implemented_pending") {
      invariant(pendingSubmissionIds.length > 0, `${relation.record_id} has no active pending submissions`);
      for (const submissionId of pendingSubmissionIds) {
        invariant(!pending.retiredSubmissionIds.has(submissionId), `${relation.record_id} cites retired pending submission ${submissionId}`);
        const entry = pending.entriesBySubmissionId.get(submissionId);
        invariant(entry, `${relation.record_id} cites unknown pending submission ${submissionId}`);
        invariant(entry.journalPath === pendingJournalPath, `${relation.record_id}/${submissionId} journal provenance mismatch`);
      }
    }
    const replacementDecisions = pendingSubmissionIds
      .map((submissionId) => pending.reblockingDecisionByReplacementSubmissionId.get(submissionId))
      .filter((decision): decision is NonNullable<typeof decision> => Boolean(decision));
    invariant(replacementDecisions.length <= 1, `${relation.record_id} maps to multiple Staten Island supersession decisions`);
    const replacementDecision = replacementDecisions[0];
    let supersession: RelationSupersessionProof | null = null;
    if (replacementDecision) {
      invariant(campaignRow.shard === "staten-island", `${relation.record_id} has Staten Island supersession outside Staten Island shard`);
      invariant(pendingJournalPath === STATEN_REPLACEMENT_JOURNAL_PATH, `${relation.record_id} does not use the effective Staten Island replacement journal`);
      invariant(replacementDecision.observation_kind === "relation", `${relation.record_id} supersession decision is not a relation`);
      const relationLocalObservationIds = relation.local_observation_ids ?? [relation.local_observation_id];
      invariant(
        relationLocalObservationIds.includes(replacementDecision.local_observation_id),
        `${relation.record_id} supersession local identity mismatch`,
      );
      invariant(pending.retiredSubmissionIds.has(replacementDecision.original_submission_id), `${relation.record_id} original submission is not retired`);
      const originalEntry = pending.entriesBySubmissionId.get(replacementDecision.original_submission_id);
      invariant(originalEntry?.journalPath === STATEN_ORIGINAL_JOURNAL_PATH, `${relation.record_id} original journal lineage mismatch`);
      const replacementEntry = pending.entriesBySubmissionId.get(replacementDecision.replacement_submission_id);
      invariant(replacementEntry?.journalPath === STATEN_REPLACEMENT_JOURNAL_PATH, `${relation.record_id} replacement journal lineage mismatch`);
      const relationEvidenceIds = evidenceRefs.map((ref) => ref.evidence_id).sort(compareStrings);
      invariant(
        stableJson(relationEvidenceIds as never) === stableJson([...replacementDecision.new_evidence_ids].sort(compareStrings) as never),
        `${relation.record_id} does not expose the reviewed replacement evidence ids`,
      );
      invariant(
        evidenceRefs.every((ref) =>
          ref.source_id !== "better_buses_action_plan_2019" ||
          (ref.verification_surface === "staged_blocks" && /^p0(?:26|28)_c\d{4}$/u.test(ref.block_id))),
        `${relation.record_id} does not use current Chandra primary-block evidence`,
      );
      supersession = {
        remediation_id: pending.reblockingRemediationId,
        remediation_path: STATEN_REBLOCKING_REMEDIATION_PATH,
        remediation_sha256: STATEN_REBLOCKING_REMEDIATION_SHA256,
        original_journal_path: STATEN_ORIGINAL_JOURNAL_PATH,
        original_journal_sha256: STATEN_ORIGINAL_JOURNAL_SHA256,
        retired_submission_id: replacementDecision.original_submission_id,
        replacement_journal_path: STATEN_REPLACEMENT_JOURNAL_PATH,
        replacement_journal_sha256: STATEN_REPLACEMENT_JOURNAL_SHA256,
        replacement_submission_id: replacementDecision.replacement_submission_id,
        current_primary_blocks_path: pending.currentPrimaryBlocksPath,
        current_primary_blocks_sha256: pending.currentPrimaryBlocksSha256,
      };
    } else {
      invariant(pendingJournalPath !== STATEN_REPLACEMENT_JOURNAL_PATH, `${relation.record_id} uses the replacement journal without supersession lineage`);
    }

    rows.push({
      schema_version: 2,
      campaign_id: LINKAGE_RECONCILIATION_CAMPAIGN_ID,
      candidate_id: candidate.candidate_id,
      shard: campaignRow.shard,
      identity: candidate.identity,
      route_id: candidate.route_id,
      normalized_route_id: candidate.normalized_route_id,
      route_variant: routeDescriptor(candidate.route_id).sbs ? "sbs_plus" : "non_sbs",
      corridor_literal: candidate.corridor,
      exclusive_primary_status: spec.status,
      action_format: spec.actionFormat,
      action_row_sha256: spec.actionRowSha256,
      campaign_row_sha256: supported.sha256,
      receipt_id: receipt.receipt_id,
      receipt_row_sha256: receiptEntry.sha256,
      authoritative_linkage_evidence: {
        evidence_kind: chosenEvidence.item.evidence_kind,
        source_id: chosenEvidence.item.source_id,
        source_sha256: chosenEvidence.item.source_sha256,
        source_url: chosenEvidence.source.url,
        source_category: chosenEvidence.source.category,
        retrieved_on: chosenEvidence.source.retrieved_on,
        route_field: chosenEvidence.match.field,
        official_routes: [...chosenEvidence.match.routes],
        route_variant_confirmation: chosenEvidence.match.variantConfirmation,
        route_variant_block: chosenEvidence.match.variantBlock ? {
          staged_source_id: chosenEvidence.match.variantBlock.source_id,
          block_id: chosenEvidence.match.variantBlock.block_id,
          text_sha256: chosenEvidence.match.variantBlock.raw_text_sha256,
        } : null,
        supported_statement: chosenEvidence.item.supported_claim ?? chosenEvidence.item.support_note ?? "Official source explicitly binds the route variant to the bus-lane project or corridor.",
        locator: chosenEvidence.item.locator ?? null,
        source_row_sha256: chosenEvidence.item.source_row_sha256 ?? null,
      },
      relation_proof: {
        relation_id: relation.record_id,
        record_status: spec.status === "verified_existing" ? "canonical_existing" : "accepted_pending_submission",
        current_canonical_materialization: true,
        record_sha256: recordHash,
        pending_journal_path: pendingJournalPath ?? null,
        pending_submission_ids: pendingSubmissionIds,
        supersession,
        relation_kind: relationKind,
        relation_family: relationFamily,
        subject_id: subjectId,
        subject_kind: subject.record_kind,
        subject_status: canonicalById.has(subjectId) ? "canonical" : "accepted_pending",
        object_id: objectId,
        object_kind: object.record_kind,
        object_status: canonicalById.has(objectId) ? "canonical" : "accepted_pending",
        route_endpoint_id: routeEndpoint.record_id,
        route_variant_exact: true,
        endpoints_resolve: true,
        endpoint_type_valid: true,
        local_observation_only_endpoint: false,
        relation_evidence_hash_valid: true,
        relation_evidence_refs: evidenceRefs,
      },
      nonexclusive_reason_codes: [...campaignRow.outcome.nonexclusive_reason_codes].sort(compareStrings),
      exact_candidate_segment_binding_proved: campaignRow.relationship_proof.exact_candidate_segment_binding_proved,
      explicit_phase_identity_proved: false,
      candidate_date_and_phase_proved: false,
      canonical_operational_occurrence_identity_proved: false,
      operational_occurrence_added_or_updated: false,
      registry_projection_excluded: true,
      still_unresolved: true,
      study_projection_eligible: false,
    });
  }
  rows.sort((left, right) => compareStrings(left.candidate_id, right.candidate_id));

  const statusCounts = {
    verified_existing: rows.filter((row) => row.exclusive_primary_status === "verified_existing").length,
    implemented_pending: rows.filter((row) => row.exclusive_primary_status === "implemented_pending").length,
  };
  invariant(statusCounts.verified_existing === LINKAGE_RECONCILIATION_EXPECTED_STATUS_COUNTS.verified_existing, `verified-existing count changed: ${statusCounts.verified_existing}`);
  invariant(statusCounts.implemented_pending === LINKAGE_RECONCILIATION_EXPECTED_STATUS_COUNTS.implemented_pending, `implemented-pending count changed: ${statusCounts.implemented_pending}`);
  const shardCounts = Object.fromEntries(SHARDS.map((shard) => {
    const shardRows = rows.filter((row) => row.shard === shard);
    return [shard, {
      candidate_count: shardRows.length,
      verified_existing: shardRows.filter((row) => row.exclusive_primary_status === "verified_existing").length,
      implemented_pending: shardRows.filter((row) => row.exclusive_primary_status === "implemented_pending").length,
    }];
  })) as Record<Shard, { candidate_count: number; verified_existing: number; implemented_pending: number }>;
  invariant(stableJson(Object.fromEntries(SHARDS.map((shard) => [shard, shardCounts[shard].candidate_count])) as never) === stableJson({ bronx: 13, "brooklyn-null": 8, manhattan: 6, queens: 5, "staten-island": 22 } as never), "shard count gate changed");
  const reasonCounts: Record<string, number> = {};
  for (const row of rows) for (const reason of row.nonexclusive_reason_codes) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  invariant(stableJson(reasonCounts as never) === stableJson({
    exact_candidate_segment_binding_unproved: 53,
    explicit_phase_identity_unproved: 54,
    candidate_date_and_phase_unproved: 54,
    canonical_operational_occurrence_identity_unproved: 54,
    operational_occurrence_not_added_or_updated: 54,
  } as never), "non-exclusive reason counts changed");
  const plusRows = rows.filter((row) => row.route_variant === "sbs_plus");
  invariant(plusRows.length === 8, `SBS/+ candidate count changed: ${plusRows.length}`);
  invariant(plusRows.some((row) => row.route_id === "BX12+") && !rows.some((row) => row.route_id === "BX12"), "BX12 local/plus support gate violated");
  invariant(rows.some((row) => row.route_id === "M60+" && row.relation_proof.relation_id === MANHATTAN_EXISTING["study-event-v2:36551be6cc4f3abae2c9ef45"]!.relationId), "M60+ existing proof missing");
  invariant(rows.some((row) => row.route_id === "M15+" && row.relation_proof.relation_id === MANHATTAN_EXISTING["study-event-v2:7387d0a52f633437de6fd4d7"]!.relationId), "M15+ existing proof missing");
  const supersededProofRows = rows.filter((row) => row.relation_proof.supersession !== null);
  invariant(supersededProofRows.length === 9, `selected Staten Island superseded relation-proof count changed: ${supersededProofRows.length}`);
  invariant(
    supersededProofRows.every((row) =>
      row.shard === "staten-island" &&
      row.relation_proof.pending_journal_path === STATEN_REPLACEMENT_JOURNAL_PATH &&
      row.relation_proof.relation_evidence_refs.every((ref) =>
        ref.source_id !== "better_buses_action_plan_2019" ||
        (ref.verification_surface === "staged_blocks" && /^p0(?:26|28)_c\d{4}$/u.test(ref.block_id)))),
    "selected Staten Island replacement proofs do not all use current primary-block evidence",
  );
  invariant(
    rows.every((row) =>
      row.relation_proof.relation_evidence_refs.every((ref) => !pending.obsoleteEvidenceIds.has(ref.evidence_id))),
    "a selected relation proof cites superseded Staten Island evidence",
  );
  const selectedPendingJournalCounts = Object.fromEntries(
    [...new Set(rows.map((row) => row.relation_proof.pending_journal_path).filter((path): path is string => Boolean(path)))]
      .sort(compareStrings)
      .map((path) => [path, rows.filter((row) => row.relation_proof.pending_journal_path === path).length]),
  );
  invariant(selectedPendingJournalCounts[STATEN_ORIGINAL_JOURNAL_PATH] === 3, "effective original Staten Island selected-proof count changed");
  invariant(selectedPendingJournalCounts[STATEN_REPLACEMENT_JOURNAL_PATH] === 9, "effective replacement Staten Island selected-proof count changed");
  const selectedSupersessionReplacementSubmissionIds = new Set(
    supersededProofRows.map((row) => row.relation_proof.supersession!.replacement_submission_id),
  );
  const selectedSupersessionDecisions = [...selectedSupersessionReplacementSubmissionIds]
    .map((submissionId) => pending.reblockingDecisionByReplacementSubmissionId.get(submissionId))
    .filter((decision): decision is NonNullable<typeof decision> => Boolean(decision));
  invariant(selectedSupersessionDecisions.length === 9, "selected Staten Island supersession decisions do not reconcile");
  const obsoleteEvidenceReferenceCountBefore = selectedSupersessionDecisions
    .reduce((total, decision) => total + decision.old_evidence_ids.length, 0);
  const currentPrimaryEvidenceReferenceCountAfter = supersededProofRows
    .reduce((total, row) => total + row.relation_proof.relation_evidence_refs.length, 0);
  invariant(obsoleteEvidenceReferenceCountBefore === 27, `selected obsolete evidence-reference baseline changed: ${obsoleteEvidenceReferenceCountBefore}`);
  invariant(currentPrimaryEvidenceReferenceCountAfter === 18, `selected current primary evidence-reference count changed: ${currentPrimaryEvidenceReferenceCountAfter}`);

  const rowsContent = stableJsonl(rows);
  const selectedRelations = rows.map((row) => ({
    candidate_id: row.candidate_id,
    relation_id: row.relation_proof.relation_id,
    record_status: row.relation_proof.record_status,
    record_sha256: row.relation_proof.record_sha256,
    pending_journal_path: row.relation_proof.pending_journal_path,
    pending_submission_ids: row.relation_proof.pending_submission_ids,
    superseded_submission_id: row.relation_proof.supersession?.retired_submission_id ?? null,
  }));
  const summary: Record<string, unknown> = {
    schema_version: 2,
    campaign_id: LINKAGE_RECONCILIATION_CAMPAIGN_ID,
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    supported_candidate_count: rows.length,
    reconciled_candidate_count: rows.length,
    unreconciled_candidate_count: 0,
    exclusive_primary_status_counts: statusCounts,
    shard_counts: shardCounts,
    action_format_counts: formatCounts,
    selected_relation_count: selectedRelations.length,
    endpoint_resolved_count: rows.filter((row) => row.relation_proof.endpoints_resolve).length,
    endpoint_type_valid_count: rows.filter((row) => row.relation_proof.endpoint_type_valid).length,
    relation_evidence_hash_valid_count: rows.filter((row) => row.relation_proof.relation_evidence_hash_valid).length,
    exact_authoritative_evidence_count: rows.length,
    obsolete_relation_evidence_reference_count: 0,
    selected_pending_journal_counts: selectedPendingJournalCounts,
    selected_staten_island_superseded_proof_count: supersededProofRows.length,
    selected_staten_island_original_journal_proof_count: selectedPendingJournalCounts[STATEN_ORIGINAL_JOURNAL_PATH],
    staten_island_selected_proof_migration: {
      selected_candidate_proof_count: 12,
      affected_relation_proof_count: supersededProofRows.length,
      unaffected_relation_proof_count: 3,
      before: {
        original_journal_proof_count: 12,
        replacement_journal_proof_count: 0,
        obsolete_evidence_reference_count: obsoleteEvidenceReferenceCountBefore,
        current_primary_evidence_reference_count: 0,
      },
      after: {
        original_journal_proof_count: selectedPendingJournalCounts[STATEN_ORIGINAL_JOURNAL_PATH],
        replacement_journal_proof_count: selectedPendingJournalCounts[STATEN_REPLACEMENT_JOURNAL_PATH],
        obsolete_evidence_reference_count: 0,
        current_primary_evidence_reference_count: currentPrimaryEvidenceReferenceCountAfter,
      },
      relation_identity_change_count: 0,
      candidate_conclusion_change_count: 0,
    },
    pending_materialization: {
      active_submission_count: pending.activeSubmissionCount,
      retired_submission_count: pending.retiredSubmissionCount,
      projected_record_count: pending.projectedRecordCount,
      active_submission_materialization_failure_count: 0,
    },
    sbs_plus_candidate_count: plusRows.length,
    non_sbs_candidate_count: rows.length - plusRows.length,
    exact_candidate_segment_binding_proved_count: rows.filter((row) => row.exact_candidate_segment_binding_proved).length,
    explicit_phase_identity_proved_count: 0,
    candidate_date_and_phase_proved_count: 0,
    canonical_operational_occurrence_identity_proved_count: 0,
    operational_occurrence_added_or_updated_count: 0,
    registry_projection_excluded_count: rows.filter((row) => row.registry_projection_excluded).length,
    still_unresolved_count: rows.filter((row) => row.still_unresolved).length,
    study_projection_eligible_count: rows.filter((row) => row.study_projection_eligible).length,
    nonexclusive_reason_counts: reasonCounts,
    bx12_variant_gate: { supported_bx12_plus: 1, supported_bx12_local: 0 },
    manhattan_existing_plus_proofs: {
      "M60+": MANHATTAN_EXISTING["study-event-v2:36551be6cc4f3abae2c9ef45"]!.relationId,
      "M15+": MANHATTAN_EXISTING["study-event-v2:7387d0a52f633437de6fd4d7"]!.relationId,
    },
    campaign_path: relative(repoRoot, CAMPAIGN_PATH),
    campaign_sha256: fileSha256(CAMPAIGN_PATH),
    campaign_summary_sha256: fileSha256(CAMPAIGN_SUMMARY_PATH),
    selected_relations_sha256: sha256(stableJson(selectedRelations as never)),
    reconciliation_sha256: sha256(rowsContent),
    authorization: "diagnostic_non_authorizing_no_materialization",
  };
  const report = buildReport(summary);
  const artifactContents = [
    { path: "reconciliation.jsonl", content: rowsContent },
    { path: "summary.json", content: `${stableJson(summary as never)}\n` },
    { path: "report.md", content: report },
  ];
  const manifestPayload: Record<string, unknown> = {
    schema_version: 2,
    campaign_id: LINKAGE_RECONCILIATION_CAMPAIGN_ID,
    generated_on: "2026-07-16",
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    candidate_count: rows.length,
    inputs: {
      aggregate_campaign: { path: relative(repoRoot, CAMPAIGN_PATH), sha256: fileSha256(CAMPAIGN_PATH) },
      aggregate_summary: { path: relative(repoRoot, CAMPAIGN_SUMMARY_PATH), sha256: fileSha256(CAMPAIGN_SUMMARY_PATH) },
      shard_inputs: shardInputHashes,
      pending_journals: pending.journalInputs,
      staten_island_evidence_reblocking: pending.reblockingLineage,
      pending_materialization: {
        active_submission_count: pending.activeSubmissionCount,
        retired_submission_count: pending.retiredSubmissionCount,
        projected_record_count: pending.projectedRecordCount,
      },
      selected_relations_sha256: summary.selected_relations_sha256,
    },
    artifacts: artifactContents.map((artifact) => ({ path: artifact.path, sha256: sha256(artifact.content), bytes: Buffer.byteLength(artifact.content) })),
  };
  const manifest = { ...manifestPayload, manifest_payload_sha256: sha256(stableJson(manifestPayload as never)) };
  return { rows, summary, report, manifest };
}

function contents(campaign: LinkageReconciliationCampaign): Record<string, string> {
  return {
    [OUTPUT_JSONL_PATH]: stableJsonl(campaign.rows),
    [SUMMARY_PATH]: `${stableJson(campaign.summary as never)}\n`,
    [REPORT_PATH]: campaign.report,
    [MANIFEST_PATH]: `${stableJson(campaign.manifest as never)}\n`,
  };
}

function applyCampaign(campaign: LinkageReconciliationCampaign): void {
  for (const [path, content] of Object.entries(contents(campaign))) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) writeFileSync(path, content, "utf8");
  }
}

function checkCampaign(campaign: LinkageReconciliationCampaign): void {
  for (const [path, expected] of Object.entries(contents(campaign))) {
    invariant(existsSync(path), `missing generated artifact ${relative(repoRoot, path)}; run --apply`);
    invariant(readFileSync(path, "utf8") === expected, `generated artifact differs: ${relative(repoRoot, path)}; run --apply`);
  }
}

if (import.meta.main) {
  const apply = process.argv.includes("--apply");
  invariant(!(apply && process.argv.includes("--check")), "choose one of --apply or --check");
  const campaign = buildLinkageReconciliationCampaign();
  if (apply) applyCampaign(campaign);
  else checkCampaign(campaign);
  process.stdout.write(`${stableJson({
    mode: apply ? "apply" : "check",
    supported_candidates: campaign.rows.length,
    status_counts: campaign.summary.exclusive_primary_status_counts,
    reconciliation_sha256: campaign.summary.reconciliation_sha256,
    manifest_payload_sha256: campaign.manifest.manifest_payload_sha256,
  } as never)}\n`);
}
