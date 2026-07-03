// TypeBox row validators for canonical tables (Track B, B2; Step 3 / S3.2 cutover).
//
// Built from the drizzle table objects via `drizzle-orm/typebox` `createInsertSchema` — the same
// tables that drive the DDL and the typed queries — so a NOT NULL column, its required validator
// field, and the DDL column stay provably in sync (one source). The validators come from our
// `typebox@1.x` (verified: createInsertSchema output validates correctly under typebox@1.1.38);
// the deprecated standalone `drizzle-typebox` package (peer-deps the pre-rename @sinclair/typebox)
// is never used.
//
// Insert validators run at the materialize boundary (rebuildCanonicalDb) to turn a malformed row
// into a clear, located error before the STRICT insert. Select validators are available for dev/test
// assertions on the read assembler without adding cost to the production read path.
//
// One post-process is required (§2.5): drizzle-orm/typebox emits *open* objects (no
// additionalProperties), but our contract is stray-key rejection so drift surfaces loudly. We set
// `additionalProperties: false` on each emitted schema — TypeBox schemas are plain JSON, and
// Value.Check honours the keyword (verified). The required-set drizzle emits already equals the
// DDL's NOT NULL ∪ PK set (no column carries a SQL default), so no other adjustment is needed.

import { type TSchema } from "typebox";
import { Value } from "typebox/value";
import { createInsertSchema } from "drizzle-orm/typebox";
import { is, getTableName } from "drizzle-orm";
import { SQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import * as schemaTables from "./schema.js";

type RowValue = string | number | boolean | null;
export type Row = Record<string, RowValue>;

/** Every hand/codegen drizzle table, discovered by brand — order-independent. */
function allTables(): SQLiteTable[] {
  return (Object.values(schemaTables) as unknown[]).filter((value): value is SQLiteTable => is(value, SQLiteTable));
}

/** Insert schema for a table, closed to stray keys (§2.5). */
function buildValidator(table: SQLiteTable): TSchema {
  const schema = createInsertSchema(table) as TSchema & { additionalProperties?: boolean };
  schema.additionalProperties = false;
  return schema;
}

/** Required (NOT NULL / PK) column names per table, from the table config — the provable mirror of
 *  the DDL. Composite-PK columns are also NOT NULL in our schema, but we union the primary-key set
 *  too so the mirror holds for any future composite key. */
function requiredColumnsOf(table: SQLiteTable): string[] {
  const config = getTableConfig(table);
  const names = new Set<string>();
  for (const column of config.columns) if (column.notNull || column.primary) names.add(column.name);
  for (const pk of config.primaryKeys) for (const column of pk.columns) names.add(column.name);
  return [...names].sort();
}

const VALIDATORS: Map<string, TSchema> = new Map(allTables().map((t) => [getTableName(t), buildValidator(t)]));
const REQUIRED: Map<string, string[]> = new Map(allTables().map((t) => [getTableName(t), requiredColumnsOf(t)]));

/** Required (NOT NULL / PK) column names per table — the provable mirror of the DDL. */
export function requiredColumns(table: string): string[] {
  return REQUIRED.get(table) ?? [];
}

/** Validate a row against its table schema. Returns located issues; empty means valid. */
export function validateRow(table: string, row: Row): string[] {
  const schema = VALIDATORS.get(table);
  if (!schema) return [];
  if (Value.Check(schema, row)) return [];
  return [...Value.Errors(schema, row)].map((e) => `${table}${e.instancePath} ${e.message}`);
}

export function tableValidator(table: string): TSchema | undefined {
  return VALIDATORS.get(table);
}
