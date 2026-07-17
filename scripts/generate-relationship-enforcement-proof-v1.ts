/// <reference path="../packages/db/src/bun-sqlite.d.ts" />
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
  existsSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import {
  CANONICAL_DB_VERSION,
  openCanonicalDb,
} from "../packages/db/src/canonical-db";
import {
  RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS,
  RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID,
  RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR,
} from "../packages/db/src/relationship-completeness-contract";
import {
  assertRelationshipContractPolicyV1,
  assertRelationshipEnforcementProof,
  assertRelationshipEnforcementTransitionReceipt,
  assertRelationshipFinalEndpointMatrix,
  loadRelationshipContract,
  RELATIONSHIP_CONTRACT_ID,
  RELATIONSHIP_CONTRACT_POLICY_V1,
  RELATIONSHIP_ENFORCEMENT_GATE_IDS,
  RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS,
  RELATIONSHIP_ENFORCEMENT_INVARIANT_ROLES,
  RELATIONSHIP_ENFORCEMENT_PROOF_SCHEMA_VERSION,
  RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES,
  relationshipEnforcementTransitionFingerprint,
  type RelationshipContract,
  type RelationshipEnforcementGateArtifact,
  type RelationshipEnforcementProof,
  type RelationshipEnforcementProofReference,
  type RelationshipEnforcementTransitionReceipt,
  type RelationshipEnforcementTransitionReceiptReference,
  type RelationshipFinalEndpointMatrix,
} from "../packages/db/src/relationship-contract";
import {
  sha256,
  stableHash,
  stableJson,
} from "../packages/db/src/stable-json";
import type {
  JsonObject,
  JsonValue,
} from "../packages/db/src/types";
import {
  FILE_BY_KIND,
  readCanonicalRecords,
} from "../packages/pipeline/src/materialize/canonical-read";
import {
  exportRelease,
  parseReleaseManifest,
  type ReleaseManifest,
} from "../packages/pipeline/src/materialize/export-release";
import {
  operationalAnchorReviewAcceptedDir,
} from "../packages/pipeline/src/materialize/operational-anchor-review";
import {
  loadOperationalOccurrenceIdentityRegistry,
  operationalOccurrenceIdentityRegistryPath,
} from "../packages/pipeline/src/materialize/operational-occurrence-identity";
import { operationalOccurrenceReviewAcceptedDir } from "../packages/pipeline/src/materialize/operational-occurrence-review";
import {
  readRouteAnchorReview,
  routeAnchorOverridesPath,
} from "../packages/pipeline/src/materialize/route-anchors";
import { readGtfsRoutesFromDb } from "../packages/pipeline/src/materialize/route-anchors";
import { auditRelationshipGraph } from "../packages/pipeline/src/records/relationship-integrity";

/**
 * Enforcement proof generation is a staged, fail-closed workflow.
 *
 * 1. Capture two independent deterministic runs. Each snapshot directory has a
 *    `manifest.json` with this shape (all artifact paths are relative to that
 *    snapshot directory and are verified against the actual files):
 *
 *    {
 *      "schema_version": 1,
 *      "snapshot_id": "independent-run-a",
 *      "captured_at": "2026-07-16T...Z",
 *      "git_head": "<40 lowercase hex>",
 *      "artifacts": {
 *        "latest_before": {"path":"immutability/LATEST.before","sha256":"..."},
 *        "latest_after": {"path":"immutability/LATEST.after","sha256":"..."},
 *        "rc20_manifest_before": {"path":"immutability/rc20-manifest.before.json","sha256":"..."},
 *        "rc20_manifest_after": {"path":"immutability/rc20-manifest.after.json","sha256":"..."},
 *        "tracker_state_before": {"path":"immutability/tracker-state.before.json","sha256":"..."},
 *        "tracker_state_after": {"path":"immutability/tracker-state.after.json","sha256":"..."},
 *        "repository_state_before": {"path":"provenance/repository-state.before.json","sha256":"..."},
 *        "repository_state_after": {"path":"provenance/repository-state.after.json","sha256":"..."},
 *        "generator_source": {"path":"provenance/generator-source.ts","sha256":"..."},
 *        "command_spec": {"path":"provenance/command-spec.json","sha256":"..."},
 *        "materialization": {"path":"materialization-hashes.json","sha256":"..."},
 *        "sqlite": {"path":"canonical.db","sha256":"..."},
 *        "release": {"path":"release-manifest.json","sha256":"..."},
 *        "warning_finding_identities": {"path":"warning-findings.json","sha256":"..."},
 *        "enforcement_finding_identities": {"path":"enforcement-findings.json","sha256":"..."}
 *      },
 *      "command_results": [
 *        {"command_id":"architecture","command":"...","argv":["bun","test","..."],"exit_code":0,
 *         "output":{"path":"commands/architecture.log","sha256":"..."}}
 *      ]
 *    }
 *
 *    The command inventory must be exactly architecture, export, materialize,
 *    quality, schema, test, typecheck, and validate.
 *
 * 2. Derive the consumer input from both real snapshots, then generate gates:
 *
 *    bun scripts/generate-relationship-enforcement-proof-v1.ts \
 *      --capture-snapshot <run-a> --release-id v1-rc21
 *    bun scripts/generate-relationship-enforcement-proof-v1.ts \
 *      --capture-snapshot <run-b> --release-id v1-rc21
 *    bun scripts/generate-relationship-enforcement-proof-v1.ts \
 *      --derive-determinism-consumer --snapshot-a <run-a> --snapshot-b <run-b> \
 *      --apply --reviewed-enforcement
 *    bun scripts/generate-relationship-enforcement-proof-v1.ts \
 *      --apply --reviewed-enforcement
 *    bun scripts/finalize-relationship-contract-v1.ts \
 *      --promote --reviewed-enforcement
 *    # Rebuild materialization, graph audit, and canonical.db in enforce mode.
 *    bun scripts/generate-relationship-enforcement-proof-v1.ts \
 *      --apply --reviewed-enforcement --refresh-after-promotion
 *
 * Capture and derive require the same clean MTA Wiki HEAD/index/worktree and
 * content-addressed untracked inventory. They verify a real sealed v8 SQLite
 * database, every schema-v3 rc21 release file, graph finding identities, the
 * pinned generator/command contract, and a read-only Tracker state whose
 * importer compatibility source and untracked contents are content-addressed.
 * The first proof is pre_promotion_warning/warning_ready. Promotion archives
 * its complete proof tree and writes a content-addressed transition receipt,
 * entering enforced_refresh_required. The final command accepts only the
 * graph/SQL/DB mode delta, chains the archived proof and receipt, and commits
 * post_promotion_enforced/enforced_ready. It never accepts caller-supplied
 * ready or equality booleans.
 */

type GateId = (typeof RELATIONSHIP_ENFORCEMENT_GATE_IDS)[number];

type CanonicalRelationRecord = {
  record_id: string;
  record_kind: "relation";
  payload: {
    relation_kind: string;
    relation_family: string;
    subject_id: string;
    object_id: string;
  };
  evidence_refs: Array<{
    source_id: string;
    block_id: string;
    page_number: number;
    evidence_id: string;
    text_sha256: string;
  }>;
};

type ReconciliationRow = {
  candidate_id: string;
  relation_proof: {
    relation_id: string;
    relation_kind: string;
    relation_family: string;
    subject_id: string;
    subject_kind: string;
    object_id: string;
    object_kind: string;
    endpoints_resolve: boolean;
    endpoint_type_valid: boolean;
    relation_evidence_hash_valid: boolean;
    record_status: string;
    current_canonical_materialization: boolean;
    record_sha256: string;
    pending_journal_path: string | null;
    pending_submission_ids: string[];
    supersession: {
      retired_submission_id: string;
    } | null;
    relation_evidence_refs: Array<{
      source_id: string;
      block_id: string;
      page_number: number;
      evidence_id: string;
      text_sha256: string;
    }>;
  };
};

type BuiltEnforcementOutputs = {
  contents: Map<string, string>;
  proof: RelationshipEnforcementProof;
  proofArtifactPaths: string[];
};

const CONTRACT_PATH =
  "data/contracts/relationships/v1/contract.json";
const PROOF_PATH =
  "data/contracts/relationships/v1/enforcement-proof.json";
const GATE_ROOT =
  "data/contracts/relationships/v1/enforcement-gates";
const CANONICAL_DB_PATH = "data/canonical.db";
const CANONICAL_RELATIONS_PATH =
  "data/canonical/relations.jsonl";
const REVIEWED_RELEASE_MANIFEST_PATH =
  "data/exports/releases/v1-rc21/manifest.json";
const GRAPH_FINDINGS_PATH =
  "data/quality/relationship-integrity/graph-audit/findings.jsonl";
const GRAPH_MANIFEST_PATH =
  "data/quality/relationship-integrity/graph-audit/manifest.json";
const GRAPH_SUMMARY_PATH =
  "data/quality/relationship-integrity/graph-audit/summary.json";
const PHYSICALITY_MANIFEST_PATH =
  "data/quality/relationship-integrity/occurrence-treatment-physicality/manifest.json";
const PHYSICALITY_SUMMARY_PATH =
  "data/quality/relationship-integrity/occurrence-treatment-physicality/summary.json";
const PHASE_MANIFEST_PATH =
  "data/quality/relationship-integrity/operational-occurrence-phases/manifest.json";
const PHASE_SUMMARY_PATH =
  "data/quality/relationship-integrity/operational-occurrence-phases/summary.json";
const DETERMINISM_CONSUMER_SUMMARY_PATH =
  "data/quality/relationship-integrity/determinism-consumer/summary.json";
const RC20_MANIFEST_SHA256 =
  "a2e9147fbb3db3b27a48df27f9550a8b31ab28bc85e30b7166d75b46b54e1a08";
const TRACKER_ROOT = "/mnt/models/dev/bus-reliability-tracker";
const GENERATOR_SOURCE_PATH =
  "scripts/generate-relationship-enforcement-proof-v1.ts";
const TRACKER_IMPORTER_SOURCE_PATH =
  "tools/pipeline-v2/src/lib/mta-wiki-operational-occurrences.ts";
const DETERMINISM_RELEASE_ID = "v1-rc21";
const REQUIRED_COMMAND_IDS = [
  "architecture",
  "export",
  "materialize",
  "quality",
  "schema",
  "test",
  "typecheck",
  "validate",
] as const;
const LINKAGE_RECONCILIATION_PATH =
  "data/quality/relationship-integrity/bus-lane-acquisition/linkage-reconciliation/reconciliation.jsonl";
const LINKAGE_RECONCILIATION_SUMMARY_PATH =
  "data/quality/relationship-integrity/bus-lane-acquisition/linkage-reconciliation/summary.json";
export const LINKAGE_MATERIALIZATION_SUMMARY_PATH =
  "data/quality/relationship-integrity/bus-lane-acquisition/linkage-materialization/summary.json";
export const SQL_INTEGRITY_SUMMARY_PATH =
  "data/quality/relationship-integrity/sql-integrity/summary.json";

export const RELATIONSHIP_ENFORCEMENT_GATE_SOURCES =
  RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS;

const GATE_CRITERIA: Record<GateId, readonly string[]> = {
  bus_lane_acquisition_linkage: [
    "The pinned 321-candidate acquisition set is researched, receipted, and exclusively accounted.",
    "All 54 evidence-supported linkage relation identities are live canonical relations with exact endpoints and evidence.",
  ],
  determinism_and_consumer_proof: [
    "Two clean materializations, SQLite rebuilds, and release exports reproduce byte hashes.",
    "The complete command suite passes while LATEST, rc20, and Tracker state remain immutable.",
  ],
  occurrence_treatment_physicality: [
    "Every eligible occurrence has reviewed phase identity and every physical treatment has supported physical scope.",
  ],
  payload_reference_integrity: [
    "Every enforceable payload reference resolves uniquely or is covered by an exact reviewed decision.",
  ],
  referential_type_evidence_integrity: [
    "Repository and sealed SQLite diagnostics prove zero endpoint, type, evidence, parity, selector, waiver, and foreign-key violations.",
  ],
  relationship_completeness: [
    "Every versioned completeness selector has zero warnings and its complete denominator is reconciled.",
  ],
  semantic_remediation: [
    "Every reviewed semantic decision is reconciled with zero skipped corrections and zero unmapped relations.",
  ],
};

const SEALED_RELATIONSHIP_TABLES = [
  "records",
  "relations",
  "evidence_block_registry",
  "evidence_refs",
  "relationship_contract_rules",
  "canonical_identities",
  "relationship_validation_findings",
  "relationship_dispositions",
  "relationship_disposition_evidence",
  "relationship_completeness_waivers",
  "relationship_completeness_subjects",
  "relationship_completeness_roles",
  "relationship_completeness_findings",
  "relationship_selector_contracts",
  "relationship_enforcement_state",
] as const;

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertReleaseRecordIdsUniqueAndSorted(
  ids: string[],
  label: string,
): void {
  assert(
    new Set(ids).size === ids.length &&
      stableJson(ids as unknown as JsonValue) ===
        stableJson(
          [...ids].sort(compareReleaseRecordIds) as unknown as JsonValue,
        ),
    `${label} record ids must be unique and sorted`,
  );
}

export function compareReleaseRecordIds(
  left: string,
  right: string,
): number {
  return left.localeCompare(right);
}

function compareReleaseRecordIdentities(
  left: SnapshotRecordIdentity,
  right: SnapshotRecordIdentity,
): number {
  return (
    left.record_kind.localeCompare(right.record_kind) ||
    compareReleaseRecordIds(left.record_id, right.record_id)
  );
}

function object(
  value: unknown,
  label: string,
): Record<string, unknown> {
  assert(
    typeof value === "object" &&
      value !== null &&
      !Array.isArray(value),
    `${label} must be an object`,
  );
  return value as Record<string, unknown>;
}

function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseJsonl<T>(text: string, label: string): T[] {
  return text
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) =>
      parseJson<T>(line, `${label} row ${index + 1}`)
    );
}

function json(value: JsonValue): string {
  return `${stableJson(value)}\n`;
}

function byteSha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function lineCount(value: string): number {
  return value.trim()
    ? value.trimEnd().split(/\r?\n/u).length
    : 0;
}

function normalizedRelative(root: string, path: string): string {
  const result = relative(root, path);
  assert(
    result !== "" &&
      !isAbsolute(result) &&
      result !== ".." &&
      !result.startsWith(`..${sep}`),
    `Path is outside the repository root: ${path}`,
  );
  return result.split(sep).join("/");
}

function repositoryPath(root: string, path: string): string {
  assert(
    path.trim() === path && path.length > 0 && !isAbsolute(path),
    `Repository path must be a non-empty relative path: ${path}`,
  );
  const absolute = resolve(root, path);
  normalizedRelative(root, absolute);
  return absolute;
}

function readRepositoryBytes(root: string, path: string): Buffer {
  const absolute = repositoryPath(root, path);
  assert(existsSync(absolute), `Required enforcement source is missing: ${path}`);
  const stat = lstatSync(absolute);
  assert(stat.isFile() && !stat.isSymbolicLink(), `Enforcement source must be a regular non-symlink file: ${path}`);
  const realRoot = realpathSync(root);
  const realFile = realpathSync(absolute);
  normalizedRelative(realRoot, realFile);
  return readFileSync(absolute);
}

function readRepositoryText(root: string, path: string): string {
  return readRepositoryBytes(root, path).toString("utf8");
}

type FilePin = {
  path: string;
  sha256: string;
  bytes?: number;
  row_count?: number;
};

function filePin(value: unknown, label: string): FilePin {
  const pin = object(value, label);
  assert(
    typeof pin.path === "string" &&
      pin.path.trim() === pin.path &&
      pin.path.length > 0 &&
      typeof pin.sha256 === "string" &&
      /^[a-f0-9]{64}$/u.test(pin.sha256) &&
      (pin.bytes === undefined ||
        (typeof pin.bytes === "number" &&
          Number.isInteger(pin.bytes) &&
          pin.bytes >= 0)) &&
      (pin.row_count === undefined ||
        (typeof pin.row_count === "number" &&
          Number.isInteger(pin.row_count) &&
          pin.row_count >= 0)),
    `${label} is not a content-addressed file pin`,
  );
  return pin as FilePin;
}

function verifyRepositoryFilePin(
  root: string,
  value: unknown,
  label: string,
): Buffer {
  const pin = filePin(value, label);
  const bytes = readRepositoryBytes(root, pin.path);
  assert(
    byteSha256(bytes) === pin.sha256,
    `${label} SHA-256 mismatch: ${pin.path}`,
  );
  assert(
    pin.bytes === undefined || pin.bytes === bytes.length,
    `${label} byte count mismatch: ${pin.path}`,
  );
  assert(
    pin.row_count === undefined ||
      pin.row_count === lineCount(bytes.toString("utf8")),
    `${label} row count mismatch: ${pin.path}`,
  );
  return bytes;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right)
  );
}

function shaList(values: readonly string[]): string {
  return sha256(
    stableJson(sortedUnique(values) as unknown as JsonValue),
  );
}

function nonnegativeIntegerRecord(
  value: unknown,
  label: string,
): Record<string, number> {
  const parsed = object(value, label);
  assert(
    Object.values(parsed).every(
      (entry) =>
        typeof entry === "number" &&
        Number.isInteger(entry) &&
        entry >= 0,
    ),
    `${label} must contain only non-negative integer counts`,
  );
  return parsed as Record<string, number>;
}

function countStrings(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts].sort(([left], [right]) =>
      left.localeCompare(right)
    ),
  );
}

function evidenceIdentity(
  value: {
    source_id: string;
    block_id: string;
    page_number: number;
    evidence_id: string;
    text_sha256: string;
  },
): JsonObject {
  return {
    source_id: value.source_id,
    block_id: value.block_id,
    page_number: value.page_number,
    evidence_id: value.evidence_id,
    text_sha256: value.text_sha256,
  };
}

function evidenceSetHash(
  values: ReadonlyArray<{
    source_id: string;
    block_id: string;
    page_number: number;
    evidence_id: string;
    text_sha256: string;
  }>,
): string {
  const normalized = values
    .map(evidenceIdentity)
    .sort((left, right) =>
      stableJson(left).localeCompare(stableJson(right))
    );
  return stableHash(normalized as unknown as JsonValue);
}

function queryCount(db: Database, tableOrView: string): number {
  assert(
    /^[a-z_]+$/u.test(tableOrView),
    `Unsafe SQLite count target: ${tableOrView}`,
  );
  const row = db
    .query(`SELECT COUNT(*) AS count FROM ${tableOrView}`)
    .get() as { count: number };
  return Number(row.count);
}

function deriveLinkageMaterializationSummary(
  root: string,
  db: Database,
): JsonObject {
  const reconciliationText = readRepositoryText(
    root,
    LINKAGE_RECONCILIATION_PATH,
  );
  const reconciliationSummaryText = readRepositoryText(
    root,
    LINKAGE_RECONCILIATION_SUMMARY_PATH,
  );
  const canonicalRelationsText = readRepositoryText(
    root,
    CANONICAL_RELATIONS_PATH,
  );
  const canonicalDbBytes = readRepositoryBytes(
    root,
    CANONICAL_DB_PATH,
  );
  const rows = parseJsonl<ReconciliationRow>(
    reconciliationText,
    LINKAGE_RECONCILIATION_PATH,
  );
  const reconciliationSummary = object(
    parseJson<unknown>(
      reconciliationSummaryText,
      LINKAGE_RECONCILIATION_SUMMARY_PATH,
    ),
    "linkage reconciliation summary",
  );
  const canonicalEntries = canonicalRelationsText
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((raw, index) => ({
      raw,
      row: parseJson<CanonicalRelationRecord>(
        raw,
        `${CANONICAL_RELATIONS_PATH} row ${index + 1}`,
      ),
      sha256: sha256(raw),
    }));
  const canonicalRows = canonicalEntries.map((entry) => entry.row);
  const canonicalById = new Map(
    canonicalRows.map((row) => [row.record_id, row] as const),
  );
  const canonicalRawHashById = new Map(
    canonicalEntries.map((entry) => [
      entry.row.record_id,
      entry.sha256,
    ] as const),
  );
  const sqlRelationIds = (
    db.query(
      "SELECT record_id FROM relations ORDER BY record_id",
    ).all() as Array<{ record_id: string }>
  ).map((row) => row.record_id);
  const canonicalRelationIds = canonicalRows
    .map((row) => row.record_id)
    .sort();
  const canonicalProjectionViolationCount = [
    canonicalById.size !== canonicalRows.length,
    canonicalRows.length !== sqlRelationIds.length,
    stableJson(canonicalRelationIds as unknown as JsonValue) !==
      stableJson(sqlRelationIds as unknown as JsonValue),
  ].filter(Boolean).length;

  const relationIds = rows.map(
    (row) => row.relation_proof.relation_id,
  );
  const candidateIds = rows.map((row) => row.candidate_id);
  const selectedRelations = rows.map((row) => ({
    candidate_id: row.candidate_id,
    relation_id: row.relation_proof.relation_id,
    record_status: row.relation_proof.record_status,
    record_sha256: row.relation_proof.record_sha256,
    pending_journal_path:
      row.relation_proof.pending_journal_path,
    pending_submission_ids:
      row.relation_proof.pending_submission_ids,
    superseded_submission_id:
      row.relation_proof.supersession
        ?.retired_submission_id ?? null,
  }));
  const selectedRelationsSha256 = stableHash(
    selectedRelations as unknown as JsonValue,
  );
  const reconciliationIdentityViolationCount = [
    new Set(relationIds).size !== relationIds.length,
    new Set(candidateIds).size !== candidateIds.length,
    reconciliationSummary.schema_version !== 2,
    reconciliationSummary.campaign_id !==
      "bus-lane-supported-linkage-reconciliation-v1",
    reconciliationSummary.supported_candidate_count !== rows.length,
    reconciliationSummary.selected_relation_count !== rows.length,
    reconciliationSummary.selected_relations_sha256 !==
      selectedRelationsSha256,
    reconciliationSummary.reconciliation_sha256 !==
      sha256(reconciliationText),
  ].filter(Boolean).length;

  const relationQuery = db.query(`
    SELECT relation.record_id, relation.relation_kind,
           relation.relation_family, relation.subject_id,
           subject.record_kind AS subject_kind,
           relation.object_id, object.record_kind AS object_kind
    FROM relations relation
    LEFT JOIN records subject
      ON subject.record_id = relation.subject_id
    LEFT JOIN records object
      ON object.record_id = relation.object_id
    WHERE relation.record_id = ?
  `);
  const evidenceQuery = db.query(`
    SELECT source_id, block_id, page_number, evidence_id,
           text_sha256
    FROM evidence_refs
    WHERE record_id = ?
    ORDER BY ordinal
  `);
  const typeViolationQuery = db.query(`
    SELECT COUNT(*) AS count
    FROM relationship_type_violations
    WHERE record_id = ?
  `);
  const evidenceViolationQuery = db.query(`
    SELECT COUNT(*) AS count
    FROM relationship_evidence_violations
    WHERE record_id = ?
  `);

  let materializedCandidateCount = 0;
  let endpointViolationCount = 0;
  let typeViolationCount = 0;
  let evidenceViolationCount = 0;
  let recordHashViolationCount = 0;
  let materializationStatusViolationCount = 0;
  for (const row of rows) {
    const proof = row.relation_proof;
    const canonical = canonicalById.get(proof.relation_id);
    const sql = relationQuery.get(proof.relation_id) as
      | {
          record_id: string;
          relation_kind: string;
          relation_family: string;
          subject_id: string;
          subject_kind: string | null;
          object_id: string;
          object_kind: string | null;
        }
      | null;
    if (!canonical || !sql) continue;
    materializedCandidateCount += 1;
    if (
      canonicalRawHashById.get(proof.relation_id) !==
      proof.record_sha256
    ) {
      recordHashViolationCount += 1;
    }
    if (proof.current_canonical_materialization !== true) {
      materializationStatusViolationCount += 1;
    }
    const canonicalPayload = canonical.payload;
    if (
      proof.endpoints_resolve !== true ||
      sql.subject_kind === null ||
      sql.object_kind === null ||
      sql.subject_id !== proof.subject_id ||
      sql.object_id !== proof.object_id ||
      sql.subject_kind !== proof.subject_kind ||
      sql.object_kind !== proof.object_kind ||
      canonicalPayload.subject_id !== proof.subject_id ||
      canonicalPayload.object_id !== proof.object_id
    ) {
      endpointViolationCount += 1;
    }
    const sqlTypeViolation = Number(
      (
        typeViolationQuery.get(proof.relation_id) as {
          count: number;
        }
      ).count,
    );
    if (
      proof.endpoint_type_valid !== true ||
      sqlTypeViolation !== 0 ||
      sql.relation_kind !== proof.relation_kind ||
      sql.relation_family !== proof.relation_family ||
      canonicalPayload.relation_kind !== proof.relation_kind ||
      canonicalPayload.relation_family !== proof.relation_family
    ) {
      typeViolationCount += 1;
    }
    const sqlEvidence = evidenceQuery.all(
      proof.relation_id,
    ) as Array<{
      source_id: string;
      block_id: string;
      page_number: number;
      evidence_id: string;
      text_sha256: string;
    }>;
    const sqlEvidenceViolation = Number(
      (
        evidenceViolationQuery.get(proof.relation_id) as {
          count: number;
        }
      ).count,
    );
    const expectedEvidenceHash = evidenceSetHash(
      proof.relation_evidence_refs,
    );
    if (
      proof.relation_evidence_hash_valid !== true ||
      sqlEvidenceViolation !== 0 ||
      expectedEvidenceHash !== evidenceSetHash(sqlEvidence) ||
      expectedEvidenceHash !==
        evidenceSetHash(canonical.evidence_refs)
    ) {
      evidenceViolationCount += 1;
    }
  }

  const unmaterializedCandidateCount =
    rows.length - materializedCandidateCount;
  const violationCount =
    unmaterializedCandidateCount +
    endpointViolationCount +
    typeViolationCount +
    evidenceViolationCount +
    reconciliationIdentityViolationCount +
    canonicalProjectionViolationCount +
    recordHashViolationCount +
    materializationStatusViolationCount;
  return {
    schema_version: 1,
    campaign_id:
      "bus-lane-supported-linkage-materialization-v1",
    supported_candidate_count: rows.length,
    materialized_candidate_count: materializedCandidateCount,
    unmaterialized_candidate_count:
      unmaterializedCandidateCount,
    materialized_relation_count: new Set(
      relationIds.filter((id) => canonicalById.has(id)),
    ).size,
    endpoint_violation_count: endpointViolationCount,
    type_violation_count: typeViolationCount,
    evidence_violation_count: evidenceViolationCount,
    record_hash_violation_count: recordHashViolationCount,
    materialization_status_violation_count:
      materializationStatusViolationCount,
    reconciliation_identity_violation_count:
      reconciliationIdentityViolationCount,
    canonical_projection_violation_count:
      canonicalProjectionViolationCount,
    violation_count: violationCount,
    canonical_relation_count: canonicalRows.length,
    record_hash_contract:
      "sha256_raw_canonical_jsonl_line_without_newline",
    canonical_relations_path: CANONICAL_RELATIONS_PATH,
    canonical_relations_sha256: sha256(
      canonicalRelationsText,
    ),
    canonical_db_path: CANONICAL_DB_PATH,
    canonical_db_sha256: byteSha256(canonicalDbBytes),
    reconciliation_path: LINKAGE_RECONCILIATION_PATH,
    reconciliation_sha256: sha256(reconciliationText),
    reconciliation_summary_path:
      LINKAGE_RECONCILIATION_SUMMARY_PATH,
    reconciliation_summary_sha256: sha256(
      reconciliationSummaryText,
    ),
    selected_relations_sha256: selectedRelationsSha256,
    materialized_relation_ids_sha256: shaList(relationIds),
  };
}

function payloadParityMismatchCount(db: Database): number {
  const row = db.query(`
    SELECT COUNT(*) AS count
    FROM records record
    LEFT JOIN relations relation
      ON relation.record_id = record.record_id
    WHERE record.record_kind = 'relation'
      AND (
        relation.record_id IS NULL OR
        json_valid(record.payload) != 1 OR
        json_type(record.payload, '$.relation_kind') != 'text' OR
        json_extract(record.payload, '$.relation_kind') IS NOT relation.relation_kind OR
        json_type(record.payload, '$.relation_family') != 'text' OR
        json_extract(record.payload, '$.relation_family') IS NOT relation.relation_family OR
        json_type(record.payload, '$.subject_id') != 'text' OR
        json_extract(record.payload, '$.subject_id') IS NOT relation.subject_id OR
        json_type(record.payload, '$.object_id') != 'text' OR
        json_extract(record.payload, '$.object_id') IS NOT relation.object_id
      )
  `).get() as { count: number };
  return Number(row.count);
}

function evidenceParityMismatchCount(db: Database): number {
  const row = db.query(`
    SELECT COUNT(*) AS count
    FROM evidence_refs evidence
    WHERE
      json_valid(evidence.ref_json) != 1 OR
      json_type(evidence.ref_json, '$.source_id') != 'text' OR
      json_extract(evidence.ref_json, '$.source_id') IS NOT evidence.source_id OR
      json_type(evidence.ref_json, '$.block_id') != 'text' OR
      json_extract(evidence.ref_json, '$.block_id') IS NOT evidence.block_id OR
      json_type(evidence.ref_json, '$.page_number') != 'integer' OR
      json_extract(evidence.ref_json, '$.page_number') IS NOT evidence.page_number OR
      json_type(evidence.ref_json, '$.evidence_id') != 'text' OR
      json_extract(evidence.ref_json, '$.evidence_id') IS NOT evidence.evidence_id OR
      json_type(evidence.ref_json, '$.source_path') != 'text' OR
      json_extract(evidence.ref_json, '$.source_path') IS NOT evidence.source_path OR
      json_type(evidence.ref_json, '$.text_sha256') != 'text' OR
      json_extract(evidence.ref_json, '$.text_sha256') IS NOT evidence.text_sha256 OR
      (json_type(evidence.ref_json, '$.resolved_block_id') IS NOT NULL AND (
        json_type(evidence.ref_json, '$.resolved_block_id') != 'text' OR
        json_extract(evidence.ref_json, '$.resolved_block_id') IS NOT evidence.resolved_block_id
      )) OR
      (json_type(evidence.ref_json, '$.role') IS NULL AND evidence.role IS NOT NULL) OR
      (json_type(evidence.ref_json, '$.role') IS NOT NULL AND (
        json_type(evidence.ref_json, '$.role') != 'text' OR
        json_extract(evidence.ref_json, '$.role') IS NOT evidence.role
      ))
  `).get() as { count: number };
  return Number(row.count);
}

function waiverScopeViolationCount(db: Database): number {
  const invalid = db.query(`
    SELECT COUNT(*) AS count
    FROM relationship_completeness_waivers waiver
    LEFT JOIN relationship_dispositions disposition
      ON disposition.decision_id = waiver.decision_id
    WHERE disposition.decision_id IS NULL
       OR disposition.record_id != waiver.record_id
       OR disposition.waiver != 1
       OR disposition.study_projectable != 0
       OR waiver.contract_id != ?
       OR waiver.selector != CASE disposition.selector
            WHEN 'operational_event' THEN ?
            WHEN 'bus_lane_family_treatment' THEN ?
            WHEN 'route_identity' THEN ?
            ELSE NULL END
       OR json_valid(disposition.decision_json) != 1
       OR NOT EXISTS (
            SELECT 1
            FROM json_each(
              disposition.decision_json,
              '$.required_roles_missing'
            ) allowed_role
            WHERE allowed_role.type = 'text'
              AND allowed_role.value = waiver.role
          )
  `).get(
    RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID,
    RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR.operational_event,
    RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR
      .bus_lane_family_treatment,
    RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR.route_identity,
  ) as { count: number };
  const missing = db.query(`
    SELECT COUNT(*) AS count
    FROM relationship_dispositions disposition
    JOIN json_each(
      disposition.decision_json,
      '$.required_roles_missing'
    ) allowed_role
      ON allowed_role.type = 'text'
    WHERE disposition.waiver = 1
      AND disposition.study_projectable = 0
      AND NOT EXISTS (
        SELECT 1
        FROM relationship_completeness_waivers waiver
        WHERE waiver.decision_id = disposition.decision_id
          AND waiver.contract_id = ?
          AND waiver.selector = CASE disposition.selector
                WHEN 'operational_event' THEN ?
                WHEN 'bus_lane_family_treatment' THEN ?
                WHEN 'route_identity' THEN ?
                ELSE NULL END
          AND waiver.record_id = disposition.record_id
          AND waiver.role = allowed_role.value
      )
  `).get(
    RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID,
    RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR.operational_event,
    RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR
      .bus_lane_family_treatment,
    RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR.route_identity,
  ) as { count: number };
  return Number(invalid.count) + Number(missing.count);
}

function deriveSqlIntegritySummary(
  root: string,
  db: Database,
): JsonObject {
  const databaseBytes = readRepositoryBytes(root, CANONICAL_DB_PATH);
  const graphFindingsText = readRepositoryText(
    root,
    GRAPH_FINDINGS_PATH,
  );
  const graphManifestText = readRepositoryText(
    root,
    GRAPH_MANIFEST_PATH,
  );
  const graphSummaryText = readRepositoryText(
    root,
    GRAPH_SUMMARY_PATH,
  );
  const graphManifest = object(
    parseJson<unknown>(graphManifestText, GRAPH_MANIFEST_PATH),
    "graph audit manifest",
  );
  const graphSummary = object(
    parseJson<unknown>(graphSummaryText, GRAPH_SUMMARY_PATH),
    "graph audit summary",
  );
  const graphFindings = parseJsonl<{
    finding_id: string;
    code: string;
    record_id?: string;
  }>(graphFindingsText, GRAPH_FINDINGS_PATH)
    .map((finding) => ({
      finding_id: finding.finding_id,
      code: finding.code,
      record_id: finding.record_id ?? null,
    }));
  const knownGraphFindingCodes = Object.keys(
    RELATIONSHIP_CONTRACT_POLICY_V1.finding_codes,
  ).filter((code) => !code.startsWith("REL_REQUIRED_"));
  const knownGraphFindingCodeSet = new Set(
    knownGraphFindingCodes,
  );
  assert(
    graphFindings.every(
      (finding) =>
        typeof finding.finding_id === "string" &&
        finding.finding_id.trim().length > 0 &&
        typeof finding.code === "string" &&
        finding.code !== "REL_ORPHAN_RECORD" &&
        knownGraphFindingCodeSet.has(finding.code),
    ) &&
      new Set(
        graphFindings.map((finding) => finding.finding_id),
      ).size === graphFindings.length,
    "Graph findings ledger contains an invalid, duplicate, unknown, or orphan finding row",
  );
  const graphLedgerCounts = countStrings(
    graphFindings.map((finding) => finding.code),
  );
  const graphSummaryCounts = nonnegativeIntegerRecord(
    graphSummary.findings_by_code,
    "graph audit summary findings_by_code",
  );
  assert(
    Object.keys(graphSummaryCounts).every((code) =>
      knownGraphFindingCodeSet.has(code)
    ),
    "Graph audit summary contains an unknown finding code",
  );
  const graphSummaryFindingCountsMatch =
    knownGraphFindingCodes
      .filter((code) => code !== "REL_ORPHAN_RECORD")
      .every(
        (code) =>
          (graphSummaryCounts[code] ?? 0) ===
          (graphLedgerCounts[code] ?? 0),
      );
  const graphEnforcementEligibleFindingCount =
    graphFindings.filter(
      (finding) =>
        RELATIONSHIP_CONTRACT_POLICY_V1.finding_codes[
          finding.code
        ]?.enforcement_eligible === true,
    ).length;
  const graphManifestArtifacts = Array.isArray(
      graphManifest.artifacts,
    )
    ? graphManifest.artifacts.map((entry, index) =>
        object(entry, `graph manifest artifact ${index}`)
      )
    : [];
  const graphSummaryPin = graphManifestArtifacts.find(
    (entry) => entry.path === "summary.json",
  );
  const graphFindingsPin = graphManifestArtifacts.find(
    (entry) => entry.path === "findings.jsonl",
  );
  const graphManifestPinsMatch =
    graphManifest.schema_version === 1 &&
    graphManifest.contract_id === RELATIONSHIP_CONTRACT_ID &&
    graphSummaryPin?.sha256 === sha256(graphSummaryText) &&
    graphFindingsPin?.sha256 === sha256(graphFindingsText) &&
    graphFindingsPin.rows === graphFindings.length;
  const sqlFindings = db.query(`
    SELECT finding_id, code, record_id
    FROM relationship_validation_findings
    ORDER BY finding_id
  `).all() as Array<{
    finding_id: string;
    code: string;
    record_id: string | null;
  }>;
  const repositorySqlFindingIdentityMatch =
    stableJson(graphFindings as unknown as JsonValue) ===
    stableJson(sqlFindings as unknown as JsonValue);
  const sqlFindingCounts = countStrings(
    sqlFindings.map((finding) => finding.code),
  );
  const repositorySqlFindingCodeCountsMatch =
    stableJson(graphLedgerCounts as unknown as JsonValue) ===
    stableJson(sqlFindingCounts as unknown as JsonValue);

  const foreignKeyViolationCount = (
    db.query("PRAGMA foreign_key_check").all() as unknown[]
  ).length;
  const endpointViolationCount = queryCount(
    db,
    "relationship_endpoint_violations",
  );
  const typeViolationCount = queryCount(
    db,
    "relationship_type_violations",
  );
  const evidenceViolationCount = queryCount(
    db,
    "relationship_evidence_violations",
  );
  const identityAmbiguityCount = queryCount(
    db,
    "relationship_identity_ambiguities",
  );
  const relationshipSqlDiagnosticCount = queryCount(
    db,
    "relationship_sql_diagnostics",
  );
  const dispositionEvidenceViolationCount = queryCount(
    db,
    "relationship_disposition_evidence_violations",
  );
  const completenessRoleViolationCount = queryCount(
    db,
    "relationship_completeness_role_violations",
  );
  const completenessSelectorViolationCount = queryCount(
    db,
    "relationship_completeness_selector_violations",
  );
  const completenessFindingCount = queryCount(
    db,
    "relationship_completeness_findings",
  );
  const completenessSqlDiagnosticCount = queryCount(
    db,
    "relationship_completeness_sql_diagnostics",
  );
  const normalizedPayloadMismatchCount =
    payloadParityMismatchCount(db);
  const normalizedEvidenceMismatchCount =
    evidenceParityMismatchCount(db);
  const waiverScopeCount = waiverScopeViolationCount(db);

  const selectorRows = db.query(`
    SELECT contract_id, selector, enforcement_eligible
    FROM relationship_selector_contracts
    ORDER BY contract_id, selector
  `).all() as Array<{
    contract_id: string;
    selector: string;
    enforcement_eligible: number;
  }>;
  const expectedSelectors = [
    ...RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS,
  ].sort();
  const observedSelectors = selectorRows
    .filter(
      (row) =>
        row.contract_id ===
        RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID,
    )
    .map((row) => row.selector)
    .sort();
  const requiredSelectorSetMatch =
    selectorRows.length === expectedSelectors.length &&
    stableJson(observedSelectors as unknown as JsonValue) ===
      stableJson(expectedSelectors as unknown as JsonValue) &&
    selectorRows.every((row) => row.enforcement_eligible === 1);

  const enforcementStates = db.query(`
    SELECT contract_id, mode, hard_mode_ready,
           input_fingerprint, criteria_json
    FROM relationship_enforcement_state
    ORDER BY contract_id
  `).all() as Array<{
    contract_id: string;
    mode: string;
    hard_mode_ready: number;
    input_fingerprint: string;
    criteria_json: string;
  }>;
  const enforcementState = enforcementStates[0];
  const enforcementStateValid =
    enforcementStates.length === 1 &&
    enforcementState !== undefined &&
    enforcementState.contract_id ===
      RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID &&
    (enforcementState.mode === "warning" ||
      enforcementState.mode === "enforce") &&
    enforcementState.hard_mode_ready === 1 &&
    Boolean(enforcementState.input_fingerprint.trim()) &&
    (() => {
      try {
        object(
          JSON.parse(enforcementState.criteria_json) as unknown,
          "SQLite enforcement criteria",
        );
        return true;
      } catch {
        return false;
      }
    })();

  const triggerNames = new Set(
    (
      db.query(`
        SELECT name FROM sqlite_master
        WHERE type = 'trigger'
      `).all() as Array<{ name: string }>
    ).map((row) => row.name),
  );
  const expectedSealedTriggers = SEALED_RELATIONSHIP_TABLES.flatMap(
    (table) =>
      ["insert", "update", "delete"].map(
        (operation) => `${table}_sealed_${operation}`,
      ),
  );
  const sealedMutationTriggerMissingCount =
    expectedSealedTriggers.filter((name) => !triggerNames.has(name))
      .length;
  const state = db.query(`
    SELECT sealed FROM canonical_db_state
    WHERE state_key = 'canonical'
  `).get() as { sealed: number } | null;
  const readonlySealed =
    state?.sealed === 1 && sealedMutationTriggerMissingCount === 0;

  const violationCount =
    foreignKeyViolationCount +
    endpointViolationCount +
    typeViolationCount +
    evidenceViolationCount +
    identityAmbiguityCount +
    relationshipSqlDiagnosticCount +
    dispositionEvidenceViolationCount +
    completenessRoleViolationCount +
    completenessSelectorViolationCount +
    completenessFindingCount +
    completenessSqlDiagnosticCount +
    normalizedPayloadMismatchCount +
    normalizedEvidenceMismatchCount +
    waiverScopeCount +
    sealedMutationTriggerMissingCount +
    Number(!graphManifestPinsMatch) +
    Number(!graphSummaryFindingCountsMatch) +
    graphEnforcementEligibleFindingCount +
    Number(!repositorySqlFindingIdentityMatch) +
    Number(!repositorySqlFindingCodeCountsMatch) +
    Number(!requiredSelectorSetMatch) +
    Number(!enforcementStateValid) +
    Number(!readonlySealed);

  return {
    schema_version: 1,
    summary_id: "relationship-integrity-sql-v1",
    contract_id: RELATIONSHIP_CONTRACT_ID,
    canonical_db_path: CANONICAL_DB_PATH,
    canonical_db_sha256: byteSha256(databaseBytes),
    canonical_db_version: CANONICAL_DB_VERSION,
    graph_findings_path: GRAPH_FINDINGS_PATH,
    graph_findings_sha256: sha256(graphFindingsText),
    graph_manifest_path: GRAPH_MANIFEST_PATH,
    graph_manifest_sha256: sha256(graphManifestText),
    graph_summary_path: GRAPH_SUMMARY_PATH,
    graph_summary_sha256: sha256(graphSummaryText),
    repository_finding_count: graphFindings.length,
    sql_finding_count: sqlFindings.length,
    repository_sql_finding_identity_match:
      repositorySqlFindingIdentityMatch,
    repository_sql_finding_code_counts_match:
      repositorySqlFindingCodeCountsMatch,
    graph_summary_finding_counts_match:
      graphSummaryFindingCountsMatch,
    graph_enforcement_eligible_finding_count:
      graphEnforcementEligibleFindingCount,
    normalized_payload_parity:
      normalizedPayloadMismatchCount === 0,
    normalized_payload_mismatch_count:
      normalizedPayloadMismatchCount,
    normalized_evidence_parity:
      normalizedEvidenceMismatchCount === 0,
    normalized_evidence_mismatch_count:
      normalizedEvidenceMismatchCount,
    readonly_sealed: readonlySealed,
    sealed_mutation_trigger_missing_count:
      sealedMutationTriggerMissingCount,
    foreign_key_violation_count: foreignKeyViolationCount,
    endpoint_violation_count: endpointViolationCount,
    type_violation_count: typeViolationCount,
    evidence_violation_count: evidenceViolationCount,
    identity_ambiguity_count: identityAmbiguityCount,
    relationship_sql_diagnostic_count:
      relationshipSqlDiagnosticCount,
    disposition_evidence_violation_count:
      dispositionEvidenceViolationCount,
    completeness_role_violation_count:
      completenessRoleViolationCount,
    completeness_selector_violation_count:
      completenessSelectorViolationCount,
    completeness_finding_count: completenessFindingCount,
    completeness_sql_diagnostic_count:
      completenessSqlDiagnosticCount,
    waiver_scope_violation_count: waiverScopeCount,
    required_selector_count: expectedSelectors.length,
    mirrored_selector_count: selectorRows.length,
    required_selector_set_match: requiredSelectorSetMatch,
    enforcement_state_count: enforcementStates.length,
    enforcement_mode: enforcementState?.mode ?? null,
    hard_mode_ready:
      enforcementState?.hard_mode_ready === 1,
    violation_count: violationCount,
  };
}

function pinnedInputByPath(
  pins: readonly unknown[],
  path: string,
  label: string,
): FilePin {
  const parsed = pins.map((pin, index) =>
    filePin(pin, `${label} pin ${index}`)
  );
  const match = parsed.find((pin) => pin.path === path);
  assert(match, `${label} is missing required pin ${path}`);
  return match;
}

function assertPhysicalityPins(root: string): Record<string, unknown> {
  const summaryText = readRepositoryText(
    root,
    PHYSICALITY_SUMMARY_PATH,
  );
  const summary = object(
    parseJson<unknown>(summaryText, PHYSICALITY_SUMMARY_PATH),
    "occurrence-treatment physicality summary",
  );
  const manifest = object(
    parseJson<unknown>(
      readRepositoryText(root, PHYSICALITY_MANIFEST_PATH),
      PHYSICALITY_MANIFEST_PATH,
    ),
    "occurrence-treatment physicality manifest",
  );
  const files = object(
    manifest.files,
    "occurrence-treatment physicality manifest files",
  );
  const inputPins = Array.isArray(manifest.input_pins)
    ? manifest.input_pins
    : [];
  assert(
    manifest.schema_version === 1 &&
      manifest.contract_id ===
        "occurrence-treatment-physicality-v1" &&
      manifest.review_stage === "final_post_semantic_release" &&
      manifest.release_id === summary.release_id &&
      inputPins.length > 0,
    "Occurrence-treatment physicality manifest is not final and release-bound",
  );
  for (const [name, pinValue] of Object.entries(files)) {
    verifyRepositoryFilePin(
      root,
      pinValue,
      `physicality output ${name}`,
    );
  }
  for (let index = 0; index < inputPins.length; index += 1) {
    verifyRepositoryFilePin(
      root,
      inputPins[index],
      `physicality input ${index}`,
    );
  }
  const summaryPin = filePin(
    files["summary.json"],
    "physicality summary output",
  );
  assert(
    summaryPin.path === PHYSICALITY_SUMMARY_PATH &&
      summaryPin.sha256 === sha256(summaryText),
    "Physicality summary is not pinned by its quality manifest",
  );
  const findingsPin = filePin(
    files["findings.jsonl"],
    "physicality findings output",
  );
  assert(
    findingsPin.row_count === 0,
    "Final physicality findings ledger is not empty",
  );
  const contractPath =
    "data/contracts/occurrence-treatment-physicality/v1/contract.json";
  const policyPath =
    "data/contracts/occurrence-treatment-physicality/v1/policy.json";
  const ledgerPath =
    "data/contracts/occurrence-treatment-physicality/v1/review-ledger.jsonl";
  const contractPin = pinnedInputByPath(
    inputPins,
    contractPath,
    "physicality manifest",
  );
  const policyPin = pinnedInputByPath(
    inputPins,
    policyPath,
    "physicality manifest",
  );
  const ledgerPin = pinnedInputByPath(
    inputPins,
    ledgerPath,
    "physicality manifest",
  );
  const contractText = readRepositoryText(root, contractPath);
  const contract = object(
    parseJson<unknown>(contractText, contractPath),
    "physicality contract",
  );
  const reviewSnapshot = object(
    contract.review_snapshot,
    "physicality contract review_snapshot",
  );
  const contractPolicyPin = filePin(
    contract.policy,
    "physicality contract policy pin",
  );
  const contractLedger = object(
    contract.review_ledger,
    "physicality contract review ledger",
  );
  const contractLedgerPin = filePin(
    contractLedger,
    "physicality contract review-ledger pin",
  );
  const finalGuard = object(
    contract.final_post_semantic_release_guard,
    "physicality contract final guard",
  );
  assert(
    contract.contract_status === "reviewed_final" &&
      reviewSnapshot.stage === "final_post_semantic_release" &&
      reviewSnapshot.release_id === summary.release_id &&
      finalGuard.status === "verified" &&
      contractPolicyPin.path === policyPath &&
      contractPolicyPin.sha256 === policyPin.sha256 &&
      contractLedgerPin.path === ledgerPath &&
      contractLedgerPin.sha256 === ledgerPin.sha256 &&
      contractLedger.ledger_id ===
        "occurrence-treatment-physicality-review-v1" &&
      contractLedger.immutable_after_review === true &&
      contractPin.sha256 === sha256(contractText) &&
      summary.contract_sha256 === contractPin.sha256 &&
      summary.policy_sha256 === policyPin.sha256 &&
      summary.review_ledger_sha256 === ledgerPin.sha256,
    "Physicality contract/summary/manifest content addresses do not reconcile",
  );
  const snapshotPins = Array.isArray(reviewSnapshot.input_pins)
    ? reviewSnapshot.input_pins
    : [];
  assert(
    snapshotPins.length >= 5 &&
      snapshotPins.every((pin, index) => {
        const parsed = filePin(
          pin,
          `physicality contract snapshot pin ${index}`,
        );
        const manifestPin = inputPins
          .map((entry, inputIndex) =>
            filePin(
              entry,
              `physicality manifest input ${inputIndex}`,
            )
          )
          .find((entry) => entry.path === parsed.path);
        return manifestPin?.sha256 === parsed.sha256;
      }) &&
      reviewSnapshot.eligible_occurrence_count ===
        summary.eligible_occurrence_count &&
      reviewSnapshot.unique_treatment_count ===
        summary.unique_treatment_count &&
      reviewSnapshot.treatment_membership_count ===
        summary.treatment_membership_count,
    "Physicality contract review snapshot does not reconcile with the quality manifest and summary",
  );
  const releaseManifestPin = inputPins
    .map((pin, index) =>
      filePin(pin, `physicality release input ${index}`)
    )
    .find(
      (pin) =>
        pin.path ===
        `data/exports/releases/${String(summary.release_id)}/manifest.json`,
    );
  assert(
    releaseManifestPin?.sha256 ===
      summary.release_manifest_sha256,
    "Physicality summary is not bound to its final release manifest",
  );
  const ledgerRows = parseJsonl<Record<string, unknown>>(
    readRepositoryText(root, ledgerPath),
    ledgerPath,
  );
  const treatmentIds = ledgerRows.map((row) =>
    String(row.treatment_record_id ?? "")
  );
  assert(
    ledgerRows.length === summary.unique_treatment_count &&
      new Set(treatmentIds).size === ledgerRows.length &&
      ledgerRows.every(
        (row) =>
          typeof row.decision_id === "string" &&
          typeof row.reviewed_at === "string" &&
          typeof row.reviewed_by === "string" &&
          Array.isArray(row.evidence_ids) &&
          row.evidence_ids.length > 0,
      ),
    "Physicality review ledger does not exactly cover the final treatment denominator",
  );
  const expectedFingerprint = stableHash({
    schema_version: manifest.schema_version as JsonValue,
    release_id: manifest.release_id as JsonValue,
    review_stage: manifest.review_stage as JsonValue,
    input_pins: manifest.input_pins as JsonValue,
    files: manifest.files as JsonValue,
  });
  assert(
    manifest.audit_fingerprint === expectedFingerprint,
    "Physicality manifest audit fingerprint does not reconcile",
  );
  return summary;
}

function assertPhasePins(root: string): Record<string, unknown> {
  const summaryText = readRepositoryText(root, PHASE_SUMMARY_PATH);
  const summary = object(
    parseJson<unknown>(summaryText, PHASE_SUMMARY_PATH),
    "operational-occurrence phase summary",
  );
  const manifest = object(
    parseJson<unknown>(
      readRepositoryText(root, PHASE_MANIFEST_PATH),
      PHASE_MANIFEST_PATH,
    ),
    "operational-occurrence phase manifest",
  );
  const outputs = object(
    manifest.outputs,
    "operational-occurrence phase manifest outputs",
  );
  for (const [name, pinValue] of Object.entries(outputs)) {
    verifyRepositoryFilePin(
      root,
      pinValue,
      `phase output ${name}`,
    );
  }
  const outputPins = Object.values(outputs).map((pin, index) =>
    filePin(pin, `phase output pin ${index}`)
  );
  const outputPin = (path: string): FilePin => {
    const pin = outputPins.find((candidate) => candidate.path === path);
    assert(pin, `Phase manifest is missing output pin ${path}`);
    return pin;
  };
  const contractPath =
    "data/contracts/operational-occurrence-phases/v1/contract.json";
  const ledgerPath =
    "data/contracts/operational-occurrence-phases/v1/review-ledger.jsonl";
  const candidatesPath =
    "data/quality/relationship-integrity/operational-occurrence-phases/event-event-candidates.jsonl";
  const findingsPath =
    "data/quality/relationship-integrity/operational-occurrence-phases/findings.jsonl";
  const summaryPin = outputPin(PHASE_SUMMARY_PATH);
  const contractPin = outputPin(contractPath);
  const ledgerPin = outputPin(ledgerPath);
  const candidatesPin = outputPin(candidatesPath);
  const findingsPin = outputPin(findingsPath);
  const contentHashes = object(
    summary.content_hashes,
    "phase summary content hashes",
  );
  const derivedInputs = object(
    manifest.derived_inputs,
    "phase manifest derived inputs",
  );
  const expectedReproductionCommand =
    summary.release_id === "v1-rc20"
      ? "bun scripts/generate-operational-occurrence-phase-review-v1.ts --check"
      : `bun scripts/generate-operational-occurrence-phase-review-v1.ts --check --route-anchor-release-dir data/exports/releases/${String(summary.release_id)}`;
  assert(
    manifest.schema_version === 1 &&
      manifest.contract_id ===
        "operational-occurrence-phase-review-v1" &&
      summary.schema_version === 1 &&
      summary.contract_id ===
        "operational-occurrence-phase-review-v1" &&
      manifest.reproduction_command === expectedReproductionCommand &&
      summaryPin.sha256 === sha256(summaryText) &&
      contentHashes.review_ledger_sha256 === ledgerPin.sha256 &&
      contentHashes.event_event_candidates_sha256 ===
        candidatesPin.sha256 &&
      contentHashes.findings_sha256 === findingsPin.sha256 &&
      contentHashes.operational_occurrences_sha256 ===
        derivedInputs.operational_occurrences_sha256 &&
      contentHashes.canonical_phase_projection_sha256 ===
        derivedInputs.canonical_phase_projection_sha256 &&
      findingsPin.row_count === 0,
    "Phase summary is not exactly derived from its pinned outputs and canonical projection",
  );
  const routeAnchorRelease = object(
    manifest.route_anchor_release,
    "phase route-anchor release",
  );
  verifyRepositoryFilePin(
    root,
    routeAnchorRelease.manifest,
    "phase route-anchor manifest",
  );
  verifyRepositoryFilePin(
    root,
    routeAnchorRelease.route_anchors,
    "phase route-anchor rows",
  );
  assert(
    routeAnchorRelease.release_id === summary.release_id,
    "Phase summary release does not match the pinned route-anchor release",
  );
  const inputAggregates = object(
    manifest.input_aggregates,
    "phase manifest input aggregates",
  );
  const requiredAggregateRoles = [
    "anchor_review_decisions",
    "exact_source_evidence_files",
    "materialization_controls",
    "occurrence_review_decisions",
    "submission_journals",
  ];
  assert(
    stableJson(Object.keys(inputAggregates).sort() as unknown as JsonValue) ===
      stableJson(requiredAggregateRoles as unknown as JsonValue) &&
      Object.entries(inputAggregates).every(([role, value]) => {
        const aggregate = object(value, `phase input aggregate ${role}`);
        return (
          typeof aggregate.file_count === "number" &&
          Number.isInteger(aggregate.file_count) &&
          aggregate.file_count >= 0 &&
          typeof aggregate.bytes === "number" &&
          Number.isInteger(aggregate.bytes) &&
          aggregate.bytes >= 0 &&
          typeof aggregate.sha256 === "string" &&
          /^[a-f0-9]{64}$/u.test(aggregate.sha256) &&
          Array.isArray(aggregate.path_roots) &&
          aggregate.path_roots.length > 0
        );
      }),
    "Phase manifest does not expose the exact versioned input aggregate inventory",
  );
  const contract = object(
    parseJson<unknown>(
      readRepositoryText(root, contractPath),
      contractPath,
    ),
    "phase contract",
  );
  assert(
    contract.contract_id ===
      "operational-occurrence-phase-review-v1" &&
      contract.ledger_id ===
        "operational-occurrence-phase-review-ledger-v1" &&
      typeof contract.reviewed_at === "string" &&
      typeof contract.reviewed_by === "string" &&
      manifest.generated_at === contract.reviewed_at &&
      manifest.generated_by === contract.reviewed_by &&
      summary.ledger_id === contract.ledger_id &&
      Array.isArray(contract.prohibited_inferences) &&
      contract.prohibited_inferences.length > 0 &&
      typeof contract.enforcement_criteria === "object" &&
      contract.enforcement_criteria !== null &&
      contractPin.sha256 ===
        sha256(readRepositoryText(root, contractPath)),
    "Phase contract provenance is incomplete",
  );
  const ledgerRows = parseJsonl<Record<string, unknown>>(
    readRepositoryText(root, ledgerPath),
    ledgerPath,
  );
  const occurrenceIds = ledgerRows.map((row) =>
    String(row.occurrence_id ?? "")
  );
  assert(
    ledgerRows.length === summary.occurrence_count &&
      ledgerRows.length === summary.reviewed_occurrence_count &&
      new Set(occurrenceIds).size === ledgerRows.length &&
      ledgerRows.every(
        (row) =>
          row.review_state === "reviewed" &&
          Array.isArray(row.phase_record_ids) &&
          row.phase_record_ids.length > 0 &&
          typeof row.reviewed_at === "string" &&
          typeof row.reviewed_by === "string",
      ),
    "Phase review ledger does not exactly cover every occurrence",
  );
  return summary;
}

function assertPhysicalityAndPhasePins(root: string): void {
  const physicality = assertPhysicalityPins(root);
  const phase = assertPhasePins(root);
  assert(
    physicality.release_id === phase.release_id &&
      physicality.review_stage === "final_post_semantic_release",
    "Physicality and phase ledgers are not bound to the same final release",
  );
}

type SnapshotArtifactPin = {
  path: string;
  sha256: string;
  bytes: number;
};

type SnapshotCommandResult = {
  command_id: string;
  command: string;
  argv: string[];
  exit_code: number;
  output: SnapshotArtifactPin;
};

type DeterminismSnapshotManifest = {
  schema_version: 1;
  snapshot_id: string;
  captured_at: string;
  git_head: string;
  release_id: string;
  tracker_mutation_count: number;
  artifacts: Record<string, SnapshotArtifactPin>;
  command_results: SnapshotCommandResult[];
};

function snapshotAbsolutePath(
  snapshotRoot: string,
  path: string,
): string {
  assert(
    path.trim() === path && path.length > 0 && !isAbsolute(path),
    `Snapshot path must be relative: ${path}`,
  );
  const absolute = resolve(snapshotRoot, path);
  normalizedRelative(snapshotRoot, absolute);
  return absolute;
}

function snapshotPin(
  snapshotRoot: string,
  path: string,
): SnapshotArtifactPin {
  const absolute = snapshotAbsolutePath(snapshotRoot, path);
  const bytes = readFileSync(absolute);
  return {
    path,
    sha256: byteSha256(bytes),
    bytes: bytes.length,
  };
}

function verifySnapshotPin(
  snapshotRoot: string,
  value: unknown,
  label: string,
): Buffer {
  const pin = filePin(value, label);
  assert(
    typeof pin.bytes === "number",
    `${label} must pin an exact byte count`,
  );
  const absolute = snapshotAbsolutePath(snapshotRoot, pin.path);
  assert(existsSync(absolute), `${label} is missing: ${pin.path}`);
  const stat = lstatSync(absolute);
  assert(
    stat.isFile() && !stat.isSymbolicLink(),
    `${label} must be a regular non-symlink file`,
  );
  const realRoot = realpathSync(snapshotRoot);
  normalizedRelative(realRoot, realpathSync(absolute));
  const bytes = readFileSync(absolute);
  assert(
    bytes.length === pin.bytes && byteSha256(bytes) === pin.sha256,
    `${label} content address does not match the actual snapshot file`,
  );
  return bytes;
}

function gitOutput(
  cwd: string,
  args: readonly string[],
  label: string,
): Buffer {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "buffer",
    maxBuffer: 256 * 1024 * 1024,
  });
  assert(
    result.status === 0,
    `${label} failed: ${Buffer.from(result.stderr ?? "").toString("utf8").trim()}`,
  );
  return Buffer.from(result.stdout ?? "");
}

function nulSeparatedPaths(value: Buffer): string[] {
  return value
    .toString("utf8")
    .split("\0")
    .filter((path) => path.length > 0)
    .sort();
}

function contentAddressedRepoFiles(
  root: string,
  paths: readonly string[],
  label: string,
): Array<{ path: string; bytes: number; sha256: string }> {
  return paths.map((path) => {
    const absolute = repositoryPath(root, path);
    assert(existsSync(absolute), `${label} disappeared: ${path}`);
    const stat = lstatSync(absolute);
    assert(
      stat.isFile() && !stat.isSymbolicLink(),
      `${label} must be a regular non-symlink file: ${path}`,
    );
    normalizedRelative(realpathSync(root), realpathSync(absolute));
    const bytes = readFileSync(absolute);
    return {
      path,
      bytes: bytes.length,
      sha256: byteSha256(bytes),
    };
  });
}

function gitProtectedState(root: string, label: string): {
  head: string;
  status_sha256: string;
  worktree_diff_sha256: string;
  index_diff_sha256: string;
  index_sha256: string;
  untracked_files: Array<{
    path: string;
    bytes: number;
    sha256: string;
  }>;
  clean: boolean;
} {
  const head = gitOutput(
    root,
    ["rev-parse", "HEAD"],
    `${label} HEAD read`,
  ).toString("utf8").trim();
  assert(
    /^[a-f0-9]{40}$/u.test(head),
    `${label} HEAD is not a full commit id`,
  );
  const status = gitOutput(
    root,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    `${label} status read`,
  );
  const worktreeDiff = gitOutput(
    root,
    ["diff", "--no-ext-diff", "--binary"],
    `${label} worktree diff read`,
  );
  const indexDiff = gitOutput(
    root,
    ["diff", "--cached", "--no-ext-diff", "--binary"],
    `${label} index diff read`,
  );
  const index = gitOutput(
    root,
    ["ls-files", "-s", "-z"],
    `${label} index read`,
  );
  const untrackedPaths = nulSeparatedPaths(
    gitOutput(
      root,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      `${label} untracked inventory read`,
    ),
  );
  const untrackedFiles = contentAddressedRepoFiles(
    root,
    untrackedPaths,
    `${label} untracked file`,
  );
  return {
    head,
    status_sha256: byteSha256(status),
    worktree_diff_sha256: byteSha256(worktreeDiff),
    index_diff_sha256: byteSha256(indexDiff),
    index_sha256: byteSha256(index),
    untracked_files: untrackedFiles,
    clean:
      status.length === 0 &&
      worktreeDiff.length === 0 &&
      indexDiff.length === 0 &&
      untrackedFiles.length === 0,
  };
}

export function repositoryStateEvidenceText(
  root: string,
  releaseId: string,
): string {
  const protectedState = gitProtectedState(root, "MTA Wiki");
  gitOutput(
    root,
    ["ls-files", "--error-unmatch", GENERATOR_SOURCE_PATH],
    "MTA Wiki generator source tracking check",
  );
  const generatorSource = contentAddressedRepoFiles(
    root,
    [GENERATOR_SOURCE_PATH],
    "MTA Wiki generator source",
  )[0]!;
  const commandSpecText = snapshotCommandContractText(releaseId);
  return json({
    schema_version: 1,
    repository: "mta-wiki",
    ...protectedState,
    generator_source: generatorSource,
    command_spec_sha256: sha256(commandSpecText),
  } as unknown as JsonValue);
}

function trackerImporterSupport(
  sourceText: string,
): Record<string, number> {
  const literal = (name: string): number => {
    const pattern = new RegExp(
      `\\bconst\\s+${name}\\s*=\\s*(\\d+)\\s*;`,
      "gu",
    );
    const matches = [...sourceText.matchAll(pattern)];
    assert(
      matches.length === 1,
      `Tracker importer must define exactly one numeric ${name} literal`,
    );
    return Number(matches[0]![1]);
  };
  return {
    manifest_version: literal("MANIFEST_VERSION"),
    operational_anchors: literal(
      "OPERATIONAL_ANCHOR_CONTRACT_VERSION",
    ),
    operational_anchor_review_decisions: literal(
      "OPERATIONAL_ANCHOR_REVIEW_CONTRACT_VERSION",
    ),
    operational_occurrences: literal(
      "OPERATIONAL_OCCURRENCE_CONTRACT_VERSION",
    ),
    operational_occurrence_review_decisions: literal(
      "OPERATIONAL_OCCURRENCE_REVIEW_CONTRACT_VERSION",
    ),
  };
}

export function trackerStateEvidenceText(
  trackerRoot = TRACKER_ROOT,
): string {
  assert(
    existsSync(trackerRoot) && lstatSync(trackerRoot).isDirectory(),
    `Read-only Tracker checkout is missing: ${trackerRoot}`,
  );
  const protectedState = gitProtectedState(trackerRoot, "Tracker");
  const accessedFiles = contentAddressedRepoFiles(
    trackerRoot,
    [TRACKER_IMPORTER_SOURCE_PATH],
    "Tracker accessed compatibility file",
  );
  const importerText = readRepositoryText(
    trackerRoot,
    TRACKER_IMPORTER_SOURCE_PATH,
  );
  return json({
    schema_version: 1,
    repository: "bus-reliability-tracker",
    ...protectedState,
    accessed_files: accessedFiles,
    importer_support: trackerImporterSupport(importerText),
    ignored_file_policy: "not_hashed_unless_accessed",
    write_command_count: 0,
  } as unknown as JsonValue);
}

function recursiveRegularFiles(path: string): string[] {
  const stat = lstatSync(path);
  assert(
    !stat.isSymbolicLink(),
    `Determinism snapshot refuses symlinked materialization path: ${path}`,
  );
  if (stat.isFile()) return [path];
  assert(stat.isDirectory(), `Unsupported materialization path: ${path}`);
  return readdirSync(path)
    .sort()
    .flatMap((name) => recursiveRegularFiles(join(path, name)));
}

export function materializationInventoryText(root: string): string {
  // record-index.json and page-index.json under data/materialized were retired at the DB-only
  // cutover. Inventory the two current deterministic filesystem products and record the retired
  // root explicitly so an absent legacy directory is not mistaken for a missing current output.
  const roots = ["data/canonical", "wiki"];
  const retiredRoots = [{
    path: "data/materialized",
    status: "retired",
    replacement: "data/canonical.db plus direct generated-wiki root scan",
  }];
  const files = roots
    .flatMap((path) => recursiveRegularFiles(repositoryPath(root, path)))
    .filter((path) => !path.endsWith("canonical.db"))
    .sort()
    .map((path) => {
      const bytes = readFileSync(path);
      return {
        path: normalizedRelative(root, path),
        bytes: bytes.length,
        sha256: byteSha256(bytes),
      };
    });
  return json({
    schema_version: 1,
    inventory_id: "relationship-materialization-determinism-v1",
    roots,
    retired_roots: retiredRoots,
    file_count: files.length,
    files,
  } as unknown as JsonValue);
}

function findingIdentityText(
  mode: "warn" | "enforce",
): string {
  const records = readCanonicalRecords();
  const contract = loadRelationshipContract();
  const audit = auditRelationshipGraph(records, {
    mode,
    contract,
    includeOrphans: false,
  });
  return json(
    audit.findings
      .map((finding) => ({
        finding_id: finding.finding_id,
        code: finding.code,
        record_id: finding.record_id ?? null,
      }))
      .sort((left, right) =>
        left.finding_id.localeCompare(right.finding_id)
      ) as unknown as JsonValue,
  );
}

function writeSnapshotText(
  snapshotRoot: string,
  path: string,
  content: string | Buffer,
): SnapshotArtifactPin {
  const absolute = snapshotAbsolutePath(snapshotRoot, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
  return snapshotPin(snapshotRoot, path);
}

function runSnapshotCommand(input: {
  snapshotRoot: string;
  commandId: string;
  executable: string;
  args: string[];
}): SnapshotCommandResult {
  const result = spawnSync(input.executable, input.args, {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 256 * 1024 * 1024,
    env: process.env,
  });
  const output = Buffer.concat([
    Buffer.from("[stdout]\n"),
    Buffer.from(result.stdout ?? ""),
    Buffer.from("\n[stderr]\n"),
    Buffer.from(result.stderr ?? ""),
  ]);
  const outputPin = writeSnapshotText(
    input.snapshotRoot,
    `commands/${input.commandId}.log`,
    output,
  );
  return {
    command_id: input.commandId,
    command: [input.executable, ...input.args].join(" "),
    argv: [input.executable, ...input.args],
    exit_code: result.status ?? 1,
    output: outputPin,
  };
}

type SnapshotCommandSpecification = {
  commandId: string;
  executable: string;
  args: string[];
};

function snapshotCommandContract(
  releaseId: string,
): SnapshotCommandSpecification[] {
  const releaseRoot = "<SNAPSHOT_ROOT>/release-root";
  return [
    {
      commandId: "materialize",
      executable: "bun",
      args: ["run", "materialize"],
    },
    {
      commandId: "export",
      executable: "bun",
      args: [
        GENERATOR_SOURCE_PATH,
        "--capture-release-export",
        releaseRoot,
        "--release-id",
        releaseId,
      ],
    },
    {
      commandId: "architecture",
      executable: "bun",
      args: [
        "test",
        "packages/pipeline/test/materialize/export-release.test.ts",
        "packages/db/test/relationship-contract.test.ts",
        "--timeout",
        "900000",
      ],
    },
    {
      commandId: "quality",
      executable: "bun",
      args: ["run", "relationship-integrity"],
    },
    {
      commandId: "schema",
      executable: "bun",
      args: [
        "test",
        "packages/db/test/schema-contract.test.ts",
        "packages/db/test/schema-validators-contract.test.ts",
      ],
    },
    {
      commandId: "test",
      executable: "bun",
      args: ["run", "test"],
    },
    {
      commandId: "typecheck",
      executable: "bun",
      args: ["run", "typecheck"],
    },
    {
      commandId: "validate",
      executable: "bun",
      args: ["run", "validate"],
    },
  ];
}

export function snapshotCommandContractText(
  releaseId: string,
): string {
  return json(
    snapshotCommandContract(releaseId) as unknown as JsonValue,
  );
}

export function snapshotCommandSpecifications(
  snapshotRoot: string,
  releaseId: string,
): SnapshotCommandSpecification[] {
  const placeholder = "<SNAPSHOT_ROOT>";
  return snapshotCommandContract(releaseId).map((specification) => ({
    ...specification,
    args: specification.args.map((argument) =>
      argument.replaceAll(placeholder, resolve(snapshotRoot))
    ),
  }));
}

export function exportSnapshotRelease(
  outputRoot: string,
  releaseId: string,
): string {
  assert(!existsSync(outputRoot), `Snapshot release root already exists: ${outputRoot}`);
  mkdirSync(outputRoot, { recursive: true });
  const routeReview = readRouteAnchorReview(
    routeAnchorOverridesPath(repoRoot),
  );
  const result = exportRelease(releaseId, {
    rootDir: outputRoot,
    records: readCanonicalRecords(),
    gtfsRoutes: readGtfsRoutesFromDb(),
    routeAnchorOverrides: routeReview.overrides,
    reviewedNonGtfsRouteDispositions:
      routeReview.non_gtfs_dispositions,
    operationalAnchorReviewDecisionDir:
      operationalAnchorReviewAcceptedDir(),
    operationalOccurrenceReviewDecisionDir:
      operationalOccurrenceReviewAcceptedDir(repoRoot),
    operationalOccurrenceIdentityRegistry:
      loadOperationalOccurrenceIdentityRegistry(
        operationalOccurrenceIdentityRegistryPath(repoRoot),
      ),
    relationshipIntegrityBundleDescriptor: null,
    qualityReport: null,
    setLatest: false,
  });
  return result.manifestPath;
}

export function captureDeterminismSnapshot(
  requestedPath: string,
  releaseId: string,
): DeterminismSnapshotManifest {
  assert(
    releaseId === DETERMINISM_RELEASE_ID,
    `Snapshot release id must be ${DETERMINISM_RELEASE_ID}: ${releaseId}`,
  );
  const snapshotRoot = resolve(requestedPath);
  const resolvedRepoRoot = resolve(repoRoot);
  assert(
    snapshotRoot !== resolvedRepoRoot &&
      !snapshotRoot.startsWith(`${resolvedRepoRoot}${sep}`),
    "Snapshot directory must be outside the MTA Wiki repository",
  );
  assert(
    !existsSync(snapshotRoot),
    `Snapshot directory already exists; independent captures require a new directory: ${snapshotRoot}`,
  );
  const capturedAt = new Date().toISOString();
  const repositoryStateBefore = repositoryStateEvidenceText(
    repoRoot,
    releaseId,
  );
  const repositoryState = object(
    parseJson<unknown>(repositoryStateBefore, "MTA Wiki state"),
    "MTA Wiki state",
  );
  assert(
    repositoryState.clean === true,
    "Determinism capture requires an exact clean MTA Wiki HEAD/index/worktree/untracked state",
  );
  const gitHead = String(repositoryState.head);
  const trackerBefore = trackerStateEvidenceText();
  const generatorSource = readRepositoryBytes(
    repoRoot,
    GENERATOR_SOURCE_PATH,
  );
  const commandSpec = snapshotCommandContractText(releaseId);

  mkdirSync(snapshotRoot, { recursive: true });
  const latestPath = repositoryPath(
    repoRoot,
    "data/exports/releases/LATEST",
  );
  const rc20Path = repositoryPath(
    repoRoot,
    "data/exports/releases/v1-rc20/manifest.json",
  );
  const artifacts: Record<string, SnapshotArtifactPin> = {};
  artifacts.repository_state_before = writeSnapshotText(
    snapshotRoot,
    "provenance/repository-state.before.json",
    repositoryStateBefore,
  );
  artifacts.generator_source = writeSnapshotText(
    snapshotRoot,
    "provenance/generator-source.ts",
    generatorSource,
  );
  artifacts.command_spec = writeSnapshotText(
    snapshotRoot,
    "provenance/command-spec.json",
    commandSpec,
  );
  artifacts.latest_before = writeSnapshotText(
    snapshotRoot,
    "immutability/LATEST.before",
    readFileSync(latestPath),
  );
  artifacts.rc20_manifest_before = writeSnapshotText(
    snapshotRoot,
    "immutability/rc20-manifest.before.json",
    readFileSync(rc20Path),
  );
  artifacts.tracker_state_before = writeSnapshotText(
    snapshotRoot,
    "immutability/tracker-state.before.json",
    trackerBefore,
  );

  const releaseRoot = join(snapshotRoot, "release-root");
  const commandSpecs = snapshotCommandSpecifications(
    snapshotRoot,
    releaseId,
  );
  const commandResults = commandSpecs.map((spec) =>
    runSnapshotCommand({ snapshotRoot, ...spec })
  );

  artifacts.materialization = writeSnapshotText(
    snapshotRoot,
    "materialization-hashes.json",
    materializationInventoryText(repoRoot),
  );
  copyFileSync(
    repositoryPath(repoRoot, CANONICAL_DB_PATH),
    snapshotAbsolutePath(snapshotRoot, "canonical.db"),
  );
  artifacts.sqlite = snapshotPin(snapshotRoot, "canonical.db");
  const releaseManifestPath = join(
    releaseRoot,
    "data/exports/releases",
    releaseId,
    "manifest.json",
  );
  assert(
    existsSync(releaseManifestPath),
    "Temporary-root release export did not produce a manifest",
  );
  artifacts.release = snapshotPin(
    snapshotRoot,
    normalizedRelative(snapshotRoot, releaseManifestPath),
  );
  artifacts.warning_finding_identities = writeSnapshotText(
    snapshotRoot,
    "warning-finding-identities.json",
    findingIdentityText("warn"),
  );
  artifacts.enforcement_finding_identities = writeSnapshotText(
    snapshotRoot,
    "enforcement-finding-identities.json",
    findingIdentityText("enforce"),
  );
  artifacts.latest_after = writeSnapshotText(
    snapshotRoot,
    "immutability/LATEST.after",
    readFileSync(latestPath),
  );
  artifacts.rc20_manifest_after = writeSnapshotText(
    snapshotRoot,
    "immutability/rc20-manifest.after.json",
    readFileSync(rc20Path),
  );
  const trackerAfter = trackerStateEvidenceText();
  artifacts.tracker_state_after = writeSnapshotText(
    snapshotRoot,
    "immutability/tracker-state.after.json",
    trackerAfter,
  );
  const repositoryStateAfter = repositoryStateEvidenceText(
    repoRoot,
    releaseId,
  );
  artifacts.repository_state_after = writeSnapshotText(
    snapshotRoot,
    "provenance/repository-state.after.json",
    repositoryStateAfter,
  );
  assert(
    repositoryStateBefore === repositoryStateAfter,
    "MTA Wiki HEAD/index/worktree/untracked state changed during snapshot capture",
  );
  const trackerMutationCount = trackerBefore === trackerAfter ? 0 : 1;
  const manifest: DeterminismSnapshotManifest = {
    schema_version: 1,
    snapshot_id: `relationship-determinism-snapshot:${stableHash({
      captured_at: capturedAt,
      git_head: gitHead,
      release_id: releaseId,
    })}`,
    captured_at: capturedAt,
    git_head: gitHead,
    release_id: releaseId,
    tracker_mutation_count: trackerMutationCount,
    artifacts: Object.fromEntries(
      Object.entries(artifacts).sort(([left], [right]) =>
        left.localeCompare(right)
      ),
    ),
    command_results: [...commandResults].sort((left, right) =>
      left.command_id.localeCompare(right.command_id)
    ),
  };
  writeSnapshotText(snapshotRoot, "manifest.json", json(manifest as unknown as JsonValue));
  assert(
    commandResults.every((result) => result.exit_code === 0),
    `Snapshot command failure(s): ${commandResults.filter((result) => result.exit_code !== 0).map((result) => result.command_id).join(", ")}`,
  );
  assert(
    trackerMutationCount === 0,
    "Read-only Tracker state changed during snapshot capture",
  );
  return manifest;
}

type SnapshotRecordIdentity = {
  record_id: string;
  record_kind: string;
};

type SnapshotFindingIdentity = {
  finding_id: string;
  code: string;
  record_id: string | null;
};

type ValidatedSnapshotSqlite = {
  record_identities: SnapshotRecordIdentity[];
  relation_ids: string[];
  finding_identities: SnapshotFindingIdentity[];
};

type ValidatedSnapshotRelease = {
  manifest: ReleaseManifest;
  record_identities: SnapshotRecordIdentity[];
  relation_ids: string[];
};

export type DeterminismValidationOptions = {
  currentRepoRoot?: string;
  trackerRoot?: string;
};

function findingIdentities(
  value: Buffer,
  label: string,
): SnapshotFindingIdentity[] {
  const parsed = parseJson<unknown>(value.toString("utf8"), label);
  assert(Array.isArray(parsed), `${label} must be a JSON array`);
  const result = parsed.map((entry, index) => {
    const finding = object(entry, `${label} row ${index + 1}`);
    assert(
      typeof finding.finding_id === "string" &&
        finding.finding_id.trim().length > 0 &&
        typeof finding.code === "string" &&
        finding.code.trim().length > 0 &&
        (finding.record_id === null ||
          typeof finding.record_id === "string"),
      `${label} contains an invalid finding identity`,
    );
    return {
      finding_id: finding.finding_id,
      code: finding.code,
      record_id: finding.record_id ?? null,
    };
  });
  const sorted = [...result].sort((left, right) =>
    left.finding_id.localeCompare(right.finding_id)
  );
  assert(
    new Set(result.map((entry) => entry.finding_id)).size ===
        result.length &&
      stableJson(result as unknown as JsonValue) ===
        stableJson(sorted as unknown as JsonValue),
    `${label} must contain unique identities sorted by finding_id`,
  );
  return result;
}

function validateSnapshotSqlite(
  path: string,
  warningFindings: SnapshotFindingIdentity[],
  enforcementFindings: SnapshotFindingIdentity[],
  label: string,
): ValidatedSnapshotSqlite {
  let db: Database;
  try {
    db = openCanonicalDb(path, { readonly: true });
  } catch (error) {
    throw new Error(
      `${label} is not a real sealed canonical.db v${CANONICAL_DB_VERSION}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    const integrity = db.query("PRAGMA integrity_check").all() as Array<
      Record<string, unknown>
    >;
    assert(
      integrity.length === 1 &&
        Object.values(integrity[0] ?? {})[0] === "ok",
      `${label} failed SQLite integrity_check`,
    );
    assert(
      (db.query("PRAGMA foreign_key_check").all() as unknown[])
        .length === 0,
      `${label} has foreign-key violations`,
    );
    const triggerNames = new Set(
      (
        db.query(`
          SELECT name FROM sqlite_master
          WHERE type = 'trigger'
        `).all() as Array<{ name: string }>
      ).map((row) => row.name),
    );
    const missingSealTriggers = SEALED_RELATIONSHIP_TABLES.flatMap(
      (table) =>
        ["insert", "update", "delete"].map(
          (operation) => `${table}_sealed_${operation}`,
        ),
    ).filter((name) => !triggerNames.has(name));
    assert(
      missingSealTriggers.length === 0,
      `${label} is missing sealed mutation triggers: ${missingSealTriggers.join(", ")}`,
    );
    const recordIdentities = (
      db.query(`
        SELECT record_id, record_kind
        FROM records
      `).all() as SnapshotRecordIdentity[]
    ).sort(compareReleaseRecordIdentities);
    const relationIds = (
      db.query(`
        SELECT record_id
        FROM relations
      `).all() as Array<{ record_id: string }>
    ).map((row) => row.record_id).sort(compareReleaseRecordIds);
    const relationRecordIds = recordIdentities
      .filter((record) => record.record_kind === "relation")
      .map((record) => record.record_id)
      .sort(compareReleaseRecordIds);
    assert(
      stableJson(relationIds as unknown as JsonValue) ===
        stableJson(relationRecordIds as unknown as JsonValue),
      `${label} relation edge identities do not match relation records`,
    );
    const sqliteFindings = (
      db.query(`
        SELECT finding_id, code, record_id
        FROM relationship_validation_findings
      `).all() as SnapshotFindingIdentity[]
    ).sort((left, right) =>
      left.finding_id.localeCompare(right.finding_id)
    );
    const sqliteFindingJson = stableJson(
      sqliteFindings as unknown as JsonValue,
    );
    assert(
      sqliteFindingJson ===
          stableJson(warningFindings as unknown as JsonValue) &&
        sqliteFindingJson ===
          stableJson(enforcementFindings as unknown as JsonValue),
      `${label} graph finding identities do not match warning and enforcement audits`,
    );
    return {
      record_identities: recordIdentities,
      relation_ids: relationIds,
      finding_identities: sqliteFindings,
    };
  } finally {
    db.close();
  }
}

const SNAPSHOT_RELEASE_SUPPORT_FILES = [
  "operational_anchors.jsonl",
  "operational_anchors_summary.json",
  "operational_anchor_review_decisions.json",
  "operational_occurrences.jsonl",
  "operational_occurrences_summary.json",
  "operational_occurrence_review_decisions.json",
  "route_anchors.jsonl",
  "taxonomy.json",
] as const;

function releaseFileBytes(
  releaseDir: string,
  name: string,
  metadata: { bytes: number; sha256: string },
  label: string,
): Buffer {
  const absolute = resolve(releaseDir, name);
  normalizedRelative(releaseDir, absolute);
  assert(existsSync(absolute), `${label} is missing ${name}`);
  const stat = lstatSync(absolute);
  assert(
    stat.isFile() && !stat.isSymbolicLink(),
    `${label} file must be a regular non-symlink: ${name}`,
  );
  normalizedRelative(realpathSync(releaseDir), realpathSync(absolute));
  const bytes = readFileSync(absolute);
  assert(
    bytes.length === metadata.bytes &&
      byteSha256(bytes) === metadata.sha256,
    `${label} file content address does not match: ${name}`,
  );
  return bytes;
}

function jsonlObjects(bytes: Buffer, label: string): Record<string, unknown>[] {
  return bytes
    .toString("utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line, index) =>
      object(
        parseJson<unknown>(line, `${label}:${index + 1}`),
        `${label}:${index + 1}`,
      )
    );
}

function validateSnapshotRelease(
  snapshotRoot: string,
  pin: SnapshotArtifactPin,
  manifestBytes: Buffer,
  expectedHead: string,
  sqlite: ValidatedSnapshotSqlite,
  label: string,
): ValidatedSnapshotRelease {
  const expectedManifestPath =
    `release-root/data/exports/releases/${DETERMINISM_RELEASE_ID}/manifest.json`;
  assert(
    pin.path === expectedManifestPath,
    `${label} manifest path must be ${expectedManifestPath}`,
  );
  const manifest = parseReleaseManifest(
    parseJson<unknown>(manifestBytes.toString("utf8"), label),
  );
  assert(
    manifest.manifest_version === 3 &&
      manifest.release_id === DETERMINISM_RELEASE_ID &&
      manifest.generator_commit === expectedHead &&
      manifest.contract_versions.operational_anchors === 1 &&
      manifest.contract_versions
          .operational_anchor_review_decisions === 1 &&
      manifest.contract_versions.operational_occurrences === 2 &&
      manifest.contract_versions
          .operational_occurrence_review_decisions === 1,
    `${label} must be an exact schema-v3 ${DETERMINISM_RELEASE_ID} export from the captured HEAD`,
  );
  const expectedFiles = [
    ...FILE_BY_KIND.values(),
    ...SNAPSHOT_RELEASE_SUPPORT_FILES,
  ].sort();
  assert(
    stableJson(Object.keys(manifest.files).sort() as unknown as JsonValue) ===
      stableJson(expectedFiles as unknown as JsonValue),
    `${label} file inventory is not the exact schema-v3 export inventory`,
  );
  const expectedPointers = {
    operational_anchors: "operational_anchors.jsonl",
    operational_anchor_summary: "operational_anchors_summary.json",
    operational_anchor_review_decisions:
      "operational_anchor_review_decisions.json",
    operational_occurrences: "operational_occurrences.jsonl",
    operational_occurrence_summary:
      "operational_occurrences_summary.json",
    operational_occurrence_review_decisions:
      "operational_occurrence_review_decisions.json",
    route_anchors: "route_anchors.jsonl",
    taxonomy: "taxonomy.json",
    quality_report: null,
    relationship_integrity_bundle: null,
  };
  assert(
    stableJson(manifest.pointers as unknown as JsonValue) ===
      stableJson(expectedPointers as unknown as JsonValue),
    `${label} pointers are not the exact schema-v3 export pointers`,
  );
  const releaseDir = dirname(snapshotAbsolutePath(snapshotRoot, pin.path));
  const releaseEntries = readdirSync(releaseDir, {
    withFileTypes: true,
  });
  assert(
    releaseEntries.every(
      (entry) => entry.isFile() && !entry.isSymbolicLink(),
    ) &&
      stableJson(
        releaseEntries.map((entry) => entry.name).sort() as unknown as JsonValue,
      ) ===
        stableJson(
          [...expectedFiles, "manifest.json"].sort() as unknown as JsonValue,
        ),
    `${label} directory contains files outside the exact manifest-v3 export inventory`,
  );
  const fileBytes = new Map(
    Object.entries(manifest.files).map(([name, metadata]) => [
      name,
      releaseFileBytes(releaseDir, name, metadata, label),
    ]),
  );
  const recordIdentities: SnapshotRecordIdentity[] = [];
  const observedCounts: Record<string, number> = {};
  for (const [kind, fileName] of FILE_BY_KIND) {
    const rows = jsonlObjects(
      fileBytes.get(fileName)!,
      `${label}/${fileName}`,
    );
    const identities = rows.map((row) => {
      assert(
        typeof row.record_id === "string" &&
          row.record_id.trim().length > 0 &&
          row.record_kind === kind,
        `${label}/${fileName} contains an invalid canonical record identity`,
      );
      return {
        record_id: row.record_id,
        record_kind: kind,
      };
    });
    const ids = identities.map((identity) => identity.record_id);
    assertReleaseRecordIdsUniqueAndSorted(
      ids,
      `${label}/${fileName}`,
    );
    recordIdentities.push(...identities);
    observedCounts[kind] = rows.length;
  }
  assert(
    stableJson(manifest.record_counts as unknown as JsonValue) ===
      stableJson(observedCounts as unknown as JsonValue),
    `${label} record_counts do not match canonical JSONL rows`,
  );
  for (const name of [
    "operational_anchors.jsonl",
    "operational_occurrences.jsonl",
    "route_anchors.jsonl",
  ]) {
    jsonlObjects(fileBytes.get(name)!, `${label}/${name}`);
  }
  for (const name of [
    "operational_anchors_summary.json",
    "operational_anchor_review_decisions.json",
    "operational_occurrences_summary.json",
    "operational_occurrence_review_decisions.json",
    "taxonomy.json",
  ]) {
    object(
      parseJson<unknown>(
        fileBytes.get(name)!.toString("utf8"),
        `${label}/${name}`,
      ),
      `${label}/${name}`,
    );
  }
  const sortedRecordIdentities = [...recordIdentities].sort(
    compareReleaseRecordIdentities,
  );
  const relationIds = recordIdentities
    .filter((identity) => identity.record_kind === "relation")
    .map((identity) => identity.record_id)
    .sort(compareReleaseRecordIds);
  assert(
    stableJson(sortedRecordIdentities as unknown as JsonValue) ===
        stableJson(sqlite.record_identities as unknown as JsonValue) &&
      stableJson(relationIds as unknown as JsonValue) ===
        stableJson(sqlite.relation_ids as unknown as JsonValue),
    `${label} record and relation identities do not match canonical.db`,
  );
  return {
    manifest,
    record_identities: sortedRecordIdentities,
    relation_ids: relationIds,
  };
}

type LoadedSnapshot = {
  root: string;
  manifest: DeterminismSnapshotManifest;
  manifestSha256: string;
  artifactBytes: Map<string, Buffer>;
  commandOutputs: Map<string, Buffer>;
  repositoryState: Record<string, unknown>;
  trackerState: Record<string, unknown>;
  sqlite: ValidatedSnapshotSqlite;
  release: ValidatedSnapshotRelease;
};

function loadDeterminismSnapshot(
  path: string,
  options: DeterminismValidationOptions,
): LoadedSnapshot {
  const root = realpathSync(resolve(path));
  assert(lstatSync(root).isDirectory(), `Snapshot is not a directory: ${path}`);
  const manifestBytes = readFileSync(join(root, "manifest.json"));
  const manifest = parseJson<DeterminismSnapshotManifest>(
    manifestBytes.toString("utf8"),
    `${path}/manifest.json`,
  );
  assert(
    manifest.schema_version === 1 &&
      typeof manifest.snapshot_id === "string" &&
      manifest.snapshot_id.trim().length > 0 &&
      typeof manifest.captured_at === "string" &&
      !Number.isNaN(Date.parse(manifest.captured_at)) &&
      /^[a-f0-9]{40}$/u.test(manifest.git_head) &&
      manifest.release_id === DETERMINISM_RELEASE_ID,
    `Snapshot manifest header is invalid: ${path}`,
  );
  const requiredArtifacts = [
    "command_spec",
    "enforcement_finding_identities",
    "generator_source",
    "latest_after",
    "latest_before",
    "materialization",
    "rc20_manifest_after",
    "rc20_manifest_before",
    "repository_state_after",
    "repository_state_before",
    "release",
    "sqlite",
    "tracker_state_after",
    "tracker_state_before",
    "warning_finding_identities",
  ];
  assert(
    stableJson(Object.keys(manifest.artifacts).sort() as unknown as JsonValue) ===
      stableJson([...requiredArtifacts].sort() as unknown as JsonValue),
    `Snapshot artifact inventory is not exact: ${path}`,
  );
  const artifactBytes = new Map<string, Buffer>();
  for (const [role, pin] of Object.entries(manifest.artifacts)) {
    artifactBytes.set(
      role,
      verifySnapshotPin(root, pin, `${path} artifact ${role}`),
    );
  }
  const repositoryStateBefore = artifactBytes.get(
    "repository_state_before",
  )!;
  const repositoryStateAfter = artifactBytes.get(
    "repository_state_after",
  )!;
  assert(
    repositoryStateBefore.equals(repositoryStateAfter),
    `Snapshot MTA Wiki repository state changed during capture: ${path}`,
  );
  const repositoryState = object(
    parseJson<unknown>(
      repositoryStateBefore.toString("utf8"),
      `${path} MTA Wiki repository state`,
    ),
    `${path} MTA Wiki repository state`,
  );
  const currentRepoRoot = options.currentRepoRoot ?? repoRoot;
  const currentRepositoryStateText = repositoryStateEvidenceText(
    currentRepoRoot,
    manifest.release_id,
  );
  const currentRepositoryState = object(
    parseJson<unknown>(
      currentRepositoryStateText,
      "current MTA Wiki repository state",
    ),
    "current MTA Wiki repository state",
  );
  assert(
    repositoryState.clean === true &&
      currentRepositoryState.clean === true &&
      repositoryState.head === manifest.git_head &&
      repositoryStateBefore.toString("utf8") ===
        currentRepositoryStateText,
    `Snapshot does not match the exact current clean MTA Wiki HEAD/index/worktree/untracked state: ${path}`,
  );
  const currentGeneratorSource = readRepositoryBytes(
    currentRepoRoot,
    GENERATOR_SOURCE_PATH,
  );
  assert(
    artifactBytes.get("generator_source")!.equals(
      currentGeneratorSource,
    ) &&
      object(
        repositoryState.generator_source,
        `${path} generator source pin`,
      ).sha256 === byteSha256(currentGeneratorSource),
    `Snapshot generator source does not match the exact current tracked generator: ${path}`,
  );
  const expectedCommandSpec = snapshotCommandContractText(
    manifest.release_id,
  );
  assert(
    artifactBytes.get("command_spec")!.toString("utf8") ===
        expectedCommandSpec &&
      repositoryState.command_spec_sha256 ===
        sha256(expectedCommandSpec),
    `Snapshot command specification is stale or substituted: ${path}`,
  );
  const trackerStateBefore = artifactBytes.get(
    "tracker_state_before",
  )!;
  const trackerStateAfter = artifactBytes.get(
    "tracker_state_after",
  )!;
  const currentTrackerStateText = trackerStateEvidenceText(
    options.trackerRoot ?? TRACKER_ROOT,
  );
  assert(
    trackerStateBefore.equals(trackerStateAfter) &&
      trackerStateBefore.toString("utf8") === currentTrackerStateText,
    `Snapshot does not match the exact current protected Tracker state: ${path}`,
  );
  const trackerState = object(
    parseJson<unknown>(
      currentTrackerStateText,
      `${path} Tracker state`,
    ),
    `${path} Tracker state`,
  );
  const trackerAccessedFiles = Array.isArray(
      trackerState.accessed_files,
    )
    ? trackerState.accessed_files.map((entry, index) =>
        object(entry, `${path} Tracker accessed file ${index}`)
      )
    : [];
  assert(
    trackerState.write_command_count === 0 &&
      trackerState.ignored_file_policy ===
        "not_hashed_unless_accessed" &&
      trackerAccessedFiles.length === 1 &&
      trackerAccessedFiles[0]!.path ===
        TRACKER_IMPORTER_SOURCE_PATH &&
      typeof trackerAccessedFiles[0]!.sha256 === "string" &&
      /^[a-f0-9]{64}$/u.test(
        String(trackerAccessedFiles[0]!.sha256),
      ),
    `Snapshot Tracker compatibility evidence is incomplete: ${path}`,
  );
  assert(
    manifest.tracker_mutation_count ===
      (artifactBytes.get("tracker_state_before")!.equals(
        artifactBytes.get("tracker_state_after")!,
      )
        ? 0
        : 1),
    `Snapshot Tracker mutation count is not derived: ${path}`,
  );
  assert(
    artifactBytes.get("materialization")!.toString("utf8") ===
      materializationInventoryText(currentRepoRoot),
    `Snapshot materialization inventory does not match the current clean repository: ${path}`,
  );
  const currentDatabaseBytes = readRepositoryBytes(
    currentRepoRoot,
    CANONICAL_DB_PATH,
  );
  assert(
    artifactBytes.get("sqlite")!.equals(currentDatabaseBytes),
    `Snapshot canonical.db does not match the current clean repository: ${path}`,
  );
  const warningFindings = findingIdentities(
    artifactBytes.get("warning_finding_identities")!,
    `${path} warning finding identities`,
  );
  const enforcementFindings = findingIdentities(
    artifactBytes.get("enforcement_finding_identities")!,
    `${path} enforcement finding identities`,
  );
  const sqlite = validateSnapshotSqlite(
    snapshotAbsolutePath(
      root,
      manifest.artifacts.sqlite!.path,
    ),
    warningFindings,
    enforcementFindings,
    `${path} canonical.db`,
  );
  const release = validateSnapshotRelease(
    root,
    manifest.artifacts.release!,
    artifactBytes.get("release")!,
    manifest.git_head,
    sqlite,
    `${path} release manifest`,
  );
  const commandIds = manifest.command_results
    .map((result) => result.command_id)
    .sort();
  assert(
    stableJson(commandIds as unknown as JsonValue) ===
      stableJson([...REQUIRED_COMMAND_IDS] as unknown as JsonValue) &&
      new Set(commandIds).size === commandIds.length,
    `Snapshot command inventory is not exact: ${path}`,
  );
  const commandOutputs = new Map<string, Buffer>();
  const expectedCommands = new Map(
    snapshotCommandSpecifications(root, manifest.release_id).map(
      (spec) => [
        spec.commandId,
        [spec.executable, ...spec.args],
      ] as const,
    ),
  );
  for (const result of manifest.command_results) {
    const expectedArgv = expectedCommands.get(result.command_id);
    assert(
      typeof result.command === "string" &&
        result.command.trim().length > 0 &&
        Array.isArray(result.argv) &&
        result.argv.every((arg) => typeof arg === "string") &&
        expectedArgv !== undefined &&
        stableJson(result.argv as unknown as JsonValue) ===
          stableJson(expectedArgv as unknown as JsonValue) &&
        result.command === result.argv.join(" ") &&
        Number.isInteger(result.exit_code),
      `Snapshot command result is invalid: ${path}/${result.command_id}`,
    );
    commandOutputs.set(
      result.command_id,
      verifySnapshotPin(
        root,
        result.output,
        `${path} command ${result.command_id}`,
      ),
    );
  }
  return {
    root,
    manifest,
    manifestSha256: byteSha256(manifestBytes),
    artifactBytes,
    commandOutputs,
    repositoryState,
    trackerState,
    sqlite,
    release,
  };
}

export function deriveDeterminismConsumerSummary(
  snapshotAPath: string,
  snapshotBPath: string,
  options: DeterminismValidationOptions = {},
): JsonObject {
  const a = loadDeterminismSnapshot(snapshotAPath, options);
  const b = loadDeterminismSnapshot(snapshotBPath, options);
  assert(
    a.root !== b.root &&
      a.manifest.snapshot_id !== b.manifest.snapshot_id &&
      a.manifest.captured_at !== b.manifest.captured_at,
    "Determinism proof requires two independently captured snapshot invocations",
  );
  const artifactHash = (snapshot: LoadedSnapshot, role: string) =>
    snapshot.manifest.artifacts[role]!.sha256;
  const releaseContractVersions = {
    manifest_version: a.release.manifest.manifest_version,
    operational_anchors:
      a.release.manifest.contract_versions.operational_anchors!,
    operational_anchor_review_decisions:
      a.release.manifest.contract_versions
        .operational_anchor_review_decisions!,
    operational_occurrences:
      a.release.manifest.contract_versions.operational_occurrences!,
    operational_occurrence_review_decisions:
      a.release.manifest.contract_versions
        .operational_occurrence_review_decisions!,
  };
  const trackerImporterSupportA = object(
    a.trackerState.importer_support,
    "Tracker importer support",
  );
  const trackerImporterSupportB = object(
    b.trackerState.importer_support,
    "Tracker importer support",
  );
  assert(
    stableJson(trackerImporterSupportA as unknown as JsonValue) ===
        stableJson(trackerImporterSupportB as unknown as JsonValue) &&
      stableJson(
        a.release.manifest.contract_versions as unknown as JsonValue,
      ) ===
        stableJson(
          b.release.manifest.contract_versions as unknown as JsonValue,
        ),
    "Determinism snapshots disagree on pinned release or Tracker importer contract versions",
  );
  const versionKeys = [
    "manifest_version",
    "operational_anchors",
    "operational_anchor_review_decisions",
    "operational_occurrences",
    "operational_occurrence_review_decisions",
  ] as const;
  const unsupportedVersionPairs = versionKeys.flatMap((contract) => {
    const releaseVersion = releaseContractVersions[contract];
    const supportedVersion = trackerImporterSupportA[contract];
    assert(
      typeof supportedVersion === "number" &&
        Number.isInteger(supportedVersion),
      `Tracker importer support is missing ${contract}`,
    );
    return releaseVersion === supportedVersion
      ? []
      : [{
          contract,
          release_version: releaseVersion,
          supported_version: supportedVersion,
        }];
  });
  const exactExpectedUnsupportedPair = [{
    contract: "operational_occurrences",
    release_version: 2,
    supported_version: 1,
  }];
  assert(
    stableJson(unsupportedVersionPairs as unknown as JsonValue) ===
      stableJson(
        exactExpectedUnsupportedPair as unknown as JsonValue,
      ),
    unsupportedVersionPairs.length === 0
      ? "Tracker importer is now compatible; a pinned read-only replay is required before enforcement"
      : "Tracker incompatibility is not the reviewed exact operational-occurrences v2 versus v1 pair",
  );
  const trackerCompatibilityStatus =
    unsupportedVersionPairs.length > 0
      ? "incompatible_operational_occurrence_schema_v2"
      : "compatible";
  const trackerReplayStatus =
    unsupportedVersionPairs.length > 0
      ? "not_run_incompatible_schema_v2"
      : "read_only_replay_passed";
  const latestBefore = a.artifactBytes
    .get("latest_before")!
    .toString("utf8")
    .trim();
  const latestAfter = b.artifactBytes
    .get("latest_after")!
    .toString("utf8")
    .trim();
  const rc20Before = artifactHash(a, "rc20_manifest_before");
  const rc20After = artifactHash(b, "rc20_manifest_after");
  const findingHashes = [
    artifactHash(a, "warning_finding_identities"),
    artifactHash(a, "enforcement_finding_identities"),
    artifactHash(b, "warning_finding_identities"),
    artifactHash(b, "enforcement_finding_identities"),
  ];
  const materializationHashes = [
    artifactHash(a, "materialization"),
    artifactHash(b, "materialization"),
  ];
  const sqliteHashes = [
    artifactHash(a, "sqlite"),
    artifactHash(b, "sqlite"),
  ];
  const releaseHashes = [
    artifactHash(a, "release"),
    artifactHash(b, "release"),
  ];
  const commandResults = REQUIRED_COMMAND_IDS.map((commandId) => {
    const resultA = a.manifest.command_results.find(
      (result) => result.command_id === commandId,
    )!;
    const resultB = b.manifest.command_results.find(
      (result) => result.command_id === commandId,
    )!;
    return {
      command_id: commandId,
      command: resultA.command,
      exit_code:
        resultA.exit_code === 0 && resultB.exit_code === 0 ? 0 : 1,
      output_sha256: stableHash({
        run_a: resultA.output.sha256,
        run_b: resultB.output.sha256,
      }),
      run_a_output_sha256: resultA.output.sha256,
      run_b_output_sha256: resultB.output.sha256,
    };
  });
  const immutableWithinSnapshots = [a, b].every((snapshot) =>
    snapshot.artifactBytes.get("latest_before")!.equals(
      snapshot.artifactBytes.get("latest_after")!,
    ) &&
    snapshot.artifactBytes.get("rc20_manifest_before")!.equals(
      snapshot.artifactBytes.get("rc20_manifest_after")!,
    ) &&
    snapshot.artifactBytes.get("tracker_state_before")!.equals(
      snapshot.artifactBytes.get("tracker_state_after")!,
    )
  );
  const allEqual = (values: readonly string[]) =>
    new Set(values).size === 1;
  const failedCommandCount = commandResults.filter(
    (result) => result.exit_code !== 0,
  ).length;
  const violationCount = [
    latestBefore !== "v1-rc5",
    latestAfter !== "v1-rc5",
    rc20Before !== RC20_MANIFEST_SHA256,
    rc20After !== RC20_MANIFEST_SHA256,
    !immutableWithinSnapshots,
    a.manifest.tracker_mutation_count !== 0,
    b.manifest.tracker_mutation_count !== 0,
    a.manifest.git_head !== b.manifest.git_head,
    artifactHash(a, "repository_state_after") !==
      artifactHash(b, "repository_state_after"),
    artifactHash(a, "generator_source") !==
      artifactHash(b, "generator_source"),
    artifactHash(a, "command_spec") !==
      artifactHash(b, "command_spec"),
    artifactHash(a, "tracker_state_after") !==
      artifactHash(b, "tracker_state_after"),
    a.manifest.release_id !== b.manifest.release_id,
    !allEqual(findingHashes),
    !allEqual(materializationHashes),
    !allEqual(sqliteHashes),
    !allEqual(releaseHashes),
    failedCommandCount !== 0,
  ].filter(Boolean).length;
  assert(
    violationCount === 0,
    `Determinism snapshots do not prove a zero-violation independent replay (${violationCount} violation class(es))`,
  );
  return {
    schema_version: 1,
    proof_id:
      "relationship-integrity-determinism-consumer-proof-v1",
    contract_id: RELATIONSHIP_CONTRACT_ID,
    input_snapshots: [
      {
        snapshot_id: a.manifest.snapshot_id,
        captured_at: a.manifest.captured_at,
        manifest_sha256: a.manifestSha256,
      },
      {
        snapshot_id: b.manifest.snapshot_id,
        captured_at: b.manifest.captured_at,
        manifest_sha256: b.manifestSha256,
      },
    ],
    git_head: a.manifest.git_head,
    release_id: a.manifest.release_id,
    repository_state_hashes: [
      artifactHash(a, "repository_state_after"),
      artifactHash(b, "repository_state_after"),
    ],
    generator_source_sha256: artifactHash(a, "generator_source"),
    command_spec_sha256: artifactHash(a, "command_spec"),
    latest_before: latestBefore,
    latest_after: latestAfter,
    rc20_manifest_sha256_before: rc20Before,
    rc20_manifest_sha256_after: rc20After,
    tracker_state_hashes: [
      artifactHash(a, "tracker_state_after"),
      artifactHash(b, "tracker_state_after"),
    ],
    tracker_mutation_count: 0,
    tracker_compatibility_status: trackerCompatibilityStatus,
    tracker_replay_status: trackerReplayStatus,
    tracker_replay_attempted: false,
    tracker_write_command_count: 0,
    tracker_importer_source: {
      path: TRACKER_IMPORTER_SOURCE_PATH,
      sha256: object(
        (a.trackerState.accessed_files as unknown[])[0],
        "Tracker importer source pin",
      ).sha256,
    },
    tracker_release_contract_versions: releaseContractVersions,
    tracker_supported_contract_versions: trackerImporterSupportA,
    tracker_unsupported_version_pairs: unsupportedVersionPairs,
    warning_enforcement_finding_identity_match: true,
    canonical_record_count: a.sqlite.record_identities.length,
    canonical_relation_count: a.sqlite.relation_ids.length,
    graph_finding_identity_count:
      a.sqlite.finding_identities.length,
    materialization_hashes: materializationHashes,
    sqlite_hashes: sqliteHashes,
    release_hashes: releaseHashes,
    command_results: commandResults,
    failed_command_count: failedCommandCount,
    violation_count: violationCount,
  } as unknown as JsonObject;
}

function assertDerivedSourceShape(
  role: string,
  value: Record<string, unknown>,
): void {
  if (role === "linkage_materialization_summary") {
    assert(
      value.schema_version === 1 &&
        value.campaign_id ===
          "bus-lane-supported-linkage-materialization-v1" &&
        value.supported_candidate_count === 54 &&
        value.materialized_candidate_count === 54 &&
        value.unmaterialized_candidate_count === 0 &&
        value.materialized_relation_count === 54 &&
        value.endpoint_violation_count === 0 &&
        value.type_violation_count === 0 &&
        value.evidence_violation_count === 0 &&
        value.record_hash_violation_count === 0 &&
        value.materialization_status_violation_count === 0 &&
        value.reconciliation_identity_violation_count === 0 &&
        value.canonical_projection_violation_count === 0 &&
        value.violation_count === 0 &&
        value.record_hash_contract ===
          "sha256_raw_canonical_jsonl_line_without_newline" &&
        typeof value.canonical_relations_path === "string" &&
        typeof value.canonical_relations_sha256 === "string" &&
        /^[a-f0-9]{64}$/u.test(value.canonical_relations_sha256) &&
        typeof value.reconciliation_path === "string" &&
        typeof value.reconciliation_sha256 === "string" &&
        /^[a-f0-9]{64}$/u.test(value.reconciliation_sha256) &&
        typeof value.materialized_relation_ids_sha256 === "string" &&
        /^[a-f0-9]{64}$/u.test(
          value.materialized_relation_ids_sha256,
        ),
      "Derived linkage materialization summary is not exact, complete, and zero-violation",
    );
  } else if (role === "sql_integrity_summary") {
    assert(
      value.schema_version === 1 &&
        value.summary_id === "relationship-integrity-sql-v1" &&
        value.contract_id === RELATIONSHIP_CONTRACT_ID &&
        value.repository_sql_finding_identity_match === true &&
        value.repository_sql_finding_code_counts_match === true &&
        value.graph_summary_finding_counts_match === true &&
        value.graph_enforcement_eligible_finding_count === 0 &&
        value.graph_manifest_path === GRAPH_MANIFEST_PATH &&
        typeof value.graph_manifest_sha256 === "string" &&
        /^[a-f0-9]{64}$/u.test(value.graph_manifest_sha256) &&
        value.graph_summary_path === GRAPH_SUMMARY_PATH &&
        typeof value.graph_summary_sha256 === "string" &&
        /^[a-f0-9]{64}$/u.test(value.graph_summary_sha256) &&
        value.graph_findings_path === GRAPH_FINDINGS_PATH &&
        typeof value.graph_findings_sha256 === "string" &&
        /^[a-f0-9]{64}$/u.test(value.graph_findings_sha256) &&
        value.repository_finding_count === value.sql_finding_count &&
        value.normalized_payload_parity === true &&
        value.normalized_evidence_parity === true &&
        value.readonly_sealed === true &&
        value.foreign_key_violation_count === 0 &&
        value.endpoint_violation_count === 0 &&
        value.type_violation_count === 0 &&
        value.evidence_violation_count === 0 &&
        value.completeness_selector_violation_count === 0 &&
        value.waiver_scope_violation_count === 0 &&
        value.required_selector_set_match === true &&
        value.hard_mode_ready === true &&
        value.violation_count === 0,
      "Derived SQL integrity summary is not sealed, parity-exact, selector-complete, and zero-violation",
    );
  } else if (role === "determinism_consumer_summary") {
    const compatibility = value.tracker_compatibility_status;
    const replay = value.tracker_replay_status;
    const snapshots = Array.isArray(value.input_snapshots)
      ? value.input_snapshots.map((entry) =>
          object(entry, "determinism input snapshot"),
        )
      : [];
    const trackerHashes = Array.isArray(value.tracker_state_hashes)
      ? value.tracker_state_hashes
      : [];
    const repositoryHashes = Array.isArray(
        value.repository_state_hashes,
      )
      ? value.repository_state_hashes
      : [];
    const importerSource = object(
      value.tracker_importer_source,
      "Tracker importer source",
    );
    const releaseVersions = object(
      value.tracker_release_contract_versions,
      "Tracker release contract versions",
    );
    const supportedVersions = object(
      value.tracker_supported_contract_versions,
      "Tracker supported contract versions",
    );
    const unsupportedPairs = Array.isArray(
        value.tracker_unsupported_version_pairs,
      )
      ? value.tracker_unsupported_version_pairs
      : [];
    assert(
      snapshots.length === 2 &&
        new Set(
          snapshots.map((snapshot) => snapshot.snapshot_id),
        ).size === 2 &&
        new Set(
          snapshots.map((snapshot) => snapshot.captured_at),
        ).size === 2 &&
        snapshots.every(
          (snapshot) =>
            typeof snapshot.snapshot_id === "string" &&
            typeof snapshot.captured_at === "string" &&
            typeof snapshot.manifest_sha256 === "string" &&
            /^[a-f0-9]{64}$/u.test(
              snapshot.manifest_sha256,
            ),
        ) &&
        trackerHashes.length === 2 &&
        trackerHashes[0] === trackerHashes[1] &&
        trackerHashes.every(
          (hash) =>
            typeof hash === "string" &&
            /^[a-f0-9]{64}$/u.test(hash),
        ) &&
        repositoryHashes.length === 2 &&
        repositoryHashes[0] === repositoryHashes[1] &&
        repositoryHashes.every(
          (hash) =>
            typeof hash === "string" &&
            /^[a-f0-9]{64}$/u.test(hash),
        ) &&
        typeof value.generator_source_sha256 === "string" &&
        /^[a-f0-9]{64}$/u.test(value.generator_source_sha256) &&
        typeof value.command_spec_sha256 === "string" &&
        /^[a-f0-9]{64}$/u.test(value.command_spec_sha256) &&
        compatibility ===
          "incompatible_operational_occurrence_schema_v2" &&
        replay === "not_run_incompatible_schema_v2" &&
        value.tracker_replay_attempted === false &&
        value.tracker_write_command_count === 0 &&
        importerSource.path === TRACKER_IMPORTER_SOURCE_PATH &&
        typeof importerSource.sha256 === "string" &&
        /^[a-f0-9]{64}$/u.test(importerSource.sha256) &&
        releaseVersions.manifest_version === 3 &&
        releaseVersions.operational_anchors === 1 &&
        releaseVersions.operational_anchor_review_decisions === 1 &&
        releaseVersions.operational_occurrences === 2 &&
        releaseVersions.operational_occurrence_review_decisions === 1 &&
        supportedVersions.manifest_version === 3 &&
        supportedVersions.operational_anchors === 1 &&
        supportedVersions.operational_anchor_review_decisions === 1 &&
        supportedVersions.operational_occurrences === 1 &&
        supportedVersions.operational_occurrence_review_decisions === 1 &&
        stableJson(unsupportedPairs as unknown as JsonValue) ===
          stableJson([{
            contract: "operational_occurrences",
            release_version: 2,
            supported_version: 1,
          }] as unknown as JsonValue) &&
        typeof value.canonical_record_count === "number" &&
        Number.isInteger(value.canonical_record_count) &&
        value.canonical_record_count >= 0 &&
        typeof value.canonical_relation_count === "number" &&
        Number.isInteger(value.canonical_relation_count) &&
        value.canonical_relation_count >= 0 &&
        typeof value.graph_finding_identity_count === "number" &&
        Number.isInteger(value.graph_finding_identity_count) &&
        value.graph_finding_identity_count >= 0,
      "Determinism/consumer proof must record an exact compatible replay or the reviewed schema-v2 incompatibility",
    );
  }
}

export function buildRelationshipEnforcementOutputs(input: {
  contract: RelationshipContract;
  matrix: RelationshipFinalEndpointMatrix;
  sourceTexts: ReadonlyMap<string, string>;
  proofStage?: "pre_promotion_warning" | "post_promotion_enforced";
  previousProof?: RelationshipEnforcementProofReference;
  transitionReceipt?:
    RelationshipEnforcementTransitionReceiptReference;
}): BuiltEnforcementOutputs {
  const { contract, matrix, sourceTexts } = input;
  const proofStage =
    input.proofStage ??
    (contract.contract_status === "warning_first"
      ? "pre_promotion_warning"
      : "post_promotion_enforced");
  const validationMode =
    proofStage === "pre_promotion_warning" ? "warn" : "enforce";
  assertRelationshipContractPolicyV1(contract);
  assertRelationshipFinalEndpointMatrix(matrix);
  assert(
    contract.endpoint_matrix.matrix_kind ===
      "post_remediation_reviewed" &&
      contract.endpoint_matrix.sha256 ===
        stableHash(matrix as unknown as JsonValue) &&
      contract.endpoint_matrix.relation_count ===
        matrix.covered_relation_count &&
      contract.endpoint_matrix.tuple_count ===
        matrix.allowed_family_shape_count &&
      contract.endpoint_matrix.relation_ids_sha256 ===
        matrix.relation_ids_sha256 &&
      contract.endpoint_matrix.tuple_set_sha256 ===
        matrix.tuple_set_sha256,
    "Relationship enforcement proof requires the exact installed post-remediation matrix pointer",
  );
  assert(
    (proofStage === "pre_promotion_warning" &&
      contract.contract_status === "warning_first" &&
      input.previousProof === undefined &&
      input.transitionReceipt === undefined) ||
      (proofStage === "post_promotion_enforced" &&
        contract.contract_status === "enforced" &&
        (contract.enforcement_state ===
          "enforced_refresh_required" ||
          contract.enforcement_state === "enforced_ready") &&
        input.previousProof?.proof_stage ===
          "pre_promotion_warning" &&
        input.transitionReceipt !== undefined),
    "Relationship enforcement proof stage does not match the contract transition state and proof chain",
  );
  const graphManifestSource =
    RELATIONSHIP_ENFORCEMENT_GATE_SOURCES
      .referential_type_evidence_integrity.find(
        (source) => source.role === "graph_audit_manifest",
      )!;
  const sqlIntegritySource =
    RELATIONSHIP_ENFORCEMENT_GATE_SOURCES
      .referential_type_evidence_integrity.find(
        (source) => source.role === "sql_integrity_summary",
      )!;
  const graphManifest = object(
    parseJson<unknown>(
      sourceTexts.get(graphManifestSource.path) ?? "",
      graphManifestSource.path,
    ),
    "relationship enforcement graph manifest",
  );
  const sqlIntegrity = object(
    parseJson<unknown>(
      sourceTexts.get(sqlIntegritySource.path) ?? "",
      sqlIntegritySource.path,
    ),
    "relationship enforcement SQL summary",
  );
  assert(
    graphManifest.mode === validationMode &&
      sqlIntegrity.enforcement_mode ===
        (validationMode === "warn" ? "warning" : "enforce"),
    `Relationship enforcement ${proofStage} proof requires matching graph and SQL validation modes`,
  );

  const contents = new Map<string, string>();
  const gates: RelationshipEnforcementProof["gates"] = [];
  for (const gateId of RELATIONSHIP_ENFORCEMENT_GATE_IDS) {
    const sources = RELATIONSHIP_ENFORCEMENT_GATE_SOURCES[gateId]!
      .map((source) => {
        const text = sourceTexts.get(source.path);
        assert(
          text !== undefined,
          `Relationship enforcement source is missing from the build: ${source.role}/${source.path}`,
        );
        if (source.role === "graph_audit_findings") {
          parseJsonl<unknown>(text, source.path).forEach(
            (row, index) =>
              object(
                row,
                `relationship enforcement source ${source.role} row ${index + 1}`,
              ),
          );
        } else {
          const parsed = object(
            parseJson<unknown>(text, source.path),
            `relationship enforcement source ${source.role}`,
          );
          assertDerivedSourceShape(source.role, parsed);
        }
        return {
          role: source.role,
          path: source.path,
          sha256: sha256(text),
        };
      })
      .sort((left, right) =>
        left.role.localeCompare(right.role) ||
        left.path.localeCompare(right.path)
      );
    const artifact: RelationshipEnforcementGateArtifact = {
      schema_version: 1,
      artifact_id: `relationship-contract-v1-enforcement-gate:${gateId}`,
      contract_id: RELATIONSHIP_CONTRACT_ID,
      gate_id: gateId,
      reviewed_at: contract.reviewed_at,
      reviewed_by: contract.reviewed_by,
      source_count: sources.length,
      source_artifacts: sources,
      derived_violation_count: 0,
    };
    const artifactPath = `${GATE_ROOT}/${gateId}.json`;
    const artifactText = json(
      artifact as unknown as JsonValue,
    );
    contents.set(artifactPath, artifactText);
    gates.push({
      gate_id: gateId,
      status: "ready",
      violation_count: 0,
      artifact_path: artifactPath,
      artifact_sha256: sha256(artifactText),
      criteria: [...GATE_CRITERIA[gateId]!],
    });
  }

  const proof: RelationshipEnforcementProof = {
    schema_version: RELATIONSHIP_ENFORCEMENT_PROOF_SCHEMA_VERSION,
    proof_id: "relationship-contract-v1-enforcement-proof",
    contract_id: RELATIONSHIP_CONTRACT_ID,
    proof_status: "ready",
    proof_stage: proofStage,
    validation_mode: validationMode,
    reviewed_at: contract.reviewed_at,
    reviewed_by: contract.reviewed_by,
    ...(input.previousProof
      ? { previous_proof: input.previousProof }
      : {}),
    ...(input.transitionReceipt
      ? { transition_receipt: input.transitionReceipt }
      : {}),
    final_matrix: {
      path: contract.endpoint_matrix.path,
      sha256: contract.endpoint_matrix.sha256,
      relation_count: matrix.covered_relation_count,
      tuple_count: matrix.allowed_family_shape_count,
      relation_ids_sha256: matrix.relation_ids_sha256,
      tuple_set_sha256: matrix.tuple_set_sha256,
    },
    gate_count: RELATIONSHIP_ENFORCEMENT_GATE_IDS.length,
    all_gates_ready: true,
    total_violation_count: 0,
    gates,
  };
  const proofText = json(proof as unknown as JsonValue);
  contents.set(PROOF_PATH, proofText);

  const validation = assertRelationshipEnforcementProof(
    proof,
    matrix,
    contract.endpoint_matrix,
    RELATIONSHIP_ENFORCEMENT_GATE_IDS,
    (path: string) => {
      const generated = contents.get(path);
      if (generated !== undefined) return generated;
      const source = sourceTexts.get(path);
      if (source !== undefined) return source;
      throw new Error(
        `Unpinned enforcement artifact requested during validation: ${path}`,
      );
    },
  );
  return {
    contents,
    proof,
    proofArtifactPaths: validation.artifact_paths,
  };
}

export function assertRelationshipEnforcementRefreshPins(input: {
  receipt: RelationshipEnforcementTransitionReceipt;
  sourceTexts: ReadonlyMap<string, string>;
  invariantSha256ByRole: ReadonlyMap<string, string>;
  canonicalDbSha256: string;
}): void {
  const {
    receipt,
    sourceTexts,
    invariantSha256ByRole,
    canonicalDbSha256,
  } = input;
  for (const pin of receipt.invariant_artifacts) {
    assert(
      invariantSha256ByRole.get(pin.role) === pin.sha256,
      `Relationship enforcement refresh changed immutable corpus/release/matrix/determinism artifact: ${pin.role}`,
    );
  }
  const canonicalDbPin = receipt.refresh_artifacts.find(
    (pin) => pin.role === "canonical_db",
  );
  assert(
    canonicalDbPin !== undefined &&
      canonicalDbSha256 !== canonicalDbPin.sha256,
    "Post-promotion refresh did not rebuild the canonical DB into enforce mode",
  );
  const refreshRoles = new Set<string>(
    RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES,
  );
  for (const pin of receipt.pre_promotion_sources) {
    const text = sourceTexts.get(pin.path);
    assert(
      text !== undefined,
      `Relationship enforcement refresh source is missing: ${pin.role}/${pin.path}`,
    );
    if (refreshRoles.has(pin.role)) {
      assert(
        pin.transition_fingerprint !== undefined &&
          relationshipEnforcementTransitionFingerprint(
            pin.role,
            text,
          ) === pin.transition_fingerprint,
        `Relationship enforcement refresh changed non-mode source content: ${pin.role}`,
      );
    } else {
      assert(
        sha256(text) === pin.sha256,
        `Relationship enforcement refresh changed forbidden source artifact: ${pin.role}`,
      );
    }
  }
}

function assertPostPromotionRefreshDrift(
  root: string,
  contract: RelationshipContract,
  matrix: RelationshipFinalEndpointMatrix,
  receipt: RelationshipEnforcementTransitionReceipt,
  sourceTexts: ReadonlyMap<string, string>,
): void {
  assertRelationshipEnforcementTransitionReceipt(
    receipt,
    matrix,
    contract.endpoint_matrix,
    (path) => readRepositoryText(root, path),
  );
  const invariantSha256ByRole = new Map<string, string>();
  let canonicalDbSha256 = "";
  const expectedInvariantPath = new Map<string, string>([
    ["canonical_relations", CANONICAL_RELATIONS_PATH],
    ["determinism_consumer_summary", DETERMINISM_CONSUMER_SUMMARY_PATH],
    ["final_endpoint_matrix", contract.endpoint_matrix.path],
    ["reviewed_release_manifest", REVIEWED_RELEASE_MANIFEST_PATH],
  ]);
  for (const pin of receipt.invariant_artifacts) {
    assert(
      expectedInvariantPath.get(pin.role) === pin.path,
      `Relationship enforcement transition invariant path drifted: ${pin.role}`,
    );
    const actual =
      pin.role === "final_endpoint_matrix"
        ? stableHash(matrix as unknown as JsonValue)
        : sha256(readRepositoryText(root, pin.path));
    invariantSha256ByRole.set(pin.role, actual);
  }
  const expectedRefreshPath = new Map<string, string>([
    ["canonical_db", CANONICAL_DB_PATH],
    ...Object.values(RELATIONSHIP_ENFORCEMENT_GATE_SOURCES)
      .flat()
      .filter((source) =>
        (RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES as readonly string[])
          .includes(source.role)
      )
      .map((source) => [source.role, source.path] as const),
  ]);
  for (const pin of receipt.refresh_artifacts) {
    assert(
      expectedRefreshPath.get(pin.role) === pin.path,
      `Relationship enforcement transition refresh path drifted: ${pin.role}`,
    );
    if (pin.role === "canonical_db") {
      canonicalDbSha256 = byteSha256(
        readRepositoryBytes(root, pin.path),
      );
      continue;
    }
    const text = sourceTexts.get(pin.path);
    assert(text !== undefined, `Missing refreshed source ${pin.role}`);
    assert(
      relationshipEnforcementTransitionFingerprint(pin.role, text) ===
        pin.transition_fingerprint,
      `Relationship enforcement refresh changed non-mode content in ${pin.role}`,
    );
  }
  assertRelationshipEnforcementRefreshPins({
    receipt,
    sourceTexts,
    invariantSha256ByRole,
    canonicalDbSha256,
  });
}

function desiredProofContract(
  contract: RelationshipContract,
  proof: RelationshipEnforcementProof,
): RelationshipContract {
  const pointer = {
    path: PROOF_PATH,
    sha256: stableHash(proof as unknown as JsonValue),
    required_gate_ids: [...RELATIONSHIP_ENFORCEMENT_GATE_IDS],
    ...(contract.enforcement_proof?.transition_receipt
      ? {
          transition_receipt:
            contract.enforcement_proof.transition_receipt,
        }
      : {}),
  };
  if (proof.proof_stage === "pre_promotion_warning") {
    return {
      ...contract,
      contract_status: "warning_first",
      enforcement_state: "warning_ready",
      enforcement_proof: pointer,
    };
  }
  return {
    ...contract,
    contract_status: "enforced",
    enforcement_state: "enforced_ready",
    enforcement_proof: pointer,
  };
}

function compareOrWrite(
  root: string,
  path: string,
  content: string,
  mode: "check" | "apply",
): void {
  const absolute = repositoryPath(root, path);
  if (mode === "check") {
    assert(
      existsSync(absolute),
      `Generated relationship enforcement artifact is missing: ${path}; run --apply --reviewed-enforcement`,
    );
    assert(
      readRepositoryText(root, path) === content,
      `Generated relationship enforcement artifact is stale: ${path}; run --apply --reviewed-enforcement`,
    );
    return;
  }
  if (existsSync(absolute)) {
    const stat = lstatSync(absolute);
    assert(
      stat.isFile() && !stat.isSymbolicLink(),
      `Refusing to replace non-regular enforcement artifact: ${path}`,
    );
  }
  mkdirSync(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp-${process.pid}`;
  rmSync(temporary, { force: true });
  writeFileSync(temporary, content, "utf8");
  renameSync(temporary, absolute);
}

export function generateRelationshipEnforcementProofV1(
  mode: "check" | "apply",
  root = repoRoot,
): BuiltEnforcementOutputs {
  const contractText = readRepositoryText(root, CONTRACT_PATH);
  const contract = parseJson<RelationshipContract>(
    contractText,
    CONTRACT_PATH,
  );
  assertRelationshipContractPolicyV1(contract);
  const matrixText = readRepositoryText(
    root,
    contract.endpoint_matrix.path,
  );
  const matrix = parseJson<RelationshipFinalEndpointMatrix>(
    matrixText,
    contract.endpoint_matrix.path,
  );
  assertRelationshipFinalEndpointMatrix(matrix);
  let transitionReceipt:
    | RelationshipEnforcementTransitionReceipt
    | undefined;
  let transitionReceiptReference:
    | RelationshipEnforcementTransitionReceiptReference
    | undefined;
  let previousProofReference:
    | RelationshipEnforcementProofReference
    | undefined;
  if (contract.contract_status === "enforced") {
    transitionReceiptReference =
      contract.enforcement_proof?.transition_receipt;
    assert(
      transitionReceiptReference !== undefined,
      "Enforced proof refresh requires a content-addressed transition receipt",
    );
    transitionReceipt = parseJson<RelationshipEnforcementTransitionReceipt>(
      readRepositoryText(root, transitionReceiptReference.path),
      transitionReceiptReference.path,
    );
    assert(
      stableHash(transitionReceipt as unknown as JsonValue) ===
        transitionReceiptReference.sha256,
      "Relationship enforcement transition receipt hash does not match the contract pointer",
    );
    previousProofReference = transitionReceipt.previous_proof;
  }

  const databasePath = repositoryPath(root, CANONICAL_DB_PATH);
  const db = openCanonicalDb(databasePath, { readonly: true });
  let linkageMaterialization: JsonObject;
  let sqlIntegrity: JsonObject;
  try {
    linkageMaterialization = deriveLinkageMaterializationSummary(
      root,
      db,
    );
    sqlIntegrity = deriveSqlIntegritySummary(root, db);
  } finally {
    db.close();
  }
  assertPhysicalityAndPhasePins(root);

  const generatedSources = new Map<string, string>([
    [
      LINKAGE_MATERIALIZATION_SUMMARY_PATH,
      json(linkageMaterialization),
    ],
    [SQL_INTEGRITY_SUMMARY_PATH, json(sqlIntegrity)],
  ]);
  const sourceTexts = new Map<string, string>();
  for (const sources of Object.values(
    RELATIONSHIP_ENFORCEMENT_GATE_SOURCES,
  )) {
    for (const source of sources) {
      sourceTexts.set(
        source.path,
        generatedSources.get(source.path) ??
          readRepositoryText(root, source.path),
      );
    }
  }
  if (transitionReceipt) {
    assertPostPromotionRefreshDrift(
      root,
      contract,
      matrix,
      transitionReceipt,
      sourceTexts,
    );
  }

  // Building and validating is deliberately complete before the first write.
  // A stale source, nonzero derived diagnostic, or arbitrary ready flag therefore
  // cannot leave a partial proof tree behind.
  const built = buildRelationshipEnforcementOutputs({
    contract,
    matrix,
    sourceTexts,
    proofStage:
      contract.contract_status === "warning_first"
        ? "pre_promotion_warning"
        : "post_promotion_enforced",
    previousProof: previousProofReference,
    transitionReceipt: transitionReceiptReference,
  });
  const desiredContract = desiredProofContract(
    contract,
    built.proof,
  );
  assertRelationshipContractPolicyV1(desiredContract);
  const allContents = new Map<string, string>([
    ...generatedSources,
    ...built.contents,
    [CONTRACT_PATH, json(desiredContract as unknown as JsonValue)],
  ]);
  for (const [path, content] of [...allContents].sort(
    ([left], [right]) =>
      Number(left === CONTRACT_PATH) - Number(right === CONTRACT_PATH) ||
      left.localeCompare(right),
  )) {
    compareOrWrite(root, path, content, mode);
  }
  return {
    ...built,
    contents: allContents,
  };
}

function optionValue(
  args: readonly string[],
  name: string,
): string | undefined {
  const indexes = args
    .map((arg, index) => (arg === name ? index : -1))
    .filter((index) => index >= 0);
  assert(indexes.length <= 1, `Option may appear only once: ${name}`);
  if (indexes.length === 0) return undefined;
  const value = args[indexes[0]! + 1];
  assert(
    value !== undefined && !value.startsWith("--"),
    `${name} requires a value`,
  );
  return value;
}

function assertKnownArguments(
  args: readonly string[],
  valueOptions: readonly string[],
  flags: readonly string[],
): void {
  const allowedFlags = new Set(flags);
  const allowedValues = new Set(valueOptions);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (allowedFlags.has(arg)) continue;
    if (allowedValues.has(arg)) {
      assert(args[index + 1] !== undefined, `${arg} requires a value`);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const capturePath = optionValue(args, "--capture-snapshot");
  const captureReleaseRoot = optionValue(
    args,
    "--capture-release-export",
  );
  const releaseId = optionValue(args, "--release-id");
  const deriveDeterminism = args.includes(
    "--derive-determinism-consumer",
  );
  const apply = args.includes("--apply");
  const check = args.includes("--check");
  const reviewedEnforcement = args.includes(
    "--reviewed-enforcement",
  );
  const refreshAfterPromotion = args.includes(
    "--refresh-after-promotion",
  );

  if (capturePath !== undefined) {
    assertKnownArguments(
      args,
      ["--capture-snapshot", "--release-id"],
      [],
    );
    assert(releaseId !== undefined, "--capture-snapshot requires --release-id");
    const snapshot = captureDeterminismSnapshot(
      capturePath,
      releaseId,
    );
    console.log(
      JSON.stringify(
        {
          snapshot_path: resolve(capturePath),
          snapshot_id: snapshot.snapshot_id,
          command_count: snapshot.command_results.length,
          failed_command_count: snapshot.command_results.filter(
            (result) => result.exit_code !== 0,
          ).length,
          tracker_mutation_count: snapshot.tracker_mutation_count,
        },
        null,
        2,
      ),
    );
  } else if (captureReleaseRoot !== undefined) {
    assertKnownArguments(
      args,
      ["--capture-release-export", "--release-id"],
      [],
    );
    assert(
      releaseId !== undefined,
      "--capture-release-export requires --release-id",
    );
    const manifestPath = exportSnapshotRelease(
      resolve(captureReleaseRoot),
      releaseId,
    );
    console.log(
      JSON.stringify({ manifest_path: manifestPath }),
    );
  } else if (deriveDeterminism) {
    assertKnownArguments(
      args,
      ["--snapshot-a", "--snapshot-b"],
      [
        "--derive-determinism-consumer",
        "--apply",
        "--check",
        "--reviewed-enforcement",
      ],
    );
    const snapshotA = optionValue(args, "--snapshot-a");
    const snapshotB = optionValue(args, "--snapshot-b");
    assert(snapshotA && snapshotB, "Both --snapshot-a and --snapshot-b are required");
    assert(
      Number(apply) + Number(check) === 1,
      "Choose exactly one of --check or --apply",
    );
    assert(
      !apply || reviewedEnforcement,
      "Writing the determinism consumer proof requires --reviewed-enforcement",
    );
    assert(
      !check || !reviewedEnforcement,
      "--reviewed-enforcement is only valid with --apply",
    );
    const summary = deriveDeterminismConsumerSummary(
      snapshotA,
      snapshotB,
    );
    const content = json(summary);
    compareOrWrite(
      repoRoot,
      DETERMINISM_CONSUMER_SUMMARY_PATH,
      content,
      apply ? "apply" : "check",
    );
    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "check",
          summary_path: DETERMINISM_CONSUMER_SUMMARY_PATH,
          summary_sha256: sha256(content),
          snapshot_count: 2,
        },
        null,
        2,
      ),
    );
  } else {
    assertKnownArguments(
      args,
      [],
      [
        "--apply",
        "--check",
        "--reviewed-enforcement",
        "--refresh-after-promotion",
      ],
    );
    assert(
      Number(apply) + Number(check) === 1,
      "Choose exactly one of --check or --apply",
    );
    assert(
      !apply || reviewedEnforcement,
      "Writing ready enforcement artifacts requires --reviewed-enforcement",
    );
    assert(
      !check || !reviewedEnforcement,
      "--reviewed-enforcement is only valid with --apply",
    );
    const currentContract = parseJson<RelationshipContract>(
      readRepositoryText(repoRoot, CONTRACT_PATH),
      CONTRACT_PATH,
    );
    assert(
      refreshAfterPromotion ===
        (currentContract.contract_status === "enforced"),
      currentContract.contract_status === "enforced"
        ? "Post-promotion proof generation requires --refresh-after-promotion"
        : "--refresh-after-promotion is valid only for an enforced contract",
    );
    const built = generateRelationshipEnforcementProofV1(
      apply ? "apply" : "check",
    );
    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "check",
          proof_stage: built.proof.proof_stage,
          enforcement_state:
            built.proof.proof_stage === "post_promotion_enforced"
              ? "enforced_ready"
              : "warning_ready",
          proof_path: PROOF_PATH,
          proof_sha256: stableHash(
            built.proof as unknown as JsonValue,
          ),
          gate_count: built.proof.gate_count,
          pinned_artifact_count: built.proofArtifactPaths.length,
          generated_artifact_count: built.contents.size,
        },
        null,
        2,
      ),
    );
  }
}
