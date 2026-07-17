import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";

export const BUS_LANE_ACQUISITION_CAMPAIGN_ID = "registry-only-bus-lane-acquisition-v1" as const;
export const BUS_LANE_ACQUISITION_CANDIDATE_SET_ID = "candidate-set-v2:24080902f508b55a0033df32" as const;
export const BUS_LANE_ACQUISITION_CANDIDATE_SET_SHA256 = "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba" as const;

const GENERATED_ON = "2026-07-15";
const EXPECTED_CANDIDATE_COUNT = 321;
const RECONCILIATION_LEDGER_PATH = join(
  repoRoot,
  "data",
  "quality",
  "rc19-reject-reconciliation",
  "rc19-reject-ledger.jsonl",
);
const OUTPUT_DIR = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
);
const CAMPAIGN_PATH = join(OUTPUT_DIR, "campaign.jsonl");
const SUMMARY_PATH = join(OUTPUT_DIR, "summary.json");
const REPORT_PATH = join(OUTPUT_DIR, "report.md");
const MANIFEST_PATH = join(OUTPUT_DIR, "manifest.json");

export const BUS_LANE_ACQUISITION_SHARDS = [
  "bronx",
  "brooklyn-null",
  "manhattan",
  "queens",
  "staten-island",
] as const;

export type BusLaneAcquisitionShard = (typeof BUS_LANE_ACQUISITION_SHARDS)[number];

export const REQUIRED_ACQUISITION_CATEGORIES = [
  "official_nyc_dot_lane_project",
  "official_mta_route_project",
  "official_public_board_committee",
  "other_repository_approved_primary",
] as const;

export const NONEXCLUSIVE_REASON_CODES = [
  "authoritative_route_treatment_binding_unproved",
  "exact_candidate_segment_binding_unproved",
  "explicit_phase_identity_unproved",
  "candidate_date_and_phase_unproved",
  "canonical_operational_occurrence_identity_unproved",
  "operational_occurrence_not_added_or_updated",
] as const;

export type NonexclusiveReasonCode = (typeof NONEXCLUSIVE_REASON_CODES)[number];

export type AcquisitionClaimFlags = {
  authoritative_route_treatment_binding_proved: boolean;
  exact_candidate_segment_binding_proved: boolean;
  explicit_phase_identity_proved: boolean;
  candidate_date_and_phase_proved: boolean;
  canonical_operational_occurrence_identity_proved: boolean;
  operational_occurrence_added_or_updated: boolean;
};

type ArtifactDescriptor = {
  path: string;
  sha256: string;
  bytes: number;
};

type ShardManifest = {
  schema_version: number;
  shard: string;
  generated_on: string;
  candidate_set_id: string;
  candidate_set_sha256: string;
  artifacts: ArtifactDescriptor[];
  manifest_payload_sha256: string;
};

type PartitionProof = {
  schema_version: number;
  shard: string;
  candidate_set_id: string;
  candidate_set_sha256: string;
  reconciliation_ledger_path: string;
  reconciliation_ledger_sha256: string;
  exact_backlog_count: number;
  unique_candidate_count: number;
  candidate_ids_sha256: string;
  partition_sha256: string;
};

type PartitionRow = {
  candidate_id: string;
  identity: string;
  route_id: string;
  normalized_route_id: string;
  corridor: string;
  implementation_date: string;
  implementation_month: string;
  date_precision: string;
  source_event_id: string;
  candidate_row_sha256: string;
  ledger_row_sha256: string;
};

type AcquisitionAttempt = {
  category: string;
  query: string;
  query_status: string;
  urls_checked: unknown[];
  retrievals: unknown[];
};

type ReceiptCandidate = PartitionRow & {
  candidate_set_id: string;
  candidate_set_sha256: string;
  treatment_family: string;
  registry_source_id: string;
};

type Receipt = {
  schema_version: number;
  shard: string;
  receipt_id: string;
  researched_on: string;
  candidate: ReceiptCandidate;
  acquisition_attempts: AcquisitionAttempt[];
  claim_results: {
    physical_bus_lane_record_acquired: boolean;
    exact_route_treatment_binding_proved: boolean;
    exact_segment_binding_proved: boolean;
    exact_segment_ids: unknown[];
    explicit_phase_identity_proved: boolean;
    date_and_phase_proved: boolean;
    operational_occurrence_identity_proved: boolean;
    unsupported_claims: string[];
  };
  outcome: {
    exclusive_primary_disposition: string;
    exclusion_reason: string;
    next_action: string;
    registry_projection_excluded: boolean;
    still_unresolved: boolean;
    study_projection_eligible: boolean;
  };
  canonical_actions: {
    operational_occurrence_added_or_updated: boolean;
    [key: string]: unknown;
  };
};

type Exclusion = {
  schema_version: number;
  shard: string;
  candidate_id: string;
  candidate_set_id: string;
  identity: string;
  receipt_id: string;
  exact_route_treatment_binding_proved: boolean;
  phase_identity_proved: boolean;
  study_projection_eligible: boolean;
  excluded_from: string;
  exclusion_rule: string;
  reason: string;
};

type ShardSummary = {
  schema_version: number;
  shard: string;
  candidate_set_id: string;
  candidate_set_sha256: string;
  researched_count: number;
  source_acquired_count: number;
  exact_route_binding_proved_count: number;
  exact_route_binding_proved_candidate_ids: string[];
  segment_binding_proved_count: number;
  segment_binding_proved_candidate_ids: string[];
  date_and_phase_proved_count: number;
  operational_occurrence_added_or_updated_count: number;
  explicitly_excluded_count: number;
  still_unresolved_count: number;
  study_projection_eligible_count: number;
  exclusive_primary_disposition_counts: Record<string, number>;
  receipts_sha256: string;
  exclusions_sha256: string;
};

type LedgerRow = {
  candidate_id: string;
  candidate_set_id: string;
  candidate_set_sha256: string;
  exclusive_primary_disposition: string;
  treatment_family: string;
  route_id: string;
  identity: string;
  implementation_date: string;
  date_precision: string;
};

type RawRow<T> = {
  value: T;
  raw: string;
  row_sha256: string;
};

type ShardInputPin = {
  shard: BusLaneAcquisitionShard;
  manifest_path: string;
  manifest_sha256: string;
  manifest_payload_sha256: string;
  partition_sha256: string;
  receipts_sha256: string;
  exclusions_sha256: string;
  summary_sha256: string;
  candidate_count: number;
};

type ShardCounts = {
  researched: number;
  source_acquired: number;
  authoritative_route_treatment_binding_proved: number;
  exact_segment_binding_proved: number;
  date_and_phase_proved: number;
  operational_occurrence_added_or_updated: number;
  explicitly_excluded: number;
  still_unresolved: number;
};

type ShardBundle = {
  shard: BusLaneAcquisitionShard;
  manifest: ShardManifest;
  manifestPath: string;
  manifestSha256: string;
  partitionPath: string;
  receiptsPath: string;
  exclusionsPath: string;
  summaryPath: string;
  partition: RawRow<PartitionRow>[];
  receipts: RawRow<Receipt>[];
  exclusions: RawRow<Exclusion>[];
  summary: ShardSummary;
  inputPin: ShardInputPin;
  counts: ShardCounts;
};

export type CampaignRow = {
  schema_version: 1;
  campaign_id: typeof BUS_LANE_ACQUISITION_CAMPAIGN_ID;
  candidate_set_id: typeof BUS_LANE_ACQUISITION_CANDIDATE_SET_ID;
  candidate_set_sha256: typeof BUS_LANE_ACQUISITION_CANDIDATE_SET_SHA256;
  candidate: {
    candidate_id: string;
    identity: string;
    route_id: string;
    normalized_route_id: string;
    corridor: string;
    implementation_date: string;
    implementation_month: string;
    date_precision: string;
    source_event_id: string;
  };
  shard: BusLaneAcquisitionShard;
  acquisition: {
    receipt_id: string;
    researched: true;
    researched_on: string;
    required_source_categories_checked: string[];
    physical_bus_lane_source_acquired: boolean;
  };
  relationship_proof: {
    authoritative_route_treatment_binding_proved: boolean;
    source_claim_field: "exact_route_treatment_binding_proved";
    route_binding_precision: "generic_authoritative_route_treatment_or_corridor_link_not_exact_candidate_segment_day_phase_or_occurrence";
    exact_candidate_segment_binding_proved: boolean;
    exact_segment_ids: string[];
    explicit_phase_identity_proved: boolean;
    candidate_date_and_phase_proved: boolean;
    canonical_operational_occurrence_identity_proved: boolean;
    operational_occurrence_added_or_updated: boolean;
  };
  outcome: {
    exclusive_primary_disposition: string;
    nonexclusive_reason_codes: NonexclusiveReasonCode[];
    unsupported_claims: string[];
    registry_projection_excluded: boolean;
    study_projection_eligible: boolean;
    still_unresolved: boolean;
    exclusion_reason: string;
    next_action: string;
  };
  provenance: {
    shard_manifest_path: string;
    shard_manifest_sha256: string;
    partition_path: string;
    partition_row_sha256: string;
    receipt_path: string;
    receipt_row_sha256: string;
    exclusion_path: string;
    exclusion_row_sha256: string;
    reconciliation_ledger_path: string;
    reconciliation_ledger_row_sha256: string;
  };
};

export type BusLaneAcquisitionCampaign = {
  rows: CampaignRow[];
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

function sorted(values: Iterable<string>): string[] {
  return [...values].sort(compareStrings);
}

function stableJsonl(rows: unknown[]): string {
  return `${rows.map((row) => stableJson(row as never)).join("\n")}\n`;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonl<T>(path: string): RawRow<T>[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map((raw) => ({ value: JSON.parse(raw) as T, raw, row_sha256: sha256(raw) }));
}

function sameStrings(left: Iterable<string>, right: Iterable<string>): boolean {
  return stableJson(sorted(left) as never) === stableJson(sorted(right) as never);
}

function countBy(values: Iterable<string>): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => compareStrings(left, right)));
}

function indexUnique<T>(rows: T[], key: (row: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const id = key(row);
    invariant(id.length > 0, `${label} contains an empty identity`);
    invariant(!result.has(id), `${label} contains duplicate identity ${id}`);
    result.set(id, row);
  }
  return result;
}

export function candidateOwnershipCollisions(
  rows: Array<{ candidate_id: string; shard: string }>,
): Array<{ candidate_id: string; shards: string[]; row_count: number }> {
  const ownership = new Map<string, string[]>();
  for (const row of rows) {
    const values = ownership.get(row.candidate_id) ?? [];
    values.push(row.shard);
    ownership.set(row.candidate_id, values);
  }
  return [...ownership.entries()]
    .filter(([, shards]) => shards.length > 1)
    .map(([candidate_id, shards]) => ({
      candidate_id,
      shards: sorted(new Set(shards)),
      row_count: shards.length,
    }))
    .sort((left, right) => compareStrings(left.candidate_id, right.candidate_id));
}

export function nonexclusiveReasonCodes(flags: AcquisitionClaimFlags): NonexclusiveReasonCode[] {
  const reasons: NonexclusiveReasonCode[] = [];
  if (!flags.authoritative_route_treatment_binding_proved) {
    reasons.push("authoritative_route_treatment_binding_unproved");
  }
  if (!flags.exact_candidate_segment_binding_proved) {
    reasons.push("exact_candidate_segment_binding_unproved");
  }
  if (!flags.explicit_phase_identity_proved) reasons.push("explicit_phase_identity_unproved");
  if (!flags.candidate_date_and_phase_proved) reasons.push("candidate_date_and_phase_unproved");
  if (!flags.canonical_operational_occurrence_identity_proved) {
    reasons.push("canonical_operational_occurrence_identity_unproved");
  }
  if (!flags.operational_occurrence_added_or_updated) {
    reasons.push("operational_occurrence_not_added_or_updated");
  }
  return reasons;
}

function shardDir(shard: BusLaneAcquisitionShard): string {
  return join(OUTPUT_DIR, "shards", shard);
}

function manifestArtifact(manifest: ShardManifest, path: string, shard: string): ArtifactDescriptor {
  const matches = manifest.artifacts.filter((artifact) => artifact.path === path);
  invariant(matches.length === 1, `${shard} manifest must pin ${path} exactly once`);
  return matches[0]!;
}

function verifyManifestArtifacts(manifest: ShardManifest, dir: string): void {
  invariant(
    manifest.manifest_payload_sha256 === sha256(stableJson(manifest.artifacts as never)),
    `${manifest.shard} manifest payload hash mismatch`,
  );
  const artifactNames = new Set<string>();
  for (const artifact of manifest.artifacts) {
    invariant(artifact.path === basename(artifact.path), `${manifest.shard} manifest artifact escapes its shard: ${artifact.path}`);
    invariant(!artifactNames.has(artifact.path), `${manifest.shard} manifest duplicates ${artifact.path}`);
    artifactNames.add(artifact.path);
    const path = join(dir, artifact.path);
    invariant(existsSync(path), `${manifest.shard} manifest artifact is missing: ${artifact.path}`);
    const bytes = readFileSync(path);
    invariant(bytes.byteLength === artifact.bytes, `${manifest.shard}/${artifact.path} byte count mismatch`);
    invariant(sha256(bytes) === artifact.sha256, `${manifest.shard}/${artifact.path} hash mismatch`);
  }
}

function receiptFlags(receipt: Receipt): AcquisitionClaimFlags {
  return {
    authoritative_route_treatment_binding_proved: receipt.claim_results.exact_route_treatment_binding_proved,
    exact_candidate_segment_binding_proved: receipt.claim_results.exact_segment_binding_proved,
    explicit_phase_identity_proved: receipt.claim_results.explicit_phase_identity_proved,
    candidate_date_and_phase_proved: receipt.claim_results.date_and_phase_proved,
    canonical_operational_occurrence_identity_proved: receipt.claim_results.operational_occurrence_identity_proved,
    operational_occurrence_added_or_updated: receipt.canonical_actions.operational_occurrence_added_or_updated,
  };
}

function loadShard(shard: BusLaneAcquisitionShard): ShardBundle {
  const dir = shardDir(shard);
  const manifestPath = join(dir, "manifest.json");
  const manifest = readJson<ShardManifest>(manifestPath);
  invariant(manifest.schema_version === 1, `${shard} manifest schema mismatch`);
  invariant(manifest.shard === shard, `${shard} manifest shard mismatch`);
  invariant(manifest.generated_on === GENERATED_ON, `${shard} generation date mismatch`);
  invariant(manifest.candidate_set_id === BUS_LANE_ACQUISITION_CANDIDATE_SET_ID, `${shard} candidate set mismatch`);
  invariant(
    manifest.candidate_set_sha256 === BUS_LANE_ACQUISITION_CANDIDATE_SET_SHA256,
    `${shard} candidate set hash mismatch`,
  );
  verifyManifestArtifacts(manifest, dir);

  const partitionPath = join(dir, "partition.jsonl");
  const proofPath = join(dir, "partition-proof.json");
  const receiptsPath = join(dir, "receipts.jsonl");
  const exclusionsPath = join(dir, "registry-projection-exclusions.jsonl");
  const summaryPath = join(dir, "summary.json");
  const partition = readJsonl<PartitionRow>(partitionPath);
  const proof = readJson<PartitionProof>(proofPath);
  const receipts = readJsonl<Receipt>(receiptsPath);
  const exclusions = readJsonl<Exclusion>(exclusionsPath);
  const summary = readJson<ShardSummary>(summaryPath);

  invariant(proof.schema_version === 1 && proof.shard === shard, `${shard} partition proof identity mismatch`);
  invariant(proof.candidate_set_id === BUS_LANE_ACQUISITION_CANDIDATE_SET_ID, `${shard} proof candidate set mismatch`);
  invariant(
    proof.candidate_set_sha256 === BUS_LANE_ACQUISITION_CANDIDATE_SET_SHA256,
    `${shard} proof candidate set hash mismatch`,
  );
  invariant(proof.exact_backlog_count === EXPECTED_CANDIDATE_COUNT, `${shard} proof backlog count mismatch`);
  invariant(proof.unique_candidate_count === partition.length, `${shard} proof unique count mismatch`);
  invariant(proof.partition_sha256 === fileSha256(partitionPath), `${shard} partition proof hash mismatch`);
  const partitionIds = partition.map((row) => row.value.candidate_id);
  invariant(
    proof.candidate_ids_sha256 === sha256(`${partitionIds.join("\n")}\n`),
    `${shard} candidate-id sequence hash mismatch`,
  );
  invariant(sameStrings(partitionIds, sorted(partitionIds)), `${shard} partition order is not deterministic`);
  invariant(proof.reconciliation_ledger_path === relative(repoRoot, RECONCILIATION_LEDGER_PATH), `${shard} ledger path mismatch`);
  invariant(proof.reconciliation_ledger_sha256 === fileSha256(RECONCILIATION_LEDGER_PATH), `${shard} ledger hash mismatch`);

  const partitionByCandidate = indexUnique(partition, (row) => row.value.candidate_id, `${shard} partition`);
  const receiptByCandidate = indexUnique(receipts, (row) => row.value.candidate.candidate_id, `${shard} receipts`);
  const exclusionByCandidate = indexUnique(exclusions, (row) => row.value.candidate_id, `${shard} exclusions`);
  indexUnique(receipts, (row) => row.value.receipt_id, `${shard} receipt ids`);
  invariant(sameStrings(partitionByCandidate.keys(), receiptByCandidate.keys()), `${shard} partition/receipt coverage mismatch`);
  invariant(sameStrings(partitionByCandidate.keys(), exclusionByCandidate.keys()), `${shard} partition/exclusion coverage mismatch`);

  for (const candidateId of sorted(partitionByCandidate.keys())) {
    const partitionRow = partitionByCandidate.get(candidateId)!.value;
    const receipt = receiptByCandidate.get(candidateId)!.value;
    const exclusion = exclusionByCandidate.get(candidateId)!.value;
    invariant(receipt.schema_version === 1 && receipt.shard === shard, `${candidateId} receipt shard/schema mismatch`);
    invariant(receipt.researched_on === GENERATED_ON, `${candidateId} research date mismatch`);
    invariant(receipt.candidate.candidate_set_id === BUS_LANE_ACQUISITION_CANDIDATE_SET_ID, `${candidateId} receipt candidate set mismatch`);
    invariant(
      receipt.candidate.candidate_set_sha256 === BUS_LANE_ACQUISITION_CANDIDATE_SET_SHA256,
      `${candidateId} receipt candidate set hash mismatch`,
    );
    invariant(receipt.candidate.treatment_family === "bus_lane", `${candidateId} is not bus_lane`);
    for (const field of [
      "candidate_id",
      "identity",
      "route_id",
      "normalized_route_id",
      "corridor",
      "implementation_date",
      "implementation_month",
      "date_precision",
      "source_event_id",
    ] as const) {
      invariant(receipt.candidate[field] === partitionRow[field], `${candidateId} partition/receipt ${field} mismatch`);
    }
    const categories = receipt.acquisition_attempts.map((attempt) => attempt.category);
    invariant(receipt.acquisition_attempts.length === REQUIRED_ACQUISITION_CATEGORIES.length, `${candidateId} acquisition channel count mismatch`);
    invariant(sameStrings(categories, REQUIRED_ACQUISITION_CATEGORIES), `${candidateId} acquisition channel coverage mismatch`);
    invariant(receipt.claim_results.physical_bus_lane_record_acquired, `${candidateId} lacks an acquired physical bus-lane source record`);
    const expectedDisposition = receipt.claim_results.exact_route_treatment_binding_proved
      ? "linkage_supported_phase_unresolved"
      : "completed_search_route_linkage_unresolved";
    invariant(receipt.outcome.exclusive_primary_disposition === expectedDisposition, `${candidateId} disposition/proof mismatch`);
    invariant(receipt.outcome.registry_projection_excluded, `${candidateId} is not explicitly excluded`);
    invariant(receipt.outcome.still_unresolved, `${candidateId} unexpectedly resolves the registry occurrence`);
    invariant(!receipt.outcome.study_projection_eligible, `${candidateId} is unexpectedly study eligible`);
    invariant(exclusion.schema_version === 1 && exclusion.shard === shard, `${candidateId} exclusion shard/schema mismatch`);
    invariant(exclusion.candidate_set_id === BUS_LANE_ACQUISITION_CANDIDATE_SET_ID, `${candidateId} exclusion candidate set mismatch`);
    invariant(exclusion.identity === receipt.candidate.identity, `${candidateId} exclusion identity mismatch`);
    invariant(exclusion.receipt_id === receipt.receipt_id, `${candidateId} exclusion receipt mismatch`);
    invariant(
      exclusion.exact_route_treatment_binding_proved === receipt.claim_results.exact_route_treatment_binding_proved,
      `${candidateId} exclusion route-binding mismatch`,
    );
    invariant(exclusion.phase_identity_proved === receipt.claim_results.explicit_phase_identity_proved, `${candidateId} exclusion phase mismatch`);
    invariant(exclusion.study_projection_eligible === receipt.outcome.study_projection_eligible, `${candidateId} exclusion eligibility mismatch`);
    invariant(exclusion.reason === receipt.outcome.exclusion_reason, `${candidateId} exclusion reason mismatch`);
    invariant(exclusion.excluded_from === "mta_wiki_operational_occurrence_projection", `${candidateId} exclusion target mismatch`);
  }

  const receiptValues = receipts.map((row) => row.value);
  const counts: ShardCounts = {
    researched: receiptValues.length,
    source_acquired: receiptValues.filter((row) => row.claim_results.physical_bus_lane_record_acquired).length,
    authoritative_route_treatment_binding_proved: receiptValues.filter((row) => row.claim_results.exact_route_treatment_binding_proved).length,
    exact_segment_binding_proved: receiptValues.filter((row) => row.claim_results.exact_segment_binding_proved).length,
    date_and_phase_proved: receiptValues.filter((row) => row.claim_results.date_and_phase_proved).length,
    operational_occurrence_added_or_updated: receiptValues.filter((row) => row.canonical_actions.operational_occurrence_added_or_updated).length,
    explicitly_excluded: receiptValues.filter((row) => row.outcome.registry_projection_excluded).length,
    still_unresolved: receiptValues.filter((row) => row.outcome.still_unresolved).length,
  };
  const actualDispositions = countBy(receiptValues.map((row) => row.outcome.exclusive_primary_disposition));
  invariant(summary.schema_version === 1 && summary.shard === shard, `${shard} summary identity mismatch`);
  invariant(summary.candidate_set_id === BUS_LANE_ACQUISITION_CANDIDATE_SET_ID, `${shard} summary candidate set mismatch`);
  invariant(summary.candidate_set_sha256 === BUS_LANE_ACQUISITION_CANDIDATE_SET_SHA256, `${shard} summary candidate set hash mismatch`);
  invariant(summary.researched_count === counts.researched, `${shard} researched count mismatch`);
  invariant(summary.source_acquired_count === counts.source_acquired, `${shard} acquired count mismatch`);
  invariant(summary.exact_route_binding_proved_count === counts.authoritative_route_treatment_binding_proved, `${shard} route count mismatch`);
  invariant(summary.segment_binding_proved_count === counts.exact_segment_binding_proved, `${shard} segment count mismatch`);
  invariant(summary.date_and_phase_proved_count === counts.date_and_phase_proved, `${shard} date/phase count mismatch`);
  invariant(summary.operational_occurrence_added_or_updated_count === counts.operational_occurrence_added_or_updated, `${shard} occurrence count mismatch`);
  invariant(summary.explicitly_excluded_count === counts.explicitly_excluded, `${shard} exclusion count mismatch`);
  invariant(summary.still_unresolved_count === counts.still_unresolved, `${shard} unresolved count mismatch`);
  invariant(
    summary.study_projection_eligible_count === receiptValues.filter((row) => row.outcome.study_projection_eligible).length,
    `${shard} eligibility count mismatch`,
  );
  invariant(
    stableJson(summary.exclusive_primary_disposition_counts as never) === stableJson(actualDispositions as never),
    `${shard} disposition counts mismatch`,
  );
  invariant(
    sameStrings(
      summary.exact_route_binding_proved_candidate_ids,
      receiptValues.filter((row) => row.claim_results.exact_route_treatment_binding_proved).map((row) => row.candidate.candidate_id),
    ),
    `${shard} route-binding candidate ids mismatch`,
  );
  invariant(
    sameStrings(
      summary.segment_binding_proved_candidate_ids,
      receiptValues.filter((row) => row.claim_results.exact_segment_binding_proved).map((row) => row.candidate.candidate_id),
    ),
    `${shard} segment-binding candidate ids mismatch`,
  );
  invariant(summary.receipts_sha256 === fileSha256(receiptsPath), `${shard} summary receipts hash mismatch`);
  invariant(summary.exclusions_sha256 === fileSha256(exclusionsPath), `${shard} summary exclusions hash mismatch`);

  const manifestSha256 = fileSha256(manifestPath);
  return {
    shard,
    manifest,
    manifestPath,
    manifestSha256,
    partitionPath,
    receiptsPath,
    exclusionsPath,
    summaryPath,
    partition,
    receipts,
    exclusions,
    summary,
    counts,
    inputPin: {
      shard,
      manifest_path: relative(repoRoot, manifestPath),
      manifest_sha256: manifestSha256,
      manifest_payload_sha256: manifest.manifest_payload_sha256,
      partition_sha256: manifestArtifact(manifest, "partition.jsonl", shard).sha256,
      receipts_sha256: manifestArtifact(manifest, "receipts.jsonl", shard).sha256,
      exclusions_sha256: manifestArtifact(manifest, "registry-projection-exclusions.jsonl", shard).sha256,
      summary_sha256: manifestArtifact(manifest, "summary.json", shard).sha256,
      candidate_count: partition.length,
    },
  };
}

function buildCampaignRow(
  bundle: ShardBundle,
  partition: RawRow<PartitionRow>,
  receipt: RawRow<Receipt>,
  exclusion: RawRow<Exclusion>,
): CampaignRow {
  const value = receipt.value;
  const flags = receiptFlags(value);
  return {
    schema_version: 1,
    campaign_id: BUS_LANE_ACQUISITION_CAMPAIGN_ID,
    candidate_set_id: BUS_LANE_ACQUISITION_CANDIDATE_SET_ID,
    candidate_set_sha256: BUS_LANE_ACQUISITION_CANDIDATE_SET_SHA256,
    candidate: {
      candidate_id: value.candidate.candidate_id,
      identity: value.candidate.identity,
      route_id: value.candidate.route_id,
      normalized_route_id: value.candidate.normalized_route_id,
      corridor: value.candidate.corridor,
      implementation_date: value.candidate.implementation_date,
      implementation_month: value.candidate.implementation_month,
      date_precision: value.candidate.date_precision,
      source_event_id: value.candidate.source_event_id,
    },
    shard: bundle.shard,
    acquisition: {
      receipt_id: value.receipt_id,
      researched: true,
      researched_on: value.researched_on,
      required_source_categories_checked: [...REQUIRED_ACQUISITION_CATEGORIES],
      physical_bus_lane_source_acquired: value.claim_results.physical_bus_lane_record_acquired,
    },
    relationship_proof: {
      authoritative_route_treatment_binding_proved: flags.authoritative_route_treatment_binding_proved,
      source_claim_field: "exact_route_treatment_binding_proved",
      route_binding_precision: "generic_authoritative_route_treatment_or_corridor_link_not_exact_candidate_segment_day_phase_or_occurrence",
      exact_candidate_segment_binding_proved: flags.exact_candidate_segment_binding_proved,
      exact_segment_ids: sorted(value.claim_results.exact_segment_ids.filter((id): id is string => typeof id === "string")),
      explicit_phase_identity_proved: flags.explicit_phase_identity_proved,
      candidate_date_and_phase_proved: flags.candidate_date_and_phase_proved,
      canonical_operational_occurrence_identity_proved: flags.canonical_operational_occurrence_identity_proved,
      operational_occurrence_added_or_updated: flags.operational_occurrence_added_or_updated,
    },
    outcome: {
      exclusive_primary_disposition: value.outcome.exclusive_primary_disposition,
      nonexclusive_reason_codes: nonexclusiveReasonCodes(flags),
      unsupported_claims: value.claim_results.unsupported_claims,
      registry_projection_excluded: value.outcome.registry_projection_excluded,
      study_projection_eligible: value.outcome.study_projection_eligible,
      still_unresolved: value.outcome.still_unresolved,
      exclusion_reason: value.outcome.exclusion_reason,
      next_action: value.outcome.next_action,
    },
    provenance: {
      shard_manifest_path: relative(repoRoot, bundle.manifestPath),
      shard_manifest_sha256: bundle.manifestSha256,
      partition_path: relative(repoRoot, bundle.partitionPath),
      partition_row_sha256: partition.row_sha256,
      receipt_path: relative(repoRoot, bundle.receiptsPath),
      receipt_row_sha256: receipt.row_sha256,
      exclusion_path: relative(repoRoot, bundle.exclusionsPath),
      exclusion_row_sha256: exclusion.row_sha256,
      reconciliation_ledger_path: relative(repoRoot, RECONCILIATION_LEDGER_PATH),
      reconciliation_ledger_row_sha256: partition.value.ledger_row_sha256,
    },
  };
}

function sumCounts(shardCounts: Record<BusLaneAcquisitionShard, ShardCounts>, field: keyof ShardCounts): number {
  return BUS_LANE_ACQUISITION_SHARDS.reduce((sum, shard) => sum + shardCounts[shard][field], 0);
}

function campaignReport(summary: Record<string, unknown>): string {
  const totals = summary.totals as Record<string, number>;
  const dispositions = summary.exclusive_primary_disposition_counts as Record<string, number>;
  const reasons = summary.nonexclusive_reason_counts as Record<string, number>;
  const shardCounts = summary.shard_counts as Record<string, ShardCounts>;
  const coverage = summary.coverage_assertions as Record<string, number | boolean>;
  const metricRows = [
    ["Researched", totals.researched],
    ["Physical bus-lane source acquired", totals.source_acquired],
    ["Authoritative route-treatment/corridor binding proved", totals.authoritative_route_treatment_binding_proved],
    ["Exact candidate segment binding proved", totals.exact_segment_binding_proved],
    ["Candidate date and phase jointly proved", totals.date_and_phase_proved],
    ["Operational occurrence added or updated", totals.operational_occurrence_added_or_updated],
    ["Explicitly excluded from occurrence projection", totals.explicitly_excluded],
    ["Still unresolved", totals.still_unresolved],
  ].map(([label, value]) => `| ${label} | ${value} |`).join("\n");
  const dispositionRows = Object.entries(dispositions).map(([code, count]) => `| \`${code}\` | ${count} |`).join("\n");
  const reasonRows = NONEXCLUSIVE_REASON_CODES.map((code) => `| \`${code}\` | ${reasons[code] ?? 0} |`).join("\n");
  const shardRows = BUS_LANE_ACQUISITION_SHARDS.map((shard) => {
    const row = shardCounts[shard]!;
    return `| ${shard} | ${row.researched} | ${row.source_acquired} | ${row.authoritative_route_treatment_binding_proved} | ${row.exact_segment_binding_proved} | ${row.date_and_phase_proved} | ${row.operational_occurrence_added_or_updated} | ${row.explicitly_excluded} | ${row.still_unresolved} |`;
  }).join("\n");
  const coverageRows = Object.entries(coverage).map(([name, value]) => `| \`${name}\` | ${String(value)} |`).join("\n");
  return `# Registry-only bus-lane acquisition campaign v1\n\n` +
    `- Campaign: \`${BUS_LANE_ACQUISITION_CAMPAIGN_ID}\`\n` +
    `- Pinned candidate set: \`${BUS_LANE_ACQUISITION_CANDIDATE_SET_ID}\` (\`${BUS_LANE_ACQUISITION_CANDIDATE_SET_SHA256}\`)\n` +
    `- Candidate coverage: **${totals.researched} / ${EXPECTED_CANDIDATE_COUNT}**\n` +
    `- Generated from five immutable shard manifests on ${GENERATED_ON}.\n\n` +
    `## Exact campaign totals\n\n| Metric | Count |\n| --- | ---: |\n${metricRows}\n\n` +
    `The shard source field \`exact_route_treatment_binding_proved\` is normalized here as an authoritative generic route-treatment or route-corridor binding. It does **not** prove the registry candidate's exact segment, day, phase, onset, or canonical occurrence identity. No date-only or corridor-only match is promoted beyond its supported precision.\n\n` +
    `## Exclusive primary dispositions\n\n| Disposition | Count |\n| --- | ---: |\n${dispositionRows}\n\n` +
    `Every campaign row has exactly one primary disposition. All ${totals.explicitly_excluded} rows remain non-projectable.\n\n` +
    `## Non-exclusive reasons\n\n| Reason code | Count |\n| --- | ---: |\n${reasonRows}\n\n` +
    `## Shard reconciliation\n\n| Shard | Researched | Acquired | Route binding | Segment | Date + phase | Occurrence | Excluded | Unresolved |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${shardRows}\n\n` +
    `## Coverage and collision assertions\n\n| Assertion | Result |\n| --- | ---: |\n${coverageRows}\n\n` +
    `The campaign generator verifies every shard manifest and artifact hash, one-to-one partition/receipt/exclusion coverage, receipt and candidate identity uniqueness, and exact equality between the five-shard union and the 321-row reconciliation backlog. Per-row provenance hashes in \`campaign.jsonl\` bind each normalized decision to its shard partition row, receipt, exclusion, and reconciliation-ledger row.\n\n` +
    `## Reproduce\n\n\`\`\`bash\n` +
    `bun scripts/aggregate-bus-lane-acquisition-campaign-v1.ts --check\n` +
    `bun test packages/pipeline/test/quality/bus-lane-acquisition-campaign.test.ts\n` +
    `\`\`\`\n\n` +
    `This report is non-authorizing. It does not mutate canonical records, operational occurrences, releases, Tracker state, approvals, or publication state.\n`;
}

export function buildBusLaneAcquisitionCampaign(): BusLaneAcquisitionCampaign {
  const bundles = BUS_LANE_ACQUISITION_SHARDS.map(loadShard);
  const ledgerSha256 = fileSha256(RECONCILIATION_LEDGER_PATH);
  const ledger = readJsonl<LedgerRow>(RECONCILIATION_LEDGER_PATH);
  const backlog = ledger.filter((row) =>
    row.value.exclusive_primary_disposition === "mta_route_or_treatment_scope_binding_gap"
    && row.value.treatment_family === "bus_lane"
  );
  invariant(backlog.length === EXPECTED_CANDIDATE_COUNT, `reconciliation backlog count is ${backlog.length}, expected ${EXPECTED_CANDIDATE_COUNT}`);
  const backlogByCandidate = indexUnique(backlog, (row) => row.value.candidate_id, "reconciliation bus-lane backlog");

  const ownershipRows = bundles.flatMap((bundle) =>
    bundle.partition.map((row) => ({ candidate_id: row.value.candidate_id, shard: bundle.shard })),
  );
  const ownershipCollisions = candidateOwnershipCollisions(ownershipRows);
  invariant(ownershipCollisions.length === 0, `cross-shard candidate collisions: ${stableJson(ownershipCollisions as never)}`);
  const partitionCandidateIds = sorted(ownershipRows.map((row) => row.candidate_id));
  const missingFromShards = sorted([...backlogByCandidate.keys()].filter((id) => !partitionCandidateIds.includes(id)));
  const extraInShards = partitionCandidateIds.filter((id) => !backlogByCandidate.has(id));
  invariant(missingFromShards.length === 0, `backlog candidates missing from shards: ${missingFromShards.join(", ")}`);
  invariant(extraInShards.length === 0, `shard candidates absent from backlog: ${extraInShards.join(", ")}`);

  const receiptOwnership = bundles.flatMap((bundle) =>
    bundle.receipts.map((row) => ({ candidate_id: row.value.candidate.candidate_id, shard: bundle.shard })),
  );
  const exclusionOwnership = bundles.flatMap((bundle) =>
    bundle.exclusions.map((row) => ({ candidate_id: row.value.candidate_id, shard: bundle.shard })),
  );
  invariant(candidateOwnershipCollisions(receiptOwnership).length === 0, "cross-shard receipt candidate collision");
  invariant(candidateOwnershipCollisions(exclusionOwnership).length === 0, "cross-shard exclusion candidate collision");
  const receiptIds = bundles.flatMap((bundle) => bundle.receipts.map((row) => row.value.receipt_id));
  invariant(new Set(receiptIds).size === receiptIds.length, "cross-shard receipt-id collision");
  invariant(sameStrings(partitionCandidateIds, receiptOwnership.map((row) => row.candidate_id)), "global partition/receipt coverage mismatch");
  invariant(sameStrings(partitionCandidateIds, exclusionOwnership.map((row) => row.candidate_id)), "global partition/exclusion coverage mismatch");

  const rows: CampaignRow[] = [];
  for (const bundle of bundles) {
    const receiptByCandidate = indexUnique(bundle.receipts, (row) => row.value.candidate.candidate_id, `${bundle.shard} receipt build index`);
    const exclusionByCandidate = indexUnique(bundle.exclusions, (row) => row.value.candidate_id, `${bundle.shard} exclusion build index`);
    for (const partition of bundle.partition) {
      const candidateId = partition.value.candidate_id;
      const ledgerRawRow = backlogByCandidate.get(candidateId)!;
      const ledgerRow = ledgerRawRow.value;
      for (const field of ["candidate_id", "identity", "route_id", "implementation_date", "date_precision"] as const) {
        invariant(partition.value[field] === ledgerRow[field], `${candidateId} partition/ledger ${field} mismatch`);
      }
      invariant(ledgerRow.candidate_set_id === BUS_LANE_ACQUISITION_CANDIDATE_SET_ID, `${candidateId} ledger candidate set mismatch`);
      invariant(ledgerRow.candidate_set_sha256 === BUS_LANE_ACQUISITION_CANDIDATE_SET_SHA256, `${candidateId} ledger candidate set hash mismatch`);
      invariant(
        partition.value.ledger_row_sha256 === ledgerRawRow.row_sha256,
        `${candidateId} partition/reconciliation-ledger row hash mismatch`,
      );
      rows.push(buildCampaignRow(
        bundle,
        partition,
        receiptByCandidate.get(candidateId)!,
        exclusionByCandidate.get(candidateId)!,
      ));
    }
  }
  rows.sort((left, right) => compareStrings(left.candidate.candidate_id, right.candidate.candidate_id));
  invariant(rows.length === EXPECTED_CANDIDATE_COUNT, `campaign row count is ${rows.length}`);
  invariant(new Set(rows.map((row) => row.candidate.candidate_id)).size === rows.length, "campaign candidate collision");
  invariant(new Set(rows.map((row) => row.candidate.identity)).size === rows.length, "campaign identity collision");
  invariant(new Set(rows.map((row) => row.acquisition.receipt_id)).size === rows.length, "campaign receipt collision");

  const shardCounts = Object.fromEntries(bundles.map((bundle) => [bundle.shard, bundle.counts])) as Record<BusLaneAcquisitionShard, ShardCounts>;
  const totals: ShardCounts = {
    researched: sumCounts(shardCounts, "researched"),
    source_acquired: sumCounts(shardCounts, "source_acquired"),
    authoritative_route_treatment_binding_proved: sumCounts(shardCounts, "authoritative_route_treatment_binding_proved"),
    exact_segment_binding_proved: sumCounts(shardCounts, "exact_segment_binding_proved"),
    date_and_phase_proved: sumCounts(shardCounts, "date_and_phase_proved"),
    operational_occurrence_added_or_updated: sumCounts(shardCounts, "operational_occurrence_added_or_updated"),
    explicitly_excluded: sumCounts(shardCounts, "explicitly_excluded"),
    still_unresolved: sumCounts(shardCounts, "still_unresolved"),
  };
  const dispositionCounts = countBy(rows.map((row) => row.outcome.exclusive_primary_disposition));
  const reasonCounts = Object.fromEntries(NONEXCLUSIVE_REASON_CODES.map((code) => [
    code,
    rows.filter((row) => row.outcome.nonexclusive_reason_codes.includes(code)).length,
  ]));
  const candidateIdsSha256 = sha256(`${rows.map((row) => row.candidate.candidate_id).join("\n")}\n`);
  const campaignJsonl = stableJsonl(rows);
  const inputPins = bundles.map((bundle) => bundle.inputPin);
  const coverageAssertions = {
    all_assertions_passed: true,
    expected_shard_count: BUS_LANE_ACQUISITION_SHARDS.length,
    observed_shard_count: bundles.length,
    reconciliation_backlog_count: backlog.length,
    partition_union_count: ownershipRows.length,
    campaign_candidate_count: rows.length,
    missing_backlog_candidate_count: missingFromShards.length,
    extra_shard_candidate_count: extraInShards.length,
    cross_shard_candidate_collision_count: ownershipCollisions.length,
    cross_shard_receipt_candidate_collision_count: candidateOwnershipCollisions(receiptOwnership).length,
    cross_shard_exclusion_candidate_collision_count: candidateOwnershipCollisions(exclusionOwnership).length,
    receipt_id_collision_count: receiptIds.length - new Set(receiptIds).size,
    candidate_identity_collision_count: rows.length - new Set(rows.map((row) => row.candidate.identity)).size,
    partition_without_receipt_count: 0,
    receipt_without_partition_count: 0,
    partition_without_exclusion_count: 0,
    exclusion_without_partition_count: 0,
    four_channel_receipt_count: rows.filter((row) => row.acquisition.required_source_categories_checked.length === 4).length,
    verified_shard_manifest_count: bundles.length,
  };
  const summary: Record<string, unknown> = {
    schema_version: 1,
    campaign_id: BUS_LANE_ACQUISITION_CAMPAIGN_ID,
    generated_on: GENERATED_ON,
    candidate_set_id: BUS_LANE_ACQUISITION_CANDIDATE_SET_ID,
    candidate_set_sha256: BUS_LANE_ACQUISITION_CANDIDATE_SET_SHA256,
    reconciliation_ledger_path: relative(repoRoot, RECONCILIATION_LEDGER_PATH),
    reconciliation_ledger_sha256: ledgerSha256,
    candidate_ids_sha256: candidateIdsSha256,
    shard_manifest_set_sha256: sha256(stableJson(inputPins as never)),
    campaign_jsonl_sha256: sha256(campaignJsonl),
    route_binding_semantics: "The shard field exact_route_treatment_binding_proved establishes only a generic authoritative route-treatment or route-corridor link; it does not prove the registry candidate's exact segment, day, phase, onset, or operational-occurrence identity.",
    totals,
    exclusive_primary_disposition_counts: dispositionCounts,
    nonexclusive_reason_counts: reasonCounts,
    shard_counts: shardCounts,
    coverage_assertions: coverageAssertions,
    input_shards: inputPins,
    authorization: "non_authorizing_read_only_campaign_aggregation",
  };
  const report = campaignReport(summary);
  const outputArtifacts = [
    { path: "campaign.jsonl", content: campaignJsonl },
    { path: "summary.json", content: `${stableJson(summary as never)}\n` },
    { path: "report.md", content: report },
  ].map((artifact) => ({
    path: artifact.path,
    sha256: sha256(artifact.content),
    bytes: Buffer.byteLength(artifact.content),
  }));
  const manifestPayload: Record<string, unknown> = {
    schema_version: 1,
    campaign_id: BUS_LANE_ACQUISITION_CAMPAIGN_ID,
    generated_on: GENERATED_ON,
    candidate_set_id: BUS_LANE_ACQUISITION_CANDIDATE_SET_ID,
    candidate_set_sha256: BUS_LANE_ACQUISITION_CANDIDATE_SET_SHA256,
    candidate_count: rows.length,
    reconciliation_ledger: {
      path: relative(repoRoot, RECONCILIATION_LEDGER_PATH),
      sha256: ledgerSha256,
    },
    input_shards: inputPins,
    artifacts: outputArtifacts,
    coverage_assertions_sha256: sha256(stableJson(coverageAssertions as never)),
  };
  const manifest = {
    ...manifestPayload,
    manifest_payload_sha256: sha256(stableJson(manifestPayload as never)),
  };
  return { rows, summary, report, manifest };
}

function campaignContents(campaign: BusLaneAcquisitionCampaign): Record<string, string> {
  return {
    [CAMPAIGN_PATH]: stableJsonl(campaign.rows),
    [SUMMARY_PATH]: `${stableJson(campaign.summary as never)}\n`,
    [REPORT_PATH]: campaign.report,
    [MANIFEST_PATH]: `${stableJson(campaign.manifest as never)}\n`,
  };
}

function applyCampaign(campaign: BusLaneAcquisitionCampaign): void {
  for (const [path, content] of Object.entries(campaignContents(campaign))) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) writeFileSync(path, content, "utf8");
  }
}

function checkCampaign(campaign: BusLaneAcquisitionCampaign): void {
  for (const [path, expected] of Object.entries(campaignContents(campaign))) {
    invariant(existsSync(path), `missing generated artifact ${relative(repoRoot, path)}; run --apply`);
    invariant(readFileSync(path, "utf8") === expected, `generated artifact differs: ${relative(repoRoot, path)}; run --apply`);
  }
}

if (import.meta.main) {
  const apply = process.argv.includes("--apply");
  const check = process.argv.includes("--check");
  invariant(!(apply && check), "choose exactly one of --apply or --check");
  const campaign = buildBusLaneAcquisitionCampaign();
  if (apply) applyCampaign(campaign);
  else checkCampaign(campaign);
  const totals = campaign.summary.totals as ShardCounts;
  process.stdout.write(`${stableJson({
    mode: apply ? "apply" : "check",
    campaign_id: BUS_LANE_ACQUISITION_CAMPAIGN_ID,
    candidate_count: campaign.rows.length,
    totals,
    exclusive_primary_disposition_counts: campaign.summary.exclusive_primary_disposition_counts,
    manifest_payload_sha256: campaign.manifest.manifest_payload_sha256,
  } as never)}\n`);
}
