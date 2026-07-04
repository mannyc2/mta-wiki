import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "bun:test";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import { buildAnchorIndex, sameSourceFactKey, tokenSetHash } from "@mta-wiki/pipeline/quality/fact-keys";
import { buildFactDedupScout, writeFactDedupScout } from "@mta-wiki/pipeline/quality/fact-dedup";

const work = join(tmpdir(), `mta-fact-dedup-test-${process.pid}`);
afterAll(() => rmSync(work, { recursive: true, force: true }));

function record(id: string, kind: MtaCanonicalRecord["record_kind"], payload: MtaCanonicalRecord["payload"] = {}, sourceId = "source_a"): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: sourceId,
    local_observation_id: id,
    display_name: id,
    payload,
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-04T00:00:00.000Z",
  };
}

function relation(id: string, subjectId: string, objectId: string, relationKind = "has_timeline_event", sourceId = "source_a"): MtaCanonicalRecord {
  return record(
    id,
    "relation",
    {
      relation_kind: relationKind,
      relation_family: relationKind === "has_timeline_event" ? "timeline_context" : "other",
      subject_id: subjectId,
      object_id: objectId,
      as_of_date: "2026",
    },
    sourceId,
  );
}

describe("fact dedup scout", () => {
  it("uses word-order-insensitive token-set hashes", () => {
    expect(tokenSetHash("ACE Program Expansion, approved by NYS Legislature")).toBe(tokenSetHash("NYS legislature approved ACE expansion program"));
    expect(tokenSetHash("ACE 2023 legislature expansion")).not.toBe(tokenSetHash("ABLE ACE program expansion approved legislature"));
  });

  it("builds same-source relation keys from relation identity fields", () => {
    const first = relation("relation_a", "route_b1", "corridor_a", "serves");
    const second = relation("relation_b", "route_b1", "corridor_a", "serves");
    const anchors = buildAnchorIndex([first, second]);
    expect(sameSourceFactKey(first, anchors)?.parts).toEqual(sameSourceFactKey(second, anchors)?.parts);
  });

  it("reports same-source and cross-source exact duplicate groups", () => {
    const records = [
      relation("relation_a", "route_b1", "corridor_a", "serves", "source_a"),
      relation("relation_b", "route_b1", "corridor_a", "serves", "source_a"),
      relation("relation_c", "route_b1", "corridor_a", "serves", "source_b"),
    ];
    const report = buildFactDedupScout(records, { runId: "unit", now: () => new Date("2026-07-04T00:00:00.000Z") });
    expect(report.kind_summaries.relation.same_source_true_dup_groups).toBe(1);
    expect(report.kind_summaries.relation.same_source_affected_records).toBe(2);
    expect(report.kind_summaries.relation.cross_source_exact_groups).toBe(1);
    expect(report.kind_summaries.relation.cross_source_affected_records).toBe(3);
  });

  it("surfaces the ACE canary as an event near-miss, not an exact-key group", () => {
    const left = record(
      "event_able-ace-expansion-2023",
      "event",
      { event_family: "legislation", date_normalized: "2023", description: "ABLE/ACE Program Expansion Approved by NYS Legislature" },
      "meeting_doc_201621",
    );
    left.display_name = "ABLE/ACE Program Expansion Approved by NYS Legislature";
    const right = record(
      "event_ace-2023-legislature-expansion",
      "event",
      { event_family: "legislation", date_normalized: "2023", description: "2023 NYS Legislature expands ACE" },
      "mta_automated_camera_enforcement",
    );
    right.display_name = "2023 NYS Legislature expands ACE";
    const records = [
      left,
      right,
      relation("relation_left", "project_ace-automated-camera-enforcement", left.record_id, "has_timeline_event", left.source_id),
      relation("relation_right", "project_ace-automated-camera-enforcement", right.record_id, "has_timeline_event", right.source_id),
    ];

    const report = buildFactDedupScout(records, { runId: "unit", now: () => new Date("2026-07-04T00:00:00.000Z") });
    expect(report.ace_pair.present_in_event_near_miss_tier).toBe(true);
    expect(report.kind_summaries.event.near_miss_candidate_pairs).toBe(1);
    expect(report.kind_summaries.event.cross_source_exact_groups).toBe(0);
  });

  it("writes the scout report under data/fact-groups", () => {
    const rootDir = join(work, "write");
    mkdirSync(rootDir, { recursive: true });
    const result = writeFactDedupScout({
      rootDir,
      runId: "unit",
      records: [relation("relation_a", "route_b1", "corridor_a", "serves")],
      now: () => new Date("2026-07-04T00:00:00.000Z"),
    });
    expect(result.path).toBe(join(rootDir, "data", "fact-groups", "scout-unit.json"));
    expect(existsSync(result.path)).toBe(true);
    expect(JSON.parse(readFileSync(result.path, "utf8")).report_id).toBe("fact-dedup-scout-unit");
  });
});
