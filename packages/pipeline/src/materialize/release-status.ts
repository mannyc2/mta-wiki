import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const RELEASE_STATUS_SCHEMA_VERSION = 1 as const;
export const RELEASE_STATUS_VALUES = ["quarantined"] as const;

export type ReleaseStatus = (typeof RELEASE_STATUS_VALUES)[number];

export type ReleaseStatusRecord = {
  schema_version: typeof RELEASE_STATUS_SCHEMA_VERSION;
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

export type ReleaseStatusIndex = {
  schema_version: typeof RELEASE_STATUS_SCHEMA_VERSION;
  records: Array<{ release_id: string; path: string; status: ReleaseStatus }>;
};

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

export function parseReleaseStatusRecord(value: unknown): ReleaseStatusRecord {
  const row = object(value, "record");
  const keys = ["schema_version", "release_id", "release_path", "status", "discovered_at", "reason_code", "reason", "manifest_sha256", "failing_artifact", "affected_identity", "replacement_release_id"] as const;
  exactKeys(row, keys, "record");
  if (row.schema_version !== RELEASE_STATUS_SCHEMA_VERSION) throw new Error("Invalid release status schema_version: expected 1");
  if (row.status !== "quarantined") throw new Error("Invalid release status status: expected quarantined");
  const artifact = object(row.failing_artifact, "failing_artifact");
  exactKeys(artifact, ["path", "bytes", "sha256", "contract", "declared_version", "decoder_error"], "failing_artifact");
  const identity = object(row.affected_identity, "affected_identity");
  exactKeys(identity, ["decision_id", "occurrence_id", "relation_id"], "affected_identity");
  if (!Number.isSafeInteger(artifact.bytes) || (artifact.bytes as number) < 0) throw new Error("Invalid release status failing_artifact.bytes: expected non-negative integer");
  if (!Number.isSafeInteger(artifact.declared_version) || (artifact.declared_version as number) < 1) throw new Error("Invalid release status failing_artifact.declared_version: expected positive integer");
  if (row.replacement_release_id !== null && typeof row.replacement_release_id !== "string") throw new Error("Invalid release status replacement_release_id: expected string or null");
  return {
    schema_version: 1,
    release_id: string(row.release_id, "release_id"),
    release_path: relativePath(row.release_path, "release_path"),
    status: "quarantined",
    discovered_at: string(row.discovered_at, "discovered_at"),
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
    replacement_release_id: row.replacement_release_id as string | null,
  };
}

export function readReleaseStatus(rootDir: string, releaseId: string): ReleaseStatusRecord | null {
  const indexPath = join(rootDir, "data", "exports", "release-status", "index.json");
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(indexPath, "utf8")); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const index = object(raw, "index");
  exactKeys(index, ["schema_version", "records"], "index");
  if (index.schema_version !== 1 || !Array.isArray(index.records)) throw new Error("Invalid release status index");
  const matches = index.records.map((entry, i) => {
    const item = object(entry, `index.records[${i}]`);
    exactKeys(item, ["release_id", "path", "status"], `index.records[${i}]`);
    return { release_id: string(item.release_id, `index.records[${i}].release_id`), path: relativePath(item.path, `index.records[${i}].path`), status: item.status };
  }).filter((entry) => entry.release_id === releaseId);
  if (matches.length > 1) throw new Error(`Invalid release status index: duplicate release_id ${releaseId}`);
  const match = matches[0];
  if (!match) return null;
  if (match.status !== "quarantined") throw new Error(`Invalid release status index: unsupported status for ${releaseId}`);
  const record = parseReleaseStatusRecord(JSON.parse(readFileSync(join(rootDir, match.path), "utf8")));
  if (record.release_id !== releaseId || record.status !== match.status) throw new Error(`Invalid release status index: record mismatch for ${releaseId}`);
  return record;
}
