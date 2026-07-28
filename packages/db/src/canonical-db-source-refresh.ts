import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, normalize, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "./stable-json.js";
import type { JsonValue } from "./types.js";

export const CANONICAL_DB_SOURCE_REFRESH_SIDECAR =
  "data/.canonical-db-source-refresh";
export const CANONICAL_DB_SOURCE_REFRESH_MARKER =
  `${CANONICAL_DB_SOURCE_REFRESH_SIDECAR}/active-transaction.json`;
export const CANONICAL_DB_SOURCE_REFRESH_AUTHORIZATION_ENV =
  "MTA_CANONICAL_DB_SOURCE_REFRESH_RECEIPT";

export type CanonicalDbSourceRefreshDestination = {
  path: string;
  previous_sha256: string | null;
  current_sha256: string;
};

export type CanonicalDbSourceRefreshMarker = {
  schema_version: 1;
  receipt_sha256: string;
  base_commit: string;
  base_tree: string;
  staged_root: string;
  tracked_destinations: CanonicalDbSourceRefreshDestination[];
  candidate_db: {
    path: string;
    sha256: string;
    record_count: number;
    relation_count: number;
    completeness_input_fingerprint: string;
  };
  completed_operations: string[];
};

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isCommit(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
}

function normalizedRepositoryPath(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    !isAbsolute(value) &&
    normalize(value).split("\\").join("/") === value &&
    value !== ".." &&
    !value.startsWith("../");
}

export function parseCanonicalDbSourceRefreshMarker(
  value: unknown,
): CanonicalDbSourceRefreshMarker {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Canonical DB source-refresh marker must be an object");
  }
  const marker = value as CanonicalDbSourceRefreshMarker;
  const keys = Object.keys(marker).sort().join(",");
  if (
    keys !== [
      "base_commit",
      "base_tree",
      "candidate_db",
      "completed_operations",
      "receipt_sha256",
      "schema_version",
      "staged_root",
      "tracked_destinations",
    ].sort().join(",") ||
    marker.schema_version !== 1 ||
    !isSha256(marker.receipt_sha256) ||
    !isCommit(marker.base_commit) ||
    !isSha256(marker.base_tree) ||
    !normalizedRepositoryPath(marker.staged_root) ||
    !Array.isArray(marker.tracked_destinations) ||
    !Array.isArray(marker.completed_operations)
  ) {
    throw new Error("Canonical DB source-refresh marker header is invalid");
  }
  if (
    marker.tracked_destinations.some((destination) =>
      Object.keys(destination).sort().join(",") !==
        ["current_sha256", "path", "previous_sha256"].sort().join(",") ||
      !normalizedRepositoryPath(destination.path) ||
      !isSha256(destination.current_sha256) ||
      (
        destination.previous_sha256 !== null &&
        !isSha256(destination.previous_sha256)
      )
    ) ||
    marker.tracked_destinations.some((destination, index) =>
      index > 0 &&
      marker.tracked_destinations[index - 1]!.path.localeCompare(
        destination.path,
      ) >= 0
    )
  ) {
    throw new Error(
      "Canonical DB source-refresh tracked destination set is invalid",
    );
  }
  const database = marker.candidate_db;
  if (
    !database ||
    Object.keys(database).sort().join(",") !== [
      "completeness_input_fingerprint",
      "path",
      "record_count",
      "relation_count",
      "sha256",
    ].sort().join(",") ||
    !normalizedRepositoryPath(database.path) ||
    !isSha256(database.sha256) ||
    !Number.isInteger(database.record_count) ||
    database.record_count < 0 ||
    !Number.isInteger(database.relation_count) ||
    database.relation_count < 0 ||
    !isSha256(database.completeness_input_fingerprint) ||
    marker.completed_operations.some((operation) =>
      typeof operation !== "string" || operation.length === 0
    ) ||
    new Set(marker.completed_operations).size !==
      marker.completed_operations.length
  ) {
    throw new Error(
      "Canonical DB source-refresh candidate DB or operation set is invalid",
    );
  }
  return marker;
}

export function canonicalDbSourceRefreshMarkerPath(
  root = repoRoot,
): string {
  return join(root, CANONICAL_DB_SOURCE_REFRESH_MARKER);
}

export function readCanonicalDbSourceRefreshMarker(
  root = repoRoot,
): CanonicalDbSourceRefreshMarker | null {
  const path = canonicalDbSourceRefreshMarkerPath(root);
  if (!existsSync(path)) return null;
  try {
    return parseCanonicalDbSourceRefreshMarker(
      JSON.parse(readFileSync(path, "utf8")) as unknown,
    );
  } catch (error) {
    throw new Error(
      `Canonical DB source-refresh transaction marker is invalid; do not read or rebuild the primary DB. ` +
        `Repair or resume ${CANONICAL_DB_SOURCE_REFRESH_MARKER}: ${
          error instanceof Error ? error.message : String(error)
        }`,
    );
  }
}

export function assertCanonicalDbSourceRefreshAvailable(input: {
  root?: string;
  databasePath?: string;
  operation: string;
}): void {
  const root = resolve(input.root ?? repoRoot);
  const primaryDatabase = resolve(root, "data/canonical.db");
  if (
    input.databasePath !== undefined &&
    resolve(input.databasePath) !== primaryDatabase
  ) {
    return;
  }
  const marker = readCanonicalDbSourceRefreshMarker(root);
  if (!marker) return;
  if (
    process.env[CANONICAL_DB_SOURCE_REFRESH_AUTHORIZATION_ENV] ===
      marker.receipt_sha256
  ) {
    return;
  }
  throw new Error(
    `Primary canonical DB is unavailable during source-refresh transaction ${marker.receipt_sha256}. ` +
      `Refusing ${input.operation}; rerun: bun scripts/apply-relationship-enforcement-source-refresh.ts ` +
      `--receipt data/contracts/relationships/v1/enforcement-source-refresh-receipts/${marker.receipt_sha256}.json`,
  );
}

export function writeCanonicalDbSourceRefreshMarker(
  marker: CanonicalDbSourceRefreshMarker,
  root = repoRoot,
): void {
  parseCanonicalDbSourceRefreshMarker(marker);
  const path = canonicalDbSourceRefreshMarkerPath(root);
  const temporary = `${path}.tmp-${process.pid}`;
  const text = `${stableJson(marker as unknown as JsonValue)}\n`;
  writeFileSync(temporary, text, { encoding: "utf8", flag: "wx" });
  renameSync(temporary, path);
}

export function canonicalDbSourceRefreshFileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
