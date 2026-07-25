import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { runStudyFrontierPreflight } from "../../src/quality/study-frontier-preflight";

describe("Plan 041 study frontier preflight", () => {
  test("closes the live frontier and verifies the frozen v1 tree", () => {
    const result = runStudyFrontierPreflight();
    expect(result.status).toBe("closed");
    expect(result.bus_lane_candidate_count).toBe(321);
    expect(result.member_extent_candidate_count).toBe(308);
    expect(result.member_grain_candidate_count).toBe(308);
    expect(result.bridge_candidate_count).toBe(484);
    expect(result.frontier_exception_count).toBe(0);
  });

  test("fails closed and names a fixture-open identity row", () => {
    const root = mkdtempSync(join(tmpdir(), "study-frontier-open-"));
    cpSync(join(repoRoot, "data"), join(root, "data"), { recursive: true });
    cpSync(
      join(repoRoot, "packages/pipeline/src/quality/study-readiness-v1.ts"),
      join(root, "packages/pipeline/src/quality/study-readiness-v1.ts"),
      { recursive: true },
    );
    const path = join(
      root,
      "data/quality/operational-reference/bus-lane-identity-ledger.jsonl",
    );
    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    const row = JSON.parse(lines[0]!) as Record<string, unknown>;
    row.verdict = "unreviewed";
    lines[0] = stableJson(row as JsonValue);
    writeFileSync(path, `${lines.join("\n")}\n`);
    expect(() => runStudyFrontierPreflight({ rootDir: root }))
      .toThrow(String(row.ledger_id));
  });
});
