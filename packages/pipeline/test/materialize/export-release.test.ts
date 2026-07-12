import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  it("writes plural filenames and manifest counts/hashes without promoting by default", () => {
    const root = join(work, "happy");
    const result = exportTestRelease("v-test", {
      rootDir: root,
      records: [record("route_b1", "route"), record("source_a", "source")],
    });
    expect(result.recordCount).toBe(2);
    expect(result.files).toBe(20);

    const dir = releaseDir(root, "v-test");
    expect(readFileSync(join(dir, "routes.jsonl"), "utf8")).toBe(`${stableJson(record("route_b1", "route") as unknown as JsonValue)}\n`);
    expect(readFileSync(join(dir, "sources.jsonl"), "utf8")).toBe(`${stableJson(record("source_a", "source") as unknown as JsonValue)}\n`);
    expect(existsSync(join(root, "data", "exports", "releases", "LATEST"))).toBe(false);

    const manifest = readManifest(root, "v-test");
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.release_id).toBe("v-test");
    expect(manifest.contract_versions.operational_anchors).toBe(1);
    expect(manifest.contract_versions.operational_anchor_review_decisions).toBe(1);
    expect(manifest.contract_versions.operational_occurrences).toBe(1);
    expect(manifest.contract_versions.operational_occurrence_review_decisions).toBe(1);
    expect(manifest.record_counts.route).toBe(1);
    expect(manifest.record_counts.source).toBe(1);
    expect(manifest.record_counts.table).toBe(0);
    expect(manifest.pointers).toEqual({
      operational_anchors: "operational_anchors.jsonl",
      operational_anchor_summary: "operational_anchors_summary.json",
      operational_anchor_review_decisions: "operational_anchor_review_decisions.json",
      operational_occurrences: "operational_occurrences.jsonl",
      operational_occurrence_summary: "operational_occurrences_summary.json",
      operational_occurrence_review_decisions: "operational_occurrence_review_decisions.json",
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
    expect(manifest.files["operational_occurrences.jsonl"]?.bytes).toBe(0);
    expect(manifest.files["operational_occurrences_summary.json"]?.sha256).toBe(
      sha256(join(dir, "operational_occurrences_summary.json")),
    );
    expect(manifest.files["operational_occurrence_review_decisions.json"]?.sha256).toBe(
      sha256(join(dir, "operational_occurrence_review_decisions.json")),
    );
    expect(JSON.parse(readFileSync(join(dir, "operational_anchor_review_decisions.json"), "utf8"))).toEqual({
      snapshot_version: 1,
      decision_schema_version: 1,
      decision_count: 0,
      decisions: [],
    });
    expect(JSON.parse(readFileSync(join(dir, "operational_occurrences_summary.json"), "utf8"))).toEqual({
      schema_version: 1,
      occurrence_count: 0,
      study_projection_eligible_count: 0,
      atomic_count: 0,
      bundle_count: 0,
      multi_route_count: 0,
      candidate_projection_count: 0,
      counts_by_exclusion_reason: {},
    });
    expect(JSON.parse(readFileSync(join(dir, "operational_occurrence_review_decisions.json"), "utf8"))).toEqual({
      snapshot_version: 1,
      decision_schema_version: 1,
      decision_count: 0,
      decisions: [],
    });
    expect(() => parseReleaseManifest(manifest)).not.toThrow();
    expect(manifest.files["taxonomy.json"]?.bytes).toBeGreaterThan(0);
    expect(manifest.files["manifest.json"]).toBeUndefined();
  });

  it("leaves an existing public pointer untouched unless promotion is explicit", () => {
    const root = join(work, "promotion");
    const releases = join(root, "data", "exports", "releases");
    const latest = join(releases, "LATEST");
    mkdirSync(releases, { recursive: true });
    writeFileSync(latest, "v-public\n", "utf8");

    exportTestRelease("v-draft", { rootDir: root, records: [] });
    expect(readFileSync(latest, "utf8")).toBe("v-public\n");

    exportTestRelease("v-promoted", { rootDir: root, records: [], setLatest: true });
    expect(readFileSync(latest, "utf8")).toBe("v-promoted\n");
  });

  it("does not promote a release whose export fails", () => {
    const root = join(work, "failed-promotion");
    const releases = join(root, "data", "exports", "releases");
    const latest = join(releases, "LATEST");
    const badReviewDecisionDir = join(root, "bad-review-decisions");
    mkdirSync(releases, { recursive: true });
    mkdirSync(badReviewDecisionDir, { recursive: true });
    writeFileSync(latest, "v-public\n", "utf8");
    writeFileSync(join(badReviewDecisionDir, "invalid.json"), "{\n", "utf8");

    expect(() =>
      exportRelease("v-broken", {
        rootDir: root,
        records: [],
        operationalAnchorReviewDecisionDir: badReviewDecisionDir,
        setLatest: true,
      }),
    ).toThrow();
    expect(readFileSync(latest, "utf8")).toBe("v-public\n");
    expect(existsSync(releaseDir(root, "v-broken"))).toBe(false);
    expect(readdirSync(releases).some((name) => name.startsWith(".v-broken.tmp-"))).toBe(false);
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
    expect(manifest.pointers.operational_occurrences).toBeNull();
    expect(manifest.pointers.operational_occurrence_review_decisions).toBeNull();
  });

  it("parses a strict legacy manifest v2 without occurrence resources", () => {
    const manifest = parseReleaseManifest({
      manifest_version: 2,
      release_id: "v2-legacy",
      generator_commit: "abc123",
      contract_versions: { operational_anchors: 1, operational_anchor_review_decisions: 1 },
      record_counts: {},
      files: { "operational_anchor_review_decisions.json": { bytes: 10, sha256: "a".repeat(64) } },
      pointers: {
        operational_anchors: "operational_anchors.jsonl",
        operational_anchor_summary: "operational_anchors_summary.json",
        operational_anchor_review_decisions: "operational_anchor_review_decisions.json",
        route_anchors: null,
        taxonomy: null,
        quality_report: null,
      },
    });
    expect(manifest.manifest_version).toBe(2);
    expect(manifest.pointers.operational_occurrences).toBeNull();
    expect(manifest.contract_versions.operational_occurrences).toBeUndefined();
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
    expect(() => parseReleaseManifest({ manifest_version: 4 })).toThrow("expected 1, 2, or 3");
  });

  it("requires all manifest-v3 occurrence pointers to be addressed", () => {
    const root = join(work, "v3-addressed");
    exportTestRelease("v3-addressed", { rootDir: root, records: [] });
    const manifest = readManifest(root, "v3-addressed");

    const missingPointer = structuredClone(manifest);
    delete (missingPointer.pointers as Partial<typeof missingPointer.pointers>).operational_occurrence_summary;
    expect(() => parseReleaseManifest(missingPointer)).toThrow("pointers.operational_occurrence_summary");

    const danglingPointer = structuredClone(manifest);
    danglingPointer.pointers.operational_occurrences = "missing-occurrences.jsonl";
    expect(() => parseReleaseManifest(danglingPointer)).toThrow("no file metadata for missing-occurrences.jsonl");

    const missingMetadata = structuredClone(manifest);
    delete missingMetadata.files["operational_occurrence_review_decisions.json"];
    expect(() => parseReleaseManifest(missingMetadata)).toThrow(
      "no file metadata for operational_occurrence_review_decisions.json",
    );

    const nullLegacyRows = structuredClone(manifest);
    nullLegacyRows.pointers.operational_anchors = null;
    expect(() => parseReleaseManifest(nullLegacyRows)).toThrow("pointers.operational_anchors");

    const nullLegacySummary = structuredClone(manifest);
    nullLegacySummary.pointers.operational_anchor_summary = null;
    expect(() => parseReleaseManifest(nullLegacySummary)).toThrow("pointers.operational_anchor_summary");

    const missingLegacyMetadata = structuredClone(manifest);
    delete missingLegacyMetadata.files["operational_anchors_summary.json"];
    expect(() => parseReleaseManifest(missingLegacyMetadata)).toThrow(
      "no file metadata for operational_anchors_summary.json",
    );
  });

  it("rejects unsafe manifest file keys and pointer paths", () => {
    const root = join(work, "unsafe-manifest-paths");
    exportTestRelease("safe", { rootDir: root, records: [] });
    const manifest = readManifest(root, "safe");

    for (const unsafe of ["../outside.json", "/absolute.json", "C:\\outside.json", "C:outside.json", "nested//empty.json", "./dot.json"]) {
      const badKey = structuredClone(manifest);
      badKey.files[unsafe] = { bytes: 0, sha256: "a".repeat(64) };
      expect(() => parseReleaseManifest(badKey)).toThrow("safe release-relative path");

      const badPointer = structuredClone(manifest);
      badPointer.pointers.operational_occurrences = unsafe;
      expect(() => parseReleaseManifest(badPointer)).toThrow("safe release-relative path");
    }
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

  it("rejects unsafe release ids before any join, removal, or write", () => {
    const root = join(work, "unsafe-release-id");
    const releases = join(root, "data", "exports", "releases");
    const victim = join(root, "data", "exports", "victim");
    mkdirSync(victim, { recursive: true });
    writeFileSync(join(victim, "marker"), "preserve\n", "utf8");

    for (const releaseId of ["", ".", "..", "../victim", "nested/release", "nested\\release", "/tmp/release", " release "]) {
      expect(() => exportTestRelease(releaseId, { rootDir: root, force: true, records: [] })).toThrow(
        "safe single path segment",
      );
    }
    expect(readFileSync(join(victim, "marker"), "utf8")).toBe("preserve\n");
    expect(existsSync(releases)).toBe(false);
  });

  it("keeps a prior cut byte-identical when a forced replacement fails after writing its temp tree", () => {
    const root = join(work, "atomic-force-failure");
    exportTestRelease("stable", { rootDir: root, records: [record("route_b1", "route")] });
    const before = fileTree(releaseDir(root, "stable"));
    const badReviewDecisionDir = join(root, "bad-force-review");
    mkdirSync(badReviewDecisionDir, { recursive: true });
    writeFileSync(join(badReviewDecisionDir, "invalid.json"), "{\n", "utf8");

    expect(() =>
      exportRelease("stable", {
        rootDir: root,
        force: true,
        records: [record("route_b2", "route")],
        operationalAnchorReviewDecisionDir: badReviewDecisionDir,
      }),
    ).toThrow("invalid JSON");
    expect(fileTree(releaseDir(root, "stable"))).toEqual(before);
    expect(
      readdirSync(join(root, "data", "exports", "releases")).some(
        (name) => name.startsWith(".stable.tmp-") || name.includes(".previous-"),
      ),
    ).toBe(false);
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
