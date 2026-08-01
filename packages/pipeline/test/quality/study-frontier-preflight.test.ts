import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { describe, expect, test } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { runStudyFrontierPreflight } from "../../src/quality/study-frontier-preflight";

describe("Plan 041 study frontier preflight", () => {
  const fixtureRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), "study-frontier-open-"));
    // Copy only the preflight's declared inputs. Copying the entire tracked
    // data tree makes this unrelated fixture scale with every later campaign.
    for (const relativePath of [
      "data/quality",
      "data/contracts/operational-occurrence-member-extent",
      "data/exports/releases/v1-rc27/manifest.json",
      "packages/pipeline/src/quality/study-readiness-v1.ts",
    ]) {
      const target = join(root, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(repoRoot, relativePath), target, { recursive: true });
    }
    return root;
  };
  const mutateFirstJsonl = (
    root: string,
    relativePath: string,
    mutate: (row: Record<string, unknown>) => void,
  ): Record<string, unknown> => {
    const path = join(root, relativePath);
    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    const row = JSON.parse(lines[0]!) as Record<string, unknown>;
    mutate(row);
    lines[0] = stableJson(row as JsonValue);
    writeFileSync(path, `${lines.join("\n")}\n`);
    return row;
  };
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
    const root = fixtureRoot();
    const row = mutateFirstJsonl(
      root,
      "data/quality/operational-reference/bus-lane-identity-ledger.jsonl",
      (value) => {
        value.verdict = "unreviewed";
      },
    );
    expect(() => runStudyFrontierPreflight({ rootDir: root }))
      .toThrow(String(row.ledger_id));
    rmSync(root, { recursive: true, force: true });
  }, 30_000);

  test("rejects exceptions, receipt drift, open member rows, bridge drift, and v1 drift", () => {
    const cases: Array<{
      mutate: (root: string) => void;
      expected: string | RegExp;
    }> = [
      {
        mutate: (root) => writeFileSync(
          join(root, "data/quality/operational-reference/frontier-exceptions.json"),
          '{"schema_version":1,"exceptions":[{"ledger_id":"x"}]}\n',
        ),
        expected: "zero frontier exceptions",
      },
      {
        mutate: (root) => {
          const row = mutateFirstJsonl(
            root,
            "data/quality/operational-reference/bus-lane-identity-ledger.jsonl",
            (value) => {
              value.receipt_ids = ["missing-receipt"];
            },
          );
          const decision = join(
            root,
            "data/quality/operational-reference/bus-lane-identity-decisions",
            `${String(row.decision_id).split(":").at(-1)}.json`,
          );
          const value = JSON.parse(readFileSync(decision, "utf8")) as Record<string, unknown>;
          value.receipt_ids = ["missing-receipt"];
          writeFileSync(decision, `${JSON.stringify(value)}\n`);
        },
        expected: "unresolved receipt missing-receipt",
      },
      {
        mutate: (root) => {
          mutateFirstJsonl(
            root,
            "data/quality/operational-reference/member-extent-ledger.jsonl",
            (value) => {
              value.verdict = "unreviewed";
            },
          );
        },
        expected: "unreviewed member extent",
      },
      {
        mutate: (root) => {
          mutateFirstJsonl(
            root,
            "data/quality/operational-reference/member-grain-ledger.jsonl",
            (value) => {
              value.verdict = "unreviewed";
            },
          );
        },
        expected: "unreviewed member grain",
      },
      {
        mutate: (root) => {
          const path = join(
            root,
            "data/quality/operational-reference/member-grain-ledger.jsonl",
          );
          const lines = readFileSync(path, "utf8").trimEnd().split("\n");
          const index = lines.findIndex((line) =>
            line.includes('"service_scope":{"kind":')
          );
          const row = JSON.parse(lines[index]!) as Record<string, unknown>;
          row.gtfs_route_id = "DRIFT";
          lines[index] = stableJson(row as JsonValue);
          writeFileSync(path, `${lines.join("\n")}\n`);
        },
        expected: "grain decision does not bind the row",
      },
      {
        mutate: (root) => {
          const path = join(root, "data/quality/study-readiness/v1/bridge-ledger.jsonl");
          const lines = readFileSync(path, "utf8").trimEnd().split("\n");
          writeFileSync(path, `${lines.slice(0, -1).join("\n")}\n`);
          const freezePath = join(
            root,
            "data/quality/study-frontier-closure/plan-041-v1-baseline-freeze.json",
          );
          const freeze = JSON.parse(readFileSync(freezePath, "utf8")) as {
            frozen_files: Array<{ path: string; bytes: number; sha256: string }>;
          };
          const pin = freeze.frozen_files.find((entry) =>
            entry.path.endsWith("bridge-ledger.jsonl")
          )!;
          const bytes = readFileSync(path);
          pin.bytes = bytes.length;
          pin.sha256 = awaitHash(bytes);
          writeFileSync(freezePath, `${JSON.stringify(freeze)}\n`);
        },
        expected: /bridge|484/u,
      },
      {
        mutate: (root) => {
          const path = join(
            root,
            "packages/pipeline/src/quality/study-readiness-v1.ts",
          );
          writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
        },
        expected: "frozen v1 drift",
      },
      {
        mutate: (root) => {
          const path = join(
            root,
            "data/quality/study-frontier-closure/plan-041-v1-baseline-freeze.json",
          );
          const freeze = JSON.parse(readFileSync(path, "utf8")) as {
            frozen_files: unknown[];
          };
          freeze.frozen_files.pop();
          writeFileSync(path, `${JSON.stringify(freeze)}\n`);
        },
        expected: "exact sorted nine-file baseline",
      },
      {
        mutate: (root) => {
          const path = join(
            root,
            "data/quality/study-frontier-closure/plan-041-v1-baseline-freeze.json",
          );
          const freeze = JSON.parse(readFileSync(path, "utf8")) as {
            frozen_files: unknown[];
          };
          freeze.frozen_files.push(structuredClone(freeze.frozen_files.at(-1)!));
          writeFileSync(path, `${JSON.stringify(freeze)}\n`);
        },
        expected: "exact sorted nine-file baseline",
      },
      {
        mutate: (root) => {
          const path = join(
            root,
            "packages/pipeline/src/quality/study-readiness-v1.ts",
          );
          const target = `${path}.target`;
          writeFileSync(target, readFileSync(path));
          rmSync(path);
          symlinkSync(target, path);
        },
        expected: "expected normal file",
      },
    ];
    for (const fixture of cases) {
      const root = fixtureRoot();
      fixture.mutate(root);
      expect(() => runStudyFrontierPreflight({ rootDir: root }))
        .toThrow(fixture.expected);
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});

function awaitHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
