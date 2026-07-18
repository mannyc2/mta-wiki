import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { parseReleaseStatusRecord, readReleaseStatus } from "@mta-wiki/pipeline/materialize/release-status";
import { verifyReleaseDirectory } from "@mta-wiki/pipeline/materialize/release-verifier";

describe("release status", () => {
  it("exposes rc22 as quarantined outside its immutable release directory", () => {
    const status = readReleaseStatus(repoRoot, "v1-rc22");
    expect(status).toMatchObject({
      status: "quarantined",
      manifest_sha256: "249ef6be1d927e44d405c11bcff643d18b2133e5407be37dc7612f935a1b53e4",
      replacement_release_id: null,
      failing_artifact: {
        path: "operational_occurrence_review_decisions.json",
        sha256: "f18dda5c0c758d4193cb1dfdf69e296da79814ebcb39cdefb4e7dc9bec963bed",
        decoder_error: "operational occurrence review snapshot.decisions[12].evidence_bindings[2].role is unsupported: physical_scope",
      },
    });
  });

  it("rejects rc22 by quarantine status and, diagnostically, by its exact strict decoder defect", () => {
    const directory = join(repoRoot, "data", "exports", "releases", "v1-rc22");
    expect(() => verifyReleaseDirectory(directory)).toThrow("Release v1-rc22 is quarantined");
    expect(() => verifyReleaseDirectory(directory, "v1-rc22", { allowQuarantined: true })).toThrow(
      "operational occurrence review snapshot.decisions[12].evidence_bindings[2].role is unsupported: physical_scope",
    );
  });

  it("rejects unknown status fields and values instead of treating them as valid", () => {
    const status = readReleaseStatus(repoRoot, "v1-rc22")!;
    expect(() => parseReleaseStatusRecord({ ...status, status: "valid" })).toThrow("expected quarantined");
    expect(() => parseReleaseStatusRecord({ ...status, unrecognized: true })).toThrow("keys must be exactly");
  });

  it("fails closed when an index entry disagrees with its addressed record", () => {
    const root = mkdtempSync(join(tmpdir(), "release-status-"));
    const directory = join(root, "data", "exports", "release-status");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "index.json"), JSON.stringify({ schema_version: 1, records: [{ release_id: "v-other", path: "data/exports/release-status/record.json", status: "quarantined" }] }));
    writeFileSync(join(directory, "record.json"), JSON.stringify(readReleaseStatus(repoRoot, "v1-rc22")));
    expect(() => readReleaseStatus(root, "v-other")).toThrow("record mismatch for v-other");
  });
});
