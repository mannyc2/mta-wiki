import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  CANONICAL_DB_TEST_PATH_ENV,
  rebuildCanonicalDb,
} from "@mta-wiki/db/canonical-db";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";

export const REPRODUCIBLE_TEST_REPO_ROOT_ENV = "MTA_TEST_REPO_ROOT";

function readTrackedCanonicalRecords(): MtaCanonicalRecord[] {
  const directory = join(repoRoot, "data", "canonical");
  const records: MtaCanonicalRecord[] = [];
  for (const fileName of readdirSync(directory).filter((name) => name.endsWith(".jsonl")).sort()) {
    const contents = readFileSync(join(directory, fileName), "utf8");
    for (const line of contents.split(/\r?\n/u)) {
      if (line.trim()) records.push(JSON.parse(line) as MtaCanonicalRecord);
    }
  }
  if (records.length === 0) {
    throw new Error("clean-clone test preload found no tracked canonical JSONL records");
  }
  return records;
}

if (!process.env[CANONICAL_DB_TEST_PATH_ENV]) {
  const root = mkdtempSync(join(tmpdir(), "mta-wiki-test-canonical-db-"));
  const viewRoot = join(root, "repo");
  const dataRoot = join(viewRoot, "data");
  mkdirSync(dataRoot, { recursive: true });
  for (const name of readdirSync(join(repoRoot, "data")).sort()) {
    if (name === "canonical.db") continue;
    symlinkSync(join(repoRoot, "data", name), join(dataRoot, name));
  }
  const path = join(dataRoot, "canonical.db");
  process.env[CANONICAL_DB_TEST_PATH_ENV] = path;
  process.env[REPRODUCIBLE_TEST_REPO_ROOT_ENV] = viewRoot;
  rebuildCanonicalDb(readTrackedCanonicalRecords(), { path });

  process.once("exit", () => {
    rmSync(root, { recursive: true, force: true });
  });
}
