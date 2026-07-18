import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportRelease } from "@mta-wiki/pipeline/materialize/export-release";
import { RELEASE_CONTRACT_REGISTRY, verifyReleaseDirectory } from "@mta-wiki/pipeline/materialize/release-verifier";

const root = mkdtempSync(join(tmpdir(), "release-verifier-"));
const decisions = join(root, "decisions");
const release = (id: string) => join(root, "data", "exports", "releases", id);
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
beforeAll(() => { mkdirSync(decisions, { recursive: true }); exportRelease("baseline", { rootDir: root, records: [], gtfsRoutes: [], routeAnchorOverrides: {}, reviewedNonGtfsRouteDispositions: {}, operationalAnchorReviewDecisionDir: decisions, operationalOccurrenceReviewDecisionDir: decisions, operationalOccurrenceIdentityRegistry: [], relationshipIntegrityBundleDescriptor: null }); });
afterAll(() => rmSync(root, { recursive: true, force: true }));
function clone(id: string): string { const path = release(id); cpSync(release("baseline"), path, { recursive: true }); const manifestPath = join(path, "manifest.json"); const manifest = JSON.parse(readFileSync(manifestPath, "utf8")); manifest.release_id = id; writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`); return path; }
function editManifest(path: string, edit: (manifest: any) => void): void { const file = join(path, "manifest.json"); const manifest = JSON.parse(readFileSync(file, "utf8")); edit(manifest); writeFileSync(file, `${JSON.stringify(manifest)}\n`); }
function repin(path: string, name: string): void { editManifest(path, (manifest) => { const bytes = readFileSync(join(path, name)); manifest.files[name] = { bytes: bytes.length, sha256: digest(bytes) }; }); }
function legacyClone(id: string): string { const source = join(process.cwd(), "data/exports/releases/v1-rc19"); const path = release(id); mkdirSync(path, { recursive: true }); const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8")); for (const name of Object.keys(manifest.files)) cpSync(join(source, name), join(path, name), { recursive: true }); manifest.release_id = id; writeFileSync(join(path, "manifest.json"), `${JSON.stringify(manifest)}\n`); return path; }

describe("release directory verifier tamper matrix", () => {
  it("accepts a valid current manifest-v3 occurrence-v2 release", () => { expect(verifyReleaseDirectory(release("baseline")).manifest_version).toBe(3); });
  it("rejects wrong bytes and SHA-256", () => { const path = clone("wrong-hash"); writeFileSync(join(path, "routes.jsonl"), "{}\n"); expect(() => verifyReleaseDirectory(path)).toThrow(/bytes mismatch|SHA-256 mismatch/u); });
  it("rejects a canonical row-count mismatch even when bytes are repinned", () => { const path = clone("wrong-count"); editManifest(path, (manifest) => { manifest.record_counts.route = 1; }); expect(() => verifyReleaseDirectory(path)).toThrow("row-count mismatch"); });
  it("rejects wrong declared versions and dangling pointers", () => { const version = clone("wrong-version"); editManifest(version, (manifest) => { manifest.contract_versions.operational_occurrences = 99; }); expect(() => verifyReleaseDirectory(version)).toThrow("contract_versions.operational_occurrences"); const pointer = clone("dangling-pointer"); editManifest(pointer, (manifest) => { manifest.pointers.operational_occurrences = "missing.jsonl"; }); expect(() => verifyReleaseDirectory(pointer)).toThrow("no file metadata"); });
  it("strict-decodes addressed payload types after valid repinning", () => { const path = clone("wrong-type"); writeFileSync(join(path, "operational_anchors.jsonl"), "{}\n"); repin(path, "operational_anchors.jsonl"); expect(() => verifyReleaseDirectory(path)).toThrow("keys must be exactly"); });
  it("binds raw occurrence bytes to their declared version", () => { const line = readFileSync(join(process.cwd(), "data/exports/releases/v1-rc22/operational_occurrences.jsonl"), "utf8").split("\n")[0]!; expect(() => RELEASE_CONTRACT_REGISTRY.operational_occurrences![1]!(Buffer.from(`${line}\n`), "fixture")).toThrow("declared contract requires 1"); expect(() => RELEASE_CONTRACT_REGISTRY.operational_occurrences![2]!(Buffer.from(`${line}\n`), "fixture")).not.toThrow(); });
  it("retains strict legacy occurrence-v1 decoding", () => { const bytes = readFileSync(join(process.cwd(), "data/exports/releases/v1-rc19/operational_occurrences.jsonl")); expect(() => RELEASE_CONTRACT_REGISTRY.operational_occurrences![1]!(bytes, "legacy-v1")).not.toThrow(); expect(() => RELEASE_CONTRACT_REGISTRY.operational_occurrences![2]!(bytes, "legacy-v1")).toThrow("declared contract requires 2"); });
  it("rejects full-directory cross-artifact identity mismatch after valid repinning", () => { const path = legacyClone("identity-mismatch"); const name = "operational_occurrence_review_decisions.json"; const snapshot = JSON.parse(readFileSync(join(path, name), "utf8")); snapshot.decisions[0].occurrence_id = "occurrence:missing"; rmSync(join(path, name)); writeFileSync(join(path, name), `${JSON.stringify(snapshot)}\n`); repin(path, name); expect(() => verifyReleaseDirectory(path)).toThrow("references missing occurrence"); });
  it("rejects full-directory stale review projection after valid repinning", () => { const path = legacyClone("stale-projection"); const name = "operational_occurrence_review_decisions.json"; const snapshot = JSON.parse(readFileSync(join(path, name), "utf8")); snapshot.decisions[0].founding_key = `${snapshot.decisions[0].founding_key}:stale`; rmSync(join(path, name)); writeFileSync(join(path, name), `${JSON.stringify(snapshot)}\n`); repin(path, name); expect(() => verifyReleaseDirectory(path)).toThrow("is stale for occurrence"); });
  it("rejects manifest-addressed symlinks even when their bytes and hashes match", () => { const path = clone("symlink-escape"); const name = "routes.jsonl"; const outside = join(root, "outside-routes.jsonl"); writeFileSync(outside, readFileSync(join(path, name))); rmSync(join(path, name)); symlinkSync(outside, join(path, name)); expect(() => verifyReleaseDirectory(path)).toThrow("symbolic link"); });
  it("binds quarantine metadata to the actual named release before honoring it", () => {
    const path = clone("forged-status");
    const manifestBytes = readFileSync(join(path, "manifest.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const artifactPath = manifest.pointers.operational_occurrence_review_decisions;
    const statusDir = join(root, "data", "exports", "release-status");
    mkdirSync(statusDir, { recursive: true });
    writeFileSync(join(statusDir, "index.json"), JSON.stringify({ schema_version: 1, records: [{ release_id: "forged-status", path: "data/exports/release-status/forged-status.json", status: "quarantined" }] }));
    writeFileSync(join(statusDir, "forged-status.json"), JSON.stringify({ schema_version: 1, release_id: "forged-status", release_path: "data/exports/releases/forged-status", status: "quarantined", discovered_at: "2026-07-17", reason_code: "contract_payload_strict_decode_failed", reason: "forged", manifest_sha256: "0".repeat(64), failing_artifact: { path: artifactPath, bytes: manifest.files[artifactPath].bytes, sha256: manifest.files[artifactPath].sha256, contract: "operational_occurrence_review_decisions", declared_version: 1, decoder_error: "forged" }, affected_identity: { decision_id: "d", occurrence_id: "o", relation_id: "r" }, replacement_release_id: null }));
    expect(() => verifyReleaseDirectory(path)).toThrow("quarantine manifest SHA-256 mismatch");
  });
});
