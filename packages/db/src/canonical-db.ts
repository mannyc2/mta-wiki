// Canonical SQLite materialization (docs/sqlite-migration-plan.md).
//
// The DB is a *rebuilt materialization* of the canonical records — never a second source of
// truth. materializeWiki() writes it in addition to the JSONL files; it can be rebuilt from
// scratch at any time and a rebuild is row-identical. Nothing here ever mutates an existing DB
// in place or deletes any JSONL: rebuildCanonicalDb builds into a temp file and atomically
// renames it over the target, so a failed build leaves the previous DB (and all JSONL) intact.
//
// All JSON columns use the stable-JSON encoder so two rebuilds hash-equal (the determinism gate).

/// <reference path="./bun-sqlite.d.ts" />
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { asc, eq } from "drizzle-orm";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { readIdentityDoNotMergeOverrides, readIdentityOverrides } from "./identity.js";
import { loadRelationshipContract } from "./relationship-contract.js";
import {
  RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID,
  RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR,
} from "./relationship-completeness-contract.js";
import {
  projectPromotedRow,
  promotedColumnsFromTable,
  promotedTableName,
  validatePromotedRow,
} from "./record-columns.js";
import { records as recordsTable } from "./schema.js";
import { SCHEMA_DDL } from "./schema-ddl.js";
import { ftsTableNames } from "./schema-ddl.js";
import { populateFts } from "./fts.js";
import { loadGtfsRefTables } from "./import-gtfs.js";
import { loadSelectedGtfsSnapshotTables } from "./gtfs-snapshot-db.js";
import { validateRow } from "./schema-validators.js";
import { sha256, stableJson } from "./stable-json.js";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaEvidenceRef, MtaSubmissionEntry } from "./types.js";

/** Bump whenever the generated DDL changes (column promotion, new kind, new table). Readers
 *  fail loudly on a mismatch instead of misreading an old layout.
 *  v2 (S2.1): relations assertion qualifiers, source/event/metric_claim companions, ref_* registries.
 *  v3 (v1 Plan 006): project date_normalized/date_precision/date_source_field promoted columns.
 *  v4 (plan 016): relation_family CHECK constraint (DDL-only; row content unchanged).
 *  v5 (relationship-contract-v1): exact endpoint rules, canonical identity registry, promoted
 *  evidence identity/hash columns, typed/evidence triggers, and diagnostic views.
 *  v6 (relationship-completeness-v1): immutable disposition/evidence mirrors, normalized
 *  selector/role/finding ledgers, SQL diagnostics, and a criteria-gated enforcement trigger.
 *  v7 (relationship-evidence-registry-v1): normalized content-addressed evidence registry,
 *  exact evidence-ref matching, readonly-by-default opens, and a one-way post-build seal.
 *  v8 (relationship-enforcement-hardening-v1): exact role-scoped completeness waivers,
 *  exact selector eligibility in enforce mode, and payload/normalized-column parity guards.
 *  v9 (gtfs-route-reference-snapshot-v2): verified exact route inventory/activity, point-in-time
 *  Current Bus Routes catalog, and typed catalog/GTFS disagreement mirrors. */
export const CANONICAL_DB_VERSION = 9;

const RELATION_PROVENANCE = ["authored", "derived", "canonicalizer"] as const;
type RelationProvenance = (typeof RELATION_PROVENANCE)[number];

export type RebuildCanonicalDbResult = {
  path: string;
  recordCount: number;
  relationCount: number;
  /** Relation records whose endpoints could not be projected to the edge table (still fully
   *  preserved in records.payload). 0 on the current corpus. */
  skippedRelationEdges: number;
  /** Insert-boundary validator findings; rebuild throws before publishing if non-empty. */
  validatorIssues: string[];
};

export type CanonicalIdentitySupersession = {
  identity: string;
  canonicalRecordId: string;
};

export type CanonicalRelationshipFinding = {
  finding_id: string;
  contract_id: string;
  code: string;
  severity: "info" | "warning" | "error";
  record_id?: string | undefined;
  detail: string;
};

export type CanonicalRelationshipDispositionMirror = {
  decisionId: string;
  contractId: string;
  selector: string;
  recordId: string;
  recordKind: MtaCanonicalRecord["record_kind"];
  primaryDisposition: string;
  studyProjectable: boolean;
  waiver: boolean;
  reviewedAt: string;
  reviewedBy: string;
  reason: string;
  evidenceIds: string[];
  decisionJson: JsonValue;
};

export type CanonicalRelationshipCompletenessRoleMirror = {
  role: string;
  status: "satisfied" | "missing" | "not_applicable";
  bindingCount: number;
  recordIds: string[];
};

export type CanonicalRelationshipCompletenessSubjectMirror = {
  contractId: string;
  selector: string;
  subjectId: string;
  subjectKind: "operational_occurrence" | "treatment_component" | "event" | "route";
  canonicalRecordId: string | null;
  primaryDisposition: string;
  studyProjectable: boolean;
  warningCodes: string[];
  roles: CanonicalRelationshipCompletenessRoleMirror[];
  detailJson: JsonValue;
};

export type CanonicalRelationshipCompletenessFindingMirror = {
  findingId: string;
  contractId: string;
  code: string;
  severity: "warning" | "error";
  selector: string;
  subjectId: string;
  detailJson: JsonValue;
};

export type CanonicalRelationshipSelectorContractMirror = {
  contractId: string;
  selector: string;
  selectorClass: string;
  expectedCount: number;
  actualCount: number;
  enforcementEligible: boolean;
  promotionCriterion: string;
};

export type CanonicalRelationshipCompletenessMirror = {
  dispositions: CanonicalRelationshipDispositionMirror[];
  subjects: CanonicalRelationshipCompletenessSubjectMirror[];
  findings: CanonicalRelationshipCompletenessFindingMirror[];
  selectorContracts: CanonicalRelationshipSelectorContractMirror[];
  enforcement: {
    contractId: string;
    mode: "warning" | "enforce";
    hardModeReady: boolean;
    inputFingerprint: string;
    criteriaJson: JsonValue;
  };
};

export type CanonicalEvidenceBlockRegistryEntry = {
  source_id: string;
  block_id: string;
  resolved_block_id: string;
  page_number: number;
  source_path: string;
  raw_text_sha256: string;
};

export type CanonicalEvidenceRegistryInput = {
  /** Test fixtures are forbidden from publishing the repository's production canonical.db. */
  provenance: "authoritative" | "test_fixture";
  entries: readonly CanonicalEvidenceBlockRegistryEntry[];
};

export function canonicalDbPath(): string {
  return join(repoRoot, "data", "canonical.db");
}

/** Open an existing canonical DB for reading, setting the required pragmas and asserting the
 *  schema version. The single sanctioned open path — `foreign_keys` is per-connection and OFF by
 *  default, so one stray `new Database()` would silently skip every FK check (doc §7). */
export function openCanonicalDb(path: string = canonicalDbPath(), options: { readonly?: boolean; skipVersionCheck?: boolean } = {}): Database {
  const readonly = options.readonly ?? true;
  // bun:sqlite needs an explicit access flag; `{ create: false }` alone is SQLITE_MISUSE.
  const db = new Database(path, readonly ? { readonly: true } : { readwrite: true, create: false });
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");
  if (!readonly) {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
  }
  if (!options.skipVersionCheck) {
    const version = Number((db.query("PRAGMA user_version").get() as { user_version: number }).user_version);
    if (version !== CANONICAL_DB_VERSION) {
      db.close();
      throw new Error(`canonical.db schema version ${version} != ${CANONICAL_DB_VERSION}; re-run materialize`);
    }
    const state = db.query(
      "SELECT state_key, sealed FROM canonical_db_state WHERE state_key = 'canonical'",
    ).get() as { state_key: string; sealed: number } | null;
    if (!state || state.sealed !== 1) {
      db.close();
      throw new Error("canonical.db is not sealed; re-run materialize");
    }
  }
  return db;
}

function defaultEvidenceRegistryPath(): string {
  return join(repoRoot, "data", "evidence-block-index.jsonl");
}

function evidenceRegistryKey(sourceId: string, blockId: string): string {
  return `${sourceId}\u0000${blockId}`;
}

function validateEvidenceRegistryEntry(
  entry: CanonicalEvidenceBlockRegistryEntry,
  label: string,
): void {
  if (!entry || typeof entry !== "object") throw new Error(`${label} must be an object`);
  for (const field of ["source_id", "block_id", "resolved_block_id", "source_path", "raw_text_sha256"] as const) {
    if (typeof entry[field] !== "string" || entry[field].trim().length === 0) {
      throw new Error(`${label}.${field} must be a non-empty string`);
    }
  }
  if (!Number.isInteger(entry.page_number) || entry.page_number < 1) {
    throw new Error(`${label}.page_number must be a positive integer`);
  }
  const expectedPath = `raw/sources/${entry.source_id}/blocks.jsonl`;
  if (entry.source_path !== expectedPath) {
    throw new Error(`${label}.source_path must equal ${expectedPath}`);
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(entry.raw_text_sha256)) {
    throw new Error(`${label}.raw_text_sha256 must be a lowercase sha256 content address`);
  }
}

function readDefaultEvidenceRegistry(): CanonicalEvidenceRegistryInput {
  const path = defaultEvidenceRegistryPath();
  if (!existsSync(path)) {
    throw new Error(`canonical.db evidence registry is missing: ${path}`);
  }
  const entries: CanonicalEvidenceBlockRegistryEntry[] = [];
  for (const [index, line] of readFileSync(path, "utf8").split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    let entry: CanonicalEvidenceBlockRegistryEntry;
    try {
      entry = JSON.parse(line) as CanonicalEvidenceBlockRegistryEntry;
    } catch (error) {
      throw new Error(`Invalid evidence registry JSONL at ${path}:${index + 1}: ${String(error)}`);
    }
    validateEvidenceRegistryEntry(entry, `${path}:${index + 1}`);
    entries.push(entry);
  }
  return { provenance: "authoritative", entries };
}

function normalizeEvidenceRegistry(
  input: CanonicalEvidenceRegistryInput | undefined,
  targetPath: string,
): {
  entries: CanonicalEvidenceBlockRegistryEntry[];
  byKey: Map<string, CanonicalEvidenceBlockRegistryEntry>;
} {
  const resolvedInput = input ?? readDefaultEvidenceRegistry();
  if (resolvedInput.provenance === "test_fixture" && resolve(targetPath) === resolve(canonicalDbPath())) {
    throw new Error("test fixture evidence registry cannot publish the production canonical.db");
  }
  const entries = [...resolvedInput.entries].sort((left, right) =>
    left.source_id.localeCompare(right.source_id) ||
    left.block_id.localeCompare(right.block_id));
  const byKey = new Map<string, CanonicalEvidenceBlockRegistryEntry>();
  for (const [index, entry] of entries.entries()) {
    validateEvidenceRegistryEntry(entry, `evidenceRegistry.entries[${index}]`);
    const key = evidenceRegistryKey(entry.source_id, entry.block_id);
    if (byKey.has(key)) {
      throw new Error(`canonical.db evidence registry has duplicate identity ${entry.source_id}#${entry.block_id}`);
    }
    byKey.set(key, entry);
  }
  return { entries, byKey };
}

function classifyProvenance(record: MtaCanonicalRecord): RelationProvenance {
  const payload = record.payload;
  if (typeof payload.canonicalize_decision_id === "string" && payload.canonicalize_decision_id) return "canonicalizer";
  if (payload.derived_relation === true || (typeof payload.derivation_rule === "string" && payload.derivation_rule) || record.review_state === "derived") {
    return "derived";
  }
  return "authored";
}

function asString(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function uniqueSorted(values: Array<string | undefined> | undefined, fallback: string[]): string[] {
  const set = new Set<string>();
  for (const value of values ?? []) {
    if (typeof value === "string" && value.trim().length > 0) set.add(value);
  }
  if (set.size === 0) for (const value of fallback) set.add(value);
  return [...set].sort();
}

function dispositionAllowedMissingRoles(decisionJson: JsonValue): string[] {
  if (!decisionJson || typeof decisionJson !== "object" || Array.isArray(decisionJson)) return [];
  const value = decisionJson.required_roles_missing;
  if (!Array.isArray(value)) return [];
  return uniqueSorted(
    value.map((role) => typeof role === "string" ? role : undefined),
    [],
  );
}

/** Rebuild the canonical DB from records. Builds a temp file and atomically renames over the
 *  target; the previous DB and all JSONL stay untouched until the new build is fully valid. */
export function rebuildCanonicalDb(
  records: MtaCanonicalRecord[],
  options: {
    path?: string;
    submissions?: MtaSubmissionEntry[];
    identitySupersessions?: readonly CanonicalIdentitySupersession[];
    relationshipFindings?: readonly CanonicalRelationshipFinding[];
    relationshipCompleteness?: CanonicalRelationshipCompletenessMirror;
    /** Omit in production to load data/evidence-block-index.jsonl fail-closed. Synthetic tests
     * must inject a tagged fixture registry instead of relying on made-up evidence fields. */
    evidenceRegistry?: CanonicalEvidenceRegistryInput;
  } = {},
): RebuildCanonicalDbResult {
  const targetPath = options.path ?? canonicalDbPath();
  const tempPath = `${targetPath}.building`;
  mkdirSync(dirname(targetPath), { recursive: true });
  removeDbFiles(tempPath);
  const evidenceRegistry = normalizeEvidenceRegistry(options.evidenceRegistry, targetPath);

  const runIdBySubmission = new Map<string, string>();
  for (const entry of options.submissions ?? []) runIdBySubmission.set(entry.submission_id, entry.run_id);

  const recordIds = new Set(records.map((record) => record.record_id));
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const relationshipContract = loadRelationshipContract();
  const identityOverrides = readIdentityOverrides().aliases ?? {};
  const validatorIssues: string[] = [];
  let relationCount = 0;
  let skippedRelationEdges = 0;

  const db = new Database(tempPath, { create: true });
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = OFF;");
    db.exec("PRAGMA synchronous = OFF;");
    for (const statement of SCHEMA_DDL) db.exec(statement);
    db.exec(`PRAGMA user_version = ${CANONICAL_DB_VERSION};`);

    const insertRecord = db.prepare(
      `INSERT INTO records (record_id, record_kind, display_name, raw_text, local_observation_id, primary_source_id, payload, truth_status, review_state, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertSource = db.prepare(`INSERT OR IGNORE INTO record_sources (record_id, source_id) VALUES (?, ?)`);
    const insertLocal = db.prepare(`INSERT OR IGNORE INTO record_local_observations (record_id, local_observation_id) VALUES (?, ?)`);
    const insertSubmission = db.prepare(`INSERT OR IGNORE INTO record_submissions (record_id, submission_id, run_id) VALUES (?, ?, ?)`);
    const insertAlias = db.prepare(`INSERT OR IGNORE INTO record_aliases (record_id, alias) VALUES (?, ?)`);
    const insertEvidenceRegistry = db.prepare(
      `INSERT INTO evidence_block_registry
       (source_id, block_id, resolved_block_id, page_number, evidence_id, source_path, raw_text_sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertEvidence = db.prepare(
      `INSERT INTO evidence_refs
       (record_id, ordinal, ref_json, source_id, block_id, resolved_block_id, page_number, evidence_id, source_path, text_sha256, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertConflict = db.prepare(`INSERT OR IGNORE INTO payload_value_conflicts (record_id, field, value) VALUES (?, ?, ?)`);
    const insertRelation = db.prepare(
      `INSERT INTO relations (record_id, relation_kind, raw_relation_kind, relation_family, subject_id, object_id, provenance, derivation_rule, canonicalize_decision_id, assertion_status, as_of_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertContractRule = db.prepare(
      `INSERT INTO relationship_contract_rules (contract_id, relation_kind, relation_family, subject_kind, object_kind, review_basis) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertCanonicalIdentity = db.prepare(
      `INSERT OR IGNORE INTO canonical_identities (identity_class, identity_value, canonical_record_id, record_kind, source_id, resolution_status) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertRelationshipFinding = db.prepare(
      `INSERT INTO relationship_validation_findings (finding_id, contract_id, code, severity, record_id, detail, finding_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertRelationshipDisposition = db.prepare(
      `INSERT INTO relationship_dispositions
       (decision_id, contract_id, selector, record_id, record_kind, primary_disposition, study_projectable, waiver, reviewed_at, reviewed_by, reason, decision_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertRelationshipDispositionEvidence = db.prepare(
      `INSERT INTO relationship_disposition_evidence (decision_id, ordinal, evidence_id) VALUES (?, ?, ?)`,
    );
    const insertRelationshipCompletenessWaiver = db.prepare(
      `INSERT INTO relationship_completeness_waivers
       (decision_id, contract_id, selector, record_id, role) VALUES (?, ?, ?, ?, ?)`,
    );
    const insertCompletenessSubject = db.prepare(
      `INSERT INTO relationship_completeness_subjects
       (contract_id, selector, subject_id, subject_kind, canonical_record_id, primary_disposition, study_projectable, warning_codes_json, detail_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertCompletenessRole = db.prepare(
      `INSERT INTO relationship_completeness_roles
       (contract_id, selector, subject_id, role, role_status, binding_count, record_ids_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertCompletenessFinding = db.prepare(
      `INSERT INTO relationship_completeness_findings
       (finding_id, contract_id, code, severity, selector, subject_id, detail_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertSelectorContract = db.prepare(
      `INSERT INTO relationship_selector_contracts
       (contract_id, selector, selector_class, expected_count, actual_count, enforcement_eligible, promotion_criterion)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertEnforcementState = db.prepare(
      `INSERT INTO relationship_enforcement_state
       (contract_id, mode, hard_mode_ready, input_fingerprint, criteria_json)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const promotedStatements = new Map<string, ReturnType<Database["prepare"]>>();
    for (const kind of new Set(records.map((r) => r.record_kind))) {
      const table = promotedTableName(kind);
      const columns = promotedColumnsFromTable(kind);
      if (!table || columns.length === 0) continue;
      const names = ["record_id", ...columns.map((c) => c.name)];
      promotedStatements.set(
        kind,
        db.prepare(`INSERT INTO ${table} (${names.map((n) => `"${n}"`).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`),
      );
    }

    db.exec("BEGIN");
    db.run("INSERT INTO canonical_db_state (state_key, sealed) VALUES ('canonical', 0)");

    for (const entry of evidenceRegistry.entries) {
      insertEvidenceRegistry.run(
        entry.source_id,
        entry.block_id,
        entry.resolved_block_id,
        entry.page_number,
        `${entry.source_id}#${entry.block_id}`,
        entry.source_path,
        entry.raw_text_sha256,
      );
    }

    for (const rule of relationshipContract.matrix.rules) {
      for (const tuple of rule.allowed_family_shapes) {
        insertContractRule.run(
          relationshipContract.contract.contract_id,
          rule.relation_kind,
          tuple.relation_family,
          tuple.subject_kind,
          tuple.object_kind,
          rule.review_basis,
        );
      }
    }

    // Pass 1: records + promoted projections (all FK targets) before any relation edges.
    for (const record of records) {
      // Validate the core row against the generated schema (NOT NULL / type) before the STRICT
      // insert, so a malformed record surfaces as a located issue rather than a raw SQLite error.
      const recordRow = {
        record_id: record.record_id,
        record_kind: record.record_kind,
        display_name: record.display_name,
        raw_text: record.raw_text ?? null,
        local_observation_id: record.local_observation_id,
        primary_source_id: record.source_id,
        payload: stableJson(record.payload),
        truth_status: record.truth_status,
        review_state: record.review_state,
        generated_at: record.generated_at,
      };
      validatorIssues.push(...validateRow("records", recordRow).map((issue) => `${record.record_id}: ${issue}`));
      insertRecord.run(
        recordRow.record_id,
        recordRow.record_kind,
        recordRow.display_name,
        recordRow.raw_text,
        recordRow.local_observation_id,
        recordRow.primary_source_id,
        recordRow.payload,
        recordRow.truth_status,
        recordRow.review_state,
        recordRow.generated_at,
      );

      const promoted = promotedStatements.get(record.record_kind);
      if (promoted) {
        const row = projectPromotedRow(record.record_kind, record.payload);
        validatorIssues.push(...validatePromotedRow(record.record_kind, row).map((issue) => `${record.record_id}: ${issue}`));
        promoted.run(record.record_id, ...promotedColumnsFromTable(record.record_kind).map((c) => row[c.name] ?? null));
      }

      for (const source of uniqueSorted(record.source_ids, [record.source_id])) insertSource.run(record.record_id, source);
      for (const local of uniqueSorted(record.local_observation_ids, [record.local_observation_id])) insertLocal.run(record.record_id, local);
      for (const submissionId of [...new Set(record.submission_ids)].sort()) {
        insertSubmission.run(record.record_id, submissionId, runIdBySubmission.get(submissionId) ?? null);
      }
      for (const alias of [...new Set(record.record_aliases ?? [])].sort()) insertAlias.run(record.record_id, alias);

      record.evidence_refs.forEach((ref: MtaEvidenceRef, ordinal: number) => {
        const sourceId = typeof ref.source_id === "string" ? ref.source_id : "";
        const blockId = typeof ref.block_id === "string" ? ref.block_id : "";
        const registry = evidenceRegistry.byKey.get(evidenceRegistryKey(sourceId, blockId));
        const expectedEvidenceId = `${sourceId}#${blockId}`;
        const claimedResolvedBlockId = (ref as MtaEvidenceRef & {
          resolved_block_id?: unknown;
        }).resolved_block_id;
        if (
          !registry ||
          (claimedResolvedBlockId !== undefined && claimedResolvedBlockId !== registry.resolved_block_id) ||
          ref.evidence_id !== expectedEvidenceId ||
          ref.page_number !== registry.page_number ||
          ref.source_path !== registry.source_path ||
          ref.text_sha256 !== registry.raw_text_sha256
        ) {
          throw new Error(
            `canonical.db EVIDENCE_REGISTRY_MISMATCH ${record.record_id}[${ordinal}] ` +
              `${sourceId || "<missing-source>"}#${blockId || "<missing-block>"}`,
          );
        }
        insertEvidence.run(
          record.record_id,
          ordinal,
          stableJson(ref as unknown as JsonValue),
          sourceId,
          blockId,
          registry.resolved_block_id,
          registry.page_number,
          ref.evidence_id,
          ref.source_path,
          ref.text_sha256,
          ref.role ?? null,
        );
      });

      const merged = record.payload._merged_field_values;
      if (merged && typeof merged === "object" && !Array.isArray(merged)) {
        for (const [field, values] of Object.entries(merged)) {
          for (const value of Array.isArray(values) ? values : [values]) insertConflict.run(record.record_id, field, stableJson(value as JsonValue));
        }
      }
    }

    type IdentitySeed = { identityClass: "canonical" | "record_alias" | "local_observation" | "override_alias" | "superseded"; identityValue: string; targetId: string; sourceId: string | null };
    const identitySeeds: IdentitySeed[] = [];
    for (const record of records) {
      identitySeeds.push({ identityClass: "canonical", identityValue: record.record_id, targetId: record.record_id, sourceId: record.source_id });
      for (const alias of [...new Set(record.record_aliases ?? [])].sort()) {
        identitySeeds.push({ identityClass: "record_alias", identityValue: alias, targetId: record.record_id, sourceId: record.source_id });
      }
      for (const local of uniqueSorted(record.local_observation_ids, [record.local_observation_id])) {
        identitySeeds.push({ identityClass: "local_observation", identityValue: `${record.source_id}#${local}`, targetId: record.record_id, sourceId: record.source_id });
      }
    }
    for (const [kind, aliases] of Object.entries(identityOverrides)) {
      for (const [alias, targetId] of Object.entries(aliases ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
        const target = recordsById.get(targetId);
        if (!target || target.record_kind !== kind) continue;
        identitySeeds.push({ identityClass: "override_alias", identityValue: alias, targetId, sourceId: target.source_id });
      }
    }
    for (const entry of [...(options.identitySupersessions ?? [])].sort((left, right) => left.identity.localeCompare(right.identity))) {
      const target = recordsById.get(entry.canonicalRecordId);
      if (!target) throw new Error(`canonical.db superseded identity ${entry.identity} targets missing record ${entry.canonicalRecordId}`);
      identitySeeds.push({ identityClass: "superseded", identityValue: entry.identity, targetId: entry.canonicalRecordId, sourceId: target.source_id });
    }
    const targetsByIdentity = new Map<string, Set<string>>();
    for (const seed of identitySeeds) {
      const key = `${seed.identityClass}\u0000${seed.identityValue}`;
      const targets = targetsByIdentity.get(key) ?? new Set<string>();
      targets.add(seed.targetId);
      targetsByIdentity.set(key, targets);
    }
    for (const seed of identitySeeds.sort((left, right) =>
      left.identityClass.localeCompare(right.identityClass) || left.identityValue.localeCompare(right.identityValue) || left.targetId.localeCompare(right.targetId))) {
      const target = recordsById.get(seed.targetId)!;
      const targetCount = targetsByIdentity.get(`${seed.identityClass}\u0000${seed.identityValue}`)!.size;
      const resolutionStatus = seed.identityClass === "canonical" ? "canonical" : seed.identityClass === "superseded" ? "superseded" : targetCount > 1 ? "ambiguous" : "unique";
      insertCanonicalIdentity.run(seed.identityClass, seed.identityValue, seed.targetId, target.record_kind, seed.sourceId, resolutionStatus);
    }
    for (const finding of [...(options.relationshipFindings ?? [])].sort((left, right) => left.finding_id.localeCompare(right.finding_id))) {
      if (finding.record_id && !recordIds.has(finding.record_id)) {
        throw new Error(`canonical.db relationship finding ${finding.finding_id} targets missing record ${finding.record_id}`);
      }
      insertRelationshipFinding.run(
        finding.finding_id,
        finding.contract_id,
        finding.code,
        finding.severity,
        finding.record_id ?? null,
        finding.detail,
        stableJson(finding as unknown as JsonValue),
      );
    }

    // Pass 2: relation edges (subject/object FK into records).
    for (const record of records) {
      if (record.record_kind !== "relation") continue;
      const payload = record.payload;
      const subjectId = asString(payload.subject_id);
      const objectId = asString(payload.object_id);
      if (!subjectId || !objectId || !recordIds.has(subjectId) || !recordIds.has(objectId)) {
        skippedRelationEdges += 1;
        throw new Error(`canonical.db cannot project relation ${record.record_id}: subject=${subjectId ?? "<missing>"} object=${objectId ?? "<missing>"}`);
      }
      insertRelation.run(
        record.record_id,
        String(payload.relation_kind ?? ""),
        asString(payload.raw_relation_kind),
        String(payload.relation_family ?? "other"),
        subjectId,
        objectId,
        classifyProvenance(record),
        asString(payload.derivation_rule),
        asString(payload.canonicalize_decision_id),
        // S2.1: columns land with a forward-compatible read of the payload. S2.4 populates these
        // payload fields (assertion_status from status-bearing fields; as_of_date from the citing
        // source's published_date_normalized); until then assertion_status defaults to 'unknown'.
        asString(payload.assertion_status) ?? "unknown",
        asString(payload.as_of_date),
      );
      relationCount += 1;
    }

    const completeness = options.relationshipCompleteness;
    if (completeness) {
      for (const disposition of [...completeness.dispositions].sort((left, right) =>
        left.decisionId.localeCompare(right.decisionId))) {
        const target = recordsById.get(disposition.recordId);
        if (!target || target.record_kind !== disposition.recordKind) {
          throw new Error(
            `canonical.db relationship disposition ${disposition.decisionId} targets invalid ${disposition.recordKind} ${disposition.recordId}`,
          );
        }
        insertRelationshipDisposition.run(
          disposition.decisionId,
          disposition.contractId,
          disposition.selector,
          disposition.recordId,
          disposition.recordKind,
          disposition.primaryDisposition,
          disposition.studyProjectable ? 1 : 0,
          disposition.waiver ? 1 : 0,
          disposition.reviewedAt,
          disposition.reviewedBy,
          disposition.reason,
          stableJson(disposition.decisionJson),
        );
        for (const [ordinal, evidenceId] of [...new Set(disposition.evidenceIds)].sort().entries()) {
          insertRelationshipDispositionEvidence.run(disposition.decisionId, ordinal, evidenceId);
        }
        const allowedMissingRoles = disposition.waiver
          ? dispositionAllowedMissingRoles(disposition.decisionJson)
          : [];
        const waiverSelector = RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR[
          disposition.selector as keyof typeof RELATIONSHIP_DISPOSITION_WAIVER_SELECTOR
        ];
        if (allowedMissingRoles.length > 0 && !waiverSelector) {
          throw new Error(
            `canonical.db relationship disposition ${disposition.decisionId} has no versioned completeness waiver selector`,
          );
        }
        for (const role of allowedMissingRoles) {
          insertRelationshipCompletenessWaiver.run(
            disposition.decisionId,
            RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID,
            waiverSelector!,
            disposition.recordId,
            role,
          );
        }
      }
      for (const subject of [...completeness.subjects].sort((left, right) =>
        left.selector.localeCompare(right.selector) || left.subjectId.localeCompare(right.subjectId))) {
        if (subject.canonicalRecordId && !recordsById.has(subject.canonicalRecordId)) {
          throw new Error(`canonical.db completeness subject ${subject.subjectId} targets missing ${subject.canonicalRecordId}`);
        }
        insertCompletenessSubject.run(
          subject.contractId,
          subject.selector,
          subject.subjectId,
          subject.subjectKind,
          subject.canonicalRecordId,
          subject.primaryDisposition,
          subject.studyProjectable ? 1 : 0,
          stableJson([...new Set(subject.warningCodes)].sort()),
          stableJson(subject.detailJson),
        );
        const roles = [...subject.roles].sort((left, right) => left.role.localeCompare(right.role));
        if (new Set(roles.map((role) => role.role)).size !== roles.length) {
          throw new Error(`canonical.db completeness subject ${subject.subjectId} has duplicate role rows`);
        }
        for (const role of roles) {
          if (!Number.isInteger(role.bindingCount) || role.bindingCount < 0) {
            throw new Error(`canonical.db completeness role ${subject.subjectId}/${role.role} has invalid binding count`);
          }
          const uniqueRecordIds = [...new Set(role.recordIds)].sort();
          if (role.bindingCount !== uniqueRecordIds.length) {
            throw new Error(
              `canonical.db completeness role ${subject.subjectId}/${role.role} binding count ${role.bindingCount} ` +
                `does not match ${uniqueRecordIds.length} distinct canonical record id(s)`,
            );
          }
          insertCompletenessRole.run(
            subject.contractId,
            subject.selector,
            subject.subjectId,
            role.role,
            role.status,
            role.bindingCount,
            stableJson(uniqueRecordIds),
          );
        }
      }
      for (const finding of [...completeness.findings].sort((left, right) =>
        left.findingId.localeCompare(right.findingId))) {
        insertCompletenessFinding.run(
          finding.findingId,
          finding.contractId,
          finding.code,
          finding.severity,
          finding.selector,
          finding.subjectId,
          stableJson(finding.detailJson),
        );
      }
      for (const contract of [...completeness.selectorContracts].sort((left, right) =>
        left.selector.localeCompare(right.selector))) {
        insertSelectorContract.run(
          contract.contractId,
          contract.selector,
          contract.selectorClass,
          contract.expectedCount,
          contract.actualCount,
          contract.enforcementEligible ? 1 : 0,
          contract.promotionCriterion,
        );
      }
      const enforcement = completeness.enforcement;
      insertEnforcementState.run(
        enforcement.contractId,
        enforcement.mode,
        enforcement.hardModeReady ? 1 : 0,
        enforcement.inputFingerprint,
        stableJson(enforcement.criteriaJson),
      );
    }

    // Identity mirrors (read mirrors of the override files; not FK-bound — alias ids may be retired).
    const aliases = identityOverrides;
    const insertIdentityAlias = db.prepare(`INSERT OR IGNORE INTO identity_aliases (kind, alias, target, source_decision) VALUES (?, ?, ?, ?)`);
    for (const [kind, map] of Object.entries(aliases)) {
      for (const [alias, target] of Object.entries(map ?? {})) insertIdentityAlias.run(kind, alias, target, null);
    }
    const pairs = readIdentityDoNotMergeOverrides().pairs ?? {};
    const insertDoNotMerge = db.prepare(`INSERT OR IGNORE INTO do_not_merge (kind, record_id_a, record_id_b, reason, source_decision, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const [kind, entries] of Object.entries(pairs)) {
      for (const entry of entries ?? []) {
        const ids = entry.record_ids;
        if (!Array.isArray(ids) || ids.length !== 2) continue;
        const [a, b] = [...ids].sort();
        insertDoNotMerge.run(kind, a!, b!, entry.reason ?? null, entry.source_decision ?? null, entry.reviewed_at ?? null);
      }
    }

    // FTS5 population (A5): name surface + staged source blocks. Inside the transaction; excluded
    // from the canonical determinism anchor (see canonicalDbDump) — covered by ftsContentChecksum.
    populateFts(db, records);

    // C1/S2.5: load the GTFS reference registries from the staged feed (no feed → empty tables).
    loadGtfsRefTables(db);
    // Plan 035: preserve the legacy fuzzy registry above, then independently load the exact,
    // receipt-bound snapshot only when its reviewed SELECTED pointer exists.
    loadSelectedGtfsSnapshotTables(db);


    // This is the only allowed state transition. All relationship enforcement mirrors (including
    // records/edges and exact evidence) become immutable before the atomic file is published.
    db.run("UPDATE canonical_db_state SET sealed = 1 WHERE state_key = 'canonical'");
    db.exec("COMMIT");

    if (validatorIssues.length > 0) throw new Error(`canonical.db insert-validator failures (${validatorIssues.length}): ${validatorIssues.slice(0, 5).join("; ")}`);
    const fkViolations = db.query("PRAGMA foreign_key_check").all();
    if (fkViolations.length > 0) throw new Error(`canonical.db foreign key violations: ${JSON.stringify(fkViolations.slice(0, 5))}`);
    const state = db.query(
      "SELECT sealed FROM canonical_db_state WHERE state_key = 'canonical'",
    ).get() as { sealed: number } | null;
    if (!state || state.sealed !== 1) throw new Error("canonical.db failed to seal");
  } finally {
    db.close();
  }

  // Publish atomically; clear any stale WAL/SHM that belonged to the previous file.
  renameSync(tempPath, targetPath);
  rmSync(`${targetPath}-wal`, { force: true });
  rmSync(`${targetPath}-shm`, { force: true });

  return { path: targetPath, recordCount: records.length, relationCount, skippedRelationEdges, validatorIssues };
}

function removeDbFiles(path: string): void {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(`${path}${suffix}`, { force: true });
}

type RecordRow = {
  record_id: string;
  record_kind: MtaCanonicalRecord["record_kind"];
  display_name: string;
  raw_text: string | null;
  local_observation_id: string;
  primary_source_id: string;
  payload: string;
  truth_status: string;
  review_state: string;
  generated_at: string;
};

type RecordParts = {
  sourceIds: string[];
  localIds: string[];
  submissionIds: string[];
  aliases: string[];
  evidence: MtaEvidenceRef[];
};

/** Single assembler shared by the per-record and bulk readers, so both reconstruct a record
 *  identically: undefined optionals omitted, multi-value fields in the materializer's sort
 *  order, evidence in original (ordinal) order. The parity gate asserts stableHash equality. */
function assembleRecord(row: RecordRow, parts: RecordParts): MtaCanonicalRecord {
  return {
    record_id: row.record_id,
    record_aliases: parts.aliases.length > 0 ? parts.aliases : undefined,
    record_kind: row.record_kind,
    source_id: row.primary_source_id,
    source_ids: parts.sourceIds,
    local_observation_id: row.local_observation_id,
    local_observation_ids: parts.localIds,
    display_name: row.display_name,
    raw_text: row.raw_text ?? undefined,
    payload: JSON.parse(row.payload) as JsonObject,
    evidence_refs: parts.evidence,
    submission_ids: parts.submissionIds,
    truth_status: row.truth_status,
    review_state: row.review_state,
    generated_at: row.generated_at,
  };
}

/** Reconstruct a single canonical record from the DB (N+1 queries; use the bulk reader for full
 *  scans). Faithful to readCanonicalRecords() output. */
export function rowToRecord(db: Database, recordId: string): MtaCanonicalRecord | undefined {
  const row = drizzle({ client: db }).select().from(recordsTable).where(eq(recordsTable.record_id, recordId)).get() as unknown as RecordRow | undefined;
  if (!row) return undefined;

  const sourceIds = (db.query("SELECT source_id FROM record_sources WHERE record_id = ? ORDER BY source_id").all(recordId) as Array<{ source_id: string }>).map((r) => r.source_id);
  const localIds = (db.query("SELECT local_observation_id FROM record_local_observations WHERE record_id = ? ORDER BY local_observation_id").all(recordId) as Array<{ local_observation_id: string }>).map((r) => r.local_observation_id);
  const submissionIds = (db.query("SELECT submission_id FROM record_submissions WHERE record_id = ? ORDER BY submission_id").all(recordId) as Array<{ submission_id: string }>).map((r) => r.submission_id);
  const aliases = (db.query("SELECT alias FROM record_aliases WHERE record_id = ? ORDER BY alias").all(recordId) as Array<{ alias: string }>).map((r) => r.alias);
  const evidence = (db.query("SELECT ref_json FROM evidence_refs WHERE record_id = ? ORDER BY ordinal").all(recordId) as Array<{ ref_json: string }>).map((r) => JSON.parse(r.ref_json) as MtaEvidenceRef);

  return assembleRecord(row, { sourceIds, localIds, submissionIds, aliases, evidence });
}

/** Bucket child rows (record_id, value) into per-record arrays, preserving query (ORDER BY) order. */
function groupBy<T>(rows: Array<{ record_id: string } & T>, pick: (row: T) => unknown): Map<string, unknown[]> {
  const map = new Map<string, unknown[]>();
  for (const row of rows) {
    const bucket = map.get(row.record_id);
    const value = pick(row);
    if (bucket) bucket.push(value);
    else map.set(row.record_id, [value]);
  }
  return map;
}

/** All canonical records from the DB, in record_id order, using a fixed number of bulk queries
 *  (not N+1) so a full scan stays O(corpus) like the JSONL reader it replaces. */
export function readCanonicalRecordsFromDb(db: Database): MtaCanonicalRecord[] {
  const rows = drizzle({ client: db }).select().from(recordsTable).orderBy(asc(recordsTable.record_id)).all() as unknown as RecordRow[];

  const sources = groupBy(
    db.query("SELECT record_id, source_id FROM record_sources ORDER BY record_id, source_id").all() as Array<{ record_id: string; source_id: string }>,
    (r) => r.source_id,
  );
  const locals = groupBy(
    db.query("SELECT record_id, local_observation_id FROM record_local_observations ORDER BY record_id, local_observation_id").all() as Array<{ record_id: string; local_observation_id: string }>,
    (r) => r.local_observation_id,
  );
  const submissions = groupBy(
    db.query("SELECT record_id, submission_id FROM record_submissions ORDER BY record_id, submission_id").all() as Array<{ record_id: string; submission_id: string }>,
    (r) => r.submission_id,
  );
  const aliases = groupBy(
    db.query("SELECT record_id, alias FROM record_aliases ORDER BY record_id, alias").all() as Array<{ record_id: string; alias: string }>,
    (r) => r.alias,
  );
  const evidence = groupBy(
    db.query("SELECT record_id, ref_json FROM evidence_refs ORDER BY record_id, ordinal").all() as Array<{ record_id: string; ref_json: string }>,
    (r) => JSON.parse(r.ref_json) as MtaEvidenceRef,
  );

  return rows.map((row) =>
    assembleRecord(row, {
      sourceIds: (sources.get(row.record_id) ?? []) as string[],
      localIds: (locals.get(row.record_id) ?? []) as string[],
      submissionIds: (submissions.get(row.record_id) ?? []) as string[],
      aliases: (aliases.get(row.record_id) ?? []) as string[],
      evidence: (evidence.get(row.record_id) ?? []) as MtaEvidenceRef[],
    }),
  );
}

/** All canonical records of a single kind, fetched via `idx_records_kind` (no full-corpus scan).
 *  Byte-identical to `readCanonicalRecordsFromDb(db).filter((r) => r.record_kind === kind)` — the
 *  indexed read the same-kind hot loops (identity-candidate resolution) actually need. */
export function readCanonicalRecordsOfKindFromDb(db: Database, kind: string): MtaCanonicalRecord[] {
  const rows = drizzle({ client: db })
    .select()
    .from(recordsTable)
    .where(eq(recordsTable.record_kind, kind))
    .orderBy(asc(recordsTable.record_id))
    .all() as unknown as RecordRow[];
  if (rows.length === 0) return [];

  const childRows = (table: string, col: string) =>
    db
      .query(`SELECT c.record_id AS record_id, c.${col} AS v FROM ${table} c JOIN records r ON r.record_id = c.record_id WHERE r.record_kind = ? ORDER BY c.record_id, c.${col}`)
      .all(kind) as Array<{ record_id: string; v: string }>;

  const sources = groupBy(childRows("record_sources", "source_id"), (r) => r.v);
  const locals = groupBy(childRows("record_local_observations", "local_observation_id"), (r) => r.v);
  const submissions = groupBy(childRows("record_submissions", "submission_id"), (r) => r.v);
  const aliases = groupBy(childRows("record_aliases", "alias"), (r) => r.v);
  const evidence = groupBy(
    db
      .query("SELECT c.record_id AS record_id, c.ref_json AS v FROM evidence_refs c JOIN records r ON r.record_id = c.record_id WHERE r.record_kind = ? ORDER BY c.record_id, c.ordinal")
      .all(kind) as Array<{ record_id: string; v: string }>,
    (r) => JSON.parse(r.v) as MtaEvidenceRef,
  );

  return rows.map((row) =>
    assembleRecord(row, {
      sourceIds: (sources.get(row.record_id) ?? []) as string[],
      localIds: (locals.get(row.record_id) ?? []) as string[],
      submissionIds: (submissions.get(row.record_id) ?? []) as string[],
      aliases: (aliases.get(row.record_id) ?? []) as string[],
      evidence: (evidence.get(row.record_id) ?? []) as MtaEvidenceRef[],
    }),
  );
}

export type DuplicateRelationRow = {
  relation_kind: string;
  subject_id: string;
  object_id: string;
  edge_count: number;
  record_ids: string;
};

/** Colliding relation triples (the duplicate_relations view) — a queryable work queue; every
 *  relation record is still preserved as its own row (the index is non-unique). */
export function duplicateRelations(db: Database): DuplicateRelationRow[] {
  return db.query("SELECT * FROM duplicate_relations ORDER BY relation_kind, subject_id, object_id").all() as DuplicateRelationRow[];
}

export type OrphanRecordRow = { record_id: string; record_kind: MtaCanonicalRecord["record_kind"] };

/** Structural orphans (the orphan_records view): records of a non-relation, non-source kind that
 *  are not an endpoint of any relation edge. NOTE: this is a structural query over resolved edges
 *  and is intentionally distinct from pipeline-metrics' alias-aware graphMetrics probe; it is not a
 *  drop-in replacement for that report number (see docs/sqlite-migration-plan.md). */
export function orphanRecords(db: Database): OrphanRecordRow[] {
  return db.query("SELECT record_id, record_kind FROM orphan_records ORDER BY record_id").all() as OrphanRecordRow[];
}

/** Deterministic content hash of the whole DB (row-order-independent), for the double-rebuild gate.
 *  FTS5 virtual tables and their auto-created shadow tables are excluded — their internals are not
 *  byte-stable across builds (decision 5); fts.ts#ftsContentChecksum covers their logical content. */
export function canonicalDbDump(db: Database): string {
  const ftsNames = ftsTableNames();
  const isFts = (name: string) => ftsNames.some((fts) => name === fts || name.startsWith(`${fts}_`));
  const tables = (db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
    .map((r) => r.name)
    .filter((name) => !isFts(name));
  const version = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
  const parts: string[] = [`user_version=${version}`];
  for (const table of tables) {
    const rows = (db.query(`SELECT * FROM ${table}`).all() as Array<Record<string, JsonValue>>).map((r) => stableJson(r as JsonValue)).sort();
    parts.push(`${table}\n${rows.join("\n")}`);
  }
  return sha256(parts.join("\n"));
}
