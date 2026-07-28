import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import {
  CANONICAL_DB_SOURCE_REFRESH_AUTHORIZATION_ENV,
  assertCanonicalDbSourceRefreshAvailable,
  parseCanonicalDbSourceRefreshMarker,
  writeCanonicalDbSourceRefreshMarker,
  type CanonicalDbSourceRefreshMarker,
} from "../src/canonical-db-source-refresh";

const hash = "a".repeat(64);
const marker: CanonicalDbSourceRefreshMarker = {
  schema_version: 1,
  receipt_sha256: hash,
  base_commit: "b".repeat(40),
  base_tree: "c".repeat(64),
  staged_root: `data/.canonical-db-source-refresh/${hash}`,
  tracked_destinations: [
    {
      path: "data/contracts/relationships/v1/contract.json",
      previous_sha256: "d".repeat(64),
      current_sha256: "e".repeat(64),
    },
  ],
  candidate_db: {
    path: "candidate.db",
    sha256: "f".repeat(64),
    record_count: 85396,
    relation_count: 21424,
    completeness_input_fingerprint: "1".repeat(64),
  },
  completed_operations: [],
};

describe("canonical DB source-refresh transaction guard", () => {
  it("strictly parses a sorted marker and rejects unknown state", () => {
    expect(parseCanonicalDbSourceRefreshMarker(marker)).toEqual(marker);
    expect(() =>
      parseCanonicalDbSourceRefreshMarker({
        ...marker,
        extra: true,
      })
    ).toThrow("header is invalid");
    expect(() =>
      parseCanonicalDbSourceRefreshMarker({
        ...marker,
        tracked_destinations: [
          marker.tracked_destinations[0],
          marker.tracked_destinations[0],
        ],
      })
    ).toThrow("destination set is invalid");
  });

  it("fails closed only for the primary DB and matching repository entrypoints", () => {
    const root = mkdtempSync(
      join(tmpdir(), "mta-source-refresh-guard-"),
    );
    try {
      mkdirSync(
        join(root, "data/.canonical-db-source-refresh"),
        { recursive: true },
      );
      writeCanonicalDbSourceRefreshMarker(marker, root);
      expect(() =>
        assertCanonicalDbSourceRefreshAvailable({
          root,
          operation: "materialize",
        })
      ).toThrow("rerun:");
      expect(() =>
        assertCanonicalDbSourceRefreshAvailable({
          root,
          databasePath: join(root, "data/canonical.db"),
          operation: "read",
        })
      ).toThrow("unavailable");
      expect(() =>
        assertCanonicalDbSourceRefreshAvailable({
          root,
          databasePath: join(root, "fixture.db"),
          operation: "fixture read",
        })
      ).not.toThrow();
      process.env[CANONICAL_DB_SOURCE_REFRESH_AUTHORIZATION_ENV] =
        marker.receipt_sha256;
      expect(() =>
        assertCanonicalDbSourceRefreshAvailable({
          root,
          operation: "matching apply",
        })
      ).not.toThrow();
    } finally {
      delete process.env[
        CANONICAL_DB_SOURCE_REFRESH_AUTHORIZATION_ENV
      ];
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("treats a malformed active marker as unreadable state", () => {
    const root = mkdtempSync(
      join(tmpdir(), "mta-source-refresh-malformed-"),
    );
    try {
      mkdirSync(
        join(root, "data/.canonical-db-source-refresh"),
        { recursive: true },
      );
      writeFileSync(
        join(
          root,
          "data/.canonical-db-source-refresh/active-transaction.json",
        ),
        "{}\n",
      );
      expect(() =>
        assertCanonicalDbSourceRefreshAvailable({
          root,
          operation: "query",
        })
      ).toThrow("marker is invalid");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
