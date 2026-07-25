import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  parseMemberGrainBlockReceipt,
  loadMemberGrainBlockReceipt,
} from "../../src/quality/member-grain-block-receipts";

const receipt = (): Record<string, unknown> =>
  JSON.parse(readFileSync(
    `${repoRoot}/data/quality/acquisition/receipts/member-grain/plan-040-package-11-reviewed-blocks-v1.json`,
    "utf8",
  )) as Record<string, unknown>;

describe("member-grain-block-receipt-v1", () => {
  test("strict-decodes the exact seven-row provenance-only receipt", () => {
    const parsed = parseMemberGrainBlockReceipt(receipt());
    expect(parsed.bindings).toHaveLength(7);
    expect(parsed.authorizes_decision_persistence).toBe(false);
    expect(parsed.authorizes_occurrence).toBe(false);
  });

  test("rejects duplicate, mismatched/orphan, and positive-row-shaped bindings", () => {
    const duplicate = receipt();
    const duplicateBindings = duplicate.bindings as Record<string, unknown>[];
    duplicateBindings[1] = structuredClone(duplicateBindings[0]!);
    expect(() => parseMemberGrainBlockReceipt(duplicate)).toThrow(/sorted and unique/u);

    for (const mutation of ["orphan", "positive"] as const) {
      const root = mkdtempSync(join(tmpdir(), "grain-block-receipt-"));
      const relative =
        "data/quality/acquisition/receipts/member-grain/plan-040-package-11-reviewed-blocks-v1.json";
      const source = receipt();
      const bindings = source.bindings as Record<string, unknown>[];
      if (mutation === "orphan") {
        bindings[0]!.member_extent_decision_id =
          "member-extent-review:orphan";
      } else {
        bindings[0]!.member_grain_decision_id =
          "member-grain-review:plan040-package11-treatment_q82-limited-stops-2025";
      }
      const destination = join(root, relative);
      mkdirSync(join(root, "data/quality/acquisition/receipts/member-grain"), {
        recursive: true,
      });
      writeFileSync(destination, `${JSON.stringify(source)}\n`);
      for (const artifact of source.artifacts as Array<{ path: string }>) {
        const target = join(root, artifact.path);
        mkdirSync(join(target, ".."), { recursive: true });
        cpSync(join(repoRoot, artifact.path), target);
      }
      expect(() => loadMemberGrainBlockReceipt(relative, root))
        .toThrow(/binding|denominator/u);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
