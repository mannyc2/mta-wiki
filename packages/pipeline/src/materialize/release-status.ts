import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

export const RELEASE_STATUS_SCHEMA_VERSION = 2 as const;
export const RELEASE_STATUS_VALUES = ["quarantined"] as const;

export type ReleaseStatus = (typeof RELEASE_STATUS_VALUES)[number];

export type ReleaseStatusRecordV1 = {
  schema_version: 1;
  release_id: string;
  release_path: string;
  status: ReleaseStatus;
  discovered_at: string;
  reason_code: string;
  reason: string;
  manifest_sha256: string;
  failing_artifact: {
    path: string;
    bytes: number;
    sha256: string;
    contract: string;
    declared_version: number;
    decoder_error: string;
  };
  affected_identity: {
    decision_id: string;
    occurrence_id: string;
    relation_id: string;
  };
  replacement_release_id: string | null;
};

export type ReleaseStatusRouteIdentity = { identity_type: "route"; gtfs_route_id: string; route_record_id: string | null; route_family_id: string };
export type ReleaseStatusRecordV2 = {
  schema_version: 2; release_id: string; release_path: string; status: ReleaseStatus; discovered_at: string; reason_code: string; reason: string; manifest_sha256: string;
  failing_artifact: { path: string; bytes: number; sha256: string; declared_contract_version: number | null; detected_by_contract: string; detected_by_contract_version: number; verifier_error: string };
  affected_identities: ReleaseStatusRouteIdentity[]; replacement_release_id: string | null;
};
export type ReleaseStatusRecord = ReleaseStatusRecordV1 | ReleaseStatusRecordV2;
export type ReleaseStatusIndexV1 = { schema_version: 1; records: Array<{ release_id: string; path: string; status: ReleaseStatus }> };
export type ReleaseStatusIndexV2 = { schema_version: 2; records: Array<{ release_id: string; path: string; status: ReleaseStatus; record_schema_version: 1 | 2 }> };
export type ReleaseStatusIndex = ReleaseStatusIndexV1 | ReleaseStatusIndexV2;

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid release status ${path}: expected object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid release status ${path}: expected non-empty string`);
  return value;
}

function releaseId(value: unknown, path: string): string {
  const result = string(value, path);
  if (
    result === "." ||
    result === ".." ||
    result.includes("/") ||
    result.includes("\\") ||
    result.includes("\0") ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(result)
  ) throw new Error(`Invalid release status ${path}: expected safe release id`);
  return result;
}

function isoDate(value: unknown, path: string): string {
  const result = string(value, path);
  const parsed = new Date(`${result}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(result) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new Error(`Invalid release status ${path}: expected valid YYYY-MM-DD`);
  }
  return result;
}

function expectedRouteFamily(gtfsRouteId: string): string {
  return gtfsRouteId.endsWith("+") ? gtfsRouteId.slice(0, -1) : gtfsRouteId;
}

function assertSortedUnique(values: string[], path: string): void {
  if (new Set(values).size !== values.length || values.join("\n") !== [...values].sort().join("\n")) {
    throw new Error(`Invalid release status ${path}: expected sorted unique values`);
  }
}

function relativePath(value: unknown, path: string): string {
  const result = string(value, path);
  const segments = result.split("/");
  if (
    isAbsolute(result) ||
    /^[a-zA-Z]:/u.test(result) ||
    result.includes("\\") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid release status ${path}: expected safe relative path`);
  }
  return result;
}

function sha256(value: unknown, path: string): string {
  const result = string(value, path);
  if (!/^[0-9a-f]{64}$/u.test(result)) throw new Error(`Invalid release status ${path}: expected lowercase SHA-256`);
  return result;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  const unexpected = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !(key in value));
  if (unexpected.length || missing.length) {
    throw new Error(`Invalid release status ${path}: keys must be exactly ${keys.join(", ")}`);
  }
}

export function parseReleaseStatusRecordV1(value: unknown): ReleaseStatusRecordV1 {
  const row = object(value, "record");
  const keys = ["schema_version", "release_id", "release_path", "status", "discovered_at", "reason_code", "reason", "manifest_sha256", "failing_artifact", "affected_identity", "replacement_release_id"] as const;
  exactKeys(row, keys, "record");
  if (row.schema_version !== 1) throw new Error("Invalid release status schema_version: expected 1");
  if (row.status !== "quarantined") throw new Error("Invalid release status status: expected quarantined");
  const artifact = object(row.failing_artifact, "failing_artifact");
  exactKeys(artifact, ["path", "bytes", "sha256", "contract", "declared_version", "decoder_error"], "failing_artifact");
  const identity = object(row.affected_identity, "affected_identity");
  exactKeys(identity, ["decision_id", "occurrence_id", "relation_id"], "affected_identity");
  if (!Number.isSafeInteger(artifact.bytes) || (artifact.bytes as number) < 0) throw new Error("Invalid release status failing_artifact.bytes: expected non-negative integer");
  if (!Number.isSafeInteger(artifact.declared_version) || (artifact.declared_version as number) < 1) throw new Error("Invalid release status failing_artifact.declared_version: expected positive integer");
  const parsedReleaseId = releaseId(row.release_id, "release_id");
  const parsedReleasePath = relativePath(row.release_path, "release_path");
  if (parsedReleasePath !== `data/exports/releases/${parsedReleaseId}`) throw new Error("Invalid release status release_path: must address release_id");
  const replacement = row.replacement_release_id === null ? null : releaseId(row.replacement_release_id, "replacement_release_id");
  if (replacement === parsedReleaseId) throw new Error("Invalid release status replacement_release_id: cannot replace itself");
  return {
    schema_version: 1,
    release_id: parsedReleaseId,
    release_path: parsedReleasePath,
    status: "quarantined",
    discovered_at: isoDate(row.discovered_at, "discovered_at"),
    reason_code: string(row.reason_code, "reason_code"),
    reason: string(row.reason, "reason"),
    manifest_sha256: sha256(row.manifest_sha256, "manifest_sha256"),
    failing_artifact: {
      path: relativePath(artifact.path, "failing_artifact.path"), bytes: artifact.bytes as number,
      sha256: sha256(artifact.sha256, "failing_artifact.sha256"), contract: string(artifact.contract, "failing_artifact.contract"),
      declared_version: artifact.declared_version as number, decoder_error: string(artifact.decoder_error, "failing_artifact.decoder_error"),
    },
    affected_identity: {
      decision_id: string(identity.decision_id, "affected_identity.decision_id"), occurrence_id: string(identity.occurrence_id, "affected_identity.occurrence_id"), relation_id: string(identity.relation_id, "affected_identity.relation_id"),
    },
    replacement_release_id: replacement,
  };
}

export function parseReleaseStatusRecordV2(value: unknown): ReleaseStatusRecordV2 {
  const row = object(value, "record");
  exactKeys(row, ["schema_version", "release_id", "release_path", "status", "discovered_at", "reason_code", "reason", "manifest_sha256", "failing_artifact", "affected_identities", "replacement_release_id"], "record");
  if (row.schema_version !== 2) throw new Error("Invalid release status schema_version: expected 2");
  if (row.status !== "quarantined") throw new Error("Invalid release status status: expected quarantined");
  const artifact = object(row.failing_artifact, "failing_artifact");
  exactKeys(artifact, ["path", "bytes", "sha256", "declared_contract_version", "detected_by_contract", "detected_by_contract_version", "verifier_error"], "failing_artifact");
  if (!Number.isSafeInteger(artifact.bytes) || (artifact.bytes as number) < 0) throw new Error("Invalid release status failing_artifact.bytes");
  if (artifact.declared_contract_version !== null && (!Number.isSafeInteger(artifact.declared_contract_version) || (artifact.declared_contract_version as number) < 1)) throw new Error("Invalid release status failing_artifact.declared_contract_version");
  if (!Number.isSafeInteger(artifact.detected_by_contract_version) || (artifact.detected_by_contract_version as number) < 1) throw new Error("Invalid release status failing_artifact.detected_by_contract_version");
  if (!Array.isArray(row.affected_identities) || row.affected_identities.length === 0) throw new Error("Invalid release status affected_identities: expected non-empty array");
  const affected_identities = row.affected_identities.map((entry, index): ReleaseStatusRouteIdentity => {
    const path = `affected_identities[${index}]`;
    const identity = object(entry, path); exactKeys(identity, ["identity_type", "gtfs_route_id", "route_record_id", "route_family_id"], path);
    if (identity.identity_type !== "route") throw new Error(`Invalid release status ${path}.identity_type`);
    const gtfsRouteId = string(identity.gtfs_route_id, `${path}.gtfs_route_id`);
    const routeRecordId = identity.route_record_id === null ? null : string(identity.route_record_id, `${path}.route_record_id`);
    const routeFamilyId = string(identity.route_family_id, `${path}.route_family_id`);
    if (routeFamilyId !== expectedRouteFamily(gtfsRouteId)) throw new Error(`Invalid release status ${path}.route_family_id: does not match exact route identity`);
    return { identity_type: "route", gtfs_route_id: gtfsRouteId, route_record_id: routeRecordId, route_family_id: routeFamilyId };
  });
  assertSortedUnique(affected_identities.map((entry) => entry.gtfs_route_id), "affected_identities.gtfs_route_id");
  const parsedReleaseId = releaseId(row.release_id, "release_id");
  const parsedReleasePath = relativePath(row.release_path, "release_path");
  if (parsedReleasePath !== `data/exports/releases/${parsedReleaseId}`) throw new Error("Invalid release status release_path: must address release_id");
  const replacement = row.replacement_release_id === null ? null : releaseId(row.replacement_release_id, "replacement_release_id");
  if (replacement === parsedReleaseId) throw new Error("Invalid release status replacement_release_id: cannot replace itself");
  return { schema_version: 2, release_id: parsedReleaseId, release_path: parsedReleasePath, status: "quarantined", discovered_at: isoDate(row.discovered_at, "discovered_at"), reason_code: string(row.reason_code, "reason_code"), reason: string(row.reason, "reason"), manifest_sha256: sha256(row.manifest_sha256, "manifest_sha256"), failing_artifact: { path: relativePath(artifact.path, "failing_artifact.path"), bytes: artifact.bytes as number, sha256: sha256(artifact.sha256, "failing_artifact.sha256"), declared_contract_version: artifact.declared_contract_version as number | null, detected_by_contract: string(artifact.detected_by_contract, "failing_artifact.detected_by_contract"), detected_by_contract_version: artifact.detected_by_contract_version as number, verifier_error: string(artifact.verifier_error, "failing_artifact.verifier_error") }, affected_identities, replacement_release_id: replacement };
}

export function parseReleaseStatusRecord(value: unknown): ReleaseStatusRecord {
  const version = object(value, "record").schema_version;
  if (version === 1) return parseReleaseStatusRecordV1(value);
  if (version === 2) return parseReleaseStatusRecordV2(value);
  throw new Error("Invalid release status schema_version: expected 1 or 2");
}

export function parseReleaseStatusIndex(value: unknown): ReleaseStatusIndex {
  const index = object(value, "index"); exactKeys(index, ["schema_version", "records"], "index");
  if ((index.schema_version !== 1 && index.schema_version !== 2) || !Array.isArray(index.records)) throw new Error("Invalid release status index");
  const records = index.records.map((entry, i) => {
    const path = `index.records[${i}]`;
    const item = object(entry, path); exactKeys(item, index.schema_version === 1 ? ["release_id", "path", "status"] : ["release_id", "path", "status", "record_schema_version"], path);
    if (item.status !== "quarantined") throw new Error(`Invalid release status ${path}.status`);
    if (index.schema_version === 2 && item.record_schema_version !== 1 && item.record_schema_version !== 2) throw new Error(`Invalid release status ${path}.record_schema_version`);
    return { release_id: releaseId(item.release_id, `${path}.release_id`), path: relativePath(item.path, `${path}.path`), status: "quarantined" as const, ...(index.schema_version === 2 ? { record_schema_version: item.record_schema_version as 1 | 2 } : {}) };
  });
  assertSortedUnique(records.map((entry) => entry.release_id), "index.records.release_id");
  return index.schema_version === 1 ? { schema_version: 1, records } : { schema_version: 2, records: records as ReleaseStatusIndexV2["records"] };
}

export function serializeReleaseStatusRecord(value: ReleaseStatusRecord): string {
  const parsed = parseReleaseStatusRecord(value);
  const bytes = `${stableJson(parsed as unknown as JsonValue)}\n`;
  parseReleaseStatusRecord(JSON.parse(bytes) as unknown);
  return bytes;
}

export function serializeReleaseStatusIndex(value: ReleaseStatusIndex): string {
  const parsed = parseReleaseStatusIndex(value);
  const bytes = `${stableJson(parsed as unknown as JsonValue)}\n`;
  parseReleaseStatusIndex(JSON.parse(bytes) as unknown);
  return bytes;
}

export function readReleaseStatus(rootDir: string, releaseId: string): ReleaseStatusRecord | null {
  const indexPath = join(rootDir, "data", "exports", "release-status", "index.json");
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(indexPath, "utf8")); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const index = parseReleaseStatusIndex(raw);
  const matches = index.records.filter((entry) => entry.release_id === releaseId);
  const match = matches[0];
  if (!match) return null;
  const record = parseReleaseStatusRecord(JSON.parse(readFileSync(join(rootDir, match.path), "utf8")));
  if (index.schema_version === 2 && "record_schema_version" in match && record.schema_version !== match.record_schema_version) throw new Error(`Invalid release status index: record schema mismatch for ${releaseId}`);
  if (record.release_id !== releaseId || record.status !== match.status) throw new Error(`Invalid release status index: record mismatch for ${releaseId}`);
  return record;
}
