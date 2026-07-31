import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "../../../core/src/paths";
import {
  assertRelationshipEnforcementSourceRefreshReceipt,
} from "../../../db/src/relationship-contract";
import {
  assertOwnedEmptyOutputDirectory,
  loadRelationshipCompletenessArtifacts,
  REVIEWED_PUBLIC_SNAPSHOT_COVERAGE_MANIFEST_BYTES,
  REVIEWED_PUBLIC_SNAPSHOT_COVERAGE_MANIFEST_SHA256,
  REVIEWED_PUBLIC_SNAPSHOT_RELEASE_DIR,
  REVIEWED_PUBLIC_SNAPSHOT_RELEASE_MANIFEST_SHA256,
} from "../../src/quality/relationship-completeness";
import {
  checkRelationshipEnforcementSourceRefreshReceipt,
} from "../../../../scripts/write-relationship-enforcement-source-refresh-receipt";

const trackedRoot =
  "data/quality/relationship-integrity/completeness";

function withTemporaryRoot(run: (root: string) => void): void {
  const root = mkdtempSync(
    join(tmpdir(), "mta-completeness-boundary-"),
  );
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function prepare(root: string) {
  return loadRelationshipCompletenessArtifacts({
    releaseDir: REVIEWED_PUBLIC_SNAPSHOT_RELEASE_DIR,
    releaseSourceDir: REVIEWED_PUBLIC_SNAPSHOT_RELEASE_DIR,
    coverageDir: "data/quality/operational-coverage",
    outputDir: join(root, "completeness"),
    ownedOutputRoot: root,
    expectedReleaseManifestSha256:
      REVIEWED_PUBLIC_SNAPSHOT_RELEASE_MANIFEST_SHA256,
    prepareReviewedPublicSnapshotRefresh: true,
  });
}

describe("reviewed current public-snapshot completeness boundary", () => {
  it("keeps manifest bytes distinct from row-bearing child counts", () => {
    const manifestText = readFileSync(
      join(
        repoRoot,
        "data/quality/operational-coverage/manifest.json",
      ),
      "utf8",
    );
    expect(Buffer.byteLength(manifestText)).toBe(
      REVIEWED_PUBLIC_SNAPSHOT_COVERAGE_MANIFEST_BYTES,
    );
    expect(
      new Bun.CryptoHasher("sha256").update(manifestText).digest("hex"),
    ).toBe(REVIEWED_PUBLIC_SNAPSHOT_COVERAGE_MANIFEST_SHA256);
    const manifest = JSON.parse(manifestText) as {
      files: Record<string, { bytes: number; row_count?: number }>;
    };
    expect(
      manifest.files["recoverability-ledger.jsonl"],
    ).toMatchObject({ row_count: 2931, bytes: 21716926 });
    expect(
      (JSON.parse(
        readFileSync(
          join(repoRoot, trackedRoot, "summary.json"),
          "utf8",
        ),
      ) as {
        input_pins: Array<{
          path: string;
          bytes: number;
          row_count?: number;
        }>;
      }).input_pins.find((pin) =>
        pin.path ===
          "data/quality/operational-coverage/manifest.json"
      ),
    ).toEqual({
      path: "data/quality/operational-coverage/manifest.json",
      sha256:
        REVIEWED_PUBLIC_SNAPSHOT_COVERAGE_MANIFEST_SHA256,
      bytes: 1584,
    });
  });

  it("prepares a lossless candidate with only reviewed pin/report drift", () => {
    withTemporaryRoot((root) => {
      const candidate = prepare(root);
      for (const name of [
        "bus-lane-treatment-completeness.jsonl",
        "occurrence-completeness.jsonl",
        "occurrence-treatment-physicality.jsonl",
        "operational-event-completeness.jsonl",
        "route-identity-completeness.jsonl",
      ]) {
        expect(candidate.contents[name]).toBe(
          readFileSync(join(repoRoot, trackedRoot, name), "utf8"),
        );
      }
      const oldSummary = JSON.parse(
        readFileSync(
          join(repoRoot, trackedRoot, "summary.json"),
          "utf8",
        ),
      ) as Record<string, unknown>;
      const newSummary = JSON.parse(
        candidate.contents["summary.json"]!,
      ) as Record<string, unknown>;
      delete oldSummary.input_fingerprint;
      delete oldSummary.input_pins;
      delete newSummary.input_fingerprint;
      delete newSummary.input_pins;
      expect(newSummary).toEqual(oldSummary);
      const trackedReport = readFileSync(
        join(repoRoot, trackedRoot, "report.md"),
        "utf8",
      );
      expect(candidate.contents["report.md"]).toBe(trackedReport);
    });
  });

  it("checks the strict installed receipt against regenerated candidate bytes", () => {
    withTemporaryRoot((root) => {
      const candidate = prepare(root);
      mkdirSync(join(root, "completeness"));
      for (const [name, content] of Object.entries(candidate.contents)) {
        writeFileSync(join(root, "completeness", name), content);
      }
      const receiptPath = (
        JSON.parse(
          readFileSync(
            join(repoRoot, "data/contracts/relationships/v1/contract.json"),
            "utf8",
          ),
        ) as {
          enforcement_proof: {
            source_refresh_receipt: { path: string };
          };
        }
      ).enforcement_proof.source_refresh_receipt.path;
      const receipt =
        checkRelationshipEnforcementSourceRefreshReceipt({
          candidateDir: join(root, "completeness"),
          publicSnapshotClosurePath:
            "data/test-contracts/producer-input-closure-v1.json",
          receiptPath: join(repoRoot, receiptPath),
        });
      assertRelationshipEnforcementSourceRefreshReceipt(receipt);
      expect(receipt.unchanged_row_artifacts).toHaveLength(5);
      expect(receipt.allowed_json_pointer_changes).toHaveLength(0);
      expect(receipt.previous_source_refresh_receipt).toBeDefined();
      expect(receipt.previous_active_proof.path).toBe(
        `data/contracts/relationships/v1/enforcement-proofs/${receipt.previous_active_proof.sha256}/proof.json`,
      );
      expect(() =>
        assertRelationshipEnforcementSourceRefreshReceipt({
          ...receipt,
          unexpected: true,
        } as never)
      ).toThrow("header is invalid");
    });
  });

  it("rejects traversal, symlink ancestry, existing output, and rc20 guard weakening", () => {
    withTemporaryRoot((root) => {
      expect(() =>
        assertOwnedEmptyOutputDirectory(root, root)
      ).toThrow("strict descendant");
      mkdirSync(join(root, "existing"));
      expect(() =>
        assertOwnedEmptyOutputDirectory(
          join(root, "existing"),
          root,
        )
      ).toThrow("must not already exist");
      mkdirSync(join(root, "real"));
      symlinkSync(join(root, "real"), join(root, "link"));
      expect(() =>
        assertOwnedEmptyOutputDirectory(
          join(root, "link", "candidate"),
          root,
        )
      ).toThrow("symlinks");
      expect(() =>
        loadRelationshipCompletenessArtifacts({
          releaseDir: REVIEWED_PUBLIC_SNAPSHOT_RELEASE_DIR,
          releaseSourceDir: REVIEWED_PUBLIC_SNAPSHOT_RELEASE_DIR,
          outputDir: trackedRoot,
          reviewedCurrentCorpusMigration: true,
        })
      ).toThrow(
        "restricted to the default rc20 release/completeness output boundary",
      );
    });
  });
});
