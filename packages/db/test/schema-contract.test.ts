// Schema contract (Step 3 / S3.5, docs/step-3-implementation-plan.md §2.4) — the permanent
// replacement for schema-drift.test.ts now that the codegen is deleted. Drift can no longer hide:
//   * tables-cover-projection: every per-kind column maps to a known KIND_SPECS field or runner
//     companion with the right scalar→SQL type (catches typos + orphan columns + wrong types),
//   * every plain table is STRICT; every virtual table is FTS5,
//   * both CHECKs (record_kind, provenance) survive in the rendered DDL,
//   * the schema is deterministic: two builds from SCHEMA_DDL give identical sqlite_master text,
//   * no hand-written CREATE TABLE/INDEX/VIRTUAL TABLE outside the renderer (schema-ddl.ts).

import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { SCHEMA_DDL } from "../src/schema-ddl.js";
import { PROMOTED_KINDS, promotedColumnsFromTable, promotedTableName, type SqlColumnType } from "../src/record-columns.js";
import { kindSpec, RUNNER_OWNED_FIELDS, type KindFieldType } from "../src/kind-registry.js";

const mtaDir = fileURLToPath(new URL(".", import.meta.url));

const SCALAR_SQL: Partial<Record<KindFieldType, SqlColumnType>> = { string: "TEXT", number: "REAL", boolean: "INTEGER" };

function buildSchemaOnly(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const stmt of SCHEMA_DDL) db.exec(stmt);
  return db;
}

function schemaMaster(db: Database): Array<{ type: string; name: string; sql: string }> {
  return db
    .query('SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE "sqlite_%" ORDER BY type, name')
    .all() as Array<{ type: string; name: string; sql: string }>;
}

describe("tables-cover-projection (every per-kind column is a legal field/companion with the right type)", () => {
  for (const kind of PROMOTED_KINDS) {
    it(`${kind}: columns map to KIND_SPECS fields/companions`, () => {
      const spec = kindSpec(kind);
      expect(spec).toBeDefined();
      const byField = new Map((spec!.fields ?? []).map((f) => [f.name, f.type]));
      for (const col of promotedColumnsFromTable(kind)) {
        if (RUNNER_OWNED_FIELDS.has(col.name)) {
          expect(col.sql).toBe("TEXT"); // companions are always TEXT
          continue;
        }
        const fieldType = byField.get(col.name);
        expect(fieldType, `${kind}.${col.name} is neither a known field nor a runner companion`).toBeDefined();
        expect(SCALAR_SQL[fieldType!]).toBe(col.sql);
      }
    });
  }
});

describe("rebuilt schema structure", () => {
  it("every plain table is STRICT; every virtual table is FTS5", () => {
    const db = buildSchemaOnly();
    try {
      const tables = schemaMaster(db).filter((o) => o.type === "table");
      const ftsNames = tables.filter((t) => /VIRTUAL TABLE/iu.test(t.sql)).map((t) => t.name);
      const isShadow = (name: string) => ftsNames.some((fts) => name.startsWith(`${fts}_`));
      for (const t of tables) {
        if (/VIRTUAL TABLE/iu.test(t.sql)) {
          expect(t.sql).toMatch(/USING fts5/iu);
          continue;
        }
        if (isShadow(t.name)) continue;
        expect(t.sql).toContain("STRICT");
      }
    } finally {
      db.close();
    }
  });

  it("the record_kind + provenance CHECKs survive", () => {
    const db = buildSchemaOnly();
    try {
      const tables = schemaMaster(db).filter((o) => o.type === "table");
      expect(tables.find((t) => t.name === "records")?.sql).toContain("CHECK (record_kind IN (");
      expect(tables.find((t) => t.name === "relations")?.sql).toContain(
        "CHECK (provenance IN ('authored','derived','canonicalizer'))",
      );
    } finally {
      db.close();
    }
  });

  it("is deterministic: two builds from SCHEMA_DDL produce identical sqlite_master text", () => {
    const hashOf = () => {
      const db = buildSchemaOnly();
      try {
        return createHash("sha256").update(schemaMaster(db).map((o) => `${o.type} ${o.name}\n${o.sql}`).join("\n\n")).digest("hex");
      } finally {
        db.close();
      }
    };
    expect(hashOf()).toBe(hashOf());
  });

  it("the schema covers all promoted per-kind tables", () => {
    const db = buildSchemaOnly();
    try {
      const names = new Set(schemaMaster(db).filter((o) => o.type === "table").map((t) => t.name));
      for (const kind of PROMOTED_KINDS) expect(names.has(promotedTableName(kind)!)).toBe(true);
    } finally {
      db.close();
    }
  });
});

describe("no hand-written DDL outside the renderer", () => {
  it("has no CREATE [VIRTUAL] TABLE/INDEX string literals outside schema-ddl.ts / tests", () => {
    const exempt = new Set(["schema-ddl.ts"]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith(".ts") || entry.endsWith(".test.ts") || exempt.has(entry)) continue;
        if (/CREATE\s+(VIRTUAL\s+TABLE|TABLE|INDEX)/u.test(readFileSync(full, "utf8"))) offenders.push(entry);
      }
    };
    walk(mtaDir);
    expect(offenders).toEqual([]);
  });
});
