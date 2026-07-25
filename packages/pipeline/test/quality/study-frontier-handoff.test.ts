import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  parseStudyFrontierProducerHandoff,
  verifyStudyFrontierProducerHandoff,
} from "../../src/quality/study-frontier-handoff";

const receiptPath =
  "data/quality/study-frontier-closure/plan-041-producer-handoff.json";
const work = mkdtempSync(join(repoRoot, ".study-frontier-handoff-test-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function receipt(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(`${repoRoot}/${receiptPath}`, "utf8"),
  ) as Record<string, unknown>;
}

function writeReceipt(name: string, value: Record<string, unknown>): string {
  const path = join(work, name);
  writeFileSync(path, `${JSON.stringify(value)}\n`);
  return relative(repoRoot, path).replaceAll("\\", "/");
}

describe("Plan 041 producer handoff", () => {
  test("strict-decodes the fixed receipt and preserves the non-authorizing evidence policy", () => {
    const parsed = parseStudyFrontierProducerHandoff(receipt());
    expect(parsed.release_id).toBe("v1-rc28");
    expect(parsed.bridge_v2.candidate_count).toBe(484);
    expect(parsed.artifacts.identity_verdict.row_count).toBe(321);
    expect(parsed.artifacts.member_extent.row_count).toBe(308);
    expect(parsed.artifacts.member_grain.row_count).toBe(308);
    expect(parsed.frontier_exception_count).toBe(0);
    expect(parsed.evidence_policy).toEqual({
      exact_positive_required: true,
      authoritative_historical_full_stop_inventory_required: true,
      stop_id_equivalence_acquisition_required: true,
      occurrence_inference_prohibited: true,
    });
    expect(Object.values(parsed.authority).every((value) => value === false))
      .toBeTrue();
  });

  test("rejects unknown fields, non-local transport, weakened evidence policy, and authority", () => {
    const extra = receipt();
    extra.unreviewed_extension = true;
    expect(() => parseStudyFrontierProducerHandoff(extra))
      .toThrow("exact fields required");

    const remote = receipt();
    (remote.transport as Record<string, unknown>).mode = "github_asset";
    expect(() => parseStudyFrontierProducerHandoff(remote))
      .toThrow("repository_local required");

    const weakened = receipt();
    (
      weakened.evidence_policy as Record<string, unknown>
    ).exact_positive_required = false;
    expect(() => parseStudyFrontierProducerHandoff(weakened))
      .toThrow("fail-closed requirements must be true");

    const authorized = receipt();
    (authorized.authority as Record<string, unknown>).authorizes_study = true;
    expect(() => parseStudyFrontierProducerHandoff(authorized))
      .toThrow("every authority flag must be false");
  });

  test("independently verifies every addressed byte, count, release pointer, and reconciliation row", () => {
    const result = verifyStudyFrontierProducerHandoff(receiptPath);
    expect(result).toEqual({
      schema_version: 1,
      status: "verified",
      transport_mode: "repository_local",
      release_id: "v1-rc28",
      manifest_sha256:
        "b47a105dc78501210f2d32e6f597f878203b8cfc35654cebc4de445d575a453c",
      manifest_version: 6,
      verified_release_file_count: 383,
      verified_artifact_count: 9,
      verified_candidate_count: 484,
    });
  });

  test("verifier rejects post-parse artifact tampering and symlinked receipt bytes", () => {
    const tampered = receipt();
    (
      (
        tampered.artifacts as Record<string, unknown>
      ).identity_verdict as Record<string, unknown>
    ).sha256 = "0".repeat(64);
    expect(() =>
      verifyStudyFrontierProducerHandoff(
        writeReceipt("tampered-hash.json", tampered),
      )
    ).toThrow("SHA-256 mismatch");

    const receiptLink = join(work, "receipt-link.json");
    symlinkSync(
      join(repoRoot, receiptPath),
      receiptLink,
    );
    expect(() =>
      verifyStudyFrontierProducerHandoff(
        relative(repoRoot, receiptLink).replaceAll("\\", "/"),
      )
    ).toThrow("regular non-symlink file");
  });
});
