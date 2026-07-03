// C2 / S2.6 lifecycle + temporal views (docs/step-2-implementation-plan.md §S2.6, §5). The flagship
// SELECT (parent plan §6 C2.2) must run verbatim; resolved_status must fold to one row per subject.
// Runs against the live canonical.db (materialized with the views).

import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { canonicalDbPath, openCanonicalDb } from "@mta-wiki/db/canonical-db";

const haveDb = existsSync(canonicalDbPath());

const FLAGSHIP = `
  SELECT p.project_name, lp.lifecycle_phase, lp.date_normalized, lp.date_precision,
         r.route_id, lp.document_time_status, lp.source_id, lp.evidence_block
  FROM lifecycle_entries lp
  JOIN projects p ON p.record_id = lp.project_record_id
  LEFT JOIN routes r ON r.record_id = lp.route_record_id
  WHERE p.record_id = ? AND (? IS NULL OR r.record_id = ?)
  ORDER BY lp.date_normalized`;

describe.if(haveDb)("C2 lifecycle views", () => {
  it("runs the parent-plan flagship SELECT verbatim and returns shaped rows", () => {
    const db = openCanonicalDb(canonicalDbPath(), { readonly: true });
    try {
      const anchor = db.query("SELECT project_record_id FROM lifecycle_entries WHERE project_record_id IS NOT NULL LIMIT 1").get() as { project_record_id: string } | null;
      expect(anchor).not.toBeNull();
      const rows = db.query(FLAGSHIP).all(anchor!.project_record_id, null, null) as Array<Record<string, unknown>>;
      expect(rows.length).toBeGreaterThan(0);
      // Shape contract: every column the query selects is present (data may be sparse/null).
      for (const key of ["project_name", "lifecycle_phase", "date_normalized", "date_precision", "route_id", "document_time_status", "source_id", "evidence_block"]) {
        expect(key in rows[0]!).toBe(true);
      }
    } finally {
      db.close();
    }
  });

  it("resolved_status folds to exactly one row per subject (latest credible phase)", () => {
    const db = openCanonicalDb(canonicalDbPath(), { readonly: true });
    try {
      const dupes = db.query("SELECT subject_record_id, COUNT(*) c FROM resolved_status GROUP BY subject_record_id HAVING c > 1").all();
      expect(dupes).toEqual([]);
      // Every resolved phase is a real, non-'other' phase (the fold excludes the passthrough bucket).
      const others = (db.query("SELECT COUNT(*) c FROM resolved_status WHERE lifecycle_phase = 'other' OR lifecycle_phase IS NULL").get() as { c: number }).c;
      expect(others).toBe(0);
    } finally {
      db.close();
    }
  });

  it("date_unnormalized only lists events with a date literal but no normalized date", () => {
    const db = openCanonicalDb(canonicalDbPath(), { readonly: true });
    try {
      const leak = (db.query("SELECT COUNT(*) c FROM date_unnormalized d JOIN events e ON e.record_id = d.record_id WHERE e.date_normalized IS NOT NULL").get() as { c: number }).c;
      expect(leak).toBe(0);
    } finally {
      db.close();
    }
  });
});
