import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableHash, stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { ScheduleDiffDossier } from "../reference/schedule-diff.js";
import {
  loadMemberGrainDecisions,
  memberGrainDecisionKey,
  parseMemberGrainDecision,
  type MemberGrainDecision,
  type MemberGrainLineageSegment,
  type MemberGrainServiceScope,
} from "./member-grain-decisions.js";
import {
  DEFAULT_MEMBER_GRAIN_BLOCK_RECEIPT,
  loadMemberGrainBlockReceipt,
  memberGrainBlockKey,
  type MemberGrainBlockReceipt,
} from "./member-grain-block-receipts.js";
import {
  MEMBER_EXTENT_KINDS,
  extentDecisionKey,
  validateMemberExtentDecision,
  type MemberExtentDecision,
  type MemberExtentKind,
  type MemberExtentMissingRole,
  type MemberExtentRow,
} from "./study-readiness-v1.js";

export const MEMBER_EXTENT_LEDGER_SCHEMA_VERSION = 1 as const;
export const MEMBER_EXTENT_LEDGER_CONTRACT_ID = "member-extent-ledger-v1" as const;
export const MEMBER_GRAIN_LEDGER_CONTRACT_ID = "member-grain-ledger-v1" as const;
export const MEMBER_EXTENT_ABSENCE_CONTRACT_ID = "member-extent-absence-receipt-v1" as const;
export const MEMBER_SOURCE_GAP_OVERLAY_CONTRACT_ID =
  "member-source-gap-overlay-v1" as const;
export const DEFAULT_MEMBER_EXTENT_COMPANION =
  "data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl";
export const DEFAULT_MEMBER_EXTENT_OCCURRENCES =
  "data/exports/releases/v1-rc26/operational_occurrences.jsonl";
export const DEFAULT_MEMBER_EXTENT_LEDGER =
  "data/quality/operational-reference/member-extent-ledger.jsonl";
export const DEFAULT_MEMBER_GRAIN_LEDGER =
  "data/quality/operational-reference/member-grain-ledger.jsonl";
export const DEFAULT_MEMBER_EXTENT_DECISION_DIR =
  "data/quality/operational-reference/member-extent-ledger-decisions";
export const DEFAULT_MEMBER_GRAIN_DECISION_DIR =
  "data/quality/operational-reference/member-grain-decisions";
export const DEFAULT_MEMBER_SOURCE_GAP_OVERLAY_DIR =
  "data/quality/operational-reference/member-source-gap-overlays";
export const DEFAULT_MEMBER_EXTENT_ABSENCE_DIR =
  "data/quality/acquisition/receipts/member-extent";
export const DEFAULT_SCHEDULE_DIFF_DIR =
  "data/quality/operational-reference/schedule-diff";

export type MemberLedgerSurface = "member_extent" | "member_grain";

export type MemberExtentKey = {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
};

export type MemberExtentAbsenceReceipt = {
  schema_version: typeof MEMBER_EXTENT_LEDGER_SCHEMA_VERSION;
  contract_id: typeof MEMBER_EXTENT_ABSENCE_CONTRACT_ID;
  receipt_id: string;
  surfaces: MemberLedgerSurface[];
  extent_keys: MemberExtentKey[];
  exact_searches: string[];
  urls_inspected: string[];
  rationale: string;
  reviewed_at: string;
  reviewed_by: string;
  authorizes_study: false;
  authorizes_cross_product: false;
};

export type MemberSourceGapOverlayEntry = MemberExtentKey & {
  candidate_key: string;
  blocked_surfaces: MemberLedgerSurface[];
  missing_roles: string[];
  verdict: `blocked_upstream:${string}`;
  source_statement_evidence_id: string;
};

export type MemberSourceGapOverlay = {
  schema_version: typeof MEMBER_EXTENT_LEDGER_SCHEMA_VERSION;
  contract_id: typeof MEMBER_SOURCE_GAP_OVERLAY_CONTRACT_ID;
  overlay_id: string;
  source_receipt: {
    path: string;
    sha256: string;
    receipt_id: string;
  };
  owner_acceptance: {
    path: string;
    sha256: string;
  };
  accepted_at: string;
  accepted_by: string;
  entries: MemberSourceGapOverlayEntry[];
  authorizes_decision_persistence: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

const VERIFIED_SOURCE_GAP_OVERLAY =
  Symbol("verified-member-source-gap-overlay");
const verifiedSourceGapOverlayInstances = new WeakSet<object>();

export type VerifiedMemberSourceGapOverlay = MemberSourceGapOverlay & {
  readonly [VERIFIED_SOURCE_GAP_OVERLAY]: true;
};

export type MemberExtentDossierRef = {
  artifact: string;
  fact_kind: "bounded_scope_identity" | "scope_modality" | "stop_identity";
  direction: string;
  change: "added" | "removed" | "boundary" | "remainder" | "period_delta";
  identifiers: string[];
  receipt_refs: { snapshot_id: string; path: string; sha256: string }[];
  evidence_scope: "route_context_only_nonexclusive";
  satisfies_missing_role: false;
  limitations: (
    | "may_include_non_revenue_trips"
    | "nonexclusive_route_context"
    | "not_treatment_aligned"
    | "timepoint_only_nonexhaustive"
  )[];
};

export type MemberExtentLedgerVerdict =
  | "unreviewed"
  | `resolved:${Exclude<MemberExtentKind, "unresolved">}`
  | "absent_in_source"
  | `blocked_upstream:${string}`;

export type MemberExtentLedgerRow = {
  schema_version: typeof MEMBER_EXTENT_LEDGER_SCHEMA_VERSION;
  contract_id: typeof MEMBER_EXTENT_LEDGER_CONTRACT_ID;
  ledger_id: string;
  occurrence_id: string;
  route_record_id: string;
  gtfs_route_id: string;
  treatment_record_id: string;
  treatment_family: string;
  current_extent_kind: MemberExtentKind;
  missing_roles: MemberExtentMissingRole[];
  dossier_refs: MemberExtentDossierRef[];
  packet_id: string | null;
  verdict: MemberExtentLedgerVerdict;
  verdict_basis: string | null;
  receipt_ids: string[];
  updated_at: string | null;
  authorizes_study: false;
  authorizes_cross_product: false;
};

export type MemberGrainLedgerRow = {
  schema_version: typeof MEMBER_EXTENT_LEDGER_SCHEMA_VERSION;
  contract_id: typeof MEMBER_GRAIN_LEDGER_CONTRACT_ID;
  ledger_id: string;
  occurrence_id: string;
  route_record_id: string;
  gtfs_route_id: string;
  treatment_record_id: string;
  treatment_family: string;
  current_extent_kind: MemberExtentKind;
  spatial_verdict: MemberExtentLedgerVerdict;
  member_extent_decision_id: string | null;
  service_scope: MemberGrainServiceScope | null;
  lineage_segments: MemberGrainLineageSegment[];
  evidence_bindings: MemberGrainDecision["evidence_bindings"];
  dossier_refs: MemberExtentDossierRef[];
  packet_id: string | null;
  verdict: "unreviewed" | "resolved" | "not_applicable" | "absent_in_source" | `blocked_upstream:${string}`;
  verdict_basis: string | null;
  receipt_ids: string[];
  updated_at: string | null;
  authorizes_study: false;
  authorizes_cross_product: false;
};

type ScheduleDossierArtifact = { artifact: string; dossier: ScheduleDiffDossier };

const extentDecisionFields = new Set([
  "components", "decision_id", "evidence_bindings", "missing_roles", "occurrence_id", "rationale",
  "resolution", "reviewed_at", "reviewed_by", "route_record_id", "treatment_record_id",
]);
const receiptFields = new Set([
  "authorizes_cross_product", "authorizes_study", "contract_id", "exact_searches", "extent_keys",
  "rationale", "receipt_id", "reviewed_at", "reviewed_by", "schema_version", "surfaces", "urls_inspected",
]);
const sourceGapOverlayFields = new Set([
  "accepted_at", "accepted_by", "authorizes_cross_product",
  "authorizes_decision_persistence", "authorizes_occurrence",
  "authorizes_study", "contract_id", "entries", "overlay_id",
  "owner_acceptance", "schema_version", "source_receipt",
]);
const sourceGapEntryFields = new Set([
  "blocked_surfaces", "candidate_key", "missing_roles", "occurrence_id",
  "route_record_id", "source_statement_evidence_id", "treatment_record_id",
  "verdict",
]);
const sourceGapReceiptRefFields = new Set([
  "path", "receipt_id", "sha256",
]);
const acceptanceRefFields = new Set(["path", "sha256"]);
const sourceGapReceiptFields = new Set([
  "absence_projection_prohibited_for_unresolved_grain",
  "authorizes_cross_product", "authorizes_decision_persistence",
  "authorizes_occurrence", "authorizes_study", "candidate_count",
  "candidate_key_sha256", "candidates", "comparison_receipt",
  "contract_semantics", "exact_absence_count",
  "external_acquisition_performed", "normal_file_verified", "package_id",
  "prospective_ledger_prefix", "prospective_ledger_reason_policy",
  "receipt_id", "replay_derived", "schema_version", "source_id",
]);
const labeledSourceGapReceiptFields = new Set([
  ...sourceGapReceiptFields,
  "frozen_finding_labels_preserved_separately",
]);
const sourceGapReceiptCandidateFields = new Set([
  "absence_projection_prohibited_for_unresolved_grain",
  "authorizes_cross_product", "authorizes_decision_persistence",
  "authorizes_occurrence", "authorizes_study", "blocked_surfaces",
  "candidate_key", "comparison_receipt_anchor", "contract", "gap_codes",
  "literal_exact_absence", "occurrence_id",
  "prospective_ledger_handling", "resolved_surfaces", "route_record_id",
  "semantic_verdict", "source_statement_evidence_id",
  "source_statement_present", "treatment_record_id",
]);
const labeledSourceGapReceiptCandidateFields = new Set([
  ...sourceGapReceiptCandidateFields,
  "frozen_finding_verdict",
]);
const evidenceReceiptRefFields = new Set([
  "authorizes_cross_product", "authorizes_decision_persistence",
  "authorizes_occurrence", "authorizes_study", "normal_file_verified",
  "path", "receipt_id", "replay_derived", "sha256", "source_id",
]);
const comparisonReceiptFields = new Set([
  "authorizes_cross_product", "authorizes_decision_persistence",
  "authorizes_occurrence", "authorizes_study", "candidates", "derivation",
  "external_acquisition_performed", "normal_file_verified", "package_id",
  "receipt_id", "replay_derived", "schema_version", "source_id",
  "source_pins", "upstream_pins",
]);
const acceptanceFields = new Set([
  "acceptance_basis", "acceptance_id", "accepted_at", "accepted_by",
  "artifacts", "authorization_state", "authorized_exact_persistence",
  "authorizes_corrections", "authorizes_cross_product",
  "authorizes_decision_persistence", "authorizes_occurrence",
  "authorizes_ontology", "authorizes_study", "candidate_count",
  "candidate_key_sha256", "gate", "preservation_invariants",
  "reviewer_result", "schema_version", "verdict_distribution",
]);
const acceptanceArtifactFields = new Set([
  "comparison_receipt", "draft", "evidence", "source_gap_block_receipt",
]);
const acceptedPersistenceFields = new Set([
  "decision_candidate_count", "decision_candidate_key_sha256",
  "extent_blocked_upstream_count", "extent_decision_count",
  "extent_decision_id_sha256", "extent_resolved_count",
  "grain_blocked_upstream_count", "grain_decision_count",
  "grain_decision_id_sha256", "grain_resolved_count",
  "source_gap_candidate_key_sha256", "source_gap_overlay_count",
]);
const acceptancePreservationFields = new Set([
  "absence_projection_prohibited_for_unresolved_grain",
  "accepted_prior_decisions_byte_identical", "correction_state_unchanged",
  "cross_product_authorization_unchanged", "occurrence_decisions_unchanged",
  "preserved_siblings_byte_identical",
  "source_gap_receipt_strict_and_nonauthorizing",
  "study_authorization_unchanged", "treatment_ontology_unchanged",
]);
const q89AcceptancePreservationFields = new Set([
  ...acceptancePreservationFields,
  "q89_remains_blocked_upstream",
]);
const acceptanceVerdictFields = new Set([
  "exact_absence", "positive_extent_and_grain_proposed",
  "positive_extent_proposed_grain_blocked", "source_gap_block_receipt",
  "source_gap_blocked_extent_and_grain",
]);
const compactAcceptanceVerdictFields = new Set([
  "exact_absence", "positive_extent_and_grain_proposed",
  "source_gap_blocked_extent_and_grain",
]);
const keyFields = new Set(["occurrence_id", "route_record_id", "treatment_record_id"]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, fields: ReadonlySet<string>, path: string): void {
  const extras = Object.keys(value).filter((field) => !fields.has(field)).sort();
  const missing = [...fields].filter((field) => !(field in value)).sort();
  if (extras.length > 0) throw new Error(`${path}: unknown field(s): ${extras.join(", ")}`);
  if (missing.length > 0) throw new Error(`${path}: missing field(s): ${missing.join(", ")}`);
}

function nonempty(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path}: expected non-empty string`);
  }
  return value.trim();
}

function nonnegativeInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${path}: expected non-negative integer`);
  }
  return value as number;
}

function exactSha256(value: unknown, path: string): string {
  const hash = nonempty(value, path);
  if (!/^[0-9a-f]{64}$/u.test(hash)) {
    throw new Error(`${path}: expected lowercase SHA-256`);
  }
  return hash;
}

function sortedKeyHash(values: readonly string[]): string {
  return createHash("sha256")
    .update(`${[...new Set(values)].sort().join("\n")}\n`)
    .digest("hex");
}

function sortedStrings(value: unknown, path: string, allowEmpty = true): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${path}: expected ${allowEmpty ? "" : "non-empty "}array`);
  }
  const output = value.map((item, index) => nonempty(item, `${path}[${index}]`));
  if (new Set(output).size !== output.length) throw new Error(`${path}: duplicates are forbidden`);
  if (stableJson(output as JsonValue) !== stableJson([...output].sort() as JsonValue)) {
    throw new Error(`${path}: values must be sorted`);
  }
  return output;
}

function uniqueStrings(value: unknown, path: string, allowEmpty = true): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${path}: expected ${allowEmpty ? "" : "non-empty "}array`);
  }
  const output = value.map((item, index) =>
    nonempty(item, `${path}[${index}]`)
  );
  if (new Set(output).size !== output.length) {
    throw new Error(`${path}: duplicates are forbidden`);
  }
  return output;
}

function jsonFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory()
      ? jsonFiles(child)
      : entry.isFile() && extname(entry.name) === ".json" ? [child] : [];
  }).sort();
}

function artifactValues(value: unknown, wrapper: "decisions" | "receipts", path: string): unknown[] {
  if (Array.isArray(value)) return value;
  const parsed = object(value, path);
  if (wrapper in parsed) {
    exactKeys(parsed, new Set([wrapper]), path);
    const values = parsed[wrapper];
    if (!Array.isArray(values)) throw new Error(`${path}.${wrapper}: expected array`);
    return values;
  }
  return [value];
}

function parseExtentDecision(value: unknown, path: string): MemberExtentDecision {
  const parsed = object(value, path);
  exactKeys(parsed, extentDecisionFields, path);
  const resolution = nonempty(parsed.resolution, `${path}.resolution`);
  if (!MEMBER_EXTENT_KINDS.includes(resolution as MemberExtentKind) || resolution === "unresolved") {
    throw new Error(`${path}.resolution: external overlays must be positive terminal extents`);
  }
  const decision = {
    decision_id: nonempty(parsed.decision_id, `${path}.decision_id`),
    occurrence_id: nonempty(parsed.occurrence_id, `${path}.occurrence_id`),
    route_record_id: nonempty(parsed.route_record_id, `${path}.route_record_id`),
    treatment_record_id: nonempty(parsed.treatment_record_id, `${path}.treatment_record_id`),
    resolution,
    components: parsed.components,
    evidence_bindings: parsed.evidence_bindings,
    missing_roles: parsed.missing_roles,
    rationale: nonempty(parsed.rationale, `${path}.rationale`),
    reviewed_at: nonempty(parsed.reviewed_at, `${path}.reviewed_at`),
    reviewed_by: nonempty(parsed.reviewed_by, `${path}.reviewed_by`),
  } as MemberExtentDecision;
  validateMemberExtentDecision(decision);
  return decision;
}

export function loadMemberExtentDecisions(directories: readonly string[]): MemberExtentDecision[] {
  const decisions = directories.flatMap((directory) => jsonFiles(directory).flatMap((path) =>
    artifactValues(JSON.parse(readFileSync(path, "utf8")) as unknown, "decisions", path)
      .map((value, index) => parseExtentDecision(value, `${path}#${index}`))));
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const decision of decisions) {
    if (ids.has(decision.decision_id)) throw new Error(`duplicate extent decision id ${decision.decision_id}`);
    const key = extentDecisionKey(decision);
    if (keys.has(key)) throw new Error(`duplicate extent decision key ${key}`);
    ids.add(decision.decision_id);
    keys.add(key);
  }
  return decisions.sort((left, right) => extentDecisionKey(left).localeCompare(extentDecisionKey(right)));
}

function parseAbsenceReceipt(value: unknown, path: string): MemberExtentAbsenceReceipt {
  const parsed = object(value, path);
  exactKeys(parsed, receiptFields, path);
  if (parsed.schema_version !== MEMBER_EXTENT_LEDGER_SCHEMA_VERSION ||
      parsed.contract_id !== MEMBER_EXTENT_ABSENCE_CONTRACT_ID) {
    throw new Error(`${path}: invalid contract header`);
  }
  if (parsed.authorizes_study !== false || parsed.authorizes_cross_product !== false) {
    throw new Error(`${path}: absence receipts cannot authorize study or cross-product projection`);
  }
  const surfaces = sortedStrings(parsed.surfaces, `${path}.surfaces`, false);
  if (surfaces.some((surface) => surface !== "member_extent" && surface !== "member_grain")) {
    throw new Error(`${path}.surfaces: unsupported ledger surface`);
  }
  if (!Array.isArray(parsed.extent_keys) || parsed.extent_keys.length === 0) {
    throw new Error(`${path}.extent_keys: expected non-empty array`);
  }
  const extentKeys = parsed.extent_keys.map((value, index) => {
    const itemPath = `${path}.extent_keys[${index}]`;
    const key = object(value, itemPath);
    exactKeys(key, keyFields, itemPath);
    return {
      occurrence_id: nonempty(key.occurrence_id, `${itemPath}.occurrence_id`),
      route_record_id: nonempty(key.route_record_id, `${itemPath}.route_record_id`),
      treatment_record_id: nonempty(key.treatment_record_id, `${itemPath}.treatment_record_id`),
    };
  });
  const keys = extentKeys.map(extentDecisionKey);
  if (new Set(keys).size !== keys.length) throw new Error(`${path}.extent_keys: duplicates are forbidden`);
  if (stableJson(keys as JsonValue) !== stableJson([...keys].sort() as JsonValue)) {
    throw new Error(`${path}.extent_keys: values must be sorted`);
  }
  const urls = sortedStrings(parsed.urls_inspected, `${path}.urls_inspected`, false);
  if (urls.some((url) => !/^https?:\/\//u.test(url))) {
    throw new Error(`${path}.urls_inspected: every value must be an exact HTTP(S) URL`);
  }
  return {
    schema_version: MEMBER_EXTENT_LEDGER_SCHEMA_VERSION,
    contract_id: MEMBER_EXTENT_ABSENCE_CONTRACT_ID,
    receipt_id: nonempty(parsed.receipt_id, `${path}.receipt_id`),
    surfaces: surfaces as MemberLedgerSurface[],
    extent_keys: extentKeys,
    exact_searches: sortedStrings(parsed.exact_searches, `${path}.exact_searches`, false),
    urls_inspected: urls,
    rationale: nonempty(parsed.rationale, `${path}.rationale`),
    reviewed_at: nonempty(parsed.reviewed_at, `${path}.reviewed_at`),
    reviewed_by: nonempty(parsed.reviewed_by, `${path}.reviewed_by`),
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

export function loadMemberExtentAbsenceReceipts(directories: readonly string[]): MemberExtentAbsenceReceipt[] {
  const receipts = directories.flatMap((directory) => jsonFiles(directory).flatMap((path) =>
    artifactValues(JSON.parse(readFileSync(path, "utf8")) as unknown, "receipts", path)
      .map((value, index) => parseAbsenceReceipt(value, `${path}#${index}`))));
  const ids = new Set<string>();
  const covered = new Set<string>();
  for (const receipt of receipts) {
    if (ids.has(receipt.receipt_id)) throw new Error(`duplicate absence receipt id ${receipt.receipt_id}`);
    ids.add(receipt.receipt_id);
    for (const surface of receipt.surfaces) {
      for (const key of receipt.extent_keys.map(extentDecisionKey)) {
        const coverageKey = `${surface}\0${key}`;
        if (covered.has(coverageKey)) throw new Error(`duplicate absence coverage ${coverageKey}`);
        covered.add(coverageKey);
      }
    }
  }
  return receipts.sort((left, right) => left.receipt_id.localeCompare(right.receipt_id));
}

function parseSourceGapOverlay(
  value: unknown,
  path: string,
): MemberSourceGapOverlay {
  const parsed = object(value, path);
  exactKeys(parsed, sourceGapOverlayFields, path);
  if (
    parsed.schema_version !== MEMBER_EXTENT_LEDGER_SCHEMA_VERSION ||
    parsed.contract_id !== MEMBER_SOURCE_GAP_OVERLAY_CONTRACT_ID
  ) {
    throw new Error(`${path}: invalid source-gap overlay contract header`);
  }
  if (
    parsed.authorizes_decision_persistence !== false ||
    parsed.authorizes_occurrence !== false ||
    parsed.authorizes_study !== false ||
    parsed.authorizes_cross_product !== false
  ) {
    throw new Error(`${path}: source-gap overlays cannot carry authority`);
  }
  const sourceReceipt = object(
    parsed.source_receipt,
    `${path}.source_receipt`,
  );
  exactKeys(
    sourceReceipt,
    sourceGapReceiptRefFields,
    `${path}.source_receipt`,
  );
  const ownerAcceptance = object(
    parsed.owner_acceptance,
    `${path}.owner_acceptance`,
  );
  exactKeys(
    ownerAcceptance,
    acceptanceRefFields,
    `${path}.owner_acceptance`,
  );
  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error(`${path}.entries: expected non-empty array`);
  }
  const entries = parsed.entries.map((value, index) => {
    const itemPath = `${path}.entries[${index}]`;
    const entry = object(value, itemPath);
    exactKeys(entry, sourceGapEntryFields, itemPath);
    const key = {
      occurrence_id: nonempty(entry.occurrence_id, `${itemPath}.occurrence_id`),
      route_record_id: nonempty(
        entry.route_record_id,
        `${itemPath}.route_record_id`,
      ),
      treatment_record_id: nonempty(
        entry.treatment_record_id,
        `${itemPath}.treatment_record_id`,
      ),
    };
    const candidateKey = nonempty(
      entry.candidate_key,
      `${itemPath}.candidate_key`,
    );
    if (candidateKey !== extentDecisionKey(key)) {
      throw new Error(`${itemPath}.candidate_key: key mismatch`);
    }
    const blockedSurfaces = sortedStrings(
      entry.blocked_surfaces,
      `${itemPath}.blocked_surfaces`,
      false,
    );
    if (blockedSurfaces.some((surface) =>
      surface !== "member_extent" && surface !== "member_grain"
    )) {
      throw new Error(`${itemPath}.blocked_surfaces: unsupported surface`);
    }
    const missingRoles = sortedStrings(
      entry.missing_roles,
      `${itemPath}.missing_roles`,
      false,
    );
    const expectedVerdict =
      `blocked_upstream:${missingRoles.join("+")}` as const;
    const verdict = nonempty(entry.verdict, `${itemPath}.verdict`);
    if (verdict !== expectedVerdict) {
      throw new Error(`${itemPath}.verdict: noncanonical blocked reason`);
    }
    return {
      ...key,
      candidate_key: candidateKey,
      blocked_surfaces: blockedSurfaces as MemberLedgerSurface[],
      missing_roles: missingRoles,
      verdict: expectedVerdict,
      source_statement_evidence_id: nonempty(
        entry.source_statement_evidence_id,
        `${itemPath}.source_statement_evidence_id`,
      ),
    };
  });
  if (
    new Set(entries.map((entry) => entry.candidate_key)).size !==
      entries.length ||
    stableJson(entries.map((entry) => entry.candidate_key) as JsonValue) !==
      stableJson(entries.map((entry) => entry.candidate_key).sort() as JsonValue)
  ) {
    throw new Error(`${path}.entries: keys must be unique and sorted`);
  }
  return {
    schema_version: MEMBER_EXTENT_LEDGER_SCHEMA_VERSION,
    contract_id: MEMBER_SOURCE_GAP_OVERLAY_CONTRACT_ID,
    overlay_id: nonempty(parsed.overlay_id, `${path}.overlay_id`),
    source_receipt: {
      path: nonempty(sourceReceipt.path, `${path}.source_receipt.path`),
      sha256: nonempty(
        sourceReceipt.sha256,
        `${path}.source_receipt.sha256`,
      ),
      receipt_id: nonempty(
        sourceReceipt.receipt_id,
        `${path}.source_receipt.receipt_id`,
      ),
    },
    owner_acceptance: {
      path: nonempty(
        ownerAcceptance.path,
        `${path}.owner_acceptance.path`,
      ),
      sha256: nonempty(
        ownerAcceptance.sha256,
        `${path}.owner_acceptance.sha256`,
      ),
    },
    accepted_at: nonempty(parsed.accepted_at, `${path}.accepted_at`),
    accepted_by: nonempty(parsed.accepted_by, `${path}.accepted_by`),
    entries,
    authorizes_decision_persistence: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

function markVerifiedSourceGapOverlay(
  overlay: MemberSourceGapOverlay,
): VerifiedMemberSourceGapOverlay {
  Object.defineProperty(overlay, VERIFIED_SOURCE_GAP_OVERLAY, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  const freeze = (value: unknown): void => {
    if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
      return;
    }
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  };
  freeze(overlay);
  verifiedSourceGapOverlayInstances.add(overlay);
  return overlay as VerifiedMemberSourceGapOverlay;
}

function assertVerifiedSourceGapOverlay(
  overlay: MemberSourceGapOverlay,
  path: string,
): asserts overlay is VerifiedMemberSourceGapOverlay {
  if (
    (overlay as Partial<VerifiedMemberSourceGapOverlay>)[
      VERIFIED_SOURCE_GAP_OVERLAY
    ] !== true ||
    !verifiedSourceGapOverlayInstances.has(overlay)
  ) {
    throw new Error(
      `${path}: source-gap overlay was not provenance-verified by the loader`,
    );
  }
}

type StrictSourceGapReceiptCandidate = MemberExtentKey & {
  candidate_key: string;
  blocked_surfaces: MemberLedgerSurface[];
  resolved_surfaces: MemberLedgerSurface[];
  gap_codes: string[];
  prospective_ledger_handling: Record<string, string>;
  source_statement_evidence_id: string;
};

type StrictSourceGapReceipt = {
  receipt_id: string;
  source_id: string;
  candidate_count: number;
  candidate_key_sha256: string;
  candidates: StrictSourceGapReceiptCandidate[];
  comparison_receipt: StrictEvidenceReceiptRef;
};

type PinnedArtifactRef = {
  path: string;
  sha256: string;
};

type StrictEvidenceReceiptRef = PinnedArtifactRef & {
  receipt_id: string;
  source_id: string;
  normal_file_verified: true;
  replay_derived: true;
  authorizes_decision_persistence: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

type StrictSourceGapAcceptance = {
  accepted_at: string;
  accepted_by: string;
  candidate_count: number;
  candidate_key_sha256: string;
  reviewer_result: "APPROVE/APPROVE";
  artifacts: {
    comparison_receipt: PinnedArtifactRef;
    draft: PinnedArtifactRef;
    evidence: PinnedArtifactRef;
    source_gap_block_receipt: PinnedArtifactRef;
  };
  gate: PinnedArtifactRef;
  authorized_exact_persistence: {
    decision_candidate_count: number;
    extent_decision_count: number;
    extent_resolved_count: number;
    source_gap_overlay_count: number;
    source_gap_candidate_key_sha256: string;
    extent_blocked_upstream_count: number;
    grain_decision_count: number;
    grain_resolved_count: number;
    grain_blocked_upstream_count: number;
  };
  verdict_distribution: Record<string, number>;
};

function canonicalRepoRelativePath(value: unknown, path: string): string {
  const candidate = nonempty(value, path);
  if (
    isAbsolute(candidate) ||
    candidate !== normalize(candidate) ||
    candidate === "." ||
    candidate === ".." ||
    candidate.startsWith(`..${sep}`) ||
    candidate.includes("\0")
  ) {
    throw new Error(`${path}: expected canonical path under repository root`);
  }
  return candidate;
}

function pathWithinRoot(root: string, path: string, label: string): void {
  const fromRoot = relative(root, path);
  if (
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(`${label}: path escapes repository root`);
  }
}

function readPinnedNormalFile(
  root: string,
  ref: PinnedArtifactRef,
  label: string,
): Buffer {
  const relativePath = canonicalRepoRelativePath(ref.path, `${label}.path`);
  const expectedSha256 = exactSha256(ref.sha256, `${label}.sha256`);
  const rootReal = realpathSync(root);
  const resolvedPath = resolve(root, relativePath);
  pathWithinRoot(resolve(root), resolvedPath, label);
  let stat;
  try {
    stat = lstatSync(resolvedPath);
  } catch {
    throw new Error(`${label}: pinned file is missing`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label}: pinned file must be a normal non-symlink file`);
  }
  pathWithinRoot(rootReal, realpathSync(resolvedPath), label);
  const bytes = readFileSync(resolvedPath);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `${label}: pinned SHA-256 mismatch; expected ${expectedSha256}, ` +
      `got ${actualSha256}`,
    );
  }
  return bytes;
}

function readPinnedNormalJson(
  root: string,
  ref: PinnedArtifactRef,
  label: string,
): unknown {
  const bytes = readPinnedNormalFile(root, ref, label);
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new Error(`${label}: pinned file is not valid JSON`);
  }
}

function verifyDeclaredPathPins(
  value: unknown,
  root: string,
  label: string,
): void {
  const visit = (candidate: unknown, path: string): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (typeof candidate !== "object" || candidate === null) return;
    const parsed = candidate as Record<string, unknown>;
    if ("path" in parsed && "sha256" in parsed) {
      readPinnedNormalFile(
        root,
        {
          path: canonicalRepoRelativePath(parsed.path, `${path}.path`),
          sha256: exactSha256(parsed.sha256, `${path}.sha256`),
        },
        path,
      );
    }
    for (const [key, item] of Object.entries(parsed)) {
      visit(item, `${path}.${key}`);
    }
  };
  visit(value, label);
}

function strictArtifactRef(value: unknown, path: string): PinnedArtifactRef {
  const parsed = object(value, path);
  exactKeys(parsed, acceptanceRefFields, path);
  return {
    path: canonicalRepoRelativePath(parsed.path, `${path}.path`),
    sha256: exactSha256(parsed.sha256, `${path}.sha256`),
  };
}

function strictEvidenceReceiptRef(
  value: unknown,
  path: string,
): StrictEvidenceReceiptRef {
  const parsed = object(value, path);
  exactKeys(parsed, evidenceReceiptRefFields, path);
  if (
    parsed.authorizes_decision_persistence !== false ||
    parsed.authorizes_occurrence !== false ||
    parsed.authorizes_study !== false ||
    parsed.authorizes_cross_product !== false ||
    parsed.normal_file_verified !== true ||
    parsed.replay_derived !== true
  ) {
    throw new Error(`${path}: receipt reference semantics drifted`);
  }
  nonempty(parsed.source_id, `${path}.source_id`);
  return {
    ...strictArtifactRef({
      path: parsed.path,
      sha256: parsed.sha256,
    }, path),
    receipt_id: nonempty(parsed.receipt_id, `${path}.receipt_id`),
    source_id: nonempty(parsed.source_id, `${path}.source_id`),
    normal_file_verified: true,
    replay_derived: true,
    authorizes_decision_persistence: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

function strictArtifactOrEvidenceReceiptRef(
  value: unknown,
  path: string,
): PinnedArtifactRef {
  const parsed = object(value, path);
  if ("receipt_id" in parsed) {
    const receipt = strictEvidenceReceiptRef(value, path);
    return { path: receipt.path, sha256: receipt.sha256 };
  }
  return strictArtifactRef(value, path);
}

function assertPinnedReceiptIdentity(
  value: unknown,
  ref: StrictEvidenceReceiptRef,
  path: string,
  fields: ReadonlySet<string>,
): void {
  const parsed = object(value, path);
  const effectiveFields =
    fields === sourceGapReceiptFields &&
      "frozen_finding_labels_preserved_separately" in parsed
      ? labeledSourceGapReceiptFields
      : fields;
  exactKeys(parsed, effectiveFields, path);
  if (nonempty(parsed.receipt_id, `${path}.receipt_id`) !== ref.receipt_id) {
    throw new Error(`${path}: internal receipt_id does not match pinned reference`);
  }
  if (nonempty(parsed.source_id, `${path}.source_id`) !== ref.source_id) {
    throw new Error(`${path}: internal source_id does not match pinned reference`);
  }
  for (
    const field of [
      "normal_file_verified",
      "replay_derived",
      "authorizes_decision_persistence",
      "authorizes_occurrence",
      "authorizes_study",
      "authorizes_cross_product",
    ] as const
  ) {
    if (parsed[field] !== ref[field]) {
      throw new Error(
        `${path}: internal ${field} does not match pinned reference`,
      );
    }
  }
}

function parseStrictSourceGapReceipt(
  value: unknown,
  path: string,
): StrictSourceGapReceipt {
  const parsed = object(value, path);
  const preservesFrozenFindingLabels =
    "frozen_finding_labels_preserved_separately" in parsed;
  exactKeys(
    parsed,
    preservesFrozenFindingLabels
      ? labeledSourceGapReceiptFields
      : sourceGapReceiptFields,
    path,
  );
  if (
    parsed.schema_version !== MEMBER_EXTENT_LEDGER_SCHEMA_VERSION ||
    parsed.absence_projection_prohibited_for_unresolved_grain !== true ||
    parsed.authorizes_decision_persistence !== false ||
    parsed.authorizes_occurrence !== false ||
    parsed.authorizes_study !== false ||
    parsed.authorizes_cross_product !== false ||
    parsed.external_acquisition_performed !== false ||
    parsed.normal_file_verified !== true ||
    parsed.replay_derived !== true ||
    parsed.exact_absence_count !== 0 ||
    parsed.prospective_ledger_prefix !== "blocked_upstream:" ||
    parsed.prospective_ledger_reason_policy !== "sorted_unique_gap_codes" ||
    preservesFrozenFindingLabels &&
      parsed.frozen_finding_labels_preserved_separately !== true
  ) {
    throw new Error(`${path}: source-gap receipt semantics drifted`);
  }
  nonempty(parsed.package_id, `${path}.package_id`);
  const sourceId = nonempty(parsed.source_id, `${path}.source_id`);
  nonempty(parsed.contract_semantics, `${path}.contract_semantics`);
  const comparisonReceipt = strictEvidenceReceiptRef(
    parsed.comparison_receipt,
    `${path}.comparison_receipt`,
  );
  if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
    throw new Error(`${path}.candidates: expected non-empty array`);
  }
  const candidates = parsed.candidates.map((value, index) => {
    const itemPath = `${path}.candidates[${index}]`;
    const candidate = object(value, itemPath);
    exactKeys(
      candidate,
      preservesFrozenFindingLabels
        ? labeledSourceGapReceiptCandidateFields
        : sourceGapReceiptCandidateFields,
      itemPath,
    );
    if (preservesFrozenFindingLabels) {
      const frozenFindingVerdict = nonempty(
        candidate.frozen_finding_verdict,
        `${itemPath}.frozen_finding_verdict`,
      );
      if (!frozenFindingVerdict.startsWith("blocked_upstream:")) {
        throw new Error(
          `${itemPath}.frozen_finding_verdict: expected blocked label`,
        );
      }
    }
    const key = {
      occurrence_id: nonempty(
        candidate.occurrence_id,
        `${itemPath}.occurrence_id`,
      ),
      route_record_id: nonempty(
        candidate.route_record_id,
        `${itemPath}.route_record_id`,
      ),
      treatment_record_id: nonempty(
        candidate.treatment_record_id,
        `${itemPath}.treatment_record_id`,
      ),
    };
    const candidateKey = nonempty(
      candidate.candidate_key,
      `${itemPath}.candidate_key`,
    );
    if (candidateKey !== extentDecisionKey(key)) {
      throw new Error(`${itemPath}.candidate_key: key mismatch`);
    }
    const blockedSurfaces = sortedStrings(
      candidate.blocked_surfaces,
      `${itemPath}.blocked_surfaces`,
      false,
    ) as MemberLedgerSurface[];
    const resolvedSurfaces = sortedStrings(
      candidate.resolved_surfaces,
      `${itemPath}.resolved_surfaces`,
    ) as MemberLedgerSurface[];
    const surfaces = [...blockedSurfaces, ...resolvedSurfaces];
    if (
      surfaces.some((surface) =>
        surface !== "member_extent" && surface !== "member_grain"
      ) ||
      new Set(surfaces).size !== surfaces.length ||
      [...surfaces].sort().join("\0") !==
        ["member_extent", "member_grain"].sort().join("\0")
    ) {
      throw new Error(`${itemPath}: blocked/resolved surfaces must partition both ledgers`);
    }
    const gapCodes = uniqueStrings(
      candidate.gap_codes,
      `${itemPath}.gap_codes`,
      false,
    ).sort();
    const expectedVerdict = `blocked_upstream:${gapCodes.join("+")}`;
    const handling = object(
      candidate.prospective_ledger_handling,
      `${itemPath}.prospective_ledger_handling`,
    );
    exactKeys(
      handling,
      new Set(blockedSurfaces),
      `${itemPath}.prospective_ledger_handling`,
    );
    if (blockedSurfaces.some((surface) =>
      handling[surface] !== expectedVerdict
    )) {
      throw new Error(
        `${itemPath}.prospective_ledger_handling: blocked verdict drifted`,
      );
    }
    if (
      candidate.contract !== "member-evidence-source-gap-block-receipt-v1" ||
      candidate.semantic_verdict !== "blocked_upstream" ||
      candidate.literal_exact_absence !== false ||
      candidate.source_statement_present !== true ||
      candidate.absence_projection_prohibited_for_unresolved_grain !== true ||
      candidate.authorizes_decision_persistence !== false ||
      candidate.authorizes_occurrence !== false ||
      candidate.authorizes_study !== false ||
      candidate.authorizes_cross_product !== false
    ) {
      throw new Error(`${itemPath}: source-gap candidate semantics drifted`);
    }
    const comparisonReceiptAnchor = nonempty(
      candidate.comparison_receipt_anchor,
      `${itemPath}.comparison_receipt_anchor`,
    );
    if (
      comparisonReceiptAnchor !==
        `${comparisonReceipt.source_id}#candidate=${candidateKey}`
    ) {
      throw new Error(
        `${itemPath}.comparison_receipt_anchor: receipt identity mismatch`,
      );
    }
    return {
      ...key,
      candidate_key: candidateKey,
      blocked_surfaces: blockedSurfaces,
      resolved_surfaces: resolvedSurfaces,
      gap_codes: gapCodes,
      prospective_ledger_handling: handling as Record<string, string>,
      source_statement_evidence_id: nonempty(
        candidate.source_statement_evidence_id,
        `${itemPath}.source_statement_evidence_id`,
      ),
    };
  });
  const candidateKeys = candidates.map((candidate) =>
    candidate.candidate_key
  );
  if (new Set(candidateKeys).size !== candidateKeys.length) {
    throw new Error(`${path}.candidates: keys must be unique`);
  }
  const candidateCount = nonnegativeInteger(
    parsed.candidate_count,
    `${path}.candidate_count`,
  );
  const candidateKeySha256 = exactSha256(
    parsed.candidate_key_sha256,
    `${path}.candidate_key_sha256`,
  );
  if (
    candidateCount !== candidates.length ||
    candidateKeySha256 !== sortedKeyHash(candidateKeys)
  ) {
    throw new Error(`${path}: candidate count or key hash drifted`);
  }
  return {
    receipt_id: nonempty(parsed.receipt_id, `${path}.receipt_id`),
    source_id: sourceId,
    candidate_count: candidateCount,
    candidate_key_sha256: candidateKeySha256,
    candidates,
    comparison_receipt: comparisonReceipt,
  };
}

function parseStrictSourceGapAcceptance(
  value: unknown,
  path: string,
): StrictSourceGapAcceptance {
  const parsed = object(value, path);
  exactKeys(parsed, acceptanceFields, path);
  if (
    parsed.schema_version !== MEMBER_EXTENT_LEDGER_SCHEMA_VERSION ||
    parsed.reviewer_result !== "APPROVE/APPROVE" ||
    parsed.authorizes_decision_persistence !== true ||
    parsed.authorizes_occurrence !== false ||
    parsed.authorizes_study !== false ||
    parsed.authorizes_cross_product !== false ||
    parsed.authorizes_ontology !== false ||
    parsed.authorizes_corrections !== false
  ) {
    throw new Error(
      `${path}: acceptance must authorize only decision persistence`,
    );
  }
  nonempty(parsed.acceptance_id, `${path}.acceptance_id`);
  nonempty(parsed.acceptance_basis, `${path}.acceptance_basis`);
  nonempty(parsed.authorization_state, `${path}.authorization_state`);
  const artifacts = object(parsed.artifacts, `${path}.artifacts`);
  exactKeys(artifacts, acceptanceArtifactFields, `${path}.artifacts`);
  const comparisonReceipt = strictArtifactOrEvidenceReceiptRef(
    artifacts.comparison_receipt,
    `${path}.artifacts.comparison_receipt`,
  );
  const draft = strictArtifactRef(
    artifacts.draft,
    `${path}.artifacts.draft`,
  );
  const evidence = strictArtifactRef(
    artifacts.evidence,
    `${path}.artifacts.evidence`,
  );
  const sourceGapReceipt = strictArtifactOrEvidenceReceiptRef(
    artifacts.source_gap_block_receipt,
    `${path}.artifacts.source_gap_block_receipt`,
  );
  const gate = strictArtifactRef(parsed.gate, `${path}.gate`);
  const persistence = object(
    parsed.authorized_exact_persistence,
    `${path}.authorized_exact_persistence`,
  );
  exactKeys(
    persistence,
    acceptedPersistenceFields,
    `${path}.authorized_exact_persistence`,
  );
  for (const field of [
    "decision_candidate_key_sha256",
    "extent_decision_id_sha256",
    "grain_decision_id_sha256",
    "source_gap_candidate_key_sha256",
  ] as const) {
    exactSha256(
      persistence[field],
      `${path}.authorized_exact_persistence.${field}`,
    );
  }
  const persistenceCounts = Object.fromEntries([
    "decision_candidate_count",
    "extent_blocked_upstream_count",
    "extent_decision_count",
    "extent_resolved_count",
    "grain_blocked_upstream_count",
    "grain_decision_count",
    "grain_resolved_count",
    "source_gap_overlay_count",
  ].map((field) => [
    field,
    nonnegativeInteger(
      persistence[field],
      `${path}.authorized_exact_persistence.${field}`,
    ),
  ])) as Record<
    | "decision_candidate_count"
    | "extent_blocked_upstream_count"
    | "extent_decision_count"
    | "extent_resolved_count"
    | "grain_blocked_upstream_count"
    | "grain_decision_count"
    | "grain_resolved_count"
    | "source_gap_overlay_count",
    number
  >;
  const preservation = object(
    parsed.preservation_invariants,
    `${path}.preservation_invariants`,
  );
  const preservationFields = "q89_remains_blocked_upstream" in preservation
    ? q89AcceptancePreservationFields
    : acceptancePreservationFields;
  exactKeys(
    preservation,
    preservationFields,
    `${path}.preservation_invariants`,
  );
  if (Object.values(preservation).some((value) => value !== true)) {
    throw new Error(`${path}.preservation_invariants: every invariant is required`);
  }
  const verdictDistribution = object(
    parsed.verdict_distribution,
    `${path}.verdict_distribution`,
  );
  const verdictFields =
    "source_gap_block_receipt" in verdictDistribution ||
      "positive_extent_proposed_grain_blocked" in verdictDistribution
      ? acceptanceVerdictFields
      : compactAcceptanceVerdictFields;
  const compactAcceptance = verdictFields === compactAcceptanceVerdictFields;
  exactKeys(
    verdictDistribution,
    verdictFields,
    `${path}.verdict_distribution`,
  );
  const decodedVerdictDistribution = Object.fromEntries(
    [...verdictFields].map((field) => [
      field,
      nonnegativeInteger(
        verdictDistribution[field],
        `${path}.verdict_distribution.${field}`,
      ),
    ]),
  );
  const candidateCount = nonnegativeInteger(
    parsed.candidate_count,
    `${path}.candidate_count`,
  );
  if (compactAcceptance) {
    const positive =
      decodedVerdictDistribution.positive_extent_and_grain_proposed!;
    const blocked =
      decodedVerdictDistribution.source_gap_blocked_extent_and_grain!;
    const exactAbsence = decodedVerdictDistribution.exact_absence!;
    if (
      persistenceCounts.decision_candidate_count !== positive ||
      persistenceCounts.extent_decision_count !== positive ||
      persistenceCounts.extent_resolved_count !== positive ||
      persistenceCounts.grain_decision_count !== positive ||
      persistenceCounts.grain_resolved_count !== positive ||
      persistenceCounts.source_gap_overlay_count !== blocked ||
      persistenceCounts.extent_blocked_upstream_count !== blocked ||
      persistenceCounts.grain_blocked_upstream_count !== blocked ||
      candidateCount !== positive + blocked + exactAbsence
    ) {
      throw new Error(
        `${path}: compact acceptance persistence counts do not reconcile`,
      );
    }
  }
  return {
    accepted_at: nonempty(parsed.accepted_at, `${path}.accepted_at`),
    accepted_by: nonempty(parsed.accepted_by, `${path}.accepted_by`),
    candidate_count: candidateCount,
    candidate_key_sha256: exactSha256(
      parsed.candidate_key_sha256,
      `${path}.candidate_key_sha256`,
    ),
    reviewer_result: "APPROVE/APPROVE",
    artifacts: {
      comparison_receipt: comparisonReceipt,
      draft,
      evidence,
      source_gap_block_receipt: sourceGapReceipt,
    },
    gate,
    authorized_exact_persistence: {
      decision_candidate_count:
        persistenceCounts.decision_candidate_count,
      extent_decision_count: persistenceCounts.extent_decision_count,
      extent_resolved_count: persistenceCounts.extent_resolved_count,
      source_gap_overlay_count: persistenceCounts.source_gap_overlay_count,
      source_gap_candidate_key_sha256:
        persistence.source_gap_candidate_key_sha256 as string,
      extent_blocked_upstream_count:
        persistenceCounts.extent_blocked_upstream_count,
      grain_decision_count: persistenceCounts.grain_decision_count,
      grain_resolved_count: persistenceCounts.grain_resolved_count,
      grain_blocked_upstream_count:
        persistenceCounts.grain_blocked_upstream_count,
    },
    verdict_distribution: decodedVerdictDistribution,
  };
}

function assertPinnedAcceptanceChain(input: {
  overlay: MemberSourceGapOverlay;
  receipt: StrictSourceGapReceipt;
  acceptance: StrictSourceGapAcceptance;
  root: string;
  path: string;
}): void {
  const { overlay, receipt, acceptance, root, path } = input;
  const sourceRef = acceptance.artifacts.source_gap_block_receipt;
  if (
    overlay.source_receipt.path !== sourceRef.path ||
    overlay.source_receipt.sha256 !== sourceRef.sha256 ||
    overlay.source_receipt.receipt_id !== receipt.receipt_id ||
    receipt.comparison_receipt.path !==
      acceptance.artifacts.comparison_receipt.path ||
    receipt.comparison_receipt.sha256 !==
      acceptance.artifacts.comparison_receipt.sha256 ||
    overlay.accepted_at !== acceptance.accepted_at ||
    overlay.accepted_by !== acceptance.accepted_by
  ) {
    throw new Error(`${path}: overlay provenance does not match acceptance`);
  }
  const overlayKeys = overlay.entries.map((entry) => entry.candidate_key);
  const extentBlocked = overlay.entries.filter((entry) =>
    entry.blocked_surfaces.includes("member_extent")
  ).length;
  const grainBlocked = overlay.entries.filter((entry) =>
    entry.blocked_surfaces.includes("member_grain")
  ).length;
  const authorized = acceptance.authorized_exact_persistence;
  if (
    authorized.source_gap_overlay_count !== overlay.entries.length ||
    authorized.source_gap_candidate_key_sha256 !==
      sortedKeyHash(overlayKeys) ||
    authorized.extent_blocked_upstream_count !== extentBlocked ||
    authorized.grain_blocked_upstream_count !== grainBlocked ||
    (acceptance.verdict_distribution.source_gap_block_receipt ??
      acceptance.verdict_distribution
        .source_gap_blocked_extent_and_grain) !== overlay.entries.length ||
    acceptance.verdict_distribution.source_gap_blocked_extent_and_grain !==
      extentBlocked ||
    acceptance.verdict_distribution.exact_absence !== 0
  ) {
    throw new Error(`${path}: acceptance does not pin the exact overlay scope`);
  }

  const receiptByKey = new Map(receipt.candidates.map((candidate) => [
    candidate.candidate_key,
    candidate,
  ]));
  if (
    receipt.candidate_count !== overlay.entries.length ||
    receipt.candidate_key_sha256 !== sortedKeyHash(overlayKeys) ||
    receiptByKey.size !== overlay.entries.length
  ) {
    throw new Error(`${path}: source-gap receipt and overlay coverage differ`);
  }
  for (const entry of overlay.entries) {
    const candidate = receiptByKey.get(entry.candidate_key);
    if (
      !candidate ||
      candidate.occurrence_id !== entry.occurrence_id ||
      candidate.route_record_id !== entry.route_record_id ||
      candidate.treatment_record_id !== entry.treatment_record_id ||
      stableJson(candidate.gap_codes as JsonValue) !==
        stableJson(entry.missing_roles as JsonValue) ||
      stableJson(candidate.blocked_surfaces as JsonValue) !==
        stableJson(entry.blocked_surfaces as JsonValue) ||
      candidate.source_statement_evidence_id !==
        entry.source_statement_evidence_id ||
      candidate.prospective_ledger_handling[
        entry.blocked_surfaces[0]!
      ] !== entry.verdict ||
      entry.blocked_surfaces.some((surface) =>
        candidate.prospective_ledger_handling[surface] !== entry.verdict
      )
    ) {
      throw new Error(
        `${path}: overlay entry does not exactly match receipt candidate ` +
          entry.candidate_key,
      );
    }
  }

  const comparisonReceipt = readPinnedNormalJson(
    root,
    acceptance.artifacts.comparison_receipt,
    `${path}.acceptance.artifacts.comparison_receipt`,
  );
  const draft = readPinnedNormalJson(
    root,
    acceptance.artifacts.draft,
    `${path}.acceptance.artifacts.draft`,
  );
  const evidence = object(
    readPinnedNormalJson(
      root,
      acceptance.artifacts.evidence,
      `${path}.acceptance.artifacts.evidence`,
    ),
    `${path}.acceptance.artifacts.evidence`,
  );
  const evidenceReceipt = strictEvidenceReceiptRef(
    evidence.source_gap_block_receipt,
    `${path}.acceptance.artifacts.evidence.source_gap_block_receipt`,
  );
  const evidenceComparisonReceipt = strictEvidenceReceiptRef(
    evidence.comparison_receipt,
    `${path}.acceptance.artifacts.evidence.comparison_receipt`,
  );
  if (
    evidence.schema_version !== MEMBER_EXTENT_LEDGER_SCHEMA_VERSION ||
    evidence.candidate_count !== acceptance.candidate_count ||
    evidence.candidate_key_sha256 !== acceptance.candidate_key_sha256 ||
    evidenceReceipt.path !== overlay.source_receipt.path ||
    evidenceReceipt.sha256 !== overlay.source_receipt.sha256 ||
    evidenceReceipt.receipt_id !== overlay.source_receipt.receipt_id ||
    evidenceReceipt.source_id !== receipt.source_id ||
    stableJson(evidenceComparisonReceipt as unknown as JsonValue) !==
      stableJson(receipt.comparison_receipt as unknown as JsonValue)
  ) {
    throw new Error(`${path}: pinned evidence does not bind this overlay`);
  }
  assertPinnedReceiptIdentity(
    comparisonReceipt,
    receipt.comparison_receipt,
    `${path}.acceptance.artifacts.comparison_receipt`,
    comparisonReceiptFields,
  );
  assertPinnedReceiptIdentity(
    readPinnedNormalJson(
      root,
      sourceRef,
      `${path}.acceptance.artifacts.source_gap_block_receipt`,
    ),
    evidenceReceipt,
    `${path}.acceptance.artifacts.source_gap_block_receipt`,
    sourceGapReceiptFields,
  );
  const gate = object(
    readPinnedNormalJson(
      root,
      acceptance.gate,
      `${path}.acceptance.gate`,
    ),
    `${path}.acceptance.gate`,
  );
  if (
    gate.schema_version !== MEMBER_EXTENT_LEDGER_SCHEMA_VERSION ||
    gate.candidate_count !== acceptance.candidate_count ||
    gate.candidate_key_sha256 !== acceptance.candidate_key_sha256 ||
    gate.reviewer_result !== acceptance.reviewer_result ||
    stableJson(gate.verdict_distribution as JsonValue) !==
      stableJson(acceptance.verdict_distribution as JsonValue) ||
    gate.authorizes_decision_persistence !== false ||
    gate.authorizes_occurrence !== false ||
    gate.authorizes_study !== false ||
    gate.authorizes_cross_product !== false ||
    gate.authorizes_ontology !== false ||
    gate.authorizes_corrections !== false
  ) {
    throw new Error(`${path}: pinned gate semantics drifted`);
  }
  nonempty(gate.gate_id, `${path}.acceptance.gate.gate_id`);
  nonempty(gate.reviewed_commit, `${path}.acceptance.gate.reviewed_commit`);
  verifyDeclaredPathPins(
    comparisonReceipt,
    root,
    `${path}.acceptance.artifacts.comparison_receipt`,
  );
  verifyDeclaredPathPins(
    draft,
    root,
    `${path}.acceptance.artifacts.draft`,
  );
  verifyDeclaredPathPins(
    evidence,
    root,
    `${path}.acceptance.artifacts.evidence`,
  );
  verifyDeclaredPathPins(gate, root, `${path}.acceptance.gate`);
}

function sourceGapOverlayJsonFiles(
  directory: string,
  root: string,
): string[] {
  if (!existsSync(directory)) return [];
  const rootReal = realpathSync(root);
  const directoryPath = resolve(directory);
  pathWithinRoot(resolve(root), directoryPath, directory);
  const directoryStat = lstatSync(directoryPath);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error(`${directory}: overlay directory must be a normal directory`);
  }
  pathWithinRoot(rootReal, realpathSync(directoryPath), directory);
  const visit = (path: string): string[] =>
    readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
      const child = join(path, entry.name);
      const stat = lstatSync(child);
      if (stat.isSymbolicLink()) {
        throw new Error(`${child}: source-gap overlay paths cannot be symlinks`);
      }
      if (stat.isDirectory()) return visit(child);
      return stat.isFile() && extname(entry.name) === ".json" ? [child] : [];
    });
  return visit(directoryPath).sort();
}

export function loadMemberSourceGapOverlays(
  directories: readonly string[],
  provenanceRoot = repoRoot,
): VerifiedMemberSourceGapOverlay[] {
  const overlays = directories.flatMap((directory) =>
    sourceGapOverlayJsonFiles(directory, provenanceRoot).map((path) => {
      const overlay = parseSourceGapOverlay(
        JSON.parse(readFileSync(path, "utf8")) as unknown,
        path,
      );
      const sourceReceiptValue = readPinnedNormalJson(
        provenanceRoot,
        overlay.source_receipt,
        `${path}.source_receipt`,
      );
      const receipt = parseStrictSourceGapReceipt(
        sourceReceiptValue,
        `${path}.source_receipt`,
      );
      verifyDeclaredPathPins(
        sourceReceiptValue,
        provenanceRoot,
        `${path}.source_receipt`,
      );
      const acceptanceValue = readPinnedNormalJson(
        provenanceRoot,
        overlay.owner_acceptance,
        `${path}.owner_acceptance`,
      );
      const acceptance = parseStrictSourceGapAcceptance(
        acceptanceValue,
        `${path}.owner_acceptance`,
      );
      verifyDeclaredPathPins(
        acceptanceValue,
        provenanceRoot,
        `${path}.owner_acceptance`,
      );
      assertPinnedAcceptanceChain({
        overlay,
        receipt,
        acceptance,
        root: provenanceRoot,
        path,
      });
      return markVerifiedSourceGapOverlay(overlay);
    })
  );
  const ids = new Set<string>();
  const coverage = new Set<string>();
  for (const overlay of overlays) {
    if (ids.has(overlay.overlay_id)) {
      throw new Error(`duplicate source-gap overlay id ${overlay.overlay_id}`);
    }
    ids.add(overlay.overlay_id);
    for (const entry of overlay.entries) {
      for (const surface of entry.blocked_surfaces) {
        const coverageKey = `${surface}\0${entry.candidate_key}`;
        if (coverage.has(coverageKey)) {
          throw new Error(`duplicate source-gap coverage ${coverageKey}`);
        }
        coverage.add(coverageKey);
      }
    }
  }
  return overlays.sort((left, right) =>
    left.overlay_id.localeCompare(right.overlay_id)
  );
}

function readCompanion(path: string): MemberExtentRow[] {
  const rows = readFileSync(path, "utf8").split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    const raw = JSON.parse(line) as unknown;
    if (stableJson(raw as JsonValue) !== line) throw new Error(`${path}:${index + 1}: expected stable JSON`);
    return [raw as MemberExtentRow];
  });
  const keys = new Set<string>();
  for (const row of rows) {
    const key = extentDecisionKey(row);
    if (keys.has(key)) throw new Error(`${path}: duplicate companion key ${key}`);
    keys.add(key);
    if (row.authorizes_study !== false || row.authorizes_cross_product !== false) {
      throw new Error(`${path}: companion rows cannot authorize study or cross-product projection`);
    }
    if (!MEMBER_EXTENT_KINDS.includes(row.extent)) throw new Error(`${path}: invalid extent ${row.extent}`);
    validateMemberExtentDecision({
      decision_id: row.decision_id ?? `unreviewed:${row.extent_id}`,
      occurrence_id: row.occurrence_id,
      route_record_id: row.route_record_id,
      treatment_record_id: row.treatment_record_id,
      resolution: row.extent,
      components: row.components,
      evidence_bindings: row.evidence_bindings,
      missing_roles: row.missing_roles,
      rationale: row.rationale,
      reviewed_at: "1970-01-01",
      reviewed_by: "companion-validator",
    });
    if (row.extent !== "unresolved" && !row.decision_id) {
      throw new Error(`${path}: positive companion row ${key} lacks a decision id`);
    }
  }
  return rows.sort((left, right) => extentDecisionKey(left).localeCompare(extentDecisionKey(right)));
}

function readOccurrenceMemberKeys(path: string): MemberExtentKey[] {
  const keys = readFileSync(path, "utf8").split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    const itemPath = `${path}:${index + 1}`;
    const occurrence = object(JSON.parse(line) as unknown, itemPath);
    const occurrenceId = nonempty(occurrence.occurrence_id, `${itemPath}.occurrence_id`);
    if (!Array.isArray(occurrence.routes) || occurrence.routes.length === 0) {
      throw new Error(`${itemPath}.routes: expected non-empty array`);
    }
    const routes = occurrence.routes.map((value, routeIndex) => {
      const route = object(value, `${itemPath}.routes[${routeIndex}]`);
      return nonempty(route.route_record_id, `${itemPath}.routes[${routeIndex}].route_record_id`);
    });
    const treatment = object(occurrence.treatment, `${itemPath}.treatment`);
    const kind = nonempty(treatment.kind, `${itemPath}.treatment.kind`);
    const members = kind === "atomic"
      ? [object(treatment.member, `${itemPath}.treatment.member`)]
      : kind === "bundle" && Array.isArray(treatment.members) && treatment.members.length > 0
        ? treatment.members.map((value, memberIndex) =>
          object(value, `${itemPath}.treatment.members[${memberIndex}]`))
        : (() => {
          throw new Error(`${itemPath}.treatment: expected atomic member or non-empty bundle members`);
        })();
    const treatmentIds = members.map((member, memberIndex) =>
      nonempty(
        member.treatment_record_id,
        `${itemPath}.treatment.members[${memberIndex}].treatment_record_id`,
      ));
    return routes.flatMap((routeRecordId) => treatmentIds.map((treatmentRecordId) => ({
      occurrence_id: occurrenceId,
      route_record_id: routeRecordId,
      treatment_record_id: treatmentRecordId,
    })));
  }).sort((left, right) => extentDecisionKey(left).localeCompare(extentDecisionKey(right)));
  if (new Set(keys.map(extentDecisionKey)).size !== keys.length) {
    throw new Error(`${path}: duplicate occurrence/route/treatment member key`);
  }
  return keys;
}

function packetIndex(path: string | undefined): Map<string, string> {
  const output = new Map<string, string>();
  if (!path || !existsSync(path)) return output;
  for (const [index, line] of readFileSync(path, "utf8").split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    const packet = object(JSON.parse(line) as unknown, `${path}:${index + 1}`);
    const packetId = nonempty(packet.packet_id, `${path}:${index + 1}.packet_id`);
    if (!Array.isArray(packet.member_extents)) continue;
    for (const member of packet.member_extents) {
      const key = extentDecisionKey(member as MemberExtentKey);
      const existing = output.get(key);
      if (existing && existing !== packetId) throw new Error(`${path}: duplicate packet coverage for ${key}`);
      output.set(key, packetId);
    }
  }
  return output;
}

function dossierRefs(artifacts: readonly ScheduleDossierArtifact[]): Map<string, MemberExtentDossierRef[]> {
  const output = new Map<string, MemberExtentDossierRef[]>();
  for (const { artifact, dossier } of artifacts) {
    if (!dossier.route_id || !Array.isArray(dossier.query_receipts) || dossier.query_receipts.length === 0) {
      throw new Error(`${artifact}: malformed schedule-diff dossier receipts`);
    }
    const receiptRefs = [...dossier.query_receipts].sort((left, right) =>
      left.snapshot_id.localeCompare(right.snapshot_id));
    const refs: MemberExtentDossierRef[] = [];
    for (const diff of dossier.direction_diffs) {
      for (const [change, stops] of [
        ["added", diff.timepoint_stops_added],
        ["removed", diff.timepoint_stops_removed],
      ] as const) {
        for (const stop of stops) refs.push({
          artifact,
          fact_kind: "stop_identity",
          direction: diff.direction,
          change,
          identifiers: [stop.stop_id],
          receipt_refs: receiptRefs,
          evidence_scope: "route_context_only_nonexclusive",
          satisfies_missing_role: false,
          limitations: [
            "nonexclusive_route_context",
            "not_treatment_aligned",
            "timepoint_only_nonexhaustive",
          ],
        });
      }
      for (const before of diff.trips_per_period_before) {
        const after = diff.trips_per_period_after.find((candidate) => candidate.period === before.period);
        if (!after || stableJson(after as unknown as JsonValue) === stableJson(before as unknown as JsonValue)) continue;
        refs.push({
          artifact,
          fact_kind: "scope_modality",
          direction: diff.direction,
          change: "period_delta",
          identifiers: [
            `after:${after.trip_count}`, `before:${before.trip_count}`, `period:${before.period}`,
          ].sort(),
          receipt_refs: receiptRefs,
          evidence_scope: "route_context_only_nonexclusive",
          satisfies_missing_role: false,
          limitations: [
            "may_include_non_revenue_trips",
            "nonexclusive_route_context",
            "not_treatment_aligned",
          ],
        });
      }
    }
    for (const segment of dossier.correspondence_segments) {
      const identifiers = segment.boundary_stops.map((stop) => stop.stop_id).sort();
      if (identifiers.length > 0) refs.push({
        artifact,
        fact_kind: "bounded_scope_identity",
        direction: segment.direction,
        change: "boundary",
        identifiers,
        receipt_refs: receiptRefs,
        evidence_scope: "route_context_only_nonexclusive",
        satisfies_missing_role: false,
        limitations: [
          "nonexclusive_route_context",
          "not_treatment_aligned",
          "timepoint_only_nonexhaustive",
        ],
      });
    }
    for (const remainder of dossier.new_route_remainder) {
      const identifiers = remainder.timepoint_stops.map((stop) => stop.stop_id).sort();
      if (identifiers.length > 0) refs.push({
        artifact,
        fact_kind: "bounded_scope_identity",
        direction: remainder.direction,
        change: "remainder",
        identifiers,
        receipt_refs: receiptRefs,
        evidence_scope: "route_context_only_nonexclusive",
        satisfies_missing_role: false,
        limitations: [
          "nonexclusive_route_context",
          "not_treatment_aligned",
          "timepoint_only_nonexhaustive",
        ],
      });
    }
    const deduped = [...new Map(refs.map((ref) =>
      [stableJson(ref as unknown as JsonValue), ref])).values()]
      .sort((left, right) => stableJson(left as unknown as JsonValue)
        .localeCompare(stableJson(right as unknown as JsonValue)));
    output.set(dossier.route_id.toUpperCase(), deduped);
  }
  return output;
}

function relevantDossierRefs(
  row: MemberExtentRow,
  refs: ReadonlyMap<string, MemberExtentDossierRef[]>,
): MemberExtentDossierRef[] {
  const roles = new Set(row.missing_roles);
  return (refs.get(row.gtfs_route_id.toUpperCase()) ?? []).filter((ref) =>
    roles.has(ref.fact_kind as MemberExtentMissingRole));
}

function absenceIndex(
  receipts: readonly MemberExtentAbsenceReceipt[],
  denominator: ReadonlySet<string>,
): Map<string, MemberExtentAbsenceReceipt> {
  const output = new Map<string, MemberExtentAbsenceReceipt>();
  const receiptIds = new Set<string>();
  for (const receipt of receipts) {
    if (receiptIds.has(receipt.receipt_id)) throw new Error(`duplicate absence receipt id ${receipt.receipt_id}`);
    receiptIds.add(receipt.receipt_id);
    for (const key of receipt.extent_keys.map(extentDecisionKey)) {
      if (!denominator.has(key)) throw new Error(`${receipt.receipt_id}: absence receipt has orphan extent key ${key}`);
      for (const surface of receipt.surfaces) {
        const coverageKey = `${surface}\0${key}`;
        if (output.has(coverageKey)) throw new Error(`duplicate absence coverage ${coverageKey}`);
        output.set(coverageKey, receipt);
      }
    }
  }
  return output;
}

type IndexedSourceGap = {
  overlay: VerifiedMemberSourceGapOverlay;
  entry: MemberSourceGapOverlayEntry;
};

function sourceGapIndex(
  overlays: readonly VerifiedMemberSourceGapOverlay[],
  denominator: ReadonlySet<string>,
): Map<string, IndexedSourceGap> {
  const output = new Map<string, IndexedSourceGap>();
  for (const overlay of overlays) {
    for (const entry of overlay.entries) {
      if (!denominator.has(entry.candidate_key)) {
        throw new Error(
          `${overlay.overlay_id}: source-gap overlay has orphan key ` +
            entry.candidate_key,
        );
      }
      for (const surface of entry.blocked_surfaces) {
        const coverageKey = `${surface}\0${entry.candidate_key}`;
        if (output.has(coverageKey)) {
          throw new Error(`duplicate source-gap coverage ${coverageKey}`);
        }
        output.set(coverageKey, { overlay, entry });
      }
    }
  }
  return output;
}

export function buildMemberExtentLedgers(input: {
  companionRows: readonly MemberExtentRow[];
  extentDecisions?: readonly MemberExtentDecision[];
  grainDecisions?: readonly MemberGrainDecision[];
  absenceReceipts?: readonly MemberExtentAbsenceReceipt[];
  sourceGapOverlays?: readonly VerifiedMemberSourceGapOverlay[];
  dossierArtifacts?: readonly ScheduleDossierArtifact[];
  packetIds?: ReadonlyMap<string, string>;
  expectedMemberKeys?: readonly MemberExtentKey[];
  grainBlockReceipts?: readonly MemberGrainBlockReceipt[];
}): { extentRows: MemberExtentLedgerRow[]; grainRows: MemberGrainLedgerRow[] } {
  const companion = [...input.companionRows].sort((left, right) =>
    extentDecisionKey(left).localeCompare(extentDecisionKey(right)));
  const denominator = new Set(companion.map(extentDecisionKey));
  if (denominator.size !== companion.length) throw new Error("duplicate companion denominator key");
  if (input.expectedMemberKeys) {
    const expected = new Set(input.expectedMemberKeys.map(extentDecisionKey));
    if (expected.size !== input.expectedMemberKeys.length) {
      throw new Error("duplicate current occurrence denominator key");
    }
    const missing = [...expected].filter((key) => !denominator.has(key)).sort();
    const unexpected = [...denominator].filter((key) => !expected.has(key)).sort();
    if (missing.length > 0 || unexpected.length > 0) {
      throw new Error(
        `companion denominator does not match current occurrence denominator: ` +
        `missing=${missing.length}, unexpected=${unexpected.length}`,
      );
    }
  }
  for (const row of companion) {
    if (row.authorizes_study !== false || row.authorizes_cross_product !== false) {
      throw new Error(`${extentDecisionKey(row)}: companion rows cannot carry authority`);
    }
  }
  const parsedExtentDecisions = (input.extentDecisions ?? [])
    .map((decision, index) => parseExtentDecision(decision, `extentDecisions[${index}]`));
  const parsedGrainDecisions = (input.grainDecisions ?? [])
    .map((decision, index) => parseMemberGrainDecision(decision, `grainDecisions[${index}]`));
  const parsedReceipts = (input.absenceReceipts ?? [])
    .map((receipt, index) => parseAbsenceReceipt(receipt, `absenceReceipts[${index}]`));
  const parsedSourceGapOverlays = (input.sourceGapOverlays ?? [])
    .map((overlay, index) => {
      assertVerifiedSourceGapOverlay(
        overlay,
        `sourceGapOverlays[${index}]`,
      );
      return overlay;
    });
  const extentDecisions = new Map<string, MemberExtentDecision>();
  const grainDecisions = new Map<string, MemberGrainDecision>();
  const decisionIds = new Set<string>();
  for (const decision of parsedExtentDecisions) {
    const key = extentDecisionKey(decision);
    if (extentDecisions.has(key) || decisionIds.has(decision.decision_id)) {
      throw new Error(`duplicate extent decision ${decision.decision_id}`);
    }
    extentDecisions.set(key, decision);
    decisionIds.add(decision.decision_id);
  }
  decisionIds.clear();
  for (const decision of parsedGrainDecisions) {
    const key = memberGrainDecisionKey(decision);
    if (grainDecisions.has(key) || decisionIds.has(decision.decision_id)) {
      throw new Error(`duplicate grain decision ${decision.decision_id}`);
    }
    grainDecisions.set(key, decision);
    decisionIds.add(decision.decision_id);
  }
  for (const key of [...extentDecisions.keys(), ...grainDecisions.keys()]) {
    if (!denominator.has(key)) throw new Error(`orphan decision key ${key}`);
  }
  const absences = absenceIndex(parsedReceipts, denominator);
  const sourceGaps = sourceGapIndex(parsedSourceGapOverlays, denominator);
  const grainBlocks = new Map<string, {
    receipt: MemberGrainBlockReceipt;
    binding: MemberGrainBlockReceipt["bindings"][number];
  }>();
  for (const receipt of input.grainBlockReceipts ?? []) {
    for (const binding of receipt.bindings) {
      const key = memberGrainBlockKey(binding);
      if (!denominator.has(key)) {
        throw new Error(`${receipt.receipt_id}: orphan grain-block binding ${key}`);
      }
      if (grainBlocks.has(key)) {
        throw new Error(`${receipt.receipt_id}: duplicate grain-block binding ${key}`);
      }
      grainBlocks.set(key, { receipt, binding });
    }
  }
  const dossierIndex = dossierRefs(input.dossierArtifacts ?? []);
  const extentRows = companion.map((current) => {
    const key = extentDecisionKey(current);
    const overlay = extentDecisions.get(key);
    if (overlay && current.extent !== "unresolved") {
      const currentProjection = {
        decision_id: current.decision_id,
        resolution: current.extent,
        components: current.components,
        evidence_bindings: current.evidence_bindings,
        missing_roles: current.missing_roles,
        rationale: current.rationale,
      };
      const acceptedProjection = {
        decision_id: overlay.decision_id,
        resolution: overlay.resolution,
        components: overlay.components,
        evidence_bindings: overlay.evidence_bindings,
        missing_roles: overlay.missing_roles,
        rationale: overlay.rationale,
      };
      if (stableJson(currentProjection as unknown as JsonValue) !==
          stableJson(acceptedProjection as unknown as JsonValue)) {
        throw new Error(`${overlay.decision_id}: external extent decision conflicts with materialized positive row`);
      }
    }
    const absence = absences.get(`member_extent\0${key}`);
    const sourceGap = sourceGaps.get(`member_extent\0${key}`);
    if (absence && sourceGap) {
      throw new Error(`${key}: absence and source-gap overlays conflict`);
    }
    if (absence && (overlay || current.extent !== "unresolved")) {
      throw new Error(`${absence.receipt_id}: absence conflicts with a positive spatial decision`);
    }
    if (sourceGap && (overlay || current.extent !== "unresolved")) {
      throw new Error(
        `${sourceGap.overlay.overlay_id}: source gap conflicts with a ` +
          "positive spatial decision",
      );
    }
    const resolvedKind = overlay?.resolution ?? current.extent;
    const decisionId = overlay?.decision_id ?? current.decision_id;
    return {
      schema_version: MEMBER_EXTENT_LEDGER_SCHEMA_VERSION,
      contract_id: MEMBER_EXTENT_LEDGER_CONTRACT_ID,
      ledger_id: `member-extent-ledger:${stableHash({
        occurrence_id: current.occurrence_id,
        route_record_id: current.route_record_id,
        treatment_record_id: current.treatment_record_id,
      } as JsonValue).slice(0, 24)}`,
      occurrence_id: current.occurrence_id,
      route_record_id: current.route_record_id,
      gtfs_route_id: current.gtfs_route_id,
      treatment_record_id: current.treatment_record_id,
      treatment_family: current.treatment_family,
      current_extent_kind: resolvedKind,
      missing_roles: overlay?.missing_roles ?? current.missing_roles,
      dossier_refs: relevantDossierRefs(current, dossierIndex),
      packet_id: input.packetIds?.get(key) ?? null,
      verdict: absence
        ? "absent_in_source"
        : sourceGap
        ? sourceGap.entry.verdict
        : resolvedKind === "unresolved" ? "unreviewed" : `resolved:${resolvedKind}`,
      verdict_basis: absence
        ? `receipt:${absence.receipt_id}`
        : sourceGap
        ? `receipt:${sourceGap.overlay.source_receipt.receipt_id}`
        : resolvedKind === "unresolved" ? null : `review:${decisionId}`,
      receipt_ids: absence
        ? [absence.receipt_id]
        : sourceGap ? [sourceGap.overlay.source_receipt.receipt_id] : [],
      updated_at: absence?.reviewed_at ??
        sourceGap?.overlay.accepted_at ??
        overlay?.reviewed_at ??
        null,
      authorizes_study: false,
      authorizes_cross_product: false,
    } satisfies MemberExtentLedgerRow;
  });
  const spatialByKey = new Map(extentRows.map((row) => [extentDecisionKey(row), row]));
  const grainRows = companion.map((current) => {
    const key = extentDecisionKey(current);
    const spatial = spatialByKey.get(key)!;
    const decision = grainDecisions.get(key);
    const grainBlock = grainBlocks.get(key);
    const absence = absences.get(`member_grain\0${key}`);
    const sourceGap = sourceGaps.get(`member_grain\0${key}`);
    if (absence && sourceGap) {
      throw new Error(`${key}: absence and source-gap overlays conflict`);
    }
    if (decision && absence) throw new Error(`${key}: grain decision conflicts with absence receipt`);
    if (grainBlock) {
      if (
        !decision ||
        decision.service_scope.kind !== "unresolved" ||
        decision.decision_id !== grainBlock.binding.member_grain_decision_id ||
        decision.member_extent_decision_id !==
          grainBlock.binding.member_extent_decision_id ||
        decision.gtfs_route_id !== grainBlock.binding.gtfs_route_id ||
        stableJson(decision.service_scope.missing_roles as unknown as JsonValue) !==
          stableJson(grainBlock.binding.missing_roles as JsonValue)
      ) {
        throw new Error(
          `${grainBlock.receipt.receipt_id}: grain-block binding does not match unresolved decision ${key}`,
        );
      }
      if (absence || sourceGap) {
        throw new Error(
          `${grainBlock.receipt.receipt_id}: grain-block receipt conflicts with another receipt ${key}`,
        );
      }
    }
    if (
      sourceGap &&
      decision &&
      (
        decision.service_scope.kind !== "unresolved" ||
        stableJson(
          decision.service_scope.missing_roles as unknown as JsonValue,
        ) !== stableJson(sourceGap.entry.missing_roles as JsonValue)
      )
    ) {
      throw new Error(
        `${decision.decision_id}: grain decision conflicts with source gap`,
      );
    }
    const effectiveExtentDecisionId = extentDecisions.get(key)?.decision_id ?? current.decision_id;
    const terminalGrain = decision && decision.service_scope.kind !== "unresolved";
    if (terminalGrain &&
        (spatial.current_extent_kind === "unresolved" ||
          !spatial.verdict.startsWith("resolved:") ||
          !effectiveExtentDecisionId)) {
      throw new Error(`${decision.decision_id}: terminal grain requires a positive spatial decision`);
    }
    if (terminalGrain && !decision.member_extent_decision_id) {
      throw new Error(`${decision.decision_id}: terminal grain must name its positive spatial decision`);
    }
    if (decision?.member_extent_decision_id &&
        decision.member_extent_decision_id !== effectiveExtentDecisionId) {
      throw new Error(`${decision.decision_id}: member_extent_decision_id does not match spatial row`);
    }
    const verdict = absence
      ? "absent_in_source"
      : sourceGap
      ? sourceGap.entry.verdict
      : decision?.service_scope.kind === "not_applicable"
        ? "not_applicable"
        : decision?.service_scope.kind === "unresolved"
          ? `blocked_upstream:${decision.service_scope.missing_roles.join("+")}` as const
          : decision ? "resolved" : "unreviewed";
    return {
      schema_version: MEMBER_EXTENT_LEDGER_SCHEMA_VERSION,
      contract_id: MEMBER_GRAIN_LEDGER_CONTRACT_ID,
      ledger_id: `member-grain-ledger:${stableHash({
        occurrence_id: current.occurrence_id,
        route_record_id: current.route_record_id,
        treatment_record_id: current.treatment_record_id,
      } as JsonValue).slice(0, 24)}`,
      occurrence_id: current.occurrence_id,
      route_record_id: current.route_record_id,
      gtfs_route_id: current.gtfs_route_id,
      treatment_record_id: current.treatment_record_id,
      treatment_family: current.treatment_family,
      current_extent_kind: spatial.current_extent_kind,
      spatial_verdict: spatial.verdict,
      member_extent_decision_id: effectiveExtentDecisionId,
      service_scope: decision?.service_scope ?? null,
      lineage_segments: decision?.lineage_segments ?? [],
      evidence_bindings: decision?.evidence_bindings ?? [],
      dossier_refs: spatial.dossier_refs,
      packet_id: spatial.packet_id,
      verdict,
      verdict_basis: absence
        ? `receipt:${absence.receipt_id}`
        : sourceGap
        ? `receipt:${sourceGap.overlay.source_receipt.receipt_id}`
        : grainBlock
        ? `review:${decision!.decision_id};receipt:${grainBlock.receipt.receipt_id}`
        : decision ? `review:${decision.decision_id}` : null,
      receipt_ids: absence
        ? [absence.receipt_id]
        : sourceGap
        ? [sourceGap.overlay.source_receipt.receipt_id]
        : grainBlock ? [grainBlock.receipt.receipt_id] : [],
      updated_at: absence?.reviewed_at ??
        sourceGap?.overlay.accepted_at ??
        decision?.reviewed_at ??
        null,
      authorizes_study: false,
      authorizes_cross_product: false,
    } satisfies MemberGrainLedgerRow;
  });
  if (extentRows.length !== companion.length || grainRows.length !== companion.length) {
    throw new Error("ledger denominator parity failure");
  }
  return { extentRows, grainRows };
}

function readScheduleDossiers(directory: string, rootDir: string): ScheduleDossierArtifact[] {
  return jsonFiles(directory).map((path) => ({
    artifact: relative(rootDir, path),
    dossier: JSON.parse(readFileSync(path, "utf8")) as ScheduleDiffDossier,
  }));
}

function jsonl(rows: readonly unknown[]): string {
  return rows.map((row) => stableJson(row as JsonValue)).join("\n") + (rows.length > 0 ? "\n" : "");
}

export function writeMemberExtentLedgerArtifacts(options: {
  rootDir?: string;
  companionPath?: string;
  occurrencesPath?: string;
  extentDecisionDirs?: string[];
  grainDecisionDirs?: string[];
  absenceReceiptDirs?: string[];
  sourceGapOverlayDirs?: string[];
  dossierDir?: string;
  packetPath?: string;
  extentOutputPath?: string;
  grainOutputPath?: string;
  grainBlockReceiptPath?: string | null;
} = {}): {
  extentRows: MemberExtentLedgerRow[];
  grainRows: MemberGrainLedgerRow[];
  extentOutputPath: string;
  grainOutputPath: string;
} {
  const rootDir = resolve(options.rootDir ?? repoRoot);
  const absolute = (path: string): string => resolve(rootDir, path);
  const companionPath = absolute(options.companionPath ?? DEFAULT_MEMBER_EXTENT_COMPANION);
  const occurrencesPath = absolute(options.occurrencesPath ?? DEFAULT_MEMBER_EXTENT_OCCURRENCES);
  const extentDecisionDirs = (options.extentDecisionDirs ?? [DEFAULT_MEMBER_EXTENT_DECISION_DIR]).map(absolute);
  const grainDecisionDirs = (options.grainDecisionDirs ?? [DEFAULT_MEMBER_GRAIN_DECISION_DIR]).map(absolute);
  const absenceReceiptDirs = (options.absenceReceiptDirs ?? [DEFAULT_MEMBER_EXTENT_ABSENCE_DIR]).map(absolute);
  const sourceGapOverlayDirs = (
    options.sourceGapOverlayDirs ??
      [DEFAULT_MEMBER_SOURCE_GAP_OVERLAY_DIR]
  ).map(absolute);
  const dossierDir = absolute(options.dossierDir ?? DEFAULT_SCHEDULE_DIFF_DIR);
  const packetPath = absolute(options.packetPath ??
    "data/quality/study-readiness/v1/research/reviewed-candidate-packets.jsonl");
  const extentOutputPath = absolute(options.extentOutputPath ?? DEFAULT_MEMBER_EXTENT_LEDGER);
  const grainOutputPath = absolute(options.grainOutputPath ?? DEFAULT_MEMBER_GRAIN_LEDGER);
  const grainBlockReceiptPath = options.grainBlockReceiptPath === null
    ? null
    : absolute(options.grainBlockReceiptPath ?? DEFAULT_MEMBER_GRAIN_BLOCK_RECEIPT);
  const result = buildMemberExtentLedgers({
    companionRows: readCompanion(companionPath),
    expectedMemberKeys: readOccurrenceMemberKeys(occurrencesPath),
    extentDecisions: loadMemberExtentDecisions(extentDecisionDirs),
    grainDecisions: loadMemberGrainDecisions(grainDecisionDirs),
    grainBlockReceipts: grainBlockReceiptPath === null ||
        (!existsSync(grainBlockReceiptPath) &&
          options.grainBlockReceiptPath === undefined)
      ? []
      : [loadMemberGrainBlockReceipt(
          options.grainBlockReceiptPath ?? DEFAULT_MEMBER_GRAIN_BLOCK_RECEIPT,
          rootDir,
        )],
    absenceReceipts: loadMemberExtentAbsenceReceipts(absenceReceiptDirs),
    sourceGapOverlays: loadMemberSourceGapOverlays(
      sourceGapOverlayDirs,
      rootDir,
    ),
    dossierArtifacts: readScheduleDossiers(dossierDir, rootDir),
    packetIds: packetIndex(packetPath),
  });
  mkdirSync(dirname(extentOutputPath), { recursive: true });
  mkdirSync(dirname(grainOutputPath), { recursive: true });
  writeFileSync(extentOutputPath, jsonl(result.extentRows));
  writeFileSync(grainOutputPath, jsonl(result.grainRows));
  return { ...result, extentOutputPath, grainOutputPath };
}
