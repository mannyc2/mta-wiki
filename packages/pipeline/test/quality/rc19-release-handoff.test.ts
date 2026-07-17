import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeRc19ReconciliationReleaseHandoff,
  type Rc19ReconciliationReleaseHandoffExpectations,
} from "../../../../scripts/write-rc19-reconciliation-release-handoff";

const work = join(tmpdir(), `rc19-release-handoff-test-${process.pid}`);
afterAll(() => rmSync(work, { recursive: true, force: true }));

function sha256(bytes: string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeManifest(path: string, releaseId: string, generatorCommit: string, occurrenceSha: string): string {
  const bytes = `${JSON.stringify({
    release_id: releaseId,
    generator_commit: generatorCommit,
    files: { "operational_occurrences.jsonl": { sha256: occurrenceSha } },
  }, null, 2)}\n`;
  writeFileSync(path, bytes, "utf8");
  return sha256(bytes);
}

function fixture() {
  const root = join(work, `fixture-${Math.random().toString(16).slice(2)}`);
  const rc19Dir = join(root, "v1-rc19");
  const rc20Dir = join(root, "v1-rc20");
  mkdirSync(rc19Dir, { recursive: true });
  mkdirSync(rc20Dir, { recursive: true });
  const rc19ManifestPath = join(rc19Dir, "manifest.json");
  const rc20ManifestPath = join(rc20Dir, "manifest.json");
  const rc19GeneratorCommit = "1".repeat(40);
  const rc20GeneratorCommit = "2".repeat(40);
  const rc19ManifestSha256 = writeManifest(rc19ManifestPath, "v1-rc19", rc19GeneratorCommit, "old-occurrences");
  writeManifest(rc20ManifestPath, "v1-rc20", rc20GeneratorCommit, "new-occurrences");
  const latestPath = join(root, "LATEST");
  writeFileSync(latestPath, "v1-rc5\n", "utf8");
  const expectations: Rc19ReconciliationReleaseHandoffExpectations = {
    rc19ManifestSha256,
    rc19GeneratorCommit,
    rc20ReleaseId: "v1-rc20",
    latest: "v1-rc5",
  };
  return { root, rc19ManifestPath, rc20ManifestPath, rc20GeneratorCommit, latestPath, expectations };
}

describe("rc19 reconciliation post-release handoff", () => {
  it("writes stable non-authorizing handoff content only after validating both manifests and LATEST", () => {
    const first = fixture();
    const second = fixture();
    const firstOutput = join(first.root, "handoff.json");
    const secondOutput = join(second.root, "handoff.json");
    const firstResult = writeRc19ReconciliationReleaseHandoff({
      rc19ManifestPath: first.rc19ManifestPath,
      rc20ManifestPath: first.rc20ManifestPath,
      latestPath: first.latestPath,
      expectedRc20GeneratorCommit: first.rc20GeneratorCommit,
      outputPath: firstOutput,
    }, first.expectations);
    const secondResult = writeRc19ReconciliationReleaseHandoff({
      rc19ManifestPath: second.rc19ManifestPath,
      rc20ManifestPath: second.rc20ManifestPath,
      latestPath: second.latestPath,
      expectedRc20GeneratorCommit: second.rc20GeneratorCommit,
      outputPath: secondOutput,
    }, second.expectations);

    expect(readFileSync(firstOutput, "utf8")).toBe(readFileSync(secondOutput, "utf8"));
    expect(firstResult.outputSha256).toBe(secondResult.outputSha256);
    const handoff = JSON.parse(readFileSync(firstOutput, "utf8")) as Record<string, any>;
    expect(handoff.before_release.immutable_and_unchanged).toBeTrue();
    expect(handoff.after_release.release_id).toBe("v1-rc20");
    expect(handoff.release_boundary).toEqual({
      deployed: false,
      latest_expected: "v1-rc5",
      latest_mutated: false,
      latest_observed: "v1-rc5",
      promoted: false,
      published: false,
      pushed: false,
    });
    expect(handoff.source_changes.scope_repaired_candidate_count).toBe(2);
    expect(handoff.source_changes.fully_source_fixed_candidate_count).toBe(0);
    expect(handoff.source_changes.completion_phase_date).toBe("2023-10-31");
    expect(handoff.source_changes.first_operational_onset).toBeNull();
    expect(handoff.anticipated_tracker_effect.status).toBe("inference_pending_pinned_tracker_replay");

    expect(writeRc19ReconciliationReleaseHandoff({
      rc19ManifestPath: first.rc19ManifestPath,
      rc20ManifestPath: first.rc20ManifestPath,
      latestPath: first.latestPath,
      expectedRc20GeneratorCommit: first.rc20GeneratorCommit,
      outputPath: firstOutput,
    }, first.expectations).outputSha256).toBe(firstResult.outputSha256);
  });

  it("fails closed on changed rc19, rc20 generator, or LATEST", () => {
    const changedRc19 = fixture();
    writeFileSync(changedRc19.rc19ManifestPath, `${readFileSync(changedRc19.rc19ManifestPath, "utf8")} `, "utf8");
    expect(() => writeRc19ReconciliationReleaseHandoff({
      rc19ManifestPath: changedRc19.rc19ManifestPath,
      rc20ManifestPath: changedRc19.rc20ManifestPath,
      latestPath: changedRc19.latestPath,
      expectedRc20GeneratorCommit: changedRc19.rc20GeneratorCommit,
      outputPath: join(changedRc19.root, "handoff.json"),
    }, changedRc19.expectations)).toThrow("rc19 manifest SHA-256 mismatch");

    const wrongGenerator = fixture();
    expect(() => writeRc19ReconciliationReleaseHandoff({
      rc19ManifestPath: wrongGenerator.rc19ManifestPath,
      rc20ManifestPath: wrongGenerator.rc20ManifestPath,
      latestPath: wrongGenerator.latestPath,
      expectedRc20GeneratorCommit: "3".repeat(40),
      outputPath: join(wrongGenerator.root, "handoff.json"),
    }, wrongGenerator.expectations)).toThrow("rc20 generator commit mismatch");

    const changedLatest = fixture();
    writeFileSync(changedLatest.latestPath, "v1-rc20\n", "utf8");
    expect(() => writeRc19ReconciliationReleaseHandoff({
      rc19ManifestPath: changedLatest.rc19ManifestPath,
      rc20ManifestPath: changedLatest.rc20ManifestPath,
      latestPath: changedLatest.latestPath,
      expectedRc20GeneratorCommit: changedLatest.rc20GeneratorCommit,
      outputPath: join(changedLatest.root, "handoff.json"),
    }, changedLatest.expectations)).toThrow("LATEST changed");
  });
});
