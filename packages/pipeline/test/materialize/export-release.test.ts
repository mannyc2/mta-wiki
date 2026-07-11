import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import {
  exportRelease,
  parseReleaseManifest,
  type ReleaseExportOptions,
  type ReleaseManifest,
} from "@mta-wiki/pipeline/materialize/export-release";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";

const work = mkdtempSync(join(tmpdir(), "export-release-test-"));
const emptyReviewDecisionDir = join(work, "empty-operational-anchor-review-decisions");
mkdirSync(emptyReviewDecisionDir, { recursive: true });
afterAll(() => rmSync(work, { recursive: true, force: true }));

function exportTestRelease(releaseId: string, opts: ReleaseExportOptions) {
  return exportRelease(releaseId, {
    ...opts,
    operationalAnchorReviewDecisionDir: emptyReviewDecisionDir,
  });
}

function record(id: string, kind: MtaCanonicalRecord["record_kind"]): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: "source_test",
    local_observation_id: id,
    display_name: id,
    payload: kind === "route" ? { route_id: id.replace(/^route_/u, "").toUpperCase() } : {},
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-03T00:00:00.000Z",
  };
}

function releaseDir(root: string, id: string) {
  return join(root, "data", "exports", "releases", id);
}

function readManifest(root: string, id: string): ReleaseManifest {
  return JSON.parse(readFileSync(join(releaseDir(root, id), "manifest.json"), "utf8")) as ReleaseManifest;
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fileTree(root: string) {
  const files: Record<string, string> = {};
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else files[relative(root, path)] = readFileSync(path, "utf8");
    }
  };
  visit(root);
  return files;
}

describe("exportRelease", () => {
  it("writes plural filenames, manifest counts/hashes, and LATEST", () => {
    const root = join(work, "happy");
    const result = exportTestRelease("v-test", {
      rootDir: root,
      records: [record("route_b1", "route"), record("source_a", "source")],
    });
    expect(result.recordCount).toBe(2);
    expect(result.files).toBe(17);

    const dir = releaseDir(root, "v-test");
    expect(readFileSync(join(dir, "routes.jsonl"), "utf8")).toBe(`${stableJson(record("route_b1", "route") as unknown as JsonValue)}\n`);
    expect(readFileSync(join(dir, "sources.jsonl"), "utf8")).toBe(`${stableJson(record("source_a", "source") as unknown as JsonValue)}\n`);
    expect(readFileSync(join(root, "data", "exports", "releases", "LATEST"), "utf8")).toBe("v-test\n");

    const manifest = readManifest(root, "v-test");
    expect(manifest.manifest_version).toBe(2);
    expect(manifest.release_id).toBe("v-test");
    expect(manifest.contract_versions.operational_anchors).toBe(1);
    expect(manifest.contract_versions.operational_anchor_review_decisions).toBe(1);
    expect(manifest.record_counts.route).toBe(1);
    expect(manifest.record_counts.source).toBe(1);
    expect(manifest.record_counts.table).toBe(0);
    expect(manifest.pointers).toEqual({
      operational_anchors: "operational_anchors.jsonl",
      operational_anchor_summary: "operational_anchors_summary.json",
      operational_anchor_review_decisions: "operational_anchor_review_decisions.json",
      route_anchors: "route_anchors.jsonl",
      taxonomy: "taxonomy.json",
      quality_report: null,
    });
    expect(manifest.files["routes.jsonl"]?.sha256).toBe(sha256(join(dir, "routes.jsonl")));
    expect(manifest.files["sources.jsonl"]?.bytes).toBe(Buffer.byteLength(readFileSync(join(dir, "sources.jsonl"))));
    expect(manifest.files["tables.jsonl"]?.bytes).toBe(0);
    expect(manifest.files["route_anchors.jsonl"]?.bytes).toBe(0);
    expect(manifest.files["operational_anchors.jsonl"]?.bytes).toBe(0);
    expect(manifest.files["operational_anchors_summary.json"]?.bytes).toBeGreaterThan(0);
    expect(manifest.files["operational_anchor_review_decisions.json"]?.sha256).toBe(
      sha256(join(dir, "operational_anchor_review_decisions.json")),
    );
    expect(JSON.parse(readFileSync(join(dir, "operational_anchor_review_decisions.json"), "utf8"))).toEqual({
      snapshot_version: 1,
      decision_schema_version: 1,
      decision_count: 0,
      decisions: [],
    });
    expect(manifest.files["taxonomy.json"]?.bytes).toBeGreaterThan(0);
    expect(manifest.files["manifest.json"]).toBeUndefined();
  });

  it("normalizes legacy manifests while keeping operational anchors unavailable", () => {
    const manifest = parseReleaseManifest({
      release_id: "v1-legacy",
      generator_commit: "abc123",
      record_counts: { event: 1 },
      files: { "events.jsonl": { bytes: 10, sha256: "a".repeat(64) } },
      pointers: { route_anchors: null, taxonomy: null, quality_report: null },
    });

    expect(manifest.manifest_version).toBe(1);
    expect(manifest.contract_versions).toEqual({});
    expect(manifest.pointers.operational_anchors).toBeNull();
    expect(manifest.pointers.operational_anchor_review_decisions).toBeNull();
  });

  it("rejects malformed or unsupported release manifests", () => {
    expect(() =>
      parseReleaseManifest({
        manifest_version: 2,
        release_id: "v-bad",
        generator_commit: "abc123",
        contract_versions: { operational_anchors: 1, operational_anchor_review_decisions: 1 },
        record_counts: {},
        files: { "operational_anchors.jsonl": { bytes: 0, sha256: "not-a-digest" } },
        pointers: {
          operational_anchors: "operational_anchors.jsonl",
          operational_anchor_summary: "operational_anchors_summary.json",
          operational_anchor_review_decisions: "operational_anchor_review_decisions.json",
          route_anchors: null,
          taxonomy: null,
          quality_report: null,
        },
      }),
    ).toThrow("expected SHA-256 hex");

    const manifest = {
      manifest_version: 2,
      release_id: "v-addressed",
      generator_commit: "abc123",
      contract_versions: { operational_anchors: 1, operational_anchor_review_decisions: 1 },
      record_counts: {},
      files: { "operational_anchor_review_decisions.json": { bytes: 0, sha256: "a".repeat(64) } },
      pointers: {
        operational_anchors: null,
        operational_anchor_summary: null,
        operational_anchor_review_decisions: "missing-review-snapshot.json",
        route_anchors: null,
        taxonomy: null,
        quality_report: null,
      },
    };
    expect(() => parseReleaseManifest(manifest)).toThrow("no file metadata for missing-review-snapshot.json");

    const missingPointer = structuredClone(manifest);
    delete (missingPointer.pointers as Partial<typeof missingPointer.pointers>).operational_anchor_review_decisions;
    expect(() => parseReleaseManifest(missingPointer)).toThrow("pointers.operational_anchor_review_decisions");
    expect(() => parseReleaseManifest({ manifest_version: 3 })).toThrow("expected 1 or 2");
  });

  it("exports byte-identically for the same id and records", () => {
    const records = [record("route_b2", "route"), record("route_b1", "route"), record("event_a", "event")];
    const rootA = join(work, "det-a");
    const rootB = join(work, "det-b");
    exportTestRelease("same-id", { rootDir: rootA, records });
    exportTestRelease("same-id", { rootDir: rootB, records: [...records].reverse() });
    expect(fileTree(releaseDir(rootA, "same-id"))).toEqual(fileTree(releaseDir(rootB, "same-id")));
  });

  it("keeps releases immutable unless force is set", () => {
    const root = join(work, "immutable");
    exportTestRelease("once", { rootDir: root, records: [record("route_b1", "route")] });
    expect(() => exportTestRelease("once", { rootDir: root, records: [record("route_b2", "route")] })).toThrow(/already exists/u);
    exportTestRelease("once", { rootDir: root, force: true, records: [record("route_b2", "route")] });
    expect(readFileSync(join(releaseDir(root, "once"), "routes.jsonl"), "utf8")).toContain("route_b2");
  });

  it("can fill the quality report manifest pointer", () => {
    const root = join(work, "quality-pointer");
    exportTestRelease("with-quality", {
      rootDir: root,
      records: [record("route_b1", "route")],
      qualityReport: "data/quality/with-quality/report.md",
    });

    const manifest = readManifest(root, "with-quality");
    expect(manifest.pointers.quality_report).toBe("data/quality/with-quality/report.md");
  });

  it("throws on unknown record kinds before writing a manifest", () => {
    const root = join(work, "unknown-kind");
    const bad = record("mystery_a", "route");
    bad.record_kind = "mystery" as MtaCanonicalRecord["record_kind"];
    expect(() => exportTestRelease("bad", { rootDir: root, records: [bad] })).toThrow(/No canonical release filename/u);
    expect(existsSync(join(releaseDir(root, "bad"), "manifest.json"))).toBe(false);
  });

  it("fails before creating release output when the review decision directory is missing", () => {
    const root = join(work, "missing-review-decisions");
    expect(() => exportRelease("missing-review", { rootDir: root, records: [record("route_b1", "route")] })).toThrow(
      "Operational-anchor review decision directory is required for release export",
    );
    expect(existsSync(releaseDir(root, "missing-review"))).toBe(false);
  });
});
