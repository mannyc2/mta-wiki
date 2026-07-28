import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "../../core/src/paths";
import {
  inspectLocalCorpusContract,
  LOCAL_CORPUS_CONTRACT_PATH,
  parseLocalCorpusContract,
  requireLocalCorpusContract,
} from "./support/corpus-contract";

const fixtureContract = {
  contract_id: "mta-wiki-local-corpus-v1",
  schema_version: 1,
  entries: [
    {
      source_id: "fixture_source",
      path: "raw/sources/fixture_source/source.txt",
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      bytes: 3,
      test_families: ["contract-fixture"],
    },
  ],
} as const;

function withFixture(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "mta-wiki-corpus-contract-"));
  try {
    mkdirSync(join(root, "data/test-contracts"), { recursive: true });
    writeFileSync(join(root, LOCAL_CORPUS_CONTRACT_PATH), `${JSON.stringify(fixtureContract)}\n`);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("clean-clone local corpus boundary", () => {
  it("strictly rejects unknown fields and paths outside the source root", () => {
    expect(() => parseLocalCorpusContract({ ...fixtureContract, extra: true })).toThrow("keys must be exactly");
    expect(() =>
      parseLocalCorpusContract({
        ...fixtureContract,
        entries: [fixtureContract.entries[0], fixtureContract.entries[0]],
      }),
    ).toThrow("paths must be unique");
    expect(() =>
      parseLocalCorpusContract({
        ...fixtureContract,
        entries: [{ ...fixtureContract.entries[0], sha256: "A".repeat(64) }],
      }),
    ).toThrow("lowercase SHA-256");
    expect(() =>
      parseLocalCorpusContract({
        ...fixtureContract,
        entries: [{ ...fixtureContract.entries[0], bytes: -1 }],
      }),
    ).toThrow("nonnegative safe integer");
    expect(() =>
      parseLocalCorpusContract({
        ...fixtureContract,
        entries: [{ ...fixtureContract.entries[0], path: "../source.txt" }],
      }),
    ).toThrow("must be normalized below");
  });

  it("reports every missing artifact without throwing", () => {
    withFixture((root) => {
      const inspection = inspectLocalCorpusContract(root);
      expect(inspection.present).toEqual([]);
      expect(inspection.missing.map((entry) => entry.path)).toEqual([
        "raw/sources/fixture_source/source.txt",
      ]);
      expect(inspection.mismatched).toEqual([]);
    });
  });

  it("fails preflight on mismatch and accepts exact pinned bytes", () => {
    withFixture((root) => {
      const sourceDir = join(root, "raw/sources/fixture_source");
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, "source.txt"), "abd");
      expect(() => requireLocalCorpusContract(root)).toThrow("mismatched raw/sources/fixture_source/source.txt");
      writeFileSync(join(sourceDir, "source.txt"), "abc");
      expect(requireLocalCorpusContract(root).present).toHaveLength(1);
    });
  });

  it("keeps every discovered default entrypoint classified and default-safe", () => {
    const inventory = JSON.parse(
      readFileSync(join(repoRoot, "data/test-contracts/test-local-dependency-inventory-v1.json"), "utf8"),
    ) as {
      entrypoint_count: number;
      unsafe_default_entrypoints: string[];
      rows: Array<{
        entrypoint_path: string;
        class: string;
        transitive_helper_chain: string[];
        safe_in_default_suite: boolean;
      }>;
    };
    expect(inventory.rows).toHaveLength(inventory.entrypoint_count);
    expect(inventory.unsafe_default_entrypoints).toEqual([]);
    expect(inventory.rows.every((row) => row.transitive_helper_chain.includes(row.entrypoint_path))).toBe(true);
    expect(inventory.rows.every((row) => row.class.length > 0 && row.safe_in_default_suite)).toBe(true);
    const helperMediated = inventory.rows.find(
      (row) => row.entrypoint_path === "packages/pipeline/test/records/bus-lane-treatment-scope-dispositions.test.ts",
    );
    expect(helperMediated?.transitive_helper_chain).toContain("scripts/audit-bus-lane-treatment-scope-v1.ts");
  });

  it("preserves the historical red checkpoint as historical evidence", () => {
    const path = join(
      repoRoot,
      "data/quality/study-frontier-closure/plan-041-final-checkpoint-v1.json",
    );
    const bytes = readFileSync(path);
    const checkpoint = JSON.parse(bytes.toString("utf8")) as {
      contract_id: string;
      clean_clone_test?: { status?: string };
      test?: { status?: string };
    };
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "a4eb448ade6361d85fe190103a74606017e4f5a244add480f92990ba45bf368f",
    );
    expect(checkpoint.contract_id).toBe("plan-041-final-checkpoint-v1");
    expect(JSON.stringify(checkpoint)).toContain("matches_known_missing_corpus_baseline");
  });
});
