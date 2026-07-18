import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MtaCanonicalRecord, MtaValidationIssue } from "@mta-wiki/db/types";
import {
  validateReleasePointer,
  validateSourceRegistryForRecords,
} from "@mta-wiki/pipeline/validate";

function record(
  recordId: string,
  recordKind: MtaCanonicalRecord["record_kind"],
  sourceId: string,
  sourceIds: string[] = [sourceId],
): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: recordKind,
    source_id: sourceId,
    source_ids: sourceIds,
    local_observation_id: `local_${recordId}`,
    display_name: recordId,
    payload: {},
    evidence_refs: [],
    submission_ids: [`submission_${recordId}`],
    truth_status: "asserted",
    review_state: "unreviewed",
    generated_at: "2026-07-18T00:00:00.000Z",
  };
}

function validateSources(records: MtaCanonicalRecord[]): MtaValidationIssue[] {
  const issues: MtaValidationIssue[] = [];
  validateSourceRegistryForRecords(records, issues);
  return issues;
}

describe("source registry validation lanes", () => {
  const sourceA = () => record("source_source-a", "source", "source_a");

  it("accepts a one-source-one-row registry with resolved references", () => {
    expect(validateSources([
      sourceA(),
      record("event_a", "event", "source_a"),
    ])).toEqual([]);
  });

  it("reports one duplicate_source_id issue per duplicated source id", () => {
    const issues = validateSources([
      sourceA(),
      record("source_second-observation", "source", "source_a"),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "duplicate_source_id",
      path: "data/canonical/sources.jsonl",
    });
    expect(issues[0]!.message).toContain("2 source records");
  });

  it("reports source_record_collision_suffix only for suffixed source records", () => {
    const issues = validateSources([
      record("source_source-a_2", "source", "source_a"),
      record("event_a_2", "event", "source_a"),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "source_record_collision_suffix",
      recordId: "source_source-a_2",
    });
  });

  it("aggregates unresolved_source_reference by missing source id", () => {
    const issues = validateSources([
      sourceA(),
      record("event_a", "event", "source_missing", ["source_missing"]),
      record("project_a", "project", "source_a", ["source_a", "source_missing"]),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "unresolved_source_reference",
      path: "data/canonical/sources.jsonl",
    });
    expect(issues[0]!.message).toContain("2 citing records");
  });
});

describe("release pointer validation lane", () => {
  it("allows an absent pointer and rejects targets without an addressed manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "mta-release-pointer-"));
    try {
      const issues: MtaValidationIssue[] = [];
      validateReleasePointer(issues, root);
      expect(issues).toEqual([]);

      const releasesDir = join(root, "data", "exports", "releases");
      mkdirSync(releasesDir, { recursive: true });
      writeFileSync(join(releasesDir, "LATEST"), "missing-release\n", "utf8");
      validateReleasePointer(issues, root);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.code).toBe("dangling_release_pointer");

      issues.length = 0;
      mkdirSync(join(releasesDir, "missing-release"), { recursive: true });
      validateReleasePointer(issues, root);
      expect(issues).toHaveLength(1);

      issues.length = 0;
      writeFileSync(join(releasesDir, "missing-release", "manifest.json"), "{}\n", "utf8");
      validateReleasePointer(issues, root);
      expect(issues).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
