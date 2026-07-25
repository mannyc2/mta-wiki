import { createHash } from "node:crypto";
import { stableHash, stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { MemberGrainDecision } from "./member-grain-decisions.js";
import { parseMemberGrainDecision } from "./member-grain-decisions.js";
import type { MemberGrainLedgerRow } from "./member-extent-ledger.js";
import type { MemberExtentRow } from "./study-readiness-v1.js";

export const MEMBER_GRAIN_COMPANION_SCHEMA_VERSION = 1 as const;
export const MEMBER_GRAIN_COMPANION_CONTRACT_ID =
  "operational-occurrence-member-grain-v1" as const;

export type MemberGrainTerminalDisposition =
  | "resolved"
  | "not_applicable"
  | "absent_in_source"
  | "blocked_upstream";

export type MemberGrainCompanionRow = {
  schema_version: 1;
  contract_id: typeof MEMBER_GRAIN_COMPANION_CONTRACT_ID;
  grain_id: string;
  extent_id: string;
  occurrence_id: string;
  route_record_id: string;
  gtfs_route_id: string;
  treatment_record_id: string;
  member_extent_decision_id: string | null;
  service_scope: MemberGrainDecision["service_scope"] | null;
  lineage_segments: MemberGrainDecision["lineage_segments"];
  evidence_bindings: MemberGrainDecision["evidence_bindings"];
  decision_id: string | null;
  terminal_disposition: MemberGrainTerminalDisposition;
  receipt_ids: string[];
  authorizes_study: false;
  authorizes_cross_product: false;
};

const rowFields = new Set([
  "authorizes_cross_product", "authorizes_study", "contract_id", "decision_id",
  "evidence_bindings", "extent_id", "grain_id", "gtfs_route_id",
  "lineage_segments", "member_extent_decision_id", "occurrence_id",
  "receipt_ids", "route_record_id", "schema_version", "service_scope",
  "terminal_disposition", "treatment_record_id",
]);

export function memberGrainKey(value: {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
}): string {
  return `${value.occurrence_id}\0${value.route_record_id}\0${value.treatment_record_id}`;
}

function sortedUnique(values: readonly string[], path: string): void {
  if (
    values.some((value) => typeof value !== "string" || value.length === 0) ||
    new Set(values).size !== values.length ||
    stableJson(values as JsonValue) !== stableJson([...values].sort() as JsonValue)
  ) {
    throw new Error(`${path}: values must be non-empty strings, sorted, and unique`);
  }
}

export function memberExtentProjectionSha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildMemberGrainCompanion(input: {
  ledgerRows: readonly MemberGrainLedgerRow[];
  extentRows: readonly MemberExtentRow[];
  decisionIdsByKey?: ReadonlyMap<string, string>;
}): MemberGrainCompanionRow[] {
  const extents = new Map(input.extentRows.map((row) => [memberGrainKey(row), row]));
  if (extents.size !== input.extentRows.length) {
    throw new Error("member-grain companion extent denominator has duplicates");
  }
  const rows = [...input.ledgerRows].sort((left, right) =>
    memberGrainKey(left).localeCompare(memberGrainKey(right))
  ).map((ledger) => {
    const key = memberGrainKey(ledger);
    const extent = extents.get(key);
    if (!extent) throw new Error(`${ledger.ledger_id}: missing member-extent row`);
    let terminal: MemberGrainTerminalDisposition;
    if (ledger.verdict === "resolved") terminal = "resolved";
    else if (ledger.verdict === "not_applicable") terminal = "not_applicable";
    else if (ledger.verdict === "absent_in_source") terminal = "absent_in_source";
    else if (ledger.verdict.startsWith("blocked_upstream:")) terminal = "blocked_upstream";
    else throw new Error(`${ledger.ledger_id}: nonterminal grain verdict`);
    if (
      (terminal === "absent_in_source" || terminal === "blocked_upstream") &&
      ledger.receipt_ids.length === 0
    ) {
      throw new Error(`${ledger.ledger_id}: terminal grain requires receipt ids`);
    }
    if (
      (terminal === "resolved" || terminal === "not_applicable") &&
      ledger.service_scope === null
    ) {
      throw new Error(`${ledger.ledger_id}: reviewed grain requires structured service scope`);
    }
    for (const [index, segment] of ledger.lineage_segments.entries()) {
      if (!segment.predecessor_gtfs_route_id ||
          !segment.successor_gtfs_route_id) {
        throw new Error(`${ledger.ledger_id}.lineage_segments[${index}]: route ids required`);
      }
      sortedUnique(segment.boundary_stop_ids, `${ledger.ledger_id}.boundary_stop_ids`);
      sortedUnique(segment.shared_stop_ids, `${ledger.ledger_id}.shared_stop_ids`);
    }
    const decisionId =
      ledger.verdict_basis?.match(/review:([^;]+)/u)?.[1] ??
      input.decisionIdsByKey?.get(key) ??
      null;
    return {
      schema_version: 1,
      contract_id: MEMBER_GRAIN_COMPANION_CONTRACT_ID,
      grain_id: `member-grain:${stableHash({
        occurrence_id: ledger.occurrence_id,
        route_record_id: ledger.route_record_id,
        treatment_record_id: ledger.treatment_record_id,
      } as JsonValue).slice(0, 24)}`,
      extent_id: extent.extent_id,
      occurrence_id: ledger.occurrence_id,
      route_record_id: ledger.route_record_id,
      gtfs_route_id: ledger.gtfs_route_id,
      treatment_record_id: ledger.treatment_record_id,
      member_extent_decision_id: ledger.member_extent_decision_id,
      service_scope: ledger.service_scope,
      lineage_segments: ledger.lineage_segments,
      evidence_bindings: ledger.evidence_bindings,
      decision_id: decisionId,
      terminal_disposition: terminal,
      receipt_ids: [...ledger.receipt_ids].sort(),
      authorizes_study: false,
      authorizes_cross_product: false,
    } satisfies MemberGrainCompanionRow;
  });
  if (rows.length !== extents.size) {
    throw new Error("member-grain companion denominator mismatch");
  }
  sortedUnique(rows.map(memberGrainKey), "member-grain companion keys");
  return rows;
}

export function parseMemberGrainCompanion(
  bytes: string,
  expectedExtentSha256?: string,
  manifestExtentSha256?: string,
  path = "operational_occurrence_member_grain.jsonl",
  expectedExtentRows?: readonly MemberExtentRow[],
): MemberGrainCompanionRow[] {
  if (
    expectedExtentSha256 !== undefined &&
    expectedExtentSha256 !== manifestExtentSha256
  ) {
    throw new Error(`${path}: member-extent projection hash mismatch`);
  }
  const rows = bytes.split(/\r?\n/u).flatMap((line, index) => {
    if (!line) return [];
    const raw = JSON.parse(line) as unknown;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error(`${path}:${index + 1}: expected object`);
    }
    const parsed = raw as Record<string, unknown>;
    const extras = Object.keys(parsed).filter((field) => !rowFields.has(field)).sort();
    const missing = [...rowFields].filter((field) => !(field in parsed)).sort();
    if (extras.length || missing.length) {
      throw new Error(
        `${path}:${index + 1}: exact fields required; unknown=${extras.join(",")}; missing=${missing.join(",")}`,
      );
    }
    const value = raw as MemberGrainCompanionRow;
    if (stableJson(value as unknown as JsonValue) !== line) {
      throw new Error(`${path}:${index + 1}: expected canonical stable JSON`);
    }
    if (
      value.schema_version !== 1 ||
      value.contract_id !== MEMBER_GRAIN_COMPANION_CONTRACT_ID ||
      value.authorizes_study !== false ||
      value.authorizes_cross_product !== false ||
      !["resolved", "not_applicable", "absent_in_source", "blocked_upstream"]
        .includes(value.terminal_disposition)
    ) {
      throw new Error(`${path}:${index + 1}: invalid contract row`);
    }
    if (
      (value.terminal_disposition === "absent_in_source" ||
        value.terminal_disposition === "blocked_upstream") &&
      value.receipt_ids.length === 0
    ) {
      throw new Error(`${path}:${index + 1}: unreceipted terminal row`);
    }
    if (!Array.isArray(value.lineage_segments) ||
        !Array.isArray(value.evidence_bindings) ||
        !Array.isArray(value.receipt_ids)) {
      throw new Error(`${path}:${index + 1}: malformed structured fields`);
    }
    for (const field of ["decision_id", "member_extent_decision_id"] as const) {
      if (
        value[field] !== null &&
        (typeof value[field] !== "string" || value[field].length === 0)
      ) {
        throw new Error(`${path}:${index + 1}.${field}: expected string or null`);
      }
    }
    for (const field of [
      "grain_id", "extent_id", "occurrence_id", "route_record_id",
      "gtfs_route_id", "treatment_record_id",
    ] as const) {
      if (typeof value[field] !== "string" || value[field].length === 0) {
        throw new Error(`${path}:${index + 1}.${field}: expected non-empty string`);
      }
    }
    sortedUnique(value.receipt_ids, `${path}:${index + 1}.receipt_ids`);
    if (value.service_scope !== null) {
      parseMemberGrainDecision({
        schema_version: 1,
        contract_id: "member-grain-decision-v1",
        decision_id: value.decision_id ?? `companion-validation:${index}`,
        occurrence_id: value.occurrence_id,
        route_record_id: value.route_record_id,
        gtfs_route_id: value.gtfs_route_id,
        treatment_record_id: value.treatment_record_id,
        member_extent_decision_id: value.member_extent_decision_id,
        service_scope: value.service_scope,
        lineage_segments: value.lineage_segments,
        evidence_bindings: value.evidence_bindings,
        rationale: "Structured companion validation.",
        reviewed_at: "1970-01-01T00:00:00Z",
        reviewed_by: "strict-companion-decoder",
      }, `${path}:${index + 1}.structured_grain`);
    } else if (
      value.lineage_segments.length > 0 ||
      value.evidence_bindings.length > 0 ||
      value.decision_id !== null
    ) {
      throw new Error(`${path}:${index + 1}: null service scope cannot carry reviewed grain fields`);
    }
    if (
      (value.terminal_disposition === "resolved" ||
        value.terminal_disposition === "not_applicable") &&
      (value.service_scope === null || value.decision_id === null)
    ) {
      throw new Error(`${path}:${index + 1}: reviewed terminal row requires decision and service scope`);
    }
    return [value];
  });
  sortedUnique(rows.map(memberGrainKey), `${path}.keys`);
  if (expectedExtentRows) {
    const expected = [...expectedExtentRows].sort((left, right) =>
      memberGrainKey(left).localeCompare(memberGrainKey(right))
    );
    if (
      stableJson(rows.map((row) => ({
        key: memberGrainKey(row),
        extent_id: row.extent_id,
      })) as JsonValue) !==
      stableJson(expected.map((row) => ({
        key: memberGrainKey(row),
        extent_id: row.extent_id,
      })) as JsonValue)
    ) {
      throw new Error(`${path}: exact member-extent denominator mismatch`);
    }
  }
  return rows;
}
