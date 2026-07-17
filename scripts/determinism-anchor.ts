// Double-rebuild determinism gate (Step 3 / Track A, plan §2.2-§2.3).
//
// Rebuilds the canonical DB twice from the canonical JSONL (the source of truth) into temp files
// and asserts the two builds are byte-identical across three anchors:
//   * dump   — canonicalDbDump: row content of every non-FTS table + user_version (decision 5)
//   * fts    — ftsContentChecksum: logical FTS5 content (the virtual-table internals aren't byte-stable)
//   * master — sqlite_master text (the DDL-byte anchor that S3.3/S3.4 legitimately re-baseline)
//
// Prints the three hashes + a combined anchor. Run before and after each Track A stage and diff
// the output: S3.1/S3.2/S3.5 must leave `combined` UNCHANGED; S3.3/S3.4 re-baseline `master` (and
// thus `combined`) with a LOG entry, but `dump`+`fts` must still match the pre-stage values.

import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  rebuildCanonicalDb,
  openCanonicalDb,
  canonicalDbDump,
} from "../packages/db/src/canonical-db.js";
import { ftsContentChecksum } from "../packages/db/src/fts.js";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read.js";
import { readSubmissionEntries } from "../packages/pipeline/src/records/submissions.js";

function masterHash(db: Database): string {
  const rows = db
    .query("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
    .all() as Array<{ type: string; name: string; sql: string }>;
  return createHash("sha256").update(rows.map((r) => `${r.type} ${r.name}\n${r.sql}`).join("\n\n")).digest("hex");
}

function anchorsFor(path: string): { dump: string; fts: string; master: string } {
  const db = openCanonicalDb(path, { readonly: true });
  try {
    return { dump: canonicalDbDump(db), fts: ftsContentChecksum(db), master: masterHash(db) };
  } finally {
    db.close();
  }
}

const records = readCanonicalRecordsFromJsonl();
const submissions = readSubmissionEntries();
console.error(`loaded ${records.length} records, ${submissions.length} submissions from JSONL`);

const dir = mkdtempSync(join(tmpdir(), "det-anchor-"));
try {
  const pathA = join(dir, "a.db");
  const pathB = join(dir, "b.db");
  rebuildCanonicalDb(records, { path: pathA, submissions });
  rebuildCanonicalDb(records, { path: pathB, submissions });

  const a = anchorsFor(pathA);
  const b = anchorsFor(pathB);

  const fields = ["dump", "fts", "master"] as const;
  const mismatched = fields.filter((f) => a[f] !== b[f]);
  if (mismatched.length > 0) {
    console.error(`NON-DETERMINISTIC rebuild — differing anchors: ${mismatched.join(", ")}`);
    for (const f of mismatched) console.error(`  ${f}: A=${a[f]} B=${b[f]}`);
    process.exit(1);
  }

  const combined = createHash("sha256").update(`${a.dump}\n${a.fts}\n${a.master}`).digest("hex");
  console.log(JSON.stringify({ records: records.length, dump: a.dump, fts: a.fts, master: a.master, combined }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
