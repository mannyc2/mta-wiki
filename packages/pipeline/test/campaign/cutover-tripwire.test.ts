// A2 tripwire (docs/sqlite-cutover-and-ontology-plan.md): after the hard cutover the canonical DB
// is the single read store. These source-level invariants fail the build if any production code
// path silently reads the canonical JSONL again (the ambiguity the cutover removed). The canonical
// JSONL survives only as a frozen snapshot + the export-jsonl artifact, read only by the explicit
// forensic helpers — never by the default readers.

import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";

const SRC_DIRS = ["core", "db", "pipeline", "agents", "cli"].map((pkg) => join(repoRoot, "packages", pkg, "src"));

// Sanctioned JSONL entry points: canonical-read.ts (defines the readers), materialize.ts
// (the shadow write), export-jsonl.ts (the forensic export/verify), and the explicit public-clone SQLite rebuild
// command. Every JSONL invariant below exempts exactly these.
const FORENSIC_FILES = new Set([
  "packages/pipeline/src/materialize/canonical-read.ts",
  "packages/pipeline/src/materialize/materialize.ts",
  "packages/pipeline/src/materialize/export-jsonl.ts",
  "packages/cli/src/commands/materialize.ts",
]);

/** Every non-test .ts file under the package src trees, as [repo-relative path, contents]. */
function sourceFiles(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push([full.slice(repoRoot.length + 1), readFileSync(full, "utf8")]);
    }
  };
  for (const dir of SRC_DIRS) walk(dir);
  return out;
}

describe("hard cutover: reads are DB-only", () => {
  it("the mtime-freshness JSONL fallback machinery is gone", () => {
    const canonicalRead = readFileSync(join(repoRoot, "packages", "pipeline", "src", "materialize", "canonical-read.ts"), "utf8");
    expect(canonicalRead).not.toContain("withFreshCanonicalDb");
    expect(canonicalRead).not.toContain("canonicalDbFresherThanJsonl");
    expect(canonicalRead).toContain("function withCanonicalDb");
  });

  it("no default reader falls back to canonical JSONL (no `?? readCanonicalRecordsFromJsonl`)", () => {
    const offenders = sourceFiles()
      .filter(([path]) => !FORENSIC_FILES.has(path))
      .filter(([, text]) => /\?\?\s*readCanonicalRecordsFromJsonl/u.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("readCanonicalRecordsFromJsonl is invoked only by the export/forensic path, never elsewhere", () => {
    const offenders = sourceFiles()
      .filter(([path]) => !FORENSIC_FILES.has(path))
      .filter(([, text]) => /readCanonicalRecordsFromJsonl\s*\(/u.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("no production code opens a data/canonical/*.jsonl path for reading outside the forensic helpers", () => {
    // canonical-read.ts owns the sanctioned JSONL readers; materialize.ts owns the shadow write.
    const offenders = sourceFiles()
      .filter(([path]) => !FORENSIC_FILES.has(path))
      .filter(([, text]) => /canonicalDir\s*\(/u.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("validation does not rematerialize producer submissions", () => {
    const validate = readFileSync(join(repoRoot, "packages", "pipeline", "src", "validate.ts"), "utf8");
    expect(validate).not.toContain("entriesToRecords");
    expect(validate).not.toContain("records/submissions");
    expect(validate).toContain("materialize/canonical-read");
  });

  it("writer primitive parsing does not import the writer mutation gate", () => {
    const primitives = readFileSync(join(repoRoot, "packages", "pipeline", "src", "materialize", "primitives.ts"), "utf8");
    expect(primitives).not.toContain("writer-change-gate");
  });
});
