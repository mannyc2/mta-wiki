// B2 (row validators from the single model source) + B5 (rebuild-based versioning) gates.

import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANONICAL_DB_VERSION, openCanonicalDb, rebuildCanonicalDb } from "../src/canonical-db.js";
import { requiredColumns, validateRow } from "../src/schema-validators.js";

describe("schema row validators (B2)", () => {
  it("required columns mirror the records NOT NULL / PRIMARY KEY columns", () => {
    expect(requiredColumns("records")).toEqual([
      "display_name",
      "generated_at",
      "local_observation_id",
      "payload",
      "primary_source_id",
      "record_id",
      "record_kind",
      "review_state",
      "truth_status",
    ]);
  });

  it("accepts a complete records row and rejects a missing NOT NULL field", () => {
    const ok = {
      record_id: "r1",
      record_kind: "route",
      display_name: "M14",
      raw_text: null,
      local_observation_id: "obs1",
      primary_source_id: "src1",
      payload: "{}",
      truth_status: "source_stated",
      review_state: "unreviewed",
      generated_at: "2026-06-10T00:00:00Z",
    };
    expect(validateRow("records", ok)).toEqual([]);
    const { display_name, ...missing } = ok;
    expect(validateRow("records", missing).length).toBeGreaterThan(0);
  });

  it("accepts null for a nullable promoted column and rejects a stray key", () => {
    expect(validateRow("routes", { record_id: "r1", route_id: null })).toEqual([]);
    expect(validateRow("routes", { record_id: "r1", route_id: "M14" })).toEqual([]);
    expect(validateRow("routes", { record_id: "r1", not_a_column: "x" }).length).toBeGreaterThan(0);
  });

  it("returns [] for unknown tables (no validator) rather than throwing", () => {
    expect(validateRow("nonexistent_table", { a: 1 })).toEqual([]);
  });
});

describe("rebuild-based versioning (B5)", () => {
  it("a freshly rebuilt DB carries user_version === CANONICAL_DB_VERSION and opens cleanly", () => {
    const path = join(tmpdir(), "version-gate.db");
    rebuildCanonicalDb([], { path });
    const db = openCanonicalDb(path, { readonly: true });
    try {
      const version = Number((db.query("PRAGMA user_version").get() as { user_version: number }).user_version);
      expect(version).toBe(CANONICAL_DB_VERSION);
    } finally {
      db.close();
    }
  });
});
