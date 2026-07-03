// S3.2 validator contract (docs/step-3-implementation-plan.md §2.5, §3 S3.2). The bar the
// drizzle-orm/typebox swap must meet, asserted per table so a silent weakening cannot hide:
//   (a) a valid row passes,
//   (b) a stray key fails           (additionalProperties:false post-process),
//   (c) dropping any required column fails,
//   (d) requiredColumns(table) == the NOT NULL ∪ PK set, computed here from getTableConfig
//       (the S2 era compared against the structured authoring model; S3.5 re-pointed it),
// plus the scalar type mapping (TEXT→string, INTEGER→integer, REAL→number).
//
// These tests are designed to be RED against the raw drizzle emission (open objects) and GREEN only
// once the §2.5 post-process is applied — verified red-first at landing (LOG 2026-06-10).

import { describe, expect, it } from "bun:test";
import type { TSchema } from "typebox";
import { requiredColumns, tableValidator, validateRow, type Row } from "../src/schema-validators.js";
import { tablesByName } from "../src/schema.js";
import { getTableConfig } from "drizzle-orm/sqlite-core";

/** NOT NULL ∪ PK reference from the table config (re-pointed to getTableConfig in S3.5). */
function modelRequired(tableName: string): string[] {
  const table = tablesByName[tableName];
  if (!table) throw new Error(`no table for ${tableName}`);
  const cfg = getTableConfig(table);
  const names = new Set<string>();
  for (const c of cfg.columns) if (c.notNull || c.primary) names.add(c.name);
  for (const pk of cfg.primaryKeys) for (const c of pk.columns) names.add(c.name);
  return [...names].sort();
}

const TABLE_NAMES = Object.keys(tablesByName);

/** A type-appropriate sample for a (required ⇒ non-nullable) property's scalar type. */
function sampleFor(prop: { type?: string; anyOf?: Array<{ type?: string }> }): string | number | boolean {
  const type = prop.type ?? prop.anyOf?.find((s) => s.type !== "null")?.type;
  switch (type) {
    case "integer":
      return 1;
    case "number":
      return 1.5;
    case "boolean":
      return true;
    default:
      return "x";
  }
}

/** Smallest row that satisfies a table's required columns. */
function minimalValidRow(schema: TSchema): Row {
  const s = schema as TSchema & { required?: string[]; properties: Record<string, { type?: string; anyOf?: Array<{ type?: string }> }> };
  const row: Row = {};
  for (const name of s.required ?? []) row[name] = sampleFor(s.properties[name]!);
  return row;
}

describe("validator contract — every table (S3.2)", () => {
  for (const table of TABLE_NAMES) {
    describe(table, () => {
      const schema = tableValidator(table);

      it("has a validator", () => {
        expect(schema).toBeDefined();
      });

      it("requiredColumns equals the model's NOT NULL ∪ PK set", () => {
        expect(requiredColumns(table)).toEqual(modelRequired(table));
      });

      it("accepts a minimal valid row", () => {
        expect(validateRow(table, minimalValidRow(schema!))).toEqual([]);
      });

      it("rejects a stray key (additionalProperties:false)", () => {
        const row = { ...minimalValidRow(schema!), __definitely_not_a_column__: "x" };
        expect(validateRow(table, row).length).toBeGreaterThan(0);
      });

      it("rejects dropping any single required column", () => {
        const base = minimalValidRow(schema!);
        for (const col of requiredColumns(table)) {
          const { [col]: _dropped, ...without } = base;
          expect(validateRow(table, without as Row).length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe("validator contract — scalar type mapping (S3.2)", () => {
  const recordsRow = {
    record_id: "r1", record_kind: "route", display_name: "M14", raw_text: null,
    local_observation_id: "o", primary_source_id: "s", payload: "{}",
    truth_status: "source_stated", review_state: "unreviewed", generated_at: "2026-06-10T00:00:00Z",
  };

  it("TEXT rejects a non-string (records.display_name)", () => {
    expect(validateRow("records", { ...recordsRow, display_name: 123 } as unknown as Row).length).toBeGreaterThan(0);
  });

  it("INTEGER accepts an int and rejects a non-int (evidence_refs.ordinal)", () => {
    const base = { record_id: "r1", ordinal: 3, ref_json: "{}", source_id: "s1" };
    expect(validateRow("evidence_refs", base)).toEqual([]);
    expect(validateRow("evidence_refs", { ...base, ordinal: 3.5 }).length).toBeGreaterThan(0);
  });

  it("REAL accepts a number and rejects a string (metric_claims.value)", () => {
    expect(validateRow("metric_claims", { record_id: "m1", value: 3.5 })).toEqual([]);
    expect(validateRow("metric_claims", { record_id: "m1", value: "3.5" } as unknown as Row).length).toBeGreaterThan(0);
  });

  it("accepts an omitted nullable column and null for it (routes.route_id)", () => {
    expect(validateRow("routes", { record_id: "r1" })).toEqual([]);
    expect(validateRow("routes", { record_id: "r1", route_id: null })).toEqual([]);
  });
});
