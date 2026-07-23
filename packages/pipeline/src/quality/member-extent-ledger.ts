import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
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
export const DEFAULT_MEMBER_EXTENT_COMPANION =
  "data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl";
export const DEFAULT_MEMBER_EXTENT_LEDGER =
  "data/quality/operational-reference/member-extent-ledger.jsonl";
export const DEFAULT_MEMBER_GRAIN_LEDGER =
  "data/quality/operational-reference/member-grain-ledger.jsonl";
export const DEFAULT_MEMBER_EXTENT_DECISION_DIR =
  "data/quality/operational-reference/member-extent-ledger-decisions";
export const DEFAULT_MEMBER_GRAIN_DECISION_DIR =
  "data/quality/operational-reference/member-grain-decisions";
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

export type MemberExtentDossierRef = {
  artifact: string;
  fact_kind: "bounded_scope_identity" | "scope_modality" | "stop_identity";
  direction: string;
  change: "added" | "removed" | "boundary" | "remainder" | "period_delta";
  identifiers: string[];
  receipt_refs: { snapshot_id: string; path: string; sha256: string }[];
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

export function buildMemberExtentLedgers(input: {
  companionRows: readonly MemberExtentRow[];
  extentDecisions?: readonly MemberExtentDecision[];
  grainDecisions?: readonly MemberGrainDecision[];
  absenceReceipts?: readonly MemberExtentAbsenceReceipt[];
  dossierArtifacts?: readonly ScheduleDossierArtifact[];
  packetIds?: ReadonlyMap<string, string>;
}): { extentRows: MemberExtentLedgerRow[]; grainRows: MemberGrainLedgerRow[] } {
  const companion = [...input.companionRows].sort((left, right) =>
    extentDecisionKey(left).localeCompare(extentDecisionKey(right)));
  const denominator = new Set(companion.map(extentDecisionKey));
  if (denominator.size !== companion.length) throw new Error("duplicate companion denominator key");
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
  const dossierIndex = dossierRefs(input.dossierArtifacts ?? []);
  const extentRows = companion.map((current) => {
    const key = extentDecisionKey(current);
    const overlay = extentDecisions.get(key);
    if (overlay && current.extent !== "unresolved") {
      throw new Error(`${overlay.decision_id}: external extent decisions may overlay only unresolved rows`);
    }
    const absence = absences.get(`member_extent\0${key}`);
    if (absence && (overlay || current.extent !== "unresolved")) {
      throw new Error(`${absence.receipt_id}: absence conflicts with a positive spatial decision`);
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
        : resolvedKind === "unresolved" ? "unreviewed" : `resolved:${resolvedKind}`,
      verdict_basis: absence
        ? `receipt:${absence.receipt_id}`
        : resolvedKind === "unresolved" ? null : `review:${decisionId}`,
      receipt_ids: absence ? [absence.receipt_id] : [],
      updated_at: absence?.reviewed_at ?? overlay?.reviewed_at ?? null,
      authorizes_study: false,
      authorizes_cross_product: false,
    } satisfies MemberExtentLedgerRow;
  });
  const spatialByKey = new Map(extentRows.map((row) => [extentDecisionKey(row), row]));
  const grainRows = companion.map((current) => {
    const key = extentDecisionKey(current);
    const spatial = spatialByKey.get(key)!;
    const decision = grainDecisions.get(key);
    const absence = absences.get(`member_grain\0${key}`);
    if (decision && absence) throw new Error(`${key}: grain decision conflicts with absence receipt`);
    const effectiveExtentDecisionId = extentDecisions.get(key)?.decision_id ?? current.decision_id;
    if (decision?.member_extent_decision_id &&
        decision.member_extent_decision_id !== effectiveExtentDecisionId) {
      throw new Error(`${decision.decision_id}: member_extent_decision_id does not match spatial row`);
    }
    const verdict = absence
      ? "absent_in_source"
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
      verdict_basis: absence ? `receipt:${absence.receipt_id}` :
        decision ? `review:${decision.decision_id}` : null,
      receipt_ids: absence ? [absence.receipt_id] : [],
      updated_at: absence?.reviewed_at ?? decision?.reviewed_at ?? null,
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
  extentDecisionDirs?: string[];
  grainDecisionDirs?: string[];
  absenceReceiptDirs?: string[];
  dossierDir?: string;
  packetPath?: string;
  extentOutputPath?: string;
  grainOutputPath?: string;
} = {}): {
  extentRows: MemberExtentLedgerRow[];
  grainRows: MemberGrainLedgerRow[];
  extentOutputPath: string;
  grainOutputPath: string;
} {
  const rootDir = resolve(options.rootDir ?? repoRoot);
  const absolute = (path: string): string => resolve(rootDir, path);
  const companionPath = absolute(options.companionPath ?? DEFAULT_MEMBER_EXTENT_COMPANION);
  const extentDecisionDirs = (options.extentDecisionDirs ?? [DEFAULT_MEMBER_EXTENT_DECISION_DIR]).map(absolute);
  const grainDecisionDirs = (options.grainDecisionDirs ?? [DEFAULT_MEMBER_GRAIN_DECISION_DIR]).map(absolute);
  const absenceReceiptDirs = (options.absenceReceiptDirs ?? [DEFAULT_MEMBER_EXTENT_ABSENCE_DIR]).map(absolute);
  const dossierDir = absolute(options.dossierDir ?? DEFAULT_SCHEDULE_DIFF_DIR);
  const packetPath = absolute(options.packetPath ??
    "data/quality/study-readiness/v1/research/reviewed-candidate-packets.jsonl");
  const extentOutputPath = absolute(options.extentOutputPath ?? DEFAULT_MEMBER_EXTENT_LEDGER);
  const grainOutputPath = absolute(options.grainOutputPath ?? DEFAULT_MEMBER_GRAIN_LEDGER);
  const result = buildMemberExtentLedgers({
    companionRows: readCompanion(companionPath),
    extentDecisions: loadMemberExtentDecisions(extentDecisionDirs),
    grainDecisions: loadMemberGrainDecisions(grainDecisionDirs),
    absenceReceipts: loadMemberExtentAbsenceReceipts(absenceReceiptDirs),
    dossierArtifacts: readScheduleDossiers(dossierDir, rootDir),
    packetIds: packetIndex(packetPath),
  });
  mkdirSync(dirname(extentOutputPath), { recursive: true });
  mkdirSync(dirname(grainOutputPath), { recursive: true });
  writeFileSync(extentOutputPath, jsonl(result.extentRows));
  writeFileSync(grainOutputPath, jsonl(result.grainRows));
  return { ...result, extentOutputPath, grainOutputPath };
}
