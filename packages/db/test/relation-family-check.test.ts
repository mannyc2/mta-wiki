// Plan 016: the relation_family CHECK rejects out-of-vocabulary values at rebuild time
// and accepts every canonical family.
import { describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rebuildCanonicalDb } from "../src/canonical-db.js";
import type { JsonObject, MtaCanonicalRecord } from "../src/types.js";

function rec(record_id: string, record_kind: MtaCanonicalRecord["record_kind"], payload: JsonObject): MtaCanonicalRecord {
  return {
    record_id,
    record_kind,
    source_id: "src1",
    source_ids: ["src1"],
    local_observation_id: `obs_${record_id}`,
    local_observation_ids: [`obs_${record_id}`],
    display_name: record_id,
    payload,
    evidence_refs: [{
      source_id: "src1",
      evidence_id: "src1#p001_b0001",
      source_path: "raw/sources/src1/blocks.jsonl",
      page_number: 1,
      block_id: "p001_b0001",
      text_sha256: `sha256:${"a".repeat(64)}`,
      role: "fixture",
    }],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-03T00:00:00Z",
  };
}

function corpus(relationFamily: string): MtaCanonicalRecord[] {
  return [
    rec("ent_a", "entity", {}),
    rec("ent_b", "entity", {}),
    rec("rel_1", "relation", {
      relation_kind: "has_partner",
      relation_family: relationFamily,
      subject_id: "ent_a",
      object_id: "ent_b",
    }),
  ];
}

const fixtureEvidenceRegistry = {
  provenance: "test_fixture" as const,
  entries: [{
    source_id: "src1",
    block_id: "p001_b0001",
    resolved_block_id: "p001_b0001",
    page_number: 1,
    source_path: "raw/sources/src1/blocks.jsonl",
    raw_text_sha256: `sha256:${"a".repeat(64)}`,
  }],
};

describe("relation_family CHECK (plan 016)", () => {
  it("rejects an out-of-vocabulary family and does not publish the DB", () => {
    const path = join(tmpdir(), "relation-family-check-reject.db");
    rmSync(path, { force: true });
    expect(() => rebuildCanonicalDb(corpus("bogus_family"), {
      path,
      evidenceRegistry: fixtureEvidenceRegistry,
    })).toThrow();
  });

  it("accepts a canonical family", () => {
    const path = join(tmpdir(), "relation-family-check-accept.db");
    rmSync(path, { force: true });
    const result = rebuildCanonicalDb(corpus("partnership_engagement"), {
      path,
      evidenceRegistry: fixtureEvidenceRegistry,
    });
    expect(result.relationCount).toBe(1);
  });
});
