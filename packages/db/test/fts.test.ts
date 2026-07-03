// A5 FTS5 (docs/step-2-implementation-plan.md §S2.3, §5): the records_fts superset-then-verify
// equivalence guard and the blocks_fts ↔ cross-source superset guard. Both run against the live
// canonical.db (materialized with the FTS tables); they are the regression tests the original FTS
// deferral feared.

import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { canonicalDbPath, openCanonicalDb } from "../src/canonical-db.js";
import { readCanonicalRecordsFromDb } from "../src/canonical-db.js";
import {
  ftsIdentityShortlist,
  queryBelowTrigramFloor,
  recordBelowTrigramFloor,
  resolveIdentityCandidates,
  resolveIdentityCandidatesViaFts,
  type GlobalMtaRecordKind,
} from "../src/identity.js";

const GLOBAL_KINDS: GlobalMtaRecordKind[] = ["entity", "project", "corridor", "route"];
const haveDb = existsSync(canonicalDbPath());

describe("queryBelowTrigramFloor (DB-free superset guard)", () => {
  it("flags sub-trigram queries that can be substrings of longer record names", () => {
    // The W3 regression: "M2" is a substring of the new Queens "QM2"/"QM24" routes. A <3-char query
    // has no ≥3-char substring to trigram-MATCH on, so the FTS shortlist cannot be a superset and the
    // resolver must full-scan. (See ftsIdentityShortlist's early return.)
    expect(queryBelowTrigramFloor("M2")).toBe(true);
    expect(queryBelowTrigramFloor("M4")).toBe(true);
    expect(queryBelowTrigramFloor("B")).toBe(true);
    // ≥3-char queries are trigram-representable and keep using the prefilter.
    expect(queryBelowTrigramFloor("M86")).toBe(false);
    expect(queryBelowTrigramFloor("QM24")).toBe(false);
  });
});

describe.if(haveDb)("records_fts superset-then-verify equivalence (frozen corpus)", () => {
  it("falls back to full scan for long substring-expanded queries", () => {
    const db = openCanonicalDb(canonicalDbPath(), { readonly: true });
    try {
      expect(ftsIdentityShortlist(db, "project", "Forest Hills Station ADA Upgrades")).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it("FTS-prefiltered identity candidates equal the full-scan candidates", () => {
    const db = openCanonicalDb(canonicalDbPath(), { readonly: true });
    try {
      const records = readCanonicalRecordsFromDb(db);
      let comparisons = 0;
      const mismatches: string[] = [];
      for (const kind of GLOBAL_KINDS) {
        const sameKind = records.filter((record) => record.record_kind === kind);
        // Cover every containment-prone record (a < 3-char name value — single-letter subway routes,
        // etc., the cases the original deferral feared) plus a deterministic 1-in-4 sample of the
        // rest, queried by display_name. Bounds runtime while keeping the risky cases exhaustive.
        const queries = sameKind
          .filter((record, index) => recordBelowTrigramFloor(record) || index % 4 === 0)
          .map((record) => record.display_name)
          .filter((name): name is string => Boolean(name?.trim()));
        for (const query of queries) {
          const full = resolveIdentityCandidates(kind, query, sameKind);
          const viaFts = resolveIdentityCandidatesViaFts(db, kind, query, sameKind);
          comparisons += 1;
          if (JSON.stringify(viaFts) !== JSON.stringify(full)) {
            mismatches.push(`${kind} "${query}": fts=${viaFts.map((c) => c.record_id).join(",")} full=${full.map((c) => c.record_id).join(",")}`);
          }
        }
      }
      expect(comparisons).toBeGreaterThan(0);
      expect(mismatches.slice(0, 10)).toEqual([]);
    } finally {
      db.close();
    }
  }, 900_000);
});

describe.if(haveDb && process.env.MTA_ENABLE_BLOCKS_FTS === "1")("blocks_fts full-text source index", () => {
  it("is populated and trigram-searchable over staged source blocks", () => {
    const db = openCanonicalDb(canonicalDbPath(), { readonly: true });
    try {
      const rows = (db.query("SELECT COUNT(*) c FROM blocks_fts").get() as { c: number }).c;
      expect(rows).toBeGreaterThan(0);
      // Trigram substring search returns block rows carrying their source_id/block_id keys.
      const hits = db.query('SELECT source_id, block_id FROM blocks_fts WHERE blocks_fts MATCH ? LIMIT 1').all('"busway"') as Array<{ source_id: string; block_id: string }>;
      expect(hits.length).toBeGreaterThan(0);
      expect(typeof hits[0]!.source_id).toBe("string");
      expect(typeof hits[0]!.block_id).toBe("string");
    } finally {
      db.close();
    }
  });
});

describe.if(haveDb && process.env.MTA_ENABLE_BLOCKS_FTS !== "1")("blocks_fts schema-only guard", () => {
  it("keeps the generated block trigram index empty by default", () => {
    const db = openCanonicalDb(canonicalDbPath(), { readonly: true });
    try {
      const rows = (db.query("SELECT COUNT(*) c FROM blocks_fts").get() as { c: number }).c;
      expect(rows).toBe(0);
    } finally {
      db.close();
    }
  });
});
