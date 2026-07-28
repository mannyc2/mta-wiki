import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  runResolvedPackReferenceAdapter,
} from "@mta-wiki/pipeline/consumer/reference-adapter";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("standalone resolved-pack reference adapter", () => {
  it("matches the independently hand-reviewed fixture oracle", () => {
    const root = join(repoRoot, "data", "contract-fixtures", "resolved-transit-pack-v1-hand-reviewed");
    const manifest = JSON.parse(readFileSync(join(root, "fixture-manifest.json"), "utf8")) as {
      expected_output_is_producer_generated: boolean;
      files: Array<{ path: string; sha256: string }>;
    };
    expect(manifest.expected_output_is_producer_generated).toBe(false);
    for (const file of manifest.files) {
      expect(createHash("sha256").update(readFileSync(join(root, file.path))).digest("hex"))
        .toBe(file.sha256);
    }
    const expected = JSON.parse(readFileSync(join(root, "expected-output.json"), "utf8"));
    expect(runResolvedPackReferenceAdapter(join(root, "public"))).toEqual(expected);
  });

  it("runs from a directory containing only public fixture files", () => {
    const root = join(repoRoot, "data", "contract-fixtures", "resolved-transit-pack-v1-hand-reviewed");
    const isolated = mkdtempSync(join(tmpdir(), "resolved-pack-public-only-"));
    dirs.push(isolated);
    cpSync(join(root, "public"), isolated, { recursive: true });
    expect(runResolvedPackReferenceAdapter(isolated))
      .toEqual(runResolvedPackReferenceAdapter(join(root, "public")));
    const source = readFileSync(
      join(repoRoot, "packages", "pipeline", "src", "consumer", "reference-adapter.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/canonical|sqlite|record-id|record_id|repoRoot/u);
  });
});
