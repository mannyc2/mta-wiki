// D1 / S2.8 gap-report (docs/step-2-implementation-plan.md §S2.8, §5). Deterministic classification
// over the live canonical.db; every row names records, a severity, and resolving evidence.

import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { canonicalDbPath, openCanonicalDb } from "@mta-wiki/db/canonical-db";
import { collectGaps, type GapRow } from "@mta-wiki/pipeline/materialize/gap-report";

const haveDb = existsSync(canonicalDbPath());
const SEVERITIES = new Set(["high", "medium", "low"]);

describe.if(haveDb)("D1 gap-report", () => {
  it("classifies every prior phase's residue deterministically with well-formed rows", () => {
    const db = openCanonicalDb(canonicalDbPath(), { readonly: true });
    try {
      const a = collectGaps(db);
      const b = collectGaps(db);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // deterministic

      expect(a.length).toBeGreaterThan(0);
      for (const gap of a as GapRow[]) {
        expect(SEVERITIES.has(gap.severity)).toBe(true);
        expect(gap.gap_class.length).toBeGreaterThan(0);
        expect(gap.detail.length).toBeGreaterThan(0);
        expect(gap.resolving_evidence.length).toBeGreaterThan(0);
        expect(Array.isArray(gap.record_ids)).toBe(true);
      }

      // The phases that feed the report are each represented (every one has a known residue today).
      const classes = new Set(a.map((g) => g.gap_class));
      for (const expected of ["orphan_record", "source_undated", "dangling_reference", "value_conflict", "single_source_fact"]) {
        expect(classes.has(expected)).toBe(true);
      }
    } finally {
      db.close();
    }
  });
});
