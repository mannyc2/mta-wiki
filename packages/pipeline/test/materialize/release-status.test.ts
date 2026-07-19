import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  parseReleaseStatusIndex,
  parseReleaseStatusRecord,
  readReleaseStatus,
  serializeReleaseStatusIndex,
  serializeReleaseStatusRecord,
} from "@mta-wiki/pipeline/materialize/release-status";
import { verifyReleaseDirectory } from "@mta-wiki/pipeline/materialize/release-verifier";

describe("release status", () => {
  it("exposes rc22 as quarantined outside its immutable release directory", () => {
    const status = readReleaseStatus(repoRoot, "v1-rc22");
    expect(status).toMatchObject({
      status: "quarantined",
      manifest_sha256: "249ef6be1d927e44d405c11bcff643d18b2133e5407be37dc7612f935a1b53e4",
      replacement_release_id: "v1-rc23",
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

  it("dispatches mixed status records and quarantines rc23 for exact route collapse", () => {
    const rc22 = readReleaseStatus(repoRoot, "v1-rc22");
    const rc23 = readReleaseStatus(repoRoot, "v1-rc23");
    expect(rc22?.schema_version).toBe(1);
    expect(rc23).toMatchObject({ schema_version: 2, reason_code: "ROUTE_IDENTITY_RC23_B44_PLUS_UNCOVERED", replacement_release_id: "v1-rc24", failing_artifact: { path: "route_anchors.jsonl", declared_contract_version: null, detected_by_contract: "route-identity-snapshot-v1" } });
    expect(rc23?.schema_version === 2 ? rc23.affected_identities.map((identity) => identity.gtfs_route_id) : []).toEqual(["B44+", "B82+", "BX6+"]);
    const directory = join(repoRoot, "data", "exports", "releases", "v1-rc23");
    expect(() => verifyReleaseDirectory(directory)).toThrow("ROUTE_IDENTITY_RC23_B44_PLUS_UNCOVERED");
    expect(() => verifyReleaseDirectory(directory, "v1-rc23", { allowQuarantined: true })).toThrow(
      "ROUTE_IDENTITY_RC23_B44_PLUS_UNCOVERED",
    );
  });

  it("strictly validates deterministic v2 route quarantine identities", () => {
    const status = readReleaseStatus(repoRoot, "v1-rc23");
    expect(status?.schema_version).toBe(2);
    if (!status || status.schema_version !== 2) throw new Error("expected rc23 status-v2 fixture");
    expect(() => parseReleaseStatusRecord({
      ...status,
      affected_identities: [...status.affected_identities].reverse(),
    })).toThrow("expected sorted unique values");
    expect(() => parseReleaseStatusRecord({
      ...status,
      affected_identities: status.affected_identities.map((identity, index) =>
        index === 0 ? { ...identity, route_family_id: "B44+" } : identity),
    })).toThrow("does not match exact route identity");
    expect(() => parseReleaseStatusRecord({ ...status, discovered_at: "2026-02-30" })).toThrow(
      "expected valid YYYY-MM-DD",
    );
    expect(() => parseReleaseStatusRecord({ ...status, replacement_release_id: "v1-rc23" })).toThrow(
      "cannot replace itself",
    );
  });

  it("fails closed on duplicate ids and mismatched mixed record versions", () => {
    const root = mkdtempSync(join(tmpdir(), "release-status-v2-"));
    const directory = join(root, "data", "exports", "release-status");
    mkdirSync(directory, { recursive: true });
    const status = readReleaseStatus(repoRoot, "v1-rc22");
    writeFileSync(join(directory, "record.json"), JSON.stringify(status));
    writeFileSync(join(directory, "index.json"), JSON.stringify({ schema_version: 2, records: [{ release_id: "v1-rc22", path: "data/exports/release-status/record.json", status: "quarantined", record_schema_version: 2 }] }));
    expect(() => readReleaseStatus(root, "v1-rc22")).toThrow("record schema mismatch");
    writeFileSync(join(directory, "index.json"), JSON.stringify({ schema_version: 2, records: [{ release_id: "v1-rc22", path: "data/exports/release-status/record.json", status: "quarantined", record_schema_version: 1 }, { release_id: "v1-rc22", path: "data/exports/release-status/record.json", status: "quarantined", record_schema_version: 1 }] }));
    expect(() => readReleaseStatus(root, "v1-rc22")).toThrow("expected sorted unique values");
  });

  it("self-decodes deterministic v1/v2 records and mixed indexes", () => {
    const rc22 = readReleaseStatus(repoRoot, "v1-rc22");
    const rc23 = readReleaseStatus(repoRoot, "v1-rc23");
    if (!rc22 || !rc23) throw new Error("expected quarantined release fixtures");
    expect(parseReleaseStatusRecord(JSON.parse(serializeReleaseStatusRecord(rc22)))).toEqual(rc22);
    expect(parseReleaseStatusRecord(JSON.parse(serializeReleaseStatusRecord(rc23)))).toEqual(rc23);
    const index = parseReleaseStatusIndex(JSON.parse(readFileSync(join(repoRoot, "data", "exports", "release-status", "index.json"), "utf8")));
    expect(parseReleaseStatusIndex(JSON.parse(serializeReleaseStatusIndex(index)))).toEqual(index);
  });
});
