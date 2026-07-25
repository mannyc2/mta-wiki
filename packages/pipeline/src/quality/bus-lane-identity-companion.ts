import { stableHash, stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { BusLaneIdentityRow } from "./bus-lane-identity.js";

export const BUS_LANE_IDENTITY_VERDICT_SCHEMA_VERSION = 1 as const;
export const BUS_LANE_IDENTITY_VERDICT_CONTRACT_ID =
  "bus-lane-identity-verdict-v1" as const;

export const BUS_LANE_IDENTITY_COMPANION_VERDICTS = [
  "binding_absent_after_search",
  "confirmed_out_of_window",
  "occurrence_created",
  "refuted_no_traversal",
  "refuted_wrong_route_attribution",
  "superseded_duplicate",
] as const;

export type BusLaneIdentityCompanionVerdict =
  typeof BUS_LANE_IDENTITY_COMPANION_VERDICTS[number];

export type BusLaneIdentityVerdictRow = {
  schema_version: 1;
  contract_id: typeof BUS_LANE_IDENTITY_VERDICT_CONTRACT_ID;
  verdict_id: string;
  candidate_id: string;
  gtfs_route_id: string;
  implementation_date: string;
  date_precision: string;
  verdict: BusLaneIdentityCompanionVerdict;
  occurrence_id: string | null;
  dossier_receipts: string[];
  decision_id: string | null;
  acquisition_receipt_ids: string[];
  canonical_candidate_id: string | null;
  authorizes_study: false;
  authorizes_cross_product: false;
};

const fields = new Set([
  "acquisition_receipt_ids", "authorizes_cross_product", "authorizes_study",
  "candidate_id", "canonical_candidate_id", "contract_id", "date_precision",
  "decision_id", "dossier_receipts", "gtfs_route_id", "implementation_date",
  "occurrence_id", "schema_version", "verdict", "verdict_id",
]);

function sortedUnique(values: readonly string[], path: string): void {
  if (
    values.some((value) => typeof value !== "string" || value.length === 0) ||
    new Set(values).size !== values.length ||
    stableJson(values as JsonValue) !== stableJson([...values].sort() as JsonValue)
  ) {
    throw new Error(`${path}: values must be non-empty, sorted, and unique`);
  }
}

export function parseBusLaneIdentityVerdictRow(
  value: unknown,
  path = "bus-lane-identity-verdict",
): BusLaneIdentityVerdictRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  const row = value as Record<string, unknown>;
  const extras = Object.keys(row).filter((key) => !fields.has(key)).sort();
  const missing = [...fields].filter((key) => !(key in row)).sort();
  if (extras.length || missing.length) {
    throw new Error(
      `${path}: exact fields required; unknown=${extras.join(",")}; missing=${missing.join(",")}`,
    );
  }
  if (
    row.schema_version !== 1 ||
    row.contract_id !== BUS_LANE_IDENTITY_VERDICT_CONTRACT_ID ||
    row.authorizes_study !== false ||
    row.authorizes_cross_product !== false ||
    !BUS_LANE_IDENTITY_COMPANION_VERDICTS.includes(
      row.verdict as BusLaneIdentityCompanionVerdict,
    )
  ) {
    throw new Error(`${path}: invalid contract header or verdict`);
  }
  for (const field of [
    "verdict_id", "candidate_id", "gtfs_route_id", "implementation_date",
    "date_precision",
  ] as const) {
    if (typeof row[field] !== "string" || row[field].length === 0) {
      throw new Error(`${path}.${field}: expected non-empty string`);
    }
  }
  if (!Array.isArray(row.dossier_receipts) ||
      !Array.isArray(row.acquisition_receipt_ids)) {
    throw new Error(`${path}: malformed receipt arrays`);
  }
  sortedUnique(row.dossier_receipts as string[], `${path}.dossier_receipts`);
  sortedUnique(
    row.acquisition_receipt_ids as string[],
    `${path}.acquisition_receipt_ids`,
  );
  for (const field of [
    "occurrence_id", "decision_id", "canonical_candidate_id",
  ] as const) {
    if (row[field] !== null &&
        (typeof row[field] !== "string" || row[field].length === 0)) {
      throw new Error(`${path}.${field}: expected string or null`);
    }
  }
  if (
    row.verdict === "occurrence_created" &&
    (row.occurrence_id === null || row.decision_id === null)
  ) {
    throw new Error(`${path}: occurrence_created requires occurrence and decision ids`);
  }
  if (
    row.verdict === "superseded_duplicate" &&
    (row.canonical_candidate_id === null ||
      row.canonical_candidate_id === row.candidate_id)
  ) {
    throw new Error(`${path}: superseded_duplicate requires another canonical candidate`);
  }
  if (
    row.verdict === "binding_absent_after_search" &&
    (row.decision_id === null ||
      (row.acquisition_receipt_ids as string[]).length === 0)
  ) {
    throw new Error(`${path}: binding absence requires decision and acquisition receipt`);
  }
  if (row.decision_id === null ||
      (row.acquisition_receipt_ids as string[]).length === 0) {
    throw new Error(`${path}: every terminal verdict requires decision/receipt provenance`);
  }
  if (
    row.verdict !== "occurrence_created" &&
    row.occurrence_id !== null
  ) {
    throw new Error(`${path}: only occurrence_created may carry occurrence_id`);
  }
  if (
    row.verdict !== "superseded_duplicate" &&
    row.canonical_candidate_id !== null
  ) {
    throw new Error(`${path}: only superseded_duplicate may carry canonical_candidate_id`);
  }
  return row as BusLaneIdentityVerdictRow;
}

export function buildBusLaneIdentityVerdicts(
  ledgerRows: readonly BusLaneIdentityRow[],
  expectedCandidateIds: readonly string[] = ledgerRows.map((row) => row.candidate_id),
): BusLaneIdentityVerdictRow[] {
  const expected = [...expectedCandidateIds].sort();
  sortedUnique(expected, "bus-lane-identity.expected-candidates");
  const rows = [...ledgerRows].sort((left, right) =>
    left.candidate_id.localeCompare(right.candidate_id)
  ).map((row) => {
    let verdict: BusLaneIdentityCompanionVerdict;
    let occurrenceId: string | null = null;
    if (row.verdict.startsWith("occurrence_created:")) {
      verdict = "occurrence_created";
      occurrenceId = row.verdict.slice("occurrence_created:".length);
    } else if (BUS_LANE_IDENTITY_COMPANION_VERDICTS.includes(
      row.verdict as BusLaneIdentityCompanionVerdict,
    )) {
      verdict = row.verdict as BusLaneIdentityCompanionVerdict;
    } else {
      throw new Error(`${row.ledger_id}: nonterminal or unsupported identity verdict`);
    }
    const candidate = {
      schema_version: 1,
      contract_id: BUS_LANE_IDENTITY_VERDICT_CONTRACT_ID,
      verdict_id: `bus-lane-identity-verdict:${stableHash({
        candidate_id: row.candidate_id,
      } as JsonValue).slice(0, 24)}`,
      candidate_id: row.candidate_id,
      gtfs_route_id: row.gtfs_route_id,
      implementation_date: row.implementation_date,
      date_precision: row.date_precision,
      verdict,
      occurrence_id: occurrenceId,
      dossier_receipts: [...new Set(row.dossier_refs.map((ref) => ref.artifact))].sort(),
      decision_id: row.decision_id,
      acquisition_receipt_ids: [...new Set(row.receipt_ids)].sort(),
      canonical_candidate_id: null,
      authorizes_study: false,
      authorizes_cross_product: false,
    } satisfies BusLaneIdentityVerdictRow;
    return parseBusLaneIdentityVerdictRow(candidate, row.ledger_id);
  });
  const actual = rows.map((row) => row.candidate_id);
  if (stableJson(actual as JsonValue) !== stableJson(expected as JsonValue)) {
    throw new Error("bus-lane identity companion denominator mismatch");
  }
  return rows;
}

export function parseBusLaneIdentityVerdicts(
  bytes: string,
  path = "bus_lane_identity_verdicts.jsonl",
  expectedCandidateIds?: readonly string[],
): BusLaneIdentityVerdictRow[] {
  const rows = bytes.split(/\r?\n/u).flatMap((line, index) => {
    if (!line) return [];
    const value = JSON.parse(line) as unknown;
    if (stableJson(value as JsonValue) !== line) {
      throw new Error(`${path}:${index + 1}: expected canonical stable JSON`);
    }
    return [parseBusLaneIdentityVerdictRow(value, `${path}:${index + 1}`)];
  });
  sortedUnique(rows.map((row) => row.candidate_id), `${path}.candidate_ids`);
  if (expectedCandidateIds) {
    const expected = [...expectedCandidateIds].sort();
    sortedUnique(expected, `${path}.expected_candidate_ids`);
    if (
      stableJson(rows.map((row) => row.candidate_id) as JsonValue) !==
        stableJson(expected as JsonValue)
    ) {
      throw new Error(`${path}: exact candidate denominator mismatch`);
    }
  }
  return rows;
}
