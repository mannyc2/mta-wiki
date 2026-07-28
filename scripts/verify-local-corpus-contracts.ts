import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { requireLocalCorpusContract } from "../packages/pipeline/test/support/corpus-contract";
import { runCorpusAudit } from "../packages/pipeline/test/corpus/tracked-source-evidence.corpus";

try {
  const inspection = requireLocalCorpusContract(repoRoot);
  const failures = runCorpusAudit({ rootDir: repoRoot });
  if (failures.length > 0) throw new Error(`Local corpus audits failed:\n${failures.join("\n")}`);
  const files: string[] = [];
  const visit = (path: string): void => {
    for (const name of readdirSync(path).sort()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const child = join(path, name);
      if (statSync(child).isDirectory()) visit(child);
      else if (
        child.endsWith(".test.ts") &&
        /\b(?:corpusIt|describeCorpus)\b/u.test(
          readFileSync(child, "utf8"),
        )
      ) {
        files.push(relative(repoRoot, child));
      }
    }
  };
  visit(join(repoRoot, "packages"));
  const result = spawnSync(
    "bun",
    [
      "test",
      "--preload",
      "./packages/db/test/support/reproducible-canonical-db.ts",
      ...files,
      "--timeout",
      "900000",
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        MTA_TEST_LOCAL_PROFILE: "corpus",
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Local corpus profile failed with exit ${String(result.status)}`,
    );
  }
  console.log(`Local corpus contract verified: ${inspection.present.length} artifacts`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
